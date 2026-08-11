// ---------------------------------------------------------------------------
// BeamTower -- tower_beam, wearing the game's tower interface.
//
// A CONTINUOUS weapon: no projectile, no cooldown, no reload, no attack
// animation to wait on. It holds a lock on up to `maxTargets` enemies and
// applies damage to each on a tick at `attackRate` Hz, so its DPS per target
// is simply ad x attackRate. One visual beam is drawn per locked target.
//
// Everything the tiers switch on is a keyed module resolved from config (see
// js/towers/beam.config.js): the ramp, the charge meter, gold-to-power, HP
// scaling, the slow, lifesteal, death denial. This file wires them to the
// game; it does not define any of their numbers.
//
// Damage pipeline, exactly as specified, per tick and per target:
//
//     dmg  = ad                     total AD, including A5's gold bonus
//     dmg *= rampMult(target)       A1, multiplicative
//     dmg *= hpScale(target)        A4, multiplicative
//     dmg  = mitigate(dmg, target)  armor THEN defense -- always last
//
// The multipliers commute, so their order does not matter; mitigation being
// last does. It happens inside Enemy.takeDamage, which is the single door all
// damage in the game goes through.
// ---------------------------------------------------------------------------

function BeamTower(x, y, path) {
  this.x = x;
  this.y = y;
  this.pathProgress = path.progressAtPoint(x, y);
  this.path = path;

  this.core = new ConfiguredTower(BeamTower.CONFIG, x, y);

  this.name = BeamTower.DISPLAY_NAME;
  this.cost = BeamTower.COST;

  // Sell value is half of EVERYTHING sunk in, so the running total is kept
  // here and read by sellValue() in game.js.
  this.totalSpent = BeamTower.COST;

  // Which enemy the beams reach for when more are in range than it can hold.
  // Every tower type has this and the panel grows a cycle button for anything
  // that does; this one used to be wired to "first" with no way to say so.
  this.targeting = "first";

  this.locks = [];              // enemies currently held by a beam
  this.tickTimer = 0;           // accumulates toward the next damage tick

  // WHICH WAY HE IS FACING. Every other tower carries this and gl-world's
  // tower loop reads it -- `drawYaw = warbringerFullCircle(t) ? 0 : (t.aim || 0)`
  // -- but BeamTower does not inherit from Tower and never declared it, so the
  // expression fell to 0 on every frame and the Siphon stood facing one fixed
  // direction while draining something behind him. Owner: "the siphon tower
  // doesn't turn towards the enemies he attacks, he should."
  //
  // -pi/2 is the same rest facing Tower, Soldier, Smasher and Longshot all
  // start at, and it is also SIPHON_YAW, so a Siphon that has never acquired
  // anything is drawn exactly as it was before this existed.
  this.aim = -Math.PI / 2;

  // damageDealt and kills, through the shared scorer -- the beam applied its
  // own damage and so counted no kills at all, while the gunner beside it did.
  TowerScore.init(this);

  this.goldGenerated = 0;   // everything it earned
  this.bonusGold = 0;       // only the part the charge multiplier added
  this.hpHealed = 0;        // base HP this tower's lifesteal has restored

  // Purely cosmetic, and the only frame of animation state this tower carries:
  // 1 the moment lifesteal restores anything, decaying to 0 over half a second.
  // Drives the healing glow around the targets being drained (path B). Written
  // in settleEconomy, decayed in update, never read by the simulation.
  this.healGlow = 0;

  this.ramp = new RampTracker(this.core.stats.mechanics.ramp_per_target);
  this.charge = new ChargeMeter(this.core.stats.mechanics.charge_to_gold);

  // Whether to paint the reach -- set by the renderer from what is selected.
  this.showRange = false;

  this.refreshDerived();
}

BeamTower.CONFIG = TowerConfigs.beam;

// Cosmetic only (2026-07-30, the robot fantasy/magic reskin). The constructor
// is still BeamTower and `BeamTower.ID` is still "siphon": the id is a
// PERSISTENCE FORMAT and js/meta.js looks the constructor up by its global
// name. Same rule as the Rifleman -- see the note atop js/soldier.js.
// Back to "Siphon" on 2026-07-30, at the owner's instruction, after a few hours
// as "Mana Fountain" in the robot fantasy/magic reskin. Cosmetic only: the id
// ("siphon") and the constructor name (BeamTower) never moved, so nothing about
// save data or the meta catalogue is affected by the round trip.
BeamTower.DISPLAY_NAME = "Siphon";

// Stable id for the meta catalogue and save data. See js/meta.js.
BeamTower.ID = "siphon";
BeamTower.COST = BeamTower.CONFIG.baseCost;
BeamTower.BASE_RANGE_UL = BeamTower.CONFIG.base.range;
BeamTower.FOOTPRINT_RADIUS_UL = BeamTower.CONFIG.base.footprint;

