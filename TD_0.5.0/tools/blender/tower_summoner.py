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
#    is played well. Every build prints the budget it buys -- the slowest pose
#    any unit can hold, at its own rate, with and without a full swarm. See the
#    block above `strip_phase` for the exact mapping and the runtime patch.
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
# 3. FRAME 0 IS REST, AND REST IS THE IDENTITY -- not merely "the rest values",
#    literally the 4x4 identity on every group. `set_pose` folds the pivot
#    correction into the node's own location, so a group at rest contributes
#    nothing at all, td_mesh's group-local storage collapses to world space, and
#    THE VERTICES ON DISK ARE THE ONES THE UN-ANIMATED BUILD WROTE. Not "close
#    enough": `check_rest_pose` diffs the animated build's frame 0 against a
#    frames=0 build of the same scene, triangle for triangle, and fails the
#    build on a single differing coordinate -- on every build, not behind a
#    flag. The three profiles, the maw laid on the head's
#    curve by radius_at(), the ten footprints and the empty >= 0.85 shape-IoU
#    family are all properties of frame 0, and this is what makes it arithmetic
#    rather than a promise that none of them moved.
#
#    Rest is also a FRAME OF ITS OWN rather than phase 0, because js/blub.js
#    holds `cooldown` at exactly zero while a blub has nothing to shoot -- and
#    zero cooldown reads as phase 1, the deepest part of the wind-up. Without a
#    rest frame an idle board would sit permanently coiled. Frame 0 is equally
#    what every path that does not animate draws: the dying-body pass in
#    blub-systems.js, the crosspath-mark overlay, TDObs.showcase. They keep
#    working untouched precisely because frame 0 is the identity.
#
# 4. RIGID GROUPS ONLY. td_mesh emits one 4x4 per group per frame and a 4x4
#    from `trs()` has no scale in it, so nothing here can squash or inflate by
#    scaling. The Hungry Blub's "il se gonfle" is therefore a PISTON: its
#    stomach is a separate group sunk flush at rest that rides BACKWARDS out of
#    the body on the shot, which grows the outline for real instead of
#    pretending to.
#
# 5. A GROUP IS A DRAW CALL, so the swarm pays for the rig. drawActor binds once
#    and issues one drawRange per group, and the brief's stress case is three
#    hundred units -- which is three hundred Mini Blubs. So every unit whose
#    attack is a whole-body motion has exactly ONE group and costs exactly what
#    it cost before the rig existed: both Minis, all three Blubs. Only the units
#    with a part that must move independently of the body pay for a second or a
#    third, and the largest of them is the rarest.
#
# THE STRIP. One rest frame, then eight cycle frames sampled uniformly, with the
# EASING IN THE KEY STOPS -- the same trick tower_warbringer.py uses. A release
# that owns 13 % of the cycle and a settle that owns 30 % are two key positions,
# not two frame counts, so the strip stays uniform and ONE runtime rule drives
# all ten units. The SuperBlub alone carries a second band of eight, for the
# interval whose next shot is the piercing beam; the runtime picks the band from
# `attacksMade`, which is the only reason the patch reads that field.
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
        # NOT LEVEL, and that is the point. mini2's head is cocked, so its two
        # eyes sit at two heights and are not the same size, with a single brow
        # slanted over the high one. It is the only unit that uses this kind, so
        # the tilt lives here rather than in a rotated group -- the body is one
        # rigid group and the buzz owns it.
        for sx, dz, k in ((-1, 0.52, 1.10), (1, -0.40, 0.84)):
            td.ball(s, "eye", e * k, (cx + sx * r * 0.34, fy, z + e * dz),
                    "eye", parent, 6, 4)
        # ONE brow, over the high eye, and it has to stay ON the head. Two
        # earlier tries missed that: e*0.34 square at z + e*1.5 rendered as a
        # green twig standing clear of the body, and the eyes themselves, put
        # up at the level of the hunch, rendered as two black knobs on its
        # back. An eye is a dark spot in a surface; off the surface it is a
        # bead. Both now sit on the jaw's own front, just above the grin.
        td.box(s, "brow", (r * 0.70, e * 0.46, e * 0.56),
               (cx - r * 0.22, fy * 0.90, z + e * 0.95), (0, 0.30, 0),
               "moss_dark", parent)
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
# THE RIG. Read the four rules at the top of the file first; this is how they
# are spelled.
#
# A unit builder is handed the animated `body` empty and hangs its solids on it
# exactly as before -- not one coordinate in the ten units below has moved. If a
# part has to move independently it gets a nested empty of its own, and NESTING
# IS FREE: matrix_world composes, both nodes rest at the identity, so a mast can
# drag behind a body without either of them being expressed in the other's
# frame. The builder returns its `pose(frame)`; a builder that returns None is
# simply not animated.
#
# The unanimated `root` is reachable as `body.parent`, and that is where a part
# goes that must stay PLANTED while the body moves -- the Hungry Blub's legs.
# ---------------------------------------------------------------------------

CYCLE = 8                      # poses in one reload cycle; frame 0 is rest

# The SuperBlub's second band is the interval that ENDS in the piercing beam.
BANDS = {"superb": 2}


def set_pose(node, pivot, rot=(0.0, 0.0, 0.0), shift=(0.0, 0.0, 0.0)):
    """Turn a group about `pivot`, then slide it by `shift`.

    The pivot correction is folded into the node's OWN location, which is the
    whole trick: at rest -- no rotation, no shift -- the location comes out
    exactly (0, 0, 0) and the group's matrix is the identity. td_mesh stores
    geometry in the group's frame-0 local space, so an identity rest matrix
    means local space IS world space and the vertices written to disk are the
    ones the un-animated build wrote, to the last rounding step.

    The alternative -- an empty parked at the pivot, the way tower_warbringer.py
    rigs its shoulder -- bakes the pivot into the rest matrix and offsets every
    vertex on disk by it. That is correct through drawActor and wrong through
    everything that draws a model without asking for a pose, which here is the
    dying-body pass, the mark overlay and the review harness. Same motion, and
    this one cannot break them.
    """
    m = td.trs((0.0, 0.0, 0.0), rot)
    p = td.apply(m, pivot)
    node.rotation = [rot[0], rot[1], rot[2]]
    node.location = [pivot[0] - p[0] + shift[0],
                     pivot[1] - p[1] + shift[1],
                     pivot[2] - p[2] + shift[2]]


def rest(*nodes):
    for n in nodes:
        n.rotation = [0.0, 0.0, 0.0]
        n.location = [0.0, 0.0, 0.0]


