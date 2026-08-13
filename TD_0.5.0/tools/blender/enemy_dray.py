# ---------------------------------------------------------------------------
# Enemy type `colossus` -- the Dray. 550 hp, speed x0.35 (17.5 u.l./s), the
# largest sizeScale in the game at 2.10.
#
#   blender --background --factory-startup --python tools/blender/export_mesh.py \
#           -- --only=enemy-colossus
#
# THE FILE NAME IS THE TYPE ID. `gl-world.js::enemyModel()` looks up
# "enemy-" + enemy.typeId and the type id is `colossus`, so the generated file
# is `enemy-colossus.js`. This module is named for the lore name, exactly as
# `enemy_tender.py` -> `enemy-shieldbearer.js` and `enemy_skimmer.py` ->
# `enemy-fast.js`.
#
# ---------------------------------------------------------------------------
# THE FIRST SIX-LEGGED BODY, AND THE FIRST BODY THAT IS ITS OWN CONTAINER.
# ---------------------------------------------------------------------------
#
# TWO GROUPS, NOT SIX. A hexapod alternating tripod is TWO antiphase groups,
# which is exactly what `walk_phases` and `support_left_frames` already
# describe, so six legs needed no new cycle arithmetic and no change to
# `enemy_chassis.py`. `animate_walk_grouped`'s own docstring names this case.
# More than two groups would collide in pairs -- `walk_phases` is a SYMMETRIC
# triangle wave, so shifts `s` and `frames/2 - s` sample the same value -- and
# that costs nothing here because a tripod gait is two groups by definition.
#
# THE FEET ARE `foot_0` .. `foot_5` AND THAT IS NOT COSMETIC. The sole solver
# resolves foot names through `bpy.data.objects[...]`, a GLOBAL lookup. Six
# feet all called `foot_l` would collect Blender's automatic `.001` suffixes
# and the solver would measure the WRONG FOOT on five of six -- a body standing
# on one leg and floating on the other five, with no error raised anywhere.
#
# AND THE LEG NUMBERING **IS** THE GAIT. `GAIT_GROUPS` below pairs the numbers,
# not the positions, so renumbering the legs without changing the groups gives
# a body that still walks, still plants and looks wrong in a way no gate
# catches. The intended tripods are stated in `build_six_legs`'s docstring and
# nothing tests them.
#
# ---------------------------------------------------------------------------
# NO CARGO CAGE, AND THAT IS RULED RATHER THAN OMITTED.
# ---------------------------------------------------------------------------
#
# The lore lead's rule is that a body carries a cargo cage UNLESS the body
# itself is the container. The card is explicit -- "not a machine carrying a
# container, but a container that was given the smallest frame that would move
# it" -- so the Dray qualifies, and the drum is built here as a NEW part in
# this module rather than by widening `chassis.cargo_cage`. That cage is sealed
# precisely so that a body needing a different object builds one instead of
# quietly restyling the faction's shared part.
#
# So this body calls NO geometry from the chassis at all. What it does take is
# `materials()` and `animate_walk_grouped()`, which is still a real coupling:
# a change to the shared palette or to the shared gait reaches this model, a
# change to `torso_frame`/`cargo_cage`/`legs`/`head` does not. That distinction
# is written into the chassis header beside the importer count.
#
# THE FACTION READ therefore has to come from what is left, and each of these
# is deliberate rather than incidental: the same stamped FOOT CASTING at all
# six corners, the same LENS RING and lens ball, the same two-value tin ladder
# with brass as the one warm metal, and the same stoop -- see below.
#
# ---------------------------------------------------------------------------
# THE THREE NUMBERS THIS BODY IS BUILT AGAINST
# ---------------------------------------------------------------------------
#
# 1. THE PLAN BUDGET, AND IT IS THE TIGHTEST ON THE BOARD.
#
#    `Enemy.HOVER_PAD_PX` is 9 flat board px and the frost ring sits at
#    `radiusPx() + 4`, also flat, while `radiusPx() = 11 * sizeScale` and the
#    model draws at `extent_u * 31.8032 * sizeScale`. So the budget in MODEL
#    UNITS is `(22 * sizeScale + 8) / (31.8032 * sizeScale)` and it FALLS as the
#    body grows. At sizeScale 2.10 that is **0.8115 u** -- the tightest of any
#    body that ships, and the brief spends 0.785 of it.
#
#    `DRUM_HALF_Y` is therefore not a taste decision: 2 x 0.3925 = 0.785 is the
#    envelope, and everything else in y is inboard of it. Exceeding 0.8115 is
#    survivable (the Loader ships at 127% and the Seeder at 174%) but it costs
#    the hover and frost rings being drawn inside the body's own silhouette,
#    so "this body is selected" and "this body is slowed" stop reading on it.
#
#    MEASURE THE ENVELOPE ACROSS ALL FRAMES, NEVER THE REST POSE. The body roll
#    is what makes the difference here: `animate_walk_grouped` rolls about the
#    body root, which stands at z = 0 on the GROUND, so a roll swings the whole
#    0.30 u of drum height sideways and ADDS to the y extent rather than
#    shrinking it by a cosine. That is why `ROLL_DEG` is 0.9 and not the
#    chassis default 2.6 -- see the constant.
#
# 2. THE ASPECT IS A CATEGORICAL READ, AND THE BACK REST COMPETES WITH IT.
#
#    The brief separates this body as "wider than tall" -- W/H 1.037 on mira's
#    rasteriser, mean over 4 frames x 8 yaws in the 1280x720 logical view. That
#    is a RASTER statistic in screen px and it has no model-unit form; it is
#    quoted here in its own space with its definition attached, never converted.
#
#    Adding the operator's back rest has already cost this claim once (1.037 ->
#    0.987) and was restored by re-proportioning. Every vertical dimension
#    below is therefore spent against that ratio: the drum is 0.27 u through
#    where a cask would be rounder, the legs are 0.12 u where the chassis leg is
#    0.48, and the seat sits almost on the deck. If any of them grows, re-run
#    the aspect before believing the model still reads wide.
#
# 3. THE SWING LIFT IS HARD-CODED AND IT SETS THE HIP HEIGHT.
#
#    `animate_walk_grouped` lifts a swinging leg's sole to
#    `swing_z = 0.012 + 0.045 * abs(cos t)`, peaking at **0.057 u**, and that
#    number is not a parameter. On a 0.48 u chassis leg it is 12% of the limb
#    and invisible. On this body's 0.12 u leg it is 48%, and the solver
#    translates the whole LEG ROOT, so the knee rises 0.057 into the chassis.
#
#    The rail is therefore sized to SWALLOW the lifted knee and to CLEAR the
#    lifted foot. Both bounds are asserted in `build()` -- and BOTH ASSERTS
#    WERE TRUE ON A BUILD THAT WAS STILL WRONG, which is the part to remember:
#    they compare rest-pose numbers, while the real clearance is between a leg
#    that lifts and a rail that bobs down to meet it. See `RAIL_HI` for the two
#    terms the arithmetic misses and for the measured bound that replaced it.
#
#    THE SAME LIFT SETS THE FORE/AFT PITCH, for a different reason. Adjacent
#    leg rows belong to OPPOSITE tripods, so they swing towards each other, and
#    `LEG_X` has to exceed the foot's own length plus that closing travel. The
#    first build used 0.120 against a 0.150 foot and the mid and rear feet ran
#    0.070 u -- 2.9 screen px -- through each other on every frame.
#
#    NEITHER FAULT IS VISIBLE TO ANY GATE THIS PROJECT HAS.
#    `visual-pass/model-review.js` says so in its own header; `enemy-angry`
#    shipped with a crank collar through an arm past every green one. The
#    instrument that found both is the per-frame per-part AABB pass in
#    `tools/blender/enemy_dray_check.py`, and it is worth running on any body
#    whose limbs are short relative to the shared gait's fixed 0.057 lift.
#
# ---------------------------------------------------------------------------
# WHAT WAS CUT FROM THE CARD, AND WHAT REPLACED IT
# ---------------------------------------------------------------------------
#
# THE EIGHT SIGHT GLASSES PER FLANK ARE CUT. mira measured them: 16 features on
# a 547 px figure, each well under 1 px of outline. They are replaced by the
# three brass bands the card also names, sized to **2.5 screen px each** --
# `BAND_DEPTH` 0.060 u x 19.73 px/u x 2.10 = 2.49 px broadside. The bands are
# also this body's road-contrast insurance: the drum overhangs the road further
# than anything else in the faction, and brass clears both road values (3.28 /
# 5.75 palette CR) where tin is marginal against `roadTop` at 1.51.
#
# THE RIVETS ARE CUT for the same reason and are not replaced. A rivet on this
# drum is a fifth of a pixel; the rolled rims and the bands carry "riveted
# drum" between them.
#
# THE STOOP SURVIVES AS A RAKED PROW, NOT A LEANING BODY. `chassis.LEAN` is
# 20 degrees and it is the family's character, but this body's separator is
# that it is LEVEL -- the card's own confuse clause against the Loader is "no
# arms, and horizontal". Leaning the drum would spend the separator to buy the
# family read. So the lean is applied to the prow alone, where it says the same
# thing about the design without touching the horizontal.
#
# ---------------------------------------------------------------------------
# THE OPERATOR'S BENCH IS STRUCTURE, NOT DECORATION
# ---------------------------------------------------------------------------
#
# It is the only human leftover in batch 2 that reads at play size, and it only
# reads with the vertical back rest: measured by mira as 3.5% of the figure and
# **0 px at its worst bearing** without it, 8.1% and **+4 px** with it. The
# reason generalises -- a leftover survives every bearing only if it breaks the
# TOP of the silhouette, which is the one placement no yaw can hide.
#
# `REST_H` is 0.26 u exactly, which is the ruled figure, and the rest is the
# tallest thing on the model by 0.049 u so that the break is real rather than
# nominal. Do not trim it to buy aspect; re-proportion the drum instead.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import td_scene as td
import enemy_chassis as chassis

