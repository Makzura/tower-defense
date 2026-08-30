// ---------------------------------------------------------------------------
// Tests for the Longshot long-range DPS tower (js/towers/long-range-dps.config.js
// + js/systems/*.js + js/towers/tower-runtime.js).
//
// Run with:   node tests/long-range-dps.test.js
//
// This suite is independent of tests/harness.js and tests/run.js on purpose:
// the new tower's systems are plain logic with no DOM/canvas dependency, so
// they are required directly rather than booted through the stubbed-canvas
// game harness built for the single-gunner game. See AGENTS.md's "How to run
// and test" section, which this suite follows (Node built-ins only, no
// install, gated by the same runner.run()).
//
// Every absolute value below is transcribed from the spec's own tables
// (sections 3, 4, 6) and formulas (5.1, 5.4, 5.7) -- these are the ground
// truth this suite checks the implementation against, not the other way
// around. See the build report for the independent by-hand verification of
// every one of these numbers.
// ---------------------------------------------------------------------------

var runner = require("./assert");
var group = runner.group;
var test = runner.test;

var Units = require("../js/units.js");
var TowerConfigs = require("../js/towers/long-range-dps.config.js");
var StatResolver = require("../js/systems/stat-resolver.js");
var Crosspath = require("../js/systems/crosspath.js");
var RangeFilter = require("../js/systems/range-filter.js");
var Pierce = require("../js/systems/pierce.js");
var UpgradeEffects = require("../js/systems/upgrade-effects.js");
var Execute = require("../js/systems/execute.js");
var TimedStackTracker = require("../js/systems/buff-stacks.js");
var ReloadTracker = require("../js/systems/reload.js");
var ActiveAbility = require("../js/systems/active-ability.js");
var ConfiguredTower = require("../js/towers/tower-runtime.js");

var CONFIG = TowerConfigs.longRangeDPS;

function freshTower() {
  return new ConfiguredTower(CONFIG, 0, 0);
}

function buyTiers(tower, pathName, count) {
  for (var i = 0; i < count; i++) {
    var result = tower.purchase(pathName);
    if (!result.ok) throw new Error("purchase failed: " + result.reason);
  }
}


// ---------------------------------------------------------------------------
group("section 2 — base stats");

test("base stats match the spec exactly", function (t) {
  var tower = freshTower();
  var s = tower.stats;
  t.eq(s.range, 250, "base range");
  t.eq(s.damage, 10, "base damage");
  t.eq(s.fireRate, 0.5, "base fireRate");
  t.eq(s.hp, 100, "base hp");
  t.eq(s.footprint, 20, "base footprint");
  t.eq(s.deadzone, 50, "base deadzone");
  t.eq(s.aoe, null, "base aoe");
  t.eq(s.pierce, 0, "base pierce");
  t.eq(s.critChance, 0, "base critChance");
  t.eq(s.critDamage, 100, "base critDamage");
  t.eq(s.targetShape, "circle", "base targetShape");
  t.eq(s.seesFlying, true, "base seesFlying");
  t.eq(s.seesCamo, false, "base seesCamo");
  t.eq(s.placeableOnHighGround, true, "base placeableOnHighGround");
});


// ---------------------------------------------------------------------------
group("section 3 — path A absolute values");

// damage / range / fireRate / pierce / deadzone / hp, tier by tier.
//
// RETUNED 2026-08-26. A1's fireRate delta fell +0.25 -> +0.15, which carries
// down the whole column (0.75 -> 0.65), and A5's damage fell 350 -> 275 and its
// fireRate penalty -0.15 -> -0.05. A5's absolute damage is therefore 425 rather
// than 500, and its absolute rate is 0.60 as before -- the ten hundredths A1
// gave up are exactly the ten A5 stopped taking, which is what holds the
// finished A build still while slowing every build that does NOT buy A5.
var PATH_A_TABLE = [
  // tier, damage, range, fireRate, pierce, deadzone, hp
  [1, 15, 300, 0.65, 0, 75, 100],
  [2, 25, 350, 0.65, 1, 75, 150],
  [3, 40, 450, 0.65, 6, 100, 250],
  [4, 150, 500, 0.65, 6, 0, 1100],
  [5, 425, 1500, 0.6, Infinity, 0, 2500]
];

PATH_A_TABLE.forEach(function (row) {
  var tier = row[0];
  test("A" + tier + " absolute values", function (t) {
    var tower = freshTower();
    buyTiers(tower, "A", tier);
    var s = tower.stats;
    t.eq(s.damage, row[1], "A" + tier + " damage");
    t.eq(s.range, row[2], "A" + tier + " range");
    t.near(s.fireRate, row[3], 1e-9, "A" + tier + " fireRate");
    t.eq(s.pierce, row[4], "A" + tier + " pierce");
    t.eq(s.deadzone, row[5], "A" + tier + " deadzone");
    t.eq(s.hp, row[6], "A" + tier + " hp");
  });
});

test("A1 grants camo detection", function (t) {
  var tower = freshTower();
  buyTiers(tower, "A", 1);
  t.eq(tower.stats.seesCamo, true, "A1 seesCamo");
});

test("A3 grants pierce falloff (flag only, not yet infinite)", function (t) {
  var tower = freshTower();
  buyTiers(tower, "A", 3);
  t.ok(tower.stats.flags.pierceFalloff, "A3 pierceFalloff flag");
  t.eq(isFinite(tower.stats.pierce), true, "A3 pierce still finite");
});

test("A4 becomes a player-aimed 20-degree cone with no deadzone", function (t) {
  var tower = freshTower();
  buyTiers(tower, "A", 4);
  t.eq(tower.stats.targetShape, "cone", "A4 targetShape");
  t.eq(tower.stats.coneArcDeg, 20, "A4 cone arc");
  t.eq(tower.stats.deadzone, 0, "A4 deadzone removed");
});

