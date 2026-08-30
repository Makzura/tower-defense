# ---------------------------------------------------------------------------
# Shared Blender rig for every Tower Defense sprite.
#
# This file is an OFFLINE ART TOOL. It is never loaded by the game, adds no
# build step, and the game keeps running by double-clicking index.html. It
# renders PNG sprite sheets; how those get into the game is a separate
# decision (loose files vs base64 data URIs -- see MODEL_SKINS_GUIDE.md).
#
# Run it through Blender's own bundled Python, so there is nothing to install
# beyond Blender itself:
#
#     blender --background --python tools/blender/enemy_normal.py
#
# WHY THE CAMERA IS WHAT IT IS. Nothing here is taste; every number is read
# back out of the engine so a render drops onto the existing board without
# hand-tuning:
#
#   js/visuals.js  GROUND_SQUASH = 0.56
#       The engine paints the ground plane squashed to 0.56 of its width. A
#       camera reproduces that at an elevation of asin(0.56) = 34.06 degrees
#       above the horizon. Any other angle and a rendered plinth sits at a
#       different slant from the ellipses Visuals3Q draws around it.
#
#   js/visuals.js  LIGHT_X = -0.35, LIGHT_Y = -0.8
#       Screen-space light vector with y pointing down, so the key comes from
#       the UPPER LEFT of frame.
#
#   js/visuals.js  shadow(): offset (reach, reach * 0.7), reach = 4 + lift*0.32
#       Shadows fall DOWN-RIGHT on screen at a 1 : 0.7 ratio, and lengthen by
#       0.32 per unit of height. That ratio fixes the sun's elevation at
#       atan(1 / (0.32 * hypot(1, 0.7))) = 68.7 degrees. Rounded to 68.
#
# ORTHOGRAPHIC, not perspective: the game maps world position to screen
# linearly, so a tower at the bottom of the board is drawn at exactly the same
# scale as one at the top. A perspective render would disagree with that at
# the edges.
# ---------------------------------------------------------------------------

import math
import os

import bpy
import numpy

# --- engine-derived constants ---------------------------------------------
GROUND_SQUASH = 0.56
CAMERA_ELEVATION_DEG = math.degrees(math.asin(GROUND_SQUASH))  # 34.06
CAMERA_RISE_FRACTION = 0.36
ROOT_ANCHOR_Y = 0.5 + CAMERA_RISE_FRACTION
SUN_ELEVATION_DEG = 68.0
SUN_SCREEN_X = -0.35
SUN_SCREEN_Y = -0.8

# Where rendered sheets land. Kept out of js/ because they are art, not code.
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "assets")

# Render every tile at this multiple and average it back down. EEVEE's own
# anti-aliasing only samples inside the pixel grid it is given; supersampling
# gives clean diagonal edges on a model whose silhouette is almost entirely
# diagonals, and it is the single largest quality difference available here
# for the cost. 2 is the sweet spot -- 3 is four times the pixels for a
# difference nobody can point at.
SUPERSAMPLE = 2

# Rounded edges on every box. This matters more than it sounds: a cube lit by
# a directional key has three flat faces and no edge highlight at all, which
# is exactly what makes primitive-built models read as "programmer art". A
# bevel of a millimetre or two catches the key along every edge and gives the
# silhouette a rim, at no cost to the polygon budget worth mentioning.
BEVEL_WIDTH = 0.012
BEVEL_SEGMENTS = 2


