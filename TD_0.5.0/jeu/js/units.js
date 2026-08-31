// ---------------------------------------------------------------------------
// The global distance system
//
// Every distance in this game -- tower range, deadzone, footprint, AoE and
// aura radii, projectile travel, map geometry -- is authored in "unit
// lengths" (u.l.), never in pixels or any other screen/engine unit.
//
// Concept: a hypothetical tower with range 100 u.l. is the permanent
// yardstick. It stays 100 forever. The real on-screen size of 1 u.l. is a
// single tunable constant, adjusted by feel during playtesting:
//
//     UNIT_LENGTH = 1.04
//
// Changing that one constant rescales every distance in the game
// simultaneously. Individual towers/enemies/etc. can still be retuned
// independently by editing their own u.l. values in their own config.
//
// THE RULE: all distances are u.l., converted once, at the edge.
//
//   ul(value) -> value * UNIT_LENGTH
//
// is the ONLY place u.l. becomes screen/world units. No other line of code
// may multiply anything by UNIT_LENGTH -- that is the one hard constraint
// this file exists to enforce. Config files, save data and game logic all
// stay in u.l.; conversion happens only at the render and collision layer,
// at the moment of use (see "Distance comparisons" below for how that layer
// avoids mixing u.l. and world space).
//
// WHAT ONE u.l. IS WORTH, and why the constant is 1.04:
//
// The yardstick is the hypothetical 100 u.l. reference tower. Everything in
// the game is authored against that, so the gunner -- the ordinary, basic
// tower -- IS the reference: its range is exactly 100 u.l. A Longshot at 250
// is two and a half times the reference, which is what "long range" means
// here.
//
// The whole game was re-authored onto that anchor on 2026-07-27 (see the
// AGENTS.md change log). Before that the gunner was 8 u.l. on a 100 u.l.
// map -- numbers inherited from an older meters system -- while Longshot was
// written at 250/20, and the two could not coexist: Longshot's range was
// 2.5x the entire map and its no-build radius exceeded the playable area.
// Every legacy distance was multiplied by 12.5 (8 -> 100) and UNIT_LENGTH
// divided by the same, which left every distance in PIXELS untouched while
// putting the numbers on the shared scale the spec describes. The separate
// 33% reduction below is a later, deliberate visual change on top of that.
//
//   1.552 = 19.4 (the old px per unit) / 12.5 (the re-anchoring factor)
//   1.04  = that, tuned down by a third on 2026-07-27 because the sniper's
//           range and footprint read as too large on screen
//
// Tune this by feel; it is the one number that changes how big everything
// is on screen, and nothing else. The sandbox (sandbox.html) has a live box
// for it.
//
// Worth knowing before reaching for it again: this shrinks the WHOLE WORLD
// uniformly -- map, road, gunner and sniper together -- because the path is
// authored in u.l. too. It changes how much of the canvas the game occupies,
// not how big any tower is *relative to the map*. If a tower feels
// out-of-proportion to the route it guards, that is a stat to change (its
// range in its own config), not this constant.
//
// Angles are NOT u.l. and are never passed through ul() -- cone arcs etc.
// are authored and stored in degrees, at rest and at the edge alike.
// ---------------------------------------------------------------------------

var UNIT_LENGTH = 1.04; // px per u.l. Tune by feel; see the note above.

function ul(value) {
  return value * UNIT_LENGTH;
}

// Node only -- lets js/systems/*.js and the test suites require this file.
// The browser never runs this block (classic scripts, no `module`), where
// UNIT_LENGTH and ul() are ordinary globals instead. getUnitLength/
// setUnitLength exist because `UNIT_LENGTH` itself cannot be exported by
// reference: a test that needs to retune it goes through the setter, and
// ul() reads the same live variable either way.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ul: ul,
    getUnitLength: function () { return UNIT_LENGTH; },
    setUnitLength: function (value) { UNIT_LENGTH = value; }
  };
}
