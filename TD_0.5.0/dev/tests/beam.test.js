// ---------------------------------------------------------------------------
// tower_beam -- the spec's section 9 acceptance list, one test per checkbox.
//
//   node tests/beam.test.js
//
// The pure logic (mitigation, ramp, charges, gold scaling, stat resolution,
// crosspathing, costs) is exercised here by requiring the modules directly.
// The parts that only mean anything inside a running game -- lifesteal
// reaching the base, death denial firing, the B5 unlock gate -- are in
// tests/sandbox.smoke.js, where a real game is booted.
// ---------------------------------------------------------------------------

var runner = require("./assert");
var group = runner.group;
var test = runner.test;

var Mitigation = require("../../jeu/js/systems/mitigation.js");
var StatResolver = require("../../jeu/js/systems/stat-resolver.js");
var Crosspath = require("../../jeu/js/systems/crosspath.js");
var RampTracker = require("../../jeu/js/systems/ramp.js");
var ChargeMeter = require("../../jeu/js/systems/charge-gold.js");
var GoldPower = require("../../jeu/js/systems/gold-power.js");

var UpgradeEffects = require("../../jeu/js/systems/upgrade-effects.js");

var CONFIG = require("../../jeu/js/towers/beam.config.js").beam;

function enemy(armor, defense) {
  return { armor: armor || 0, defense: defense || 0 };
}

function resolved(a, b) {
  return StatResolver.resolve(CONFIG, { A: a, B: b });
}

function buildCost(a, b) {
  var total = CONFIG.baseCost;
  for (var i = 0; i < a; i++) total += CONFIG.paths.A[i].cost;
  for (var j = 0; j < b; j++) total += CONFIG.paths.B[j].cost;
  return total;
}


// ---------------------------------------------------------------------------
group("section 0.1 — armor then defense, no damage floor");

test("armor 1 vs the base tower's 1 AD deals ZERO, not 1", function (t) {
  // The whole point of armor: it hard-counters low-damage high-rate weapons.
  // A Math.max(1, ...) anywhere in the pipeline breaks this test, which is
  // exactly why the test exists.
  t.eq(Mitigation.mitigate(1, enemy(1, 0)), 0, "1 damage against 1 armor");
  t.eq(Mitigation.mitigate(1, enemy(5, 0)), 0, "1 damage against 5 armor");
});

test("armor 3, defense 50 vs AD 10 gives 3.5", function (t) {
  t.near(Mitigation.mitigate(10, enemy(3, 50)), 3.5, 1e-9, "(10-3) * 0.5");
});

test("the same enemy with A1's 25% defence pierce gives 4.375", function (t) {
  // Pierce reduces DEFENCE only: 50 -> 37.5. Armor is untouched.
  t.near(Mitigation.mitigate(10, enemy(3, 50), 0.25), 4.375, 1e-9,
    "(10-3) * (1 - 0.375)");
});

test("defence pierce never reduces armor", function (t) {
  // 100% pierce wipes defence entirely and still loses every point of armor.
  t.near(Mitigation.mitigate(10, enemy(3, 99), 1.0), 7, 1e-9, "armor still applies");
});

test("defense 150 clamps to 99 rather than inverting the sign", function (t) {
  var result = Mitigation.mitigate(100, enemy(0, 150));
  t.near(result, 1, 1e-9, "100 damage through a clamped 99% defence");
  t.ok(result > 0, "and the result is positive, not a heal");
});

test("order matters: armor is subtracted before the percentage", function (t) {
  // Defence-first would give (10 * 0.5) - 3 = 2, not 3.5.
  t.near(Mitigation.mitigate(10, enemy(3, 50)), 3.5, 1e-9, "armor first");
});


// ---------------------------------------------------------------------------
group("section 3 A1/A4 — ramp, per target");

function rampParams(a) {
  return resolved(a, 0).mechanics.ramp_per_target;
}

