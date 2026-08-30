# ---------------------------------------------------------------------------
# Hive enemy -- a walking brood foundry.
#
# The Hive has to explain its rule before the codex does: it is a slow carrier
# with living cargo, and that cargo is about to become more enemies.  The large
# faceted incubator, repeated warm brood windows and rear hatch do that work;
# six weight-bearing legs keep it from reading as another upright robot.
#
# Built facing +X and spun at render time.  The shielded sheet is rendered from
# the exact same rig and animation.  It only reveals four compact projector
# nodes; the runtime owns the energy field, so the base silhouette stays clear.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
import td_scene as td


TILE_W = 128
TILE_H = 160
DIRECTIONS = 8
WALK_FRAMES = 8

# A Hive is broad and low. Ground-plane depth projects below the fixed 0.86
# world-origin pivot, so the framing accounts for the *radial* reach of the
# six feet, not just the model's height. The chassis is compact enough that
# 3.26 preserves source resolution while retaining the required 3 px gutter.
ORTHO_SCALE = 3.26

WALK_PHASES = (0.0, 0.5, 1.0, 0.5, 0.0, -0.5, -1.0, -0.5)
SUPPORT_A_FRAMES = frozenset((1, 2, 7, 8))

# Tripod gait: front-left, middle-right and rear-left bear weight together.
TRIPOD_A = ("leg_fl", "leg_mr", "leg_rl")
TRIPOD_B = ("leg_fr", "leg_ml", "leg_rr")

LEG_RESTS = {
    "leg_fl": (0.29, 0.20, -0.01),
    "leg_fr": (0.29, -0.20, -0.01),
    "leg_ml": (0.00, 0.22, -0.03),
    "leg_mr": (0.00, -0.22, -0.03),
    "leg_rl": (-0.30, 0.20, -0.01),
    "leg_rr": (-0.30, -0.20, -0.01),
}


def scaled_ball(name, radius, scale, location, mat, parent):
    obj = td.ball(name, radius, location=location, mat=mat, parent=parent)
    obj.scale = scale
    return obj


def strut(name, start, end, radius, mat, parent, verts=8):
    """A dimensional cylinder joining two local points."""
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    midpoint = (a + b) * 0.5
    rotation = direction.to_track_quat("Z", "Y").to_euler()
    return td.cyl(name, radius, direction.length,
                  location=tuple(midpoint), rotation=rotation,
                  mat=mat, parent=parent, verts=verts)


def build_leg(name, side, x, body, tin, tin_dark, brass):
    """One two-bone leg, assembled in local space around its shoulder."""
    leg = td.root(name)
    leg.parent = body
    leg.matrix_parent_inverse.identity()
    leg.location = LEG_RESTS[name]

    # The three pairs do not share an identical outline.  Front feet reach
    # forward, rear feet brace backward, and the middle pair spreads widest.
    fore = 0.065 if x > 0.1 else (-0.060 if x < -0.1 else 0.0)
    knee = (fore * 0.45, side * 0.14, -0.22)
    ankle = (fore, side * (0.25 if abs(x) < 0.1 else 0.22), -0.62)

    td.cyl(name + "_shoulder", 0.085, 0.10,
           rotation=(math.radians(90.0), 0.0, 0.0),
           mat=tin_dark, parent=leg, verts=12)
    strut(name + "_upper", (0.0, 0.0, 0.0), knee,
           0.058, tin, leg)
    td.ball(name + "_knee", 0.078, location=knee,
            mat=brass, parent=leg)
    strut(name + "_lower", knee, ankle,
           0.052, tin_dark, leg)

    # Broad pads survive the final downsample and visibly make contact.  The
    # toe follows +X even on side legs so the walk direction stays legible.
    td.box("foot_" + name, (0.19, 0.13, 0.065),
           location=(ankle[0] + 0.047, ankle[1], ankle[2] - 0.018),
           rotation=(0.0, math.radians(-4.0), 0.0),
           mat=tin_dark, parent=leg)
    td.box(name + "_toe_cap", (0.09, 0.105, 0.078),
           location=(ankle[0] + 0.125, ankle[1], ankle[2] - 0.010),
           mat=tin, parent=leg)
    return leg


