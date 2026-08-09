# ---------------------------------------------------------------------------
# Enemy type `normal` -- the harvester. 4 hp, speed x1, bounty 3.
#
#     blender --background --python tools/blender/enemy_normal.py
#
# Writes assets/normal_walk.png, assets/normal_walk_shielded.png and
# assets/normal_death.png.
#
# NAMED FOR THE GAME'S TYPE ID, NOT FOR THE LORE. The first pass called this
# "tither" after a meter-reader that collected a levy, which no longer matches
# the world: the Draw does not bill anybody, it eats. Lore names will keep
# moving; `Enemy.TYPES.normal` will not, and the model id the renderer
# registers is `normal:body`. Naming the file after the thing that is stable
# means the asset never has to be renamed again.
#
# WHAT IT IS NOW. The cheapest unit the intelligence can stamp out: a tin
# frame built to walk to flesh, take some, and carry it home. It has no weapon
# and no armour because it was never meant to meet resistance -- it is a
# collection vehicle, and the glowing thing caged on its chest is what it has
# already taken. That is why the one saturated colour on the model sits in a
# container rather than in its body: the machine cannot hold mana itself.
# That is the entire war.
#
# WHY EVERYTHING IS BOXES. `Enemy.RADIUS_PX` is 11, so this is roughly 22 px
# across in play. At that size a sculpted mesh and a stretched cube are the
# same handful of pixels; what survives is the SILHOUETTE and where the one
# bright colour sits. Effort goes into the outline, not into geometry nobody
# can resolve.
#
# Built facing +X and spun by the root empty at render time. Never model a
# second direction -- that is what the 8 rows of the sheet are for.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import bpy
from mathutils import Vector
import td_scene as td

# Tile size. The board is being scaled up, so these are authored well above
# whatever the game ends up drawing -- render big once, downsample per build,
# never re-render thirty models because the scale moved.
TILE_W = 128
TILE_H = 160
DIRECTIONS = 8
WALK_FRAMES = 8
DEATH_FRAMES = 6

# The creature stands on z = 0 and reaches about 1.16 up. The camera's 34
# degree elevation foreshortens vertical extent to 0.83, so that needs about
# 0.96 of ortho_scale; 1.5 deliberately leaves it small in its own tile. It is
# a 4 hp unit and it should look like one next to everything that comes later.
ORTHO_SCALE = 1.5

# Joint rest positions are shared by the walk-grounding pass and the death
# reset.  Keep them explicit: walk frames translate each leg a few hundredths
# to plant the support sole, and those offsets must not leak into death.
LEG_L_REST = (0.0, 0.105, -0.14)
LEG_R_REST = (0.0, -0.105, -0.14)

# Eight authored samples of one leg's fore/aft travel.  The intermediate
# samples are exactly half the angular extreme instead of sin(45 degrees).
# That makes the planted foot sweep backwards in nearly equal increments;
# the old sine samples bunched motion at the ends and visibly slid the sole.
WALK_PHASES = (0.0, 0.5, 1.0, 0.5, 0.0, -0.5, -1.0, -0.5)
SUPPORT_LEFT_FRAMES = frozenset((1, 2, 7, 8))


