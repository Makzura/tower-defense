# ---------------------------------------------------------------------------
# Directional Swarm enemy source.
#
# The Swarm is the game's smallest and fastest body.  It therefore spends its
# polygon budget on a low, forked outline and six broad feet instead of on
# surface noise.  The result is a scavenger-tick silhouette that survives the
# runtime's 0.55 size multiplier and still belongs beside the Normal's stamped
# tin, brass repairs and caged red mana.
#
# Built facing +X.  td_scene spins the root for the eight atlas rows.  The
# shielded sheet is rendered from the identical rig and keys: four tiny ley
# projector studs are only toggled with hide_render, so changing shield state
# cannot make the creature jump by a pixel.
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

# Tight enough that a 0.55-scale runtime sprite still has a readable body,
# while retaining a safe gutter for the six feet at diagonal facings.
ORTHO_SCALE = 1.50

LEG_ROWS = (
    ("front", 0.080, 0.035),
    ("middle", -0.005, 0.005),
    ("rear", -0.085, -0.035),
)


def beam(name, start, end, radius, mat, parent, verts=8):
    """Make a chunky local-space strut between two points."""
    start_v = Vector(start)
    end_v = Vector(end)
    vector = end_v - start_v
    middle = (start_v + end_v) * 0.5
    rotation = vector.to_track_quat("Z", "Y").to_euler()
    return td.cyl(name, radius, vector.length, location=middle,
                  rotation=rotation, mat=mat, parent=parent, verts=verts)


def set_rendered(objects, rendered):
    """Toggle only shield meshes in renders and saved viewport previews."""
    for obj in objects:
        obj.hide_render = not rendered
        obj.hide_viewport = not rendered


def _leg(root, row_name, side_name, x, side, rake, tin, dark, brass):
    """Build one continuous two-bone leg and return its moving root + foot."""
    leg = td.root("leg_%s_%s" % (row_name, side_name))
    leg.parent = root
    # Ground contact stays inside a compact disc.  A wide isometric footprint
    # projects below the fixed 0.86 pivot when the actor turns sideways; this
    # compact stance keeps a real gutter in every directional row.
    leg.location = (x, side * 0.050, 0.285)

    knee = (rake * 0.42, side * 0.055, -0.105)
    ankle = (rake, side * 0.095, -0.255)
    foot_at = (rake + 0.012, side * 0.105, -0.260)

    # The upper arms are dark so the pale outer shins and feet stay legible
    # where they cross the body at oblique facings.
    beam("%s_%s_upper" % (row_name, side_name), (0.0, 0.0, 0.0), knee,
         0.038, dark, leg)
    beam("%s_%s_shin" % (row_name, side_name), knee, ankle,
         0.034, tin, leg)
    td.ball("%s_%s_knee" % (row_name, side_name), 0.048,
            location=knee, mat=brass if row_name == "rear" else dark,
            parent=leg)
    foot = td.box("foot_%s_%s" % (row_name, side_name),
                  (0.080, 0.050, 0.050), location=foot_at,
                  mat=dark, parent=leg)
    return leg, foot