ORTHO_SCALE = chassis.ORTHO_SCALE
WALK_FRAMES = 8

# The slowest body in the game at 17.5 u.l./s, carrying the most mass on the
# shortest legs. A short stride and almost no roll: the roll is held down
# because it is charged against the plan budget (see the header) and because a
# level drum is the read.
SWING_DEG = 14.0
ROLL_DEG = 0.9
BOB = 0.018

# The sole lift `animate_walk_grouped` applies to a swinging leg, at its peak.
# Not a parameter of that function -- it is `0.012 + 0.045 * abs(cos t)`. The
# rail bounds below are derived from it and asserted in build().
SWING_LIFT = 0.057

# --- the drum ----------------------------------------------------------------
#
# Every z here is WORLD z with the feet on 0. `lift` converts to the module's
# local space at the bottom of each builder, exactly as the chassis does.
#
# DRUM_HALF_Y IS THE ENVELOPE. 2 x 0.3925 = 0.785 u against a 0.8115 u budget
# at sizeScale 2.10. Nothing else in this file may reach further in y.
DRUM_HALF_Y = 0.3925
DRUM_R = 0.135
RIM_R = DRUM_R + 0.014
RIM_DEPTH = 0.040
BAND_R = DRUM_R + 0.012
BAND_DEPTH = 0.060          # 2.49 screen px broadside -- mira's ruled 2.5
BAND_AT = (0.0, 0.20, -0.20)