test("two targets held for different times ramp differently", function (t) {
  var ramp = new RampTracker(rampParams(1));
  var older = {};
  var newer = {};

  ramp.update(10, [older]);          // 10 s on the first
  ramp.update(1, [older, newer]);    // then 1 s on both

  t.near(ramp.multiplier(older), 1 + 0.15 * 11, 1e-9, "older target");
  t.near(ramp.multiplier(newer), 1 + 0.15 * 1, 1e-9, "newer target");
  t.ok(ramp.multiplier(older) > ramp.multiplier(newer), "and they differ");
});

test("losing one target resets its ramp and leaves the others intact", function (t) {
  var ramp = new RampTracker(rampParams(1));
  var dying = {};
  var survivor = {};

  ramp.update(8, [dying, survivor]);
  var survivorBefore = ramp.multiplier(survivor);

  ramp.forget(dying);
  t.eq(ramp.multiplier(dying), 1, "the dead target is back to x1");
  t.near(ramp.multiplier(survivor), survivorBefore, 1e-9, "the other is untouched");
});

test("ramp caps at x3 on A1 and x3.5 once A4 raises it", function (t) {
  var held = {};
  var a1 = new RampTracker(rampParams(1));
  a1.update(1000, [held]);
  t.near(a1.multiplier(held), 3.0, 1e-9, "A1 caps at x3.0");
  t.near(a1.multiplier({}), 1.0, 1e-9, "a target it never held is x1");

  var heldB = {};
  var a4 = new RampTracker(rampParams(4));
  a4.update(1000, [heldB]);
  t.near(a4.multiplier(heldB), 3.5, 1e-9, "A4 caps at x3.5");
});

test("A4 replaces A1's ramp numbers rather than adding to them", function (t) {
  t.near(rampParams(1).rampRate, 0.15, 1e-9, "A1 rate");
  t.near(rampParams(1).rampCap, 2.0, 1e-9, "A1 cap");
  t.near(rampParams(4).rampRate, 0.20, 1e-9, "A4 rate replaces it");
  t.near(rampParams(4).rampCap, 2.5, 1e-9, "A4 cap replaces it");
});


// ---------------------------------------------------------------------------
group("section 3 A3 — charge meter");

function meter() {
  return new ChargeMeter(resolved(3, 0).mechanics.charge_to_gold);
}

test("thresholds follow 500 x 1.65^(n-1)", function (t) {
  var m = meter();
  t.near(m.thresholdFor(1), 500, 1e-6, "1st");
  t.near(m.thresholdFor(2), 825, 1e-6, "2nd");
  t.near(m.thresholdFor(3), 1361.25, 1e-6, "3rd");
  // The spec prints these rounded; 500 * 1.65^7 is 16647.83.
  t.near(m.thresholdFor(8), 16647.83, 0.01, "8th");
});

test("500 cumulative damage is one charge, 1325 is two", function (t) {
  var one = meter();
  one.addDamage(500);
  t.eq(one.charges, 1, "500 -> 1 charge");

  var two = meter();
  two.addDamage(1325);
  t.eq(two.charges, 2, "1325 (500 + 825) -> 2 charges");

  var split = meter();
  split.addDamage(500);
  split.addDamage(825);
  t.eq(split.charges, 2, "same total arriving in two hits");
});

test("progress resets on each charge, so overflow is not carried", function (t) {
  var m = meter();
  m.addDamage(600);                 // 100 past the first threshold
  t.eq(m.charges, 1, "one charge");
  t.eq(m.progress, 0, "the 100 overflow is discarded, not banked");
});

test("decay is continuous, one charge per 3 s out of combat", function (t) {
  var m = meter();
  m.addDamage(1325);
  t.eq(m.charges, 2, "two charges to start");

  m.idle(3);
  t.eq(m.charges, 1, "3 s costs exactly one charge");

  m.idle(3);
  t.eq(m.charges, 0, "and another 3 s costs the second");
});

test("decay drains smoothly rather than stepping whole charges", function (t) {
  var m = meter();
  m.addDamage(1325);                // 2 charges, bar empty

  m.idle(1.5);                      // half a charge's worth of time
  t.eq(m.charges, 1, "one whole charge gone");
  t.near(m.progressFraction(), 0.5, 1e-9,
    "and the bar sits half way, not at zero -- this is what makes it visibly drain");

  m.idle(0.75);
  t.near(m.level(), 1.25, 1e-9, "level falls continuously with time");
});

