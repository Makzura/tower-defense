# ---------------------------------------------------------------------------
# Enemy type `brute` -- a plated breach engine with 40 hp and 5 flat armour.
#
#     blender --background --python tools/blender/enemy_brute.py
#     blender --background --python tools/blender/enemy_brute.py -- --check-ground
#
# Writes assets/brute_walk.png and assets/brute_walk_shielded.png.
#
# The Brute is not a scaled-up Normal.  The Normal is a narrow collection
# frame; this is a low, broad machine built around a furnace and four slabs of
# armour.  Its tiny recessed head, gorilla arms, wide feet and overlapping
# shoulder shell survive the game's final downsample as one unmistakably
# heavy silhouette.  Every visible plate has thickness: there are no camera-
# facing cards, painted cut-outs, or details that only work from one row of
# the directional atlas.
#
# The shielded state is rendered from this exact same rig.  Three compact ley
# projectors are attached to the shoulder/back shell and merely wake up when a
# shield is present; the live game supplies the faint energy field.  Keeping
# the hardware small preserves the base design and avoids turning a crowd of
# shielded enemies into cyan bubbles.
#
# Built facing +X and spun by the root empty at render time.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import bpy
from mathutils import Vector
import td_scene as td


TILE_W = 128
TILE_H = 160
DIRECTIONS = 8
WALK_FRAMES = 8

# The body is physically larger than the Normal, while the slightly wider
# camera leaves safe gutters for the shoulder shell and swinging gauntlets.
# Runtime sizeScale still makes it the 1.5x threat on the board.
ORTHO_SCALE = 2.65

WALK_PHASES = (0.0, 0.5, 1.0, 0.5, 0.0, -0.5, -1.0, -0.5)
SUPPORT_LEFT_FRAMES = frozenset((1, 2, 7, 8))
LEG_L_REST = (0.0, 0.245, -0.22)
LEG_R_REST = (0.0, -0.245, -0.22)


def _plate(name, size, location, rotation, mat, parent):
    """A thick bevelled slab; kept as a helper so armour reads consistently."""
    return td.box(name, size, location=location, rotation=rotation,
                  mat=mat, parent=parent)


