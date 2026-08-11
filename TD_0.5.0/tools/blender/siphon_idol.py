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
#   * an asymmetric, SWEPT LOBE -- 0.660 from the axis on the trailing bearing
#     (247 degrees, the same bearing the socle's VEIN_ROOT sits on) and 0.350 on
#     the open bearing (67 degrees, where the hands work). Those two numbers are
#     the socle's, and they mean the ground outline cannot be a circle at any
#     tier. `_sweep` then warps the bearing between them so the train CURLS: one
#     flank gathers thick and the other is drawn thin, which is what stops the
#     figure being symmetric about the train's own vertical plane.
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
# THE FOOTPRINT NEVER GROWS. `audit` re-measures the ground radius on every tier
# and `main` fails the build if any tier is wider than the base. All
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
#
# THE SHAFT IS HELD AT HIS SIDE AND IT IS OFF THE CENTRELINE. It used to run
# through the palm and out through his hip, because the ring is outboard of the
# hand and any straight line through both dives across the body -- the block
# above `_sceptre_axis` has the arithmetic and the warbringer's recorded lesson.
# It now hangs plumb under the ring, outside the cloth the whole way down, and
# `penetration` FAILS THE BUILD if any part of it is ever inside him, on any
# frame. That check is the second thing this file measures rather than trusts,
# and like the 360 test it is worth what it rejects: run it against the shaft it
# replaced and all three tiers are refused.
#
# IT MOVES, four frames, keyed on an empty. A slow settle, never a swing -- this
# tower channels a continuous beam. The shaft turns about the point where it
# meets the ring, so the head cannot leave the rim; the RINGS are not in the
# animated group at all, so the beam origin is structurally incapable of moving.
# WHAT THE TEST AT THE BOTTOM IS WORTH. Run against the thing the brief names as
# the lazy reflex -- a td.frustum robe with a td.ball on top -- it returns 1.000
# on both halves, because a surface of revolution really does give the identical
# outline from every bearing. These six bodies return 0.76-0.78 at a quarter
# turn and 0.70-0.71 mirrored. Three separate rebuilds were forced by it and by
# the contact sheets beside it: an oval plan that scored 0.88, a pair of bulges
# that cancelled across the train axis, and a cowl so wide it swallowed the
# shoulders into one unbroken cone. Each is recorded at the point it was fixed.
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
    # The ring stack, kept for `penetration`: a loft is a SHELL, and one AABB
    # round the whole of it is a slab of mostly air. Given the rings the check
    # can rebuild the solid wedge by wedge instead. See `_cloth_solids`.
    m.loft = rings
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
    m = s.add(td.Mesh(name, verts, faces, mat, parent))
    # A LID, not a volume. `penetration` skips these: a cap closes the end of a
    # loft whose interior the wedges already cover, so it would add nothing but
    # a wide flat AABB -- and the shoulder cap's AABB, being a 0.5-wide disc,
    # reaches far enough in y to collide with the a5 outer ring and report a hit
    # that is not there.
    m.is_lid = True
    return m


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
    (0.300, 0.002, 0.006, 0.398, 0.210, 0.062, 0.05, 0.45),
    (0.620, 0.006, 0.020, 0.288, 0.120, 0.050, 0.10, 0.16),
    (0.880, 0.010, 0.038, 0.200, 0.070, 0.040, 0.15, 0.00),
    (1.120, 0.014, 0.060, 0.190, 0.050, 0.032, 0.19, 0.00),
    (1.300, 0.018, 0.1156, 0.262, 0.044, 0.026, 0.22, 0.00),
]

# The shoulder shelf's own break, spent on the top two rings. It costs no
# triangles -- the loft already owns those vertices -- and it is the socle's
# +0.060 read directly off the shape of the cloth rather than off a pauldron
# bolted on to say it.
SHOULDER_SHARE = [0.0, 0.0, 0.0, 0.0, 0.35, 1.00]

# The cord, as two more rings standing proud of the robe. Built out of the same
# machinery so it inherits the lobe and the creases and cannot slide off a
# leaning body the way a horizontal band would.
SASH_RINGS = [
    (0.745, 0.007, 0.032, 0.264, 0.096, 0.026, 0.115, 0.0),
    (0.870, 0.009, 0.046, 0.230, 0.072, 0.024, 0.128, 0.0),
]


# How sharply the train gathers. This exponent is the difference between an EGG
# and a TRAIN. At 1.6 the plan was a smooth oval and the 360 test scored 0.88 --
# an oval projects to nearly the same width from every bearing, which is most of
# the way back to a revolution. At 3.2 the skirt sits near 0.38 over most of the
# turn and runs out to the socle's 0.660 only on the trailing bearing, so the
# cloth reads as something DRAGGED behind him and the outline finally depends on
# where you stand. Both socle endpoints are exact for any exponent.
LOBE_POWER = 2.2
LIFT_POWER = 2.1

# THE TRAIN SWEEPS. Cloth dragged behind a body does not fall evenly either side
# of the direction it is dragged in -- it curls. `_sweep` warps the bearing by
# an even function that vanishes at both ends of the lobe, so 247 still measures
# 0.660 and 67 still measures 0.350 EXACTLY, while everything between them is
# pushed round: one flank gathers thick and the other is drawn thin.
#
# This is what finally beat the mirror half of the 360 test. Any lobe of the
# form f(a - TRAIN) is symmetric about the train's own vertical plane, so the
# two views straight down that plane were near-identical to their own
# reflections however many local bulges were piled on. A sin^2 warp is not odd
# and not even about the axis, so no vertical plane reflects this body onto
# itself any more.
LOBE_SWEEP = 0.95


def _sweep(d):
    return d + LOBE_SWEEP * math.sin(d) ** 2


def _lobe(a):
    """-0.5 on the open bearing, +0.5 on the trailing bearing. Both exact."""
    return (0.5 + 0.5 * math.cos(_sweep(a - TRAIN_DIR))) ** LOBE_POWER - 0.5


def _hem_lift(a):
    """One panel on the ground, the other lifted clear. The brief's "one panel
    longer than the other", and the reason the hem outline is not even a
    symmetric oval."""
    return 0.235 * (0.5 - 0.5 * math.cos(_sweep(a - TRAIN_DIR))) ** LIFT_POWER


# LOCALISED SWELLINGS, and they are the single thing that made the 360 test
# pass. A lobe is a plan shape; these are VOLUMES, each aimed at one bearing and
# one height: cloth gathered on the trailing hip, the forward knee pushing
# through on the open side, a mantle bunched over the HIGH shoulder only, and
# the small of the back hollowed by the forward lean.
#
# The point of them is arithmetic. A mass at bearing B is broadside from B-90
# and edge-on from B, so it changes the outline of exactly one of any two views
# a quarter turn apart. Four of them at 205 / 44 / 350 / 268 leave no pair of
# quarter-turn views agreeing -- the first build, without these, scored 0.88 and
# was rejected by the test at the bottom of this file. They also cost nothing:
# the loft already owns the vertices, so this is shape for zero triangles.
#
# `BULGE_GAIN` is zero on ring 0, which is what keeps the hem exactly on the
# socle's 0.660 / 0.350 rather than approximately on it.
# None of these may sit at the mirror image of another ACROSS THE 247/67 AXIS,
# or they cancel: a pair straddling the train bearing rebuilds the very
# left/right symmetry the train's own lobe already has, and the mirror test
# catches it (0.88 before 268 was dropped and 150 added).
BULGES = [
    (205.0, 0.62, 0.100, 30.0, 0.30),      # gathered cloth, trailing hip
    (44.0, 0.44, 0.076, 26.0, 0.22),       # the forward knee, open side
    (350.0, 1.24, 0.070, 38.0, 0.18),      # mantle over the HIGH shoulder
    (150.0, 0.86, 0.078, 30.0, 0.26),      # cloth hitched on the -X flank
]
BULGE_GAIN = [0.0, 0.55, 1.00, 1.00, 1.00, 0.85]


def _bulge(a, z):
    total = 0.0
    for (deg, z0, amp, asig, zsig) in BULGES:
        d = (math.degrees(a) - deg + 180.0) % 360.0 - 180.0
        total += amp * math.exp(-(d / asig) ** 2) * math.exp(-((z - z0)
                                                               / zsig) ** 2)
    return total


# TRIED AND REJECTED, recorded so it is not tried again: turning the lobe's own
# bearing with height (247 at the hem swinging round to 313 at the shoulders).
# It reads well in the abstract and it made the 360 test WORSE at every scale
# tested -- quarter-turn 0.840 -> 0.890 at full strength -- because the upper
# body's mass then points away from the hem's and the two cancel into a rounder
# overall outline. The sweep above does the same job in the right place.


def _rings(table, fold_gain, fray, gain=None):
    out = []
    for k, (zb, cx, cy, rmid, lobe, fold, twist, lift) in enumerate(table):
        g = 1.0 if gain is None else gain[k]
        ring = []
        for i in range(NROBE):
            a = math.radians(FOLD_DEG[i]) + twist
            r = (rmid + lobe * _lobe(a) - fold * fold_gain * FOLD_D[i]
                 + g * _bulge(a, zb))
            z = zb + _hem_lift(a) * lift + HEM_JIT[i] * lift * fray
            if gain is not None:
                z += SHOULDER_RISE * SHOULDER_SHARE[k] * (0.5 + 0.5
                                                          * math.cos(a))
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

