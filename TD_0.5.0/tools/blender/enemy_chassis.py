# ---------------------------------------------------------------------------
# The shared enemy chassis -- the stamped frame every Easy-tier body is built
# on, and the one place its parts are described.
#
# WHY THIS EXISTS. Five new enemy types (Skimmer, Tun, Drudge, Hedger, Cooper)
# are each "the Gleaner with exactly one change": same foot, same lens ring,
# same shoulder yoke, same brass shin cuff, same stoop. Measured on
# `enemy_normal.py`, that shared frame is 3,568 of its 4,032 triangles --
# 88.5% of the model. Copying it five times means five files that drift apart
# silently; describing it once means a change to the foot changes five models
# at once, on purpose. Roster Law 02 is "stamped, not born", and a faction
# whose members are literally stamped from one die should be authored from one.
#
# THE DANGER, STATED PLAINLY, AND THE COUPLING IS SILENT. A shared module means
# an edit here rewrites SIX shipped files -- Drudge, Skimmer, Tun, Hedger,
# Cooper, and now the Courier (`enemy-shielded`, shipped 2026-08-13 in e3d08d6).
# That is the intended behaviour and it is also the way to break six models with
# one careless line.
#
# **DO NOT TRUST THAT COUNT -- DERIVE IT.** It was wrong for the whole window
# between the Courier's export landing and this line being updated, and it will
# go wrong again with every body batch 2 adds. The count is whatever this
# returns, and a command cannot go stale the way a number can:
#
#     grep -l "import enemy_chassis" tools/blender/enemy_*.py
#
# Read the `enemy_*` glob rather than the directory: `make_preview.py` imports
# the chassis too and ships no model.
#
# **WHAT WARNS YOU, AND HOW TO CHECK IT RATHER THAN BELIEVE IT.**
# `export_mesh.py` now stamps `CHASSIS_VERSION` into every model it builds
# through this module -- once in the file's comment header and once as a
# `chassisVersion` field. So:
#
#     grep -l chassisVersion js/gl/models/enemy-*.js
#
# lists every chassis-built model that has been exported SINCE the stamp
# landed, and its absence from a file means that file predates the stamp -- NOT
# that the model is unversioned, and never "version 0". Non-chassis bodies
# (`enemy-brute`, `-swarm`, `-hive`, and the imported `-flying`) carry no stamp
# at all and must never read as a stale chassis.
#
# **THIS SENTENCE HAS BEEN WRONG IN BOTH DIRECTIONS IN ONE DAY.** It first
# claimed a stamp that had never been built; that was corrected to say no stamp
# existed; and the stamp then landed, making the correction false in turn. That
# is why it is now written as a COMMAND rather than a claim -- a reader can
# falsify the line above in one second, and a command cannot rot the way a
# description does. Write it that way if you change it again.
#
# **THE STAMP IS A DETECTOR, NOT A SAFEGUARD.** It tells you afterwards that a
# set is mismatched. It cannot stop you shipping one, and it says nothing about
# a body re-exported for an unrelated reason. The discipline is still manual:
#
#   * change this file  ->  re-export EVERY chassis body, by hand, in ONE commit
#     that says a chassis change is what it is;
#   * never re-export a single body after touching the chassis -- that is
#     exactly how the five stop matching each other, silently;
#   * assume a sibling instance may be editing this file or a body that
#     imports it at this moment. Check before you start.
#
# WHAT THIS FILE IS NOT. It is not `enemy_normal.py` parameterised.
# `enemy_normal.py` owns a shipped sprite-sheet contract (assets/normal_walk*.png)
# and rigs its body root at z = 0.62, which is the bug described under
# `body_z` below. It is left exactly as it is; this file is built correctly
# from the start, and the Gleaner migrates later or never. `gleaner_config()`
# reproduces it here only as a fidelity test -- see the bottom of this file.
#
# THE CARGO CAGE IS SEALED. See `cargo_cage()`. You may place it. You may not
# rebuild it.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import bpy
from mathutils import Vector
import td_scene as td