# --- the chassis -------------------------------------------------------------
HIP_Z = 0.120
FOOT_T = 0.045
KNEE_LO, KNEE_HI = 0.050, 0.132
SHIN_LO, SHIN_HI = 0.012, 0.058
RAIL_LO = 0.126             # > FOOT_T + SWING_LIFT = 0.102
# > KNEE_HI + SWING_LIFT (0.175) IS NOT ENOUGH, and the first build proved it.
# Two terms the rest-pose arithmetic misses, both measured per frame by
# `tools/blender/enemy_dray_check.py` rather than reasoned:
#
#   * the RAIL COMES DOWN TO MEET THE LEG. The rail rides the body, which bobs
#     `BOB` and rolls `ROLL_DEG`; the leg does not. At the worst frame the rail
#     ceiling is 0.011 below where a rest-pose reading puts it.
#   * the SOLVED LIFT IS NOT `swing_z`. `_set_sole_height` solves the sole to
#     `swing_z` AFTER the swing rotation, and rotating a forward-offset foot
#     about the hip dips its leading corner, so the solver lifts the whole leg
#     by `swing_z + dip`. The dip is up to 0.019 at full swing.
#
# The two do not peak together -- `swing_z` peaks where the phase is 0 and the
# dip peaks where the phase is +-1, which is the same antiphase that makes a
# max-against-max reading of any of this wrong. So the bound is not derivable
# from the constants and the number below is the MEASURED requirement plus
# margin: worst knee top 0.1786 against a ceiling that has dropped 0.011.
RAIL_HI = 0.210
# FORE/AFT PITCH, AND IT IS SET BY THE FOOT, NOT BY TASTE. Adjacent rows are
# in OPPOSITE tripods, so they swing towards each other: the pitch has to
# exceed the foot's own length (0.150) plus the closing travel of an antiphase
# pair (0.048). At the 0.120 this file was first built with, the mid and rear
# feet ran 0.070 u through each other on every frame -- 2.9 screen px, on four
# pairs, and no gate in this project would have said a word.
LEG_X = 0.205               # fore/aft spacing of the three leg rows
LEG_Y = 0.215               # the rails, and the legs directly under them
RAIL_LEN = 0.560            # long enough that the frame carries the bench and
                            # the tail plate -- a bench post has to land on
                            # something, and at 0.355 it landed on air

