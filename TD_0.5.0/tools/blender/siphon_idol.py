# ---------------------------------------------------------------------------
# THE SIPHON -- l'idole. Base body plus the five PATH A tiers, and the sceptre.
#
#   python tools/blender/siphon_idol.py                 build everything
#   python tools/blender/siphon_idol.py --silhouette    build PASS 1 forms
#
# Everything here is fixed by visual-pass/SIPHON-SOCLE.md. Nothing in that file
# is re-derived, re-named or "improved" -- the constants below are copied out of
# it and asserted against the built geometry at the bottom of this file.
#
# THE ONE RULE THAT SHAPED EVERY LINE: NO SURFACE OF REVOLUTION.
#
# The brief's section 2 forbids any part of the model being generable by
# revolving a profile about the vertical axis, and names the cone-with-a-ball-on
# -top as the lazy reflex. A previous Siphon was deleted for exactly that: its
# robe was a td.frustum. So the BODY here is not a primitive at all. It is a
# LOFT (`_shell`) over explicitly authored, non-uniformly spaced angular
# samples, and every ring in the loft breaks the axis in four independent ways:
#
#   * an asymmetric LOBE -- 0.660 from the axis on the trailing bearing (247
#     degrees, the same bearing the socle's VEIN_ROOT sits on) and 0.350 on the
#     open bearing (67 degrees, where the hands work). Those two numbers are the
#     socle's, and they mean the ground outline cannot be a circle at any tier.
#   * ORIENTED FOLDS -- a fixed, irregular per-sample crease table whose angular
#     positions DRIFT with height (`twist`), so the creases run diagonally down
#     and around the cloth instead of sitting in a graded ring. The crease faces
#     also carry their own material, because at 55 px a fold is a VALUE before
#     it is a geometry.
#   * a RAGGED, TILTED HEM -- one panel trails on the ground at 0.015 and the
#     other is lifted to 0.235, plus a per-sample jitter. One panel longer than
#     the other, as the brief asks.
#   * the 8 degree FORWARD TILT -- the ring centres walk forward with height, so
#     the loft's own axis is not vertical.
#
# The cowl is a second loft with the same treatment, closing to a POINT that
# overhangs forward-left, with a CHUTE falling down the back and an OPENING
# that is off the cowl's own narrowest bearing. It is not a sphere and it never
# was one. The face is never visible; the opening is darkness with a lit lip.
#
# td.frustum survives only where the brief allows it -- fingers, sleeves, cord
# ends, coins. Small non-axial details. Never the body.
#
# THE FOOTPRINT NEVER GROWS. `audit_footprint` re-measures the ground radius on
# every tier and fails the build if any tier is wider than the base. All
# progression is vertical (1.790 -> 2.080, the socle's +0.29), textural and
# immaterial. The gold pour at A4/A5 is world_fixed ground furniture and is
# checked against the 15 u.l. footprint radius separately.
#
# GEOMETRY IS AUTHORED IN WORLD SPACE (see td_mesh.build). `parent` picks the
# animated / world-fixed group, it is not a second transform, so every number
# here is a real position on the finished model.
#
# NAMING: `_l` is +X and `_r` is -X, matching summoner_figure.py's convention.
# The socle's "epaule gauche +0.06 plus haute" is therefore the +X shoulder.
#
# THE ARC, and it is a MINERALISATION climbing from the extremities inward --
# he never becomes corrupt, he becomes an object:
#
#   base  a man under a hooded robe. No staff, no focus, nothing in his hands:
#         he aspirates BARE-HANDED, palms up, fingers spread, as if holding
#         water. Poor, human, leaning forward in tension. The beam leaves the
#         VOID BETWEEN THE TWO HANDS -- the socle's HANDS point -- not a palm.
#   a1    fingertips hardened to matt brass. Coins sewn to the hem. His fingers
#         straighten: he closes his hands slightly less well.
#   a2    both hands fully gold, knuckles now HINGES. The cloth begins to shine
#         in the folds. The fingers straighten further.
#   a3    forearms gold to the elbow, right sleeve split by the gilding. THE
#         SCEPTRE APPEARS -- and only from here.
#   a4    torso and lower face gold. The cloth stops falling: no fray left, the
#         creases are cut deeper and hold. Statuary drapery. The gold pour
#         starts at his feet.
#   a5    complete idol. No skin, no identifiable cloth. The drapery is
#         sculpture, the pour has frozen into a plinth, the cowl has become a
#         spire and the sceptre carries three misaligned concentric rings.
#
# THE SCEPTRE is not a weapon and not a point. It is a HOLLOW RING on a shaft --
# another hole, echoing the cupped hands of the base tier. He does not hold it:
# the gold hand is WELDED to it and the junction of petrified flesh and metal is
# modelled (`_weld`). The ring is the beam origin from A3, at the socle's RING.
# It gains a second concentric circle at A4 and a third at A5, deliberately
# MISALIGNED. The ring never rotates; the beam rotates inside it.
# ---------------------------------------------------------------------------

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_mesh as td                                          # noqa: E402

