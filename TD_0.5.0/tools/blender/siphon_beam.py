# ---------------------------------------------------------------------------
# LOT L3 -- THE SIPHON'S BEAM. All eight states of the socle, and nothing else.
#
#   python tools/blender/siphon_beam.py                 build everything
#   python tools/blender/siphon_beam.py --silhouette    build PASS 1 forms
#
# WHY THIS FILE IS A MODULE AND NOT JUST A BUILD SCRIPT. A beam is drawn every
# frame between two points that both move: the tower's hand and an enemy's
# ribcage. There is no static mesh that can be "the beam". So this emits TWO
# things and they are equally the deliverable:
#
#   1. PROFILE GEOMETRY -- the cross-sections, in PROFILES below, as (angle,
#      radius) pairs. A renderer sweeps one of these along whatever polyline it
#      has this frame. They are the reusable part.
#   2. A SPECIFICATION -- SPEC / spec_json(), written out as
#      js/gl/siphon-beam-spec.js, carrying for every state the radius law, the
#      twist law, the scroll law, the bead law, the curve law and the palette.
#      Every law is a formula plus its coefficients, evaluated here so the
#      numbers in the file and the numbers in the reference mesh cannot drift.
#
# and, as the brief asks, the STATIC PIECES are written as real models named
# `siphon-beam-<state>` -- each one the beam built at a canonical run length,
# which is what a silhouette review looks at and what a renderer that does not
# want to sweep anything can instance directly.
#
# THE ONE THING IT MUST SAY AT ALL TIMES: THE BEAM FLOWS TOWARD THE TOWER.
# The socle (section 5) permits exactly four means and forbids an arrow, an icon
# or any interface indicator, so all four here are made of matter:
#
#   GROW    the knots riding the line get bigger the nearer the tower they are
#   SCROLL  they travel toward the tower -- baked as a seamless animation loop,
#           see FLOW GROUPS below
#   CHEVRON every knot is a wedge with its POINT toward the tower; the profile's
#           twist also accumulates toward the tower
#   SPOUT   the body itself swells at the tower end and ends in an intake
#
# and one thing it must NEVER say, which cost this file a rebuild: NOTHING MAY
# POINT AWAY FROM THE TOWER. The first build put a four-pronged forward-raking
# `bite` at the enemy end of five states, and at true scale that end is a
# leaf-bladed spearhead -- one shape, larger and cleaner than every knot on the
# shaft put together, saying the opposite of everything else in the model. Both
# ends are now BLUNT and every barb rakes inward. See `bite` and `spout`.
#
# Every state uses at least two. `thread` -- the weakest state, the one a player
# meets first with no explanation -- uses all four, quietly. FLOW_CUES is the
# table, it is printed by main(), and a state with fewer than two entries is a
# build error.
#
# NO ATTACK PULSE. The fire rate is 10 ticks/second, far too fast to read as
# separate impacts, so the beam is continuous to the eye. The only pulses in
# here are TRANSFER pulses: `tendon`'s peristaltic constrictions and `gold`'s
# grains. It is checked rather than promised -- `_check_no_pulse` asserts that
# every baked frame matrix is a PURE TRANSLATION, so nothing in this file can
# ever swell, flash or beat in time with the gun.
#
# NO SURFACE OF REVOLUTION. The brief's section 2 applies to the beam more
# sharply than to the body, because a beam is the one thing that WANTS to be a
# cylinder. So:
#
#   * no body is a `td.cyl` or a `td.frustum`. Every body is `sweep()`, an
#     extrusion of an explicitly irregular polygon whose radii differ and whose
#     angular steps are uneven. It cannot be revolved into existence.
#   * `_check_profiles` proves that analytically for all nine profiles.
#   * `_check_revolved` proves that no revolved primitive (frustum, cyl, ball,
#     torus -- collars, astragals, knuckles) spans more than REV_SPAN along the
#     run. They are allowed as small non-axial details and nothing else.
#   * `rotation_test()` rasterises the real silhouette and compares angles 90
#     degrees apart, twice: about the world's vertical axis, which is the test
#     the brief writes down, and about the BEAM'S OWN axis, which is the test
#     that actually catches a round beam. Both are printed with their numbers.
#
# GEOMETRY IS AUTHORED IN WORLD SPACE (see td_mesh.build). `parent` picks the
# animated group, it is not a second transform, so every coordinate below is a
# real position on the finished model.
#
# FLOW GROUPS. The knots ride animated groups named `flow_0`..`flow_n`, one per
# stretch of the run. Each group's baked loop translates it along ITS OWN local
# tangent by exactly one knot spacing over FRAMES frames, so frame FRAMES is
# frame 0 with every knot in the next knot's slot -- a seamless scroll with no
# per-frame geometry. Splitting by stretch is what lets a CURVED beam scroll
# correctly: over a short stretch the chord and the arc agree. gl-world.js
# already accepts a per-group matrix override BY NAME (`overrides[grp.name]`),
# so a renderer that wants exact arc-length scrolling drives `flow_*` itself and
# the baked frames are the fallback.
#
# ORIGINS ARE THE SOCLE'S, NOT MINE. HANDS (0.055, 0.305, 1.045) for base, A1,
# A2 and the whole of path B; RING (0.315, 0.395, 1.190) for A3, A4, A5, and the
# switch happens at A3 and only there. The origin follows the TIER, never the
# state: `ramp`, `saturated` and `seeking` all exist on both sides of A3, so
# they are baked at HANDS and the spec carries `originByTier` for the renderer.
# ---------------------------------------------------------------------------

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_mesh as td                                          # noqa: E402

PX_PER_UNIT = 20.0 * 1.529 * 1.04          # td_mesh.UNITS_TO_PX


def R(ul):
    """u.l. -> Blender units, the socle's u_blender = px / 31.8032."""
    return ul / PX_PER_UNIT


# --- the socle's fixed points -----------------------------------------------
# Copied from SIPHON-SOCLE.md section 2 and not re-derived.

HANDS = (0.055, 0.305, 1.045)
RING = (0.315, 0.395, 1.190)

GROUND_R = R(15)                # 0.4717 -- the game footprint, FIXED at 15 u.l.
MAX_HEIGHT = 2.08               # A5/B5's total height; nothing here may pass it

# The canonical run the reference models are built at: 60 u.l., a little under
# the base tier's 75 u.l. range, which is a typical engagement rather than a
# maximum one. Everything in SPEC is expressed in `t`, so the renderer's real
# distance never has to match this.
CANON_UL = 60.0
CANON = R(CANON_UL)                                            # 1.887
TARGET = (-0.14, 1.86, 0.42)    # canonical bite: enemy chest height, off-axis

# Chain's three canonical marks. They are NOT collinear and NOT evenly spaced:
# a chain that bounces in a straight line is a beam with lumps in it.
CHAIN_MARKS = [(-0.14, 1.20, 0.42), (0.62, 1.86, 0.48), (-0.46, 2.32, 0.36)]

FRAMES = 8                      # one scroll period, baked
REV_SPAN = 0.22                 # a revolved primitive may span no more than
                                # this along the run. See _check_revolved.


# --- palettes ---------------------------------------------------------------
# SIPHON-SOCLE.md section 3, verbatim, all three ladders in one table because a
# single state may need base cloth and path colour in the same mesh. Values and
# emissions are the socle's; nothing here invents a colour.

PALETTE = {
    # BASE -- pauvre, terne, humain. No emission anywhere: the base beam is
    # deliberately weak and a weak thing does not glow.
    "cloth_worn":  ("#6B6355", 0.0),
    "cloth_dark":  ("#4A453C", 0.0),
    "hem_fray":    ("#7D735F", 0.0),
    "skin":        ("#B08A66", 0.0),
    "skin_dark":   ("#8A6A4C", 0.0),
    # VOIE A -- l'idole
    "gold":        ("#C9A227", 0.0),
    "gold_dark":   ("#8A6E1C", 0.0),
    "brass":       ("#9A7B3C", 0.0),
    "amber":       ("#D9A441", 0.30),
    "ochre_cloth": ("#A8823E", 0.0),
    "purple_rich": ("#6B3A6E", 0.0),
    "white_warm":  ("#F0E2C0", 0.55),
    # VOIE B -- l'abime
    "abyss":       ("#2A1B3D", 0.0),
    "oil_black":   ("#14101C", 0.0),
    "membrane":    ("#4A4250", 0.0),
    "rose_sick":   ("#E86FA8", 0.70),
    "rose_dim":    ("#7A3A5C", 0.30),
    "tendon":      ("#6B5570", 0.0),
}

BASE_MATS = ("cloth_worn", "cloth_dark", "hem_fray", "skin", "skin_dark")
A_MATS = ("gold", "gold_dark", "brass", "amber", "ochre_cloth", "purple_rich",
          "white_warm")
B_MATS = ("abyss", "oil_black", "membrane", "rose_sick", "rose_dim", "tendon")

SILHOUETTE = dict((k, ("#9AA0A8", 0.0)) for k in PALETTE)


def palette(flat):
    return SILHOUETTE if flat else PALETTE


# ---------------------------------------------------------------------------
# THE PROFILES. This is the reusable half of the deliverable and the reason no
# part of this beam is a surface of revolution.
#
# A profile is a list of (angle, radius) in the cross-plane, angles STRICTLY
# INCREASING so the polygon is star-shaped from its own centre (which is what
# makes a centroid-fan cap valid), radii DELIBERATELY UNEQUAL and angular steps
# DELIBERATELY UNEVEN. Multiply by the local radius, roll by the local twist,
# and sweep. A circle is unreachable from here by construction, and
# `_check_profiles` states the margin in numbers.
#
# Read the shapes: v is up in the beam's own frame, u is to its left.
# ---------------------------------------------------------------------------

PROFILES = {
    # A flattened drop with one keel hanging off it -- barely a section at all,
    # which is the point of the weakest state.
    "THREAD": [(0.00, 0.95), (0.85, 0.72), (2.40, 0.80), (3.55, 0.55),
               (5.05, 1.00)],

    # Two unequal plies with a groove between them: a rope you can count the
    # strands of. `ramp`'s whole texture claim is in these radii alternating.
    "ROPE": [(0.15, 1.00), (0.80, 0.60), (1.75, 0.95), (2.70, 0.50),
             (3.40, 0.92), (4.45, 0.56), (5.50, 1.05)],

    # A ROLLED SECTION -- flange, web, barb. The rope has stopped being rope and
    # become stock, which is how `saturated` reads as another thing entirely
    # rather than as a fatter `ramp`.
    "RAIL": [(0.00, 1.12), (0.55, 0.55), (1.30, 1.05), (2.05, 0.48),
             (2.80, 0.62), (3.50, 1.18), (4.20, 0.42), (4.95, 0.95),
             (5.75, 0.50)],

    # A slack strap seen edge-on: wide across, almost nothing tall. A dead line
    # lies down; it does not stay round.
    "DROOP": [(0.15, 1.18), (2.10, 0.28), (3.30, 1.05), (5.15, 0.22)],

    # A drawn bar with one flat casting face. Dense and opaque, not luminous.
    "INGOT": [(0.20, 1.00), (0.85, 0.88), (2.15, 0.70), (3.05, 0.98),
              (4.30, 0.58), (5.45, 0.90)],

    # FLUTED, and fluted only on part of its perimeter, with a keel under it.
    # An evenly fluted column is still a revolution; this one is not.
    "FLUTE": [(0.00, 1.00), (0.42, 0.74), (0.90, 1.00), (1.35, 0.74),
              (1.85, 1.00), (2.35, 0.72), (2.95, 1.02), (3.90, 0.60),
              (4.70, 1.12), (5.60, 0.70)],

    # An ovoid pushed off its own centre with a ridge where the fibre bundle
    # runs. Meat, not light.
    "SHEATH": [(0.30, 0.86), (1.10, 1.08), (2.30, 0.68), (3.15, 0.80),
               (4.35, 1.14), (5.55, 0.60)],

    # Angular, squared-off, forged. A link, not a beam.
    "LINK": [(0.35, 1.05), (1.55, 0.70), (2.60, 1.00), (3.95, 0.60),
             (5.05, 0.95)],

    # The knot's own section. Four points, none of them at a right angle to any
    # other, so a knot rolled by the local twist reads as a facet turning.
    "BEAD": [(0.25, 1.00), (1.65, 0.66), (3.05, 0.94), (4.55, 0.58)],
}


# --- small vector helpers ---------------------------------------------------

def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _mul(a, k):
    return (a[0] * k, a[1] * k, a[2] * k)


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _len(a):
    return math.sqrt(_dot(a, a))


def _norm(a):
    n = _len(a) or 1e-9
    return (a[0] / n, a[1] / n, a[2] / n)


def _lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def _axis(a, b):
    """(rotation, length) putting a primitive's +Z along a -> b."""
    d = _sub(b, a)
    length = _len(d) or 1e-9
    return (0.0, math.acos(max(-1.0, min(1.0, d[2] / length))),
            math.atan2(d[1], d[0])), length


