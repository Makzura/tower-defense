# ---------------------------------------------------------------------------
# Enemy type `shieldbearer` -- the Tender. 60 hp, speed x0.45, bounty 75.
# Grants +20 shield to the ten strongest bodies every 10 s, with no range limit.
#
#   blender --background --factory-startup --python tools/blender/export_mesh.py \
#           -- --only=enemy-shieldbearer
#
# THE FILE NAME IS THE TYPE ID. `gl-world.js::enemyModel()` looks up
# "enemy-" + enemy.typeId and the type id is `shieldbearer`, so the generated
# file is `enemy-shieldbearer.js`. This module is named for the lore name.
#
# ---------------------------------------------------------------------------
# THE FIRST BODY IN THE PROJECT WITH FOUR LEGS AND NO ARMS.
# ---------------------------------------------------------------------------
#
# Both are handled by `chassis.animate_walk_grouped`, which is why this body
# needed no new gait work:
#
#   * FOUR LEGS AS TWO DIAGONAL PAIRS -- a TROT. A trot is two antiphase
#     groups, which is exactly what `walk_phases` and `support_left_frames`
#     already describe, so there is no new cycle arithmetic anywhere. The pairs
#     are (leg_0, leg_3) and (leg_1, leg_2): front-left with rear-right, then
#     front-right with rear-left, which is what a four-legged machine does and
#     what keeps two feet down on every frame.
#
#   * NO ARMS AT ALL. `chassis.arms()` is not called and `arms=()` is passed to
#     the gait. The old `animate_walk` indexed `parts["arm_l"]` unconditionally
#     and would have raised KeyError here.
#
# THE FEET ARE `foot_0` .. `foot_3` AND THAT IS NOT COSMETIC. The sole solver
# resolves foot names through `bpy.data.objects[...]`, a GLOBAL lookup. Four
# feet all called `foot_l` would collect Blender's automatic `.001` suffixes and
# the solver would measure the WRONG FOOT on three of four -- a body standing on
# one leg and floating on the rest, with nothing raised anywhere.
#
# ---------------------------------------------------------------------------
# THE RACK IS THE BODY. THE CHASSIS IS WHAT CARRIES IT.
# ---------------------------------------------------------------------------
#
# The card is "the vehicle the rest of the fleet's shield hardware belongs to":
# every other harvester wears two or three clamped-on nodes, and this one
# carries the rack they were issued from. So the rack is not decoration on a
# body -- it is the tallest, most expensive and most identifying thing here, and
# the hold is deliberately the smallest in the family relative to body because
# the unit spent its capacity on the rack instead.
#
# ITS SEPARATOR IS HEIGHT AND CROWN, NOT OPENNESS, AND THAT IS A CORRECTION.
# The card calls it "the only see-through silhouette on the road" and mira
# withdrew that as a READ after measuring it: her rasteriser dilates on
# downsample and the real renderer closes gaps harder still -- the Gleaner's
# 1.70 px inter-leg gap renders at 0.00-0.50 px, mean 0.09. Openness survives as
# a ZOOM REWARD, which is worth building for and worth nothing at play size.
#
# What actually separates this body is that it is the TALLEST thing on the road
# at 40.1 px and that its crown is a wide flat frame where every other body's
# crown is a head. Build for those two.
#
# NINE NODES, NOT THE CARD'S TWENTY. Measured: 20 nodes over a ~21 board px body
# is a 2.1 px pitch on a 2.1 px node, and they merge into one solid bar --
# which destroys the openness the count was supposed to create. mira ruled nine,
# three ranks of three, node diameter <= 0.064 u and pitch >= 0.13 u. Both
# bounds are honoured exactly below and neither has slack: NODE_R * 2 = 0.064
# and NODE_PITCH = 0.13.
#
# THE CROWN TARGET IS 6.0 px, NOT THE BRIEF'S 6.3, AND THE DIFFERENCE IS REAL.
# `scratchpad/mira-primitive-audit.js` re-measured the whole batch against the
# SHIPPED primitives rather than sharp-box proxies. Four of five bodies came out
# identical to the digit. This one did not: its worst-bearing crown drops
# 7.0 -> 6.0 px and its lit area drops 12.9 px, because `td_scene.box` bevels by
# default and a bevelled bar is thinner than the sharp bar the proxy drew.
#
# **The bias is a property of the METRIC, not of the proxy**: under 0.2 px on an
# extent, 1-3% on an area, and a full 1.0 px on a small derived pixel count like
# crown width -- which on a 6-7 px quantity is 14-17%. The two numbers this
# body's brief rests on are both in that bad class. So the target is 6.0 with
# headroom and the built crown is re-measured after export rather than assumed.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import td_scene as td
import enemy_chassis as chassis