def build():
    """Return (direction root, animated body, parts, shield objects)."""
    tin = td.material("brute_tin", "tin", roughness=0.56, metallic=0.14)
    dark = td.material("brute_dark", "tin_dark", roughness=0.66,
                       metallic=0.10)
    char = td.material("brute_char", "char", roughness=0.74, metallic=0.04)
    brass = td.material("brute_brass", "brass", roughness=0.38,
                        metallic=0.42)
    furnace = td.material("brute_furnace", "core_red", emission=2.35,
                          roughness=0.30)
    furnace_hot = td.material("brute_furnace_hot", "core_amb", emission=3.4,
                              roughness=0.24)
    lens = td.material("brute_lens", "core_red", emission=4.0,
                       roughness=0.20)
    ley = td.material("brute_shield_ley", "ley", emission=3.1,
                      roughness=0.22)

    root = td.root("brute")
    body = td.root("brute_body")
    body.parent = root
    body.location = (0.0, 0.0, 0.78)

    # --- armoured hull -----------------------------------------------------
    # The dark inner block remains visible between plates, preventing the
    # broad torso from collapsing into one featureless grey rectangle.
    _plate("hull_inner", (0.62, 0.69, 0.56), (0.0, 0.0, 0.03),
           (0.0, math.radians(7.0), 0.0), dark, body)
    _plate("belly_keel", (0.48, 0.58, 0.22), (0.01, 0.0, -0.31),
           (0.0, math.radians(-5.0), 0.0), char, body)

    # Four overlapping plates give the hull depth in every facing.  The front
    # pair lean into the direction of travel like a battering ram; the rear
    # pair expose a darker centre line when viewed from behind.
    _plate("chest_plate_upper", (0.43, 0.73, 0.22), (0.245, 0.0, 0.19),
           (0.0, math.radians(18.0), 0.0), tin, body)
    _plate("chest_plate_lower", (0.39, 0.64, 0.19), (0.285, 0.0, -0.08),
           (0.0, math.radians(-9.0), 0.0), tin, body)
    _plate("back_plate_upper", (0.24, 0.62, 0.24), (-0.34, 0.0, 0.18),
           (0.0, math.radians(-12.0), 0.0), tin, body)
    _plate("back_plate_lower", (0.20, 0.54, 0.20), (-0.34, 0.0, -0.10),
           (0.0, math.radians(9.0), 0.0), dark, body)
    _plate("waist_band", (0.58, 0.72, 0.105), (0.0, 0.0, -0.245),
           (0.0, 0.0, 0.0), brass, body)
    _plate("waist_shadow", (0.50, 0.64, 0.075), (0.0, 0.0, -0.33),
           (0.0, 0.0, 0.0), char, body)

    # Shoulder shell: the main recognisable mass.  Centre bridge plus thick
    # angled caps reads as armour instead of two detached floating blocks.
    _plate("shoulder_bridge", (0.52, 0.88, 0.16), (-0.015, 0.0, 0.365),
           (0.0, math.radians(5.0), 0.0), dark, body)
    _plate("pauldron_l_inner", (0.42, 0.28, 0.24), (0.015, 0.405, 0.31),
           (math.radians(-11.0), math.radians(5.0), 0.0), tin, body)
    _plate("pauldron_r_inner", (0.42, 0.28, 0.24), (0.015, -0.405, 0.31),
           (math.radians(11.0), math.radians(5.0), 0.0), tin, body)
    _plate("pauldron_l_outer", (0.34, 0.24, 0.19), (0.01, 0.555, 0.255),
           (math.radians(-18.0), math.radians(2.0), 0.0), dark, body)
    _plate("pauldron_r_outer", (0.34, 0.24, 0.19), (0.01, -0.555, 0.255),
           (math.radians(18.0), math.radians(2.0), 0.0), dark, body)
    _plate("pauldron_l_brow", (0.30, 0.20, 0.07), (0.10, 0.535, 0.405),
           (math.radians(-15.0), math.radians(6.0), 0.0), brass, body)
    _plate("pauldron_r_brow", (0.30, 0.20, 0.07), (0.10, -0.535, 0.405),
           (math.radians(15.0), math.radians(6.0), 0.0), brass, body)

    # --- furnace -----------------------------------------------------------
    # The family accent is a contained stolen-energy source, but a Brute burns
    # it in a protected slit rather than carrying Normal's exposed round cage.
    td.cyl("furnace_housing", 0.165, 0.09, location=(0.445, 0.0, 0.035),
           rotation=(0.0, math.radians(90.0), 0.0), mat=char, parent=body,
           verts=16)
    td.cyl("furnace_glow", 0.112, 0.045, location=(0.505, 0.0, 0.035),
           rotation=(0.0, math.radians(90.0), 0.0), mat=furnace, parent=body,
           verts=16)
    _plate("furnace_guard_v", (0.032, 0.035, 0.265), (0.538, 0.0, 0.035),
           (0.0, 0.0, 0.0), dark, body)
    _plate("furnace_guard_h", (0.032, 0.255, 0.035), (0.538, 0.0, 0.035),
           (0.0, 0.0, 0.0), dark, body)
    td.ball("furnace_heart", 0.048, location=(0.555, 0.0, 0.035),
            mat=furnace_hot, parent=body)

    # Two real exhaust stacks make the rear view legible.  They are cylinders
    # with collars and capped mouths, not texture strips.
    for side, y in (("l", 0.205), ("r", -0.205)):
        td.cyl("exhaust_%s" % side, 0.055, 0.34,
               location=(-0.29, y, 0.48),
               rotation=(0.0, math.radians(-8.0), 0.0), mat=dark,
               parent=body, verts=12)
        td.cyl("exhaust_collar_%s" % side, 0.075, 0.065,
               location=(-0.315, y, 0.64),
               rotation=(0.0, math.radians(-8.0), 0.0), mat=brass,
               parent=body, verts=12)
        td.cyl("exhaust_mouth_%s" % side, 0.061, 0.025,
               location=(-0.326, y, 0.68),
               rotation=(0.0, math.radians(-8.0), 0.0), mat=char,
               parent=body, verts=12)

    # --- buried head -------------------------------------------------------
    # A small head between huge shoulders keeps the silhouette mechanical and
    # makes its threat come from mass rather than humanoid height.
    td.cyl("neck_piston", 0.085, 0.16, location=(0.055, 0.0, 0.48),
           mat=dark, parent=body, verts=12)
    _plate("helmet", (0.30, 0.30, 0.22), (0.09, 0.0, 0.57),
           (0.0, math.radians(10.0), 0.0), tin, body)
    _plate("helmet_brow", (0.17, 0.32, 0.07), (0.225, 0.0, 0.595),
           (0.0, math.radians(13.0), 0.0), dark, body)
    td.cyl("visor_socket", 0.074, 0.07, location=(0.257, 0.0, 0.555),
           rotation=(0.0, math.radians(90.0), 0.0), mat=char, parent=body,
           verts=12)
    td.ball("visor", 0.049, location=(0.301, 0.0, 0.555),
            mat=lens, parent=body)

    # --- gorilla arms ------------------------------------------------------
    # Upper arms are mostly hidden beneath the shell; enormous two-piece
    # gauntlets hang below the waist and counter-swing only a few degrees.
    arms = {}
    for side, y, sign in (("l", 0.535, 1.0), ("r", -0.535, -1.0)):
        arm = td.root("arm_%s" % side)
        arm.parent = body
        arm.location = (-0.015, y, 0.21)
        td.cyl("shoulder_axle_%s" % side, 0.11, 0.16,
               location=(0.0, 0.0, 0.0),
               rotation=(math.radians(90.0), 0.0, 0.0), mat=dark,
               parent=arm, verts=12)
        _plate("upper_arm_%s" % side, (0.19, 0.20, 0.34),
               (0.01, sign * 0.025, -0.19),
               (math.radians(-sign * 4.0), 0.0, 0.0), tin, arm)
        td.cyl("elbow_%s" % side, 0.105, 0.19,
               location=(0.015, sign * 0.025, -0.365),
               rotation=(math.radians(90.0), 0.0, 0.0), mat=brass,
               parent=arm, verts=12)
        _plate("forearm_%s" % side, (0.27, 0.25, 0.34),
               (0.095, sign * 0.02, -0.49),
               (0.0, math.radians(-8.0), math.radians(-sign * 2.0)),
               dark, arm)
        _plate("gauntlet_%s" % side, (0.34, 0.30, 0.22),
               (0.18, sign * 0.02, -0.68),
               (0.0, math.radians(-5.0), 0.0), tin, arm)
        _plate("knuckle_%s" % side, (0.15, 0.32, 0.10),
               (0.33, sign * 0.02, -0.68),
               (0.0, 0.0, 0.0), brass, arm)
        arms[side] = arm

    # --- short, overbuilt legs --------------------------------------------
    legs = {}
    for side, rest, sign in (("l", LEG_L_REST, 1.0),
                             ("r", LEG_R_REST, -1.0)):
        leg = td.root("leg_%s" % side)
        leg.parent = body
        leg.location = rest
        td.cyl("hip_%s" % side, 0.13, 0.19,
               location=(0.0, 0.0, 0.0),
               rotation=(math.radians(90.0), 0.0, 0.0), mat=dark,
               parent=leg, verts=12)
        _plate("thigh_%s" % side, (0.24, 0.23, 0.28),
               (-0.015, 0.0, -0.15), (0.0, math.radians(2.0), 0.0),
               tin, leg)
        td.cyl("knee_%s" % side, 0.125, 0.21,
               location=(0.015, 0.0, -0.30),
               rotation=(math.radians(90.0), 0.0, 0.0), mat=brass,
               parent=leg, verts=12)
        _plate("shin_%s" % side, (0.25, 0.22, 0.26),
               (-0.005, 0.0, -0.41), (0.0, math.radians(-3.0), 0.0),
               dark, leg)
        _plate("shin_guard_%s" % side, (0.16, 0.24, 0.22),
               (0.12, 0.0, -0.405), (0.0, math.radians(4.0), 0.0),
               tin, leg)
        _plate("foot_%s" % side, (0.43, 0.28, 0.14),
               (0.105, 0.0, -0.49), (0.0, math.radians(-2.0), 0.0),
               char, leg)
        _plate("toe_%s" % side, (0.20, 0.30, 0.105),
               (0.31, 0.0, -0.475), (0.0, math.radians(-3.0), 0.0),
               brass, leg)
        legs[side] = leg

    # --- optional shield projectors ---------------------------------------
    # Only these objects are hidden for the base render.  Their parents are
    # the animated body, so shielded and unshielded pixels cannot drift.
    shield_objects = []

    def shield_box(name, size, location, rotation=(0.0, 0.0, 0.0), mat=dark):
        obj = _plate(name, size, location, rotation, mat, body)
        shield_objects.append(obj)
        return obj

    def shield_cyl(name, radius, depth, location, rotation, mat):
        obj = td.cyl(name, radius, depth, location=location,
                     rotation=rotation, mat=mat, parent=body, verts=12)
        shield_objects.append(obj)
        return obj

    # Side nodes are mounted into, not on top of, the pauldron silhouette.
    for side, y, sign in (("l", 0.665, 1.0), ("r", -0.665, -1.0)):
        shield_box("shield_mount_%s" % side, (0.20, 0.11, 0.14),
                   (-0.015, y, 0.30),
                   (math.radians(-sign * 12.0), 0.0, 0.0))
        shield_cyl("shield_ring_%s" % side, 0.073, 0.055,
                   (-0.01, y + sign * 0.07, 0.31),
                   (math.radians(90.0), 0.0, 0.0), brass)
        shield_cyl("shield_node_%s" % side, 0.045, 0.066,
                   (-0.01, y + sign * 0.102, 0.31),
                   (math.radians(90.0), 0.0, 0.0), ley)

    # Rear crown makes the state readable head-on and from the back without a
    # fourth pair of bright side dots.
    shield_box("shield_mount_rear", (0.12, 0.23, 0.12),
               (-0.445, 0.0, 0.37), (0.0, math.radians(-8.0), 0.0))
    shield_cyl("shield_ring_rear", 0.072, 0.055,
               (-0.515, 0.0, 0.385),
               (0.0, math.radians(90.0), 0.0), brass)
    shield_cyl("shield_node_rear", 0.045, 0.068,
               (-0.548, 0.0, 0.385),
               (0.0, math.radians(90.0), 0.0), ley)

    parts = {
        "arm_l": arms["l"], "arm_r": arms["r"],
        "leg_l": legs["l"], "leg_r": legs["r"]
    }
    set_shield_visible(shield_objects, False)
    return root, body, parts, shield_objects