def add_shield_projector(name, location, axis, outward, body,
                         tin_dark, brass, ley, shield_objects):
    """Add one small, body-mounted shield node and remember its meshes."""
    before = set(bpy.data.objects)
    if axis == "x":
        rotation = (0.0, math.radians(90.0), 0.0)
        mount_location = location
        tip_location = (location[0] + outward * 0.070,
                        location[1], location[2])
    else:
        rotation = (math.radians(90.0), 0.0, 0.0)
        mount_location = location
        tip_location = (location[0],
                        location[1] + outward * 0.070, location[2])

    td.cyl(name + "_mount", 0.070, 0.085,
           location=mount_location, rotation=rotation,
           mat=tin_dark, parent=body, verts=12)
    td.cyl(name + "_collar", 0.052, 0.095,
           location=mount_location, rotation=rotation,
           mat=brass, parent=body, verts=12)
    td.ball(name + "_node", 0.040, location=tip_location,
            mat=ley, parent=body)
    shield_objects.extend(obj for obj in bpy.data.objects if obj not in before)


def build():
    """Return the directional root, animated body and named moving parts."""
    tin = td.material("hive_tin", "tin", roughness=0.61, metallic=0.13)
    tin_dark = td.material("hive_dark", "tin_dark",
                           roughness=0.70, metallic=0.08)
    brass = td.material("hive_brass", "brass",
                        roughness=0.38, metallic=0.42)
    brood = td.material("hive_brood", "core_amb",
                        emission=1.45, roughness=0.30)
    brood_hot = td.material("hive_brood_hot", "core_red",
                            emission=2.25, roughness=0.26)
    eye = td.material("hive_eye", "core_red",
                      emission=3.8, roughness=0.20)
    ley = td.material("hive_shield_ley", "ley",
                      emission=3.1, roughness=0.20)

    root = td.root("hive")
    body = td.root("hive_body")
    body.parent = root
    body.matrix_parent_inverse.identity()
    body.location = (0.0, 0.0, 0.69)

    # --- load-bearing undercarriage ---------------------------------------
    td.box("hive_keel", (0.83, 0.49, 0.20),
           location=(-0.02, 0.0, -0.07), mat=tin_dark, parent=body)
    td.box("hive_belly_plate", (0.62, 0.55, 0.11),
           location=(-0.03, 0.0, 0.035), mat=brass, parent=body)
    td.box("hive_front_bulkhead", (0.17, 0.58, 0.31),
           location=(0.38, 0.0, 0.10),
           rotation=(0.0, math.radians(-7.0), 0.0),
           mat=tin, parent=body)
    td.box("hive_rear_bulkhead", (0.15, 0.57, 0.32),
           location=(-0.41, 0.0, 0.12),
           rotation=(0.0, math.radians(8.0), 0.0),
           mat=tin, parent=body)

    # --- brood chamber ----------------------------------------------------
    # A dark swollen chamber provides volume. Thick overlapping roof plates
    # turn the sphere into manufactured armour rather than a soft blob.
    scaled_ball("hive_incubator", 0.50, (1.04, 0.79, 0.76),
                (-0.08, 0.0, 0.27), tin_dark, body)
    td.box("hive_roof_spine", (0.70, 0.22, 0.13),
           location=(-0.09, 0.0, 0.59), mat=brass, parent=body)
    td.box("hive_roof_left", (0.66, 0.31, 0.13),
           location=(-0.08, 0.245, 0.49),
           rotation=(math.radians(24.0), 0.0, 0.0),
           mat=tin, parent=body)
    td.box("hive_roof_right", (0.66, 0.31, 0.13),
           location=(-0.08, -0.245, 0.49),
           rotation=(math.radians(-24.0), 0.0, 0.0),
           mat=tin, parent=body)
    td.box("hive_fore_shell", (0.20, 0.56, 0.42),
           location=(0.30, 0.0, 0.32),
           rotation=(0.0, math.radians(-9.0), 0.0),
           mat=tin, parent=body)
    td.box("hive_aft_shell", (0.19, 0.55, 0.40),
           location=(-0.43, 0.0, 0.31),
           rotation=(0.0, math.radians(10.0), 0.0),
           mat=tin, parent=body)

    # Five visible embryo cells echo the five hatchlings emitted by the
    # actual enemy. Each glow is recessed into a dark socket and crossed by a
    # substantial retaining bar, avoiding the pasted-on-light look.
    cell_x = (-0.29, -0.05, 0.19)
    for side, suffix in ((1.0, "l"), (-1.0, "r")):
        y_shell = side * 0.397
        y_glow = side * 0.423
        for index, x in enumerate(cell_x):
            name = "brood_%s_%d" % (suffix, index)
            td.cyl(name + "_socket", 0.105, 0.052,
                   location=(x, y_shell, 0.28),
                   rotation=(math.radians(90.0), 0.0, 0.0),
                   mat=tin_dark, parent=body, verts=12)
            td.ball(name + "_cell", 0.070,
                    location=(x, y_glow, 0.28), mat=brood, parent=body)
            td.box(name + "_bar", (0.026, 0.025, 0.175),
                   location=(x, side * 0.449, 0.28),
                   mat=tin_dark, parent=body)

    # The fifth brood cell sits in the rear hatch where it remains visible in
    # rear-facing rows and turns the hatch into an active birth aperture.
    td.cyl("hive_hatch_housing", 0.205, 0.12,
           location=(-0.555, 0.0, 0.27),
           rotation=(0.0, math.radians(90.0), 0.0),
           mat=tin_dark, parent=body, verts=12)
    td.cyl("hive_hatch_glow", 0.128, 0.045,
           location=(-0.625, 0.0, 0.27),
           rotation=(0.0, math.radians(90.0), 0.0),
           mat=brood_hot, parent=body, verts=12)
    for angle in (0.0, math.pi * 0.5):
        td.box("hive_hatch_guard_%d" % int(angle * 10),
               (0.035, 0.33, 0.035),
               location=(-0.660, 0.0, 0.27),
               rotation=(angle, 0.0, 0.0),
               mat=tin_dark, parent=body)

    # Coarse ribs bind the chamber together. They are broad enough to remain
    # geometry after reduction rather than turning into one-pixel scratches.
    for index, x in enumerate((-0.32, -0.08, 0.16)):
        td.cyl("hive_rib_%d" % index, 0.425, 0.050,
               location=(x, 0.0, 0.27),
               rotation=(0.0, math.radians(90.0), 0.0),
               mat=brass if index == 1 else tin_dark,
               parent=body, verts=12)

    # --- low sensor head --------------------------------------------------
    # It is deliberately much smaller than the incubator: this is a carrier,
    # not a large humanoid with a backpack.
    td.box("hive_neck", (0.18, 0.24, 0.15),
           location=(0.48, 0.0, 0.13),
           rotation=(0.0, math.radians(-14.0), 0.0),
           mat=tin_dark, parent=body)
    td.box("hive_head", (0.28, 0.31, 0.20),
           location=(0.57, 0.0, 0.20),
           rotation=(0.0, math.radians(-8.0), 0.0),
           mat=tin, parent=body)
    td.box("hive_brow", (0.09, 0.34, 0.075),
           location=(0.69, 0.0, 0.245),
           rotation=(0.0, math.radians(-8.0), 0.0),
           mat=tin_dark, parent=body)
    td.box("hive_eye_slit", (0.030, 0.205, 0.050),
           location=(0.725, 0.0, 0.205), mat=eye, parent=body)
    td.box("hive_mandible_l", (0.18, 0.055, 0.065),
           location=(0.70, 0.12, 0.075),
           rotation=(0.0, math.radians(-12.0), math.radians(-10.0)),
           mat=tin_dark, parent=body)
    td.box("hive_mandible_r", (0.18, 0.055, 0.065),
           location=(0.70, -0.12, 0.075),
           rotation=(0.0, math.radians(-12.0), math.radians(10.0)),
           mat=tin_dark, parent=body)

    # --- six-legged tripod chassis ---------------------------------------
    parts = {}
    for name, x, side in (
            ("leg_fl", 0.34, 1.0), ("leg_fr", 0.34, -1.0),
            ("leg_ml", 0.00, 1.0), ("leg_mr", 0.00, -1.0),
            ("leg_rl", -0.35, 1.0), ("leg_rr", -0.35, -1.0)):
        parts[name] = build_leg(name, side, x, body, tin, tin_dark, brass)

    # Shield projectors are intentionally sparse. Their cyan nodes announce
    # the state while the pod, brood windows and six-leg outline remain the
    # same design the player already recognizes.
    shield_objects = []
    add_shield_projector("shield_fore", (0.720, 0.0, 0.40),
                         "x", 1.0, body, tin_dark, brass, ley,
                         shield_objects)
    add_shield_projector("shield_aft", (-0.585, 0.0, 0.51),
                         "x", -1.0, body, tin_dark, brass, ley,
                         shield_objects)
    add_shield_projector("shield_left", (-0.10, 0.425, 0.56),
                         "y", 1.0, body, tin_dark, brass, ley,
                         shield_objects)
    add_shield_projector("shield_right", (-0.10, -0.425, 0.56),
                         "y", -1.0, body, tin_dark, brass, ley,
                         shield_objects)
    parts["shield_objects"] = shield_objects
    set_shield_visible(parts, False)

    return root, body, parts