test("decay eats the part-filled charge first", function (t) {
  var m = meter();
  // Two calls, not one: progress resets whenever a charge lands, so a single
  // 900 would bank the charge and throw the 400 away.
  m.addDamage(500);                 // banks charge 1, bar back to empty
  m.addDamage(400);                 // 400 toward the next (of 825)

  var startLevel = m.level();
  t.near(startLevel, 1 + 400 / 825, 1e-9, "starts just over one charge");

  m.idle(3);                        // exactly one charge's worth
  t.near(m.level(), startLevel - 1, 1e-9,
    "one charge-equivalent removed, partial progress included");
  t.eq(m.charges, 0, "which leaves no whole charges");
  t.ok(m.progress > 0, "but the remainder is still on the bar, not discarded");
});

test("decay stops at empty rather than going negative", function (t) {
  var m = meter();
  m.addDamage(500);
  m.idle(60);
  t.eq(m.charges, 0, "no charges");
  t.eq(m.progress, 0, "no progress");
  t.eq(m.level(), 0, "and the level floors at zero");
});


test("progressFraction reports how far along the current charge it is", function (t) {
  var m = meter();
  t.eq(m.progressFraction(), 0, "empty");

  m.addDamage(250);                 // half of the 500 first threshold
  t.near(m.progressFraction(), 0.5, 1e-9, "half way to the first charge");

  m.addDamage(250);                 // completes it
  t.eq(m.charges, 1, "charge landed");
  t.eq(m.progressFraction(), 0, "and the bar restarts empty");

  // The second threshold is 825, so the same damage is a smaller fraction --
  // which is exactly why the bar shows a fraction rather than raw damage.
  m.addDamage(250);
  t.near(m.progressFraction(), 250 / 825, 1e-9, "smaller share of a bigger threshold");
});


// ---------------------------------------------------------------------------
group("gold income");

test("the A3 charge bonus is priced off baseGoldPerDamage, which is a unit and not income", function (t) {
  // baseGoldPerDamage is NOT income and never reaches the wallet. It is the
  // UNIT the A3 charge multiplier is priced in: settleEconomy banks
  // `earned - baseIncome`, i.e. only the extra the charges bought.
  //
  // The old name and note here claimed the beam "earns the same rate as every
  // other damage source" at CASH_PER_DAMAGE. Both halves are gone: there is no
  // CASH_PER_DAMAGE any more, and no tower earns anything for damage -- the
  // economy is a bounty per kill. This test stayed green through all of it
  // because it requires the pure modules and never boots a game, so it can
  // only ever see arithmetic, never the banking decision.
  //
  // Verified at runtime 2026-08-11 against a booted game, reading `cash`:
  // wallet delta == bonus in every trial and == earned in none; with A3 unbought
  // the Siphon banks nothing at all; and changing this number 1 -> 7 scaled the
  // payout 10 -> 70, which is what makes it live rather than a fossil.
  //
  // The assertion below cannot go vacuous: with the flag off the bonus is
  // baseIncome - baseIncome = 0 BY CONSTRUCTION rather than by tuning.
  var withoutA3 = resolved(0, 0).mechanics.charge_to_gold;
  t.eq(withoutA3.baseGoldPerDamage, 1,
    "the unit the charge multiplier is priced in");

  var withA3 = resolved(3, 0).mechanics.charge_to_gold;
  t.eq(withA3.baseGoldPerDamage, 1, "A3 does not change the unit either");
});

test("A3 scales the bonus with charges, and banks only the part the charges added", function (t) {
  var params = resolved(3, 0).mechanics.charge_to_gold;
  var m = new ChargeMeter(params);

  var damage = 1459;
  m.addDamage(damage);
  t.eq(m.charges, 2, "1459 damage banks two charges");

  var multiplier = m.goldMultiplier(params.perCharge, params.capTotal);
  t.near(multiplier, 2.0, 1e-9, "1 + 2 charges x 0.5");

  // `earned` is a real intermediate in settleEconomy, but it is NOT what the
  // wallet receives -- the bonus is. At x2 the player banks 1459, not 2918.
  var earned = damage * params.baseGoldPerDamage * multiplier;
  t.near(earned, 2918, 1e-9,
    "1459 damage at x2 banks 1459 of BONUS -- earned(2918) minus base(1459)");
});