# Bump on any change to the geometry this file emits, and re-export ALL five
# bodies in the same commit.
#
# READ BY NOTHING TODAY. This is a marker, not a mechanism -- `export_mesh.py`
# does not emit it and no generated model contains it. Bumping it warns the next
# person reading this file and warns nobody reading a diff.
#
# WHEN THE PLUMBING LANDS, IT MUST NOT FORCE A RE-EXPORT. Emit this in
# `write_js` and let each model pick it up at its NEXT export for a reason it
# already had; **absence then means pre-versioning**. Re-exporting five ~300 KB
# files to add a header string would be pure churn -- and worse here than
# elsewhere, because re-exports are not byte-stable on this pipeline (UV-sphere
# face order is non-deterministic run to run), so five models would show large
# spurious diffs to buy one line.
CHASSIS_VERSION = 1

ORTHO_SCALE = 1.5
TILE_W = 128
TILE_H = 160
DIRECTIONS = 8

# The height the chassis is AUTHORED around: the torso origin sits here in
# world space, feet on z = 0. Every part offset below is relative to it, which
# is what lets `body_z` move the animated root without moving the model.
BODY_REFERENCE_Z = 0.62

# The stoop. It is the character -- this thing is not marching, it is carrying
# something heavier than it was built for. 20 degrees; an earlier pass at 9
# read as a mech.
LEAN = math.radians(20.0)

LEG_L_REST = (0.0, 0.105, -0.14)
LEG_R_REST = (0.0, -0.105, -0.14)


def walk_phases(frames):
    """One leg's fore/aft travel, as a triangle wave over `frames` samples.

    A TRIANGLE WAVE, NOT A SINE. The planted foot must sweep backwards in
    equal increments; sine samples bunch motion at the ends and visibly slide
    the sole. For frames=8 this returns exactly the eight values
    `enemy_normal.py` hand-authored -- (0, .5, 1, .5, 0, -.5, -1, -.5) -- so
    the shared cycle is the one that was already tuned, not a new one.
    """
    out = []
    for i in range(frames):
        t = 4.0 * i / frames
        if t <= 1.0:
            out.append(t)
        elif t < 3.0:
            out.append(2.0 - t)
        else:
            out.append(t - 4.0)
    return tuple(out)