test("A5 cone arc widens to 24 degrees, pierce becomes infinite, grants kill-stack", function (t) {
  var tower = freshTower();
  buyTiers(tower, "A", 5);
  t.eq(tower.stats.coneArcDeg, 24, "A5 cone arc");
  t.eq(tower.stats.pierce, Infinity, "A5 infinite pierce");
  t.ok(tower.stats.flags.killStackAttackSpeed, "A5 kill-stack flag");
});


// ---------------------------------------------------------------------------
group("section 4 — path B absolute values");

// damage / range / fireRate / hp / critChance / critDamage, tier by tier.
var PATH_B_TABLE = [
  [1, 25, 225, 0.5, 150, 0, 100],
  [2, 40, 300, 0.5, 250, 0, 100],
  [3, 75, 300, 0.25, 500, 20, 175],
  [4, 325, 400, 0.19, 800, 25, 215],
  [5, 1575, 550, 0.05, 1450, 25, 325]
];

PATH_B_TABLE.forEach(function (row) {
  var tier = row[0];
  test("B" + tier + " absolute values", function (t) {
    var tower = freshTower();
    buyTiers(tower, "B", tier);
    var s = tower.stats;
    t.eq(s.damage, row[1], "B" + tier + " damage");
    t.eq(s.range, row[2], "B" + tier + " range");
    t.near(s.fireRate, row[3], 1e-9, "B" + tier + " fireRate");
    t.eq(s.hp, row[4], "B" + tier + " hp");
    t.eq(s.critChance, row[5], "B" + tier + " critChance");
    t.eq(s.critDamage, row[6], "B" + tier + " critDamage");
  });
});

test("B2 is marked tentative in config", function (t) {
  t.eq(CONFIG.paths.B[1].tentative, true, "B2 tentative flag in config");
});

test("B3 grants reload and execute scaling at 40% max bonus", function (t) {
  var tower = freshTower();
  buyTiers(tower, "B", 3);
  t.ok(tower.stats.flags.reload, "B3 reload flag");
  t.ok(tower.stats.flags.executeScaling, "B3 executeScaling flag");
  t.eq(tower.stats.mechanics.executeScaling.maxBonus, 0.40, "B3 execute max bonus");
});

test("B4 raises the execute cap to 60% (override, not stack)", function (t) {
  var tower = freshTower();
  buyTiers(tower, "B", 4);
  t.eq(tower.stats.mechanics.executeScaling.maxBonus, 0.60, "B4 execute max bonus");
});

test("B5 grants the guaranteed reload-shot crit and the active ability", function (t) {
  var tower = freshTower();
  buyTiers(tower, "B", 5);
  t.ok(tower.stats.flags.guaranteedReloadShotCrit, "B5 guaranteed crit flag");
  t.ok(tower.stats.flags.activeAbility, "B5 active ability flag");
});

test("B2's tentative flat bonus is replaced, not stacked, once B3 is bought", function (t) {
  var tower = freshTower();
  buyTiers(tower, "B", 2);
  // Below B2's own 25% HP threshold -> its flat bonus applies.
  var bonusAtB2 = Execute.resolveExecuteBonus(tower.stats, 0.10, false);
  t.near(bonusAtB2, 0.10, 1e-9, "B2 tentative flat bonus applies below threshold");

  buyTiers(tower, "B", 1); // now at B3
  var bonusAtB3 = Execute.resolveExecuteBonus(tower.stats, 0.10, false);
  // scaling formula at 10% hp, maxBonus .40 -> full .40, NOT .10 and NOT .50
  t.near(bonusAtB3, 0.40, 1e-9, "B3 replaces the flat bonus with scaling");
});


// ---------------------------------------------------------------------------
group("section 6 — crosspathing");

test("valid final configurations from the spec are all reachable", function (t) {
  var combos = [
    ["A", 5, "B", 2], ["A", 5, "B", 1], ["A", 5, "B", 0],
    ["A", 4, "B", 2], ["A", 3, "B", 2],
    ["B", 5, "A", 2], ["B", 5, "A", 1], ["B", 5, "A", 0],
    ["B", 4, "A", 2], ["B", 3, "A", 2],
    ["A", 2, "B", 2]
  ];

  combos.forEach(function (combo) {
    var tower = freshTower();
    // Buy the higher-tier path first, then the capped path, since buying
    // capped-path-first then trying to push the other past 2 is exactly
    // the case the lock should block -- this order proves reachability.
    buyTiers(tower, combo[0], combo[1]);
    buyTiers(tower, combo[2], combo[3]);
    t.eq(tower.purchased[combo[0]], combo[1], combo[0] + combo[1] + "+" + combo[2] + combo[3] + ": " + combo[0] + " tier reached");
    t.eq(tower.purchased[combo[2]], combo[3], combo[0] + combo[1] + "+" + combo[2] + combo[3] + ": " + combo[2] + " tier reached");
  });
});

test("reaching A3 permanently locks B at tier 2", function (t) {
  var tower = freshTower();
  buyTiers(tower, "A", 3);
  buyTiers(tower, "B", 2);
  var blocked = tower.purchase("B");
  t.eq(blocked.ok, false, "B3 purchase blocked after A3");
  t.eq(tower.purchased.B, 2, "B stays capped at 2");
});

test("reaching B3 permanently locks A at tier 2", function (t) {
  var tower = freshTower();
  buyTiers(tower, "B", 3);
  buyTiers(tower, "A", 2);
  var blocked = tower.purchase("A");
  t.eq(blocked.ok, false, "A3 purchase blocked after B3");
  t.eq(tower.purchased.A, 2, "A stays capped at 2");
});

