# ---------------------------------------------------------------------------
# THE DETAIL LAYER ON THE TEN BLUB UNITS -- pass 3.
#
# tower_summoner.py builds the ten bodies and summoner_unit_marks.py builds the
# twenty crosspath marks. This builds the ten ADD-ON DETAIL MESHES that give each
# unit a character instead of a colour: `blub-detail-<unit>`, one per unit,
# composited over an untouched body exactly the way a mark is.
#
#   python tools/blender/blub_detail.py                build everything
#   python tools/blender/blub_detail.py --silhouette   build PASS 1 forms
#
# COMMIT COLOUR BUILDS. `--silhouette` exists so a form can be judged without a
# palette; a silhouette build has been committed over colour models once already
# and shipped 46 grey meshes. Re-run without the flag before you finish.
#
# WHY A SEPARATE FILE AND A SEPARATE MODEL. Same rule as the marks: a detail adds
# something ON TOP. It may not remodel a body, move a pivot or change a
# proportion, and the same body with and without its detail has to be
# superposable pixel for pixel. There is no body geometry in this file to
# accidentally alter. It also means two agents can work on the profiles and on
# the detail at the same time without editing the same lines.
#
# THE BODIES ARE READ, NOT COPIED. summoner_unit_marks.py mirrors `drop()`'s four
# band coefficients by hand and says so; that works, and it drifts the moment
# somebody re-profiles a body. This file does the other thing: it IMPORTS
# tower_summoner, rebuilds each body into a throwaway scene, and RAY-PROBES the
# triangles it gets back. `_Body.radial()`, `.front()` and `.top()` are real
# casts against the real mesh, and `.named()` / `.by_mat` read the body's own
# solids by the names and materials it gave them. So when the profiles change --
# and they are being changed right now, in the same session -- the details move
# with them, and `main()` prints every anchor it resolved plus every one it had
# to fall back on, so a rename is visible on the very next build.
#
# WHAT ACTUALLY READS AT TRUE GAME SCALE, and it is the whole design constraint.
# At the reference viewport (1278 x 719, game camera) a footprint-10 unit is
# about 13 px across. One screen pixel is roughly 1.5 u.l. = 0.047 Blender units.
# Revue 1 measured the b1 crosspath marks at 3-7 px of added coverage and called
# them effectively invisible, and it was right. So on the small units nothing
# painted on the surface can work: every piece here is sized to BREAK THE OUTLINE
# or to swap a big block of VALUE, and `main()` prints, per unit, the bump out of
# the flank, the growth in width and in height, and the share of the detail's own
# surface brighter than the body -- in screen px, so an invisible piece is caught
# at build time and not after a capture.
#
# MEASURED IN THE GAME, at that viewport, over four yaws, with the detail drawn
# over the body exactly as the runtime would draw it. Worst yaw per unit, as
# pixels of the rendered unit the detail changes, against a body of the size in
# brackets: mini1 11 (93), mini2 12 (116), blub1 38 (219), blub2 85 (214),
# blub3 88 (553), hungry 93 (698), cyber 65 (811), mecha 76 (690), mecha2 124
# (1974), superb 148 (2942). The floor is 11 px and 6 % of the unit; the b1 marks
# that failed the review were 3-7 px. Mean luminance over the body's footprint
# falls on all ten and rises on none -- that is the value ladder, measured.
#
# THE ONE THING THE DETAIL LAYER CAN DO ABOUT THE PROPORTION FAILURE. Revue 1:
# "five of ten units share one circular outline at >= 0.85 shape IoU ... the
# family needs at least one frankly non-circular profile among the small and
# medium units." Footprints are gameplay and cannot move, and the bodies belong
# to another script this session. What a detail CAN do is push the outline in one
# axis: mini1's ragged pieces all go UP (it gets taller and spikier), mini2's all
# go SIDEWAYS (it gets wider and lumpier), and the Hungry Blub's gorge lumps run
# backwards so its profile is long front-to-back where the Cyberblub's is round.
# That is aspect ratio, not an appendage, which is what the review asked for.
#
# VALUE FIRST, HUE SECOND (AGENTS.md rule 7). The body is the largest surface and
# it keeps its own value; every detail material sits at or below it, and the few
# that sit above -- a tooth, two drool drips, a rivet row, a lens -- are rationed.
# `main()` measures that instead of asserting it: it sums the real surface area
# of the built detail per palette entry and prints the fraction brighter than the
# body's base colour. Path A details are moss_dark / stone_dark / dark; path B
# details are chrome_dk / steel_bru / dark, with cyan kept to lenses.
#
# FRONT IS +Y HERE. The game's forward is +X and gl-world.js compensates with
# authoredFrontOffset(); tower_summoner.py authors faces on +Y and so does this,
# because a detail that disagreed with its body by 90 degrees would sit on the
# creature's ear. When the bodies are re-authored onto +X this file turns with
# them and not before.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_mesh as td                                          # noqa: E402
import tower_summoner as ts                                   # noqa: E402

PX_PER_UNIT = 20.0 * 1.529 * 1.04          # td_mesh.UNITS_TO_PX

R = ts.R                                   # the unit radii, NOT retyped
UNIT_FOOTPRINT = ts.UNIT_FOOTPRINT

# Screen pixels per u.l. at the reference viewport (1278 x 719, default game
# camera). Measured, not assumed: blub-mecha2's 97.6 u.l. of hull-plus-tanks
# spans 66 px and blub-superb's 94 u.l. spans 64 px, both this session, which
# gives 0.68 px per u.l. It is only used to PRINT a screen-size prediction next
# to each detail so an invisible piece is caught at build time instead of after
# a capture.
PX_PER_UL = 0.68


# --- palette ----------------------------------------------------------------
# Copied verbatim from tower_summoner.py, and copied rather than imported for
# the reason summoner_unit_marks.py gives: the palette is the contract each
# build script in this folder states for itself. The footprint table is the
# opposite kind of number -- derived, and never stated twice -- so that one is
# imported.
PALETTE = {
    # --- voie A, the organic ritual side ---
    "moss":       ("#5E7A4A", 0.0),
    "moss_dark":  ("#425834", 0.0),
    "lichen":     ("#8AA45E", 0.0),
    "stone":      ("#7A7A72", 0.0),
    "stone_dark": ("#55554F", 0.0),
    "chalk":      ("#D8D2BE", 0.0),
    "ochre":      ("#B0813C", 0.0),
    "warm_glow":  ("#C8A54E", 0.35),      # faible et chaude
    # --- voie B, the machine side ---
    "deep_blue":  ("#2B4A7A", 0.0),
    "blue_gel":   ("#3E6FA8", 0.0),
    "chrome":     ("#8E97A4", 0.0),
    "chrome_dk":  ("#565E6B", 0.0),
    "steel_bru":  ("#6E7683", 0.0),
    "cyan":       ("#5FE8FF", 1.0),       # forte et froide
    "cyan_dim":   ("#2A8FA8", 0.5),
    "white_hot":  ("#EAFBFF", 1.0),
    # --- shared ---
    "flesh":      ("#C9A88A", 0.0),
    "dark":       ("#1E2028", 0.0),
    "tooth":      ("#E8E4D6", 0.0),
    "eye":        ("#20242C", 0.0),
}