# THE MAPPING, and the runtime patch that has to match it.
#
#   phase = 1 - cooldown / (1 / attacksPerSecond())      0 at the shot, ->1 at
#                                                        the next one
#   frame = 1 + band * CYCLE + floor(phase * CYCLE)
#   frame = 0                                            when cooldown <= 0
#
# The last line is not a detail. An idle blub holds `cooldown` at exactly zero
# (js/blub.js refuses to bank time it cannot spend), and 1 - 0/interval is 1,
# not 0 -- so the naive formula parks every idle unit on the LAST frame of the
# wind-up. Reading a cooldown of zero as rest is what makes an idle board still.
#
# Spelled for js/gl/gl-world.js, in the tower loop beside the gearPhase and
# swingProgress branches, which is the only place that has to change. Verified
# against the live simulation, not reasoned about: sweeps 1..8 uniformly while
# firing, holds 0 for a live blub with nothing to shoot, FINISHES its reload and
# then rests when the target dies mid-cycle, and stays in range when the swarm
# buff takes the rate from 1.31 to 2.50 in the middle of an interval.
#
#     var BLUB_CYCLE = 8;                      // poses per reload, frame 0 rest
#
#     // A blub has neither gearPhase nor swingProgress: its animation IS its
#     // cooldown, so the strip is indexed by the reload phase and can neither
#     // overrun the interval nor lag a rate change.
#     if (m && m.frames.length > 1 && t.isSummon &&
#         typeof t.attacksPerSecond === "function") {
#       frame = 0;                                       // idle blubs rest
#       var brate = t.attacksPerSecond();
#       if (t.cooldown > 0 && brate > 0) {
#         var bphase = 1 - t.cooldown * brate;
#         if (!(bphase > 0)) bphase = 0;                 // a rate that just rose
#         if (bphase > 0.999999) bphase = 0.999999;
#         // The SuperBlub carries a second band for the interval that ENDS in
#         // the piercing beam, so the shoulder gun has somewhere to come up.
#         // Nine units have one band and never take this branch.
#         var bands = Math.max(1, Math.round((m.frames.length - 1) / BLUB_CYCLE));
#         var band = (bands > 1 && t.laser && t.laser.every &&
#                     ((t.attacksMade + 1) % t.laser.every === 0)) ? 1 : 0;
#         frame = 1 + band * BLUB_CYCLE + Math.floor(bphase * BLUB_CYCLE);
#       }
#     }
#
# Both reads are read-only and neither is a simulation value: `cooldown` and
# `attacksMade` are already what js/blub.js publishes. Nothing else in the draw
# path changes -- BlubFXShots.recoil keeps its positional kick, which is meant
# to be seen ON TOP of the MK2's chassis rotation and not instead of it.
#
# THIS BLOCK IS A PATCH, NOT A DESCRIPTION, AND IT IS ONE GREP TO CHECK:
#
#     grep -c BLUB_CYCLE js/gl/gl-world.js        # 0 means every blub is frozen
#
# A blub has neither `gearPhase` nor `swingProgress`, so if the branch above is
# missing the tower loop leaves `frame` at 0 and all ten of these strips are
# dead weight on disk -- the models animate perfectly in review and the game
# shows nothing. There is no visible symptom to notice: a frozen blub looks
# exactly like a correct rest pose, which is the whole reason frame 0 IS the
# rest pose. Nine frames on disk and a still board is the failure, and the count
# above is the only thing that distinguishes it.
def strip_phase(frame):
    """(band, phase) for a strip frame, or None for the rest frame.

    Phase is `i / CYCLE`, never `i / (CYCLE - 1)`: this is a LOOP, so the last
    sample sits at 7/8 and phase 1 is phase 0 of the next interval. Sampling to
    1.0 would play the wind-up extreme and the release back to back and swallow
    the snap that the whole cycle is built around.
    """
    if frame <= 0:
        return None
    i = (frame - 1) % CYCLE
    return ((frame - 1) // CYCLE, i / float(CYCLE))


def keys(t, stops):
    """Sample a curve given as (phase, value) stops, linear between them.

    Linear on purpose. The easing lives in WHERE the stops are -- a release that
    owns an eighth of the cycle and a settle that owns a third are two key
    positions -- and at eight samples a smoothstep between stops only flattens
    the velocity at every key, which is what makes an animation read as sticky.
    The last stop is at phase 1.0 and is never sampled: it is the pose the
    wind-up is heading for when the shot cuts it off.
    """
    for i in range(len(stops) - 1):
        t0, v0 = stops[i]
        t1, v1 = stops[i + 1]
        if t <= t1:
            return v0 + (v1 - v0) * ((t - t0) / ((t1 - t0) or 1e-9))
    return stops[-1][1]


# --- the lob ---------------------------------------------------------------
#
# Blub I, II and III throw the same gob on the same high arc and differ only in
# weight, so they share one curve and scale it. Read down the PITCH column and
# the shape of every attack in this file is visible in one place:
#
#   0.00  thrown       the gob is gone, the body is already forward
#   0.13  overshoot    the mass keeps going -- follow-through, and it is the
#                      EXTREME, not the release: an attack whose furthest pose
#                      is the shot frame has no follow-through in it at all
#   0.30  rebound      back PAST neutral, the gelatine arriving late
#   0.46  settle       a small counter-swing, dying out
#   0.62  rest         the only frame in the cycle that is the rest pose
#   0.80  intake       and from here it is coiling, not settling
#   1.00  coil         never sampled; the shot happens on the way to it
#
# Neither extreme is neutral, which is the rule that stops a motion played four
# hundred times in a wave reading as a metronome.
LOB_PITCH = [(0.00, -0.21), (0.13, -0.30), (0.30, 0.14), (0.46, 0.02),
             (0.62, 0.00), (0.80, 0.13), (1.00, 0.30)]
LOB_PUSH = [(0.00, 0.11), (0.13, 0.15), (0.30, -0.09), (0.46, 0.01),
            (0.62, 0.00), (0.80, -0.11), (1.00, -0.24)]
LOB_LIFT = [(0.00, 0.13), (0.13, 0.09), (0.30, -0.05), (0.46, 0.02),
            (0.62, 0.00), (0.80, -0.05), (1.00, -0.09)]


def roll_up(angle, foot, r):
    """A body rocking on a base of radius `foot` climbs onto the rim of it.

    Without this term a blub pitched about its ground contact drives its own
    front rim through the road -- three pixels of Blub III were under the map
    at the far end of the throw, which reads as a hole in the world rather than
    as a mistake in an animation. It is also simply true: a round-bottomed thing
    that tips rises, and the little bob it adds at both extremes is free
    character. `check_strip` fails the build if any unit still sinks."""
    return foot * r * abs(math.sin(angle))


def lob(node, t, r, pitch=1.0, push=1.0, lift=1.0, foot=0.0,
        pivot=(0.0, 0.0, 0.0)):
    """One blub throwing. Shifts are in radii, and a radius IS the unit's
    footprint in screen pixels -- R() divides by exactly the px-per-unit the
    board runs at -- so `push = 0.15` reads as "one and a half pixels forward"
    for a Blub I without converting anything."""
    a = keys(t, LOB_PITCH) * pitch
    set_pose(node, pivot, (a, 0.0, 0.0),
             (0.0, keys(t, LOB_PUSH) * push * r,
              keys(t, LOB_LIFT) * lift * r + roll_up(a, foot, r)))


# --- the buzz --------------------------------------------------------------
#
# The Minis are the one pair that must NOT get a curve. Section 10 calls them
# machine-gun pellets and the brief is explicit that a third of a second buys a
# vibration and not a ceremony -- so these eight poses are authored one by one
# rather than sampled off a spline, because a vibration that interpolates is a
# wobble. The numbers deliberately do not sit on a curve: alternating signs, no
# two consecutive frames on the same side, which is what reads as a buzz instead
# of a swing at 24 poses a second.
#
# The accent is still there, and it has to be, or the shot is invisible inside
# the shudder: FRAME 1 (phase 0, the instant a pellet left) is three times the
# amplitude of the buzz around it and the only pose that is clearly forward, and
# the last frame is the only one clearly back. Everything between is noise. That
# is the whole anticipation budget a third of a second can pay for.
#
# Columns: (rx, ry, rz, push, lift) -- radians, then radii.
MINI1_BUZZ = [
    (-0.20, 0.000, 0.02, 0.20, 0.10),      # the shot
    (-0.09, 0.045, -0.05, 0.05, 0.03),
    (0.07, -0.040, 0.05, -0.06, -0.03),
    (-0.04, 0.055, -0.03, 0.03, 0.02),
    (0.06, -0.050, 0.04, -0.05, -0.02),
    (-0.03, 0.040, -0.05, 0.04, 0.02),
    (0.07, -0.035, 0.03, -0.06, -0.03),
    (0.13, -0.015, -0.02, -0.12, -0.04),   # the intake
]

# MINI II'S ACCENT IS A LUNGE, NOT A TWIST, and that is the correction here.
# The paragraph above is the design and it was true of Mini I; it was NOT true
# of these numbers. Measured off the built strip: frame 1 travelled 4.0 px
# against a buzz floor of 2.0-2.4, and the intake reached 2.2 -- exactly the
# floor. On the strip (blubverify-mini2-strip) there is no pose you could point
# at and call the shot. Both accents were invisible inside the shudder, which is
# the one failure this paragraph exists to prevent.
#
# The reason is anatomy, not amplitude. Mini I is a spire, so ROTATION carries
# it: 0.20 rad about the foot swings a 24 px point through 4 px. Mini II is a
# slab 12 px tall, and the same rotation moves nothing -- which is why the twin
# with the same rate, the same footprint and a comparable table came out at half
# the accent. So Mini II's shot and intake move the body BODILY, on `push`,
# where its proportion cannot swallow them, and the buzz between them is quieted
# a little so the floor they stand on is lower.
MINI2_BUZZ = [
    (-0.20, 0.010, 0.03, 0.40, 0.11),      # the shot -- a lunge, 3 px of it
    (-0.04, 0.060, -0.06, 0.05, 0.02),
    (0.04, -0.055, 0.06, -0.05, -0.02),
    (-0.02, 0.065, -0.05, 0.03, 0.02),
    (0.03, -0.060, 0.06, -0.05, -0.02),
    (-0.02, 0.055, -0.06, 0.04, 0.01),
    (0.04, -0.050, 0.05, -0.05, -0.02),
    (0.15, -0.020, -0.02, -0.30, -0.05),   # the intake -- the only pose back
]


def buzz(node, frame_index, table, r, pivot=(0.0, 0.0, 0.0)):
    rx, ry, rz, push, lift = table[frame_index]
    set_pose(node, pivot, (rx, ry, rz), (0.0, push * r, lift * r))


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

    # ONE GROUP, and that is the design and not a shortcut. A drop with no
    # appendages has nothing that can move on its own, so the whole animal
    # throws -- which also means Blub I costs exactly one draw call animated,
    # the same as it cost with no rig at all. It rocks about the ground contact
    # because that is where a heavy gelatinous thing is anchored; a body pivot
    # would slide the foot instead of leaning the mass over it. Full amplitude:
    # it is the goofiest and the slowest at 1.00 s, so it gets the whole lob.
    def pose(frame):
        ph = strip_phase(frame)
        if ph is None:
            return rest(body)
        lob(body, ph[1], r, foot=EGG[0][0])
    return pose


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

    # THE SAME THROW UNDER A ROCK. A slab that leant as far as Blub I would
    # tip its carapace off, and the T-profile the revue measured is the one
    # thing this unit has -- so half the pitch and half again as much shove.
    # It is the one that thinks it is strong, so the recoil is what moves it:
    # the crest dips, the whole plate slides back on the ground, and it hauls
    # itself forward again to reload.
    def pose(frame):
        ph = strip_phase(frame)
        if ph is None:
            return rest(body)
        lob(body, ph[1], r, pitch=0.52, push=1.55, lift=0.70, foot=1.40)
    return pose


def unit_blub3(s, body, flat):
    r = R(20); h = drop(s, "b", 0, 0, r, r * 1.85, "moss", body)
    face(s, 0, 0, h * 0.60, r, body, "serious", flat)
    # plaques de pierre aux epaules
    for sx in (-1, 1):
        td.box(s, "pauldron", (r * 0.62, r * 0.70, r * 0.36),
               (sx * r * 0.74, -r * 0.06, h * 0.74), (0, sx * -0.38, 0), "stone", body)
        td.box(s, "pauldron_lip", (r * 0.54, r * 0.60, r * 0.12),
               (sx * r * 0.80, -r * 0.06, h * 0.90), (0, sx * -0.38, 0), "stone_dark", body)

    # THE ONE THAT THROWS LIKE A SOLDIER -- and the one held on the shortest
    # leash, deliberately. Same lob, a third faster at 0.67 s, and led by a
    # shoulder: the twist runs on the same curve as the pitch, so the right
    # pauldron comes over the top and the left one trails. That is what the two
    # stone plates are FOR in motion, and it is also an answer to the one thing
    # the revue still had against this unit -- its ears leave the outline at
    # yaw 0 and vanish at 45 and 90. A body that turns on its own axis while it
    # throws puts them back in the profile from angles where a static blub3 has
    # nothing.
    #
    # WHY 0.70 AND NOT FULL WEIGHT, honestly: because a fast unit wants a
    # compact throw, and NOT because it was measured to fix anything.
    #
    # blub3/cyber is the open failure of SUMMONER-REVUE1 -- shape IoU 0.853,
    # raw 0.715 at all three yaws, 99.5 % containment -- so this is the one body
    # whose poses could make a RECORDED defect worse, and it was measured to
    # find out. Every pose of every unit against every pose of every other,
    # three yaws, at the reference viewport: full weight gave blub3/cyber 0.870
    # and 0.70 weight gave 0.868. Nothing. The control says why -- run the SAME
    # 243-way search over nine yaw jitters of +/- 5.7 degrees on the STATIC
    # frame-0 model, with no animation at all, and blub3/cyber reaches 0.864 in
    # 56 of 243 samples where the animated strip reaches 0.868 in 37. Searching
    # 243 poses finds a higher maximum than searching 3 whatever the poses are;
    # that is the search, not the motion, and trimming an animation to chase it
    # would be paying real quality for a measurement artefact. Recorded here so
    # the next pass does not repeat the experiment.
    def pose(frame):
        ph = strip_phase(frame)
        if ph is None:
            return rest(body)
        t = ph[1]
        a = keys(t, LOB_PITCH) * 0.70
        set_pose(body, (0.0, 0.0, 0.0), (a, 0.0, a * -0.24),
                 (0.0, keys(t, LOB_PUSH) * 0.85 * r,
                  keys(t, LOB_LIFT) * 0.75 * r + roll_up(a, 0.62, r)))
    return pose


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

    # A SPIRE VIBRATES LIKE A TUNING FORK -- about its foot, and mostly in
    # pitch, because that is the axis a tall narrow thing is weakest on. One
    # group: three hundred of these is the brief's stress case and the swarm
    # must not pay a second draw call for a shudder.
    def pose(frame):
        ph = strip_phase(frame)
        if ph is None:
            return rest(body)
        buzz(body, int(ph[1] * CYCLE), MINI1_BUZZ, r)
    return pose


def unit_mini2(s, body, flat):
    # LOW -- and REBUILT, because the owner looked at it and said "le mini blub
    # 2 est moche, on dirait une crepe ecrasee". He was right, and the mask says
    # exactly why. At true game scale the old body measured 16 x 11 px and read
    # like this:
    #
    #     .......#####....        a lozenge. One convex blob, a straight top
    #     ...#########....        edge, no step, no notch, nothing anywhere on
    #     #############...        the outline you could point at and name.
    #     .#############..        Eleven of its rows are the same row.
    #     ..#.#######.....
    #
    # The cause was the lid. "Un caillou pose sur la tete" had been answered
    # with a slab r*2.24 SQUARE laid flat across the whole head -- because a
    # review had measured the pebble at one or two pixels and asked for
    # something that reaches the outline. It does reach it: it BECOMES it. A
    # plate as wide as the animal, level, at the top of a body that is already
    # wider than it is tall, closes the profile with a horizontal line, and in
    # colour it swallows the blub as well -- the capture is 90 % grey stone with
    # a green rim under it.
    #
    # WHAT MAY NOT CHANGE. The one thing keeping the two Minis apart at 10 px is
    # the aspect ratio -- mini1 is the SPIRE at l/h 0.67, mini2 is the wide one
    # at 1.45 -- and the review that demanded that separation is the same review
    # that measured them at 0.986 raw IoU when they were twins. So mini2 stays
    # wide, stays low, and does NOT become a second spire. Its character has to
    # come from somewhere that costs no height.
    #
    # It comes from ASYMMETRY. A squat frantic thing is allowed to be lopsided:
    # this one crouches nose-down over its own mouth, humps its back behind its
    # head, cocks that head to one side, and carries the caillou as a caillou
    # again -- a real angular stone perched off-centre on the hunch, high on the
    # left, with the head dipping away to the right. The top edge is a diagonal
    # with a step in it instead of a straight line, and every horizontal slice
    # through the animal is a different width.
    r = R(10) * 0.78

    # 1. THE JAW MASS -- lower and wider than the old body, and still a body of
    #    revolution, because `maw()` lays its tiles on a radius and the file's
    #    hardest-won rule is that the mouth is a feature OF a head. Pushed
    #    forward on +y so the hunch behind it has somewhere to be.
    rj = r * 1.02
    h = _stack(s, "b", 0, r * 0.14, rj, r * 0.54, SQUAT, "moss", body, segs=10)
    zm = h * 0.48
    maw(s, 0, r * 0.14, zm, radius_at(SQUAT, rj, h, zm), r * 0.36, body,
        span=2.90, tiles=7, teeth=5)
    # les bajoues -- fat cheeks either side of the grin. They carry the WIDTH
    # that the jaw mass gave up: a body of revolution that widens also deepens,
    # and depth is what a 34-degree camera turns into silhouette HEIGHT. Wide
    # and shallow is the only way to stay wide.
    for sx in (-1, 1):
        td.ellipsoid(s, "jowl", (r * 0.78, r * 1.06, r * 0.56),
                     (sx * r * 0.92, r * 0.16, r * 0.28), "moss", body,
                     (0.0, 0.0, sx * -0.20), 6, 4)

    # 2. THE HUNCH -- shoulders rising BEHIND the head and rolled to the left,
    #    high enough to CLEAR it. That last word is the whole lesson of two
    #    failed attempts: at a 34-degree camera a body of revolution 1.3 r wide
    #    projects its own back rim to 1.24 r of screen height, so a hunch that
    #    tops out at 1.05 r is inside the outline and does not exist. It reads
    #    only from the height it clears the rim by, and this one clears it by
    #    half a radius.
    td.ellipsoid(s, "hunch", (r * 1.56, r * 1.18, r * 1.06),
                 (-r * 0.20, -r * 0.40, r * 0.74), "moss", body,
                 (0.12, 0.30, 0.10), 8, 4)
    # the nape closes the gap between hunch and jaw on the low right side, so
    # the step reads as one animal and not as two lumps
    td.frustum(s, "nape", r * 0.60, r * 0.34, r * 0.40,
               (r * 0.34, -r * 0.02, r * 0.62), "moss", body, 6, (0.10, -0.34, 0))

    # 3. THE HEAD IS COCKED, and the eyes sit in the STEP between the jaw's top
    #    rim and the front of the hunch -- which is where a face goes on an
    #    animal built this way. They were floating half a radius clear of both
    #    in the first build and read as two dark pips on the skyline.
    ze = r * 0.72
    face(s, -r * 0.08, r * 0.10, ze, r * 0.92, body, "two_eye", flat, front=0.62)

    # 4. LE CAILLOU, and it is a stone again: five-sided, leaning outward as if
    #    it were about to slide off, parked over the LEFT shoulder alone.
    #
    #    It sits that far out for a measured reason. Normalise the two Minis
    #    into one box -- which is what a shape IoU does -- and a stone on the
    #    centre line reads as mini1's POINT: both units then narrow to a bump at
    #    the top and the pair scores 0.79. Off at the shoulder, the top edge
    #    becomes a slope with a shelf at its high end, the top right corner is
    #    empty where mini1's is full, and no amount of rescaling turns that into
    #    a spire. It is the same argument as the aspect ratio, applied to the
    #    outline instead of to the box.
    td.frustum(s, "pebble", r * 0.58, r * 0.40, r * 0.40,
               (-r * 0.60, -r * 0.36, r * 1.36), "stone", body, 5,
               (0.26, 0.42, 0.55))
    td.box(s, "pebble_facet", (r * 0.46, r * 0.34, r * 0.14),
           (-r * 0.72, -r * 0.44, r * 1.54), (0.22, 0.38, 0.55), "stone_dark", body)

    # 5. THE CROUCH IS IN THE LEGS. The front pair is short and tucked under the
    #    mouth, the back pair is longer and set wider -- the animal is down at
    #    the front and up at the back, and the rear stance is what keeps the
    #    outline wide now that the lid is not doing it.
    #    They are STUBS, not sticks. The first build ran them out to 1.42 r on a
    #    shallow diagonal and the capture shows exactly what that renders as:
    #    four green twigs poking out of a blob. Short, steep and finished with a
    #    foot, they read as an animal squatting on them.
    for sx in (-1, 1):
        td.tube(s, "leg", r * 0.15, (sx * r * 0.68, r * 0.44, r * 0.34),
                (sx * r * 0.86, r * 0.50, r * 0.05), "moss_dark", body, 6)
        td.box(s, "foot", (r * 0.34, r * 0.40, r * 0.12),
               (sx * r * 0.88, r * 0.52, r * 0.06), (0, 0, sx * 0.18),
               "moss_dark", body)
        td.tube(s, "leg", r * 0.17, (sx * r * 0.78, -r * 0.36, r * 0.62),
                (sx * r * 1.14, -r * 0.46, r * 0.06), "moss_dark", body, 6)
        td.box(s, "foot", (r * 0.38, r * 0.44, r * 0.13),
               (sx * r * 1.16, -r * 0.48, r * 0.07), (0, 0, sx * -0.22),
               "moss_dark", body)

    # A SLAB RATTLES INSTEAD. Mini II is wide and low on four splayed legs, so
    # it cannot pitch the way Mini I does -- it shakes about its vertical axis
    # and the stone lid skates on top of it. Hence twice the yaw and two thirds
    # the pitch of its twin: the two Minis share a footprint and a fire rate and
    # they now do not even shake alike, which is the same separation-by-
    # proportion argument that got them out of the 0.95 IoU they used to sit at.
    def pose(frame):
        ph = strip_phase(frame)
        if ph is None:
            return rest(body)
        buzz(body, int(ph[1] * CYCLE), MINI2_BUZZ, r)
    return pose


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
    # THE STOMACH IS ITS OWN GROUP, because "il se gonfle en tirant" cannot be
    # done by scaling -- td_mesh emits rigid 4x4s and there is no scale in one.
    # So the swelling is a PISTON: the sac rides backwards out of the animal on
    # the shot and is drawn flush again as it reloads, which grows the rendered
    # outline for real. It is nested under the body, so it swings with the heave
    # and pumps on top of it.
    sac = s.node("sac", parent=body, animated=True)
    # ce qui reste du corps: a sac slung low at the back, a remnant, and set
    # BELOW the skull line so there is a step in the profile behind the head.
    td.frustum(s, "gut", r * 0.44, r * 0.32, r * 0.38, (0, -r * 0.62, r * 0.62),
               "moss", sac, 10)
    td.frustum(s, "gut_cap", r * 0.32, r * 0.10, r * 0.14, (0, -r * 0.62, r * 0.86),
               "moss", sac, 10)
    # THE NECK, AND IT IS WHY THE PISTON READS AS A SWELLING AT ALL.
    #
    # Reviewed frame by frame (blubverify-hungry-piston) the sac used to come
    # OFF: the gut's front face sits at -0.18 r and the jaw it slides out of
    # ends at -0.50 r, so a stroke of 0.43 r opened 0.11 r -- nearly three
    # screen pixels -- of black sky between the animal and its own stomach at
    # the two shot frames. It did not read as inflating, it read as a part
    # falling off, which is worse than no piston at all.
    #
    # So the sac gets a shaft that is BURIED at rest and only ever emerges into
    # the gap it is there to fill. It is strictly inside the union of the gut
    # (a circle of ~0.37 r about y = -0.62 r at this height) and the jaw
    # (|x| <= 0.95 r, y in [-0.50, 0.42], z in [0.45, 0.79]), so it contributes
    # NOTHING to the frame-0 silhouette the revue measured -- verified by
    # differential, not asserted: hungry's mask is the same 34 x 31 box and the
    # same area before and after, and all 45 pair IoUs are unchanged.
    td.box(s, "gut_neck", (r * 0.48, r * 0.75, r * 0.24),
           (0, -r * 0.325, r * 0.62), (0, 0, 0), "moss", sac)
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
    #
    # AND THE LEGS DO NOT MOVE. They hang off `body.parent`, the un-animated
    # root, so they are the one thing in this file that stays where it is while
    # the group above it heaves. That is not a saving, it is the point: the
    # daylight between them is the only pierced outline in the ten units and the
    # only contour feature that survives a review normalising the size away, so
    # it must not swing about. The animal heaves ON its legs.
    ground = body.parent
    for sx in (-1, 1):
        for fy in (-0.34, 0.42):
            td.tube(s, "leg", r * 0.11, (sx * r * 0.56, r * fy, r * 0.56),
                    (sx * r * 0.90, r * fy * 1.10, 0), "moss_dark", ground, 6)
            td.box(s, "foot", (r * 0.26, r * 0.38, r * 0.10),
                   (sx * r * 0.90, r * fy * 1.10, r * 0.05), (0, 0, 0),
                   "moss_dark", ground)

    # THE HEAVE. 1.33 s is the longest interval in the family and it buys the
    # only real ceremony in the file: the whole animal see-saws about its hips,
    # the snout swinging from a rear-back at chest height down to a hand's
    # breadth off the road as the gob leaves. Wider stops than the lob, because
    # a slow curve sampled at eight needs its extremes further apart to keep any
    # velocity between them.
    HEAVE = [(0.00, -0.30), (0.11, -0.36), (0.27, 0.13), (0.44, -0.03),
             (0.60, 0.00), (0.82, 0.17), (1.00, 0.33)]
    # The piston: out on the shot, drawn flush again as it reloads, and PAST
    # flush -- sucked in -- on the intake, so the swell has something to swell
    # from. Same past-neutral rule as every other unit here.
    #
    # The stroke is unchanged; what changed is that `gut_neck` now spans it, so
    # the sac stays part of the animal at full extension. The RISE is what came
    # down -- 0.30 lifted the shaft clean out of the jaw's own z band before the
    # cranium could cover it, and the swell was never in the height anyway: it
    # is 0.43 r of length off the back of a thing 2.3 r long.
    PUMP = [(0.00, 0.44), (0.14, 0.48), (0.34, 0.24), (0.55, 0.10),
            (0.78, -0.06), (1.00, -0.15)]

    def pose(frame):
        ph = strip_phase(frame)
        if ph is None:
            return rest(body, sac)
        t = ph[1]
        set_pose(body, (0.0, -r * 0.25, r * 0.62),
                 (keys(t, HEAVE), 0.0, 0.0),
                 (0.0, keys(t, LOB_PUSH) * 0.55 * r,
                  keys(t, LOB_LIFT) * 0.60 * r))
        k = keys(t, PUMP)
        set_pose(sac, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0),
                 (0.0, -k * 0.90 * r, k * 0.18 * r))
    return pose


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
    # le mat: the graft that breaks the top of the profile -- and a graft is
    # bolted on, not grown, so it does not move WITH the body. Its own group,
    # nested, dragging behind.
    mast = s.node("mast", parent=body, animated=True)
    td.frustum(s, "mast", r * 0.20, r * 0.08, r * 0.50, (0, -r * 0.10, r * 2.02),
               "chrome", mast, 6)
    td.torus(s, "mast_ring", r * 0.18, r * 0.05, (0, -r * 0.10, r * 2.10),
             (0, 0, 0), "cyan", mast, 8, 5)
    td.ball(s, "mast_lamp", r * 0.14, (0, -r * 0.10, r * 2.32), "cyan", mast, 8, 5)
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

    # AN ENERGISED SPIT, and the mast is what makes it read as energised rather
    # than as a bigger Blub I. The body throws on the shared lob at three
    # quarters weight -- it is a graft-laden thing and moves stiffly -- and the
    # mast DRAGS: its own angle is literally what the body was doing an eighth
    # of a cycle ago minus what it is doing now, which is overlapping action
    # written as arithmetic instead of as a second set of keys. It cannot fall
    # out of step with the body, and at the seam -- coiled hard back, then
    # thrown -- the difference is at its largest, so the antenna whips exactly
    # on the shot and the lamp on top of it draws the arc.
    LAG = 0.125

    def pose(frame):
        ph = strip_phase(frame)
        if ph is None:
            return rest(body, mast)
        t = ph[1]
        lob(body, t, r, pitch=0.72, push=0.85, lift=0.80)
        drag = keys((t - LAG) % 1.0, LOB_PITCH) - keys(t, LOB_PITCH)
        set_pose(mast, (0.0, -r * 0.10, r * 1.77), (drag * 0.72, 0.0, 0.0))
    return pose


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
    # THE GUNS RUN IN THEIR MOUNTS. Section 10 asks for mechanical recoil, and
    # mechanical is the opposite of the gelatinous lob above it: the barrels
    # slam straight back along their own axis and are pushed out again by a
    # spring, and NOTHING about that is a body motion. Their own nested group.
    guns = s.node("guns", parent=body, animated=True)
    for sx in (-1, 1):
        td.tube(s, "cannon", r * 0.17, (sx * r * 0.62, r * 0.10, r * 0.72),
                (sx * r * 0.66, r * 1.10, r * 0.68), "chrome", guns, 8)
        td.torus(s, "muzzle", r * 0.19, r * 0.05,
                 (sx * r * 0.66, r * 1.08, r * 0.68), (math.pi / 2, 0, 0),
                 "cyan_dim", guns, 8, 5)
        td.tube(s, "leg", r * 0.15, (sx * r * 0.42, 0, r * 0.24),
                (sx * r * 0.66, 0, 0), "chrome_dk", body, 6)
    td.box(s, "heritage_stone", (r * 0.40, r * 0.14, r * 0.30),
           (-r * 0.60, -r * 0.30, r * 0.70), (0, 0, 0), "stone", body)
    td.ball(s, "heritage_lichen", r * 0.13, (r * 0.58, -r * 0.34, r * 0.34),
            "lichen", body, 6, 4)

    # Tracers at 2.5 a second: 0.40 s a cycle, so this is the fastest thing in
    # the file that is not a Mini. The hull leans INTO the shot and is knocked
    # back off it -- the anticipation is a brace, the follow-through is a rock
    # back onto the heels -- and the barrels run 0.18 r into their mounts and
    # creep forward again past neutral as the next round is rammed home. The
    # ejected casings are blub-projectiles' job and are deliberately not here:
    # a casing baked into the mesh would fly on a fixed path whatever the
    # unit's facing, and it would still be flying with the unit dead.
    #
    # THE BRACE, and it is a correction. Reviewed frame by frame at 30 px
    # (blubverify-mecha-strip) the first version of these two curves put FIVE of
    # the eight poses inside 1.6 px of rest -- f4 through f8, 200 ms of a 400 ms
    # interval in which the machine was a photograph -- and then jumped 9.4 px
    # into the recoil with nothing in front of it. Measured off the built strip,
    # not judged: max vertex travel from rest ran 9.4, 10.3, 4.1, 1.5, 0.6, 0.2,
    # 0.6, 1.6 px. A coil of 1.6 against a release of 9.4 is not the file's
    # "coils past neutral on the intake", it is a decay to zero, and it is the
    # one unit here that failed its own rule.
    #
    # The release is untouched -- phase 0 and the 0.10/0.12 extreme are the same
    # numbers -- because the recoil itself always read. What is new is the back
    # half: a counter-nod at 0.30/0.48, then the hull settles ONTO ITS FRONT
    # FOOT and the barrels creep out past neutral, so the last two poses before
    # the shot are a machine leaning into the round it is about to fire. The
    # rebound is now roughly two thirds of the release, which is the ratio the
    # three Blubs have always had.
    NOD = [(0.00, 0.09), (0.12, 0.12), (0.30, -0.05), (0.48, 0.02),
           (0.66, -0.02), (0.84, -0.07), (1.00, -0.13)]
    RUN = [(0.00, -0.16), (0.10, -0.18), (0.28, -0.07), (0.46, -0.01),
           (0.64, 0.03), (0.84, 0.09), (1.00, 0.16)]

    def pose(frame):
        ph = strip_phase(frame)
        if ph is None:
            return rest(body, guns)
        t = ph[1]
        set_pose(body, (0.0, 0.0, 0.0), (keys(t, NOD), 0.0, 0.0),
                 (0.0, keys(t, RUN) * 0.45 * r, 0.0))
        set_pose(guns, (0.0, r * 0.10, r * 0.72), (keys(t, NOD) * -0.35, 0.0, 0.0),
                 (0.0, keys(t, RUN) * r, 0.0))
    return pose


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
    # Three groups, and each one is a sentence of section 10. `guns` is where
    # "heavy shells" lives, `body` is the VISIBLE CHASSIS RECOIL the brief puts
    # in capitals, and `tanks` is "instables et apparents" -- they are the only
    # part of any unit here that is still moving after the thing that moved it
    # has stopped.
    guns = s.node("guns", parent=body, animated=True)
    tanks = s.node("tanks", parent=body, animated=True)
    for sx in (-1, 1):
        # les reservoirs instables: portes HAUT, en dehors du profil du chassis
        td.frustum(s, "tank", r * 0.30, r * 0.30, r * 0.72,
                   (sx * r * 0.92, -r * 0.30, r * 1.10), "chrome", tanks, 8,
                   (0, sx * 0.26, 0))
        td.torus(s, "tank_band", r * 0.33, r * 0.06,
                 (sx * r * 0.92, -r * 0.30, r * 1.16), (0, 0, 0), "cyan", tanks, 10, 5)
        td.tube(s, "tank_pipe", r * 0.07, (sx * r * 0.86, -r * 0.30, r * 0.78),
                (sx * r * 0.40, -r * 0.10, r * 0.62), "chrome_dk", tanks, 6)
        td.tube(s, "cannon", r * 0.22, (sx * r * 0.74, r * 0.16, r * 0.56),
                (sx * r * 0.78, r * 1.16, r * 0.52), "chrome", guns, 8)
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

    # The chassis rocks back a fifth of a radius -- eight screen pixels on a
    # sixty-eight-pixel hull -- and pitches with it, so the MK2 visibly shoves
    # itself backwards where the Mechablub only nods. It arrives on TOP of
    # BlubFXShots.recoil, which already slides the whole draw back along the
    # aim for about 0.13 s; that one is a position and this one is the body
    # rotating on its legs, and they are meant to be seen together.
    #
    # The tanks are the joke and they get the drag treatment: an eighth of a
    # cycle behind the hull, at nearly double the amplitude, so they are still
    # swinging when the chassis has settled. Nothing else in the file is left
    # moving after its cause has stopped.
    #
    # Same correction as the Mechablub above, and for the same measured reason:
    # f5 and f6 came out 1.7 and 0.5 px from rest on a body 68 px wide, and the
    # deepest pose of the wind-up reached 4.2 px against a 19.8 px release. On
    # the strip (blubverify-mecha2-windup) f6 and f7 are the rest pose and f8 is
    # a hair off it. So the tail of all three curves is deepened until the MK2
    # visibly HAULS ITSELF FORWARD to reload -- 0.17 r of shove is under seven
    # pixels, against the eight it slams back on the shot -- and the tanks, which
    # are driven by the difference of NOD across an eighth of a cycle, get a
    # bigger swing everywhere for free.
    NOD = [(0.00, 0.13), (0.11, 0.17), (0.28, -0.06), (0.46, 0.03),
           (0.64, -0.02), (0.84, -0.09), (1.00, -0.15)]
    SHOVE = [(0.00, -0.17), (0.11, -0.20), (0.28, 0.06), (0.46, -0.03),
             (0.64, 0.02), (0.84, 0.10), (1.00, 0.17)]
    RUN = [(0.00, -0.20), (0.09, -0.23), (0.26, -0.09), (0.44, -0.02),
           (0.62, 0.02), (0.84, 0.07), (1.00, 0.12)]
    LAG = 0.125

    def pose(frame):
        ph = strip_phase(frame)
        if ph is None:
            return rest(body, guns, tanks)
        t = ph[1]
        set_pose(body, (0.0, 0.0, 0.0), (keys(t, NOD), 0.0, 0.0),
                 (0.0, keys(t, SHOVE) * r, 0.0))
        set_pose(guns, (0.0, r * 0.16, r * 0.56), (keys(t, NOD) * -0.30, 0.0, 0.0),
                 (0.0, keys(t, RUN) * r, 0.0))
        drag = keys((t - LAG) % 1.0, NOD) - keys(t, NOD)
        set_pose(tanks, (0.0, -r * 0.30, r * 0.74), (drag * 0.85, 0.0, 0.0))
    return pose


