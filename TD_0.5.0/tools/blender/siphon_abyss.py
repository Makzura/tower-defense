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
# horizontal radius of the whole model is identical across all five. The only
# growth is +0.29 of HEIGHT at b5, applied by `lift()`, which is zero at the
# hem by construction.
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
HEIGHT_BASE = 1.79                   # base / b1..b4
HEIGHT_TOP = 2.08                    # b5 -- the only growth, and it is VERTICAL
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
          cap_top=None, face_mat=None):
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
            faces.append((ci, (c + 1) % n, c))
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
    cosine phases keep an odd component: the outline is 0.390 at u = +90 and
    0.427 at u = -90, so the two flanks of the train are different shapes.
    """
    u = th - TRAIN
    return (0.505 + 0.155 * math.cos(u)
            + math.sin(u) * (0.085 * math.cos(2.0 * u + 1.35)
                             + 0.062 * math.cos(3.0 * u - 1.90)
                             + 0.038 * math.cos(5.0 * u + 1.70)))


HEM_PEAK = max(_hem_raw(math.tau * i / 1440.0) for i in range(1440))
if abs(HEM_PEAK - HEM_LONG) > 0.002:
    raise SystemExit("the hem's widest point is %.4f, not the socle's %.2f"
                     % (HEM_PEAK, HEM_LONG))


def hem_unit(th):
    return _hem_raw(th) / 0.505


def top_unit(th):
    """The shoulder outline. Wide across x (cos 2th), and pushed off centre by
    terms that are ODD under x -> -x, so the two shoulders are not the same
    width -- the left one reaches 0.294 and the right one 0.222."""
    r = (1.0 + 0.200 * math.cos(2.0 * th) + 0.070 * math.cos(th)
         + 0.060 * math.sin(3.0 * th + 0.80) - 0.050 * math.sin(th))
    return r


WIDTH = [(0.020, 0.505), (0.090, 0.498), (0.300, 0.455), (0.550, 0.390),
         (0.800, 0.312), (0.980, 0.262), (1.140, 0.238), (1.305, 0.215)]

# The centre of the shell, per height. It starts ON the axis at the hem -- the
# socle measures 0.66 / 0.35 "depuis l'axe", so the bottom ring may not be
# offset -- then swings to -x at the hip and leans forward above the waist at
# exactly tan(8 deg): (0.068 - 0.014) / (1.305 - 0.920) = 0.1403 = tan 7.99.
AXIS = [(0.020, (0.000, 0.000)), (0.300, (-0.012, -0.030)),
        (0.660, (-0.022, -0.020)), (0.920, (-0.010, 0.014)),
        (1.160, (0.004, 0.048)), (1.305, (0.012, 0.068))]


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
    """b5's +0.29. Zero at the hem by construction, so the footprint cannot
    move; full above 1.55, so the growth lands in the torso and the hood."""
    if rise == 0.0:
        return z
    return z + rise * _smooth((z - 0.35) / 1.20)


def hem_notch(th, cfg):
    """From b3 the hem is DRAWN UP over the vein root, so a sliver of rose
    light escapes from under the train. It is also one more break in a
    silhouette that must never close into a circle."""
    if not cfg["vein"]:
        return 0.0
    g = math.exp(-(_angdiff(th, TRAIN + 0.18) / 0.34) ** 2)
    return 0.105 * g


def body_radius(th, zp, cfg):
    t = _smooth((zp - 0.10) / 1.15)
    prof = _lerp(hem_unit(th), top_unit(th), t)
    r = _table(WIDTH, zp) * prof
    out, damp = push(th, zp, cfg["pushes"])
    r += fold_amp(th, zp) * fold_value(th, zp) * damp
    r += out
    return r


def body_z(th, zp, cfg):
    return lift(zp, cfg["rise"]) + zwarp(th, zp) + hem_notch(th, cfg) * (
        1.0 if zp < 0.16 else 0.0)


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
    darkest thing in voie B and the largest surface has to keep it."""
    def shade(band, col):
        th = thetas[col]
        z = (zs[band] + zs[band + 1]) * 0.5
        v = fold_value(th, z) * (1.0 if fold_amp(th, z) > 0.008 else 0.0)
        if on_crest:
            return accent if v > 0.42 else base
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