ROLLER_R = 0.032
# THE ROLLER SPACING LOOKS LIKE FREE HEIGHT AND IT IS NOT. The drum sits
# `sqrt(DRUM_R^2 - ROLLER_X^2)` above the roller tops, so moving the rollers
# apart drops the whole load deeper into the cradle at no cost to the drum's
# radius -- which on a "wider than tall" claim carrying 2% of margin is worth
# real ratio. I tried it at 0.110 and it does not work, for a reason worth
# stating rather than rediscovering:
#
#   **THE FLOOR IS THE BRASS BAND, NOT THE DRUM.** The bands stand 0.012 proud
#   of the shell, so the lowest thing on the load is `DRUM_Z - BAND_R`, and the
#   drum's belly crosses BOTH rails at every y because it lies along y. At
#   ROLLER_X 0.110 the bands ran 0.0047 u through the rails and the cross
#   braces on every frame -- and the assert did not fire, because it was
#   written against `DRUM_R`. It is written against `BAND_R` now.
#
# So `DRUM_Z` is floored at `RAIL_HI + BAND_R` however it is reached, and the
# total height of this body is floored with it. There is about 0.008 u left in
# the whole stack and it is not worth spending.
ROLLER_X = 0.100
ROLLER_LEN = 0.50
ROLLER_Z = RAIL_HI + ROLLER_R

# The drum rests ON the rollers: its surface at x = +-ROLLER_X touches their
# tops, which is what "slung in a cradle on two rollers" has to mean
# geometrically. Solved, not typed, so a change to any of the three inputs
# keeps the contact.
DRUM_Z = (ROLLER_Z + ROLLER_R
          + math.sqrt(DRUM_R * DRUM_R - ROLLER_X * ROLLER_X))

# --- the operator's bench ----------------------------------------------------
BENCH_X = 0.240
SEAT_TOP = 0.288
SEAT_T = 0.026
# The post is set back from the seat's own centre so that it clears the lens
# ball. The first build had the lens 0.0040 u inside it -- sub-pixel, and still
# the emissive identity part buried in a strut, which is exactly the thing
# clause 8 exists to stop.
POST_X = BENCH_X - 0.030
REST_H = 0.26               # mira's ruled figure, exactly
REST_X = BENCH_X - 0.070
REST_TOP = SEAT_TOP + REST_H

