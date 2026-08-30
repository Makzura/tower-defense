// ---------------------------------------------------------------------------
// Missiles -- something an ENEMY put in the air, on its way to a tower.
//
// Added 2026-08-28 with the Dinomech's silo salvo, and written the same way
// js/systems/hazards.js was written the day before: as a generic structure
// rather than as that enemy's mechanic. Nothing in this file knows what a
// Dinomech is. A second body that wanted a different warhead, a different
// speed, a different arc or six of them at once is a second `salvo` block in
// js/enemy.js and no code at all in here.
//
// WHY THIS IS NOT A `Bullet`. js/bullet.js is the PLAYER's ordnance: it is
// created by a tower, it carries that tower's damage pipeline, its pierce, its
// crit roll, its lifesteal credit and its kill attribution, and every one of
// those is meaningless coming the other way. A missile has one number on it
// and one thing it can hit. Sharing the class would have meant a `source`
// that is sometimes a tower and sometimes an enemy, threaded through eleven
// call sites that all assume the first.
//
// WHY THIS IS NOT AN `Effects` MARK EITHER, which is the more tempting
// mistake: the flight is SIMULATED, not drawn. A tower loses real hit points
// when one lands, so the arrival time is a fact about the game and not about
// the picture -- which means it has to be stepped on the same fixed step as
// everything else, from update(), and it has to freeze with the world. That is
// what makes it obey the pause button, the 1x/2x/3x toggle and the beam's
// rewind for free: none of the three is a case in here, they are all
// properties of who calls update() and how often.
//
// A MISSILE COMMITS TO A POINT, NOT TO A TOWER, and the two halves of that are
// the whole of its behaviour in flight:
//
//   IT FLIES TO WHERE THE TOWER WAS WHEN IT LAUNCHED. A tower cannot move, so
//   for every missile that arrives at a living target these are the same
//   point. They come apart only when the tower is gone -- and then the missile
//   still lands there and still throws its explosion, because ordnance in the
//   air does not know what happened on the ground. What it does NOT do is
//   pick a new victim in mid-air: a salvo that re-aimed would make "six towers
//   were chosen" a lie about the thing the player just watched being chosen.
//
//   IT DAMAGES THE TOWER ONLY IF THAT TOWER IS STILL THERE. Membership in the
//   live `towers` array is the test that covers SELLING -- sellTower splices
//   the array and leaves the object perfectly intact -- and it is the same
//   test Enemy.prototype.committedTargetValid makes for the Sapper's
//   telegraph, for the same reason.
//
// AND A MISSILE ONLY EVER TOUCHES ITS OWN TARGET. No splash, no chaining, and
// no second list to walk on arrival: the blast radius this file carries is
// drawn and is not read by anything that deals damage. That is a decision
// about the SHAPE of the weapon -- six aimed warheads, not six bombs -- and it
// is what makes "a salvo of six costs exactly six times one missile" a fact
// rather than an arithmetic that depends on how the player's towers happen to
// be spaced.
// ---------------------------------------------------------------------------