SILHOUETTE = dict((k, ("#9AA0A8", 0.0)) for k in PALETTE)


def palette(flat):
    return SILHOUETTE if flat else PALETTE


# The base colour of each unit's largest surface. This is the value the detail
# has to stay under, and it is what `main()` audits against.
BASE_MAT = {
    "blub1": "moss", "blub2": "moss", "blub3": "moss", "mini1": "moss",
    "mini2": "moss", "hungry": "moss", "cyber": "blue_gel",
    "mecha": "chrome_dk", "mecha2": "chrome_dk", "superb": "chrome_dk",
}


def luminance(mat):
    h = PALETTE[mat][0].lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


# ---------------------------------------------------------------------------
# READING A BODY.
#
# The body is rebuilt into a scene that is thrown away, its triangles are
# collected in world space (td_mesh bakes location and rotation into vertices,
# so mesh.verts already ARE world space) and everything below is a cast against
# them. Nothing here can write to a body: `_Body` never leaves this module and
# the scene it builds is never exported.
# ---------------------------------------------------------------------------

def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _tri_area(a, b, c):
    n = _cross(_sub(b, a), _sub(c, a))
    return 0.5 * math.sqrt(_dot(n, n))


class _Body(object):
    """One unit's built body, as triangles plus a name and material index."""

    def __init__(self, unit_id):
        scene = td.Scene(PALETTE)
        root = scene.node("root")
        body = scene.node("body", parent=root)
        dict(ts.UNITS)[unit_id](scene, body, False)

        self.id = unit_id
        self.r = ts.R_of(unit_id)          # the GAMEPLAY radius, from js/blub.js
        self.tris = []
        self.by_name = {}
        self.by_mat = {}
        self.missing = []
        lo = [1e9] * 3
        hi = [-1e9] * 3
        for mesh in scene.meshes:
            mlo = [1e9] * 3
            mhi = [-1e9] * 3
            for v in mesh.verts:
                for k in range(3):
                    if v[k] < mlo[k]:
                        mlo[k] = v[k]
                    if v[k] > mhi[k]:
                        mhi[k] = v[k]
            for k in range(3):
                lo[k] = min(lo[k], mlo[k])
                hi[k] = max(hi[k], mhi[k])
            self.by_name.setdefault(mesh.name, []).append((mlo, mhi))
            self.by_mat.setdefault(mesh.mat, []).append((mlo, mhi))
            for f in mesh.faces:
                for t in range(1, len(f) - 1):
                    self.tris.append((mesh.verts[f[0]], mesh.verts[f[t]],
                                      mesh.verts[f[t + 1]]))
        self.lo, self.hi = lo, hi
        self.top_z = hi[2]
        self.front_y = hi[1]
        self.half_x = max(abs(lo[0]), abs(hi[0]))
        self.far = max(self.half_x, abs(lo[1]), abs(hi[1]), hi[2]) * 3.0 + 1.0

    # --- casts ---------------------------------------------------------

    def _hit(self, o, d):
        """Nearest positive t along `d` from `o`, or None. Moller-Trumbore with
        NO backface cull -- a body has interior solids (throats, gullets) and a
        cull would let a ray walk straight through the one that matters."""
        best = None
        for a, b, c in self.tris:
            e1 = _sub(b, a)
            e2 = _sub(c, a)
            p = _cross(d, e2)
            det = _dot(e1, p)
            if -1e-12 < det < 1e-12:
                continue
            inv = 1.0 / det
            s = _sub(o, a)
            u = _dot(s, p) * inv
            if u < -1e-9 or u > 1.0 + 1e-9:
                continue
            q = _cross(s, e1)
            v = _dot(d, q) * inv
            if v < -1e-9 or u + v > 1.0 + 1e-9:
                continue
            t = _dot(e2, q) * inv
            if t > 1e-6 and (best is None or t < best):
                best = t
        return best

    def hit_radial(self, z, yaw):
        """Distance from the axis to the outer surface, or None if the body has
        nothing at that height and bearing at all."""
        c, s = math.cos(yaw), math.sin(yaw)
        t = self._hit((c * self.far, s * self.far, z), (-c, -s, 0.0))
        return None if t is None else self.far - t

    def radial(self, z, yaw, default=None):
        """The seating version: same cast, but a miss falls back to the ground
        radius rather than returning None, so a detail is never placed at the
        origin by accident. A miss here means the seat is off the body, so it is
        recorded and `main()` prints it."""
        d = self.hit_radial(z, yaw)
        if d is None:
            self.missing.append("radial z=%.3f yaw=%.2f" % (z, yaw))
            return self.r if default is None else default
        return d

    def front(self, z, x, default=None):
        """The +Y surface at height z and lateral offset x. Face furniture --
        brows, jaws, chins -- is seated on this and not on a radius, because a
        12-gon puts a vertex on +Y and the surface falls away either side of it."""
        t = self._hit((x, self.far, z), (0.0, -1.0, 0.0))
        if t is None:
            self.missing.append("front z=%.3f x=%.3f" % (z, x))
            return self.front_y if default is None else default
        return self.far - t

    def top(self, x, y, default=None):
        """The top surface over (x, y)."""
        t = self._hit((x, y, self.far), (0.0, 0.0, -1.0))
        if t is None:
            self.missing.append("top x=%.3f y=%.3f" % (x, y))
            return self.top_z if default is None else default
        return self.far - t

    def proud(self, point):
        """How far `point` stands OUTSIDE the body, measured radially, or None
        if the body has no surface on that bearing at all.

        None is NOT zero and the difference matters: the first version returned
        the ground radius on a miss, which reported the MK2's tank straps as
        87 u.l. proud because the cast at strap height sails over the hull and
        hits nothing. A vertex with no body behind it is outside the body by
        definition, but by an amount this cast cannot measure -- so it is
        counted separately instead of being invented."""
        x, y, z = point
        d = math.hypot(x, y)
        if d < 1e-6:
            return self.top_z - z
        hit = self.hit_radial(z, math.atan2(y, x))
        return None if hit is None else d - hit

    # --- anchors -------------------------------------------------------

    def named(self, *names):
        """Bounding boxes of the body solids called `names[0]`, left to right;
        the later names are fallbacks, so a rename costs a comment and not a
        detail that has quietly stopped being seated on anything."""
        for n in names:
            boxes = self.by_name.get(n)
            if boxes:
                return sorted(boxes, key=lambda b: b[0][0])
        self.missing.append("solids " + "/".join(names))
        return []

    def anchor(self, *names):
        """The union box of the first of `names` the body actually has, or None.
        Several names are accepted so a detail survives one being renamed."""
        for n in names:
            boxes = self.by_name.get(n)
            if boxes:
                lo = [min(b[0][k] for b in boxes) for k in range(3)]
                hi = [max(b[1][k] for b in boxes) for k in range(3)]
                return lo, hi
        self.missing.append("anchor " + "/".join(names))
        return None

    def mat_box(self, mat):
        boxes = self.by_mat.get(mat)
        if not boxes:
            self.missing.append("material '%s'" % mat)
            return None
        lo = [min(b[0][k] for b in boxes) for k in range(3)]
        hi = [max(b[1][k] for b in boxes) for k in range(3)]
        return lo, hi

    def eyes(self):
        """(half-spread in x, centre z). Every face() variant except the MK2's
        slit uses the `eye` material, so this finds the eyes wherever they were
        put -- which is the only anchor a brow can honestly use."""
        box = self.mat_box("eye")
        if box is None:
            return self.r * 0.30, self.top_z * 0.60
        lo, hi = box
        return max(hi[0], -lo[0]), (lo[2] + hi[2]) * 0.5