def build():
    """Returns (root, body, parts) -- the empty to spin for direction, the
    empty every moving part hangs off, and the animated joints by name."""
    # KEEP METALLIC LOW. A metallic surface has no diffuse component -- it is
    # lit entirely by what it reflects -- and this scene has no environment to
    # reflect, just three suns and a flat ambient. An early render used
    # metallic 0.55 and the tin came out near-black no matter how far the key
    # was pushed. Stamped, painted tin is mostly diffuse anyway.
    tin = td.material("tin", "tin", roughness=0.58, metallic=0.12)
    tin_dark = td.material("tin_dark", "tin_dark", roughness=0.68, metallic=0.08)
    brass = td.material("brass", "brass", roughness=0.34, metallic=0.45)
    # The lens remains the brightest red.  The carried core gets a controlled
    # glow, while the much broader inspection panes are deliberately dimmer:
    # when those panels shared the old emission=2 material they blew out to
    # flat pink tabs and read as balloons stuck onto the silhouette.
    cargo_core = td.material("cargo_core", "core_red",
                             emission=1.55, roughness=0.28)
    cargo_window = td.material("cargo_window", "core_red",
                               emission=0.58, roughness=0.36)
    lens = td.material("lens_red", "core_red", emission=4.2, roughness=0.2)
    shield_ley = td.material("shield_ley", "ley",
                             emission=3.2, roughness=0.2)

    root = td.root("normal")
    body = td.root("normal_body")
    body.parent = root
    # Chosen so the feet land on z = 0: the leg roots sit 0.14 below this and
    # each sole is centred another 0.4475 down with 0.065 total thickness.
    # Ground contact has to be exact or bottom-anchored framing means nothing.
    body.location = (0.0, 0.0, 0.62)

    # --- torso --------------------------------------------------------------
    # Small and leaned well over. The lean is the character: it is not
    # marching, it is carrying something heavier than it was built for. An
    # earlier pass used 9 degrees and a big square torso, and it read as a
    # mech; the fix was less body and more stoop, not more detail.
    lean = math.radians(20.0)
    td.box("torso", (0.30, 0.24, 0.34), location=(0.0, 0.0, 0.0),
           rotation=(0.0, lean, 0.0), mat=tin, parent=body)
    # A shoulder yoke and hip brace turn the sparse frame into one connected,
    # opaque silhouette. Both are deliberately broad enough to survive the
    # final sprite downsample; they are structure, not decorative greebles.
    td.box("shoulder_yoke", (0.21, 0.42, 0.075),
           location=(0.015, 0.0, 0.115), rotation=(0.0, lean, 0.0),
           mat=tin_dark, parent=body)
    td.box("hip_brace", (0.20, 0.28, 0.08),
           location=(-0.02, 0.0, -0.135), mat=tin_dark, parent=body)
    td.box("torso_band_a", (0.32, 0.255, 0.045),
           location=(0.03, 0.0, 0.085),
           rotation=(0.0, lean, 0.0), mat=tin_dark, parent=body)
    td.box("torso_band_b", (0.32, 0.255, 0.045),
           location=(-0.02, 0.0, -0.085),
           rotation=(0.0, lean, 0.0), mat=tin_dark, parent=body)

    # --- the cage: the one saturated thing on the model ---------------------
    # This is a tank carried BY the machine, not part of its skin.  Every glow
    # surface is therefore recessed inside a larger dark housing.  The old
    # front sphere and naked side/rear slabs protruded past the torso and, from
    # three of the four review angles, looked exactly like detached pink
    # balloons.  A dark drum plus two coarse guard bars now makes the front read
    # as a caged core even after the runtime downsample.
    td.cyl("cargo_housing", 0.108, 0.075,
           location=(0.175, 0.0, 0.015),
           rotation=(0.0, math.radians(90.0), 0.0),
           mat=tin_dark, parent=body)
    td.cyl("cargo_core", 0.071, 0.038,
           location=(0.228, 0.0, 0.015),
           rotation=(0.0, math.radians(90.0), 0.0),
           mat=cargo_core, parent=body)
    td.box("cargo_guard_vertical", (0.030, 0.022, 0.185),
           location=(0.252, 0.0, 0.015), mat=tin_dark, parent=body)
    td.box("cargo_guard_horizontal", (0.030, 0.185, 0.022),
           location=(0.252, 0.0, 0.015), mat=tin_dark, parent=body)
    td.box("cage_top", (0.145, 0.25, 0.045),
           location=(0.19, 0.0, 0.12), mat=tin_dark, parent=body)
    td.box("cage_bottom", (0.145, 0.25, 0.045),
           location=(0.19, 0.0, -0.09), mat=tin_dark, parent=body)

    # Side inspection panes: the housing is wider and taller than the inset,
    # leaving a substantial rim instead of relying on a sub-pixel outline.
    td.box("cargo_housing_l", (0.18, 0.052, 0.155),
           location=(0.015, 0.128, 0.01), mat=tin_dark, parent=body)
    td.box("cargo_housing_r", (0.18, 0.052, 0.155),
           location=(0.015, -0.128, 0.01), mat=tin_dark, parent=body)
    td.box("cargo_window_l", (0.102, 0.014, 0.072),
           location=(0.025, 0.161, 0.01), mat=cargo_window, parent=body)
    td.box("cargo_window_r", (0.102, 0.014, 0.072),
           location=(0.025, -0.161, 0.01), mat=cargo_window, parent=body)
    td.box("cargo_side_strut_l", (0.018, 0.012, 0.10),
           location=(0.025, 0.171, 0.01), mat=tin_dark, parent=body)
    td.box("cargo_side_strut_r", (0.018, 0.012, 0.10),
           location=(0.025, -0.171, 0.01), mat=tin_dark, parent=body)

    # Rear inspection pane: same construction, rotated onto the back face.
    # Its glow is both smaller than and physically inset from the dark frame.
    td.box("cargo_housing_rear", (0.052, 0.18, 0.155),
           location=(-0.182, 0.0, 0.01), mat=tin_dark, parent=body)
    td.box("cargo_window_rear", (0.014, 0.102, 0.072),
           location=(-0.215, 0.0, 0.01), mat=cargo_window, parent=body)
    td.box("cargo_rear_strut", (0.012, 0.018, 0.10),
           location=(-0.225, 0.0, 0.01), mat=tin_dark, parent=body)
    td.box("cargo_retainer", (0.34, 0.27, 0.045),
           location=(0.035, 0.0, -0.075), rotation=(0.0, lean, 0.0),
           mat=brass, parent=body)

    # --- head: a lens on a thin neck ----------------------------------------
    td.cyl("neck", 0.045, 0.13, location=(-0.01, 0.0, 0.225),
           mat=tin_dark, parent=body)
    td.box("head", (0.21, 0.18, 0.14), location=(0.025, 0.0, 0.325),
           rotation=(0.0, math.radians(14.0), 0.0), mat=tin, parent=body)
    td.cyl("lens_ring", 0.065, 0.085, location=(0.14, 0.0, 0.32),
           rotation=(0.0, math.radians(90.0), 0.0), mat=tin_dark, parent=body)
    td.ball("lens", 0.048, location=(0.18, 0.0, 0.32),
            mat=lens, parent=body)
    # The raked antenna is cheap, broad, and what stops the silhouette reading
    # as a person at icon size. Its old wire-thin version disappeared at scale.
    td.cyl("antenna", 0.026, 0.23, location=(-0.085, 0.05, 0.455),
           rotation=(math.radians(16.0), math.radians(-20.0), 0.0),
           mat=tin_dark, parent=body)

    # --- arms ---------------------------------------------------------------
    # Bare. The first pass hung a probe off one arm and a tally slate off the
    # other, both instruments for reading a meter -- props from a version of
    # the world where these things billed you instead of eating you. Gone.
    # What is left is a thing with nothing in its hands, which is worse.
    arm_l = td.root("arm_l")
    arm_l.parent = body
    arm_l.location = (0.015, 0.205, 0.11)
    td.cyl("shoulder_l", 0.065, 0.09, location=(0.0, 0.0, 0.0),
           rotation=(math.radians(90.0), 0.0, 0.0),
           mat=tin_dark, parent=arm_l)
    td.box("arm_l_upper", (0.09, 0.085, 0.17),
           location=(0.0, 0.0, -0.095),
           mat=tin, parent=arm_l)
    td.box("arm_l_fore", (0.085, 0.085, 0.14),
           location=(0.015, 0.0, -0.245), mat=tin_dark, parent=arm_l)
    td.box("hand_l", (0.11, 0.10, 0.075),
           location=(0.035, 0.0, -0.34),
           mat=tin_dark, parent=arm_l)

    arm_r = td.root("arm_r")
    arm_r.parent = body
    arm_r.location = (0.015, -0.205, 0.11)
    td.cyl("shoulder_r", 0.065, 0.09, location=(0.0, 0.0, 0.0),
           rotation=(math.radians(90.0), 0.0, 0.0),
           mat=tin_dark, parent=arm_r)
    td.box("arm_r_upper", (0.09, 0.085, 0.17),
           location=(0.0, 0.0, -0.095),
           mat=tin, parent=arm_r)
    td.box("arm_r_fore", (0.085, 0.085, 0.14),
           location=(0.015, 0.0, -0.245), mat=tin_dark, parent=arm_r)
    td.box("hand_r", (0.11, 0.10, 0.075),
           location=(0.035, 0.0, -0.34),
           mat=tin_dark, parent=arm_r)

    # --- legs ---------------------------------------------------------------
    # Long and mismatched on purpose: the right shin is a field repair, closed
    # with one broad brass cuff by something that was not a mechanic. The old
    # three wire wraps were subpixel decoration; one solid repair reads.
    leg_l = td.root("leg_l")
    leg_l.parent = body
    leg_l.location = LEG_L_REST
    td.box("knee_l", (0.11, 0.105, 0.10), location=(0.0, 0.0, -0.05),
           mat=tin_dark, parent=leg_l)
    td.box("leg_l_shin", (0.08, 0.08, 0.38),
           location=(0.0, 0.0, -0.24),
           mat=tin, parent=leg_l)
    td.box("foot_l", (0.18, 0.125, 0.065),
           location=(0.045, 0.0, -0.4475),
           mat=tin_dark, parent=leg_l)

    leg_r = td.root("leg_r")
    leg_r.parent = body
    leg_r.location = LEG_R_REST
    td.box("knee_r", (0.11, 0.105, 0.10), location=(0.0, 0.0, -0.05),
           mat=tin_dark, parent=leg_r)
    td.box("leg_r_shin", (0.08, 0.08, 0.38),
           location=(0.0, 0.0, -0.24),
           mat=tin, parent=leg_r)
    td.cyl("repair_cuff", 0.058, 0.11, location=(0.0, 0.0, -0.24),
           mat=brass, parent=leg_r)
    td.box("foot_r", (0.18, 0.125, 0.065),
           location=(0.045, 0.0, -0.4475),
           mat=tin_dark, parent=leg_r)

    # --- optional shield projectors ---------------------------------------
    # A shield is an INSTANCE state, not a separate enemy type: Hive brood
    # and Shieldbearers can put one on an otherwise ordinary Normal.  These
    # compact projector blocks therefore live on the same animated rig and
    # are hidden for the base sheet, then revealed for the shielded sheet.
    # The runtime supplies the faint energy field.  Keeping glass out of the
    # baked model leaves the red cargo cage and stooped silhouette readable.
    shield_parts = []
    for side, sign in (("l", 1.0), ("r", -1.0)):
        shield_parts.append(td.box(
            "shield_mount_" + side, (0.12, 0.055, 0.105),
            location=(-0.015, sign * 0.245, 0.115),
            mat=tin_dark, parent=body))
        shield_parts.append(td.box(
            "shield_clamp_" + side, (0.075, 0.028, 0.135),
            location=(-0.015, sign * 0.287, 0.115),
            mat=brass, parent=body))
        shield_parts.append(td.ball(
            "shield_node_" + side, 0.041,
            location=(0.015, sign * 0.318, 0.145),
            mat=shield_ley, parent=body))

    # A small aft node makes the state survive front/rear facings without
    # turning into a halo. It sits below the head and never changes the crown.
    shield_parts.append(td.box(
        "shield_mount_rear", (0.065, 0.13, 0.075),
        location=(-0.205, 0.0, 0.205), mat=tin_dark, parent=body))
    shield_parts.append(td.ball(
        "shield_node_rear", 0.038,
        location=(-0.248, 0.0, 0.22), mat=shield_ley, parent=body))

    parts = {"arm_l": arm_l, "arm_r": arm_r,
             "leg_l": leg_l, "leg_r": leg_r,
             "shield_parts": shield_parts}
    set_shield_visible(parts, False)
    return root, body, parts


