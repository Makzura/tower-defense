# ---------------------------------------------------------------------------
# The Rifleman's recruits -- summon `soldier-recruit-b4` and `-b5`, js/soldier.js.
#
#     blender --background --python tools/blender/summon_recruit.py
#     blender --background --python tools/blender/summon_recruit.py -- --tiers=b5
#
# WHO THEY ARE. The Rifleman's B4 button spawns two of these at the FAR END of
# the road and they march the wrong way up it, stopping to shoot whatever they
# meet. They are not his crew and they are not soldiers. They are whoever was
# still alive when he came through: people in the clothes they were wearing,
# holding a rifle somebody handed them an hour ago.
#
# THAT IS THE WHOLE BRIEF AND IT IS A LOAD-BEARING ONE. A recruit is 20 hp and
# 1 damage, it lives about a minute, and the tier above it is 40 hp and 3
# damage. If either one reads as "elite infantry" the player expects it to hold
# a lane, and it cannot. So:
#
#   B4  a survivor. Thin, hunched, a coat two sizes too big over a jumper,
#       patched trousers, ONE boot and one rag-wrapped foot, a rag over the
#       mouth, a satchel and a bedroll. His carbine is wire-wrapped at the
#       wrist of the stock because it broke once already. He carries it low
#       and across, the way somebody holds a tool they are afraid of.
#   B5  the same person, four weeks later. A steel helmet a size too big, a
#       webbing belt with pouches, boots that match, a proper bolt rifle on a
#       sling, and the Rifleman's oxblood armband -- the one thing on either
#       model that says who sent him. He stands straighter. He is still thin,
#       still hunched, and still nowhere near threatening, which is the point:
#       B5 buys a bigger, harder squad, not a scary one.
#
# WHAT THEY MAY NOT HAVE. No gold, no fedora, no charcoal suit, no cigar. Those
# are the boss's, and the gap between him and them is the entire reason the
# ability reads as "he armed some civilians" rather than "he called in troops".
# They also carry none of the ley/sigil faction colours, for the same reason he
# does not.
#
# THE PIPELINE IS THE ENEMY ONE, NOT THE TOWER ONE. A recruit walks a path, so
# it gets 8 facings and a distance-driven walk cycle exactly like an enemy --
# `SoldierRecruit.progress` advances the cycle, so a planted foot stays on one
# patch of road instead of the whole unit sliding like a sticker. It also has a
# second state the enemies do not: `holding`, set the frame it acquires a
# target, because THEY STOP TO SHOOT. That gets its own braced sheet with a
# four-frame recoil, driven off the shot cooldown.
#
#     <tier>_walk.png   8 facings x 8 frames, marching
#     <tier>_hold.png   8 facings x 4 frames, planted and firing
#
# Built facing +X and spun by the root empty at render time. Never model a
# second direction -- that is what the rows are for.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import bpy
import td_scene as td

# The enemy tile, so the two share `sheetWidth`/`sheetHeight`'s 0.8 aspect and
# a recruit can never accidentally be authored at a different pixel density
# from the traffic it is walking into.
TILE_W = 128
TILE_H = 160
DIRECTIONS = 8
WALK_FRAMES = 8
HOLD_FRAMES = 4

# Measured with `make_preview.py --frame-recruits`, not chosen. `ortho_scale`
# spans the LONGER tile axis, so the horizontal field is only 0.8 of it -- and
# with a rifle held across the body the horizontal is what binds here, unlike
# the tower where ground props and the bottom gutter decide it.
#
# The HOLD state sets both of these, not the walk: bringing the rifle up and
# level reaches much further along +X than carrying it muzzle-down does, and a
# tier's two sheets must share a camera or the unit jumps size the instant it
# stops to shoot.
#
# A touch above what --frame-recruits asks for (1.84 and 2.41). Its solve is
# exact on vertex positions, but the bevel and the 2x supersample resolve each
# widen the silhouette by about a pixel, and at 128 across a pixel is 0.8% of
# the field -- so the two dead-side-on facings, where a level rifle reaches
# furthest, still touched the gutter at the exact figure.
ORTHO = {"b4": 1.95, "b5": 2.55}

# Shoulder height. Deliberately 0.16 under the Rifleman's 1.30: he is a
# well-fed man in a tailored suit and they are not, and the size difference has
# to survive the downsample.
SHOULDER_Z = 1.14
HIP_Z = 0.72


