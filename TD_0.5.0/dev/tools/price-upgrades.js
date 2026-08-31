// ---------------------------------------------------------------------------
// Upgrade pricing model.   node tools/price-upgrades.js
//
// Not part of the game or the test suite -- a reproducible derivation of the
// numbers that ended up in js/towers/long-range-dps.config.js, kept so the
// next person can argue with the assumptions instead of the outputs.
//
// THE ANCHOR
// The gunner is the only priced thing in the game: $15 for 1 damage x 1
// shot/sec = 1 DPS. So the whole economy is worth $15 per point of DPS, and
// that is the only rate available to price anything else against.
//
// WHAT COUNTS AS DPS
// Raw damage x fire rate badly misprices this tower, because most of its
// upgrades buy throughput indirectly. The model below folds in:
//
//   reload (B3+)      4 shots then a flat 1s pause, so sustained rate is
//                     shots/(shots/fireRate + 1), NOT fireRate.
//   crit (B3+)        average multiplier 1 + chance x (critDamage - 1).
//   execute (B3+)     bonus scales with how hurt the target is. Averaged
//                     over an enemy's whole life (HP falling 1 -> 0) that
//                     is 0.55 x maxBonus; see the integral in avgExecute().
//   B2 tentative      +10% under 25% HP -> 0.25 x 0.10 = +2.5% averaged.
//   B5 4th shot       every 4th shot is a guaranteed crit AND full execute,
//                     so it is modelled separately from the other three.
//   pierce (A2+)      extra enemies hit per shot, with A3+ falloff applied.
//                     Capped at CLUSTER enemies -- pierce is worth nothing
//                     against a target that is alone.
//   kill stacks (A5)  +1% fire rate per kill, 4s each, 75 max since
//                     2026-08-26 (was 5s and 200). Assumed to sit at STACKS
//                     on average, NOT at the 75 cap -- the cap is a ceiling on
//                     a self-amplifying loop, not a steady state.
//
// THE TWO ASSUMPTIONS WORTH CHALLENGING are CLUSTER and STACKS. Both flatter
// path A. Halve them and A4/A5 get cheaper; that is a balance call, not a
// maths one.
// ---------------------------------------------------------------------------

var CONFIGS = require("../../jeu/js/towers/long-range-dps.config.js");
var StatResolver = require("../../jeu/js/systems/stat-resolver.js");
var Pierce = require("../../jeu/js/systems/pierce.js");

var CONFIG = CONFIGS.longRangeDPS;

var DOLLARS_PER_DPS = 15;   // the gunner: $15 for 1 DPS
var CLUSTER = 4;            // enemies a piercing shot can realistically line up
var STACKS = 25;            // average live kill-stacks at A5, not the 75 cap

// Damage dealt to the 2nd and later enemy of a pierce is worth less than
// damage to the first: it only exists when enemies happen to be lined up,
// and it is spread across targets rather than removing any one of them
// sooner. Counting it at face value prices path A at ~6x path B, which is
// an artefact of assuming a permanent 4-enemy conga line, not a real gap.
var PIERCE_VALUE = 0.5;

// A tier deeper into a path is gated behind everything before it and costs
// no extra board space, so it is allowed to be worse value per DPS than
// simply building another tower. Mild on purpose.
var TIER_PREMIUM = [1.00, 1.05, 1.15, 1.30, 1.50];

// Average execute bonus over an enemy's life, as a fraction of maxBonus.
// bonus(hp) = clamp((1 - hp)/0.9, 0, 1); integrate over hp in [0,1]:
//   int_0^0.9 u/0.9 du + int_0.9^1 1 du = 0.45 + 0.10 = 0.55
function avgExecuteFraction() { return 0.55; }

function sustainedFireRate(stats) {
  var rate = stats.fireRate;

  if (stats.flags.killStackAttackSpeed) {
    rate *= (1 + stats.mechanics.killStackAttackSpeed.perStackBonus * STACKS);
  }

  if (stats.flags.reload) {
    var n = stats.mechanics.reload.shotsBeforeReload;
    var pause = stats.mechanics.reload.reloadDurationSeconds;
    rate = n / (n / rate + pause);
  }

  return rate;
}