def set_shield_visible(parts, visible):
    """Toggle only the optional projector meshes between aligned renders."""
    for obj in parts.get("shield_parts", []):
        obj.hide_render = not visible
        obj.hide_viewport = not visible


def key(obj, frame, rotation=None, location=None):
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert("rotation_euler", frame=frame)
    if location is not None:
        obj.location = location
        obj.keyframe_insert("location", frame=frame)


def _foot_measure(name):
    """Return the foot's world-space (sole z, centre x).

    The grounding pass intentionally measures evaluated Blender geometry
    rather than duplicating box/parent/rotation maths.  If the foot mesh or
    hierarchy changes later, planting therefore remains correct.
    """
    bpy.context.view_layer.update()
    foot = bpy.data.objects[name]
    corners = [foot.matrix_world @ Vector(corner) for corner in foot.bound_box]
    return min(point.z for point in corners), foot.matrix_world.translation.x


def _set_sole_height(leg, foot_name, frame, target_z):
    """Translate one leg in parent-local Z until its sole reaches target_z."""
    bpy.context.scene.frame_set(frame)
    bottom_z, _ = _foot_measure(foot_name)

    # Body roll means a unit of parent-local Z is very slightly less than a
    # unit of world Z.  Solve through the evaluated parent basis instead of
    # assuming they are identical.
    local_up_world_z = (
        leg.parent.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))
    ).z
    location = leg.location.copy()
    location.z += (target_z - bottom_z) / local_up_world_z
    key(leg, frame, location=location)
    bpy.context.scene.frame_set(frame)