SKIRT_Z = [0.020, 0.090, 0.300, 0.550, 0.800]
BODICE_Z = [0.800, 0.980, 1.140, 1.305]
SEG = 16                               # 16 columns carries the 5- and 3-crest
                                       # folds with three samples per crest and
                                       # keeps the body inside its tri budget.


def robe(s, body, cfg):
    m = cfg["mat"]
    spec = body_spec(cfg)

    rings, thetas = _rings(SKIRT_Z, spec, SEG)
    shade = _fold_shader(thetas, SKIRT_Z, cfg, m["cloth"], m["fold"],
                         cfg["crest"])

    def skirt_shade(band, col):
        if band == 0:                       # the frayed edge, a value of its own
            return m["hem"] if col % 2 else m["hem_alt"]
        return shade(band, col)

    _loft(s, "skirt", rings, m["cloth"], body, True,
          cap_bottom=m["lining"], face_mat=skirt_shade)

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
    cav = {
        "axis": axis,
        "radius": lambda th, z: body_radius(th, z, cfg) * 0.58,
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
    depth = body_radius(mid, 1.14, cfg) * 0.66
    for i in range(5):
        z = lift(1.020 + i * 0.060, cfg["rise"])
        td.box(s, "lamella_%d" % i, (0.175, 0.030, 0.014),
               (cx + math.cos(mid) * depth, cy + math.sin(mid) * depth, z),
               (0.0, 0.0, mid - math.pi / 2), m["lamella"], body)
    td.ellipsoid(s, "core_glow", (0.085, 0.055, 0.085),
                 (cx + math.cos(mid) * (depth - 0.075),
                  cy + math.sin(mid) * (depth - 0.075), lift(1.140, cfg["rise"])),
                 m["core"], body, (0.0, 0.0, 0.0), 5, 2)


# --- the hood ---------------------------------------------------------------

HOOD_COLLAR = 1.325
HOOD_CROWN = 1.755
HOOD_TIP = (-0.088, -0.180, 1.790)     # back AND across: the point does not
                                       # sit in the plane of symmetry either
GAP_MID = math.radians(79.0)         # 11 degrees off the facing, before yaw
GAP_HALF = math.radians(39.0)


def hood_radius(th, zp):
    k = _clamp((zp - HOOD_COLLAR) / (HOOD_CROWN - HOOD_COLLAR))
    w = 0.262 - 0.200 * k * k
    prof = (1.0 + 0.100 * math.cos(th - 1.35) + 0.070 * math.cos(2.0 * th + 0.50)
            + 0.050 * math.sin(3.0 * th - 0.40))
    r = w * prof
    # THE BROW. Cloth juts forward over the opening -- the single feature that
    # stops a hood reading as a ball, and it exists only over one arc.
    g = math.exp(-(_angdiff(th, GAP_MID) / 0.62) ** 2
                 - ((zp - 1.640) / 0.058) ** 2)
    return r + 0.080 * g


def hood_axis(zp):
    """The hood FALLS BACKWARD as it rises: its centre walks to -y, so the
    crown overhangs the shoulder blades and the profile from the side is a
    completely different animal from the profile from the front."""
    t = _clamp((zp - HOOD_COLLAR) / (HOOD_CROWN - HOOD_COLLAR))
    cx, cy = axis(1.305)
    return (cx - 0.024 * t * t, cy - 0.150 * t * t)


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

    up = [1.640, 1.706, HOOD_CROWN]
    urings, _ = _rings(up, spec, n)
    _loft(s, "hood_crown", urings, m["hood"], body, True, cap_top=m["hood"])

    # THE POINT, and it leans BACK. Then the FALL: a flat flap of cloth hanging
    # off the point down the spine, wide in x and thin in y, which no rotation
    # of anything can produce.
    #
    # The tip's z is PINNED rather than transformed. Sending it through the
    # hood's pitch made the model's overall height a function of how far out of
    # step the hood was that tier, so b3 stood 1.80 and b1 stood 1.79 for no
    # reason a brief could defend. Only x and y follow the hood now; the crown
    # of the model is exactly the socle's height at every tier.
    swung = spec["post"]((HOOD_TIP[0], HOOD_TIP[1], lift(HOOD_TIP[2], cfg["rise"])))
    tip = (swung[0], swung[1], lift(HEIGHT_BASE, cfg["rise"]) - 0.008)
    crown = _centroid(urings[-1])
    _path_loft(s, "hood_point", [crown, _lerp3(crown, tip, 0.55), tip],
               [0.072, 0.048, 0.010], m["hood"], body, 5, 1.25, 0.80)
    fall_end = spec["post"]((-0.062, -0.238, lift(1.400, cfg["rise"])))
    _path_loft(s, "hood_fall",
               [tip, _lerp3(tip, fall_end, 0.45), fall_end],
               [0.040, 0.095, 0.062], m["hood_in"], body, 5, 1.70, 0.42)

    # THE INSIDE. A second, smaller shell so the opening looks into DEPTH.
    inner = {
        "axis": hood_axis,
        "radius": lambda th, z: hood_radius(th, z) * 0.80,
        "z": spec["z"], "post": spec["post"],
    }
    irings, _ = _rings([1.380, 1.540, 1.700], inner, 7)
    _loft(s, "hood_lining", irings, m["hood_in"], body, True,
          cap_bottom=m["hood_in"], cap_top=m["hood_in"])

    face(s, body, cfg, spec)


def face(s, body, cfg, spec):
    """b1..b3: two shadows, and the second is NOT concentric with the first.
    b4..b5: the face is gone and an opening is lit in its place."""
    m = cfg["mat"]
    cx, cy = hood_axis(1.530)
    d = hood_radius(GAP_MID, 1.530) * 0.52
    at = spec["post"]((cx + math.cos(GAP_MID) * d, cy + math.sin(GAP_MID) * d,
                       lift(1.520, cfg["rise"])))
    yaw = cfg["hood_yaw"] + GAP_MID - math.pi / 2

    if cfg["lit_face"]:
        td.ellipsoid(s, "face_opening", (0.150, 0.062, 0.185), at,
                     m["face"], body, (0.0, 0.0, yaw), 6, 3)
        td.ellipsoid(s, "face_halo", (0.205, 0.030, 0.245),
                     (at[0] - math.sin(yaw) * 0.010,
                      at[1] + math.cos(yaw) * 0.010, at[2]),
                     m["glow"], body, (0.0, 0.0, yaw), 6, 2)
        return

    # THE SECOND SHADOW. One dark mass fills the hood; a second, smaller and
    # darker, sits inside it -- offset, tilted, and lit down one edge only. Two
    # heads' worth of shadow in a hood that holds one head.
    td.ellipsoid(s, "shadow_first", (0.190, 0.150, 0.225), at,
                 m["hood_in"], body, (0.0, 0.0, yaw), 7, 3)
    off = (at[0] - math.cos(yaw) * 0.052 - math.sin(yaw) * 0.022,
           at[1] - math.sin(yaw) * 0.052 + math.cos(yaw) * 0.022,
           at[2] - 0.028)
    td.ellipsoid(s, "shadow_second", (0.120, 0.098, 0.152), off,
                 m["shadow"], body, (0.16, 0.0, yaw + 0.34), 6, 3)
    # The only living thing in the palette, and it is a crescent down one side.
    td.ellipsoid(s, "shadow_rim", (0.026, 0.026, 0.115),
                 (off[0] + math.cos(yaw) * 0.062, off[1] + math.sin(yaw) * 0.062,
                  off[2] + 0.010), m["glow"], body, (0.0, 0.0, yaw), 5, 2)


def cowl(s, body, cfg):
    """A short cape over the shoulders whose LOWER EDGE is uneven -- it hangs
    0.10 further down on one side than the other. Cheap, and it does more for
    the 90-degree test than anything else on the upper body."""
    m = cfg["mat"]
    spec = {
        "axis": axis,
        "radius": lambda th, z: body_radius(th, min(z, 1.305), cfg) + 0.052,
        "z": lambda th, z: (lift(z, cfg["rise"]) + zwarp(th, 1.305)
                            + (0.075 * math.cos(th + 1.10)
                               - 0.032 * math.cos(2.0 * th) if z < 1.20 else 0.0)),
        "post": None,
    }
    zs = [1.090, 1.220, 1.302]
    rings, thetas = _rings(zs, spec, SEG)
    _loft(s, "cowl", rings, m["cowl"], body, True, cap_top=m["cowl"],
          face_mat=_fold_shader(thetas, zs, cfg, m["cowl"], m["fold"],
                                cfg["crest"]))


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


def sleeves(s, body, cfg):
    m = cfg["mat"]
    left = cfg["sleeve_l"]
    _path_loft(s, "sleeve_l", left[0], left[1], m["sleeve"], body, 6, 1.0, 0.82,
               wrinkle=0.085)
    right = cfg["sleeve_r"]
    _path_loft(s, "sleeve_r", right[0], right[1], m["sleeve"], body, 6, 0.86,
               1.0, wrinkle=0.085, phase=1.4)
    if cfg["extra_joint"]:
        # The joint itself, showing at the cuff seam. One bead, one arm.
        td.ellipsoid(s, "extra_joint", (0.092, 0.078, 0.070),
                     (0.296, 0.330, 1.040), m["joint"], body, (0.0, 0.3, 0.4),
                     6, 3)
        td.ellipsoid(s, "extra_joint_lit", (0.030, 0.030, 0.096),
                     (0.322, 0.336, 1.040), m["glow"], body, (0.0, 0.0, 0.4),
                     5, 3)


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
                     m["skin_dk"], body, (0.0, 0.0, 0.0), 6, 3)


