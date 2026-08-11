// ---------------------------------------------------------------------------
// LongshotTower -- the Longshot config, wearing the game's tower interface.
//
// js/towers/tower-runtime.js (ConfiguredTower) knows how to RESOLVE a tower
// from config: stats, upgrades, crosspaths, pierce, crit, execute, reload,
// kill-stacks, abilities. It deliberately knows nothing about this game's
// path, Enemy, Bullet, cash, or build bar.
//
// js/game.js expects tower CONSTRUCTORS with a specific shape (see AGENTS.md,
// "The build bar and the inspection panel"): new Type(x, y, path),
// DISPLAY_NAME, COST, BASE_RANGE_UL, FOOTPRINT_RADIUS_UL, drawIcon(), and
// prototype update/draw/statLines/containsPoint.
//
// This file is the seam between the two, and nothing else in either half has
// to know the other exists. That is the point: `js/systems/*` stayed generic,
// `js/game.js` stayed unaware of upgrade trees, and a future config-driven
// tower needs only its own small adapter like this one -- or a shared generic
// adapter, once there are two of them and the common shape is obvious.
//
// Distances: config is u.l., ul() converts at the edge (see js/units.js).
// Targeting is handed WORLD positions and converts the radii itself.
// ---------------------------------------------------------------------------

function LongshotTower(x, y, path) {
  this.x = x;
  this.y = y;

  // Firing priority, same rule as the gunner: towers are sorted by how far
  // along the path they sit, and the update order IS the claim order.
  this.pathProgress = path.progressAtPoint(x, y);

  // Kept so shots can be led -- predicting where a walker will be means
  // walking it forward along the path, which needs the path itself.
  this.path = path;

  this.core = new ConfiguredTower(LongshotTower.CONFIG, x, y);

  this.name = LongshotTower.DISPLAY_NAME;

  // The build price, and everything sunk in since. Upgrades add to the second
  // one, which is what a sale refunds half of -- this tower used to track
  // neither, so a Longshot with $19 000 of upgrades on it refunded $38.
  this.cost = LongshotTower.COST;
  this.totalSpent = LongshotTower.COST;

  this.aim = -Math.PI / 2;   // barrel angle, cosmetic in circle mode

  // Which enemy to shoot when several are reachable. Every tower type has
  // this, and the panel grows a cycle button for anything that does -- this
  // tower was stuck on "first" with no way to say otherwise, for no reason
  // beyond nobody having wired it up.
  this.targeting = "first";

  // Lifetime damage and kills, kept by the shared scorer so every tower type
  // counts them the same way. Overkill is excluded: the enemy reports what it
  // really absorbed. Both are accumulated in the onHit callback in update(),
  // which is the only place this tower learns that a shot connected.
  TowerScore.init(this);

  // Whether to paint the reach. Set by the renderer from what is selected --
  // see the note on Tower.prototype.draw.
  this.showRange = false;

  this.refreshDerived();
}

LongshotTower.CONFIG = TowerConfigs.longRangeDPS;

// Cosmetic only (2026-07-30, the robot fantasy/magic reskin). The constructor
// is still LongshotTower and `LongshotTower.ID` is still "longshot": the id is
// a PERSISTENCE FORMAT and js/meta.js looks the constructor up by its global
// name, so renaming either would un-own the tower for every existing player.
// Same rule as the Rifleman -- see the note atop js/soldier.js.
LongshotTower.DISPLAY_NAME = "Arcane Sniper";

// Stable id for the meta catalogue and save data. See js/meta.js.
LongshotTower.ID = "longshot";

// From config, which gets it from the DPS model in tools/price-upgrades.js.
// Read here rather than restated, so there is one number, not two.
LongshotTower.COST = LongshotTower.CONFIG.baseCost;

// The build bar reads these off the CONSTRUCTOR, before any instance exists,
// for the placement preview and the "not too close to the road" rule. Both
// come straight from config so they cannot drift from the real stats.
LongshotTower.BASE_RANGE_UL = LongshotTower.CONFIG.base.range;
LongshotTower.FOOTPRINT_RADIUS_UL = LongshotTower.CONFIG.base.footprint;

// Cached world-space values, recomputed whenever an upgrade changes a stat.
// Same caching the gunner does in its constructor -- convert once, compare
// in world space forever after.
LongshotTower.prototype.refreshDerived = function () {
  this.rangeUl = this.core.stats.range;
  this.footprintRadiusUl = this.core.stats.footprint;
  this.rangePx = ul(this.rangeUl);
  this.footprintPx = ul(this.footprintRadiusUl);

  // `maxHp` / `currentHp` FORWARD to the core rather than being copied from
  // it -- see TowerHealth.mirror. The core is where this tower's HP actually
  // lives (the resolver writes it on every upgrade, and B5 burns max HP
  // directly), and a copy would go stale the moment either happened.
  TowerHealth.mirror(this, this.core);
};