// Damage of one shot, averaged over crit and execute.
function averageShotDamage(stats) {
  var critMultiplier = 1 + (stats.critChance / 100) * (stats.critDamage / 100 - 1);

  var executeMultiplier = 1;
  if (stats.flags.executeScaling) {
    executeMultiplier = 1 + avgExecuteFraction() * stats.mechanics.executeScaling.maxBonus;
  } else if (stats.flags.tentativeExecuteFlat) {
    var flat = stats.mechanics.tentativeExecuteFlat;
    executeMultiplier = 1 + flat.hpFractionThreshold * flat.flatBonus;
  }

  var normal = stats.damage * critMultiplier * executeMultiplier;

  // B5: the shot before each reload always crits and always applies the full
  // execute bonus, so three shots are normal and the fourth is maximal.
  if (stats.flags.guaranteedReloadShotCrit && stats.flags.reload) {
    var fullExecute = stats.flags.executeScaling
      ? 1 + stats.mechanics.executeScaling.maxBonus
      : executeMultiplier;
    var guaranteed = stats.damage * (stats.critDamage / 100) * fullExecute;
    var n = stats.mechanics.reload.shotsBeforeReload;
    return (normal * (n - 1) + guaranteed) / n;
  }

  return normal;
}

// How many times one shot's damage effectively lands, accounting for pierce
// and the falloff that reduces each successive hit.
//
// Takes the REAL shot damage, because the falloff formula
// d(n) = (d0 + 20) * 0.95^n - 20 is not scale-invariant: that flat -20 is
// most of a 10-damage shot and a rounding error on a 500-damage one. Feeding
// it a normalised d0 of 1 makes every shot die on its second target and
// prices A3 as a DOWNGRADE, which is exactly backwards.
function pierceMultiplier(stats, shotDamage) {
  if (!stats.pierce) return 1;

  var sequence = Pierce.resolveSequence(
    shotDamage, stats.pierce, !!stats.flags.pierceFalloff, stats.mechanics.pierceFalloff
  );

  var hits = Math.min(sequence.length, CLUSTER);
  var total = 0;
  for (var i = 0; i < hits; i++) {
    total += sequence[i] * (i === 0 ? 1 : PIERCE_VALUE);
  }
  return total / shotDamage;
}

function effectiveDps(purchased) {
  var stats = StatResolver.resolve(CONFIG, purchased);
  var shotDamage = averageShotDamage(stats);
  return shotDamage * sustainedFireRate(stats) * pierceMultiplier(stats, shotDamage);
}

// Round to something a shop would actually print.
function tidy(value) {
  if (value < 100) return Math.round(value / 5) * 5;
  if (value < 1000) return Math.round(value / 25) * 25;
  if (value < 10000) return Math.round(value / 50) * 50;
  return Math.round(value / 100) * 100;
}

// ---- crosspathing ---------------------------------------------------------
//
// A tier is NOT worth the same amount everywhere, because what it is bolted
// onto changes what it does. The clearest case is fire rate, which the two
// paths push in opposite directions:
//
//   B5 alone          fireRate 0.05  -> one shot every 20 s
//   B5 + A2           fireRate 0.30  -> one shot every 3.3 s, and it pierces
//
// Buying A1+A2 on top of a B5 is therefore a ~6x throughput swing, nothing
// like what the same two tiers do to a bare tower. Pricing each tier against
// a single-path build (which is what this model used to do) misses that
// completely and undercharges wildly for the best builds in the game.
//
// Since the config carries ONE price per tier, the fair flat number is the
// tier's marginal gain averaged over every legal state it can be bought in.
// The spread is reported alongside so the outliers stay visible.

// Every legal (a, b) pair under the crosspath rule: reaching tier 3 on one
// path caps the other at 2, so the two may not both be >= 3.
function legalStates() {
  var out = [];
  for (var a = 0; a <= 5; a++) {
    for (var b = 0; b <= 5; b++) {
      if (a >= 3 && b >= 3) continue;
      out.push({ A: a, B: b });
    }
  }
  return out;
}

// Every marginal gain for `tier` on `pathName`, one per legal companion
// value on the other path.
function marginalGains(pathName, tier) {
  var other = pathName === "A" ? "B" : "A";
  var gains = [];

  legalStates().forEach(function (state) {
    if (state[pathName] !== tier) return;

    var after = {};
    after[pathName] = tier;
    after[other] = state[other];

    var before = {};
    before[pathName] = tier - 1;
    before[other] = state[other];

    // Both endpoints must themselves be legal states.
    if (!(before[pathName] >= 3 && before[other] >= 3)) {
      gains.push({
        companion: other + state[other],
        gain: effectiveDps(after) - effectiveDps(before)
      });
    }
  });

  return gains;
}

