# ---------------------------------------------------------------------------
# Look at the models close up, and open them in Blender.
#
#     blender --background --python tools/blender/make_preview.py
#
# Produces two things per model, because they answer different questions:
#
#   tools/blender/preview/<name>.blend   double-click it. Blender opens with
#                                        the model built, materials assigned,
#                                        lights and camera already matching
#                                        the game. Orbit it, scrub the walk
#                                        cycle, measure proportions, change
#                                        whatever -- it is a throwaway.
#
#   assets/preview/<name>.png            a big four-angle contact sheet for
#                                        looking at right now without opening
#                                        anything.
#
# THE .blend FILES ARE OUTPUT, NOT SOURCE. The scripts are the source; these
# are regenerated from them and nothing should ever be hand-edited here and
# expected to survive. Edit the .blend to work out what you want, then tell me
# the change and it goes back into the script that builds it. That is the
# whole reason the models are code: thirty of them stay consistent because one
# rig builds them, and a hand-tweaked .blend breaks that immediately.
#
# The preview render deliberately does NOT use the game camera's tile size --
# it is 520x680 per angle, so a detail that is two pixels in play is twenty
# here. It is the same camera ANGLE and the same lights, so what you judge is
# what ships; only the resolution differs.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import bpy
import bmesh
import numpy

import td_scene as td
import enemy_normal
import enemy_swarm
import enemy_brute
import enemy_hive
import tower_sniper
import tower_rifleman
import summon_recruit
import enemy_drudge
import enemy_skimmer
import enemy_tun
import enemy_hedger
import enemy_cooper

BLEND_DIR = os.path.join(os.path.dirname(__file__), "preview")
SHEET_DIR = os.path.join(td.OUTPUT_DIR, "preview")

# Big enough that a bevel is visible. Four angles across, one row.
ANGLE_W = 520
ANGLE_H = 680
ANGLES = 4


def ensure_dirs():
    for path in (BLEND_DIR, SHEET_DIR):
        if not os.path.isdir(path):
            os.makedirs(path)


def save_blend(name):
    path = os.path.join(BLEND_DIR, name + ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=path)
    print("  blend: %s" % path)


def render_angles(root, name):
    """Four yaw steps side by side, at preview resolution.

    Reuses render_sheet, which already handles the yaw stepping, the
    supersample resolve and the alpha compositing -- a second implementation
    here would be a second thing to keep in step with the game's framing."""
    td.render_sheet(root, os.path.join("preview", name), 1,
                    directions=ANGLES, tile_w=ANGLE_W, tile_h=ANGLE_H,
                    frame_start=1)


def preview(name, ortho_scale, build):
    """One model: fresh scene, build it, save the .blend, render the angles."""
    td.scene(ortho_scale=ortho_scale, tile_w=ANGLE_W, tile_h=ANGLE_H)
    root = build()
    save_blend(name)
    render_angles(root, name)


def preview_enemy_variants():
    """Preview every authored enemy both clean and with live projectors.

    The shipped sheets swap between these two states at runtime. Building the
    two reviews from each script's exact same rig makes any accidental pose,
    framing or ground-pivot drift obvious before it reaches the board.
    """
    def normal_build(shielded):
        def build():
            root, body, parts = enemy_normal.build()
            bpy.context.scene.frame_start = 1
            bpy.context.scene.frame_end = enemy_normal.WALK_FRAMES
            enemy_normal.animate_walk(body, parts, enemy_normal.WALK_FRAMES)
            enemy_normal.set_shield_visible(parts, shielded)
            return root
        return build

    def swarm_build(shielded):
        def build():
            root, body, legs, shield = enemy_swarm.build()
            bpy.context.scene.frame_start = 1
            bpy.context.scene.frame_end = enemy_swarm.WALK_FRAMES
            enemy_swarm.animate_walk(body, legs, enemy_swarm.WALK_FRAMES)
            enemy_swarm.set_rendered(shield, shielded)
            return root
        return build

    def brute_build(shielded):
        def build():
            root, body, parts, shield = enemy_brute.build()
            bpy.context.scene.frame_start = 1
            bpy.context.scene.frame_end = enemy_brute.WALK_FRAMES
            enemy_brute.animate_walk(body, parts, enemy_brute.WALK_FRAMES)
            enemy_brute.set_shield_visible(shield, shielded)
            return root
        return build

    def hive_build(shielded):
        def build():
            root, body, parts = enemy_hive.build()
            bpy.context.scene.frame_start = 1
            bpy.context.scene.frame_end = enemy_hive.WALK_FRAMES
            enemy_hive.animate_walk(body, parts, enemy_hive.WALK_FRAMES)
            enemy_hive.set_shield_visible(parts, shielded)
            return root
        return build

    cases = (
        ("enemy_normal", enemy_normal.ORTHO_SCALE * 0.92, normal_build),
        ("enemy_swarm", enemy_swarm.ORTHO_SCALE * 0.92, swarm_build),
        ("enemy_brute", enemy_brute.ORTHO_SCALE * 0.92, brute_build),
        ("enemy_hive", enemy_hive.ORTHO_SCALE * 0.92, hive_build),
    )
    for name, ortho_scale, build_variant in cases:
        preview(name, ortho_scale, build_variant(False))
        preview(name + "_shielded", ortho_scale, build_variant(True))


