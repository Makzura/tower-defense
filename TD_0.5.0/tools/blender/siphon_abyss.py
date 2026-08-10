# ---------------------------------------------------------------------------
# LOT L2 -- THE SIPHON, VOIE B: L'ABIME. Five bodies, b1 .. b5.
#
#   python tools/blender/siphon_abyss.py                 build everything
#   python tools/blender/siphon_abyss.py --silhouette    build PASS 1 forms
#
# PASS 1 vs PASS 2 exactly as summoner_figure.py does it: every solid carries
# its real material name from the first line and `--silhouette` swaps the whole
# palette for one flat grey, so shape is judged first and colour is a palette
# change rather than a rebuild.
#
# ---------------------------------------------------------------------------
# THE ONE RULE THIS FILE EXISTS TO OBEY: NO SURFACE OF REVOLUTION.
#
# The brief, section 2: "Aucune partie du modele ne doit etre generable par
# simple revolution autour de l'axe vertical." A previous Siphon was deleted
# because its robe was a `td.frustum` -- a cone -- and a cone gives the same
# silhouette from all 360 degrees.
#
# So THE BODY IS NOT A PRIMITIVE. It is a LOFT: a stack of rings whose radius
# is a function r(theta, z), stitched into quads by `_loft`. That one decision
# buys every requirement at once, because each of them is a term in r():
#
#   * ASYMMETRIC FOOTPRINT -- `hem_unit` is a train shape, 0.66 from the axis
#     on the long side and 0.35 on the short one, the two numbers the socle
#     freezes. It is not a circle and it is not even mirror-symmetric about its
#     own long axis, because the ripple term is multiplied by sin(u).
#   * BROKEN VERTICAL AXIS -- `axis(z)` returns a MOVING centre, not (0,0). The
#     torso leans 8 degrees forward above the waist, the hip sits off to -x.
#   * UNEVEN SHOULDERS -- `zwarp(theta, z)` lifts the ring by +0.030 at +x and
#     drops it -0.030 at -x, so the left shoulder is exactly +0.06 higher, and
#     the top ring is a tilted ellipse rather than a horizontal circle.
#   * ORIENTED FOLDS -- `fold(theta, z)` carries a phase that MIGRATES WITH
#     HEIGHT (`+1.5*z`, `-1.1*z`), so the crests run diagonally across the
#     cloth instead of stacking into vertical flutes. Its amplitude is largest
#     on the train and near zero across the front, which is what a garment
#     pulled to one side actually does.
#   * THE HOOD IS NOT A SPHERE -- it is its own loft with a point that leans
#     BACKWARD, a fall hanging off that point, a brow that juts, and a real
#     hole in the front (an open arc, not a dark decal) whose centre is 11
#     degrees off the facing before the hood's own yaw is added.
#
# The 360-degree test is not a promise, it is `rotation_test()` below: every
# body is rasterised into a silhouette at 24 yaws and every pair 90 degrees
# apart is scored by intersection-over-union. A cone scores 1.00. main() prints
# the number and refuses to finish if it is too high.
#
# ---------------------------------------------------------------------------
# THE FOOTPRINT NEVER GROWS. Game footprint is 15 u.l. at every tier. The hem
# is 0.66 / 0.35 at b1 and 0.66 / 0.35 at b5; `audit()` asserts the maximum
# horizontal radius of the whole model is identical across all five. ALL the
# growth is HEIGHT, applied by `lift()`, which is zero at the hem by
# construction so the ground plan cannot move whatever the tier does.
#
# AND THE HEIGHT CLIMBS ONE TIER AT A TIME. The socle fixes two numbers, 1.790
# at the base and 2.080 at b5, and nothing in between. The first build spent
# the whole 0.29 in a single step at b5 and stood 1.790 / 1.791 / 1.792 /
# 1.792 / 2.081 -- four tiers a millimetre apart and then a jump, which is
# exactly the "saut brutal entre deux paliers" revue 2 asks about. `HEIGHT`
# below spends it over the last three tiers instead, on voie A's own schedule
# (+0.08, +0.09, +0.12), so a player upgrading sees the figure lengthen every
# time from b3 on rather than four times nothing and then a lurch.
#
# ---------------------------------------------------------------------------
# PATH B IS THE INVERSE TRAJECTORY. He does not harden, he OPENS.
#
#   b1  the hood is turned 16 degrees off the shoulders and tipped BACK while
#       the torso leans forward. It did not turn with him. Inside it there are
#       TWO shadows, and the second one is not concentric with the first.
#   b2  an EXTRA JOINT under the left sleeve -- three segments where an arm has
#       two, and the sleeve is thicker over the joint that should not be there.
#       Two places where the cloth is pushed TAUT from inside: `push()` raises
#       the radius and kills the fold amplitude in the same breath, which is
#       what stretched cloth does.
#   b3  the robe opens at the chest. Inside: no anatomy and no gore -- five
#       identical lamellae, evenly spaced, receding into the dark, with one
#       rose bead behind them. It is manufactured, and it is calm.
#   b4  the face is a luminous opening. The hands are gone and TENDONS come out
#       of the SLEEVES, not the wrists -- they exit through the fabric above
#       the empty cuff. Each has three joints, which is one too many.
#   b5  only the robe and what inhabits it. Barely moves: the hood has almost
#       stopped lagging, and three tendons have SETTLED onto the ground at
#       exactly 50 degrees apart. The regularity is the thing that is wrong.
#
# DISTURBING WITHOUT UGLY. No gore, no viscera, no repulsive texture anywhere
# in this file. The levers are all anatomy-of-movement: one joint too many, a
# hood half a beat late, spacing that is too even, and rose light that is the
# only living thing in the palette. If any of it reads as merely disgusting it
# has failed the brief, so the escalation is carried by ARRANGEMENT.
#
# GEOMETRY IS AUTHORED IN WORLD SPACE (see td_mesh.build). `parent` picks the
# animated / world-fixed group, it is NOT a second transform, so every number
# below is a real position on the finished model.
#
# THE BEAM ORIGIN IS `HANDS` AT EVERY TIER ON THIS PATH -- the sceptre is voie
# A and never appears here. The socle's point is the VOID BETWEEN THE PALMS,
# so `audit()` checks that geometry brackets it and that nothing occupies it.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_mesh as td                                          # noqa: E402

PX_PER_UNIT = 20.0 * 1.529 * 1.04          # td_mesh.UNITS_TO_PX


def R(footprint_ul):
    """A unit's ground radius, in Blender units."""
    return footprint_ul / PX_PER_UNIT


# --- the socle's frozen numbers, quoted and never re-derived ----------------

FOOTPRINT_UL = 15.0                  # fixed at every tier, per beam.config.js
GROUND_R = R(FOOTPRINT_UL)           # 0.4717
HEIGHT_BASE = 1.79                   # the socle's base, and b1 / b2
HEIGHT_TOP = 2.08                    # the socle's other end, at b5

# THE LADDER BETWEEN THE TWO. The socle pins the ends and says nothing about
# the middle, so the middle is a choice -- and the choice is voie A's, because
# the tiers of one tower have to read as the same tower getting taller whichever
# path the player took. A climbs 1.790 -> 1.870 -> 1.960 -> 2.080 from a3; B
# climbs on the same steps, +0.080, +0.090, +0.120.
#
# It is the same total growth as before, 0.29, and it is still entirely
# VERTICAL: every one of these numbers goes through `lift()`, which is zero
# below z 0.35, so the hem, the ground plan and the 15 u.l. footprint are
# untouched at every tier. Nothing here widens anything.
HEIGHT = {"b1": 1.790, "b2": 1.790, "b3": 1.870, "b4": 1.960, "b5": 2.080}

# The ladder is checked against the socle here rather than trusted, because the
# two things a ramp can get wrong are both cheap to test: it can leave the
# socle's endpoints, and it can go backwards.
_RUNGS = [HEIGHT[t] for t in ("b1", "b2", "b3", "b4", "b5")]
if _RUNGS[0] != HEIGHT_BASE or _RUNGS[-1] != HEIGHT_TOP:
    raise SystemExit("the ladder runs %.3f -> %.3f, the socle says %.2f -> %.2f"
                     % (_RUNGS[0], _RUNGS[-1], HEIGHT_BASE, HEIGHT_TOP))
if any(b < a for a, b in zip(_RUNGS, _RUNGS[1:])):
    raise SystemExit("the ladder goes backwards: %s" % _RUNGS)

HEM_LONG = 0.66                      # the train, from the axis
HEM_SHORT = 0.35                     # the open side, from the axis
SHOULDER_LIFT = 0.06                 # left shoulder above right
TORSO_TILT = math.radians(8.0)       # forward, above the waist

HANDS = (0.055, 0.305, 1.045)        # beam origin, ALL of voie B
VEIN_ROOT = (-0.12, -0.28, 0.02)     # the ground vein leaves from B3 on

# Which way the train lies. 247 degrees is chosen, not rounded to 270: an axis
# at 270 would leave the hem mirror-symmetric across x, and section 2 asks for
# the silhouette to be asymmetric left/right as well as front/back.
TRAIN = math.radians(247.0)


# --- palettes ---------------------------------------------------------------
# Verbatim from the socle. Nothing from voie A is present, so a slip toward the
# idol's gold is a KeyError at build time rather than a review note.
PALETTE = {
    # BASE -- pauvre, terne, humain. He is still a man at b1 and b2.
    "cloth_worn":  ("#6B6355", 0.0),
    "cloth_dark":  ("#4A453C", 0.0),
    "hem_fray":    ("#7D735F", 0.0),
    "skin":        ("#B08A66", 0.0),
    "skin_dark":   ("#8A6A4C", 0.0),
    # VOIE B -- l'abime.
    "abyss":       ("#2A1B3D", 0.0),
    "oil_black":   ("#14101C", 0.0),
    "membrane":    ("#4A4250", 0.0),
    "rose_sick":   ("#E86FA8", 0.70),
    "rose_dim":    ("#7A3A5C", 0.30),
    "tendon":      ("#6B5570", 0.0),
}