def materials():
    return {
        "coat": td.material("coat", "wool", roughness=0.95),
        "coat_dark": td.material("coat_dark", "suit_dark", roughness=0.96),
        "canvas": td.material("canvas", "canvas", roughness=0.94),
        "rust": td.material("rust", "rust", roughness=0.90),
        "leather": td.material("leather", "leather", roughness=0.80),
        "skin": td.material("skin", "skin", roughness=0.70),
        "hair": td.material("hair", "hair", roughness=0.82),
        "steel": td.material("steel", "tin", roughness=0.60, metallic=0.25),
        "steel_dark": td.material("steel_dark", "tin_dark", roughness=0.68,
                                  metallic=0.20),
        "gun": td.material("gun", "gun_blue", roughness=0.40, metallic=0.45),
        "gun_dark": td.material("gun_dark", "gun_dark", roughness=0.50,
                                metallic=0.35),
        "walnut": td.material("walnut", "walnut", roughness=0.66),
        # The armband, and nothing else on either model, is the Rifleman's
        # oxblood. One patch of his colour on a sleeve is the whole visual
        # link between the tower and the people it sent.
        "band": td.material("band", "tie", roughness=0.80),
    }


# --- the rig -----------------------------------------------------------------

def _rig(parent):
    """Empties the walk and the firing pose both drive.

    `body` carries everything above the hips, so a bob moves the torso without
    dragging the feet. The legs hang off their own hip empties INSIDE body, and
    the bob is kept small enough (0.018) that a planted sole never visibly
    leaves the road at this size.
    """
    body = td.root("body")
    body.parent = parent
    body.location = (0.0, 0.0, 0.0)

    # THE HIPS HANG OFF THE ROOT, NOT OFF `body`. Parenting them inside the
    # bobbing torso dropped both soles 0.025 below the road at the bottom of
    # every stride -- a unit sinking into the tarmac twice per step, which no
    # still of frame 1 can show. With them outside it the legs never move
    # vertically at all and the 0.012 of daylight this leaves at the waist is
    # invisible at 30 px.
    legs = {}
    for side, y in (("l", 0.088), ("r", -0.088)):
        hip = td.root("hip_" + side)
        hip.parent = parent
        hip.location = (0.0, y, HIP_Z)
        legs[side] = hip

    arms = {}
    for side, y in (("l", 0.185), ("r", -0.185)):
        arm = td.root("arm_" + side)
        arm.parent = body
        arm.location = (0.0, y, SHOULDER_Z - 0.02)
        arms[side] = arm

    head = td.root("head")
    head.parent = body
    head.location = (0.02, 0.0, SHOULDER_Z + 0.16)

    gun = td.root("gun")
    gun.parent = body
    gun.location = (0.16, -0.10, 0.96)
    gun.rotation_euler = (0.0, math.radians(6.0), math.radians(-14.0))

    return {"root": parent, "body": body, "legs": legs, "arms": arms,
            "head": head, "gun": gun}


def _leg(m, hip, tier, side):
    """Thigh, shin and whatever is on the foot.

    B4 HAS ONE BOOT AND ONE RAG. It is two boxes' difference and it is the
    single most efficient thing on the model: a mismatched pair reads as
    "found what he could" from further away than any amount of patching does.
    """
    trouser = m["canvas"] if tier == "b4" else m["coat_dark"]
    td.tube("thigh", 0.072, (0.0, 0.0, 0.0), (0.015, 0.0, -0.320), trouser,
            hip, verts=8)
    td.ellipsoid("knee", (0.125, 0.125, 0.125), (0.015, 0.0, -0.320),
                 trouser, hip)
    td.tube("shin", 0.064, (0.015, 0.0, -0.320), (0.035, 0.0, -0.630),
            trouser, hip, verts=8)

    if tier == "b4":
        td.box("patch", (0.075, 0.115, 0.090), location=(0.055, 0.0, -0.230),
               mat=m["rust"], parent=hip)
        if side == "l":
            td.box("boot", (0.190, 0.115, 0.075),
                   location=(0.055, 0.0, -0.672), mat=m["leather"], parent=hip)
            td.box("sole", (0.205, 0.125, 0.024),
                   location=(0.060, 0.0, -0.706), mat=m["coat_dark"],
                   parent=hip)
        else:
            # Rag-bound. Three bands and no sole.
            for i, z in enumerate((-0.640, -0.675, -0.705)):
                td.box("wrap_%d" % i, (0.165 + i * 0.012, 0.110 + i * 0.008,
                                       0.032), location=(0.045, 0.0, z),
                       mat=m["canvas"], parent=hip)
    else:
        td.box("boot", (0.195, 0.118, 0.085), location=(0.058, 0.0, -0.668),
               mat=m["leather"], parent=hip)
        td.box("sole", (0.210, 0.128, 0.026), location=(0.062, 0.0, -0.706),
               mat=m["coat_dark"], parent=hip)
        td.box("gaiter", (0.130, 0.135, 0.075), location=(0.040, 0.0, -0.588),
               mat=m["canvas"], parent=hip)