def tendons(s, body, cfg):
    """THEY COME OUT OF THE SLEEVES, NOT THE WRISTS -- every path starts on the
    UNDERSIDE of a sleeve, above a cuff that is shut and empty.

    Each carries THREE joints where an arm has one, and none of them lash:
    every path ends level, aimed at where it is going rather than snatching at
    it. The brief's word is 'se poser' -- they settle."""
    m = cfg["mat"]
    for i, (pts, radii) in enumerate(cfg["tendons"]):
        _path_loft(s, "tendon_%d" % i, pts, radii, m["tendon"], body, 5,
                   1.0, 0.78, wrinkle=0.10, phase=i * 1.1)
        for j in range(1, len(pts) - 1):
            r = radii[j] * 1.55
            td.ellipsoid(s, "tendon_joint_%d_%d" % (i, j), (r, r, r * 0.72),
                         pts[j], m["joint"], body, (0.0, 0.0, 0.0), 5, 2)
        td.ellipsoid(s, "tendon_lit_%d" % i,
                     (radii[-1] * 1.7, radii[-1] * 1.7, radii[-1] * 1.2),
                     pts[-1], m["glow"], body, (0.0, 0.0, 0.0), 5, 2)


def _tendon(pts, r0, r1):
    n = len(pts)
    return (pts, [_lerp(r0, r1, i / float(n - 1)) for i in range(n)])


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
    _tendon([(0.216, 0.190, 1.240), (0.284, 0.318, 1.080),
             (0.230, 0.452, 0.958), (0.126, 0.430, 1.016),
             (0.094, 0.348, 1.050)], 0.032, 0.013),
    _tendon([(-0.226, 0.170, 1.196), (-0.276, 0.302, 1.026),
             (-0.202, 0.424, 0.930), (-0.090, 0.408, 1.000),
             (-0.006, 0.352, 1.038)], 0.030, 0.012),
]
for _i, _a in enumerate((200.0, 250.0, 300.0)):
    _r = math.radians(_a)
    TENDONS_B5.append(_tendon([
        (math.cos(_r) * 0.150, math.sin(_r) * 0.150, 1.130),
        (math.cos(_r) * 0.290, math.sin(_r) * 0.290, 0.860),
        (math.cos(_r) * 0.420, math.sin(_r) * 0.420, 0.520),
        (math.cos(_r) * 0.500, math.sin(_r) * 0.500, 0.210),
        (math.cos(_r) * 0.540, math.sin(_r) * 0.540, 0.055)], 0.030, 0.016))


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
                 m["core"], fixed, (0.0, 0.0, 0.7), 6, 3)
    # Two anchors, deliberately NOT opposite each other.
    for i, (a, d) in enumerate(((0.9, 0.150), (3.6, 0.118))):
        td.box(s, "vein_anchor_%d" % i, (0.070, 0.046, 0.036),
               (vx + math.cos(a) * d, vy + math.sin(a) * d, 0.028),
               (0.0, 0.0, a), m["socket"], fixed)