# --- palette ---------------------------------------------------------------
# Straight off the art-direction board. Linear-ish sRGB values; Blender wants
# 0..1 floats, so these are the hex values divided by 255 and gamma-corrected
# by srgb() below.
PALETTE = {
    "tin":      "#545C6B",
    "tin_dark": "#2B3242",
    "brass":    "#B98A38",
    "stone":    "#39404E",
    "bone":     "#CFC8B4",
    "flesh":    "#7C4A52",
    "skin":     "#BE9E82",
    "coat":     "#2F3849",
    "coat_v":   "#3B2149",
    "ley":      "#4FE3D2",
    "sigil":    "#C061F0",
    "core_red": "#DE4F54",
    "core_amb": "#F0C747",
    "core_vio": "#9860C4",
    "hair":     "#241E1A",
    "char":     "#171218",

    # --- the Rifleman ------------------------------------------------------
    # HE IS THE ONE TOWER WITH NO MAGIC IN HIM, so he owns none of the keys
    # above. `brass` in particular is deliberately not reused: it is a mustard
    # #B98A38 built to read as tarnished fittings on a machine, and on a man in
    # a suit it read as cheap. This is a tailoring palette -- charcoal, ivory,
    # oxblood, real gold and walnut -- and it shares no hue with the ley/sigil
    # faction colours or with the enemies' coral, so he stays legible next to
    # all of them without borrowing any of their language.
    #
    # Values are chosen against the board, not in isolation. `shirt` is the
    # only light garment in the entire game: it is what makes his silhouette
    # read as a dressed person at 40 px, where every other unit is one dark
    # mass with a coloured light in it.
    # VALUES FIRST, HUES SECOND. The first pass picked five colours that were
    # all correct in isolation and all within about 8% of each other in
    # luminance, and the model rendered as one dark blob with a hat: the
    # weapon vanished into the jacket, the jacket vanished into the trousers.
    # At 40 px a palette IS a value ladder, so these are spaced deliberately --
    # suit, then gun metal, then walnut, then the waistcoat, then the shirt,
    # then gold -- and each step is visible against the one below it.
    "suit":       "#2E2F3C",
    "suit_dark":  "#1C1D26",
    "pinstripe":  "#565A70",
    "shirt":      "#E7E3D6",
    "tie":        "#8E3540",
    "gold":       "#E8B84B",
    "gold_dark":  "#9C7526",
    "gun_blue":   "#565E72",
    "gun_dark":   "#2E3340",
    "walnut":     "#7A5236",
    "crate":      "#5E4830",
    "leather":    "#4A3226",
    "chrome":     "#A8B2C4",
    "fur":        "#6A6270",
    # A lit cigar and a spotlight lens. The only two emissive things he owns,
    # and both of them are fire and filament rather than enchantment -- which
    # is the entire statement the model is making.
    "ember":      "#FF7A3C",
    "lamp":       "#FFE9B8",

    # --- his recruits ------------------------------------------------------
    # NOT his colours. The Rifleman wears charcoal and gold because he can
    # afford to; the people he hands rifles to are wearing whatever they still
    # had. Dust, canvas and wool, one value band lighter and much duller than
    # the suit, so a squad of them never competes with the tower that called
    # it -- and so they read as civilians at a glance.
    "canvas":     "#8A7B60",
    "wool":       "#4E4C52",
    "rust":       "#71432C",
}


