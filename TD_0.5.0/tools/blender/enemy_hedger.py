# ---------------------------------------------------------------------------
# Enemy type `angry` -- the Hedger. 14 hp, speed x0.7, bounty 15, sizeScale 1.25.
#
#   blender --background --factory-startup --python tools/blender/export_mesh.py \
#           -- --only=enemy-angry
#
# THE SEPARATOR IS HEIGHT AND IT IS ALREADY PAID FOR. `sizeScale` 1.25 puts this
# body at 215 lit px in 25 rows against the Gleaner's 148 in 20 -- +72 px and
# +5 rows, the largest separator of the five, for zero triangles and zero
# authoring. So THE GEOMETRY HERE IS NOT SCALED UP. The runtime does it; baking
# a second 1.25 into the mesh would land it at 1.5625x and make it a brute.
#
# "SIZE IS NOT A TIER SIGNAL" DOES NOT APPLY HERE, and it is worth saying why
# rather than just asserting the exception. That rule was measured on the
# Siphon's path-A growth: 0.96 px per tier, five tiers, under one pixel each.
# This is a 25% linear step between two different enemy TYPES seen in different
# waves. Same words, different quantity, opposite conclusion.
#
# THE ARM IS THE SECOND READ AND IT IS BROKEN SYMMETRY. One lump hanging off one
# side of an otherwise ordinary body, on a chassis where every other member of
# the faction is symmetrical about its centre line. That asymmetry is the whole
# signal; the arm does not need to be legible AS a tool.
#
# WHERE IT HANGS DECIDES WHETHER IT READS AT ALL, AND THE REASON IS CONTRAST,
# NOT AREA. juno measured two 1 px features at yaw 45: the lens survives a
# deletion test and the cargo core does not, on identical area -- local contrast
# 68 against 10. So a bar tucked against the torso is the cargo-core case and can
# vanish outright, while the same bar against empty ROAD is the lens case. The
# road is the highest-contrast background available anywhere on this model. The
# low placement is therefore measured, not preferred, and is not traded for
# anything.
#
# WHAT IS ACTUALLY GUARANTEED, STATED HONESTLY. An earlier version of this
# header claimed the lower end breaks the hip line "at every crank angle". That
# is false and geometrically impossible: the arm turns a full revolution, so
# when the bar points UP the lowest part of the assembly is the pivot itself.
# Making it true at every frame would force the pivot below the hip, and a
# full-length bar swung from there goes through the road. MEASURED ON THE
# EXPORTED FILE, not predicted: the lower end is below the hip line on 5 of 12
# frames, its lowest point is 0.018 u off the road and its highest is 1.182
# against the crown's 1.190, so the crank never touches the road and never
# steals model.top. Roughly half the cycle is spent against road, which is what
# delivers the read.
#
# BOTH NUMBERS IN THIS PARAGRAPH WERE WRONG WHEN FIRST WRITTEN -- "every crank
# angle", then "7 of 12 and 0.05 u" -- and both were caught by measuring the
# exported geometry rather than by re-reading the intent. Whatever else changes
# here, keep quoting this paragraph from a measurement.
#
# SIZED AGAINST A MEASURED FLOOR, NOT AGAINST THE MINIMUMS. juno closed the
# house standard's open bracket: the sceptre reads at 11.6% of its figure, the
# Gleaner's inspection windows do not at 0.7-3%, so the transferable floor is
# ~11% of the figure -- about 24 px on this 215 px body. kaz's stated minimums
# (0.40 long, 0.10 thick) project to ~20 px² and sit AT that floor rather than
# above it. The bar is therefore taken LONGER rather than thicker: length breaks
# the outline, while thickness past ~2.5 px buys area inside the silhouette
# where it is worth least. At 0.52 x 0.105 the bar is ~10.7 x 2.6 px = ~28 px²,
# and the step plate takes the assembly to ~34 px².
#
# THE STEP PLATE IS LOAD-BEARING, NOT DECORATION. It is what turns a thin line
# that anti-aliases away into a lump the eye can catch.
#
# THE HOLD IS SMALLER, AND IT IS NOT A READ. This frame traded cargo space for
# the arm, so the cage is carried at 0.82 scale. That is a Law 02 scale
# variation of the sealed part -- "the same lens ring at three scales" -- not a
# reconstruction: nothing about its proportions, bar count or materials moves.
# It is interior to the silhouette, so it is fiction rather than signal, and it
# is not counted as one of this body's reads.
#
# TWELVE FRAMES, BECAUSE EIGHT STUTTERS. At 0.98 strides/sec an 8-frame cycle is
# 7.8 pose changes/sec. The crank turns ONE revolution per stride -- the slowest
# rate it can express -- phase-offset half a stride from the leading leg so its
# low point falls between footfalls rather than on one.
#
# NO WIND-UP, NO HEAD TURN, ONE VERSION. `angry` has no `windUpSeconds`, so it
# never stops moving; the comment at js/enemy.js:455 claiming otherwise is
# false. More decisive: the engine gives an enemy exactly one frame index --
# `walk` -- so there is no attack-frame seam to build into. The arm therefore
# lives inside the walk cycle as part of the gait, and there is no second pose
# to author.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import td_scene as td
import enemy_chassis as chassis

ORTHO_SCALE = chassis.ORTHO_SCALE