# The peak is at 205 and NOT at 247. A cowl whose mass sits on the train's own
# bearing is mirror-symmetric about that bearing, and the mirror half of the 360
# test reads it straight away -- it scored 0.88 that way. Peak 205, a second
# smaller swell at 320 and the deepest trough between them at 278: no axis
# through this table folds it onto itself.
HOOD_DEG = [0, 34, 72, 108, 140, 172, 205, 240, 278, 320]
# SIZED AGAINST THE SHOULDER SHELF, which is the whole lesson of the first
# build: at radius 0.24-0.30 the cowl was wider than the shoulders and the
# figure fused into one unbroken cone from hem to spike -- the exact failure the
# brief forbids, and the 360 test happily passed it because the OUTLINE still
# varied. It has to swell at the head and step IN at the neck: base 0.15-0.21
# under a 0.22-0.26 shoulder, widest at 1.420, then closing to the point.
HOOD_RINGS = [
    (1.246, 0.018, 0.112, 0.040,
     [0.128, 0.118, 0.110, 0.118, 0.132, 0.146, 0.158, 0.148, 0.128, 0.140]),
    (1.410, 0.024, 0.140, 0.014,
     [0.166, 0.150, 0.140, 0.150, 0.170, 0.188, 0.204, 0.190, 0.162, 0.180]),
    (1.570, 0.022, 0.152, 0.005,
     [0.140, 0.124, 0.112, 0.124, 0.144, 0.162, 0.178, 0.164, 0.134, 0.152]),
    (1.692, 0.014, 0.150, 0.000,
     [0.078, 0.064, 0.054, 0.064, 0.082, 0.098, 0.112, 0.100, 0.074, 0.090]),
]
HOOD_APEX = (0.030, 0.228, 1.790)          # the point OVERHANGS the face
HOOD_SHARE = [0.0, 0.10, 0.35, 0.62]       # how the +0.29 is spent up the cowl
HOOD_FOLD = [0.0, 0.9, 0.1, 0.0, 0.8, 0.2, 0.0, 0.9, 0.15, 0.6]
VOID_DEG = 62.0

# ---------------------------------------------------------------------------
# THE COWL WAS STILL A CONE, and the whole-model test could not see it.
#
# The table above varies the radius by bearing -- 0.110 to 0.158 on the bottom
# ring -- and that felt like enough. It is not. A 1.3:1 plan spread on a form
# that shrinks monotonically to a point IS a witch hat: at 55 px the eye reads
# the profile, and the profile was the same from every bearing. Measured, the
# cowl shell and its point ALONE scored 0.925 at a quarter turn and 0.870
# mirrored -- a fail on both counts against this file's own 0.85 / 0.88, and at
# a5 the worst of the six because `squeeze` narrows the head into an ever
# cleaner cone as he draws up.
#
# The whole-model test never caught it because the robe's train is most of the
# outline: siphon-a5 scored 0.75 / 0.71 with a cone sitting on top of it. So
# there is now a SECOND gate, `cowl_rotation_test`, run on the cowl in
# isolation. A part cannot hide inside a passing whole.
#
# Five things break it, and all five cost ZERO triangles -- they move vertices
# the loft already owns, the same trade BULGES makes on the robe:
#
#   * A CREST. A ridge of cloth running up the back of the hood, aimed at 205
#     and dying at 278, with a second smaller swell at 320. It climbs the rings
#     (CREST_Z) so it is nothing at the neck -- where the shoulder shelf must
#     stay wider, that is the recorded lesson -- and full at the two upper
#     rings, where there is no shoulder to fuse with. It rides OUTSIDE
#     `squeeze`, so as a5 draws the head in the crest stays: the spire becomes
#     a BLADE, thin from the front and deep from the side, not a needle.
#   * A SCOOP. The mouth bearings (34-108) are pulled in AND dropped in z, so
#     the brow overhangs a hollow instead of a plain cone face. The opening is
#     an event in the outline now, not a plate stuck on a smooth surface.
#   * A LEAN. The upper ring centres walk BACKWARD as the apex walks FORWARD,
#     so the fall is short and near-vertical down the face and long and raking
#     down the back. A cone falls the same on every side; this one does not.
#   * The POINT is taken OFF THE AXIS. It already overhung by 0.078; at a5 it
#     now overhangs the top ring's centre by 0.20 horizontally against 0.21 of
#     rise, which is a hooked tip, not an apex. APEX_DRAW is spent with `lift`,
#     so the hook is the tier arc: the hood draws up into a spire as he becomes
#     an idol, and it is a spire that LEANS.
#   * A SLUMP -- and this is the one that actually did the work. See below.
#
# TRIED AND REJECTED: widening the whole cowl to get the spread. That is the
# first build's failure verbatim -- the cowl swallowed the shoulders and the
# figure became one unbroken cone from hem to spike, which the 360 test happily
# passes because the OUTLINE still varies. The spread has to be local and it
# has to be above the shelf.
CREST_AMP = 0.105
HOOD_CREST = [0.08, 0.00, 0.00, 0.10, 0.42, 0.86, 1.00, 0.78, 0.22, 0.44]
CREST_Z = [0.06, 0.42, 1.00, 0.96]
HOOD_SCOOP = [0.30, 0.92, 1.00, 0.55, 0.08, 0.00, 0.00, 0.00, 0.00, 0.10]
SCOOP_R = [0.018, 0.040, 0.026, 0.008]
SCOOP_Z = [0.000, 0.062, 0.034, 0.000]
HOOD_LEAN = [(0.000, 0.000), (0.004, -0.012), (-0.014, -0.040),
             (-0.026, -0.070)]
APEX_DRAW = (0.052, 0.082)
LIFT_FULL = HEIGHT_A5 - HEIGHT_BASE        # 0.29, the socle's only growth

# THE SLUMP, and everything above it was not enough without this.
#
# A crest, a scoop, a lean and an off-axis point took the quarter turn from
# 0.925 to 0.812 -- but the MIRROR half only moved 0.907 -> 0.886, still a fail
# against 0.88. A hood built as "narrow at the face, deep at the back" is
# symmetric LEFT AND RIGHT by construction: the radius table above is near-even
# about the 71/251 axis (0.118 at both 34 and 108; 0.146 and 0.140 at 172 and
# 320), the scoop sits on 72, the crest on 205, and EVERY RING SHARES THAT
# PLANE. Piling more features onto the plan cannot help while they all share
# it -- see the two rejected attempts below, one of which is the obvious move.
#
# What removes the plane is making the cowl's own AXIS non-planar. A mirror
# plane has to contain the whole curve the ring centres describe; a curve that
# lies in no plane can be contained by none. HOOD_SLUMP walks the centres
# +X at the head, back through the middle and -X at the crown -- an S in plan,
# so the stack of centres is a skew curve, not a straight leaning line. It is
# always on, at every tier, because a cowl at base is cloth pulled over a head
# leaning 8 degrees forward and it should never have sat straight.
#
# Measured, on the cowl alone, base then a5:
#     crest+scoop+lean+point      0.812 / 0.886   0.698 / 0.767
#     + swellings, no slump       0.809 / 0.888   0.698 / 0.783
#     + slump, no swellings       0.754 / 0.793   0.655 / 0.682
#     + both (shipped)            0.746 / 0.785   0.656 / 0.687
HOOD_SLUMP = [(0.000, 0.000), (0.030, -0.004), (-0.006, 0.016),
              (-0.034, 0.000)]

# TRIED AND REJECTED, worth recording because it is the obvious move: DRIFTING
# the crest and the scoop round the head with height, the way the robe drifts
# its creases. It made every number WORSE (base mirror 0.886 -> 0.916, quarter
# 0.812 -> 0.848). Turning a profile does not remove a symmetry plane, it turns
# the plane; and swinging the deep back of the hood towards the flank rounded
# the plan out, which cost more than the drift bought.
#
# TRIED, KEPT, AND HONESTLY WORTH LITTLE: localised swellings, the robe's own
# BULGES machinery aimed at one bearing and one height. The ablation above is
# what they are worth on the numbers -- 0.008, i.e. nothing. They are kept
# because they are cloth bunched at the temple and a fold caught low on the
# other side, they cost zero triangles, and at close range that relief is the
# difference between cloth and a shell. They are NOT what broke the plane, and
# a later reader should not think they were.
HOOD_SWELL = [
    (150.0, 1.520, 0.050, 34.0, 0.170),    # cloth bunched on the -X temple
    (40.0, 1.330, 0.038, 28.0, 0.130),     # a fold gathered low on the +X side
    (352.0, 1.700, 0.026, 24.0, 0.120),    # a nick high on the +X shoulder
]


def _hood_swell(a, z):
    total = 0.0
    for (deg, z0, amp, asig, zsig) in HOOD_SWELL:
        d = (math.degrees(a) - deg + 180.0) % 360.0 - 180.0
        total += amp * math.exp(-(d / asig) ** 2) * math.exp(-((z - z0)
                                                               / zsig) ** 2)
    return total


