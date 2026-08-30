# ---------------------------------------------------------------------------
# Enemy type `shielded` -- the Courier (displayName "Bulwark"). 12 hp + 24
# shield, speed x0.9 -> x1.8 when the field breaks, bounty 20.
#
#   blender --background --factory-startup --python tools/blender/export_mesh.py \
#           -- --only=enemy-shielded
#
# THE FILE NAME IS THE TYPE ID. `gl-world.js::enemyModel()` looks up
# "enemy-" + enemy.typeId and the type id is `shielded`, so the registered name
# and the generated file are `enemy-shielded`, not `enemy-courier`. This module
# is named for the lore name, which is the convention five of the nine bodies
# follow; do not try to derive one listing from the other.
#
# ---------------------------------------------------------------------------
# THE HOLD IS THE WIDEST PART OF THE BODY, AND THAT IS THE DESIGN.
# ---------------------------------------------------------------------------
#
# The card is "the unit whose load is worth more than the unit" and asks for
# "proportionally the largest hold on any small unit". That is a RATIO, and the
# cheap way to get it wrong is to scale the cage UP -- which would push its side
# struts (+-0.177 at scale 1.0) past everything else and make a wide body.
#
# So the cage stays at scale 1.0 and the FRAME comes in around it. On the
# narrowed chest below, the cage's struts at +-0.177 are wider than the shoulder
# yoke's +-0.125, so the hold becomes the width-defining part of the whole body
# by being the only thing that did not shrink. That is what "proportionally the
# largest" means, it costs no triangles, and it puts the widest point of the
# silhouette exactly where the card wants the eye.
#
# WHY THE CROWN STAYS, AND THIS IS NOT A FREE CHOICE. The Skimmer's entire
# identity is a REMOVED crown -- see its header, where the antenna deletion is
# the separator the whole body is built on. This body borrows the Skimmer's
# narrow widths, so if it also dropped the antenna the two would differ by a
# hoop and nothing else. The Courier keeps its antenna precisely because the
# Skimmer owns the removal. Narrow is shared; short is not.
#
# "NARROWEST" HERE MEANS ASPECT, NOT ABSOLUTE WIDTH. mira's measured board puts
# the Skimmer at 9.3 px wide and this body at 12.2, so this is not the thinnest
# thing on the road. It is the thinnest for its HEIGHT -- W/H 0.463 against the
# Skimmer's 0.482 -- which is what a tall narrow parcel-carrier reads as.
#
# THE ARMS ARE FOLDED, AND THAT IS WHY THEY ARE FORKED. `chassis.arms()` hangs
# four pieces straight down from the shoulder and `chassis.animate_walk`
# counter-swings them. This body's card says "arms folded and clamped flat,
# because there is nothing for them to carry", so `build_folded_arms` below
# rebuilds them across the chest and `ARM_SWING_DEG = 0` stops the gait moving
# them. NEW PART, DECLARED, forked from CHASSIS_VERSION 1 -- the chassis is
# shared by nine shipped bodies and must not be edited for one.
#
# The roots keep the names `arm_l` / `arm_r`, so the shared gait keys them
# unchanged. It is the same contract the Skimmer's stubs use.
#
# ---------------------------------------------------------------------------
# TWO THINGS DELIBERATELY NOT BUILT, BOTH RECORDED RATHER THAN FORGOTTEN.
# ---------------------------------------------------------------------------
#
# 1. "THE MOST UPRIGHT BODY IN THE FAMILY" IS NOT BUILT AND CANNOT BE FROM HERE.
#    The 20-degree stoop is `chassis.LEAN`, a MODULE CONSTANT baked into four of
#    `torso_frame`'s five boxes. It is not a parameter, so standing this body up
#    means either forking the torso or adding a defaulted `lean=LEAN` argument to
#    the chassis -- and the second is scheduled as part of the additive-chassis
#    pass that follows this body, not before it. kaz's build order puts this body
#    FIRST precisely because it touches no shared code, and taking the lean
#    change early would spend that property for about 0.4 px: the stoop costs
#    roughly 0.34 * (1 - cos 20 deg) = 0.020 u of height, which is 0.4 screen px
#    at this body's 1.15 scale. It is not what makes this silhouette.
#
# 2. THE THUMB-LATCH IS CUT. The card asks for "a thumb-latch on the lid, wired
#    shut with brass". mira measured it at +1.2 px of new silhouette and +0.0 at
#    the worst bearing -- below her feature floor -- and cut it as a read while
#    keeping it as a zoom reward. It is not built here because a part that adds
#    nothing at the worst bearing is 108 triangles of nothing; see
#    `siphon-a1`'s coins and nails for the same lesson learned the expensive way.
#
# ---------------------------------------------------------------------------
# THE FIELD YOKE IS A TORUS, NOT A RING OF BOXES.
# ---------------------------------------------------------------------------
#
# mira's rasteriser models the hoop as 16-18 boxes stepped around a circle
# because boxes are what her instrument speaks. That is a PROXY for measuring a
# silhouette and not a construction spec: built literally it would cost 18 x 108
# = 1,944 triangles, half again the whole cargo cage, for a shape
# `td_scene.torus` draws in 192 and shades smoothly instead of faceting at the
# zoom the player's camera actually reaches (11.2x closer than default).
#
# The proxy's 0.92-0.95 vertical squash is also dropped. It is a 5% ovalisation
# on a hoop 0.60 u across -- 0.03 u, under a screen pixel at this scale -- and a
# real ring is the thing the card asks for: "the only closed hoop on the roster,
# reading exactly like a carrying handle over a parcel".
#
# SEALED MEANS THE PLATING SWAP, NOT A RESHAPE. `cargo_cage`'s `window_mat` and
# `core_mat` are two of its three sanctioned variations, so a sealed hold is
# reachable without touching one proportion of the frozen part. Both go to
# `tin_dark` here. That leaves this body with no red anywhere but the head lens
# and makes the three ley nodes its only saturated colour -- which is what
# mira's Tender entry means by calling the Courier the only other unit wearing
# teal, and what the card means by "when the shield goes the nodes go dark and
# the hoop stays".
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import td_scene as td
import enemy_chassis as chassis