SILHOUETTE = dict((k, ("#9AA0A8", 0.0)) for k in PALETTE)

HUMAN = ("skin", "skin_dark")
BRIGHT_ROSE = ("rose_sick",)


def palette(flat):
    return SILHOUETTE if flat else PALETTE


# --- small maths ------------------------------------------------------------

def _clamp(x, a=0.0, b=1.0):
    return a if x < a else (b if x > b else x)


def _smooth(t):
    t = _clamp(t)
    return t * t * (3.0 - 2.0 * t)


def _lerp(a, b, t):
    return a + (b - a) * t


def _lerp3(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def _norm(v):
    n = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) or 1e-9
    return (v[0] / n, v[1] / n, v[2] / n)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _scale(v, k):
    return (v[0] * k, v[1] * k, v[2] * k)


def _angdiff(a, b):
    return (a - b + math.pi) % math.tau - math.pi


def _centroid(pts):
    n = float(len(pts))
    return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n,
            sum(p[2] for p in pts) / n)


def _table(table, z):
    """Piecewise-linear lookup on a sorted (z, value) table."""
    if z <= table[0][0]:
        return table[0][1]
    for i in range(1, len(table)):
        if z <= table[i][0]:
            z0, v0 = table[i - 1]
            z1, v1 = table[i]
            return _lerp(v0, v1, (z - z0) / (z1 - z0))
    return table[-1][1]


def _table3(table, z):
    if z <= table[0][0]:
        return table[0][1]
    for i in range(1, len(table)):
        if z <= table[i][0]:
            z0, v0 = table[i - 1]
            z1, v1 = table[i]
            t = (z - z0) / (z1 - z0)
            return (_lerp(v0[0], v1[0], t), _lerp(v0[1], v1[1], t))
    return table[-1][1]


# --- the loft: the only thing the body is made of ---------------------------

def _loft(s, name, rings, mat, parent, closed=True, cap_bottom=None,
          cap_top=None, face_mat=None, cap_bottom_up=False):
    """Stitch a stack of equal-length rings into a shell.

    This is `td_mesh`'s own `Mesh` with quads written by hand rather than one
    of the canned primitives, and that is the point: every canned primitive in
    the vocabulary that could stand in for a robe -- cyl, frustum, ball -- is a
    surface of revolution, which section 2 forbids for the body. The export
    contract is untouched: build() fan-triangulates each quad and gives every
    triangle its own normal, so a slightly non-planar quad costs nothing.

    `face_mat(band, column)` shades a single quad, which is how the folds get
    their value break without a second mesh.
    """
    n = len(rings[0])
    verts = []
    for ring in rings:
        verts.extend(ring)
    faces, mats = [], []
    cols = n if closed else n - 1
    for b in range(len(rings) - 1):
        a0, b0 = b * n, (b + 1) * n
        for c in range(cols):
            d = (c + 1) % n
            faces.append((a0 + c, a0 + d, b0 + d, b0 + c))
            mats.append((face_mat(b, c) if face_mat else None) or mat)
    if cap_bottom and closed:
        ci = len(verts)
        verts.append(_centroid(rings[0]))
        for c in range(n):
            # THE ROBE'S FLOOR FACES UP. The game culls back faces and its
            # camera is always above, so a disc under the hem with a downward
            # normal is not a floor, it is a hole -- and the hem is lifted 0.105
            # at the front precisely so you can see in there.
            faces.append((ci, c, (c + 1) % n) if cap_bottom_up
                         else (ci, (c + 1) % n, c))
            mats.append(cap_bottom)
    if cap_top and closed:
        base = (len(rings) - 1) * n
        ci = len(verts)
        verts.append(_centroid(rings[-1]))
        for c in range(n):
            faces.append((ci, base + c, base + (c + 1) % n))
            mats.append(cap_top)
    m = s.add(td.Mesh(name, verts, faces, mat, parent))
    m.face_mats = mats
    return m


def _path_loft(s, name, pts, radii, mat, parent, seg=6, sx=1.0, sy=1.0,
               wrinkle=0.0, phase=0.0, cap=True, face_mat=None):
    """A tube swept along a polyline, elliptical in section.

    Sleeves and tendons are the same call. The section is deliberately NOT
    circular (`sx` != `sy`) and can carry a wrinkle, so even the limbs fail the
    revolution test on their own.
    """
    tan = []
    for i in range(len(pts)):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        tan.append(_norm(_sub(b, a)))
    avg = _norm((sum(t[0] for t in tan), sum(t[1] for t in tan),
                 sum(t[2] for t in tan)))
    up = (0.0, 0.0, 1.0)
    if abs(avg[2]) > 0.86:
        up = (0.0, 1.0, 0.0)
    rings = []
    for i, c in enumerate(pts):
        t = tan[i]
        n1 = _norm(_cross(t, up))
        n2 = _norm(_cross(t, n1))
        ring = []
        for k in range(seg):
            a = math.tau * k / seg
            r = radii[i] * (1.0 + wrinkle * math.cos(3.0 * a + phase + i * 0.7))
            ring.append(_add(c, _add(_scale(n1, math.cos(a) * r * sx),
                                     _scale(n2, math.sin(a) * r * sy))))
        rings.append(ring)
    return _loft(s, name, rings, mat, parent, True,
                 cap_bottom=(mat if cap else None),
                 cap_top=(mat if cap else None), face_mat=face_mat)


# ---------------------------------------------------------------------------
# THE BODY SURFACE. Everything below is a term of r(theta, z); see the header.
# ---------------------------------------------------------------------------

def _hem_raw(th):
    """The hem outline in polar form, and every term of it is load-bearing.

    THE TWO SOCLE NUMBERS SURVIVE EXACTLY, by construction and not by fitting.
    The lobes are multiplied by sin(u), which is zero at the train (u = 0) and
    zero straight opposite it (u = pi), so `0.505 + 0.155 cos u` alone decides
    those two directions: 0.660 on the train and 0.350 on the open side.

    THE PHASES ARE CHOSEN SO THE LOBE SUM IS ~ZERO AT u = 0. A first version
    used round phases, the lobes came in with a positive slope at the train,
    and the widest point of the hem slid 43 degrees off it -- which then forced
    a normaliser that shrank the lobes to 6% of themselves and left an outline
    that was very nearly an offset circle. With c(0) = -0.006 the maximum stays
    where the socle put it and the lobes keep their full amplitude.

    THEY ARE DELIBERATELY NOT AN EVEN FUNCTION OF u. Pure sin(u)*sin(nu) terms
    would have solved the slope problem too, but every one of them is even in
    u, which would make the hem mirror-symmetric about its own long axis. The
    cosine phases keep an odd component: the two flanks of the train come out
    0.345 and 0.382, so they are not the same shape as each other.

    THE sin^2 TERM IS WHAT MAKES IT A TRAIN RATHER THAN A SKIRT. It is zero at
    u = 0 and at u = pi as well, so it cannot touch the socle's numbers either,
    and it pulls both flanks in. Without it the flanks sat at 0.39 and 0.43,
    the plan view was a wide oval, and the figure read as a tent.
    """
    u = th - TRAIN
    return (0.505 + 0.155 * math.cos(u) - 0.045 * math.sin(u) ** 2
            + math.sin(u) * (0.085 * math.cos(2.0 * u + 1.35)
                             + 0.062 * math.cos(3.0 * u - 1.90)
                             + 0.038 * math.cos(5.0 * u + 1.70)))


def _top_raw(th):
    # THE cos(th) TERM IS THE ONLY ODD ONE UNDER x -> -x, so it alone decides
    # how differently the two shoulders read, and it is 0.130 rather than the
    # 0.070 it was built with. Every term here integrates to zero over the
    # circle whatever its coefficient, so TOP_MEAN stays exactly 1 and the
    # width table below still means what it says -- this cost nothing anywhere
    # else in the file, which is why it is the second lever the mirror gate
    # was answered with rather than the first.
    return (1.0 + 0.150 * math.cos(2.0 * th) + 0.130 * math.cos(th)
            + 0.060 * math.sin(3.0 * th + 0.80) - 0.050 * math.sin(th))


HEM_PEAK = max(_hem_raw(math.tau * i / 1440.0) for i in range(1440))
if abs(HEM_PEAK - HEM_LONG) > 0.002:
    raise SystemExit("the hem's widest point is %.4f, not the socle's %.2f"
                     % (HEM_PEAK, HEM_LONG))

# BOTH OUTLINES ARE NORMALISED TO MEAN 1, and this is not tidiness.
#
# `body_radius` blends the hem outline into the shoulder outline as it climbs.
# Un-normalised, the hem's flank read 0.63 of its own scale and the shoulder's
# flank read 1.20 of its own, so blending between them made the robe get WIDER
# across as it went UP -- the skirt pinched at the ground and swelled at the
# waist, and no width table could fix it because the width table was not the
# thing doing it. With both profiles at mean 1, WIDTH is a true mean radius per
# height and the taper is exactly the numbers in that table and nothing else.
#
# The socle's hem survives anyway: the mean of `_hem_raw` is 0.4825 in closed
# form (every cos and every sin*cos term integrates to zero, leaving 0.505 less
# half the sin^2 coefficient), so WIDTH's first entry IS that mean and the ring
# comes out at 0.660 on the train and 0.350 in front by construction.
HEM_MEAN = 0.505 - 0.045 * 0.5
TOP_MEAN = 1.0


def hem_unit(th):
    return _hem_raw(th) / HEM_MEAN


def top_unit(th):
    """The shoulder outline. Wide across x (cos 2th), and pushed off centre by
    terms that are ODD under x -> -x, so the two shoulders are not the same
    width -- the left one reaches 0.271 and the right one 0.200."""
    return _top_raw(th) / TOP_MEAN


