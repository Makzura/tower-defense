// ---------------------------------------------------------------------------
// ConfiguredTower
//
// The generic runtime for ANY tower built from a config shaped like
// js/towers/long-range-dps.config.js. This is the piece the spec calls "the
// template every tower that follows" reuses -- it drives StatResolver,
// Crosspath, Targeting, DamagePipeline, TimedStackTracker, ReloadTracker and
// ActiveAbility purely by reading `config.paths`/`config.mechanics` and the
// resolved `stats.flags`. Nothing in this file hardcodes a stat name, a path
// name, or a flag name specific to the long-range DPS tower -- a second
// tower config with a completely different set of flags (say, an AoE tower
// that never grants "reload" or "killStackAttackSpeed") just skips those
// branches automatically, because they are all `if (stats.flags.x)` checks
// against whatever the config actually granted.
//
// Per AGENTS.md's house rule for this codebase: update(dt) stays free of DOM
// access. Anything that touches the page (buttons, panels) lives in the
// scene script, not here.
// ---------------------------------------------------------------------------

function ConfiguredTower(config, x, y) {
  this.config = config;
  this.x = x;
  this.y = y;

  this.purchased = {};
  Object.keys(config.paths).forEach(function (pathName) {
    this.purchased[pathName] = 0;
  }, this);

  // TODO(section 7 / 5.6): default cone direction on placement is
  // undefined by the spec. Placeholder: aimed along +x (angle 0).
  this.aimRad = 0;
  this.reaimCooldownTimer = 0;

  this.stunTimer = 0;
  this.fireCooldown = 0;
  this.maxHp = null;   // set by _refreshStats on first resolve
  this.currentHp = null;

  this._refreshStats();

  // These two are only built if the config actually declares them. Not every
  // tower has kill stacks or a reload -- the beam tower has neither -- and a
  // runtime that insists on them would refuse to load any config but the
  // first one written. A tower whose config omits a mechanic simply never
  // reaches the branches that use it, because those are all guarded on the
  // matching flag.
  var stacks = this.stats.mechanics.killStackAttackSpeed;
  this.killStacks = stacks
    ? new TimedStackTracker(stacks.maxStacks, stacks.stackDurationSeconds)
    : null;

  var reload = this.stats.mechanics.reload;
  this.reload = reload
    ? new ReloadTracker(reload.shotsBeforeReload, reload.reloadDurationSeconds)
    : null;
}

// Recomputes `this.stats` from scratch (base + every purchased tier's
// deltas/flags/setParams) via StatResolver -- see that file for why this
// makes crosspathing automatic. HP upgrades add to current HP the same way
// they add to max HP, except a permanent loss from the active ability
// (which mutates maxHp directly, outside this recompute) is never un-done
// by it.
ConfiguredTower.prototype._refreshStats = function () {
  var previousMaxHp = this.maxHp;
  var resolved = StatResolver.resolve(this.config, this.purchased);
  this.stats = resolved;

  if (this.maxHp === null) {
    this.maxHp = resolved.hp;
    this.currentHp = resolved.hp;
  } else {
    var delta = resolved.hp - previousMaxHp;
    this.maxHp = resolved.hp;
    this.currentHp = Math.min(this.currentHp + delta, this.maxHp);
  }
};

// Attempts to buy the next tier on `pathName`. Delegates the crosspath rule
// entirely to Crosspath.canPurchaseNext -- this function does not re-check
// or duplicate that rule.
ConfiguredTower.prototype.purchase = function (pathName) {
  var check = Crosspath.canPurchaseNext(this.purchased, pathName, this.config);
  if (!check.ok) return check;

  this.purchased[pathName] = check.resultingTier;
  this._refreshStats();
  return { ok: true };
};

// What the next tier on `pathName` would change, MEASURED rather than read
// off the table: the config is resolved twice, once as it stands and once
// with the extra tier, and the two stat blocks are diffed.
//
// That is what makes the preview honest about crosspathing. A tier's printed
// "+100 range" is the gain on THIS tower with everything it already owns, not
// the number in the config -- and for a stat a flag overrides outright (cone
// shape, infinite pierce, deadzone removal) the table has no number to read
// in the first place.
//
// Returns null when the path is finished. Pure data, no DOM -- the panel
// turns this into a hover card, this file never draws anything.
ConfiguredTower.prototype.previewNextTier = function (pathName) {
  var tiers = this.config.paths[pathName];
  var owned = this.purchased[pathName] || 0;
  var next = tiers && tiers[owned];
  if (!next) return null;

  var proposed = {};
  Object.keys(this.purchased).forEach(function (key) {
    proposed[key] = this.purchased[key];
  }, this);
  proposed[pathName] = owned + 1;

  var after = StatResolver.resolve(this.config, proposed);

  // Every flag this tier switches on, under all three spellings a config may
  // use -- see UpgradeEffects.grantsOf and StatResolver, which reads the same
  // three.
  var granted = UpgradeEffects.grantsOf(next);

  return {
    tier: next,
    cost: next.cost,
    changes: UpgradeEffects.statChanges(this.stats, after),
    abilities: UpgradeEffects.abilities(granted, after.mechanics),
    // Reaching the lock threshold is the one consequence a price cannot show.
    locks: (owned + 1) === this.config.crosspath.lockThreshold
  };
};

