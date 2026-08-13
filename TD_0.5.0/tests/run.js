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

test("the schedule is the authored thirty-five waves, opening intact", function (t) {
  var h = harness.boot();
  var W = h.game.WAVES;

  t.eq(W.length, 35, "thirty-five waves");
  t.eq(h.game.WAVE_BREAK, 90, "break between waves");
  t.eq(h.game.WAVE_CALL_DELAY, 3, "a called wave takes three seconds to arrive");
  t.eq(h.game.BASE_MAX_HP, 100, "starting base HP");

  // WAVES 1-11 ARE THE INTRODUCTION AND ARE PINNED EXACTLY. One type per
  // wave, no `groups`, no v0.4.7 content -- the game teaches its first five
  // bodies here one at a time.
  //
  // WAVES 1-4 MUST NEVER MOVE: the starting-stake economy is measured against
  // their exact shape. From 5 on they carry `health` overrides (2026-07-30,
  // "make the hp per wave scaling even bigger") -- an override changes
  // toughness and nothing else, so the lesson each wave teaches is untouched.
  t.deep(W.slice(0, 11), [
    { count: 5,  interval: 0.8 },
    { count: 8,  interval: 1 },
    { count: 8,  interval: 0.6,  type: "fast" },
    { count: 12, interval: 0.7 },
    { count: 6,  interval: 1.4,  type: "slow",    health: 9 },
    { count: 14, interval: 0.4,  type: "fast",    health: 3 },
    { count: 20, interval: 0.28, type: "swarm" },
    { count: 16, interval: 0.55, health: 6 },
    { count: 10, interval: 0.9,  type: "armored", health: 7 },
    { count: 10, interval: 1,    type: "slow",    health: 14 },
    { count: 1,  interval: 1,    type: "midboss" }
  ], "the introduction, up to and including the midboss");

  // A health override changes toughness only, never the type's identity, its
  // speed or its DEFENCES -- that is the whole reason overriding is safe. A
  // scaled brute is still a brute, 5 flat armor and all.
  var brute = h.game.waveGroups(W[30])[1];
  t.eq(h.game.Enemy.healthOf(brute.type, brute.health), 100, "wave 31's brutes are scaled to 100 HP");
  t.eq(h.game.Enemy.typeOf(brute.type).armor, 5, "and still carry their 5 flat armor");

  // And a scaled Bulwark still gets twice its NEW health in shield, because
  // the shield is sized off the instance rather than declared as a number.
  var bulwark = h.game.waveGroups(W[34])[4];
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

  t.ok(Math.abs(total - 25799) < 100,
    "25 799 authored effective HP across the schedule (" + total + ")");

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
  t.eq(h.game.waveIndex, 1, "wave 1 is fully deployed");
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

test("if the ninety seconds simply run out, the next wave's arrival pays it", function (t) {
  var h = harness.boot();
  var owed = h.game.waveReward(h.game.WAVES[0], 1);

  var before = h.game.cash;
  h.step(3.2);
  h.game.enemies[0].rooted = true;           // neither cleared nor skipped
  h.step(89.9);
  t.eq(h.game.cash, before, "still unpaid at 89.9 s");

  h.step(0.3);
  t.eq(Math.round(h.game.cash - before), owed, "the next wave arriving settles it");
  t.eq(h.game.pendingBounty, h.game.waveBounty(h.game.WAVES[1]) * 0,
    "and nothing new is owed until wave 2 finishes deploying");
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
  t.eq(h.game.waveGroups(h.game.WAVES[first]).length, 1,
    "which holds one group and nothing on the ground");
});

test("the v0.4.4 twenty-wave spine is still in there, in order", function (t) {
  var h = harness.boot();
  // The old waves were never replaced. v0.4.5 inserted eleven waves BETWEEN
  // them; v0.4.7 gave some of them a second group behind their opening and
  // turned their `health` overrides up. What has to survive all of that is the
  // ESCALATION CURVE: each old wave still opens its wave, with its exact count,
  // interval and type, in its original order.
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

  var i = 0;
  h.game.WAVES.forEach(function (wave) {
    if (i >= OLD.length) return;
    var lead = h.game.waveGroups(wave)[0];
    var want = OLD[i];
    if (lead.count !== want.count) return;
    if (lead.interval !== want.interval) return;
    if ((lead.type || "normal") !== (want.type || "normal")) return;
    // Health may have been turned UP by v0.4.7. It must never have been turned
    // down: that would be a difficulty cut hiding inside a difficulty raise.
    var was = h.game.Enemy.healthOf(want.type, want.health);
    var now = h.game.Enemy.healthOf(lead.type, lead.health);
    t.ok(now >= was, "old wave " + (i + 1) + " is not weaker than it was (" +
      was + " -> " + now + ")");
    i++;
  });
  t.eq(i, OLD.length, "all twenty old waves still open a wave, in their original order");
});

test("every enemy type is scheduled, and every scheduled type exists", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;

  // The index screen derives "appears in waves N, M" from WAVES, so a type
  // that is never scheduled would be documented as content nobody can meet.
  //
  // Waves may be MIXED since v0.4.7, so this walks groups rather than waves --
  // the old "exactly one type per wave" half of this test is gone, replaced by
  // the camo rule above, which is the part that was actually load-bearing.
  var scheduled = {};
  h.game.WAVES.forEach(function (wave) {
    h.game.waveGroups(wave).forEach(function (g) {
      var id = g.type || Enemy.DEFAULT_TYPE;
      Enemy.typeOf(id);                     // throws on a typo in the schedule
      scheduled[id] = (scheduled[id] || 0) + 1;
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

// A mixed wave deploys its groups IN ORDER, each at its own spacing, with a
// `lead` in place of that spacing before the group's first body. Wave 12 is
// the first one: eighteen 5 HP Fast at 0.35, a two-second gap, sixteen 2 HP
// Swarm at 0.22, another gap, twelve 10 HP normals at 0.8.
//
// The counts moved on 2026-07-30 with the rest of the schedule (this used to
// read 36 bodies in groups of 18/12/6, which had ALREADY drifted from the
// wave it describes -- it was 44 in three groups when the suite was last run).
// The shape it is testing is the same one.
test("a mixed wave deploys its groups in order, each at its own spacing", function (t) {
  var h = harness.boot();
  var wave = h.game.WAVES[11];

  t.eq(h.game.waveCount(wave), 46, "forty-six bodies across three groups");
  t.eq(h.game.waveGroups(wave).length, 3, "three groups");
  t.eq(h.game.waveGroupAt(wave, 0).group.type, "fast", "the first body is a Fast");
  t.eq(h.game.waveGroupAt(wave, 17).group.type, "fast", "and so is the eighteenth");
  t.eq(h.game.waveGroupAt(wave, 18).group.type, "swarm", "the nineteenth opens the Swarm group");
  t.ok(h.game.waveGroupAt(wave, 18).opensGroup, "and is flagged as opening it, so its lead applies");
  t.notOk(h.game.waveGroupAt(wave, 19).opensGroup, "the twentieth is not");
  t.ok(h.game.waveGroupAt(wave, 34).opensGroup, "the thirty-fifth opens the last group");
  t.eq(h.game.waveGroupAt(wave, 34).group.health, 10, "the last group is the scaled normals");
  t.eq(h.game.waveGroupAt(wave, 46), null, "and there is no forty-seventh");

  // The banner names every group, so a player looking up sees what is actually
  // coming rather than only the first thing in it.
  t.eq(h.game.waveSummary(wave), "18 × Fast  +  16 × Swarm  +  12 × Normal",
    "the banner lists all three");

  // The flat form is the SINGLE-GROUP case, not a legacy path.
  t.eq(h.game.waveCount(h.game.WAVES[0]), 5, "a flat wave counts its own count");
  t.eq(h.game.waveGroups(h.game.WAVES[0])[0], h.game.WAVES[0],
    "and its one group is the wave itself");
});

test("wave 1 deploys five enemies, then wave 2 waits out the ninety-second break", function (t) {
  var h = harness.boot();
  t.eq(h.game.enemies.length, 1, "first enemy spawns immediately");
  t.eq(h.game.enemies[0].health, 4, "wave 1 health -- a stock normal");

  h.step(3.2);
  t.eq(h.game.enemies.length, 5, "wave 1 enemy count");
  t.eq(h.game.waveIndex, 1, "wave 2 is next");
  t.eq(h.game.waveSpawned, 0, "wave 2 has not started during the break");

  // The 90 s ceiling only applies while something is STILL WALKING -- an empty
  // board calls the next wave in on its own (v0.4.7), and with no towers on
  // this board wave 1 would otherwise leak itself empty at about 40 s. Rooting
  // one body is the cheapest way to keep the board occupied for the whole
  // break, and it uses the same `rooted` flag a revived Revenant sets.
  h.game.enemies[0].rooted = true;

  h.step(89.9);
  t.eq(h.game.waveSpawned, 0, "nothing before the ninety-second break ends");
  h.step(0.2);
  t.eq(h.game.waveSpawned, 1, "wave 2 begins after the break");

  // Eight enemies at one a second finishes the wave, which rolls the index on
  // and resets the counter for the next break.
  h.step(7);
  t.eq(h.game.waveIndex, 2, "wave 2 is fully deployed and wave 3 is next");
  t.eq(h.game.waveSpawned, 0, "counting down through its own break");

  // Wave 3 is the first TYPED wave: the scheduler must hand the type through
  // to the Enemy constructor, not just count spawns.
  h.step(90.2);
  t.eq(h.game.waveSpawned, 1, "wave 3 begins after its break");
  var third = h.game.enemies[h.game.enemies.length - 1];
  t.eq(third.typeId, "fast", "wave 3 spawns the type it names");
  t.eq(third.health, h.game.Enemy.TYPES.fast.health, "with the type's health");
});

// Three things end a break, and two of them take three seconds rather than
// arriving on the spot (v0.4.7, at the owner's request). The button is one.
test("the player can call the next wave in, and it arrives three seconds later", function (t) {
  var h = harness.boot();

  h.step(3.2);
  t.eq(h.game.waveIndex, 1, "wave 1 is fully deployed");
  t.ok(h.game.betweenWaves(), "and the run is in the break");
  h.game.enemies[0].rooted = true;         // keep the board busy, as above

  var r = h.run("waveSkipButtonRect()");
  h.click(r.x + r.w / 2, r.y + r.h / 2);

  h.step(2.9);
  t.eq(h.game.waveSpawned, 0, "not on the next step -- there is a three second call");
  t.ok(h.game.betweenWaves(), "still in the break");
  h.step(0.2);
  t.eq(h.game.waveSpawned, 1, "and wave 2 arrives on the three second mark, not at 90");
  t.notOk(h.game.betweenWaves(), "now the break is over");

  // Calling only ever brings a wave CLOSER. Pressed with two seconds left it
  // must not push the wave back out to three.
  var deployed = h.game.waveSpawned;
  t.notOk(h.run("skipNextWave()"), "refused while a wave is deploying");
  t.eq(h.game.waveSpawned, deployed, "and nothing extra was spawned");
});

test("a call with less than three seconds left never pushes the wave away", function (t) {
  var h = harness.boot();
  h.step(3.2);
  h.game.enemies[0].rooted = true;

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

  var before = h.game.cash;
  h.run("enemies.forEach(function (e) { e.noBounty = true; e.dead = true; })");
  h.step(1 / 60);
  t.eq(Math.round(h.game.cash - before), h.game.waveReward(last, 35),
    "and clearing the board pays it, with no next wave to call in");
  t.eq(h.game.victory, true, "which is also the win");
});

// The second trigger, and the one the owner asked for by name: clear the board
// and the next wave is three seconds out. Killing a wave fast is rewarded with
// pressure rather than with idle time.
test("clearing the board calls the next wave in", function (t) {
  var h = harness.boot();

  h.step(3.2);
  t.ok(h.game.betweenWaves(), "wave 1 is deployed and the break has opened");
  t.eq(Math.round(h.game.waveCountdown), 90, "with the full ninety on the clock");

  // Everything from wave 1 dies -- however it happened, the board is empty.
  h.run("enemies.forEach(function (e) { e.dead = true; })");
  h.step(1 / 60);
  t.eq(h.game.enemies.length, 0, "the board is clear");
  t.ok(h.game.waveCountdown <= 5, "and the next wave is five seconds out (" +
    h.game.waveCountdown.toFixed(2) + ")");
  t.ok(h.game.waveCountdown > 3, "which is longer than a CLICKED call, on purpose");

  h.step(5.1);
  t.eq(h.game.waveSpawned > 0, true, "wave 2 walks in");
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

  // Once off, the full break comes back: run to the next break, then sit in it.
  for (var i = 0; i < 60 * 60 && !h.game.betweenWaves(); i++) h.step(1 / 60);
  t.ok(h.game.betweenWaves(), "the break is back");

  var wave = h.game.waveIndex;
  h.step(20);
  t.eq(h.game.waveIndex, wave, "and twenty seconds later it is still waiting");
  t.eq(h.game.waveSpawned, 0, "nothing deployed unasked");
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

// The button is drawn from the same betweenWaves() test that gates the click,
// so it cannot be clickable while invisible. The failure mode this rules out
// is the nastier direction: a live skip sitting over open ground all run,
// swallowing the click that was meant to place a tower there.
test("the skip button only exists during a break", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var r = h.run("waveSkipButtonRect()");

  t.notOk(h.game.betweenWaves(), "wave 1 is deploying, so there is no break");
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
  for (var pass = 0; pass < 40 && !h.game.victory; pass++) h.stepCallingWaves(30);
  t.eq(h.game.enemies.length, 0, "the board is clear");
  t.eq(h.game.gameOver, false, "the oversized base survived");
  t.eq(h.game.victory, true, "natural exhaustion + clear board = victory");

  // Victory freezes the run exactly the way a loss does.
  var cashBefore = h.game.cash;
  h.step(5);
  t.eq(h.game.cash, cashBefore, "simulation frozen after the win");
  h.draw();                                  // the victory overlay must draw

  // And the overlay's restart button starts a clean run.
  var r = h.game.restartButtonRect();
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.victory, false, "restart clears the win");
  t.eq(h.game.enemies.length, 0, "the road is empty -- a run opens on a pause");
  t.eq(Math.round(h.game.waveCountdown), 10, "with wave 1 ten seconds out");
});

// Added 2026-07-29, at the owner's request. Before it, the run-over overlay
// offered "restart this route" and "choose another route" and no way out of
// the run loop at all -- the armoury, where the coins the overlay had just
// awarded are actually spent, was unreachable without reloading the page.
test("both endings offer a way back to the main menu", function (t) {
  ["gameOver", "victory"].forEach(function (ending) {
    var h = harness.boot();
    h.run(ending + " = true");
    h.draw();                               // the button must draw, not just exist

    var r = h.run("mainMenuButtonRect()");
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
  var restart = a.run("restartButtonRect()");
  a.click(restart.x + restart.w / 2, restart.y + restart.h / 2);
  t.eq(a.game.gameOver, false, "Restart still restarts");
  t.eq(a.game.screen, "play", "and stays in the run");

  var b = harness.boot();
  b.run("gameOver = true");
  var route = b.run("changeMapButtonRect()");
  b.click(route.x + route.w / 2, route.y + route.h / 2);
  t.eq(b.game.screen, "select", "Choose another route still reaches the chooser");
});

// The three rectangles must not overlap, or the wrong thing happens on a
// screen the player usually arrives at by losing.
test("the three run-over buttons do not overlap", function (t) {
  var h = harness.boot();
  var rects = [
    h.run("restartButtonRect()"),
    h.run("changeMapButtonRect()"),
    h.run("mainMenuButtonRect()")
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

  var r = h.game.restartButtonRect();
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
test("a scheduled fractal slime reaches the board at its declared tier", function (t) {
  var h = harness.boot("null-meridian");

  // Find the group rather than typing its cursor: the wave-25 fractal group is
  // index 3 at spawn cursor 35 today, and both move if the schedule is edited.
  var found = h.run("(function () {" +
    "  var groups = waveGroups(WAVES[24]);" +
    "  var cursor = 0;" +
    "  for (var i = 0; i < groups.length; i++) {" +
    "    if (groups[i].type === 'fractal_slime')" +
    "      return { cursor: cursor, tier: groups[i].tier, count: groups[i].count };" +
    "    cursor += groups[i].count;" +
    "  }" +
    "  return null; })()");
  t.ok(found !== null, "wave 25 still declares a fractal slime group");
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

  // There is deliberately NO pause button on the HUD -- Escape is the only
  // way in, so nothing on screen is one stray click from ending a run.
  t.eq(typeof h.game.exitButtonRect, "undefined", "no HUD menu button");

  // It is run state, so restarting clears it.
  h.run("restartGame()");
  t.eq(h.game.paused, false, "restart clears the pause");
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
  t.eq(h.run("whyCannotBuild(" + w(h, 600) + ", " + w(h, 505) + ", Tower)"), "not enough cash", "with no cash");
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

  t.eq(tank.health, 5000, "25,000 B5 damage landed on the surviving target");
  t.eq(small.dead, true, "the second target was killed by the blast");
  t.eq(sniper.damageDealt, 25010,
    "the counter includes the ability and excludes 24,990 overkill");
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
  t.eq(swingTarget.health, 10, "the Warbringer's 12-damage wedge removes 6 HP");
  t.eq(warbringer.damageDealt, 6, "its counter receives the reduced damage");

  var blastOrigin = new h.game.Enemy(h.game.path, 1, "normal");
  var chainTarget = new h.game.Enemy(h.game.path, undefined, "fractal_slime", { tier: 2 });
  blastOrigin.pos = { x: 100, y: 100 };
  chainTarget.pos = { x: 100, y: 100 };
  warbringer.explode(blastOrigin, [blastOrigin, chainTarget]);
  t.eq(chainTarget.health, 8.5, "the B4 blast's 15 damage is reduced to 7.5");
  t.eq(warbringer.damageDealt, 13.5, "blast scoring also uses the reduced amount");

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
  t.eq(blastTarget.health, 37500, "B5's 25,000-damage blast removes 12,500 HP");
  t.eq(sniper.damageDealt, 12500, "the Sniper counter receives that reduced amount");
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
  t.deep(tower.statLines(), [
    ["Damage dealt", "0"],
    ["Kills", "0"],
    ["Damage", "1"],
    ["Range", "100 u.l."],
    ["Attack speed", "1.00/s"],
    // Towers took hit points on 2026-07-29 (js/systems/tower-health.js) and
    // this row arrived with them; the expectation was not updated at the time.
    ["Tower HP", "60 / 60"],
    ["DPS", "1.0"]
  ], "stat rows");

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
  // two-wave content by restoring the old steady 3 HP stream in this sandbox.
  h.run("WAVES = [{ count: 60, health: 3, interval: 2 }]; restartGame()");
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


group("balance");

test("wave arithmetic records the incoming burst and total health", function (t) {
  var h = harness.boot();
  // Health per wave is read off the roster THROUGH Enemy.healthOf, the same
  // resolver the spawner uses, so this arithmetic cannot disagree with what
  // actually walks out of the gate.
  var Enemy = h.game.Enemy;
  var waveOneBurst = Enemy.healthOf(h.game.WAVES[0].type) / h.game.WAVES[0].interval;
  var waveTwoBurst = Enemy.healthOf(h.game.WAVES[1].type) / h.game.WAVES[1].interval;

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
  t.near(waveTwoBurst, 4, 0.001, "wave 2 burst HP/s");
  t.eq(scheduled, 23697, "scheduled health across the full schedule");
  t.eq(effective, 25799, "and what it actually takes to clear it");
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
  // schedule can, and tools/simulate-campaign.js shows it does (an
  // undefended base falls during the mid-game on every route).
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
  t.eq(killIncome, 23333, "scheduled kill bounties");
  var progressionIncome = 0;
  var escalatingIncome = 0;
  for (var waveNumber = 1; waveNumber <= h.game.WAVES.length; waveNumber++) {
    progressionIncome += h.game.waveProgressionReward(waveNumber);
    escalatingIncome += h.game.waveEscalatingReward(waveNumber);
  }
  var purse = killIncome + clearIncome + progressionIncome + escalatingIncome +
    h.game.STARTING_CASH;
  t.eq(purse, 36017, "authored run purse before conditional rewards");
  var dearest = h.game.BUILD_SLOTS.reduce(function (max, type) {
    return type && type.COST > max ? type.COST : max;
  }, 0);
  t.ok(purse > dearest * 2,
    "a run earns well over the dearest tower ($" + purse + " vs $" + dearest + ")");
});

test("additional gunners reduce the HP that reaches the base", function (t) {
  // Measured against the original two-wave opening as a combat regression.
  // The full schedule's
  // whole-run behaviour is tools/simulate-campaign.js's job; over 120 s of
  // mid-campaign one or two gunners are simply dead, and rightly so.
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
  t.eq(b.killed, 4, "kills with two gunners over 120 s");
  t.eq(b.leaked, 9, "leaks with two gunners over 120 s");
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


runner.run();
