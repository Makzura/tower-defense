# ---------------------------------------------------------------------------
# The Arcane Sniper -- tower `longshot`, config TowerConfigs.longRangeDPS.
#
#     blender --background --python tools/blender/tower_sniper.py
#
# THE POSE. He is a marksman, so he is built as one: braced stance, rifle
# shouldered, both hands on it, eye behind the scope. Everything about the
# weapon hangs off the `shoulder` empty, so the hold cannot drift -- an earlier
# pass placed the rifle in world space near a figure who was not gripping it
# and it read as a man being skewered by a stick.
#
# WHAT EACH TIER COSTS HIM. Path A is the graft: he bolts the enemy's own
# hardware onto his body to keep up, and the model is the receipt.
#
#   A0-A2   a man with a rifle. Tiers 1 and 2 are COLOUR ONLY -- see below.
#   A3      first real graft. The forward arm is gone: twin rails run from the
#           shoulder socket into the handguard with an arc between them, and a
#           three-stage coil stack is bolted up his spine with fins over the
#           shoulder. A clamp holds his skull still, because the rig decides
#           how he stands now.
#   A4      the legs are gone. What is left of him is socketed into a gimbal
#           yoke and the weapon is no longer a rifle but a rail cannon lying
#           flat on the mount, with a flared emitter mouth. His head and upper
#           torso are still up there at the breech, which is the point.
#
# TIERS 1 AND 2 ARE COLOUR, NOT GEOMETRY. The A0-A2 body renders ONCE and
# those tiers are thin emissive ACCENT layers composited over it. A3 and A4 do
# change the model, so they get their own body sheets with their teal baked in.
#
# SHEET GROUPS AND WHY THE CAMERA MOVES. A body and the accents drawn over it
# MUST share a camera or they will not line up -- but different tiers need
# very different framing. The A0-A2 rifle already ran to the edge of the old
# tile and clipped; a rail cannon would not have fitted at all. So each GROUP
# gets its own ortho_scale, and js/skins/draw-pack.js draws each group at a
# size proportional to that scale so a man is the same size on screen at A3 as
# he was at A2. Everything in a group shares framing; nothing across groups
# has to.
#
# THE FOUR CROSSPATHS. `crosspath.lockThreshold` is 3, so buying A3 caps B at
# 2 forever -- the only crosspaths reachable here are A3B1, A3B2, A4B1 and
# A4B2. Path B's accent lives in the groove under the barrel, and that groove
# is somewhere completely different on a rail cannon than on a rifle, so each
# body gets its OWN B accents rather than sharing one sheet.
#
# WHERE THE SHOT COMES FROM. Each group prints its muzzle position. Those go
# into `projectile.muzzleOffsetUlByGraft` in the tower config -- the
# simulation needs them and simulation never reads back from the presentation
# registry, so the number is written down on both sides and this print is the
# authority.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import bpy
import td_scene as td

TILE = 256

# Final-tier silhouettes are much larger on screen. At the game's maximum 3x
# backing scale, a 256px A5/B5 tile was itself being enlarged and the most
# intricate models turned soft even though the canvas was native-resolution.
# Give only those one-piece final bodies enough source pixels to stay native.
# Their 48 facings are paged into three 16-row bands so no PNG approaches a
# conservative browser's single-image height limit.
TILE_BY_GROUP = {"a5": 512, "b5": 384}
DIRECTION_ROWS_BY_GROUP = {"a5": 16, "b5": 16}

# HE TURNS TO FACE WHAT HE IS SHOOTING. `LongshotTower.update` already writes
# `this.aim`, so the facing is free -- it just needs sprites to point with. 48
# rather than 8 because a tower tracks a moving target continuously and the
# steps show as a stutter a walking enemy on a fixed route never reveals.
# CAN THE TURN BE MADE SMOOTH? Not continuously -- not with pre-rendered
# sprites. That is the one real cost of this pipeline: a sprite is a picture
# taken from a fixed angle, so the facing is always quantised, and the only
# lever is how fine the quantisation is. Worst-case error is 180/N degrees:
#
#     16 -> 11.25    24 -> 7.5    48 -> 3.75    64 -> 2.8
#
# 3.75 degrees is under what the eye picks out as a step on a turning turret,
# so 48 is where it stops reading as snapping and starts reading as turning.
# 64 costs a third more memory for a difference nobody can point at.
#
# The alternative -- keeping 24 and rotating the sprite by the leftover angle
# in canvas -- was rejected: rotating a three-quarter view in screen space
# tilts the man's vertical axis, so he leans. It would be fine for A4 and A5,
# which are near-horizontal machines, and wrong for everything below them, and
# a rule that applies to half the tiers is worse than a bigger sheet.
DIRECTIONS = 48
FRAMES = 1

# Per-group framing. The number is the world height the tile spans; bigger
# means the subject is drawn smaller, so a longer weapon needs a bigger one.
# draw-pack.js multiplies its sprite size by the same value.
ORTHO = {"base": 2.90, "a3": 3.30, "a4": 4.20, "a5": 5.20,
         "b3": 3.10, "b4": 3.70, "b5": 4.10}

GUN_Z = 1.30
GUN_Y = -0.06


def materials():
    return {
        "iron": td.material("iron", "tin_dark", roughness=0.55, metallic=0.22),
        "iron2": td.material("iron2", "tin", roughness=0.5, metallic=0.2),
        "brass": td.material("brass", "brass", roughness=0.32, metallic=0.45),
        "coat": td.material("coat", "coat", roughness=0.88, metallic=0.0),
        "coat2": td.material("coat2", "stone", roughness=0.85, metallic=0.0),
        "skin": td.material("skin", "skin", roughness=0.68, metallic=0.0),
        "ley": td.material("ley", "ley", emission=5.0, roughness=0.2),
        "ley_dim": td.material("ley_dim", "ley", emission=2.0, roughness=0.3),
        "sigil": td.material("sigil", "sigil", emission=5.0, roughness=0.2),
        "sigil_dim": td.material("sigil_dim", "sigil", emission=2.0,
                                 roughness=0.3),
        # Path B's materials. Nothing here is bolted on -- it is cloth, bone,
        # stone and hair, which is the whole difference from the graft.
        "cloth": td.material("cloth", "coat_v", roughness=0.94, metallic=0.0),
        "bone": td.material("bone", "bone", roughness=0.62, metallic=0.0),
        "stone": td.material("stone", "stone", roughness=0.9, metallic=0.0),
        # A second value for masonry edges. Alternating the broad faces of a
        # faceted column is not decoration: it is the cue that makes its
        # volume survive the turn from one pre-rendered facing to the next.
        "stone_edge": td.material("stone_edge", "tin_dark", roughness=0.82,
                                   metallic=0.06),
        "hair": td.material("hair", "hair", roughness=0.8, metallic=0.0),
        # Burnt through. Near-black and rough, so it reads as absence rather
        # than as another dark material.
        "char": td.material("char", "char", roughness=0.96, metallic=0.0)
    }


# THESE FOUR MOVED INTO td_scene ON 2026-08-07 and are aliased here rather
# than reimplemented. They were authored privately in this file because it was
# the only model that needed them; the Rifleman needed all four on its first
# day, and two copies of a solid-builder is exactly the kind of second
# representation this project keeps deleting. Every call site below is
# unchanged, and `make_preview.py --validate-snipers` is what proves it.
#
# `_solid_frustum` is td.frustum: a capped tapered column with optional
# alternating face values, used for B5's anchors instead of square cards.
_solid_frustum = td.frustum
_ellipsoid = td.ellipsoid
_torus = td.torus


def _world_fixed_child(name, aim_parent):
    """Create a centred child whose yaw cancels its aiming parent's yaw.

    Sprite directions are produced by rotating the model root. That is right
    for a marksman and his weapon, but wrong for a shrine bolted to the map:
    parenting B5's anchors straight to the aim root made the whole foundation
    orbit once per 48-facing turn. A counter-yaw driver keeps the child's
    world transform fixed while everything else under `aim_parent` still
    tracks the target. The child stays centred, so no translation correction
    or camera-specific trick is involved.
    """
    fixed = td.root(name)
    fixed.parent = aim_parent
    fixed.matrix_parent_inverse.identity()
    fixed.location = (0.0, 0.0, 0.0)
    curve = fixed.driver_add("rotation_euler", 2)
    driver = curve.driver
    driver.type = "SCRIPTED"
    yaw = driver.variables.new()
    yaw.name = "aim_yaw"
    yaw.type = "SINGLE_PROP"
    yaw.targets[0].id = aim_parent
    yaw.targets[0].data_path = "rotation_euler[2]"
    driver.expression = "-aim_yaw"
    return fixed


# Limbs and anchor chains. Now td.tube -- see the aliasing note above.
_cyl_between = td.tube


# --- shared body parts ------------------------------------------------------