ORTHO_SCALE = chassis.ORTHO_SCALE
WALK_FRAMES = 8

# 45 u.l./s while shielded, 90 when it breaks -- but the walk is DISTANCE
# driven (gl-world.js), so a doubled speed already doubles the cycle rate for
# free and the stride does not need to be authored fast. 26 is a shade over the
# Gleaner's 28 shortened for a shorter, more clipped step under a load held
# high and close.
SWING_DEG = 26.0
# Zero, and load bearing: the arms are CLAMPED. `chassis.animate_walk` keys the
# arm roots on every frame whatever it is handed, so this is what holds them
# still rather than deleting the keys.
ARM_SWING_DEG = 0.0

# The narrowed chest, taken from the Skimmer (`enemy_skimmer.py`) because
# mira's Courier row measures against `enemy-fast` as "the shipped narrow one".
# The YOKE is the one that matters -- the chassis says in its own docstring that
# it is the widest part of any body, so a brief asking for narrow that moves
# only `torso_w` measures no change at all.
TORSO_W = 0.215
YOKE_W = 0.250          # against the chassis 0.420
HIP_W = 0.235
BAND_W = 0.215

# On the chest: forward and a little up, so the hoop can arc over it. Placement
# is a parameter; the cage itself is sealed.
CAGE_AT = (0.020, 0.0, 0.050)
# NOT scaled. See the header -- the frame shrank, the hold did not, and that is
# the whole proportion the card is asking for.
CAGE_SCALE = 1.0