def build():
    """Return root, animated body, leg records and shield-only meshes."""
    tin = td.material("swarm_tin", "tin", roughness=0.55, metallic=0.14)
    dark = td.material("swarm_dark", "tin_dark", roughness=0.70,
                       metallic=0.08)
    brass = td.material("swarm_brass", "brass", roughness=0.38,
                        metallic=0.42)
    core = td.material("swarm_core", "core_red", emission=2.5,
                       roughness=0.24)
    ley = td.material("swarm_shield_ley", "ley", emission=3.2,
                      roughness=0.20)

    root = td.root("swarm")

    # Legs sit directly under the directional root.  The body can bob and
    # bank above them without dragging the planted tripod through the floor.
    legs = []
    for row_index, (row_name, x, rake) in enumerate(LEG_ROWS):
        for side_name, side in (("l", 1.0), ("r", -1.0)):
            leg, foot = _leg(root, row_name, side_name, x, side, rake,
                             tin, dark, brass)
            # Insect tripod: left front/rear + right middle oppose the other
            # three.  This remains readable even when the whole sprite is 18px.
            group = 0 if ((side > 0 and row_index != 1) or
                          (side < 0 and row_index == 1)) else 1
            legs.append({"root": leg, "foot": foot,
                         "base": tuple(leg.location), "group": group,
                         "name": "%s_%s" % (row_name, side_name)})

    body = td.root("swarm_body")
    body.parent = root
    body.location = (0.0, 0.0, 0.350)

    # A single connected under-frame keeps the many legs from reading as six
    # detached pixels once the atlas is downsampled.
    td.box("belly_rail", (0.515, 0.265, 0.125),
           location=(-0.025, 0.0, -0.030), mat=dark, parent=body)
    td.box("front_crossbar", (0.150, 0.405, 0.090),
           location=(0.205, 0.0, -0.005), mat=dark, parent=body)
    td.box("rear_crossbar", (0.130, 0.370, 0.085),
           location=(-0.205, 0.0, -0.005), mat=dark, parent=body)

    # Octagonal abdomen plus overlapping stamped plates: rounded enough to
    # read as a shell, faceted enough to stay in the machine vocabulary.
    td.cyl("abdomen", 0.176, 0.330,
           location=(-0.115, 0.0, 0.035),
           rotation=(0.0, math.radians(90.0), 0.0), mat=tin,
           parent=body, verts=8)
    td.box("abdomen_cap", (0.245, 0.330, 0.095),
           location=(-0.155, 0.0, 0.130),
           rotation=(0.0, math.radians(-5.0), 0.0), mat=tin,
           parent=body)
    td.box("abdomen_band", (0.070, 0.350, 0.190),
           location=(-0.205, 0.0, 0.045), mat=brass, parent=body)
    td.box("spine_plate", (0.315, 0.115, 0.060),
           location=(-0.030, 0.0, 0.205),
           rotation=(0.0, math.radians(-7.0), 0.0), mat=dark,
           parent=body)

    # Broad wedge head.  A red intake is recessed in a dark muzzle and split
    # by a guard, avoiding the floating-glow look that hurt older models.
    td.box("head_lower", (0.300, 0.315, 0.145),
           location=(0.205, 0.0, 0.035),
           rotation=(0.0, math.radians(-7.0), 0.0), mat=tin,
           parent=body)
    td.box("head_brow", (0.245, 0.345, 0.095),
           location=(0.225, 0.0, 0.145),
           rotation=(0.0, math.radians(-11.0), 0.0), mat=dark,
           parent=body)
    td.cyl("intake_housing", 0.090, 0.080,
           location=(0.377, 0.0, 0.065),
           rotation=(0.0, math.radians(90.0), 0.0), mat=dark,
           parent=body, verts=10)
    td.cyl("intake_core", 0.060, 0.030,
           location=(0.423, 0.0, 0.065),
           rotation=(0.0, math.radians(90.0), 0.0), mat=core,
           parent=body, verts=10)
    td.box("intake_guard", (0.026, 0.150, 0.025),
           location=(0.445, 0.0, 0.065), mat=dark, parent=body)

    # Two heavy feelers make the facing legible.  Wire-thin antennae vanish at
    # 0.55 scale; these are intentionally closer to fork tines.
    beam("feeler_l", (0.265, 0.105, 0.160), (0.455, 0.205, 0.255),
         0.026, brass, body)
    beam("feeler_r", (0.265, -0.105, 0.160), (0.455, -0.205, 0.255),
         0.026, brass, body)
    td.ball("feeler_tip_l", 0.036, location=(0.455, 0.205, 0.255),
            mat=dark, parent=body)
    td.ball("feeler_tip_r", 0.036, location=(0.455, -0.205, 0.255),
            mat=dark, parent=body)

    # Shield variant: small dark sockets with cyan glass inset.  Four points
    # keep at least two readable in every direction; they live close to the
    # shell and add almost nothing to the base outline.
    shield_meshes = []
    for index, (x, y, z, axis) in enumerate((
            (0.135, 0.188, 0.155, 1.0),
            (0.135, -0.188, 0.155, -1.0),
            (-0.205, 0.175, 0.155, 1.0),
            (-0.205, -0.175, 0.155, -1.0))):
        mount = td.box("shield_mount_%d" % index, (0.095, 0.055, 0.085),
                       location=(x, y, z),
                       rotation=(math.radians(8.0) * axis, 0.0, 0.0),
                       mat=dark, parent=body)
        node = td.ball("shield_node_%d" % index, 0.039,
                       location=(x, y + 0.034 * axis, z + 0.018),
                       mat=ley, parent=body)
        shield_meshes.extend((mount, node))

    set_rendered(shield_meshes, False)
    return root, body, legs, shield_meshes


