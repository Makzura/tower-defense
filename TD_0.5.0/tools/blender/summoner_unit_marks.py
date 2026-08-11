# ---------------------------------------------------------------------------
# THE CROSSPATH MARKS ON THE TEN BLUB UNITS.
#
# tower_summoner.py builds the ten bodies. This builds the twenty small add-ons
# that say a unit has been touched by the OTHER path, and it touches nothing
# else -- it does not import a body, does not re-emit one and cannot move one.
#
#   python tools/blender/summoner_unit_marks.py                build everything
#   python tools/blender/summoner_unit_marks.py --silhouette   build PASS 1 forms
#
# COMMIT COLOUR BUILDS. `--silhouette` exists so a form can be judged without a
# palette; a silhouette build has been committed over colour models once already
# and shipped 46 grey meshes. Re-run without the flag before you finish.
#
# THE ABSOLUTE RULE, AND WHY IT IS TRUE BY CONSTRUCTION. A mark adds a detail ON
# TOP. It may never remodel anything, never change a proportion and never move a
# pivot: the same body with and without a mark has to be superposable pixel for
# pixel. Every mark here is therefore its OWN model -- `blub-mark-<mark>-<unit>`
# -- built in a scene that contains the mark and nothing else. There is no body
# geometry in this file to accidentally alter, and drawing a mark is drawing a
# second model over an untouched first one.
#
# THE BODIES ARE STILL THE SOURCE OF TRUTH FOR WHERE A MARK GOES, AND NOW THE
# PROFILES ARE IMPORTED RATHER THAN MIRRORED. This file used to keep its own
# copy of `drop()`'s four band coefficients in `DROP_BANDS`/`_drop_radius`,
# because every path A body came out of `drop()` and the only way onto that
# surface was to restate it. That is exactly the drift the copy was warned about
# and it happened: the 2026-08-11 re-profiling gave blub1 an EGG, mini1 a SPIRE,
# mini2 a SQUAT, blub2 a lens and the Hungry Blub a pair of box wedges, `drop()`
# kept blub3 alone, and every seat in this file was still aimed at a drop. The
# marks floated off five units and one of them (mini2's band) was swallowed
# whole.
#
# So the profiles are now `ts.EGG`, `ts.SPIRE`, `ts.SQUAT` and the radius comes
# from `ts.radius_at`, the same function the bodies use to lay their own mouths
# on themselves. `R` and `UNIT_FOOTPRINT` were already imported for the same
# reason. What is left restated is `DROP` -- four numbers `drop()` still bakes
# into vertices for blub3 alone -- and it is written in the profile format the
# other three use so that ONE radius function serves the whole path.
#
# PASS 1 vs PASS 2, exactly as tower_summoner.py and summoner_figure.py do it:
# every solid carries its real material name from the first line and
# `--silhouette` swaps the whole palette for one flat grey, so form is judged
# before colour and the two passes cannot drift apart.
#
# THE ONE COLD LIGHT ON PATH A. b1 and b2 put cyan on a moss body, which is the
# only place in the whole tower where voie A emits cold. That is the point of the
# mark: the crosspath is supposed to be legible as a foreign thing on the
# creature, and cyan on moss is the loudest legal way to say so. It is rationed
# accordingly -- the marks carry cyan, cyan_dim and dark and NOTHING else, no
# chrome and no steel, so a marked blub still reads as a blub with a light in it
# rather than as a half-finished machine.
#
# VALUE FIRST, HUE SECOND, on both sides:
#   b1/b2  dark clasp (.12) under cyan (bright) -- the darkest value is the
#          seating, so the emissive piece has something to be bright against.
#   a1     moss_dark crust (.32) under lichen beads (.62) on chrome_dk (.37) and
#          deep_blue (.30) joints. The crust is what stops a lichen patch reading
#          as one flat blob at 12 px.
#   a2     the stone plate is the mark's LARGEST surface (.48), its engraving
#          cut one value DOWN in the same stone (.33), and chrome bolts (.60)
#          as the only bright note. The cuts were ochre until the critic pass
#          caught it: ochre is a pigment, voie B may never wear a porous
#          surface, and the plate's exemption covers the stone and not a paint
#          job on top of it. summoner_figure.py had it right all along.
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
EGG, SPIRE, SQUAT = ts.EGG, ts.SPIRE, ts.SQUAT
radius_at = ts.radius_at                   # and neither is the profile maths

# Screen pixels per u.l. at the review's reference viewport (1278 x 719, the
# game's default camera). Only used to PRINT a size prediction beside each mark,
# so a piece too small to see is caught at build time instead of after a capture.
PX_PER_UL = 0.68