def animate_walk(body, parts, frames):
    """An eight-sample walk with evaluated sole planting.

    Legs remain in antiphase and arms counter them.  Each four-frame support
    arc advances through evenly spaced angles, then the evaluated support sole
    is solved to z=0 while the other foot receives a small, explicit clearance.
    This keeps the root untouched, removes floor penetration, and avoids the
    old sine gait's slow-fast-slow stance-foot slide.
    """
    base_z = body.location[2]
    swing = math.radians(28.0)
    arm_swing = math.radians(14.0)
    leg_l_rest = tuple(parts["leg_l"].location)
    leg_r_rest = tuple(parts["leg_r"].location)

    for f in range(frames):
        frame = 1 + f
        t = 2.0 * math.pi * f / frames
        phase = WALK_PHASES[f % len(WALK_PHASES)]

        key(parts["leg_l"], frame,
            rotation=(0.0, swing * phase, 0.0), location=leg_l_rest)
        key(parts["leg_r"], frame,
            rotation=(0.0, -swing * phase, 0.0), location=leg_r_rest)
        key(parts["arm_l"], frame,
            rotation=(0.0, arm_swing * math.sin(t + math.pi), 0.0))
        key(parts["arm_r"], frame, rotation=(0.0, arm_swing * math.sin(t), 0.0))

        # Bob, plus a small roll. The roll sells "this thing is not well
        # balanced" without costing a frame.
        #
        # PHASED ON sin, NOT cos, AND THE SIGN MATTERS. A body is lowest when
        # its legs are most SPREAD (sin at its extreme) and tallest when they
        # are vertical (sin zero). The first version had it exactly backwards
        # and dipped the body while the legs were straight, which pushed the
        # feet through the floor -- measurable, not a matter of taste: the
        # rendered sheet had zero transparent rows under the model, so the
        # sprite had no ground margin left for the game's cast shadow.
        key(body, frame,
            location=(0.0, 0.0, base_z - 0.03 * abs(phase)),
            rotation=(math.radians(2.6) * phase, 0.0, 0.0))

    # Plant one stance foot on every sample.  The swing clearance is lowest at
    # heel-strike/toe-off and highest halfway through recovery, so the lifted
    # leg reads as a step rather than a second grounded foot skating forwards.
    for f in range(frames):
        frame = 1 + f
        t = 2.0 * math.pi * f / frames
        swing_z = 0.012 + 0.045 * abs(math.cos(t))
        if frame in SUPPORT_LEFT_FRAMES:
            _set_sole_height(parts["leg_l"], "foot_l", frame, 0.0)
            _set_sole_height(parts["leg_r"], "foot_r", frame, swing_z)
        else:
            _set_sole_height(parts["leg_r"], "foot_r", frame, 0.0)
            _set_sole_height(parts["leg_l"], "foot_l", frame, swing_z)