test("Crosspath.isValidState agrees with the purchase-time lock", function (t) {
  t.eq(Crosspath.isValidState({ A: 3, B: 3 }, CONFIG), false, "3+3 is invalid");
  t.eq(Crosspath.isValidState({ A: 3, B: 2 }, CONFIG), true, "3+2 is valid");
  t.eq(Crosspath.isValidState({ A: 2, B: 2 }, CONFIG), true, "2+2 is valid");
  t.eq(Crosspath.isValidState({ A: 5, B: 0 }, CONFIG), true, "5+0 is valid");
});

test("A5+B2 crosspath matches the spec's table exactly", function (t) {
  var tower = freshTower();
  buyTiers(tower, "A", 5);
  buyTiers(tower, "B", 2);
  var s = tower.stats;
  t.eq(s.damage, 455, "A5+B2 damage");
  t.eq(s.range, 1550, "A5+B2 range");
  t.near(s.fireRate, 0.6, 1e-9, "A5+B2 fireRate");
  t.eq(s.hp, 2650, "A5+B2 hp");
  t.eq(s.pierce, Infinity, "A5+B2 pierce");
  t.eq(s.deadzone, 0, "A5+B2 deadzone");
  t.eq(s.critChance, 0, "A5+B2 critChance");
  t.eq(s.critDamage, 100, "A5+B2 critDamage");
  t.eq(s.seesCamo, true, "A5+B2 seesCamo");
  t.eq(s.targetShape, "cone", "A5+B2 shape");
  t.eq(s.coneArcDeg, 24, "A5+B2 cone24");
});

test("B5+A2 crosspath matches the spec's table exactly", function (t) {
  var tower = freshTower();
  buyTiers(tower, "B", 5);
  buyTiers(tower, "A", 2);
  var s = tower.stats;
  t.eq(s.damage, 1590, "B5+A2 damage");
  t.eq(s.range, 650, "B5+A2 range");
  t.near(s.fireRate, 0.20, 1e-9, "B5+A2 fireRate");
  t.eq(s.hp, 1500, "B5+A2 hp");
  t.eq(s.pierce, 1, "B5+A2 pierce");
  t.eq(s.deadzone, 75, "B5+A2 deadzone");
  t.eq(s.critChance, 25, "B5+A2 critChance");
  t.eq(s.critDamage, 325, "B5+A2 critDamage");
  t.eq(s.seesCamo, true, "B5+A2 seesCamo");
  t.eq(s.targetShape, "circle", "B5+A2 shape");
});


// ---------------------------------------------------------------------------
group("section 5.1 — pierce falloff formula");

test("d(n) formula matches hand-computed values at A3's damage (40)", function (t) {
  t.near(Pierce.damageAtIndex(40, 0, { softener: 20, decay: 0.95 }), 40, 1e-9, "d0");
  t.near(Pierce.damageAtIndex(40, 1, { softener: 20, decay: 0.95 }), 37, 1e-9, "d1");
  t.near(Pierce.damageAtIndex(40, 2, { softener: 20, decay: 0.95 }), 34.15, 1e-9, "d2");
  t.near(Pierce.damageAtIndex(40, 6, { softener: 20, decay: 0.95 }), 24.105513437499987, 1e-9, "d6");
});

test("d(n) formula matches hand-computed values at A5's damage (500)", function (t) {
  var p = { softener: 20, decay: 0.95 };
  t.near(Pierce.damageAtIndex(500, 0, p), 500, 1e-9, "d0");
  t.near(Pierce.damageAtIndex(500, 1, p), 474, 1e-9, "d1");
  t.near(Pierce.damageAtIndex(500, 63, p), 0.5395288313477202, 1e-6, "d63 still positive");
  t.near(Pierce.damageAtIndex(500, 64, p), -0.48744761021967165, 1e-6, "d64 has despawned");
});

test("infinite pierce at A5's 500 damage is an effective 64-target cap", function (t) {
  var sequence = Pierce.resolveSequence(500, Infinity, true, { softener: 20, decay: 0.95 });
  t.eq(sequence.length, 64, "targets hit before the shot despawns");
  t.ok(sequence[63] > 0, "64th target still takes positive damage");
});

test("A3's pierce cap (6) never actually triggers falloff-death -- all 7 hits land", function (t) {
  var sequence = Pierce.resolveSequence(40, 6, true, { softener: 20, decay: 0.95 });
  t.eq(sequence.length, 7, "first contact + 6 pierced enemies");
});

test("before pierceFalloff is granted, pierce is flat (no reduction)", function (t) {
  var sequence = Pierce.resolveSequence(25, 1, false, { softener: 20, decay: 0.95 });
  t.eq(sequence.length, 2, "A2's pierce +1 hits two enemies");
  t.eq(sequence[0], 25, "first hit is undamped");
  t.eq(sequence[1], 25, "second hit is undamped too -- no falloff before A3");
});


// ---------------------------------------------------------------------------
group("section 5.4 — execute scaling");

test("0% bonus at full HP", function (t) {
  t.near(Execute.scalingBonus(1.0, 0.40, 0.90), 0, 1e-9, "100% hp, maxBonus .40");
  t.near(Execute.scalingBonus(1.0, 0.60, 0.90), 0, 1e-9, "100% hp, maxBonus .60");
});

test("partial bonus at 50% HP", function (t) {
  t.near(Execute.scalingBonus(0.5, 0.40, 0.90), 0.22222222222222224, 1e-9, "50% hp, maxBonus .40");
  t.near(Execute.scalingBonus(0.5, 0.60, 0.90), 0.3333333333333333, 1e-9, "50% hp, maxBonus .60");
});

test("full bonus at 10% HP (the floor)", function (t) {
  t.near(Execute.scalingBonus(0.10, 0.40, 0.90), 0.40, 1e-9, "10% hp, maxBonus .40");
  t.near(Execute.scalingBonus(0.10, 0.60, 0.90), 0.60, 1e-9, "10% hp, maxBonus .60");
});

