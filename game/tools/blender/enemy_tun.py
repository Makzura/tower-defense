# ---------------------------------------------------------------------------
# Enemy type `slow` -- the Tun. 7 hp, speed x0.8, bounty 5. First wave 5.
#
#   blender --background --factory-startup --python tools/blender/export_mesh.py \
#           -- --only=enemy-slow
#
# THE ONE BODY THAT DOES NOT CARRY THE CAGE, AND THAT IS A DECLARED DEVIATION.
# Every other Easy body carries `enemy_chassis.cargo_cage` unmodified. The Tun
# carries a broad low drum instead, and per kaz's ruling of 2026-08-13 that is
# built as a NEW PART rather than by reshaping the sealed cage:
#
#   "Where a card asks for a hold that is genuinely a different object rather
#    than the cage relocated -- the Tun's low drum is the real case -- build it
#    as a new part and tell me you did."
#
# So `cargo_cage` is not called here at all. Nothing in it is widened, restyled
# or re-proportioned; the shared part stays exactly as every other body has it.
# A tun is a cask, and a cask is not a cage seen from a different angle.
#
# THE WIDTH IS BUDGETED AGAINST THE FROST RING, NOT AGAINST TASTE. The runtime
# draws the slow/frost ring at 30 board px; the drum may take the full 22, which
# leaves the ring clear of the body at every yaw. 22 board px is
# 22 / 31.8032 = 0.692 u across, so the drum's outer radius is 0.346 u and
# DRUM_RADIUS below is set just inside it.
#
# THE LEG TUCK IS KEPT BECAUSE IT IS BETTER STRUCTURE, NOT TO BUY WIDTH. It
# would have been available as a way to make room for the drum; it is not being
# spent that way. The leg STANCE is the chassis stance, unchanged.
#
# WHY IT IS STILL CHEAP. A drum is one cylinder plus two hoops where the cage is
# sixteen parts. The Tun is the widest Easy body and one of the cheapest.
#
# ---------------------------------------------------------------------------
# HEIGHT IS THE SEPARATOR, AND IT IS THE ONLY BEARING-INVARIANT ONE.
# ---------------------------------------------------------------------------
#
# Measured in the running game on 2026-08-13, the Gleaner/Tun pair separated at
# 0.57 at BROADSIDE -- the worst pair on the board -- while scoring 0.80-0.89 at
# the two standard views. The cause, off both model files:
#
#     axis          GLEANER    TUN
#     y (across)     0.510     0.510   <- identical to the digit
#     z (height)     1.190     1.190   <- identical to the digit
#     x (fore/aft)   0.498     0.699   <- +40%, the entire separator
#
# At broadside the only two axes on screen are y and z, and the Tun matched the
# Gleaner on both exactly. Its whole separation lived on fore/aft, which at that
# bearing contributes almost nothing to screen width. A body YAWS with the path,
# so a width separator is a coin flip on where the player is looking; HEIGHT
# reads the same at broadside, three-quarter and head-on. So the Tun is now
# SHORTER, which is also a removal and therefore free.
#
# TWO CLAUSES OF ITS OWN CARD WERE UNBUILT AND BOTH WERE HEIGHT: "the Gleaner's
# legs shortened" and "the torso is mostly deleted". The legs were byte-identical
# to the Gleaner's and the body still reached z 1.190. The card's other half --
# "and doubled to four" -- stays unbuilt on mira's ruling that leg COUNT is not
# countable at 10 px; shortened is separable from doubled and shortened is the
# half that carries.
#
# WHERE THE 0.211 u CAME FROM, AND WHAT STOPPED IT GOING FURTHER. Two levers:
#
#   1. The antenna is RAKED BACK over the cask instead of standing up. It owned
#      the crown at 1.190 while the head topped out at 1.034, so laying it back
#      is worth 0.156 u on its own and costs no part -- it is still the same
#      cylinder at the same radius, which is what the chassis cares about ("its
#      old wire-thin version disappeared at scale"). Swept back it stays inside
#      the drum's existing x envelope, so the fore/aft extent does not grow.
#   2. The shin is SHORTENED 0.380 -> 0.325 and the whole body descends with the
#      hips by that 0.055, cask included.
#
#   1.190 -> 0.979 u, which is 19.62 -> 16.14 screen rows against the Gleaner's
#   20 (SCREEN_PX z = 16.49 px per Blender unit -- NOT the board's 31.8).
#
# THE FLOOR IS NOT THE GROUND. It is the model's own swing foot. Measured
# per-frame, because the bob puts the cask lowest at |phase| = 1 while the swing
# foot peaks near phase 0 -- close to antiphase, so a min-vs-max read over the
# cycle understates the gap. The cask clears the raised boot by 0.084 u before
# this change and the gap falls one-for-one with the hip drop:
#
#     hip drop   rows   cask->boot   cask->ground
#       0.000   17.05      0.084        0.181
#       0.055   16.14      0.029        0.126     <- shipped
#       0.084   15.66      0.000        0.097     <- boot touches the cask
#       0.124   15.00     -0.040        0.057     <- boot passes THROUGH it
#
# So 15 rows is NOT available while the drum keeps its width and its belly
# placement: the cask reaches the boot at 15.66 rows with 1.6 rows of ground
# still under it. 16.14 is the shipped point and it keeps a third of the
# original boot clearance.
#
# THE LENS IS THE OTHER PINCH AND IT IS WHY THE HEAD DID NOT ALSO COME DOWN.
# The head is already sunk into the cask; the lens sits about 0.02 u proud of
# the cask's surface in its own column. Lowering the head relative to the body,
# or raising the cask inside it, buries the identity slot. Both were measured
# and both are declined -- the head/cask relationship is frozen and the whole
# assembly descends together.
#
# TWO PARTS ARE BUILT LOCALLY HERE, DECLARED THE SAME WAY THE DRUM IS.
# `enemy_chassis.legs()` takes no length and `enemy_chassis.head()`'s antenna is
# a flag, not a pose, and the chassis MUST NOT be edited for one body -- it would
# rewrite five shipped files. So `build_short_legs` and `build_raked_antenna`
# below are the Tun's own, forked from CHASSIS_VERSION 1 with the knee, the
# stance, the repair cuff, the foot and the antenna's radius and length carried
# over unchanged. If the chassis leg or antenna changes, these two do not follow
# and must be re-forked by hand.
#
# A CANDIDATE SAVING THAT IS NOT PROVEN AND MUST NOT BE ACTED ON YET. The torso
# box's bounding box sits inside the cask's -- narrower in y, within it in x and
# z -- which SUGGESTS ~540 triangles draw nothing and that "the torso is mostly
# deleted" is already true on screen. That is a bounding-box argument and kaz
# has ruled it insufficient: TWO BOXES NESTING SAYS NOTHING ABOUT TWO SOLIDS.
# The cask is a CYLINDER, and a rectangular torso whose bbox fits inside the
# drum's can still push its corners through the curved wall -- exactly the
# geometry where a box test lies. Before anything is deleted this needs a
# PER-PART occlusion test, not an extents comparison. Recorded as a candidate,
# not a finding. Deleting it would also need a flag on `chassis.torso_frame`,
# which is a change to the shared module and therefore not a one-body decision.
#
# THIS CHANGE IS A RE-POSE, NOT A REMOVAL, AND SO IT IS NOT CHEAPER. A shorter
# shin is the same box and a raked antenna is the same cylinder: 2,584 triangles
# out, 2,584 back. Height being bearing-invariant is the whole argument for it
# and it never needed to be free as well.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import td_scene as td
import enemy_chassis as chassis