# --- the sweep --------------------------------------------------------------
# The one thing in this file that is not a td_mesh primitive, and it exists for
# exactly one reason: every documented primitive that could carry a beam's body
# -- cyl, frustum, tube -- IS a surface of revolution, and the socle's section 7
# records that the last Siphon was deleted for building its robe out of one.
#
# It obeys td_mesh's contract to the letter: world-space vertices, planar convex
# faces, an optional per-face material list, handed to scene.add as a
# td_mesh.Mesh. build() cannot tell it from a frustum.

def sweep(s, name, pts, radii, twists, profile, mats, parent, cap=True):
    """Extrude `profile` along the polyline `pts`.

    `radii` and `twists` are per station; `mats` is per station and the band
    between station i and i+1 takes mats[i], which is how a colour ripens ALONG
    a run instead of across it. Frames are parallel-transported, so a curved
    run does not spin its own section as a side effect of bending.
    """
    n = len(pts)
    prof = PROFILES[profile] if isinstance(profile, str) else profile
    p = len(prof)

    tans = []
    for i in range(n):
        if i == 0:
            d = _sub(pts[1], pts[0])
        elif i == n - 1:
            d = _sub(pts[-1], pts[-2])
        else:
            d = _sub(pts[i + 1], pts[i - 1])
        tans.append(_norm(d))

    # Seed the frame with whichever world axis is least parallel to the run,
    # then transport it -- a fixed seed flips the section over on a run that
    # happens to point at it.
    seed = (0, 0, 1) if abs(tans[0][2]) < 0.9 else (1, 0, 0)
    u = _norm(_sub(seed, _mul(tans[0], _dot(seed, tans[0]))))
    frames = []
    for i in range(n):
        u = _norm(_sub(u, _mul(tans[i], _dot(u, tans[i]))))
        frames.append((u, _cross(tans[i], u)))

    verts = []
    for i in range(n):
        fu, fv = frames[i]
        for (th, r) in prof:
            a = th + twists[i]
            k = r * radii[i]
            verts.append(_add(pts[i], _add(_mul(fu, math.cos(a) * k),
                                           _mul(fv, math.sin(a) * k))))

    faces, fmats = [], []
    for i in range(n - 1):
        for j in range(p):
            k = (j + 1) % p
            faces.append((i * p + j, i * p + k, (i + 1) * p + k,
                          (i + 1) * p + j))
            fmats.append(mats[i])
    if cap:
        c0 = len(verts)
        verts.append(pts[0])
        for j in range(p):
            faces.append((c0, (j + 1) % p, j))
            fmats.append(mats[0])
        c1 = len(verts)
        verts.append(pts[-1])
        base = (n - 1) * p
        for j in range(p):
            faces.append((c1, base + j, base + (j + 1) % p))
            fmats.append(mats[-1])

    m = s.add(td.Mesh(name, verts, faces, mats[0], parent))
    m.face_mats = fmats
    return m


# --- the run ----------------------------------------------------------------
# t = 0 AT THE TOWER, t = 1 AT THE TARGET, everywhere in this file and in the
# spec. The flow travels from t = 1 to t = 0. Fixing that once is what lets
# every law below be read the same way round.

def run_path(origin, target, n, sag=0.0, sway=0.0, kink=0.0, kink_n=5.0,
             rise=0.0):
    """Stations from tower to target. `sag` drops the middle, `sway` bows it
    sideways, `rise` lifts it (an arch rather than a rope), `kink` adds the
    high-frequency nervousness path B needs. All three fall to zero at both
    ends, so the beam always meets its two anchors cleanly."""
    d = _sub(target, origin)
    perp = _norm((d[1], -d[0], 0.0))
    pts = []
    for i in range(n):
        t = i / float(n - 1)
        p = _lerp(origin, target, t)
        w = math.sin(math.pi * t)
        wobble = math.sin(kink_n * math.pi * t) * w
        p = _add(p, _mul(perp, sway * w + kink * wobble * 0.6))
        pts.append((p[0], p[1], p[2] - sag * w + rise * w
                    + kink * wobble * 0.35))
    return pts


def taus(n):
    """The station parameter, tower to target."""
    return [i / float(n - 1) for i in range(n)]


def _s(t):
    """(1 - t), clamped. The laws are defined on t in [0, 1]; the knots are
    authored a little PAST both ends so the scroll loop has no pop-in, and a
    negative base under a fractional power is a complex number, not a beam."""
    return max(0.0, min(1.0, 1.0 - t))


def swallowed(t):
    """SIZE OF A RIDER THAT HAS PASSED THE INTAKE, as a fraction.

    Every rider -- knot, grain, constriction, link -- is authored a little PAST
    t = 0 so the scroll loop has nothing to pop in from. That was fine while
    they were small, and became the worst artefact in the lot the moment they
    were made to GROW toward the tower: the last one sits beyond the mouth,
    at the biggest radius the law can produce, unattached to the body, and a
    capture of `thread`, `ramp` and `chain` all showed the same thing -- a pale
    wedge floating past the tower end, which is exactly the free-standing icon
    the socle forbids, and it was the largest single shape on the base beam.

    It cannot simply be deleted (the loop needs it) and it must not merely
    shrink everywhere (the growth toward the tower IS the cue). So it is EATEN:
    full size right up to the mouth, then collapsing over the last fifth of a
    knot spacing. The tower does not hold what it has swallowed.
    """
    if t >= 0.04:
        return 1.0
    return max(0.10, 1.0 - (0.04 - t) * 9.0)


def law_radius(t, r_target, r_tower, power):
    """r(t) = r_target + (r_tower - r_target) * (1 - t)^power.

    ONE law for every state. The swelling toward the tower is not decoration:
    it is the socle's fourth permitted means of stating the flow direction, so
    it is written once and every state's numbers are read off it."""
    return r_target + (r_tower - r_target) * (_s(t) ** power)


def law_twist(t, total, power):
    """twist(t) = total * (1 - t)^power. Power > 1 piles the turns up near the
    tower, which is the socle's 'the material scrolls FASTER as it climbs'
    written into the geometry rather than left to a shader."""
    return total * (_s(t) ** power)


def law_scroll(t, base, gain, power):
    """Scroll speed at t, toward the tower. Same shape as the twist so the
    animation and the mesh agree about where the beam is hurrying."""
    return base * (1.0 + gain * (_s(t) ** power))


def grade(stops, ts):
    """Per-station materials from (t, material) stops. The stop that owns a
    station is the last one at or before it, so a band changes colour AT a
    named t rather than by an interpolation nobody can point at."""
    out = []
    for t in ts:
        mat = stops[0][1]
        for (u, m) in stops:
            if t >= u:
                mat = m
        out.append(mat)
    return out


# --- the flow groups --------------------------------------------------------

class Flow(object):
    """One scrolling stretch. Its node translates along `dir` by `step` over
    the whole loop -- `dir` is the LOCAL tangent, negated, because the flow goes
    toward the tower and the tangent points away from it."""

    def __init__(self, scene, root, index, direction, step):
        self.node = scene.node("flow_%d" % index, parent=root, animated=True)
        self.dir = _norm(direction)
        self.step = step


def flow_pose(flows):
    def pose(f):
        a = (f % FRAMES) / float(FRAMES)
        for fl in flows:
            fl.node.location = [-fl.dir[0] * fl.step * a,
                                -fl.dir[1] * fl.step * a,
                                -fl.dir[2] * fl.step * a]
    return pose


def knots(s, root, flows, pts, ts, spacing, radius_of, twist_of, mat, profile,
          count, t_from=1.06, t_to=-0.05, tag="k", stretch=4, proud=1.30):
    """THE KNOTS -- the chevrons that carry the flow direction.

    Each is a wedge swept from a tiny face at its TOWER side to a full one at
    its target side, so its point leads toward the tower. They are graded by
    `radius_of`, so a knot near the tower is visibly larger than one out at the
    enemy, and they are handed to `stretch` flow groups by position so a curved
    beam still scrolls along itself.

    A knot is authored proud of the body it rides, which is what makes it a
    knot in a rope rather than a bulge in a tube -- and it is proud by MORE the
    nearer the tower it is, so the growth is the body's taper and the knot's
    own swelling multiplied together rather than the taper alone. Measured off
    the built mesh, `thread`'s knots used to run 0.032 -> 0.057, a 1.8x that no
    capture could show; they now run 0.021 -> 0.078, 3.7x, which is the
    difference between a cue that is present in the numbers and one that is
    present on the screen.
    """
    made = []
    span = t_from - t_to
    for i in range(count):
        t = t_from - span * i / float(count - 1)
        c = _sample(pts, ts, t)
        # The wedge runs along the local tangent: tail toward the target,
        # point toward the tower.
        #
        # SAMPLED UNCLAMPED. This used to read `min(1.0, t + 0.02)` and
        # `max(0.0, t - 0.02)`, and the knots are deliberately authored PAST
        # both ends of the run so the scroll loop has no pop-in -- so at
        # t = 1.06 both clamps fired, the two samples came back in the wrong
        # order and that knot's wedge pointed at the ENEMY. One knot in
        # fourteen, at the end of the beam, pointing the wrong way. _sample
        # extrapolates outside [0, 1] on purpose; let it.
        tan = _norm(_sub(_sample(pts, ts, t + 0.02),
                         _sample(pts, ts, t - 0.02)))
        tc = max(0.0, min(1.0, t))
        sw = swallowed(t)
        r = radius_of(tc) * proud * (0.72 + 0.60 * (1.0 - tc)) * sw
        # Its LENGTH goes with it. Shrinking only the radius left the swallowed
        # knot as a hair-thin needle a knot-length long, sticking out past the
        # intake -- less of a badge than the wedge was, but still a mark
        # floating off the end of the beam, and a capture showed it plainly.
        half = spacing * 0.34 * (0.28 + 0.72 * sw)
        tip = _add(c, _mul(tan, -half))
        tail = _add(c, _mul(tan, half))
        g = min(stretch - 1, int((1.0 - max(0.0, min(1.0, t))) * stretch))
        made.append(sweep(s, "%s_%d" % (tag, i), [tip, tail],
                          [r * 0.16, r], [twist_of(t), twist_of(t) + 0.55],
                          profile, [mat, mat], flows[g].node))
    return made


def _arc(pts):
    return sum(_len(_sub(pts[i + 1], pts[i])) for i in range(len(pts) - 1))


def spacing_of(pts, t_from, t_to, count):
    """THE ONE NUMBER THAT MAKES THE LOOP SEAMLESS, and it is derived rather
    than typed.

    A flow group translates by exactly one knot spacing over FRAMES frames, so
    frame FRAMES is frame 0 with every knot in the next knot's slot. That is
    only true if the translation and the gap between knots are the same number.
    Written by hand they were not -- thread's eleven knots over a t-span of 1.11
    on a 1.90 run sit 0.211 apart, and the loop was being translated 0.170, so
    it stepped 20% short every cycle and the scroll juddered. It is now measured
    off the polyline the knots were actually placed on."""
    return _arc(pts) * (t_from - t_to) / float(count - 1)


def _sample(pts, ts, t):
    """Point on the polyline at parameter t. Stations are dense enough that a
    straight interpolation between them is the curve."""
    if t <= ts[0]:
        d = _sub(pts[1], pts[0])
        return _add(pts[0], _mul(d, (t - ts[0]) / (ts[1] - ts[0])))
    if t >= ts[-1]:
        d = _sub(pts[-1], pts[-2])
        return _add(pts[-1], _mul(d, (t - ts[-1]) / (ts[-1] - ts[-2])))
    for i in range(len(ts) - 1):
        if ts[i] <= t <= ts[i + 1]:
            f = (t - ts[i]) / (ts[i + 1] - ts[i])
            return _lerp(pts[i], pts[i + 1], f)
    return pts[-1]


# --- revolved details, tracked -----------------------------------------------
# Every revolved primitive this file uses goes through one of these, and each
# one records the mesh so `_check_revolved` can measure how far it reaches
# along the run. That is the mechanical guarantee behind "td.frustum is fine for
# small non-axial details; the BODY is never one".

REVOLVED = []


def _rev(mesh):
    REVOLVED.append(mesh)
    return mesh


def collar(s, name, at, direction, r_lo, r_hi, height, mat, parent, verts=6):
    rot, _ = _axis(at, _add(at, direction))
    return _rev(td.frustum(s, name, r_lo, r_hi, height, at, mat, parent, verts,
                           rot))


def ring(s, name, at, direction, major, minor, mat, parent, seg=8, minor_seg=4):
    rot, _ = _axis(at, _add(at, direction))
    return _rev(td.torus(s, name, major, minor, at, rot, mat, parent, seg,
                         minor_seg))


def bead_ball(s, name, r, at, mat, parent, seg=5, rings=3):
    return _rev(td.ball(s, name, r, at, mat, parent, seg, rings))


# --- the tower end ----------------------------------------------------------

