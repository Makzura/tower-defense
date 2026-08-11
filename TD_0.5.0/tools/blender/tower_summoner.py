# ---------------------------------------------------------------------------
# The Summoner (tower_blub), its ten blubs and the five tiers of the fused
# creature. See the owner's brief; the mechanics are already in js/blub.js and
# nothing here changes them.
#
#   python tools/blender/tower_summoner.py                 build everything
#   python tools/blender/tower_summoner.py --silhouette    build PASS 1 forms
#
# PASS 1 vs PASS 2. The brief (section 18) requires silhouettes to be judged
# before colour. Rather than author the forms twice, every solid is given its
# real material name from the start and `--silhouette` swaps the whole palette
# for one flat grey. So pass 1 reviews shape alone, pass 2 is a palette change
# and not a rebuild, and the two passes cannot drift apart.
#
# THE SCALE CONTRACT. td_mesh emits 31.8032 px per Blender unit, and the board
# runs at ~1 px per u.l., so a unit's `footprintUl` from js/blub.js IS its
# ground radius in px. Every radius below is derived from that table by R(),
# never typed in twice -- the brief's section 7 radii and the simulation's
# footprints are the same numbers and must stay that way.
#
# THE GAG THE WHOLE B PATH RESTS ON: the bigger the machine, the smaller and
# more frightened the blub inside it. FACE_SCALE encodes exactly that, and it
# only ever goes down.
#
# ---------------------------------------------------------------------------
# THE ATTACK ANIMATION, added in this pass. Read this before touching a pose.
#
# HP IS AMMUNITION, so an attack is not an event -- it is the unit's entire
# life, played a few dozen times and watched for as long as the body stands. It
# therefore has to survive being seen hundreds of times, which rules out a
# linear tween and rules out a motion that outlasts the interval that triggers
# it. Both of those are structural here rather than a matter of taste:
#
# 1. THE ANIMATION IS THE COOLDOWN. It is not a clip fired off at the shot and
#    left to run; it is a loop parameterised by the blub's own reload phase.
#    gl-world reads `1 - cooldown / (1 / attacksPerSecond())` and indexes
#    straight into the strip, so the cycle occupies the interval EXACTLY, at
#    whatever rate the unit is actually firing at. It cannot overrun, because
#    there is no clock of its own to overrun with. That matters more here than
#    anywhere else in the game: `attacksPerSecond()` carries the swarm bonus, so
#    a Mini Blub's 0.333 s becomes 0.238 s with a full fleet around it, and any
#    animation authored in seconds would be 40 % too long the moment the tower
#    is played well. See the block above `attack_cycle` for the exact mapping,
#    and CHANGELOG for the runtime side.
#
# 2. THE SHOT IS THE DISCONTINUITY. Phase 0 is the instant the gob left, so the
#    cycle runs RELEASE -> follow-through -> settle -> wind-up, and the wind-up
#    at phase 1 snaps into the release at phase 0. That is where anticipation
#    has to live: there is no room before the first shot, and a cycle that
#    eases smoothly across its own seam has no accent in it at all. Every unit
#    below overshoots past neutral on the rebound and coils past neutral on the
#    intake -- neither extreme is the rest pose, which is what stops it reading
#    as a metronome.
#
# 3. FRAME 0 IS REST, AND REST IS IDENTITY. Every animated empty sits at its
#    pivot with zero rotation on frame 0, so frame 0 is the model that revue 1
#    measured, vertex for vertex -- `check_rest_pose()` fails the build if it is
#    not. The three profiles, the maw on the head's curve, the footprints and
#    the >= 0.85 shape-IoU family are all properties of frame 0 and none of them
#    can move by adding a pose. js/blub.js holds `cooldown` at exactly zero
#    while a blub has nothing to shoot, so an idle blub shows frame 0 and only
#    a firing one animates.
#
# 4. RIGID GROUPS ONLY. td_mesh emits one 4x4 per group per frame and a 4x4
#    from `trs()` has no scale in it, so nothing here can squash or inflate by
#    scaling. The Hungry Blub's "il se gonfle" is therefore a PISTON: its
#    stomach cap is sunk inside the sac at rest and rides out of it on the
#    intake, which grows the outline for real instead of pretending to.
#
# Eight frames per cycle, sampled uniformly, with the EASING IN THE KEY STOPS --
# the same trick tower_warbringer.py uses. A release that owns 12 % of the
# cycle and a settle that owns 40 % are two key positions, not two frame counts,
# so the strip stays uniform and one runtime rule drives all ten units.
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


