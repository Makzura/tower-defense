// ---------------------------------------------------------------------------
// RangeFilter
//
// Given a tower's RESOLVED stats (range, deadzone, targetShape, coneArcDeg),
// its position, its aim direction, and a list of enemies, returns which
// enemies are legally targetable -- that is, WITHIN REACH.
//
// It does not choose between them. Which of the reachable enemies a tower
// actually shoots is the targeting MODE, and lives in js/targeting.js. This
// module was called `Targeting` until v0.3.5, when the merge brought in a
// module of that name doing the other half of the job. Generic across circle and cone shapes and
// across any tower's seesFlying/seesCamo -- a future melee or AoE tower with
// its own range/shape just calls the same function.
//
// SPACE: this is the COLLISION LAYER, so it is one of the two places (with
// rendering) where u.l. becomes world units -- see js/units.js. Positions
// come in as WORLD coordinates; the tower's radii come from config in u.l.
// and are converted here, once per query, via ul(). Everything is compared
// in world space after that.
//
// Do not "simplify" this by dropping the ul() calls and comparing world
// distances straight against stats.range. That mixes the two spaces, which
// is precisely the failure mode the u.l. system exists to prevent -- and it
// is not hypothetical: this file shipped with exactly that bug on
// 2026-07-26 (targeting used a 250 *pixel* radius while the same tower drew
// a 250 *u.l.* one), and it was invisible until the tower was dropped into
// the real game beside enemies that actually walk. See AGENTS.md's change
// log.
//
// Enemies are duck-typed: { x, y, isFlying (optional), isCamo (optional) },
// all in world coordinates. This file does not import js/enemy.js and does
// not know about bullets, HP, or claiming -- it only answers "is this enemy
// a legal target", which keeps it reusable outside this specific game's
// Enemy class too.
// ---------------------------------------------------------------------------

var RangeFilter = (function () {

  // In the browser ul() is a global (classic script, loaded first). Under
  // Node there are no shared globals, so pull it from the module. Evaluated
  // once at load; ul() reads the live UNIT_LENGTH either way, so retuning
  // the constant still takes effect immediately.
  var toWorld = (typeof ul === "function") ? ul : require("../units.js").ul;

  function normalizeAngle(rad) {
    var twoPi = Math.PI * 2;
    var a = rad % twoPi;
    if (a > Math.PI) a -= twoPi;
    if (a < -Math.PI) a += twoPi;
    return a;
  }

  function angleDiff(a, b) {
    return normalizeAngle(a - b);
  }

  // Is `enemy` a legal target for a tower with `stats`, sitting at
  // `towerPos`, aimed at `aimRad` (only relevant in cone mode)?
  // All positions in world coordinates.
  function canTarget(stats, towerPos, aimRad, enemy) {
    if (enemy.isFlying && !stats.seesFlying) return false;
    if (enemy.isCamo && !stats.seesCamo) return false;

    var dx = enemy.x - towerPos.x;
    var dy = enemy.y - towerPos.y;
    var distance = Math.sqrt(dx * dx + dy * dy);

    // The one conversion, done once per query rather than per comparison.
    if (distance > toWorld(stats.range)) return false;

    if (stats.targetShape === "cone") {
      // "No deadzone in cone mode." -- section 5.6.
      var halfArcRad = (stats.coneArcDeg * Math.PI / 180) / 2;
      var angleToEnemy = Math.atan2(dy, dx);
      var diff = Math.abs(angleDiff(angleToEnemy, aimRad));
      return diff <= halfArcRad;
    }

    // circle mode: deadzone applies.
    return distance >= toWorld(stats.deadzone);
  }

  function getValidTargets(stats, towerPos, aimRad, enemies) {
    return enemies.filter(function (enemy) {
      return canTarget(stats, towerPos, aimRad, enemy);
    });
  }

  return {
    canTarget: canTarget,
    getValidTargets: getValidTargets,
    normalizeAngle: normalizeAngle,
    angleDiff: angleDiff
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = RangeFilter;
}
