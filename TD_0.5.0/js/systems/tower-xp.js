// ---------------------------------------------------------------------------
// TowerXP -- a FIXED budget per wave, split by what was actually invested
//
// The experience half of the permanent progression added on 2026-08-30. Perks
// are bought with meta coins (js/systems/tower-perks.js); the SLOTS they go in
// are opened by a tower type's level, and a level is bought with this.
//
// THE RULE, AND EVERY EXPLOIT IT CLOSES AT ONCE. Each wave carries a fixed
// budget of xp, decided before it starts and never by what happened in it:
//
//   * not damage, so overkill is worth nothing;
//   * not kills, so a Hive's brood and a boss's summons are worth nothing;
//   * not time, so stalling a wave with stuns, slows or a wall of summons
//     earns exactly what killing it instantly earns;
//   * not survival, so a wave that is finished is paid whether the run is
//     later won, lost or walked away from.
//
// A contribution formula per role was the obvious alternative and is the wrong
// one: it needs a different measure for a Farm than for a Rifleman, it pays a
// Summoner for its blubs' kills or forgets to, and every new tower arrives
// needing its own. This is BTD6's answer and it generalises for free -- a
// tower that never fires earns the same way one that never stops does.
//
// HOW THE BUDGET IS SPLIT: by INVESTMENT INTEGRATED OVER THE WAVE.
//
//   weight(type) = the integral of that type's `totalSpent` over the wave
//
// Every frame, each tower on the board adds what has been sunk into it times
// the step. A type's share of the wave is its weight over the total. That is
// one line of arithmetic and it answers all six of the brief's edge cases:
//
//   * a tower bought in the last second of a wave integrates almost nothing,
//     so it cannot buy a share retroactively;
//   * selling everything else in the last second does not move the shares that
//     the whole wave already earned;
//   * a tower that was sold or destroyed KEEPS the share it stood for while it
//     stood there;
//   * a refund cannot make a contribution negative, because the quantity being
//     integrated is money already spent and is never negative;
//   * buy/sell churn accumulates only while a tower is actually up, and pays
//     half the price of the tower each cycle for the privilege;
//   * upgrades count, because `totalSpent` is the purchase price plus every
//     tier since -- a fully built tower outweighs a bare one, which is the
//     "proportion of the money" the brief asks for.
//
// AND IT CANNOT INFLATE THE BUDGET. The integral decides SHARES only; the
// total is the wave's own number. A longer wave has a bigger integral and
// exactly the same payout.
//
// SUMMONS BELONG TO THEIR SUMMONER. A blub is in `towers` and its `totalSpent`
// is zero (js/blub.js sets it so a blub refunds nothing), so it weighs nothing
// of its own -- and the mana that produced it was spent on the Summoner, which
// is where the weight already is. Recruits are not in `towers` at all.
//
// THE SIZE OF THE PURSE. A full campaign pays about RUN_XP_TARGET before the
// split, scaled by the campaign's own rating -- the same `Difficulty.scaleFor`
// the coin rewards use, so a longer or harder schedule pays more for asking
// more, and nothing here assumes any campaign's wave count. Against the
// thresholds in js/meta.js that is roughly 2 focused runs to level 1 and 35 to
// level 5.
//
// DERIVED, NEVER TYPED IN PER WAVE, which is the rule `waveBounty` already
// follows: retuning a schedule moves its xp with it and the two cannot drift.
// ---------------------------------------------------------------------------