# ---------------------------------------------------------------------------
# Shared blub anatomy.
#
# A blub is a GELATINOUS DROP: wide and heavy at the base, narrowing to a
# rounded top, never a sphere.
#
# THREE PROPORTIONS, NOT ONE -- and this is the whole point of the file.
# Revue 1 measured FIVE of the ten units (mini2, blub1, blub2, hungry, cyber)
# sharing a single circular outline at >= 0.85 shape IoU, and said in as many
# words that fixing the pairs one at a time would only move the confusion. It
# also gave the reason no detail pass can work: at true game scale mini1 is
# 10 x 13 px, so an appendage is one or two pixels and is simply not there in
# pure shadow. The separation therefore has to be the ANIMAL, not a bump on it:
#
#   TALL   narrow footprint, tall in Z ....... blub1, mini1, cyber
#   LOW    wide footprint, flattened in Z .... blub2, mini2, hungry
#   RIG    machine outlines, already passing . blub3, mecha, mecha2, superb
#
# Proportion is what survives at 10 px. Contour is what survives when a review
# normalises the size away, so within each proportion the outline differs in
# KIND as well: a smooth egg (blub1) against a spire (mini1) against a masted
# drop (cyber); a crested carapace (blub2) against a flat slab lid (mini2)
# against a sprawl with daylight under it (hungry). Two units on the same
# footprint -- hungry and cyber, both 25 -- have nothing BUT this to tell them
# apart, so one sprawls and one stands: measured at true game scale they come
# out 36 x 32 px and 35 x 37 px, from 34 x 31 and 33 x 29 when they were twins.
#
# THE FOOTPRINTS THEMSELVES NEVER MOVE. They are gameplay (js/blub.js
# UNITS[].footprintUl) and every radius below still comes from R().
# ---------------------------------------------------------------------------

# A profile is DATA -- (lower, upper, share of height), bottom to top, in units
# of r -- so that two silhouettes can be compared by reading two lists instead
# of by counting hand-placed solids.
# EGG stays broad to 88% of its height on purpose. A profile that tapers to a
# needle puts almost no AREA up high, and "blub1 is 92% contained in blub2" is
# an area measurement -- a tall unit only escapes a wide one if there is
# something of it up there to escape with.
EGG = [(0.42, 0.82, 0.13), (0.82, 0.96, 0.17), (0.96, 0.95, 0.22),
       (0.95, 0.86, 0.20), (0.86, 0.66, 0.16), (0.66, 0.22, 0.12)]
SPIRE = [(0.84, 0.88, 0.18), (0.88, 0.70, 0.26), (0.70, 0.44, 0.28),
         (0.44, 0.08, 0.28)]
SQUAT = [(0.88, 1.10, 0.34), (1.10, 1.16, 0.36), (1.16, 0.94, 0.30)]


def _stack(s, name, cx, cy, r, height, rings, mat, parent, segs=12, z0=0.0):
    """Build one of the profiles above as a run of frusta, bottom to top."""
    z = z0
    for i, (lo, hi, share) in enumerate(rings):
        seg = height * share
        td.frustum(s, "%s%d" % (name, i), r * lo, r * hi, seg,
                   (cx, cy, z + seg * 0.5), mat, parent, segs)
        z += seg
    return z - z0


def radius_at(rings, r, height, z):
    """The profile's radius at a height -- so a mouth can be laid ON the head
    instead of guessed at and left floating in front of it."""
    t = 0.0
    for lo, hi, share in rings:
        if z <= (t + share) * height:
            k = min(1.0, max(0.0, (z / height - t) / share))
            return r * (lo + (hi - lo) * k)
        t += share
    return r * rings[-1][1]


def maw(s, cx, cy, z, r_head, gape, parent, span=2.10, tiles=6, teeth=5):
    """THE MOUTH -- a feature OF a head, never a hole through one.

    The owner reported this twice: "the mini blub and hungry blub are
    unreadable because they're open from behind". The old jaws were two wide
    plates flared apart with a dark ellipsoid pushed between them, and the
    ellipsoid was WIDER than the plates -- so from every angle the outline was
    an open clamshell with a dark blob in it and there was no head above the
    gape. Adding the cavity closed the see-through hole and left the cause
    alone, which is why the second report said the same thing as the first.

    So the mouth is laid ON the head's own curve: a band of dark tiles at
    `r_head`, spanning `span` radians of the front and `gape` tall. It cannot
    widen the silhouette because it never leaves the surface; it cannot be seen
    through because there is solid head behind it; and the head closes over the
    top of it. The shape reads as a head first and the mouth as the dark in it.
    """
    step = span / tiles
    w = 2.0 * r_head * math.sin(step * 0.5) * 1.32
    for i in range(tiles):
        a = math.pi * 0.5 + span * (-0.5 + (i + 0.5) / tiles)
        td.box(s, "maw", (w, r_head * 0.18, gape),
               (cx + math.cos(a) * r_head * 0.95,
                cy + math.sin(a) * r_head * 0.95, z),
               (0, 0, a + math.pi * 0.5), "dark", parent)
    for i in range(teeth):
        a = math.pi * 0.5 + span * 0.84 * (-0.5 + (i + 0.5) / teeth)
        for sz in (1, -1):
            td.box(s, "tooth", (w * 0.34, r_head * 0.18, gape * 0.40),
                   (cx + math.cos(a) * r_head * 1.00,
                    cy + math.sin(a) * r_head * 1.00, z + sz * gape * 0.30),
                   (0, 0, a + math.pi * 0.5), "tooth", parent)