// How long each re-applied slow lasts. Long enough to survive a frame or two,
// short enough that the enemy speeds up promptly once the beam moves on.
BeamTower.SLOW_REFRESH_SECONDS = 0.2;

BeamTower.prototype.refreshDerived = function () {
  var s = this.core.stats;
  this.rangeUl = s.range;
  // Footprint is fixed for every tier by design -- read from base, not from
  // the resolved stats, so a stray delta could never move it.
  this.footprintRadiusUl = BeamTower.CONFIG.base.footprint;
  this.rangePx = ul(this.rangeUl);
  this.footprintPx = ul(this.footprintRadiusUl);

  // `maxHp` / `currentHp` forward to the core rather than being copied --
  // see TowerHealth.mirror.
  TowerHealth.mirror(this, this.core);

  // Later tiers replace earlier parameters wholesale, so the modules are
  // re-pointed at the freshly resolved values rather than being rebuilt
  // (rebuilding would throw away accumulated ramp and charges).
  this.ramp.params = s.mechanics.ramp_per_target;
  this.charge.params = s.mechanics.charge_to_gold;
};

// --- upgrades --------------------------------------------------------------

// Total AD, including A5's live gold bonus. Read fresh every tick: the bonus
// moves with the player's bank, in both directions.
BeamTower.prototype.effectiveAD = function (gold) {
  var ad = this.core.stats.ad;
  if (this.core.stats.flags.gold_to_power) ad += GoldPower.bonusAD(gold || 0);
  return ad;
};

BeamTower.prototype.defPierce = function () {
  return this.core.stats.flags.def_pierce
    ? this.core.stats.mechanics.def_pierce.defPierce
    : 0;
};

// A4: enemies at full health take more; below half, nothing extra.
BeamTower.prototype.hpScale = function (enemy) {
  if (!this.core.stats.flags.hp_scaling) return 1;

  var p = this.core.stats.mechanics.hp_scaling;
  var frac = enemy.health / enemy.maxHealth;
  if (frac >= 1) return 1 + p.maxBonus;
  if (frac <= p.floorFraction) return 1;
  return 1 + p.maxBonus * ((frac - p.floorFraction) / (1 - p.floorFraction));
};

// The unlock gate for a tier, beyond the crosspath rule. Returns {ok, reason}.
BeamTower.prototype.checkUnlock = function (pathName) {
  var tiers = this.core.config.paths[pathName];
  var next = tiers[this.core.purchased[pathName]];
  if (!next || !next.unlockCondition) return { ok: true };

  var condition = next.unlockCondition;

  // Gated on HEALING DONE, pooled across every tower -- not on the base's
  // current HP, which is a level anything can push around. See
  // js/systems/healing-ledger.js for why the total is shared.
  if (condition.totalHealedAtLeast !== undefined &&
      HealingLedger.total() < condition.totalHealedAtLeast) {
    return {
      ok: false,
      reason: "needs " + TowerStats.formatTotal(condition.totalHealedAtLeast) +
        " HP healed (have " + TowerStats.formatTotal(HealingLedger.total()) + ")"
    };
  }

  if (condition.globalUniqueKey === "death_denial") return DeathDenial.isAvailable();

  return { ok: true };
};

BeamTower.prototype.purchase = function (pathName) {
  var gate = this.checkUnlock(pathName);
  if (!gate.ok) return gate;

  var cost = this.nextTierCost(pathName);
  var result = this.core.purchase(pathName);
  if (!result.ok) return result;

  this.totalSpent += cost;
  this.refreshDerived();

  // Claim the global one-per-game slot the moment the tier lands.
  if (this.core.stats.flags.death_denial) DeathDenial.register(this);

  return { ok: true };
};

BeamTower.prototype.nextTierCost = function (pathName) {
  var tiers = this.core.config.paths[pathName];
  var owned = this.core.purchased[pathName];
  return owned < tiers.length ? tiers[owned].cost : null;
};

BeamTower.prototype.onDeathDenialSpent = function () {
  this.deathDenialSpent = true;
};

// --- targeting -------------------------------------------------------------

// Is this enemy still a legal thing for a beam to hold?
BeamTower.prototype.canHold = function (enemy) {
  if (enemy.dead || enemy.leaked) return false;
  return RangeFilter.canTarget(
    this.core.stats,
    { x: this.x, y: this.y },
    0,
    { x: enemy.pos.x, y: enemy.pos.y, isFlying: enemy.isFlying, isCamo: enemy.isCamo }
  );
};