ORTHO_SCALE = chassis.ORTHO_SCALE
WALK_FRAMES = 8

# It dawdles at the back of the wave at 22.5 u.l./s -- the second slowest body
# in the game. A short stride, and a trot has less body sway than a walk, so the
# roll comes down too.
SWING_DEG = 18.0
ROLL_DEG = 1.4
BOB = 0.022

# The hold: the smallest in the family relative to body, which is a RATIO the
# card states outright. 0.62 against the Skimmer's 0.70 and the Courier's 1.0.
CAGE_AT = (0.0, 0.0, 0.030)
CAGE_SCALE = 0.62

# --- the four legs -----------------------------------------------------------
#
# A quadruped stance, forked from `chassis.legs()` at CHASSIS_VERSION 1 rather
# than parameterised, because the chassis is shared by six shipped bodies and a
# leg-count argument on it is a six-file re-export. The knee, the shin, the foot
# and the shin length are the chassis leg's to the digit; only the count, the
# fore/aft offset and the names differ.
#
# LEG_X matches the rack posts at +-0.09 so the four legs sit directly under the
# four uprights. That is not tidiness -- it is what makes a tall open frame read
# as STRUCTURE rather than as a box balanced on a body.
LEG_X = 0.09
LEG_Y = 0.105
LEG_Z = -0.14

# --- the rack ----------------------------------------------------------------
#
# Four posts, three ranks of three nodes, and a CLOSED TOP FRAME. Every number
# here is mira's measured configuration (`scratchpad/mira-six3.js`, the row
# "TENDER 4-post 9-node"), converted from her world z to the module's local z by
# subtracting the chassis lift of 0.62.
RACK_BASE = 1.02 - chassis.BODY_REFERENCE_Z      # 0.40 local
RACK_TOP = RACK_BASE + 0.52                      # 0.92 local, world 1.54
RACK_POST = 0.042
RACK_POST_X = 0.09
RACK_POST_Y = 0.165
RACK_RANKS = 3
RACK_BAR_T = 0.030
# The bounds mira ruled, and neither has slack -- see the header.
NODE_R = 0.032          # 0.064 across, exactly the ceiling
NODE_PITCH = 0.13       # exactly the floor
NODES_PER_RANK = 3

# The closed top frame. It is the crown, it is the separator, and it is the one
# part of this body that must not be trimmed for cost.
TOP_Z = RACK_TOP + 0.03
TOP_T = 0.034