def _hood_rings(lift):
    t = lift / LIFT_FULL                   # 0 at base, 1 at a5
    out = []
    for k, (zb, cx, cy, tilt, radii) in enumerate(HOOD_RINGS):
        squeeze = 1.0 - (0.26 if k == 3 else 0.10 if k == 2 else 0.0) * t
        sx, sy = HOOD_SLUMP[k]
        lx, ly = HOOD_LEAN[k]
        cx, cy = cx + sx + lx * t, cy + sy + ly * t
        ring = []
        for i in range(len(HOOD_DEG)):
            a = math.radians(HOOD_DEG[i])
            z = (zb + HOOD_SHARE[k] * lift
                 + tilt * (0.5 + 0.5 * math.cos(a))
                 - SCOOP_Z[k] * HOOD_SCOOP[i])
            r = (radii[i] * squeeze
                 + CREST_AMP * HOOD_CREST[i] * CREST_Z[k] * (1.0 + 0.30 * t)
                 - SCOOP_R[k] * HOOD_SCOOP[i]
                 + _hood_swell(a, z))
            ring.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
        out.append(ring)
    return out


def _hood_apex(lift):
    """The point. It is not over the cowl and it never was meant to be."""
    t = lift / LIFT_FULL
    return (HOOD_APEX[0] + APEX_DRAW[0] * t,
            HOOD_APEX[1] + APEX_DRAW[1] * t,
            HOOD_APEX[2] + lift)


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

SH_L = (0.246, 0.070, 1.300)
SH_R = (-0.238, 0.062, 1.240)              # SH_L.z - SH_R.z == SHOULDER_RISE
EL_L = (0.268, 0.116, 0.995)
EL_R = (-0.246, 0.128, 0.948)
WR_L = (0.214, 0.216, 1.008)
WR_R = (-0.142, 0.226, 1.000)

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
    ((0.180, 0.330, 1.038), (0.272, 0.392, 1.090)),
    ((0.148, 0.348, 1.042), (0.190, 0.432, 1.104)),
    ((0.112, 0.352, 1.044), (0.106, 0.440, 1.100)),
    ((0.080, 0.344, 1.040), (0.062, 0.418, 1.082)),
    ((0.092, 0.278, 1.030), (0.086, 0.262, 1.102)),
]
DIGITS_R = [
    ((0.020, 0.348, 1.048), (0.046, 0.428, 1.098)),
    ((-0.012, 0.360, 1.052), (-0.030, 0.450, 1.112)),
    ((-0.046, 0.356, 1.050), (-0.094, 0.440, 1.102)),
    ((-0.076, 0.340, 1.044), (-0.154, 0.408, 1.084)),
    ((0.016, 0.294, 1.036), (0.024, 0.278, 1.108)),
]

# ---------------------------------------------------------------------------
# THE SCEPTRE, A3+, AND WHY IT IS NOT ON THE LINE HAND -> RING.
#
# WHAT WAS WRONG, measured before anything moved. The shaft used to run from a
# butt at (-0.013, 0.178, 0.940) up THROUGH the welded palm to the ring, on the
# reasoning that "the hand is on the line of it". That butt is 0.137 from the
# robe's own axis at a height where the cloth is 0.171 out, so the bottom half
# of the shaft was inside the man: run the check below against that geometry and
# it rejects all three tiers with "shaft_0 in robe_torso", 0.011 deep after
# 0.020 of slack, i.e. 0.031 of raw overlap. In game it read exactly as the
# owner reported it -- the shaft left the ring, reached the hand and vanished
# into the cloth, so the sceptre was "hidden inside him".
#
# WHY IT COULD NOT BE NUDGED. This is geometry, not a bad number. RING is
# frozen at (0.315, 0.395, 1.190) and PALM_L is at (0.130, 0.298, 1.040): the
# ring is 0.185 OUTBOARD of the hand and only 0.150 above it. Any straight line
# through both, continued downward, therefore rakes hard back across the body --
# extend it and it is at x = -0.080 by z = 0.824 and x = -0.36 by z = 0.62,
# which is through his hip and out the far side. Every straight shaft that
# passes through the palm is inside him. Tilting it only picks which organ.
#
# This is tower_warbringer.py's recorded lesson arriving a second time. Its
# note on the A4/A5 rest pose says a two-handed weapon at rest belongs OFF the
# centreline, because on the model's own axis it will pass through the torso in
# some pose whatever the numbers say -- its first haft ran "from behind his
# shoulder to the ground in front at y = -0.02, which is straight through his
# chest and hips". `_SIDE` put that weapon out past the ribs. This is the same
# fix: the shaft comes off the centreline and stays off it.
#
# WHERE IT WENT. The shaft hangs nearly PLUMB under the ring instead, dropping
# from the ring's lower rim and raking out (+x) and back (-y) as it falls, so it
# is outboard of the cloth the whole way down -- worst clearance is reported by
# the build. The hand no longer has the shaft through it; the hand REACHES the
# shaft at the top, which is where his fingers already were: at a3 the index
# tip is at (0.293, 0.406, 1.136) and the shaft head is 0.060 away, closing to
# 0.052 by a5 as `stiff` straightens the finger into it. That gap is the weld,
# and the weld is modelled (`_weld`) because the brief makes the junction of
# petrified flesh and metal a requirement.
#
# THE RING DID NOT MOVE. RING stays exactly (0.315, 0.395, 1.190), the socle's
# frozen beam origin, asserted to 1e-6 by `audit` as it always was.
# siphon_origins.json is unchanged -- the beam lot needs no edit.
# ---------------------------------------------------------------------------

RING_MAJOR = 0.098                         # the inner ring; spec[0] in _sceptre
SCEPTRE_LEAN = (-0.090, 0.200, 0.976)      # up the shaft; normalised in _axis
SCEPTRE_DROP = 0.560                       # the butt hangs this far below it
SCEPTRE_SPLIT = 0.62                       # gold_dark below it, gold above


def _sceptre_axis():
    """(join, butt, up). `join` is ON the inner ring's circle, so the shaft
    meets the ring rather than floating under it, and it is also the pivot the
    attack sway turns about -- see SCEPTRE_SWAY."""
    up = _norm(SCEPTRE_LEAN)
    join = _add(RING, up, -RING_MAJOR)
    butt = _add(join, up, -SCEPTRE_DROP)
    return join, butt, up


def _digit_tip(root, tip, stiff):
    """Where a finger actually ends once `stiff` has straightened it. `_hand`
    and `_weld` both need this and they must agree, or the weld slides off the
    fingertip as the mineralisation climbs and the junction stops being one."""
    t = _add(root, (tip[0] - root[0], tip[1] - root[1], tip[2] - root[2]),
             1.0 + 0.30 * stiff)
    return (t[0], t[1], t[2] + 0.045 * stiff)


# ---------------------------------------------------------------------------
# THE ATTACK. Four frames, the house norm, keyed on an EMPTY -- geometry ships
# once in the group's local space and a frame is one 4x4, per td_mesh.build.
#
# THIS TOWER CHANNELS A CONTINUOUS BEAM, so there is no swing to animate and a
# swing would be a lie about the mechanic: nothing is thrown, nothing recoils,
# the thing just keeps pouring. What moves is a slow SETTLE of the shaft, the
# weight of the metal rocking while the current runs through it.
#
# TWO THINGS PIN THE MOTION, and between them they decide everything:
#
#   * THE RING IS THE BEAM ORIGIN. js/gl/siphon-beam-draw.js reads RING out of
#     siphon_origins.json, so if the ring moved the beam would come out of thin
#     air beside it. The rings are therefore NOT in the animated group at all --
#     they stay on `body` and are structurally incapable of moving. `audit`
#     fails the build if a ring ever lands in an animated group, which is a
#     stronger guarantee than a tolerance on a measured drift.
#   * THE BRIEF SAYS THE RING NEVER ROTATES -- the beam rotates inside it. Same
#     answer: leaving the rings out of the group satisfies both at once.
#
# So only the SHAFT and the WELD ride the group, and they turn about `join`, the
# point where the shaft meets the ring's rim. Pivoting there means the head of
# the shaft is the fixed point: it cannot part from the rim by construction, so
# the sceptre never visibly detaches from the ring or from the beam. The travel
# is all at the far end -- the butt swings, the head does not.
#
# The amplitude is chosen against the screen, not against taste. The figure is
# ~57 px for 1.79 units, i.e. 31.8 px per unit, and the butt is 0.560 below the
# pivot, so a peak of 0.106 rad (6.1 degrees) moves it about 0.059 units = 1.9
# px. Under a degree and it is not there at all; past ten and a hanging staff
# starts to read as a swing. `main` prints the measured butt travel so this is a
# number rather than an opinion.
ATTACK_FRAMES = 4
SCEPTRE_SWAY = [(0.000, 0.000),            # rest -- what a frame-less runtime
                (0.048, 0.026),            #         gets, so it must be right
                (0.106, 0.010),
                (0.052, -0.028)]           # (rx, ry) radians, about `join`


def _sceptre_pose(node, frame):
    """Turn the shaft about the join. A node's matrix is T(location)*R, i.e.
    R*p + location, so to spin about a pivot C the location has to carry
    C - R*C. Getting that wrong is what hangs a weapon a metre off the model."""
    rx, ry = SCEPTRE_SWAY[frame % len(SCEPTRE_SWAY)]
    pivot = _sceptre_axis()[0]
    node.rotation = [rx, ry, 0.0]
    spun = td.apply(td.trs((0, 0, 0), node.rotation), pivot)
    node.location = [pivot[k] - spun[k] for k in range(3)]


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


# ---------------------------------------------------------------------------
# THE BODY
# ---------------------------------------------------------------------------