# THE MEAN RADIUS PER HEIGHT, now that both outlines are mean-1. It is monotone
# non-increasing from hem to shoulder, which is the one property a garment has
# to have and the first draft did not: the flanks dipped to 0.26 at knee height
# and swelled back to 0.38 at the waist, so the robe read as a barrel standing
# on a pancake.
#
# The 0.66 is a TRAIN, and a train is not a flare. It sweeps 0.66 -> 0.59 ->
# 0.48 -> 0.33 -> 0.25 as it climbs, i.e. it is nearly all gone by the knee,
# while the flanks fall gently from 0.345 to 0.24. That is a narrow figure with
# a tail behind it rather than a cone, which is the whole of section 2's case.
WIDTH = [(0.020, HEM_MEAN), (0.100, 0.452), (0.250, 0.400), (0.480, 0.318),
         (0.800, 0.272), (0.980, 0.250), (1.140, 0.228), (1.305, 0.205)]

# The centre of the shell, per height. It starts ON the axis at the hem -- the
# socle measures 0.66 / 0.35 "depuis l'axe", so the bottom ring may not be
# offset -- then swings to -x at the hip and leans forward above the waist at
# exactly tan(8 deg): (0.068 - 0.014) / (1.305 - 0.920) = 0.1403 = tan 7.99.
# That column of the table is the socle's and is not touched by anything below.
#
# There is a LATERAL component too, and it is the largest single thing keeping
# this model off the mirror gate. The socle fixes the forward tilt -- 8 degrees
# is the component in the yz plane and that is all the number means -- but
# nothing says the lean has to lie in that plane, and a lean that does is
# invisible from the two views that matter most.
#
# IT USED TO BE +0.050 AND AIMED THE WRONG WAY. Lean (dx, dy) = (0.050, 0.054)
# points at bearing 47 degrees. The train points at 247, so the old lean ran
# almost exactly along the line of sight of the view that sights down the
# train -- and that view is precisely where the worst-case mirror score lives,
# because looking along the train puts the train on the centreline where it
# cannot break anything. The model's biggest asymmetry cancelled itself in the
# one frame that was hardest to pass: 0.929 at b1, 0.930 at b3.
#
# It is +0.103 now, hip to crown, and the hip has been pushed a little further
# to -x to keep the S rather than turn the figure into a stick leaning over.
# The lean off the vertical goes from 10.8 degrees to 13.1 -- so the change is
# a quarter more lean, not a new posture -- but it is a quarter more lean in a
# direction the train view can see, and that is worth 0.09 of mirror IoU.
AXIS = [(0.020, (0.000, 0.000)), (0.300, (-0.014, -0.030)),
        (0.660, (-0.030, -0.020)), (0.920, (0.006, 0.014)),
        (1.160, (0.062, 0.048)), (1.305, (0.095, 0.068))]


def axis(z):
    return _table3(AXIS, z)


def fold_value(th, z):
    """Two crests, both with a phase that MIGRATES WITH HEIGHT -- that is the
    whole difference between an oriented fold and a vertical flute. They lean
    opposite ways, so the cloth reads as pulled rather than pleated."""
    f = math.cos(5.0 * th + 1.50 * z + 0.60)
    f += 0.52 * math.cos(3.0 * th - 1.10 * z + 2.30)
    return f * 0.66


def fold_amp(th, z):
    u = th - TRAIN
    amp = 0.052 * (0.55 + 0.45 * math.cos(u))       # deep on the train, taut in front
    amp *= _smooth((z - 0.030) / 0.120)             # the hem edge itself is clean
    amp *= _smooth((1.340 - z) / 0.300)             # dies out at the shoulder
    return amp


def push(th, z, pushes):
    """b2's cloth pushed TAUT FROM INSIDE. One gaussian raises the radius and
    the SAME gaussian collapses the fold amplitude, because a stretched panel
    of cloth is both further out and smoother than the cloth beside it. Doing
    only the first gives a lump; doing both gives tension."""
    out, damp = 0.0, 1.0
    for pth, pz, sa, sz, amp in pushes:
        g = math.exp(-(_angdiff(th, pth) / sa) ** 2 - ((z - pz) / sz) ** 2)
        out += amp * g
        damp = min(damp, 1.0 - 0.92 * g)
    return out, damp


def zwarp(th, z):
    """The top of the shell is a TILTED ring, not a horizontal one: +0.030 at
    +x and -0.030 at -x is the socle's +0.06 shoulder difference, expressed on
    the cloth itself rather than bolted on afterwards."""
    k = _smooth((z - 0.95) / 0.37)
    return k * (0.030 * math.cos(th) - 0.012 * math.cos(2.0 * th))


def lift(z, rise):
    """THE TIER'S GROWTH, and the only growth there is. Zero at the hem by
    construction, so the footprint cannot move; full above 1.55, so what a tier
    buys is torso and hood and never ground.

    It is one curve driven by one number, so b3's +0.08, b4's +0.17 and b5's
    +0.29 are the SAME stretch at three depths rather than three shapes. That
    is what makes the ramp read as a progression: the figure lengthens in the
    same place each time, a little further."""
    if rise == 0.0:
        return z
    return z + rise * _smooth((z - 0.35) / 1.20)


def raise_path(pts, rise, tip=0.45):
    """Carry a hand-authored polyline up with the robe it hangs off.

    The sleeve paths are written against the UNRAISED body -- `SLEEVE_L` starts
    on `SH_L`, which is the shoulder at rise 0. Once a tier lifts the shell, a
    sleeve still rooted at 1.320 leaves a garment whose top ring is at 1.474,
    i.e. it comes out of the middle of the chest. So the root gets the full
    lift and the far end gets a fraction of it: an empty sleeve hangs from the
    shoulder and its cuff stays roughly where it was, which is the tier -- the
    robe grew and there is less and less in it.

    The 0.45 is not a new invention. b5's sleeves used to be a second, hand
    written table (`SLEEVE_L_B5`), and its four vertices sat at 1.00, 0.91,
    0.62 and 0.42 of the full lift. One linear taper from 1.00 to 0.45
    reproduces that table to within 0.02 at every vertex, so the table is gone
    and every tier now gets its sleeves from the same rule."""
    if rise == 0.0:
        return pts
    n = len(pts) - 1 or 1
    return [(x, y, z + (lift(z, rise) - z) * _lerp(1.0, tip, i / float(n)))
            for i, (x, y, z) in enumerate(pts)]


def hem_rise(th, zp):
    """THE HEM IS NOT LEVEL. A garment with a train drags on the ground behind
    and is lifted clear in front -- that is what "cote long" and "cote ouvert"
    mean once you put them on a body, and the socle's two radii are the plan
    view of the same fact.

    So the bottom edge climbs to 0.082 on the open side and sits at 0.020 on
    the train. It costs nothing (it is a term in z, not a new ring), it is a
    third break in the vertical axis, and it is most of why the front and side
    views stopped agreeing with each other."""
    u = th - TRAIN
    return 0.062 * (0.5 - 0.5 * math.cos(u)) * _smooth((0.34 - zp) / 0.26)


def hem_notch(th, cfg):
    """From b3 the hem is DRAWN UP over the vein root, so a sliver of rose
    light escapes from under the train. It is also one more break in a
    silhouette that must never close into a circle."""
    if not cfg["vein"]:
        return 0.0
    g = math.exp(-(_angdiff(th, TRAIN + 0.18) / 0.34) ** 2)
    return 0.105 * g


def body_radius(th, zp, cfg):
    # The train's own outline is left behind quickly too: fully the shoulder
    # profile by 0.80, not by 1.25. Both halves of the taper have to move or
    # the profile keeps the train's proportions all the way up the skirt.
    t = _smooth((zp - 0.05) / 0.75)
    prof = _lerp(hem_unit(th), top_unit(th), t)
    r = _table(WIDTH, zp) * prof
    out, damp = push(th, zp, cfg["pushes"])
    r += fold_amp(th, zp) * fold_value(th, zp) * damp
    r += out
    return r


def body_z(th, zp, cfg):
    return (lift(zp, cfg["rise"]) + zwarp(th, zp) + hem_rise(th, zp)
            + hem_notch(th, cfg) * (1.0 if zp < 0.16 else 0.0))


def body_spec(cfg):
    return {
        "axis": axis,
        "radius": lambda th, z: body_radius(th, z, cfg),
        "z": lambda th, z: body_z(th, z, cfg),
        "post": None,
    }


def _rings(zs, spec, seg, a0=None, a1=None):
    """One ring per z. `a0`/`a1` make it an ARC instead of a closed ring, which
    is how the chest and the hood are opened without cutting a hole."""
    rings, thetas = [], []
    for zp in zs:
        cx, cy = spec["axis"](zp)
        pts, ths = [], []
        for i in range(seg):
            th = (math.tau * i / seg if a0 is None
                  else a0 + (a1 - a0) * i / float(seg - 1))
            r = spec["radius"](th, zp)
            p = (cx + math.cos(th) * r, cy + math.sin(th) * r,
                 spec["z"](th, zp))
            if spec["post"]:
                p = spec["post"](p)
            pts.append(p)
            ths.append(th)
        rings.append(pts)
        thetas = ths
    return rings, thetas


def _fold_shader(thetas, zs, cfg, base, accent, on_crest):
    """Value follows the fold. On the worn cloth the VALLEYS go dark, which is
    a shadow; on the abyssal robe the CRESTS go light, which is a highlight --
    inverting it there is forced by the palette, since oil_black is already the
    darkest thing in voie B and the largest surface has to keep it.

    The crest threshold is HIGHER than the valley one (0.58 against 0.42) for
    the same reason: the highlight has to be a minority of the columns or the
    accent becomes the field and the socle's value rule is inverted."""
    def shade(band, col):
        th = thetas[col]
        z = (zs[band] + zs[band + 1]) * 0.5
        v = fold_value(th, z) * (1.0 if fold_amp(th, z) > 0.008 else 0.0)
        if on_crest:
            return accent if v > 0.58 else base
        return accent if v < -0.42 else base
    return shade