// Keep what is already held, then fill the free slots.
//
// Existing locks are NEVER re-sorted or dropped for a "better" target. The
// ramp is per target and builds over seconds, so re-picking the best set each
// tick would reset it constantly and quietly delete the tower's damage.
BeamTower.prototype.updateLocks = function (enemies) {
  var self = this;

  var kept = [];
  for (var i = 0; i < this.locks.length; i++) {
    var held = this.locks[i];

    // Still a legal target, AND still in play. The second half matters: an
    // enemy removed from the board without being marked dead would otherwise
    // stay locked forever, and the beam would go on draining a ghost -- and
    // go on counting itself as in combat, so its charges would never decay.
    if (this.canHold(held) && enemies.indexOf(held) !== -1) kept.push(held);
    else this.ramp.forget(held);            // died or walked out -- ramp resets
  }
  this.locks = kept;

  var free = this.core.stats.maxTargets - this.locks.length;
  if (free <= 0) return;

  var candidates = enemies.filter(function (e) {
    return self.locks.indexOf(e) === -1 && self.canHold(e);
  });

  // Ordered by this tower's targeting mode, through the shared comparator in
  // js/targeting.js -- the same scoring and the same tie-break a gunner uses
  // to choose ONE target, applied to filling several locks at once.
  candidates.sort(Targeting.comparator(this));
  this.locks = this.locks.concat(candidates.slice(0, free));
};

// --- the game's tower contract ---------------------------------------------

// Returns the DAMAGE it landed this step; the game loop pays for it at the
// usual rate (see the update loop in js/game.js). The A3 charge bonus is not
// damage, so it is banked separately through worldContext.addGold.
BeamTower.prototype.update = function (dt, enemies, bullets, world) {
  // Cosmetic only. Aged BEFORE settleEconomy runs, so a heal landing this step
  // leaves the glow at full rather than immediately one frame stale.
  if (this.healGlow > 0) this.healGlow = Math.max(0, this.healGlow - dt * 2);

  this.updateLocks(enemies);
  this.faceLocks(dt);
  this.ramp.update(dt, this.locks);

  var stats = this.core.stats;

  // The slow is re-asserted every frame and expires by itself the moment a
  // beam leaves -- see Enemy.applySlow.
  // Re-applied every frame with a short duration rather than a lasting one:
  // Enemy.applySlow is timed (strongest wins, equal refreshes), so a beam
  // that keeps refreshing a 0.2 s slow holds the enemy for exactly as long as
  // the beam is on it and lets go a fifth of a second after it leaves.
  if (stats.flags.slow) {
    var fraction = stats.mechanics.slow.fraction;
    for (var s = 0; s < this.locks.length; s++) {
      this.locks[s].applySlow(fraction, BeamTower.SLOW_REFRESH_SECONDS);
    }
  }

  // Damage lands on ticks, not frames, so the rate is independent of the
  // frame rate. A long frame fires several ticks rather than losing them.
  var interval = 1 / stats.attackRate;
  this.tickTimer += dt;

  var dealtThisStep = 0;
  while (this.tickTimer >= interval) {
    this.tickTimer -= interval;
    dealtThisStep += this.damageTick(world);
  }

  // "In combat" means HOLDING A TARGET, not "dealt damage this frame".
  // Damage lands on ticks (10/s) while update runs at 60/s, so five frames in
  // six deal nothing even while the beam is firing steadily -- treating those
  // as out of combat made charges decay faster than they could ever be
  // earned, and the meter never left zero.
  return this.settleEconomy(dealtThisStep, dt, world, this.locks.length > 0);
};

// One damage tick against every locked target.
BeamTower.prototype.damageTick = function (world) {
  var ad = this.effectiveAD(world && world.gold);
  var pierce = this.defPierce();
  var dealt = 0;

  for (var i = 0; i < this.locks.length; i++) {
    var target = this.locks[i];
    if (target.dead || target.leaked) continue;

    var raw = ad * this.ramp.multiplier(target) * this.hpScale(target);
    // Through the shared scorer so this tower's damage and kills are counted
    // the same way a bullet's are; mitigation still happens inside takeDamage,
    // which the defense pierce is passed through to.
    dealt += TowerScore.apply(this, target, raw, pierce);
  }

  return dealt;
};