// Damage from an Angry enemy, and the death test the main loop sweeps on.
// Both land on the core through the mirrored properties, so B5's permanent
// max-HP loss and an enemy's swing are measured against the same number.
LongshotTower.prototype.takeDamage = function (amount) {
  return TowerHealth.damage(this, amount);
};

LongshotTower.prototype.isDestroyed = function () {
  return TowerHealth.isDestroyed(this);
};

// Buy the next tier on a path. Returns the same {ok, reason} the crosspath
// validator produces, so the caller can show why a purchase was refused.
LongshotTower.prototype.purchase = function (pathName) {
  var cost = this.nextTierCost(pathName);
  var result = this.core.purchase(pathName);
  if (result.ok) {
    this.totalSpent += cost;
    this.refreshDerived();
  }
  return result;
};

// The price of the next tier on a path, or null if there is no next tier.
LongshotTower.prototype.nextTierCost = function (pathName) {
  var tiers = this.core.config.paths[pathName];
  var owned = this.core.purchased[pathName];
  return owned < tiers.length ? tiers[owned].cost : null;
};

// Point the cone at a world position. Returns the same {ok, reason} shape
// ConfiguredTower.reaim does, including the cooldown refusal.
LongshotTower.prototype.aimAt = function (x, y) {
  return this.core.reaim(Math.atan2(y - this.y, x - this.x));
};

// --- panel actions ---------------------------------------------------------
//
// The inspection panel in js/game.js draws a button per entry here and
// routes clicks back through performAction(). game.js knows nothing about
// upgrade paths or abilities -- it lays out whatever list it is handed, and
// a tower with no actions (the gunner) simply never defines this method.
//
//   id       passed back to performAction
//   label    top line
//   detail   second line (price, or why it is unavailable)
//   enabled  greyed out and unclickable when false
//   tone     "upgrade" | "ability" -- colour only
LongshotTower.prototype.panelActions = function () {
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
    if (!check.ok) {
      // Short enough for the button; the full reason is in the log/sidebar.
      detail = maxed ? "maxed" : "locked";
    } else {
      detail = "$" + cost;
    }

    // What the tier actually DOES, shown before it is bought -- read off the
    // config's own deltas and grants, so it cannot disagree with the tier.
    var effects = maxed ? "every tier bought"
      : (!check.ok ? "other path chosen"
        : UpgradeEffects.describe(next.deltas, UpgradeEffects.grantsOf(next)));

    actions.push({
      id: "upgrade" + pathName,
      branch: pathName,
      upgradeId: next ? (pathName + next.tier) : null,
      label: "Path " + pathName + " " + owned + "→" + Math.min(owned + 1, 5),
      detail: detail,
      effects: effects,
      reason: check.ok ? null : detail,
      enabled: check.ok && cash >= cost,
      tone: "upgrade",
      // A thunk: building the card resolves this tower's stats a second time,
      // and the panel is laid out several times a frame. Only the button
      // under the cursor pays for it (see cardFor in js/game.js).
      tooltip: function () {
        return self.upgradeCard(pathName, check.ok ? null
          : (maxed ? "every tier bought" : "the other path is already committed"));
      }
    });
  });

  // Cone re-aim (A4+). Spec 5.6: the player sets the cone's direction, and
  // re-aiming is itself an ability on a 10s cooldown.
  if (this.core.stats.targetShape === "cone") {
    var cooling = this.core.reaimCooldownTimer > 0;
    actions.push({
      id: "reaim",
      label: "Re-aim cone",
      detail: cooling
        ? "ready in " + this.core.reaimCooldownTimer.toFixed(1) + "s"
        : "click a direction",
      // Every button in the panel has the same three lines -- which, what it
      // costs, what it does -- so an ability does not read as a different
      // kind of control from an upgrade.
      effects: "turn the " + this.core.stats.coneArcDeg + "° cone to face somewhere else",
      enabled: !cooling,
      tone: "ability",
      // A plain object rather than a thunk: nothing here needs resolving, it
      // is four fields read off stats this tower already has.
      tooltip: UpgradeEffects.card({
        title: "Re-aim cone",
        subtitle: cooling
          ? "ready in " + this.core.reaimCooldownTimer.toFixed(1) + " s"
          : "ready",
        changes: [
          { label: "Cone arc", from: "", to: this.core.stats.coneArcDeg + "°", delta: "" },
          { label: "Cooldown", from: "",
            to: this.core.stats.mechanics.cone.reaimCooldownSeconds + " s", delta: "" }
        ],
        abilities: [{
          name: "Point it somewhere else",
          text: "Arms aiming, then the next click on the map sets the direction the cone faces. It does not place a tower or fire a shot."
        }]
      })
    });
  }

  if (this.core.stats.flags.activeAbility) {
    var stunned = this.core.stunTimer > 0;
    var ability = this.core.stats.mechanics.activeAbility;
    // Automatic timing is valid for the nuke because it needs no second input.
    // Cone re-aim above deliberately has no switch: it still needs a direction
    // from the player's next map click.
    actions.push(AutoAbility.attach({
      id: "ability",
      label: "Ability",
      detail: stunned
        ? "stunned " + this.core.stunTimer.toFixed(1) + "s"
        : ability.damage + " dmg · costs " + ability.maxHpLoss + " HP",
      effects: TowerStats.distance(ability.aoeRadius) + " blast, ignores defense, " +
        ability.stunSeconds + " s stunned",
      enabled: !stunned,
      tone: "ability",
      tooltip: UpgradeEffects.card({
        title: "Active ability",
        subtitle: stunned ? "stunned for " + this.core.stunTimer.toFixed(1) + " s" : "ready",
        changes: [
          { label: "Damage", from: "", to: String(ability.damage), delta: "" },
          { label: "Blast", from: "", to: TowerStats.distance(ability.aoeRadius), delta: "" },
          { label: "Stun", from: "", to: ability.stunSeconds + " s", delta: "" },
          { label: "Tower HP lost", from: "", to: "-" + ability.maxHpLoss, delta: "" }
        ],
        abilities: UpgradeEffects.abilities(["activeAbility"], this.core.stats.mechanics),
        note: "The HP loss is permanent -- it lowers this tower's maximum, not just its current health."
      })
    }, this, "ability", "AUTO"));
  }

  return actions;
};