# --- palettes ---------------------------------------------------------------
# Copied verbatim from tower_summoner.py. It is copied and not imported on
# purpose: the palette is the contract every build script in this folder states
# for itself (summoner_figure.py does the same), while the footprint table and
# the body profiles are derived numbers that must never be stated twice.
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


PATH_A = ["blub1", "blub2", "blub3", "mini1", "mini2", "hungry"]
PATH_B = ["cyber", "mecha", "mecha2", "superb"]


# ---------------------------------------------------------------------------
# READING THE BODIES WITHOUT TOUCHING THEM.
#
# `drop()` in tower_summoner stacks four frusta -- foot, belly, waist, dome --
# and bakes the result into vertices. It is the ONE profile the body script does
# not publish as data, because it is now blub3's alone and `squash`, its live HP
# hook, is baked in with it. So its coefficients are restated here in the
# (lower, upper, share of height) form `EGG`, `SPIRE` and `SQUAT` use, which
# means `ts.radius_at` reads it exactly as it reads the imported three and this
# file has one radius function instead of two:
#
#   foot   0.62 -> 0.94 over the first 18% of the height
#   belly  0.94 -> 1.00 over the next  26%
#   waist  1.00 -> 0.74 over the next  30%
#   dome   0.74 -> 0.14 over the last  26%
#
# `squash` is 1.0 on every authored unit, so `wide` is r and this is exact.
# ---------------------------------------------------------------------------

DROP = [(0.62, 0.94, 0.18), (0.94, 1.00, 0.26), (1.00, 0.74, 0.30),
        (0.74, 0.14, 0.26)]


def _skin(rx, ry, cy, a):
    """A point on the horizontal ellipse (rx, ry) centred on (0, cy), at the
    parameter `a` measured from +X towards +Y, and the OUTWARD yaw there.

    ONE PRIMITIVE FOR EVERY PATH A BODY. rx == ry is a circle, the yaw is just
    the bearing, and that is what the four bodies of revolution want -- their rx
    and ry are both `radius_at` at the seat's own height. They differ on the
    Blub II, whose body is a single squashed ellipsoid: there the surface normal
    leans towards the SHORT axis, by up to 12 degrees at its mouth, and a tile
    laid along the bearing instead would be visibly turned against the surface
    it is supposed to be lying flat on."""
    x = math.cos(a) * rx
    y = cy + math.sin(a) * ry
    return x, y, math.atan2(math.sin(a) / ry, math.cos(a) / rx)


# --- small builders shared by the marks --------------------------------------

def _chip(s, name, at, yaw, size, mat, body):
    """A flat piece whose local +X is the outward normal. `size` is
    (thickness out, width across, height), which is how a chip bolted to a
    surface is actually thought about."""
    return td.box(s, name, size, at, (0, 0, yaw), mat, body)


# ---------------------------------------------------------------------------
# THE FOUR MARKS.
# ---------------------------------------------------------------------------

def mark_b1(s, body, unit):
    """b1 -- THE MOUTH LIGHTS UP CYAN. Path A only.

    A blub's mouth is the one feature every unit on this path already has, and
    it is the feature the player watches, so the crosspath announces itself
    there. It sits OVER the mouth the body already models -- it never replaces
    it, so the dark mouth is still there underneath doing the drawing.

    IT IS A BAND OF TILES ON THE BODY'S OWN CURVE, which is the same answer
    `tower_summoner.maw()` reached for the mouths themselves and for the same
    reason. A single flat bar across a 12-gon buries its middle in the nose
    ridge and floats its ends off the two facets beside it; a run of tiles, each
    seated and turned on its own piece of surface, cannot. That deletes the
    `_drop_front_y` / `_facet_seat` facet arithmetic this file used to need --
    those existed to thread one flat piece onto one particular body.

    AND IT IS MUCH BIGGER THAN IT WAS. Revue 1 measured b1 on blub1, blub2,
    blub3, mini1 and mini2 at 3 to 7 screen pixels and said, correctly, that a
    3 px mark has nowhere to put a cyan and must be revisited in SIZE, not in
    palette, before pass 2 tries to colour it. The old piece was sized to the
    mouth the body models -- blub1's is a ball 0.34 r across, which is 2.3 px --
    so it could not be anything else. A light behind a mouth spills; the band
    spans up to 2.6 radians of the front and stands as tall as the gape, and the
    unit reads as lit from inside rather than as having a lit dot.

    Brightest at the centre, dimmer at the two ends: the outermost tile on each
    side is cyan_dim, so a mouth 4 to 22 px wide does not read as one flat bar.
    Tile heights fall off towards the ends by `mouth_lens`, which is what keeps
    a round mouth (blub1) round and lets a slot mouth (blub3) stay a slot."""
    b = BODIES[unit]
    n = b["mouth_tiles"]
    tall, thick, lens = b["mouth_tall"], b["mouth_thick"], b["mouth_lens"]
    z, push = b["mouth_z"], b["mouth_push"]

    for i in range(n):
        u = -1.0 + 2.0 * (i + 0.5) / n
        hi = tall * (1.0 - lens * u * u)
        mat = "cyan_dim" if (i == 0 or i == n - 1) else "cyan"

        if b["mouth_kind"] == "bar":
            # THE HUNGRY BLUB, and it is the one flat mouth in the family. Its
            # gape is the dark `gullet` slab standing between two box wedges, so
            # the light lies on a plane and an arc would only bend it off one.
            wide = b["mouth_w"] / n
            at = (b["mouth_w"] * u * 0.5, b["mouth_y"] + push, z)
            _chip(s, "mouth_%d" % i, at, math.pi * 0.5,
                  (thick, wide * 1.12, hi), mat, body)
            continue

        span = b["mouth_span"]
        step = span / n
        a = math.pi * 0.5 + span * (-0.5 + (i + 0.5) / n)
        rx, ry, cy = b["mouth_rx"], b["mouth_ry"], b["mouth_cy"]
        # The tile's width is the CHORD its own step subtends, measured on the
        # real ellipse rather than from a radius -- on the Blub II the two are
        # 50% apart -- and overlapped a little so the band has no gaps in it.
        x0, y0, _ = _skin(rx, ry, cy, a - step * 0.5)
        x1, y1, _ = _skin(rx, ry, cy, a + step * 0.5)
        wide = math.hypot(x1 - x0, y1 - y0) * 1.12
        x, y, yaw = _skin(rx, ry, cy, a)
        at = (x + math.cos(yaw) * push, y + math.sin(yaw) * push, z)
        _chip(s, "mouth_%d" % i, at, yaw, (thick, wide, hi), mat, body)