# ---------------------------------------------------------------------------
# THE TWO WAYS A DETAIL IS SEATED.
#
# `_lump` grows out of the flank -- it takes the body's own radius at its own
# height and pushes a solid through it, so part of the piece is INSIDE the
# creature and the rest is the bump. That is what makes a wobble read as the
# body wobbling rather than as a brick glued to it.
#
# `_chip` sits on the FRONT -- brows, jaws, chins, panels. It takes the +Y
# surface at its own lateral offset, which is not the same thing as the radius:
# on a 12-gon the nose is a ridge and the surface drops away either side of it,
# and a flat piece seated on the radius floats at its ends.
#
# Both take `sink`, the fraction of the piece buried. Nothing here is ever
# seated ON the surface with zero bite: a piece that only touches shows a seam
# of background between itself and the body at some yaw.
# ---------------------------------------------------------------------------

def _lump(s, name, B, det, z, yaw, out, across, tall, mat,
          roll=0.0, lift=0.0, sink=0.45):
    """A bump on the flank. `out` is measured along the outward normal, so
    `out * (1 - sink)` is the protrusion and that is the number that decides
    whether the outline changes."""
    d = B.radial(z, yaw)
    off = d + out * (0.5 - sink)
    at = (math.cos(yaw) * off, math.sin(yaw) * off, z)
    return td.box(s, name, (out, across, tall), at, (roll, lift, yaw), mat, det)


def _chip(s, name, B, det, x, z, deep, wide, tall, mat, tilt=0.0, roll=0.0,
          sink=0.40, y=None):
    """A piece on the front face. `deep` runs along +Y."""
    fy = B.front(z, x) if y is None else y
    at = (x, fy + deep * (0.5 - sink), z)
    return td.box(s, name, (wide, deep, tall), at, (tilt, roll, 0.0), mat, det)


def _drape(s, name, B, det, x0, x1, y, wide, thick, mat, bite=0.0, extend=0.0):
    """A strap LYING ON a sloped surface, between two lateral positions.

    The top is cast at both ends and the piece is laid along the line between
    them, so a band over a tilted carapace follows the tilt. The straight bar
    this replaced spanned the whole unit at one height, which put its middle in
    the rock and both its ends in mid-air -- 13.9 px of measured protrusion that
    was entirely a floating end, not a strap.

    `extend` lengthens the piece along its own axis AFTER the casts, so a band
    can overhang the edge it was measured against. The casts have to stay inside
    the body: probing at the very edge is a coin toss that misses as often as it
    hits, and a miss falls back to the overall top and tips the whole strap."""
    z0 = B.top(x0, y) - bite
    z1 = B.top(x1, y) - bite
    length = math.hypot(x1 - x0, z1 - z0) + extend * 2.0
    pitch = math.atan2(z1 - z0, x1 - x0)
    return td.box(s, name, (length, wide, thick),
                  ((x0 + x1) * 0.5, y, (z0 + z1) * 0.5 - thick * 0.30),
                  (0.0, -pitch, 0.0), mat, det)


# ---------------------------------------------------------------------------
# THE TEN DETAILS.
#
# One function per unit, and the docstring is the brief line it is answering.
# ---------------------------------------------------------------------------

def detail_blub1(s, det, B):
    """blub1 -- BETE ET CONTENT. A dumb happy drop: charm, not detail.

    Three things, and only the third is decoration. A heavy brow in two halves
    whose OUTER ends lift, which is the whole difference between happy and
    stupid and worried; two cheek folds pushed out of the flanks at mouth
    height; and three uneven wobbles round the body so the outline stops being
    a circle. Revue 1's finding was that blub1 is 'the same egg' as blub2 at
    0.895 shape IoU with blub1 strictly inside it -- the wobbles are the only
    thing at this size that can put a dent in that, because at 13 px across a
    detail either moves the edge or it does not exist."""
    r = B.r
    ex, ez = B.eyes()
    mouth = B.anchor("mouth")
    mz = (mouth[0][2] + mouth[1][2]) * 0.5 if mouth else ez - r * 0.34

    # THE BROW, in two halves. One bar across both eyes reads as a frown at any
    # size; two halves that rise outward read as a grin with no mouth involved.
    for sx in (-1, 1):
        _chip(s, "brow", B, det, sx * ex, ez + r * 0.15,
              r * 0.16, r * 0.44, r * 0.13, "dark", roll=-sx * 0.42, sink=0.35)

    # CHEEK FOLDS. Off the nose by 62 degrees, at the mouth's own height, so
    # they read as the mouth pushing the cheeks out. They are the widest point
    # of the finished unit, and they are sized from the measurement and not from
    # taste: at 0.40 r out with a 0.42 bite the whole detail moved the outline
    # 1.9 px and the build flagged it as decoration.
    for sx in (-1, 1):
        _lump(s, "cheek", B, det, mz, math.pi / 2 - sx * 1.08,
              r * 0.54, r * 0.50, r * 0.38, "moss_dark", sink=0.30)

    # THE WOBBLE. Three lumps at three heights and three unrelated yaws, and
    # deliberately unequal -- a drop that bulges the same amount all round is
    # still a circle.
    for i, (yaw, k, ov, aw, tv) in enumerate((
            (2.55, 0.30, 0.38, 0.48, 0.40),
            (4.20, 0.56, 0.42, 0.44, 0.36),
            (5.55, 0.76, 0.34, 0.36, 0.28))):
        _lump(s, "wobble_%d" % i, B, det, B.top_z * k, yaw,
              r * ov, r * aw, r * tv, "moss_dark", roll=0.30 * (i - 1),
              sink=0.34)

    # A CHIN under the mouth, proud, so the front of the silhouette has a step
    # in it instead of a smooth arc.
    _chip(s, "chin", B, det, 0.0, mz - r * 0.26,
          r * 0.32, r * 0.58, r * 0.26, "moss_dark", tilt=0.34, sink=0.24)


