// ---------------------------------------------------------------------------
// Execute scaling (spec 5.4) and its tentative B2 predecessor (spec 4).
//
//   bonus = maxBonus * clamp((1 - hpFraction) / floorFraction, 0, 1)
//
// 0% at full HP, full maxBonus at (1 - floorFraction) HP or below --
// floorFraction is 0.90, so that is 10% HP. maxBonus itself is not a
// constant here: it comes from the tower's resolved mechanic params
// (0.40 at B3, 0.60 at B4+), so raising the cap is a config change, not a
// code change.
//
// B2's flat bonus is a SEPARATE, simpler effect (a flat % against targets
// below a fixed HP threshold, not scaling) and is REPLACED, not stacked,
// the moment executeScaling is granted -- see resolveExecuteBonus, which
// only ever applies one or the other.
// ---------------------------------------------------------------------------

var Execute = (function () {

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  // hpFraction: current HP / max HP of the TARGET, in [0, 1].
  function scalingBonus(hpFraction, maxBonus, floorFraction) {
    var x = (1 - hpFraction) / floorFraction;
    return maxBonus * clamp01(x);
  }

  function tentativeFlatBonus(hpFraction, flatBonus, hpFractionThreshold) {
    return hpFraction < hpFractionThreshold ? flatBonus : 0;
  }

  // stats: a resolved tower stat block (from StatResolver), which carries
  // stats.flags and stats.mechanics. hpFraction: the target's current/max.
  //
  // `forceFullBonus`: B5's guaranteed reload-precursor shot "always applies
  // the FULL execute bonus regardless of target HP" -- i.e. as if
  // hpFraction were at or below the floor, using whichever mechanic
  // (scaling or tentative-flat) is currently active.
  function resolveExecuteBonus(stats, hpFraction, forceFullBonus) {
    if (stats.flags.executeScaling) {
      var params = stats.mechanics.executeScaling;
      var effectiveFraction = forceFullBonus ? 0 : hpFraction;
      return scalingBonus(effectiveFraction, params.maxBonus, params.floorFraction);
    }

    if (stats.flags.tentativeExecuteFlat) {
      var flat = stats.mechanics.tentativeExecuteFlat;
      if (forceFullBonus) return flat.flatBonus;
      return tentativeFlatBonus(hpFraction, flat.flatBonus, flat.hpFractionThreshold);
    }

    return 0;
  }

  return {
    scalingBonus: scalingBonus,
    tentativeFlatBonus: tentativeFlatBonus,
    resolveExecuteBonus: resolveExecuteBonus
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Execute;
}