def support_left_frames(frames):
    """The 1-based frames on which the LEFT foot is the stance foot.

    Half the cycle each, in antiphase, and the half starts a quarter-cycle
    before the phase zero crossing. For frames=8 this is {7, 8, 1, 2}, which
    is what `enemy_normal.py` hard-codes.
    """
    start = frames - frames // 4
    return frozenset(((start + k) % frames) + 1 for k in range(frames // 2))


def materials():
    """The Gleaner palette. A value ladder: tin_dark is the largest surface and
    the darkest, the one saturated colour is CARRIED rather than worn.

    KEEP METALLIC LOW. A metallic surface has no diffuse component and this
    scene has no environment to reflect -- an early render at metallic 0.55
    came out near-black however hard the key was pushed.
    """
    return {
        "tin": td.material("tin", "tin", roughness=0.58, metallic=0.12),
        "tin_dark": td.material("tin_dark", "tin_dark", roughness=0.68,
                                metallic=0.08),
        "brass": td.material("brass", "brass", roughness=0.34, metallic=0.45),
        # The lens is the brightest red on the model. The inspection panes are
        # deliberately dimmer: sharing the lens's emission blew them out to
        # flat pink tabs that read as balloons stuck onto the silhouette.
        "cargo_core": td.material("cargo_core", "core_red", emission=1.55,
                                  roughness=0.28),
        "cargo_window": td.material("cargo_window", "core_red", emission=0.58,
                                    roughness=0.36),
        "lens": td.material("lens_red", "core_red", emission=4.2,
                            roughness=0.2),
        "shield_ley": td.material("shield_ley", "ley", emission=3.2,
                                  roughness=0.2),
    }


# --- the sub-assemblies ------------------------------------------------------
#
# Each takes the materials, the body empty, and a `lift` -- the amount to add
# to every z, which is how `body_z` moves the animated root without moving the
# model. Anything parented to a LIMB root takes no lift: the limb root itself
# already moved.


def torso_frame(m, body, lift, torso_w=0.24, yoke_w=0.42, hip_w=0.28,
                band_w=0.255):
    """Torso, shoulder yoke, hip brace and the two bands. 540 triangles.

    The yoke and hip brace are what turn a sparse frame into one connected,
    opaque silhouette. They are structure, not greebles -- both are sized to
    survive the sprite downsample.

    THE FOUR WIDTHS ARE PARAMETERS BECAUSE WIDTH IS A SEPARATOR. Defaults are
    the Gleaner's and nothing that omits them moves. **The shoulder yoke at
    0.42 is the widest part of the whole body group** -- wider than the torso,
    the bands and the cage -- so it, not the chest box, is what actually sets
    a body's silhouette width. A brief asking for a narrower body that changes
    only `torso_w` will measure no change at all.
    """
    return [
        td.box("torso", (0.30, torso_w, 0.34), location=(0.0, 0.0, lift),
               rotation=(0.0, LEAN, 0.0), mat=m["tin"], parent=body),
        td.box("shoulder_yoke", (0.21, yoke_w, 0.075),
               location=(0.015, 0.0, 0.115 + lift), rotation=(0.0, LEAN, 0.0),
               mat=m["tin_dark"], parent=body),
        td.box("hip_brace", (0.20, hip_w, 0.08),
               location=(-0.02, 0.0, -0.135 + lift), mat=m["tin_dark"],
               parent=body),
        td.box("torso_band_a", (0.32, band_w, 0.045),
               location=(0.03, 0.0, 0.085 + lift), rotation=(0.0, LEAN, 0.0),
               mat=m["tin_dark"], parent=body),
        td.box("torso_band_b", (0.32, band_w, 0.045),
               location=(-0.02, 0.0, -0.085 + lift), rotation=(0.0, LEAN, 0.0),
               mat=m["tin_dark"], parent=body),
    ]


def cargo_cage(m, body, lift, at=(0.0, 0.0, 0.0), core_segments=12,
               scale=1.0, window_mat="cargo_window", core_mat="cargo_core"):
    """THE CARGO CAGE. SEALED -- the faction's universal part.

    ============================================================================
    THIS CONSTRUCTION IS FROZEN. Do not change its bar count, its proportions,
    its materials or its window sizes. It is the one part every body in this
    faction shares and the thing that makes them read as one faction; a variant
    that restyles it has removed the only common element.

    WHAT YOU MAY DO: move it, with `at`. A card that puts the hold high on the
    back or low on the belly is a PLACEMENT, and placement is a parameter.

    WHAT YOU MAY NOT DO: reshape it. If a card asks for a hold that is
    genuinely a different object -- a broad low drum rather than this cage
    relocated -- build that as a NEW part in that body's own module and say so
    in the report. Quietly widening this into a drum loses the shared part for
    every other body at the same time.
    ============================================================================

    1,600 triangles, 39.7% of the Gleaner -- by far the most expensive
    sub-assembly, and correctly so: it is the thing the model is about. Every
    glow surface is RECESSED inside a larger dark housing, because the earlier
    version's naked slabs read as detached pink balloons from three of four
    review angles.
    """
    # `scale` and the two material arguments are the ONLY sanctioned variations,
    # and they are sanctioned by roster Law 02 in its own words: "the same lens
    # ring at three scales, variation in count and plating, never in kind". A
    # uniform scale and a plating swap are exactly that. Proportions, bar count
    # and construction are not reachable from here and must not become so.
    ax, ay, az = at
    az = az + lift
    s = scale

    def box(name, size, loc, mat, rotation=(0.0, 0.0, 0.0)):
        return td.box(name, (size[0] * s, size[1] * s, size[2] * s),
                      location=(loc[0] * s + ax, loc[1] * s + ay,
                                loc[2] * s + az),
                      rotation=rotation, mat=mat, parent=body)

    parts = [
        # The drum and its two coarse guard bars: this is what makes the front
        # read as a caged core after the runtime downsample.
        td.cyl("cargo_housing", 0.108 * s, 0.075 * s,
               location=(0.175 * s + ax, 0.0 + ay, 0.015 * s + az),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["tin_dark"],
               parent=body, verts=core_segments),
        td.cyl("cargo_core", 0.071 * s, 0.038 * s,
               location=(0.228 * s + ax, 0.0 + ay, 0.015 * s + az),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m[core_mat],
               parent=body, verts=core_segments),
        box("cargo_guard_vertical", (0.030, 0.022, 0.185), (0.252, 0.0, 0.015),
            m["tin_dark"]),
        box("cargo_guard_horizontal", (0.030, 0.185, 0.022),
            (0.252, 0.0, 0.015), m["tin_dark"]),
        box("cage_top", (0.145, 0.25, 0.045), (0.19, 0.0, 0.12),
            m["tin_dark"]),
        box("cage_bottom", (0.145, 0.25, 0.045), (0.19, 0.0, -0.09),
            m["tin_dark"]),
        # Side inspection panes. The housing is wider and taller than the
        # inset, leaving a real rim instead of a sub-pixel outline.
        box("cargo_housing_l", (0.18, 0.052, 0.155), (0.015, 0.128, 0.01),
            m["tin_dark"]),
        box("cargo_housing_r", (0.18, 0.052, 0.155), (0.015, -0.128, 0.01),
            m["tin_dark"]),
        box("cargo_window_l", (0.102, 0.014, 0.072), (0.025, 0.161, 0.01),
            m[window_mat]),
        box("cargo_window_r", (0.102, 0.014, 0.072), (0.025, -0.161, 0.01),
            m[window_mat]),
        box("cargo_side_strut_l", (0.018, 0.012, 0.10), (0.025, 0.171, 0.01),
            m["tin_dark"]),
        box("cargo_side_strut_r", (0.018, 0.012, 0.10), (0.025, -0.171, 0.01),
            m["tin_dark"]),
        # Rear pane: same construction, rotated onto the back face.
        box("cargo_housing_rear", (0.052, 0.18, 0.155), (-0.182, 0.0, 0.01),
            m["tin_dark"]),
        box("cargo_window_rear", (0.014, 0.102, 0.072), (-0.215, 0.0, 0.01),
            m[window_mat]),
        box("cargo_rear_strut", (0.012, 0.018, 0.10), (-0.225, 0.0, 0.01),
            m["tin_dark"]),
        box("cargo_retainer", (0.34, 0.27, 0.045), (0.035, 0.0, -0.075),
            m["brass"], rotation=(0.0, LEAN, 0.0)),
    ]
    return parts


def arms(m, body, lift, shoulder=True, upper=True, fore_mat="tin_dark"):
    """Two bare arms on their own animated roots. 736 triangles complete.

    BARE ON PURPOSE. The first pass hung a probe off one arm and a tally slate
    off the other -- instruments for reading a meter, props from a version of
    the world where these things billed you instead of eating you. What is left
    is a thing with nothing in its hands, which is worse.

    `shoulder` and `upper` exist for bodies whose coat swallows the arm above
    the elbow -- the Drudge. Dropping both removes 304 triangles that would be
    sealed inside another solid and never draw a pixel. The arm ROOT stays
    either way, so the gait is unchanged and the forearm still swings from the
    shoulder.

    Returns (arm_l, arm_r) -- the empties, which are what the walk keys.
    """
    out = []
    for tag, sign in (("l", 1.0), ("r", -1.0)):
        arm = td.root("arm_" + tag)
        arm.parent = body
        arm.location = (0.015, sign * 0.205, 0.11 + lift)
        if shoulder:
            td.cyl("shoulder_" + tag, 0.065, 0.09, location=(0.0, 0.0, 0.0),
                   rotation=(math.radians(90.0), 0.0, 0.0), mat=m["tin_dark"],
                   parent=arm)
        if upper:
            td.box("arm_%s_upper" % tag, (0.09, 0.085, 0.17),
                   location=(0.0, 0.0, -0.095), mat=m["tin"], parent=arm)
        td.box("arm_%s_fore" % tag, (0.085, 0.085, 0.14),
               location=(0.015, 0.0, -0.245), mat=m[fore_mat], parent=arm)
        td.box("hand_" + tag, (0.11, 0.10, 0.075), location=(0.035, 0.0, -0.34),
               mat=m[fore_mat], parent=arm)
        out.append(arm)
    return tuple(out)


def legs(m, body, lift, repair_cuff=True, knee=True, shin_mat="tin"):
    """Two legs on their own animated roots. 692 triangles with the cuff.

    LONG AND MISMATCHED ON PURPOSE. The right shin is a field repair, closed
    with one broad brass cuff by something that was not a mechanic. The old
    three wire wraps were sub-pixel decoration; one solid repair reads.

    A LIMB ROOT STAYS AT ITS JOINT and takes no lift beyond the body's -- it
    has to sit at the hip to pivot correctly. That is safe for `model.top`
    because a limb hangs DOWN, so its local maxima are small and it never owns
    the topmost vertex. See `body_z` in build().

    Returns (leg_l, leg_r).
    """
    out = []
    for tag, rest in (("l", LEG_L_REST), ("r", LEG_R_REST)):
        leg = td.root("leg_" + tag)
        leg.parent = body
        leg.location = (rest[0], rest[1], rest[2] + lift)
        if knee:
            td.box("knee_" + tag, (0.11, 0.105, 0.10),
                   location=(0.0, 0.0, -0.05), mat=m["tin_dark"], parent=leg)
        td.box("leg_%s_shin" % tag, (0.08, 0.08, 0.38),
               location=(0.0, 0.0, -0.24), mat=m[shin_mat], parent=leg)
        if tag == "r" and repair_cuff:
            td.cyl("repair_cuff", 0.058, 0.11, location=(0.0, 0.0, -0.24),
                   mat=m["brass"], parent=leg)
        td.box("foot_" + tag, (0.18, 0.125, 0.065),
               location=(0.045, 0.0, -0.4475), mat=m["tin_dark"], parent=leg)
        out.append(leg)
    return tuple(out)


def head(m, body, lift, lens_segments=8, lens_rings=4, antenna=True,
         neck=True):
    """A lens on a thin neck. 464 triangles at 16/8, 288 at 8/4.

    THIS IS THE IDENTITY SLOT. It is 11.5% of the body and it is where four of
    the five cards put their one change. Everything below the neck is shared.

    THE LENS RESOLUTION IS A REAL DECISION, NOT A DEFAULT. At 16/8 the lens is
    224 triangles -- 5.6% of the whole model -- for a sphere about 1.9 screen
    px across at the default camera. At 8/4 it is 48. It is not dropped further
    because the player's camera reaches 11.2x closer than default, where a
    6-segment sphere reads as a hexagon.

    THE ANTENNA IS CHEAP, BROAD, AND LOAD BEARING. It is what stops the
    silhouette reading as a person at icon size; its old wire-thin version
    disappeared at scale.
    """
    parts = []
    # A body whose collar rises past the jaw seals the neck inside it -- the
    # Drudge. A cylinder in there would draw nothing, so it is a flag rather
    # than something to delete after the fact.
    if neck:
        parts.append(
            td.cyl("neck", 0.045, 0.13, location=(-0.01, 0.0, 0.225 + lift),
                   mat=m["tin_dark"], parent=body))
    parts += [
        td.box("head", (0.21, 0.18, 0.14), location=(0.025, 0.0, 0.325 + lift),
               rotation=(0.0, math.radians(14.0), 0.0), mat=m["tin"],
               parent=body),
        td.cyl("lens_ring", 0.065, 0.085, location=(0.14, 0.0, 0.32 + lift),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["tin_dark"],
               parent=body),
        td.ball("lens", 0.048, location=(0.18, 0.0, 0.32 + lift),
                mat=m["lens"], parent=body,
                segments=lens_segments, rings=lens_rings),
    ]
    if antenna:
        parts.append(
            td.cyl("antenna", 0.026, 0.23,
                   location=(-0.085, 0.05, 0.455 + lift),
                   rotation=(math.radians(16.0), math.radians(-20.0), 0.0),
                   mat=m["tin_dark"], parent=body))
    return parts


def shield_projectors(m, body, lift, node_segments=8, node_rings=4):
    """The optional shield rig. 732 triangles at 16/8, 204 at 8/4.

    A SHIELD IS AN INSTANCE STATE, NOT A TYPE. Hive brood and Shieldbearers can
    put one on an otherwise ordinary body, so these live on the same animated
    rig and are hidden for the base export. The runtime supplies the field
    itself -- keeping glass out of the baked model leaves the cage and the
    stooped silhouette readable.
    """
    parts = []
    for tag, sign in (("l", 1.0), ("r", -1.0)):
        parts.append(td.box("shield_mount_" + tag, (0.12, 0.055, 0.105),
                            location=(-0.015, sign * 0.245, 0.115 + lift),
                            mat=m["tin_dark"], parent=body))
        parts.append(td.box("shield_clamp_" + tag, (0.075, 0.028, 0.135),
                            location=(-0.015, sign * 0.287, 0.115 + lift),
                            mat=m["brass"], parent=body))
        parts.append(td.ball("shield_node_" + tag, 0.041,
                             location=(0.015, sign * 0.318, 0.145 + lift),
                             mat=m["shield_ley"], parent=body,
                             segments=node_segments, rings=node_rings))
    # A small aft node keeps the state readable from behind without turning
    # into a halo. It sits below the head and never changes the crown.
    parts.append(td.box("shield_mount_rear", (0.065, 0.13, 0.075),
                        location=(-0.205, 0.0, 0.205 + lift),
                        mat=m["tin_dark"], parent=body))
    parts.append(td.ball("shield_node_rear", 0.038,
                         location=(-0.248, 0.0, 0.22 + lift),
                         mat=m["shield_ley"], parent=body,
                         segments=node_segments, rings=node_rings))
    return parts


# --- assembly ----------------------------------------------------------------


def build(m=None, name="enemy", body_z=0.0, lens_segments=8, lens_rings=4,
          shield_segments=8, shield_rings=4, cage_at=(0.0, 0.0, 0.0),
          cage=True, head_parts=True, antenna=True, repair_cuff=True,
          core_segments=12):
    """The whole chassis. Returns (root, body, parts).

    `body_z` IS THE ONE ARGUMENT THAT IS NOT COSMETIC, AND IT DEFAULTS TO 0 FOR
    A REASON. `model.top` in js/gl/gl-models.js is the max z over RAW positions,
    and an animated group's positions are stored in that group's LOCAL space --
    so a body root standing at z = 0.62 makes the model report itself 0.62
    units short, and `crownOf` draws the health bar that far inside the mesh.
    Measured on the shipped roster: normal 9.7 px inside, brute 27.2, hive 25.1.

    At body_z = 0 the body group's local space IS world space at frame 1, so
    the raw max z is the true max z and the defect cannot occur. The parts do
    not move -- `lift` puts back what the root gave up.

    THE ROOT POSITION IS NOT THE GUARANTEE, THOUGH. The root translates for the
    walk bob, so `model.top` is taken at frame 1 while the posed top spans all
    frames. Quote the margin from `node tools/check-model-top.js`, which
    measures across every frame, not the root's z.
    """
    if m is None:
        m = materials()

    lift = BODY_REFERENCE_Z - body_z

    root = td.root(name)
    body = td.root(name + "_body")
    body.parent = root
    body.location = (0.0, 0.0, body_z)

    torso_frame(m, body, lift)
    if cage:
        cargo_cage(m, body, lift, at=cage_at, core_segments=core_segments)
    if head_parts:
        head(m, body, lift, lens_segments=lens_segments, lens_rings=lens_rings,
             antenna=antenna)
    arm_l, arm_r = arms(m, body, lift)
    leg_l, leg_r = legs(m, body, lift, repair_cuff=repair_cuff)

    shield = shield_projectors(m, body, lift, node_segments=shield_segments,
                               node_rings=shield_rings)

    parts = {"arm_l": arm_l, "arm_r": arm_r, "leg_l": leg_l, "leg_r": leg_r,
             "shield_parts": shield}
    set_shield_visible(parts, False)
    return root, body, parts


def set_shield_visible(parts, visible):
    """Toggle only the optional projector meshes between aligned renders."""
    for obj in parts.get("shield_parts", []):
        obj.hide_render = not visible
        obj.hide_viewport = not visible


# --- animation ---------------------------------------------------------------


def key(obj, frame, rotation=None, location=None):
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert("rotation_euler", frame=frame)
    if location is not None:
        obj.location = location
        obj.keyframe_insert("location", frame=frame)


def _foot_measure(name):
    """The foot's world-space (sole z, centre x).

    Measures EVALUATED geometry rather than duplicating box/parent/rotation
    maths, so planting stays correct if the foot or the hierarchy changes.
    """
    bpy.context.view_layer.update()
    foot = bpy.data.objects[name]
    corners = [foot.matrix_world @ Vector(corner) for corner in foot.bound_box]
    return min(point.z for point in corners), foot.matrix_world.translation.x


def _set_sole_height(leg, foot_name, frame, target_z):
    """Translate one leg in parent-local Z until its sole reaches target_z."""
    bpy.context.scene.frame_set(frame)
    bottom_z, _ = _foot_measure(foot_name)
    # Body roll means a unit of parent-local Z is slightly less than a unit of
    # world Z. Solve through the evaluated parent basis instead of assuming.
    local_up_world_z = (
        leg.parent.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))).z
    location = leg.location.copy()
    location.z += (target_z - bottom_z) / local_up_world_z
    key(leg, frame, location=location)
    bpy.context.scene.frame_set(frame)