def drop(s, name, cx, cy, r, height, mat, parent, squash=1.0, segs=12):
    """The classic drop, and now BLUB III'S ALONE. It used to be every A-path
    body, which is exactly how five units ended up sharing one outline; the
    others are built from the profiles above. It stays because blub3 passed
    revue 1 on this shape and there is no reason to move a unit that passed.

    `squash` is the live HP deflation hook -- 1.0 is full and taut, lower is
    slumped and wider, which the runtime drives per instance."""
    h = height * squash
    wide = r * (1.0 + (1.0 - squash) * 0.35)
    # Four stacked frusta rather than a ball: a NARROW foot, a heavy low belly,
    # a shoulder and a domed top. Revue 1 failed on this shape -- at 0.86r the
    # foot was as wide as the belly and every small unit read as a pebble
    # instead of a drop, which is what made mini1, mini2 and blub1
    # interchangeable. The waist is what makes it gelatinous.
    td.frustum(s, name + "_foot", wide * 0.62, wide * 0.94, h * 0.18,
               (cx, cy, h * 0.09), mat, parent, segs)
    td.frustum(s, name + "_belly", wide * 0.94, wide, h * 0.26,
               (cx, cy, h * 0.31), mat, parent, segs)
    td.frustum(s, name + "_waist", wide, wide * 0.74, h * 0.30,
               (cx, cy, h * 0.59), mat, parent, segs)
    td.frustum(s, name + "_dome", wide * 0.74, wide * 0.14, h * 0.26,
               (cx, cy, h * 0.87), mat, parent, segs)
    return h


def face(s, cx, cy, z, r, parent, kind, flat, scale=1.0, front=0.80):
    """Every blub has a face, and it is the unit's whole personality. `scale`
    is the B-path gag: the machine grows and the face inside it shrinks.
    `front` is how far out the body's own surface is at this height -- a body
    that is no longer a sphere needs to be told, or the eyes sink into it."""
    e = r * 0.20 * scale
    fy = cy + r * front                     # on the front of the body
    if kind == "happy":                     # Blub I: deux points, bouche ronde
        for sx in (-1, 1):
            td.ball(s, "eye", e * 0.55, (cx + sx * r * 0.34, fy, z), "eye", parent, 8, 5)
        td.ball(s, "mouth", e * 0.85, (cx, fy * 0.99, z - r * 0.34), "dark", parent, 8, 5)
    elif kind == "brow":                    # Blub II: sourcils, il se croit costaud
        for sx in (-1, 1):
            td.ball(s, "eye", e * 0.55, (cx + sx * r * 0.34, fy, z), "eye", parent, 8, 5)
            td.box(s, "brow", (r * 0.34, e * 0.3, e * 0.34),
                   (cx + sx * r * 0.34, fy, z + e * 0.75), (0, 0, sx * 0.30),
                   "dark", parent)
        td.box(s, "mouth", (r * 0.44, e * 0.3, e * 0.30), (cx, fy, z - r * 0.36),
               (0, 0, 0), "dark", parent)
    elif kind == "serious":                 # Blub III: yeux fendus, machoire
        for sx in (-1, 1):
            td.box(s, "eye", (r * 0.30, e * 0.3, e * 0.34),
                   (cx + sx * r * 0.32, fy, z), (0, 0, sx * 0.22), "eye", parent)
        td.box(s, "jaw", (r * 0.66, e * 0.4, e * 0.44), (cx, fy * 0.98, z - r * 0.42),
               (0, 0, 0), "dark", parent)
    elif kind == "one_eye":                 # Mini I: un oeil, presque que la bouche
        # The maw that used to live here is gone: the mouth is now `maw()`, laid
        # on the body's own surface by whoever owns the body. A face must not
        # also be a hole -- that was the bug.
        td.ball(s, "eye", e * 1.30, (cx, fy, z), "eye", parent, 8, 5)
        td.box(s, "lid", (r * 0.50, e * 0.5, e * 0.34), (cx, fy, z + e * 0.72),
               (0, 0, 0), "moss_dark", parent)
    elif kind == "two_eye":                 # Mini II: deux yeux, toujours frenetique
        for sx in (-1, 1):
            td.ball(s, "eye", e * 0.90, (cx + sx * r * 0.34, fy, z), "eye", parent, 8, 5)
    elif kind == "teeth":                   # Hungry: yeux minuscules, dents partout
        for sx in (-1, 1):
            td.ball(s, "eye", e * 0.34, (cx + sx * r * 0.26, fy, z + r * 0.44), "eye", parent, 6, 4)
    elif kind == "visor_up":                # Cyberblub: visage entier, visiere relevee
        for sx in (-1, 1):
            td.ball(s, "eye", e * 0.55, (cx + sx * r * 0.28, fy, z), "eye", parent, 8, 5)
        td.box(s, "mouth", (r * 0.40, e * 0.3, e * 0.26), (cx, fy, z - r * 0.30),
               (0, 0, 0), "dark", parent)
    elif kind == "visor_down":              # Mechablub: visiere baissee, yeux derriere
        for sx in (-1, 1):
            td.ball(s, "eye", e * 0.42, (cx + sx * r * 0.20, fy, z), "eye", parent, 6, 4)
    elif kind == "slit":                    # MK2: une simple fente lumineuse
        td.box(s, "slit", (r * 0.50, e * 0.24, e * 0.22), (cx, fy, z),
               (0, 0, 0), "cyan" if not flat else "cyan", parent)
    elif kind == "tiny_scared":             # SuperBlub: un tout petit visage inquiet
        for sx in (-1, 1):
            td.ball(s, "eye", e * 0.34, (cx + sx * r * 0.13, fy, z + e * 0.2), "eye", parent, 6, 4)
        td.ball(s, "mouth", e * 0.26, (cx, fy, z - e * 0.5), "dark", parent, 6, 4)


