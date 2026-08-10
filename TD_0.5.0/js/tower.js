// ---------------------------------------------------------------------------
// Tower -- the gunner. **NO LONGER A TOWER YOU CAN BUILD.**
//
// Deleted from the game on 2026-07-30 at the owner's instruction ("delete the
// gunner"). It is not in the meta catalogue, so it is not in the build bar, the
// starting kit, the armoury, the index or the sandbox roster. There is no way
// for a player to place one, and `Tower.COST` is no longer a price anything
// charges.
//
// **THE FILE IS STILL LOADED, ON PURPOSE, and here is the whole list of what
// still reads it.** All three are structural rather than gameplay, which is why
// deleting the file would be churn rather than progress:
//
//   Smasher.FOOTPRINT_RADIUS_UL = Tower.FOOTPRINT_RADIUS_UL   (js/smasher.js)
//   Soldier.FOOTPRINT_RADIUS_UL = Tower.FOOTPRINT_RADIUS_UL   (js/soldier.js)
//   Smasher/Soldier.prototype.containsPoint = Tower.prototype.containsPoint
//
// That is one constant and one four-line function, shared so that two tower
// types cannot disagree about how big they are or where you have to click to
// select them. Moving them into a new file would create a file whose entire
// contents are 11.25 and a distance check.
//
// **It also remains the 100 u.l. REFERENCE TOWER the whole distance system is
// anchored to** (see js/units.js). That anchor is a yardstick in a document,
// not a thing the code reads -- and the Rifleman is 100 u.l. with the
// same footprint, so the reference survives the deletion intact. `js/maps.js`
// measures route difficulty against the Rifleman since this deletion, which is
// the same measurement it always made: identical range, identical clearance,
// identical numbers.
//
// So: do not add it back to the catalogue, and do not "tidy up" by deleting the
// file until the three lines above have somewhere else to live.
//
// What it was: targets the enemy furthest along the path within range ("first"
// targeting, the genre default) and fires one bullet per second.
// ---------------------------------------------------------------------------

function Tower(x, y, path) {
  this.x = x;
  this.y = y;

  // How far along the path this tower sits. Towers claim targets in this
  // order, so the gunner an enemy walks past FIRST gets first refusal on it.
  this.pathProgress = path.progressAtPoint(x, y);

  this.name = Tower.DISPLAY_NAME;
  // Copied onto the instance so selling refunds what THIS tower cost, even if
  // Tower.COST is retuned later or a discount is ever applied at build time.
  //
  // `cost` is the purchase price and never moves; `totalSpent` is everything
  // sunk into this tower, which for a gunner is the same number because it has
  // no upgrades. Every tower type carries both, spelled the same way, so
  // sellValue() in game.js has one field to read rather than a fallback chain
  // -- the smasher used to grow its `cost` while the beam grew a separate
  // total and the Longshot grew neither, so upgrading a Longshot refunded
  // nothing at all.
  this.cost = Tower.COST;
  this.totalSpent = Tower.COST;
  this.rangeUl = Tower.BASE_RANGE_UL;
  this.damage = Tower.BASE_DAMAGE;
  this.fireRate = Tower.BASE_FIRE_RATE;
  this.footprintRadiusUl = Tower.FOOTPRINT_RADIUS_UL;

  // ul() converts once, here, at construction -- see js/units.js. rangePx/
  // footprintPx are the tower's cached world-space values; everything that
  // compares distances against them (findTarget, containsPoint, placement)
  // stays in that same world space rather than re-deriving u.l. per check.
  this.rangePx = ul(this.rangeUl);
  this.footprintPx = ul(this.footprintRadiusUl);
  this.cooldown = 0;
  this.aim = -Math.PI / 2;

  // Which enemy to shoot when several are in range. "first" -- furthest along
  // the path -- is the genre default and what this tower has always done.
  this.targeting = "first";

  // No camo detection, and no way to buy any: the gunner has no upgrades. A
  // board of gunners simply cannot answer a camo wave, which is the whole
  // point of the camo types added in v0.4.5 -- detection is the Longshot's A1
  // and the beam's B1. Spelled the same way every tower spells it, so
  // Targeting.sees has one field to read.
  this.seesCamo = false;

  // Hit points. Meaningless until v0.4.5, when the Angry enemy started
  // swinging back -- see js/systems/tower-health.js for the shared contract
  // and why it lives in one module.
  TowerHealth.init(this, Tower.BASE_HP);

  // Whether to draw the range circle. Set by the renderer each frame from
  // what the player has selected; false here so a tower is quiet by default.
  // See the note on draw().
  this.showRange = false;

  // damageDealt and kills, kept by the shared scorer so every tower type
  // counts them the same way. Overkill is excluded: Enemy.takeDamage reports
  // what it really absorbed, which is also what the player was paid for, so
  // these numbers and the cash earned agree.
  TowerScore.init(this);
}