def key(obj, frame, rotation=None, location=None):
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert("rotation_euler", frame=frame)
    if location is not None:
        obj.location = location
        obj.keyframe_insert("location", frame=frame)


def foot_measure(leg_name):
    bpy.context.view_layer.update()
    foot = bpy.data.objects["foot_" + leg_name]
    corners = [foot.matrix_world @ Vector(corner) for corner in foot.bound_box]
    return min(point.z for point in corners), foot.matrix_world.translation.x


def set_sole_height(leg, leg_name, frame, target_z):
    bpy.context.scene.frame_set(frame)
    bottom_z, _ = foot_measure(leg_name)
    local_up_world_z = (
        leg.parent.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))
    ).z
    location = leg.location.copy()
    location.z += (target_z - bottom_z) / local_up_world_z
    key(leg, frame, location=location)
    bpy.context.scene.frame_set(frame)


def animate_walk(body, parts, frames):
    """Eight authored samples of a planted, antiphase tripod walk."""
    base_z = body.location.z
    swing = math.radians(8.0)

    for sample in range(frames):
        frame = sample + 1
        phase = WALK_PHASES[sample]
        support_a = frame in SUPPORT_A_FRAMES

        # A slight pitching weight transfer makes the incubator feel massive
        # without allowing the cargo to wobble independently of its chassis.
        key(body, frame,
            location=(0.0, 0.0, base_z - 0.022 * abs(phase)),
            rotation=(math.radians(1.7) * phase,
                      math.radians(1.4) * phase, 0.0))

        for name in TRIPOD_A + TRIPOD_B:
            leg_phase = phase if name in TRIPOD_A else -phase
            # Middle legs have a slightly shorter stride and retain the wide
            # stabilizing outline throughout the cycle.
            amount = 0.78 if name[4] == "m" else 1.0
            key(parts[name], frame,
                rotation=(0.0, swing * leg_phase * amount, 0.0),
                location=LEG_RESTS[name])

        # At least three feet are mathematically on z=0 on every sample. The
        # recovering tripod clears the ground most at mid-swing.
        swing_z = 0.022 + 0.060 * abs(phase)
        support = TRIPOD_A if support_a else TRIPOD_B
        recovery = TRIPOD_B if support_a else TRIPOD_A
        for name in support:
            set_sole_height(parts[name], name, frame, 0.0)
        for name in recovery:
            set_sole_height(parts[name], name, frame, swing_z)