def _robe(s, body, lk):
    """The loft that replaces the deleted cone. The bottom band takes the hem's
    own materials so the frayed edge sits a value ABOVE the cloth and reads as a
    lit lip; the two upper bands take the torso's, which is how A3 and A4 gild
    the chest without touching the skirt -- and the skirt stays the largest and
    darkest surface at every tier, per the socle's value rule."""
    rings = _rings(ROBE_RINGS, lk["fold_gain"], lk["fray"], BULGE_GAIN)
    _shell(s, "robe_hem", rings[0:2], lk["hem_ridge"], lk["hem_fold"], FOLD_D,
           body)
    _shell(s, "robe_skirt", rings[1:4], lk["robe_ridge"], lk["robe_fold"],
           FOLD_D, body)
    _shell(s, "robe_torso", rings[3:6], lk["torso_ridge"], lk["torso_fold"],
           FOLD_D, body)
    _cap(s, "robe_floor", rings[0], lk["hem_fold"], body, down=True)
    # The shoulder shelf is now WIDER than the cowl that sits in it, so the top
    # of the loft is a visible annulus from above and has to be closed.
    _cap(s, "shoulders", rings[5], lk["torso_fold"], body, down=False)

    sash = _rings(SASH_RINGS, lk["fold_gain"], 0.0)
    _shell(s, "sash", sash, lk["sash"], lk["robe_fold"], FOLD_D, body)
    # The knot and ONE hanging end, on the open side where they can be seen.
    knot = _lerp(sash[0][2], sash[1][2], 0.5)
    td.box(s, "sash_knot", (0.075, 0.062, 0.055), _add(knot, (0.012, 0.026, 0)),
           (0, 0, 1.0), lk["sash"], body)
    taper(s, "sash_end", _add(knot, (0.010, 0.022, -0.02)),
          _add(knot, (0.048, 0.040, -0.31)), 0.020, 0.012, lk["sash"], body, 4)
    return rings


def _hem_detail(s, body, lk, rings):
    """Frayed tags on the trailing side, and the coins A1 sews on. The tags go
    when the cloth stops falling at A4 -- that is the whole content of "statuary
    drapery" in the silhouette."""
    if lk["fray_mat"]:
        for n, i in enumerate((9, 11, 12, 13)):
            p = rings[0][i]
            taper(s, "fray_%d" % n, _add(p, (0, 0, 0.012)),
                  (p[0] * 1.03, p[1] * 1.03, p[2] - 0.020 - 0.018 * (n % 2)),
                  0.024, 0.009, lk["fray_mat"], body, 3)
    if lk["coins"]:
        for n, i in enumerate((3, 5, 8, 13)):
            p = _lerp(rings[0][i], rings[1][i], 0.17)
            a = math.atan2(p[1], p[0])
            td.cyl(s, "coin_%d" % n, 0.030 - 0.004 * (n % 2), 0.012,
                   (p[0] + math.cos(a) * 0.010, p[1] + math.sin(a) * 0.010,
                    p[2]), (0.0, math.pi / 2, a), lk["coins"], body, 6)


def _accents(s, body, lk, rings):
    """Two creases pulled proud of the loft. The shell's own crease table does
    the reading at distance; these give the cloth relief close up, and at A4
    they are the carved ridges of a statue rather than folds in a fabric."""
    for n, (i, k0, k1) in enumerate(((2, 4, 1), (6, 4, 0))):
        a = rings[k0][i]
        b = rings[k1][i]
        a = (a[0] * 1.02, a[1] * 1.02, a[2])
        b = (b[0] * 1.01, b[1] * 1.01, b[2] + 0.03)
        taper(s, "accent_%d" % n, a, b, 0.022, 0.030 + 0.012 * n,
              lk["accent"], body, 4)
    if lk["glint"]:
        for n, i in enumerate((0, 10)):
            a = rings[4][i]
            b = rings[2][i]
            taper(s, "glint_%d" % n, (a[0] * 1.03, a[1] * 1.03, a[2]),
                  (b[0] * 1.02, b[1] * 1.02, b[2]), 0.012, 0.016,
                  lk["glint"], body, 4)


def _cowl_shell(s, body, lk):
    """The cowl's own closed surface: the loft and the point it closes to, and
    nothing else. It is separated out because it is the thing that has to stand
    up to `cowl_rotation_test` ALONE -- the chute and the lip plates below are
    real geometry and they do move the outline, but a cowl that only passes
    with them attached is still a cone with decoration on it, which is exactly
    how a cone got past the whole-model test."""
    lift = lk["height"] - HEIGHT_BASE
    rings = _hood_rings(lift)
    _shell(s, "cowl", rings, lk["cowl"], lk["cowl_fold"], HOOD_FOLD, body)

    # The point. A fan onto a single apex vertex -- not a dome, not a ball, and
    # NOT over the middle of the ring it springs from.
    apex = _hood_apex(lift)
    top = rings[-1]
    verts = [apex] + list(top)
    faces = [(0, 1 + i, 1 + (i + 1) % len(top)) for i in range(len(top))]
    s.add(td.Mesh("cowl_point", verts, faces, lk["cowl"], body))
    return rings, lift


def _cowl(s, body, lk):
    """A point, a fall and an off-centre opening -- the brief's three
    requirements, and none of them survives a revolution. The bottom ring
    carries the shoulder break; the point is carried OFF the axis by APEX_DRAW,
    so at a5 it overhangs the top ring's centre by 0.20 against 0.21 of rise;
    the fall down the back is the crest plus the chute; the opening sits at 62
    degrees while the cowl's own narrowest bearing is 72."""
    rings, lift = _cowl_shell(s, body, lk)

    # The chute: cloth falling off the point down the back, two segments so it
    # bends. It is the single biggest thing keeping the rear silhouette from
    # matching the front one.
    # PANELS, not rods. Built as tapers first, the fall came out as a horn
    # standing off the back of the skull; cloth has to be WIDE ACROSS and THIN
    # THROUGH or it reads as hardware at any distance.
    # AND IT HAS TO TOUCH THE COWL. At y = -0.110 the top of the fall cleared
    # the back of the hood by about 0.09, and from a quarter turn that gap read
    # as a dark plank propped up behind the head -- the contact sheet showed a
    # stick, not cloth. The panel now starts INSIDE the cowl shell and only its
    # lower half is in open air, so the fall is attached at the point it falls
    # from. The rear silhouette it buys is unchanged; the join is what moved.
    plate(s, "chute_0", (-0.012, -0.022, 1.448 + lift * 0.40),
          (-0.30, -0.95, 0.0), (0.038, 0.164, 0.300), lk["cowl"], body,
          pitch=-0.46)
    plate(s, "chute_1", (-0.092, -0.168, 1.238), (-0.40, -0.92, 0.0),
          (0.032, 0.128, 0.255), lk["cowl_fold"], body, pitch=-0.32)

    # THE OPENING. Darkness, never a face. Pushed a hair proud of the surface so
    # a closed loft can still read as a hole, with a lit lip standing further
    # proud below it -- lip in front, void behind, and the eye fills in a hood.
    face = _hood_surface(rings, VOID_DEG, 0.62)
    look = (math.cos(math.radians(VOID_DEG)), math.sin(math.radians(VOID_DEG)),
            0.0)
    # SIZED TO BE SEEN. At 0.128 x 0.116 the opening was four pixels on a 57 px
    # figure, and on the poor tiers -- where it is cloth_dark on cloth_worn and
    # not purple on gold -- it vanished completely: base, a1, a2 and a3 all read
    # as a blank cone with no face at all, which is the one thing a hood must
    # not do. A hood's mouth is most of the front of the hood, so it is sized
    # like one. The value break is the palette's darkest against its largest
    # surface, and it is the only thing carrying "there is a head in there".
    plate(s, "hood_void", _add(face, look, 0.012), look,
          (0.032, 0.168, 0.152), lk["void"], body, pitch=0.34)
    for n, (deg, t) in enumerate(((22.0, 0.20), (62.0, 0.13), (102.0, 0.22))):
        p = _hood_surface(rings, deg, t)
        lo = (math.cos(math.radians(deg)), math.sin(math.radians(deg)), 0.0)
        plate(s, "hood_lip_%d" % n, _add(p, lo, 0.020), lo,
              (0.030, 0.098, 0.042), lk["rim"], body, pitch=0.52)
    # A4 gilds the LOWER FACE only. Still no eyes, still no face -- a jaw
    # emerging from the shadow is the whole of it.
    if lk["jaw"]:
        p = _hood_surface(rings, VOID_DEG, 0.36)
        plate(s, "lower_face", _add(p, look, 0.016), look,
              (0.026, 0.086, 0.046), lk["jaw"], body, pitch=0.30)


def _arms(s, body, lk):
    """Sleeves, and the two of them are not the same length. The right one is
    split from A3 -- the gilding has burst it."""
    for tag, sh, el, wr, palm, drape in (
            ("l", SH_L, EL_L, WR_L, PALM_L, 0.35),
            ("r", SH_R, EL_R, WR_R, PALM_R, 0.14)):
        taper(s, "upper_" + tag, sh, el, 0.098, 0.074, lk["sleeve"], body, 5)
        taper(s, "fore_" + tag, el, wr, 0.070, 0.052, lk["forearm"], body, 5)
        taper(s, "cuff_" + tag, wr, _lerp(wr, palm, 0.40), 0.058, 0.044,
              lk["cuff"], body, 5)
        hang = _lerp(sh, el, 0.72)
        if tag == "r" and lk["split"]:
            for n, dz in ((0, 0.0), (1, -0.06)):
                td.box(s, "drape_r_%d" % n, (0.090, 0.052, drape * 0.62),
                       (hang[0] - 0.030 + 0.052 * n, hang[1] - 0.020,
                        hang[2] - drape * 0.34 + dz), (0, 0, -0.22),
                       lk["cuff"], body)
        else:
            td.box(s, "drape_" + tag, (0.115, 0.068, drape),
                   (hang[0] + (0.018 if tag == "l" else -0.018),
                    hang[1] - 0.014, hang[2] - drape * 0.52),
                   (0, 0, 0.16 if tag == "l" else -0.22), lk["cuff"], body)


