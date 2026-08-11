# ---------------------------------------------------------------------------
# The Summoner HIMSELF -- l'invocateur. tower_summoner.py builds the ten blubs
# he spits out; this builds the man who traces the circle, his seven bodies and
# the four crosspath marks.
#
#   python tools/blender/summoner_figure.py                 build everything
#   python tools/blender/summoner_figure.py --silhouette    build PASS 1 forms
#
# PASS 1 vs PASS 2, exactly as tower_summoner.py does it: every solid carries
# its real material name from the first line, and `--silhouette` swaps the whole
# palette for one flat grey. Shape is judged first and colour is a palette
# change, not a rebuild, so the two passes cannot drift apart.
#
# THE ARC, and it is the whole reason there are seven bodies:
#
#   base   a plain man on one knee, drawing a chalk circle with his own hand.
#   a3     the GRIMOIRE does it. It hangs in front of him, a second page fanned
#          open, and he has stepped back with his hands off the work.
#   a4     the TOTEM does it. It is planted at the centre of the circle -- his
#          old place -- and he walks the rim, nearly decorative.
#   a5     the circle OVERFLOWS the footprint and he is back on his knees under
#          it, propped on one hand, shoulders uneven, head hanging. A5 is where
#          the brief insists you can already see him losing.
#   b3     an exoskeleton column up his back, cables to shoulders and hips,
#          fist driven into the ground.
#   b4     armour, vents, and his feet LEAVE THE GROUND. Body reared back.
#   b5     a mage-mecha with its arms spread wide.
#
# PATH B IS BUILT ON PATH A, NOT INSTEAD OF IT. B3 requires A2, so every path B
# body carries a BOLTED ENGRAVED STONE PLATE in its chassis and LICHEN in its
# joints -- `_inheritance()` below is called by all three and is not optional.
# It is also the one exemption to "voie B is never porous": the stone and the
# lichen growing in its seams are the only matte surfaces the machines have.
#
# HE REMAINS THE PERFORMER ON PATH B. The grimoire never floats on this side --
# see the mark note below.
#
# GEOMETRY IS AUTHORED IN WORLD SPACE (see td_mesh.build). `parent` picks the
# animated / world-fixed group, it is not a second transform, so every number
# here is a real position on the finished model. Feet at z = 0 on the bodies
# that stand; the two that levitate say so by having nothing at z = 0 but their
# own circle.
#
# WHAT RIDES WHICH GROUP. The man is on `body` and turns with the tower. The
# circle, the runes, the totem and the machine kerb are `world_fixed`, because a
# ritual drawn on the ground does not swivel when he looks somewhere else. That
# split does one more thing for free on A4: he is modelled OFF-CENTRE on the rim
# of a circle whose centre holds the totem, so when the body group turns he
# literally circles it.
#
# THE MARKS. Four small add-ons, each a separate model, each authored in the
# frame of ONE SEAT on the body -- so placing a mark is a translation onto that
# seat and nothing else. A mark may never move a joint, change a proportion or
# shift a pivot, and none of these do: they are drawn over an untouched body.
# SEATS below is the table, printed by main(), and the bodies read their own
# hand/head/hip positions out of the same POSES table the seats come from, so a
# seat cannot drift away from the limb it names.
#
#   a1  the runes of the circle -- STONE plaques with a chalk incision. Stone
#       because on path B this same mark is the engraving on his bolted plates,
#       and inherited stone is the one porous thing a machine is allowed.
#   a2  the grimoire, and it is SUBORDINATE: chrome-plated, shut, on a strap,
#       seated at the hip. It does not float and it does not glow -- a book that
#       glows is a book that is working, and on path B he does the work.
#   b1  a one-handed gauntlet, seated on the right hand.
#   b2  a raised visor with a heads-up pane, seated on the head.
#
# ---------------------------------------------------------------------------
# THE TWO MOTIONS (brief, section 13). See THE STRIP, below, for the layout and
# the runtime mapping; this is what they ARE and why they are not one motion.
#
# THE SUMMONER NEVER FIRES. His blubs do. So there is no attack here and there
# is no muzzle: what this tower does is WAIT and then PRODUCE, and those are the
# two motions -- an idle that runs the whole cycle, and a gesture at the end of
# it. Anything else would be animating a gun that does not exist.
#
# 1. THE IDLE, and it is not decoration. On voie A it is a CHANT whose AMPLITUDE
#    GROWS WITH THE NUMBER OF LIVING UNITS: a man with two blubs out breathes,
#    a man with ten is rocking. That is the tower's only readout on the board --
#    the swarm's size, written on the summoner's own body -- and it is the
#    reason the idle carries a three-step ladder (AGITATION) rather than one
#    fixed amplitude. On voie B he does not chant: he LEVITATES slightly, his
#    hardware drifts, and the servomotors JOLT. A jolt is a discontinuity, not a
#    sine, so it is keyed as one (JOLT) -- a smooth twitch is not a twitch.
#
# 2. THE SUMMONING GESTURE, and WHO PERFORMS IT IS THE CHARACTER ARC. This is
#    the whole reason it is not one clip reused seven times:
#
#      base, A1   the invocateur. He lunges into his own circle.
#      A2, A3     the GRIMOIRE. He steps back, hands off, and the book invokes.
#      A4, A5     the TOTEM (A4) / the OVERFLOWING CIRCLE (A5) on the slow
#                 lines, the grimoire on the fast ones. HE DOES NOTHING.
#      B1 - B5    the invocateur, always. On voie B no object ever takes over,
#                 which is the whole difference between the two sides.
#
#    A2 and A3 are the same statement on two different models, because A2 is the
#    BASE body wearing the a2 mark (see summonerGroup in js/gl/gl-world.js):
#    the base body carries a SECOND gesture band in which he stands off the
#    work, and summoner-mark-a2 -- the hip grimoire -- carries a gesture of its
#    own. At A4 and A5 he owns that mark too, so the grimoire that takes the
#    fast lines at those tiers is the same object, already on his hip.
#
#    A4's totem and A3's floating book are SEPARATE OBJECTS and they get
#    SEPARATE ANIMATED GROUPS. A totem that invoked by being carried on the
#    man's own group would be a totem he was waving, which is the opposite of
#    the tier: the point is that it works while he walks the rim.
#
# THE GRIMOIRE BEATS AT TWO TEMPOS AT ONCE, from A3, and that is what sells the
# overload -- one object obeying two clocks cannot read as a machine on a timer.
# The page block breathes once per loop and the fanned page flutters five times
# in the same loop (PAGE_SLOW / PAGE_FAST, CYCLE / PAGE_BEATS). With the loop
# pinned to 15 s that is the brief's "one about every 15 s, another about every
# 3 s" exactly, and it is why CYCLE is 15 and not the house's 4: 15 is the
# smallest strip that samples a 5:1 pair without either tempo aliasing into the
# other. `main` prints both periods so they are measured, not asserted.
#
# AT A5 HE IS ALREADY LOSING, and the idle has to say so rather than play the
# same chant slower. His is the only body whose idle is keyed on TREMBLE -- an
# uneven, seven-stop jerk with a ROLL in it, so the shoulders never come level
# -- and the only one where the swarm ladder makes him worse instead of louder.
# The three siphon threads are their own group and they SNAP TAUT on the
# gesture: the circle is drinking, and what moves at A5 is the circle's grip.
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
# Copied verbatim from tower_summoner.py: the man and the things he summons have
# to be the same two materials or the tower reads as two unrelated towers.
# Voie A: mate, poreuse, vert mousse / pierre grise / craie-ocre, emission
# FAIBLE et CHAUDE. Voie B: lisse, chrome et bleu profond, accent cyan, emission
# FORTE et FROIDE. A never emits cold light; B never shows a porous surface
# except on its inherited stone.
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


# --- the value ladders ------------------------------------------------------
# Separated by VALUE first and hue second, and the LARGEST surface takes the
# DARKEST value. On path A that is the trousers and the tunic; the sleeves sit a
# clear step above the tunic so an arm crossing the chest still reads, and only
# the sash, the skin and the chalk are bright. Luminances, roughly:
#   dark .12 -> moss_dark .32 -> moss .46 -> ochre .55 -> flesh .71 -> chalk .84
# On path B the bodysuit is the big surface and it is the darkest thing that is
# not a cable; plates, rims and the cyan run up from there:
#   dark .12 -> deep_blue .30 -> chrome_dk .37 -> steel_bru .47 -> chrome .60
MAT_A = {
    "leg": "dark", "knee": "moss_dark", "foot": "stone_dark",
    "torso": "moss_dark", "hem": "moss_dark", "belt": "ochre",
    "arm": "moss", "elbow": "moss_dark", "hand": "flesh",
    # The jaw and the neck are the SHADOW under a face, not a second skin. Run
    # as ochre they came out a gold chin, which at 55 px reads as a beard made
    # of brass. There is no darker flesh in the shared palette, so the shadow
    # borrows the neutral one.
    "skin": "flesh", "skin_dk": "stone_dark", "hair": "dark",
    "shoulder": "moss_dark",
}

MAT_B = {
    "leg": "deep_blue", "knee": "dark", "foot": "chrome_dk",
    "torso": "deep_blue", "hem": "chrome_dk", "belt": "chrome_dk",
    "arm": "deep_blue", "elbow": "dark", "hand": "flesh",
    "skin": "flesh", "skin_dk": "chrome_dk", "hair": "dark",
    "shoulder": "steel_bru",
}

GROUND_R = R(25)               # 0.786 -- the Summoner's own footprint radius
CIRCLE_R = GROUND_R * 0.80     # the chalk ring, comfortably inside it


# --- small geometry helpers -------------------------------------------------

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


def taper(s, name, a, b, r_a, r_b, mat, parent, verts=6, alt=None):
    """A frustum laid along the segment a -> b. This is the workhorse: limbs,
    torsos, the totem shaft and the exo column are all the same call, so a pose
    is a list of points and nothing has to be re-derived by hand."""
    rot, length = _axis(a, b)
    return td.frustum(s, name, r_a, r_b, length, _mid(a, b), mat, parent, verts,
                      rot, alt)


def plate(s, name, at, look, size, mat, parent, pitch=0.0):
    """A box whose local +X is turned to face `look`. `size` is
    (along look, across, up), which is how a plate is actually thought about."""
    lx, ly, _ = _norm(look)
    return td.box(s, name, size, at, (0.0, pitch, math.atan2(ly, lx)), mat,
                  parent)


def foot(s, name, ankle, toe, width, height, mat, parent):
    dx, dy = toe[0] - ankle[0], toe[1] - ankle[1]
    length = math.hypot(dx, dy) + 0.09
    return td.box(s, name, (length, width, height), _mid(ankle, toe),
                  (0.0, 0.0, math.atan2(dy, dx)), mat, parent)