def unit_superb(s, body, flat):
    # Colosse, laser d'epaule, et un bebe blub terrifie dans un hublot.
    r = R(50)
    td.box(s, "hull", (r * 1.06, r * 0.92, r * 1.10), (0, 0, r * 0.74),
           (0, 0, 0), "chrome_dk", body)
    td.frustum(s, "core", r * 0.52, r * 0.44, r * 0.50, (0, 0, r * 1.46),
               "steel_bru", body, 10)
    arms = s.node("arms", parent=body, animated=True)
    lance = s.node("lance", parent=body, animated=True)
    for sx in (-1, 1):
        td.box(s, "pauldron", (r * 0.44, r * 0.72, r * 0.50),
               (sx * r * 0.72, 0, r * 1.24), (0, sx * -0.22, 0), "chrome", arms)
        td.tube(s, "arm", r * 0.20, (sx * r * 0.66, r * 0.08, r * 1.02),
                (sx * r * 0.72, r * 0.86, r * 0.66), "chrome_dk", arms, 8)
        td.tube(s, "leg", r * 0.22, (sx * r * 0.40, 0, r * 0.30),
                (sx * r * 0.60, 0, 0), "chrome_dk", body, 8)
    # le laser d'epaule, sur une seule epaule pour rester lisible
    td.tube(s, "laser", r * 0.13, (r * 0.72, -r * 0.10, r * 1.52),
            (r * 0.72, r * 0.96, r * 1.46), "chrome", lance, 8)
    td.ball(s, "laser_lens", r * 0.15, (r * 0.72, r * 0.98, r * 1.46),
            "white_hot", lance, 8, 5)
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

    # TWO BANDS, AND THIS IS THE ONLY UNIT THAT HAS ANY BUSINESS WITH ONE.
    #
    # Band 0 is the shell: a colossus recoiling, which means a SMALL motion --
    # a fifth of the amplitude a Blub I gets, because weight on screen is
    # travel relative to size and this thing is fifty pixels across. Anything
    # more and it reads as light.
    #
    # Band 1 is the interval that ENDS in the piercing beam, and it is where the
    # anticipation for the beam has to live -- there is nowhere else. The lance
    # fires on attack 10, 20, 30..., so at the moment shell 9 leaves, the unit
    # already knows: `attacksMade` is 9, the next shot is the tenth, and
    # gl-world picks this band for the whole of that reload. The shoulder gun
    # rises and swings out over the interval on a curve that is almost flat for
    # the first third and then runs, so the last two frames before a beam are
    # unmistakably a weapon coming up. Then it discharges and the strip is back
    # in band 0 with the gun stowed -- the snap IS the shot, exactly as
    # everywhere else in this file.
    #
    # A blub with no `laser` never leaves band 0, so the one runtime branch that
    # reads `attacksMade` is dead code for the other nine units.
    CHARGE = [(0.00, 0.00), (0.34, 0.08), (0.62, 0.40), (0.86, 0.84),
              (1.00, 1.00)]

    def pose(frame):
        ph = strip_phase(frame)
        if ph is None:
            return rest(body, arms, lance)
        band, t = ph
        c = keys(t, CHARGE) if band else 0.0
        set_pose(body, (0.0, 0.0, 0.0),
                 (keys(t, LOB_PITCH) * 0.22 + c * 0.05, 0.0, 0.0),
                 (0.0, keys(t, LOB_PUSH) * 0.35 * r,
                  keys(t, LOB_LIFT) * 0.30 * r - c * 0.04 * r))
        set_pose(arms, (0.0, 0.0, r * 1.10),
                 (keys(t, LOB_PITCH) * -0.34 - c * 0.16, 0.0, 0.0),
                 (0.0, keys(t, LOB_PUSH) * -0.30 * r, 0.0))
        set_pose(lance, (r * 0.72, -r * 0.10, r * 1.52),
                 (c * 0.20, 0.0, 0.0),
                 (0.0, c * 0.08 * r, c * 0.20 * r))
    return pose