# --- the prow ----------------------------------------------------------------
NOSE_X = 0.230
LENS_Z = 0.160              # low on the front, as the card asks
TAIL_X = -0.265


def build_drum(m, body, lift):
    """The load: a riveted drum lying on its side ACROSS the road.

    NEW PART, DECLARED -- this body's unique one, and the reason it carries no
    cargo cage. `chassis.cargo_cage` is sealed and was not touched.

    IT MUST READ AS A SEPARATE OBJECT, which the card insists on because the
    moment it reads as a torso the unit becomes an animal rather than a
    container on a frame. Three things do that work and none of them is
    decoration:

      * it OVERHANGS BOTH ENDS. The drum is 0.785 across against a chassis
        0.498 wide over the rails -- it is the only part of the body that
        reaches the envelope, and the frame visibly does not support its ends.
      * the VALUE LADDER INVERTS here. Everywhere else in the faction the
        largest surface takes the darkest value; here the drum is `tin` on a
        `tin_dark` frame, because the drum IS the character and the eye is
        supposed to go to it. The dark rolled rims cap it at both ends so the
        light cylinder is bounded rather than bleeding into the sky.
      * the THREE BRASS BANDS are 0.060 u deep -- 2.5 screen px broadside --
        which is the size mira ruled when the card's sixteen sight glasses were
        cut for being sub-pixel. They also carry the drum's outline against the
        road, which tin does not do reliably on its own.
    """
    parts = [
        td.cyl("drum", DRUM_R, 2.0 * DRUM_HALF_Y,
               location=(0.0, 0.0, DRUM_Z + lift),
               rotation=(math.radians(90.0), 0.0, 0.0),
               mat=m["tin"], parent=body, verts=16),
    ]
    for sy in (1.0, -1.0):
        parts.append(
            td.cyl("drum_rim_%d" % int(sy), RIM_R, RIM_DEPTH,
                   location=(0.0, sy * (DRUM_HALF_Y - RIM_DEPTH * 0.5),
                             DRUM_Z + lift),
                   rotation=(math.radians(90.0), 0.0, 0.0),
                   mat=m["tin_dark"], parent=body, verts=16))
    for i, y in enumerate(BAND_AT):
        parts.append(
            td.cyl("drum_band_%d" % i, BAND_R, BAND_DEPTH,
                   location=(0.0, y, DRUM_Z + lift),
                   rotation=(math.radians(90.0), 0.0, 0.0),
                   mat=m["brass"], parent=body, verts=16))
    return parts


def build_cradle(m, body, lift):
    """The frame: two side rails, two cross braces and the two cradle rollers.

    NEW PART, DECLARED. Forked from nothing -- `chassis.torso_frame` builds a
    torso and this body has none.

    THE RAILS ARE SIZED BY THE GAIT, NOT BY EYE. See the header: the swinging
    leg's root rises 0.057 u, so the rail has to be deep enough to swallow the
    lifted knee and high enough off the ground to clear the lifted foot. Both
    bounds are asserted in build().

    THE ROLLERS RUN PARALLEL TO THE DRUM, which is the only orientation that
    makes "cradle rollers" mean anything: a roller across the drum's axis would
    be a chock. They span 0.50 in y so they bear on both rails at +-0.215 and
    are visible under the drum's overhang from every bearing, which is where
    the drum stops reading as a torso.
    """
    parts = []
    for sy in (1.0, -1.0):
        parts.append(
            td.box("rail_%d" % int(sy),
                   (RAIL_LEN, 0.068, RAIL_HI - RAIL_LO),
                   location=(0.0, sy * LEG_Y, (RAIL_HI + RAIL_LO) * 0.5 + lift),
                   mat=m["tin_dark"], parent=body))
    for sx in (1.0, -1.0):
        # TOP-ALIGNED, NOT FULL-DEPTH. A brace filling the rail's section
        # reaches down into the arc a swinging foot sweeps -- measured 0.0026 u
        # of overlap on four frames in eight, on four of the six legs. It ties
        # the tops of the two rails, which is all it is for.
        parts.append(
            td.box("cross_brace_%d" % int(sx), (0.070, 0.498, 0.040),
                   location=(sx * 0.155, 0.0, RAIL_HI - 0.020 + lift),
                   mat=m["tin_dark"], parent=body))
        parts.append(
            td.cyl("cradle_roller_%d" % int(sx), ROLLER_R, ROLLER_LEN,
                   location=(sx * ROLLER_X, 0.0, ROLLER_Z + lift),
                   rotation=(math.radians(90.0), 0.0, 0.0),
                   mat=m["brass"], parent=body, verts=12))
    parts.append(
        td.box("tail_plate", (0.055, 0.300, 0.100),
               location=(TAIL_X, 0.0, 0.150 + lift),
               mat=m["tin_dark"], parent=body))
    return parts