def build_four_legs(m, body, lift):
    """Four legs in a quadruped stance. Returns (leg_0, leg_1, leg_2, leg_3).

    NEW PART, DECLARED. Forked from `enemy_chassis.legs()` at CHASSIS_VERSION 1.
    The knee, shin, foot and their dimensions are the chassis leg's unchanged;
    what differs is the count, the fore/aft offset and the naming.

    ORDER IS THE GAIT'S CONTRACT AND IT IS NOT ARBITRARY:

        leg_0  front-left    (+x, +y)      leg_1  front-right   (+x, -y)
        leg_2  rear-left     (-x, +y)      leg_3  rear-right    (-x, -y)

    so the diagonal pairs a trot needs are (0, 3) and (1, 2). Renumbering these
    without changing `GAIT_GROUPS` below gives a body that paces or bounds
    instead of trotting -- which still walks, still plants, and looks wrong in a
    way no gate catches.

    THE REPAIR CUFF IS DROPPED. It is the chassis's field-repair signature and
    it belongs on a body that has been patched; this one is the maintenance
    vehicle's charge rather than its patient, and four cuffs would read as four
    identical injuries rather than as one.
    """
    out = []
    for i, (sx, sy) in enumerate(((1.0, 1.0), (1.0, -1.0),
                                  (-1.0, 1.0), (-1.0, -1.0))):
        leg = td.root("leg_%d" % i)
        leg.parent = body
        leg.location = (sx * LEG_X, sy * LEG_Y, LEG_Z + lift)
        td.box("knee_%d" % i, (0.11, 0.105, 0.10), location=(0.0, 0.0, -0.05),
               mat=m["tin_dark"], parent=leg)
        td.box("leg_%d_shin" % i, (0.08, 0.08, 0.38),
               location=(0.0, 0.0, -0.24), mat=m["tin"], parent=leg)
        # GLOBALLY UNIQUE, because the sole solver looks the name up in
        # bpy.data.objects -- see the header.
        td.box("foot_%d" % i, (0.18, 0.125, 0.065),
               location=(0.045, 0.0, -0.4475), mat=m["tin_dark"], parent=leg)
        out.append(leg)
    return tuple(out)


# The trot, as diagonal pairs. Two groups, so `animate_walk_grouped` reproduces
# the tuned biped cycle exactly rather than approximating it.
GAIT_GROUPS = (("leg_0", "leg_3"), ("leg_1", "leg_2"))


def build_rack(m, body, lift):
    """The issuing rack: four posts, three ranks of three nodes, closed top.

    NEW PART -- this body's unique one, and the tallest thing on the road.

    UNMISTAKABLY AFTERMARKET, which the card asks for and which costs nothing:
    the posts are bolted THROUGH the hull on plates, so the plates are modelled
    where the posts meet the body rather than the posts simply starting there.
    A frame that grows out of a hull reads as designed; one that is bolted onto
    it reads as issued later, and that is the whole story of this unit.

    Each node sits RECESSED in its own dark cup, the cargo cage's own
    construction for its core and for the same measured reason -- a naked
    emissive solid at this size reads as a detached blob rather than a light in
    a fitting. No teal ever touches the frame, which is the card's phrase and is
    also just the value ladder working.
    """
    parts = []

    # Four posts, one under each corner, sitting over the four legs.
    for i, (sx, sy) in enumerate(((1.0, 1.0), (1.0, -1.0),
                                  (-1.0, 1.0), (-1.0, -1.0))):
        parts.append(
            td.box("rack_post_%d" % i,
                   (RACK_POST, RACK_POST, RACK_TOP - RACK_BASE),
                   location=(sx * RACK_POST_X, sy * RACK_POST_Y,
                             (RACK_BASE + RACK_TOP) * 0.5 + lift),
                   mat=m["tin_dark"], parent=body))
        # The bolt plate: what makes it aftermarket rather than built in.
        parts.append(
            td.box("rack_plate_%d" % i, (0.075, 0.075, 0.018),
                   location=(sx * RACK_POST_X, sy * RACK_POST_Y,
                             RACK_BASE + lift),
                   mat=m["brass"], parent=body))

    # Three ranks. Each is a cross pair plus its three nodes.
    for k in range(RACK_RANKS):
        z = RACK_BASE + (RACK_TOP - RACK_BASE) * (float(k) / (RACK_RANKS - 1))
        parts.append(
            td.box("rack_bar_y_%d" % k, (0.036, 0.375, RACK_BAR_T),
                   location=(0.0, 0.0, z + lift), mat=m["tin_dark"],
                   parent=body))
        parts.append(
            td.box("rack_bar_x_%d" % k, (0.21, 0.036, RACK_BAR_T),
                   location=(0.0, 0.0, z + lift), mat=m["tin_dark"],
                   parent=body))
        for j in range(NODES_PER_RANK):
            y = -NODE_PITCH + j * NODE_PITCH
            parts.append(
                td.cyl("node_cup_%d_%d" % (k, j), NODE_R + 0.008, 0.030,
                       location=(0.0, y, z + 0.030 + lift),
                       mat=m["tin_dark"], parent=body, verts=8))
            parts.append(
                td.cyl("ley_node_%d_%d" % (k, j), NODE_R, 0.038,
                       location=(0.0, y, z + 0.034 + lift),
                       mat=m["shield_ley"], parent=body, verts=8))

    # THE CLOSED TOP FRAME -- the crown, and the separator. Four members, so the
    # outline at the top is a rectangle rather than a bar: that is what makes
    # this body's crown 6 px wide where every other body's is a head.
    for sx in (1.0, -1.0):
        parts.append(
            td.box("top_rail_x_%d" % int(sx), (0.036, 0.375, TOP_T),
                   location=(sx * 0.115, 0.0, TOP_Z + lift),
                   mat=m["tin_dark"], parent=body))
    for sy in (1.0, -1.0):
        parts.append(
            td.box("top_rail_y_%d" % int(sy), (0.265, 0.036, TOP_T),
                   location=(0.0, sy * 0.185, TOP_Z + lift),
                   mat=m["tin_dark"], parent=body))
    return parts