# --- the five Easy bodies ----------------------------------------------------
#
# WHAT THESE SHEETS ARE, AND THE ONE THING THEY MUST NOT BE USED FOR. At
# 520x680 per angle this is roughly the player's own MAX ZOOM-IN, about 11x
# closer than the default camera. That makes it a real view rather than a
# fiction, and legitimate evidence about SURFACE DETAIL -- a bevel, a weld, a
# ring separation, whether a part is modelled or implied.
#
# It is not evidence about a READ. Silhouette, value separation and whether a
# separator announces itself are properties of the DEFAULT view (fitted camera,
# ~2021.24), and a magnified render cannot show any of them. A silhouette that
# only works zoomed in is not a silhouette. otto's capture from the running game
# is the read; this is the craft. They answer different questions and neither
# substitutes for the other.
#
# `sizeScale` IS APPLIED TO THE COMPARISON SHEET AND NOT TO THE SINGLES, AND
# THAT IS DELIBERATE. The Hedger's primary separator is not modelled at all --
# `sizeScale` 1.25 is applied by the runtime, worth +72 lit px and +5 rows. A
# five-up rendered at one ortho would show it the same height as the Gleaner and
# hide the loudest thing about it. So the comparison scales each root by its
# type's real `sizeScale`; the per-model sheets do not, because those are about
# surface detail at a fixed magnification.

# (module, sheet name, sizeScale from js/enemy.js, commit the geometry is from)
#
# RENAMED FROM `EASY_FIVE`, and the sheet with it, because it now carries SIX
# bodies. A constant called "five" holding six is the same class of error as a
# count quoted without its threshold or a separation figure quoted without its
# metric -- a name that stops being true and keeps being read.
EASY_BODIES = (
    (enemy_normal, "easy_gleaner", 1.00, "(shipped)"),
    (enemy_drudge, "easy_drudge", 1.05, "a00a774"),
    (enemy_skimmer, "easy_skimmer", 1.00, "1769dcf"),
    (enemy_tun, "easy_tun", 1.00, "ddef990"),
    (enemy_hedger, "easy_hedger", 1.25, "22a8091"),
    (enemy_cooper, "easy_cooper", 1.00, "8f42a2c"),
)


def _build_easy(module):
    """Build one Easy body and key its walk. Returns its root empty.

    Uses each module's own build/animate rather than `export_build`, because a
    preview needs the ROOT to spin and `export_build` returns only a frame
    count. One rig per scene: `_foot_measure` resolves "foot_l" by exact name
    through `bpy.data.objects`, so two rigs in one scene would silently ground
    the second against the first one's foot.
    """
    root, body, parts = module.build()
    frames = getattr(module, "WALK_FRAMES", 8)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = frames
    module.animate_walk(body, parts, frames)
    if hasattr(module, "set_shield_visible"):
        module.set_shield_visible(parts, False)
    else:
        import enemy_chassis
        enemy_chassis.set_shield_visible(parts, False)
    return root


def _render_one_tile(module, name, ortho_scale, frame, size_scale=1.0,
                     directions=1):
    """One body, one frame, `directions` yaws -> one PNG. Returns its path."""
    td.scene(ortho_scale=ortho_scale, tile_w=ANGLE_W, tile_h=ANGLE_H)
    root = _build_easy(module)
    if size_scale != 1.0:
        root.scale = (size_scale, size_scale, size_scale)
    bpy.context.view_layer.update()
    td.render_sheet(root, os.path.join("preview", name), 1,
                    directions=directions,
                    tile_w=ANGLE_W, tile_h=ANGLE_H, frame_start=frame)
    return os.path.join(SHEET_DIR, name + ".png")