// Charges, gold and lifesteal all key off the same post-mitigation total.
//
// damageDealt is NOT accumulated here: TowerScore credits it as each tick
// lands (see damageTick), and adding it again here would double every figure
// in the panel.
BeamTower.prototype.settleEconomy = function (dealt, dt, world, inCombat) {
  var stats = this.core.stats;

  // Lifesteal is computed on the tick's TOTAL across every target, and on
  // damage that actually landed -- an enemy whose armor ate the whole hit
  // heals nothing.
  if (stats.flags.lifesteal && dealt > 0 && world && world.addBaseHp) {
    var healed = dealt * stats.mechanics.lifesteal.ratio;
    world.addBaseHp(healed);

    // Counted twice on purpose: this tower's own total for its panel, and the
    // shared ledger that gates B5. The gate reads the pool so several
    // lifesteal towers add up to it together.
    this.hpHealed += healed;
    HealingLedger.record(healed);

    // Cosmetic: light the healing glow around whatever is being drained.
    this.healGlow = 1;
  }

  // Ordinary damage pays no cash in the kill-bounty economy. This block is
  // now solely the Siphon's A3 economy ability: `baseGoldPerDamage` is the
  // unit used to price the EXTRA value of its charge multiplier.
  var params = stats.mechanics.charge_to_gold;

  var multiplier = 1;
  if (stats.flags.charge_to_gold) {
    if (dealt > 0) this.charge.addDamage(dealt);
    else if (!inCombat) this.charge.idle(dt);   // nothing to shoot: decay
    // Holding a target but between ticks: neither. The meter simply waits.

    // A5 rewrites both of the charge meter's gold numbers from the live bank.
    var gold = world ? world.gold : 0;
    var perCharge = stats.flags.gold_to_power ? GoldPower.perCharge(gold) : params.perCharge;
    var capTotal = stats.flags.gold_to_power ? GoldPower.capTotal(gold) : params.capTotal;
    multiplier = this.charge.goldMultiplier(perCharge, capTotal);
  }

  var baseIncome = dealt * params.baseGoldPerDamage;
  var earned = baseIncome * multiplier;
  var bonus = earned - baseIncome;

  // Only the extra the charges bought is banked. The unmultiplied base is a
  // calculation unit, not ordinary combat income.
  if (bonus > 0 && world && world.addGold) world.addGold(bonus);

  // The panel reports cash this ability actually added to the bank.
  this.goldGenerated += bonus;
  this.bonusGold += bonus;

  return dealt;
};

// Shared with the gunner, like every other tower's -- see the note in
// js/towers/longshot-adapter.js.
BeamTower.prototype.containsPoint = Tower.prototype.containsPoint;

// What this tower hits for, and how often.
//
// attackDamage is the EFFECTIVE AD -- it includes A5's live gold bonus.
// Showing the resolved stat instead (as this once did) made A5 look like it
// did nothing: the damage was already scaling, the readout just never said so.
//
// attacksPerSecond is the beam's tick rate. A tick is this tower's attack:
// there is no projectile and no swing, so "10 ticks a second" and "10 attacks
// a second" are the same statement, and now they are the same word.
BeamTower.prototype.attackDamage = function () { return this.effectiveAD(currentGold()); };
BeamTower.prototype.attacksPerSecond = function () { return this.core.stats.attackRate; };

BeamTower.prototype.statLines = function () {
  var s = this.core.stats;

  var ad = this.attackDamage();
  var bonus = (s.flags.gold_to_power && ad > s.ad)
    ? "(+" + (Math.round((ad - s.ad) * 10) / 10) + ")"
    : null;

  var rows = TowerStats.totals(this).concat([
    ["Path A/B", this.core.purchased.A + " / " + this.core.purchased.B],
    TowerStats.damage(this, bonus),
    TowerStats.range(this),
    TowerStats.attackSpeed(this),
    ["Targets", String(s.maxTargets)],
    ["Beams", this.locks.length + " active"]
  ]);

  if (s.flags.charge_to_gold) {
    rows.push(["Charges", String(this.charge.charges)]);
    // The bonus, not the total: base income is what any tower earns for that
    // damage, so it says nothing about whether path A is paying off.
    rows.push(["Bonus gold", TowerStats.formatTotal(this.bonusGold)]);
  }
  if (s.flags.lifesteal) {
    rows.push(["Lifesteal", Math.round(s.mechanics.lifesteal.ratio * 100) + "%"]);
    // Its own total, and the shared pool the B5 gate actually reads.
    rows.push(["HP healed", TowerStats.formatTotal(this.hpHealed) +
      "  (all " + TowerStats.formatTotal(HealingLedger.total()) + ")"]);
  }
  if (s.flags.death_denial) rows.push(["Death denial", "armed"]);

  rows.push(["HP", Math.round(this.core.currentHp) + " / " + Math.round(this.core.maxHp)]);

  // DPS means the same thing on every tower: damage per second to ONE enemy,
  // damage x attack speed. This tower's ceiling is a different figure -- every
  // lock, every multiplier -- so it gets its own row rather than quietly
  // redefining the shared one, which is what "DPS 6000 max" used to do.
  rows.push(TowerStats.dpsRow(this));
  rows.push(["Max DPS", String(Math.round(this.maxDps()))]);
  return rows;
};