test("full bonus stays capped below 10% HP (clamped, not extrapolated)", function (t) {
  t.near(Execute.scalingBonus(0.05, 0.40, 0.90), 0.40, 1e-9, "5% hp, maxBonus .40");
  t.near(Execute.scalingBonus(0.05, 0.60, 0.90), 0.60, 1e-9, "5% hp, maxBonus .60");
});


// ---------------------------------------------------------------------------
group("section 5.7 — damage resolution order");

function fireThreeHarmlessShots(tower) {
  // Advances the reload tracker to "shot 4 is next" using a rng that never
  // crits and a full-health target, so these three shots do not themselves
  // trigger the guaranteed-crit path.
  for (var i = 0; i < 3; i++) {
    tower.fire(1.0, function () { return 1; }); // rng() = 1 never < critChance/100
  }
}

test("B5+A2 guaranteed 4th shot: 1590 * 3.25 * 1.6 = 8268", function (t) {
  var tower = freshTower();
  buyTiers(tower, "B", 5);
  buyTiers(tower, "A", 2);
  fireThreeHarmlessShots(tower);
  t.ok(tower.reload.nextShotIsFinalBeforeReload(), "4th shot is the reload-precursor shot");

  var outcome = tower.fire(1.0, function () { return 1; }); // would not crit on its own
  t.eq(outcome.crit, true, "4th shot is a guaranteed crit");
  t.near(outcome.executeBonus, 0.60, 1e-9, "4th shot applies the full execute bonus");
  t.near(outcome.sequence[0], 8268, 1e-6, "4th shot damage matches spec verification");
});

test("B5 alone guaranteed 4th shot: 1575 * 3.25 * 1.6 = 8190", function (t) {
  var tower = freshTower();
  buyTiers(tower, "B", 5);
  fireThreeHarmlessShots(tower);

  var outcome = tower.fire(1.0, function () { return 1; });
  t.eq(outcome.crit, true, "4th shot is a guaranteed crit");
  t.near(outcome.sequence[0], 8190, 1e-6, "4th shot damage matches spec verification");
});

test("a normal (non-4th, non-crit-roll) shot applies neither crit nor execute bonus at full HP", function (t) {
  var tower = freshTower();
  buyTiers(tower, "B", 5);
  var outcome = tower.fire(1.0, function () { return 1; }); // 1st shot, never crits, full hp target
  t.eq(outcome.crit, false, "no crit");
  t.near(outcome.executeBonus, 0, 1e-9, "no execute bonus at full target hp");
  t.near(outcome.sequence[0], 1575, 1e-9, "plain damage");
});


// ---------------------------------------------------------------------------
group("section 5.2 — kill-stack attack speed");

test("each stack independently expires after its own 5s", function (t) {
  var tracker = new TimedStackTracker(200, 5);
  tracker.addStack();          // t=0, expires at t=5
  tracker.update(2);
  tracker.addStack();          // t=2, expires at t=7
  t.eq(tracker.count(), 2, "two active stacks");

  tracker.update(3);           // now at t=5 overall -- first stack expires
  t.eq(tracker.count(), 1, "first stack expired on its own schedule");

  tracker.update(2);           // now at t=7 -- second stack expires
  t.eq(tracker.count(), 0, "second stack expired on its own (later) schedule");
});

test("stacks cap at whatever they are told to", function (t) {
  var tracker = new TimedStackTracker(200, 5);
  for (var i = 0; i < 250; i++) tracker.addStack();
  t.eq(tracker.count(), 200, "the tracker honours its own ceiling");
});

// AND WHAT THE GAME ACTUALLY TELLS IT, which the test above deliberately does
// not: it builds a tracker from literals, so it would keep passing whatever the
// config said. These four numbers are the retune (2026-08-26) and nothing else
// pins them.
test("the A5 kill-stack ceiling and window are the retuned ones", function (t) {
  var k = CONFIG.mechanics.killStackAttackSpeed;
  t.eq(k.maxStacks, 75, "75 stacks, down from 200");
  t.eq(k.stackDurationSeconds, 4, "each lasting 4 seconds, down from 5");
  t.near(k.perStackBonus, 0.01, 1e-9, "still +1% apiece");
  // +75% rather than +200%: the self-amplifying loop is what was cut, not the
  // per-stack reward.
  t.near(k.maxStacks * k.perStackBonus, 0.75, 1e-9, "so the ceiling is +75% attack speed");
});

test("the retuned prices and the ability's numbers are the shipped ones", function (t) {
  t.eq(CONFIG.paths.A[4].cost, 10500, "A5 costs 10 500, down from 13 900");
  t.eq(CONFIG.paths.B[4].cost, 18000, "B5 costs 18 000, down from 23 300");
  var a = CONFIG.mechanics.activeAbility;
  t.eq(a.damage, 18000, "the ritual hits for 18 000, down from 25 000");
  t.eq(a.cooldownSeconds, 60, "and has a cooldown at last, of 60 s");
  t.eq(a.channelSeconds, 3, "channel unchanged");
  t.eq(a.stunSeconds, 7, "exhaustion unchanged");
  t.eq(a.maxHpLoss, 300, "permanent HP cost unchanged");
  t.eq(a.aoeRadius, 25, "and the blast is still LOCAL, 25 u.l.");
  t.eq(a.ignoresDefense, true, "still ignores defence and armour");
});

test("effectiveFireRate applies +1% per stack, only once A5 is granted", function (t) {
  var tower = freshTower();
  buyTiers(tower, "A", 5);
  for (var i = 0; i < 50; i++) tower.killStacks.addStack();
  t.near(tower.effectiveFireRate(), tower.stats.fireRate * 1.5, 1e-9, "50 stacks = +50% attack speed");
});

test("without the kill-stack flag, stacks (if any) do not affect fire rate", function (t) {
  var tower = freshTower(); // no A5
  t.eq(tower.effectiveFireRate(), tower.stats.fireRate, "base fire rate, unaffected");
});


