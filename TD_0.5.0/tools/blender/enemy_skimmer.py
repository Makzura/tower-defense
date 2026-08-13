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
# THE HOLD MOVES UP AND BACK. Placement only -- the cage is the faction's sealed
# part and its construction is untouched. A courier carries its load high and
# close rather than slung at the belly, and moving it up and back also clears
# the space the deleted crown used to occupy, so the body reads as leaning into
# its own run rather than as a Gleaner with a part snapped off.
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


def build():
    """Returns (root, body, parts) -- the chassis with no crown."""
    m = chassis.materials()
    body_z = 0.0
    lift = chassis.BODY_REFERENCE_Z - body_z

    root = td.root("fast")
    body = td.root("fast_body")
    body.parent = root
    body.location = (0.0, 0.0, body_z)

    chassis.torso_frame(m, body, lift)
    chassis.cargo_cage(m, body, lift, at=CAGE_AT)
    # antenna=False is the whole design.
    chassis.head(m, body, lift, lens_segments=8, lens_rings=4, antenna=False)
    arm_l, arm_r = chassis.arms(m, body, lift)
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
