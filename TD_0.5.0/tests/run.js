// ---------------------------------------------------------------------------
// The test suite.  Run it with:   node tests/run.js
//
// Every test boots a fresh game and drives it through real entry points --
// the actual click handlers, the actual update() -- so passing here means the
// browser behaves the same way.
//
// Spots used repeatedly:
//   the long straight runs left-to-right at y = 460, from x = 300 to x = 760.
//   (530, 505) and (700, 505) sit beside it, in range of the road.
//   (600, 505) and (600, 415) MIRROR each other across it -- an enemy enters
//   both ranges on the same frame, which is the hard case for target claiming.
// ---------------------------------------------------------------------------

var harness = require("./harness");
var runner = require("./assert");
var resultRect = harness.resultRect;

var group = runner.group;
var test = runner.test;

// Authored-pixel coordinates -> live ones. Defined in the harness, where
// content.test.js can reach the SAME copy; see the note on it there for why
// this is not four lines in each suite.
var w = harness.w;

// ---------------------------------------------------------------------------
// The Arcane Sniper's B5 ability is CHANNELLED, not instant. performAction()
// only ARMS it -- the strongest enemy is locked and the tower stands still --
// and the tower's own update() resolves the strike channelSeconds later. The
// damage, the kills, the permanent max-HP cost, the stun and the impact effect
// are ALL paid on RESOLUTION (resolveChannel in js/towers/longshot-adapter.js),
// so a fixture that reads any of them straight after the press sees a tower
// that appears to have done nothing at all.
//
// These fixtures build the tower and its targets OFF the board, so h.step() --
// which advances the game's own tower list -- never reaches them. The tower's
// update has to be driven directly.
//
// The budget is DERIVED from the tower's own configured channel rather than a
// typed step count, so retuning the ritual cannot quietly turn this helper
// into a no-op. Returns whether the channel actually resolved, so a caller can
// assert that rather than silently measuring an unresolved tower.
// ---------------------------------------------------------------------------
function resolveB5Channel(h, tower, enemies) {
  var params = tower.core.stats.mechanics.activeAbility;
  var budget = Math.ceil((params.channelSeconds + 1) / h.game.FIXED_STEP);
  for (var i = 0; i < budget && tower.channel; i++) {
    tower.update(h.game.FIXED_STEP, enemies, []);
  }
  return !tower.channel;
}



group("units and path");

test("UNIT_LENGTH and ul() are the global distance system", function (t) {
  var h = harness.boot();
  t.eq(h.game.UNIT_LENGTH, 1.04, "the tuned constant (see js/units.js for why)");
  t.eq(h.game.ul(1), 1.04, "ul(1) == UNIT_LENGTH");
  t.near(h.game.ul(10), 10.4, 1e-9, "ul() is a plain multiply, nothing more");
  t.near(h.game.path.length / h.game.UNIT_LENGTH, 1865.385, 0.01,
    "the path is ~1865 u.l. -- about 18.6 reference-tower ranges end to end");
});

test("everything is authored against the 100 u.l. reference tower", function (t) {
  var h = harness.boot();
  // The gunner IS the yardstick: the spec's hypothetical 100 u.l. tower.
  t.eq(h.game.Tower.BASE_RANGE_UL, 100, "gunner range is the reference 100 u.l.");

  // And the whole map is expressed in the same units, so a tower's reach can
  // be reasoned about as a fraction of the route.
  // The map was refitted to fill the canvas on 2026-07-27, which made it
  // longer in u.l. while tower ranges stayed put -- so a gunner now covers
  // rather less of the route than it used to. That is a real balance shift,
  // recorded here rather than left implicit.
  var mapUl = h.game.path.length / h.game.UNIT_LENGTH;
  t.near(h.game.Tower.BASE_RANGE_UL / mapUl, 0.0536, 0.001,
    "a gunner covers ~5.4% of the path");

  // Longshot's authored numbers now sit in the same regime rather than
  // overflowing the map -- this is what the 2026-07-27 rescale fixed.
  // Read off the LOADED constructor: since 2026-07-28 index.html ships the
  // Longshot, so it is in the booted game's scope and requiring the config
  // file separately would be testing a second copy of the number.
  var longshotRange = h.game.LongshotTower.BASE_RANGE_UL;
  t.ok(longshotRange > h.game.Tower.BASE_RANGE_UL,
    "Longshot outranges the reference tower (" + longshotRange + " vs 100)");
  t.ok(longshotRange < mapUl,
    "but no longer outranges the entire map (" + longshotRange + " vs " + mapUl.toFixed(0) + ")");
});

test("changing UNIT_LENGTH rescales the path and every tower stat proportionally", function (t) {
  var reference = harness.boot();
  var refPathLength = reference.game.path.length;
  var refRangePx = new reference.game.Tower(0, 0, reference.game.path).rangePx;
  var refFootprintPx = new reference.game.Tower(0, 0, reference.game.path).footprintPx;
  var refClearancePx = reference.run("buildClearancePx(Tower)");

  var doubled = harness.boot();
  // Rebuild path from the SAME u.l.-authored PATH_POINTS_UL at double the
  // constant -- the real construction path (see init() in game.js), not just
  // the ul() formula in isolation. Order matters: the path must be rebuilt
  // BEFORE restartGame() spawns the first enemy, which captures whatever
  // `path` object exists at that moment.
  doubled.run(
    "UNIT_LENGTH = UNIT_LENGTH * 2; " +
    "path = new GamePath(PATH_POINTS_UL.map(function (p) { return { x: ul(p.x), y: ul(p.y) }; })); " +
    "restartGame();"
  );

  t.near(doubled.game.path.length, refPathLength * 2, 0.01, "path length doubled");

  var doubledTower = new doubled.game.Tower(0, 0, doubled.game.path);
  t.near(doubledTower.rangePx, refRangePx * 2, 0.01, "tower range in pixels doubled");
  t.near(doubledTower.footprintPx, refFootprintPx * 2, 0.01, "tower footprint in pixels doubled");
  t.near(doubled.run("buildClearancePx(Tower)"), refClearancePx * 2, 0.01, "placement clearance doubled");
});

test("changing UNIT_LENGTH changes no gameplay outcome", function (t) {
  // Same scenario (the first gunner beside the long straight), played out at
  // two different UNIT_LENGTH values. Every distance involved (path, tower
  // range, enemy speed, bullet speed) is authored in u.l. and scales
  // together, so kills/leaks/timing are a function of their RATIOS, not
  // their absolute pixel size -- the outcome must be identical.
  //
  // Scaled DOWN (0.5x) rather than up: VIEW_WIDTH/VIEW_HEIGHT are fixed
  // interface pixels that do not scale with UNIT_LENGTH (same rule as the
  // build bar -- see AGENTS.md), so doubling would push the map's usable
  // placement area outside the fixed 1280x720 canvas and silently fail to
  // place a tower at all. Shrinking keeps everything comfortably in view.
  var reference = harness.boot();
  reference.pinWaveBreak(5);
  reference.run("cash = 100000");
  reference.placeGunner(w(reference, 530), w(reference, 505));
  var refOutcome = reference.tally(120);
  var refBaseHp = reference.game.baseHp;

  var shrunk = harness.boot();
  shrunk.pinWaveBreak(5);
  shrunk.run(
    "UNIT_LENGTH = UNIT_LENGTH * 0.5; " +
    "path = new GamePath(PATH_POINTS_UL.map(function (p) { return { x: ul(p.x), y: ul(p.y) }; })); " +
    "restartGame();"
  );
  shrunk.run("cash = 100000");
  // The same spot on the road: w() reads the harness's CURRENT UNIT_LENGTH,
  // which this run just halved, so the fixture coordinate lands correctly
  // without the test needing to know the factor.
  var placed = shrunk.placeGunner(w(shrunk, 530), w(shrunk, 505));
  t.ok(placed, "the scaled-down placement is still valid (not off-map or on the road)");

  var shrunkOutcome = shrunk.tally(120);

  t.eq(shrunkOutcome.killed, refOutcome.killed, "same kill count at half UNIT_LENGTH");
  t.eq(shrunkOutcome.leaked, refOutcome.leaked, "same leak count at half UNIT_LENGTH");
  t.eq(shrunk.game.baseHp, refBaseHp, "same resulting base HP at half UNIT_LENGTH");
});

test("progressAtPoint and distanceToPoint agree on the nearest point", function (t) {
  var h = harness.boot();
  var p = h.game.path;
  // (600, 505) is 45 fixture-px below the straight at y = 460, which starts
  // at cumulative 660 and runs along x. All four numbers scale together.
  t.near(p.distanceToPoint(w(h, 600), w(h, 505)), w(h, 45), 0.001, "distance to road");
  t.near(p.progressAtPoint(w(h, 600), w(h, 505)), w(h, 660 + 300), 0.001, "progress along path");
});


group("waves and base");

// The first group of `wave` that declares `typeId`, or null.
//
// Every lookup into a wave's groups goes through this rather than through an
// index. Since the timeline rewrite a wave is cut into as many groups as it has
// ENTRANCES -- wave 30 has twelve, wave 13 sends its twenty Angries as five
// salvos of four -- so a positional `groups[1]` names a different body than it
// did, silently, and a test that asserts about the wrong body still passes on
// something.
function groupOfType(h, wave, typeId) {
  var groups = h.game.waveGroups(wave);
  for (var i = 0; i < groups.length; i++) {
    if ((groups[i].type || "normal") === typeId) return groups[i];
  }
  return null;
}

test("the schedule is the authored thirty-five waves, opening intact", function (t) {
  var h = harness.boot();
  var W = h.game.WAVES;

  t.eq(W.length, 35, "thirty-five waves");
  t.eq(h.game.WAVE_CALL_DELAY, 3, "a called wave takes three seconds to arrive");
  t.eq(h.game.WAVE_CLEAR_DELAY, 5, "and a beaten or expired one takes five");
  t.eq(h.game.WAVE_BREAK, undefined,
    "there is no wave-to-wave break constant left: the ceiling is per-wave");
  t.eq(h.game.BASE_MAX_HP, 100, "starting base HP");

  // WAVES 1-11 ARE THE INTRODUCTION AND ARE PINNED EXACTLY, field for field.
  // One type per wave, no v0.4.7 content -- the game teaches its first five
  // bodies here one at a time.
  //
  // WAVES 1-4 MUST NEVER MOVE IN COMPOSITION: the starting-stake economy is
  // measured against their exact counts. From 5 on they carry `health`
  // overrides (2026-07-30, "make the hp per wave scaling even bigger") -- an
  // override changes toughness and nothing else, so the lesson each wave
  // teaches is untouched.
  //
  // WHAT DID MOVE, 2026-08-25, is the SHAPE: the timeline rewrite cut each of
  // these into the salvos it actually arrives in and gave every wave an `at`
  // and a `duration`. Wave 2 is still eight stock Normals; they are now 4 at
  // 1.0 s from the gate and 4 more at 0.65 s from 4.5 s in. The aggregate is
  // what the economy was measured against and the aggregate is unchanged --
  // see "the campaign's totals" below, which pins all 830 bodies.
  t.deep(W.slice(0, 11), [
    { duration: 32, groups: [{ at: 0, count: 5, interval: 0.8 }] },
    { duration: 34, groups: [{ at: 0, count: 4, interval: 1 }, { at: 4.5, count: 4, interval: 0.65 }] },
    { duration: 30, groups: [{ at: 0, count: 2, interval: 0.6, type: "fast" }, { at: 2, count: 6, interval: 0.35, type: "fast" }] },
    { duration: 36, groups: [{ at: 0, count: 4, interval: 0.45 }, { at: 3, count: 4, interval: 0.45 }, { at: 6, count: 4, interval: 0.45 }] },
    { duration: 42, groups: [{ at: 0, count: 2, interval: 0.8, type: "slow", health: 9 }, { at: 4, count: 2, interval: 0.8, type: "slow", health: 9 }, { at: 8, count: 2, interval: 0.8, type: "slow", health: 9 }] },
    { duration: 34, groups: [{ at: 0, count: 4, interval: 0.4, type: "fast", health: 3 }, { at: 2.2, count: 10, interval: 0.25, type: "fast", health: 3 }] },
    { duration: 30, groups: [{ at: 0, count: 5, interval: 0.12, type: "swarm" }, { at: 1.8, count: 10, interval: 0.1, type: "swarm" }, { at: 3.5, count: 5, interval: 0.12, type: "swarm" }] },
    { duration: 40, groups: [{ at: 0, count: 8, interval: 0.55, health: 6 }, { at: 2, count: 4, interval: 0.4, health: 6 }, { at: 5, count: 4, interval: 0.4, health: 6 }] },
    { duration: 44, groups: [{ at: 0, count: 1, interval: 0.9, type: "armored", health: 7 }, { at: 2, count: 3, interval: 0.8, type: "armored", health: 7 }, { at: 4.5, count: 6, interval: 0.55, type: "armored", health: 7 }] },
    { duration: 48, groups: [{ at: 0, count: 5, interval: 1, type: "slow", health: 14 }, { at: 2.5, count: 5, interval: 1, type: "slow", health: 14 }] },
    { duration: 60, groups: [{ at: 4, count: 1, interval: 1, type: "midboss" }] }
  ], "the introduction, up to and including the midboss");

  // EVERY WAVE'S CEILING OUTLASTS ITS OWN LAST SPAWN, checked by the game's own
  // validator rather than by a number typed here. A `duration` that closed
  // before the tail of a wave would delete that tail silently -- the wave would
  // still SAY 88 bodies and still pay for 88 -- so the schedule is checked
  // against itself, in the shipping code, at load.
  t.deep(h.game.validateWaveTimelines(W), [],
    "the shipping schedule is deployable");
  t.eq(W[34].duration, undefined,
    "and wave 35 alone has no ceiling, because there is nothing after it");

  // A health override changes toughness only, never the type's identity, its
  // speed or its DEFENCES -- that is the whole reason overriding is safe. A
  // scaled brute is still a brute, 5 flat armor and all.
  //
  // FOUND BY TYPE, NOT BY GROUP INDEX (2026-08-25). The timeline rewrite cut
  // waves into salvos, so `groups[1]` of wave 31 is no longer the Brutes and a
  // positional lookup would have gone quietly green on whatever else landed
  // there -- which is exactly what it did: it read a 13 HP body and called it
  // a 100 HP Brute.
  var brute = groupOfType(h, W[30], "brute");
  t.ok(brute !== null, "wave 31 still declares a Brute group");
  t.eq(h.game.Enemy.healthOf(brute.type, brute.health), 100, "wave 31's brutes are scaled to 100 HP");
  t.eq(h.game.Enemy.typeOf(brute.type).armor, 5, "and still carry their 5 flat armor");

  // And a scaled Bulwark still gets twice its NEW health in shield, because
  // the shield is sized off the instance rather than declared as a number.
  var bulwark = groupOfType(h, W[34], "shielded");
  t.ok(bulwark !== null, "wave 35 still declares a Bulwark group");
  var body = new h.game.Enemy(h.game.path, bulwark.health, bulwark.type);
  t.eq(body.maxHealth, 30, "wave 35's Bulwarks are scaled to 30 HP");
  t.eq(body.shieldMax, 60, "and carry 60 of shield, derived from that");
});

// The owner's figures: "make it so that the total is like 13500 hp"
// (2026-07-29), then "the game is too easy still, make the hp per wave scaling
// even bigger" (2026-07-30), which took it to ~26 000 with the steepness
// concentrated in the back half. Authored, not simulated -- see the note on
// measuring in the WAVES comment.
test("the schedule totals about 26 000 authored effective HP", function (t) {
  var h = harness.boot();
  var total = 0;
  h.game.WAVES.forEach(function (wave) { total += h.game.waveEffectiveHealth(wave); });

  // 25 799 until the 2026-08-13 curve retune, which raised waves 12, 13 and 16
  // by 25% each. The whole-schedule effect is small BECAUSE the retune landed
  // on three waves out of twelve proposed -- the other nine are held.
  t.ok(Math.abs(total - 25898) < 100,
    "25 898 authored effective HP across the schedule (" + total + ")");

  // THE CURVE, not just the total. Wave 35 alone is more than the first
  // twenty-one put together, and the last third is where the growth lives --
  // if a future retune flattens that, this fails before the total does.
  var firstThird = 0, lastThird = 0;
  h.game.WAVES.forEach(function (wave, i) {
    if (i < 12) firstThird += h.game.waveEffectiveHealth(wave);
    if (i >= 23) lastThird += h.game.waveEffectiveHealth(wave);
  });
  t.ok(lastThird > firstThird * 15,
    "the last twelve waves dwarf the first twelve (" +
    Math.round(firstThird) + " -> " + Math.round(lastThird) + ")");

  // waveEffectiveHealth is the ONE implementation of that sum, and the clear
  // bounty reads the same function -- so a retuned wave moves its payout with
  // it and the two can never drift.
  var wave35 = h.game.WAVES[34];
  t.eq(h.game.waveBounty(wave35),
    Math.round(h.game.waveEffectiveHealth(wave35) * h.game.WAVE_CLEAR_BOUNTY_FRACTION),
    "a wave's bounty is a tenth of what it takes to clear");
  t.eq(h.game.WAVE_CLEAR_BOUNTY_FRACTION, 0.1, "and the tenth is the tenth");
});

// ---------------------------------------------------------------------------
// THE CAMPAIGN'S COMPOSITION, MEASURED BEFORE THE TIMELINE REWRITE AND PINNED
// HERE AFTERWARDS.
//
// The rewrite of 2026-08-25 was allowed to change WHEN a body arrives and
// nothing else. It cut every wave into the salvos it actually arrives in, which
// means almost every group in the file was rewritten -- so "we did not change
// the content" is a claim about a hundred and thirty edited groups and cannot
// be read off a diff.
//
// The table below is that content, snapshotted off the schedule as it stood
// BEFORE the first line was touched. Each row is
//
//     [ wave, bodies, effective HP, clear $, kill $, composition ]
//
// and the composition key is the AUTHORED SIGNATURE of a group:
//
//     <type or "<default-normal>"> | hp=N or <no-health> | tier=N or <no-tier>
//
// ABSENCE IS PART OF THE KEY, deliberately. A group with no `health` inherits
// the type's; one that writes the same number is a different authored thing,
// and the rewrite's easiest mistake by far was to materialise a default while
// splitting a group -- copy `Enemy.TYPES.fast.health` onto a fragment and every
// aggregate below still balances while the schedule has quietly stopped
// following the type row. Nothing else in the suite would notice.
//
// THE KILL COLUMN USES ITS OWN ARITHMETIC and does not call waveKillBounty:
// it prices each body off its TYPE ROW, ignoring `tier`, which is what the
// snapshot did. On the six Fractal waves that is not what Enemy.bountyOf
// returns (wave 35 is $4313 here against the game's $4823), so the game's own
// function is pinned separately, on the total, at the bottom. Two formulas over
// the same bodies is the point: a group that lost its tier moves one of them
// and not the other.
test("the timeline rewrite moved when bodies arrive and changed nothing else",
function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;

  var BEFORE_TIMELINE = [
    // wave  n     HP    $     kill   composition
    [ 1,   5,    20,    2,    15, { "<default-normal> | <no-health> | <no-tier>": 5 }],
    [ 2,   8,    32,    3,    24, { "<default-normal> | <no-health> | <no-tier>": 8 }],
    [ 3,   8,    16,    2,    24, { "fast | <no-health> | <no-tier>": 8 }],
    [ 4,  12,    48,    5,    36, { "<default-normal> | <no-health> | <no-tier>": 12 }],
    [ 5,   6,    54,    5,    36, { "slow | hp=9 | <no-tier>": 6 }],
    [ 6,  14,    42,    4,    70, { "fast | hp=3 | <no-tier>": 14 }],
    [ 7,  20,    20,    2,    20, { "swarm | <no-health> | <no-tier>": 20 }],
    [ 8,  16,    96,   10,    80, { "<default-normal> | hp=6 | <no-tier>": 16 }],
    [ 9,  10,    70,    7,    70, { "armored | hp=7 | <no-tier>": 10 }],
    [10,  10,   140,   14,   100, { "slow | hp=14 | <no-tier>": 10 }],
    [11,   1,   250,   25,   250, { "midboss | <no-health> | <no-tier>": 1 }],
    [12,  88,   280,   28,   304, {
      "fast | hp=5 | <no-tier>": 18,
      "swarm | hp=1 | <no-tier>": 40,
      "<default-normal> | hp=5 | <no-tier>": 30
    }],
    [13,  20,   180,   18,   200, { "angry | hp=9 | <no-tier>": 20 }],
    [14,  10,    70,    7,    70, { "camo_normal | hp=7 | <no-tier>": 10 }],
    [15,   5,   225,   23,   125, { "shielded | hp=15 | <no-tier>": 5 }],
    [16,  66,   406,   41,   350, {
      "slow | hp=15 | <no-tier>": 14,
      "swarm | hp=3 | <no-tier>": 24,
      "armored | hp=5 | <no-tier>": 24,
      "normal | hp=1 | <no-tier>": 4
    }],
    [17,  59,   383,   38,   403, {
      "swarm | hp=3 | <no-tier>": 27,
      "<default-normal> | hp=13 | <no-tier>": 14,
      "fast | hp=7 | <no-tier>": 16,
      "normal | hp=4 | <no-tier>": 2
    }],
    [18,  12,   108,   11,   168, { "camo_fast | hp=9 | <no-tier>": 12 }],
    [19,  35,   668,   67,   569, {
      "<default-normal> | hp=18 | <no-tier>": 16,
      "shielded | hp=16 | <no-tier>": 5,
      "fast | hp=10 | <no-tier>": 14
    }],
    [20,   4,   300,   30,   300, { "brute | hp=75 | <no-tier>": 4 }],
    [21,   6,   312,   31,   198, { "revenant | hp=26 | <no-tier>": 6 }],
    [22,  37,   652,   65,   755, {
      "fast | hp=18 | <no-tier>": 12,
      "brute | hp=85 | <no-tier>": 4,
      "swarm | hp=4 | <no-tier>": 20,
      "slow | hp=16 | <no-tier>": 1
    }],
    [23,  24,   760,   76,   578, {
      "slow | hp=26 | <no-tier>": 14,
      "angry | hp=30 | <no-tier>": 6,
      "shielded | hp=18 | <no-tier>": 4
    }],
    [24,  10,    90,    9,    90, { "flying | hp=9 | <no-tier>": 10 }],
    [25,  36,   984,   98,   731, {
      "<default-normal> | hp=22 | <no-tier>": 20,
      "shielded | hp=20 | <no-tier>": 5,
      "armored | hp=18 | <no-tier>": 10,
      "slow | hp=64 | <no-tier>": 1
    }],
    [26,   2,   440,   44,   514, { "hive | hp=220 | <no-tier>": 2 }],
    [27,  30,   808,   81,  1032, {
      "fast | hp=16 | <no-tier>": 18,
      "armored | hp=20 | <no-tier>": 10,
      "shieldbearer | hp=160 | <no-tier>": 2
    }],
    [28,  18,   486,   49,   624, {
      "camo_normal | hp=18 | <no-tier>": 12,
      "camo_heavy | hp=45 | <no-tier>": 6
    }],
    [29,  26,  1907,  191,  1379, {
      "slow | hp=34 | <no-tier>": 16,
      "shielded | hp=24 | <no-tier>": 4,
      "brute | hp=95 | <no-tier>": 3,
      "colossus | <no-health> | <no-tier>": 1,
      "shieldbearer | hp=120 | <no-tier>": 2
    }],
    [30,  33,  1136,  114,  1320, {
      "hive | hp=180 | <no-tier>": 3,
      "shieldbearer | hp=170 | <no-tier>": 2,
      "swarm | hp=5 | <no-tier>": 24,
      "angry | hp=34 | <no-tier>": 4
    }],
    [31,  42,  1384,  138,  1095, {
      "<default-normal> | hp=26 | <no-tier>": 24,
      "brute | hp=100 | <no-tier>": 3,
      "shielded | hp=22 | <no-tier>": 5,
      "flying | hp=13 | <no-tier>": 10
    }],
    [32,  35,  1572,  157,  1851, {
      "fast | hp=18 | <no-tier>": 20,
      "armored | hp=22 | <no-tier>": 8,
      "healer | hp=260 | <no-tier>": 3,
      "revenant | hp=32 | <no-tier>": 4
    }],
    [33,  28,  1952,  195,  1723, {
      "slow | hp=38 | <no-tier>": 18,
      "hive | hp=200 | <no-tier>": 2,
      "shielded | hp=26 | <no-tier>": 4,
      "brute | hp=100 | <no-tier>": 3,
      "hive | hp=256 | <no-tier>": 1
    }],
    [34,  45,  2364,  236,  3252, {
      "swarm | hp=6 | <no-tier>": 24,
      "boss_fast | hp=1400 | <no-tier>": 1,
      "fast | hp=20 | <no-tier>": 13,
      "shieldbearer | hp=180 | <no-tier>": 2,
      "angry | hp=40 | <no-tier>": 5
    }],
    [35,  49,  7684,  768,  4776, {
      "<default-normal> | hp=30 | <no-tier>": 30,
      "flying | hp=20 | <no-tier>": 6,
      "boss | <no-health> | <no-tier>": 1,
      "angry | hp=40 | <no-tier>": 7,
      "shielded | hp=30 | <no-tier>": 4,
      "colossus | hp=1024 | <no-tier>": 1
    }],
  ];

  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function signature(grp) {
    return [
      has(grp, "type") ? String(grp.type) : "<default-normal>",
      has(grp, "health") ? "hp=" + grp.health : "<no-health>",
      has(grp, "tier") ? "tier=" + grp.tier : "<no-tier>"
    ].join(" | ");
  }

  t.eq(h.game.WAVES.length, 35, "thirty-five waves");
  t.eq(BEFORE_TIMELINE.length, 35, "and thirty-five rows to check them against");

  var totals = { bodies: 0, health: 0, clear: 0, kill: 0 };
  var wrong = [];

  h.game.WAVES.forEach(function (wave, i) {
    var row = BEFORE_TIMELINE[i];
    var name = "wave " + row[0];
    var groups = h.game.waveGroups(wave);

    var composition = {};
    var kill = 0;
    groups.forEach(function (grp) {
      var key = signature(grp);
      composition[key] = (composition[key] || 0) + grp.count;
      var type = Enemy.TYPES[grp.type || "normal"];
      var hp = has(grp, "health") ? grp.health : type.health;
      kill += grp.count * Math.round(type.bounty * hp / type.health);
    });

    if (h.game.waveCount(wave) !== row[1]) {
      wrong.push(name + " deploys " + h.game.waveCount(wave) + " bodies, not " + row[1]);
    }
    if (h.game.waveEffectiveHealth(wave) !== row[2]) {
      wrong.push(name + " is " + h.game.waveEffectiveHealth(wave) +
        " effective HP, not " + row[2]);
    }
    if (h.game.waveBounty(wave) !== row[3]) {
      wrong.push(name + " clears for $" + h.game.waveBounty(wave) + ", not $" + row[3]);
    }
    if (kill !== row[4]) {
      wrong.push(name + " is worth $" + kill + " in kills, not $" + row[4]);
    }

    // Both directions: a signature that appeared and one that vanished are the
    // same defect seen from either end, and a one-way check calls a group that
    // grew a `health` field "missing" on one side only.
    Object.keys(composition).forEach(function (key) {
      if (composition[key] !== row[5][key]) {
        wrong.push(name + " now has " + composition[key] + " x [" + key +
          "], the schedule had " + (row[5][key] === undefined ? "none" : row[5][key]));
      }
    });
    Object.keys(row[5]).forEach(function (key) {
      if (composition[key] === undefined) {
        wrong.push(name + " has lost all " + row[5][key] + " x [" + key + "]");
      }
    });

    totals.bodies += row[1];
    totals.health += row[2];
    totals.clear += row[3];
    totals.kill += row[4];
  });

  t.eq(wrong.join("\n          "), "", "every wave matches the pre-rewrite schedule");

  // The four campaign numbers AGENTS.md quotes, recomputed from the live
  // schedule rather than from the table above -- otherwise this is the table
  // agreeing with itself.
  var live = { bodies: 0, health: 0, clear: 0, kill: 0 };
  h.game.WAVES.forEach(function (wave) {
    live.bodies += h.game.waveCount(wave);
    live.health += h.game.waveEffectiveHealth(wave);
    live.clear += h.game.waveBounty(wave);
    live.kill += h.game.waveKillBounty(wave);
  });
  t.eq(live.bodies, 830, "830 authored bodies across the campaign");
  t.eq(totals.bodies, 830, "and the table adds to the same 830");
  t.eq(live.health, 25939, "25 939 effective HP");
  t.eq(totals.health, 25939, "and the table agrees");
  t.eq(live.clear, 2594, "$2594 of clear bounty");
  t.eq(totals.clear, 2594, "and the table agrees");
  t.eq(totals.kill, 23132, "$23 132 priced off the type rows");
  // The game's own pricing over the same bodies. The two used to differ by
  // $666 -- Enemy.bountyOf resolves a Fractal Slime's TIER, which the type-row
  // sum above cannot see -- and since 2026-08-29 the campaign schedules no
  // fractal at all, so every body it prices is priced off its own health and
  // the two formulas land on one number. They must still be asserted apart:
  // the day a tiered body is scheduled again, this is the pair that shows it.
  t.eq(live.kill, 23132, "and the same $23 132 through Enemy.bountyOf");

  // --- the roster rules the schedule is built around ----------------------
  //
  // These are not restatements of the table: they are the reasons the table
  // looks the way it does, and they are what a reader checks a retune against.
  var where = {};
  var fractals = [];
  h.game.WAVES.forEach(function (wave, i) {
    h.game.waveGroups(wave).forEach(function (grp) {
      var id = grp.type || Enemy.DEFAULT_TYPE;
      where[id] = where[id] || [];
      where[id].push(i + 1);
      if (id === "fractal_slime") fractals.push([i + 1, grp.tier, grp.count]);
    });
  });

  t.deep(where.midboss, [11], "the Midboss is wave 11's whole wave and appears nowhere else");
  t.eq(h.game.waveCount(h.game.WAVES[10]), 1, "and it is exactly one body");
  t.deep(where.boss, [35], "the Tyrant is scheduled once, in wave 35");
  t.deep(where.boss_fast, [34], "the Vanguard once, in wave 34");
  // TWICE SINCE 2026-08-29. Wave 35's is the body that replaced the T5 Fractal
  // Slime -- 1024 points, matched to the root it stands in for -- and it is
  // the heaviest single non-boss body in the campaign.
  t.deep(where.colossus, [29, 35], "the Colossus in waves 29 and 35");

  // Flight is INTRODUCED at 24 and then mixes in freely; camo is introduced at
  // 14 and every wave that carries it carries nothing else (the two tests above
  // own the "nothing else" half -- this owns which waves).
  var flies = [], camo = [];
  h.game.WAVES.forEach(function (wave, i) {
    var groups = h.game.waveGroups(wave);
    if (groups.some(function (g) { return !!Enemy.typeOf(g.type).isFlying; })) flies.push(i + 1);
    if (groups.every(function (g) { return !!Enemy.typeOf(g.type).isCamo; })) camo.push(i + 1);
  });
  t.eq(flies[0], 24, "flight is introduced at wave 24");
  // 32 JOINED THIS SET WHEN THE HEALER LEARNED TO FLY, and this fixture is
  // simply older than that ruling -- it was written on a branch that forked
  // before it. `isFlying: true` on the healer row is deliberate, dated
  // 2026-08-26 and carries the owner's instruction verbatim ("make the healer
  // a flying unit") plus the reversal of the argument that used to sit there.
  // The CODE is canonical; this list is the thing that went stale. Wave 32 is
  // the healer wave, so it is the only one the change could have added.
  t.deep(flies, [24, 31, 32, 35], "and returns three times after that");
  t.deep(camo, [14, 18, 28], "waves 14, 18 and 28 are camo end to end");

  // NO FRACTAL SLIME IS SCHEDULED, and this used to be the tier ladder's own
  // fixture: four T0s in 16, two T1s in 17, and one rung each in 22, 25, 33
  // and 35. 2026-08-29, at the owner's instruction, all ten roots came off the
  // campaign and were replaced body for body and point for point (see the
  // block above wave 16 in js/game.js). The assertion is inverted rather than
  // deleted: an empty list is the claim, and a fractal creeping back into the
  // schedule -- which is exactly the sort of thing a retune does by copying a
  // group -- fails here rather than nowhere.
  t.deep(fractals, [], "the campaign schedules no Fractal Slime");

  // --- and every ceiling still outlasts its own wave ----------------------
  //
  // Point-blank, off the EVENT LIST rather than off the group arithmetic the
  // shipping validator uses, so the two derivations have to agree. A `duration`
  // at or under the last arrival deletes the tail of its wave silently: the
  // wave still says 88 bodies, still pays for 88, and 88 is what the table
  // above would still read.
  var short = [];
  h.game.WAVES.forEach(function (wave, i) {
    var ev = h.game.waveTimeline(wave);
    var last = ev[ev.length - 1].time;
    if (i === h.game.WAVES.length - 1) {
      if (wave.duration !== undefined) short.push("wave 35 carries a ceiling");
      return;
    }
    if (!(wave.duration > last)) {
      short.push("wave " + (i + 1) + ": ceiling " + wave.duration +
        " s does not outlast its last arrival at " + last + " s");
    }
  });
  t.eq(short.join(" | "), "",
    "every ceiling is strictly past its wave's last arrival, and wave 35 has none");
});

// 2026-07-29, at the owner's request: "give money at the end of each round,
// around 1/10 of the hp of the wave" — and then, on review, "the clear bonus
// should come AFTER DEFEATING the wave, so basically at the start of the
// countdown to the next wave if the wave was skipped".
//
// So it is OWED when the wave finishes deploying and PAID by whichever of
// three things happens first. One test per route in, because the latch that
// makes it pay exactly once is the whole risk here.
test("the clear bonus is owed on deploy and paid on DEFEATING the wave", function (t) {
  var h = harness.boot();
  var owed = h.game.waveReward(h.game.WAVES[0], 1);

  var before = h.game.cash;
  h.step(3.2);
  // `waveFullyDeployed`, NOT `waveIndex === 1` (2026-08-25). Under the
  // sequential scheduler a wave was popped off the cursor by its own last
  // spawn, so the index rolling over WAS "fully deployed". A timeline wave
  // stays on the cursor until a gate closes it -- which is the whole point --
  // so the index still reads 0 here and the cursor is what to ask.
  t.ok(h.run("waveFullyDeployed()"), "wave 1 is fully deployed");
  t.eq(h.game.waveIndex, 0, "and still the wave in play, three seconds in");
  t.eq(h.game.cash, before, "and deploying alone pays NOTHING");
  t.eq(h.game.pendingBounty, owed, "the bonus is owed");
  t.eq(h.game.pendingBountyWave, 1, "and knows which wave it is for");

  // Route 1: the board clears. The honest case -- the wave was defeated.
  h.run("enemies.forEach(function (e) { e.noBounty = true; e.dead = true; })");
  h.step(1 / 60);
  t.eq(Math.round(h.game.cash - before), owed, "clearing the board pays it");
  t.eq(h.game.pendingBounty, 0, "and it is no longer owed");

  h.step(20);
  t.eq(Math.round(h.game.cash - before), owed, "and it is never paid twice");
});

test("skipping the break pays the bonus at the start of the countdown", function (t) {
  var h = harness.boot();
  var owed = h.game.waveReward(h.game.WAVES[0], 1);

  var before = h.game.cash;
  h.step(3.2);
  // Something still walking, so the board-clear route cannot fire and only the
  // skip can pay.
  h.game.enemies[0].rooted = true;
  t.eq(h.game.cash, before, "unpaid while the wave is still on the board");

  t.ok(h.run("skipNextWave()"), "the player calls the next wave in");
  t.eq(Math.round(h.game.cash - before), owed, "and the bonus lands with the countdown");

  h.run("skipNextWave()");
  t.eq(Math.round(h.game.cash - before), owed, "pressing again pays nothing more");
});

// THE THIRD ROUTE IN, AND IT IS NOW THE CEILING RATHER THAN A BREAK EXPIRING
// (2026-08-25). It used to be "the ninety seconds ran out with stragglers still
// walking, so the next wave's first spawn pays": there is no ninety and no
// break to run out. What is left is the same shape one level up -- the wave's
// own `duration` expires with a body still alive, so the wave is over on its
// own terms rather than on the player's.
test("if a wave's ceiling simply runs out, the expiry pays the bonus", function (t) {
  var h = harness.boot();
  var owed = h.game.waveReward(h.game.WAVES[0], 1);
  var limit = h.game.WAVES[0].duration;

  var before = h.game.cash;
  h.step(3.2);
  h.game.enemies[0].rooted = true;           // neither cleared nor skipped
  h.step(limit - 3.3);
  t.eq(h.game.cash, before,
    "still unpaid a tenth of a second short of the ceiling (" + limit + " s)");
  t.ok(h.run("waveInPlay()"), "wave 1 is still the wave in play");

  h.step(0.3);
  t.eq(Math.round(h.game.cash - before), owed, "the ceiling expiring settles it");
  t.eq(h.game.waveIndex, 1, "and wave 2 is next");
  t.ok(h.game.waveCountdown <= 5 && h.game.waveCountdown > 0,
    "five seconds out, like any other closed wave (" +
    h.game.waveCountdown.toFixed(2) + ")");
  t.ok(h.run("enemies.filter(function (e) { return e.waveId === 1; }).length") > 0,
    "and the survivors are still walking -- an expiry keeps the road");
  t.eq(h.game.pendingBounty, 0,
    "nothing new is owed until wave 2 finishes deploying");
});

test("the bonus is about a tenth, and about $2500 across the run", function (t) {
  var h = harness.boot();
  var total = 0;
  h.game.WAVES.forEach(function (wave) { total += h.game.waveBounty(wave); });
  // ~$2500 since 2026-07-30, and it was ~$1350: the bounty is DERIVED as a
  // tenth of each wave, so doubling the schedule's health doubled it with no
  // edit here. That is the arrangement working -- only the bound moved.
  t.ok(total > 2300 && total < 2700, "about $2500 across the run (" + total + ")");

  // A supplement, not the main economy: just over a tenth of the authored
  // kill bounties across the same schedule.
  var kills = 0;
  h.game.WAVES.forEach(function (wave) { kills += h.game.waveKillBounty(wave); });
  t.ok(total / kills > 0.10 && total / kills < 0.12,
    "which stays secondary to kill income");
});

test("$5000 of opening cash is distributed exactly across waves 1-34", function (t) {
  var h = harness.boot();
  var total = 0;
  for (var waveNumber = 1; waveNumber <= h.game.WAVES.length; waveNumber++) {
    total += h.game.waveProgressionReward(waveNumber);
  }
  t.eq(h.game.WAVE_PROGRESSION_REWARD_TOTAL, 5000, "redistributed amount");
  t.eq(total, 5000, "all of it is present in the first 34 rewards");
  t.eq(h.game.waveProgressionReward(1), 148, "wave 1 gets one remainder dollar");
  t.eq(h.game.waveProgressionReward(2), 148, "wave 2 gets the other");
  t.eq(h.game.waveProgressionReward(3), 147, "the regular share is $147");
  t.eq(h.game.waveProgressionReward(34), 147, "wave 34 still pays a share");
  t.eq(h.game.waveProgressionReward(35), 0, "wave 35 gets no post-campaign money");
});

test("wave rewards add $50 on wave 1 and $5 more each wave", function (t) {
  var h = harness.boot();
  var total = 0;
  for (var waveNumber = 1; waveNumber <= h.game.WAVES.length; waveNumber++) {
    total += h.game.waveEscalatingReward(waveNumber);
  }
  t.eq(h.game.waveEscalatingReward(1), 50, "wave 1 adds $50");
  t.eq(h.game.waveEscalatingReward(2), 55, "wave 2 adds $55");
  t.eq(h.game.waveEscalatingReward(34), 215, "wave 34 adds $215");
  t.eq(h.game.waveEscalatingReward(35), 0, "wave 35 has no spendable reward");
  t.eq(total, 4505, "the staircase adds $4505 across waves 1-34");
});

// The three v0.4.7 types are gated behind the midboss at wave 11, at the
// owner's request: the introduction has no vocabulary for a shield or a
// second life, and meeting one at wave 6 would teach the wrong lesson.
test("the v0.4.7 roster appears only after the midboss", function (t) {
  var h = harness.boot();
  var LATE = ["shielded", "revenant", "hive"];

  h.game.WAVES.forEach(function (wave, i) {
    h.game.waveGroups(wave).forEach(function (g) {
      if (g.type === "boss") {
        t.eq(i, 34, "the Tyrant appears in wave 35 and nowhere else");
        return;
      }
      if (LATE.indexOf(g.type) === -1) return;
      t.ok(i > 10, g.type + " at wave " + (i + 1) + ", which is after the midboss");
    });
  });
});

// A camo wave carries NOTHING VISIBLE, and this is a rule about the Smasher
// rather than about tidiness. Its swing damages whatever it physically
// reaches, camo included -- it just will not turn towards something it cannot
// see. Put one visible enemy in a camo wave and a detectionless Smasher starts
// swinging and takes the camo down as collateral, and the buy-detection check
// the schedule is built around quietly evaporates.
//
// THE ASSERTION WAS "ONE GROUP" UNTIL 2026-07-30, which is the same rule only
// while camo comes in one flavour. Wave 28 now sends Camo Normals and Camo
// Heavies together -- two groups, nothing visible in either, and the check it
// protects is exactly as intact. So the test states what was always meant: no
// non-camo group in a wave that has a camo one.
test("nothing visible walks in a camo wave", function (t) {
  var h = harness.boot();

  h.game.WAVES.forEach(function (wave, i) {
    var groups = h.game.waveGroups(wave);
    var camo = groups.some(function (g) {
      return !!h.game.Enemy.typeOf(g.type).isCamo;
    });
    if (!camo) return;
    var visible = groups.filter(function (g) {
      return !h.game.Enemy.typeOf(g.type).isCamo;
    });
    t.eq(visible.length, 0,
      "wave " + (i + 1) + " is a camo wave and holds no visible group");
  });
});

// The same argument, one mechanic over. A ground-only tower cannot target a
// flyer at all, and a Smasher's swing does not care what it can target -- so
// the wave that ASKS whether air reach was bought has to hold nothing a blind
// Smasher could be swinging at anyway. Only that wave: once the question has
// been asked, flyers mix in freely.
test("the wave that asks for air reach holds nothing else", function (t) {
  var h = harness.boot();
  var first = null;

  h.game.WAVES.forEach(function (wave, i) {
    var groups = h.game.waveGroups(wave);
    var flies = groups.some(function (g) {
      return !!h.game.Enemy.typeOf(g.type).isFlying;
    });
    if (flies && first === null) first = i;
  });

  t.ok(first !== null, "the campaign schedules flight at all");
  t.eq(first, 23, "and introduces it at wave 24");

  // EVERY GROUP FLIES, rather than "there is only one group" (2026-08-25). The
  // rule was always about the ROSTER -- nothing on the ground for a blind
  // Smasher to swing at -- and "one group" was only ever a proxy for it that
  // happened to hold while groups were sequential. Wave 24 is now three salvos
  // of Aether Wisps and is exactly as pure as it ever was; the old assertion
  // would have failed it while the rule it protects was untouched.
  var ground = h.game.waveGroups(h.game.WAVES[first]).filter(function (g) {
    return !h.game.Enemy.typeOf(g.type).isFlying;
  });
  t.eq(ground.length, 0, "and it holds nothing on the ground");
});

test("the v0.4.4 twenty-wave spine is still in there, in order", function (t) {
  var h = harness.boot();
  // The old waves were never replaced. v0.4.5 inserted eleven waves BETWEEN
  // them; v0.4.7 gave some of them a second group behind their opening and
  // turned their `health` overrides up. What has to survive all of that is the
  // ESCALATION CURVE: each old wave still CONTAINS its exact count and type, in
  // its original order. Not "opens" -- the timeline rewrite cut long groups into
  // salvos, so old wave 2's eight Normals now arrive as 4 + 4 and no single
  // group carries the old row. The assertion below matches on the aggregate and
  // deliberately does not match `interval` at all.
  //
  // That is what a schedule rebuilt from scratch loses -- the last attempt put
  // the first swarm at wave 5, when three towers are on the board, and
  // null-meridian could not survive it. If this fails, someone has reshaped the
  // spine and the whole thing needs re-measuring.
  var OLD = [
    { count: 5,  interval: 0.8 },
    { count: 8,  interval: 1 },
    { count: 8,  interval: 0.6,  type: "fast" },
    { count: 12, interval: 0.7 },
    { count: 6,  interval: 1.4,  type: "slow" },
    { count: 14, interval: 0.4,  type: "fast" },
    { count: 16, interval: 0.55 },
    { count: 10, interval: 1,    type: "slow" },
    { count: 18, interval: 0.35, type: "fast" },
    { count: 14, interval: 0.8,  type: "slow" },
    { count: 16, interval: 0.5,  health: 8 },
    { count: 12, interval: 0.4,  type: "fast", health: 6 },
    { count: 14, interval: 0.7,  type: "slow", health: 14 },
    { count: 20, interval: 0.45, health: 10 },
    { count: 18, interval: 0.3,  type: "fast", health: 8 },
    { count: 16, interval: 0.6,  type: "slow", health: 20 },
    { count: 24, interval: 0.4,  health: 14 },
    { count: 20, interval: 0.28, type: "fast", health: 10 },
    { count: 18, interval: 0.55, type: "slow", health: 28 },
    { count: 30, interval: 0.35, health: 18 }
  ];

  // MATCHED ON THE WAVE'S AGGREGATE, NOT ON ITS FIRST GROUP (2026-08-25).
  //
  // Until the timeline rewrite each tagged wave literally OPENED with the old
  // wave's count/interval/type, and this walked the first group of each wave
  // looking for that row. The rewrite cut every wave into the salvos it
  // actually arrives in -- old wave 2 is still eight stock Normals, but they
  // land as 4 + 4 rather than as one group of eight -- so no single group
  // carries the old row any more and `interval` is a property of a salvo rather
  // than of a wave.
  //
  // What SURVIVES, and what the spine was always about, is the escalation
  // curve: the same type, the same TOTAL count, in the same order, not weaker
  // than it was. That is what is matched here. `interval` is deliberately not
  // matched at all -- it is now a timing decision inside a wave, and pinning it
  // would pin the one thing the rewrite was allowed to move.
  //
  // If this fails, someone has reshaped the spine and the whole thing needs
  // re-measuring -- the last from-scratch rebuild put the first swarm at wave
  // 5, when three towers are on the board, and null-meridian could not survive
  // it.
  // ONE SALVO FAMILY, NOT EVERY BODY OF THAT TYPE IN THE WAVE (2026-08-29).
  //
  // This used to sum every group of the wanted type and then read `health` off
  // whichever of them happened to be last, which is meaningless the moment a
  // wave carries two unlike salvos of one type. It went wrong the day wave 17's
  // two Fractal Slime roots became two 4 HP Normals: 14 Normals at 13 plus 2 at
  // 4 is sixteen bodies, so wave 17 matched old wave 11's "16 Normals" ahead of
  // wave 19 -- its authored home -- and then reported the spine as WEAKER,
  // 8 -> 4, off the two-body salvo.
  //
  // The rewrite the comment above describes split old waves into salvos of the
  // SAME weight (old wave 2's eight Normals arrive as 4 + 4), so that is what a
  // spine wave looks like: one health, split across groups. Bucketing by health
  // and asking for a bucket of the right size is the same claim, stated so that
  // an unrelated body of the same type cannot join it.
  function aggregate(h, wave, typeId, wantCount) {
    var byHealth = {};
    h.game.waveGroups(wave).forEach(function (g) {
      if ((g.type || "normal") !== typeId) return;
      var key = g.health === undefined ? "" : String(g.health);
      byHealth[key] = (byHealth[key] || 0) + g.count;
    });
    var keys = Object.keys(byHealth);
    for (var i = 0; i < keys.length; i++) {
      if (byHealth[keys[i]] === wantCount) {
        return { count: wantCount, health: keys[i] === "" ? undefined : Number(keys[i]) };
      }
    }
    return { count: -1, health: undefined };
  }

  var i = 0;
  h.game.WAVES.forEach(function (wave) {
    if (i >= OLD.length) return;
    var want = OLD[i];
    var wantType = want.type || "normal";
    var got = aggregate(h, wave, wantType, want.count);
    if (got.count !== want.count) return;
    // Health may have been turned UP by v0.4.7. It must never have been turned
    // down: that would be a difficulty cut hiding inside a difficulty raise.
    var was = h.game.Enemy.healthOf(want.type, want.health);
    var now = h.game.Enemy.healthOf(want.type, got.health);
    t.ok(now >= was, "old wave " + (i + 1) + " is not weaker than it was (" +
      was + " -> " + now + ")");
    i++;
  });
  t.eq(i, OLD.length,
    "all twenty old waves are still in the schedule, in their original order");
});

test("every enemy type is scheduled, and every scheduled type exists", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;

  // The index screen derives "appears in waves N, M" from the schedules, so a
  // type that is never scheduled anywhere would be documented as content nobody
  // can meet.
  //
  // Waves may be MIXED since v0.4.7, so this walks groups rather than waves --
  // the old "exactly one type per wave" half of this test is gone, replaced by
  // the camo rule above, which is the part that was actually load-bearing.
  //
  // AND IT WALKS EVERY DIFFICULTY SINCE 2026-08-27, which is the change the
  // second schedule forced and the right one. "Is this content reachable" is a
  // question about the GAME; asking it of one schedule would either freeze Easy
  // out of ever gaining a type or -- what actually happened -- fail the moment
  // the Herald, the Sapper and the Volatile were authored into Normal and
  // deliberately kept out of Easy. The per-difficulty coverage is pinned
  // separately, in the Normal group below.
  var scheduled = {};
  h.game.DIFFICULTIES.forEach(function (difficulty) {
    difficulty.waves.forEach(function (wave) {
      h.game.waveGroups(wave).forEach(function (g) {
        var id = g.type || Enemy.DEFAULT_TYPE;
        Enemy.typeOf(id);                   // throws on a typo in the schedule
        scheduled[id] = (scheduled[id] || 0) + 1;
      });
    });
  });

  // `sandboxOnly` is the one exemption, and since 2026-07-30 NOTHING carries
  // it: the last holder was the Aether Wisp, which is now wave 24's whole
  // wave. The branch stays because the flag is still the documented way to
  // park a type in the index and the sandbox while it is being looked at.
  Object.keys(Enemy.TYPES).forEach(function (id) {
    if (Enemy.TYPES[id].sandboxOnly) {
      t.eq(scheduled[id] || 0, 0, id + " stays out of the fixed campaign");
    } else {
      t.ok(scheduled[id] > 0, id + " appears in the campaign");
    }
  });
});

// THE TIMELINE ITSELF: a wave resolved from what it CONTAINS into what it
// DOES. Wave 12 is the first mixed wave and the best witness -- four groups,
// three types, deliberately on top of each other:
//
//   g0  18 Fast   from 0.00 s, every 0.35
//   g1  40 Swarm  from 1.50 s, every 0.20
//   g2  15 Normal from 4.00 s, every 0.65
//   g3  15 Normal from 10.00 s, every 0.65
//
// This test replaced "a mixed wave deploys its groups in order, each at its own
// spacing" on 2026-08-25. That test was true and is now false: groups did
// deploy in order, one after the last had finished, with a `lead` buying a
// pause in front of each. The field is gone, the ordering is gone, and the
// claim that replaced it is stronger -- the arrival order is a stated function
// of the data rather than of the array.
test("a wave resolves into one interleaved timeline of arrivals", function (t) {
  var h = harness.boot();
  var wave = h.game.WAVES[11];
  var ev = h.game.waveTimeline(wave);

  t.eq(h.game.waveCount(wave), 88, "eighty-eight bodies");
  t.eq(h.game.waveGroups(wave).length, 4, "across four groups");
  t.eq(ev.length, 88, "and one event per body");

  // THE Nth ARRIVAL IS NOT THE Nth MEMBER OF ANY GROUP. The sixth body out of
  // the gate belongs to the SECOND group -- the Swarm salvo opens at 1.50 s,
  // between the fifth Fast at 1.40 and the sixth at 1.75. Reading the group
  // list top to bottom would have said "Fast".
  t.eq(ev[4].time, 1.4, "the fifth arrival is at 1.40 s");
  t.eq(ev[4].type, "fast", "and is a Fast");
  t.eq(ev[5].time, 1.5, "the sixth is at 1.50 s");
  t.eq(ev[5].type, "swarm", "and is a Swarm, from the group BELOW it in the data");
  t.eq(ev[6].type, "swarm", "so is the seventh, at 1.70");
  t.eq(ev[7].type, "fast", "and the eighth is the Fast group again, at 1.75");

  // N * interval from the group's own `at`, so the last body of the last group
  // lands exactly where the data says: 10 + 14 * 0.65.
  t.eq(ev[87].time, 19.1, "the last arrival is at 19.10 s");
  t.ok(wave.duration > 19.1,
    "inside the wave's own 48 s ceiling, which is what makes it deployable");

  // EXACT TIES HAPPEN AND ARE BROKEN BY THE DATA'S OWN ORDER. 2.10 s is the
  // seventh Fast and the fourth Swarm at once; the Fast group is written first,
  // so it goes first, on every engine and every run. Fourteen of the
  // thirty-five waves have at least one tie -- this is ordinary, not exotic.
  var tied = ev.filter(function (e) { return Math.abs(e.time - 2.1) < 1e-9; });
  t.eq(tied.length, 2, "two bodies are due at 2.10 s exactly");
  t.eq(tied[0].groupIndex, 0, "the earlier GROUP goes first");
  t.eq(tied[1].groupIndex, 1, "then the later one");

  // The list is sorted, strictly non-decreasing, with (groupIndex, bodyIndex)
  // as a total order underneath -- so there is nothing left for a sort's
  // stability to decide.
  var monotone = true;
  for (var i = 1; i < ev.length; i++) {
    if (ev[i].time < ev[i - 1].time) monotone = false;
    if (ev[i].time !== ev[i - 1].time) continue;
    if (ev[i].groupIndex < ev[i - 1].groupIndex) monotone = false;
    if (ev[i].groupIndex === ev[i - 1].groupIndex &&
        ev[i].bodyIndex <= ev[i - 1].bodyIndex) monotone = false;
  }
  t.ok(monotone, "the whole list is ordered by (time, groupIndex, bodyIndex)");

  // ABSENCE IS COPIED AS ABSENCE. Wave 12's normals author no `type`, and the
  // event says `undefined` rather than "normal" -- materialising the default
  // here would put a value in front of Enemy.typeOf that the schedule never
  // wrote, which is how a default silently becomes a decision.
  t.eq(ev[87].type, undefined, "a group with no `type` yields events with none");
  t.eq(ev[87].tier, undefined, "and no `tier` either");
  t.eq(ev[87].health, 5, "while an authored override IS carried");

  // The banner is a ROSTER and aggregates the salvos away: 30 Normals, not two
  // entries of 15.
  t.eq(h.game.waveSummary(wave), "18 × Fast  +  40 × Swarm  +  30 × Normal",
    "the banner lists what is in the wave, not how it is cut up");
});

// GROUPS ARE NOT A QUEUE, AND WAVE 22 IS WHERE THAT COSTS THE MOST.
//
//   g0  12 Fast          from  0.00 s, every 0.40
//   g1   4 Brute         from  1.60 s, every 2.20
//   g2  20 Swarm         from  3.00 s, every 0.15
//   g3   1 Fractal Slime at   11.00 s, tier 2
//
// The first three windows overlap by construction: from 3.00 s until the last
// Fast at 4.40 s, all three are emitting. Under the sequential scheduler this
// wave was twelve Fast, THEN four Brutes, THEN twenty Swarm, and `lead` bought
// a pause in FRONT of a group -- there was no arrangement of that field that
// could put a Brute and a Swarm on the road inside the same second. The wave a
// player met was a different wave from the one the data reads like, and that
// is the defect the whole rewrite exists to remove.
//
// The wave-12 test above is the two-group case and reads better; this is the
// three-group one, plus the pair of groups that open on the SAME FRAME, which
// is the case the old model could not express at all.
test("wave 22 runs three groups at once, and wave 30 opens two on the same frame",
function (t) {
  var h = harness.boot();
  var w22 = h.game.WAVES[21];
  var ev = h.game.waveTimeline(w22);

  t.eq(h.game.waveGroups(w22).length, 4, "wave 22 authors four groups");
  t.eq(ev.length, 37, "and thirty-seven bodies between them");

  // Each group's window is read OFF THE TIMELINE rather than typed as
  // `at + (count - 1) * interval`: 1.6 + 3 * 2.2 is 8.200000000000001 in binary
  // floating point, and a typed 8.2 would be a test failing on arithmetic
  // nobody got wrong.
  function windowOf(index) {
    var mine = ev.filter(function (e) { return e.groupIndex === index; });
    return { from: mine[0].time, to: mine[mine.length - 1].time, n: mine.length };
  }
  var fast = windowOf(0), brute = windowOf(1), swarm = windowOf(2), slime = windowOf(3);
  t.deep([fast.n, brute.n, swarm.n, slime.n], [12, 4, 20, 1],
    "twelve Fast, four Brutes, twenty Swarm and one slime");
  t.near(fast.to, 4.4, 1e-9, "the Fast salvo is out by 4.40 s");
  t.near(brute.to, 8.2, 1e-9, "the Brutes take until 8.20 s");
  t.near(swarm.to, 5.85, 1e-9, "the Swarm until 5.85 s");
  t.eq(slime.from, 11, "and the T2 slime lands at 11.00 s");

  function overlaps(a, b) { return a.from <= b.to && b.from <= a.to; }
  t.ok(overlaps(fast, brute), "the Fast salvo is still arriving when the Brutes start");
  t.ok(overlaps(brute, swarm), "and the Brutes when the Swarm starts");
  t.ok(overlaps(fast, swarm), "and all three windows share ground");
  t.notOk(overlaps(swarm, slime), "the slime alone waits for the rest to finish");

  // THE CLAIM ITSELF: one window in which bodies from three different groups
  // arrive. Not "three groups exist" -- three groups EMITTING.
  var seen = {};
  ev.forEach(function (e) {
    if (e.time >= swarm.from && e.time <= fast.to) seen[e.groupIndex] = true;
  });
  t.deep(Object.keys(seen).sort(), ["0", "1", "2"],
    "between 3.00 s and 4.40 s the timeline draws from all three groups");

  // And on the REAL clock, not just in the event list: at 4.40 s the road is
  // holding all three types at once. Deployment only -- no towers, nothing
  // dies, so what is standing there is what was emitted.
  h.run("waveIndex = 21; waveSpawned = 0; waveCountdown = 0; waveElapsed = 0;" +
        "waveOnClockIndex = -1; enemies.length = 0; bullets.length = 0;");
  for (var i = 0; i < Math.round(4.4 * 60); i++) h.game.updateWaves(1 / 60);
  var live = {};
  h.game.enemies.forEach(function (e) {
    var id = e.typeId || "normal";
    live[id] = (live[id] || 0) + 1;
  });
  t.eq(live.fast, 12, "twelve Fast on the road at 4.40 s");
  t.eq(live.brute, 2, "two of the four Brutes, on their own 2.2 s spacing");
  t.eq(live.swarm, 10, "and ten Swarm, from a group that opened after both");

  // WAVE 30, GROUPS 6 AND 7, BOTH AUTHORED AT 7.00 s. Two groups do not merely
  // overlap here, they OPEN TOGETHER -- a Hive and an Angry on one frame. The
  // old model had one cursor and one pause in front of each group, so this is
  // a sentence it could not say; the tie-break that makes it deterministic is
  // the data's own order, checked here on the shipping schedule rather than on
  // a fixture built to have a tie.
  var g30 = h.game.waveGroups(h.game.WAVES[29]);
  t.eq(g30[6].at, 7, "wave 30's seventh group opens at 7.00 s");
  t.eq(g30[7].at, 7, "and so does its eighth");
  t.eq(g30[6].type, "hive", "a Hive");
  t.eq(g30[7].type, "angry", "and an Angry");

  var tied = h.game.waveTimeline(h.game.WAVES[29]).filter(function (e) {
    return e.time === 7;
  });
  t.eq(tied.length, 2, "two bodies are due on that one frame");
  t.eq(tied[0].groupIndex, 6, "the earlier group in the data goes first");
  t.eq(tied[1].groupIndex, 7, "then the later one -- ordering is never the sort's to pick");

  // OVERLAP IS THE ORDINARY CASE, not two waves chosen because they read well.
  // A floor rather than an exact count: the campaign's shape is allowed to move
  // and this is a statement about the MODEL, which would be pointless if only
  // one wave in the book used it.
  var overlapping = [];
  h.game.WAVES.forEach(function (wave, i) {
    var gs = h.game.waveGroups(wave).map(function (grp) {
      return { from: grp.at, to: grp.at + (grp.count - 1) * grp.interval };
    });
    for (var a = 0; a < gs.length; a++) {
      for (var b = a + 1; b < gs.length; b++) {
        if (gs[a].from <= gs[b].to && gs[b].from <= gs[a].to) {
          if (overlapping.indexOf(i + 1) === -1) overlapping.push(i + 1);
        }
      }
    }
  });
  t.ok(overlapping.length >= 15,
    "most of the campaign overlaps at least one pair of groups (" +
    overlapping.length + " of 35: " + overlapping.join(", ") + ")");
});

// THE PROPERTY THE WHOLE SCHEDULER EXISTS FOR: the same wave deploys the same
// bodies in the same order whether time arrives as two hundred small steps or
// as one large one.
//
// It is not a nicety. gameSpeed multiplies how much time a frame hands the
// fixed-step accumulator, a stalled tab hands over a clamped lump, and the
// suite steps in whatever size it finds convenient -- so if the emission
// depended on the step size, the schedule would be a different schedule at 3x,
// after a stall, and under test than it is in front of a player.
test("the same wave deploys identically at any step size", function (t) {
  function deploy(step, seconds) {
    var h = harness.boot();
    h.run("waveIndex = 11; waveSpawned = 0; waveCountdown = 0; waveElapsed = 0;" +
          "enemies.length = 0; bullets.length = 0;");
    var steps = Math.round(seconds / step);
    for (var i = 0; i < steps; i++) h.game.updateWaves(step);
    return h.run("enemies.map(function (e) { return e.typeId + '@' + " +
                 "Math.round(e.maxHealth); }).join(',')");
  }

  // 12 s into wave 12: past the fourth group's opening at 10 s, so all four
  // groups are represented and the interleave is fully exercised.
  var fine = deploy(1 / 60, 12);
  var coarse = deploy(1 / 6, 12);
  var single = deploy(12, 12);

  t.ok(fine.length > 0, "the fine run deployed something (" +
    fine.split(",").length + " bodies)");
  t.eq(coarse, fine, "ten times the step, identical deployment");
  t.eq(single, fine, "one step covering the whole window, identical deployment");

  // And nothing is emitted twice or dropped: the count is exactly the number of
  // events the data puts at or before 12 s -- 18 Fast, 40 Swarm, 13 of the
  // third group and 4 of the fourth. Derived from waveTimeline rather than
  // typed, so a retune of wave 12 moves the expectation with the data instead
  // of turning this into a stale fixture.
  var h = harness.boot();
  var due = h.game.waveTimeline(h.game.WAVES[11]).filter(function (e) {
    return e.time <= 12;
  }).length;
  t.eq(due, 75, "wave 12 authors 75 arrivals in its first twelve seconds");
  t.eq(fine.split(",").length, due, "and exactly that many bodies are on the road");

  // AND THE SAME FOR THE WHOLE CAMPAIGN, not just for the wave chosen to read
  // well. Every wave deployed end to end at 60 fps, and again in steps of three
  // seconds -- which is 42 steps for the shortest wave and one for most of the
  // longest -- compared body for body, in order, with the type, the resolved
  // health and the wave identity of each. 830 bodies is the campaign's whole
  // authored population.
  //
  // The cursor is moved by assignment because the point is to deploy each wave
  // in isolation rather than to play the schedule; `waveOnClockIndex = -1` is
  // reset with it so each wave is announced exactly as it would be in a run.
  function deployWholeSchedule(step) {
    var g = harness.boot();
    var out = [];
    for (var w = 0; w < g.game.WAVES.length; w++) {
      g.run("waveIndex = " + w + "; waveSpawned = 0; waveCountdown = 0;" +
            "waveElapsed = 0; waveOnClockIndex = -1;" +
            "enemies.length = 0; bullets.length = 0;");
      var window = g.game.WAVES[w].duration || 40;
      var steps = Math.round(window / step);
      for (var i = 0; i < steps; i++) g.game.updateWaves(step);
      out.push(g.run("enemies.map(function (e) { return (e.typeId || 'normal')" +
                     " + ':' + Math.round(e.maxHealth) + ':' + e.waveId;" +
                     "}).join('|')"));
    }
    return out.join("\n");
  }

  var perFrame = deployWholeSchedule(1 / 60);
  var perThreeSeconds = deployWholeSchedule(3);
  t.eq(perFrame.split(/[\n|]/).length, 830,
    "the campaign deploys its 830 authored bodies");
  t.eq(perThreeSeconds, perFrame,
    "and deploys exactly the same ones, in the same order, at any step size");
});

// THE OTHER HALF, AND THE HALF THAT WAS MISSING. The test above deploys each
// wave IN ISOLATION -- the cursor is moved by assignment and no gate ever fires
// -- so it proves the emission is step-size independent and says nothing at all
// about the two clocks that sit either side of it. Both were wrong, and both
// were wrong in a way that only a run on the real clock can see (2026-08-25):
//
//   THE CEILING closed one frame late on all 34 waves at the shipping step,
//   because `waveElapsed >= duration` had no float tolerance while the emission
//   beside it carries SPAWN_EPSILON. 1/60 does not sum exactly: 1920 of them
//   reach 31.999999999999464, which is short of wave 1's 32 by half a
//   picosecond, so the wave ran to step 1921.
//
//   THE OVERSHOOT was discarded. The frame that crosses the ceiling crosses it
//   by some fraction of dt, and endWave() threw that fraction away and started
//   the transition at its full length -- 0.217 s lost over thirteen ceilings at
//   1/60 against 0.007 s at 1 ms, which is a campaign clock that runs a fifth of
//   a second longer depending on the frame rate.
//
// Both are measured here on the REAL update(), gates included, with no towers on
// the board so the ceiling is the only gate that can fire.
test("the wave clock and its transition are the same length at any step size",
function (t) {
  function drive(step, stop, capSeconds) {
    var h = harness.boot();
    var elapsed = 0, taken = 0, cap = Math.ceil(capSeconds / step);
    while (!stop(h.game) && taken < cap) {
      h.game.update(step);
      elapsed += step;
      taken++;
    }
    return { seconds: elapsed, steps: taken, reached: stop(h.game) };
  }
  function pastWaveOne(g) { return g.waveIndex > 0; }
  function waveTwoRunning(g) { return g.waveIndex === 1 && g.waveCountdown === 0; }

  var limit = harness.boot().game.WAVES[0].duration;
  t.eq(limit, 32, "wave 1's ceiling is 32 s");

  // THE NOMINAL STEP COUNT, not one more. ceil(32/step) is the first step whose
  // running total reaches the ceiling in exact arithmetic; anything above it is
  // float dust being read as time.
  [1 / 60, 1 / 30, 0.005].forEach(function (step) {
    var r = drive(step, pastWaveOne, 60);
    t.eq(r.steps, Math.ceil(limit / step),
      "at dt=" + step.toFixed(5) + " the ceiling closes on step " +
      Math.ceil(limit / step) + ", not later (" + r.steps + ")");
  });

  // AND THE TRANSITION IS CHARGED FOR WHAT IT ACTUALLY SPENT.
  //
  // THE STEP SIZES HERE DELIBERATELY DO NOT DIVIDE THE DURATIONS. That is the
  // whole test: 1/60, 1/30, 0.005 and 0.001 all divide 32 exactly, so the
  // crossing frame lands dead on the ceiling, the overshoot is zero, and a
  // version that throws the overshoot away passes. This was written that way
  // once and proved nothing -- the mutation that drops the handover survived it.
  // 0.03 and 0.07 divide none of the first five durations, so every ceiling
  // overshoots and the loss accumulates.
  //
  // Measured to wave 5, five ceilings and five transitions in, because one
  // ceiling's overshoot is smaller than one step and hides inside the tolerance.
  function waveFiveRunning(g) { return g.waveIndex === 4 && g.waveCountdown === 0; }
  var STEPS = [1 / 60, 0.03, 0.07];
  var starts = STEPS.map(function (step) {
    return drive(step, waveFiveRunning, 400).seconds;
  });
  var spread = Math.max.apply(null, starts) - Math.min.apply(null, starts);

  // 32 + 34 + 30 + 36 + four 5 s transitions = 152 s, and that is a CEILING
  // rather than an expectation: nothing is shooting here, so every body walks
  // the whole road and leaks, and a wave whose last body leaks before its
  // duration is up closes on gate 1 instead. Gate 1 can only ever be earlier.
  // Anchored as a band rather than a number so that retuning a duration moves
  // the test with the data instead of turning it into a stale fixture.
  var ceilingPath = 32 + 34 + 30 + 36 + 4 * 5;
  t.ok(starts[0] > 100 && starts[0] <= ceilingPath + 0.05,
    "wave 5 opens inside the all-ceilings bound of " + ceilingPath + " s at 60 fps (" +
    starts[0].toFixed(4) + ")");
  t.ok(spread <= 0.07 + 1e-9,
    "and within one step of that at step sizes that divide nothing (spread " +
    spread.toFixed(6) + " s)");
});

// AUTO-SEND'S THREE SECONDS ARE THREE SECONDS. It was charged dt the instant it
// fired, because skipNextWave() is called at the TOP of updateWaves() and the
// countdown it opens was decremented by the same frame's `waveCountdown -= dt`
// -- so a 3 s call came out at 2.9 s at dt = 0.1 while the player's identical
// Send, arriving at the same function from a click, got its full three. Gates 1
// and 2 never had it: they are evaluated BELOW the countdown block.
test("auto-send opens a full three-second transition at any step size",
function (t) {
  function gapAt(step) {
    var h = harness.boot();
    h.run("autoSkipWaves = true");
    var index = h.game.waveIndex, taken = 0, cap = Math.ceil(120 / step);
    var opened = null, elapsed = 0;
    while (taken < cap) {
      h.game.update(step);
      elapsed += step;
      taken++;
      if (opened === null && h.game.waveIndex !== index) opened = elapsed;
      else if (opened !== null && h.game.waveCountdown <= 0) break;
    }
    return opened === null ? null : elapsed - opened;
  }
  // ASSERTED AS A FLOOR, NOT AS A DISTANCE. `Math.abs(gap - 3) <= step` is the
  // obvious form and it is useless here: the bug made the transition 2.9 s at
  // dt = 0.1, and 0.1 is exactly one step, so the symmetric tolerance called a
  // stolen frame a rounding difference and passed. A transition may only ever
  // OVERRUN, by at most the step that discovers it has expired -- it may never
  // come out short, because short means a frame was spent before the countdown
  // was ever handed one.
  [1 / 60, 0.05, 0.1].forEach(function (step) {
    var gap = gapAt(step);
    t.ok(gap !== null, "auto-send fired at dt=" + step);
    t.ok(gap !== null && gap >= 3 - 1e-9,
      "and its transition is never short of 3 s at dt=" + step + " (" +
      (gap === null ? "n/a" : gap.toFixed(6)) + ")");
    t.ok(gap !== null && gap <= 3 + step + 1e-9,
      "nor longer than 3 s plus one step at dt=" + step);
  });
});

// THE RUN, WAVE BY WAVE, ON THE REAL CLOCK. Replaced "wave 1 deploys five
// enemies, then wave 2 waits out the ninety-second break" on 2026-08-25: there
// is no ninety-second break to wait out any more. A wave now owns a WINDOW --
// its own `duration` -- and the gap after it is five seconds, so what this
// walks is start, deploy, run out the ceiling, five seconds, next wave.
test("a wave deploys on its own clock and its ceiling hands over to the next",
function (t) {
  var h = harness.boot();
  var w1 = h.game.WAVES[0];
  t.eq(h.game.enemies.length, 1, "first enemy spawns immediately");
  t.eq(h.game.enemies[0].health, 4, "wave 1 health -- a stock normal");
  t.eq(w1.duration, 32, "wave 1's window is 32 s");

  // Five bodies at 0.8 s: out by 3.2 s, which is a tenth of the window. THE
  // WAVE IS NOT OVER. That is the change in one assertion -- deployment and the
  // wave are two different lengths of time now.
  h.step(3.2);
  t.eq(h.game.enemies.length, 5, "wave 1 enemy count");
  t.ok(h.run("waveFullyDeployed()"), "and every one of them is out");
  t.eq(h.game.waveIndex, 0, "but wave 1 is still the wave in play");
  t.ok(h.game.waveCountdown <= 0, "with no transition running");
  t.near(h.game.waveElapsed, 3.2, 0.05, "and 3.2 s on its own clock");

  // One body that will never leave, so the wave cannot be closed by being
  // beaten and the CEILING is what closes it. `rooted` is the same flag a
  // revived Revenant sets, so this is a shape the shipping game produces.
  h.game.enemies[0].rooted = true;

  h.step(w1.duration - 3.3);
  t.eq(h.game.waveIndex, 0, "nothing hands over a tenth short of the ceiling");
  h.step(0.2);
  t.eq(h.game.waveIndex, 1, "the ceiling expires and wave 2 is next");
  t.eq(h.game.waveSpawned, 0, "which has not started");
  t.near(h.game.waveCountdown, 5, 0.2, "five seconds out");
  t.ok(h.run("enemies.filter(function (e) { return e.waveId === 1; }).length") > 0,
    "and wave 1's survivors are still walking through the transition");

  h.step(5.1);
  t.ok(h.game.waveSpawned > 0, "wave 2 begins when the five are up");
  t.notOk(h.game.betweenWaves(), "and the transition is over");

  // A ROAD THAT GOES EMPTY MID-WAVE IS NOT A FINISHED WAVE. Wave 2 is 4 + 4
  // with a 4.5 s gap between the salvos; kill the first four inside that gap
  // and the road holds nothing of wave 2 at all -- and wave 2 is still running,
  // because the second salvo has not been emitted yet. Under a board-empty test
  // this paid out and rolled on after four bodies.
  h.step(1.2);
  h.run("enemies.forEach(function (e) { if (e.waveId === 2) e.dead = true; })");
  h.step(1 / 60);
  t.eq(h.run("enemies.filter(function (e) { return e.waveId === 2; }).length"), 0,
    "nothing of wave 2 is on the road");
  t.eq(h.game.waveIndex, 1, "and wave 2 is still the wave in play");
  t.notOk(h.run("waveFullyDeployed()"), "because its second salvo has not arrived");

  h.step(3.5);
  t.ok(h.run("enemies.filter(function (e) { return e.waveId === 2; }).length") > 0,
    "the second salvo walks in on its own `at`, as the data said it would");
});

// GATE 3, THE PLAYER'S. Pressing Send once the wave is out ENDS THAT WAVE --
// survivors and all -- and puts the next one three seconds away.
//
// It changed shape on 2026-08-25 and the change is the point: the button used
// to shorten a BREAK, and there was no break until the wave was over anyway, so
// pressing it could never do anything a patient player would not have got. Now
// it ends a wave that could have run for another fifty seconds, with things
// still walking, which is a real decision.
test("the player can send the next wave once this one is out, and it takes three seconds", function (t) {
  var h = harness.boot();

  h.step(3.2);
  t.ok(h.run("waveFullyDeployed()"), "wave 1 is fully deployed");
  t.eq(h.game.waveIndex, 0, "and still the wave in play -- 29 s of its window left");
  t.notOk(h.game.betweenWaves(), "so there is no transition running");
  t.ok(h.run("waveSendAvailable()"), "but the button is live");
  h.game.enemies[0].rooted = true;         // survivors must not stop any of this

  var r = h.run("waveSkipButtonRect()");
  h.click(r.x + r.w / 2, r.y + r.h / 2);

  t.eq(h.game.waveIndex, 1, "the click ended wave 1 on the spot");
  t.near(h.game.waveCountdown, 3, 0.01, "with wave 2 three seconds out");
  t.eq(h.run("enemies.filter(function (e) { return e.waveId === 1; }).length"), 5,
    "and all five of wave 1 kept walking -- Send never clears the road");

  h.step(2.9);
  t.eq(h.game.waveSpawned, 0, "not on the next step -- there is a three second call");
  t.ok(h.game.betweenWaves(), "still in the transition");
  h.step(0.2);
  t.eq(h.game.waveSpawned, 1, "and wave 2 arrives on the three second mark");
  t.notOk(h.game.betweenWaves(), "now the transition is over");

  // AND IT IS DEAD WHILE A WAVE IS STILL ARRIVING. This is the rule with teeth:
  // a Send that worked mid-deployment would let a player delete the tail of a
  // wave they did not like the look of.
  var deployed = h.game.waveSpawned;
  t.notOk(h.run("waveSendAvailable()"), "the button is gone while wave 2 deploys");
  t.notOk(h.run("skipNextWave()"), "and the call is refused");
  t.eq(h.game.waveSpawned, deployed, "so nothing extra was spawned");
  t.eq(h.game.waveIndex, 1, "and wave 2 was not skipped past");
});

test("a call with less than three seconds left never pushes the wave away", function (t) {
  var h = harness.boot();
  h.step(3.2);
  h.game.enemies[0].rooted = true;

  // Into a transition first -- the rule is about a countdown that is already
  // running, which is the only state a call can lengthen.
  h.run("skipNextWave()");
  t.ok(h.game.betweenWaves(), "wave 1 is closed and wave 2 is on the clock");

  h.run("waveCountdown = 1.5");
  t.ok(h.run("skipNextWave()"), "the call is accepted");
  t.eq(h.game.waveCountdown, 1.5, "and the countdown is untouched");
});

// The one wave with no break after it. Only the board-clear route can reach it,
// which is exactly right -- the last bounty is paid for actually finishing.
test("the last wave's bonus is paid for clearing the board", function (t) {
  var h = harness.boot();
  var last = h.game.WAVES[h.game.WAVES.length - 1];

  h.run("waveIndex = WAVES.length - 1; waveSpawned = 0; waveCountdown = 0");
  h.run("enemies = []; bullets = []; baseHp = 1000000");

  // Run until the final wave has fully deployed.
  for (var i = 0; i < 120 * 60 && !h.game.allWavesDeployed; i++) h.step(1 / 60);
  t.ok(h.game.allWavesDeployed, "the last wave deployed");
  t.eq(h.game.pendingBounty, h.game.waveReward(last, 35), "its bonus is owed");

  // KILLING EVERYTHING ON THE BOARD IS NO LONGER ONE SWEEP, and the last wave
  // is the reason: since the tier ladder was scheduled (2026-08-20) wave 35
  // ends on a T5 Fractal Slime, so a sweep that kills every body standing
  // leaves four T4s where the T5 was. Six sweeps empty it; the loop runs until
  // the board is actually clear rather than counting them, so a retune of the
  // tier cannot quietly turn this into a test of a half-cleared board.
  //
  // `noBounty` is set on every body each pass and INHERITED by the children
  // (Enemy.prototype.splitOnDeath passes it down), so the cascade still pays
  // nothing and the sum below is the clear bonus alone.
  var before = h.game.cash;
  for (var sweep = 0; sweep < 20 && h.game.enemies.length; sweep++) {
    h.run("enemies.forEach(function (e) { e.noBounty = true; e.dead = true; })");
    h.step(1 / 60);
  }
  t.eq(h.game.enemies.length, 0, "the board is empty, cascade and all");
  t.eq(Math.round(h.game.cash - before), h.game.waveReward(last, 35),
    "and clearing the board pays it, with no next wave to call in");
  t.eq(h.game.victory, true, "which is also the win");
});

// GATE 1, AND THE ONE THE OWNER ASKED FOR BY NAME: kill the wave and the next
// one is five seconds out. Killing a wave fast is rewarded with pressure rather
// than with idle time -- and since the timeline rewrite the reward is much
// bigger, because what is skipped is the REST OF THE WAVE'S WINDOW rather than
// a break that was going to be cut short anyway. Wave 1 beaten at 3.3 s hands
// over at 8.3 s instead of at 37.
test("wiping out a wave ends it, five seconds before the next", function (t) {
  var h = harness.boot();

  h.step(3.2);
  t.ok(h.run("waveFullyDeployed()"), "wave 1 is fully deployed");
  t.eq(h.game.waveIndex, 0, "and still running: 29 s of its window left");
  t.ok(h.game.waveCountdown <= 0, "with no transition on the clock");

  // Everything from wave 1 dies -- however it happened, none of it is left.
  h.run("enemies.forEach(function (e) { e.dead = true; })");
  h.step(1 / 60);
  t.eq(h.game.enemies.length, 0, "the road is clear");
  t.eq(h.game.waveIndex, 1, "wave 1 is closed and wave 2 is next");
  t.ok(h.game.waveCountdown <= 5, "five seconds out (" +
    h.game.waveCountdown.toFixed(2) + ")");
  t.ok(h.game.waveCountdown > 3, "which is longer than a CLICKED call, on purpose");

  h.step(5.1);
  t.eq(h.game.waveSpawned > 0, true, "wave 2 walks in");
});

// A FRAME IS NOT A UNIT OF THE SCHEDULE. Every gate and every spawn is decided
// against a clock, so time that arrives in an awkward lump must land in the same
// place as time that arrives evenly -- otherwise the schedule is one schedule at
// 1x and a different one at 3x or after a stall.
test("a long frame loses no time on either side of a transition", function (t) {
  var h = harness.boot();

  // End wave 1 with 5 s on the clock, then hand the scheduler a single step
  // that covers the transition AND 2 s of wave 2. The 2 s must show up on wave
  // 2's clock: a scheduler that zeroed the leftover would start every wave up
  // to a frame late, forever, and at 3x a frame is 50 ms.
  h.step(3.2);
  h.run("enemies.forEach(function (e) { e.dead = true; })");
  h.step(1 / 60);
  t.eq(h.game.waveIndex, 1, "wave 2 is next");
  t.near(h.game.waveCountdown, 5, 0.05, "five seconds out");

  h.game.updateWaves(7);
  t.eq(h.game.waveIndex, 1, "wave 2 is the wave in play");
  t.ok(h.game.waveCountdown <= 0, "with no transition left");
  t.near(h.game.waveElapsed, 2, 0.05,
    "and two seconds on ITS clock, not zero (" + h.game.waveElapsed + ")");

  // Wave 2 is 4 at 1.0 s from the gate and 4 more at 0.65 s from 4.5 s. Two
  // seconds in is three of the first salvo, which is what a hundred and twenty
  // small steps would also have produced.
  t.eq(h.game.waveSpawned, 3, "three bodies out, exactly as the data says");
});

// AUTO-SEND IS GATE 3 WITH NOBODY PRESSING IT, and the rule it must obey is the
// one that makes it a pacing control rather than a difficulty cut: it may end a
// wave that has finished ARRIVING and it may never touch a wave that is still
// arriving.
test("auto-send ends a deployed wave three seconds out, and never sooner", function (t) {
  var h = harness.boot();
  h.run("autoSkipWaves = true");

  // Wave 1 is five bodies at 0.8 s. Half way through the deployment auto-send
  // has had 90 chances to fire and must have done nothing at all.
  h.step(1.6);
  t.eq(h.game.waveIndex, 0, "wave 1 is still the wave in play");
  t.ok(h.game.waveSpawned >= 2 && h.game.waveSpawned <= 3,
    "two or three bodies out, on the wave's own interval (" +
    h.game.waveSpawned + ")");
  t.ok(h.game.waveCountdown <= 0, "and nothing has been called in behind it");

  // Every body out -> closed at once, three seconds to wave 2. Counted off the
  // ROAD rather than off `waveSpawned`, because the cursor is reset by the
  // close and the claim is about bodies, not about a counter.
  h.step(1.7);
  t.eq(h.run("enemies.filter(function (e) { return e.waveId === 1; }).length"), 5,
    "all five bodies deployed -- auto-send skipped none of them");
  t.eq(h.game.waveIndex, 1, "and auto-send closed the wave at once");
  t.ok(h.game.waveCountdown > 2.5 && h.game.waveCountdown <= 3,
    "three seconds out, not five (" + h.game.waveCountdown.toFixed(2) + ")");

  // The interval INSIDE the wave is untouched: wave 2's four opening Normals
  // are one a second and auto-send has no business making that four at once.
  h.step(3.1);
  t.eq(h.game.waveSpawned, 1, "wave 2 opens with one body, not with all of it");
  h.step(1.05);
  t.eq(h.game.waveSpawned, 2, "the second arrives a second later, as authored");
});

// THE REWARD IS OWED BY A WAVE, NOT BY A MOMENT. Written 2026-08-25 after
// driving the sandbox's own idiom: it restarts a run onto the SAME wave by
// hand -- `waveSpawned = 0; waveCountdown = 0` with the index untouched -- and
// under a latch reset only when the index moved, the re-run wave deployed
// perfectly and never owed its bounty. A wave that has put nothing on the road
// has by definition nothing to have been paid for.
test("a wave re-run from the top owes its reward again", function (t) {
  var h = harness.boot();
  var owed = h.game.waveReward(h.game.WAVES[0], 1);

  h.step(4);
  t.eq(h.game.pendingBounty, owed, "wave 1 deployed and owes its reward");

  h.run("enemies.length = 0; bullets.length = 0;" +
        "waveIndex = 0; waveSpawned = 0; waveElapsed = 0; waveCountdown = 0;" +
        "pendingBounty = 0; pendingBountyWave = 0;");
  h.step(4);
  t.eq(h.game.enemies.length, 5, "it deploys again from the top");
  t.eq(h.game.pendingBounty, owed, "and owes its reward again");
  t.eq(h.game.pendingBountyWave, 1, "for wave 1");
});

// THE FINALE. No ceiling, no Send, no wave 36 -- the run ends when wave 35 has
// finished arriving and the whole road, cascade and all, is empty.
test("the final wave has no ceiling and no Send, and the run ends on an empty road",
function (t) {
  var h = harness.boot();
  var last = h.game.WAVES.length - 1;

  h.run("waveIndex = " + last + "; waveSpawned = 0; waveCountdown = 0;" +
        "waveElapsed = 0; enemies = []; bullets = []; baseHp = 1000000;");
  h.step(1);

  t.eq(h.game.WAVES[last].duration, undefined, "wave 35 authors no ceiling");
  t.eq(h.run("waveTimeRemaining()"), null, "so there is no time remaining to show");
  t.notOk(h.run("waveSendAvailable()"), "and no Send while it deploys");

  // Run it out. Nothing may hand over to a wave 36.
  for (var i = 0; i < 120 * 60 && !h.game.allWavesDeployed; i++) h.step(1 / 60);
  t.ok(h.game.allWavesDeployed, "wave 35 finished arriving");
  t.notOk(h.run("waveSendAvailable()"), "still no Send once it is out");
  t.eq(h.game.waveCountdown, 0, "and no countdown to anything");
  t.notOk(h.game.betweenWaves(), "there is no transition, because there is no next wave");
  t.eq(h.game.victory, false, "and no win while the road is busy");

  // Six sweeps to unwind the T5 cascade; the loop runs until the road is
  // actually clear rather than counting them.
  for (var sweep = 0; sweep < 20 && h.game.enemies.length; sweep++) {
    h.run("enemies.forEach(function (e) { e.noBounty = true; e.dead = true; })");
    h.step(1 / 60);
  }
  t.eq(h.game.enemies.length, 0, "the road empties, cascade and all");
  t.eq(h.game.victory, true, "and that is the win");
});

// THE TWO ARRIVALS THE FINALE IS BUILT AROUND, ON THE CLOCK.
//
// Wave 35 authors its Tyrant at `at: 13` and its T5 Fractal Slime at `at: 28`,
// and both numbers exist because of what is on the road in front of them: the
// boss walks in behind thirty Normals and six Wisps, and the T5 -- 1024 HP that
// becomes 1364 more bodies on the way down -- lands last, alone.
//
// Under the sequential scheduler neither number was authored at all. The boss
// arrived when the four groups in front of it had finished emitting, which is a
// number nobody could read off the file and which moved whenever any earlier
// group was retuned. This test is the one that would have been impossible to
// write before, and it is worth writing because "the boss comes late" is the
// single most load-bearing pacing fact in the campaign.
//
// The elapsed time is accumulated HERE rather than read from `waveElapsed`,
// which is deliberate: the last wave's cursor is retired the instant its final
// body is emitted (see emitDueSpawns), and that resets the wave clock to zero
// on the very frame the T5 appears.
// 2026-08-29: the seventh group was a T5 Fractal Slime until the ladder came
// off the campaign. It is a 1024 HP Colossus now -- the same 1024 points at the
// same 28 s, which is the whole substitution rule -- so this test keeps its
// shape and changes its subject. What it is FOR is unchanged: the finale's two
// late arrivals land where they are authored to, in the order they are authored
// in, and the last thing the campaign ever sends is the one behind the boss.
test("wave 35's Tyrant walks in at thirteen seconds and its Colossus at twenty-eight",
function (t) {
  var h = harness.boot();
  var last = h.game.WAVES[34];

  t.eq(h.game.waveGroups(last)[3].type, "boss", "the fourth group is the Tyrant");
  t.eq(h.game.waveGroups(last)[3].at, 13, "authored at 13.00 s");
  t.eq(h.game.waveGroups(last)[6].type, "colossus", "the seventh is the Colossus");
  t.eq(h.game.waveGroups(last)[6].health, 1024,
    "at the 1024 HP it inherited from the T5 root it replaced");
  t.eq(h.game.waveGroups(last)[6].tier, undefined, "and carries no tier of its own");
  t.eq(h.game.waveGroups(last)[6].at, 28, "authored at 28.00 s");

  h.run("waveIndex = 34; waveSpawned = 0; waveCountdown = 0; waveElapsed = 0;" +
        "waveOnClockIndex = -1; enemies.length = 0; bullets.length = 0;" +
        "baseHp = 1000000;");

  var elapsed = 0;
  var bossAt = null, tankAt = null, bossBody = null, tankBody = null;
  for (var i = 0; i < 60 * 40; i++) {
    h.game.updateWaves(1 / 60);
    elapsed += 1 / 60;
    h.game.enemies.forEach(function (e) {
      if (e.typeId === "boss" && bossAt === null) { bossAt = elapsed; bossBody = e; }
      if (e.typeId === "colossus" && tankAt === null) { tankAt = elapsed; tankBody = e; }
    });
  }

  t.ok(bossAt !== null, "the Tyrant reached the road");
  t.near(bossAt, 13, 0.03, "thirteen seconds in (" + Number(bossAt).toFixed(2) + ")");
  t.ok(tankAt !== null, "and so did the Colossus");
  t.near(tankAt, 28, 0.03, "twenty-eight seconds in (" + Number(tankAt).toFixed(2) + ")");
  t.ok(tankAt > bossAt, "it is the last thing the campaign sends");

  // THE BODIES ARE THE DECLARED ONES, not just something wearing the type. The
  // health is the half that carries the substitution: a stock Colossus is 550,
  // and 1024 is what makes this the body the T5 root used to be.
  t.eq(bossBody.maxHealth, h.game.Enemy.TYPES.boss.health, "the Tyrant at its type's health");
  t.eq(bossBody.waveId, 35, "carrying wave 35");
  t.eq(tankBody.maxHealth, 1024, "the Colossus at 1024 HP, not its stock 550");
  t.eq(tankBody.waveId, 35, "and it too carries wave 35");

  // Nothing of either arrived early. A group that leaked one body onto an
  // earlier frame would still pass every count in the suite.
  t.eq(h.game.enemies.filter(function (e) { return e.typeId === "boss"; }).length, 1,
    "exactly one Tyrant");
  t.eq(h.game.enemies.filter(function (e) { return e.typeId === "colossus"; }).length, 1,
    "and exactly one Colossus");
  t.eq(h.game.waveCount(last), 49, "wave 35 is 49 bodies");
  t.eq(h.game.enemies.length, 49, "and all 49 are on the road by 40 s");
});

// THE OPENING PAUSE IS NOT PART OF WAVE 1. Ten seconds of empty road before the
// run starts, and wave 1's own 32 s window begins after them -- so a player who
// spends the pause placing a tower has not spent a third of wave 1 doing it.
test("the ten-second opening pause sits outside wave 1's own clock", function (t) {
  var h = harness.boot(null);
  h.chooseMap(h.game.Maps.DEFAULT_ID);

  t.eq(Math.round(h.game.waveCountdown), 10, "wave 1 is ten seconds out");
  h.step(9.5);
  t.eq(h.game.waveElapsed, 0, "nine and a half seconds in, wave 1's clock is at zero");
  t.eq(h.game.enemies.length, 0, "and nothing is on the road");

  h.step(0.6);
  t.ok(h.game.enemies.length > 0, "wave 1 walks in");
  t.ok(h.game.waveElapsed < 0.2,
    "with its clock starting there, not ten seconds in (" +
    h.game.waveElapsed.toFixed(2) + ")");
  t.near(h.run("waveTimeRemaining()"), 32, 0.2,
    "so it has its whole 32 s window in front of it");
});

// WHERE THE WAVE'S CLOCK STARTS, AND -- the half that actually changed -- WHERE
// IT DOES NOT.
//
// Under the sequential scheduler there was no wave clock at all. A wave ended
// when its LAST BODY was emitted, and the ninety seconds that followed were the
// break, so every timer in the game was anchored to the end of a deployment.
// `duration` is anchored to the OPENING of the wave instead, which is what lets
// a wave be a window the player is inside rather than a queue they are waiting
// out.
//
// Wave 1 makes the difference a number: five bodies, out at 3.2 s, against a
// 32 s ceiling. Anchored to the opening it expires at 32.0 s. Anchored to the
// last spawn -- the old anchor -- it would expire at 35.2 s. Three point two
// seconds is a small gap, and that is exactly why it is measured rather than
// eyeballed: it is the size that hides inside a generous tolerance.
test("a wave's clock starts when the wave opens, never when it finishes arriving",
function (t) {
  var h = harness.boot();
  t.eq(h.game.WAVES[0].duration, 32, "wave 1's ceiling is 32 s");

  // Nothing may die or leak, or gate 1 closes the wave before the clock can.
  // `rooted` is the flag a revived Revenant sets, so this is a shape the
  // shipping game produces.
  h.step(3.2);
  t.ok(h.run("waveFullyDeployed()"), "every body is out at 3.2 s");
  h.run("enemies.forEach(function (e) { e.rooted = true; })");
  t.near(h.game.waveElapsed, 3.2, 0.02,
    "and the wave's clock reads 3.2 s -- deploying did not restart it");

  // Run to the handover on an independent clock, so the number below is
  // seconds since the wave opened rather than something read back off the
  // state being tested.
  var since = 3.2;
  for (var i = 0; i < 60 * 60 && h.game.waveIndex === 0; i++) {
    h.step(1 / 60);
    since += 1 / 60;
  }
  t.eq(h.game.waveIndex, 1, "the ceiling fired");
  t.near(since, 32, 0.05,
    "32 s after the wave OPENED (" + since.toFixed(2) + " s)");
  t.ok(since < 35, "and nowhere near the 35.2 s the old anchor would have given");
  t.eq(h.run("enemies.filter(function (e) { return e.waveId === 1; }).length"), 5,
    "with all five survivors kept -- an expiry ends the wave, not the road");

  // --- and where the clock starts relative to the FIRST BODY ---------------
  //
  // For thirty-four of the thirty-five waves these are the same instant: the
  // first group is authored at `at: 0`, so the wave opens and its first body
  // lands on the same frame. Wave 11 is the single exception and is authored
  // that way -- the Midboss is at `at: 4`, and its 60 s window covers the four
  // seconds of empty road in front of it.
  //
  // THIS IS AN ARBITRATION AND IT IS WRITTEN DOWN HERE RATHER THAN ASSUMED.
  // The requirement was phrased "the timer starts at the first spawn"; what
  // shipped is that `at` and `duration` share ONE origin, the wave's opening,
  // because measuring the ceiling from the first emitted body would give a
  // single wave two origins. Wave 11 is the only wave where the two readings
  // differ, and it differs by four seconds. If the other reading was meant,
  // this is the test that says so.
  var late = [];
  h.game.WAVES.forEach(function (wave, i) {
    if (h.game.waveGroups(wave)[0].at !== 0) late.push(i + 1);
  });
  t.deep(late, [11],
    "wave 11 alone opens on an empty road; every other wave's first body is at 0.00 s");

  var g = harness.boot();
  g.run("waveIndex = 10; waveSpawned = 0; waveCountdown = 0; waveElapsed = 0;" +
        "waveOnClockIndex = -1; enemies.length = 0; bullets.length = 0;");
  var atFirstBody = null;
  for (var j = 0; j < 60 * 8 && atFirstBody === null; j++) {
    g.game.updateWaves(1 / 60);
    if (g.game.enemies.length > 0) atFirstBody = g.game.waveElapsed;
  }
  t.near(atFirstBody, 4, 0.02,
    "wave 11's Midboss arrives four seconds into its own window");
  t.near(g.run("waveTimeRemaining()"), 56, 0.05,
    "with 56 s of the 60 left, because the window opened without it");
});

// THE SCHEDULE IS CHECKED AGAINST ITSELF, IN THE SHIPPING CODE, AT LOAD.
//
// The mistake this catches is silent and expensive: a `duration` at or below a
// wave's last spawn ends the wave before its tail is emitted. Nothing throws,
// the road looks busy, the wave still SAYS 88 bodies and still pays for 88, and
// the only symptom is that the campaign's stated 830 bodies are not the ones
// that walked.
test("a wave whose ceiling falls before its own tail is rejected", function (t) {
  var h = harness.boot();

  t.deep(h.game.validateWaveTimelines(h.game.WAVES), [],
    "the shipping schedule is deployable");

  // Last spawn at 0 + 4 * 1 = 4.0 s.
  var tooShort = [{ duration: 4, groups: [{ at: 0, count: 5, interval: 1 }] }];
  t.eq(h.game.validateWaveTimelines(tooShort).length, 1,
    "a ceiling AT the last spawn is refused -- strictly greater, not >=");
  t.eq(h.game.validateWaveTimelines(
    [{ duration: 4.01, groups: [{ at: 0, count: 5, interval: 1 }] }]).length, 0,
    "a hundredth of a second past it is accepted");

  // An absent ceiling is legal for the LAST wave only. Wave 35 has none
  // because there is no wave 36 to be pushed towards; an earlier wave without
  // one would hang the campaign on whatever happened to still be walking.
  t.eq(h.game.validateWaveTimelines(
    [{ groups: [{ at: 0, count: 1, interval: 1 }] }]).length, 0,
    "the last wave may run without a ceiling");
  t.eq(h.game.validateWaveTimelines([
    { groups: [{ at: 0, count: 1, interval: 1 }] },
    { duration: 9, groups: [{ at: 0, count: 1, interval: 1 }] }
  ]).length, 1, "an earlier one may not");

  // A group that starts late is measured from its own `at`, not from zero --
  // wave 11's Midboss is authored at `at: 4` and its 60 s covers the lead-in.
  t.eq(h.game.validateWaveTimelines(
    [{ duration: 5, groups: [{ at: 4, count: 3, interval: 1 }] }]).length, 1,
    "a late group's tail counts too (4 + 2 = 6 s against a 5 s ceiling)");
});

// Auto-send: the same skip, without the click. Added 2026-07-29.
test("auto-send calls every wave in with no input at all", function (t) {
  var h = harness.boot();
  var r = h.run("autoSkipButtonRect()");

  t.eq(h.game.autoSkipWaves, false, "off to begin with");
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.autoSkipWaves, true, "the corner toggle turns it on");

  // Wave 1 finishes at 3.2 s. With a 90 s break and nobody clicking anything,
  // wave 2 would still be 87 s away; with auto-send it is called in at once
  // and arrives three seconds later, at about 6.2 s.
  h.step(3.5);
  t.eq(h.game.waveSpawned, 0, "the call is placed, not the wave");
  h.step(3);
  t.eq(h.game.waveIndex, 1, "wave 2 is the current wave");
  t.ok(h.game.waveSpawned > 0, "and it started without a click");

  // And it keeps going, wave after wave, unattended.
  h.step(40);
  t.ok(h.game.waveIndex >= 4, "several more waves have come and gone (" +
    h.game.waveIndex + ")");
});

// The toggle is drawn for the whole run, not just during breaks, and that is
// load-bearing rather than cosmetic: with auto-send ON a break lasts three
// seconds, so a toggle that only appeared during breaks would be a control the
// player had three seconds at a time to find.
test("auto-send can still be switched off once it is on", function (t) {
  var h = harness.boot();
  var r = h.run("autoSkipButtonRect()");

  h.click(r.x + r.w / 2, r.y + r.h / 2);
  h.step(7);
  t.eq(h.game.autoSkipWaves, true, "on, and waves are flowing");
  t.notOk(h.game.betweenWaves(), "with no break on screen to click through");

  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.autoSkipWaves, false, "the toggle is still reachable, and off");

  // ONCE OFF, THE WAVE GETS ITS WINDOW BACK. That is what auto-send was taking
  // away: with it on, every wave is closed the instant its last body is out and
  // the next is three seconds behind. With it off, a fully deployed wave stays
  // in play for the rest of its `duration` and nothing arrives unasked.
  //
  // Rewritten 2026-08-25. It used to run to the next break and sit in it for
  // twenty seconds, which was the same claim while the gap between waves was
  // ninety seconds of nothing. There is no such gap now, so the claim is made
  // where it actually lives -- on the wave's own clock.
  for (var i = 0; i < 60 * 60 && !h.run("waveFullyDeployed()"); i++) h.step(1 / 60);
  t.ok(h.run("waveFullyDeployed()"), "a wave has finished arriving");

  var wave = h.game.waveIndex;
  var left = h.run("waveTimeRemaining()");
  t.ok(left > 5, "with more than five seconds of its window left (" +
    left.toFixed(1) + ")");

  // Nothing dies and nothing leaks, so neither of the automatic gates can fire
  // and only the clock is left. `rooted` is the flag a revived Revenant sets.
  h.run("enemies.forEach(function (e) { e.rooted = true; })");
  h.step(5);
  t.eq(h.game.waveIndex, wave, "five seconds later it is still the wave in play");
  t.ok(h.game.waveCountdown <= 0, "with nothing called in behind it");
});

test("auto-send is a preference, not run state", function (t) {
  var h = harness.boot();
  h.run("autoSkipWaves = true");
  h.run("restartGame()");
  t.eq(h.game.autoSkipWaves, true, "still on after a restart");
});

// It ends breaks; it must never compress a wave's own spacing. Wave 2 is eight
// enemies at one a second, and auto-send has no business making that eight at
// once -- that would be rewriting the schedule rather than its pacing.
test("auto-send shortens the break, never the interval within a wave", function (t) {
  var h = harness.boot();
  h.run("autoSkipWaves = true");

  h.step(6.4);                       // wave 1 done at 3.2, wave 2 called in, arrives at 6.2
  t.eq(h.game.waveIndex, 1, "wave 2 is deploying");
  var justStarted = h.game.waveSpawned;
  t.ok(justStarted >= 1, "it has started (" + justStarted + ")");
  t.ok(justStarted <= 2, "only its first enemy or two so far (" + justStarted + ")");

  h.step(3);
  t.ok(h.game.waveSpawned - justStarted <= 4,
    "roughly one a second, not the whole wave at once");
});

// The button is drawn from the same waveSendAvailable() test that gates the
// click, so it cannot be clickable while invisible. The failure mode this rules
// out is the nastier direction: a live skip sitting over open ground all run,
// swallowing the click that was meant to place a tower there.
//
// RENAMED 2026-08-26, assertions untouched. It was "the skip button only exists
// during a break", which stopped being true on 2026-08-25: since the timeline
// rewrite the button is live for the whole tail of a wave that has finished
// arriving, and there is no such thing as a break to exist during. What the
// test always MEASURED is the moment it still measures -- a wave that is still
// arriving, where the button is down and its rectangle must be ordinary map.
// The wider sweep across every state lives in "while the button is down its
// rectangle is bare map, and builds".
test("the skip button does not exist while a wave is still arriving", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var r = h.run("waveSkipButtonRect()");

  t.notOk(h.run("waveSendAvailable()"),
    "wave 1 is still arriving, so the button is down");
  t.notOk(h.game.betweenWaves(), "and there is no transition running either");
  var before = h.game.towers.length;
  var placed = h.placeGunner(r.x + r.w / 2, r.y + r.h / 2);
  t.ok(placed !== null, "the ground under it builds normally");
  t.eq(h.game.towers.length, before + 1, "the click was not swallowed");
});

test("clearing every scheduled wave wins; the manual wave-off idiom does not", function (t) {
  var h = harness.boot();

  // The manual idiom first: tests and the sandbox disable spawning by setting
  // waveIndex past the end. That must never read as a win -- only the
  // scheduler naturally running dry may arm the victory check.
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []");
  h.step(1);
  t.eq(h.game.victory, false, "no victory from waveIndex arithmetic");

  // Now the real thing: play the whole schedule with a base too big to lose,
  // and let every enemy leak. 420 s clears the last spawn (~300 s) plus the
  // longest walk (~47 s) with room to spare.
  //
  // Waves are CALLED IN rather than waited out (2026-07-29). Thirty-two 90 s
  // breaks would add nearly fifty minutes of simulated empty road to a test
  // about whether the scheduler reaches its end, and none of those seconds
  // would be testing anything -- the skip is a real entry point, and this is
  // exactly what it is for.
  //
  // Bounded loop rather than a flat budget: a called wave now takes
  // WAVE_CALL_DELAY seconds to arrive rather than one frame, the schedule is
  // thirty-five waves, and a Hive crosses the reference route in ninety
  // seconds. Rather than re-deriving that arithmetic every time the schedule
  // moves, this runs until it wins and gives up after twenty simulated
  // minutes, which is far past any plausible schedule.
  h.run("restartGame(); baseHp = 100000");
  var openingCash = h.game.cash;
  for (var pass = 0; pass < 40 && !h.game.victory; pass++) h.stepCallingWaves(30);
  t.eq(h.game.enemies.length, 0, "the board is clear");
  t.eq(h.game.gameOver, false, "the oversized base survived");
  t.eq(h.game.victory, true, "natural exhaustion + clear board = victory");

  // EVERY WAVE WAS PAID EXACTLY ONCE, PROVEN BY ARITHMETIC RATHER THAN BY
  // WATCHING ONE WAVE (2026-08-25).
  //
  // Nothing was killed on this run -- every body leaked into an oversized base
  // -- and a leak pays nothing, so the only money that moved is the 35 clear
  // rewards. A wave paid twice, or a wave that slipped past a gate unpaid,
  // shows up here as a wrong total and nowhere else. Three gates can close a
  // wave and this run exercises two of them (Send, and the ceiling on the waves
  // whose stragglers outlive the call), which is exactly the shape a
  // double-payment would hide in.
  var owed = 0;
  h.game.WAVES.forEach(function (wave, i) {
    owed += h.game.waveReward(wave, i + 1);
  });
  t.eq(h.game.cash - openingCash, owed,
    "the run paid exactly the 35 clear rewards, no more and no less");
  t.eq(h.game.pendingBounty, 0, "with nothing left owed");

  // Victory freezes the run exactly the way a loss does.
  var cashBefore = h.game.cash;
  h.step(5);
  t.eq(h.game.cash, cashBefore, "simulation frozen after the win");
  h.draw();                                  // the victory overlay must draw

  // And the overlay's restart button starts a clean run.
  var r = resultRect(h, "restart");
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.victory, false, "restart clears the win");
  t.eq(h.game.enemies.length, 0, "the road is empty -- a run opens on a pause");
  t.eq(Math.round(h.game.waveCountdown), 10, "with wave 1 ten seconds out");
});

// THE WHOLE CAMPAIGN, UNATTENDED, WITH EVERY ARRIVAL COUNTED.
//
// The test above plays the campaign by CALLING every wave in, which is the fast
// route to the end and exercises gate 3. This one touches nothing at all: no
// Send, no auto-send, no click. Every one of the thirty-five waves has to close
// itself on gate 1 (wiped out) or gate 2 (its ceiling), and wave 35 has to run
// out and win on an empty road. About thirty-seven simulated minutes.
//
// WHAT IT COUNTS is the thing no other test in the suite can see. `emitWaveEvent`
// is the single door every scheduled body goes through, so wrapping it records
// the exact identity of every arrival -- (wave, group, body in group) -- for the
// whole run. Two failures hide from every count in this file and show up here:
//
//   * AN ARRIVAL EMITTED TWICE. The road holds one more body than it should for
//     a few seconds and then it leaks, and the totals tests all read the DATA
//     rather than the run, so 830 still reads as 830 everywhere.
//   * AN ARRIVAL DROPPED. A wave whose ceiling cut its own tail, or an overshoot
//     that was zeroed at a transition, loses bodies the schedule was paid for.
//     The wave still says 88 and still pays for 88.
//
// Started from the CHOOSER rather than from boot()'s shortcut, because the
// shortcut deploys wave 1's first body before a test can get a wrapper in
// front of it -- and a test that quietly counted 829 and expected 829 would be
// the exact shape of the bug it exists to find.
test("the whole campaign runs itself dry, with every authored arrival emitted once",
function (t) {
  var h = harness.boot(null);
  h.chooseMap(h.game.Maps.DEFAULT_ID);
  h.run("baseHp = 1000000");
  var openingCash = h.game.cash;
  t.eq(h.game.enemies.length, 0, "the run opens on an empty road");
  t.eq(h.game.autoSkipWaves, false, "with auto-send off");

  h.run("(function () {" +
        "  var real = emitWaveEvent;" +
        "  emittedArrivals = [];" +
        "  emitWaveEvent = function (ev) {" +
        "    emittedArrivals.push((waveIndex + 1) + ':' + ev.groupIndex + ':' + ev.bodyIndex);" +
        "    return real(ev);" +
        "  };" +
        "})()");

  // Bounded rather than a flat budget: a natural run is the sum of thirty-five
  // ceilings plus the walk, and re-deriving that arithmetic every time the
  // schedule moves is how a test becomes a maintenance tax. Sixty simulated
  // minutes is far past any plausible schedule.
  for (var i = 0; i < 60 * 60 * 60 && !h.game.victory; i++) h.step(1 / 60);
  t.eq(h.game.victory, true, "the campaign ends in a win with nobody touching it");
  t.eq(h.game.gameOver, false, "the oversized base survived");
  t.eq(h.game.enemies.length, 0, "on an empty road");
  t.eq(h.game.allWavesDeployed, true, "with the schedule exhausted");

  var emitted = h.run("emittedArrivals");
  t.eq(emitted.length, 830, "830 arrivals were emitted across the run");

  var seen = {}, twice = [];
  emitted.forEach(function (key) {
    if (seen[key]) twice.push(key);
    seen[key] = (seen[key] || 0) + 1;
  });
  t.eq(twice.join(" "), "", "and no arrival was emitted twice");

  // Per wave, against what the wave says it holds. On the 830 total alone, one
  // wave short and another long cancel out -- which is not a state anyone
  // should have to reason about.
  var missing = [];
  h.game.WAVES.forEach(function (wave, i) {
    var prefix = (i + 1) + ":";
    var got = emitted.filter(function (key) {
      return key.slice(0, prefix.length) === prefix;
    }).length;
    if (got !== h.game.waveCount(wave)) {
      missing.push("wave " + (i + 1) + " emitted " + got + " of " +
        h.game.waveCount(wave));
    }
  });
  t.eq(missing.join(" | "), "", "every wave emitted exactly the bodies it authors");

  // And every arrival the DATA declares was one of them: same set, both ways.
  var authored = [];
  h.game.WAVES.forEach(function (wave, i) {
    h.game.waveTimeline(wave).forEach(function (ev) {
      authored.push((i + 1) + ":" + ev.groupIndex + ":" + ev.bodyIndex);
    });
  });
  t.eq(authored.length, 830, "the schedule declares 830 arrivals");
  var never = authored.filter(function (key) { return !seen[key]; });
  t.eq(never.slice(0, 5).join(" "), "", "and none of them was skipped");

  // THE MONEY IS THE OTHER HALF OF "EXACTLY ONCE". Nothing was killed -- every
  // body leaked into an oversized base and a leak pays nothing -- so the only
  // cash that moved is the thirty-five clear rewards. A wave paid twice by two
  // gates racing, or a wave closed without paying, is visible here and nowhere
  // else on this route through the campaign.
  var owed = 0;
  h.game.WAVES.forEach(function (wave, i) { owed += h.game.waveReward(wave, i + 1); });
  t.eq(h.game.cash - openingCash, owed,
    "the unattended run paid exactly the 35 clear rewards, no more and no less");
  t.eq(h.game.pendingBounty, 0, "with nothing left owed at the end");
});

// A SECOND ROAD IS A SECOND PLACE TO PUT THE SAME EVENT, AND NOTHING ELSE.
//
// Twin Confluence has two entrances converging on one base, and emitWaveEvent
// mirrors every scheduled arrival onto each of them -- so a two-road map is
// twice the bodies on one timeline, not two schedules running side by side.
// content.test.js owns the first beat of that ("Twin Confluence mirrors each
// scheduled beat onto two paths and one base"); this owns the WHOLE of a wave
// under the timeline scheduler, which is where mirroring could go wrong without
// anyone noticing: a cursor advanced once per route would emit half the wave,
// and a reward paid per route would double the campaign's income.
test("a second road mirrors the whole timeline, and is still one wave and one reward",
function (t) {
  var h = harness.boot("twin-confluence");
  t.eq(h.game.paths.length, 2, "two live roads");

  // Wave 12: four groups, three types, 88 bodies, the most interleaved wave in
  // the book -- so if mirroring and interleaving interfere, this is where.
  h.run("waveIndex = 11; waveSpawned = 0; waveCountdown = 0; waveElapsed = 0;" +
        "waveOnClockIndex = -1; enemies.length = 0; bullets.length = 0;" +
        "baseHp = 1000000;");
  for (var i = 0; i < 60 * 25; i++) h.game.updateWaves(1 / 60);

  var authored = h.game.waveCount(h.game.WAVES[11]);
  t.eq(authored, 88, "wave 12 authors 88 bodies");
  t.eq(h.game.enemies.length, authored * 2, "and 176 walked, 88 down each road");
  t.eq(h.game.waveSpawned, authored,
    "while the cursor advanced 88 times -- one per EVENT, not one per body");

  // The two roads got the same wave, body for body, in the same order, with the
  // same resolved health and the same wave identity.
  var byRoute = {};
  h.game.enemies.forEach(function (e) {
    (byRoute[e.routeId] = byRoute[e.routeId] || []).push(
      (e.typeId || "normal") + ":" + Math.round(e.maxHealth) + ":" + e.waveId);
  });
  var roads = Object.keys(byRoute).sort();
  t.deep(roads, ["north", "south"], "one body entered through each route");
  t.eq(byRoute.north.length, authored, "88 down the north road");
  t.eq(byRoute.north.join(","), byRoute.south.join(","),
    "and the south road received exactly the same 88, in the same order");

  // ONE WAVE, ONE REWARD. The reward is a property of the wave, so a map with
  // two roads pays what a map with one pays -- otherwise Twin Confluence would
  // quietly be the money route.
  var g = harness.boot("twin-confluence");
  var owed = g.game.waveReward(g.game.WAVES[0], 1);
  var before = g.game.cash;
  g.step(3.2);
  t.eq(g.game.enemies.length, 10, "wave 1's five bodies, mirrored to ten");
  t.eq(g.game.pendingBounty, owed, "one wave's reward is owed, not two");
  g.run("enemies.forEach(function (e) { e.noBounty = true; e.dead = true; })");
  g.step(1 / 60);
  t.eq(Math.round(g.game.cash - before), owed, "and clearing both roads pays it once");
  t.eq(g.game.waveIndex, 1, "with wave 2 next");

  // The single-road reference route pays the same number for the same wave.
  var single = harness.boot();
  t.eq(single.game.waveReward(single.game.WAVES[0], 1), owed,
    "which is what the one-road route pays for wave 1");
});

// Added 2026-07-29, at the owner's request. Before it, the run-over overlay
// offered "restart this route" and "choose another route" and no way out of
// the run loop at all -- the armoury, where the coins the overlay had just
// awarded are actually spent, was unreachable without reloading the page.

// ---------------------------------------------------------------------------
// TWO AUTHORED CAMPAIGNS (2026-08-27)
//
// Easy is frozen at what it has always been. Normal is a second schedule
// written out in full -- FORTY waves, 1 321 authored roots, all twenty-five
// types since it was extended on 2026-08-28 (it was 35 / 1 000 / 24, and waves
// 1-35 still are exactly that, wave 35's new `duration` aside)
// -- and the load-bearing claim about it is a NEGATIVE one: it is not derived
// from Easy. This project has shipped derived difficulties before, the owner
// had forgotten they existed, and the whole concept was deleted on 2026-08-12
// for exactly that reason. So the independence test below is not a formality.
// ---------------------------------------------------------------------------

group("difficulty");

// A SINGLE BOOTED GAME, SHARED BY THE TESTS THAT ONLY READ THE SCHEDULES.
//
// The composition table, the act totals, the encounter directions and the
// independence check all ask questions about DATA and change nothing. A boot
// builds a whole `vm` context that lives until the process ends, and between
// them the suites already make several hundred; every one is garbage that
// forces a full mark-compact sooner, and every mark-compact is a chance to hit
// the GC crash node v24 has in `ClearStaleLeftTrimmedPointerVisitor` (see
// tests/harness.js). Anything that steps the clock, clicks, places or spawns
// still boots its own -- the sharing is by USE, never by convenience.
var sharedSchedules = null;
function schedulesBoot() {
  if (!sharedSchedules) sharedSchedules = harness.boot();
  return sharedSchedules;
}


// "UNTOUCHED" MEANS BY THE NORMAL CAMPAIGN, NOT BY ANYBODY. This test was
// written on 2026-08-28 to catch a second schedule landing on top of the first,
// and it is still exactly that; a deliberate retune of Easy is edited here, in
// the same change, with the reason. One has happened since: the Fractal Slime
// came off Easy on 2026-08-29 at the owner's instruction, which is where the
// twenty types and the $23 132 below come from.
test("Easy is untouched: thirty-five waves and 830 authored enemies", function (t) {
  var h = schedulesBoot();
  var E = h.game.EASY_WAVES;

  t.eq(E.length, 35, "thirty-five waves");
  var bodies = 0, health = 0, clear = 0, kill = 0;
  E.forEach(function (wave, i) {
    bodies += h.game.waveCount(wave);
    health += h.game.waveEffectiveHealth(wave);
    clear += h.game.waveBounty(wave);
    kill += h.game.waveKillBounty(wave);
  });
  // Every one of these is the figure the composition gate above already pins;
  // they are restated here against EASY_WAVES BY NAME rather than against the
  // active `WAVES`, because the thing this test exists to catch is a second
  // schedule quietly landing on top of the first.
  t.eq(bodies, 830, "830 authored bodies");
  t.eq(health, 25939, "25 939 effective HP");
  t.eq(clear, 2594, "$2594 of clear bounty");
  // $22 987 until the Fractal Slime came off it. Health did not move -- every
  // root was replaced point for point -- and this rose $145 anyway, because
  // the four types that replaced them are ordinary bodies at $1 a point where
  // a slime was written at $0.50.
  t.eq(kill, 23132, "$23 132 of kill bounty");
  t.eq(h.game.WAVES, E, "and Easy is what a fresh boot plays");

  // The three v0.5.1 types are deliberately absent from it. Easy gaining one
  // would be a retune of a schedule nobody asked to retune.
  var ids = {};
  E.forEach(function (wave) {
    h.game.waveGroups(wave).forEach(function (g) {
      ids[g.type || h.game.Enemy.DEFAULT_TYPE] = true;
    });
  });
  t.eq(ids.herald, undefined, "no Herald in Easy");
  t.eq(ids.sapper, undefined, "no Sapper in Easy");
  t.eq(ids.volatile, undefined, "no Volatile in Easy");
  // AND NO FRACTAL SLIME, which is the twenty-first type it used to carry.
  // Normal still sends four rungs of the ladder, so this is a claim about Easy
  // and not about the roster -- see "Easy schedules no Fractal Slime, and the
  // ladder is intact anyway" in tests/content.test.js.
  t.eq(ids.fractal_slime, undefined, "no Fractal Slime in Easy");
  t.eq(Object.keys(ids).length, 20, "Easy still carries exactly its 20 types");
});

// THE EXACT COMPOSITION, WAVE BY WAVE. Written as the owner's own table rather
// than as a snapshot of the file, so this test is the specification and the
// schedule is what has to agree with it -- the other way round from the
// pre-rewrite gate above, which snapshots what was already there.
var NORMAL_TABLE = [
  [ 1, { normal: 8, fast: 4 }],
  [ 2, { normal: 10, slow: 6 }],
  [ 3, { swarm: 18, fast: 8 }],
  [ 4, { normal: 12, armored: 8 }],
  [ 5, { slow: 8, swarm: 12, fast: 6 }],
  [ 6, { herald: 2, normal: 14, fast: 8 }],
  [ 7, { armored: 10, slow: 12, swarm: 12 }],
  [ 8, { angry: 8, normal: 14 }],
  [ 9, { camo_normal: 8, camo_fast: 8 }],
  [10, { shielded: 6, brute: 2, fast: 14 }],
  [11, { shieldbearer: 1, armored: 14, fast: 12, flying: 3 }],
  [12, { herald: 2, shielded: 6, swarm: 20 }],
  [13, { sapper: 3, normal: 16, angry: 8 }],
  [14, { midboss: 1, shieldbearer: 2, armored: 10, fast: 16 }],
  [15, { brute: 4, revenant: 8, fast: 10 }],
  [16, { hive: 2, swarm: 20, herald: 2, flying: 10 }],
  [17, { fractal_slime: 2, armored: 16, swarm: 16 }],
  [18, { healer: 2, brute: 6, angry: 12 }],
  [19, { shieldbearer: 2, healer: 2, armored: 14, shielded: 8 }],
  [20, { volatile: 8, swarm: 18, fast: 8 }],
  [21, { boss_fast: 1, herald: 2, shieldbearer: 2, swarm: 24, fast: 14 }],
  [22, { camo_normal: 12, camo_fast: 8, camo_heavy: 6 }],
  [23, { sapper: 3, angry: 12, shielded: 10, normal: 12 }],
  [24, { flying: 18 }],
  [25, { colossus: 1, shieldbearer: 2, healer: 2, slow: 12, armored: 8 }],
  [26, { hive: 3, shieldbearer: 2, swarm: 24, volatile: 8 }],
  [27, { fractal_slime: 1, herald: 2, fast: 16, armored: 16, angry: 8 }],
  [28, { camo_heavy: 8, camo_normal: 12, camo_fast: 6 }],
  [29, { colossus: 2, shieldbearer: 2, healer: 2, shielded: 14 }],
  [30, { hive: 3, shieldbearer: 3, healer: 2, revenant: 10, swarm: 12 }],
  [31, { sapper: 3, angry: 8, volatile: 8, fast: 14 }],
  [32, { fractal_slime: 1, herald: 2, armored: 14, brute: 6, swarm: 16 }],
  [33, { flying: 12, camo_fast: 8, camo_heavy: 4 }],
  [34, { boss_fast: 2, shieldbearer: 2, healer: 1, herald: 2, swarm: 22,
         fast: 12, angry: 6 }],
  [35, { normal: 26, flying: 8, shielded: 6, angry: 6, boss: 1,
         fractal_slime: 1, herald: 2 }],
  // --- ACT VI, added 2026-08-28 with the extension to forty waves ---------
  [36, { colossus: 2, brute: 6, armored: 16, normal: 18, fast: 12 }],
  [37, { colossus: 4, brute: 8, armored: 20, normal: 20, swarm: 16 }],
  [38, { colossus: 6, brute: 10, armored: 24, normal: 24, fast: 18, swarm: 20 }],
  [39, { boss: 3, colossus: 8, shieldbearer: 4, healer: 4, herald: 3,
         shielded: 12, revenant: 12, swarm: 20 }],
  [40, { dinomech: 1, swarm: 18, fast: 12 }]
];

// One wave's roster, as { typeId: bodies }. Walked through waveGroups so a wave
// cut into salvos reads the same as one that is not -- the aggregate is what
// the table above is about, and the salvo shape is a timing decision.
function compositionOf(h, wave) {
  var out = {};
  h.game.waveGroups(wave).forEach(function (g) {
    var id = g.type || h.game.Enemy.DEFAULT_TYPE;
    out[id] = (out[id] || 0) + g.count;
  });
  return out;
}

// A roster as a SORTED string, for comparing two of them.
//
// `t.deep` compares key ORDER as well as content, and a composition's key order
// is the order the groups happen to be written in -- a timing decision, which
// the aggregate deliberately does not care about. Sorting is what lets the
// table above state a wave the way the owner wrote it while the file states it
// in the order the bodies arrive.
function rosterLine(comp) {
  return Object.keys(comp).sort().map(function (id) {
    return id + " x" + comp[id];
  }).join(", ");
}

test("Normal is forty waves of exactly the authored composition", function (t) {
  var h = schedulesBoot();
  var N = h.game.NORMAL_WAVES;

  t.eq(N.length, 40, "forty waves");
  t.eq(NORMAL_TABLE.length, 40, "and forty rows to check them against");

  var wrong = [];
  var total = 0;
  N.forEach(function (wave, i) {
    var want = NORMAL_TABLE[i][1];
    var got = compositionOf(h, wave);
    var n = 0;
    Object.keys(got).forEach(function (id) { n += got[id]; });
    total += n;

    Object.keys(want).forEach(function (id) {
      if (got[id] !== want[id]) {
        wrong.push("wave " + (i + 1) + ": " + (got[id] || 0) + " x " + id +
          ", the table says " + want[id]);
      }
    });
    Object.keys(got).forEach(function (id) {
      if (want[id] === undefined) {
        wrong.push("wave " + (i + 1) + " has an unlisted " + got[id] + " x " + id);
      }
    });
  });
  t.eq(wrong.join("\n          "), "", "every wave matches the authored table");
  t.eq(total, 1321, "1 321 authored root enemies");

  // ROOTS, and the word is load-bearing. A Hive's brood, a Fractal Slime's
  // descendants and the Tyrant's roar are all born at run time and none of them
  // is in this count -- exactly as none of them is in Easy's 830.
  var live = 0;
  N.forEach(function (wave) { live += h.game.waveCount(wave); });
  t.eq(live, 1321, "and the game's own waveCount agrees");
});

// WAVES 1-35 DID NOT MOVE WHEN THE CAMPAIGN GREW TO FORTY, and that is a
// separate claim from the table above -- the table would still pass if act VI
// had been paid for by trimming act V. This one holds the composition, the
// group timing and the authored signature of the first thirty-five waves
// against what they were before the extension, and it names the ONE field that
// was allowed to change: wave 35's `duration`, which it had to gain because a
// wave with something after it must have a ceiling.
test("Normal's first thirty-five waves are untouched but for wave 35's ceiling",
function (t) {
  var h = schedulesBoot();
  var N = h.game.NORMAL_WAVES;

  var bodies = 0, health = 0;
  for (var i = 0; i < 35; i++) {
    bodies += h.game.waveCount(N[i]);
    health += h.game.waveEffectiveHealth(N[i]);
  }
  t.eq(bodies, 1000, "the original 1 000 roots are all still in waves 1-35");
  // 39 139 MEASURED, and AGENTS.md said 39 507 from the day Normal landed until
  // 2026-08-27. Nothing pinned it, so nothing caught it; the prose figure was
  // wrong and the schedule was right. Pinned here now, off the game's own
  // waveEffectiveHealth, so it cannot drift again unremarked.
  t.eq(Math.round(health), 39139, "and their 39 139 effective HP with them");

  // The ceiling wave 35 grew, and the fact that it is the ONLY one it grew.
  // 170 UNTIL 2026-08-29, when every ceiling in Normal was re-timed to raise
  // the campaign to a 1.50 rating and make its curve RISE (js/systems/
  // difficulty.js). What this line is FOR is unchanged and is the next
  // assertion's business too: wave 35 stopped being the finale when the
  // campaign grew to forty, so it has a ceiling like every other wave.
  // Asserted as "has one, and it is not the finale's absent one" plus the
  // measured value, so a re-time updates one number here rather than losing
  // the claim.
  t.eq(N[34].duration, 60, "wave 35 carries a ceiling of its own");
  var missing = [];
  for (var j = 0; j < 39; j++) {
    if (N[j].duration === undefined) missing.push(j + 1);
  }
  t.deep(missing, [], "and every wave before the last one has one");
  t.eq(N[39].duration, undefined, "while wave 40 authors none");
});

// ACT VI, WAVE BY WAVE, AS THE SPECIFICATION RATHER THAN AS A SNAPSHOT.
// The composition is already pinned by the table; what these add is the SHAPE
// each wave was written for, which no roster count can carry.
test("the three money convoys carry armour and escort and nothing else",
function (t) {
  var h = schedulesBoot();
  var Enemy = h.game.Enemy;
  var ALLOWED = ["colossus", "brute", "armored", "normal", "fast", "swarm"];

  [36, 37, 38].forEach(function (n) {
    var wave = h.game.NORMAL_WAVES[n - 1];
    h.game.waveGroups(wave).forEach(function (g) {
      var type = Enemy.typeOf(g.type);
      t.ok(ALLOWED.indexOf(type.id) !== -1,
        "wave " + n + " carries only ordinary bodies (" + type.id + ")");
      // The prohibitions, stated as PROPERTIES rather than as an id blacklist,
      // so a future type that acquires one is caught by the same assertion.
      t.ok(!type.attack && !type.attacks,
        "wave " + n + ": nothing in it attacks a tower (" + type.id + ")");
      t.ok(!type.support, "wave " + n + ": no support (" + type.id + ")");
      t.ok(!type.spawns, "wave " + n + ": no spawner (" + type.id + ")");
      t.ok(!type.fractal, "wave " + n + ": no Fractal (" + type.id + ")");
      t.ok(!type.deathEffect, "wave " + n + ": nothing leaves a charge (" + type.id + ")");
      t.ok(!type.isCamo && !type.isFlying,
        "wave " + n + ": nothing camouflaged and nothing airborne (" + type.id + ")");
      t.ok(!type.showHealthBanner, "wave " + n + ": no boss (" + type.id + ")");
    });

    // A generous window: the ceiling clears the wave's own last arrival by at
    // least forty seconds, which is what "a wave to spend in" means when idle
    // seconds earn nothing.
    var ev = h.game.waveTimeline(wave);
    var last = ev[ev.length - 1].time;
    t.ok(wave.duration - last >= 40,
      "wave " + n + "'s ceiling (" + wave.duration + " s) clears its last " +
      "arrival at " + last.toFixed(2) + " s by " +
      (wave.duration - last).toFixed(2) + " s");
  });
});

// THE COLOSSUS PROGRESSION IS THE SPINE OF THE ACT, and it is pinned on its own
// because it is the one number a retune of any single wave could quietly break.
test("the Colossus progression across 36-39 is 2, 4, 6 and 8", function (t) {
  var h = schedulesBoot();
  var counts = [36, 37, 38, 39].map(function (n) {
    return compositionOf(h, h.game.NORMAL_WAVES[n - 1]).colossus;
  });
  t.deep(counts, [2, 4, 6, 8], "two more every wave, to eight beside the Tyrants");
  t.eq(compositionOf(h, h.game.NORMAL_WAVES[38]).boss, 3,
    "and wave 39 adds the three Tyrants to its eight");
});

// PAYOUT, AND IT HAS TO RISE. The three convoys exist to refund the board that
// survived act V, and each is meant to buy strictly more than the one before.
// Measured through the game's own arithmetic -- waveKillBounty plus waveReward
// -- so a retune of a count or a `health` override moves this with it, and no
// per-wave reward is typed in anywhere.
test("the money convoys pay strictly more each wave, and enough to spend",
function (t) {
  var h = schedulesBoot();
  function payout(n) {
    var wave = h.game.NORMAL_WAVES[n - 1];
    return h.game.waveKillBounty(wave) + h.game.waveReward(wave, n);
  }
  var p36 = payout(36), p37 = payout(37), p38 = payout(38);

  t.ok(p36 < p37, "wave 36 ($" + p36 + ") pays less than wave 37 ($" + p37 + ")");
  t.ok(p37 < p38, "wave 37 pays less than wave 38 ($" + p38 + ")");

  // WHAT EACH ONE BUYS, against real late-game prices rather than round
  // numbers: the Warbringer's B5 earthquake is $2900, the Rifleman's B4 is
  // $2100 and its B5 $3800. One meaningful tier, then one or two, then two or
  // three (or a rebuild).
  var oneTier = 2900;                     // Warbringer B5
  t.ok(p36 >= oneTier,
    "wave 36 covers a meaningful late-game tier ($" + p36 + " vs $" + oneTier + ")");
  t.ok(p37 >= 3800 && p37 < 2 * 3800,
    "wave 37 covers one or two ($" + p37 + ")");
  t.ok(p38 >= 2100 + 3800,
    "wave 38 covers two or three, or a substantial rebuild ($" + p38 + ")");
});

// WAVE 39 -- THE ROYAL LEGION. The staging is the wave, so it is checked as
// staging: three Tyrants, roughly twenty seconds apart, never together, with
// support interleaved into the payload it exists to keep standing.
test("wave 39 sends three independent Tyrants about twenty seconds apart",
function (t) {
  var h = schedulesBoot();
  var wave = h.game.NORMAL_WAVES[38];

  var tyrants = h.game.waveGroups(wave).filter(function (g) {
    return g.type === "boss";
  });
  t.eq(tyrants.length, 3, "three separate one-body groups, not one group of three");
  tyrants.forEach(function (g) {
    t.eq(g.count, 1, "each Tyrant is its own entrance");
  });
  var at = tyrants.map(function (g) { return g.at; });
  t.deep(at, [8, 28, 50], "at 8 s, 28 s and 50 s");
  t.ok(at[1] - at[0] >= 18 && at[1] - at[0] <= 24, "twenty seconds between 1 and 2");
  t.ok(at[2] - at[1] >= 18 && at[2] - at[1] <= 24, "and between 2 and 3");

  // NEVER TOGETHER, which is what "approximately twenty seconds apart" is
  // actually protecting: no two of them share an arrival instant.
  var times = h.game.waveTimeline(wave).filter(function (e) {
    return h.game.waveGroups(wave)[e.groupIndex].type === "boss";
  }).map(function (e) { return e.time; });
  t.eq(times.length, 3, "three boss arrivals on the timeline");
  t.eq(times[0] === times[1] || times[1] === times[2], false,
    "and no two of them land on the same frame");
});

test("wave 39's three Tyrants keep independent state, and their summons keep 39",
function (t) {
  var h = harness.boot("rune-circuit", "normal");
  var Enemy = h.game.Enemy;

  // THE STATE THAT MUST NOT BE SHARED is the attack pool: `enterPhase` COPIES
  // every spec rather than mutating the row in Enemy.TYPES, so one Tyrant
  // roaring must not wind the interval down on the other two -- or on the next
  // run's boss.
  var typeInterval = Enemy.TYPES.boss.attacks[0].intervalSeconds;
  var a = new Enemy(h.game.path, 3600, "boss", { waveId: 39 });
  var b = new Enemy(h.game.path, 3600, "boss", { waveId: 39 });
  var c = new Enemy(h.game.path, 3600, "boss", { waveId: 39 });

  a.takeDamage(2000);                      // past half of 3600: a roars
  t.eq(a.phasesEntered, 1, "the first Tyrant has roared");
  t.eq(b.phasesEntered, 0, "the second has not");
  t.eq(c.phasesEntered, 0, "and neither has the third");
  t.eq(a.attacks.length, 2, "the roarer has its leap");
  t.eq(b.attacks.length, 1, "the others do not");
  t.eq(Enemy.TYPES.boss.attacks[0].intervalSeconds, typeInterval,
    "and the TYPE's own spec is untouched, so the next boss is unaffected");

  // AND ONE DYING CHANGES NOTHING ABOUT THE OTHERS. Two blows, not one: the
  // roar conjured a 1000 point shield and a shield absorbs the WHOLE hit that
  // breaks it, so the first blow only strips the shell.
  a.takeDamage(999999);
  a.takeDamage(999999);
  t.eq(a.dead, true, "the first Tyrant is down");
  t.eq(b.phasesEntered, 0, "the second is still whole");
  b.takeDamage(2000);
  t.eq(b.phasesEntered, 1, "and roars on its own clock");
  t.eq(c.phasesEntered, 0, "with the third still untouched");

  // SUMMONS INHERIT THE WAVE. `pendingSpawns` is what the roar fills and
  // spawnMinions is the one door it comes out of; every body it makes carries
  // the roarer's own waveId, which is wave 39's.
  var brood = b.spawnMinions(0);
  t.ok(brood.length > 0, "the roar queued a crowd");
  var wrong = brood.filter(function (e) { return e.waveId !== 39; });
  t.eq(wrong.length, 0, "and every summoned body carries wave 39");
});

test("wave 39 is the tactical peak, but not the damage peak", function (t) {
  var h = schedulesBoot();
  var wave = h.game.NORMAL_WAVES[38];
  var effective = h.game.waveEffectiveHealth(wave);

  // The authored band the wave was written to: durable/effective HP BEFORE any
  // renewable support (Healers, Shieldbearers) and before a Tyrant's summons,
  // none of which waveEffectiveHealth counts.
  t.ok(effective >= 28000 && effective <= 32000,
    "28 000 - 32 000 authored effective HP (" + Math.round(effective) + ")");

  // AND IT STAYS UNDER THE 45K BOSS. Wave 39 may be the more complicated wave;
  // it may not be the heavier one.
  t.ok(effective < h.game.Enemy.TYPES.dinomech.health,
    "under wave 40's single body (" + Math.round(effective) + " < " +
    h.game.Enemy.TYPES.dinomech.health + ")");

  // Support is INTERLEAVED, never parked behind the payload: every supporter
  // lands while something else in the wave is still arriving.
  var lastArrival = 0;
  h.game.waveGroups(wave).forEach(function (g) {
    lastArrival = Math.max(lastArrival, g.at + (g.count - 1) * g.interval);
  });
  var late = [];
  h.game.waveGroups(wave).forEach(function (g) {
    var type = h.game.Enemy.typeOf(g.type);
    if (!type.support) return;
    if (!(g.at < lastArrival)) late.push(type.id + " at " + g.at);
  });
  t.deep(late, [], "every supporter arrives inside the deploy it supports");
});

// WAVE 40 -- THE TRUE FINALE.
test("wave 40 is one 45k boss, eighteen Swarm, twelve Fast and no support",
function (t) {
  var h = schedulesBoot();
  var Enemy = h.game.Enemy;
  var wave = h.game.NORMAL_WAVES[39];

  t.eq(rosterLine(compositionOf(h, wave)),
    rosterLine({ dinomech: 1, swarm: 18, fast: 12 }),
    "1 Dinomech + 18 Swarm + 12 Fast");
  t.eq(Enemy.TYPES.dinomech.health, 45000, "and the boss is exactly 45 000 HP");

  // NO SHIELD, NO REVIVE, NO PHASE -- so 45 000 is what the schedule says AND
  // what the player has to remove, with nothing conditional on top of it.
  t.eq(Enemy.TYPES.dinomech.shield, undefined, "no shield");
  t.eq(Enemy.TYPES.dinomech.revive, undefined, "no second life");
  t.eq(Enemy.TYPES.dinomech.phases, undefined, "and no phase to call anything in");
  t.eq(Enemy.TYPES.dinomech.support, undefined, "it helps nothing");
  t.eq(Enemy.TYPES.dinomech.spawns, undefined, "and spawns nothing");

  // NOTHING IN THE WAVE HEALS, SHIELDS, HASTENS, SPAWNS OR DISABLES. Stated as
  // properties rather than as a list of forbidden ids.
  h.game.waveGroups(wave).forEach(function (g) {
    var type = Enemy.typeOf(g.type);
    t.ok(!type.support, "no supporter in wave 40 (" + type.id + ")");
    t.ok(!type.spawns, "no spawner in wave 40 (" + type.id + ")");
    t.ok(!type.shield, "nothing wearing a shield (" + type.id + ")");
    t.ok(!type.revive, "nothing that gets back up (" + type.id + ")");
    t.ok(!type.fractal, "and no Fractal (" + type.id + ")");
  });

  // THE DISTRACTIONS ARE SECONDARY, by weight and by speed.
  var boss = h.game.Enemy.TYPES.dinomech;
  ["swarm", "fast"].forEach(function (id) {
    t.ok(Enemy.TYPES[id].speedMultiplier > boss.speedMultiplier,
      "a " + id + " overtakes the boss it spawns behind");
  });
  var escortHp = h.game.waveEffectiveHealth(wave) - boss.health;
  t.ok(escortHp < boss.health * 0.05,
    "the thirty escort bodies are " + Math.round(escortHp) +
    " points against the boss's " + boss.health);
});

test("wave 40's four deployments land at 0, 12, 32 and 55 seconds",
function (t) {
  var h = schedulesBoot();
  var wave = h.game.NORMAL_WAVES[39];

  var at = [];
  h.game.waveGroups(wave).forEach(function (g) {
    if (at.indexOf(g.at) === -1) at.push(g.at);
  });
  at.sort(function (a, b) { return a - b; });
  t.deep(at, [0, 12, 32, 55], "four authored deployment instants and no others");

  // A CLEAN TWELVE-SECOND ENTRANCE: the boss is the only thing on the road
  // until the first escort lands.
  var events = h.game.waveTimeline(wave);
  var groups = h.game.waveGroups(wave);
  var early = events.filter(function (e) { return e.time < 12; });
  t.eq(early.length, 1, "exactly one body arrives before 12 s");
  t.eq(groups[early[0].groupIndex].type, "dinomech", "and it is the boss");

  // NO CEILING, so nothing can create a wave 41.
  t.eq(wave.duration, undefined, "wave 40 authors no `duration`");
  t.eq(h.game.NORMAL_WAVES.length, 40, "and there are forty waves, not forty-one");
});

// EVERY AUTHORED EVENT IN 35-39 LANDS BEFORE ITS OWN CEILING, point-blank off
// the EVENT LIST rather than off the group arithmetic the shipping validator
// uses -- so the two derivations have to agree. A `duration` at or under its own
// last arrival deletes the tail of a wave silently: the wave still says 102
// bodies and still pays for 102.
test("every event in Normal's waves 35-39 happens before that wave's ceiling",
function (t) {
  var h = schedulesBoot();
  var short = [];
  for (var i = 34; i < 39; i++) {
    var wave = h.game.NORMAL_WAVES[i];
    var ev = h.game.waveTimeline(wave);
    var last = ev[ev.length - 1].time;
    if (wave.duration === undefined) {
      short.push("wave " + (i + 1) + " has no ceiling at all");
    } else if (!(wave.duration > last)) {
      short.push("wave " + (i + 1) + ": ceiling " + wave.duration +
        " s does not outlast its last arrival at " + last.toFixed(2) + " s");
    }
  }
  t.eq(short.join(" | "), "", "35, 36, 37, 38 and 39 all clear their own tails");
});

// ---------------------------------------------------------------------------
// THE FINALE MOVED, AND FINALITY COMES FROM THE SCHEDULE'S LENGTH.
//
// Wave 35 was Normal's last wave until 2026-08-28 and it holds a Tyrant, which
// is exactly the thing that makes "is this the end" look like a question about
// content. It is not: the only thing that decides it is `WAVES.length`. These
// two tests are the behavioural halves -- one that wave 35 hands over, one that
// wave 40 does not.
// ---------------------------------------------------------------------------
test("Normal's wave 35 hands over to wave 36 and cannot win the run",
function (t) {
  var h = harness.boot("rune-circuit", "normal");
  t.eq(h.game.WAVES.length, 40, "forty waves are on the clock");

  h.run("waveIndex = 34; waveSpawned = 0; waveCountdown = 0; waveElapsed = 0;" +
        "enemies = []; bullets = []; baseHp = 1000000;");
  h.step(1 / 60);

  // IT IS AN ORDINARY WAVE NOW: a ceiling, a readable window, and a Send button
  // once it has finished arriving.
  // Re-timed 170 -> 60 on 2026-08-29 with the rest of Normal's ceilings; the
  // claim is that it HAS one, which is what stops it reading as the finale.
  t.eq(h.game.WAVES[34].duration, 60, "wave 35 carries its ceiling");
  t.ok(h.run("waveTimeRemaining()") > 0, "so the readout has a number to print");
  t.ok(h.run("waveStatusText()").indexOf("FINAL WAVE") === -1,
    "and it does not claim to be the final wave (" + h.run("waveStatusText()") + ")");

  // Run it out and clear the road. Nothing here may win the run.
  for (var i = 0; i < 200 * 60 && h.game.waveIndex === 34; i++) {
    h.run("enemies.forEach(function (e) { e.noBounty = true; e.dead = true; })");
    h.step(1 / 60);
  }
  t.eq(h.game.victory, false, "beating wave 35 does not win the campaign");
  t.eq(h.game.allWavesDeployed, false, "the schedule is not exhausted");
  t.eq(h.game.waveIndex, 35, "and wave 36 is what is on the cursor");
  t.ok(h.game.waveCountdown > 0 || h.game.waveIndex === 35,
    "with the transition to it already running");
});

test("Normal wins only once wave 40's boss and its escort are both gone",
function (t) {
  var h = harness.boot("rune-circuit", "normal");
  var last = h.game.WAVES.length - 1;
  t.eq(last, 39, "wave 40 is the last index");

  h.run("waveIndex = " + last + "; waveSpawned = 0; waveCountdown = 0;" +
        "waveElapsed = 0; enemies = []; bullets = []; baseHp = 1000000;");
  h.step(1 / 60);

  t.eq(h.game.WAVES[last].duration, undefined, "wave 40 authors no ceiling");
  t.eq(h.run("waveTimeRemaining()"), null, "so there is no window to count down");
  t.notOk(h.run("waveSendAvailable()"), "and no Send while it deploys");
  t.ok(h.run("waveStatusText()").indexOf("FINAL WAVE") !== -1,
    "the readout says FINAL WAVE (" + h.run("waveStatusText()") + ")");

  // Run it out. Nothing may hand over to a wave 41.
  for (var i = 0; i < 200 * 60 && !h.game.allWavesDeployed; i++) h.step(1 / 60);
  t.ok(h.game.allWavesDeployed, "wave 40 finished arriving");
  t.eq(h.game.waveIndex, 40, "the cursor is retired past the end");
  t.notOk(h.run("waveSendAvailable()"), "still no Send once it is out");
  t.eq(h.game.waveCountdown, 0, "no countdown to a wave 41");
  t.notOk(h.game.betweenWaves(), "and no transition, because there is nothing next");
  t.ok(h.game.enemies.length > 0, "the boss and its escort are still walking");
  t.eq(h.game.victory, false, "so the run is not won");

  // Kill the escort but leave the boss: still not a win.
  h.run("enemies.forEach(function (e) {" +
        "  if (e.typeId !== 'dinomech') { e.noBounty = true; e.dead = true; }" +
        "})");
  h.step(1 / 60);
  var boss = h.game.enemies.filter(function (e) { return e.typeId === "dinomech"; });
  t.eq(boss.length, 1, "one Dinomech left on the road");
  t.eq(boss[0].maxHealth, 45000, "carrying its 45 000");
  t.eq(boss[0].waveId, 40, "and wearing wave 40");
  t.eq(h.game.victory, false, "the boss alone still holds the win away");

  // And now it too.
  h.run("enemies.forEach(function (e) { e.noBounty = true; e.dead = true; })");
  h.step(1 / 60);
  t.eq(h.game.enemies.length, 0, "the road is clear");
  t.eq(h.game.victory, true, "and that is the win");
  t.eq(h.game.WAVES.length, 40, "off forty waves and no forty-first");
});

// THE ARRIVAL AUDIT, FOR NORMAL. Its Easy twin ("the whole campaign runs itself
// dry, with every authored arrival emitted once") is the only test in the repo
// that watches the RUN rather than the data, and it reads `WAVES` on a fresh
// boot, which is Easy. Act VI is 321 new arrivals across five waves nothing
// else exercises end to end, and the two failures that hide from every count in
// this file -- an arrival emitted twice, an arrival dropped by a ceiling that
// cut its own tail -- are exactly what a newly authored act is most likely to
// carry.
test("Normal runs itself dry over forty waves, every arrival emitted once",
function (t) {
  var h = harness.boot(null);
  h.chooseMap(h.game.Maps.DEFAULT_ID, "normal");
  t.eq(h.game.WAVES, h.game.NORMAL_WAVES, "on Normal's schedule");
  h.run("baseHp = 4000000");
  var openingCash = h.game.cash;

  h.run("(function () {" +
        "  var real = emitWaveEvent;" +
        "  emittedArrivals = [];" +
        "  emitWaveEvent = function (ev) {" +
        "    emittedArrivals.push((waveIndex + 1) + ':' + ev.groupIndex + ':' + ev.bodyIndex);" +
        "    return real(ev);" +
        "  };" +
        "})()");

  for (var i = 0; i < 90 * 60 * 60 && !h.game.victory && !h.game.gameOver; i++) {
    h.step(1 / 60);
  }
  t.eq(h.game.victory, true, "the campaign ends in a win with nobody touching it");
  t.eq(h.game.enemies.length, 0, "on an empty road");
  t.eq(h.game.allWavesDeployed, true, "with the schedule exhausted");

  var emitted = h.run("emittedArrivals");
  t.eq(emitted.length, 1321, "1 321 arrivals were emitted across the run");

  var seen = {}, twice = [];
  emitted.forEach(function (key) {
    if (seen[key]) twice.push(key);
    seen[key] = (seen[key] || 0) + 1;
  });
  t.eq(twice.join(" "), "", "and no arrival was emitted twice");

  var missing = [];
  h.game.WAVES.forEach(function (wave, i) {
    var prefix = (i + 1) + ":";
    var got = emitted.filter(function (key) {
      return key.slice(0, prefix.length) === prefix;
    }).length;
    if (got !== h.game.waveCount(wave)) {
      missing.push("wave " + (i + 1) + " emitted " + got + " of " +
        h.game.waveCount(wave));
    }
  });
  t.eq(missing.join(" | "), "", "every wave emitted exactly the bodies it authors");

  // Nothing was killed -- every body leaked into an oversized base and a leak
  // pays nothing -- so the only cash that moved is the FORTY clear rewards.
  var owed = 0;
  h.game.WAVES.forEach(function (wave, i) { owed += h.game.waveReward(wave, i + 1); });
  t.eq(h.game.cash - openingCash, owed,
    "the unattended run paid exactly the 40 clear rewards, no more and no less");
  t.eq(h.game.pendingBounty, 0, "with nothing left owed at the end");
});

test("Normal carries every campaign type, and Easy's twenty-one", function (t) {
  var h = schedulesBoot();
  var seen = {};
  h.game.NORMAL_WAVES.forEach(function (wave) {
    h.game.waveGroups(wave).forEach(function (g) {
      var id = g.type || h.game.Enemy.DEFAULT_TYPE;
      h.game.Enemy.typeOf(id);              // throws on a typo in the schedule
      seen[id] = (seen[id] || 0) + 1;
    });
  });
  var roster = Object.keys(h.game.Enemy.TYPES);
  t.eq(roster.length, 26, "twenty-six types exist");
  t.ok(seen.dinomech > 0, "the Dinomech among them, in wave 40");

  // `sandboxOnly` IS THE EXEMPTION, the same one the roster test above reads.
  // A type carrying it is parked in the index and the sandbox while it is being
  // looked at, and scheduling it is a separate, deliberate decision -- so it is
  // held OUT of this count rather than quietly counted as missing.
  var parked = roster.filter(function (id) {
    return h.game.Enemy.TYPES[id].sandboxOnly;
  });
  t.deep(parked, ["skimmer"], "one type is parked out of the campaign");

  var missing = roster.filter(function (id) {
    return !seen[id] && !h.game.Enemy.TYPES[id].sandboxOnly;
  });
  t.eq(missing.join(", "), "", "and Normal schedules every campaign type");
});

// THE ACT TOTALS. They are the CURVE, and a retune that holds the total while
// moving bodies between acts is a different campaign wearing the same figure --
// which no other assertion here would see.
//
// THE FIRST FIVE ARE PINNED SEPARATELY FROM THE SIXTH, deliberately. Acts I-V
// are the teaching curve and they did not move when the campaign was extended
// on 2026-08-28; act VI is five waves rather than seven and is the ending. Summing
// all six into one figure would let one absorb the other.
test("Normal's five teaching acts are still 158, 174, 213, 212 and 243 bodies",
function (t) {
  var h = schedulesBoot();
  var acts = [0, 0, 0, 0, 0];
  h.game.NORMAL_WAVES.slice(0, 35).forEach(function (wave, i) {
    acts[Math.floor(i / 7)] += h.game.waveCount(wave);
  });
  t.deep(acts, [158, 174, 213, 212, 243], "seven waves per act, five acts");
  t.eq(acts.reduce(function (a, b) { return a + b; }, 0), 1000,
    "and they still add to the thousand they always did");
});

test("act VI is five waves and 321 bodies, on top of the thousand", function (t) {
  var h = schedulesBoot();
  var act6 = h.game.NORMAL_WAVES.slice(35);
  t.eq(act6.length, 5, "waves 36 to 40");
  var bodies = 0;
  act6.forEach(function (wave) { bodies += h.game.waveCount(wave); });
  t.deep(act6.map(function (wave) { return h.game.waveCount(wave); }),
    [54, 68, 102, 66, 31], "54 / 68 / 102 / 66 / 31");
  t.eq(bodies, 321, "321 new roots");
  t.eq(1000 + bodies, 1321, "and 1 321 across the whole campaign");
});

// THE THREE WAVES WITH WRITTEN ENCOUNTER DIRECTION. Each one is a sentence the
// owner wrote, and each is checked as the sentence rather than as a row of the
// table above -- the composition is already pinned there, so what these add is
// the SHAPE the composition was chosen for.
test("wave 11 is the aerial warning: three Wisps inside a grounded formation",
function (t) {
  var h = schedulesBoot();
  var wave = h.game.NORMAL_WAVES[10];
  var comp = compositionOf(h, wave);
  t.eq(rosterLine(comp),
    rosterLine({ shieldbearer: 1, armored: 14, fast: 12, flying: 3 }),
    "1 Shieldbearer + 14 Armored + 12 Fast + 3 Aether Wisp");

  // ONLY THREE, and everything else on the ground. It is a warning and not the
  // check -- wave 24 is the check -- so a board with no air reach leaks three
  // bodies here rather than eighteen.
  t.eq(comp.flying, 3, "three flyers and no more");
  var ground = 0;
  Object.keys(comp).forEach(function (id) {
    if (!h.game.Enemy.typeOf(id).isFlying) ground += comp[id];
  });
  t.eq(ground, 27, "embedded in twenty-seven grounded bodies");

  // AND THE SUPPORT ARRIVES WHILE ITS BENEFICIARIES ARE STILL DEPLOYING, which
  // is this schedule's standing authoring rule: a supporter behind its own wave
  // props up nothing and the player never learns what it does.
  var bearer = groupOfType(h, wave, "shieldbearer");
  var lastArrival = 0;
  h.game.waveGroups(wave).forEach(function (g) {
    if ((g.type || "normal") === "shieldbearer") return;
    lastArrival = Math.max(lastArrival, g.at + (g.count - 1) * g.interval);
  });
  t.ok(bearer.at < lastArrival,
    "the Shieldbearer lands at " + bearer.at + " s, inside a deploy that runs " +
    "to " + lastArrival.toFixed(2) + " s");
});

test("wave 16 is the split-coverage test, and the Heralds cannot touch the air",
function (t) {
  var h = schedulesBoot();
  var wave = h.game.NORMAL_WAVES[15];
  t.eq(rosterLine(compositionOf(h, wave)),
    rosterLine({ hive: 2, swarm: 20, herald: 2, flying: 10 }),
    "2 Hive + 20 Swarm + 2 Herald + 10 Aether Wisp");

  // "TEN WISPS WHILE HERALDS ACCELERATE ONLY THE HIVE/SWARM GROUND FORMATION."
  // The word is "only", and it is true by the MECHANIC rather than by the
  // schedule: a Herald's eligibility rule excludes fliers, so no spacing, no
  // ordering and no proximity can make it hasten a Wisp. Checked here against
  // the live rule rather than restated, so a change to `eligible` fails the
  // wave that was designed around it.
  var Enemy = h.game.Enemy;
  var herald = new Enemy(h.game.path, undefined, "herald");
  var rule = Enemy.TYPES.herald.support.eligible;
  var wisp = new Enemy(h.game.path, undefined, "flying");
  var speck = new Enemy(h.game.path, undefined, "swarm");
  var hive = new Enemy(h.game.path, undefined, "hive");
  t.eq(Enemy.supportEligible(herald, wisp, rule), false, "a Wisp is ineligible");
  t.eq(Enemy.supportEligible(herald, speck, rule), true, "a Swarm is eligible");
  t.eq(Enemy.supportEligible(herald, hive, rule), true, "and so is a Hive");
});

test("wave 18 is Field Surgery: Brutes, Angries, and Healers inside the wave",
function (t) {
  var h = schedulesBoot();
  var wave = h.game.NORMAL_WAVES[17];
  t.eq(rosterLine(compositionOf(h, wave)),
    rosterLine({ healer: 2, brute: 6, angry: 12 }),
    "2 Healer + 6 Brute + 12 Angry");

  // The Brutes are the durable body the Healers are there to sustain, so they
  // have to be scaled enough to survive long enough to be healed -- and the
  // Angries have to be the type that stops to attack towers, or the wave is
  // just a tank wave with a medic in it.
  var brute = groupOfType(h, wave, "brute");
  t.ok(h.game.Enemy.healthOf("brute", brute.health) >= 60,
    "the Brutes are scaled to absorb sustained fire (" +
    h.game.Enemy.healthOf("brute", brute.health) + " HP)");
  t.eq(h.game.Enemy.typeOf("brute").armor, 5, "behind their 5 flat armor");
  t.ok(!!h.game.Enemy.TYPES.angry.attack, "the Angries stop to hit towers");
  t.eq(h.game.Enemy.TYPES.healer.support.pick, "mostMissingHealth",
    "and the Healers sustain whichever body is most wounded");

  // BOTH HEALERS ARRIVE INSIDE THE WAVE, not behind it. That is the direction
  // "Healers sustain whichever durable body is wounded" actually needs: a pulse
  // fires eight seconds after the body arrives, and it has to land while there
  // is something wounded to land on.
  var healers = [];
  var lastOther = 0;
  h.game.waveGroups(wave).forEach(function (g) {
    if ((g.type || "normal") === "healer") { healers.push(g.at); return; }
    lastOther = Math.max(lastOther, g.at + (g.count - 1) * g.interval);
  });
  t.eq(healers.length, 2, "two Healer groups");
  healers.forEach(function (at) {
    t.ok(at < lastOther, "a Healer at " + at + " s, inside a deploy ending at " +
      lastOther.toFixed(2) + " s");
  });
});

test("wave 34's Vanguards arrive about twelve seconds apart", function (t) {
  var h = schedulesBoot();
  var at = [];
  h.game.waveGroups(h.game.NORMAL_WAVES[33]).forEach(function (g) {
    if (g.type === "boss_fast") at.push(g.at);
  });
  t.eq(at.length, 2, "two Vanguards, as two authored entrances");
  t.ok(Math.abs((at[1] - at[0]) - 12) <= 1.5,
    "twelve seconds apart (" + (at[1] - at[0]).toFixed(1) + " s)");
});

test("wave 35 puts the Tyrant near the middle, the T5 last, and no Sapper",
function (t) {
  var h = schedulesBoot();
  var wave = h.game.NORMAL_WAVES[34];
  var events = h.game.waveTimeline(wave);
  var deploy = events[events.length - 1].time;

  var tyrant = null, slime = null;
  h.game.waveGroups(wave).forEach(function (g) {
    if (g.type === "boss") tyrant = g;
    if (g.type === "fractal_slime") slime = g;
  });
  t.ok(tyrant !== null, "the Tyrant is scheduled");
  var share = tyrant.at / deploy;
  t.ok(share > 0.35 && share < 0.6,
    "and walks in at " + Math.round(share * 100) + "% of the deploy");

  t.eq(slime.tier, 5, "the T5 root is the top rung");
  t.eq(slime.at, deploy, "and it is the last thing the wave sends");

  // SAPPER PLUS TYRANT IS RESERVED FOR HARD. A saboteur switching towers off
  // while the boss is already silencing the best one is a compounding lockout,
  // and Normal's finale is a wave you fight rather than one you watch.
  t.eq(compositionOf(h, wave).sapper, undefined, "and there is no Sapper in it");

  // THE ROAR PACKAGE IS UNTOUCHED -- it is data on the type, and this schedule
  // neither overrides the boss's health nor adds a phase.
  t.eq(tyrant.health, undefined, "the Tyrant carries its own 5000");
  t.eq(h.game.Enemy.TYPES.boss.phases.length, 1, "with its one roar");
  t.eq(h.game.Enemy.TYPES.boss.phases[0].shield, 1000, "and the roar's 1000 shield");
});

// ---------------------------------------------------------------------------
// INDEPENDENTLY AUTHORED, WHICH IS THE CLAIM THAT MATTERS.
// ---------------------------------------------------------------------------
test("Normal is authored, not derived from Easy and not an alias of it",
function (t) {
  var h = schedulesBoot();
  var E = h.game.EASY_WAVES;
  var N = h.game.NORMAL_WAVES;

  // 1 -- NOT AN ALIAS, AT ANY DEPTH. Not the same array, not the same wave
  // objects, not the same group objects. A schedule that shared a group with
  // another would have one editable in two places.
  t.ok(E !== N, "two different arrays");
  var shared = [];
  for (var i = 0; i < N.length; i++) {
    for (var j = 0; j < E.length; j++) {
      if (N[i] === E[j]) shared.push("wave object " + (i + 1) + " = easy " + (j + 1));
      var ng = h.game.waveGroups(N[i]);
      var eg = h.game.waveGroups(E[j]);
      for (var a = 0; a < ng.length; a++) {
        for (var b = 0; b < eg.length; b++) {
          if (ng[a] === eg[b]) shared.push("n" + (i + 1) + ".g" + a + " = e" + (j + 1) + ".g" + b);
        }
      }
    }
  }
  t.eq(shared.slice(0, 5).join(" | "), "", "and no object in common at any depth");

  // 2 -- NOT A MULTIPLE. `buildDifficultyWaves` scaled Easy by constants, so
  // the test for its return is that NO single ratio reproduces one schedule
  // from the other. Four independent quantities, per wave: if any of them were
  // a constant times Easy's, that quantity was derived.
  ["waveCount", "waveEffectiveHealth", "waveBounty", "waveKillBounty"]
    .forEach(function (fn) {
      var ratios = [];
      for (var k = 0; k < 35; k++) {
        var easy = h.game[fn](E[k]);
        var normal = h.game[fn](N[k]);
        if (easy > 0) ratios.push(normal / easy);
      }
      var lo = Math.min.apply(null, ratios);
      var hi = Math.max.apply(null, ratios);
      t.ok(hi - lo > 0.5, fn + " varies wave to wave (" + lo.toFixed(2) +
        " to " + hi.toFixed(2) + "), so it is not Easy times a constant");
    });

  // 3 -- AND IT IS A DIFFERENT CAMPAIGN, not the same one reordered. Every
  // wave's roster is compared with Easy's wave of the same number; a schedule
  // that merely turned the numbers up would match on most of them.
  var same = 0;
  for (var w = 0; w < 35; w++) {
    var ec = compositionOf(h, E[w]);
    var nc = compositionOf(h, N[w]);
    var keys = Object.keys(ec).concat(Object.keys(nc)).sort();
    var identical = true;
    for (var q = 0; q < keys.length; q++) {
      if (ec[keys[q]] !== nc[keys[q]]) { identical = false; break; }
    }
    if (identical) same++;
  }
  t.eq(same, 0, "not one wave has the same roster as Easy's wave of that number");

  // 4 -- AND NOTHING IN THE SOURCE DERIVES ONE FROM THE OTHER. The deleted
  // 2026-08-12 implementation was named; a new one would have to be too, and
  // the point of reading the file is that a derivation is a shape no data
  // assertion above can rule out.
  var src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "game.js"), "utf8");
  var body = src.slice(src.indexOf("var NORMAL_WAVES"),
    src.indexOf("function waveGroups"));
  t.eq(body.indexOf("EASY_WAVES"), -1,
    "NORMAL_WAVES is authored without mentioning EASY_WAVES");
  // The 2026-08-12 derivation by name. Both forms are checked -- a definition
  // and a call -- because the identifier itself appears in the comment above
  // DIFFICULTIES, where it is the history that explains why this test exists.
  t.eq(src.indexOf("function buildDifficultyWaves"), -1,
    "and the deleted derivation has not been redefined");
  t.eq(src.indexOf("buildDifficultyWaves("), -1, "or called");
});

// ---------------------------------------------------------------------------
// SELECTION
// ---------------------------------------------------------------------------
test("the difficulty step follows the route, and its cards start the run",
function (t) {
  var h = harness.boot(null);
  t.eq(h.game.screen, "select", "the chooser is up");

  var card = h.game.mapCardRect(1);
  h.click(card.x + card.w / 2, card.y + card.h / 2);
  t.eq(h.game.screen, "difficulty", "a route card opens the difficulty step");
  t.eq(h.game.pendingMap.id, h.game.Maps.LIST[1].id, "holding the route it chose");

  // NOTHING SIMULATES ON THE WAY THROUGH. `update()` tests `screen !== "play"`
  // rather than listing the screens that are not, so a new one is inert by
  // default -- and this is what proves the new one inherited that.
  h.step(5);
  t.eq(h.game.enemies.length, 0, "and nothing walked while it was up");

  var pick = h.game.difficultyCardRect(1);
  h.click(pick.x + pick.w / 2, pick.y + pick.h / 2);
  t.eq(h.game.screen, "play", "the difficulty card starts the run");
  t.eq(h.game.currentMap.id, h.game.Maps.LIST[1].id, "on the chosen route");
  t.eq(h.game.selectedDifficultyId, "normal", "at the chosen difficulty");
  t.eq(h.game.waveCountdown, h.game.RUN_START_DELAY,
    "on the ordinary ten-second opening pause");
});

test("selecting a difficulty activates that schedule and nothing else",
function (t) {
  var h = harness.boot();
  t.eq(h.game.WAVES, h.game.EASY_WAVES, "a fresh boot is on Easy");
  t.eq(h.game.selectedDifficultyId, "easy", "and says so");

  t.eq(h.run("setDifficulty('normal').id"), "normal", "setDifficulty returns the pick");
  t.eq(h.game.WAVES, h.game.NORMAL_WAVES, "Normal is now the active schedule");
  t.eq(h.game.EASY_WAVES.length, 35, "Easy is untouched by the swap");

  t.eq(h.run("setDifficulty('easy').id"), "easy", "and back");
  t.eq(h.game.WAVES, h.game.EASY_WAVES, "Easy is active again");

  // AN UNKNOWN ID FALLS BACK RATHER THAN LEAVING `WAVES` POINTING AT NOTHING.
  // This is reached from a dropdown and from a string; a throw here would take
  // the sandbox down and an undefined would take the run down four frames later.
  t.eq(h.run("setDifficulty('hard').id"), "easy", "an unknown id falls back");
  t.eq(h.game.WAVES, h.game.EASY_WAVES, "to the default schedule");
  t.eq(h.game.DIFFICULTIES.length, 2,
    "and there are exactly two difficulties -- no Hard, and no placeholder");
});

test("swapping schedule drops the derived timeline with it", function (t) {
  var h = harness.boot();
  // The event cache is keyed on `waveIndex`, which is 0 in both schedules --
  // so without resetWaveTimeline() the first wave of Normal would deploy the
  // first wave of Easy's bodies until the cursor happened to move.
  t.eq(h.game.waveEventCount(), h.game.waveCount(h.game.EASY_WAVES[0]),
    "wave 1 of Easy is on the cursor");
  h.run("setDifficulty('normal')");
  t.eq(h.game.waveEventCount(), h.game.waveCount(h.game.NORMAL_WAVES[0]),
    "and wave 1 of Normal is on it the instant the schedule changes");
});

test("restart preserves the difficulty and clears every new run-scoped thing",
function (t) {
  var h = harness.boot("rune-circuit", "normal");
  t.eq(h.game.selectedDifficultyId, "normal", "booted on Normal");
  t.eq(h.game.WAVES, h.game.NORMAL_WAVES, "playing Normal's schedule");

  // Dirty the run: a hazard on a fuse, a suppressed tower, a hastened body.
  h.run("cash = 100000");
  var spot = h.game.Maps.bestSpots(h.game.currentMap, 1)[0];
  var tower = h.placeGunner(spot.x, spot.y);
  h.run("TowerHealth.suppress(towers[0], 'sapper', 6); TowerHealth.stun(towers[0], 2);");
  var body = h.spawnAt(200, undefined, "volatile");
  body.dead = true;
  h.run("Hazards.fromDeath(enemies[enemies.length - 1])");
  var walker = h.spawnAt(300, undefined, "swarm");
  walker.applyHaste(1.3, 4);
  t.eq(h.game.Hazards.count(), 1, "a hazard is armed");
  t.eq(h.game.TowerHealth.isSuppressed(tower, "sapper"), true, "a tower is immune");

  h.run("restartGame()");

  // THE DIFFICULTY SURVIVES. "Restart" means play this route again, and a
  // player who chose Normal and lost did not ask to be put back on Easy.
  t.eq(h.game.selectedDifficultyId, "normal", "the difficulty survived the restart");
  t.eq(h.game.WAVES, h.game.NORMAL_WAVES, "and so did its schedule");

  // AND EVERY NEW PIECE OF RUN STATE IS GONE. A fuse armed in the run that
  // ended would otherwise detonate under towers placed in the run that began.
  t.eq(h.game.Hazards.count(), 0, "no hazard survived");
  t.eq(h.game.towers.length, 0, "no tower survived, so no immunity did either");
  t.eq(h.game.enemies.length, 0, "and no hastened body survived");
  t.eq(h.game.baseHp, h.game.BASE_MAX_HP, "on a clean base");
  t.eq(h.game.waveIndex, 0, "with the cursor back on wave 1");
});

test("the schedule-dependent readouts all follow the active difficulty",
function (t) {
  var easy = harness.boot("rune-circuit", "easy");
  var normal = harness.boot("rune-circuit", "normal");

  // The wave readout. Both schedules are 35 long, so the interesting half is
  // the DEPLOYMENT COUNT -- Easy's wave 1 is five bodies and Normal's is
  // twelve, and the line has to name the wave that is actually arriving.
  t.ok(easy.game.waveStatusText().indexOf("/ 5 deployed") !== -1,
    "Easy's readout counts its own wave 1 (" + easy.game.waveStatusText() + ")");
  t.ok(normal.game.waveStatusText().indexOf("/ 12 deployed") !== -1,
    "Normal's counts its own (" + normal.game.waveStatusText() + ")");

  // The banner, the ceiling and the reward, all off the active schedule.
  t.eq(easy.game.waveSummary(easy.game.WAVES[0]), "5 × Normal", "Easy's banner");
  t.eq(normal.game.waveSummary(normal.game.WAVES[0]), "8 × Normal  +  4 × Fast",
    "Normal's banner");
  t.eq(easy.game.waveTimeRemaining() > 0, true, "Easy's wave 1 has a ceiling");
  t.ok(normal.game.waveReward(normal.game.WAVES[0], 1) !==
    easy.game.waveReward(easy.game.WAVES[0], 1),
    "and the two waves pay different rewards");

  // The run-over overlay's own arithmetic reads WAVES.length, which is 35 in
  // both -- so what is checked here is that it reads the ACTIVE one at all.
  t.eq(normal.game.WAVES.length, normal.game.NORMAL_WAVES.length,
    "the overlay's denominator is the active schedule's length");

  // And the last wave is the last wave of whichever schedule is running.
  t.eq(easy.game.WAVES[34], easy.game.EASY_WAVES[34], "Easy ends on Easy's finale");
  t.eq(normal.game.WAVES[34], normal.game.NORMAL_WAVES[34],
    "Normal ends on Normal's");
});

test("both schedules are deployable, and wave 35 is the only one without a ceiling",
function (t) {
  var h = schedulesBoot();
  h.game.DIFFICULTIES.forEach(function (difficulty) {
    t.deep(h.game.validateWaveTimelines(difficulty.waves), [],
      difficulty.name + " deploys every body it authors");

    var problems = [];
    difficulty.waves.forEach(function (wave, i) {
      var ev = h.game.waveTimeline(wave);
      var last = ev[ev.length - 1].time;
      var isLast = i === difficulty.waves.length - 1;
      if (isLast) {
        if (wave.duration !== undefined) {
          problems.push("wave 35 carries a ceiling");
        }
        return;
      }
      if (wave.duration === undefined) {
        problems.push("wave " + (i + 1) + " has no ceiling");
      } else if (!(wave.duration > last)) {
        problems.push("wave " + (i + 1) + ": ceiling " + wave.duration +
          " s does not outlast its last arrival at " + last.toFixed(2) + " s");
      }
    });
    t.eq(problems.join(" | "), "",
      difficulty.name + "'s ceilings all outlast their waves, and only its " +
      "last wave has none");
  });
});

test("Normal's camo checks hold nothing visible on the ground", function (t) {
  var h = schedulesBoot();
  var Enemy = h.game.Enemy;
  // THE SMASHER RULE, restated for a second schedule. Its swing damages
  // whatever it physically reaches but it will not TURN towards something it
  // cannot see -- so a camo wave must hold nothing a detectionless,
  // ground-bound board could start swinging at. A FLYER is not such a thing:
  // Targeting.sees fails closed on flight as well, so a Warbringer with neither
  // detection nor air reach has nothing to trigger on in wave 33 either.
  var problems = [];
  h.game.NORMAL_WAVES.forEach(function (wave, i) {
    var groups = h.game.waveGroups(wave);
    var camo = groups.some(function (g) { return !!Enemy.typeOf(g.type).isCamo; });
    if (!camo) return;
    groups.forEach(function (g) {
      var type = Enemy.typeOf(g.type);
      if (type.isCamo || type.isFlying) return;
      problems.push("wave " + (i + 1) + " puts a visible " + type.id +
        " in a camo wave");
    });
  });
  t.eq(problems.join(" | "), "", "no visible ground body walks in a camo wave");

  // And the pure-air check holds nothing on the ground, for the mirror reason.
  var air = h.game.waveGroups(h.game.NORMAL_WAVES[23]).filter(function (g) {
    return !Enemy.typeOf(g.type).isFlying;
  });
  t.eq(air.length, 0, "wave 24 is flight end to end");
});

test("Easy and Normal both run themselves dry and end in a win", function (t) {
  ["easy", "normal"].forEach(function (id) {
    var h = harness.boot(null);
    h.chooseMap(h.game.Maps.DEFAULT_ID, id);
    t.eq(h.game.selectedDifficultyId, id, id + ": selected");

    // An oversized base, so every body leaks and the run is decided by the
    // scheduler rather than by damage. Nothing is built and nothing is clicked.
    h.run("BASE_MAX_HP = 4000000; baseHp = 4000000;");
    var opening = h.game.cash;

    for (var i = 0; i < 60 * 60 * 90 && !h.game.victory && !h.game.gameOver; i++) {
      h.step(1 / 60);
    }
    t.eq(h.game.victory, true, id + ": the campaign ends in a win, unattended");
    t.eq(h.game.enemies.length, 0, id + ": on an empty road");
    t.eq(h.game.allWavesDeployed, true, id + ": with the schedule exhausted");

    // Exactly the thirty-five clear rewards moved, so no gate paid twice and
    // none was skipped.
    var owed = 0;
    h.game.WAVES.forEach(function (wave, n) { owed += h.game.waveReward(wave, n + 1); });
    t.eq(h.game.cash - opening, owed, id + ": paid exactly its 35 rewards");
    t.eq(h.game.pendingBounty, 0, id + ": with nothing left owed");
  });
});

test("both endings offer a way back to the main menu", function (t) {
  ["gameOver", "victory"].forEach(function (ending) {
    var h = harness.boot();
    h.run(ending + " = true");
    h.draw();                               // the button must draw, not just exist

    var r = resultRect(h, "menu");
    h.click(r.x + r.w / 2, r.y + r.h / 2);

    t.eq(h.game.screen, "menu", "the " + ending + " overlay reaches the title menu");
  });
});

test("Escape leaves a finished run, and the other two buttons still work", function (t) {
  var h = harness.boot();

  h.run("gameOver = true");
  h.key("Escape");
  t.eq(h.game.screen, "menu", "Escape leaves once the run is over");

  // Escape is the safe key that never leaves a LIVE run -- it opens the pause
  // menu instead. That distinction is the whole reason it can be used here.
  var live = harness.boot();
  live.key("Escape");
  t.eq(live.game.screen, "play", "but a live run only pauses");
  t.eq(live.game.paused, true, "into the pause menu");

  // The two older buttons are untouched by the third.
  var a = harness.boot();
  a.run("gameOver = true");
  var restart = resultRect(a, "restart");
  a.click(restart.x + restart.w / 2, restart.y + restart.h / 2);
  t.eq(a.game.gameOver, false, "Restart still restarts");
  t.eq(a.game.screen, "play", "and stays in the run");

  var b = harness.boot();
  b.run("gameOver = true");
  var route = resultRect(b, "route");
  b.click(route.x + route.w / 2, route.y + route.h / 2);
  t.eq(b.game.screen, "select", "Choose another route still reaches the chooser");
});

// The three rectangles must not overlap, or the wrong thing happens on a
// screen the player usually arrives at by losing.
test("the three run-over buttons do not overlap", function (t) {
  var h = harness.boot();
  var rects = [
    resultRect(h, "restart"),
    resultRect(h, "route"),
    resultRect(h, "menu")
  ];

  for (var i = 0; i < rects.length; i++) {
    for (var j = i + 1; j < rects.length; j++) {
      var a = rects[i], b = rects[j];
      var apart = a.x + a.w <= b.x || b.x + b.w <= a.x ||
                  a.y + a.h <= b.y || b.y + b.h <= a.y;
      t.ok(apart, "buttons " + i + " and " + j + " are clear of each other");
    }
    t.ok(rects[i].y + rects[i].h <= h.game.VIEW_HEIGHT,
      "button " + i + " fits on the canvas");
  }
});

test("a leak removes exactly the enemy's remaining health from the base", function (t) {
  var h = harness.boot();
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []");
  var e = h.spawnAt(h.game.path.length, 4);
  e.takeDamage(1);

  h.step(1 / 60);
  t.eq(h.game.baseHp, 97, "base HP after a 3 HP leak");
  t.eq(h.game.enemies.length, 0, "leaked enemy removed");
});

test("zero base HP loses the game and freezes simulation", function (t) {
  var h = harness.boot();
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []; baseHp = 3");
  var survivor = h.spawnAt(w(h, 0), 3);
  h.spawnAt(h.game.path.length, 4);

  h.step(1 / 60);
  t.eq(h.game.baseHp, 0, "base HP clamps at zero");
  t.eq(h.game.gameOver, true, "loss state");

  var frozenProgress = survivor.progress;
  h.step(5);
  t.eq(survivor.progress, frozenProgress, "enemy movement after loss");
});

test("the restart button restores a clean run", function (t) {
  var h = harness.boot();
  h.run("cash = 99; baseHp = 1; waveIndex = WAVES.length; enemies = []; bullets = []");
  h.placeGunner(w(h, 600), w(h, 505));
  h.spawnAt(h.game.path.length, 4);
  h.step(1 / 60);
  t.eq(h.game.gameOver, true, "lost before restart");

  var r = resultRect(h, "restart");
  h.click(r.x + r.w / 2, r.y + r.h / 2);

  t.eq(h.game.gameOver, false, "loss cleared");
  t.eq(h.game.baseHp, 100, "base restored");
  t.eq(h.game.cash, 600, "cash restored");
  t.eq(h.game.towers.length, 0, "towers cleared");

  // A restart is a run STARTING, so it opens on the ten-second pause like any
  // other -- it does not inherit the old run's road. Until 2026-07-31 this
  // asserted an enemy was already walking here.
  t.eq(h.game.enemies.length, 0, "nothing on the road yet");
  t.eq(Math.round(h.game.waveCountdown), 10, "wave 1 is ten seconds out");
  t.eq(h.game.waveIndex, 0, "and it is wave 1, not wave 2");

  h.step(10.1);
  t.eq(h.game.enemies.length, 1, "which then walks in on its own");
  t.eq(h.game.enemies[0].health, 4, "restarted wave 1 enemy health");
});



// --- difficulty tiers, removed ----------------------------------------------
//
// COVERAGE DELIBERATELY REMOVED, 2026-08-12. Two tests lived here:
// "Easy stays original; Normal and Hard are progressively tougher schedules"
// and "the run chooser selects a difficulty and restart keeps it".
//
// Both PASSED. They were not repaired, because the thing they asserted has been
// deleted: Diego ruled Normal and Hard unfinished placeholders -- added in a
// few seconds and forgotten -- and Easy is the only schedule. A test kept alive
// past its subject by being weakened is a green test carrying a false claim,
// which is the exact failure this suite spent the day removing.
//
// Easy's own properties are not lost with them. The schedule's shape, totals
// and thirty-five waves are pinned by the "waves and base" tests above, which
// never went through the difficulty registry to reach them.

test("auto-send keeps its three seconds through a cleared board", function (t) {
  var h = harness.boot();
  h.run("autoSkipWaves = true");

  h.step(3.2);
  h.run("enemies.forEach(function (e) { e.dead = true; })");
  h.step(1 / 60);

  t.ok(h.game.waveCountdown <= 3,
    "three, not five (" + h.game.waveCountdown.toFixed(2) + ")");
});

// A SCHEDULED BODY MUST REACH THE BOARD CARRYING WHAT THE SCHEDULE DECLARED.
//
// This exists because its absence hid a real defect for the life of the
// project. `spawnScheduledEnemy` called `spawnEnemy` with four arguments where
// it takes five, so the group's `tier` was dropped on the floor and wave 25's
// authored T3 Fractal Slime arrived as a T1 -- 4 HP instead of 64. Every suite
// stayed green throughout, and stayed green when it was fixed, because nothing
// anywhere asserted the link between the declaration and the body.
//
// The two tests that look like they cover this do not:
//   - the fractal_slime TYPE row test pins the DATA, not the scheduler.
//   - the AoE/pierce tests construct `new Enemy(..., { tier: 2 })`, passing the
//     tier in by hand. A test that supplies the tier itself cannot see a caller
//     that fails to supply it, which is exactly where the bug was.
// So this drives the REAL `spawnScheduledEnemy()` and reads the body back.
//
// Easy only. Normal and Hard are unfinished placeholder schedules and their
// wave 25 declares no tier at all, so they would prove nothing here.
// THE CAMPAIGN SCHEDULES NO FRACTAL SLIME SINCE 2026-08-29, and the three tests
// below are not about the campaign. They are about the SCHEDULER: that it hands
// a group's `tier` to the body it builds, that it mints a wave number, and that
// a wave stays open on bodies it never emitted. The Fractal Slime is the only
// body in the game that can prove any of that -- it is the one type whose
// health comes from a tier and the one that makes children out of itself -- so
// these build the wave they need instead of borrowing one.
//
// The real wave 25 with a T3 root put back on the end of it, at the `at` the
// campaign used to send it at. Wave 25 is still wave 25 and still carries its
// other 35 bodies, so every number these tests assert -- the spawn cursor, the
// 25, the 84 descendants -- means exactly what it meant when the root was
// authored there. EASY_WAVES itself is not touched: WAVES is repointed at a
// copy, and only this test's game sees it.
function scheduleFractalIntoWave25(h) {
  h.run("WAVES = EASY_WAVES.slice();" +
        "WAVES[24] = { duration: EASY_WAVES[24].duration," +
        "  groups: waveGroups(EASY_WAVES[24]).concat([" +
        "    { at: 15, count: 1, interval: 1, type: 'fractal_slime', tier: 3 }" +
        "  ]) };");
}

test("a scheduled fractal slime reaches the board at its declared tier", function (t) {
  var h = harness.boot("null-meridian");
  scheduleFractalIntoWave25(h);

  // Find the group rather than typing its cursor: it is the last group of the
  // wave today, and that moves if the wave is edited.
  var found = h.run("(function () {" +
    "  var groups = waveGroups(WAVES[24]);" +
    "  var cursor = 0;" +
    "  for (var i = 0; i < groups.length; i++) {" +
    "    if (groups[i].type === 'fractal_slime')" +
    "      return { cursor: cursor, tier: groups[i].tier, count: groups[i].count };" +
    "    cursor += groups[i].count;" +
    "  }" +
    "  return null; })()");
  t.ok(found !== null, "the fixture's wave 25 declares a fractal slime group");
  t.eq(found.tier, 3, "declared at tier 3");

  var body = h.run("(function () {" +
    "  enemies.length = 0; bullets.length = 0;" +
    "  waveIndex = 24; waveSpawned = " + found.cursor + ";" +
    "  spawnScheduledEnemy();" +
    "  var e = enemies[0];" +
    "  return e ? { type: e.type && e.type.id, maxHealth: e.maxHealth," +
    "               fractalTier: e.fractalTier, bounty: e.bounty() } : null; })()");
  t.ok(body !== null, "the scheduled beat put a body on the board");

  // 64, not 4. An untiered slime is 4 HP, so this single number is the whole
  // difference between the fix being present and absent.
  t.eq(body.type, "fractal_slime", "the declared type arrived");
  t.eq(body.maxHealth, 64, "at the tier's health, not the untiered 4");
  t.eq(body.fractalTier, 3, "carrying the declared tier itself");
  t.eq(body.bounty, 32, "and worth the tier's bounty");

  // THE STRONGEST OF THE FOUR. A health number could be right by coincidence --
  // a generation count cannot. 84 bodies is 4 T2 + 16 T1 + 64 T0, which only a
  // genuinely tiered root can produce; a T1 root leaves 4 and a T0 leaves none.
  // Driven through the game's own death sweep in update(), not by calling
  // splitOnDeath directly, so the scoring and removal path is the real one.
  var brood = h.run("(function () {" +
    "  var seen = 0, guard = 0;" +
    "  while (enemies.length > 0 && guard++ < 40) {" +
    "    for (var i = 0; i < enemies.length; i++) enemies[i].takeDamage(1e9);" +
    "    var before = enemies.slice();" +
    "    update(FIXED_STEP);" +
    "    for (var j = 0; j < enemies.length; j++)" +
    "      if (before.indexOf(enemies[j]) === -1) seen++;" +
    "  }" +
    "  return { descendants: seen, left: enemies.length }; })()");
  t.eq(brood.descendants, 84, "84 descendants: 4 T2, 16 T1 and 64 T0");
  t.eq(brood.left, 0, "and the board empties");
});

// --- wave identity ----------------------------------------------------------
//
// Every body on the road knows which wave it came from, and that number is what
// ends a wave. The six tests below are one claim each, in the order the number
// travels: it is MINTED by the scheduler, it is INHERITED by everything a body
// makes, an INHERITOR alone HOLDS ITS WAVE OPEN, it is what CLOSES a wave, it is
// deliberately NOT what wins the run -- and no place in js/ that builds an enemy
// out of another one may forget to pass it on.
//
// Written 2026-08-25 with the change. There was nothing here before, because
// before this there was nothing to identify: the wave ended when the ROAD was
// empty, so a wave-29 Brute could hold wave 30's reward hostage and no suite
// could tell the difference between that and wave 30 not being beaten.

test("a scheduled body carries its wave's number, and its cascade keeps it", function (t) {
  var h = harness.boot("null-meridian");
  scheduleFractalIntoWave25(h);

  // The same group again, found rather than typed for the same reason the tier
  // test above finds it: the cursor moves if the wave is edited, and a test
  // that hard-codes 35 would go quietly green on the wrong body.
  var cursor = h.run("(function () {" +
    "  var groups = waveGroups(WAVES[24]);" +
    "  var at = 0;" +
    "  for (var i = 0; i < groups.length; i++) {" +
    "    if (groups[i].type === 'fractal_slime') return at;" +
    "    at += groups[i].count;" +
    "  }" +
    "  return -1; })()");
  t.ok(cursor >= 0, "the fixture's wave 25 declares a fractal slime group");

  var stamped = h.run("(function () {" +
    "  enemies.length = 0; bullets.length = 0;" +
    "  waveIndex = 24; waveSpawned = " + cursor + ";" +
    "  spawnScheduledEnemy();" +
    "  return enemies[0] ? enemies[0].waveId : null; })()");

  // 25, NOT 24. The identity is the number the player is shown, and the array
  // index is one less than it -- an off-by-one here would put every body in the
  // wave before its own and close each wave exactly one wave too late.
  t.eq(stamped, 25, "the wave-25 slime is stamped 25, not its array index");

  // Then the whole cascade, five generations of it, driven through the game's
  // own death sweep. 84 descendants is the number the tier test pins; what this
  // one adds is that not ONE of them lost the origin on the way down. A
  // spot-check of the first generation would not have caught a splitOnDeath
  // that copied the field only when the parent was itself scheduled.
  var cascade = h.run("(function () {" +
    "  var seen = 0, wrong = 0, guard = 0;" +
    "  while (enemies.length > 0 && guard++ < 40) {" +
    "    for (var i = 0; i < enemies.length; i++) enemies[i].takeDamage(1e9);" +
    "    var before = enemies.slice();" +
    "    update(FIXED_STEP);" +
    "    for (var j = 0; j < enemies.length; j++) {" +
    "      if (before.indexOf(enemies[j]) !== -1) continue;" +
    "      seen++;" +
    "      if (enemies[j].waveId !== 25) wrong++;" +
    "    }" +
    "  }" +
    "  return { seen: seen, wrong: wrong }; })()");
  t.eq(cascade.seen, 84, "all 84 descendants were born");
  t.eq(cascade.wrong, 0, "and not one of them lost the 25");
});

test("a brood and a summon inherit the wave of whatever made them", function (t) {
  var h = harness.boot("null-meridian");

  // A Hive minted by the REAL scheduler -- wave 26 is the Hive wave -- and then
  // asked for its brood directly. spawnMinions() is called by hand rather than
  // waited out because its timer is seven seconds and the scheduler would have
  // deployed most of wave 26 by then; the propagation this is about happens in
  // that one call either way.
  var hive = h.run("(function () {" +
    "  enemies.length = 0; bullets.length = 0;" +
    "  waveIndex = 25; waveSpawned = 0;" +
    "  spawnScheduledEnemy();" +
    "  var parent = enemies[0];" +
    "  var brood = parent.spawnMinions(99) || [];" +
    "  var wrong = 0;" +
    "  for (var i = 0; i < brood.length; i++)" +
    "    if (brood[i].waveId !== parent.waveId) wrong++;" +
    "  return { type: parent.typeId, wave: parent.waveId," +
    "           count: brood.length, wrong: wrong }; })()");
  t.eq(hive.type, "hive", "wave 26 is still the Hive wave");
  t.eq(hive.wave, 26, "the scheduled Hive is a wave-26 body");
  t.ok(hive.count > 0, "and it dropped a brood (" + hive.count + ")");
  t.eq(hive.wrong, 0, "every hatchling carries the 26 too");

  // The wave-35 boss's roar, and the Hive INSIDE that roar. Two generations
  // away from anything the scheduler ever touched, which is the case a
  // one-level check misses: the roar's Hive is created by summon() and its
  // hatchlings by spawnMinions(), so the number has to survive both hops.
  var roar = h.run("(function () {" +
    "  enemies.length = 0; bullets.length = 0;" +
    "  var boss = new Enemy(path, undefined, 'boss', { waveId: 35 });" +
    "  var phases = Enemy.TYPES.boss.phases || [];" +
    "  var spec = null;" +
    "  for (var i = 0; i < phases.length; i++)" +
    "    if (phases[i].summon) { spec = phases[i].summon; break; }" +
    "  if (!spec) return null;" +
    "  var called = boss.summon(spec);" +
    "  var wrong = 0, hives = 0, hatched = 0, hatchWrong = 0;" +
    "  for (var j = 0; j < called.length; j++) {" +
    "    if (called[j].waveId !== 35) wrong++;" +
    "    if (called[j].typeId !== 'hive') continue;" +
    "    hives++;" +
    "    var brood = called[j].spawnMinions(99) || [];" +
    "    for (var k = 0; k < brood.length; k++) {" +
    "      hatched++;" +
    "      if (brood[k].waveId !== 35) hatchWrong++;" +
    "    }" +
    "  }" +
    "  return { called: called.length, wrong: wrong, hives: hives," +
    "           hatched: hatched, hatchWrong: hatchWrong }; })()");
  t.ok(roar !== null, "the boss still has a phase that summons");
  t.ok(roar.called > 0, "the roar calls bodies in (" + roar.called + ")");
  t.eq(roar.wrong, 0, "and every one of them is a wave-35 body");
  t.ok(roar.hives > 0, "the roar includes at least one Hive");
  t.ok(roar.hatched > 0, "which hatches a brood of its own");
  t.eq(roar.hatchWrong, 0, "and the brood is wave 35 as well, two hops out");
});

// INHERITING THE NUMBER AND BEING HELD OPEN BY IT ARE TWO DIFFERENT FACTS, and
// the test above only proves the first. A splitOnDeath that stamped its children
// correctly would still pass it while waveStillOnTheRoad scanned something else
// -- the scheduler's own emitted count, say -- and the wave would close over a
// cascade that is demonstrably wearing its number. This is the one that fails in
// that case: the only body left alive is one the scheduler NEVER MADE.
test("a wave stays open while a body it never scheduled is still walking",
function (t) {
  var h = harness.boot("null-meridian");
  scheduleFractalIntoWave25(h);

  // The fixture's wave 25 ends on a T3 Fractal Slime at `at: 15`. Deployed by
  // the real clock rather than by writing `waveSpawned`, because the claim is
  // about the gate that runs inside update() and a hand-placed cursor would let
  // this go green against a scheduler that never ran.
  h.run("enemies.length = 0; bullets.length = 0; baseHp = 1000000;" +
        "waveIndex = 24; waveSpawned = 0; waveElapsed = 0; waveCountdown = 0;");
  for (var i = 0; i < 120 * 60 && !h.run("waveFullyDeployed()"); i++) {
    h.step(1 / 60);
  }
  t.ok(h.run("waveFullyDeployed()"), "wave 25 has finished arriving");

  // Everything except one Fractal Slime dies. `noBounty` throughout so no
  // assertion below is ever about cash -- this test is about the gate, and the
  // payout has three tests of its own.
  var kept = h.run("(function () {" +
    "  var found = false;" +
    "  for (var i = 0; i < enemies.length; i++) {" +
    "    var e = enemies[i];" +
    "    if (!found && e.typeId === 'fractal_slime') { found = true; continue; }" +
    "    e.noBounty = true; e.dead = true;" +
    "  }" +
    "  return found; })()");
  t.ok(kept, "the fixture's wave 25 put a Fractal Slime on the road");
  h.step(1 / 60);
  t.eq(h.game.enemies.length, 1, "one slime is left, and nothing else");
  t.eq(h.game.enemies[0].waveId, 25, "wearing wave 25's number");
  t.eq(h.game.waveIndex, 24, "so wave 25 is not over");

  // The scheduled body dies. From here on NOTHING on the road was put there by
  // the scheduler: every body is a child of a child, and the wave has to stay
  // open on their account alone.
  var born = h.run("(function () {" +
    "  enemies[0].noBounty = true; enemies[0].dead = true;" +
    "  update(FIXED_STEP);" +
    "  var mine = 0;" +
    "  for (var i = 0; i < enemies.length; i++) {" +
    "    if (enemies[i].waveId === 25) mine++;" +
    "  }" +
    "  return { total: enemies.length, mine: mine, index: waveIndex }; })()");
  t.eq(born.total, 4, "the T3 divides into four T2s");
  t.eq(born.mine, 4, "all four are wave-25 bodies the scheduler never emitted");
  t.eq(born.index, 24,
    "and the wave is still open on the very frame its last scheduled body died");

  // The whole cascade, four generations of it, and the wave closing at the end
  // of it rather than at the start.
  var end = h.run("(function () {" +
    "  var guard = 0;" +
    "  while (enemies.length > 0 && guard++ < 40) {" +
    "    for (var i = 0; i < enemies.length; i++) {" +
    "      enemies[i].noBounty = true;" +
    "      enemies[i].takeDamage(1e9);" +
    "    }" +
    "    update(FIXED_STEP);" +
    "  }" +
    "  return { left: enemies.length, index: waveIndex," +
    "           countdown: waveCountdown }; })()");
  t.eq(end.left, 0, "the cascade unwinds to nothing");
  t.eq(end.index, 25, "and ONLY then is wave 25 closed");
  t.ok(end.countdown > 0 && end.countdown <= 5,
    "with wave 26 five seconds out (" + end.countdown.toFixed(2) + ")");
});

// THE FAILURE MODE OF THIS WHOLE SECTION IS A SITE NOBODY REMEMBERED, not a
// site that got it wrong. The three tests above drive the three places in
// js/enemy.js that build an enemy out of another enemy -- spawnMinions,
// splitOnDeath and summon -- and they would all stay green if a FOURTH were
// added tomorrow and shipped without the field: its bodies would silently wear
// waveId 0, hold nothing open, and close their parent's wave over their heads.
// Nothing on the road would look wrong, which is exactly why this one reads the
// source instead of the simulation.
//
// The rule it enforces is deliberately coarse -- the function that calls
// `new Enemy(` must MENTION `waveId` -- because the precise rule is not
// checkable from text: spawnMinions passes a `born` object built ten lines
// earlier, splitOnDeath and summon pass an inline literal, and a checker that
// insisted on one shape would have failed the day the other was written. What
// this cannot be is silent, and a new site that never says the word is the case
// it is here for.
//
// js/codex.js is the one exemption, and it is an exemption rather than an
// oversight: its sprites are parked in a panel, never in `enemies`, and
// stamping them would give the codex the power to hold a wave open. The
// allowlist is asserted to be LIVE, so deleting that call site leaves a stale
// entry behind that this test complains about.
test("every place in js/ that builds an enemy from another one passes the origin on",
function (t) {
  var fs = require("fs");
  var nodePath = require("path");

  // Not on the road, therefore no origin. Anything added here needs the same
  // sentence written next to it.
  var EXEMPT = {
    "codex.js": "parked panel sprites, never pushed into `enemies`"
  };

  var root = nodePath.join(__dirname, "..", "js");
  var files = [];
  (function walk(dir) {
    fs.readdirSync(dir).forEach(function (name) {
      var full = nodePath.join(dir, name);
      if (fs.statSync(full).isDirectory()) return walk(full);
      if (/\.js$/.test(name)) files.push(full);
    });
  })(root);
  t.ok(files.length > 100, "the scan found js/ (" + files.length + " files)");

  // Where one function ends and the next begins, in this repo's ES5 style:
  // `function name(`, `Enemy.prototype.name = function` and `var name =
  // function` are the three forms js/ actually uses at top level.
  var HEAD = /^(?:function\s+[\w$]+|[\w$.]+\s*=\s*function|var\s+[\w$]+\s*=\s*function)/;

  var sites = [];
  files.forEach(function (file) {
    var lines = fs.readFileSync(file, "utf8").split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("new Enemy(") === -1) continue;
      var start = i;
      while (start > 0 && !HEAD.test(lines[start])) start--;
      var end = i + 1;
      while (end < lines.length && !HEAD.test(lines[end])) end++;
      sites.push({
        file: nodePath.relative(root, file),
        line: i + 1,
        carries: lines.slice(start, end).join("\n").indexOf("waveId") !== -1
      });
    }
  });

  // Four is what ships today: three in enemy.js and spawnEnemy in game.js, plus
  // the exempt one in codex.js. A floor rather than an equality, so adding a
  // creation site is not by itself a failure -- forgetting the origin in it is.
  t.ok(sites.length >= 4,
    "found the enemy creation sites (" + sites.length + ")");

  var missing = sites.filter(function (s) {
    return !s.carries && !EXEMPT[s.file];
  }).map(function (s) { return s.file + ":" + s.line; });
  t.deep(missing, [],
    "every non-exempt `new Enemy(` sits in a function that speaks about waveId");

  // A stale exemption is a hole in the check, so the allowlist has to keep
  // earning its place.
  var unused = Object.keys(EXEMPT).filter(function (file) {
    return !sites.some(function (s) { return s.file === file; });
  });
  t.deep(unused, [], "no exemption outlives the call site it was written for");
});

test("a straggler from an earlier wave does not hold the next wave open", function (t) {
  var h = harness.boot();

  h.step(3.2);
  t.ok(h.run("waveFullyDeployed()"), "wave 1 is fully deployed");

  // One wave-1 body that will never leave, and the other four gone. Rooting
  // uses the same flag a revived Revenant sets, so this is a shape the shipping
  // game actually produces.
  h.run("enemies[0].rooted = true;" +
        "enemies.forEach(function (e, i) { if (i > 0) e.dead = true; })");
  h.step(1 / 60);
  t.eq(h.game.enemies.length, 1, "one wave-1 straggler left on the road");
  t.eq(h.game.waveIndex, 0,
    "wave 1 is NOT closed while its own body walks");
  t.ok(h.game.waveCountdown <= 0, "so nothing is called in behind it");

  // Send wave 2 in and let it deploy in full. Through skipNextWave rather than
  // by writing the countdown, because a wave now has to be ENDED before there
  // is a countdown to write.
  h.run("skipNextWave()");
  h.run("waveCountdown = 0.01");
  h.step(8);
  t.ok(h.run("waveFullyDeployed()"), "wave 2 is fully deployed");
  t.eq(h.game.waveIndex, 1, "and is the wave in play");
  t.eq(h.run("enemies.filter(function (e) { return e.waveId === 1; }).length"), 1,
    "and the wave-1 straggler is still walking through it");

  // THE CLAIM. Wave 2 dies; wave 1's body does not. Under the old whole-board
  // test this paid nothing and called nothing in, and the player had no way to
  // see which body was doing it.
  // `noBounty` on the way out so the delta below is the CLEAR reward alone --
  // eight dying normals also pay $3 each, and $230 reads as a passing $206 to
  // nobody but is exactly the kind of near-miss that makes a test get relaxed.
  var before = h.game.cash;
  h.run("enemies.forEach(function (e) {" +
        "  if (e.waveId === 2) { e.noBounty = true; e.dead = true; } })");
  h.step(1 / 60);
  t.eq(h.run("enemies.filter(function (e) { return e.waveId === 1; }).length"), 1,
    "the straggler survives its own removal being irrelevant");
  t.eq(h.game.cash - before, h.game.waveReward(h.game.WAVES[1], 2),
    "wave 2's clear bounty is paid");
  t.eq(h.game.waveIndex, 2, "wave 2 is closed and wave 3 is next");
  t.ok(h.game.waveCountdown <= 5 && h.game.waveCountdown > 0,
    "and wave 3 is called in five seconds out (" +
    h.game.waveCountdown.toFixed(2) + ")");
});

test("the win waits for the whole road, not just for the last wave", function (t) {
  var h = harness.boot();

  // The schedule exhausted, with one body left over from wave 3 -- the shape a
  // long Fractal Slime cascade or a 90 s ceiling leaves behind. `waveIndex` is
  // pushed past the end AND `allWavesDeployed` set by hand, because the flag is
  // deliberately not implied by the index (see spawnScheduledEnemy).
  h.run("(function () {" +
    "  enemies.length = 0; bullets.length = 0;" +
    "  waveIndex = WAVES.length; waveSpawned = 0; waveCountdown = 0;" +
    "  pendingBounty = 0; pendingBountyWave = 0;" +
    "  allWavesDeployed = true;" +
    "  var e = new Enemy(path, 1000, 'normal', { waveId: 3 });" +
    "  e.rooted = true;" +
    "  enemies.push(e); })()");

  h.step(1 / 60);
  t.eq(h.game.victory, false,
    "a wave-3 straggler keeps the victory screen away");

  // This is the asymmetry, stated: the transition test asks about ONE wave, the
  // win asks about the ROAD. `waveStillOnTheRoad(35)` would already be false
  // here and would have handed the player the win over the straggler's head.
  t.eq(h.run("waveStillOnTheRoad(WAVES.length)"), false,
    "even though nothing from the last wave is left");

  h.run("enemies.forEach(function (e) { e.dead = true; })");
  h.step(1 / 60);
  t.eq(h.game.victory, true, "the road empties and the run is won");
});

// --- the wave HUD -----------------------------------------------------------
//
// What the corner says about the wave, and when the Send button is real. These
// are DISPLAY tests, and they exist because the stub canvas records nothing:
// every string below is built by a named function precisely so a suite can read
// it, and a readout no suite reads is one that drifts from what it describes.
//
// The button tests are the load-bearing half. A button that is drawn and a
// button that is clickable are two different facts in a canvas game, and the
// expensive direction is not "invisible and dead" -- it is INVISIBLE AND LIVE:
// a 168x30 rectangle of open map, near the top-left where a player builds
// early, silently eating the click that was meant to put a tower there. That
// is not hypothetical arithmetic about a predicate, so the tests below do not
// assert on the predicate: they sweep the whole rectangle, ask the game's own
// chrome test, and then actually build.

test("the readout names the wave, how much of it is out, and its time limit",
  function (t) {
    var h = harness.boot();

    // Wave 1 is deploying on the frame boot() hands back.
    var line = h.run("waveStatusText()");
    t.ok(/^Wave 1 \/ 35\b/.test(line), "the wave and the length of the run: " + line);
    t.ok(/\d+ \/ 5 deployed/.test(line), "and how much of it is on the road");
    t.ok(/ 32 s left$/.test(line),
      "and wave 1's authored 32 s ceiling, untouched: " + line);

    // The clock is the wave's, not the run's: it runs while the wave is on the
    // road, and the number in the corner is what it is counting.
    h.step(2);
    t.ok(/ 30 s left$/.test(h.run("waveStatusText()")),
      "two seconds later it says 30: " + h.run("waveStatusText()"));

    // It counts from the FIRST SPAWN, not from the end of the break -- so a
    // wave called in early has the same 32 seconds as one that waited out its
    // ninety, which is the whole reason `duration` is on the wave.
    t.ok(Math.abs(h.game.waveElapsed - 2) < 0.05,
      "and the clock reads the elapsed wave time, " + h.game.waveElapsed);

    // FULLY DEPLOYED IS NOT OVER, and the deployment count is how the corner
    // says so. Wave 1's five bodies are all out at 3.2 s and its window runs to
    // 32 s: the line reads "5 / 5 deployed" with twenty-nine seconds still on
    // it, which under the sequential scheduler was an impossible sentence --
    // the wave ended on its last body and the corner switched to the break.
    //
    // It is also the only thing on screen that explains why the Send button
    // just appeared, which is why the count is worth its space at all rather
    // than being dropped for a tidier line.
    h.step(1.3);
    var out = h.run("waveStatusText()");
    t.ok(/ 5 \/ 5 deployed/.test(out), "every body is out: " + out);
    t.ok(/ 29 s left$/.test(out), "with the wave's window still running: " + out);
    t.ok(h.run("waveInPlay()"), "so wave 1 is still the wave in play");
    t.ok(h.run("waveSendAvailable()"), "and the button is up, as the count says");
  });

test("the wave clock reads zero until a wave puts something on the road",
  function (t) {
    // Driven from the OPENING PAUSE rather than from a mid-run break, on
    // purpose. Both are moments with no wave on the clock, but the opening one
    // is a moment in every model of the scheduler: the pause before wave 1 is
    // not part of wave 1's timer, and it never will be. A mid-run break would
    // have pinned this test to the sequential scheduler's idea of when a wave
    // stops being in play, which the timeline scheduler moves.
    var h = harness.boot(null);
    h.chooseMap(h.game.Maps.DEFAULT_ID);

    t.eq(h.game.waveElapsed, 0, "nothing has walked, so the clock is zero");
    h.step(9);
    t.eq(h.game.waveElapsed, 0,
      "and nine seconds of the opening pause add nothing to it: " +
      "the pause is not part of wave 1");
    t.eq(h.game.waveSpawned, 0, "with wave 1 still to come");

    // The first body starts it, and from then on it is simulation time.
    h.step(1.5);
    t.ok(h.game.waveSpawned > 0, "wave 1 is deploying");
    t.ok(h.game.waveElapsed > 0.4 && h.game.waveElapsed < 0.6,
      "and the clock started at that first body, not at the click: " +
      h.game.waveElapsed);
  });

test("a transition shows the countdown it is actually running", function (t) {
  var h = harness.boot(null);
  h.chooseMap(h.game.Maps.DEFAULT_ID);

  // The opening pause, end to end through the real scheduler. Ten seconds, and
  // the readout is the same line shape as the other two -- one transition
  // state, three delays.
  t.ok(/^Wave 1 in 10 s$/.test(h.run("waveStatusText()")),
    "the ten second opening: " + h.run("waveStatusText()"));

  // The 3 s a Send buys and the 5 s a wiped-out wave buys, set directly rather
  // than played out. THAT IS THE POINT OF THE TEST: the readout has no opinion
  // about which gate opened a transition, it prints whatever countdown the
  // scheduler is running -- so it cannot claim three seconds while the
  // scheduler runs five. Which gate writes which number is the scheduler's own
  // claim, and "the player can call the next wave in" already pins it.
  h.run("waveIndex = 1; waveSpawned = 0; waveCountdown = WAVE_CALL_DELAY");
  t.eq(h.run("waveStatusText()"), "Wave 2 in 3 s", "a called wave counts three");

  h.run("waveCountdown = WAVE_CLEAR_DELAY");
  t.eq(h.run("waveStatusText()"), "Wave 2 in 5 s", "a cleared wave counts five");

  // Whole seconds, rounded UP, so the last second of a transition is spent
  // reading "1 s" and 0 means it is actually over.
  h.run("waveCountdown = 2.4");
  t.eq(h.run("waveStatusText()"), "Wave 2 in 3 s", "two and a bit reads three");
  h.run("waveCountdown = 0.001");
  t.eq(h.run("waveStatusText()"), "Wave 2 in 1 s",
    "and the last sliver still reads a whole second");

  // ZERO IS NOT A TRANSITION AT ALL. It is the wave in play, and the readout
  // switches to the wave's own line rather than printing "in 0 s" forever --
  // which is exactly what it used to do, because under the sequential scheduler
  // a zero countdown WAS the moment the next wave spawned.
  h.run("waveCountdown = 0");
  t.notOk(h.game.betweenWaves(), "a zero countdown is a wave in play");
  t.ok(/^Wave 2 \/ 35/.test(h.run("waveStatusText()")),
    "so the readout is the wave's own line: " + h.run("waveStatusText()"));
});

test("the final wave says so, and never counts down to a wave 36", function (t) {
  var h = harness.boot();

  // Wave 35 on the road. It is the one wave with no `duration`, and the
  // readout must put a STATE where the timer goes rather than a number -- a
  // "0 s left" or a defaulted ceiling would be a countdown to nothing.
  h.run("waveIndex = WAVES.length - 1; waveSpawned = 3; waveElapsed = 40");
  var line = h.run("waveStatusText()");
  t.ok(/^Wave 35 \/ 35\b/.test(line), "it is named as the last of 35: " + line);
  t.ok(/FINAL WAVE$/.test(line), "and flagged as final");
  t.notOk(/s left/.test(line), "with no timer at all");
  t.eq(h.run("waveTimeRemaining()"), null,
    "because there is no such number: the wave authors no duration");
  t.eq(h.run("WAVES[WAVES.length - 1].duration"), undefined,
    "and nothing materialised a default for it");

  // Past the end of the schedule the line is about the road, not the clock.
  h.run("waveIndex = WAVES.length; waveSpawned = 0");
  t.ok(/^Final wave  ·  \d+ still walking$/.test(h.run("waveStatusText()")),
    "once everything is deployed it counts survivors: " + h.run("waveStatusText()"));
  h.run("enemies = []");
  t.eq(h.run("waveStatusText()"), "Final wave  ·  road clear",
    "and says the road is clear rather than going blank");

  // The transition INTO the final wave still counts, because that one is real.
  h.run("waveIndex = WAVES.length - 1; waveSpawned = 0; waveCountdown = 3");
  t.eq(h.run("waveStatusText()"), "Final wave in 3 s",
    "the arrival of the last wave is a countdown like any other");
});

// The trap, swept rather than reasoned about. `waveSendAvailable()` is the one
// predicate behind the drawing, the click handler and overInterfaceChrome; what
// this checks is the consequence, over every point of the rectangle.
test("while the button is down its rectangle is bare map, and builds", function (t) {
  var h = harness.boot();
  h.run("cash = 1000000");
  var r = h.run("waveSkipButtonRect()");

  function sweepIsClickThrough(what) {
    var claimed = 0;
    for (var x = r.x; x <= r.x + r.w; x += 4) {
      for (var y = r.y; y <= r.y + r.h; y += 4) {
        if (h.run("overInterfaceChrome(" + x + ", " + y + ")")) claimed++;
      }
    }
    t.eq(claimed, 0, what + ": not one point of the rectangle claims a click");
  }

  // 1. MID-WAVE. Wave 1 is deploying, so the wave is not fully out and the
  // button must not exist -- sending wave 2 on top of a wave 1 still walking
  // out of the gate is exactly what "never active before" forbids.
  t.notOk(h.run("waveSendAvailable()"), "wave 1 is deploying, so no button");
  sweepIsClickThrough("mid-wave");

  // Through h.place(), which arms a build slot and goes through the game's own
  // click handler -- not through placeGunner(), which constructs a tower
  // directly and would therefore prove nothing about the click reaching the
  // map. What is being tested here IS the click path.
  var idx = h.game.waveIndex, spawned = h.game.waveSpawned;
  var countdown = h.game.waveCountdown;
  var before = h.game.towers.length;
  t.ok(h.place(r.x + r.w / 2, r.y + r.h / 2, 0) !== null,
    "a real click on the button's rectangle builds there instead");
  t.eq(h.game.towers.length, before + 1, "and the click was not swallowed");
  t.eq(h.game.waveCountdown, countdown, "calling nothing in");
  t.eq(h.game.waveIndex, idx, "moving no wave");
  t.eq(h.game.waveSpawned, spawned, "and spawning nothing");

  // 2. PAST THE END OF THE SCHEDULE. There is no next wave to send, so the
  // whole wave chrome goes -- and this is the state that lasts longest, since
  // the run's final minutes are all spent in it.
  h.run("waveIndex = WAVES.length; waveSpawned = 0; waveCountdown = 0");
  t.notOk(h.run("waveSendAvailable()"), "nothing left to send");
  sweepIsClickThrough("after the last wave deployed");

  // 3. AND WHEN IT IS UP, IT DOES CLAIM THE CLICK. The negative above is only
  // worth having next to this: a predicate that answered false everywhere
  // would pass every sweep and break the button.
  h.run("waveIndex = 1; waveSpawned = 0; waveCountdown = 90");
  t.ok(h.run("waveSendAvailable()"), "the break opens the button");
  t.ok(h.run("overInterfaceChrome(" + (r.x + 4) + ", " + (r.y + 4) + ")"),
    "and now the rectangle claims clicks");
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.waveCountdown, h.game.WAVE_CALL_DELAY,
    "and pressing it brings the wave in three seconds out");

  // 4. THE FINAL WAVE, ON THE ROAD. The state the other two do not reach and
  // the only one where the two halves of the wave chrome DISAGREE:
  // `waveControlsShown()` is true -- the index has not passed the end, so the
  // AUTO toggle beside the speed button is still drawn -- while the Send
  // button is not up. Case 2 above is the easy negative, with BOTH halves off;
  // a rectangle left live there would have to be live for no reason at all.
  // Here one half is up and the other is not, which is the shape that leaves a
  // button drawn nowhere and clickable anyway -- for the minutes wave 35
  // takes, on a board the player is still building on.
  h.run("waveIndex = WAVES.length - 1; waveSpawned = 3; waveElapsed = 20;" +
        "waveCountdown = 0;");
  t.ok(h.run("waveControlsShown()"), "the wave chrome is still up on wave 35");
  t.notOk(h.run("waveSendAvailable()"), "but there is nothing to send");
  sweepIsClickThrough("the final wave, on the road");

  // And through the click handler, not just the chrome test -- at the far end
  // of the rectangle, because the tower built in case 1 still occupies the
  // middle of it and a refusal there would prove nothing about the button.
  idx = h.game.waveIndex; spawned = h.game.waveSpawned;
  before = h.game.towers.length;
  t.ok(h.place(r.x + r.w - 6, r.y + r.h - 6, 0) !== null,
    "a real click at the far end of it builds there too");
  t.eq(h.game.towers.length, before + 1, "and was not swallowed");
  t.eq(h.game.waveIndex, idx, "with the final wave neither sent nor skipped");
  t.eq(h.game.waveSpawned, spawned, "and nothing spawned by the click");

  // AND STILL DOWN WITH THE WHOLE WAVE OUT. On every other wave that is the
  // moment the button appears; on wave 35 there is nothing to send it to.
  //
  // Held by hand because a running game cannot hold it: emitDueSpawns retires
  // the cursor on the last body of the last wave, so `waveIndex` is already
  // past the end by the time anything could ask. That is exactly why this
  // assertion is worth writing down -- the guard in waveSendReady() is the one
  // rule in the button that no driven run can reach, and an untested rule in a
  // predicate three things read is a rule that gets "simplified" away.
  h.run("resetWaveTimeline(); waveSpawned = waveEventCount();");
  t.ok(h.run("waveFullyDeployed()"), "every body wave 35 schedules is out");
  t.notOk(h.run("waveSendAvailable()"), "and there is still no Send");
  sweepIsClickThrough("the final wave, fully deployed");

  // 5. FULLY DEPLOYED, SURVIVORS STILL WALKING. The other new state, and the
  // positive one: case 3 opens the button from a TRANSITION, which is the only
  // way it could ever open before the timeline rewrite. Since the rewrite the
  // button also opens on a wave that is still in play -- every scheduled body
  // out, its `duration` still running, its survivors still on the road -- and
  // a sweep that only ever saw the transition would not notice that half
  // going dark.
  h.run("(function () {" +
        "  waveIndex = 1; waveElapsed = 1; waveCountdown = 0;" +
        "  resetWaveTimeline(); waveSpawned = waveEventCount();" +
        "  enemies.push(new Enemy(path, 10, 'normal', { waveId: 2 }));" +
        "})()");
  t.notOk(h.game.betweenWaves(), "wave 2 is in play, not in a transition");
  t.ok(h.run("waveFullyDeployed()"), "and every body it schedules is out");
  t.ok(h.run("enemies.filter(function (e) { return e.waveId === 2; }).length") > 0,
    "with one of them still walking");
  t.ok(h.run("waveSendAvailable()"), "so the button is up");
  t.ok(h.run("overInterfaceChrome(" + (r.x + 4) + ", " + (r.y + 4) + ")"),
    "and the rectangle claims clicks again");
});

test("a wave summary sums identical salvos and separates unlike ones",
  function (t) {
    var h = harness.boot();

    // The case the schedule actually contains: wave 35 sends its thirty stock
    // Normals as two salvos of fifteen, at 0 s and at 5 s. Same type, same
    // health override, same (absent) tier -- one entry.
    t.eq(h.game.waveSummary(h.game.WAVES[34]),
      "30 × Normal  +  6 × Aether Wisp  +  1 × Tyrant  +  7 × Angry  +  " +
      "4 × Bulwark  +  1 × Colossus",
      "two salvos of fifteen Normals read as thirty");

    // Four and four is eight, not two lines of four.
    t.eq(h.game.waveSummary({ duration: 20, groups: [
      { at: 0, count: 4, interval: 0.5, type: "fast" },
      { at: 6, count: 4, interval: 0.5, type: "fast" }
    ] }), "8 × Fast", "identical salvos add up");

    // ... but only when they are identical. A different `health` is a
    // different body to fight, and `Enemy.typeOf` maps every rung of the
    // Fractal ladder onto one display name, so a name-only key would print a
    // T1 salvo and a T5 salvo -- 4 HP against 1024 -- as one line.
    t.eq(h.game.waveSummary({ duration: 20, groups: [
      { at: 0, count: 4, interval: 0.5, type: "fast" },
      { at: 6, count: 4, interval: 0.5, type: "fast", health: 9 }
    ] }), "4 × Fast  +  4 × Fast", "a health override is a different salvo");

    t.eq(h.game.waveSummary({ duration: 20, groups: [
      { at: 0, count: 4, interval: 0.5, type: "fractal_slime", tier: 1 },
      { at: 6, count: 4, interval: 0.5, type: "fractal_slime", tier: 5 }
    ] }), "4 × Fractal Slime  +  4 × Fractal Slime",
      "and so is a different tier");

    // An ABSENT field is not the default written out. A group with no `health`
    // inherits the type's; one that overrides it with the same number is still
    // a group that says something, and the summary keys on what was authored.
    t.eq(h.game.waveSummary({ duration: 20, groups: [
      { at: 0, count: 4, interval: 0.5, type: "fast" },
      { at: 6, count: 4, interval: 0.5, type: "fast",
        health: h.game.Enemy.TYPES.fast.health }
    ] }), "4 × Fast  +  4 × Fast",
      "an override equal to the default is still an override");

    // Order is first appearance, so the banner reads in the order the player
    // meets things rather than in count order or alphabetically.
    t.eq(h.game.waveSummary({ duration: 20, groups: [
      { at: 0, count: 1, interval: 1, type: "slow" },
      { at: 2, count: 9, interval: 1, type: "fast" },
      { at: 8, count: 1, interval: 1, type: "slow" }
    ] }), "2 × Slow  +  9 × Fast", "first appearance orders the line");

    // AND THE WHOLE SCHEDULE ADDS UP. The cases above are hand-built pairs;
    // this is the one that walks the campaign, and it is here because a
    // summing bug is the kind that stays invisible. A dropped salvo or a
    // double-counted one still prints a line that reads exactly like a wave --
    // "24 × Swarm + 2 × Shieldbearer" is plausible whether or not it is true --
    // so the banner is checked against waveCount(), the number of bodies the
    // scheduler will actually put on the road.
    //
    // Per wave rather than on the 830-body total: two waves wrong by the same
    // amount in opposite directions is not a state anyone should have to
    // reason about, and the totals test already owns the grand sum.
    var mismatched = [];
    h.game.WAVES.forEach(function (wave, i) {
      var printed = h.game.waveSummary(wave).split("  +  ")
        .reduce(function (sum, part) { return sum + parseInt(part, 10); }, 0);
      if (printed !== h.game.waveCount(wave)) {
        mismatched.push("wave " + (i + 1) + ": banner says " + printed +
          ", the wave deploys " + h.game.waveCount(wave));
      }
    });
    t.eq(mismatched.join(" | "), "",
      "every one of the 35 banners totals what its wave deploys");
  });

group("game speed");

test("the corner button cycles 1x, 2x, 3x and back", function (t) {
  var h = harness.boot();
  var r = h.run("speedButtonRect()");
  function press() { h.click(r.x + r.w / 2, r.y + r.h / 2); }

  t.eq(h.game.gameSpeed, 1, "a run starts at normal speed");
  press();
  t.eq(h.game.gameSpeed, 2, "one press doubles it");
  press();
  t.eq(h.game.gameSpeed, 3, "two presses treble it");
  press();
  t.eq(h.game.gameSpeed, 1, "and it wraps back round");
});

test("the speed button consumes its click and does not build under itself", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var r = h.run("speedButtonRect()");
  var towers = h.game.towers.length;

  h.run("selectedSlot = 0");
  h.click(r.x + r.w / 2, r.y + r.h / 2);

  t.eq(h.game.towers.length, towers, "nothing was placed underneath it");
  t.eq(h.game.gameSpeed, 2, "the press did what it was for");
});

// Speed multiplies how many fixed steps run, never the size of a step. That is
// what makes "applies to everything" true without any system opting in: three
// steps at 3x are the same three steps 1x would have run over three times as
// long, so the board plays identically, only sooner. Feeding update() a 3x dt
// instead would change collision and cooldown outcomes -- fast bullets would
// tunnel, range would be sampled a third as often -- so this is the assertion
// that keeps speed a pacing control rather than a difficulty setting.
test("speed multiplies the number of steps, never the size of one", function (t) {
  function stepsOver(wallSeconds, speed) {
    var h = harness.boot();
    h.run("gameSpeed = " + speed);

    var original = h.game.update;
    var sizes = [];
    h.game.update = function (dt) { sizes.push(dt); return original(dt); };
    h.wallClock(wallSeconds);
    h.game.update = original;
    return sizes;
  }

  var one = stepsOver(2, 1);
  var three = stepsOver(2, 3);
  var fixed = harness.boot().game.FIXED_STEP;

  t.ok(Math.abs(one.length - 120) <= 1, "1x runs ~120 steps in 2 s (" + one.length + ")");
  t.ok(Math.abs(three.length - 360) <= 1, "3x runs ~360 in the same 2 s (" + three.length + ")");

  t.ok(one.every(function (dt) { return dt === fixed; }), "every 1x step is the fixed step");
  t.ok(three.every(function (dt) { return dt === fixed; }), "and so is every 3x step");
});

// The other half of the same claim, from the outside: the same board, played
// for the same amount of SIMULATED time, lands in exactly the same state
// whether it got there at 1x or 3x.
test("a board reaches an identical state whichever speed it ran at", function (t) {
  var slow = harness.boot();
  slow.pinWaveBreak(5);
  slow.run("cash = 100000");
  slow.placeGunner(w(slow, 530), w(slow, 505));

  var fast = harness.boot();
  fast.pinWaveBreak(5);
  fast.run("cash = 100000");
  fast.placeGunner(w(fast, 530), w(fast, 505));
  fast.run("gameSpeed = 3");

  // 30 s of wall clock at 1x, 10 s of wall clock at 3x: the same 30 s of
  // simulation, driven through the real loop both times.
  slow.wallClock(30);
  fast.wallClock(10);

  t.eq(fast.game.baseHp, slow.game.baseHp, "same base HP");
  t.eq(fast.game.cash, slow.game.cash, "same cash earned");
  t.eq(fast.game.enemies.length, slow.game.enemies.length, "same enemies on the road");
  t.eq(fast.game.waveIndex, slow.game.waveIndex, "same point in the schedule");
  t.eq(fast.game.runKills, slow.game.runKills, "same kills");
});

test("speed survives a restart, because it is a preference and not run state", function (t) {
  var h = harness.boot();
  h.run("gameSpeed = 3");
  h.run("restartGame()");
  t.eq(h.game.gameSpeed, 3, "still 3x after a restart");
});


group("the pause menu");

test("Escape cancels first, and only then opens the pause menu", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");

  // With something armed, Escape backs out of THAT -- the job it has always
  // had. A player mid-action does not want a menu.
  h.key("1");
  t.eq(h.game.selectedSlot, 0, "a slot is armed");
  h.key("Escape");
  t.eq(h.game.selectedSlot, null, "Escape disarms it");
  t.eq(h.game.paused, false, "and does NOT open the menu yet");

  // Same for an inspected tower.
  h.placeGunner(w(h, 600), w(h, 505));
  h.run("inspected = towers[0]");
  h.key("Escape");
  t.eq(h.game.inspected, null, "Escape clears the inspection");
  t.eq(h.game.paused, false, "still no menu");

  // Nothing left to cancel -- now it opens.
  h.key("Escape");
  t.eq(h.game.paused, true, "Escape with nothing selected opens the menu");

  // And the same key closes it, so it toggles.
  h.key("Escape");
  t.eq(h.game.paused, false, "Escape resumes");
});

test("pausing freezes the run and swallows clicks meant for the board", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(w(h, 600), w(h, 505));
  h.step(3);

  h.key("Escape");                       // nothing selected after placing
  t.eq(h.game.paused, true, "paused");

  // Frozen: opening a menu must not cost the player a leak.
  var progress = h.game.enemies[0].progress;
  var cash = h.game.cash;
  h.step(5);
  t.eq(h.game.enemies[0].progress, progress, "enemies do not move while paused");
  t.eq(h.game.cash, cash, "and nothing is earned");

  // Nothing underneath the modal is clickable.
  h.click(w(h, 700), w(h, 505));
  t.eq(h.game.towers.length, 1, "no tower built through the pause menu");
  h.armSlot(0);
  t.eq(h.game.selectedSlot, null, "the build bar is unreachable too");

  // Resume puts it back exactly as it was.
  var r = h.game.resumeButtonRect();
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.paused, false, "Resume dismisses the menu");
  h.step(1);
  t.ok(h.game.enemies[0].progress > progress, "and the run continues");
});

test("Back to main menu leaves the run", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(w(h, 600), w(h, 505));
  h.key("Escape");

  var r = h.game.backToMenuButtonRect();
  h.click(r.x + r.w / 2, r.y + r.h / 2);

  t.eq(h.game.screen, "menu", "back on the title screen");
  t.eq(h.game.paused, false, "and unpaused, so the next run is not stuck");

  // Nothing may simulate behind the menu.
  var before = h.game.enemies.length;
  h.step(10);
  t.eq(h.game.enemies.length, before, "nothing simulates once back on the menu");
  h.draw();
  t.ok(true, "the menu draws after leaving a run");
});

test("the pause menu draws, does not overlap itself, and restart clears it", function (t) {
  var h = harness.boot();
  h.run("paused = true");
  h.draw();
  t.ok(true, "the pause menu draws");

  // The two buttons must not overlap, or one would eat the other's clicks.
  var resume = h.game.resumeButtonRect();
  var back = h.game.backToMenuButtonRect();
  t.ok(resume.y + resume.h <= back.y, "Resume sits clear of Back to main menu");
  t.ok(back.y + back.h < h.game.VIEW_HEIGHT, "both fit on the canvas");

  // THERE IS STILL NO HUD BUTTON THAT LEAVES A RUN, which is the part of the
  // old rule here that was load-bearing. A pause button was added to the chrome
  // row on 2026-08-27 and the line this replaces said there deliberately was
  // none: "Escape is the only way in, so nothing on screen is one stray click
  // from ending a run". The safety it was protecting is intact, because the
  // button opens the MENU and the menu is where leaving is decided -- Back to
  // main menu is still a second, deliberate click, and Escape or Resume undoes
  // the first one at no cost. What the old rule actually bought was that no
  // single click ends a run; what it also cost was that a player without a
  // keyboard, or without the habit, had nothing on screen telling them the run
  // could be stopped at all.
  t.eq(typeof h.game.exitButtonRect, "undefined",
    "still no HUD button that leaves a run in one click");

  // It is run state, so restarting clears it.
  h.run("restartGame()");
  t.eq(h.game.paused, false, "restart clears the pause");
});

// --- the HUD pause button: a clock, not a menu (2026-08-28) ----------------
//
// TWO STATES, DELIBERATELY. `paused` is the modal menu and owns every click;
// `frozen` stops the clock and owns nothing, so the board stays the player's.
// The button reaches the second and must never reach the first -- that is the
// whole change, and these tests are about the DIFFERENCE rather than about
// freezing, which the pause-menu tests above already cover.
test("the HUD pause button stops the clock without opening the menu", function (t) {
  var h = harness.boot();
  h.placeGunner(w(h, 600), w(h, 505));
  h.step(3);

  var r = h.game.pauseButtonRect();
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.frozen, true, "the button stops the clock");
  t.eq(h.game.paused, false, "and does NOT put a modal on screen");

  var progress = h.game.enemies[0].progress;
  h.step(5);
  t.eq(h.game.enemies[0].progress, progress, "the board really is held");

  // A TOGGLE. The button is the only way back, so a second press has to be it.
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.frozen, false, "and the same button starts it again");
  h.step(1);
  t.ok(h.game.enemies[0].progress > progress, "time moves once it is running");
});

// THE LOAD-BEARING TEST. Everything above proves the clock stopped; this is
// the half that says the board did not go with it. A freeze that also froze
// the player would just be the pause menu without its buttons.
test("a frozen board still builds, upgrades, inspects and hovers", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(w(h, 600), w(h, 505));
  h.step(3);

  var r = h.game.pauseButtonRect();
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.frozen, true, "clock stopped");

  // Build. A second tower goes down on a held board.
  var before = h.game.towers.length;
  h.placeGunner(w(h, 700), w(h, 420));
  t.eq(h.game.towers.length, before + 1, "a tower can be placed while frozen");

  // Inspect, by clicking the one just built.
  var tower = h.game.towers[h.game.towers.length - 1];
  h.click(tower.x, tower.y);
  t.eq(h.game.inspected, tower, "and clicked to inspect");

  // Upgrade, through the same entry point the panel's buttons use.
  var paths = tower.upgradePaths ? tower.upgradePaths() : null;
  if (paths && paths.length) {
    var id = paths[0].id;
    var reason = h.run("buyUpgrade(towers[towers.length - 1], '" + id + "')");
    t.eq(reason, null, "and upgraded, with the clock still stopped");
  }

  // Hover an enemy. The pointer is re-asked outside update(), which is what
  // makes this work at all -- see the note on `frozen`. Aimed through the
  // inverse of screenToWorld rather than at raw world numbers, so the test
  // survives a camera that is not sitting at zoom 1 dead centre.
  var e = h.game.enemies[0];
  var cam = h.game.camera;
  var sx = (e.pos.x - cam.x) * cam.zoom + h.game.VIEW_WIDTH / 2;
  var sy = (e.visualBodyY() - cam.y) * cam.zoom + h.game.VIEW_HEIGHT / 2;
  h.move(sx, sy);
  t.eq(h.game.hoveredEnemy, e, "and an enemy still answers the cursor");

  // None of that quietly started time again.
  t.eq(h.game.frozen, true, "and the clock is still stopped afterwards");
  t.eq(h.game.paused, false, "with no modal anywhere near it");

  h.draw();
  t.ok(true, "a frozen board draws, notice and all");
});

// The two states are independent in BOTH directions, which is the bit that is
// easy to get wrong: a Resume that cleared the freeze would start a clock the
// player stopped on purpose.
test("Escape still opens the menu over a frozen board, and Resume leaves the clock alone", function (t) {
  var h = harness.boot();
  var r = h.game.pauseButtonRect();
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.frozen, true, "frozen");

  h.key("Escape");
  t.eq(h.game.paused, true, "Escape still reaches the menu");
  t.eq(h.game.frozen, true, "and the freeze is untouched by it");

  var resume = h.game.resumeButtonRect();
  h.click(resume.x + resume.w / 2, resume.y + resume.h / 2);
  t.eq(h.game.paused, false, "Resume closes the menu");
  t.eq(h.game.frozen, true, "and does NOT start the clock the player stopped");
});

test("a restart clears the freeze", function (t) {
  var h = harness.boot();
  var r = h.game.pauseButtonRect();
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.frozen, true, "frozen");

  h.run("restartGame()");
  t.eq(h.game.frozen, false, "a new run does not begin on a stopped clock");
});

test("the pause button consumes its click and does not build under itself", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var r = h.game.pauseButtonRect();
  var towers = h.game.towers.length;

  t.ok(h.run("overInterfaceChrome(" + (r.x + 4) + ", " + (r.y + 4) + ")"),
    "the build preview knows the rectangle claims clicks");

  h.run("selectedSlot = 0");
  h.click(r.x + r.w / 2, r.y + r.h / 2);

  t.eq(h.game.towers.length, towers, "nothing was placed underneath it");
  t.eq(h.game.frozen, true, "the press did what it was for");
});

// The row grew a fourth button, and every one of them is anchored off the one
// to its right. That is a chain, and a chain is exactly the arrangement where
// widening one button silently slides another under the build bar -- so the
// whole row is swept rather than reasoned about.
test("the bottom-right chrome row is four buttons that do not overlap", function (t) {
  var h = harness.boot();
  var row = [
    { name: "pause", r: h.game.pauseButtonRect() },
    { name: "mixer", r: h.game.audioButtonRect() },
    { name: "auto-send", r: h.run("autoSkipButtonRect()") },
    { name: "speed", r: h.run("speedButtonRect()") }
  ];

  for (var i = 1; i < row.length; i++) {
    var left = row[i - 1], right = row[i];
    t.ok(left.r.x + left.r.w <= right.r.x,
      left.name + " sits clear of " + right.name);
    t.eq(left.r.y, right.r.y, "and on the same line as it");
    t.eq(left.r.h, right.r.h, "at the same height");
  }

  // Clear of the build bar to its left, which is the thing this row can
  // actually collide with as it grows leftwards. BAR_X is derived from the
  // slot count, so a sixth build slot would move it -- and this is the line
  // that would notice.
  t.ok(h.game.BAR_X + h.game.BAR_WIDTH < row[0].r.x,
    "and the whole row is clear of the build bar");
  t.ok(row[row.length - 1].r.x + row[row.length - 1].r.w <= h.game.VIEW_WIDTH,
    "and inside the canvas");
});

// A button drawn under a modal that swallows nothing is the trap
// waveSkipButtonRect and the mixer both exist to avoid; the pause button is
// drawn under the same guard as the mixer, and this is the other half of it.
test("the pause button is dead while a run is over", function (t) {
  var h = harness.boot();
  var r = h.game.pauseButtonRect();

  h.run("gameOver = true");
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.frozen, false, "a lost run cannot be frozen from the HUD");
  t.eq(h.game.paused, false, "and nothing opened a menu either");

  h.run("gameOver = false; victory = true");
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.frozen, false, "nor a won one");

  // And it draws in every one of those states without throwing, which is what
  // says the guard in draw() matches the guard in onClick.
  h.draw();
  h.run("victory = false; paused = true");
  h.draw();
  t.ok(true, "the play screen draws paused, won and lost");
});


group("placement rules");

test("a gunner may sit flush against the road but not on it", function (t) {
  var h = harness.boot();
  var clearanceUl = h.run("buildClearancePx(Tower) / UNIT_LENGTH");
  // ROAD_WIDTH_UL / 2 + FOOTPRINT_RADIUS_UL = 10.9375 + 11.25
  t.near(clearanceUl, 22.1875, 0.0001, "derived clearance in u.l.");
});

test("placement is refused on the road, on another tower, and off the map", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");                  // isolate geometry from affordability
  t.eq(h.run("whyCannotBuild(" + w(h, 600) + ", " + w(h, 460) + ", Tower)"), "too close to the path", "on the road");
  t.eq(h.run("whyCannotBuild(" + w(h, 600) + ", " + w(h, 505) + ", Tower)"), null, "beside the road");

  h.placeGunner(w(h, 600), w(h, 505));
  t.eq(h.run("whyCannotBuild(" + w(h, 605) + ", " + w(h, 505) + ", Tower)"), "overlaps another tower", "on a tower");
  t.eq(h.run("whyCannotBuild(" + w(h, -50) + ", " + w(h, 505) + ", Tower)"), "off the map", "off the map");
});

test("an unaffordable tower is refused", function (t) {
  var h = harness.boot();
  h.run("cash = 0");
  t.eq(h.run("whyCannotBuild(" + w(h, 600) + ", " + w(h, 505) + ", Tower)"), "not enough mana", "with no mana");
});


group("build bar");

test("nothing is placed until a slot is armed", function (t) {
  var h = harness.boot();
  h.click(w(h, 600), w(h, 505));
  t.eq(h.game.towers.length, 0, "towers after clicking with no slot armed");

  var affordableSlot = h.slotOf(h.game.Soldier);
  h.armSlot(affordableSlot);
  t.eq(h.game.selectedSlot, affordableSlot, "armed slot");
  h.click(w(h, 600), w(h, 505));
  t.eq(h.game.towers.length, 1, "towers after arming and clicking");
});

test("clicking the armed slot again disarms it", function (t) {
  var h = harness.boot();
  h.armSlot(0);
  h.armSlot(0);
  t.eq(h.game.selectedSlot, null, "selected slot after second click");
});

test("empty slots cannot be armed", function (t) {
  var h = harness.boot();

  // The bar has been FULL since the Soldier took the fifth slot (2026-07-29),
  // so this empties one rather than hunting for one that already is. That is
  // the honest version of the test either way: what it pins is the input rule
  // -- a slot with no tower in it arms nothing, whether it is empty because
  // nothing was ever put there or because the player unequipped it in the
  // armoury, which is a state the shipping game can still reach.
  var empty = h.game.BUILD_SLOTS.length - 1;
  h.run("BUILD_SLOTS[" + empty + "] = null");

  h.armSlot(empty);
  t.eq(h.game.selectedSlot, null, "selected slot after clicking an empty box");
  h.key(String(empty + 1));
  t.eq(h.game.selectedSlot, null, "selected slot after pressing its hotkey");
});

test("every built tower type is in the build bar", function (t) {
  var h = harness.boot();

  // The Longshot and the Siphon were reachable only through sandbox.html
  // until 2026-07-28. Both are fully built and fully tested, so hiding them
  // from the actual game was the bug this pins shut. The Soldier took the
  // fourth slot on 2026-07-29 and the Summoner took the fifth, so the bar is
  // now genuinely full: a SIXTH type needs a decision about the bar's shape,
  // and this line is where that decision will surface. Note that the armoury's
  // Inventory tab already picks which five of the owned types are equipped, so
  // "full" is a decision about the BAR and not about the roster.
  var names = h.game.BUILD_SLOTS.map(function (type) {
    return type === null ? null : type.DISPLAY_NAME;
  });
  // Display names, not ids. The towers were renamed for the robot
  // fantasy/magic theme on 2026-07-30 -- Smasher -> Warbringer, Longshot ->
  // Arcane Sniper, Soldier -> Rifleman -- while every ID,
  // constructor and stat stayed exactly where it was. The beam went to "Mana
  // Fountain" and back to **Siphon** the same day, at the owner's instruction.
  //
  // **The gunner is GONE** (2026-07-30, "delete the gunner"), which is what
  // moved everything down a slot and left the fifth empty. It had been marked
  // a placeholder awaiting deletion since the reskin. What this line pins is
  // the ORDER of what remains, and that did not move.
  t.deep(names,
    ["Warbringer", "Arcane Sniper", "Siphon", "Rifleman", "Summoner"],
    "build bar roster");

  // Every slot must satisfy the constructor contract the bar relies on, or
  // it breaks at the moment someone clicks it rather than at load.
  h.game.BUILD_SLOTS.forEach(function (type) {
    if (type === null) return;
    var label = type.DISPLAY_NAME;
    t.eq(typeof type.COST, "number", label + " has a cost");
    t.eq(typeof type.BASE_RANGE_UL, "number", label + " has a range");
    t.eq(typeof type.FOOTPRINT_RADIUS_UL, "number", label + " has a footprint");
    t.eq(typeof type.drawIcon, "function", label + " draws an icon");
    t.eq(typeof type.prototype.statLines, "function", label + " reports stats");
    t.eq(typeof type.prototype.containsPoint, "function", label + " is clickable");
    t.eq(typeof type.prototype.attackDamage, "function", label + " answers attackDamage");
    t.eq(typeof type.prototype.attacksPerSecond, "function", label + " answers attacksPerSecond");
  });
});

test("every tower type can be placed, inspected and sold in the real game", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");

  // A spot the game itself will accept for THIS type, found through the
  // game's own whyCannotBuild. Gunner spots are not reusable here: the
  // Longshot's footprint is nearly twice a gunner's, so it needs more
  // clearance from the road and cannot stand where a gunner can (documented
  // in AGENTS.md, and the reason this search exists rather than a fixed
  // coordinate that would quietly rot).
  // The chrome check is separate from whyCannotBuild on purpose, exactly as it
  // is in the game: whyCannotBuild answers whether the WORLD allows a tower
  // there, and a button drawn over that spot is a different question. Asking
  // both is what a player does implicitly by looking at the screen; a fixture
  // that asked only the first one would pick a spot under a button and fail
  // reporting "Longshot was placed: expected 3, actual 2".
  function legalSpotFor(slot) {
    for (var x = 40; x < h.game.VIEW_WIDTH - 40; x += 20) {
      for (var y = 40; y < h.game.BAR_Y - 40; y += 20) {
        if (h.run("overInterfaceChrome(" + x + ", " + y + ")")) continue;
        var reason = h.run(
          "whyCannotBuild(" + x + ", " + y + ", BUILD_SLOTS[" + slot + "])");
        if (reason === null) return { x: x, y: y };
      }
    }
    return null;
  }

  h.game.BUILD_SLOTS.forEach(function (type, slot) {
    if (type === null) return;
    var spot = legalSpotFor(slot);
    t.ok(spot !== null, "the map has legal ground for a " + type.DISPLAY_NAME);
    var before = h.game.towers.length;
    var tower = h.place(spot.x, spot.y, slot);
    t.eq(h.game.towers.length, before + 1, type.DISPLAY_NAME + " was placed");
    t.ok(tower instanceof type, "and is a " + type.DISPLAY_NAME);

    // Inspecting lays out its panel, which is where a missing statLines or a
    // panel taller than the canvas would surface.
    h.run("inspected = towers[towers.length - 1]");
    var L = h.run("inspectionLayout(inspected)");
    t.ok(L.h > 0 && L.y >= 0, type.DISPLAY_NAME + " panel fits the canvas");
    t.ok(L.y + L.h <= h.game.BAR_Y, type.DISPLAY_NAME + " panel clears the build bar");
  });

  // And they all fight side by side without throwing -- the real loop, real
  // enemies, every tower type claiming targets against each other. Counted off
  // the bar rather than typed, so the number cannot go stale the next time a
  // type is added.
  //
  // SUMMONS ARE EXCLUDED FROM THE COUNT, and that is the point rather than a
  // dodge: the Summoner's blubs live in `towers` (see js/blub.js) and it plants
  // its first one at the 20 s mark, so a raw length would grow here for a
  // reason that has nothing to do with what this line asserts -- that no BUILT
  // tower died during the run.
  var built = h.game.BUILD_SLOTS.filter(function (type) { return type !== null; }).length;
  h.step(20);
  var standing = h.game.towers.filter(function (t2) { return !t2.isSummon; }).length;
  t.eq(standing, built, "all of them survive a shared run");
  h.draw();
  t.ok(true, "a frame with every tower type draws");
});

test("number keys arm slots, escape clears everything", function (t) {
  var h = harness.boot();
  h.key("1");
  t.eq(h.game.selectedSlot, 0, "slot after pressing 1");
  h.key("Escape");
  t.eq(h.game.selectedSlot, null, "slot after escape");
});

test("clicking the build bar never places a tower under it", function (t) {
  var h = harness.boot();
  h.key("1");
  var r = h.game.slotRect(4);            // an empty slot, over open ground
  h.click(r.x + 5, r.y + 5);
  t.eq(h.game.towers.length, 0, "towers after clicking the bar");
});

test("the build preview is suppressed unless a slot is armed", function (t) {
  var h = harness.boot();
  h.move(w(h, 600), w(h, 505));
  t.eq(h.game.blockReason, null, "block reason with nothing armed");
  h.key("1");
  h.move(w(h, 600), w(h, 460));
  t.eq(h.game.blockReason, "too close to the path", "block reason when armed");
});


group("placing disarms the slot");

test("one click places one tower, then the slot is empty", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");

  h.key("1");
  t.eq(h.game.selectedSlot, 0, "armed");

  h.click(w(h, 530), w(h, 505));
  t.eq(h.game.towers.length, 1, "tower placed");
  t.eq(h.game.selectedSlot, null, "slot disarmed by placing");

  // The whole point: a second click on open ground must NOT build again.
  h.click(w(h, 700), w(h, 505));
  t.eq(h.game.towers.length, 1, "a second click builds nothing");
});

test("a refused placement keeps the slot armed", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.key("1");

  h.click(w(h, 600), w(h, 460));           // on the road
  t.eq(h.game.towers.length, 0, "nothing placed");
  t.eq(h.game.selectedSlot, 0, "still armed, so the next click can try again");
});


group("damage counters");

test("a tower counts the damage it actually lands", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var tower = h.placeGunner(w(h, 600), w(h, 505));
  t.eq(tower.damageDealt, 0, "starts at zero");

  h.run("enemies = []; bullets = [];");
  h.spawnAt(w(h, 1010), 3);
  h.run("towers[0].cooldown = 0");
  h.step(2);

  t.ok(tower.damageDealt > 0, "counted after its bullets landed: " + tower.damageDealt);
  t.eq(tower.statLines()[0][0], "Damage dealt", "and it is the first row of the panel");
});

test("overkill is excluded from the counter, while cash comes from the kill", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var tower = h.placeGunner(w(h, 600), w(h, 505));
  h.run("enemies = []; bullets = [];");

  // 1 HP enemy, 1 damage gunner. The counter follows what the enemy absorbed;
  // the wallet receives the enemy's one-time scaled bounty instead.
  var enemy = h.spawnAt(w(h, 1010), 1);
  h.run("towers[0].cooldown = 0");
  var cashBefore = h.game.cash;
  h.step(2);

  t.eq(tower.damageDealt, 1, "only the one point absorbed is counted");
  t.eq(h.game.cash - cashBefore, enemy.bounty(), "the kill pays its bounty");
});

test("Hive brood damage counts on towers even though the brood pays $0", function (t) {
  var h = harness.boot();
  var hive = new h.game.Enemy(h.game.path, undefined, "hive");
  var brood = hive.spawnMinions(7.1);
  var tower = { damageDealt: 0, kills: 0 };
  var hatchling = brood[0];

  t.eq(hatchling.bounty(), 0, "the hatchling still has no bounty");
  t.eq(h.game.TowerScore.apply(tower, hatchling, 4), 0,
    "shield damage still feeds no reward-led mechanic");
  t.eq(tower.damageDealt, 4, "but all four shield damage is on the tower counter");
  h.game.TowerScore.apply(tower, hatchling, 4);
  t.eq(tower.damageDealt, 8, "the four body damage is counted too");
  t.eq(tower.kills, 1, "and the brood kill belongs to the tower");
});

test("large totals are abbreviated rather than printed in full", function (t) {
  var h = harness.boot();
  var tower = h.placeGunner(w(h, 600), w(h, 505));

  tower.damageDealt = 950;
  t.eq(tower.statLines()[0][1], "950", "small totals print exactly");
  tower.damageDealt = 12345;
  t.eq(tower.statLines()[0][1], "12.3k", "thousands");
  tower.damageDealt = 4200000;
  t.eq(tower.statLines()[0][1], "4.2M", "millions");
});

test("the Arcane Sniper B5 ability counts its landed damage and kills", function (t) {
  var h = harness.boot();
  var sniper = new h.game.LongshotTower(0, 0, h.game.path);
  for (var tier = 0; tier < 5; tier++) sniper.purchase("B");

  var tank = new h.game.Enemy(h.game.path, 30000, "normal");
  var small = new h.game.Enemy(h.game.path, 10, "normal");
  tank.progress = 500;
  small.progress = 500;
  tank.refreshPos();
  small.refreshPos();

  t.eq(sniper.damageDealt, 0, "the counter starts empty");
  sniper.performAction("ability", { enemies: [tank, small] });
  t.ok(resolveB5Channel(h, sniper, [tank, small]),
    "the ritual resolved rather than still channelling");

  t.eq(tank.health, 12000, "18,000 B5 damage landed on the surviving target");
  t.eq(small.dead, true, "the second target was killed by the blast");
  t.eq(sniper.damageDealt, 18010,
    "the counter includes the ability and excludes the overkill on the other body");
  t.eq(sniper.kills, 1, "the ability kill belongs to the Sniper too");
});

test("Fractal Slimes take half damage from AoE but full damage from pierce", function (t) {
  var h = harness.boot();
  var areaTarget = new h.game.Enemy(h.game.path, undefined, "fractal_slime", { tier: 2 });
  var pierceTarget = new h.game.Enemy(h.game.path, undefined, "fractal_slime", { tier: 2 });
  var tower = { damageDealt: 0, kills: 0 };

  h.game.TowerScore.apply(tower, areaTarget, 10, 0, 0, "aoe");
  t.eq(areaTarget.health, 11, "a 10-damage area hit removes only 5 HP");
  t.eq(tower.damageDealt, 5, "the tower counter records the reduced landed damage");

  h.game.TowerScore.apply(tower, pierceTarget, 10);
  t.eq(pierceTarget.health, 6, "an untagged piercing or ordinary hit removes all 10 HP");
  t.eq(tower.damageDealt, 15, "the full piercing damage is counted");
});

test("Warbringer swings and Arcane Sniper B5 both respect slime AoE resistance", function (t) {
  var h = harness.boot();
  var warbringer = new h.game.Smasher(0, 0, h.game.path);
  var swingTarget = new h.game.Enemy(h.game.path, undefined, "fractal_slime", { tier: 2 });

  warbringer.swing([swingTarget], [swingTarget]);
  t.eq(swingTarget.health, 9, "the Warbringer's 14-damage wedge removes 7 HP");
  t.eq(warbringer.damageDealt, 7, "its counter receives the reduced damage");

  var blastOrigin = new h.game.Enemy(h.game.path, 1, "normal");
  var chainTarget = new h.game.Enemy(h.game.path, undefined, "fractal_slime", { tier: 2 });
  blastOrigin.pos = { x: 100, y: 100 };
  chainTarget.pos = { x: 100, y: 100 };
  warbringer.explode(blastOrigin, [blastOrigin, chainTarget]);
  t.eq(chainTarget.health, 8.5, "the B4 blast's 15 damage is reduced to 7.5");
  t.eq(warbringer.damageDealt, 14.5, "blast scoring also uses the reduced amount");

  var sniper = new h.game.LongshotTower(0, 0, h.game.path);
  for (var tier = 0; tier < 5; tier++) sniper.purchase("B");
  var blastTarget = new h.game.Enemy(h.game.path, undefined, "fractal_slime", { tier: 5 });
  blastTarget.maxHealth = 50000;
  blastTarget.health = 50000;
  blastTarget.progress = 500;
  blastTarget.refreshPos();

  sniper.performAction("ability", { enemies: [blastTarget] });
  t.ok(resolveB5Channel(h, sniper, [blastTarget]),
    "the ritual resolved rather than still channelling");
  t.eq(blastTarget.health, 41000, "B5's 18,000-damage blast removes 9,000 HP");
  t.eq(sniper.damageDealt, 9000, "the Sniper counter receives that reduced amount");
});


group("economy");

test("Fractal Slime is one six-tier enemy with exact x4 health steps", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var type = Enemy.TYPES.fractal_slime;
  var expected = [1, 4, 16, 64, 256, 1024];
  var expectedBounties = [0.5, 2, 8, 32, 128, 512];
  var lastRadius = 0;

  t.eq(type.health, 4, "the roster/base specimen is T1 at 4 HP");
  t.eq(type.fractal.defaultTier, 1, "T1 is the default tier");
  t.eq(type.fractal.maxTier, 5, "the tier ladder stops at T5");

  expected.forEach(function (hp, tier) {
    // The deliberately silly health argument proves a tier, not a hand-made
    // health override, owns a Fractal Slime's body.
    var e = new Enemy(h.game.path, 999, "fractal_slime", { tier: tier });
    t.eq(e.typeId, "fractal_slime", "T" + tier + " stays the same enemy type");
    t.eq(e.fractalTier, tier, "T" + tier + " keeps its instance tier");
    t.eq(e.maxHealth, hp, "T" + tier + " has " + hp + " HP");
    t.eq(e.bounty(), expectedBounties[tier],
      "T" + tier + " pays its halved " + expectedBounties[tier] + " bounty");
    t.ok(e.radiusPx() > lastRadius, "T" + tier + " is larger than the previous tier");
    lastRadius = e.radiusPx();
  });
});

test("a T3 Fractal Slime divides all the way to sixty-four terminal T0s", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var queue = [new Enemy(h.game.path, undefined, "fractal_slime", { tier: 3 })];
  var bodies = 0;
  var totalHp = 0;
  var totalBounty = 0;
  var leaves = 0;

  while (queue.length) {
    var e = queue.shift();
    bodies++;
    totalHp += e.maxHealth;
    totalBounty += e.bounty();
    e.takeDamage(e.maxHealth);
    var children = e.splitOnDeath();
    if (children) queue = queue.concat(children);
    else leaves++;
    t.eq(e.splitOnDeath(), null, "a body can split only once");
  }

  t.eq(bodies, 85, "T3 produces 1 + 4 + 16 + 64 total bodies");
  t.eq(leaves, 64, "the final generation is sixty-four T0 slimes");
  t.eq(totalHp, 256, "four generations require 256 total damage");
  t.eq(totalBounty, 128, "and the complete family bounty is exactly halved");
});

test("the real death sweep replaces a killed fractal with four children", function (t) {
  var h = harness.boot();
  h.run(
    "waveIndex = WAVES.length; enemies = []; bullets = []; towers = []; cash = 0;" +
    "fractalRoot = new Enemy(path, undefined, 'fractal_slime', { tier: 2 });" +
    "fractalRoot.progress = 500; fractalRoot.refreshPos(); enemies.push(fractalRoot);" +
    "fractalRoot.takeDamage(fractalRoot.maxHealth);"
  );

  h.step(1 / 60);
  t.eq(h.game.enemies.length, 4, "the dead T2 is replaced by four bodies");
  t.ok(h.game.enemies.every(function (e) {
    return e.typeId === "fractal_slime" && e.fractalTier === 1 && e.maxHealth === 4;
  }), "all four are smaller T1 copies of the same type");
  var progresses = h.game.enemies.map(function (e) { return e.progress; })
    .sort(function (a, b) { return a - b; });
  for (var i = 1; i < progresses.length; i++) {
    t.near(progresses[i] - progresses[i - 1], h.game.ul(26), 0.0001,
      "T1 children are separated by 26 u.l.");
  }
  var stuns = h.game.enemies.map(function (e) { return e.stunTimer; })
    .sort(function (a, b) { return a - b; });
  t.near(stuns[0], 0.5, 0.0001, "the shortest birth stun is 0.5 s");
  t.near(stuns[3], 1, 0.0001, "the longest birth stun is 1.0 s");
  t.eq(h.game.cash, 8, "the dead T2 pays its halved bounty once");
  t.eq(h.game.runKills, 1, "the parent is one kill");
});

test("the Easy stake buys the two-Rifleman opening", function (t) {
  var h = harness.boot();
  t.eq(h.game.STARTING_CASH, 600, "starting cash");
  t.eq(h.game.Soldier.COST, 300, "Rifleman cost");
  t.eq(h.game.LongshotTower.COST, 900, "Arcane Sniper cost");
  t.eq(h.game.BeamTower.COST, 800, "Siphon cost");
  t.eq(h.game.STARTING_CASH, h.game.Soldier.COST * 2,
    "the opening fields exactly two Riflemen");
});

test("every enemy type has an explicit bounty and health overrides scale it", function (t) {
  var h = harness.boot();
  Object.keys(h.game.Enemy.TYPES).forEach(function (id) {
    var type = h.game.Enemy.TYPES[id];
    t.ok(typeof type.bounty === "number" && type.bounty > 0,
      id + " has a positive authored bounty");
    t.eq(h.game.Enemy.bountyOf(id), type.bounty,
      id + " resolves to its base bounty at base health");
  });
  t.eq(h.game.Enemy.bountyOf("brute", 80), 80,
    "doubling authored health doubles the brute's bounty");
  t.eq(h.game.Enemy.bountyOf("boss_fast", 1400), 2053,
    "the scheduled Vanguard override scales and rounds once");
});

test("damage pays nothing; the final kill pays exactly once", function (t) {
  var h = harness.boot();
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []; cash = 0");
  var enemy = h.spawnAt(w(h, 1010), 4);
  var reward = enemy.bounty();

  t.eq(enemy.takeDamage(3), 3, "three damage still lands");
  h.step(1 / 60);
  t.eq(h.game.cash, 0, "but a wounded enemy pays nothing");

  enemy.takeDamage(1);
  h.step(1 / 60);
  t.eq(h.game.cash, reward, "its final death pays the authored bounty");
  h.step(1);
  t.eq(h.game.cash, reward, "and the sweep cannot pay it twice");
});

test("a Revenant pays only after its final life", function (t) {
  var h = harness.boot();
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []; cash = 0");
  var enemy = h.spawnAt(w(h, 1010), 16, "revenant");
  var reward = enemy.bounty();

  enemy.takeDamage(100);
  h.step(1 / 60);
  t.eq(enemy.dead, false, "the first lethal blow revives it");
  t.eq(h.game.cash, 0, "and the revive pays nothing");

  enemy.takeDamage(100);
  h.step(1 / 60);
  t.eq(h.game.cash, reward, "the final death pays the one authored bounty");
});

test("overkill does not pay", function (t) {
  var h = harness.boot();
  h.clearBoard();
  var e = h.spawnAt(w(h, 1010), 1);
  t.eq(e.takeDamage(3), 1, "only one point of damage lands");
  t.eq(e.bounty(), 1, "and its scaled kill bounty is still only one");
});


group("tower inspection");

test("clicking a tower shows its stats, escape clears them", function (t) {
  var h = harness.boot();
  var tower = h.placeGunner(w(h, 600), w(h, 505));
  h.click(w(h, 600), w(h, 505));
  t.eq(h.game.inspected, tower, "inspected tower");
  // No "Target" row: the targeting button under these rows is the one place
  // the mode is shown. Two readouts of one setting, one above the other, is
  // the duplication the map labels were removed for.
  // THE THIRD ELEMENT IS THE LIFETIME-TOTAL MARK (TowerStats.total). The
  // armoury card and the index show a specimen that has never fired and drop
  // its history; they used to drop it by counting two rows off the front, which
  // silently ate the Farm's production rate -- the Farm has no "Damage dealt"
  // row and keeps its own totals at the bottom. The mark travels with the row
  // so the drop is by identity. Nothing that DRAWS a row reads past [1].
  t.deep(tower.statLines(), [
    ["Damage dealt", "0", true],
    ["Kills", "0", true],
    ["Damage", "1"],
    ["Range", "100 u.l."],
    ["Attack speed", "1.00/s"],
    // Towers took hit points on 2026-07-29 (js/systems/tower-health.js) and
    // this row arrived with them; the expectation was not updated at the time.
    ["Tower HP", "60 / 60"],
    ["DPS", "1.0"]
  ], "stat rows");

  t.deep(h.game.TowerStats.withoutTotals(tower.statLines()).map(function (r) {
    return r[0];
  }), ["Damage", "Range", "Attack speed", "Tower HP", "DPS"],
    "and a specimen of it shows everything except the two totals");

  h.key("Escape");
  t.eq(h.game.inspected, null, "inspected after escape");
});

test("attack speed and DPS are derived, not stored", function (t) {
  var h = harness.boot();
  var tower = h.placeGunner(w(h, 600), w(h, 505));
  tower.damage = 4;
  tower.fireRate = 2;
  // Rows are looked up by NAME, not by index: the panel gained Kills in the
  // v0.3.5 merge and a positional test breaks every time a row is added.
  function row(name) {
    var found = tower.statLines().filter(function (r) { return r[0] === name; });
    return found.length ? found[0][1] : null;
  }
  t.eq(row("Attack speed"), "2.00/s", "attack speed follows fire rate");
  t.eq(row("DPS"), "8.0", "DPS follows damage x attack speed");
  t.eq(row("Cooldown"), null, "and there is no second name for the same thing");
});

test("every tower type reports its rate in the same words and the same unit", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");

  // The bug: the gunner said "Cooldown 1.00 s", the smasher "Hit speed
  // 4.00 s", the Longshot "Fire rate 0.50/s" and the beam folded it into an
  // "AD" row -- four names, two units, no way to compare any of them. This
  // walks whatever is in the build bar, so a tower type added later cannot
  // quietly invent a fifth spelling.
  var towers = [h.placeGunner(w(h, 530), w(h, 505)), h.placeSmasher(w(h, 700), w(h, 545))];
  t.eq(towers.map(function (x) { return x.name; }).join(","), "Gunner,Warbringer",
    "both types actually got placed");

  towers.forEach(function (tower) {
    var labels = tower.statLines().map(function (r) { return r[0]; });
    t.ok(labels.indexOf("Attack speed") !== -1, tower.name + " has an Attack speed row");
    t.ok(labels.indexOf("Cooldown") === -1 && labels.indexOf("Hit speed") === -1 &&
      labels.indexOf("Fire rate") === -1, tower.name + " has no other name for it");
    t.eq(labels[0], "Damage dealt", tower.name + " leads with its lifetime damage");
    t.eq(labels[1], "Kills", tower.name + " counts kills");
    t.eq(labels[labels.length - 1], "DPS", tower.name + " ends on DPS");

    function row(name) {
      return tower.statLines().filter(function (r) { return r[0] === name; })[0][1];
    }
    // The three numbers multiply out, because all three come from the same
    // two accessors (see js/systems/tower-stats.js).
    t.near(parseFloat(row("DPS")),
      tower.attackDamage() * tower.attacksPerSecond(), 0.05,
      tower.name + " DPS = damage x attack speed");
    t.eq(row("Attack speed"), tower.attacksPerSecond().toFixed(2) + "/s",
      tower.name + " prints attacks per second");
    t.ok(row("Range").indexOf("u.l.") !== -1, tower.name + " measures range in u.l.");
  });
});

test("clicking empty ground clears the inspection", function (t) {
  var h = harness.boot();
  h.placeGunner(w(h, 600), w(h, 505));
  h.click(w(h, 600), w(h, 505));
  h.click(w(h, 200), w(h, 650));
  t.eq(h.game.inspected, null, "inspected after clicking away");
});


group("selling");

test("a gunner sells for half its cost, rounded up", function (t) {
  var h = harness.boot();
  var tower = h.placeGunner(w(h, 600), w(h, 505));
  t.eq(h.run("sellValue(towers[0])"), 50, "refund on a $100 gunner");

  // Rounding is up, not down, so an odd price never loses the half dollar.
  // The synthetic prices below are the rule, not the roster -- $15 stays in the
  // list as the odd-number case even though the gunner now costs $100.
  var sell = h.game.sellValue;
  t.eq(sell({ cost: 15 }), 8, "$15 -> $8");
  t.eq(sell({ cost: 10 }), 5, "$10 -> $5");
  t.eq(sell({ cost: 1 }), 1, "$1 -> $1");
  t.eq(sell({ cost: 0 }), 0, "$0 -> $0");
  t.eq(sell({ cost: tower.cost }), 50, "the placed gunner");
});

test("the sell button removes the tower and pays the refund", function (t) {
  var h = harness.boot();
  h.placeGunner(w(h, 600), w(h, 505));
  // placeGunner is a direct physics fixture for the deleted reference tower;
  // it does not go through the shipping wallet.
  t.eq(h.game.cash, 600, "fixture placement does not spend run cash");

  h.click(w(h, 600), w(h, 505));                       // inspect it
  var b = h.run("inspectionLayout(inspected).sell");
  h.click(b.x + b.w / 2, b.y + b.h / 2);   // click Sell

  t.eq(h.game.towers.length, 0, "towers after selling");
  t.eq(h.game.cash, 650, "cash after the refund");
  t.eq(h.game.inspected, null, "inspection cleared");
});

test("selling frees the ground it stood on", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(w(h, 600), w(h, 505));
  t.eq(h.run("whyCannotBuild(" + w(h, 600) + ", " + w(h, 505) + ", Tower)"), "overlaps another tower", "before selling");

  h.click(w(h, 600), w(h, 505));
  h.run("sellTower(inspected)");
  t.eq(h.run("whyCannotBuild(" + w(h, 600) + ", " + w(h, 505) + ", Tower)"), null, "after selling");
});

test("selling keeps the remaining towers in claim order", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(w(h, 700), w(h, 505));
  h.placeGunner(w(h, 530), w(h, 505));
  h.placeGunner(w(h, 830), w(h, 505));
  t.deep(h.game.towers.map(function (x) { return Math.round(x.x); }),
    [530, 700, 830].map(function (v) { return Math.round(w(h, v)); }), "before");

  h.run("sellTower(towers[1])");           // remove the middle one
  t.deep(h.game.towers.map(function (x) { return Math.round(x.x); }),
    [530, 830].map(function (v) { return Math.round(w(h, v)); }), "after");

  var sorted = h.game.towers.every(function (x, i, all) {
    return i === 0 || all[i - 1].pathProgress <= x.pathProgress;
  });
  t.ok(sorted, "still sorted by pathProgress");
});

test("the delete key sells the inspected tower and nothing else", function (t) {
  var h = harness.boot();
  h.placeGunner(w(h, 600), w(h, 505));
  h.key("Delete");
  t.eq(h.game.towers.length, 1, "delete with nothing inspected");

  h.click(w(h, 600), w(h, 505));
  h.key("Delete");
  t.eq(h.game.towers.length, 0, "delete with a tower inspected");
  t.eq(h.game.cash, 650, "cash after refund");
});

test("selling does not cancel damage already in flight", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(w(h, 600), w(h, 505));
  h.run("enemies = []; bullets = []");
  var e = h.spawnAt(w(h, 1010), 3);

  h.run("towers[0].cooldown = 0");
  h.step(1 / 60);
  t.eq(h.game.bullets.length, 1, "bullet in the air");

  h.run("sellTower(towers[0])");
  var cashBefore = h.game.cash;
  h.step(0.5);

  t.eq(h.game.bullets.length, 0, "bullet landed");
  t.eq(e.health, 2, "damage still applied");
  t.eq(h.game.cash - cashBefore, 0, "a non-killing hit pays no cash");
  t.eq(e.incomingDamage, 0, "claim released");
});

test("the sell button outranks building on the ground beneath it", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var tower = h.placeGunner(w(h, 600), w(h, 505));
  h.click(w(h, 600), w(h, 505));                       // inspect it
  h.key("1");                              // re-arm: placing disarms the slot
  t.eq(h.game.selectedSlot, 0, "a build slot is armed again");

  var b = h.run("inspectionLayout(inspected).sell");
  var before = h.game.towers.length;
  h.click(b.x + b.w / 2, b.y + b.h / 2);

  // The panel floats above the map, so the button wins over placement --
  // the same rule the build bar follows.
  t.eq(h.game.towers.indexOf(tower), -1, "the inspected tower was sold");
  t.eq(h.game.towers.length, before - 1, "nothing was built under the button");
});

test("the panel and its button stay on screen in the bottom right corner", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(w(h, 1240), w(h, 690));
  h.click(w(h, 1240), w(h, 690));
  var L = h.run("inspectionLayout(inspected)");

  t.ok(L.x >= 0 && L.x + L.w <= h.game.VIEW_WIDTH, "panel within the canvas width");
  t.ok(L.y >= 0 && L.y + L.h <= h.game.BAR_Y, "panel above the build bar");
  t.ok(L.sell.x >= L.x && L.sell.x + L.sell.w <= L.x + L.w, "button within the panel");
  t.ok(L.sell.y + L.sell.h <= L.y + L.h, "button inside the panel bottom");
});


group("debug cash panel");

test("it is not part of the game -- the tests do not load it", function (t) {
  var scripts = harness.gameScripts();
  t.notOk(scripts.some(function (s) { return s.indexOf("debug-") !== -1; }),
    "no debug script in the simulated game: " + scripts.join(", "));
});

test("typing in a text field does not trigger game hotkeys", function (t) {
  var h = harness.boot();
  var onKeyDown = h.game.onKeyDown;

  // The debug panel has a number input. Typing "1" in it must not arm a slot.
  onKeyDown({ key: "1", target: { tagName: "INPUT" } });
  t.eq(h.game.selectedSlot, null, "slot after typing 1 into an input");

  onKeyDown({ key: "1", target: { tagName: "CANVAS" } });
  t.eq(h.game.selectedSlot, 0, "slot after pressing 1 on the canvas");
});


group("target claiming");

test("towers are kept sorted by position along the path", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(w(h, 700), w(h, 505));                       // later on the path, placed first
  h.placeGunner(w(h, 600), w(h, 505));                       // earlier on the path
  var order = h.game.towers.map(function (x) { return Math.round(x.x); });
  t.deep(order, [600, 700].map(function (v) { return Math.round(w(h, v)); }),
    "tower x positions in claim order");
});

test("the earlier tower fires and the later one holds", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(w(h, 700), w(h, 505));
  h.placeGunner(w(h, 600), w(h, 505));
  h.run("enemies = []; bullets = []");

  // One 1 HP enemy in range of both, both off cooldown. The pair sits 100 px
  // apart with the enemy between them -- a gunner reaches 104 px, so both
  // cover it and neither covers much beyond it.
  h.spawnAt(w(h, 1010), 1);
  h.run("towers[0].cooldown = 0; towers[1].cooldown = 0");
  h.run("for (var i = 0; i < towers.length; i++) towers[i].update(1/60, enemies, bullets);");

  t.eq(h.game.bullets.length, 1, "shots fired at a doomed enemy");
  t.eq(h.game.enemies[0].incomingDamage, 1, "damage claimed");
  t.eq(h.game.enemies[0].unclaimedHealth(), 0, "unclaimed health");
  t.eq(h.game.towers[1].cooldown, 0, "the later tower held fire and stays ready");
});

test("two towers may still focus a healthy enemy", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(w(h, 600), w(h, 505));
  h.placeGunner(w(h, 700), w(h, 505));
  h.run("enemies = []; bullets = []");

  h.spawnAt(w(h, 1010));                          // full 3 HP
  h.run("towers[0].cooldown = 0; towers[1].cooldown = 0");
  h.run("for (var i = 0; i < towers.length; i++) towers[i].update(1/60, enemies, bullets);");
  t.eq(h.game.bullets.length, 2, "shots at a healthy enemy");
});

test("mirrored gunners waste no shots over two minutes", function (t) {
  var h = harness.boot();
  // Target claiming is a general mechanic, so isolate it from the finite
  // two-wave content with a steady 3 HP stream in this sandbox.
  //
  // WRITTEN IN THE TIMELINE FORM since 2026-08-25. It used to be the flat
  // `{ count: 60, health: 3, interval: 2 }`, which was the single-group wave
  // shorthand; there is no such shorthand any more and waveGroups() throws a
  // named error rather than letting a fixture in the old shape deploy nothing.
  // 130 s of ceiling on a 118 s stream, so the wave outlasts the 120 s window
  // this measures over and the meter sees one continuous stream rather than a
  // wave handing over to nothing.
  h.run("WAVES = [{ duration: 130, groups: [" +
        "{ at: 0, count: 60, health: 3, interval: 2 }] }]; restartGame()");
  h.run("cash = 100000");
  h.placeGunner(w(h, 600), w(h, 505));
  h.placeGunner(w(h, 600), w(h, 415));
  t.deep(h.game.towers.map(function (x) { return Math.round(x.pathProgress); }),
    [Math.round(w(h, 960)), Math.round(w(h, 960))],
    "mirrored towers tie on path position");

  var stop = h.meter();
  h.step(120);
  var m = stop();

  t.eq(m.wasted, 0, "wasted shots");
  t.near(m.shotsPerKill, 3, 0.001, "shots per kill (enemy HP / tower damage)");
  t.eq(m.strayClaims, 0, "claims left behind with no bullet");
});

test("a bullet releases its claim when its target dies to someone else", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(w(h, 600), w(h, 505));
  h.run("enemies = []; bullets = []");

  var e = h.spawnAt(w(h, 1010), 3);
  h.run("towers[0].cooldown = 0");
  h.step(1 / 60);
  t.eq(e.incomingDamage, 1, "claim while the bullet is in flight");

  e.takeDamage(3);                          // killed by something else
  h.step(0.5);
  t.eq(e.incomingDamage, 0, "claim released after the bullet gives up");
  t.eq(h.game.bullets.length, 0, "bullet discarded");
});


group("the sniper's lead");

// THE ARCANE SNIPER IS THE ONE TOWER THAT LEADS ITS SHOTS, and the lead is the
// only place in the game where "how fast is this body going" is asked about the
// FUTURE. It fires a straight-line PierceBullet that has to physically reach
// the body, so a wrong lead is a miss and not a rounding error.
//
// Owner, 2026-08-29: "if a revenant is only in a sniper range it gets killed
// but the corpse can't be killed because it stops moving and the sniper tries
// to preshoot movement on an unmoving target so it never touches."
//
// Exactly right, and the reason is one word: `predictedPosition` read
// `enemy.speedUlps` -- what the TYPE walks at -- instead of
// `enemy.currentSpeedUlps()`, which is what it is walking at now. A revive
// roots a Revenant where it fell, so it is the one body that can sit still in
// the dead zone for ever.
test("a body that has stopped is aimed AT, not in front of", function (t) {
  var h = harness.boot();
  var g = h.game;
  h.clearBoard();

  var sniper = new g.LongshotTower(600, 505, g.path);
  var walker = new g.Enemy(g.path, undefined, "revenant");
  walker.progress = g.ul(300);
  walker.refreshPos();

  // The lead a WALKING body gets is unchanged -- this is the case that always
  // worked, and the fix must not move it.
  var moving = sniper.predictedPosition(walker);
  t.ok(Math.hypot(moving.x - walker.pos.x, moving.y - walker.pos.y) > 0,
    "a walking body is led");

  // Every reason a body can be standing still, one at a time, through the same
  // function the movement loop reads (`currentSpeedUlps`). Each one used to be
  // led as though the body were at full walk.
  // MEASURED AGAINST `enemy.pos` SINCE 2026-08-30, and it used to be measured
  // against the centreline instead. `predictedPosition` answered a point on the
  // centreline for the whole of this test's life -- it asked `path.pointAt`
  // directly -- so a standing body was aimed at a couple of u.l. off its own
  // lane and the assertion had to tolerate that. It goes through the body's own
  // `positionAt` now, which keeps the lane, so a lead of zero is `enemy.pos`
  // EXACTLY and the workaround is gone rather than merely retuned.
  [["rooted by a revive", function (e) { e.tryRevive(); }],
   ["stunned", function (e) { e.applyStun(3); }]].forEach(function (row) {
    var e = new g.Enemy(g.path, undefined, "revenant");
    e.progress = g.ul(300);
    e.refreshPos();
    row[1](e);
    t.eq(e.currentSpeedUlps(), 0, row[0] + ": it is not moving");

    var aim = sniper.predictedPosition(e);
    t.eq(Math.round(Math.hypot(aim.x - e.pos.x, aim.y - e.pos.y)), 0,
      row[0] + ": no lead is added at all");
    t.ok(Math.hypot(aim.x - e.pos.x, aim.y - e.pos.y) < 1e-9,
      row[0] + ": and the aim is the body itself, lane included");

    // And the shot's aim point is well inside the radius a PierceBullet
    // touches, which is the property that decides whether it connects.
    t.ok(Math.hypot(aim.x - e.pos.x, aim.y - e.pos.y) <
      g.ul(g.PierceBullet.HIT_RADIUS_UL) * 0.5,
      row[0] + ": and the aim sits well inside the shot's hit radius");
  });
});

test("a sniper leads a body that is not on the road, and connects", function (t) {
  var h = harness.boot();
  var g = h.game;
  h.clearBoard();

  // THE BUG THE OWNER FOUND: "they can't be touched, the towers don't know what
  // to do and shoot at random places when targetting them."
  //
  // `predictedPosition` asked `enemy.path.pointAt(progress)`, and a Skimmer's
  // progress is a position along ITS OWN route -- the chord from the road's
  // mouth to the base. So the aim point was a spot on a road the body is
  // nowhere near, and a straight-line PierceBullet went there.
  var skimmer = new g.Enemy(g.path, undefined, "skimmer");
  skimmer.progress = g.path.length * 0.5;
  skimmer.refreshPos();

  var chord = g.Enemy.chordOf(g.path);
  var sniper = new g.LongshotTower(
    Math.round((chord.from.x + chord.to.x) / 2),
    Math.round((chord.from.y + chord.to.y) / 2) - 60, g.path);

  var aim = sniper.predictedPosition(skimmer);

  // THE AIM IS ON THE CHORD, which is the whole claim: the body's own route,
  // not the tarmac. Measured as the perpendicular distance from the line.
  var dx = aim.x - chord.from.x, dy = aim.y - chord.from.y;
  var offLine = Math.abs(dx * chord.unit.y - dy * chord.unit.x);
  t.ok(offLine < g.ul(Math.abs(skimmer.laneOffsetUl)) + 0.001,
    "the aim point is on the body's own line (" + offLine.toFixed(2) + " px off)");

  // AND IT IS LED, not merely pointed at: the body is moving, so the aim sits
  // ahead of it and still well inside what a PierceBullet touches.
  var lead = Math.hypot(aim.x - skimmer.pos.x, aim.y - skimmer.pos.y);
  t.ok(lead > 0, "a moving Skimmer is led (" + lead.toFixed(2) + " px)");
  t.ok(lead < g.ul(g.PierceBullet.HIT_RADIUS_UL) * 0.5,
    "and the lead is well inside the shot's hit radius");

  // WHAT THE OLD ONE ANSWERED, for the record: a point on the road, tens of
  // pixels away, against a 12 u.l. radius. Kept as a measurement rather than a
  // memory, so nobody has to take the size of the miss on trust.
  var onRoad = g.path.pointAt(skimmer.progress);
  t.ok(Math.hypot(onRoad.x - skimmer.pos.x, onRoad.y - skimmer.pos.y) >
    g.ul(g.PierceBullet.HIT_RADIUS_UL),
    "where the road point it used to answer is outside that radius entirely");

  // END TO END: the one tower that may legally engage this body -- flight by
  // default, camo from A1 -- actually removes it.
  h.run("towers = []; enemies = []; bullets = []; cash = 1000000;" +
        "waveIndex = WAVES.length; waveSpawned = 0");
  h.run("addTower(new LongshotTower(" + sniper.x + ", " + sniper.y + ", path));" +
        "towers[0].purchase('A')");
  t.eq(h.run("towers[0].core.stats.seesCamo"), true, "A1 gives it camo detection");
  t.eq(h.run("towers[0].core.stats.seesFlying"), true, "and it sees flight already");

  h.run("enemies.push(new Enemy(path, null, 'skimmer', {}))");
  var killed = h.run("(function () {" +
    "  for (var i = 0; i < 600; i++) { update(1 / 20); if (!enemies.length) return true; }" +
    "  return false; })()");
  t.ok(killed, "and the Skimmer dies to it rather than flying past untouched");
});

// THE END TO END, because the arithmetic above cannot show what it cost.
//
// The lead runs ALONG THE ROAD and the shot flies along the line from the
// muzzle, so the error is the part of the lead PERPENDICULAR to that line: a
// tower firing up the road misses by nothing, one firing across it misses by
// the whole lead, and a PierceBullet only touches what comes within
// HIT_RADIUS_UL of its line. So the tower is put side-on, which is the
// ordinary case on a board where the road crosses its field of fire.
//
// Measured before the fix: at 160 u.l. and beyond, thirty shots in sixty
// seconds and the body's health never moved. Under it, dead in two.
test("a rooted Revenant side-on to a sniper dies at every range", function (t) {
  var h = harness.boot();
  var g = h.game;

  function trial(distUl) {
    h.clearBoard();
    h.run("enemies.length = 0; bullets.length = 0; towers.length = 0;" +
          "cash = 1000000; waveIndex = WAVES.length;");
    var e = new g.Enemy(g.path, undefined, "revenant");
    e.progress = g.ul(300);
    e.refreshPos();
    var tan = g.path.tangentAt(e.progress);
    // Off to the side: the normal to the road at the body's own position.
    var d = g.ul(distUl);
    var tower = new g.LongshotTower(e.pos.x - tan.y * d, e.pos.y + tan.x * d, g.path);
    g.towers.push(tower);
    g.enemies.push(e);

    e.takeDamage(1e9);                      // spend the revive; it roots here
    t.ok(e.rooted && !e.dead, distUl + " u.l.: the body is rooted and standing");

    var shots = 0;
    for (var i = 0; i < 60 * 60 && !e.dead; i++) {
      var before = g.bullets.length;
      h.run("update(FIXED_STEP)");
      if (g.bullets.length > before) shots++;
    }
    return { killed: e.dead, shots: shots, health: e.health };
  }

  [240, 200, 160, 120].forEach(function (d) {
    var r = trial(d);
    t.ok(r.killed, d + " u.l.: the sniper finishes it (" + r.shots +
      " shots, health " + r.health.toFixed(1) + ")");
  });
});

// AND THE SET IT BELONGS TO. A Revenant is the visible half; everything
// `currentSpeedUlps` accounts for was mispredicted the same way, in both
// directions. The Vanguard is the one that was UNDER-led -- it sprints its
// opening 400 u.l. at twice its own walk, which is the phase the wave is
// designed around, and the sniper was aiming at half the distance it covers.
test("the lead follows every channel that changes a body's speed", function (t) {
  var h = harness.boot();
  var g = h.game;
  h.clearBoard();
  var sniper = new g.LongshotTower(600, 505, g.path);

  function leadPx(enemy) {
    var aim = sniper.predictedPosition(enemy);
    return Math.hypot(aim.x - enemy.pos.x, aim.y - enemy.pos.y);
  }

  var slowed = new g.Enemy(g.path, undefined, "normal");
  slowed.progress = g.ul(300);
  slowed.refreshPos();
  var full = leadPx(slowed);
  slowed.applySlow(0.5, 5);
  t.ok(leadPx(slowed) < full * 0.75,
    "a slowed body is led less far (" + leadPx(slowed).toFixed(1) +
    " px against " + full.toFixed(1) + ")");

  // The sprinter, at a progress inside its own sprint window.
  var sprinter = new g.Enemy(g.path, undefined, "boss_fast");
  sprinter.progress = g.ul(50);
  sprinter.refreshPos();
  t.ok(sprinter.currentSpeedUlps() > sprinter.speedUlps,
    "the Vanguard is sprinting here (" + sprinter.currentSpeedUlps() +
    " against its walk of " + sprinter.speedUlps + ")");
  var sprintLead = leadPx(sprinter);
  var walkLead = g.ul(sprinter.speedUlps) *
    (Math.hypot(sprinter.pos.x - sniper.x, sprinter.pos.y - sniper.y) /
     g.ul(sniper.shotSpeedUlps()));
  t.ok(sprintLead > walkLead * 1.5,
    "and it is led for the sprint, not for the walk (" + sprintLead.toFixed(1) +
    " px against " + walkLead.toFixed(1) + ")");
});

group("balance");

test("wave arithmetic records the incoming burst and total health", function (t) {
  var h = harness.boot();
  // Health per wave is read off the roster THROUGH Enemy.healthOf, the same
  // resolver the spawner uses, so this arithmetic cannot disagree with what
  // actually walks out of the gate.
  var Enemy = h.game.Enemy;

  // BURST IS A PROPERTY OF A GROUP, NOT OF A WAVE (2026-08-25). These read
  // `WAVES[0].type` and `WAVES[0].interval` off the wave itself until the
  // timeline rewrite, when a wave stopped having one interval: wave 2 is four
  // Normals a second and then, from 4.5 s, four more at 0.65 -- two different
  // bursts in one wave. The number the tower budget is actually measured
  // against is the WORST of them, so that is what is taken.
  function peakBurst(wave) {
    var worst = 0;
    h.game.waveGroups(wave).forEach(function (g) {
      if (!g.interval) return;
      var hp = Enemy.healthOf(g.type, g.health, g.tier) / g.interval;
      if (hp > worst) worst = hp;
    });
    return worst;
  }
  var waveOneBurst = peakBurst(h.game.WAVES[0]);
  var waveTwoBurst = peakBurst(h.game.WAVES[1]);

  // Two totals, because since v0.4.7 they are different numbers.
  //
  //   scheduled  what the array literally says: count x health, per group.
  //   effective  what the player actually has to remove: a shield is health
  //              you must chew through, and a Revenant is two bodies.
  //
  // A THIRD quantity is deliberately absent: a living Hive drops five shielded,
  // unpaid hatchlings every seven seconds, and none of that is in the schedule.
  // How much a Hive costs is decided by how fast it is killed, so there is no
  // figure to pin -- see the Hive's row in Enemy.TYPES.
  var scheduled = 0;
  var effective = 0;
  var unpaid = 0;
  h.game.WAVES.forEach(function (wave) {
    h.game.waveGroups(wave).forEach(function (g) {
      var type = Enemy.typeOf(g.type);
      var hp = g.count * Enemy.healthOf(g.type, g.health, g.tier);
      var lives = hp * (1 + (type.revive ? type.revive.times : 0));
      var full = lives * (1 + (type.shield ? type.shield.ratio : 0));
      scheduled += hp;
      effective += full;
      // Kept as a health accounting check. Cash is tested separately from
      // Enemy.bountyOf below.
      unpaid += type.noBounty ? full : (full - lives);
    });
  });
  var supplied = h.game.Tower.BASE_DAMAGE * h.game.Tower.BASE_FIRE_RATE;

  t.near(waveOneBurst, 5, 0.001, "wave 1 burst HP/s");
  // 4 HP/s until the timeline rewrite, when wave 2's eight Normals were re-cut
  // into 4 at 1.0 s and 4 at 0.65 s. The COMPOSITION is untouched -- eight
  // stock Normals, 32 HP -- and the peak burst is the one thing a re-timing is
  // supposed to move. 4 / 0.65 = 6.15.
  t.near(waveTwoBurst, 4 / 0.65, 0.001, "wave 2 peak burst HP/s");
  // 23 697 / 25 799 until the 2026-08-13 curve retune landed waves 12, 13, 16.
  // 23 796 / 25 898 until 2026-08-20 scheduled the Fractal Slime's whole tier
  // ladder (T0 in 16, T1 in 17, T2 in 22, T3 in 25, T4 in 33, T5 in 35).
  //
  // THE TOTAL BARELY MOVED ON PURPOSE -- +41 of 25 898, 0.16% -- because each
  // rung was PAID FOR out of the waves around it rather than added on top:
  // wave 33 funds its T4 exactly (two Bulwarks and a Brute), and the T5's
  // 1024 is met by wave 35 as far as it can go (-340) with the rest taken off
  // 27, 29, 30, 31, 32 and 34 at 5-9% each. The curve someone measured is
  // therefore still the curve, which is the whole reason for the arithmetic.
  //
  // WHAT THIS SUM DOES NOT SEE is the cascade, and that is the same deliberate
  // blindness it already had for a Hive's brood: only the ROOT of a fractal is
  // authored, so the six roots put 1 372 points in this figure while a fully
  // cleared board removes 7 748 -- a root at tier T costs root x (T+1) across
  // its generations. See the note above WAVES.
  t.eq(scheduled, 24141, "scheduled health across the full schedule");
  t.eq(effective, 25939, "and what it actually takes to clear it");
  t.ok(unpaid > 0 && unpaid < effective * 0.25,
    "shields remain a real part of the work (" + unpaid + " of " + effective + ")");
  t.ok(supplied < waveOneBurst, "one gunner is below the wave 1 burst");

  // The curve has to keep CLIMBING. It is not enough for the total to be
  // bigger: the owner asked for the per-wave increase to grow, so the last
  // third of the schedule must be heavier than the middle third, which must be
  // heavier than the first.
  var thirds = [0, 0, 0];
  h.game.WAVES.forEach(function (wave, i) {
    var bucket = Math.min(2, Math.floor(i / (h.game.WAVES.length / 3)));
    h.game.waveGroups(wave).forEach(function (g) {
      var type = Enemy.typeOf(g.type);
      thirds[bucket] += g.count * Enemy.healthOf(g.type, g.health, g.tier) *
        (1 + (type.shield ? type.shield.ratio : 0)) *
        (1 + (type.revive ? type.revive.times : 0));
    });
  });
  t.ok(thirds[1] > thirds[0], "the middle third outweighs the opening");
  t.ok(thirds[2] > thirds[1] * 1.5, "and the last third outweighs the middle by half again");

  var totalHealth = effective;

  // The old two-wave schedule totalled 52 HP -- it could never destroy the
  // 100 HP base, so the loss screen was unreachable in real play. The full
  // schedule can, and THE_COMPANY/tools/balance/simulate-campaign.js shows it
  // does (that tool lives outside this repository, so it is not reachable
  // from a clone of it; an undefended base falls during the mid-game on
  // every route).
  t.ok(totalHealth > h.game.BASE_MAX_HP, "the schedule can now destroy an undefended base");

  // The authored purse is the sum of kill bounties, wave-clear bonuses and
  // the Easy stake. Conditional summons add their ordinary kill bounties only
  // if they appear; Hive broods stay at $0.
  var killIncome = 0;
  var clearIncome = 0;
  h.game.WAVES.forEach(function (wave) {
    killIncome += h.game.waveKillBounty(wave);
    clearIncome += h.game.waveBounty(wave);
  });
  // $23 333 until the 2026-08-13 curve retune. The rise is the HP inflation
  // paying for itself, NOT a bounty change -- `b = 1.00`, no bounty was touched.
  //
  // $23 438 until the tier ladder was scheduled, and THAT ONE FELL -- by $451,
  // while health barely moved. That was the Fractal Slime's half-price row
  // doing exactly what it was written to do: it paid $0.50 per point where an
  // ordinary body pays $1, so converting 1 308 points of scheduled health into
  // slime roots gave up half the kill money on them, and the board earned it
  // back from the generations (conditional, so never in this sum).
  //
  // $22 987 until 2026-08-29, when the ladder came off the campaign. The ten
  // roots were replaced point for point, so HEALTH did not move at all -- and
  // this rose $145 anyway, because the four types that replaced them are
  // ordinary bodies at $1 a point where a slime was $0.50. The conditional
  // $3 188 the cascades used to pay is gone with them: what a board earns for
  // clearing wave 35 is now what this line says it is.
  t.eq(killIncome, 23132, "scheduled kill bounties");
  var progressionIncome = 0;
  var escalatingIncome = 0;
  for (var waveNumber = 1; waveNumber <= h.game.WAVES.length; waveNumber++) {
    progressionIncome += h.game.waveProgressionReward(waveNumber);
    escalatingIncome += h.game.waveEscalatingReward(waveNumber);
  }
  var purse = killIncome + clearIncome + progressionIncome + escalatingIncome +
    h.game.STARTING_CASH;
  // $36 017 until the 2026-08-13 curve retune. Note it rose 0.32% while
  // effective HP rose 0.38%: the $9 505 of progression and escalating rewards
  // is schedule-blind, so inflating health dilutes spending power on its own
  // and no bounty has to be touched to make that happen.
  //
  // $36 133 until the tier ladder, which cost it $447: the half-price kill
  // money above plus the clear bonus following the three waves that got
  // lighter. Taking the ladder back off on 2026-08-29 returned $145 of that --
  // the kill money only, since the substitution matched every root's health and
  // the clear bonus is a tenth of health. The conditional $3 188 the cascades
  // used to pay was never in an AUTHORED purse and must not be added to one.
  t.eq(purse, 35831, "authored run purse before conditional rewards");
  var dearest = h.game.BUILD_SLOTS.reduce(function (max, type) {
    return type && type.COST > max ? type.COST : max;
  }, 0);
  t.ok(purse > dearest * 2,
    "a run earns well over the dearest tower ($" + purse + " vs $" + dearest + ")");
});

test("additional gunners reduce the HP that reaches the base", function (t) {
  // Measured against the original two-wave opening as a combat regression.
  // The full schedule's whole-run behaviour is
  // THE_COMPANY/tools/balance/simulate-campaign.js's job (that tool lives
  // outside this repository, so it is not reachable from a clone of it);
  // over 120 s of mid-campaign one or two Riflemen are simply dead, and
  // rightly so.
  var one = harness.boot();
  one.pinWaveBreak(5);
  one.run("WAVES = WAVES.slice(0, 2); restartGame()");
  one.run("cash = 100000");
  one.placeGunner(w(one, 530), w(one, 505));
  var a = one.tally(120);
  t.eq(a.killed, 2, "kills with one gunner over 120 s");
  t.eq(a.leaked, 11, "leaks with one gunner over 120 s");
  t.eq(one.game.baseHp, 66, "base HP with one gunner");

  var two = harness.boot();
  two.pinWaveBreak(5);
  two.run("WAVES = WAVES.slice(0, 2); restartGame()");
  two.run("cash = 100000");
  two.placeGunner(w(two, 530), w(two, 505));
  two.placeGunner(w(two, 700), w(two, 505));
  var b = two.tally(120);
  // 4 kills / 9 leaks until the timeline rewrite (2026-08-25). RE-MEASURED, not
  // relaxed: wave 2's eight Normals used to arrive one a second from the gate
  // and now arrive as 4 at 1.0 s and 4 more at 0.65 s from 4.5 s in, so the
  // second salvo lands inside the first gunner's reload window instead of after
  // it. Base HP did not move at all -- 83 either way -- because the extra kill
  // is a body that used to leak with damage already on it. That is exactly the
  // kind of shift a re-timing is allowed to make and a re-COMPOSITION is not,
  // and the totals test above is what holds the composition still.
  t.eq(b.killed, 5, "kills with two gunners over 120 s");
  t.eq(b.leaked, 8, "leaks with two gunners over 120 s");
  t.eq(two.game.baseHp, 83, "base HP with two gunners");

  // The figures above are a snapshot; THIS is the property. A stock normal
  // now has 4 HP rather than 3, so every one of them moved when the roster
  // became the source of truth -- the ordering did not.
  t.ok(b.killed > a.killed, "a second gunner kills more");
  t.ok(b.leaked < a.leaked, "and lets fewer through");
  t.ok(two.game.baseHp > one.game.baseHp, "so the base ends up healthier");
});


group("inspection panel buttons");

test("a tower with no actions gets the original panel", function (t) {
  var h = harness.boot();
  var tower = h.placeGunner(w(h, 600), w(h, 505));                 // gunner: no panelActions()
  var L = h.run("inspectionLayout(towers[0])");
  t.eq(L.actions.length, 0, "no action buttons");
  t.eq(L.w, 190, "original panel width");
  t.ok(L.sell.y + L.sell.h <= L.y + L.h, "sell button still inside the panel");
});

test("action buttons are laid out inside the panel and never overlap", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");

  // A stand-in tower type: the panel must not care what the actions mean.
  h.run(
    "function FakeTower(x, y, p) {" +
    "  Tower.call(this, x, y, p);" +
    "  this.name = 'Fake';" +
    "}" +
    "FakeTower.prototype = Object.create(Tower.prototype);" +
    "FakeTower.prototype.constructor = FakeTower;" +
    "FakeTower.prototype.panelActions = function () {" +
    "  return [" +
    "    { id: 'a', label: 'Path A 0->1', detail: '$95', enabled: true, tone: 'upgrade' }," +
    "    { id: 'b', label: 'Path B 0->1', detail: '$125', enabled: true, tone: 'upgrade' }," +
    "    { id: 'c', label: 'Ability', detail: '25000 dmg', enabled: true, tone: 'ability' }" +
    "  ];" +
    "};" +
    "FakeTower.prototype.performAction = function (id) { this.lastAction = id; };" +
    "FakeTower.DISPLAY_NAME = 'Fake'; FakeTower.COST = 10;" +
    "FakeTower.BASE_RANGE_UL = Tower.BASE_RANGE_UL;" +
    "FakeTower.FOOTPRINT_RADIUS_UL = Tower.FOOTPRINT_RADIUS_UL;" +
    "FakeTower.drawIcon = Tower.drawIcon;" +
    "towers = []; addTower(new FakeTower(600, 505, path)); inspected = towers[0];"
  );

  var L = h.run("inspectionLayout(inspected)");
  t.eq(L.actions.length, 3, "three action rectangles");

  // Two upgrades side by side on one row, ability alone on the next.
  t.eq(L.actions[0].y, L.actions[1].y, "the two upgrades share a row");
  t.ok(L.actions[2].y > L.actions[1].y, "the ability is on its own row below");
  t.ok(L.actions[2].w > L.actions[0].w, "the lone ability button spans the full width");

  // No horizontal overlap between the pair.
  t.ok(L.actions[0].x + L.actions[0].w <= L.actions[1].x,
    "upgrade buttons do not overlap horizontally");

  // Everything stays inside the panel, and clear of the sell button.
  L.actions.forEach(function (s, i) {
    t.ok(s.x >= L.x && s.x + s.w <= L.x + L.w, "action " + i + " within panel width");
    t.ok(s.y >= L.y && s.y + s.h <= L.y + L.h, "action " + i + " within panel height");
    t.ok(s.y + s.h <= L.sell.y, "action " + i + " sits above the sell button");
  });

  // And clear of the last stat row.
  var lastRowY = L.y + L.pad + L.titleH + (L.rows.length - 1) * L.rowH;
  t.ok(L.actions[0].y > lastRowY, "actions start below the stat rows");
});

test("clicking an action button runs it and does not fall through to the map", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.run(
    "function ClickTower(x, y, p) { Tower.call(this, x, y, p); this.name='Click'; this.ran=[]; }" +
    "ClickTower.prototype = Object.create(Tower.prototype);" +
    "ClickTower.prototype.panelActions = function () {" +
    "  return [{ id: 'go', label: 'Go', detail: '$0', enabled: true, tone: 'upgrade' }," +
    "          { id: 'no', label: 'No', detail: 'locked', enabled: false, tone: 'upgrade' }];" +
    "};" +
    "ClickTower.prototype.performAction = function (id, ctxObj) {" +
    "  this.ran.push(id); ctxObj.spend(7);" +
    "};" +
    "towers = []; addTower(new ClickTower(600, 505, path)); inspected = towers[0];"
  );

  var L = h.run("inspectionLayout(inspected)");
  var before = h.game.cash;
  var towerCount = h.game.towers.length;

  var go = L.actions[0];
  h.click(go.x + go.w / 2, go.y + go.h / 2);
  t.deep(h.run("inspected.ran"), ["go"], "the action ran");
  t.eq(h.game.cash, before - 7, "the action's spend went through the wallet");
  t.eq(h.game.towers.length, towerCount, "nothing was built underneath the button");

  // A disabled button still consumes the click rather than building.
  var no = L.actions[1];
  h.key("1");                                  // arm a build slot
  h.click(no.x + no.w / 2, no.y + no.h / 2);
  t.deep(h.run("inspected.ran"), ["go"], "the disabled action did not run");
  t.eq(h.game.towers.length, towerCount, "and nothing was built under it either");
});

test("panel text is clipped to fit, so labels cannot overlap their values", function (t) {
  var h = harness.boot();
  var ctx = h.run("ctx");

  h.run("ctx.font = '13px system-ui, sans-serif'");
  var wide = h.run("fitText(ctx, 'an extremely long stat label that will not fit', 60)");
  t.ok(h.run("ctx.measureText(" + JSON.stringify(wide) + ").width") <= 60,
    "clipped text fits the width given: " + JSON.stringify(wide));
  t.ok(wide.slice(-1) === "…", "clipped text is marked with an ellipsis");

  var short = h.run("fitText(ctx, 'Range', 200)");
  t.eq(short, "Range", "text that already fits is returned untouched");
});


group("draw ordering");

test("world overlays draw above the map but below the interface", function (t) {
  var h = harness.boot();

  // Record the order things are drawn in by tagging each stage.
  var order = h.run(
    "(function () {" +
    "  var seen = [];" +
    "  var realRoad = drawRoad, realPanel = drawInspection, realBar = drawBuildBar;" +
    "  drawRoad = function () { seen.push('map'); realRoad(); };" +
    "  drawInspection = function () { seen.push('panel'); realPanel(); };" +
    "  drawBuildBar = function () { seen.push('bar'); realBar(); };" +
    "  worldOverlays.push(function () { seen.push('overlay'); });" +
    "  draw();" +
    "  drawRoad = realRoad; drawInspection = realPanel; drawBuildBar = realBar;" +
    "  worldOverlays.length = 0;" +
    "  return seen;" +
    "})()"
  );

  t.ok(order.indexOf("map") < order.indexOf("overlay"),
    "overlay comes after the map: " + order.join(" -> "));
  t.ok(order.indexOf("overlay") < order.indexOf("panel"),
    "and before the inspection panel");
  t.ok(order.indexOf("overlay") < order.indexOf("bar"),
    "and before the build bar");
});

test("the inspection panel draws no text labels on the map", function (t) {
  // Range and footprint are drawn as SHAPES and printed in the panel. Drawing
  // them as text on the map as well stacked three copies of the same numbers
  // around the tower.
  var h = harness.boot();
  h.placeGunner(w(h, 600), w(h, 505));
  h.click(w(h, 600), w(h, 505));

  var drawn = h.run(
    "(function () {" +
    "  var texts = [];" +
    "  var realFillText = ctx.fillText;" +
    "  ctx.fillText = function (s) { texts.push(String(s)); };" +
    "  drawInspection();" +
    "  ctx.fillText = realFillText;" +
    "  return texts;" +
    "})()"
  );

  // The panel's own rows are fine -- it prints "Range" and "100 u.l." as a
  // label/value pair. What must be gone is the map-label form, a lowercase
  // "range 100 u.l." / "footprint 11.25 u.l." floating over the tower.
  var mapLabels = drawn.filter(function (s) {
    return /^(range|footprint|deadzone)\s/.test(s);
  });
  t.eq(mapLabels.length, 0, "no map labels drawn: " + drawn.join(" | "));
});


group("rendering");

test("visual models can replace skins without touching simulation objects", function (t) {
  var h = harness.boot();
  var calls = h.run(
    "visualModelCalls = 0;" +
    "VisualModels.register('enemy', 'normal:body', function (context, enemy) {" +
    "  visualModelCalls++; return true;" +
    "});" +
    "visualModelEnemy = new Enemy(path, undefined, 'normal');" +
    "visualModelEnemy.draw(ctx); visualModelCalls;"
  );
  t.eq(calls, 1, "an enemy body renderer is selected by type id");
  t.eq(h.run("visualModelEnemy.health"), 4,
    "drawing through a skin leaves the enemy's gameplay state untouched");

  t.ok(typeof h.game.VisualModels.registerSprite === "function",
    "image-backed skins have a one-call registration helper");
  h.run("VisualModels.unregister('enemy', 'normal:body')");
  t.eq(h.run("VisualModels.renderer('enemy', 'normal:body')"), null,
    "a skin can be removed to restore the built-in fallback");
});

test("authored shield variants follow the live shield without hiding the body", function (t) {
  var h = harness.boot();
  var result = h.run(
    "(function () {" +
    "  Image = function () {" +
    "    this.complete = true; this.naturalWidth = 1024;" +
    "    this.naturalHeight = 1280; this.src = '';" +
    "  };" +
    "  var sources = [];" +
    "  var fieldPanels = 0;" +
    "  var oldDrawImage = ctx.drawImage;" +
    "  var oldEllipse = ctx.ellipse;" +
    "  ctx.drawImage = function (image) {" +
    "    sources.push(String(image.src).split('?')[0]);" +
    "  };" +
    "  ctx.ellipse = function (x, y, rx, ry, rotation, start, end) {" +
    "    if (Math.abs((end - start) - Math.PI * 2) > 0.1) fieldPanels++;" +
    "    return oldEllipse.apply(ctx, arguments);" +
    "  };" +
    "  ['normal', 'swarm', 'brute', 'hive'].forEach(function (id) {" +
    "    var enemy = new Enemy(path, undefined, id);" +
    "    enemy.shieldMax = 10;" +
    "    enemy.shield = 0; enemy.shieldFlash = 0; enemy.draw(ctx);" +
    "    enemy.shield = 10; enemy.shieldFlash = 0; enemy.draw(ctx);" +
    "    enemy.shield = 0; enemy.shieldFlash = 1; enemy.draw(ctx);" +
    "    enemy.shield = 10; enemy.shieldFlash = 0.001; enemy.draw(ctx);" +
    "  });" +
    "  ctx.drawImage = oldDrawImage; ctx.ellipse = oldEllipse;" +
    "  return { sources: sources, fieldPanels: fieldPanels };" +
    "})()"
  );

  t.deep(result.sources, [
    "assets/normal_walk.png", "assets/normal_walk_shielded.png",
    "assets/normal_walk.png", "assets/normal_walk_shielded.png",
    "assets/swarm_walk.png", "assets/swarm_walk_shielded.png",
    "assets/swarm_walk.png", "assets/swarm_walk_shielded.png",
    "assets/brute_walk.png", "assets/brute_walk_shielded.png",
    "assets/brute_walk.png", "assets/brute_walk_shielded.png",
    "assets/hive_walk.png", "assets/hive_walk_shielded.png",
    "assets/hive_walk.png", "assets/hive_walk_shielded.png"
  ], "a live shield selects aligned hardware, and a broken one returns to the base sheet");
  t.eq(result.fieldPanels, 64,
    "four steady panels remain under four fading grant panels, while a break has only four");
});

test("both AoE towers emit replaceable impact effects", function (t) {
  var h = harness.boot();
  var counts = h.run(
    "impactCounts = { swing: 0, hit: 0, blast: 0, strike: 0 };" +
    "VisualModels.register('effect', 'warbringer-swing', function () { impactCounts.swing++; });" +
    "VisualModels.register('effect', 'warbringer-hit', function () { impactCounts.hit++; });" +
    "VisualModels.register('effect', 'warbringer-blast', function () { impactCounts.blast++; });" +
    // The Sniper's impact is emitted under 'b5-strike'. It was 'arcane-aoe'
    // when the ability was instant; resolveChannel names it for the strike
    // that lands, not for the button that arms it.
    "VisualModels.register('effect', 'b5-strike', function () { impactCounts.strike++; });" +
    "impactWarbringer = new Smasher(0, 0, path);" +
    "impactTarget = new Enemy(path, 50, 'normal');" +
    "impactTarget.pos = { x: 100, y: 100 };" +
    "impactWarbringer.swing([impactTarget], [impactTarget]);" +
    "impactOrigin = new Enemy(path, 1, 'normal');" +
    "impactOrigin.pos = { x: 100, y: 100 };" +
    "impactWarbringer.explode(impactOrigin, [impactOrigin, impactTarget]);" +
    "impactSniper = new LongshotTower(0, 0, path);" +
    "for (impactTier = 0; impactTier < 5; impactTier++) impactSniper.purchase('B');" +
    "impactArcaneTarget = new Enemy(path, 50000, 'normal');" +
    "impactArcaneTarget.progress = 500; impactArcaneTarget.refreshPos();" +
    "impactSniper.performAction('ability', { enemies: [impactArcaneTarget] });" +
    // The strike -- and so its impact effect -- lands when the channel
    // resolves, not when the button is pressed. Budgeted from the tower's own
    // channelSeconds for the reason given on resolveB5Channel above.
    "impactBudget = Math.ceil((impactSniper.core.stats.mechanics.activeAbility" +
    "  .channelSeconds + 1) / FIXED_STEP);" +
    "for (impactStep = 0; impactStep < impactBudget && impactSniper.channel; impactStep++)" +
    "  impactSniper.update(FIXED_STEP, [impactArcaneTarget], []);" +
    "impactCounts.channelled = !!impactSniper.channel;" +
    "Effects.draw(ctx); impactCounts;"
  );
  t.eq(counts.channelled, false, "the ritual resolved rather than still channelling");
  t.eq(counts.swing, 1, "the Warbringer wedge has a ground impact");
  t.eq(counts.hit, 1, "each Warbringer victim has a contact impact");
  t.eq(counts.blast, 1, "the B4 explosion has its own impact");
  t.eq(counts.strike, 1, "the Arcane Sniper B5 has its own impact");
});

test("only the B5 fourth round emits its compact contact impact", function (t) {
  var h = harness.boot();
  var result = h.run(
    "fourthHitMarks = [];" +
    "VisualModels.register('effect', 'arcane-empowered-hit', function (context, impact) {" +
    "  fourthHitMarks.push({ kind: impact.kind, x: impact.x, y: impact.y," +
    "    radius: impact.radius, liftUl: impact.liftUl, angle: impact.angle });" +
    "  return true;" +
    "});" +
    "Effects.reset();" +
    "plainFourthFixture = new Enemy(path, 1000, 'normal');" +
    "plainFourthFixture.pos = { x: 114, y: 100 };" +
    "plainFourthStart = plainFourthFixture.health;" +
    "plainFourthShot = new PierceBullet({ x: 100, y: 100, angle: 0," +
    "  damage: 10, pierce: 0, hasFalloff: false, falloffParams: null," +
    "  maxTravelPx: 500, speedUlps: 562.5, liftUl: 24, empowered: false });" +
    "plainFourthShot.update(1 / 60, [plainFourthFixture]);" +
    "Effects.draw(ctx);" +
    "plainFourthMarks = fourthHitMarks.length;" +
    "empoweredFourthFixture = new Enemy(path, 1000, 'normal');" +
    "empoweredFourthFixture.pos = { x: 114, y: 100 };" +
    "empoweredFourthStart = empoweredFourthFixture.health;" +
    "empoweredFourthShot = new PierceBullet({ x: 100, y: 100, angle: 0," +
    "  damage: 10, pierce: 0, hasFalloff: false, falloffParams: null," +
    "  maxTravelPx: 500, speedUlps: 562.5, liftUl: 24, empowered: true });" +
    "empoweredFourthShot.update(1 / 60, [empoweredFourthFixture]);" +
    "Effects.draw(ctx);" +
    "({ plainMarks: plainFourthMarks, marks: fourthHitMarks," +
    "  plainDamage: plainFourthStart - plainFourthFixture.health," +
    "  empoweredDamage: empoweredFourthStart - empoweredFourthFixture.health });"
  );

  t.eq(result.plainMarks, 0, "ordinary rounds do not borrow the fourth-shot mark");
  t.eq(result.marks.length, 1, "one empowered contact emits one mark");
  t.eq(result.marks[0].kind, "arcane-empowered-hit", "the effect has its own skin id");
  t.eq(result.marks[0].x, 114, "the mark is centered on the enemy actually touched");
  t.eq(result.marks[0].y, 100, "its ground anchor comes from that enemy");
  t.eq(result.marks[0].liftUl, 24, "the body flash keeps the projectile's barrel lift");
  t.near(result.marks[0].radius, h.game.ul(17), 1e-9,
    "the mark stays compact at gameplay size");
  t.eq(result.empoweredDamage, result.plainDamage,
    "presentation metadata adds no damage of its own");
});

test("a full frame draws without throwing", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(w(h, 600), w(h, 505));
  h.placeGunner(w(h, 1240), w(h, 690));                      // forces the panel to flip and clamp
  h.click(w(h, 1240), w(h, 690));
  h.key("1");
  h.move(w(h, 400), w(h, 300));
  h.step(3);
  h.draw();
  h.run("baseHp = 0; gameOver = true");
  h.draw();
  t.ok(true, "normal and loss frames completed");
});

// EVERY CAMO TYPE WEARS A REAL BODY (2026-08-19, at the owner's instruction:
// "all camo enemies are modelled as their normal variants but just
// transparent"). Before that mapping existed, `camo_fast` and `camo_heavy` had
// no mesh registered under their own ids, `enemyModel` returned null, and both
// drew the coloured sphere -- so the translucency the GL path had already been
// taught was being applied to a ball.
//
// THE TABLE IS READ OUT OF THE SHIPPED FILE, not retyped here. That is the rule
// `tools/check-gait-slip.js` follows for the same reason: a fixture holding its
// own copy of a shipped constant is a fixture that agrees with itself while the
// game disagrees with both. `enemyModel` is private to gl-world's closure, so
// the table is the smallest honest thing to reach for, and the assertion is the
// half that actually matters -- that every camo type in the roster names a
// model the registry really has.
test("every camo type is drawn as the body it shadows, not as a sphere", function (t) {
  var fs = require("fs");
  var h = harness.boot();

  var world = fs.readFileSync(__dirname + "/../js/gl/gl-world.js", "utf8");
  var literal = /var CAMO_SHADOWS = (\{[\s\S]*?\});/.exec(world);
  t.ok(!!literal, "gl-world still ships a CAMO_SHADOWS table");
  var shadows = JSON.parse(literal[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));

  var camo = Object.keys(h.game.Enemy.TYPES).filter(function (id) {
    return h.game.Enemy.TYPES[id].isCamo;
  });
  t.ok(camo.length >= 3, "the roster still has camo types (" + camo.join(", ") + ")");

  // WHAT THIS ACTUALLY GUARDS is a camo type falling through to the sphere by
  // ACCIDENT -- no mesh of its own and nobody added the mapping. A camo type
  // with its own `enemy-<id>` needs no mapping at all (`enemyModel` reads
  // `CAMO_SHADOWS[id] || id`), and a type still being designed is ENTITLED to
  // the sphere: that is what the placeholder is for.
  //
  // So the rule is "resolve to a mesh, or be parked". `sandboxOnly` is the
  // flag that says parked, and the moment such a type is scheduled into a
  // campaign this test starts demanding a body or a shadow for it -- which is
  // exactly when it should.
  camo.forEach(function (id) {
    var shadowed = shadows[id];
    if (!shadowed && !h.game.GLModels.has("enemy-" + id)) {
      t.ok(h.game.Enemy.TYPES[id].sandboxOnly,
        id + " has no mesh and no shadow, so it must still be parked " +
        "(sandboxOnly) rather than shipping as an accidental sphere");
      return;
    }
    if (!shadowed) {
      t.ok(h.game.GLModels.has("enemy-" + id), id + " draws its own body");
      return;
    }
    // The mapped id must be a REAL type and not itself a camo one, which is
    // what "modelled as their normal variant" means.
    t.ok(!!h.game.Enemy.TYPES[shadowed], id + " shadows a type that exists (" + shadowed + ")");
    t.ok(!h.game.Enemy.TYPES[shadowed].isCamo, id + " shadows a NON-camo type");
    t.ok(h.game.GLModels.has("enemy-" + shadowed),
      id + " draws enemy-" + shadowed + ", which is registered");
  });

  // And the pairing itself, since these are the three the owner named.
  t.eq(shadows.camo_normal, "normal", "a camo normal is a normal");
  t.eq(shadows.camo_fast, "fast", "a camo fast is a fast");
  t.eq(shadows.camo_heavy, "slow", "a camo heavy is a camo SLOW -- the plodder");
});


// --- the Vanguard: two gaits, and a shield that comes back ------------------
//
// Four things are pinned here and none of them is "the animation looks right",
// which no suite can say. What they are is the four places this feature can
// break SILENTLY: a band that is not declared, a variant flag that latches,
// a reform that finishes at the wrong moment, and a fragment that is not its
// own group. Every one of those draws a plausible picture of the wrong thing.

test("the Vanguard carries two gaits as two bands and the sprint picks the second", function (t) {
  var h = harness.boot();
  var G = h.game;
  var fake = { mesh: function () { return {}; } };

  // THE MODELS DECLARE THE LAYOUT, and it is read off the REGISTRY rather than
  // out of the importer or out of the file text: the registry is what the
  // renderer asks, and `register` dropping the field on the floor is a defect
  // this project has already shipped once.
  ["enemy-boss_fast", "enemy-boss_fast-shattered"].forEach(function (id) {
    var m = G.GLModels.get(fake, id);
    t.ok(!!m, id + " is registered");
    var bands = m.bands;
    t.ok(!!bands, id + " declares a bands field");
    t.eq(bands.length, 2, id + " declares exactly two bands");
    t.eq(bands[0][0], 0, id + " band 0 starts at frame 0");
    t.eq(bands[1][0], bands[0][1],
      id + " band 1 starts where band 0 ends -- no gap, no overlap");
    t.eq(bands[1][0] + bands[1][1], m.frames.length,
      id + " and the two together are the whole frame list");
  });

  // AND THE RENDERER PICKS BETWEEN THEM OFF THE SPRINT. `gaitBand` is asked,
  // never re-derived: a copy of the rule here would agree with itself and
  // prove nothing.
  var model = G.GLModels.get(fake, "enemy-boss_fast");

  var e = new G.Enemy(h.game.path, undefined, "boss_fast");
  t.eq(e.isSprinting(), true, "it spawns inside its opening sprint");
  var dashing = G.World3D.gaitBand(model, e);
  e.progress = G.ul(G.Enemy.TYPES.boss_fast.sprint.untilUl) + 1;
  t.eq(e.isSprinting(), false, "past 400 u.l. the sprint is spent");
  var bounding = G.World3D.gaitBand(model, e);

  t.ok(dashing[0] !== bounding[0],
    "the two states index different bands (" + dashing + " vs " + bounding + ")");
  t.deep(bounding, G.World3D.walkBand(model),
    "the BOUND is band 0 -- the default any reader falls back to");
  t.eq(dashing[0], bounding[1], "the DASH is the band after it");

  // A body with no row in the table keeps the default, whatever it is doing.
  var plain = new G.Enemy(h.game.path, undefined, "fast");
  var plainModel = G.GLModels.get(fake, "enemy-fast");
  t.deep(G.World3D.gaitBand(plainModel, plain), G.World3D.walkBand(plainModel),
    "a type with no gait row draws its default band");
});

test("a broken Vanguard wears the shattered mesh for exactly as long as its shield is gone", function (t) {
  var h = harness.boot();
  var G = h.game;
  var e = new G.Enemy(h.game.path, undefined, "boss_fast");

  // IT ARRIVES WITH ITS SHIELD UP. Its own pulse is seven seconds away and its
  // opening sprint is most of that, so a boss that waited for the first pulse
  // spent the stretch the shield matters most on without one.
  t.eq(e.shield, 100, "it walks on already shielded");
  t.eq(e.shieldMax, 100, "and the bar is drawn against the same pool");
  t.eq(e.shieldFlash, 0,
    "but it did not GAIN one in front of the player, so nothing flashes");
  t.eq(e.shieldOut, false, "a full pool is not a broken one");
  t.eq(G.World3D.enemyModelFor(e), "enemy-boss_fast",
    "so it walks on in one piece");
  t.eq(e.shieldReformProgress(), -1, "and there is no reform to draw");

  // A SUPPORTER THAT SHIELDS OTHERS GETS NOTHING AT SPAWN, which is the half
  // of the rule a bare `support.shield` reading would have broken.
  var giver = new G.Enemy(h.game.path, undefined, "shieldbearer");
  t.eq(giver.shield, 0, "a Shieldbearer arrives with nothing of its own");

  // Its own pulse, on its own timer, refreshing rather than stacking.
  e.supportTimer = 0;
  e.supportAllies(0, [e]);
  t.eq(e.shield, 100, "the pulse refreshes the pool to 100, never past it");
  var gap = e.supportTimer;
  t.eq(gap, G.Enemy.TYPES.boss_fast.support.intervalSeconds,
    "and the next pulse is a full interval away");

  e.takeDamage(e.shield + 5, 0, 0);
  t.eq(e.shieldOut, true, "breaking the pool opens the gap");
  t.eq(e.shieldBroken, true, "and records that this body has stood without one");
  t.eq(e.shieldGapSeconds, gap, "the gap is as long as the wait for the pulse");
  t.eq(e.shieldReformProgress(), 0, "the reform starts at zero, not at nothing");
  t.eq(G.World3D.enemyModelFor(e), "enemy-boss_fast-shattered",
    "and the wreckage is what gets drawn");
  t.ok(!!e.shieldBreakAt, "the road it broke on is recorded for the fragments");

  // HALF WAY. Progress is a share of THIS gap, so it is 0.5 at half of it
  // whatever the gap turned out to be.
  e.supportTimer = gap / 2;
  t.eq(Math.round(e.shieldReformProgress() * 1000), 500,
    "half the gap spent is half the reform done");

  // AND THE PULSE THAT REFILLS IT ENDS THE GAP ON THE SAME FRAME.
  e.supportTimer = 0;
  e.supportAllies(0, [e]);
  t.eq(e.shield, 100, "the pulse puts the shield back");
  t.eq(e.shieldOut, false, "so the gap is closed");
  t.eq(e.shieldReformProgress(), -1, "there is nothing left to reassemble");
  t.eq(G.World3D.enemyModelFor(e), "enemy-boss_fast",
    "and the body is whole again -- the swap goes BOTH ways");
  t.eq(e.shieldBroken, true,
    "`shieldBroken` is one-way and did NOT follow it back");
});

test("the Bulwark's own swap is still one-way, which is the flag it does not share", function (t) {
  var h = harness.boot();
  var G = h.game;
  var b = new G.Enemy(h.game.path, undefined, "shielded");
  t.ok(b.shieldMax > 0, "a Bulwark arrives behind a shield");
  b.takeDamage(b.shield + b.health + 5, 0, 0);
  t.eq(b.shieldBroken, true, "breaking it is permanent");
  // A Shieldbearer's plate closes `shieldOut` and must NOT put the halo back.
  b.grantShield(20, true);
  t.eq(b.shieldOut, false, "a granted plate closes the gap");
  t.eq(b.shieldBroken, true, "and leaves the permanent flag alone");
  t.eq(G.World3D.enemyModelFor(b), "enemy-shielded-broken",
    "so the stripped body stays stripped");
});

test("every shield fragment is its own group, so the renderer can throw it", function (t) {
  var h = harness.boot();
  var G = h.game;
  var fake = { mesh: function () { return {}; } };

  var whole = G.GLModels.get(fake, "enemy-boss_fast");
  var broken = G.GLModels.get(fake, "enemy-boss_fast-shattered");

  function shards(m) {
    return m.groups.filter(function (g) {
      return g.name.indexOf("shard_") === 0 && g.count > 0;
    });
  }
  t.eq(shards(whole).length, 0, "an unbroken shield has no loose pieces");
  t.eq(shards(broken).length, 10, "a broken one has ten, each its own group");
  t.ok(whole.groups.some(function (g) { return g.name === "barrier"; }),
    "and the whole body carries the ring they came off");

  // THE POSITIONS THE RENDERER MEASURES THEM FROM. `get()` did not expose this
  // at all until 2026-08-26, and the shield bubble silently drew at its
  // no-mesh fallback size for every body in the game because of it.
  t.ok(whole.positions && whole.positions.length > 0,
    "an expanded model exposes its vertex positions");
  t.eq(whole.positions.length % 3, 0, "as flat triples");
  t.eq(whole.positions.length / 3,
    whole.groups.reduce(function (n, g) { return n + g.count; }, 0),
    "one position per vertex the groups account for");
});


// ---------------------------------------------------------------------------
// IRONWOOD FRONTIER -- the first board whose scenery is also solid.
//
// Every other route in this game is a polyline on an empty floor, and every
// system that asks a question about a battlefield was written on that
// assumption. This group is what holds the new answers still: shapes, placement,
// sight, bullets, the difficulty measurement, and that none of it leaked onto
// the seven boards that have no terrain at all.
// ---------------------------------------------------------------------------

group("Ironwood Frontier — map geometry");

var MapGeom = require("../js/systems/map-geometry.js");

var CIRCLE = { shape: "circle", x: 100, y: 100, radius: 20 };
var SQUARE = { shape: "polygon", points: [[200, 200], [240, 200], [240, 240], [200, 240]] };
var CAPSULE = { shape: "capsule", a: { x: 300, y: 300 }, b: { x: 400, y: 300 }, radius: 10 };

test("1  circles, polygons and capsules answer contains and crosses", function (t) {
  t.eq(MapGeom.contains(CIRCLE, 100, 100), true, "circle: centre is inside");
  t.eq(MapGeom.contains(CIRCLE, 130, 100), false, "circle: outside is outside");
  t.eq(MapGeom.contains(SQUARE, 220, 220), true, "polygon: inside");
  t.eq(MapGeom.contains(SQUARE, 260, 220), false, "polygon: outside");
  t.eq(MapGeom.contains(CAPSULE, 350, 300), true, "capsule: on the spine");
  t.eq(MapGeom.contains(CAPSULE, 350, 316), false, "capsule: past the radius");

  // Crossings return WHERE, not merely whether -- which is the half that stops
  // a bullet at the near face instead of behind the rock.
  t.near(MapGeom.segmentHit(CIRCLE, 50, 100, 150, 100), 0.30, 1e-9,
    "circle: entered 30% along");
  t.eq(MapGeom.segmentHit(CIRCLE, 50, 200, 150, 200) < 0, true, "circle: clean miss");
  t.near(MapGeom.segmentHit(SQUARE, 180, 220, 260, 220), 0.25, 1e-9, "polygon: 25% along");
  t.near(MapGeom.segmentHit(CAPSULE, 350, 250, 350, 350), 0.40, 1e-9, "capsule: 40% along");

  var first = MapGeom.firstHit([CAPSULE, CIRCLE, SQUARE], 50, 100, 300, 100);
  t.eq(first.shape, CIRCLE, "firstHit returns the NEAREST shape, not the first listed");
  t.near(first.x, 80, 1e-9, "and the contact point on it");
});

test("2  tangency counts as contact, on every shape", function (t) {
  // Exactly on the rim, exactly on the edge, exactly at the radius. The
  // alternative is a band one float wide where the answer depends on rounding.
  t.eq(MapGeom.contains(CIRCLE, 120, 100), true, "circle: exactly r away is touching");
  t.eq(MapGeom.contains(SQUARE, 240, 220), true, "polygon: exactly on an edge");
  t.eq(MapGeom.contains(SQUARE, 240, 240), true, "polygon: exactly on a corner");
  t.eq(MapGeom.contains(CAPSULE, 350, 310), true, "capsule: exactly at the radius");
  t.eq(MapGeom.segmentHit(CIRCLE, 50, 120, 150, 120) >= 0, true,
    "a line that grazes the rim has hit it");
});

test("3  placement inflates a blocker by the tower's real footprint", function (t) {
  // A tower is not a point. 25 px from a 20 px circle is clear for a point and
  // blocked for anything with a 6 px skirt.
  t.eq(MapGeom.contains(CIRCLE, 125, 100), false, "the centre alone is clear");
  t.eq(MapGeom.contains(CIRCLE, 125, 100, 6), true, "the footprint is not");
  t.eq(MapGeom.contains(CIRCLE, 125, 100, 4), false, "and a smaller tower still fits");
});

group("Ironwood Frontier — placement");

function ironwood() {
  var h = harness.boot("ironwood-frontier");
  h.run("cash = 1000000");
  return h;
}
// Authored pixels -> world, the one conversion every coordinate in this group
// goes through. Typing world numbers here would silently break the moment
// UNIT_LENGTH moved, which is the whole point of test 19 below.
function px(h, v) { return h.game.ul(v / h.game.AUTHORED_AT_PX_PER_UL); }

test("4  a tower is built WHERE YOU CLICKED, not in the middle of the stump",
function (t) {
  var h = ironwood();
  var geo = h.game.Maps.geometryOf(h.game.currentMap);
  var stump = geo.platforms[0];

  // OFF CENTRE, and far enough off that a snap would be unmistakable.
  var cursorX = stump.x + stump.radius * 0.5;
  var cursorY = stump.y - stump.radius * 0.4;

  var ghost = h.game.resolveBuildPoint(cursorX, cursorY, h.game.Soldier);
  t.eq(ghost.platform && ghost.platform.id, "stump-p1", "the ghost knows the stump");
  t.near(ghost.x, cursorX, 1e-9, "and does not move the tower in x");
  t.near(ghost.y, cursorY, 1e-9, "or in y");

  // The click goes through the real handler at the same cursor position. This
  // is the regression: it used to land on the stump's centre, so six of the
  // board's best firing positions had exactly one pose each.
  h.run("selectedSlot = 0; refreshBlockReason();");
  h.click(cursorX, cursorY);
  t.eq(h.game.towers.length, 1, "a tower was built");
  t.near(h.game.towers[0].x, cursorX, 1e-9, "under the cursor, in x");
  t.near(h.game.towers[0].y, cursorY, 1e-9, "and in y");

  // Two small towers DO fit on a big stump. There is no "one per platform"
  // rule any more: the footprints decide, exactly as they do on open dirt.
  var far = h.game.whyCannotBuild(stump.x - stump.radius * 0.5,
    stump.y + stump.radius * 0.4, h.game.Soldier);
  t.eq(far, null, "a second tower fits on the far side of a wide stump");
  t.eq(h.game.whyCannotBuild(cursorX + 2, cursorY, h.game.Soldier),
    "overlaps another tower", "but not on top of the first one");
});

test("4b  a tower may be ON a stump or beside it, never half on the rim",
function (t) {
  var h = ironwood();
  var geo = h.game.Maps.geometryOf(h.game.currentMap);
  var pf = geo.platforms[0];
  var fp = h.game.ul(h.game.Soldier.FOOTPRINT_RADIUS_UL);

  // A stump is a raised surface with a hard edge, so there are only two legal
  // poses. A footprint overlapping the rim puts one side on wood two feet up
  // and the other on the dirt, and the model has one ground plane -- which is
  // what "towers placed in the air" looked like before this rule existed.
  t.eq(h.game.whyCannotBuild(pf.x, pf.y, h.game.Soldier), null, "dead centre is fine");
  t.eq(h.game.whyCannotBuild(pf.x + (pf.radius - fp) * 0.98, pf.y, h.game.Soldier),
    null, "and right out to the edge, while the whole footprint is still on");
  t.eq(h.game.whyCannotBuild(pf.x + pf.radius, pf.y, h.game.Soldier),
    "half on the stump", "a centre ON the rim is refused");
  t.eq(h.game.whyCannotBuild(pf.x + pf.radius + fp * 0.5, pf.y, h.game.Soldier),
    "half on the stump", "and so is anything still overlapping it");
  t.eq(h.game.whyCannotBuild(pf.x + pf.radius + fp * 1.2, pf.y, h.game.Soldier), null,
    "clear of it entirely is fine again");

  // A tower simply too wide for the top gets its own answer, because the fix
  // is different: not "move the cursor" but "bring a smaller tower".
  //
  // No tower in the game is that wide on THIS board -- the narrowest stump is
  // 29 and the widest footprint is the Blub's 26 -- and that is a fact about
  // Ironwood's numbers, not a rule. So the branch is exercised with a type that
  // is, which is what stops it rotting before the map that needs it exists.
  var small = geo.platforms[4];                    // stump-p5, the narrowest
  var widest = 0;
  [h.game.Soldier, h.game.Smasher, h.game.BlubTower].forEach(function (ty) {
    widest = Math.max(widest, h.game.ul(ty.FOOTPRINT_RADIUS_UL));
  });
  t.ok(widest <= small.radius,
    "every real tower fits on every stump on this board");
  var Wide = { FOOTPRINT_RADIUS_UL: small.radius / h.game.UNIT_LENGTH + 4,
               COST: 0, BASE_RANGE_UL: 100 };
  t.eq(h.game.whyCannotBuild(small.x, small.y, Wide),
    "too big for this stump", "a wider one is told so, dead centre");

  // TANGENCY IS ON, not half-on, which is the `<=` MapGeometry uses for every
  // other shape on the board. It is a measure-zero case in floating point --
  // radius minus footprint plus footprint is usually a bit short of radius --
  // so it is asserted with numbers chosen to land on it exactly.
  // 0.390625 is 25/64: it survives the multiply by UNIT_LENGTH and the add and
  // subtract of the stump's own x with no rounding at all, which is the only
  // reason this point lands exactly on the rim instead of a hair either side.
  var Exact = { FOOTPRINT_RADIUS_UL: 0.390625, COST: 0, BASE_RANGE_UL: 100 };
  var reach = h.game.ul(Exact.FOOTPRINT_RADIUS_UL);
  var probeX = pf.x + (pf.radius - reach);
  t.eq(Math.abs(probeX - pf.x) + reach, pf.radius, "the test point really is tangent");
  var tangent = h.game.resolveBuildPoint(probeX, pf.y, Exact);
  t.eq(tangent.platform && tangent.platform.id, "stump-p1",
    "a footprint touching the rim from inside is ON the stump");
  t.eq(tangent.straddles, null, "and is not reported as straddling it");
});

test("4c  the road is one curve, and its hard corners are AUTHORED, not guessed",
function (t) {
  var h = ironwood();
  var map = h.game.Maps.byId("ironwood-frontier");
  var authored = map.points;
  var walked = h.game.Maps.walkablePoints(map, authored);

  // ONE LINE, NOT TWO. Smoothing only the picture made enemies cut every
  // rounded corner and visibly walk beside their own road, so the spline is
  // applied once and the walked path is built from it.
  t.ok(walked.length > authored.length * 4, "the walked line is subdivided");
  t.eq(h.game.path.points.length, walked.length,
    "and the loaded path IS that line, not the authored polyline");

  // It passes through every authored point, so the curve never wanders off the
  // shape the map drew.
  authored.forEach(function (p, i) {
    var nearest = Infinity;
    walked.forEach(function (q) {
      var d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < nearest) nearest = d;
    });
    t.ok(nearest < 0.001, "authored point " + i + " is on the curve");
  });

  function turnAt(pts, i) {
    var a = pts[i - 1], b = pts[i], c = pts[i + 1];
    var t1 = Math.atan2(b.y - a.y, b.x - a.x);
    var t2 = Math.atan2(c.y - b.y, c.x - b.x);
    var d = t2 - t1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) * 180 / Math.PI;
  }

  // IRONWOOD MARKS NOTHING SHARP, so nothing on its curve is a corner. The
  // first version classified by turn angle and put four hard angles back into a
  // track the owner had already accepted -- "the path changed and now has weird
  // angles sometimes" -- which is a decision, not a measurement.
  var sharpest = 0;
  for (var i = 1; i < walked.length - 1; i++) {
    sharpest = Math.max(sharpest, turnAt(walked, i));
  }
  t.ok(sharpest < 20, "the whole route bends, nothing kinks (" +
    Math.round(sharpest) + " deg worst)");
  var hardAuthored = 0;
  for (i = 1; i < authored.length - 1; i++) {
    if (turnAt(authored, i) > 60) hardAuthored++;
  }
  t.ok(hardAuthored >= 3,
    "even though the authored polyline has hairpins in it (" + hardAuthored + ")");

  // BUT THE CAPABILITY IS STILL THERE, which is the other half of the brief:
  // a board that wants an angle asks for one, on the vertex it wants it on.
  var marked = authored.map(function (p, i) {
    return i === 9 ? { x: p.x, y: p.y, sharp: true } : { x: p.x, y: p.y };
  });
  var withCorner = h.game.Maps.smoothRoad(marked, 12);
  var keptIt = false;
  for (i = 1; i < withCorner.length - 1; i++) {
    if (Math.hypot(withCorner[i].x - authored[9].x,
                   withCorner[i].y - authored[9].y) < 0.001) {
      keptIt = turnAt(withCorner, i) > 60;
    }
  }
  t.ok(keptIt, "a vertex marked sharp keeps its angle on the curve");

  // The boards that did NOT ask for a curve are untouched -- Rune Circuit is
  // the reference map and its length fixes the u.l. scale for the whole game.
  var plain = h.game.Maps.byId("rune-circuit");
  t.eq(h.game.Maps.walkablePoints(plain, plain.points).length, plain.points.length,
    "a map without curvedRoad keeps its authored polyline exactly");
});

test("4e  if the footprint touches red, the tower cannot go there", function (t) {
  var h = ironwood();
  var g = h.game;
  var type = g.Soldier;
  var fp = g.ul(type.FOOTPRINT_RADIUS_UL);

  // WITH A TOWER ALREADY ON THE BOARD, because the ground a tower has taken is
  // painted too and leaving it out is a red wash that lies by omission.
  h.run("selectedSlot = 0; refreshBlockReason();");
  h.click(760, 300);
  t.eq(g.towers.length, 1, "a tower is standing");

  var rings = g.noBuildRings(type);
  t.ok(rings.length >= 9,
    "the wash covers the road, both structures, five blockers and the tower");

  var geo = g.Maps.geometryOf(g.currentMap);

  // Distance from a point to a closed ring: zero inside it, else the nearest
  // edge. This is what the player's eye does with the painted shape.
  function ringDistance(ring, x, y) {
    var inside = false, best = Infinity;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var ax = ring[i][0], ay = ring[i][1], bx = ring[j][0], by = ring[j][1];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) {
        inside = !inside;
      }
      var dx = bx - ax, dy = by - ay;
      var len2 = dx * dx + dy * dy;
      var u = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(x - (ax + dx * u), y - (ay + dy * u)));
    }
    return inside ? 0 : best;
  }
  function nearestRed(x, y) {
    var best = Infinity, i;
    for (i = 0; i < rings.length; i++) {
      best = Math.min(best, ringDistance(rings[i], x, y));
    }
    // The stump rims are painted as LINES, not areas: on the stump is legal and
    // off it is legal, and only crossing the edge is not.
    for (i = 0; i < geo.platforms.length; i++) {
      var pf = geo.platforms[i];
      best = Math.min(best, Math.abs(Math.hypot(x - pf.x, y - pf.y) - pf.radius));
    }
    return best;
  }

  var SPATIAL = { "too close to the path": 1, "blocked by terrain": 1,
                  "overlaps another tower": 1, "half on the stump": 1,
                  "too big for this stump": 1 };
  var checked = 0, skipped = 0;
  for (var x = 20; x < 1280; x += 17) {
    for (var y = 20; y < 720; y += 17) {
      var d = nearestRed(x, y);
      // The painted circles and capsules are 24-gons, so within a pixel of an
      // edge the drawing and the true shape can disagree by the sagitta. Those
      // points are skipped rather than asserted, and there are few of them.
      if (Math.abs(d - fp) < 1.2) { skipped++; continue; }
      var reason = g.whyCannotBuild(x, y, type);
      var blocked = !!SPATIAL[reason];
      checked++;
      if (blocked !== (d <= fp)) {
        t.eq((d <= fp) ? "touching red" : "clear of red",
          blocked ? "touching red" : "clear of red",
          "at " + x + "," + y + " the game says " + (reason || "buildable"));
        return;
      }
    }
  }
  t.ok(checked > 2500, "checked " + checked + " spots (" + skipped + " on an edge)");
  t.ok(skipped < checked * 0.1, "and almost none of them were ambiguous");
});

test("4d  the route ends OUTSIDE the settlement, at the gate", function (t) {
  var h = ironwood();
  var map = h.game.Maps.byId("ironwood-frontier");
  var oct = map.landmarks.filter(function (l) { return l.id === "human-settlement"; })[0];
  var shape = { shape: "polygon", points: oct.points };
  var pts = map.points;

  // The authored spec put the last two points inside the octagon, so enemies
  // walked through the village and attacked the gate from the wrong side.
  var last = pts[pts.length - 1], prev = pts[pts.length - 2];
  t.eq(MapGeom.contains(shape, last.x, last.y), false,
    "the last point is outside the walls");
  t.eq(MapGeom.contains(shape, prev.x, prev.y), false,
    "and so is the one before it");
  t.ok(last.y >= 330 && last.y <= 390,
    "and it lands inside the gate's 330-390 opening (y = " + last.y + ")");
});

test("4e  the forest never grows through a building, a fence or the road",
function (t) {
  var h = ironwood();
  var Maps = h.game.Maps;
  var map = Maps.byId("ironwood-frontier");
  var keep = Maps.keepOutOf(map);
  t.ok(keep.length > 40, "the board has a keep-out set (" + keep.length + ")");

  // THE AUTHORED LIST IS NOT CLEAN, and that is the point: the foliage is
  // placed in bulk and nobody ever asked it where the buildings were.
  // MEASURED THE WAY THE PASS MEASURES, off `foliageRadiusOf`. Reading `CANOPY`
  // here instead made eleven correctly-placed saplings look like failures: a
  // check that disagrees with the thing it checks is worse than no check.
  function overlaps(list) {
    var hits = 0;
    list.forEach(function (m) {
      var radius = Maps.foliageRadiusOf(m);
      if (radius === null) return;
      for (var i = 0; i < keep.length; i++) {
        var d = Math.hypot(keep[i].x - m.x, keep[i].y - m.y);
        if (d < keep[i].r + radius + Maps.FOLIAGE_CLEARANCE) { hits++; return; }
      }
    });
    return hits;
  }
  t.ok(overlaps(map.models) > 0,
    "the authored forest has props standing in things (" + overlaps(map.models) + ")");
  t.eq(overlaps(Maps.sceneryOf(map)), 0, "and the drawn one has none");

  // Moved, not merely deleted: a gap in a treeline reads as a clearing, so the
  // pass pushes first and only drops what has nowhere to go.
  var report = Maps.foliageReport(map);
  t.ok(report.moved > 0, "some were pushed clear (" + report.moved + ")");
  t.ok(report.moved + report.removed < map.models.length * 0.1,
    "and it is a trim, not a clear-fell (" + (report.moved + report.removed) + ")");

  // BOTH BOARDS READ THE SAME LIST. The flat pass and the mesh builder call
  // `sceneryOf`; if one of them went back to `map.models` the two would grow
  // different forests and only one of them would be checked here.
  t.eq(Maps.sceneryOf(map), Maps.sceneryOf(map), "the answer is cached, not recomputed");
});

test("4f  the forest is eight bodies, placed on purpose and the same every load",
function (t) {
  var h = ironwood();
  var Maps = h.game.Maps;
  var map = Maps.byId("ironwood-frontier");
  var scenery = Maps.sceneryOf(map);
  var trees = scenery.filter(function (m) { return m.kind === "ironwood"; });
  t.ok(trees.length > 900, "the board still plants a forest (" + trees.length + ")");

  // EVERY BODY IS USED. The first version weighted its lists by repeating
  // entries and came out two thirds conifer; the one before that never picked
  // `deadwood` at all, because it was only listed under statures the blighted
  // ground does not have.
  var census = {};
  trees.forEach(function (m) { census[m.variant] = (census[m.variant] || 0) + 1; });
  var kinds = ["great", "conifer", "leaning", "sapling", "broad",
               "storm", "deadwood", "stump"];
  kinds.forEach(function (k) {
    t.ok(census[k] > 0, "the forest contains at least one " + k +
      " (" + (census[k] || 0) + ")");
  });

  // DELIBERATE, NOT UNIFORM. The ground beside the settlement is where the
  // forest was pushed back, so it is broken; the deep rings are not.
  function share(filter, wanted) {
    var n = 0, hit = 0;
    trees.forEach(function (m) {
      if (!filter(m)) return;
      n++;
      if (wanted.indexOf(m.variant) >= 0) hit++;
    });
    return n ? hit / n : 0;
  }
  var broken = ["stump", "deadwood", "storm"];
  var outskirts = share(function (m) {
    return Math.hypot(m.x + 16, m.y - 362) < 470;
  }, broken);
  var deep = share(function (m) { return m.x > 1800 || m.x < -700; }, broken);
  t.ok(outskirts > 0.4, "the settlement's outskirts are mostly broken trees (" +
    Math.round(outskirts * 100) + "%)");
  t.eq(deep, 0, "and the deep forest has none");

  // DETERMINISTIC. The mesh is rebuilt on every load and a forest that
  // reshuffles is a forest the player cannot learn.
  var again = Maps.assignTrees(map.models.map(function (m) {
    var copy = {};
    for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) copy[k] = m[k];
    return copy;
  }), Maps.keepOutOf(map)).filter(function (m) { return m.kind === "ironwood"; });
  var drift = 0;
  for (var i = 0; i < again.length; i++) {
    // `trees` has had the clearance pass over it, so compare the CHOICE rather
    // than the position: a moved tree is still the same body.
    if (again[i].variant !== undefined && census[again[i].variant] === undefined) drift++;
  }
  t.eq(drift, 0, "a second run picks from the same set");
  var second = {};
  again.forEach(function (m) { second[m.variant] = (second[m.variant] || 0) + 1; });
  kinds.forEach(function (k) {
    t.ok(Math.abs((second[k] || 0) - (census[k] || 0)) <= 12,
      "and the same number of them, give or take what the clearance dropped (" +
      k + ": " + (second[k] || 0) + " vs " + (census[k] || 0) + ")");
  });
});

test("5  ordinary ground is still freely buildable", function (t) {
  var h = ironwood();
  // This is not a fixed-slot map: clear dirt away from the road takes a tower
  // anywhere, and the resolver leaves it exactly where the cursor was.
  var x = px(h, 690), y = px(h, 160);
  t.eq(h.game.whyCannotBuild(x, y, h.game.Soldier), null, "clear ground is legal");
  var spot = h.game.resolveBuildPoint(x, y, h.game.Soldier);
  t.eq(spot.platform, null, "no platform involved");
  t.near(spot.x, x, 1e-9, "and no snapping");
});

test("6  all five blockers refuse a tower", function (t) {
  var h = ironwood();
  [["blocker-o1", 365, 405], ["blocker-o2", 470, 297], ["blocker-o3", 740, 385],
   ["blocker-o4", 1010, 340], ["blocker-o5", 759, 249]].forEach(function (b) {
    t.eq(h.game.whyCannotBuild(px(h, b[1]), px(h, b[2]), h.game.Soldier),
      "blocked by terrain", b[0] + " refuses");
  });
});

test("7  the settlement and the depot refuse a tower", function (t) {
  var h = ironwood();
  t.eq(h.game.whyCannotBuild(px(h, 150), px(h, 362), h.game.Soldier),
    "blocked by terrain", "inside the settlement");
  t.eq(h.game.whyCannotBuild(px(h, 1160), px(h, 180), h.game.Soldier),
    "blocked by terrain", "inside the depot");
});

group("Ironwood Frontier — line of sight");

// O5 is the central boulder, spanning roughly x 720-798, y 216-282. A line
// straight through it at y = 249 is blocked; the same line well south of it is
// not. Every sight test below is built on that one pair.
function acrossO5(h) { return { ax: px(h, 640), ay: px(h, 249), bx: px(h, 880), by: px(h, 249) }; }

test("8  a Rifleman cannot acquire through cover", function (t) {
  var h = ironwood();
  var line = acrossO5(h);
  var tower = { x: line.ax, y: line.ay, rangePx: 10000, targeting: "first" };
  var behind = { pos: { x: line.bx, y: line.by }, x: line.bx, y: line.by,
                 dead: false, leaked: false, progress: 10,
                 unclaimedHealth: function () { return 100; } };
  var open = { pos: { x: line.ax + px(h, 60), y: line.ay }, x: line.ax + px(h, 60),
               y: line.ay, dead: false, leaked: false, progress: 5,
               unclaimedHealth: function () { return 100; } };

  t.eq(h.run("Targeting.hasSightTo({x:" + tower.x + ",y:" + tower.y + "}, {pos:{x:" +
    line.bx + ",y:" + line.by + "}})"), false, "the boulder blocks the line");
  t.eq(h.run("Targeting.hasSightTo({x:" + tower.x + ",y:" + tower.y + "}, {pos:{x:" +
    open.x + ",y:" + open.y + "}})"), true, "open ground does not");

  var picked = h.game.Targeting.pick(tower, [behind, open], false);
  t.eq(picked, open, "so the picker takes the enemy it can see, not the nearest one");
  t.eq(h.game.Targeting.pick(tower, [behind], false), null,
    "and takes nothing at all when the only enemy is behind cover");
});

test("9  a Warbringer cannot acquire through cover, but its blast reaches behind it",
function (t) {
  var h = ironwood();
  var line = acrossO5(h);
  var hidden = { pos: { x: line.bx, y: line.by }, dead: false, leaked: false };

  // Placed on legal ground WEST of the boulder, on the same line through it --
  // (640, 249) authored is inside the road's clearance, so the click is refused
  // and placeSmasher hands back null.
  var s = h.placeSmasher(px(h, 612), px(h, 249));
  t.ok(s !== null, "the Warbringer placed on clear ground");
  s.rangePx = h.game.ul(100000);
  s.fullCircle = true;
  // The two halves of the rule, and they are deliberately two functions.
  t.eq(s.canSee(hidden), false, "it cannot SEE a body behind the boulder");
  t.eq(s.sightedIn([hidden]), false, "so it will not start a swing for it");

  // covers() is about the ZONE, and the zone does not care about cover -- a
  // hammer legally swung comes down on an area. This is the intentional
  // exception the brief names.
  var inZone = { pos: { x: line.ax + px(h, 8), y: line.ay }, dead: false, leaked: false };
  t.eq(s.covers(inZone), true, "a body in the wedge is in the wedge");
  t.eq(typeof s.covers, "function", "and covers() never consults terrain");
});

test("10  a Siphon does not lock through cover and drops a lock that goes behind it",
function (t) {
  var h = ironwood();
  var line = acrossO5(h);
  var stats = { range: 100000, deadzone: 0, targetShape: "circle",
                seesFlying: true, seesCamo: true };
  var from = { x: line.ax, y: line.ay };

  t.eq(h.run("RangeFilter.canTarget(" + JSON.stringify(stats) + "," +
    JSON.stringify(from) + ",0,{x:" + line.bx + ",y:" + line.by + "})"), false,
    "it cannot acquire through the boulder");
  t.eq(h.run("RangeFilter.canTarget(" + JSON.stringify(stats) + "," +
    JSON.stringify(from) + ",0,{x:" + (line.ax + px(h, 60)) + ",y:" + line.ay + "})"), true,
    "and can acquire in the open");

  // A lock is re-tested every step through the same predicate, so an enemy that
  // WALKS behind the rock stops being a legal target on the step it does.
  t.eq(h.run("RangeFilter.canTarget(" + JSON.stringify(stats) + "," +
    JSON.stringify(from) + ",0,{x:" + line.bx + ",y:" + line.by + "})"), false,
    "which is what drops the lock");
});

test("11  the Arcane Sniper's ordinary shots respect cover", function (t) {
  var h = ironwood();
  var line = acrossO5(h);
  var stats = { range: 100000, deadzone: 0, targetShape: "circle",
                seesFlying: true, seesCamo: true };
  t.eq(h.run("RangeFilter.canTarget(" + JSON.stringify(stats) + ",{x:" + line.ax +
    ",y:" + line.ay + "},0,{x:" + line.bx + ",y:" + line.by + "})"), false,
    "no ordinary acquisition through the boulder");
  // Cone mode takes the same path, and used to return before the sight test.
  var cone = { range: 100000, deadzone: 0, targetShape: "cone", coneArcDeg: 180,
               seesFlying: true, seesCamo: true };
  t.eq(h.run("RangeFilter.canTarget(" + JSON.stringify(cone) + ",{x:" + line.ax +
    ",y:" + line.ay + "},0,{x:" + line.bx + ",y:" + line.by + "})"), false,
    "cone mode too");
});

test("12  the B5 global ability ignores cover, because global means global",
function (t) {
  var h = ironwood();
  var line = acrossO5(h);
  var ls = new h.game.LongshotTower(line.ax, line.ay, h.game.path);
  for (var i = 0; i < 5; i++) ls.purchase("B");

  var hidden = new h.game.Enemy(h.game.path, 90000);
  hidden.pos = { x: line.bx, y: line.by };

  // The ritual selects the strongest enemy ANYWHERE and never tests the
  // Sniper's own reach -- so a boulder in the way is equally irrelevant.
  t.eq(ls.performAction("ability", { enemies: [hidden] }), "channelling",
    "it fires at a target it cannot see");
  t.eq(ls.channel.target, hidden, "and locks the hidden enemy");
});

group("Ironwood Frontier — bullets and terrain");

// A SHOT DOES NOT COLLIDE WITH THE MAP (2026-08-27, at the owner's ruling).
// Terrain decides what a tower may ACQUIRE and nothing else. These three tests
// asserted the opposite until that date -- a round that stopped on the rock,
// a rail shot that could not tunnel one, a pierce line that ended at cover --
// and they are rewritten rather than deleted, because the shot's behaviour on
// the line through a rock is still a thing that has to be pinned; it is the
// answer that moved.

test("13  a homing bullet flies through terrain to the body it was aimed at",
function (t) {
  var h = ironwood();
  var line = acrossO5(h);
  var target = new h.game.Enemy(h.game.path, 5000);
  target.pos = { x: line.bx, y: line.by };

  var claimed = 0;
  target.reserveDamage = function (n) { claimed += n; };
  target.releaseDamage = function (n) { claimed -= n; };

  var b = new h.game.Bullet(line.ax, line.ay, target, 40, null, null, 0);
  t.eq(claimed, 40, "the shot reserved its damage");

  var hpBefore = target.health;
  for (var i = 0; i < 400 && !b.dead; i++) b.update(1 / 60);
  t.eq(b.dead, true, "the round is spent");
  t.ok(target.health < hpBefore, "on the body behind the boulder, which it reached");
  t.eq(claimed, 0, "and the claim came back, exactly as it does on any hit");
});

test("14  a 14 000 u.l./s rail shot still cannot tunnel past a BODY",
function (t) {
  var h = ironwood();
  var line = acrossO5(h);
  // One step at this speed covers far more than a body is wide. Terrain is no
  // longer swept, but the ENEMY sweep is the same segment test it always was,
  // and it is the half of test 14 that survives the ruling: an endpoint test
  // would sample either side of this enemy and report a clean flight.
  var b = new h.game.PierceBullet({
    x: line.ax, y: line.ay, angle: 0,
    damage: 500, speedUlps: 14000, pierce: 0,
    maxTravelPx: 100000, owner: null
  });
  var midway = new h.game.Enemy(h.game.path, 9000);
  midway.pos = { x: (line.ax + line.bx) / 2, y: line.ay };

  var hp = midway.health;
  b.update(1 / 60, [midway]);
  t.ok(midway.health < hp, "the body on the line took the shot");
  t.eq(b.dead, true, "and a shot with no pierce stopped on it");
});

test("15  a pierce shot walks its whole line, cover included", function (t) {
  var h = ironwood();
  var line = acrossO5(h);
  var infront = new h.game.Enemy(h.game.path, 9000);
  infront.pos = { x: line.ax + px(h, 40), y: line.ay };
  var behind = new h.game.Enemy(h.game.path, 9000);
  behind.pos = { x: line.bx, y: line.by };

  var b = new h.game.PierceBullet({
    x: line.ax, y: line.ay, angle: 0,
    damage: 500, speedUlps: 14000, pierce: 99,
    maxTravelPx: 100000, owner: null
  });
  var frontHp = infront.health, backHp = behind.health;
  b.update(1 / 60, [infront, behind]);

  t.ok(infront.health < frontHp, "the body in front took the shot");
  t.ok(behind.health < backHp, "and so did the one behind the boulder");
  // This is the consequence the ruling buys and it is worth stating in a test
  // rather than only in prose: a piercing round REACHES a body its tower could
  // not have ACQUIRED through. Same family as the Warbringer's blast.
  t.eq(h.run("Targeting.hasSightTo({x:" + line.ax + ",y:" + line.ay +
    "},{pos:{x:" + line.bx + ",y:" + line.by + "}})"), false,
    "which no tower standing there could have picked as a target");
});

group("Ironwood Frontier — measurement and lifecycle");

test("16  the boards with no terrain score exactly what they always did", function (t) {
  var h = harness.boot();
  // Typed on purpose. The subject of this test IS that these numbers did not
  // move when the measurement learned about rocks, so reading them from the
  // analyser would only assert that it equals itself.
  [["rune-circuit", 0.826, "normal"], ["mana-coil", 0.566, "easy"],
   ["sigil-lattice", 0.886, "normal"], ["null-meridian", 1.061, "hard"],
   ["shifting-ley", 0.909, "normal"], ["twin-confluence", 0.863, "normal"]]
  .forEach(function (row) {
    var a = h.game.Maps.analyse(h.game.Maps.byId(row[0]));
    t.near(a.score, row[1], 0.001, row[0] + " scores " + row[1]);
    t.eq(a.tier, row[2], "and is still " + row[2]);
  });
});

test("17  Ironwood Frontier measures as a normal board, from its real geometry",
function (t) {
  var h = harness.boot();
  var map = h.game.Maps.byId("ironwood-frontier");
  var a = h.game.Maps.analyse(map);
  t.eq(a.tier, "normal", "normal");
  t.ok(a.score >= 0.78 && a.score <= 0.90,
    "inside the 0.78-0.90 band the brief asks for (" + a.score.toFixed(3) + ")");
  t.eq(h.game.Maps.DEFAULT_ID, "ironwood-frontier", "and it is the default board");

  // The measurement saw the terrain: a spot inside a blocker is not offered.
  var geo = h.game.Maps.geometryOf(map);
  var inside = 0;
  a.spots.forEach(function (spot) {
    if (MapGeom.containsAny(geo.noBuild, spot.x, spot.y, 0)) inside++;
  });
  t.eq(inside, 0, "no candidate spot sits inside terrain");
});

test("18  switching maps does not leave the previous board's rocks behind",
function (t) {
  var h = harness.boot("ironwood-frontier");
  t.eq(h.game.Maps.geometryOf(h.game.currentMap).blockers.length, 5, "five blockers");
  t.ok(h.run("mapSightBlockers !== null"), "and a sight hook");

  h.run("openMapSelect()");
  h.chooseMap("rune-circuit");
  t.eq(h.game.Maps.geometryOf(h.game.currentMap).any, false,
    "the bare board has no geometry");
  t.eq(h.run("mapSightBlockers"), null, "the sight hook was taken away");
  // And the old rocks are not still refusing placement on the new board.
  t.eq(h.game.whyCannotBuild(px(h, 365), px(h, 405), h.game.Soldier) === "blocked by terrain",
    false, "where a blocker used to be is ordinary ground again");

  h.run("openMapSelect()");
  h.chooseMap("ironwood-frontier");
  t.eq(h.run("mapSightBlockers !== null"), true, "and coming back reinstalls it");
});

test("19  rescaling UNIT_LENGTH moves the route, the blockers and the platforms together",
function (t) {
  var h = harness.boot("ironwood-frontier");
  var map = h.game.Maps.byId("ironwood-frontier");

  function shot() {
    var geo = h.game.Maps.geometryOf(map);
    return {
      route: h.game.path.length,
      blocker: geo.blockers[0].radius,
      blockerX: geo.blockers[0].x,
      platform: geo.platforms[0].radius,
      unit: h.game.UNIT_LENGTH
    };
  }
  var before = shot();

  h.run("UNIT_LENGTH = UNIT_LENGTH * 2; Maps.resetGeometry(); loadMap(currentMap);");
  var after = shot();

  t.near(after.unit / before.unit, 2, 1e-9, "the unit doubled");
  t.near(after.route / before.route, 2, 1e-6, "and so did the route");
  t.near(after.blocker / before.blocker, 2, 1e-9, "and the blocker's radius");
  t.near(after.blockerX / before.blockerX, 2, 1e-9, "and its position");
  t.near(after.platform / before.platform, 2, 1e-9, "and the stump's radius");

  // Sight is proportional too: the same authored line is still blocked.
  t.eq(h.run("MapGeometry.clearLine(mapSightBlockers," +
    h.game.ul(640 / h.game.AUTHORED_AT_PX_PER_UL) + "," +
    h.game.ul(249 / h.game.AUTHORED_AT_PX_PER_UL) + "," +
    h.game.ul(880 / h.game.AUTHORED_AT_PX_PER_UL) + "," +
    h.game.ul(249 / h.game.AUTHORED_AT_PX_PER_UL) + ")"), false,
    "and the boulder still blocks the same authored line");
});

test("20  both pages load every script the game needs, in the same order",
function (t) {
  var fs = require("fs");
  var nodePath = require("path");
  function scripts(page) {
    var html = fs.readFileSync(nodePath.join(__dirname, "..", page), "utf8");
    var out = [], re = /<script\s+src="([^"]+)"\s*>\s*<\/script>/g, m;
    while ((m = re.exec(html)) !== null) out.push(m[1]);
    return out;
  }
  var index = scripts("index.html");
  var sandbox = scripts("sandbox.html");

  ["js/systems/map-geometry.js", "js/systems/range-filter.js", "js/maps.js",
   "js/targeting.js", "js/bullet.js"].forEach(function (file) {
    t.ok(index.indexOf(file) !== -1, "index.html loads " + file);
    t.ok(sandbox.indexOf(file) !== -1, "sandbox.html loads " + file);
  });

  // ORDER, not merely presence. map-geometry defines the shapes range-filter
  // and maps.js ask about, and a classic script that loads after its dependants
  // leaves them holding an undefined global at call time.
  t.ok(index.indexOf("js/systems/map-geometry.js") < index.indexOf("js/systems/range-filter.js"),
    "index.html loads the geometry before the range filter");
  t.ok(index.indexOf("js/systems/map-geometry.js") < index.indexOf("js/maps.js"),
    "and before the maps that compile through it");
  t.ok(sandbox.indexOf("js/systems/map-geometry.js") < sandbox.indexOf("js/systems/range-filter.js"),
    "sandbox.html agrees");
  t.ok(sandbox.indexOf("js/systems/map-geometry.js") < sandbox.indexOf("js/maps.js"),
    "in both places");
});

group("Ironwood Frontier — elevation");

test("21  a stump reaches further, in a straight line, and dirt reaches nothing extra",
function (t) {
  var h = ironwood();
  var g = h.game;
  var geo = g.Maps.geometryOf(g.currentMap);

  function towerAt(x, y) {
    var route = g.nearestPathTo(x, y);
    return new g.Soldier(x, y, route.path);
  }
  var ground = towerAt(700, 300);
  t.eq(ground.groundHeight, 0, "a tower on dirt stands on nothing");
  t.near(ground.rangePx, g.ul(g.Soldier.BASE_RANGE_UL), 1e-9,
    "and reaches exactly its base range");

  // The owner asked for "not abusive -- say 15% on the tallest stump here",
  // and for a straight line under it. Both are checked, not just the endpoint:
  // a cap or a curve would pass a single-point test and is not what was asked.
  var tallest = null, i;
  for (i = 0; i < geo.platforms.length; i++) {
    if (!tallest || geo.platforms[i].height > tallest.height) tallest = geo.platforms[i];
  }
  var top = towerAt(tallest.x, tallest.y);
  t.eq(top.groundHeight, tallest.height, "a tower on a stump stands on the stump");
  t.near(top.rangePx / ground.rangePx, 1.15, 0.005,
    "and the tallest stump is worth +15% reach");

  var slope = null;
  geo.platforms.forEach(function (pf) {
    var tw = towerAt(pf.x, pf.y);
    var bonus = tw.rangePx / ground.rangePx - 1;
    var per = bonus / (pf.height / g.UNIT_LENGTH);
    if (slope === null) slope = per;
    t.near(per, slope, 1e-9, pf.id + " is on the same straight line");
    t.ok(bonus > 0.05 && bonus < 0.16,
      pf.id + " gives " + Math.round(bonus * 1000) / 10 + "%");
  });

  // THE BONUS IS PER u.l., NOT PER PIXEL. `groundHeight` arrives in world
  // pixels, so a rate applied straight to it would double when the unit
  // doubled -- the whole board would quietly gain reach.
  var before = towerAt(tallest.x, tallest.y).rangePx / ground.rangePx;
  h.run("UNIT_LENGTH = UNIT_LENGTH * 1.5; Maps.resetGeometry(); " +
        "loadMap(Maps.byId('ironwood-frontier'));");
  var geo2 = g.Maps.geometryOf(g.currentMap);
  var tall2 = geo2.platforms.filter(function (pf) { return pf.id === tallest.id; })[0];
  var ground2 = towerAt(tall2.x + tall2.radius * 6, tall2.y);
  t.eq(ground2.groundHeight, 0, "the control tower is still on dirt after a rescale");
  t.near(towerAt(tall2.x, tall2.y).rangePx / ground2.rangePx, before, 1e-9,
    "and the bonus survives a rescale of the unit");
});

test("22  the rock you can see IS the rock you collide with", function (t) {
  var h = ironwood();
  var map = h.game.Maps.byId("ironwood-frontier");

  // ONE SOURCE, and this is the assertion that keeps it one. The blockers and
  // the stumps used to be authored TWICE -- a collision shape in `blockers` and
  // a scenery prop in `models` with a size of its own -- and the two numbers
  // were about a factor of two apart, so every rock wore an invisible skirt of
  // hitbox. They are built from the shapes now; a prop of one of these kinds
  // coming back means someone has re-created the second copy.
  var dupes = map.models.filter(function (m) {
    return m.kind === "boulder" || m.kind === "outcrop" ||
           m.kind === "trunk" || m.kind === "platform";
  });
  t.eq(dupes.length, 0,
    "no blocker or stump is authored a second time as a scenery prop");

  // Every solid declares how high it stands, because sight is decided against
  // that number and an undeclared one silently means "nothing clears this".
  map.blockers.forEach(function (b) {
    t.ok(typeof b.height === "number" && b.height > 0,
      b.id + " declares a height");
    // A capsule is a log lying on the ground with a round cross-section, so
    // its crown is one diameter up. Any other pairing draws a log that is not
    // the shape a bullet stops against.
    if (b.shape === "capsule") {
      t.eq(b.height, b.radius * 2, b.id + " is as tall as it is thick");
    }
  });
  map.landmarks.forEach(function (l) {
    t.ok(typeof l.height === "number" && l.height > 0, l.id + " declares a height");
  });
});

test("23  a stump is cover, and standing on one lets you see over things",
function (t) {
  var h = ironwood();
  var g = h.game;
  var geo = g.Maps.geometryOf(g.currentMap);
  function byId(id) {
    return geo.sightBlockers.filter(function (s) { return s.id === id; })[0];
  }
  var log = byId("blocker-o3"), boulder = byId("blocker-o1");
  var stump = byId("stump-p3");                       // the tallest, 25
  t.ok(stump && stump.height > 0, "the stumps are in the sight list at all");

  // A LINE STRAIGHT THROUGH THE LOG, from ground level and from up on a stump.
  var lx = (log.a.x + log.b.x) / 2, ly = (log.a.y + log.b.y) / 2;
  var ax = lx - 120, ay = ly, bx = lx + 120, by = ly;
  t.eq(g.MapGeometry.clearLine([log], ax, ay, bx, by, 0), false,
    "from the floor the log stops the line");
  t.eq(g.MapGeometry.clearLine([log], ax, ay, bx, by, stump.height), true,
    "from the tallest stump it does not");
  t.eq(g.MapGeometry.clearLine([boulder], boulder.x - 200, boulder.y,
    boulder.x + 200, boulder.y, stump.height), false,
    "but a boulder still does, because it is taller than any stump");

  // And the rule runs all the way through the real predicate a tower uses.
  var shooter = { x: ax, y: ay, groundHeight: 0 };
  var target = { x: bx, y: by };
  t.eq(g.RangeFilter.sightClear(shooter, target), false,
    "a tower on the floor cannot see across the log");
  shooter.groundHeight = stump.height;
  t.eq(g.RangeFilter.sightClear(shooter, target), true,
    "the same tower up on a stump can");
});

test("24  terrain decides what may be fired AT, and nothing after that",
function (t) {
  var h = ironwood();
  var g = h.game;
  var geo = g.Maps.geometryOf(g.currentMap);
  var log = geo.sightBlockers.filter(function (s) {
    return s.id === "blocker-o3";
  })[0];
  var lx = (log.a.x + log.b.x) / 2, ly = (log.a.y + log.b.y) / 2;
  var tall = geo.platforms.filter(function (p) { return p.id === "stump-p3"; })[0];

  // TERRAIN DECIDES WHAT MAY BE FIRED AT, AND NOTHING AFTER THAT.
  //
  // This test used to pin the other arrangement -- `terrainHit` taking the same
  // eye height the sight predicate does, so a tower could never see what it
  // could not shoot. That held as an agreement between two rules, and the two
  // did NOT agree: `PierceBullet` never carried an `owner`, so its sweep ran at
  // eye height 0 whatever the tower stood on and an Arcane Sniper on a stump
  // had every round killed by the stump under its own feet. There is one rule
  // now, so there is nothing left for a second one to drift from, and
  // `terrainHit` is gone with the collision it served.
  t.eq(h.run("typeof terrainHit"), "undefined",
    "nothing in the game asks where a shot meets the map any more");

  // The half that DID survive, through the real predicate: sight still refuses.
  var shooter = { x: lx - 120, y: ly, groundHeight: 0 };
  var target = { x: lx + 120, y: ly };
  t.eq(g.RangeFilter.sightClear(shooter, target), false,
    "a tower on the floor still cannot acquire across the log");
  shooter.groundHeight = tall.height;
  t.eq(g.RangeFilter.sightClear(shooter, target), true,
    "and one up on a stump still can");

  // AND THROUGH THE REAL PROJECTILE. Whatever the shooter is standing on, a
  // round that was fired arrives -- which is what makes the acquisition rule
  // above the whole of the rule rather than half of it.
  function fire(owner) {
    var body = new g.Enemy(g.path, 5000);
    body.pos = { x: lx + 130, y: ly };
    body.reserveDamage = function () {};
    body.releaseDamage = function () {};
    var b = new g.Bullet(lx - 130, ly, body, 40, null, owner, 0);
    var hp = body.health;
    for (var i = 0; i < 400 && !b.dead; i++) b.update(1 / 60);
    return { died: b.dead, hit: body.health < hp };
  }
  t.eq(fire({ x: lx - 130, y: ly, groundHeight: 0 }).hit, true,
    "a real round fired from the floor arrives");
  t.eq(fire({ x: lx - 130, y: ly, groundHeight: tall.height }).hit, true,
    "and so does one fired from the tallest stump");
  t.eq(fire(null).hit, true,
    "and so does one whose owner never said where it was standing");
});

test("25  every buildable tower gets the eye and the reach of the stump it stands on",
function (t) {
  var h = ironwood();
  var g = h.game;
  var geo = g.Maps.geometryOf(g.currentMap);
  var tallest = geo.platforms.reduce(function (a, b) {
    return (a && a.height > b.height) ? a : b;
  }, null);

  // OFF THE CENTRE, because dead centre is the one point on a stump that hides
  // this: `silhouetteSpan` bails on a zero-length vector, so a tower measured at
  // the exact middle of its own stump reports no blind spot whatever its eye is.
  var x = tallest.x + tallest.radius * 0.3;
  var y = tallest.y + tallest.radius * 0.1;
  var open = { x: x + g.ul(40), y: y - g.ul(30) };

  // WALKED OFF THE LIVE CATALOGUE, never a list typed here. Test 21 above asks
  // the same question of a Rifleman and passed for months while TWO of the five
  // types carried no `groundHeight` at all -- and a hand-written roster is
  // exactly how the two that were missing stayed missing under a green test
  // named "elevation".
  var cat = g.MetaProgress.catalogue();
  t.ok(cat.length >= 5, "the catalogue holds every buildable type");

  cat.forEach(function (row) {
    var Type = g.MetaProgress.constructorOf(row.id);
    var tower = new Type(x, y, g.nearestPathTo(x, y).path);

    t.eq(tower.groundHeight, tallest.height,
      row.id + " stands on the stump rather than on the floor");
    t.near(tower.rangePx,
      g.elevatedRangePx({ groundHeight: tallest.height }, Type.BASE_RANGE_UL), 1e-9,
      row.id + " reaches the elevated distance the preview draws for it");

    // THE FAILURE THIS PINS, in the one predicate every attacker comes through.
    // A stump is a sight blocker at its own full radius and the tower stands
    // INSIDE it, so an eye left at ground level is an eye inside a rock: on this
    // stump 100% of the rays out of an Arcane Sniper were blocked and it could
    // not acquire a single body anywhere on the board.
    t.eq(g.RangeFilter.sightClear(tower, open), true,
      row.id + " can see off its own stump");
  });
});

test("26  a tower's blind spots are clipped to the reach it actually has",
function (t) {
  var h = ironwood();
  var g = h.game;
  var x = 700, y = 620;
  var route = g.nearestPathTo(x, y).path;

  // ONE ANSWER FOR THREE SPELLINGS. gl-world draws the reach off `towerReach`
  // and game.js clips the red patches to the same answer; two readings of
  // "which shape is this" is a frame where the wedge DRAWN and the wedge SHADED
  // are different wedges on the same tower.
  var circle = g.towerReach(new g.Soldier(x, y, route));
  t.eq(circle.full, true, "a Rifleman covers a circle");
  t.near(circle.arcRad, Math.PI * 2, 1e-12, "a whole turn of it");

  var war = g.towerReach(new g.Smasher(x, y, route));
  t.eq(war.full, false, "a Warbringer's swing is a wedge, not a circle");
  t.near(war.arcRad, 120 * Math.PI / 180, 1e-9, "of exactly its own arcDegrees");

  var ls = new g.LongshotTower(x, y, route);
  var base = g.towerReach(ls);
  t.eq(base.full, true, "an Arcane Sniper starts as a circle");
  t.near(base.inner, g.ul(ls.core.stats.deadzone), 1e-9,
    "with its deadzone as the hole in the middle");

  for (var i = 0; i < 4; i++) ls.purchase("A");
  var cone = g.towerReach(ls);
  t.eq(cone.full, false, "and its cone tier turns it into a wedge");
  t.near(cone.arcRad, ls.core.stats.coneArcDeg * Math.PI / 180, 1e-9,
    "of exactly the arc its RESOLVED stats carry");
  t.eq(cone.aim, ls.core.aimRad, "pointed where the player aimed it");
  t.eq(cone.inner, 0, "and no deadzone, which is what cone mode means");
});

test("27  a tower on a stump actually lands its shots, through the real loop",
function (t) {
  var h = ironwood();
  var g = h.game;
  var geo = g.Maps.geometryOf(g.currentMap);
  var tallest = geo.platforms.reduce(function (a, b) {
    return (a && a.height > b.height) ? a : b;
  }, null);
  h.run("cash = 1000000; enemies.length = 0; waveIndex = WAVES.length;");

  var x = tallest.x + tallest.radius * 0.3;
  var y = tallest.y + tallest.radius * 0.1;
  var ls = new g.LongshotTower(x, y, g.nearestPathTo(x, y).path);
  g.addTower(ls);
  h.spawnAt(200, 4000);
  h.step(20);

  // THE WHOLE REPORT, end to end: it aims, it fires, and the rounds arrive.
  // Every part of this was already true except the last -- the Sniper acquired
  // correctly and had each shot killed on the frame it left the muzzle, because
  // PierceBullet carries no `owner` and the deleted terrain sweep therefore ran
  // at eye height 0 while the tower stood 25 up. Measured on the first step of
  // a real shot from here: blocked by `stump-p3` at t = 0.000.
  t.ok(ls.damageDealt > 0,
    "an Arcane Sniper on the tallest stump lands damage (" +
    Math.round(ls.damageDealt) + ")");

  // And the arithmetic that used to kill it, kept as the thing that must stay
  // false: nothing in the game may sweep a shot against terrain again.
  t.eq(h.run("typeof terrainHit"), "undefined", "no shot meets the map any more");
  var step = g.ul(g.Bullet.BASE_SPEED_ULPS) / 60;
  var old = g.MapGeometry.firstHit(geo.sightBlockers, x, y, x + step, y, 0, 0);
  t.ok(old && old.shape.id === tallest.id && old.t === 0,
    "a sweep at eye zero would still stop it dead on its own stump");
});

test("28  a tower is CLICKED where it is drawn, and its column is not wider than it is",
function (t) {
  var h = ironwood();
  var g = h.game;
  var geo = g.Maps.geometryOf(g.currentMap);
  var tallest = geo.platforms.reduce(function (a, b) {
    return (a && a.height > b.height) ? a : b;
  }, null);
  h.run("cash = 1000000");

  // A STAND-IN CAMERA, because the harness has no WebGL and the real one needs
  // it. It models the two things this rule is about and nothing else: height
  // moves a body UP the screen, so the ground plane under a raised tower is
  // BELOW it; and further down the board is further from the eye. Both signs
  // are the real board's, measured -- world y 160 projects to screen y 436 and
  // world y 460 to 327, so larger world y is higher on screen and further away.
  //
  // `LIFT` is roughly cot(34 degrees), the board's default pitch.
  var LIFT = 1.5, BODY = 40, SHAFT = 60;      // SHAFT = BODY * LIFT, on screen
  h.run("World3D.isEnabled = function () { return true; };" +
        "World3D.groundHeightAt = function (x, y) {" +
        "  return Maps.groundHeightAt(currentMap, x, y); };" +
        "World3D.towerTopOf = function (t) {" +
        "  return (t && t.bodyTopForTest) || " + BODY + "; };" +
        "World3D.screenToWorld = function (x, y) { return { x: x, y: -y }; };" +
        "World3D.camera = function () { return { worldToScreen:" +
        "  function (x, y, z) {" +
        "    return { x: x, y: -y - (z || 0) * " + LIFT + "," +
        "             scale: 1, depth: y }; } }; };");

  var x = tallest.x + tallest.radius * 0.3, y = tallest.y;
  var tower = new g.LongshotTower(x, y, g.nearestPathTo(x, y).path);
  g.addTower(tower);

  var r = tower.footprintPx;
  var shaft = r * g.Tower.HIT_SHAFT_FRACTION;
  var baseY = -y - tallest.height * LIFT;       // where the feet are DRAWN
  var groundY = -y;                             // where z = 0 is, below them

  t.ok(groundY - baseY > r,
    "the drawn base and the ground point under it do not overlap at all (" +
    Math.round(groundY - baseY) + " px apart, against a " + Math.round(r) +
    " px footprint radius)");

  // THE BUG IN THE SHAPE IT SHIPPED IN: converting the click to a world point
  // and asking `towerAt` finds nothing where the tower is drawn, because that
  // world point is the patch of dirt below it.
  var asWorld = g.screenToWorld(x, baseY);
  t.eq(g.towerAt(asWorld.x, asWorld.y), null,
    "the old world-space pick misses the tower it is pointing at");

  t.eq(g.pickTower(x, baseY), tower, "clicking its feet opens it");
  t.eq(g.pickTower(x, baseY - SHAFT * 0.5), tower,
    "and so does clicking halfway up its body");
  t.eq(g.pickTower(x, baseY - SHAFT), tower, "and its head");

  // UP TO THE HEAD AND NO HIGHER. A capsule would hang a footprint's worth of
  // target in the air above it; a cylinder ends where the model does.
  t.eq(g.pickTower(x, baseY - SHAFT - 2), null,
    "two pixels above its head is nothing at all");

  // THE DOME IS THE FOOTPRINT, THE SHAFT IS HALF OF IT. Same distance off the
  // centre line, two different answers, and both are the right one: at ground
  // level the footprint is what the game has always promised a tower occupies,
  // and above it the model is much narrower than that.
  var off = (r + shaft) / 2;                    // between the two radii
  t.ok(off > shaft && off < r, "the sample offset is between the two radii");
  t.eq(g.pickTower(x + off, baseY), tower, "off-centre at its feet is still it");
  t.eq(g.pickTower(x + off, baseY - SHAFT * 0.5), null,
    "the same offset against its BODY is not");

  // THE REPORT THIS SHAPE EXISTS FOR: a Rifleman in front swallowing every
  // click aimed at the body of the one behind it. A wider column does not
  // merely forgive, it steals -- the player points straight at a tower they
  // cannot select, which is worse than the original defect, where at least
  // nothing appeared to be there.
  g.towers.length = 0;
  var near = new g.Soldier(x, y, g.nearestPathTo(x, y).path);
  var far = new g.Soldier(x + 9, y + 30, g.nearestPathTo(x + 9, y + 30).path);
  g.addTower(near); g.addTower(far);
  t.ok(Math.hypot(far.x - near.x, far.y - near.y) >
       near.footprintPx + far.footprintPx,
    "the two stand far enough apart to be legally placed");
  t.ok(far.y > near.y, "and the one being aimed at is the further away");

  // The far tower's feet, which is a point the NEAR one's column reaches: 9 px
  // off its centre line and half way up it. That is the whole precondition --
  // without it the test would pass on a picker that never looked at the near
  // tower at all.
  var onFarBody = { x: far.x, y: -far.y - far.groundHeight * LIFT };
  var nearBaseY = -near.y - near.groundHeight * LIFT;
  var along = (nearBaseY - onFarBody.y) / SHAFT;
  t.ok(along > 0 && along < 1,
    "the sample point is inside the near tower's column, " +
    Math.round(along * 100) + "% of the way up it");
  t.ok(Math.abs(onFarBody.x - near.x) > near.footprintPx *
       g.Tower.HIT_SHAFT_FRACTION &&
       Math.abs(onFarBody.x - near.x) < near.footprintPx,
    "and off its centre line by more than the shaft and less than the footprint");

  t.eq(g.pickTower(onFarBody.x, onFarBody.y), far,
    "clicking the far tower's body selects the far tower");

  // The null control, because a rule that has only ever returned one answer has
  // not been tested: widen the near one's column back to its footprint and it
  // takes the click again.
  near.hitShaftFraction = 1;
  t.eq(g.pickTower(onFarBody.x, onFarBody.y), near,
    "with a full-width column the near tower steals it back");
  near.hitShaftFraction = 0;                    // 0 is falsy -> back to default
  t.eq(g.pickTower(onFarBody.x, onFarBody.y), far, "and narrowed, it does not");

  // NEAREST TO THE CAMERA WINS, tested in BOTH directions. `depth` is world y,
  // and larger y is further from the eye.
  g.towers.length = 0;
  g.addTower(tower);
  var shared = baseY - SHAFT * 0.5;             // inside the raised column
  // Nearer AND tall enough to reach the same pixel: on this camera a body on
  // dirt in front of the stump is drawn LOWER, so only a taller one overlaps.
  var nearer = new g.LongshotTower(x, y - 60, g.nearestPathTo(x, y - 60).path);
  nearer.bodyTopForTest = 120;
  g.addTower(nearer);
  t.eq(nearer.groundHeight, 0, "the second tower is on dirt, not on the stump");
  t.ok(nearer.y < tower.y, "and nearer the eye");
  t.eq(g.pickTower(x, shared), nearer,
    "a column NEARER the eye takes the click off the raised one");

  g.towers.splice(g.towers.indexOf(nearer), 1);
  var further = new g.LongshotTower(x, y + 50, g.nearestPathTo(x, y + 50).path);
  g.addTower(further);
  t.eq(g.pickTower(x, shared), tower,
    "and a column FURTHER away leaves it with the raised tower");

  // AND THE FLAT BOARD IS UNTOUCHED: with no 3D renderer, picking is exactly
  // the world-space footprint test it has always been.
  h.run("World3D.isEnabled = function () { return false; };");
  t.eq(g.pickTower(x, y), tower,
    "on a flat board the ground point under a tower IS the tower");
});


test("29  the cursor lands on the SURFACE, and every rule painted about it is on that surface too",
function (t) {
  var h = ironwood();
  var g = h.game;
  var geo = g.Maps.geometryOf(g.currentMap);
  var tallest = geo.platforms.reduce(function (a, b) {
    return (a && a.height > b.height) ? a : b;
  }, null);

  // THE SEAM THAT MAKES IT POSSIBLE, against the real camera. `groundAt` cast
  // the ray at a plane the solver held as a literal zero; `planeAt` is the same
  // solver with the plane as an argument, and World3D.screenToWorld brackets
  // the ray between the top of the board and its bottom with two of them.
  var cam = new g.OrbitCamera({
    width: 1280, height: 720, style: {},
    addEventListener: function () {},
    removeEventListener: function () {},
    getBoundingClientRect: function () {
      return { left: 0, top: 0, width: 1280, height: 720 };
    }
  });
  cam.viewport = { width: 1280, height: 720 };

  var flat = cam.groundAt(640, 400);
  var same = cam.planeAt(640, 400, 0);
  t.near(same[0], flat[0], 1e-12, "planeAt at zero is groundAt, to the float");
  t.near(same[1], flat[1], 1e-12, "in both axes");
  t.eq(same[2], 0, "and it reports the plane it solved");

  // A HIGHER PLANE IS HIT SOONER, and the offset is linear in the height --
  // which is what makes the walk between the two a short one rather than a
  // march to the horizon.
  var up10 = cam.planeAt(640, 400, 10);
  var up20 = cam.planeAt(640, 400, 20);
  var d10 = Math.hypot(up10[0] - flat[0], up10[1] - flat[1]);
  var d20 = Math.hypot(up20[0] - flat[0], up20[1] - flat[1]);
  t.ok(d10 > 1, "ten units up is a different point on the board (" +
    Math.round(d10) + " units)");
  t.near(d20 / d10, 2, 1e-9, "and twenty is exactly twice as far");
  t.eq(up20[2], 20, "at the plane it was asked for");

  // WHAT THE RULE IS PAINTED ON. `projectRing` drapes a ground decal over the
  // board per point, and takes an authored height where the ring lies ON a
  // discontinuity -- a stump's rim and a tower's footprint both do, and a
  // sampled height along that edge answers two different levels one point
  // apart.
  var fake = { calls: [], worldToScreen: function (x, y, z) {
    this.calls.push([x, y, z]); return { x: x, y: y - z, scale: 1, depth: y }; } };
  // The renderer's height field is a GRID -- 6 unit cells, each answering for
  // its own centre -- and that is the half of it this test has to model, since
  // it is the whole reason a rim declares its height instead of sampling. On
  // the real board, measured in a browser, the tallest stump's 28-point rim
  // samples 20 points at the floor and 8 on the stump; one of the six reads
  // SIX different levels, because the road ramp runs past it.
  h.run("World3D.groundHeightAt = function (x, y) {" +
        "  var c = 6;" +
        "  return Maps.groundHeightAt(currentMap," +
        "    Math.floor(x / c) * c + c / 2, Math.floor(y / c) * c + c / 2); };");

  var declared = g.circleRing(tallest.x, tallest.y, tallest.radius, 28);
  declared.z = tallest.height;
  fake.calls.length = 0;
  g.projectRing(declared, fake);
  t.eq(fake.calls.every(function (c) { return c[2] === tallest.height; }), true,
    "a ring that declares its height is projected at that height, every point");

  // The same ring WITHOUT the declaration is sampled, and on the rim that is
  // exactly where sampling stops having one answer.
  var sampled = g.circleRing(tallest.x, tallest.y, tallest.radius, 28);
  fake.calls.length = 0;
  g.projectRing(sampled, fake);
  var levels = {};
  fake.calls.forEach(function (c) { levels[c[2]] = true; });
  t.ok(Object.keys(levels).length > 1,
    "the same ring sampled comes back on " + Object.keys(levels).length +
    " different levels, which is why the rim declares one");

  // And a decal that is NOT on an edge drapes, which is the whole point: a ring
  // well inside the stump is on the stump, not under it.
  var inside = g.circleRing(tallest.x, tallest.y, tallest.radius * 0.4, 8);
  fake.calls.length = 0;
  g.projectRing(inside, fake);
  t.eq(fake.calls.every(function (c) { return c[2] === tallest.height; }), true,
    "a ring inside the stump is draped onto the stump");

  var offBoard = g.circleRing(tallest.x, tallest.y + 400, 20, 8);
  fake.calls.length = 0;
  g.projectRing(offBoard, fake);
  t.eq(fake.calls.every(function (c) { return c[2] === 0; }), true,
    "and one on open dirt is on the floor, exactly as it always was");
});

group("Day and night — the clock");

// The cycle is a module, so most of this drives it directly. Where the point is
// that the GAME drives it -- pause, speed, restart -- it goes through the real
// loop, because that is the claim.
function cyc(h) { return h.game.EnvironmentCycle; }
function lit(h) { return h.game.EnvironmentLighting; }

test("E1  a run opens at the authored morning, and every run opens at the same one",
function (t) {
  var h = harness.boot();
  t.eq(cyc(h).CYCLE_SECONDS, 480, "one cycle is eight simulated minutes");
  t.eq(cyc(h).START_PHASE, 0.10, "and a run opens at 0.10");
  t.near(cyc(h).state().phase, 0.10, 1e-12, "which is where this one is");
  t.eq(cyc(h).state().cycleIndex, 0, "on its first day");
  t.eq(cyc(h).state().visualPhase, "day", "early morning, sun already up");

  // Run it a while, then start another. A second run that inherited the first
  // one's afternoon is the leak this pins.
  //
  // Sixty seconds rather than a whole day, because a harness boot has no towers
  // on it: leave it running long enough and the base falls, the run freezes and
  // so does the sky -- which would make this pass for the wrong reason.
  h.step(60);
  t.near(cyc(h).state().phase, 0.10 + 60 / 480, 1e-4, "the first run got somewhere");
  h.run("restartGame();");
  t.near(cyc(h).state().phase, 0.10, 1e-12, "and the next one is morning again");
});

test("E2  the phase advances on simulation time and nothing else", function (t) {
  var h = harness.boot();
  var before = cyc(h).state().elapsedSeconds;
  h.step(120);
  t.near(cyc(h).state().elapsedSeconds - before, 120, 0.02,
    "120 simulated seconds moved the clock 120 seconds");
  t.near(cyc(h).state().phase, 0.10 + 120 / 480, 1e-4, "which is a quarter turn");
});

test("E3  pause freezes the sky and resume continues it exactly", function (t) {
  var h = harness.boot();
  h.step(30);
  var frozen = cyc(h).state().elapsedSeconds;
  h.run("paused = true;");
  h.step(240);
  t.eq(cyc(h).state().elapsedSeconds, frozen, "four minutes of paused time cost nothing");
  h.run("paused = false;");
  h.step(30);
  t.near(cyc(h).state().elapsedSeconds - frozen, 30, 0.02, "and it picks up where it was");
});

test("E4  game speed carries the cycle with it, without the cycle knowing",
function (t) {
  var h = harness.boot();
  var start = cyc(h).state().elapsedSeconds;
  h.wallClock(20);
  var atOne = cyc(h).state().elapsedSeconds - start;

  var h3 = harness.boot();
  h3.run("gameSpeed = 3;");
  var start3 = cyc(h3).state().elapsedSeconds;
  h3.wallClock(20);
  var atThree = cyc(h3).state().elapsedSeconds - start3;

  t.near(atThree / atOne, 3, 0.02,
    "three times the speed is three times the day (" + atOne.toFixed(1) +
    "s vs " + atThree.toFixed(1) + "s)");
});

test("E5  the phase wraps after exactly one cycle, and the index counts the wraps",
function (t) {
  var h = harness.boot();
  var c = cyc(h);
  c.__resetForTest();
  c.begin();
  t.eq(c.state().cycleIndex, 0, "no cycles yet");
  c.update(480 * 0.90 - 1e-9);          // one tick short of the wrap
  t.ok(c.state().phase > 0.99, "just before sunrise (" +
    c.state().phase.toFixed(4) + ")");
  t.eq(c.state().cycleIndex, 0, "still the first day");
  c.update(2e-9 + 0.001);
  t.ok(c.state().phase < 0.01, "and over the top (" + c.state().phase.toFixed(4) + ")");
  t.eq(c.state().cycleIndex, 1, "one whole cycle behind it");
  c.update(480);
  t.eq(c.state().cycleIndex, 2, "and a second");
});

test("E6  exactly one of day and night is true, at every phase there is",
function (t) {
  var h = harness.boot();
  var c = cyc(h);
  var both = 0, neither = 0;
  for (var i = 0; i <= 4000; i++) {
    var st = c.stateAt(i / 4000);
    if (st.isDay && st.isNight) both++;
    if (!st.isDay && !st.isNight) neither++;
    if (st.solarPeriod !== (st.isDay ? "day" : "night")) neither++;
  }
  t.eq(both, 0, "never both");
  t.eq(neither, 0, "never neither, and solarPeriod always agrees");
  t.eq(c.stateAt(0).isDay, true, "the instant of sunrise is day");
  t.eq(c.stateAt(0.5).isNight, true, "the instant of sunset is night");
});

test("E7  sunrise and sunset fire exactly once each, in order", function (t) {
  var h = harness.boot();
  var c = cyc(h);
  c.__resetForTest();
  var log = [];
  c.on("sunrise", function () { log.push("sunrise"); });
  c.on("sunset", function () { log.push("sunset"); });
  c.on("cycle", function () { log.push("cycle"); });
  c.begin();
  for (var i = 0; i < 480 / 0.25; i++) c.update(0.25);   // one whole cycle
  // Opening at 0.10 and running a full turn crosses sunset once and sunrise
  // once, and the cycle boundary is the sunrise.
  t.eq(log.join(","), "sunset,cycle,sunrise", "one of each, in the order they happen");
});

test("E8  a step that swallows whole days loses none of its crossings",
function (t) {
  var h = harness.boot();
  var c = cyc(h);
  c.__resetForTest();
  var sunrises = 0, sunsets = 0, cycles = 0;
  c.on("sunrise", function () { sunrises++; });
  c.on("sunset", function () { sunsets++; });
  c.on("cycle", function () { cycles++; });
  c.begin();                                   // phase 0.10
  // THREE AND A HALF DAYS IN ONE CALL. A before/after phase comparison reports
  // one crossing here and silently drops five, which is the bug this exists to
  // make impossible.
  c.update(480 * 3.5);
  t.eq(sunsets, 4, "four sunsets");
  t.eq(sunrises, 3, "three sunrises");
  t.eq(cycles, 3, "three completed cycles");
  t.eq(c.state().cycleIndex, 3, "and the index agrees with the events");
  t.near(c.state().phase, 0.60, 1e-9, "landing where the arithmetic says");
});

test("E9  leaving a run stops the clock, and the next run is a new day",
function (t) {
  var h = harness.boot();
  h.step(300);
  var left = cyc(h).state().phase;
  h.run("openMenu();");
  t.eq(cyc(h).state().active, false, "no clock on the title screen");
  h.step(600);
  t.near(cyc(h).state().phase, left, 1e-12, "and the menu costs no time");
  h.run("startRun(currentMap);");
  t.near(cyc(h).state().phase, 0.10, 1e-12, "the next run is morning again");
  t.eq(cyc(h).state().cycleIndex, 0, "with its own cycle count");
});

group("Day and night — the light");

test("E10  lighting is continuous everywhere, including across both crossings",
function (t) {
  var h = harness.boot();
  var c = cyc(h), L = lit(h);
  // Sampled finely all the way round. The claim is not "smooth to the eye", it
  // is that no adjacent pair of phases differs by more than a small bound --
  // which is what a band edge used as a switch would violate immediately.
  var STEPS = 2400, worst = 0, worstAt = 0, worstWhat = "";
  var prev = L.compose(c.stateAt(0), []);
  function jump(a, b, what) {
    var d = 0;
    for (var i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
    if (d > worst) { worst = d; worstWhat = what; }
    return d;
  }
  for (var s = 1; s <= STEPS; s++) {
    var phase = s / STEPS;
    var now = L.compose(c.stateAt(phase), []);
    jump(now.sky.zenith, prev.sky.zenith, "zenith");
    jump(now.sky.horizon, prev.sky.horizon, "horizon");
    jump(now.light.ambient, prev.light.ambient, "ambient");
    jump(now.light.fillColour, prev.light.fillColour, "fill");
    var ds = Math.abs(now.light.keyStrength - prev.light.keyStrength);
    if (ds > worst) { worst = ds; worstWhat = "keyStrength"; }
    // Normalised by its own range: the emissive multiplier travels from 1 to
    // 3.6, so a raw delta compared against a colour channel's would be judged
    // three and a half times as harshly for the same smoothness.
    var de = Math.abs(now.sceneryEmissive - prev.sceneryEmissive) / 3.6;
    if (de > worst) { worst = de; worstWhat = "emissive"; }
    if (worst > 0.02) { worstAt = phase; break; }
    prev = now;
  }
  t.ok(worst <= 0.02, "no channel steps more than 0.02 between adjacent phases (" +
    "worst " + worst.toFixed(4) + " on " + worstWhat +
    (worstAt ? " at phase " + worstAt.toFixed(4) : "") + ")");

  // AND THE KEY DIRECTION DOES NOT JUMP EITHER. It swaps from the sun to the
  // moon at the horizon, which is legal only because both carry zero strength
  // there -- so what is pinned is the CONTRIBUTION, not the vector.
  var atSwap = L.compose(c.stateAt(0.5), []);
  t.ok(atSwap.light.keyStrength < 0.02,
    "the key is dark where it changes body (" +
    atSwap.light.keyStrength.toFixed(4) + ")");
});

test("E11  morning, noon and midnight are three different places", function (t) {
  var h = harness.boot();
  var c = cyc(h), L = lit(h);
  var noon = L.compose(c.stateAt(0.25), []);
  var night = L.compose(c.stateAt(0.75), []);
  var dusk = L.compose(c.stateAt(0.50), []);

  t.ok(noon.light.keyStrength > 1.0, "noon is full daylight (" +
    noon.light.keyStrength.toFixed(2) + ")");
  t.ok(night.light.keyStrength < 0.35 && night.light.keyStrength > 0.05,
    "midnight is moonlight, weak but not absent (" +
    night.light.keyStrength.toFixed(3) + ")");
  t.ok(night.light.ambient[2] > night.light.ambient[0],
    "and it is COOL: more blue than red");
  t.ok(noon.light.ambient[0] > night.light.ambient[0] * 2,
    "day is more than twice as bright as night in ambient");
  t.ok(night.sceneryEmissive > noon.sceneryEmissive * 2,
    "the map's own lights are up at night (" + night.sceneryEmissive.toFixed(2) +
    " against " + noon.sceneryEmissive.toFixed(2) + ")");
  t.ok(dusk.sky.horizon[0] > dusk.sky.horizon[2],
    "and dusk's horizon is warm: more red than blue");
  t.ok(noon.sky.zenith[2] > noon.sky.zenith[0], "noon's zenith is blue");
  t.ok(night.sky.zenith[0] + night.sky.zenith[1] + night.sky.zenith[2] > 0.001,
    "night is never pure black");
});

test("E12  dawn and dusk are travelled through, not switched to", function (t) {
  var h = harness.boot();
  var c = cyc(h), L = lit(h);
  // Across the whole dusk band the horizon must move MONOTONICALLY toward warm
  // and back -- a crossfade with a hard edge shows up as a run of identical
  // samples followed by a step.
  var warm = [];
  for (var i = 0; i <= 40; i++) {
    var e = L.compose(c.stateAt(0.42 + (0.55 - 0.42) * i / 40), []);
    warm.push(e.sky.horizon[0] - e.sky.horizon[2]);
  }
  var rose = 0, fell = 0, flat = 0;
  for (i = 1; i < warm.length; i++) {
    var d = warm[i] - warm[i - 1];
    if (Math.abs(d) < 1e-9) flat++; else if (d > 0) rose++; else fell++;
  }
  t.ok(rose > 4 && fell > 4, "the warmth rises and then falls again");
  t.eq(flat, 0, "and never sits still, which a crossfade with an edge would");
  t.ok(Math.max.apply(null, warm) > 0.05, "dusk really is warm at its peak");
});

test("E13  the stars are out at night and gone by day", function (t) {
  var h = harness.boot();
  var c = cyc(h), L = lit(h);
  [0.10, 0.20, 0.25, 0.32, 0.40].forEach(function (p) {
    t.eq(L.compose(c.stateAt(p), []).sky.starIntensity, 0,
      "no stars at phase " + p);
  });
  t.ok(L.compose(c.stateAt(0.75), []).sky.starIntensity > 0.95,
    "and a full field at midnight");
  t.ok(L.compose(c.stateAt(0.52), []).sky.starIntensity < 0.5,
    "coming up gradually just after sunset");
});

test("E14  the sun and the moon are the same body on opposite sides", function (t) {
  var h = harness.boot();
  var c = cyc(h), L = lit(h);
  for (var i = 0; i <= 24; i++) {
    var e = L.compose(c.stateAt(i / 24), []);
    var dot = e.sun.dir[0] * e.moon.dir[0] + e.sun.dir[1] * e.moon.dir[1] +
              e.sun.dir[2] * e.moon.dir[2];
    t.near(dot, -1, 1e-12, "opposite at phase " + (i / 24).toFixed(3));
    t.near(Math.hypot(e.sun.dir[0], e.sun.dir[1], e.sun.dir[2]), 1, 1e-12,
      "and unit length");
    // ABOVE THE HORIZON EXACTLY WHILE IT IS DAY. Stated as a pair of
    // implications rather than an equality, because at the two crossings the
    // height is exactly zero and "above" is neither true nor false there --
    // which is precisely why the day/night split is half-open.
    //
    // To a tolerance, because sin(PI) is 1.2e-16 rather than zero and the
    // half-open day/night split puts phase 0.5 on the night side of a height
    // that is positive by one part in ten thousand million million.
    t.ok(!e.cycle.isDay || e.sun.dir[2] >= -1e-9,
      "day means the sun is not below, at " + (i / 24).toFixed(3));
    t.ok(!e.cycle.isNight || e.sun.dir[2] <= 1e-9,
      "night means the sun is not above, at " + (i / 24).toFixed(3));
  }
  var dawn = L.compose(c.stateAt(0.02), []);
  var eve = L.compose(c.stateAt(0.48), []);
  t.ok(dawn.sun.dir[0] > 0.9, "the morning sun is east");
  t.ok(eve.sun.dir[0] < -0.9, "the evening sun is west");
});

test("E15  the same phase is the same sky, every time", function (t) {
  var h = harness.boot();
  var c = cyc(h), L = lit(h);
  var a = L.compose(c.stateAt(0.63), []);
  // A different clock reading of the SAME phase: three cycles later.
  c.__setPhaseForTest(0.63, { cycleIndex: 3 });
  var b = L.of(c.state());
  t.eq(JSON.stringify({ sky: a.sky, sun: a.sun, moon: a.moon, light: a.light,
                        emissive: a.sceneryEmissive }),
       JSON.stringify({ sky: b.sky, sun: b.sun, moon: b.moon, light: b.light,
                        emissive: b.sceneryEmissive }),
    "identical, to the last digit");
  c.__resetForTest();
});

group("Day and night — the modifier seam");

test("E16  an empty modifier list is not a code path, it is nothing", function (t) {
  var h = harness.boot();
  var c = cyc(h), L = lit(h);
  t.eq(L.list().length, 0, "nothing ships with a modifier");
  for (var i = 0; i <= 12; i++) {
    var p = i / 12;
    var bare = L.base(c.stateAt(p));
    var composed = L.compose(c.stateAt(p), []);
    t.eq(JSON.stringify(composed.sky), JSON.stringify(bare.sky),
      "phase " + p.toFixed(2) + " is untouched");
    t.eq(composed.tags.length, 0, "and carries no tags");
  }
});

test("E17  modifiers compose by priority then by id, and by nothing else",
function (t) {
  var h = harness.boot();
  var c = cyc(h), L = lit(h);
  var state = c.stateAt(0.25);
  function tint(id, priority, colour) {
    return { id: id, priority: priority, weight: 1,
             light: { ambient: colour } };
  }
  var red = tint("bravo", 10, [0.9, 0, 0]);
  var green = tint("alpha", 10, [0, 0.9, 0]);
  var blue = tint("zulu", 20, [0, 0, 0.9]);

  // Same priority: the ID orders them, so "bravo" lands after "alpha" and wins.
  var ab = L.compose(state, [red, green]);
  var ba = L.compose(state, [green, red]);
  t.eq(JSON.stringify(ab.light.ambient), JSON.stringify(ba.light.ambient),
    "insertion order does not matter");
  t.eq(JSON.stringify(ab.light.ambient), JSON.stringify([0.9, 0, 0]),
    "and the later id is the one on top");

  // Priority beats the id.
  var all = L.compose(state, [blue, red, green]);
  t.eq(JSON.stringify(all.light.ambient), JSON.stringify([0, 0, 0.9]),
    "the higher priority is applied last whatever it is called");

  // A partial weight is a blend, not a switch.
  var half = L.compose(state, [{ id: "half", priority: 1, weight: 0.5,
    light: { keyStrength: 0 } }]);
  t.near(half.light.keyStrength, L.base(state).light.keyStrength / 2, 1e-9,
    "half weight is half way");
});

test("E18  an eclipse may darken noon without making it night", function (t) {
  var h = harness.boot();
  var c = cyc(h), L = lit(h);
  var noon = c.stateAt(0.25);
  var eclipse = {
    id: "eclipse", priority: 50, weight: 1, tags: ["eclipse"],
    sky: { zenith: [0.004, 0.005, 0.010], horizon: [0.02, 0.016, 0.02],
           starIntensity: 0.7 },
    light: { keyStrength: 0.06, ambient: [0.02, 0.022, 0.03] },
    emissive: 3.4
  };
  var e = L.compose(noon, [eclipse]);

  // THE WHOLE POINT OF THE SEAM, in four assertions: the world went dark and
  // the sky did not stop being daytime. A modifier that could flip solarPeriod
  // would make "is it day" mean two different things depending on the weather.
  t.eq(e.cycle.isDay, true, "it is still day");
  t.eq(e.cycle.solarPeriod, "day", "astronomically, still day");
  t.eq(e.cycle.isNight, false, "and not night");
  t.ok(e.tags.indexOf("eclipse") >= 0, "but the eclipse is on the board");
  t.ok(e.light.keyStrength < L.base(noon).light.keyStrength * 0.1,
    "and the light is gone");
  t.ok(e.sceneryEmissive > L.base(noon).sceneryEmissive * 2,
    "so the lanterns came on at midday");
  t.eq(L.base(noon).tags.length, 0, "with none of it leaking into the base");
});

group("Day and night — what the renderers are handed");

test("E19  both renderers read one snapshot, and previews are never in it",
function (t) {
  var h = harness.boot();
  h.step(140);                                 // somewhere in the afternoon
  var state = h.game.worldRenderState();
  t.ok(!!state.environment, "the render state carries the environment");
  t.eq(state.environment.cycle.phase, cyc(h).state().phase,
    "and it is the live cycle, not a copy that can drift");

  // THE CARD IS A FIXED MORNING. Run the clock to the middle of the night and
  // ask again: a thumbnail that followed the run would show eight dark forests
  // to a player choosing a route at 3am.
  cyc(h).__setPhaseForTest(0.78);
  var card = h.game.thumbnailEnvironment();
  t.eq(card.cycle.isDay, true, "the card is daylight");
  t.near(card.cycle.phase, 0.22, 1e-12, "at the one authored phase");
  t.eq(card.cycle.starIntensity, undefined, "with no run state on it");
  t.eq(h.game.thumbnailEnvironment().cycle.phase, card.cycle.phase,
    "and it is the same every time it is asked");

  // Outside a run the world is lit by the idle morning rather than by whatever
  // time it was when the player quit.
  h.run("openMenu();");
  var idle = h.game.worldRenderState().environment;
  t.eq(idle.cycle.isDay, true, "the menu is daylight");
  t.eq(idle.cycle.active, false, "and no run is running");
});

test("E20  the visual cycle changes nothing about the game", function (t) {
  // The claim is that this whole system is decoration. Two runs, one played
  // through a whole simulated day and one through a fraction of one, must kill
  // the same enemies for the same money -- if the sky ever touches a stat, the
  // arithmetic below stops matching.
  var h = harness.boot();
  h.run("cash = 100000; selectedSlot = 0; refreshBlockReason();");
  var spot = { x: 700, y: 300 };
  h.click(spot.x, spot.y);
  t.eq(h.game.towers.length, 1, "a tower is standing");

  var before = { cash: h.game.cash, hp: h.game.baseHp, kills: h.game.runKills };
  cyc(h).__setPhaseForTest(0.75);              // midnight
  h.step(60);
  var atNight = { cash: h.game.cash, hp: h.game.baseHp, kills: h.game.runKills };

  var h2 = harness.boot();
  h2.run("cash = 100000; selectedSlot = 0; refreshBlockReason();");
  h2.click(spot.x, spot.y);
  cyc(h2).__setPhaseForTest(0.25);             // noon
  h2.step(60);

  t.eq(atNight.kills, h2.game.runKills, "the same kills at midnight and at noon");
  t.eq(atNight.cash, h2.game.cash, "the same money");
  t.eq(atNight.hp, h2.game.baseHp, "the same base");
  t.ok(before.kills >= 0, "and the run really ran");
});


runner.run();