# `teeth_ring` used to live here: a crown of teeth standing PROUD of the body
# on a radius of its own. Revue 1 measured what that is worth at true scale --
# "la couronne dentelee et les pattes ne font qu'une frange de 1 px" -- and the
# same crown is what made the gape read as a separate open thing rather than as
# part of a head. Teeth now belong to `maw()`, on the head's own surface.


# ---------------------------------------------------------------------------
# The ten units. Radii come straight from js/blub.js UNITS[].footprintUl.
# ---------------------------------------------------------------------------

FACE_SCALE = {                 # the gag, and it only goes down
    "cyber": 1.00, "mecha": 0.62, "mecha2": 0.38, "superb": 0.20
}


def unit_blub1(s, body, flat):
    # TALL. Bete et content, and utterly smooth: no crust, no mast, no
    # appendage. Its lack of appendages is its silhouette -- which only works if
    # the body itself is a shape, so it now stands 3.10 radii high on a base
    # only 1.9 radii across. That, and not a detail, is what tells it from
    # Blub II, who has gone the other way and crouched under his rock.
    r = R(10)
    h = _stack(s, "b", 0, 0, r, r * 3.70, EGG, "moss", body)
    face(s, 0, 0, h * 0.56, r, body, "happy", flat, front=0.94)


def unit_blub2(s, body, flat):
    # LOW. "Idem, une croute de pierre sur le dos" -- and the crust is finally
    # doing the silhouette work. Revue 1: blub1 was 92% CONTAINED in blub2,
    # "one egg at two sizes", because the crust sat flush on the back and never
    # reached the outline. So Blub II now hunkers DOWN under his rock (which is
    # also the joke: il se croit costaud), the carapace flares into two plates
    # well outside the body, and it narrows to a single crest -- the profile is
    # a T, not a bigger egg, and nothing tall fits inside it.
    r = R(13)
    # The blub is a pancake and the ROCK is most of the animal: below a third of
    # the height it is as wide as the plates reach, above that it is nothing but
    # a crest a fifth of that width. That T is what a tall smooth egg cannot be
    # rescaled into, and it is also what a tall egg escapes SIDEWAYS out of --
    # which is the only way an area measure like containment really moves.
    # A lens, not a frustum stack: BROADER THAN IT IS DEEP. A body that is round
    # in plan is exactly as wide from the side as from the front, so "wide and
    # low" quietly becomes "tall" the moment the unit turns 90 degrees and the
    # width folds into depth. This one stays low from every yaw.
    td.ellipsoid(s, "b", (r * 1.86, r * 1.24, r * 1.06), (0, -r * 0.02, r * 0.50),
                 "moss", body, (0, 0, 0), 10, 5)
    face(s, 0, 0, r * 0.54, r * 0.88, body, "brow", flat, front=0.64)
    for sx in (-1, 1):
        td.box(s, "crust_plate", (r * 1.20, r * 1.08, r * 0.26),
               (sx * r * 0.96, -r * 0.04, r * 0.44), (0, sx * -0.30, 0),
               "stone", body)
        td.box(s, "crust_lip", (r * 0.32, r * 0.86, r * 0.20),
               (sx * r * 1.46, -r * 0.04, r * 0.30), (0, sx * -0.30, 0),
               "stone_dark", body)
    # The crest is thin in DEPTH as well as in width -- a blade, not a hump --
    # so it is a narrow stem of the T from the side as much as from the front.
    td.box(s, "crust_ridge", (r * 0.62, r * 0.96, r * 0.34),
           (0, -r * 0.12, r * 0.98), (-0.06, 0, 0), "stone", body)
    td.box(s, "crust_crown", (r * 0.42, r * 0.68, r * 0.24),
           (0, -r * 0.16, r * 1.24), (-0.06, 0, 0), "stone", body)
    for fy in (-0.30, 0.02):
        td.frustum(s, "crust_spike", r * 0.13, r * 0.03, r * 0.16,
                   (0, r * fy, r * 1.40), "stone_dark", body, 4, (0, 0, 0.5))


def unit_blub3(s, body, flat):
    r = R(20); h = drop(s, "b", 0, 0, r, r * 1.85, "moss", body)
    face(s, 0, 0, h * 0.60, r, body, "serious", flat)
    # plaques de pierre aux epaules
    for sx in (-1, 1):
        td.box(s, "pauldron", (r * 0.62, r * 0.70, r * 0.36),
               (sx * r * 0.74, -r * 0.06, h * 0.74), (0, sx * -0.38, 0), "stone", body)
        td.box(s, "pauldron_lip", (r * 0.54, r * 0.60, r * 0.12),
               (sx * r * 0.80, -r * 0.06, h * 0.90), (0, sx * -0.38, 0), "stone_dark", body)