def _edge_fold(s, name, rings, col, inset, mat, parent):
    """The free edge of an opened panel, turned inward. Cloth has two faces and
    an open shell has one, so without this the robe reads as sheet metal."""
    strip = []
    for ring in rings:
        p = ring[col]
        c = _centroid(ring)
        d = _norm((p[0] - c[0], p[1] - c[1], 0.0))
        strip.append([p, (p[0] - d[0] * inset, p[1] - d[1] * inset,
                          p[2] - 0.012)])
    order = strip if col == 0 else [[b, a] for a, b in strip]
    return _loft(s, name, order, mat, parent, closed=False)


# ---------------------------------------------------------------------------
# THE PIECES
# ---------------------------------------------------------------------------

# The first band is 0.032 tall and nothing else. It is the FRAYED LIP, and
# `hem_fray` is the lightest value in the base palette -- run across a band
# 0.08 deep it covered the whole sweep of the train in the brightest thing on
# the model, and the figure appeared to be standing on a cream plinth. The
# socle calls it "ourlet effiloche": an edge, not a surface.
SKIRT_Z = [0.020, 0.052, 0.250, 0.480, 0.800]
BODICE_Z = [0.800, 0.980, 1.140, 1.305]
SEG = 16                               # 16 columns carries the 5- and 3-crest
                                       # folds with three samples per crest and
                                       # keeps the body inside its tri budget.


def robe(s, body, cfg):
    m = cfg["mat"]
    spec = body_spec(cfg)

    rings, thetas = _rings(SKIRT_Z, spec, SEG)
    # The skirt gets its OWN, quieter fold accent. It is the largest surface
    # and its facets are the largest on the model, so one lit column at the
    # silhouette edge is a triangle the size of a forearm -- in `membrane` it
    # stopped reading as a fold and started reading as a plank leaning on him.
    shade = _fold_shader(thetas, SKIRT_Z, cfg, m["cloth"], m["fold_low"],
                         cfg["crest"])

    def skirt_shade(band, col):
        if band == 0:                       # the frayed edge, a value of its own
            return m["hem"] if col % 2 else m["hem_alt"]
        return shade(band, col)

    _loft(s, "skirt", rings, m["cloth"], body, True,
          cap_bottom=m["under"], face_mat=skirt_shade, cap_bottom_up=True)

    if not cfg["chest_open"]:
        brings, bthetas = _rings(BODICE_Z, spec, SEG)
        _loft(s, "bodice", brings, m["cloth"], body, True, cap_top=m["cloth"],
              face_mat=_fold_shader(bthetas, BODICE_Z, cfg, m["cloth"],
                                    m["fold"], cfg["crest"]))
        return

    # OPENED AT THE CHEST. The waist band stays shut; above it the shell is an
    # ARC with a wedge missing, so the gap is real geometry and you look
    # through it into the cavity rather than at a dark decal painted on.
    waist_z = [BODICE_Z[0], BODICE_Z[1]]
    wr, wth = _rings(waist_z, spec, SEG)
    _loft(s, "waist", wr, m["cloth"], body, True,
          face_mat=_fold_shader(wth, waist_z, cfg, m["cloth"], m["fold"],
                                cfg["crest"]))
    g0, g1 = cfg["chest_gap"]
    open_z = [BODICE_Z[1], BODICE_Z[2], BODICE_Z[3]]
    n = 12
    orings, oth = _rings(open_z, spec, n, g1, g0 + math.tau)
    _loft(s, "lapels", orings, m["cloth"], body, closed=False,
          face_mat=_fold_shader(oth, open_z, cfg, m["cloth"], m["fold"],
                                cfg["crest"]))
    _edge_fold(s, "lapel_edge_l", orings, 0, 0.058, m["lining"], body)
    _edge_fold(s, "lapel_edge_r", orings, n - 1, 0.058, m["lining"], body)
    # A collar bone of cloth across the top of the gap, so the opening reads as
    # a garment falling open and not as a missing polygon.
    top = orings[-1]
    _path_loft(s, "collar_bridge", [top[-1], _lerp3(top[-1], top[0], 0.5),
                                    top[0]],
               [0.030, 0.042, 0.030], m["lining"], body, 4, 1.0, 0.55)


def cavity(s, body, cfg):
    """WHAT IS INSIDE, and the whole difficulty of the brief is here: it must
    unsettle without being anatomy and without being gore.

    So it is neither. It is FIVE IDENTICAL LAMELLAE, evenly spaced at 0.060,
    receding into a dark shell, with one rose bead behind them. Nothing is
    torn, nothing is wet, nothing is organic. What is wrong with it is that it
    is manufactured, regular, and calm -- 'ce qui met mal a l'aise, c'est le
    calme'."""
    m = cfg["mat"]
    # THE DEPTH ORDER IS THE WHOLE TRICK, and it has to be arithmetic rather
    # than an intention: backing at 0.36 of the body radius, the rose at 0.52,
    # the lamellae at 0.72, the robe's own surface at 1.00. Built first with the
    # backing at 0.58 and the rose at 0.66 minus a fixed 0.075, the rose landed
    # BEHIND its own backing shell and the one lit thing in the chest could
    # never have been seen. Fractions of the same radius keep the order true at
    # every tier and every gap width.
    cav = {
        "axis": axis,
        "radius": lambda th, z: body_radius(th, z, cfg) * 0.36,
        "z": lambda th, z: lift(z, cfg["rise"]) + zwarp(th, z),
        "post": None,
    }
    zs = [0.900, 1.110, 1.330]
    rings, _ = _rings(zs, cav, 6)
    _loft(s, "cavity", rings, m["void"], body, True, cap_bottom=m["void"],
          cap_top=m["void"])

    g0, g1 = cfg["chest_gap"]
    mid = (g0 + g1) * 0.5
    cx, cy = axis(1.14)
    r = body_radius(mid, 1.14, cfg)
    # FIVE OF THEM, AT EXACTLY 0.060. Nothing here is torn and nothing is wet.
    # What is wrong with a chest full of evenly spaced slats is that somebody
    # made it, and that it is not in any hurry.
    for i in range(5):
        z = lift(1.020 + i * 0.060, cfg["rise"])
        td.box(s, "lamella_%d" % i, (0.175, 0.030, 0.014),
               (cx + math.cos(mid) * r * 0.72, cy + math.sin(mid) * r * 0.72, z),
               (0.0, 0.0, mid - math.pi / 2), m["lamella"], body)
    td.ellipsoid(s, "core_glow", (0.085, 0.055, 0.085),
                 (cx + math.cos(mid) * r * 0.52, cy + math.sin(mid) * r * 0.52,
                  lift(1.140, cfg["rise"])),
                 m["core"], body, (0.0, 0.0, 0.0), 5, 2)


# --- the hood ---------------------------------------------------------------

HOOD_COLLAR = 1.325
HOOD_CROWN = 1.755
HOOD_TIP = (0.080, -0.180, 1.790)      # back AND across: the point does not
                                       # sit in the plane of symmetry either.
                                       # It rides with `hood_axis` below -- it
                                       # is 0.105 off the crown's own centre,
                                       # the same offset it always had, on the
                                       # other side of a crown that has moved.
GAP_MID = math.radians(79.0)         # 11 degrees off the facing, before yaw
GAP_HALF = math.radians(39.0)


def hood_radius(th, zp):
    # 0.215 at the collar, not 0.262. At 0.262 the hood came out exactly as
    # wide as the cowl under it and the whole figure read as one unbroken mass
    # from hem to crown -- the "barrel with a head on it" the Summoner's file
    # warns about by name. Narrowing the hood and widening the cowl puts a
    # real SHOULDER LINE in the silhouette, which is what tells a viewer at 55
    # px that there is a head in there at all.
    k = _clamp((zp - HOOD_COLLAR) / (HOOD_CROWN - HOOD_COLLAR))
    w = 0.215 - 0.160 * k * k
    prof = (1.0 + 0.100 * math.cos(th - 1.35) + 0.070 * math.cos(2.0 * th + 0.50)
            + 0.050 * math.sin(3.0 * th - 0.40))
    r = w * prof
    # THE BROW. Cloth juts forward over the opening -- the single feature that
    # stops a hood reading as a ball, and it exists only over one arc.
    g = math.exp(-(_angdiff(th, GAP_MID) / 0.62) ** 2
                 - ((zp - 1.640) / 0.058) ** 2)
    return r + 0.080 * g


def hood_axis(zp):
    """The hood FALLS BACKWARD AND SIDEWAYS as it rises: its centre walks to -y
    and to +x, so the crown overhangs the shoulder blades and hangs off one of
    them, and the profile from the side is a completely different animal from
    the profile from the front.

    THE +0.090 ACROSS IS NEW AND IT IS THE TIER'S OWN IDEA, not a fudge factor.
    b1's whole premise is that the hood did not turn when he did; a hood that
    lags is also a hood that has slipped, and a heavy cowl that has slipped
    sits over one shoulder, not squarely on the crown. It used to walk -0.024
    across, which is a twentieth of the head's own width -- visually nothing,
    and worth nothing on the mirror gate either. At +0.090 the topmost fifth of
    the silhouette stands off the body's centreline in every view that is not
    looking straight down the shift, which is the third of the three answers to
    the worst-case mirror test and the only one that acts above the shoulders.

    `HOOD_TIP` moved with it. The point keeps the offset from the crown it
    always had; what changed is where the crown is."""
    t = _clamp((zp - HOOD_COLLAR) / (HOOD_CROWN - HOOD_COLLAR))
    cx, cy = axis(1.305)
    return (cx + 0.090 * t * t, cy - 0.150 * t * t)