// The hover card for the next tier on a path: what it costs, every stat it
// moves with the value before and after, a sentence per ability it switches
// on, and the crosspath consequence a price tag cannot show.
//
// Everything in it is measured by ConfiguredTower.previewNextTier, which
// resolves the config twice and diffs -- so the card describes what THIS
// tower would gain, crosspathing included.
LongshotTower.prototype.upgradeCard = function (pathName, refusal) {
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

// Runs one of the actions above. Returns a short string for the log, or null
// if nothing happened.
LongshotTower.prototype.performAction = function (id, context) {
  var auto = AutoAbility.handle(this, id);
  if (auto) return auto;

  if (id === "upgradeA" || id === "upgradeB") {
    var pathName = id.slice(-1);
    var cost = this.nextTierCost(pathName);
    var check = Crosspath.canPurchaseNext(this.core.purchased, pathName, this.core.config);

    if (!check.ok) return check.reason;
    if (context.cash < cost) return "not enough cash";

    var result = this.purchase(pathName);
    if (!result.ok) return result.reason;

    context.spend(cost);
    return this.name + " → " + pathName + this.core.purchased[pathName];
  }

  if (id === "reaim") {
    if (this.core.reaimCooldownTimer > 0) return "re-aim on cooldown";
    // Direction comes from where the player clicks next, so this only arms
    // the mode; game.js calls aimAt() when that click arrives.
    context.beginAiming(this);
    return "click the map to aim the cone";
  }

  if (id === "ability") {
    // THE ABILITY IS NOW CHANNELLED, NOT INSTANT (mechanics.activeAbility
    // .channelSeconds). This only ARMS it: the strongest enemy is locked now,
    // the ritual follows that SAME enemy for three seconds, and update()
    // resolves it. It never swaps to a stronger enemy mid-channel.
    //
    // `x`/`y` are retained as the last valid point as well as feeding the
    // renderer. If the locked enemy dies or leaks during the ritual, the
    // strike still lands at the last place the channel saw it rather than
    // snapping to somebody else or disappearing.
    if (this.channel) return "already channelling";
    if (this.core.stunTimer > 0) return "stunned";

    var params = this.core.stats.mechanics.activeAbility;
    var strongest = null;
    for (var ci = 0; ci < context.enemies.length; ci++) {
      var candidate = context.enemies[ci];
      if (candidate.dead || candidate.leaked) continue;
      if (!strongest || candidate.health > strongest.health) {
        strongest = candidate;
      }
    }
    if (!strongest) return "no enemy on screen";

    var seconds = params.channelSeconds || 0;
    this.channel = {
      target: strongest,
      x: strongest.pos.x,
      y: strongest.pos.y,
      remaining: seconds,
      total: seconds
    };
    // Zero-length channel stays instant, so a config that removes the
    // wind-up still works rather than hanging on a timer that never ticks.
    if (seconds <= 0) this.resolveChannel(context.enemies);
    return "channelling";
  }

  return null;
};

// --- the game's tower contract ---------------------------------------------

LongshotTower.prototype.update = function (dt, enemies, bullets) {
  this.core.update(dt);

  // The ritual, if one is running. Ticked before anything else so the frame
  // it completes on is the frame the strike lands.
  if (this.channel) {
    // Follow only the enemy chosen when the button was pressed. Keeping the
    // object reference (rather than selecting from `enemies` again) makes a
    // higher-HP arrival irrelevant and prevents a visible mid-ritual snap.
    // Once that enemy is gone, preserve the last valid coordinates so the
    // already-telegraphed strike still has a deterministic landing point.
    var locked = this.channel.target;
    if (locked && !locked.dead && !locked.leaked && locked.pos &&
        typeof locked.pos.x === "number" && typeof locked.pos.y === "number") {
      this.channel.x = locked.pos.x;
      this.channel.y = locked.pos.y;
    }

    this.channel.remaining -= dt;
    if (this.channel.remaining <= 0) {
      this.resolveChannel(enemies);
    }

    // Nothing else happens on any channel frame, including the resolution
    // frame: no targeting, no aim change and no shot. Besides making the full
    // three seconds a real commitment, this keeps the facing frozen when the
    // ability's self-stun begins at detonation.
    return 0;
  }

  // Use the same action path as a manual cast so its damage, stun and permanent
  // maximum-HP cost cannot drift between manual and automatic use.
  if (AutoAbility.isOn(this, "ability") && this.core.stats.flags.activeAbility) {
    this.performAction("ability", {
      enemies: enemies
    });
  }

  // ONE LINEAR PASS FOR THE BEST TARGET.
  //
  // This used to build a `live` array of targetView wrappers, hand it to
  // RangeFilter.getValidTargets (which filters into a SECOND array through a
  // closure), sort that array with a third closure, and then read exactly one
  // element out of it -- `valid[0]`. Nothing downstream ever looked at the
  // rest: a piercing shot decides what it passes through from where the bodies
  // are STANDING, in PierceBullet.update, not from an order picked here. So the
  // sort was computing an argmax the long way round, and on a 120-body board
  // that was ~120 wrapper objects, two arrays and three closures per Longshot
  // per step, thrown away immediately.
  //
  // The scan below is the same three tests in the same order, keeping the best
  // by the same shared comparator. It is EXACTLY equivalent to reading
  // element 0 of the old stable sort: `order(...) < 0` replaces the incumbent
  // only on a STRICTLY better candidate, so an exact tie keeps the one that
  // appeared earlier in `enemies` -- which is what a stable sort left at the
  // front. The comparator is still js/targeting.js's, so the tower still obeys
  // whichever of the six modes the player picked.
  //
  // The view literal stays a literal, deliberately. It no longer escapes into
  // an array, so V8 scalar-replaces it and the allocation costs nothing;
  // hoisting it to a shared scratch object measured 64% SLOWER on the beam,
  // because that defeats the same escape analysis and adds write barriers.
  var order = Targeting.comparator(this);
  var stats = this.core.stats;
  var aimRad = this.core.aimRad;
  var towerPos = { x: this.x, y: this.y };
  var primary = null;

  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    // Same claim-aware filter the gunner uses: an enemy that bullets already
    // in flight will kill is somebody else's, and shooting it again would
    // land on a corpse and pay nothing.
    if (e.dead || e.leaked) continue;
    if (e.unclaimedHealth() <= 0) continue;
    // Range, deadzone, cone arc, camo and flying visibility all applied here,
    // by the shared targeting system rather than by anything in this file.
    if (!RangeFilter.canTarget(stats, towerPos, aimRad, {
      x: e.pos.x,
      y: e.pos.y,
      isFlying: !!e.isFlying,
      isCamo: !!e.isCamo
    })) continue;
    if (primary === null || order(e, primary) < 0) primary = e;
  }

  // Every exit returns 0, the same contract every other projectile tower's
  // update() has. A Longshot lands no damage directly -- its damage arrives
  // when a PierceBullet hits and reports it for counters and mechanics.
  if (primary === null) return 0;
  this.aim = Math.atan2(primary.pos.y - this.y, primary.pos.x - this.x);

  if (!this.core.canFire()) return 0;

  var hpFraction = primary.health / primary.maxHealth;

  // IS THIS THE FOURTH? B5's guaranteedReloadShotCrit makes the shot
  // immediately before a reload always crit and always carry the full
  // execute bonus -- by far the biggest thing this tower ever fires. Asked
  // read-only BEFORE fire(), because fire() is what advances the counter;
  // it uses the same ReloadTracker predicate, so the two cannot disagree
  // about which shot is the special one.
  var empowered = !!(this.core.stats.flags.guaranteedReloadShotCrit &&
    this.core.reload && this.core.reload.nextShotIsFinalBeforeReload());

  var shot = this.core.fire(hpFraction);

  // ONE projectile per shot, always. Pierce does not multiply shots -- it
  // lets a single shot keep flying through whatever is behind the enemy it
  // hits. PierceBullet (js/bullet.js) owns that behaviour: it travels a
  // straight line, and each enemy it touches costs it one point of pierce and
  // one step down the falloff curve.
  //
  // So which enemies get hit is decided by where they are STANDING relative
  // to this line, not by a list picked here. In a crowd the whole line behind
  // the first target takes damage; a straggler off to one side does not.
  var self = this;

  // Aim where the target WILL be, not where it is. The shot does not steer,
  // and over its flight a walking enemy moves several times its own width --
  // without leading, a base Longshot would miss most of the time and its
  // whole DPS model would be fiction.
  var aimPoint = this.predictedPosition(primary);
  var muzzleAngle = Math.atan2(aimPoint.y - this.y, aimPoint.x - this.x);

  // THE SHOT LEAVES THE END OF THE BARREL. It used to be born 1 u.l. from the
  // tower's centre, which is inside his coat -- with a rifle this long the
  // bullet appeared behind the muzzle and the two never agreed.
  //
  // The same distance comes straight back off maxTravelPx, so the far end of
  // a shot is exactly where it always was. Starting 36 u.l. closer to the
  // enemy and travelling 36 u.l. less is the same line; what changes is only
  // which end of it is drawn. Nothing about targeting moves either --
  // js/systems/range-filter.js still measures from the tower's centre.
  var muzzle = this.muzzleOffsetPx(muzzleAngle);
  var muzzlePx = muzzle.distance;

  bullets.push(new PierceBullet({
    x: this.x + Math.cos(muzzleAngle) * muzzlePx,
    y: this.y + Math.sin(muzzleAngle) * muzzlePx,
    angle: muzzleAngle,
    damage: shot.sequence[0],
    pierce: this.core.stats.pierce,
    hasFalloff: !!this.core.stats.flags.pierceFalloff,
    falloffParams: this.core.stats.mechanics.pierceFalloff,
    maxTravelPx: Math.max(ul(1), this.rangePx - muzzlePx),
    // Cosmetic: which path this tower went down, so the bolt and its impact
    // burn the same colour the tower does. Whichever path is further along
    // wins, and an untouched tower fires the neutral shot it always did.
    tint: (this.core.purchased.B > this.core.purchased.A) ? "sigil"
      : (this.core.purchased.A > 0 ? "ley" : null),
    // Cosmetic: from A4 the weapon is a rail cannon, so the shot is drawn as
    // a lance that thins as pierce falloff eats it. A5's is heavier again.
    style: this.core.purchased.A >= 5 ? "meridian"
      : (this.core.purchased.A >= 4 ? "lance" : null),
    speedUlps: this.shotSpeedUlps(),
    // Cosmetic: how high off the ground this tower's barrel sits, so the
    // shot is DRAWN at barrel height while its real position stays on the
    // flat plane it does its hit tests on. A rail cannon on a yoke is much
    // lower than a rifle at the shoulder, and one constant for both put the
    // beam through the mount.
    liftUl: muzzle.heightUl,
    // Cosmetic: the fourth-of-four shot draws as its own covenant round, so
    // the one that always crits is the one you can SEE coming.
    empowered: empowered,
    primary: primary,
    onHit: function (hitEnemy, dealt) {
      // Scored here rather than through TowerScore.apply, because the shot
      // itself applies the damage as it flies (see PierceBullet): the bullet
      // only checks enemies that were alive when it reached them, so an enemy
      // dead immediately after the hit was killed BY this hit.
      self.damageDealt += dealt;
      if (hitEnemy.dead) {
        self.kills++;
        // Kill-stacking attack speed (A5) counts kills BY THIS TOWER, which
        // is knowable only when a shot connects.
        self.core.onKill();
      }
    }
  }));

  return 0;
};