# THE TWO MINIS SHARE NOTHING BUT A FOOTPRINT.
#
# Revue 1 measured them at 0.951 / 0.921 / 0.986 raw IoU across three yaws, with
# 96.9% of mini1 inside mini2, and named the reason the previous fix failed: the
# "caillou pose de travers" that was supposed to separate them weighs one to two
# pixels at 10 x 12, so "il n'existe pas en ombre chinoise". They therefore no
# longer share a body function at all. Mini I is a SPIRE and Mini II is a SLAB,
# and the difference is visible before any detail is.
#
# The body radius stays R(10) * 0.78: it is the reconstructed body radius
# summoner_unit_marks.py seats its marks on, and the GAMEPLAY footprint is
# still the full 10 from UNIT_FOOTPRINT.

def unit_mini1(s, body, flat):
    # TALL. "Presque entierement bouche" (section 7) -- but the owner's report
    # is the correction to that: all mouth cannot mean no head, or the thing is
    # a blob with a bite out of it and it is open from behind. So Mini I is a
    # spire, full width where it meets the ground and tapering to a point, with
    # the gape cut into the wide bottom half and a real head standing above it.
    r = R(10) * 0.78
    h = _stack(s, "b", 0, 0, r, r * 3.05, SPIRE, "moss", body, segs=10)
    zm = h * 0.24
    maw(s, 0, 0, zm, radius_at(SPIRE, r, h, zm), r * 0.64, body,
        span=2.80, tiles=7, teeth=6)
    ze = h * 0.56
    face(s, 0, 0, ze, r, body, "one_eye", flat,
         front=radius_at(SPIRE, r, h, ze) / r)
    for sx in (-1, 1):                       # les pattes, courtes, sous le corps
        td.tube(s, "leg", r * 0.11, (sx * r * 0.44, -r * 0.06, h * 0.12),
                (sx * r * 0.66, -r * 0.10, 0), "moss_dark", body, 6)


def unit_mini2(s, body, flat):
    # LOW -- the exact opposite proportion, which is the only lever that exists
    # at this size. Mini II is a wide crouching grin under a flat stone lid, so
    # the top of its silhouette is a straight line where Mini I comes to a
    # point, and it is wider than it is tall where Mini I is the reverse.
    r = R(10) * 0.78
    h = _stack(s, "b", 0, 0, r * 1.10, r * 0.86, SQUAT, "moss", body, segs=10)
    zm = h * 0.42
    maw(s, 0, 0, zm, radius_at(SQUAT, r * 1.10, h, zm), r * 0.42, body,
        span=2.80, tiles=7, teeth=6)
    ze = h * 0.86
    face(s, 0, 0, ze, r, body, "two_eye", flat,
         front=radius_at(SQUAT, r * 1.10, h, ze) / r)
    # Le caillou est devenu un couvercle: a slab across the WHOLE head, set
    # askew. A pebble on top was a 2 px notch; a lid is the top edge itself.
    # It is square in plan and turned, so it is just as wide from the side as
    # from the front -- an aspect ratio that only exists at one yaw is not one.
    td.box(s, "slab", (r * 2.24, r * 2.24, r * 0.26), (0, -r * 0.04, h + r * 0.10),
           (0.08, 0, 0.42), "stone", body)
    td.box(s, "slab_chip", (r * 0.74, r * 0.52, r * 0.16),
           (r * 0.62, -r * 0.24, h + r * 0.22), (0, 0, 0.42), "stone_dark", body)
    for sx in (-1, 1):                       # pattes ecartees, bien en dehors
        for fy in (-0.50, 0.42):
            td.tube(s, "leg", r * 0.12, (sx * r * 0.74, r * fy, h * 0.34),
                    (sx * r * 1.14, r * fy, 0), "moss_dark", body, 6)