# Eight stutters at this speed. See the header.
WALK_FRAMES = 12

# Slow and heavy: 0.7 speed multiplier, the second slowest on the roster.
SWING_DEG = 22.0
ARM_SWING_DEG = 10.0

# The cage at 0.82 -- Law 02 scale variation, not a rebuild.
CAGE_SCALE = 0.82

# --- the arm, in AUTHORED z (relative to the torso origin) -------------------
#
# The hip line is the hip brace, authored z -0.175 to -0.095 (world 0.445 up).
# Two hard limits bracket the pivot, and they pull opposite ways:
#   - the bar must not reach the road at its low point -> pivot > length + plate
#   - the bar must not out-top the antenna at its high point, or it steals
#     `model.top` from the crown -> pivot + length + plate < 1.190 world
# At pivot world 0.60 and length 0.52 the low point is 0.047 u off the road and
# the high point is 1.155, so the crown keeps the extreme and model.top stays
# 1.190. Verified by export, not by arithmetic alone.
CRANK_PIVOT_Z = -0.02
CRANK_PIVOT_X = -0.02
# Outboard of the swinging forearm, which spans y 0.155..0.255 -- this clears it
# by 0.015 u at the near face rather than merely looking clear in one pose.
CRANK_PIVOT_Y = 0.325

BAR_LENGTH = 0.52        # past the 0.40 floor; length is what breaks outline
BAR_THICK = 0.105        # >= 0.10 floor; 2.6 px at sizeScale 1.25


def build_arm(m, body, lift):
    """The hanging crank. Returns its animated pivot empty.

    The bar gets its OWN group root, so the crank is one 4x4 per frame and
    costs no geometry -- the same trade every other moving part in this project
    makes. The step plate is deliberately boot-sized: a bare bar at this width
    anti-aliases into a line, and the plate is what makes the lower end read as
    one lump against the road.
    """
    crank = td.root("crank")
    crank.parent = body
    crank.location = (CRANK_PIVOT_X, CRANK_PIVOT_Y, CRANK_PIVOT_Z + lift)

    td.box("crank_bar", (BAR_THICK, BAR_THICK, BAR_LENGTH),
           location=(0.0, 0.0, -BAR_LENGTH * 0.5),
           mat=m["tin"], parent=crank)
    # Boot-sized, and the same box the foot uses -- this faction builds one
    # kind of flat plate and puts it wherever something has to sit on ground.
    td.box("crank_plate", (0.18, 0.125, 0.065),
           location=(0.03, 0.0, -BAR_LENGTH - 0.03),
           mat=m["tin_dark"], parent=crank)
    # One broad brass band, the same field-repair language as the shin cuff.
    td.cyl("crank_collar", BAR_THICK * 0.75, 0.055,
           location=(0.0, 0.0, -0.10), mat=m["brass"], parent=crank)
    return crank


def build():
    """Returns (root, body, parts) -- the Gleaner, plus one hanging arm."""
    m = chassis.materials()
    body_z = 0.0
    lift = chassis.BODY_REFERENCE_Z - body_z

    root = td.root("angry")
    body = td.root("angry_body")
    body.parent = root
    body.location = (0.0, 0.0, body_z)

    chassis.torso_frame(m, body, lift)
    chassis.cargo_cage(m, body, lift, scale=CAGE_SCALE)
    chassis.head(m, body, lift, lens_segments=8, lens_rings=4)
    arm_l, arm_r = chassis.arms(m, body, lift)
    # The brass shin cuff is dropped: 1 px, and this body already carries its
    # brass on the crank collar where there is room for it to read.
    leg_l, leg_r = chassis.legs(m, body, lift, repair_cuff=False)
    crank = build_arm(m, body, lift)
    shield = chassis.shield_projectors(m, body, lift)

    parts = {"arm_l": arm_l, "arm_r": arm_r, "leg_l": leg_l, "leg_r": leg_r,
             "crank": crank, "shield_parts": shield}
    chassis.set_shield_visible(parts, False)
    return root, body, parts


def animate_walk(body, parts, frames=WALK_FRAMES):
    """The chassis gait, plus one crank revolution per stride.

    THE PHASE OFFSET IS THE POINT. The crank's low point is placed half a stride
    from the leading leg so it falls BETWEEN footfalls. Landing it on a footfall
    would read as the arm striking the ground, which is a different animal from
    a tool hanging off a frame and turning because the frame is walking.
    """
    chassis.animate_walk(body, parts, frames=frames, swing_deg=SWING_DEG,
                         arm_swing_deg=ARM_SWING_DEG)

    # Support handover happens at frames 4 and 10 of 12, so BOTH frame 1 and
    # frame 7 are midpoints between footfalls and either satisfies the spec.
    # Frame 1 is chosen: it is the rest frame, so the tool hangs DOWN at rest --
    # "hangs like a tool that was hung there" rather than standing up in the
    # pose the model is measured and previewed in.
    low_at = 0
    for f in range(frames):
        frame = 1 + f
        angle = 2.0 * math.pi * (f - low_at) / frames
        chassis.key(parts["crank"], frame, rotation=(0.0, angle, 0.0))


def export_build():
    """The exporter contract: build, hide, animate, return the frame count."""
    _root, body, parts = build()
    chassis.set_shield_visible(parts, False)
    animate_walk(body, parts, WALK_FRAMES)
    return WALK_FRAMES