PX_PER_UNIT = 20.0 * 1.529 * 1.04          # td_mesh.UNITS_TO_PX


def R(footprint_ul):
    """A unit's ground radius, in Blender units."""
    return footprint_ul / PX_PER_UNIT


# --- THE SOCLE. Copied out of visual-pass/SIPHON-SOCLE.md, never re-derived. --

FOOTPRINT_UL = 15.0                        # fixed at every tier, per the config
FOOTPRINT_R = R(FOOTPRINT_UL)              # 0.4717

HANDS = (0.055, 0.305, 1.045)              # base, A1, A2 -- the void BETWEEN
RING = (0.315, 0.395, 1.190)               # A3, A4, A5 -- the hollow ring
POUR_ROOT = (0.09, 0.14, 0.01)             # gold pour centre, appears at A4
VEIN_ROOT = (-0.12, -0.28, 0.02)           # voie B's, quoted only to fix 247

HEIGHT_BASE = 1.790
HEIGHT_A5 = 2.080
HEM_TRAIN = 0.660                          # trailing side, from the axis
HEM_OPEN = 0.350                           # open side, from the axis
SHOULDER_RISE = 0.060                      # +X shoulder above -X
TORSO_TILT_DEG = 8.0

# The trailing bearing. VEIN_ROOT bears 246.8 degrees from the axis, so the
# socle has already decided which way the train falls; 247 is that bearing and
# not a free choice. The open side is its antipode, 67 degrees -- which is where
# HANDS (79.8) and RING (51.4) both sit. The robe opens where he works.
TRAIN_DIR = math.radians(247.0)
OPEN_DIR = TRAIN_DIR + math.pi


# --- palettes ---------------------------------------------------------------
# Verbatim from the socle's section 3. No overlap with the Summoner's
# green-moss/stone and cyan-chrome. VALUE RULE: the largest surface takes the
# darkest value -- cloth_worn at base, the ochre drapery on voie A. Gold is an
# ACCENT until A4, never a fill.

PALETTE = {
    # --- base, before any purchase: poor, dull, human ---
    "cloth_worn":  ("#6B6355", 0.0),
    "cloth_dark":  ("#4A453C", 0.0),
    "hem_fray":    ("#7D735F", 0.0),
    "skin":        ("#B08A66", 0.0),
    "skin_dark":   ("#8A6A4C", 0.0),
    # --- voie A: the idol ---
    "gold":        ("#C9A227", 0.0),
    "gold_dark":   ("#8A6E1C", 0.0),
    "brass":       ("#9A7B3C", 0.0),
    "amber":       ("#D9A441", 0.30),
    "ochre_cloth": ("#A8823E", 0.0),
    "purple_rich": ("#6B3A6E", 0.0),
    "white_warm":  ("#F0E2C0", 0.55),
}

SILHOUETTE = dict((k, ("#9AA0A8", 0.0)) for k in PALETTE)


def palette(flat):
    return SILHOUETTE if flat else PALETTE


# --- small geometry helpers, same conventions as summoner_figure.py ----------

def _norm(v):
    n = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) or 1e-6
    return (v[0] / n, v[1] / n, v[2] / n)


def _axis(a, b):
    """The (rotation, length) that puts a primitive's +Z along a -> b."""
    dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    length = math.sqrt(dx * dx + dy * dy + dz * dz) or 1e-6
    pitch = math.acos(max(-1.0, min(1.0, dz / length)))
    return (0.0, pitch, math.atan2(dy, dx)), length