def _compose_row(paths, out_name):
    """Lay finished tiles side by side into one sheet.

    Composed from RENDERED TILES rather than by putting five rigs in one scene,
    for the naming reason in `_build_easy`. Blender image pixels are a flat
    bottom-up RGBA float buffer, so each tile reshapes to (h, w, 4) and the row
    is one hstack.
    """
    tiles = []
    height = None
    for path in paths:
        image = bpy.data.images.load(path)
        w, h = image.size
        buf = numpy.array(image.pixels[:], dtype=numpy.float32).reshape(h, w, 4)
        tiles.append(buf)
        height = h if height is None else height
        bpy.data.images.remove(image)
    row = numpy.hstack(tiles)
    total_h, total_w = row.shape[0], row.shape[1]
    out = bpy.data.images.new(out_name, width=total_w, height=total_h,
                              alpha=True)
    out.pixels = row.reshape(-1).tolist()
    out.filepath_raw = os.path.join(SHEET_DIR, out_name + ".png")
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    path = os.path.join(SHEET_DIR, out_name + ".png")
    print("  sheet: %s  (%d x %d)" % (path, total_w, total_h))
    return path


def preview_easy_bodies():
    """Four craft sheets, the Hedger's crank extremes, and one five-up."""
    ensure_dirs()

    # Per-model craft sheets: four yaws each, at the module's own ortho.
    #
    # THE HEDGER NEEDS A LOOSER FRAME THAN THE OTHERS AND IT IS NOT OPTIONAL.
    # At the usual 0.92 its crank hit the tile gutter -- `bottomMargin 0.0000`
    # at one yaw and `contentTop 1.0000` on the crank-high frame, i.e. the arm
    # was being CLIPPED by the preview. That is a framing fault in the sheet,
    # not in the model (the game frames from its own camera and the export is
    # unaffected), but a clipped preview would have shown Diego a shorter arm
    # than the one that shipped -- which is the same class of error as
    # rendering a superseded file, with a picture attached.
    ortho_factor = {enemy_hedger: 1.22}

    for module, name, _scale, commit in EASY_BODIES[1:]:
        print("preview %s  (geometry from %s)" % (name, commit))
        preview(name, module.ORTHO_SCALE * ortho_factor.get(module, 0.92),
                lambda m=module: _build_easy(m))

    # The Hedger's crank at both extremes. kaz's re-measure of the committed
    # file: low 0.018 u at frame index 0, high 1.182 u at frame index 6, and the
    # lower end is below the body floor on 5 of 12 frames. Those two frames are
    # the pair that shows the whole sweep.
    for label, frame in (("easy_hedger_crank_low", 1),
                         ("easy_hedger_crank_high", 7)):
        print("preview %s  (frame %d)" % (label, frame))
        # FOUR YAWS, NOT ONE, AND THE FIRST VERSION OF THIS WAS USELESS. At a
        # single yaw the crank hangs directly in front of the torso and
        # disappears into it -- dark bar on dark body, which is precisely the
        # low-contrast case juno measured (a 1 px feature at local contrast 10
        # does not survive a deletion test; at 68 it does). The arm only reads
        # where it clears the body against empty background, so a one-yaw sheet
        # showed an arm that is genuinely there and genuinely invisible, and
        # would have had Diego reviewing a limb he could not see.
        #
        # Same 1.22 ortho as the four-yaw sheet: at 0.92 the raised crank
        # reached `contentTop 1.0000`, clipped at the top of its own tile.
        _render_one_tile(enemy_hedger, label,
                         enemy_hedger.ORTHO_SCALE * 1.22, frame, directions=4)

    # The five-up. Same yaw, same lighting, same frame, one ortho for all five
    # so they share a ruler -- with each root at its type's real sizeScale.
    print("preview easy_bodies_compare  (sizeScale applied)")
    ortho = enemy_hedger.ORTHO_SCALE * 1.25 * 0.98      # frame the tallest
    tiles = []
    for module, name, size_scale, _commit in EASY_BODIES:
        tiles.append(_render_one_tile(module, "_cmp_" + name, ortho, 1,
                                      size_scale=size_scale))
    _compose_row(tiles, "easy_bodies_compare")
    print("")
    print("  ORDER: Gleaner, Drudge, Skimmer, Tun, Hedger, Cooper")
    print("  sizeScale applied: 1.00 / 1.05 / 1.00 / 1.00 / 1.25 / 1.00")
    print("  Geometry from: shipped / a00a774 / 1769dcf / ddef990 / 22a8091"
          " / 8f42a2c")
    print("")
    print("  These are ~11x the default camera -- the player's max zoom-in.")
    print("  Evidence about SURFACE DETAIL only. A read must be judged at the")
    print("  fitted camera (~2021.24); see otto's capture for that.")


