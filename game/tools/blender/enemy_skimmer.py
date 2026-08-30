# ---------------------------------------------------------------------------
# Enemy type `fast` -- the Skimmer. 2 hp, speed x1.75, bounty 3. First wave 3.
#
#   blender --background --factory-startup --python tools/blender/export_mesh.py \
#           -- --only=enemy-fast
#
# THE SEPARATOR IS A REMOVAL: THE CROWN IS GONE. The Gleaner's raked antenna is
# the tallest thing on it -- z 0.960 to 1.190, the top fifth of the whole figure
# -- and deleting it changes the outline at the one place nothing else occludes.
# That is the strongest and cheapest class of separator this project has
# measured: `sniper-a4` is the worked example in the house standard, the
# cheapest tier and the most distinct, because of what it takes away.
#
# A removal is also the rare separator that is VIEW-INDEPENDENT. It reads at the
# default camera and at max zoom-in alike, so it does not require deciding which
# view the budget protects. An addition at this size usually does.
#
# WHY NOT THE LENS. The obvious "fast" tell is to move or brighten the dot, and
# it is the wrong lever: the lens sits INTERIOR to the silhouette, so moving it
# changes no outline at all and is a recolour by definition. Recolour inside the
# mass is the cheapest pixel to produce and the least visible in motion, where
# the eye gets outline almost exclusively. The crown is outline.
#
# THE CROWN DELETION IS ONE AXIS OF TWO, AND SHIPPING ONLY ONE WAS THE DEFECT.
# The first build of this body deleted the crown and stopped. Measured by otto,
# it read like the Gleaner: pairwise separation 0.48/0.50 against 0.80 for the
# next closest pair, stable at both yaws. mira found the cause and every
# width-defining group was BYTE-IDENTICAL to the Gleaner's -- arms, legs and
# body all to three decimals. The only thing that differed anywhere was the
# body's top, 1.190 -> 1.034.
#
# Worse than "no change": measured over all frames and yaws the first build was
# very slightly WIDER than the Gleaner (0.571 u against 0.532) and 14% stubbier.
# The card asked for THINNER and the build delivered SHORTER, which moves the
# aspect ratio the wrong way. Height alone cannot carry a body whose whole
# family shares one width.
#
# So this body is narrowed on the other axis, which is what the card asked for
# in its own words -- "chest emptied and NARROWED", "arms cut to STUBS", "a
# THINNER outline". Height stays at 1.034: that separator already works and is
# not to be touched.
#
# WHAT SETS A BODY'S WIDTH IS THE SHOULDER YOKE, NOT THE CHEST. The yoke is
# 0.42 across against the torso's 0.24 -- it is the widest part of the entire
# body group, wider than the cage. Narrowing "the chest" without narrowing the
# yoke would have measured no change at all.
#
# THE LEGS ARE DELIBERATELY NOT NARROWED. They sit at +-0.167 and the card does
# not ask them to move, so once the arms and chest come in the LEGS become the
# width-defining part. That is the honest ceiling for this change and it is
# still a large win. Whether the stance follows is a separate decision and not
# mine to take on my own initiative.
#
# THE HOLD MOVES UP AND BACK, AND COMES IN. Placement and scale only -- both are
# what roster Law 02 sanctions in its own words ("the same lens ring at three
# scales"), and the cage's construction, bar count and proportions are
# untouched. A courier carries its load high and close rather than slung at the
# belly. The scale is not decoration: at full size the cage's side struts reach
# +-0.177 and would have been the widest thing on a narrowed body, defeating
# the whole change.
#
# THE GAIT IS THE SECOND SEPARATOR AND IT IS FREE. Motion costs zero triangles
# -- a frame is one 4x4 per animated group. A longer stride at 34 degrees
# against the Gleaner's 28 is a different QUALITY of movement, which is the
# under-used tier signal in the house standard, not more parts.
# ---------------------------------------------------------------------------

import os
import sys

sys.path.append(os.path.dirname(__file__))

import td_scene as td
import enemy_chassis as chassis

ORTHO_SCALE = chassis.ORTHO_SCALE
WALK_FRAMES = 8

# Longer stride than the Gleaner's 28. The arms counter harder to match.
SWING_DEG = 34.0
ARM_SWING_DEG = 18.0

# Up and back: +z lifts the hold to the chest, -x tucks it against the spine.
# Placement is a parameter; the cage itself is sealed.
CAGE_AT = (-0.055, 0.0, 0.075)
# 0.70 brings the cage's widest part (the side struts, +-0.177) to +-0.124, just
# inside the narrowed chest. Scale is a Law 02 variation; shape is not.
CAGE_SCALE = 0.70

# The narrowed chest. The yoke is the binding one -- see the header.
TORSO_W = 0.215
YOKE_W = 0.250          # half-width 0.125, from the Gleaner's 0.210
HIP_W = 0.235
BAND_W = 0.215

# Arm stubs. The root comes inboard from +-0.205 and the shoulder cylinder is
# dropped: the cylinder is what held the width out, and a stub does not need a
# full shoulder span to hang from.
ARM_ROOT_Y = 0.082
STUB_W = 0.082          # half-width 0.041 -> outer edge 0.123
STUB_LEN = 0.21


def build_stub_arms(m, body, lift):
    """Two short arms, inboard. Returns (arm_l, arm_r).

    NOT `chassis.arms(...)` with narrower arguments: an arm cut to a stub is a
    different part, not a thinner version of the same one. The chassis arm is
    four pieces (shoulder, upper, fore, hand) spanning 0.43 down from the
    shoulder; this is one piece plus a cap, and the elbow does not exist.

    The roots keep the names `arm_l` / `arm_r` so the shared gait keys them
    unchanged -- `chassis.animate_walk` counter-swings whatever it is handed.
    """
    out = []
    for tag, sign in (("l", 1.0), ("r", -1.0)):
        arm = td.root("arm_" + tag)
        arm.parent = body
        arm.location = (0.015, sign * ARM_ROOT_Y, 0.11 + lift)
        td.box("arm_%s_stub" % tag, (0.085, STUB_W, STUB_LEN),
               location=(0.0, 0.0, -STUB_LEN * 0.5), mat=m["tin"], parent=arm)
        # A blunt cap where the hand would be. It is what stops the stub
        # reading as an unfinished box at the default view.
        td.box("hand_" + tag, (0.10, STUB_W * 1.05, 0.065),
               location=(0.025, 0.0, -STUB_LEN - 0.02),
               mat=m["tin_dark"], parent=arm)
        out.append(arm)
    return tuple(out)


def build():
    """Returns (root, body, parts) -- no crown, narrowed chest, arm stubs."""
    m = chassis.materials()
    body_z = 0.0
    lift = chassis.BODY_REFERENCE_Z - body_z

    root = td.root("fast")
    body = td.root("fast_body")
    body.parent = root
    body.location = (0.0, 0.0, body_z)

    chassis.torso_frame(m, body, lift, torso_w=TORSO_W, yoke_w=YOKE_W,
                        hip_w=HIP_W, band_w=BAND_W)
    chassis.cargo_cage(m, body, lift, at=CAGE_AT, scale=CAGE_SCALE)
    # antenna=False is the height half of the design.
    chassis.head(m, body, lift, lens_segments=8, lens_rings=4, antenna=False)
    arm_l, arm_r = build_stub_arms(m, body, lift)
    # The legs are NOT narrowed -- see the header. They become the
    # width-defining part and that is the honest ceiling for this change.
    leg_l, leg_r = chassis.legs(m, body, lift)
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