def unit_hungry(s, body, flat):
    # "Une machoire sur pattes, corps reduit." LOW and SPRAWLING -- 1.40 radii
    # tall on a 2.30-radii stance -- because the Cyberblub has the SAME
    # footprint of 25 and revue 1 measured them at 0.877 shape IoU with 93%
    # containment: size cannot separate them, so proportion has to.
    #
    # The head is a HEAD. The old one was two frusta hinged 45 degrees apart
    # with a dark ellipsoid wider than either of them wedged in between, which
    # is what the owner kept reporting: an open clamshell, nothing above the
    # gape, and daylight through it from behind. Here the skull is one solid
    # block with a cranium on top of it, the jaw is a second solid under it with
    # an underbite that juts past the skull, and the gape between them is a
    # narrow dark line that is strictly smaller than both in every direction.
    # The long legs are what give this unit the one thing nothing else in the
    # family has: HOLES in its outline.
    r = R(25)
    # ce qui reste du corps: a sac slung low at the back, a remnant, and set
    # BELOW the skull line so there is a step in the profile behind the head.
    td.frustum(s, "gut", r * 0.44, r * 0.32, r * 0.38, (0, -r * 0.62, r * 0.62),
               "moss", body, 10)
    td.frustum(s, "gut_cap", r * 0.32, r * 0.10, r * 0.14, (0, -r * 0.62, r * 0.86),
               "moss", body, 10)
    # LA MACHOIRE -- and it is the animal. Three plates of falling width make a
    # WEDGE in plan: broad at the hinge, tapering to a snout. A stack of equal
    # boxes is a crate, which is what the first attempt at this looked like.
    td.box(s, "jaw", (r * 1.90, r * 0.92, r * 0.34), (0, -r * 0.04, r * 0.62),
           (0.05, 0, 0), "moss_dark", body)
    td.box(s, "jaw_mid", (r * 1.28, r * 0.86, r * 0.28), (0, r * 0.64, r * 0.60),
           (0.05, 0, 0), "moss_dark", body)
    td.box(s, "snout", (r * 0.64, r * 0.62, r * 0.20), (0, r * 1.24, r * 0.58),
           (0.05, 0, 0), "moss_dark", body)
    # LE CRANE: the same wedge again, narrower, set back and ABOVE the mouth
    # line, under a dome. The owner's report was that there was no head above
    # the gape; this is the head above the gape.
    td.box(s, "skull", (r * 1.66, r * 0.88, r * 0.28), (0, -r * 0.08, r * 1.02),
           (-0.08, 0, 0), "moss", body)
    td.box(s, "skull_mid", (r * 1.08, r * 0.80, r * 0.22), (0, r * 0.58, r * 0.98),
           (-0.08, 0, 0), "moss", body)
    td.box(s, "muzzle", (r * 0.54, r * 0.52, r * 0.16), (0, r * 1.12, r * 0.94),
           (-0.08, 0, 0), "moss", body)
    td.ellipsoid(s, "cranium", (r * 1.40, r * 1.02, r * 0.54),
                 (0, -r * 0.14, r * 1.10), "moss", body, (0, 0, 0), 10, 5)
    # LA GUEULE: the dark line between the two wedges. Narrower and shallower
    # than both of them in x and in y, so it cannot reach the outline from any
    # angle and there is solid blub behind it -- no hole, at any yaw.
    td.box(s, "gullet", (r * 1.52, r * 1.34, r * 0.14), (0, r * 0.30, r * 0.82),
           (0, 0, 0), "dark", body)
    for i in range(7):                       # les dents, DANS la gueule
        x = r * 1.16 * (-0.5 + (i + 0.5) / 7.0)
        td.box(s, "tooth", (r * 0.13, r * 0.16, r * 0.15),
               (x, r * 0.96, r * 0.86), (0, 0, 0), "tooth", body)
        td.box(s, "tooth", (r * 0.13, r * 0.16, r * 0.14),
               (x + r * 0.09, r * 0.98, r * 0.77), (0, 0, 0), "tooth", body)
    face(s, 0, 0, r * 1.20, r * 0.60, body, "teeth", flat, front=1.00)
    # pattes: ECARTEES et sous le crane, et le corps est PORTE. The jaw hangs
    # clear of the ground, so the daylight between the legs is the only pierced
    # outline in the ten -- and a hole is the one contour feature that survives
    # being normalised into somebody else's bounding box.
    for sx in (-1, 1):
        for fy in (-0.34, 0.42):
            td.tube(s, "leg", r * 0.11, (sx * r * 0.56, r * fy, r * 0.56),
                    (sx * r * 0.90, r * fy * 1.10, 0), "moss_dark", body, 6)
            td.box(s, "foot", (r * 0.26, r * 0.38, r * 0.10),
                   (sx * r * 0.90, r * fy * 1.10, r * 0.05), (0, 0, 0),
                   "moss_dark", body)