def mark_b2(s, body, unit):
    """b2 -- A THIN CYAN RING ENCIRCLING THE BODY. Path A only.

    The other half of the same statement as b1: a machined band clamped round a
    creature that has no straight lines anywhere on it. Twelve major segments
    because every blub body of revolution is built from 12-sided frusta and
    shares its phase, so the band's facets land on the body's facets and it hugs
    instead of hovering.

    IT TAKES THE BODY'S OWN GIRTH AT ITS OWN HEIGHT, out of `ts.radius_at` on
    the four bodies of revolution and out of the ellipsoid's own semi-axes on
    the Blub II, so it is ON the creature and not around it. A band that cuts
    into the body somewhere reads as fastened; one that floats everywhere reads
    as a hoop lying on the floor behind it -- which is exactly what mini2's had
    become in reverse, swallowed whole by a body that had grown a fifth wider
    than the band was cut for.

    IT IS AN OVAL WHERE THE BODY IS. Three of these animals are not bodies of
    revolution: blub2 is a lens half again as wide as it is deep, and the Hungry
    Blub is a box wedge. A circle round either stands 2 px off the front and
    back while cutting the flanks. `ring_rx`/`ring_ry` are the ellipse that fits
    the mass, and the ring is stretched onto it the same way `td_mesh.ellipsoid`
    stretches a ball -- the tube ends up a little thicker across the long axis,
    by a third of a screen pixel, and that is the whole cost.

    IT SITS BELOW THE MOUTH, and every unit's height was chosen against a render
    of the two marks TOGETHER. At the board's 34 degree pitch a mark on the
    FRONT of a body is thrown a long way down the screen -- the Blub III's mouth
    projects level with a band a full radius below it -- so "below the mouth"
    has to be read off a capture and not off a z.

    THE CLASP is dark, not chrome: the darkest value in the mark goes under the
    emissive one, and it keeps path A's marks to cyan and shadow only."""
    b = BODIES[unit]
    z, cy = b["ring_z"], b["ring_y"]
    rx, ry = b["ring_rx"], b["ring_ry"]
    minor = 0.024                            # absolute: ~1.5 px thick on every
    ring = td.torus(s, "ring", ry, minor, (0, cy, z), (0, 0, 0), "cyan", body,
                    12, 4)
    if abs(rx - ry) > 1e-9:
        k = rx / ry
        ring.verts = [(v[0] * k, v[1], v[2]) for v in ring.verts]
    # One clasp, on the flank, so the ring has a direction and a seam.
    _chip(s, "ring_clasp", (rx * 0.99, cy, z), 0.0,
          (minor * 2.2, minor * 3.4, minor * 3.4), "dark", body)