// The tower's ceiling: every multiplier at once, on the number of targets it
// can actually hold.
//
//   effective AD (A5's live gold bonus included)
//   x attack rate
//   x targets
//   x the ramp cap        (A1/A4 -- a beam held long enough)
//   x the HP-scale bonus  (A4 -- against a full-health target)
//
// It used to be ad x rate x targets off the RESOLVED stat, which ignored all
// four of the things that actually make this tower's damage: the gold bonus,
// the ramp, and the HP scaling. A 5-2 read a flat 200 no matter how strong it
// had become.
BeamTower.prototype.maxDps = function () {
  var s = this.core.stats;
  var dps = this.effectiveAD(currentGold()) * s.attackRate * s.maxTargets;

  if (s.flags.ramp_per_target) dps *= 1 + s.mechanics.ramp_per_target.rampCap;
  if (s.flags.hp_scaling) dps *= 1 + s.mechanics.hp_scaling.maxBonus;

  return dps;
};

BeamTower.prototype.panelActions = function () {
  var actions = [];
  var self = this;

  ["A", "B"].forEach(function (pathName) {
    var owned = self.core.purchased[pathName];
    var check = Crosspath.canPurchaseNext(self.core.purchased, pathName, self.core.config);
    var cost = self.nextTierCost(pathName);

    var tiers = self.core.config.paths[pathName];
    var next = tiers[owned];          // the tier this button would buy, or undefined
    var maxed = owned >= tiers.length;

    var detail;
    var enabled = check.ok;

    // The RULE that refuses this tier, if one does -- as opposed to simply
    // not being able to afford it, which the price already says. The hover
    // card leads with this, so "needs 5.0k HP healed" is readable in full
    // rather than clipped to fit a button.
    var refusal = null;

    if (!check.ok) {
      detail = maxed ? "maxed" : "locked";
      refusal = maxed ? "every tier bought" : "the other path is already committed";
    } else {
      // The unlock gate is checked here too, so the button explains itself
      // rather than just refusing when pressed.
      var gate = self.checkUnlock(pathName);
      if (!gate.ok) {
        detail = gate.reason;
        enabled = false;
        refusal = gate.reason;
      } else {
        detail = "$" + cost;
        enabled = cash >= cost;
      }
    }

    // What the tier actually DOES, before it is bought. The beam's config
    // splits its changes across statDeltas and named mechanics, so both are
    // handed to the same formatter the Longshot uses.
    var effects = maxed ? "every tier bought"
      : (!check.ok ? "other path chosen"
        : UpgradeEffects.describe(next.statDeltas, UpgradeEffects.grantsOf(next)));

    actions.push({
      id: "upgrade" + pathName,
      branch: pathName,
      upgradeId: next ? (pathName + next.tier) : null,
      label: "Path " + pathName + " " + owned + "→" + Math.min(owned + 1, 5),
      detail: detail,
      effects: effects,
      // `refusal` already holds whichever RULE refuses this tier -- crosspath
      // OR the unlock gate. This used to report only the crosspath side, so
      // a gated B5's action claimed nothing was wrong while its own detail
      // said "needs 5000 HP healed". Found by the index screen, whose path
      // walker trusts `reason` to know when a branch stops being climbable.
      reason: refusal,
      enabled: enabled,
      tone: "upgrade",
      // A thunk -- see the twin note in js/towers/longshot-adapter.js.
      tooltip: function () { return self.upgradeCard(pathName, refusal); }
    });
  });

  // A5 is a PASSIVE, so it gets a readout rather than a button: it is doing
  // something different every second as the bank moves, and there was no way
  // to tell it was doing anything at all. `readonly` means the panel draws it
  // as information and never as something to click.
  if (this.core.stats.flags.gold_to_power) {
    var gold = currentGold();
    var bonus = Math.round(GoldPower.bonusAD(gold) * 10) / 10;
    var tiers = GoldPower.tiers(gold);

    actions.push({
      id: "passiveGoldPower",
      label: "Gold → power  ·  +" + bonus + " dmg",
      detail: "tier " + tiers + "  ·  " + GoldPower.perCharge(gold).toFixed(2) +
        "/charge  ·  cap x" + GoldPower.capTotal(gold).toFixed(1),
      // Third line, like every other button in the panel.
      effects: "the bank you are sitting on, as damage",
      enabled: true,
      readonly: true,
      tone: "passive",
      tooltip: UpgradeEffects.card({
        title: "Gold → power",
        subtitle: "live, at " + formatCash(gold) + " gold",
        changes: [
          { label: "Bonus damage", from: "", to: "+" + bonus + " dmg", delta: "" },
          { label: "Scaling tiers", from: "",
            to: tiers + " of " + GoldPower.MAX_TIERS, delta: "" },
          { label: "Per charge", from: "", to: GoldPower.perCharge(gold).toFixed(2), delta: "" },
          { label: "Charge cap", from: "", to: "x" + GoldPower.capTotal(gold).toFixed(1), delta: "" }
        ],
        abilities: UpgradeEffects.abilities(["gold_to_power"], this.core.stats.mechanics),
        note: "Nothing to click: this reads out what your bank is doing to the tower right now."
      })
    });
  }

  return actions;
};

