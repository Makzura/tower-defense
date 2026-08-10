# ---------------------------------------------------------------------------
# The fused creature -- the five bodies Coagulation produces.
#
#   python tools/blender/summoner_creature.py                 build everything
#   python tools/blender/summoner_creature.py --silhouette    build PASS 1 forms
#
# PASS 1 vs PASS 2, same mechanism as tower_summoner.py. Every solid carries its
# real material name from the start and `--silhouette` swaps the whole palette
# for one flat grey, so the shapes are judged before colour without authoring
# them twice and the two passes cannot drift apart.
#
# THE SCALE CONTRACT. td_mesh emits 31.8032 px per Blender unit and the board
# runs at ~1 px per u.l., so a body's `footprintUl` from js/blub.js IS its ground
# radius in px. R() is the only place that conversion happens; the five numbers
# below come straight from BlubTower.MONSTER_TIERS and are never typed twice.
#
# WHAT THIS THING IS. Not a designed monster -- an AGGLOMERATE. Every blub the
# Summoner had is still in there, half dissolved, and the faces of the ones
# nearest the surface press out through the skin. So the vocabulary is: one dark
# mass, lighter lumps stuck to it, and faces that are only ever the FRONT of a
# head, never a head. Nothing on it is symmetrical on purpose.
#
# TELLING THE FIVE APART WITHOUT READING ANYTHING. Size alone is not a
# silhouette -- at a glance on a busy board the player sees an outline, and two
# outlines that differ only in scale are the same outline. So each tier changes
# the PROFILE, and the change is the thing that carries the tier:
#
#   t0  wider than it is tall            a puddle. no vertical feature at all.
#   t1  taller than it is wide           it stands up, and it spreads an apron.
#   t2  anvil                            two haunches, top-heavy overhang.
#   t3  tripod                           two long arms planted, holes in the
#                                        outline, head sunk between shoulders.
#   t4  mountain under a ring of spires  a broken crown around a wide mound.
#
# From t3 the creature has fused with the tower and the summoner is inside it.
# Nothing human appears on t3 or t4 -- what he was standing on does: the ritual
# stone of his own plinth, half swallowed and still sticking out.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_mesh as td                                          # noqa: E402

PX_PER_UNIT = 20.0 * 1.529 * 1.04          # td_mesh.UNITS_TO_PX


def R(footprint_ul):
    """A body's ground radius, in Blender units."""
    return footprint_ul / PX_PER_UNIT


# --- palettes ---------------------------------------------------------------
# Voie A: mate, poreuse, vert mousse / pierre grise / craie-ocre, emission
# FAIBLE et CHAUDE. Voie B: lisse, chrome et bleu profond translucide, accent
# cyan, emission FORTE et FROIDE. A never emits cold light; B never shows a
# porous surface except on its inherited stone (brief section 3 and 4).
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


# THE VALUE LADDER (brief section 18, clause 7). The largest surface takes the
# darkest value or it pulls the eye off the shape, so the main mass -- which is
# most of the pixels on every one of the five -- is the DARKEST green there is,
# the lumps stuck to it are a step up, and the freshly swallowed blubs that have
# not gone the colour of the rest yet are the lightest thing on the body. Rough
# relative luminance: moss_dark 81, moss 112, stone 121, lichen 153, chalk 210,
# eye 30. That is a 7:1 spread, not the 8% blob the Riflemen failed on.
#
# `stone_dark` is in the palette above and is deliberately NOT used here. It
# lands 1.4% off `moss_dark`, and every stone on this creature is a small piece
# sunk into exactly that colour -- two values that close, touching, is the
# failure clause 7 describes rather than an example of following it. The shards
# are `stone`, and the two fused tiers get one `chalk` chunk each, which is the
# brightest thing on either body and belongs only to them.
MASS = "moss_dark"          # the body itself, and therefore most of the model
LUMP = "moss"               # anything bolted onto it
FRESH = "lichen"            # the most recently absorbed, still pale


# ---------------------------------------------------------------------------
# Shared anatomy.
# ---------------------------------------------------------------------------