def mark_a1(s, body, unit):
    """a1 -- A PATCH OF LICHEN IN A JOINT. Path B only.

    Voie B is smooth by law and the inherited stone and the lichen in its seams
    are the single exemption (brief section 4). Every path B unit already wears
    one obligatory bead; this mark is the crosspath making it a COLONY, and it
    grows in a JOINT -- the shoulder seam of a graft, the hip where a leg leaves
    the hull -- because that is where a machine is open and where damp collects.
    It is deliberately on the side the body's own bead is not, so the two never
    fight for the same pixels.

    A moss_dark crust under the beads: at this size a cluster of same-value
    balls is one green smudge, and the crust is the value the beads read
    against."""
    at, yaw = BODIES[unit]["joint"], BODIES[unit]["joint_yaw"]
    spread = BODIES[unit]["joint_r"]
    nx, ny = math.cos(yaw), math.sin(yaw)
    _chip(s, "lichen_crust", at, yaw,
          (spread * 0.50, spread * 1.60, spread * 1.30), "moss_dark", body)
    for i, (dx, dy, dz, k) in enumerate(
            ((0.48, 0.00, 0.20, 1.00), (0.46, 0.50, -0.16, 0.66),
             (0.48, -0.42, 0.38, 0.58), (0.44, 0.16, -0.46, 0.50))):
        # dx runs out along the joint's normal, dy across it, dz up. Every bead
        # carries a big dx on purpose: a joint is a corner, not a plane, and the
        # two beads that were offset sideways on a small dx ended up inside the
        # hull on the Cyberblub and the SuperBlub.
        td.ball(s, "lichen_%d" % i, spread * k * 0.45,
                (at[0] + (dx * nx - dy * ny) * spread,
                 at[1] + (dx * ny + dy * nx) * spread,
                 at[2] + dz * spread), "lichen", body, 5, 3)


def mark_a2(s, body, unit):
    """a2 -- A BOLTED ENGRAVED STONE PLATE ON THE FLANK. Path B only.

    The same object `_inheritance()` bolts to the Summoner himself: a piece of
    the old circle, cut, and driven into the chassis with four chrome bolts. The
    crosspath version is bigger and it is on the FLANK, where the silhouette is
    flat and a rectangle of matte stone reads against chrome at any angle.

    The engraving is cut in the SAME STONE one value down, and sunk proud of the
    plate face -- a cut that is only a colour is a cut nobody renders.

    It used to be ochre here while the figure cut it in stone_dark, and the
    reason given was that it matched the figure. It did not. The figure is the
    one that follows the brief: voie B may never show a porous surface except
    its inherited stone, and ochre is a pigment, so filling the cuts with it put
    a porous paint job on a machine. The plate's exemption covers the stone
    itself, not something painted onto it. Stone and chrome and nothing else,
    and it does not get to glow."""
    b = BODIES[unit]
    yaw = b["plate_yaw"]
    w, tall, thick = b["plate_w"], b["plate_h"], b["plate_t"]
    nx, ny = math.cos(yaw), math.sin(yaw)
    tx, ty = -ny, nx                          # across the face
    # THE BITE. The seat is the flank's own surface; the plate is pulled a
    # fraction back INTO it so its back face cannot show a seam of daylight
    # against the hull. It is bolted on, not leaning on.
    bite = b["r"] * 0.02
    at = (b["plate"][0] - nx * bite, b["plate"][1] - ny * bite, b["plate"][2])

    _chip(s, "plate", at, yaw, (thick, w, tall), "stone", body)
    face = thick * 0.60
    for i, dz in enumerate((tall * 0.22, -tall * 0.22)):
        _chip(s, "engrave_%d" % i,
              (at[0] + nx * face, at[1] + ny * face, at[2] + dz), yaw,
              (thick * 0.5, w * 0.66, tall * 0.11), "stone_dark", body)
    _chip(s, "engrave_bar",
          (at[0] + nx * face, at[1] + ny * face, at[2]), yaw,
          (thick * 0.5, w * 0.13, tall * 0.52), "stone_dark", body)
    for i in range(4):
        a = math.tau * i / 4 + math.pi / 4
        off = math.cos(a) * w * 0.40
        _chip(s, "bolt_%d" % i,
              (at[0] + nx * face + tx * off, at[1] + ny * face + ty * off,
               at[2] + math.sin(a) * tall * 0.38), yaw,
              (thick * 0.55, w * 0.13, tall * 0.16), "chrome", body)


MARKS_A = [("b1", mark_b1), ("b2", mark_b2)]        # go on path A units
MARKS_B = [("a1", mark_a1), ("a2", mark_a2)]        # go on path B units


