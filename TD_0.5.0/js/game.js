// ---------------------------------------------------------------------------
// Game
//
// Owns the path, waves, base health, cash, tower placement, and the main loop.
// ---------------------------------------------------------------------------

var VIEW_WIDTH = 1280;
var VIEW_HEIGHT = 720;
var MAX_CANVAS_SCALE = 3;

// Enemies arrive in finite, data-driven waves. A wave is a TIMELINE:
//
//     { duration, groups: [ { at, count, interval, type?, health?, tier? } ] }
//
// `at` is seconds from the START OF THE WAVE, absolute. The Nth body of a
// group arrives at `group.at + N * group.interval`, N counting from 0. A wave
// says how MANY, how OFTEN, WHEN, and (optionally) WHICH TYPE -- never how
// tough. Health comes from the type's row in Enemy.TYPES; a missing `type` is
// a stock normal. A group may carry a `health` override, which scales a type
// without inventing a tougher one, and a `tier` for the Fractal Slime.
//
// GROUPS ARE INDEPENDENT. They may overlap, start together, or leave the road
// empty between them; the list is not a queue and reading it top to bottom is
// reading the WAVE, not the order of arrivals. Sort order at an equal
// timestamp is (1) the group's index in the array, (2) the body's index in the
// group -- stable, and the only thing that decides a tie.
//
// `duration` is a CEILING on the wave, measured from its start, not a gap
// after its last spawn: when it expires the wave is over, survivors keep
// walking, and the next one is announced. Wave 35 carries none, because there
// is nothing after it.
//
// THIS REPLACED A SEQUENTIAL SCHEDULER on 2026-08-25. Until then a wave's
// groups deployed strictly in order -- each one began when the one above it
// finished, and an optional `lead` bought a pause in place of the previous
// group's interval. `lead` is GONE; there is no flat single-group wave form
// left either, and no wave-level `count`/`interval`. Every entrance in the
// schedule is now a number someone chose rather than a sum of everything
// authored above it, which is why the wave-35 Tyrant's mid-wave arrival could
// only ever be an accident before and is `at: 13` now.
//
// A WAVE MAY BE MIXED (v0.4.7): several groups, several types, deliberately on
// top of each other. Single-TYPE waves are not legacy and half the schedule is
// still one -- a wave of one type is a QUESTION with one answer, and those are
// what teach the game. Mixed waves ask two at once, which is what makes the
// back half feel chaotic rather than merely bigger. "Single-type" is about the
// roster, never about the group count: wave 24 is three salvos of Aether Wisps
// and is as pure as it ever was.
//
// waveGroups() is the one accessor. Nothing else in the game reads a wave's
// fields directly.
//
// CAMO WAVES ARE NEVER MIXED, and that is load-bearing rather than stylistic.
// A Smasher's swing damages whatever it physically reaches, camo included --
// it just will not TURN towards something it cannot see (see the camo table in
// AGENTS.md). With one visible enemy in the wave a detectionless Smasher would
// start swinging and take the camo down as collateral, and the whole
// buy-detection check the schedule is built around would quietly evaporate.
//
// THE V0.4.4 TWENTY-WAVE SPINE IS STILL HERE, IN ORDER. The `old N` tags below
// are that schedule's numbering, and each tagged wave still contains that
// wave's exact type and total count. UNTIL 2026-08-25 it was stronger than
// that -- the tagged wave OPENED with the old wave's exact count/interval/type
// -- and the timeline rewrite is what weakened it: old 2 is still eight stock
// Normals, but they now arrive as 4 + 4 rather than as one group of eight at
// 1 s, so no single group carries the old row any more. The invariant that
// survives, and the one to guard, is the wave's AGGREGATE composition: same
// type, same total count, same health override, per wave. Nothing about the
// escalation curve moved -- see the equivalence note at the top of the array.
// What v0.4.7 changed, earlier, is that some of them
// gained a second group alongside that opening, and the back half's `health`
// overrides were turned up. This was not tidiness: rebuilding the schedule
// from scratch produced an opening the hard route could not survive (the first
// swarm landed at wave 5, when three towers are on the board), and keeping the
// escalation curve underneath the new content is what stops that recurring. If
// you reshape this array, keep that spine intact or re-measure from scratch.
//
// EASY: 35 waves, ~13 500 EFFECTIVE HP (2026-07-29, at the owner's request; it was
// 7776, and v0.4.6 was 33 waves and 4308 flat). "Effective" counts a shield as
// the health it is and a Revenant's second life as the second body it is --
// `waveEffectiveHealth` below is the one implementation of that sum, and both
// the clear bounty and the balance tests read it, so they cannot disagree.
//
// PLUS two amounts that are in no table, both conditional on how the run goes:
// every seven seconds a living Hive drops five hatchlings, each with a shield
// equal to its own life and each paying NOTHING; and the wave-35 boss's roar
// calls in another 274 HP at 1.5x speed. Neither is something the schedule can
// state, because both are decided by how fast the player answers them.
//
// EVERY WAVE FROM 12 ON IS MIXED except six that are single-type on purpose:
// the three camo waves (a mechanical requirement -- see above) and the three
// introductions of a type whose whole lesson is "here is one new problem"
// (angry 13, Bulwark 15, Brute 20, Revenant 21, Hive 26 -- five, and they are
// the smallest waves in the back half for that reason).
//
// Waves 1-2 are the original opening, unchanged -- the tight starting-stake
// decision documented in AGENTS.md depends on their exact shape.
//
// Every type used by this original Easy schedule must keep appearing in it.
// Five later roster additions deliberately stay out of Easy and enter through
// the Normal/Hard additions below. The index derives appearances from all
// three schedules, so those enemies are now campaign content without changing
// the introductory tier.
//
// What each type asks of the player, and where it lands:
//
//   swarm     1 HP each, arriving faster than one tower can pull a trigger.
//             Answered by coverage, not by single-target damage.
//   armored   a flat 20% tax on every hit. Blocks nothing outright.
//   camo      untargetable without detection (Longshot A1 at $300, or the
//             beam's B1). Waves 14 and 18 are small on purpose -- 72 HP
//             between them, which a healthy base can afford to leak while it
//             saves up. Wave 28 is the one that actually demands it.
//   brute     5 FLAT armor, and mitigation has no damage floor, so gunners
//             and the beam do exactly nothing to it. A PLAIN $75 Longshot
//             answers it (10 damage - 5) -- but a board that has not bought
//             one has NO answer at all, which is why the introduction sits at
//             20 and not earlier. See the note on the schedule below.
//   angry     hits back. It is the only enemy that damages TOWERS, so it is
//             the only wave where standing still costs you something you
//             paid for.
//   shielded  (v0.4.7) twice its health again in shield, and DOUBLE SPEED once
//             that shield goes. Asks whether the damage is ready when the
//             shell pops, not whether there is more of it.
//   revenant  (v0.4.7) gets up once, at full health, and never walks again.
//             A toll on the board's attention: a parked body keeps eating
//             shots meant for the wave behind it.
//   hive      (v0.4.7) 150 HP, slow, seeding five normals every seven seconds
//             -- and each of THOSE carries a shield equal to its own life and
//             pays nothing. The Hive itself is ordinary work that pays
//             ordinarily; leaving it alive is what costs, because its brood is
//             unpaid, unscheduled health that keeps arriving.
//   boss      (v0.4.7) the Tyrant, wave 35 only. 5000 HP, and it SILENCES
//             towers rather than destroying them. Answered by having more
//             board than it can switch off at once.
//
// The three v0.4.7 types are all gated behind the midboss (13 onwards), at the
// owner's request: the first eleven waves are the introduction and have no
// vocabulary for a shield or a second life.
//
// Wave 11 is the midboss: one 250 HP enemy behind 10% defense, with a named
// bar across the top of the screen. Its remaining health is what the base pays
// on a leak, so letting it through at full health ends the run outright.
//
// WAVE 35 IS THE BOSS WAVE. The Tyrant walks in MID-WAVE: 5000 HP, the slowest
// thing in the game, and it does not damage towers -- it SHOOTS them and they
// go silent for two seconds. At half health it roars: a 1000 point shield, a
// third again its speed, a third again its rate of fire, and forty bodies
// called back in at 1.5x. All of that is data on the `boss` row in Enemy.TYPES;
// nothing about the fight is special-cased in this file.
//
// Every figure above is read from that row, and each has a second site that
// must move with it: health 5000 and the phase's shield 1000; the roar's rate
// is `attackIntervalMultiplier` 0.75, which is a THIRD again the rate, not
// double; and the forty bodies are the sum of the nine `summon.groups` counts
// (8+10+6+4+2+2+3+3+2). If you retune the boss, re-read this paragraph.
//
// FINISHING A WAVE PAYS a tenth of what it took to clear, on top of the usual
// damage income -- see waveBounty. About $1350 across the run.
//
// ON MEASURING THIS SCHEDULE: the owner has asked that it not be tuned by
// simulation, so these numbers are AUTHORED. The shape they are authored to is
// the one this file has always documented -- a steep back half, every counter
// affordable at the wave that demands it, and the v0.4.4 spine intact
// underneath. The campaign simulator still exists if a future session needs
// to check that a CHANGE did not break something, but it is no longer in
// this repository -- it lives in the bot's own tree, so a clone of this repo
// cannot reproduce its figures. Do not retune from it without being asked.
//
// For the record, the last simulated readings (taken at 7776 HP, before this
// turn-up, and now stale): gunners alone lost on every route by wave 21; a
// board of gunners then Longshots with camo detection won on three of the four
// routes. They are kept only as the shape to watch for, not as targets.
// WAVE_BREAK IS GONE (2026-08-25, with the timeline scheduler). It was 90 s:
// the gap between one wave's LAST SPAWN and the next wave's first, and the
// ceiling on how long a run could sit still.
//
// The timeline moved that ceiling onto the wave itself. `duration` is per-wave
// (30 s to 125 s across the schedule) and it is measured from the wave's own
// start rather than from the end of its deployment, so the thinking room the
// 90 bought is now bought by the part of a wave's own window that nothing is
// walking in. What is left between two waves is a TRANSITION, and a transition
// is never a wait to be sat out: it is 5 s (the wave was eliminated, or its
// duration expired) or 3 s (the player pressed Send, or auto-send did).
//
// Everything the 90 was defended with still holds and now holds per wave:
// idle seconds still earn nothing -- income is a bounty per kill, never a
// trickle -- so a longer window can only ever be thinking room, never farmed.
// What is deliberately gone is the FLOOR under a losing board: a wave that is
// not being killed now ends on its own ceiling and the next one is announced
// on top of the survivors. That is the change, and it is the point of the
// rewrite rather than a side effect of it.

// How long a CALLED wave takes to arrive. 2026-07-29 (v0.4.7), at the owner's
// request: "the next wave is sent after a timer of 3 seconds, whenever the
// skip wave button is clicked or when all enemies from the last wave are
// killed, or of course if the timer of 90 sec ends".
//
// The "timer of 90 sec" in that quote was WAVE_BREAK, which no longer exists:
// since 2026-08-25 the ceiling is per-wave (`duration`) and what it opens is a
// transition rather than a break. THE THREE SECONDS SURVIVED THE REWRITE
// UNCHANGED, and so did the reason for them, which is the half of the quote
// that was about the player rather than about the scheduler.
//
// Three gates end a wave and there are two speeds: the button and auto-send
// take this three, and the two automatic gates -- wiped out, or the wave's own
// ceiling -- take WAVE_CLEAR_DELAY's five. None of them spawns instantly.
// Those three seconds are the whole point of the number: a wave that appeared
// on the same frame as the click gave the player no moment to look up from the
// panel they were reading, and a board that cleared into an instant next wave
// read as a punishment for playing well rather than as the reward it is.
//
// It is a CEILING on the remaining countdown, never an extension -- see
// callNextWave. With under three seconds left the wave is already closer than
// the call would make it, and calling it in must never push it away.
var WAVE_CALL_DELAY = 3;

// How long a wave that was BEATEN takes to be followed. 2026-07-31, at the
// owner's request: "once all the enemies of a wave have been killed, if not on
// auto skip, leave a 5 seconds delay until the next wave."
//
// It is deliberately NOT WAVE_CALL_DELAY, which the board clear used to share.
// The two are different events even though both open a transition: pressing
// Send is the player SAYING they are ready, and three seconds is the beat
// between saying it and it happening. Clearing the board is the game deciding
// for them, and the pause afterwards is the only moment a player who is
// winning gets to look at the board before the next thing walks in. Five is
// what the owner asked for and the reason it is longer than the click is that
// nobody asked for it.
//
// "If not on auto skip" needs no branch: auto-send calls the wave in at
// WAVE_CALL_DELAY every step, callNextWave only ever moves the wave CLOSER, and
// three is closer than five. So auto-skip keeps its three-second cadence and
// everyone else gets the five, out of the same Math.min that has always been
// there.
var WAVE_CLEAR_DELAY = 5;

// The pause before wave 1, at the start of a run. 2026-07-31, at the owner's
// request: "when starting a run, do not send the first wave immediately, either
// wait 10 seconds, or the user can press a start button manually."
//
// Until this, restartGame() spawned wave 1's first enemy ITSELF, on the same
// frame the map was clicked -- the run began with a body already walking and a
// player still reading the board. Ten seconds is enough to place the opening
// tower the starting stake pays for (see the economy section) without being a
// wait, and the Start button is there for the player who already knows where
// that tower goes.
//
// It is a plain countdown into the ordinary scheduler, not a separate "not
// started yet" mode: the run IS running, wave 1 is simply the next wave. That
// is what makes the pause inherit the button, the readout, the auto-send toggle
// and the pause key for free rather than needing a fifth screen state.
var RUN_START_DELAY = 10;
var EASY_WAVES = [
  // --- 1-10: the introduction. One type per wave.
  //
  // Nothing here is mixed and nothing here is new. These ten waves are where
  // the game teaches its five starting bodies one at a time, and the
  // starting-stake economy is measured against their exact shape.
  //
  // WAVES 1-4 KEEP THEIR EXACT COMPOSITION and stay that way. They are the
  // shape the opening purchase is measured against, and 2026-07-30's "make the
  // scaling bigger" is about the CURVE -- turning up the wave that teaches a
  // player what a Slow is would not make the game harder, only slower to get
  // going. From 5 on the `health` overrides start, and they never stop.
  //
  // WHAT THE TIMELINE REWRITE CHANGED, AND WHAT IT DID NOT. Every wave below
  // was re-cut into salvos on an absolute clock; not one body, health override
  // or tier moved. The right-hand HP column, the body counts, the kill
  // bounties and the clear bounties are the same numbers they were before --
  // tests/run.js pins the campaign totals (35 waves, 830 bodies, 25 939
  // effective HP, $2 594 clear, $22 321 kill) and they did not move by a unit.
  // Wave 2's eight Normals are still eight stock Normals with no `health`;
  // they now arrive as two salvos of four rather than as one metronome at 1 s.
  // WHEN changed. WHAT did not. Do not read a re-cut as a retune.
  //
  // The early waves are cut shallowly on purpose -- two or three salvos, and
  // the second one usually tighter than the first, so a player learns that a
  // wave has a SHAPE before any wave uses that shape against them.
  { duration: 32, groups: [                                       //  20 HP  old 1
    { at: 0, count: 5, interval: 0.8 }
  ] },
  { duration: 34, groups: [                                       //  32 HP  old 2
    { at: 0,   count: 4, interval: 1 },
    { at: 4.5, count: 4, interval: 0.65 }
  ] },
  { duration: 30, groups: [                                       //  16 HP  old 3
    { at: 0, count: 2, interval: 0.6,  type: "fast" },
    { at: 2, count: 6, interval: 0.35, type: "fast" }
  ] },
  { duration: 36, groups: [                                       //  48 HP  old 4
    { at: 0, count: 4, interval: 0.45 },
    { at: 3, count: 4, interval: 0.45 },
    { at: 6, count: 4, interval: 0.45 }
  ] },
  { duration: 42, groups: [                                       //  54 HP  old 5
    { at: 0, count: 2, interval: 0.8, type: "slow", health: 9 },
    { at: 4, count: 2, interval: 0.8, type: "slow", health: 9 },
    { at: 8, count: 2, interval: 0.8, type: "slow", health: 9 }
  ] },
  { duration: 34, groups: [                                       //  42 HP  old 6
    { at: 0,   count: 4,  interval: 0.4,  type: "fast", health: 3 },
    { at: 2.2, count: 10, interval: 0.25, type: "fast", health: 3 }
  ] },
  { duration: 30, groups: [                                       //  20 HP  first swarm
    { at: 0,   count: 5,  interval: 0.12, type: "swarm" },
    { at: 1.8, count: 10, interval: 0.1,  type: "swarm" },
    { at: 3.5, count: 5,  interval: 0.12, type: "swarm" }
  ] },
  { duration: 40, groups: [                                       //  96 HP  old 7
    { at: 0, count: 8, interval: 0.55, health: 6 },
    { at: 2, count: 4, interval: 0.4,  health: 6 },
    { at: 5, count: 4, interval: 0.4,  health: 6 }
  ] },
  { duration: 44, groups: [                                       //  70 HP  first 20% defense
    { at: 0,   count: 1, interval: 0.9,  type: "armored", health: 7 },
    { at: 2,   count: 3, interval: 0.8,  type: "armored", health: 7 },
    { at: 4.5, count: 6, interval: 0.55, type: "armored", health: 7 }
  ] },
  { duration: 48, groups: [                                       // 140 HP  old 8
    { at: 0,   count: 5, interval: 1, type: "slow", health: 14 },
    { at: 2.5, count: 5, interval: 1, type: "slow", health: 14 }
  ] },

  // --- 11: THE MIDBOSS. The line the roster is split on.
  //
  // NO HEALTH OVERRIDE, DELIBERATELY. This row carries the midboss type's own
  // 250, so the type row in js/enemy.js is the only place that number lives --
  // edit it there and this wave follows. It is the one wave in the schedule
  // authored that way, and the reason is below.
  //
  // It WAS overridden to 420, from 2026-07-30 to 2026-08-13, to buy the
  // property that a half-answer still loses. Measured, the override cost the
  // wave its entire audience. The starting kit is cash-limited to ten or
  // eleven Riflemen by wave 11 ($3326 is every dollar the schedule has paid by
  // then) and its damage into a single slow body is a hard CEILING that does
  // not move with the midboss's health -- 230 to 416 across the six routes,
  // depending on route length and how well the board was built. 420 sat above
  // five of those six ceilings, so on all but the most generous route no board
  // a player could build answered it. A wall rather than a check, and it ended
  // the run on five of the six routes.
  //
  // 250 restores the check without the wall. The base has 100 HP and pays an
  // enemy's REMAINING health on a leak, so surviving means removing 150 of it.
  // A well-built board kills it outright and walks on; an ordinary one lives on
  // about ten points of base; a board that never got built still dies. That is
  // the shape wave 24 teaches at 90 HP against a 100 HP base -- ruined, warned,
  // and still holding the break in which to fix it.
  //
  // BEFORE RAISING IT AGAIN, measure the kit's ceiling on the weakest route.
  // The knee is exactly ceiling + 100, it is a step and not a gradient, and
  // sweeping this number only chooses which side of it the player lands on.
  //
  // `at: 4` IS THE ONLY THING THE REWRITE GAVE IT, and it is the one wave in
  // the schedule whose first body does not walk in at t=0. Four seconds of an
  // empty road before a single named body is the entrance the midboss never
  // had: under the old scheduler a wave's first enemy spawned on the same
  // frame the wave started, so the banner and the boss arrived together.
  { duration: 60, groups: [                                       // 250 HP
    { at: 4, count: 1, interval: 1, type: "midboss" }
  ] },

  // --- 12-21: the second roster, one new type at a time.
  //
  // Every INTRODUCTION here is a single-type wave and a small one -- meeting a
  // Brute for the first time should be a question with one answer, not a
  // question buried in a crowd. The waves between them are where the mixing
  // starts, and they mix things the player already understands.
  //
  // THE ORDER OF THE INTRODUCTIONS IS MEASURED, NOT CHOSEN. v0.4.6 introduced
  // the angry at 13, camo at 14, camo_fast at 17 and the BRUTE at 19, and that
  // last one is load-bearing: a gunner does literally nothing to a Brute, so
  // the wave is unanswerable until the player owns something that hits for
  // more than 5. Moving the Brute intro to 13 was tried here and measured --
  // it kills a competent 30-tower board on null-meridian outright. It is back
  // at 20, and the three new types are fitted around that order rather than
  // through it.
  // --- THE CURVE RETUNE (2026-08-13). THREE WAVES: 12, 13 and 16.
  //
  // It was designed for twelve and it landed on three. The other nine are
  // named below with the reason each is held, because a comment describing a
  // change bigger than the diff is how this file has misled people before.
  //
  // The three rows marked RETUNED were rewritten by one rule, per GROUP:
  // `health -> health / 2`, `count -> round(count x 2 x 1.25)`.
  //
  // It is two operations with two different jobs, and they are separable:
  //
  //   THE SWAP (k = 2) is `health / 2, count x 2` and is EXACTLY income
  //   neutral. `Enemy.bountyOf` is `round(type.bounty x health / type.health)`
  //   and a group pays `count x` that, so `count x health` is the invariant --
  //   halving one while doubling the other holds total HP, and therefore kill
  //   income, fixed by construction. It buys TEXTURE and nothing else: more,
  //   smaller bodies for the same work and the same money.
  //
  //   THE INFLATION (m = 1.25) is the extra `x 1.25` on the count, and it is
  //   the only part that moves anything. It raises these three waves' health
  //   25% -- and the schedule's by 0.38%, which is the honest size of a
  //   three-wave change: 25 799 -> 25 898 effective, 797 -> 866 bodies.
  //
  // NO BOUNTY HAIRCUT (b = 1.00), deliberately, because the inflation IS the
  // cash cut and a second site would double-count it. The purse is
  // `600 + kill + waveBonus + 9505 fixed`, and that fixed 26% knows nothing
  // about the schedule -- so inflating HP raises the purse by less, and money
  // density (purse / effective HP) falls on its own. AT THIS SCOPE THAT IS
  // ALMOST NOTHING: 36 017 / 25 799 = 1.3961 becomes 36 133 / 25 898 =
  // 1.3952, -0.07%. Do not quote this patch as having moved the difficulty
  // curve. It moved three waves; the curve is still the one measured before.
  //
  // WHICH GROUPS MOVE. Only where `Enemy.healthOf` resolves EVEN (so `/2` is
  // exact and no HP is invented by rounding), `count > 1`, and the type is not
  // a single-purpose body. Halving a Hive, Shieldbearer, Healer, Colossus,
  // Fractal Slime or boss into two is a design change, not a texture change:
  // they carry a mechanism per body, so doubling the body doubles the
  // mechanism.
  //
  // WHY THESE THREE AND NOT THE OTHERS -- land what a player can reach, hold
  // what is past the wall. The upgrading policy that plays this schedule today
  // reaches wave 20 and dies to the Brute. Waves 12, 13 and 16 are inside what
  // a run actually sees, so a change to them is a change someone can report
  // on; 19 onward is past that point and would be tuned blind.
  //
  // HELD, NOT REJECTED -- 19, 21, 22, 23, 27, 31, 32 and 33. Two independent
  // grounds, either of which is sufficient:
  //
  //   1. MEASURED PEAK LOAD FALLS. `interval` is untouched, so a retuned group
  //      puts 2.5x the bodies out at the old spacing with half the health
  //      each. Simulated one wave per boot with no towers, peak effective HP
  //      on the road across the twelve went 10 070 -> 8 482, **-15.8% while
  //      authored HP rose 25%**, and the waves ran 3.9 minutes longer. Eight
  //      of twelve got LIGHTER at their peak moment. Wave 31: 1510 -> 1085.
  //      An analytic model predicted +18% and was wrong, because a wave that
  //      deploys over 87 s instead of 45 s no longer overlaps itself.
  //      The derived correction is dividing each retuned group's `interval`
  //      by 2.5, which restores the window and turns -16% into +25%. It is not
  //      in this patch. DO NOT WIDEN THE SCOPE WITHOUT IT.
  //
  //      EVERY DEPLOY WINDOW QUOTED IN THIS PARAGRAPH IS PRE-TIMELINE. It was
  //      measured against the scheduler that ran until 2026-08-25, where a
  //      wave's length was the accumulated sum of its groups' intervals and
  //      leads. Under the timeline every wave deploys in the window its `at`
  //      values and `duration` state, and none of them is 87 s -- the longest
  //      deploy in the schedule is wave 35's 28 s. The HP and count arithmetic
  //      the paragraph justifies is unaffected; the seconds are history.
  //
  //   2. THE v0.4.4 SPINE. tests/run.js:432 pins each of the twenty original
  //      waves to the exact count, interval and type of the group that OPENS
  //      its wave. Seven of the held eight are old-wave openers, and the
  //      retune changes their counts. That table is the only surviving record
  //      of a curve someone measured and it cannot be re-derived, so it is
  //      held rather than re-pinned. Waves 12, 13 and 16 open with groups the
  //      rule does not touch, which is why these three land free of it.
  //
  //      THAT PIN NO LONGER MATCHES THE DATA, because the timeline cuts an old
  //      wave's opening into salvos: old 2 is still eight Normals, but the
  //      group that opens wave 2 is four of them at 0.65, not eight at 1. The
  //      spine survives as the wave's AGGREGATE composition -- see the header
  //      note above the array -- and the guard has to be re-keyed onto that
  //      sum. Do not re-key it onto interval + type: that key is NOT UNIQUE --
  //      old 6 and old 12 are both fast@0.4, and waves 14 and 28 both open
  //      camo_normal@0.9.
  //
  // WAVE 21 IS HELD EVEN THOUGH THE SPINE PERMITS IT. 6 -> 15 Revenants is
  // 2.5x the revive events in one wave, and it sits past the wall where
  // nothing can measure what that does.
  //
  // ALSO EXCLUDED, by design rather than by caution -- 1-10 (the tutorial, the
  // shape the opening purchase is measured against), 11 (the midboss, one
  // authored body), 14/15/18/20/24 (pure counter waves: they ask for a
  // PURCHASE, not for damage, and all five resolve ODD so the rule is a no-op
  // on them anyway), 17 (in the original twelve, and a no-op for the same
  // reason -- its groups are 3, 13 and 7), 25 (the Fractal Slime cascade),
  // 26 and 30 (spawners: a brood is unscheduled and pays nothing), 28 (the
  // camo blackout), 29 (the Colossus spike), 34 and 35 (the boss waves).
  //
  // WAVE 12 CARRIES THE SAME REGRESSION AT A SIZE WORTH ACCEPTING: measured
  // peak load 222 -> 164. That measurement is also pre-timeline; under the
  // timeline the wave deploys over 19.1 s inside a 48 s limit, and the
  // first Normal salvo lands at 4 s, ON TOP of the Fast and the Swarm rather
  // than behind them. It is the one landed wave where the interval correction
  // would show, and it is early enough that a player reports it rather than a
  // simulator inferring it.
  //
  // The Swarm is one 40-body group and stays one: forty specks at 0.2 IS the
  // texture, and cutting it into salvos would put gaps in the one wave whose
  // job is to have none.
  { duration: 48, groups: [                                       // 280 HP  old 9 + company -- RETUNED
    { at: 0,   count: 18, interval: 0.35, type: "fast", health: 5 },
    { at: 1.5, count: 40, interval: 0.2,  type: "swarm", health: 1 },
    { at: 4,   count: 15, interval: 0.65, health: 5 },
    { at: 10,  count: 15, interval: 0.65, health: 5 }
  ] },
  // 13, THE ANGRY'S INTRODUCTION. Still twenty Angries and still 180 points,
  // now as five salvos of four every 4.5 s instead of one 28.5 s drip at 1.5.
  // The wave that teaches "this one shoots back" is the wave where standing
  // still costs something, and a pulse gives the player a beat between waves
  // of fire to move a tower in.
  { duration: 52, groups: [                                       // 180 HP  first attacker -- PURE, RETUNED
    { at: 0,    count: 4, interval: 0.45, type: "angry", health: 9 },
    { at: 4.5,  count: 4, interval: 0.45, type: "angry", health: 9 },
    { at: 9,    count: 4, interval: 0.45, type: "angry", health: 9 },
    { at: 13.5, count: 4, interval: 0.45, type: "angry", health: 9 },
    { at: 18,   count: 4, interval: 0.45, type: "angry", health: 9 }
  ] },
  { duration: 38, groups: [                                       //  70 HP  first camo -- PURE
    { at: 0, count: 3, interval: 0.6,  type: "camo_normal", health: 7 },
    { at: 4, count: 7, interval: 0.65, type: "camo_normal", health: 7 }
  ] },
  { duration: 45, groups: [                                       // 225 HP  first shield -- PURE
    { at: 0, count: 1, interval: 2.2, type: "shielded", health: 15 },
    { at: 4, count: 2, interval: 0.6, type: "shielded", health: 15 },
    { at: 8, count: 2, interval: 0.6, type: "shielded", health: 15 }
  ] },
  // --- THE FRACTAL SLIME'S TIER LADDER, 16 / 17 / 22 / 25 / 33 / 35 -------
  //
  // 2026-08-20, at the owner's instruction: "i want the slime tiers to spawn
  // in accordance to their HP as stated in the index and behave in that
  // manner". The index has always printed all six rungs -- T0 = 1, T1 = 4,
  // T2 = 16, T3 = 64, T4 = 256, T5 = 1024 -- and until this patch the campaign
  // sent exactly one of them, the T3 in wave 25. The other five existed only
  // as somebody else's split children, so the guide was advertising a ladder
  // the schedule never climbed.
  //
  // ONE RUNG PER WAVE, ASCENDING, AND THE HP IS THE PLACEMENT RULE. Each tier
  // sits in the first wave heavy enough to carry it, which is why the gaps
  // widen as they do: 1 and 4 points are texture in an early mixed wave, 16
  // is a body, 64 is the event wave 25 was already built around, 256 is a
  // second boss-weight body in 33, and 1024 has exactly one home in a
  // thirty-five wave schedule.
  //
  // WHAT A RUNG ACTUALLY COSTS IS NOT ITS ROOT. A tier T root takes
  // root x (T + 1) points to clear -- it conserves health as it divides, four
  // bodies at a quarter each -- and leaves 4^T terminal T0s walking:
  //
  //     T0     1 HP        1 point        1 body
  //     T1     4 HP        8 points       5 bodies
  //     T2    16 HP       48 points      21 bodies
  //     T3    64 HP      256 points      85 bodies
  //     T4   256 HP    1 280 points     341 bodies
  //     T5  1024 HP    6 144 points   1 365 bodies
  //
  // The base has 100 HP and a leak costs the leaker's remaining health, so the
  // right column is the difficulty that matters: a T5 that is not cleared is
  // 1 024 separate points of base damage arriving one at a time. That, not the
  // root, is why T4 waits for 33 and T5 for the Tyrant's wave.
  //
  // THE SCHEDULE PAID FOR IT RATHER THAN GROWING BY IT. Authored effective HP
  // moved 25 898 -> 25 939, +0.16%: wave 33 funds its T4 exactly (two Bulwarks
  // and a Brute), wave 35 covers -340 of the T5's 1024 and waves 27, 29, 30,
  // 31, 32 and 34 give up 641 more at 5-9% each -- 1 267 trimmed against 1 308
  // added, and the 41 points of difference ARE the whole rise. NOTHING WAS TAKEN
  // OFF A SPINE OPENER or off a mechanism body -- see the retune note above:
  // halving a Hive, Shieldbearer, Healer or Colossus is a design change, not a
  // trim -- so what got thinner is ordinary escort. The curve someone measured
  // is still the curve; tests/run.js pins both totals.
  //
  // AND THE REAL LOAD DID GO UP, WHICH IS THE POINT. Authored says +41; a
  // board that clears every cascade removes 7 748 points where the six roots
  // count 1 372, and it earns the difference back at half rate ($3 874 across
  // the generations against the $686 of roots the purse counts). 1 826 bodies
  // are born to do it. Do not quote the authored figure as if the schedule
  // were unchanged.
  //
  // DO NOT GIVE A FRACTAL GROUP A `health` OVERRIDE, here or in any later
  // retune. `fractal_slime` DISCARDS one at every value: `fractalTierOf`
  // resolves undefined to the default tier, so the constructor always holds a
  // tier and `Enemy.healthOf` takes the tier branch. Writing `health` would be
  // a no-op on the body and NOT a no-op on the accounting -- `waveKillBounty`
  // would declare income for a body that never got tougher. Scale the TIER, or
  // scale the type row in js/enemy.js; not this. tests/content.test.js checks
  // the whole schedule for one, because the mistake is invisible in play.
  //
  // A RUNG IS ONE `at`, NOT ONE GROUP, since the timeline. Wave 16's four T0s
  // are four one-body groups at 1, 5, 9 and 13 s rather than one group of four
  // at 0.9 spacing -- same four bodies, same tier, spread across the wave
  // instead of bunched at the end of it. Read the ladder off the tiers, never
  // off the group count.
  //
  // T0 OPENS THE LADDER IN 16 AND IS THE ONE RUNG THAT DOES NOT DIVIDE. Four
  // 1 HP bodies among two dozen Swarm: the player meets the terminal rung as
  // harmless texture first, so that when wave 17's T1 breaks apart, what it
  // breaks into is already familiar. It is deliberately NOT in wave 12 -- that
  // wave is the suite's mixed-wave fixture (tests/run.js), and a fixture that
  // changes shape whenever content lands is a fixture that stops testing the
  // scheduler.
  { duration: 58, groups: [                                       // 406 HP  old 10 + company -- RETUNED
    { at: 0,   count: 14, interval: 0.8,  type: "slow", health: 15 },
    { at: 1,   count: 1,  interval: 0.9,  type: "fractal_slime", tier: 0 },
    { at: 1.5, count: 24, interval: 0.18, type: "swarm", health: 3 },
    { at: 5,   count: 1,  interval: 0.9,  type: "fractal_slime", tier: 0 },
    { at: 5.5, count: 24, interval: 0.55, type: "armored", health: 5 },
    { at: 9,   count: 1,  interval: 0.9,  type: "fractal_slime", tier: 0 },
    { at: 13,  count: 1,  interval: 0.9,  type: "fractal_slime", tier: 0 }
  ] },
  // T1, AND THE FIRST DIVISION THE PLAYER EVER SEES. Two 4 HP bodies that
  // each leave four of wave 16's T0s behind: eight points of scheduled health
  // teaching a mechanic that will later arrive as 6 144. Cheap on purpose --
  // the lesson has to be survivable by a board that has not been built for it.
  // The two roots are 6.5 s apart, at 4 and 10.5, so the second division
  // happens while the first cascade is still on the road: the lesson is shown
  // once and then immediately asked for.
  { duration: 55, groups: [                                       // 383 HP
    { at: 0,    count: 27, interval: 0.18, type: "swarm", health: 3 },
    { at: 2,    count: 14, interval: 0.55, health: 13 },
    { at: 4,    count: 1,  interval: 2,    type: "fractal_slime", tier: 1 },
    { at: 4.5,  count: 16, interval: 0.3,  type: "fast", health: 7 },
    { at: 10.5, count: 1,  interval: 2,    type: "fractal_slime", tier: 1 }
  ] },
  { duration: 38, groups: [                                       // 108 HP  camo again -- PURE
    { at: 0, count: 4, interval: 0.25, type: "camo_fast", health: 9 },
    { at: 4, count: 4, interval: 0.25, type: "camo_fast", health: 9 },
    { at: 8, count: 4, interval: 0.25, type: "camo_fast", health: 9 }
  ] },
  { duration: 55, groups: [                                       // 668 HP  old 11 + company
    { at: 0,   count: 16, interval: 0.5,  health: 18 },
    { at: 1.2, count: 7,  interval: 0.25, type: "fast", health: 10 },
    { at: 2.5, count: 5,  interval: 0.9,  type: "shielded", health: 16 },
    { at: 6,   count: 7,  interval: 0.25, type: "fast", health: 10 }
  ] },
  // 20, THE BRUTE'S INTRODUCTION, and the wave the whole introduction order is
  // built around: a gunner does nothing to it, so a board without a Longshot
  // has no answer at all. Four bodies five seconds apart rather than four at
  // 2.5 -- the question is asked four separate times, which is what makes it a
  // check the player can still fail slowly instead of all at once.
  { duration: 55, groups: [                                       // 300 HP  first flat armor -- PURE
    { at: 0,  count: 1, interval: 2.5, type: "brute", health: 75 },
    { at: 5,  count: 1, interval: 2.5, type: "brute", health: 75 },
    { at: 10, count: 1, interval: 2.5, type: "brute", health: 75 },
    { at: 15, count: 1, interval: 2.5, type: "brute", health: 75 }
  ] },
  { duration: 58, groups: [                                       // 312 HP  first second wind -- PURE
    { at: 0,  count: 2, interval: 0.8, type: "revenant", health: 26 },
    { at: 6,  count: 2, interval: 0.8, type: "revenant", health: 26 },
    { at: 12, count: 2, interval: 0.8, type: "revenant", health: 26 }
  ] },

  // --- 22-34: the back half. Three or four types a wave, every wave.
  //
  // The `health` overrides climb steeply from here — that is where the bulk of
  // the schedule's HP lives: 23 796 scheduled points across 35 waves after the
  // retune above (23 697 before it), of which waves 22-34 hold 13 900 -- and
  // that back-half figure is UNCHANGED, because the retune landed on three
  // early waves only. They scale a type without inventing a tougher one, and
  // they never touch
  // defences: a 70 HP Brute still carries its 5 flat armor, a scaled Bulwark
  // still gets twice its (new) health in shield and still doubles its speed
  // when that breaks.
  //
  // The "13 500" this comment used to quote was a fossil of a schedule two
  // rescales ago; it is also still in js/towers/long-range-dps.config.js and
  // in old CHANGELOG entries, where it is history and should stay.
  //
  // THE BACK HALF IS WHERE THE TIMELINE ACTUALLY SHOWS. Under the old
  // scheduler these waves were a queue: every group waited for the one above
  // it to finish, so a wave with a Brute group behind a Fast group never had a
  // Brute and a Fast on the road at the same moment unless the Fast leaked.
  // The `at` values below overlap them on purpose -- the escort and the thing
  // it escorts arrive together, which is what "three or four types a wave"
  // was always meant to mean.
  { duration: 62, groups: [                                       // 652 HP  old 12 + company
    { at: 0,   count: 12, interval: 0.4,  type: "fast", health: 18 },
    { at: 1.6, count: 4,  interval: 2.2,  type: "brute", health: 85 },
    { at: 3,   count: 20, interval: 0.15, type: "swarm", health: 4 },
    // T2: 16 points that become 21 bodies. The first rung that is a BODY
    // rather than texture, and the first that asks for a second answer -- the
    // Brutes above it want the Longshot's flat 10, and twenty-one small
    // slimes want coverage. It enters at 11 s, which is 2.8 s after the last
    // Brute and 5.1 s after the last speck, so the two questions are not
    // asked in the same breath.
    { at: 11,  count: 1,  interval: 1,    type: "fractal_slime", tier: 2 }
  ] },
  { duration: 65, groups: [                                       // 760 HP  old 13 + company
    { at: 0,   count: 14, interval: 0.7, type: "slow", health: 26 },
    { at: 2.5, count: 6,  interval: 1.4, type: "angry", health: 30 },
    { at: 5,   count: 4,  interval: 1.4, type: "shielded", health: 18 }
  ] },

  // --- 24: THE SKY OPENS. The Aether Wisp's only pure wave. --------------
  //
  // PURE for the same reason the camo waves are, and the reason is the Smasher
  // again: it will not turn towards something it cannot see, but its swing
  // damages whatever it physically reaches. One ground body in this wave and a
  // board with no air reach would clear the flyers as collateral, and the one
  // question this wave exists to ask would evaporate.
  //
  // PURE MEANS ONE TYPE, NOT ONE GROUP. The wave is three salvos of Aether
  // Wisps and nothing else, which is the rule the Smasher argument actually
  // needs: nothing VISIBLE-and-groundbound walks beside them. Any guard that
  // states this as "wave 24 holds one group" is stating the old data format,
  // not the design rule.
  //
  // 90 HP against a 100 HP base, deliberately. A player who never bought air
  // reach leaks the entire wave and lives on ten points -- ruined, warned, and
  // still holding the break in which to fix it. That is a harder version of
  // what waves 14 and 18 do for camo, and it is the last free lesson in the
  // campaign: flyers ride along in 31 and 35, and in the Tyrant's roar, with
  // everything else.
  { duration: 45, groups: [                                       //  90 HP  first flight -- PURE
    { at: 0, count: 2, interval: 0.5,  type: "flying", health: 9 },
    { at: 3, count: 4, interval: 0.35, type: "flying", health: 9 },
    { at: 6, count: 4, interval: 0.35, type: "flying", health: 9 }
  ] },

  // T3, the middle rung and the wave this whole cascade was designed around.
  // One 64 HP body which divides through T2, T1 and T0 when killed. Only the
  // root is authored here; all 84 descendants are produced by the one type's
  // `fractal` block.
  //
  // NO LONGER THE INTRODUCTION. Until 2026-08-20 this was the only Fractal
  // Slime in the campaign, so it had to be first sight, first division and
  // first cascade all at once; 16, 17 and 22 now do that work, and what is
  // left here is the escalation this wave was already sized for. Nothing about
  // the group changed -- it is the same T3, the same one body, and it still
  // arrives alone at the end of the deploy.
  //
  // THE ROOT ENTERS AT 15 s AND THE REST OF THE WAVE IS DONE AT 10.3, so it
  // still walks into a silence -- that is the same property the old `lead: 6`
  // bought, now stated as an absolute time instead of as a pause appended to
  // whatever ran before it. Until 2026-08-12 the tier never reached the
  // spawner, so this group put a 4 HP T1 on the road and the gap did not
  // matter; with the tier arriving, the same beat has to cover a body that
  // divides four times. The gap lets the wave's other 35 bodies clear first,
  // so the cascade resolves on an emptying road instead of on top of the
  // Armored. It buys ROOM, not difficulty: the cascade conserves health --
  // four bodies at a quarter each, so never more than the root's 64 points are
  // in flight -- and measured peak concurrency does not rise.
  //
  // IT IS NOW A REAL GAP AND NOT A DRIFTING ONE. Under the old scheduler the
  // root's entrance was the sum of every interval and lead above it, so
  // re-timing any group in this wave silently moved the cascade. `at: 15` is
  // the one number that decides it.
  { duration: 78, groups: [                                       // 984 effective HP + split generations
    { at: 0,  count: 20, interval: 0.45, health: 22 },
    { at: 2,  count: 5,  interval: 0.9,  type: "shielded", health: 20 },
    { at: 4,  count: 10, interval: 0.7,  type: "armored", health: 18 },
    { at: 15, count: 1,  interval: 1,    type: "fractal_slime", tier: 3 }
  ] },
  { duration: 75, groups: [                                       // 440 HP  first spawner -- its BROOD is the cost
    { at: 0,   count: 1, interval: 5, type: "hive", health: 220 },
    { at: 3.5, count: 1, interval: 5, type: "hive", health: 220 }
  ] },

  // --- 27: THE PHALANX. The Shieldbearer's introduction. ------------------
  //
  // Two supporters INSIDE an otherwise ordinary wave -- at 2.5 s and 7.5 s,
  // while the Fast are still crossing and the Armored are still arriving.
  // Every ten seconds each one hands 20 points of STACKING shield to the ten
  // strongest bodies on the road without raising any bounty -- so this wave
  // gets steadily more expensive for exactly as long as the player ignores the
  // two slowest things in it. Left alone for a minute, twelve Armored are
  // wearing 240 points of extra plating between them.
  //
  // THEY USED TO BE AT THE BACK, because the old scheduler could not put them
  // anywhere else: a group started when the group above it finished. Splitting
  // them and moving them INTO the wave is what makes the lesson land -- a
  // supporter behind a wave that is already dead is a supporter propping up
  // nothing, and the player never sees what it does.
  //
  // The lesson is stated by the arithmetic, not by the readout: shoot the
  // support, not what it is propping up.
  { duration: 75, groups: [                                       // 808 HP  old 15 + the support
    { at: 0,   count: 18, interval: 0.3, type: "fast", health: 16 },
    { at: 1.5, count: 10, interval: 0.6, type: "armored", health: 20 },
    { at: 2.5, count: 1,  interval: 3,   type: "shieldbearer", health: 160 },
    { at: 7.5, count: 1,  interval: 3,   type: "shieldbearer", health: 160 }
  ] },

  // --- 28: THE BLACKOUT. Two kinds of camo and nothing else. --------------
  //
  // The camo wave that BITES, and since 2026-07-30 it bites twice: Camo
  // Normals to be seen, and six Camo Heavies behind 5 flat armor and 20%
  // defense to be HURT. Detection alone answers the first group and does
  // nothing at all about the second -- a Soldier's B3 buys sight of a body its
  // damage cannot dent.
  //
  // STILL A CAMO WAVE UNDER THE RULE, which is about nothing VISIBLE walking
  // beside camo rather than about a wave holding one group. Both groups are
  // camo, so a detectionless Smasher still has nothing to start swinging at.
  // And they now OVERLAP -- the Heavies open at 1.5 s rather than behind the
  // Normals -- so the two kinds are on the road together, which is the point
  // of sending both.
  { duration: 65, groups: [                                       // 486 HP  ALL CAMO
    { at: 0,   count: 12, interval: 0.9, type: "camo_normal", health: 18 },
    { at: 1.5, count: 6,  interval: 1.6, type: "camo_heavy", health: 45 }
  ] },

  { duration: 90, groups: [                                       // 1907 HP  old 16 + Colossus + escort
    { at: 0,   count: 16, interval: 0.6, type: "slow", health: 34 },
    { at: 2,   count: 4,  interval: 0.9, type: "shielded", health: 24 },
    { at: 4.5, count: 1,  interval: 2.5, type: "shieldbearer", health: 120 },
    { at: 5,   count: 3,  interval: 2.2, type: "brute", health: 95 },
    // The Colossus at 7 s, with a Shieldbearer 2.5 s ahead of it and a second
    // one four seconds behind: the spike walks in already propped up, which
    // is the whole shape of this wave.
    { at: 7,   count: 1,  interval: 1,   type: "colossus" },
    { at: 11,  count: 1,  interval: 2.5, type: "shieldbearer", health: 120 }
  ] },

  // --- 30: THE NURSERY. Three Hives, and two Shieldbearers among them. ----
  //
  // The nastiest arithmetic in the schedule, and none of it is in the 1136.
  // Three living Hives drop fifteen hatchlings every seven seconds, each one
  // already wearing its own life again in shield and each one paying NOTHING.
  // The Shieldbearers then pulse onto the ten STRONGEST bodies on the road --
  // which, while three Hives are alive, means the Hives.
  //
  // So the wave defends its own engine. Kill the Shieldbearers and the Hives
  // are ordinary work; kill the Hives and the Shieldbearers are propping up a
  // crowd of specks. Do neither and the road fills faster than any board can
  // empty it.
  //
  // TWELVE GROUPS AND THREE TYPES INTERLEAVED, which is the most finely cut
  // wave in the schedule and the clearest thing the timeline bought. A Hive at
  // 0, 3.5 and 7; a Shieldbearer at 2 and 8.5; a burst of Swarm at 1, 5 and 9;
  // an Angry at 4, 7, 10 and 13. The engine is running before the first
  // supporter lands, and the specks arrive between the Hives rather than after
  // all three of them. Aggregate composition is unchanged: 3 Hives, 2
  // Shieldbearers, 24 Swarm, 4 Angry.
  { duration: 95, groups: [                                       // 1136 HP + broods + free shield
    { at: 0,   count: 1, interval: 6,    type: "hive", health: 180 },
    { at: 1,   count: 8, interval: 0.12, type: "swarm", health: 5 },
    { at: 2,   count: 1, interval: 4,    type: "shieldbearer", health: 170 },
    { at: 3.5, count: 1, interval: 6,    type: "hive", health: 180 },
    { at: 4,   count: 1, interval: 1.4,  type: "angry", health: 34 },
    { at: 5,   count: 8, interval: 0.12, type: "swarm", health: 5 },
    { at: 7,   count: 1, interval: 6,    type: "hive", health: 180 },
    { at: 7,   count: 1, interval: 1.4,  type: "angry", health: 34 },
    { at: 8.5, count: 1, interval: 4,    type: "shieldbearer", health: 170 },
    { at: 9,   count: 8, interval: 0.12, type: "swarm", health: 5 },
    { at: 10,  count: 1, interval: 1.4,  type: "angry", health: 34 },
    { at: 13,  count: 1, interval: 1.4,  type: "angry", health: 34 }
  ] },
  { duration: 85, groups: [                                       // 1384 HP  old 17 + company
    { at: 0, count: 24, interval: 0.4, health: 26 },
    { at: 1, count: 10, interval: 0.5, type: "flying", health: 13 },
    { at: 3, count: 3,  interval: 2.2, type: "brute", health: 100 },
    { at: 6, count: 5,  interval: 1.6, type: "shielded", health: 22 }
  ] },

  // --- 32: THE FIELD HOSPITAL. The Healer's introduction. ----------------
  //
  // Three Healers and four Revenants in the same wave, which is the whole
  // joke: the Revenant already gets up once at full health, and the Healers
  // put 60 points onto whichever three bodies the board has just spent its
  // shots on. Healing never raises a body's fixed kill bounty, so every point
  // of it is extra work.
  //
  // The counter is burst, not throughput. A pulse lands every eight seconds
  // and heals over four -- damage that arrives faster than 15 HP/s outruns it,
  // damage that trickles never does.
  //
  // THE THREE HEALERS ARE SPREAD, at 2, 6 and 10 s, rather than sent as one
  // group. Three pulses on three different clocks is a floor of healing across
  // the whole wave instead of one synchronised burst a board can simply wait
  // out, and it is the same three bodies and the same 780 points either way.
  { duration: 100, groups: [                                      // 1572 HP  old 18 + the support
    { at: 0,  count: 20, interval: 0.28, type: "fast", health: 18 },
    { at: 1,  count: 8,  interval: 0.6,  type: "armored", health: 22 },
    { at: 2,  count: 1,  interval: 2.5,  type: "healer", health: 260 },
    { at: 3,  count: 4,  interval: 1.6,  type: "revenant", health: 32 },
    { at: 6,  count: 1,  interval: 2.5,  type: "healer", health: 260 },
    { at: 10, count: 1,  interval: 2.5,  type: "healer", health: 260 }
  ] },
  { duration: 125, groups: [                                      // 1952 HP  old 19 + company
    { at: 0,  count: 18, interval: 0.55, type: "slow", health: 38 },
    { at: 2,  count: 1,  interval: 5,    type: "hive", health: 200 },
    { at: 3,  count: 4,  interval: 1.6,  type: "shielded", health: 26 },
    { at: 5,  count: 3,  interval: 2.2,  type: "brute", health: 100 },
    { at: 7,  count: 1,  interval: 5,    type: "hive", health: 200 },
    // T4. 256 points of root, 1 280 to clear, and 256 terminal bodies against
    // a 100 HP base -- so this is the wave that asks whether the board can
    // WIPE rather than snipe, one wave before the two that end the campaign.
    // It cost this wave exactly what it is worth: the fourth Brute and two of
    // the six Bulwarks paid for it, and 1952 HP is unchanged.
    //
    // At 15 s it lands 5.6 s after the last Brute, on a road that still has
    // two Hives seeding on it -- the cascade and the broods overlap, which is
    // the rehearsal for 35.
    { at: 15, count: 1,  interval: 1,    type: "fractal_slime", tier: 4 }
  ] },

  // --- 34: THE VANGUARD. The first of the two boss waves. ----------------
  //
  // It arrives INSIDE the river of swarm, at 2.2 s while the specks are still
  // pouring out at 0.15 -- and it does not walk in, it SPRINTS the first
  // 400 u.l. at 175 u.l./s, the fastest anything in this game moves, across
  // the ground where a board is always thinnest. Every seven seconds it
  // refreshes 100 points of shield, which never stacks: a board that cannot
  // take 100 shield plus a slice of health off it inside seven seconds never
  // touches the body at all.
  //
  // IT USED TO ARRIVE FOUR SECONDS AFTER THE LAST SPECK, because the old
  // scheduler could only queue it behind them. Sending it through the river
  // instead of after it is the point of the wave: the swarm is cover, and a
  // board that stops shooting the specks to deal with the boss lets the specks
  // through, which is the trade this wave exists to force.
  //
  // AND TWO SHIELDBEARERS COME IN WITH IT -- one at 0.8 s, ahead of the boss,
  // and one at 5 s behind it. Support has no reach limit and picks the
  // strongest thing on the road, which is the Vanguard by a factor of seven --
  // so the escort keeps stacking 40 more points onto it every ten seconds from
  // the back of the map, on top of its own refresh, and the first one is
  // already in position before the boss appears. The answer is to kill two
  // 180 HP supporters while the boss is in front of you, which is the same
  // lesson as wave 27 asked at a moment when there is no room to learn it.
  { duration: 110, groups: [                                      // 2364 HP + free shield
    { at: 0,   count: 24, interval: 0.15, type: "swarm", health: 6 },
    { at: 0.8, count: 1,  interval: 3,    type: "shieldbearer", health: 180 },
    { at: 2.2, count: 1,  interval: 1,    type: "boss_fast", health: 1400 },
    { at: 3,   count: 13, interval: 0.3,  type: "fast", health: 20 },
    { at: 5,   count: 1,  interval: 3,    type: "shieldbearer", health: 180 },
    { at: 6,   count: 5,  interval: 0.9,  type: "angry", health: 40 }
  ] },

  // --- 35: THE BOSS WAVE. -------------------------------------------------
  //
  // 7684 effective HP, of which 5000 is the Tyrant itself, and it arrives IN
  // THE MIDDLE of the wave rather than at its head (2026-07-29, at the owner's
  // request).
  //
  // NO `duration`. It is the only wave in the schedule without one, and the
  // absence is the data saying "there is no next wave": nothing to time out
  // into, no Send button, no countdown. The run ends when this wave's last
  // scheduled body has spawned and the road -- descendants, broods and summons
  // included -- is empty.
  //
  // THE DEPLOY IS 28 SECONDS, and it reads left to right off the `at` column
  // below. Thirty Normals cross the first ten of them, in two salvos of
  // fifteen at 0 and 5; six Aether Wisps come over the top of them at 2; then
  // a THREE SECOND SILENCE, from 9.9 to 13 -- the second longest gap in the
  // wave, behind the 6.4 s from 21.6 to 28 that clears the stage for the T5 --
  // and the Tyrant walks in at 13, at 46% of the deploy, dead on the
  // halfway point. Seven Angries from 15 and four Bulwarks from 17 arrive
  // behind it while it is still crossing. The T5 closes the wave at 28.
  //
  // 13 IS AN ABSOLUTE TIME AND THAT IS WHY IT LANDS. The entrance used to be
  // `lead: 6` -- six seconds appended to whatever the groups above it happened
  // to take -- so the boss's moment drifted every time any earlier group was
  // re-timed, and "mid-wave" was an accident that held. It is now a number
  // someone chose, and tests/run.js can pin it against the deploy length.
  //
  // THE WISPS ARE IN FRONT OF IT ON PURPOSE. A board that answered wave 24 by
  // buying one tower with air reach now has to decide whether that tower is
  // spending the boss fight looking up. Everything in this wave is something
  // the campaign has already taught, arriving at once -- which is what a
  // finale is.
  //
  // Its roar at half health calls in another 600 HP on top of this, running at
  // 1.5x. See the `boss` row in Enemy.TYPES — everything the fight does is
  // data there, not here.
  { groups: [                                                     // 7684 HP  old 20 + the Tyrant
    { at: 0,  count: 15, interval: 0.35, health: 30 },
    { at: 2,  count: 6,  interval: 0.5,  type: "flying", health: 20 },
    { at: 5,  count: 15, interval: 0.35, health: 30 },
    { at: 13, count: 1,  interval: 1,    type: "boss" },
    { at: 15, count: 7,  interval: 1.1,  type: "angry", health: 40 },
    { at: 17, count: 4,  interval: 1.5,  type: "shielded", health: 30 },
    // T5, LAST IN THE LAST WAVE, and the only place 1024 points fit. It walks
    // in at 28 s, which is 6.5 s behind the final Bulwark and fifteen behind
    // the Tyrant -- deliberately: the boss is still the wave's centre, and the
    // cascade is what the run ends on rather than something the Tyrant fights
    // alongside.
    //
    // 6 144 points across six generations, ending in 1 024 one-point bodies.
    // A board that cannot clear them loses on leaks alone, which is the
    // intended shape of a finale and the reason no earlier wave carries this
    // rung. The 30 opening Normals are untouched -- they are the v0.4.4
    // spine's twentieth wave and cannot be trimmed to fund anything. They are
    // sent as two salvos of fifteen now; the thirty bodies and their 30 HP
    // override are exactly what they were.
    { at: 28, count: 1,  interval: 1,    type: "fractal_slime", tier: 5 }
  ] }
];

// A wave's groups. Every wave carries `groups` since the timeline rewrite --
// the flat single-group form is gone, along with the `wave.groups || [wave]`
// fallback that reconciled the two. A wave that reaches here without `groups`
// is malformed data, and it throws HERE, naming itself, instead of surfacing
// four frames away as "Cannot read properties of undefined (reading 'length')"
// inside waveCount. That is not defensive programming for its own sake: the
// callers that build a wave by hand -- tests/run.js injects
// `WAVES = [{ count: 60, health: 3, interval: 2 }]` to get a steady stream for
// a targeting sandbox -- are exactly the ones still writing the old shape, and
// a message that names the missing field is the difference between a one-line
// fix and an afternoon.
//
// Kept as a function rather than inlined because it is the one accessor
// everything comes through -- the scheduler, the banner, the readout, the
// index screen's wave lists -- and that is worth one call frame.
function waveGroups(wave) {
  if (!wave.groups) {
    throw new Error("wave has no `groups`: the flat count/interval wave form " +
      "was removed with the timeline rewrite -- write " +
      "{ duration: n, groups: [{ at: 0, count: n, interval: n }] }");
  }
  return wave.groups;
}

// How many enemies a wave deploys in total, across all its groups.
function waveCount(wave) {
  var groups = waveGroups(wave);
  var total = 0;
  for (var i = 0; i < groups.length; i++) total += groups[i].count;
  return total;
}

// waveGroupAt(wave, n) IS GONE (2026-08-25). It answered "which group does the
// Nth enemy of this wave belong to", walking the group list and subtracting
// counts, and it carried an `opensGroup` flag that existed for `lead` -- "this
// is the body the pause is spent in front of".
//
// BOTH HALVES DIED WITH THE SEQUENTIAL SCHEDULER. `lead` is not a field any
// more, so the flag described a mechanism nobody runs; and "the Nth enemy of
// the wave" is no longer "the Nth member down the group list", because groups
// overlap -- wave 12's sixth arrival belongs to its SECOND group. A function
// that still answered the old question would answer it correctly and mean
// something different, which is worse than not existing.
//
// What replaced it is waveTimeline(), below: the wave resolved onto one clock,
// in arrival order. Callers that want a particular GROUP (the fixtures that
// hunt for "wave 25's Fractal Slime") search waveGroups() by type, which is the
// question they were really asking all along.

// "18 × Fast + 40 × Swarm + 30 × Normal", for the wave banner. Display only.
//
// SALVOS OF THE SAME TYPE ARE SUMMED, not listed twice. Since the timeline
// rewrite a wave is cut into as many groups as it has entrances -- wave 30 has
// twelve of them across four types, and wave 13 sends its twenty Angries as
// five salvos of four. Printing one entry per GROUP would turn that banner
// into "4 × Angry + 4 × Angry + 4 × Angry + 4 × Angry + 4 × Angry", which
// tells the player nothing they cannot see and buries the one fact the banner
// exists for: what is in this wave. The cut is a TIMING decision and the
// banner is a ROSTER, so the banner aggregates it away.
//
// TWO SALVOS ARE THE SAME THING ONLY IF `type`, `health` AND `tier` ALL MATCH.
// The key is all three, not the display name, and the difference is not
// theoretical: `Enemy.typeOf` maps every rung of the Fractal ladder onto one
// row, so a name-only key would print a T1 salvo and a T5 salvo -- 4 HP and
// 1024 HP, sixteen bodies apart in what they cost to remove -- as one "6 ×
// Fractal Slime". Same for a `health` override: 12 stock Normals and 12
// Normals at 30 HP are not 24 of anything. Ordered by FIRST APPEARANCE, so the
// banner still reads in the order the player will meet things.
//
// As of the timeline rewrite NO WAVE IN THE SCHEDULE splits one type across
// two different `health` values or two different tiers, so this prints exactly
// what the name-only key printed -- checked wave by wave, all 35. The key is
// the strict one anyway because the banner is the only place a player can see
// the difference, and the day someone authors that wave the banner should tell
// the truth without anyone remembering to come back here.
//
// The label stays the display name, and two entries can therefore repeat one:
// "15 × Fractal Slime  +  1 × Fractal Slime" is honest about the count and
// silent about why they are separate. Left that way deliberately rather than
// appending "(T5)" or "(30 HP)" to a line no wave produces today -- a
// disambiguator nothing exercises is a formatting rule that rots.
function waveSummary(wave) {
  var order = [];
  var byKey = {};
  waveGroups(wave).forEach(function (g) {
    // `undefined` and `null` are their own values here, on purpose: a group
    // with no `health` inherits the type's, and that is a DIFFERENT salvo from
    // one that overrides it, even when the override happens to equal the
    // default. Never materialise the default to compare.
    var key = (g.type === undefined ? "" : g.type) + "|" +
      (g.health === undefined ? "" : g.health) + "|" +
      (g.tier === undefined ? "" : g.tier);
    if (byKey[key] === undefined) {
      byKey[key] = { name: Enemy.typeOf(g.type).displayName, count: 0 };
      order.push(key);
    }
    byKey[key].count += g.count;
  });
  return order.map(function (key) {
    return byKey[key].count + " × " + byKey[key].name;
  }).join("  +  ");
}

// Everything a wave takes to clear, counting a shield as the health it is and
// a Revenant as the two bodies it is.
//
// **HP, NOT MONEY, and since 2026-07-30 those are different sums.** A shield
// now pays nothing (see Enemy.prototype.takeDamage), so this figure is still
// exactly what the player has to REMOVE -- which is what it has always been
// for, and what the clear bounty below is a tenth of -- but it is no longer
// what they get paid for removing it. Damage income is health only. Do not
// reach for this function to work out a purse.
//
// This is the SAME arithmetic the balance tests do, and it lives here rather
// than in a test so the payout below and the design figures can never be
// computed two different ways. It reads the type through Enemy.typeOf and the
// health through Enemy.healthOf -- the same two resolvers the spawner uses --
// so it cannot disagree with what actually walks out of the gate.
//
// Deliberately does NOT include a Hive's brood, a Fractal Slime's death-born
// descendants or a boss's summons: those are conditional on what survives or
// dies, and a payout has to be knowable in advance to be worth anything.
function waveEffectiveHealth(wave) {
  var groups = waveGroups(wave);
  var total = 0;
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    var type = Enemy.typeOf(g.type);
    total += g.count * Enemy.healthOf(g.type, g.health, g.tier) *
      (1 + (type.shield ? type.shield.ratio : 0)) *
      (1 + (type.revive ? type.revive.times : 0));
  }
  return total;
}

// The kill money named by a wave. Unlike effective HP, this is a sum of
// authored enemy values: each type prices its defenses and abilities, while
// Enemy.bountyOf scales that value for the wave's health override.
//
// Conditional descendants are deliberately absent. A Hive brood is $0
// through its spawn override; Fractal children and Tyrant summons pay their
// ordinary bounties only if they actually appear and are killed.
function waveKillBounty(wave) {
  var groups = waveGroups(wave);
  var total = 0;
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    total += g.count * Enemy.bountyOf(g.type, g.health, g.tier);
  }
  return total;
}

// What finishing a wave pays, on top of the kill income (2026-07-29, at the
// owner's request: "give money at the end of each round, around 1/10 of the HP
// of the wave").
//
// A TENTH, derived from the wave rather than typed in per wave, so the two can
// never drift: retune a wave's health and its bonus follows. Across the Easy
// schedule it adds $2594 on top of $22 987 in scheduled kill bounties, so it
// stays a supplement rather than a second economy. (Both figures are pinned in
// tests/run.js. The kill total is priced through Enemy.bountyOf, which resolves
// a Fractal Slime's tier; pricing every body off its type row instead -- which
// is what the pre-timeline snapshot did -- gives $22 321, and the $666 between
// them is the six fractal roots and nothing else.)
//
// What it actually buys is a CLEAN MOMENT TO SPEND. Kill income arrives in
// uneven lumps, and the clear bonus lands as the wave closes and the
// panel is about to be read. That is also why it is latched on the wave FULLY
// DEPLOYING rather than on the board going empty: deployment is a single,
// unambiguous instant that happens exactly once per wave, whereas "cleared" is
// a moving target while stragglers are still walking.
var WAVE_CLEAR_BOUNTY_FRACTION = 0.1;

function waveBounty(wave) {
  return Math.round(waveEffectiveHealth(wave) * WAVE_CLEAR_BOUNTY_FRACTION);
}

// $5000 of opening stake, paid through the first 34 completed-wave rewards
// instead of sitting in the wallet at t=0. There is deliberately no
// progression grant on wave 35: once it is dead the run is over and there is
// no next purchase.
//
// 5000 / 34 is 147 with 2 left over, so waves 1-2 pay $148 and waves 3-34 pay
// $147. Keeping this deterministic and integer-valued makes the total exact.
//
// NOTE for this version's lineage: STARTING_CASH here was already $600 and was
// never the $5600 the other branch shed. The endpoint is the same either way --
// $600 in hand plus $5000 arriving through play -- but this is not money being
// moved out of the opening wallet, it is money being added to the schedule.
// Both branches now agree on the same lifetime purse.
var WAVE_PROGRESSION_REWARD_TOTAL = 5000;
var WAVE_PROGRESSION_REWARD_COUNT = 34;

function waveProgressionReward(waveNumber) {
  if (waveNumber < 1 || waveNumber > WAVE_PROGRESSION_REWARD_COUNT) return 0;
  var each = Math.floor(
    WAVE_PROGRESSION_REWARD_TOTAL / WAVE_PROGRESSION_REWARD_COUNT
  );
  var remainder = WAVE_PROGRESSION_REWARD_TOTAL -
    each * WAVE_PROGRESSION_REWARD_COUNT;
  return each + (waveNumber <= remainder ? 1 : 0);
}

// A simple rising allowance on top of every payable wave reward: $50 on wave 1,
// then $5 more per wave ($55, $60, ... $215 on wave 34), $4505 in total.
var WAVE_ESCALATING_REWARD_BASE = 50;
var WAVE_ESCALATING_REWARD_STEP = 5;

function waveEscalatingReward(waveNumber) {
  if (waveNumber < 1 || waveNumber > WAVE_PROGRESSION_REWARD_COUNT) return 0;
  return WAVE_ESCALATING_REWARD_BASE +
    (waveNumber - 1) * WAVE_ESCALATING_REWARD_STEP;
}

// Everything added to the wave-clear popup: the original effective-HP bonus
// plus that wave's share of the redistributed opening cash and its rising
// $50 + $5-per-wave allowance.
//
function waveReward(wave, waveNumber) {
  return waveBounty(wave) +
    waveProgressionReward(waveNumber) +
    waveEscalatingReward(waveNumber);
}

// The campaign has ONE schedule. There were three -- Easy, plus a Normal and a
// Hard derived from it by scaling count, health and the spacing fields of the
// day, and adding
// extra groups -- and the derivation is gone (2026-08-12): they were unfinished
// placeholders, and EASY_WAVES is the only source of truth.
var WAVES = EASY_WAVES;

function scheduleEnemyCount(schedule) {
  var total = 0;
  schedule.forEach(function (wave) { total += waveCount(wave); });
  return total;
}

function scheduleEffectiveHealth(schedule) {
  var total = 0;
  schedule.forEach(function (wave) { total += waveEffectiveHealth(wave); });
  return total;
}

// The bounty owed for the wave that has just finished deploying, and which
// wave it belongs to. RUN STATE -- restartGame() clears both.
//
// It is owed rather than paid immediately because the owner asked for it to
// arrive "after defeating the wave... at the start of the countdown to the
// next wave if the wave was skipped" (2026-07-29). Those are the same moment
// expressed two ways: whichever of the three things below happens first is
// when the wave is genuinely OVER as far as the player is concerned.
var pendingBounty = 0;
var pendingBountyWave = 0;

// Pay it, once. The latch is `pendingBounty` itself: zeroing it before the
// payout means none of the three call sites can pay twice even if two of them
// fire on the same step.
//
// Called from exactly four places. This list was rewritten 2026-08-26: it used
// to name the board going empty, callNextWave, and "the next wave's first spawn
// -- the 90 s ran out with stragglers still walking". There is no 90 s and no
// wave-level spawn hook any more; every ordinary payout now goes through the
// single exit a wave has.
//
//   1. endWave()          -- ALL THREE GATES (wiped out, `duration` expired,
//                            Send). This is the ordinary path and the reason
//                            "paid exactly once" is a property of one function
//                            rather than of three call sites agreeing.
//   2. callNextWave()     -- a transition shortened by hand. Ordinarily a
//                            no-op: the gate that opened the transition has
//                            already paid. Kept for a countdown moved without a
//                            gate behind it (the sandbox, a fixture).
//   3. beginWave()        -- the same safety net from the other end.
//   4. update(), last wave -- wave 35 has no next wave and no transition, so
//                            closing it IS the payout.
//
// Wave 35 can only be reached by (4), which is correct: the last bounty is paid
// for actually removing wave 35, descendants included.
function payWaveBounty() {
  if (pendingBounty <= 0) return 0;
  var amount = pendingBounty;
  var number = pendingBountyWave;
  pendingBounty = 0;
  pendingBountyWave = 0;

  cash += amount;
  if (typeof Effects !== "undefined") {
    Effects.announce("Wave " + number + " cleared", "+$" + amount);
  }
  return amount;
}

// The base loses an enemy's REMAINING health when that enemy reaches the end.
// Damage already dealt therefore protects the base even when it does not
// finish the kill.
var BASE_MAX_HP = 100;

// Width of the road, outer edge to outer edge, in u.l. Used both to DRAW
// the road and to decide where towers may stand, so the two can never drift
// apart -- change this one number and placement follows automatically.
var ROAD_WIDTH_UL = 21.875;

// Cash you start with. Combat income is paid by Enemy.prototype.bounty once
// per kill; damage itself pays nothing.
//
// STARTING_CASH must stay at or above the cheapest equipped tower's cost:
// the stake has to buy a first tower, or the original deadlock re-opens --
// no tower, no kills, no bounty cash, ever.
//
// Easy mode opens with two $300 Riflemen. The other $5000 of a run's guaranteed
// money arrives through waveProgressionReward over waves 1-34, so power is
// earned through play rather than handed over at t=0.
//
// CASH_PER_DAMAGE IS GONE (2026-07-31). It was $3 per point of damage, which
// meant every HP retune was silently also an income retune -- the reason the
// difficulty tiers above had to warn that "raising health mostly pays for its
// own answer". Bounties price a body's whole threat once, at its authored
// health, and scale with a wave's override instead. Anything still reading a
// per-damage rate is stale.
var STARTING_CASH = 600;

// Selling a tower refunds half of what it cost, ROUNDED UP -- a $15 gunner
// gives back $8. Rounding up rather than down keeps the refund honest on odd
// prices and means no tower is ever worth less than $1 to sell.
//
// This is economy policy, so it lives here next to the other cash rules rather
// than on the tower. The tower supplies its own `cost`; the rate applies to
// every type.
var SELL_REFUND_FRACTION = 0.5;

// Cash is a float -- lifesteal ratios, charge multipliers and damage
// mitigation all produce fractions -- but "$8.454662500000001" is not a
// readout. Kept exact internally, shown to at most one decimal, and with no
// pointless ".0" on whole numbers.
function formatCash(value) {
  var rounded = Math.round(value * 10) / 10;
  return (rounded % 1 === 0) ? String(rounded) : rounded.toFixed(1);
}

// Refund is half of EVERYTHING sunk into the tower -- its purchase price plus
// every upgrade bought since. `totalSpent` is maintained by towers that can be
// upgraded; one that cannot simply has its purchase price. This is a global
// economy rule, not a per-tower one, which is why it lives here.
function sellValue(tower) {
  var spent = (typeof tower.totalSpent === "number") ? tower.totalSpent : tower.cost;
  return Math.ceil(spent * SELL_REFUND_FRACTION);
}

// The path, in u.l. -- like every other distance in the game (see
// js/units.js), converted to world/pixel coordinates via ul() exactly once,
// in init() below, when the GamePath is built. Never read as pixels directly.
//
// These numbers are the project's original hand-drawn pixel polyline (1940 px
// long) divided by AUTHORED_AT_PX_PER_UL, which is kept EQUAL to the default
// UNIT_LENGTH. That is what makes the road fill the playable rectangle: the
// polyline was drawn to fit a 1280x720 canvas, and dividing then multiplying
// by the same number lands it back exactly where it was drawn.
//
// If you retune UNIT_LENGTH and want the map to keep filling the screen,
// move this to match. Leaving them different is not a bug -- it shrinks or
// grows the world inside a fixed viewport, which is occasionally what you
// want -- but it does mean empty canvas around the road.
//
// The path being authored in u.l. (rather than left as fixed pixels) is what
// keeps its length proportional to UNIT_LENGTH like every other distance, so
// retuning that constant rescales the map without changing how long anything
// takes to cross it -- see tests/run.js's "changing UNIT_LENGTH" group.
var AUTHORED_AT_PX_PER_UL = 1.04;

// The route in play is chosen from js/maps.js, so the polyline no longer lives
// here. PATH_POINTS_UL is kept as the REFERENCE route's points, in u.l., which
// is what it always was -- the four maps were drawn at the same pixel scale,
// and the reference one is the original road.
var PATH_POINTS_UL = Maps.reference().points.map(function (p) {
  return { x: p.x / AUTHORED_AT_PX_PER_UL, y: p.y / AUTHORED_AT_PX_PER_UL };
});

// Simulation runs at a fixed 60 Hz regardless of monitor refresh rate, so
// behaviour is identical on every machine. Rendering runs as fast as it can.
var FIXED_STEP = 1 / 60;
var MAX_FRAME_TIME = 0.25;

// --- game speed -------------------------------------------------------------
//
// 1x, 2x or 3x, cycled from a button in the bottom-right corner and changeable
// at any moment during a run (2026-07-29, at the owner's request).
//
// It is applied in exactly ONE place -- how much time frame() hands the fixed
// step accumulator -- and never by scaling a dt anywhere else. That is what
// makes "applies to everything" true by construction rather than by audit: at
// 3x the loop runs three times as many 1/60 s steps, and every single thing
// that reads dt (waves, enemies, bullets, cooldowns, slows, buff stacks,
// reloads, the death-denial rewind, cosmetic effects) advances with it because
// none of them can tell the difference. A per-system multiplier would have to
// be remembered by every future system; this cannot be forgotten.
//
// Crucially the STEP is not scaled, only how many of them run. Feeding
// update() a 3x dt would change collision and cooldown outcomes -- fast
// bullets would tunnel, "is it in range" would be sampled a third as often --
// so the same board would play differently at speed. It does not: three steps
// at 3x are bit-for-bit the three steps 1x would have run over three times as
// long.
// THE SHIPPING LADDER IS 1x/2x/3x, AND THE SANDBOX EXTENDS IT (2026-08-09, at
// the owner's request: 5x and 10x "on top of the actual game speed changing
// button"). js/sandbox/sandbox.js appends to this array; the button, the loop
// and the tests all read the array rather than the literal, so extending it is
// one line there and nothing here.
//
// Why the workbench gets them and the game does not: a sandbox exists to reach
// a board state quickly, and 10x turns a two-minute wait into twelve seconds.
// In a real run the same button would be a difficulty setting -- at 10x a
// player cannot react to anything, so offering it is offering a way to lose
// without meaning to.
//
// The frame clamp is what makes a big multiplier safe rather than a hazard:
// `elapsed` is capped at MAX_FRAME_TIME BEFORE the multiply, so the very worst
// case at 10x is 2.5 s of simulation in one frame (150 fixed steps) after a
// stall, not the minutes a stalled tab could otherwise bank.
var GAME_SPEEDS = [1, 2, 3];
var gameSpeed = 1;

// NOT reset by restartGame(). Speed is a pacing preference the player set for
// themselves, like a volume knob, not part of the run -- being dropped back to
// 1x by every restart is the kind of thing that gets a feature sworn at.
//
// A speed that is no longer in the ladder falls back to the first entry rather
// than sticking: `indexOf` returns -1, and -1 + 1 is 0. That is the honest
// behaviour if a page ever narrows the list under a running game.
function cycleGameSpeed() {
  var i = GAME_SPEEDS.indexOf(gameSpeed);
  gameSpeed = GAME_SPEEDS[(i + 1) % GAME_SPEEDS.length];
  return gameSpeed;
}

// Auto-send: send every wave the moment it becomes sendable, with no click
// (2026-07-29, at the owner's request). The other half of the skip button --
// one is "I am ready now", this is "I will always be ready".
//
// SINCE THE TIMELINE REWRITE THAT MOMENT IS EARLIER THAN IT USED TO BE. It was
// "the frame the break opens"; it is now "the frame the wave has finished
// arriving", which on a wave with a long tail can be most of a minute before
// the wave would have ended by itself. Survivors stay on the road and the next
// wave is announced over them.
//
// A sent wave takes WAVE_CALL_DELAY seconds to arrive, so with this on the gap
// between waves is three seconds rather than one frame. That is deliberate and
// not a regression: it goes through the same skipNextWave() the button does,
// which is what keeps "the automatic path and the button are the same path"
// true -- and in particular it inherits waveSendReady(), so it can never
// compress an interval or delete a spawn inside a wave.
//
// The same kind of preference as gameSpeed and kept beside it deliberately:
// both are the player deciding how fast their own run goes, neither is run
// state, and neither is cleared by restartGame(). A player who turned
// auto-send on has said something about how they like to play, not about the
// run that just ended.
//
// It does NOT make the game easier. Waves arriving back to back are denser
// than waves that get their whole window -- the same enemies cross in one clump and a
// tower that shoots one at a time gets through fewer of them. See the Waves
// section of AGENTS.md; this is the trade the button offers, not a free
// fast-forward, and gameSpeed is the control for "I just want this over
// sooner".
var autoSkipWaves = false;

function toggleAutoSkipWaves() {
  autoSkipWaves = !autoSkipWaves;
  return autoSkipWaves;
}

// `path` remains the primary route for compatibility with tower constructors,
// previews and console helpers. `paths` is authoritative gameplay state.
var canvas, ctx, path, paths = [];
var enemies = [];
var towers = [];
var bullets = [];

var cash = STARTING_CASH;
var baseHp = BASE_MAX_HP;
var gameOver = false;

// The run is WON when every scheduled wave has fully deployed and the last
// enemy is off the board with the base still standing. `allWavesDeployed` is
// set ONLY by the scheduler naturally exhausting itself (emitDueSpawns is the
// one writer; spawnScheduledEnemy is a fixture entrance and never touches it),
// never by waveIndex arithmetic -- tests and the sandbox switch waves off by
// setting `waveIndex = WAVES.length`, and that must not read as a win.
var victory = false;
var allWavesDeployed = false;

// Enemies destroyed this run, all damage sources. Counted where dead enemies
// are swept out of the list, so every tower type is included and nothing is
// counted twice. Display only -- nothing simulated reads it.
var runKills = 0;

// Meta coins are paid out once per run, at the moment it ends. `runAwarded`
// is the latch that guarantees the once; `lastRunAward` is what the overlay
// shows. Both are RUN state -- restartGame() clears them -- even though the
// coins themselves outlive the run in js/meta.js.
var runAwarded = false;
// The whole award, not just its total -- see MetaProgress.awardRun. Null until
// a run has ended; restartGame() clears it with the rest of the run state.
var lastRunAward = null;

// IS THE RESULT SCREEN FOLDED AWAY? The run is over either way -- this only
// decides whether the full panel is covering the board or a small tab is
// sitting in the corner while the player reads their towers.
//
// It changes NOTHING about the simulation. update() still returns early on
// gameOver/victory, so the board behind the tab is as frozen as the board
// behind the panel: no movement, no shots, no abilities, no cooldowns, no
// wave. Folding the panel is a change of what is DRAWN and what CLICKS do,
// and deliberately nothing else -- see onClick, where the minimised state
// handles its own clicks rather than falling through to the live handler.
var resultMinimised = false;

// `waveIndex` is the wave IN PLAY, or the next wave during a transition. Once
// every wave has been through, waveIndex equals WAVES.length.
//
// IT NO LONGER ADVANCES ON THE LAST SPAWN (2026-08-25). Under the sequential
// scheduler a wave was popped off this cursor by its own final body, so "the
// index rolled over" and "the wave finished deploying" were one event. A
// timeline wave holds the cursor until one of the three gates closes it -- so a
// wave can be fully deployed, with sixty bodies walking, and still be
// `waveIndex`. Ask waveFullyDeployed() for the other question.
var waveIndex = 0;

// The cursor into the wave in play's timeline: how many of its events have been
// emitted. Only ever moves forward, which is the whole of "every event fires
// exactly once", and is reset to 0 by endWave and by restartGame.
var waveSpawned = 0;

// Seconds left in the TRANSITION before wave `waveIndex` starts: 10 for the
// opening pause, 5 for a wave that was wiped out or ran out its ceiling, 3 for
// a Send. Zero, and only zero, while a wave is in play -- which is what makes
// it the test behind betweenWaves() and waveInPlay().
var waveCountdown = 0;

// THE WAVE CLOCK: seconds of simulated time since the current wave OPENED --
// the frame the transition in front of it expired. 0 whenever no wave is in
// play.
//
// ONE ORIGIN FOR `at` AND `duration`, which is the whole reason it is written
// this way. A group's `at` is measured from the wave's start and so is its
// ceiling, so a player watching "38 s left" is watching the same number the
// scheduler is enforcing and the same zero the data was authored against. For
// 34 of the 35 waves this is also the first body on the road, because their
// first group is at `at: 0`; wave 11 opens four seconds before its Midboss,
// and those four seconds are inside its 60 s window on purpose.
//
// The alternative -- starting the clock on the first EMITTED body -- would
// measure `at` from one instant and `duration` from another within a single
// wave, and wave 11 would silently gain four seconds nobody authored.
//
// It exists for the readout, which is the only thing that reads it today: a
// wave has a time limit in the data and no way to show it without a clock.
// The timeline scheduler is the code that will ENFORCE that limit, and it
// wants exactly this clock -- so the increment lives in updateWaves() beside
// the countdown rather than in a draw function, and tests/run.js pins that it
// advances, so a rewrite of updateWaves that drops the line goes red instead
// of quietly freezing the readout at 0 s.
var waveElapsed = 0;

var mouse = { x: -999, y: -999 };

// The same cursor in WORLD coordinates -- see the camera section. `mouse` is
// screen space and is read by every interface hover test; this is what the
// map's own hit tests read. Kept in step by onMouseMove.
var worldMouse = { x: -999, y: -999 };
var blockReason = null;

// Which route is loaded, and where the player is. Each of these is a full
// SCREEN, not an overlay: nothing behind one is running, so it cannot be
// interacted with by accident.
//
//   "menu"    the title screen -- play, the index, or the sandbox
//   "select"  the route chooser
//   "index"   the field guide: every tower, upgrade and enemy (js/codex.js)
//   "play"    a run in progress
//
// The menu was added 2026-07-28. Before it the page opened straight onto the
// chooser, which gave the sandbox no entrance at all from the game: you had
// to know sandbox.html existed and open it by hand.
var currentMap = null;
var screen = "menu";             // "menu" | "select" | "play"

// The enemy under the cursor, for the hover readout. Recomputed on mouse move
// rather than every frame.
var hoveredEnemy = null;

// Handed to every tower's update(). `gold` is refreshed each step; addBaseHp
// exists for lifesteal, which is the one thing a tower does to the base that
// is not damage. Base HP is a FREE COUNTER with no upper bound -- see the
// note in drawStatus and the beam tower's B path.
var worldContext = {
  gold: 0,
  addBaseHp: function (amount) { baseHp += amount; },
  addGold: function (amount) { cash += amount; },
  baseHp: function () { return baseHp; }
};

// The build bar: five slots along the bottom. Each entry is a tower
// CONSTRUCTOR (or null for an empty slot), so a new tower type is added by
// dropping its constructor in here -- nothing else in the bar needs to know
// what it is.
//
// All four types are in the shipping game as of 2026-07-28. The Longshot and
// the Siphon were reachable only through sandbox.html before that, which made
// two fully-built, fully-tested towers invisible to anyone actually playing.
// The Soldier joined them on 2026-07-29 and FILLS THE FIFTH SLOT, which had
// been held empty since v0.3.5 so the bar would not change shape when it was
// finally used. It is used now; the bar is full.
//
// The order is NOT by price ($15, $200, $75, $800, $15). It preserves the
// slots that already existed: the number keys are muscle memory and the test
// harness addresses the Smasher as slot 1, so new types append rather than
// insert. If the bar is ever sorted by cost, tests/harness.js's placeSmasher
// has to move with it.
//
// SINCE 2026-07-29 THIS ARRAY IS DERIVED, not declared: it is the player's
// equipped loadout from js/meta.js, which is a saved profile. A fresh profile
// owns `smasher` and `soldier` -- the two CATALOGUE entries flagged
// `starter: true` -- while `longshot`, `siphon` and `blub` are bought with
// meta coins in the armoury. The gunner is NOT a starter and no longer exists
// at all: it was deleted in v0.4.9, and meta.js drops it from any save that
// still names it. Everything downstream is unchanged -- the bar still reads
// constructors out of this array and knows nothing about what any particular
// tower is -- so a slot being empty because it was never bought looks exactly
// like a slot being empty because nothing was written there.
//
// It is a `var` MUTATED IN PLACE by rebuildBuildBar() rather than a live
// getter, because the geometry below (BAR_WIDTH) is computed from its length
// once at load, and every other reader indexes it in a hot loop. In place and
// never reassigned: the sandbox writes THROUGH this array, so any reference
// handed out earlier has to stay live. See rebuildBuildBar's own note, which
// has always said this correctly.
var BUILD_SLOTS = MetaProgress.slotConstructors();

// Re-read the loadout after the armoury changes it. Called by js/store.js on
// every buy/equip/unequip, and by init(), so the bar a run starts with is
// always the profile as it stands.
//
// Length never changes -- MetaProgress.SLOT_COUNT and BUILD_SLOTS.length are
// the same number and a test pins it -- so the bar's geometry is stable and
// nothing has to be recomputed. Contents are replaced in place so that any
// code holding a reference to the array (there is none today, but the sandbox
// writes THROUGH it) keeps seeing the live bar.
function rebuildBuildBar() {
  var next = MetaProgress.slotConstructors();
  for (var i = 0; i < BUILD_SLOTS.length; i++) BUILD_SLOTS[i] = next[i] || null;

  // An armed slot that just lost its tower would place nothing, or worse,
  // place whatever moved into that index.
  if (selectedSlot !== null && BUILD_SLOTS[selectedSlot] === null) selectedSlot = null;
  return BUILD_SLOTS;
}

// Which slot is armed for placing (index, or null for none), and which tower
// on the board is being inspected (a Tower, or null).
var selectedSlot = null;
var inspected = null;

// True while the pause menu is up (Escape). It is a MODAL: it freezes the
// simulation and owns every click, exactly as the loss and victory overlays
// do. Freezing is not a convenience -- a menu that let enemies keep walking
// would charge the player for opening it.
//
// The pause menu IS the safety on leaving a run: getting out takes Escape and
// then a deliberate click on "Back to main menu", so there is no separate
// "are you sure?" step and nothing on the HUD that one stray click can hit.
var paused = false;

// Set while a tower is waiting for the player to click a DIRECTION rather
// than a position -- currently only the Longshot's cone re-aim (spec 5.6).
// While this is set it consumes the next map click, ahead of building and
// inspecting, and Escape cancels it.
var aimingTower = null;

// Extra things to draw in world space, between the map and the interface.
// Push a function(ctx) to add one; the sandbox's u.l. debug overlay uses this
// so its shapes cannot end up on top of the panel.
var worldOverlays = [];

// Build bar geometry. Pixels, and pixels are correct here: this is interface
// chrome anchored to the viewport, not a distance in the game world.
// A SLOT GREW FROM 76 TO 86 AND THE BAR DID NOT MOVE. The owner's complaint was
// that the previews are unreadable because they are too small, and the picture
// inside a slot was 22 px in a 76 px box -- less than a twelfth of the slot's
// area, with a 40 px gutter around it and two text rows below.
//
// The ten pixels come out of the bar's own bottom margin, not out of the board:
// the margin was 18 and is now 8, so `BAR_Y` is 626 exactly as it was before.
// That matters more than it looks. `BAR_Y` is the ceiling every inspection
// panel clamps against (`inspectionLayout`), it is the floor of the playable
// area, and five suites assert `L.y + L.h <= BAR_Y` on panels, cards and
// recruit boxes. Growing the bar UPWARD would have moved all of that for a
// cosmetic gain. Growing it DOWNWARD into a margin nothing was using moves
// nothing at all.
//
// The bar is also 50 px wider as a result (5 slots, 420 -> 470) and therefore
// starts 25 px further left: it spans 405..875 rather than 430..850. Nothing
// else on that line is anywhere near it -- the speed and auto-send buttons are
// at the right edge past x=1000, the scale bar is bottom-left.
var SLOT_SIZE = 86;
var SLOT_GAP = 10;
var BAR_WIDTH = BUILD_SLOTS.length * SLOT_SIZE + (BUILD_SLOTS.length - 1) * SLOT_GAP;
var BAR_X = (VIEW_WIDTH - BAR_WIDTH) / 2;
var BAR_Y = VIEW_HEIGHT - SLOT_SIZE - 8;


// Match the backing store to the pixels the canvas really occupies on the
// display, while keeping every draw call in the fixed 1280x720 coordinate
// system. CSS size is part of the calculation: DPR alone still leaves a
// stretched canvas soft when its displayed size is larger than 1280x720.
//
// Assigning width or height resets all 2D context state. Only assign when the
// target actually changes, then restore the logical transform and quality
// settings immediately. The scale() fallback is safe because a resize has
// just reset the transform; modern browsers take the absolute setTransform
// path and cannot accumulate scale across repeated resize events.
function resizeCanvasBackingStore() {
  var rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return;

  var dpr = Number(window.devicePixelRatio) || 1;
  if (!(dpr > 0)) dpr = 1;

  // Use one uniform scale so the backing store always has the world's exact
  // 16:9 shape. Keep the original 1280x720 as the floor for small windows.
  // Three times logical size is native 4K (3840x2160); capping the TOTAL
  // scale, rather than DPR alone, also bounds a DPR-1 5K/8K display.
  var requiredScale = Math.max(
    rect.width * dpr / VIEW_WIDTH,
    rect.height * dpr / VIEW_HEIGHT
  );
  var renderScale = Math.max(1, Math.min(MAX_CANVAS_SCALE, requiredScale));
  var width = Math.max(1, Math.round(VIEW_WIDTH * renderScale));
  var height = Math.max(1, Math.round(VIEW_HEIGHT * renderScale));

  // Either content-attribute assignment resets the transform. Check each one
  // separately, but do not return until both have been considered and the
  // transform can be restored after the final reset.
  var resized = false;
  if (canvas.width !== width) {
    canvas.width = width;
    resized = true;
  }
  if (canvas.height !== height) {
    canvas.height = height;
    resized = true;
  }
  if (!resized) return;

  var scaleX = width / VIEW_WIDTH;
  var scaleY = height / VIEW_HEIGHT;
  if (typeof ctx.setTransform === "function") {
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  } else {
    ctx.scale(scaleX, scaleY);
  }

  ctx.imageSmoothingEnabled = true;
  if (typeof ctx.imageSmoothingQuality !== "undefined") {
    ctx.imageSmoothingQuality = "high";
  }
}

function init() {
  canvas = document.getElementById("game");
  ctx = canvas.getContext("2d");
  resizeCanvasBackingStore();

  // A map is loaded before anything can draw, so `path` is never null. The
  // chooser is still what starts the run. ul() is applied inside Maps.toWorld,
  // which is the only place a u.l. distance becomes a world coordinate.
  loadMap(Maps.byId(Maps.DEFAULT_ID));

  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mousedown", onMouseDown);
  // On window, not canvas: releasing the middle button outside the canvas
  // must still end the drag, or the map keeps following the cursor after the
  // grab is over.
  window.addEventListener("mouseup", onMouseUp);
  // Middle-click's default is autoscroll on Windows, which hijacks the drag.
  canvas.addEventListener("auxclick", function (event) {
    if (event.button === 1 && event.preventDefault) event.preventDefault();
  });
  canvas.addEventListener("mouseleave", function () {
    mouse.x = -999;
    mouse.y = -999;
    worldMouse.x = -999;
    worldMouse.y = -999;
  });
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("contextmenu", onRightClick);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", function (event) {
    delete cameraKeys[(event.key || "").toLowerCase()];
  });
  // Losing focus mid-pan would otherwise leave the key latched down and the
  // map sliding forever.
  window.addEventListener("blur", function () { cameraKeys = {}; });
  window.addEventListener("resize", resizeCanvasBackingStore);

  // Deliberately NOT restartGame(): that seeds wave 1's first enemy, and one
  // sitting invisibly at the start of the road while the player is still on
  // the menu is a state nothing should be in. startRun() seeds it, at the
  // moment a route is actually picked.
  openMenu();

  lastTime = performance.now();
  requestAnimationFrame(frame);
}

// Swap the route. Only the path changes -- the scale does not, because
// UNIT_LENGTH fixes it globally (js/units.js). A map is however many u.l. its
// own drawing works out to, which is exactly what makes every tower the same
// size on every route.
function loadMap(map) {
  currentMap = map;
  // COMPILED ONCE, HERE. The previous map's rocks must not survive into this
  // one, and the world-space conversion must not happen per query -- see the
  // note on Maps.geometryOf.
  Maps.resetGeometry();
  paths = Maps.routesOf(map).map(function (route) {
    // Walked and drawn are the SAME line -- see Maps.walkablePoints. Smoothing
    // only the picture made enemies cut every rounded corner and walk beside
    // their own road. The profile rides alongside it: its anchors are
    // FRACTIONS of the route's own length, so smoothing the line does not
    // move where the road narrows.
    var gamePath = new GamePath(Maps.toWorld(Maps.walkablePoints(map, route.points)),
      Maps.profileOf(route));
    gamePath.id = route.id;
    return gamePath;
  });
  path = paths[0];
  applyMapOcclusion();
}

// Hand the active map's sight-blocking shapes to everything that needs to ask
// about them, or take them away when the map has none.
//
// ONE PREDICATE, BUILT ONCE PER MAP, closed over the compiled shape list. The
// alternative -- every attacker reaching for `currentMap` and recompiling -- is
// what the brief calls scattering globals through every system, and it is also
// how the shapes end up being rebuilt inside a per-target loop.
//
// A map with no geometry clears the hook entirely rather than installing a
// predicate that always says yes, so the six older boards go back to the exact
// code path they had before any of this existed: a null check, no call.
function applyMapOcclusion() {
  var geo = Maps.geometryOf(currentMap);
  if (!geo.any || !geo.sightBlockers.length) {
    RangeFilter.clearOcclusion();
    mapSightBlockers = null;
    return;
  }
  mapSightBlockers = geo.sightBlockers;
  RangeFilter.setOcclusion(function (ax, ay, bx, by, eyeHeight) {
    return MapGeometry.clearLine(mapSightBlockers, ax, ay, bx, by, eyeHeight);
  });
}

// THE ACTIVE MAP'S SIGHT SHAPES, and the one place that knows which list
// terrain lives in. Null when the map has none, which is what keeps the six
// bare boards on a null check rather than a shape loop.
//
// The predicate above closes over this GLOBAL rather than over the array it was
// built from, deliberately: a predicate holding the previous map's shapes after
// a route change is a board with invisible rocks on it, and reading the global
// makes that unrepresentable rather than merely unlikely.
//
// `terrainHit` used to sit here, returning the CONTACT POINT for the two bullet
// families. Both call sites went on 2026-08-27 when a shot stopped colliding
// with the map at all (see the note at the top of js/bullet.js), and it went
// with them rather than staying as a function with no caller.
var mapSightBlockers = null;

function startRun(map) {
  loadMap(map);
  restartGame();
  screen = "play";
}

function openMapSelect() {
  screen = "select";
}

function openMenu() {
  screen = "menu";
  paused = false;
  // The run is over as far as the world is concerned: no clock on the title
  // screen. Victory and game over do NOT call this -- they freeze the board
  // they finished on, and the sky is part of that board.
  if (typeof EnvironmentCycle !== "undefined") EnvironmentCycle.end();
  // A klaxon that followed the player out of a losing run and onto the title
  // screen would be a warning about a base that no longer exists.
  Sound.stopAlert();
}

// Leave the run in progress and go back to the title screen.
//
// A seam, deliberately: sandbox.html is a separate PAGE running this same
// engine, so "back to the menu" there means navigating to index.html rather
// than switching screen. js/sandbox/sandbox.js overrides this function the
// same way it overrides update/updateWaves/restartGame -- by wrapping the
// global, with no edit to this file.
function leaveRun() {
  openMenu();
}

// Leave for the sandbox. A plain navigation, and the only one in the game --
// sandbox.html is a separate page running the same engine, not a mode this
// page can switch into (it installs its own roster and hooks at load time).
//
// Guarded because `window.location` does not exist under the test harness's
// stubbed DOM, and a menu button that throws there would take the whole suite
// with it.
function openSandbox() {
  if (typeof window !== "undefined" && window.location) {
    window.location.href = "sandbox.html";
  }
}


// Reset the entire run, not just the loss flag. A restart is the same clean
// state as opening the page: starting cash and base HP, no placed towers, and
// wave 1's first enemy already on the path.
function restartGame() {
  // Console fixtures and the legacy test harness may replace the compatibility
  // `path` directly. On a single-route map, promote that replacement back into
  // the authoritative route array before anything spawns.
  if (paths.length === 1 && paths[0] !== path) {
    if (!path.id) path.id = paths[0].id || "main";
    paths = [path];
  }

  enemies = [];
  towers = [];
  bullets = [];

  // A NEW RUN OPENS AT THE SAME MORNING, always. restartGame is the one place
  // every start goes through -- a fresh run, a restart from the result screen,
  // a route change in the sandbox -- so putting it here is what makes "leaving
  // and starting another run does not leak phase" true by construction rather
  // than by remembering to reset in four places.
  if (typeof EnvironmentCycle !== "undefined") EnvironmentCycle.begin();

  cash = STARTING_CASH;
  baseHp = BASE_MAX_HP;
  gameOver = false;
  victory = false;
  allWavesDeployed = false;
  runKills = 0;
  runAwarded = false;
  lastRunAward = null;
  resultMinimised = false;
  pendingBounty = 0;
  pendingBountyWave = 0;

  selectedSlot = null;
  inspected = null;
  aimingTower = null;
  blockReason = null;
  paused = false;

  // The enemy lane sequence is run state too. It is deterministic on purpose
  // (see Enemy.laneSequence), and resetting it here is what makes run N+1
  // walk the road exactly as run N did.
  Enemy.resetLanes();

  // Global one-per-game state belongs to the RUN, so a restart clears it.
  if (typeof DeathDenial !== "undefined") DeathDenial.reset();
  if (typeof HealingLedger !== "undefined") HealingLedger.reset();
  // Cosmetic state is run state too -- a restart must not inherit the old
  // run's particles.
  if (typeof Effects !== "undefined") Effects.reset();

  // Neither must it inherit the old run's alarm. Sound.reset() cuts the
  // klaxon and clears the rate limiters; the VOLUMES are untouched, because a
  // mix the player set is a preference and not part of the run -- the same
  // distinction the camera zoom and the speed toggle already make.
  Sound.reset();
  lowHealthActive = false;
  lowHealthTimer = 0;
  lowHealthPulse = 0;

  // A run now OPENS ON A COUNTDOWN rather than on a body (2026-07-31 -- see
  // RUN_START_DELAY). This used to read `waveCountdown = spawnScheduledEnemy()`,
  // which deployed wave 1's first enemy on the frame the map was clicked and
  // made restartGame the only place outside updateWaves that ever spawned
  // anything. Handing the first wave back to the scheduler is what lets the
  // Start button, the countdown readout and auto-send treat wave 1 as an
  // ordinary wave: there is no longer a case where the run has begun but the
  // next wave is not something you are waiting for.
  waveIndex = 0;
  waveSpawned = 0;
  waveElapsed = 0;
  waveCountdown = RUN_START_DELAY;

  // The per-wave latches and the derived timeline. Cleared rather than left to
  // the `waveOnClockIndex !== waveIndex` test in updateWaves: a restart puts
  // the cursor back on wave 0, which is where it may already have been, so the
  // comparison would see no change and skip the banner and the reward latch.
  // resetWaveTimeline() is here for the harnesses that replace WAVES itself
  // between runs -- the cache is keyed on the index, and index 0 of a new
  // schedule is a different wave with the same key.
  waveRewardLatched = false;
  waveOnClockIndex = -1;
  resetWaveTimeline();

  accumulator = 0;
  lastTime = performance.now();
}


// --- Camera -----------------------------------------------------------------
//
// PRESENTATION ONLY. The world is still exactly 1280x720 of flat coordinates
// and every distance is still u.l.; this only decides which part of it the
// canvas is looking at. Nothing in update(), targeting, placement or pathing
// knows the camera exists, and at zoom 1 with no pan the transform is the
// identity -- so the game behaves identically to before if it is never used.
//
// TWO COORDINATE SPACES, AND THE RULE FOR WHICH IS WHICH.
//   screen  what toGameCoords returns: 0..1280, 0..720, fixed to the canvas.
//           The build bar, panels, buttons and every hover test on them.
//   world   what the map is in. Towers, enemies, placement, aiming.
// `mouse` stays SCREEN, because most of its readers are interface and they
// were all correct already. `worldMouse` is the same cursor through the
// camera, and only the handful of world-space readers use it. Mixing the two
// up is the whole risk in this change, so they are named so a mistake reads
// wrongly at the call site.
var camera = { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2, zoom: 1 };

var CAMERA_MIN_ZOOM = 1;      // never below 1: the map is authored to fill
                              // the canvas, so zooming out only adds bars
var CAMERA_MAX_ZOOM = 4;
var CAMERA_ZOOM_STEP = 1.15;
var CAMERA_PAN_SPEED = 620;   // px/sec at zoom 1, for the keyboard

var cameraDrag = null;        // { startX, startY, camX, camY } while panning

function screenToWorld(x, y) {
  // THE ONE FUNNEL FOR EVERY WORLD-SPACE INPUT -- hover, placement,
  // inspection, aiming. In 3D there is no linear screen-to-world mapping, so
  // this becomes a ray cast at the ground plane; pointing this single function
  // at the 3D camera is what makes the entire input layer work without
  // touching one call site.
  if (typeof World3D !== "undefined" && World3D.isEnabled()) {
    return World3D.screenToWorld(x, y);
  }
  return {
    x: (x - VIEW_WIDTH / 2) / camera.zoom + camera.x,
    y: (y - VIEW_HEIGHT / 2) / camera.zoom + camera.y
  };
}

// Keep the view inside the board. At zoom 1 this pins the camera dead centre,
// which is what makes "never zoomed" identical to "no camera at all".
function clampCamera() {
  var halfW = VIEW_WIDTH / (2 * camera.zoom);
  var halfH = VIEW_HEIGHT / (2 * camera.zoom);
  camera.x = Math.max(halfW, Math.min(VIEW_WIDTH - halfW, camera.x));
  camera.y = Math.max(halfH, Math.min(VIEW_HEIGHT - halfH, camera.y));
}

// Zoom about a fixed screen point -- the cursor. Anchoring to the cursor
// rather than to the centre is the difference between zooming in on the thing
// you are looking at and having to chase it with a pan afterwards.
function zoomCameraAt(screenX, screenY, factor) {
  var before = screenToWorld(screenX, screenY);
  camera.zoom = Math.max(CAMERA_MIN_ZOOM,
    Math.min(CAMERA_MAX_ZOOM, camera.zoom * factor));
  var after = screenToWorld(screenX, screenY);
  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
  clampCamera();
}

function resetCamera() {
  camera.x = VIEW_WIDTH / 2;
  camera.y = VIEW_HEIGHT / 2;
  camera.zoom = 1;
  cameraDrag = null;
  cameraKeys = {};
}

// Held pan keys. Tracked as a set and integrated per frame rather than acted
// on per keydown: a repeat rate belongs to the operating system, and panning
// at it arrives as a stutter with a pause at the front.
var cameraKeys = {};

var CAMERA_KEY_AXES = {
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
  arrowup: [0, -1], w: [0, -1],
  arrowdown: [0, 1], s: [0, 1]
};

function updateCameraPan(elapsed) {
  if (screen !== "play") return;
  var dx = 0;
  var dy = 0;
  for (var key in cameraKeys) {
    if (!cameraKeys[key]) continue;
    var axis = CAMERA_KEY_AXES[key];
    if (!axis) continue;
    dx += axis[0];
    dy += axis[1];
  }
  if (!dx && !dy) return;

  // Divided by zoom so the map moves at a constant speed ON SCREEN. Without
  // it, panning at 4x flies across the board four times as fast, exactly when
  // the player is looking closely and wants finer control.
  var step = CAMERA_PAN_SPEED * elapsed / camera.zoom;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  camera.x += (dx / len) * step;
  camera.y += (dy / len) * step;
  clampCamera();
  worldMouse = screenToWorld(mouse.x, mouse.y);
}

// --- Input ------------------------------------------------------------------

// The canvas is scaled by CSS to fit the window, so screen pixels have to be
// mapped back into the fixed 1280x720 game coordinate space.
function toGameCoords(event) {
  var rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (VIEW_WIDTH / rect.width),
    y: (event.clientY - rect.top) * (VIEW_HEIGHT / rect.height)
  };
}

function onMouseMove(event) {
  mouse = toGameCoords(event);

  // A slider being dragged owns the cursor until the button comes back up,
  // including outside the panel -- the handle follows the mouse to the edge
  // and stops there rather than being dropped the moment it leaves the track.
  if (audioDrag) {
    dragAudioSliderTo(audioDrag, mouse.x);
    return;
  }

  // Panning happens here rather than on a timer so the map tracks the cursor
  // exactly: the world point under the grabbed pixel stays under it.
  if (cameraDrag) {
    camera.x = cameraDrag.camX - (mouse.x - cameraDrag.startX) / camera.zoom;
    camera.y = cameraDrag.camY - (mouse.y - cameraDrag.startY) / camera.zoom;
    clampCamera();
  }

  refreshWorldPointer();
}

// What the cursor is currently over, in WORLD terms. Split out of onMouseMove
// because in 3D it is no longer enough to recompute it when the mouse moves.
//
// In 2D the camera only ever moved during a drag, and a drag is a mousemove --
// so "recompute on mousemove" covered every case. The orbit camera keeps
// EASING for a few hundred milliseconds after the mouse stops, and refits
// itself when a map loads, so the ground under a stationary cursor keeps
// changing with nothing to trigger a refresh. The stale value showed up as a
// build ghost and a hover ring sitting somewhere the cursor was not.
function refreshWorldPointer() {
  worldMouse = screenToWorld(mouse.x, mouse.y);
  refreshBlockReason();
  hoveredEnemy = (screen === "play")
    ? enemyAt(worldMouse.x, worldMouse.y) : null;
}

function onMouseDown(event) {
  // ABOVE the 3D early-return below, and it has to be: that return exists to
  // keep the 2D map-grab from fighting the orbit camera, and the mixer is
  // neither. Left button only -- the orbit camera claims middle and right
  // (see js/gl/gl-camera.js), and button 0 is the one it leaves alone.
  if (event.button === 0 && screen === "play" && !paused && !gameOver && !victory) {
    var press = toGameCoords(event);
    if (audioPanelMouseDown(press.x, press.y)) {
      if (event.preventDefault) event.preventDefault();
      return;
    }
  }

  // In 3D the orbit camera owns the middle button (it turns the board) and the
  // 2D map-grab must not also run, or the two cameras fight over one gesture.
  if (typeof World3D !== "undefined" && World3D.isEnabled()) return;
  // Middle button grabs the map. Left is building and inspecting, right is
  // cancel -- both already spoken for -- and middle-drag is what every map
  // tool uses, so it needs no explaining.
  if (event.button !== 1 || screen !== "play") return;
  if (event.preventDefault) event.preventDefault();
  var p = toGameCoords(event);
  cameraDrag = { startX: p.x, startY: p.y, camX: camera.x, camY: camera.y };
}

function onMouseUp(event) {
  if (event.button === 1) cameraDrag = null;
  // On window rather than on the canvas (see init), which is what lets a
  // slider dragged off the edge of the panel still be let go of.
  if (event.button === 0) audioDrag = null;
}

// Right-click CANCELS. It is Escape's first job on a mouse button (2026-08-01,
// at the owner's request: "make it so that right clicking while having a tower
// selected deselects the tower").
//
// It clears the same three things Escape's cancel branch clears, and for the
// same reason they are cleared together: "selected" is one idea to the player
// -- an armed build slot, an inspected tower, a tower waiting for an aim click
// -- even though it is three fields here. Clearing only the armed slot would
// leave the panel up over the map and read as a button that half-worked.
//
// It deliberately does NOT open the pause menu when there is nothing to
// cancel, which is where it parts company with Escape. A menu is a place you
// go; a right-click is a dismissal, and one that could put a modal on screen
// would be a trap on a button people click by reflex.
//
// preventDefault always, whatever the screen: the browser's own context menu
// over a game canvas is never what was wanted.
function onRightClick(event) {
  if (event.preventDefault) event.preventDefault();
  if (screen !== "play" || paused || gameOver || victory) return;

  // A right-drag that MOVED was a camera pan, not a cancel. The camera sets
  // the flag with four pixels of slop, so a twitchy click still cancels.
  if (typeof World3D !== "undefined" && World3D.isEnabled() &&
      World3D.camera() && World3D.camera().rightDragMoved) {
    return;
  }

  selectedSlot = null;
  inspected = null;
  aimingTower = null;
  refreshBlockReason();
}

// The wheel. Only the index reads it -- its enemy roster is the one list in
// the game longer than the space it is drawn in -- but the listener lives here
// with every other input rather than on the screen that wants it, the same way
// clicks do.
//
// preventDefault stops the page scrolling underneath the canvas while the
// roster scrolls, which is why the listener is registered non-passive.
function onWheel(event) {
  if (event.preventDefault) event.preventDefault();
  var p = toGameCoords(event);

  if (screen === "index") {
    Codex.onWheel(p.x, p.y, event.deltaY);
    return;
  }

  // On the board the wheel zooms. Not while a modal is up: a pause or
  // game-over screen is a place you are, and moving the map underneath it
  // would be motion with nothing to act on.
  if (screen !== "play" || paused || gameOver || victory) return;
  // In 3D the orbit camera's own wheel listener does the zoom-to-cursor; the
  // 2D zoom must not also run or every notch zooms twice.
  if (typeof World3D !== "undefined" && World3D.isEnabled()) return;
  zoomCameraAt(p.x, p.y,
    event.deltaY < 0 ? CAMERA_ZOOM_STEP : 1 / CAMERA_ZOOM_STEP);
}

function onClick(event) {
  var p = toGameCoords(event);

  // THE AUTOPLAY GATE. A browser will not let a page make a sound until the
  // user has interacted with it, and this is the interaction. Done here rather
  // than in a listener of its own on purpose: the test harness keeps exactly
  // one listener per event name, so a second click handler would silently
  // replace this one and take the whole suite with it. Cheap after the first
  // call -- unlock() returns on its first line once the context exists.
  Sound.unlock();

  // The menu owns every click while it is up.
  if (screen === "menu") {
    if (pointInRect(p.x, p.y, playButtonRect())) { Sound.playUIClick(); openMapSelect(); }
    else if (pointInRect(p.x, p.y, storeButtonRect())) { Sound.playUIClick(); Store.open(); }
    else if (pointInRect(p.x, p.y, indexButtonRect())) { Sound.playUIClick(); Codex.open(); }
    else if (pointInRect(p.x, p.y, sandboxButtonRect())) { Sound.playUIClick(); openSandbox(); }
    return;
  }

  // The armoury owns every click while it is up, exactly as the index does.
  // Its Back button is handled here so the two screens cannot disagree about
  // how leaving works.
  //
  // THE CLICK SOUND IS UNCONDITIONAL ON THIS SCREEN AND ON THE INDEX, and that
  // is a deliberate trade rather than an oversight. Both are full-screen
  // interfaces whose buttons belong to Store/Codex and are hit-tested inside
  // those files, so game.js cannot tell a press from a miss without a second
  // copy of their layouts here -- and a second copy of a layout is exactly the
  // kind of thing this project has been bitten by. The cost is a click on the
  // background of a dense UI screen; the alternative was silent buttons.
  if (screen === "store") {
    Sound.playUIClick();
    if (pointInRect(p.x, p.y, backButtonRect())) openMenu();
    else Store.onClick(p.x, p.y);
    return;
  }

  // The index owns every click while it is up. The Back button is handled
  // here, like the chooser's, so the two screens cannot disagree about how
  // leaving works; everything else on the screen is the codex's own.
  if (screen === "index") {
    // THE MODEL VIEWER OUTRANKS THE BACK BUTTON WHILE IT IS UP. This is the
    // input-priority rule stated above, applied one level in: anything drawn on
    // top must consume clicks before what is under it. The viewer's backdrop is
    // 93% opaque, so the button was all but invisible and still took the click
    // -- and because `Codex.open` resets the index but the modal is not part of
    // `screen`, leaving that way stranded a viewer showing one enemy over a
    // list reset to another.
    Sound.playUIClick();
    if (!Codex.modalUp() && pointInRect(p.x, p.y, backButtonRect())) openMenu();
    else Codex.onClick(p.x, p.y);
    return;
  }

  // The chooser owns every click while it is up.
  if (screen === "select") {
    if (pointInRect(p.x, p.y, backButtonRect())) {
      Sound.playUIClick();
      openMenu();
      return;
    }
    var card = mapCardAt(p.x, p.y);
    if (card !== null) {
      Sound.playUIClick();
      startRun(Maps.LIST[card]);
    }
    return;
  }

  // The pause menu is the topmost modal: while it is up nothing underneath it
  // is clickable, so a click meant for a menu button cannot also land on the
  // board behind it.
  if (paused) {
    if (pointInRect(p.x, p.y, resumeButtonRect())) { Sound.playUIClick(); paused = false; }
    else if (pointInRect(p.x, p.y, backToMenuButtonRect())) { Sound.playUIClick(); leaveRun(); }
    return;
  }

  // Loss and victory both freeze the board beneath an opaque overlay. Only
  // its buttons consume clicks until a new run begins -- same two buttons,
  // same geometry, on either outcome.
  if (gameOver || victory) {
    // The buttons first, and their rects come from the SAME resultButtons()
    // the drawing reads -- so a button cannot be drawn anywhere its hitbox is
    // not. Which buttons exist depends on whether the panel is folded, and
    // that is the one place that decision is made.
    var hit = resultButtonAt(p.x, p.y);
    if (hit) {
      Sound.playUIClick();
      if (hit.id === "inspect") resultMinimised = true;
      else if (hit.id === "show") resultMinimised = false;
      else if (hit.id === "restart") restartGame();
      else if (hit.id === "route") openMapSelect();
      // Through leaveRun(), not openMenu() directly -- that seam is what lets
      // the sandbox, which has no menu screen to switch to, send this button
      // back to index.html instead. See the Screens section of AGENTS.md.
      else if (hit.id === "menu") leaveRun();
      return;
    }

    // FOLDED: the board is readable and NOTHING ELSE. This deliberately does
    // not fall through to the live click handler, which would happily sell a
    // tower, buy an upgrade or place a body on a board whose run is over --
    // the freeze is not something to route around for convenience. Selecting
    // a tower is the entire permitted action, and it mutates nothing but which
    // tower the panel is describing.
    if (resultMinimised) {
      // THROUGH `pickTower`, exactly as the live click handler does. This used
      // to convert with screenToWorld and call `towerAt` itself, which was the
      // right shape for a flat board and is now one of two copies of a question
      // that has stopped having an obvious answer -- see `pickTower`.
      var pick = pickTower(p.x, p.y);
      if (pick) { Sound.playUIClick(); inspected = pick; }
      return;
    }

    return;
  }

  // The mixer outranks everything on the board, including the chrome row it
  // sits in: it is drawn on top of all of it, and the input-priority rule this
  // file already follows is that whatever is drawn on top consumes the click.
  if (audioPanelClick(p.x, p.y)) return;

  // Chrome over the map claims clicks before the map does, exactly like the
  // build bar below. It sits above the bar in this order only because it is
  // cheaper to test; the two rectangles do not overlap, so the order between
  // them cannot matter.
  if (pointInRect(p.x, p.y, speedButtonRect())) {
    Sound.playUIClick();
    cycleGameSpeed();
    return;
  }

  // Live for the whole run, unlike the skip beside it -- see
  // autoSkipButtonRect for why a toggle that vanished would be unturnable-off.
  if (waveControlsShown() && pointInRect(p.x, p.y, autoSkipButtonRect())) {
    Sound.playUIClick();
    toggleAutoSkipWaves();
    return;
  }

  // Only while the button is actually up -- the rest of the time this
  // rectangle is bare map and builds on as usual. Same predicate the drawing
  // and the build preview use; see waveSendAvailable.
  if (waveSendAvailable() && pointInRect(p.x, p.y, waveSkipButtonRect())) {
    Sound.playUIClick();
    skipNextWave();
    return;
  }

  // The build bar sits on top of the map, so it gets first claim on a click.
  var slot = slotAt(p.x, p.y);
  if (slot >= 0) {
    Sound.playUIClick();
    // Clicking the armed slot again disarms it; an empty slot just clears.
    selectedSlot = (slot === selectedSlot || BUILD_SLOTS[slot] === null) ? null : slot;
    refreshBlockReason();
    return;
  }

  // The inspection panel floats above the map, so its buttons outrank
  // whatever happens to be underneath them. Actions before Sell, both
  // before the map -- anything drawn on top must consume clicks first.
  //
  // The blub rail sits beside the panel and is the same kind of thing: chrome
  // drawn over the board that must eat the click rather than let a tower be
  // built under it.
  if (inspected && hitsBlubRail(p.x, p.y)) { Sound.playUIClick(); return; }
  if (inspected && runPanelAction(p.x, p.y)) { Sound.playUIClick(); return; }

  // EVERYTHING ABOVE THIS LINE IS INTERFACE and reads SCREEN coordinates --
  // the build bar, the panel, the speed and wave buttons are all pinned to
  // the canvas and do not move with the camera. Everything below is the map,
  // so it reads WORLD coordinates. This is the seam; crossing it in either
  // direction is the bug this change could most easily introduce.
  var w = screenToWorld(p.x, p.y);

  // Aiming consumes the next map click. It sits BELOW the panel buttons (so
  // you can still hit Sell or another action while aiming) and ABOVE
  // building, so the click that sets a direction never also places a tower.
  if (aimingTower) {
    aimingTower.aimAt(w.x, w.y);
    aimingTower = null;
    return;
  }

  if (inspected && hitsSellButton(p.x, p.y)) {
    Sound.playUIClick();
    sellTower(inspected);
    return;
  }

  // Clicking a tower inspects it, whether or not a slot is armed -- you can
  // never build on top of one anyway, so there is nothing to compete with.
  //
  // ON THE SCREEN POINT, not on `w`. This is the one thing below the seam above
  // that is not a question about the map: a tower is picked where it is DRAWN,
  // and on a board with height in it that is not the world point under the
  // cursor. See `pickTower`.
  var hit = pickTower(p.x, p.y);
  if (hit) {
    Sound.playUIClick();
    inspected = hit;
    return;
  }

  inspected = null;

  var type = selectedType();
  if (type && whyCannotBuild(w.x, w.y, type) === null) {
    // The same resolver the ghost drew through, so the tower lands where the
    // preview promised it would.
    var spot = resolveBuildPoint(w.x, w.y, type);
    var route = nearestPathTo(spot.x, spot.y);
    var built = new type(spot.x, spot.y, route.path);
    built.routeId = route.path.id;
    // Comparable across routes: scale completion on the nearest route onto the
    // primary route used by the target-claiming update order.
    built.pathProgress = route.progress / route.path.length * path.length;
    addTower(built);
    cash -= type.COST;

    // The placement clink. Here and not in addTower(), deliberately: a
    // Summoner's blubs go through addTower too (js/blub.js), and a tower being
    // PLANTED BY THE PLAYER is a different event from one appearing on the
    // board -- one is a decision, the other is a mechanic doing its job.
    Sound.playTowerPlace();

    // Placing disarms the slot. One click, one tower -- so the next click on
    // open ground clears the selection instead of building a second one by
    // accident. Re-arm with the bar, the sidebar, or the number keys.
    selectedSlot = null;
    refreshBlockReason();
  }
}

// Towers are kept sorted by how far along the path they sit, because the
// update loop IS the target-claiming order: whoever runs first gets first pick
// (see Tower.prototype.update). Sorting on placement rather than every frame
// works because towers never move and are never removed.
//
// Why earliest-first: an enemy in range of two towers is always closer to
// leaving the earlier one's circle, so that tower's chance to shoot is the one
// about to expire. Give it the shot; the later tower will get another look.
function addTower(tower) {
  towers.push(tower);
  towers.sort(function (a, b) { return a.pathProgress - b.pathProgress; });
}

// Remove a tower and refund half its cost. Bullets it already fired are left
// alone: they do not reference the tower that fired them, so they keep homing
// and still pay out. Selling never cancels damage already on its way.
// `options.refund === false` removes the tower without paying anything -- used
// when a tower is destroyed rather than sold (death denial spends its holder).
function sellTower(tower, options) {
  var index = towers.indexOf(tower);
  if (index < 0) return;

  // splice keeps the remaining towers in pathProgress order, so the claim
  // priority described in Tower.prototype.update survives a sale.
  towers.splice(index, 1);

  // A tower that belongs to something else tells its owner it has gone. Only
  // the Summoner's blubs do (js/blub.js): they are in `towers` AND in their
  // summoner's fleet, and a body sold through its own panel was leaving the
  // first list while staying in the second -- still counted in the blub count,
  // the pooled HP, the swarm buff and the next Coagulation's tier, while being
  // unable to shoot or be clicked.
  if (typeof tower.onRemoved === "function") tower.onRemoved();

  if (!options || options.refund !== false) cash += sellValue(tower);

  if (inspected === tower) inspected = null;
  if (aimingTower === tower) aimingTower = null;   // it cannot aim once sold
  refreshBlockReason();          // the ground it stood on may now be buildable
}

// Buy an upgrade for a tower that has them. The TRANSACTION -- validation,
// price, affordability -- lives here with the rest of the economy; the panel
// only draws the button that calls it.
//
// Merged in v0.3.5. The Smasher arrived with its own upgrade buttons drawn
// into the panel; those were dropped in favour of the generic
// panelActions/performAction contract the config-driven towers use, but this
// function survived it, because "what does an upgrade cost and may I have it"
// is an economy question rather than a UI one.
function buyUpgrade(tower, id) {
  if (typeof tower.whyCannotUpgrade !== "function") return "not upgradeable";

  var reason = tower.whyCannotUpgrade(id);
  if (reason) return reason;

  var price = tower.upgradeCost(id);
  if (cash < price) return "not enough cash";

  cash -= price;
  tower.applyUpgrade(id);
  refreshBlockReason();          // cash changed, so affordability may have too
  return null;
}

function hitsSellButton(x, y) {
  var r = inspectionLayout(inspected).sell;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// Did this click land on one of the inspected tower's action buttons? If so
// run it and report true so the caller stops there.
//
// The tower owns what the action MEANS; this only supplies the things a
// tower cannot reach on its own -- the wallet and the enemy list -- through
// a small context object. That keeps cash rules in game.js (where the rest
// of the economy lives) rather than scattered into tower files.
// Which action button is under a point, or null. One hit test, used by the
// click handler AND by the hover card, so what you can click and what you can
// hover are the same rectangles -- the same reason slotRect is shared between
// drawing and clicking.
function actionSlotAt(L, x, y) {
  for (var i = 0; i < L.actions.length; i++) {
    var s = L.actions[i];
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
  }
  return null;
}

// Which box of the inspected tower's blub rail is under this point, or null.
// One hit test, used by the click handler AND by the hover card, so what you
// can click and what you can hover are the same rectangles -- the same rule
// actionSlotAt follows for the panel's own buttons.
function railBoxAt(x, y) {
  if (!inspected || typeof inspected.railLines !== "function") return null;

  var L = inspectionLayout(inspected);
  for (var i = 0; i < L.rail.length; i++) {
    var box = L.rail[i];
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      return box;
    }
  }
  return null;
}

// A click on a rail box STARTS OR STOPS that summon line, and reports true so
// the caller stops there -- a box drawn over the map must eat its click rather
// than let a tower be built underneath it.
//
// It opened a second panel view until 2026-08-10, and the owner's verdict was
// that this "creates an unknown behavior": clicking something that looked like
// a switch handed you another screen with a different switch on it. The box IS
// the switch now, and its base stats moved to the hover card -- hovering is the
// gesture that cannot change anything, which makes it the right one for
// reading.
//
// A box below A3 is still drawn and still counts down, because what a tower is
// making and when is worth knowing from the first one; the tower simply refuses
// the click, and the box's own card says why. The refusal comes from the tower
// rather than from a tier test here, so game.js never learns which upgrade buys
// what.
function hitsBlubRail(x, y) {
  var box = railBoxAt(x, y);
  if (!box) return false;
  if (typeof inspected.clickLine === "function") inspected.clickLine(box.line.lineId);
  return true;
}

// Press the open panel's upgrade button for `branch`, as though it had been
// clicked. Returns true if there was one to press.
//
// IT GOES THROUGH runPanelAction AT THE BUTTON'S OWN CENTRE rather than calling
// performAction directly, and that is the whole point of writing it this way:
// the keyboard shortcut is then not a second implementation of "buy the next
// tier" that can drift from the mouse. It inherits the context object, the
// refusal rule (a disabled or maxed button consumes the press and does
// nothing), and `refreshBlockReason` -- none of which a shortcut author would
// think to reproduce, and all of which have been got wrong here before.
//
// `L.upgrades` is the flattened VIEW inspectionLayout already builds of those
// buttons, carrying each one's branch letter, so this needs to know nothing
// about any tower's action ids. All five types tag their upgrade actions with
// `branch`, including the two config-driven adapters.
function pressUpgradeButton(branch) {
  if (!inspected) return false;

  var L = inspectionLayout(inspected);
  for (var i = 0; i < L.upgrades.length; i++) {
    var u = L.upgrades[i];
    if (u.branch !== branch) continue;
    return runPanelAction(u.x + u.w / 2, u.y + u.h / 2);
  }
  return false;
}

function runPanelAction(x, y) {
  var L = inspectionLayout(inspected);

  // The targeting cycle is not a tower action -- every tower has it and it
  // costs nothing -- so it is handled here, before the tower's own buttons.
  var tb = L.targeting;
  if (tb && x >= tb.x && x <= tb.x + tb.w && y >= tb.y && y <= tb.y + tb.h) {
    inspected.targeting = tb.next;
    return true;
  }

  var s = actionSlotAt(L, x, y);
  if (!s) return false;

  // The auto pill is inside its ability button and owns the click first. It
  // remains usable while the ability itself is cooling down.
  if (s.toggle && pointInRect(x, y, s.toggle)) {
    inspected.performAction(s.toggle.id, { cash: cash, enemies: enemies });
    return true;
  }

  // Readouts and disabled buttons still CONSUME the click -- they are drawn
  // over the map, and anything drawn over the map must eat clicks or the
  // player builds underneath it -- but they do nothing.
  if (s.action.readonly || !s.action.enabled) return true;

  inspected.performAction(s.action.id, {
    cash: cash,
    spend: function (amount) { cash -= amount; },
    enemies: enemies,
    damage: function (enemy, amount) { enemy.takeDamage(amount); },
    beginAiming: function (tower) { aimingTower = tower; }
  });

  refreshBlockReason();                 // spending may have changed what is affordable
  return true;
}

// Number keys arm a slot, Escape clears both selections, Delete sells.
function onKeyDown(event) {
  // Keys typed into a text field are not game input. The debug cash panel has
  // one, and without this "1" in that box would arm a build slot.
  var el = event.target;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;

  // The other half of the autoplay gate -- see the note in onClick. A player
  // who starts a run from the keyboard has interacted just as much as one who
  // clicked, and without this their first wave arrives in silence.
  Sound.unlock();

  // The menu owns the keyboard while it is up. Numbered top to bottom,
  // matching the buttons.
  if (screen === "menu") {
    if (event.key === "Enter" || event.key === "1") openMapSelect();
    else if (event.key === "2") Store.open();
    else if (event.key === "3" || event.key === "i" || event.key === "I") Codex.open();
    else if (event.key === "4" || event.key === "s" || event.key === "S") openSandbox();
    return;
  }

  // THE INDEX OWNS ITS OWN KEYS FIRST, and it has to, because it now has a
  // modal inside it. The model viewer is a sub-screen of the index rather than
  // a value of `screen` (see js/codex.js), so Escape has two jobs on this
  // screen: close the viewer if one is up, leave the index if one is not.
  // `Codex.onKey` returns TRUE when it consumed the key, and that return is the
  // only thing stopping one press from doing both -- exactly the rule the pause
  // menu follows against the board underneath it.
  if (screen === "index" && Codex.onKey(event.key)) return;

  if (screen === "index" || screen === "store") {
    if (event.key === "Escape") openMenu();
    return;
  }

  // The chooser owns the number keys while it is up.
  if (screen === "select") {
    if (event.key === "Escape") {
      openMenu();
      return;
    }
    var pick = parseInt(event.key, 10);
    if (pick >= 1 && pick <= Maps.LIST.length) startRun(Maps.LIST[pick - 1]);
    return;
  }

  // The pause menu owns the keyboard while it is up. Escape closes it, so the
  // same key toggles in and out -- and Escape never LEAVES the run, which
  // keeps it the safe key it is everywhere else in this game.
  if (paused) {
    if (event.key === "Escape") paused = false;
    return;
  }

  if (gameOver || victory) {
    if (event.key === "Enter" || event.key === "r" || event.key === "R") {
      restartGame();
    } else if (event.key === "m" || event.key === "M") {
      openMapSelect();
    } else if (event.key === "Escape") {
      // Escape LEAVES here, which it deliberately never does mid-run (see the
      // pause menu, where it is the safe key that only ever cancels). The run
      // is already over: there is nothing left to cancel and nothing left to
      // lose by backing out of it.
      leaveRun();
    }
    return;
  }

  // PANEL SHORTCUTS -- live only while a panel is open, which is what keeps
  // three ordinary letters off the rest of the keyboard (2026-08-10, at the
  // owner's request: X to sell, O for path A, P for path B).
  //
  // They sit ABOVE the camera keys deliberately, and none of the three is one:
  // panning is WASD and the arrows (see CAMERA_KEY_AXES), so `s` was never
  // available for Sell and `x` is the key that was. O and P are simply adjacent
  // to it and to each other, in path order, which is what a shortcut for "the
  // left button" and "the right button" wants to be.
  //
  // Delete and Backspace keep selling, as they always have.
  if (inspected) {
    var panelKey = (event.key || "").toLowerCase();

    if (panelKey === "x" || event.key === "Delete" || event.key === "Backspace") {
      sellTower(inspected);
      return;
    }
    // Through the button, not around it -- see pressUpgradeButton. A branch
    // that is maxed, locked out or unaffordable swallows the press and does
    // nothing, exactly as clicking it would.
    if (panelKey === "o") {
      pressUpgradeButton("A");
      return;
    }
    if (panelKey === "p") {
      pressUpgradeButton("B");
      return;
    }
  }

  // Camera keys. Held rather than tapped, so they set a flag that update()
  // integrates -- a keydown repeat rate is the operating system's, not the
  // game's, and panning at it feels like a stutter.
  if (screen === "play") {
    var key = (event.key || "").toLowerCase();

    // M mutes. ON THE BOARD ONLY, and that is a constraint rather than a
    // preference: `m` already means "change map" on the game-over overlay
    // (see the branch above, which returns before this one), and one letter
    // that did two things depending on whether you had just lost is exactly
    // the sort of key nobody trusts. Every other screen reaches the mixer
    // through the panel.
    if (key === "m") {
      Sound.toggleMute();
      return;
    }

    if (key === "+" || key === "=") {
      zoomCameraAt(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, CAMERA_ZOOM_STEP);
      return;
    }
    if (key === "-" || key === "_") {
      zoomCameraAt(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, 1 / CAMERA_ZOOM_STEP);
      return;
    }
    if (key === "0") {
      resetCamera();
      return;
    }
    if (CAMERA_KEY_AXES[key]) {
      cameraKeys[key] = true;
      if (event.preventDefault) event.preventDefault();
      return;
    }
  }

  // Escape CANCELS FIRST, then opens the pause menu.
  //
  // The key has two jobs now, and this order is what makes both feel right:
  // if anything is armed, selected or aiming, Escape backs out of that --
  // which is what it has always done and what a player mid-action expects.
  // Only when there is nothing left to back out of does it open the menu.
  // Opening a menu over a half-placed tower would be the wrong answer to
  // "get me out of this".
  if (event.key === "Escape") {
    if (selectedSlot !== null || inspected !== null || aimingTower !== null) {
      selectedSlot = null;
      inspected = null;
      aimingTower = null;
      refreshBlockReason();
      return;
    }

    paused = true;
    return;
  }

  var n = parseInt(event.key, 10);
  if (n >= 1 && n <= BUILD_SLOTS.length && BUILD_SLOTS[n - 1] !== null) {
    selectedSlot = (selectedSlot === n - 1) ? null : n - 1;
    refreshBlockReason();
  }
}

// The constructor of the armed slot, or null if nothing is armed.
function selectedType() {
  return selectedSlot === null ? null : BUILD_SLOTS[selectedSlot];
}

// WHATEVER IS DRAWN ON TOP WINS, which is the rule onClick and the inspection
// panel already follow for enemies over recruits.
//
// Only one pair of things on this board can genuinely overlap: a Summoner and
// the monster blub Coagulation puts down ON it (js/blub.js -- the brief says
// "le monster blub apparait a l'emplacement de la tour"). Everything else is
// kept apart by the footprint rule, so this preference costs a flag test and
// decides exactly one case: clicking the fused pair opens the monster, which is
// the thing the player can see and the thing they may want to sell.
function towerAt(x, y) {
  var hit = null;
  for (var i = 0; i < towers.length; i++) {
    if (!towers[i].containsPoint(x, y)) continue;
    if (towers[i].isSummon) return towers[i];
    if (!hit) hit = towers[i];
  }
  return hit;
}

// WHICH TOWER IS UNDER THE CURSOR, and on a board with height in it that is a
// SCREEN-space question rather than a world-space one.
//
// `towerAt` above answers the world-space version and is still the whole rule
// on the flat board, where a tower is drawn exactly where it stands and the two
// questions are the same question. On the 3D board they are not.
// `screenToWorld` casts the cursor at the GROUND PLANE, so a tower up on a
// stump is picked at the spot where z = 0 sits under it — and that spot is not
// under the tower on screen, it is well below it. Measured in the browser, on
// Ironwood's tallest stump at the default 34 degree pitch: with the cursor on
// the tower's drawn feet the old pick landed **39 px** away, which is **1.87
// footprint radii** for an Arcane Sniper and 3.3 for a Rifleman. The click
// target and the tower do not overlap AT ALL for any of the five types, so the
// panel could only be opened by clicking bare dirt at the right distance below
// the thing you meant to click.
//
// So the body is tested WHERE IT IS DRAWN, as two shapes rather than one:
//
//   THE DOME — a hemisphere at the tower's feet, the full footprint radius.
//     At ground level the footprint is exactly the promise this game has always
//     made about where a tower is, so it is not reduced.
//   THE SHAFT — a cylinder from the base to the top of the mesh AND NO HIGHER,
//     at `Tower.HIT_SHAFT_FRACTION` of that radius.
//
// **The shaft was the full footprint for one revision and that was wrong in a
// way that is worse than a fiddly target.** A tower is far narrower than its
// footprint everywhere above its base, so a full-width column is wider than the
// model it stands for — and a wider column does not merely forgive, it STEALS.
// Two Riflemen one behind the other, the near one's column swallowing every
// click aimed at the far one's body: the player is pointing straight at a tower
// they cannot select, which is a worse failure than the one this replaced,
// because at least that one looked like nothing was there.
//
// Two numbers come from the renderer because only the renderer has them: the
// height of the ground it stood the tower on, and the height of the mesh it
// gave it. The hit test itself stays here with every other hit test in this
// file. Same division `groundHeightAt` and `isLevelUnder` already have.
//
// NEAREST TO THE CAMERA WINS, which is the depth-buffer's answer and therefore
// the same one the player's eye gives. Footprints cannot overlap in plan, but
// two columns certainly overlap on screen at a shallow pitch, and the one in
// front is the one being pointed at. A summon still beats a tower outright —
// see `towerAt` for why that pair is the only genuine overlap on the board.
function pickTower(screenX, screenY) {
  var cam = (typeof World3D !== "undefined" && World3D.isEnabled() &&
             World3D.camera) ? World3D.camera() : null;
  if (!cam) {
    var flat = screenToWorld(screenX, screenY);
    return towerAt(flat.x, flat.y);
  }

  var hit = null, hitDepth = Infinity, summon = null, summonDepth = Infinity;
  for (var i = 0; i < towers.length; i++) {
    var t = towers[i];
    if (t.isDestroyed && t.isDestroyed()) continue;

    var ground = World3D.groundHeightAt(t.x, t.y);
    var base = cam.worldToScreen(t.x, t.y, ground);
    if (!base) continue;                       // behind the eye
    var crown = cam.worldToScreen(t.x, t.y, ground + World3D.towerTopOf(t));

    // The footprint is a WORLD radius and this comparison is in screen pixels,
    // so it goes through the camera's own scale at that depth. Reading it flat
    // would make a distant tower's target as fat as a near one's.
    var r = t.footprintPx * (base.scale || 1);
    var dx = screenX - base.x, dy = screenY - base.y;

    var inside = dx * dx + dy * dy <= r * r;              // the dome
    if (!inside && crown) {
      // The shaft, and it is a CYLINDER rather than a capsule: a capsule's cap
      // would hang a footprint's worth of target in the air above the tower's
      // head, and "up to the head, no higher" is the whole of what makes the
      // column honest about where the model ends.
      var ax = crown.x - base.x, ay = crown.y - base.y;
      var len2 = ax * ax + ay * ay;
      if (len2 > 1e-9) {
        var u = (dx * ax + dy * ay) / len2;
        if (u >= 0 && u <= 1) {
          var ox = dx - ax * u, oy = dy - ay * u;
          var shaft = r * (t.hitShaftFraction || Tower.HIT_SHAFT_FRACTION);
          inside = ox * ox + oy * oy <= shaft * shaft;
        }
      }
    }
    if (!inside) continue;

    if (t.isSummon) {
      if (base.depth < summonDepth) { summon = t; summonDepth = base.depth; }
    } else if (base.depth < hitDepth) {
      hit = t; hitDepth = base.depth;
    }
  }
  return summon || hit;
}

function refreshBlockReason() {
  var type = selectedType();
  blockReason = type
    ? whyCannotBuild(worldMouse.x, worldMouse.y, type) : null;
}

// How far a tower's CENTRE must stay from the road centre line: half the road,
// plus the tower's own footprint. Derived, so a tower sits exactly flush
// against the road edge and widening the road moves the rule automatically.
function buildClearancePx(type) {
  return ul(ROAD_WIDTH_UL / 2 + type.FOOTPRINT_RADIUS_UL);
}

// The same rule, on a route whose road CHANGES WIDTH along its length (see the
// profile block at the bottom of js/path.js). Half of however wide the road is
// here, plus the tower's own footprint.
//
// This is the whole reason a chokepoint is worth anything to the player: the
// road pulls its edges in, the clearance ring comes in with it, and a tower may
// stand where a tower could not stand on open road -- closer, so more of the
// road falls inside its circle. A plaza does the opposite and pushes every
// tower back off it. Neither is a bonus bolted on; both fall out of the one
// derived rule above.
//
// `maxWidthScaleNear` rather than the width at one distance: the nearest point
// of the centreline is not always where the road is widest, so a tower beside
// a ramp into a plaza would otherwise be allowed to stand on tarmac a few
// units further along. The window is one road width, which is more than the
// steepest ramp any profile can open over.
//
// On a route with no profile this is `buildClearancePx` to the last bit --
// `maxWidthScaleNear` returns 1 through a null check -- so six of the seven
// boards place towers exactly where they always did.
function roadHalfWidthAt(routePath, progress) {
  var nominal = ul(ROAD_WIDTH_UL);
  return nominal * routePath.maxWidthScaleNear(progress, nominal) / 2;
}

function buildClearanceOn(routePath, progress, type) {
  return roadHalfWidthAt(routePath, progress) + ul(type.FOOTPRINT_RADIUS_UL);
}

function nearestPathTo(x, y) {
  var best = { path: path, distance: Infinity, progress: 0, index: 0 };
  for (var i = 0; i < paths.length; i++) {
    var hit = paths[i].closestToPoint(x, y);
    if (hit.distance < best.distance) {
      best = {
        path: paths[i],
        distance: hit.distance,
        progress: hit.progress,
        index: i
      };
    }
  }
  return best;
}

// Returns null if a tower of this type can be placed here, else a short reason.
// WHERE A TOWER WOULD ACTUALLY GO, given where the cursor is.
//
// IT GOES WHERE YOU CLICKED. That is the whole of the rule now, and it is a
// correction: this used to SNAP a tower to the middle of a stump, so six of the
// board's best firing positions had exactly one pose each and clicking anywhere
// on a forty-pixel top put the tower in the same place. The owner caught it in
// one sentence -- "you can place almost anywhere on the stamp and it always
// gets placed at the same place, in the middle, it shouldn't".
//
// So this no longer moves anything. It answers the other question the callers
// need, which is WHICH STUMP this footprint is standing on:
//
//   platform  -- the footprint fits ENTIRELY on that stump top
//   straddles -- the footprint crosses a stump rim, which is not a pose
//   neither   -- ordinary dirt
//
// ONE FUNCTION, THREE CALLERS: the build ghost, the block-reason readout and
// the click that places the tower. They have to agree exactly.
//
// Tangency is legal at both ends, the same `<=` MapGeometry uses everywhere:
// a footprint exactly touching the rim from inside is on, from outside is off.
function resolveBuildPoint(x, y, type) {
  var spot = { x: x, y: y, platform: null, straddles: null };
  var geo = Maps.geometryOf(currentMap);
  if (!geo.any || !geo.platforms.length) return spot;
  var reach = type ? ul(type.FOOTPRINT_RADIUS_UL) : 0;
  for (var i = 0; i < geo.platforms.length; i++) {
    var pf = geo.platforms[i];
    var dx = x - pf.x, dy = y - pf.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d + reach <= pf.radius) { spot.platform = pf; return spot; }
    // A STUMP IS A RAISED SURFACE WITH A HARD EDGE. A tower is either standing
    // ON it or on the dirt beside it; a footprint overlapping the rim has one
    // side on wood two feet up and the other on the ground, and the model has
    // one ground plane, so it renders half buried or half floating.
    if (d - reach < pf.radius) { spot.straddles = pf; return spot; }
  }
  return spot;
}

function whyCannotBuild(x, y, type) {
  // THE STUMPS. Standing fully on one is legal and standing clear of one is
  // legal; crossing the rim is neither. A tower simply too wide for the top is
  // told so rather than being given the generic answer, because the two have
  // different fixes: move the cursor, or bring a smaller tower.
  //
  // "One tower per stump" used to live here as a rule of its own. It does not
  // any more: with free placement the honest answer is the same one the rest of
  // the board gives -- if two footprints fit side by side without overlapping,
  // they fit, and if they do not, "overlaps another tower" below says so. A
  // hard-coded limit would have painted half of a big stump red with visible
  // room on it, which is exactly the kind of refusal that reads as a bug.
  var spot = resolveBuildPoint(x, y, type);
  if (spot.straddles) {
    return ul(type.FOOTPRINT_RADIUS_UL) > spot.straddles.radius
      ? "too big for this stump" : "half on the stump";
  }

  // TERRAIN. Blockers and landmarks refuse the tower's whole FOOTPRINT, not
  // its centre -- a Summoner whose skirt overlaps a boulder is inside the
  // boulder. `MapGeometry.containsAny` returns on a length test for the six
  // maps that have no geometry at all, so they pay nothing for this.
  var geo = Maps.geometryOf(currentMap);
  if (geo.any && type &&
      MapGeometry.containsAny(geo.noBuild, x, y, ul(type.FOOTPRINT_RADIUS_UL))) {
    return "blocked by terrain";
  }

  for (var routeIndex = 0; routeIndex < paths.length; routeIndex++) {
    // One search, two answers: how far the road is and WHERE ALONG IT the
    // nearest point sits -- which is what decides how wide the road is there.
    // Asking distanceToPoint and then asking again for the progress would be
    // two searches that could disagree about which point is nearest.
    var hit = paths[routeIndex].closestToPoint(x, y);
    if (hit.distance < buildClearanceOn(paths[routeIndex], hit.progress, type)) {
      return "too close to the path";
    }
  }

  for (var i = 0; i < towers.length; i++) {
    // A TOWER AT ZERO HAS ALREADY RELEASED ITS GROUND. The destroyed sweep in
    // update() runs once a step, so a tower (or a spent blub -- see js/blub.js)
    // that died after it is still sitting in this array with its footprint. The
    // owner's brief asks for this to be one rule for everything on the board:
    // "une petite animation de mort est jouee, mais l'emplacement est libere
    // instantanement... doit etre la meme pour toutes les tours du jeu."
    // BlubTower.spotIsFree skips them for the same reason.
    if (towers[i].isDestroyed && towers[i].isDestroyed()) continue;
    // Two footprints may touch but not overlap, so the gap is the sum of the
    // two radii -- which is what makes this work for mixed tower sizes.
    var gap = ul(type.FOOTPRINT_RADIUS_UL + towers[i].footprintRadiusUl);
    var dx = towers[i].x - x;
    var dy = towers[i].y - y;
    if (dx * dx + dy * dy < gap * gap) {
      return "overlaps another tower";
    }
  }

  if (cash < type.COST) {
    return "not enough cash";
  }

  if (x < 0 || y < 0 || x > VIEW_WIDTH || y > VIEW_HEIGHT) {
    return "off the map";
  }

  // NOT ACROSS TWO LEVELS.
  //
  // The board has real height -- raised decks, bays and the road ribbon -- and
  // a footprint that bridges an edge puts the tower half on the deck and half
  // hanging over the drop. There is no pose that reads correctly there, because
  // the model has one ground plane and the tile under it has two.
  //
  // Asked of the 3D board, which owns the height, and only when it is running:
  // with WebGL unavailable the world is flat and every spot is level, so the
  // 2D fallback keeps exactly the placement rules it has always had.
  if (typeof World3D !== "undefined" && World3D.isEnabled() &&
      !World3D.isLevelUnder(x, y, ul(type.FOOTPRINT_RADIUS_UL))) {
    return "not level here";
  }

  return null;
}

// The pause menu's buttons, stacked and centred. Interface chrome, so pixels
// are correct here -- anchored to the 1280x720 viewport, not to the world.
//
// There is no button for this menu anywhere on the HUD: it is Escape only.
// A permanent "Menu" control beside the build bar was tried first and taken
// back out -- it spent screen space all run to be used once, and sat one
// stray click away from ending a thirty-one-wave game.
function resumeButtonRect() {
  return { x: VIEW_WIDTH / 2 - 150, y: VIEW_HEIGHT / 2 - 12, w: 300, h: 54 };
}

function backToMenuButtonRect() {
  return { x: VIEW_WIDTH / 2 - 150, y: VIEW_HEIGHT / 2 + 58, w: 300, h: 48 };
}

// The speed toggle, in the bottom-right corner. Interface chrome, so its size
// and position are PIXELS on purpose and do not scale with UNIT_LENGTH -- the
// same rule the build bar and the inspection panel follow.
//
// The corner is chosen, not arbitrary: it is the one region of the viewport
// nothing else claims. The build bar is centred and ends at x=875, the scale
// bar sits bottom-LEFT, the cash readout is top-right, and inspectionLayout
// clamps every panel above BAR_Y -- so a button on this line cannot be covered
// by, or accidentally covered over, anything else.
var SPEED_BUTTON_W = 78;
var SPEED_BUTTON_H = 40;

function speedButtonRect() {
  return {
    x: VIEW_WIDTH - 24 - SPEED_BUTTON_W,
    y: BAR_Y + (SLOT_SIZE - SPEED_BUTTON_H) / 2,
    w: SPEED_BUTTON_W,
    h: SPEED_BUTTON_H
  };
}

// The auto-send toggle, immediately left of the speed button in the
// bottom-right corner.
//
// It sits with the SPEED control rather than with the wave readout it affects,
// and the reason is that it has to be visible for the whole run: with
// auto-send on, the gap between two waves is three seconds, so a toggle that
// only appeared between waves would be a control the player has three seconds
// at a time to find -- and one that could be switched on and then never
// switched off again. A
// permanently live button is a permanent dead patch of map underneath it, and
// the bottom-right corner is where this game already keeps that cost -- one
// corner of chrome instead of a hole in the middle of the playfield.
//
// It also belongs there on the merits: speed and auto-send are the same kind
// of thing, both "how fast does my run go", both preferences that outlive a
// restart, neither part of the run.
function autoSkipButtonRect() {
  var speed = speedButtonRect();
  return { x: speed.x - 8 - 104, y: speed.y, w: 104, h: speed.h };
}

// Is there anything left for the wave controls to control? After the last wave
// has deployed there is nothing to send and nothing to automate, so both
// buttons go away.
//
// Read by the drawing AND by the click handler, because a rectangle that is
// still live after it stops being drawn is an invisible button sitting over
// open ground eating the clicks meant to build there.
function waveControlsShown() {
  return screen === "play" && waveIndex < WAVES.length;
}

// Is this point over a piece of interface that will CONSUME a click?
//
// The build preview has to know, or it draws a green "yes, build here" circle
// under the cursor and the click then presses a button instead. That mismatch
// already existed for the speed toggle the moment it was added, and every
// button added to the play screen from now on inherits the fix by being listed
// here rather than by remembering to special-case the preview.
//
// This is deliberately NOT part of whyCannotBuild: that function answers
// whether the WORLD allows a tower there (road, footprint, other towers), and
// its answers are geometry that a screen-space rectangle has no business in.
// This is a separate question -- "will the click even reach the map" -- and it
// is asked separately.
function overInterfaceChrome(x, y) {
  if (slotAt(x, y) >= 0) return true;
  if (pointInRect(x, y, speedButtonRect())) return true;
  if (pointInRect(x, y, audioButtonRect())) return true;
  if (audioPanelOpen && pointInRect(x, y, audioPanelRect())) return true;
  if (waveControlsShown() && pointInRect(x, y, autoSkipButtonRect())) return true;
  if (waveSendAvailable() && pointInRect(x, y, waveSkipButtonRect())) return true;
  return false;
}

// The rectangle exists whether or not the button is on screen; everything that
// cares asks waveSendAvailable() first (see onClick, overInterfaceChrome and
// drawWaveSkipButton). One condition, three readers, so the button can never be
// drawn where it is not clickable or clickable where it is not drawn -- the
// same arrangement slotRect and inspectionLayout have.
function waveSkipButtonRect() {
  return { x: 22, y: 100, w: 168, h: 30 };
}

// IS THE SEND BUTTON LIVE? The one predicate behind the drawing, the click and
// the build preview's chrome test -- all three used to spell out their own
// conjunction of `waveControlsShown() && betweenWaves()`, and one of the three
// (the drawing) had already dropped a term. Three copies of a rule is three
// chances for an INVISIBLE BUTTON to keep eating the clicks meant to place a
// tower under it, which is the failure this shape exists to make impossible:
// there is nothing to keep in step, because there is only one of it.
//
// THE RULE IT ENCODES: the button is live once every scheduled body of the wave
// in play is on the road, and never one instant before -- a player must not be
// able to stack wave 8 on top of a wave 7 that is still walking out of the gate.
// It says nothing about whether the road is EMPTY: survivors of a deployed wave
// are the player's problem and do not withhold the button.
//
// IT USED TO READ `betweenWaves()`, which was the same fact under the
// sequential scheduler: a wave stopped deploying and the break opened on the
// same frame, so "no wave is deploying" and "every spawn is out" were one
// thing. THEY CAME APART WITH THE TIMELINE (2026-08-25) -- a wave now stays in
// play on its `duration` for as long as a minute after its last body -- and
// this is the line that moved. The rule itself lives in waveSendReady(), which
// is the same question without the "is this screen even up" half; this is that
// rule AND the screen, which is what a rectangle needs.
function waveSendAvailable() {
  return waveControlsShown() && waveSendReady();
}

// Screen rectangle of build slot i.
function slotRect(i) {
  return {
    x: BAR_X + i * (SLOT_SIZE + SLOT_GAP),
    y: BAR_Y,
    w: SLOT_SIZE,
    h: SLOT_SIZE
  };
}

// Index of the slot under a point, or -1.
function slotAt(x, y) {
  if (y < BAR_Y || y > BAR_Y + SLOT_SIZE) return -1;
  for (var i = 0; i < BUILD_SLOTS.length; i++) {
    var r = slotRect(i);
    if (x >= r.x && x <= r.x + r.w) return i;
  }
  return -1;
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w &&
         y >= rect.y && y <= rect.y + rect.h;
}



// --- Loop -------------------------------------------------------------------

var accumulator = 0;
var lastTime = 0;

function frame(now) {
  var elapsed = (now - lastTime) / 1000;
  lastTime = now;
  // Clamped on REAL time, before the speed multiplier. The clamp exists to
  // stop a stalled tab (or a breakpoint) banking minutes of simulation and
  // then running it all in one frame; that hazard is the same size whatever
  // speed the player picked. Clamping after multiplying would quietly cap 3x
  // at a third of the catch-up 1x gets.
  if (elapsed > MAX_FRAME_TIME) elapsed = MAX_FRAME_TIME;

  accumulator += elapsed * gameSpeed;
  while (accumulator >= FIXED_STEP) {
    update(FIXED_STEP);
    accumulator -= FIXED_STEP;
  }

  // The camera runs on REAL elapsed time, deliberately outside the fixed-step
  // loop and unscaled by gameSpeed. It is not simulation: panning should feel
  // the same at 1x and 3x, and it must keep working while the game is paused.
  updateCameraPan(elapsed);
  // The 3D camera eases on the same real-time clock and for the same reasons:
  // orbiting should feel identical at 1x and 3x, and must keep working paused.
  worldRenderState.dt = elapsed;
  // The camera moved this frame even if the mouse did not, so what the cursor
  // is over has to be re-asked. See refreshWorldPointer.
  if (typeof World3D !== "undefined" && World3D.isEnabled() &&
      screen === "play" && mouse.x > -100) {
    refreshWorldPointer();
  }

  draw();
  requestAnimationFrame(frame);
}

function update(dt) {
  // Only a run simulates. Written as "is it play" rather than as a list of
  // screens that are not: the menu was added by listing them, and the
  // simulation promptly ran behind the title screen -- waves spawning,
  // enemies walking, the base taking damage before the player had pressed
  // PLAY. Any future screen is inert here by default.
  if (screen !== "play") return;
  if (gameOver || victory) return;     // both outcomes freeze the board
  if (paused) return;                  // a menu must not cost the player a leak

  // Time is being rewound (the beam tower's death denial). Everything else is
  // frozen -- no movement, no firing, no spawning -- and only the rewind
  // advances. That freeze is the effect: the save reads as time stopping, not
  // as enemies being teleported.
  if (typeof DeathDenial !== "undefined" && DeathDenial.isRewinding()) {
    DeathDenial.updateRewind(dt);
    return;
  }

  // THE SOLAR CLOCK, first, on the same fixed step as everything else.
  //
  // It is here rather than in a renderer for one reason and it is the whole
  // design: this line is already gated on the run being active, unpaused, not
  // over and not rewinding, and it is already called more often at 2x and 3x.
  // So the sky freezes with the board, accelerates with the board and does not
  // exist on the menu, and none of that had to be written into the cycle.
  if (typeof EnvironmentCycle !== "undefined") EnvironmentCycle.update(dt);

  updateWaves(dt);

  var i;
  for (i = 0; i < enemies.length; i++) enemies[i].update(dt);

  // Enemies that seed more enemies (the Hive) drop their brood here.
  //
  // Collected into a separate list and appended AFTER the walk, not pushed
  // during it: `enemies.length` is re-read every iteration of the loop above,
  // so a brood pushed mid-walk would be stepped on the frame it appeared and
  // -- for a spawner whose brood could itself spawn -- could recurse inside
  // one update. The enemy returns its brood and the loop owns the list, the
  // same division attackTowers uses.
  var brood = null;
  for (i = 0; i < enemies.length; i++) {
    var born = enemies[i].spawnMinions(dt);
    if (born) brood = brood ? brood.concat(born) : born;
  }
  if (brood) enemies = enemies.concat(brood);

  // Enemies that help OTHER enemies (the Shieldbearer's shields, the Healer's
  // regeneration, the fast boss's own shield) pulse here.
  //
  // AFTER the brood has been appended, so a hatchling born this step is a
  // candidate rather than being invisible for one pulse, and BEFORE the towers
  // act, so a shield granted this step is a shield the board has to shoot
  // through this step. Separate from enemy.update(dt) for the same reason
  // attackTowers is: this one needs the whole enemy list, and update() needs
  // nothing but the path. See Enemy.prototype.supportAllies.
  for (i = 0; i < enemies.length; i++) enemies[i].supportAllies(dt, enemies);

  // Enemies that hit back (the Angry type) swing here, AFTER everything has
  // moved and BEFORE the towers act. Order matters: a tower destroyed this
  // step must not also get a shot off, or a swing that killed it would still
  // be paid for.
  //
  // Separate from enemy.update(dt) on purpose -- movement needs nothing but
  // the path, this needs the board. See Enemy.prototype.attackTowers.
  for (i = 0; i < enemies.length; i++) enemies[i].attackTowers(dt, towers);

  // Sweep out anything the swings destroyed. filter() preserves order, so the
  // towers array stays sorted by pathProgress -- the invariant the whole
  // target-claiming scheme rests on (see AGENTS.md). Doing it as one sweep
  // rather than splicing mid-loop is the same reasoning the enemy end-of-life
  // sweep follows: a tower's fate is decided in exactly one place.
  var destroyed = false;
  for (i = 0; i < towers.length; i++) {
    if (towers[i].isDestroyed && towers[i].isDestroyed()) { destroyed = true; break; }
  }
  if (destroyed) {
    towers = towers.filter(function (t) {
      if (!t.isDestroyed || !t.isDestroyed()) return true;
      // Cosmetic only, and typeof-guarded like every other Effects call.
      if (typeof Effects !== "undefined" && Effects.towerDestroyed) {
        Effects.towerDestroyed(t);
      }
      return false;
    });
    // Selection state can outlive the thing it points at. A panel open on a
    // dead tower would offer to sell something that is not there.
    if (inspected && inspected.isDestroyed && inspected.isDestroyed()) inspected = null;
    if (aimingTower && aimingTower.isDestroyed && aimingTower.isDestroyed()) aimingTower = null;
  }

  // A tower's update returns the DAMAGE it landed itself this step. Cash no
  // longer follows that number; it is still returned for damage counters,
  // lifesteal and charge mechanics. Projectile towers return 0 here and report
  // damage when their bullets land instead.
  //
  // The fourth argument is the small slice of the world a tower may need but
  // cannot reach: how much gold the player has (the beam's A5 scales off it
  // live), a way to heal the base (its lifesteal) and a way to bank gold that
  // is not damage. Passed in rather than read from globals so the dependency
  // is visible from the tower's side.
  worldContext.gold = cash;

  // How long the bullet list was BEFORE the towers acted. Anything past this
  // index afterwards was fired this step, which is how the shot sound is
  // hooked without a line in any of the five tower files: a projectile
  // appearing in this array IS a tower firing, and it is the only definition
  // of that event all five types already agree on. Beam and Summoner towers
  // spawn no bullets and are correctly silent here -- neither of them fires.
  var bulletsBefore = bullets.length;

  for (i = 0; i < towers.length; i++) {
    // A STUNNED tower does nothing at all this step -- and that includes its
    // cooldown, which is why this is a `continue` and not a flag passed into
    // update(). A stun that let cooldowns keep ticking would be half absorbed
    // by whatever the tower was already waiting on.
    //
    // Enforced HERE, in the one place all four tower types come through,
    // rather than inside each of them. See TowerHealth.tickStun for why.
    if (typeof TowerHealth !== "undefined" && TowerHealth.tickStun(towers[i], dt)) {
      continue;
    }
    // The return is captured BEFORE cash is touched, deliberately.
    // `cash += tower.update(...)` reads cash first, then runs update -- so any
    // gold the tower banks through worldContext.addGold DURING that call is
    // silently overwritten by the assignment. It cost the beam tower its
    // entire charge bonus, invisibly, until a test caught the totals
    // disagreeing.
    towers[i].update(dt, enemies, bullets, worldContext);
  }

  // One shot sound for whatever was fired this step, whether that was one
  // bullet or eleven. Presentation only, and read-only over the array the
  // towers just wrote -- nothing is put back.
  if (bullets.length > bulletsBefore) {
    Sound.playTowerFire(fireKindOf(bullets[bulletsBefore]));
  }

  // Bullets still apply and report landed damage, but only the later death
  // sweep pays cash. The enemy list goes in because a straight-line projectile
  // (see PierceBullet) has to find out what it flew into.
  for (i = 0; i < bullets.length; i++) {
    bullets[i].update(dt, enemies);
  }

  // A leaked enemy damages the base exactly once: it is removed at the end of
  // this same update. Use remaining health, not max health, so partial damage
  // dealt before the leak still matters.
  //
  // This sweep is also where the run's kills are counted and where cosmetic
  // feedback fires -- it is the one place an enemy's fate is decided exactly
  // once, right before the filter below removes it. Effects are told, never
  // asked: the simulation must play identically without them.
  var splitChildren = [];
  for (i = 0; i < enemies.length; i++) {
    var gone = enemies[i];
    if (gone.dead) {
      runKills++;
      var killBounty = gone.bounty();
      cash += killBounty;
      // Death-created enemies are collected and appended only after this
      // sweep. That gives every parent exactly one payout/removal and prevents
      // newly born children from being visited halfway through the same loop.
      var divided = gone.splitOnDeath();
      if (divided) splitChildren = splitChildren.concat(divided);
      if (typeof Effects !== "undefined") {
        Effects.enemyKilled(gone, killBounty);
      }
      // Beside the Effects hook and for the same reason: this sweep is the one
      // place an enemy's fate is decided exactly once, so it is the one place
      // that cannot double-count a death. The synthesizer decides how many
      // simultaneous deaths are worth hearing -- see playEnemyDeath.
      Sound.playEnemyDeath();
    } else if (gone.leaked) {
      // HEALTH, not remainingHealth(): a shield is armour the enemy was
      // wearing, not mass it throws at the base. A Bulwark that walks in
      // untouched costs 12, the same as the body it is -- which is what makes
      // its 36 points of toughness a cost in TIME rather than a bigger leak.
      baseHp -= gone.health;
      if (typeof Effects !== "undefined") {
        Effects.baseHit(gone.pos.x, gone.pos.y, Math.round(gone.health));
      }
    }
  }
  // Last chance before the run ends: a tower may be holding a one-shot save
  // (the beam tower's death denial). The system decides whether one is
  // available and applies its whole effect -- see js/systems/death-denial.js.
  // Nothing here knows which tower it was or what the save does.
  if (baseHp <= 0 && typeof DeathDenial !== "undefined") {
    var saved = DeathDenial.tryConsume({
      towers: towers,
      enemies: enemies,
      sellTower: sellTower
    });
    if (saved) baseHp = saved.restoreBaseHpTo;
  }

  baseHp = Math.max(0, baseHp);
  if (baseHp === 0 && !gameOver) {
    gameOver = true;
    // The one moment the run ends in defeat. Guarded on the flag rather than
    // played beside the assignment further down, so a future reordering of
    // this function cannot turn one loss into a loop of them.
    Sound.playGameOver();
  }

  // The base-in-danger warning, which is both a sound and a light -- see
  // updateLowHealthAlert.
  updateLowHealthAlert(dt);

  enemies = enemies.filter(function (e) { return !e.dead && !e.leaked; });
  if (splitChildren.length) enemies = enemies.concat(splitChildren);
  bullets = bullets.filter(function (b) { return !b.dead; });

  // GATE 1 -- THE WAVE WAS ELIMINATED. Every body it named is out and not one
  // of them is left alive, so the wave is over: pay it, and put the next one
  // five seconds away (WAVE_CLEAR_DELAY, 2026-07-31 at the owner's request --
  // "once all the enemies of a wave have been killed, if not on auto skip,
  // leave a 5 seconds delay until the next wave"). With auto-send on it is
  // still three, because auto-send re-calls every step and a call only ever
  // moves the wave closer.
  //
  // Checked HERE, right after the sweep, because this is the one moment the
  // list is authoritative -- everything that died this step is out of it and
  // nothing new has spawned. updateWaves() ran at the top of update(), so a
  // body emitted this frame is already in `enemies` and cannot be missed by
  // the scan below.
  //
  // THE TEST IS PER-WAVE, NOT PER-BOARD (2026-08-25). It used to read
  // `enemies.length === 0`, which meant a survivor of an EARLIER wave -- the
  // stragglers a ceiling leaves behind, a Fractal Slime cascade still
  // unwinding two waves later -- silently held this wave's clear open. Beating
  // wave 30 outright paid nothing and called nothing in while one wave-29 Brute
  // was still walking, and the player had no way to tell which body was doing
  // it. Now each wave is closed by its own bodies going away and nothing else.
  //
  // A WAVE THAT IS ONLY PARTLY DEPLOYED CANNOT REACH HERE, and under the
  // timeline that is worth more than it used to be: lastDeployedWave() answers
  // 0 until the event cursor is at the end of the wave, so a road that goes
  // momentarily EMPTY between two scheduled groups is not a clear. Wave 13
  // sends five salvos of Angries 4.5 s apart and a good board empties the road
  // between every pair of them; under a board-empty test that wave would have
  // paid out and rolled on after its first four bodies.
  var deployed = lastDeployedWave();
  if (deployed > 0 && !waveStillOnTheRoad(deployed)) {
    if (waveIndex >= WAVES.length) {
      // The schedule is spent, so the only wave that can be closed here is the
      // last one -- and closing it is nothing but the payout. There is no next
      // wave to announce and no transition to open: the win is decided by the
      // whole-road check below, on this same step.
      payWaveBounty();
    } else {
      endWave(WAVE_CLEAR_DELAY);
    }
  }

  // The win: the scheduler ran itself dry AND the board is clear, with the
  // base still standing. Checked after the loss so that a final enemy that
  // both leaks-to-zero and empties the board reads as the defeat it is.
  //
  // THIS ONE STAYS `enemies.length === 0`, and the asymmetry with the branch
  // above is deliberate rather than an oversight. A wave transition is a
  // question about ONE wave, so it looks at one wave's bodies. Winning the run
  // is a question about the ROAD: nothing survives the end of the campaign, so
  // a stray wave-33 Brute still walking during wave 35 has to keep the victory
  // screen away. `waveStillOnTheRoad(35)` would hand the player the win over
  // its head. Descendants are covered either way -- they carry an origin -- but
  // only the whole-board test covers the leftovers of every earlier wave too.
  if (!gameOver && allWavesDeployed && enemies.length === 0) {
    victory = true;
  }

  // Bank the meta coins the moment the run ends, whichever way it ended.
  //
  // `runAwarded` is what makes this happen EXACTLY ONCE. update() returns
  // early on gameOver/victory, so in the shipping game this line can only be
  // reached on the step that set the flag -- but the sandbox un-loses a run
  // by putting base HP back, and a second award on the way down again would
  // pay twice for the same run. The flag is run state and restartGame()
  // clears it.
  if ((gameOver || victory) && !runAwarded) {
    runAwarded = true;
    // STRUCTURED SINCE 2026-08-26: the result screen shows where every coin
    // came from and must never re-derive it, so what comes back is the list of
    // sources and a total summed FROM them. The map is named as well as
    // identified because the first-clear bonus is keyed on the ID -- a rename
    // must not pay twice -- while the label the player reads is the name.
    lastRunAward = MetaProgress.awardRun({
      wavesCompleted: wavesCompleted(),
      waveReached: reachedWave(),
      victory: victory,
      mapId: Maps.currentId ? Maps.currentId() : (currentMap && currentMap.id),
      mapName: currentMap && currentMap.name
    });
  }

  // Cosmetic timers advance on the same fixed step as the world they
  // decorate, and freeze when it freezes.
  if (typeof Effects !== "undefined") Effects.update(dt);

  // Cash changed this step, so affordability may have flipped.
  refreshBlockReason();
}

// THE BASE IS IN DANGER. One latch, driving two things: the klaxon and the
// pulse on the HP readout (see drawStatus).
//
// IT IS DELIBERATELY BOTH. A player who has muted the game -- or who cannot
// hear it -- must still be told, and an alert that exists only as a sound is
// an alert half the audience never receives. The light is not a fallback that
// switches on when the sound is off; it is always on, and the sound is the
// half that can be turned off.
//
// The threshold has HYSTERESIS: it arms at a quarter of the starting base HP
// and only disarms above 32%. Base HP is a free counter that lifesteal pushes
// back up (see drawStatus), so a base hovering on a single line would
// otherwise re-trigger the alarm every few seconds. And while it stays low the
// alarm repeats on a slow timer rather than sounding once: a warning that
// stopped while the danger continued would be a lie, and one that never
// stopped would be a reason to mute the game.
var LOW_HEALTH_FRACTION = 0.25;
var LOW_HEALTH_CLEAR_FRACTION = 0.32;
var LOW_HEALTH_REPEAT = 9;        // seconds of game time between alarms

var lowHealthActive = false;
var lowHealthTimer = 0;
var lowHealthPulse = 0;           // drives the readout's flash; run state

function updateLowHealthAlert(dt) {
  // THE RUN IS OVER, SO THE WARNING IS OVER. Without this, a base that fell
  // from healthy to zero in a single blow armed the latch on the very step it
  // died -- the timer starts expired, so the klaxon would fire directly on top
  // of the game-over sound, warning about a base that had already gone. It is
  // reached only on the step the flag flips: update() returns early ever after.
  if (gameOver || victory) {
    lowHealthActive = false;
    return;
  }

  if (!lowHealthActive && baseHp <= BASE_MAX_HP * LOW_HEALTH_FRACTION) {
    lowHealthActive = true;
    lowHealthTimer = 0;
    lowHealthPulse = 0;
  } else if (lowHealthActive && baseHp > BASE_MAX_HP * LOW_HEALTH_CLEAR_FRACTION) {
    lowHealthActive = false;
    Sound.stopAlert();
    return;
  }

  if (!lowHealthActive) return;

  lowHealthPulse += dt;
  lowHealthTimer -= dt;
  if (lowHealthTimer <= 0) {
    // Safe to call whether or not one is already sounding: the synthesizer
    // drops a request that arrives while the sequence is still running, which
    // is what "can be called repeatedly without stacking" means here.
    Sound.playLowHealthAlert();
    lowHealthTimer = LOW_HEALTH_REPEAT;
  }
}

// Is the run in a TRANSITION right now -- one wave over, the next announced
// and not yet started? The same test drives the readout, the Send button's
// break behaviour and the skip itself, so the button cannot claim to shorten a
// countdown that is not running.
//
// `waveCountdown > 0` is the whole definition since the timeline rewrite. It
// used to also require `waveSpawned === 0`, which was load-bearing under the
// sequential scheduler -- a wave ENDED there the instant its last body dropped,
// so "spawning" and "between" were the two halves of one line. They are not any
// more: a wave now stays on the clock after it is fully deployed, and the
// countdown is zero for every second of that. Only a transition ever puts a
// number on `waveCountdown`, so only a transition satisfies this.
//
// IT INCLUDES THE PAUSE BEFORE WAVE 1 (2026-07-31), which is why nothing here
// tests `waveIndex > 0`: the opening ten seconds are a countdown like any
// other, and that is what gives them the Send button, the readout and
// auto-send without a second code path. `beforeFirstWave` exists only for the
// two places that genuinely differ, the label on the button and how long
// pressing it takes.
function betweenWaves() {
  return waveIndex < WAVES.length && waveCountdown > 0;
}

// The number of the wave whose LAST scheduled body is already on the road, or
// 0 when no wave is in that state.
//
// It answers a question about DEPLOYMENT, never about the road: a wave can be
// fully deployed with sixty bodies still walking, and that is precisely the
// state the Send button and the elimination gate both need to name.
//
// THE OFF-BY-ONE MOVED WITH THE REWRITE and it is worth reading twice. Under
// the sequential scheduler this was `waveIndex`, because a wave was popped off
// the cursor the moment its last body spawned, so the wave BEHIND the cursor
// was the deployed one. A wave now holds the cursor until one of the three
// gates closes it, so the deployed wave is the one the cursor is ON --
// `waveIndex + 1` as a player-facing number.
//
// Three states, and 0 for the two that have no answer:
//   * the schedule is spent   -> the final wave, and only if it really
//                                deployed (allWavesDeployed, never index
//                                arithmetic -- see the flag)
//   * a wave is on the clock  -> its own number once every event is out
//   * anything else           -> 0, the "no wave" identity nothing wears
//
// During a TRANSITION the answer is deliberately 0 even though the wave behind
// it is obviously deployed. That wave has already been closed and paid by the
// gate that opened the transition; re-reporting it here would invite a second
// close, and the stragglers it left are scenery from this point on.
function lastDeployedWave() {
  if (waveIndex >= WAVES.length) return allWavesDeployed ? WAVES.length : 0;
  if (waveCountdown > 0) return 0;
  return waveFullyDeployed() ? waveIndex + 1 : 0;
}

// Is any body from wave `number` still walking?
//
// THIS IS THE WHOLE OF "the wave is beaten", and what it deliberately does NOT
// ask is whether the ROAD is empty. Those were the same question until waves
// were allowed to overlap: a wave whose `duration` ceiling expires leaves its
// survivors on the road, and under an `enemies.length === 0` test those
// stragglers would hold the NEXT wave's clear open for as long as they lived --
// so beating wave 30 outright would pay nothing and call nothing in, because a
// Brute from wave 29 was still walking. A wave is over when ITS bodies are
// gone; the ones ahead of it are the player's problem, not the scheduler's.
//
// Descendants count, because they carry the origin (see Enemy's waveId): a
// wave-25 Fractal Slime is not beaten until all 84 of its children are, which
// is exactly what a player would say about it.
//
// `number <= 0` is false immediately -- 0 is the "no wave" identity worn by
// sandbox spawns and codex sprites, and a scan for it would either always
// answer no (in a real run) or wrongly hold the schedule open on a workbench.
function waveStillOnTheRoad(number) {
  if (number <= 0) return false;
  for (var i = 0; i < enemies.length; i++) {
    if (enemies[i].waveId === number) return true;
  }
  return false;
}

// Is this the opening pause, before wave 1 has put anything on the road?
//
// Its two readers are the label on the Send button ("Start wave 1") and how
// long pressing it takes (zero seconds rather than three), so it has to be
// false the instant wave 1 is on the clock and stay false for the rest of the
// run -- and `waveIndex` only ever grows, so the second half is free.
//
// `betweenWaves()` rather than `waveSpawned === 0` since the timeline rewrite:
// a wave whose opening group is not at zero -- wave 11 authors its Midboss at
// `at: 4` -- is in play with nothing deployed, and under the old test a run
// parked there would have called itself the opening pause.
function beforeFirstWave() {
  return waveIndex === 0 && betweenWaves();
}

// Is a wave ON THE CLOCK right now -- its own timeline running, and the
// schedule not yet spent?
//
// Distinct from `!betweenWaves()`, which is also true after the last wave has
// deployed and there is nothing left to be between. The readout needs the
// positive form: "there is a wave, and here is its number and its clock".
//
// IT IS THE CLOCK, NOT THE ROAD, and the rewrite is what forced the
// distinction. This read `waveSpawned > 0` while the scheduler was sequential,
// where the two were the same thing: nothing ticked until a body was out and
// the wave ended when the last one was. A timeline wave owns a WINDOW. Wave 11
// authors its Midboss at `at: 4`, so for four seconds it is genuinely in play
// with an empty road and `waveSpawned === 0` -- and every wave stays in play
// after its last body, for as long as its `duration` or its survivors last.
// `waveCountdown <= 0` is the honest test: a transition is the only thing that
// ever puts time on that countdown.
function waveInPlay() {
  return waveIndex < WAVES.length && waveCountdown <= 0;
}

// Has the wave on the clock put every body it names on the road?
//
// THE GATE FOR THE SEND BUTTON, and the reason it is a question about the
// EVENT CURSOR rather than about the road: the owner's rule is that Send
// becomes available once the wave is done ARRIVING, whether or not it is done
// dying. A test against `enemies.length` would hide the button again every
// time a straggler lived, which is the one moment a player most wants it.
//
// False when no wave is on the clock at all, so callers need no second guard.
function waveFullyDeployed() {
  return waveInPlay() && waveSpawned >= waveEventCount();
}

// Seconds left on the wave in play before its `duration` runs out, or null when
// there is no such number to show.
//
// NULL IS NOT ZERO and the difference is the whole point. Two things return
// null: no wave is in play, and -- the case this exists for -- the wave in play
// has no `duration` at all. Wave 35 is the only one, and its missing ceiling is
// the data saying "there is nothing after this". A function that fell back to a
// default here would put a countdown on the screen ticking towards a wave 36
// that does not exist, which is exactly the fake timer the readout must never
// draw. Never materialise a default for an absent field.
//
// Clamped at 0 rather than going negative. The clamp is now UNREACHABLE in a
// running game -- updateWaves() closes the wave on the same step the limit is
// crossed -- and it is kept because a test or the sandbox can park the clock
// past the ceiling by hand, and "-14 s left" is not a thing to show a player.
function waveTimeRemaining() {
  if (!waveInPlay()) return null;
  var limit = WAVES[waveIndex].duration;
  if (limit === undefined || limit === null) return null;
  return Math.max(0, limit - waveElapsed);
}

// ---------------------------------------------------------------------------
// THE TIMELINE SCHEDULER (2026-08-25)
//
// A wave is a set of INDEPENDENT groups on one absolute clock, not a queue.
// Deploying it is therefore not a walk down a list, it is a merge: expand every
// group into the bodies it names, put each body at
// `group.at + N * group.interval`, sort the lot, and emit whatever is due.
//
// WHY A MATERIALISED EVENT LIST AND NOT AN ON-THE-FLY MINIMUM. Both are
// correct, and the list is the one that is OBVIOUSLY correct: the invariant
// "each body is emitted exactly once, in a fixed order, no matter how time is
// chopped up" is a property of an array and a forward-only cursor, and it is a
// property that has to be argued about for a per-frame scan over twelve groups.
// Wave 30 has the most groups of any wave, twelve, for 33 bodies; wave 12 has
// the most bodies, 88, in four groups. The array costs one small object per
// body, built when the wave starts and dropped when it ends, against a
// re-derivation every frame of the run for the alternative.
//
// WAVES REMAINS THE SOURCE OF TRUTH. The list is DERIVED and never authored,
// never edited, never carried across waves: waveTimeline() is a pure function
// of one wave, and activeWaveEvents() rebuilds it the moment `waveIndex` names
// a different wave than the cache does. That is what stops the "two
// representations that can disagree" failure -- only one wave's worth of
// derived data is ever alive, and it is thrown away rather than updated.
//
// NO setTimeout, NO promise, NO coroutine. The only clock is `waveElapsed`,
// which is simulated time on the same fixed step as everything else, and which
// is therefore frozen by the pause menu, by the menu screen and by the beam's
// rewind for free.
// ---------------------------------------------------------------------------

// Expand one wave into the bodies it names, in the order they ARRIVE.
// `{ time, groupIndex, bodyIndex, type, health, tier }`, `time` in seconds from
// the start of the wave.
//
// This is the translation from what a wave CONTAINS to what a wave DOES, and
// the sort is the translation rather than tidiness: groups are independent, so
// concatenating their bodies is emphatically not time order -- wave 12's third
// group opens at 4.0 s while its second is still dropping Swarm until 9.3.
//
// N * interval, NOT interval added N times. Wave 12's Swarm group is forty
// bodies 0.2 s apart; an accumulating sum drifts by the dust of forty float
// additions, so where the fortieth lands would depend on how it was reached.
// The multiplication is the same double every time and is the number the data
// actually states, which is what lets a test name an arrival to the
// millisecond.
//
// THE TIE-BREAK IS A TOTAL ORDER, on purpose. Bodies do share a timestamp
// exactly, 42 times across the schedule -- wave 12's Fast column and its Swarm
// column collide at 2.1, 3.5 and 4.9 s among others, and wave 30 puts a Hive
// and an Angry on 7.0 s together. (Wave 4 does NOT, despite reading as though
// it might: its three groups run 0-1.35, 3-4.35 and 6-7.35, so they never
// overlap.) Comparing only `time` would leave colliding bodies
// in whatever order the engine's sort happened to produce and the schedule
// would play back differently on a different Node. (time, groupIndex,
// bodyIndex) has no ties left in it, which also makes the sort's own stability
// irrelevant -- Array.prototype.sort is not required to be stable in every
// engine this file has to open in.
//
// type/health/tier are COPIED, and `undefined` is copied as `undefined`.
// Absent stays absent: a group with no `health` inherits its type's, and
// materialising the default here would put a number in front of Enemy.healthOf
// that the schedule never authored.
function waveTimeline(wave) {
  var groups = waveGroups(wave);
  var events = [];
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    for (var n = 0; n < g.count; n++) {
      events.push({
        time: g.at + n * g.interval,
        groupIndex: i,
        bodyIndex: n,
        type: g.type,
        health: g.health,
        tier: g.tier
      });
    }
  }
  events.sort(function (a, b) {
    if (a.time !== b.time) return a.time - b.time;
    if (a.groupIndex !== b.groupIndex) return a.groupIndex - b.groupIndex;
    return a.bodyIndex - b.bodyIndex;
  });
  return events;
}

// When the last scheduled body of a wave arrives, in seconds from its start.
// -1 for a wave that sends nothing.
//
// Simulation-free: it exists so the SCHEDULE can be checked against itself. A
// `duration` at or below this number is a wave whose ceiling silently deletes
// its own tail, which is the one authoring mistake the timeline makes easy and
// that nothing else would catch. See validateWaveTimelines.
function waveLastSpawnTime(wave) {
  var events = waveTimeline(wave);
  return events.length === 0 ? -1 : events[events.length - 1].time;
}

// The derived timeline of the wave the cursor is on. Derived RUN state -- see
// the header above.
//
// Keyed on `waveIndex` rather than trusted blindly, because this game is driven
// from the outside more than most: the sandbox sets `waveIndex` by hand and
// tests park the cursor mid-wave to deploy one exact body. A cache that only
// rebuilt when the scheduler said so would hand those callers a different
// wave's events, which is the kind of bug that reads as a data error for a day.
var activeEventList = null;
var activeEventListIndex = -1;

function activeWaveEvents() {
  if (waveIndex >= WAVES.length) return [];
  if (activeEventListIndex !== waveIndex || activeEventList === null) {
    activeEventList = waveTimeline(WAVES[waveIndex]);
    activeEventListIndex = waveIndex;
  }
  return activeEventList;
}

// How many bodies the wave on the cursor deploys. Equal to waveCount() of the
// same wave by construction -- one event per body -- and read through the event
// list so the cursor and its own bound can never be counted two ways.
function waveEventCount() {
  return activeWaveEvents().length;
}

// Drop the derived timeline. For the callers that may have replaced WAVES
// itself UNDER the cursor without moving the index: restartGame(), and any
// fixture that swaps the schedule in place.
function resetWaveTimeline() {
  activeEventList = null;
  activeEventListIndex = -1;
}

// EVERY `duration` MUST OUTLAST ITS OWN LAST SPAWN, and this is the check that
// says so out loud.
//
// The failure it exists for is silent and awful: author a wave whose ceiling
// falls before its last group and the scheduler ends the wave on time and
// simply never emits the tail. Nothing throws, the road looks busy, the wave
// pays its full clear bounty, and the only symptom is that the schedule's
// stated 830 bodies are not the ones that walked. A composition test would
// still pass -- it reads the data, not the deployment.
//
// STRICTLY GREATER, not >=. A body due at the exact instant the ceiling closes
// is a body whose emission depends on the order of two comparisons inside one
// frame, and "it depends" is not a schedule.
//
// A MISSING `duration` IS LEGAL FOR THE LAST WAVE ONLY. Wave 35 has no ceiling
// because there is no wave 36 to be pushed towards; an earlier wave without one
// would hang the campaign on whatever happened to still be walking, so that is
// an error rather than an open window.
//
// Returns the problems rather than throwing, so one call reports all of them.
function validateWaveTimelines(schedule) {
  var problems = [];
  for (var i = 0; i < schedule.length; i++) {
    var wave = schedule[i];
    var last = waveLastSpawnTime(wave);
    var limit = wave.duration;
    var isLast = i === schedule.length - 1;

    if (limit === undefined || limit === null) {
      if (!isLast) {
        problems.push("wave " + (i + 1) + " has no `duration`: only the last " +
          "wave of a schedule may run without a ceiling");
      }
      continue;
    }
    if (!(limit > last)) {
      problems.push("wave " + (i + 1) + " ends at duration " + limit +
        " s but its last spawn is due at " + last.toFixed(2) +
        " s -- the tail of the wave would never be emitted");
    }
  }
  return problems;
}

// Run it once, at load, on the shipped schedule. A schedule that cannot deploy
// itself is not a thing to find out on wave 30 of someone's run.
//
// It throws rather than warning: this file opens off `file://` with no console
// anyone is looking at, and a warning nobody reads is the same as no check.
(function () {
  var problems = validateWaveTimelines(WAVES);
  if (problems.length) {
    throw new Error("wave schedule is not deployable:\n  " +
      problems.join("\n  "));
  }
})();

// Bring the next wave in early by shortening the TRANSITION in front of it.
// Returns whether there was a transition to shorten.
//
// It touches the countdown and nothing else: updateWaves() is the only thing in
// the game that deploys an enemy, and a second spawn path would be a second
// place to get `allWavesDeployed` and the wave banner wrong.
//
// A CEILING ON THE REMAINING TIME, NEVER AN EXTENSION. With two seconds left,
// clicking Send must not push the wave back out to three -- that is the
// opposite of what the button says it does, and it is the owner's rule that a
// countdown already under three seconds is never lengthened. The `if` is that
// rule; an assignment would be the bug.
//
// `delaySeconds` is how close the caller is entitled to bring it: the button
// and auto-send take the default three, the Start button takes zero because a
// run that has not begun has nothing to interrupt. The five-second gates do not
// come through here at all any more -- they OPEN a transition rather than
// shortening one (see endWave) -- and with auto-send on, its three still wins
// over their five, because this only ever moves the wave closer.
function callNextWave(delaySeconds) {
  if (!betweenWaves()) return false;
  var delay = (delaySeconds === undefined) ? WAVE_CALL_DELAY : delaySeconds;
  if (waveCountdown > delay) waveCountdown = delay;
  // Skipping the transition ends the previous wave as far as the player is
  // concerned, so this is where its bounty would land: "at the start of the
  // countdown to the next wave if the wave was skipped". By the time a
  // transition exists the gate that opened it has already paid, so this is
  // ordinarily a no-op -- kept because the latch makes it free, and because a
  // countdown moved by hand (the sandbox, a fixture) has no gate behind it.
  payWaveBounty();
  return true;
}

// GATE 3, THE PLAYER'S. Is the Send button live right now?
//
// TWO DIFFERENT MOMENTS WEAR THE SAME BUTTON, deliberately rather than as an
// economy of rectangles: both of them mean "bring the next wave forward", and a
// player does not experience them as two questions.
//
//   during a transition   -> shorten the countdown (callNextWave)
//   wave fully deployed   -> END the wave now, survivors and all, and put the
//                            next one three seconds out (endWave)
//
// AND IT IS NEVER LIVE BEFORE THE WAVE HAS FINISHED ARRIVING. That is the
// owner's rule and it is the one here with teeth: a Send that worked
// mid-deployment would let a player delete the tail of a wave they did not like
// the look of, which is not skipping a break, it is editing the schedule.
//
// NO SEND ON WAVE 35. There is nothing to send. The button goes away rather
// than going grey, for the same reason the readout says FINAL WAVE rather than
// "0 s left": a control that promises a wave 36 is worse than no control.
//
// SEPARATE FROM waveSendAvailable() by exactly one term, the `screen === "play"`
// inside waveControlsShown(). This is the SIMULATION's question -- auto-send
// asks it from inside updateWaves -- and a scheduler that consulted which
// screen was up would be a scheduler with an opinion about the renderer. The
// button asks the other one, and the two cannot drift because one calls the
// other.
function waveSendReady() {
  if (waveIndex >= WAVES.length) return false;
  if (betweenWaves()) return true;
  if (waveIndex === WAVES.length - 1) return false;
  return waveFullyDeployed();
}

// The button's name for it, kept because the button, the auto-send toggle and a
// row of tests all speak in terms of skipping. Since v0.4.7 skipping means "in
// three seconds", not "now" -- see WAVE_CALL_DELAY.
//
// EXCEPT AT THE START OF A RUN, where it means now. The opening pause is the
// one transition whose only content is waiting: there is no board to look up
// from and nothing in flight to resolve, so the three seconds that stop a wave
// landing on a distracted player would just be three more seconds of the thing
// the player pressed the button to stop. A button that says Start starts.
function skipNextWave() {
  if (!waveSendReady()) return false;
  if (betweenWaves()) {
    return callNextWave(beforeFirstWave() ? 0 : WAVE_CALL_DELAY);
  }
  // The wave is out and the player is done with it. Survivors stay exactly
  // where they are -- see endWave, the one place a wave is ever closed.
  endWave(WAVE_CALL_DELAY);
  return true;
}

// CLOSE THE WAVE ON THE CURSOR and open the transition to the next one. The ONE
// exit a wave has: all three gates end here, which is what makes "the reward is
// paid exactly once" a property of a single function rather than of three call
// sites agreeing with each other.
//
//   gate 1  eliminated   -- every body emitted and none of them left alive
//   gate 2  ceiling      -- `duration` reached, survivors keep walking
//   gate 3  Send         -- the player, or auto-send, once it is fully deployed
//
// SURVIVORS ARE NOT TOUCHED. Gates 2 and 3 both close a wave that still has
// bodies on the road; those bodies keep their own wave's number, keep walking,
// and keep being the player's problem. They cannot hold the NEXT wave open
// either, because `waveStillOnTheRoad` asks about one wave's number and never
// about the road -- see gate 1 in update().
//
// `delaySeconds` is how long the transition is and the caller owns it: five for
// either automatic gate, three for Send. It is written straight onto the
// countdown rather than through callNextWave's ceiling, because at this instant
// there is no countdown to be shorter than -- the wave was on the clock until
// this line.
//
// `overshoot` is how far PAST its own trigger the closing frame ran, and only
// gate 2 has one -- a ceiling is crossed mid-step, while gates 1 and 3 fire on
// an event and are exactly on time by construction. Time that has already been
// spent is deducted from the transition instead of being spent twice, which is
// what keeps the campaign clock the same length whatever the step size.
//
// A step longer than the whole transition is not a special case here: the
// leftover simply lands on the next wave's own clock, which is the same
// arithmetic updateWaves does when a countdown expires mid-frame. Nothing in
// the schedule can do that at any sane speed; a fixture with a two-second dt
// can, and it now gets the right answer rather than a lost second.
function endWave(delaySeconds, overshoot) {
  // Pay FIRST. The bounty belongs to the wave that just ended, whichever gate
  // ended it, and the latch inside payWaveBounty is what makes a second gate
  // firing on the same step cost nothing.
  payWaveBounty();

  var spent = overshoot > 0 ? overshoot : 0;
  waveIndex++;
  waveSpawned = 0;

  if (waveIndex >= WAVES.length) {
    waveElapsed = 0;
    waveCountdown = 0;
    return;
  }

  var left = delaySeconds - spent;
  if (left > 0) {
    waveCountdown = left;
    waveElapsed = 0;
  } else {
    waveCountdown = 0;
    waveElapsed = -left;
  }
}

// Has the wave on the cursor already had its clear reward written down, and has
// its banner already been shown?
//
// `waveRewardLatched` is a one-shot. The alternative -- re-latching every frame
// while a fully deployed wave is still being fought -- is a live double-pay:
// gate 1 fires inside update() AFTER updateWaves() has run, so a re-latch on
// the following frame would owe the same reward a second time for a wave that
// had already been paid for.
//
// `waveOnClockIndex` is which wave the two of them belong to. Comparing it
// against `waveIndex` rather than clearing the flags from endWave() is what
// makes the outside drivers work: the sandbox starts a wave by writing
// `waveCountdown = 0`, and a fixture can move the cursor with a plain
// assignment. Both of those move `waveIndex` and neither knows this file has
// per-wave flags to reset.
var waveRewardLatched = false;
var waveOnClockIndex = -1;

// How far past its authored time a spawn may be counted as due. See the note in
// emitDueSpawns -- it is float dust, not slack.
var SPAWN_EPSILON = 1e-6;

function updateWaves(dt) {
  if (waveIndex >= WAVES.length) return;

  // AUTO-SEND, which is both halves of gate 3 in one line: during a transition
  // it shortens the countdown to three, and on a fully deployed wave it closes
  // the wave and starts those three seconds.
  //
  // Routed through skipNextWave() rather than by touching state here, so the
  // automatic path and the button are the same path. In particular it inherits
  // waveSendReady(), which is what makes "auto-send never compresses an
  // interval and never deletes a spawn" true by construction rather than by
  // care: there is no moment during a wave's deployment when this can do
  // anything at all.
  // WAS A TRANSITION ALREADY RUNNING WHEN THE FRAME OPENED? Auto-send, three
  // lines down, can OPEN one -- and a countdown opened by this very frame has
  // not had a frame to spend yet. Without this the automatic gate 3 was charged
  // dt the instant it fired, so a 3 s call became 2.9 s at dt = 0.1 while the
  // player's identical Send, arriving through the same function from a click,
  // got its full three. Gates 1 and 2 never had the bug because they are
  // evaluated BELOW the countdown block; this is what puts gate 3 on the same
  // footing without moving it, which it cannot be -- shortening a running
  // transition has to happen before the early return below.
  var transitionWasRunning = waveCountdown > 0;

  if (autoSkipWaves) skipNextWave();

  if (waveCountdown > 0) {
    // Opened by auto-send a moment ago: it starts spending on the next frame.
    if (!transitionWasRunning) return;
    waveCountdown -= dt;
    if (waveCountdown > 0) return;

    // THE TRANSITION ENDED INSIDE THIS FRAME, and the leftover belongs to the
    // wave that just started. Handing it over rather than discarding it is what
    // makes the scheduler independent of the step size: at 3x a step is 50 ms,
    // and a transition that expires 40 ms into one would otherwise start every
    // wave up to a frame late, every wave, forever.
    waveElapsed = -waveCountdown;
    waveCountdown = 0;
  } else {
    waveElapsed += dt;
  }

  // The cursor is on a wave nobody has announced yet. One banner per wave, and
  // it fires here rather than at the first spawn so that a wave whose opening
  // group is not at zero still announces itself when its clock starts -- wave
  // 11 authors its Midboss at `at: 4`, and four seconds of held breath is the
  // wave doing its job, not the banner being late.
  if (waveOnClockIndex !== waveIndex) {
    waveOnClockIndex = waveIndex;
    beginWave();
  }

  // A CURSOR AT ZERO MEANS NOTHING IS OWED, whatever moved it there. The index
  // test above cannot cover this on its own: the sandbox restarts a run onto
  // the SAME wave by hand (`waveSpawned = 0; waveCountdown = 0`), the index does
  // not move, and the reward latch would stay set from the previous pass -- so
  // the re-run wave would deploy perfectly and never owe its bounty. Found by
  // driving that idiom, not reasoned about.
  //
  // It is safe rather than merely convenient: `waveSpawned === 0` is "this wave
  // has put nothing on the road", so there is by definition nothing to have
  // been paid for yet. It cannot un-latch a wave mid-payout, because a wave
  // that has deployed anything at all fails the test.
  //
  // The `> 0` guard is for the degenerate wave that names no bodies at all,
  // which nothing in the schedule does and which a fixture can trivially write:
  // its cursor is at 0 AND at the end at the same time, so without the guard the
  // latch would be cleared and re-set on every step for as long as the wave ran.
  if (waveSpawned === 0 && waveEventCount() > 0) waveRewardLatched = false;

  emitDueSpawns();

  // emitDueSpawns retires the cursor when the LAST wave finishes arriving, so
  // there may be no wave left to put a ceiling on.
  if (waveIndex >= WAVES.length) return;

  // GATE 2 -- THE CEILING. Checked AFTER the emission, so a body due at 27.9 s
  // of a 28 s wave still walks out of the gate on the frame the wave ends.
  // validateWaveTimelines() guarantees the last spawn is strictly inside the
  // ceiling, so this can only ever close a wave that has finished arriving.
  //
  // `>=`, and the wave is closed on the SAME frame the limit is crossed rather
  // than on the next one. A ceiling that is checked a frame late is a ceiling
  // that lets one more body through at 3x speed and not at 1x.
  //
  // AND IT CARRIES SPAWN_EPSILON, for the same reason the emission does and with
  // the same microsecond. A bare `>=` made that paragraph false on every wave in
  // the schedule: 1/60 does not sum exactly, so 1920 steps of it reach
  // 31.999999999999464 and not 32, five ten-thousandths of a nanosecond SHORT of
  // wave 1's ceiling. The wave then closed on step 1921 -- one frame late, all
  // 34 waves, at the shipping step size, which is precisely the drift the
  // comment above promises does not happen. Measured across the schedule: the
  // shortfall runs from 5.4e-13 on wave 1 to 5.8e-12 on wave 33's 125 seconds,
  // growing with the ceiling because that is how many additions went into it.
  //
  // AND THE OVERSHOOT IS HANDED OVER, not dropped. The frame that crosses the
  // ceiling has almost always crossed it by some fraction of dt, and that
  // fraction has already been spent -- charging the transition for it again is
  // the step-size dependence this scheduler is supposed to be free of. It is the
  // same handover the transition itself does at `waveElapsed = -waveCountdown`,
  // in the other direction. Without it: 0.217 s discarded over thirteen ceilings
  // at 1/60 against 0.007 s at 1 ms, so the campaign clock drifted 0.21 s apart
  // between two step sizes that are supposed to be indistinguishable.
  var limit = WAVES[waveIndex].duration;
  if (limit !== undefined && limit !== null &&
      waveElapsed + SPAWN_EPSILON >= limit) {
    endWave(WAVE_CLEAR_DELAY, Math.max(0, waveElapsed - limit));
  }
}

// The wave has begun. Display and audio only -- nothing here is simulated.
function beginWave() {
  // Last chance for the PREVIOUS wave's bounty. Ordinarily a no-op, because
  // every gate pays on its way out and nothing is owed by the time a wave
  // starts. It is kept for the paths that move the cursor WITHOUT going through
  // a gate -- the sandbox, a fixture writing `waveCountdown = 0` -- and the
  // latch makes it free. BEFORE the banner, so the two land in the order the
  // player earned them.
  payWaveBounty();

  if (typeof Effects !== "undefined") {
    Effects.announce(
      "Wave " + (waveIndex + 1) + " / " + WAVES.length,
      waveSummary(WAVES[waveIndex]));
  }

  // The swell goes with the banner: same moment, same reason, and the sound is
  // timed to be over about when the banner is. One per wave, not one per route
  // -- this runs once however many entrances the map has.
  Sound.playWaveStart();
}

// Emit every event whose time has arrived, in order, exactly once.
//
// THE WHOLE OF THE DETERMINISM ARGUMENT IS THIS LOOP. `waveSpawned` is a cursor
// that only ever moves forward through a sorted array, and the test is
// `time <= waveElapsed` against a clock that only ever moves forward. So:
//
//   * nothing is emitted twice        -- the cursor passes each index once
//   * nothing is lost to a long frame -- the loop DRAINS rather than emitting
//     one per call, so a single 6 s step deploys everything a hundred 60 ms
//     steps would have, in the same order
//   * many small steps and one big step agree EXACTLY -- neither the cursor nor
//     the comparison can see how the time was chopped up
//
// That last one is the property worth guarding: it is what makes the schedule
// the same at 1x, 2x and 3x, and the same after a stall as without one.
//
// THE EPSILON IS NOT SUPERSTITION AND IT IS NOT A FUDGE. `waveElapsed` is a sum
// of one float addition per fixed step, so at 60 fps 3.2 s of stepping arrives
// as 3.1999999999999975 -- and wave 1's fifth body is authored at exactly 3.2.
// Without the tolerance that body waits a whole extra frame, and WHICH frame
// depends on how the time was chopped up, which is precisely the property this
// scheduler exists to guarantee. SPAWN_EPSILON is a microsecond: eighteen
// thousand times smaller than a 60 fps frame, and eleven orders of magnitude
// larger than the drift a 125 s wave can accumulate. It cannot make a spawn
// early enough to see and it cannot fail to swallow the dust.
//
// A ROAD THAT GOES EMPTY BETWEEN TWO GROUPS IS NOT A FINISHED WAVE, and this is
// where that is decided: the wave is only done arriving when the cursor reaches
// the end of the list. Wave 13's five salvos of Angries are 4.5 s apart and a
// fast board empties the road between every pair of them.
function emitDueSpawns() {
  var events = activeWaveEvents();
  while (waveSpawned < events.length &&
         events[waveSpawned].time <= waveElapsed + SPAWN_EPSILON) {
    emitWaveEvent(events[waveSpawned]);
    waveSpawned++;
  }

  if (waveRewardLatched || waveSpawned < events.length) return;

  // FULLY DEPLOYED. The clear reward is now OWED -- it is paid when the wave is
  // actually over, by whichever gate gets there first. See payWaveBounty.
  waveRewardLatched = true;
  pendingBounty = waveReward(WAVES[waveIndex], waveIndex + 1);
  pendingBountyWave = waveIndex + 1;

  if (waveIndex !== WAVES.length - 1) return;

  // Natural exhaustion -- the last body of the last wave is out. This
  // assignment is deliberately the ONLY place the flag is set: tests and the
  // sandbox switch spawning off with `waveIndex = WAVES.length`, and that must
  // never arm the victory check.
  //
  // The cursor is retired HERE rather than at a gate, because wave 35 has no
  // gate: no ceiling, no Send, and its elimination is the victory check rather
  // than a transition to anywhere. Retiring it is what puts the readout into
  // its schedule-spent state and takes the wave controls off the screen.
  allWavesDeployed = true;
  waveIndex++;
  waveSpawned = 0;
  waveElapsed = 0;
}

// Put one scheduled body on every route.
//
// ONE EVENT IS MIRRORED ONTO EVERY ENTRANCE, and the cursor then advances once.
// Two routes mean twice the enemies, not a schedule that runs twice as fast.
//
// The event's `tier` rides along with its health and type, and it is easy to
// lose: this call read four arguments for a while, so an authored T3 Fractal
// Slime reached the board at the default T1 -- 4 HP instead of 64 -- while
// waveEffectiveHealth and waveKillBounty, which read the tier straight off the
// group, went on describing the wave correctly. An event that carries no tier
// passes undefined, which is what every non-fractal row already meant (see
// Enemy.fractalTierOf).
//
// The SIXTH argument is the wave's own number, and this is the only place in
// the game a wave identity is ever minted: everything else on the road got one
// by being born from something that already had one. `waveIndex + 1` because
// the identity is the number the player is shown, not the array index -- a
// 0-based one would collide with the "no wave" default that keeps sandbox and
// codex bodies out of the wave-cleared test.
function emitWaveEvent(ev) {
  for (var routeIndex = 0; routeIndex < paths.length; routeIndex++) {
    spawnEnemy(
      ev.health,
      ev.type,
      paths[routeIndex],
      paths[routeIndex].id,
      ev.tier,
      waveIndex + 1
    );
  }
}

// Emit the next scheduled body, wherever the cursor happens to be, and answer
// whether there was one. The clock is neither consulted nor advanced.
//
// IT IS NO LONGER PART OF THE SCHEDULER -- updateWaves() reaches the event list
// directly. This is the FIXTURE entrance, and tests/run.js is its only caller:
// the sandbox spawns through its own path and never comes here. A fixture
// parks `waveIndex` and `waveSpawned` on an exact body ("wave 25's Fractal
// Slime") and ask for that one body on the board, with no clock, no transition
// and no banner. Keeping it is what lets those fixtures go on testing what a
// SCHEDULED body carries -- its tier, its wave identity -- which is exactly the
// link that shipped broken once already.
//
// The cursor it walks is the TIMELINE's, so a fixture that wants the Nth
// arrival counts ARRIVALS, not group members: under the sequential scheduler
// those were the same number and they are not any more. waveTimeline() is
// public so a fixture can find the index it actually wants.
function spawnScheduledEnemy() {
  var events = activeWaveEvents();
  if (waveSpawned >= events.length) return false;
  emitWaveEvent(events[waveSpawned]);
  waveSpawned++;
  return true;
}

// `typeId` picks a row of Enemy.TYPES (undefined = normal); `health`
// overrides the type's health when present, which nothing scheduled does.
// `tier` is a fractal's tier: undefined means the type's own defaultTier, and
// a non-fractal type discards it, so every caller may pass it unconditionally.
// `waveId` is the wave the body belongs to; omitting it means 0, "no wave put
// this here", which is what the sandbox's debug spawner wants -- a workbench
// body must never be able to hold a wave open or close one.
function spawnEnemy(health, typeId, routePath, routeId, tier, waveId) {
  routePath = routePath || path;
  enemies.push(new Enemy(routePath, health, typeId, {
    routeId: routeId || routePath.id || "main",
    tier: tier,
    waveId: waveId
  }));
}


// --- Rendering --------------------------------------------------------------

// Everything the 3D world renderer needs, and nothing it could mutate. Built
// per frame rather than held, so there is no second copy of the live arrays for
// anyone to accidentally write through.
// The enemy the cursor is actually pointing at, or null when the cursor is on
// interface rather than on the board. Mirrors drawEnemyHover's own guards --
// off-canvas, over the build bar, over the open inspection panel.
// Is the cursor pointing at the BOARD at all? The build bar, the open panel
// and the area off the canvas are all interface, and the ground underneath
// them is not something the player can be pointing at -- the same ordering rule
// onClick uses: whatever is drawn on top wins.
function pointingAtBoard() {
  if (screen !== "play" || !worldMouse) return false;
  if (mouse.x < -100) return false;
  if (overInterfaceChrome(mouse.x, mouse.y)) return false;
  if (inspected && pointInRect(mouse.x, mouse.y, inspectionLayout(inspected))) {
    return false;
  }
  return true;
}

function hoveredOnBoard() {
  if (!pointingAtBoard()) return null;
  return enemyAt(worldMouse.x, worldMouse.y);
}

// Enemies win ties, exactly as drawRecruitHover decides it in 2D: a recruit
// standing in the road is behind whatever is walking down it.
function hoveredRecruitOnBoard() {
  if (!pointingAtBoard()) return null;
  if (enemyAt(worldMouse.x, worldMouse.y)) return null;
  return recruitAt(worldMouse.x, worldMouse.y);
}

// WHAT THE WORLD IS LIT BY RIGHT NOW.
//
// Inside a run it is the live cycle; anywhere else -- the title screen, the map
// cards, a model viewer -- it is the authored idle morning, which is what stops
// a preview inheriting whatever time it happened to be when the player quit.
function environmentForRender() {
  if (typeof EnvironmentCycle === "undefined" ||
      typeof EnvironmentLighting === "undefined") return null;
  var cycle = (screen === "play") ? EnvironmentCycle.state()
                                  : EnvironmentCycle.idleState();
  return EnvironmentLighting.of(cycle);
}

// The fixed daytime a map CARD is drawn under. Never the live phase: a card is
// a picture of a place, and a player choosing a route at 3am should not be
// shown eight thumbnails of a dark forest.
function thumbnailEnvironment() {
  if (typeof EnvironmentCycle === "undefined" ||
      typeof EnvironmentLighting === "undefined") return null;
  return EnvironmentLighting.compose(EnvironmentCycle.stateAt(0.22), []);
}

function worldRenderState() {
  // The build ghost, on exactly the same terms drawBuildPreview() uses -- the
  // armed type, the cursor actually being over the map, and `blockReason` for
  // whether it may go there. Re-deciding any of that here would be a second
  // opinion about placement, and there is only ever one.
  var ghost = null;
  var type = selectedType();
  if (type && worldMouse && mouse.x >= -100 &&
      !overInterfaceChrome(mouse.x, mouse.y)) {
    ghost = {
      x: worldMouse.x, y: worldMouse.y,
      radius: ul(type.FOOTPRINT_RADIUS_UL),
      rangePx: previewRangePx(type, worldMouse.x, worldMouse.y),
      ok: blockReason === null
    };
  }
  // A tower paints its reach ONLY when asked about. This USED to be decided in
  // the 2D world block, which 3D skips -- so in 3D no tower ever set the flag
  // and no range ring ever drew. Deciding it here keeps the one rule in one
  // place and makes it true for both renderers.
  for (var i = 0; i < towers.length; i++) {
    towers[i].showRange = (towers[i] === inspected || towers[i] === aimingTower);
  }

  return {
    map: currentMap, paths: paths,
    towers: towers, enemies: enemies, bullets: bullets,
    // THE COMPOSED ENVIRONMENT, resolved once per frame, here. Both renderers
    // read this and neither reads EnvironmentCycle directly -- which is what
    // makes "2D and WebGL receive the same snapshot" a fact about the code
    // rather than a thing to keep checking.
    environment: environmentForRender(),
    buildGhost: ghost,
    inspected: inspected, aimingTower: aimingTower, worldMouse: worldMouse,
    // Recomputed per frame rather than passing the stored `hoveredEnemy`,
    // which is only refreshed on mousemove and goes stale the moment the thing
    // under the cursor dies or leaks -- leaving a hover ring sitting on empty
    // road. drawEnemyHover has always re-asked for exactly this reason.
    //
    // AND SUPPRESSED OVER THE INTERFACE, on the same terms drawEnemyHover uses.
    // A cursor resting on the inspection panel is not pointing at the board, but
    // the ground UNDER the panel is still a real place -- so without this the
    // hover ring appeared beside the panel while you read it, which is exactly
    // what it looked like: a stray range circle that would not go away.
    hoveredEnemy: hoveredOnBoard(),
    // The 2D branch draws the hover readouts itself (drawEnemyHover /
    // drawRecruitHover, both inside the block 3D skips), so in 3D they have to
    // be handed over here or pointing at a body says nothing at all.
    hoveredRecruit: hoveredRecruitOnBoard(),
    dt: worldRenderState.dt || 1 / 60,
    now: lastTime / 1000
  };
}

function draw() {
  // In 3D the board is rendered on the canvas BEHIND this one, so this one
  // must not paint over it. Everything else in this function is unchanged --
  // the menus, the chooser, the codex and the store all still fill their own
  // background, because none of them show the world.
  var showing3D = typeof World3D !== "undefined" && World3D.isEnabled() &&
    screen === "play";
  if (showing3D) {
    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  } else if (screen === "play" && typeof Maps !== "undefined" &&
      Maps.backgroundColor) {
    // THE FLAT BOARD GETS THE SAME SKY, from the same snapshot. It is a
    // top-down view, so most of this is covered by the board itself -- what
    // shows is the strip around the edges, which is exactly where a sky
    // belongs. Drawn before the world so the map paints over it.
    Maps.drawSky(ctx, currentMap, environmentForRender(),
      VIEW_WIDTH, VIEW_HEIGHT);
  } else {
    ctx.fillStyle = "#1c1e26";
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  }

  if (screen === "menu") {
    drawMenu();
    return;
  }

  if (screen === "select") {
    drawMapSelect();
    return;
  }

  if (screen === "index") {
    Codex.draw(ctx);
    return;
  }

  if (screen === "store") {
    Store.draw(ctx);
    return;
  }

  // The battlefield is one camera layer. The Warbringer's earthquake moves
  // this layer for a fraction of a second while the HUD remains anchored and
  // readable. Effects owns the offset; the game only supplies a save/restore
  // boundary, so presentation state can never leak into simulation.
  ctx.save();

  // THE 3D BRANCH. `World3D.drawWorld` replaces this entire layer -- terrain,
  // road, bodies and projectiles -- with a WebGL pass on the canvas behind
  // this one, and returns false when the 3D build is not installed, which is
  // every ordinary load of index.html. Everything below `ctx.restore()` is
  // untouched either way: the HUD, the panels and the menus never knew where
  // the camera was and still do not.
  //
  // The 2D block below is deliberately left at its original indentation inside
  // this `if`. Re-indenting eighty lines would have buried a two-line change in
  // a diff nobody could review, and this file is the one that most needs to
  // stay reviewable.
  var world3D = (typeof World3D !== "undefined" && World3D.isEnabled() &&
    World3D.drawWorld(ctx, worldRenderState()));

  if (!world3D) {

  // The camera. Applied INSIDE the existing world save/restore, so the HUD
  // below is untouched and the earthquake's own offset composes on top of it
  // (a shake at 3x zoom shakes 3x as far on screen, which is right -- it is a
  // camera kick, not a screen effect).
  ctx.translate(VIEW_WIDTH / 2, VIEW_HEIGHT / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  if (typeof Effects !== "undefined" && Effects.beginWorld) {
    Effects.beginWorld(ctx);
  }

  // Terrain is presentation-only: every placement, path and range still uses
  // the exact flat world coordinates underneath it. The VisualModels hooks come
  // first so a skin pack can replace a battlefield without editing this file;
  // the authored sci-fi environments are the built-in fallback.
  var mapView = { map: currentMap, paths: paths, width: VIEW_WIDTH,
    height: VIEW_HEIGHT };
  var terrainModelId = (currentMap ? currentMap.id : "default") + ":terrain";
  if (!VisualModels.draw("map", terrainModelId, ctx, mapView) &&
      !VisualModels.draw("map", "terrain", ctx, mapView)) {
    if (typeof Maps.drawEnvironment === "function") {
      Maps.drawEnvironment(ctx, currentMap);
    } else if (typeof Maps.drawDecorations === "function") {
      Maps.drawDecorations(ctx, currentMap);
    }
  }
  drawRoad();
  if (typeof Effects !== "undefined" && Effects.drawGround) {
    Effects.drawGround(ctx);
  }

  var i;
  // A tower paints its reach ONLY when the player has asked about it: the one
  // being inspected, or the one waiting for an aim click. Decided here, in one
  // place, rather than by each tower guessing -- so all four types agree, and
  // so the rule is visible from the render loop rather than buried in four
  // draw() methods (2026-07-29, at the owner's request; a full board used to
  // be a fog of overlapping circles with the road invisible under it).
  var actors = [];
  for (i = 0; i < towers.length; i++) {
    var t = towers[i];
    t.showRange = (t === inspected || t === aimingTower);
    actors.push({ y: t.y, order: 0, actor: t });
  }
  for (i = 0; i < enemies.length; i++) {
    actors.push({ y: enemies[i].pos.y, order: 1, actor: enemies[i] });
  }

  // Back-to-front depth is the rule that makes an oblique camera believable:
  // an actor lower on the screen paints over one standing behind it. Stable
  // tie-breaking keeps a tower and an enemy sharing a y-coordinate from
  // flickering between frames.
  actors.sort(function (a, b) {
    return (a.y - b.y) || (a.order - b.order);
  });
  for (i = 0; i < actors.length; i++) actors[i].actor.draw(ctx);

  for (i = 0; i < bullets.length; i++) bullets[i].draw(ctx);

  // THE HOUR OF THE DAY, ON THE WORLD AND NOTHING ELSE.
  //
  // Inside the camera transform and before the interface, which is the whole
  // reason it is HERE and not over the finished frame: the HUD, the panels and
  // the menus must never be tinted by the weather. A run at midnight is a dark
  // board with a legible interface on top of it, not a dark screen.
  if (typeof Maps !== "undefined" && Maps.drawEnvironmentTint) {
    Maps.drawEnvironmentTint(ctx, currentMap, environmentForRender());
  }

  // Bars are interface attached to world actors, so they run as their own pass
  // and stay readable over every body regardless of depth order.
  for (i = 0; i < towers.length; i++) drawTowerHealth(towers[i]);

  // The red wash and the blind spots, under the ghost that reads them.
  drawPlacementFeedback();
  drawBuildPreview();
  drawAimPreview();

  // World overlays: drawn in WORLD space, on top of the map but UNDER every
  // piece of interface. Debug shapes belong here -- drawn after the panel
  // they end up scribbled across it, which is exactly what a range circle
  // wider than the screen does.
  for (i = 0; i < worldOverlays.length; i++) worldOverlays[i](ctx);

  // Cosmetic feedback obeys the same rule as the overlays above: over the
  // world, under the interface. Particles and popups share the camera; the
  // screen-edge flash and banner do not.
  if (typeof Effects !== "undefined") {
    if (Effects.drawWorld) Effects.drawWorld(ctx);
    else Effects.draw(ctx);
  }

  drawEnemyHover();
  drawRecruitHover();

  }   // end of the 2D world layer -- see the 3D branch above

  // Interface that belongs to a world actor: range rings, health bars and the
  // build preview. In 2D these were drawn inside the block above and got their
  // screen position from the canvas transform for free; in 3D they are drawn
  // here in SCREEN space, positioned by asking the camera where a world point
  // landed. They are interface, so they must not shrink with distance or tilt
  // with the board.
  if (world3D) {
    drawPlacementFeedback();
    World3D.drawOverlays(ctx, worldRenderState());
  }

  ctx.restore();

  drawScaleBar();
  if (typeof Effects !== "undefined" && Effects.drawScreen) {
    Effects.drawScreen(ctx);
  }

  drawInfo();
  drawStatus();
  drawBossBar();

  // Interface last, so nothing on the map is drawn over it.
  drawInspection();
  drawBuildBar();
  drawSpeedButton();
  if (waveControlsShown()) drawAutoSkipButton();
  // The mixer, and its panel over the top of it. Above the rest of the chrome
  // and below the run overlays.
  //
  // DRAWN EXACTLY WHEN IT IS CLICKABLE. onClick's pause and loss/victory
  // branches return before the mixer gets a look (they are modals and own
  // every click), so drawing the button under one of those overlays would put
  // a live-looking control on screen that swallows nothing -- the same trap
  // waveSkipButtonRect and waveControlsShown exist to avoid.
  if (!paused && !gameOver && !victory) {
    drawAudioButton();
    drawAudioPanel();
  }
  // ONE SCREEN FOR BOTH ENDINGS since 2026-08-26. drawGameOver() and
  // drawVictory() were two overlays with the same bones and drifting copy;
  // "what do I do next" has the same answer either way, and so does "how did
  // that go". The outcome is a colour and a word inside one panel now.
  drawResultScreen();
  drawPauseMenu();

  // Full-screen effects sit above even the interface.
  if (typeof DeathDenial !== "undefined") DeathDenial.drawRewind(ctx);
}

// The stroke every road layer is painted along.
//
// ONE LINE FOR EVERYTHING. `routePath.points` is already the smoothed curve --
// loadMap builds it once, through Maps.walkablePoints -- so the road that is
// painted, the road that is walked, the line build clearance is measured from
// and the line the difficulty sampler samples are all the same set of points.
// Smoothing a second time here for the picture is what made the enemies walk
// beside their own road.
function tracePath(routePath) {
  // No smoothing here any more: `routePath.points` IS the curve, because the
  // walked path and the drawn path are built from the same spline in loadMap.
  // Two smoothings -- one for the picture and one for the walk -- is how they
  // came apart in the first place.
  var pts = routePath.points;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

// The fallback theme, for a build with no Maps module loaded (the bare-engine
// test harnesses). Named rather than inlined because two callers want it now.
var DEFAULT_ROAD_THEME = {
  roadOuter: "#333340", roadInner: "#5c596b",
  roadEdge: "120,120,140", roadCenter: "170,170,190"
};

// The road, for ANY set of routes and ANY map's theme.
//
// It was `drawRoad()` reading the two globals until 2026-08-01, when the route
// chooser started drawing real maps on its cards (see drawMapThumbnail). The
// parameters exist for exactly that: the cards want the identical five strokes
// the battlefield gets, and the only honest way to promise "the preview is the
// map" is for one function to paint both. A second copy tuned to look similar
// is the thing this signature is here to prevent.
//
// That promise covers the STROKES and, since the board went 3D, no longer
// covers WHICH WAY UP: the GL board draws its road as geometry under a camera
// whose screen-up is +y, while this paints on a canvas whose screen-up is -y.
// The compensation lives in drawMapThumbnail, deliberately, because the 2D
// fallback board still calls this function unflipped and must keep doing so.
//
// `routeList` is anything with a `points` array of world coordinates -- the
// live GamePath objects in `paths`, or a bare {points} from Maps.toWorld.
function drawRoadOn(routeList, map) {
  var outer = ul(ROAD_WIDTH_UL);
  var theme = (typeof Maps !== "undefined" && Maps.themeOf)
    ? Maps.themeOf(map)
    : DEFAULT_ROAD_THEME;

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (var i = 0; i < routeList.length; i++) {
    var route = routeList[i];

    // A ROAD THAT CHANGES WIDTH CANNOT BE STROKED, and that is the whole
    // reason there are two branches here rather than one.
    //
    // `lineWidth` is one number for a whole path, so the three body layers of
    // a profiled route are FILLED as outlines instead -- built from the same
    // `roadEdges` the 3D mesh is extruded from, so the card, the 2D board and
    // the GL board round their corners identically. The two centreline strokes
    // below are unchanged in both branches: a line down the middle of the road
    // does not care how wide the road is.
    //
    // A route with no width profile takes the original five strokes, on its own
    // untouched points array. Six of the seven boards therefore paint exactly
    // the pixels they painted before profiles existed, which is worth more than
    // having one code path.
    if (route.hasWidthProfile && route.hasWidthProfile()) {
      var ribbon = route.ribbon(outer, ul(RIBBON_STEP_UL));
      fillRibbon(ribbon, outer / 2, 13, "rgba(" + theme.roadEdge + ",0.18)");
      fillRibbon(ribbon, outer / 2, 0, theme.roadOuter);
      fillRibbon(ribbon, outer / 2, -8, theme.roadInner);
    } else {
      tracePath(route);
      ctx.lineWidth = outer + 13;
      ctx.strokeStyle = "rgba(" + theme.roadEdge + ",0.18)";
      ctx.stroke();

      tracePath(route);
      ctx.lineWidth = outer;
      ctx.strokeStyle = theme.roadOuter;
      ctx.stroke();

      tracePath(route);
      ctx.lineWidth = outer - 8;
      ctx.strokeStyle = theme.roadInner;
      ctx.stroke();
    }

    tracePath(route);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(" + theme.roadEdge + ",0.72)";
    ctx.stroke();

    ctx.save();
    ctx.setLineDash([14, 18]);
    tracePath(route);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(" + theme.roadCenter + ",0.82)";
    ctx.stroke();
    ctx.restore();
  }
}

// How finely a road that changes width is resampled, in u.l. In u.l. and not
// pixels because everything else about the road is: retune UNIT_LENGTH and the
// ribbon keeps the same number of steps per road width rather than getting
// coarser as the board grows.
var RIBBON_STEP_UL = 13;

// One layer of a profiled road: up the left edge and back down the right,
// filled. `inflate` widens both edges, which is how the outer glow is drawn as
// ONE fill -- stroking it per segment instead would compound its 0.18 alpha at
// every overlap and band the whole road.
function fillRibbon(ribbon, defaultHalf, inflate, style) {
  var edges = roadEdges(ribbon, defaultHalf, inflate);
  var i;

  ctx.beginPath();
  ctx.moveTo(edges[0].lx, edges[0].ly);
  for (i = 1; i < edges.length; i++) ctx.lineTo(edges[i].lx, edges[i].ly);
  for (i = edges.length - 1; i >= 0; i--) ctx.lineTo(edges[i].rx, edges[i].ry);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

function drawRoad() {
  drawRoadOn(paths, currentMap);
}

// A hurt tower's health bar, over its base. Drawn ONLY when it has taken a
// hit -- an undamaged board shows nothing, so a bar appearing is itself the
// alert that something is chewing on your towers.
//
// Pixel sizes, like every other cosmetic detail inside a draw: this is a
// readout attached to a sprite, not a distance in the world.
function drawTowerHealth(tower) {
  drawTowerStun(tower);
  if (!tower.maxHp || tower.currentHp >= tower.maxHp) return;

  var frac = TowerHealth.fraction(tower);
  var w = 34;
  var top = tower.y - tower.footprintPx - 12;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(tower.x - w / 2, top, w, 5);
  // Green through amber to red, so "nearly gone" reads without reading a
  // number. Same green as the enemy bar at full, deliberately -- one visual
  // language for "this thing has hit points".
  ctx.fillStyle = frac > 0.5 ? "#61d973" : (frac > 0.25 ? "#e8c34a" : "#e06a6a");
  ctx.fillRect(tower.x - w / 2, top, w * frac, 5);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.strokeRect(tower.x - w / 2 + 0.5, top + 0.5, w - 1, 4);
}

// A stunned tower has to LOOK stunned, or the player's whole board going quiet
// for two seconds reads as a bug rather than as the boss's doing. A dashed
// yellow ring around the footprint, spinning while the stun lasts.
//
// Read straight off `stunTimer`, so what is drawn cannot disagree with what is
// simulated — the same rule the health bar above follows.
function drawTowerStun(tower) {
  if (!(tower.stunTimer > 0)) return;

  var r = tower.footprintPx + 5;
  // The dash offset walks with the remaining time, which makes the ring rotate
  // and gives the stun a visible countdown without printing a number.
  ctx.save();
  ctx.translate(tower.x, tower.y);
  ctx.rotate(tower.stunTimer * 4);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(255,224,120,0.95)";
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // And the tower itself dimmed under a soft disc, so a silenced tower is
  // distinguishable from a firing one at a glance across a full board.
  ctx.beginPath();
  ctx.arc(tower.x, tower.y, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(20,22,30,0.35)";
  ctx.fill();
}

// WHERE THIS TOWER CANNOT SHOOT, painted red on the ground.
//
// The board has rocks that stop bullets, and until this existed there was no
// way to know that except by building a tower and watching it not fire. A
// player cannot plan around cover they cannot see, so the cover's SHADOW is
// drawn -- the wedge behind each blocker, out to the tower's own range.
//
// Shown while placing and while a tower is selected, which are exactly the two
// moments the question "can it reach that stretch of road" is being asked.
//
// The shadow is the angular span the blocker occupies as seen FROM THE TOWER,
// swept from the blocker's near face to the range edge. That is what an
// occluder actually removes: everything behind it, at every distance, inside
// the angles it covers. Sampling the shape's outline rather than assuming a
// circle is what makes it correct for the fallen trunk and the two rock
// outcrops as well as for the round boulders.
// THE OUTLINE OF A MAP SHAPE, as a ring of world [x, y] points.
//
// Wound in order and closed, because two very different things read it: the
// sight-shadow maths, which only wants the extreme angles and does not care,
// and the red no-build wash, which FILLS it and cares a great deal. The capsule
// used to be built by walking A and B in lockstep, which is fine for measuring
// angles and draws a self-intersecting star -- so it is a proper stadium now:
// the far half-circle around one end, the far half-circle around the other.
function shapeRing(shape) {
  var pts = [], i, a;
  if (!shape) return null;
  if (shape.shape === "circle") {
    for (i = 0; i < 24; i++) {
      a = i * Math.PI * 2 / 24;
      pts.push([shape.x + Math.cos(a) * shape.radius,
                shape.y + Math.sin(a) * shape.radius]);
    }
    return pts;
  }
  if (shape.shape === "polygon") return shape.points;
  if (shape.shape === "capsule") {
    var axis = Math.atan2(shape.b.y - shape.a.y, shape.b.x - shape.a.x);
    for (i = 0; i <= 12; i++) {
      a = axis + Math.PI / 2 + i * Math.PI / 12;
      pts.push([shape.a.x + Math.cos(a) * shape.radius,
                shape.a.y + Math.sin(a) * shape.radius]);
    }
    for (i = 0; i <= 12; i++) {
      a = axis - Math.PI / 2 + i * Math.PI / 12;
      pts.push([shape.b.x + Math.cos(a) * shape.radius,
                shape.b.y + Math.sin(a) * shape.radius]);
    }
    return pts;
  }
  return null;
}

// A circle as a ring, for the things that are circles without being map shapes:
// tower footprints and stump rims.
function circleRing(cx, cy, radius, steps) {
  var pts = [], n = steps || 24;
  for (var i = 0; i < n; i++) {
    var a = i * Math.PI * 2 / n;
    pts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  return pts;
}

// A WEDGE as a ring of world points -- the same shape gl-world's drawGroundCone
// paints, built here as POINTS so a caller that needs it as a clip rather than
// as a fill can put it through projectRing like every other ground shape.
//
// An `inner` of 0 closes the wedge on the apex, which is one point rather than
// an arc; anything else lays the returning edge along the deadzone, so a
// deadzone reads as the hole it is instead of being buried under the fill.
function coneRing(cx, cy, radius, inner, aim, arcRad, steps) {
  var n = Math.max(10, steps || Math.round(arcRad / (Math.PI * 2) * 64));
  var pts = [], i, a;
  for (i = 0; i <= n; i++) {
    a = aim - arcRad / 2 + arcRad * (i / n);
    pts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  if (!inner) {
    pts.push([cx, cy]);
    return pts;
  }
  for (i = n; i >= 0; i--) {
    a = aim - arcRad / 2 + arcRad * (i / n);
    pts.push([cx + Math.cos(a) * inner, cy + Math.sin(a) * inner]);
  }
  return pts;
}

// The road as a filled BAND, rather than a stroked line. A stroke of constant
// screen width is a lie on a tilted board -- the far end of the road would be
// painted as wide as the near end -- and the width is the entire information
// here, because the rule the band stands for is measured in world units.
//
// OFF `roadEdges` AND OFF THE RIBBON, which is the only correct answer once a
// road may change width along its length. This was its own mitre offsetter for
// one commit, written against a single ROAD_WIDTH_UL, and the merge with the
// route-profile branch made it a second copy of a function that already existed
// -- and a wrong one: it would have painted a chokepoint at open-road width
// while `buildClearanceOn` refused towers at the narrow one. The wash and the
// rule have to be the same derivation or the wash is decoration.
function roadBandRing(routePath) {
  var half = ul(ROAD_WIDTH_UL) / 2;
  var edges = roadEdges(routePath.ribbon(ul(ROAD_WIDTH_UL)), half, 0);
  var left = [], right = [], i;
  for (i = 0; i < edges.length; i++) {
    left.push([edges[i].lx, edges[i].ly]);
    right.push([edges[i].rx, edges[i].ry]);
  }
  right.reverse();
  return left.concat(right);
}

// EVERYTHING THAT WOULD REFUSE THIS TOWER'S FOOTPRINT, as world rings.
//
// The contract is one sentence, and it is the one the owner asked for: while
// you are placing, if the footprint ring touches red the tower cannot go there.
// So every shape here is the obstacle ITSELF at its true size -- not the
// obstacle inflated by the footprint. A rock painted twelve pixels fatter than
// the rock would be exact and unreadable; "my circle is touching that rock" is
// something a player can see.
//
// The four rules that are about SPACE are all here and nothing else is. Money
// and the map edge are not obstacles, they are not painted, and the ghost still
// turns red and says which one it was.
function noBuildRings(type) {
  var rings = [];
  if (!type) return rings;
  var i;

  // The road, at its own half-width WHEREVER YOU ARE ON IT. `buildClearanceOn`
  // is that half-width plus the footprint, so a footprint touching the band is
  // exactly a centre inside the clearance -- the painted rule and the enforced
  // rule are one derivation, at a gate as much as on open road.
  for (i = 0; i < paths.length; i++) {
    if (paths[i].points && paths[i].points.length > 1) {
      rings.push(roadBandRing(paths[i]));
    }
  }

  // Blockers, the depot and the settlement.
  var geo = Maps.geometryOf(currentMap);
  if (geo.any) {
    for (i = 0; i < geo.noBuild.length; i++) {
      var ring = shapeRing(geo.noBuild[i]);
      if (ring) rings.push(ring);
    }
  }

  // The ground other towers have already taken. A destroyed tower has released
  // its ground, so it is not painted -- the same sweep whyCannotBuild skips.
  for (i = 0; i < towers.length; i++) {
    if (towers[i].isDestroyed && towers[i].isDestroyed()) continue;
    var taken = circleRing(towers[i].x, towers[i].y,
      ul(towers[i].footprintRadiusUl), 16);
    // ON THE SURFACE IT STANDS ON, declared rather than sampled: a tower on a
    // stump has its footprint on the stump's top, and that circle runs right up
    // to the rim where a sampled height flickers between two levels.
    taken.z = towers[i].groundHeight || 0;
    rings.push(taken);
  }
  return rings;
}

// A world ring projected to screen, or null if any of it is behind the eye.
//
// DRAPED OVER THE BOARD, PER POINT, which is the rule for a ground decal — see
// clause 1b of the model contract, where `project()` samples the height under
// each point precisely so a ring lies on the surface instead of cutting through
// it. This projected flat at z = 0 until 2026-08-27, and that was invisible for
// as long as the cursor was flat too: once the cursor resolved onto a stump,
// the ghost stood on the top while every rule painted about it — the road band,
// the blockers, the ground other towers have taken, the rim you may not cross —
// sat **28.9 px** below the surface they describe.
//
// A ring may instead DECLARE its height in `ring.z`, and two of them do. A
// stump's rim and a tower's footprint lie on a plateau at a known height, and
// they lie exactly ON the edge of it: sampling a coarse height grid along that
// edge answers 25 on one point and 0 on the next, so the ring would come back
// jagged. An authored height is the exact answer where there is one.
function projectRing(ring, cam) {
  var out = [], i;
  var fixed = (typeof ring.z === "number") ? ring.z : null;
  var ground = (fixed === null && typeof World3D !== "undefined" &&
                World3D.groundHeightAt) ? World3D.groundHeightAt : null;
  for (i = 0; i < ring.length; i++) {
    var x = ring[i][0], y = ring[i][1];
    if (cam) {
      var p = cam.worldToScreen(x, y,
        fixed !== null ? fixed : (ground ? ground(x, y) : 0));
      if (!p) return null;
      x = p.x; y = p.y;
    }
    out.push([x, y]);
  }
  return out;
}

// THE RED WASH, drawn while a tower is armed and never otherwise.
//
// One path and one fill for every ring, with the default nonzero winding: the
// road crosses its own band at the hairpins and a tower footprint sits on the
// verge, and filling them separately would stack alpha and paint those overlaps
// a different, brighter red than the rest -- which reads as a rule that is not
// there. Outlines come after, in their own pass, so every shape keeps its edge.
function drawNoBuildOverlay(type) {
  var rings = noBuildRings(type);
  if (!rings.length) return;
  var cam = (typeof World3D !== "undefined" && World3D.isEnabled() &&
             World3D.camera) ? World3D.camera() : null;

  var screened = [], i, k;
  for (i = 0; i < rings.length; i++) {
    var r = projectRing(rings[i], cam);
    if (r && r.length > 2) screened.push(r);
  }
  if (!screened.length) return;

  ctx.save();
  ctx.beginPath();
  for (i = 0; i < screened.length; i++) {
    ctx.moveTo(screened[i][0][0], screened[i][0][1]);
    for (k = 1; k < screened[i].length; k++) {
      ctx.lineTo(screened[i][k][0], screened[i][k][1]);
    }
    ctx.closePath();
  }
  // Light enough that the board underneath is still readable -- this covers the
  // road, both structures and five blockers at once, and at the sight shadow's
  // 0.34 the whole clearing went pink.
  ctx.fillStyle = "rgba(226,58,48,0.20)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,120,104,0.72)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // THE STUMP RIMS, which are lines rather than areas: a tower is legal fully
  // on a stump and legal fully off it, and the only thing it may not do is
  // cross the edge. So the edge is what is painted, and "footprint touching the
  // red line" is precisely the refusal.
  var geo = Maps.geometryOf(currentMap);
  if (geo.any && geo.platforms.length) {
    ctx.beginPath();
    for (i = 0; i < geo.platforms.length; i++) {
      // AT THE TOP OF THE STUMP, which is the edge this line is about. The rim
      // is the one thing on the board that IS the height discontinuity, so its
      // own authored height is the only reading of it that does not flicker.
      var rimRing = circleRing(geo.platforms[i].x, geo.platforms[i].y,
        geo.platforms[i].radius, 28);
      rimRing.z = geo.platforms[i].height;
      var rim = projectRing(rimRing, cam);
      if (!rim) continue;
      ctx.moveTo(rim[0][0], rim[0][1]);
      for (k = 1; k < rim.length; k++) ctx.lineTo(rim[k][0], rim[k][1]);
      ctx.closePath();
    }
    ctx.strokeStyle = "rgba(255,120,104,0.80)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

// EVERYTHING THE PLAYER IS OWED ABOUT A PLACEMENT, in one call.
//
// Called from BOTH renderers, which is the point. The sight shadows lived in
// two flat-only branches and so were never drawn on the 3D board at all -- the
// feature was asked for, written, tested in Node and invisible in the game.
// They project through the camera themselves, so the only thing the two callers
// differ on is where in the frame they sit.
function drawPlacementFeedback() {
  var type = selectedType();
  if (type && worldMouse && mouse.x >= -100 &&
      !overInterfaceChrome(mouse.x, mouse.y)) {
    drawNoBuildOverlay(type);
    // AT THE HEIGHT IT WOULD STAND AT, both of them. Hover a stump and the
    // range ring grows and two of the red patches go out before you commit --
    // which is the only way a player finds out that elevation does anything.
    //
    // A CIRCLE, deliberately. A Warbringer's wedge and an Arcane Sniper's cone
    // are both things a BUILT tower has -- the ghost is drawn as a plain ring
    // for every type (worldRenderState) -- so the shadows are clipped to
    // precisely the ring the player is being shown and to nothing else.
    var eye = groundHeightUnder(worldMouse.x, worldMouse.y);
    drawSightShadows(worldMouse.x, worldMouse.y, {
      radius: previewRangePx(type, worldMouse.x, worldMouse.y),
      inner: 0, aim: 0, arcRad: TOWER_FULL_TURN, full: true
    }, eye);
    return;
  }
  // Not placing: the inspected tower's own blind spots, so a player can ask an
  // already-built tower what it cannot see.
  var t = inspected || aimingTower;
  if (t && !(t.isDestroyed && t.isDestroyed())) {
    var reach = towerReach(t);
    // WHILE AIMING, THE WEDGE FOLLOWS THE CURSOR. gl-world draws it that way so
    // there is something to aim BY, and the shadows have to be clipped to the
    // wedge that is on screen rather than to the one still committed on the
    // core -- otherwise the red sits where the player is aiming AWAY from.
    if (t === aimingTower && worldMouse && !reach.full) {
      reach.aim = Math.atan2(worldMouse.y - t.y, worldMouse.x - t.x);
    }
    drawSightShadows(t.x, t.y, reach, t.groundHeight || 0);
  }
}

// What a tower of this type would reach FROM HERE -- its base range, grown by
// the elevation of the ground under the cursor. The one derivation the ghost,
// the shadows and the built tower all use, so the ring the player is shown is
// the ring they get.
function previewRangePx(type, x, y) {
  return elevatedRangePx({ groundHeight: groundHeightUnder(x, y) },
    type.BASE_RANGE_UL);
}

// THE PATCH OF GROUND ONE OBSTACLE HIDES, as a ring of WORLD points.
//
// Built as world coordinates rather than stroked directly, because the board is
// usually a 3D one: a shape painted flat on the overlay canvas sits at the
// wrong place and the wrong shape the moment the camera is tilted or turned.
//
// THE SHADOW IS THE ROCK'S OWN SHAPE, THROWN OUTWARD. The first version took
// the angular span of the whole obstacle and filled it from the NEAREST point
// of the obstacle out to the range ring -- one flat arc across the whole wedge.
// That is a shadow the size of the widest part of the rock starting at the
// closest part of it, so a long thin outcrop cast a fat rectangle detached from
// its own front face, and the owner's report was exactly that: the hidden zone
// does not look like the size of the thing hiding it.
//
// So the near edge is MEASURED, ray by ray: for each angle across the
// silhouette, where does the line from the tower FIRST meet the shape. That is
// the same `segmentHit` a bullet uses, so the red patch begins precisely where
// a round would stop.
var SHADOW_RAYS = 14;

// The silhouette, in angles relative to the direction of the shape. Measured
// relative so a blocker straddling the -pi/pi seam does not come back as a span
// of nearly a full turn.
//
// A circle's silhouette is its TANGENTS, which is wider than any polygon drawn
// inside it -- taking the extremes of a 24-gon's vertices under-reports it, and
// under-reporting the silhouette is how a shadow ends up narrower than the rock
// casting it. So circles and capsules are done with asin and only the polygon,
// where vertices ARE the silhouette, is done from points.
function silhouetteSpan(shape, tx, ty) {
  var i, base, half, d;
  if (shape.shape === "circle") {
    d = Math.sqrt((shape.x - tx) * (shape.x - tx) + (shape.y - ty) * (shape.y - ty));
    if (d <= 1e-6) return null;
    base = Math.atan2(shape.y - ty, shape.x - tx);
    half = Math.asin(Math.min(1, shape.radius / Math.max(d, shape.radius)));
    return { base: base, lo: -half, hi: half, near: Math.max(0, d - shape.radius) };
  }
  if (shape.shape === "capsule") {
    // The union of the two end discs: the body lies inside their hull, so the
    // extremes of the two are the extremes of the whole stadium.
    var mx = (shape.a.x + shape.b.x) / 2, my = (shape.a.y + shape.b.y) / 2;
    base = Math.atan2(my - ty, mx - tx);
    var lo = Infinity, hi = -Infinity, near = Infinity;
    var ends = [shape.a, shape.b];
    for (i = 0; i < 2; i++) {
      d = Math.sqrt((ends[i].x - tx) * (ends[i].x - tx) +
                    (ends[i].y - ty) * (ends[i].y - ty));
      if (d <= 1e-6) return null;
      var rel = Math.atan2(ends[i].y - ty, ends[i].x - tx) - base;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      half = Math.asin(Math.min(1, shape.radius / Math.max(d, shape.radius)));
      if (rel - half < lo) lo = rel - half;
      if (rel + half > hi) hi = rel + half;
      if (d - shape.radius < near) near = d - shape.radius;
    }
    return { base: base, lo: lo, hi: hi, near: Math.max(0, near) };
  }
  var pts = shapeRing(shape);
  if (!pts || !pts.length) return null;
  var cx = 0, cy = 0;
  for (i = 0; i < pts.length; i++) { cx += pts[i][0]; cy += pts[i][1]; }
  cx /= pts.length; cy /= pts.length;
  base = Math.atan2(cy - ty, cx - tx);
  var plo = Infinity, phi = -Infinity, pnear = Infinity;
  for (i = 0; i < pts.length; i++) {
    var dx = pts[i][0] - tx, dy = pts[i][1] - ty;
    var pd = Math.sqrt(dx * dx + dy * dy);
    if (pd < pnear) pnear = pd;
    var pr = Math.atan2(dy, dx) - base;
    while (pr > Math.PI) pr -= Math.PI * 2;
    while (pr < -Math.PI) pr += Math.PI * 2;
    if (pr < plo) plo = pr;
    if (pr > phi) phi = pr;
  }
  return { base: base, lo: plo, hi: phi, near: pnear };
}

function sightShadowRing(shape, tx, ty, rangePx) {
  var sp = silhouetteSpan(shape, tx, ty);
  if (!sp || sp.near >= rangePx) return null;   // out of reach: hides nothing

  var span = sp.hi - sp.lo;
  var i, a, ring = [], nearPts = [];
  for (i = 0; i <= SHADOW_RAYS; i++) {
    a = sp.base + sp.lo + span * i / SHADOW_RAYS;
    var ex = tx + Math.cos(a) * rangePx, ey = ty + Math.sin(a) * rangePx;
    var t = MapGeometry.segmentHit(shape, tx, ty, ex, ey, 0);
    // The two edge rays are tangents and may miss by a float; they inherit the
    // nearest measured distance rather than being dropped, which would leave a
    // notch in the near profile.
    var dist = t >= 0 ? t * rangePx : -1;
    ring.push([ex, ey]);
    nearPts.push(dist);
  }
  var fallback = sp.near;
  for (i = 0; i < nearPts.length; i++) if (nearPts[i] >= 0) { fallback = nearPts[i]; break; }
  var last = fallback;
  for (i = 0; i < nearPts.length; i++) {
    if (nearPts[i] < 0) nearPts[i] = last; else last = nearPts[i];
  }

  for (i = SHADOW_RAYS; i >= 0; i--) {
    a = sp.base + sp.lo + span * i / SHADOW_RAYS;
    ring.push([tx + Math.cos(a) * nearPts[i], ty + Math.sin(a) * nearPts[i]]);
  }
  return ring;
}

// EVERY BLIND SPOT THIS EYE HAS, at this height, inside the reach it has.
//
// `eyeHeight` is how high the observer's ground is. A shape at or below it is
// looked over and casts nothing -- which is the visible half of the elevation
// rule: put a tower on the tall stump and watch two of the red patches go out.
//
// `reach` is towerReach()'s answer (js/tower.js) and it does two jobs. Its
// RADIUS is how far a shadow is thrown. Its WEDGE, on a tower that has one, is
// what this whole layer is clipped to: red means "inside my reach and I cannot
// see into it", so painting it right round the circle on an Arcane Sniper that
// covers a 24 degree arc claims blind spots in ground it was never going to
// shoot at, and does it in the one colour on the board that means "refused".
//
// ONE PATH, ONE FILL, which is drawNoBuildOverlay's rule and holds here for the
// same reason: two shadows that overlap are ONE hidden patch, and filling them
// separately stacks alpha and paints the overlap a brighter red than either of
// them -- a boundary the player can see, standing for a rule that is not there.
// Outlines come after, off the same path, so each patch keeps its own edge.
function drawSightShadows(tx, ty, reach, eyeHeight) {
  var geo = Maps.geometryOf(currentMap);
  if (!geo.any || !geo.sightBlockers.length) return;

  var radius = reach && reach.radius;
  // A reach with no edge has no inside to shade: a fused monster blub's is the
  // whole board, and Infinity as a ring radius projects to NaN.
  if (!radius || !isFinite(radius)) return;

  var cam = (typeof World3D !== "undefined" && World3D.isEnabled() &&
             World3D.camera) ? World3D.camera() : null;

  var screened = [], i, k;
  for (i = 0; i < geo.sightBlockers.length; i++) {
    var shape = geo.sightBlockers[i];
    if (MapGeometry.clears(shape, eyeHeight || 0)) continue;
    var ring = sightShadowRing(shape, tx, ty, radius);
    if (!ring) continue;
    var r = projectRing(ring, cam);
    if (r && r.length > 2) screened.push(r);
  }
  if (!screened.length) return;

  ctx.save();

  if (!reach.full) {
    var wedge = projectRing(coneRing(tx, ty, radius, reach.inner,
      reach.aim, reach.arcRad), cam);
    // A wedge that will not project is one running behind the eye. Drawing the
    // shadows unclipped there is exactly the claim this branch exists to stop,
    // so nothing is drawn at all rather than too much.
    if (!wedge || wedge.length < 3) { ctx.restore(); return; }
    ctx.beginPath();
    ctx.moveTo(wedge[0][0], wedge[0][1]);
    for (k = 1; k < wedge.length; k++) ctx.lineTo(wedge[k][0], wedge[k][1]);
    ctx.closePath();
    ctx.clip();
  }

  function addRing(ring) {
    ctx.moveTo(ring[0][0], ring[0][1]);
    for (var n = 1; n < ring.length; n++) ctx.lineTo(ring[n][0], ring[n][1]);
    ctx.closePath();
  }

  ctx.beginPath();
  for (i = 0; i < screened.length; i++) addRing(screened[i]);
  // STRONG ENOUGH TO READ ON A DARK BOARD. At 0.20 over forest floor this was
  // there and invisible, which is the same as not being there: the whole point
  // is that a player can see the cover before they spend $900 shooting into it.
  ctx.fillStyle = "rgba(232,64,52,0.34)";
  ctx.fill();

  // THE OUTLINE IS THE UNION'S OUTLINE, and the seams inside it are not edges.
  //
  // One fill stopped the overlaps reading brighter, and left the other half of
  // the same mistake standing: stroking the compound path draws every subpath,
  // so the boundary of a patch that runs THROUGH another patch was still a
  // visible line across the middle of one continuous hidden area. A player
  // reads a line as a rule, and there is no rule there.
  //
  // Canvas has no union of paths, so this takes it the other way round: before
  // stroking patch i, clip away every OTHER patch. `(a huge rectangle + patch
  // j)` under the even-odd rule is exactly "everywhere except patch j" -- the
  // rectangle counts once outside it and twice inside -- and successive clip()
  // calls intersect, so the stack ends up as "outside every other patch". What
  // survives of patch i's outline is precisely the part of it that is on the
  // union's edge.
  //
  // The rectangle is enormous rather than the canvas, because this runs inside
  // whichever transform the caller is in (the 2D board is drawn under the
  // quake's shake) and a viewport-sized rectangle would be the wrong rectangle
  // there. It is O(n^2) clips in the number of patches, which is at most twelve
  // on the only board that has any, and only while a tower is being asked about.
  var BIG = 1e5;
  ctx.strokeStyle = "rgba(255,118,102,0.55)";
  ctx.lineWidth = 1.5;
  for (i = 0; i < screened.length; i++) {
    ctx.save();
    for (k = 0; k < screened.length; k++) {
      if (k === i) continue;
      ctx.beginPath();
      ctx.rect(-BIG, -BIG, BIG * 2, BIG * 2);
      addRing(screened[k]);
      ctx.clip("evenodd");
    }
    ctx.beginPath();
    addRing(screened[i]);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawBuildPreview() {
  var type = selectedType();
  if (!type) return;                       // nothing armed, nothing to preview
  if (mouse.x < -100) return;              // cursor off the canvas
  // Cursor over the build bar or any other button: that click will never reach
  // the map, so promising a tower there would be a lie. See
  // overInterfaceChrome.
  if (overInterfaceChrome(mouse.x, mouse.y)) return;

  var rangeRingPx = previewRangePx(type, worldMouse.x, worldMouse.y);
  var footprintPx = ul(type.FOOTPRINT_RADIUS_UL);

  // UNDER THE CURSOR, because that is where it builds. This used to ask
  // resolveBuildPoint for a snapped position; nothing snaps any more.
  var ghostX = worldMouse.x, ghostY = worldMouse.y;

  var ok = blockReason === null;
  var c = ok ? "108,230,133" : "230,90,90";

  // Range
  ctx.beginPath();
  ctx.arc(ghostX, ghostY, rangeRingPx, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(" + c + ",0.09)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(" + c + ",0.55)";
  ctx.stroke();

  // Footprint -- the space this tower would physically occupy
  ctx.beginPath();
  ctx.arc(ghostX, ghostY, footprintPx, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(" + c + ",0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (!ok) {
    ctx.fillStyle = "rgba(" + c + ",0.95)";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(blockReason, ghostX, ghostY + footprintPx + 8);
    ctx.textAlign = "left";
  }
}

// While a cone tower is waiting for a direction, show where it would point
// if you clicked now -- the cone follows the cursor, so the commitment is
// visible before it is spent (re-aiming is on a 10s cooldown).
function drawAimPreview() {
  if (!aimingTower) return;
  if (mouse.x < -100) return;

  var t = aimingTower;
  var stats = t.core.stats;
  var angle = Math.atan2(worldMouse.y - t.y, worldMouse.x - t.x);
  var halfArc = (stats.coneArcDeg * Math.PI / 180) / 2;

  ctx.beginPath();
  ctx.moveTo(t.x, t.y);
  ctx.arc(t.x, t.y, t.rangePx, angle - halfArc, angle + halfArc);
  ctx.closePath();
  ctx.fillStyle = "rgba(196,140,255,0.16)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(216,170,255,0.9)";
  ctx.stroke();

  ctx.font = "13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(226,190,255,0.95)";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("click to aim  ·  Esc to cancel", worldMouse.x,
    worldMouse.y + 16);
  ctx.textAlign = "left";
}

// A visual ruler so the u.l. scale is legible on screen.
function drawScaleBar() {
  var bar = ul(10);
  var ox = 28;
  var oy = 672;

  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.lineCap = "butt";

  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox + bar, oy);
  ctx.moveTo(ox, oy - 7);
  ctx.lineTo(ox, oy + 7);
  ctx.moveTo(ox + bar, oy - 7);
  ctx.lineTo(ox + bar, oy + 7);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "15px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("10 u.l.", ox + bar + 10, oy);
}

function drawStatus() {
  ctx.textAlign = "right";

  ctx.fillStyle = "#ffd76e";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("$" + formatCash(cash), VIEW_WIDTH - 24, 16);

  ctx.fillStyle = "rgba(255,215,110,0.55)";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("Enemy bounties paid on kill", VIEW_WIDTH - 24, 52);

  // Base HP is a FREE COUNTER, not current-out-of-max: lifesteal (the beam
  // tower's B path) pushes it far above its starting value, and the B5 unlock
  // needs 10 000 of it. So the reading shows "/ start" only while it is at or
  // below where it began, and drops the denominator once it is above -- a
  // "12500 / 100" would just read as broken.
  ctx.textAlign = "left";
  ctx.fillStyle = baseHp > BASE_MAX_HP * 0.25 ? "#8ce69d" : "#e0736e";
  ctx.font = "600 24px system-ui, sans-serif";

  // THE VISUAL HALF OF THE LOW-HEALTH ALERT. The readout has been red below a
  // quarter since long before there was sound; what is new is that it now
  // PULSES, on the same latch that fires the klaxon (see updateLowHealthAlert).
  // A muted player gets the whole warning, not a quieter version of it.
  //
  // Drawn as a lozenge behind the text rather than by flashing the text
  // itself: text blinking in and out of legibility is a worse readout at
  // exactly the moment it matters most.
  if (lowHealthActive) {
    var beat = 0.5 + 0.5 * Math.sin(lowHealthPulse * Math.PI * 2 / 0.9);
    ctx.fillStyle = "rgba(224,115,110," + (0.12 + beat * 0.26).toFixed(3) + ")";
    ctx.fillRect(14, 26, 208, 30);
    ctx.fillStyle = "#e0736e";
  }

  ctx.fillText(baseHp > BASE_MAX_HP
    ? "Base " + Math.round(baseHp) + " HP"
    : "Base " + Math.round(baseHp) + " / " + BASE_MAX_HP + " HP", 22, 48);

  ctx.fillStyle = "#8cb3e6";
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.fillText(waveStatusText(), 22, 80);

  ctx.textAlign = "left";

  // The skip goes here, under the wave countdown it belongs to. The AUTO
  // toggle is drawn with the speed button instead -- see autoSkipButtonRect.
  if (waveControlsShown()) drawWaveSkipButton();
}

// The boss banner: a named bar across the top of the screen for as long as
// something big is alive (2026-07-29, at the owner's request, for the midboss).
//
// Driven by a `showHealthBanner` FLAG on the enemy type, not by a check for
// the midboss. The wave-35 boss will get this by adding one line to its row in
// Enemy.TYPES, and nothing in the drawing will need to learn about it.
//
// STACKED rather than overlapping. "One boss at a time" is a property of the
// current schedule, not a rule the renderer is entitled to assume, and two
// banners drawn on top of each other would be a bug nobody found until the day
// the schedule changed.
//
// It shows the same two bars an enemy already wears over its own head --
// shield above health, emptying in that order -- at fifteen times the width.
// The reading a player learned from a sprite is the reading they get here.
var BOSS_BAR_WIDTH = 560;
var BOSS_BAR_HEIGHT = 16;

function bossBarEnemies() {
  var out = [];
  for (var i = 0; i < enemies.length; i++) {
    if (enemies[i].type.showHealthBanner) out.push(enemies[i]);
  }
  return out;
}

function drawBossBar() {
  var bosses = bossBarEnemies();
  if (!bosses.length) return;

  var x = Math.round((VIEW_WIDTH - BOSS_BAR_WIDTH) / 2);

  for (var i = 0; i < bosses.length; i++) {
    var e = bosses[i];
    // 44, not 16. The top strip is already spoken for across its whole width:
    // drawInfo runs a line of instructions from x=22 at y=18, and the cash
    // readout sits at the right at y=16. Below both, and horizontally between
    // the base-HP readout on the left and the cash on the right, is the one
    // band of the top of the screen that is genuinely empty.
    var top = 44 + i * 54;
    var barY = top + 18;

    // Name on the left, numbers on the right. Clamped at zero for the same
    // reason enemyHoverLabel is: takeDamage subtracts the whole hit, so a
    // boss sits on negative health for the rest of the frame that killed it.
    ctx.font = "700 15px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffd0e2";
    ctx.fillText(e.type.displayName.toUpperCase(), x, top);

    ctx.textAlign = "right";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,208,226,0.75)";
    ctx.fillText(Math.max(0, Math.round(e.health)) + " / " +
      Math.round(e.maxHealth) + " HP" +
      (e.shieldMax > 0 ? "   ·   " + Math.max(0, Math.round(e.shield)) +
        " shield" : ""), x + BOSS_BAR_WIDTH, top);

    ctx.fillStyle = "rgba(12,14,20,0.85)";
    ctx.fillRect(x, barY, BOSS_BAR_WIDTH, BOSS_BAR_HEIGHT);

    var frac = Math.max(0, Math.min(1, e.health / e.maxHealth));
    ctx.fillStyle = "#e0518f";
    ctx.fillRect(x, barY, BOSS_BAR_WIDTH * frac, BOSS_BAR_HEIGHT);

    if (e.shieldMax > 0) {
      var sFrac = Math.max(0, Math.min(1, e.shield / e.shieldMax));
      ctx.fillStyle = "rgba(12,14,20,0.85)";
      ctx.fillRect(x, barY - 7, BOSS_BAR_WIDTH, 5);
      ctx.fillStyle = "#8fdcf0";
      ctx.fillRect(x, barY - 7, BOSS_BAR_WIDTH * sFrac, 5);
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,208,226,0.55)";
    ctx.strokeRect(x + 0.5, barY + 0.5, BOSS_BAR_WIDTH - 1, BOSS_BAR_HEIGHT - 1);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// Seconds as a countdown shows them: ceiling, so "1 s" covers the whole last
// second and the number only reaches 0 when the time is actually up.
//
// THE EPSILON IS NOT SUPERSTITION. The wave clock is a sum of ~60 float
// additions a second, so at four seconds into a 32 s wave `32 - waveElapsed`
// is 30.000000000000004 and a bare ceiling reads 31 -- the corner sticks a
// second behind for one frame in three, at a moment nothing has happened.
// 1e-6 s is a sixty-thousandth of a frame: far below anything the clock can
// legitimately resolve, and far above the dust it has to swallow.
function countdownSeconds(seconds) {
  return Math.max(0, Math.ceil(seconds - 1e-6));
}

// The one line of text in the corner that says where the run is. Four states,
// and the reason it is a function rather than four `ctx.fillText` calls is that
// a stub canvas records nothing -- a string built inside draw() is a string no
// test can read. Display only: nothing here is simulated and nothing here is
// allowed to be, because a readout that a test cannot see is a readout that
// silently drifts from what it describes.
function waveStatusText() {
  // 1. THE SCHEDULE HAS RUN OUT. Every wave is deployed, so there is no next
  // wave, no countdown and no ceiling -- the only number left is how many are
  // still walking. It says "Final wave" and not "All waves deployed" because
  // the player is not reading a deployment report, they are being told this is
  // the last of it and there will be no more.
  if (waveIndex >= WAVES.length) {
    return enemies.length > 0
      ? "Final wave  ·  " + enemies.length + " still walking"
      : "Final wave  ·  road clear";
  }

  var number = waveIndex + 1;
  var isFinal = number === WAVES.length;

  // 2. A TRANSITION. One line for all three kinds -- the 10 s opening pause,
  // the 5 s after a wave is wiped out, and the 3 s a Send or an auto-send buys
  // -- because to the player they are the same moment and only the number
  // differs. Reading `waveCountdown` rather than a per-kind constant is what
  // makes that true: whichever gate opened the transition already wrote its own
  // delay there, so this cannot disagree with the scheduler about how long is
  // left.
  //
  // Whole seconds. A tenth of a second mattered when the whole gap was five of
  // them; on a wave window that runs to 125 s it is a digit flickering in the
  // corner of the eye the entire time.
  //
  // The `waveIndex > 0` this used to carry is gone with the one in
  // betweenWaves and for the same reason: since RUN_START_DELAY the opening ten
  // seconds are a countdown like any other, and "Wave 1 in 10 s" is the line
  // that tells a player the run has started and nothing is coming yet.
  // `!waveInPlay()` rather than `waveSpawned === 0` spelled out again: the
  // schedule-spent case returned above, so the two are the same test here, and
  // the timeline scheduler moves the definition of "in play" exactly once.
  if (!waveInPlay()) {
    return (isFinal ? "Final wave" : "Wave " + number) + " in " +
      countdownSeconds(waveCountdown) + " s";
  }

  // 3 and 4. A WAVE IS ON THE ROAD. Its number, then how much of it is out,
  // then how long it has left.
  var line = "Wave " + number + " / " + WAVES.length +
    "  ·  " + waveSpawned + " / " + waveCount(WAVES[waveIndex]) + " deployed";

  var left = waveTimeRemaining();

  // NO TIMER ON THE FINAL WAVE, and this is why waveTimeRemaining answers null
  // instead of a number: wave 35 authors no `duration`, there is no wave 36 to
  // count towards, and a "0 s left" or a made-up ceiling would promise one.
  // The state replaces the timer rather than blanking it, so the corner still
  // says something -- an empty slot reads as a bug, "FINAL WAVE" reads as the
  // answer.
  if (left === null) return line + "  ·  FINAL WAVE";

  return line + "  ·  " + countdownSeconds(left) + " s left";
}

// The auto-send toggle. Drawn for the whole run, on or off, because it is the
// only way to turn itself back off -- see autoSkipButtonRect.
//
// It states which way it is set rather than what clicking would do ("AUTO on",
// not "turn auto on"). A toggle labelled with its action is ambiguous about
// its state, and state is the thing a player glancing at the corner needs: the
// question being answered is "why did that wave arrive already".
function drawAutoSkipButton() {
  var r = autoSkipButtonRect();
  var on = autoSkipWaves;
  var hot = pointInRect(mouse.x, mouse.y, r);

  ctx.fillStyle = on ? "rgba(140,230,157,0.20)" : "rgba(28,30,38,0.85)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = on
    ? "rgba(140,230,157,0.95)"
    : (hot ? "rgba(199,209,224,0.55)" : "rgba(199,209,224,0.30)");
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

  var cy = r.y + r.h / 2;

  // A lamp, so the setting is readable without reading. Same idea as the
  // chevron count on the speed button beside it: the shape is what you see,
  // the word is what confirms it.
  ctx.beginPath();
  ctx.arc(r.x + 15, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = on ? "#8ce69d" : "rgba(199,209,224,0.30)";
  ctx.fill();

  ctx.fillStyle = on ? "#8ce69d" : "rgba(199,209,224,0.75)";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("AUTO WAVE", r.x + 27, cy - 5);

  ctx.font = "10px system-ui, sans-serif";
  ctx.fillStyle = on ? "rgba(140,230,157,0.75)" : "rgba(199,209,224,0.45)";
  ctx.fillText(on ? "on" : "off", r.x + 27, cy + 8);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// How a player brings the next wave forward, and since 2026-08-25 how they end
// the wave they are already fighting. Drawn only while it is live, and only
// where it is clickable -- the same waveSendAvailable() test onClick and
// overInterfaceChrome use. It read betweenWaves() until then, which was one
// term short of what the other two asked.
//
// IT IS ALSO THE START BUTTON (2026-07-31, the owner's "either wait 10 seconds,
// or the user can press a start button manually"). Deliberately the same button
// rather than a second one on the same screen: it sits in the same place, does
// the same thing -- bring the next wave in early -- and the only honest
// difference is that before wave 1 there is no wave to be "next", so it says
// Start. A separate Start button would have been a second rectangle to place,
// hit-test, draw and hide, all to say what this one already says.
// What that button says. Split out of the drawing so a test can read it: the
// stub canvas records nothing, so a label left inside draw() is a label nothing
// can check, and this one carries a rule rather than a constant.
function waveSkipButtonLabel() {
  return beforeFirstWave() ? "Start wave 1" : "Send next wave";
}

function drawWaveSkipButton() {
  // The same test the click handler and overInterfaceChrome use, so the button
  // is drawn exactly where it is clickable. This used to read `betweenWaves()`
  // alone -- one term short of what the other two asked -- and got away with it
  // only because drawWaveSkipButton is reached from the play screen's draw.
  if (!waveSendAvailable()) return;

  var r = waveSkipButtonRect();
  var hot = pointInRect(mouse.x, mouse.y, r);

  ctx.fillStyle = hot ? "rgba(140,179,230,0.22)" : "rgba(28,30,38,0.85)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = hot ? "rgba(140,179,230,0.95)" : "rgba(140,179,230,0.45)";
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

  ctx.fillStyle = hot ? "#dbe7ff" : "#8cb3e6";
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  var cy = r.y + r.h / 2;
  ctx.fillText(waveSkipButtonLabel(), r.x + 14, cy + 1);

  // Two chevrons, drawn rather than typed -- the same shape the speed button
  // uses for the same idea, and no glyph to be missing from a system font.
  var x = r.x + r.w - 30;
  for (var i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x, cy - 5);
    ctx.lineTo(x + 5, cy);
    ctx.lineTo(x, cy + 5);
    ctx.closePath();
    ctx.fill();
    x += 7;
  }

  ctx.textBaseline = "top";
}

function drawInfo() {
  // path.length / UNIT_LENGTH is a display-only READ of the constant (going
  // world -> u.l., the opposite direction from ul()), not a multiplication by
  // UNIT_LENGTH -- it does not violate "ul() is the only place that happens".
  // The trailing stat readout named the GUNNER, which was deleted on
  // 2026-07-30. Replaced with the reference range rather than another tower's
  // numbers: this line exists to tell the player what a u.l. is worth on the
  // board in front of them, and any particular tower's damage was never the
  // point of it.
  var text =
    "Pick a tower below, then click to place it.  Click a tower to inspect or sell it.    " +
    "Path = " + (path.length / UNIT_LENGTH).toFixed(1) + " u.l.  (" +
      UNIT_LENGTH.toFixed(1) + " px/u.l.)    " +
    "Reference range = " + Maps.REFERENCE_TOWER().BASE_RANGE_UL + " u.l.";

  ctx.fillStyle = "#c7d1e0";
  ctx.font = "15px system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(text, 22, 18);
}

// Three buttons on the run-over screen since 2026-07-29: restart this route,
// choose another route, or leave for the title menu. The first two are placed
// either side of centre so they cannot overlap however long the map name is --
// the label is clipped, the box is not.
function restartButtonRect() {
  return { x: VIEW_WIDTH / 2 - 226, y: VIEW_HEIGHT / 2 + 48, w: 216, h: 48 };
}

// The wave the player actually experienced last. During a TRANSITION
// `waveIndex` already points at the wave that has not started, so a loss to
// stragglers between two waves is credited to the wave that caused it rather
// than to the one that never came.
//
// `waveInPlay()` rather than `waveSpawned > 0` since the timeline rewrite: wave
// 11 is in play for four seconds before its Midboss is due, and a player who
// loses in those four seconds lost on wave 11.
function reachedWave() {
  if (waveInPlay()) return waveIndex + 1;
  return Math.max(1, waveIndex);
}

// HOW MANY WAVES ARE ACTUALLY FINISHED, which is what the reward ladder counts
// and is NOT `reachedWave()`. The two differ by one exactly when a wave is in
// play, and that is the whole off-by-one the ladder could have been built on.
//
// `waveIndex` is the 0-BASED cursor and it is the answer in both states, which
// is why this is one line rather than a branch: mid-wave the cursor still
// points at the unfinished wave, so waves 1..waveIndex are done; between waves
// the cursor has already stepped past the one that ended, so waves
// 1..waveIndex are done. Clamped at the schedule length so a victory reports
// 35 rather than a cursor that has run off the end.
//
//   in play on wave 11   waveIndex 10   reached 11   completed 10
//   between 5 and 6      waveIndex  5   reached  5   completed  5
//   victory              waveIndex 35   reached 35   completed 35
function wavesCompleted() {
  return Math.max(0, Math.min(WAVES.length, waveIndex));
}

function drawGameOver() {
  if (!gameOver) return;

  drawRunOverlay({
    title: "BASE DESTROYED",
    // The two endings keep two colours, and both are now in the theme's own
    // palette: a loss burns, a win holds the ley. Red and green were the old
    // screen's and were the last two off-palette inks on any menu.
    titleColor: "#f0784c",
    subtitle: "Fell on wave " +
      reachedWave() + " of " + WAVES.length +
      "  ·  " + runKills + " enemies destroyed"
  });
}

// The other ending. Same overlay bones as the loss -- same buttons, same
// keys -- because "what do I do next" has the same answer either way.
function drawVictory() {
  if (!victory) return;

  drawRunOverlay({
    title: "THE BASE STANDS",
    titleColor: "#74f0d6",
    subtitle: "All " +
      WAVES.length + " waves held  ·  " + runKills +
      " enemies destroyed  ·  " + Math.round(baseHp) + " base HP left"
  });
}

function drawRunOverlay(spec) {
  // A SCRIM OVER THE BOARD, NOT THE INTERIOR BACKDROP. The battlefield is
  // still under this and is still worth seeing -- where the leak came through
  // is the first thing a player looks for -- so the theme arrives as ash and
  // ember over the run rather than as a wall in front of it.
  ctx.fillStyle = "rgba(7,6,9,0.84)";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  drawAshFall(menuClock());
  drawAshFrame();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "50px " + MENU_DISPLAY_FONT;
  ctx.fillStyle = spec.titleColor;
  drawMenuText(spec.title, VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 42, 5);

  ctx.font = "12px " + MENU_TECH_FONT;
  ctx.fillStyle = "rgba(" + ASH_BONE + ",0.78)";
  drawMenuText(spec.subtitle.toUpperCase(), VIEW_WIDTH / 2,
    VIEW_HEIGHT / 2 - 4, 1.4);

  // What the run was worth, and what that buys. The payout is shown on BOTH
  // endings for the same reason the buttons are the same on both: "what do I
  // do next" has one answer either way, and here the answer is usually
  // "spend this in the armoury".
  ctx.fillStyle = "#ffd76e";
  ctx.font = "600 17px system-ui, sans-serif";
  ctx.fillText("+" + (lastRunAward ? lastRunAward.total : 0) + " ⬡   ·   " +
    MetaProgress.coins() + " meta coins banked",
    VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 24);

  drawOverlayButton(restartButtonRect(),
    "Restart " + (currentMap ? currentMap.name : ""));
  drawOverlayButton(changeMapButtonRect(), "Choose another route");
  drawOverlayButton(mainMenuButtonRect(), "Main menu");

  ctx.font = "10px " + MENU_TECH_FONT;
  ctx.fillStyle = "rgba(" + ASH_DUST + ",0.6)";
  drawMenuText("R / ENTER RESTART   \u00b7   M ANOTHER ROUTE   \u00b7   ESC MENU",
    VIEW_WIDTH / 2, mainMenuButtonRect().y + 64, 1.3);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// The speed toggle: one chevron per multiple, then the multiple in words.
// Drawn procedurally like everything else in this game -- the chevron count is
// the readable-at-a-glance part, and the "2x" is what removes the doubt.
//
// It brightens as it goes: at 1x it is deliberately quiet interface furniture,
// at 3x it is the loudest thing on the bar, because "why is everything moving
// so fast" should be answerable without hunting.
function drawSpeedButton() {
  var r = speedButtonRect();
  var fast = gameSpeed > 1;
  var hot = pointInRect(mouse.x, mouse.y, r);

  ctx.fillStyle = fast ? "rgba(255,215,110,0.16)" : "rgba(28,30,38,0.85)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = fast
    ? "rgba(255,215,110,0.85)"
    : (hot ? "rgba(199,209,224,0.55)" : "rgba(199,209,224,0.30)");
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

  var colour = fast ? "#ffd76e" : "rgba(199,209,224,0.80)";
  var cy = r.y + r.h / 2;

  // One chevron per multiple, packed from the left -- CAPPED, because the
  // sandbox's ladder goes to 10x (see GAME_SPEEDS) and ten chevrons do not fit
  // in a 78 px button beside the number they are decorating. Three is where the
  // shipping ladder ends, so the cap is invisible in the game and the workbench
  // reads "≫ 10×" rather than a solid bar of arrowheads. The NUMBER is the
  // precise statement; the chevrons only ever meant "faster than 1x".
  var chevronW = 7;
  var chevronH = 12;
  var chevrons = Math.min(gameSpeed, 3);
  var x = r.x + 11;
  ctx.fillStyle = colour;
  for (var i = 0; i < chevrons; i++) {
    ctx.beginPath();
    ctx.moveTo(x, cy - chevronH / 2);
    ctx.lineTo(x + chevronW, cy);
    ctx.lineTo(x, cy + chevronH / 2);
    ctx.closePath();
    ctx.fill();
    x += chevronW + 2;
  }

  ctx.fillStyle = colour;
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(gameSpeed + "×", r.x + r.w - 11, cy + 1);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// The five build slots. A slot knows nothing about gunners specifically -- it
// asks the constructor for its name, cost and icon, so new tower types show up
// here for free.
function drawBuildBar() {
  ctx.textBaseline = "top";

  for (var i = 0; i < BUILD_SLOTS.length; i++) {
    var type = BUILD_SLOTS[i];
    var r = slotRect(i);
    var armed = (i === selectedSlot);
    var affordable = type !== null && cash >= type.COST;

    // Panel
    ctx.fillStyle = armed ? "rgba(108,230,133,0.14)" : "rgba(28,30,38,0.85)";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.lineWidth = armed ? 3 : 1;
    if (armed) {
      ctx.strokeStyle = "rgba(108,230,133,0.95)";
    } else if (type === null) {
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
    } else {
      ctx.strokeStyle = "rgba(140,179,230,0.45)";
    }
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    // Hotkey, top-left
    ctx.textAlign = "left";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.30)";
    ctx.fillText(String(i + 1), r.x + 6, r.y + 3);

    if (type === null) continue;

    // Unaffordable towers stay visible but read as inert.
    ctx.globalAlpha = affordable ? 1 : 0.4;
    // THE REAL BODY, not a hand-drawn glyph. TowerPreview3D renders the tower's
    // actual mesh once into an offscreen bitmap and blits it here, so the slot
    // shows what the player will place. It returns FALSE when it cannot -- no
    // WebGL, no mesh for that tier -- and then the tower's own drawIcon runs
    // exactly as before, so a slot is never left blank.
    //
    // 46 PX, WAS 22. `size` is the BOX for both calls, not a radius, so the two
    // paths stay matched at whatever number this is -- which is why they have
    // always carried the same literal and still do. The box is what the slot
    // can actually spare: the picture spans r.y+7 to r.y+53, the name sits at
    // +54 and the price at +68, and an 86 px slot ends at +86. Nothing here is
    // centred on the slot any more; the rows are packed from the top so the
    // picture gets everything that is left.
    if (typeof TowerPreview3D === "undefined" ||
        !TowerPreview3D.draw(ctx, type, r.x + r.w / 2, r.y + 30, 46)) {
      type.drawIcon(ctx, r.x + r.w / 2, r.y + 30, 46);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = affordable ? "#c7d1e0" : "rgba(199,209,224,0.4)";
    // FIT, NOT BARE. This was a plain fillText, and every display name in the
    // game is being rewritten right now -- one name a couple of letters longer
    // than "Summoner" would have run out of the slot and into its neighbour.
    ctx.fillText(fitText(ctx, type.DISPLAY_NAME, r.w - 8), r.x + r.w / 2, r.y + 54);

    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillStyle = affordable ? "#ffd76e" : "#e0736e";
    ctx.fillText("$" + type.COST, r.x + r.w / 2, r.y + 68);
  }

  ctx.textAlign = "left";
}

// The pause menu. Drawn above every other piece of interface, because it is a
// modal and nothing under it is clickable while it is up.
function drawPauseMenu() {
  if (!paused) return;

  // Same scrim as the run-over overlays, and for the same reason: the board is
  // still worth seeing behind a menu that is mostly asking whether to go back
  // to it.
  ctx.fillStyle = "rgba(7,6,9,0.84)";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  drawAshFall(menuClock());
  drawAshFrame();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "44px " + MENU_DISPLAY_FONT;
  ctx.fillStyle = "#f6d9b4";
  drawMenuText("PAUSED", VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 96, 6);

  // Where the run stands, so the menu is worth opening for more than leaving.
  ctx.font = "11px " + MENU_TECH_FONT;
  ctx.fillStyle = "rgba(" + ASH_BONE + ",0.72)";
  drawMenuText(((currentMap ? currentMap.name + "  \u00b7  " : "") +
    "WAVE " + reachedWave() + " OF " + WAVES.length + "  \u00b7  " +
    towers.length + " TOWERS  \u00b7  " + runKills + " DESTROYED  \u00b7  BASE " +
    Math.round(baseHp)).toUpperCase(), VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 52, 1.4);

  drawOverlayButton(resumeButtonRect(), "Resume");
  drawOverlayButton(backToMenuButtonRect(), "Back to main menu");

  ctx.font = "10px " + MENU_TECH_FONT;
  ctx.fillStyle = "rgba(" + ASH_DUST + ",0.58)";
  drawMenuText("ESC TO RESUME  \u00b7  LEAVING DOES NOT SAVE THIS RUN",
    VIEW_WIDTH / 2, backToMenuButtonRect().y + 74, 1.3);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// Geometry of the inspection panel: stat rows, one rectangle per tower
// action (upgrades, abilities), and the Sell button. Both the drawing and
// the click test read this, so a button can never be drawn somewhere other
// than where it is clickable -- same arrangement as slotRect.
//
// A tower opts into action buttons by defining `panelActions()` (see
// js/towers/longshot-adapter.js). Nothing here knows what an upgrade path or
// an ability is: it lays out whatever list it is handed. The gunner defines
// no such method and gets the original panel, unchanged.
//
// Action buttons are laid out two per row, which is what makes the two
// upgrade paths sit side by side; an odd one out (the ability) takes the
// full width of its own row.
function inspectionLayout(tower) {
  var pad = 12;
  var rowH = 22;
  var titleH = 26;
  var buttonH = 30;
  var actionH = 34;        // taller: these carry two or three lines of text
  var gap = 6;
  var rows = tower.statLines();

  var actions = (typeof tower.panelActions === "function") ? tower.panelActions() : [];

  // Every tower that has a targeting mode gets the same cycle button, laid out
  // here rather than in each tower's panelActions -- one button, one place,
  // so the gunner, the smasher and the beam cannot drift apart on it.
  var hasTargeting = typeof tower.targeting === "string";

  // An upgrade button carries a description -- what the tier does, before it
  // is bought. A description is a sentence, not a word, and a sentence does
  // not fit in a half-width button: at two columns it clipped to
  // "+5 dmg, +50 u.l. ra..." which is worse than showing nothing, because it
  // looks like information. So when any action describes itself the buttons
  // go FULL WIDTH, one per row, and the description wraps over two lines.
  var describes = actions.some(function (a) { return a.effects; });
  if (describes) actionH = 60;

  // Wider when there are actions, so two side-by-side buttons still have
  // room for a label and a price without them colliding. Wider again when
  // they carry descriptions.
  var w = describes ? 268 : (actions.length > 0 ? 232 : 190);

  // A COMPACT ACTION IS A SWITCH, NOT A PURCHASE, and it opts out of the
  // full-width rule above by saying so (`action.compact`).
  //
  // The Summoner (js/blub.js) is why this exists. A finished path A carries six
  // action rows -- two upgrades, three summon-line toggles and Coagulation --
  // and at 60 px each that pushes the panel through the build bar, which
  // sandbox.smoke.js pins against. A toggle's whole text is a unit name and the
  // word ON, so it needs a third of that room and can share a row with the next
  // one. Nothing else in the game sets the flag, and an action list without it
  // lays out exactly as it did before this existed.
  //
  // Rows are PLANNED here, before the panel's height is known, because the
  // height is what they add up to. Placement below walks the same plan, so what
  // is measured and what is drawn cannot disagree.
  var COMPACT_ACTION_H = 34;
  var plan = [];
  var pi;
  if (describes) {
    for (pi = 0; pi < actions.length; pi++) {
      var planned = actions[pi];
      var last = plan.length ? plan[plan.length - 1] : null;
      if (planned.compact && last && last.compact && last.items.length === 1) {
        last.items.push(planned);
        continue;
      }
      plan.push({
        items: [planned],
        h: planned.compact ? COMPACT_ACTION_H : actionH,
        compact: !!planned.compact
      });
    }
  } else {
    // Two columns, exactly as before: pairs, with a lone final button going
    // full width.
    for (pi = 0; pi < actions.length; pi += 2) {
      plan.push({ items: actions.slice(pi, pi + 2), h: actionH, compact: false });
    }
  }

  var actionsBlock = 0;
  for (pi = 0; pi < plan.length; pi++) actionsBlock += plan[pi].h + gap;

  var targetingBlock = hasTargeting ? buttonH + gap : 0;

  var h = pad + titleH + rows.length * rowH + 8 +
    targetingBlock + actionsBlock + buttonH + pad;

  // Prefer the right of the tower; flip left if that would run off the map.
  var x = tower.x + tower.footprintPx + 14;
  if (x + w > VIEW_WIDTH - 12) x = tower.x - tower.footprintPx - 14 - w;
  x = Math.max(12, Math.min(x, VIEW_WIDTH - 12 - w));

  // Clamp above the build bar, not just above the canvas edge.
  var y = Math.max(12, Math.min(tower.y - h / 2, BAR_Y - 12 - h));

  // Place each action rectangle. Two columns, except a lone final button.
  var innerW = w - pad * 2;
  var halfW = (innerW - gap) / 2;
  var rowY = y + pad + titleH + rows.length * rowH + 8;

  // Targeting first: one full-width button that cycles through the modes.
  var targeting = null;
  if (hasTargeting) {
    targeting = {
      next: Targeting.next(tower.targeting),
      label: "Target: " + Targeting.LABELS[tower.targeting],
      x: x + pad, y: rowY, w: innerW, h: buttonH
    };
    rowY += buttonH + gap;
  }

  var actionTop = rowY;

  var placed = [];
  var cursorY = actionTop;
  plan.forEach(function (row) {
    row.items.forEach(function (action, col) {
      // A row holding one item takes the full width, whether that is a lone
      // final button in the two-column mode or a described action in the
      // one-per-row mode. Two items split it.
      var full = row.items.length === 1;

      var slot = {
        action: action,
        x: x + pad + (col === 1 ? halfW + gap : 0),
        y: cursorY,
        w: full ? innerW : halfW,
        h: row.h
      };

      // An ability may carry a compact ON/OFF switch inside its own button.
      // This one rectangle is shared by drawing, clicking and hover-card hit
      // testing.
      if (action.toggle) {
        var tW = 46, tH = 15, inset = 5;
        slot.toggle = {
          x: slot.x + slot.w - inset - tW,
          y: slot.y + inset,
          w: tW,
          h: tH,
          id: action.toggle.id,
          abilityId: action.toggle.abilityId,
          label: action.toggle.label,
          on: !!action.toggle.on,
          tooltip: action.toggle.tooltip
        };
      }

      placed.push(slot);
    });
    cursorY += row.h + gap;
  });

  // `upgrades` is a VIEW of the upgrade buttons, not a second list: same
  // rectangles, flattened so a caller can read the upgrade's own id, branch
  // and effect summary off the button. The panel draws `actions`; anything
  // reasoning about the upgrade tree reads `upgrades`.
  var upgrades = placed
    .filter(function (p) { return p.action.tone === "upgrade"; })
    .map(function (p) {
      return {
        x: p.x, y: p.y, w: p.w, h: p.h,
        id: p.action.upgradeId === undefined ? null : p.action.upgradeId,
        actionId: p.action.id,
        branch: p.action.branch || null,
        label: p.action.label,
        detail: p.action.detail === undefined ? "" : p.action.detail,
        effects: p.action.effects === undefined ? "" : p.action.effects,
        reason: p.action.reason === undefined ? null : p.action.reason,
        enabled: p.action.enabled !== false
      };
    });

  // THE BLUB RAIL: a column of boxes BESIDE the panel, one per thing this tower
  // is producing. Only the Summoner has one (js/blub.js), and it is duck-typed
  // like everything else here -- a tower that does not answer `railLines` gets
  // an empty rail and no geometry at all.
  //
  // It is laid out HERE, with the panel, for the reason `slotRect` exists: the
  // rectangles that get drawn and the rectangles that get clicked have to be
  // the same rectangles, and there is exactly one function that decides them.
  //
  // Left of the panel by default, because that is where the owner asked for it
  // and because the panel is already flipped to whichever side of the tower has
  // room -- so "left" is the side away from the tower more often than not. It
  // moves to the right when the panel is hard against the left edge, which is
  // the same flip the panel itself does one level up, for the same reason.
  var rail = [];
  if (typeof tower.railLines === "function") {
    var lines = tower.railLines();
    var railW = 108, railH = 44, railGap = 6;

    var railX = x - railGap - railW;
    if (railX < 12) railX = x + w + railGap;
    railX = Math.max(12, Math.min(railX, VIEW_WIDTH - 12 - railW));

    // Aligned with the top of the panel's rows rather than with its very top:
    // the title sits above them and the rail has no title to line up with.
    var railY = y + pad;
    var railBlock = lines.length * railH + Math.max(0, lines.length - 1) * railGap;
    railY = Math.max(12, Math.min(railY, BAR_Y - 12 - railBlock));

    rail = lines.map(function (line, i) {
      return {
        line: line,
        x: railX,
        y: railY + i * (railH + railGap),
        w: railW,
        h: railH
      };
    });
  }

  return {
    x: x, y: y, w: w, h: h,
    pad: pad, rowH: rowH, titleH: titleH, rows: rows,
    targeting: targeting,
    actions: placed,
    upgrades: upgrades,
    rail: rail,
    sell: { x: x + pad, y: y + h - pad - buttonH, w: innerW, h: buttonH }
  };
}

// Break `text` into at most `maxLines` lines that each fit `maxWidth` at the
// current font, splitting on the commas and spaces the descriptions are built
// from. The last line is ellipsised if the text still does not fit, so this
// degrades to fitText's behaviour rather than overflowing.
function wrapText(context, text, maxWidth, maxLines) {
  var words = String(text).split(" ");
  var lines = [];
  var current = "";

  for (var i = 0; i < words.length; i++) {
    var candidate = current ? current + " " + words[i] : words[i];
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = words[i];
      if (lines.length === maxLines - 1) {
        current = words.slice(i).join(" ");
        break;
      }
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  return lines.slice(0, maxLines).map(function (line, i) {
    return i === Math.min(lines.length, maxLines) - 1
      ? fitText(context, line, maxWidth)
      : line;
  });
}

// --- the hover card ---------------------------------------------------------
//
// A button has room for three short lines: which tier, what it costs, and a
// clipped summary of what it does. That is enough to choose between two
// upgrades and not enough to understand either -- "+15 dmg, +100 u.l. range,
// +5 pierce, pierce falloff" does not say what pierce falloff IS, what the
// range would BECOME, or that buying it shuts the other path for the rest of
// the run.
//
// So hovering any button in the panel opens a card beside it with the whole
// story: every stat it moves, before and after, and a sentence per ability it
// switches on. The tower builds the model (it is the only thing that can
// measure a before/after on itself); everything below is layout and drawing.
//
// Read-only, like every other hover in this game: it never consumes a click
// and never touches simulation state.

var TOOLTIP_WIDTH = 300;
var TOOLTIP_PAD = 12;

// An action's card model, built ON DEMAND. Assembling one means resolving a
// tower's whole stat block a second time (see ConfiguredTower.previewNextTier)
// and the panel lays itself out two or three times a frame -- so actions carry
// a thunk, and only the button actually under the cursor pays for it.
//
// A plain object is accepted too, so a tower with a card that costs nothing to
// build need not wrap it.
function cardFor(action) {
  if (!action || !action.tooltip) return null;
  return (typeof action.tooltip === "function") ? action.tooltip() : action.tooltip;
}

// The model under the cursor, and the rectangle it belongs to, or null.
// Disabled buttons are INCLUDED on purpose -- a refused upgrade is exactly
// when a player wants to know why, and the button only has room for "locked".
function hoveredCard(L) {
  // The blub rail first, because it is drawn outside the panel and so cannot
  // collide with anything below -- and because reading a summon line's numbers
  // is now what hovering a box is FOR, since clicking one switches it (see
  // hitsBlubRail).
  var box = railBoxAt(mouse.x, mouse.y);
  if (box) return { anchor: box, model: box.line.card };

  var tb = L.targeting;
  if (tb && pointInRect(mouse.x, mouse.y, tb)) {
    var mode = inspected.targeting;
    return {
      anchor: tb,
      model: UpgradeEffects.card({
        title: "Targeting  ·  " + Targeting.LABELS[mode],
        subtitle: "click to cycle: " + Targeting.LABELS[Targeting.next(mode)] + " next",
        abilities: [{ name: Targeting.LABELS[mode], text: Targeting.DESCRIPTIONS[mode] }]
      })
    };
  }

  var slot = actionSlotAt(L, mouse.x, mouse.y);
  if (slot && slot.toggle && pointInRect(mouse.x, mouse.y, slot.toggle)) {
    return { anchor: slot.toggle, model: slot.toggle.tooltip };
  }

  var model = slot && cardFor(slot.action);
  return model ? { anchor: slot, model: model } : null;
}

// The card as a flat display list: one entry per drawn line, each carrying its
// own height. Layout sums the heights and the drawing walks the same array, so
// the box can never be a different size from what goes in it -- the same
// arrangement inspectionLayout has with drawInspection.
//
// `context` is needed because wrapping is measured, not guessed.
function tooltipLines(context, model) {
  var innerW = TOOLTIP_WIDTH - TOOLTIP_PAD * 2;
  var lines = [{ kind: "title", text: model.title, h: 20 }];

  if (model.subtitle) lines.push({ kind: "subtitle", text: model.subtitle, h: 17 });

  if (model.changes.length > 0) {
    lines.push({ kind: "rule", h: 10 });
    model.changes.forEach(function (c) {
      lines.push({
        kind: "change",
        text: c.label,
        // "35 → 50" while an upgrade is being previewed; a bare value for a
        // readout that has no before (an ability's damage, say).
        value: c.from ? c.from + " → " + c.to : c.to,
        delta: c.delta || "",
        h: 16
      });
    });
  }

  context.font = "11px system-ui, sans-serif";

  if (model.abilities.length > 0) {
    lines.push({ kind: "rule", h: 10 });
    model.abilities.forEach(function (a) {
      lines.push({ kind: "ability", text: a.name, h: 17 });
      wrapText(context, a.text, innerW, 5).forEach(function (t) {
        lines.push({ kind: "text", text: t, h: 14 });
      });
    });
  }

  if (model.note) {
    lines.push({ kind: "rule", h: 10 });
    wrapText(context, model.note, innerW, 3).forEach(function (t) {
      lines.push({ kind: "note", text: t, h: 14 });
    });
  }

  return lines;
}

// Where the card goes. Beside the PANEL, never over it: the panel is what the
// cursor is on, and a card that covered the button being hovered would hide
// the thing it is describing (and flicker, as the cursor left the button).
function tooltipLayout(context, model, anchor, panel) {
  var lines = tooltipLines(context, model);
  var h = TOOLTIP_PAD * 2;
  lines.forEach(function (line) { h += line.h; });

  var gap = 10;
  var x;
  if (panel.x - gap - TOOLTIP_WIDTH >= 12) {
    x = panel.x - gap - TOOLTIP_WIDTH;                       // left of the panel
  } else if (panel.x + panel.w + gap + TOOLTIP_WIDTH <= VIEW_WIDTH - 12) {
    x = panel.x + panel.w + gap;                             // right of it
  } else {
    // Neither side fits -- only possible on a very wide panel in a narrow
    // gap. Centre it and accept the overlap rather than drawing off-screen.
    x = Math.max(12, Math.min(panel.x + (panel.w - TOOLTIP_WIDTH) / 2,
      VIEW_WIDTH - 12 - TOOLTIP_WIDTH));
  }

  // Aligned with the button it describes, then clamped above the build bar --
  // the same ceiling the panel itself respects.
  var y = Math.max(12, Math.min(anchor.y - 6, BAR_Y - 12 - h));

  return { x: x, y: y, w: TOOLTIP_WIDTH, h: h, pad: TOOLTIP_PAD, lines: lines };
}

function drawHoverCard(L) {
  var hovered = hoveredCard(L);
  if (!hovered) return;

  drawCardBox(tooltipLayout(ctx, hovered.model, hovered.anchor, L));
}

// Draw a laid-out card: the box, then its display list. Split from
// drawHoverCard so the index screen (js/codex.js) can draw the SAME card the
// in-game hover shows -- one renderer, so the preview there cannot look
// different from the real thing here.
function drawCardBox(card) {
  var innerW = card.w - card.pad * 2;

  ctx.fillStyle = "rgba(14,16,23,0.97)";
  ctx.fillRect(card.x, card.y, card.w, card.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,215,110,0.75)";
  ctx.strokeRect(card.x + 0.5, card.y + 0.5, card.w - 1, card.h - 1);

  ctx.textBaseline = "top";
  var y = card.y + card.pad;
  var left = card.x + card.pad;
  var right = card.x + card.w - card.pad;

  card.lines.forEach(function (line) {
    if (line.kind === "rule") {
      ctx.beginPath();
      ctx.moveTo(left, y + line.h / 2 + 0.5);
      ctx.lineTo(right, y + line.h / 2 + 0.5);
      ctx.strokeStyle = "rgba(255,215,110,0.20)";
      ctx.lineWidth = 1;
      ctx.stroke();
      y += line.h;
      return;
    }

    if (line.kind === "change") {
      // Value first, then the delta, then whatever width is left goes to the
      // label -- so a long label is the thing that gets clipped, never the
      // number it describes. Same rule the stat rows follow.
      ctx.textAlign = "right";
      ctx.font = "600 11px system-ui, sans-serif";
      var deltaW = 0;
      if (line.delta) {
        deltaW = ctx.measureText(line.delta).width + 8;
        ctx.fillStyle = "rgba(140,230,157,0.95)";
        ctx.fillText(line.delta, right, y + 2);
      }

      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "#e6eefc";
      var valueW = Math.min(ctx.measureText(line.value).width, innerW - deltaW - 40);
      ctx.fillText(fitText(ctx, line.value, innerW - deltaW - 40), right - deltaW, y + 2);

      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(199,209,224,0.65)";
      ctx.fillText(fitText(ctx, line.text, innerW - deltaW - valueW - 12), left, y + 2);
      y += line.h;
      return;
    }

    ctx.textAlign = "left";
    if (line.kind === "title") {
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillStyle = "#ffd76e";
    } else if (line.kind === "subtitle") {
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillStyle = "rgba(219,231,255,0.85)";
    } else if (line.kind === "ability") {
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillStyle = "#8ce69d";
    } else if (line.kind === "note") {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,180,120,0.95)";
    } else {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(199,209,224,0.78)";
    }
    ctx.fillText(fitText(ctx, line.text, innerW), left, y + 2);
    y += line.h;
  });

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// Shorten `text` with an ellipsis until it fits `maxWidth` at the current
// font. Every string the panel draws goes through this, which is what
// guarantees a long label can never run into the value beside it or spill
// out of its rectangle.
function fitText(context, text, maxWidth) {
  if (maxWidth <= 0) return "";
  if (context.measureText(text).width <= maxWidth) return text;

  var clipped = text;
  while (clipped.length > 1 && context.measureText(clipped + "…").width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return clipped + "…";
}

// Stats for the tower the player clicked: damage, range, cooldown and the DPS
// those two imply, plus a Sell button. The tower computes the rows; this only
// lays them out.
// The blub rail: one box per summon line, beside the panel, from the geometry
// inspectionLayout already decided.
//
// GREY, and that is the whole point of the colour. Every other rectangle in
// this panel is an offer -- green buys a tier, violet fires an ability, gold is
// a live reading -- and these are none of those: they are the things the tower
// is currently making. A grey box says "status, not shop" before a word of it
// is read, which is what the owner asked for.
//
// Each box carries the same clock twice: a BAR that fills left to right as the
// cycle runs, full on the frame the next body appears, and the seconds beside
// it. The bar is for glancing at while you watch the road; the number is for
// when you need to know whether "nearly full" means one second or twenty.
function drawBlubRail(L) {
  if (!L.rail || !L.rail.length) return;

  L.rail.forEach(function (box) {
    var line = box.line;
    var over = mouse.x >= box.x && mouse.x <= box.x + box.w &&
      mouse.y >= box.y && mouse.y <= box.y + box.h;

    // LIT WHILE IT PRODUCES, DIM WHEN IT DOES NOT, and that pair is the whole
    // readout (2026-08-10, at the owner's request). A running line is a bright
    // box with a bright border; a stopped one drops to a grey outline on the
    // panel's own background. No word has to be read to tell them apart, which
    // is the point of a rail you glance at while watching the road.
    var body = line.on ? "212,220,232" : "108,114,126";

    ctx.fillStyle = line.on ? "rgba(44,50,60,0.94)" : "rgba(24,26,32,0.88)";
    ctx.fillRect(box.x, box.y, box.w, box.h);

    // The fill. Drawn UNDER the border and the text, and kept dim, because a
    // bar loud enough to compete with the label makes the box harder to read
    // the fuller it gets -- and it is fullest exactly when you are looking.
    var fill = Math.max(0, Math.min(1, line.progress));
    if (fill > 0) {
      ctx.fillStyle = "rgba(" + body + "," + (line.on ? 0.2 : 0.07) + ")";
      ctx.fillRect(box.x, box.y, box.w * fill, box.h);
      // A bright leading edge, so a nearly-empty bar still reads as a bar and
      // the moment it completes is seen rather than inferred.
      if (fill > 0.012 && fill < 0.995) {
        ctx.fillStyle = "rgba(" + body + "," + (line.on ? 0.8 : 0.25) + ")";
        ctx.fillRect(box.x + box.w * fill - 1, box.y, 2, box.h);
      }
    }

    ctx.lineWidth = line.on ? 2 : 1;
    ctx.strokeStyle = "rgba(" + body + "," +
      (line.on ? (over ? 1 : 0.8) : (over ? 0.7 : 0.35)) + ")";
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = line.on ? "#eef2f8" : "rgba(199,209,224,0.42)";
    ctx.fillText(fitText(ctx, line.name, box.w - 34), box.x + 6, box.y + 17);

    // BLOCKED says the bar is full and the board is not: there is nowhere to
    // put the next one, and it will land the instant a space opens. Without it
    // a full bar that never empties reads as a broken timer.
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = line.blocked
      ? "rgba(255,196,120,0.95)"
      : "rgba(199,209,224," + (line.on ? 0.7 : 0.4) + ")";
    ctx.fillText(!line.on ? "stopped"
      : (line.blocked ? "no room" : line.secondsLeft.toFixed(1) + " s"),
      box.x + 6, box.y + 33);

    // How many of this type are standing right now, hard right. The other half
    // of the question the bar asks: one is "when is the next one", this is
    // "how many did that get me".
    ctx.textAlign = "right";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,215,110," + (line.alive ? 0.95 : 0.3) + ")";
    ctx.fillText("×" + line.alive, box.x + box.w - 6, box.y + 33);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  });
}

// The keyboard shortcut for a panel button, drawn small and dim against its
// right-hand edge (2026-08-10). A shortcut nobody can see is half a feature,
// and the button is where the player is already looking.
//
// Drawn HERE from the layout rather than folded into each button's label,
// because the label is built by the tower and there are five of them: putting
// "  (O)" into `panelActions` would be five copies of a fact that belongs to
// the keyboard handler. It is also why the letter is passed in rather than
// derived -- onKeyDown owns the mapping, and this only renders it.
function drawKeyHint(rect, key, bright) {
  ctx.save();
  ctx.font = "600 10px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(199,209,224," + (bright ? 0.75 : 0.4) + ")";
  ctx.fillText(key, rect.x + rect.w - 7, rect.y + rect.h / 2 + 1);
  ctx.restore();
}

function drawInspection() {
  if (!inspected) return;

  var t = inspected;
  var L = inspectionLayout(t);

  // THE SUBJECT MARKS BELONG TO WHOEVER OWNS THE CAMERA.
  //
  // These two circles are drawn at the tower's WORLD position but after
  // `ctx.restore()`, in raw logical screen pixels. In 2D that is right by
  // coincidence and by design together: the world transform is identity at the
  // default camera, so world (560, 300) and screen (560, 300) are the same
  // point.
  //
  // Under the 3D camera they are not the same point and cannot be made into
  // one -- a range ring is an ellipse on a tilted, turning board. Drawn anyway,
  // this painted a 260 px circle at logical (560, 300), which lands beside the
  // inspection panel: the stray ring reported three times, and the reason no
  // amount of fixing the hover ring made it go away. The 3D branch draws both
  // marks properly in World3D.drawOverlays -- footprint ring and drawReach,
  // which knows a cone tower's reach is a wedge -- so here it draws neither.
  var flat = !(typeof World3D !== "undefined" && World3D.isEnabled());
  if (flat) {
    // Highlight the subject so it is obvious which tower the panel describes.
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.footprintPx + 6, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,215,110,0.9)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(t.x, t.y, t.rangePx, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,215,110,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // No text labels on the map. The shapes above show range and footprint, the
  // panel prints both numbers, and the sandbox's overlay labels them in u.l.
  // Drawing them here as well produced three copies of the same figures piled
  // on top of each other around the tower.

  ctx.fillStyle = "rgba(20,22,30,0.94)";
  ctx.fillRect(L.x, L.y, L.w, L.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,215,110,0.55)";
  ctx.strokeRect(L.x + 0.5, L.y + 0.5, L.w - 1, L.h - 1);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.fillStyle = "#ffd76e";
  ctx.fillText(t.name, L.x + L.pad, L.y + L.pad);

  var innerW = L.w - L.pad * 2;

  for (var i = 0; i < L.rows.length; i++) {
    var ry = L.y + L.pad + L.titleH + i * L.rowH;
    var last = (i === L.rows.length - 1);

    // Value first, because the label is the one that gets truncated: measure
    // the value, then give the label whatever is left over. That is what
    // stops a long label running underneath its own number.
    ctx.font = (last ? "600 13px" : "13px") + " system-ui, sans-serif";
    var valueText = String(L.rows[i][1]);
    var valueW = ctx.measureText(valueText).width;

    ctx.fillStyle = last ? "#ffd76e" : "#c7d1e0";
    ctx.textAlign = "right";
    ctx.fillText(valueText, L.x + L.w - L.pad, ry);

    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(199,209,224,0.65)";
    ctx.textAlign = "left";
    ctx.fillText(fitText(ctx, L.rows[i][0], innerW - valueW - 10), L.x + L.pad, ry);
  }

  // Action buttons: one rectangle each, two per row, drawn from the geometry
  // in inspectionLayout so they cannot drift from where clicks land.
  if (L.targeting) {
    var tgt = L.targeting;
    var tHot = pointInRect(mouse.x, mouse.y, tgt);

    ctx.fillStyle = tHot ? "rgba(140,199,255,0.26)" : "rgba(140,199,255,0.12)";
    ctx.fillRect(tgt.x, tgt.y, tgt.w, tgt.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = tHot ? "rgba(170,215,255,0.95)" : "rgba(140,199,255,0.45)";
    ctx.strokeRect(tgt.x + 0.5, tgt.y + 0.5, tgt.w - 1, tgt.h - 1);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = "#cfe3ff";
    ctx.fillText(fitText(ctx, tgt.label, tgt.w - 10), tgt.x + tgt.w / 2,
      tgt.y + tgt.h / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  L.actions.forEach(function (slot) {
    var a = slot.action;

    // `readonly` entries are readouts, not buttons -- a passive that is
    // already doing something rather than an offer to do something. They
    // never highlight on hover, because nothing happens if you click.
    var over = a.enabled && !a.readonly &&
      mouse.x >= slot.x && mouse.x <= slot.x + slot.w &&
      mouse.y >= slot.y && mouse.y <= slot.y + slot.h;

    // Upgrades read green (you gain something), the ability violet (it costs
    // as much as it gives -- it burns max HP), a passive readout gold, the
    // same colour the rest of the interface uses for "this is a number".
    var rgb = a.tone === "ability" ? "196,140,255"
            : a.tone === "passive" ? "255,215,110"
            : "108,230,133";
    var alphaFill = a.readonly ? 0.08 : (!a.enabled ? 0.05 : (over ? 0.26 : 0.13));
    var alphaLine = a.readonly ? 0.4 : (!a.enabled ? 0.22 : (over ? 0.95 : 0.5));

    ctx.fillStyle = "rgba(" + rgb + "," + alphaFill + ")";
    ctx.fillRect(slot.x, slot.y, slot.w, slot.h);

    // AN ACTION MAY FILL AS ITS CLOCK RUNS. `action.progress` is 0..1 and
    // sweeps the button's own rectangle left to right; full means the thing the
    // button describes happens NOW. The Summoner's summon lines use it, so the
    // player can see the next blub coming instead of counting seconds
    // (2026-08-09, at the owner's request).
    //
    // It is drawn as the button's BACKGROUND rather than as a strip along one
    // edge, for the reason a compact action exists at all: these rectangles are
    // 34 px tall with two lines of text in them, and a bar thin enough to fit
    // under that text is too thin to read across the panel. A sweep is legible
    // at a glance and costs no height.
    //
    // Kept deliberately dim and UNDER the border and the label -- it is a
    // background, and a fill loud enough to compete with the text would make
    // the button harder to read the fuller it got.
    if (typeof a.progress === "number" && a.progress > 0) {
      var fill = Math.max(0, Math.min(1, a.progress));
      ctx.fillStyle = "rgba(" + rgb + "," + (a.enabled ? 0.3 : 0.12) + ")";
      ctx.fillRect(slot.x, slot.y, slot.w * fill, slot.h);

      // A bright leading edge, so a nearly-empty bar is still visibly a bar and
      // the moment it completes is visible rather than inferred.
      if (fill > 0.01 && fill < 0.995) {
        ctx.fillStyle = "rgba(" + rgb + "," + (a.enabled ? 0.85 : 0.3) + ")";
        ctx.fillRect(slot.x + slot.w * fill - 1, slot.y, 2, slot.h);
      }
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(" + rgb + "," + alphaLine + ")";
    ctx.strokeRect(slot.x + 0.5, slot.y + 0.5, slot.w - 1, slot.h - 1);

    // Two centred lines, each clipped to the rectangle's inner width, so
    // neither can overflow into the button beside it.
    var textW = slot.w - 10;
    var cx = slot.x + slot.w / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = a.enabled ? "rgba(" + rgb + ",1)" : "rgba(199,209,224,0.35)";
    ctx.fillText(fitText(ctx, a.label, textW), cx, slot.y + 14);

    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = a.enabled ? "rgba(219,231,255,0.85)" : "rgba(199,209,224,0.3)";
    ctx.fillText(fitText(ctx, a.detail, textW), cx, slot.y + 27);

    // The description: what this upgrade actually does. Dimmer than the
    // price, because it is the thing you read second -- but it is on the
    // button BEFORE you buy, which is the whole point of it being here.
    // Wrapped, not clipped: a truncated description is misinformation.
    if (a.effects) {
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillStyle = a.enabled ? "rgba(199,209,224,0.72)" : "rgba(199,209,224,0.28)";
      wrapText(ctx, a.effects, textW, 2).forEach(function (line, i) {
        ctx.fillText(line, cx, slot.y + 41 + i * 12);
      });
    }

    // The keyboard shortcut, on the two buttons that have one. Upgrade buttons
    // never carry an auto pill (only abilities do), so the right-hand edge is
    // free.
    if (a.tone === "upgrade" && (a.branch === "A" || a.branch === "B")) {
      drawKeyHint(slot, a.branch === "A" ? "O" : "P", over);
    }

    // Draw the ability's auto switch last so it sits above its parent button.
    if (slot.toggle) {
      var g = slot.toggle;
      var gOver = pointInRect(mouse.x, mouse.y, g);

      ctx.fillStyle = g.on
        ? (gOver ? "rgba(196,140,255,0.95)" : "rgba(196,140,255,0.8)")
        : (gOver ? "rgba(20,22,30,0.95)" : "rgba(20,22,30,0.75)");
      ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = g.on
        ? "rgba(232,205,255,0.95)"
        : (gOver ? "rgba(196,140,255,0.9)" : "rgba(196,140,255,0.45)");
      ctx.strokeRect(g.x + 0.5, g.y + 0.5, g.w - 1, g.h - 1);

      ctx.font = "600 9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = g.on ? "#241a33" : "rgba(196,140,255,0.9)";
      ctx.fillText(g.label + (g.on ? " ON" : ""),
        g.x + g.w / 2, g.y + g.h / 2 + 0.5);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
    }
  });

  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  drawBlubRail(L);

  // Sell button. Red-tinted because it destroys something, but it pays out,
  // so the amount is shown in the same gold used for cash everywhere else.
  var b = L.sell;
  var hovering = mouse.x >= b.x && mouse.x <= b.x + b.w &&
                 mouse.y >= b.y && mouse.y <= b.y + b.h;

  ctx.fillStyle = hovering ? "rgba(224,115,110,0.28)" : "rgba(224,115,110,0.14)";
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = hovering ? "rgba(240,140,134,0.95)" : "rgba(224,115,110,0.55)";
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillStyle = hovering ? "#ffd76e" : "#e8b96a";
  ctx.fillText(fitText(ctx, "Sell  $" + sellValue(t), b.w - 26),
    b.x + b.w / 2, b.y + b.h / 2 + 1);
  drawKeyHint(b, "X", hovering);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // Last, so the card is drawn over the panel it hangs off rather than under
  // it -- and over any button it happens to reach across.
  drawHoverCard(L);
}


window.addEventListener("load", init);


// --- map chooser and enemy hover (merged from the other branch, v0.3.5) ---

// THE GRID THE CARDS SIT ON, DERIVED FROM HOW MANY THERE ARE.
//
// The old version of this took the column count and the card size as given and
// simply stacked more rows. That was fine while adding a map meant a fourth
// card in an unfinished row, and it stopped being fine at SEVEN: three columns
// of 240 px cards is three rows, which ends 902 px down a 720 px canvas -- the
// bottom row entirely off the screen, unclickable, with no error anywhere to
// say so. Layout that silently walks off the viewport is the failure this
// function exists to make impossible.
//
// So the card size is a CAP now, not a constant. Up to six routes nothing
// changes at all -- three columns at the full authored 372x240, which is what
// the arithmetic below returns for that case, byte for byte. Past six it opens
// a fourth column and shrinks the card to whatever fits the width, keeping the
// render 16:9 by taking the height from the width rather than the other way
// round (see mapPreviewRect: 16:9 is not negotiable, so the CARD is the thing
// that gives).
function mapGrid() {
  var n = Maps.LIST.length;
  var cols = Math.min(n, n <= MAP_CARD_COLS * 2 ? MAP_CARD_COLS : MAP_CARD_COLS + 1);
  var w = Math.min(CARD_W,
    Math.floor((VIEW_WIDTH - CARD_MARGIN * 2 - (cols - 1) * CARD_GAP) / cols));
  var h = Math.min(CARD_H,
    Math.round(CARD_CHROME_H + (w - 24) * VIEW_HEIGHT / VIEW_WIDTH));
  return { cols: cols, rows: Math.ceil(n / cols), w: w, h: h };
}

function mapCardRect(i) {
  var g = mapGrid();
  var col = i % g.cols;
  var row = Math.floor(i / g.cols);
  // Each ROW is centred on the cards it actually holds, so an odd last row
  // sits under the middle of the grid instead of hanging off its left edge.
  var inRow = Math.min(g.cols, Maps.LIST.length - row * g.cols);
  var total = inRow * g.w + (inRow - 1) * CARD_GAP;
  return {
    x: (VIEW_WIDTH - total) / 2 + col * (g.w + CARD_GAP),
    y: CARD_Y + row * (g.h + CARD_ROW_GAP),
    w: g.w,
    h: g.h
  };
}

function mapGridBottom() {
  var g = mapGrid();
  return CARD_Y + g.rows * g.h + (g.rows - 1) * CARD_ROW_GAP;
}

// Index of the map card under a point, or null.
function mapCardAt(x, y) {
  for (var i = 0; i < Maps.LIST.length; i++) {
    if (pointInRect(x, y, mapCardRect(i))) return i;
  }
  return null;
}

// --- the title screen -------------------------------------------------------
//
// Interface chrome, so pixels are correct here (see the u.l. rule): these are
// anchored to the 1280x720 viewport, not to anything in the world.

function playButtonRect() {
  return { x: VIEW_WIDTH / 2 - 240, y: 334, w: 480, h: 88 };
}

// PLAY owns the centre. The three smaller destinations form one command rail
// below it instead of a second stack competing with the primary action.
function storeButtonRect() {
  return { x: VIEW_WIDTH / 2 - 270, y: 456, w: 170, h: 58 };
}

function indexButtonRect() {
  return { x: VIEW_WIDTH / 2 - 85, y: 456, w: 170, h: 58 };
}

function sandboxButtonRect() {
  return { x: VIEW_WIDTH / 2 + 100, y: 456, w: 170, h: 58 };
}

// Back to the menu from the chooser. Top-left, out of the cards' way.
function backButtonRect() {
  return { x: 28, y: 28, w: 96, h: 34 };
}

// --- the title screen: THE ASH WASTE ----------------------------------------
//
// Theme, 2026-08-25, at the owner's request: the cyan command deck that stood
// here from 2026-08-18 is gone entirely -- backdrop, props, controls and type.
// What replaces it is a post-apocalyptic fantasy-tech world: a burnt sky over
// a dead skyline, a colossal fractured ley-pylon on the left, a downed
// sky-relay on the right, and a rift torn in the upper air that strikes on its
// own clock. The screen ANIMATES continuously -- ash falls, embers rise, dust
// sweeps the horizon, the rift cracks, debris floats -- because draw() already
// runs every frame on the menu and the old screen's single breathing halo was
// the whole of its life.
//
// Rules this screen keeps:
//
// - MOTION NEVER MOVES A HIT TARGET. Every animated value feeds a colour, an
//   alpha, or a decoration's own position. The four rectangle functions above
//   remain the single source for both drawing and hit testing, and none of
//   them reads the clock.
// - THE CENTRE STAYS QUIET. The scene's mass is in the left and right thirds;
//   a soft dark veil is laid over the middle before the type goes down, so a
//   burning sky can never cost the title or the controls their contrast.
// - PALETTE: ash and rust are the surfaces (near-black browns, iron greys),
//   ember orange and bone are the warm accents, and ley-teal and ley-violet
//   are the ONLY cool ones -- they mark arcane energy, and nothing that is not
//   arcane is allowed to use them. The old screen's cyan-and-gold rule is
//   replaced by this one, not extended.
// - DETERMINISM: every "random" detail comes from menuNoise(), a pure hash of
//   an index, so the scene is identical on every boot and no array of particle
//   state is kept alive between frames.

// Impact is the display face on both macOS and Windows and needs no download,
// which matters more here than a prettier choice would: the game runs from a
// double-clicked file:// page, so a webfont would either need a server or a
// megabyte of base64 in the HTML. Condensed, heavy and all-caps, it reads as
// stencilled salvage rather than as system UI -- which is exactly the job the
// old "700 15px system-ui" was failing at.
var MENU_DISPLAY_FONT =
  '"Impact", "Haettenschweiler", "Franklin Gothic Bold", "Arial Narrow", sans-serif';
// The instrument face: readouts, hotkeys and the small print under a label.
var MENU_TECH_FONT =
  'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace';

var MENU_HORIZON = 604;          // where the sky stops and the waste begins

// Seconds, monotonic. The harness's performance.now() is frozen at 0, so under
// test every animated term collapses to its t=0 value and the screen still
// draws -- deliberately, since the suite asserts that it draws, not what it
// looks like.
function menuClock() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now() / 1000
    : 0;
}

// A pure hash in [0,1). Not a generator: menuNoise(i) is the same number every
// frame and every boot, which is what lets the scene keep hundreds of authored
// details without keeping a single one of them in memory.
function menuNoise(i) {
  var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// The test harness's canvas stub answers every unknown method with a function
// that returns undefined, so ctx.createLinearGradient(...).addColorStop would
// throw there and take the suite down. Both helpers degrade to the last stop's
// flat colour when they are handed something that is not a gradient. This is
// presentation only: a flat colour in a test that never looks at pixels costs
// nothing, and a crash would cost the whole file.
function menuLinear(x0, y0, x1, y1, stops) {
  var g = ctx.createLinearGradient(x0, y0, x1, y1);
  if (!g || typeof g.addColorStop !== "function") return stops[stops.length - 1][1];
  for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
  return g;
}

function menuRadial(x, y, r0, r1, stops) {
  var g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  if (!g || typeof g.addColorStop !== "function") return stops[stops.length - 1][1];
  for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
  return g;
}

// Letter-spaced text. Canvas has ctx.letterSpacing now, but it is recent
// enough that a browser without it would silently draw the whole screen's type
// too tight, so the tracking is done by hand: measure each glyph, lay them out
// with a gap, and honour ctx.textAlign ourselves because per-character drawing
// cannot use the canvas's own alignment. Returns the width it drew, which the
// title uses to place its rule.
function drawMenuText(text, x, y, track, stroked) {
  var chars = String(text).split("");
  var widths = [];
  var total = 0;
  var i;
  for (i = 0; i < chars.length; i++) {
    var w = ctx.measureText(chars[i]).width || 0;
    widths.push(w);
    total += w;
  }
  if (chars.length > 1) total += track * (chars.length - 1);

  var align = ctx.textAlign;
  var cx = align === "center" ? x - total / 2 : (align === "right" ? x - total : x);
  ctx.textAlign = "left";
  for (i = 0; i < chars.length; i++) {
    if (stroked) ctx.strokeText(chars[i], cx, y);
    else ctx.fillText(chars[i], cx, y);
    cx += widths[i] + track;
  }
  ctx.textAlign = align;
  return total;
}

// STATIC LAYERS ARE BAKED ONCE AND BLITTED, and this is a measurement, not a
// precaution. The first draft of this screen cost 72 ms a frame against a
// 2560x1440 backing store -- about 14 fps -- and 51 ms of that was two
// functions: the sky's full-width gradient with the sun in it (14 ms) and the
// atmosphere's calm-centre veil, two full-screen vignette gradients and 144
// scanlines (37 ms). Not one of those reads the clock, so they were being
// re-rasterised sixty times a second for nothing.
//
// Each is painted into an offscreen canvas at the backing store's own
// resolution -- so scanlines stay one device pixel -- and drawn back as a
// single composite. The cache is keyed on the backing store's size, so a
// window resize rebuilds it and a hot-swapped DPR cannot leave a soft layer
// behind.
//
// WHERE IT CANNOT BAKE, IT PAINTS LIVE. The test harness's document has only
// getElementById and its canvas stub has no real 2D context, so every path
// below falls through to drawing the layer directly: same picture, nothing
// thrown, and the suite never learns this optimisation exists.
var menuLayers = { key: "", sky: null, veil: null };

function menuBakeLayer(paint) {
  var made;
  try { made = document.createElement("canvas"); } catch (e) { return null; }
  if (!made || typeof made.getContext !== "function") return null;
  var scale = canvas && canvas.width > 0 ? canvas.width / VIEW_WIDTH : 1;
  made.width = Math.round(VIEW_WIDTH * scale);
  made.height = Math.round(VIEW_HEIGHT * scale);
  var into = made.getContext("2d");
  if (!into || typeof into.scale !== "function") return null;
  into.scale(scale, scale);
  // Baked through the SAME function the live path calls, by lending it the
  // module's `ctx` for the duration. One drawing of each layer exists, so the
  // cached picture cannot drift from the uncached one.
  var live = ctx;
  ctx = into;
  try { paint(); } finally { ctx = live; }
  return made;
}

// Returns the baked layer, or null when this environment cannot bake -- in
// which case the caller paints it. A failed bake is remembered as `false` so
// it is attempted once, not once a frame.
function menuLayer(name, paint) {
  var key = canvas ? canvas.width + "x" + canvas.height : "0x0";
  if (menuLayers.key !== key) menuLayers = { key: key, sky: null, veil: null };
  if (menuLayers[name] === null) menuLayers[name] = menuBakeLayer(paint) || false;
  return menuLayers[name] || null;
}

function drawMenuLayer(name, paint) {
  var baked = menuLayer(name, paint);
  if (baked) ctx.drawImage(baked, 0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  else paint();
}

// A burnt sky: night at the top, a bruised middle, and a band of ember heat
// sitting on the horizon where the sun is going down behind the ruins.
function drawMenuSky(t) {
  drawMenuLayer("sky", drawMenuSkyBase);
  drawMenuSkyBands(t);
}

// The half of the sky that never changes: the gradient, the sun's halo, its
// disc and the cracks across it. The sun used to breathe on a 0.7 Hz sine;
// that pulse was the only thing keeping this out of the cache and the scene
// has no shortage of motion without it.
function drawMenuSkyBase() {
  ctx.fillStyle = menuLinear(0, 0, 0, MENU_HORIZON, [
    [0.00, "#07060b"],
    [0.22, "#150d18"],
    [0.44, "#3a1a22"],
    [0.66, "#7e3320"],
    [0.84, "#c25f24"],
    [0.95, "#eea24a"],
    [1.00, "#f6c274"]
  ]);
  ctx.fillRect(0, 0, VIEW_WIDTH, MENU_HORIZON);

  // The dying sun, half-sunk. Its disc is deliberately dim and its halo wide:
  // it lights the skyline from behind and never competes with the title.
  ctx.fillStyle = menuRadial(640, MENU_HORIZON, 20, 330, [
    [0.00, "rgba(255,196,110,0.30)"],
    [0.35, "rgba(236,124,50,0.17)"],
    [1.00, "rgba(120,40,26,0)"]
  ]);
  ctx.fillRect(300, MENU_HORIZON - 340, 680, 350);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, VIEW_WIDTH, MENU_HORIZON);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(640, MENU_HORIZON, 152, 0, Math.PI * 2);
  ctx.fillStyle = menuRadial(640, MENU_HORIZON - 40, 10, 160, [
    [0.00, "rgba(255,226,168,0.62)"],
    [0.55, "rgba(240,142,58,0.44)"],
    [1.00, "rgba(190,72,32,0.20)"]
  ]);
  ctx.fill();

  // Cracks across the disc: this sun is not well.
  ctx.lineWidth = 2;
  for (var crack = 0; crack < 5; crack++) {
    var ca = menuNoise(crack + 41) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(640 + Math.cos(ca) * 30, MENU_HORIZON - 40 + Math.sin(ca) * 30);
    for (var seg = 1; seg <= 4; seg++) {
      var ra = ca + (menuNoise(crack * 7 + seg) - 0.5) * 0.7;
      ctx.lineTo(640 + Math.cos(ra) * (30 + seg * 32),
        MENU_HORIZON - 40 + Math.sin(ra) * (30 + seg * 32));
    }
    ctx.strokeStyle = "rgba(92,26,18,0.34)";
    ctx.stroke();
  }
  ctx.restore();
}

// Ley-light in the upper air. Three ribbons, undulating on their own phase.
// Teal and violet only, and never above 0.13 alpha -- this is weather, not an
// element the eye should stop on. Strokes, so they are cheap enough to stay
// live while everything behind them is baked.
function drawMenuSkyBands(t) {
  for (var band = 0; band < 3; band++) {
    var base = 74 + band * 58;
    var hue = band === 1 ? "158,116,255" : "94,226,201";
    ctx.beginPath();
    ctx.moveTo(-20, base);
    for (var bx = -20; bx <= VIEW_WIDTH + 20; bx += 40) {
      ctx.lineTo(bx,
        base + Math.sin(bx * 0.0052 + t * (0.16 + band * 0.05) + band * 2.1) * 21 +
        Math.sin(bx * 0.0131 - t * 0.09) * 7);
    }
    // Wide and very faint, and stroked twice: a soft core inside a softer
    // halo. A single 16 px stroke at this alpha read as a ruled band across
    // the sky, which is the opposite of light in the air.
    var lit = (0.026 + 0.022 * (1 + Math.sin(t * 0.5 + band))).toFixed(4);
    ctx.strokeStyle = "rgba(" + hue + "," + lit + ")";
    ctx.lineWidth = 46 + band * 22;
    ctx.stroke();
    ctx.strokeStyle = "rgba(" + hue + "," + (lit * 1.6).toFixed(4) + ")";
    ctx.lineWidth = 9 + band * 4;
    ctx.stroke();
  }
}

// Two dead cities on the horizon: a far row bleached by haze, a nearer row
// almost black. Both drift a few pixels on a slow sine, which is the parallax
// of a camera that is breathing rather than a scroll.
function drawMenuSkyline(t) {
  var layer, i;
  for (layer = 0; layer < 2; layer++) {
    var far = layer === 0;
    var drift = Math.sin(t * (far ? 0.05 : 0.08) + layer) * (far ? 5 : 9);
    var baseY = MENU_HORIZON - (far ? 8 : 0);
    ctx.save();
    ctx.translate(drift, 0);
    var body = far ? "rgba(48,24,30,0.62)" : "#100910";
    ctx.fillStyle = body;
    for (i = 0; i < (far ? 26 : 19); i++) {
      var seed = i + layer * 60;
      var bx = -40 + i * (far ? 52 : 72) + menuNoise(seed) * 26;
      var bw = (far ? 26 : 40) + menuNoise(seed + 7) * (far ? 22 : 34);
      var bh = (far ? 40 : 66) + menuNoise(seed + 13) * (far ? 78 : 132);
      var shape = menuNoise(seed + 21);
      // MOST OF THIS CITY IS BROKEN, and that is the point: a row of intact
      // rectangles is a skyline at dusk, not a skyline after the war. Only the
      // last case below is a whole building, and it is the minority.
      ctx.beginPath();
      if (shape > 0.62) {
        // Snapped off on the diagonal.
        ctx.moveTo(bx, baseY);
        ctx.lineTo(bx, baseY - bh);
        ctx.lineTo(bx + bw * 0.45, baseY - bh * (0.58 + menuNoise(seed + 3) * 0.2));
        ctx.lineTo(bx + bw, baseY - bh * 0.5);
        ctx.lineTo(bx + bw, baseY);
      } else if (shape > 0.38) {
        // Collapsed into a stump with one wall still standing.
        ctx.moveTo(bx, baseY);
        ctx.lineTo(bx, baseY - bh * 0.42);
        ctx.lineTo(bx + bw * 0.28, baseY - bh * 0.34);
        ctx.lineTo(bx + bw * 0.34, baseY - bh);
        ctx.lineTo(bx + bw * 0.62, baseY - bh * 0.92);
        ctx.lineTo(bx + bw * 0.7, baseY - bh * 0.3);
        ctx.lineTo(bx + bw, baseY - bh * 0.24);
        ctx.lineTo(bx + bw, baseY);
      } else if (shape > 0.18) {
        // Leaning, and going the rest of the way at some point.
        var tilt = (menuNoise(seed + 33) - 0.5) * bw * 0.6;
        ctx.moveTo(bx, baseY);
        ctx.lineTo(bx + tilt * 0.6, baseY - bh);
        ctx.lineTo(bx + bw + tilt, baseY - bh * 0.86);
        ctx.lineTo(bx + bw, baseY);
      } else {
        ctx.rect(bx, baseY - bh, bw, bh);
      }
      ctx.closePath();
      ctx.fill();
      // A few windows still have power, and they gutter.
      if (!far && menuNoise(seed + 31) > 0.55) {
        var lit = 0.25 + 0.2 * (1 + Math.sin(t * (1.4 + menuNoise(seed) * 2) + i));
        ctx.fillStyle = "rgba(255,168,86," + lit.toFixed(3) + ")";
        ctx.fillRect(bx + bw * 0.3, baseY - bh * 0.55, 4, 7);
        ctx.fillRect(bx + bw * 0.6, baseY - bh * 0.34, 4, 7);
        ctx.fillStyle = body;
      }
    }
    ctx.restore();
  }

  // Dust rolling along the horizon, left to right, on a loop long enough that
  // it never reads as a repeat.
  var veil = ((t * 22) % 2000) - 360;
  ctx.fillStyle = menuRadial(veil, MENU_HORIZON - 46, 20, 300, [
    [0.00, "rgba(196,142,96,0.13)"],
    [1.00, "rgba(196,142,96,0)"]
  ]);
  ctx.fillRect(veil - 300, MENU_HORIZON - 200, 600, 210);
}

// Rock torn off the ground and left hanging: the fantasy half of the fiction,
// stated once and plainly. Each island is a dark wedge with a lit underside
// and a rune ring holding it up, drifting on its own slow bob. They sit in the
// outer thirds only -- the centre is the type's, and a shape floating behind
// the title would be exactly the distraction the calm veil exists to prevent.
function drawMenuIslands(t) {
  // Placed clear of the title, the eyebrow and both bays' machinery. The two
  // small ones sit high, where the sky is emptiest.
  var spots = [[318, 108, 1.05], [1134, 150, 0.92], [792, 66, 0.5],
    [498, 54, 0.42]];
  for (var i = 0; i < spots.length; i++) {
    var sx = spots[i][0] + Math.sin(t * 0.11 + i * 1.9) * 14;
    var sy = spots[i][1] + Math.sin(t * 0.19 + i * 2.7) * 9;
    var k = spots[i][2];
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(k, k);

    // ASYMMETRIC AND WIDER THAN TALL, deliberately. The first draft was a
    // symmetrical wedge with a long point and a full ellipse under it, and
    // between them they read as a flying saucer rather than as a piece of
    // ground: a lump of rock is lopsided and its broken face is off-centre.
    ctx.beginPath();
    ctx.moveTo(-72, -4);
    ctx.lineTo(-46, -17);
    ctx.lineTo(-8, -23);
    ctx.lineTo(28, -15);
    ctx.lineTo(64, -5);
    ctx.lineTo(50, 11);
    ctx.lineTo(22, 15);
    ctx.lineTo(9, 38);
    ctx.lineTo(-4, 17);
    ctx.lineTo(-36, 13);
    ctx.closePath();
    ctx.fillStyle = menuLinear(0, -22, 0, 38, [
      [0.00, "#3a2830"],
      [0.45, "#1d1219"],
      [1.00, "#0c070c"]
    ]);
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(146,88,60,0.5)";
    ctx.stroke();

    // RIM LIGHT, and it is what makes these read as rock rather than as a
    // hole in the sky: the sun is behind and below, so the torn underside
    // catches ember and the top plate takes a thin bone edge. Without it a
    // dark shape on a dark sky was invisible and only its runes showed.
    ctx.beginPath();
    ctx.moveTo(-36, 13);
    ctx.lineTo(-4, 17);
    ctx.lineTo(9, 38);
    ctx.lineTo(22, 15);
    ctx.lineTo(50, 11);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "rgba(255,150,72,0.6)";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-72, -4);
    ctx.lineTo(-46, -17);
    ctx.lineTo(-8, -23);
    ctx.lineTo(28, -15);
    ctx.lineTo(64, -5);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = "rgba(228,192,158,0.48)";
    ctx.stroke();

    // A ruin still standing on it, so the rock reads as a piece of somewhere.
    ctx.fillStyle = "#0f0910";
    ctx.fillRect(-26, -48, 12, 29);
    ctx.fillRect(0, -36, 8, 17);
    ctx.fillStyle = "rgba(226,190,158,0.34)";
    ctx.fillRect(-26, -48, 12, 2);
    ctx.fillRect(0, -36, 8, 2);

    // WHAT HOLDS IT UP IS SHOWN BY WHAT ORBITS IT, not by a ring under it.
    // Two drafts wore a glowing ellipse -- first a skirt below the rock, then
    // a band around its waist -- and both projected in front of and behind
    // the silhouette, which is exactly the read of a saucer. Loose shards
    // circling say the same thing (this rock is not obeying gravity) and
    // cannot be mistaken for a hull.
    var lift = 0.55 + 0.25 * (1 + Math.sin(t * 1.4 + i * 1.3));
    for (var g = 0; g < 4; g++) {
      var ga = t * (0.34 + menuNoise(g + i * 5) * 0.2) * (i % 2 ? -1 : 1) +
        g * 1.6;
      var gx = Math.cos(ga) * (58 + g * 11);
      var gy = 8 + Math.sin(ga) * (13 + g * 3);
      var gs = 3 + menuNoise(g + i * 9) * 4;
      ctx.beginPath();
      ctx.moveTo(gx - gs, gy);
      ctx.lineTo(gx - gs * 0.2, gy - gs);
      ctx.lineTo(gx + gs, gy - gs * 0.3);
      ctx.lineTo(gx + gs * 0.3, gy + gs * 0.8);
      ctx.closePath();
      ctx.fillStyle = "#170e14";
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(132,246,222," + (0.34 + 0.3 * lift).toFixed(3) + ")";
      ctx.stroke();
    }
    // The ley-light the shards are riding on, thrown up into the stone.
    ctx.fillStyle = menuRadial(-4, 10, 6, 84, [
      [0.00, "rgba(132,246,222," + (0.10 * lift).toFixed(3) + ")"],
      [1.00, "rgba(132,246,222,0)"]
    ]);
    ctx.fillRect(-88, -22, 176, 84);
    ctx.restore();
  }
}

// A tear in the sky. `period` seconds apart it flares white-hot and its
// branches re-cut themselves; between strikes it sits as a dim seam, so the
// eye is caught a couple of times a minute rather than nagged continuously.
function drawMenuRift(t, x, y, height, spread, hue, period) {
  var strike = Math.floor(t / period);
  var phase = (t / period) % 1;
  var flash = phase < 0.10 ? 1 - phase / 0.10 : 0;
  var idle = 0.20 + Math.sin(t * 1.7 + x) * 0.05;
  var power = idle + flash * 0.8;

  ctx.save();
  ctx.fillStyle = menuRadial(x, y + height / 2, 6, height * 0.9, [
    [0.00, "rgba(" + hue + "," + (0.16 * power * 3).toFixed(3) + ")"],
    [1.00, "rgba(" + hue + ",0)"]
  ]);
  ctx.fillRect(x - height, y - height * 0.3, height * 2, height * 1.7);

  var branch;
  for (branch = 0; branch < 3; branch++) {
    var seed = strike * 17 + branch * 9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    var px = x;
    var py = y;
    for (var step = 1; step <= 7; step++) {
      px += (menuNoise(seed + step) - 0.5) * spread * (branch === 0 ? 1 : 1.7);
      py += height / 7;
      ctx.lineTo(px, py);
    }
    ctx.lineWidth = branch === 0 ? 3.2 : 1.4;
    ctx.strokeStyle = "rgba(" + hue + "," +
      Math.min(0.95, power * (branch === 0 ? 1 : 0.5)).toFixed(3) + ")";
    ctx.stroke();
    if (branch === 0 && flash > 0.2) {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(255,246,232," + (flash * 0.8).toFixed(3) + ")";
      ctx.stroke();
    }
  }
  ctx.restore();
}

// LEFT BAY: a colossal ley-pylon, snapped near the top, still holding its
// core. It is the tower this game is about, a hundred years after the war --
// which is why it is a silhouette with one live light in it rather than a
// diagram of a working machine.
function drawMenuPylon(t) {
  ctx.save();
  ctx.translate(196, MENU_HORIZON);

  // The shadow it throws toward the viewer.
  ctx.beginPath();
  ctx.ellipse(14, 22, 172, 30, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();

  // Buttressed footing.
  ctx.fillStyle = "#1b1116";
  ctx.beginPath();
  ctx.moveTo(-128, 12);
  ctx.lineTo(-86, -74);
  ctx.lineTo(84, -74);
  ctx.lineTo(126, 12);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(232,142,72,0.28)";
  ctx.stroke();

  // The shaft, leaning: a plumb tower would look maintained.
  ctx.save();
  ctx.rotate(-0.055);
  ctx.fillStyle = menuLinear(-56, -420, 62, -60, [
    [0.00, "#2a1a1c"],
    [0.55, "#1d1216"],
    [1.00, "#120b0f"]
  ]);
  ctx.beginPath();
  ctx.moveTo(-58, -70);
  ctx.lineTo(-40, -352);
  ctx.lineTo(38, -352);
  ctx.lineTo(58, -70);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(238,150,78,0.30)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Ribs, and the rust that has run down from each of them.
  for (var rib = 0; rib < 7; rib++) {
    var ry = -96 - rib * 38;
    var half = 56 - rib * 2.4;
    ctx.fillStyle = "rgba(96,52,34,0.55)";
    ctx.fillRect(-half, ry, half * 2, 5);
    ctx.fillStyle = "rgba(150,72,38,0.16)";
    ctx.fillRect(-half + 8 + menuNoise(rib) * 40, ry + 5, 3, 22 + menuNoise(rib + 5) * 18);
  }

  // The snapped crown: torn plate, not a clean cut.
  ctx.beginPath();
  ctx.moveTo(-40, -352);
  ctx.lineTo(-30, -404);
  ctx.lineTo(-6, -378);
  ctx.lineTo(10, -420);
  ctx.lineTo(26, -372);
  ctx.lineTo(38, -352);
  ctx.closePath();
  ctx.fillStyle = "#241419";
  ctx.fill();
  ctx.strokeStyle = "rgba(238,150,78,0.38)";
  ctx.stroke();

  // The core still burning in the shaft, seen through the tear. Ley-teal,
  // pulsing on two frequencies so it flickers like something failing.
  var core = 0.62 + Math.sin(t * 2.3) * 0.18 + Math.sin(t * 5.9) * 0.08;
  ctx.fillStyle = menuRadial(0, -232, 4, 130, [
    [0.00, "rgba(150,255,232," + (0.55 * core).toFixed(3) + ")"],
    [0.45, "rgba(72,214,190," + (0.22 * core).toFixed(3) + ")"],
    [1.00, "rgba(30,120,120,0)"]
  ]);
  ctx.fillRect(-130, -362, 260, 260);
  ctx.beginPath();
  ctx.moveTo(-13, -160);
  ctx.lineTo(-20, -246);
  ctx.lineTo(0, -300);
  ctx.lineTo(20, -246);
  ctx.lineTo(13, -160);
  ctx.closePath();
  ctx.fillStyle = "rgba(120,246,220," + (0.20 * core).toFixed(3) + ")";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(158,255,236," + (0.86 * core).toFixed(3) + ")";
  ctx.stroke();
  ctx.restore();

  // Glyph rings turning around the shaft at different rates and tilts. Drawn
  // as arc segments rather than a dashed stroke so no browser's dash support
  // is load-bearing on the look.
  for (var ring = 0; ring < 3; ring++) {
    var ry2 = -150 - ring * 84;
    var rr = 96 - ring * 14;
    var spin = t * (0.22 + ring * 0.09) * (ring % 2 ? -1 : 1);
    ctx.lineWidth = 2;
    for (var g = 0; g < 14; g++) {
      var a0 = spin + (g / 14) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(0, ry2, rr, rr * 0.26, 0.04, a0, a0 + 0.20);
      ctx.strokeStyle = "rgba(" + (g % 4 === 0 ? "255,182,96" : "116,240,214") + "," +
        (0.30 + 0.24 * (1 + Math.sin(t * 1.3 + g))).toFixed(3) + ")";
      ctx.stroke();
    }
  }

  // Debris held up by the rings. Slow orbits, no two the same period.
  for (var d = 0; d < 7; d++) {
    var ang = t * (0.13 + menuNoise(d) * 0.1) + d * 1.7;
    var dx = Math.cos(ang) * (74 + menuNoise(d + 3) * 66);
    var dy = -120 - d * 34 + Math.sin(ang * 1.4 + d) * 13;
    var ds = 6 + menuNoise(d + 11) * 11;
    ctx.beginPath();
    ctx.moveTo(dx - ds, dy);
    ctx.lineTo(dx - ds * 0.3, dy - ds * 0.9);
    ctx.lineTo(dx + ds, dy - ds * 0.2);
    ctx.lineTo(dx + ds * 0.4, dy + ds * 0.8);
    ctx.closePath();
    ctx.fillStyle = "#1c1218";
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(116,240,214," +
      (0.30 + 0.2 * (1 + Math.sin(t * 1.9 + d))).toFixed(3) + ")";
    ctx.stroke();
  }
  ctx.restore();

  drawMenuRift(t, 232, 96, 150, 40, "132,246,222", 5.2);
}

// RIGHT BAY: a sky-relay that came down and was never recovered. Hull half
// buried, dish snapped off its mount and leaning, one salvaged panel still
// answering. Ember-lit, so the two bays are not the same colour of dead.
function drawMenuWreck(t) {
  ctx.save();
  ctx.translate(1082, MENU_HORIZON);

  ctx.beginPath();
  ctx.ellipse(-8, 20, 186, 30, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();

  // Hull, nose-down in the ash, its spine broken over a rise.
  ctx.save();
  ctx.rotate(-0.19);
  ctx.beginPath();
  ctx.moveTo(-172, 14);
  ctx.lineTo(-138, -58);
  ctx.lineTo(96, -96);
  ctx.lineTo(158, -54);
  ctx.lineTo(150, 10);
  ctx.closePath();
  ctx.fillStyle = menuLinear(0, -100, 0, 14, [
    [0.00, "#3a2620"],
    [0.60, "#241619"],
    [1.00, "#150d11"]
  ]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(240,152,74,0.34)";
  ctx.stroke();

  // Hull plating, and the tear where the spine gave way.
  for (var plate = 0; plate < 6; plate++) {
    ctx.strokeStyle = "rgba(232,140,70,0.13)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-140 + plate * 48, -56 - plate * 5);
    ctx.lineTo(-146 + plate * 48, 10);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(14, -92);
  ctx.lineTo(30, -46);
  ctx.lineTo(6, -30);
  ctx.lineTo(34, 8);
  ctx.strokeStyle = "rgba(255,146,64,0.5)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Ports along the flank, a couple of them still lit.
  for (var port = 0; port < 7; port++) {
    var live = menuNoise(port + 51) > 0.6;
    ctx.fillStyle = live
      ? "rgba(255,178,92," + (0.35 + 0.3 * (1 + Math.sin(t * 2.2 + port))).toFixed(3) + ")"
      : "rgba(38,24,26,0.9)";
    ctx.fillRect(-118 + port * 40, -60 - port * 4, 15, 10);
  }
  ctx.restore();

  // The dish, thrown clear and leaning on the wreck. Its feed horn still
  // sweeps -- the only thing on this screen still trying to do its job.
  ctx.save();
  ctx.translate(-34, -128);
  ctx.rotate(0.42);
  ctx.beginPath();
  ctx.ellipse(0, 0, 86, 40, 0, 0, Math.PI * 2);
  ctx.fillStyle = menuLinear(-86, -40, 86, 40, [
    [0.00, "#33221f"],
    [0.52, "#1e1417"],
    [1.00, "#2a1b1c"]
  ]);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(244,158,80,0.46)";
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-6, -3, 54, 22, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(244,158,80,0.20)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // A bite taken out of the rim.
  ctx.beginPath();
  ctx.moveTo(52, -20);
  ctx.lineTo(86, -4);
  ctx.lineTo(48, 14);
  ctx.closePath();
  ctx.fillStyle = "#120b0f";
  ctx.fill();

  var sweep = Math.sin(t * 0.8) * 0.5;
  ctx.save();
  ctx.rotate(sweep * 0.28);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(4, -66);
  ctx.strokeStyle = "rgba(250,178,104,0.72)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(4, -70, 6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,206,140," +
    (0.6 + 0.4 * (1 + Math.sin(t * 3.4)) * 0.5).toFixed(3) + ")";
  ctx.fill();
  ctx.restore();
  ctx.restore();

  // A salvaged panel bolted to the hull, still holding a signal. This is the
  // screen's one piece of working technology and it is doing it on scrap.
  ctx.save();
  ctx.translate(96, -104);
  ctx.rotate(-0.12);
  ctx.fillStyle = "rgba(10,8,12,0.88)";
  ctx.fillRect(-56, -34, 112, 68);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(116,240,214,0.42)";
  ctx.strokeRect(-55.5, -33.5, 111, 67);
  ctx.beginPath();
  ctx.moveTo(-44, 6);
  for (var s = -44; s <= 44; s += 8) {
    ctx.lineTo(s, 6 - Math.abs(Math.sin(s * 0.09 + t * 2.4)) * 22 *
      (0.4 + menuNoise(Math.floor(s / 8) + 3) * 0.6));
  }
  ctx.strokeStyle = "rgba(132,248,220,0.78)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = "rgba(116,240,214,0.5)";
  ctx.fillRect(-44, 20, 88 * (0.35 + 0.32 * (1 + Math.sin(t * 0.9))), 4);
  ctx.restore();
  ctx.restore();

  drawMenuRift(t, 1004, 62, 176, 52, "168,132,255", 7.7);
}

// The waste itself: ash flats, a broken road running out of frame, wreckage
// and the marker posts someone put up before they left.
function drawMenuGround(t) {
  ctx.fillStyle = menuLinear(0, MENU_HORIZON - 6, 0, VIEW_HEIGHT, [
    [0.00, "#31201c"],
    [0.24, "#1d1316"],
    [1.00, "#0a0709"]
  ]);
  ctx.fillRect(0, MENU_HORIZON - 6, VIEW_WIDTH, VIEW_HEIGHT - MENU_HORIZON + 6);

  // The lip of the horizon catches the last of the sun.
  ctx.fillStyle = "rgba(255,168,88,0.30)";
  ctx.fillRect(0, MENU_HORIZON - 7, VIEW_WIDTH, 2);

  // Road out of the frame, converging on the sun. Its edges are what give the
  // flats any depth at all.
  ctx.beginPath();
  ctx.moveTo(624, MENU_HORIZON - 4);
  ctx.lineTo(656, MENU_HORIZON - 4);
  ctx.lineTo(966, VIEW_HEIGHT);
  ctx.lineTo(314, VIEW_HEIGHT);
  ctx.closePath();
  ctx.fillStyle = menuLinear(0, MENU_HORIZON, 0, VIEW_HEIGHT, [
    [0.00, "rgba(96,62,48,0.85)"],
    [0.45, "rgba(58,38,34,0.75)"],
    [1.00, "rgba(30,20,22,0.7)"]
  ]);
  ctx.fill();
  ctx.strokeStyle = "rgba(238,150,80,0.30)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Broken centre line, running to the vanishing point. Perspective is in the
  // spacing: the dashes shorten and narrow toward the horizon, which is the
  // whole reason the flats have any depth.
  for (var dash = 0; dash < 9; dash++) {
    var near = dash / 8;
    var dy2 = MENU_HORIZON + 2 + near * near * (VIEW_HEIGHT - MENU_HORIZON) * 1.28;
    if (dy2 > VIEW_HEIGHT) break;
    var dl = 2 + near * near * 26;
    var dw2 = 1.5 + near * 6;
    ctx.fillStyle = "rgba(232,182,120," + (0.10 + near * 0.22).toFixed(3) + ")";
    ctx.fillRect(640 - dw2 / 2, dy2, dw2, dl);
  }

  // Fissures with ley-fire still burning in them. The ground is not merely
  // dark down here -- something is under it.
  for (var fis = 0; fis < 4; fis++) {
    var fx = 60 + fis * 380 + menuNoise(fis + 300) * 160;
    var fy = MENU_HORIZON + 22 + menuNoise(fis + 310) * 70;
    var glow = 0.5 + 0.25 * (1 + Math.sin(t * 1.1 + fis * 2.3));
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    var cx2 = fx;
    var cy2 = fy;
    for (var fseg = 1; fseg <= 5; fseg++) {
      cx2 += 14 + menuNoise(fis * 11 + fseg) * 34;
      cy2 += (menuNoise(fis * 13 + fseg) - 0.4) * 13;
      ctx.lineTo(cx2, cy2);
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,132,52," + (0.30 * glow).toFixed(3) + ")";
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(255,208,150," + (0.55 * glow).toFixed(3) + ")";
    ctx.stroke();
  }

  // Ash drifts and debris scattered across the flats, thinning with distance.
  for (var i = 0; i < 34; i++) {
    var dy = MENU_HORIZON + 6 + menuNoise(i + 90) * (VIEW_HEIGHT - MENU_HORIZON - 10);
    var depth = (dy - MENU_HORIZON) / (VIEW_HEIGHT - MENU_HORIZON);
    var dx = menuNoise(i + 140) * VIEW_WIDTH;
    var dw = (6 + menuNoise(i + 190) * 26) * (0.4 + depth);
    ctx.fillStyle = "rgba(12,8,11,0.75)";
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx + dw * 0.4, dy - dw * 0.42);
    ctx.lineTo(dx + dw, dy);
    ctx.closePath();
    ctx.fill();
  }

  // Leaning marker posts with cable strung between them.
  for (var post = 0; post < 5; post++) {
    var px = 90 + post * 268 + menuNoise(post + 200) * 40;
    var ph = 34 + menuNoise(post + 210) * 26;
    var lean = (menuNoise(post + 220) - 0.5) * 0.4;
    ctx.save();
    ctx.translate(px, MENU_HORIZON + 26 + post * 3);
    ctx.rotate(lean);
    ctx.fillStyle = "#0d090c";
    ctx.fillRect(-3, -ph, 6, ph);
    ctx.fillStyle = "rgba(255,164,84,0.30)";
    ctx.fillRect(-3, -ph, 6, 4);
    ctx.restore();
  }
}

// Ash falling through the whole frame. Sixty-four grains, each one a pure
// function of its index and the clock: nothing is stored, so this costs one
// loop a frame and no memory at all.
function drawMenuAsh(t) {
  for (var i = 0; i < 64; i++) {
    var fall = 14 + menuNoise(i) * 34;
    var y = ((menuNoise(i + 17) * 820 + t * fall) % 820) - 50;
    var x = (menuNoise(i + 29) * 1360 + t * (3 + menuNoise(i + 5) * 9)) % 1360 - 40 +
      Math.sin(t * 0.7 + i * 1.3) * 16;
    var size = 1 + menuNoise(i + 41) * 2.3;
    var near = size / 3.3;
    ctx.fillStyle = "rgba(226,206,182," + (0.10 + near * 0.22).toFixed(3) + ")";
    ctx.fillRect(x, y, size, size * 1.4);
  }
}

// Embers off the burning ground, rising and going out. Warm and short-lived,
// they are what keeps the bottom third of the screen alive under the type.
function drawMenuEmbers(t) {
  for (var i = 0; i < 26; i++) {
    var life = 4.5 + menuNoise(i + 3) * 4;
    var phase = ((t + menuNoise(i + 61) * life) % life) / life;
    var x = menuNoise(i + 77) * VIEW_WIDTH + Math.sin(t * 1.1 + i * 2.1) * 26;
    var y = VIEW_HEIGHT + 12 - phase * (200 + menuNoise(i + 91) * 240);
    var fade = Math.sin(phase * Math.PI);
    var r = 1.2 + menuNoise(i + 101) * 1.8;
    ctx.fillStyle = menuRadial(x, y, 0, r * 5, [
      [0.00, "rgba(255,196,120," + (0.62 * fade).toFixed(3) + ")"],
      [0.35, "rgba(255,128,48," + (0.24 * fade).toFixed(3) + ")"],
      [1.00, "rgba(255,96,32,0)"]
    ]);
    ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
    ctx.fillStyle = "rgba(255,232,190," + (0.85 * fade).toFixed(3) + ")";
    ctx.fillRect(x - r / 2, y - r / 2, r, r);
  }
}

// Everything laid over the world before the interface goes down: the calm
// centre the type needs, a vignette, dust haze, scanlines and grain.
function drawMenuAtmosphere(t) {
  drawMenuLayer("veil", drawMenuVeil);

  // A rolling band and grain over the top: the picture is coming off salvaged
  // glass. These two are all that is left live here -- everything static went
  // into the baked veil above.
  var roll = (t * 84) % (VIEW_HEIGHT + 220) - 110;
  ctx.fillStyle = menuLinear(0, roll, 0, roll + 110, [
    [0.00, "rgba(255,214,170,0)"],
    [0.50, "rgba(255,214,170,0.022)"],
    [1.00, "rgba(255,214,170,0)"]
  ]);
  ctx.fillRect(0, roll, VIEW_WIDTH, 110);

  // Grain. Twenty-eight specks, re-seeded four times a second -- enough to
  // sit on the picture, far short of a per-pixel noise pass.
  var tick = Math.floor(t * 4);
  for (var g = 0; g < 28; g++) {
    ctx.fillStyle = "rgba(255,236,208,0.05)";
    ctx.fillRect(menuNoise(g + tick * 31) * VIEW_WIDTH,
      menuNoise(g + tick * 57) * VIEW_HEIGHT, 2, 2);
  }
}

// The static half of the atmosphere, baked: the calm centre, both vignettes
// and the scanlines. Nothing here reads the clock.
function drawMenuVeil() {
  // THE CALM CENTRE. Without this the sun sits directly behind PLAY and the
  // title loses its edge against the sky. It is a veil, not a panel: the
  // scene still shows through it everywhere.
  ctx.fillStyle = menuRadial(640, 336, 40, 470, [
    [0.00, "rgba(8,5,10,0.72)"],
    [0.55, "rgba(8,5,10,0.44)"],
    [1.00, "rgba(8,5,10,0)"]
  ]);
  ctx.fillRect(140, -140, 1000, 960);

  ctx.fillStyle = menuLinear(0, 0, 0, VIEW_HEIGHT, [
    [0.00, "rgba(6,4,8,0.62)"],
    [0.30, "rgba(6,4,8,0)"],
    [0.76, "rgba(6,4,8,0)"],
    [1.00, "rgba(6,4,8,0.66)"]
  ]);
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  ctx.fillStyle = menuLinear(0, 0, VIEW_WIDTH, 0, [
    [0.00, "rgba(6,4,8,0.58)"],
    [0.22, "rgba(6,4,8,0)"],
    [0.78, "rgba(6,4,8,0)"],
    [1.00, "rgba(6,4,8,0.58)"]
  ]);
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.fillStyle = "rgba(206,178,150,0.020)";
  for (var scan = 2; scan < VIEW_HEIGHT; scan += 5) {
    ctx.fillRect(0, scan, VIEW_WIDTH, 1);
  }
}

// The frame: bracket corners cut from plate, and the two readouts that make
// the screen feel operated rather than designed.
function drawMenuFrame(t) {
  var corners = [[26, 26, 1, 1], [VIEW_WIDTH - 26, 26, -1, 1],
    [26, VIEW_HEIGHT - 26, 1, -1], [VIEW_WIDTH - 26, VIEW_HEIGHT - 26, -1, -1]];
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(240,150,78,0.42)";
  for (var c = 0; c < corners.length; c++) {
    var k = corners[c];
    ctx.beginPath();
    ctx.moveTo(k[0], k[1] + 34 * k[3]);
    ctx.lineTo(k[0], k[1]);
    ctx.lineTo(k[0] + 34 * k[2], k[1]);
    ctx.stroke();
  }

  // Left readout, stencilled on a scrap plate.
  ctx.fillStyle = "rgba(9,6,10,0.80)";
  ctx.beginPath();
  ctx.moveTo(44, 40);
  ctx.lineTo(258, 40);
  ctx.lineTo(268, 56);
  ctx.lineTo(268, 100);
  ctx.lineTo(54, 100);
  ctx.lineTo(44, 84);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(240,150,78,0.36)";
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "20px " + MENU_DISPLAY_FONT;
  ctx.fillStyle = "#f0a45c";
  drawMenuText("ASH SECTOR VII", 60, 60, 1.6);
  ctx.font = "9px " + MENU_TECH_FONT;
  ctx.fillStyle = "rgba(186,158,140,0.62)";
  drawMenuText("LEY-CORE UNSTABLE", 60, 80, 1.2);
  // Two bars: one ember, one ley, the second one always losing ground.
  ctx.fillStyle = "rgba(240,150,78,0.75)";
  ctx.fillRect(60, 89, 84, 3);
  ctx.fillStyle = "rgba(116,240,214,0.5)";
  ctx.fillRect(150, 89, 40 + Math.sin(t * 0.9) * 22, 3);
}

function drawMenuBackdrop() {
  var t = menuClock();

  drawMenuSky(t);
  drawMenuIslands(t);
  drawMenuSkyline(t);
  drawMenuGround(t);
  drawMenuPylon(t);
  drawMenuWreck(t);
  drawMenuAsh(t);
  drawMenuEmbers(t);
  drawMenuAtmosphere(t);
  drawMenuFrame(t);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// The plate every control is cut from: a rectangle with the top-left and
// bottom-right corners sheared off. Two cuts rather than four, because four
// reads as a rounded sci-fi pill and two reads as a piece of hull that was cut
// to fit. The path follows `r` exactly, so what is drawn and what is clicked
// are the same shape.
function menuPlatePath(r, cut, dx, dy) {
  var x = r.x + (dx || 0);
  var y = r.y + (dy || 0);
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + r.w, y);
  ctx.lineTo(x + r.w, y + r.h - cut);
  ctx.lineTo(x + r.w - cut, y + r.h);
  ctx.lineTo(x, y + r.h);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

// A control is a salvaged plate with a rune slot bolted to it: sheared
// corners, rivets, rust bleeding down from the seams, a stencilled label and
// one live edge of ley-light that fills when the cursor is on it. `rgb` is the
// plate's accent, and it is the ONLY colour that changes between them -- the
// iron underneath is identical, so the four read as parts off the same wreck.
//
// The signature is unchanged (r, label, key, rgb, primary): the title screen
// test counts calls through it, and the hit rectangles are still the callers'.
function drawMenuButton(r, label, key, rgb, primary) {
  var hot = pointInRect(mouse.x, mouse.y, r);
  var t = menuClock();
  var detail = label === "PLAY" ? "HOLD THE LAST GATE"
    : (label === "ARMOURY" ? "SALVAGE & LOADOUT"
    : (label === "INDEX" ? "FIELD RECORDS" : "TEST RANGE"));
  var cut = primary ? 22 : 14;
  // The primary breathes; the rail lights only under the cursor. One ambient
  // pulse on the screen's controls, as before -- the scene carries the rest.
  var pulse = primary ? 0.5 + Math.sin(t * 1.9) * 0.5 : 0;
  var live = hot ? 1 : (primary ? 0.25 + pulse * 0.3 : 0);

  // Ley-light bleeding out from under the plate.
  if (live > 0.02) {
    ctx.fillStyle = menuRadial(r.x + r.w / 2, r.y + r.h / 2, r.h * 0.3,
      r.w * 0.72, [
        [0.00, "rgba(" + rgb + "," + (0.30 * live).toFixed(3) + ")"],
        [1.00, "rgba(" + rgb + ",0)"]
      ]);
    ctx.fillRect(r.x - r.w * 0.4, r.y - r.h, r.w * 1.8, r.h * 3);
  }

  // Cast shadow, then the plate.
  menuPlatePath(r, cut, 5, 7);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();

  menuPlatePath(r, cut, 0, 0);
  ctx.fillStyle = menuLinear(r.x, r.y, r.x, r.y + r.h, [
    [0.00, hot ? "#3b2f2a" : "#2a221f"],
    [0.46, hot ? "#241b1c" : "#191315"],
    [1.00, hot ? "#2e2020" : "#140e11"]
  ]);
  ctx.fill();

  ctx.save();
  ctx.clip();

  // Rolled iron: horizontal mill lines, then rust running down from the top
  // seam. Both come off the hash, so a plate's wear is its own and never
  // shimmers between frames.
  ctx.fillStyle = "rgba(255,222,196,0.022)";
  for (var mill = 4; mill < r.h; mill += 7) ctx.fillRect(r.x, r.y + mill, r.w, 1);
  for (var streak = 0; streak < 7; streak++) {
    var sx = r.x + 12 + menuNoise(streak + r.w) * (r.w - 24);
    ctx.fillStyle = "rgba(148,74,38,0.13)";
    ctx.fillRect(sx, r.y, 2 + menuNoise(streak + 9) * 3,
      r.h * (0.3 + menuNoise(streak + 21) * 0.6));
  }

  // Hazard chevrons in the sheared bottom-right corner: the salvage marking
  // that says which end of the plate was cut.
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x + r.w - 46, r.y + r.h - 12, 46, 12);
  ctx.clip();
  ctx.strokeStyle = "rgba(240,150,78,0.30)";
  ctx.lineWidth = 4;
  for (var hz = -20; hz < 60; hz += 11) {
    ctx.beginPath();
    ctx.moveTo(r.x + r.w - 46 + hz, r.y + r.h);
    ctx.lineTo(r.x + r.w - 46 + hz + 12, r.y + r.h - 12);
    ctx.stroke();
  }
  ctx.restore();

  // The live edge: a bar of ley-light along the foot of the plate that fills
  // from the left as the control comes alive.
  ctx.fillStyle = "rgba(" + rgb + "," + (0.20 + live * 0.7).toFixed(3) + ")";
  ctx.fillRect(r.x, r.y + r.h - 3, r.w * (0.18 + live * 0.82), 3);

  // A charge running up the left flank, hover only. It is the plate waking up,
  // and it is why a hovered control feels powered rather than merely tinted.
  if (hot) {
    var runY = r.y + r.h - ((t * 190) % (r.h + 40));
    ctx.fillStyle = menuLinear(r.x, runY, r.x, runY + 34, [
      [0.00, "rgba(" + rgb + ",0)"],
      [0.50, "rgba(" + rgb + ",0.55)"],
      [1.00, "rgba(" + rgb + ",0)"]
    ]);
    ctx.fillRect(r.x, runY, 6, 34);
  }
  ctx.restore();

  // Edges: a hard dark outline with the accent riding just inside it.
  menuPlatePath(r, cut, 0, 0);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(6,4,7,0.9)";
  ctx.stroke();
  ctx.lineWidth = hot ? 2 : 1.2;
  ctx.strokeStyle = "rgba(" + rgb + "," + (hot ? 0.95 : 0.44) + ")";
  ctx.stroke();

  // Rivets. Four on the rail plates, six on the primary, each a dark pit with
  // a highlight on the sunward side.
  var rivets = primary
    ? [[cut + 8, 10], [r.w / 2, 9], [r.w - 11, 12], [10, r.h - 11],
       [r.w / 2, r.h - 9], [r.w - cut - 8, r.h - 11]]
    : [[cut + 6, 9], [r.w - 10, 10], [9, r.h - 10], [r.w - cut - 6, r.h - 9]];
  for (var v = 0; v < rivets.length; v++) {
    var vx = r.x + rivets[v][0];
    var vy = r.y + rivets[v][1];
    ctx.beginPath();
    ctx.arc(vx, vy, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8,5,8,0.85)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(vx - 0.7, vy - 0.9, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(226,178,140,0.35)";
    ctx.fill();
  }

  // The rune slot: a hexagonal socket holding the hotkey. It replaces the old
  // square key chip because the hotkeys on this screen are the one place the
  // arcane side of the fiction touches the interface.
  var socketX = r.x + (primary ? 34 : 27);
  var socketY = r.y + r.h / 2;
  var socketR = primary ? 20 : 15;
  ctx.beginPath();
  for (var h = 0; h < 6; h++) {
    var ha = -Math.PI / 2 + h * Math.PI / 3;
    var hx = socketX + Math.cos(ha) * socketR;
    var hy = socketY + Math.sin(ha) * socketR;
    if (h === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(" + rgb + "," + (0.10 + live * 0.16).toFixed(3) + ")";
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "rgba(" + rgb + "," + (0.5 + live * 0.45).toFixed(3) + ")";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = (primary ? "21px " : "16px ") + MENU_DISPLAY_FONT;
  ctx.fillStyle = "rgba(" + rgb + "," + (0.72 + live * 0.28).toFixed(3) + ")";
  ctx.fillText(key, socketX, socketY + 1);

  // Stencilled label. Impact, tracked, with a dark stamp under it so it looks
  // sprayed onto plate rather than typeset over it.
  var textX = r.x + (r.w + (primary ? 54 : 40)) / 2;
  var labelY = r.y + r.h / 2 - (primary ? 11 : 8);
  ctx.font = (primary ? "42px " : "22px ") + MENU_DISPLAY_FONT;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  drawMenuText(label, textX + 2, labelY + 2, primary ? 7 : 4);
  ctx.fillStyle = hot ? "#fff3e2" : "#e8d3bd";
  drawMenuText(label, textX, labelY, primary ? 7 : 4);

  ctx.font = (primary ? "10px " : "9px ") + MENU_TECH_FONT;
  ctx.fillStyle = "rgba(" + rgb + "," + (hot ? 0.92 : 0.62) + ")";
  drawMenuText(detail, textX, r.y + r.h / 2 + (primary ? 22 : 13), 1.6);
}

function drawMenu() {
  drawMenuBackdrop();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // THE TITLE IS STAMPED PLATE, not type over a picture: an ember bloom
  // behind it, a black stamp under it, a bone-to-rust face, and a scored edge.
  //
  // The block still sits at 188 and every offset below is still expressed
  // against `titleY`, for the reason recorded when the strap line was deleted
  // on 2026-08-13 -- it was removed at the owner's request, the block moved
  // down by exactly that line box to keep the gap to PLAY at 80, and it is
  // meant to keep moving as one thing. Nothing here reintroduces a line
  // under the rule.
  var titleY = 188;
  var t = menuClock();

  ctx.fillStyle = menuRadial(VIEW_WIDTH / 2, titleY, 30, 380, [
    [0.00, "rgba(238,132,54," + (0.14 + Math.sin(t * 0.8) * 0.03).toFixed(3) + ")"],
    [1.00, "rgba(238,132,54,0)"]
  ]);
  ctx.fillRect(VIEW_WIDTH / 2 - 380, titleY - 380, 760, 760);

  ctx.font = "78px " + MENU_DISPLAY_FONT;
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  drawMenuText("TOWER DEFENSE", VIEW_WIDTH / 2 + 6, titleY + 6, 7);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(120,48,24,0.85)";
  drawMenuText("TOWER DEFENSE", VIEW_WIDTH / 2, titleY, 7, true);
  ctx.fillStyle = menuLinear(0, titleY - 34, 0, titleY + 32, [
    [0.00, "#fdf0dc"],
    [0.48, "#e6c39a"],
    [0.72, "#c0703a"],
    [1.00, "#8a3f22"]
  ]);
  var titleW = drawMenuText("TOWER DEFENSE", VIEW_WIDTH / 2, titleY, 7);

  // Scoring across the face: four hairlines of the sky showing through where
  // the plate has been worn back. Cheap weathering, and the reason the title
  // does not read as a clean vector letterform.
  ctx.save();
  ctx.beginPath();
  ctx.rect(VIEW_WIDTH / 2 - titleW / 2, titleY - 30, titleW, 60);
  ctx.clip();
  ctx.lineWidth = 1.4;
  for (var sc = 0; sc < 5; sc++) {
    ctx.strokeStyle = "rgba(18,10,14," + (0.20 + menuNoise(sc + 5) * 0.2).toFixed(3) + ")";
    ctx.beginPath();
    ctx.moveTo(VIEW_WIDTH / 2 - titleW / 2 - 10,
      titleY - 26 + menuNoise(sc) * 54);
    ctx.lineTo(VIEW_WIDTH / 2 + titleW / 2 + 10,
      titleY - 26 + menuNoise(sc + 40) * 54);
    ctx.stroke();
  }
  ctx.restore();

  // The rule: two ember bars with a ley node burning between them.
  var ruleY = titleY + 42;
  ctx.fillStyle = "rgba(238,142,64,0.7)";
  ctx.fillRect(VIEW_WIDTH / 2 - 168, ruleY, 138, 2);
  ctx.fillRect(VIEW_WIDTH / 2 + 30, ruleY, 138, 2);
  var node = 0.6 + Math.sin(t * 2.2) * 0.25;
  ctx.beginPath();
  for (var nh = 0; nh < 6; nh++) {
    var na = -Math.PI / 2 + nh * Math.PI / 3;
    var nx = VIEW_WIDTH / 2 + Math.cos(na) * 9;
    var ny = ruleY + 1 + Math.sin(na) * 9;
    if (nh === 0) ctx.moveTo(nx, ny);
    else ctx.lineTo(nx, ny);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(116,240,214," + (0.25 * node).toFixed(3) + ")";
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "rgba(150,255,232," + node.toFixed(3) + ")";
  ctx.stroke();

  ctx.font = "16px " + MENU_DISPLAY_FONT;
  ctx.fillStyle = "rgba(240,150,78,0.78)";
  drawMenuText("THE LEY-LINES ARE BURNING", VIEW_WIDTH / 2, titleY - 58, 4.5);
  ctx.font = "11px " + MENU_TECH_FONT;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  drawMenuText("SELECT DIRECTIVE", VIEW_WIDTH / 2 + 1, 295, 3.4);
  ctx.fillStyle = "rgba(146,250,224,0.86)";
  drawMenuText("SELECT DIRECTIVE", VIEW_WIDTH / 2, 294, 3.4);

  drawMenuButton(playButtonRect(), "PLAY", "1", "255,146,60", true);
  drawMenuButton(storeButtonRect(), "ARMOURY", "2", "230,168,84", false);
  drawMenuButton(indexButtonRect(), "INDEX", "3", "116,240,214", false);
  drawMenuButton(sandboxButtonRect(), "SANDBOX", "4", "168,132,255", false);

  // The salvage chit, top right. On the title screen because that is where the
  // decision it funds gets made, and because a currency you cannot see is a
  // currency nobody spends.
  var purse = { x: VIEW_WIDTH - 268, y: 40, w: 224, h: 60 };
  menuPlatePath(purse, 14, 0, 0);
  ctx.fillStyle = "rgba(9,6,10,0.82)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(230,168,84,0.42)";
  ctx.stroke();
  ctx.textAlign = "right";
  ctx.font = "30px " + MENU_DISPLAY_FONT;
  ctx.fillStyle = "#ffbe72";
  drawMenuText(MetaProgress.coins() + " ⬡", VIEW_WIDTH - 62, 62, 2);
  ctx.font = "9px " + MENU_TECH_FONT;
  ctx.fillStyle = "rgba(186,158,140,0.6)";
  drawMenuText("SALVAGE CREDIT", VIEW_WIDTH - 62, 84, 1.4);
  ctx.textAlign = "center";

  ctx.font = "11px " + MENU_TECH_FONT;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  drawMenuText("ENTER / 1 PLAY   ·   2 ARMOURY   ·   3 INDEX   ·   4 SANDBOX",
    VIEW_WIDTH / 2 + 1, 649, 1.8);
  ctx.fillStyle = "rgba(236,208,180,0.92)";
  drawMenuText("ENTER / 1 PLAY   ·   2 ARMOURY   ·   3 INDEX   ·   4 SANDBOX",
    VIEW_WIDTH / 2, 648, 1.8);
  ctx.font = "9px " + MENU_TECH_FONT;
  ctx.fillStyle = "rgba(196,150,116,0.72)";
  drawMenuText("LEYLINE DEFENSE NETWORK   //   RELAY 04.11   //   SIGNAL DEGRADED",
    VIEW_WIDTH / 2, 680, 1.6);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// The "← Menu" escape hatch, top-left. Shared by the chooser and the index
// screen -- one drawing, one rectangle, so the two screens cannot drift on
// how leaving looks or where it is clicked.
// --- THE ASH WASTE, EVERYWHERE ELSE -----------------------------------------
//
// 2026-08-26, at the owner's instruction: *"arrange the other Menu UI's to
// match the main menu theme."* The title screen became the Ash Waste on
// 2026-08-25 and the chooser, index, armoury, pause menu and run-over overlays
// were explicitly deferred to a later pass. This is that pass.
//
// THE SCREENS ALREADY SHARED TWO FUNCTIONS, AND THAT IS WHY THIS IS SMALL.
// `drawSelectBackdrop` and `drawBackButton` are called by the chooser, by
// js/codex.js and by js/store.js -- three screens, one backdrop, one control --
// so re-theming those two re-themes all three, and nothing in the index's or
// the armoury's own layout had to move for the change to reach them. Anything
// that had to be reinvented per screen would have drifted by the second one.
//
// AN INTERIOR IS NOT THE TITLE SCREEN AND MUST NOT BE. The title screen is a
// composition: a fractured pylon in the left bay, a downed relay in the right,
// a rift, and four controls between them. These screens are DENSE -- six route
// cards, an enemy list with a live 3D viewer, a shop grid -- and a scene behind
// them is not atmosphere, it is noise competing with the content for the same
// pixels. So an interior keeps the theme's SURFACE and drops its subject:
// the burnt sky, the horizon heat, the ground, the ash, the vignette and the
// corner frame; no pylon, no wreck, no rift, no skyline.
//
// PALETTE, and it is the title screen's own rather than a second one. Ash and
// rust are the surfaces, ember orange and bone the warm accents, ley-teal the
// only cool one, and it marks arcane energy and nothing else. Named here
// because six functions below and two other FILES read them, and six copies of
// "rgba(240,150,78,0.42)" is how a theme comes apart.
var ASH_EMBER = "240,150,78";        // the accent: heat, and every live edge
var ASH_LEY = "116,240,214";         // arcane only -- never furniture
var ASH_BONE = "236,222,206";        // type that has to be read
var ASH_DUST = "186,158,140";        // type that is only there to be there
var ASH_IRON = "16,13,17";           // the plate every control is cut from

// One ambient clock for the interiors, so a tab and a card and a button all
// breathe together rather than each on its own phase.
function ashPulse(hz) {
  return 0.5 + Math.sin(menuClock() * (hz || 1.4)) * 0.5;
}

// THE INTERIOR BACKDROP. Baked through the same `drawMenuLayer` machinery the
// title screen uses -- none of it reads the clock except the ash, so painting
// the rest sixty times a second would be the exact waste that pass measured
// and fixed (72 ms a frame down to a blit).
function drawAshInterior() {
  drawMenuLayer("interior", paintAshInterior);
  drawAshFall(menuClock());
  drawAshFrame();
}

function paintAshInterior() {
  // Sky: night overhead, a bruised middle, ember heat sitting on the horizon.
  // The horizon is pushed far down an interior -- the content sits over the
  // upper two thirds, so the scene's only bright band belongs below it.
  var horizon = 596;
  ctx.fillStyle = menuLinear(0, 0, 0, horizon, [
    [0, "#08070c"], [0.42, "#140f16"], [0.74, "#2a1720"], [1, "#5c2f22"]
  ]);
  ctx.fillRect(0, 0, VIEW_WIDTH, horizon);

  // The sun, gone down behind whatever is left of the skyline.
  ctx.fillStyle = menuRadial(VIEW_WIDTH / 2, horizon, 10, 300, [
    [0, "rgba(255,178,96,0.34)"], [0.45, "rgba(216,104,58,0.14)"],
    [1, "rgba(216,104,58,0)"]
  ]);
  ctx.fillRect(VIEW_WIDTH / 2 - 300, horizon - 300, 600, 302);

  // Ground: dark, flat, and lit only by what is behind it.
  ctx.fillStyle = menuLinear(0, horizon, 0, VIEW_HEIGHT, [
    [0, "#1a1114"], [1, "#0a0709"]
  ]);
  ctx.fillRect(0, horizon, VIEW_WIDTH, VIEW_HEIGHT - horizon);
  ctx.fillStyle = "rgba(240,150,78,0.20)";
  ctx.fillRect(0, horizon - 1, VIEW_WIDTH, 2);

  // Dust drifts, deterministic like everything else on this theme.
  for (var i = 0; i < 26; i++) {
    var dy = horizon + 6 + menuNoise(i + 90) * (VIEW_HEIGHT - horizon - 8);
    var depth = (dy - horizon) / (VIEW_HEIGHT - horizon);
    ctx.fillStyle = "rgba(150,120,104," + (0.03 + depth * 0.05).toFixed(3) + ")";
    ctx.fillRect(menuNoise(i + 40) * VIEW_WIDTH - 120, dy,
      110 + menuNoise(i + 150) * 240, 1 + depth * 2);
  }

  // The veil: a vignette, and a calm middle so dense content never has to
  // fight the sky for contrast. This is the layer the title screen measured at
  // 37 ms; here it is baked with the rest.
  ctx.fillStyle = menuRadial(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, 120, 760, [
    [0, "rgba(6,5,8,0.30)"], [0.55, "rgba(6,5,8,0.52)"], [1, "rgba(6,5,8,0.86)"]
  ]);
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  // Static scanlines, one device pixel each because this is baked at the
  // backing store's own resolution.
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  for (var y = 0; y < VIEW_HEIGHT; y += 3) ctx.fillRect(0, y, VIEW_WIDTH, 1);
}

// The one live layer: ash coming down. Cheap -- 40 marks, no gradient.
function drawAshFall(t) {
  for (var i = 0; i < 40; i++) {
    var speed = 12 + menuNoise(i + 7) * 26;
    var x = menuNoise(i) * VIEW_WIDTH + Math.sin(t * 0.4 + i) * 14;
    var y = (menuNoise(i + 3) * VIEW_HEIGHT + t * speed) % (VIEW_HEIGHT + 40) - 20;
    ctx.fillStyle = "rgba(206,186,170," +
      (0.05 + menuNoise(i + 11) * 0.13).toFixed(3) + ")";
    ctx.fillRect(x, y, 1.5, 1.5 + menuNoise(i + 19) * 2);
  }
}

// Corner brackets, the title screen's own, so every screen is cut from the
// same frame.
function drawAshFrame() {
  var corners = [[26, 26, 1, 1], [VIEW_WIDTH - 26, 26, -1, 1],
    [26, VIEW_HEIGHT - 26, 1, -1], [VIEW_WIDTH - 26, VIEW_HEIGHT - 26, -1, -1]];
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(" + ASH_EMBER + ",0.34)";
  for (var c = 0; c < corners.length; c++) {
    var k = corners[c];
    ctx.beginPath();
    ctx.moveTo(k[0], k[1] + 28 * k[3]);
    ctx.lineTo(k[0], k[1]);
    ctx.lineTo(k[0] + 28 * k[2], k[1]);
    ctx.stroke();
  }
}

// A STENCILLED SCREEN HEADING: Impact, tracked, with a rule under it that is
// measured off the type rather than guessed. `sub` is the instrument-face line
// that says what the screen is for.
//
// THE SUB GOES ABOVE THE TITLE WHEN THE SCREEN HAS A TAB ROW, and that is not
// a taste -- it is a collision. The index and the armoury put their tabs at
// y = 78, and a heading at y = 26 with its rule at 66 leaves the sub landing
// on top of them. Two screens out of four wanted it above, so it is an
// argument rather than two hand-placed y values that would come apart the
// first time a tab row moves.
function drawAshHeading(title, sub, y, eyebrow) {
  var top = y === undefined ? 34 : y;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  if (sub && eyebrow) {
    ctx.font = "9px " + MENU_TECH_FONT;
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.6)";
    drawMenuText(sub, VIEW_WIDTH / 2, top, 2.2);
    top += 14;
  }

  ctx.font = "34px " + MENU_DISPLAY_FONT;
  ctx.fillStyle = "#f6d9b4";
  var w = drawMenuText(title, VIEW_WIDTH / 2, top, 4);

  // The rule: ember at the centre, gone at both ends, so it reads as heat in
  // the metal rather than as a divider somebody drew.
  var half = w / 2 + 26;
  ctx.fillStyle = menuLinear(VIEW_WIDTH / 2 - half, 0, VIEW_WIDTH / 2 + half, 0, [
    [0, "rgba(" + ASH_EMBER + ",0)"], [0.5, "rgba(" + ASH_EMBER + ",0.7)"],
    [1, "rgba(" + ASH_EMBER + ",0)"]
  ]);
  ctx.fillRect(VIEW_WIDTH / 2 - half, top + 40, half * 2, 2);

  if (sub && !eyebrow) {
    ctx.font = "10px " + MENU_TECH_FONT;
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.66)";
    drawMenuText(sub, VIEW_WIDTH / 2, top + 48, 1.4);
  }
  ctx.textAlign = "left";
}

// A SALVAGED PLATE. The shape every panel, card and tab on these screens is
// cut from -- `menuPlatePath`'s two sheared corners, so the interiors and the
// title screen are the same piece of hull.
//
// `opts`: { accent, live (0..1), fill, cut, quiet }. `live` is the edge light,
// and it is the only thing that moves between a resting control and a hot one.
function drawAshPlate(r, opts) {
  var o = opts || {};
  var accent = o.accent || ASH_EMBER;
  var live = o.live || 0;
  var cut = o.cut === undefined ? 12 : o.cut;

  menuPlatePath(r, cut, 0, 3);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fill();

  menuPlatePath(r, cut, 0, 0);
  ctx.fillStyle = o.fill || menuLinear(r.x, r.y, r.x, r.y + r.h, [
    [0, "rgba(38,30,34,0.94)"], [0.55, "rgba(22,17,21,0.94)"],
    [1, "rgba(13,10,13,0.96)"]
  ]);
  ctx.fill();
  ctx.lineWidth = o.quiet ? 1 : 1.5;
  ctx.strokeStyle = "rgba(" + accent + "," + (0.20 + live * 0.62).toFixed(3) + ")";
  ctx.stroke();

  // The live edge: one lit run along the bottom, which is the title screen's
  // rune slot reduced to the part that reads at this size.
  if (live > 0.01) {
    ctx.save();
    menuPlatePath(r, cut, 0, 0);
    ctx.clip();
    ctx.fillStyle = "rgba(" + accent + "," + (live * 0.5).toFixed(3) + ")";
    ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
    ctx.restore();
  }

  // Rivets, top-right and bottom-left, on the corners that were NOT sheared.
  if (!o.quiet) {
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.28)";
    ctx.fillRect(r.x + r.w - 9, r.y + 5, 2, 2);
    ctx.fillRect(r.x + 7, r.y + r.h - 7, 2, 2);
  }
}

// A control cut from that plate. `detail` is optional small print under the
// label; `accent` defaults to ember.
function drawAshControl(r, label, opts) {
  var o = opts || {};
  var hot = pointInRect(mouse.x, mouse.y, r);
  var live = o.disabled ? 0
    : (hot ? 1 : (o.primary ? 0.22 + ashPulse(1.9) * 0.28 : (o.active ? 0.55 : 0)));
  var accent = o.accent || ASH_EMBER;

  drawAshPlate(r, { accent: accent, live: live, cut: o.primary ? 18 : 10 });

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  var mid = r.y + r.h / 2 + (o.detail ? -6 : 1);
  ctx.font = (o.primary ? "22px " : "16px ") + MENU_DISPLAY_FONT;
  ctx.fillStyle = o.disabled ? "rgba(" + ASH_DUST + ",0.38)"
    : (hot || o.active ? "#ffe6c4" : "rgba(" + ASH_BONE + ",0.86)");
  drawMenuText(label, r.x + r.w / 2, mid, o.primary ? 2.4 : 1.4);

  if (o.detail) {
    ctx.font = "9px " + MENU_TECH_FONT;
    ctx.fillStyle = "rgba(" + ASH_DUST + "," + (hot ? 0.8 : 0.5) + ")";
    drawMenuText(o.detail, r.x + r.w / 2, r.y + r.h / 2 + 10, 1.1);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// SHARED BY THREE SCREENS -- the chooser, js/codex.js and js/store.js all call
// it -- which is why re-cutting it here re-cuts it on all of them.
function drawBackButton() {
  drawAshControl(backButtonRect(), "\u2190 MENU", {});
}

function drawMapSelect() {
  drawSelectBackdrop();
  drawBackButton();

  drawAshHeading("CHOOSE YOUR RUN", "SELECT A LEY-LINE", 40);

  for (var i = 0; i < Maps.LIST.length; i++) drawMapCard(i);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "10px " + MENU_TECH_FONT;
  ctx.fillStyle = "rgba(" + ASH_DUST + ",0.55)";
  drawMenuText("CLICK A ROUTE OR PRESS 1 - " + Maps.LIST.length,
    VIEW_WIDTH / 2, mapGridBottom() + 18, 1.4);

  ctx.textAlign = "left";
}

// THE BACKDROP EVERY INTERIOR SCREEN SITS ON -- the chooser, the index and the
// armoury, which is the whole reason it is one function.
//
// It was a faint blue circuit lattice until 2026-08-26. That was the old
// screen's language and it survived the title screen's rebuild by not being
// looked at, which left the game opening on a burnt sky and then cutting to a
// sci-fi grid the moment anything was clicked. `drawAshInterior` is the same
// theme's surface without its subject -- see the block above it for why an
// interior does not get the pylon and the wreck.
function drawSelectBackdrop() {
  drawAshInterior();
}

// The route card.
//
// SINCE 2026-08-01 THE CARD IS MOSTLY THE MAP (at the owner's request: "make
// it so that the maps showed when choosing the map look exactly like the map
// we're playing in"). It used to be a header, an abstract route line on a dark
// swatch, and four stat rows. The abstract line was the problem: it drew the
// polyline in the difficulty band's colour on a flat backdrop, so every map
// looked like every other map in a different tint and none of them looked like
// the thing you were about to play. Terrain, road width, theme -- everything
// that actually makes a route recognisable -- was absent.
//
// The layout that follows is what a 16:9 render costs. A thumbnail of a
// 1280x720 battlefield at the card's width is 191 px tall, which is most of a
// 240 px card, so the two things that used to sit under it moved ONTO it:
//
//   the blurb  a band across the top of the render
//   the stats  a 2x2 grid in a band across the bottom
//
// Both bands are translucent, so the map reads through them, and both are
// interface chrome sitting OVER the picture rather than beside it -- the same
// arrangement the in-game HUD has with the battlefield. Only the name, the
// difficulty badge and the score are outside the render now.
function drawMapCard(i) {
  var map = Maps.LIST[i];
  var a = Maps.analyse(map);
  var r = mapCardRect(i);
  var tier = TIER_COLOURS[a.tier];
  var hot = mapCardAt(mouse.x, mouse.y) === i;

  // THE CARD IS A SALVAGED PLATE, and the map render inside it is untouched --
  // "make it so that the maps showed when choosing the map look exactly like
  // the map we're playing in" is a 2026-08-01 ruling and re-theming the chrome
  // must not walk it back. What changed is the frame around the picture.
  // The plate takes the ROUTE'S OWN BAND as its accent, so the difficulty is
  // legible from the card's edge before any text is read.
  drawAshPlate(r, { accent: tier.rgb, live: hot ? 0.85 : 0, cut: 14 });

  // Hotkey, top-left, same convention as a build slot.
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "10px " + MENU_TECH_FONT;
  ctx.fillStyle = "rgba(" + ASH_DUST + ",0.55)";
  ctx.fillText(String(i + 1), r.x + 10, r.y + 21);

  ctx.font = "19px " + MENU_DISPLAY_FONT;
  ctx.fillStyle = hot ? "#ffe6c4" : "#e9dccb";
  // Measured against where the badge starts, not eyeballed: the badge is
  // 86 px, the score's column 52, and both are anchored to the right edge.
  ctx.fillText(fitText(ctx, map.name, r.w - 192), r.x + 22, r.y + 21);

  // Tier badge and score, right-aligned on the same line as the name.
  var badge = { x: r.x + r.w - 16 - 52 - 8 - 86, y: r.y + 10, w: 86, h: 22 };
  ctx.fillStyle = tier.fill;
  ctx.fillRect(badge.x, badge.y, badge.w, badge.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = tier.line;
  ctx.strokeRect(badge.x + 0.5, badge.y + 0.5, badge.w - 1, badge.h - 1);

  ctx.textAlign = "center";
  ctx.font = "10px " + MENU_TECH_FONT;
  ctx.fillStyle = tier.text;
  drawMenuText(a.tier.toUpperCase(), badge.x + badge.w / 2,
    badge.y + badge.h / 2 + 1, 1.6);

  // Two maps can share a band, and this is what tells them apart.
  ctx.textAlign = "right";
  ctx.font = "16px " + MENU_DISPLAY_FONT;
  ctx.fillStyle = tier.text;
  ctx.fillText(a.score.toFixed(2), r.x + r.w - 16, badge.y + badge.h / 2 + 1);

  // The render. 16:9 exactly, because that is the viewport's shape and a
  // preview in any other shape is not the map.
  var view = mapPreviewRect(r);
  drawMapThumbnail(map, view);

  ctx.textBaseline = "top";

  // The blurb, in a band across the top of the render.
  ctx.fillStyle = "rgba(8,10,16,0.62)";
  ctx.fillRect(view.x, view.y, view.w, 22);
  ctx.textAlign = "left";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(219,231,255,0.78)";
  ctx.fillText(fitText(ctx, map.blurb.join(" "), view.w - 20), view.x + 10, view.y + 6);

  // The stats, in a 2x2 grid across the bottom of it. Two columns rather than
  // the old four stacked rows purely because the band is 52 px and four rows
  // are not; the pairs are the same four figures in the same order.
  var rows = [
    ["Route length", Math.round(a.lengthUl) + " u.l."],
    ["Walked in", a.crossingSeconds.toFixed(0) + " s"],
    ["Entrances", String(a.routeCount)],
    ["Road per Rifleman", a.goodCoverageUl.toFixed(1) + " u.l."]
  ];
  // THE NUMBER IS FITTED FIRST AND THE LABEL TAKES WHAT IS LEFT.
  //
  // It used to be the other way round, which was invisible while a card was
  // 372 px wide and became the whole point at 296: the label ate its 62 % and
  // "2153.8 u.l." was clipped to "215...". A truncated LABEL is still legible
  // from its column and its neighbours; a truncated NUMBER is not a number.
  // So the value is the one that gets its width reserved.
  var statsH = 52;
  var statsY = view.y + view.h - statsH;
  ctx.fillStyle = "rgba(8,10,16,0.72)";
  ctx.fillRect(view.x, statsY, view.w, statsH);

  var colW = (view.w - 20) / 2;
  for (var row = 0; row < rows.length; row++) {
    var cx = view.x + 10 + (row % 2) * colW;
    var cy = statsY + 8 + Math.floor(row / 2) * 22;

    ctx.textAlign = "right";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = "#dce6f8";
    var value = fitText(ctx, rows[row][1], colW * 0.66);
    var valueW = ctx.measureText(value).width;
    ctx.fillText(value, cx + colW - 8, cy + 1);

    ctx.textAlign = "left";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(199,209,224,0.62)";
    ctx.fillText(fitText(ctx, rows[row][0], colW - valueW - 22), cx, cy + 2);
  }

  // The border last, so it sits over the render's edge rather than under it.
  ctx.lineWidth = hot ? 2 : 1;
  ctx.strokeStyle = hot ? tier.line : "rgba(140,179,230,0.3)";
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.textAlign = "left";
}

// Where the render sits inside a card. Its own function for the usual reason:
// drawMapCard positions three overlays against it, and a second copy of the
// arithmetic is three chances for one of them to drift off the picture.
//
// 16:9 is not negotiable here -- see drawMapThumbnail.
function mapPreviewRect(card) {
  var w = card.w - 24;
  return {
    x: card.x + 12,
    y: card.y + CARD_CHROME_H - 4,
    w: w,
    h: w * VIEW_HEIGHT / VIEW_WIDTH
  };
}

// THE MAP, drawn small. The whole 1280x720 battlefield scaled into `box`,
// through the same three calls the 2D play screen makes in the same order:
// the theme's background, its environment, then the road. The 3D board is a
// different renderer that shares only the world coordinates with these, which
// is why the flip below exists.
//
// UNIFORM SCALE, and the box is built 16:9 to make that possible. Fitting a
// non-16:9 box would mean either letterboxing (the map floating in a frame it
// does not fill, which looks like a bug) or two different scales (a squashed
// map, which misrepresents exactly the shape the card is asking the player to
// judge). Neither is "looks exactly like the map we're playing in", so the box
// is the thing that gives.
//
// Nothing here is a copy of the battlefield's renderer -- Maps.drawEnvironment
// and drawRoadOn ARE the battlefield's renderer. That is the whole point: a
// theme retune, a new decoration kind or a change to the road's five strokes
// shows up on these cards without anyone remembering to update them. It stayed
// true through the move to 3D for WHAT is painted and quietly stopped being
// true for WHICH WAY UP; that is the one thing the card now has to know about
// the board, and it is one transform rather than a second renderer.
//
// What is deliberately NOT drawn: towers, enemies, the build preview, and the
// old start/end dots. The first three are run state and there is no run yet;
// the dots were interface the battlefield itself never shows, and keeping them
// would have made the preview a diagram again.
function drawMapThumbnail(map, box) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.translate(box.x, box.y);
  ctx.scale(box.w / VIEW_WIDTH, box.h / VIEW_HEIGHT);

  // SCREEN-UP CHANGED DIRECTION UNDER THE CARD WHEN THE BOARD WENT 3D. This
  // flip is what puts it back, and it is the whole of the fix.
  //
  // Routes are authored in canvas pixels, where +y is DOWN the screen, and
  // that is still what the three calls below paint. The GL board reads the
  // same world y through a camera parked on the -y side of its target
  // (`OrbitCamera`'s default `yaw = -PI/2`) with world up at +z, so its
  // screen-up is `0.56*y + 0.829*z` and +y goes UP. Measured on Rune Circuit
  // at the opening camera: world y 160 projects to screen y 436 and world y
  // 460 to 327 -- y rising, screen y falling. World x -60 projected to 166
  // and x 1340 to 1101 in the same read, so the horizontal is untouched.
  // One axis exactly, which is why every card looked nearly right and no
  // card was.
  //
  // THE CARD IS THE SIDE THAT GIVES, because the board's side cannot be turned
  // round. A camera anywhere above the ground maps the (x, y) plane to the
  // screen the same way round; swinging it to the +y side to send y downward
  // sends +x leftward with it, because `right = cross(fwd, up)` flips too --
  // that trades this vertical mirror for a horizontal one and fixes nothing.
  // The only real board-side fixes are a negated y through every mesh, every
  // actor and screenToWorld, or a mirrored projection -- and a mirrored
  // projection inverts every triangle's winding and hands every model its
  // other hand.
  //
  // Asked of the renderer rather than applied unconditionally: with no WebGL
  // the battlefield falls back to the 2D pass in draw(), which really is
  // +y-down, and a card flipped against that would break the same promise in
  // the other direction.
  if (typeof World3D !== "undefined" && World3D.isEnabled()) {
    ctx.translate(0, VIEW_HEIGHT);
    ctx.scale(1, -1);
  }

  // A CARD IS A PICTURE OF A PLACE, not a clock. Fixed late morning, always --
  // a player choosing a route at three in the morning should not be offered
  // eight thumbnails of a dark forest, and a card that changed while they
  // looked at it would read as a bug.
  Maps.drawSky(ctx, map, thumbnailEnvironment(), VIEW_WIDTH, VIEW_HEIGHT);

  if (typeof Maps.drawEnvironment === "function") Maps.drawEnvironment(ctx, map);

  // Routes converted the same way loadMap converts them, so the road on the
  // card is at the same world coordinates it will be at in the run.
  //
  // REAL GamePaths, not bare {points}, since 2026-08-26: a route may now
  // declare a width profile and the card has to show the chokepoints and the
  // plaza, or the promise that the preview IS the map is broken by exactly the
  // feature the player would most want to see before picking a board.
  // Construction is a cumulative-length pass over a dozen points.
  drawRoadOn(Maps.routesOf(map).map(function (route) {
    // THE SMOOTHED LINE, like every other GamePath on the board. This call
    // and the one in loadMap came from opposite branches and git merged them
    // without a word: this one kept the authored polyline, so the sampler
    // measured a route the enemies do not walk.
    return new GamePath(Maps.toWorld(Maps.walkablePoints(map, route.points)),
      Maps.profileOf(route));
  }), map);

  ctx.restore();
}

// The enemy under a point, or null. Unlike towerAt this picks the CLOSEST
// match rather than the first: towers can never overlap, but enemies bunch up
// nose to tail on the road all the time, and picking by array order would make
// the readout flicker between two enemies that the cursor covers at once.
function enemyAt(x, y) {
  var best = null;
  var bestDistSq = Infinity;
  // THE POINT BEING TESTED IS NOT THE SAME KIND OF POINT IN BOTH RENDERERS.
  // In 2D it is a screen position under a flat camera, so the body's drawn
  // lift is part of where the body IS. In 3D it is a ground-plane hit from
  // screenToWorld, and the lift happens along an axis this point does not
  // have. Decided once, here, and handed to every test below -- the same
  // arrangement drawInspection uses for its own `flat`.
  var flat = !(typeof World3D !== "undefined" && World3D.isEnabled());

  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (!e.containsPoint(x, y, flat)) continue;

    // Measured to the VISIBLE body, not the ground contact point. An enemy is
    // drawn lifted above where it stands in the three-quarter camera, so
    // picking the nearest by ground position would hand the cursor the wrong
    // body whenever two of them overlap.
    var dx = x - e.pos.x;
    var dy = y - ((flat && e.visualBodyY) ? e.visualBodyY() : e.pos.y);
    var distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = e;
    }
  }
  return best;
}

// What the hover readout says. Split out of the drawing so a test can assert
// the text the player reads, rather than only that the frame did not throw --
// the stub canvas records nothing, so anything left inside draw() is untestable.
//
// Clamped at 0 because takeDamage subtracts the full hit: an enemy sits on
// negative health for the rest of the frame that killed it, and "-7 / 3 HP"
// would be nonsense on screen.
function enemyHoverLabel(enemy) {
  var label = Math.max(0, enemy.health) + " / " + enemy.maxHealth + " HP";
  // The shield is stated separately rather than folded into the HP figure, for
  // the same reason it gets its own bar over the sprite: two pools that empty
  // in sequence read wrongly as one. "12 / 12 HP + 24 shield" is what a
  // Bulwark actually is.
  if (enemy.shieldMax > 0) {
    label += " + " + Math.max(0, Math.round(enemy.shield)) + " shield";
  }
  return label;
}

// Current / max HP for whatever enemy the cursor is over.
//
// Anchored to the ENEMY, not to the cursor, so the readout stays attached to
// the thing being pointed at while that thing walks. The box is sized in
// pixels like the rest of the interface chrome -- it is a label, not an object
// in the world, so it must stay legible whatever the map scale.
//
// Read-only: hovering never changes simulation state, so this lives entirely
// in the render section and update() knows nothing about it.
function drawEnemyHover() {
  if (mouse.x < -100) return;                  // cursor off the canvas
  if (slotAt(mouse.x, mouse.y) >= 0) return;    // cursor over the build bar

  // The inspection panel is drawn over the map, so an enemy walking underneath
  // it is not something the player can be pointing at. Same ordering rule as
  // onClick: whatever is drawn on top wins.
  if (inspected && pointInRect(mouse.x, mouse.y, inspectionLayout(inspected))) {
    return;
  }

  var e = enemyAt(worldMouse.x, worldMouse.y);
  if (!e) return;

  // REACH FIRST, under everything else: how far this body can hit a tower
  // from, in the tower range circle's own grammar. Which radii exist is
  // decided in js/visuals.js and nowhere else, so this branch and the 3D
  // overlay cannot disagree about it. Returned in u.l., converted once here.
  //
  // UNGUARDED ON PURPOSE: index.html is the only thing that reaches here and
  // already depends on Visuals3Q throughout. A missing module should throw
  // here, because the alternative is a reach ring that silently does not draw
  // -- which is exactly what a correct enemy with no attack looks like.
  //
  // The 3D branch in gl-world.js guards where this does not. That asymmetry
  // was justified by dressing.html loading gl-world.js without js/visuals.js;
  // that page was deleted with the map surround on 2026-08-14, so no page
  // exercises the difference today. Both sides are still correct as written --
  // see the note at that guard before treating either as the odd one out.
  var reaches = Visuals3Q.enemyReachesUl(e);
  for (var ri = 0; ri < reaches.length; ri++) {
    ctx.beginPath();
    ctx.arc(e.pos.x, e.pos.y, ul(reaches[ri]), 0, Math.PI * 2);
    ctx.fillStyle = Visuals3Q.ENEMY_REACH_FILL;
    ctx.fill();
    ctx.lineWidth = Visuals3Q.ENEMY_REACH_WIDTH;
    ctx.strokeStyle = Visuals3Q.ENEMY_REACH_STROKE;
    ctx.stroke();
  }

  // Ring first, so it is unambiguous WHICH enemy the number belongs to when
  // they are bunched nose to tail. Drawn at exactly the hit radius, so what
  // the player sees is precisely what they can point at -- the same rule the
  // tower footprint follows for its base and its click target.
  ctx.beginPath();
  ctx.arc(e.pos.x, e.pos.y, e.radiusPx() + Enemy.HOVER_PAD_PX, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,215,110,0.9)";
  ctx.stroke();

  // ONE READOUT, NOT TWO. The number and the bar used to be separate things
  // in separate places -- a label floating above the sprite and a bar pinned
  // to its crown -- so reading an enemy meant looking at two spots and
  // mentally pairing them. They are one panel now: the figure, and directly
  // under it the bar it describes, sharing a border. The bar is also the only
  // one on screen, since the sprite no longer carries one (see Enemy.draw).
  var label = enemyHoverLabel(e);

  ctx.font = "600 12px system-ui, sans-serif";

  var PAD = 7;
  var TEXT_H = 13;
  var BAR_H = 6;
  var GAP = 4;
  var shielded = e.shieldMax > 0;

  // The bar is at least as wide as the text, and never so narrow that a
  // sliver of remaining health is invisible.
  var barW = Math.max(58, Math.ceil(ctx.measureText(label).width));
  var boxW = barW + PAD * 2;
  var boxH = PAD + TEXT_H + GAP + BAR_H + (shielded ? BAR_H + 2 : 0) + PAD;

  // Above the enemy by default, flipped below when that would leave the
  // canvas -- which it does along the top run of the path. Offsets are
  // measured off the sprite's own radius, so a Midboss twice a normal's size
  // does not wear its readout inside itself.
  var boxX = Math.max(4, Math.min(e.pos.x - boxW / 2, VIEW_WIDTH - 4 - boxW));
  var boxY = e.pos.y - (e.radiusPx() + 14) - boxH;
  if (boxY < 4) boxY = e.pos.y + e.radiusPx() + 12;

  ctx.fillStyle = "rgba(20,22,30,0.94)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,215,110,0.55)";
  ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

  ctx.fillStyle = "#ffd76e";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, boxX + boxW / 2, boxY + PAD + TEXT_H / 2);

  var barX = boxX + PAD;
  var barY = boxY + PAD + TEXT_H + GAP;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(barX, barY, barW, BAR_H);
  ctx.fillStyle = "#61d973";
  ctx.fillRect(barX, barY,
    barW * Math.max(0, Math.min(1, e.health / e.maxHealth)), BAR_H);

  // The shield keeps its own bar for the same reason it keeps its own figure
  // in the label: two pools that empty in sequence read wrongly as one.
  if (shielded) {
    var sY = barY + BAR_H + 2;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(barX, sY, barW, BAR_H);
    ctx.fillStyle = "#8fdcf0";
    ctx.fillRect(barX, sY,
      barW * Math.max(0, Math.min(1, e.shield / e.shieldMax)), BAR_H);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// Recruits live on the Rifleman that called them rather than in a global list,
// so hovering searches each tower's active group. Nearest centre wins where
// the padded hit circles of a four-recruit group overlap.
function recruitAt(x, y) {
  var best = null;
  var bestDistSq = Infinity;

  for (var i = 0; i < towers.length; i++) {
    var list = towers[i].recruits;
    if (!list || !list.length) continue;

    for (var j = 0; j < list.length; j++) {
      var r = list[j];
      if (r.dead || !r.containsPoint(x, y)) continue;
      var dx = x - r.x;
      var dy = y - r.y;
      var distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = r;
      }
    }
  }
  return best;
}

// Show a recruit's remaining HP and exact firing range. Enemies are drawn over
// recruits, so an enemy under the pointer takes precedence.
function drawRecruitHover() {
  if (mouse.x < -100) return;
  if (slotAt(mouse.x, mouse.y) >= 0) return;
  if (inspected && pointInRect(mouse.x, mouse.y, inspectionLayout(inspected))) return;
  if (enemyAt(worldMouse.x, worldMouse.y)) return;

  var r = recruitAt(worldMouse.x, worldMouse.y);
  if (!r) return;

  ctx.beginPath();
  ctx.arc(r.x, r.y, r.rangePx, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(196,140,255,0.06)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(196,140,255,0.45)";
  ctx.stroke();

  var hitR = ul(Soldier.RECRUIT_RADIUS_UL) + Enemy.HOVER_PAD_PX;
  ctx.beginPath();
  ctx.arc(r.x, r.y, hitR, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(216,178,108,0.95)";
  ctx.stroke();

  var label = r.hoverLabel();
  ctx.font = "600 12px system-ui, sans-serif";
  var boxH = 18;
  var boxW = ctx.measureText(label).width + 12;
  var boxX = Math.max(4, Math.min(r.x - boxW / 2, VIEW_WIDTH - 4 - boxW));
  var boxY = r.y - 16 - boxH;
  if (boxY < 4) boxY = r.y + hitR + 8;

  ctx.fillStyle = "rgba(20,22,30,0.92)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(216,178,108,0.6)";
  ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
  ctx.fillStyle = "#e8cfa0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, boxX + boxW / 2, boxY + boxH / 2 + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// Beside Restart, not instead of it: a loss is the natural moment to try a
// different route, but re-running the same one is the commoner wish and stays
// the left-hand, primary button.
function changeMapButtonRect() {
  return {
    x: VIEW_WIDTH / 2 + 10,
    y: VIEW_HEIGHT / 2 + 48,
    w: 200,
    h: 48
  };
}

// Leave for the title menu (2026-07-29, at the owner's request). The run-over
// overlay offered "restart this route" and "choose another route" and no way
// out of the run loop at all -- the only route back to the armoury, where the
// coins the overlay had just awarded are actually spent, was the browser's
// reload button.
//
// On its OWN ROW, below and centred, rather than as a third button in the
// line. The two above it are both "play again"; this one is not, and a row of
// three equals would make the odd one out the easiest to hit by accident on a
// screen the player reaches by losing.
function mainMenuButtonRect() {
  return {
    x: VIEW_WIDTH / 2 - 108,
    y: VIEW_HEIGHT / 2 + 108,
    w: 216,
    h: 42
  };
}

// Shared by both loss-screen buttons so they cannot drift apart. Assumes the
// caller has already centred the text baseline, as drawGameOver does.
// --- the result screen (2026-08-26) -----------------------------------------
//
// ONE FUNCTION OWNS EVERY BUTTON'S GEOMETRY, and both the drawing and the
// hit-testing read it. The overlay used to hold three rects in three separate
// functions and test them in a fourth place, which is how a button ends up
// drawn somewhere its hitbox is not -- the class of bug you only find by
// clicking. Anything that wants to know where a result button is asks here.
function resultButtons() {
  var minimised = resultMinimised;
  if (minimised) {
    // The folded tab. Bottom-LEFT on purpose: the inspection panel is anchored
    // to the right-hand column, and a tab over it would cover the very thing
    // the fold exists to let the player read.
    return [{ id: "show", label: "Show results", x: 16, y: VIEW_HEIGHT - 128, w: 168, h: 34 }];
  }
  var w = 216, h = 44, gap = 12;
  var x = VIEW_WIDTH / 2 - w / 2;
  var top = VIEW_HEIGHT - 214;
  return [
    { id: "inspect", label: "Inspect battlefield", x: x, y: top, w: w, h: h },
    { id: "restart", label: "Restart " + (currentMap ? currentMap.name : ""),
      x: x, y: top + (h + gap), w: w, h: h },
    { id: "route", label: "Change route", x: x, y: top + 2 * (h + gap), w: w, h: h },
    { id: "menu", label: "Main menu", x: x, y: top + 3 * (h + gap), w: w, h: h }
  ];
}

function resultButtonAt(x, y) {
  var list = resultButtons();
  for (var i = 0; i < list.length; i++) {
    if (pointInRect(x, y, list[i])) return list[i];
  }
  return null;
}

// The stat block for one tower still standing when the run ended.
//
// Read from the tower's OWN `statLines()` -- the same rows the in-game
// inspection panel prints -- so a tower that counts something unusual shows it
// here without this function knowing the tower exists, and a tower that has no
// healing to report simply has no healing row. That is the rule: NO INVENTED
// ZEROES. A blank where a stat does not apply is information; a "0" is a lie
// about a stat the tower does not keep.
// WHICH STAT ROWS ARE RUN TOTALS, as opposed to the tower's current numbers.
//
// `statLines()` mixes the two deliberately -- the in-game panel wants both --
// so this cannot just take everything. "Damage dealt" is what the tower did
// over the run; "Damage" is what one of its shots hits for, and printing that
// beside a kill count reads as a total and is not one. The first draft of this
// screen showed "4210 dmg · 63 kills · damage dealt 4210 · kills 63 · damage 1"
// for a Rifleman, which is the same two numbers three times and a per-shot stat
// wearing their clothes.
//
// An ALLOW-LIST rather than a deny-list, because the failure modes are not
// symmetric: a total this misses is a missing line, and a current-value this
// lets through is a lie. A tower that keeps a total nothing else keeps adds its
// label here; a tower that keeps none simply has no rows, which is the rule
// this screen is built on -- no invented zeroes.
var RESULT_TOTAL_LABELS = [
  "Damage dealt", "Kills", "Healed", "Healing done",
  "Gold made", "Gold generated", "Blubs summoned", "Recruits sent"
];

function resultTowerRows() {
  var rows = [];
  for (var i = 0; i < towers.length; i++) {
    var tw = towers[i];
    var lines = (typeof tw.statLines === "function") ? tw.statLines() : [];
    var totals = [];
    for (var j = 0; j < lines.length; j++) {
      if (RESULT_TOTAL_LABELS.indexOf(lines[j][0]) !== -1) totals.push(lines[j]);
    }
    rows.push({
      name: (typeof tw.displayName === "function" ? tw.displayName()
             : (tw.constructor && tw.constructor.DISPLAY_NAME) || "Tower"),
      spent: typeof tw.totalSpent === "number" ? tw.totalSpent : null,
      totals: totals
    });
  }
  return rows;
}

function drawResultScreen() {
  if (!gameOver && !victory) return;
  if (resultMinimised) { drawResultTab(); return; }

  var won = !!victory;
  ctx.fillStyle = "rgba(10,11,16,0.88)";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = won ? "#8ce69d" : "#e0736e";
  ctx.font = "700 46px system-ui, sans-serif";
  ctx.fillText(won ? "VICTORY" : "DEFEAT", VIEW_WIDTH / 2, 64);

  ctx.fillStyle = "#c7d1e0";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText((currentMap ? currentMap.name : "—") +
    "   ·   wave " + reachedWave() + " of " + WAVES.length +
    "   ·   " + wavesCompleted() + " finished" +
    "   ·   base " + Math.max(0, Math.round(baseHp)) + " HP" +
    "   ·   $" + Math.round(cash) +
    "   ·   " + runKills + " destroyed", VIEW_WIDTH / 2, 98);

  // WHERE THE COINS CAME FROM, read straight off the award. This panel never
  // re-derives a number: MetaProgress.awardRun banked these and handed back the
  // list, and a screen that recomputed them could disagree with the bank.
  var award = lastRunAward || { repeatable: 0, objectives: [], bounties: [], total: 0 };
  var y = 134;
  ctx.fillStyle = "#ffd76e";
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillText("+" + award.total + " ⬡   ·   " + MetaProgress.coins() + " banked",
    VIEW_WIDTH / 2, y);

  ctx.font = "13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(199,209,224,0.85)";
  y += 24;
  var sources = [{ label: won ? "Cleared the route" : "Reached wave " + reachedWave(),
                   amount: award.repeatable }]
    .concat(award.objectives || []).concat(award.bounties || []);
  for (var si = 0; si < sources.length; si++) {
    if (!sources[si].amount) continue;
    ctx.fillText(sources[si].label + "   +" + sources[si].amount + " ⬡", VIEW_WIDTH / 2, y);
    y += 18;
  }

  // The board as it stood. Trimmed to what fits above the buttons rather than
  // scrolled: the full breakdown is one click away behind Inspect battlefield,
  // which is the whole reason that button exists.
  var rows = resultTowerRows();
  y += 10;
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(199,209,224,0.55)";
  ctx.fillText(rows.length + (rows.length === 1 ? " tower standing" : " towers standing"),
    VIEW_WIDTH / 2, y);
  y += 20;
  ctx.font = "13px system-ui, sans-serif";
  var limit = resultButtons()[0].y - 26;
  for (var ri = 0; ri < rows.length && y < limit; ri++) {
    var r = rows[ri];
    var bits = [];
    if (r.spent !== null) bits.push("$" + r.spent);
    for (var ei = 0; ei < r.totals.length; ei++) {
      bits.push(r.totals[ei][1] + " " + r.totals[ei][0].toLowerCase());
    }
    ctx.fillStyle = "rgba(199,209,224,0.80)";
    ctx.fillText(r.name + "   " + bits.join("  ·  "), VIEW_WIDTH / 2, y);
    y += 17;
  }

  var buttons = resultButtons();
  for (var bi = 0; bi < buttons.length; bi++) {
    drawOverlayButton(buttons[bi], buttons[bi].label);
  }

  ctx.fillStyle = "rgba(199,209,224,0.55)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("R restart   ·   M another route   ·   Escape menu",
    VIEW_WIDTH / 2, VIEW_HEIGHT - 18);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// The folded state: one small tab, and the board readable behind it.
function drawResultTab() {
  var won = !!victory;
  var b = resultButtons()[0];

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = won ? "rgba(140,230,157,0.16)" : "rgba(224,115,110,0.16)";
  ctx.fillRect(b.x - 8, b.y - 30, b.w + 16, 26);
  ctx.fillStyle = won ? "#8ce69d" : "#e0736e";
  ctx.font = "700 15px system-ui, sans-serif";
  ctx.fillText(won ? "VICTORY" : "DEFEAT", b.x + b.w / 2, b.y - 17);

  drawOverlayButton(b, b.label);

  ctx.fillStyle = "rgba(199,209,224,0.55)";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText("click a tower to read it", b.x + b.w / 2, b.y + b.h + 12);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// The pause menu's and both run-over overlays' control. One function, so
// "Resume", "Restart" and "Main menu" cannot end up three different shapes.
function drawOverlayButton(r, label) {
  drawAshControl(r, String(label).toUpperCase(), {});
}

// Map chooser geometry. Interface chrome, so pixels are correct here -- a card
// is anchored to the 1280x720 viewport, not to anything in the world.
//
// The grid is centred and sized from the number of maps, so adding a route to
// Maps.LIST lays itself out without touching this -- see mapGrid, which is
// where that claim is actually kept. CARD_W and CARD_H are the LARGEST a card
// is ever drawn, not the size it always is.
var MAP_CARD_COLS = 3;
var CARD_W = 372;
var CARD_H = 240;
var CARD_GAP = 18;
var CARD_ROW_GAP = 14;
var CARD_Y = 154;
// Clear of the viewport edges, so a full row never touches the frame.
var CARD_MARGIN = 20;
// Everything on a card that is NOT the 16:9 render: the name/badge line above
// it and a hair of padding below. Kept here because mapGrid derives the card
// height from it and mapPreviewRect places the render against it, and two
// copies of one number is how the render ends up off the bottom of the plate.
var CARD_CHROME_H = 44;

// THE THREE DIFFICULTY BANDS, RE-CUT INTO THE ASH PALETTE (2026-08-26). Teal,
// yellow and pink were the old screen's; ley-teal, bone and ember are this
// one's, and they are ALSO an order -- cool for the easy routes, hot for the
// hard ones -- which the old set was not. The keys and the shape are unchanged,
// so `Maps.analyse` and every reader of a tier keep working untouched.
var TIER_COLOURS = {
  // `rgb` is the same colour as a bare triple, because drawAshPlate takes one
  // and a second literal of the same colour is the copy that goes stale.
  easy:   { text: "#74f0d6", rgb: "116,240,214",
            line: "rgba(116,240,214,0.8)", fill: "rgba(116,240,214,0.10)" },
  normal: { text: "#f6d9b4", rgb: "236,222,206",
            line: "rgba(236,222,206,0.8)", fill: "rgba(236,222,206,0.10)" },
  hard:   { text: "#f0a45c", rgb: "240,150,78",
            line: "rgba(240,150,78,0.85)", fill: "rgba(240,150,78,0.14)" }
};


// --- Audio ------------------------------------------------------------------
//
// SoundSynthesizer: every sound in the game, synthesized in real time out of
// the Web Audio API. There are no audio FILES, and there is no fetch -- which
// is what lets this ship under the "nothing is fetched" hard constraint in
// AGENTS.md and still run by double-clicking index.html.
//
// IT IS PRESENTATION, AND IT OBEYS THE SAME ONE-WAY RULE AS js/effects.js.
// The simulation TELLS this module things (a tower was placed, an enemy died,
// a wave started); nothing simulated ever reads anything back out of it. A
// silent game must play identically, so every call site is `typeof`-guarded
// and every method here no-ops when there is no audio device. That is not
// only politeness: the test harness boots this file in Node, where there is no
// AudioContext at all, and the suites would take the whole game down with them
// if construction or a play call could throw.
//
// Math.random() appears here, which AGENTS.md otherwise confines to
// effects.js. The reason that rule exists is that nothing simulated may depend
// on a random number, and nothing does: these values pick a pitch and die.
// Do not derive a gameplay value from one, exactly as you would not derive one
// from a particle.
//
// WHY IT LIVES IN game.js rather than in a js/audio.js of its own, which is
// where the rest of this project would put it: the ask was explicitly for no
// new files. If a future session splits it out, the split is mechanical --
// this section, the panel drawing below it, and one <script> line before
// game.js in BOTH index.html and sandbox.html (they must stay identical).
//
// THE SIGNAL CHAIN, and why it is shaped this way:
//
//   voice -> voice gain -> sfx bus --\
//                                      +-> compressor -> soft clip -> master
//   (future music) -> music bus ------/                                  |
//                                                                   destination
//
// The compressor and the soft clip are between the buses and the master fader,
// not after it, so pulling the master down never has to fight a limiter and
// muting is genuinely silent rather than merely quiet. The compressor catches
// the case this game will actually hit -- a screenful of enemies dying inside
// one frame -- and the tanh waveshaper behind it means that even if something
// gets past the compressor's attack it saturates instead of clipping into the
// digital fizz that a bare sum of oscillators produces.

// How many voices may be alive at once. A voice is one oscillator or one noise
// source; the sounds below cost between two and eight each. Twenty-eight is
// roughly four simultaneous deaths plus a wave swell, and past that the mix is
// mud anyway -- so the cap costs nothing audible and bounds the CPU.
var SOUND_MAX_VOICES = 28;

function SoundSynthesizer() {
  // Nothing in this constructor may touch the Web Audio API. It runs at load
  // time, including under the Node test harness, and the context itself is not
  // allowed to exist until a user gesture anyway (see unlock).
  this.ctx = null;
  this.failed = false;          // no AudioContext here; stop trying

  this.master = null;
  this.sfxBus = null;
  this.musicBus = null;         // wired and faded, fed by nothing yet

  this.masterVolume = 0.7;
  this.sfxVolume = 1.0;
  this.musicVolume = 0.8;
  this.muted = false;

  this.noiseBuffer = null;

  // Voice budget, as a list of end times. Pruned on use rather than by timers,
  // so a paused tab cannot leak a counter that never comes back down.
  this.voiceEnds = [];

  // Per-sound rate limits, in AudioContext seconds. These are REAL time, not
  // game time, which is what the 3x speed toggle needs them to be: three times
  // as many deaths per second still has to arrive as a sound and not a buzz.
  this.lastAt = {};
  this.deathBurst = [];         // recent death times, for the stacking rule

  // The alarm is the one sound that is a sequence rather than a hit, so it is
  // the one that needs to know whether it is already running.
  this.alertUntil = 0;
  this.alertNodes = null;

  this.lastResumeAttempt = -99;
}

// The constructor the browser gives us, or null when there is no Web Audio at
// all (Node, or a browser with it switched off).
SoundSynthesizer.prototype.audioContextCtor = function () {
  if (typeof window === "undefined" || !window) return null;
  return window.AudioContext || window.webkitAudioContext || null;
};

// Create the context on a USER GESTURE and resume it if the browser parked it.
// Called from onClick and onKeyDown -- the two handlers this game already has
// that a browser counts as interaction -- rather than from a listener of its
// own, deliberately: the test harness keeps exactly one listener per event
// name, so a second window keydown handler would silently replace the game's.
//
// Returns whether there is a usable context afterwards.
SoundSynthesizer.prototype.unlock = function () {
  if (this.ctx) {
    this.resumeIfParked();
    return true;
  }
  if (this.failed) return false;

  var Ctor = this.audioContextCtor();
  if (!Ctor) { this.failed = true; return false; }

  try {
    this.ctx = new Ctor();
  } catch (e) {
    this.failed = true;
    return false;
  }

  this.buildGraph();
  this.resumeIfParked();
  return true;
};

// Browsers suspend the context when the tab goes to the background and after
// their autoplay timeout. Retried at most once a second: resume() outside a
// gesture may simply not work, and asking on every sound would be a promise
// per bullet.
SoundSynthesizer.prototype.resumeIfParked = function () {
  if (!this.ctx || this.ctx.state === "running") return;
  var now = (this.ctx.currentTime || 0);
  if (now - this.lastResumeAttempt < 1) return;
  this.lastResumeAttempt = now;
  if (typeof this.ctx.resume === "function") {
    try { this.ctx.resume(); } catch (e) { /* nothing to do about it */ }
  }
};

SoundSynthesizer.prototype.buildGraph = function () {
  var ctx = this.ctx;

  this.master = ctx.createGain();
  this.master.gain.value = this.muted ? 0 : this.masterVolume;
  this.master.connect(ctx.destination);

  // Soft clip: tanh, so everything under about -6 dBFS passes through
  // untouched and anything above it bends rather than breaks. 1024 points is
  // far more than the ear needs and costs one array, once.
  var shaper = ctx.createWaveShaper();
  var curve = new Float32Array(1024);
  for (var i = 0; i < 1024; i++) {
    var x = (i / 1023) * 2 - 1;
    curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";     // the cheap defence against the aliasing a
                                // waveshaper otherwise introduces
  shaper.connect(this.master);

  // The mass-kill insurance. A slow-ish release so a burst ducks the mix
  // smoothly instead of pumping once per body.
  var comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 14;
  comp.ratio.value = 10;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  comp.connect(shaper);
  this.compressor = comp;

  this.sfxBus = ctx.createGain();
  this.sfxBus.gain.value = this.sfxVolume;
  this.sfxBus.connect(comp);

  // Reserved. Nothing feeds this yet -- the fader exists so that adding music
  // later is a source and a connect(), not a re-plumbing of the whole graph
  // and a second volume model bolted onto the side of this one.
  this.musicBus = ctx.createGain();
  this.musicBus.gain.value = this.musicVolume;
  this.musicBus.connect(comp);
};

// Is there a context, is it awake, and is anyone listening? Every play method
// opens with this, which is what makes a silent game a game that simply does
// not call into Web Audio at all.
SoundSynthesizer.prototype.ready = function () {
  if (!this.ctx || !this.sfxBus) return false;
  if (this.muted || this.masterVolume <= 0 || this.sfxVolume <= 0) return false;
  if (this.ctx.state !== "running") { this.resumeIfParked(); return false; }
  return true;
};

SoundSynthesizer.prototype.now = function () {
  return this.ctx ? this.ctx.currentTime : 0;
};

// Rate limit. Returns false when `name` fired less than `gap` seconds ago,
// which is how a beam tower doing damage sixty times a second produces a
// series of impacts rather than a sawtooth.
SoundSynthesizer.prototype.throttle = function (name, gap) {
  var t = this.now();
  var last = this.lastAt[name];
  if (last !== undefined && t - last < gap) return false;
  this.lastAt[name] = t;
  return true;
};

// Take `n` voices out of the budget for `seconds`, or refuse. The list is
// pruned here so it can never grow past the cap plus one burst.
SoundSynthesizer.prototype.claimVoices = function (n, seconds) {
  var t = this.now();
  var live = [];
  for (var i = 0; i < this.voiceEnds.length; i++) {
    if (this.voiceEnds[i] > t) live.push(this.voiceEnds[i]);
  }
  this.voiceEnds = live;
  if (live.length + n > SOUND_MAX_VOICES) return false;
  for (var k = 0; k < n; k++) this.voiceEnds.push(t + seconds);
  return true;
};

// A gain node with an attack/decay envelope already written into it, connected
// to the SFX bus. Everything below builds its sound by pointing sources at one
// of these.
//
// The decay is EXPONENTIAL and lands on 0.0001 rather than 0, because
// exponentialRampToValueAtTime cannot reach zero -- and then a setValueAtTime
// at the end takes it the rest of the way, so nothing is left holding a
// hair-thin DC offset. That last step is what keeps a decay smooth instead of
// ending on the click of a value jump.
SoundSynthesizer.prototype.env = function (t0, peak, attack, decay, destination) {
  var g = this.ctx.createGain();
  var end = t0 + attack + decay;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  g.gain.setValueAtTime(0, end + 0.001);
  g.connect(destination || this.sfxBus);
  return g;
};

SoundSynthesizer.prototype.osc = function (type, freq, t0, stopAt) {
  var o = this.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.start(t0);
  o.stop(stopAt);
  return o;
};

// One second of white noise, made once and replayed from different offsets.
// Generating a fresh buffer per burst would allocate 44 100 floats every time
// an enemy was hit.
SoundSynthesizer.prototype.noise = function (t0, stopAt) {
  if (!this.noiseBuffer) {
    var rate = this.ctx.sampleRate;
    var buf = this.ctx.createBuffer(1, rate, rate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }
  var src = this.ctx.createBufferSource();
  src.buffer = this.noiseBuffer;
  // A random offset, so two bursts in a row are not the same slice of noise
  // played twice -- which the ear hears as a repeated sample, not as texture.
  src.start(t0, Math.random() * 0.85);
  src.stop(stopAt);
  return src;
};


// --- The sounds -------------------------------------------------------------

// 1. TOWER PLACEMENT -- a bright metallic clink with a resonant tail.
//
// The partials are INHARMONIC (1, 2.76, 5.40, 8.93), which is the classic
// struck-bar series rather than the harmonic series a pitched instrument uses.
// That ratio set is the entire difference between "a note" and "metal": stack
// octaves and fifths here instead and it reads as a chime from a menu, not as
// a machine being set down on a battlefield.
//
// Pitch varies +/-10% per placement, so building five towers in a row does not
// sound like one sample fired five times.
SoundSynthesizer.prototype.playTowerPlace = function () {
  if (!this.ready() || !this.throttle("place", 0.05)) return;
  if (!this.claimVoices(5, 0.5)) return;

  var t = this.now();
  var root = 720 * (0.9 + Math.random() * 0.2);
  var ratios = [1, 2.76, 5.40, 8.93];
  var levels = [0.25, 0.14, 0.085, 0.045];

  for (var i = 0; i < ratios.length; i++) {
    // Higher partials die first. That is what a real strike does and it is
    // what turns four sine waves into one event rather than four.
    var decay = 0.44 / (1 + i * 0.55);
    var g = this.env(t, levels[i], 0.004, decay);
    this.osc("sine", root * ratios[i], t, t + decay + 0.05).connect(g);
  }

  // The contact itself: three milliseconds of bandpassed noise. Without it the
  // partials fade IN, however short the attack, and the tower reads as
  // appearing rather than as being put down.
  var bp = this.ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3200;
  bp.Q.value = 0.9;
  bp.connect(this.env(t, 0.16, 0.001, 0.035));
  this.noise(t, t + 0.05).connect(bp);
};

// 2. ENEMY HIT -- a low percussive thump with a noise skin.
//
// `damage` is optional and scales the whole hit between a tap and a slam. The
// curve is a square root rather than a straight line because damage in this
// game spans two orders of magnitude (a Siphon tick against a Warbringer
// blast) and a linear map would make everything below a boss-killer inaudible.
//
// THE THROTTLE IS LOAD-BEARING. Beam towers deal damage every single step, so
// without it this method is called sixty times a second per beam and the game
// buzzes. 45 ms lets a rifleman's burst come through as three hits while a
// beam becomes a texture.
SoundSynthesizer.prototype.playEnemyHit = function (damage) {
  if (!this.ready() || !this.throttle("hit", 0.045)) return;
  if (!this.claimVoices(2, 0.3)) return;

  var t = this.now();
  var intensity = 0.45;
  if (typeof damage === "number" && damage > 0) {
    intensity = Math.min(1, Math.sqrt(damage / 30));
  }
  intensity = 0.35 + intensity * 0.65;

  // 80-120 Hz fundamental, varied per hit.
  var f = 80 + Math.random() * 40;
  var decay = 0.13 + intensity * 0.09;

  // The pitch DROP is the thump. A body struck at a fixed frequency is a beep;
  // the same body dropping a sixth in sixty milliseconds is an impact.
  var body = this.ctx.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(f * 1.7, t);
  body.frequency.exponentialRampToValueAtTime(f, t + 0.055);
  body.start(t);
  body.stop(t + decay + 0.05);
  body.connect(this.env(t, 0.34 * intensity, 0.002, decay));

  // The skin: a lowpassed noise click. Enough to say "something connected",
  // not enough to read as a separate sound.
  var lp = this.ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1800, t);
  lp.frequency.exponentialRampToValueAtTime(420, t + 0.07);
  lp.connect(this.env(t, 0.13 * intensity, 0.001, 0.055));
  this.noise(t, t + 0.08).connect(lp);
};

// 3. ENEMY DEATH -- a small explosion: a swept noise envelope over a pitched
// body that rises to a peak and then falls away.
//
// STACKING IS THE POINT HERE, and it is why this one does not use the plain
// throttle. A wave clearing is several bodies dying inside one step, and a
// rate limit would report that as a single kill. Up to three land together,
// each quieter and detuned from the last, and the fourth onwards is dropped --
// which is the honest reading of a crowd, and keeps the compressor from having
// to swallow eight explosions at once.
SoundSynthesizer.prototype.playEnemyDeath = function () {
  if (!this.ready()) return;

  var t = this.now();
  var recent = [];
  for (var i = 0; i < this.deathBurst.length; i++) {
    if (t - this.deathBurst[i] < 0.09) recent.push(this.deathBurst[i]);
  }
  if (recent.length >= 3) { this.deathBurst = recent; return; }
  recent.push(t);
  this.deathBurst = recent;

  if (!this.claimVoices(3, 0.75)) return;

  var stacked = recent.length - 1;              // 0, 1 or 2
  var level = 1 / (1 + stacked * 0.8);
  var detune = 1 + stacked * 0.13;              // siblings sit apart in pitch

  var base = (400 + Math.random() * 200) * detune;
  var dur = 0.52 + Math.random() * 0.16;

  // The body. Up to a peak a fifth above in the first 70 ms, then all the way
  // down -- the rise is what makes it read as an explosion rather than as a
  // falling tone, and it is short enough that the ear takes it as a transient.
  var body = this.ctx.createOscillator();
  body.type = "sawtooth";
  body.frequency.setValueAtTime(base, t);
  body.frequency.exponentialRampToValueAtTime(base * 1.45, t + 0.07);
  body.frequency.exponentialRampToValueAtTime(base * 0.16, t + dur);
  body.start(t);
  body.stop(t + dur + 0.05);

  var bodyLp = this.ctx.createBiquadFilter();
  bodyLp.type = "lowpass";
  bodyLp.frequency.setValueAtTime(2600, t);
  bodyLp.frequency.exponentialRampToValueAtTime(500, t + dur);
  bodyLp.connect(this.env(t, 0.26 * level, 0.006, dur));
  body.connect(bodyLp);

  // A harmonic a fifth up, decaying faster: richness without a second event.
  var harm = this.osc("triangle", base * 1.5, t, t + dur * 0.6);
  harm.frequency.exponentialRampToValueAtTime(base * 0.4, t + dur * 0.55);
  harm.connect(this.env(t, 0.10 * level, 0.004, dur * 0.5));

  // The blast: noise through a bandpass sweeping down out of the top of the
  // spectrum. The sweep is what stops it being a hiss.
  var bp = this.ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(2800 * detune, t);
  bp.frequency.exponentialRampToValueAtTime(220, t + dur);
  bp.Q.value = 1.1;
  bp.connect(this.env(t, 0.22 * level, 0.008, dur * 0.95));
  this.noise(t, t + dur + 0.05).connect(bp);
};

// 4. WAVE START -- an orchestral swell on a major triad, three octaves deep.
//
// Built out of silence and returned to it: a 0.55 s fade in, a short hold, a
// 0.55 s fade out, with a lowpass opening and closing across the whole gesture.
// The filter is what makes it a SWELL rather than a chord that gets louder --
// a fade on its own reads as a volume knob, while a filter opening reads as
// something arriving.
//
// Two detuned layers per note (+/-6 cents' worth) for chorus width, and a sub
// an octave below the root for the weight the announcement wants.
SoundSynthesizer.prototype.playWaveStart = function () {
  if (!this.ready() || !this.throttle("wave", 0.6)) return;
  if (!this.claimVoices(8, 1.45)) return;

  var t = this.now();
  var IN = 0.55, HOLD = 0.28, OUT = 0.55;
  var total = IN + HOLD + OUT;

  // C major, an authored key rather than a random one: the wave banner lands
  // on the same chord every time, so the player learns the sound.
  var root = 130.81;                         // C3
  var chord = [root, root * 1.26, root * 1.5];        // root, major 3rd, 5th

  // The one filter every voice passes through, so the swell is a single
  // gesture instead of six independent ones drifting apart.
  var lp = this.ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.8;
  lp.frequency.setValueAtTime(240, t);
  lp.frequency.exponentialRampToValueAtTime(2800, t + IN + HOLD * 0.5);
  lp.frequency.exponentialRampToValueAtTime(360, t + total);

  var swell = this.ctx.createGain();
  swell.gain.setValueAtTime(0.0001, t);
  swell.gain.linearRampToValueAtTime(0.72, t + IN);
  swell.gain.setValueAtTime(0.72, t + IN + HOLD);
  swell.gain.exponentialRampToValueAtTime(0.0001, t + total);
  swell.gain.setValueAtTime(0, t + total + 0.01);
  lp.connect(swell);
  swell.connect(this.sfxBus);

  for (var i = 0; i < chord.length; i++) {
    // Sawtooth low, triangle high: the low octave carries the body and the
    // upper one only has to carry the brightness, and a saw up there under an
    // opening filter turns into a buzz.
    var low = this.osc("sawtooth", chord[i], t, t + total + 0.05);
    low.detune.value = -6;
    low.connect(this.gainInto(0.085, lp));

    var high = this.osc("triangle", chord[i] * 2, t, t + total + 0.05);
    high.detune.value = 6;
    high.connect(this.gainInto(0.055, lp));
  }

  // The sub. Sine, an octave under the root, and quiet -- it is felt more than
  // heard, which is exactly the job.
  this.osc("sine", root * 0.5, t, t + total + 0.05)
      .connect(this.gainInto(0.13, lp));
};

// A plain fixed-gain node. Used where the envelope belongs to a shared bus
// (the wave swell) rather than to the individual voice.
SoundSynthesizer.prototype.gainInto = function (value, destination) {
  var g = this.ctx.createGain();
  g.gain.value = value;
  g.connect(destination);
  return g;
};

// 5. LOW HEALTH ALERT -- a klaxon alternating between two pitches.
//
// Four pulses, 0.3 s on and 0.2 s off, alternating 620 Hz and 440 Hz. Each
// pulse fades in and out over 40 ms rather than switching, because a square
// wave gated instantly is a pair of clicks with a tone between them.
//
// IT CANNOT STACK. The whole sequence is scheduled in one go, `alertUntil`
// records when it ends, and a call arriving before then is dropped -- so
// update() may call this every step while the base is in danger and still get
// one alarm. stopAlert() exists for the two moments the alarm must not outlive
// its cause: a restart, and leaving the run.
SoundSynthesizer.prototype.playLowHealthAlert = function () {
  if (!this.ready()) return;
  var t = this.now();
  if (t < this.alertUntil) return;              // already sounding
  if (!this.claimVoices(2, 2.1)) return;

  var PULSES = 4;
  var ON = 0.3, OFF = 0.2;
  var total = PULSES * (ON + OFF);
  this.alertUntil = t + total;

  // One oscillator pair for the whole sequence, with the pitch STEPPED between
  // pulses while it is silent. Two pitches out of one voice, and no clicks:
  // the jump happens where the gain is already zero.
  var body = this.ctx.createOscillator();
  body.type = "square";
  var edge = this.ctx.createOscillator();       // a fifth up, thin, for bite
  edge.type = "triangle";

  var gate = this.ctx.createGain();
  gate.gain.setValueAtTime(0, t);

  // A lowpass takes the top off the square. An unfiltered square at 620 Hz is
  // a smoke detector; this is a warning the player can sit next to.
  var lp = this.ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2200;
  lp.Q.value = 0.7;

  gate.connect(lp);
  lp.connect(this.sfxBus);
  body.connect(gate);

  var edgeGain = this.ctx.createGain();
  edgeGain.gain.value = 0.35;
  edge.connect(edgeGain);
  edgeGain.connect(gate);

  for (var i = 0; i < PULSES; i++) {
    var at = t + i * (ON + OFF);
    var hz = (i % 2 === 0) ? 620 : 440;
    body.frequency.setValueAtTime(hz, at);
    edge.frequency.setValueAtTime(hz * 1.5, at);

    gate.gain.setValueAtTime(0.0001, at);
    gate.gain.linearRampToValueAtTime(0.13, at + 0.04);
    gate.gain.setValueAtTime(0.13, at + ON - 0.06);
    gate.gain.linearRampToValueAtTime(0.0001, at + ON);
    gate.gain.setValueAtTime(0, at + ON + 0.005);
  }

  body.start(t); body.stop(t + total + 0.05);
  edge.start(t); edge.stop(t + total + 0.05);

  this.alertNodes = { gate: gate, body: body, edge: edge, ends: t + total };
};

// Cut the alarm short. Ramped over 60 ms rather than stopped dead, for the
// same reason the pulses fade: an oscillator killed mid-cycle is a click.
SoundSynthesizer.prototype.stopAlert = function () {
  if (!this.ctx || !this.alertNodes) return;
  var t = this.now();
  var n = this.alertNodes;
  try {
    n.gate.gain.cancelScheduledValues(t);
    n.gate.gain.setValueAtTime(Math.max(0.0001, n.gate.gain.value), t);
    n.gate.gain.linearRampToValueAtTime(0, t + 0.06);
    n.body.stop(t + 0.08);
    n.edge.stop(t + 0.08);
  } catch (e) { /* already stopped; nothing to cut */ }
  this.alertNodes = null;
  this.alertUntil = 0;
};

// 6. GAME OVER -- a deep resonant fall, 200 Hz down to 80 Hz, into a tail.
//
// The tail is a real feedback delay (140 ms, lowpassed, fed back at 0.42)
// rather than a set of scheduled echoes. Both would work; the delay line is
// one node instead of six and it decays on its own, which is what makes the
// end of the run sound like a room going quiet rather than like a sound
// stopping. The wet gain is taken to zero at 1.4 s so a loop with rounding on
// its side cannot ring forever.
SoundSynthesizer.prototype.playGameOver = function () {
  if (!this.ready() || !this.throttle("over", 1.5)) return;
  this.stopAlert();                    // the run is over; the warning is moot
  if (!this.claimVoices(4, 1.3)) return;

  var t = this.now();
  var FALL = 0.8;

  var lp = this.ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1400, t);
  lp.frequency.exponentialRampToValueAtTime(280, t + FALL);
  lp.Q.value = 1.4;

  var out = this.env(t, 0.85, 0.02, 1.05);
  lp.connect(out);

  var delay = this.ctx.createDelay(0.5);
  delay.delayTime.value = 0.14;
  var feedback = this.ctx.createGain();
  feedback.gain.value = 0.42;
  var damp = this.ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 1200;        // each repeat is darker than the last,
                                       // which is what a room does
  var wet = this.ctx.createGain();
  wet.gain.setValueAtTime(0.4, t);
  wet.gain.setValueAtTime(0.4, t + 1.0);
  wet.gain.linearRampToValueAtTime(0, t + 1.4);

  lp.connect(delay);
  delay.connect(damp);
  damp.connect(feedback);
  feedback.connect(delay);
  damp.connect(wet);
  wet.connect(this.sfxBus);

  // The fall itself, plus two harmonics that decay faster. The harmonics are
  // what make it resonant rather than a sine slide; taking them away leaves a
  // sound that could be a UI transition.
  var partials = [
    { type: "sawtooth", mul: 1,   level: 0.42, decay: 1.0 },
    { type: "sine",     mul: 2,   level: 0.16, decay: 0.55 },
    { type: "sine",     mul: 3,   level: 0.07, decay: 0.34 }
  ];
  for (var i = 0; i < partials.length; i++) {
    var p = partials[i];
    var o = this.ctx.createOscillator();
    o.type = p.type;
    o.frequency.setValueAtTime(200 * p.mul, t);
    o.frequency.exponentialRampToValueAtTime(80 * p.mul, t + FALL);
    o.start(t);
    o.stop(t + p.decay + 0.1);
    o.connect(this.env(t, p.level, 0.012, p.decay, lp));
  }
};

// 7. UI CLICK -- short, bright, and out of the way.
//
// 800-1000 Hz, 90 ms end to end, with a highpassed noise tick under the front
// of it. Deliberately the quietest sound in the game: it fires more often than
// anything else and a click that competes with the battlefield is a click the
// player turns the volume down to escape.
SoundSynthesizer.prototype.playUIClick = function () {
  if (!this.ready() || !this.throttle("ui", 0.04)) return;
  if (!this.claimVoices(2, 0.12)) return;

  var t = this.now();
  var f = 800 + Math.random() * 200;

  var o = this.osc("triangle", f, t, t + 0.11);
  o.frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.07);
  o.connect(this.env(t, 0.16, 0.002, 0.07));

  var hp = this.ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2600;
  hp.connect(this.env(t, 0.05, 0.001, 0.02));
  this.noise(t, t + 0.04).connect(hp);
};

// 8. TOWER FIRE -- an energy discharge, pitched by what fired it.
//
// The quietest thing here after the UI click, and heavily rate limited: five
// towers at three times speed is a lot of shots per second, and this sound
// exists to sit UNDER the hits rather than to announce itself. If it ever
// competes with playEnemyHit, turn it down rather than shortening it -- the
// impact is the information, the shot is only the texture.
var SOUND_FIRE_KINDS = {
  light:  { pitch: 1.0,  level: 0.11, dur: 0.20 },   // Rifleman and friends
  heavy:  { pitch: 0.62, level: 0.15, dur: 0.28 },   // Warbringer
  pierce: { pitch: 1.45, level: 0.10, dur: 0.24 },   // Arcane Sniper
  blub:   { pitch: 1.22, level: 0.09, dur: 0.18 }    // a Summoner's blubs
};

SoundSynthesizer.prototype.playTowerFire = function (kind) {
  if (!this.ready() || !this.throttle("fire", 0.07)) return;
  if (!this.claimVoices(2, 0.32)) return;

  var spec = SOUND_FIRE_KINDS[kind] || SOUND_FIRE_KINDS.light;
  var t = this.now();
  var wobble = 0.94 + Math.random() * 0.12;
  var dur = spec.dur;

  // The whoosh: a bandpass climbing and then falling across the burst. One
  // filter moving is the whole difference between air and hiss.
  var bp = this.ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.6;
  bp.frequency.setValueAtTime(700 * spec.pitch * wobble, t);
  bp.frequency.exponentialRampToValueAtTime(2400 * spec.pitch * wobble, t + dur * 0.35);
  bp.frequency.exponentialRampToValueAtTime(600 * spec.pitch * wobble, t + dur);
  bp.connect(this.env(t, spec.level, 0.006, dur));
  this.noise(t, t + dur + 0.05).connect(bp);

  // A pitched tail under it, so a discharge has a body and not only air.
  var o = this.osc("sawtooth", 360 * spec.pitch * wobble, t, t + dur * 0.7);
  o.frequency.exponentialRampToValueAtTime(130 * spec.pitch, t + dur * 0.6);
  o.connect(this.env(t, spec.level * 0.55, 0.004, dur * 0.55));
};


// --- Mixer state ------------------------------------------------------------
//
// Every setter ramps rather than assigns. A gain jumped from 0.7 to 0 while
// something is sounding is a click, and "mute in the middle of an explosion"
// is one of the things this had to get right.

SoundSynthesizer.prototype.rampGain = function (node, value) {
  if (!node) return;
  var t = this.now();
  node.gain.cancelScheduledValues(t);
  node.gain.setValueAtTime(node.gain.value, t);
  node.gain.linearRampToValueAtTime(value, t + 0.03);
};

SoundSynthesizer.prototype.setMasterVolume = function (v) {
  this.masterVolume = Math.max(0, Math.min(1, v));
  if (!this.muted) this.rampGain(this.master, this.masterVolume);
};

SoundSynthesizer.prototype.setSfxVolume = function (v) {
  this.sfxVolume = Math.max(0, Math.min(1, v));
  this.rampGain(this.sfxBus, this.sfxVolume);
};

SoundSynthesizer.prototype.setMusicVolume = function (v) {
  this.musicVolume = Math.max(0, Math.min(1, v));
  this.rampGain(this.musicBus, this.musicVolume);
};

SoundSynthesizer.prototype.setMuted = function (on) {
  this.muted = !!on;
  this.rampGain(this.master, this.muted ? 0 : this.masterVolume);
  // The alarm is the one sound long enough to survive a mute and come back
  // out the other side, which would be a klaxon starting from nowhere.
  if (this.muted) this.stopAlert();
};

SoundSynthesizer.prototype.toggleMute = function () {
  this.setMuted(!this.muted);
  return this.muted;
};

// Three points on the master fader, so a player who does not want to aim at a
// slider still gets a choice. They set the MASTER only: the SFX and music
// faders are a balance between buses and a preset that reset them would throw
// away a mix the player had already made.
var SOUND_PRESETS = { quiet: 0.3, normal: 0.7, loud: 1.0 };

SoundSynthesizer.prototype.applyPreset = function (name) {
  var v = SOUND_PRESETS[name];
  if (v === undefined) return;
  if (this.muted) this.setMuted(false);
  this.setMasterVolume(v);
};

// Which preset the current master volume corresponds to, or null. Read by the
// panel so the preset buttons light up rather than being three dead labels.
SoundSynthesizer.prototype.currentPreset = function () {
  for (var name in SOUND_PRESETS) {
    if (Math.abs(SOUND_PRESETS[name] - this.masterVolume) < 0.005) return name;
  }
  return null;
};

// Run state, cleared when the run is. Volumes are NOT run state and survive --
// they are a preference the player set once, and resetting them on every
// restart would be the audio equivalent of resetting the camera zoom.
SoundSynthesizer.prototype.reset = function () {
  this.stopAlert();
  this.deathBurst = [];
  this.lastAt = {};
};

// Which fire sound a projectile deserves. Read off the BULLET rather than
// asked of the tower, because update() has the new bullet in its hand and
// would otherwise need a back-reference the simulation does not keep.
//
// Duck-typed first (`pierce` is PierceBullet's own field), constructor name
// second. THE CONSTRUCTOR NAMES ARE THE OLD ONES: `Smasher` is the tower the
// player calls the Warbringer, and the file is still js/smasher.js -- see the
// "Tower names" section of AGENTS.md for why the code kept them. There is no
// build step in this project, so a constructor's name survives to runtime.
//
// An unrecognised bullet gets the light shot, which is the right failure: a
// new tower type is audible on the day it is added, at a plausible pitch,
// without anyone having to remember this function exists.
function fireKindOf(bullet) {
  if (!bullet) return "light";
  if (bullet.pierce !== undefined) return "pierce";
  var owner = bullet.owner;
  var name = owner && owner.constructor && owner.constructor.name;
  if (name === "BlubTower") return "blub";
  if (name === "Smasher") return "heavy";
  return "light";
}

// The one instance. Constructed at load time because nothing in the
// constructor touches Web Audio; the context itself waits for a gesture.
var Sound = new SoundSynthesizer();


// --- The audio panel --------------------------------------------------------
//
// Interface chrome, drawn on the game canvas like every other control in this
// project rather than as DOM over it. That is not stylistic: the canvas is
// letterboxed and scaled by CSS (see index.html), so a DOM slider would need
// its own copy of that mapping to stay where it was put, and toGameCoords
// already solves the problem for everything drawn here. A canvas panel also
// inherits the 1280x720 layout the rest of the HUD is authored against.
//
// It lives in the bottom-right chrome row with the speed and auto-wave
// buttons, for the reason stated at speedButtonRect: that corner is the one
// region of the viewport nothing else claims. Opening it does NOT pause the
// game -- the ask was explicitly for controls reachable mid-run, and a mixer
// that stopped the world would be a mixer nobody could balance against what
// they were listening to.
//
// The button's position is fixed relative to the speed button and does NOT
// close up when the wave controls go away at the end of the schedule. A
// control that moves is a control the player has to find again.

var AUDIO_BUTTON_W = 44;
var AUDIO_PANEL_W = 268;
var AUDIO_PANEL_H = 216;

// Open state and the live slider drag. Both are UI, not run state, so a
// restart leaves them alone -- the panel you opened stays open.
var audioPanelOpen = false;
var audioDrag = null;          // "master" | "sfx" | "music" while dragging

function audioButtonRect() {
  // Anchored off the auto-wave button's rectangle, which exists whether or not
  // that button is drawn (see autoSkipButtonRect). Deriving the x from the
  // same source keeps one number describing the row's spacing.
  var auto = autoSkipButtonRect();
  return { x: auto.x - 8 - AUDIO_BUTTON_W, y: auto.y, w: AUDIO_BUTTON_W, h: auto.h };
}

function audioPanelRect() {
  var speed = speedButtonRect();
  return {
    x: VIEW_WIDTH - 24 - AUDIO_PANEL_W,
    y: speed.y - 10 - AUDIO_PANEL_H,
    w: AUDIO_PANEL_W,
    h: AUDIO_PANEL_H
  };
}

// Every rectangle in the panel, from one function -- so what is drawn and what
// is clickable can never disagree. Same arrangement slotRect and
// inspectionLayout use, and for the same reason.
function audioPanelLayout() {
  var p = audioPanelRect();
  var inner = p.x + 14;
  var innerW = p.w - 28;

  function track(top) {
    return { x: inner, y: p.y + top + 16, w: 178, h: 6 };
  }

  return {
    panel: p,
    close: { x: p.x + p.w - 34, y: p.y + 10, w: 24, h: 24 },
    mute: { x: inner, y: p.y + 34, w: innerW, h: 30 },
    sliders: [
      { key: "master", label: "MASTER", labelY: p.y + 74,  track: track(74) },
      { key: "sfx",    label: "EFFECTS", labelY: p.y + 108, track: track(108) },
      { key: "music",  label: "MUSIC",  labelY: p.y + 142, track: track(142),
        note: "none yet" }
    ],
    presets: [
      { key: "quiet",  label: "Quiet",  x: inner,       y: p.y + 178, w: 76, h: 24 },
      { key: "normal", label: "Normal", x: inner + 82,  y: p.y + 178, w: 76, h: 24 },
      { key: "loud",   label: "Loud",   x: inner + 164, y: p.y + 178, w: 76, h: 24 }
    ]
  };
}

function audioVolumeOf(key) {
  if (key === "sfx") return Sound.sfxVolume;
  if (key === "music") return Sound.musicVolume;
  return Sound.masterVolume;
}

function setAudioVolume(key, value) {
  if (key === "sfx") Sound.setSfxVolume(value);
  else if (key === "music") Sound.setMusicVolume(value);
  else Sound.setMasterVolume(value);
}

// Which slider is under a point, or null. The vertical slop is deliberate and
// generous: the track is six pixels tall and nobody can hit six pixels.
function audioSliderAt(x, y) {
  if (!audioPanelOpen) return null;
  var L = audioPanelLayout();
  for (var i = 0; i < L.sliders.length; i++) {
    var t = L.sliders[i].track;
    if (x >= t.x - 9 && x <= t.x + t.w + 9 &&
        y >= t.y - 11 && y <= t.y + t.h + 11) {
      return L.sliders[i].key;
    }
  }
  return null;
}

// Set a slider from a cursor position. Used by both the press and the drag, so
// grabbing the handle and clicking somewhere on the track are one code path.
function dragAudioSliderTo(key, x) {
  var L = audioPanelLayout();
  for (var i = 0; i < L.sliders.length; i++) {
    if (L.sliders[i].key !== key) continue;
    var t = L.sliders[i].track;
    setAudioVolume(key, (x - t.x) / t.w);
    return;
  }
}

// Did this press start a slider drag? Called from onMouseDown, ABOVE the 3D
// early-return there, because a mixer has to work on the board the game
// actually ships with.
function audioPanelMouseDown(x, y) {
  var key = audioSliderAt(x, y);
  if (!key) return false;
  audioDrag = key;
  dragAudioSliderTo(key, x);
  Sound.unlock();
  return true;
}

// Did this click land on the audio button or inside the panel? Returns true
// when it was consumed, which is the same contract runPanelAction has.
function audioPanelClick(x, y) {
  if (pointInRect(x, y, audioButtonRect())) {
    audioPanelOpen = !audioPanelOpen;
    Sound.playUIClick();
    return true;
  }
  if (!audioPanelOpen) return false;

  var L = audioPanelLayout();
  if (!pointInRect(x, y, L.panel)) return false;

  if (pointInRect(x, y, L.close)) {
    audioPanelOpen = false;
    Sound.playUIClick();
    return true;
  }

  if (pointInRect(x, y, L.mute)) {
    var nowMuted = Sound.toggleMute();
    // The click that UNMUTES gets to be heard; the one that mutes does not,
    // which is the honest confirmation in each direction.
    if (!nowMuted) Sound.playUIClick();
    return true;
  }

  for (var i = 0; i < L.presets.length; i++) {
    if (!pointInRect(x, y, L.presets[i])) continue;
    Sound.applyPreset(L.presets[i].key);
    Sound.playUIClick();          // at the new level, so it doubles as a demo
    return true;
  }

  // A slider press was already handled on mousedown. Everything else inside
  // the panel is dead space that must still EAT the click -- anything drawn
  // over the map has to, or the player builds a tower underneath the mixer.
  return true;
}

function drawAudioButton() {
  var r = audioButtonRect();
  var hot = pointInRect(mouse.x, mouse.y, r);
  var muted = Sound.muted || Sound.masterVolume <= 0;

  ctx.fillStyle = audioPanelOpen ? "rgba(140,179,230,0.20)" : "rgba(28,30,38,0.85)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = audioPanelOpen
    ? "rgba(140,179,230,0.95)"
    : (hot ? "rgba(199,209,224,0.55)" : "rgba(199,209,224,0.30)");
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

  var colour = muted ? "#e0736e" : (audioPanelOpen ? "#8cb3e6" : "rgba(199,209,224,0.80)");
  var cx = r.x + 15;
  var cy = r.y + r.h / 2;

  // A speaker cone, drawn rather than typed: a glyph would depend on the
  // system font having it, and this HUD is otherwise all shapes.
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - 3);
  ctx.lineTo(cx - 1, cy - 3);
  ctx.lineTo(cx + 4, cy - 8);
  ctx.lineTo(cx + 4, cy + 8);
  ctx.lineTo(cx - 1, cy + 3);
  ctx.lineTo(cx - 5, cy + 3);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.6;
  if (muted) {
    // The slash. Two strokes so it reads at a glance from across the screen,
    // which is the whole point of a mute indicator.
    ctx.beginPath();
    ctx.moveTo(cx + 9, cy - 6);
    ctx.lineTo(cx + 19, cy + 6);
    ctx.moveTo(cx + 19, cy - 6);
    ctx.lineTo(cx + 9, cy + 6);
    ctx.stroke();
  } else {
    // Two arcs, and how many are lit is the volume. The reading is the same
    // idea as the chevrons on the speed button beside it.
    var arcs = Sound.masterVolume > 0.55 ? 2 : 1;
    for (var i = 0; i < arcs; i++) {
      ctx.beginPath();
      ctx.arc(cx + 4, cy, 7 + i * 5, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
    }
  }
}

function drawAudioPanel() {
  if (!audioPanelOpen) return;
  var L = audioPanelLayout();
  var p = L.panel;

  ctx.fillStyle = "rgba(18,19,26,0.94)";
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(140,179,230,0.45)";
  ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#8cb3e6";
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillText("AUDIO", p.x + 14, p.y + 12);

  // Close.
  var closeHot = pointInRect(mouse.x, mouse.y, L.close);
  ctx.strokeStyle = closeHot ? "#ffffff" : "rgba(199,209,224,0.55)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(L.close.x + 7, L.close.y + 7);
  ctx.lineTo(L.close.x + 17, L.close.y + 17);
  ctx.moveTo(L.close.x + 17, L.close.y + 7);
  ctx.lineTo(L.close.x + 7, L.close.y + 17);
  ctx.stroke();

  // Mute.
  var m = L.mute;
  var muteHot = pointInRect(mouse.x, mouse.y, m);
  ctx.fillStyle = Sound.muted ? "rgba(224,115,110,0.20)" : "rgba(140,230,157,0.14)";
  ctx.fillRect(m.x, m.y, m.w, m.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = Sound.muted
    ? "rgba(224,115,110,0.90)"
    : (muteHot ? "rgba(140,230,157,0.90)" : "rgba(140,230,157,0.55)");
  ctx.strokeRect(m.x + 0.5, m.y + 0.5, m.w - 1, m.h - 1);

  ctx.beginPath();
  ctx.arc(m.x + 16, m.y + m.h / 2, 5, 0, Math.PI * 2);
  ctx.fillStyle = Sound.muted ? "#e0736e" : "#8ce69d";
  ctx.fill();

  ctx.font = "600 12px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = Sound.muted ? "#e0736e" : "#8ce69d";
  ctx.fillText(Sound.muted ? "MUTED" : "SOUND ON", m.x + 28, m.y + m.h / 2);

  ctx.textAlign = "right";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillStyle = "rgba(199,209,224,0.45)";
  ctx.fillText("M", m.x + m.w - 10, m.y + m.h / 2);
  ctx.textAlign = "left";

  // Sliders.
  for (var i = 0; i < L.sliders.length; i++) {
    var s = L.sliders[i];
    var value = audioVolumeOf(s.key);
    var t = s.track;
    var live = !Sound.muted;

    ctx.textBaseline = "top";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = live ? "rgba(199,209,224,0.80)" : "rgba(199,209,224,0.35)";
    ctx.fillText(s.label, t.x, s.labelY);

    if (s.note) {
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillStyle = "rgba(199,209,224,0.30)";
      ctx.fillText("(" + s.note + ")", t.x + 48, s.labelY + 1);
    }

    ctx.textAlign = "right";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = live ? "#8cb3e6" : "rgba(199,209,224,0.35)";
    ctx.fillText(Math.round(value * 100) + "%", p.x + p.w - 14, s.labelY);
    ctx.textAlign = "left";

    // Track, then the filled part, then the handle. Drawn as three rectangles
    // rather than one gradient so the level is readable at a glance in the
    // corner of the eye, which is where this panel will actually be looked at.
    ctx.fillStyle = "rgba(199,209,224,0.16)";
    ctx.fillRect(t.x, t.y, t.w, t.h);

    ctx.fillStyle = live ? "rgba(140,179,230,0.85)" : "rgba(199,209,224,0.25)";
    ctx.fillRect(t.x, t.y, t.w * value, t.h);

    var hx = t.x + t.w * value;
    var grabbed = (audioDrag === s.key);
    ctx.beginPath();
    ctx.arc(hx, t.y + t.h / 2, grabbed ? 8 : 6.5, 0, Math.PI * 2);
    ctx.fillStyle = live ? (grabbed ? "#ffffff" : "#8cb3e6") : "rgba(199,209,224,0.35)";
    ctx.fill();
  }

  // Presets. The active one is lit, so the three buttons read as a setting
  // rather than as three things to press.
  var active = Sound.currentPreset();
  for (var k = 0; k < L.presets.length; k++) {
    var b = L.presets[k];
    var on = (active === b.key) && !Sound.muted;
    var hot = pointInRect(mouse.x, mouse.y, b);

    ctx.fillStyle = on ? "rgba(255,215,110,0.16)" : "rgba(28,30,38,0.85)";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = on
      ? "rgba(255,215,110,0.85)"
      : (hot ? "rgba(199,209,224,0.55)" : "rgba(199,209,224,0.25)");
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = on ? "#ffd76e" : "rgba(199,209,224,0.75)";
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}