def preview_enemy_normal():
    """Compatibility entry point retained for older local helper scripts."""
    def build():
        root, body, parts = enemy_normal.build()
        # Keyframe the walk so the .blend opens with a scrubbable timeline --
        # proportions read differently in motion than in a T-pose, and the
        # feedback that matters is usually about the motion.
        bpy.context.scene.frame_start = 1
        bpy.context.scene.frame_end = enemy_normal.WALK_FRAMES
        enemy_normal.animate_walk(body, parts, enemy_normal.WALK_FRAMES)
        enemy_normal.set_shield_visible(parts, False)
        return root
    preview("enemy_normal", enemy_normal.ORTHO_SCALE * 0.92, build)


def preview_sniper(name, group, body_fn, accent_fn=None, tighten=0.90):
    """Body plus one accent layer. An accent is judged on where it sits
    relative to the body, so the preview always builds both even though the
    shipped sheets keep them apart.

    `group` picks the same framing the shipped sheet uses, tightened a little
    because a preview has no rotation to leave room for."""
    def build():
        m = tower_sniper.materials()
        root = td.root("sniper")
        body_fn(m, root)
        if accent_fn:
            accent_fn(m, root)
        return root
    # The four-angle preview still includes a full broadside, so leave enough
    # width for long barrels; only the 48-direction shipped sheet needs the
    # group's entire rotational safety margin.
    preview(name, tower_sniper.ORTHO[group] * tighten, build)


def preview_rifleman(name, group, accent=None, tighten=0.90, frame=1):
    """One Rifleman body, optionally wearing one crosspath accent.

    An accent is judged on where it sits relative to the body it marks, so the
    preview always builds both even though the shipped sheets keep them in
    separate layers. `frame` renders a pose from the work cycle rather than the
    rest pose -- an ejecting case that only exists on frame 3 is invisible in a
    preview that only ever renders frame 1.
    """
    td.scene(ortho_scale=tower_rifleman.ORTHO[group] * tighten,
             tile_w=ANGLE_W, tile_h=ANGLE_H)
    m = tower_rifleman.materials()
    root = td.root("rifleman")
    parts = tower_rifleman.BODIES[group](m, root)
    tower_rifleman.animate_work(parts)
    if accent:
        tower_rifleman.build_accent(m, root, group, accent[0], accent[1])
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = tower_rifleman.WORK_FRAMES
    save_blend(name)
    td.render_sheet(root, os.path.join("preview", name), 1,
                    directions=ANGLES, tile_w=ANGLE_W, tile_h=ANGLE_H,
                    frame_start=frame)


def preview_riflemen(bodies_only=False):
    """Every Rifleman body, plus each crosspath accent sitting on it.

    `bodies_only` is the art-iteration loop: seven sheets instead of
    twenty-four, which is the difference between looking at a pose change in
    under a minute and waiting for accents that have not changed."""
    for group in tower_rifleman.GROUPS:
        # The mounted final tiers fill their own tiles; cropping them tighter
        # runs the battery and the dais off the edge of the contact sheet.
        tighten = 1.0 if group in ("a5", "b5") else 0.90
        preview_rifleman("rifleman_" + group, group, tighten=tighten)
        if bodies_only:
            continue
        for path in tower_rifleman.CROSS[group]:
            for tier in (1, 2):
                preview_rifleman(
                    "rifleman_%s_%s%d" % (group, path.lower(), tier),
                    group, accent=(path, tier), tighten=tighten)
    # One pose from the middle of the work cycle, on the body whose animation
    # carries the most: bolt back, case in the air, rear hand off the grip.
    preview_rifleman("rifleman_base_cycle", "base", tighten=0.90, frame=3)


def preview_recruits():
    """Both tiers, both states, four angles each.

    The hold pose is rendered on its RECOIL frame rather than its rest frame:
    the whole point of the second state is that they plant and shoot, and frame
    1 of it looks the same as a standing walk frame."""
    for tier in summon_recruit.TIERS:
        for state, frames, animate in summon_recruit.STATES:
            td.scene(ortho_scale=summon_recruit.ORTHO[tier] * 0.92,
                     tile_w=ANGLE_W, tile_h=ANGLE_H)
            m = summon_recruit.materials()
            root = td.root("recruit")
            parts = summon_recruit.build(m, root, tier)
            animate(parts, frames)
            bpy.context.scene.frame_start = 1
            bpy.context.scene.frame_end = frames
            name = "recruit_%s_%s" % (tier, state)
            save_blend(name)
            td.render_sheet(root, os.path.join("preview", name), 1,
                            directions=ANGLES, tile_w=ANGLE_W, tile_h=ANGLE_H,
                            frame_start=2 if state == "hold" else 3)