def spout(s, node, origin, tan, r, mat, lip, vane, scale=1.0, vanes=3):
    """THE INTAKE. The socle's fourth permitted means: the beam swells where it
    enters the tower, like water at a spout.

    The vanes are the anti-revolution clause of this part -- there are an odd
    number of them, at UNEVEN angles, of UNEQUAL length, all on the same side.
    A ring of four even vanes would put the whole intake back on the lathe.
    """
    # WHY THE VANES ARE SWEPT LIPS AND NOT BOXES ANY MORE. They were three flat
    # plates standing r*1.55 OFF the line, and a capture of `thread` at the
    # tower end showed exactly what that is on screen: a pale triangular shard
    # floating beside the beam, unattached to anything, the single most
    # icon-like element in the eight states. The socle forbids an icon at the
    # tower end more sharply than anywhere else, because that is where the eye
    # goes. They are now three lips SWEPT INTO the mouth -- they start out wide
    # on the run side and are drawn down into the throat, so they read as
    # matter being swallowed and the silhouette they make is a swelling rather
    # than a badge.
    #
    # THE BELL IS ALSO LONGER. At 0.095 along the run it was a knurled boss,
    # read as a spear's ferrule; over 0.150 it is a flare, which is what "like
    # water at a spout" means. Still well inside REV_SPAN, which _check_revolved
    # proves rather than trusts.
    a = _add(origin, _mul(tan, 0.015 * scale))
    b = _add(origin, _mul(tan, 0.165 * scale))
    collar(s, "spout_bell", _lerp(a, b, 0.5), tan, r * 1.95 * scale,
           r * 1.00 * scale, _len(_sub(b, a)), mat, node, 7)
    ring(s, "spout_lip", a, tan, r * 1.70 * scale, r * 0.30 * scale, lip, node,
         8, 4)
    # The lips: uneven angles, uneven lengths, one side, and every one of them
    # narrowing TOWARD the mouth so the taper is one more statement of flow.
    fu = _norm(_sub((0, 0, 1), _mul(tan, _dot((0, 0, 1), tan))))
    fv = _cross(tan, fu)
    for i, (ang, ln) in enumerate(
            [(0.42, 1.00), (1.35, 0.68), (2.55, 0.86)][:vanes]):
        off = _add(_mul(fu, math.cos(ang) * r * scale),
                   _mul(fv, math.sin(ang) * r * scale))
        p0 = _add(_add(b, _mul(tan, 0.030 * scale * ln)), _mul(off, 1.70 * ln))
        p1 = _add(_lerp(a, b, 0.45), _mul(off, 1.30 * ln))
        p2 = _add(_add(a, _mul(tan, -0.020 * scale)), _mul(off, 0.45))
        sweep(s, "spout_lip_%d" % i, [p0, p1, p2],
              [r * 0.13 * scale * ln, r * 0.24 * scale * ln,
               r * 0.30 * scale], [ang, ang + 0.5, ang + 1.1], "BEAD",
              [vane, vane, vane], node)


def bite(s, node, at, tan, r, mat, mat2, prongs=3, spread=1.7, length=1.15):
    """THE TARGET END, AND IT RAKES BACKWARD.

    THIS WAS THE WORST THING IN THE LOT AND IT IS WORTH WRITING DOWN. The
    prongs used to project FORWARD -- `at + tan*r*1.9 + off` -- four of them
    converging past the contact point. On a capture of `thread` at true scale
    that end of the beam is a leaf-bladed SPEARHEAD, and a spearhead is a
    direction: it said the tower was stabbing outward at the enemy, which is
    the exact opposite of the one thing the socle says a player must read
    unaided. It also made the whole state read as a weapon rather than a
    siphon, and it came close to the forbidden impact indicator.

    They now rake BACK toward the tower from a root just past the contact
    point: barbs that have gone in and are being dragged inward, so the only
    points at the far end lead the eye up the beam. Nothing projects past the
    bite, so the silhouette there is BLUNT -- a taper that ends in a point is
    an arrow whatever the knots on the shaft are doing.
    """
    fu = _norm(_sub((0, 0, 1), _mul(tan, _dot((0, 0, 1), tan))))
    fv = _cross(tan, fu)
    # Pulled back behind the contact point, and smaller: it is a grip, not a
    # head. Nothing here may be the biggest thing on the beam.
    bead_ball(s, "bite_knot", r * 0.88, _add(at, _mul(tan, -r * 0.30)), mat2,
              node, 6, 3)
    for i, (ang, ln) in enumerate([(0.30, 1.00), (2.10, 0.62), (3.90, 0.84),
                                   (5.10, 0.48)][:prongs]):
        off = _add(_mul(fu, math.cos(ang) * r * spread),
                   _mul(fv, math.sin(ang) * r * spread))
        root = _add(at, _mul(tan, r * 0.34))
        mid = _add(_add(at, _mul(tan, -r * length * 0.45 * ln)),
                   _mul(off, 0.75 * ln))
        tip = _add(_add(at, _mul(tan, -r * length * 1.30 * ln)),
                   _mul(off, 1.05 * ln))
        sweep(s, "bite_prong_%d" % i, [root, mid, tip],
              [r * 0.62, r * 0.40, r * 0.09], [ang, ang + 0.3, ang + 0.7],
              "BEAD", [mat, mat, mat], node)


# ---------------------------------------------------------------------------
# THE EIGHT STATES.
#
# Each returns the list of Flow groups it made (so build_state can pose them)
# and appends to BODY_STARTS the tower-end point of every BODY sweep it lays --
# which is how `chain` proves it does not split at the source.
# ---------------------------------------------------------------------------

BODY_STARTS = []


def _body(s, node, name, pts, radii, twists, profile, mats):
    BODY_STARTS.append(pts[0])
    return sweep(s, name, pts, radii, twists, profile, mats, node)


# --- thread -----------------------------------------------------------------

def state_thread(s, node, root):
    """BASE, NO RAMP. Pale, thin, regular, no sparkle -- and it has to teach the
    player the whole tower's grammar with none of those tools.

    So it spends what little it has entirely on the flow direction, and uses all
    four permitted means at their quietest: the body swells toward the hands and
    ends in a small spout; ten even knots crawl toward the hands, growing as
    they go, each one a wedge with its point leading. Nothing emits. `skin` and
    `skin_dark` are the palest things the base ladder owns and they are also the
    right colour by argument, not by default: what is coming up this thread is a
    living thing's life, and it is the only part of the tower that shows it.
    """
    n = 20
    ts = taus(n)
    pts = run_path(HANDS, TARGET, n, sag=0.030, sway=0.022)
    # THE POWER IS 1.35 AND IT USED TO BE 2.6, WHICH IS WHY THE SWELL DID NOT
    # READ. (1 - t)^2.6 is still only 0.16 at the middle of the run: nine
    # tenths of the beam sat at the target radius and the whole taper happened
    # in the last quarter, so a capture showed a line of constant thickness
    # with a lump on the end -- and a constant line with a lump on the end has
    # no direction in it. At 1.35 the swell is 39% of the way by mid-run, which
    # is a taper the eye can follow along the WHOLE beam. The endpoints moved
    # with it (0.0180 at the enemy, 0.0400 at the hands) so the ratio is 2.2x
    # rather than 1.8x while the thread stays as thin as the socle asks.
    rad = lambda t: law_radius(t, 0.0180, 0.0400, 1.35)
    tw = lambda t: law_twist(t, 0.62, 1.0)
    radii = [rad(t) for t in ts]
    twists = [tw(t) for t in ts]
    mats = grade([(0.0, "skin"), (0.34, "skin_dark"), (0.72, "cloth_worn")], ts)
    _body(s, node, "thread", pts, radii, twists, "THREAD", mats)

    # A second, thinner filament twisted loosely around the first. It is what
    # keeps the line from reading as a drawn stroke: two strands say "rope
    # forming", one says "line art".
    off = []
    for i, t in enumerate(ts):
        c = pts[i]
        tan = _norm(_sub(pts[min(n - 1, i + 1)], pts[max(0, i - 1)]))
        fu = _norm(_sub((0, 0, 1), _mul(tan, _dot((0, 0, 1), tan))))
        fv = _cross(tan, fu)
        a = 2.4 * (1.0 - t) + 0.7
        off.append(_add(c, _add(_mul(fu, math.cos(a) * radii[i] * 1.15),
                                _mul(fv, math.sin(a) * radii[i] * 1.15))))
    sweep(s, "thread_ply", off, [r * 0.42 for r in radii], twists, "BEAD",
          ["hem_fray"] * n, node)

    sp = spacing_of(pts, 1.06, -0.05, 14)
    flows = [Flow(s, root, i, _sub(TARGET, HANDS), sp) for i in range(4)]
    knots(s, root, flows, pts, ts, sp, rad, tw, "hem_fray", "BEAD", 14,
          proud=1.55)

    tan = _norm(_sub(TARGET, HANDS))
    spout(s, node, HANDS, tan, 0.0400, "skin_dark", "cloth_dark", "cloth_worn")
    bite(s, node, TARGET, tan, 0.0180, "skin_dark", "cloth_dark", 3)
    return flows


# --- ramp -------------------------------------------------------------------

def state_ramp(s, node, root):
    """LOCKED AND THICKENING. The socle asks for three things at once and they
    are three different mechanisms here, not three settings of one:

      thickens CONTINUOUSLY -- `rampT` in the spec drives law_radius between
        thread's numbers and saturated's. This mesh is baked at rampT = 0.60,
        which is a beam mid-climb rather than either end of it.
      thread -> twisted rope -- the section changes from THREAD to ROPE, so it
        is not the same line getting fatter: it grows a second ply and a groove
        between them, and a real counter-wound strand rides in that groove.
      scrolls FASTER as it climbs -- law_twist's power is 1.85, so the turns
        pile up toward the hands. The spec's scroll law uses the same shape, and
        the knots are spaced to match, so mesh and motion cannot disagree.
    """
    n = 15
    ts = taus(n)
    pts = run_path(HANDS, TARGET, n, sag=0.024, sway=0.030)
    # 1.40 for the same reason `thread`'s is 1.35: the swell has to be spread
    # along the run to be a direction rather than a lump. The twist keeps its
    # steep 1.85 -- THAT one is supposed to pile up near the hands, and it is
    # the property this state is named for.
    rad = lambda t: law_radius(t, 0.0300, 0.0625, 1.40)
    tw = lambda t: law_twist(t, 3.40, 1.85)
    radii = [rad(t) for t in ts]
    twists = [tw(t) for t in ts]
    mats = grade([(0.0, "brass"), (0.30, "ochre_cloth"), (0.66, "hem_fray"),
                  (0.88, "cloth_worn")], ts)
    _body(s, node, "ramp", pts, radii, twists, "ROPE", mats)

    # THE COUNTER-PLY, wound the other way. Two strands turning in opposite
    # directions is what a rope looks like and what a glowing tube does not.
    off = []
    for i, t in enumerate(ts):
        tan = _norm(_sub(pts[min(n - 1, i + 1)], pts[max(0, i - 1)]))
        fu = _norm(_sub((0, 0, 1), _mul(tan, _dot((0, 0, 1), tan))))
        fv = _cross(tan, fu)
        a = -tw(t) * 1.25 + 2.1
        k = radii[i] * 1.02
        off.append(_add(pts[i], _add(_mul(fu, math.cos(a) * k),
                                     _mul(fv, math.sin(a) * k))))
    sweep(s, "ramp_ply", off, [r * 0.40 for r in radii],
          [-t2 for t2 in twists], "BEAD", ["gold_dark"] * n, node)

    sp = spacing_of(pts, 1.06, -0.05, 13)
    flows = [Flow(s, root, i, _sub(TARGET, HANDS), sp) for i in range(4)]
    knots(s, root, flows, pts, ts, sp, rad, tw, "amber", "BEAD", 13)

    tan = _norm(_sub(TARGET, HANDS))
    spout(s, node, HANDS, tan, 0.0625, "brass", "gold_dark", "ochre_cloth")
    bite(s, node, TARGET, tan, 0.0300, "brass", "gold_dark", 3)
    return flows


# --- saturated --------------------------------------------------------------