def _mid(a, b):
    return ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5)


def _lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def _add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k)


def taper(s, name, a, b, r_a, r_b, mat, parent, verts=6, alt=None):
    """A frustum laid along the segment a -> b -- sleeves, fingers, cord ends,
    shaft. Small non-axial details only; the body is never one of these."""
    rot, length = _axis(a, b)
    return td.frustum(s, name, r_a, r_b, length, _mid(a, b), mat, parent, verts,
                      rot, alt)


def plate(s, name, at, look, size, mat, parent, pitch=0.0):
    """A box whose local +X is turned to face `look`. `size` is
    (along look, across, up). Positive pitch tips the look direction DOWN."""
    lx, ly, _ = _norm(look)
    return td.box(s, name, size, at, (0.0, pitch, math.atan2(ly, lx)), mat,
                  parent)


def _mean(mesh):
    n = len(mesh.verts)
    return tuple(sum(v[k] for v in mesh.verts) / n for k in range(3))


# --- THE LOFT. This is what replaces the forbidden frustum -------------------

def _shell(s, name, rings, mat_ridge, mat_fold, depth, parent, fold_at=0.5):
    """Loft a stack of explicitly authored rings.

    `rings` is a list of equal-length rings of world-space points, ordered
    counter-clockwise in XY so the quads wind outward exactly as td_mesh.cyl
    does. `depth` is the per-sample crease table: a face whose two columns are
    both inside a crease takes `mat_fold`, which is how a fold survives being
    two pixels wide -- it is a value change, not a bump.
    """
    verts = []
    for ring in rings:
        verts.extend(ring)
    n = len(rings[0])
    faces, mats = [], []
    for k in range(len(rings) - 1):
        lo, hi = k * n, (k + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((lo + i, lo + j, hi + j, hi + i))
            mats.append(mat_fold if max(depth[i], depth[j]) > fold_at
                        else mat_ridge)
    m = s.add(td.Mesh(name, verts, faces, mat_ridge, parent))
    m.face_mats = mats
    return m


def _cap(s, name, ring, mat, parent, down=True):
    """Close a loft end with a fan from its own centroid. Handles the mildly
    non-convex outlines the crease table produces, which a single n-gon face
    would not."""
    n = len(ring)
    cx = sum(p[0] for p in ring) / n
    cy = sum(p[1] for p in ring) / n
    cz = sum(p[2] for p in ring) / n
    verts = [(cx, cy, cz)] + list(ring)
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((0, 1 + j, 1 + i) if down else (0, 1 + i, 1 + j))
    return s.add(td.Mesh(name, verts, faces, mat, parent))


# ---------------------------------------------------------------------------
# THE ROBE. Sixteen NON-UNIFORMLY spaced angular samples -- dense around the
# trailing bearing where the cloth gathers, sparse on the open side where it
# falls away -- and six rings. FOLD_D is the crease table: 0 is a ridge at full
# radius, 1 is the bottom of a crease. Creases only ever cut INWARD, which is
# what lets the socle's 0.660 and 0.350 be exact maxima rather than averages.
# ---------------------------------------------------------------------------

FOLD_DEG = [0, 30, 62, 96, 126, 152, 174, 194, 212, 228, 247, 256, 270, 288,
            312, 338]
FOLD_D = [0.00, 0.10, 0.85, 0.15, 0.00, 0.20, 0.90, 0.25, 0.05, 0.95, 0.00,
          0.30, 0.85, 0.20, 0.00, 0.45]
HEM_JIT = [0.000, 0.052, 0.018, 0.088, 0.010, 0.062, 0.106, 0.030, 0.074,
           0.004, 0.020, 0.098, 0.022, 0.058, 0.034, 0.080]
NROBE = len(FOLD_DEG)

# z, cx, cy, rmid, lobe, fold, twist, hem-lift share.
# rmid +/- lobe/2 gives the socle's 0.660 / 0.350 on ring 0 exactly. `twist`
# drifts the whole crease pattern with height so the folds run DIAGONALLY --
# a graded ring of ripples would still be a revolution in spirit.
ROBE_RINGS = [
    (0.015, 0.000, 0.000, 0.505, 0.310, 0.075, 0.00, 1.00),
    (0.300, 0.002, 0.004, 0.400, 0.212, 0.062, 0.05, 0.45),
    (0.620, 0.006, 0.014, 0.300, 0.126, 0.050, 0.10, 0.16),
    (0.950, 0.010, 0.055, 0.224, 0.074, 0.038, 0.15, 0.00),
    (1.190, 0.015, 0.092, 0.198, 0.052, 0.030, 0.19, 0.00),
    (1.335, 0.019, 0.115, 0.190, 0.040, 0.024, 0.22, 0.00),
]

# The cord, as two more rings standing proud of the robe. Built out of the same
# machinery so it inherits the lobe and the creases and cannot slide off a
# leaning body the way a horizontal band would.
SASH_RINGS = [
    (0.745, 0.007, 0.028, 0.284, 0.104, 0.026, 0.115, 0.0),
    (0.870, 0.008, 0.041, 0.256, 0.086, 0.024, 0.128, 0.0),
]


def _lobe(a):
    """-0.5 on the open bearing, +0.5 on the trailing bearing."""
    return (0.5 + 0.5 * math.cos(a - TRAIN_DIR)) ** 1.6 - 0.5


def _hem_lift(a):
    """One panel on the ground, the other lifted clear. The brief's "one panel
    longer than the other", and the reason the hem outline is not even a
    symmetric oval."""
    return 0.220 * (0.5 - 0.5 * math.cos(a - TRAIN_DIR)) ** 1.3


def _rings(table, fold_gain, fray):
    out = []
    for (zb, cx, cy, rmid, lobe, fold, twist, lift) in table:
        ring = []
        for i in range(NROBE):
            a = math.radians(FOLD_DEG[i]) + twist
            r = rmid + lobe * _lobe(a) - fold * fold_gain * FOLD_D[i]
            z = zb + _hem_lift(a) * lift + HEM_JIT[i] * lift * fray
            ring.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
        out.append(ring)
    return out


# ---------------------------------------------------------------------------
# THE COWL. Ten samples, four rings and a POINT. Its widest bearing is 240 --
# it carries its mass back over the train -- and its narrowest is 72, but the
# OPENING is put at 62, deliberately off the cowl's own axis of narrowness. Its
# bottom ring carries the socle's shoulder break directly: +0.060 of z on the
# +X side, tapering to nothing on the -X side.
# ---------------------------------------------------------------------------

HOOD_DEG = [0, 34, 72, 108, 140, 172, 205, 240, 278, 320]
HOOD_RINGS = [
    (1.185, 0.019, 0.088, 0.060,
     [0.238, 0.228, 0.220, 0.230, 0.248, 0.266, 0.286, 0.296, 0.282, 0.256]),
    (1.360, 0.020, 0.104, 0.020,
     [0.205, 0.196, 0.188, 0.196, 0.214, 0.232, 0.252, 0.262, 0.248, 0.222]),
    (1.505, 0.016, 0.108, 0.008,
     [0.170, 0.158, 0.146, 0.154, 0.176, 0.198, 0.222, 0.234, 0.218, 0.192]),
    (1.640, 0.006, 0.098, 0.000,
     [0.112, 0.098, 0.086, 0.094, 0.116, 0.140, 0.164, 0.176, 0.158, 0.132]),
]
HOOD_APEX = (0.045, 0.150, 1.790)
HOOD_SHARE = [0.0, 0.10, 0.35, 0.62]       # how the +0.29 is spent up the cowl
HOOD_FOLD = [0.0, 0.9, 0.1, 0.0, 0.8, 0.2, 0.0, 0.9, 0.15, 0.6]
VOID_DEG = 62.0


def _hood_rings(lift):
    out = []
    for k, (zb, cx, cy, tilt, radii) in enumerate(HOOD_RINGS):
        squeeze = 1.0 - (0.26 if k == 3 else 0.10 if k == 2 else 0.0) * \
            (lift / 0.29)
        ring = []
        for i in range(len(HOOD_DEG)):
            a = math.radians(HOOD_DEG[i])
            r = radii[i] * squeeze
            z = zb + HOOD_SHARE[k] * lift + tilt * (0.5 + 0.5 * math.cos(a))
            ring.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
        out.append(ring)
    return out


def _hood_surface(rings, deg, t):
    """A point on the cowl between two rings at an arbitrary bearing -- used to
    hang the opening and its lip on the surface rather than guessing."""
    k = int(t)
    k = min(k, len(rings) - 2)
    f = t - k
    lo, hi = rings[k], rings[k + 1]
    n = len(HOOD_DEG)
    i = 0
    while i < n - 1 and HOOD_DEG[i + 1] < deg:
        i += 1
    j = (i + 1) % n
    span = (HOOD_DEG[j] - HOOD_DEG[i]) % 360 or 1.0
    u = ((deg - HOOD_DEG[i]) % 360) / span
    a = _lerp(lo[i], lo[j], u)
    b = _lerp(hi[i], hi[j], u)
    return _lerp(a, b, f)


# ---------------------------------------------------------------------------
# THE POSE. One pose, six tiers -- the man never changes stance, only his
# substance does. That is what makes the mineralisation legible.
# ---------------------------------------------------------------------------

SH_L = (0.196, 0.062, 1.318)
SH_R = (-0.186, 0.056, 1.258)              # SH_L.z - SH_R.z == SHOULDER_RISE
EL_L = (0.238, 0.098, 1.005)
EL_R = (-0.215, 0.112, 0.958)
WR_L = (0.190, 0.208, 1.014)
WR_R = (-0.124, 0.222, 1.004)

# The two palms STRADDLE the socle's HANDS point and their midpoint IS it. They
# are at different heights, which is one more break of the axis, and neither is
# on it -- HANDS is offset +0.055 in x because the socle says the hands are not
# centred.
PALM_L = (0.130, 0.298, 1.040)
PALM_R = (-0.020, 0.312, 1.050)
PALM_ROT_L = (0.22, -0.42, 0.10)           # normal leans -X, toward the void
PALM_ROT_R = (0.16, 0.50, -0.16)           # normal leans +X, toward the void

# Root -> tip per digit, authored rather than fanned, so the two hands are not
# mirror images of each other. Index 4 is the thumb: both thumbs stand UP and
# flank the void, which is what frames the beam origin at 55 px.
DIGITS_L = [
    ((0.180, 0.330, 1.038), (0.238, 0.392, 1.086)),
    ((0.148, 0.348, 1.042), (0.176, 0.428, 1.100)),
    ((0.112, 0.352, 1.044), (0.114, 0.436, 1.098)),
    ((0.080, 0.344, 1.040), (0.058, 0.418, 1.082)),
    ((0.092, 0.278, 1.030), (0.082, 0.268, 1.098)),
]
DIGITS_R = [
    ((0.020, 0.348, 1.048), (0.038, 0.428, 1.098)),
    ((-0.012, 0.360, 1.052), (-0.022, 0.446, 1.108)),
    ((-0.046, 0.356, 1.050), (-0.078, 0.438, 1.100)),
    ((-0.076, 0.340, 1.044), (-0.126, 0.410, 1.084)),
    ((0.016, 0.294, 1.036), (0.026, 0.284, 1.104)),
]

# The sceptre, A3+. It runs THROUGH the welded palm, so the shaft is not a thing
# he grips -- the hand is on the line of it.
SCEPTRE_JOIN = (0.246, 0.395, 1.121)       # the ring's lower-left, in its plane
SCEPTRE_BUTT = (-0.013, 0.178, 0.940)


# --- the tier table ---------------------------------------------------------
# Six looks over ONE body. A tier is a material map plus four scalars, which is
# why the mineralisation reads as the same man hardening rather than as six
# different models.
#
#   stiff      how badly the fingers close. 0 is a living hand.
#   fold_gain  how deep the creases cut. Above 1 the drapery has stopped moving.
#   fray       hem jitter and the frayed tags. 0 is statuary.
#   height     total height. The socle's only permitted growth, all vertical.

def _look(**kw):
    return kw


LOOKS = {
    "base": _look(
        stiff=0.00, fold_gain=1.00, fray=1.00, height=1.790,
        hem_ridge="hem_fray", hem_fold="cloth_dark",
        robe_ridge="cloth_worn", robe_fold="cloth_dark",
        torso_ridge="cloth_worn", torso_fold="cloth_dark",
        cowl="cloth_worn", cowl_fold="cloth_dark",
        void="cloth_dark", rim="hem_fray", jaw=None,
        sleeve="cloth_worn", forearm="cloth_worn", cuff="cloth_dark",
        palm="skin", digit="skin", nail=None, hinge=None,
        sash="hem_fray", accent="cloth_dark", fray_mat="hem_fray",
        foot="skin_dark", coins=None, sceptre=False, rings=0,
        pour=0, split=False, glint=None),
    "a1": _look(
        stiff=0.25, fold_gain=1.00, fray=1.00, height=1.790,
        hem_ridge="hem_fray", hem_fold="cloth_dark",
        robe_ridge="cloth_worn", robe_fold="cloth_dark",
        torso_ridge="cloth_worn", torso_fold="cloth_dark",
        cowl="cloth_worn", cowl_fold="cloth_dark",
        void="cloth_dark", rim="hem_fray", jaw=None,
        sleeve="cloth_worn", forearm="cloth_worn", cuff="cloth_dark",
        palm="skin", digit="skin", nail="brass", hinge=None,
        sash="hem_fray", accent="cloth_dark", fray_mat="hem_fray",
        foot="skin_dark", coins="brass", sceptre=False, rings=0,
        pour=0, split=False, glint=None),
    "a2": _look(
        stiff=0.55, fold_gain=1.05, fray=0.85, height=1.790,
        hem_ridge="hem_fray", hem_fold="cloth_dark",
        robe_ridge="cloth_worn", robe_fold="brass",
        torso_ridge="cloth_worn", torso_fold="brass",
        cowl="cloth_worn", cowl_fold="brass",
        void="cloth_dark", rim="hem_fray", jaw=None,
        sleeve="cloth_worn", forearm="cloth_worn", cuff="cloth_dark",
        palm="gold", digit="gold", nail="gold_dark", hinge="gold_dark",
        sash="hem_fray", accent="cloth_dark", fray_mat="hem_fray",
        foot="skin_dark", coins="brass", sceptre=False, rings=0,
        pour=0, split=False, glint=None),
    "a3": _look(
        stiff=0.75, fold_gain=1.12, fray=0.65, height=1.870,
        hem_ridge="hem_fray", hem_fold="cloth_dark",
        robe_ridge="cloth_worn", robe_fold="brass",
        torso_ridge="ochre_cloth", torso_fold="brass",
        cowl="cloth_worn", cowl_fold="brass",
        void="cloth_dark", rim="hem_fray", jaw=None,
        sleeve="cloth_worn", forearm="gold", cuff="gold_dark",
        palm="gold", digit="gold", nail="gold_dark", hinge="gold_dark",
        sash="ochre_cloth", accent="cloth_dark", fray_mat="hem_fray",
        foot="skin_dark", coins="brass", sceptre=True, rings=1,
        pour=0, split=True, glint=None),
    "a4": _look(
        stiff=0.90, fold_gain=1.28, fray=0.00, height=1.960,
        hem_ridge="ochre_cloth", hem_fold="brass",
        robe_ridge="ochre_cloth", robe_fold="brass",
        torso_ridge="gold", torso_fold="gold_dark",
        cowl="gold", cowl_fold="gold_dark",
        void="purple_rich", rim="gold", jaw="gold",
        sleeve="ochre_cloth", forearm="gold", cuff="gold_dark",
        palm="gold", digit="gold", nail=None, hinge="gold_dark",
        sash="brass", accent="gold_dark", fray_mat=None,
        foot="gold_dark", coins="gold", sceptre=True, rings=2,
        pour=1, split=True, glint=None),
    "a5": _look(
        stiff=1.00, fold_gain=1.38, fray=0.00, height=2.080,
        hem_ridge="ochre_cloth", hem_fold="gold_dark",
        robe_ridge="ochre_cloth", robe_fold="gold_dark",
        torso_ridge="gold", torso_fold="gold_dark",
        cowl="gold", cowl_fold="gold_dark",
        void="purple_rich", rim="white_warm", jaw="gold",
        sleeve="ochre_cloth", forearm="gold", cuff="gold_dark",
        palm="gold", digit="gold", nail=None, hinge="gold_dark",
        sash="gold_dark", accent="gold_dark", fray_mat=None,
        foot=None, coins=None, sceptre=True, rings=3,
        pour=2, split=True, glint="white_warm"),
}

TIERS = ["base", "a1", "a2", "a3", "a4", "a5"]
