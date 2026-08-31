// ---------------------------------------------------------------------------
// Targeting
//
// Which enemy a tower picks out of the ones it can reach. Shared by every
// tower type so a new one gets all the modes for free and none of them can
// drift apart.
//
// Must load before tower.js and smasher.js.
//
// NAMING: this module answers "WHICH enemy do I shoot" -- the targeting mode.
// The separate question "is this enemy within my reach at all" (range,
// deadzone, cone arc, camo/flying visibility) belongs to
// js/systems/range-filter.js, which config-driven towers use. Two different
// jobs that both wanted the name `Targeting`; this one kept it because
// picking a target is what the word usually means.
// ---------------------------------------------------------------------------

// Per-tower lifetime scorekeeping, shared so both types count the same way.
//
// Damage counted is the damage ACTUALLY landed -- Enemy.lastDamageTaken --
// not the damage swung for. That includes shields, restored health and unpaid
// Hive brood, while overkill is still excluded. Enemy.takeDamage() keeps its
// narrower return value for Siphon charge/lifesteal economy mechanics.
var TowerScore = {

  init: function (tower) {
    tower.damageDealt = 0;
    tower.kills = 0;
  },

  // Apply damage to an enemy and credit it to the tower that caused it.
  // Returns the damage landed for callers with damage-led mechanics.
  //
  // `defPierce` is passed straight through to Enemy.takeDamage for the towers
  // that ignore a FRACTION of an enemy's defense (the Siphon's A1), and
  // `defenseFlatPierce` for the one that ignores a flat slice of it in
  // percentage points (the Rifleman's B4). They are
  // arguments rather than second entry points so that EVERY damage source can
  // be credited the same way -- the beam used to call takeDamage itself purely
  // because it needed that argument, and so counted no kills at all.
  // `damageKind` is currently `"aoe"` only for Warbringer area damage and the
  // Arcane Sniper B5 blast. Piercing line shots intentionally leave it unset.
  // `armorPierce` is FLAT ARMOR points, and is the one channel of the three
  // that touches `armor` rather than `defense` -- the Rifleman's Piercing
  // Orders permanent upgrade is its only source today.
  apply: function (tower, enemy, amount, defPierce, defenseFlatPierce, damageKind,
                   armorPierce) {
    var wasDead = enemy.dead;
    var dealt = enemy.takeDamage(amount, defPierce, defenseFlatPierce, damageKind,
      armorPierce);
    var scored = enemy.lastDamageTaken;

    if (tower) {
      tower.damageDealt += scored;
      if (!wasDead && enemy.dead) tower.kills++;
    }
    return dealt;
  }
};


