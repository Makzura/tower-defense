# ---------------------------------------------------------------------------
# The Rifleman -- tower `soldier`, js/soldier.js. The starting tower.
#
#     blender --background --python tools/blender/tower_rifleman.py
#     blender --background --python tools/blender/tower_rifleman.py -- --groups=b5
#
# WHO HE IS. The Draw stamps out identical tin frames that walk to flesh, take
# what is in it and carry it home. Every other defender on this board answers
# that by stopping being a person: the Arcane Sniper bolts the enemy's own
# hardware onto his body (path A) or burns what is inside him (path B), and
# the Warbringer was never a man at all. The Rifleman is the one who does not.
# He is a boss in a good suit with a gold hat band, a lit cigar and a violin
# case at his feet, and the whole roster reads correctly only because he is
# standing there unchanged at the end of it.
#
# THIS IS WHY HE IS THE $300 STARTER. He is the baseline the others are
# measured against -- the most human thing on the board, planted first, still
# there at wave 35.
#
# NO MAGIC ON HIM. He owns none of the palette's ley/sigil family. His colours
# are tailoring colours -- charcoal, ivory, oxblood, real gold, walnut -- and
# the only two emissive materials he ever carries are a cigar ember and a
# spotlight filament. Both are fire and tungsten. That restraint is the model's
# entire argument, so path B in particular must never gain a glow.
#
# THE ONE EXCEPTION, AND ITS BUDGET. Path A is allowed to go *a bit*
# cybernetic, because path A is the arsenal: the money buys a loader, a mount,
# a hopper and a battery, and by A4 he is wearing hardware to work them. The
# budget is deliberately small and it is spent on exactly three things -- a
# chromed brace, a servo readout and a targeting monocle -- so that A5 still
# reads as a man in a suit operating a machine rather than as a machine that
# used to be a man. That is the direct inverse of the Sniper's A5, whose whole
# point is that there is nothing left of him, and the contrast between the two
# final tiers is the reason to hold this line.
#
# WHAT EACH TIER COSTS, AND WHAT IT DOES NOT.
#
#   A0-A2   a boss with a walnut carbine and an open violin case of clips.
#           Tiers 1 and 2 are ACCENT ONLY -- gold hat band, gold cartridges on
#           the rail, a gold compensator. He is getting richer, not different.
#   A3      a loader. A chromed feed column stands beside him with a rack of
#           clips and an arm that puts them in the gun, so he stops reaching --
#           which IS the shorter burst cooldown. First cybernetic touch: one
#           servo readout, one forearm brace.
#   A4      the gun leaves his hands. It goes on a pintle at chest height with
#           a hopper feeding it; he works it on spade grips, in a chrome
#           shoulder yoke, with a targeting monocle clipped to the hat brim.
#           Suit intact. Hat on. Cigar lit.
#   A5      a four-barrel battery on a swivel column, a chute, a servo arm and
#           a drift of spent gold cases around the pad. Still him, still
#           dressed, still smoking.
#   B1-B2   ACCENT ONLY -- oxblood hat band, a long sight, steel shoulder caps.
#   B3      the burst ends, so the weapon does: a drum-fed automatic, and a
#           tripod spotlight planted beside him. THE SPOTLIGHT IS THE CAMO
#           DETECTION and it is a filament in a can, not an eye that sees
#           through walls, because path B does not get to be magic.
#   B4      the crew. The barricade becomes crates and riveted plate, a rack
#           behind him holds two spare guns and TWO HATS, and an open case of
#           gold-tipped shells is the defence pierce.
#   B5      the boss. A dais, a heavy tripod gun, a fur-collared overcoat, a
#           strongbox, and FOUR hats on the rack -- one per recruit.
#
# THE HATS ON THE RACK ARE THE ABILITY. B4 calls two recruits and B5 calls
# four, and the rack carries exactly that many, so the squad size is readable
# without opening the panel. Nothing reads it back; see the note on effects in
# AGENTS.md.
#
# TIERS 1 AND 2 ARE ACCENTS ON EVERY BODY, not just the base one. That differs
# from the Sniper deliberately. Its A5 and B5 carry no crosspath sheet because
# there is nothing human left to mark -- but A5+B1+B2 is the owner's own
# specified Rifleman build (9 damage, 75 DPS) and B5+A1+A2 is a row in the DPS
# table, so both final tiers here DO get their crosspath accents. Sixteen
# accent sheets instead of eight is what honesty about those two builds costs.
#
# ACCENTS CANNOT DRIFT, BY CONSTRUCTION. Every body and every accent layer
# hangs off the same `_anchors()` empty chain, so a hat band is placed by the
# hat empty rather than by a copied number. The accent seats -- the hat, the
# top rail, the muzzle and the shoulders -- are also the four places on this
# model that are visible from ALL 48 facings and that the work cycle never
# moves. Both properties are required: a one-frame accent composited over a
# four-frame body slides off anything that animates, and an accent authored on
# his chest would be painted onto his back half the time.
#
# WHERE THE SHOT COMES FROM. `main()` prints each group's muzzle in world units
# from the point the tower stands on, THROUGH the weapon's own pitch. Those go
# into `RIFLEMAN_MUZZLE` in js/skins/draw-pack.js, which is what keeps the
# muzzle flash welded to the barrel instead of floating near it. The print is
# the authority and both sides copy from it; see muzzle_world().
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import bpy
import td_scene as td

TILE = 256

# The two mounted final tiers carry more machine than a 256 tile resolves at
# the game's maximum 3x backing scale. Their 48 facings page into three 16-row
# bands so no PNG approaches a conservative browser's image height limit --
# the same arrangement the Sniper's A5/B5 use.
TILE_BY_GROUP = {"a5": 384, "b5": 384}
DIRECTION_ROWS_BY_GROUP = {"a5": 16, "b5": 16}

# He turns to face what he is shooting: `Soldier.update` already writes
# `this.aim`. 48 facings for the same reason the Sniper has 48 -- worst-case
# error is 180/N degrees, and 3.75 is under what the eye reads as a step on a
# turning weapon.
DIRECTIONS = 48

# THE WORK CYCLE. Four frames, indexed off Soldier.gearPhase(), which is
# already `1 - cooldown / cycleSeconds()` and already reconciles the tower's
# two firing models: a burst sweeps it over the burst cooldown and an automatic
# rifle sweeps the same clock over one shot interval. So the identical four
# frames give a measured cycle at base, a fast one at A5, and a continuous
# shudder from B3 -- with no second clock anywhere and nothing for update() to
# carry.
WORK_FRAMES = 4

# Per-group framing: the world height one tile spans. Bigger means the subject
# is drawn smaller inside its tile, so it buys clearance and costs source
# pixels. draw-pack.js multiplies its sprite size by the same number, which is
# what holds the man at a constant on-screen size while the framing widens
# around him.
#
# The binding constraint is NOT the weapon's length. The camera projects a
# point to screen height `0.829 * z + 0.56 * y`, so ground-level geometry that
# swings toward the viewer during a 48-facing turn goes BELOW the tile's world
# origin, and only 0.14 of a tile sits below it. The violin case, A5's drift of
# spent cases and B4's barricade are what set these numbers.
#
# B3 AND B4 WERE RAISED AFTER THE FIRST SHIPPED RENDER, which is what the
# gutter check is for: 56 and 24 tiles respectively touched the outer three
# pixels. Neither was visible in a preview or in the combined content box --
# the offender is a tripod leg at one specific band of facings, and only the
# per-tile check finds that. Treat any such warning as clipping.
#
# THESE ARE MEASURED, NOT CHOSEN. `make_preview.py --frame-riflemen` sweeps
# every evaluated vertex of every body through all 48 yaws, projects them
# through this exact camera and solves for the smallest ortho that keeps the
# model off the tile's 3px gutter. Run it after ANY pose or prop change and
# copy the line it prints; the first shipped pass was hand-picked and all
# seven groups clipped.
ORTHO = {"base": 3.35, "a3": 3.05, "a4": 3.70, "a5": 4.10,
         "b3": 3.45, "b4": 3.70, "b5": 3.85}

# Shoulder height and the weapon's offset off the centre line. Shared with the
# Sniper's rig on purpose: the two men have to be the same size standing next
# to each other on the same board.
GUN_Z = 1.30
# Outboard on his right, far enough that the weapon clears the torso's own
# half-width (0.19) instead of crossing it. A weapon drawn THROUGH a body reads
# as two brown blocks either side of a dark mass; a weapon drawn beside one
# reads as a weapon.
GUN_Y = -0.20

# HE FIRES FROM THE HIP, AND THAT IS THE WHOLE SEPARATION FROM THE SNIPER.
#
# The first pass shouldered the weapon like a marksman. It read as a second
# sniper: the rifle crossed his face, the hat went behind the receiver and the
# shirt disappeared under his own forearm -- so the three things that make him
# a person rather than a uniform were all occluded by the one thing every
# other tower already has. Dropping the gun to the hip costs nothing in
# legibility (the barrel still leaves the silhouette pointing at the target)
# and buys back the entire head and chest.
#
# -0.38 below a 1.30 shoulder is world z 0.92, which is the belt. Two earlier
# passes put it at -0.26 and -0.30 and both were still CHEST height: from a 34
# degree camera a horizontal weapon across the chest cuts the figure in half
# and hides the shirt, the tie and the watch chain -- i.e. every part of him
# that is not a dark charcoal mass. At the belt the whole chest stays clear.
HIP_Z = -0.38
HIP_X = 0.06
HEAD_LOCAL = (-0.05, -0.02, 0.225)

# Where the figure stands, per group. From A4 the weapon is on a mount he
# stands BEHIND, so he steps back off the tower's centre; at B5 he is up on the
# dais.
FIGURE_OFFSET = {
    "base": (0.0, 0.0, 0.0),
    "a3":   (-0.06, 0.02, 0.0),
    "a4":   (-0.52, -0.03, 0.0),
    "a5":   (-0.64, -0.05, 0.0),
    "b3":   (0.0, 0.0, 0.0),
    "b4":   (0.0, 0.0, 0.0),
    "b5":   (-0.30, 0.0, 0.16),
}

# (parent, location, pitch degrees). "shoulder" hangs the weapon off the man;
# "root" bolts it to a mount that does not move when he does.
GUN_MOUNT = {
    "base": ("shoulder", (HIP_X, GUN_Y, HIP_Z), -5.0),
    "a3":   ("shoulder", (HIP_X, GUN_Y, HIP_Z), -5.0),
    "a4":   ("root", (0.12, 0.0, 1.10), 0.0),
    "a5":   ("root", (0.12, 0.0, 1.14), 0.0),
    "b3":   ("shoulder", (HIP_X, GUN_Y, HIP_Z), -4.5),
    "b4":   ("shoulder", (HIP_X, GUN_Y, HIP_Z), -4.5),
    "b5":   ("root", (0.16, 0.0, 1.24), 0.0),
}