// Where `enemy` will be by the time a shot fired now reaches it. Enemies move
// along the path, so the prediction is done in path progress and converted
// back to a point -- which keeps it correct around corners, where a naive
// straight-line velocity guess would aim into the scenery.
// How fast this tower's shot travels, in u.l./s. Path A's graft tiers replace
// the rifle with a rail cannon and the shot stops being a thing that flies --
// see projectile.speedUlpsByGraft in the config.
//
// ONE function, read by BOTH the bullet and the lead calculation below. If
// they used different numbers the tower would aim where the enemy will be for
// a slow shot and then fire a fast one, and miss ahead of everything.
// The channel completing: everything the ability used to do the instant the
// button was pressed happens here instead, three seconds later.
//
// The AoE is resolved against the enemy list AS IT IS NOW, at the locked
// target's latest valid position. Anything near that moving point gets hit.
// If the target died or leaked, `point` still carries its last valid position.
LongshotTower.prototype.resolveChannel = function (enemies) {
  var params = this.core.stats.mechanics.activeAbility;
  var point = this.channel;
  this.channel = null;
  if (!point) return;

  var radiusPx = ul(params.aoeRadius);
  var self = this;
  var hitCount = 0;

  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead || e.leaked) continue;
    var dx = e.pos.x - point.x;
    var dy = e.pos.y - point.y;
    if (dx * dx + dy * dy > radiusPx * radiusPx) continue;
    // Flat damage: the spec has this ignore all defence and armour, so it
    // does NOT go through DamagePipeline.
    TowerScore.apply(self, e, params.damage, 0, 0, "aoe");
    hitCount++;
  }

  // The cost is paid on RESOLUTION, not on the press -- so a channel is not
  // yet a wound, and the permanent max-hp loss lands with the strike.
  this.core.currentHp = Math.max(0, this.core.currentHp - 0);
  this.core.maxHp = Math.max(0, this.core.maxHp - params.maxHpLoss);
  this.core.currentHp = Math.min(this.core.currentHp, this.core.maxHp);
  this.core.stunTimer = params.stunSeconds;

  if (typeof Effects !== "undefined" && Effects.aoeImpact) {
    Effects.aoeImpact(point.x, point.y, radiusPx, "b5-strike", {
      particles: false,
      life: 0.9,
      radiusPx: radiusPx,
      hits: hitCount
    });
  }
  return hitCount;
};