// The hover card for the next tier on a path -- see the twin of this in
// js/towers/longshot-adapter.js. Both are three lines of tower-specific
// framing around ConfiguredTower.previewNextTier, which does the measuring.
BeamTower.prototype.upgradeCard = function (pathName, refusal) {
  var preview = this.core.previewNextTier(pathName);

  if (!preview) {
    return UpgradeEffects.card({
      title: this.name + "  ·  path " + pathName,
      subtitle: "every tier bought",
      note: "Nothing left to buy on this branch."
    });
  }

  var note = null;
  if (refusal) {
    note = "Unavailable: " + refusal + ".";
  } else if (preview.locks) {
    note = "Tier " + this.core.config.crosspath.lockThreshold + " commits this tower: " +
      "the other path is capped at tier " + this.core.config.crosspath.lockOtherAtTier + " for good.";
  }

  return UpgradeEffects.card({
    title: this.name + "  ·  path " + pathName + " tier " + preview.tier.tier,
    subtitle: refusal ? refusal : "$" + preview.cost,
    changes: preview.changes,
    abilities: preview.abilities,
    note: note
  });
};

// The player's bank. One place in this file reaches for a game global, same
// arrangement as currentBaseHp below.
function currentGold() {
  return (typeof cash === "number") ? cash : 0;
}

BeamTower.prototype.performAction = function (id, context) {
  if (id !== "upgradeA" && id !== "upgradeB") return null;

  var pathName = id.slice(-1);
  var cost = this.nextTierCost(pathName);
  var check = Crosspath.canPurchaseNext(this.core.purchased, pathName, this.core.config);
  if (!check.ok) return check.reason;

  var gate = this.checkUnlock(pathName);
  if (!gate.ok) return gate.reason;

  if (context.cash < cost) return "not enough cash";

  var result = this.purchase(pathName);
  if (!result.ok) return result.reason;

  context.spend(cost);
  return this.name + " → " + pathName + this.core.purchased[pathName];
};

// Damage from an Angry enemy, and the death test the main loop sweeps on --
// both through the mirrored HP on the core. See js/systems/tower-health.js.
BeamTower.prototype.takeDamage = function (amount) {
  return TowerHealth.damage(this, amount);
};

BeamTower.prototype.isDestroyed = function () {
  return TowerHealth.isDestroyed(this);
};

// --- drawing ---------------------------------------------------------------

// Where the beams leave from: the top of the water column standing in the
// middle of the basin. The game is drawn from above, so "upward" is a fixed
// screen offset rather than a world one -- the beams rise out of the fountain's
// centre and reach over to their targets, instead of skimming the ground.
//
// A function rather than two inline expressions because draw() needs it in
// several places and a spout that disagrees with the beams leaving it is the
// one way this can look wrong.
// The 0.62 is as tall as the column can be before the tower stops reading as a
// round basin from above and starts reading as a vertical egg. Measured by eye
// against the shipping 15 u.l. footprint; taller was tried and looked wrong.
BeamTower.prototype.spoutPoint = function () {
  return { x: this.x, y: this.y - 8 - this.footprintPx * 0.86 };
};

// How much gold power the fountain is holding, 0 -> 1. Charges first, then the
// fraction toward the next one, so the glow climbs smoothly and resets softly
// rather than stepping. Zero when A3 was never bought.
BeamTower.prototype.chargeGlow = function () {
  if (!this.core.stats.flags.charge_to_gold) return 0;
  var whole = Math.min(1, this.charge.charges / 6);
  return Math.min(1, whole + this.charge.progressFraction() * 0.15);
};

// How far up path A this fountain is, 0 -> 1, derived from resolved AD rather
// than from which tiers are ticked: base 1, full A 10. Widens and brightens the
// beams, which is what path A buys.
BeamTower.prototype.flowPower = function () {
  return Math.max(0, Math.min(1, (this.core.stats.ad - 1) / 9));
};

// A stun silences presentation as well as simulation. The main loop already
// skips update(), so `locks` intentionally stay intact until the tower wakes;
// drawing those live enemy references anyway made the beams keep swivelling
// across the board while the tower was stunned. Hide only the visual beams --
// do not drop locks, reset ramp, or otherwise change combat state.
BeamTower.prototype.visibleLocks = function () {
  return TowerHealth.isStunned(this) ? [] : this.locks;
};