test("with no charges the multiplier is exactly 1, so income is unchanged", function (t) {
  var params = resolved(3, 0).mechanics.charge_to_gold;
  var m = new ChargeMeter(params);
  t.near(m.goldMultiplier(params.perCharge, params.capTotal), 1, 1e-9,
    "no charges, no bonus -- and no penalty either");
});


// ---------------------------------------------------------------------------
group("section 3 A5 — gold to power");

test("at 0 gold the multiplier caps at 8 charges", function (t) {
  var m = meter();
  var perCharge = GoldPower.perCharge(0);
  var capTotal = GoldPower.capTotal(0);
  t.near(perCharge, 0.50, 1e-9, "perCharge at 0 gold");
  t.near(capTotal, 5.00, 1e-9, "capTotal at 0 gold");

  m.charges = 7;
  t.near(m.goldMultiplier(perCharge, capTotal), 4.5, 1e-9, "7 charges is below the cap");
  m.charges = 8;
  t.near(m.goldMultiplier(perCharge, capTotal), 5.0, 1e-9, "8 charges reaches it");
});

test("gold scaling stops at 50 000", function (t) {
  // Above 50k, more gold buys no more gold-gain. Without this the spec's
  // unbounded formulas feed themselves: gold raises the multiplier, the
  // multiplier raises gold income. Measured, that reaches 20+ bonus per point
  // of damage and produced "5000 damage -> 106k bonus gold".
  t.eq(GoldPower.MAX_SCALING_GOLD, 50000, "the ceiling");
  t.eq(GoldPower.tiers(50000), 5, "five tiers at the ceiling");
  t.eq(GoldPower.tiers(800000), 5, "and no more above it");

  t.near(GoldPower.perCharge(1000000), 1.00, 1e-9, "perCharge tops out at 1.00");
  t.near(GoldPower.capTotal(1000000), 10.00, 1e-9, "capTotal tops out at x10");

  // Which bounds the bonus: at most (cap - 1) per point of damage.
  t.eq(5000 * (GoldPower.capTotal(1e9) - 1), 45000,
    "5000 damage can never produce more than 45 000 bonus gold");
});

test("the AD bonus is NOT capped -- it is already logarithmic", function (t) {
  t.near(GoldPower.bonusAD(800000), 25, 1e-9, "still growing past the gold cap");
  t.ok(GoldPower.bonusAD(1600000) > GoldPower.bonusAD(800000), "and still rising");
});

test("at 50k gold the multiplier caps at 9 charges, not 10", function (t) {
  var m = meter();
  var perCharge = GoldPower.perCharge(50000);
  var capTotal = GoldPower.capTotal(50000);
  t.near(perCharge, 1.00, 1e-9, "perCharge at 50k");
  t.near(capTotal, 10.00, 1e-9, "capTotal at 50k");

  m.charges = 8;
  t.near(m.goldMultiplier(perCharge, capTotal), 9.0, 1e-9, "8 charges is below the cap");
  m.charges = 9;
  t.near(m.goldMultiplier(perCharge, capTotal), 10.0, 1e-9,
    "9 reaches it -- capTotal includes the base 1.0");
});

test("AD bonus is linear to +10 at 100k, then logarithmic", function (t) {
  t.near(GoldPower.bonusAD(0), 0, 1e-9, "0 gold");
  t.near(GoldPower.bonusAD(10000), 1, 1e-9, "10k -> +1");
  t.near(GoldPower.bonusAD(100000), 10, 1e-9, "100k -> +10");
  t.near(GoldPower.bonusAD(200000), 15, 1e-9, "200k -> +15 (LOG_COEF 5)");
  t.near(GoldPower.bonusAD(400000), 20, 1e-9, "400k -> +20");
  t.near(GoldPower.bonusAD(800000), 25, 1e-9, "800k -> +25");
});