def lump(s, name, size, loc, mat, parent, rot=(0, 0, 0), segs=8, rings=4):
    """A blister of gel. Cheap by default -- an 8x4 ellipsoid is 48 triangles
    and there are a lot of these; the faceting is the point at this scale."""
    return td.ellipsoid(s, name, size, loc, mat, parent, rot, segs, rings)


def face_at(s, c, e, yaw, parent, kind):
    """A swallowed blub's face pressing out through the skin.

    `c` is the point on the surface it comes through, `yaw` the direction it
    looks in (measured in the XY plane, +Y is the front of the model) and `e`
    how big the face is. There is deliberately no head behind any of these --
    a face here is a feature of the mass, not an attachment to it, which is
    what stops the creature reading as a body with heads glued on.
    """
    nx, ny = math.cos(yaw), math.sin(yaw)
    tx, ty = -math.sin(yaw), math.cos(yaw)
    # A box rotated by yaw+pi/2 has its long axis along the surface tangent.
    rot = (0, 0, yaw + math.pi / 2)

    def P(u, v, w):
        """u along the tangent, v out of the surface, w up."""
        return (c[0] + tx * u + nx * v, c[1] + ty * u + ny * v, c[2] + w)

    def round_eyes(sep, up, rad):
        for sx in (-1, 1):
            td.ball(s, "eye", e * rad, P(sx * e * sep, e * 0.06, e * up),
                    "eye", parent, 6, 3)

    def box_eyes(sep, up, w, h):
        for sx in (-1, 1):
            td.box(s, "eye", (e * w, e * 0.18, e * h),
                   P(sx * e * sep, e * 0.04, e * up), rot, "eye", parent)

    def box_mouth(w, h, down):
        td.box(s, "mouth", (e * w, e * 0.18, e * h), P(0, e * 0.04, -e * down),
               rot, "dark", parent)

    if kind == "pair":                    # the ordinary blub face, sunk in
        round_eyes(0.40, 0.18, 0.24)
        box_mouth(0.44, 0.18, 0.34)
    elif kind == "wail":                  # mouth open. the loudest one
        round_eyes(0.42, 0.24, 0.22)
        td.ellipsoid(s, "maw", (e * 0.46, e * 0.34, e * 0.52),
                     P(0, e * 0.02, -e * 0.32), "dark", parent, (0, 0, 0), 6, 3)
    elif kind == "slit":                  # squashed flat by whatever is on top
        box_eyes(0.38, 0.14, 0.34, 0.12)
        box_mouth(0.40, 0.12, 0.30)
    elif kind == "one":                   # a single eye, far too big for it
        td.ball(s, "eye", e * 0.36, P(0, e * 0.06, e * 0.14), "eye", parent, 6, 3)
        box_mouth(0.36, 0.14, 0.32)
    elif kind == "eyes":                  # only the eyes cleared the surface
        box_eyes(0.36, 0.10, 0.30, 0.14)
    elif kind == "stray":                 # one eye on its own, nothing else
        td.box(s, "eye", (e * 0.34, e * 0.18, e * 0.26), P(0, e * 0.04, 0),
               rot, "eye", parent)
    elif kind == "grin":                  # a Hungry Blub went in here
        box_eyes(0.38, 0.22, 0.30, 0.12)
        box_mouth(0.62, 0.16, 0.28)
        for i in (-1, 0, 1):
            td.box(s, "tooth", (e * 0.10, e * 0.14, e * 0.18),
                   P(i * e * 0.20, e * 0.08, -e * 0.28), rot, "tooth", parent)


def maw(s, c, e, yaw, parent, teeth, verts=8):
    """A real opening in the mass, with a rim of teeth arched over it. Unlike
    `face_at` this one is a hole rather than a marking, so it survives in pure
    shadow -- which is why only the tiers that bite get one."""
    nx, ny = math.cos(yaw), math.sin(yaw)
    tx, ty = -math.sin(yaw), math.cos(yaw)
    td.frustum(s, "maw", e * 0.78, e * 1.00, e * 0.60,
               (c[0] + nx * e * 0.10, c[1] + ny * e * 0.10, c[2]),
               "dark", parent, verts, (math.pi / 2, 0, yaw + math.pi / 2))
    rot = (0, 0, yaw + math.pi / 2)
    for i in range(teeth):
        f = -1.0 + 2.0 * i / max(1, teeth - 1)
        u = f * e * 0.66
        w = e * (0.40 - 0.22 * f * f)
        td.box(s, "tooth", (e * 0.18, e * 0.16, e * 0.34),
               (c[0] + tx * u + nx * e * 0.30, c[1] + ty * u + ny * e * 0.30,
                c[2] + w), rot, "tooth", parent)