def _stance(m, parent):
    """Legs, coat and torso. Braced, not at attention: weight on the back
    foot, front leg forward. Returns the `shoulder` empty everything above the
    waist hangs from."""
    # Jointed legs have a knee and a changing highlight when the model turns.
    # The old two rectangular sticks hid the braced pose from half the angles.
    _cyl_between("thigh_back", 0.084, (-0.08, -0.10, 0.72),
                 (-0.16, -0.11, 0.40), m["coat"], parent, verts=10)
    _cyl_between("shin_back", 0.077, (-0.16, -0.11, 0.40),
                 (-0.23, -0.11, 0.12), m["coat2"], parent, verts=10)
    td.box("knee_back", (0.16, 0.15, 0.11),
           location=(-0.16, -0.11, 0.40),
           rotation=(0.0, math.radians(-10.0), 0.0), mat=m["iron"],
           parent=parent)
    td.box("boot_back", (0.27, 0.18, 0.10), location=(-0.24, -0.11, 0.05),
           mat=m["iron"], parent=parent)
    td.box("boot_back_sole", (0.30, 0.20, 0.035),
           location=(-0.25, -0.11, 0.018), mat=m["iron2"], parent=parent)
    _cyl_between("thigh_front", 0.084, (0.02, 0.10, 0.72),
                 (0.14, 0.11, 0.40), m["coat"], parent, verts=10)
    _cyl_between("shin_front", 0.077, (0.14, 0.11, 0.40),
                 (0.21, 0.11, 0.12), m["coat2"], parent, verts=10)
    td.box("knee_front", (0.16, 0.15, 0.11),
           location=(0.14, 0.11, 0.40),
           rotation=(0.0, math.radians(8.0), 0.0), mat=m["iron"],
           parent=parent)
    td.box("boot_front", (0.27, 0.18, 0.10), location=(0.21, 0.11, 0.05),
           mat=m["iron"], parent=parent)
    td.box("boot_front_sole", (0.30, 0.20, 0.035),
           location=(0.22, 0.11, 0.018), mat=m["iron2"], parent=parent)

    td.box("coat_skirt", (0.40, 0.40, 0.44), location=(-0.02, 0.0, 0.66),
           rotation=(0.0, math.radians(-5.0), 0.0), mat=m["coat"],
           parent=parent)
    # Split tails establish front/back and stop the coat reading as a cube.
    for y in (0.13, -0.13):
        td.box("coat_tail_%s" % y, (0.28, 0.13, 0.35),
               location=(-0.08, y, 0.54),
               rotation=(math.radians(4.0 if y > 0 else -4.0),
                         math.radians(-7.0), 0.0),
               mat=m["coat2"], parent=parent)
    td.box("belt", (0.36, 0.37, 0.07), location=(0.0, 0.0, 0.88),
           mat=m["iron"], parent=parent)
    td.box("torso", (0.34, 0.36, 0.40), location=(0.0, 0.0, 1.08),
           rotation=(0.0, math.radians(-7.0), 0.0), mat=m["coat"],
           parent=parent)
    td.box("chest_plate", (0.22, 0.30, 0.20),
           location=(0.13, 0.0, 1.10),
           rotation=(0.0, math.radians(-7.0), 0.0), mat=m["coat2"],
           parent=parent)
    for y in (0.12, -0.12):
        td.box("lapel_%s" % y, (0.16, 0.07, 0.24),
               location=(0.14, y, 1.16),
               rotation=(math.radians(0.0), math.radians(-18.0),
                         math.radians(10.0 if y > 0 else -10.0)),
               mat=m["iron"], parent=parent)

    shoulder = td.root("shoulder")
    shoulder.parent = parent
    shoulder.location = (0.0, 0.0, GUN_Z)
    td.box("shoulders", (0.28, 0.48, 0.17), location=(0.0, 0.0, 0.0),
           mat=m["coat2"], parent=shoulder)
    return shoulder


def _head(m, shoulder, clamped=False, z=0.20):
    """Set BACK along -X and tucked down so his eye sits behind the scope's
    rear lens. `clamped` bolts the rig's head brace on -- from A3 the coil
    stack decides how he holds his head, and the brace is how you see that."""
    head = td.root("head")
    head.parent = shoulder
    head.location = (-0.13, -0.03, z)
    head.rotation_euler = (0.0, math.radians(7.0), 0.0)
    td.cyl("neck", 0.075, 0.11, location=(-0.03, 0.0, -0.13),
           mat=m["skin"], parent=head, verts=10)
    _ellipsoid("skull", (0.21, 0.19, 0.23), (0.0, 0.0, 0.0),
               m["skin"], head)
    td.box("jaw", (0.17, 0.17, 0.07), location=(0.03, 0.0, -0.12),
           mat=m["skin"], parent=head)
    td.box("brow", (0.10, 0.19, 0.035), location=(0.085, 0.0, 0.025),
           rotation=(0.0, math.radians(8.0), 0.0), mat=m["coat2"],
           parent=head)

    if clamped:
        # No hat any more: the brace goes where it was.
        td.box("clamp_band", (0.23, 0.23, 0.06), location=(0.0, 0.0, 0.07),
               mat=m["iron"], parent=head)
        td.box("clamp_post", (0.05, 0.05, 0.20), location=(-0.11, 0.0, 0.14),
               mat=m["iron"], parent=head)
        td.ball("clamp_optic", 0.045, location=(0.10, -0.08, 0.01),
                mat=m["ley"], parent=head)
    else:
        td.cyl("hat_brim", 0.21, 0.028, location=(0.0, 0.0, 0.13),
               mat=m["coat"], parent=head, verts=14)
        td.cyl("hat_crown", 0.115, 0.13, location=(-0.01, 0.0, 0.20),
               mat=m["coat"], parent=head, verts=14)
        td.box("hat_band", (0.16, 0.18, 0.045),
               location=(-0.005, 0.0, 0.16), mat=m["brass"], parent=head)
    return head


# --- A0-A2: a man with a rifle ---------------------------------------------