def build_six_legs(m, body, lift):
    """Six legs in three rows of two. Returns (leg_0 .. leg_5).

    NEW PART, DECLARED. Forked from `enemy_chassis.legs()` at CHASSIS_VERSION 1
    rather than parameterised, because the chassis is shared by seven shipped
    bodies and a leg-count argument on it is a seven-file re-export. What is
    kept from the chassis leg is the ORDER of the parts and the FOOT CASTING --
    a broad flat plate offset forward of the shin, which is the faction's most
    repeated shape and the main thing carrying the read on a body with no
    torso, no arms and no head. What differs is the count, the spacing, the
    names, and the length: 0.12 u against the chassis leg's 0.48.

    ORDER IS THE GAIT'S CONTRACT AND IT IS NOT ARBITRARY:

        leg_0  front-left    leg_1  front-right
        leg_2  mid-left      leg_3  mid-right
        leg_4  rear-left     leg_5  rear-right

    so the alternating tripods are (0, 3, 4) and (1, 2, 5) -- front-left with
    mid-right with rear-left, then its mirror, which is what an insect does and
    what keeps three feet planted on every frame. Renumbering these without
    changing `GAIT_GROUPS` gives a body that shuffles both sides together: it
    still walks, still plants, and looks wrong in a way no gate catches.

    THE REPAIR CUFF IS DROPPED. One cuff on one leg is the chassis's
    field-repair signature; six legs would either carry six identical injuries
    or one that reads as an accident of which leg got the part.
    """
    out = []
    order = ((1.0, 1.0), (1.0, -1.0), (0.0, 1.0), (0.0, -1.0),
             (-1.0, 1.0), (-1.0, -1.0))
    for i, (sx, sy) in enumerate(order):
        leg = td.root("leg_%d" % i)
        leg.parent = body
        leg.location = (sx * LEG_X, sy * LEG_Y, HIP_Z + lift)
        td.box("knee_%d" % i, (0.088, 0.082, KNEE_HI - KNEE_LO),
               location=(0.0, 0.0, (KNEE_HI + KNEE_LO) * 0.5 - HIP_Z),
               mat=m["tin_dark"], parent=leg)
        td.box("leg_%d_shin" % i, (0.058, 0.058, SHIN_HI - SHIN_LO),
               location=(0.0, 0.0, (SHIN_HI + SHIN_LO) * 0.5 - HIP_Z),
               mat=m["tin"], parent=leg)
        # GLOBALLY UNIQUE, because the sole solver looks the name up in
        # bpy.data.objects -- see the header.
        td.box("foot_%d" % i, (0.150, 0.110, FOOT_T),
               location=(0.020, 0.0, FOOT_T * 0.5 - HIP_Z),
               mat=m["tin_dark"], parent=leg)
        out.append(leg)
    return tuple(out)


# The alternating tripod, as two antiphase groups. Two groups, so
# `animate_walk_grouped` reproduces the tuned biped cycle exactly rather than
# approximating it -- and so the phases cannot collide, which they do above two.
GAIT_GROUPS = (("leg_0", "leg_3", "leg_4"), ("leg_1", "leg_2", "leg_5"))