// ---------------------------------------------------------------------------
group("section 5.3 — reload");

test("shots 1-3 fire freely, the 4th triggers a flat 1s reload regardless of fire rate", function (t) {
  var tracker = new ReloadTracker(4, 1);
  t.eq(tracker.canFire(), true, "can fire before any shots");
  tracker.recordShot();
  t.eq(tracker.canFire(), true, "can fire after shot 1");
  tracker.recordShot();
  tracker.recordShot();
  t.eq(tracker.canFire(), true, "can fire after shot 3");
  t.eq(tracker.nextShotIsFinalBeforeReload(), true, "shot 4 is next");

  tracker.recordShot(); // shot 4
  t.eq(tracker.canFire(), false, "reloading immediately after shot 4");

  tracker.update(0.999);
  t.eq(tracker.canFire(), false, "still reloading just before 1s");
  tracker.update(0.002);
  t.eq(tracker.canFire(), true, "reload complete at 1s, independent of fire rate");
});


// ---------------------------------------------------------------------------
group("section 5.5 — active ability");

test("triggering deals flat AoE damage, ignoring the target's own falloff/crit machinery", function (t) {
  var target = { x: 0, y: 0, hp: 999999 };
  var bystander = { x: 10, y: 0, hp: 50 };
  var farAway = { x: 1000, y: 0, hp: 50 };
  var enemies = [target, bystander, farAway];

  var params = { damage: 25000, aoeRadius: 25, stunSeconds: 10, maxHpLoss: 300 };
  var tower = { currentHp: 2500, maxHp: 2500, stunTimer: 0 };

  var result = ActiveAbility.trigger(tower, enemies, params);
  t.eq(result.ok, true, "ability resolves");
  t.eq(result.target, target, "picks the strongest (placeholder: highest current HP)");
  t.eq(result.hits.length, 2, "hits target + in-radius bystander, not the far one");
  t.eq(result.hits[0].damage, 25000, "flat ability damage");
  t.eq(tower.maxHp, 2200, "permanent -300 max hp");
  t.eq(tower.currentHp, 2200, "current hp clamped to new max");
  t.eq(tower.stunTimer, 10, "10s stun");
});

test("ConfiguredTower gates the ability behind the B5 flag", function (t) {
  var tower = freshTower();
  var blocked = tower.triggerActiveAbility([{ x: 0, y: 0, hp: 10 }]);
  t.eq(blocked.ok, false, "not unlocked without B5");

  buyTiers(tower, "B", 5);
  var hpBefore = tower.maxHp;
  var result = tower.triggerActiveAbility([{ x: 0, y: 0, hp: 10 }]);
  t.eq(result.ok, true, "unlocked at B5");
  t.eq(tower.maxHp, hpBefore - 300, "permanent hp loss applied through the tower");
  // Read from the config rather than typed. The stun was cut from 10 to 7 when
  // the ability became channelled: the total lockout is still 10, but three of
  // those seconds are now the ritual itself and only seven are the exhaustion
  // this timer carries. A typed number here would be a second copy of a value
  // that already lives one require away -- and it is the copy that went stale.
  //
  // The test above deliberately passes its OWN stunSeconds to ActiveAbility;
  // that one pins the mechanism, this one pins what the shipping tower is
  // configured to do, so they are not duplicates.
  t.eq(tower.stunTimer, CONFIG.mechanics.activeAbility.stunSeconds,
    "tower stunned for the configured exhaustion");
});

// Neither test above pins what the tower SHIPS with. The one before passes its
// own stunSeconds, so it proves "given 10 you get 10"; the one above reads the
// config, so it proves the gate wires through whatever is there. Between them
// the shipped 7 was pinned nowhere, and the ability could have been retuned to
// any number at all without a suite noticing.
//
// This pins the DECISION instead of the number, which is what the config
// records at activeAbility.channelSeconds: the ability was split into a
// visible ritual and an exhaustion, and the owner's stated condition was that
// the total cost to the player did not change. So the two knobs are
// independent but their sum is not free, and the realistic mistake -- moving
// the channel and forgetting the stun -- is exactly what this catches. The 10
// is typed on purpose: derive it and this asserts only that a sum equals
// itself.
test("the ritual and the exhaustion still cost ten seconds between them", function (t) {
  var ability = CONFIG.mechanics.activeAbility;
  t.ok(ability.channelSeconds > 0, "there is a ritual to watch");
  t.ok(ability.stunSeconds > 0, "and an exhaustion after it");
  t.eq(ability.channelSeconds + ability.stunSeconds, 10,
    "three seconds of channel plus seven of stun, as before the split");
});


// ---------------------------------------------------------------------------
group("pricing");

// The exact numbers come from the DPS model in tools/price-upgrades.js; these
// tests pin the properties that must hold however the model is retuned, so
// changing an assumption there cannot silently produce a nonsense shop.

test("every tier and the tower itself carry a price", function (t) {
  t.ok(CONFIG.baseCost > 0, "base cost is set: " + CONFIG.baseCost);
  ["A", "B"].forEach(function (pathName) {
    CONFIG.paths[pathName].forEach(function (tier) {
      t.ok(typeof tier.cost === "number" && tier.cost > 0,
        pathName + tier.tier + " has a positive cost: " + tier.cost);
    });
  });
});

test("no upgrade is cheaper than a gunner", function (t) {
  // The gunner is $15. An upgrade that undercut it would be strictly better
  // value than the cheapest thing in the game, at any tier.
  ["A", "B"].forEach(function (pathName) {
    CONFIG.paths[pathName].forEach(function (tier) {
      t.ok(tier.cost >= 15, pathName + tier.tier + " >= $15 (is $" + tier.cost + ")");
    });
  });
});