# ---------------------------------------------------------------------------
# THE SEATS. One row per unit. Wherever the body HAS a profile, no radius is
# typed in: the seat is `radius_at` on the profile it was stacked from, or the
# semi-axes of the ellipsoid it is, evaluated at the seat's own height. The
# arguments are then the numbers that appear in tower_summoner.py's own call --
# the profile, the height in radii, the fraction of it `face()` or `maw()` was
# given -- so a row reads as a citation of the body it belongs to, and `main()`
# prints the resolved surface so a drift is visible on the next build.
#
# The four rows that stay hand-measured are the four bodies with no profile to
# read: the Hungry Blub and the three chassis are assemblies of boxes, and the
# comment on each names the solid in tower_summoner.py it was measured against.
# ---------------------------------------------------------------------------

# Depth of a mouth tile, and how much of it is buried. Nothing here is ever laid
# ON the surface with no bite: a piece that only touches shows a seam of
# background between itself and the body at some yaw.
TILE_THICK = 0.09                           # in r
TILE_SINK = 0.35                            # fraction of the tile inside


def _round_seat(unit, profile, height_k, face_k, mouth_dz, span, tiles, tall,
                lens, ring_k, scale=1.0, body_k=1.0, proud=0.0, ring_out=0.99):
    """A path A unit whose body is `_stack`ed about the tower axis: blub1 (EGG),
    mini1 (SPIRE), mini2 (SQUAT) and blub3, whose `drop()` is DROP above.

    `height_k` is the height tower_summoner gave `_stack`, in r. `body_k` is the
    radius it gave it, which is r everywhere except mini2 -- that one is stacked
    at r * 1.10 and its band was a fifth too small for it. `face_k` and
    `mouth_dz` are the two numbers that put the mouth on the body: z = h*face_k
    - r*mouth_dz for a `face()` mouth, and mouth_dz = 0 for the two Minis, whose
    mouth is a `maw()` at a plain fraction of the height.

    `ring_out` is the one number a profile cannot supply, and it is the lesson
    of this rebuild. A band flush on the body (0.99) is invisible if the body
    BULGES OUT above it: at the board's 34 degree pitch the camera looks down
    the creature's shoulder, and mini2's band -- correctly seated, 0.5 px proud
    of the surface it was on -- was measured at 0 px over the body from the
    front, because the SQUAT profile is a fifth wider a third of a radius higher
    up and simply stood in front of it. Above 1.0 the band is carried out past
    that bulge; the daylight it costs is under a pixel, and the alternative is a
    mark nobody can see."""
    r = R(UNIT_FOOTPRINT[unit]) * scale
    rb = r * body_k
    h = r * height_k
    z = h * face_k - r * mouth_dz
    rad = radius_at(profile, rb, h, z)
    zr = h * ring_k
    ring = radius_at(profile, rb, h, zr) * ring_out
    return {
        "r": r, "h": h,
        "mouth_kind": "arc", "mouth_z": z,
        "mouth_rx": rad, "mouth_ry": rad, "mouth_cy": 0.0,
        "mouth_span": span, "mouth_tiles": tiles,
        "mouth_tall": r * tall, "mouth_lens": lens,
        "mouth_thick": r * TILE_THICK,
        "mouth_push": r * (TILE_THICK * (0.5 - TILE_SINK) + proud),
        "mouth_w": 2.0 * rad * math.sin(span * 0.5),
        "ring_z": zr, "ring_y": 0.0, "ring_rx": ring, "ring_ry": ring,
    }


def _lens_seat(unit, size, centre, face_z, face_r, mouth_dz, span, tiles, tall,
               lens, ring_z, proud):
    """BLUB II, the one path A body that is a single `td.ellipsoid` -- broader
    than it is deep on purpose, so that "wide and low" does not quietly become
    "tall" the moment the unit turns ninety degrees.

    `size` and `centre` are its own call's arguments in r, so the girth at any
    height is the ellipsoid's own: semi-axes scaled by sqrt(1 - k^2) at k of the
    way up. `proud` is the one number that is not read off the body: `face()`
    seats this unit's mouth 0.08 r OUTSIDE the lens (front=0.64 of a face radius
    of 0.88 r, against a surface at 0.51 r there), so the light has to stand off
    the lens by that much to be over the mouth rather than behind it."""
    r = R(UNIT_FOOTPRINT[unit])
    ax, ay, az = (v * 0.5 * r for v in size)
    cy, cz = centre[1] * r, centre[2] * r

    def girth(z):
        k = (z - cz) / az
        s = math.sqrt(max(0.0, 1.0 - k * k))
        return ax * s, ay * s

    z = r * face_z - r * face_r * mouth_dz
    rx, ry = girth(z)
    zr = r * ring_z
    rrx, rry = girth(zr)
    return {
        "r": r, "h": cz + az,
        "mouth_kind": "arc", "mouth_z": z,
        "mouth_rx": rx, "mouth_ry": ry, "mouth_cy": cy,
        "mouth_span": span, "mouth_tiles": tiles,
        "mouth_tall": r * tall, "mouth_lens": lens,
        "mouth_thick": r * TILE_THICK,
        "mouth_push": r * (TILE_THICK * (0.5 - TILE_SINK) + proud),
        "mouth_w": 2.0 * rx * math.sin(span * 0.5),
        "ring_z": zr, "ring_y": cy,
        "ring_rx": rrx * 0.99, "ring_ry": rry * 0.99,
    }