var Missiles = (function () {

  // The live list. Module state rather than a global in js/game.js, for the
  // reason the same line in js/systems/hazards.js gives: the reset rule below
  // is the whole risk here and it belongs beside the list.
  var list = [];

  // A HARD CAP, which hazards does not need and this does. A hazard is armed
  // by a death and deaths are self-limiting; a salvo is armed by a CLOCK, and
  // a body that lives long enough fires forever. Six every twelve seconds at
  // a flight measured in single seconds never comes near this -- it is here so
  // that a future spec with a stupid number in it degrades into fewer missiles
  // rather than into an array that grows for the length of the run.
  var MAX_IN_FLIGHT = 64;

  // How long a spent missile is kept for the renderers, so the streak has
  // somewhere to fade rather than vanishing on the frame it mattered. The
  // simulation reads nothing off it: `landed` is already true, so it cannot
  // hit twice however long it lingers. The same arrangement, and the same
  // number, hazards uses for its afterglow.
  var AFTERGLOW_SECONDS = 0.35;

  // Wipe the board. Called by restartGame(), which covers restarting a run,
  // changing route, choosing another map off the loss overlay and going back
  // to the main menu. A missile that survived into a new run would land on
  // towers that were built after the body that fired it was buried.
  function reset() {
    list.length = 0;
  }

  // Everything currently in the air, plus whatever is still fading. Returned
  // as the live array because the only callers are the renderers and the
  // tests, and neither writes to it.
  function active() {
    return list;
  }

  function count() {
    return list.length;
  }

  // Put one in the air.
  //
  // `from` is where it leaves the body -- {x, y, lift} in board px, the lift
  // being height above the road, which is the same shape js/effects.js's
  // particles carry and for the same reason: a launch height is a real height
  // on the 3D board and baking it into `y` would slide the missile northwards
  // across the map on the flat one.
  //
  // `spec` is the `salvo` block off the attack, read field by field so a type
  // that omits one gets a documented default rather than a NaN:
  //
  //   damage         what the tower loses when it arrives
  //   speedUlps      how fast it crosses the board, in u.l. per second
  //   apexUl         how high the arc rises over the midpoint of the flight
  //   blastRadiusUl  how wide the explosion is DRAWN. Cosmetic -- see above
  //   kind           the Effects/VisualModels id the explosion is drawn with
  //
  // Returns the missile, or null if the cap is full. Returned rather than
  // logged so a test can watch one being fired without reaching into the list.
  function launch(from, tower, spec) {
    if (!tower || !spec) return null;
    if (list.length >= MAX_IN_FLIGHT) return null;

    var dx = tower.x - from.x;
    var dy = tower.y - from.y;
    var span = Math.hypot(dx, dy);
    var speed = ul(spec.speedUlps || 300);

    var missile = {
      kind: spec.kind || "missile",
      // WHERE IT IS NOW, which is what a renderer reads.
      x: from.x, y: from.y, lift: from.lift || 0,
      // AND THE TWO ENDS OF THE FLIGHT, so `t` is the whole of the motion and
      // nothing integrates a position that could drift with the step size.
      x0: from.x, y0: from.y, lift0: from.lift || 0,
      x1: tower.x, y1: tower.y,
      // How far up the arc goes at the middle of the flight, ON TOP of the
      // straight line from the silo down to the tower. Scaled by the LENGTH of
      // the shot so a missile fired across the map lobs and one fired at the
      // tower beside it goes almost flat -- capped, so a map-wide shot does not
      // leave the sky.
      apex: Math.min(ul(spec.apexUl || 90), span * 0.45),
      span: span,
      // Seconds of flight, not pixels: `t` is advanced by dt / flight, so the
      // arrival is a simulated TIME and survives being chopped into any step
      // size. A zero-length shot (a tower standing on the body) arrives on the
      // next step rather than dividing by zero.
      flight: Math.max(1e-3, span / Math.max(1e-3, speed)),
      t: 0,
      target: tower,
      damage: spec.damage || 0,
      blastRadiusUl: spec.blastRadiusUl || 18,
      landed: false,
      // Presentation reads this to fade the streak out after the flash; the
      // simulation only ever asks whether it is > 0.
      afterglow: 0,
      // Whether the warhead actually found something. Cosmetic and diagnostic
      // -- a renderer may want a duller burst for a missile that hit bare
      // ground -- and never read back by anything that deals damage.
      hit: false
    };
    list.push(missile);
    return missile;
  }

  // Is this missile's target still worth damaging?
  //
  // Written here rather than borrowed from Enemy.prototype.committedTargetValid
  // because this file must not depend on js/enemy.js -- it is required by the
  // suites on its own, exactly as hazards.js is. The three tests are the same
  // three, and the middle one is the one that matters: membership in `towers`
  // is what covers a tower that was SOLD while the missile was in the air.
  function stillThere(tower, towers) {
    if (!tower) return false;
    if (towers.indexOf(tower) === -1) return false;
    if (tower.isDestroyed && tower.isDestroyed()) return false;
    // SUMMONS ARE NOT TARGETS, the same rule Enemy.attackCandidates states:
    // the owner's brief is that blubs cannot be attacked by enemies. A missile
    // could only have been aimed at one through a bug, and landing on it
    // anyway would turn that bug into damage.
    if (tower.isSummon && !tower.enemyTargetable) return false;
    return true;
  }

  // One step. `towers` is the live board.
  //
  // Returns the missiles that ARRIVED this step, or null. Returned so the
  // caller can hand them to Effects and to Sound without this file reaching
  // for either -- the same one-way arrangement Hazards.update has, and the
  // reason a headless suite can step a salvo with no renderer on the page.
  function update(dt, towers) {
    if (!list.length) return null;
    var fired = null;

    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.landed) {
        m.afterglow -= dt;
        continue;
      }

      m.t += dt / m.flight;
      if (m.t < 1) {
        place(m);
        continue;
      }

      // ARRIVED. Clamped rather than left past 1 so the last drawn position is
      // the impact point exactly, and latched with `landed` rather than by a
      // comparison against the clock, so a step that overshoots cannot deal
      // the damage twice.
      m.t = 1;
      place(m);
      m.landed = true;
      m.afterglow = AFTERGLOW_SECONDS;
      if (m.damage > 0 && stillThere(m.target, towers)) {
        m.target.takeDamage(m.damage);
        m.hit = true;
      }
      fired = fired ? fired.concat([m]) : [m];
    }

    // Swept after the walk rather than spliced during it -- one pass decides,
    // one pass removes, the same reasoning the enemy sweep in update() and the
    // hazard sweep both follow.
    for (var j = list.length - 1; j >= 0; j--) {
      if (list[j].landed && list[j].afterglow <= 0) list.splice(j, 1);
    }
    return fired;
  }

  // Where a missile is at its own `t`. A straight line on the ground and a
  // parabola in the air, which is the cheapest curve that leaves the silo
  // rising and arrives falling -- and arriving FALLING is the whole point of
  // having an arc at all, because a warhead that comes in flat reads as a
  // tracer going past the tower rather than into it.
  function place(m) {
    var t = m.t;
    m.x = m.x0 + (m.x1 - m.x0) * t;
    m.y = m.y0 + (m.y1 - m.y0) * t;
    // The line from the silo down to the road, plus 4 * apex * t * (1 - t):
    // zero at both ends, `apex` at the middle, and the 4 is what makes the
    // peak exactly `apex` rather than a quarter of it.
    m.lift = m.lift0 * (1 - t) + m.apex * 4 * t * (1 - t);
  }

  return {
    reset: reset,
    active: active,
    count: count,
    launch: launch,
    update: update,
    MAX_IN_FLIGHT: MAX_IN_FLIGHT,
    AFTERGLOW_SECONDS: AFTERGLOW_SECONDS
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Missiles;
}
