# ---------------------------------------------------------------------------
# Enemy type `armored` -- the Drudge. 4 hp, 20 defence, speed x0.95, bounty 4.
#
#   blender --background --factory-startup --python tools/blender/export_mesh.py \
#           -- --only=enemy-armored
#
# THE SEPARATOR IS A REMOVAL OF CONCAVITY, NOT AN ADDITION OF PLATE. The card's
# stated tell -- "pinched at the waist" -- does not exist: mira rasterised the
# Gleaner over 8 frames x 12 yaws and found 12 px of interior concavity in the
# torso band across all 96 samples, 0.125 px per sample. There is no waist to
# pinch, at rest or at any point in the walk.
#
# What the poured sheath actually does is swallow the Gleaner's TWO real
# concavities: the neck notch (5 px between two 8 px masses) and the hip taper
# (10 px slab down to 4 px legs). One sheath, collar to knee, no plate edges,
# no seams, no notch anywhere.
#
#   Gleaner = lollipop.  Drudge = bollard.
#
# WHY IT IS CHEAPER THAN THE GLEANER AND NOT DEARER. This is a FILLING. The
# torso, both torso bands, the hip brace, both knees, both upper arms and both
# shoulder cylinders stop being modelled -- they are sealed inside the sheath
# and would draw nothing. Armour that costs less than no armour is the right
# shape of answer to a brief here; see the house standard on sniper-a4.
#
# PALETTE, AND NO NEW MATERIAL. The coat is `tin`; the exposed inventory below
# elbow and knee stays `tin_dark`. CR 1.91, and the boundary at elbow and knee
# is a long straight horizontal, which is what that ratio needs to separate.
# Running it the other way -- dark coat over light limbs -- merges at CR 1.00.
# `stone` was rejected at CR 1.24 to tin_dark, `bone` because it reads as a
# white coat.
#
# THE MOTION SEPARATOR IS FREE AND IS THE RIGHT ONE. A knee-length coat is
# stiff, so its outline changes less per frame: the Gleaner's phasing exactly,
# with the leg fore/aft extreme reduced from 28 to 18 degrees. Packaged, not
# protected.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import td_scene as td
import enemy_chassis as chassis

ORTHO_SCALE = chassis.ORTHO_SCALE
WALK_FRAMES = 8

# Reduced from the chassis default of 28. The coat is stiff; this is the whole
# motion separator and it costs nothing.
SWING_DEG = 18.0
ARM_SWING_DEG = 9.0

# The sheath runs from just below the knee joint to just inside the head, in
# AUTHORED z -- the chassis convention, relative to the torso origin, so these
# numbers sit directly beside `enemy_chassis` part offsets and can be compared
# with them. Add `lift` to reach body-local space.
#
# Three segments whose radii MATCH AT EVERY JOIN, which is what makes it one
# unbroken taper rather than three stacked cans. Do not introduce a step here:
# a step is a notch, and removing notches is the entire design.
SHEATH = (
    # (name,          bottom z, top z,  bottom r, top r)
    ("sheath_hip",     -0.190,  -0.020,   0.185,   0.165),
    ("sheath_chest",   -0.020,   0.170,   0.165,   0.150),
    ("sheath_collar",   0.170,   0.260,   0.150,   0.105),
)

# The stoop, shared with the Gleaner. Each segment is placed ON the leaned axis
# rather than rotated about its own centre, or the three would splay apart:
# a point h above the torso origin sits at (h*sin(LEAN), 0, h*cos(LEAN)).
LEAN = chassis.LEAN


def build_sheath(m, body, lift):
    """The one poured form. Returns the list of segments."""
    parts = []
    for name, z0, z1, r0, r1 in SHEATH:
        height = z1 - z0
        centre = 0.5 * (z0 + z1)
        parts.append(td.frustum(
            name,
            lower_radius=r0, upper_radius=r1, height=height,
            location=(centre * math.sin(LEAN), 0.0,
                      centre * math.cos(LEAN) + lift),
            mat=m["tin"], parent=body, verts=8,
            rotation=(0.0, LEAN, 0.0)))
    return parts


def build():
    """Returns (root, body, parts) -- the chassis with the torso replaced.

    Assembled from `enemy_chassis` sub-assemblies directly rather than through
    `chassis.build()`, because this body drops four of them. Everything it does
    keep is the shared part, unmodified: same foot, same lens ring, same
    shoulder yoke, same brass shin cuff, same stoop, same sealed cargo cage.
    """
    m = chassis.materials()

    # body_z = 0 so the animated group root sits at the origin and `model.top`
    # is the true top. See enemy_chassis.build().
    body_z = 0.0
    lift = chassis.BODY_REFERENCE_Z - body_z

    root = td.root("armored")
    body = td.root("armored_body")
    body.parent = root
    body.location = (0.0, 0.0, body_z)

    # The sheath REPLACES torso_frame's torso, both bands and the hip brace.
    # The shoulder yoke is kept -- it is chassis identity and it gives the
    # bollard a definite shoulder instead of a dome.
    build_sheath(m, body, lift)
    td.box("shoulder_yoke", (0.21, 0.42, 0.075),
           location=(0.015, 0.0, 0.115 + lift), rotation=(0.0, LEAN, 0.0),
           mat=m["tin_dark"], parent=body)

    # SEALED, and placed rather than reshaped. Pushed 0.045 forward so the core
    # and its guard bars stay proud of the sheath's front face; the side panes
    # sit inside the coat by design, which is what "packaged" means here.
    chassis.cargo_cage(m, body, lift, at=(0.045, 0.0, 0.0))

    # The head is the Gleaner's, minus the neck -- the collar swallows the neck
    # entirely, so a neck cylinder inside it would draw nothing.
    chassis.head(m, body, lift, lens_segments=8, lens_rings=4, neck=False)

    arm_l, arm_r = chassis.arms(m, body, lift, shoulder=False, upper=False)
    leg_l, leg_r = chassis.legs(m, body, lift, knee=False,
                                shin_mat="tin_dark")

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
