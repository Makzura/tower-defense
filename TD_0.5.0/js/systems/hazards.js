// ---------------------------------------------------------------------------
// Hazards -- things a DEATH leaves on the board, on a fuse.
//
// Added 2026-08-27 with the Volatile, and written as a generic structure
// rather than as that enemy's mechanic, for the same reason `attack`, `shield`,
// `revive`, `spawns`, `support` and `phases` are generic on the enemy side:
// nothing in this file knows what a Volatile is, and a second type that wanted
// a different fuse, radius, damage or kind is a second `deathEffect` block in
// js/enemy.js and no code at all in here.
//
// THE ONE THING TO UNDERSTAND: A HAZARD IS NOT AN ENEMY.
//
// It has no health, no path, no lane, no bounty and no wave. It is not in
// `enemies`, so it cannot hold a wave open (gate 1 asks about bodies carrying
// that wave's number), cannot hold the victory screen away
// (`enemies.length === 0`), cannot be targeted, claimed, slowed or counted, and
// pays nothing -- the bounty, the score, the kill credit, the death burst and
// the death sound all happened once already, at the combat death that made it.
// Putting it in `enemies` with 0 HP would have been a shorter diff and every
// one of those properties would have had to be fought for.
//
// AND A HAZARD ONLY EVER TOUCHES TOWERS. That is a decision about the SHAPE of
// the effect, and it is what makes "a Volatile explosion never triggers another
// Volatile explosion" a fact rather than a special case somebody remembered to
// write: a detonation cannot damage an enemy, so it cannot kill one, so it can
// never produce a second hazard. There is no chain to guard against, at any
// density, and no recursion depth to bound.
//
// IT IS SIMULATION, NOT PRESENTATION. Unlike js/effects.js this list IS read
// back -- towers lose real hit points to it -- so it lives in js/systems/ and
// is stepped from update() on the same fixed step as everything else. That is
// what makes it obey the pause menu, the 1x/2x/3x speed toggle and the beam's
// rewind for free: none of them is a case in here, they are all properties of
// who calls update() and how often.
// ---------------------------------------------------------------------------