def animate_walk(body, parts, frames=8, swing_deg=28.0, arm_swing_deg=14.0,
                 bob=0.03, roll_deg=2.6):
    """The shared gait, with evaluated sole planting.

    Legs stay in antiphase and arms counter them. Each support arc advances
    through evenly spaced angles, then the evaluated support sole is solved to
    z = 0 while the other foot gets an explicit clearance. The root is never
    touched, so there is no floor penetration and no stance-foot slide.

    THE BOB IS PHASED ON |phase|, AND THE SIGN MATTERS. A body is lowest when
    its legs are most SPREAD and tallest when they are vertical. The first
    version had it exactly backwards and dipped the body while the legs were
    straight, pushing the feet through the floor -- measurable, not taste: the
    rendered sheet had zero transparent rows beneath the model, so there was no
    ground margin left for the game's cast shadow.
    """
    base_z = body.location[2]
    swing = math.radians(swing_deg)
    arm_swing = math.radians(arm_swing_deg)
    phases = walk_phases(frames)
    support_left = support_left_frames(frames)
    leg_l_rest = tuple(parts["leg_l"].location)
    leg_r_rest = tuple(parts["leg_r"].location)

    for f in range(frames):
        frame = 1 + f
        t = 2.0 * math.pi * f / frames
        phase = phases[f]

        key(parts["leg_l"], frame, rotation=(0.0, swing * phase, 0.0),
            location=leg_l_rest)
        key(parts["leg_r"], frame, rotation=(0.0, -swing * phase, 0.0),
            location=leg_r_rest)
        key(parts["arm_l"], frame,
            rotation=(0.0, arm_swing * math.sin(t + math.pi), 0.0))
        key(parts["arm_r"], frame, rotation=(0.0, arm_swing * math.sin(t), 0.0))
        key(body, frame,
            location=(0.0, 0.0, base_z - bob * abs(phase)),
            rotation=(math.radians(roll_deg) * phase, 0.0, 0.0))

    # Plant one stance foot on every sample. Swing clearance is lowest at
    # heel-strike/toe-off and highest halfway through recovery, so the lifted
    # leg reads as a step rather than a second grounded foot skating forwards.
    for f in range(frames):
        frame = 1 + f
        t = 2.0 * math.pi * f / frames
        swing_z = 0.012 + 0.045 * abs(math.cos(t))
        if frame in support_left:
            _set_sole_height(parts["leg_l"], "foot_l", frame, 0.0)
            _set_sole_height(parts["leg_r"], "foot_r", frame, swing_z)
        else:
            _set_sole_height(parts["leg_r"], "foot_r", frame, 0.0)
            _set_sole_height(parts["leg_l"], "foot_l", frame, swing_z)


# --- the fidelity test -------------------------------------------------------


def gleaner_config():
    """The exact configuration that reproduces `enemy_normal.py`.

    NOT FOR SHIPPING -- `enemy-normal.js` is still exported from
    `enemy_normal.py`. This exists so the chassis can be PROVED faithful: build
    it with these arguments, export, and compare the triangle multiset against
    the committed `enemy-normal.js`. An exact match means the chassis carries
    the Gleaner's geometry with nothing lost or moved, which is the only
    evidence worth having before five bodies are built on it.

    Note body_z=0.62 and the 16/8 spheres: reproducing the shipped file means
    reproducing its rig bug and its over-resolved lens too. New bodies take the
    defaults in build() instead.
    """
    return dict(name="normal", body_z=BODY_REFERENCE_Z,
                lens_segments=16, lens_rings=8,
                shield_segments=16, shield_rings=8)


def export_build():
    """The exporter contract -- build, hide, animate, return the frame count.

    Exports the chassis in its GLEANER configuration, which is what makes the
    fidelity test a single `--only=` away. The five real bodies each implement
    their own `export_build` in their own module.
    """
    _root, body, parts = build(**gleaner_config())
    set_shield_visible(parts, False)
    animate_walk(body, parts, 8)
    return 8