def build_bench(m, body, lift):
    """The operator's bench, bolted ahead of the drum. The human leftover.

    NEW PART, DECLARED.

    IT IS STRUCTURE AND IT IS THE ONLY LEFTOVER IN THE BATCH THAT READS. See
    the header for the measurement; the short form is that the seat alone adds
    0 px at its worst bearing and the seat WITH the vertical back rest adds 4,
    because the rest breaks the top of the silhouette and the top is the one
    placement no yaw can hide.

    IT IS A COMPONENT, NOT A MARKING, which is the lore lead's test for a human
    leftover -- wrong proportion, wrong material, fitted rather than stamped.
    So the seat pan is BRASS where the whole rest of the frame is tin, it is
    bolted through a plate rather than growing out of the deck, and it sits
    almost on the deck because there is nowhere else for it to go on a body
    this low. A posture or a pose would not have qualified; a bolted-on seat
    off something else does.
    """
    return [
        td.box("bench_post", (0.048, 0.095, SEAT_TOP - 0.125),
               location=(POST_X, 0.0, (SEAT_TOP + 0.125) * 0.5 + lift),
               mat=m["tin_dark"], parent=body),
        td.box("bench_bolt_plate", (0.075, 0.128, 0.016),
               location=(POST_X - 0.010, 0.0, RAIL_HI + 0.008 + lift),
               mat=m["brass"], parent=body),
        # Worn, so it is the one polished thing on a grey machine.
        td.box("bench_seat", (0.120, 0.150, SEAT_T),
               location=(BENCH_X, 0.0, SEAT_TOP - SEAT_T * 0.5 + lift),
               mat=m["brass"], parent=body),
        # THE BACK REST. 0.26 u exactly, and the tallest thing on the model.
        td.box("bench_rest", (0.026, 0.145, REST_H),
               location=(REST_X, 0.0, SEAT_TOP + REST_H * 0.5 + lift),
               mat=m["tin_dark"], parent=body),
        # Above the rail line, and above the lens: the board and the lens both
        # want the front of the chassis and the lens is the one that must win.
        td.box("bench_foot_board", (0.075, 0.160, 0.016),
               location=(BENCH_X + 0.060, 0.0, RAIL_HI + 0.038 + lift),
               mat=m["tin_dark"], parent=body),
    ]


def build_prow_lens(m, body, lift):
    """The raked nose plate and the lens, low on the front.

    NEW PART, DECLARED. Forked from `enemy_chassis.head()`, which hard-codes
    its z at 0.325 local -- a head at the top of a body that has none. What is
    kept is the LENS RING AND LENS BALL at the chassis's own proportions
    (ring 0.058 x 0.072 against the chassis's 0.065 x 0.085, ball 0.042 against
    0.048, both 8/4), because the lens ring is one of the four things carrying
    the faction read on this body. What is dropped is the head box, the neck
    and the antenna: the card says no head above the load, and an antenna would
    put a second thing on the crown where the back rest has to be the only one.

    THE RAKE IS WHERE THE STOOP WENT. `chassis.LEAN` is the family's character
    and this body may not lean, because level is its separator -- so the prow
    carries it instead and the drum stays horizontal.
    """
    return [
        td.box("prow", (0.078, 0.165, 0.070),
               location=(NOSE_X, 0.0, LENS_Z + lift),
               rotation=(0.0, chassis.LEAN, 0.0),
               mat=m["tin_dark"], parent=body),
        td.cyl("lens_ring", 0.058, 0.072,
               location=(NOSE_X + 0.052, 0.0, LENS_Z + lift),
               rotation=(0.0, math.radians(90.0), 0.0),
               mat=m["tin_dark"], parent=body),
        td.ball("lens", 0.042,
                location=(NOSE_X + 0.100, 0.0, LENS_Z + lift),
                mat=m["lens"], parent=body, segments=8, rings=4),
    ]