def hood_spec(cfg):
    yaw, pitch = cfg["hood_yaw"], cfg["hood_pitch"]
    ox, oy = axis(1.305)
    oz = lift(HOOD_COLLAR, cfg["rise"])

    def post(p):
        x, y, z = p[0] - ox, p[1] - oy, p[2] - oz
        cp, sp = math.cos(pitch), math.sin(pitch)
        y2, z2 = y * cp - z * sp, y * sp + z * cp
        cy_, sy_ = math.cos(yaw), math.sin(yaw)
        return (ox + x * cy_ - y2 * sy_, oy + x * sy_ + y2 * cy_, oz + z2)

    return {
        "axis": hood_axis,
        "radius": hood_radius,
        "z": lambda th, z: lift(z, cfg["rise"]),
        "post": post,
    }


def hood(s, body, cfg):
    m = cfg["mat"]
    spec = hood_spec(cfg)
    n = 12

    lo = [HOOD_COLLAR, 1.420]
    rings, _ = _rings(lo, spec, n)
    _loft(s, "hood_collar", rings, m["hood"], body, True)

    # THE OPENING. A real arc is missing from the shell. It is off-centre twice
    # over: the arc's own centre is 11 degrees off the facing, and the entire
    # hood is then yawed by `hood_yaw` on top of that.
    mid = [1.420, 1.530, 1.640]
    o = 9
    orings, _ = _rings(mid, spec, o, GAP_MID + GAP_HALF,
                       GAP_MID - GAP_HALF + math.tau)
    _loft(s, "hood_face", orings, m["hood"], body, closed=False)
    _edge_fold(s, "hood_edge_l", orings, 0, 0.048, m["hood_in"], body)
    _edge_fold(s, "hood_edge_r", orings, o - 1, 0.048, m["hood_in"], body)

    up = [1.640, HOOD_CROWN]
    urings, _ = _rings(up, spec, n)
    _loft(s, "hood_crown", urings, m["hood"], body, True, cap_top=m["hood"])

    # THE POINT, and it leans BACK. Then the FALL: a flat flap of cloth hanging
    # off the point down the spine, wide in x and thin in y, which no rotation
    # of anything can produce.
    #
    # The tip's z is PINNED TO THE LADDER rather than transformed. Sending it
    # through the hood's pitch made the model's overall height a function of how
    # far out of step the hood was that tier, so b3 stood 1.80 and b1 stood 1.79
    # for no reason a brief could defend -- and a height ramp cannot be read as
    # a ramp if the noise on it is the size of a step. Only x and y follow the
    # hood; the crown of the model is this tier's rung and nothing else.
    swung = spec["post"]((HOOD_TIP[0], HOOD_TIP[1], lift(HOOD_TIP[2], cfg["rise"])))
    top = HEIGHT[cfg["tier"]]
    tip = (swung[0], swung[1], top - 0.015)
    # A SWEPT TUBE IS TALLER THAN ITS PATH. Its rings stand perpendicular to
    # the path, so a near-horizontal run of radius 0.072 reaches 0.057 above
    # the centreline -- which is exactly how the model came out 0.021 over the
    # socle's height with its tip pinned dead on it. So the path is sunk into
    # the crown it grows out of, and the middle vertex is held down too.
    c = _centroid(urings[-1])
    crown = (c[0], c[1], c[2] - 0.048)
    rise = _lerp3(crown, tip, 0.55)
    rise = (rise[0], rise[1], min(rise[2], top - 0.057))
    # THE POINT AND THE FALL ARE ONE PIECE OF CLOTH, on one path. Built as two
    # lofts meeting at the tip they pinched from 0.010 to 0.036 across the join
    # and read from three sides as a pair of ears. A hood's peak and the fabric
    # hanging off the back of it are the same fold: it rises to the point and
    # then drops 0.33 behind the axis to the shoulder blades -- a mass that is
    # the whole side view and is entirely hidden by the head from the front.
    fall_end = spec["post"]((-0.092, -0.320, lift(1.245, cfg["rise"])))
    fall_mid = _lerp3(tip, fall_end, 0.44)
    # Wide across, thin front-to-back. Run narrow it was a rabbit's ear: a
    # pointed hood's peak is a FOLD of cloth and has to have the width of one.
    _path_loft(s, "hood_crest", [crown, rise, tip, fall_mid, fall_end],
               [0.086, 0.062, 0.040, 0.098, 0.060], m["hood"], body, 4,
               1.55, 0.60)

    # THE INSIDE. A second, smaller shell so the opening looks into DEPTH.
    inner = {
        "axis": hood_axis,
        "radius": lambda th, z: hood_radius(th, z) * 0.62,
        "z": spec["z"], "post": spec["post"],
    }
    irings, _ = _rings([1.380, 1.540, 1.700], inner, 6)
    _loft(s, "hood_lining", irings, m["hood_in"], body, True,
          cap_bottom=m["hood_in"], cap_top=m["hood_in"])

    face(s, body, cfg, spec)


def face(s, body, cfg, spec):
    """b1..b3: two shadows, and the second is NOT concentric with the first.
    b4..b5: the face is gone and an opening is lit in its place.

    EVERYTHING HERE IS PLACED AS A FRACTION OF THE HOOD'S OWN RADIUS, out along
    the gap and sideways across it, because the only way any of it is ever seen
    is through that arc. The lining sits at 0.62 and the shell at 1.00, so a
    mass at 0.68 shows and a mass at 0.45 does not -- and the first version put
    the second shadow at 0.43, which is a shadow nobody could ever have seen.
    """
    m = cfg["mat"]
    cx, cy = hood_axis(1.530)
    r = hood_radius(GAP_MID, 1.530)
    ox, oy = math.cos(GAP_MID), math.sin(GAP_MID)          # out through the gap
    lx, ly = -oy, ox                                       # across it
    yaw = cfg["hood_yaw"] + GAP_MID - math.pi / 2

    def at(out, side, dz):
        return spec["post"]((cx + ox * r * out + lx * side,
                             cy + oy * r * out + ly * side,
                             lift(1.520 + dz, cfg["rise"])))

    if cfg["lit_face"]:
        # NOT A FACE AND NOT A MASK: a lit opening set deep in the hood, with a
        # dim surround. It reads as a hole with light behind it, which is the
        # only way to say "the face is gone" without drawing what replaced it.
        td.ellipsoid(s, "face_opening", (0.140, 0.055, 0.175), at(0.78, 0.0, 0.0),
                     m["face"], body, (0.0, 0.0, yaw), 6, 3)
        td.ellipsoid(s, "face_halo", (0.190, 0.026, 0.225), at(0.84, 0.0, 0.0),
                     m["glow"], body, (0.0, 0.0, yaw), 6, 2)
        return

    # THE SECOND SHADOW. One dark mass fills the hood where a head would be; a
    # second, smaller and a value darker, stands BESIDE it and slightly deeper,
    # so through the opening there are two heads' worth of shadow in a hood
    # that holds one head. It is offset laterally rather than tucked behind,
    # because a shadow directly behind another is just the same shadow.
    td.ellipsoid(s, "shadow_first", (0.170, 0.115, 0.210), at(0.68, 0.0, 0.0),
                 m["hood_in"], body, (0.0, 0.0, yaw), 7, 3)
    td.ellipsoid(s, "shadow_second", (0.105, 0.088, 0.140),
                 at(0.57, 0.058, -0.030), m["shadow"], body,
                 (0.16, 0.0, yaw + 0.34), 6, 3)
    # The only living thing in the palette, and it is an edge on one side only.
    td.ellipsoid(s, "shadow_rim", (0.024, 0.024, 0.100),
                 at(0.82, -0.070, 0.008), m["glow"], body, (0.0, 0.0, yaw), 5, 2)


# THE SASH. A band of cloth from the right hip, across the chest, over the LEFT
# shoulder and down the back -- one continuous diagonal that exists on one side
# of the figure and has no counterpart on the other.
#
# It is here for a reason a comment should state plainly: with the robe alone
# the mirror score would not come down, because a robe is broadly a bilateral
# thing however you shape its hem. The sash is the cheapest honest answer --
# 40 triangles, in period for a poor man's garment, and it reads as a diagonal
# from the front and as a lump on one shoulder from the side, so it earns its
# place on the 90-degree test as well.
SASH = [(-0.290, 0.010, 0.855), (-0.045, 0.200, 0.965),
        (0.135, 0.196, 1.145), (0.290, 0.010, 1.295),
        (0.095, -0.235, 0.985)]
SASH_R = [0.046, 0.060, 0.058, 0.052, 0.036]


def sash(s, body, cfg):
    # sx is the THIN axis and sy the WIDE one: the band's frame puts n1 along
    # the outward normal at the chest, so a flat sash needs the small number
    # first. Built the other way round it stood off the chest like a fin and
    # collided with the hands.
    _path_loft(s, "sash", SASH, SASH_R, cfg["mat"]["sash"], body, 4, 0.42, 1.55,
               wrinkle=0.12)


def cowl(s, body, cfg):
    """A short cape over the shoulders whose LOWER EDGE is uneven -- it hangs
    0.14 further down on one side than the other. Cheap, and it does more for
    the 90-degree test than anything else on the upper body.

    FROM b3 IT OPENS WITH THE ROBE. Left closed it draped straight across the
    chest gap and the entire b3 reveal -- the lamellae, the rose, the whole
    point of the tier -- was behind a cape nobody could see past. A garment
    that falls open falls open all the way up; the cowl carries the same arc
    the bodice does, inset 8 degrees so its edges frame the lapels rather than
    landing on them.
    """
    m = cfg["mat"]
    warp = lambda th, z: ((0.100 * math.cos(th - 2.39)
                           - 0.042 * math.cos(2.0 * th - 0.6))
                          * _smooth((1.245 - z) / 0.165))
    spec = {
        "axis": axis,
        "radius": lambda th, z: body_radius(th, min(z, 1.305), cfg) + 0.078,
        "z": lambda th, z: lift(z, cfg["rise"]) + zwarp(th, 1.305) + warp(th, z),
        "post": None,
    }
    zs = [1.060, 1.200, 1.302]
    if not cfg["chest_open"]:
        rings, thetas = _rings(zs, spec, SEG)
        _loft(s, "cowl", rings, m["cowl"], body, True,
              face_mat=_fold_shader(thetas, zs, cfg, m["cowl"], m["fold"],
                                    cfg["crest"]))
        return
    g0, g1 = cfg["chest_gap"]
    inset = math.radians(8.0)
    n = 12
    rings, thetas = _rings(zs, spec, n, g1 + inset, g0 - inset + math.tau)
    _loft(s, "cowl", rings, m["cowl"], body, closed=False,
          face_mat=_fold_shader(thetas, zs, cfg, m["cowl"], m["fold"],
                                cfg["crest"]))
    _edge_fold(s, "cowl_edge_l", rings, 0, 0.050, m["lining"], body)
    _edge_fold(s, "cowl_edge_r", rings, n - 1, 0.050, m["lining"], body)