// WHERE THE BARREL TIP ACTUALLY IS ON SCREEN, for a shot heading `angle`.
//
// The offset in config is the barrel's length in the WORLD. The board is
// drawn obliquely, so a barrel pointing up or down the screen is
// foreshortened while one pointing sideways is not -- Visuals3Q squashes the
// ground plane to GROUND_SQUASH. A fixed distance along the aim therefore put
// the shot at the muzzle only when the tower fired east or west, and up to
// 44% past it when it fired north or south. That is the "bullets don't come
// out of the barrel" bug, and it got worse the longer the weapon grew.
//
// For a screen heading a, the projected length of a world-length barrel is
// L / N where N = hypot(cos a, sin a / squash) -- N is 1 sideways and 1/squash
// vertically. Dividing by it puts the shot on the barrel tip at every facing.
//
// Reading GROUND_SQUASH from Visuals3Q is a read of a fixed PROJECTION
// CONSTANT, not of presentation state; the alternative is a second copy of
// the number, and one constant in two files is the worse failure. Falls back
// to the same value if the presentation layer is absent (headless tests).
LongshotTower.prototype.muzzleOffsetPx = function (angle) {
  var cfg = this.core.config.projectile || {};
  var ulOffset = cfg.muzzleOffsetUl || 1;
  var byGraft = cfg.muzzleOffsetUlByGraft;
  if (byGraft && byGraft[this.core.purchased.A] !== undefined) {
    ulOffset = byGraft[this.core.purchased.A];
  }

  var heightUl = cfg.muzzleHeightUl || 0;
  var heightByGraft = cfg.muzzleHeightUlByGraft;
  if (heightByGraft && heightByGraft[this.core.purchased.A] !== undefined) {
    heightUl = heightByGraft[this.core.purchased.A];
  }

  var squash = (typeof Visuals3Q !== "undefined" && Visuals3Q.GROUND_SQUASH)
    ? Visuals3Q.GROUND_SQUASH : 0.56;
  var c = Math.cos(angle);
  var s = Math.sin(angle) / squash;
  var shorten = Math.sqrt(c * c + s * s) || 1;

  return { distance: ul(ulOffset) / shorten, heightUl: heightUl };
};