UNITS = [
    ("blub1", unit_blub1), ("blub2", unit_blub2), ("blub3", unit_blub3),
    ("mini1", unit_mini1), ("mini2", unit_mini2), ("hungry", unit_hungry),
    ("cyber", unit_cyber), ("mecha", unit_mecha), ("mecha2", unit_mecha2),
    ("superb", unit_superb),
]


def build_unit(unit_id, fn, flat, animate=True):
    """One unit. `animate=False` builds the same scene with no strip at all --
    td_mesh drops every group when `frames` is 0 -- which is the reference
    `check_rest_pose` diffs frame 0 against."""
    s = td.Scene(palette(flat))
    root = s.node("root")
    body = s.node("body", parent=root, animated=animate)
    pose = fn(s, body, flat)
    if not (animate and pose):
        return td.build(s, "blub-" + unit_id)
    return td.build(s, "blub-" + unit_id,
                    frames=1 + CYCLE * BANDS.get(unit_id, 1), pose=pose)


# ---------------------------------------------------------------------------
# THE CHECKS. They run on every build, not behind a flag, because the thing
# they protect is the reason this file was rewritten twice.
# ---------------------------------------------------------------------------

IDENTITY_4X4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def _mat(flat_col_major):
    """td_mesh emits column-major; read it back as rows."""
    return [[flat_col_major[c * 4 + r] for c in range(4)] for r in range(4)]