test("the AD bonus is fractional, not floored", function (t) {
  // Flooring would make everything under 10k gold worth exactly nothing.
  t.near(GoldPower.bonusAD(5000), 0.5, 1e-9, "5k -> +0.5 AD");
  t.ok(GoldPower.bonusAD(1) > 0, "even 1 gold moves it");
});


// ---------------------------------------------------------------------------
group("section 4 — B path parameters");

test("slows replace each other rather than stacking", function (t) {
  t.near(resolved(0, 2).mechanics.slow.fraction, 0.10, 1e-9, "B2 slows 10%");
  t.near(resolved(0, 4).mechanics.slow.fraction, 0.15, 1e-9, "B4 replaces it with 15%");
});

test("B4 replaces B3's lifesteal ratio", function (t) {
  t.near(resolved(0, 3).mechanics.lifesteal.ratio, 0.10, 1e-9, "B3 is 10:1");
  t.near(resolved(0, 4).mechanics.lifesteal.ratio, 0.20, 1e-9, "B4 is 10:2");
});

// B5 CARRIED NO RATIO AT ALL UNTIL 2026-08-26, so it silently kept B4's 0.20 --
// the last tier of the drain path did not touch the drain. It now names 0.30,
// and the assertion that matters is the one below it: `setParams` REPLACES, so
// the answer is 30% and never 20 + 30. A resolver that summed them would give
// 0.50 and this test is what would say so.
test("B5 replaces the ratio again, and does not stack on B4's", function (t) {
  t.near(resolved(0, 5).mechanics.lifesteal.ratio, 0.30, 1e-9, "B5 is 10:3");
  t.ok(resolved(0, 5).mechanics.lifesteal.ratio !== 0.50,
    "not 20% + 30% -- the tiers replace, they do not sum");
  t.ok(resolved(0, 5).mechanics.lifesteal.ratio >
       resolved(0, 4).mechanics.lifesteal.ratio,
    "and it is strictly the hardest drain on the path");
});

// The rest of B5 is deliberately UNTOUCHED by that change, and these are the
// four numbers a retune of the ratio would be most likely to disturb.
test("B5's reach, gate, price and uniqueness did not move with the ratio", function (t) {
  var b5 = CONFIG.paths.B[4];
  t.eq(resolved(0, 5).maxTargets, 50, "still up to 50 targets");
  t.eq(b5.cost, 5000, "still 5000");
  t.eq(b5.unlockCondition.totalHealedAtLeast, 5000, "still gated on 5000 healed");
  t.eq(b5.unlockCondition.globalUniqueKey, "death_denial",
    "still one per GAME, not one per tower");
});

test("120 damage on a tick at B4 is 24 base HP", function (t) {
  var ratio = resolved(0, 4).mechanics.lifesteal.ratio;
  t.near(120 * ratio, 24, 1e-9, "the spec's worked example");
});

test("lifesteal on a fully-blocked hit heals nothing", function (t) {
  // Post-mitigation damage is what heals, so armor that eats the hit also
  // denies the heal.
  var dealt = Mitigation.mitigate(1, enemy(5, 0));
  t.eq(dealt, 0, "the hit is fully absorbed");
  t.eq(dealt * resolved(0, 4).mechanics.lifesteal.ratio, 0, "and heals nothing");
});

test("B5 declares its unlock conditions in config, not in code", function (t) {
  var b5 = CONFIG.paths.B[4];
  // Gated on healing DONE rather than on the base's current HP: current HP is
  // a level anything can move, so gating on it made the upgrade blink in and
  // out of reach. Healing done only ever goes up.
  t.eq(b5.unlockCondition.totalHealedAtLeast, 5000, "5 000 HP healed, pooled");
  t.eq(b5.unlockCondition.baseHpAtLeast, undefined, "and no base-HP condition");
  t.eq(b5.unlockCondition.globalUniqueKey, "death_denial", "global unique key");
});