var Hazards = (function () {

  // The live list. Module state rather than a global in js/game.js because the
  // reset rule below is the whole risk here and it belongs beside the list.
  var list = [];

  // How long a spent hazard is kept for the renderers. Simulation reads
  // nothing off it -- `detonated` is already true, so it cannot fire twice
  // however long it lingers.
  var AFTERGLOW_SECONDS = 0.35;

  // Wipe the board. Called by restartGame(), which covers restarting a run,
  // changing route, choosing another map off the loss overlay and going back to
  // the main menu -- every one of those goes through it. A pending fuse that
  // survived into a new run would detonate under towers that were placed after
  // the body that armed it died, which is exactly the class of bug a global
  // one-shot list invites.
  function reset() {
    list.length = 0;
  }

  // Everything currently ticking. Returned as the live array because the only
  // callers are the renderers and the tests, and neither writes to it.
  function active() {
    return list;
  }

  function count() {
    return list.length;
  }

  // Arm a hazard from the body that just died, if its type declares one.
  //
  // CALLED ONLY FROM THE `dead` BRANCH of update()'s end-of-life sweep, which
  // is the one place in this game an enemy's fate is decided exactly once. Two
  // consequences follow from that placement and neither is an accident:
  //
  //   A LEAK LEAVES NOTHING. `leaked` is the other branch. A body that walks
  //   into the base costs its remaining health and no more.
  //   A REVIVE LEAVES NOTHING YET. `dead` is only set once tryRevive() has
  //   refused, so a type carrying both `revive` and `deathEffect` would arm on
  //   its FINAL combat death and not on the temporary one.
  //
  // Returns the hazard, or null. Returned rather than logged so a test can
  // watch one being armed without reaching into the list.
  function fromDeath(enemy) {
    var effect = enemy && enemy.type && enemy.type.deathEffect;
    var spec = effect && effect.hazard;
    if (!spec) return null;

    // THE EXACT DEATH POSITION, copied rather than referenced. `enemy.pos` is
    // replaced wholesale by positionAt() every step, so holding the object
    // would be holding a point that is about to belong to somebody else -- and
    // the body is swept out of `enemies` at the end of this same step anyway.
    var hazard = {
      kind: spec.kind || "hazard",
      x: enemy.pos.x,
      y: enemy.pos.y,
      fuse: spec.fuseSeconds,
      fuseTotal: spec.fuseSeconds,
      radiusUl: spec.radiusUl,
      towerDamage: spec.towerDamage || 0,
      // Presentation reads this to fade the mark out after the flash; the
      // simulation only ever asks whether it is > 0.
      afterglow: 0,
      detonated: false,
      // Which body armed it. Cosmetic and diagnostic only -- nothing in here
      // reads it back, and it deliberately does NOT carry a waveId, because a
      // hazard belongs to no wave (see the header).
      sourceTypeId: enemy.typeId
    };
    list.push(hazard);
    return hazard;
  }

  // One step. `towers` is the live board.
  //
  // The fuse is simulated time, so it survives being chopped up by any step
  // size and freezes with the world. A hazard whose fuse crosses zero this step
  // detonates ONCE -- `detonated` is a latch, not a comparison against the
  // clock -- and is then held for a short afterglow so the mark can fade rather
  // than vanishing on the frame it mattered.
  //
  // Returns the hazards that went off this step, or null. Returned so the
  // caller can hand them to Effects and to Sound without this file reaching for
  // either: the same one-way arrangement Enemy.spawnMinions has with the brood
  // it makes.
  function update(dt, towers) {
    if (!list.length) return null;
    var fired = null;

    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (h.detonated) {
        h.afterglow -= dt;
        continue;
      }
      h.fuse -= dt;
      if (h.fuse > 0) continue;

      h.fuse = 0;
      h.detonated = true;
      h.afterglow = AFTERGLOW_SECONDS;
      h.hits = detonate(h, towers);
      fired = fired ? fired.concat([h]) : [h];
    }

    // Swept after the walk rather than spliced during it, the same reasoning
    // the enemy sweep in update() follows: one pass decides, one pass removes.
    for (var j = list.length - 1; j >= 0; j--) {
      if (list[j].detonated && list[j].afterglow <= 0) list.splice(j, 1);
    }
    return fired;
  }

  // Everything the blast reaches, hurt exactly once.
  //
  // LIVING TOWERS ONLY, and the destroyed check is not politeness: a tower at
  // zero hit points is a corpse waiting for the sweep at the top of the next
  // update(), and hitting it again would be the same wasted work a bullet
  // landing on a dead enemy is.
  //
  // SUMMONS ARE INCLUDED, which is the opposite of the rule an enemy ATTACK
  // follows. `Enemy.attackCandidates` excludes blubs because the owner's brief
  // says they cannot be targeted -- but a hazard targets nothing; it is a
  // radius, and a blub standing inside it is standing inside it. That is the
  // same reading the Tyrant's landing shockwave already takes for its stun.
  //
  // NO STUN. The Volatile's brief is flat about it, and the way that is
  // honoured here is by there being no stun field at all to read: a hazard
  // carries `towerDamage` and nothing else that touches a tower.
  function detonate(hazard, towers) {
    var reach = ul(hazard.radiusUl);
    var hits = [];
    if (!(hazard.towerDamage > 0)) return hits;

    for (var i = 0; i < towers.length; i++) {
      var t = towers[i];
      if (t.isDestroyed && t.isDestroyed()) continue;
      var dx = t.x - hazard.x;
      var dy = t.y - hazard.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      t.takeDamage(hazard.towerDamage);
      hits.push(t);
    }
    return hits;
  }

  return {
    reset: reset,
    active: active,
    count: count,
    fromDeath: fromDeath,
    update: update,
    AFTERGLOW_SECONDS: AFTERGLOW_SECONDS
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Hazards;
}