# --- the field yoke ----------------------------------------------------------
#
# ONE CLOSED HOOP, AND IT IS A TALL ELLIPSE. NOT A CIRCLE. The vertical radius is
# well over twice the horizontal one, and that ratio is not styling -- it is the
# body's separator, measured by mira on 2026-08-13
# (`scratchpad/mira-courier.js`):
#
#   ellipse, apex 1.24   W 12.2  H 26.2 [25.1-27.8]  W/H 0.463  lit 223
#   circle  r 0.26       W 12.2  H 24.0 [20.9-26.4]  W/H 0.507  lit 192
#
# The Courier's ONLY hold against the DRUDGE is that its height range never
# overlaps the Drudge's [18.8-24.1] at any frame or bearing. At the circular
# apex that separation is gone and the pair -- which is the one this body's own
# card names in its Confuse line -- fails. The apex is the whole part.
#
# "ONLY" IS LITERAL, AND IT USED TO HAVE A SECOND TERM. The sealed hold looked
# like a second axis against the Drudge (which carries a LIT cage) until juno
# swept that exact pair: a `core_red` part against a body repainted to `tin`
# measures palette CR 1.72 but a RENDERED median of 1.27-1.34 against a 2.0 band.
# Two values that measure as the same value are not a read. The seal is still
# built -- it is right for the fiction, it is the cage's own sanctioned plating
# swap, it reshapes nothing and it pays at the zoomed camera -- but it buys no
# separation, and if some other constraint ever pushes back, THE SEAL IS WHAT
# GIVES WAY AND THE GEOMETRY IS NOT.
#
# THE ARCH IS A SIX-OF-EIGHT READ, NOT A CATEGORICAL ONE. The ring lies in the
# fore/aft plane, so at yaw 90 and 270 it is edge-on and merges into the body as
# a vertical bar. mira's enclosed-background px by yaw at rv 0.60:
#
#   6.3 / 7.3 / 0 / 5.8 / 0.5 / 5.5 / 0 / 9.0
#
# Zero at broadside in EVERY configuration she tested, out to rv 0.64 -- so this
# is a property of the plane the hoop lies in and not something a bigger hoop
# fixes. It reads as a handle at six bearings of eight. That is worth having and
# it is not "the one with the handle on it"; do not lean on it any harder.
#
# WHY THIS IS A CHAIN OF TUBES AND NOT A SCALED TORUS. mira suggested building
# `td_scene.torus` circular and scaling it 2:1 in z for the same 192 triangles.
# That does not work, and the reason is worth keeping because it is invisible
# until measured: scaling the major plane scales THE TUBE with it. Built at
# R = 0.26, minor 0.030 and scaled 2x, the bar comes out
#
#   at the apex   0.120 thick   (2.4x the 0.05 it should be)
#   z extent      +-0.580       (apex 1.30, against the 1.265 outer specified)
#
# and both errors land at the APEX, which is the one place the separator lives.
# A circular torus keeps the section (0.060 at the apex, correct) and loses the
# shape. You cannot have both from one primitive.
#
# So the hoop is 20 `td_scene.tube` segments stepped around the true ellipse --
# mira's own segment count, so the built ring is her measured proxy rather than
# an approximation of it. 400 triangles against the torus's 192. The extra 208
# are bought deliberately: kaz retired the Gleaner-parity ceiling because cost
# is triangles x bodies on the road, and at six Couriers this is +1,248 against
# a 26,808 peak. A triangle that holds a separator is the cheapest kind there is.
#
# THE RATIO IS 2.31:1, NOT 2:1, AND THE EXTRA CAME FROM A MEASURED SHORTFALL.
# The first build used rv 0.52 (a true 2:1) with a 0.025 bar, and measured 0.2 px
# of clearance to the Drudge where the brief predicted 1.0. The cause was not the
# apex, which was exactly where it was specified: mira's proxy bar is a BOX
# 0.05 x 0.05, whose corners reach 0.0354 from centre, where a round tube of
# radius 0.025 reaches 0.025 everywhere. The proxy ring is fractionally larger in
# every direction, and that is worth 0.8 px of height and width at once.
#
# So both constants moved, on mira's ruling of 2026-08-13, and they do different
# jobs -- taking only one of them is not a cheaper version of this:
#
#   rv 0.520  bar 0.025   margin 0.8   <- first build, the shortfall
#   rv 0.520  bar 0.030   margin 0.9   <- the bar alone buys 0.1 px
#   rv 0.562  bar 0.025   margin 1.5
#   rv 0.600  bar 0.030   margin 2.3   <- ruled
#
# The bar is the CAUSE fix and it is right on its own terms -- the card says "one
# heavy hoop" and 0.05 was under-specified whatever the measurement said -- but
# the 0.8 px went into the ring's overall EXTENT, and the only lever on that
# is rv.
#
# AND THE PAIR IS STILL WEAK. mira's number, recorded here because it is the
# thing a future pass will want and will not otherwise find: at rv 0.60 the
# Courier/Drudge MEAN height difference is 6.0 px against a single-body swing of
# about 4 px across bearings. That is 1.5x the noise, not a comfortable margin.
# This pair is carried by three individually marginal terms -- taller, narrower,
# and an arch -- and the package is what works, not any one of them. Do not spend
# any of these three on the assumption the other two will cover.
YOKE_SEGMENTS = 20
YOKE_RH = 0.26          # horizontal radius
YOKE_RV = 0.60          # vertical radius -- the separator, and load bearing
YOKE_BAR = 0.030        # tube radius; 0.06 across, "one heavy hoop"
# Local, so the world centre is z 0.10 + lift 0.62 = 0.72 and the centreline
# apex is 1.32.
YOKE_AT = (0.10, 0.0, 0.10)
# The three inset nodes, as fractions of a HALF turn -- 27, 90 and 153 degrees,
# which is mira's u = 0.15 / 0.5 / 0.85 along the upper arc. Below the shoulder
# of the hoop they would be occluded by the body at most bearings.
YOKE_NODE_U = (0.15, 0.5, 0.85)

