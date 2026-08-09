// ---------------------------------------------------------------------------
// Crosspath
//
// "Purchasing tier 3 on one path permanently locks the other path at tier 2.
//  Enforce in the upgrade validation layer, not in the UI alone."
//
// Generic over any two-path config carrying a `crosspath: { lockThreshold,
// lockOtherAtTier }` block and a `paths` object. Nothing here assumes the
// path names are "A"/"B" or that there are exactly two paths' worth of logic
// beyond "the other one(s)" -- see isValidState, which works for the
// two-path case this tower uses and does not need touching if a future tower
// still has exactly two paths with a different tier count.
// ---------------------------------------------------------------------------

var Crosspath = (function () {

  // True if `purchased` (a map of pathName -> tier count) is a legal state:
  // no two paths may simultaneously be at or above lockThreshold.
  function isValidState(purchased, config) {
    var threshold = config.crosspath.lockThreshold;
    var pathNames = Object.keys(config.paths);

    var pathsAtOrAboveThreshold = pathNames.filter(function (name) {
      return (purchased[name] || 0) >= threshold;
    });

    return pathsAtOrAboveThreshold.length <= 1;
  }

  // Can the next tier on `pathName` be bought right now? Checks both the
  // tier ceiling (max 5) and the crosspath lock, by simulating the purchase
  // and asking whether the result is a valid state -- so the lock rule lives
  // in exactly one place (isValidState) and can never disagree with it.
  function canPurchaseNext(purchased, pathName, config) {
    var tiers = config.paths[pathName];
    if (!tiers) return { ok: false, reason: "no such path: " + pathName };

    var current = purchased[pathName] || 0;
    if (current >= tiers.length) {
      return { ok: false, reason: "path already at max tier" };
    }

    var next = current + 1;
    var proposed = {};
    for (var key in purchased) proposed[key] = purchased[key];
    proposed[pathName] = next;

    if (!isValidState(proposed, config)) {
      return {
        ok: false,
        reason: "crosspath lock: another path is already at tier " +
          config.crosspath.lockThreshold + "+, this path is capped at tier " +
          config.crosspath.lockOtherAtTier
      };
    }

    return { ok: true, resultingTier: next };
  }

  return {
    isValidState: isValidState,
    canPurchaseNext: canPurchaseNext
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Crosspath;
}