def _hand(s, body, lk, tag, palm, rot, digits):
    """Palm UP, fingers SPREAD. `stiff` straightens and lifts the digits as the
    mineralisation climbs -- he closes his hands less and less well, and by A4
    they do not close at all. It never moves the palm centre, so HANDS stays
    exactly where the socle put it."""
    stiff = lk["stiff"]
    m = td.box(s, "palm_" + tag, (0.128, 0.118, 0.034), palm, rot, lk["palm"],
               body)
    roots = []
    for n, (root, tip) in enumerate(digits):
        t = _digit_tip(root, tip, stiff)
        thumb = n == 4
        taper(s, "digit_%s%d" % (tag, n), root, t,
              0.025 if thumb else 0.020, 0.017 if thumb else 0.013,
              lk["digit"], body, 4)
        if lk["nail"]:
            td.ball(s, "nail_%s%d" % (tag, n), 0.014, t, lk["nail"], body, 4, 2)
        roots.append(root)
    # A2: the knuckles are HINGES. A barrel across the knuckle line and a strap
    # over the back of the hand -- the joint has become hardware.
    if lk["hinge"]:
        td.tube(s, "hinge_" + tag, 0.016, roots[0], roots[3], lk["hinge"],
                body, 5)
        td.box(s, "hinge_plate_" + tag, (0.088, 0.070, 0.020),
               _add(palm, (0, 0.030, -0.026)), rot, lk["hinge"], body)
    return m


def _weld(s, arm, lk):
    """THE JUNCTION, and the brief makes it a requirement: he does not hold the
    sceptre, the gold hand is WELDED to it, and the seam of petrified flesh and
    metal has to be visible or the tier says nothing.

    It sits where the hand and the metal actually meet, which is NOT the palm.
    The block above _sceptre_axis has the arithmetic: the palm is 0.185 inboard
    of the ring, the shaft hangs plumb under the ring, and the nearest the hand
    ever comes to the metal is his index FINGERTIP against the shaft head just
    below the rim. So the weld is built there and it is built as a bridge -- a
    torn lip of flesh drawn out of the fingertip, a bead of run metal in the
    seam, and a collar clamped round the shaft -- rather than as three pieces
    floating near each other. It rides the animated group with the shaft; being
    0.058 from the pivot it travels under a tenth of a millimetre, so the weld
    stays welded through the sway."""
    join, butt, up = _sceptre_axis()
    tip = _digit_tip(DIGITS_L[0][0], DIGITS_L[0][1], lk["stiff"])
    collar = _add(join, up, -0.058)
    seam = _mid(tip, collar)
    along, _n = _axis(tip, collar)         # +Z runs flesh -> metal
    shaft_rot, _n = _axis(butt, join)
    made = [
        td.box(s, "weld_collar", (0.060, 0.056, 0.052), collar, shaft_rot,
               "gold_dark", arm),
        td.box(s, "weld_lip", (0.044, 0.030, 0.062), _lerp(tip, seam, 0.45),
               along, lk["palm"], arm),
        td.box(s, "weld_bead", (0.032, 0.028, 0.030), seam, along, "amber",
               arm),
    ]
    return made


def _sceptre(s, body, arm, lk):
    """NOT a weapon and NOT a point: a HOLLOW RING on a shaft, echoing the
    cupped hands it replaces. The rings are concentric on the socle's RING and
    deliberately MISALIGNED -- A4 adds the second, A5 the third.

    WHAT RIDES WHAT. The shaft and the weld go on `arm`, the animated group, so
    they can settle while he channels. The RINGS go on `body` and do not move:
    the ring is the beam origin and the brief says it never rotates -- the beam
    rotates inside it. Keeping them out of the group is what makes both true by
    construction rather than by a tolerance.

    Every piece here is marked `is_weapon`, which is how `penetration` below
    tells the sceptre from the man."""
    join, butt, up = _sceptre_axis()
    split = _add(butt, up, SCEPTRE_DROP * SCEPTRE_SPLIT)
    shaft = [
        taper(s, "shaft_0", butt, split, 0.021, 0.025, "gold_dark", arm, 5),
        taper(s, "shaft_1", split, join, 0.025, 0.020, "gold", arm, 5),
    ]
    for m in shaft + _weld(s, arm, lk):
        m.is_weapon = True
    spec = (
        (RING_MAJOR, 0.020, (math.pi / 2 - 0.14, 0.10, 0.0), "gold"),
        (0.140, 0.015, (math.pi / 2 + 0.06, -0.17, 0.0), "brass"),
        (0.178, 0.012, (math.pi / 2 - 0.28, 0.22, 0.0),
         lk["glint"] or "gold_dark"),
    )
    made = []
    for n in range(lk["rings"]):
        major, minor, rot, mat = spec[n]
        m = td.torus(s, "ring_%d" % n, major, minor, RING, rot, mat, body, 8, 3)
        m.is_weapon = True
        made.append(m)
    return made


def _foot(s, body, lk):
    """One bare foot under the short panel. It is the cheapest thing on the
    model and it does most of the "poor and human" work -- and it is the first
    thing the gold takes.

    IT NEEDS AN ANKLE. The open side of the hem is lifted 0.235 clear of the
    ground, which is the whole point of the asymmetric hem -- but a foot alone
    under that gap has 0.18 of empty air above it and reads, in the contact
    sheet, as a loose brick lying on the tile beside the tower. The shin closes
    the gap: it starts inside the foot and ends inside the cloth, so the eye
    joins the two and the lifted hem becomes a leg showing rather than a hole."""
    if not lk["foot"]:
        return
    td.box(s, "foot", (0.098, 0.140, 0.052), (0.118, 0.222, 0.030),
           (0, 0, -0.24), lk["foot"], body)
    taper(s, "ankle", (0.112, 0.206, 0.040), (0.096, 0.170, 0.268),
          0.038, 0.030, lk["foot"], body, 4)


# --- the ground: the gold pour, world_fixed ---------------------------------

POUR_DEG = [0, 38, 74, 118, 152, 190, 228, 262, 300, 338]
POUR_R = [0.300, 0.262, 0.218, 0.196, 0.250, 0.308, 0.272, 0.208, 0.240, 0.288]
POUR_FOLD = [0.0, 0.8, 0.1, 0.0, 0.9, 0.2, 0.0, 0.7, 0.1, 0.4]


def _pour(s, fixed, lk):
    """A DECAL, not a volume: the metal that has run out of him and set. It is
    world_fixed, because a puddle does not swivel when he looks somewhere else,
    and it is measured against the 15 u.l. footprint so it can never widen the
    tower. A5 freezes it into a plinth -- a second, smaller step on the first,
    still inside the same outline."""
    if not lk["pour"]:
        return
    steps = [(0.008, 1.00), (0.052, 0.70)]
    if lk["pour"] > 1:
        steps.append((0.104, 0.44))
    rings = []
    for (z, scale) in steps:
        rings.append([(POUR_ROOT[0] + math.cos(math.radians(POUR_DEG[i]))
                       * POUR_R[i] * scale,
                       POUR_ROOT[1] + math.sin(math.radians(POUR_DEG[i]))
                       * POUR_R[i] * scale, z)
                      for i in range(len(POUR_DEG))])
    _shell(s, "pour", rings, "gold", "gold_dark", POUR_FOLD, fixed)
    _cap(s, "pour_top", [(p[0], p[1], steps[-1][0] + 0.006) for p in rings[-1]],
         "brass" if lk["pour"] < 2 else "amber", fixed, down=False)
    # Runnels: where it came from. Two, uneven, on the open side.
    for n, (deg, up) in enumerate(((96.0, 0.30), (152.0, 0.21))):
        a = math.radians(deg)
        edge = (POUR_ROOT[0] + math.cos(a) * 0.20,
                POUR_ROOT[1] + math.sin(a) * 0.20, 0.03)
        taper(s, "runnel_%d" % n, edge, (edge[0] * 0.86, edge[1] * 0.86, up),
              0.026, 0.014, "amber", fixed, 4)
    if lk["pour"] > 1:
        for n, deg in enumerate((14.0, 214.0)):
            a = math.radians(deg)
            td.box(s, "plinth_slab_%d" % n, (0.150, 0.100, 0.070),
                   (POUR_ROOT[0] + math.cos(a) * 0.19,
                    POUR_ROOT[1] + math.sin(a) * 0.19, 0.052), (0, 0, a),
                   "gold_dark", fixed)


# ---------------------------------------------------------------------------

