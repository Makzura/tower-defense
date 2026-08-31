// ---------------------------------------------------------------------------
// GoldPower -- the beam tower's A5: the player's bank makes the tower better.
//
// Read LIVE, every tick. The tower gets stronger as you get richer and weaker
// as you spend, with no purchase or event in between; that swing is the
// mechanic, so nothing here caches.
//
//     tiers     = floor(gold / 10000)
//     perCharge = 0.50 + 0.10 * tiers      gold gained per charge
//     capTotal  = 5.00 + 1.00 * tiers      ceiling on the gold multiplier
//
// Worth checking against the spec, because the arithmetic is easy to get
// wrong by one: capTotal INCLUDES the base 1.0, so at 0 gold the cap is 5.0
// and 8 charges reach it (1 + 8*0.5 = 5.0). At 50k the cap is 10.0 and it
// takes 9 charges (1 + 9*1.0 = 10.0), not 10.
//
// AD bonus: linear while it is small, logarithmic after, so being rich keeps
// helping without the tower running away.
//
//     linear = gold / 10000                +1 AD per 10k
//     <= 10  -> use it directly            (linear up to +10 AD at 100k)
//     >  10  -> 10 + LOG_COEF * log2(gold / 100000)
//
// LOG_COEF 5 gives +15 at 200k, +20 at 400k, +25 at 800k. The bonus is
// FRACTIONAL, not floored -- AD has no reason to be an integer, and rounding
// would make the first several thousand gold do nothing at all.
// ---------------------------------------------------------------------------

var GoldPower = (function () {

  var GOLD_PER_TIER = 10000;
  var LINEAR_CAP_AD = 10;          // where linear growth hands over to log
  var LOG_PIVOT_GOLD = 100000;     // the gold at which that happens
  var LOG_COEF = 5;

  // THE GOLD SCALING STOPS AT 50 000. Above that, more gold buys no more
  // gold-gain -- five tiers, so perCharge tops out at 1.0 and capTotal at 10.
  //
  // That is exactly the state the spec works through as its example ("at 50k
  // gold: perCharge = 100%, capTotal = 1000%, so 9 charges to cap"), and it
  // is the ceiling the tower is balanced around: with capTotal 10 the most a
  // charge stack can ever add is 9x the base income.
  //
  // It also puts a brake on a genuine feedback loop. The spec's formulas are
  // unbounded, and gold income is damage x multiplier while the multiplier
  // grows with gold -- so gold feeds itself, exponentially. Measured at a
  // realistic 370 dps with one charge from 100k: gold passes 1.3M in eight
  // minutes and the bonus climbs past 20 per point of damage. That is where
  // "5000 damage produced 106k bonus gold" came from: not an arithmetic
  // error, a loop with nothing stopping it. Above the cap, income is linear
  // in damage instead of compounding.
  //
  // (The spec damped this with baseGoldPerDamage = 1/200. That had to become
  // 1 for the tower to earn at the same rate as everything else in this game
  // -- see beam.config.js -- which removed the damping entirely.)
  //
  // This bounds the GOLD scaling only. The AD bonus is deliberately left
  // uncapped: it is already logarithmic, so it cannot run away.
  var MAX_SCALING_GOLD = 50000;
  var MAX_TIERS = MAX_SCALING_GOLD / GOLD_PER_TIER;   // 5

  function tiers(gold, maxTiers) {
    var raw = Math.floor(Math.max(0, gold) / GOLD_PER_TIER);
    var cap = (maxTiers === undefined) ? MAX_TIERS : maxTiers;
    return Math.min(raw, cap);
  }

  function perCharge(gold, maxTiers) {
    return 0.50 + 0.10 * tiers(gold, maxTiers);
  }

  function capTotal(gold, maxTiers) {
    return 5.00 + 1.00 * tiers(gold, maxTiers);
  }

  function bonusAD(gold) {
    var safe = Math.max(0, gold);
    var linear = safe / GOLD_PER_TIER;
    if (linear <= LINEAR_CAP_AD) return linear;
    return LINEAR_CAP_AD + LOG_COEF * (Math.log(safe / LOG_PIVOT_GOLD) / Math.LN2);
  }

  return {
    GOLD_PER_TIER: GOLD_PER_TIER,
    LOG_COEF: LOG_COEF,
    MAX_TIERS: MAX_TIERS,
    MAX_SCALING_GOLD: MAX_SCALING_GOLD,
    tiers: tiers,
    perCharge: perCharge,
    capTotal: capTotal,
    bonusAD: bonusAD
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = GoldPower;
}