var TowerXP = (function () {

  // What a whole reference campaign is worth before it is split between types.
  // Easy on the default board rates exactly 1.00 (js/systems/difficulty.js), so
  // that campaign pays this number and every other one pays it times its own
  // rating. BALANCE VALUE.
  var RUN_XP_TARGET = 500;

  // HOW MUCH MORE A LATE WAVE IS WORTH THAN AN EARLY ONE. The weight of wave n
  // of N is `1 + LATE_WEIGHT * (n/N)^2`, so the last wave of a campaign is
  // worth four times its first and the rise is smooth rather than stepped.
  //
  // The floor of 1 is deliberate: a curve with no floor (a plain n^2) makes the
  // opening waves worth hundredths of a point, and a wave that pays nothing
  // measurable reads as a bug. Four-to-one is a clear reason to push deeper
  // without making the early game worthless.
  var LATE_WEIGHT = 3;

  // PAST THE END OF THE CAMPAIGN, if a freeplay or endless mode is ever added.
  // No schedule reaches here today -- every campaign ends with its last wave --
  // and it exists so that the day one does not arrive with an xp fountain
  // attached. Sharply diminishing, as the brief asks: the first stretch past
  // the end pays 30% and everything after it 10%.
  var FREEPLAY_NEAR = 0.30;
  var FREEPLAY_FAR = 0.10;
  var FREEPLAY_NEAR_WAVES = 10;

  // Off in the sandbox and in any other rig that is not a run of the game. A
  // testing surface that banked levels would make the profile a thing you could
  // not trust, and the sandbox already hands out infinite money.
  var enabled = true;

  // The wave being watched: type id -> integrated investment. Flushed when the
  // wave settles. Between waves it accumulates for the wave that is coming,
  // which is correct -- a tower standing through a countdown is a tower the
  // player is paying to keep for the next wave.
  var weights = {};

  // What this run has paid, per type, plus the levels it moved. Read by the
  // end-of-run overlay; cleared when a run starts.
  var ledger = null;

  function setEnabled(on) { enabled = !!on; }
  function isEnabled() { return enabled; }

  // --- the budget ------------------------------------------------------------

  function weightOf(waveNumber, waveCount) {
    if (waveNumber > waveCount) {
      var past = waveNumber - waveCount;
      var rate = past <= FREEPLAY_NEAR_WAVES ? FREEPLAY_NEAR : FREEPLAY_FAR;
      return (1 + LATE_WEIGHT) * rate;
    }
    var t = waveNumber / waveCount;
    return 1 + LATE_WEIGHT * t * t;
  }

  // The sum of the weights of a whole campaign, which is what turns the curve
  // into a share of RUN_XP_TARGET. Depends on the wave count and nothing else.
  function weightSum(waveCount) {
    var total = 0;
    for (var n = 1; n <= waveCount; n++) total += weightOf(n, waveCount);
    return total;
  }

  // WHAT WAVE `waveNumber` OF A `waveCount`-WAVE CAMPAIGN IS WORTH. `scale` is
  // the campaign's difficulty rating; 1 for the reference campaign.
  //
  // Pure: the same three numbers always give the same answer, which is what
  // lets the tests sum a whole schedule and assert it lands on the target.
  function waveBudget(waveNumber, waveCount, scale) {
    if (!(waveCount > 0) || !(waveNumber > 0)) return 0;
    var rating = (typeof scale === "number" && isFinite(scale) && scale > 0) ? scale : 1;
    return RUN_XP_TARGET * rating * weightOf(waveNumber, waveCount) / weightSum(waveCount);
  }

  // The whole schedule's worth, for the readouts and the tests.
  function runBudget(waveCount, scale) {
    var total = 0;
    for (var n = 1; n <= waveCount; n++) total += waveBudget(n, waveCount, scale);
    return total;
  }

  // --- the run ---------------------------------------------------------------

  function beginRun() {
    weights = {};
    ledger = { perType: {}, levels: {}, total: 0, waves: 0 };
  }

  function runLedger() {
    if (!ledger) return { perType: {}, levels: {}, total: 0, waves: 0 };
    return {
      perType: shallow(ledger.perType),
      levels: shallow(ledger.levels),
      total: ledger.total,
      waves: ledger.waves
    };
  }

  function shallow(o) {
    var out = {};
    Object.keys(o).forEach(function (k) { out[k] = o[k]; });
    return out;
  }

  // ONE STEP OF THE INTEGRAL. Called from update() with the same dt the world
  // moves on, so it inherits the pause and the speed toggle for free: at 3x a
  // wave takes a third of the wall clock and integrates the same simulated
  // seconds, which is the only reading under which the speed button is not a
  // balance change.
  function track(dt, towerList) {
    if (!enabled || !(dt > 0) || !towerList) return;
    for (var i = 0; i < towerList.length; i++) {
      var tower = towerList[i];
      var id = tower && tower.constructor && tower.constructor.ID;
      if (!id) continue;
      // Catalogue types only. A blub has no id and the retired gunner is not
      // in the catalogue; neither has a progression row to pay into.
      if (typeof MetaProgress === "undefined" || !MetaProgress.entry(id)) continue;
      var spent = (typeof tower.totalSpent === "number") ? tower.totalSpent : 0;
      if (!(spent > 0)) continue;
      weights[id] = (weights[id] || 0) + spent * dt;
    }
  }

  // What the shares WOULD be right now, without spending them. Exposed for the
  // tests and for anything that wants to show the split before it lands.
  function currentShares() {
    var total = 0;
    Object.keys(weights).forEach(function (id) { total += weights[id]; });
    var out = {};
    if (total <= 0) return out;
    Object.keys(weights).forEach(function (id) { out[id] = weights[id] / total; });
    return out;
  }

  // CREDIT ONE FINISHED WAVE AND OPEN THE NEXT ONE'S BOOKS.
  //
  // Called from endWave -- the ONE exit a wave has, which is what makes "paid
  // exactly once" a property of a single call site rather than of several
  // agreeing with each other. It is the same door `payWaveBounty` uses and for
  // the same reason.
  //
  // The accumulator is cleared whether or not anything was paid, because it
  // belongs to the wave that just ended either way. A wave fought with nothing
  // on the board pays nobody and is not held over.
  function settleWave(waveNumber, waveCount, scale) {
    var shares = currentShares();
    weights = {};

    if (!enabled) return { budget: 0, awarded: {}, levels: {} };

    var budget = waveBudget(waveNumber, waveCount, scale);
    var awarded = {}, levels = {};

    // NO ELIGIBLE TYPE MEANS NO PAYOUT, not a payout held over or split evenly.
    // A wave fought with an empty board is a wave nobody invested in.
    var ids = Object.keys(shares);
    if (!budget || !ids.length) return { budget: budget, awarded: awarded, levels: levels };

    ids.forEach(function (id) {
      // The shares sum to exactly 1, so the parts sum to exactly the budget --
      // there is no rounding step that could hand out more than the wave holds.
      var amount = budget * shares[id];
      if (!(amount > 0)) return;
      var result = MetaProgress.addXp(id, amount);
      if (!result || !result.ok) return;
      awarded[id] = amount;
      if (result.levelsGained > 0) {
        levels[id] = { to: result.level, gained: result.levelsGained };
      }
    });

    if (ledger) {
      ledger.waves++;
      Object.keys(awarded).forEach(function (id) {
        ledger.perType[id] = (ledger.perType[id] || 0) + awarded[id];
        ledger.total += awarded[id];
      });
      Object.keys(levels).forEach(function (id) {
        var seen = ledger.levels[id];
        ledger.levels[id] = {
          to: levels[id].to,
          gained: (seen ? seen.gained : 0) + levels[id].gained
        };
      });
    }

    return { budget: budget, awarded: awarded, levels: levels };
  }

  return {
    RUN_XP_TARGET: RUN_XP_TARGET,
    LATE_WEIGHT: LATE_WEIGHT,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    waveBudget: waveBudget,
    runBudget: runBudget,
    beginRun: beginRun,
    track: track,
    currentShares: currentShares,
    settleWave: settleWave,
    ledger: runLedger
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = TowerXP;
}