# ---------------------------------------------------------------------------
# THE FIVE TIERS
# ---------------------------------------------------------------------------

MAT_WORN = {                       # b1, b2 -- he is still, mostly, a man
    "cloth": "cloth_worn", "fold": "cloth_dark", "hem": "hem_fray",
    "hem_alt": "cloth_dark", "lining": "cloth_dark", "cowl": "cloth_dark",
    "hood": "cloth_worn", "hood_in": "cloth_dark", "sleeve": "cloth_worn",
    "skin": "skin", "skin_dk": "skin_dark", "shadow": "abyss",
    "glow": "rose_dim", "joint": "membrane", "tendon": "tendon",
    "void": "oil_black", "lamella": "membrane", "core": "rose_dim",
    "face": "rose_dim", "socket": "membrane",
}

MAT_OPEN = dict(MAT_WORN)          # b3 -- the abyss takes the largest surface
MAT_OPEN.update({
    "cloth": "oil_black", "fold": "abyss", "hem": "membrane",
    "hem_alt": "oil_black", "lining": "membrane", "cowl": "oil_black",
    "hood": "oil_black", "hood_in": "abyss", "sleeve": "oil_black",
    "skin": "skin_dark", "skin_dk": "skin_dark", "core": "rose_sick",
})

MAT_ABYSS = dict(MAT_OPEN)         # b4, b5 -- no human material is left
MAT_ABYSS.update({
    "face": "rose_sick", "glow": "rose_dim", "joint": "membrane",
    "skin": None, "skin_dk": None,
})


