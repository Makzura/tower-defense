// ---------------------------------------------------------------------------
// Game
//
// Owns the path, waves, base health, cash, tower placement, and the main loop.
// ---------------------------------------------------------------------------

var VIEW_WIDTH = 1280;
var VIEW_HEIGHT = 720;
var MAX_CANVAS_SCALE = 3;

// Enemies arrive in finite, data-driven waves. A wave starts by spawning its
// first enemy immediately; `interval` is the spacing between later enemies in
// that same wave. The break begins when the previous wave's LAST enemy spawns.
//
// A wave says how MANY, how OFTEN, and (optionally) WHICH TYPE -- never how
// tough. Health comes from the type's row in Enemy.TYPES; a missing `type` is
// a stock normal. A wave may also carry a `health` override, which scales a
// type without inventing a tougher one.
//
// A WAVE MAY BE MIXED (v0.4.7). `groups: [...]` replaces the flat fields with
// a list of GROUPS, each with its own count/interval/type/health and an
// optional `lead` -- the pause before its first body, in place of the previous
// group's interval. The groups deploy in order, so a wave reads top to bottom
// as the thing the player will watch arrive: eighteen Fast, a two-second gap,
// then three Brutes walking into the mess.
//
// The flat form is not legacy, it is the single-group case, and half the
// schedule still uses it deliberately: a wave of one type is a QUESTION with
// one answer, and those are what teach the game. Mixed waves ask two at once,
// which is what makes the back half feel chaotic rather than merely bigger.
//
// waveGroups() is the one place the two forms are reconciled. Nothing else in
// the game reads `wave.count` or `wave.type` directly.
//
// CAMO WAVES ARE NEVER MIXED, and that is load-bearing rather than stylistic.
// A Smasher's swing damages whatever it physically reaches, camo included --
// it just will not TURN towards something it cannot see (see the camo table in
// AGENTS.md). With one visible enemy in the wave a detectionless Smasher would
// start swinging and take the camo down as collateral, and the whole
// buy-detection check the schedule is built around would quietly evaporate.
//
// THE V0.4.4 TWENTY-WAVE SPINE IS STILL HERE, IN ORDER. The `old N` tags below
// are that schedule's numbering, and each tagged wave still opens with that
// wave's exact count/interval/type. What v0.4.7 changed is that some of them
// now carry a second group behind that opening, and the back half's `health`
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
//   boss      (v0.4.7) the Tyrant, wave 35 only. 2500 HP, and it SILENCES
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
// WAVE 35 IS THE BOSS WAVE. The Tyrant walks in MID-WAVE: 2500 HP, the slowest
// thing in the game, and it does not damage towers -- it SHOOTS them and they
// go silent for two seconds. At half health it roars: a 200 point shield, a
// third again its speed, twice its rate of fire, and twenty-one bodies called
// back in at 1.5x. All of that is data on the `boss` row in Enemy.TYPES;
// nothing about the fight is special-cased in this file.
//
// FINISHING A WAVE PAYS a tenth of what it took to clear, on top of the usual
// damage income -- see waveBounty. About $1350 across the run.
//
// ON MEASURING THIS SCHEDULE: the owner has asked that it not be tuned by
// simulation, so these numbers are AUTHORED. The shape they are authored to is
// the one this file has always documented -- a steep back half, every counter
// affordable at the wave that demands it, and the v0.4.4 spine intact
// underneath. tools/simulate-campaign.js still exists if a future session
// needs to check that a CHANGE did not break something; do not retune from it
// without being asked.
//
// For the record, the last simulated readings (taken at 7776 HP, before this
// turn-up, and now stale): gunners alone lost on every route by wave 21; a
// board of gunners then Longshots with camo detection won on three of the four
// routes. They are kept only as the shape to watch for, not as targets.
// The gap between one wave's last spawn and the next wave's first.
//
// 90 s since 2026-07-29, up from 5 (the owner's words: "delay between waves is
// too short"). Five seconds is not a decision, it is a countdown you watch --
// too short to walk a full board, read a panel, compare two upgrades on the
// hover cards, or place anything deliberate. The break is where this game is
// actually PLAYED, and it was the one part of the loop that was rushed.
//
// It costs nothing to lengthen it, which is why 90 and not 15: income is a
// bounty paid once per kill and never a trickle over time, so idle seconds
// earn exactly nothing. A long break buys the player thinking room and buys
// them no advantage -- it cannot be farmed, only used or skipped. Nothing in
// the balance maths is a function of wall-clock time.
//
// 90 is a CEILING, not a wait, and since v0.4.7 it is a ceiling that rarely
// binds: callNextWave() puts the next wave three seconds out the moment the
// player clicks Send OR the board goes empty, and the button that calls it is
// on screen for the whole break (see waveSkipButtonRect). What the 90 still
// buys is a floor under a board that is LOSING -- with something still walking
// you get as long as you need to answer it.
var WAVE_BREAK = 90;