def detail_blub2(s, det, B):
    """blub2 -- HE THINKS HE IS TOUGH, and the crust should look STRAPPED ON,
    almost comic, like armour he found.

    The body now builds the carapace itself -- two flared plates, a ridge and
    three spikes -- so this does not add more rock. It adds the LASHING: two
    bands laid across the shell and hanging past its edges, one running front to
    back, a buckle where they cross, and the loose end of a strap dangling. That
    is the whole difference between a creature with a stone shell and a creature
    who has tied a rock to himself, and it costs five boxes.

    A band is laid on `B.top()` -- the real top surface over its own footprint,
    cast per strap -- so it follows the carapace instead of floating over it,
    and it stays right when the plates are re-angled. The brows are the body's
    and are left alone; the jowls below are new, and they are him flexing."""
    r = B.r
    plates = B.named("crust_plate", "crust_ridge", "crust")
    # THE SHELL'S OWN FOOTPRINT, not the unit's. `half_x` includes whatever is
    # widest anywhere on the model, which on this unit is 1.52 r while the
    # carapace only reaches 1.40 r -- and a strap cast at 1.40 r probes past the
    # rock into thin air, misses, and falls back to the overall top, which tips
    # the segment. Every band coordinate below is taken from the crust boxes.
    if plates:
        cx = max(max(abs(b[0][0]), abs(b[1][0])) for b in plates)
        cy0 = min(b[0][1] for b in plates)
        cy1 = max(b[1][1] for b in plates)
    else:
        cx, cy0, cy1 = B.half_x, -r * 0.9, r * 0.7
    edge = cx * 0.86
    mid = r * 0.30

    # TWO BANDS OVER THE SHELL, each in three draped segments -- down the left
    # plate, across the crest, down the right plate -- so the strap follows the
    # carapace instead of bridging it. Both overhang the plate edges, which is
    # where they touch the outline.
    ys = (cy0 + (cy1 - cy0) * 0.28, cy0 + (cy1 - cy0) * 0.72)
    for i, y in enumerate(ys):
        for j, (x0, x1) in enumerate(((-edge, -mid), (-mid, mid), (mid, edge))):
            _drape(s, "band_%d_%d" % (i, j), B, det, x0, x1, y,
                   r * 0.26, r * 0.22, "stone_dark", bite=r * 0.03,
                   extend=r * 0.18 if j != 1 else 0.0)

    # THE BUCKLE, on the crest where the near band crosses it. The one warm
    # note on the unit and the smallest solid on it.
    td.box(s, "buckle", (r * 0.30, r * 0.30, r * 0.16),
           (r * 0.16, ys[1], B.top(r * 0.16, ys[1]) + r * 0.05),
           (0.0, 0.0, 0.5), "ochre", det)
    # THE LOOSE END. A strap he never trimmed, hanging off the near plate.
    if plates:
        plo, phi = plates[-1]
        td.box(s, "strap_end", (r * 0.20, r * 0.26, r * 0.52),
               (phi[0] - r * 0.10, (plo[1] + phi[1]) * 0.5 + r * 0.30,
                plo[2] - r * 0.10), (0.0, -0.34, 0.0), "stone_dark", det)

    # JOWLS. He is holding his breath, and at 17 px two lumps at cheek height
    # are the only way to draw that.
    ex, ez = B.eyes()
    for sx in (-1, 1):
        _lump(s, "jowl", B, det, ez - r * 0.20, math.pi / 2 - sx * 0.92,
              r * 0.46, r * 0.48, r * 0.36, "moss_dark", sink=0.30)


def detail_blub3(s, det, B):
    """blub3 -- SERIOUS. Cut jaw, set shoulders, plates that look FITTED rather
    than stuck on.

    Fitted is a rim: every plate here gets a lip in the next value down that
    follows its own edge, which is the difference between armour and a sticker.
    blub3 is the one small unit Revue 1 passed, so this adds character without
    touching what makes it pass -- nothing here reaches past the pauldrons."""
    r = B.r
    ex, ez = B.eyes()
    jaw = B.anchor("jaw", "mouth")
    jz = (jaw[0][2] + jaw[1][2]) * 0.5 if jaw else ez - r * 0.42

    # THE CUT JAW: a hard flat block UNDER the mouth the body already models,
    # with a shadow under that. Square corners on a body made of nothing but
    # curves is the read. It sits BELOW the mouth and does not touch it -- a
    # first pass put a second dark bar across the mouth itself and the two
    # merged into a grille.
    _chip(s, "jaw", B, det, 0.0, jz - r * 0.17, r * 0.24, r * 0.74, r * 0.18,
          "dark", sink=0.30)
    _chip(s, "jaw_shadow", B, det, 0.0, jz - r * 0.33,
          r * 0.20, r * 0.66, r * 0.13, "moss_dark", tilt=0.30, sink=0.40)

    # COLLAR TABS, one under each pauldron, and this is the third seat they have
    # had. A gorget across the chest in `stone` was at EYE HEIGHT on this body
    # and one value ABOVE the moss: the render showed a bright bar across the
    # face like a bandage, and it was the brightest thing on the unit, which is
    # exactly what the value ladder forbids. Dropped to chest height in
    # `stone_dark` it stopped being bright and started being a bar lying on the
    # ground -- at this camera pitch the bottom of a body is where the shadow
    # is, and a horizontal band there detaches from it.
    #
    # A collar is not a band anyway. Two short tabs seated under the pauldrons
    # the body already builds are fitted armour, they sit at the height a collar
    # belongs at, and they cross nothing.
    for i, (plo, phi) in enumerate(B.named("pauldron")[:2]):
        sx = 1.0 if (plo[0] + phi[0]) > 0 else -1.0
        _lump(s, "collar_tab", B, det, plo[2] - r * 0.10,
              math.pi / 2 - sx * 0.86,
              r * 0.24, r * 0.42, r * 0.34, "stone_dark", sink=0.44)

    # ONE BACK PLATE. Every other piece here is on the face or the shoulders,
    # and a summon turns to aim: measured over four yaws the detail changed 29 %
    # of the unit's pixels from the front and 7 % from behind. The spine plate
    # is what the player sees when the blub is walking away.
    _lump(s, "spine", B, det, B.top_z * 0.52, -math.pi / 2,
          r * 0.22, r * 0.54, r * 0.60, "stone_dark", sink=0.52)

    # THE SHOULDER RIMS. Seated off the pauldron the body already built, so if
    # the pauldrons move the rims move with them.
    pauldrons = B.named("pauldron")
    for i, (plo, phi) in enumerate(pauldrons[:2]):
        sx = 1.0 if (plo[0] + phi[0]) > 0 else -1.0
        td.box(s, "shoulder_rim", (r * 0.16, (phi[1] - plo[1]) * 0.92,
                                   (phi[2] - plo[2]) * 0.42),
               (sx * (max(abs(plo[0]), abs(phi[0])) - r * 0.05),
                (plo[1] + phi[1]) * 0.5, phi[2] - (phi[2] - plo[2]) * 0.22),
               (0.0, sx * -0.38, 0.0), "stone_dark", det)

    # THE BROWS, low and level. No arch: this one is not amused.
    for sx in (-1, 1):
        _chip(s, "brow", B, det, sx * ex, ez + r * 0.13,
              r * 0.18, r * 0.40, r * 0.12, "dark", roll=sx * 0.16, sink=0.34)


def _mini_maw(B):
    """(height, radius) of a Mini's gape. `maw()` lays the mouth as a band of
    dark tiles ON the head, all called "maw", so their union box IS the gape."""
    box = B.anchor("maw", "gullet", "mouth")
    if box is None:
        return B.top_z * 0.35, B.r * 0.9
    lo, hi = box
    return (lo[2] + hi[2]) * 0.5, max(hi[0], -lo[0])