def animate_death(body, parts, start, frames):
    """It does not die dramatically. It stops, the knees fold, and it sits
    down. A 4 hp unit that explodes reads as important. The pitch stays under
    30 degrees and the drop under a third of body height so the whole thing
    stays inside its tile -- a sprite that leaves its own cell is clipped by
    the sheet, not by the game."""
    base_z = body.location[2]
    for f in range(frames):
        frame = start + f
        p = f / float(frames - 1)
        key(body, frame,
            location=(0.0, 0.0, base_z - 0.28 * p * p),
            rotation=(0.0, math.radians(26.0) * p * p, 0.0))
        key(parts["leg_l"], frame,
            rotation=(0.0, math.radians(-34.0) * p, 0.0),
            location=LEG_L_REST)
        key(parts["leg_r"], frame,
            rotation=(0.0, math.radians(-44.0) * p, 0.0),
            location=LEG_R_REST)
        key(parts["arm_l"], frame, rotation=(0.0, math.radians(42.0) * p, 0.0))
        key(parts["arm_r"], frame, rotation=(0.0, math.radians(30.0) * p, 0.0))


def report_walk_grounding():
    """Build without rendering and print the eight walk-frame ground checks."""
    td.scene(ortho_scale=ORTHO_SCALE, tile_w=TILE_W, tile_h=TILE_H)
    _root, body, parts = build()
    animate_walk(body, parts, WALK_FRAMES)

    stance_bottoms = []
    swing_bottoms = []
    stance_centres = {"L": [], "R": []}
    for frame in range(1, WALK_FRAMES + 1):
        bpy.context.scene.frame_set(frame)
        left_z, left_x = _foot_measure("foot_l")
        right_z, right_x = _foot_measure("foot_r")
        side = "L" if frame in SUPPORT_LEFT_FRAMES else "R"
        stance_z = left_z if side == "L" else right_z
        swing_z = right_z if side == "L" else left_z
        stance_x = left_x if side == "L" else right_x
        stance_bottoms.append(stance_z)
        swing_bottoms.append(swing_z)
        stance_centres[side].append((frame, stance_x))
        print("GROUND frame=%d stance=%s left_z=%+.6f right_z=%+.6f "
              "stance_x=%+.6f" %
              (frame, side, left_z, right_z, stance_x))

    # Report each stance in chronological order, including the left stance
    # across the sheet wrap (7, 8, 1, 2).
    for side, order in (("L", (7, 8, 1, 2)), ("R", (3, 4, 5, 6))):
        samples = dict(stance_centres[side])
        steps = [samples[b] - samples[a] for a, b in zip(order, order[1:])]
        print("STANCE_%s x_steps=%s spread=%.6f" %
              (side, [round(step, 6) for step in steps],
               max(steps) - min(steps)))
    print("GROUND_SUMMARY max_stance_error=%.8f min_swing_clearance=%.6f" %
          (max(abs(z) for z in stance_bottoms), min(swing_bottoms)))