def main(enemies_only=False):
    ensure_dirs()
    preview_enemy_variants()

    if enemies_only:
        print("\nEnemy previews complete. Open the .blend files in "
              "tools/blender/preview/ to inspect.")
        return

    base_body = lambda m, r: tower_sniper.build_caster(m, r)
    preview_sniper("sniper_base", "base", base_body,
                   lambda m, r: tower_sniper.build_accent(m, r, "base", 0))
    for tier in (1, 2):
        preview_sniper("sniper_a%d" % tier, "base", base_body,
                       lambda m, r, t=tier:
                       tower_sniper.build_accent(m, r, "A", t))
        preview_sniper("sniper_b%d" % tier, "base", base_body,
                       lambda m, r, t=tier:
                       tower_sniper.build_accent(m, r, "B", t))

    # A3, A4 and the four crosspaths those two make reachable.
    preview_sniper("sniper_a3", "a3", lambda m, r:
                   tower_sniper.build_graft3(m, r))
    preview_sniper("sniper_a4", "a4", lambda m, r:
                   tower_sniper.build_graft4(m, r))
    # A5 has no crosspath variant -- nothing human left for B to mark. It also
    # fills its own tile, so it is NOT cropped tighter or the lance runs off.
    preview_sniper("sniper_a5", "a5", lambda m, r:
                   tower_sniper.build_graft5(m, r), tighten=1.0)
    for tier in (1, 2):
        preview_sniper("sniper_a3_b%d" % tier, "a3",
                       lambda m, r: tower_sniper.build_graft3(m, r),
                       lambda m, r, t=tier:
                       tower_sniper.build_accent_b_on_a3(m, r, t))
        preview_sniper("sniper_a4_b%d" % tier, "a4",
                       lambda m, r: tower_sniper.build_graft4(m, r),
                       lambda m, r, t=tier:
                       tower_sniper.build_accent_b_on_a4(m, r, t))

    # Path B. The reload is a KNEEL, so these are previewed mid-genuflection
    # as well as standing -- a pose that only exists on frame 3 is invisible
    # in a preview that only ever renders frame 1.
    for tier, builder in ((3, tower_sniper.build_rapture3),
                          (4, tower_sniper.build_rapture4)):
        preview_sniper("sniper_b%d" % tier, "b%d" % tier,
                       lambda m, r, b=builder: b(m, r))
        for a in (1, 2):
            preview_sniper("sniper_a%d_b%d" % (a, tier), "b%d" % tier,
                           lambda m, r, b=builder: b(m, r),
                           lambda m, r, t=a:
                           tower_sniper.build_accent_a_on_rapture(m, r, t))
        preview_sniper_kneeling("sniper_b%d_kneel" % tier, "b%d" % tier,
                                builder)

    # B5 is a single, non-animated body like A5. Keep the complete anchor
    # square in frame so the chains and raised-arm silhouette can be judged.
    preview_sniper("sniper_b5", "b5", lambda m, r:
                   tower_sniper.build_rapture5(m, r), tighten=1.0)

    preview_riflemen()

    print("\nOpen the .blend files in tools/blender/preview/ to inspect.")


def preview_sniper_kneeling(name, group, builder):
    """The reload pose, held. Renders frame 3 of the ritual rather than the
    standing frame 1, so the kneel can be judged without scrubbing."""
    td.scene(ortho_scale=tower_sniper.ORTHO[group] * 0.90,
             tile_w=ANGLE_W, tile_h=ANGLE_H)
    m = tower_sniper.materials()
    root = td.root("sniper")
    parts = builder(m, root)
    tower_sniper.animate_rapture_reload(parts)
    save_blend(name)
    td.render_sheet(root, os.path.join("preview", name), 1,
                    directions=ANGLES, tile_w=ANGLE_W, tile_h=ANGLE_H,
                    frame_start=3)


