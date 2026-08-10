# ---------------------------------------------------------------------------
# Blender geometry -> a plain .js file the game can load from file://.
#
#     blender --background --python tools/blender/export_mesh.py
#     blender --background --python tools/blender/export_mesh.py -- --only=rifleman
#
# WHY THIS EXISTS AND WHY IT IS NOT A .glb. The game's hard constraint is that
# it opens by double-clicking index.html, and over file:// the browser blocks
# `fetch` and `XMLHttpRequest` outright. A .glb cannot be loaded at all. A
# classic <script> tag can, so the geometry ships AS SOURCE: one JS file per
# model, registering itself into `GLModels`. No loader, no parser, no
# dependency, nothing to fetch.
#
# THE MODELS WERE ALWAYS 3D. tools/blender/*.py has been the source of truth
# since the first enemy; the PNG sprite sheets are a *render* of it, taken from
# one fixed camera and quantised to 48 facings. This exports the thing itself
# instead, which is why moving to 3D costs no new art.
#
# WHAT COMES OUT, AND THE ONE COMPRESSION THAT MATTERS. These models are
# flat-shaded and untextured: every triangle has exactly one normal and one
# colour, and there are only a couple of dozen distinct colours in the whole
# game. So positions are stored per VERTEX, while normals and colours are
# stored per TRIANGLE, and colours are an index into a small shared table.
# Storing all three per-vertex the naive way was 3.1x larger for identical
# output. Coordinates are rounded to 0.001 of a Blender unit -- about a
# thirtieth of a pixel on the board, which is far below anything a screen can
# show.
#
# EVALUATED MESHES, NOT RAW ONES. Every box in this project carries a bevel
# modifier, and the bevel is not decoration -- it is what gives a flat-shaded
# cube an edge highlight instead of three dead faces. Exporting `obj.data`
# would throw all of it away, so this reads through the dependency graph.
# ---------------------------------------------------------------------------

import json
import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import bpy
import bmesh
import td_scene as td

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "js", "gl",
                          "models")

# Blender units -> board pixels. DERIVED, not chosen: js/skins/draw-pack.js
# draws a sprite `footprintPx * PX_PER_WORLD * ortho` pixels tall for a tile
# spanning `ortho` Blender units, and the Longshot's footprint is 20 u.l., so
# one Blender unit is `ul(20) * 1.529` pixels. Written here so the 3D board and
# the 2D one agree about how big a person is.
UNITS_TO_PX = 20.0 * 1.529 * 1.04     # ul() is 1.04 px per u.l.

PRECISION = 3


def _round(value):
    return round(value, PRECISION)


def _material_colour(obj, index):
    """The flat base colour of a material slot, as sRGB 0..1.

    Read back off the Principled BSDF rather than from td_scene's PALETTE dict,
    so a material built any other way still exports correctly and there is one
    less thing to keep in step.
    """
    if not obj.data.materials or index >= len(obj.data.materials):
        return (0.8, 0.8, 0.8)
    mat = obj.data.materials[index]
    if not mat or not mat.use_nodes:
        return (0.8, 0.8, 0.8)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        return (0.8, 0.8, 0.8)
    c = bsdf.inputs["Base Color"].default_value

    # Back to sRGB. td_scene.srgb() converts the other way when building the
    # material, and the renderer wants the value the art board specified.
    def to_srgb(v):
        v = max(0.0, min(1.0, v))
        return v * 12.92 if v <= 0.0031308 else 1.055 * (v ** (1 / 2.4)) - 0.055

    emission = 0.0
    if "Emission Strength" in bsdf.inputs:
        emission = bsdf.inputs["Emission Strength"].default_value
    return (to_srgb(c[0]), to_srgb(c[1]), to_srgb(c[2]), emission)


# --- animation ---------------------------------------------------------------
#
# RIGID GROUPS, NOT VERTEX FRAMES. The obvious way to export an animation is a
# copy of the mesh per frame, and for these models it is enormous: the base
# Rifleman is 9224 triangles, so four frames of it is nearly 3 MB of positions
# for a bolt cycle in which the bolt is the only thing that moves.
#
# Every rig in this project animates by keying EMPTIES -- a bolt, a drum, a hip,
# an arm -- and the geometry hanging off each one is rigid. So the geometry ships
# once, in the local space of whichever animated empty owns it, and a frame is
# sixteen numbers per group. Four frames of the Rifleman costs about 700 bytes
# instead of 2.8 MB, and the runtime draws one slice per group.