def main():
    td.scene(ortho_scale=ORTHO_SCALE, tile_w=TILE_W, tile_h=TILE_H)
    root, body, parts = build()

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = WALK_FRAMES + DEATH_FRAMES
    animate_walk(body, parts, WALK_FRAMES)
    animate_death(body, parts, WALK_FRAMES + 1, DEATH_FRAMES)

    if not os.path.isdir(td.OUTPUT_DIR):
        os.makedirs(td.OUTPUT_DIR)

    shielded_only = "--shielded-only" in sys.argv
    if not shielded_only:
        set_shield_visible(parts, False)
        td.render_sheet(root, "normal_walk", WALK_FRAMES,
                        directions=DIRECTIONS, tile_w=TILE_W,
                        tile_h=TILE_H, frame_start=1)

    # Same root, poses, camera and pixels as the base model.  Only the small
    # emitters change, so swapping sheets at runtime cannot pop or slide.
    set_shield_visible(parts, True)
    td.render_sheet(root, "normal_walk_shielded", WALK_FRAMES,
                    directions=DIRECTIONS, tile_w=TILE_W, tile_h=TILE_H,
                    frame_start=1)

    # A dead body has no live shield, so the authored death remains clean.
    if not shielded_only:
        set_shield_visible(parts, False)
        td.render_sheet(root, "normal_death", DEATH_FRAMES,
                        directions=DIRECTIONS, tile_w=TILE_W,
                        tile_h=TILE_H, frame_start=WALK_FRAMES + 1)


# Guarded so make_preview.py can import build()/animate_walk() and put the
# model in a .blend without kicking off a full sheet render.
if __name__ == "__main__":
    if "--check-ground" in sys.argv:
        report_walk_grounding()
    else:
        main()
