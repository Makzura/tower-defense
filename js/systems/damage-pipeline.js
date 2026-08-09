// ---------------------------------------------------------------------------
// DamagePipeline (spec 5.7)
//
//   final = damage
//         * (crit ? critDamage / 100 : 1)
//         * (1 + executeBonus)
//   then pierce falloff applies to each subsequent enemy hit.
//
// This file only does arithmetic -- it takes numbers/flags in and returns
// numbers out. Crit rolls (Math.random), target HP lookups, and firing
// belong to the caller (js/towers/tower-runtime.js), which keeps this file
// trivially unit-testable against the spec's exact verification numbers.
// ---------------------------------------------------------------------------

var DamagePipeline = (function () {

  // First-contact damage for one shot, before pierce falloff is applied to
  // subsequent enemies in the same piercing shot.
  //
  //   damage           -- resolved tower stat
  //   crit             -- bool, did this shot crit?
  //   critDamagePercent-- resolved tower stat (100 = normal)
  //   executeBonus     -- fraction, e.g. 0.6 for +60%
  function firstContactDamage(damage, crit, critDamagePercent, executeBonus) {
    var d = damage;
    d *= crit ? (critDamagePercent / 100) : 1;
    d *= (1 + executeBonus);
    return d;
  }

  // Resolves a full shot: first-contact damage, then Pierce.resolveSequence
  // spreads the falloff across every enemy the shot pierces. Returns the
  // ordered per-enemy damage list (see js/systems/pierce.js).
  function resolveShot(opts) {
    // opts: { damage, crit, critDamagePercent, executeBonus,
    //         pierceCap, hasFalloff, pierceParams }
    var d0 = firstContactDamage(
      opts.damage, opts.crit, opts.critDamagePercent, opts.executeBonus
    );
    return Pierce.resolveSequence(
      d0, opts.pierceCap, opts.hasFalloff, opts.pierceParams
    );
  }

  return {
    firstContactDamage: firstContactDamage,
    resolveShot: resolveShot
  };
})();

if (typeof module !== "undefined" && module.exports) {
  // Node has no `Pierce` global -- pull it in explicitly so this file can be
  // required standalone by tests, exactly the way the browser's classic
  // <script> load order provides it there.
  var Pierce = require("./pierce.js");
  module.exports = DamagePipeline;
}