def srgb(hex_string):
    """Hex to Blender's linear RGBA. Blender colour sockets are linear, so a
    hex value pasted in raw comes out visibly washed out -- this is the
    conversion that keeps a rendered sprite the same colour as the concept."""
    hex_string = hex_string.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(hex_string[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


def clear_scene():
    """Blender opens with a cube, a lamp and a camera. Every script starts
    from an empty file so a re-run is identical to a first run."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                  bpy.data.cameras, bpy.data.actions):
        for item in list(block):
            block.remove(item)


def material(name, colour_key, emission=0.0, roughness=0.75, metallic=0.0):
    """One Principled BSDF per named material. `emission` above zero makes it
    a light source -- that is how ley teal and sigil violet read as glow
    rather than as paint, and it is the only reason the cores pop at 32 px."""
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    colour = srgb(PALETTE[colour_key])
    bsdf.inputs["Base Color"].default_value = colour
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission > 0.0:
        # Socket names moved between Blender versions; try both.
        for socket in ("Emission Color", "Emission"):
            if socket in bsdf.inputs:
                bsdf.inputs[socket].default_value = colour
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def build_camera(ortho_scale):
    """Orthographic, elevated to match GROUND_SQUASH. `ortho_scale` is the
    height of the view box in Blender units, so it decides how much world one
    sprite tile covers -- the single knob for 'how big is this thing'."""
    elevation = math.radians(CAMERA_ELEVATION_DEG)
    distance = 20.0
    data = bpy.data.cameras.new("sheet_cam")
    data.type = "ORTHO"
    data.ortho_scale = ortho_scale
    cam = bpy.data.objects.new("sheet_cam", data)
    # GROUND CONTACT SITS NEAR THE BOTTOM OF THE TILE. The camera is raised
    # along its OWN up axis by just under half a frame, which puts world
    # z = 0 near the lower edge instead of in the middle.
    #
    # This is not framing taste, it is the contract with the engine:
    # VisualModels.registerSprite anchors a sprite bottom-centre on the
    # object's ground contact point (anchorX 0.5, anchorY 1). A model centred
    # in its tile would float half a body above the road. Aiming at the origin
    # is also what decapitated the first build -- the model is assembled
    # standing on z = 0, so the whole thing lives ABOVE the point the camera
    # was pointed at.
    #
    # 0.36 leaves enough real margin below the projected origin for wide
    # feet, kneeling poses and B5's shrine anchors. 0.42 put the origin at
    # 92% of the tile and silently clipped pixels on most animated sheets;
    # because the runtime now anchors the projected world origin explicitly,
    # extra transparent margin is safe and does not make models float.
    up = (0.0, math.cos(math.radians(90.0 - CAMERA_ELEVATION_DEG)),
          math.sin(math.radians(90.0 - CAMERA_ELEVATION_DEG)))
    rise = ortho_scale * CAMERA_RISE_FRACTION
    cam.location = (0.0,
                    -distance * math.cos(elevation) + up[1] * rise,
                    distance * math.sin(elevation) + up[2] * rise)
    # X rotation of (90 - elevation) tilts the camera down from horizontal.
    cam.rotation_euler = (math.radians(90.0 - CAMERA_ELEVATION_DEG), 0.0, 0.0)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def build_lights():
    """Key from upper-left at 68 degrees (see the shadow maths at the top),
    plus a cool fill and a rim. The fill exists because a 32 px sprite lit by
    one hard sun loses its entire shadow side to black -- at this size the
    silhouette is the model, and half a silhouette is not one."""
    key_azimuth = math.atan2(-SUN_SCREEN_X, -SUN_SCREEN_Y)
    key_data = bpy.data.lights.new("key", type="SUN")
    key_data.energy = 3.2
    key_data.angle = math.radians(6.0)   # slightly soft shadow edges
    key = bpy.data.objects.new("key", key_data)
    key.rotation_euler = (math.radians(90.0 - SUN_ELEVATION_DEG), 0.0,
                          key_azimuth)
    bpy.context.scene.collection.objects.link(key)

    fill_data = bpy.data.lights.new("fill", type="SUN")
    fill_data.energy = 1.6
    fill_data.color = srgb("#7FA8C8")[:3]
    fill = bpy.data.objects.new("fill", fill_data)
    fill.rotation_euler = (math.radians(60.0), 0.0, key_azimuth + math.pi)
    bpy.context.scene.collection.objects.link(fill)

    rim_data = bpy.data.lights.new("rim", type="SUN")
    rim_data.energy = 2.4
    rim = bpy.data.objects.new("rim", rim_data)
    rim.rotation_euler = (math.radians(78.0), 0.0, key_azimuth + math.pi * 0.75)
    bpy.context.scene.collection.objects.link(rim)


def setup_render(tile_w, tile_h):
    """EEVEE, transparent film, square pixels. Transparent film is the whole
    point: the game composites these over its own terrain, so anything that is
    not the model has to be alpha zero, not a background colour."""
    scene = bpy.context.scene
    engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [
        item.identifier for item in
        scene.bl_rna.properties["render"].fixed_type.bl_rna
        .properties["engine"].enum_items
    ] else "BLENDER_EEVEE"
    try:
        scene.render.engine = engine
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = tile_w * SUPERSAMPLE
    scene.render.resolution_y = tile_h * SUPERSAMPLE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    # STANDARD VIEW TRANSFORM, not AgX. This is the single most important
    # setting in the file. Blender defaults to AgX, a filmic tone map built
    # for photographic renders: it rolls off highlights and desaturates
    # saturated emission hard. A core authored at #DE4F54 came out of the
    # first render as a pale pink blob, and the tin read near-black. Sprites
    # are composited over a flat 2D board and have to keep the exact palette
    # values the art direction specifies, so tone mapping is switched off.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    if hasattr(scene, "eevee"):
        if hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = 128
        # Ambient occlusion. Without it every crevice on a boxy model is lit
        # exactly as brightly as the faces around it and the whole thing reads
        # flat -- AO is what makes a bolted-on part look bolted on.
        if hasattr(scene.eevee, "use_gtao"):
            scene.eevee.use_gtao = True
        if hasattr(scene.eevee, "gtao_distance"):
            scene.eevee.gtao_distance = 0.35
        if hasattr(scene.eevee, "use_shadows"):
            scene.eevee.use_shadows = True
        if hasattr(scene.eevee, "use_raytracing"):
            scene.eevee.use_raytracing = True


def linear_keyframes():
    """Make every keyframe_insert() land as LINEAR instead of BEZIER.

    Bezier is Blender's default and it is wrong for a cycle: it eases in and
    out at EVERY key, so an 8-frame walk built from evenly spaced sine values
    comes out lurching. Setting the preference is also the only version-proof
    way to do this -- Blender 4.4 replaced actions with slotted actions and
    5.x removed `action.fcurves` entirely, so reaching in afterwards to retype
    the handles breaks on whichever version you are not testing on."""
    try:
        bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    except (AttributeError, TypeError):
        pass


def action_fcurves(action):
    """Every f-curve of an action, on old and new Blender alike. Kept because
    some fixes genuinely need the curves (cyclic modifiers, handle types);
    ordinary interpolation should use linear_keyframes() above instead."""
    if not action:
        return []
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            for bag in getattr(strip, "channelbags", []):
                curves.extend(bag.fcurves)
    return curves


def scene(ortho_scale=3.0, tile_w=96, tile_h=112):
    """One call to stand up a matching scene. Every model script starts here
    so that thirty sprites drawn months apart still share a camera and a sun."""
    clear_scene()
    linear_keyframes()
    build_camera(ortho_scale)
    build_lights()
    setup_render(tile_w, tile_h)
    world = bpy.data.worlds.new("flat")
    world.use_nodes = True
    # Ambient has to be a COLOUR, not black-with-strength: black x anything is
    # black, which is what made the first render read as silhouettes. A cool
    # slate ambient also matches the board's own terrain bounce.
    world.node_tree.nodes["Background"].inputs[0].default_value = srgb("#48566B")
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    bpy.context.scene.world = world


# --- primitives -------------------------------------------------------------
# Everything is built out of these four. Deliberately: at 32 px a bevelled
# custom mesh and a stretched cube are the same handful of pixels, so the
# model is authored as a readable hierarchy of boxes instead of geometry
# nobody can see.

def _attach(obj, name, location, rotation, mat, parent):
    """Parent in LOCAL space, with no parent-inverse compensation.

    The obvious way to parent in bpy is `obj.parent = p` followed by
    `obj.matrix_parent_inverse = p.matrix_world.inverted()`, which preserves
    the child's world position. It is also a trap in a script: matrix_world is
    only recomputed on a depsgraph update, so every child built before Blender
    next evaluates the scene compensates against a STALE matrix. Static frames
    looked fine; the moment the death animation rotated a parent, limbs tore
    off and flew out of frame.

    Clearing the inverse and treating `location` as an offset from the parent
    is both simpler and order-independent -- which is what a build script
    needs, since it creates a hundred objects before anything is evaluated."""
    obj.name = name
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    obj.rotation_euler = rotation
    if mat:
        obj.data.materials.append(mat)
    return obj


def bevel(obj, width=None, segments=None):
    """Round an object's edges. See BEVEL_WIDTH for why this is not optional.

    `harden_normals` is off deliberately: it needs custom split normals that
    do not survive every export path, and at this size the difference is one
    pixel."""
    mod = obj.modifiers.new(name="bevel", type="BEVEL")
    mod.width = BEVEL_WIDTH if width is None else width
    mod.segments = BEVEL_SEGMENTS if segments is None else segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(40.0)
    return obj


def box(name, size, location=(0, 0, 0), rotation=(0, 0, 0), mat=None,
        parent=None, round_edges=True):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.scale = size
    _attach(obj, name, location, rotation, mat, parent)
    if round_edges:
        # Bevel AFTER scaling, and scale the width by the smallest axis, or a
        # box stretched 10:1 gets a bevel ten times wider on its long edges.
        smallest = min(abs(size[0]), abs(size[1]), abs(size[2])) or 1.0
        bevel(obj, width=min(BEVEL_WIDTH / smallest, 0.30))
    return obj


def cyl(name, radius, depth, location=(0, 0, 0), rotation=(0, 0, 0), mat=None,
        parent=None, verts=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius,
                                        depth=depth, location=(0, 0, 0))
    obj = bpy.context.active_object
    return _attach(obj, name, location, rotation, mat, parent)


def ball(name, radius, location=(0, 0, 0), mat=None, parent=None,
         segments=16, rings=8):
    """A UV sphere. Triangle cost is `segments * (2 * rings - 2)`.

    THE DEFAULTS ARE 16/8 AND MUST STAY THAT WAY. Every model authored before
    2026-08-13 called this with no resolution argument, so changing the default
    silently rebuilds every head, eye, joint and glow orb in the project. New
    models pass the resolution they actually need; old ones keep theirs by
    getting it from here.

    16/8 IS 224 TRIANGLES, WHICH IS THE WRONG PRICE FOR A SMALL PART. The
    Gleaner's lens is r=0.048 -- about 1.9 screen px at the default camera --
    and it spends 5.6% of that model's entire budget. Anything that multiplies
    should pass segments=8, rings=4 (48 triangles). Do not drop to 6/3 for a
    part the player can zoom in on: the camera reaches 180 against a 2022
    default, 11.2x closer, and at that range a 6-segment sphere reads as a
    hexagon. 8/4 survives it.

    ONE PLACE WHERE THE FACE ORDER OF THIS PRIMITIVE IS VISIBLE. Blender emits
    these faces in a version-dependent ORDER -- the geometry is identical, but
    5.3 lists it differently, which is why a re-export of an unchanged model
    differs in bytes while its triangle multiset does not. That is unobservable
    on the opaque path, which is the whole board. It is NOT unobservable under
    `GLRenderer.setFade`, which enables BLEND with depthMask(false) so a fading
    body composites in buffer order rather than back to front. Today setFade
    has exactly one caller -- the wreck fade in gl-world.js -- and wrecks are
    flier-only, so nothing here reaches it. If wrecks are ever extended to
    ground enemies, sphere face order becomes a visible property of these
    models and re-exporting one becomes a visual change.
    """
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings,
                                         radius=radius, location=(0, 0, 0))
    obj = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    return _attach(obj, name, location, (0, 0, 0), mat, parent)


def root(name="root"):
    """An empty every model is parented to. Yaw on this is how a sprite sheet
    gets its 8 or 16 directions -- the model is built facing +X once and the
    root spins it, so nothing has to be modelled twice."""
    empty = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(empty)
    return empty


# --- derived solids ---------------------------------------------------------
# The four above cover machines. These four cover anatomy, tapered masonry,
# rings and struts, and they live here rather than in one model script because
# the second tower needed all four of them on its first day. tower_sniper.py
# authored them privately and now aliases these, so there is exactly one
# implementation of each and a fix reaches every model at once.

def frustum(name, lower_radius, upper_radius, height, location, mat,
            parent, verts=8, rotation_z=0.0, alternate_mat=None,
            rotation=(0.0, 0.0, 0.0)):
    """A capped, genuinely volumetric tapered column.

    `box` is ideal for weapon housings, but a tall narrow box can collapse into
    a single same-colour strip in a 48-facing sprite sheet. This mesh has a
    closed top and bottom, several broad side planes and optional alternating
    face values, so parallax and lighting visibly change as it turns.
    """
    vertices = []
    half = height * 0.5
    for z, radius in ((-half, lower_radius), (half, upper_radius)):
        for i in range(verts):
            angle = rotation_z + math.tau * i / verts
            vertices.append((math.cos(angle) * radius,
                             math.sin(angle) * radius, z))

    faces = [tuple(reversed(range(verts))),
             tuple(range(verts, verts * 2))]
    for i in range(verts):
        j = (i + 1) % verts
        faces.append((i, j, verts + j, verts + i))

    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    # The column is built along +Z. `rotation` is for the cases where a taper
    # points somewhere else -- a lamp hood on its side, a shell nose -- and it
    # defaults to no rotation, so every existing call site is unaffected.
    obj.rotation_euler = rotation
    mesh.materials.append(mat)
    if alternate_mat:
        mesh.materials.append(alternate_mat)
        # The first two polygons are the caps. Side faces alternate just
        # enough in value to describe rotation without a noisy stripe pattern.
        for i, polygon in enumerate(mesh.polygons[2:]):
            polygon.material_index = 1 if i % 2 else 0
    bevel(obj, width=0.010, segments=2)
    return obj


def ellipsoid(name, size, location, mat, parent, rotation=(0.0, 0.0, 0.0)):
    """A smooth solid for anatomy and cowl forms; `size` is final diameter."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8,
                                         radius=0.5,
                                         location=(0.0, 0.0, 0.0))
    obj = bpy.context.active_object
    obj.scale = size
    obj.name = name
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def torus(name, major_radius, minor_radius, location, rotation, mat, parent,
          major_segments=16, minor_segments=6):
    """A real ring, used where a flat glowing disc would read like a card."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius,
                                     minor_radius=minor_radius,
                                     major_segments=major_segments,
                                     minor_segments=minor_segments,
                                     location=(0.0, 0.0, 0.0))
    obj = bpy.context.active_object
    obj.name = name
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def tube(name, radius, start, end, mat, parent, verts=8):
    """Low-poly strut between two local-space points.

    Building a limb or a chain from correctly joined segments reads much more
    cleanly than a loose cylinder whose tilt only happened to face the right
    general direction.
    """
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    dz = end[2] - start[2]
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    horizontal = math.sqrt(dx * dx + dy * dy)
    return cyl(
        name, radius, length,
        location=((start[0] + end[0]) * 0.5,
                  (start[1] + end[1]) * 0.5,
                  (start[2] + end[2]) * 0.5),
        rotation=(0.0, math.atan2(horizontal, dz), math.atan2(dy, dx)),
        mat=mat, parent=parent, verts=verts)


# --- sheet rendering --------------------------------------------------------

def render_sheet(pivot, name, frames, directions=8, tile_w=96, tile_h=112,
                 frame_start=1, direction_rows=None):
    """Render `directions` yaw steps x `frames` animation frames into ONE PNG,
    laid out as a grid: direction per row, frame per column.

    One file per state keeps the loader trivial (row = direction, column =
    frame) and keeps the file count sane: 22 enemy types at 8 directions is
    176 sheets, not 1760 loose frames.

    Compositing is done here, in Blender's own bundled numpy, so the pipeline
    stays a single dependency."""
    scene_ref = bpy.context.scene
    # Very high-resolution 48-facing actors exceed conservative browser image
    # height limits if every facing is stacked in one column. Optional paging
    # keeps the exact same tiles in one PNG: later direction pages sit to the
    # right, with `frames` columns per page. The runtime receives the same row
    # count and uses the identical mapping when it samples the atlas.
    if direction_rows is None:
        direction_rows = directions
    direction_rows = max(1, min(int(direction_rows), directions))
    direction_pages = int(math.ceil(directions / float(direction_rows)))
    sheet = numpy.zeros((tile_h * direction_rows,
                         tile_w * frames * direction_pages, 4),
                        dtype=numpy.float32)

    # Each Blender process needs its own frame scratch file. Enemy sheets are
    # independent and are routinely regenerated in parallel; the old shared
    # `_tmp_frame.png` let one process truncate/delete the file while another
    # was loading it, producing intermittent zero-length frames or crashes.
    # Include both the sheet name and PID so parallel models and future nested
    # render jobs can never address the same temporary image.
    safe_name = (str(name).replace("/", "_").replace("\\", "_")
                 .replace(":", "_"))
    tmp = os.path.join(OUTPUT_DIR,
                       "_tmp_%s_%d.png" % (safe_name, os.getpid()))

    try:
        for d in range(directions):
            pivot.rotation_euler[2] = math.radians(360.0 * d / directions)
            for f in range(frames):
                scene_ref.frame_set(frame_start + f)
                scene_ref.render.filepath = tmp
                bpy.ops.render.render(write_still=True)

                img = bpy.data.images.load(tmp)
                pixels = numpy.empty(len(img.pixels), dtype=numpy.float32)
                img.pixels.foreach_get(pixels)
                # Blender hands back rows bottom-up; flip so the sheet reads
                # the way an image editor shows it.
                tile = pixels.reshape((tile_h * SUPERSAMPLE,
                                       tile_w * SUPERSAMPLE, 4))[::-1]
                atlas_row = d % direction_rows
                atlas_column = (d // direction_rows) * frames + f
                sheet[atlas_row * tile_h:(atlas_row + 1) * tile_h,
                      atlas_column * tile_w:(atlas_column + 1) * tile_w] = \
                    downsample(tile)
                bpy.data.images.remove(img)

        out = bpy.data.images.new(
            name, width=tile_w * frames * direction_pages,
            height=tile_h * direction_rows, alpha=True)
        out.pixels.foreach_set(sheet[::-1].ravel())
        out.filepath_raw = os.path.join(OUTPUT_DIR, name + ".png")
        out.file_format = "PNG"
        out.save()
    finally:
        # Failed renders are as important to clean as successful ones: the
        # unique name prevents collisions, while finally prevents abandoned
        # diagnostic frames accumulating across repeated art passes.
        if os.path.exists(tmp):
            os.remove(tmp)

    paging = ("; %d atlas pages x %d rows" %
              (direction_pages, direction_rows)) if direction_pages > 1 else ""
    print("wrote %s.png  (%d directions x %d frames, %dx%d tiles%s)"
          % (name, directions, frames, tile_w, tile_h, paging))
    report_content_box(sheet, name, tile_w, tile_h, directions, frames,
                       direction_rows)
    return out.filepath_raw


def downsample(tile):
    """Average a supersampled tile back to its final size.

    PREMULTIPLY BEFORE AVERAGING. Blender writes straight (non-premultiplied)
    alpha, so a transparent pixel still carries a colour -- usually black.
    Averaging straight RGBA drags every edge pixel toward that colour and
    leaves a dark fringe around the whole model, which on a dark board looks
    exactly like a bad cutout. Weighting colour by alpha, averaging, then
    dividing back out is the correct resolve."""
    if SUPERSAMPLE <= 1:
        return tile

    h = tile.shape[0] // SUPERSAMPLE
    w = tile.shape[1] // SUPERSAMPLE
    blocks = tile.reshape(h, SUPERSAMPLE, w, SUPERSAMPLE, 4)

    alpha = blocks[..., 3:4]
    premultiplied = blocks[..., :3] * alpha

    mean_alpha = alpha.mean(axis=(1, 3))
    mean_colour = premultiplied.mean(axis=(1, 3))

    out = numpy.zeros((h, w, 4), dtype=numpy.float32)
    safe = mean_alpha[..., 0] > 1e-6
    out[safe, :3] = mean_colour[safe] / mean_alpha[safe]
    out[..., 3] = mean_alpha[..., 0]
    return out


def report_content_box(sheet, name, tile_w, tile_h, directions, frames,
                       direction_rows=None):
    """Print where the model actually sits inside its tile.

    MEASURE, DO NOT ESTIMATE. Two numbers on the game side are derived from
    this and both are invisible when wrong in the subtle direction:
    `contentTop` decides where a health bar hangs, and `lift` decides whether
    the feet land on the path coordinate. Hand-computing them from ortho_scale
    and body height was wrong twice -- the animation moves the model after the
    geometry is authored, so the only honest source is the rendered alpha.

    Both are fractions of TILE HEIGHT, measured from the tile's bottom edge:
      contentTop     how far up the topmost opaque pixel reaches
      bottomMargin   empty space left under the lowest opaque pixel

    Copy them into js/skins/draw-pack.js whenever a model changes."""
    alpha = sheet[:, :, 3]
    if direction_rows is None:
        direction_rows = directions
    rows = numpy.zeros(tile_h, dtype=bool)
    edge_hits = []
    for d in range(directions):
        for f in range(frames):
            atlas_row = d % direction_rows
            atlas_column = (d // direction_rows) * frames + f
            tile = alpha[atlas_row * tile_h:(atlas_row + 1) * tile_h,
                         atlas_column * tile_w:(atlas_column + 1) * tile_w]
            opaque = tile > 0.03
            rows |= opaque.any(axis=1)
            # Three pixels is the minimum safe gutter after the 2x resolve.
            # Merely checking the combined content box missed per-facing and
            # per-animation clipping for years: one bad pose can touch an
            # edge while the aggregate numbers still look plausible.
            if (opaque[:3, :].any() or opaque[-3:, :].any() or
                    opaque[:, :3].any() or opaque[:, -3:].any()):
                edge_hits.append((d, f))

    filled = numpy.nonzero(rows)[0]
    if not len(filled):
        print("  WARNING: %s is entirely transparent" % name)
        return

    top, bottom = int(filled[0]), int(filled[-1])
    print("  content box: contentTop %.4f   bottomMargin %.4f   pivotY %.4f"
          % ((tile_h - top) / float(tile_h),
             (tile_h - 1 - bottom) / float(tile_h), ROOT_ANCHOR_Y))
    if edge_hits:
        sample = ", ".join("d%d/f%d" % pair for pair in edge_hits[:12])
        suffix = " ..." if len(edge_hits) > 12 else ""
        print("  WARNING: %d tile(s) touch the outer 3px gutter: %s%s"
              % (len(edge_hits), sample, suffix))