# --- arms, hands, tendons ---------------------------------------------------

SH_L = (0.250, 0.050, 1.320)
SH_R = (-0.200, 0.028, 1.260)          # exactly 0.060 lower -- the socle's break
HAND_L = (0.130, 0.310, 1.052)
HAND_R = (-0.020, 0.300, 1.038)        # midpoint of the pair == HANDS

SLEEVE_L = [SH_L, (0.284, 0.148, 1.202), (0.250, 0.262, 1.100),
            (0.166, 0.308, 1.058)]
SLEEVE_L_R = [0.112, 0.100, 0.086, 0.062]

# b2's arm. FIVE points where an arm has four: the extra vertex between elbow
# and wrist is a joint no one has, and the radius BULGES over it (0.098 against
# the 0.090 above it) so the sleeve shows what is under it without showing it.
SLEEVE_L_X = [SH_L, (0.284, 0.148, 1.202), (0.266, 0.252, 1.116),
              (0.296, 0.330, 1.040), (0.196, 0.352, 1.040),
              (0.150, 0.316, 1.052)]
SLEEVE_L_XR = [0.112, 0.100, 0.090, 0.098, 0.072, 0.058]

SLEEVE_R = [SH_R, (-0.246, 0.128, 1.152), (-0.212, 0.240, 1.062),
            (-0.058, 0.294, 1.036)]
SLEEVE_R_R = [0.106, 0.094, 0.080, 0.058]

# An EMPTY sleeve: it stops short and hangs, and the cuff is shut. The tendons
# do not come out of it -- they come out through the fabric further up.
SLEEVE_L_EMPTY = [SH_L, (0.286, 0.140, 1.190), (0.268, 0.226, 1.062),
                  (0.238, 0.268, 0.946)]
SLEEVE_R_EMPTY = [SH_R, (-0.250, 0.116, 1.140), (-0.236, 0.198, 1.014),
                  (-0.212, 0.232, 0.898)]
SLEEVE_EMPTY_R = [0.112, 0.102, 0.092, 0.074]

# EVERY SLEEVE ABOVE IS WRITTEN AGAINST THE UNRAISED BODY, and `raise_path`
# takes it up to whatever the tier is. b3, b4 and b5 all lift now, so there is
# no tier where a sleeve may be left hanging off rise-0 shoulders and no second
# hand-written table for the tier that happens to be tallest.


def sleeves(s, body, cfg):
    m = cfg["mat"]
    left = cfg["sleeve_l"]
    _path_loft(s, "sleeve_l", left[0], left[1], m["sleeve"], body, 5, 1.0, 0.82,
               wrinkle=0.085)
    right = cfg["sleeve_r"]
    _path_loft(s, "sleeve_r", right[0], right[1], m["sleeve"], body, 5, 0.86,
               1.0, wrinkle=0.085, phase=1.4)
    if cfg["extra_joint"]:
        # The joint itself, showing at the cuff seam. One bead, one arm.
        td.ellipsoid(s, "extra_joint", (0.092, 0.078, 0.070),
                     (0.296, 0.330, 1.040), m["joint"], body, (0.0, 0.3, 0.4),
                     5, 3)
        td.ellipsoid(s, "extra_joint_lit", (0.030, 0.030, 0.096),
                     (0.322, 0.336, 1.040), m["glow"], body, (0.0, 0.0, 0.4),
                     5, 2)


def hands(s, body, cfg):
    """BARE HANDS, palms facing each other, and the beam comes out of the VOID
    BETWEEN THEM -- the socle is explicit that HANDS is the gap and not a palm,
    so nothing is built at that point and `audit()` proves it stayed empty."""
    m = cfg["mat"]
    for tag, at, sx in (("l", HAND_L, 1.0), ("r", HAND_R, -1.0)):
        yaw = 0.30 * sx
        td.box(s, "palm_" + tag, (0.046, 0.112, 0.140), at, (0.0, 0.20 * sx, yaw),
               m["skin"], body)
        td.box(s, "fingers_" + tag,
               (0.040, 0.078, 0.126),
               (at[0] - 0.020 * sx, at[1] + 0.086, at[2] - 0.012),
               (0.0, 0.55 * sx, yaw), m["skin"], body)
        td.box(s, "thumb_" + tag, (0.034, 0.060, 0.040),
               (at[0] - 0.014 * sx, at[1] + 0.040, at[2] + 0.062),
               (0.0, 0.0, yaw - 0.5 * sx), m["skin_dk"], body)
        td.ellipsoid(s, "wrist_" + tag, (0.062, 0.062, 0.052),
                     (at[0] + 0.040 * sx, at[1] - 0.052, at[2] - 0.004),
                     m["skin_dk"], body, (0.0, 0.0, 0.0), 5, 2)


def tendons(s, body, cfg):
    """THEY COME OUT OF THE SLEEVES, NOT THE WRISTS -- every path starts on the
    UNDERSIDE of a sleeve, above a cuff that is shut and empty.

    Each carries THREE joints where an arm has one, and none of them lash:
    every path ends level, aimed at where it is going rather than snatching at
    it. The brief's word is 'se poser' -- they settle."""
    m = cfg["mat"]
    for i, (pts, radii) in enumerate(cfg["tendons"]):
        # No end caps: the root is buried in the sleeve it came through and the
        # tip is covered by its own bead, so two caps a tendon would be twelve
        # triangles of nothing on a body that has a budget.
        _path_loft(s, "tendon_%d" % i, pts, radii, m["tendon"], body, 4,
                   1.0, 0.78, wrinkle=0.10, phase=i * 1.1, cap=False)
        for j in range(1, len(pts) - 1):
            r = radii[j] * 1.55
            td.ellipsoid(s, "tendon_joint_%d_%d" % (i, j), (r, r, r * 0.72),
                         pts[j], m["joint"], body, (0.0, 0.0, 0.0), 4, 2)
        td.ellipsoid(s, "tendon_lit_%d" % i,
                     (radii[-1] * 1.9, radii[-1] * 1.9, radii[-1] * 1.3),
                     pts[-1], m["glow"], body, (0.0, 0.0, 0.0), 4, 2)


def _tendon(pts, r0, r1):
    n = len(pts)
    return (pts, [_lerp(r0, r1, i / float(n - 1)) for i in range(n)])


# TENDONS DO NOT GO UP WITH THE ROBE, and that is a decision rather than an
# oversight. A sleeve is part of the garment and has to hang from the shoulder
# the garment actually has, so `raise_path` carries it; a tendon is the thing
# INSIDE the garment reaching out through it, and where it chooses to come out
# is not a property of how tall the cloth is. Two of them end at the beam
# origin, which the socle freezes at 1.045 and which may not move for any
# reason -- so a tendon that followed the tier would drag HANDS with it.
#
# Two settle to bracket HANDS -- they end 0.06-0.08 off it on either side, so
# the beam still leaves the gap between them and not a limb.
TENDONS_B4 = [
    _tendon([(0.214, 0.196, 1.128), (0.276, 0.318, 1.010),
             (0.222, 0.446, 0.936), (0.124, 0.428, 1.014),
             (0.092, 0.348, 1.050)], 0.032, 0.013),
    _tendon([(-0.222, 0.176, 1.086), (-0.268, 0.300, 0.980),
             (-0.196, 0.418, 0.918), (-0.088, 0.406, 0.998),
             (-0.006, 0.352, 1.038)], 0.030, 0.012),
    _tendon([(0.238, 0.150, 1.052), (0.318, 0.106, 0.848),
             (0.288, -0.070, 0.628), (0.176, -0.286, 0.430),
             (0.062, -0.424, 0.238)], 0.030, 0.014),
    _tendon([(-0.236, 0.128, 1.004), (-0.318, 0.020, 0.820),
             (-0.336, -0.192, 0.652), (-0.280, -0.372, 0.452),
             (-0.208, -0.470, 0.286)], 0.028, 0.013),
]

# b5. Two still bracket the beam; the other three have SETTLED onto the ground
# at exactly 50 degrees apart, at exactly the same radius, at exactly the same
# height. Nothing about it is violent and nothing about it is right.
TENDONS_B5 = [
    _tendon([(0.268, 0.222, 1.186), (0.286, 0.330, 1.062),
             (0.230, 0.452, 0.958), (0.126, 0.430, 1.016),
             (0.094, 0.348, 1.050)], 0.032, 0.013),
    _tendon([(-0.238, 0.196, 1.140), (-0.278, 0.310, 1.012),
             (-0.202, 0.424, 0.930), (-0.090, 0.408, 1.000),
             (-0.006, 0.352, 1.038)], 0.030, 0.012),
]
# 145, 195, 245 degrees -- fifty apart, same radii, same heights, and the last
# of the three runs out under the train toward the vein root. The final segment
# is deliberately SHALLOW: a tendon that comes down and then reaches along the
# ground has settled onto it, where one that plants at 70 degrees is a table
# leg. Nothing here lashes and nothing here is in a hurry.
for _i, _a in enumerate((145.0, 195.0, 245.0)):
    _r = math.radians(_a)
    TENDONS_B5.append(_tendon([
        (math.cos(_r) * 0.185, math.sin(_r) * 0.185, 1.105),
        (math.cos(_r) * 0.420, math.sin(_r) * 0.420, 0.660),
        (math.cos(_r) * 0.520, math.sin(_r) * 0.520, 0.170),
        (math.cos(_r) * 0.600, math.sin(_r) * 0.600, 0.042)], 0.030, 0.016))