def unit_cyber(s, body, flat):
    # TALL. Un blub avec des greffes -- still a blub, already wired, and now
    # measurably not the Hungry Blub: same footprint of 25, 2.55 radii tall
    # against 1.40, drawn UP where the Hungry Blub is drawn out. The mast is
    # what a grafted thing has that a grown thing does not, and it is the one
    # hard vertical in the A-to-B crossover.
    r = R(25)
    h = _stack(s, "b", 0, 0, r * 0.90, r * 1.88, EGG, "blue_gel", body)
    face(s, 0, 0, h * 0.56, r, body, "visor_up", flat, FACE_SCALE["cyber"],
         front=0.84)
    td.box(s, "visor", (r * 0.82, r * 0.32, r * 0.15), (0, r * 0.60, h * 0.72),
           (0.42, 0, 0), "chrome", body)
    # le mat: the graft that breaks the top of the profile
    td.frustum(s, "mast", r * 0.20, r * 0.08, r * 0.50, (0, -r * 0.10, r * 2.02),
               "chrome", body, 6)
    td.torus(s, "mast_ring", r * 0.18, r * 0.05, (0, -r * 0.10, r * 2.10),
             (0, 0, 0), "cyan", body, 8, 5)
    td.ball(s, "mast_lamp", r * 0.14, (0, -r * 0.10, r * 2.32), "cyan", body, 8, 5)
    for sx in (-1, 1):
        # greffes d'epaule: hard rectilinear boxes on a round body, and they
        # stay INSIDE the width the profile already has. A grafted thing is
        # read by its verticals, not by how far it sticks out.
        td.box(s, "graft", (r * 0.30, r * 0.46, r * 0.76),
               (sx * r * 0.78, -r * 0.06, h * 0.58), (0, sx * 0.14, 0),
               "chrome_dk", body)
        td.box(s, "graft_plate", (r * 0.14, r * 0.40, r * 0.46),
               (sx * r * 0.92, -r * 0.06, h * 0.72), (0, sx * 0.14, 0),
               "chrome", body)
        td.tube(s, "vein", r * 0.055, (sx * r * 0.70, -r * 0.06, h * 0.40),
                (sx * r * 0.16, r * 0.32, h * 0.86), "cyan", body, 5)
    # heritage obligatoire de la voie B (section 4): pierre gravee + lichen
    td.box(s, "heritage_stone", (r * 0.44, r * 0.16, r * 0.32),
           (-r * 0.46, r * 0.62, h * 0.26), (0, 0, 0), "stone", body)
    td.ball(s, "heritage_lichen", r * 0.16, (r * 0.44, r * 0.56, h * 0.18),
            "lichen", body, 6, 4)


def unit_mecha(s, body, flat):
    # Chassis + deux canons de bras. The creature becomes a weapon here.
    r = R(30)
    td.box(s, "chassis", (r * 1.10, r * 0.96, r * 0.86), (0, 0, r * 0.62),
           (0, 0, 0), "chrome_dk", body)
    td.box(s, "chest", (r * 0.80, r * 0.30, r * 0.52), (0, r * 0.54, r * 0.72),
           (0, 0, 0), "steel_bru", body)
    # the blub inside, already smaller
    td.frustum(s, "pilot", r * 0.34, r * 0.24, r * 0.34, (0, r * 0.20, r * 1.20),
               "blue_gel", body, 10)
    face(s, 0, 0, r * 1.22, r * 0.34, body, "visor_down", flat, FACE_SCALE["mecha"])
    td.box(s, "visor", (r * 0.42, r * 0.16, r * 0.12), (0, r * 0.44, r * 1.24),
           (0, 0, 0), "chrome", body)
    for sx in (-1, 1):
        td.tube(s, "cannon", r * 0.17, (sx * r * 0.62, r * 0.10, r * 0.72),
                (sx * r * 0.66, r * 1.10, r * 0.68), "chrome", body, 8)
        td.torus(s, "muzzle", r * 0.19, r * 0.05,
                 (sx * r * 0.66, r * 1.08, r * 0.68), (math.pi / 2, 0, 0),
                 "cyan_dim", body, 8, 5)
        td.tube(s, "leg", r * 0.15, (sx * r * 0.42, 0, r * 0.24),
                (sx * r * 0.66, 0, 0), "chrome_dk", body, 6)
    td.box(s, "heritage_stone", (r * 0.40, r * 0.14, r * 0.30),
           (-r * 0.60, -r * 0.30, r * 0.70), (0, 0, 0), "stone", body)
    td.ball(s, "heritage_lichen", r * 0.13, (r * 0.58, -r * 0.34, r * 0.34),
            "lichen", body, 6, 4)


def unit_mecha2(s, body, flat):
    # Blinde, reservoirs instables apparents. It reads as about to go off.
    # Revue 1: mecha and mecha2 shared one compact two-cannon profile and only
    # size told them apart, which is not a silhouette. So MK2 goes WIDE and
    # SQUAT where the Mechablub is upright, and its tanks break the outline
    # instead of sitting inside it -- they are supposed to read as unstable and
    # exposed, which means they have to be visible in pure shadow.
    r = R(40)
    td.box(s, "hull", (r * 1.52, r * 1.00, r * 0.66), (0, 0, r * 0.50),
           (0, 0, 0), "chrome_dk", body)
    td.box(s, "armour_f", (r * 1.34, r * 0.26, r * 0.54), (0, r * 0.56, r * 0.54),
           (0, 0, 0), "steel_bru", body)
    for sx in (-1, 1):
        # les reservoirs instables: portes HAUT, en dehors du profil du chassis
        td.frustum(s, "tank", r * 0.30, r * 0.30, r * 0.72,
                   (sx * r * 0.92, -r * 0.30, r * 1.10), "chrome", body, 8,
                   (0, sx * 0.26, 0))
        td.torus(s, "tank_band", r * 0.33, r * 0.06,
                 (sx * r * 0.92, -r * 0.30, r * 1.16), (0, 0, 0), "cyan", body, 10, 5)
        td.tube(s, "tank_pipe", r * 0.07, (sx * r * 0.86, -r * 0.30, r * 0.78),
                (sx * r * 0.40, -r * 0.10, r * 0.62), "chrome_dk", body, 6)
        td.tube(s, "cannon", r * 0.22, (sx * r * 0.74, r * 0.16, r * 0.56),
                (sx * r * 0.78, r * 1.16, r * 0.52), "chrome", body, 8)
        td.tube(s, "leg", r * 0.18, (sx * r * 0.56, 0, r * 0.18),
                (sx * r * 0.86, 0, 0), "chrome_dk", body, 6)
    # the pilot is now a slit in a hatch
    td.box(s, "hatch", (r * 0.44, r * 0.14, r * 0.30), (0, r * 0.66, r * 0.92),
           (0, 0, 0), "chrome", body)
    face(s, 0, 0, r * 0.92, r * 0.30, body, "slit", flat, FACE_SCALE["mecha2"])
    td.box(s, "heritage_stone", (r * 0.38, r * 0.13, r * 0.28),
           (-r * 0.64, -r * 0.10, r * 0.72), (0, 0, 0), "stone", body)
    td.ball(s, "heritage_lichen", r * 0.12, (r * 0.62, -r * 0.16, r * 0.30),
            "lichen", body, 6, 4)