def stone_shard(s, size, loc, rot, parent, mat="stone"):
    """A piece of the ritual plinth, swallowed and still sticking out."""
    td.box(s, "shard", size, loc, rot, mat, parent)


def glow_node(s, r, loc, parent):
    """A warm bead in a seam. Voie A: faible et chaude, never cold."""
    td.ball(s, "node", r, loc, "warm_glow", parent, 5, 3)


# ---------------------------------------------------------------------------
# The five bodies. Radii come straight from js/blub.js MONSTER_TIERS[].
# Everything below is written in multiples of r and every coordinate is a real
# position on the finished model -- td_mesh authors in world space.
# ---------------------------------------------------------------------------

FOOTPRINT = {0: 25, 1: 30, 2: 35, 3: 50, 4: 100}


def tier0(s, b, flat):
    """Footprint 25. A slumped puddle: WIDER THAN IT IS TALL, and that is the
    whole joke. It is two and a half times the ground of an ordinary blub and
    barely a third taller, so the player who just spent a 300 second cooldown
    gets a lump on the floor. No limb, no spike, no vertical feature at all --
    every other tier has one, so this is the only outline in the family that
    reads as an accident."""
    r = R(FOOTPRINT[0])
    td.frustum(s, "spread", r * 1.00, r * 0.92, r * 0.16, (0, 0, r * 0.08),
               MASS, b, 14)
    lump(s, "mass", (r * 1.86, r * 1.70, r * 1.24), (0, -r * 0.04, r * 0.66),
         MASS, b, segs=12, rings=5)
    lump(s, "swell_a", (r * 0.86, r * 0.76, r * 0.68), (r * 0.44, r * 0.26, r * 0.90),
         LUMP, b)
    lump(s, "swell_b", (r * 0.72, r * 0.66, r * 0.58), (-r * 0.52, -r * 0.22, r * 0.84),
         LUMP, b)
    lump(s, "swell_c", (r * 0.54, r * 0.50, r * 0.46), (-r * 0.34, r * 0.44, r * 0.34),
         FRESH, b, segs=6, rings=4)
    # it has already run downhill on one side, which is what stops the outline
    # being a circle
    lump(s, "ooze", (r * 1.14, r * 0.84, r * 0.30), (r * 0.20, r * 0.58, r * 0.18),
         LUMP, b)
    lump(s, "ooze_b", (r * 0.66, r * 0.52, r * 0.22), (-r * 0.62, r * 0.28, r * 0.14),
         MASS, b, segs=6, rings=3)
    stone_shard(s, (r * 0.32, r * 0.24, r * 0.16), (-r * 0.28, -r * 0.54, r * 0.42),
                (0.22, 0, 0.62), b)
    face_at(s, (r * 0.02, r * 0.74, r * 0.66), r * 0.46, math.pi / 2, b, "pair")
    face_at(s, (r * 0.62, r * 0.42, r * 0.96), r * 0.30, 0.62, b, "eyes")
    face_at(s, (-r * 0.42, -r * 0.60, r * 0.64), r * 0.28, -2.20, b, "stray")