# --- the ground -------------------------------------------------------------

def vein_socket(s, fixed, cfg):
    """VEIN_ROOT, world-fixed, and nothing more: the vein itself is another
    lot's and this only has to give it something to land on.

    It is UNDER the train on purpose -- the socle puts it behind him so the
    vein never crosses the front of the model -- so the hem is notched up over
    it (see `hem_notch`) and the rose sits high enough in the socket that a
    sliver of light escapes from beneath the cloth. Nothing here stands over
    0.105, and nothing here touches the footprint: it is a decal with a lip,
    not a volume."""
    m = cfg["mat"]
    vx, vy, _vz = VEIN_ROOT
    td.frustum(s, "vein_collar", 0.112, 0.086, 0.070, (vx, vy, 0.040),
               m["socket"], fixed, 5, (0.0, 0.0, 0.4))
    td.frustum(s, "vein_throat", 0.064, 0.048, 0.060, (vx, vy, 0.070),
               m["void"], fixed, 5, (0.0, 0.0, 0.4))
    td.ellipsoid(s, "vein_eye", (0.070, 0.056, 0.022), (vx, vy, 0.094),
                 m["core"], fixed, (0.0, 0.0, 0.7), 5, 2)
    # One anchor, off to a side. Two would have been a pair of ears and would
    # have made the only ground furniture on the model bilateral.
    td.box(s, "vein_anchor", (0.078, 0.048, 0.036),
           (vx + math.cos(0.9) * 0.150, vy + math.sin(0.9) * 0.150, 0.028),
           (0.0, 0.0, 0.9), m["socket"], fixed)


# ---------------------------------------------------------------------------
# THE FIVE TIERS
# ---------------------------------------------------------------------------

MAT_WORN = {                       # b1, b2 -- he is still, mostly, a man
    "cloth": "cloth_worn", "fold": "cloth_dark", "fold_low": "cloth_dark",
    "hem": "hem_fray",
    "hem_alt": "cloth_dark", "lining": "cloth_dark", "cowl": "cloth_dark",
    "hood": "cloth_worn", "hood_in": "cloth_dark", "sleeve": "cloth_worn",
    "skin": "skin", "skin_dk": "skin_dark", "shadow": "abyss",
    "glow": "rose_dim", "joint": "membrane", "tendon": "tendon",
    "void": "oil_black", "lamella": "membrane", "core": "rose_dim",
    "face": "rose_dim", "socket": "membrane", "sash": "hem_fray",
    # What is under the hem. While he is still a man it is only the shadow
    # inside his own coat; from b3 it is the abyss, and that is a tier of the
    # reveal that costs nothing because the disc is already being drawn.
    "under": "cloth_dark",
}

MAT_OPEN = dict(MAT_WORN)          # b3 -- the abyss takes the largest surface
# The fold accent is MEMBRANE, not abyss. oil_black is #14101C and abyss is
# #2A1B3D: side by side at 55 px that is not a value step, it is one black, and
# the whole robe went to a silhouette with no form in it. membrane #4A4250 is
# the first thing in voie B a light can actually land on, and at the 0.58 crest
# threshold it stays a minority of the surface.
MAT_OPEN.update({
    "cloth": "oil_black", "fold": "membrane", "fold_low": "abyss",
    "hem": "membrane",
    "hem_alt": "oil_black", "lining": "abyss", "cowl": "oil_black",
    "hood": "oil_black", "hood_in": "abyss", "sleeve": "oil_black",
    "skin": "skin_dark", "skin_dk": "skin_dark", "core": "rose_sick",
    "sash": "membrane", "under": "oil_black",
})

MAT_ABYSS = dict(MAT_OPEN)         # b4, b5 -- no human material is left
MAT_ABYSS.update({
    "face": "rose_sick", "glow": "rose_dim", "joint": "membrane",
    "skin": None, "skin_dk": None,
})


def _cfg(tier, **kw):
    """One tier's configuration. `rise` is NOT a per-tier opinion -- it is read
    out of `HEIGHT`, so the only place the ramp exists is that one table and a
    tier cannot quietly disagree with the height `audit()` will hold it to."""
    base = dict(
        hood_yaw=0.0, hood_pitch=0.0, chest_open=False,
        chest_gap=(math.radians(48.0), math.radians(116.0)),
        pushes=[], crest=False, vein=False, lit_face=False, extra_joint=False,
        tendons=[], has_hands=True, mat=MAT_WORN,
        sleeve_l=(SLEEVE_L, SLEEVE_L_R), sleeve_r=(SLEEVE_R, SLEEVE_R_R),
    )
    base.update(kw)
    rise = HEIGHT[tier] - HEIGHT_BASE
    base["tier"] = tier
    base["rise"] = rise
    for side in ("sleeve_l", "sleeve_r"):
        pts, radii = base[side]
        base[side] = (raise_path(pts, rise), radii)
    return base


TIERS = {
    # b1 -- THE HOOD MOVES ON ITS OWN. It is yawed 16 degrees off the shoulders
    # and tipped BACK 5.7 while the torso leans FORWARD 8: it is not where a
    # head that turned with him would be, and the cowl underneath still points
    # the way he does, which is the seam that gives it away. Two shadows in it.
    "b1": _cfg("b1", hood_yaw=math.radians(-16.0),
               hood_pitch=math.radians(5.7)),

    # b2 -- THE EXTRA JOINT, and the cloth pushed taut from inside at two
    # places that have nothing to do with each other. The hood has moved AGAIN,
    # and the other way: it is not settling, it is keeping its own time.
    "b2": _cfg("b2", hood_yaw=math.radians(13.0), hood_pitch=math.radians(3.0),
               extra_joint=True,
               sleeve_l=(SLEEVE_L_X, SLEEVE_L_XR),
               pushes=[(math.radians(28.0), 1.055, 0.42, 0.130, 0.055),
                       (math.radians(214.0), 0.740, 0.50, 0.160, 0.046)]),

    # b3 -- THE ROBE OPENS. The abyss takes over the largest surface, the hands
    # go one value darker, and the vein root appears in the ground behind him.
    # It is also the first tier that GROWS: +0.080, all of it above the waist.
    "b3": _cfg("b3", hood_yaw=math.radians(-11.0), hood_pitch=math.radians(2.0),
               chest_open=True, vein=True, crest=True, mat=MAT_OPEN,
               pushes=[(math.radians(300.0), 1.020, 0.44, 0.140, 0.038)]),

    # b4 -- THE FACE IS AN OPENING AND THE HANDS ARE GONE. Both sleeves hang
    # empty and shut; four tendons come out through the fabric above the cuffs.
    # +0.090 more of height, and the empty sleeves are what shows it: they hang
    # from a shoulder that has risen off cuffs that have barely moved.
    "b4": _cfg("b4", hood_yaw=math.radians(-6.0), hood_pitch=math.radians(1.0),
               chest_open=True, chest_gap=(math.radians(42.0),
                                           math.radians(124.0)),
               vein=True, crest=True, lit_face=True, has_hands=False,
               mat=MAT_ABYSS, tendons=TENDONS_B4,
               sleeve_l=(SLEEVE_L_EMPTY, SLEEVE_EMPTY_R),
               sleeve_r=(SLEEVE_R_EMPTY, SLEEVE_EMPTY_R),
               pushes=[(math.radians(318.0), 0.960, 0.46, 0.150, 0.032)]),

    # b5 -- ONLY THE ROBE, AND WHAT INHABITS IT. The last +0.120, for 0.29 of
    # height over the three tiers and not one millimetre of ground. The hood has
    # nearly stopped lagging and three tendons have settled at 50-degree
    # intervals; the stillness is the point.
    "b5": _cfg("b5", hood_yaw=math.radians(-3.0),
               hood_pitch=math.radians(0.5),
               chest_open=True, chest_gap=(math.radians(40.0),
                                           math.radians(128.0)),
               vein=True, crest=True, lit_face=True, has_hands=False,
               mat=MAT_ABYSS, tendons=TENDONS_B5,
               sleeve_l=(SLEEVE_L_EMPTY, SLEEVE_EMPTY_R),
               sleeve_r=(SLEEVE_R_EMPTY, SLEEVE_EMPTY_R)),
}

ORDER = ["b1", "b2", "b3", "b4", "b5"]


def build_body(tier, flat):
    s = td.Scene(palette(flat))
    root = s.node("root")
    fixed = s.node("world_fixed", parent=root, world_fixed=True)
    body = s.node("body", parent=root)
    cfg = TIERS[tier]

    robe(s, body, cfg)
    sash(s, body, cfg)
    cowl(s, body, cfg)
    hood(s, body, cfg)
    sleeves(s, body, cfg)
    if cfg["chest_open"]:
        cavity(s, body, cfg)
    if cfg["has_hands"]:
        hands(s, body, cfg)
    if cfg["tendons"]:
        tendons(s, body, cfg)
    if cfg["vein"]:
        vein_socket(s, fixed, cfg)
    return td.build(s, "siphon-" + tier), s