def _cfg(**kw):
    base = dict(
        rise=0.0, hood_yaw=0.0, hood_pitch=0.0, chest_open=False,
        chest_gap=(math.radians(48.0), math.radians(116.0)),
        pushes=[], crest=False, vein=False, lit_face=False, extra_joint=False,
        tendons=[], has_hands=True, mat=MAT_WORN,
        sleeve_l=(SLEEVE_L, SLEEVE_L_R), sleeve_r=(SLEEVE_R, SLEEVE_R_R),
    )
    base.update(kw)
    return base


TIERS = {
    # b1 -- THE HOOD MOVES ON ITS OWN. It is yawed 16 degrees off the shoulders
    # and tipped BACK 5.7 while the torso leans FORWARD 8: it is not where a
    # head that turned with him would be, and the cowl underneath still points
    # the way he does, which is the seam that gives it away. Two shadows in it.
    "b1": _cfg(hood_yaw=math.radians(-16.0), hood_pitch=math.radians(5.7)),

    # b2 -- THE EXTRA JOINT, and the cloth pushed taut from inside at two
    # places that have nothing to do with each other. The hood has moved AGAIN,
    # and the other way: it is not settling, it is keeping its own time.
    "b2": _cfg(hood_yaw=math.radians(13.0), hood_pitch=math.radians(3.0),
               extra_joint=True,
               sleeve_l=(SLEEVE_L_X, SLEEVE_L_XR),
               pushes=[(math.radians(28.0), 1.055, 0.42, 0.130, 0.055),
                       (math.radians(214.0), 0.740, 0.50, 0.160, 0.046)]),

    # b3 -- THE ROBE OPENS. The abyss takes over the largest surface, the hands
    # go one value darker, and the vein root appears in the ground behind him.
    "b3": _cfg(hood_yaw=math.radians(-11.0), hood_pitch=math.radians(2.0),
               chest_open=True, vein=True, crest=True, mat=MAT_OPEN,
               pushes=[(math.radians(300.0), 1.020, 0.44, 0.140, 0.038)]),

    # b4 -- THE FACE IS AN OPENING AND THE HANDS ARE GONE. Both sleeves hang
    # empty and shut; four tendons come out through the fabric above the cuffs.
    "b4": _cfg(hood_yaw=math.radians(-6.0), hood_pitch=math.radians(1.0),
               chest_open=True, chest_gap=(math.radians(42.0),
                                           math.radians(124.0)),
               vein=True, crest=True, lit_face=True, has_hands=False,
               mat=MAT_ABYSS, tendons=TENDONS_B4,
               sleeve_l=(SLEEVE_L_EMPTY, SLEEVE_EMPTY_R),
               sleeve_r=(SLEEVE_R_EMPTY, SLEEVE_EMPTY_R),
               pushes=[(math.radians(318.0), 0.960, 0.46, 0.150, 0.032)]),

    # b5 -- ONLY THE ROBE, AND WHAT INHABITS IT. +0.29 of height and not one
    # millimetre of ground. The hood has nearly stopped lagging and three
    # tendons have settled at 50-degree intervals; the stillness is the point.
    "b5": _cfg(rise=HEIGHT_TOP - HEIGHT_BASE,
               hood_yaw=math.radians(-3.0), hood_pitch=math.radians(0.5),
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
# THE 360-DEGREE TEST, RUN RATHER THAN PROMISED.
#
# The brief: rotate the model through 360 degrees; if two angles 90 degrees
# apart give the same silhouette it has failed and must be rebuilt. So the
# model is rasterised into a silhouette at 24 yaws and every 90-degree pair is
# scored by intersection over union. A cylinder, a cone, or a cone with a ball
# on it all score 1.00 and are rejected here.
#
# The mirror score is the second half of section 2 -- "la silhouette est
# asymetrique gauche/droite" -- and is the same measure against the silhouette's
# own reflection, which is exactly the failure a left/right symmetric figure
# would show and a 90-degree test alone would miss.
# ---------------------------------------------------------------------------

YAWS = 24
REVOLUTION_LIMIT = 0.90
MIRROR_LIMIT = 0.92
GRID_W = 64


def _stamp(pos, yaw, box, w, h):
    ca, sa = math.cos(-yaw), math.sin(-yaw)
    u0, v0, du, dv = box
    cells = set()
    n = len(pos) // 9
    for t in range(n):
        i = t * 9
        p = []
        for k in range(3):
            x, y, z = pos[i + k * 3], pos[i + k * 3 + 1], pos[i + k * 3 + 2]
            p.append(((x * ca - y * sa - u0) / du, (z - v0) / dv))
        (ax, ay), (bx, by), (cx, cy) = p
        lo_x = max(0, int(min(ax, bx, cx)))
        hi_x = min(w - 1, int(max(ax, bx, cx)) + 1)
        lo_y = max(0, int(min(ay, by, cy)))
        hi_y = min(h - 1, int(max(ay, by, cy)) + 1)
        area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
        if abs(area) < 1e-9:
            for px, py in p:
                cells.add((int(px), int(py)))
            continue
        inv = 1.0 / area
        for gy in range(lo_y, hi_y + 1):
            py = gy + 0.5
            for gx in range(lo_x, hi_x + 1):
                px = gx + 0.5
                w0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * inv
                w1 = ((px - ax) * (cy - ay) - (py - ay) * (cx - ax)) * inv
                if w0 >= -0.02 and w1 >= -0.02 and w0 + w1 <= 1.02:
                    cells.add((gx, gy))
        for px, py in p:
            if 0 <= px < w and 0 <= py < h:
                cells.add((int(px), int(py)))
    return cells


def _iou(a, b):
    if not a and not b:
        return 1.0
    return len(a & b) / float(len(a | b) or 1)


def rotation_test(model):
    pos = model["positions"]
    maxr, lo, hi = 0.0, 1e9, -1e9
    for i in range(0, len(pos), 3):
        x, y, z = pos[i], pos[i + 1], pos[i + 2]
        maxr = max(maxr, math.hypot(x, y))
        lo = min(lo, z)
        hi = max(hi, z)
    w = GRID_W
    du = 2.0 * maxr / w
    h = max(8, int((hi - lo) / du))
    box = (-maxr, lo, du, (hi - lo) / h)
    shots = [_stamp(pos, math.tau * i / YAWS, box, w, h) for i in range(YAWS)]

    quarter = YAWS // 4
    worst90 = max(_iou(shots[i], shots[(i + quarter) % YAWS])
                  for i in range(YAWS))
    worstmir = max(_iou(sh, set((w - 1 - c, r) for c, r in sh))
                   for sh in shots)
    # And the flattest reading of all: the most alike ANY two distinct views
    # get. A revolution puts this at 1.00 too, whatever the 90-degree pairs do.
    step = max(1, YAWS // 12)
    worstany = 0.0
    for i in range(YAWS):
        for j in range(i + step, YAWS):
            if min(j - i, YAWS - (j - i)) >= step:
                worstany = max(worstany, _iou(shots[i], shots[j]))
    ok = worst90 <= REVOLUTION_LIMIT and worstmir <= MIRROR_LIMIT
    return ok, worst90, worstmir, worstany


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

    # 1. HEIGHT. 1.79 everywhere but b5, 2.08 at b5, and nothing else.
    _lo, hi, maxr = _extent(model)
    want = HEIGHT_TOP if tier == "b5" else HEIGHT_BASE
    if abs(hi[2] - want) > 0.02:
        raise SystemExit("%s stands %.3f, the socle says %.2f"
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
    print("  hem  train %.3f  open %.3f  (ripple scaled x%.3f to keep them)"
          % (0.505 * hem_unit(TRAIN), 0.505 * hem_unit(TRAIN + math.pi),
             RIPPLE))

    total, radii, passes = 0, [], []
    for tier in ORDER:
        model, scene = build_body(tier, flat)
        maxr = audit(tier, model, scene)
        td.write_js(model, "siphon-%s.js" % tier)
        lo, hi, _r = _extent(model)
        ok, w90, wmir, wany = rotation_test(model)
        passes.append(ok)
        radii.append(maxr)
        total += model["triangles"]
        print("  siphon-%s %4d tris  h %.2f  span %.2f x %.2f  r %.3f   "
              "360: 90deg %.3f  mirror %.3f  any %.3f  %s"
              % (tier, model["triangles"], hi[2], hi[0] - lo[0], hi[1] - lo[1],
                 maxr, w90, wmir, wany, "PASS" if ok else "FAIL"))

    if max(radii) - min(radii) > 0.005:
        raise SystemExit("the footprint moved between tiers: %s"
                         % ["%.3f" % r for r in radii])

    print("  %d models, %d triangles total" % (len(ORDER), total))
    print("  footprint %.0f u.l. = %.4f u at EVERY tier; hem envelope %.3f u"
          % (FOOTPRINT_UL, GROUND_R, max(radii)))
    print("  ROTATION TEST (%d yaws, %dx grid): %s   limits 90deg<=%.2f "
          "mirror<=%.2f" % (YAWS, GRID_W,
                            "ALL FIVE PASS" if all(passes) else "FAILED",
                            REVOLUTION_LIMIT, MIRROR_LIMIT))
    print("  BEAM ORIGIN (read by the rayon lot, never retyped):")
    print("    HANDS      %.3f %.3f %.3f   -- all five path B tiers" % HANDS)
    print("    VEIN_ROOT  %.3f %.3f %.3f   -- world_fixed, b3 b4 b5" % VEIN_ROOT)
    print("    no RING anywhere: the sceptre is voie A.")
    if not all(passes):
        raise SystemExit("a body reads as a surface of revolution -- rebuild it")


if __name__ == "__main__":
    main()