def validate_snipers():
    """Build every sniper body and exercise its authored animation, no render.

    This is deliberately part of the source pipeline rather than an ad-hoc
    one-off: a model can be syntactically valid Python while still containing
    an empty mesh, a zero-sized primitive, a broken animation parent or an
    open B5 anchor. `--validate-snipers` catches those failures in seconds and
    writes neither preview images nor shipped assets.
    """
    cases = [
        ("base", "base", tower_sniper.build_caster,
         tower_sniper.animate_reload, tower_sniper.RELOAD_FRAMES),
        ("a3", "a3", tower_sniper.build_graft3, None, 1),
        ("a4", "a4", tower_sniper.build_graft4, None, 1),
        ("a5", "a5", tower_sniper.build_graft5, None, 1),
        ("b3", "b3", tower_sniper.build_rapture3,
         tower_sniper.animate_rapture_reload, tower_sniper.RAPTURE_FRAMES),
        ("b4", "b4", tower_sniper.build_rapture4,
         tower_sniper.animate_rapture_reload, tower_sniper.RAPTURE_FRAMES),
        ("b5", "b5", tower_sniper.build_rapture5, None, 1),
    ]
    checked_meshes = 0
    for name, group, builder, animate, frames in cases:
        td.scene(ortho_scale=tower_sniper.ORTHO[group], tile_w=96, tile_h=96)
        root = td.root("sniper")
        parts = builder(tower_sniper.materials(), root)
        if animate:
            animate(parts)
        bpy.context.view_layer.update()

        meshes = [obj for obj in bpy.context.scene.objects
                  if obj.type == "MESH"]
        assert meshes, "%s built no mesh objects" % name
        for frame in range(1, frames + 1):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            for obj in meshes:
                values = tuple(obj.matrix_world[i][j]
                               for i in range(4) for j in range(4))
                assert all(math.isfinite(value) for value in values), \
                    "%s/%s has a non-finite transform" % (name, obj.name)
                assert all(value > 0.0001 for value in obj.dimensions), \
                    "%s/%s has a collapsed dimension" % (name, obj.name)

        # The concrete B5 complaint was that the anchors behaved like flat
        # cards. Verify every mesh in each anchor hierarchy is a sealed solid:
        # every edge must belong to exactly two faces.
        if name == "b5":
            anchor_meshes = [obj for obj in meshes
                             if obj.name.startswith("anchor_")]
            assert anchor_meshes, "B5 has no volumetric anchor meshes"
            for obj in anchor_meshes:
                bm = bmesh.new()
                bm.from_mesh(obj.data)
                assert all(len(edge.link_faces) == 2 for edge in bm.edges), \
                    "B5/%s is not a closed volume" % obj.name
                bm.free()
        checked_meshes += len(meshes)
        print("  validated %-4s  %3d meshes  %d frame(s)" %
              (name, len(meshes), frames))

    print("sniper validation passed: %d bodies, %d mesh instances" %
          (len(cases), checked_meshes))


def validate_riflemen():
    """Build every Rifleman body and accent, exercise the work cycle, render
    nothing.

    Three failures are specific to this model and none of them are visible in a
    single still, so they are asserted here rather than looked for by eye:

      * a collapsed or non-finite transform, as for the sniper;
      * ACCENT DRIFT -- every accent seat (hat, rail, muzzle, shoulders) must
        hold the same world matrix on all four animated frames, because the
        one-frame accent sheets are composited over all of them;
      * the recruit count on the rack. B4 hangs two hats and B5 hangs four, and
        that is the tier's ability drawn rather than described, so a silent
        change to it is a lie about a mechanic.
    """
    expected_hats = {"b4": 2, "b5": 4}
    checked_meshes = 0
    for group in tower_rifleman.GROUPS:
        td.scene(ortho_scale=tower_rifleman.ORTHO[group], tile_w=96,
                 tile_h=96)
        m = tower_rifleman.materials()
        root = td.root("rifleman")
        parts = tower_rifleman.BODIES[group](m, root)
        tower_rifleman.animate_work(parts)
        bpy.context.view_layer.update()

        meshes = [obj for obj in bpy.context.scene.objects
                  if obj.type == "MESH"]
        assert meshes, "%s built no mesh objects" % group

        anchors = parts["anchors"]
        seats = {name: anchors[name]
                 for name in ("hat", "rail", "fore", "muzzle", "shoulder")}
        seat_rest = {}
        for frame in range(1, tower_rifleman.WORK_FRAMES + 1):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            for obj in meshes:
                values = tuple(obj.matrix_world[i][j]
                               for i in range(4) for j in range(4))
                assert all(math.isfinite(value) for value in values), \
                    "%s/%s has a non-finite transform" % (group, obj.name)
                assert all(value > 0.0001 for value in obj.dimensions), \
                    "%s/%s has a collapsed dimension" % (group, obj.name)
            for name, seat in seats.items():
                here = tuple(round(seat.matrix_world[i][j], 6)
                             for i in range(4) for j in range(4))
                if frame == 1:
                    seat_rest[name] = here
                else:
                    assert here == seat_rest[name], (
                        "%s: the %s accent seat moves on frame %d -- a "
                        "one-frame accent sheet would slide off it"
                        % (group, name, frame))

        # Count the hat ROOTS, not their brims and crowns -- every part is
        # named off its peg.
        hats = len([obj for obj in bpy.context.scene.objects
                    if obj.type == "EMPTY" and
                    obj.name.startswith("peg_hat_")])
        assert hats == expected_hats.get(group, 0), (
            "%s hangs %d recruit hats, expected %d"
            % (group, hats, expected_hats.get(group, 0)))

        # Every accent this body can wear has to build on it too.
        accents = 0
        for path in tower_rifleman.CROSS[group]:
            for tier in (1, 2):
                before = len(bpy.context.scene.objects)
                tower_rifleman.build_accent(m, root, group, path, tier)
                assert len(bpy.context.scene.objects) > before, \
                    "%s accent %s%d built nothing" % (group, path, tier)
                accents += 1

        checked_meshes += len(meshes)
        print("  validated %-5s %3d meshes  %d frames  %d accent(s)"
              % (group, len(meshes), tower_rifleman.WORK_FRAMES, accents))

    print("rifleman validation passed: %d bodies, %d mesh instances"
          % (len(tower_rifleman.GROUPS), checked_meshes))