def set_shield_visible(parts, visible):
    for obj in parts["shield_objects"]:
        obj.hide_render = not visible
        obj.hide_viewport = not visible


def report_walk_grounding():
    td.scene(ortho_scale=ORTHO_SCALE, tile_w=TILE_W, tile_h=TILE_H)
    _root, body, parts = build()
    animate_walk(body, parts, WALK_FRAMES)

    support_bottoms = []
    recovery_bottoms = []
    for frame in range(1, WALK_FRAMES + 1):
        bpy.context.scene.frame_set(frame)
        support = TRIPOD_A if frame in SUPPORT_A_FRAMES else TRIPOD_B
        values = {name: foot_measure(name)[0]
                  for name in TRIPOD_A + TRIPOD_B}
        support_bottoms.extend(values[name] for name in support)
        recovery_bottoms.extend(values[name] for name in values
                                if name not in support)
        print("GROUND frame=%d support=%s %s" %
              (frame, "A" if support is TRIPOD_A else "B",
               " ".join("%s=%+.6f" % (name, values[name])
                        for name in TRIPOD_A + TRIPOD_B)))

    print("GROUND_SUMMARY max_support_error=%.8f "
          "min_recovery_clearance=%.6f" %
          (max(abs(value) for value in support_bottoms),
           min(recovery_bottoms)))