def state_saturated(s, node, root):
    """THE RAMP'S CEILING, AND ANOTHER THING ENTIRELY.

    The socle is explicit that this must not read as a bigger `ramp`, so every
    property of `ramp` is contradicted rather than scaled:

      the twist STOPS. `ramp` accumulates turns; this has ONE hard quarter-turn
        at a single joint and is rigid either side of it. The rope has seized.
      the radius is STEPPED, not graded -- four drums with hard shoulders,
        because it is stock now and stock comes in sizes.
      the section is RAIL: flange, web, barb. Rolled, not spun.
      the knots have become a CONTINUOUS HELICAL RIDGE wound around the rail --
        the individual grains have fused into one thread of screw.
      a WHITE-WARM SPINE runs inside the web slot, visible only edge-on.

    What survives from `ramp` is the direction, and it survives four times over.
    """
    n = 14
    ts = taus(n)
    pts = run_path(HANDS, TARGET, n, sag=0.012, sway=0.018)

    def rad(t):
        # Four drums. The shoulders are the state's signature: a smooth taper
        # here would have made it a fat rope again.
        step = min(3, int((1.0 - t) * 4.0))
        return 0.0455 + step * 0.0125

    def tw(t):
        return 0.35 + (0.90 if t < 0.55 else 0.0)

    radii = [rad(t) for t in ts]
    twists = [tw(t) for t in ts]
    mats = grade([(0.0, "amber"), (0.18, "gold_dark"), (0.46, "ochre_cloth"),
                  (0.80, "brass")], ts)
    _body(s, node, "saturated", pts, radii, twists, "RAIL", mats)

    # THE SPINE in the web slot: thin, hot, and only visible from the side the
    # web opens onto -- which is another angle at which this model is not the
    # same as any other angle.
    spine = []
    for i, t in enumerate(ts):
        tan = _norm(_sub(pts[min(n - 1, i + 1)], pts[max(0, i - 1)]))
        fu = _norm(_sub((0, 0, 1), _mul(tan, _dot((0, 0, 1), tan))))
        fv = _cross(tan, fu)
        a = 2.42 + twists[i]
        k = radii[i] * 0.46
        spine.append(_add(pts[i], _add(_mul(fu, math.cos(a) * k),
                                       _mul(fv, math.sin(a) * k))))
    sweep(s, "sat_spine", spine, [r * 0.26 for r in radii], twists, "BEAD",
          ["white_warm"] * n, node)

    # THE HELICAL RIDGE. Sixteen stations of a thin sweep wound round the rail,
    # its pitch TIGHTENING toward the hands -- the scroll made permanent.
    hel_n = 22
    hpts, hrad = [], []
    for i in range(hel_n):
        t = 1.04 - 1.10 * i / float(hel_n - 1)
        c = _sample(pts, ts, t)
        tan = _norm(_sub(_sample(pts, ts, t + 0.03),
                         _sample(pts, ts, t - 0.03)))
        fu = _norm(_sub((0, 0, 1), _mul(tan, _dot((0, 0, 1), tan))))
        fv = _cross(tan, fu)
        tc = max(0.0, min(1.0, t))
        a = -9.0 * ((1.0 - tc) ** 1.5)
        k = rad(tc) * 1.16
        hpts.append(_add(c, _add(_mul(fu, math.cos(a) * k),
                                 _mul(fv, math.sin(a) * k))))
        hrad.append(rad(tc) * 0.26)
    # The screw's MEAN pitch: 9 turns over the run. It is a mean and not the
    # pitch, because the pitch deliberately tightens toward the hands and a
    # variable-pitch screw cannot be scrolled seamlessly by a rigid translation.
    # The baked loop is therefore an approximation of this one state and the
    # spec's scroll law is the truth; every other state's loop is exact.
    flows = [Flow(s, root, 0, _sub(TARGET, HANDS), _arc(pts) / 9.0)]
    sweep(s, "sat_helix", hpts, hrad, [0.0] * hel_n, "BEAD",
          ["amber"] * hel_n, flows[0].node)

    # The shoulders between drums: hard collars with a barb on ONE side.
    tan = _norm(_sub(TARGET, HANDS))
    for i, t in enumerate((0.75, 0.50, 0.25)):
        c = _sample(pts, ts, t)
        ring(s, "sat_shoulder_%d" % i, c, tan, rad(t) * 1.30, rad(t) * 0.24,
             "gold_dark", node, 7, 4)
        td.box(s, "sat_barb_%d" % i,
               (rad(t) * 0.5, rad(t) * 0.9, rad(t) * 2.1),
               _add(c, (0.0, 0.0, rad(t) * 1.5)),
               (0, 0, 0.5 + i * 0.7), "brass", node)

    spout(s, node, HANDS, tan, 0.0830, "gold_dark", "amber", "ochre_cloth",
          scale=1.10)
    bite(s, node, TARGET, tan, 0.0455, "gold_dark", "brass", 4, spread=2.0)
    return flows


# --- seeking ----------------------------------------------------------------

def state_seeking(s, node, root):
    """THE TARGET DIED. Detached, drooped, sweeping and groping.

    Nothing is holding the far end up, so nothing does: the run leaves the hands
    still aimed, falls through a real sag, swings sideways, and stops a long way
    short of anywhere. The last third comes apart into three filaments of
    unequal length curling in three directions -- that is the groping, and it is
    the only place in this file where geometry is allowed to look undecided.

    It still flows toward the tower, and the state SAYS SO BY DRAINING: the line
    tapers to almost nothing at the free end because there is nothing feeding it
    any more, and the knots that remain still crawl inward. A dead beam that
    simply lay there would tell the player the tower had stopped, which is not
    what is happening.
    """
    n = 18
    ts = taus(n)
    free = (-0.52, 1.02, 0.20)
    pts = run_path(HANDS, free, n, sag=0.30, sway=0.16, kink=0.030, kink_n=3.0)
    rad = lambda t: law_radius(t, 0.0085, 0.0330, 1.35)
    tw = lambda t: law_twist(t, 1.10, 0.8) + math.sin(t * 7.0) * 0.28
    radii = [rad(t) for t in ts]
    twists = [tw(t) for t in ts]
    mats = grade([(0.0, "cloth_worn"), (0.28, "hem_fray"),
                  (0.62, "cloth_dark")], ts)
    _body(s, node, "seeking", pts, radii, twists, "DROOP", mats)

    # THE THREE GROPING FILAMENTS. Unequal lengths, unequal curls, unequal
    # radii, and all three fall away from the run rather than continuing it.
    tip = pts[-1]
    tan = _norm(_sub(pts[-1], pts[-3]))
    fu = _norm(_sub((0, 0, 1), _mul(tan, _dot((0, 0, 1), tan))))
    fv = _cross(tan, fu)
    for i, (ang, ln, curl) in enumerate([(0.5, 1.00, 1.5), (2.6, 0.62, -2.2),
                                         (4.3, 0.80, 0.8)]):
        fn = 8
        fpts, frad = [], []
        for j in range(fn):
            u = j / float(fn - 1)
            a = ang + curl * u * u
            reach = 0.30 * ln * u
            p = _add(tip, _add(_mul(tan, reach * 0.55),
                               _add(_mul(fu, math.cos(a) * reach * 0.75),
                                    _mul(fv, math.sin(a) * reach * 0.75))))
            fpts.append((p[0], p[1], p[2] - 0.13 * ln * u * u))
            frad.append(0.0095 * (1.0 - 0.72 * u))
        sweep(s, "grope_%d" % i, fpts, frad, [a * 0.0 for a in range(fn)],
              "BEAD", ["cloth_dark"] * fn, node)

    # A SECOND STRAND, COME LOOSE. It parted somewhere along the run and now
    # hangs below the first, still tied at both ends -- which is the difference
    # between a beam that has been dropped and one that was drawn slack on
    # purpose. It is also why this state has no straight edge anywhere.
    ln = 14
    lpts, lrad = [], []
    for i in range(ln):
        u = i / float(ln - 1)
        t = 0.10 + 0.72 * u
        c = _sample(pts, ts, t)
        w = math.sin(math.pi * u)
        lpts.append((c[0] + 0.055 * w, c[1] - 0.030 * w,
                     c[2] - 0.145 * w - 0.02 * math.sin(u * 9.0) * w))
        lrad.append(rad(t) * 0.34)
    sweep(s, "loose_strand", lpts, lrad, [tw(0.10 + 0.72 * (i / float(ln - 1)))
                                          for i in range(ln)], "BEAD",
          ["cloth_dark"] * ln, node)

    # Sparse knots, and NONE in the last third: the far end has nothing in it.
    sp = spacing_of(pts, 0.66, -0.05, 9)
    flows = [Flow(s, root, i, _sub(free, HANDS), sp) for i in range(4)]
    knots(s, root, flows, pts, ts, sp, rad, tw, "hem_fray", "BEAD", 9,
          t_from=0.66, t_to=-0.05)

    spout(s, node, HANDS, _norm(_sub(pts[1], pts[0])), 0.0330, "cloth_dark",
          "cloth_worn", "hem_fray", scale=0.85)
    return flows


# --- gold -------------------------------------------------------------------

def state_gold(s, node, root):
    """PATH A. Amber at the enemy, TRUE GOLD at the ring, opaque and dense, with
    gold grains rising along it toward the ring.

    Dense is the whole job: this is the only state that should look like it
    weighs something. So the section is INGOT -- a drawn bar with a flat casting
    face -- the twist is slow, the sag is almost nothing (metal that has set),
    and the colour RIPENS along the run in named bands rather than fading:
    amber, brass, gold_dark, gold, and a white_warm collar in the last hand's
    breadth before the ring. That ripening is itself a statement of direction --
    the material is visibly further along its journey the closer it gets.

    The grains are CAST BOXES, not sparks. They ride the surface, they grow
    toward the ring, and they climb it. Origin is RING: A3 is where the sceptre
    arrives and where the beam stops coming out of the hands.
    """
    n = 18
    ts = taus(n)
    pts = run_path(RING, TARGET, n, sag=0.016, sway=-0.026)
    rad = lambda t: law_radius(t, 0.0420, 0.0820, 1.55)
    tw = lambda t: law_twist(t, 1.15, 1.30)
    radii = [rad(t) for t in ts]
    twists = [tw(t) for t in ts]
    mats = grade([(0.0, "white_warm"), (0.09, "gold"), (0.34, "gold_dark"),
                  (0.62, "brass"), (0.84, "amber")], ts)
    _body(s, node, "gold", pts, radii, twists, "INGOT", mats)

    # THE POUR SEAM. One raised bead of gold running the whole length on ONE
    # side only, the way a cast bar carries its mould line. It is a second
    # reason no view of this beam matches the view 90 degrees away.
    seam = []
    for i, t in enumerate(ts):
        tan = _norm(_sub(pts[min(n - 1, i + 1)], pts[max(0, i - 1)]))
        fu = _norm(_sub((0, 0, 1), _mul(tan, _dot((0, 0, 1), tan))))
        fv = _cross(tan, fu)
        a = 1.05 + twists[i]
        k = radii[i] * 0.92
        seam.append(_add(pts[i], _add(_mul(fu, math.cos(a) * k),
                                      _mul(fv, math.sin(a) * k))))
    sweep(s, "gold_seam", seam, [r * 0.30 for r in radii], twists, "BEAD",
          ["gold"] * n, node)

    sp = spacing_of(pts, 1.05, -0.06, 15)
    flows = [Flow(s, root, i, _sub(TARGET, RING), sp) for i in range(4)]
    # THE GRAINS. Boxes, rolled off-axis, GROWING toward the ring. Cast metal,
    # picked up and carried -- not a particle effect.
    for i in range(15):
        t = 1.05 - 1.11 * i / 14.0
        c = _sample(pts, ts, t)
        tc = max(0.0, min(1.0, t))
        tan = _norm(_sub(_sample(pts, ts, t + 0.03),
                         _sample(pts, ts, t - 0.03)))
        fu = _norm(_sub((0, 0, 1), _mul(tan, _dot((0, 0, 1), tan))))
        fv = _cross(tan, fu)
        a = 0.9 + 2.3 * i
        k = rad(tc) * 0.95
        at = _add(c, _add(_mul(fu, math.cos(a) * k), _mul(fv, math.sin(a) * k)))
        g = min(3, int((1.0 - tc) * 4))
        e = rad(tc) * (0.52 + 0.10 * (i % 3)) * swallowed(t)
        td.box(s, "grain_%d" % i, (e * 1.5, e, e * 0.8), at,
               (0.4 + i * 0.5, 0.3 * i, a), "gold" if i % 3 else "white_warm",
               flows[g].node)

    tan = _norm(_sub(TARGET, RING))
    spout(s, node, RING, tan, 0.0820, "gold", "gold", "gold_dark",
          scale=1.00)
    bite(s, node, TARGET, tan, 0.0420, "gold_dark", "amber", 4, spread=1.9)
    return flows


# --- column -----------------------------------------------------------------