test("the expensive tiers are the ones that move DPS the most", function (t) {
  // Not a strict monotonic check: B3 buys reload and execute rather than raw
  // throughput, so it is legitimately cheap. What must hold is that the two
  // late tiers, which multiply damage several times over, cost more than the
  // early ones.
  ["A", "B"].forEach(function (pathName) {
    var tiers = CONFIG.paths[pathName];
    t.ok(tiers[4].cost > tiers[3].cost,
      pathName + "5 costs more than " + pathName + "4");
    t.ok(tiers[3].cost > tiers[0].cost,
      pathName + "4 costs more than " + pathName + "1");
  });
});

test("crosspathing is priced in: B5 is not priced as a single-path tier", function (t) {
  // The case that forced the model to consider crosspaths at all. B5 alone
  // fires once every 20 s; B5+A2 fires every 3.3 s with pierce, because
  // path A gives back the fire rate path B spends. Pricing B5 against a
  // pure-B progression valued it at ~$2750; against its real (crosspathed)
  // value it is an order of magnitude more.
  var b5 = CONFIG.paths.B[4].cost;
  t.ok(b5 > 10000,
    "B5 is priced for the build it actually enables, not for a pure-B tower ($" + b5 + ")");

  // A1/A2 are the cheap tiers that unlock that swing, so they must stay
  // affordable enough to be reachable -- pricing them on the mean instead of
  // the median would put A1 at ~$3050 and make it unbuyable early.
  t.ok(CONFIG.paths.A[0].cost < 1000,
    "A1 stays affordable for an early tower ($" + CONFIG.paths.A[0].cost + ")");
});

test("complete builds land near the gunner's rate, and pure-path builds do not", function (t) {
  // DPS figures are the model's, quoted in tools/price-upgrades.js. The
  // property being pinned: the builds a player should actually make price out
  // near $15/DPS, while stopping on one path without crosspathing is visibly
  // poor value -- which is the signal that pushes players to crosspath.
  function buildCost(a, b) {
    var total = CONFIG.baseCost;
    for (var i = 0; i < a; i++) total += CONFIG.paths.A[i].cost;
    for (var j = 0; j < b; j++) total += CONFIG.paths.B[j].cost;
    return total;
  }

  var best = buildCost(2, 5) / 1903;      // B5 + A2
  var coneBuild = buildCost(5, 2) / 957;  // A5 + B2
  var pureB = buildCost(0, 5) / 222;      // B5 with no crosspath

  t.ok(best < 20, "B5+A2 is near the gunner's rate: $" + best.toFixed(1) + "/DPS");
  t.ok(coneBuild < 30, "A5+B2 is in the same band: $" + coneBuild.toFixed(1) + "/DPS");
  t.ok(pureB > best * 3,
    "pure B5 is much worse value than crosspathing into it: $" +
    pureB.toFixed(1) + "/DPS vs $" + best.toFixed(1));
});


// ---------------------------------------------------------------------------
group("targeting — circle, deadzone, cone, camo, flying");

// Targeting is the collision layer, so it takes WORLD positions and converts
// the tower's u.l. radii itself (see js/systems/range-filter.js). Enemy
// positions in these tests therefore go through ul() too -- comparing a raw
// u.l. number against a world one is the exact bug this file used to have.
var ul = Units.ul;

test("circle mode respects both range and deadzone", function (t) {
  var stats = { range: 250, deadzone: 50, targetShape: "circle", seesFlying: true, seesCamo: false };
  var pos = { x: 0, y: 0 };
  t.eq(RangeFilter.canTarget(stats, pos, 0, { x: ul(30), y: 0 }), false, "inside deadzone: rejected");
  t.eq(RangeFilter.canTarget(stats, pos, 0, { x: ul(50), y: 0 }), true, "exactly on deadzone edge: accepted");
  t.eq(RangeFilter.canTarget(stats, pos, 0, { x: ul(250), y: 0 }), true, "exactly on range edge: accepted");
  t.eq(RangeFilter.canTarget(stats, pos, 0, { x: ul(251), y: 0 }), false, "just past range: rejected");
});

test("range and deadzone follow UNIT_LENGTH, not raw pixel numbers", function (t) {
  var stats = { range: 250, deadzone: 50, targetShape: "circle", seesFlying: true, seesCamo: false };
  var pos = { x: 0, y: 0 };

  // Pin the constant to something well above 1 so u.l. and world space are
  // unmistakably different numbers: 50..250 u.l. becomes a 200..1000 world
  // band. A point 600 world units out is then clearly inside the real band,
  // but the old buggy code compared that 600 straight against the raw number
  // 250 and threw it out as "beyond range".
  //
  // Written against a pinned constant rather than whatever UNIT_LENGTH
  // happens to be, so tuning it (which has now happened twice) cannot
  // silently turn this into a test of nothing.
  var original = Units.getUnitLength();
  try {
    Units.setUnitLength(4);

    t.eq(RangeFilter.canTarget(stats, pos, 0, { x: 600, y: 0 }), true,
      "600 world units is inside the 200..1000 world band");
    t.eq(RangeFilter.canTarget(stats, pos, 0, { x: 150, y: 0 }), false,
      "150 world units is inside the deadzone (200 world)");
    t.eq(RangeFilter.canTarget(stats, pos, 0, { x: 1100, y: 0 }), false,
      "1100 world units is past the range edge (1000 world)");

    // And the edges track the constant exactly.
    t.eq(RangeFilter.canTarget(stats, pos, 0, { x: ul(250), y: 0 }), true,
      "exactly on the converted range edge");
    t.eq(RangeFilter.canTarget(stats, pos, 0, { x: ul(50), y: 0 }), true,
      "exactly on the converted deadzone edge");
  } finally {
    Units.setUnitLength(original);
  }
});