def build():
    """Returns (root, body, parts) -- six legs, no arms, no torso, one drum."""
    # The bounds the shared gait imposes on this chassis. They are asserted
    # rather than commented because the failure they prevent -- the foot
    # walking up through the rail, the knee breaking out of the top of it -- is
    # silent in every gate this project has: `model-review.js` has no
    # interpenetration test at all, and `enemy-angry` shipped with a collar
    # through an arm past every green one.
    #
    # **THESE ASSERTS ARE NECESSARY AND THEY ARE NOT SUFFICIENT.** They compare
    # two REST-POSE numbers, and the real clearance is between a leg that lifts
    # and a rail that bobs down to meet it. The first build passed all three
    # and still put the knee 0.0046 u above the rail on two frames in eight.
    # The authority is the per-frame per-part pass in
    # `tools/blender/enemy_dray_check.py`; run it after any change to a
    # constant above and read its table, not these three lines.
    assert RAIL_LO > FOOT_T + SWING_LIFT, "rail sits on the lifted foot"
    assert RAIL_HI > KNEE_HI + SWING_LIFT + BOB, "lifted knee leaves the rail"
    assert DRUM_Z - BAND_R > RAIL_HI, "the brass bands foul the rail"
    assert REST_TOP > DRUM_Z + RIM_R, "the back rest no longer breaks the top"
    assert 2.0 * DRUM_HALF_Y <= 0.8115, "drum exceeds the plan budget at rest"

    m = chassis.materials()
    body_z = 0.0
    # Body root at z = 0; `lift` puts the parts back. Model contract clause 3b:
    # the group that owns the topmost geometry (the back rest) is then stored
    # in world space, so the raw max z IS the true max z and the health bar
    # cannot be drawn inside the mesh.
    #
    # **`lift` IS NOT `BODY_REFERENCE_Z - body_z` HERE, AND THAT IS THE ONE
    # PLACE THIS FILE DEPARTS FROM THE HOUSE PATTERN.** The chassis authors
    # every offset relative to the TORSO ORIGIN, which stands at
    # `BODY_REFERENCE_Z` = 0.62 above the feet, so its bodies add that back.
    # This body has no torso and no part of it is positioned relative to one:
    # every constant above is WORLD z with the feet on 0, because a drum on a
    # cradle on six legs is a stack measured from the ground up. So `lift`
    # compensates for `body_z` alone.
    #
    # Writing `BODY_REFERENCE_Z - body_z` here by reflex is not a cosmetic
    # error and it does not fail loudly: it lifts the whole body 0.62 clear of
    # the ground, and then `_set_sole_height` faithfully solves each planted
    # sole back down to z = 0, so the legs stretch 0.62 out of their hips while
    # the exporter reports a clean file. It cost one export. The symptom to
    # look for is `raw top z` coming back 0.62 above what the layout predicts.
    lift = -body_z

    root = td.root("colossus")
    body = td.root("colossus_body")
    body.parent = root
    body.location = (0.0, 0.0, body_z)

    # NO chassis.torso_frame  -- the card: no torso.
    # NO chassis.cargo_cage   -- this body IS the container. See the header.
    # NO chassis.head         -- no head above the load; the lens is on the prow.
    # NO chassis.arms         -- the card: no arms. `arms=()` in the gait.
    build_cradle(m, body, lift)
    build_drum(m, body, lift)
    build_bench(m, body, lift)
    build_prow_lens(m, body, lift)
    legs = build_six_legs(m, body, lift)

    parts = dict(("leg_%d" % i, legs[i]) for i in range(6))
    return root, body, parts


def animate_walk(body, parts, frames=WALK_FRAMES):
    """An alternating tripod, and no arms to counter it."""
    chassis.animate_walk_grouped(body, parts, GAIT_GROUPS, frames=frames,
                                 swing_deg=SWING_DEG, bob=BOB,
                                 roll_deg=ROLL_DEG, arms=())


def export_build():
    """The exporter contract: build, animate, return the frame count."""
    _root, body, parts = build()
    animate_walk(body, parts, WALK_FRAMES)
    return WALK_FRAMES