def _tris(model):
    """The model as a comparable multiset of triangles: nine coordinates, a
    normal, and the RESOLVED colour -- resolved, because two builds may order
    their palettes differently and an index would compare the wrong thing."""
    out = []
    p, n, c, pal = (model["positions"], model["normals"],
                    model["colourIndex"], model["palette"])
    for i in range(model["triangles"]):
        out.append((tuple(p[i * 9:i * 9 + 9]), tuple(n[i * 3:i * 3 + 3]),
                    tuple(pal[c[i]])))
    return sorted(out)


def check_rest_pose(unit_id, fn, flat, live):
    """FRAME 0 IS THE MODEL THE REVUE MEASURED, and this is the proof.

    Two claims, both arithmetic:

      1. every group's frame-0 matrix is the identity, so td_mesh's group-local
         storage is world storage and a renderer that ignores the pose entirely
         still draws the right thing;
      2. the animated build's triangles are the un-animated build's triangles,
         as multisets -- same coordinates, same normals, same colours. The
         ORDER differs, because grouping re-buckets the meshes, and that is the
         only thing allowed to differ.

    Everything the last pass measured -- the EGG/SPIRE/SQUAT profiles, the maw
    laid on the head's curve by radius_at(), the ten footprints, the empty
    >= 0.85 shape-IoU family -- is a property of these triangles. If they are
    the same triangles, none of it moved, and no re-measurement can say
    otherwise.
    """
    for gi, group in enumerate(live["groups"]):
        m = live["frames"][0][gi]
        if m is None:
            continue
        for a, b in zip(m, IDENTITY_4X4):
            if abs(a - b) > 1e-9:
                raise SystemExit(
                    "REST POSE MOVED: %s group %r frame 0 is not the identity"
                    % (unit_id, group["name"]))
    ref = _tris(build_unit(unit_id, fn, flat, animate=False))
    got = _tris(live)
    if got != ref:
        bad = sum(1 for a, b in zip(got, ref) if a != b) + abs(len(got) - len(ref))
        raise SystemExit("REST POSE MOVED: %s differs from the un-animated "
                         "build in %d triangles" % (unit_id, bad))
    return len(ref)