def frame_report(module, groups, ortho_by_group, tile_by_group=None,
                 directions=48, animate=None, builders=None, aspect=1.0):
    """The SMALLEST ortho_scale each group can be rendered at without clipping,
    computed from geometry instead of discovered by rendering.

    WHY THIS EXISTS. `render_sheet` reports gutter contact per tile, which is
    the right safety net but the worst possible feedback loop: a full 48-facing
    body is minutes of render, and the first Rifleman pass came back with all
    seven groups clipping. The camera is a fixed linear projection, so the
    answer is arithmetic:

        screen_right = x
        screen_up    = 0.56 * y + 0.829 * z

    and td_scene raises the camera by 0.36 of a frame, so a tile spans
    [-ortho/2, +ortho/2] horizontally and [-0.14*ortho, +0.86*ortho]
    vertically. Sweep every vertex through every yaw the sheet will render,
    take the extremes, and solve for ortho three ways -- the binding one is
    almost always the BOTTOM, because ground-level props swing toward the
    camera and only 0.14 of a tile sits below the world origin.

    Evaluated meshes, not bound boxes: the bevel modifier is what actually ends
    up in the render.
    """
    elevation = math.radians(td.CAMERA_ELEVATION_DEG)
    sin_e = math.sin(elevation)
    cos_e = math.cos(elevation)
    depsgraph = None
    rows = []

    for group in groups:
        td.scene(ortho_scale=ortho_by_group[group], tile_w=64, tile_h=64)
        m = module.materials()
        root = td.root("subject")
        parts = (builders or module.BODIES)[group](m, root)
        if animate:
            animate(parts)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()

        points = []
        for obj in bpy.context.scene.objects:
            if obj.type != "MESH":
                continue
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            matrix = evaluated.matrix_world
            for vertex in mesh.vertices:
                points.append(matrix @ vertex.co)
            evaluated.to_mesh_clear()

        max_x = 0.0
        max_up = 0.0
        min_up = 0.0
        for step in range(directions):
            yaw = math.tau * step / directions
            c, s = math.cos(yaw), math.sin(yaw)
            for p in points:
                x = p.x * c - p.y * s
                y = p.x * s + p.y * c
                up = sin_e * y + cos_e * p.z
                if abs(x) > max_x:
                    max_x = abs(x)
                if up > max_up:
                    max_up = up
                if up < min_up:
                    min_up = up

        tile = (tile_by_group or {}).get(group, 256)
        gutter = 4.0 / tile          # one pixel more than the 3px check wants
        # `ortho_scale` spans the LONGER tile axis, so on a 128x160 enemy-style
        # tile the horizontal field is only 0.8 of it. `aspect` is width/height;
        # square tiles pass 1.0 and the term disappears.
        needed = max(2.0 * max_x / (aspect * (1.0 - 2.0 * gutter)),
                     max_up / (0.86 - gutter),
                     (-min_up) / (0.14 - gutter) if min_up < 0 else 0.0)
        rows.append((group, ortho_by_group[group], needed))
        print("  %-5s ortho %.2f -> needs %.2f   (|x| %.3f, up %.3f .. %.3f)"
              % (group, ortho_by_group[group], needed, max_x, min_up, max_up))

    print("\nORTHO = {%s}" % ", ".join(
        '"%s": %.2f' % (g, math.ceil(n * 20.0) / 20.0) for g, _, n in rows))


