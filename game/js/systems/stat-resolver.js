// ---------------------------------------------------------------------------
// StatResolver
//
// "Final stat = base value + sum of the deltas of every purchased upgrade."
//
// Generic over ANY tower config shaped like js/towers/long-range-dps.config.js
// (a `base` object, a `paths` object of tiered `{deltas, grants, setParams}`
// entries, and a `crosspath` block). Adding a new tower with more or fewer
// stats, paths, or flags requires NO change here -- this file never mentions
// a stat name, a path name, or a flag name that belongs to one tower.
//
// FLAG_EFFECTS is the one exception to "everything is a delta": section 1 of
// the spec calls out camo detection, infinite pierce, cone shape, and
// deadzone removal as flags, not numbers. Each entry here is a pure function
// of (resolved stats so far) -> mutates resolved stats. A future tower that
// grants one of these same flags gets the same effect for free; a future
// tower that needs a NEW kind of override adds one entry here, still with no
// per-tower branching.
// ---------------------------------------------------------------------------

var StatResolver = (function () {

  var FLAG_EFFECTS = {
    camoDetection: function (stats) {
      stats.seesCamo = true;
    },
    infinitePierce: function (stats) {
      stats.pierce = Infinity;
    },
    coneShape: function (stats) {
      stats.targetShape = "cone";
      stats.coneIsPlayerAimed = true;
    },
    deadzoneRemoved: function (stats) {
      stats.deadzone = 0;
    }
  };

  // Deep-enough clone for plain JSON-like config data (numbers, strings,
  // booleans, nested plain objects/arrays). Config data never contains
  // functions or cycles, so this is safe and keeps callers from mutating
  // the shared config.
  function clone(value) {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(clone);
    var out = {};
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        out[key] = clone(value[key]);
      }
    }
    return out;
  }

  // Merge b's own keys onto a, one level deep (values themselves are
  // replaced wholesale, not merged further) -- exactly what `setParams`
  // needs: a later tier's param object REPLACES an earlier tier's, it does
  // not get added to it.
  function assignShallow(target, source) {
    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = clone(source[key]);
      }
    }
  }

  // purchased: { <pathName>: tierCount, ... }, e.g. { A: 3, B: 2 }
  // Tier counts are cumulative -- a count of 3 means tiers 1, 2 AND 3 are
  // owned, in order. Config tiers are consumed in array order (tier 1 first),
  // which is what makes "cumulative and additive" true.
  function resolve(config, purchased) {
    var stats = clone(config.base);
    stats.flags = {};
    stats.mechanics = clone(config.mechanics || {});

    var pathNames = Object.keys(config.paths);
    for (var p = 0; p < pathNames.length; p++) {
      var pathName = pathNames[p];
      var owned = (purchased && purchased[pathName]) || 0;
      var tiers = config.paths[pathName];

      for (var i = 0; i < owned && i < tiers.length; i++) {
        var tier = tiers[i];

        // 1. Apply this tier's deltas -- additive, never absolute.
        //
        // `deltas` and `statDeltas` are the same thing under two names: the
        // first tower written here used one, the beam tower's spec used the
        // other. Accepting both beats renaming a spec's own vocabulary.
        var deltas = tier.deltas || tier.statDeltas || {};
        for (var statKey in deltas) {
          if (Object.prototype.hasOwnProperty.call(deltas, statKey)) {
            stats[statKey] = (stats[statKey] || 0) + deltas[statKey];
          }
        }

        // 2. Record any flags this tier grants (union -- once on, stays on).
        //
        // Three spellings, one meaning. `grants` is a list of flag names;
        // `mechanics` is a list of mechanic-module keys (which behave
        // identically -- a module is on or it is not); `flags` is an object
        // of named booleans for plain stat flags like seesCamo, where FALSE
        // must not un-set something an earlier tier granted.
        (tier.grants || []).forEach(function (flag) {
          stats.flags[flag] = true;
        });

        (tier.mechanics || []).forEach(function (key) {
          stats.flags[key] = true;
        });

        for (var flagKey in (tier.flags || {})) {
          if (tier.flags[flagKey]) stats[flagKey] = true;
        }

        // 3. Apply setParams -- an OVERRIDE of a named mechanic parameter,
        // not a delta. A later tier's setParams for the same mechanic wins,
        // which is exactly how B4 raises B3's execute cap from 40% to 60%
        // without stacking to 100%.
        if (tier.setParams) {
          for (var mechanicKey in tier.setParams) {
            if (Object.prototype.hasOwnProperty.call(tier.setParams, mechanicKey)) {
              if (!stats.mechanics[mechanicKey]) stats.mechanics[mechanicKey] = {};
              assignShallow(stats.mechanics[mechanicKey], tier.setParams[mechanicKey]);
            }
          }
        }
      }
    }

    // 4. Flag effects apply once, after every delta and setParams has been
    // folded in, and in a fixed order so results are deterministic
    // regardless of which path granted which flag.
    Object.keys(FLAG_EFFECTS).sort().forEach(function (flagName) {
      if (stats.flags[flagName]) {
        FLAG_EFFECTS[flagName](stats);
      }
    });

    return stats;
  }

  return {
    FLAG_EFFECTS: FLAG_EFFECTS,
    resolve: resolve
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = StatResolver;
}