ConfiguredTower.prototype.effectiveFireRate = function () {
  var base = this.stats.fireRate;
  if (!this.stats.flags.killStackAttackSpeed) return base;
  var perStack = this.stats.mechanics.killStackAttackSpeed.perStackBonus;
  return base * (1 + perStack * (this.killStacks ? this.killStacks.count() : 0));
};

ConfiguredTower.prototype.canFire = function () {
  if (this.stunTimer > 0) return false;
  if (this.stats.flags.reload && this.reload && !this.reload.canFire()) return false;
  return this.fireCooldown <= 0;
};

// Pure simulation tick -- no DOM, per AGENTS.md.
ConfiguredTower.prototype.update = function (dt) {
  if (this.stunTimer > 0) this.stunTimer = Math.max(0, this.stunTimer - dt);
  if (this.fireCooldown > 0) this.fireCooldown -= dt;
  if (this.reaimCooldownTimer > 0) {
    this.reaimCooldownTimer = Math.max(0, this.reaimCooldownTimer - dt);
  }

  if (this.killStacks) this.killStacks.update(dt);
  if (this.stats.flags.reload && this.reload) this.reload.update(dt);
};

ConfiguredTower.prototype.getValidTargets = function (enemies) {
  return RangeFilter.getValidTargets(
    this.stats, { x: this.x, y: this.y }, this.aimRad, enemies
  );
};

// Cone re-aim, gated on its own 10s cooldown (spec 5.6). Direction is in
// radians; callers translate mouse/enemy position to an angle.
ConfiguredTower.prototype.reaim = function (newAimRad) {
  if (this.stats.targetShape !== "cone") {
    return { ok: false, reason: "not in cone mode" };
  }
  if (this.reaimCooldownTimer > 0) {
    return { ok: false, reason: "re-aim on cooldown", remaining: this.reaimCooldownTimer };
  }
  this.aimRad = newAimRad;
  this.reaimCooldownTimer = this.stats.mechanics.cone.reaimCooldownSeconds;
  return { ok: true };
};

// Resolves ONE shot against a target with the given hpFraction (target's
// current/max HP, in [0,1]), rolling crit via `rng` (defaults to
// Math.random so tests can inject a deterministic one). Returns the ordered
// per-enemy pierce sequence (see js/systems/pierce.js) and records the shot
// against the reload tracker.
ConfiguredTower.prototype.fire = function (targetHpFraction, rng) {
  rng = rng || Math.random;

  var guaranteedShot = this.stats.flags.guaranteedReloadShotCrit &&
    this.stats.flags.reload &&
    this.reload.nextShotIsFinalBeforeReload();

  var crit = guaranteedShot || (rng() < this.stats.critChance / 100);
  var executeBonus = Execute.resolveExecuteBonus(this.stats, targetHpFraction, guaranteedShot);

  var hasFalloff = !!this.stats.flags.pierceFalloff;
  var sequence = DamagePipeline.resolveShot({
    damage: this.stats.damage,
    crit: crit,
    critDamagePercent: this.stats.critDamage,
    executeBonus: executeBonus,
    pierceCap: this.stats.pierce,
    hasFalloff: hasFalloff,
    pierceParams: this.stats.mechanics.pierceFalloff
  });

  if (this.stats.flags.reload) this.reload.recordShot();
  this.fireCooldown = 1 / this.effectiveFireRate();

  return { crit: crit, executeBonus: executeBonus, sequence: sequence };
};

// Called by the caller's kill-tracking (this file does not itself know when
// an enemy dies -- that is game/scene-specific bookkeeping).
ConfiguredTower.prototype.onKill = function () {
  if (this.stats.flags.killStackAttackSpeed && this.killStacks) this.killStacks.addStack();
};

// B5 active ability. `enemies`: array of { x, y, hp }.
ConfiguredTower.prototype.triggerActiveAbility = function (enemies) {
  if (!this.stats.flags.activeAbility) {
    return { ok: false, reason: "ability not unlocked" };
  }
  if (this.stunTimer > 0) {
    return { ok: false, reason: "tower is stunned" };
  }

  var params = this.stats.mechanics.activeAbility;
  var towerHpState = { currentHp: this.currentHp, maxHp: this.maxHp, stunTimer: this.stunTimer };
  var result = ActiveAbility.trigger(towerHpState, enemies, params);
  if (!result.ok) return result;

  this.currentHp = towerHpState.currentHp;
  this.maxHp = towerHpState.maxHp;
  this.stunTimer = towerHpState.stunTimer;

  return result;
};

if (typeof module !== "undefined" && module.exports) {
  var StatResolver = require("../systems/stat-resolver.js");
  var Crosspath = require("../systems/crosspath.js");
  var RangeFilter = require("../systems/range-filter.js");
  var DamagePipeline = require("../systems/damage-pipeline.js");
  var Execute = require("../systems/execute.js");
  var TimedStackTracker = require("../systems/buff-stacks.js");
  var ReloadTracker = require("../systems/reload.js");
  var ActiveAbility = require("../systems/active-ability.js");
  var UpgradeEffects = require("../systems/upgrade-effects.js");
  module.exports = ConfiguredTower;
}