var Targeting = {

  // Cycle order for the panel button. "nearest" exists because the Smasher was
  // specified to face the closest enemy; it is the only mode that depends on
  // where the tower stands rather than on the enemy alone.
  MODES: ["first", "last", "weakest", "strongest", "fastest", "nearest"],

  LABELS: {
    first: "first",
    last: "last",
    weakest: "weakest",
    strongest: "strongest",
    fastest: "fastest",
    nearest: "nearest"
  },

  // One sentence per mode, for the hover card on the cycle button. A label of
  // one word cannot say whether "first" means the enemy that arrived first or
  // the one nearest the base -- and it is the second one.
  DESCRIPTIONS: {
    first: "The enemy furthest along the road: the one about to reach your base.",
    last: "The enemy least far along: the one that just walked in.",
    weakest: "The enemy with the least health left. Finishes off the wounded.",
    strongest: "The enemy with the most health left. Chips at the tanks.",
    fastest: "The enemy moving quickest right now, slows included.",
    nearest: "Whichever enemy in range is physically closest to this tower."
  },

  // Can this tower target that enemy AT ALL, before any question of which one
  // it prefers? Camo is a VISIBILITY rule, not a scoring one: an undetected
  // camo enemy is not a worse target, it is not a target.
  //
  // It lives here because pick() and comparator() are the two doors the gunner
  // and the Smasher come through, so neither can forget it. The config-driven
  // towers (Longshot, beam) do not use this -- they ask
  // RangeFilter.canTarget, which has enforced the identical rule against
  // `stats.seesCamo` since v0.3.5. Two implementations of one rule is a
  // smell, but merging them would mean teaching RangeFilter about the
  // gunner's flat fields, and the rule is one line on each side.
  //
  // A tower with no `seesCamo` at all sees no camo, so a future tower type
  // that forgets the field fails safe rather than quietly ignoring camo.
  sees: function (tower, enemy) {
    if (enemy.isFlying && !tower.seesFlying) return false;
    return !enemy.isCamo || !!tower.seesCamo;
  },

  next: function (mode) {
    var i = Targeting.MODES.indexOf(mode);
    return Targeting.MODES[(i + 1) % Targeting.MODES.length];
  },

  isMode: function (mode) {
    return Targeting.MODES.indexOf(mode) !== -1;
  },

  // Every mode is expressed as "bigger score wins", so one loop serves all of
  // them and adding a mode is one case here plus one entry in MODES.
  //
  // "fastest" reads the enemy's CURRENT speed, so a slowed enemy really is
  // slower. With a single enemy type that is the only thing that makes this
  // mode differ from the others at all.
  //
  // weakest/strongest and fastest both go through an Enemy method rather than
  // reading fields, because since v0.4.7 neither quantity is one field:
  // remainingHealth() counts a shield as the health it is (a full-shielded
  // Bulwark is the strongest thing on the road, not a 12 HP walker), and
  // currentSpeedUlps() folds in the permanent changes a run makes -- a broken
  // shield doubling it, a revive stopping it dead.
  score: function (mode, enemy, distanceSquared) {
    switch (mode) {
      case "last":      return -enemy.progress;
      case "weakest":   return -enemy.remainingHealth();
      case "strongest": return enemy.remainingHealth();
      case "fastest":   return enemy.currentSpeedUlps();
      case "nearest":   return -distanceSquared;
      default:          return enemy.progress;      // "first"
    }
  },

  // The enemy a tower at (tower.x, tower.y) should aim at, or null.
  //
  // `skipClaimed` is the target-claiming rule: a gunner passes true so it will
  // not put a bullet into an enemy that bullets already in flight will kill.
  // The Smasher passes false -- its damage is instant and hits everything in
  // the zone, so it has no shot to waste (see the Smasher section in CLAUDE.md).
  //
  // Ties break towards the enemy furthest along the path, i.e. towards "first".
  // Without that, identical enemies -- which is all of them right now -- would
  // make weakest/strongest/fastest depend on array order, and the tower would
  // jitter between targets from frame to frame.
  // Is the straight line from this tower to this enemy clear of terrain?
  //
  // Delegated to RangeFilter, which is where the active map's predicate is
  // installed -- one hook for the whole game rather than two that can disagree.
  // True on every board with no terrain, at the cost of a null check.
  hasSightTo: function (tower, enemy) {
    if (typeof RangeFilter === "undefined" || !RangeFilter.sightClear) return true;
    return RangeFilter.sightClear(tower, enemy.pos || enemy);
  },

  pick: function (tower, enemies, skipClaimed) {
    var mode = tower.targeting;
    var best = null;
    var bestScore = -Infinity;
    var bestProgress = -Infinity;
    var rangeSquared = tower.rangePx * tower.rangePx;

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead || e.leaked) continue;
      if (!Targeting.sees(tower, e)) continue;
      if (skipClaimed && e.unclaimedHealth() <= 0) continue;

      var dx = e.pos.x - tower.x;
      var dy = e.pos.y - tower.y;
      var distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > rangeSquared) continue;
      // COVER, LAST. Every cheap test above has already thrown most candidates
      // away, and this is the only one that walks a shape list -- so it runs on
      // the handful that are actually in reach and visible, never on the board.
      //
      // Here rather than in each tower: the Rifleman, the Summoner's creatures
      // and every recruit come through this one picker, so they all learn about
      // rocks at once and cannot drift apart. The config-driven towers ask
      // RangeFilter, which carries the same predicate.
      if (!Targeting.hasSightTo(tower, e)) continue;

      var s = Targeting.score(mode, e, distanceSquared);
      if (s > bestScore || (s === bestScore && e.progress > bestProgress)) {
        bestScore = s;
        bestProgress = e.progress;
        best = e;
      }
    }
    return best;
  },

  // Best target first, for a list of enemies ALREADY known to be reachable.
  //
  // Some towers do not pick one enemy, they order several: a piercing shot
  // walks the line it was fired along front to back, and a beam fills two,
  // six or forty locks at once. Those used to sort by path progress with the
  // rule written out inline, which meant they silently ignored the targeting
  // mode the player had chosen -- the Longshot and the beam were stuck on
  // "first" while the gunner and the smasher had all six.
  //
  // Same scoring function and the same furthest-along tie-break as pick(), so
  // "strongest" means exactly the same thing to a beam as to a gunner. pick()
  // keeps its own linear scan rather than sorting: it runs for every tower
  // every frame and only ever wants the maximum.
  comparator: function (tower) {
    var mode = tower.targeting;
    return function (a, b) {
      var adx = a.pos.x - tower.x;
      var ady = a.pos.y - tower.y;
      var bdx = b.pos.x - tower.x;
      var bdy = b.pos.y - tower.y;

      var sa = Targeting.score(mode, a, adx * adx + ady * ady);
      var sb = Targeting.score(mode, b, bdx * bdx + bdy * bdy);
      if (sa !== sb) return sb - sa;
      return b.progress - a.progress;
    };
  }
};
