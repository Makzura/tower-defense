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
# spent that way. The legs are the chassis legs, unmodified.
#
# WHY IT IS STILL CHEAP. A drum is one cylinder plus two hoops where the cage is
# sixteen parts. The Tun is the widest Easy body and one of the cheapest.
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


def build():
    """Returns (root, body, parts) -- the chassis carrying a cask."""
    m = chassis.materials()
    body_z = 0.0
    lift = chassis.BODY_REFERENCE_Z - body_z

    root = td.root("slow")
    body = td.root("slow_body")
    body.parent = root
    body.location = (0.0, 0.0, body_z)

    chassis.torso_frame(m, body, lift)
    build_drum(m, body, lift)          # NOT cargo_cage -- see the header.
    chassis.head(m, body, lift, lens_segments=8, lens_rings=4)
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