def tier1(s, b, flat):
    """Footprint 30. It stands up: TALLER THAN IT IS WIDE, which is the single
    read that separates it from t0 at any distance. Two shoulder buds start out
    of it -- the first thing on this creature that could be called a limb -- and
    it spreads an APRON of gel at ground level, which is its first zone of
    effect made visible instead of drawn as a ring."""
    r = R(FOOTPRINT[1])
    # The apron has to be a LIP, not a fillet: it starts at the full footprint
    # and the body above it is barely two thirds that, so the spread reads as a
    # separate thing the creature is standing in rather than as its own foot.
    td.frustum(s, "apron", r * 1.00, r * 0.72, r * 0.20, (0, 0, r * 0.10),
               MASS, b, 16)
    td.frustum(s, "foot", r * 0.70, r * 0.86, r * 0.42, (0, 0, r * 0.41), MASS, b, 12)
    td.frustum(s, "belly", r * 0.86, r * 0.80, r * 0.70, (0, 0, r * 0.97), MASS, b, 12)
    td.frustum(s, "chest", r * 0.80, r * 0.60, r * 0.78, (0, 0, r * 1.71), MASS, b, 12)
    td.frustum(s, "crown", r * 0.60, r * 0.14, r * 0.62, (0, 0, r * 2.41), LUMP, b, 12)
    for sx in (-1, 1):
        lump(s, "bud", (r * 0.58, r * 0.54, r * 0.62),
             (sx * r * 0.58, -r * 0.04, r * (1.90 + sx * 0.12)), LUMP, b)
    lump(s, "hump", (r * 0.66, r * 0.58, r * 0.60), (r * 0.06, -r * 0.60, r * 1.24),
         LUMP, b, segs=6, rings=4)
    lump(s, "fresh", (r * 0.46, r * 0.42, r * 0.42), (-r * 0.64, r * 0.28, r * 0.82),
         FRESH, b, segs=6, rings=3)
    stone_shard(s, (r * 0.46, r * 0.20, r * 0.44), (r * 0.30, -r * 0.58, r * 0.70),
                (0.30, 0, -0.40), b)
    stone_shard(s, (r * 0.26, r * 0.14, r * 0.24), (-r * 0.46, -r * 0.42, r * 1.48),
                (0, 0.30, 0.50), b, "stone")
    face_at(s, (0, r * 0.70, r * 1.55), r * 0.52, math.pi / 2, b, "wail")
    face_at(s, (-r * 0.80, r * 0.14, r * 1.92), r * 0.30, 2.70, b, "pair")
    face_at(s, (r * 0.48, r * 0.62, r * 0.84), r * 0.28, 0.90, b, "eyes")
    face_at(s, (r * 0.06, r * 0.26, r * 2.44), r * 0.24, 1.30, b, "stray")


def tier2(s, b, flat):
    """Footprint 35. An ANVIL: two heavy haunches under a mass that overhangs
    them, so the outline goes narrow-wide-narrow instead of tapering like t1.
    It is crouched because it leaps, and the back is a ridge of half-digested
    lumps. First tier with a real opening in it -- a maw that is a hole in the
    silhouette rather than a mark on the skin."""
    r = R(FOOTPRINT[2])
    for sx in (-1, 1):
        # Pushed apart and the belly lifted clear of the board, so there is a
        # NOTCH of daylight under the middle. That gap is what stops the outline
        # from closing into the same single mass t1 already is.
        lump(s, "haunch", (r * 0.80, r * 1.16, r * 1.02),
             (sx * r * 0.60, -r * 0.02, r * 0.51), MASS, b, segs=8, rings=5)
        # A ball resting on the board touches it at a POINT, which left this
        # tier standing on two pinpricks and a ground radius of 18 px against a
        # footprint of 35. The pads are what make the stance real.
        td.frustum(s, "pad", r * 0.40, r * 0.36, r * 0.18,
                   (sx * r * 0.60, -r * 0.02, r * 0.09), MASS, b, 10)
    lump(s, "gut", (r * 1.44, r * 1.24, r * 1.06), (0, r * 0.06, r * 0.88),
         MASS, b, segs=10, rings=5)
    td.frustum(s, "torso", r * 0.84, r * 1.06, r * 0.62, (0, 0, r * 1.44), MASS, b, 12)
    lump(s, "shoulders", (r * 1.94, r * 1.32, r * 0.90), (0, -r * 0.04, r * 1.98),
         MASS, b, segs=10, rings=5)
    lump(s, "ridge_a", (r * 0.60, r * 0.52, r * 0.56), (-r * 0.30, -r * 0.66, r * 1.62),
         LUMP, b, segs=6, rings=4)
    lump(s, "ridge_b", (r * 0.56, r * 0.50, r * 0.52), (r * 0.36, -r * 0.70, r * 1.28),
         LUMP, b, segs=6, rings=4)
    lump(s, "brow", (r * 0.86, r * 0.80, r * 0.76), (-r * 0.32, r * 0.14, r * 2.44),
         LUMP, b)
    lump(s, "fresh", (r * 0.64, r * 0.60, r * 0.56), (r * 0.44, -r * 0.06, r * 2.38),
         FRESH, b)
    maw(s, (0, r * 0.56, r * 1.82), r * 0.42, math.pi / 2, b, 5)
    glow_node(s, r * 0.16, (-r * 0.56, r * 0.44, r * 1.20), b)
    stone_shard(s, (r * 0.50, r * 0.20, r * 0.46), (r * 0.56, -r * 0.36, r * 1.06),
                (0.20, 0.36, 0.30), b)
    stone_shard(s, (r * 0.30, r * 0.16, r * 0.28), (-r * 0.62, -r * 0.30, r * 0.44),
                (0, 0.24, -0.50), b, "stone")
    face_at(s, (0, r * 0.66, r * 0.86), r * 0.50, math.pi / 2, b, "wail")
    face_at(s, (r * 0.90, r * 0.24, r * 0.62), r * 0.32, 0.36, b, "slit")
    face_at(s, (-r * 0.34, -r * 0.86, r * 1.66), r * 0.28, -1.80, b, "eyes")
    face_at(s, (r * 0.52, r * 0.24, r * 2.60), r * 0.26, 1.10, b, "stray")