# THE FOUR ACCENT SEATS, in each weapon's local frame. `rail` is the receiver
# top and `fore` is over the barrel; the muzzle is the far face of the last
# piece, derived from the geometry below rather than eyeballed.
#
# TWO SEATS ON THE WEAPON RATHER THAN ONE, because they fail differently. The
# receiver rail is where a sight BELONGS and it is tucked close to his body, so
# at rear facings his own torso covers it. The fore-end is out past the
# silhouette at every facing but a scope mounted there would look wrong. So
# B1's long sight takes the rail and pays the occlusion, and the gold
# cartridges -- which have to be seen, because they are what a player reads as
# "this one has been upgraded" -- take the fore. The hat band, which nothing
# can ever occlude, carries both tiers regardless.
RAIL_LOCAL = {
    "base": (-0.02, 0.0, 0.105), "a3": (0.02, 0.0, 0.115),
    "a4": (-0.12, 0.0, 0.145), "a5": (-0.14, 0.0, 0.215),
    "b3": (-0.02, 0.0, 0.105), "b4": (-0.02, 0.0, 0.105),
    "b5": (-0.10, 0.0, 0.175),
}
FORE_LOCAL = {
    "base": (0.25, 0.0, 0.058), "a3": (0.25, 0.0, 0.058),
    "a4": (0.34, 0.0, 0.098), "a5": (0.42, 0.0, 0.120),
    "b3": (0.24, 0.0, 0.048), "b4": (0.24, 0.0, 0.048),
    "b5": (0.36, 0.0, 0.112),
}
MUZZLE_LOCAL = {
    "base": (0.870, 0.0, 0.012), "a3": (0.950, 0.0, 0.012),
    "a4": (1.080, 0.0, 0.0), "a5": (1.070, 0.0, 0.0),
    "b3": (0.880, 0.0, 0.0), "b4": (0.920, 0.0, 0.0),
    "b5": (0.985, 0.0, 0.0),
}


def materials():
    return {
        # The suit. Three values, because a single charcoal turns into one flat
        # blob at 40 px: the jacket, the shadow side and the waistcoat have to
        # separate on their own without an outline.
        "suit": td.material("suit", "suit", roughness=0.90),
        "suit_dark": td.material("suit_dark", "suit_dark", roughness=0.92),
        "stripe": td.material("stripe", "pinstripe", roughness=0.86),
        # The only light garment in the game. It is what makes the silhouette
        # read as a dressed man rather than as one more dark mass.
        "shirt": td.material("shirt", "shirt", roughness=0.80),
        "tie": td.material("tie", "tie", roughness=0.76),
        "skin": td.material("skin", "skin", roughness=0.68),
        "hair": td.material("hair", "hair", roughness=0.80),
        # Real gold, not the machines' mustard `brass`. Metallic and smooth so
        # it actually catches the key light and reads as money.
        "gold": td.material("gold", "gold", roughness=0.24, metallic=0.85),
        "gold_dark": td.material("gold_dark", "gold_dark", roughness=0.36,
                                 metallic=0.70),
        "gun": td.material("gun", "gun_blue", roughness=0.34, metallic=0.55),
        "gun_dark": td.material("gun_dark", "gun_dark", roughness=0.44,
                                metallic=0.45),
        "walnut": td.material("walnut", "walnut", roughness=0.60),
        "crate": td.material("crate", "crate", roughness=0.94),
        "leather": td.material("leather", "leather", roughness=0.74),
        "fur": td.material("fur", "fur", roughness=0.96),
        "chrome": td.material("chrome", "chrome", roughness=0.18,
                              metallic=0.92),
        "steel": td.material("steel", "tin", roughness=0.55, metallic=0.30),
        "steel_dark": td.material("steel_dark", "tin_dark", roughness=0.62,
                                  metallic=0.25),
        # FIRE AND FILAMENT, the only two emissive materials he owns.
        "ember": td.material("ember", "ember", emission=7.0, roughness=0.40),
        "lamp": td.material("lamp", "lamp", emission=5.0, roughness=0.25),
        "lamp_dim": td.material("lamp_dim", "lamp", emission=1.5,
                                roughness=0.35),
        # Path A's whole cybernetic budget: a servo readout and a monocle lens.
        # Dim on purpose -- the moment this reads as a glow he has joined the
        # other towers.
        "ley": td.material("ley", "ley", emission=3.0, roughness=0.24),
        "ley_dim": td.material("ley_dim", "ley", emission=1.2, roughness=0.32),
    }


# --- the shared empty chain --------------------------------------------------

def _anchors(parent, group):
    """Every mount point a body and its accent layers agree on.

    Nothing is drawn here. It exists so that an accent layer places a hat band
    by asking the hat where it is, rather than by carrying a copy of the number
    that put the hat there -- which is the failure mode that makes a one-pixel
    drift appear months later when a pose is nudged.
    """
    figure = td.root("figure")
    figure.parent = parent
    figure.location = FIGURE_OFFSET[group]

    shoulder = td.root("shoulder")
    shoulder.parent = figure
    shoulder.location = (0.0, 0.0, GUN_Z)

    head = td.root("head")
    head.parent = shoulder
    head.location = HEAD_LOCAL
    head.rotation_euler = (0.0, math.radians(5.0), 0.0)

    hat = td.root("hat")
    hat.parent = head
    hat.location = (0.0, 0.0, 0.125)
    # The rake. A fedora worn dead level reads as a bowler at this size.
    hat.rotation_euler = (0.0, math.radians(-8.0), 0.0)

    gun_parent, gun_location, gun_pitch = GUN_MOUNT[group]
    gun = td.root("gun")
    gun.parent = shoulder if gun_parent == "shoulder" else parent
    gun.location = gun_location
    gun.rotation_euler = (0.0, math.radians(gun_pitch), 0.0)

    rail = td.root("rail")
    rail.parent = gun
    rail.location = RAIL_LOCAL[group]

    fore = td.root("fore")
    fore.parent = gun
    fore.location = FORE_LOCAL[group]

    muzzle = td.root("muzzle")
    muzzle.parent = gun
    muzzle.location = MUZZLE_LOCAL[group]

    return {"figure": figure, "shoulder": shoulder, "head": head, "hat": hat,
            "gun": gun, "rail": rail, "fore": fore, "muzzle": muzzle}


# --- the man -----------------------------------------------------------------

def _legs(m, figure):
    """Dress trousers with a break over the shoe, and a weight-back stance.

    Jointed rather than two rectangles: a knee gives the silhouette a changing
    highlight through the turn, which is most of what sells a 48-facing sprite
    as a solid rather than a card.
    """
    for side, y, back in (("back", -0.145, True), ("front", 0.145, False)):
        hip_x = -0.06 if back else 0.03
        knee_x = -0.12 if back else 0.12
        foot_x = -0.175 if back else 0.175
        td.tube("thigh_" + side, 0.090, (hip_x, y * 0.92, 0.72),
                (knee_x, y, 0.40), m["suit"], figure, verts=10)
        td.tube("shin_" + side, 0.085, (knee_x, y, 0.40),
                (foot_x, y, 0.11), m["suit"], figure, verts=10)
        # The turn-up. A hem line is what stops a trouser leg reading as a pipe.
        td.box("turnup_" + side, (0.185, 0.180, 0.042),
               location=(foot_x, y, 0.105), mat=m["suit_dark"], parent=figure)
        # DRESS SHOES, not boots. The first pass made these brown and wide and
        # they read as clown shoes at 40 px -- the same brown as the violin
        # case, at the busiest end of the silhouette. Near-black with a thin
        # leather welt keeps the eye where it belongs, on the chest and hat.
        td.box("shoe_" + side, (0.255, 0.145, 0.062),
               location=(foot_x + 0.025, y, 0.045), mat=m["suit_dark"],
               parent=figure)
        td.box("sole_" + side, (0.275, 0.160, 0.020),
               location=(foot_x + 0.030, y, 0.012), mat=m["leather"],
               parent=figure)


def _suit(m, figure, overcoat=False, fur_collar=False, holster=False):
    """Jacket, waistcoat, shirt, tie. Everything that makes him dressed."""
    # A SUIT JACKET ENDS AT THE HIP. The first pass hung it to mid-thigh, and
    # with only 0.46 of trouser showing under it the whole figure read stubby --
    # the legs are what give a standing man his height, and a coat is the
    # Sniper's silhouette, not this one's.
    td.box("jacket_skirt", (0.34, 0.38, 0.26), location=(-0.02, 0.0, 0.80),
           rotation=(0.0, math.radians(-4.0), 0.0), mat=m["suit"],
           parent=figure)
    for y in (0.135, -0.135):
        td.box("jacket_vent_%s" % y, (0.22, 0.115, 0.24),
               location=(-0.075, y, 0.760),
               rotation=(0.0, math.radians(-6.0), 0.0), mat=m["suit_dark"],
               parent=figure)

    td.box("belt", (0.34, 0.36, 0.055), location=(0.0, 0.0, 0.905),
           mat=m["leather"], parent=figure)
    td.box("buckle", (0.055, 0.10, 0.065), location=(0.165, 0.0, 0.905),
           mat=m["gold"], parent=figure)

    # THE CHEST IS BUILT IN LAYERS AND THE JACKET IS OPEN.
    #
    # The first pass was one deep jacket box with a shirt panel tucked in front
    # of it, and the shirt lost -- 0.03 of proud geometry is nothing at this
    # size. A real three-piece reads because the garments are actually stacked
    # and actually gapped: an ivory strip runs from collar to waist BETWEEN two
    # waistcoat panels, and the jacket fronts hang open either side of both. It
    # is four more boxes and it is the difference between a dressed man and a
    # dark block.
    td.box("torso", (0.270, 0.380, 0.42), location=(-0.030, 0.0, 1.10),
           rotation=(0.0, math.radians(-5.0), 0.0), mat=m["suit"],
           parent=figure)
    td.box("shirt_front", (0.120, 0.135, 0.42), location=(0.135, 0.0, 1.100),
           rotation=(0.0, math.radians(-5.0), 0.0), mat=m["shirt"],
           parent=figure)
    for y in (0.098, -0.098):
        td.box("waistcoat_%s" % y, (0.115, 0.125, 0.32),
               location=(0.135, y, 1.030),
               rotation=(0.0, math.radians(-5.0), 0.0), mat=m["stripe"],
               parent=figure)
        # The open jacket front. Rotated out at the hem so the coat hangs
        # rather than clamps, which is most of what reads as tailoring.
        td.box("jacket_front_%s" % y, (0.100, 0.120, 0.44),
               location=(0.105, y * 1.52, 1.090),
               rotation=(0.0, math.radians(-8.0),
                         math.radians(9.0 if y > 0 else -9.0)),
               mat=m["suit"], parent=figure)

    td.box("tie", (0.055, 0.090, 0.30), location=(0.215, 0.0, 1.105),
           rotation=(0.0, math.radians(-6.0), 0.0), mat=m["tie"],
           parent=figure)
    td.box("tie_knot", (0.070, 0.100, 0.075), location=(0.212, 0.0, 1.272),
           mat=m["tie"], parent=figure)
    for y in (0.090, -0.090):
        td.box("collar_%s" % y, (0.085, 0.085, 0.105),
               location=(0.170, y, 1.292),
               rotation=(0.0, 0.0, math.radians(22.0 if y > 0 else -22.0)),
               mat=m["shirt"], parent=figure)
        # Wide notch lapels. They are the reason the chest reads as tailoring
        # and not as a chest plate, which is what every other model here has.
        td.box("lapel_%s" % y, (0.185, 0.080, 0.30),
               location=(0.135, y * 1.75, 1.165),
               rotation=(0.0, math.radians(-14.0),
                         math.radians(14.0 if y > 0 else -14.0)),
               mat=m["suit_dark"], parent=figure)

    td.box("pocket_square", (0.032, 0.075, 0.055),
           location=(0.140, 0.195, 1.225), mat=m["shirt"], parent=figure)

    # The watch chain, in two straight runs rather than a curve: at this size a
    # catenary is three pixels and a bright glint is the whole point.
    td.tube("chain_a", 0.011, (0.196, 0.115, 1.045), (0.212, 0.02, 0.975),
            m["gold"], figure, verts=6)
    td.tube("chain_b", 0.011, (0.212, 0.02, 0.975), (0.198, -0.075, 1.010),
            m["gold"], figure, verts=6)

    if holster:
        # B4 puts a shoulder rig over the shirt. Straps only -- the piece it
        # carries would be hidden behind his arm from most of the 48 facings.
        for y in (0.10, -0.10):
            td.tube("strap_%s" % y, 0.022, (0.15, y, 1.30),
                    (0.02, y * 1.9, 1.02), m["leather"], figure, verts=6)

    if overcoat:
        # From B3 he is working outside behind a barricade, and the coat is
        # what makes the tier read heavier without touching his proportions.
        # Slim enough to stay a COAT. The first pass was 0.62 across the
        # shoulders -- wider than the shoulders themselves -- and it turned him
        # into a refrigerator with a hat on.
        td.box("coat_shell", (0.360, 0.500, 0.500), location=(-0.055, 0.0, 1.06),
               rotation=(0.0, math.radians(-4.0), 0.0), mat=m["suit_dark"],
               parent=figure)
        td.box("coat_skirt", (0.340, 0.460, 0.300), location=(-0.065, 0.0, 0.74),
               mat=m["suit_dark"], parent=figure)
        for y in (0.255, -0.255):
            td.box("coat_sleeve_%s" % y, (0.220, 0.130, 0.280),
                   location=(-0.020, y, 1.18), mat=m["suit_dark"],
                   parent=figure)
    if fur_collar:
        td.box("fur_collar", (0.28, 0.60, 0.14), location=(-0.03, 0.0, 1.40),
               mat=m["fur"], parent=figure)
        for y in (0.24, -0.24):
            td.ellipsoid("fur_roll_%s" % y, (0.26, 0.20, 0.18),
                         (-0.02, y, 1.36), m["fur"], figure)