def key(obj, frame, rotation=None, location=None):
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert("rotation_euler", frame=frame)
    if location is not None:
        obj.location = location
        obj.keyframe_insert("location", frame=frame)


def _foot_measure(name):
    bpy.context.view_layer.update()
    foot = bpy.data.objects[name]
    corners = [foot.matrix_world @ Vector(corner) for corner in foot.bound_box]
    return min(point.z for point in corners), foot.matrix_world.translation.x


def _set_sole_height(leg, foot_name, frame, target_z):
    bpy.context.scene.frame_set(frame)
    bottom_z, _ = _foot_measure(foot_name)
    local_up_world_z = (
        leg.parent.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))
    ).z
    location = leg.location.copy()
    location.z += (target_z - bottom_z) / local_up_world_z
    key(leg, frame, location=location)
    bpy.context.scene.frame_set(frame)


def animate_walk(body, parts, frames):
    """A slow compression-heavy march with an evaluated planted sole."""
    base_z = body.location[2]
    leg_l_rest = tuple(parts["leg_l"].location)
    leg_r_rest = tuple(parts["leg_r"].location)
    leg_swing = math.radians(17.0)
    arm_swing = math.radians(7.0)

    for f in range(frames):
        frame = f + 1
        phase = WALK_PHASES[f % len(WALK_PHASES)]
        # The secondary half-step gives the shoulders a delayed settle.  It is
        # deliberately tiny: a tank this heavy should not bounce like Normal.
        settle = math.sin(2.0 * math.pi * f / frames)

        key(parts["leg_l"], frame,
            rotation=(0.0, leg_swing * phase, 0.0), location=leg_l_rest)
        key(parts["leg_r"], frame,
            rotation=(0.0, -leg_swing * phase, 0.0), location=leg_r_rest)
        key(parts["arm_l"], frame,
            rotation=(0.0, -arm_swing * phase, math.radians(-1.5) * settle))
        key(parts["arm_r"], frame,
            rotation=(0.0, arm_swing * phase, math.radians(1.5) * settle))
        key(body, frame,
            location=(0.0, 0.0,
                      base_z - 0.043 * abs(phase) - 0.008 * abs(settle)),
            rotation=(math.radians(1.8) * phase,
                      math.radians(-1.1) * abs(phase), 0.0))

    for f in range(frames):
        frame = f + 1
        t = 2.0 * math.pi * f / frames
        # The recovery foot only just clears the floor; the broad sole and
        # deliberate drag make each step feel loaded rather than nimble.
        swing_z = 0.012 + 0.036 * abs(math.cos(t))
        if frame in SUPPORT_LEFT_FRAMES:
            _set_sole_height(parts["leg_l"], "foot_l", frame, 0.0)
            _set_sole_height(parts["leg_r"], "foot_r", frame, swing_z)
        else:
            _set_sole_height(parts["leg_r"], "foot_r", frame, 0.0)
            _set_sole_height(parts["leg_l"], "foot_l", frame, swing_z)