def tier3(s, b, flat):
    """Footprint 50. A TRIPOD: two long arms planted on the ground either side
    of the trunk, so the outline has two holes punched through it -- no other
    tier does, and holes read further away than bumps. The head is sunk between
    the shoulders with no neck at all, and it is ringed with eyes.

    The creature has fused with the tower here. The ritual stone of the plinth
    it swallowed is still coming out of it, in bigger pieces than anywhere
    else on the family, and the seams have started to glow."""
    r = R(FOOTPRINT[3])
    # THE TRUNK IS NARROW ON PURPOSE. The first version had a 1.90r chest over a
    # 1.00r waist with the arms tucked at 0.80r, and the arms did not appear in
    # the outline AT ALL -- the whole tripod read was invisible, which is the
    # failure the brief's acceptance test is looking for. The body is now a
    # column half that width, the arms bow outside it, and the daylight between
    # them is the tier.
    td.frustum(s, "base", r * 0.54, r * 0.46, r * 0.20, (0, 0, r * 0.10), MASS, b, 12)
    td.frustum(s, "waist", r * 0.46, r * 0.42, r * 0.90, (0, 0, r * 0.65), MASS, b, 12)
    td.frustum(s, "ribs", r * 0.42, r * 0.86, r * 0.50, (0, 0, r * 1.35), MASS, b, 12)
    lump(s, "chest", (r * 1.62, r * 1.36, r * 1.06), (0, r * 0.02, r * 1.86),
         MASS, b, segs=10, rings=5)
    lump(s, "hump", (r * 1.16, r * 1.00, r * 0.70), (0, -r * 0.24, r * 2.34),
         LUMP, b)
    lump(s, "skull", (r * 1.00, r * 0.92, r * 0.88), (0, r * 0.16, r * 2.48),
         LUMP, b, segs=10, rings=5)
    # The arms carry the FOOTPRINT: the fists are what reaches 50 px, not the
    # foot. A ground radius is a promise about where the body touches the board,
    # so the knuckles land exactly on it and the elbows are the only overhang.
    for sx in (-1, 1):
        td.tube(s, "upper_arm", r * 0.24, (sx * r * 0.68, -r * 0.06, r * 2.12),
                (sx * r * 0.94, r * 0.24, r * 1.10), MASS, b, 6)
        td.tube(s, "fore_arm", r * 0.20, (sx * r * 0.94, r * 0.22, r * 1.16),
                (sx * r * 0.72, r * 0.10, r * 0.26), MASS, b, 6)
        lump(s, "fist", (r * 0.48, r * 0.52, r * 0.48),
             (sx * r * 0.72, r * 0.10, r * 0.25), LUMP, b, segs=6, rings=4)
        # The knuckle it actually rests on -- same reason as t2's pads. Its
        # centre sits 0.72r from the tile centre and it is 0.26r across, which
        # is what puts the contact ON 50 px: a footprint is a RADIUS from the
        # origin, and a hand carried forward as well as out reaches further
        # than its x offset alone says it does.
        td.frustum(s, "knuckle", r * 0.26, r * 0.24, r * 0.16,
                   (sx * r * 0.72, r * 0.10, r * 0.08), LUMP, b, 6)
    lump(s, "fresh", (r * 0.52, r * 0.48, r * 0.46), (-r * 0.70, r * 0.36, r * 1.52),
         FRESH, b, segs=6, rings=3)
    # Both of these used to sit in the band the arms open up, and a stone slab
    # in the gap plugs the hole the whole tier is built around -- one side read
    # as a tripod and the other as a blob. They live on the back now.
    stone_shard(s, (r * 0.62, r * 0.24, r * 0.90), (r * 0.34, -r * 0.60, r * 1.90),
                (0.26, 0.34, 0.40), b)
    stone_shard(s, (r * 0.52, r * 0.22, r * 0.70), (-r * 0.30, -r * 0.44, r * 0.86),
                (-0.20, 0.40, -0.30), b, "stone")
    stone_shard(s, (r * 0.40, r * 0.18, r * 0.52), (r * 0.18, -r * 0.62, r * 2.06),
                (0.44, 0, 0.24), b)
    stone_shard(s, (r * 0.34, r * 0.16, r * 0.40), (-r * 0.24, r * 0.48, r * 0.44),
                (0.30, 0.20, -0.60), b, "chalk")
    for pos in ((-r * 0.34, r * 0.42, r * 1.20), (r * 0.42, r * 0.46, r * 2.02),
                (r * 0.08, -r * 0.68, r * 1.46)):
        glow_node(s, r * 0.13, pos, b)
    # too many eyes, and one of them owns the front of the skull
    face_at(s, (0, r * 0.56, r * 2.40), r * 0.44, math.pi / 2, b, "one")
    skull_c, skull_r = (0, r * 0.16, r * 2.48), (r * 0.50, r * 0.46, r * 0.44)
    for a, lat in ((2.30, 0.35), (0.85, 0.30), (1.55, 0.80), (-1.10, 0.25)):
        cl = math.cos(lat)
        face_at(s, (skull_c[0] + skull_r[0] * cl * math.cos(a),
                    skull_c[1] + skull_r[1] * cl * math.sin(a),
                    skull_c[2] + skull_r[2] * math.sin(lat)),
                r * 0.20, a, b, "stray")
    face_at(s, (0, r * 0.64, r * 1.78), r * 0.58, math.pi / 2, b, "wail")
    face_at(s, (-r * 0.74, r * 0.30, r * 1.86), r * 0.34, 2.60, b, "slit")
    face_at(s, (-r * 0.28, -r * 0.72, r * 2.34), r * 0.30, -1.90, b, "eyes")