def _wedge_seat(unit, mouth_y, mouth_z, mouth_w, tiles, tall, lens, proud,
                ring, jaw):
    """THE HUNGRY BLUB, whose head is two box wedges and a domed cranium and
    whose gape is the dark `gullet` slab between them. Nothing about it is a
    body of revolution, so both marks are given the flat geometry it has:

      mouth  a straight row of tiles on the gullet's own front face, at the
             height the two rows of teeth leave clear, `mouth_y` and `mouth_z`
             being that slab's front plane and centre out of unit_hungry.
      ring   the ellipse that fits the JAW -- `jaw` is (half width, half depth,
             centre y) off the `jaw` box. Set a hair outside it the band stands
             proud at the four face centres and is buried towards the corners
             and inside `jaw_mid`, which is what fastened looks like on a box."""
    r = R(UNIT_FOOTPRINT[unit])
    return {
        "r": r, "h": r * 1.37,              # the cranium's top, for reference
        "mouth_kind": "bar", "mouth_z": r * mouth_z, "mouth_y": r * mouth_y,
        "mouth_span": 0.0, "mouth_tiles": tiles,
        "mouth_tall": r * tall, "mouth_lens": lens,
        "mouth_thick": r * TILE_THICK,
        "mouth_push": r * (TILE_THICK * (0.5 - TILE_SINK) + proud),
        "mouth_w": r * mouth_w,
        "ring_z": r * ring[1], "ring_y": r * jaw[2],
        "ring_rx": r * ring[0], "ring_ry": r * ring[2],
    }


def _machine_seat(unit, joint, joint_yaw, joint_r, plate, plate_yaw, plate_w,
                  plate_h, plate_t):
    """A path B unit. `joint` is a real seam on the machine and `plate` sits on
    a flat flank, both in r. These three chassis were not re-profiled and their
    seats have not moved."""
    r = R(UNIT_FOOTPRINT[unit])
    return {
        "r": r,
        "joint": (joint[0] * r, joint[1] * r, joint[2] * r),
        "joint_yaw": joint_yaw, "joint_r": joint_r * r,
        "plate": (plate[0] * r, plate[1] * r, plate[2] * r),
        "plate_yaw": plate_yaw, "plate_w": plate_w * r,
        "plate_h": plate_h * r, "plate_t": plate_t * r,
    }


def _gel_seat(unit, profile, height_k, body_k, joint_z, joint_yaw, joint_r,
              joint_bite, joint_dy, plate_z, plate_yaw, plate_w, plate_h,
              plate_t):
    """THE CYBERBLUB, and it is the reason this function exists at all. It wears
    the two PATH B marks, but underneath the chrome it is still a blub: its
    chassis is not a chassis, it is the same EGG profile Blub I is stacked from,
    at 0.90 r and 1.88 r tall. So its two seats are found the path A way, with
    `radius_at`, and only then handed to the path B builders -- which is exactly
    what stopped being true when the gel body stopped being a `drop()` and left
    the lichen 0.13 r low and the stone plate floating 0.15 r off the belly."""
    r = R(UNIT_FOOTPRINT[unit])
    rb = r * body_k
    h = r * height_k
    zj = h * joint_z
    zp = h * plate_z
    dj = radius_at(profile, rb, h, zj) - r * joint_bite
    dp = radius_at(profile, rb, h, zp)
    return {
        "r": r, "h": h,
        "joint": (math.cos(joint_yaw) * dj, math.sin(joint_yaw) * dj + r * joint_dy,
                  zj),
        "joint_yaw": joint_yaw, "joint_r": joint_r * r,
        "plate": (math.cos(plate_yaw) * dp, math.sin(plate_yaw) * dp, zp),
        "plate_yaw": plate_yaw, "plate_w": plate_w * r,
        "plate_h": plate_h * r, "plate_t": plate_t * r,
    }