test("cone mode ignores deadzone entirely and checks arc instead", function (t) {
  var stats = { range: 250, deadzone: 999999, targetShape: "cone", coneArcDeg: 20, seesFlying: true, seesCamo: false };
  var pos = { x: 0, y: 0 };
  // aimed along +x (0 rad); arc is +/-10 degrees
  t.eq(RangeFilter.canTarget(stats, pos, 0, { x: ul(1), y: 0 }), true, "very close is fine in cone mode (no deadzone)");
  t.eq(RangeFilter.canTarget(stats, pos, 0, { x: ul(100), y: ul(5) }), true, "inside the 20 degree arc");
  t.eq(RangeFilter.canTarget(stats, pos, 0, { x: 0, y: ul(100) }), false, "90 degrees off-aim: outside the arc");
});

test("camo and flying visibility gates are respected", function (t) {
  var stats = { range: 250, deadzone: 0, targetShape: "circle", seesFlying: false, seesCamo: false };
  var pos = { x: 0, y: 0 };
  t.eq(RangeFilter.canTarget(stats, pos, 0, { x: ul(10), y: 0, isFlying: true }), false, "flying rejected without seesFlying");
  t.eq(RangeFilter.canTarget(stats, pos, 0, { x: ul(10), y: 0, isCamo: true }), false, "camo rejected without seesCamo");

  var withCamoDetection = { range: 250, deadzone: 0, targetShape: "circle", seesFlying: false, seesCamo: true };
  t.eq(RangeFilter.canTarget(withCamoDetection, pos, 0, { x: ul(10), y: 0, isCamo: true }), true, "camo accepted once granted");
});


group("upgrade descriptions: what a tier does, before you buy it");

// The bug: the panel showed the tier and the price and nothing else, so the
// only way to find out what $850 bought was to spend it. These pin the
// description, and pin that it is DERIVED from the config rather than typed
// beside it -- a hand-written sentence is a second source of truth that goes
// stale the first time someone retunes a number.

test("a tier's numbers are read straight off its deltas", function (t) {
  t.eq(UpgradeEffects.describe({ damage: 10, range: 50, hp: 50 }, []),
    "+10 dmg, +50 u.l. range, +50 HP", "signed, in config order");
  t.eq(UpgradeEffects.describe({ fireRate: -0.15 }, []), "-0.15 atk/s",
    "a drop keeps its sign rather than being dressed up as a gain");
  t.eq(UpgradeEffects.describe({ damage: 0, range: 25 }, []), "+25 u.l. range",
    "a zero delta is not mentioned at all");
  t.eq(UpgradeEffects.describe({}, []), "", "nothing to say says nothing");
  t.eq(UpgradeEffects.describe(undefined, undefined), "",
    "and a tier with neither deltas nor grants does not throw");
});

test("percentages are the config's own units, not re-scaled", function (t) {
  // critChance/critDamage are stored as percentage POINTS. Multiplying them
  // by 100 to "make a percentage" printed "+2000% crit" for B3's 20-point
  // bump. This is that bug, pinned.
  t.eq(UpgradeEffects.describe({ critChance: 20, critDamage: 75 }, []),
    "+20% crit, +75% crit dmg", "20 points reads as 20%");
});

test("one of something is singular", function (t) {
  t.eq(UpgradeEffects.describe({ maxTargets: 1 }, []), "+1 target", "singular");
  t.eq(UpgradeEffects.describe({ maxTargets: 6 }, []), "+6 targets", "plural");
});

test("granted mechanics get short names, and unknown ones are still shown", function (t) {
  t.eq(UpgradeEffects.describe({ damage: 5 }, ["camoDetection"]),
    "+5 dmg, sees camo", "numbers first, then what it grants");
  t.eq(UpgradeEffects.describe({}, ["coneShape", "deadzoneRemoved"]),
    "cone, no deadzone", "two grants");
  t.eq(UpgradeEffects.describe({}, ["somethingNewNobodyNamed"]),
    "somethingNewNobodyNamed",
    "an unnamed mechanic is shown raw rather than silently dropped");
});

test("every tier of the real config produces a non-empty description", function (t) {
  var config = TowerConfigs.longRangeDPS;
  ["A", "B"].forEach(function (path) {
    config.paths[path].forEach(function (tier) {
      var text = UpgradeEffects.describe(tier.deltas, tier.grants);
      t.ok(text.length > 0, path + tier.tier + " describes itself: " + text);
    });
  });
});

test("the description changes when the tier changes", function (t) {
  // The property that makes this derived rather than decorative: edit a
  // config number and the button follows, with nothing else to update.
  var tier = TowerConfigs.longRangeDPS.paths.A[1];
  var before = UpgradeEffects.describe(tier.deltas, tier.grants);
  var bumped = {};
  Object.keys(tier.deltas).forEach(function (k) { bumped[k] = tier.deltas[k]; });
  bumped.damage += 7;

  t.ok(UpgradeEffects.describe(bumped, tier.grants) !== before,
    "a retuned delta produces a different sentence");
  t.eq(UpgradeEffects.describe(bumped, tier.grants).indexOf("+17 dmg"), 0,
    "and the new number is the one shown");
});


group("the hover card: the full story, measured on this tower");

// The button has room for three short lines. That is enough to choose between
// two upgrades and not enough to understand either: "+5 pierce, pierce
// falloff" never says what pierce falloff IS, what the range would BECOME, or
// that tier 3 shuts the other path for the rest of the run. These pin the card
// that hovering opens.

test("a tier's changes are measured before and after, not read off the table", function (t) {
  var tower = freshTower();
  var preview = tower.previewNextTier("A");

  t.eq(preview.cost, CONFIG.paths.A[0].cost, "the config's price");

  var damage = preview.changes.filter(function (c) { return c.label === "Damage"; })[0];
  t.eq(damage.from, "10", "base damage before");
  t.eq(damage.to, "15", "and after A1's +5");
  t.eq(damage.delta, "+5", "with the delta spelled out");

  var range = preview.changes.filter(function (c) { return c.label === "Range"; })[0];
  t.eq(range.from, "250 u.l.", "distances carry their unit");
  t.eq(range.to, "300 u.l.", "on both sides of the arrow");
});