LongshotTower.prototype.shotSpeedUlps = function () {
  var cfg = this.core.config.projectile;
  var byGraft = cfg && cfg.speedUlpsByGraft;
  if (byGraft && byGraft[this.core.purchased.A] !== undefined) {
    return byGraft[this.core.purchased.A];
  }
  return Bullet.BASE_SPEED_ULPS;
};

LongshotTower.prototype.predictedPosition = function (enemy) {
  var dx = enemy.pos.x - this.x;
  var dy = enemy.pos.y - this.y;
  var flightSeconds = Math.sqrt(dx * dx + dy * dy) / ul(this.shotSpeedUlps());
  // A tower beside one entrance may target a body on another entrance; predict
  // along the enemy's own route, not the route nearest the tower.
  return enemy.path.pointAt(enemy.progress + ul(enemy.speedUlps) * flightSeconds);
};

// The footprint is the physical extent, the collision radius AND the click
// target. Shared with the gunner rather than reimplemented -- three copies of
// one rule is three places for it to stop agreeing. (Loads after js/tower.js
// in both index.html and sandbox.html, which is what makes this legal.)
LongshotTower.prototype.containsPoint = Tower.prototype.containsPoint;

// What this tower hits for, and how often. The EFFECTIVE rate, not the
// resolved stat: A5's kill stacks are a live multiplier on it, and a panel
// showing the base figure would say this tower had not sped up when it had.
LongshotTower.prototype.attackDamage = function () { return this.core.stats.damage; };
LongshotTower.prototype.attacksPerSecond = function () { return this.core.effectiveFireRate(); };

