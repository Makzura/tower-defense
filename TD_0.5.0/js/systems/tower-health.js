// ---------------------------------------------------------------------------
// TowerHealth -- towers have hit points, and at zero they are destroyed.
//
// This answers a question AGENTS.md carried as an open placeholder from the
// Longshot spec since 2026-07-26: "what tower HP actually does (damageable by
// what, dies at zero?)". The owner answered it on 2026-07-29 -- an enemy that
// attacks towers, and towers that die at 0 HP -- so the field stops being
// decoration and becomes a real resource.
//
// WHY A SHARED MODULE rather than a field on each tower. Before this, exactly
// two of the four towers had HP at all (the config-driven ones, through
// ConfiguredTower), and their `maxHp` could reach zero with nothing watching.
// The Longshot's B5 burns 300 permanent max HP per use and its owner expected
// that to kill the tower after five presses; instead it sat at 0/0 and kept
// firing. Putting the rule in one place is what stops the next tower type
// forgetting it -- the same reasoning as js/systems/tower-stats.js for the
// numbers a tower reports, and js/systems/mitigation.js for the damage an
// enemy takes.
//
// The contract, which every tower type now honours:
//
//   tower.maxHp        > 0
//   tower.currentHp    0 .. maxHp
//   tower.takeDamage(n)   returns the damage actually absorbed
//   tower.isDestroyed()   currentHp <= 0 OR maxHp <= 0
//
// `maxHp <= 0` is part of the death test on purpose. A tower whose MAXIMUM
// has been burned to nothing is destroyed even though "current <= max" is
// still technically satisfied at 0/0 -- that 0/0 state is precisely the bug
// this module exists to close.
// ---------------------------------------------------------------------------

var TowerHealth = (function () {

  // Give a tower its health fields. Called from a constructor; safe to call
  // on a tower whose HP came from somewhere else (the config-driven towers
  // resolve theirs from the stat table) by passing that value straight in.
  function init(tower, maxHp) {
    tower.maxHp = maxHp;
    tower.currentHp = maxHp;
  }

  // Make `tower.maxHp` / `tower.currentHp` / `tower.stunTimer` read and write
  // THROUGH to another object's fields. The two config-driven towers
  // (Longshot, Siphon) are thin adapters over a ConfiguredTower `core`, and
  // that core is where their HP and stun genuinely live: its stat resolver
  // sets HP on every upgrade, and the Longshot's B5 burns max HP and starts
  // its self-stun directly on it.
  //
  // Forwarding rather than copying is the point. A mirrored COPY would need
  // re-syncing after every purchase and every ability use, and the one place
  // somebody forgot would be a tower with two different HP values -- exactly
  // the class of bug this module was written to end. With a property there is
  // still only one number.
  function mirror(tower, source) {
    ["maxHp", "currentHp", "stunTimer"].forEach(function (field) {
      Object.defineProperty(tower, field, {
        get: function () { return source[field]; },
        set: function (value) { source[field] = value; },
        enumerable: true,
        configurable: true
      });
    });
  }

  function isDestroyed(tower) {
    return tower.maxHp <= 0 || tower.currentHp <= 0;
  }

  // Returns the damage ACTUALLY absorbed, the same contract
  // Enemy.takeDamage has: overkill on a tower with 3 HP left reports 3, not
  // the 20 that was swung. Nothing pays cash for damaging a tower, but the
  // symmetry means a future "repair for what it lost" reads the same number.
  //
  // Towers have NO mitigation. Armor and defense are enemy stats; running
  // tower damage through Mitigation would silently give every tower a 0%
  // resistance that somebody would later be tempted to make non-zero, and
  // nothing has asked for that.
  function damage(tower, amount) {
    if (amount <= 0 || isDestroyed(tower)) return 0;
    var absorbed = Math.min(amount, tower.currentHp);
    tower.currentHp -= amount;
    if (tower.currentHp < 0) tower.currentHp = 0;
    return absorbed;
  }

  // --- stun (v0.4.7) -------------------------------------------------------
  //
  // A stunned tower does nothing at all: no firing, and no cooldown ticking
  // either, so a 2 s stun really costs two seconds of output rather than being
  // partly absorbed by a cooldown that kept running underneath it.
  //
  // It lives HERE, beside tower HP, because it is the same kind of thing --
  // per-tower state that every type must honour and no type should have to
  // implement. The enforcement is one `continue` in the main loop (see
  // js/game.js), which is the single point all four tower types come through.
  // A per-type implementation would be four chances to forget, and the fifth
  // tower type would make it five.
  //
  // Plain tower constructors need not initialise `stunTimer`: `undefined > 0`
  // is false, so they fail safe to un-stunned. Config-driven towers already
  // keep a zero-valued timer on their core; `mirror()` forwards the adapter's
  // timer to that same field so self-stuns and enemy stuns cannot diverge.
  //
  // LONGEST STUN WINS and a shorter one cannot cut a longer one short. Same
  // rule as Enemy.applySlow, for the same reason: two sources landing in the
  // same second must not be able to make the effect weaker than one of them.
  // `stunImmune` is checked HERE rather than at each of the places that stun,
  // for exactly the reason the rest of this module exists: the boss's aimed
  // shot, its landing shockwave and the summoner's own monster leap all reach
  // for TowerHealth.stun, and an immunity implemented at the call sites would
  // be three chances to forget it. Only one thing sets the flag today -- a tier
  // 4 monster blub, which the owner's brief makes "totalement immunise aux
  // etourdissements" -- and a tower that never sets it behaves exactly as it
  // did before the flag existed.
  function stun(tower, seconds) {
    if (!(seconds > 0)) return;
    if (tower.stunImmune) return;
    if (!(tower.stunTimer > 0) || seconds > tower.stunTimer) {
      tower.stunTimer = seconds;
    }
  }

  function isStunned(tower) {
    return tower.stunTimer > 0;
  }

  // Advance the timer and report whether the tower is STILL stunned this step.
  // The caller skips the tower's update when this is true.
  function tickStun(tower, dt) {
    if (!(tower.stunTimer > 0)) return false;
    tower.stunTimer -= dt;
    if (tower.stunTimer <= 0) {
      tower.stunTimer = 0;
      return false;                 // the step it wears off, it acts
    }
    return true;
  }

  // The panel/codex row. Kept here rather than in tower-stats.js because it
  // is the only stat row that can read as an ALERT -- see drawInspection.
  function label(tower) {
    return Math.max(0, Math.round(tower.currentHp)) + " / " + Math.round(tower.maxHp);
  }

  // 0..1, for the little bar drawn over a hurt tower. Guarded against the
  // 0/0 case, which is a destroyed tower mid-sweep.
  function fraction(tower) {
    if (!tower.maxHp) return 0;
    return Math.max(0, Math.min(1, tower.currentHp / tower.maxHp));
  }

  return {
    init: init,
    mirror: mirror,
    damage: damage,
    isDestroyed: isDestroyed,
    stun: stun,
    isStunned: isStunned,
    tickStun: tickStun,
    label: label,
    fraction: fraction
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = TowerHealth;
}