def build_inspection_pane(m, body, lift):
    """The hinged pane propped open on a shim, low on the body.

    The card's human leftover, and the only warm colour on the unit: one sliver
    of coral escaping a panel somebody left open. It is LOW and it is SMALL --
    the teal above must own the body's colour story, and this is the detail that
    rewards a look rather than one that reads at play size.
    """
    return [
        td.box("pane_shim", (0.020, 0.030, 0.045),
               location=(0.175, 0.085, -0.045 + lift),
               mat=m["brass"], parent=body),
        # Propped, not hanging: the tilt is what says somebody wedged it.
        td.box("pane_door", (0.020, 0.105, 0.130),
               location=(0.190, 0.070, 0.010 + lift),
               rotation=(0.0, math.radians(-24.0), 0.0),
               mat=m["tin_dark"], parent=body),
        td.box("pane_glow", (0.012, 0.070, 0.070),
               location=(0.150, 0.078, 0.005 + lift),
               mat=m["cargo_window"], parent=body),
    ]


def build():
    """Returns (root, body, parts) -- four legs, no arms, one issuing rack."""
    m = chassis.materials()
    body_z = 0.0
    # Body root at z = 0; `lift` puts the parts back. Model contract clause 3b.
    lift = chassis.BODY_REFERENCE_Z - body_z

    root = td.root("shieldbearer")
    body = td.root("shieldbearer_body")
    body.parent = root
    body.location = (0.0, 0.0, body_z)

    chassis.torso_frame(m, body, lift)
    chassis.cargo_cage(m, body, lift, at=CAGE_AT, scale=CAGE_SCALE)
    # No antenna: the rack owns the crown and a spike beside it would blur the
    # one outline this body is separated by.
    chassis.head(m, body, lift, lens_segments=8, lens_rings=4, antenna=False)
    build_rack(m, body, lift)
    build_inspection_pane(m, body, lift)
    legs = build_four_legs(m, body, lift)

    parts = {"leg_0": legs[0], "leg_1": legs[1],
             "leg_2": legs[2], "leg_3": legs[3]}
    # NO shield_projectors. This body IS the shield hardware -- it carries the
    # rack the clamped-on nodes were issued from, so wearing a set of them as
    # well would say the opposite of what the unit is.
    return root, body, parts


def animate_walk(body, parts, frames=WALK_FRAMES):
    """A diagonal trot, and no arms to counter it."""
    chassis.animate_walk_grouped(body, parts, GAIT_GROUPS, frames=frames,
                                 swing_deg=SWING_DEG, bob=BOB,
                                 roll_deg=ROLL_DEG, arms=())


def export_build():
    """The exporter contract: build, animate, return the frame count."""
    _root, body, parts = build()
    animate_walk(body, parts, WALK_FRAMES)
    return WALK_FRAMES