def detail_mini1(s, det, B):
    """mini1 -- FRANTIC. Ragged edges, uneven teeth, an eye that is too big.

    EVERY ragged piece on mini1 points UP. Revue 1 measured mini1 against mini2
    at 0.951 / 0.921 / 0.986 raw IoU across three yaws -- the same outline from
    every side -- and said the fix has to be overall aspect ratio, not an
    appendage, because at 10 x 13 px an appendage is one pixel. The body has
    since gone to a spire against the other Mini's slab; the detail pushes the
    same way rather than across it, so mini1 gets taller and spikier and mini2
    gets wider and lumpier, and neither footprint moves.

    THE EYE IS A SOCKET, not a bigger pupil. The body already models a large
    eyeball; a second, larger ball on top of it would just be a darker ball. A
    dark ring AROUND it with one bright speck in the middle is what reads as
    bulging, and it is the only place on the unit a bright pixel is spent."""
    r = B.r
    mz, mr = _mini_maw(B)
    ex, ez = B.eyes()

    # 0.52 r of socket was measured and looked at: it covered the head and read
    # as a hole punched through the unit rather than as an eye. A socket has to
    # be a RING around the eyeball the body built, and the speck of chalk inside
    # it is what turns a dark patch into something that is looking at you.
    ey = B.front(ez, 0.0)
    td.frustum(s, "eye_socket", r * 0.36, r * 0.32, r * 0.07,
               (0.0, ey + r * 0.02, ez), "dark", det, 6, (math.pi / 2, 0, 0))
    td.box(s, "eye_glint", (r * 0.11, r * 0.05, r * 0.11),
           (r * 0.11, ey + r * 0.10, ez + r * 0.11), (0, 0, 0), "chalk", det)

    # RAGGED EDGES, all upward, all different lengths, none at a matching yaw.
    # `lift` tips each piece so it stands off the spire instead of lying along
    # it, which is what turns a bump into a rag.
    for i, (yaw, k, out, tall) in enumerate((
            (1.05, 0.62, 0.46, 0.34),
            (2.35, 0.48, 0.36, 0.26),
            (4.90, 0.72, 0.40, 0.28))):
        _lump(s, "rag_%d" % i, B, det, B.top_z * k, yaw,
              r * out, r * 0.24, r * tall, "moss_dark",
              lift=-0.80, roll=0.4 * i, sink=0.34)

    # ONE OVERSIZED TOOTH out of the top of the gape, leaning. It is the one
    # piece allowed to out-bright the body, and it is also the tallest thing on
    # the near side of the unit.
    td.box(s, "tooth_big", (r * 0.20, r * 0.20, r * 0.66),
           (-r * 0.24, mr * 0.78, mz + r * 0.30), (0.24, 0.0, 0.32),
           "tooth", det)


def detail_mini2(s, det, B):
    """mini2 -- FRANTIC, the other way. Everything on mini2 goes SIDEWAYS:
    three frills off the flanks at two heights, two teeth pointing out of the
    corners of the grin rather than up, and two eyes of frankly different sizes.
    Where mini1 gains height, this one gains width -- the aspect-ratio split
    Revue 1 asked for, pushed the same way the body's slab already pushes.

    The frills are seated BELOW the stone lid on purpose: over it they would be
    hidden by an object that is already the widest thing on the unit, and under
    it they widen the part of the outline the lid does not cover."""
    r = B.r
    mz, mr = _mini_maw(B)
    ex, ez = B.eyes()

    # TWO EYES THAT DO NOT MATCH -- one nearly the whole side of the head, one
    # a dot. At 10 px an asymmetry is the only "expression" that survives.
    ey = B.front(ez, -ex)
    td.frustum(s, "eye_big", r * 0.42, r * 0.36, r * 0.08,
               (-ex, ey + r * 0.02, ez + r * 0.04), "dark", det, 6,
               (math.pi / 2, 0, 0))
    td.box(s, "eye_small", (r * 0.18, r * 0.08, r * 0.18),
           (ex, B.front(ez, ex) + r * 0.02, ez), (0, 0, 0), "dark", det)

    # FOUR FRILLS, uneven, all on the flanks and all under the lid. The fourth
    # exists because of a measurement and not a taste: with three, the yaw that
    # showed the fewest of them changed only 7 screen px of the unit, which is
    # inside the band Revue 1 called effectively invisible. Four means no
    # quarter-turn is blank.
    for i, (yaw, k, out, tall) in enumerate((
            (0.08, 0.44, 0.50, 0.34),
            (math.pi - 0.14, 0.56, 0.44, 0.28),
            (math.pi + 0.62, 0.36, 0.34, 0.24),
            (math.pi * 1.62, 0.50, 0.40, 0.26))):
        _lump(s, "frill_%d" % i, B, det, B.top_z * k, yaw,
              r * out, r * 0.24, r * tall, "moss_dark",
              roll=0.5 * i, sink=0.30)

    # TWO TEETH, uneven, out of the CORNERS of the grin. They lean outward, so
    # they add width where the frills do and not height.
    for i, (sx, tall, tilt) in enumerate(((-1.0, 0.44, 0.55),
                                          (1.0, 0.30, -0.40))):
        td.box(s, "tooth_%d" % i, (r * 0.18, r * 0.18, r * tall),
               (sx * mr * 0.86, mr * 0.52, mz + r * 0.10),
               (0.4, sx * 1.0, tilt), "tooth", det)


def detail_hungry(s, det, B):
    """hungry -- ALL APPETITE. Gum ridges, a drool ledge, and a body stretched
    by what it ate.

    Revue 1: hungry and cyber are BOTH radius 25 and share a round mass at 0.877
    shape IoU and 93 % containment, so size cannot separate them. The gorge
    lumps are the answer available to a detail layer: they run BACKWARDS off the
    gut, which makes this one long front-to-back where the Cyberblub stays
    round. Aspect ratio, not an appendage."""
    r = B.r
    gape = B.anchor("gullet", "maw", "mouth")
    jaw = B.anchor("chin", "jaw")
    gut = B.anchor("gut", "gut_cap")
    gz = (gape[0][2] + gape[1][2]) * 0.5 if gape else r * 0.80
    gy = gape[1][1] if gape else r * 1.10
    gw = (gape[1][0] - gape[0][0]) * 0.5 if gape else r * 0.90

    # GUM RIDGES: one soft dark band above the upper teeth and one below the
    # lower, tucked just inside the gape's own front plane so they are gums and
    # not a second set of lips. Without them the two rows of teeth are white
    # specks on a dark line; with them the mouth has a soft inside.
    for name, dz in (("gum_up", r * 0.20), ("gum_low", -r * 0.20)):
        td.box(s, name, (gw * 1.86, r * 0.16, r * 0.13),
               (0.0, gy - r * 0.06, gz + dz), (0, 0, 0), "moss_dark", det)

    # THE DROOL LEDGE: the lower lip pushed out and over, and two drips off it.
    # The ledge is body value; only the drips are allowed to be bright, and
    # they are the two smallest solids in the whole detail layer.
    if jaw:
        jy, jz = jaw[1][1], (jaw[0][2] + jaw[1][2]) * 0.5
    else:
        jy, jz = r * 1.30, r * 0.56
    td.box(s, "drool_ledge", (gw * 1.70, r * 0.34, r * 0.16),
           (0.0, jy + r * 0.06, jz + r * 0.06), (0.40, 0, 0), "moss_dark", det)
    for i, (dx, drop) in enumerate(((-0.44, 0.36), (0.52, 0.22))):
        td.box(s, "drip_%d" % i, (r * 0.09, r * 0.09, r * drop),
               (r * dx, jy + r * 0.16, jz - r * (0.06 + drop * 0.5)),
               (0, 0, 0), "chalk", det)

    # THE GORGE. Three lumps down the back of the gut sac, biggest at the
    # bottom, plus one angular STONE lump pressing out through the skin -- it
    # swallowed a piece of the circle and it has not gone down.
    #
    # They all grow BACKWARDS. Revue 1's hardest pair is hungry against cyber:
    # both radius 25, 0.877 shape IoU, 93 % containment, so size cannot part
    # them. The bodies now part them by height; this parts them by depth, which
    # is the one axis a detail can still push without touching a footprint.
    if gut:
        gcy = (gut[0][1] + gut[1][1]) * 0.5
        gcz = (gut[0][2] + gut[1][2]) * 0.5
    else:
        gcy, gcz = -r * 0.66, r * 0.58
    for i, (yaw, dz, out, across, tall) in enumerate((
            (math.pi * 1.50, -0.08, 0.46, 0.74, 0.50),
            (math.pi * 1.36, 0.02, 0.34, 0.54, 0.40),
            (math.pi * 1.64, 0.30, 0.26, 0.42, 0.30))):
        _lump(s, "gorge_%d" % i, B, det, gcz + r * dz, yaw,
              r * out, r * across, r * tall, "moss", roll=0.25 * i, sink=0.50)
    _lump(s, "swallowed", B, det, gcz - r * 0.14, math.pi * 1.42,
          r * 0.30, r * 0.34, r * 0.32, "stone_dark", roll=0.7, lift=0.3,
          sink=0.38)