def _arm(m, arm, tier, side):
    trouser = m["coat"] if tier == "b4" else m["coat_dark"]
    td.tube("upper", 0.058, (0.0, 0.0, 0.0), (0.030, 0.0, -0.230), trouser,
            arm, verts=8)
    td.ellipsoid("elbow", (0.105, 0.105, 0.105), (0.030, 0.0, -0.230),
                 trouser, arm)
    td.tube("fore", 0.050, (0.030, 0.0, -0.230), (0.105, 0.0, -0.430),
            trouser, arm, verts=8)
    td.ellipsoid("hand", (0.098, 0.086, 0.092), (0.115, 0.0, -0.455),
                 m["skin"], arm)
    # THE ARMBAND, on the left sleeve only, and only at B5.
    if tier == "b5" and side == "l":
        td.cyl("armband", 0.070, 0.070, location=(0.018, 0.0, -0.140),
               rotation=(0.0, math.radians(8.0), 0.0), mat=m["band"],
               parent=arm, verts=10)


def _torso(m, body, tier):
    """A coat that does not fit over a body that has not eaten.

    The chest is NARROW -- 0.30 against the Rifleman's 0.38 -- and the coat is
    wider than the chest inside it, which is what reads as borrowed rather than
    issued.
    """
    td.box("chest", (0.230, 0.300, 0.360), location=(0.0, 0.0, 0.945),
           rotation=(0.0, math.radians(-7.0), 0.0), mat=m["coat"],
           parent=body)
    td.box("hips", (0.215, 0.290, 0.150), location=(0.0, 0.0, 0.760),
           mat=m["coat_dark"], parent=body)

    if tier == "b4":
        # The coat, open, hanging off him. Its hem is uneven on purpose.
        for y, drop in ((0.175, 0.0), (-0.175, 0.035)):
            td.box("coat_front_%s" % y, (0.105, 0.115, 0.430 - drop),
                   location=(0.075, y, 0.845 - drop * 0.5),
                   rotation=(0.0, math.radians(-9.0), 0.0),
                   mat=m["coat_dark"], parent=body)
        td.box("coat_back", (0.130, 0.360, 0.470), location=(-0.095, 0.0, 0.855),
               mat=m["coat_dark"], parent=body)
        for i, y in enumerate((0.115, -0.020, -0.150)):
            td.box("hem_%d" % i, (0.115, 0.110, 0.075 + i * 0.020),
                   location=(-0.075, y, 0.605 + i * 0.015),
                   mat=m["coat_dark"], parent=body)
        td.box("collar", (0.150, 0.290, 0.090), location=(-0.010, 0.0, 1.135),
               mat=m["coat_dark"], parent=body)
    else:
        # Issued: a fastened coat, a webbing belt, three pouches, a bandolier.
        td.box("coat_shell", (0.265, 0.335, 0.430), location=(-0.005, 0.0, 0.930),
               rotation=(0.0, math.radians(-6.0), 0.0), mat=m["coat_dark"],
               parent=body)
        td.box("belt", (0.275, 0.320, 0.060), location=(0.0, 0.0, 0.775),
               mat=m["leather"], parent=body)
        for y in (0.115, 0.0, -0.115):
            td.box("pouch_%s" % y, (0.085, 0.090, 0.105),
                   location=(0.115, y, 0.735), mat=m["canvas"], parent=body)
        td.tube("bandolier", 0.028, (0.115, 0.135, 1.100),
                (0.055, -0.150, 0.800), m["leather"], body, verts=6)
        for i in range(4):
            t = 0.22 + i * 0.18
            td.cyl("round_%d" % i, 0.020, 0.055,
                   location=(0.115 - 0.060 * t, 0.135 - 0.285 * t,
                             1.100 - 0.300 * t),
                   rotation=(math.radians(90.0), 0.0, math.radians(-64.0)),
                   mat=m["gun_dark"], parent=body, verts=6)
        td.box("collar", (0.155, 0.300, 0.095), location=(-0.010, 0.0, 1.140),
               mat=m["coat_dark"], parent=body)