ORTHO_SCALE = chassis.ORTHO_SCALE
WALK_FRAMES = 8

# Slow and heavy: a shorter stride than the Gleaner's 28, and less arm.
SWING_DEG = 20.0
ARM_SWING_DEG = 8.0

# 22 board px / 31.8032 px per unit = 0.692 u across. Just inside it.
DRUM_RADIUS = 0.335
DRUM_DEPTH = 0.30
# Low on the body -- the mass sits at the belly, which is what makes it read as
# carried rather than worn, and what keeps the crown clear.
DRUM_Z = -0.055
DRUM_X = 0.045

# --- the height reduction ----------------------------------------------------
#
# The chassis shin is 0.380. This is the Tun's, and the difference is how far
# the hips -- and therefore the cask, the torso, the arms and the head -- drop
# below the chassis reference height. Everything is expressed off SHIN_LEN so
# that the leg and the drop can never disagree.
#
# 0.325 is not a taste: 0.084 of drop puts the cask on the raised boot and 0.124
# puts it through. See the floor table in the header before moving it.
SHIN_LEN = 0.325
HIP_DROP = 0.380 - SHIN_LEN

# The antenna, laid back over the cask rather than deleted. Degrees of rake off
# vertical: 0 is the chassis pose, 90 would be flat. At 68 its tip stops 0.020 u
# below the head, so the HEAD owns the crown and the antenna no longer sets the
# model's height. Its radius and length are the chassis antenna's, untouched --
# the thing that must survive the downsample is its width, not its bearing.
ANTENNA_RAKE_DEG = 68.0
ANTENNA_AT = (-0.145, 0.05, 0.33)