def build_body(tier, flat):
    lk = LOOKS[tier]
    s = td.Scene(palette(flat))
    root = s.node("root")
    fixed = s.node("world_fixed", parent=root, world_fixed=True)
    body = s.node("body", parent=root)
    # The animated empty exists only where there is a sceptre to move. base, a1
    # and a2 keep building exactly the frame-less models they always did.
    arm = (s.node("sceptre", parent=root, animated=True)
           if lk["sceptre"] else None)

    rings = _robe(s, body, lk)
    _hem_detail(s, body, lk, rings)
    _accents(s, body, lk, rings)
    _foot(s, body, lk)
    _arms(s, body, lk)
    pl = _hand(s, body, lk, "l", PALM_L, PALM_ROT_L, DIGITS_L)
    pr = _hand(s, body, lk, "r", PALM_R, PALM_ROT_R, DIGITS_R)
    _cowl(s, body, lk)
    made = _sceptre(s, body, arm, lk) if lk["sceptre"] else []
    _pour(s, fixed, lk)

    def pose(frame):
        if arm is not None:
            _sceptre_pose(arm, frame)

    frames = ATTACK_FRAMES if arm is not None else 0
    pen = penetration(s, pose, frames or 1)
    gap = clearance(s, pose, frames or 1) if made else None
    model = td.build(s, "siphon-" + tier, frames=frames,
                     pose=pose if frames else None)

    origins = {"HANDS": _mid(_mean(pl), _mean(pr))}
    if made:
        origins["RING"] = _mean(made[0])
    return model, s, origins, (pen, gap)


# ---------------------------------------------------------------------------
# IS THE SCEPTRE INSIDE HIM? Ported from tower_warbringer.py's `penetration`.
#
# THE REASON THAT CHECK EXISTS, in its own words: its first version compared
# VERTEX to VERTEX and was worthless, because two boxes interpenetrate happily
# with their corners far apart -- it reported a comfortable 10 mm of clearance
# while a haft ran through a man's chest. Distance between vertices is not
# distance between solids. So it tests solids as BOXES, per part, per frame, and
# fails the build on overlap. That is what is ported here, and it is what turned
# "the shaft looks like it might be in the robe" into 0.034.
#
# TWO THINGS HAD TO CHANGE ON THE WAY OVER, and both are about shape. The
# warbringer is built out of compact primitives, so a box round each part is a
# fair likeness of it. Neither solid here is compact:
#
#   * THE ROBE IS A LOFT, not a primitive. One AABB round it is a 1.3-wide slab
#     of mostly air and would fail a sceptre held cleanly at arm's length. So
#     the cloth is decomposed into one box per (band, sample) WEDGE, each
#     spanning from the two ring centroids out to its own quad. The wedge lies
#     inside the convex hull of those six points, so its AABB CONTAINS it: the
#     cover is an over-estimate of the cloth and never an under-estimate, which
#     is the direction a safety gate has to err in. A pass is a real pass.
#   * THE SHAFT IS A LONG DIAGONAL ROD, and its own AABB is mostly air too --
#     the identical blunder pointing the other way, which reports a hit that is
#     not there. Measured: the shaft's whole-mesh box misses the skirt's band-1
#     wedges by 0.004, which is luck, not clearance. So each weapon face is cut
#     into 4x4 patches before it is boxed. It costs no triangles; the
#     subdivision exists only in this check.
#
# EXCLUDED, AND ONLY THIS: the left hand -- palm, digits, nails, the A2 hinge.
# The brief has the gold hand WELDED to the metal, so the hand and the weld are
# SUPPOSED to occupy the same space, and a check that failed on them would be
# measuring the requirement rather than the defect. Nothing else is exempt:
# cloth, cowl, arms, sleeves, sash, coins, foot and the gold pour are all off
# limits to the sceptre, and so is the RIGHT hand, which has no business
# touching it.
# ---------------------------------------------------------------------------

_TOUCHABLE = ("palm_l", "digit_l", "nail_l", "hinge_l", "hinge_plate_l")

PEN_SLACK = 0.020                          # touching is fine, sinking in is not
PEN_PATCH = 4                              # weapon faces cut PATCH x PATCH


def _aabb(points):
    return ([min(p[k] for p in points) for k in range(3)],
            [max(p[k] for p in points) for k in range(3)])


def _cloth_solids(mesh, matrix):
    """A loft, wedge by wedge. Each box holds one quad of the shell plus the
    centroids of the two rings it spans -- that is the solid slice of cloth
    behind that quad, and boxing its six corners can only over-state it."""
    rings = mesh.loft
    out = []
    for k in range(len(rings) - 1):
        lo_r, hi_r = rings[k], rings[k + 1]
        n = len(lo_r)
        pair = []
        for ring in (lo_r, hi_r):
            c = tuple(sum(p[a] for p in ring) / n for a in range(3))
            pair.append(td.apply(matrix, c) if matrix else c)
        for i in range(n):
            j = (i + 1) % n
            pts = [lo_r[i], lo_r[j], hi_r[i], hi_r[j]]
            if matrix:
                pts = [td.apply(matrix, p) for p in pts]
            out.append(("%s[%d,%d]" % (mesh.name, k, i), _aabb(pts + pair)))
    return out


def _patch_boxes(mesh, matrix):
    """The weapon side, face by face, each face cut into PATCH x PATCH. Every
    face on the sceptre is planar, so bilinear interpolation of its corners
    stays on the face and the patch AABBs cover it.

    FAN FIRST, and this was a bug in the first version of this function. A
    frustum's end caps are n-gons -- `taper(..., verts=5)` gives pentagons --
    and reading four corners off a pentagon quietly drops the region near the
    fifth, which means the check could MISS a penetration. Under-covering the
    weapon is the one error this whole file cannot afford, so anything that is
    not a quad is fanned into triangles and each triangle is covered as a
    degenerate quad."""
    verts = [td.apply(matrix, v) for v in mesh.verts] if matrix else mesh.verts
    k = PEN_PATCH
    out = []
    for face in mesh.faces:
        p = [verts[i] for i in face]
        quads = [p] if len(p) == 4 else [
            [p[0], p[t], p[t + 1], p[t + 1]] for t in range(1, len(p) - 1)]
        for q in quads:
            for a in range(k):
                for b in range(k):
                    corners = []
                    for (du, dv) in ((0, 0), (1, 0), (1, 1), (0, 1)):
                        u, v = (a + du) / k, (b + dv) / k
                        corners.append(_lerp(_lerp(q[0], q[1], u),
                                             _lerp(q[3], q[2], u), v))
                    out.append(_aabb(corners))
    return out


def penetration(scene, pose, frames):
    """Worst (depth, who) per frame. Zero means the sceptre is outside him."""
    weapon = [m for m in scene.meshes if getattr(m, "is_weapon", False)]
    body = [m for m in scene.meshes
            if not getattr(m, "is_weapon", False)
            and not getattr(m, "is_lid", False)
            and not any(k in m.name for k in _TOUCHABLE)]
    out = []
    for f in range(frames):
        pose(f)
        mats = {}
        for m in scene.meshes:
            key = id(m.parent)
            if key not in mats:
                mats[key] = m.parent.matrix_world() if m.parent else None
        # The sceptre group's rest matrix is the identity (SCEPTRE_SWAY[0] is
        # all zeros), so a mesh's authored world verts pushed through the node's
        # current matrix land where that frame actually draws them.
        solids = []
        for b in body:
            mx = mats[id(b.parent)]
            if getattr(b, "loft", None):
                solids.extend(_cloth_solids(b, mx))
            else:
                pts = [td.apply(mx, v) for v in b.verts] if mx else b.verts
                solids.append((b.name, _aabb(pts)))
        worst, who = 0.0, ""
        for m in weapon:
            mx = mats[id(m.parent)]
            pts = [td.apply(mx, v) for v in m.verts] if mx else m.verts
            coarse = _aabb(pts)
            fine = None
            for name, bb in solids:
                # Cheap reject on the whole part first; only the handful of
                # solids that survive it pay for the subdivision.
                if td.overlap(coarse, bb, PEN_SLACK) <= 0.0:
                    continue
                if fine is None:
                    fine = _patch_boxes(m, mx)
                for fb in fine:
                    d = td.overlap(fb, bb, PEN_SLACK)
                    if d > worst:
                        worst, who = d, m.name + " in " + name
        out.append((worst, who))
    pose(0)
    return out


def clearance(scene, pose, frames):
    """How much AIR is between the shaft and the cloth at its tightest, over
    every frame. `penetration` proves the sceptre is not inside him; this says
    whether it reads as CLEAR of him, which is the actual brief -- held at his
    side, not grazing the robe. Measured between patch boxes and cloth wedges,
    so it is the same decomposition and the two numbers are comparable."""
    weapon = [m for m in scene.meshes if getattr(m, "is_weapon", False)]
    cloth = [m for m in scene.meshes
             if getattr(m, "loft", None) and not getattr(m, "is_lid", False)]
    best = 1e9
    for f in range(frames):
        pose(f)
        mats = {}
        for m in scene.meshes:
            key = id(m.parent)
            if key not in mats:
                mats[key] = m.parent.matrix_world() if m.parent else None
        solids = []
        for b in cloth:
            solids.extend(_cloth_solids(b, mats[id(b.parent)]))
        for m in weapon:
            if not m.name.startswith("shaft"):
                continue
            for fb in _patch_boxes(m, mats[id(m.parent)]):
                for _name, bb in solids:
                    gap = max(max(fb[0][k] - bb[1][k], bb[0][k] - fb[1][k])
                              for k in range(3))
                    best = min(best, gap)
    pose(0)
    return best