def detail_cyber(s, det, B):
    """cyber -- GRAFTED. Panels let INTO the gel, and seams where flesh meets
    hardware.

    'Let into' is the whole word. Every panel here is seated with a big bite so
    the gel closes over its edge, and every panel gets a DARK seam frame a
    little larger than itself behind it -- the seam is the detail; the plate on
    its own reads as a sticker. The suture running across the belly with its
    staples is what connects the two grafts the body already has."""
    r = B.r
    grafts = B.named("graft", "graft_plate")
    top = B.top_z

    # THE GASKETS. The body bolts two chrome grafts to the shoulders and they
    # meet the gel at a hard edge with nothing happening there. A dark collar
    # sunk into the gel at the root of each one is the single most specific
    # thing in this whole file: it is the seam where flesh meets hardware, and
    # it is the difference between a graft and a box parked on a blob.
    # The seat is the graft's INBOARD face, taken from its box. A radial cast
    # cannot find this point: aimed along +X at graft height the first thing it
    # meets is the graft itself, so the collar would have been seated on the
    # outside of the hardware instead of at its root in the gel.
    for glo, ghi in grafts[:2]:
        sx = 1.0 if (glo[0] + ghi[0]) > 0 else -1.0
        root_x = glo[0] if sx > 0 else ghi[0]
        td.box(s, "gasket", (r * 0.14, (ghi[1] - glo[1]) * 1.26,
                             (ghi[2] - glo[2]) * 1.14),
               (root_x, (glo[1] + ghi[1]) * 0.5, (glo[2] + ghi[2]) * 0.5),
               (0, 0, 0), "dark", det)

    # TWO PANELS LET INTO THE GEL, each in its own seam. The seam is the
    # darkest value in the mark and it is what the plate reads against; a plate
    # with no seam is a sticker.
    # One forward, one round the BACK: over four yaws the front pair changed
    # 23 % of this unit's pixels from the front and 1 % from behind, and a summon
    # spends half its life walking away from the player.
    for i, (yaw, k, wide, tall) in enumerate((
            (math.pi * 0.18, 0.40, 0.46, 0.42),
            (math.pi * 1.36, 0.32, 0.42, 0.36))):
        z = top * k
        _lump(s, "seam_%d" % i, B, det, z, yaw,
              r * 0.16, r * (wide + 0.16), r * (tall + 0.14), "dark",
              sink=0.66)
        _lump(s, "panel_%d" % i, B, det, z, yaw,
              r * 0.18, r * wide, r * tall, "chrome_dk", sink=0.58)

    # THE SUTURE. A dark line running down the front of the belly from the
    # right-hand graft, three segments, stepping down and across. It is what
    # says somebody opened this animal and closed it again.
    gz = ((grafts[0][0][2] + grafts[0][1][2]) * 0.5) if grafts else top * 0.52
    for i in range(3):
        _lump(s, "suture_%d" % i, B, det, gz - r * (0.22 + 0.26 * i),
              math.pi * (0.86 - 0.10 * i),
              r * 0.12, r * 0.18, r * 0.34, "dark", sink=0.60, roll=0.2 * i)

    # A PORT let into the chest: dark bezel, dim lens. The only cold light the
    # detail adds to this unit, and it is about 2 px of it.
    _lump(s, "port_bezel", B, det, top * 0.30, math.pi * 0.50,
          r * 0.16, r * 0.34, r * 0.30, "dark", sink=0.58)
    _lump(s, "port_lens", B, det, top * 0.30, math.pi * 0.50,
          r * 0.17, r * 0.18, r * 0.16, "cyan_dim", sink=0.50)


def detail_mecha(s, det, B):
    """mecha -- A MACHINE BUILT AROUND A BLUB. Rivets, vents, and a cockpit
    read.

    The cockpit is the point. The body models a visor and a pilot behind it, and
    at 34 px neither of them is legible as a cockpit -- there is no FRAME. A
    hood over the glass, a frame around it and a dim pane inside turns a grey
    bar into a window with something in it, and the hood is the only piece here
    that also changes the outline."""
    r = B.r
    chassis = B.anchor("chassis")
    visor = B.anchor("visor")
    if visor is None:
        vz, vy = r * 1.24, r * 0.44
    else:
        vz = (visor[0][2] + visor[1][2]) * 0.5
        vy = visor[1][1]

    # THE COCKPIT IS A FRAME, NOT A LID.
    #
    # The first version put a chrome frame and a cyan_dim pane straight over the
    # visor -- and the render showed what that costs: the pane covered the blue
    # pilot dome, so "a machine built around a blub" lost the blub. The whole
    # point of this unit is that you can see the creature inside it.
    #
    # So: two posts either side and a hood over the top, and the middle stays
    # OPEN. Same three solids, and the pilot still shows through.
    for sx in (-1, 1):
        td.box(s, "cockpit_post", (r * 0.10, r * 0.14, r * 0.30),
               (sx * r * 0.25, vy + r * 0.04, vz), (0, 0, 0), "chrome_dk", det)
    td.box(s, "cockpit_hood", (r * 0.64, r * 0.22, r * 0.10),
           (0.0, vy + r * 0.04, vz + r * 0.34), (-0.22, 0, 0), "chrome_dk", det)

    # VENTS on the chest: two louvres, cut deep enough to be shadow rather than
    # a grey line.
    if chassis is None:
        cy_front, cz = r * 0.50, r * 0.70
    else:
        cy_front, cz = chassis[1][1], (chassis[0][2] + chassis[1][2]) * 0.5
    for i in range(2):
        td.box(s, "vent_%d" % i, (r * 0.62, r * 0.14, r * 0.11),
               (r * 0.18, cy_front + r * 0.05, cz - r * (0.02 + 0.22 * i)),
               (0.42, 0, 0), "dark", det)

    # A RIVET ROW along the top edge of the chassis. One rivet is 2 px and
    # invisible; four in a line is a dotted edge, which is a texture and does
    # read. They are the brightest thing in the mark and they total less than a
    # tenth of its area.
    if chassis is None:
        rx, ry_, rz = r * 0.50, r * 0.40, r * 1.02
    else:
        rx = chassis[1][0]
        ry_ = chassis[1][1]
        rz = chassis[1][2]
    for i in range(4):
        td.box(s, "rivet_%d" % i, (r * 0.11, r * 0.11, r * 0.11),
               (rx - r * (0.14 + 0.30 * i), ry_ - r * 0.06, rz - r * 0.05),
               (0, 0, 0.7), "chrome", det)