def _kit(m, body, tier):
    """What he is carrying, which is what says he has been walking a while."""
    if tier == "b4":
        # Bedroll across the back and a satchel on a strap.
        td.cyl("bedroll", 0.075, 0.380, location=(-0.150, 0.0, 1.045),
               rotation=(math.radians(90.0), 0.0, 0.0), mat=m["canvas"],
               parent=body, verts=10)
        td.tube("strap", 0.024, (0.090, 0.150, 1.105), (0.020, -0.165, 0.830),
                m["leather"], body, verts=6)
        td.box("satchel", (0.115, 0.165, 0.175), location=(-0.020, -0.215, 0.790),
               rotation=(0.0, math.radians(-6.0), 0.0), mat=m["canvas"],
               parent=body)
        td.box("satchel_flap", (0.125, 0.170, 0.055),
               location=(-0.018, -0.215, 0.868), mat=m["rust"], parent=body)
        # A tin cup on the belt. Two pixels, and it is the difference between
        # a soldier's kit and a person's.
        td.cyl("cup", 0.052, 0.080, location=(-0.075, 0.180, 0.755),
               mat=m["steel"], parent=body, verts=10)
    else:
        td.cyl("canteen", 0.062, 0.115, location=(-0.090, -0.180, 0.760),
               mat=m["steel_dark"], parent=body, verts=10)
        td.box("pack", (0.145, 0.250, 0.230), location=(-0.165, 0.0, 0.990),
               mat=m["canvas"], parent=body)
        td.tube("pack_strap", 0.022, (-0.060, 0.140, 1.115),
                (-0.060, -0.140, 1.115), m["leather"], body, verts=6)


def _head(m, head, tier):
    td.cyl("neck", 0.058, 0.100, location=(-0.010, 0.0, -0.115), mat=m["skin"],
           parent=head, verts=8)
    td.ellipsoid("skull", (0.175, 0.160, 0.195), (0.0, 0.0, 0.0), m["skin"],
                 head)
    # Gaunt: the jaw is narrow and set back, and there is a hollow under the
    # brow. At 30 px it is two boxes and it still reads as underfed.
    td.box("jaw", (0.135, 0.130, 0.062), location=(0.020, 0.0, -0.098),
           mat=m["skin"], parent=head)
    td.box("brow", (0.080, 0.155, 0.032), location=(0.075, 0.0, 0.022),
           rotation=(0.0, math.radians(9.0), 0.0), mat=m["coat_dark"],
           parent=head)
    td.box("hair", (0.105, 0.160, 0.100), location=(-0.085, 0.0, 0.010),
           mat=m["hair"], parent=head)

    if tier == "b4":
        # A rag over the mouth and a flat cap. Neither is protection; both are
        # what you put on when the air is bad and it is cold.
        td.box("mask", (0.105, 0.150, 0.090), location=(0.070, 0.0, -0.085),
               rotation=(0.0, math.radians(6.0), 0.0), mat=m["canvas"],
               parent=head)
        td.box("mask_knot", (0.055, 0.055, 0.050), location=(-0.075, -0.095,
                                                             -0.060),
               mat=m["canvas"], parent=head)
        # A SMALL flat cap. The first pass was 0.145 across and read as a
        # mushroom -- at this size a hat wider than the shoulders is the only
        # thing anyone sees.
        td.cyl("cap", 0.118, 0.042, location=(-0.022, 0.0, 0.104),
               mat=m["coat"], parent=head, verts=12)
        td.ellipsoid("cap_dome", (0.185, 0.170, 0.095), (-0.022, 0.0, 0.098),
                     m["coat"], head)
        td.box("cap_peak", (0.090, 0.130, 0.022), location=(0.098, 0.0, 0.080),
               rotation=(0.0, math.radians(9.0), 0.0), mat=m["coat"],
               parent=head)
    else:
        # A steel helmet one size too big, with the strap hanging.
        td.frustum("helmet", 0.185, 0.148, 0.115, (-0.008, 0.0, 0.115),
                   m["steel"], head, verts=14)
        td.cyl("helmet_brim", 0.198, 0.030, location=(-0.008, 0.0, 0.062),
               mat=m["steel"], parent=head, verts=14)
        td.box("chin_strap", (0.030, 0.170, 0.030), location=(0.030, 0.0,
                                                              -0.078),
               mat=m["leather"], parent=head)
        td.box("mask", (0.090, 0.130, 0.070), location=(0.070, 0.0, -0.090),
               rotation=(0.0, math.radians(6.0), 0.0), mat=m["canvas"],
               parent=head)