test("the healing that gates B5 is pooled across towers", function (t) {
  var HealingLedger = require("../../jeu/js/systems/healing-ledger.js");
  HealingLedger.reset();

  HealingLedger.record(3000);          // one tower
  t.eq(HealingLedger.total(), 3000, "first tower's healing");

  HealingLedger.record(2000);          // another
  t.eq(HealingLedger.total(), 5000, "they add up");

  // Which is the point: only one tower may ever hold the B5, so a per-tower
  // total would mean every other lifesteal tower's work counted for nothing.
  t.ok(HealingLedger.total() >= CONFIG.paths.B[4].unlockCondition.totalHealedAtLeast,
    "two towers together reach a gate neither would alone");

  HealingLedger.reset();
  t.eq(HealingLedger.total(), 0, "and a new run starts from nothing");
});

test("reaching the B5 gate takes a plausible amount of play", function (t) {
  // Sanity on the threshold: at B4's 20% ratio, 5 000 healed means 25 000
  // damage dealt across the B towers. A real commitment, not a formality.
  var ratio = resolved(0, 4).mechanics.lifesteal.ratio;
  t.eq(5000 / ratio, 25000, "25 000 damage at the B4 ratio");
});


// ---------------------------------------------------------------------------
group("sections 1, 2, 7 — stats, crosspathing and builds");

test("base stats match the spec", function (t) {
  var s = resolved(0, 0);
  t.eq(s.ad, 1, "ad");
  t.eq(s.attackRate, 10, "attackRate");
  t.eq(s.range, 75, "range");
  t.eq(s.hp, 250, "hp");
  t.eq(s.footprint, 15, "footprint");
  t.eq(s.maxTargets, 1, "maxTargets");
  t.eq(s.seesFlying, false, "seesFlying");
  t.eq(s.seesCamo, false, "seesCamo");
});

test("footprint never changes on any tier", function (t) {
  [[5, 0], [0, 5], [5, 2], [2, 5], [3, 2], [2, 3]].forEach(function (build) {
    t.eq(resolved(build[0], build[1]).footprint, 15,
      build[0] + "-" + build[1] + " footprint");
  });
});

test("the build table's range, HP, targets and cost all match", function (t) {
  // The two B-heavy costs are the CONFIG's, not the spec build table's, and
  // that is the same call the AD test below makes for the same reason: where
  // the spec's summary table and the spec's own per-tier numbers disagree, the
  // per-tier numbers are what is implemented, so they are what gets pinned.
  //
  // B's five tiers cost 400 + 1200 + 3500 + 7000 + 5000 = 17 100, so a full B
  // build is 17 900 all-in, not the 72 900 the table quotes. AGENTS.md's
  // Current Values already records 17 900; this expectation was the last copy
  // of the old number and it had never been run.
  var rows = [
    // a, b, range, hp, targets, cost
    [0, 0, 75, 250, 1, 800],
    [5, 0, 175, 1500, 1, 33800],
    [0, 5, 75, 3150, 50, 17900],
    [5, 2, 150, 1700, 2, 35400],
    [2, 5, 125, 3400, 50, 19400]
  ];

  rows.forEach(function (r) {
    var s = resolved(r[0], r[1]);
    var label = r[0] + "-" + r[1];
    t.eq(s.range, r[2], label + " range");
    t.eq(s.hp, r[3], label + " hp");
    t.eq(s.maxTargets, r[4], label + " targets");
    t.eq(buildCost(r[0], r[1]), r[5], label + " total cost");
  });
});

test("AD matches the build table everywhere except 2-5, which the deltas contradict", function (t) {
  t.eq(resolved(0, 0).ad, 1, "base");
  t.eq(resolved(5, 0).ad, 10, "5-0");
  t.eq(resolved(0, 5).ad, 3, "0-5");
  t.eq(resolved(5, 2).ad, 10, "5-2");

  // The spec's table says 5 here, but its own per-tier deltas sum to 4
  // (base 1 + A2's +1 + B4's +1 + B5's +1). The deltas are implemented as
  // written; this pins the discrepancy so it is visible rather than lost.
  t.eq(resolved(2, 5).ad, 4,
    "2-5 comes to 4 from the deltas, though the build table says 5");
});