# ---------------------------------------------------------------------------
# WHAT WAS REVIEWED, and where. All at viewport 1278x719, drawn at the board's
# own yaw (-pi) unless a profile is named, in visual-pass/captures:
#
#   sum-base-lunge-PROFILE          the lunge, in profile: rest, anticipation
#                                   BACK at frame 47, driven forward and DOWN
#                                   over the ring at 51. This is what caught the
#                                   inverted rx -- see `nod`.
#   sum-a3-tempo-FAST-16to19        four consecutive idle frames: the fanned
#                                   page completes a whole flap and comes back
#                                   (16 and 19 match), the block does not move.
#   sum-a3-tempo-SLOW-every3rd      the same band sampled every THIRD frame, so
#                                   the page is frozen at one phase of its flap
#                                   and only the block can change. It does.
#   sum-a4-totem-yaw0-vs-yawpi      the totem at yaw 0 (how world_fixed is
#                                   drawn) is a blank slab; at yaw -pi (how an
#                                   animated group is drawn) its eyes and mouth
#                                   face the player.
#   sum-a4-GESTURE-totem            the totem lifts and turns while he walks.
#   sum-base-LADDER-swarm           one chant phase at x0.55 / x1.00 / x1.70.
#   sum-ARC-gesture-peaks           all seven performers at their own peak.
#   sum-mark-a2-GESTURE-book-opens  the shut book cracking open, plate first.
#   sum-b4-IDLE-levitation          the rise and fall against the lift ring.
#   sum-BOARD-drawActor-posed       the REAL draw path, not the review one:
#                                   gl-world's drawActor with the world_fixed
#                                   group split off at yaw 0. The circles and
#                                   the pot stay planted; the figure and the
#                                   totem move.
#
# ---------------------------------------------------------------------------
# THE STRIP. One rest frame, then BANDS of CYCLE poses each.
#
#   frame 0                      REST, and rest is the IDENTITY (see set_pose).
#   frame 1 + band*CYCLE + i     band `band`, phase i / CYCLE.
#
#   band 0 .. IDLE_BANDS-1       the idle, one band per rung of the swarm
#                                ladder. AGITATION[band] is its amplitude.
#   band IDLE_BANDS ..           the gesture(s). Every body has one; the BASE
#                                body has two, because base/A1/B1/B2 draw the
#                                same model as A2 and only A2 stands back.
#
# WHY THE PHASE IS i / CYCLE AND NEVER i / (CYCLE - 1). Every band is a LOOP.
# Sampling to 1.0 plays the last pose and the first back to back and swallows
# the accent the loop is built around -- the same reasoning tower_summoner.py
# records for its reload cycle, and it is worth the same here.
#
# THE DURATION BUDGET IS THE RUNTIME'S, AND IT CANNOT BE OVERRUN. The brief
# gives the gesture 0.3 s on a 4 s line, 1.5-2 s on a 15-30 s line and 4 s on a
# 95 s line, and says an animation may never outlast its interval. That is a
# rate, not a pose count, so it lives in GESTURE_SECONDS and is CLAMPED to a
# fraction of the interval as well as to the table -- a summoner whose interval
# is floored to BlubTower.MIN_INTERVAL_SECONDS (0.5 s) still cannot be caught
# mid-gesture when the next body arrives. `main` prints the table for every
# interval js/blub.js actually uses, so this is measured, not claimed.
#
# ---------------------------------------------------------------------------
# THE RUNTIME MAPPING, and the patch that has to match it.
#
# It is NOT WIRED YET, deliberately: js/gl/gl-world.js is not this agent's file
# and five scripts are in flight against it. Until the patch lands the summoner
# is drawn at frame 0, which -- because frame 0 is the identity on every group
# -- is the model that shipped before this change, triangle for triangle. That
# is checked at build time by `check_rest_pose`, not promised.
#
# A BlubTower has NEITHER `gearPhase` NOR `swingProgress` (verified live: both
# are undefined on a placed tower), so it currently never leaves frame 0 and the
# two gearPhase/swingProgress branches in the tower loop do not fire for it. It
# does publish everything needed, all read-only, all already drawn by the panel:
# `lineProgress(lineId)` 0..1, `intervalFor(unitId)`, `lineUnits()`,
# `lineIsEnabled(lineId)` and `blubCount()`.
#
#     var SUM_CYCLE = 15, SUM_IDLE_BANDS = 3;
#
#     // The Summoner never fires, so its strip is not a reload: it is the
#     // SUMMON cycle. The idle runs off the wall clock and steps its amplitude
#     // with the swarm; the gesture is the last GESTURE_SECONDS of whichever
#     // enabled line is nearest to producing a body.
#     if (m && m.frames.length > 1 && t.constructor.ID === "blub") {
#       var bands  = Math.max(1, Math.round((m.frames.length - 1) / SUM_CYCLE));
#       var n      = t.blubCount();
#       var iband  = n >= 8 ? 2 : (n >= 3 ? 1 : 0);
#       var iphase = ((state.now || 0) / 15) % 1;            // the 15 s loop
#       frame = 1 + iband * SUM_CYCLE + Math.floor(iphase * SUM_CYCLE);
#       var best = null;                                     // seconds to go
#       for (var li = 0; li < BlubTower.LINE_IDS.length; li++) {
#         var lid = BlubTower.LINE_IDS[li];
#         if (!t.lineIsEnabled(lid)) continue;               // a held line does
#         var uid = t.lineUnits()[lid];                      // not gesture
#         if (!uid) continue;
#         var iv = t.intervalFor(uid);
#         var left = (1 - t.lineProgress(lid)) * iv;
#         var win = summonGestureSeconds(iv);                // the table below
#         if (left <= win && (best === null || left < best.left)) {
#           best = { left: left, win: win, uid: uid };
#         }
#       }
#       if (best) {
#         // WHICH gesture band. The base body's second band is "he stands
#         // back", and only A2 uses it -- A1, B1 and B2 draw the same model and
#         // must keep the first. Every other body has one band and ignores this.
#         var gband = (bands > SUM_IDLE_BANDS + 1 && t.hasUpgrade("A2")
#                      && !t.hasUpgrade("A3")) ? 1 : 0;
#         var gp = 1 - best.left / best.win;                 // 0 -> 1 at summon
#         frame = 1 + (SUM_IDLE_BANDS + gband) * SUM_CYCLE
#               + Math.min(SUM_CYCLE - 1, Math.floor(gp * SUM_CYCLE));
#       }
#     }
#
# A FAULT THIS ANIMATION PASS TURNED UP AND DID NOT CAUSE, recorded here
# because SEATS is this file's table and the fix needs it:
#
#   THE CROSSPATH MARKS ARE DRAWN AT THE TOWER'S FOOT, NOT ON THEIR SEATS.
#   Each mark is authored around ITS OWN ORIGIN, which is correct and is what
#   "placed by TRANSLATION ONLY" means -- but nothing ever applies the
#   translation. gl-world.js:917 draws a mark at the body's own transform:
#       drawActor(marks[mi], t.x + kx, t.y + ky, drawYaw, 1, tz, 0);
#   with no seat offset, and its comment ("Authored around their own seat, so
#   they need no offset here") does not match what is in these models.
#   Composited exactly the way that line composites them, the a2 grimoire lies
#   on the ground inside the chalk ring and the b2 visor lies beside it, both at
#   the model origin instead of on the hip and the head.
#
#   It is NOT caused by the strip: frame 0 is the identity and check_rest_pose
#   diffs it against a frames=0 build, so these marks are the vertices they have
#   always been. It predates this pass and it is why a2's animation cannot be
#   judged in place yet.
#
#   THE FIX BELONGS IN THE RUNTIME, because one mark model has to sit on SEVEN
#   different seats -- one per body -- so no authored position can serve. The
#   table is already computed and printed by `main`; emitting it as JSON beside
#   the models, exactly as siphon_idol.py emits siphon_origins.json for the beam
#   origin, would make the draw-side change a lookup and an added offset.
#
# and the marks, which gl-world currently draws at a hard 0:
#
#     -   drawActor(marks[mi], t.x + kx, t.y + ky, drawYaw, 1, tz, 0);
#     +   drawActor(marks[mi], t.x + kx, t.y + ky, drawYaw, 1, tz,
#     +               (marks[mi] === "summoner-mark-a2" && bookInvokes) ?
#     +               frame : 0);
#
# where `bookInvokes` is A2/A4/A5 on voie A. ON VOIE B THE BOOK STAYS AT 0, and
# that is not an oversight: "le grimoire ne flotte jamais de ce cote", so the
# same mark worn over a machine is the inert object it has always been. The
# model carries the frames either way; the runtime decides who is allowed to
# use them, and frame 0 is the identity, so an unused strip costs nothing.
# ---------------------------------------------------------------------------

CYCLE = 15                     # poses per band. See the two-tempo note above.
IDLE_BANDS = 3                 # calm / stirred / frantic
IDLE_LOOP_SECONDS = 15.0       # what the runtime paces one idle band at

# The swarm ladder. Amplitude multipliers for the three idle bands, and the
# blub counts the runtime steps between them. The bottom rung is a BREATH and
# the top is a man rocking; if the middle were 1.0 either side of nothing there
# would be no ladder to read.
AGITATION = (0.55, 1.00, 1.70)
SWARM_STEPS = (3, 8)           # >= 3 blubs -> band 1, >= 8 -> band 2

# The brief's budget, as (interval seconds, gesture seconds) stops. Linear
# between them, and never more than GESTURE_MAX_SHARE of the interval.
GESTURE_SECONDS_STOPS = [(0.5, 0.15), (4.0, 0.30), (15.0, 1.50),
                         (30.0, 2.00), (95.0, 4.00), (200.0, 4.00)]
GESTURE_MAX_SHARE = 0.40


def gesture_seconds(interval):
    """How long the gesture is allowed to run on a line of this interval."""
    return min(keys(interval, GESTURE_SECONDS_STOPS),
               interval * GESTURE_MAX_SHARE)


def keys(t, stops):
    """Sample a curve given as (phase, value) stops, linear between them.

    Linear on purpose, and the easing lives in WHERE the stops sit -- an accent
    that owns a tenth of the band and a recovery that owns a third are two key
    positions, not two frame counts. Smoothing between stops flattens the
    velocity at every key, which is exactly what makes a loop read as sticky.
    """
    if t <= stops[0][0]:
        return stops[0][1]
    for i in range(len(stops) - 1):
        t0, v0 = stops[i]
        t1, v1 = stops[i + 1]
        if t <= t1:
            return v0 + (v1 - v0) * ((t - t0) / ((t1 - t0) or 1e-9))
    return stops[-1][1]


def beat(t, n, stops):
    """`stops` sampled n times across one band -- the fast half of a two-tempo
    pair.

    IF n DIVIDES CYCLE, PUT THE STOPS ON THE SAMPLE GRID. n = 5 against
    CYCLE = 15 gives three samples per beat, at phases 0, 1/3 and 2/3, and a
    curve whose peak sits anywhere else is simply never drawn: the first CHANT
    here peaked at 0.22 and the strip sampled 0.58, so the chant shipped at 58 %
    of the amplitude it was written with and no amount of tuning the number
    would have found it. The fast curves below therefore key on thirds. This is
    the one place where "the easing lives in where the stops are" has to give
    way to the sampling.

    IF n DOES NOT DIVIDE CYCLE the opposite is true and it is deliberate --
    see TREMBLE_BEATS.
    """
    return keys((t * n) % 1.0, stops)