def build_caster(m, parent):
    """The plain caster. NO PLINTH: Tower.draw already puts a raised platform
    under every tower via Visuals3Q.platform."""
    shoulder = _stance(m, parent)
    _head(m, shoulder)

    rifle = td.root("rifle")
    rifle.parent = shoulder
    rifle.location = (0.0, GUN_Y, 0.0)
    rifle.rotation_euler = (0.0, math.radians(-1.5), 0.0)

    td.box("stock", (0.34, 0.10, 0.15), location=(-0.44, 0.0, -0.03),
           mat=m["coat2"], parent=rifle)
    td.box("butt_plate", (0.055, 0.14, 0.19),
           location=(-0.625, 0.0, -0.025), mat=m["brass"], parent=rifle)
    td.box("cheek_rest", (0.20, 0.08, 0.05), location=(-0.34, 0.0, 0.07),
           mat=m["coat"], parent=rifle)
    td.box("receiver", (0.46, 0.11, 0.13), location=(-0.04, 0.0, 0.0),
           mat=m["iron"], parent=rifle)
    for y in (0.067, -0.067):
        td.box("receiver_plate_%s" % y, (0.30, 0.025, 0.095),
               location=(-0.04, y, 0.0), mat=m["iron2"], parent=rifle)
    td.box("magazine", (0.10, 0.08, 0.16), location=(-0.02, 0.0, -0.13),
           rotation=(0.0, math.radians(-8.0), 0.0), mat=m["iron"],
           parent=rifle)
    td.box("grip", (0.09, 0.08, 0.18), location=(-0.20, 0.0, -0.13),
           rotation=(0.0, math.radians(18.0), 0.0), mat=m["coat2"],
           parent=rifle)
    td.box("handguard", (0.40, 0.10, 0.10), location=(0.38, 0.0, -0.005),
           mat=m["iron2"], parent=rifle)
    for x in (0.24, 0.38, 0.52):
        td.cyl("handguard_band_%s" % x, 0.073, 0.035,
               location=(x, 0.0, -0.005),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["brass"],
               parent=rifle, verts=10)
    td.cyl("barrel", 0.032, 0.52, location=(0.86, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["iron"],
           parent=rifle)
    td.cyl("barrel_shroud", 0.052, 0.20, location=(0.66, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["iron2"],
           parent=rifle, verts=10)

    # The bolt. Its own empty so the reload can slide and turn it without
    # touching the receiver it rides in -- see animate_reload.
    bolt = td.root("bolt")
    bolt.parent = rifle
    bolt.location = (-0.10, -0.09, 0.02)
    td.box("bolt_body", (0.22, 0.06, 0.06), location=(0.0, 0.0, 0.0),
           mat=m["iron2"], parent=bolt)
    td.cyl("bolt_handle", 0.022, 0.13, location=(0.07, -0.06, 0.0),
           rotation=(math.radians(90.0), 0.0, 0.0), mat=m["iron2"],
           parent=bolt)
    td.ball("bolt_knob", 0.038, location=(0.07, -0.13, 0.0), mat=m["iron"],
            parent=bolt)
    td.cyl("muzzle_brake", 0.048, 0.11, location=(1.15, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["brass"],
           parent=rifle)
    _torus("muzzle_ring", 0.050, 0.011, (1.194, 0.0, 0.0),
           (0.0, math.radians(90.0), 0.0), m["iron2"], rifle,
           major_segments=12, minor_segments=5)
    td.cyl("scope", 0.056, 0.36, location=(0.03, 0.0, 0.13),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["iron"],
           parent=rifle)
    td.cyl("scope_front", 0.076, 0.07, location=(0.235, 0.0, 0.13),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["iron2"],
           parent=rifle, verts=12)
    td.ball("scope_glass", 0.052, location=(0.275, 0.0, 0.13),
            mat=m["ley_dim"], parent=rifle)
    for x in (-0.08, 0.14):
        td.box("scope_mount", (0.05, 0.05, 0.08), location=(x, 0.0, 0.07),
               mat=m["iron"], parent=rifle)
    for y in (0.10, -0.10):
        td.cyl("bipod_leg", 0.018, 0.42, location=(0.52, y, -0.22),
               rotation=(math.radians(-14.0 if y > 0 else 14.0),
                         math.radians(24.0), 0.0), mat=m["iron"],
               parent=rifle)

    # Both hands on the weapon -- this is what makes it a hold. The rear one
    # gets its own empty because the reload takes it off the grip and back
    # onto the bolt.
    rear = td.root("rear_arm")
    rear.parent = shoulder
    rear.location = (-0.16, -0.19, -0.10)
    _cyl_between("rear_upper", 0.064, (0.01, 0.01, 0.10),
                 (0.03, 0.04, -0.03), m["coat"], rear, verts=10)
    td.ball("rear_elbow", 0.070, location=(0.03, 0.04, -0.03),
            mat=m["coat2"], parent=rear)
    _cyl_between("rear_forearm", 0.058, (0.03, 0.04, -0.03),
                 (-0.06, 0.07, -0.12), m["coat"], rear, verts=10)
    _ellipsoid("hand_rear", (0.11, 0.09, 0.11),
               (-0.06, 0.07, -0.12), m["skin"], rear)

    _cyl_between("arm_fwd_upper", 0.064, (0.02, 0.22, -0.02),
                 (0.20, 0.17, -0.10), m["coat"], shoulder, verts=10)
    td.ball("elbow_fwd", 0.070, location=(0.20, 0.17, -0.10),
            mat=m["coat2"], parent=shoulder)
    _cyl_between("arm_fwd_fore", 0.058, (0.20, 0.17, -0.10),
                 (0.40, 0.05, -0.10), m["coat"], shoulder, verts=10)
    _ellipsoid("hand_fwd", (0.115, 0.10, 0.11),
               (0.40, 0.05, -0.10), m["skin"], shoulder)
    return {"shoulder": shoulder, "rifle": rifle, "bolt": bolt, "rear": rear}


# --- A3: the arm and the spine ----------------------------------------------

def build_graft3(m, parent):
    """First real graft. The forward arm is gone -- twin rails run from the
    shoulder socket into the handguard -- and a three-stage coil stack is
    bolted up his spine. Teal is baked in: from here the graft IS the model,
    so there is no separate A accent sheet."""
    shoulder = _stance(m, parent)
    _head(m, shoulder, clamped=True)

    # Coat cut away behind to clear the rig.
    for i, z in enumerate((-0.32, -0.12, 0.08)):
        td.cyl("coil_%d" % i, 0.135, 0.15, location=(-0.30, 0.0, z),
               rotation=(math.radians(90.0), 0.0, 0.0), mat=m["iron"],
               parent=shoulder)
        td.cyl("coil_glow_%d" % i, 0.090, 0.17, location=(-0.30, 0.0, z),
               rotation=(math.radians(90.0), 0.0, 0.0), mat=m["ley_dim"],
               parent=shoulder)
    # Cooling fins over the shoulder.
    for i, y in enumerate((0.24, -0.24)):
        td.box("fin_%d" % i, (0.28, 0.055, 0.20),
               location=(-0.30, y * 1.15, 0.12),
               mat=m["iron2"], parent=shoulder)
    td.box("spine_spar", (0.12, 0.18, 0.70),
           location=(-0.30, 0.0, -0.12),
           mat=m["iron"], parent=shoulder)
    td.box("spine_cap", (0.22, 0.24, 0.10),
           location=(-0.30, 0.0, 0.27), mat=m["iron2"], parent=shoulder)

    rifle = td.root("rifle")
    rifle.parent = shoulder
    rifle.location = (0.0, GUN_Y, 0.0)
    rifle.rotation_euler = (0.0, math.radians(-1.5), 0.0)

    td.box("stock", (0.34, 0.10, 0.15), location=(-0.44, 0.0, -0.03),
           mat=m["coat2"], parent=rifle)
    td.box("receiver", (0.50, 0.12, 0.15), location=(-0.02, 0.0, 0.0),
           mat=m["iron"], parent=rifle)
    td.box("grip", (0.09, 0.08, 0.18), location=(-0.20, 0.0, -0.13),
           rotation=(0.0, math.radians(18.0), 0.0), mat=m["coat2"],
           parent=rifle)
    td.box("handguard", (0.44, 0.11, 0.11), location=(0.42, 0.0, -0.005),
           mat=m["iron2"], parent=rifle)

    # Three coil stages down the barrel, and the barrel itself is longer.
    for i, x in enumerate((0.74, 1.00, 1.26)):
        td.cyl("stage_%d" % i, 0.12, 0.085, location=(x, 0.0, 0.0),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["brass"],
               parent=rifle)
        td.cyl("stage_core_%d" % i, 0.075, 0.10, location=(x, 0.0, 0.0),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["ley_dim"],
               parent=rifle)
    td.cyl("barrel", 0.030, 0.92, location=(1.02, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["iron"],
           parent=rifle)
    td.cyl("muzzle_brake", 0.050, 0.12, location=(1.50, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["brass"],
           parent=rifle)
    td.cyl("scope", 0.056, 0.38, location=(0.05, 0.0, 0.14),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["iron"],
           parent=rifle)
    td.ball("scope_lens", 0.05, location=(0.25, 0.0, 0.14), mat=m["ley"],
            parent=rifle)
    td.box("top_rail", (0.55, 0.035, 0.022), location=(0.36, 0.0, 0.085),
           mat=m["ley"], parent=rifle)

    # THE ARM IS THE RAIL. Twin bars from the socket where his shoulder was,
    # into the handguard, with a live arc between them.
    td.ball("socket", 0.11, location=(0.0, 0.21, -0.04), mat=m["iron"],
            parent=shoulder)
    td.ball("socket_glow", 0.07, location=(0.02, 0.21, -0.04), mat=m["ley"],
            parent=shoulder)
    # The bars visibly bridge the shoulder socket to the handguard instead
    # of floating beside it. Their slight fan is broad enough to survive a
    # 50 px render without adding any fine mechanical clutter.
    for i, z in enumerate((-0.015, -0.095)):
        start = (0.03, 0.21, z - 0.01)
        end = (0.49, -0.01, z)
        dx, dy = end[0] - start[0], end[1] - start[1]
        td.box("rail_%d" % i,
               (math.sqrt(dx * dx + dy * dy), 0.055, 0.055),
               location=((start[0] + end[0]) * 0.5,
                         (start[1] + end[1]) * 0.5, z),
               rotation=(0.0, 0.0, math.atan2(dy, dx)),
               mat=m["iron2"], parent=shoulder)
    td.box("rail_arc", (0.47, 0.032, 0.032),
           location=(0.28, 0.09, -0.055),
           rotation=(0.0, 0.0, math.radians(-25.5)),
           mat=m["ley"], parent=shoulder)
    td.box("rail_cuff", (0.13, 0.15, 0.15),
           location=(0.49, -0.01, -0.055), mat=m["iron"], parent=shoulder)

    # Rear hand is still his own. It is the last one he has.
    _cyl_between("arm_rear_upper", 0.064, (-0.03, -0.22, 0.04),
                 (-0.14, -0.21, -0.08), m["coat"], shoulder, verts=10)
    td.ball("elbow_rear", 0.070, location=(-0.14, -0.21, -0.08),
            mat=m["iron"], parent=shoulder)
    _cyl_between("arm_rear_fore", 0.056, (-0.14, -0.21, -0.08),
                 (-0.22, -0.12, -0.22), m["coat"], shoulder, verts=10)
    _ellipsoid("hand_rear", (0.11, 0.09, 0.11),
               (-0.22, -0.12, -0.22), m["skin"], shoulder)
    return {"shoulder": shoulder}


# --- A4: socketed into the mount --------------------------------------------

def build_graft4(m, parent):
    """The legs are gone. What is left of him is socketed into a gimbal yoke
    and the weapon is a rail cannon lying flat on the mount. His head and
    upper torso are still up there at the breech -- that is the tier, not the
    gun."""
    # Mount: a squat base and a gimbal ring it swings in.
    td.cyl("mount_base", 0.46, 0.20, location=(0.0, 0.0, 0.10),
           mat=m["iron"], parent=parent, verts=10)
    td.cyl("mount_ring", 0.40, 0.10, location=(0.0, 0.0, 0.26),
           mat=m["iron2"], parent=parent, verts=12)
    td.cyl("mount_glow", 0.30, 0.035, location=(0.0, 0.0, 0.32),
           mat=m["ley_dim"], parent=parent, verts=12)
    for y in (0.34, -0.34):
        td.box("yoke_arm", (0.16, 0.12, 0.52), location=(-0.10, y, 0.49),
               mat=m["iron"], parent=parent)
    # One real axle ties the yoke to the carriage. The old two upright bars
    # stopped just below the cannon and read as unrelated fence posts.
    td.cyl("gimbal_axle", 0.11, 0.76, location=(-0.10, 0.0, 0.72),
           rotation=(math.radians(90.0), 0.0, 0.0), mat=m["iron2"],
           parent=parent, verts=12)
    for y in (0.40, -0.40):
        td.cyl("trunnion_%s" % y, 0.17, 0.08,
               location=(-0.10, y, 0.72),
               rotation=(math.radians(90.0), 0.0, 0.0), mat=m["brass"],
               parent=parent, verts=12)

    carriage = td.root("carriage")
    carriage.parent = parent
    carriage.location = (0.0, 0.0, 0.72)

    # What is left of him, socketed in at the breech end.
    td.box("torso_stub", (0.32, 0.34, 0.34), location=(-0.30, 0.0, 0.10),
           rotation=(0.0, math.radians(-12.0), 0.0), mat=m["coat"],
           parent=carriage)
    td.box("socket_collar", (0.36, 0.38, 0.09), location=(-0.30, 0.0, -0.08),
           mat=m["iron"], parent=carriage)
    td.box("shoulders", (0.26, 0.42, 0.15), location=(-0.28, 0.0, 0.29),
           mat=m["coat2"], parent=carriage)

    head = td.root("head")
    head.parent = carriage
    head.location = (-0.36, -0.02, 0.47)
    head.rotation_euler = (0.0, math.radians(9.0), 0.0)
    _ellipsoid("skull", (0.20, 0.19, 0.22), (0.0, 0.0, 0.0),
               m["skin"], head)
    td.box("clamp_band", (0.22, 0.22, 0.06), location=(0.0, 0.0, 0.07),
           mat=m["iron"], parent=head)
    td.ball("clamp_optic", 0.045, location=(0.10, -0.07, 0.0), mat=m["ley"],
            parent=head)
    # Feed lines from the rig into the back of his skull.
    for y in (0.07, -0.07):
        td.cyl("feed", 0.018, 0.34, location=(-0.20, y, 0.30),
               rotation=(0.0, math.radians(38.0), 0.0), mat=m["iron"],
               parent=carriage)

    # The cannon. Twin rails with an arc down the middle and a flared mouth.
    td.box("breech", (0.44, 0.30, 0.28), location=(0.05, 0.0, 0.02),
           mat=m["iron"], parent=carriage)
    for i, x in enumerate((0.42, 0.78, 1.14)):
        td.cyl("stage_%d" % i, 0.16, 0.10, location=(x, 0.0, 0.02),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["brass"],
               parent=carriage)
    for y in (0.085, -0.085):
        td.box("rail_%s" % y, (1.40, 0.065, 0.09),
               location=(0.86, y, 0.02), mat=m["iron2"], parent=carriage)
    td.box("arc", (1.34, 0.04, 0.04), location=(0.86, 0.0, 0.02),
           mat=m["ley"], parent=carriage)
    # Flared emitter mouth.
    td.cyl("mouth", 0.21, 0.16, location=(1.62, 0.0, 0.02),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["iron"],
           parent=carriage, verts=12)
    td.cyl("mouth_glow", 0.14, 0.05, location=(1.70, 0.0, 0.02),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["ley"],
           parent=carriage, verts=12)
    for y in (0.19, -0.19):
        td.box("emitter_fork_%s" % y, (0.26, 0.06, 0.07),
               location=(1.58, y, 0.02), mat=m["iron2"], parent=carriage)
    td.box("top_rail", (1.20, 0.04, 0.025), location=(0.80, 0.0, 0.10),
           mat=m["ley"], parent=carriage)
    return {"carriage": carriage}


# --- B3 and B4: the rapture --------------------------------------------------
#
# Path B is the other way of paying. He keeps his body and spends what is in
# it, so unlike the graft NOTHING here is bolted on -- it is all cloth, bone,
# chain and things burning that should not be. Violet is baked into these
# bodies the way teal is baked into A3-A5.
#
# `crosspath.lockThreshold` is 3, so buying B3 caps A at 2 forever: the only
# crosspaths these two reach are A1B3, A2B3, A1B4 and A2B4. The A accent
# lights the scope and the top rail, and both sit differently on these
# weapons, so each body carries its own -- same rule as the A3/A4 bodies.

def _rifle_rapture(m, shoulder, tier):
    """The weapon at B3/B4. A four-chamber cylinder of rune slugs replaces the
    magazine -- that is `mechanics.reload`, four shots then a pause, made
    visible -- and at B4 the barrel is carved bone split by molten fissures."""
    rifle = td.root("rifle")
    rifle.parent = shoulder
    rifle.location = (0.0, GUN_Y, 0.0)
    rifle.rotation_euler = (0.0, math.radians(-1.5), 0.0)

    barrel_mat = m["bone"] if tier >= 4 else m["iron"]

    td.box("stock", (0.34, 0.10, 0.15), location=(-0.44, 0.0, -0.03),
           mat=m["coat2"], parent=rifle)
    td.box("receiver", (0.42, 0.11, 0.13), location=(-0.06, 0.0, 0.0),
           mat=m["iron"], parent=rifle)
    td.box("grip", (0.09, 0.08, 0.18), location=(-0.22, 0.0, -0.13),
           rotation=(0.0, math.radians(18.0), 0.0), mat=m["coat2"],
           parent=rifle)

    # The cylinder. Four slugs around it, one of them dark -- the one just
    # spent. Which chamber is lit is drawn procedurally in draw-pack, off the
    # live shot counter; this is the housing it turns in.
    cylinder = td.root("cylinder")
    cylinder.parent = rifle
    cylinder.location = (0.20, 0.0, -0.02)
    td.cyl("cyl_body", 0.17, 0.16, location=(0.0, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["iron2"],
           parent=cylinder, verts=12)
    for i in range(4):
        ang = math.radians(45.0 + i * 90.0)
        td.cyl("slug_%d" % i, 0.043, 0.18,
               location=(0.0, math.cos(ang) * 0.105,
                         math.sin(ang) * 0.105),
               rotation=(0.0, math.radians(90.0), 0.0),
               mat=m["sigil"] if i else m["iron"], parent=cylinder, verts=8)

    td.box("handguard", (0.38, 0.11, 0.11), location=(0.50, 0.0, -0.005),
           mat=m["iron2"], parent=rifle)
    td.cyl("barrel", 0.042, 0.50, location=(0.92, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=barrel_mat,
           parent=rifle)
    if tier >= 4:
        # Molten fissures down the bone. They widen with the execute bonus in
        # play, which draw-pack does procedurally; these are the seams.
        for i, x in enumerate((0.74, 0.92, 1.10)):
            td.box("fissure_%d" % i, (0.15, 0.035, 0.032),
                   location=(x, 0.0, 0.045), mat=m["sigil"], parent=rifle)
    td.cyl("muzzle", 0.05, 0.10, location=(1.20, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["brass"],
           parent=rifle)
    td.cyl("scope", 0.060, 0.34, location=(0.02, 0.0, 0.13),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["iron"],
           parent=rifle)
    if tier >= 5:
        # Rapture's weapon ends in a ritual crown, not another longer barrel.
        # Four solid rails and three toroidal bindings form a cage around the
        # barrel. Unlike the previous pair of thin side strips this has a top,
        # underside and depth from every facing, without moving the muzzle.
        td.box("ritual_breech", (0.34, 0.24, 0.21),
               location=(0.36, 0.0, 0.0), mat=m["char"], parent=rifle)
        for i, x in enumerate((0.63, 0.84, 1.05)):
            _torus("barrel_binding_%d" % i, 0.116, 0.022,
                   (x, 0.0, 0.0), (0.0, math.radians(90.0), 0.0),
                   m["brass"] if i == 1 else m["bone"], rifle,
                   major_segments=12, minor_segments=6)
        for axis, sign in (("y", -1.0), ("y", 1.0),
                           ("z", -1.0), ("z", 1.0)):
            location = ((0.88, sign * 0.10, 0.0) if axis == "y" else
                        (0.88, 0.0, sign * 0.10))
            td.box("bone_fork_%s_%s" % (axis, sign),
                   (0.58, 0.055, 0.055), location=location,
                   mat=m["bone"], parent=rifle)
        td.cyl("muzzle_crown", 0.105, 0.07, location=(1.17, 0.0, 0.0),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["bone"],
               parent=rifle, verts=10)
        td.cyl("muzzle_glare", 0.065, 0.035, location=(1.205, 0.0, 0.0),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["sigil"],
               parent=rifle, verts=10)
        for i in range(4):
            angle = math.radians(45.0 + i * 90.0)
            td.box("muzzle_tooth_%d" % i, (0.12, 0.035, 0.035),
                   location=(1.155, math.cos(angle) * 0.135,
                             math.sin(angle) * 0.135),
                   rotation=(angle, 0.0, 0.0), mat=m["bone"], parent=rifle)
    return rifle, cylinder


def build_rapture3(m, parent):
    """B3 -- Communion. The hat is gone and the hair is loose, a mantle hangs
    over the coat, a bone censer smokes on a chain at his belt, and he loads
    the cylinder out of his own opened hand. He has started giving the weapon
    something it was not designed to take.

    Built on a `figure` empty rather than straight onto the root so the body
    remains an explicit animation boundary. The reload is now an upper-body
    offering: his boots stay planted while head, hand and cylinder move."""
    figure = td.root("figure")
    figure.parent = parent
    shoulder = _stance(m, figure)

    head = td.root("head")
    head.parent = shoulder
    head.location = (-0.13, -0.03, 0.20)
    head.rotation_euler = (0.0, math.radians(7.0), 0.0)
    _ellipsoid("skull", (0.21, 0.19, 0.23), (0.0, 0.0, 0.0),
               m["skin"], head)
    td.box("jaw", (0.17, 0.17, 0.07), location=(0.03, 0.0, -0.12),
           mat=m["skin"], parent=head)
    # Loose hair instead of the hat. Two slabs read as hair at this size and
    # the silhouette change alone says he has stopped keeping himself.
    td.box("hair", (0.25, 0.24, 0.14), location=(-0.03, 0.0, 0.09),
           mat=m["hair"], parent=head)
    td.box("hair_back", (0.12, 0.22, 0.28),
           location=(-0.14, 0.0, -0.07),
           mat=m["hair"], parent=head)
    td.ball("eye", 0.028, location=(0.10, -0.06, 0.0), mat=m["sigil"],
            parent=head)

    # Mantle over the shoulders, hanging to the thigh.
    td.box("mantle", (0.34, 0.56, 0.22), location=(-0.04, 0.0, -0.02),
           mat=m["cloth"], parent=shoulder)
    td.box("mantle_fall", (0.28, 0.50, 0.46),
           location=(-0.10, 0.0, -0.36),
           rotation=(0.0, math.radians(-6.0), 0.0), mat=m["cloth"],
           parent=shoulder)
    td.ball("mantle_clasp", 0.065, location=(-0.02, -0.27, -0.04),
            mat=m["bone"], parent=shoulder)

    rifle, cylinder = _rifle_rapture(m, shoulder, 3)

    # Censer on a chain. It smokes, it swings, and it is the only thing on him
    # that is not either cloth or weapon.
    td.cyl("chain", 0.018, 0.30, location=(-0.30, -0.30, -0.46),
           mat=m["brass"], parent=shoulder)
    td.cyl("censer", 0.10, 0.14, location=(-0.30, -0.30, -0.66),
           mat=m["bone"], parent=shoulder, verts=10)
    td.ball("censer_glow", 0.06, location=(-0.30, -0.30, -0.66),
            mat=m["sigil"], parent=shoulder)

    _cyl_between("arm_rear_upper", 0.064, (-0.03, -0.22, 0.04),
                 (-0.14, -0.21, -0.08), m["cloth"], shoulder, verts=10)
    td.ball("elbow_rear", 0.070, location=(-0.14, -0.21, -0.08),
            mat=m["bone"], parent=shoulder)
    _cyl_between("arm_rear_fore", 0.056, (-0.14, -0.21, -0.08),
                 (-0.22, -0.12, -0.22), m["cloth"], shoulder, verts=10)
    _ellipsoid("hand_rear", (0.11, 0.09, 0.11),
               (-0.22, -0.12, -0.22), m["skin"], shoulder)

    # The forward arm gets its own empty: the reload swings it off the
    # handguard and holds the opened hand over the cylinder.
    fwd = td.root("fwd_arm")
    fwd.parent = shoulder
    fwd.location = (0.24, 0.16, -0.09)
    _cyl_between("arm_fwd_upper", 0.064, (-0.20, 0.06, 0.10),
                 (0.0, 0.0, 0.0), m["cloth"], fwd, verts=10)
    td.ball("elbow_fwd", 0.070, location=(0.0, 0.0, 0.0),
            mat=m["bone"], parent=fwd)
    _cyl_between("arm_fwd_fore", 0.056, (0.0, 0.0, 0.0),
                 (0.20, -0.11, -0.01), m["cloth"], fwd, verts=10)
    # The hand is cut open. It is how the cylinder gets loaded.
    _ellipsoid("hand_fwd", (0.11, 0.10, 0.11),
               (0.20, -0.11, -0.01), m["skin"], fwd)
    td.box("wound", (0.08, 0.035, 0.09),
           location=(0.20, -0.17, -0.01),
           mat=m["sigil"], parent=fwd)
    return {"figure": figure, "shoulder": shoulder, "head": head,
            "fwd": fwd, "rifle": rifle, "cylinder": cylinder}


def build_rapture4(m, parent):
    """B4 -- Cathedral. The mantle has grown into a housing: an arch standing
    over him with a rune window in it, a bell on a bracket that rings on every
    shot, and a barrel of carved bone split by molten violet. He has stopped
    being a man with a rifle and become a fixture that a rifle is part of."""
    figure = td.root("figure")
    figure.parent = parent
    shoulder = _stance(m, figure)

    head = td.root("head")
    head.parent = shoulder
    head.location = (-0.13, -0.03, 0.20)
    head.rotation_euler = (0.0, math.radians(7.0), 0.0)
    _ellipsoid("skull", (0.21, 0.19, 0.23), (0.0, 0.0, 0.0),
               m["skin"], head)
    td.box("hood", (0.26, 0.25, 0.20), location=(-0.04, 0.0, 0.06),
           mat=m["cloth"], parent=head)
    td.box("hood_fall", (0.12, 0.24, 0.26), location=(-0.15, 0.0, -0.08),
           mat=m["cloth"], parent=head)
    td.ball("eye", 0.032, location=(0.10, -0.06, -0.01), mat=m["sigil"],
            parent=head)

    # Architecture is aimed with the tower, but never inherits the organic
    # reload pose. It shares the shoulder's authored origin while living
    # directly under the aim root, so post feet and bell remain stationary
    # across all four reload frames.
    cathedral = td.root("cathedral")
    cathedral.parent = parent
    # The 0.049 correction lands the splayed octagonal feet on z=0; without
    # it their authored shoulder-space origin left a visible air gap.
    cathedral.location = (0.0, 0.0, GUN_Z - 0.049)

    # The arch. Each post is now a tapered hexagonal column with its own foot,
    # capital and inset rib. A tall rectangular bar was a poor depth cue and
    # suffered the same card-like turn as the old B5 anchors.
    for y in (0.44, -0.44):
        post = td.root("post_%s" % y)
        post.parent = cathedral
        post.location = (-0.34, y, -0.58)
        post.rotation_euler = (math.radians(5.0 if y > 0 else -5.0),
                               0.0, 0.0)
        td.cyl("post_foot_%s" % y, 0.155, 0.12,
               location=(0.0, 0.0, -0.60), mat=m["stone_edge"],
               parent=post, verts=8)
        _solid_frustum("post_shaft_%s" % y, 0.110, 0.085, 1.06,
                       (0.0, 0.0, -0.02), m["stone"], post, verts=6,
                       alternate_mat=m["stone_edge"])
        td.cyl("post_cap_%s" % y, 0.135, 0.11,
               location=(0.0, 0.0, 0.55), mat=m["bone"], parent=post,
               verts=8)
        # The inboard rib is a real projecting bar, not a texture stripe.
        td.box("post_rib_%s" % y, (0.055, 0.045, 0.78),
               location=(0.075, -0.055 if y > 0 else 0.055, -0.05),
               mat=m["brass"], parent=post)
    for y in (0.24, -0.24):
        td.box("arch_crown_%s" % y, (0.17, 0.58, 0.15),
               location=(-0.34, y, 0.24),
               rotation=(math.radians(-30.0 if y > 0 else 30.0), 0.0, 0.0),
               mat=m["stone"], parent=cathedral)
    td.box("keystone", (0.22, 0.18, 0.18), location=(-0.34, 0.0, 0.40),
           mat=m["stone"], parent=cathedral)
    td.ball("keystone_rune", 0.07, location=(-0.23, 0.0, 0.40),
            mat=m["sigil"], parent=cathedral)
    # The rune window is deliberately broad enough to remain a violet mark
    # at game scale, but stays inside the arch rather than widening it.
    td.box("window", (0.08, 0.38, 0.11), location=(-0.27, 0.0, 0.13),
           mat=m["sigil"], parent=cathedral)
    for y in (0.24, -0.24):
        td.box("window_tick_%s" % y, (0.07, 0.06, 0.08),
               location=(-0.27, y, 0.13), mat=m["sigil"],
               parent=cathedral)

    # The bell, hung off the left post.
    td.box("bell_bracket", (0.22, 0.07, 0.06),
           location=(-0.25, 0.45, -0.05),
           mat=m["brass"], parent=cathedral)
    td.cyl("bell", 0.15, 0.22, location=(-0.16, 0.45, -0.21), mat=m["brass"],
           parent=cathedral, verts=10)
    td.ball("bell_clapper", 0.05, location=(-0.16, 0.45, -0.34),
            mat=m["iron"], parent=cathedral)

    td.box("mantle", (0.36, 0.60, 0.24), location=(-0.04, 0.0, -0.02),
           mat=m["cloth"], parent=shoulder)
    td.box("mantle_fall", (0.31, 0.54, 0.56), location=(-0.10, 0.0, -0.41),
           rotation=(0.0, math.radians(-6.0), 0.0), mat=m["cloth"],
           parent=shoulder)

    rifle, cylinder = _rifle_rapture(m, shoulder, 4)

    _cyl_between("arm_rear_upper", 0.064, (-0.03, -0.22, 0.04),
                 (-0.14, -0.21, -0.08), m["cloth"], shoulder, verts=10)
    td.ball("elbow_rear", 0.070, location=(-0.14, -0.21, -0.08),
            mat=m["bone"], parent=shoulder)
    _cyl_between("arm_rear_fore", 0.056, (-0.14, -0.21, -0.08),
                 (-0.22, -0.12, -0.22), m["cloth"], shoulder, verts=10)
    _ellipsoid("hand_rear", (0.11, 0.09, 0.11),
               (-0.22, -0.12, -0.22), m["skin"], shoulder)

    fwd = td.root("fwd_arm")
    fwd.parent = shoulder
    fwd.location = (0.24, 0.16, -0.09)
    _cyl_between("arm_fwd_upper", 0.064, (-0.20, 0.06, 0.10),
                 (0.0, 0.0, 0.0), m["cloth"], fwd, verts=10)
    td.ball("elbow_fwd", 0.070, location=(0.0, 0.0, 0.0),
            mat=m["bone"], parent=fwd)
    _cyl_between("arm_fwd_fore", 0.056, (0.0, 0.0, 0.0),
                 (0.20, -0.11, -0.01), m["cloth"], fwd, verts=10)
    _ellipsoid("hand_fwd", (0.11, 0.10, 0.11),
               (0.20, -0.11, -0.01), m["skin"], fwd)
    td.box("wound", (0.08, 0.035, 0.09),
           location=(0.20, -0.17, -0.01),
           mat=m["sigil"], parent=fwd)
    return {"figure": figure, "shoulder": shoulder, "head": head,
            "fwd": fwd, "rifle": rifle, "cylinder": cylinder,
            "cathedral": cathedral}


def _build_rapture_anchor(m, parent, index, angle):
    """One B5 restraint: a closed, faceted obelisk with an inboard clevis.

    The previous anchor was a 0.16-wide square bar with a flat square cap. At
    game size it had only one or two visible pixels of side plane, so changing
    facing looked like rotating a pasted image. This hierarchy deliberately
    exposes several depths: an octagonal foot, tapered alternating faces, a
    collar, a caged core, a pointed crown, and a thick socket on the side that
    faces the prisoner. Every part is closed 3D geometry and casts its own AO.
    """
    radius = 0.66
    px, py = math.cos(angle) * radius, math.sin(angle) * radius
    anchor = td.root("anchor_%d" % index)
    anchor.parent = parent
    anchor.location = (px, py, 0.0)
    anchor.rotation_euler = (0.0, 0.0, angle)

    # Grounded stepped foot. Three distinct radii create visible parallax as
    # the sprite direction advances, rather than a single vertical silhouette.
    td.cyl("anchor_%d_foot" % index, 0.235, 0.075,
           location=(0.0, 0.0, 0.038), mat=m["stone_edge"],
           parent=anchor, verts=8)
    td.cyl("anchor_%d_plinth" % index, 0.190, 0.095,
           location=(0.0, 0.0, 0.105), mat=m["stone"],
           parent=anchor, verts=8)
    _solid_frustum("anchor_%d_lower" % index, 0.165, 0.135, 0.22,
                   (0.0, 0.0, 0.245), m["stone"], anchor,
                   alternate_mat=m["stone_edge"])
    _solid_frustum("anchor_%d_shaft" % index, 0.135, 0.105, 0.30,
                   (0.0, 0.0, 0.500), m["stone"], anchor,
                   alternate_mat=m["stone_edge"])

    # Brass corner rods are separate cylinders, not painted lines. Two are
    # enough to catch the light and expose which broad face is turning toward
    # the camera without cluttering a roughly 50-pixel gameplay silhouette.
    for side in (-1.0, 1.0):
        _cyl_between("anchor_%d_rib_%s" % (index, side), 0.018,
                     (0.0, side * 0.128, 0.18),
                     (0.0, side * 0.100, 0.64),
                     m["brass"], anchor, verts=8)

    _torus("anchor_%d_collar" % index, 0.125, 0.027,
           (0.0, 0.0, 0.655), (0.0, 0.0, 0.0), m["bone"], anchor,
           major_segments=12, minor_segments=6)

    # An emissive orb sits inside four solid cage struts. A sphere rather than
    # a front-facing rune remains readable from every one of the 48 facings.
    td.ball("anchor_%d_core" % index, 0.068,
            location=(0.0, 0.0, 0.735), mat=m["sigil"], parent=anchor)
    for side in range(4):
        cage_angle = math.radians(45.0 + side * 90.0)
        cx, cy = math.cos(cage_angle), math.sin(cage_angle)
        _cyl_between("anchor_%d_cage_%d" % (index, side), 0.016,
                     (cx * 0.105, cy * 0.105, 0.665),
                     (cx * 0.060, cy * 0.060, 0.815),
                     m["bone"], anchor, verts=8)
    _solid_frustum("anchor_%d_crown" % index, 0.095, 0.022, 0.18,
                   (0.0, 0.0, 0.855), m["stone_edge"], anchor,
                   alternate_mat=m["stone"])

    # The clevis projects from the inboard face. It is intentionally
    # asymmetric: seeing it migrate around the shaft is an unambiguous depth
    # cue during rotation. The chain begins at the centre of its real axle.
    td.box("anchor_%d_clevis" % index, (0.11, 0.18, 0.16),
           location=(-0.135, 0.0, 0.575), mat=m["iron"], parent=anchor)
    td.cyl("anchor_%d_axle" % index, 0.052, 0.22,
           location=(-0.205, 0.0, 0.575),
           rotation=(math.radians(90.0), 0.0, 0.0), mat=m["brass"],
           parent=anchor, verts=10)

    # Convert that local inboard axle centre back to the model root for the
    # two-segment tether built by the caller.
    return (px - math.cos(angle) * 0.205,
            py - math.sin(angle) * 0.205, 0.575)


def build_rapture5(m, parent):
    """B5 -- Rapture. The mirror of A5, and deliberately its opposite.

    A5 finished the job: the rig ate him and what is left is a machine. B5
    does NOT remove him -- it is all him, and that is the horror. His feet
    have left the ground, there are more arms than a man has, the face is
    gone inside its own glare, and one arm is already charred through from
    the last time he used the thing the tier buys.

    The four anchor pylons are not holding him UP. They are chains, and they
    are the only reason he is still on this square.

    NO CROSSPATH VARIANT, for the same reason A5 has none: at this tier the
    path that got here IS the model, and A is capped at 2 anyway."""
    # Only the floating figure and rifle aim. The four-map-square shrine is a
    # foundation, so it counter-rotates under the sheet's aiming root and
    # remains bolted to the same world-facing corners in every sprite row.
    foundation = _world_fixed_child("world_fixed_foundation", parent)

    figure = td.root("figure")
    figure.parent = parent
    figure.location = (0.0, 0.0, 0.30)      # off the ground

    # --- the anchors -------------------------------------------------------
    for i in range(4):
        ang = math.radians(45.0 + i * 90.0)
        start = _build_rapture_anchor(m, foundation, i, ang)
        # Two joined lengths give the tether one readable, controlled sag and
        # actually connect the clevis to the floating body's waist.
        bend = (math.cos(ang) * 0.39, math.sin(ang) * 0.39, 0.68)
        end = (math.cos(ang) * 0.20, math.sin(ang) * 0.20, 0.96)
        _cyl_between("chain_%d_a" % i, 0.034, start, bend,
                     m["brass"], foundation)
        _cyl_between("chain_%d_b" % i, 0.034, bend, end,
                     m["brass"], foundation)

    # --- what is left of the coat ------------------------------------------
    # Tattered: three separate falls rather than one skirt, so the silhouette
    # frays instead of ending in a hem.
    td.box("torso", (0.32, 0.34, 0.42), location=(0.0, 0.0, 0.72),
           rotation=(0.0, math.radians(-4.0), 0.0), mat=m["cloth"],
           parent=figure)
    tatter_lengths = (0.48, 0.36, 0.43)
    for i, y in enumerate((0.18, 0.0, -0.18)):
        td.box("tatter_%d" % i, (0.18 if i != 1 else 0.15, 0.12,
                                 tatter_lengths[i]),
               location=(-0.06 + i * 0.02, y, 0.34 - i * 0.035),
               rotation=(math.radians(-7.0 + i * 7.0),
                         math.radians(10.0 - i * 4.0), 0.0),
               mat=m["cloth"], parent=figure)

    shoulder = td.root("shoulder")
    shoulder.parent = figure
    shoulder.location = (0.0, 0.0, 0.98)
    td.box("shoulders", (0.30, 0.58, 0.19), location=(0.0, 0.0, 0.0),
           mat=m["cloth"], parent=shoulder)
    # A layered mantle keeps four arms from merging into one dark rectangle.
    for y in (0.24, -0.24):
        td.box("mantle_plate_%s" % y, (0.23, 0.18, 0.16),
               location=(-0.02, y, 0.035),
               rotation=(math.radians(8.0 if y > 0 else -8.0), 0.0, 0.0),
               mat=m["bone"], parent=shoulder)

    # --- the head, gone -----------------------------------------------------
    # A deep cowl and a real halo hold the glare in space. The previous two
    # coincident violet spheres had no depth hierarchy and turned into a blob.
    _ellipsoid("void_cowl", (0.31, 0.28, 0.34), (-0.14, -0.02, 0.24),
               m["char"], shoulder)
    _torus("cowl_bone_ring", 0.145, 0.030, (-0.015, -0.02, 0.24),
           (0.0, math.radians(90.0), 0.0), m["bone"], shoulder,
           major_segments=16, minor_segments=6)
    _torus("rapture_halo", 0.235, 0.022, (-0.16, -0.02, 0.25),
           (0.0, math.radians(90.0), 0.0), m["sigil_dim"], shoulder,
           major_segments=16, minor_segments=6)
    td.ball("glare", 0.115, location=(0.005, -0.02, 0.24),
            mat=m["sigil"], parent=shoulder)
    td.ball("glare_core", 0.055, location=(0.030, -0.02, 0.24),
            mat=m["bone"], parent=shoulder)
    for y in (0.105, -0.105):
        td.box("cowl_fang_%s" % y, (0.17, 0.035, 0.045),
               location=(-0.015, y - 0.02, 0.24),
               rotation=(0.0, math.radians(-8.0), 0.0),
               mat=m["bone"], parent=shoulder)

    _rifle_rapture(m, shoulder, 5)

    # --- four arms ----------------------------------------------------------
    # Two on the weapon, two raised. The raised pair is what says this is not
    # a man holding a rifle any more.
    _cyl_between("arm_rear_upper", 0.068, (-0.04, -0.24, 0.04),
                 (-0.16, -0.22, -0.09), m["cloth"], shoulder, verts=10)
    td.ball("elbow_rear", 0.074, location=(-0.16, -0.22, -0.09),
            mat=m["bone"], parent=shoulder)
    _cyl_between("arm_rear_fore", 0.058, (-0.16, -0.22, -0.09),
                 (-0.22, -0.12, -0.22), m["cloth"], shoulder, verts=10)
    _ellipsoid("hand_rear", (0.11, 0.09, 0.11),
               (-0.22, -0.12, -0.22), m["skin"], shoulder)

    _cyl_between("arm_fwd_upper", 0.068, (-0.01, 0.25, 0.04),
                 (0.23, 0.18, -0.08), m["cloth"], shoulder, verts=10)
    td.ball("elbow_fwd", 0.074, location=(0.23, 0.18, -0.08),
            mat=m["bone"], parent=shoulder)
    _cyl_between("arm_fwd_fore", 0.058, (0.23, 0.18, -0.08),
                 (0.44, 0.05, -0.10), m["cloth"], shoulder, verts=10)
    _ellipsoid("hand_fwd", (0.115, 0.10, 0.11),
               (0.44, 0.05, -0.10), m["skin"], shoulder)

    # Raised left arm, whole.
    _cyl_between("arm_up_l_upper", 0.068, (-0.08, 0.25, 0.08),
                 (-0.16, 0.40, 0.23), m["cloth"], shoulder, verts=10)
    td.ball("elbow_up_l", 0.074, location=(-0.16, 0.40, 0.23),
            mat=m["bone"], parent=shoulder)
    _cyl_between("arm_up_l_fore", 0.058, (-0.16, 0.40, 0.23),
                 (-0.10, 0.53, 0.38), m["cloth"], shoulder, verts=10)
    _ellipsoid("hand_up_l", (0.115, 0.10, 0.12),
               (-0.10, 0.53, 0.38), m["skin"], shoulder)
    _torus("rune_l", 0.075, 0.018, (-0.10, 0.585, 0.38),
           (math.radians(90.0), 0.0, 0.0), m["sigil"], shoulder,
           major_segments=12, minor_segments=5)

    # Raised right arm, CHARRED THROUGH. It ends at the elbow -- the ability
    # takes a permanent 300 max hp each cast and this is where that went.
    _cyl_between("arm_up_r", 0.068, (-0.08, -0.26, 0.08),
                 (-0.14, -0.42, 0.23), m["char"], shoulder, verts=10)
    td.ball("stump_joint", 0.072, location=(-0.14, -0.42, 0.23),
            mat=m["char"], parent=shoulder)
    _torus("stump_ring", 0.066, 0.018, (-0.14, -0.46, 0.25),
           (math.radians(90.0), 0.0, 0.0), m["bone"], shoulder,
           major_segments=12, minor_segments=5)
    td.ball("stump_glow", 0.050, location=(-0.14, -0.49, 0.27),
            mat=m["sigil"], parent=shoulder)

    return {"figure": figure, "shoulder": shoulder,
            "foundation": foundation}


def build_accent_a_on_rapture(m, parent, tier):
    """Path A over a B3/B4 body. The graft still lights the TOP of the weapon
    -- scope and rail -- so it never lands on the violet under the barrel."""
    colour = m["ley"] if tier >= 2 else m["ley_dim"]
    anchor = td.root("accent")
    anchor.parent = parent
    anchor.location = (0.0, GUN_Y, GUN_Z)

    td.ball("scope_lens", 0.065, location=(0.19, 0.0, 0.13), mat=colour,
            parent=anchor)
    run = 0.64 if tier >= 2 else 0.42
    td.box("top_rail", (run, 0.052, 0.040),
           location=(0.04 + run * 0.5, 0.0, 0.088),
           mat=colour, parent=anchor)
    if tier >= 2:
        # Both marks stay on the weapon. B3/B4's ritual hand and head move
        # during reload; a body mark would drift away from this static overlay.
        td.cyl("scope_collar", 0.085, 0.045,
               location=(0.02, 0.0, 0.13),
               rotation=(0.0, math.radians(90.0), 0.0), mat=colour,
               parent=anchor, verts=10)
        td.ball("rail_node", 0.060, location=(0.62, 0.0, 0.088),
                mat=colour, parent=anchor)


# --- A5: nothing left of him -------------------------------------------------

def build_graft5(m, parent):
    """The Meridian Lance. There is no man in this one.

    A4 still had his head at the breech; A5 is what the rig finishes. The
    owner's call, and it changes what the model has to do: with no figure to
    read against, the ONLY thing carrying the tier is scale and menace, so
    this is built to be the most aggressive silhouette on the board -- a
    braced siege mount with the lance floating free inside magnetic collars,
    six coil stages, and an aperture at the front the size of the old man's
    whole body.

    NO CROSSPATH VARIANT. Buying A5 caps B at 2, but the owner's call is that
    A5 looks the same whatever B did -- there is nothing human left for the
    rapture to mark. So this is one sheet and draw-pack skips the B accent
    entirely at this tier.

    Config it has to sell: infinite pierce, +1000 range, +350 damage, and
    kill-stack attack speed. Hence the tally spar -- the rings climb it as it
    kills, which is the one thing on the model that MOVES with the fight."""

    # The installed foundation belongs to the map, not to the aiming weapon.
    # Counter-yaw it exactly like B5's shrine; the carriage remains directly
    # under `parent` and continues to track the target.
    foundation = _world_fixed_child("world_fixed_foundation", parent)

    # --- the mount. Wide, heavy, bolted down. ------------------------------
    td.cyl("base_ring", 0.72, 0.16, location=(0.0, 0.0, 0.08), mat=m["iron"],
           parent=foundation, verts=12)
    td.cyl("base_tread", 0.80, 0.07, location=(0.0, 0.0, 0.035),
           mat=m["iron2"], parent=foundation, verts=12)
    td.cyl("base_glow", 0.56, 0.03, location=(0.0, 0.0, 0.17),
           mat=m["ley_dim"], parent=foundation, verts=12)

    # Three anchor pylons. Faceted, tapered and caged like engineered cousins
    # of B5's stone restraints, rather than three featureless square sticks.
    for i in range(3):
        ang = math.radians(90.0 + i * 120.0)
        px, py = math.cos(ang) * 0.66, math.sin(ang) * 0.66
        pylon = td.root("pylon_%d" % i)
        pylon.parent = foundation
        pylon.location = (px, py, 0.0)
        pylon.rotation_euler = (0.0, 0.0, ang)
        td.cyl("pylon_foot_%d" % i, 0.165, 0.065,
               location=(0.0, 0.0, 0.033), mat=m["iron"], parent=pylon,
               verts=8)
        _solid_frustum("pylon_shaft_%d" % i, 0.115, 0.083, 0.50,
                       (0.0, 0.0, 0.315), m["iron"], pylon,
                       alternate_mat=m["iron2"])
        _torus("pylon_collar_%d" % i, 0.095, 0.023,
               (0.0, 0.0, 0.585), (0.0, 0.0, 0.0), m["brass"], pylon,
               major_segments=12, minor_segments=6)
        td.ball("pylon_glow_%d" % i, 0.055,
                location=(0.0, 0.0, 0.675), mat=m["ley"], parent=pylon)
        for side in range(3):
            cage_angle = math.radians(side * 120.0)
            cx, cy = math.cos(cage_angle), math.sin(cage_angle)
            _cyl_between("pylon_cage_%d_%d" % (i, side), 0.014,
                         (cx * 0.085, cy * 0.085, 0.59),
                         (cx * 0.040, cy * 0.040, 0.75),
                         m["iron2"], pylon, verts=8)

    # --- the carriage the lance sits in ------------------------------------
    carriage = td.root("carriage")
    carriage.parent = parent
    carriage.location = (0.0, 0.0, 0.86)

    td.box("cradle", (0.62, 0.52, 0.34), location=(-0.34, 0.0, -0.04),
           mat=m["iron"], parent=carriage)
    td.box("cradle_yoke", (0.30, 0.72, 0.24), location=(-0.16, 0.0, -0.16),
           mat=m["iron2"], parent=carriage)

    # Breech block with a core in it. This is where the man used to be, and
    # the shape deliberately echoes the A4 torso socket -- same collar, same
    # proportions, nobody inside.
    td.box("breech", (0.46, 0.42, 0.42), location=(-0.30, 0.0, 0.14),
           mat=m["iron"], parent=carriage)
    td.box("breech_collar", (0.50, 0.46, 0.08), location=(-0.30, 0.0, 0.36),
           mat=m["iron2"], parent=carriage)
    td.ball("core", 0.14, location=(-0.30, 0.0, 0.16), mat=m["ley"],
            parent=carriage)

    # --- the lance ----------------------------------------------------------
    # It does not touch the cradle: six collars hold it, and the gaps between
    # them are the arc. Floating hardware is the one thing on the board that
    # no other tower does, so it belongs to the last tier.
    for i in range(6):
        x = 0.02 + i * 0.36
        td.cyl("collar_%d" % i, 0.21, 0.10, location=(x, 0.0, 0.10),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["iron2"],
               parent=carriage, verts=12)
        td.cyl("collar_glow_%d" % i, 0.155, 0.13, location=(x, 0.0, 0.10),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["ley_dim"],
               parent=carriage, verts=12)

    # Twin spars running the whole length, with the arc down the middle.
    for y in (0.13, -0.13):
        td.box("spar_%s" % y, (1.96, 0.07, 0.10), location=(0.92, y, 0.10),
               mat=m["iron"], parent=carriage)
    td.box("arc_core", (1.90, 0.045, 0.045), location=(0.92, 0.0, 0.10),
           mat=m["ley"], parent=carriage)

    # The aperture. Deliberately oversized -- it is the whole silhouette read
    # at 50 px, and the tier has to be legible from across the board.
    td.cyl("aperture_outer", 0.34, 0.20, location=(1.90, 0.0, 0.10),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["iron"],
           parent=carriage, verts=14)
    td.cyl("aperture_mid", 0.25, 0.10, location=(1.98, 0.0, 0.10),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["iron2"],
           parent=carriage, verts=14)
    td.cyl("aperture_glow", 0.17, 0.06, location=(2.03, 0.0, 0.10),
           rotation=(0.0, math.radians(90.0), 0.0), mat=m["ley"],
           parent=carriage, verts=14)
    # Four prongs around the mouth. Cheap, and they break the circle so the
    # front does not read as a plain tube.
    for i in range(4):
        ang = math.radians(45.0 + i * 90.0)
        td.box("prong_%d" % i, (0.26, 0.06, 0.06),
               location=(1.94, math.cos(ang) * 0.30, 0.10 +
                         math.sin(ang) * 0.30),
               rotation=(ang, 0.0, 0.0), mat=m["iron2"], parent=carriage)

    # --- tally spar ---------------------------------------------------------
    # The rings themselves are live procedural feedback in draw-pack: baking
    # even dim rings here would claim stacks the tower has not earned. The
    # sturdy capped rail is all the static model needs to provide.
    td.box("tally_spar", (0.115, 0.115, 0.82),
           location=(-0.52, 0.0, 0.46), mat=m["iron"], parent=carriage)
    td.box("tally_brace", (0.28, 0.12, 0.10),
           location=(-0.40, 0.0, 0.12), mat=m["iron2"], parent=carriage)
    td.box("tally_cap", (0.17, 0.17, 0.09),
           location=(-0.52, 0.0, 0.90), mat=m["iron2"], parent=carriage)
    return {"carriage": carriage, "foundation": foundation}


# --- accents ----------------------------------------------------------------

def build_accent(m, parent, path, tier):
    """Emissive parts only, for the A0-A2 body. Composited over sniper_body.

    The mounting rule holds: the graft lights the TOP of the weapon, the
    rapture lights the UNDERSIDE, so an A2 B2 shows both colours and neither
    lands on the other's metal."""
    anchor = td.root("accent")
    anchor.parent = parent
    anchor.location = (0.0, GUN_Y, GUN_Z)

    if path == "base":
        td.cyl("ring_a", 0.15, 0.035, location=(0.18, 0.0, 0.0),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["ley_dim"],
               parent=anchor)
        td.cyl("ring_b", 0.125, 0.04, location=(0.18, 0.0, 0.0),
               rotation=(0.0, math.radians(90.0), 0.0), mat=m["sigil_dim"],
               parent=anchor)
        return

    if path == "A":
        colour = m["ley"] if tier >= 2 else m["ley_dim"]
        td.ball("scope_lens", 0.067, location=(0.21, 0.0, 0.13), mat=colour,
                parent=anchor)
        run = 0.64 if tier >= 2 else 0.42
        td.box("top_rail", (run, 0.052, 0.040),
               location=(0.06 + run * 0.5, 0.0, 0.088), mat=colour,
               parent=anchor)
        if tier >= 2:
            td.ball("socket", 0.070, location=(-0.02, 0.20, -0.02),
                    mat=colour, parent=anchor)
            td.cyl("ring", 0.160, 0.045, location=(0.18, 0.0, 0.0),
                   rotation=(0.0, math.radians(90.0), 0.0), mat=colour,
                   parent=anchor)
        return

    colour = m["sigil"] if tier >= 2 else m["sigil_dim"]
    run = 0.98 if tier >= 2 else 0.72
    thickness = 0.055 if tier >= 2 else 0.045
    td.box("groove", (run, thickness, thickness),
           location=(0.11 + run * 0.5, 0.0, -0.075), mat=colour,
           parent=anchor)
    td.cyl("ring", 0.155, 0.045, location=(0.18, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=colour, parent=anchor)
    if tier >= 2:
        td.box("forearm_rune", (0.14, 0.035, 0.14),
               location=(0.40, 0.11, -0.10), mat=colour, parent=anchor)


def build_accent_b_on_a3(m, parent, tier):
    """Path B over the A3 body. The groove is longer and sits under the coil
    barrel; it cannot share a sheet with the A0-A2 accent because that barrel
    is a different length at a different height."""
    colour = m["sigil"] if tier >= 2 else m["sigil_dim"]
    anchor = td.root("accent")
    anchor.parent = parent
    anchor.location = (0.0, GUN_Y, GUN_Z)

    run = 1.26 if tier >= 2 else 0.94
    thickness = 0.055 if tier >= 2 else 0.045
    td.box("groove", (run, thickness, thickness),
           location=(0.30 + run * 0.5, 0.0, -0.070), mat=colour,
           parent=anchor)
    td.cyl("ring", 0.165, 0.045, location=(0.18, 0.0, 0.0),
           rotation=(0.0, math.radians(90.0), 0.0), mat=colour, parent=anchor)
    if tier >= 2:
        # Carved into the one forearm he has left.
        td.box("forearm_rune", (0.14, 0.035, 0.14),
               location=(-0.22, -0.12, -0.22), mat=colour, parent=anchor)


def build_accent_b_on_a4(m, parent, tier):
    """Path B over the A4 emplacement. There is no forearm left to carve, so
    the rapture takes the mount instead: a ring cut into the gimbal and a
    groove down the underside of the cannon."""
    colour = m["sigil"] if tier >= 2 else m["sigil_dim"]
    anchor = td.root("accent")
    anchor.parent = parent
    anchor.location = (0.0, 0.0, 0.72)

    run = 1.38 if tier >= 2 else 0.98
    thickness = 0.060 if tier >= 2 else 0.050
    td.box("groove", (run, thickness, thickness),
           location=(0.80, 0.0, -0.085),
           mat=colour, parent=anchor)
    td.cyl("breech_ring", 0.22, 0.050, location=(0.05, 0.0, 0.02),
           rotation=(0.0, math.radians(90.0), 0.0), mat=colour, parent=anchor)
    if tier >= 2:
        td.cyl("mount_ring", 0.36, 0.055, location=(0.0, 0.0, -0.40),
               mat=colour, parent=anchor, verts=12)


# --- rendering --------------------------------------------------------------

def key(obj, frame, rotation=None, location=None):
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert("rotation_euler", frame=frame)
    if location is not None:
        obj.location = location
        obj.keyframe_insert("location", frame=frame)


# Shared by A0-A2 and B1-B2, which are one body with different accents on it.
RELOAD_FRAMES = 4


def animate_reload(parts):
    """A bolt cycle, in four frames, read in this order by draw-pack:

        0  at rest, aimed              (held for the rest of the cycle)
        1  recoil, bolt lifting        (the shot has just gone)
        2  bolt drawn fully back
        3  bolt driven home, settling

    WHY THE BODY BARELY MOVES. Only the bolt and the rear arm are keyed. The
    barrel, the scope and the forward hand hold
    still on purpose -- the emissive ACCENT sheets are rendered at one frame
    and composited over every frame of this one, so anything they sit on must
    not move or the glow would slide off the metal it belongs to. Four frames
    of a whole body would also have cost four times the sheet, and 48 facings
    is already the expensive axis.
    """
    bolt = parts["bolt"]
    rear = parts["rear"]
    bolt_home = (-0.10, -0.09, 0.02)
    rear_home = (-0.16, -0.19, -0.10)

    # 1 -- rest
    key(bolt, 1, location=bolt_home, rotation=(0.0, 0.0, 0.0))
    key(rear, 1, location=rear_home, rotation=(0.0, 0.0, 0.0))

    # 2 -- the shot has just gone: kick back, bolt handle rotating up
    key(bolt, 2, location=(-0.13, -0.09, 0.02),
        rotation=(math.radians(-58.0), 0.0, 0.0))
    key(rear, 2, location=(-0.19, -0.17, -0.05),
        rotation=(0.0, math.radians(14.0), 0.0))

    # 3 -- bolt drawn fully back, hand with it
    key(bolt, 3, location=(-0.30, -0.09, 0.02),
        rotation=(math.radians(-84.0), 0.0, 0.0))
    key(rear, 3, location=(-0.30, -0.14, -0.02),
        rotation=(0.0, math.radians(24.0), 0.0))

    # 4 -- driven home, settling back onto the grip
    key(bolt, 4, location=(-0.11, -0.09, 0.02),
        rotation=(math.radians(-22.0), 0.0, 0.0))
    key(rear, 4, location=(-0.17, -0.18, -0.08),
        rotation=(0.0, math.radians(7.0), 0.0))

    # No interpolation pass. Every key sits on an integer frame and those are
    # exactly the frames rendered, so a keyframe's value is its keyed value
    # whatever the curve does between them. (An earlier version set LINEAR
    # here via `action.fcurves`, which Blender 5 removed -- and it was never
    # doing anything.)


RAPTURE_FRAMES = 4


def animate_rapture_reload(parts):
    """B3 and B4 do not RELOAD. They pay.

    The first version of this tipped the weapon up and spun the cylinder --
    which is a bolt cycle with extra steps, i.e. path A's animation wearing
    path B's clothes. Wrong on the story and wrong on the read: the whole
    point of the rapture is that nothing about it is mechanical. He does not
    service a weapon, he gives it something.

    The first genuflection pass translated and leaned the entire figure. That
    drove both boots below z=0 and dragged B4's cathedral into the ground.
    The payment now happens where the story says it does: his opened hand
    crosses the breech, his head bows, and the cylinder turns under his palm.
    Feet, body root, weapon and static architecture remain planted:

        0  aimed, hand on guard      2  hand offered over the cylinder
        1  hand rising, head bows   3  hand withdrawing, head still bowed

    Driven by the ReloadTracker's own 1 s timer, which reload.js keeps
    independent of fire rate -- so the four shots come faster as attack speed
    is bought and the offering takes exactly as long as it always did."""
    figure = parts["figure"]
    head = parts["head"]
    fwd = parts["fwd"]
    cylinder = parts["cylinder"]
    rifle = parts["rifle"]

    figure_home = tuple(figure.location)
    figure_rotation = tuple(figure.rotation_euler)
    head_rot = head.rotation_euler[1]
    rifle_home = tuple(rifle.location)
    rifle_rot = rifle.rotation_euler[1]

    def pose(frame, bow_deg, hand_local, hand_deg, cylinder_deg):
        """Key an offering while preserving every ground-contact transform."""
        key(figure, frame, location=figure_home, rotation=figure_rotation)
        key(head, frame,
            rotation=(0.0, head_rot + math.radians(bow_deg), 0.0))
        # The one-frame A1/A2 overlay sits on this weapon, so both authored
        # transform channels are explicitly held on every rendered frame.
        key(rifle, frame, location=rifle_home,
            rotation=(0.0, rifle_rot, 0.0))
        key(fwd, frame, location=hand_local,
            rotation=(0.0, math.radians(hand_deg), 0.0))
        key(cylinder, frame,
            rotation=(math.radians(cylinder_deg), 0.0, 0.0))

    # The arm root shifts only within the shoulder rig. The last pose keeps
    # the head bowed instead of recovering inside the beat.
    pose(1, 0.0, (0.24, 0.16, -0.09), 0.0, 0.0)
    pose(2, 16.0, (0.18, 0.14, -0.13), -28.0, 30.0)
    pose(3, 30.0, (0.10, 0.10, -0.08), -74.0, 64.0)
    pose(4, 18.0, (0.19, 0.15, -0.11), -30.0, 90.0)


def render_layer(name, group, build_fn, frames=1, animate_fn=None):
    """One sheet, one layer. The scene is rebuilt from scratch each time so a
    layer cannot inherit stray objects from the one before it -- and so every
    layer IN A GROUP gets an identical camera. Accents only line up on their
    body because of that."""
    tile = TILE_BY_GROUP.get(group, TILE)
    direction_rows = DIRECTION_ROWS_BY_GROUP.get(group, DIRECTIONS)
    td.scene(ortho_scale=ORTHO[group], tile_w=tile, tile_h=tile)
    m = materials()
    root = td.root("sniper")
    parts = build_fn(m, root)
    if animate_fn:
        animate_fn(parts)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = frames
    td.render_sheet(root, name, frames, directions=DIRECTIONS,
                    tile_w=tile, tile_h=tile, frame_start=1,
                    direction_rows=direction_rows)


def _requested_groups():
    """Optional resumable render selection: -- --groups=a3,a4,b5."""
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for arg in args:
        if arg.startswith("--groups="):
            chosen = {value.strip() for value in
                      arg.split("=", 1)[1].split(",") if value.strip()}
            known = {"base", "a3", "a4", "a5", "b3", "b4", "b5"}
            unknown = chosen - known
            if unknown:
                raise ValueError("unknown sniper render group(s): %s" %
                                 ", ".join(sorted(unknown)))
            return chosen
    return {"base", "a3", "a4", "a5", "b3", "b4", "b5"}


def main():
    if not os.path.isdir(td.OUTPUT_DIR):
        os.makedirs(td.OUTPUT_DIR)
    groups = _requested_groups()

    # Only the base body is animated. A3-A5 charge instead of reloading, and
    # that is drawn procedurally in js/skins/draw-pack.js -- lightning and a
    # rune circle want to be continuous and random, which frames cannot be,
    # and it keeps 48 facings from being multiplied by a frame count.
    if "base" in groups:
        render_layer("sniper_body", "base", lambda m, r: build_caster(m, r),
                     frames=RELOAD_FRAMES, animate_fn=animate_reload)
        render_layer("sniper_accent0", "base",
                     lambda m, r: build_accent(m, r, "base", 0))
        for tier in (1, 2):
            render_layer("sniper_accent_a%d" % tier, "base",
                         lambda m, r, t=tier: build_accent(m, r, "A", t))
            render_layer("sniper_accent_b%d" % tier, "base",
                         lambda m, r, t=tier: build_accent(m, r, "B", t))

    if "a3" in groups:
        render_layer("sniper_body_a3", "a3", lambda m, r: build_graft3(m, r))
        for tier in (1, 2):
            render_layer("sniper_accent_b%d_a3" % tier, "a3",
                         lambda m, r, t=tier: build_accent_b_on_a3(m, r, t))

    if "a4" in groups:
        render_layer("sniper_body_a4", "a4", lambda m, r: build_graft4(m, r))
        for tier in (1, 2):
            render_layer("sniper_accent_b%d_a4" % tier, "a4",
                         lambda m, r, t=tier: build_accent_b_on_a4(m, r, t))

    # A5 is ONE sheet. No B variants: there is nothing human left for the
    # rapture to mark, so the model is the same whatever B did.
    if "a5" in groups:
        render_layer("sniper_body_a5", "a5", lambda m, r: build_graft5(m, r))

    # Path B's own tiers, and the four crosspaths they reach (A1B3, A2B3,
    # A1B4, A2B4 -- buying B3 caps A at 2).
    for tier, group, builder in ((3, "b3", build_rapture3),
                                 (4, "b4", build_rapture4)):
        if group not in groups:
            continue
        render_layer("sniper_body_b%d" % tier, group,
                     lambda m, r, b=builder: b(m, r),
                     frames=RAPTURE_FRAMES, animate_fn=animate_rapture_reload)
        for a in (1, 2):
            render_layer("sniper_accent_a%d_b%d" % (a, tier), group,
                         lambda m, r, t=a: build_accent_a_on_rapture(m, r, t))

    # B5 is ONE sheet, like A5 -- at this tier the path that got here is the
    # model. Not animated: its reload is swallowed by the ability's own
    # channel, and the charge is drawn procedurally.
    if "b5" in groups:
        render_layer("sniper_body_b5", "b5", lambda m, r: build_rapture5(m, r))

    # Muzzle positions, in this file's units, measured from the point the
    # tower stands on. These become projectile.muzzleOffsetUlByGraft.
    print("\nMUZZLE base=1.19  a3=1.56  a4=1.78  a5=2.05  (world, forward)")
    print("ORTHO %r" % (ORTHO,))


# Guarded so make_preview.py can import the builders without kicking off a
# full sheet render.
if __name__ == "__main__":
    main()