# Folded arms, and the y is budgeted against the CAGE rather than chosen.
#
# The hold has to stay the widest part of the body (see the header) and the
# cage's side struts sit at +-0.177. With the shoulder cylinder dropped the
# widest thing on the arm is the upper box at 0.085 across, so a root at 0.130
# puts the arm's outer edge at 0.1725 -- inside the struts by 0.0045, which is
# the whole point and is why neither number may drift without the other.
#
# The shoulder CYLINDER is dropped for the reason the Skimmer drops it: the
# cylinder is what holds the width out, and at radius 0.065 it would have put
# the arm at 0.195 and made the arms, not the hold, the widest part of the body.
ARM_ROOT_Y = 0.130
FOLD_Z = -0.135


def build_folded_arms(m, body, lift):
    """Two arms folded and clamped flat across the chest. Returns (arm_l, arm_r).

    NEW PART, DECLARED. Forked from `enemy_chassis.arms()` at CHASSIS_VERSION 1
    and forked rather than parameterised, because the chassis is shared by nine
    shipped bodies and a pose argument on it is a nine-file re-export. The
    upper arm is the chassis part's box at the chassis part's dimensions; the
    shoulder cylinder is dropped on width grounds (see `ARM_ROOT_Y`), and the
    forearm and hand are rotated across the body and brought inboard, which is
    the fold.

    THE ROOTS KEEP THEIR NAMES so `chassis.animate_walk` keys them unchanged --
    the same contract `enemy_skimmer.build_stub_arms` uses. What stops them
    swinging is `ARM_SWING_DEG = 0`, not the absence of keys.
    """
    out = []
    for tag, sign in (("l", 1.0), ("r", -1.0)):
        arm = td.root("arm_" + tag)
        arm.parent = body
        arm.location = (0.015, sign * ARM_ROOT_Y, 0.11 + lift)
        td.box("arm_%s_upper" % tag, (0.09, 0.085, 0.17),
               location=(0.0, 0.0, -0.095), mat=m["tin"], parent=arm)
        # The fold: the forearm lies across the chest, canted inboard, and the
        # hand sits on the far side of the strongbox rather than beside the hip.
        td.box("arm_%s_fore" % tag, (0.085, 0.155, 0.085),
               location=(0.075, sign * -0.045, FOLD_Z),
               rotation=(0.0, 0.0, sign * math.radians(-24.0)),
               mat=m["tin_dark"], parent=arm)
        td.box("hand_" + tag, (0.095, 0.075, 0.070),
               location=(0.105, sign * -0.115, FOLD_Z),
               mat=m["tin_dark"], parent=arm)
        # The clamp: one brass band over the folded forearm, the same
        # field-repair language as the chassis shin cuff. It is what makes the
        # fold read as CLAMPED rather than merely posed.
        td.box("arm_%s_clamp" % tag, (0.032, 0.048, 0.105),
               location=(0.075, sign * -0.045, FOLD_Z),
               mat=m["brass"], parent=arm)
        out.append(arm)
    return tuple(out)