def strip(frame):
    """(band, phase) for a strip frame, or None for the rest frame."""
    if frame <= 0:
        return None
    i = (frame - 1) % CYCLE
    return ((frame - 1) // CYCLE, i / float(CYCLE))


def set_pose(node, pivot, rot=(0.0, 0.0, 0.0), shift=(0.0, 0.0, 0.0)):
    """Turn a group about `pivot`, then slide it by `shift`.

    The pivot correction is folded into the node's OWN location, and that is the
    whole trick: at rest -- no rotation, no shift -- the location comes out
    exactly (0, 0, 0), the group's matrix is the identity, and td_mesh's
    group-local storage collapses to world space. So THE VERTICES ON DISK ARE
    THE ONES THE UN-ANIMATED BUILD WROTE.

    That is not a nicety. Every path that draws a summoner without asking for a
    pose depends on it: gl-world's crosspath-mark overlay (frame 0, hard-coded),
    TDObs.showcase, and every silhouette contact sheet this file has ever been
    reviewed on. Parking an empty AT the pivot instead -- the way
    tower_warbringer.py rigs its shoulder -- bakes the pivot into the rest
    matrix and offsets every vertex on disk by it. Same motion; that one breaks
    all three. `check_rest_pose` fails the build on a single differing
    coordinate rather than trusting this paragraph.
    """
    m = td.trs((0.0, 0.0, 0.0), rot)
    p = td.apply(m, pivot)
    node.rotation = [rot[0], rot[1], rot[2]]
    node.location = [pivot[0] - p[0] + shift[0],
                     pivot[1] - p[1] + shift[1],
                     pivot[2] - p[2] + shift[2]]


def rest_pose(*nodes):
    for n in nodes:
        n.rotation = [0.0, 0.0, 0.0]
        n.location = [0.0, 0.0, 0.0]


def nod(amount):
    """A lean, signed so that POSITIVE IS FORWARD -- towards +Y, the front every
    body in this file is authored on.

    THE SIGN IS NOT OBVIOUS AND IT WAS WRONG IN NINE PLACES ONCE. td_mesh.trs
    composes Rz * Ry * Rx, so under a positive rx a point above the pivot goes
    to -Y: the raw parameter leans a figure BACKWARD. Every lean below reads as
    prose -- "he drives down into the circle", "he rocks back off the work" --
    and prose that says forward while the number says backward is a bug nobody
    catches by reading. So the flip happens once, here, and every rx in the file
    goes through it.

    Verified in the browser rather than derived on paper: base frame 51 (the
    peak of the lunge) drops the head towards the ring and frame 47 (the
    anticipation stop) lifts it away, seen in profile at the board's own yaw.
    """
    return -amount


# --- the curves -------------------------------------------------------------
# Read down this block and every motion in the file is visible in one place.

# THE CHANT, voie A. One sway, five to a band -- a 3 s sway inside the 15 s
# loop, so three poses each: forward, back past neutral, home. It is NOT
# symmetric -- the recovery overshoots to -0.85 and never matches the +1.00 --
# which with the BREATH modulation under it is what stops five identical sways
# reading as a metronome.
CHANT = [(0.00, 0.00), (1 / 3.0, 1.00), (2 / 3.0, -0.85), (1.00, 0.00)]
CHANT_BEATS = 5

# The slow modulation UNDER the chant, once per band. Five identical sways is a
# metronome however good one sway is; this is the same trick the grimoire's two
# tempos use, spent on the body for free.
BREATH = [(0.00, 0.00), (0.30, 1.00), (0.62, -0.35), (1.00, 0.00)]

# A5's idle. Seven stops, none of them even, and it never returns to neutral in
# the middle -- he is not swaying, he is failing to hold still.
#
# FOUR BEATS AGAINST FIFTEEN FRAMES, AND THE FACT THAT IT DOES NOT DIVIDE IS
# THE POINT. 15/4 is 3.75, so no two of the fifteen frames land on the same
# phase of the curve and the band never repeats a pose inside itself. Every
# other loop in this file wants its beats to divide CYCLE so the poses are
# clean; this one is the tremble, and a tremble that repeats every third frame
# is a vibration. It is the only curve here deliberately out of step.
TREMBLE = [(0.00, 0.00), (0.10, 0.85), (0.18, -0.30), (0.30, 0.55),
           (0.44, -0.70), (0.58, 0.25), (0.76, -0.95), (1.00, 0.00)]
TREMBLE_BEATS = 4

# VOIE B. A float that is nearly a sine, and a JOLT that is nearly a step. The
# jolt sits still for a third of its beat and then moves in one sample: a
# servomotor twitch is a discontinuity, and easing it turns it into a nod.
FLOAT = [(0.00, 0.00), (0.28, 1.00), (0.55, 0.20), (0.80, -0.90), (1.00, 0.00)]
FLOAT_BEATS = 3
JOLT = [(0.00, 0.00), (0.26, 0.00), (0.34, 1.00), (0.46, -0.45),
        (0.60, 0.12), (0.78, 0.00), (1.00, 0.00)]
JOLT_BEATS = 5

# THE TWO PAGE TEMPOS. Slow once per band (15 s), fast five times (3 s).
# Fifteen samples for the slow one, three for the fast, so the fast one keys on
# thirds: SHUT -> FLUNG OPEN -> falling back. Three poses is all a page flap
# gets and all it needs.
PAGE_SLOW = [(0.00, 0.00), (0.34, 1.00), (0.68, 0.18), (1.00, 0.00)]
PAGE_FAST = [(0.00, 0.00), (1 / 3.0, 1.00), (2 / 3.0, 0.28), (1.00, 0.00)]
PAGE_BEATS = 5

# THE GESTURES. A band, not a loop: it starts at rest, lands its accent where
# the body arrives, and returns to rest so the seam back into the idle is not a
# jump. The anticipation is the negative stop near the front of each.
LUNGE = [(0.00, 0.00), (0.10, -0.32), (0.30, 1.00), (0.46, 0.86),
         (0.66, 0.30), (0.86, -0.08), (1.00, 0.00)]
WITHDRAW = [(0.00, 0.00), (0.14, 0.90), (0.50, 1.00), (0.80, 0.72),
            (1.00, 0.00)]
FLARE = [(0.00, 0.00), (0.08, -0.22), (0.26, 1.00), (0.44, 0.52),
         (0.64, 0.84), (0.86, 0.22), (1.00, 0.00)]
SNAP = [(0.00, 0.00), (0.10, 1.00), (0.22, 0.18), (0.38, 0.64),
        (0.62, 0.12), (0.84, -0.10), (1.00, 0.00)]

# How many gesture bands each body carries. Only the BASE body has two, and the
# reason is summonerGroup: base, A1, B1 and B2 are all drawn as `summoner-base`
# and only A2 stands back from the work.
GESTURE_BANDS = {"base": 2}


def bands_of(tier):
    return IDLE_BANDS + GESTURE_BANDS.get(tier, 1)


def strip_length(tier):
    return 1 + bands_of(tier) * CYCLE


# --- the man ----------------------------------------------------------------
# One builder, seven poses. Everything below reads its points out of POSES, so
# the marks' seats and the limbs they sit on are the same numbers.

def _legs(s, body, p, m, thick=0.095, knees=True):
    for tag in ("l", "r"):
        hip, knee = p["hip_" + tag], p["knee_" + tag]
        ankle, toe = p["ankle_" + tag], p["toe_" + tag]
        taper(s, "thigh_" + tag, hip, knee, thick, thick * 0.76, m["leg"], body, 6)
        taper(s, "shin_" + tag, knee, ankle, thick * 0.72, thick * 0.58,
              m["leg"], body, 6)
        # A bare knee needs a joint solid or the leg folds into a crease. An
        # armoured one has a plate over it and the ball is 20 triangles of
        # nothing, which is where path B's budget goes instead.
        if knees:
            td.ball(s, "knee_" + tag, thick * 0.80, knee, m["knee"], body, 5, 3)
        foot(s, "foot_" + tag, ankle, toe, thick * 1.5, 0.10, m["foot"], body)


def _arms(s, body, p, m, thick=0.078, hands=True, deltoid=True, elbows=True):
    for tag in ("l", "r"):
        sh, el, hand = p["sh_" + tag], p["el_" + tag], p["hand_" + tag]
        if deltoid:
            td.ball(s, "deltoid_" + tag, thick * 1.5, sh, m["shoulder"], body,
                    5, 3)
        taper(s, "upper_" + tag, sh, el, thick, thick * 0.86, m["arm"], body, 6)
        taper(s, "fore_" + tag, el, hand, thick * 0.82, thick * 0.68,
              m["arm"], body, 6)
        if elbows:
            td.ball(s, "elbow_" + tag, thick * 0.88, el, m["elbow"], body, 5, 3)
        if hands:
            td.ball(s, "fist_" + tag, thick * 0.95, hand, m["hand"], body, 5, 3)


def _torso(s, body, p, m, girth=1.0, hem=True):
    pelvis, chest = p["pelvis"], p["chest"]
    td.box(s, "hips", (0.26 * girth, 0.34 * girth, 0.18), pelvis, (0, 0, 0),
           m["belt"], body)
    taper(s, "trunk", pelvis, chest, 0.165 * girth, 0.195 * girth, m["torso"],
          body, 8)
    # The belt is a short collar on the trunk's own axis, so it cannot slide off
    # a leaning torso the way a horizontal band would.
    low = _lerp(pelvis, chest, 0.06)
    high = _lerp(pelvis, chest, 0.20)
    taper(s, "belt", low, high, 0.185 * girth, 0.185 * girth, m["belt"], body, 8)
    if hem:
        # A short tunic skirt: the largest single surface on path A, and the
        # reason the trousers below it are the darkest value on the model.
        # Kept NARROW and SHORT on purpose -- at 0.235 it flared into the same
        # width as his shoulders and the whole figure read as one barrel with a
        # head on it, which is the failure a value ladder cannot rescue.
        skirt = _lerp(pelvis, chest, -0.46)
        taper(s, "skirt", skirt, low, 0.212 * girth, 0.185 * girth, m["torso"],
              body, 8)


def _head(s, body, p, m, helm=None, visor=None):
    at, look = p["head"], _norm(p["look"])
    neck = _lerp(p["chest"], at, 0.42)
    taper(s, "neck", neck, _lerp(p["chest"], at, 0.88), 0.062, 0.070,
          m["skin_dk"], body, 5)
    if helm:
        td.ellipsoid(s, "helm", (0.235, 0.235, 0.255), at, helm, body,
                     (0, 0, 0), 6, 4)
        plate(s, "helm_crest", (at[0] - look[0] * 0.05, at[1] - look[1] * 0.05,
                                at[2] + 0.13), look, (0.20, 0.07, 0.09),
              m["shoulder"], body)
        plate(s, "visor", (at[0] + look[0] * 0.16, at[1] + look[1] * 0.16,
                           at[2] + 0.01), look, (0.06, 0.21, 0.055),
              visor, body)
    else:
        td.ellipsoid(s, "skull", (0.200, 0.200, 0.240), at, m["skin"], body,
                     (0, 0, 0), 8, 4)
        plate(s, "jaw", (at[0] + look[0] * 0.05, at[1] + look[1] * 0.05,
                         at[2] - 0.10), look, (0.15, 0.15, 0.085),
              m["skin_dk"], body)
        plate(s, "hair", (at[0] - look[0] * 0.035, at[1] - look[1] * 0.035,
                          at[2] + 0.105), look, (0.20, 0.21, 0.095),
              m["hair"], body)
        # A brow band rather than eyes: at ~20 px across, two dots are noise and
        # a shadowed brow is the thing that actually reads as a face.
        plate(s, "brow", (at[0] + look[0] * 0.155, at[1] + look[1] * 0.155,
                          at[2] + 0.045), look, (0.07, 0.185, 0.05),
              m["hair"], body)

def figure(s, body, p, m, girth=1.0, helm=None, visor=None, hem=True,
           armoured=False, fists=True, deltoid=True):
    """`armoured` is path B: plates cover the knees and elbows, so the joint
    solids come off and the triangles go into the plates instead."""
    _legs(s, body, p, m, knees=not armoured)
    _torso(s, body, p, m, girth, hem)
    _arms(s, body, p, m, hands=fists, deltoid=deltoid, elbows=not armoured)
    _head(s, body, p, m, helm, visor)


# --- the ground -------------------------------------------------------------
# NOTHING HERE IS PAINT. The map draws its deck zones proud of the ground plane,
# so a flat mark at z ~ 0 is buried under the tile it is supposed to be lying on
# (the lesson tower_warbringer.py's fracture ring paid for). Every ring below is
# a real solid at least 0.05 units tall.

def _chalk_circle(s, fixed, radius, ticks=6, mat="chalk"):
    td.torus(s, "circle", radius, 0.036, (0, 0, 0.042), (0, 0, 0), mat, fixed,
             12, 4)
    for i in range(ticks):
        a = math.tau * i / ticks + 0.26
        td.box(s, "tick_%d" % i, (0.17, 0.045, 0.05),
               (math.cos(a) * (radius + 0.11), math.sin(a) * (radius + 0.11),
                0.035), (0, 0, a), mat, fixed)


def _machine_kerb(s, fixed, radius):
    """Path B's circle. He did not stop doing the ritual, he had it MACHINED:
    the same ring, cut in the inherited stone and clamped down with chrome."""
    td.torus(s, "kerb", radius, 0.048, (0, 0, 0.052), (0, 0, 0), "stone",
             fixed, 8, 4)
    for i in range(4):
        a = math.tau * i / 4 + math.pi / 4
        td.box(s, "clamp_%d" % i, (0.15, 0.11, 0.07),
               (math.cos(a) * radius, math.sin(a) * radius, 0.075), (0, 0, a),
               "chrome_dk", fixed)
    for i in range(2):
        a = math.pi * i + math.pi / 2
        td.box(s, "kerb_lamp_%d" % i, (0.09, 0.16, 0.035),
               (math.cos(a) * radius, math.sin(a) * radius, 0.098), (0, 0, a),
               "cyan", fixed)


# --- path B's mandatory inheritance -----------------------------------------

def _inheritance(s, body, plate_at, plate_look, joints, size=0.20):
    """A BOLTED ENGRAVED STONE PLATE and LICHEN IN THE JOINTS, on every path B
    body without exception. B3 costs A2, so the machine is standing on two tiers
    of ritual it never paid off: the plate is a piece of his old circle bolted
    into the chassis, and the lichen is what has grown back into the seams.

    It is also the only matte surface path B is allowed -- see the palette note
    at the top -- which is why the plate is `stone` and never `steel_bru`.
    """
    lx, ly, _ = _norm(plate_look)
    plate(s, "heritage_stone", plate_at, plate_look, (0.055, size, size * 0.86),
          "stone", body)
    # The engraving: two cut lines, sunk proud of the face so they survive as a
    # mark rather than as a texture nobody rendered. Cut in the SAME STONE one
    # value down -- filling them with ochre put a porous pigment on a machine,
    # and the plate's exemption covers the stone, not a paint job.
    for i, dz in enumerate((-size * 0.22, size * 0.22)):
        plate(s, "heritage_cut_%d" % i,
              (plate_at[0] + lx * 0.035, plate_at[1] + ly * 0.035,
               plate_at[2] + dz), plate_look, (0.02, size * 0.72, size * 0.10),
              "stone_dark", body)
    for i in range(4):
        a = math.tau * i / 4 + math.pi / 4
        plate(s, "heritage_bolt_%d" % i,
              (plate_at[0] + lx * 0.028 - ly * math.cos(a) * size * 0.36,
               plate_at[1] + ly * 0.028 + lx * math.cos(a) * size * 0.36,
               plate_at[2] + math.sin(a) * size * 0.34), plate_look,
              (0.03, 0.038, 0.038), "chrome", body)
    for i, j in enumerate(joints):
        td.ball(s, "heritage_lichen_%d" % i, 0.052, j, "lichen", body, 4, 3)


# ---------------------------------------------------------------------------
# THE POSES. Facing is +Y. `look` is where the head is pointed and is what puts
# the face, the brow and the hair on the right side of the skull.
# ---------------------------------------------------------------------------

def _pose(**kw):
    return kw


POSES = {
    # A plain man on one knee, right knee down, left forearm on his raised
    # knee, right hand ON THE GROUND with the chalk. Head bowed at the work.
    "base": _pose(
        pelvis=(0.00, -0.06, 0.56), chest=(0.02, 0.20, 1.00),
        head=(0.05, 0.36, 1.21), look=(0.05, 0.62, -0.78),
        hip_l=(0.14, -0.04, 0.55), knee_l=(0.19, 0.30, 0.44),
        ankle_l=(0.21, 0.24, 0.10), toe_l=(0.21, 0.42, 0.055),
        hip_r=(-0.14, -0.07, 0.54), knee_r=(-0.17, 0.14, 0.13),
        ankle_r=(-0.17, -0.30, 0.12), toe_r=(-0.17, -0.46, 0.07),
        sh_l=(0.21, 0.17, 1.01), el_l=(0.31, 0.32, 0.72),
        hand_l=(0.25, 0.36, 0.50),
        sh_r=(-0.21, 0.17, 1.01), el_r=(-0.31, 0.40, 0.70),
        hand_r=(-0.25, 0.60, 0.19)),

    # Standing, hands OFF the work: one hanging, one up at the chin. The book
    # in front of him is doing what he used to do with the chalk.
    "a3": _pose(
        pelvis=(0.00, -0.01, 0.92), chest=(0.00, 0.02, 1.32),
        head=(0.00, 0.03, 1.56), look=(0.0, 0.96, 0.28),
        hip_l=(0.13, 0.00, 0.90), knee_l=(0.15, 0.04, 0.48),
        ankle_l=(0.16, -0.01, 0.09), toe_l=(0.16, 0.16, 0.05),
        hip_r=(-0.13, 0.00, 0.90), knee_r=(-0.15, 0.02, 0.48),
        ankle_r=(-0.16, -0.03, 0.09), toe_r=(-0.16, 0.14, 0.05),
        sh_l=(0.22, 0.01, 1.36), el_l=(0.30, 0.09, 1.09),
        hand_l=(-0.07, 0.26, 1.05),
        sh_r=(-0.22, 0.01, 1.36), el_r=(-0.30, 0.09, 1.09),
        hand_r=(0.09, 0.25, 0.99)),

    # ON THE RIM, mid-stride, head turned in at the totem that took his place.
    # The offsets are literal: he stands 0.46 off centre, which is where the
    # body group's rotation turns walking into circling.
    "a4": _pose(
        pelvis=(-0.54, 0.05, 0.90), chest=(-0.55, 0.06, 1.30),
        head=(-0.54, 0.05, 1.54), look=(0.96, -0.14, 0.06),
        hip_l=(-0.41, 0.05, 0.88), knee_l=(-0.39, 0.27, 0.48),
        ankle_l=(-0.38, 0.39, 0.10), toe_l=(-0.38, 0.55, 0.05),
        hip_r=(-0.67, 0.05, 0.88), knee_r=(-0.69, -0.09, 0.47),
        ankle_r=(-0.70, -0.23, 0.13), toe_r=(-0.70, -0.35, 0.06),
        sh_l=(-0.33, 0.05, 1.34), el_l=(-0.28, -0.11, 1.07),
        hand_l=(-0.30, -0.22, 0.83),
        sh_r=(-0.76, 0.05, 1.34), el_r=(-0.81, 0.18, 1.06),
        hand_r=(-0.76, 0.30, 0.86)),

    # BROKEN. Both knees down, hips dragged back, trunk folded almost flat,
    # propped on the right hand, left arm hanging dead. The shoulders are NOT
    # level and the two knees are NOT square -- that asymmetry is the tremble,
    # and it is the only thing that makes a kneeling man read as a failing one.
    "a5": _pose(
        pelvis=(0.00, -0.18, 0.40), chest=(0.05, 0.10, 0.79),
        head=(0.07, 0.23, 0.87), look=(0.10, 0.42, -0.90),
        hip_l=(0.15, -0.16, 0.40), knee_l=(0.19, 0.12, 0.13),
        ankle_l=(0.19, -0.34, 0.11), toe_l=(0.19, -0.50, 0.06),
        hip_r=(-0.15, -0.21, 0.39), knee_r=(-0.21, 0.05, 0.13),
        ankle_r=(-0.21, -0.41, 0.11), toe_r=(-0.21, -0.57, 0.06),
        sh_l=(0.21, 0.05, 0.83), el_l=(0.31, 0.11, 0.52),
        hand_l=(0.33, 0.19, 0.23),
        sh_r=(-0.18, 0.11, 0.77), el_r=(-0.28, 0.33, 0.47),
        hand_r=(-0.24, 0.52, 0.09)),

    # Fist to the ground. Front foot planted, back knee down, the whole frame
    # loaded forward onto the fist -- a man being braced by a machine.
    "b3": _pose(
        pelvis=(0.00, -0.10, 0.66), chest=(0.02, 0.10, 1.05),
        head=(0.04, 0.17, 1.27), look=(0.05, 0.90, 0.12),
        hip_l=(0.15, -0.08, 0.66), knee_l=(0.22, 0.34, 0.46),
        ankle_l=(0.22, 0.30, 0.10), toe_l=(0.22, 0.48, 0.06),
        hip_r=(-0.15, -0.12, 0.65), knee_r=(-0.20, 0.10, 0.16),
        ankle_r=(-0.20, -0.34, 0.13), toe_r=(-0.20, -0.50, 0.07),
        sh_l=(0.24, 0.08, 1.07), el_l=(0.34, 0.21, 0.77),
        hand_l=(0.30, 0.34, 0.51),
        sh_r=(-0.24, 0.08, 1.07), el_r=(-0.35, 0.29, 0.71),
        hand_r=(-0.30, 0.46, 0.12)),

    # AIRBORNE. Nothing on this body touches z = 0: the lowest thing is a boot
    # at 0.30. Chest behind the pelvis and the chin up -- reared back, being
    # lifted rather than jumping.
    "b4": _pose(
        pelvis=(0.00, 0.02, 1.06), chest=(0.00, -0.16, 1.44),
        head=(0.01, -0.25, 1.66), look=(0.0, 0.72, 0.69),
        hip_l=(0.15, 0.04, 1.05), knee_l=(0.19, 0.32, 0.78),
        ankle_l=(0.19, 0.16, 0.42), toe_l=(0.19, 0.32, 0.35),
        hip_r=(-0.15, 0.04, 1.05), knee_r=(-0.19, 0.30, 0.76),
        ankle_r=(-0.19, 0.12, 0.40), toe_r=(-0.19, 0.28, 0.33),
        sh_l=(0.27, -0.14, 1.46), el_l=(0.39, 0.03, 1.19),
        hand_l=(0.34, 0.25, 1.01),
        sh_r=(-0.27, -0.14, 1.46), el_r=(-0.39, 0.03, 1.19),
        hand_r=(-0.34, 0.25, 1.01)),

    # ARMS SPREAD WIDE, still off the ground, and taller than a man now: the
    # helm crown lands near 1.95 where the base body tops out at 1.30.
    "b5": _pose(
        pelvis=(0.00, 0.00, 1.14), chest=(0.00, -0.02, 1.56),
        head=(0.00, 0.00, 1.79), look=(0.0, 0.98, 0.12),
        hip_l=(0.17, 0.00, 1.12), knee_l=(0.21, 0.18, 0.80),
        ankle_l=(0.21, 0.06, 0.48), toe_l=(0.21, 0.24, 0.42),
        hip_r=(-0.17, 0.00, 1.12), knee_r=(-0.21, 0.18, 0.80),
        ankle_r=(-0.21, 0.06, 0.48), toe_r=(-0.21, 0.24, 0.42),
        sh_l=(0.30, -0.02, 1.60), el_l=(0.56, 0.05, 1.60),
        hand_l=(0.82, 0.09, 1.55),
        sh_r=(-0.30, -0.02, 1.60), el_r=(-0.56, 0.05, 1.60),
        hand_r=(-0.82, 0.09, 1.55)),
}


# THE MARK SEATS. One point per mark per body, read out of the pose above so a
# seat cannot drift off the limb it names. A mark is authored around the origin
# in its seat's frame and placed by TRANSLATION ONLY -- no scale, no re-pose, no
# new pivot, which is the whole rule for a mark.
def _seats(tier):
    p = POSES[tier]
    hip = _lerp(p["pelvis"], p["chest"], 0.16)
    # The HORIZONTAL projection of the look, normalised on its own. Normalising
    # the full 3-D vector made the lateral offset 0.235 * hypot(lx, ly), so a
    # steeply-pitched pose kept almost none of it -- a5 looks (0.1, 0.42, -0.9)
    # and got 0.102, which buried more than half the grimoire inside the torso.
    # The seat is a position ON the hip, so only the ground-plane direction of
    # the body can decide which side of it the book hangs from.
    lx, ly, _ = _norm((p["look"][0], p["look"][1], 0.0))
    return {
        "circle": (0.0, 0.0, 0.0),                       # a1: the ground ring
        "hip": (hip[0] + 0.235 * ly, hip[1] - 0.235 * lx, hip[2] - 0.02),
        "hand_r": p["hand_r"],                           # b1: the right fist
        "head": p["head"],                               # b2: the skull
    }


SEATS = dict((t, _seats(t)) for t in POSES)


# ---------------------------------------------------------------------------
# The seven bodies.
# ---------------------------------------------------------------------------

def body_base(s, body, fixed):
    """A PLAIN HUMAN. No mystery and no monstrousness -- this is the tier the
    whole tower has to be readable against, so he gets no glow, no hardware and
    nothing that is not cloth, chalk or a satchel. He does everything himself:
    the chalk is IN his hand and his hand is ON the ring."""
    p = POSES["base"]
    figure(s, body, p, MAT_A)
    _chalk_circle(s, fixed, CIRCLE_R, 6)
    # The chalk, running from his fist down to the line he is drawing.
    hand = p["hand_r"]
    taper(s, "chalk", hand, (hand[0] + 0.02, hand[1] + 0.06, 0.055), 0.030,
          0.026, "chalk", body, 5)
    # A satchel of chalk and ochre on his off hip: the whole of his equipment.
    plate(s, "satchel", (0.30, -0.13, 0.62), (0.6, -0.8, 0.0),
          (0.11, 0.22, 0.20), "stone_dark", body)
    taper(s, "satchel_strap", (0.18, -0.06, 0.96), (0.29, -0.11, 0.70), 0.022,
          0.022, "ochre", body, 5)
    # The pot of ochre he is dipping into, on the ground inside the ring.
    td.frustum(s, "pot", 0.085, 0.105, 0.13, (0.40, -0.34, 0.065), "stone_dark",
               fixed, 7)
    td.frustum(s, "pot_fill", 0.088, 0.088, 0.02, (0.40, -0.34, 0.135), "ochre",
               fixed, 7)

    # HE PERFORMS. One group, because everything that moves on this body is the
    # man -- the chalk is in his fist and the satchel is on his hip, so both
    # ride him for free. The pivot is his DOWN KNEE and his planted rear foot,
    # not the model origin: a kneeling man rocks about the ground he is on, and
    # pivoting at the origin swings his head sideways instead of forward.
    PIVOT = (-0.10, -0.06, 0.07)

    def pose(frame):
        st = strip(frame)
        if st is None:
            return rest_pose(body)
        band, t = st
        if band < IDLE_BANDS:
            # THE CHANT, and the amplitude is the swarm.
            k = AGITATION[band] * (0.80 + 0.20 * keys(t, BREATH))
            c = beat(t, CHANT_BEATS, CHANT)
            set_pose(body, PIVOT, (nod(c * 0.088 * k), 0.0, c * -0.046 * k),
                     (0.0, 0.0, -abs(c) * 0.020 * k))
        elif band == IDLE_BANDS:
            # THE LUNGE. He drives down and round into his own circle: the
            # chalk hand is at (-0.25, 0.60, 0.19) and this swings it along the
            # rim rather than stabbing at it.
            g = keys(t, LUNGE)
            set_pose(body, PIVOT, (nod(g * 0.30), 0.0, g * -0.24),
                     (0.0, g * 0.045, g * -0.040))
        else:
            # A2: HANDS OFF. He rocks back off the work and holds there while
            # the book on his hip does it. Deliberately small -- the statement
            # is that he has stopped, and a big motion would undo it.
            g = keys(t, WITHDRAW)
            set_pose(body, PIVOT, (nod(g * -0.125), 0.0, g * 0.055),
                     (0.0, g * -0.070, g * 0.012))
    return pose


def body_a3(s, body, fixed):
    """THE GRIMOIRE DOES IT NOW. It hangs unsupported at chest height with a
    second page fanned open off the spine, and both his hands are away from it:
    one hanging, one at his chin. He is watching the book work, which is the
    tier's whole statement -- the first thing he delegated."""
    p = POSES["a3"]
    figure(s, body, p, MAT_A)
    _chalk_circle(s, fixed, CIRCLE_R, 6)

    # TWO GROUPS FOR ONE OBJECT, and that is the two tempos.
    #
    # `book` is the block -- covers, pages, spine, the warm light under it --
    # and it breathes ONCE per band. `leaf` is the fanned page and the three
    # loose leaves, and it flutters FIVE times in the same band. One object
    # obeying two clocks is the thing that reads as overload; a book opening
    # and closing on one clock reads as a bellows.
    #
    # Both hang off `root`, NOT off `body`. The tier's whole statement is that
    # the book works while he does not, and a book parented to the man is a
    # book he is holding up.
    book = s.node("book", parent=body.parent, animated=True)
    leaf = s.node("leaf", parent=body.parent, animated=True)

    # THE BOOK. Two covers held open in a shallow V, a page block between them,
    # and a second leaf fanned out to the side so the shape is not one slab.
    #
    # IT HAS TO CLEAR HIM. The first pass hung it at chest height 0.22 in front
    # of the trunk and from the front it simply became his chest -- one pale
    # slab on another. It sits a full arm's length out and above the folded
    # forearms now, with air on every side of it, because the whole tier is
    # "the book is doing this and he is not".
    bx, by, bz = 0.0, 0.56, 1.30
    for sx in (-1, 1):
        td.box(s, "cover_%d" % sx, (0.18, 0.042, 0.24),
               (bx + sx * 0.105, by + 0.014, bz), (-0.22, 0, sx * 0.38),
               "stone_dark", book)
        td.box(s, "pages_%d" % sx, (0.155, 0.030, 0.205),
               (bx + sx * 0.098, by - 0.018, bz), (-0.22, 0, sx * 0.38),
               "chalk", book)
    td.box(s, "spine", (0.055, 0.080, 0.25), (bx, by + 0.03, bz), (-0.22, 0, 0),
           "ochre", book)
    # The second page, fanned open and standing away from the block.
    td.box(s, "fanned_page", (0.19, 0.022, 0.18),
           (bx + 0.235, by - 0.06, bz + 0.11), (0.0, -0.30, 0.66), "chalk", leaf)
    # What holds it up: a weak WARM light under the spine, never a cold one.
    td.box(s, "book_light", (0.11, 0.11, 0.045), (bx, by - 0.02, bz - 0.15),
           (0, 0, 0), "warm_glow", book)
    for i, a in enumerate((0.5, 2.3, 4.1)):
        td.box(s, "leaf_%d" % i, (0.075, 0.02, 0.06),
               (bx + math.cos(a) * 0.31, by + 0.02 + math.sin(a) * 0.10,
                bz - 0.30 + i * 0.21), (0, 0, a), "chalk", leaf)

    # The book turns about its own SPINE, not about its centre: a page block
    # rocking about the middle of itself is a slab tipping, and the spine is
    # the only edge of a book that does not move when it opens.
    SPINE = (bx, by + 0.03, bz)
    HINGE = (bx + 0.16, by - 0.04, bz + 0.06)     # where the fanned page joins

    def pose(frame):
        st = strip(frame)
        if st is None:
            return rest_pose(body, book, leaf)
        band, t = st
        if band < IDLE_BANDS:
            k = AGITATION[band] * (0.80 + 0.20 * keys(t, BREATH))
            c = beat(t, CHANT_BEATS, CHANT)
            # He is watching it work, so his own chant is halved -- the
            # agitation has moved into the object.
            set_pose(body, (0.0, 0.0, 0.06),
                     (nod(c * 0.044 * k), 0.0, c * -0.026 * k),
                     (0.0, 0.0, -abs(c) * 0.011 * k))
            sl = keys(t, PAGE_SLOW)
            fa = beat(t, PAGE_BEATS, PAGE_FAST)
            # BOTH TEMPOS HAVE TO BE ABOVE THE FLOOR, or there is only one
            # rhythm and the point is lost. Measured: block 4.6 px against the
            # leaf's 9.1 at the top of the ladder. The block is the slower and
            # the larger object, so it is allowed to be the quieter one -- but
            # at the 0.13 rad it shipped with first it measured 2.6 px and the
            # contact sheet showed a book that was simply not breathing.
            set_pose(book, SPINE, (nod(sl * 0.26 * k), 0.0, sl * 0.12 * k),
                     (0.0, 0.0, sl * 0.050 * k))
            set_pose(leaf, HINGE, (nod(fa * 0.34 * k), sl * -0.06,
                                   fa * -0.22 * k),
                     (0.0, 0.0, fa * 0.022 * k))
        else:
            # THE BOOK INVOKES. It tips out over the circle on its own spine so
            # the open face turns up, the fanned page flails on the fast clock,
            # and HE DOES NOT MOVE except to rock further out of the way. That
            # contrast is the tier.
            g = keys(t, FLARE)
            f = keys(t, SNAP)
            set_pose(body, (0.0, 0.0, 0.06), (nod(g * -0.055), 0.0, 0.0),
                     (0.0, g * -0.048, 0.0))
            set_pose(book, SPINE, (nod(g * 0.46), 0.0, g * 0.16),
                     (0.0, g * 0.035, g * 0.095))
            set_pose(leaf, HINGE, (nod(f * 0.85), g * -0.20, f * -0.52),
                     (0.0, 0.0, f * 0.060))
    return pose


def body_a4(s, body, fixed):
    """THE TOTEM DOES IT NOW, and it is standing where he used to kneel. He is
    off on the rim of his own circle, mid-stride, looking in at it -- the tier
    where he becomes decoration on his own tower. The totem is a SEPARATE
    OBJECT planted in the ground, not something he carries: it is world-fixed,
    he is not, so the body group's rotation walks him around it."""
    p = POSES["a4"]
    figure(s, body, p, MAT_A)
    _chalk_circle(s, fixed, CIRCLE_R, 0)

    # THE TOTEM LEAVES `world_fixed`, AND IT HAD TO.
    #
    # td_mesh._group_of returns the world-fixed group the MOMENT it sees the
    # flag, walking up, so a group cannot be both world-fixed and animated: an
    # object on `fixed` is structurally incapable of carrying a frame. gl-world
    # agrees from the other end -- it looks up the group literally named
    # `world_fixed` and draws it with the aim taken OUT, never with a pose
    # matrix (js/gl/gl-world.js, drawActor). So the totem either stays planted
    # and inert or it moves; it cannot do both, and the tier is that it moves.
    #
    # WHAT THAT COSTS AND WHY IT IS A GAIN. The animated group is drawn with the
    # model's yaw, which for a summoner is a CONSTANT (a BlubTower sets
    # `aim = -pi/2` in its constructor and nothing ever writes it again;
    # authoredFrontOffset adds another -pi/2 to every `summoner-*` model). So
    # the man has always been drawn half a turn round from the world-fixed ring
    # -- and the totem, sitting on the ring's group, was drawn half a turn round
    # from the MAN. Measured on the board before this change, the two overlapped
    # by 0.035 units; authored, they clear each other by 0.125. Putting the
    # totem on the man's side of that split is what finally makes the authored
    # separation the one the player sees.
    #
    # AND THE FACE COMES ROUND WITH IT. Not one number below changed: the totem
    # is authored exactly where and how it always was, and only its GROUP moved.
    # That is worth stating because the effect is the opposite of a regression.
    # The camera sits on -Y (measured: eye y 101 against target y 340 at the
    # reference view), so a face authored on +Y points AWAY from the player out
    # of the un-yawed world_fixed group, and TOWARDS them out of the yawed one.
    # Every body in this file is authored front-on-+Y for exactly that reason.
    # The totem was the one part that was not, and it was not a decision -- it
    # was the accident of sitting on the only group drawn without the yaw.
    totem = s.node("totem", parent=body.parent, animated=True)

    # Buried foot, carved shaft, one face, a bound crown. Alternating facet
    # materials on the shaft do the carving for free. It stands 0.62 clear of
    # the man -- close enough to be his, far enough that the two never fuse into
    # one lump from any angle the tower can be turned to.
    tx = 0.08
    td.frustum(s, "totem_root", 0.215, 0.175, 0.20, (tx, 0.0, 0.10),
               "stone_dark", totem, 8)
    taper(s, "totem_shaft", (tx, 0.0, 0.20), (tx, 0.0, 1.18), 0.165, 0.140,
          "stone", totem, 8, "stone_dark")
    td.box(s, "totem_face", (0.26, 0.30, 0.34), (tx, 0.0, 0.90), (0, 0, 0),
           "stone", totem)
    for sx in (-1, 1):
        td.box(s, "totem_eye_%d" % sx, (0.07, 0.05, 0.06),
               (tx + sx * 0.072, 0.155, 0.97), (0, 0, 0), "dark", totem)
    td.box(s, "totem_mouth", (0.20, 0.05, 0.055), (tx, 0.155, 0.83),
           (0, 0, 0), "dark", totem)
    # A binding of cord and a lichen crust: it has been standing here a while.
    taper(s, "totem_bind", (tx, 0.0, 1.18), (tx, 0.0, 1.27), 0.155, 0.155,
          "ochre", totem, 8)
    taper(s, "totem_crown", (tx, 0.0, 1.27), (tx, 0.0, 1.50), 0.145, 0.075,
          "moss_dark", totem, 8)
    td.ball(s, "totem_light", 0.085, (tx, 0.0, 1.55), "warm_glow", totem, 6, 4)
    td.ball(s, "totem_lichen", 0.075, (tx - 0.12, 0.10, 0.44), "lichen", totem,
            5, 3)

    # HE CIRCLES IT, AND THAT IS HIS WHOLE IDLE.
    #
    # The pose puts him 0.54 off centre on purpose, so a yaw on his own group
    # about the MODEL AXIS is not a swivel -- it is a walk along the rim. This
    # is the one body whose idle is a rz and not a rx, and it costs nothing
    # extra: the offset was already authored, it just had nothing turning it.
    #
    # He gets NO GESTURE. The brief is explicit that at A4 he does nothing at
    # all, so the gesture band leaves his group at a walking pose and gives the
    # whole event to the totem. An empty band is the statement.
    AXIS = (0.0, 0.0, 0.0)
    FOOT = (tx, 0.0, 0.10)                 # where the totem is buried

    def pose(frame):
        st = strip(frame)
        if st is None:
            return rest_pose(body, totem)
        band, t = st
        k = AGITATION[min(band, IDLE_BANDS - 1)] * (0.80 + 0.20 * keys(t, BREATH))
        c = beat(t, CHANT_BEATS, CHANT)
        # The walk runs in every band, gesture included: he does not stop.
        set_pose(body, AXIS, (0.0, 0.0, c * 0.155 * k),
                 (0.0, 0.0, -abs(c) * 0.024 * k))
        if band < IDLE_BANDS:
            # The totem idles too, but it idles like STONE: a slow lean on its
            # buried foot, a fifth of his amplitude, and no beat in it at all.
            sl = keys(t, PAGE_SLOW)
            set_pose(totem, FOOT, (nod(sl * 0.045), sl * -0.026, sl * 0.075),
                     (0.0, 0.0, sl * 0.022))
        else:
            # THE TOTEM INVOKES. It comes up off its root, turns on its own
            # buried foot and drops back -- a post being wound and released.
            g = keys(t, FLARE)
            f = keys(t, SNAP)
            set_pose(totem, FOOT, (nod(f * 0.075), 0.0, g * 0.62),
                     (0.0, 0.0, g * 0.085))
    return pose


def body_a5(s, body, fixed):
    """THE CIRCLE HAS OUTGROWN THE TOWER AND IS TAKING HIM WITH IT.

    The outer ring is deliberately drawn OUTSIDE the 25 u.l. footprint -- that
    overflow is the tier's whole picture -- and it is the only lit thing here.
    He is back on his knees under it with his weight on one hand, and three
    threads of warm light run out of his chest into the ring, which is the brief
    being explicit that A5 must already show him losing."""
    p = POSES["a5"]
    figure(s, body, p, MAT_A)
    _chalk_circle(s, fixed, CIRCLE_R * 0.86, 0)

    over = GROUND_R * 1.24                   # past the footprint, on purpose
    td.torus(s, "overflow", over, 0.05, (0, 0, 0.055), (0, 0, 0), "warm_glow",
             fixed, 12, 4)
    for i in range(5):
        a = math.tau * i / 5 + 0.5
        td.box(s, "rune_stone_%d" % i, (0.11, 0.09, 0.20),
               (math.cos(a) * over * 0.86, math.sin(a) * over * 0.86, 0.10),
               (0, 0, a), "stone", fixed)
    # THE SIPHON: it is drinking out of him, not the other way round. Its own
    # group, because at A5 the thing that PERFORMS is the circle, not the man --
    # the ring is world-fixed furniture and cannot move, so what carries the
    # summons is its grip on him.
    threads = s.node("threads", parent=body.parent, animated=True)
    chest = p["chest"]
    for i, a in enumerate((0.9, 2.6, 4.4)):
        # Thin. At 0.018 they read as tripod legs holding him UP, which is the
        # opposite of the thing they are for: they are what is running out.
        taper(s, "thread_%d" % i, (chest[0], chest[1] - 0.02, chest[2] - 0.02),
              (math.cos(a) * over, math.sin(a) * over, 0.08), 0.012, 0.022,
              "warm_glow", threads, 4)
    # His chalk, snapped, where he dropped it.
    td.box(s, "chalk_stub", (0.09, 0.05, 0.05), (0.36, 0.44, 0.03), (0, 0, 0.4),
           "chalk", fixed)

    # THE IDLE IS THE TIER. Everything else on voie A chants; this one shakes.
    #
    # TREMBLE has seven uneven stops and does not pass through neutral in the
    # middle, and it drives a ROLL as well as a pitch -- keyed off a different
    # sample of the same curve, so the shoulders are never level twice running.
    # Playing the chant slower would have read as a tired man. It has to read as
    # a man who cannot hold still, and those are different motions.
    #
    # THE LADDER STILL CLIMBS WITH THE SWARM, and that is the cruel part: the
    # better the tower is doing, the worse he is. Same AGITATION table, opposite
    # meaning.
    KNEES = (0.0, -0.06, 0.10)
    ROOT = (chest[0], chest[1] - 0.02, chest[2] - 0.02)

    def pose(frame):
        st = strip(frame)
        if st is None:
            return rest_pose(body, threads)
        band, t = st
        if band < IDLE_BANDS:
            k = AGITATION[band] * (0.80 + 0.20 * keys(t, BREATH))
            c = beat(t, TREMBLE_BEATS, TREMBLE)
            r = beat((t + 0.37) % 1.0, TREMBLE_BEATS, TREMBLE)
            set_pose(body, KNEES,
                     (nod(c * 0.088 * k), r * 0.072 * k, r * -0.030 * k),
                     (0.0, 0.0, -abs(c) * 0.018 * k))
            # The threads breathe on the SLOW clock while he shakes on the fast
            # one: what is draining him is not in a hurry.
            sl = keys(t, PAGE_SLOW)
            set_pose(threads, ROOT, (nod(sl * 0.055), sl * -0.032, sl * 0.095),
                     (0.0, 0.0, sl * -0.024))
        else:
            # THE CIRCLE BITES. The threads snap taut and haul, and he is
            # dragged a little further down by them -- the summons happens TO
            # him. He does not perform it and he never recovers inside the band.
            g = keys(t, SNAP)
            f = keys(t, FLARE)
            set_pose(threads, ROOT, (nod(f * -0.115), f * 0.055, f * -0.14),
                     (0.0, 0.0, f * -0.050))
            set_pose(body, KNEES, (nod(g * 0.115), g * 0.075, g * -0.045),
                     (0.0, g * -0.030, g * -0.028))
    return pose


def body_b3(s, body, fixed):
    """AN EXOSKELETON COLUMN UP HIS BACK. The spine is the silhouette: a
    segmented mast standing off his back and overhanging the head, with cables
    down to both shoulders and both hips, and his fist driven into the ground.

    He still owes A2 for this, so the plate and the lichen are here."""
    p = POSES["b3"]
    # B3 is the only path B body with no pauldron, so it keeps its deltoids:
    # the cables have to land on a shoulder that is actually there.
    figure(s, body, p, MAT_B, girth=1.05, hem=False, armoured=True)
    _machine_kerb(s, fixed, CIRCLE_R)

    # THE COLUMN IS THE SERVO. Its own group, pivoted at its BURIED BASE so the
    # bottom of the mast never leaves his back and the travel is all at the
    # overhang -- which is also where the cables land, so they go slack rather
    # than tearing off a shoulder. The lichen bead `_inheritance` puts at t=0.02
    # stays on `body` for the same reason: at the pivot it cannot separate.
    rig = s.node("rig", parent=body.parent, animated=True)
    base = (0.0, -0.28, 0.54)
    top = (0.02, -0.30, 1.44)
    taper(s, "column", base, top, 0.075, 0.055, "chrome_dk", rig, 6)
    for i in range(4):
        t = 0.12 + 0.26 * i
        at = _lerp(base, top, t)
        td.box(s, "vertebra_%d" % i, (0.17, 0.13, 0.075),
               (at[0], at[1], at[2]), (0, 0, 0), "steel_bru", rig)
    td.box(s, "column_head", (0.18, 0.14, 0.10), (0.02, -0.28, 1.47), (0, 0, 0),
           "chrome", rig)
    td.box(s, "column_lamp", (0.05, 0.10, 0.035), (0.02, -0.20, 1.47),
           (0, 0, 0), "cyan", rig)
    # Cables. They land ON the joints the pose already defines, so nothing here
    # can float away from the man it is bolted to.
    for tag in ("l", "r"):
        taper(s, "cable_sh_" + tag, _lerp(base, top, 0.78), p["sh_" + tag],
              0.028, 0.024, "dark", body, 5)
        taper(s, "cable_hip_" + tag, _lerp(base, top, 0.10), p["hip_" + tag],
              0.030, 0.026, "dark", body, 5)
    # A brace on the planted arm: this is what is holding the fist down.
    taper(s, "brace", p["el_r"], p["hand_r"], 0.062, 0.070, "steel_bru", body, 6)
    _inheritance(s, body, (0.16, 0.23, 1.02), (0.35, 0.94, 0.0),
                 (p["knee_r"], p["el_l"], _lerp(base, top, 0.02)), 0.19)

    # VOIE B DOES NOT CHANT. He is the only path B body still touching the
    # ground -- his fist is driven into it -- so there is no levitation to give
    # him either. What he has is a LOAD SHIFT, the frame settling against the
    # machine bracing it, and the column ticking over his shoulder on its own
    # clock. Two rhythms again, and neither of them is a breath.
    FIST = (p["hand_r"][0], p["hand_r"][1], 0.06)

    def pose(frame):
        st = strip(frame)
        if st is None:
            return rest_pose(body, rig)
        band, t = st
        k = AGITATION[min(band, IDLE_BANDS - 1)]
        if band < IDLE_BANDS:
            c = beat(t, FLOAT_BEATS, FLOAT)
            j = beat(t, JOLT_BEATS, JOLT)
            set_pose(body, FIST, (nod(c * 0.048 * k), c * -0.030 * k, 0.0),
                     (0.0, 0.0, abs(c) * 0.022 * k))
            set_pose(rig, base,
                     (nod(j * 0.055 * k), j * -0.030 * k, j * 0.045 * k),
                     (0.0, 0.0, j * 0.012 * k))
        else:
            # HE PERFORMS. On voie B no object ever takes over, so the gesture
            # is his: he drives the planted fist down and the mast recoils
            # backward off it, which is the machine taking the load he cannot.
            g = keys(t, LUNGE)
            f = keys(t, SNAP)
            set_pose(body, FIST, (nod(g * 0.175), g * -0.060, g * 0.075),
                     (0.0, g * 0.030, g * -0.038))
            set_pose(rig, base, (nod(f * -0.20), f * 0.075, f * -0.10),
                     (0.0, f * -0.045, f * 0.025))
    return pose


def body_b4(s, body, fixed):
    """HE LEAVES THE GROUND. Nothing on this body reaches z = 0 -- the lowest
    solid is a boot at 0.30 -- and the ring he used to kneel on is still down
    there without him. Body reared back, chin up, armour closed over the suit
    and the vents pointed down, because something has to be doing the lifting."""
    p = POSES["b4"]
    figure(s, body, p, MAT_B, girth=1.10, hem=False, helm="chrome_dk",
           visor="cyan", armoured=True, deltoid=False)
    _machine_kerb(s, fixed, CIRCLE_R)

    chest, look = p["chest"], p["look"]
    plate(s, "cuirass", (chest[0], chest[1] + 0.10, chest[2] - 0.02),
          (0.0, 1.0, 0.0), (0.11, 0.40, 0.42), "steel_bru", body, pitch=-0.30)
    plate(s, "cuirass_rim", (chest[0], chest[1] + 0.14, chest[2] + 0.19),
          (0.0, 1.0, 0.0), (0.09, 0.34, 0.06), "chrome", body, pitch=-0.30)
    # The hardware that jitters on its own clock: pauldrons, vents and the jets
    # that are doing the lifting. The cuirass and the lift field stay on `body`
    # -- one is bolted to his chest and the other is the surface he is standing
    # on, and neither may drift away from him.
    rig = s.node("rig", parent=body.parent, animated=True)
    for sx in (-1, 1):
        td.frustum(s, "pauldron_%d" % sx, 0.19, 0.13, 0.17,
                   (sx * 0.31, -0.15, 1.52), "steel_bru", rig, 6,
                   (0, sx * -0.42, 0))
        # The vents. Angled DOWN and back, with the cold light inside them.
        td.box(s, "vent_%d" % sx, (0.13, 0.15, 0.30), (sx * 0.19, -0.30, 1.16),
               (0.42, 0, 0), "chrome_dk", rig)
        td.box(s, "vent_glow_%d" % sx, (0.07, 0.09, 0.16),
               (sx * 0.19, -0.24, 1.01), (0.42, 0, 0), "cyan", rig)
        # Thrust off the soles: the reason the boots are where they are.
        td.frustum(s, "sole_jet_%d" % sx, 0.075, 0.035, 0.16,
                   (sx * 0.19, 0.24, 0.24), "cyan_dim", rig, 6, (0.5, 0, 0))
    # The field he is standing on instead of the ground. It rides the BODY, not
    # the kerb: it is what is holding him up, so it goes where he goes.
    td.torus(s, "lift_field", 0.44, 0.032, (0, 0.10, 0.19), (0, 0, 0),
             "cyan_dim", body, 10, 4)
    _inheritance(s, body, (chest[0] - 0.20, chest[1] + 0.16, chest[2] - 0.12),
                 (-0.45, 0.89, 0.0),
                 (p["knee_l"], p["el_r"], (0.0, -0.28, 1.30)), 0.18)

    # LEVITATION, and it is the whole idle. Nothing on this body touches the
    # ground, so the loop is a TRANSLATION -- he rises and settles on the field
    # under him -- with a slow roll on top and the vent rig ticking against it.
    # The float is deliberately not a sine: FLOAT holds near the top and drops
    # through the bottom, which is what a thing being held up looks like as
    # opposed to a thing bobbing on water.
    CORE = (0.0, -0.06, 1.06)

    def pose(frame):
        st = strip(frame)
        if st is None:
            return rest_pose(body, rig)
        band, t = st
        k = AGITATION[min(band, IDLE_BANDS - 1)]
        if band < IDLE_BANDS:
            c = beat(t, FLOAT_BEATS, FLOAT)
            j = beat(t, JOLT_BEATS, JOLT)
            set_pose(body, CORE, (nod(c * 0.020 * k), c * 0.026 * k, 0.0),
                     (0.0, 0.0, c * 0.060 * k))
            set_pose(rig, CORE,
                     (nod(j * 0.048 * k), j * 0.036 * k, j * -0.030 * k),
                     (0.0, j * -0.016 * k, j * 0.014 * k))
        else:
            # HE PERFORMS. He rears further back and RISES, and the vents flare
            # down and back to pay for it -- the lift is being spent on the
            # summons rather than on him.
            g = keys(t, FLARE)
            f = keys(t, SNAP)
            set_pose(body, CORE, (nod(g * -0.185), 0.0, g * 0.055),
                     (0.0, g * -0.045, g * 0.135))
            set_pose(rig, CORE, (nod(f * 0.26), f * 0.10, f * -0.08),
                     (0.0, f * 0.050, f * -0.060))
    return pose


def body_b5(s, body, fixed):
    """THE MAGE-MECHA, ARMS SPREAD WIDE. The span is the silhouette: he is the
    only body here that is wider than it is tall, and the only one whose head
    clears 1.9. A ring stands behind his shoulders -- the circle he used to draw
    on the ground, now built into the machine and carried at head height."""
    p = POSES["b5"]
    # No fists: the gauntlets below ARE his hands now, which is the tier.
    figure(s, body, p, MAT_B, girth=1.16, hem=False, helm="chrome_dk",
           visor="cyan", armoured=True, deltoid=False, fists=False)
    _machine_kerb(s, fixed, CIRCLE_R)

    chest = p["chest"]
    plate(s, "cuirass", (chest[0], chest[1] + 0.12, chest[2] - 0.02),
          (0.0, 1.0, 0.0), (0.12, 0.44, 0.46), "steel_bru", body)
    plate(s, "cuirass_rim", (chest[0], chest[1] + 0.16, chest[2] + 0.22),
          (0.0, 1.0, 0.0), (0.10, 0.38, 0.07), "chrome", body)
    td.ball(s, "core", 0.095, (chest[0], chest[1] + 0.20, chest[2] - 0.02),
            "cyan", body, 5, 3)
    rig = s.node("rig", parent=body.parent, animated=True)
    for sx in (-1, 1):
        td.frustum(s, "pauldron_%d" % sx, 0.235, 0.145, 0.22,
                   (sx * 0.36, -0.02, 1.66), "steel_bru", rig, 5,
                   (0, sx * -0.90, 0))
        td.box(s, "gauntlet_%d" % sx, (0.17, 0.15, 0.15),
               (sx * 0.80, 0.09, 1.55), (0, 0, 0), "chrome", rig)
        td.box(s, "palm_light_%d" % sx, (0.09, 0.09, 0.05),
               (sx * 0.80, 0.15, 1.50), (0, 0, 0), "white_hot", rig)
        td.box(s, "vent_%d" % sx, (0.12, 0.14, 0.34), (sx * 0.20, -0.24, 1.30),
               (0, 0, 0), "chrome_dk", body)
        td.box(s, "vent_glow_%d" % sx, (0.06, 0.08, 0.20),
               (sx * 0.20, -0.31, 1.30), (0, 0, 0), "cyan", body)
        td.box(s, "thigh_plate_%d" % sx, (0.20, 0.19, 0.28),
               (sx * 0.20, 0.07, 0.98), (0, 0, sx * -0.14), "steel_bru", body)
        td.frustum(s, "sole_jet_%d" % sx, 0.085, 0.04, 0.18,
                   (sx * 0.21, 0.14, 0.32), "cyan_dim", body, 5, (0.35, 0, 0))
    # THE CARRIED CIRCLE. Same ring, off the ground at last. Eight segments and
    # a square section: it is a machined part now, and it should look stamped
    # rather than drawn.
    td.torus(s, "halo", 0.42, 0.036, (0.0, -0.24, 1.62), (1.35, 0, 0),
             "chrome", rig, 8, 4)
    _inheritance(s, body, (chest[0] + 0.28, chest[1] + 0.14, chest[2] - 0.14),
                 (0.5, 0.87, 0.0),
                 (p["knee_r"], p["el_l"], (0.0, -0.20, 1.20)), 0.20)

    # THE SPAN IS THE SILHOUETTE, so the idle is not allowed to narrow it. The
    # body floats and rolls; the RIG -- the halo behind his shoulders, both
    # pauldrons and both gauntlets -- ticks about the SHOULDER LINE, which means
    # the arms he is holding out never shorten and the ring behind him rocks
    # against the roll instead of with it. That counter-beat is the last of the
    # three voie B idle notes the brief asks for: the levitation, the servo
    # jolts, and something that moves like cloth without being cloth.
    CORE = (0.0, -0.02, 1.14)
    SHOULD = (0.0, -0.02, 1.60)

    def pose(frame):
        st = strip(frame)
        if st is None:
            return rest_pose(body, rig)
        band, t = st
        k = AGITATION[min(band, IDLE_BANDS - 1)]
        if band < IDLE_BANDS:
            c = beat(t, FLOAT_BEATS, FLOAT)
            j = beat(t, JOLT_BEATS, JOLT)
            sl = keys(t, PAGE_SLOW)
            set_pose(body, CORE, (nod(c * 0.016 * k), c * 0.022 * k, 0.0),
                     (0.0, 0.0, c * 0.055 * k))
            # NEGATIVE is the halo tipping its face TOWARDS the viewer -- the
            # ring's normal already leans that way at rest, so this opens it out
            # rather than edging it away.
            set_pose(rig, SHOULD,
                     (nod(sl * -0.078 * k + j * 0.040 * k), j * -0.042 * k,
                      j * 0.034 * k),
                     (0.0, 0.0, sl * -0.026 * k))
        else:
            # HE PERFORMS, and at B5 that means the whole machine does: the
            # frame rises, the arms come back, and the carried circle tips hard
            # enough to show its face. No object took over -- he IS the object.
            g = keys(t, FLARE)
            f = keys(t, SNAP)
            set_pose(body, CORE, (nod(g * -0.130), 0.0, 0.0),
                     (0.0, g * -0.030, g * 0.120))
            set_pose(rig, SHOULD,
                     (nod(g * -0.30 + f * -0.10), f * 0.08, f * -0.06),
                     (0.0, f * 0.040, g * 0.045))
    return pose


# The path letter is carried, not derived: "base" starts with a b, and reading
# the path off the tier name quietly audited the plain human as a machine.
BODIES = [
    ("base", body_base, "A"), ("a3", body_a3, "A"), ("a4", body_a4, "A"),
    ("a5", body_a5, "A"),
    ("b3", body_b3, "B"), ("b4", body_b4, "B"), ("b5", body_b5, "B"),
]


# ---------------------------------------------------------------------------
# The four crosspath marks. Each is authored around its SEAT's origin, small
# enough to sit inside the body's existing outline, and drawn over a body that
# is not otherwise touched.
# ---------------------------------------------------------------------------

def mark_a1(s, body, fixed):
    """RUNES TRACED AROUND THE CIRCLE. Seat: `circle` -- ground level, tower
    centre, so this one needs no offset on any body.

    They are cut into STONE plaques rather than chalked on the dirt, and that is
    the crosspath doing its job: on path B the same mark is the engraving on his
    bolted plates, and inherited stone is the one porous material a machine is
    allowed to wear. Nothing here stands over 0.11, so it cannot touch a
    silhouette."""
    ring = CIRCLE_R + 0.055
    for i in range(6):
        a = math.tau * i / 6 + math.pi / 6
        cx, cy = math.cos(a) * ring, math.sin(a) * ring
        td.box(s, "rune_plaque_%d" % i, (0.150, 0.125, 0.06), (cx, cy, 0.055),
               (0, 0, a), "stone", fixed)
        # An L, not a dash: one stroke along the rim and one across it, which is
        # the difference between a rune and a tick mark at this size.
        td.box(s, "rune_cut_%d" % i, (0.105, 0.030, 0.03), (cx, cy, 0.096),
               (0, 0, a), "chalk", fixed)
        td.box(s, "rune_bar_%d" % i, (0.030, 0.078, 0.03),
               (cx + math.cos(a) * 0.035, cy + math.sin(a) * 0.035, 0.096),
               (0, 0, a), "chalk", fixed)


def mark_a2(s, body, fixed):
    """THE GRIMOIRE, AND IT IS SUBORDINATE. Seat: `hip`, on his off side.

    SHUT, STRAPPED AND CHROME-PLATED, and it does not emit -- a book that glows
    is a book that is doing the work, and on path B he is the only performer.
    Same object on path A, simply the one he carried before A3 taught it to
    float. Authored in the seat frame: +Y is the way he faces, +Z is up."""
    # IT IS THE ONLY MARK THAT MOVES, and it moves because the arc makes it the
    # PERFORMER at three tiers: A2 (he steps back and the book invokes), A4 and
    # A5 (the totem takes the slow lines, the grimoire takes the fast ones). At
    # every one of those he already owns this mark, so the grimoire the brief
    # hands the fast summons to is this object and not a second one.
    #
    # SPLIT, NOT ADDED TO. A mark may never change a proportion, so the two
    # groups here are the geometry that was already on this model, sorted: the
    # BLOCK breathes on the slow clock and the chrome PLATE lifts off the cover
    # on the fast one. Same two tempos as A3's floating book, on the object that
    # becomes it -- which is the point, since this IS that book before it
    # learned to float.
    #
    # ON VOIE B IT NEVER PLAYS. gl-world hands a mark frame 0 today and the
    # patch above keeps doing that for a B body: "le grimoire ne flotte jamais
    # de ce cote", and frame 0 is the identity, so a machine wearing this mark
    # is drawn from the same vertices it was drawn from before this file grew a
    # strip. That is checked, not asserted -- see check_rest_pose.
    block = s.node("block", parent=body.parent, animated=True)
    leaf = s.node("leaf", parent=body.parent, animated=True)

    # It hangs FLAT AGAINST HIS FLANK -- covers facing out and in, spine
    # forward. A book carried edge-on to the body reads as a book; one carried
    # face-forward reads as a breastplate, which is the opposite claim.
    td.box(s, "book_block", (0.085, 0.21, 0.25), (0, 0, 0), (0, 0, 0), "tooth",
           block)
    for sx in (-1, 1):
        td.box(s, "book_cover_%d" % sx, (0.028, 0.225, 0.27),
               (sx * 0.058, 0, 0.005), (0, 0, 0), "chrome_dk", block)
    td.box(s, "book_plate", (0.016, 0.09, 0.20), (0.076, 0.045, 0.005),
           (0, 0, 0), "chrome", leaf)
    td.box(s, "book_spine", (0.115, 0.055, 0.28), (0, 0.105, 0.005), (0, 0, 0),
           "ochre", block)
    # The strap and its buckle: what makes it luggage instead of an oracle.
    taper(s, "book_strap", (0.072, -0.12, 0.21), (0.072, 0.10, -0.19), 0.020,
          0.020, "dark", block, 5)
    td.box(s, "book_clasp", (0.05, 0.075, 0.055), (0.082, 0.0, 0.0), (0, 0, 0),
           "chrome", block)

    # The strap is what it hangs from, so that is what it swings about; the
    # plate hinges on the spine edge of the cover it is set into.
    HANG = (0.072, -0.02, 0.21)
    EDGE = (0.070, 0.100, 0.005)

    def pose(frame):
        st = strip(frame)
        if st is None:
            return rest_pose(block, leaf)
        band, t = st
        if band < IDLE_BANDS:
            # SUBORDINATE AT REST. A shut book on a strap does not have an
            # idle of its own -- it has HIS. The amplitude here is a quarter of
            # the body's, and it is a swing on the strap, not a page turning:
            # the book is not working yet, and it must not look as if it is.
            k = AGITATION[band] * (0.80 + 0.20 * keys(t, BREATH))
            c = beat(t, CHANT_BEATS, CHANT)
            set_pose(block, HANG, (nod(c * 0.075 * k), 0.0, c * 0.042 * k))
            # THE PLATE DOES NOT MOVE AT ALL AT REST, and 0.0 px of travel is
            # the intended reading rather than a missed one: the book is shut.
            # It is the gesture that cracks it open, and a page that flutters
            # while the strap is still done up has already given the tier away.
            set_pose(leaf, EDGE, (0.0, 0.0, 0.0))
        else:
            # IT INVOKES. The block swings out off his flank and the plate
            # cracks up off the cover and flutters -- five beats to the block's
            # one, the same 5:1 the floating book keeps at A3.
            g = keys(t, FLARE)
            f = beat(t, PAGE_BEATS, PAGE_FAST)
            set_pose(block, HANG, (nod(g * 0.30), g * 0.10, g * 0.22),
                     (g * 0.045, 0.0, g * 0.035))
            set_pose(leaf, EDGE, (0.0, f * -0.55, g * 0.18),
                     (f * 0.030, 0.0, f * 0.020))
    return pose


def mark_b1(s, body, fixed):
    """A ONE-HANDED GAUNTLET. Seat: `hand_r`, authored with +Y running out
    along the fingers and -Y back up the forearm, so placing it is a
    translation onto the fist the pose already put there.

    It carries a lichen bead at the cuff seam like every other path B part --
    the machine is bolted onto a ritual it never finished paying for."""
    td.frustum(s, "cuff", 0.105, 0.088, 0.17, (0, -0.13, 0), "chrome_dk", body,
               6, (math.pi / 2, 0, 0))
    td.box(s, "cuff_lip", (0.17, 0.06, 0.16), (0, -0.20, 0), (0, 0, 0),
           "chrome", body)
    td.box(s, "knuckle", (0.155, 0.13, 0.125), (0, 0.02, 0.005), (0, 0, 0),
           "steel_bru", body)
    for i, sx in enumerate((-1, 0, 1)):
        td.box(s, "finger_%d" % i, (0.036, 0.085, 0.05),
               (sx * 0.046, 0.10, -0.015), (0, 0, 0), "chrome", body)
    td.box(s, "back_light", (0.05, 0.075, 0.028), (0, 0.0, 0.075), (0, 0, 0),
           "cyan", body)
    td.ball(s, "cuff_lichen", 0.036, (0.06, -0.15, -0.045), "lichen", body, 5, 3)


def mark_b2(s, body, fixed):
    """A RAISED VISOR WITH A HEADS-UP PANE. Seat: `head`.

    RAISED, not lowered: his face stays visible, because path B is a man being
    augmented and the moment you close the visor he is a machine with nobody in
    it. The pane hangs in front of one eye only, which is what stops it reading
    as a second visor. It clears the skull by 0.08 and hugs it, so the head's
    outline does not change."""
    # The plate is WIDE ACROSS THE BROW and tipped up at the front edge. Built
    # deep-and-narrow it came out a beak.
    td.box(s, "visor_plate", (0.235, 0.105, 0.05), (0.0, 0.115, 0.185),
           (0.55, 0, 0), "chrome", body)
    td.box(s, "visor_edge", (0.235, 0.05, 0.022), (0.0, 0.168, 0.218),
           (0.55, 0, 0), "chrome_dk", body)
    for sx in (-1, 1):
        taper(s, "hinge_%d" % sx, (sx * 0.115, 0.015, 0.085),
              (sx * 0.106, 0.095, 0.170), 0.026, 0.022, "chrome_dk", body, 5)
    # The pane, over the RIGHT eye only -- over both it is a second visor, and
    # the whole point of this mark is that the visor is up.
    td.box(s, "hud_pane", (0.100, 0.014, 0.085), (-0.072, 0.180, 0.020),
           (0, 0, 0.30), "cyan_dim", body)
    td.box(s, "hud_tick", (0.050, 0.016, 0.018), (-0.072, 0.188, 0.046),
           (0, 0, 0.30), "cyan", body)
    # CYAN, not white_hot. b2 is a path B crosspath mark, so it is worn by the
    # path A bodies -- and the brief's only exemption to "la Voie A ne doit
    # jamais emettre de lumiere froide" is the CYAN of the b1/b2 marks.
    # white_hot was the brightest cold light in the palette and sat outside it.
    td.ball(s, "hud_emitter", 0.030, (-0.128, 0.075, 0.100), "cyan", body,
            5, 3)
    td.ball(s, "temple_lichen", 0.030, (0.122, 0.030, 0.075), "lichen", body,
            5, 3)


MARKS = [
    ("a1", mark_a1, "circle", "A"), ("a2", mark_a2, "hip", "A"),
    ("b1", mark_b1, "hand_r", "B"), ("b2", mark_b2, "head", "B"),
]


# ---------------------------------------------------------------------------

def build_body(tier, fn, flat, animate=True):
    """One body. `animate=False` builds the identical scene with no strip at
    all -- td_mesh drops every group when `frames` is 0 -- which is the
    reference `check_rest_pose` diffs frame 0 against."""
    s = td.Scene(palette(flat))
    root = s.node("root")
    fixed = s.node("world_fixed", parent=root, world_fixed=True)
    body = s.node("body", parent=root, animated=animate)
    pose = fn(s, body, fixed)
    if not (animate and pose):
        return td.build(s, "summoner-" + tier), s
    return td.build(s, "summoner-" + tier, frames=strip_length(tier),
                    pose=pose), s


def build_mark(tag, fn, flat, animate=True):
    s = td.Scene(palette(flat))
    root = s.node("root")
    # a1 lies on the ground and must not turn with him; the rest ride the man.
    fixed = s.node("world_fixed", parent=root, world_fixed=True)
    body = s.node("body", parent=root, animated=animate)
    pose = fn(s, body, fixed)
    if not (animate and pose):
        return td.build(s, "summoner-mark-" + tag), s
    return td.build(s, "summoner-mark-" + tag, frames=strip_length(tag),
                    pose=pose), s


# --- the two hard rules, checked rather than remembered ----------------------
# Both of these were broken once while this file was being written -- an ochre
# engraving on a machine, and a warm ring that nearly became a cyan one -- so
# they are asserted at build time instead of trusted to a comment.

COLD = ("cyan", "cyan_dim", "white_hot")
POROUS = ("moss", "moss_dark", "chalk", "ochre")
INHERITED = ("stone", "lichen")


def _materials(scene):
    used = set()
    for mesh in scene.meshes:
        used.add(mesh.mat)
        if mesh.face_mats:
            used.update(mesh.face_mats)
    return used


def audit(name, path, scene, body=False):
    """A never emits cold light. B is never porous except on its inherited
    stone -- and every path B BODY must actually carry that inheritance."""
    used = _materials(scene)
    if path == "A":
        bad = sorted(used & set(COLD))
        if bad:
            raise SystemExit("%s (voie A) emits cold light: %s" % (name, bad))
    else:
        bad = sorted(used & set(POROUS))
        if bad:
            raise SystemExit("%s (voie B) shows a porous surface: %s"
                             % (name, bad))
        if body:
            missing = [m for m in INHERITED if m not in used]
            if missing:
                raise SystemExit("%s (voie B) is missing its A2 inheritance: %s"
                                 % (name, missing))


def _extent(model, group=None):
    """Bounds straight off the emitted positions -- the numbers a silhouette
    review actually asks for. `group` restricts it to one export group, which
    is how the two levitating bodies are checked: the FIGURE's floor has to be
    well clear of zero while the circle it left behind is still on the ground.

    A MISSING GROUP IS AN ERROR, not a silent fall-back to the whole model.
    This used to be asked for the unnamed group `""`, which stopped existing
    the moment `body` became animated -- and the fall-back would have measured
    the whole model instead, quietly reporting both levitating bodies as
    standing on the ground.
    """
    pos = model["positions"]
    first, count = 0, len(pos) // 3
    if group is not None:
        names = [g["name"] for g in model["groups"]]
        if group not in names:
            raise SystemExit("%s has no group %r (has %s)"
                             % (model["name"], group, names))
        for g in model["groups"]:
            if g["name"] == group:
                first, count = g["first"], g["count"]
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for v in range(first, first + count):
        for k in range(3):
            c = pos[v * 3 + k]
            lo[k] = min(lo[k], c)
            hi[k] = max(hi[k], c)
    return lo, hi


# --- the animation's own two checks -----------------------------------------
# Both of these were broken once while this file was being written -- a pivot
# baked into a rest matrix, and a strip that quietly lost its last band -- so
# they are asserted at build time instead of trusted to a comment.

IDENTITY_4X4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
WORLD_FIXED = "world_fixed"


def _tris(model):
    """The model as a comparable multiset of triangles: nine coordinates and
    the RESOLVED colour -- resolved, because two builds may order their
    palettes differently and an index would compare the wrong thing."""
    pos, idx, pal = model["positions"], model["colourIndex"], model["palette"]
    out = []
    for i in range(model["triangles"]):
        out.append((tuple(pos[i * 9:i * 9 + 9]), tuple(pal[idx[i]])))
    out.sort()
    return out


def check_rest_pose(name, model, plain):
    """FRAME 0 IS THE REST POSE AND REST IS THE IDENTITY.

    Not "the rest values" -- literally the 4x4 identity on every animated
    group, and therefore the same vertices on disk that a build with no strip
    at all writes. Everything that draws a summoner without asking for a pose
    depends on it: gl-world's crosspath-mark overlay is hard-coded to frame 0,
    TDObs.showcase draws the whole buffer with one matrix, and every silhouette
    contact sheet this file has been reviewed on went through one of those.

    `plain` is the same scene built with frames=0. Comparing triangle multisets
    rather than the raw arrays is what makes this survive the regrouping: an
    animated build buckets its triangles by group and a plain one does not, so
    the ORDER differs and every coordinate must still match.
    """
    frames = model["frames"]
    want = strip_length(name.rsplit("-", 1)[-1])
    if len(frames) != want:
        raise SystemExit("%s has %d frames, expected %d"
                         % (name, len(frames), want))
    for gi, g in enumerate(model["groups"]):
        m = frames[0][gi]
        if g["name"] == WORLD_FIXED:
            if m is not None:
                raise SystemExit("%s: world_fixed carries a matrix" % name)
            continue
        if m is None:
            raise SystemExit("%s: group %r has no matrix" % (name, g["name"]))
        for a, b in zip(m, IDENTITY_4X4):
            if abs(a - b) > 1e-9:
                raise SystemExit("%s: frame 0 of %r is not the identity: %s"
                                 % (name, g["name"], m))
    a, b = _tris(model), _tris(plain)
    if a != b:
        raise SystemExit("%s: frame 0 does not match the un-animated build "
                         "(%d vs %d triangles)" % (name, len(a), len(b)))


def travel(model, group, band=None):
    """The furthest any vertex of `group` moves off its rest position, in
    PIXELS at board scale. This is the number a review actually wants: an
    amplitude in radians says nothing about whether a motion is visible, and
    every amplitude in this file was tuned against it rather than against taste.

    `band` RESTRICTS IT TO ONE BAND, and that is not a convenience. Measured
    over the whole strip the figure is always the gesture's, because a gesture
    is ten times an idle -- so the first pass reported the a3 grimoire at 4.9 px
    and the contact sheet showed a book that was visibly not breathing. The
    idle and the gesture have to be measured apart or the quiet one hides
    behind the loud one.
    """
    frames, groups = model["frames"], model["groups"]
    if band is not None:
        frames = frames[1 + band * CYCLE:1 + (band + 1) * CYCLE]
    gi = [i for i, g in enumerate(groups) if g["name"] == group]
    if not gi:
        return 0.0
    gi = gi[0]
    g = groups[gi]
    pos = model["positions"]
    pts = [(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])
           for v in range(g["first"], g["first"] + g["count"], 7)]
    worst = 0.0
    for row in frames:
        m = row[gi]
        if m is None:
            continue
        # column-major back to rows
        r = [[m[c * 4 + k] for c in range(4)] for k in range(4)]
        for p in pts:
            q = td.apply(r, p)
            d = math.sqrt(sum((q[k] - p[k]) ** 2 for k in range(3)))
            worst = max(worst, d)
    return worst * PX_PER_UNIT