BeamTower.prototype.draw = function (ctx) {
  if (VisualModels.draw("tower", BeamTower.ID + ":complete", ctx, this)) return;
  var stats = this.core.stats;
  var glow = this.chargeGlow();
  var flow = this.flowPower();
  var spout = this.spoutPoint();

  // Reach, only while selected -- see the note on Tower.prototype.draw. The
  // beams themselves are drawn unconditionally below, so a working fountain is
  // still obviously working; what is hidden is the idle circle.
  if (this.showRange) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.rangePx, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(150,255,220,0.06)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(150,255,220,0.5)";
    ctx.stroke();
  }

  if (!VisualModels.draw("tower", BeamTower.ID + ":body", ctx, this,
      { stats: stats, glow: glow, flow: flow, spout: spout })) {
  // --- the fountain itself, drawn BEFORE the beams so they leave from in
  // front of it rather than being painted over by the basin.

  // Raised basin in the shared three-quarter camera. The exposed dark-green
  // side wall makes the fountain a structure instead of a turquoise puddle.
  var basin = Visuals3Q.platform(ctx, this.x, this.y, this.footprintPx, {
    height: 8,
    top: "#1d5a4d",
    side: "#0d2d28",
    rim: "#78f0cc",
    highlight: "rgba(225,255,245,0.42)"
  });

  // The pool: crystalline water, brighter the more gold the fountain holds.
  ctx.beginPath();
  ctx.ellipse(this.x, basin.y, this.footprintPx * 0.76,
    this.footprintPx * 0.76 * Visuals3Q.GROUND_SQUASH,
    0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(60," + Math.round(200 + 40 * glow) + "," +
    Math.round(180 + 50 * glow) + "," + (0.45 + 0.35 * glow).toFixed(2) + ")";
  ctx.fill();

  // Facets on the water -- six chords across the pool, which is the cheapest
  // way to say "crystalline" rather than "puddle".
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(220,255,246," + (0.25 + 0.4 * glow).toFixed(2) + ")";
  for (var f = 0; f < 6; f++) {
    var fa = f * Math.PI / 3;
    var fr = this.footprintPx * 0.76;
    ctx.beginPath();
    ctx.moveTo(this.x + Math.cos(fa) * fr,
      basin.y + Math.sin(fa) * fr * Visuals3Q.GROUND_SQUASH);
    ctx.lineTo(this.x + Math.cos(fa + 2.094) * fr,
      basin.y + Math.sin(fa + 2.094) * fr * Visuals3Q.GROUND_SQUASH);
    ctx.stroke();
  }

  // The column of water standing in the middle, running up to the spout. Drawn
  // as a tapering stack of discs, widest at the pool and tightest at the top.
  for (var c = 0; c < 4; c++) {
    var ct = c / 3;
    ctx.beginPath();
    ctx.ellipse(this.x, basin.y - this.footprintPx * 0.86 * ct,
      this.footprintPx * (0.30 - 0.16 * ct),
      this.footprintPx * (0.17 - 0.08 * ct), 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(" + Math.round(150 + 60 * glow) + ",255,236," +
      (0.30 + 0.45 * ct * (0.6 + 0.4 * glow)).toFixed(2) + ")";
    ctx.fill();
  }

  // The spout crystal the beams leave from.
  ctx.beginPath();
  ctx.arc(spout.x, spout.y, 2.5 + 2 * glow + 1.2 * flow, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(230,255,248," + (0.65 + 0.35 * glow).toFixed(2) + ")";
  ctx.fill();

  // The rim again, over the water (see the note where the basin is filled).
  ctx.beginPath();
  ctx.ellipse(this.x, basin.y, this.footprintPx,
    this.footprintPx * Visuals3Q.GROUND_SQUASH, 0, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#6fe8c4";
  ctx.stroke();

  // A halo when the fountain is charged, so a well-fed one is obvious from
  // across the board.
  if (glow > 0.02) {
    ctx.beginPath();
    ctx.arc(spout.x, spout.y, 6 + 9 * glow, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,232,150," + (0.35 * glow).toFixed(2) + ")";
    ctx.stroke();
  }
  }

  // --- the beams. One per locked target, rising out of the spout. Thickness
  // and brightness follow that target's own ramp AND path A's flow, so both
  // mechanics are legible without a readout: a beam that has been held a long
  // time is visibly fatter than a fresh one, and a fountain deep into path A
  // pours a wider beam than a fresh one at the same ramp.
  var visibleLocks = this.visibleLocks();
  for (var i = 0; i < visibleLocks.length; i++) {
    var target = visibleLocks[i];
    if (target.dead || target.leaked) continue;

    var ramped = this.ramp.multiplier(target);
    var maxMult = 1 + (stats.mechanics.ramp_per_target.rampCap || 0);
    var t = maxMult > 1 ? (ramped - 1) / (maxMult - 1) : 0;

    ctx.beginPath();
    ctx.moveTo(spout.x, spout.y);
    ctx.lineTo(target.pos.x, target.pos.y);
    ctx.lineCap = "round";

    ctx.lineWidth = (5 + 5 * t) * (1 + 0.6 * flow);
    ctx.strokeStyle = "rgba(120,255,215," + (0.10 + 0.12 * t + 0.08 * flow).toFixed(3) + ")";
    ctx.stroke();

    ctx.lineWidth = (1.5 + 2 * t) * (1 + 0.5 * flow);
    ctx.strokeStyle = "rgba(200,255,240," + Math.min(1, 0.55 + 0.4 * t + 0.15 * flow).toFixed(3) + ")";
    ctx.stroke();

    // Lifesteal (path B): a soft healing halo on the target being drained,
    // pulsing with each heal. Deliberately subtle -- it is a readout, not an
    // effect, and the beam is already the loud part.
    if (stats.flags.lifesteal && this.healGlow > 0) {
      var halo = (target.radiusPx ? target.radiusPx() : 11) + 4 + 3 * this.healGlow;
      ctx.beginPath();
      ctx.arc(target.pos.x, target.pos.y, halo, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(170,255,190," + (0.35 * this.healGlow).toFixed(3) + ")";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(target.pos.x, target.pos.y, halo * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(190,255,205," + (0.10 * this.healGlow).toFixed(3) + ")";
      ctx.fill();
    }
  }

  if (this.core.stats.flags.charge_to_gold) this.drawChargeBar(ctx);

  if (this.core.stats.flags.death_denial) {
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = "#bfffe9";
    ctx.textAlign = "center";
    ctx.fillText("DENIAL", this.x, this.y - this.footprintPx - 34);
    ctx.textAlign = "left";
  }
};

// A3's charge meter, drawn above the tower: a bar filling toward the next
// charge, with the charge COUNT beside it.
//
// The bar shows the fraction, not the raw damage, because each threshold is
// 65% larger than the last -- "1200 damage banked" says nothing about how
// close you are, while a bar at 40% does. The count is what actually drives
// the gold multiplier, so it gets its own number rather than being inferred
// from bar segments.
//
// Pixel sizes here are cosmetic chrome, like every other draw() detail.
BeamTower.prototype.drawChargeBar = function (ctx) {
  var width = 34;
  var height = 5;
  var x = this.x - width / 2 - 5;      // shifted left to make room for the count
  // Lifted clear of the water column and its charged halo, which now stand up
  // out of the basin towards exactly this spot (see spoutPoint).
  var y = this.y - this.footprintPx - 24;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x, y, width, height);

  var fraction = this.charge.progressFraction();
  if (fraction > 0) {
    ctx.fillStyle = "#ffd76e";
    ctx.fillRect(x, y, width * fraction, height);
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,215,110,0.55)";
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  // Dim at zero charges so a fresh tower does not shout a meaningless "0".
  ctx.fillStyle = this.charge.charges > 0 ? "#ffd76e" : "rgba(255,215,110,0.4)";
  ctx.fillText("x" + this.charge.charges, x + width + 4, y + height / 2);

  ctx.textBaseline = "alphabetic";
};

// Build bar icon: the basin with its water column, and one beam leaving the
// spout. Pixel sizes on purpose -- interface chrome must not scale with the map.
BeamTower.drawIcon = function (ctx, cx, cy, size) {
  if (VisualModels.draw("tower", BeamTower.ID + ":icon", ctx,
      { cx: cx, cy: cy, size: size, type: BeamTower })) return;
  var spoutY = cy - size * 0.5;

  // Beam, leaving the spout rather than the centre, matching the real tower.
  ctx.beginPath();
  ctx.moveTo(cx, spoutY);
  ctx.lineTo(cx - size * 0.8, cy - size * 0.85);
  ctx.lineWidth = Math.max(2, size * 0.14);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(190,255,235,0.9)";
  ctx.stroke();

  // Basin.
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = "#14413a";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#6fe8c4";
  ctx.stroke();

  // Crystalline pool, with two facets across it.
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(60,220,200,0.6)";
  ctx.fill();

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(220,255,246,0.5)";
  for (var f = 0; f < 3; f++) {
    var fa = f * Math.PI / 3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(fa) * size * 0.38, cy + Math.sin(fa) * size * 0.38);
    ctx.lineTo(cx - Math.cos(fa) * size * 0.38, cy - Math.sin(fa) * size * 0.38);
    ctx.stroke();
  }

  // The column, tapering up to the spout crystal.
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.16, cy);
  ctx.lineTo(cx - size * 0.06, spoutY);
  ctx.lineTo(cx + size * 0.06, spoutY);
  ctx.lineTo(cx + size * 0.16, cy);
  ctx.closePath();
  ctx.fillStyle = "rgba(180,255,236,0.75)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, spoutY, size * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = "#e6fff8";
  ctx.fill();
};