BODIES = {
    # --- path A ---------------------------------------------------------
    # unit_blub1: _stack(EGG, r, r*3.70) + face "happy" at h*0.56, its round
    # mouth a ball at z = h*0.56 - r*0.34. A round mouth gets a round light, so
    # the tile heights fall off hard (lens 0.45) and the band is short.
    "blub1": _round_seat("blub1", EGG, 3.70, 0.56, 0.34,
                         span=1.90, tiles=5, tall=0.46, lens=0.45,
                         ring_k=0.18),
    # unit_blub2: td.ellipsoid(r*1.86, r*1.24, r*1.06) at z r*0.50, + face
    # "brow" at z r*0.54 on a face radius of r*0.88, its slot mouth a box at
    # z - 0.88*0.36 r. Its band is the lowest of the six because this animal is
    # a pancake and its mouth is already at a fifth of its height.
    "blub2": _lens_seat("blub2", (1.86, 1.24, 1.06), (0.0, -0.02, 0.50),
                        face_z=0.54, face_r=0.88, mouth_dz=0.36,
                        span=2.00, tiles=5, tall=0.30, lens=0.35,
                        ring_z=0.46, proud=0.10),
    # unit_blub3: drop(r, r*1.85) -- the last one -- + face "serious", its slot
    # jaw a box r*0.66 wide at h*0.60 - r*0.42. The BODY has not moved and its
    # ring has not moved with it: at 0.24 h the sides of the band still crossed
    # the ends of the lit mouth on screen even though the front cleared it by
    # 4 px, and 0.15 h is where a capture said it stopped. Only the mouth is
    # rebuilt, because 7 px is 7 px whatever the body is doing.
    "blub3": _round_seat("blub3", DROP, 1.85, 0.60, 0.42,
                         span=1.30, tiles=5, tall=0.26, lens=0.35,
                         ring_k=0.15),
    # unit_mini1: _stack(SPIRE, r, r*3.05) at R(10)*0.78, with maw() cut into
    # the wide bottom half at h*0.24 and a real head standing over it. The band
    # is as tall as that gape allows and spans nearly as much of the front,
    # because at 7.8 u.l. of radius this is the smallest mouth in the game.
    #
    # The r*0.78 is not a footprint drift and never was: it is the body radius
    # tower_summoner stacks a Mini at, and the GAMEPLAY footprint is still the
    # full 10 out of UNIT_FOOTPRINT, which is what R() is called with here.
    "mini1": _round_seat("mini1", SPIRE, 3.05, 0.24, 0.0,
                         span=2.60, tiles=7, tall=0.44, lens=0.30,
                         ring_k=0.09, scale=0.78),
    # unit_mini2: _stack(SQUAT, r*1.10, r*0.86) at R(10)*0.78 -- note the 1.10,
    # which is the whole reason its old band vanished -- with maw() at h*0.42
    # under a stone lid. Wide and only 0.86 r tall, so the band goes as low as
    # it can and the mouth takes the rest.
    "mini2": _round_seat("mini2", SQUAT, 0.86, 0.42, 0.0,
                         span=2.60, tiles=7, tall=0.36, lens=0.30,
                         ring_k=0.16, scale=0.78, body_k=1.10, ring_out=1.17),
    # unit_hungry: the `gullet` slab is (r*1.52, r*1.34, r*0.14) centred at
    # y r*0.30, z r*0.82, so its front plane is y r*0.97 and the two rows of
    # teeth stand at r*0.96 and r*0.98 -- the light goes on the slab, BEHIND the
    # teeth, and they draw across it. The ring is the ellipse of the `jaw` box
    # (r*1.90 x r*0.92 at y -r*0.04), a hair outside it.
    "hungry": _wedge_seat("hungry", mouth_y=0.97, mouth_z=0.83, mouth_w=1.34,
                          tiles=5, tall=0.17, lens=0.30, proud=0.03,
                          ring=(1.04, 0.58, 0.58), jaw=(0.95, 0.46, -0.04)),

    # --- path B ---------------------------------------------------------
    # Every joint seat below is a PROBED point on the seam it names, 0.03 ..
    # 0.05 r inside the outer surface, so the crust beds in and only the beads
    # stand out. Seating them on the limb's AXIS -- which is what the body call
    # gives you -- buried the whole patch inside the leg on three of the four.
    #
    # cyber: the -X chrome graft is a BOX 0.30 r deep bolted onto a round body,
    # and the seam is its front lip, not its middle. Seated straight down -X the
    # whole patch lands inside the graft and renders at 4 px -- measured -- so
    # the bearing is carried round to 165 degrees, where the crust straddles the
    # lip with the beads out on open gel, and down to h*0.42, under the graft's
    # bottom corner. Away from the body's own bead at +52 degrees, as the mark
    # requires. The plate is on the +X flank at +15 degrees -- forward of the
    # -45 it started on, which rendered as a plate nobody could see without
    # orbiting behind the unit -- and low enough to sit under the root of the
    # cyan vein. It is the one plate on a curved flank, so it is thicker than
    # the rest or the corners sink.
    "cyber": _gel_seat("cyber", EGG, 1.88, 0.90,
                       joint_z=0.42, joint_yaw=math.radians(165.0),
                       joint_r=0.19, joint_bite=0.03, joint_dy=0.0,
                       plate_z=0.33, plate_yaw=math.radians(15.0),
                       plate_w=0.42, plate_h=0.34, plate_t=0.14),
    # mecha: the hip, where the -X leg tube leaves the chassis underside.
    # Plate on the +X chassis flank, aft of the cannon root and above the
    # body's own lichen bead.
    "mecha": _machine_seat("mecha", (-0.66, 0.0, 0.16), math.pi, 0.20,
                           (0.60, -0.16, 0.68), 0.0, 0.44, 0.40, 0.09),
    # mecha2: the same hip on a hull twice as wide.  Plate on the +X flank,
    # aft of the cannon and clear under the unstable tank.
    "mecha2": _machine_seat("mecha2", (-0.90, 0.0, 0.13), math.pi, 0.23,
                            (0.81, -0.28, 0.42), 0.0, 0.44, 0.36, 0.10),
    # superb: the shoulder, where the -X arm runs out from under the pauldron.
    # Plate on the +X hull flank, under the arm and forward of the bead.
    "superb": _machine_seat("superb", (-0.83, 0.16, 0.99), math.pi, 0.25,
                            (0.58, 0.06, 0.56), 0.0, 0.48, 0.40, 0.10),
}