// Rows for the inspection panel. Derived from the resolved stats every time,
// never stored, so a displayed number cannot drift from the real one, and the
// shared rows come from TowerStats so this tower cannot spell them its own
// way (it used to say "Fire rate" where the gunner said "Cooldown").
LongshotTower.prototype.statLines = function () {
  var s = this.core.stats;
  var rows = TowerStats.totals(this).concat([
    ["Path A/B", this.core.purchased.A + " / " + this.core.purchased.B],
    TowerStats.damage(this),
    TowerStats.range(this),
    TowerStats.attackSpeed(this)
  ]);

  if (s.targetShape === "cone") {
    rows.push(["Cone", s.coneArcDeg + "°"]);
  } else if (s.deadzone > 0) {
    rows.push(["Deadzone", TowerStats.distance(s.deadzone)]);
  }

  if (s.pierce > 0) {
    rows.push(["Pierce", TowerStats.number(s.pierce)]);
  }
  if (s.critChance > 0) {
    rows.push(["Crit", s.critChance + "% / " + s.critDamage + "%"]);
  }

  rows.push(["HP", Math.round(this.core.currentHp) + " / " + Math.round(this.core.maxHp)]);
  rows.push(TowerStats.dpsRow(this));
  return rows;
};

// --- drawing ---------------------------------------------------------------