def build_drum(m, body, lift):
    """The Tun's hold: a broad low cask, lying on its side across the body.

    NEW PART, DECLARED. Not the sealed cargo cage in another shape -- see the
    file header. The glow is recessed inside a dark hoop exactly the way the
    cage recesses its core, because that lesson (naked emissive slabs read as
    detached pink balloons) is about emissive surfaces at this scale and is not
    specific to the cage.
    """
    axis = (math.radians(90.0), 0.0, 0.0)   # lie the cylinder across +Y
    parts = [
        td.cyl("drum_body", DRUM_RADIUS, DRUM_DEPTH,
               location=(DRUM_X, 0.0, DRUM_Z + lift), rotation=axis,
               mat=m["tin"], parent=body, verts=12),
        # Two hoops. They are what stop a plain cylinder reading as a barrel of
        # nothing, and they carry the value break across the widest surface.
        td.cyl("drum_hoop_f", DRUM_RADIUS * 1.04, 0.045,
               location=(DRUM_X, 0.105, DRUM_Z + lift), rotation=axis,
               mat=m["tin_dark"], parent=body, verts=12),
        td.cyl("drum_hoop_b", DRUM_RADIUS * 1.04, 0.045,
               location=(DRUM_X, -0.105, DRUM_Z + lift), rotation=axis,
               mat=m["tin_dark"], parent=body, verts=12),
        # The bung: the one saturated thing, recessed in a dark collar.
        td.cyl("drum_bung_collar", 0.105, 0.05,
               location=(DRUM_X + 0.30, 0.0, DRUM_Z + lift + 0.02),
               rotation=(0.0, math.radians(90.0), 0.0),
               mat=m["tin_dark"], parent=body, verts=12),
        td.cyl("drum_bung", 0.068, 0.032,
               location=(DRUM_X + 0.335, 0.0, DRUM_Z + lift + 0.02),
               rotation=(0.0, math.radians(90.0), 0.0),
               mat=m["cargo_core"], parent=body, verts=12),
        # A brass strap over the top, the same field-repair language as the
        # shin cuff -- this faction closes things with one broad band.
        td.box("drum_strap", (0.075, 0.34, 0.030),
               location=(DRUM_X - 0.02, 0.0, DRUM_Z + lift + DRUM_RADIUS),
               mat=m["brass"], parent=body),
    ]
    return parts