// Shown in the build bar and the inspection panel.
//
// DELIBERATELY NOT RESKINNED (2026-07-30). The robot fantasy/magic pass renamed
// and redrew the other four towers; the owner's instruction for this one was
// "delete this tower, but it stays in code as a placeholder for now". So it
// keeps its name and its artwork and is the one tower on the board that still
// looks like the old game -- which is the correct signal for a unit on its way
// out. Nothing was removed: it is still in BUILD_SLOTS, still in the meta
// catalogue as a starter, still the reference tower every distance in
// js/units.js is anchored to, and every test that leans on it still passes.
// When it does go, that is a mechanics change and needs its own decision.
Tower.DISPLAY_NAME = "Gunner";

Tower.BASE_RANGE_UL = 100;   // u.l. -- the reference tower (see js/units.js)
Tower.BASE_DAMAGE = 1;
Tower.BASE_FIRE_RATE = 1;    // shots per second

// Hit points. 60 is exactly three swings from an Angry enemy (20 each), which
// is the number that makes the threat legible: you get to watch it happen and
// you have time to do something about it. The cheapest tower is also the
// squishiest, so losing one is a $15 lesson rather than a disaster.
Tower.BASE_HP = 60;

// Stable id for the meta catalogue and for save data. See js/meta.js -- these
// strings are a PERSISTENCE FORMAT, so renaming one un-owns the tower for
// every existing player.
Tower.ID = "gunner";

// The physical space a gunner occupies, as a radius in u.l. Two gunners
// may not be placed closer than twice this, and a gunner may not be placed
// closer than this to the edge of the road. The visible base is drawn as a
// square inscribed in this circle, so what you see is exactly what collides.
Tower.FOOTPRINT_RADIUS_UL = 11.25;

// Legacy gunner placement cost. The gunner is no longer in the build bar; this
// remains for old tests and shared construction code. The live Easy stake is
// $600 and the cheapest shipping tower is the $300 Rifleman.
Tower.COST = 100;


// The game loop updates towers in path order (see addTower in game.js), which
// makes that loop the firing priority: an earlier tower claims its target
// before a later one looks, so the later one sees the claim and moves on.
//
// A tower with nothing left to shoot at HOLDS FIRE rather than dumping a
// bullet into an enemy that is already dead on arrival. Cooldown keeps
// ticking while it waits, so holding costs nothing -- it fires the instant a
// real target appears.
Tower.prototype.update = function (dt, enemies, bullets) {
  // Clamped so a tower that waits a long time does not build up a negative
  // cooldown and then fire a burst when a target finally shows up.
  if (this.cooldown > 0) this.cooldown -= dt;

  var target = this.findTarget(enemies);
  if (!target) return 0;

  this.aim = Math.atan2(target.pos.y - this.y, target.pos.x - this.x);

  if (this.cooldown <= 0) {
    this.fire(target, bullets);
    this.cooldown = 1 / this.fireRate;
  }

  // A gunner lands no damage itself -- its damage arrives later, when a
  // Bullet hits. Every tower's update returns what it landed directly, so the
  // loop can bank cash without knowing which kind it is holding.
  return 0;
};

// The in-range enemy this gunner should shoot, honouring its targeting mode.
// `true` keeps the claim rule: an enemy that bullets already in flight will
// kill is skipped, so no bullet is spent on a corpse.
Tower.prototype.findTarget = function (enemies) {
  return Targeting.pick(this, enemies, true);
};

// Did the player click on this tower? The footprint is the tower's physical
// extent, so it is also its hit box -- one radius, no second magic number.
Tower.prototype.containsPoint = function (x, y) {
  var dx = x - this.x;
  var dy = y - this.y;
  return dx * dx + dy * dy <= this.footprintPx * this.footprintPx;
};

// What this tower hits for, and how often. The two accessors every tower type
// answers -- see js/systems/tower-stats.js for why they exist and why the
// panel rows are built from them rather than from each tower's own fields.
//
// The gunner STORES shots per second, so its conversion is the identity one.
Tower.prototype.attackDamage = function () { return this.damage; };
Tower.prototype.attacksPerSecond = function () { return this.fireRate; };