def _weapon(m, gun, tier):
    """B4's is broken and mended. B5's is not.

    The wire wrap at the wrist of B4's stock is the tier's one story beat: the
    rifle he was handed has already failed once, and somebody fixed it with
    what was to hand rather than replacing it.
    """
    if tier == "b4":
        # SHORT. A scrawny man carrying a full-length rifle reads as a man
        # carrying a pole; the whole weapon is 0.74 end to end.
        td.box("stock", (0.205, 0.070, 0.100), location=(-0.195, 0.0, -0.020),
               mat=m["walnut"], parent=gun)
        td.box("butt", (0.035, 0.085, 0.120), location=(-0.312, 0.0, -0.018),
               mat=m["gun_dark"], parent=gun)
        # The mend.
        for i, x in enumerate((-0.115, -0.093, -0.071)):
            td.cyl("wire_%d" % i, 0.048, 0.014, location=(x, 0.0, -0.012),
                   rotation=(0.0, math.radians(90.0), 0.0), mat=m["rust"],
                   parent=gun, verts=8)
        td.box("receiver", (0.170, 0.078, 0.092), location=(0.010, 0.0, 0.0),
               mat=m["gun"], parent=gun)
        td.box("fore", (0.155, 0.066, 0.062), location=(0.165, 0.0, -0.012),
               mat=m["walnut"], parent=gun)
        td.cyl("barrel", 0.026, 0.185, location=(0.335, 0.0, 0.008),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun"],
               parent=gun, verts=8)
        td.box("grip", (0.062, 0.060, 0.105), location=(-0.070, 0.0, -0.088),
               rotation=(0.0, math.radians(14.0), 0.0), mat=m["walnut"],
               parent=gun)
    else:
        td.box("stock", (0.290, 0.075, 0.110), location=(-0.250, 0.0, -0.022),
               mat=m["walnut"], parent=gun)
        td.box("butt", (0.036, 0.092, 0.132), location=(-0.404, 0.0, -0.020),
               mat=m["gun_dark"], parent=gun)
        td.box("comb", (0.140, 0.062, 0.036), location=(-0.200, 0.0, 0.046),
               mat=m["walnut"], parent=gun)
        td.box("receiver", (0.225, 0.084, 0.100), location=(0.020, 0.0, 0.0),
               mat=m["gun"], parent=gun)
        td.box("magazine", (0.070, 0.062, 0.085), location=(0.020, 0.0, -0.082),
               mat=m["gun_dark"], parent=gun)
        td.cyl("bolt", 0.018, 0.075, location=(0.070, -0.058, 0.028),
               rotation=(math.radians(90.0), 0.0, 0.0), mat=m["gun_dark"],
               parent=gun, verts=8)
        td.box("fore", (0.230, 0.070, 0.066), location=(0.235, 0.0, -0.014),
               mat=m["walnut"], parent=gun)
        td.cyl("band", 0.048, 0.024, location=(0.330, 0.0, -0.014),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun_dark"],
               parent=gun, verts=8)
        td.cyl("barrel", 0.028, 0.300, location=(0.500, 0.0, 0.008),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["gun"],
               parent=gun, verts=8)
        td.box("sight", (0.024, 0.024, 0.040), location=(0.620, 0.0, 0.046),
               mat=m["gun_dark"], parent=gun)
        td.box("grip", (0.066, 0.064, 0.112), location=(-0.082, 0.0, -0.092),
               rotation=(0.0, math.radians(14.0), 0.0), mat=m["walnut"],
               parent=gun)
        # A sling. B4 has nothing to hang his on.
        td.tube("sling", 0.014, (-0.330, 0.0, -0.070), (0.300, 0.0, -0.056),
                m["leather"], gun, verts=6)