# ---------------------------------------------------------------------------
# THE 360 DEGREE TEST, run rather than remembered.
#
# The brief: "rotate the model through 360 degrees. If two angles 90 degrees
# apart give the same silhouette, it has failed -- rebuild it." A surface of
# revolution scores 1.00 here at every pair, because that is exactly what a
# surface of revolution IS. So the test rasterises the turning group's outline
# at 36 yaws under a HORIZONTAL orthographic camera -- the strictest case, no
# perspective and no elevation to hide behind -- and reports the worst
# intersection-over-union between any two views a quarter turn apart. A second
# pass runs at the game's own 35 degree elevation, and a third mirrors each view
# to check the left/right asymmetry the socle demands.
#
# Only the group that TURNS is tested. The gold pour is world_fixed; it does not
# rotate with the tower, so including it would flatter the score.
# ---------------------------------------------------------------------------

GRID_W, GRID_H = 88, 120
YAWS = 36                                  # 10 degree steps; 90 lands exactly
QUARTER = YAWS // 4
IOU_QUARTER_MAX = 0.85
IOU_MIRROR_MAX = 0.88


def _group_tris(model, group=""):
    pos = model["positions"]
    first, count = 0, len(pos) // 3
    for g in model["groups"]:
        if g["name"] == group:
            first, count = g["first"], g["count"]
            break
    out = []
    for t in range(count // 3):
        v = first + t * 3
        out.append(tuple((pos[(v + k) * 3], pos[(v + k) * 3 + 1],
                          pos[(v + k) * 3 + 2]) for k in range(3)))
    return out


def _fill(grid, p0, p1, p2):
    pts = sorted((p0, p1, p2), key=lambda p: p[1])
    (x0, y0), (x1, y1), (x2, y2) = pts
    for (px, py) in pts:                   # never lose a sliver entirely
        ix, iy = int(px), int(py)
        if 0 <= ix < GRID_W and 0 <= iy < GRID_H:
            grid[iy * GRID_W + ix] = 1
    if y2 - y0 < 1e-9:
        return
    for y in range(max(0, int(y0)), min(GRID_H - 1, int(y2) + 1) + 1):
        yc = y + 0.5
        if yc < y0 or yc > y2:
            continue
        xa = x0 + (x2 - x0) * (yc - y0) / (y2 - y0)
        if yc < y1:
            xb = x1 if y1 - y0 < 1e-9 else x0 + (x1 - x0) * (yc - y0) / (y1 - y0)
        else:
            xb = x1 if y2 - y1 < 1e-9 else x1 + (x2 - x1) * (yc - y1) / (y2 - y1)
        lo, hi = (xa, xb) if xa <= xb else (xb, xa)
        i0 = max(0, int(math.ceil(lo - 0.5)))
        i1 = min(GRID_W - 1, int(math.floor(hi - 0.5)))
        row = y * GRID_W
        for x in range(i0, i1 + 1):
            grid[row + x] = 1


def _silhouettes(tris, elev_deg):
    """One binary outline per yaw, all projected with the SAME fixed scale so
    the comparison between two of them means something."""
    rad = max((math.hypot(p[0], p[1]) for tri in tris for p in tri), default=1.0)
    ztop = max((p[2] for tri in tris for p in tri), default=1.0)
    zbot = min((p[2] for tri in tris for p in tri), default=0.0)
    e = math.radians(elev_deg)
    sx = (GRID_W - 4) / (2.0 * rad * 1.02)
    sy = (GRID_H - 4) / max(1e-6, (ztop - zbot) * math.cos(e)
                            + 2.0 * rad * math.sin(e) * 1.02)
    scale = min(sx, sy)
    out = []
    for k in range(YAWS):
        phi = math.tau * k / YAWS
        ca, sa = math.cos(phi), math.sin(phi)
        grid = bytearray(GRID_W * GRID_H)
        for tri in tris:
            flat = []
            for p in tri:
                u = -sa * p[0] + ca * p[1]
                w = ca * p[0] + sa * p[1]
                v = -math.sin(e) * w + math.cos(e) * p[2]
                flat.append((GRID_W * 0.5 + u * scale,
                             GRID_H - 2.0 - (v - zbot * math.cos(e)) * scale))
            _fill(grid, flat[0], flat[1], flat[2])
        out.append(grid)
    return out


def _iou(a, b):
    inter = union = 0
    for i in range(GRID_W * GRID_H):
        x, y = a[i], b[i]
        if x or y:
            union += 1
            if x and y:
                inter += 1
    return (inter / union) if union else 1.0


def _mirror(g):
    m = bytearray(GRID_W * GRID_H)
    for y in range(GRID_H):
        row = y * GRID_W
        for x in range(GRID_W):
            if g[row + x]:
                m[row + (GRID_W - 1 - x)] = 1
    return m


def rotation_test(model):
    """Returns (worst quarter-turn IoU, worst mirror IoU, passed)."""
    tris = _group_tris(model, "")
    worst_q = 0.0
    worst_m = 0.0
    for elev in (0.0, 35.0):
        sil = _silhouettes(tris, elev)
        for k in range(YAWS):
            worst_q = max(worst_q, _iou(sil[k], sil[(k + QUARTER) % YAWS]))
            worst_m = max(worst_m, _iou(sil[k], _mirror(sil[k])))
    return worst_q, worst_m, (worst_q < IOU_QUARTER_MAX
                              and worst_m < IOU_MIRROR_MAX)


# THE SECOND GATE, and it exists because the first one was not enough.
#
# The whole-model test above is dominated by the robe: the train is most of the
# outline from most bearings, so siphon-a5 scored a comfortable 0.75 / 0.71
# while the thing sitting on top of the shoulders was, measured on its own,
# 0.925 / 0.870 -- a cone. At close range the cowl IS the read, and "the whole
# passes" is not an answer to "that part is a witch hat".
#
# So every part big enough to carry the silhouette on its own gets tested on
# its own. This one runs the identical rasteriser and the identical thresholds
# over the cowl shell and its point, with the chute, the lip and the void
# removed -- decoration must not be able to launder the form underneath it.
def cowl_rotation_test(tier, flat=False):
    lk = LOOKS[tier]
    s = td.Scene(palette(flat))
    _cowl_shell(s, s.node("body", parent=s.node("root")), lk)
    return rotation_test(td.build(s, "siphon-cowl-" + tier))


# --- the socle's other invariants, also checked rather than trusted ----------

def _extent(model, group=None):
    pos = model["positions"]
    first, count = 0, len(pos) // 3
    if group is not None:
        for g in model["groups"]:
            if g["name"] == group:
                first, count = g["first"], g["count"]
                break
        else:
            return None
    lo, hi = [1e9] * 3, [-1e9] * 3
    rad = 0.0
    for v in range(first, first + count):
        p = (pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])
        rad = max(rad, math.hypot(p[0], p[1]))
        for k in range(3):
            lo[k] = min(lo[k], p[k])
            hi[k] = max(hi[k], p[k])
    return lo, hi, rad


def _audit_sceptre(tier, model, scene, pen):
    """The three things the sceptre can silently break, all checked rather than
    trusted: it must not be inside him on ANY frame, the ring must be incapable
    of moving, and the shaft head must stay on the ring."""
    worst, who = max(pen, key=lambda p: p[0])
    if worst > 0.0:
        raise SystemExit(
            "siphon-%s: the sceptre is INSIDE HIM by %.4f -- %s. Boxes, per "
            "frame, per part; this is the check tower_warbringer.py added "
            "after a vertex-to-vertex version reported 10 mm of clearance "
            "round a haft that ran through a man's chest. Move the shaft OFF "
            "the centreline, do not soften PEN_SLACK." % (tier, worst, who))

    # THE RING IS THE BEAM ORIGIN, read out of siphon_origins.json by
    # js/gl/siphon-beam-draw.js. If a ring ever picked up an animated ancestor
    # a pose could move it, and the beam would leave from empty air beside it.
    # Asked of the scene graph, because that is where the answer lives -- the
    # flattened model has already thrown the parent chain away.
    for m in scene.meshes:
        if not m.name.startswith("ring_"):
            continue
        node = m.parent
        while node is not None:
            if node.animated:
                raise SystemExit(
                    "siphon-%s: %s hangs off the animated node '%s'. The ring "
                    "is the frozen beam origin and the brief says it never "
                    "rotates -- only the shaft below it may move."
                    % (tier, m.name, node.name))
            node = node.parent

    names = [g["name"] for g in model["groups"]]
    if "sceptre" not in names:
        raise SystemExit("siphon-%s has a sceptre but no animated group for it"
                         % tier)
    if len(model["frames"]) != ATTACK_FRAMES:
        raise SystemExit("siphon-%s shipped %d frames, not %d"
                         % (tier, len(model["frames"]), ATTACK_FRAMES))

    # Where every frame actually puts the shaft head and the butt. The head is
    # the pivot, so its travel is a float-rounding artefact and nothing else;
    # the butt's travel is the animation, and it is printed rather than claimed.
    join, butt, _up = _sceptre_axis()
    gi = names.index("sceptre")
    head, tail = 0.0, 0.0
    for frame in model["frames"]:
        m = frame[gi]
        if m is None:
            raise SystemExit("siphon-%s: sceptre group has no matrix" % tier)
        mm = [[m[c * 4 + r] for c in range(4)] for r in range(4)]
        head = max(head, math.dist(td.apply(mm, join), join))
        tail = max(tail, math.dist(td.apply(mm, butt), butt))
    if head > 1e-4:
        raise SystemExit("siphon-%s: the shaft head moves %.5f off the ring "
                         "rim -- it must pivot AT the join or it detaches from "
                         "the beam" % (tier, head))
    if tail < 0.020:
        raise SystemExit("siphon-%s: the sceptre travels %.4f, which is under "
                         "a pixel at 31.8 px/unit -- the owner asked for it to "
                         "move a bit while attacking" % (tier, tail))
    return head, tail


