// ---------------------------------------------------------------------------
// PlayerEffects -- how the Player's resolved block reaches a tower
//
// `PlayerPerks.resolved()` answers WHAT the loadout is worth. This file answers
// WHERE it lands, and it deliberately does that the same way a Farm's
// investment already does rather than by inventing a second mechanism:
//
//   range        `elevatedRangePx` multiplies by `rangeScale(tower)`. ONE call
//                site, and every type caches its `rangePx` out of it -- so the
//                Summoner's blubs and the Siphon's beam are covered without
//                either file knowing what a Player module is
//   damage       each type multiplies by `damageScale(tower)` in its own
//                recompute, beside its FarmBoost line
//   attack speed the same, through `fireRateScale(tower)`, which each type
//                applies to whichever numbers ARE its rate of fire -- three on
//                the Rifleman, a swing cycle on the Warbringer, `fireRate` on a
//                config-driven one. A single scale said once per type
//   hit points   `hpScale()` -- a flat proportion of the resolved maximum
//   footprint    `footprintScale()`, folded in BEFORE the tower exists, because
//                a footprint that moved after placement would move where a
//                tower may stand
//
// **NOTHING HERE IS WRITTEN ONTO A TOWER.** Every one of these is asked for
// during the tower's own recompute, so the answer is recomposed from base every
// time and an aura that changes takes its bonus back with it.
//
// PERCENTAGE POINTS ARE SUMMED AND TURNED INTO A FACTOR ONCE. Architecte's +5
// beside a different type, its −3 beside its own, the beacon's −2 for standing
// outside the circle and the totem's +8 are four points on one number: they are
// added as points, and `1 + points / 100` is applied exactly once. That is what
// makes the order of the Player's slots irrelevant.
//
// THE DYNAMIC HALF IS A CACHE WITH ONE DOOR. Proximity, live composition, the
// beacon's circle, the totem and the streak all change without any tower being
// upgraded, so they cannot be resolved lazily per frame: `refresh(towers)`
// recomputes them and restats every tower through its own door, exactly as
// `FarmBoost.refresh` does. Every caller that changes the board calls it.
// ---------------------------------------------------------------------------