# ---------------------------------------------------------------------------
# THE 360-DEGREE TEST -- THE IDOL'S TEST, NOT A SECOND ONE.
#
# The brief: rotate the model through 360 degrees; if two angles 90 degrees
# apart give the same silhouette it has failed and must be rebuilt. The mirror
# score is the other half of section 2 -- "la silhouette est asymetrique
# gauche/droite" -- the same measure against the silhouette's own reflection,
# which is exactly the failure a 90-degree test alone would miss.
#
# EVERYTHING BELOW IS `siphon_idol.py`'s TEST, COPIED WHOLE: 36 yaws so that 90
# degrees lands on a sample, an 88 x 120 grid, two elevations -- 0, which is the
# strictest case because there is no foreshortening to hide behind, and 35,
# which is the one the game actually draws -- and both statistics taken as the
# WORST case over every view. Quarter turn under 0.85, mirror under 0.88.
#
# IT USED TO BE A DIFFERENT TEST, AND THAT WAS THE PROBLEM. Voie B rasterised
# 24 yaws at one elevation and gated the mirror on the MEAN at 0.90, printing
# the worst as a remark; voie A gated the WORST at 0.88. Two paths of one tower
# held to two statistics, and no reading in one file could be compared with a
# reading in the other. The old comment defended the mean on the grounds that
# the worst case "is not a defect" -- any figure whose asymmetry has a dominant
# direction looks symmetric when you sight along that direction, and here that
# is the train's own bearing. The observation is true. It is not a licence:
# the answer to a view that reads symmetric is to put something in that view,
# not to drop it from the average. On the day the worst-case gate was adopted
# four of the five tiers failed it, at 0.895 to 0.929, and every one of them
# was fixed in the geometry -- see `AXIS`, `_top_raw` and `hood_axis`, which
# carry the three changes and the reason for each.
#
# The duplication is deliberate. Neither file may import the other: a build
# script that needs a sibling to run is a build script that eventually stops
# running, and these two are run separately by different people. The price is
# that this block and the idol's must be changed together, which is cheaper
# than the price of the two paths drifting apart again.
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
    """(worst quarter-turn IoU, worst mirror IoU, worst 60-degree IoU, passed).

    The first two are the gates and they are the idol's, to the constant. The
    third is reported and not gated: the most alike any two views 60 degrees or
    further apart ever get, which is the flattest reading of all -- a surface of
    revolution sits at 1.00 there whatever its 90-degree pairs happen to do.
    """
    tris = _group_tris(model, "")
    worst_q = worst_m = worst_any = 0.0
    step = max(1, YAWS // 6)
    for elev in (0.0, 35.0):
        sil = _silhouettes(tris, elev)
        for k in range(YAWS):
            worst_q = max(worst_q, _iou(sil[k], sil[(k + QUARTER) % YAWS]))
            worst_m = max(worst_m, _iou(sil[k], _mirror(sil[k])))
        for i in range(YAWS):
            for j in range(i + step, YAWS):
                if min(j - i, YAWS - (j - i)) >= step:
                    worst_any = max(worst_any, _iou(sil[i], sil[j]))
    return worst_q, worst_m, worst_any, (worst_q < IOU_QUARTER_MAX
                                         and worst_m < IOU_MIRROR_MAX)


# --- the rest of the checks, asserted rather than remembered ----------------

def _materials(scene):
    used = set()
    for mesh in scene.meshes:
        used.add(mesh.mat)
        if mesh.face_mats:
            used.update(mesh.face_mats)
    used.discard(None)
    return used


def _extent(model, group=None):
    pos = model["positions"]
    first, count = 0, len(pos) // 3
    if group is not None:
        for g in model["groups"]:
            if g["name"] == group:
                first, count = g["first"], g["count"]
    lo, hi, maxr = [1e9] * 3, [-1e9] * 3, 0.0
    for v in range(first, first + count):
        p = pos[v * 3:v * 3 + 3]
        maxr = max(maxr, math.hypot(p[0], p[1]))
        for k in range(3):
            lo[k] = min(lo[k], p[k])
            hi[k] = max(hi[k], p[k])
    return lo, hi, maxr


def _near_hands(model):
    pos = model["positions"]
    best = 1e9
    for i in range(0, len(pos), 3):
        best = min(best, math.dist((pos[i], pos[i + 1], pos[i + 2]), HANDS))
    return best


def audit(tier, model, scene):
    """Six things the brief will not forgive, checked at build time."""
    name = "siphon-" + tier
    used = _materials(scene)
    stray = sorted(used - set(PALETTE))
    if stray:
        raise SystemExit("%s uses materials outside the socle: %s"
                         % (name, stray))

    # 1. HEIGHT. Exactly the rung of the ladder this tier is on -- the socle's
    #    1.79 at the bottom, its 2.08 at b5, and the three steps in between
    #    actually taken rather than promised.
    _lo, hi, maxr = _extent(model)
    want = HEIGHT[tier]
    if abs(hi[2] - want) > 0.008:
        raise SystemExit("%s stands %.3f, the ladder says %.3f"
                         % (name, hi[2], want))

    # 2. THE FOOTPRINT NEVER GROWS. The hem envelope is the socle's 0.66 and
    #    nothing at any tier -- tendon, sleeve or socket -- may reach past it.
    if maxr > HEM_LONG + 0.005:
        raise SystemExit("%s reaches %.3f from the axis, past the hem's %.2f"
                         % (name, maxr, HEM_LONG))

    # 3. THE BEAM ORIGIN IS A VOID. There must be geometry near it (the palms,
    #    or the tendons that replaced them) and none AT it.
    d = _near_hands(model)
    if d < 0.035:
        raise SystemExit("%s puts solid geometry on the beam origin (%.3f)"
                         % (name, d))
    if d > 0.150:
        raise SystemExit("%s leaves the beam origin unbracketed (%.3f)"
                         % (name, d))

    # 4. THE PALETTE LADDER. Skin is the last human material and it leaves at
    #    b4, exactly where the hands do. The bright rose is the reveal and may
    #    not appear before the robe has opened.
    if tier in ("b4", "b5") and (used & set(HUMAN)):
        raise SystemExit("%s still shows skin after the hands are gone" % name)
    if tier in ("b1", "b2") and (used & set(BRIGHT_ROSE)):
        raise SystemExit("%s spends rose_sick before the reveal" % name)
    if tier in ("b3", "b4", "b5") and "oil_black" not in used:
        raise SystemExit("%s has opened without the abyss under it" % name)

    # 5. THE VEIN ROOT. Present from b3, world-fixed, and actually AT the
    #    socle's coordinate.
    fixed = [g for g in model["groups"] if g["name"] == "world_fixed"]
    has = bool(fixed and fixed[0]["count"])
    if has != TIERS[tier]["vein"]:
        raise SystemExit("%s vein root presence is wrong" % name)
    if has:
        lo, hi, _r = _extent(model, "world_fixed")
        cx = ((lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5)
        if math.dist(cx, VEIN_ROOT[:2]) > 0.05:
            raise SystemExit("%s vein root sits at %.3f %.3f, not %.2f %.2f"
                             % ((name,) + cx + VEIN_ROOT[:2]))

    # 6. THE BROKEN AXIS, as numbers rather than as an impression.
    if abs((SH_L[2] - SH_R[2]) - SHOULDER_LIFT) > 1e-6:
        raise SystemExit("the shoulders are level")
    return maxr


def main():
    flat = "--silhouette" in sys.argv
    print("building the Siphon, voie B -- l'abime (%s)"
          % ("SILHOUETTE" if flat else "full"))
    print("  hem  train %.3f  open %.3f  widest %.3f  flanks %.3f / %.3f"
          % (_hem_raw(TRAIN), _hem_raw(TRAIN + math.pi), HEM_PEAK,
             _hem_raw(TRAIN + math.pi / 2), _hem_raw(TRAIN - math.pi / 2)))

    total, radii, passes, heights = 0, [], [], []
    for tier in ORDER:
        model, scene = build_body(tier, flat)
        maxr = audit(tier, model, scene)
        td.write_js(model, "siphon-%s.js" % tier)
        lo, hi, _r = _extent(model)
        wq, wm, wany, ok = rotation_test(model)
        passes.append(ok)
        radii.append(maxr)
        heights.append(hi[2])
        total += model["triangles"]
        print("  siphon-%s %4d tris  h %.3f  span %.2f x %.2f  r %.3f  |  "
              "quarter %.3f  mirror %.3f  any60 %.3f  %s"
              % (tier, model["triangles"], hi[2], hi[0] - lo[0], hi[1] - lo[1],
                 maxr, wq, wm, wany, "PASS" if ok else "FAIL"))

    if max(radii) - min(radii) > 0.005:
        raise SystemExit("the footprint moved between tiers: %s"
                         % ["%.3f" % r for r in radii])

    # REVUE 2 ASKS WHETHER THE PROGRESSION IS CONTINUOUS. So it is printed as
    # steps rather than as heights: four tiers of 0.001 followed by one of 0.29
    # is what this line exists to make impossible to miss again.
    steps = [heights[i + 1] - heights[i] for i in range(len(heights) - 1)]
    print("  %d models, %d triangles total" % (len(ORDER), total))
    print("  HEIGHT LADDER  %s"
          % "  ".join("%s %.3f" % (t, h) for t, h in zip(ORDER, heights)))
    print("    steps        %s   (all vertical; the plan is identical)"
          % "  ".join("%+.3f" % d for d in steps))
    print("  footprint %.0f u.l. = %.4f u at EVERY tier; hem envelope %.3f u"
          % (FOOTPRINT_UL, GROUND_R, max(radii)))
    print("  ROTATION TEST (%d yaws x 2 elevations, %dx%d grid): %s"
          % (YAWS, GRID_W, GRID_H, "ALL FIVE PASS" if all(passes) else "FAILED"))
    print("    gates, and they are siphon_idol.py's to the constant:")
    print("      worst quarter-turn IoU < %.2f (a surface of revolution: 1.00)"
          % IOU_QUARTER_MAX)
    print("      worst MIRROR IoU       < %.2f -- worst case, not the mean"
          % IOU_MIRROR_MAX)
    print("  BEAM ORIGIN (read by the rayon lot, never retyped):")
    print("    HANDS      %.3f %.3f %.3f   -- all five path B tiers" % HANDS)
    print("    VEIN_ROOT  %.3f %.3f %.3f   -- world_fixed, b3 b4 b5" % VEIN_ROOT)
    print("    no RING anywhere: the sceptre is voie A.")
    if not all(passes):
        raise SystemExit("a body reads as a surface of revolution -- rebuild it")


if __name__ == "__main__":
    main()
