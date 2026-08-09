// ---------------------------------------------------------------------------
// HealingLedger -- how much base HP every tower has restored this run, pooled.
//
// The beam tower's B5 is gated on healing done, and that total has to be
// SHARED rather than per tower. Per tower it is close to unbuyable: only one
// B5 may exist in a game, so a single tower would have to reach the threshold
// on its own while the other lifesteal towers' work counted for nothing. The
// pool means a B-path defence earns the upgrade collectively, which is how
// the path is actually played.
//
// Scoped to the RUN, so restartGame clears it -- same treatment as the
// one-per-game death-denial slot.
//
// Deliberately its own module rather than a counter on the tower: it is a
// property of the game, several towers write to it, and the upgrade
// validation layer reads it. Hiding that on one tower instance would make the
// sharing invisible.
// ---------------------------------------------------------------------------

var HealingLedger = (function () {

  var healed = 0;

  function record(amount) {
    if (!(amount > 0)) return;
    healed += amount;
  }

  function total() { return healed; }

  function reset() { healed = 0; }

  return {
    record: record,
    total: total,
    reset: reset
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = HealingLedger;
}