def build_short_legs(m, body, lift):
    """The Tun's legs: the chassis leg with a shorter shin. NEW PART, DECLARED.

    FORKED FROM `enemy_chassis.legs()` AT CHASSIS_VERSION 1, and forked rather
    than parameterised because the chassis is shared by five shipped bodies and
    a length argument on it is a five-file re-export. Everything except the shin
    is the chassis leg to the digit: the same knee, the same stance
    (`chassis.LEG_L_REST` / `LEG_R_REST`, which is the leg tuck and is not in
    question), the same brass repair cuff on the right shin only, the same foot.
    A change to any of those in the chassis will NOT reach this body.

    The shin is 0.325 where the chassis is 0.380, and the foot rises by the same
    0.055 so the sole sits at local z = -(0.480 - HIP_DROP). `build()` takes the
    same 0.055 out of `lift`, so the hip arrives exactly where the shorter leg
    can still stand on z = 0 and the walk's sole solver has nothing to correct.

    A LIMB ROOT STILL STAYS AT ITS JOINT and takes no lift beyond the body's --
    see the chassis. Returns (leg_l, leg_r).
    """
    out = []
    shin_z = -0.05 - SHIN_LEN / 2.0
    for tag, rest in (("l", chassis.LEG_L_REST), ("r", chassis.LEG_R_REST)):
        leg = td.root("leg_" + tag)
        leg.parent = body
        leg.location = (rest[0], rest[1], rest[2] + lift)
        td.box("knee_" + tag, (0.11, 0.105, 0.10), location=(0.0, 0.0, -0.05),
               mat=m["tin_dark"], parent=leg)
        td.box("leg_%s_shin" % tag, (0.08, 0.08, SHIN_LEN),
               location=(0.0, 0.0, shin_z), mat=m["tin"], parent=leg)
        if tag == "r":
            td.cyl("repair_cuff", 0.058, 0.11, location=(0.0, 0.0, shin_z),
                   mat=m["brass"], parent=leg)
        td.box("foot_" + tag, (0.18, 0.125, 0.065),
               location=(0.045, 0.0, -0.4475 + HIP_DROP), mat=m["tin_dark"],
               parent=leg)
        out.append(leg)
    return tuple(out)


def build_raked_antenna(m, body, lift):
    """The chassis antenna, laid back over the cask. NEW PART, DECLARED.

    `chassis.head(antenna=False)` drops the upright one and this replaces it,
    because the chassis offers a flag and not a pose. SAME CYLINDER: radius
    0.026, length 0.23, tin_dark, the same 16 degrees of lateral cant. Only the
    rake and the mount move.

    IT IS NOT DELETED, AND THAT IS DELIBERATE. The chassis calls the antenna
    "cheap, broad, and load bearing -- what stops the silhouette reading as a
    person at icon size". Raking it keeps that break in the outline while giving
    up the 0.156 u of crown it was spending, and swept back it lands inside the
    cask's own x envelope, so the fore/aft extent does not grow.
    """
    return [
        td.cyl("antenna", 0.026, 0.23,
               location=(ANTENNA_AT[0], ANTENNA_AT[1], ANTENNA_AT[2] + lift),
               rotation=(math.radians(16.0), math.radians(-ANTENNA_RAKE_DEG),
                         0.0),
               mat=m["tin_dark"], parent=body),
    ]


def build():
    """Returns (root, body, parts) -- the chassis carrying a cask."""
    m = chassis.materials()
    body_z = 0.0
    # HIP_DROP comes out of the lift, not out of `body_z`. The body root stays
    # at z = 0 -- that is model contract clause 3b and it is what keeps
    # `model.top` honest -- while every part it carries is authored 0.055 lower
    # than the chassis reference. The legs are shortened by the same amount, so
    # the feet still reach the floor.
    lift = chassis.BODY_REFERENCE_Z - body_z - HIP_DROP

    root = td.root("slow")
    body = td.root("slow_body")
    body.parent = root
    body.location = (0.0, 0.0, body_z)

    chassis.torso_frame(m, body, lift)
    build_drum(m, body, lift)          # NOT cargo_cage -- see the header.
    chassis.head(m, body, lift, lens_segments=8, lens_rings=4, antenna=False)
    build_raked_antenna(m, body, lift)
    arm_l, arm_r = chassis.arms(m, body, lift)
    leg_l, leg_r = build_short_legs(m, body, lift)
    shield = chassis.shield_projectors(m, body, lift)

    parts = {"arm_l": arm_l, "arm_r": arm_r, "leg_l": leg_l, "leg_r": leg_r,
             "shield_parts": shield}
    chassis.set_shield_visible(parts, False)
    return root, body, parts


def animate_walk(body, parts, frames=WALK_FRAMES):
    chassis.animate_walk(body, parts, frames=frames, swing_deg=SWING_DEG,
                         arm_swing_deg=ARM_SWING_DEG)


def export_build():
    """The exporter contract: build, hide, animate, return the frame count."""
    _root, body, parts = build()
    chassis.set_shield_visible(parts, False)
    animate_walk(body, parts, WALK_FRAMES)
    return WALK_FRAMES