def detail_mecha2(s, det, B):
    """mecha2 -- UNSTABLE. Tank straps, warning chevrons, pipes under tension.

    Tension is drawn, not stated: each pipe is a straight taut run from the tank
    to a clamp on the hull, at a steeper angle than the body's own slack pipe,
    and the clamp at its foot is the thing that says something is holding.

    The chevrons are ANGLED SLATS and not a painted stripe. Voie B may never
    wear a porous surface, so hazard striping here is geometry catching light at
    two angles -- brushed steel and shadow, alternating -- which is legal and
    also survives a silhouette build."""
    r = B.r
    tanks = B.named("tank")
    hull = B.anchor("hull")
    armour = B.anchor("armour_f")

    # STRAPS ROUND THE TANKS. A hexagonal band and not a square plate: the
    # square version was sized off the tank's BOUNDING BOX, which on a tilted
    # cylinder is 30 % wider than the cylinder, and its corners then stood
    # 59 px outside the body -- a strap floating in space rather than round
    # anything. The band is taken off the tank's own minor diameter instead.
    for tlo, thi in tanks[:2]:
        cx = (tlo[0] + thi[0]) * 0.5
        cy = (tlo[1] + thi[1]) * 0.5
        cz = thi[2] - (thi[2] - tlo[2]) * 0.30
        rad = min(thi[0] - tlo[0], thi[1] - tlo[1]) * 0.5
        td.frustum(s, "tank_strap", rad * 1.12, rad * 1.12, r * 0.11,
                   (cx, cy, cz), "chrome_dk", det, 6)

    # CHEVRONS across the front armour: three slats, tilted alternately, in
    # brushed steel and shadow.
    if armour is None:
        ay, az = r * 0.70, r * 0.54
    else:
        ay = armour[1][1]
        az = (armour[0][2] + armour[1][2]) * 0.5
    # Four slats, leaning alternately, in brushed steel and shadow. The tilt is
    # about Y and that is the fix, not a detail: rotated about Z the slats turned
    # in the GROUND plane, where the camera cannot see a lean at all, and the
    # three of them read as one dark rectangle punched out of the hull. About Y
    # they lean in the screen plane and the alternation reads as striping.
    for i in range(4):
        lit = i % 2 == 0
        td.box(s, "chevron_%d" % i,
               (r * (0.30 if lit else 0.11), r * 0.12, r * 0.40),
               (r * (-0.36 + 0.24 * i), ay + r * 0.05, az + r * 0.06),
               (0.0, 0.55, 0.0), "steel_bru" if lit else "dark", det)

    # PIPES UNDER TENSION, and the clamps at their feet.
    hz = (hull[0][2] + hull[1][2]) * 0.5 if hull else r * 0.50
    for tlo, thi in tanks[:2]:
        cx = (tlo[0] + thi[0]) * 0.5
        cy = (tlo[1] + thi[1]) * 0.5
        sx = 1.0 if cx > 0 else -1.0
        foot = (sx * r * 0.34, cy + r * 0.34, hz + r * 0.16)
        td.tube(s, "pipe", r * 0.06, (cx, cy, tlo[2] + r * 0.06), foot,
                "chrome_dk", det, 5)
        td.box(s, "clamp", (r * 0.20, r * 0.20, r * 0.12), foot,
               (0, 0, 0), "chrome", det)


def detail_superb(s, det, B):
    """superb -- A COLOSSUS, AND THE JOKE IS THE TINY FRIGHTENED BLUB IN THE
    PORTHOLE. Make the porthole and the small face inside it unmistakable.

    Measured before it was touched: the body's own porthole face is built with
    `face(..., r * 0.15, scale=0.20)`, which puts its eyes at ball radius
    0.1 u.l. -- SEVEN HUNDREDTHS OF A SCREEN PIXEL. The gag the whole B path
    rests on is currently invisible, and no palette fixes that.

    So the porthole is rebuilt at a size that reads: a chrome bezel at 1.30x the
    ring the body already has, a dark interior for the pilot to be pale against,
    a head that fills two thirds of it and two eyes about 2 px each with a 3 px
    gap. Everything is seated off `port_ring`'s own measured box, so if the
    porthole moves the face goes with it."""
    r = B.r
    ring = B.anchor("port_ring", "port_glass")
    if ring is None:
        cx, cy, cz, rad = 0.0, r * 0.50, r * 1.02, r * 0.26
    else:
        lo, hi = ring
        cx = (lo[0] + hi[0]) * 0.5
        cz = (lo[2] + hi[2]) * 0.5
        cy = hi[1]
        rad = max(hi[0] - lo[0], hi[2] - lo[2]) * 0.5

    # THE PORTHOLE, stacked forward along +Y: bezel, interior, pilot, features.
    # Each layer is in front of the one behind it, so this is a depth stack and
    # not a z-fight.
    td.frustum(s, "port_bezel", rad * 1.30, rad * 1.26, r * 0.08,
               (cx, cy, cz), "chrome_dk", det, 8, (math.pi / 2, 0, 0))
    td.frustum(s, "port_black", rad * 1.02, rad * 1.00, r * 0.06,
               (cx, cy + r * 0.045, cz), "dark", det, 6, (math.pi / 2, 0, 0))

    # THE PILOT. Pale gel on black is the strongest value break available, and
    # at this size that contrast is what carries the joke, not the modelling.
    # The stack is kept SHALLOW on purpose: each layer clears the one behind it
    # by about 0.03 r, so the whole porthole stands 8 px proud of the hull and
    # reads as a bubble, not as a snout.
    head = rad * 1.30
    hy = cy + r * 0.075
    td.box(s, "pilot_head", (head, r * 0.06, head * 0.92),
           (cx, hy, cz - rad * 0.10), (0, 0, 0), "blue_gel", det)
    for sx in (-1, 1):
        td.box(s, "pilot_eye", (head * 0.26, r * 0.05, head * 0.30),
               (cx + sx * head * 0.25, hy + r * 0.03, cz + rad * 0.04),
               (0, 0, 0), "dark", det)
    td.box(s, "pilot_mouth", (head * 0.34, r * 0.05, head * 0.16),
           (cx, hy + r * 0.03, cz - rad * 0.44), (0, 0, 0), "dark", det)
    # One glint across the glass, so it reads as behind something.
    td.box(s, "port_glint", (rad * 1.5, r * 0.04, rad * 0.16),
           (cx, hy + r * 0.05, cz + rad * 0.62), (0.0, 0.0, 0.30),
           "cyan_dim", det)

    # And two ribs on the hull, because a colossus should be plated. Seated off
    # the HULL BOX and not off a radial cast: the cast version was aimed at the
    # front quarter and the first thing it hit was the ARM tube, so both ribs
    # ended up seated on the arm and hanging 23 px outside the hull. A limb in
    # front of a flank is exactly the case a radial probe gets wrong, and a body
    # solid you can name is the answer to it.
    hull = B.anchor("hull")
    if hull is not None:
        hx = max(hull[1][0], -hull[0][0])
        hz = (hull[0][2] + hull[1][2]) * 0.5
        tall = (hull[1][2] - hull[0][2]) * 0.62
        # On the FLANKS, not on the front: the porthole owns the front face, and
        # ribs there were competing with the one thing this unit exists to show.
        for sx in (-1, 1):
            td.box(s, "rib", (r * 0.10, (hull[1][1] - hull[0][1]) * 0.78, tall),
                   (sx * (hx + r * 0.04), (hull[0][1] + hull[1][1]) * 0.5, hz),
                   (0, 0, 0), "dark", det)
        # And one plate on the BACK. From behind, the detail changed exactly
        # zero pixels of this unit before this piece existed.
        td.box(s, "back_plate", (hx * 1.10, r * 0.12, tall * 0.86),
               (0.0, hull[0][1] - r * 0.04, hz), (0, 0, 0), "chrome_dk", det)