def key(obj, frame, rotation=None, location=None):
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert("rotation_euler", frame=frame)
    if location is not None:
        obj.location = location
        obj.keyframe_insert("location", frame=frame)


def animate_walk(body, legs, frames):
    """Eight authored samples of a planted alternating-tripod scuttle."""
    body_base = tuple(body.location)
    stride = 0.072
    clearance = 0.065

    for f in range(frames):
        frame = 1 + f
        t = 2.0 * math.pi * f / frames

        # Shell motion is tiny but brisk: the legs do the animation, while a
        # slight bank conveys speed without destabilising ground contact.
        key(body, frame,
            location=(body_base[0], body_base[1],
                      body_base[2] + 0.012 * (1.0 - abs(math.sin(t)))),
            rotation=(math.radians(2.2) * math.sin(t),
                      math.radians(-1.2) * math.cos(2.0 * t), 0.0))

        for record in legs:
            phase = t + (math.pi if record["group"] else 0.0)
            base = record["base"]
            # During the grounded half, sin moves the foot smoothly from
            # forward to rear.  During the other half it lifts and recovers.
            lift = clearance * max(0.0, math.cos(phase))
            key(record["root"], frame,
                location=(base[0] + stride * math.sin(phase),
                          base[1], base[2] + lift),
                rotation=(0.0, 0.0, 0.0))


def _foot_bottom(foot):
    bpy.context.view_layer.update()
    points = [foot.matrix_world @ Vector(corner) for corner in foot.bound_box]
    return min(point.z for point in points)


def report_walk_grounding():
    td.scene(ortho_scale=ORTHO_SCALE, tile_w=TILE_W, tile_h=TILE_H)
    _root, body, legs, _shield = build()
    animate_walk(body, legs, WALK_FRAMES)

    floor_errors = []
    airborne = []
    for frame in range(1, WALK_FRAMES + 1):
        bpy.context.scene.frame_set(frame)
        heights = [(record["name"], _foot_bottom(record["foot"]))
                   for record in legs]
        floor = min(height for _name, height in heights)
        floor_errors.append(abs(floor))
        airborne.extend(height for _name, height in heights
                        if height > 0.001)
        print("GROUND frame=%d floor=%+.6f feet=%s" %
              (frame, floor,
               ", ".join("%s:%+.4f" % pair for pair in heights)))
    print("GROUND_SUMMARY max_floor_error=%.8f max_swing_clearance=%.6f" %
          (max(floor_errors), max(airborne) if airborne else 0.0))


def main():
    td.scene(ortho_scale=ORTHO_SCALE, tile_w=TILE_W, tile_h=TILE_H)
    root, body, legs, shield_meshes = build()
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = WALK_FRAMES
    animate_walk(body, legs, WALK_FRAMES)

    if not os.path.isdir(td.OUTPUT_DIR):
        os.makedirs(td.OUTPUT_DIR)

    set_rendered(shield_meshes, False)
    td.render_sheet(root, "swarm_walk", WALK_FRAMES, directions=DIRECTIONS,
                    tile_w=TILE_W, tile_h=TILE_H, frame_start=1)
    set_rendered(shield_meshes, True)
    td.render_sheet(root, "swarm_walk_shielded", WALK_FRAMES,
                    directions=DIRECTIONS, tile_w=TILE_W, tile_h=TILE_H,
                    frame_start=1)


if __name__ == "__main__":
    if "--check-ground" in sys.argv:
        report_walk_grounding()
    else:
        main()
