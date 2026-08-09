// ---------------------------------------------------------------------------
// ActiveAbility (spec 5.5, B5)
//
// Manually triggered. Deals config-defined damage in an AoE around "the
// strongest enemy currently on screen", then stuns the tower and burns
// permanent max HP.
//
// TWO things are explicitly undefined by the spec and are NOT invented here:
//   - what "strongest" means (highest max HP vs current HP vs bounty)
//   - the ability's cooldown
// selectStrongestEnemy() below implements a clearly-flagged PLACEHOLDER
// heuristic (highest current HP) so the ability is exercisable in the debug
// scene and tests; swap it the moment the design question is answered.
// Cooldown is read from config (mechanics.activeAbility.cooldownSeconds),
// which is `null` -- callers must treat null as "not yet enforceable" rather
// than inventing a number.
// ---------------------------------------------------------------------------

var ActiveAbility = (function () {

  // PLACEHOLDER -- see file header. Picks the enemy with the highest
  // CURRENT hp among candidates. Ties broken by first-found.
  function selectStrongestEnemy(enemies) {
    var best = null;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!best || e.hp > best.hp) best = e;
    }
    return best;
  }

  // Returns which enemies (from `enemies`) fall inside the AoE centred on
  // `target`, and the flat damage each takes (spec: ignores all defense /
  // armor / resistance -- so this is a flat number, not run through
  // DamagePipeline).
  function resolveAoeHits(target, enemies, params) {
    var hits = [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var dx = e.x - target.x;
      var dy = e.y - target.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= params.aoeRadius) {
        hits.push({ enemy: e, damage: params.damage });
      }
    }
    return hits;
  }

  // tower: needs { currentHp, maxHp, stunSeconds (setter via callback) } --
  // kept as plain fields the caller (ConfiguredTower) owns; this function
  // just computes the new numbers so it stays testable without a full
  // tower object.
  function applyCost(tower, params) {
    tower.maxHp = Math.max(0, tower.maxHp - params.maxHpLoss);
    tower.currentHp = Math.min(tower.currentHp, tower.maxHp);
    tower.stunTimer = params.stunSeconds;
  }

  // Full trigger: validates a target exists, computes AoE hits, applies the
  // stun + permanent HP loss. Does not touch a cooldown timer itself --
  // config.mechanics.activeAbility.cooldownSeconds is null (TODO, section 7),
  // so ConfiguredTower currently gates re-use on the stun timer only and
  // flags this clearly rather than inventing a cooldown.
  function trigger(tower, enemies, params) {
    var target = selectStrongestEnemy(enemies);
    if (!target) return { ok: false, reason: "no enemy on screen" };

    var hits = resolveAoeHits(target, enemies, params);
    applyCost(tower, params);

    return { ok: true, target: target, hits: hits };
  }

  return {
    selectStrongestEnemy: selectStrongestEnemy,
    resolveAoeHits: resolveAoeHits,
    applyCost: applyCost,
    trigger: trigger
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = ActiveAbility;
}