def state_column(s, node, root):
    """A5. IT IS NOT A BEAM ANY MORE, IT IS A COLUMN.

    The tell is not the thickness, it is the ARCHITECTURE: five drums with
    astragals between them, a fluted shaft, a stepped capital where it meets the
    ring and a plinth where it meets the enemy, and a single console bracket
    hanging off ONE side under the capital. It also ARCHES -- it rises through
    the middle instead of sagging, because a column carries load and a rope does
    not.

    Not a revolution, and it takes some care not to be: an evenly fluted shaft
    is still turned on a lathe. FLUTE is fluted on part of its perimeter only
    and keeled underneath, the abacus is a rectangle set at 18 degrees with
    unequal overhangs, and the bracket has no opposite number.

    Direction: the flute chevrons all point at the capital, the drums step
    WIDER toward it, and the grains climb the flutes to it. The A5 mechanic is
    gold_to_power, so the fillet under the capital is purple_rich -- the one
    place the idol's purple touches the beam.
    """
    n = 13
    ts = taus(n)
    pts = run_path(RING, (TARGET[0], TARGET[1], 0.38), n, rise=0.085,
                   sway=-0.020)

    def rad(t):
        step = min(4, int((1.0 - t) * 5.0))
        return 0.1300 + step * 0.0135

    tw = lambda t: 0.22 + 0.30 * (1.0 - t)
    radii = [rad(t) for t in ts]
    twists = [tw(t) for t in ts]
    mats = grade([(0.0, "gold"), (0.16, "brass"), (0.55, "gold_dark"),
                  (0.82, "brass")], ts)
    _body(s, node, "column", pts, radii, twists, "FLUTE", mats)

    tan = _norm(_sub(pts[-1], pts[0]))
    # THE ASTRAGALS between drums. Three, not four: the drum nearest the enemy
    # runs into the plinth without a moulding, which is another place this is
    # not the same object end to end.
    for i, t in enumerate((0.78, 0.55, 0.30)):
        c = _sample(pts, ts, t)
        ring(s, "astragal_%d" % i, c, tan, rad(t) * 1.10, rad(t) * 0.15,
             "gold", node, 8, 4)

    # THE CAPITAL, at the ring end. Echinus, then an abacus set at 18 degrees
    # with unequal overhangs -- the piece that makes this masonry.
    cap = _add(pts[0], _mul(tan, 0.075))
    collar(s, "echinus", cap, tan, 0.150, 0.235, 0.075, "gold", node, 9)
    ab = _add(pts[0], _mul(tan, 0.128))
    td.box(s, "abacus", (0.470, 0.360, 0.062), ab, (0, 0, 0.315), "gold_dark",
           node)
    td.box(s, "abacus_lip", (0.330, 0.300, 0.030),
           _add(ab, _mul(tan, 0.046)), (0, 0, 0.315), "white_warm", node)
    ring(s, "capital_fillet", _add(pts[0], _mul(tan, 0.030)), tan, 0.165, 0.026,
         "purple_rich", node, 9, 4)
    # THE CONSOLE. One bracket, one side, no partner.
    td.box(s, "console", (0.085, 0.175, 0.240),
           _add(_add(pts[0], _mul(tan, 0.215)), (0.0, 0.0, -0.155)),
           (0, 0.42, 0.315), "brass", node)

    # THE PLINTH, at the enemy end. Smaller, and stepped the other way.
    pl = _add(pts[-1], _mul(tan, -0.055))
    collar(s, "plinth", pl, tan, 0.185, 0.140, 0.070, "gold_dark", node, 9)
    td.box(s, "plinth_step", (0.290, 0.245, 0.048),
           _add(pts[-1], _mul(tan, -0.010)), (0, 0, -0.22), "brass", node)

    # THE FLUTE CHEVRONS. Small notches sunk in the grooves, every one of them
    # pointing at the capital. Chevrons IN THE MATTER, which is what the socle
    # permits and an overlay is not.
    sp = spacing_of(pts, 0.96, 0.04, 8)
    flows = [Flow(s, root, i, _sub(pts[-1], pts[0]), sp) for i in range(4)]
    for i in range(8):
        t = 0.96 - 0.92 * i / 7.0
        c = _sample(pts, ts, t)
        tanl = _norm(_sub(_sample(pts, ts, t + 0.03),
                          _sample(pts, ts, t - 0.03)))
        fu = _norm(_sub((0, 0, 1), _mul(tanl, _dot((0, 0, 1), tanl))))
        fv = _cross(tanl, fu)
        for j, a0 in enumerate((0.42, 1.35, 2.35)):
            a = a0 + tw(t)
            k = rad(t) * 0.80
            at = _add(c, _add(_mul(fu, math.cos(a) * k),
                              _mul(fv, math.sin(a) * k)))
            tip = _add(at, _mul(tanl, -0.052))
            sweep(s, "flute_chev_%d_%d" % (i, j), [tip, at],
                  [rad(t) * 0.045, rad(t) * 0.145], [a, a + 0.3], "BEAD",
                  ["white_warm" if j == 1 else "gold", ] * 2,
                  flows[min(3, int((1.0 - t) * 4))].node)
    return flows


# --- tendon -----------------------------------------------------------------

def state_tendon(s, node, root):
    """PATH B. NOT LIGHT BUT MATTER.

    Four demands from the socle, four separate devices:

      translucent -- there is no alpha in this pipeline, so translucency is
        BUILT: the sheath is laid as eleven short bands with real gaps between
        them and the fibre cords run continuously underneath, so you see the
        inside THROUGH the outside. A low-alpha tube would have been a lie the
        renderer had to keep; this is true from every angle.
      visible internal structure -- three cords, one of them the live nerve in
        rose_sick, wound at different phases and different radii.
      nervous -- a high-frequency kink along the whole run, small enough not to
        read as a wave and large enough to never read as a straight line.
      a slow curve with cable tension -- it sags, and it sags ASYMMETRICALLY,
        pulled sideways as well as down, the way a cable under load hangs and a
        rope thrown on the floor does not.

    Direction: the constrictions are PERISTALTIC. They travel toward the hands
    and they swell as they travel, which is the socle's "particles that grow
    toward the tower" made out of muscle. These are transfer pulses and they are
    the only pulses this file contains.
    """
    n = 12
    ts = taus(n)
    # DEEPER THAN IT WAS. At sag 0.115 the capture showed a nearly level line
    # with bumps on it -- the socle asks for "courbure lente de cable", and a
    # cable under load hangs further than that. 0.150 down and 0.105 across is
    # a curve you can see is a curve at a glance.
    pts = run_path(HANDS, TARGET, n, sag=0.150, sway=0.105, kink=0.022,
                   kink_n=6.0)
    rad = lambda t: law_radius(t, 0.0400, 0.0720, 1.30)
    tw = lambda t: law_twist(t, 2.10, 1.20)
    radii = [rad(t) for t in ts]
    twists = [tw(t) for t in ts]

    # THE SHEATH, IN BANDS, AND THE BANDS ARE NOT ALL THE SAME LENGTH.
    #
    # Eight equal bands at equal spacing is a segmented body, and the capture
    # said so: it read as a caterpillar, not a tendon. Regular repetition is
    # the thing that makes a shape into an animal. The lengths below repeat
    # nothing and the windows between them are now WIDER than the shortest
    # band, which is what makes the cords underneath the subject of this state
    # rather than a detail hidden behind an opaque tube.
    BANDS = (0.050, 0.079, 0.041, 0.070, 0.056, 0.086, 0.046, 0.065)
    for b in range(8):
        t0 = 0.015 + b * 0.124
        t1 = t0 + BANDS[b]
        bp, br, bt = [], [], []
        for k in range(3):
            t = t0 + (t1 - t0) * k / 2.0
            bp.append(_sample(pts, ts, t))
            br.append(rad(t) * ((1.22 if b % 3 == 0 else 1.09)
                                if k == 1 else 0.98))
            bt.append(tw(t))
        sweep(s, "sheath_%d" % b, bp, br, bt, "SHEATH",
              ["tendon", "membrane", "membrane"], node)

    # THE CORDS. Three, unequal, one alive. They are the body of this state --
    # BODY_STARTS records the largest, because it is the one that leaves the
    # hands.
    # THE LIVE NERVE IS THE THICKEST OF THE THREE NOW, AND IT RIDES HIGHEST.
    # It was 0.20 of the body radius at 0.44 of it out from the axis -- under
    # the sheath, and at true scale simply not there. Path B's whole colour
    # identity is a sick rose luminescence against oil black, and a capture of
    # this state showed uniform mauve with no rose in it at all. At 0.34 thick
    # and 0.64 out it sits IN the windows, which is where it has to be to be
    # seen through them.
    for c, (phase, k_r, mat, thick) in enumerate(
            [(0.0, 0.30, "abyss", 0.46), (2.2, 0.56, "rose_dim", 0.28),
             (4.3, 0.64, "rose_sick", 0.34)]):
        cp, cr = [], []
        for i, t in enumerate(ts):
            tan = _norm(_sub(pts[min(n - 1, i + 1)], pts[max(0, i - 1)]))
            fu = _norm(_sub((0, 0, 1), _mul(tan, _dot((0, 0, 1), tan))))
            fv = _cross(tan, fu)
            a = phase + twists[i] * 1.4
            k = radii[i] * k_r
            cp.append(_add(pts[i], _add(_mul(fu, math.cos(a) * k),
                                        _mul(fv, math.sin(a) * k))))
            cr.append(radii[i] * thick)
        m = sweep(s, "cord_%d" % c, cp, cr, twists, "BEAD", [mat] * n, node)
        if c == 0:
            BODY_STARTS.append(cp[0])
            m.name = "tendon_core"

    # THE CONSTRICTIONS -- peristalsis. Rings that travel toward the hands and
    # are LARGER the nearer they are, so the swallowing reads without a pulse.
    sp = spacing_of(pts, 1.04, -0.05, 7)
    flows = [Flow(s, root, i, _sub(TARGET, HANDS), sp) for i in range(4)]
    for i in range(7):
        t = 1.04 - 1.09 * i / 6.0
        tc = max(0.0, min(1.0, t))
        c = _sample(pts, ts, t)
        tanl = _norm(_sub(_sample(pts, ts, t + 0.03),
                          _sample(pts, ts, t - 0.03)))
        g = min(3, int((1.0 - tc) * 4))
        sw = swallowed(t)
        ring(s, "constrict_%d" % i, c, tanl,
             rad(tc) * (0.86 + 0.46 * (1 - tc)) * sw,
             rad(tc) * 0.20 * sw, "oil_black", flows[g].node, 6, 3)
        # One asymmetric nodule per constriction: a valve, on alternating sides.
        fu = _norm(_sub((0, 0, 1), _mul(tanl, _dot((0, 0, 1), tanl))))
        fv = _cross(tanl, fu)
        a = 1.1 + 1.9 * i
        k = rad(tc) * 1.25 * sw
        # Two rings, so the valve is a faceted bipyramid rather than a sphere:
        # cheaper (this state was 24 triangles over the 1100 budget once the
        # barbs were rebuilt) and, at a nodule's size, less round is better.
        bead_ball(s, "nodule_%d" % i, rad(tc) * 0.34 * sw,
                  _add(c, _add(_mul(fu, math.cos(a) * k),
                               _mul(fv, math.sin(a) * k))),
                  "rose_dim" if i % 2 else "membrane", flows[g].node, 4, 2)

    # THE VALVE at the hands: an offset bulb with two unequal ducts entering it.
    tan = _norm(_sub(pts[1], pts[0]))
    _rev(td.ellipsoid(s, "valve", (0.150, 0.115, 0.105),
                      _add(HANDS, _mul(tan, 0.055)), "tendon", node,
                      (0.0, 0.5, math.atan2(tan[1], tan[0])), 6, 4))
    for i, (ang, ln) in enumerate([(0.7, 1.0), (3.4, 0.62)]):
        fu = _norm(_sub((0, 0, 1), _mul(tan, _dot((0, 0, 1), tan))))
        fv = _cross(tan, fu)
        off = _add(_mul(fu, math.cos(ang) * 0.085 * ln),
                   _mul(fv, math.sin(ang) * 0.085 * ln))
        sweep(s, "duct_%d" % i, [_add(HANDS, off),
                                 _add(_add(HANDS, _mul(tan, 0.105)),
                                      _mul(off, 0.35))],
              [0.026 * ln, 0.038], [ang, ang + 0.4], "BEAD",
              ["oil_black", "oil_black"], node)
    bead_ball(s, "valve_nerve", 0.044, _add(HANDS, _mul(tan, 0.020)),
              "rose_sick", node, 5, 3)

    bite(s, node, TARGET, _norm(_sub(pts[-1], pts[-3])), 0.0400, "abyss",
         "rose_dim", 3, spread=2.1, length=1.40)
    return flows


# --- chain ------------------------------------------------------------------