# ---------------------------------------------------------------------------

def build_mark(unit, tag, fn, flat):
    """Same two nodes as tower_summoner's build_unit, so a mark rides exactly
    what the body rides. Nothing here is world_fixed: a mark is ON the creature
    and turns with it."""
    s = td.Scene(palette(flat))
    root = s.node("root")
    body = s.node("body", parent=root)
    fn(s, body, unit)
    return td.build(s, "blub-mark-%s-%s" % (tag, unit))


def _extent(model):
    pos = model["positions"]
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for i in range(0, len(pos), 3):
        for k in range(3):
            lo[k] = min(lo[k], pos[i + k])
            hi[k] = max(hi[k], pos[i + k])
    return lo, hi


BUDGET = 120                                # a mark is a detail, not a body


def main():
    flat = "--silhouette" in sys.argv
    print("building the blub crosspath marks (%s)"
          % ("SILHOUETTE" if flat else "full"))
    total = 0
    worst = 0
    for units, marks in ((PATH_A, MARKS_A), (PATH_B, MARKS_B)):
        for unit in units:
            for tag, fn in marks:
                model = build_mark(unit, tag, fn, flat)
                td.write_js(model, "blub-mark-%s-%s.js" % (tag, unit))
                lo, hi = _extent(model)
                total += model["triangles"]
                worst = max(worst, model["triangles"])
                flag = "  OVER BUDGET" if model["triangles"] > BUDGET else ""
                print("  blub-mark-%-2s-%-6s %4d tris   box %5.3f x %5.3f x "
                      "%5.3f   at %6.3f %6.3f %6.3f%s"
                      % (tag, unit, model["triangles"], hi[0] - lo[0],
                         hi[1] - lo[1], hi[2] - lo[2],
                         (lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5,
                         (lo[2] + hi[2]) * 0.5, flag))
    print("  %d marks, %d triangles total, worst %d (budget %d)"
          % (len(PATH_A) * 2 + len(PATH_B) * 2, total, worst, BUDGET))
    # THE SEAT TABLE. Every number here was read off the body's own profile at
    # build time, so a re-profiled unit prints a different seat the same minute
    # it is re-profiled. `px` is the mouth band's width at the review's
    # reference viewport -- the measurement revue 1 failed these marks on.
    print("  MARK SEATS -- a mark is drawn OVER an untouched body:")
    print("    %-7s %6s %6s  %s" % ("unit", "r px", "mouth", "seat"))
    for unit in PATH_A:
        b = BODIES[unit]
        px = b["mouth_w"] * PX_PER_UNIT * PX_PER_UL
        tall = b["mouth_tall"] * PX_PER_UNIT * PX_PER_UL
        print("    %-7s %6.1f %6.1f  mouth %-3s z %.3f  %d tiles %4.1f x %4.1f "
              "px | ring z %.3f  %.3f x %.3f"
              % (unit, b["r"] * PX_PER_UNIT, px, b["mouth_kind"],
                 b["mouth_z"], b["mouth_tiles"], px, tall,
                 b["ring_z"], b["ring_rx"], b["ring_ry"]))
    for unit in PATH_B:
        b = BODIES[unit]
        print("    %-7s %6.1f          joint %6.3f %6.3f %6.3f  |  plate "
              "%6.3f %6.3f %6.3f"
              % (unit, b["r"] * PX_PER_UNIT,
                 b["joint"][0], b["joint"][1], b["joint"][2],
                 b["plate"][0], b["plate"][1], b["plate"][2]))


if __name__ == "__main__":
    main()