def frame_extent(model, frame):
    """World bounds and the furthest any vertex has travelled from rest, in
    SCREEN PIXELS -- the board runs at ~1 px per unit length and R() divides by
    exactly the px-per-unit td_mesh emits, so this is what a player sees."""
    lo = [1e9] * 3
    hi = [-1e9] * 3
    moved = 0.0
    p = model["positions"]
    for gi, group in enumerate(model["groups"]):
        m = model["frames"][frame][gi]
        mm = _mat(m) if m else None
        for i in range(group["first"], group["first"] + group["count"]):
            v = (p[i * 3], p[i * 3 + 1], p[i * 3 + 2])
            w = td.apply(mm, v) if mm else v
            d = math.sqrt(sum((w[k] - v[k]) ** 2 for k in range(3)))
            if d > moved:
                moved = d
            for k in range(3):
                if w[k] < lo[k]:
                    lo[k] = w[k]
                if w[k] > hi[k]:
                    hi[k] = w[k]
    return lo, hi, moved * PX_PER_UNIT


def check_strip(unit_id, model):
    """What the strip costs and what it is allowed to do.

    THE BUDGET IS STRUCTURAL, not a number checked here: the cycle is indexed by
    the reload phase, so it occupies the interval exactly whatever the rate. The
    figures printed are what that buys -- the wall time one pose is held, at the
    unit's own rate and again with a full swarm doubling it, which is the case a
    hand-timed animation would have got wrong by 50 %.

    What IS checked: nothing sinks into the road. A group rotating about a
    ground pivot is one sign error away from putting a body under the map, and
    that reads as a hole in the world rather than as a mistake in an animation.
    """
    rest_lo, rest_hi, _ = frame_extent(model, 0)
    worst_z, worst_move = rest_lo[2], 0.0
    for f in range(1, len(model["frames"])):
        lo, hi, moved = frame_extent(model, f)
        worst_z = min(worst_z, lo[2])
        worst_move = max(worst_move, moved)
    sink = (rest_lo[2] - worst_z) * PX_PER_UNIT
    if sink > 3.0:
        raise SystemExit("%s sinks %.1f px below its rest footing" % (unit_id, sink))
    return worst_move