def build_field_yoke(m, body, lift):
    """The closed hoop over the strongbox, with three inset ley nodes.

    NEW PART -- this body's unique one, and the only closed hoop on the roster.
    Twenty straight tube segments stepped around a 2:1 ellipse; see the header
    for why a torus cannot do this and why the segment count is mira's.

    568 triangles: 400 for the ring (20 x `cyl(verts=6)` at 20 each) and 56 for
    each node. A node is a dark cup with the ley core RECESSED inside it, which
    is the cargo cage's own construction for its core and is there for the same
    measured reason -- a naked emissive solid at this size reads as a detached
    blob stuck onto the silhouette rather than a light set into a fitting.

    THE NODES ARE THE ONLY SATURATED COLOUR ON THIS BODY. The hold is sealed and
    the lens is the only red, so if these are ever dropped the Courier loses the
    teal the roster identifies it by. See the header on sealing.
    """
    ax, ay, az = YOKE_AT
    az = az + lift

    def point(i):
        a = 2.0 * math.pi * i / YOKE_SEGMENTS
        return (ax + math.cos(a) * YOKE_RH, ay,
                az + math.sin(a) * YOKE_RV)

    parts = []
    for i in range(YOKE_SEGMENTS):
        # Segment i spans point i to point i+1, so the ring closes on itself
        # rather than being twenty detached beads.
        parts.append(
            td.tube("field_yoke_%02d" % i, YOKE_BAR, point(i),
                    point((i + 1) % YOKE_SEGMENTS), m["tin_dark"], body,
                    verts=6))

    for i, u in enumerate(YOKE_NODE_U):
        a = math.pi * u
        nx = ax + math.cos(a) * YOKE_RH
        nz = az + math.sin(a) * YOKE_RV
        axis = (math.radians(90.0), 0.0, 0.0)   # lie the cup across +Y
        parts.append(
            td.cyl("yoke_cup_%d" % i, 0.034, 0.055, location=(nx, ay, nz),
                   rotation=axis, mat=m["tin_dark"], parent=body, verts=8))
        parts.append(
            td.cyl("yoke_node_%d" % i, 0.021, 0.062, location=(nx, ay, nz),
                   rotation=axis, mat=m["shield_ley"], parent=body, verts=8))
    return parts


def build():
    """Returns (root, body, parts) -- narrow frame, full sealed hold, one hoop."""
    m = chassis.materials()
    body_z = 0.0
    # The body root stays at z = 0 and `lift` puts the parts back where the
    # chassis authored them. That is model contract clause 3b: the group root
    # that owns the topmost geometry sits at the origin, so `model.top` reads
    # the true height and the health bar cannot draw inside the mesh.
    lift = chassis.BODY_REFERENCE_Z - body_z

    root = td.root("shielded")
    body = td.root("shielded_body")
    body.parent = root
    body.location = (0.0, 0.0, body_z)

    chassis.torso_frame(m, body, lift, torso_w=TORSO_W, yoke_w=YOKE_W,
                        hip_w=HIP_W, band_w=BAND_W)
    # SEALED: the plating swap, which is sanctioned. Nothing is reshaped.
    chassis.cargo_cage(m, body, lift, at=CAGE_AT, scale=CAGE_SCALE,
                       window_mat="tin_dark", core_mat="tin_dark")
    # The antenna STAYS -- the Skimmer owns crown removal. See the header.
    chassis.head(m, body, lift, lens_segments=8, lens_rings=4, antenna=True)
    build_field_yoke(m, body, lift)
    arm_l, arm_r = build_folded_arms(m, body, lift)
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
    """The exporter contract: build, hide, animate, return the frame count.

    EIGHT FRAMES, and for now that is a hard ceiling rather than a default.
    A model carrying more than the walk cycle is not safe to ship until the
    renderer can be told where the walk ends -- `gl-world.js` takes the walk
    index over the TOTAL frame count, so a ninth frame would be cycled through
    once per stride. That is kaz's open item with otto; this body does not need
    a second band and is unaffected.
    """
    _root, body, parts = build()
    chassis.set_shield_visible(parts, False)
    animate_walk(body, parts, WALK_FRAMES)
    return WALK_FRAMES