def audit(tier, model, origins):
    lk = LOOKS[tier]
    lo, hi, rad = _extent(model)

    if abs(hi[2] - lk["height"]) > 0.006:
        raise SystemExit("siphon-%s tops out at %.3f, not %.3f"
                         % (tier, hi[2], lk["height"]))
    if rad > HEM_TRAIN + 1e-3:
        raise SystemExit("siphon-%s ground radius %.3f exceeds the socle's %.3f"
                         % (tier, rad, HEM_TRAIN))
    fixed = _extent(model, td.WORLD_FIXED_GROUP)
    if fixed and fixed[2] > FOOTPRINT_R + 1e-6:
        raise SystemExit("siphon-%s ground furniture reaches %.3f, past the "
                         "%.1f u.l. footprint radius %.3f"
                         % (tier, fixed[2], FOOTPRINT_UL, FOOTPRINT_R))
    want = HANDS if not lk["sceptre"] else None
    got = origins["HANDS"]
    if want and max(abs(got[k] - want[k]) for k in range(3)) > 1e-6:
        raise SystemExit("siphon-%s built HANDS at %s, socle says %s"
                         % (tier, got, want))
    if lk["sceptre"]:
        got = origins["RING"]
        if max(abs(got[k] - RING[k]) for k in range(3)) > 1e-6:
            raise SystemExit("siphon-%s built RING at %s, socle says %s"
                             % (tier, got, RING))
    if not (700 <= model["triangles"] <= 1100):
        raise SystemExit("siphon-%s is %d triangles, outside 700-1100"
                         % (tier, model["triangles"]))
    return lo, hi, rad


def audit_socle():
    """The numbers the socle fixes, verified against the tables above before a
    single triangle is emitted."""
    hem_train = ROBE_RINGS[0][3] + ROBE_RINGS[0][4] * _lobe(TRAIN_DIR)
    hem_open = ROBE_RINGS[0][3] + ROBE_RINGS[0][4] * _lobe(OPEN_DIR)
    if abs(hem_train - HEM_TRAIN) > 1e-6 or abs(hem_open - HEM_OPEN) > 1e-6:
        raise SystemExit("hem profile is %.4f / %.4f, socle says %.3f / %.3f"
                         % (hem_train, hem_open, HEM_TRAIN, HEM_OPEN))
    rise = SH_L[2] - SH_R[2]
    if abs(rise - SHOULDER_RISE) > 1e-6:
        raise SystemExit("shoulder break is %.3f, socle says %.3f"
                         % (rise, SHOULDER_RISE))
    dz = ROBE_RINGS[5][0] - ROBE_RINGS[2][0]
    dy = ROBE_RINGS[5][2] - ROBE_RINGS[2][2]
    tilt = math.degrees(math.atan2(dy, dz))
    if abs(tilt - TORSO_TILT_DEG) > 0.15:
        raise SystemExit("torso tilt is %.2f degrees, socle says %.1f"
                         % (tilt, TORSO_TILT_DEG))
    mid = _mid(PALM_L, PALM_R)
    if max(abs(mid[k] - HANDS[k]) for k in range(3)) > 1e-9:
        raise SystemExit("the palms straddle %s, socle says %s" % (mid, HANDS))
    if abs(LOOKS["a5"]["height"] - HEIGHT_A5) > 1e-9:
        raise SystemExit("A5 is not %.2f tall" % HEIGHT_A5)
    return hem_train, hem_open, tilt


def _fmt(p):
    return "%.3f %.3f %.3f" % tuple(p)


def main():
    flat = "--silhouette" in sys.argv
    print("building the SIPHON idol (%s)" % ("SILHOUETTE" if flat else "full"))
    hem_train, hem_open, tilt = audit_socle()
    print("  socle: hem %.3f (train %d deg) / %.3f (open %d deg), tilt %.2f "
          "deg, shoulder +%.3f"
          % (hem_train, round(math.degrees(TRAIN_DIR)), hem_open,
             round(math.degrees(OPEN_DIR)) % 360, tilt, SHOULDER_RISE))

    total = 0
    base_rad = None
    exported = {}
    print("  %-12s %5s %6s %6s  %-7s %-7s  %-7s %-7s %-6s %-6s %s"
          % ("model", "tris", "height", "radius", "quarter", "mirror",
             "cowl q", "cowl m", "in-him", "gap", "360"))
    sceptre_rows = []
    for tier in TIERS:
        model, scene, origins, (pen, gap) = build_body(tier, flat)
        lo, hi, rad = audit(tier, model, origins)
        if LOOKS[tier]["sceptre"]:
            head, tail = _audit_sceptre(tier, model, scene, pen)
            sceptre_rows.append((tier, gap, head, tail))
        if base_rad is None:
            base_rad = rad
        elif rad > base_rad + 1e-6:
            raise SystemExit("siphon-%s widened the ground from %.3f to %.3f"
                             % (tier, base_rad, rad))
        q, m, ok = rotation_test(model)
        if not ok:
            raise SystemExit("siphon-%s FAILED the 360 test: quarter %.2f, "
                             "mirror %.2f -- it is a surface of revolution, "
                             "rebuild it" % (tier, q, m))
        cq, cm, cok = cowl_rotation_test(tier, flat)
        if not cok:
            raise SystemExit("siphon-%s COWL FAILED the 360 test on its own: "
                             "quarter %.2f, mirror %.2f -- the model passes "
                             "and the head is still a cone, rebuild the cowl"
                             % (tier, cq, cm))
        td.write_js(model, "siphon-%s.js" % tier)
        total += model["triangles"]
        exported[tier] = ("RING" if LOOKS[tier]["sceptre"] else "HANDS",
                          origins["RING"] if LOOKS[tier]["sceptre"]
                          else origins["HANDS"])
        worst = max(p[0] for p in pen)
        print("  siphon-%-5s %5d %6.3f %6.3f  %-7.2f %-7.2f  %-7.2f %-7.2f "
              "%-6.3f %-6s %s"
              % (tier, model["triangles"], hi[2], rad, q, m, cq, cm, worst,
                 "%.3f" % gap if gap is not None else "-", "PASS"))

    print("  %d models, %d triangles total" % (len(TIERS), total))
    print("  footprint %.1f u.l. = radius %.4f, IDENTICAL at every tier; the "
          "only growth is %.3f -> %.3f in HEIGHT"
          % (FOOTPRINT_UL, FOOTPRINT_R, HEIGHT_BASE, HEIGHT_A5))
    print("  360 test: %d yaws x 2 elevations (0 and 35 deg), worst IoU at a "
          "quarter turn must stay under %.2f (a cone scores 1.00)"
          % (YAWS, IOU_QUARTER_MAX))
    print("  the same test is run a SECOND time on the cowl shell and its "
          "point ALONE, because the robe's train was hiding a witch hat: the "
          "a5 cowl measured 0.925 / 0.870 on its own while siphon-a5 as a "
          "whole measured 0.75 / 0.71")

    if sceptre_rows:
        join, butt, _up = _sceptre_axis()
        print("  THE SCEPTRE is held at his side, and 'in-him' above is the "
              "proof: weapon solids against body solids AS BOXES, %d frames, "
              "%.3f of slack. Zero on every tier. Run the same check against "
              "the shaft this replaced and it rejects all three: 'shaft_0 in "
              "robe_torso', 0.011 deep." % (ATTACK_FRAMES, PEN_SLACK))
        print("    shaft  butt %s -> join %s, %.3f long, off the centreline "
              "the whole way" % (_fmt(butt), _fmt(join), SCEPTRE_DROP))
        for (tier, gap, head, tail) in sceptre_rows:
            print("      siphon-%-5s clear of the cloth by %.3f (%.1f px at "
                  "%.1f px/unit); butt travels %.3f, head %.6f"
                  % (tier, gap, gap * PX_PER_UNIT, PX_PER_UNIT, tail, head))
        print("    the head is the pivot, so it CANNOT leave the ring's rim, "
              "and the rings are not in the animated group at all -- the ring "
              "never rotates and the beam origin never moves.")

    print("  BEAM ORIGINS, measured off the built geometry -- the beam lot "
          "READS these, it never retypes them:")
    print("    HANDS  base a1 a2   %s   (socle %s)" % (_fmt(HANDS), _fmt(HANDS)))
    print("    RING   a3 a4 a5     %s   (socle %s)" % (_fmt(RING), _fmt(RING)))
    for tier in TIERS:
        name, p = exported[tier]
        print("      siphon-%-5s -> %-5s %s" % (tier, name, _fmt(p)))

    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "siphon_origins.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump({
            "_": "GENERATED by tools/blender/siphon_idol.py -- do not edit.",
            "socle": {"HANDS": list(HANDS), "RING": list(RING),
                      "POUR_ROOT": list(POUR_ROOT),
                      "VEIN_ROOT": list(VEIN_ROOT),
                      "footprintUl": FOOTPRINT_UL,
                      "footprintRadius": round(FOOTPRINT_R, 4)},
            "origins": dict((t, {"name": exported[t][0],
                                 "point": [round(v, 4)
                                           for v in exported[t][1]],
                                 "height": LOOKS[t]["height"]})
                            for t in TIERS),
        }, handle, indent=2)
    print("  wrote %s" % path)


if __name__ == "__main__":
    main()