# The counter-yaw node tower_sniper.py builds its foundations under. Anything
# hanging off one of these is bolted to the MAP, not to the weapon, and must be
# drawn without the aiming yaw -- see js/gl/gl-parts.js.
WORLD_FIXED_GROUP = "world_fixed"


def _is_world_fixed(node):
    """True for `_world_fixed_child` nodes.

    They carry a DRIVER that cancels the aiming parent's yaw, not an action, so
    `_group_root` below walks straight past them -- which is exactly the bug
    this exists to close. The sprite pipeline never noticed because it bakes the
    driver into every rendered row; the 3D build applies yaw at runtime and so
    spun four stone obelisks around the man they are chaining down.
    """
    if node.name.startswith("world_fixed"):
        return True
    data = getattr(node, "animation_data", None)
    return bool(data and getattr(data, "drivers", None) and
                any(d.data_path == "rotation_euler" for d in data.drivers))


def _group_root(obj):
    """The animated ancestor a mesh rides on, or None if it never moves.

    Walks up rather than reading a list of names, so a rig that gains a moving
    part gets it exported without anyone remembering to update a table here.

    A world-fixed ancestor wins over an animated one above it: the point of the
    node is that nothing above it applies.
    """
    node = obj
    while node is not None:
        if _is_world_fixed(node):
            return WORLD_FIXED_GROUP
        data = getattr(node, "animation_data", None)
        if data and data.action:
            return node
        node = node.parent
    return None


def _matrix_list(m):
    # Column-major, the order WebGL's uniformMatrix4fv wants.
    return [round(m[r][c], 5) for c in range(4) for r in range(4)]


def extract(root_name="model", frames=0):
    """Every evaluated mesh in the scene, flattened into one indexed soup."""
    depsgraph = bpy.context.evaluated_depsgraph_get()

    positions = []
    normals = []
    colour_index = []
    palette = []
    palette_lookup = {}

    # Meshes are emitted GROUPED, so each animated part is one contiguous slice
    # the runtime can draw with its own matrix. Group "" is everything that
    # never moves and is drawn with the instance matrix alone.
    if frames:
        bpy.context.scene.frame_set(1)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()

    buckets = {}
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.hide_render or obj.hide_viewport:
            continue
        # The world-fixed test runs whether or not this model animates: a
        # foundation is bolted down on a still model too.
        root = _group_root(obj)
        if root is WORLD_FIXED_GROUP or root == WORLD_FIXED_GROUP:
            name = WORLD_FIXED_GROUP
        elif frames and root is not None:
            name = root.name
        else:
            name = ""
        buckets.setdefault(name, []).append(obj)

    group_names = sorted(buckets.keys())
    group_roots = {}
    groups = []
    ordered = []
    for name in group_names:
        groups.append({"name": name, "first": 0, "count": 0})
        ordered.append(buckets[name])
        # `world_fixed` is not an object and owns no per-frame matrix. Its
        # geometry stays in WORLD space, exactly like the unnamed group, and
        # the runtime draws it with the instance matrix minus the aiming yaw.
        if name and name != WORLD_FIXED_GROUP:
            group_roots[name] = bpy.data.objects[name]

    for gi, objs in enumerate(ordered):
      groups[gi]["first"] = len(colour_index) * 3
      # Geometry is stored in the group root's LOCAL space at frame 1, so the
      # per-frame matrix is the whole of the animation and nothing has to be
      # subtracted at runtime.
      root_name_g = groups[gi]["name"]
      to_local = (group_roots[root_name_g].matrix_world.inverted_safe()
                  if root_name_g in group_roots else None)
      for obj in objs:
        # The shield variants leave their projectors in the scene and merely
        # switch them off for the clean render. Exporting a hidden object would
        # weld a permanently-shielded enemy into the geometry.
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()

        # Triangulate through bmesh: n-gons and quads both appear here (boxes
        # are quads, the frustums are fans) and WebGL only draws triangles.
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.to_mesh(mesh)
        bm.free()

        matrix = evaluated.matrix_world
        if to_local is not None:
            matrix = to_local @ matrix
        # Normals need the inverse transpose, or any non-uniform scale -- which
        # every box in this project has, they are all stretched cubes -- tilts
        # the lighting off the surface it belongs to.
        normal_matrix = matrix.inverted_safe().transposed().to_3x3()

        for poly in mesh.polygons:
            rgba = _material_colour(evaluated, poly.material_index)
            key = tuple(round(v, 4) for v in rgba)
            if key not in palette_lookup:
                palette_lookup[key] = len(palette)
                palette.append([_round(rgba[0]), _round(rgba[1]),
                                _round(rgba[2]), round(rgba[3], 2)])
            index = palette_lookup[key]

            n = normal_matrix @ poly.normal
            length = n.length or 1.0
            normals.extend([_round(n.x / length), _round(n.y / length),
                            _round(n.z / length)])
            colour_index.append(index)

            for loop_index in poly.loop_indices:
                v = matrix @ mesh.vertices[mesh.loops[loop_index].vertex_index].co
                positions.extend([_round(v.x), _round(v.y), _round(v.z)])

        evaluated.to_mesh_clear()
      groups[gi]["count"] = len(colour_index) * 3 - groups[gi]["first"]

    # One matrix per group per frame. This is the entire animation payload.
    pose_frames = []
    if frames:
        for f in range(1, frames + 1):
            bpy.context.scene.frame_set(f)
            bpy.context.view_layer.update()
            pose = []
            for g in groups:
                # `world_fixed` has no root object and no pose: it is drawn
                # straight from the instance matrix, so it is null like the
                # unnamed group.
                pose.append(_matrix_list(group_roots[g["name"]].matrix_world)
                            if g["name"] in group_roots else None)
            pose_frames.append(pose)
        bpy.context.scene.frame_set(1)

    return {
        "name": root_name,
        "triangles": len(colour_index),
        "palette": palette,
        "positions": positions,
        "normals": normals,
        "colourIndex": colour_index,
        "groups": groups,
        "frames": pose_frames
    }