def main():
    flat = "--silhouette" in sys.argv
    print("building the Summoner figure (%s)"
          % ("SILHOUETTE" if flat else "full"))
    total = 0
    moves = []
    for tier, fn, path in BODIES:
        model, scene = build_body(tier, fn, flat)
        plain, _ = build_body(tier, fn, flat, animate=False)
        check_rest_pose("summoner-" + tier, model, plain)
        audit("summoner-" + tier, path, scene, True)
        td.write_js(model, "summoner-%s.js" % tier)
        lo, hi = _extent(model)
        flo, fhi = _extent(model, "body")          # the turning figure
        total += model["triangles"]
        print("  summoner-%-5s %4d tris  height %.2f  span %.2f  "
              "figure %.2f-%.2f%s"
              % (tier, model["triangles"], hi[2], hi[0] - lo[0], flo[2],
                 fhi[2], "  AIRBORNE" if flo[2] > 0.12 else ""))
        moves.append(("summoner-" + tier, model))
    for tag, fn, seat, path in MARKS:
        model, scene = build_mark(tag, fn, flat)
        if model["frames"]:
            plain, _ = build_mark(tag, fn, flat, animate=False)
            check_rest_pose("summoner-mark-" + tag, model, plain)
            moves.append(("summoner-mark-" + tag, model))
        # A mark is audited on the path that SELLS it. It is then drawn over a
        # body of either path, which is the whole idea of a crosspath: a1's
        # chalk on a B chassis is the ritual showing through the machine, not a
        # palette violation.
        audit("summoner-mark-" + tag, path, scene)
        td.write_js(model, "summoner-mark-%s.js" % tag)
        lo, hi = _extent(model)
        total += model["triangles"]
        print("  summoner-mark-%-2s %4d tris   seat %-7s  box %.2f x %.2f x %.2f"
              % (tag, model["triangles"], seat, hi[0] - lo[0], hi[1] - lo[1],
                 hi[2] - lo[2]))
    print("  %d models, %d triangles total"
          % (len(BODIES) + len(MARKS), total))
    print("  footprint radius %.1f px (%.3f u), chalk circle %.3f u"
          % (GROUND_R * PX_PER_UNIT, GROUND_R, CIRCLE_R))
    print("  MARK SEATS (model space) -- a mark is TRANSLATED onto these:")
    print("    %-6s %-22s %-22s %-22s" % ("tier", "hip (a2)", "hand_r (b1)",
                                          "head (b2)"))
    for tier, _fn, _path in BODIES:
        seat = SEATS[tier]
        print("    %-6s %-22s %-22s %-22s" % (
            tier,
            "%.3f %.3f %.3f" % seat["hip"],
            "%.3f %.3f %.3f" % seat["hand_r"],
            "%.3f %.3f %.3f" % seat["head"]))
    print("    a1 seats on the circle at 0.000 0.000 0.000 on every body.")

    # --- THE STRIP, MEASURED ------------------------------------------------
    print("  THE STRIP -- %d poses per band, frame 0 is rest and is the "
          "identity" % CYCLE)
    print("    idle band paced at %.1f s, so one frame is %.2f s; the chant "
          "sways %d times (%.1f s each)"
          % (IDLE_LOOP_SECONDS, IDLE_LOOP_SECONDS / CYCLE, CHANT_BEATS,
             IDLE_LOOP_SECONDS / CHANT_BEATS))
    print("    THE TWO PAGE TEMPOS: block %.1f s, fanned page %.1f s  (%d:1)"
          % (IDLE_LOOP_SECONDS, IDLE_LOOP_SECONDS / PAGE_BEATS, PAGE_BEATS))
    print("    swarm ladder %s at >= %d and >= %d living blubs"
          % (", ".join("x%.2f" % a for a in AGITATION), SWARM_STEPS[0],
             SWARM_STEPS[1]))
    print("    GESTURE BUDGET -- every interval js/blub.js actually uses:")
    row = []
    for iv in (0.5, 3.5, 4.0, 15.0, 18.0, 20.0, 25.0, 30.0, 100.0):
        row.append("%.4g s -> %.2f s" % (iv, gesture_seconds(iv)))
    print("      " + ";  ".join(row))
    print("    TRAVEL in px at board scale, as  group idle/gesture -- the idle")
    print("    is band %d (the top of the swarm ladder) and the gesture is the"
          % (IDLE_BANDS - 1))
    print("    first gesture band. Under ~2 px an idle is not there at all.")
    for name, model in moves:
        parts = []
        for g in model["groups"]:
            if g["name"] == WORLD_FIXED:
                continue
            parts.append("%s %.1f/%.1f"
                         % (g["name"], travel(model, g["name"], IDLE_BANDS - 1),
                            travel(model, g["name"], IDLE_BANDS)))
        print("      %-18s %s" % (name, "  ".join(parts)))


if __name__ == "__main__":
    main()