function median(values) {
  var sorted = values.slice().sort(function (a, b) { return a - b; });
  var mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function priceLine(pathName, tier) {
  var gains = marginalGains(pathName, tier);
  var values = gains.map(function (g) { return g.gain; });

  var average = values.reduce(function (s, v) { return s + v; }, 0) / values.length;
  var mid = median(values);

  // PRICED ON THE MEDIAN, not the mean.
  //
  // A1 gains 6 DPS on a bare tower and 1038 on a B5 -- a 165x spread, caused
  // by B3/B4/B5 dragging fireRate down to 0.05 while A1 adds back 0.25. The
  // mean is dragged all the way to 203 by that one outlier, which would put
  // A1 at $3050: unbuyable for the player it is actually aimed at (a fresh
  // tower gaining 6 DPS), and still a bargain for the B5 player gaining 1038.
  //
  // The median prices the tier at what it typically does, which keeps the
  // early game sane and leaves the synergy as a reward for finding it --
  // the way crosspathing usually works in this genre. It does mean the
  // B5 -> A1 spike is underpriced, and no flat number can fix that: the
  // spike is a STAT problem (path B's late tiers only function once you
  // crosspath into A1), not a pricing one. Flagged in AGENTS.md.
  var raw = Math.max(mid, 0) * DOLLARS_PER_DPS * TIER_PREMIUM[tier - 1];
  var floor = baseCost / 3;

  return {
    tier: pathName + tier,
    average: average,
    median: mid,
    min: Math.min.apply(null, values),
    max: Math.max.apply(null, values),
    best: gains.reduce(function (a, b) { return b.gain > a.gain ? b : a; }),
    cost: tidy(Math.max(raw, floor))
  };
}

var baseDps = effectiveDps({});
var baseCost = tidy(baseDps * DOLLARS_PER_DPS);

console.log("\nLongshot pricing model");
console.log("anchor: $" + DOLLARS_PER_DPS + "/DPS (the gunner)   " +
  "cluster: " + CLUSTER + " enemies   avg kill-stacks: " + STACKS + "\n");

console.log("base tower: " + baseDps.toFixed(2) + " effective DPS  ->  $" + baseCost + "\n");

console.log("DPS gain per tier, across every legal crosspath it can be bought in:\n");
console.log("  tier   median       mean        min        max   best with     cost");
console.log("  ---------------------------------------------------------------------");

["A", "B"].forEach(function (pathName) {
  for (var tier = 1; tier <= 5; tier++) {
    var row = priceLine(pathName, tier);
    console.log(
      "  " + row.tier.padEnd(6) +
      row.median.toFixed(1).padStart(9) +
      row.average.toFixed(1).padStart(11) +
      row.min.toFixed(1).padStart(11) +
      row.max.toFixed(1).padStart(11) +
      ("  " + row.best.companion).padEnd(12) +
      ("$" + row.cost).padStart(9)
    );
  }
  console.log("");
});

// The case that motivated all this.
console.log("the crosspath the flat model missed:");
["B5", "B5+A1", "B5+A2"].forEach(function (label) {
  var state = label === "B5" ? { B: 5 } :
              label === "B5+A1" ? { B: 5, A: 1 } : { B: 5, A: 2 };
  var stats = StatResolver.resolve(CONFIG, state);
  console.log("  " + label.padEnd(7) +
    "fireRate " + stats.fireRate.toFixed(2) +
    "  (" + (1 / stats.fireRate).toFixed(1) + " s/shot)" +
    "   pierce " + stats.pierce +
    "   -> " + effectiveDps(state).toFixed(0) + " DPS");
});
console.log("");

// What complete builds actually cost. The pure-path totals are a trap: a
// player who takes a path to 5 can still take the other to 2, and that is
// almost always what they should do -- so those are the builds to judge the
// prices by.
function buildCost(state) {
  var total = baseCost;
  ["A", "B"].forEach(function (pathName) {
    for (var tier = 1; tier <= (state[pathName] || 0); tier++) {
      total += priceLine(pathName, tier).cost;
    }
  });
  return total;
}

console.log("complete builds:\n");
console.log("  build        cost        DPS      $/DPS");
console.log("  ------------------------------------------");

[
  ["A5 (pure)", { A: 5 }],
  ["A5 + B2",   { A: 5, B: 2 }],
  ["B5 (pure)", { B: 5 }],
  ["B5 + A1",   { B: 5, A: 1 }],
  ["B5 + A2",   { B: 5, A: 2 }],
  ["A2 + B2",   { A: 2, B: 2 }]
].forEach(function (entry) {
  var cost = buildCost(entry[1]);
  var dps = effectiveDps(entry[1]);
  console.log(
    "  " + entry[0].padEnd(12) +
    ("$" + cost).padStart(8) +
    dps.toFixed(0).padStart(11) +
    ("$" + (cost / dps).toFixed(1)).padStart(11)
  );
});

console.log("\n  (the gunner sets the rate at $15.0/DPS)\n");