DETAILS = [
    ("blub1", detail_blub1), ("blub2", detail_blub2), ("blub3", detail_blub3),
    ("mini1", detail_mini1), ("mini2", detail_mini2),
    ("hungry", detail_hungry), ("cyber", detail_cyber),
    ("mecha", detail_mecha), ("mecha2", detail_mecha2),
    ("superb", detail_superb),
]


# ---------------------------------------------------------------------------

def build_detail(unit_id, fn, body, flat):
    """Same two nodes as tower_summoner's build_unit and as the marks, so a
    detail rides exactly what the body rides. Nothing is world_fixed: a detail
    is ON the creature and turns with it."""
    s = td.Scene(palette(flat))
    root = s.node("root")
    det = s.node("body", parent=root)
    fn(s, det, body)
    return td.build(s, "blub-detail-" + unit_id)


BUDGET = 150                       # a detail is drawn per unit, hundreds a wave


def _audit(model, body, base_mat):
    """The numbers that decide whether a detail is worth its triangles.

    `bump`  the furthest a vertex stands out of the body's own skin, radially,
            where there IS skin behind it. This is a lump on a flank.
    `grow`  how much wider and taller the detail makes the whole unit, from the
            two bounding boxes. This is a piece that reaches past the body
            entirely -- a spike, a strap, a tooth -- and it is the other half of
            "does the outline change".
    `hot`   the share of the detail's real surface area at least 40 luminance
            above the body's base colour. `bright` is the same thing at any
            margin at all, which on a stone plate over moss is +9 and means
            nothing; `hot` is the one that would actually pull the eye off the
            character, and it is what the value ladder is about.
    """
    pos = model["positions"]
    idx = model["colourIndex"]
    pal = model["palette"]
    base = luminance(base_mat)
    area = {}
    for t in range(len(idx)):
        a = pos[t * 9:t * 9 + 3]
        b = pos[t * 9 + 3:t * 9 + 6]
        c = pos[t * 9 + 6:t * 9 + 9]
        area[idx[t]] = area.get(idx[t], 0.0) + _tri_area(a, b, c)
    total = sum(area.values()) or 1e-9
    bright = hot = 0.0
    for i, a in area.items():
        lum = (0.2126 * pal[i][0] + 0.7152 * pal[i][1]
               + 0.0722 * pal[i][2]) * 255.0
        if lum > base + 1.0:
            bright += a
        if lum > base + 40.0:
            hot += a

    seen = set()
    bump = 0.0
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for i in range(0, len(pos), 3):
        p = (pos[i], pos[i + 1], pos[i + 2])
        for k in range(3):
            lo[k] = min(lo[k], p[k])
            hi[k] = max(hi[k], p[k])
        key = (round(p[0], 3), round(p[1], 3), round(p[2], 3))
        if key in seen:
            continue
        seen.add(key)
        d = body.proud(p)
        if d is not None and d > bump:
            bump = d
    grow_x = max(hi[0], -lo[0]) - body.half_x
    grow_z = hi[2] - body.top_z
    return bump, grow_x, grow_z, bright / total, hot / total


def main():
    flat = "--silhouette" in sys.argv
    print("building the blub detail layer (%s)"
          % ("SILHOUETTE" if flat else "full"))
    total = 0
    worst_tris = 0
    rows = []
    print("    %-14s %5s  %-24s %-22s %s"
          % ("model", "tris", "outline change (screen px)",
             "value over the body", "ground r"))
    for unit_id, fn in DETAILS:
        body = _Body(unit_id)
        model = build_detail(unit_id, fn, body, flat)
        td.write_js(model, "blub-detail-%s.js" % unit_id)
        bump, gx, gz, bright, hot = _audit(model, body, BASE_MAT[unit_id])
        px = PX_PER_UNIT * PX_PER_UL
        best = max(bump, gx, gz) * px
        total += model["triangles"]
        worst_tris = max(worst_tris, model["triangles"])
        rows.append((unit_id, model["triangles"], best,
                     sorted(set(body.missing))))
        flag = "  OVER BUDGET" if model["triangles"] > BUDGET else ""
        print("    blub-detail-%-7s %4d  bump %4.1f wider %4.1f taller %4.1f  "
              "bright %4.1f%% hot %4.1f%%  %4.1f px%s"
              % (unit_id, model["triangles"], bump * px, gx * px, gz * px,
                 bright * 100.0, hot * 100.0, body.r * PX_PER_UNIT, flag))
    print("  %d details, %d triangles total, worst %d (budget %d)"
          % (len(DETAILS), total, worst_tris, BUDGET))

    # ANCHOR DRIFT. Every seat in this file is a probe or a named solid on the
    # body; if a body is re-profiled and a solid is renamed, the fallback still
    # builds something -- so the only way to notice is to print it. A clean
    # build prints nothing here.
    misses = [(u, m) for u, _, _, m in rows if m]
    if misses:
        print("  ANCHORS THAT FELL BACK -- a body solid was renamed or moved:")
        for unit_id, m in misses:
            print("    %-7s %s" % (unit_id, ", ".join(m[:6])))
    else:
        print("  every anchor resolved against the built bodies")

    weak = [(u, p) for u, _, p, _ in rows if p < 2.0]
    if weak:
        print("  DECORATION ONLY -- under 2 screen px of outline change, so it "
              "lives or dies on value alone:")
        for unit_id, p in weak:
            print("    %-7s %.1f px" % (unit_id, p))


if __name__ == "__main__":
    main()