def validate_recruits():
    """Build both recruit tiers, exercise both states, render nothing.

    The one assertion that is specific to them is FEET ON THE ROAD. They walk a
    path, and the walk is advanced by distance in the game, so a sole that
    drifts below z=0 during the cycle is a unit sinking into the tarmac -- and
    that is invisible in a still of frame 1.
    """
    for tier in summon_recruit.TIERS:
        for state, frames, animate in summon_recruit.STATES:
            td.scene(ortho_scale=summon_recruit.ORTHO[tier],
                     tile_w=64, tile_h=80)
            m = summon_recruit.materials()
            root = td.root("recruit")
            parts = summon_recruit.build(m, root, tier)
            animate(parts, frames)
            bpy.context.view_layer.update()

            meshes = [obj for obj in bpy.context.scene.objects
                      if obj.type == "MESH"]
            assert meshes, "%s/%s built no mesh objects" % (tier, state)

            lowest = 1e9
            depsgraph = bpy.context.evaluated_depsgraph_get()
            for frame in range(1, frames + 1):
                bpy.context.scene.frame_set(frame)
                bpy.context.view_layer.update()
                depsgraph = bpy.context.evaluated_depsgraph_get()
                for obj in meshes:
                    values = tuple(obj.matrix_world[i][j]
                                   for i in range(4) for j in range(4))
                    assert all(math.isfinite(v) for v in values), \
                        "%s/%s/%s has a non-finite transform" % (tier, state,
                                                                 obj.name)
                    assert all(v > 0.0001 for v in obj.dimensions), \
                        "%s/%s/%s has a collapsed dimension" % (tier, state,
                                                                obj.name)
                    evaluated = obj.evaluated_get(depsgraph)
                    mesh = evaluated.to_mesh()
                    matrix = evaluated.matrix_world
                    for vertex in mesh.vertices:
                        z = (matrix @ vertex.co).z
                        if z < lowest:
                            lowest = z
                    evaluated.to_mesh_clear()

            assert lowest > -0.02, (
                "%s/%s sinks %.3f below the road" % (tier, state, -lowest))
            print("  validated %-3s %-5s %3d meshes  %d frames  "
                  "lowest z %+.3f" % (tier, state, len(meshes), frames,
                                      lowest))

    print("recruit validation passed")


if __name__ == "__main__":
    # `--easy-five` kept as an alias: it is in the CHANGELOG and in messages
    # sent to three people today, and breaking a documented command to fix
    # a name is a worse trade than carrying one extra string.
    if "--easy-bodies" in sys.argv or "--easy-five" in sys.argv:
        preview_easy_bodies()
    elif "--validate-recruits" in sys.argv:
        validate_recruits()
    elif "--frame-recruits" in sys.argv:
        # BOTH STATES, because they are differently wide. The walk carries the
        # rifle muzzle-down at the hip and the hold brings it up and level,
        # which reaches much further along +X -- measuring only the walk would
        # frame the sheet that clips.
        for state, frames, animate in summon_recruit.STATES:
            print("  -- %s --" % state)
            frame_report(summon_recruit, summon_recruit.TIERS,
                         summon_recruit.ORTHO,
                         directions=summon_recruit.DIRECTIONS,
                         animate=(lambda parts, a=animate, f=frames:
                                  a(parts, f)),
                         builders={t: (lambda m, r, tier=t:
                                       summon_recruit.build(m, r, tier))
                                   for t in summon_recruit.TIERS},
                         aspect=summon_recruit.TILE_W /
                         float(summon_recruit.TILE_H),
                         tile_by_group={t: summon_recruit.TILE_H
                                        for t in summon_recruit.TIERS})
    elif "--recruits-only" in sys.argv:
        ensure_dirs()
        preview_recruits()
    elif "--frame-riflemen" in sys.argv:
        frame_report(tower_rifleman, tower_rifleman.GROUPS,
                     tower_rifleman.ORTHO,
                     tile_by_group=tower_rifleman.TILE_BY_GROUP,
                     directions=tower_rifleman.DIRECTIONS,
                     animate=tower_rifleman.animate_work)
    elif "--validate-snipers" in sys.argv:
        validate_snipers()
    elif "--validate-riflemen" in sys.argv:
        validate_riflemen()
    elif "--riflemen-only" in sys.argv:
        ensure_dirs()
        preview_riflemen(bodies_only="--bodies-only" in sys.argv)
    elif "--enemies-only" in sys.argv:
        main(enemies_only=True)
    else:
        main()