def set_shield_visible(shield_objects, visible):
    for obj in shield_objects:
        obj.hide_render = not visible
        obj.hide_viewport = not visible


def report_walk_grounding():
    td.scene(ortho_scale=ORTHO_SCALE, tile_w=TILE_W, tile_h=TILE_H)
    _root, body, parts, shield_objects = build()
    set_shield_visible(shield_objects, False)
    animate_walk(body, parts, WALK_FRAMES)

    stance_bottoms = []
    swing_bottoms = []
    for frame in range(1, WALK_FRAMES + 1):
        bpy.context.scene.frame_set(frame)
        left_z, left_x = _foot_measure("foot_l")
        right_z, right_x = _foot_measure("foot_r")
        stance = "L" if frame in SUPPORT_LEFT_FRAMES else "R"
        stance_z = left_z if stance == "L" else right_z
        swing_z = right_z if stance == "L" else left_z
        stance_bottoms.append(stance_z)
        swing_bottoms.append(swing_z)
        print("GROUND frame=%d stance=%s left_z=%+.6f right_z=%+.6f "
              "left_x=%+.6f right_x=%+.6f" %
              (frame, stance, left_z, right_z, left_x, right_x))

    print("GROUND_SUMMARY max_stance_error=%.8f min_swing_clearance=%.6f" %
          (max(abs(z) for z in stance_bottoms), min(swing_bottoms)))


def main():
    td.scene(ortho_scale=ORTHO_SCALE, tile_w=TILE_W, tile_h=TILE_H)
    root, body, parts, shield_objects = build()
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = WALK_FRAMES
    animate_walk(body, parts, WALK_FRAMES)

    if not os.path.isdir(td.OUTPUT_DIR):
        os.makedirs(td.OUTPUT_DIR)

    set_shield_visible(shield_objects, False)
    td.render_sheet(root, "brute_walk", WALK_FRAMES, directions=DIRECTIONS,
                    tile_w=TILE_W, tile_h=TILE_H, frame_start=1)

    set_shield_visible(shield_objects, True)
    td.render_sheet(root, "brute_walk_shielded", WALK_FRAMES,
                    directions=DIRECTIONS, tile_w=TILE_W, tile_h=TILE_H,
                    frame_start=1)

if __name__ == "__main__":
    if "--check-ground" in sys.argv:
        report_walk_grounding()
    else:
        main()