test("and they follow what this tower already owns, so crosspathing is priced in", function (t) {
  var tower = freshTower();
  tower.purchase("A");
  tower.purchase("A");

  var range = tower.previewNextTier("A").changes
    .filter(function (c) { return c.label === "Range"; })[0];
  t.eq(range.from, "350 u.l.", "measured from where A2 left it");
  t.eq(range.to, "450 u.l.", "not from the 250 base");
});

// Added 2026-07-29, at the owner's request: "when previewing upgrades, also
// show dps change (Ex 3 --> 5 dps)".
test("a preview shows what the upgrade does to DPS", function (t) {
  var tower = freshTower();
  var rows = tower.previewNextTier("A").changes;
  var dps = rows.filter(function (c) { return c.label === "DPS"; })[0];

  // A1 moves damage 10 -> 15 and fire rate 0.5 -> 0.75, so 5 -> 11.25. Neither
  // of the two rows above says that, and multiplying them in your head twice
  // is what this row exists to save.
  t.ok(dps, "there is a DPS row");
  t.eq(dps.from, "5.0", "from what it does now");
  t.eq(dps.to, "9.8", "to what it would do");
  t.eq(dps.delta, "+4.75", "and the gain");

  // Last, the same place the inspection panel puts it: it summarises the rows
  // above it, so it has to read as their conclusion rather than as an aside.
  t.eq(rows[rows.length - 1].label, "DPS", "DPS is the last row on the card");
});

test("a tier that moves neither damage nor rate gets no DPS row", function (t) {
  // A row reading "DPS 5.0 -> 5.0 (+0)" is noise on a card that is already
  // dense, and it would imply the upgrade did something to a number it did
  // not touch.
  var unchanged = UpgradeEffects.dpsChange(
    { damage: 10, fireRate: 0.5 },
    { damage: 10, fireRate: 0.5, range: 400 }
  );
  t.eq(unchanged, null, "no row when the product is the same");

  // A stat block with no attack pair in it must not throw or invent one.
  t.eq(UpgradeEffects.dpsChange({ hp: 100 }, { hp: 250 }), null, "none to compute");
  t.eq(UpgradeEffects.dpsChange(null, null), null, "and nothing to read");
});

test("DPS is computed the same way for both stat vocabularies", function (t) {
  // The Longshot config says damage/fireRate and the beam spec says
  // ad/attackRate. One idea, two spellings -- and one row.
  var longshot = UpgradeEffects.dpsChange(
    { damage: 10, fireRate: 0.5 }, { damage: 15, fireRate: 0.75 });
  var beam = UpgradeEffects.dpsChange(
    { ad: 10, attackRate: 0.5 }, { ad: 15, attackRate: 0.75 });

  t.deep(beam, longshot, "the same numbers under either spelling");
});

test("previewing does not buy anything", function (t) {
  var tower = freshTower();
  var before = JSON.stringify(tower.purchased) + "|" + tower.stats.damage;
  tower.previewNextTier("A");
  tower.previewNextTier("B");
  t.eq(JSON.stringify(tower.purchased) + "|" + tower.stats.damage, before,
    "nothing purchased, no stat moved");
});

test("a finished path has nothing to preview", function (t) {
  var tower = freshTower();
  for (var i = 0; i < 5; i++) tower.purchase("A");
  t.eq(tower.previewNextTier("A"), null, "null rather than an empty card");
});

test("the card flags the crosspath lock, which no price can show", function (t) {
  var tower = freshTower();
  t.eq(tower.previewNextTier("A").locks, false, "tier 1 commits nothing");
  tower.purchase("A");
  t.eq(tower.previewNextTier("A").locks, false, "nor tier 2");
  tower.purchase("A");
  t.eq(tower.previewNextTier("A").locks, true,
    "tier 3 is the one that caps the other path for good");
});

test("every ability a tier grants gets a sentence, with the config's own numbers", function (t) {
  var camo = freshTower().previewNextTier("A").abilities;
  t.eq(camo.length, 1, "A1 grants exactly one");
  t.eq(camo[0].name, "sees camo", "named as the button names it");
  t.ok(camo[0].text.indexOf("camouflaged") !== -1, "and explained: " + camo[0].text);

  // The numbers in a sentence are INTERPOLATED, not typed beside it. B3's
  // execute caps at 40% and B4 raises the same mechanic to 60%, so the same
  // ability has to read differently on the two towers.
  var atB3 = freshTower();
  buyTiers(atB3, "B", 2);
  var b3Text = atB3.previewNextTier("B").abilities
    .filter(function (a) { return a.name === "execute"; })[0].text;
  t.ok(b3Text.indexOf("40%") !== -1, "B3 quotes its own cap: " + b3Text);

  var atB4 = freshTower();
  buyTiers(atB4, "B", 4);
  var b4Text = UpgradeEffects.abilities(["executeScaling"], atB4.stats.mechanics)[0].text;
  t.ok(b4Text.indexOf("60%") !== -1, "and after B4 the same ability reads 60%: " + b4Text);
});

test("an ability nobody has written up still gets a card entry", function (t) {
  var described = UpgradeEffects.abilities(["somethingNewNobodyNamed"], {});
  t.eq(described.length, 1, "not silently dropped");
  t.eq(described[0].name, "somethingNewNobodyNamed", "shown under its raw key");
  t.ok(described[0].text.length > 0, "with a placeholder rather than blank space");
});

test("the card model always has every field the panel draws", function (t) {
  var card = UpgradeEffects.card({ title: "x" });
  t.deep(card.changes, [], "changes defaults to empty");
  t.deep(card.abilities, [], "abilities too");
  t.eq(card.subtitle, "", "subtitle is a string, never undefined");
  t.eq(card.note, null, "and a missing note is null");
});


runner.run();