def report_projection_bounds():
    """Measure animated mesh bounds in camera space without rendering."""
    td.scene(ortho_scale=ORTHO_SCALE, tile_w=TILE_W, tile_h=TILE_H)
    root, body, parts = build()
    animate_walk(body, parts, WALK_FRAMES)
    set_shield_visible(parts, True)

    scene = bpy.context.scene
    camera = scene.camera
    limits = [1.0, 1.0, 0.0, 0.0]
    worst = None
    for direction in range(DIRECTIONS):
        root.rotation_euler.z = math.radians(360.0 * direction / DIRECTIONS)
        for frame in range(1, WALK_FRAMES + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            depsgraph = bpy.context.evaluated_depsgraph_get()
            tile_limits = [1.0, 1.0, 0.0, 0.0]
            for obj in scene.objects:
                if obj.type != "MESH" or obj.hide_render:
                    continue
                evaluated = obj.evaluated_get(depsgraph)
                for corner in evaluated.bound_box:
                    world = evaluated.matrix_world @ Vector(corner)
                    point = world_to_camera_view(scene, camera, world)
                    tile_limits[0] = min(tile_limits[0], point.x)
                    tile_limits[1] = min(tile_limits[1], point.y)
                    tile_limits[2] = max(tile_limits[2], point.x)
                    tile_limits[3] = max(tile_limits[3], point.y)
            for index in range(4):
                if index < 2:
                    limits[index] = min(limits[index], tile_limits[index])
                else:
                    limits[index] = max(limits[index], tile_limits[index])
            nearest = min(tile_limits[0] * TILE_W,
                          tile_limits[1] * TILE_H,
                          (1.0 - tile_limits[2]) * TILE_W,
                          (1.0 - tile_limits[3]) * TILE_H)
            if worst is None or nearest < worst[0]:
                worst = (nearest, direction, frame, tuple(tile_limits))

    print("PROJECTION x=[%.5f, %.5f] y=[%.5f, %.5f] pixels="
          "left %.2f right %.2f bottom %.2f top %.2f" %
          (limits[0], limits[2], limits[1], limits[3],
           limits[0] * TILE_W, (1.0 - limits[2]) * TILE_W,
           limits[1] * TILE_H, (1.0 - limits[3]) * TILE_H))
    print("PROJECTION_WORST gutter=%.2fpx direction=%d frame=%d bounds=%s" %
          worst)


def main():
    td.scene(ortho_scale=ORTHO_SCALE, tile_w=TILE_W, tile_h=TILE_H)
    root, body, parts = build()
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = WALK_FRAMES
    animate_walk(body, parts, WALK_FRAMES)

    if not os.path.isdir(td.OUTPUT_DIR):
        os.makedirs(td.OUTPUT_DIR)

    set_shield_visible(parts, False)
    td.render_sheet(root, "hive_walk", WALK_FRAMES,
                    directions=DIRECTIONS, tile_w=TILE_W, tile_h=TILE_H,
                    frame_start=1)
    set_shield_visible(parts, True)
    td.render_sheet(root, "hive_walk_shielded", WALK_FRAMES,
                    directions=DIRECTIONS, tile_w=TILE_W, tile_h=TILE_H,
                    frame_start=1)


if __name__ == "__main__":
    if "--check-ground" in sys.argv:
        report_walk_grounding()
    elif "--check-bounds" in sys.argv:
        report_projection_bounds()
    else:
        main()