test("visibility flags arrive on the right tiers", function (t) {
  t.eq(resolved(3, 0).seesFlying, false, "A3 does not see flying");
  t.eq(resolved(4, 0).seesFlying, true, "A4 does");
  t.eq(resolved(0, 0).seesCamo, false, "base does not see camo");
  t.eq(resolved(0, 1).seesCamo, true, "B1 does");
  t.eq(resolved(4, 2).seesCamo, true, "and a crosspath keeps both");
});

test("a tier 3 on one path locks the other at tier 2", function (t) {
  var afterA3 = { A: 3, B: 2 };
  t.eq(Crosspath.canPurchaseNext(afterA3, "B", CONFIG).ok, false, "A3 locks B3");

  var afterB3 = { A: 2, B: 3 };
  t.eq(Crosspath.canPurchaseNext(afterB3, "A", CONFIG).ok, false, "B3 locks A3");

  t.eq(Crosspath.isValidState({ A: 5, B: 2 }, CONFIG), true, "5-2 is legal");
  t.eq(Crosspath.isValidState({ A: 2, B: 5 }, CONFIG), true, "2-5 is legal");
  t.eq(Crosspath.isValidState({ A: 3, B: 3 }, CONFIG), false, "3-3 is not");
});

test("selling a 5-2 returns half of everything spent", function (t) {
  var spent = buildCost(5, 2);
  t.eq(spent, 35400, "total sunk into a 5-2");
  t.eq(Math.ceil(spent * 0.5), 17700, "refund is half of that, not half the base cost");
});


// ---------------------------------------------------------------------------
group("section 6 — damage pipeline order");

test("multipliers apply before mitigation, and commute with each other", function (t) {
  var ad = 10;
  var ramp = 2.0;
  var hpScale = 1.3;
  var target = enemy(3, 50);

  var rampFirst = Mitigation.mitigate(ad * ramp * hpScale, target, 0.25);
  var scaleFirst = Mitigation.mitigate(ad * hpScale * ramp, target, 0.25);
  t.near(rampFirst, scaleFirst, 1e-9, "order between the multipliers is irrelevant");

  // Mitigating first would be materially different -- this is the ordering
  // that actually matters.
  var wrong = Mitigation.mitigate(ad, target, 0.25) * ramp * hpScale;
  t.ok(Math.abs(wrong - rampFirst) > 1e-6,
    "mitigating first gives a different answer (" + wrong.toFixed(3) +
    " vs " + rampFirst.toFixed(3) + ")");
});


// ---------------------------------------------------------------------------
group("upgrade descriptions");

test("every tier says what it does, in the same words the other towers use", function (t) {
  ["A", "B"].forEach(function (pathName) {
    CONFIG.paths[pathName].forEach(function (tier) {
      var text = UpgradeEffects.describe(tier.statDeltas, UpgradeEffects.grantsOf(tier));
      t.ok(text.length > 0, pathName + tier.tier + ": " + text);
    });
  });
});

test("a tier that grants a flag through `flags` is described too", function (t) {
  // B1's only mechanic is camo detection, and it is written as a plain stat
  // flag rather than in `mechanics`. Reading only `mechanics` left that button
  // saying "+150 HP" and nothing else -- the tier's whole point, missing.
  var b1 = CONFIG.paths.B[0];
  t.deep(b1.mechanics, [], "B1 lists no mechanics");
  t.eq(b1.flags.seesCamo, true, "it grants camo through `flags`");
  t.eq(UpgradeEffects.describe(b1.statDeltas, UpgradeEffects.grantsOf(b1)),
    "+150 HP, sees camo", "and the description finds it there");
});

test("the beam's AD is spelled the way every other tower spells damage", function (t) {
  // The config keeps the spec's field name; the button does not keep its
  // vocabulary, because the stat row above it says "Damage" on every tower.
  t.eq(UpgradeEffects.describe({ ad: 2 }, []), "+2 dmg", "not '+2 AD'");
});


runner.run();