def tier4(s, b, flat):
    """Footprint 100. A MOUNTAIN under a broken ring of spires. The mound is
    wider than it is tall and the spires stand off its flank, so the outline is
    a jagged crown around a hill -- a shape nothing else on the board has, and
    the only tier whose profile is not a single closed blob.

    Nothing human on it either; the plinth stone is still there and the seams
    are lit all the way round."""
    r = R(FOOTPRINT[4])
    td.frustum(s, "skirt", r * 1.00, r * 0.94, r * 0.14, (0, 0, r * 0.07), MASS, b, 14)
    td.frustum(s, "mound_low", r * 0.94, r * 0.88, r * 0.38, (0, 0, r * 0.33), MASS, b, 12)
    td.frustum(s, "mound_mid", r * 0.88, r * 0.68, r * 0.44, (0, 0, r * 0.74), MASS, b, 12)
    td.frustum(s, "mound_up", r * 0.68, r * 0.40, r * 0.36, (0, 0, r * 1.14), MASS, b, 12)
    lump(s, "crown_a", (r * 0.72, r * 0.66, r * 0.60), (-r * 0.16, r * 0.10, r * 1.44),
         LUMP, b)
    lump(s, "crown_b", (r * 0.54, r * 0.50, r * 0.48), (r * 0.28, -r * 0.14, r * 1.40),
         LUMP, b)
    lump(s, "crown_c", (r * 0.40, r * 0.38, r * 0.36), (r * 0.02, r * 0.32, r * 1.52),
         FRESH, b, segs=6, rings=3)
    # the ring. Six, unevenly leaned, three of them ending in a swollen head --
    # an even ring of six identical spikes would read as a designed crown, and
    # this thing was not designed by anybody.
    lean = (0.00, 0.10, -0.14, 0.06, -0.08, 0.16)
    rise = (1.58, 1.34, 1.66, 1.22, 1.48, 1.30)
    for i in range(6):
        a = math.tau * i / 6.0 + 0.35 + lean[i]
        base = (math.cos(a) * r * 0.62, math.sin(a) * r * 0.62, r * 0.62)
        tip = (math.cos(a) * r * 0.84, math.sin(a) * r * 0.84, r * rise[i])
        td.tube(s, "spire", r * 0.10, base, tip, LUMP, b, 6)
        if i % 2 == 0:
            td.ball(s, "spire_head", r * 0.15, tip, FRESH if i == 2 else LUMP,
                    b, 5, 3)
    maw(s, (0, r * 0.62, r * 0.62), r * 0.44, math.pi / 2, b, 4, verts=8)
    for pos, rad in (((-r * 0.62, r * 0.40, r * 0.52), 0.11),
                     ((r * 0.56, r * 0.34, r * 0.78), 0.10),
                     ((r * 0.10, -r * 0.66, r * 0.60), 0.11)):
        glow_node(s, r * rad, pos, b)
    stone_shard(s, (r * 0.46, r * 0.18, r * 0.62), (r * 0.60, -r * 0.44, r * 0.60),
                (0.24, 0.30, 0.36), b)
    stone_shard(s, (r * 0.34, r * 0.16, r * 0.44), (-r * 0.54, -r * 0.52, r * 0.44),
                (-0.18, 0.34, -0.28), b, "chalk")
    face_at(s, (-r * 0.40, r * 0.72, r * 0.40), r * 0.36, 1.90, b, "wail")
    face_at(s, (r * 0.50, r * 0.56, r * 0.86), r * 0.30, 0.80, b, "pair")
    face_at(s, (-r * 0.80, r * 0.12, r * 0.52), r * 0.28, 2.90, b, "slit")
    face_at(s, (r * 0.20, -r * 0.72, r * 0.58), r * 0.26, -1.30, b, "eyes")
    face_at(s, (r * 0.34, r * 0.06, r * 1.52), r * 0.24, 0.40, b, "one")
    face_at(s, (-r * 0.28, r * 0.36, r * 1.66), r * 0.20, 1.60, b, "stray")
    face_at(s, (r * 0.62, -r * 0.30, r * 0.34), r * 0.20, -0.60, b, "stray")


TIERS = [tier0, tier1, tier2, tier3, tier4]


def build_tier(tier, fn, flat):
    s = td.Scene(palette(flat))
    root = s.node("root")
    body = s.node("body", parent=root)
    fn(s, body, flat)
    return td.build(s, "blub-monster-t%d" % tier)


def height_of(model):
    """Top of the mesh, in pixels -- the number that says whether the five
    escalate. Positions are flat triples of x, y, z."""
    p = model["positions"]
    return max(p[i] for i in range(2, len(p), 3)) * PX_PER_UNIT


def main():
    flat = "--silhouette" in sys.argv
    print("building the fused creature (%s)" % ("SILHOUETTE" if flat else "full"))
    total = 0
    for tier, fn in enumerate(TIERS):
        model = build_tier(tier, fn, flat)
        td.write_js(model, "blub-monster-t%d.js" % tier)
        total += model["triangles"]
        print("  blub-monster-t%d  %4d tris   ground radius %5.1f px   "
              "height %5.1f px" % (tier, model["triangles"],
                                   R(FOOTPRINT[tier]) * PX_PER_UNIT,
                                   height_of(model)))
    print("  %d bodies, %d triangles total" % (len(TIERS), total))


if __name__ == "__main__":
    main()