def _shoulders(m, shoulder, wide=False):
    td.box("shoulders", (0.27, 0.50 if wide else 0.46, 0.18),
           location=(0.0, 0.0, 0.0), mat=m["suit"], parent=shoulder)
    for y in (0.215, -0.215):
        td.box("pad_%s" % y, (0.22, 0.125, 0.095), location=(0.0, y, 0.042),
               mat=m["suit_dark"], parent=shoulder)


def _head_geometry(m, anchors, monocle=False, cigar=True, yoke=False):
    """Face, hair, fedora and the cigar.

    THE CIGAR IS THE ONLY LIGHT ON HIM below A3, and it is deliberately at his
    mouth: it drags the eye to a face, which is the one thing no other model on
    this board has to offer.
    """
    head = anchors["head"]
    hat = anchors["hat"]

    td.cyl("neck", 0.072, 0.160, location=(-0.020, 0.0, -0.145), mat=m["skin"],
           parent=head, verts=10)
    td.ellipsoid("skull", (0.195, 0.180, 0.215), (0.0, 0.0, 0.0), m["skin"],
                 head)
    td.box("jaw", (0.165, 0.155, 0.072), location=(0.028, 0.0, -0.110),
           mat=m["skin"], parent=head)
    td.box("nose", (0.055, 0.050, 0.050), location=(0.115, 0.0, -0.018),
           mat=m["skin"], parent=head)
    # The brim throws a hard shadow across the eyes in the real light, but at
    # 40 px a modelled shadow is more reliable than a rendered one.
    td.box("brow", (0.092, 0.175, 0.036), location=(0.082, 0.0, 0.022),
           rotation=(0.0, math.radians(8.0), 0.0), mat=m["suit_dark"],
           parent=head)
    td.box("hair_back", (0.105, 0.175, 0.105), location=(-0.098, 0.0, 0.008),
           mat=m["hair"], parent=head)

    # A FEDORA, NOT A RANGER HAT. The first pass used the Sniper's brim radius
    # and got a second wide-brim silhouette on the same board -- the one thing
    # this model cannot afford, since the two are meant to read apart at a
    # glance. A fedora is a SMALL brim under a TALL creased crown, and it is
    # the proportion, not the shape, that carries it.
    td.cyl("hat_brim", 0.182, 0.026, location=(0.0, 0.0, 0.0),
           mat=m["suit_dark"], parent=hat, verts=16)
    td.frustum("hat_crown", 0.118, 0.102, 0.180, (-0.012, 0.0, 0.108),
               m["suit_dark"], hat, verts=12)
    # The pinch, and the two side dents. Three blocks is all it takes to stop
    # a crown reading as a can.
    td.box("hat_crease", (0.165, 0.042, 0.062), location=(-0.012, 0.0, 0.196),
           mat=m["suit_dark"], parent=hat)
    for y in (0.076, -0.076):
        td.box("hat_dent_%s" % y, (0.135, 0.036, 0.080),
               location=(-0.012, y, 0.166), mat=m["suit"], parent=hat)
    # A plain LEATHER band, so that A1's gold and B1's oxblood are visibly an
    # upgrade of something rather than the sudden appearance of a band. A1/A2
    # and B1/B2 cover this exactly -- see build_accent.
    td.cyl("hat_band", 0.120, 0.048, location=(-0.012, 0.0, 0.040),
           mat=m["leather"], parent=hat, verts=14)

    if cigar:
        # Clamped in the teeth on the shadow side, angled down. It has to clear
        # the brim from every facing or it reads as a chin.
        td.tube("cigar", 0.021, (0.110, -0.055, -0.082),
                (0.255, -0.125, -0.120), m["leather"], head, verts=8)
        td.ellipsoid("cigar_ember", (0.048, 0.048, 0.048),
                     (0.262, -0.128, -0.122), m["ember"], head)

    if monocle:
        td.torus("monocle_ring", 0.052, 0.011, (0.145, -0.088, 0.005),
                 (0.0, math.radians(90.0), 0.0), m["chrome"], head,
                 major_segments=12, minor_segments=5)
        td.ellipsoid("monocle_lens", (0.020, 0.092, 0.092),
                     (0.143, -0.088, 0.005), m["ley_dim"], head)
        td.tube("monocle_stay", 0.012, (0.130, -0.088, 0.030),
                (0.010, -0.130, 0.075), m["chrome"], head, verts=6)

    if yoke:
        # A4/A5 recoil brace. Hardware he WEARS, over the suit, rather than
        # hardware bolted into him.
        td.box("yoke", (0.150, 0.480, 0.070), location=(-0.030, 0.0, 0.115),
               mat=m["chrome"], parent=anchors["shoulder"])
        for y in (0.20, -0.20):
            td.tube("yoke_stay_%s" % y, 0.026, (-0.03, y, 0.115),
                    (0.10, y * 0.75, -0.10), m["chrome"], anchors["shoulder"],
                    verts=6)


def _arm(m, parent, shoulder_joint, elbow, hand, ring=False, name="arm",
         cuff=True):
    """One arm, as three joints in the parent's frame.

    Written as shoulder/elbow/hand rather than as a pose preset because the
    hands go somewhere different on every tier -- a hip grip, a fore-end, a
    spade grip on a mount he is standing behind -- and a limb whose end is not
    ON the thing it is holding is the single most obvious modelling error at
    this scale. Every call site below computes its hand from the weapon's own
    geometry.
    """
    td.tube(name + "_upper", 0.068, shoulder_joint, elbow, m["suit"], parent,
            verts=10)
    td.ellipsoid(name + "_elbow", (0.145, 0.145, 0.145), elbow,
                 m["suit_dark"], parent)
    td.tube(name + "_forearm", 0.060, elbow, hand, m["suit"], parent, verts=10)
    if cuff:
        # A shirt cuff at the wrist. Two pixels of ivory, and it is what makes
        # the hand read as coming out of a sleeve.
        towards = [elbow[i] + (hand[i] - elbow[i]) * 0.78 for i in range(3)]
        td.box(name + "_cuff", (0.070, 0.092, 0.088), location=tuple(towards),
               mat=m["shirt"], parent=parent)
    td.ellipsoid(name + "_hand", (0.120, 0.102, 0.112), hand, m["skin"],
                 parent)
    if ring:
        # The ring. Four pixels of gold, and it is worth every one of them.
        td.torus(name + "_ring", 0.042, 0.013,
                 (hand[0] - 0.010, hand[1] - 0.036, hand[2] - 0.010),
                 (math.radians(90.0), 0.0, math.radians(12.0)), m["gold"],
                 parent, major_segments=10, minor_segments=4)


REAR_JOINT = (0.0, -0.230, -0.030)
FWD_JOINT = (0.0, 0.230, -0.030)


def _rear_arm(m, shoulder, hand, elbow):
    """The trigger arm -- the one the work cycle moves, so it gets its own
    empty and `hand`/`elbow` are expressed relative to that empty's origin at
    the shoulder joint."""
    rear = td.root("rear_arm")
    rear.parent = shoulder
    rear.location = REAR_JOINT
    _arm(m, rear, (0.0, 0.0, 0.0), elbow, hand, ring=True, name="rear")
    return rear


def _hip_arms(m, shoulder, group):
    """Both arms for a hip-held weapon, ELBOWS OUT.

    The first pass tucked both elbows toward the centre line and the arms
    disappeared -- they were the same charcoal as the jacket and they were
    inside its outline, so at 40 px the man had no arms at all. A limb only
    exists in a sprite if it breaks the silhouette, so the trigger elbow goes
    back and outboard and the support elbow swings wide before the forearm
    crosses to the fore grip. That triangle of daylight under the support arm
    is what makes the pose read.
    """
    trigger, front = _hip_hands(group)
    rear = _rear_arm(
        m, shoulder,
        hand=tuple(trigger[i] - REAR_JOINT[i] for i in range(3)),
        elbow=(-0.090, -0.100, -0.260))
    _arm(m, shoulder, FWD_JOINT, (0.155, 0.215, -0.305), front, name="fwd")
    return rear


def _hip_hands(group):
    """Where the two hands land for a hip-held weapon, in the shoulder's frame.

    DERIVED from GUN_MOUNT and the weapon's own grip positions rather than
    typed in, so moving the hold moves the hands with it. The grip and fore-end
    x-offsets are the ones _carbine and _thompson build at.
    """
    gx, gy, gz = GUN_MOUNT[group][1]
    if group in ("base", "a3"):
        # Pistol grip, and the REAR of the fore-end -- the far end is a reach
        # long enough to draw a visibly inhuman arm.
        return ((gx - 0.215, gy, gz - 0.090),
                (gx + 0.230, gy + 0.015, gz + 0.010))
    # The Thompson's VERTICAL fore grip, which is the pose everyone already
    # has a picture of. Held high on the grip for the same reach reason.
    return ((gx - 0.190, gy, gz - 0.090),
            (gx + 0.260, gy + 0.010, gz - 0.020))


def _brace(m, shoulder, hand, elbow):
    """A3's chromed forearm brace -- the first cybernetic thing he owns, and
    small enough that it reads as equipment rather than as surgery. Placed on
    the forearm it braces rather than at a fixed offset, so it cannot end up
    floating beside an arm that has moved."""
    for t in (0.30, 0.58):
        at = tuple(elbow[i] + (hand[i] - elbow[i]) * t for i in range(3))
        td.cyl("brace_band_%.2f" % t, 0.078, 0.030, location=at,
               rotation=(0.0, math.radians(76.0), 0.0), mat=m["chrome"],
               parent=shoulder, verts=10)
    mid = tuple(elbow[i] + (hand[i] - elbow[i]) * 0.44 for i in range(3))
    td.box("brace_spine", (0.190, 0.100, 0.085), location=mid,
           rotation=(0.0, math.radians(-14.0), math.radians(-18.0)),
           mat=m["chrome"], parent=shoulder)


# --- the violin case ---------------------------------------------------------