LongshotTower.prototype.draw = function (ctx) {
  if (VisualModels.draw("tower", LongshotTower.ID + ":complete", ctx, this)) return;
  var s = this.core.stats;

  // Reach, only while selected -- see the note on Tower.prototype.draw. This
  // one matters most of the four: a 250 u.l. circle is a quarter of the map,
  // and two of them left almost nothing visible underneath.
  if (this.showRange) {
    if (s.targetShape === "cone") {
      var halfArc = (s.coneArcDeg * Math.PI / 180) / 2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.arc(this.x, this.y, this.rangePx, this.core.aimRad - halfArc, this.core.aimRad + halfArc);
      ctx.closePath();
      ctx.fillStyle = "rgba(178,150,255,0.10)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(178,150,255,0.55)";
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.rangePx, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(178,150,255,0.06)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(178,150,255,0.45)";
      ctx.stroke();
    }
  }

  // How far up path A this construct is, 0 -> 1. Derived from the resolved
  // DAMAGE and PIERCE rather than from which tiers are ticked, so a crosspathed
  // tower is drawn honestly and a future retune of the table moves the artwork
  // with it. Base damage is 10; full A takes it well past 60.
  var potency = Math.max(0, Math.min(1,
    ((s.damage - LongshotTower.CONFIG.base.damage) / 55) + (s.pierce || 0) * 0.06));

  // A magical SIGHT, drawn whenever camo detection is live. Two counter-set
  // reticle arcs and four tick marks around the construct, so a sniper that can
  // see the invisible is obvious on the board without opening its panel. Keyed
  // off the flag, not off a tier: whatever grants detection lights this up.
  if (s.flags.camoDetection) {
    var spin = this.aim * 0.5;
    var reticle = this.footprintPx + 6;

    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(150,205,255,0.75)";
    for (var q = 0; q < 2; q++) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, reticle, spin + q * Math.PI,
        spin + q * Math.PI + Math.PI * 0.62);
      ctx.stroke();
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(180,225,255,0.55)";
    for (var m = 0; m < 4; m++) {
      var ma = -spin + m * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(this.x + Math.cos(ma) * (reticle + 2),
        this.y + Math.sin(ma) * (reticle + 2));
      ctx.lineTo(this.x + Math.cos(ma) * (reticle + 6),
        this.y + Math.sin(ma) * (reticle + 6));
      ctx.stroke();
    }
  }

  if (!VisualModels.draw("tower", LongshotTower.ID + ":body", ctx, this,
      { stats: s, potency: potency })) {
  // The cannon: a tall, tapered channel of focused mana rather than a barrel.
  // Drawn as three stacked strokes -- a wide outer bloom, the shaft, and a
  // white-hot core -- all brightening and thickening with `potency`, which is
  // what path A buys.
  var reach = this.footprintPx * 1.9;
  var anchorY = this.y - 11;
  var mx = this.x + Math.cos(this.aim) * reach;
  var my = anchorY + Math.sin(this.aim) * reach * 0.78;

  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(this.x, anchorY);
  ctx.lineTo(mx, my);
  ctx.lineWidth = 10 + 5 * potency;
  ctx.strokeStyle = "rgba(150,120,255," + (0.14 + 0.16 * potency).toFixed(3) + ")";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(this.x, anchorY);
  ctx.lineTo(mx, my);
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(186,164,255," + (0.75 + 0.25 * potency).toFixed(3) + ")";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(this.x, anchorY);
  ctx.lineTo(mx, my);
  ctx.lineWidth = 1.6 + 1.4 * potency;
  ctx.strokeStyle = "rgba(238,232,255," + (0.7 + 0.3 * potency).toFixed(3) + ")";
  ctx.stroke();

  // The muzzle rune at the cannon's mouth, brighter the more potent the tower.
  ctx.beginPath();
  ctx.arc(mx, my, 3 + 2.5 * potency, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(226,214,255," + (0.55 + 0.4 * potency).toFixed(3) + ")";
  ctx.fill();

  // Raised obsidian plinth and vertical focus crystal. The crystal is what
  // makes the cannon read as a tall construct instead of a line painted on
  // the ground.
  var plinth = Visuals3Q.platform(ctx, this.x, this.y, this.footprintPx, {
    height: 8,
    top: "#30294d",
    side: "#171329",
    rim: "#a797f2",
    highlight: "rgba(232,224,255,0.42)"
  });
  Visuals3Q.crystal(ctx, this.x, plinth.y - 1,
    5 + 2 * potency, 14 + 7 * potency, {
      main: "rgba(174,151,255,0.92)",
      light: "rgba(241,235,255,0.52)",
      rim: "rgba(244,240,255,0.88)"
    });

  // Three floating shards ringing the construct -- the "sleek magical" read,
  // and the cheapest way to say "this thing is tall" from directly above. They
  // orbit with the aim, so the whole construct turns as one piece.
  ctx.fillStyle = "rgba(196,180,255,0.9)";
  for (var k = 0; k < 3; k++) {
    var ka = this.aim + Math.PI + (k - 1) * 0.75;
    var kd = this.footprintPx * 0.72;
    ctx.save();
    ctx.translate(this.x + Math.cos(ka) * kd,
      plinth.y + Math.sin(ka) * kd * Visuals3Q.GROUND_SQUASH - 2);
    ctx.rotate(ka);
    ctx.beginPath();
    ctx.moveTo(3.5, 0);
    ctx.lineTo(0, -2.2);
    ctx.lineTo(-3.5, 0);
    ctx.lineTo(0, 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // The focusing core.
  ctx.beginPath();
  ctx.ellipse(this.x, plinth.y - 1, this.footprintPx * 0.35,
    this.footprintPx * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(214,204,255," + (0.75 + 0.25 * potency).toFixed(3) + ")";
  ctx.fill();
  }

  // Reloading / stunned readouts. Cosmetic pixel offsets only.
  if (this.core.stunTimer > 0) {
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "#ff9d9d";
    ctx.textAlign = "center";
    ctx.fillText("STUNNED " + this.core.stunTimer.toFixed(1) + "s", this.x, this.y - this.footprintPx - 18);
    ctx.textAlign = "left";
  } else if (this.core.stats.flags.reload && this.core.reload.reloading) {
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,215,110,0.9)";
    ctx.textAlign = "center";
    ctx.fillText("reloading", this.x, this.y - this.footprintPx - 18);
    ctx.textAlign = "left";
  }
};

// Build bar icon. Pixel-sized on purpose: interface chrome must NOT scale
// with UNIT_LENGTH -- same rule as the gunner's icon.
LongshotTower.drawIcon = function (ctx, cx, cy, size) {
  if (VisualModels.draw("tower", LongshotTower.ID + ":icon", ctx,
      { cx: cx, cy: cy, size: size, type: LongshotTower })) return;
  // Mana cannon: bloom, shaft, core -- the same three strokes the real tower
  // draws, pointing up to match its default aim.
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - size * 1.05);
  ctx.lineWidth = Math.max(4, size * 0.3);
  ctx.strokeStyle = "rgba(150,120,255,0.25)";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - size * 1.05);
  ctx.lineWidth = Math.max(2, size * 0.16);
  ctx.strokeStyle = "#baa4ff";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - size * 1.05);
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.strokeStyle = "#eee8ff";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = "#241f3c";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#9d8cf0";
  ctx.stroke();

  // Two of the floating shards, at the sides where they read at icon size.
  ctx.fillStyle = "rgba(196,180,255,0.9)";
  for (var k = 0; k < 2; k++) {
    var sx = cx + (k ? 1 : -1) * size * 0.36;
    ctx.beginPath();
    ctx.moveTo(sx, cy + size * 0.14);
    ctx.lineTo(sx + size * 0.1, cy + size * 0.3);
    ctx.lineTo(sx, cy + size * 0.46);
    ctx.lineTo(sx - size * 0.1, cy + size * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "#d6ccff";
  ctx.fill();
};