UNIT_RATE = {                  # js/blub.js UNITS[].rate, attacks per second
    "blub1": 1.0, "blub2": 1.25, "blub3": 1.5, "mini1": 3.0, "mini2": 3.0,
    "hungry": 0.75, "cyber": 2.0, "mecha": 2.5, "mecha2": 2.0, "superb": 1.25,
}
SWARM_MAX = 1.0                # BlubTower.swarmCap at A4; doubles the rate


def main():
    flat = "--silhouette" in sys.argv
    tag = "SILHOUETTE" if flat else "full"
    print("building blub units (%s)" % tag)
    total = 0
    for unit_id, fn in UNITS:
        model = build_unit(unit_id, fn, flat)
        check_rest_pose(unit_id, fn, flat, model)
        travel = check_strip(unit_id, model)
        td.write_js(model, "blub-%s.js" % unit_id)
        total += model["triangles"]
        interval = 1.0 / UNIT_RATE[unit_id]
        print("  blub-%-7s %5d tris  r %4.1f px  %2d frames  %d group(s)  "
              "%5.1f ms/pose (%4.1f swarmed)  travel %4.1f px"
              % (unit_id, model["triangles"], R_of(unit_id) * PX_PER_UNIT,
                 len(model["frames"]), len(model["groups"]),
                 interval / CYCLE * 1000.0,
                 interval / (1.0 + SWARM_MAX) / CYCLE * 1000.0, travel))
    print("  %d units, %d triangles total" % (len(UNITS), total))
    print("  rest pose verified against the un-animated build for all %d"
          % len(UNITS))
    if flat:
        print("  *** THESE TEN FILES ARE NOW FLAT GREY. --silhouette is a")
        print("  *** REVIEW build: re-run without it before committing, or the")
        print("  *** game ships grey models. It has happened once already.")


UNIT_FOOTPRINT = {
    "blub1": 10, "blub2": 13, "blub3": 20, "mini1": 10, "mini2": 10,
    "hungry": 25, "cyber": 25, "mecha": 30, "mecha2": 40, "superb": 50,
}


def R_of(unit_id):
    return R(UNIT_FOOTPRINT[unit_id])


if __name__ == "__main__":
    main()