def _violin_case(m, parent, at=(-0.30, 0.30, 0.0), clips=4):
    """His kit. A case of gold-cased clips, open at his feet.

    THE ONE PROP THAT CARRIES THE WHOLE CHARACTER. Everything else on the base
    model is a suit and a rifle; the case is what says he did not come from a
    barracks.
    """
    case = td.root("case")
    case.parent = parent
    case.location = (at[0], at[1], 0.0)
    case.rotation_euler = (0.0, 0.0, math.radians(14.0))

    td.box("case_body", (0.440, 0.175, 0.088), location=(0.0, 0.0, 0.044),
           mat=m["leather"], parent=case)
    td.box("case_edge", (0.460, 0.190, 0.018), location=(0.0, 0.0, 0.086),
           mat=m["gold_dark"], parent=case)
    for x in (-0.145, 0.145):
        td.box("case_latch_%s" % x, (0.042, 0.205, 0.028),
               location=(x, 0.0, 0.065), mat=m["gold"], parent=case)
    # The lid, propped back. Its lining is the tie's oxblood, which is the
    # only other place that colour appears -- it ties the prop to the man.
    lid = td.root("case_lid")
    lid.parent = case
    # Propped UP rather than laid back. The sign matters and was wrong once:
    # a negative angle about X folds the lid down and forward into the ground,
    # which reads as a second loaf of leather rather than as an open case.
    lid.location = (0.0, 0.090, 0.080)
    lid.rotation_euler = (math.radians(74.0), 0.0, 0.0)
    td.box("lid_shell", (0.440, 0.175, 0.042), location=(0.0, 0.080, 0.0),
           mat=m["leather"], parent=lid)
    td.box("lid_lining", (0.390, 0.145, 0.016), location=(0.0, 0.080, -0.028),
           mat=m["tie"], parent=lid)

    for i in range(clips):
        x = -0.135 + i * (0.27 / max(1, clips - 1))
        td.box("case_clip_%d" % i, (0.048, 0.040, 0.105),
               location=(x, 0.0, 0.100), mat=m["gold"], parent=case)
    return case


# --- weapons -----------------------------------------------------------------