def state_chain(s, node, root):
    """PATH B, MULTI-TARGET. IT BOUNCES, AND IT DOES NOT SPLIT AT THE SOURCE.

    One line leaves the hands. That is asserted, not asserted-in-a-comment:
    `_check_single_source` counts the body sweeps whose tower-end station sits
    on the origin, and a build with two of them fails.

    Everything else follows from that one fact and states it a second time:
    THE TRUNK IS THE THICKEST SEGMENT, because it is carrying the sum of all
    three bites, and each bounce further out is thinner because it is carrying
    less. A chain that split at the source would be thinnest at the tower. So
    the taper IS the read, and it is the same read as the flow direction --
    everything is converging inward.

    The knuckles are hard: an angular collar and a bend plate at each enemy, and
    the incoming and outgoing segments are deliberately not collinear.
    """
    marks = [HANDS] + CHAIN_MARKS
    thick = [(0.0700, 0.0470), (0.0470, 0.0330), (0.0330, 0.0225)]
    sags = [0.055, 0.085, 0.070]
    sways = [0.055, -0.075, 0.060]
    seg_n = 10
    flows = []
    for seg in range(3):
        a, b = marks[seg], marks[seg + 1]
        ts = taus(seg_n)
        pts = run_path(a, b, seg_n, sag=sags[seg], sway=sways[seg],
                       kink=0.014, kink_n=4.0)
        r_tower, r_target = thick[seg]
        rad = (lambda rt, rw: (lambda t: law_radius(t, rt, rw, 1.5)))(
            r_target, r_tower)
        tw = (lambda k: (lambda t: law_twist(t, 1.6 + 0.5 * k, 1.25)))(seg)
        radii = [rad(t) for t in ts]
        twists = [tw(t) for t in ts]
        mats = grade([(0.0, "abyss"), (0.30, "oil_black"), (0.70, "membrane")],
                     ts)
        m = sweep(s, "chain_seg_%d" % seg, pts, radii, twists, "LINK", mats,
                  node)
        if seg == 0:
            BODY_STARTS.append(pts[0])
        m.name = "chain_seg_%d" % seg

        # One flow group PER SEGMENT: each scrolls along its own chord by its
        # own spacing, which is the only way a bent line scrolls without the
        # knots leaving it. Three groups, three spacings, three directions --
        # and the links still travel one continuous way, toward the hands.
        cnt = 7 - seg
        spacing = spacing_of(pts, 1.03, -0.04, cnt)
        fl = Flow(s, root, seg, _sub(b, a), spacing)
        flows.append(fl)
        for i in range(cnt):
            t = 1.03 - 1.07 * i / float(cnt - 1)
            tc = max(0.0, min(1.0, t))
            c = _sample(pts, ts, t)
            tanl = _norm(_sub(_sample(pts, ts, t + 0.03),
                              _sample(pts, ts, t - 0.03)))
            # Only the trunk's links can pass the hands, so only segment 0
            # needs swallowing -- but applying it everywhere costs nothing and
            # means a re-authored chain cannot reintroduce the artefact.
            sw = swallowed(t) if seg == 0 else 1.0
            r = rad(tc) * 1.32 * sw
            half = spacing * 0.34 * (0.28 + 0.72 * sw)
            tip = _add(c, _mul(tanl, -half))
            tail = _add(c, _mul(tanl, half))
            sweep(s, "link_%d_%d" % (seg, i), [tip, tail], [r * 0.16, r],
                  [tw(tc), tw(tc) + 0.55], "BEAD",
                  ["rose_dim" if i % 2 else "membrane"] * 2, fl.node)

        # THE KNUCKLE at the far end of every segment.
        tan_out = _norm(_sub(pts[-1], pts[-3]))
        bead_ball(s, "knuckle_%d" % seg, r_target * 1.55, b, "abyss", node,
                  6, 4)
        td.box(s, "bend_plate_%d" % seg,
               (r_target * 3.4, r_target * 1.0, r_target * 2.6), b,
               (0.3 + seg, 0.4, math.atan2(tan_out[1], tan_out[0]) + 0.6),
               "membrane", node)
        bead_ball(s, "knuckle_nerve_%d" % seg, r_target * 0.55,
                  _add(b, _mul(tan_out, r_target * 0.9)), "rose_sick", node,
                  5, 3)
        for i, (ang, ln) in enumerate([(0.4, 1.0), (2.7, 0.66), (4.6, 0.82)]):
            fu = _norm(_sub((0, 0, 1), _mul(tan_out, _dot((0, 0, 1),
                                                          tan_out))))
            fv = _cross(tan_out, fu)
            off = _add(_mul(fu, math.cos(ang) * r_target * 1.8 * ln),
                       _mul(fv, math.sin(ang) * r_target * 1.8 * ln))
            # RAKED BACK, like the bite's barbs and for the same reason: a
            # hook that points along the outgoing segment is an arrowhead
            # aimed at the next enemy, and the chain is meant to be dragging
            # everything inward, not spearing its way outward.
            sweep(s, "hook_%d_%d" % (seg, i),
                  [b, _add(_add(b, _mul(tan_out, -r_target * 1.4 * ln)), off)],
                  [r_target * 0.60, r_target * 0.12], [ang, ang + 0.5],
                  "BEAD", ["oil_black"] * 2, node)

    tan = _norm(_sub(CHAIN_MARKS[0], HANDS))
    spout(s, node, HANDS, tan, 0.0700, "tendon", "rose_dim", "oil_black",
          scale=1.15)
    return flows


STATES = [
    ("thread", state_thread, "BASE", HANDS),
    ("ramp", state_ramp, "A", HANDS),
    ("saturated", state_saturated, "A", HANDS),
    ("seeking", state_seeking, "BASE", HANDS),
    ("gold", state_gold, "A", RING),
    ("column", state_column, "A", RING),
    ("tendon", state_tendon, "B", HANDS),
    ("chain", state_chain, "B", HANDS),
]


# ---------------------------------------------------------------------------
# HOW EACH STATE SAYS "TOWARD THE TOWER". The socle permits exactly four means
# and forbids everything else; this is the table of which ones each state
# spends, and a state with fewer than two is a build error.
# ---------------------------------------------------------------------------

GROW, SCROLL, CHEVRON, SPOUT = "grow", "scroll", "chevron", "spout"

FLOW_CUES = {
    "thread": ([GROW, SCROLL, CHEVRON, SPOUT],
               "knots grow 0.021->0.078 toward the hands (3.7x, and spread "
               "along the whole run rather than piled in the last quarter), "
               "scroll one spacing per loop, each a wedge pointing at the "
               "hands; the body swells 2.2x into a flared intake and the "
               "enemy end is BLUNT -- nothing points outward anywhere"),
    "ramp": ([GROW, SCROLL, CHEVRON, SPOUT],
             "twist accumulates as (1-t)^1.85 so the surface visibly turns "
             "faster near the hands; amber knots grow and climb; counter-ply "
             "winds inward; intake bell at the hands"),
    "saturated": ([GROW, SCROLL, CHEVRON, SPOUT],
                  "the helical ridge TIGHTENS its pitch toward the hands and "
                  "scrolls; the four drums step wider inward; the barbs on "
                  "each shoulder lean inward; full intake bell"),
    "seeking": ([GROW, SCROLL, CHEVRON],
                "the line DRAINS -- 0.0085 at the dead end against 0.033 at "
                "the hands, a 3.9x taper; the few remaining knots still crawl "
                "inward and none are left in the last third"),
    "gold": ([GROW, SCROLL, CHEVRON, SPOUT],
             "the colour RIPENS amber->brass->gold_dark->gold->white_warm "
             "toward the ring; cast grains grow 0.022->0.043 and climb; the "
             "bar swells 2x into the ring collar"),
    "column": ([GROW, SCROLL, CHEVRON, SPOUT],
               "the drums step WIDER toward the capital; 24 flute chevrons all "
               "point at the capital and climb the grooves; the capital IS the "
               "swelling"),
    "tendon": ([GROW, SCROLL, CHEVRON],
               "peristalsis -- the constrictions travel toward the hands and "
               "each is larger than the one behind it; the three cords "
               "converge and thicken inward into the valve bulb"),
    "chain": ([GROW, SCROLL, CHEVRON, SPOUT],
              "the trunk is the THICKEST segment because it carries all three "
              "bites, 0.070 against 0.0225 at the far end; links scroll "
              "inward per segment; every link points at the hands"),
}


# ---------------------------------------------------------------------------
# THE SPECIFICATION. This is what a renderer reads; the meshes are the
# reference build of it. Every number is evaluated from the same laws the
# geometry above used, so the two cannot drift.
# ---------------------------------------------------------------------------

def _law(fn, *a):
    return dict(zip(("target", "mid", "tower"),
                    [round(fn(1.0, *a), 5), round(fn(0.5, *a), 5),
                     round(fn(0.0, *a), 5)]))


SPEC_STATES = {
    "thread": {
        "profile": "THREAD", "sections": 20,
        "radius": {"formula": "r_target + (r_tower - r_target)*(1-t)^p",
                   "r_target": 0.0180, "r_tower": 0.0400, "p": 1.35},
        "twist": {"formula": "total*(1-t)^p", "total": 0.62, "p": 1.0},
        "scroll": {"formula": "base*(1 + gain*(1-t)^p)", "base": 0.55,
                   "gain": 0.35, "p": 1.0, "toward": "tower"},
        "beads": {"spacing": 0.211, "count": 14, "proud": 1.30,
                  "profile": "BEAD", "mat": "hem_fray"},
        "curve": {"sag": 0.030, "sway": 0.022, "kink": 0.0},
        "mats": ["skin", "skin_dark", "cloth_worn", "hem_fray"],
        "emits": False, "pulses": "none",
        "note": "deliberately weak: no emission anywhere in the base ladder"},

    "ramp": {
        "profile": "ROPE", "sections": 15,
        "radius": {"formula": "lerp(thread, saturated, rampT); baked rampT=0.60",
                   "r_target": 0.0300, "r_tower": 0.0625, "p": 1.40,
                   "rampT": 0.60,
                   "rampT_ends": {"0.0": [0.0180, 0.0400],
                                  "1.0": [0.0455, 0.0830]}},
        "twist": {"formula": "total*(1-t)^p", "total": 3.40, "p": 1.85},
        "scroll": {"formula": "base*(1 + gain*(1-t)^p)", "base": 0.80,
                   "gain": 1.60, "p": 1.85, "toward": "tower"},
        "beads": {"spacing": 0.163, "count": 13, "proud": 1.30,
                  "profile": "BEAD", "mat": "amber"},
        "curve": {"sag": 0.024, "sway": 0.030, "kink": 0.0},
        "mats": ["brass", "ochre_cloth", "gold_dark", "amber", "hem_fray"],
        "emits": True, "pulses": "none",
        "note": "the ONLY continuously-varying state: rampT is the lock timer"},

    "saturated": {
        "profile": "RAIL", "sections": 14,
        "radius": {"formula": "0.0455 + 0.0125*floor((1-t)*4) -- STEPPED",
                   "drums": 4, "r_target": 0.0455, "r_tower": 0.0830},
        "twist": {"formula": "0.35 + 0.90 if t<0.55 -- ONE joint, then rigid",
                  "total": 1.25},
        "scroll": {"formula": "base*(1 + gain*(1-t)^p)", "base": 1.05,
                   "gain": 1.10, "p": 1.4, "toward": "tower"},
        "beads": {"spacing": 0.128, "helix": True, "turns": 9.0,
                  "pitch_law": "(1-t)^1.5", "mat": "amber"},
        "curve": {"sag": 0.012, "sway": 0.018, "kink": 0.0},
        "mats": ["ochre_cloth", "gold_dark", "amber", "brass", "white_warm"],
        "emits": True, "pulses": "none",
        "note": "another THING, not a bigger ramp: rolled section, stepped "
                "drums, twist stops, grains fuse into one screw thread"},

    "seeking": {
        "profile": "DROOP", "sections": 18,
        "radius": {"formula": "r_target + (r_tower - r_target)*(1-t)^p",
                   "r_target": 0.0085, "r_tower": 0.0330, "p": 1.35},
        "twist": {"formula": "total*(1-t)^p + 0.28*sin(7t) -- wavering",
                  "total": 1.10, "p": 0.8},
        "scroll": {"formula": "base*(1 + gain*(1-t)^p)", "base": 0.30,
                   "gain": 0.20, "p": 1.0, "toward": "tower"},
        "beads": {"spacing": 0.101, "count": 9, "t_from": 0.66,
                  "profile": "BEAD", "mat": "hem_fray"},
        "curve": {"sag": 0.300, "sway": 0.160, "kink": 0.030, "kink_n": 3.0,
                  "reach": 0.55, "sweeps": True,
                  "sweep_hint": "the free end orbits the tower at ~0.5 rad/s; "
                                "the 3 filaments lag it"},
        "mats": ["cloth_worn", "hem_fray", "cloth_dark"],
        "emits": False, "pulses": "none",
        "note": "detached: reaches only 0.55 of the run and ends in 3 groping "
                "filaments of unequal length"},

    "gold": {
        "profile": "INGOT", "sections": 18,
        "radius": {"formula": "r_target + (r_tower - r_target)*(1-t)^p",
                   "r_target": 0.0420, "r_tower": 0.0820, "p": 1.55},
        "twist": {"formula": "total*(1-t)^p", "total": 1.15, "p": 1.30},
        "scroll": {"formula": "base*(1 + gain*(1-t)^p)", "base": 0.70,
                   "gain": 1.00, "p": 1.55, "toward": "ring"},
        "beads": {"spacing": 0.150, "count": 15, "shape": "box",
                  "mat": "gold", "accent": "white_warm",
                  "size_law": "r(t)*(0.52..0.62)"},
        "curve": {"sag": 0.016, "sway": -0.026, "kink": 0.0},
        "ripen": [[0.84, "amber"], [0.62, "brass"], [0.34, "gold_dark"],
                  [0.09, "gold"], [0.0, "white_warm"]],
        "mats": ["gold", "gold_dark", "brass", "amber", "white_warm"],
        "emits": True, "pulses": "transfer only (the grains)",
        "note": "opaque and dense; the colour ripening along the run is itself "
                "a statement of direction"},

    "column": {
        "profile": "FLUTE", "sections": 13,
        "radius": {"formula": "0.130 + 0.0135*floor((1-t)*5) -- 5 DRUMS",
                   "drums": 5, "r_target": 0.1300, "r_tower": 0.1840},
        "twist": {"formula": "0.22 + 0.30*(1-t)", "total": 0.52},
        "scroll": {"formula": "base*(1 + gain*(1-t)^p)", "base": 0.45,
                   "gain": 0.90, "p": 1.2, "toward": "ring"},
        "beads": {"spacing": 0.150, "rings": 8, "perRing": 3, "count": 24,
                  "spacingIsPer": "ring, not chevron",
                  "mat": "gold", "accent": "white_warm"},
        "curve": {"sag": -0.085, "sway": -0.020, "kink": 0.0,
                  "note": "it ARCHES: a column carries load"},
        "mats": ["gold", "gold_dark", "brass", "white_warm", "purple_rich"],
        "emits": True, "pulses": "transfer only",
        "note": "architecture, not a beam: drums, astragals, capital, plinth, "
                "one console bracket with no partner"},

    "tendon": {
        "profile": "SHEATH", "sections": 12,
        "radius": {"formula": "r_target + (r_tower - r_target)*(1-t)^p",
                   "r_target": 0.0400, "r_tower": 0.0720, "p": 1.30},
        "twist": {"formula": "total*(1-t)^p", "total": 2.10, "p": 1.20},
        "scroll": {"formula": "base*(1 + gain*(1-t)^p)", "base": 0.40,
                   "gain": 0.75, "p": 1.2, "toward": "tower"},
        "beads": {"spacing": 0.190, "count": 7, "shape": "constriction",
                  "mat": "oil_black",
                  "size_law": "r(t)*(0.92 + 0.34*(1-t)) -- peristaltic"},
        "curve": {"sag": 0.150, "sway": 0.105, "kink": 0.022, "kink_n": 6.0},
        "sheath": {"bands": 8, "pitch": 0.124,
                   "lengths": [0.050, 0.079, 0.041, 0.070, 0.056, 0.086,
                               0.046, 0.065],
                   "why": "translucency is BUILT, not alpha: you see the cords "
                          "through the windows. The lengths are all different "
                          "because eight equal bands read as a segmented "
                          "animal, not as a sheath over a bundle."},
        "cords": [["abyss", 0.30, 0.46], ["rose_dim", 0.56, 0.28],
                  ["rose_sick", 0.64, 0.34]],
        "mats": ["tendon", "membrane", "oil_black", "abyss", "rose_dim",
                 "rose_sick"],
        "emits": True, "pulses": "transfer only (peristalsis)",
        "note": "matter, not light; never straight"},

    "chain": {
        "profile": "LINK", "sections": 10,
        "segments": 3, "splitsAtSource": False,
        "radius": {"formula": "per segment, THINNER outward",
                   "per_segment": [[0.0700, 0.0470], [0.0470, 0.0330],
                                   [0.0330, 0.0225]],
                   "why": "the trunk carries the sum of every bite, so the "
                          "taper alone proves it does not split at the source"},
        "twist": {"formula": "(1.6 + 0.5*seg)*(1-t)^1.25"},
        "scroll": {"formula": "arc-length along the whole chain, target->tower",
                   "base": 0.50, "gain": 0.90, "p": 1.25, "toward": "tower"},
        "beads": {"spacing": [0.166, 0.184, 0.238], "count": [7, 6, 5],
                  "profile": "BEAD"},
        "curve": {"sag": [0.055, 0.085, 0.070],
                  "sway": [0.055, -0.075, 0.060], "kink": 0.014},
        "mats": ["abyss", "oil_black", "membrane", "rose_dim", "rose_sick",
                 "tendon"],
        "emits": True, "pulses": "transfer only",
        "note": "one line leaves the hands and bounces; the knuckles bend it, "
                "they do not fork it"},
}