def write_js(model, filename):
    if not os.path.isdir(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
    path = os.path.join(OUTPUT_DIR, filename)

    # Compact JSON on one line per array. Pretty-printing a 6000-element list
    # triples the file for nobody's benefit -- this is generated output and the
    # only thing that reads it is a browser.
    def arr(values):
        return "[" + ",".join(
            (repr(v) if isinstance(v, int) else ("%g" % v)) for v in values) + "]"

    lines = [
        "// GENERATED by tools/blender/export_mesh.py -- do not edit.",
        "// Source of truth is the Blender build script; re-run the exporter.",
        "//",
        "// %d triangles, %d colours. Normals and colours are per TRIANGLE;" %
        (model["triangles"], len(model["palette"])),
        "// positions are per vertex. GLModels.register expands them.",
        "GLModels.register(%s, {" % json.dumps(model["name"]),
        "  unitsToPx: %g," % UNITS_TO_PX,
        "  triangles: %d," % model["triangles"],
        "  palette: %s," % json.dumps(model["palette"]),
        "  groups: %s," % json.dumps(model["groups"]),
        "  frames: %s," % json.dumps(model["frames"]),
        "  positions: %s," % arr(model["positions"]),
        "  normals: %s," % arr(model["normals"]),
        "  colourIndex: %s" % arr(model["colourIndex"]),
        "});",
        ""
    ]
    with open(path, "w") as handle:
        handle.write("\n".join(lines))
    size = os.path.getsize(path)
    moving = len([g for g in model["groups"] if g["name"]])
    print("  wrote %-30s %6d tris  %7.1f KB  %d frames, %d moving group(s)" %
          (filename, model["triangles"], size / 1024.0,
           len(model["frames"]), moving))


# --- what to export ----------------------------------------------------------
#
# One entry per model the 3D board needs. Each builds its scene exactly the way
# the sprite renderer does, so the geometry is bit-identical to what the PNGs
# were rendered from -- this is a second OUTPUT of the same source, not a
# second authoring of the same model.

def _build_rifleman(group):
    import tower_rifleman as r

    def build():
        td.scene(ortho_scale=r.ORTHO[group], tile_w=64, tile_h=64)
        root = td.root("rifleman")
        parts = r.BODIES[group](r.materials(), root)
        # The SAME work cycle the sprite sheets were rendered from, keyed onto
        # the same empties. The 3D board plays the animation the 2D board could
        # only flip between.
        r.animate_work(parts)
        return r.WORK_FRAMES
    return build


def _build_enemy(module_name):
    """Each enemy script returns a different tuple and switches its shield off
    a different way, so the unshielded state is selected per module rather than
    guessed from the shape of the return value."""
    def build():
        module = __import__(module_name)
        td.scene(ortho_scale=getattr(module, "ORTHO_SCALE", 1.5),
                 tile_w=64, tile_h=64)
        result = module.build()
        if module_name == "enemy_swarm":
            module.set_rendered(result[3], False)
            module.animate_walk(result[1], result[2], module.WALK_FRAMES)
        elif module_name == "enemy_brute":
            module.set_shield_visible(result[3], False)
            module.animate_walk(result[1], result[2], module.WALK_FRAMES)
        else:
            module.set_shield_visible(result[2], False)
            module.animate_walk(result[1], result[2], module.WALK_FRAMES)
        return module.WALK_FRAMES
    return build


def _build_recruit(tier):
    import summon_recruit as s

    def build():
        td.scene(ortho_scale=s.ORTHO[tier], tile_w=64, tile_h=64)
        root = td.root("recruit")
        parts = s.build(s.materials(), root, tier)
        s.animate_walk(parts, s.WALK_FRAMES)
        return s.WALK_FRAMES
    return build


def _build_sniper(group):
    import tower_sniper as s
    BUILDERS = {"base": s.build_caster, "a3": s.build_graft3,
                "a4": s.build_graft4, "a5": s.build_graft5,
                "b3": s.build_rapture3, "b4": s.build_rapture4,
                "b5": s.build_rapture5}

    def build():
        td.scene(ortho_scale=s.ORTHO[group], tile_w=64, tile_h=64)
        root = td.root("sniper")
        parts = BUILDERS[group](s.materials(), root)
        # Only the tiers that HAVE an authored cycle get one. A3-A5 and B5
        # charge rather than reload, and that was always drawn procedurally --
        # exporting a still for them is correct, not an omission.
        if group == "base":
            s.animate_reload(parts)
            return s.RELOAD_FRAMES
        if group in ("b3", "b4"):
            s.animate_rapture_reload(parts)
            return s.RAPTURE_FRAMES
        return 0
    return build


TARGETS = [
    ("sniper-base", "sniper-base.js", _build_sniper("base")),
    ("sniper-a3", "sniper-a3.js", _build_sniper("a3")),
    ("sniper-a4", "sniper-a4.js", _build_sniper("a4")),
    ("sniper-a5", "sniper-a5.js", _build_sniper("a5")),
    ("sniper-b3", "sniper-b3.js", _build_sniper("b3")),
    ("sniper-b4", "sniper-b4.js", _build_sniper("b4")),
    ("sniper-b5", "sniper-b5.js", _build_sniper("b5")),
    ("rifleman-base", "rifleman-base.js", _build_rifleman("base")),
    ("rifleman-a3", "rifleman-a3.js", _build_rifleman("a3")),
    ("rifleman-a5", "rifleman-a5.js", _build_rifleman("a5")),
    ("rifleman-b3", "rifleman-b3.js", _build_rifleman("b3")),
    ("rifleman-b5", "rifleman-b5.js", _build_rifleman("b5")),
    ("recruit-b4", "recruit-b4.js", _build_recruit("b4")),
    ("recruit-b5", "recruit-b5.js", _build_recruit("b5")),
    ("enemy-normal", "enemy-normal.js", _build_enemy("enemy_normal")),
    ("enemy-swarm", "enemy-swarm.js", _build_enemy("enemy_swarm")),
    ("enemy-brute", "enemy-brute.js", _build_enemy("enemy_brute")),
    ("enemy-hive", "enemy-hive.js", _build_enemy("enemy_hive")),
]


def _requested():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for arg in args:
        if arg.startswith("--only="):
            want = {v.strip() for v in arg.split("=", 1)[1].split(",") if v.strip()}
            return [t for t in TARGETS
                    if any(t[0].startswith(w) for w in want)]
    return TARGETS


def main():
    targets = _requested()
    print("exporting %d model(s) to js/gl/models/" % len(targets))
    total = 0
    for name, filename, build in targets:
        frames = build() or 0
        bpy.context.scene.frame_start = 1
        bpy.context.scene.frame_end = max(1, frames)
        bpy.context.view_layer.update()
        model = extract(name, frames)
        write_js(model, filename)
        total += model["triangles"]
    print("done: %d triangles across %d model(s)" % (total, len(targets)))


if __name__ == "__main__":
    main()