def _carbine(m, anchors, heavy=False):
    """A0-A2 and A3: a walnut-stocked carbine. Warm furniture on a blued
    action -- the only wooden thing anywhere in this game, which is most of why
    he does not look issued."""
    gun = anchors["gun"]

    # SLIM FURNITURE, FAT BARREL. The first pass gave it a 0.118 fore-end
    # around a 0.031 barrel, and the weapon read as a plank with a wire taped
    # to it. Real proportions are the other way round, and the barrel is the
    # part that has to survive to 40 px because it is what points at the enemy.
    # A CARBINE, NOT A RIFLE. The first layout ran from -0.60 to 0.98 with the
    # walnut split into a stock and a fore-end at opposite ends of a blue
    # receiver, and the two brown blocks read as two separate objects floating
    # either side of him. Shortening it to 1.42 puts the wood back into one
    # continuous run and stops the butt sticking half a body length out behind.
    td.box("stock", (0.300, 0.078, 0.115), location=(-0.360, 0.0, -0.035),
           mat=m["walnut"], parent=gun)
    td.box("butt_plate", (0.042, 0.112, 0.160), location=(-0.525, 0.0, -0.030),
           mat=m["gun_dark"], parent=gun)
    td.box("comb", (0.160, 0.078, 0.042), location=(-0.300, 0.0, 0.055),
           mat=m["walnut"], parent=gun)
    td.box("receiver", (0.360 if heavy else 0.340, 0.104, 0.124),
           location=(-0.040, 0.0, 0.005), mat=m["gun"], parent=gun)
    for y in (0.060, -0.060):
        td.box("receiver_plate_%s" % y, (0.240, 0.022, 0.084),
               location=(-0.040, y, 0.005), mat=m["gun_dark"], parent=gun)
    # The seat every accent layer clips to. It is the topmost part of the
    # weapon at every one of the 48 facings and the work cycle never moves it.
    td.box("top_rail", (0.280, 0.062, 0.024),
           location=(RAIL_LOCAL["a3" if heavy else "base"][0], 0.0,
                     RAIL_LOCAL["a3" if heavy else "base"][2] - 0.020),
           mat=m["gun_dark"], parent=gun)
    td.box("charger_guide", (0.070, 0.072, 0.032), location=(0.095, 0.0, 0.082),
           mat=m["gun_dark"], parent=gun)
    td.box("ejection_port", (0.115, 0.020, 0.050),
           location=(0.020, -0.058, 0.028), mat=m["gun_dark"], parent=gun)
    td.box("magazine", (0.095, 0.078, 0.150), location=(-0.055, 0.0, -0.145),
           rotation=(0.0, math.radians(-6.0), 0.0), mat=m["gun"], parent=gun)
    td.box("mag_floor", (0.108, 0.088, 0.024), location=(-0.062, 0.0, -0.222),
           mat=m["gold_dark"], parent=gun)
    td.box("grip", (0.086, 0.074, 0.165), location=(-0.215, 0.0, -0.128),
           rotation=(0.0, math.radians(16.0), 0.0), mat=m["walnut"],
           parent=gun)
    td.torus("trigger_guard", 0.048, 0.011, (-0.135, 0.0, -0.080),
             (math.radians(90.0), 0.0, 0.0), m["gun_dark"], gun,
             major_segments=12, minor_segments=4)
    # Slim walnut over a blued tube. The wood is the warm note, not the mass --
    # a fat fore-end is what made the earlier weapon read as a plank.
    td.box("fore_end", (0.240, 0.074, 0.068), location=(0.240, 0.0, -0.016),
           mat=m["walnut"], parent=gun)
    td.cyl("gas_tube", 0.030, 0.240, location=(0.240, 0.0, 0.042),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun_dark"],
           parent=gun, verts=8)
    td.cyl("fore_band", 0.058, 0.028, location=(0.360, 0.0, -0.006),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun_dark"],
           parent=gun, verts=10)
    # A SLING. One diagonal leather line from the butt to the fore-end, and it
    # is the cheapest thing on the model that says the weapon is CARRIED rather
    # than floating beside him.
    td.tube("sling", 0.016, (-0.470, 0.0, -0.090), (0.330, 0.0, -0.070),
            m["leather"], gun, verts=6)
    barrel_len = 0.48 if heavy else 0.40
    td.cyl("barrel", 0.040 if heavy else 0.036, barrel_len,
           location=(0.400 + barrel_len * 0.5, 0.0, 0.012),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun"], parent=gun)
    td.box("front_sight", (0.028, 0.026, 0.050),
           location=(0.400 + barrel_len - 0.06, 0.0, 0.052), mat=m["gun_dark"],
           parent=gun)
    td.cyl("muzzle", 0.052, 0.080,
           location=(0.400 + barrel_len + 0.030, 0.0, 0.012),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun_dark"],
           parent=gun, verts=10)

    bolt = td.root("bolt")
    bolt.parent = gun
    bolt.location = (-0.020, -0.072, 0.042)
    td.box("bolt_body", (0.175, 0.048, 0.048), location=(0.0, 0.0, 0.0),
           mat=m["chrome"], parent=bolt)
    td.cyl("bolt_handle", 0.019, 0.090, location=(0.055, -0.050, 0.0),
           rotation=(math.radians(90.0), 0.0, 0.0), mat=m["chrome"],
           parent=bolt, verts=8)
    td.ellipsoid("bolt_knob", (0.060, 0.060, 0.060), (0.055, -0.105, 0.0),
                 m["gun_dark"], bolt)

    casing = _casing(m, gun, (0.020, -0.030, 0.020))
    return {"gun": gun, "bolt": bolt, "casing": casing}


def _casing(m, gun, home):
    """A spent case, on its own empty, parked INSIDE the receiver at rest.

    Hiding it by geometry rather than by keying visibility keeps the whole
    animation in one channel type, and an opaque receiver is a perfectly good
    occluder from all 48 facings."""
    casing = td.root("casing")
    casing.parent = gun
    casing.location = home
    td.cyl("casing_body", 0.021, 0.060, location=(0.0, 0.0, 0.0),
           rotation=(math.radians(90.0), 0.0, 0.0), mat=m["gold"],
           parent=casing, verts=8)
    td.cyl("casing_rim", 0.026, 0.014, location=(0.0, 0.030, 0.0),
           rotation=(math.radians(90.0), 0.0, 0.0), mat=m["gold_dark"],
           parent=casing, verts=8)
    return casing


def _thompson(m, anchors, heavy=False):
    """B3/B4: the burst ends, so the weapon does. Drum-fed, walnut fore grip,
    compensated. The drum is on its own empty because a magazine that turns is
    what makes automatic fire read as automatic at this size."""
    gun = anchors["gun"]

    td.box("stock", (0.280, 0.092, 0.135), location=(-0.400, 0.0, -0.050),
           mat=m["walnut"], parent=gun)
    td.box("butt_plate", (0.040, 0.108, 0.155), location=(-0.552, 0.0, -0.048),
           mat=m["gun_dark"], parent=gun)
    td.box("receiver", (0.380, 0.108, 0.132), location=(-0.030, 0.0, 0.0),
           mat=m["gun"], parent=gun)
    td.box("top_rail", (0.280, 0.064, 0.026), location=(-0.020, 0.0, 0.079),
           mat=m["gun_dark"], parent=gun)
    td.box("rear_sight", (0.040, 0.058, 0.044), location=(-0.150, 0.0, 0.108),
           mat=m["gun_dark"], parent=gun)
    td.box("ejection_port", (0.105, 0.020, 0.048),
           location=(0.030, -0.062, 0.028), mat=m["gun_dark"], parent=gun)
    td.box("grip", (0.088, 0.076, 0.162), location=(-0.190, 0.0, -0.128),
           rotation=(0.0, math.radians(14.0), 0.0), mat=m["walnut"],
           parent=gun)
    td.torus("trigger_guard", 0.048, 0.011, (-0.110, 0.0, -0.082),
             (math.radians(90.0), 0.0, 0.0), m["gun_dark"], gun,
             major_segments=12, minor_segments=4)
    # The vertical fore grip. The single most recognisable line on this weapon.
    td.box("fore_grip", (0.088, 0.082, 0.160), location=(0.330, 0.0, -0.118),
           rotation=(0.0, math.radians(-8.0), 0.0), mat=m["walnut"],
           parent=gun)
    td.box("fore_end", (0.200, 0.086, 0.082), location=(0.300, 0.0, -0.008),
           mat=m["walnut"], parent=gun)
    barrel_len = 0.34 if not heavy else 0.38
    td.cyl("barrel", 0.036, barrel_len,
           location=(0.430 + barrel_len * 0.5, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun"], parent=gun)
    if heavy:
        # B4's cooling rings. The tier that never stops firing should look like
        # it has thought about that.
        for x in (0.50, 0.60, 0.70):
            td.cyl("cool_ring_%s" % x, 0.050, 0.022, location=(x, 0.0, 0.0),
                   rotation=(0.0, math.radians(90.0), 0.0),
                   mat=m["gun_dark"], parent=gun, verts=10)
    comp_x = 0.430 + barrel_len + 0.055
    td.cyl("compensator", 0.052, 0.115, location=(comp_x, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun_dark"],
           parent=gun, verts=10)
    for y in (0.028, -0.028):
        td.box("comp_slot_%s" % y, (0.075, 0.014, 0.062),
               location=(comp_x, y, 0.028), mat=m["gun"], parent=gun)

    drum = td.root("drum")
    drum.parent = gun
    drum.location = (0.030, 0.0, -0.150)
    td.cyl("drum_body", 0.140, 0.086, location=(0.0, 0.0, 0.0),
           rotation=(math.radians(90.0), 0.0, 0.0), mat=m["gun"],
           parent=drum, verts=16)
    td.cyl("drum_face", 0.104, 0.026, location=(0.0, -0.052, 0.0),
           rotation=(math.radians(90.0), 0.0, 0.0), mat=m["chrome"],
           parent=drum, verts=14)
    td.cyl("drum_hub", 0.042, 0.034, location=(0.0, -0.060, 0.0),
           rotation=(math.radians(90.0), 0.0, 0.0), mat=m["gold"],
           parent=drum, verts=10)
    # Rivets around the face. They are the only way a drum's rotation is
    # visible at all once the sheet is downsampled.
    for i in range(6):
        angle = math.tau * i / 6.0
        td.ellipsoid("drum_rivet_%d" % i, (0.042, 0.042, 0.042),
                     (math.cos(angle) * 0.092, -0.060,
                      math.sin(angle) * 0.092), m["gold"], drum)

    casing = _casing(m, gun, (0.030, -0.030, 0.020))
    return {"gun": gun, "drum": drum, "casing": casing}


def _spotlight(m, parent, at, height=0.90, yaw=0.0, lamp=None):
    """A filament in a can on a tripod. THIS IS B3's CAMO DETECTION.

    It is a lamp rather than a lens or an eye on purpose: path B's whole claim
    is that he never bought anything he could not have bought from a catalogue.
    """
    lamp = lamp or m["lamp"]
    stand = td.root("spot_%.2f_%.2f" % (at[0], at[1]))
    stand.parent = parent
    stand.location = (at[0], at[1], 0.0)
    stand.rotation_euler = (0.0, 0.0, yaw)

    for i in range(3):
        angle = math.tau * i / 3.0 + math.radians(30.0)
        # The legs are the outermost ground-level geometry on the whole model
        # and therefore the thing that decides B3's framing -- a foot at
        # radius r from the tower centre projects 0.56*r BELOW the tile's world
        # origin, and only 0.14 of a tile sits below it.
        td.tube("spot_leg_%d" % i, 0.024,
                (0.0, 0.0, height),
                (math.cos(angle) * 0.135, math.sin(angle) * 0.135, 0.0),
                m["steel_dark"], stand, verts=6)
    td.box("spot_collar", (0.080, 0.080, 0.062), location=(0.0, 0.0, height),
           mat=m["steel"], parent=stand)
    td.cyl("spot_can", 0.115, 0.150, location=(0.0, 0.0, height + 0.075),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["steel"],
           parent=stand, verts=14)
    # THE HOOD SITS BEHIND THE LENS, NOT OVER IT. The first pass centred both
    # on the same point and the flare swallowed the filament whole, so the one
    # piece of this tower that has to glow rendered as a grey can.
    td.frustum("spot_hood", 0.120, 0.150, 0.060, (0.098, 0.0, height + 0.075),
               m["steel_dark"], stand, verts=12,
               rotation=(0.0, math.radians(90.0), 0.0))
    td.ellipsoid("spot_lens", (0.055, 0.215, 0.215),
                 (0.140, 0.0, height + 0.075), lamp, stand)
    return stand


def _crate(m, parent, size, location, rotation_z=0.0, name="crate"):
    """A wooden crate with a visible frame. The frame is not decoration: a
    plain box of one colour is the fastest way to lose a silhouette."""
    box = td.box(name, size, location=location,
                 rotation=(0.0, 0.0, rotation_z), mat=m["crate"],
                 parent=parent)
    td.box(name + "_band_a", (size[0] * 1.02, size[1] * 1.02, size[2] * 0.10),
           location=(location[0], location[1],
                     location[2] + size[2] * 0.36),
           rotation=(0.0, 0.0, rotation_z), mat=m["walnut"], parent=parent)
    td.box(name + "_band_b", (size[0] * 1.02, size[1] * 1.02, size[2] * 0.10),
           location=(location[0], location[1],
                     location[2] - size[2] * 0.36),
           rotation=(0.0, 0.0, rotation_z), mat=m["walnut"], parent=parent)
    return box


def _hat_on_peg(m, parent, location, name):
    """One recruit, waiting. B4 hangs two of these and B5 hangs four."""
    hat = td.root(name)
    hat.parent = parent
    hat.location = location
    # Hung face-out at 58 degrees rather than flat at 74: flat, a row of these
    # reads as a stack of dark discs on a pole instead of as hats.
    hat.rotation_euler = (math.radians(58.0), 0.0, 0.0)
    td.cyl(name + "_brim", 0.150, 0.022, location=(0.0, 0.0, 0.0),
           mat=m["suit_dark"], parent=hat, verts=12)
    td.frustum(name + "_crown", 0.085, 0.075, 0.105, (0.0, 0.0, 0.062),
               m["suit_dark"], hat, verts=10)
    td.cyl(name + "_band", 0.088, 0.030, location=(0.0, 0.0, 0.028),
           mat=m["tie"], parent=hat, verts=10)
    return hat


# --- A0-A2 / B1-B2: the boss -------------------------------------------------

def build_boss(m, parent):
    """The base body. A man in a suit with a carbine and a case of clips, and
    NO PLINTH -- draw-pack paints his pad before the sprite."""
    anchors = _anchors(parent, "base")
    figure = anchors["figure"]

    _legs(m, figure)
    _suit(m, figure)
    _shoulders(m, anchors["shoulder"])
    _head_geometry(m, anchors)
    _violin_case(m, figure)

    parts = _carbine(m, anchors)
    parts["rear"] = _hip_arms(m, anchors["shoulder"], "base")
    parts["anchors"] = anchors
    return parts


# --- A3: the loader ----------------------------------------------------------

def build_arsenal3(m, parent):
    """A3. He stops reaching for clips, which IS the shorter cooldown.

    A chromed feed column carries the case's contents at chest height and an
    arm puts them in the gun. The cybernetic budget spent here is one servo
    readout and one forearm brace -- and the readout is the FIRST teal on this
    tower, three tiers in.
    """
    anchors = _anchors(parent, "a3")
    figure = anchors["figure"]

    _legs(m, figure)
    _suit(m, figure)
    _shoulders(m, anchors["shoulder"])
    _head_geometry(m, anchors)

    stand = td.root("feed_stand")
    stand.parent = parent
    stand.location = (-0.26, -0.38, 0.0)
    td.frustum("stand_foot", 0.230, 0.190, 0.055, (0.0, 0.0, 0.028),
               m["steel_dark"], stand, verts=10)
    td.cyl("stand_column", 0.056, 0.90, location=(0.0, 0.0, 0.480),
           mat=m["chrome"], parent=stand, verts=10)
    td.box("stand_rack", (0.230, 0.210, 0.320), location=(0.0, 0.0, 1.010),
           mat=m["steel"], parent=stand)
    # The case, emptied into the rack. Six clips: A3 is the tier where the
    # supply stops being what he can carry.
    for i in range(6):
        col, row = i % 3, i // 3
        td.box("rack_clip_%d" % i, (0.060, 0.050, 0.130),
               location=(-0.070 + col * 0.070, -0.048 + row * 0.096, 1.130),
               mat=m["gold"], parent=stand)
    # The case itself, closed and stood against the column -- he did not
    # throw it away, he graduated from it.
    td.box("case_stowed", (0.560, 0.200, 0.100), location=(0.020, -0.180, 0.30),
           rotation=(0.0, math.radians(74.0), 0.0), mat=m["leather"],
           parent=stand)

    servo = td.root("servo")
    servo.parent = stand
    servo.location = (0.180, 0.150, 1.150)
    td.box("servo_case", (0.170, 0.150, 0.150), location=(0.0, 0.0, 0.0),
           mat=m["chrome"], parent=servo)
    td.box("servo_readout", (0.020, 0.095, 0.052), location=(0.088, 0.0, 0.025),
           mat=m["ley"], parent=servo)

    # The arm reaches the charger guide. Its target is the rail anchor, so a
    # nudge to the pose moves the arm with it rather than leaving it in space.
    loader = td.root("loader_arm")
    loader.parent = servo
    loader.location = (0.0, 0.0, 0.0)
    td.tube("loader_upper", 0.040, (0.030, 0.0, 0.030), (0.230, 0.160, 0.130),
            m["chrome"], loader, verts=8)
    td.ellipsoid("loader_joint", (0.090, 0.090, 0.090), (0.230, 0.160, 0.130),
                 m["gun_dark"], loader)
    td.tube("loader_fore", 0.033, (0.230, 0.160, 0.130), (0.330, 0.330, 0.185),
            m["chrome"], loader, verts=8)
    td.box("loader_claw", (0.090, 0.070, 0.060), location=(0.345, 0.345, 0.190),
           mat=m["gun_dark"], parent=loader)
    td.box("loader_clip", (0.055, 0.048, 0.120), location=(0.345, 0.345, 0.260),
           mat=m["gold"], parent=loader)

    parts = _carbine(m, anchors, heavy=True)
    parts["rear"] = _hip_arms(m, anchors["shoulder"], "a3")
    _brace(m, anchors["shoulder"], _hip_hands("a3")[1], (0.155, 0.215, -0.305))
    parts["loader"] = loader
    parts["anchors"] = anchors
    return parts


# --- A4: the pintle ----------------------------------------------------------

def _mount_column(m, parent, foot_radius, height, top_size, at=(0.12, 0.0)):
    column = td.root("mount")
    column.parent = parent
    column.location = (at[0], at[1], 0.0)
    td.frustum("mount_foot", foot_radius, foot_radius * 0.86, 0.075,
               (0.0, 0.0, 0.038), m["steel_dark"], column, verts=12,
               alternate_mat=m["steel"])
    td.cyl("mount_column", 0.088, height, location=(0.0, 0.0, height * 0.5),
           mat=m["steel"], parent=column, verts=12)
    td.box("mount_yoke", top_size, location=(0.0, 0.0, height + 0.04),
           mat=m["steel_dark"], parent=column)
    for y in (0.16, -0.16):
        td.tube("mount_stay_%s" % y, 0.030, (0.0, y * 0.4, height * 0.55),
                (0.0, y, 0.10), m["steel_dark"], column, verts=6)
    return column


def build_arsenal4(m, parent):
    """A4. The gun leaves his hands and goes on a pintle with a hopper.

    He is behind it on spade grips, in a chrome shoulder yoke, with a
    targeting monocle on the hat brim. The suit is untouched -- that is the
    whole difference between this tier and the Sniper's A4, which is the same
    money spent on removing a man's legs.
    """
    anchors = _anchors(parent, "a4")
    figure = anchors["figure"]
    gun = anchors["gun"]

    # The foot radius and FIGURE_OFFSET["a4"] are a pair: he has to stand
    # BEHIND the mount, not inside its base plate.
    _mount_column(m, parent, 0.34, 0.96, (0.24, 0.38, 0.16))

    td.box("breech", (0.480, 0.220, 0.215), location=(-0.060, 0.0, 0.0),
           mat=m["gun"], parent=gun)
    td.box("breech_top", (0.320, 0.130, 0.045), location=(-0.120, 0.0, 0.125),
           mat=m["gun_dark"], parent=gun)
    td.box("feed_tray", (0.180, 0.240, 0.070), location=(-0.020, 0.130, 0.100),
           rotation=(math.radians(14.0), 0.0, 0.0), mat=m["steel"],
           parent=gun)
    td.cyl("shroud", 0.078, 0.300, location=(0.320, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun_dark"],
           parent=gun, verts=12)
    for x in (0.24, 0.34, 0.44):
        td.cyl("shroud_fin_%s" % x, 0.098, 0.022, location=(x, 0.0, 0.0),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun"],
               parent=gun, verts=12)
    td.cyl("barrel", 0.046, 0.520, location=(0.740, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun"], parent=gun)
    td.cyl("flash_hider", 0.062, 0.110, location=(1.030, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun_dark"],
           parent=gun, verts=10)
    # Spade grips, walnut. He is working a machine gun in a tailored suit and
    # the wood is what keeps that from reading as a robot arm.
    for y in (0.180, -0.180):
        td.box("spade_%s" % y, (0.090, 0.085, 0.240),
               location=(-0.280, y, -0.080), mat=m["walnut"], parent=gun)
        td.box("spade_arm_%s" % y, (0.180, 0.070, 0.070),
               location=(-0.200, y, 0.020), mat=m["steel_dark"], parent=gun)

    hopper = td.root("hopper")
    hopper.parent = parent
    hopper.location = (-0.30, 0.36, 0.0)
    td.frustum("hopper_body", 0.135, 0.195, 0.250, (0.0, 0.0, 1.360),
               m["steel"], hopper, verts=10, alternate_mat=m["steel_dark"])
    td.box("hopper_lid", (0.350, 0.350, 0.038), location=(0.0, 0.0, 1.500),
           mat=m["steel_dark"], parent=hopper)
    td.cyl("hopper_post", 0.060, 1.24, location=(0.0, 0.0, 0.620),
           mat=m["steel_dark"], parent=hopper, verts=10)
    td.tube("hopper_chute", 0.060, (0.0, 0.0, 1.240), (0.42, -0.24, 1.190),
            m["chrome"], hopper, verts=8)
    td.box("chute_mouth", (0.115, 0.130, 0.095), location=(0.44, -0.26, 1.180),
           mat=m["gun_dark"], parent=hopper)

    _legs(m, figure)
    _suit(m, figure)
    _shoulders(m, anchors["shoulder"], wide=True)
    _head_geometry(m, anchors, monocle=True, yoke=True)

    # Both arms go forward onto the spade grips, so neither one is the rear arm
    # the bolt cycle moves. The moving part at this tier is the loader instead.
    # The hands are the spade positions expressed in the shoulder's frame; move
    # either the mount or FIGURE_OFFSET and these have to move with them.
    _arm(m, anchors["shoulder"], FWD_JOINT, (0.190, 0.300, -0.200),
         (0.360, 0.210, -0.280), name="fwd_l")
    _arm(m, anchors["shoulder"], REAR_JOINT,
         (0.190, -0.300, -0.200), (0.360, -0.150, -0.280), ring=True,
         name="fwd_r")

    loader = td.root("loader_arm")
    loader.parent = parent
    loader.location = (-0.02, 0.22, 1.30)
    td.tube("loader_upper", 0.038, (0.0, 0.0, 0.0), (0.180, -0.120, 0.010),
            m["chrome"], loader, verts=8)
    td.ellipsoid("loader_joint", (0.085, 0.085, 0.085), (0.180, -0.120, 0.010),
                 m["gun_dark"], loader)
    td.tube("loader_fore", 0.032, (0.180, -0.120, 0.010), (0.300, -0.120, 0.075),
            m["chrome"], loader, verts=8)
    td.box("loader_readout", (0.020, 0.075, 0.045),
           location=(0.060, -0.055, 0.040), mat=m["ley"], parent=loader)

    casing = _casing(m, gun, (-0.020, -0.040, 0.030))
    return {"gun": gun, "loader": loader, "casing": casing, "anchors": anchors}


# --- A5: the battery ---------------------------------------------------------

def build_arsenal5(m, parent):
    """A5. Four barrels, a chute, a servo arm and a drift of spent gold.

    THE CASE DRIFT IS THE TIER. 66.7 DPS is the highest sustained output on
    the board and the only honest way to draw it is the pile it leaves behind.
    He is still in the suit, still in the hat, still smoking.
    """
    anchors = _anchors(parent, "a5")
    figure = anchors["figure"]
    gun = anchors["gun"]

    _mount_column(m, parent, 0.42, 1.00, (0.30, 0.44, 0.18))

    td.box("breech", (0.360, 0.340, 0.340), location=(0.020, 0.0, 0.0),
           mat=m["gun"], parent=gun)
    td.box("breech_cap", (0.240, 0.220, 0.060), location=(-0.040, 0.0, 0.190),
           mat=m["gun_dark"], parent=gun)

    # The rotary block. Its own empty so the work cycle can index it.
    block = td.root("barrel_block")
    block.parent = gun
    block.location = (0.300, 0.0, 0.0)
    td.cyl("block_hub", 0.150, 0.340, location=(0.0, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun_dark"],
           parent=block, verts=12)
    for i in range(4):
        angle = math.tau * i / 4.0 + math.radians(45.0)
        y = math.cos(angle) * 0.098
        z = math.sin(angle) * 0.098
        td.cyl("battery_barrel_%d" % i, 0.043, 0.700,
               location=(0.400, y, z), rotation=(0.0, math.radians(90.0), 0.0),
               mat=m["gun"], parent=block, verts=10)
    td.cyl("block_face", 0.165, 0.055, location=(0.760, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun_dark"],
           parent=block, verts=12)

    for y in (0.220, -0.220):
        td.box("spade_%s" % y, (0.090, 0.085, 0.250),
               location=(-0.360, y, -0.110), mat=m["walnut"], parent=gun)
        td.box("spade_arm_%s" % y, (0.260, 0.070, 0.070),
               location=(-0.240, y, 0.010), mat=m["steel_dark"], parent=gun)

    hopper = td.root("hopper")
    hopper.parent = parent
    hopper.location = (-0.36, 0.40, 0.0)
    td.frustum("hopper_body", 0.160, 0.230, 0.300, (0.0, 0.0, 1.420),
               m["steel"], hopper, verts=10, alternate_mat=m["steel_dark"])
    td.box("hopper_lid", (0.410, 0.410, 0.042), location=(0.0, 0.0, 1.590),
           mat=m["steel_dark"], parent=hopper)
    td.cyl("hopper_post", 0.068, 1.28, location=(0.0, 0.0, 0.640),
           mat=m["steel_dark"], parent=hopper, verts=10)
    td.tube("hopper_chute", 0.070, (0.0, 0.0, 1.280), (0.60, -0.34, 1.220),
            m["chrome"], hopper, verts=8)
    td.box("chute_mouth", (0.130, 0.150, 0.110), location=(0.62, -0.36, 1.210),
           mat=m["gun_dark"], parent=hopper)

    # Spent gold, in a fixed arrangement rather than a random one: the sheet is
    # rendered once and a seed that moved between builds would be a diff nobody
    # could review. Kept inside radius 0.62 so the drift never swings below the
    # tile's bottom gutter during the 48-facing turn.
    drift = ((0.30, -0.46, 0.0), (0.14, -0.54, 0.28), (-0.10, -0.50, 0.9),
             (0.42, -0.30, 0.5), (-0.28, -0.42, 1.4), (0.02, -0.38, 0.2),
             (0.24, -0.58, 1.1), (-0.42, -0.30, 0.7), (0.52, -0.14, 0.3),
             (-0.16, -0.60, 1.6), (0.38, -0.48, 0.9), (-0.34, -0.52, 0.4),
             (0.08, -0.26, 1.2), (0.46, -0.44, 1.5), (-0.02, -0.62, 0.6),
             (0.20, -0.16, 0.8))
    for i, (x, y, yaw) in enumerate(drift):
        td.cyl("spent_%d" % i, 0.021, 0.058, location=(x, y, 0.021),
               rotation=(math.radians(90.0), 0.0, yaw), mat=m["gold"],
               parent=parent, verts=6)
    td.ellipsoid("spent_heap", (0.44, 0.30, 0.075), (0.16, -0.44, 0.030),
                 m["gold_dark"], parent)

    _legs(m, figure)
    _suit(m, figure)
    _shoulders(m, anchors["shoulder"], wide=True)
    _head_geometry(m, anchors, monocle=True, yoke=True)
    _arm(m, anchors["shoulder"], FWD_JOINT, (0.210, 0.340, -0.190),
         (0.400, 0.270, -0.270), name="fwd_l")
    _arm(m, anchors["shoulder"], REAR_JOINT,
         (0.210, -0.340, -0.190), (0.400, -0.170, -0.270), ring=True,
         name="fwd_r")

    loader = td.root("loader_arm")
    loader.parent = parent
    loader.location = (0.0, 0.26, 1.34)
    td.tube("loader_upper", 0.042, (0.0, 0.0, 0.0), (0.200, -0.150, 0.010),
            m["chrome"], loader, verts=8)
    td.ellipsoid("loader_joint", (0.095, 0.095, 0.095), (0.200, -0.150, 0.010),
                 m["gun_dark"], loader)
    td.tube("loader_fore", 0.035, (0.200, -0.150, 0.010), (0.330, -0.150, 0.080),
            m["chrome"], loader, verts=8)
    td.box("loader_readout", (0.022, 0.085, 0.050),
           location=(0.070, -0.070, 0.045), mat=m["ley"], parent=loader)

    casing = _casing(m, gun, (0.020, -0.060, 0.040))
    return {"gun": gun, "loader": loader, "block": block, "casing": casing,
            "anchors": anchors}


# --- B3/B4/B5: the crew ------------------------------------------------------
#
# Path B never becomes cybernetic and never glows. What it buys is an
# organisation: a weapon that does not stop, a light to see with, a wall to
# stand behind, and men. Every tier here is cloth, wood, steel plate and
# tungsten, and if any of it ever picks up a ley or sigil material the tower
# has lost the only thing that distinguishes it from every other tower.

def build_crew3(m, parent):
    """B3. The burst ends: drum-fed automatic, an overcoat, a barricade and
    the spotlight that is this tier's camo detection."""
    anchors = _anchors(parent, "b3")
    figure = anchors["figure"]

    _legs(m, figure)
    _suit(m, figure, overcoat=True)
    _shoulders(m, anchors["shoulder"], wide=True)
    _head_geometry(m, anchors)

    _spotlight(m, parent, (-0.30, -0.40), height=0.78, yaw=math.radians(-16.0),
               lamp=m["lamp"])

    barricade = td.root("barricade")
    barricade.parent = parent
    barricade.location = (0.28, 0.38, 0.0)
    _crate(m, barricade, (0.280, 0.250, 0.235), (0.0, 0.0, 0.118),
           rotation_z=math.radians(8.0), name="crate_a")
    _crate(m, barricade, (0.260, 0.235, 0.220), (0.245, -0.100, 0.110),
           rotation_z=math.radians(-14.0), name="crate_b")
    _crate(m, barricade, (0.245, 0.220, 0.205), (0.015, 0.015, 0.338),
           rotation_z=math.radians(-6.0), name="crate_c")
    td.box("plank", (0.560, 0.050, 0.105), location=(0.130, -0.140, 0.450),
           rotation=(0.0, math.radians(-6.0), math.radians(-10.0)),
           mat=m["walnut"], parent=barricade)

    parts = _thompson(m, anchors)
    parts["rear"] = _hip_arms(m, anchors["shoulder"], "b3")
    parts["anchors"] = anchors
    return parts


def build_crew4(m, parent):
    """B4. The crew arrives: a rack with two spare guns and TWO HATS, riveted
    plate on the barricade, and an open case of gold-tipped shells.

    The shells are the defence pierce. They are hand-loaded ammunition in a
    case, not an enchantment, which is exactly what a flat ten points off an
    enemy's percentage should look like.
    """
    anchors = _anchors(parent, "b4")
    figure = anchors["figure"]

    _legs(m, figure)
    _suit(m, figure, overcoat=True, holster=True)
    _shoulders(m, anchors["shoulder"], wide=True)
    _head_geometry(m, anchors)

    _spotlight(m, parent, (-0.30, -0.42), height=0.80, yaw=math.radians(-16.0),
               lamp=m["lamp"])
    _spotlight(m, parent, (-0.26, 0.40), height=0.66, yaw=math.radians(38.0),
               lamp=m["lamp_dim"])

    barricade = td.root("barricade")
    barricade.parent = parent
    barricade.location = (0.30, 0.38, 0.0)
    _crate(m, barricade, (0.280, 0.250, 0.235), (0.0, 0.0, 0.118),
           rotation_z=math.radians(8.0), name="crate_a")
    _crate(m, barricade, (0.260, 0.235, 0.220), (0.240, -0.110, 0.110),
           rotation_z=math.radians(-14.0), name="crate_b")
    _crate(m, barricade, (0.245, 0.220, 0.205), (0.015, 0.010, 0.338),
           rotation_z=math.radians(-6.0), name="crate_c")
    _crate(m, barricade, (0.230, 0.205, 0.190), (0.245, -0.120, 0.315),
           rotation_z=math.radians(10.0), name="crate_d")
    # Riveted plate. The tier's +110 HP, made of something.
    td.box("plate", (0.065, 0.480, 0.360), location=(-0.145, -0.045, 0.235),
           rotation=(0.0, math.radians(-7.0), math.radians(-8.0)),
           mat=m["steel"], parent=barricade)
    for i in range(5):
        td.ellipsoid("plate_rivet_%d" % i, (0.042, 0.042, 0.042),
                     (-0.178, -0.220 + i * 0.090, 0.375), m["steel_dark"],
                     barricade)
    for i in range(3):
        td.ellipsoid("sandbag_%d" % i, (0.250, 0.185, 0.125),
                     (-0.190 + i * 0.028, 0.190 - i * 0.155, 0.062),
                     m["leather"], barricade)

    rack = td.root("gun_rack")
    rack.parent = parent
    rack.location = (-0.52, 0.30, 0.0)
    for y in (0.22, -0.22):
        td.cyl("rack_post_%s" % y, 0.036, 1.16, location=(0.0, y, 0.580),
               mat=m["steel_dark"], parent=rack, verts=8)
    td.box("rack_bar", (0.070, 0.560, 0.055), location=(0.0, 0.0, 1.140),
           mat=m["steel_dark"], parent=rack)
    for i, y in enumerate((0.14, -0.14)):
        td.box("spare_gun_%d" % i, (0.110, 0.075, 0.520),
               location=(0.055, y, 0.760),
               rotation=(0.0, math.radians(6.0), 0.0), mat=m["gun"],
               parent=rack)
        td.cyl("spare_drum_%d" % i, 0.110, 0.070, location=(0.075, y, 0.640),
               rotation=(math.radians(90.0), 0.0, 0.0), mat=m["gun_dark"],
               parent=rack, verts=12)
    # ONE HAT PER RECRUIT. B4 calls two.
    _hat_on_peg(m, rack, (-0.060, 0.155, 1.190), "peg_hat_0")
    _hat_on_peg(m, rack, (-0.060, -0.155, 1.190), "peg_hat_1")

    shells = td.root("shell_case")
    shells.parent = parent
    shells.location = (0.30, -0.52, 0.0)
    td.box("shell_box", (0.420, 0.260, 0.130), location=(0.0, 0.0, 0.065),
           rotation=(0.0, 0.0, math.radians(-12.0)), mat=m["crate"],
           parent=shells)
    td.box("shell_lid", (0.420, 0.240, 0.045), location=(-0.030, 0.190, 0.180),
           rotation=(math.radians(-58.0), 0.0, math.radians(-12.0)),
           mat=m["crate"], parent=shells)
    for i in range(6):
        x = -0.150 + (i % 3) * 0.150
        y = -0.050 + (i // 3) * 0.090
        td.cyl("ap_shell_%d" % i, 0.030, 0.150, location=(x, y, 0.145),
               mat=m["gun_dark"], parent=shells, verts=8)
        td.frustum("ap_tip_%d" % i, 0.030, 0.008, 0.070, (x, y, 0.255),
                   m["gold"], shells, verts=8)

    parts = _thompson(m, anchors, heavy=True)
    parts["rear"] = _hip_arms(m, anchors["shoulder"], "b4")
    parts["anchors"] = anchors
    return parts


def build_crew5(m, parent):
    """B5. The boss.

    A dais of crates and plate, a heavy tripod gun with a big drum, a
    fur-collared overcoat, a strongbox, and FOUR hats on the rack. Twenty
    damage flat and no attack speed at all, which is why the tier is drawn as
    weight rather than as speed.
    """
    anchors = _anchors(parent, "b5")
    figure = anchors["figure"]
    gun = anchors["gun"]

    dais = td.root("dais")
    dais.parent = parent
    dais.location = (0.0, 0.0, 0.0)
    # The deck is the largest single surface on the model, so it takes the
    # DARKEST value and only its lip catches the light. Painted the other way
    # round it became a bright slab that pulled the eye off the man on it.
    td.box("dais_deck", (1.020, 0.900, 0.080), location=(-0.060, 0.0, 0.135),
           mat=m["suit_dark"], parent=dais)
    td.box("dais_lip", (1.080, 0.960, 0.035), location=(-0.060, 0.0, 0.180),
           mat=m["steel_dark"], parent=dais)
    for x, y, yaw in ((-0.42, 0.30, 6.0), (-0.42, -0.30, -8.0),
                      (0.30, 0.32, 12.0), (0.30, -0.32, -5.0)):
        _crate(m, dais, (0.380, 0.340, 0.190), (x, y, 0.095),
               rotation_z=math.radians(yaw), name="dais_crate_%.0f_%.0f"
               % (x * 100, y * 100))

    # The gun. A water jacket and a drum: mass, not rate.
    td.box("receiver", (0.400, 0.280, 0.250), location=(-0.010, 0.0, 0.0),
           mat=m["gun"], parent=gun)
    td.box("receiver_top", (0.300, 0.170, 0.050), location=(-0.070, 0.0, 0.148),
           mat=m["gun_dark"], parent=gun)
    td.cyl("water_jacket", 0.092, 0.620, location=(0.520, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun_dark"],
           parent=gun, verts=14)
    for x in (0.300, 0.420, 0.540, 0.660, 0.780):
        td.cyl("jacket_ring_%s" % x, 0.108, 0.026, location=(x, 0.0, 0.0),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["steel"],
               parent=gun, verts=14)
    td.cyl("flash_hider", 0.070, 0.130, location=(0.920, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun_dark"],
           parent=gun, verts=10)
    for y in (0.190, -0.190):
        td.box("spade_%s" % y, (0.095, 0.090, 0.250),
               location=(-0.240, y, -0.090), mat=m["walnut"], parent=gun)

    drum = td.root("drum")
    drum.parent = gun
    drum.location = (0.060, 0.0, -0.230)
    td.cyl("drum_body", 0.210, 0.130, location=(0.0, 0.0, 0.0),
           rotation=(math.radians(90.0), 0.0, 0.0), mat=m["gun"],
           parent=drum, verts=18)
    td.cyl("drum_face", 0.160, 0.034, location=(0.0, -0.078, 0.0),
           rotation=(math.radians(90.0), 0.0, 0.0), mat=m["gun_dark"],
           parent=drum, verts=16)
    for i in range(8):
        angle = math.tau * i / 8.0
        td.ellipsoid("drum_rivet_%d" % i, (0.052, 0.052, 0.052),
                     (math.cos(angle) * 0.145, -0.088,
                      math.sin(angle) * 0.145), m["gold"], drum)

    # The tripod stands ON the dais deck, so its feet are at the deck's top
    # rather than at the map. Legs reach the gun's own mount height.
    tripod = td.root("tripod")
    tripod.parent = parent
    tripod.location = (0.16, 0.0, 0.175)
    for i in range(3):
        angle = math.tau * i / 3.0 + math.radians(20.0)
        td.tube("tripod_leg_%d" % i, 0.034, (0.0, 0.0, 0.960),
                (math.cos(angle) * 0.32, math.sin(angle) * 0.32, 0.0),
                m["steel_dark"], tripod, verts=6)
    td.box("tripod_head", (0.180, 0.200, 0.150), location=(0.0, 0.0, 0.990),
           mat=m["steel"], parent=tripod)

    rack = td.root("hat_rack")
    rack.parent = parent
    rack.location = (-0.66, 0.0, 0.0)
    for y in (0.30, -0.30):
        td.cyl("rack_post_%s" % y, 0.040, 1.30, location=(0.0, y, 0.650),
               mat=m["steel_dark"], parent=rack, verts=8)
    td.box("rack_bar", (0.075, 0.720, 0.060), location=(0.0, 0.0, 1.280),
           mat=m["steel_dark"], parent=rack)
    # FOUR HATS. B5 calls four recruits, and the rack says so.
    for i, y in enumerate((0.255, 0.085, -0.085, -0.255)):
        _hat_on_peg(m, rack, (-0.060, y, 1.330), "peg_hat_%d" % i)

    _spotlight(m, parent, (0.10, -0.62), height=0.92, yaw=math.radians(-14.0),
               lamp=m["lamp"])
    _spotlight(m, parent, (-0.02, 0.62), height=0.80, yaw=math.radians(30.0),
               lamp=m["lamp_dim"])

    strong = td.root("strongbox")
    strong.parent = parent
    strong.location = (0.46, -0.44, 0.0)
    td.box("strong_body", (0.320, 0.280, 0.280), location=(0.0, 0.0, 0.140),
           rotation=(0.0, 0.0, math.radians(-16.0)), mat=m["steel_dark"],
           parent=strong)
    td.torus("strong_dial", 0.070, 0.018, (0.165, -0.045, 0.155),
             (0.0, math.radians(90.0), math.radians(-16.0)), m["gold"],
             strong, major_segments=12, minor_segments=5)
    td.box("gold_bar", (0.190, 0.110, 0.070), location=(-0.030, 0.0, 0.315),
           rotation=(0.0, 0.0, math.radians(-16.0)), mat=m["gold"],
           parent=strong)

    _legs(m, figure)
    _suit(m, figure, overcoat=True, fur_collar=True, holster=True)
    _shoulders(m, anchors["shoulder"], wide=True)
    _head_geometry(m, anchors)
    _arm(m, anchors["shoulder"], FWD_JOINT, (0.140, 0.310, -0.200),
         (0.220, 0.190, -0.310), name="fwd_l")
    _arm(m, anchors["shoulder"], REAR_JOINT,
         (0.140, -0.310, -0.200), (0.220, -0.190, -0.310), ring=True,
         name="fwd_r")

    casing = _casing(m, gun, (0.020, -0.070, 0.040))
    return {"gun": gun, "drum": drum, "casing": casing, "anchors": anchors}


# --- accents -----------------------------------------------------------------
#
# ONE BUILDER FOR ALL SIXTEEN SHEETS. The Sniper needed a function per body
# because its accent is a glow inside a groove and the groove is somewhere
# different on every weapon. This model's accents clip to the four seats every
# body shares -- hat, top rail, muzzle, shoulders -- so the geometry is
# identical and only the anchors move.
#
# WHY THOSE FOUR SEATS AND NOTHING ELSE. They are the parts of the model that
# are (a) visible from all 48 facings, because the camera looks down at 34
# degrees and they are the topmost and forwardmost pieces, and (b) never moved
# by the work cycle, because a one-frame accent is composited over all four
# body frames. An accent on his chest would be painted onto his back at half
# the facings, and an accent on the bolt would slide off it every shot.

def build_accent(m, parent, group, path, tier):
    anchors = _anchors(parent, group)
    hat = anchors["hat"]
    rail = anchors["rail"]
    fore = anchors["fore"]
    muzzle = anchors["muzzle"]
    shoulder = anchors["shoulder"]

    if path == "A":
        # PATH A IS MONEY. He is not becoming anything -- he is getting richer
        # and better supplied, and the hat band is where a man like this shows
        # it first.
        td.cyl("band_gold", 0.136, 0.058, location=(-0.014, 0.0, 0.044),
               mat=m["gold"], parent=hat, verts=14)
        # Cartridges in a loop over the barrel: the tier's extra rounds, on the
        # part of the weapon that clears his own silhouette at every facing.
        count = 3 if tier == 1 else 6
        for i in range(count):
            col, row = i % 3, i // 3
            td.cyl("fore_round_%d" % i, 0.027, 0.110,
                   location=(-0.075 + col * 0.075, 0.052 - row * 0.104, 0.014),
                   rotation=(0.0, math.radians(90.0), 0.0), mat=m["gold"],
                   parent=fore, verts=8)
        td.box("fore_loop", (0.250, 0.130, 0.030), location=(0.0, 0.0, -0.020),
               mat=m["leather"], parent=fore)
        if tier >= 2:
            td.box("band_pin", (0.052, 0.052, 0.075),
                   location=(0.095, 0.100, 0.052), mat=m["gold"], parent=hat)
            td.torus("comp_ring", 0.064, 0.017, (0.0, 0.0, 0.0),
                     (0.0, math.radians(90.0), 0.0), m["gold"], muzzle,
                     major_segments=12, minor_segments=5)
    else:
        # PATH B IS THE ORGANISATION. Oxblood, the colour of his tie and of the
        # lining of his case -- his own colour, not a faction's.
        td.cyl("band_ox", 0.136, 0.058, location=(-0.014, 0.0, 0.044),
               mat=m["tie"], parent=hat, verts=14)
        if tier == 1:
            # +25 range: a long sight clamped to the rail. Glass, not sight
            # beyond mortal ken.
            td.cyl("sight_tube", 0.048, 0.280, location=(0.040, 0.0, 0.062),
                   rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun_dark"],
                   parent=rail, verts=12)
            for x in (-0.070, 0.140):
                td.cyl("sight_ring_%s" % x, 0.058, 0.028,
                       location=(x, 0.0, 0.062),
                       rotation=(0.0, math.radians(90.0), 0.0),
                       mat=m["chrome"], parent=rail, verts=10)
            td.ellipsoid("sight_glass", (0.030, 0.086, 0.086),
                         (0.186, 0.0, 0.062), m["lamp_dim"], rail)
            for x in (-0.060, 0.100):
                td.box("sight_mount_%s" % x, (0.055, 0.060, 0.055),
                       location=(x, 0.0, 0.022), mat=m["gun_dark"],
                       parent=rail)
        else:
            # +40 HP and +1 damage: steel over the shoulders and a heavier top
            # cover. Both are armour you can point at.
            for y in (0.250, -0.250):
                td.box("shoulder_cap_%s" % y, (0.270, 0.155, 0.070),
                       location=(0.0, y, 0.100), mat=m["steel"],
                       parent=shoulder)
                for i in range(3):
                    td.ellipsoid("cap_rivet_%s_%d" % (y, i),
                                 (0.044, 0.044, 0.044),
                                 (-0.075 + i * 0.075, y, 0.138),
                                 m["steel_dark"], shoulder)
            td.box("rail_cover", (0.310, 0.115, 0.048),
                   location=(0.0, 0.0, 0.048), mat=m["steel"], parent=rail)
            td.box("rail_cover_lip", (0.090, 0.130, 0.062),
                   location=(0.150, 0.0, 0.040), mat=m["steel_dark"],
                   parent=rail)
    return anchors


# --- animation ---------------------------------------------------------------

def key(obj, frame, rotation=None, location=None):
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert("rotation_euler", frame=frame)
    if location is not None:
        obj.location = location
        obj.keyframe_insert("location", frame=frame)


def animate_work(parts):
    """The four-frame work cycle, read by draw-pack in this order:

        0  at rest, aimed          (held for the rest of the firing cycle)
        1  the shot has gone: bolt back, case clearing the port
        2  fully open, case in the air
        3  closing, case falling away

    ONLY THE MOVING PARTS ARE KEYED, and that is a hard constraint rather than
    an economy. Sixteen one-frame accent sheets are composited over these four
    frames, so the hat, the top rail, the muzzle and the shoulders must be
    bit-identical on all four or every accent slides. The bolt, the drum, the
    ejected case, the rear arm and the loader arm are the only things allowed
    to move, and none of them carries an accent.

    Indexed off `Soldier.gearPhase()`, which already reconciles the tower's two
    firing models -- so a burst plays this at burst speed and B3's automatic
    fire plays exactly the same four frames as a continuous shudder.
    """
    bolt = parts.get("bolt")
    drum = parts.get("drum")
    block = parts.get("block")
    casing = parts.get("casing")
    rear = parts.get("rear")
    loader = parts.get("loader")

    if bolt is not None:
        home = tuple(bolt.location)
        key(bolt, 1, location=home, rotation=(0.0, 0.0, 0.0))
        key(bolt, 2, location=(home[0] - 0.075, home[1], home[2]),
            rotation=(math.radians(-24.0), 0.0, 0.0))
        key(bolt, 3, location=(home[0] - 0.150, home[1], home[2]),
            rotation=(math.radians(-40.0), 0.0, 0.0))
        key(bolt, 4, location=(home[0] - 0.045, home[1], home[2]),
            rotation=(math.radians(-12.0), 0.0, 0.0))

    if drum is not None:
        home = tuple(drum.location)
        for frame in range(1, WORK_FRAMES + 1):
            key(drum, frame, location=home,
                rotation=(math.radians(90.0),
                          math.radians(-26.0 * (frame - 1)), 0.0))

    if block is not None:
        # A5's four barrels index one quarter turn across the cycle, so the
        # barrel that just fired is never the one pointing at you twice.
        home = tuple(block.location)
        for frame in range(1, WORK_FRAMES + 1):
            key(block, frame, location=home,
                rotation=(math.radians(22.5 * (frame - 1)), 0.0, 0.0))

    if casing is not None:
        home = tuple(casing.location)
        key(casing, 1, location=home, rotation=(0.0, 0.0, 0.0))
        key(casing, 2, location=(home[0] + 0.02, home[1] - 0.13, home[2] + 0.10),
            rotation=(0.0, math.radians(38.0), math.radians(-20.0)))
        key(casing, 3, location=(home[0] + 0.05, home[1] - 0.26, home[2] + 0.15),
            rotation=(0.0, math.radians(96.0), math.radians(-48.0)))
        key(casing, 4, location=(home[0] + 0.07, home[1] - 0.36, home[2] - 0.02),
            rotation=(0.0, math.radians(148.0), math.radians(-74.0)))

    if rear is not None:
        home = tuple(rear.location)
        key(rear, 1, location=home, rotation=(0.0, 0.0, 0.0))
        key(rear, 2, location=(home[0] - 0.045, home[1] + 0.020, home[2] + 0.035),
            rotation=(0.0, math.radians(11.0), 0.0))
        key(rear, 3, location=(home[0] - 0.070, home[1] + 0.035, home[2] + 0.045),
            rotation=(0.0, math.radians(17.0), 0.0))
        key(rear, 4, location=(home[0] - 0.025, home[1] + 0.012, home[2] + 0.018),
            rotation=(0.0, math.radians(6.0), 0.0))

    if loader is not None:
        home = tuple(loader.location)
        key(loader, 1, location=home, rotation=(0.0, 0.0, 0.0))
        key(loader, 2, location=home, rotation=(0.0, 0.0, math.radians(-16.0)))
        key(loader, 3, location=home, rotation=(0.0, math.radians(-9.0),
                                                math.radians(-26.0)))
        key(loader, 4, location=home, rotation=(0.0, 0.0, math.radians(-8.0)))


# --- rendering ---------------------------------------------------------------

def render_layer(name, group, build_fn, frames=1, animate_fn=None):
    """One sheet, one layer. The scene is rebuilt from scratch each time so a
    layer cannot inherit stray objects from the one before it -- and so every
    layer IN A GROUP gets an identical camera, which is the only reason an
    accent lands on its body."""
    tile = TILE_BY_GROUP.get(group, TILE)
    direction_rows = DIRECTION_ROWS_BY_GROUP.get(group, DIRECTIONS)
    td.scene(ortho_scale=ORTHO[group], tile_w=tile, tile_h=tile)
    m = materials()
    root = td.root("rifleman")
    parts = build_fn(m, root)
    if animate_fn:
        animate_fn(parts)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = frames
    td.render_sheet(root, name, frames, directions=DIRECTIONS,
                    tile_w=tile, tile_h=tile, frame_start=1,
                    direction_rows=direction_rows)


GROUPS = ("base", "a3", "a4", "a5", "b3", "b4", "b5")

BODIES = {
    "base": build_boss,
    "a3": build_arsenal3,
    "a4": build_arsenal4,
    "a5": build_arsenal5,
    "b3": build_crew3,
    "b4": build_crew4,
    "b5": build_crew5,
}

# Which crosspath accent each body carries. Buying tier 3 on one branch caps
# the other at 2 forever (`locksPath` on A3/A4/A5 and B3/B4/B5 in
# js/soldier.js), so a path A body can only ever wear B1/B2 and the other way
# round -- and unlike the Sniper, the FINAL tiers wear them too. See the header.
CROSS = {
    "base": ("A", "B"),
    "a3": ("B",), "a4": ("B",), "a5": ("B",),
    "b3": ("A",), "b4": ("A",), "b5": ("A",),
}


def _requested_groups():
    """Optional resumable render selection: -- --groups=a3,a4,b5."""
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for arg in args:
        if arg.startswith("--groups="):
            chosen = {value.strip() for value in
                      arg.split("=", 1)[1].split(",") if value.strip()}
            unknown = chosen - set(GROUPS)
            if unknown:
                raise ValueError("unknown rifleman render group(s): %s" %
                                 ", ".join(sorted(unknown)))
            return chosen
    return set(GROUPS)


def accent_name(path, tier, group):
    """`rifleman_accent_a1` on the base body, `rifleman_accent_a1_b3` on
    another. Same shape the Sniper's sheets use."""
    stem = "rifleman_accent_%s%d" % (path.lower(), tier)
    return stem if group == "base" else "%s_%s" % (stem, group)


def main():
    if not os.path.isdir(td.OUTPUT_DIR):
        os.makedirs(td.OUTPUT_DIR)
    groups = _requested_groups()

    for group in GROUPS:
        if group not in groups:
            continue
        name = "rifleman_body" if group == "base" else "rifleman_body_" + group
        render_layer(name, group,
                     lambda m, r, g=group: BODIES[g](m, r),
                     frames=WORK_FRAMES, animate_fn=animate_work)
        for path in CROSS[group]:
            for tier in (1, 2):
                render_layer(accent_name(path, tier, group), group,
                             lambda m, r, g=group, p=path, t=tier:
                             build_accent(m, r, g, p, t))

    print("\nMUZZLE (world units, from the point the tower stands on):")
    for group in GROUPS:
        print("  %-5s [%.3f, %.3f, %.3f]" % ((group,) + muzzle_world(group)))
    print("ORTHO %r" % (ORTHO,))


def muzzle_world(group):
    """The muzzle in world units, THROUGH the weapon's pitch.

    The first version of this print summed the offsets and ignored the -5
    degrees the hip-held weapons are tilted at, which put the printed height
    0.08 below the real muzzle -- enough for the flash to sit visibly under
    the barrel. A weapon that is rotated has to have its muzzle rotated with
    it, and this is the authority both sides copy from."""
    gun_parent, gun_location, pitch = GUN_MOUNT[group]
    if gun_parent == "shoulder":
        fx, fy, fz = FIGURE_OFFSET[group]
        origin = (fx + gun_location[0], fy + gun_location[1],
                  fz + GUN_Z + gun_location[2])
    else:
        origin = gun_location

    mx, my, mz = MUZZLE_LOCAL[group]
    angle = math.radians(pitch)
    cos_p = math.cos(angle)
    sin_p = math.sin(angle)
    # Rotation about +Y: +X swings toward -Z for a positive angle.
    return (origin[0] + mx * cos_p + mz * sin_p,
            origin[1] + my,
            origin[2] - mx * sin_p + mz * cos_p)


# Guarded so make_preview.py can import the builders without kicking off a
# full sheet render.
if __name__ == "__main__":
    main()