def build(m, parent, tier):
    parts = _rig(parent)
    _torso(m, parts["body"], tier)
    _kit(m, parts["body"], tier)
    _head(m, parts["head"], tier)
    _weapon(m, parts["gun"], tier)
    for side in ("l", "r"):
        _leg(m, parts["legs"][side], tier, side)
        _arm(m, parts["arms"][side], tier, side)
    parts["tier"] = tier
    return parts


# --- animation ---------------------------------------------------------------

def key(obj, frame, rotation=None, location=None):
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert("rotation_euler", frame=frame)
    if location is not None:
        obj.location = location
        obj.keyframe_insert("location", frame=frame)


def animate_walk(parts, frames=WALK_FRAMES):
    """A tired march, not a parade step.

    Driven in the game by DISTANCE (`SoldierRecruit.progress`), so one full
    cycle is one stride and a planted foot stays on one patch of road. The
    swing is deliberately shallow and the bob is deliberately a downbeat: a
    24-degree stride with the body dropping on each footfall reads as trudging,
    where a 40-degree one reads as marching and a rise reads as jogging.
    """
    swing = math.radians(24.0)
    arm_swing = math.radians(20.0)
    body = parts["body"]
    gun = parts["gun"]

    for frame in range(1, frames + 1):
        phase = math.tau * (frame - 1) / frames
        step = math.sin(phase)
        # Two footfalls per cycle, so the bob runs at double frequency.
        bob = -abs(math.cos(phase)) * 0.018

        key(body, frame, location=(0.0, 0.0, bob),
            rotation=(0.0, math.radians(4.0 + 1.5 * abs(step)), 0.0))
        key(parts["legs"]["l"], frame,
            rotation=(0.0, swing * step, 0.0))
        key(parts["legs"]["r"], frame,
            rotation=(0.0, -swing * step, 0.0))
        # HE CARRIES IT, HE DOES NOT PORT IT. The rifle hangs muzzle-down in
        # the right hand and that hand barely swings, because it has weight in
        # it; the empty left arm does the swinging. The first pass left the
        # weapon level at chest height through the whole march and it read as a
        # pole floating beside him.
        key(gun, frame, location=(0.155, -0.150, 0.735),
            rotation=(0.0, math.radians(36.0), math.radians(-6.0)))
        key(parts["arms"]["l"], frame,
            rotation=(0.0, math.radians(6.0) - arm_swing * step, 0.0))
        key(parts["arms"]["r"], frame,
            rotation=(0.0, math.radians(10.0) + arm_swing * step * 0.18, 0.0))


def animate_hold(parts, frames=HOLD_FRAMES):
    """Planted and firing.

    THEY STOP TO SHOOT -- `SoldierRecruit.holding` -- so this is a real second
    state rather than frame 0 of the walk. Feet apart and still, weight back,
    and the recoil is carried by the SHOULDERS and the weapon rather than by
    the whole figure, because a body that jumps at every shot reads as comic at
    this size.
    """
    body = parts["body"]
    gun = parts["gun"]
    # Up at the shoulder and level. This is the ONLY time either of them
    # actually points the thing at anything.
    gun_home = (0.175, -0.105, 0.985)
    gun_rot = (0.0, math.radians(2.0), math.radians(-10.0))

    # 0 aimed and held; 1 the shot; 2 riding it out; 3 coming back down.
    poses = ((0.0, 0.0, 0.0), (0.055, -0.030, 6.5), (0.032, -0.018, 3.8),
             (0.010, -0.006, 1.2))
    for frame in range(1, frames + 1):
        back, drop, lift_deg = poses[(frame - 1) % len(poses)]
        key(body, frame, location=(-back * 0.35, 0.0, 0.0),
            rotation=(0.0, math.radians(7.0 - lift_deg * 0.25), 0.0))
        key(gun, frame,
            location=(gun_home[0] - back, gun_home[1], gun_home[2] + drop),
            rotation=(gun_rot[0], gun_rot[1] - math.radians(lift_deg),
                      gun_rot[2]))
        # Braced: front foot forward, back foot planted, neither moving.
        key(parts["legs"]["l"], frame, rotation=(0.0, math.radians(15.0), 0.0))
        key(parts["legs"]["r"], frame, rotation=(0.0, math.radians(-13.0), 0.0))
        # Both hands on it, the support arm further forward than the trigger
        # arm. Neither is straight -- a straight arm reads as a mannequin.
        key(parts["arms"]["l"], frame,
            rotation=(0.0, math.radians(72.0 - lift_deg * 0.7), 0.0))
        key(parts["arms"]["r"], frame,
            rotation=(0.0, math.radians(48.0 - lift_deg * 0.4), 0.0))