MEASURED = {}       # state -> the scroll step the built mesh actually used


def spec():
    """The whole specification, ready to hand to a renderer.

    `beads.spacing` is OVERWRITTEN from MEASURED, which build_state fills in
    with the step the mesh was really built at. Typed by hand into the table
    below it was wrong for all eight states -- the spacing is a consequence of
    the knot count and the run's arc length, not a free parameter -- and a spec
    that disagrees with the mesh beside it is worse than no spec."""
    out = {
        "unitsToPx": PX_PER_UNIT,
        "origins": {"HANDS": list(HANDS), "RING": list(RING)},
        "originByTier": {
            "base": "HANDS", "A1": "HANDS", "A2": "HANDS",
            "A3": "RING", "A4": "RING", "A5": "RING",
            "B1": "HANDS", "B2": "HANDS", "B3": "HANDS", "B4": "HANDS",
            "B5": "HANDS",
            "rule": "the origin follows the TIER, never the state. ramp, "
                    "saturated and seeking exist on both sides of A3."},
        "parametrisation": "t = 0 at the tower, t = 1 at the target. The flow "
                           "always travels from t=1 to t=0.",
        "canonicalRunUl": CANON_UL,
        "footprintUl": 15,
        "frames": FRAMES,
        "flowGroups": "models expose animated groups flow_0..flow_n; "
                      "gl-world.js accepts overrides[groupName], so a renderer "
                      "may drive them directly for exact arc-length scroll",
        "forbidden": ["arrow", "icon", "interface indicator", "attack pulse",
                      "impact flash", "split at source (chain)"],
        "permittedFlowCues": [GROW, SCROLL, CHEVRON, SPOUT],
        "profiles": dict((k, [[round(a, 4), round(r, 4)] for a, r in v])
                         for k, v in PROFILES.items()),
        "palette": dict((k, {"hex": v[0], "emission": v[1]})
                        for k, v in PALETTE.items()),
        "states": {},
    }
    for name, _fn, path, origin in STATES:
        d = dict(SPEC_STATES[name])
        d["path"] = path
        d["bakedOrigin"] = "RING" if origin is RING else "HANDS"
        d["model"] = "siphon-beam-" + name
        d["flowCues"] = FLOW_CUES[name][0]
        d["flowReads"] = FLOW_CUES[name][1]
        if name in MEASURED:
            beads = dict(d["beads"])
            beads["spacing"] = MEASURED[name]
            beads["spacingNote"] = ("measured off the built mesh at a %g u.l. "
                                    "run; scale it with the real distance"
                                    % CANON_UL)
            d["beads"] = beads
        out["states"][name] = d
    return out


def write_spec(path):
    body = json.dumps(spec(), indent=1, sort_keys=False)
    lines = [
        "// GENERATED by tools/blender/siphon_beam.py -- do not edit.",
        "// Source of truth is that script; re-run it.",
        "//",
        "// The Siphon beam's renderer contract: profiles, laws and states.",
        "// The meshes in js/gl/models/siphon-beam-*.js are the REFERENCE BUILD",
        "// of this spec at a %g u.l. run; this file is what drives a beam" %
        CANON_UL,
        "// between two points that are moving.",
        "var SiphonBeamSpec = " + body + ";",
        "",
        "if (typeof module !== \"undefined\" && module.exports) {",
        "  module.exports = SiphonBeamSpec;",
        "}",
        "",
    ]
    d = os.path.dirname(path)
    if not os.path.isdir(d):
        os.makedirs(d)
    with open(path, "w", encoding="utf-8") as h:
        h.write("\n".join(lines))
    return path


# ---------------------------------------------------------------------------
# THE CHECKS. Every one of these was a real failure mode on the way here, and
# the socle records that the previous Siphon died of the first of them.
# ---------------------------------------------------------------------------

def _check_profiles():
    """Analytic proof that no profile is a circle.

    Two numbers per profile: how much the radius varies, and how uneven the
    angular steps are. A revolved section scores 0 on both. Anything that scores
    above the thresholds cannot be produced by a lathe, at any twist, at any
    radius, so no sweep in this file can be a surface of revolution."""
    rows = []
    for name, prof in PROFILES.items():
        rs = [r for _a, r in prof]
        angs = [a for a, _r in prof]
        var = (max(rs) - min(rs)) / max(rs)
        steps = [(angs[(i + 1) % len(angs)] - angs[i]) % math.tau
                 for i in range(len(angs))]
        even = math.tau / len(angs)
        unev = max(abs(x - even) for x in steps) / even
        if var < 0.15:
            raise SystemExit("profile %s is too round: radius varies %.3f"
                             % (name, var))
        if unev < 0.15:
            raise SystemExit("profile %s is evenly spaced: %.3f" % (name, unev))
        rows.append((name, len(prof), var, unev))
    return rows


def _check_revolved(name, meshes, run_dir):
    """No revolved primitive may span more than REV_SPAN along the run.

    Collars, astragals, knuckles and the intake lip are all revolved and all
    fine; a BODY built out of one is the thing that got the last model deleted.
    Measuring the span along the run is what tells the two apart mechanically
    rather than by intention."""
    d = _norm(run_dir)
    worst, who = 0.0, ""
    for m in meshes:
        lo, hi = 1e9, -1e9
        for v in m.verts:
            k = _dot(v, d)
            lo = min(lo, k)
            hi = max(hi, k)
        if hi - lo > worst:
            worst, who = hi - lo, m.name
    if worst > REV_SPAN:
        raise SystemExit("%s: revolved primitive '%s' spans %.3f along the run "
                         "(limit %.3f) -- that is a body, not a detail"
                         % (name, who, worst, REV_SPAN))
    return worst, who


SOURCE_TOL = 0.12       # a spout's width: anything starting inside this is
                        # leaving the origin, wherever exactly it is pinned


def _check_single_source(name, origin, starts):
    """`chain` bounces; it does not fork. One body may leave the origin.

    Measured with a tolerance rather than exactly, because `tendon`'s bundle is
    pinned by its core cord, which sits a fibre's width off the origin -- and a
    second cord starting a fibre's width away is still the same line leaving the
    hands. Two SEPARATE runs would be metres apart at the far end and both
    inside the tolerance here, which is exactly what this is for."""
    at = [p for p in starts if _len(_sub(p, origin)) < SOURCE_TOL]
    if len(at) != 1:
        raise SystemExit("%s: %d bodies leave the origin -- the beam must not "
                         "split at the source" % (name, len(at)))


def _check_no_pulse(name, model):
    """Every baked frame matrix must be a PURE TRANSLATION.

    The socle forbids an attack pulse outright, and the fire rate is 10/s so any
    baked scale or spin would beat in time with the gun. Nothing here rotates
    and nothing here can scale, and this is where that is proved instead of
    promised."""
    for fi, row in enumerate(model["frames"]):
        for gi, m in enumerate(row):
            if m is None:
                continue
            # Column-major 4x4: the 3x3 block must be identity.
            for c in range(3):
                for r in range(3):
                    want = 1.0 if r == c else 0.0
                    if abs(m[c * 4 + r] - want) > 1e-6:
                        raise SystemExit(
                            "%s: frame %d group %d is not a pure translation "
                            "-- that would be a pulse" % (name, fi, gi))


def _check_ground(name, model):
    """The beam adds NOTHING to the tower's ground footprint. Inside the 15 u.l.
    radius, nothing this file draws may sit on the floor."""
    pos = model["positions"]
    for v in range(len(pos) // 3):
        x, y, z = pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]
        if z < 0.05 and math.hypot(x, y) < GROUND_R:
            raise SystemExit("%s: a vertex at (%.3f, %.3f, %.3f) is on the "
                             "ground inside the footprint" % (name, x, y, z))
        if z > MAX_HEIGHT:
            raise SystemExit("%s: a vertex at z = %.3f passes the A5/B5 "
                             "height %.2f" % (name, z, MAX_HEIGHT))


def _check_palette(name, path, scene):
    """A state wears the palette of the path that granted it (socle section 5).
    The base states may not reach into either path's ladder."""
    used = set()
    for m in scene.meshes:
        used.add(m.mat)
        if m.face_mats:
            used.update(m.face_mats)
    if path == "A":
        bad = sorted(used & set(B_MATS))
    elif path == "B":
        bad = sorted(used & set(A_MATS))
    else:
        bad = sorted(used & (set(A_MATS) | set(B_MATS)))
    if bad:
        raise SystemExit("%s (path %s) wears the wrong ladder: %s"
                         % (name, path, bad))