var PlayerEffects = (function () {

  // Per-tower dynamic points, keyed by the tower object itself. Rebuilt whole
  // by `refresh`, so a tower that has left the board simply stops being in it.
  //
  // A WeakMap would be tidier and this game is ES5 -- so it is a parallel pair
  // of arrays, which is the same thing without the dependency and is cheap at
  // the board sizes this game reaches.
  var auraTowers = [];
  var auraPoints = [];

  function resolved() {
    return (typeof PlayerPerks === "undefined") ? null : PlayerPerks.resolved();
  }

  // Is this thing a TOWER for the Player's composition rules?
  //
  // The brief is explicit that recruits, summons, mines, the beacon and the
  // totem are not: they have no catalogue id, so `constructor.ID` is the whole
  // test and a future summon inherits the answer for free. A Summoner's blub is
  // in `towers` and is NOT one -- what its owner's modules did to it was done to
  // its owner.
  function isCountable(tower) {
    if (!tower || !tower.constructor) return false;
    if (!tower.constructor.ID) return false;
    if (typeof MetaProgress === "undefined") return true;
    return !!MetaProgress.entry(tower.constructor.ID);
  }

  function alive(tower) {
    return tower && !(tower.isDestroyed && tower.isDestroyed());
  }

  // --- the dynamic pass ------------------------------------------------------

  // RECOMPUTE EVERY AURA AND RESTAT EVERY TOWER. Called from the one door each
  // kind of change goes through: `addTower`, `sellTower`, the destroyed sweep,
  // a beacon that moved, a totem that died and a streak that changed.
  //
  // It is a whole-board pass rather than an incremental one on purpose. Every
  // rule here is about the board's COMPOSITION -- how many types are alive, what
  // is within 70 u.l. of what -- so a tower joining or leaving changes the
  // answer for others, and an incremental version would need to know which. At
  // the board sizes this game reaches the pass is a few hundred comparisons.
  function refresh(towerList) {
    var r = resolved();
    auraTowers = [];
    auraPoints = [];
    if (!r || !towerList) return;

    var list = towerList.filter(function (t) { return alive(t) && isCountable(t); });

    // THE LIVE COMPOSITION, counted once: how many DIFFERENT types are standing.
    var types = {};
    list.forEach(function (t) { types[t.constructor.ID] = true; });
    var typeCount = Object.keys(types).length;

    // Arsenal partagé pays a point a type and stops at its cap.
    var sharedDamage = Math.min(r.sharedCapPct, r.sharedPerTypePct * typeCount);

    // Série parfaite's charges are the same for everybody.
    var streak = (typeof PlayerRun !== "undefined") ? PlayerRun.streakCharges() : 0;
    var streakDamage = r.streakPerChargePct * streak;

    // The totem's aura is global while it lives.
    var totem = (typeof PlayerRun !== "undefined") ? PlayerRun.totem() : null;
    var totemRate = (totem && totem.alive) ? r.totemFireRatePct : 0;

    var beacon = (typeof PlayerRun !== "undefined") ? PlayerRun.beacon() : null;
    var radiusPx = r.neighbourRadiusUl > 0 ? ul(r.neighbourRadiusUl) : 0;
    var beaconPx = (beacon && r.beaconRadiusUl > 0) ? ul(r.beaconRadiusUl) : 0;

    towerList.forEach(function (tower) {
      var p = { damage: sharedDamage + streakDamage, fireRate: totemRate,
                range: -r.radarRangePenaltyPct, speed: 0 };

      if (isCountable(tower) && alive(tower)) {
        // PROXIMITY, AND EACH HALF COUNTS ONCE however many neighbours there
        // are. Architecte's two halves can BOTH be true -- a tower beside one
        // of each is faster and slower at the same time, by different amounts.
        if (radiusPx > 0) {
          var sameNear = false, otherNear = false, anyNear = false;
          for (var i = 0; i < list.length; i++) {
            var o = list[i];
            if (o === tower) continue;            // never itself
            var dx = o.x - tower.x, dy = o.y - tower.y;
            if (dx * dx + dy * dy > radiusPx * radiusPx) continue;
            anyNear = true;
            if (o.constructor.ID === tower.constructor.ID) sameNear = true;
            else otherNear = true;
          }
          if (otherNear) p.fireRate += r.archDifferentBonusPct;
          if (sameNear) p.fireRate -= r.archSamePenaltyPct;
          if (r.isolatedBonusPct || r.crowdedPenaltyPct) {
            if (anyNear) p.range -= r.crowdedPenaltyPct;
            else p.range += r.isolatedBonusPct;
          }
        }

        // THE BEACON'S CIRCLE, and the penalty for standing outside it is paid
        // by every tower whenever the module is equipped -- including when no
        // beacon has been placed at all, which is the trade the player took.
        if (r.beaconRadiusUl > 0) {
          var inside = false;
          if (beacon && beaconPx > 0) {
            var bx = beacon.x - tower.x, by = beacon.y - tower.y;
            inside = (bx * bx + by * by) <= beaconPx * beaconPx;
          }
          if (inside) {
            p.range += r.beaconRangePct;
            p.speed += r.beaconSpeedPct;
          } else {
            p.fireRate -= r.beaconFarFireRatePenaltyPct;
          }
        }
      }

      auraTowers.push(tower);
      auraPoints.push(p);
    });

    // AND THE TOWERS ARE TOLD, through their own recompute. `FarmBoost.refresh`
    // is the existing door for exactly this and knows all three tower shapes,
    // so it is reused rather than copied.
    if (typeof FarmBoost !== "undefined") {
      towerList.forEach(function (t) { FarmBoost.refresh(t); });
    }
  }

  function pointsFor(tower) {
    for (var i = 0; i < auraTowers.length; i++) {
      if (auraTowers[i] === tower) return auraPoints[i];
    }
    return null;
  }

  // --- the scales a tower asks for -------------------------------------------

  function factor(points) { return 1 + points / 100; }

  // WHAT MULTIPLIES THIS TOWER'S DAMAGE. Composition and streak only -- neither
  // is a per-tower stat, and both change without a purchase.
  function damageScale(tower) {
    var p = pointsFor(tower);
    if (!p || !p.damage) return 1;
    return Math.max(0, factor(p.damage));
  }

  // WHAT MULTIPLIES THIS TOWER'S RATE OF FIRE. Every type applies this to
  // whichever numbers ARE its rate -- said once here, spelled once per type.
  //
  // OVERDRIVE IS NOT IN HERE. It is a temporary buff with a stun on the end of
  // it, it changes several times a second, and baking it into a restat would
  // mean restatting the board twice a wave for one tower. `PlayerRun` applies
  // it live at the firing site instead, exactly as Veteran Rhythm does.
  function fireRateScale(tower) {
    var p = pointsFor(tower);
    if (!p || !p.fireRate) return 1;
    return Math.max(0.05, factor(p.fireRate));
  }

  // WHAT MULTIPLIES THIS TOWER'S REACH. Read by `elevatedRangePx`, the one
  // place a range in u.l. becomes a range in pixels.
  function rangeScale(tower) {
    var p = pointsFor(tower);
    if (!p || !p.range) return 1;
    return Math.max(0.05, factor(p.range));
  }

  // WHAT MULTIPLIES A ROUND'S FLIGHT SPEED. The beacon's, and nothing else.
  function projectileSpeedScale(tower) {
    var p = pointsFor(tower);
    if (!p || !p.speed) return 1;
    return Math.max(0.05, factor(p.speed));
  }

  // WHAT MULTIPLIES EVERY TOWER'S MAXIMUM HEALTH. Ferrailleur and Plan compact
  // both take 15 points, and equipping both really is −30: they are two
  // separate trades and the brief states each of them in full.
  //
  // NOT PER TOWER, and it does not need the aura pass -- it is a property of the
  // loadout alone, so it is correct the moment a run starts and before any
  // refresh has happened.
  function hpScale() {
    var r = resolved();
    if (!r || !r.towerHpPenaltyPct) return 1;
    return Math.max(0.05, factor(-r.towerHpPenaltyPct));
  }

  // WHAT MULTIPLIES A TYPE'S PLACEMENT FOOTPRINT. Asked BEFORE the tower
  // exists, by `buildFootprintUl` -- a footprint that shrank after placement
  // would change where a tower may stand once it is standing there, and could
  // leave one overlapping a neighbour it was legally placed beside.
  function footprintScale() {
    var r = resolved();
    if (!r || !r.footprintPenaltyPct) return 1;
    return Math.max(0.05, factor(-r.footprintPenaltyPct));
  }

  // A TOWER'S MAXIMUM HEALTH UNDER THE LOADOUT, floored at 1 -- a tower that
  // resolved to zero health would be destroyed by the act of recomputing it.
  // Every type calls this in its own recompute rather than having its health
  // written from outside, so a module coming off puts the health back.
  function scaledMaxHp(maxHp) {
    if (typeof maxHp !== "number") return maxHp;
    var scale = hpScale();
    return scale === 1 ? maxHp : Math.max(1, maxHp * scale);
  }

  // Does the Player's loadout let this tower see camo / flying right now?
  //
  // AN OVERRIDE, NEVER A REMOVAL: it can only ever say yes. A tower that
  // already sees camo keeps seeing it when the sweep ends, and one that never
  // did goes back to not seeing it -- which is the whole of "le radar ne donne
  // jamais une cible illégale après expiration".
  function grantsSight() {
    return (typeof PlayerRun !== "undefined") && PlayerRun.radarActive();
  }

  return {
    refresh: refresh,
    isCountable: isCountable,
    damageScale: damageScale,
    fireRateScale: fireRateScale,
    rangeScale: rangeScale,
    projectileSpeedScale: projectileSpeedScale,
    hpScale: hpScale,
    scaledMaxHp: scaledMaxHp,
    footprintScale: footprintScale,
    grantsSight: grantsSight,
    // Read by the tests and by the readouts -- the points a tower is carrying
    // right now, which is what makes an aura assertable without a stat.
    pointsFor: pointsFor
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = PlayerEffects;
}