# --- rendering ---------------------------------------------------------------

TIERS = ("b4", "b5")

STATES = (("walk", WALK_FRAMES, animate_walk),
          ("hold", HOLD_FRAMES, animate_hold))


def render_layer(tier, state, frames, animate_fn):
    td.scene(ortho_scale=ORTHO[tier], tile_w=TILE_W, tile_h=TILE_H)
    m = materials()
    root = td.root("recruit")
    parts = build(m, root, tier)
    animate_fn(parts, frames)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = frames
    td.render_sheet(root, "recruit_%s_%s" % (tier, state), frames,
                    directions=DIRECTIONS, tile_w=TILE_W, tile_h=TILE_H,
                    frame_start=1)


def _requested_tiers():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for arg in args:
        if arg.startswith("--tiers="):
            chosen = {value.strip() for value in
                      arg.split("=", 1)[1].split(",") if value.strip()}
            unknown = chosen - set(TIERS)
            if unknown:
                raise ValueError("unknown recruit tier(s): %s" %
                                 ", ".join(sorted(unknown)))
            return chosen
    return set(TIERS)


def muzzle_ul(tier):
    """Where the round leaves the rifle IN THE FIRING POSE, in u.l.

    The firing pose, not the carry pose, because that is the only state a
    recruit ever shoots in -- `SoldierRecruit.holding`. Returned as
    (forward, height) from the point the unit stands on, converted from Blender
    world units at 30.58 u.l. per unit (the shared sprite scale: the Sniper's
    20 u.l. footprint times draw-pack's PX_PER_WORLD of 1.529).

    This print is the authority for `SoldierRecruit.MUZZLE_*_UL` and the
    bullets' `liftUl` in js/soldier.js.
    """
    # animate_hold's gun_home, and the far face of each weapon's last piece.
    gun_x, gun_z = 0.175, 0.985
    barrel_end = 0.4275 if tier == "b4" else 0.6500
    yaw = math.radians(-10.0)
    forward = gun_x + barrel_end * math.cos(yaw)
    return forward * 30.58, gun_z * 30.58


def stride_per_height():
    """How far one complete walk cycle carries the model, as a fraction of the
    drawn sprite height -- the number `draw-pack.js` needs to advance the cycle
    by distance instead of by a clock.

    DERIVED from the pose, not measured by eye: the hip is at HIP_Z, the leg
    reaches the ground, and each leg swings +/- 24 degrees, so one stride is
    twice the horizontal reach of a leg at full swing. Divided by the tile's
    world height, because the game scales the sheet by height.
    """
    leg = HIP_Z
    stride = 2.0 * leg * math.sin(math.radians(24.0))
    return stride / ORTHO["b4"], stride / ORTHO["b5"]


def main():
    if not os.path.isdir(td.OUTPUT_DIR):
        os.makedirs(td.OUTPUT_DIR)
    tiers = _requested_tiers()
    for tier in TIERS:
        if tier not in tiers:
            continue
        for state, frames, animate_fn in STATES:
            render_layer(tier, state, frames, animate_fn)

    b4, b5 = stride_per_height()
    print("\nSTRIDE per drawn height:  b4 %.4f   b5 %.4f" % (b4, b5))
    for tier in TIERS:
        forward, height = muzzle_ul(tier)
        print("MUZZLE %s  forward %.1f u.l.   height %.1f u.l."
              % (tier, forward, height))
    print("ORTHO %r" % (ORTHO,))


if __name__ == "__main__":
    main()