def _check_cues(name):
    cues = FLOW_CUES[name][0]
    if len(cues) < 2:
        raise SystemExit("%s states the flow with only %d cue(s); the socle "
                         "requires at least two" % (name, len(cues)))
    for c in cues:
        if c not in (GROW, SCROLL, CHEVRON, SPOUT):
            raise SystemExit("%s uses an unpermitted cue: %s" % (name, c))


# ---------------------------------------------------------------------------
# THE ROTATION TEST, run for real rather than asserted.
#
# Rasterise the model's silhouette from a camera, turn it, and compare. Two
# angles 90 degrees apart that agree mean the shape is a solid of revolution
# about the axis being turned, and the brief says rebuild it.
#
# TWO axes, because they catch different failures:
#
#   Z   the world's vertical axis -- the brief's literal test, and the one the
#       player performs every time the tower turns to a new target.
#   RUN the beam's OWN axis. This is the decisive one for a beam. A beam is
#       long, so almost anything passes the Z test by being a bar from one side
#       and a dot from the other; the way a beam actually becomes a revolution
#       is by having a round cross-section, and only rolling it about its own
#       length measures that.
# ---------------------------------------------------------------------------

def _tris(model):
    pos = model["positions"]
    out = []
    for t in range(len(pos) // 9):
        b = t * 9
        out.append(((pos[b], pos[b + 1], pos[b + 2]),
                    (pos[b + 3], pos[b + 4], pos[b + 5]),
                    (pos[b + 6], pos[b + 7], pos[b + 8])))
    return out


def _rodrigues(p, axis, ang, about):
    k = _norm(axis)
    v = _sub(p, about)
    c, s = math.cos(ang), math.sin(ang)
    r = _add(_add(_mul(v, c), _mul(_cross(k, v), s)),
             _mul(k, _dot(k, v) * (1.0 - c)))
    return _add(r, about)


def _project(p, az, el):
    ca, sa = math.cos(az), math.sin(az)
    return (-sa * p[0] + ca * p[1],
            -math.sin(el) * (ca * p[0] + sa * p[1]) + math.cos(el) * p[2])


def _raster(tris2, win, res):
    """Point-in-triangle into a bitset. Coarse on purpose: a silhouette test
    that resolves single triangles measures noise, not shape."""
    x0, y0, x1, y1 = win
    sx = (res - 1) / max(1e-9, x1 - x0)
    sy = (res - 1) / max(1e-9, y1 - y0)
    bits = bytearray(res * res)
    for (a, b, c) in tris2:
        ax, ay = (a[0] - x0) * sx, (a[1] - y0) * sy
        bx, by = (b[0] - x0) * sx, (b[1] - y0) * sy
        cx, cy = (c[0] - x0) * sx, (c[1] - y0) * sy
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-9:
            continue
        lo_x = max(0, int(math.floor(min(ax, bx, cx))))
        hi_x = min(res - 1, int(math.ceil(max(ax, bx, cx))))
        lo_y = max(0, int(math.floor(min(ay, by, cy))))
        hi_y = min(res - 1, int(math.ceil(max(ay, by, cy))))
        for py in range(lo_y, hi_y + 1):
            row = py * res
            for px in range(lo_x, hi_x + 1):
                u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d
                if u < -0.001:
                    continue
                v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d
                if v < -0.001 or u + v > 1.001:
                    continue
                bits[row + px] = 1
    return bits


def _iou(a, b):
    inter = union = 0
    for i in range(len(a)):
        if a[i] or b[i]:
            union += 1
            if a[i] and b[i]:
                inter += 1
    return (inter / float(union)) if union else 1.0


def _silhouettes(tris, transform, az, el, steps, res):
    frames2 = []
    x0 = y0 = 1e9
    x1 = y1 = -1e9
    for i in range(steps):
        f = []
        for tri in tris:
            pts = [_project(transform(p, i), az, el) for p in tri]
            for (px, py) in pts:
                x0 = min(x0, px)
                y0 = min(y0, py)
                x1 = max(x1, px)
                y1 = max(y1, py)
            f.append(pts)
        frames2.append(f)
    pad = 0.02 * max(x1 - x0, y1 - y0)
    win = (x0 - pad, y0 - pad, x1 + pad, y1 + pad)
    return [_raster(f, win, res) for f in frames2]


def rotation_test(name, model, run_dir, origin, res=96, steps=24):
    """The 360-degree check the brief demands, both axes, with numbers.

    Returns (worst_z, worst_run). Each is the HIGHEST agreement found between
    two views 90 degrees apart; 1.00 means the two are the same picture."""
    tris = _tris(model)
    quarter = steps // 4

    def spin_z(p, i):
        return _rodrigues(p, (0, 0, 1), math.tau * i / steps, (0, 0, 0))

    sils = _silhouettes(tris, spin_z, 0.0, 0.61, steps, res)
    worst_z = max(_iou(sils[i], sils[(i + quarter) % steps])
                  for i in range(steps))

    axis = _norm(run_dir)
    # Broadside to the run, so rolling the beam changes what the camera sees.
    view_az = math.atan2(axis[1], axis[0]) + math.pi * 0.5

    def spin_run(p, i):
        return _rodrigues(p, axis, math.tau * i / steps, origin)

    sils = _silhouettes(tris, spin_run, view_az, 0.30, steps, res)
    worst_run = max(_iou(sils[i], sils[(i + quarter) % steps])
                    for i in range(steps))
    return worst_z, worst_run


Z_LIMIT = 0.92
RUN_LIMIT = 0.94


def control_revolved(flat):
    """THE CONTROL, and the reason the numbers above mean anything.

    A test that everything passes is not a test. This builds the forbidden
    thing on purpose -- a `td.frustum` laid from the hands to the target, which
    is exactly what socle section 7 records the last Siphon being deleted for --
    and runs it through the identical rotation test. It must score near 1.000
    on the RUN axis, because it genuinely is a surface of revolution about it.

    If this control ever stops scoring high, the test has broken and every PASS
    above it is worthless. It is printed beside the states for that reason."""
    s = td.Scene(palette(flat))
    root = s.node("root")
    node = s.node("beam", parent=root)
    d = _sub(TARGET, HANDS)
    rot, length = _axis(HANDS, TARGET)
    td.frustum(s, "lazy_cone", 0.055, 0.028, length, _lerp(HANDS, TARGET, 0.5),
               "cloth_worn", node, 12, rot)
    td.ball(s, "lazy_ball", 0.062, HANDS, "skin", node, 12, 6)
    model = td.build(s, "control-revolved")
    return rotation_test("control", model, d, HANDS)


# ---------------------------------------------------------------------------

def build_state(name, fn, path, origin, flat):
    del REVOLVED[:]
    del BODY_STARTS[:]
    s = td.Scene(palette(flat))
    root = s.node("root")
    node = s.node("beam", parent=root)
    flows = fn(s, node, root)
    steps = sorted(set(round(f.step, 4) for f in flows))
    MEASURED[name] = steps[0] if len(steps) == 1 else steps
    model = td.build(s, "siphon-beam-" + name, FRAMES, flow_pose(flows))
    return model, s, list(REVOLVED), list(BODY_STARTS)


def _extent(model):
    pos = model["positions"]
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for v in range(len(pos) // 3):
        for k in range(3):
            c = pos[v * 3 + k]
            lo[k] = min(lo[k], c)
            hi[k] = max(hi[k], c)
    return lo, hi


def main():
    flat = "--silhouette" in sys.argv
    print("building the Siphon BEAM -- lot L3 (%s)"
          % ("SILHOUETTE" if flat else "full"))
    print("  scale %.4f px/u, canonical run %g u.l. = %.3f u, footprint "
          "%.4f u (FIXED)" % (PX_PER_UNIT, CANON_UL, CANON, GROUND_R))
    print("  origins  HANDS %s   RING %s   (socle section 2, not re-derived)"
          % (HANDS, RING))

    print("\n  PROFILES -- the reusable cross-sections. `radius var` and "
          "`angle uneven`")
    print("  are 0.000 for a circle; both must clear 0.15 or the build fails.")
    print("    %-8s %3s  %-10s %-10s" % ("profile", "pts", "radius var",
                                         "angle uneven"))
    for nm, cnt, var, unev in sorted(_check_profiles()):
        print("    %-8s %3d  %-10.3f %-10.3f" % (nm, cnt, var, unev))

    total = 0
    results = []
    for name, fn, path, origin in STATES:
        _check_cues(name)
        model, scene, revolved, starts = build_state(name, fn, path, origin,
                                                     flat)
        _check_palette("siphon-beam-" + name, path, scene)
        _check_no_pulse(name, model)
        _check_ground(name, model)
        _check_single_source(name, origin, starts)

        if name == "seeking":
            run_dir = _sub((-0.52, 1.02, 0.20), origin)
        elif name == "chain":
            run_dir = _sub(CHAIN_MARKS[0], origin)
        else:
            run_dir = _sub(TARGET, origin)
        span, who = _check_revolved(name, revolved, run_dir)

        td.write_js(model, "siphon-beam-%s.js" % name)
        wz, wr = rotation_test(name, model, run_dir, origin)
        lo, hi = _extent(model)
        total += model["triangles"]
        results.append((name, model["triangles"], wz, wr, span, who,
                        hi[2], hi[0] - lo[0], len(model["groups"])))

    print("\n  MODELS -- js/gl/models/siphon-beam-<state>.js")
    print("    %-10s %5s %6s %6s %7s %6s %6s" %
          ("state", "tris", "rot Z", "rot RUN", "rev span", "top z", "groups"))
    for (name, tris, wz, wr, span, who, top, wide, ng) in results:
        flag = ""
        if wz > Z_LIMIT or wr > RUN_LIMIT:
            flag = "  <-- FAILS"
        if not (700 <= tris <= 1100):
            flag += "  <-- BUDGET"
        print("    %-10s %5d %6.3f %7.3f %8.3f %6.2f %6d%s"
              % (name, tris, wz, wr, span, top, ng, flag))
    print("    %d models, %d triangles" % (len(results), total))

    bad = [r for r in results
           if r[2] > Z_LIMIT or r[3] > RUN_LIMIT or not (700 <= r[1] <= 1100)]
    print("\n  ROTATION TEST -- 24 views over 360 degrees, every pair 90 "
          "degrees apart")
    print("  compared as rasterised silhouettes. The number is the WORST "
          "agreement found;")
    print("  1.000 would mean two views 90 degrees apart are the same picture, "
          "i.e. a")
    print("  surface of revolution. Limits: Z < %.2f, RUN < %.2f."
          % (Z_LIMIT, RUN_LIMIT))
    cz, cr = control_revolved(flat)
    print("    worst about Z   : %.3f  (%s)"
          % (max(r[2] for r in results),
             max(results, key=lambda r: r[2])[0]))
    print("    worst about RUN : %.3f  (%s)"
          % (max(r[3] for r in results),
             max(results, key=lambda r: r[3])[0]))
    print("    CONTROL, a td.frustum from the hands to the target -- the exact")
    print("    shape socle section 7 says the last Siphon was deleted for:")
    print("            about Z   : %.3f" % cz)
    print("            about RUN : %.3f   <-- a surface of revolution scores 1"
          % cr)
    if cr < 0.98:
        raise SystemExit("the control is not detected as a revolution (%.3f); "
                         "the test is broken and every PASS is worthless" % cr)
    print("    The control is caught, so the test discriminates. Every state "
          "sits\n    at least %.2f below it on the RUN axis."
          % (cr - max(r[3] for r in results)))
    print("    RESULT: %s" % ("PASS -- no state repeats itself at 90 degrees, "
                              "on either axis" if not bad else
                              "FAIL -- see the flagged rows above"))

    print("\n  LARGEST REVOLVED DETAIL PER STATE (limit %.2f along the run; a "
          "body\n  built from a frustum would show here immediately)"
          % REV_SPAN)
    for (name, _t, _z, _r, span, who, _top, _w, _g) in results:
        print("    %-10s %.3f  %s" % (name, span, who))

    print("\n  HOW EACH STATE SAYS 'TOWARD THE TOWER' (socle section 5 permits "
          "\n  exactly four means and forbids arrows, icons and indicators)")
    for name, _fn, _p, _o in STATES:
        cues, how = FLOW_CUES[name]
        print("    %-10s [%s]" % (name, " ".join(cues)))
        for line in _wrap(how, 62):
            print("               %s" % line)

    p = write_spec(os.path.join(os.path.dirname(td.OUTPUT_DIR),
                                "siphon-beam-spec.js"))
    print("\n  spec written to %s" % p)
    print("  (a new file; add one <script> line to index.html to use it -- no "
          "existing file was touched)")

    if bad:
        raise SystemExit("build failed its own checks")


def _wrap(text, width):
    words, line, out = text.split(), "", []
    for w in words:
        if len(line) + len(w) + 1 > width:
            out.append(line)
            line = w
        else:
            line = (line + " " + w) if line else w
    if line:
        out.append(line)
    return out


if __name__ == "__main__":
    main()