def unit_superb(s, body, flat):
    # Colosse, laser d'epaule, et un bebe blub terrifie dans un hublot.
    r = R(50)
    td.box(s, "hull", (r * 1.06, r * 0.92, r * 1.10), (0, 0, r * 0.74),
           (0, 0, 0), "chrome_dk", body)
    td.frustum(s, "core", r * 0.52, r * 0.44, r * 0.50, (0, 0, r * 1.46),
               "steel_bru", body, 10)
    for sx in (-1, 1):
        td.box(s, "pauldron", (r * 0.44, r * 0.72, r * 0.50),
               (sx * r * 0.72, 0, r * 1.24), (0, sx * -0.22, 0), "chrome", body)
        td.tube(s, "arm", r * 0.20, (sx * r * 0.66, r * 0.08, r * 1.02),
                (sx * r * 0.72, r * 0.86, r * 0.66), "chrome_dk", body, 8)
        td.tube(s, "leg", r * 0.22, (sx * r * 0.40, 0, r * 0.30),
                (sx * r * 0.60, 0, 0), "chrome_dk", body, 8)
    # le laser d'epaule, sur une seule epaule pour rester lisible
    td.tube(s, "laser", r * 0.13, (r * 0.72, -r * 0.10, r * 1.52),
            (r * 0.72, r * 0.96, r * 1.46), "chrome", body, 8)
    td.ball(s, "laser_lens", r * 0.15, (r * 0.72, r * 0.98, r * 1.46),
            "white_hot", body, 8, 5)
    # LE HUBLOT: the whole joke. A tiny frightened blub behind glass.
    td.torus(s, "port_ring", r * 0.26, r * 0.06, (0, r * 0.50, r * 1.02),
             (math.pi / 2, 0, 0), "chrome", body, 12, 5)
    td.frustum(s, "port_glass", r * 0.22, r * 0.22, r * 0.06,
               (0, r * 0.50, r * 1.02), "cyan_dim", body, 10, (math.pi / 2, 0, 0))
    td.ball(s, "pilot", r * 0.15, (0, r * 0.44, r * 1.00), "blue_gel", body, 8, 5)
    face(s, 0, r * -0.06, r * 1.02, r * 0.15, body, "tiny_scared", flat,
         FACE_SCALE["superb"])
    td.box(s, "heritage_stone", (r * 0.34, r * 0.12, r * 0.26),
           (-r * 0.66, -r * 0.30, r * 0.86), (0, 0, 0), "stone", body)
    td.ball(s, "heritage_lichen", r * 0.11, (r * 0.60, -r * 0.36, r * 0.40),
            "lichen", body, 6, 4)


UNITS = [
    ("blub1", unit_blub1), ("blub2", unit_blub2), ("blub3", unit_blub3),
    ("mini1", unit_mini1), ("mini2", unit_mini2), ("hungry", unit_hungry),
    ("cyber", unit_cyber), ("mecha", unit_mecha), ("mecha2", unit_mecha2),
    ("superb", unit_superb),
]


def build_unit(unit_id, fn, flat):
    s = td.Scene(palette(flat))
    root = s.node("root")
    body = s.node("body", parent=root)
    fn(s, body, flat)
    return td.build(s, "blub-" + unit_id)


def main():
    flat = "--silhouette" in sys.argv
    tag = "SILHOUETTE" if flat else "full"
    print("building blub units (%s)" % tag)
    total = 0
    for unit_id, fn in UNITS:
        model = build_unit(unit_id, fn, flat)
        td.write_js(model, "blub-%s.js" % unit_id)
        total += model["triangles"]
        print("  blub-%-7s %5d tris   ground radius %5.1f px"
              % (unit_id, model["triangles"], R_of(unit_id) * PX_PER_UNIT))
    print("  %d units, %d triangles total" % (len(UNITS), total))


UNIT_FOOTPRINT = {
    "blub1": 10, "blub2": 13, "blub3": 20, "mini1": 10, "mini2": 10,
    "hungry": 25, "cyber": 25, "mecha": 30, "mecha2": 40, "superb": 50,
}


def R_of(unit_id):
    return R(UNIT_FOOTPRINT[unit_id])


if __name__ == "__main__":
    main()