// Rows for the inspection panel. Every shared row is built by TowerStats from
// the two accessors above -- so the damage, the rate and the DPS on screen
// always multiply out, and a gunner cannot describe itself in words a smasher
// would not use.
//
// No "Target" row: the targeting button directly beneath these rows already
// reads "Target: first", and one number printed twice in one panel is how the
// map ended up with three copies of the range label (see the 2026-07-27 entry
// in AGENTS.md).
Tower.prototype.statLines = function () {
  return TowerStats.totals(this).concat([
    TowerStats.damage(this),
    TowerStats.range(this),
    TowerStats.attackSpeed(this),
    ["Tower HP", TowerHealth.label(this)],
    TowerStats.dpsRow(this)
  ]);
};

Tower.prototype.fire = function (target, bullets) {
  var muzzleX = this.x + Math.cos(this.aim) * 16;
  var muzzleY = this.y + Math.sin(this.aim) * 16;

  // The owner reference is what credits the damage and the kill to this
  // tower's panel. It is used for NOTHING else -- selling a tower still
  // leaves its bullets in the air, still homing and still paying out.
  bullets.push(new Bullet(muzzleX, muzzleY, target, this.damage, null, this));
};

// Damage from an Angry enemy. Delegated so all four tower types absorb a hit
// identically -- see js/systems/tower-health.js.
Tower.prototype.takeDamage = function (amount) {
  return TowerHealth.damage(this, amount);
};

Tower.prototype.isDestroyed = function () {
  return TowerHealth.isDestroyed(this);
};

Tower.prototype.draw = function (ctx) {
  if (VisualModels.draw("tower", Tower.ID + ":complete", ctx, this)) return;
  // Range indicator -- ONLY while this tower is selected (2026-07-29, at the
  // owner's request). Every tower used to draw its own circle all the time,
  // and a board of thirty of them was a fog of overlapping rings that hid the
  // road underneath. The renderer sets `showRange`; nothing here decides it,
  // so the sandbox's own overlay and the game agree about when a circle is
  // meaningful: when you have asked about that tower.
  if (this.showRange) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.rangePx, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(140,199,255,0.07)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(140,199,255,0.5)";
    ctx.stroke();
  }

  if (!VisualModels.draw("tower", Tower.ID + ":body", ctx, this)) {
  var pad = Visuals3Q.platform(ctx, this.x, this.y, this.footprintPx, {
    height: 6,
    top: "#526b91",
    side: "#27354d",
    rim: "#a8c9f0",
    highlight: "rgba(235,246,255,0.36)"
  });

  // Barrel
  ctx.beginPath();
  ctx.moveTo(this.x, pad.y - 2);
  ctx.lineTo(this.x + Math.cos(this.aim) * 20,
    pad.y - 2 + Math.sin(this.aim) * 16);
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#b8c7e0";
  ctx.stroke();

  // Muzzle flash, DERIVED from the cooldown rather than stored: firing sets
  // cooldown to 1/fireRate, so how long ago the last shot left is the gap
  // between the two. A holding tower's cooldown sits at ~0, which reads as
  // "fired long ago" -- no flash, correctly. Cosmetic only; no state, no
  // timers, nothing for update() to carry.
  var sinceShot = 1 / this.fireRate - this.cooldown;
  if (sinceShot >= 0 && sinceShot < 0.09) {
    var glow = 1 - sinceShot / 0.09;
    ctx.beginPath();
    ctx.arc(this.x + Math.cos(this.aim) * 22,
      pad.y - 2 + Math.sin(this.aim) * 17,
      3 + 5 * glow, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,224,140," + (0.7 * glow).toFixed(3) + ")";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.ellipse(this.x, pad.y - 2, 6, 3.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#adccf2";
  ctx.fill();
  }
};

// A miniature gunner for the build bar. Sized in pixels on purpose: this is
// interface chrome, not something standing on the map, so it must NOT scale
// with UNIT_LENGTH the way the real tower does.
Tower.drawIcon = function (ctx, cx, cy, size) {
  if (VisualModels.draw("tower", Tower.ID + ":icon", ctx,
      { cx: cx, cy: cy, size: size, type: Tower })) return;
  var half = size / 2;

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - size * 0.8);
  ctx.lineWidth = Math.max(3, size * 0.22);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#b8c7e0";
  ctx.stroke();

  ctx.fillStyle = "#475c80";
  ctx.fillRect(cx - half, cy - half, size, size);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#8cb3e6";
  ctx.strokeRect(cx - half, cy - half, size, size);

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = "#adccf2";
  ctx.fill();
};
