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

  // --- line of sight -------------------------------------------------------
  //
  // INJECTED, NOT IMPORTED. This module knows nothing about maps, and it must
  // not start: its whole value is that it answers "is this enemy within reach"
  // for anything with an {x, y}, in Node, with no game loaded. Reaching for a
  // `currentMap` global here would make every one of its pure tests depend on a
  // battlefield being booted.
  //
  // So the game hands it a predicate when a map loads, and takes it away when
  // one unloads. The default is "everything is visible", which is exactly what
  // the six mapless boards and every existing test want -- and it is a null
  // check per query, not a shape loop.
  var occlusion = null;

  // fn(ax, ay, bx, by) -> true when the straight line is CLEAR.
  function setOcclusion(fn) { occlusion = (typeof fn === "function") ? fn : null; }
  function clearOcclusion() { occlusion = null; }

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

  // HOW FAR THIS TOWER REACHES, in world units.
  //
  // `stats.range` is in u.l. and the conversion happens here, once per query
  // rather than per comparison -- that is the rule at the top of this file and
  // it has not moved. What a caller MAY do is hand in the world-space number
  // itself, on the same object it already hands in `groundHeight`: elevation
  // grows a tower's reach (Tower.ELEVATION_RANGE_PER_UL) and that is a fact
  // about WHERE the tower stands, which a stats table cannot know and this
  // module must not learn. `rangePx` is what every tower in the game already
  // calls that number, so a caller passing the tower itself is passing the
  // right thing by construction.
  //
  // Absent, it converts. Every existing caller passes a bare {x, y} and so gets
  // exactly the arithmetic it always got.
  function reachOf(stats, towerPos) {
    return (towerPos && typeof towerPos.rangePx === "number")
      ? towerPos.rangePx : toWorld(stats.range);
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

    if (distance > reachOf(stats, towerPos)) return false;

    if (stats.targetShape === "cone") {
      // "No deadzone in cone mode." -- section 5.6.
      var halfArcRad = (stats.coneArcDeg * Math.PI / 180) / 2;
      var angleToEnemy = Math.atan2(dy, dx);
      var diff = Math.abs(angleDiff(angleToEnemy, aimRad));
      if (diff > halfArcRad) return false;
      return sightClear(towerPos, enemy);
    }

    // circle mode: deadzone applies.
    if (distance < toWorld(stats.deadzone)) return false;

    // SIGHT LAST, because it is the most expensive test on the list and every
    // cheap one above it has already thrown most candidates away. An enemy that
    // is out of range, behind the cone or the wrong kind never reaches a shape
    // loop at all.
    return sightClear(towerPos, enemy);
  }

  // Broken out because the cone branch above returns before the deadzone line,
  // and both branches need it.
  // The fifth argument is HOW HIGH THE EYE IS. Passed rather than looked up,
  // for the same reason the predicate is injected at all: this module answers
  // "within reach" for anything with an {x, y} and must not learn what a map is.
  // Anything without a groundHeight is standing on the floor.
  function sightClear(towerPos, enemy) {
    if (!occlusion) return true;
    return occlusion(towerPos.x, towerPos.y, enemy.x, enemy.y,
      towerPos.groundHeight || 0);
  }

  function getValidTargets(stats, towerPos, aimRad, enemies) {
    return enemies.filter(function (enemy) {
      return canTarget(stats, towerPos, aimRad, enemy);
    });
  }

  return {
    canTarget: canTarget,
    getValidTargets: getValidTargets,
    setOcclusion: setOcclusion,
    clearOcclusion: clearOcclusion,
    // Exposed so an attacker that does its own reach maths -- the Siphon's lock
    // check, the Warbringer's acquisition -- asks the same question rather than
    // writing a second one.
    sightClear: sightClear,
    normalizeAngle: normalizeAngle,
    angleDiff: angleDiff
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = RangeFilter;
}