// How long a CALLED wave takes to arrive. 2026-07-29 (v0.4.7), at the owner's
// request: "the next wave is sent after a timer of 3 seconds, whenever the
// skip wave button is clicked or when all enemies from the last wave are
// killed, or of course if the timer of 90 sec ends".
//
// So there are now three ways a break ends and only two speeds. The 90 s
// ceiling still fires on its own; the other two -- the button, and the board
// going empty -- do not spawn instantly, they put three seconds on the clock.
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
// The two are different events even though both end a break early: pressing
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
  // WAVES 1-4 ARE UNTOUCHED and stay that way. They are the shape the opening
  // purchase is measured against, and 2026-07-30's "make the scaling bigger"
  // is about the CURVE -- turning up the wave that teaches a player what a
  // Slow is would not make the game harder, only slower to get going. From 5
  // on the `health` overrides start, and they never stop.
  { count: 5,  interval: 0.8 },                                   //  20 HP  old 1
  { count: 8,  interval: 1 },                                     //  32 HP  old 2
  { count: 8,  interval: 0.6,  type: "fast" },                    //  16 HP  old 3
  { count: 12, interval: 0.7 },                                   //  48 HP  old 4
  { count: 6,  interval: 1.4,  type: "slow",    health: 9 },      //  54 HP  old 5
  { count: 14, interval: 0.4,  type: "fast",    health: 3 },      //  42 HP  old 6
  { count: 20, interval: 0.28, type: "swarm" },                   //  20 HP  first swarm
  { count: 16, interval: 0.55, health: 6 },                       //  96 HP  old 7
  { count: 10, interval: 0.9,  type: "armored", health: 7 },      //  70 HP  first 20% defense
  { count: 10, interval: 1,    type: "slow",    health: 14 },     // 140 HP  old 8

  // --- 11: THE MIDBOSS. The line the roster is split on.
  //
  // 420 rather than the type's own 250 (2026-07-30). The base has 100 HP and
  // pays an enemy's REMAINING health on a leak, so this was already a wave you
  // could not simply let through; what the extra 170 buys is that you can no
  // longer half-answer it either -- a board that gets it to 40% still loses.
  { count: 1,  interval: 1,    type: "midboss", health: 420 },    // 420 HP

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
  { groups: [                                                     // 242 HP  old 9 + company
    { count: 18, interval: 0.35, type: "fast", health: 5 },
    { count: 16, interval: 0.22, type: "swarm", health: 2, lead: 2 },
    { count: 12, interval: 0.8,  health: 10, lead: 2.5 }
  ] },
  { count: 8,  interval: 1.5,  type: "angry", health: 18 },       // 144 HP  first attacker -- PURE
  { count: 10, interval: 0.9,  type: "camo_normal", health: 7 },  //  70 HP  first camo -- PURE
  { count: 5,  interval: 2.2,  type: "shielded", health: 15 },    // 225 HP  first shield -- PURE
  { groups: [                                                     // 382 HP  old 10 + company
    { count: 14, interval: 0.8,  type: "slow", health: 15 },
    { count: 24, interval: 0.18, type: "swarm", health: 3, lead: 2 },
    { count: 10, interval: 0.9,  type: "armored", health: 10, lead: 2 }
  ] },
  { groups: [                                                     // 384 HP
    { count: 30, interval: 0.18, type: "swarm", health: 3 },
    { count: 14, interval: 0.55, health: 13, lead: 2 },
    { count: 16, interval: 0.3,  type: "fast", health: 7, lead: 2 }
  ] },
  { count: 12, interval: 0.6,  type: "camo_fast", health: 9 },    // 108 HP  camo again -- PURE
  { groups: [                                                     // 668 HP  old 11 + company
    { count: 16, interval: 0.5,  health: 18 },
    { count: 5,  interval: 1.8,  type: "shielded", health: 16, lead: 2 },
    { count: 14, interval: 0.3,  type: "fast", health: 10, lead: 2 }
  ] },
  { count: 4,  interval: 2.5,  type: "brute", health: 75 },       // 300 HP  first flat armor -- PURE
  { count: 6,  interval: 1.8,  type: "revenant", health: 26 },    // 312 HP  first second wind -- PURE

  // --- 22-34: the back half. Three or four types a wave, every wave.
  //
  // The `health` overrides climb steeply from here — that is where the bulk of
  // the 13 500 lives. They scale a type without inventing a tougher one, and
  // they never touch defences: a 70 HP Brute still carries its 5 flat armor, a
  // scaled Bulwark still gets twice its (new) health in shield and still
  // doubles its speed when that breaks.
  { groups: [                                                     // 652 HP  old 12 + company
    { count: 12, interval: 0.4,  type: "fast", health: 18 },
    { count: 4,  interval: 2.2,  type: "brute", health: 85, lead: 2 },
    { count: 24, interval: 0.15, type: "swarm", health: 4, lead: 2 }
  ] },
  { groups: [                                                     // 760 HP  old 13 + company
    { count: 14, interval: 0.7,  type: "slow", health: 26 },
    { count: 6,  interval: 1.4,  type: "angry", health: 30, lead: 3 },
    { count: 4,  interval: 1.8,  type: "shielded", health: 18, lead: 2 }
  ] },

  // --- 24: THE SKY OPENS. The Aether Wisp's only pure wave. --------------
  //
  // PURE for the same reason the camo waves are, and the reason is the Smasher
  // again: it will not turn towards something it cannot see, but its swing
  // damages whatever it physically reaches. One ground body in this wave and a
  // board with no air reach would clear the flyers as collateral, and the one
  // question this wave exists to ask would evaporate.
  //
  // 90 HP against a 100 HP base, deliberately. A player who never bought air
  // reach leaks the entire wave and lives on ten points -- ruined, warned, and
  // still holding the break in which to fix it. That is a harder version of
  // what waves 14 and 18 do for camo, and it is the last free lesson in the
  // campaign: flyers ride along in 31 and 35, and in the Tyrant's roar, with
  // everything else.
  { count: 10, interval: 0.8,  type: "flying", health: 9 },       //  90 HP  first flight -- PURE

  // Wave 25 introduces the Fractal Slime at T3: one 64 HP body which divides
  // through T2, T1 and T0 when killed. Only the root is authored here; all 84
  // descendants are produced by the one type's `fractal` block.
  { groups: [                                                     // 984 effective HP + split generations
    { count: 20, interval: 0.45, health: 22 },
    { count: 5,  interval: 1.8,  type: "shielded", health: 20, lead: 2 },
    { count: 10, interval: 0.7,  type: "armored", health: 18, lead: 2 },
    { count: 1,  interval: 1,    type: "fractal_slime", tier: 3, lead: 3 }
  ] },
  { count: 2,  interval: 5,    type: "hive", health: 220 },       // 440 HP  first spawner -- its BROOD is the cost

  // --- 27: THE PHALANX. The Shieldbearer's introduction. ------------------
  //
  // Two supporters at the back of an otherwise ordinary wave. Every ten
  // seconds each one hands 20 points of STACKING shield to the ten strongest
  // bodies on the road without raising any bounty -- so this wave gets steadily
  // more expensive for exactly as long as the player ignores the two slowest
  // things in it. Left alone for a minute, twelve Armored are wearing 240
  // points of extra plating between them.
  //
  // The lesson is stated by the arithmetic, not by the readout: shoot the
  // support, not what it is propping up.
  { groups: [                                                     // 848 HP  old 15 + the support
    { count: 18, interval: 0.3,  type: "fast", health: 16 },
    { count: 12, interval: 0.6,  type: "armored", health: 20, lead: 2 },
    { count: 2,  interval: 3,    type: "shieldbearer", health: 160, lead: 2 }
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
  { groups: [                                                     // 486 HP  ALL CAMO
    { count: 12, interval: 0.9,  type: "camo_normal", health: 18 },
    { count: 6,  interval: 1.6,  type: "camo_heavy", health: 45, lead: 2 }
  ] },

  { groups: [                                                     // 2074 HP  old 16 + Colossus + escort
    { count: 16, interval: 0.6,  type: "slow", health: 34 },
    { count: 5,  interval: 1.8,  type: "shielded", health: 24, lead: 2 },
    { count: 4,  interval: 2.2,  type: "brute", health: 95, lead: 2 },
    { count: 1,  interval: 1,    type: "colossus", lead: 3 },
    { count: 2,  interval: 2.5,  type: "shieldbearer", health: 120, lead: 2 }
  ] },

  // --- 30: THE NURSERY. Three Hives, and two Shieldbearers behind them. ---
  //
  // The nastiest arithmetic in the schedule, and none of it is in the 1200.
  // Three living Hives drop fifteen hatchlings every seven seconds, each one
  // already wearing its own life again in shield and each one paying NOTHING.
  // The Shieldbearers then pulse onto the ten STRONGEST bodies on the road --
  // which, while three Hives are alive, means the Hives.
  //
  // So the wave defends its own engine. Kill the Shieldbearers and the Hives
  // are ordinary work; kill the Hives and the Shieldbearers are propping up a
  // crowd of specks. Do neither and the road fills faster than any board can
  // empty it.
  { groups: [                                                     // 1200 HP + broods + free shield
    { count: 3,  interval: 6,    type: "hive", health: 180 },
    { count: 2,  interval: 4,    type: "shieldbearer", health: 170, lead: 3 },
    { count: 30, interval: 0.15, type: "swarm", health: 5, lead: 2 },
    { count: 5,  interval: 1.4,  type: "angry", health: 34, lead: 2 }
  ] },
  { groups: [                                                     // 1510 HP  old 17 + company
    { count: 24, interval: 0.4,  health: 26 },
    { count: 4,  interval: 2.2,  type: "brute", health: 100, lead: 2 },
    { count: 5,  interval: 1.6,  type: "shielded", health: 22, lead: 2 },
    { count: 12, interval: 0.5,  type: "flying", health: 13, lead: 2 }
  ] },

  // --- 32: THE FIELD HOSPITAL. The Healer's introduction. ----------------
  //
  // Three Healers and five Revenants in the same wave, which is the whole
  // joke: the Revenant already gets up once at full health, and the Healers
  // put 60 points onto whichever three bodies the board has just spent its
  // shots on. Healing never raises a body's fixed kill bounty, so every point
  // of it is extra work.
  //
  // The counter is burst, not throughput. A pulse lands every eight seconds
  // and heals over four -- damage that arrives faster than 15 HP/s outruns it,
  // damage that trickles never does.
  { groups: [                                                     // 1680 HP  old 18 + the support
    { count: 20, interval: 0.28, type: "fast", health: 18 },
    { count: 10, interval: 0.6,  type: "armored", health: 22, lead: 2 },
    { count: 3,  interval: 2.5,  type: "healer", health: 260, lead: 2 },
    { count: 5,  interval: 1.6,  type: "revenant", health: 32, lead: 2 }
  ] },
  { groups: [                                                     // 1952 HP  old 19 + company
    { count: 18, interval: 0.55, type: "slow", health: 38 },
    { count: 2,  interval: 5,    type: "hive", health: 200, lead: 3 },
    { count: 6,  interval: 1.6,  type: "shielded", health: 26, lead: 2 },
    { count: 4,  interval: 2.2,  type: "brute", health: 100, lead: 2 }
  ] },

  // --- 34: THE VANGUARD. The first of the two boss waves. ----------------
  //
  // It arrives behind a river of swarm, four seconds after the last speck, and
  // it does not walk in -- it SPRINTS the first 400 u.l. at 175 u.l./s, the
  // fastest anything in this game moves, across the ground where a board is
  // always thinnest. Every seven seconds it refreshes 100 points of shield,
  // which never stacks: a board that cannot take 100 shield plus a slice of
  // health off it inside seven seconds never touches the body at all.
  //
  // AND TWO SHIELDBEARERS COME IN BEHIND IT. Support has no reach limit and
  // picks the strongest thing on the road, which is the Vanguard by a factor
  // of seven -- so the escort keeps stacking 40 more points onto it every ten
  // seconds from the back of the map, on top of its own refresh. The answer is
  // to kill two 180 HP supporters at the rear while the boss is in front of
  // you, which is the same lesson as wave 27 asked at a moment when there is
  // no room to learn it.
  { groups: [                                                     // 2500 HP + free shield
    { count: 30, interval: 0.15, type: "swarm", health: 6 },
    { count: 1,  interval: 1,    type: "boss_fast", health: 1400, lead: 4 },
    { count: 16, interval: 0.3,  type: "fast", health: 20, lead: 2 },
    { count: 2,  interval: 3,    type: "shieldbearer", health: 180, lead: 2 },
    { count: 6,  interval: 1.3,  type: "angry", health: 40, lead: 2 }
  ] },

  // --- 35: THE BOSS WAVE. -------------------------------------------------
  //
  // 7000 HP, of which 5000 is the Tyrant itself, and it arrives IN THE MIDDLE
  // of the wave rather than at its head (2026-07-29, at the owner's request).
  //
  // The wave takes about 44 seconds to deploy. Thirty normals cross the first
  // ten of those; eight Aether Wisps come over the top of them; then a SIX
  // SECOND lead -- a deliberate silence, the only one this long in the
  // schedule -- and the Tyrant walks in at about the twenty-two second mark,
  // dead on the halfway point. Ten Angries and six Bulwarks arrive behind it
  // while it is still crossing.
  //
  // The lead is 6 and not 2 because that gap is what makes the entrance land:
  // at the group's ordinary spacing the boss is just the next thing out of the
  // gate. And it is placed mid-wave rather than at the head because a boss at
  // the head of a wave is a duel, while a boss in the middle of one is a wave
  // you have to keep answering with a boss in the way.
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
  { groups: [                                                     // 7000 HP  old 20 + the Tyrant
    { count: 30, interval: 0.35, health: 30 },
    { count: 8,  interval: 0.5,  type: "flying", health: 20, lead: 2 },
    { count: 1,  interval: 1,    type: "boss", lead: 6 },
    { count: 10, interval: 1.1,  type: "angry", health: 40, lead: 3 },
    { count: 6,  interval: 1.5,  type: "shielded", health: 30, lead: 2 }
  ] }
];

// Campaign difficulty. The schedule above is EASY. Normal and Hard are
// authored from that spine with three explicit levers:
//
//   count / health   more work on the road, and therefore more bounty income
//   interval / lead  denser arrivals, which do NOT fund the player
//   additions        the five former sandbox-only enemies, whose shields,
//                    healing, flight and opening sprint create new checks
//
// The density and support enemies are what make the tiers genuinely harder.
// Raising health alone mostly pays for its own answer in this economy --
// `Enemy.bountyOf` scales a type's bounty with the health a wave authors, so a
// tougher body is worth proportionally more. That was true when income was
// $3 per point of damage and it stayed true when bounties replaced it, which
// is the whole reason these three levers survived the economy change.
//
// EASY IS NO LONGER THE v0.4.6 SPINE. The 2026-07-30 rescale roughly doubled
// it (11,706 -> 23,782 scheduled HP, Tyrant 2500 -> 5000, the last five types
// scheduled into waves 24-35). These additions were authored against the
// softer spine and have NOT been retuned for the harder one, so Normal and
// Hard are currently a smaller step up from Easy than they were designed to
// be. Retuning them is a separate job.
//
// Every tier remains 35 waves so run rewards and the midboss/final-boss arc
// keep the same shape. The extra groups below are keyed by zero-based wave
// index. Camo Heavy is only added to already-pure camo waves: mixing a visible
// body into one would let a detectionless Warbringer hit the camo as
// collateral and erase the detection check.
var NORMAL_WAVE_ADDITIONS = {
  11: [{ count: 10, interval: 0.42, type: "flying", health: 8, lead: 2 }],
  15: [{ count: 1, interval: 1, type: "shieldbearer", lead: 3 }],
  17: [{ count: 3, interval: 1.25, type: "camo_heavy", health: 24, lead: 2 }],
  23: [{ count: 1, interval: 1, type: "healer", lead: 3 }],
  31: [{ count: 1, interval: 1, type: "boss_fast", health: 850, lead: 4 }]
};

var HARD_WAVE_ADDITIONS = {
  11: [{ count: 16, interval: 0.3, type: "flying", health: 10, lead: 1.5 }],
  14: [{ count: 2, interval: 1.2, type: "shieldbearer", health: 75, lead: 2 }],
  17: [{ count: 6, interval: 0.9, type: "camo_heavy", health: 30, lead: 1.5 }],
  21: [{ count: 2, interval: 1.2, type: "shieldbearer", health: 90, lead: 2 }],
  23: [{ count: 2, interval: 2, type: "healer", health: 240, lead: 2 }],
  27: [{ count: 4, interval: 1, type: "camo_heavy", health: 36, lead: 1.5 }],
  28: [{ count: 12, interval: 0.28, type: "flying", health: 14, lead: 1.5 }],
  29: [{ count: 2, interval: 2, type: "healer", health: 280, lead: 2 }],
  31: [{ count: 1, interval: 1, type: "boss_fast", health: 1000, lead: 3 }],
  33: [
    { count: 3, interval: 1, type: "shieldbearer", health: 110, lead: 2 },
    { count: 1, interval: 1, type: "healer", health: 320, lead: 2 }
  ],
  34: [
    { count: 1, interval: 1, type: "boss_fast", health: 1200, lead: 3 },
    { count: 2, interval: 1.2, type: "shieldbearer", health: 120, lead: 2 }
  ]
};

// A wave's groups, whichever form it was written in. The flat form IS the
// single-group case -- returned as a one-element array holding the wave
// itself, so `count`/`interval`/`type`/`health` are read off the same shape
// either way and no caller needs to know which form it got.
//
// This is the ONLY place the two forms are reconciled. Everything that wants
// to know what a wave contains -- the scheduler, the banner, the readout, the
// index screen's wave lists -- comes through here.
function waveGroups(wave) {
  return wave.groups || [wave];
}

// How many enemies a wave deploys in total, across all its groups.
function waveCount(wave) {
  var groups = waveGroups(wave);
  var total = 0;
  for (var i = 0; i < groups.length; i++) total += groups[i].count;
  return total;
}

// Which group the Nth enemy of a wave belongs to, and whether it is the body
// that OPENS a later group -- the one moment a `lead` applies. Returns null
// past the end of the wave.
//
// One walk of the group list rather than a precomputed index: a wave has at
// most three groups, this runs once per spawn, and a cached table would be a
// second thing that could disagree with WAVES.
function waveGroupAt(wave, n) {
  var groups = waveGroups(wave);
  for (var i = 0; i < groups.length; i++) {
    if (n < groups[i].count) {
      return { group: groups[i], opensGroup: n === 0 && i > 0 };
    }
    n -= groups[i].count;
  }
  return null;
}

// "18 × Fast + 12 × Swarm", for the wave banner. Display only.
function waveSummary(wave) {
  return waveGroups(wave).map(function (g) {
    return g.count + " × " + Enemy.typeOf(g.type).displayName;
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
// schedule it adds $2596 on top of $23 503 in scheduled kill bounties, so it
// stays a supplement rather than a second economy.
//
// What it actually buys is a CLEAN MOMENT TO SPEND. Kill income arrives in
// uneven lumps, and the clear bonus lands exactly when the break opens and the
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
// Wave-number driven, not difficulty driven: Normal and Hard run the same 35
// waves, so they inherit the same allowance and the same redistribution. Their
// extra groups pay for themselves through bounties, which is the lever the
// difficulty comment above describes.
function waveReward(wave, waveNumber) {
  return waveBounty(wave) +
    waveProgressionReward(waveNumber) +
    waveEscalatingReward(waveNumber);
}

function scaledScheduleNumber(value, scale, floor) {
  var result = Math.round(value * scale * 1000) / 1000;
  return Math.max(floor, result);
}

function difficultyGroup(group, tuning) {
  var copy = {
    count: Math.max(1, Math.ceil(group.count * tuning.countScale)),
    interval: scaledScheduleNumber(group.interval, tuning.intervalScale, 0.08),
    health: Math.max(1, Math.round(
      Enemy.healthOf(group.type, group.health) * tuning.healthScale
    ))
  };
  if (group.type !== undefined) copy.type = group.type;
  if (group.lead !== undefined) {
    copy.lead = scaledScheduleNumber(group.lead, tuning.leadScale, 0.5);
  }
  return copy;
}

function copyAuthoredGroup(group) {
  var copy = {};
  Object.keys(group).forEach(function (key) { copy[key] = group[key]; });
  return copy;
}

function buildDifficultyWaves(tuning, additions) {
  return EASY_WAVES.map(function (wave, waveNumber) {
    var groups = waveGroups(wave).map(function (group) {
      return difficultyGroup(group, tuning);
    });
    (additions[waveNumber] || []).forEach(function (group) {
      groups.push(copyAuthoredGroup(group));
    });
    return { groups: groups };
  });
}

var DIFFICULTY_ORDER = ["easy", "normal", "hard"];
var DIFFICULTIES = {
  easy: {
    id: "easy",
    name: "Easy",
    description: "The original 35-wave campaign.",
    waves: EASY_WAVES
  },
  normal: {
    id: "normal",
    name: "Normal",
    description: "Denser waves, tougher bodies, all enemy types.",
    waves: buildDifficultyWaves({
      countScale: 1.08,
      healthScale: 1.15,
      intervalScale: 0.84,
      leadScale: 0.9
    }, NORMAL_WAVE_ADDITIONS)
  },
  hard: {
    id: "hard",
    name: "Hard",
    description: "Relentless spacing and repeated support threats.",
    waves: buildDifficultyWaves({
      countScale: 1.2,
      healthScale: 1.35,
      intervalScale: 0.68,
      leadScale: 0.75
    }, HARD_WAVE_ADDITIONS)
  }
};

var selectedDifficultyId = "easy";
var WAVES = DIFFICULTIES.easy.waves;

function difficultyOf(id) {
  var difficulty = DIFFICULTIES[id];
  if (!difficulty) throw new Error("Unknown difficulty: " + id);
  return difficulty;
}

function setDifficulty(id) {
  var difficulty = difficultyOf(id);
  selectedDifficultyId = difficulty.id;
  WAVES = difficulty.waves;
  return difficulty;
}

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
// Called from exactly three places, and the ORDER they can fire in is the
// point:
//
//   1. the board going empty        -- the wave was DEFEATED, the honest case
//   2. callNextWave() succeeding    -- the player skipped, so the countdown to
//                                      the next wave has started
//   3. the next wave's first spawn  -- the 90 s ran out with stragglers still
//                                      walking; the wave is over regardless
//
// Wave 35 has no next wave and no break, so only (1) can reach it -- which is
// correct: the last bounty is paid for actually clearing the board.
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

// Auto-send: call every wave in the moment its break opens, with no click
// (2026-07-29, at the owner's request). The other half of the skip button --
// one is "I am ready now", this is "I will always be ready".
//
// Since v0.4.7 a called wave takes WAVE_CALL_DELAY seconds to arrive, so with
// this on a break is three seconds rather than one frame. That is deliberate
// and not a regression: it goes through the same callNextWave() the button
// does, which is what keeps "the automatic path and the button are the same
// path" true, and three seconds between waves is still an unattended campaign.
//
// The same kind of preference as gameSpeed and kept beside it deliberately:
// both are the player deciding how fast their own run goes, neither is run
// state, and neither is cleared by restartGame(). A player who turned
// auto-send on has said something about how they like to play, not about the
// run that just ended.
//
// It does NOT make the game easier. Waves arriving back to back are denser
// than waves ninety seconds apart -- the same enemies cross in one clump and a
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
// set ONLY by the scheduler naturally exhausting itself (spawnScheduledEnemy),
// never by waveIndex arithmetic -- tests and the sandbox switch waves off by
// setting `waveIndex = WAVES.length`, and that must not read as a win.
var victory = false;
var allWavesDeployed = false;

// Enemies destroyed this run, all damage sources. Counted where dead enemies
// are swept out of the list, so every tower type is included and nothing is
// counted twice. Display only -- nothing simulated reads it.
var runKills = 0;

// Meta coins are paid out once per run, at the moment it ends. `runAwarded`
// is the latch that guarantees the once; `lastRunCoins` is what the overlay
// shows. Both are RUN state -- restartGame() clears them -- even though the
// coins themselves outlive the run in js/meta.js.
var runAwarded = false;
var lastRunCoins = 0;

// `waveIndex` is the wave currently spawning, or the next wave during the
// between-wave break. `waveSpawned` counts enemies already deployed from it.
// Once all waves are deployed, waveIndex equals WAVES.length.
var waveIndex = 0;
var waveSpawned = 0;
var waveCountdown = 0;

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
// owns the gunner and the Smasher; the Longshot and the Siphon are bought
// with meta coins in the armoury. Everything downstream is unchanged -- the
// bar still reads constructors out of this array and knows nothing about what
// a gunner is -- so a slot being empty because it was never bought looks
// exactly like a slot being empty because nothing was written there.
//
// It is a `var` reassigned by rebuildBuildBar() rather than a live getter,
// because the geometry below (BAR_WIDTH) is computed from its length once at
// load, and every other reader indexes it in a hot loop.
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
var SLOT_SIZE = 76;
var SLOT_GAP = 10;
var BAR_WIDTH = BUILD_SLOTS.length * SLOT_SIZE + (BUILD_SLOTS.length - 1) * SLOT_GAP;
var BAR_X = (VIEW_WIDTH - BAR_WIDTH) / 2;
var BAR_Y = VIEW_HEIGHT - SLOT_SIZE - 18;


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
  paths = Maps.routesOf(map).map(function (route) {
    var gamePath = new GamePath(Maps.toWorld(route.points));
    gamePath.id = route.id;
    return gamePath;
  });
  path = paths[0];
}

function startRun(map, difficultyId) {
  if (difficultyId !== undefined) setDifficulty(difficultyId);
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

  cash = STARTING_CASH;
  baseHp = BASE_MAX_HP;
  gameOver = false;
  victory = false;
  allWavesDeployed = false;
  runKills = 0;
  runAwarded = false;
  lastRunCoins = 0;
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
  waveCountdown = RUN_START_DELAY;

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

  // The menu owns every click while it is up.
  if (screen === "menu") {
    if (pointInRect(p.x, p.y, playButtonRect())) openMapSelect();
    else if (pointInRect(p.x, p.y, storeButtonRect())) Store.open();
    else if (pointInRect(p.x, p.y, indexButtonRect())) Codex.open();
    else if (pointInRect(p.x, p.y, sandboxButtonRect())) openSandbox();
    return;
  }

  // The armoury owns every click while it is up, exactly as the index does.
  // Its Back button is handled here so the two screens cannot disagree about
  // how leaving works.
  if (screen === "store") {
    if (pointInRect(p.x, p.y, backButtonRect())) openMenu();
    else Store.onClick(p.x, p.y);
    return;
  }

  // The index owns every click while it is up. The Back button is handled
  // here, like the chooser's, so the two screens cannot disagree about how
  // leaving works; everything else on the screen is the codex's own.
  if (screen === "index") {
    if (pointInRect(p.x, p.y, backButtonRect())) openMenu();
    else Codex.onClick(p.x, p.y);
    return;
  }

  // The chooser owns every click while it is up.
  if (screen === "select") {
    if (pointInRect(p.x, p.y, backButtonRect())) {
      openMenu();
      return;
    }
    var difficulty = difficultyAt(p.x, p.y);
    if (difficulty !== null) {
      setDifficulty(difficulty);
      return;
    }
    var card = mapCardAt(p.x, p.y);
    if (card !== null) startRun(Maps.LIST[card]);
    return;
  }

  // The pause menu is the topmost modal: while it is up nothing underneath it
  // is clickable, so a click meant for a menu button cannot also land on the
  // board behind it.
  if (paused) {
    if (pointInRect(p.x, p.y, resumeButtonRect())) paused = false;
    else if (pointInRect(p.x, p.y, backToMenuButtonRect())) leaveRun();
    return;
  }

  // Loss and victory both freeze the board beneath an opaque overlay. Only
  // its buttons consume clicks until a new run begins -- same two buttons,
  // same geometry, on either outcome.
  if (gameOver || victory) {
    if (pointInRect(p.x, p.y, restartButtonRect())) restartGame();
    else if (pointInRect(p.x, p.y, changeMapButtonRect())) openMapSelect();
    // Through leaveRun(), not openMenu() directly -- that seam is what lets
    // the sandbox, which has no menu screen to switch to, send this button
    // back to index.html instead. See the Screens section of AGENTS.md.
    else if (pointInRect(p.x, p.y, mainMenuButtonRect())) leaveRun();
    return;
  }

  // Chrome over the map claims clicks before the map does, exactly like the
  // build bar below. It sits above the bar in this order only because it is
  // cheaper to test; the two rectangles do not overlap, so the order between
  // them cannot matter.
  if (pointInRect(p.x, p.y, speedButtonRect())) {
    cycleGameSpeed();
    return;
  }

  // Live for the whole run, unlike the skip beside it -- see
  // autoSkipButtonRect for why a toggle that vanished would be unturnable-off.
  if (waveControlsShown() && pointInRect(p.x, p.y, autoSkipButtonRect())) {
    toggleAutoSkipWaves();
    return;
  }

  // Only while there is a break to end -- outside one the rectangle is bare
  // map and builds on as usual.
  if (waveControlsShown() && betweenWaves() &&
      pointInRect(p.x, p.y, waveSkipButtonRect())) {
    skipNextWave();
    return;
  }

  // The build bar sits on top of the map, so it gets first claim on a click.
  var slot = slotAt(p.x, p.y);
  if (slot >= 0) {
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
  if (inspected && hitsBlubRail(p.x, p.y)) return;
  if (inspected && runPanelAction(p.x, p.y)) return;

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
    sellTower(inspected);
    return;
  }

  // Clicking a tower inspects it, whether or not a slot is armed -- you can
  // never build on top of one anyway, so there is nothing to compete with.
  var hit = towerAt(w.x, w.y);
  if (hit) {
    inspected = hit;
    return;
  }

  inspected = null;

  var type = selectedType();
  if (type && whyCannotBuild(w.x, w.y, type) === null) {
    var route = nearestPathTo(w.x, w.y);
    var built = new type(w.x, w.y, route.path);
    built.routeId = route.path.id;
    // Comparable across routes: scale completion on the nearest route onto the
    // primary route used by the target-claiming update order.
    built.pathProgress = route.progress / route.path.length * path.length;
    addTower(built);
    cash -= type.COST;

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

  // The menu owns the keyboard while it is up. Numbered top to bottom,
  // matching the buttons.
  if (screen === "menu") {
    if (event.key === "Enter" || event.key === "1") openMapSelect();
    else if (event.key === "2") Store.open();
    else if (event.key === "3" || event.key === "i" || event.key === "I") Codex.open();
    else if (event.key === "4" || event.key === "s" || event.key === "S") openSandbox();
    return;
  }

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
    var key = event.key.toLowerCase();
    if (key === "e") {
      setDifficulty("easy");
      return;
    }
    if (key === "n") {
      setDifficulty("normal");
      return;
    }
    if (key === "h") {
      setDifficulty("hard");
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
function whyCannotBuild(x, y, type) {
  for (var routeIndex = 0; routeIndex < paths.length; routeIndex++) {
    if (paths[routeIndex].distanceToPoint(x, y) < buildClearancePx(type)) {
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
// nothing else claims. The build bar is centred and ends at x=850, the scale
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
// auto-send on, a break lasts a single frame, so a toggle that only appeared
// during breaks could be switched on and then never switched off again. A
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
  if (waveControlsShown()) {
    if (pointInRect(x, y, autoSkipButtonRect())) return true;
    if (betweenWaves() && pointInRect(x, y, waveSkipButtonRect())) return true;
  }
  return false;
}

// The rectangle exists whether or not the button is on screen; everything that
// cares asks betweenWaves() first (see onClick and drawWaveSkipButton). One
// condition, three readers, so the button can never be drawn where it is not
// clickable or clickable where it is not drawn -- the same arrangement
// slotRect and inspectionLayout have.
function waveSkipButtonRect() {
  return { x: 22, y: 100, w: 168, h: 30 };
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
  if (baseHp === 0) gameOver = true;

  enemies = enemies.filter(function (e) { return !e.dead && !e.leaked; });
  if (splitChildren.length) enemies = enemies.concat(splitChildren);
  bullets = bullets.filter(function (b) { return !b.dead; });

  // Clearing the board CALLS THE NEXT WAVE IN (v0.4.7, at the owner's
  // request). FIVE seconds after the last body of a wave dies, the next one
  // starts walking -- three until 2026-07-31, when the owner asked for the
  // beaten-wave pause to be its own number (WAVE_CLEAR_DELAY) rather than the
  // Send button's. With auto-send on it is still three, because that call is
  // shorter and callNextWave takes the shorter of the two.
  //
  // Checked here, right after the sweep, because this is the one moment the
  // list is authoritative -- everything that died this step is out of it and
  // nothing new has spawned. It routes through callNextWave() rather than
  // touching the countdown, so it inherits the same betweenWaves() guard the
  // button and the auto-send toggle do, and it fires harmlessly every step
  // afterwards (the countdown is already at or below the ceiling, so the
  // Math.min changes nothing).
  //
  // Note what this does to the 90 s break: on a board that is killing
  // everything, almost every break now lasts five seconds instead of ninety.
  // That is the trade the owner asked for -- clearing fast is rewarded with
  // pressure, not with idle time -- but it does mean the thinking room the
  // long break was added for is now something the player earns by leaving
  // something alive.
  //
  // `!beforeFirstWave()` IS LOAD-BEARING, and it is the whole reason the opening
  // pause survives: an empty board is exactly what a run starts with, so without
  // it this branch would read the untouched road as a wave the player had just
  // beaten and cut RUN_START_DELAY down to WAVE_CLEAR_DELAY on the first step.
  // Ten seconds would have silently been five. A wave has to have HAPPENED for
  // clearing the board to mean anything.
  if (enemies.length === 0 && !beforeFirstWave()) {
    // The wave was DEFEATED. Pay first, then call: the bounty is for clearing
    // the board and belongs to this moment whether or not there is a next wave
    // to call in -- which is what pays wave 35, the only wave with no break
    // after it.
    payWaveBounty();
    callNextWave(WAVE_CLEAR_DELAY);
  }

  // The win: the scheduler ran itself dry AND the board is clear, with the
  // base still standing. Checked after the loss so that a final enemy that
  // both leaks-to-zero and empties the board reads as the defeat it is.
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
    lastRunCoins = MetaProgress.awardRun(reachedWave(), victory);
  }

  // Cosmetic timers advance on the same fixed step as the world they
  // decorate, and freeze when it freezes.
  if (typeof Effects !== "undefined") Effects.update(dt);

  // Cash changed this step, so affordability may have flipped.
  refreshBlockReason();
}

// Is the run waiting for a wave right now -- everything from the last wave
// spawned, nothing from the next one yet? The same test drives the readout, the
// button and the skip itself, so the button cannot appear at a moment pressing
// it would do nothing.
//
// IT NOW INCLUDES THE PAUSE BEFORE WAVE 1 (2026-07-31). This used to open with
// `waveIndex > 0`, for a reason that has been deleted rather than changed: a run
// began with waveCountdown at 0 and wave 1 already spawning, so there was no
// break there to describe. Since RUN_START_DELAY there is -- ten seconds of one
// -- and it is the same kind of moment in every way that matters to a player,
// so it is the same predicate. Dropping the guard is what gives the opening
// pause the Send button, the countdown and auto-send without a second code
// path; `beforeFirstWave` exists only for the two places that genuinely differ,
// the label on the button and how long pressing it takes.
function betweenWaves() {
  return waveIndex < WAVES.length && waveSpawned === 0 && waveCountdown > 0;
}

// Is this the opening pause, before wave 1 has put anything on the road?
//
// `waveSpawned === 0` is what makes it false the instant wave 1 starts and
// keeps it false for the rest of the run -- waveIndex only ever grows.
function beforeFirstWave() {
  return waveIndex === 0 && waveSpawned === 0;
}

// Call the next wave in early. Returns whether there was a break to end.
//
// It shortens the countdown rather than spawning anything itself: the
// scheduler in updateWaves() is the only thing that ever deploys an enemy, and
// a second spawn path would be a second place for `allWavesDeployed` and the
// wave banner to be got wrong. The countdown then runs out normally.
//
// Math.min, NOT assignment. A call can only ever bring the next wave CLOSER --
// with two seconds left on the clock, clicking Send would otherwise push the
// wave back to three, which is the opposite of what the button says it does.
//
// `delaySeconds` is how close the caller is entitled to bring it, and the three
// callers all want a different number: the button and auto-send take the default
// three, a cleared board takes five (WAVE_CLEAR_DELAY), and the Start button
// takes zero because a run that has not begun has nothing to interrupt. The
// Math.min above is what makes those numbers compose instead of fight -- with
// auto-send on, its three beats the board clear's five every time, which is the
// whole of "if not on auto skip" from the owner's instruction.
function callNextWave(delaySeconds) {
  if (!betweenWaves()) return false;
  var delay = (delaySeconds === undefined) ? WAVE_CALL_DELAY : delaySeconds;
  if (waveCountdown > delay) waveCountdown = delay;
  // Skipping the break ends the previous wave as far as the player is
  // concerned, so this is where its bounty lands: "at the start of the
  // countdown to the next wave if the wave was skipped". Before wave 1 there is
  // no bounty owed and this is a no-op, which is why the opening pause needs no
  // guard of its own.
  payWaveBounty();
  return true;
}

// The button's name for it, kept because the button, the auto-send toggle and
// three tests all speak in terms of skipping the break. Since v0.4.7 skipping
// means "in three seconds", not "now" -- see WAVE_CALL_DELAY.
//
// EXCEPT AT THE START OF A RUN, where it means now. The opening pause is the one
// break whose only content is waiting: there is no board to look up from and
// nothing in flight to resolve, so the three seconds that stop a wave landing
// on a distracted player would just be three more seconds of the thing the
// player pressed the button to stop. A button that says Start starts.
function skipNextWave() {
  return callNextWave(beforeFirstWave() ? 0 : WAVE_CALL_DELAY);
}

function updateWaves(dt) {
  if (waveIndex >= WAVES.length) return;

  // Auto-send: the break is called in the instant it opens, with no click.
  //
  // Routed through skipNextWave() rather than by zeroing the countdown here,
  // so the automatic path and the button are the same path. In particular it
  // inherits the "only ever ends a break" guard -- mid-wave this does nothing,
  // and it can never shorten the `interval` between enemies WITHIN a wave,
  // which is the one way an auto-skip could quietly rewrite the schedule
  // rather than just its pacing.
  if (autoSkipWaves) skipNextWave();

  waveCountdown -= dt;
  while (waveCountdown <= 0 && waveIndex < WAVES.length) {
    var nextDelay = spawnScheduledEnemy();
    if (nextDelay === null) {
      waveCountdown = 0;
      return;
    }
    // Add rather than assign so a long frame preserves any overshoot.
    waveCountdown += nextDelay;
  }
}

// Spawn the next scheduled enemy and return the delay until the one after it.
// null means every defined wave has been fully deployed.
function spawnScheduledEnemy() {
  if (waveIndex >= WAVES.length) return null;

  var wave = WAVES[waveIndex];
  var total = waveCount(wave);

  // Last chance for the PREVIOUS wave's bounty: the 90 s ceiling ran out with
  // stragglers still walking, so neither the board-clear nor a call ever fired.
  // The wave is over regardless -- the next one is arriving.
  if (waveSpawned === 0) payWaveBounty();

  // A wave's first enemy is the moment the wave visibly starts, so that is
  // when it is announced. Display only. AFTER the bounty, so the two banners
  // land in the order the player earned them.
  if (waveSpawned === 0 && typeof Effects !== "undefined") {
    Effects.announce(
      "Wave " + (waveIndex + 1) + " / " + WAVES.length,
      waveSummary(wave));
  }

  var slot = waveGroupAt(wave, waveSpawned);
  // One scheduled beat is mirrored onto every entrance, then the fixed wave
  // cursor advances once. Two routes mean twice the enemies, not a schedule
  // that runs twice as fast.
  for (var routeIndex = 0; routeIndex < paths.length; routeIndex++) {
    spawnEnemy(
      slot.group.health,
      slot.group.type,
      paths[routeIndex],
      paths[routeIndex].id
    );
  }
  waveSpawned++;

  if (waveSpawned < total) {
    // The delay before the NEXT body is that body's OWN group's spacing: a
    // group owns the rhythm its members arrive at, not the rhythm of whatever
    // walked in ahead of it. `lead` overrides that for the body that opens a
    // later group, which is how a mixed wave gets a beat of silence between
    // its halves instead of reading as one undifferentiated stream.
    var next = waveGroupAt(wave, waveSpawned);
    return (next.opensGroup && next.group.lead !== undefined)
      ? next.group.lead
      : next.group.interval;
  }

  // The wave is fully deployed, so its clear reward is now OWED -- it is paid
  // when the wave is actually over. See payWaveBounty.
  pendingBounty = waveReward(wave, waveIndex + 1);
  pendingBountyWave = waveIndex + 1;

  waveIndex++;
  waveSpawned = 0;
  if (waveIndex < WAVES.length) return WAVE_BREAK;

  // Natural exhaustion -- the last enemy of the last wave just spawned. This
  // assignment is deliberately the ONLY place the flag is set: tests and the
  // sandbox disable spawning with `waveIndex = WAVES.length`, and that must
  // never arm the victory check.
  allWavesDeployed = true;
  return null;
}

// `typeId` picks a row of Enemy.TYPES (undefined = normal); `health`
// overrides the type's health when present, which nothing scheduled does.
function spawnEnemy(health, typeId, routePath, routeId, tier) {
  routePath = routePath || path;
  enemies.push(new Enemy(routePath, health, typeId, {
    routeId: routeId || routePath.id || "main",
    tier: tier
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
      rangePx: ul(type.BASE_RANGE_UL),
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
  } else {
    ctx.fillStyle = (screen === "play" && typeof Maps !== "undefined" &&
      Maps.backgroundColor) ? Maps.backgroundColor(currentMap) : "#1c1e26";
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

  // Bars are interface attached to world actors, so they run as their own pass
  // and stay readable over every body regardless of depth order.
  for (i = 0; i < towers.length; i++) drawTowerHealth(towers[i]);

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
  if (world3D) World3D.drawOverlays(ctx, worldRenderState());

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
  drawGameOver();
  drawVictory();
  drawPauseMenu();

  // Full-screen effects sit above even the interface.
  if (typeof DeathDenial !== "undefined") DeathDenial.drawRewind(ctx);
}

function tracePath(routePath) {
  ctx.beginPath();
  ctx.moveTo(routePath.points[0].x, routePath.points[0].y);
  for (var i = 1; i < routePath.points.length; i++) {
    ctx.lineTo(routePath.points[i].x, routePath.points[i].y);
  }
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
    tracePath(routeList[i]);
    ctx.lineWidth = outer + 13;
    ctx.strokeStyle = "rgba(" + theme.roadEdge + ",0.18)";
    ctx.stroke();

    tracePath(routeList[i]);
    ctx.lineWidth = outer;
    ctx.strokeStyle = theme.roadOuter;
    ctx.stroke();

    tracePath(routeList[i]);
    ctx.lineWidth = outer - 8;
    ctx.strokeStyle = theme.roadInner;
    ctx.stroke();

    tracePath(routeList[i]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(" + theme.roadEdge + ",0.72)";
    ctx.stroke();

    ctx.save();
    ctx.setLineDash([14, 18]);
    tracePath(routeList[i]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(" + theme.roadCenter + ",0.82)";
    ctx.stroke();
    ctx.restore();
  }
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

function drawBuildPreview() {
  var type = selectedType();
  if (!type) return;                       // nothing armed, nothing to preview
  if (mouse.x < -100) return;              // cursor off the canvas
  // Cursor over the build bar or any other button: that click will never reach
  // the map, so promising a tower there would be a lie. See
  // overInterfaceChrome.
  if (overInterfaceChrome(mouse.x, mouse.y)) return;

  var previewRangePx = ul(type.BASE_RANGE_UL);
  var footprintPx = ul(type.FOOTPRINT_RADIUS_UL);

  var ok = blockReason === null;
  var c = ok ? "108,230,133" : "230,90,90";

  // Range
  ctx.beginPath();
  ctx.arc(worldMouse.x, worldMouse.y, previewRangePx, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(" + c + ",0.09)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(" + c + ",0.55)";
  ctx.stroke();

  // Footprint -- the space this tower would physically occupy
  ctx.beginPath();
  ctx.arc(worldMouse.x, worldMouse.y, footprintPx, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(" + c + ",0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (!ok) {
    ctx.fillStyle = "rgba(" + c + ",0.95)";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(blockReason, worldMouse.x,
      worldMouse.y + footprintPx + 8);
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

function waveStatusText() {
  var prefix = difficultyOf(selectedDifficultyId).name.toUpperCase() + "  ·  ";

  // The endgame read: everything has spawned, so the only number that matters
  // is how many are still walking.
  if (waveIndex >= WAVES.length) {
    return enemies.length > 0
      ? prefix + "All waves deployed  ·  " + enemies.length + " still walking"
      : prefix + "All waves deployed";
  }

  var number = waveIndex + 1;
  if (waveSpawned === 0) {
    // Whole seconds now the break is 90 s long. A tenth of a second mattered
    // when the whole gap was five of them; on a minute and a half it is just a
    // digit flickering in the corner of the eye all break.
    //
    // The `waveIndex > 0` this used to carry is gone with the one in
    // betweenWaves and for the same reason: since RUN_START_DELAY the opening
    // ten seconds are a countdown like any other, and "Wave 1 in 10 s" is the
    // line that tells a player the run has started and nothing is coming yet.
    return prefix + "Wave " + number + " in " +
      Math.max(0, Math.ceil(waveCountdown)) + " s";
  }
  return prefix + "Wave " + number + " / " + WAVES.length +
    "  ·  " + waveSpawned + " / " + waveCount(WAVES[waveIndex]) + " deployed";
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

// The break is 90 s and this is how a player gets those seconds back. Drawn
// only during a break, and only where it is clickable -- both from the same
// betweenWaves() test onClick uses.
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
  if (!betweenWaves()) return;

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

// The wave the player actually experienced last. During a between-wave break
// `waveIndex` already points at the wave that has not started, so a loss to
// stragglers in a break is credited to the wave that caused it, not the one
// that never came.
function reachedWave() {
  if (waveSpawned > 0) return waveIndex + 1;
  return Math.max(1, waveIndex);
}

function drawGameOver() {
  if (!gameOver) return;

  drawRunOverlay({
    title: "BASE DESTROYED",
    titleColor: "#e0736e",
    subtitle: difficultyOf(selectedDifficultyId).name + "  ·  Fell on wave " +
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
    titleColor: "#8ce69d",
    subtitle: difficultyOf(selectedDifficultyId).name + "  ·  All " +
      WAVES.length + " waves held  ·  " + runKills +
      " enemies destroyed  ·  " + Math.round(baseHp) + " base HP left"
  });
}

function drawRunOverlay(spec) {
  ctx.fillStyle = "rgba(10,11,16,0.82)";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = spec.titleColor;
  ctx.font = "700 52px system-ui, sans-serif";
  ctx.fillText(spec.title, VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 42);

  ctx.fillStyle = "#c7d1e0";
  ctx.font = "18px system-ui, sans-serif";
  ctx.fillText(spec.subtitle, VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 4);

  // What the run was worth, and what that buys. The payout is shown on BOTH
  // endings for the same reason the buttons are the same on both: "what do I
  // do next" has one answer either way, and here the answer is usually
  // "spend this in the armoury".
  ctx.fillStyle = "#ffd76e";
  ctx.font = "600 17px system-ui, sans-serif";
  ctx.fillText("+" + lastRunCoins + " ⬡   ·   " + MetaProgress.coins() + " meta coins banked",
    VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 24);

  drawOverlayButton(restartButtonRect(),
    "Restart " + (currentMap ? currentMap.name : ""));
  drawOverlayButton(changeMapButtonRect(), "Choose another route");
  drawOverlayButton(mainMenuButtonRect(), "Main menu");

  ctx.fillStyle = "rgba(199,209,224,0.65)";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("R / Enter to restart    ·    M for another route    ·    Escape for the menu",
    VIEW_WIDTH / 2, mainMenuButtonRect().y + 64);

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
    ctx.fillText(String(i + 1), r.x + 6, r.y + 5);

    if (type === null) continue;

    // Unaffordable towers stay visible but read as inert.
    ctx.globalAlpha = affordable ? 1 : 0.4;
    type.drawIcon(ctx, r.x + r.w / 2, r.y + 30, 22);
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = affordable ? "#c7d1e0" : "rgba(199,209,224,0.4)";
    ctx.fillText(type.DISPLAY_NAME, r.x + r.w / 2, r.y + 42);

    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillStyle = affordable ? "#ffd76e" : "#e0736e";
    ctx.fillText("$" + type.COST, r.x + r.w / 2, r.y + 57);
  }

  ctx.textAlign = "left";
}

// The pause menu. Drawn above every other piece of interface, because it is a
// modal and nothing under it is clickable while it is up.
function drawPauseMenu() {
  if (!paused) return;

  ctx.fillStyle = "rgba(10,11,16,0.82)";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#cfe3ff";
  ctx.font = "700 46px system-ui, sans-serif";
  ctx.fillText("PAUSED", VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 96);

  // Where the run stands, so the menu is worth opening for more than leaving.
  ctx.fillStyle = "rgba(199,209,224,0.75)";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText((currentMap ? currentMap.name + "  ·  " : "") +
    difficultyOf(selectedDifficultyId).name + "  ·  Wave " + reachedWave() +
    " of " + WAVES.length + "  ·  " +
    towers.length + " towers  ·  " + runKills + " destroyed  ·  Base " +
    Math.round(baseHp), VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 52);

  drawOverlayButton(resumeButtonRect(), "Resume");
  drawOverlayButton(backToMenuButtonRect(), "Back to main menu");

  ctx.fillStyle = "rgba(199,209,224,0.55)";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("Esc to resume  ·  leaving does not save this run",
    VIEW_WIDTH / 2, backToMenuButtonRect().y + 74);

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

function difficultyRect(i) {
  var width = 236;
  var gap = 14;
  var total = DIFFICULTY_ORDER.length * width +
    (DIFFICULTY_ORDER.length - 1) * gap;
  return {
    x: (VIEW_WIDTH - total) / 2 + i * (width + gap),
    y: 104,
    w: width,
    h: 42
  };
}

function difficultyAt(x, y) {
  for (var i = 0; i < DIFFICULTY_ORDER.length; i++) {
    if (pointInRect(x, y, difficultyRect(i))) return DIFFICULTY_ORDER[i];
  }
  return null;
}

function mapCardRect(i) {
  var col = i % MAP_CARD_COLS;
  var row = Math.floor(i / MAP_CARD_COLS);
  var cols = Math.min(MAP_CARD_COLS, Maps.LIST.length);
  var total = cols * CARD_W + (cols - 1) * CARD_GAP;
  return {
    x: (VIEW_WIDTH - total) / 2 + col * (CARD_W + CARD_GAP),
    y: CARD_Y + row * (CARD_H + CARD_ROW_GAP),
    w: CARD_W,
    h: CARD_H
  };
}

function mapGridBottom() {
  var rows = Math.ceil(Maps.LIST.length / MAP_CARD_COLS);
  return CARD_Y + rows * CARD_H + (rows - 1) * CARD_ROW_GAP;
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
  return { x: VIEW_WIDTH / 2 - 150, y: 320, w: 300, h: 62 };
}

// The armoury sits directly under PLAY, above the index: it is the screen a
// player visits between runs, and the index is reference material.
function storeButtonRect() {
  return { x: VIEW_WIDTH / 2 - 150, y: 396, w: 300, h: 52 };
}

function indexButtonRect() {
  return { x: VIEW_WIDTH / 2 - 150, y: 458, w: 300, h: 52 };
}

function sandboxButtonRect() {
  return { x: VIEW_WIDTH / 2 - 150, y: 520, w: 300, h: 52 };
}

// Back to the menu from the chooser. Top-left, out of the cards' way.
function backButtonRect() {
  return { x: 28, y: 28, w: 96, h: 34 };
}

function drawMenuHex(ctx, x, y, radius, squash) {
  ctx.beginPath();
  for (var i = 0; i < 6; i++) {
    var angle = Math.PI / 6 + i * Math.PI / 3;
    var px = x + Math.cos(angle) * radius;
    var py = y + Math.sin(angle) * radius * squash;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// The title screen is a command deck, not the chooser's empty lattice. Its
// machinery deliberately echoes the top-down models on the maps without
// becoming part of map content or simulation.
function drawMenuReactor() {
  var radius = 104;

  ctx.save();
  ctx.translate(166, 365);

  ctx.beginPath();
  ctx.ellipse(12, 20, radius * 1.12, radius * 0.72, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fill();

  drawMenuHex(ctx, 0, 0, radius * 1.03, 0.84);
  ctx.fillStyle = "#0a202d";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(68,187,222,0.5)";
  ctx.stroke();

  for (var i = 0; i < 10; i++) {
    ctx.save();
    ctx.rotate(i * Math.PI / 5);
    ctx.fillStyle = "#102a39";
    ctx.fillRect(radius * 0.58, -11, radius * 0.62, 22);
    ctx.strokeStyle = "rgba(70,208,255,0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(radius * 0.58, -11, radius * 0.62, 22);
    ctx.fillStyle = "rgba(105,228,255,0.8)";
    ctx.fillRect(radius * 0.92, -3, radius * 0.18, 6);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = "#1b3e4e";
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = "#091c28";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.53, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(38,177,219,0.18)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(78,220,255,0.9)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-12, -14, radius * 0.23, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(145,241,255,0.95)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-12, -14, radius * 0.37, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(74,218,255,0.22)";
  ctx.lineWidth = 13;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(145,241,255,0.72)";
  ctx.fillText("LEY CORE", 0, radius + 35);
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillStyle = "rgba(122,178,198,0.55)";
  ctx.fillText("OUTPUT  98.7%", 0, radius + 51);
  ctx.restore();
}

function drawMenuComms() {
  ctx.save();
  ctx.translate(1095, 356);

  // Angled console deck and its holographic tactical screen.
  ctx.beginPath();
  ctx.moveTo(-132, 52);
  ctx.lineTo(112, 52);
  ctx.lineTo(138, 118);
  ctx.lineTo(-106, 118);
  ctx.closePath();
  ctx.fillStyle = "#173445";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(75,204,241,0.62)";
  ctx.stroke();

  ctx.fillStyle = "rgba(45,175,215,0.2)";
  ctx.fillRect(-91, 68, 165, 26);
  ctx.strokeStyle = "rgba(80,220,255,0.72)";
  ctx.strokeRect(-91, 68, 165, 26);
  for (var lamp = 0; lamp < 5; lamp++) {
    ctx.beginPath();
    ctx.arc(93 + (lamp % 2) * 14, 70 + Math.floor(lamp / 2) * 13,
      3, 0, Math.PI * 2);
    ctx.fillStyle = lamp === 4 ? "#ffd76e" : "#5ce2ff";
    ctx.fill();
  }

  ctx.fillStyle = "#0a1c28";
  ctx.fillRect(-10, -9, 18, 69);
  ctx.strokeStyle = "rgba(80,220,255,0.5)";
  ctx.strokeRect(-10, -9, 18, 69);

  ctx.beginPath();
  ctx.ellipse(0, -46, 83, 41, -0.24, 0, Math.PI * 2);
  ctx.fillStyle = "#244a5b";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(78,220,255,0.82)";
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-8, -50, 56, 24, -0.24, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(133,237,255,0.42)";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -48);
  ctx.lineTo(56, -128);
  ctx.strokeStyle = "rgba(96,226,255,0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(58, -131, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd76e";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(58, -131, 22, -0.65, 0.65);
  ctx.strokeStyle = "rgba(255,215,110,0.45)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Translucent map projection above the console.
  ctx.beginPath();
  ctx.moveTo(-82, 45);
  ctx.lineTo(-50, -78);
  ctx.lineTo(72, -65);
  ctx.lineTo(87, 45);
  ctx.closePath();
  ctx.fillStyle = "rgba(65,203,239,0.08)";
  ctx.fill();
  ctx.strokeStyle = "rgba(82,220,255,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-55, 13);
  ctx.lineTo(-18, -22);
  ctx.lineTo(8, -5);
  ctx.lineTo(41, -48);
  ctx.lineTo(65, -17);
  ctx.strokeStyle = "rgba(121,237,255,0.7)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(145,241,255,0.72)";
  ctx.fillText("DEEP-SPACE RELAY", 8, 148);
  ctx.restore();
}

function drawMenuBackdrop() {
  ctx.fillStyle = "#06141f";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  // Large wall plates and recessed side bays establish the room before its
  // models are drawn. The centre stays quieter so the controls remain clear.
  ctx.fillStyle = "#0b2533";
  ctx.fillRect(0, 24, VIEW_WIDTH, 108);
  ctx.fillRect(0, 625, VIEW_WIDTH, 95);
  ctx.fillStyle = "#0d2b39";
  ctx.fillRect(22, 154, 307, 418);
  ctx.fillRect(951, 154, 307, 418);
  ctx.fillStyle = "#081d29";
  ctx.fillRect(340, 96, 600, 520);

  ctx.strokeStyle = "rgba(63,143,169,0.32)";
  ctx.lineWidth = 1;
  for (var x = 0; x <= VIEW_WIDTH; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, VIEW_HEIGHT);
    ctx.stroke();
  }
  for (var y = 24; y <= VIEW_HEIGHT; y += 72) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(VIEW_WIDTH, y + 0.5);
    ctx.stroke();
  }

  // Recessed-bay bevels and luminous rails.
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(70,206,244,0.35)";
  ctx.strokeRect(22.5, 154.5, 306, 417);
  ctx.strokeRect(951.5, 154.5, 306, 417);
  ctx.strokeRect(340.5, 96.5, 599, 519);
  ctx.strokeStyle = "rgba(74,218,255,0.18)";
  ctx.strokeRect(349.5, 105.5, 581, 501);

  ctx.fillStyle = "rgba(74,218,255,0.7)";
  ctx.fillRect(341, 96, 128, 3);
  ctx.fillRect(811, 96, 128, 3);
  ctx.fillStyle = "rgba(255,215,110,0.75)";
  ctx.fillRect(590, 613, 100, 3);

  // Cables/circuit trunks bind the side machines to the central terminal.
  ctx.strokeStyle = "rgba(74,218,255,0.23)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(256, 226);
  ctx.lineTo(306, 226);
  ctx.lineTo(306, 282);
  ctx.lineTo(340, 282);
  ctx.moveTo(940, 448);
  ctx.lineTo(978, 448);
  ctx.lineTo(978, 520);
  ctx.lineTo(1040, 520);
  ctx.stroke();
  ctx.fillStyle = "rgba(118,234,255,0.8)";
  ctx.fillRect(302, 222, 8, 8);
  ctx.fillRect(974, 444, 8, 8);

  // Hazard stripes keep the deck industrial instead of reading as another
  // abstract UI background.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 625, VIEW_WIDTH, 30);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,190,74,0.17)";
  ctx.lineWidth = 9;
  for (var stripe = -50; stripe < VIEW_WIDTH + 50; stripe += 36) {
    ctx.beginPath();
    ctx.moveTo(stripe, 655);
    ctx.lineTo(stripe + 30, 625);
    ctx.stroke();
  }
  ctx.restore();

  drawMenuReactor();
  drawMenuComms();

  // Corner status plates make the frame feel inhabited and operational.
  ctx.fillStyle = "rgba(5,14,21,0.82)";
  ctx.fillRect(28, 31, 208, 68);
  ctx.strokeStyle = "rgba(74,218,255,0.38)";
  ctx.strokeRect(28.5, 31.5, 207, 67);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.fillStyle = "#78e6ff";
  ctx.fillText("BASE COMMAND // ONLINE", 43, 46);
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillStyle = "rgba(169,210,223,0.55)";
  ctx.fillText("SECTOR 07   ·   GRID STABLE", 43, 67);
  ctx.fillStyle = "#69e6ab";
  ctx.fillRect(43, 83, 72, 3);
  ctx.fillStyle = "rgba(105,230,171,0.25)";
  ctx.fillRect(119, 83, 96, 3);
}

function drawMenuButton(r, label, key, rgb, primary) {
  var hot = pointInRect(mouse.x, mouse.y, r);

  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(r.x + 6, r.y + 7, r.w, r.h);
  ctx.fillStyle = hot
    ? "rgba(" + rgb + ",0.25)"
    : (primary ? "rgba(" + rgb + ",0.16)" : "rgba(10,28,39,0.94)");
  ctx.fillRect(r.x, r.y, r.w, r.h);

  ctx.lineWidth = hot ? 2 : 1;
  ctx.strokeStyle = "rgba(" + rgb + "," + (hot ? "0.95" : "0.55") + ")";
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.fillStyle = "rgba(" + rgb + "," + (hot ? "1" : "0.72") + ")";
  ctx.fillRect(r.x, r.y, hot ? 7 : 4, r.h);

  // Mechanical corner brackets, larger on the primary PLAY control.
  var bracket = primary ? 16 : 12;
  ctx.strokeStyle = "rgba(" + rgb + ",0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(r.x, r.y + bracket); ctx.lineTo(r.x, r.y); ctx.lineTo(r.x + bracket, r.y);
  ctx.moveTo(r.x + r.w - bracket, r.y); ctx.lineTo(r.x + r.w, r.y);
  ctx.lineTo(r.x + r.w, r.y + bracket);
  ctx.moveTo(r.x, r.y + r.h - bracket); ctx.lineTo(r.x, r.y + r.h);
  ctx.lineTo(r.x + bracket, r.y + r.h);
  ctx.moveTo(r.x + r.w - bracket, r.y + r.h); ctx.lineTo(r.x + r.w, r.y + r.h);
  ctx.lineTo(r.x + r.w, r.y + r.h - bracket);
  ctx.stroke();

  ctx.fillStyle = "rgba(" + rgb + ",0.15)";
  ctx.fillRect(r.x + 13, r.y + 11, 32, r.h - 22);
  ctx.strokeStyle = "rgba(" + rgb + ",0.5)";
  ctx.strokeRect(r.x + 13.5, r.y + 11.5, 31, r.h - 23);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.fillStyle = "rgba(" + rgb + ",0.9)";
  ctx.fillText(key, r.x + 29, r.y + r.h / 2 + 1);

  ctx.font = (primary ? "700 18px" : "600 14px") + " system-ui, sans-serif";
  ctx.fillStyle = hot ? "#ffffff" : "#d9f3ff";
  ctx.fillText(label, r.x + r.w / 2 + 14, r.y + r.h / 2 + 1);
}

function drawMenu() {
  drawMenuBackdrop();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Shadow, edge and face make the title feel stamped into the command
  // terminal instead of floating over it.
  ctx.font = "700 74px system-ui, sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText("TOWER DEFENSE", VIEW_WIDTH / 2 + 5, 181);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(67,205,244,0.62)";
  ctx.strokeText("TOWER DEFENSE", VIEW_WIDTH / 2, 176);
  ctx.fillStyle = "#d9f7ff";
  ctx.fillText("TOWER DEFENSE", VIEW_WIDTH / 2, 176);
  ctx.fillStyle = "rgba(74,218,255,0.78)";
  ctx.fillRect(VIEW_WIDTH / 2 - 128, 215, 256, 2);

  // Counted, never typed: the strap line said "Ten waves" for exactly as long
  // as it took to add ten more.
  var towerCount = BUILD_SLOTS.filter(function (t) { return t !== null; }).length;
  ctx.fillStyle = "rgba(199,209,224,0.55)";
  ctx.font = "17px system-ui, sans-serif";
  ctx.fillText(WAVES.length + " waves.  " + Maps.LIST.length + " ley-lines.  " +
    towerCount + " towers.  Hold the base.", VIEW_WIDTH / 2, 232);

  drawMenuButton(playButtonRect(), "PLAY", "1", "74,218,255", true);
  drawMenuButton(storeButtonRect(), "ARMOURY  //  STORE & INVENTORY",
    "2", "255,197,83", false);
  drawMenuButton(indexButtonRect(), "INDEX  //  TOWERS & ENEMIES",
    "3", "180,126,255", false);
  drawMenuButton(sandboxButtonRect(), "SANDBOX  //  SIMULATION BAY",
    "4", "97,230,170", false);

  // The coin purse, top right. On the title screen because that is where the
  // decision it funds gets made, and because a currency you cannot see is a
  // currency nobody spends.
  ctx.fillStyle = "rgba(5,14,21,0.86)";
  ctx.fillRect(VIEW_WIDTH - 238, 31, 208, 68);
  ctx.strokeStyle = "rgba(255,215,110,0.45)";
  ctx.lineWidth = 1;
  ctx.strokeRect(VIEW_WIDTH - 237.5, 31.5, 207, 67);
  ctx.textAlign = "right";
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillStyle = "#ffd76e";
  ctx.fillText(MetaProgress.coins() + " ⬡", VIEW_WIDTH - 46, 52);
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "rgba(199,209,224,0.5)";
  ctx.fillText("ARMOURY CREDIT", VIEW_WIDTH - 46, 77);
  ctx.textAlign = "center";

  ctx.fillStyle = "rgba(199,209,224,0.4)";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("Enter / 1 play    ·    2 armoury    ·    3 index    ·    4 sandbox",
    VIEW_WIDTH / 2, 646);
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillStyle = "rgba(94,186,215,0.45)";
  ctx.fillText("LEYLINE DEFENSE NETWORK   //   COMMAND TERMINAL 04.11",
    VIEW_WIDTH / 2, 680);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// The "← Menu" escape hatch, top-left. Shared by the chooser and the index
// screen -- one drawing, one rectangle, so the two screens cannot drift on
// how leaving looks or where it is clicked.
function drawBackButton() {
  var back = backButtonRect();
  var backHot = pointInRect(mouse.x, mouse.y, back);
  ctx.fillStyle = backHot ? "rgba(140,179,230,0.22)" : "rgba(28,30,38,0.85)";
  ctx.fillRect(back.x, back.y, back.w, back.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = backHot ? "rgba(170,215,255,0.95)" : "rgba(140,179,230,0.4)";
  ctx.strokeRect(back.x + 0.5, back.y + 0.5, back.w - 1, back.h - 1);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillStyle = backHot ? "#cfe3ff" : "rgba(199,209,224,0.75)";
  ctx.fillText("← Menu", back.x + back.w / 2, back.y + back.h / 2 + 1);
}

function drawMapSelect() {
  drawSelectBackdrop();
  drawBackButton();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  ctx.fillStyle = "#cfe3ff";
  ctx.font = "700 40px system-ui, sans-serif";
  ctx.fillText("CHOOSE YOUR RUN", VIEW_WIDTH / 2, 48);

  ctx.fillStyle = "rgba(199,209,224,0.6)";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("Pick a campaign difficulty, then a ley-line.", VIEW_WIDTH / 2, 86);

  drawDifficultySelector();

  for (var i = 0; i < Maps.LIST.length; i++) drawMapCard(i);

  ctx.fillStyle = "rgba(199,209,224,0.5)";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("E / N / H changes difficulty  ·  click a route or press 1 - " +
    Maps.LIST.length,
    VIEW_WIDTH / 2, mapGridBottom() + 16);

  ctx.textAlign = "left";
}

function drawDifficultySelector() {
  DIFFICULTY_ORDER.forEach(function (id, i) {
    var difficulty = DIFFICULTIES[id];
    var r = difficultyRect(i);
    var selected = id === selectedDifficultyId;
    var hot = difficultyAt(mouse.x, mouse.y) === id;
    var colours = TIER_COLOURS[id];

    ctx.fillStyle = selected
      ? colours.fill
      : (hot ? "rgba(42,48,62,0.95)" : "rgba(22,25,34,0.9)");
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = selected ? colours.line : "rgba(140,179,230,0.3)";
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "700 14px system-ui, sans-serif";
    ctx.fillStyle = selected ? colours.text : "#c7d1e0";
    ctx.fillText(difficulty.name.toUpperCase(), r.x + 12, r.y + 6);

    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = selected
      ? "rgba(230,238,252,0.85)"
      : "rgba(199,209,224,0.55)";
    ctx.fillText(fitText(ctx, difficulty.description, r.w - 24),
      r.x + 12, r.y + 24);

    ctx.textAlign = "right";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = colours.text;
    ctx.fillText(id.charAt(0).toUpperCase(), r.x + r.w - 10, r.y + 7);
  });
  ctx.textAlign = "center";
}

// A faint circuit lattice behind the cards. Procedural, like everything else --
// no images to load, which is what lets the game run from a bare folder.
function drawSelectBackdrop() {
  ctx.strokeStyle = "rgba(140,199,255,0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var x = 40; x < VIEW_WIDTH; x += 40) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, VIEW_HEIGHT);
  }
  for (var y = 40; y < VIEW_HEIGHT; y += 40) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(VIEW_WIDTH, y + 0.5);
  }
  ctx.stroke();
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

  ctx.fillStyle = hot ? "rgba(32,38,52,0.95)" : "rgba(22,25,34,0.9)";
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // Hotkey, top-left, same convention as a build slot.
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillText(String(i + 1), r.x + 8, r.y + 21);

  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillStyle = "#e6eefc";
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
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.fillStyle = tier.text;
  ctx.fillText(a.tier.toUpperCase(), badge.x + badge.w / 2, badge.y + badge.h / 2 + 1);

  // Two maps can share a band, and this is what tells them apart.
  ctx.textAlign = "right";
  ctx.font = "600 15px system-ui, sans-serif";
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
  var statsH = 52;
  var statsY = view.y + view.h - statsH;
  ctx.fillStyle = "rgba(8,10,16,0.72)";
  ctx.fillRect(view.x, statsY, view.w, statsH);

  var colW = (view.w - 20) / 2;
  for (var row = 0; row < rows.length; row++) {
    var cx = view.x + 10 + (row % 2) * colW;
    var cy = statsY + 8 + Math.floor(row / 2) * 22;

    ctx.textAlign = "left";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(199,209,224,0.62)";
    var label = fitText(ctx, rows[row][0], colW * 0.62);
    ctx.fillText(label, cx, cy + 2);

    ctx.textAlign = "right";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = "#dce6f8";
    ctx.fillText(fitText(ctx, rows[row][1],
      colW - ctx.measureText(label).width - 14), cx + colW - 8, cy + 1);
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
  return { x: card.x + 12, y: card.y + 40, w: w, h: w * VIEW_HEIGHT / VIEW_WIDTH };
}

// THE MAP, drawn small. The whole 1280x720 battlefield scaled into `box`,
// through the same three calls the play screen makes in the same order:
// the theme's background, its environment, then the road.
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
// shows up on these cards without anyone remembering to update them.
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

  ctx.fillStyle = Maps.backgroundColor ? Maps.backgroundColor(map) : "#1c1e26";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  if (typeof Maps.drawEnvironment === "function") Maps.drawEnvironment(ctx, map);

  // Routes converted the same way loadMap converts them, so the road on the
  // card is at the same world coordinates it will be at in the run.
  drawRoadOn(Maps.routesOf(map).map(function (route) {
    return { points: Maps.toWorld(route.points) };
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

  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (!e.containsPoint(x, y)) continue;

    // Measured to the VISIBLE body, not the ground contact point. An enemy is
    // drawn lifted above where it stands in the three-quarter camera, so
    // picking the nearest by ground position would hand the cursor the wrong
    // body whenever two of them overlap.
    var dx = x - e.pos.x;
    var dy = y - (e.visualBodyY ? e.visualBodyY() : e.pos.y);
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
function drawOverlayButton(r, label) {
  var hovering = pointInRect(mouse.x, mouse.y, r);

  ctx.fillStyle = hovering ? "#8cb3e6" : "#475c80";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#b8c7e0";
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
}

// Map chooser geometry. Interface chrome, so pixels are correct here -- a card
// is anchored to the 1280x720 viewport, not to anything in the world.
//
// The row is centred and sized from the number of maps, so adding a fifth route
// to Maps.LIST lays itself out without touching this.
var MAP_CARD_COLS = 3;
var CARD_W = 372;
var CARD_H = 240;
var CARD_GAP = 18;
var CARD_ROW_GAP = 14;
var CARD_Y = 154;

var TIER_COLOURS = {
  easy:   { text: "#7ce0c0", line: "rgba(124,224,192,0.85)", fill: "rgba(124,224,192,0.12)" },
  normal: { text: "#ffd76e", line: "rgba(255,215,110,0.85)", fill: "rgba(255,215,110,0.12)" },
  hard:   { text: "#e08ad8", line: "rgba(224,138,216,0.85)", fill: "rgba(224,138,216,0.12)" }
};
