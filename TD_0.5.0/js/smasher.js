// ---------------------------------------------------------------------------
// Smasher -- the WARBRINGER
//
// The CONSTRUCTOR is still called Smasher and the save id is still "smasher"
// (2026-07-30, the robot fantasy/magic reskin). `Smasher.ID` is a PERSISTENCE
// FORMAT and js/meta.js looks the constructor up by the global name "Smasher",
// so both of those had to stay; DISPLAY_NAME is the only string here that is
// purely cosmetic, so it is the only one that moved. Same rule as the
// Rifleman -- see the note at the top of js/soldier.js.
//
// A melee AOE tower. It stands off the road like a gunner, does not block
// enemies, and on each swing hits EVERY enemy inside its zone at once.
// Damage is instant at the moment of the swing -- there is no projectile, so
// unlike the gunner it never reserves damage and never wastes a shot.
//
// Two upgrade branches, A (reach and raw damage) and B (speed and slows). All
// stats are DERIVED from which upgrade flags are set, in recalcStats(), so
// there is exactly one place where a number turns into a stat and no level can
// drift from the table it came from.
// ---------------------------------------------------------------------------

function Smasher(x, y, path) {
  this.x = x;
  this.y = y;

  // HOW HIGH THE GROUND UNDER IT IS, read once, at construction. Zero on dirt.
  // This one number is the whole of elevation: RangeFilter reads it to decide
  // what this tower can see over, bullet.js reads it to decide what its rounds
  // fly over, and elevatedRangePx reads it for the reach bonus.
  this.groundHeight = groundHeightUnder(x, y);

  // Firing priority along the path, same rule as the gunner.
  this.pathProgress = path.progressAtPoint(x, y);

  this.name = Smasher.DISPLAY_NAME;
  // `cost` is the purchase price and never moves. `totalSpent` is everything
  // sunk in -- the price plus every upgrade -- and is what a sale refunds half
  // of. Both spelled exactly as every other tower spells them; this used to
  // grow `cost` itself, which meant "cost" meant the build price on a gunner
  // and the running total on a smasher.
  this.cost = Smasher.COST;
  this.totalSpent = Smasher.COST;

  // Deliberately the gunner's footprint, so tower-to-tower spacing and the
  // click target behave identically for both types.
  this.footprintRadiusUl = Smasher.FOOTPRINT_RADIUS_UL;
  this.footprintPx = ul(this.footprintRadiusUl);

  // Upgrade flags. Listed explicitly rather than built from the table so that
  // reading the constructor tells you the whole state of a Smasher.
  this.hasA1 = false;
  this.hasA2 = false;
  this.hasA3 = false;
  this.hasA4 = false;
  this.hasA5 = false;
  this.hasB1 = false;
  this.hasB2 = false;
  this.hasB3 = false;
  this.hasB4 = false;
  this.hasB5 = false;

  this.aim = -Math.PI / 2;
  this.cooldown = 0;
  // Seconds left before the hammer lands. Non-zero ONLY while a blow is in the
  // air; see the wind-up note in update().
  this.windup = 0;

  // Which enemy the wedge turns towards. "first" is the default for every
  // tower type, so a freshly placed board behaves consistently; "nearest" --
  // the Smasher's originally specified facing -- is still one cycle away.
  this.targeting = "first";

  // No camo detection and no upgrade that grants it -- same as the gunner.
  // See Targeting.sees and the camo types in js/enemy.js.
  this.seesCamo = false;

  // Hit points, and whether to paint the damage zone. Both shared vocabulary
  // -- see js/systems/tower-health.js and the note on draw().
  TowerHealth.init(this, Smasher.BASE_HP);
  this.showRange = false;

  TowerScore.init(this);

  // Purely cosmetic: where recent B4 explosions went off, so they can be drawn
  // fading out. Never read by the simulation.
  this.blasts = [];

  // Also purely cosmetic, and for the same reason the blasts are: the swing
  // animation itself is DERIVED from the cooldown (see swingProgress), but the
  // AFTERMATH of a slam happens once the cooldown has been reset to full, so
  // there is nothing left to derive it from. These two are the only frames of
  // animation state this tower carries, they are written in swing() and decayed
  // in fadeBlasts(), and update() never reads either back.
  //
  //   slam    1 -> 0 over ~0.4 s: the shockwave rolling out through the wedge
  //   weight  1 -> 0 over ~1.4 s: path B's lingering magical weight, left on
  //           the ground only by a Warbringer that actually has a slow
  this.slam = 0;
  this.weight = 0;

  // Path A turns the ordinary impact into a staged forge-slam. The wind-up is
  // still derived from cooldown; this is only the short-lived fracture left
  // AFTER the hammer lands, when cooldown no longer identifies the impact
  // angle. It stores presentation geometry, never gameplay state.
  this.pathAImpact = null;

  // B5's earthquake. The cooldown is REAL state the simulation reads (see
  // triggerQuake); `hop` and `quakeFlash` beside it are the two cosmetic
  // frames it leaves behind, decayed in fadeBlasts and read only by draw().
  //
  // Starts at ZERO, so a Warbringer that has just bought B5 can use it
  // immediately -- the tower is the purchase, and making an $800 tier wait 20
  // seconds to prove it exists is a worse first impression than it is a
  // balance lever.
  this.quakeCooldown = 0;
  this.hop = 0;
  this.quakeFlash = 0;

  this.recalcStats();
}


// Cosmetic only -- see the note at the top of this file for why the id and the
// constructor name did NOT follow it.
Smasher.DISPLAY_NAME = "Warbringer";
// $600 SINCE 2026-08-26, from $700, and the three lines under it moved with it.
// The Warbringer stopped being in the opening hand in the same change -- it is
// a 10-coin store purchase gated on reaching wave 11 -- so the body has to be
// worth buying on the run you unlock it, not merely worth owning. Cheaper to
// place, quicker to swing, and it reaches the road from further back.
Smasher.COST = 600;

// THE BODY AS PLACED WAS RAISED ON 2026-08-27, at the owner's instruction:
// "il est trop faible, il n'aide pas assez". The build price did NOT move --
// that was explicit -- so what a Warbringer costs to put down buys more than it
// did, and the first four tiers pay $50 more each for what they now carry (see
// the table).
//
// 12 -> 14 damage, 3.5 -> 3.2 seconds a swing: 3.43 DPS as placed becomes 4.38,
// a 28% rise on the one number that decides whether the tower is worth the slot
// before any upgrade is bought at all.
Smasher.BASE_DAMAGE = 14;            // 12 until 2026-08-27
Smasher.BASE_COOLDOWN = 3.2;         // seconds between swings; 4.0, then 3.5
// 40 u.l. since 2026-08-27, 37.5 since 2026-08-26, from 31.25.
//
// **RAISING THIS KILLS ANY `rangeUl` AT OR BELOW IT**, because that column is
// resolved as "the LONGEST owned value wins". It has already happened once: the
// 2026-08-26 rise to 37.5 met A1's own 37.5 and left that tier selling no reach
// at all, silently. A1's absolute is gone now and the first two tiers sell their
// reach through `rangeBonusUl` instead, which is added AFTER the max and so
// cannot be swallowed by a base rise. Check this column against the base before
// moving either.
Smasher.BASE_RANGE_UL = 40.00;
Smasher.BASE_ARC_DEGREES = 120;

// Same as the gunner's on purpose -- see the constructor.
Smasher.FOOTPRINT_RADIUS_UL = Tower.FOOTPRINT_RADIUS_UL;

// Hit points AS PLACED. It is the melee tower, it stands where the enemies
// are, and losing a $700 body hurts: eight swings from an Angry enemy.
//
// It is no longer where the tower STAYS. Since 2026-08-01 every tier carries
// an `hp` delta, so a finished Warbringer stands on 575 (path A) or 700
// (path B) -- see the note on the upgrade table.
Smasher.BASE_HP = 150;

// Stable id for the meta catalogue and save data. See js/meta.js.
Smasher.ID = "smasher";

// The swing animation is cosmetic. It occupies the last SWING_SECONDS of the
// cooldown and damage lands as it finishes, i.e. exactly when the cooldown
// ends. Nothing in the simulation reads this -- see swingProgress().
Smasher.SWING_SECONDS = 0.2;

// Path A is the deliberate heavy-hammer branch. Give its cosmetic wind-up
// enough time to show several readable overhead poses without changing the
// moment damage lands. The base/B animation stays at the original 0.2 s.
Smasher.PATH_A_SWING_SECONDS = 0.48;
Smasher.PATH_A_ECHO_COUNT = 3;
Smasher.PATH_A_CRACK_SECONDS = 1.6;

// The animation window is drawn as three beats: the hammer RISES, HOLDS at the
// top, then SLAMS down into the impact at progress 1. Written as fractions of
// swingProgress() rather than as seconds, so both the base/B 0.2 s window and
// Path A's 0.48 s window share one shape without changing attack timing. At
// 0.2 s the rise is 0.15 s, the hold 0.03 s and the slam 0.02 s.
//
// swingProgress() itself is UNTOUCHED and still lands damage at exactly 1 --
// these only decide where the head is drawn on the way there.
Smasher.SWING_RAISE_END = 0.75;
Smasher.SWING_HOLD_END = 0.90;

// B4: an enemy killed while already slowed bursts, hitting its neighbours.
//
// **15, up from 3, and it CHAINS since 2026-07-30**, at the owner's request:
// "to all levels, the blast on kill does 15 damage. if another enemy dies to
// the blast, that enemy also explodes for 15 damage. the goal is to create a
// chain reaction."
//
// "All levels" is why this is one constant rather than a per-tier figure: B4
// and B5 both burst for the same 15, so a Warbringer's blast never needs
// looking up. See explode() for what stops a chain running forever.
Smasher.EXPLOSION_DAMAGE = 15;
Smasher.EXPLOSION_RADIUS_UL = 18.75; // 1.5 m under the old scale

// --- B5: THE EARTHQUAKE ----------------------------------------------------
//
// The owner's spec, 2026-07-30: "he jumps and causes a 3 seconds stun on the
// entire map causing enemies to stop moving. followed the 3 seconds, all
// enemies on the map move 60% slower for the next 5 seconds."
//
// MAP-WIDE, with no radius at all. That is the whole character of it: every
// other thing this tower does is about a wedge of ground, and this one is
// about the clock. It is what a fifth-tier B Warbringer buys — path B has
// always been the tempo branch (faster swings, stronger slows), and an
// earthquake is that branch's argument taken to its conclusion.
Smasher.QUAKE_STUN_SECONDS = 3;
Smasher.QUAKE_SLOW = { strength: 0.6, seconds: 5 };

// **45 SECONDS, and this one IS the owner's number** (2026-07-30). It was 20 for
// a few hours -- a figure this file picked because the spec named no cooldown
// and a map-wide freeze with no gate is a button that ends the campaign -- and
// he raised it to 45 on review.
//
// 8 s of effect (3 stunned + 5 slowed) against 45 is about 18% uptime, down
// from 40%. That turns the earthquake from something you press whenever it is
// up into something you SAVE, which is a better shape for the only map-wide
// effect in the game.
Smasher.QUAKE_COOLDOWN_SECONDS = 45;

// The upgrade table, as data. recalcStats() folds these together, so adding a
// row here is the whole job of adding an upgrade.
//
//   damage        added to base damage; every owned upgrade contributes
//   hp            ADDITIVE hit points; every owned upgrade contributes
//   cooldown      absolute seconds; the FASTEST owned value wins
//   rangeUl       absolute u.l.;    the LONGEST owned value wins
//   rangeBonusUl  ADDITIVE u.l.;    every owned bonus is summed on top
//   slow          {strength, seconds}; the STRONGEST owned slow wins
//   quake         grants the B5 earthquake ability
//   locksPath     owning this shuts the other branch out of its tier-3+ upgrades
//   requires      the tier below it on the SAME branch; tiers are bought in order
//
// Ranges were authored in meters (3.0 .. 5.0) under the pre-u.l. scale and are
// x12.5 here, so the swing zone is exactly the size it was drawn to be.
//
// **`rangeBonusUl` is a SECOND range field and that is on purpose** (2026-07-30).
// Path A's numbers are absolute and the longest wins, which is right for a
// branch where every tier restates the reach. Path B was asked for "a +15 u.l.
// range increase" on B2, "+10" on B4 and "+15" on B5 — an INCREASE, which an
// absolute-max column cannot express: written as absolutes, a Warbringer that
// had already bought A2 (43.75) would get 2.5 u.l. out of B2's "+15" instead of
// 15. Summing a separate additive column is the only way "+15" means +15
// whatever else the tower owns. Path A is untouched and still absolute.
//
// **EVERY TIER CARRIES HP** since 2026-08-01, at the owner's instruction. The
// Warbringer had no health tier at all, which is a strange gap on the one
// tower whose whole job is to stand in the road: its 150 was the same at A5 as
// it was the moment it was placed. Path A takes it to 575, path B to 700 --
// path B is the branch that stands in the slow field it made, so it is the
// branch that gets to survive there.
//
// **PRICES WERE RESCALED** in the same pass, to the money-per-DPS band the
// Siphon and the Arcane Sniper set (see The economy in AGENTS.md). Those two
// cost roughly $70-$140 for every point of DPS a finished path makes; the
// Warbringer was selling a finished path for $2 525. Its damage is AREA
// damage, so the figure it is priced against is its EFFECTIVE output -- the
// swing lands on every body in the zone at once, and four is a fair count for
// a wave walking a road:
//
//   path A  $700 + $4 500 = $5 200 for 13 DPS x ~4 bodies = ~52   ($100 / DPS)
//   path B  $700 + $6 300 = $7 000 for 13.6 DPS x ~4 = ~54, plus a
//           65% slow, a blast on kill and the earthquake     (~$130 / DPS,
//           the premium being the utility the Siphon's own B path charges for)
//
// The BUILD price stays $700. It is the price of a body in the road, and it is
// what the early waves are shaped around.
//
// TACTICAL TIERS PAY A PREMIUM, which is the other half of the owner's
// instruction: A4 trebles the covered ground (120 degree arc -> full circle),
// B3 grants the slow outright, B4 adds the blast on kill, and B5 buys the only
// map-wide effect in the game. Each is priced above its damage delta alone.
Smasher.UPGRADES = [
  // A1, A2, B1 AND B2 EACH COST $50 MORE AND EACH CARRY MORE, 2026-08-27, at
  // the owner's instruction: "on va augmenter le prix de A1, A2, B1, B2 de
  // cinquante, et pour chacune de ces upgrades on va donner un petit boost de
  // range, attack speed et dégâts. Très peu, mais assez pour faire une
  // différence." The back halves of both paths are untouched -- what they
  // inherit is what the first two tiers now pass up the ladder.
  //
  // A1'S ABSOLUTE `rangeUl` IS GONE rather than raised. It was 37.50, which the
  // base met on 2026-08-26 and has now passed, so it could never win the max
  // again; a value that cannot win is a tier claiming to sell reach it does not
  // sell. Its five units are a `rangeBonusUl`, which is summed after the max and
  // therefore survives the next base rise as well as carrying up path A -- the
  // failure this replaces, made structural rather than remembered.
  { id: "A1", branch: "A", cost: 250, damage: 5,  hp: 30,  rangeBonusUl: 5,
    cooldown: 3.1 },
  // A2 KEEPS ITS ABSOLUTE, because 43.75 still beats the 40 base and still
  // reads as this tier restating the reach. The five on top is the boost.
  { id: "A2", branch: "A", cost: 400, damage: 6,  hp: 45,  rangeUl: 43.75,
    rangeBonusUl: 5, cooldown: 3.0, requires: "A1" },
  // A3/A4/A5 DAMAGE RAISED 2026-08-26: 7 -> 9, 10 -> 13, 14 -> 18. A1 and A2
  // are untouched, so the path's shape is the same and only its back half pays
  // more. Nothing else on path A moved -- not a cost, not a range, not the
  // arc, not the hit points.
  { id: "A3", branch: "A", cost: 600, damage: 9,  hp: 70,  rangeUl: 50.00, requires: "A2", locksPath: true },
  { id: "A4", branch: "A", cost: 1400, damage: 13, hp: 110, rangeUl: 56.25, requires: "A3", locksPath: true, fullCircle: true },
  { id: "A5", branch: "A", cost: 1950, damage: 18, hp: 170, rangeUl: 62.50, requires: "A4", locksPath: true, fullCircle: true },

  // B1 AND B2 CARRY DAMAGE NOW, one point each. Path B is still the tempo
  // branch and still sells its speed and its reach; a point of damage on each
  // of the first two tiers is the smallest step the table can express, and it
  // is what the owner asked for on all four.
  { id: "B1", branch: "B", cost: 250, damage: 1,  hp: 35,  cooldown: 2.9,
    rangeBonusUl: 5 },
  { id: "B2", branch: "B", cost: 450, damage: 1,  hp: 55,  cooldown: 2.1, requires: "B1", rangeBonusUl: 20 },
  { id: "B3", branch: "B", cost: 900, damage: 4,  hp: 90,  cooldown: 2.1, requires: "B2", locksPath: true,
    slow: { strength: 0.15, seconds: 2.0 } },
  { id: "B4", branch: "B", cost: 1900, damage: 6, hp: 140, cooldown: 2.1, requires: "B3", locksPath: true,
    rangeBonusUl: 10,
    slow: { strength: 0.40, seconds: 2.5 }, explodes: true },
  { id: "B5", branch: "B", cost: 2900, damage: 8, hp: 230, cooldown: 2.1, requires: "B4", locksPath: true,
    rangeBonusUl: 15,
    slow: { strength: 0.65, seconds: 3.0 }, quake: true }
];

Smasher.upgradeById = function (id) {
  for (var i = 0; i < Smasher.UPGRADES.length; i++) {
    if (Smasher.UPGRADES[i].id === id) return Smasher.UPGRADES[i];
  }
  return null;
};


// --- upgrades ---------------------------------------------------------------

Smasher.prototype.hasUpgrade = function (id) {
  return this["has" + id] === true;
};

// Every stat is rebuilt from the flags, so an upgrade can never leave a stale
// number behind and the order upgrades were bought in cannot matter.
Smasher.prototype.recalcStats = function () {
  this.damage = Smasher.BASE_DAMAGE;
  this.cooldownSeconds = Smasher.BASE_COOLDOWN;
  this.rangeUl = Smasher.BASE_RANGE_UL;
  this.arcDegrees = Smasher.BASE_ARC_DEGREES;
  this.slow = null;
  this.explodesOnKill = false;
  this.hasQuake = false;
  this.upgradeCount = 0;

  // THE CHAIN BLAST'S DAMAGE IS ON THE INSTANCE, not read off the constant at
  // the moment it detonates (2026-08-30). It is derived here like every other
  // number on this tower, which is what lets a permanent perk move it and what
  // makes the panel row below quote the blast the tower will actually deal
  // rather than the one the table was authored with. No tier moves it today.
  this.explosionDamage = Smasher.EXPLOSION_DAMAGE;

  // Summed separately from the absolute column and added AFTER the max, so a
  // "+15" is +15 on top of whatever reach the tower had -- see the note on
  // rangeBonusUl in the table.
  var rangeBonusUl = 0;

  // Health is DERIVED here like every other stat, rather than being pushed
  // into TowerHealth by whichever tier happened to grant it. That is what
  // makes previewUpgrade's set-flag-recalculate-diff trick report the right
  // number for a health tier, and what keeps the order upgrades were bought in
  // from mattering.
  var maxHp = Smasher.BASE_HP;

  for (var i = 0; i < Smasher.UPGRADES.length; i++) {
    var u = Smasher.UPGRADES[i];
    if (!this.hasUpgrade(u.id)) continue;

    this.upgradeCount++;
    this.damage += u.damage;

    if (u.cooldown !== undefined) {
      this.cooldownSeconds = Math.min(this.cooldownSeconds, u.cooldown);
    }
    if (u.rangeUl !== undefined) {
      this.rangeUl = Math.max(this.rangeUl, u.rangeUl);
    }
    if (u.rangeBonusUl !== undefined) rangeBonusUl += u.rangeBonusUl;
    if (u.hp !== undefined) maxHp += u.hp;
    if (u.fullCircle) this.arcDegrees = 360;
    if (u.slow && (this.slow === null || u.slow.strength > this.slow.strength)) {
      this.slow = u.slow;
    }
    if (u.explodes) this.explodesOnKill = true;
    if (u.quake) this.hasQuake = true;
  }

  this.rangeUl += rangeBonusUl;
  this.maxHp = maxHp;
  this.rangePx = elevatedRangePx(this, this.rangeUl);
  this.arcRadians = this.arcDegrees * Math.PI / 180;
  this.fullCircle = this.arcDegrees >= 360;

  // A FARM'S INVESTMENT, last: damage up, seconds per swing down. Range comes
  // through elevatedRangePx above, hit points are outside the bonus, and the
  // arc is a shape rather than a rate. See FarmBoost in js/farm.js.
  if (typeof FarmBoost !== "undefined") {
    var boost = FarmBoost.multiplier(this);
    if (boost !== 1) {
      this.damage *= boost;
      this.cooldownSeconds /= boost;
    }
  }
};

// Which branch this tower has committed to, or null if it is still open.
// Derived from the flags rather than stored, so it cannot disagree with them.
Smasher.prototype.lockedBranch = function () {
  for (var i = 0; i < Smasher.UPGRADES.length; i++) {
    var u = Smasher.UPGRADES[i];
    if (u.locksPath && this.hasUpgrade(u.id)) return u.branch;
  }
  return null;
};

// The next unbought upgrade on a branch, or null if the branch is finished.
// UPGRADES is listed in tier order, so this walks A1 -> A5 / B1 -> B5, which
// is also the order `requires` enforces -- the panel and the model agree.
Smasher.prototype.nextUpgrade = function (branch) {
  for (var i = 0; i < Smasher.UPGRADES.length; i++) {
    var u = Smasher.UPGRADES[i];
    if (u.branch === branch && !this.hasUpgrade(u.id)) return u;
  }
  return null;
};

Smasher.prototype.upgradeCost = function (id) {
  var u = Smasher.upgradeById(id);
  return u ? u.cost : 0;
};

// null if this upgrade may be bought, otherwise a short human-readable reason.
// Cash is NOT checked here -- that is the economy's business, in game.js.
Smasher.prototype.whyCannotUpgrade = function (id) {
  var u = Smasher.upgradeById(id);
  if (!u) return "no such upgrade";
  if (this.hasUpgrade(id)) return "already owned";

  // The path lock is checked FIRST because it is the permanent reason. Both it
  // and the missing prerequisite are usually true at once, and "path A already
  // chosen" tells the player something they cannot undo, where "needs B2" would
  // imply the branch is still reachable.
  //
  // A1/A2/B1/B2 have no locksPath, so they stay available on either branch.
  var locked = this.lockedBranch();
  if (u.locksPath && locked !== null && locked !== u.branch) {
    return "path " + locked + " already chosen";
  }

  // Tiers are climbed in order within a branch: A2 needs A1, A3 needs A2, and
  // so on. The two branches climb independently until the tier-3 lock.
  if (u.requires && !this.hasUpgrade(u.requires)) {
    return "needs " + u.requires;
  }
  return null;
};

// Snapshot of everything recalcStats() derives, for diffing an upgrade.
Smasher.prototype.statSnapshot = function () {
  return {
    damage: this.damage,
    cooldown: this.cooldownSeconds,
    rangeUl: this.rangeUl,
    maxHp: this.maxHp,
    arcDegrees: this.arcDegrees,
    fullCircle: this.fullCircle,
    slow: this.slow,
    explodes: this.explodesOnKill,
    explosionDamage: this.explosionDamage,
    quake: this.hasQuake
  };
};

// Both halves of "what would this upgrade do", from ONE measurement: the
// short phrases on the button, and the before/after rows in the hover card.
//
// Worked out by setting the flag, recalculating, and diffing -- NOT by reading
// the table. The table holds absolute values for range and cooldown (the
// longest and fastest owned win), so the printed change would be wrong for any
// upgrade whose value is already beaten by one you own. Deriving it from
// recalcStats() means the preview can never disagree with what you get.
Smasher.prototype.previewUpgrade = function (id) {
  if (!Smasher.upgradeById(id) || this.hasUpgrade(id)) {
    return { effects: [], changes: [], grants: [] };
  }

  var before = this.statSnapshot();
  this["has" + id] = true;
  this.recalcStats();
  var after = this.statSnapshot();
  this["has" + id] = false;
  this.recalcStats();

  // The numeric part is handed to the SAME formatter the config-driven towers
  // use, keyed by the same stat names, so "+0.08 atk/s" is spelled identically
  // whether it came from a delta table or from this diff.
  var deltas = {
    damage: after.damage - before.damage,
    range: after.rangeUl - before.rangeUl,
    fireRate: (1 / after.cooldown) - (1 / before.cooldown),
    hp: after.maxHp - before.maxHp
  };

  var changes = [];
  if (deltas.damage) {
    changes.push({ label: "Damage", from: TowerStats.number(before.damage),
      to: TowerStats.number(after.damage), delta: UpgradeEffects.signed(deltas.damage) });
  }
  if (deltas.range) {
    changes.push({ label: "Range", from: TowerStats.distance(before.rangeUl),
      to: TowerStats.distance(after.rangeUl), delta: UpgradeEffects.signed(deltas.range) });
  }
  if (deltas.fireRate) {
    changes.push({ label: "Attack speed", from: TowerStats.rate(1 / before.cooldown),
      to: TowerStats.rate(1 / after.cooldown), delta: UpgradeEffects.signed(deltas.fireRate) });
    // The seconds are what a player actually watches, so they are shown too --
    // "+0.12 atk/s" and "swings every 2.20 s instead of 3.00 s" are the same
    // fact, and only one of them is legible while a wave is walking past.
    changes.push({ label: "Swings every", from: before.cooldown.toFixed(2) + " s",
      to: after.cooldown.toFixed(2) + " s", delta: "" });
  }
  if (deltas.hp) {
    changes.push({ label: "Tower HP", from: String(before.maxHp),
      to: String(after.maxHp), delta: UpgradeEffects.signed(deltas.hp) });
  }
  if (after.arcDegrees !== before.arcDegrees) {
    changes.push({
      label: "Zone",
      from: before.arcDegrees + "° arc",
      to: after.fullCircle ? "full circle" : after.arcDegrees + "° arc",
      delta: ""
    });
  }
  if (after.slow !== before.slow) {
    changes.push({
      label: "Slow",
      from: before.slow ? Math.round(before.slow.strength * 100) + "%" : "none",
      to: Math.round(after.slow.strength * 100) + "% for " + after.slow.seconds.toFixed(1) + " s",
      delta: ""
    });
  }

  // DPS last, from the same shared formatter the config-driven towers use, so
  // the smasher's card spells the summary row exactly the way theirs do. The
  // snapshot stores seconds between swings, so the pair handed over is damage
  // and 1/cooldown -- the same conversion attacksPerSecond() makes for the
  // panel (see js/systems/tower-stats.js).
  var dps = UpgradeEffects.dpsChange(
    { damage: before.damage, fireRate: 1 / before.cooldown },
    { damage: after.damage, fireRate: 1 / after.cooldown }
  );
  if (dps) changes.push(dps);

  // Named mechanics, the same vocabulary the config towers grant them under --
  // so the hover card explains a smasher's blast in the same place and the
  // same words it explains a Longshot's pierce falloff.
  var grants = [];
  if (after.fullCircle && !before.fullCircle) grants.push("fullCircle");
  if (after.slow !== before.slow) grants.push("slow");
  if (after.explodes && !before.explodes) grants.push("explodeOnSlowedKill");
  if (after.quake && !before.quake) grants.push("earthquake");

  var effects = [];
  var numbers = UpgradeEffects.describe(deltas, []);
  if (numbers) effects.push(numbers);
  if (after.fullCircle && !before.fullCircle) effects.push("full circle");
  if (after.slow !== before.slow) {
    effects.push(Math.round(after.slow.strength * 100) + "% slow");
  }
  if (after.explodes && !before.explodes) effects.push("blast on kill");
  if (after.quake && !before.quake) effects.push("earthquake");

  return { effects: effects, changes: changes, grants: grants };
};

// The button's short phrases. Kept as its own method because that is what the
// panel and the tests ask for; it is a view of previewUpgrade, not a second
// measurement.
Smasher.prototype.upgradeEffects = function (id) {
  return this.previewUpgrade(id).effects;
};

// Set the flag and rebuild the stats. Assumes the purchase is already allowed
// and paid for -- go through buyUpgrade() in game.js instead of calling this.
Smasher.prototype.applyUpgrade = function (id) {
  var maxHpBefore = this.maxHp;

  this["has" + id] = true;
  this.totalSpent += this.upgradeCost(id);
  this.recalcStats();

  // A health tier GRANTS ITS DELTA rather than healing to the new maximum --
  // the same rule the Rifleman follows, and written out in full there. A
  // damaged Warbringer keeps its wound and gains the new points on top, so an
  // upgrade is never also a repair.
  if (this.maxHp > maxHpBefore) {
    this.currentHp = Math.min(this.maxHp, this.currentHp + (this.maxHp - maxHpBefore));
  }
};


// --- targeting and swinging -------------------------------------------------

// The enemy the wedge turns to face, which is how something outside the
// current arc gets brought into it. Honours the targeting mode; the default is
// "first", the same as the gunner's.
//
// `false` deliberately does NOT skip enemies with damage already claimed
// against them. Claims exist to stop a gunner wasting a bullet on a corpse;
// the smasher's damage is instant and hits everything in the zone, so it has
// no shot to waste and nothing to reserve.
Smasher.prototype.facingTarget = function (enemies) {
  return Targeting.pick(this, enemies, false);
};

// Damage from an Angry enemy -- see js/systems/tower-health.js.
Smasher.prototype.takeDamage = function (amount) {
  return TowerHealth.damage(this, amount);
};

Smasher.prototype.isDestroyed = function () {
  return TowerHealth.isDestroyed(this);
};

// Is this enemy inside the damage zone right now? PHYSICAL reach only -- no
// camo check (2026-07-29, at the owner's request).
//
// This used to refuse an undetected camo enemy, which made a swing already in
// progress pass harmlessly through one standing in the middle of the wedge.
// That contradicted the rule the rest of the game follows: camo blocks
// TARGETING, not incidental damage. A piercing shot hits whatever is on its
// line, B4's explosion (explode below) hits whatever is near the corpse, and
// the Longshot's B5 blast hits everything in its radius -- none of them ask
// whether it was visible, because they are all consequences of a blow that
// already landed rather than a choice of target.
//
// The choice is still made on visible enemies only, in two places that
// together are the whole rule: facingTarget picks who the wedge turns towards
// (through Targeting.pick, which honours camo), and update() refuses to spend
// a swing unless something VISIBLE is in the zone (see sightedIn below). So a
// smasher with no detection still cannot answer a camo wave on its own -- and
// since a wave names exactly one type, a camo wave puts nothing visible on the
// board to swing at, which is what keeps waves 13/16/26 the checks they are.
Smasher.prototype.covers = function (enemy) {
  if (enemy.dead || enemy.leaked) return false;

  var dx = enemy.pos.x - this.x;
  var dy = enemy.pos.y - this.y;
  if (dx * dx + dy * dy > this.rangePx * this.rangePx) return false;
  if (this.fullCircle) return true;

  var delta = Math.atan2(dy, dx) - this.aim;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta) <= this.arcRadians / 2;
};

// Can this tower SEE that enemy -- terrain, not detection?
//
// Kept separate from covers() on purpose, and that separation is the AoE rule.
// covers() answers "is this body inside the swing", which is a question about
// the ZONE and is what the blast is applied over; this answers "could the
// Warbringer have picked this body as its primary", which is a question about
// the line to it.
//
// So a boulder inside the wedge does not shield what is behind it from a swing
// that was legally started -- the hammer comes down on an area -- but the
// Warbringer cannot START a swing on a body it cannot see. That is the
// exception the brief names, and writing it as two functions is what keeps it
// from being a special case buried inside one.
Smasher.prototype.canSee = function (enemy) {
  if (typeof Targeting === "undefined" || !Targeting.hasSightTo) return true;
  return Targeting.hasSightTo(this, enemy);
};

Smasher.prototype.enemiesInZone = function (enemies) {
  var hits = [];
  for (var i = 0; i < enemies.length; i++) {
    if (this.covers(enemies[i])) hits.push(enemies[i]);
  }
  return hits;
};

// Is anything in this list something this tower can actually SEE? The trigger
// half of the rule described on covers(): the zone damages camo, but only a
// visible enemy is worth spending a swing on. Without this a detectionless
// smasher would flail at enemies it has no idea are there and clear a camo
// wave by accident.
Smasher.prototype.sightedIn = function (hits) {
  for (var i = 0; i < hits.length; i++) {
    if (Targeting.sees(this, hits[i]) && this.canSee(hits[i])) return true;
  }
  return false;
};

// How far through the swing animation, 0 -> 1, where 1 is the impact. Returns
// 0 when idle or on cooldown. DERIVED from the wind-up timer, never stored, so
// the animation physically cannot disagree with when damage lands: the frame
// that shows the hammer touching the ground IS the tick that resolves it.
//
// It used to read the COOLDOWN, which ran after the blow -- so the animation
// was a replay of a hit that had already happened, and the first blow of a
// tower's life had no animation at all because its cooldown started at zero.
Smasher.prototype.swingProgress = function () {
  if (!(this.windup > 0)) return 0;
  var duration = this.swingSeconds();
  if (!(duration > 0)) return 0;
  return Math.max(0, Math.min(1, 1 - this.windup / duration));
};

// Earlier overhead poses of a Path A hammer, oldest first. drawBody paints
// these as translucent frames behind the live head, making the swing readable
// even on a high-refresh display. Returned data is cosmetic only.
Smasher.prototype.hammerEchoProgresses = function (swing) {
  if (!this.hasA1 || swing <= 0) return [];

  var echoes = [];
  var gap = 0.14;
  for (var i = Smasher.PATH_A_ECHO_COUNT; i >= 1; i--) {
    var progress = swing - i * gap;
    if (progress > 0) echoes.push(progress);
  }
  return echoes;
};

// Returns the damage landed this step, which the main loop turns into cash --
// the same contract Bullet.update() has.
Smasher.prototype.update = function (dt, enemies, bullets) {
  this.fadeBlasts(dt);

  // Clamped like the gunner's, so a long wait cannot bank negative cooldown
  // and then let off a burst.
  if (this.cooldown > 0) this.cooldown -= dt;

  // The earthquake's cooldown runs on the same clock and with the same clamp.
  // Ticked even on a tower that does not have B5, which costs nothing and
  // means selling into a rebuild cannot leave a stale timer behind.
  if (this.quakeCooldown > 0) {
    this.quakeCooldown = Math.max(0, this.quakeCooldown - dt);
  }

  // B5 needs no second player input, so it follows the same shared AUTO rule
  // as the Sniper nuke and Rifleman recruits. The debug panel can therefore
  // turn it on without inventing a special background timer of its own.
  if (AutoAbility.isOn(this, "ability") && this.quakeReady()) {
    this.triggerQuake(enemies);
  }

  // Facing still tracks a target at A4+ even though a full circle ignores it.
  // Kept live rather than deleted so the rotation can be reused.
  var facing = this.facingTarget(enemies);
  if (facing) {
    this.aim = Math.atan2(facing.pos.y - this.y, facing.pos.x - this.x);
  }

  // THE HAMMER HAS TO GO UP BEFORE IT COMES DOWN.
  //
  // Until 2026-08-09 `attack()` applied damage the instant a target appeared,
  // then spent the cooldown playing the animation -- so the FIRST blow of a
  // tower's life landed with no wind-up at all, on whichever single enemy
  // happened to arrive first, while the hammer was still at rest. The owner
  // has been looking at that bug for a long time.
  //
  // Now the swing is a real wind-up: sighting starts it, `swingSeconds()` of
  // animation plays, and damage resolves at the END, against the zone AS IT IS
  // THEN. That is why it also stops hitting only one enemy -- half a second is
  // long enough for the rest of the group to walk in, which is what an overhead
  // slam should be waiting for.
  //
  // The RATE is unchanged: the wind-up is taken out of the cooldown that
  // follows, so a full cycle is still `cooldownSeconds`.
  if (this.windup > 0) {
    this.windup -= dt;
    if (this.windup > 0) return 0;
    this.windup = 0;
    this.cooldown = Math.max(0, this.cooldownSeconds - this.swingSeconds());
    // Re-gathered, not remembered: the enemies that matter are the ones under
    // the hammer when it lands, not the ones that were there when he started.
    var landed = this.enemiesInZone(enemies);
    return this.swing(landed, enemies);
  }

  if (this.cooldown > 0) return 0;

  // Hold the swing until there is actually something VISIBLE in the zone,
  // exactly as the gunner holds fire. Without this a 4 s cooldown would often
  // be spent hitting empty ground while an enemy walked through the arc
  // untouched -- and, since the zone itself no longer checks camo, a smasher
  // would swing at enemies it cannot see. `hits` still carries the camo ones:
  // they are collateral on a swing the visible enemy paid for.
  var hits = this.enemiesInZone(enemies);
  if (!this.sightedIn(hits)) return 0;

  this.windup = this.swingSeconds();
  return 0;
};

// How long the blow takes from the top of the swing to the ground. Path A's is
// the long one: it is a two-handed overhead slam, not a jab.
Smasher.prototype.swingSeconds = function () {
  return this.hasA1 ? Smasher.PATH_A_SWING_SECONDS : Smasher.SWING_SECONDS;
};

Smasher.prototype.swing = function (hits, enemies) {
  var dealt = 0;

  // Cosmetic only: the hammer has just landed, so start the shockwave and --
  // on a slowing Warbringer -- the magical weight it presses into the ground.
  // Set here rather than in draw() because this is the one place that knows an
  // impact happened; nothing reads either value back.
  this.slam = 1;
  if (this.slow) this.weight = 1;
  if (this.hasA1) {
    this.pathAImpact = {
      life: Smasher.PATH_A_CRACK_SECONDS,
      maxLife: Smasher.PATH_A_CRACK_SECONDS,
      aim: this.aim,
      rangePx: this.rangePx,
      arcRadians: this.arcRadians,
      fullCircle: this.fullCircle
    };
  }
  if (typeof Effects !== "undefined") {
    // PATH B RINGS, IT DOES NOT SMASH. From B3 the weapon is a striking hammer
    // and a set of tuned stakes driven into the road, so the mark it leaves is
    // a resonance travelling out of them rather than a floor split by a
    // monolith. Same event, same instant -- only the kind differs, and the
    // renderer picks the picture off it (see js/gl/gl-world.js).
    Effects.aoeImpact(this.x, this.y, this.rangePx,
      this.hasUpgrade("B3") ? "warbringer-ring" : "warbringer-swing",
      { arcRadians: this.arcRadians, aim: this.aim,
        fullCircle: this.fullCircle });
  }

  for (var i = 0; i < hits.length; i++) {
    var e = hits[i];

    // **THE SLOW LANDS BEFORE THE DAMAGE** (2026-07-30, fixing a real bug the
    // owner reported: "when the b4 warbringer attacks and kills the enemy they
    // don't explode, however they should be because attacked enemies are
    // slowed even if they die instantly").
    //
    // It used to be the other way round, and the burst asked whether the enemy
    // was ALREADY slowed when the blow landed -- so a Warbringer that killed
    // something in one swing never burst, because the only thing that had ever
    // slowed that enemy was the swing that had not happened yet. In practice
    // the blast only fired on an enemy that had survived a previous swing,
    // which is not what "an enemy killed while slowed" was ever meant to mean:
    // the swing slows what it hits, so what it hits IS slowed.
    //
    // Reordering is the whole fix. A hit enemy is slowed, then damaged, so a
    // kill on the first swing bursts exactly like a kill on the third.
    if (this.slow) {
      e.applySlow(this.slow.strength, this.slow.seconds);
    }

    // Every Warbringer swing is an area wedge. Tag it separately from pierce
    // so enemies with AoE resistance can answer the attack without weakening
    // the Arcane Sniper's ordinary line shots.
    dealt += TowerScore.apply(this, e, this.damage, 0, 0, "aoe");
    if (typeof Effects !== "undefined") {
      Effects.aoeImpact(e.pos.x, e.pos.y,
        Math.max(10, e.radiusPx() * 1.35), "warbringer-hit");
    }

    // No `wasSlowed` guard any more, and it would be dead code if there were:
    // B4 requires B3, B3 grants the slow, so every Warbringer that can burst at
    // all slows everything it swings at. The condition it used to express is
    // now guaranteed by the line above rather than tested for.
    if (this.explodesOnKill && e.dead) {
      dealt += this.explode(e, enemies);
    }
  }

  return dealt;
};

// B4's burst, and since 2026-07-30 A CHAIN REACTION.
//
// The owner's words: "if another enemy dies to the blast, that enemy also
// explodes for 15 damage. the goal is to create a chain reaction." So a corpse
// made by a burst is itself a burst, and a tight column of wounded enemies can
// go up end to end from one swing. That is the point of the mechanic and the
// reason path B's blast is worth buying now that its own swing zone (56.25 u.l.
// at B4) is three times the blast radius and would otherwise have reached
// everything the blast could.
//
// **WHAT STOPS IT RUNNING FOREVER**, since an explosion that sets off
// explosions is exactly the unbounded cascade the old comment here refused to
// build: an enemy may burst AT MOST ONCE, tracked in `burst`. Every link in
// the chain is therefore a distinct body, the board is finite, and the worst
// case is "every enemy on the map explodes once" -- which is the good case, not
// a hang. Written as a QUEUE rather than as recursion for the same reason: the
// depth of a chain is the length of a line of enemies, not something worth
// putting on the call stack.
//
// **IT APPLIES THE TOWER'S SLOW TOO**, at the owner's request the same day:
// "make it so that enemies damaged by an exploding enemy are also slowed". So
// a burst is not merely damage that happens to reach further than the wedge --
// it spreads the tempo effect that is path B's whole argument, and a chain
// walking down a column leaves the whole column slowed behind it. This reverses
// the file's previous rule ("a blast is a consequence of a blow that already
// landed, not a second swing"), deliberately and on instruction.
Smasher.prototype.explode = function (origin, enemies) {
  var radiusPx = ul(Smasher.EXPLOSION_RADIUS_UL);
  var dealt = 0;

  var burst = [origin];      // bodies that have already gone up; never twice
  var queue = [origin];

  while (queue.length) {
    var source = queue.shift();
    this.blasts.push({ x: source.pos.x, y: source.pos.y, life: 1 });
    if (typeof Effects !== "undefined") {
      Effects.aoeImpact(source.pos.x, source.pos.y, radiusPx, "warbringer-blast");
    }

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e === source || e.dead || e.leaked) continue;
      if (burst.indexOf(e) !== -1) continue;

      var dx = e.pos.x - source.pos.x;
      var dy = e.pos.y - source.pos.y;
      if (dx * dx + dy * dy > radiusPx * radiusPx) continue;

      // Slowed BEFORE the damage, for the same reason the swing is: a body the
      // blast kills outright should still have been slowed by it, and the next
      // link in the chain should inherit the tempo effect rather than only the
      // damage.
      if (this.slow) {
        e.applySlow(this.slow.strength, this.slow.seconds);
      }

      // Blast damage and blast kills belong to the smasher whose B4 caused it,
      // however many links down the chain they happened.
      dealt += TowerScore.apply(this, e, this.explosionDamage, 0, 0, "aoe");

      // Died to the blast, so it is the next link.
      if (e.dead) {
        burst.push(e);
        queue.push(e);
      }
    }
  }

  return dealt;
};

// --- B5: the earthquake -----------------------------------------------------

Smasher.prototype.quakeReady = function () {
  return this.hasQuake && this.quakeCooldown <= 0;
};

// Jump, and stop the whole map.
//
// Returns { ok, reason } so the panel can say why nothing happened, the same
// shape the Longshot's active ability returns.
//
// **THE STUN AND THE SLOW ARE APPLIED IN THE SAME INSTANT, and the slow's
// duration COVERS THE STUN.** The spec is "3 seconds stunned, then 60% slower
// for the next 5" — two effects in sequence — and this is one call that adds up
// to exactly that: a stunned enemy is already at zero speed, so the first three
// seconds of an eight-second slow are unobservable, and what the player sees is
// three seconds frozen followed by five at 40% speed. The alternative was a
// scheduler holding a pending slow for three seconds, which is a second kind of
// timed global state for no difference on screen. If that ever has to change --
// because something should be slowed but not stunned, say -- this is the one
// function to change.
//
// It takes the enemies ON THE MAP AT THE MOMENT IT FIRES, which is what "all
// enemies on the map" says. Something that walks in during the aftermath walks
// in at full speed; the ability is a punishment for what is already on the
// board, not a field the wave has to cross.
Smasher.prototype.triggerQuake = function (enemies) {
  if (!this.hasQuake) return { ok: false, reason: "needs B5" };
  if (this.quakeCooldown > 0) {
    return { ok: false, reason: "ready in " + this.quakeCooldown.toFixed(1) + "s" };
  }

  this.quakeCooldown = Smasher.QUAKE_COOLDOWN_SECONDS;
  this.hop = 1;
  this.quakeFlash = 1;
  if (typeof Effects !== "undefined" && Effects.earthquake) {
    Effects.earthquake(this.x, this.y);
  }

  var slowSeconds = Smasher.QUAKE_STUN_SECONDS + Smasher.QUAKE_SLOW.seconds;
  var caught = 0;

  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead || e.leaked) continue;
    e.applyStun(Smasher.QUAKE_STUN_SECONDS);
    e.applySlow(Smasher.QUAKE_SLOW.strength, slowSeconds);
    caught++;
  }

  return { ok: true, caught: caught };
};

// Ages every cosmetic remnant a swing leaves behind. Called first thing in
// update(), and the simulation never reads any of it.
Smasher.prototype.fadeBlasts = function (dt) {
  for (var i = this.blasts.length - 1; i >= 0; i--) {
    this.blasts[i].life -= dt * 3;
    if (this.blasts[i].life <= 0) this.blasts.splice(i, 1);
  }

  // The shockwave outruns the eye quickly; the magical weight is supposed to
  // hang around, which is the whole point of it -- a B-path Warbringer should
  // look like it has made the ground heavy, not like it hit something once.
  if (this.slam > 0) this.slam = Math.max(0, this.slam - dt * 2.5);
  if (this.weight > 0) this.weight = Math.max(0, this.weight - dt * 0.7);
  if (this.pathAImpact) {
    this.pathAImpact.life -= dt;
    if (this.pathAImpact.life <= 0) this.pathAImpact = null;
  }

  // The earthquake's two frames: the machine's hop (fast, it lands and the
  // ground goes) and the rings rolling out over the whole map (slow, because
  // the effect they announce lasts eight seconds).
  if (this.hop > 0) this.hop = Math.max(0, this.hop - dt * 2.2);
  if (this.quakeFlash > 0) this.quakeFlash = Math.max(0, this.quakeFlash - dt * 0.8);
};


// --- interface --------------------------------------------------------------

// The footprint is the physical extent, the collision radius AND the click
// target. Shared with the gunner rather than reimplemented so the three can
// never disagree for one type but not the other.
Smasher.prototype.containsPoint = Tower.prototype.containsPoint;

// What this tower hits for, and how often. The smasher STORES seconds between
// swings, because its whole upgrade table is written that way ("the fastest
// owned value wins"); this is the one place that becomes a rate, exactly as
// ul() is the one place a u.l. distance becomes pixels.
Smasher.prototype.attackDamage = function () { return this.damage; };
Smasher.prototype.attacksPerSecond = function () { return 1 / this.cooldownSeconds; };

// Rows for the inspection panel. Every shared row comes from TowerStats, so
// the smasher says "Attack speed 0.25/s" where it used to say "Hit speed
// 4.00 s" -- the same quantity the gunner called "Cooldown" and the Longshot
// called "Fire rate", in one unit all four now share.
//
// Its distances also said "m". The game has been in u.l. since 2026-07-26 and
// these two rows were the last metres left in it, printing "31.25 m" for a
// figure that was never metres.
Smasher.prototype.statLines = function () {
  var rows = TowerStats.totals(this).concat([
    TowerStats.damage(this),
    TowerStats.range(this),
    TowerStats.attackSpeed(this),
    ["AOE", this.fullCircle ? "full circle" : this.arcDegrees + "° arc"],
    ["Tower HP", TowerHealth.label(this)]
  ]);

  if (this.slow) {
    rows.push(["Slow", Math.round(this.slow.strength * 100) + "% for " +
      this.slow.seconds.toFixed(1) + " s"]);
  }
  if (this.explodesOnKill) {
    rows.push(["On kill", this.explosionDamage + " in " +
      TowerStats.distance(Smasher.EXPLOSION_RADIUS_UL) + ", chains"]);
  }
  if (this.hasQuake) {
    rows.push(["Earthquake", Smasher.QUAKE_STUN_SECONDS + " s stun, then " +
      Math.round(Smasher.QUAKE_SLOW.strength * 100) + "% for " +
      Smasher.QUAKE_SLOW.seconds + " s"]);
  }
  // No "Upgrades" row listing the owned ids: every row above already reflects
  // them, and the branch buttons below show where the tree stands. A list of
  // ids was duplicate information taking up a line. No "Target" row either --
  // the targeting button under these rows is the one readout of that.

  // DPS is per enemy in the zone; a swing that catches four enemies does four
  // times this. Last row, because the panel emphasises the last one.
  rows.push(TowerStats.dpsRow(this));
  return rows;
};

// Owned upgrade ids in tier order. Nothing in the game draws this any more --
// it is kept because it is the clearest way for a test to assert what a tower
// bought, and for a future session to inspect one from the console.
Smasher.prototype.ownedUpgradeIds = function () {
  var owned = [];
  for (var i = 0; i < Smasher.UPGRADES.length; i++) {
    if (this.hasUpgrade(Smasher.UPGRADES[i].id)) owned.push(Smasher.UPGRADES[i].id);
  }
  return owned;
};


// --- drawing ----------------------------------------------------------------

// Branch decides the colour: A runs hot (a forge-lit warhammer), B runs
// arcane-violet (the magical weight it leaves in the ground). An uncommitted
// Warbringer is gunmetal plate.
Smasher.prototype.tint = function () {
  var branch = this.lockedBranch();
  if (branch === "A") return { r: 255, g: 138, b: 74 };
  if (branch === "B") return { r: 178, g: 148, b: 255 };
  return { r: 178, g: 184, b: 200 };
};

// How far up path A this Warbringer is, 0 -> 1, derived from its damage rather
// than from which flags are set: a heavier hammer is literally drawn bigger and
// hotter, and reading the stat means a crosspathed tower is drawn honestly
// instead of being sorted into a branch. Base 12 damage, full A 52.
Smasher.prototype.forgeHeat = function () {
  var over = this.damage - Smasher.BASE_DAMAGE;
  return Math.max(0, Math.min(1, over / 40));
};

// How much faster than base this Warbringer strikes, 0 -> 1. Base 4.0 s between
// swings, the fastest tier 2.2 s. Used to sharpen the slam: a fast hammer snaps
// through its arc, a slow one heaves.
Smasher.prototype.haste = function () {
  var gained = Smasher.BASE_COOLDOWN - this.cooldownSeconds;
  return Math.max(0, Math.min(1, gained / 1.8));
};

// Where the hammer head is during the animation, as two 0 -> 1 scalars derived
// from swingProgress(): how far it has been RAISED, and how far through the
// downward STRIKE it is. Both zero means the hammer is resting.
//
// The whole reason this is a separate function is that draw() needs it twice --
// once for the head and once for the shadow under it -- and computing it in two
// places is how the shadow ends up under the wrong pixel.
Smasher.prototype.swingPose = function (swing) {
  if (swing <= 0) return { raised: 0, strike: 0 };
  if (swing < Smasher.SWING_RAISE_END) {
    return { raised: swing / Smasher.SWING_RAISE_END, strike: 0 };
  }
  if (swing < Smasher.SWING_HOLD_END) return { raised: 1, strike: 0 };

  var t = (swing - Smasher.SWING_HOLD_END) / (1 - Smasher.SWING_HOLD_END);
  return { raised: 1 - t, strike: t };
};

// Path A's impact fractures stay clipped to the exact damage shape captured
// when the hammer landed. The tower may turn toward another target while they
// fade, so reading live aim/range here would make cracks slide across the map.
Smasher.prototype.drawPathAImpact = function (ctx) {
  var impact = this.pathAImpact;
  if (!impact) return;

  var alpha = Math.min(1, impact.life / 0.55);
  var half = impact.arcRadians / 2;
  var count = impact.fullCircle ? 14 : 9;
  var start = impact.fullCircle
    ? impact.aim
    : impact.aim - half;
  var span = impact.fullCircle ? Math.PI * 2 : impact.arcRadians;
  var seed = (this.x * 0.013 + this.y * 0.019) % 1;

  ctx.save();
  ctx.beginPath();
  if (impact.fullCircle) {
    ctx.arc(this.x, this.y, impact.rangePx, 0, Math.PI * 2);
  } else {
    ctx.moveTo(this.x, this.y);
    ctx.arc(this.x, this.y, impact.rangePx,
      impact.aim - half, impact.aim + half);
    ctx.closePath();
  }
  ctx.clip();

  for (var i = 0; i < count; i++) {
    var angle = start + span * (i + 0.35 + seed * 0.3) / count;
    var reach = impact.rangePx *
      (0.58 + 0.34 * ((Math.sin((i + 1) * 9.7 + seed * 13) + 1) / 2));
    var x = this.x + Math.cos(angle) * this.footprintPx * 0.75;
    var y = this.y + Math.sin(angle) * this.footprintPx * 0.75;

    ctx.beginPath();
    ctx.moveTo(x, y);
    for (var segment = 1; segment <= 4; segment++) {
      var bend = Math.sin((i + 2) * (segment + 1) * 2.17 + seed * 11) * 0.12;
      var distance = reach * segment / 4;
      ctx.lineTo(
        this.x + Math.cos(angle + bend) * distance,
        this.y + Math.sin(angle + bend) * distance
      );
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(10,10,14," + (0.72 * alpha).toFixed(3) + ")";
    ctx.stroke();
    ctx.lineWidth = 1.35;
    ctx.strokeStyle = "rgba(255,150,74," + (0.82 * alpha).toFixed(3) + ")";
    ctx.stroke();
  }

  ctx.restore();
};

Smasher.prototype.draw = function (ctx) {
  var c = this.tint();
  var rgb = c.r + "," + c.g + "," + c.b;
  var swing = this.swingProgress();
  var half = this.arcRadians / 2;

  // The damage zone. Drawn while this smasher is SELECTED, or mid-swing --
  // never as permanent furniture (2026-07-29, with the gunner's range circle,
  // at the owner's request: a board of towers each painting its own reach was
  // a fog over the road).
  //
  // Keeping the swing visible when unselected is the part worth preserving.
  // The zone brightens through the swing, and that flash is how a player sees
  // WHAT WAS HIT; hiding it entirely would make the smasher look inert. So
  // the rule is "quiet at rest, loud on impact, fully mapped on demand".
  if (this.showRange || swing > 0) {
    ctx.beginPath();
    if (this.fullCircle) {
      ctx.arc(this.x, this.y, this.rangePx, 0, Math.PI * 2);
    } else {
      ctx.moveTo(this.x, this.y);
      ctx.arc(this.x, this.y, this.rangePx, this.aim - half, this.aim + half);
      ctx.closePath();
    }
    var rest = this.showRange ? 0.10 : 0;
    ctx.fillStyle = "rgba(" + rgb + "," + (rest + 0.22 * swing) + ")";
    ctx.fill();
    ctx.lineWidth = 1 + swing;
    ctx.strokeStyle = "rgba(" + rgb + "," + ((this.showRange ? 0.45 : 0.1) + 0.5 * swing) + ")";
    ctx.stroke();
  }

  this.drawPathAImpact(ctx);

  // Path B's lingering magical weight: a slow violet stain over the ground the
  // hammer pressed, drawn UNDER everything else and fading over about a second
  // and a half. Only a Warbringer with a slow ever sets it (see swing()), so
  // this is the mechanic made visible rather than decoration bolted on.
  if (this.weight > 0) {
    ctx.save();
    ctx.beginPath();
    if (this.fullCircle) {
      ctx.arc(this.x, this.y, this.rangePx, 0, Math.PI * 2);
    } else {
      ctx.moveTo(this.x, this.y);
      ctx.arc(this.x, this.y, this.rangePx, this.aim - half, this.aim + half);
      ctx.closePath();
    }
    ctx.clip();

    // Two concentric bands settling inward, so the ground reads as pressed
    // down rather than merely tinted.
    for (var w = 0; w < 2; w++) {
      var wr = this.rangePx * (0.45 + 0.3 * w) * (1 - 0.12 * (1 - this.weight));
      ctx.beginPath();
      ctx.arc(this.x, this.y, wr, 0, Math.PI * 2);
      ctx.lineWidth = 6 - 2 * w;
      ctx.strokeStyle = "rgba(168,132,255," + (this.weight * 0.16).toFixed(3) + ")";
      ctx.stroke();
    }
    ctx.restore();
  }

  // The SHOCKWAVE, rolling out through the wedge from the point of impact.
  // Clipped to the damage zone on purpose: the shockwave is the swing, so it
  // must never suggest reach the tower does not have.
  if (this.slam > 0) {
    var age = 1 - this.slam;                 // 0 at impact, 1 when spent
    ctx.save();
    ctx.beginPath();
    if (this.fullCircle) {
      ctx.arc(this.x, this.y, this.rangePx, 0, Math.PI * 2);
    } else {
      ctx.moveTo(this.x, this.y);
      ctx.arc(this.x, this.y, this.rangePx, this.aim - half, this.aim + half);
      ctx.closePath();
    }
    ctx.clip();

    var frontR = this.rangePx * (0.15 + 1.0 * age);
    ctx.beginPath();
    ctx.arc(this.x, this.y, frontR, 0, Math.PI * 2);
    ctx.lineWidth = 7 * this.slam;
    ctx.strokeStyle = "rgba(255,244,220," + (this.slam * 0.55).toFixed(3) + ")";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.x, this.y, frontR * 0.72, 0, Math.PI * 2);
    ctx.lineWidth = 4 * this.slam;
    ctx.strokeStyle = "rgba(" + rgb + "," + (this.slam * 0.45).toFixed(3) + ")";
    ctx.stroke();
    ctx.restore();

    // Dust ring at the tower's feet, unclipped and short-lived.
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.footprintPx * (0.9 + 0.7 * age), 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,236,200," + (this.slam * 0.35).toFixed(3) + ")";
    ctx.stroke();
  }

  // B4 blasts: a hammer strike that CRACKS the ground where the slowed enemy
  // died. Four splitting fissures out of the impact point plus the ring that
  // marks how far the burst reached, both fading together.
  var blastRadius = ul(Smasher.EXPLOSION_RADIUS_UL);
  for (var i = 0; i < this.blasts.length; i++) {
    var blast = this.blasts[i];

    ctx.beginPath();
    ctx.arc(blast.x, blast.y, blastRadius * (1.1 - blast.life * 0.4), 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,190,120," + blast.life * 0.8 + ")";
    ctx.lineWidth = 2;
    ctx.stroke();

    // The cracks. Their headings are fixed off the blast's own coordinates
    // rather than random, so a fissure never twitches between frames.
    var seed = (blast.x * 0.7 + blast.y * 1.3) % (Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,214,150," + (blast.life * 0.7).toFixed(3) + ")";
    for (var c = 0; c < 4; c++) {
      var ca = seed + c * Math.PI / 2;
      var reach = blastRadius * (0.55 + 0.35 * ((c % 2) ? 1 : 0.6));
      ctx.beginPath();
      ctx.moveTo(blast.x, blast.y);
      ctx.lineTo(blast.x + Math.cos(ca) * reach * 0.55,
                 blast.y + Math.sin(ca) * reach * 0.55);
      ctx.lineTo(blast.x + Math.cos(ca + 0.35) * reach,
                 blast.y + Math.sin(ca + 0.35) * reach);
      ctx.stroke();
    }
  }

  // THE EARTHQUAKE. Three rings rolling out well past this tower's own reach,
  // because the effect genuinely has no radius -- drawing it at the swing zone
  // would say the opposite of what the ability does. They are the only thing
  // this tower ever draws outside its zone, and that is the point.
  //
  // The enemies carry the other half of the feedback: every one of them wears a
  // stun ring for three seconds and a frost ring for five more, so "what did
  // that do" is answerable by looking at the road rather than at the tower.
  if (this.quakeFlash > 0) {
    var qAge = 1 - this.quakeFlash;                // 0 at the jump, 1 when spent
    for (var q = 0; q < 3; q++) {
      var ringAge = qAge - q * 0.12;
      if (ringAge <= 0) continue;
      ctx.beginPath();
      ctx.arc(this.x, this.y, ringAge * 620, 0, Math.PI * 2);
      ctx.lineWidth = 5 * (1 - ringAge);
      ctx.strokeStyle = "rgba(198,164,255," + (0.5 * (1 - ringAge)).toFixed(3) + ")";
      ctx.stroke();
    }
  }

  this.drawBody(ctx, rgb, swing);
};

Smasher.prototype.drawHammerEcho = function (ctx, half, heat, progress, alpha) {
  var pose = this.swingPose(progress);
  var snap = 0.15 + 0.25 * this.haste();
  var angle = this.aim - pose.raised * 1.3 + pose.strike * snap;
  var armLength = half + 7 + pose.raised * 2;
  var hx = this.x + Math.cos(angle) * armLength;
  var hy = this.y + Math.sin(angle) * armLength;
  var headSize = (5.5 + 3.5 * heat) * (1 + 0.4 * pose.raised);
  var headLong = headSize * 0.75;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(this.x, this.y);
  ctx.lineTo(hx, hy);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ff9858";
  ctx.stroke();

  ctx.translate(hx, hy);
  ctx.rotate(angle);
  ctx.fillStyle = "#ffd2ad";
  ctx.fillRect(-headSize / 2, -headLong, headSize, headLong * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#ff7f3e";
  ctx.strokeRect(-headSize / 2, -headLong, headSize, headLong * 2);
  ctx.restore();
};

Smasher.prototype.drawBody = function (ctx, rgb, swing) {
  // Chassis: still the square inscribed in the footprint circle -- what
  // collides is what you see and what you click, and that rule outranks any
  // reskin -- but built up as a plated war machine rather than a bare block.
  var half = this.footprintPx / Math.SQRT2;
  var heat = this.forgeHeat();
  var pose = this.swingPose(swing);

  // THE JUMP. "He jumps and causes a 3 seconds stun" -- so the machine leaves
  // the ground, which top-down means drawing it bigger with a shadow under it.
  // A pure scale about the tower's centre, so the chassis grows symmetrically
  // and the footprint it is inscribed in is untouched: what collides and what
  // you click are exactly where they were, which is the rule the whole body
  // is drawn under.
  if (this.hop > 0) {
    var lift = Math.sin(this.hop * Math.PI);        // 0 -> 1 -> 0 over the hop
    ctx.beginPath();
    ctx.ellipse(this.x + 4 * lift, this.y + 6 * lift,
      half * 0.9, half * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0," + (0.35 * lift).toFixed(2) + ")";
    ctx.fill();
    half *= 1 + 0.22 * lift;
  }

  // The STRUCTURE is gunmetal and the branch tint is only an accent -- the
  // outer edge, the core and the hammer's hot face. Painting the whole chassis
  // in the tint was tried first and a fully upgraded path A came out as a flat
  // orange crate: everything the same colour, so nothing had a shape.
  ctx.fillStyle = "#22252f";
  ctx.fillRect(this.x - half, this.y - half, half * 2, half * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#7d8496";
  ctx.strokeRect(this.x - half, this.y - half, half * 2, half * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(" + rgb + ",0.65)";
  ctx.strokeRect(this.x - half + 2.5, this.y - half + 2.5,
    half * 2 - 5, half * 2 - 5);

  // Reinforced plating: an inner plate with bolt heads at the corners. The
  // plate is inset rather than overhanging, so nothing is drawn outside the
  // footprint square and the collision box stays exactly what it looks like.
  var inner = half * 0.62;
  ctx.fillStyle = "#3b4150";
  ctx.fillRect(this.x - inner, this.y - inner, inner * 2, inner * 2);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(89,96,114,0.5)";
  ctx.strokeRect(this.x - inner, this.y - inner, inner * 2, inner * 2);

  var bolt = half * 0.74;
  for (var b = 0; b < 4; b++) {
    var bx = this.x + (b < 2 ? -bolt : bolt);
    var by = this.y + (b % 2 ? -bolt : bolt);
    ctx.beginPath();
    ctx.arc(bx, by, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#9aa2b4";
    ctx.fill();
  }

  // A forge-lit core, brighter the further up path A this one is. Zero heat
  // leaves a dim ember, so a fresh Warbringer still reads as powered.
  ctx.beginPath();
  ctx.arc(this.x, this.y, 3 + 2 * heat, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255," + Math.round(150 + 60 * heat) + "," +
    Math.round(90 + 40 * heat) + "," + (0.35 + 0.55 * heat).toFixed(2) + ")";
  ctx.fill();

  // Path A shows several overhead hammer poses at once: actual animation
  // frames, not a generic glow. Older frames are fainter, leading the eye from
  // the raised head into the live strike below.
  var echoes = this.hammerEchoProgresses(swing);
  for (var echo = 0; echo < echoes.length; echo++) {
    this.drawHammerEcho(ctx, half, heat, echoes[echo],
      0.12 + 0.08 * (echo + 1));
  }

  // The hammer. It rests low along the aim, RISES back over the machine's
  // shoulder, holds, then snaps forward through the aim as the slam lands.
  // `raised` also lifts the head off the ground, which top-down means drawing
  // it bigger and offsetting its shadow -- that height cue is what makes the
  // difference between a hammer swinging sideways and one coming down.
  var snap = 0.15 + 0.25 * this.haste();   // a faster hammer overshoots harder
  var armAngle = this.aim - pose.raised * 1.3 + pose.strike * snap;
  var armLength = half + 7 + pose.raised * 2;
  var hx = this.x + Math.cos(armAngle) * armLength;
  var hy = this.y + Math.sin(armAngle) * armLength;

  // Shadow on the ground under a raised head, so height is legible from above.
  if (pose.raised > 0.05) {
    ctx.beginPath();
    ctx.ellipse(hx + 3 * pose.raised, hy + 4 * pose.raised,
      4 * pose.raised, 2.4 * pose.raised, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0," + (0.3 * pose.raised).toFixed(2) + ")";
    ctx.fill();
  }

  // Haft: dark timber with a steel highlight, so it reads against both the
  // chassis it comes out of and the ground it swings over.
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(this.x, this.y);
  ctx.lineTo(hx, hy);
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#2b241a";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(this.x, this.y);
  ctx.lineTo(hx, hy);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = "#9a8256";
  ctx.stroke();

  // Head: a blocky maul that grows with the tower's DAMAGE rather than with
  // how many upgrades it happens to own, so a heavier hammer is a heavier
  // hammer on screen. Scaled up further while raised (it is nearer the eye)
  // and blown white at the instant of the strike.
  //
  // The head is drawn in FORGED STEEL, not in the branch tint. It used to take
  // the tint, which on path A is orange -- so a fully upgraded Warbringer
  // swung a solid orange slab with no readable shape to it. The tint is the
  // edge and the hot striking face only; the mass of the head stays metal.
  var headSize = (5.5 + 3.5 * heat) * (1 + 0.4 * pose.raised);
  var headLong = headSize * 0.75;          // half-length across the striking face
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(armAngle);

  ctx.fillStyle = pose.strike > 0 ? "#ffffff" : "#c3c9d8";
  ctx.fillRect(-headSize / 2, -headLong, headSize, headLong * 2);

  // Forge glow banding the striking face, hotter the further up path A.
  if (heat > 0) {
    ctx.fillStyle = "rgba(255,150,60," + (0.45 + 0.45 * heat).toFixed(2) + ")";
    ctx.fillRect(headSize / 2 - headSize * 0.3, -headLong,
      headSize * 0.3, headLong * 2);
  }

  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "#15171d";
  ctx.strokeRect(-headSize / 2, -headLong, headSize, headLong * 2);
  ctx.restore();

  // One pip per upgrade owned, so investment is readable without the panel.
  for (var i = 0; i < this.upgradeCount; i++) {
    var a = -Math.PI / 2 + i * (Math.PI * 2 / 10);
    ctx.beginPath();
    ctx.arc(this.x + Math.cos(a) * (half + 5), this.y + Math.sin(a) * (half + 5), 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(" + rgb + ",0.95)";
    ctx.fill();
  }
};

// Build bar icon: a plated chassis with the warhammer raised over it. Pixel
// sizes on purpose -- interface chrome must not scale with the map.
Smasher.drawIcon = function (ctx, cx, cy, size) {
  var half = size / 2;

  ctx.fillStyle = "#22252f";
  ctx.fillRect(cx - half, cy - half, size, size);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#b2b8c8";
  ctx.strokeRect(cx - half, cy - half, size, size);

  // Inner plate and its bolts.
  var inner = half * 0.62;
  ctx.fillStyle = "#313644";
  ctx.fillRect(cx - inner, cy - inner, inner * 2, inner * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(178,184,200,0.5)";
  ctx.strokeRect(cx - inner, cy - inner, inner * 2, inner * 2);

  ctx.fillStyle = "rgba(178,184,200,0.85)";
  for (var b = 0; b < 4; b++) {
    ctx.beginPath();
    ctx.arc(cx + (b < 2 ? -1 : 1) * half * 0.72,
      cy + (b % 2 ? -1 : 1) * half * 0.72, size * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  // Forge core.
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,166,80,0.85)";
  ctx.fill();

  // Haft, raised over the shoulder.
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.3, cy + size * 0.45);
  ctx.lineTo(cx + size * 0.25, cy - size * 0.3);
  ctx.lineWidth = Math.max(2, size * 0.13);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#8b7350";
  ctx.stroke();

  // Maul head, with the hot striking face.
  ctx.save();
  ctx.translate(cx + size * 0.3, cy - size * 0.38);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "#dfe3ee";
  ctx.fillRect(-size * 0.3, -size * 0.16, size * 0.6, size * 0.32);
  ctx.fillStyle = "rgba(255,166,80,0.8)";
  ctx.fillRect(size * 0.14, -size * 0.16, size * 0.16, size * 0.32);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(20,20,26,0.8)";
  ctx.strokeRect(-size * 0.3, -size * 0.16, size * 0.6, size * 0.32);
  ctx.restore();
};


// --- the shared upgrade panel ----------------------------------------------
//
// v0.3.5: the Smasher arrived with its own upgrade buttons drawn straight into
// game.js. The merge replaced those with the generic panel contract the
// config-driven towers already used (panelActions/performAction), so there is
// ONE upgrade UI rather than two that look alike and drift apart. The tower's
// own rules -- tier order, path locking, cost, affordability -- are untouched;
// this only exposes them in the shape the panel expects.

Smasher.prototype.panelActions = function () {
  var actions = [];
  var self = this;

  ["A", "B"].forEach(function (branch) {
    var next = self.nextUpgrade(branch);

    // A branch with nothing left is MAXED. A branch that still has tiers but
    // cannot buy them is BLOCKED -- it keeps showing the tier and says why,
    // because "path A already chosen" is information the player needs and
    // "MAXED" would be a lie.
    if (!next) {
      actions.push({
        id: "upgrade" + branch,
        branch: branch,
        upgradeId: null,
        label: "Path " + branch + "  MAXED",  // line 1: which
        detail: "maxed",
        effects: "every tier bought",
        reason: "every tier bought",
        enabled: false,
        tone: "upgrade",
        // A thunk, like every other tower's card -- see cardFor in js/game.js.
        tooltip: function () {
          return UpgradeEffects.card({
            title: self.name + "  ·  path " + branch,
            subtitle: "every tier bought",
            note: "Nothing left to buy on this branch."
          });
        }
      });
      return;
    }

    var refusal = self.whyCannotUpgrade(next.id);
    var preview = self.previewUpgrade(next.id);

    actions.push({
      id: "upgrade" + branch,
      branch: branch,
      upgradeId: next.id,
      label: "Path " + branch + " → " + next.id,
      // THROUGH `upgradeCost`, NEVER OFF THE TABLE ROW (2026-08-30). A permanent
      // perk may move what a tier costs, and a button that quoted the authored
      // price while the till charged the perked one is the divergence this
      // whole file already avoids everywhere else.
      detail: refusal ? refusal : self.upgradeCost(next.id) + " mana",
      effects: refusal ? refusal : preview.effects.join(", "),
      reason: refusal,
      enabled: refusal === null && cash >= self.upgradeCost(next.id),
      tone: "upgrade",
      tooltip: function () { return self.upgradeCard(next, refusal, preview); }
    });
  });

  // B5's earthquake. Appended AFTER both branch buttons, so it takes the odd
  // slot the panel already reserves for a tower with an ability -- the same
  // place the Arcane Sniper's nuke and its re-aim sit. Absent entirely until
  // B5 is owned rather than shown greyed out: a control for something the
  // tower cannot do is noise on a panel that is read mid-wave.
  if (this.hasQuake) {
    var cooling = this.quakeCooldown > 0;
    var quakeCard = UpgradeEffects.card({
      title: "Earthquake",
      subtitle: cooling
        ? "ready in " + this.quakeCooldown.toFixed(1) + " s"
        : "ready",
      changes: [
        { label: "Stun", from: "", to: Smasher.QUAKE_STUN_SECONDS + " s", delta: "" },
        { label: "Then slow", from: "",
          to: Math.round(Smasher.QUAKE_SLOW.strength * 100) + "% for " +
            Smasher.QUAKE_SLOW.seconds + " s", delta: "" },
        { label: "Reach", from: "", to: "the whole map", delta: "" },
        { label: "Cooldown", from: "",
          to: Smasher.QUAKE_COOLDOWN_SECONDS + " s", delta: "" }
      ],
      abilities: UpgradeEffects.abilities(["earthquake"], {
        earthquake: {
          stunSeconds: Smasher.QUAKE_STUN_SECONDS,
          slowFraction: Smasher.QUAKE_SLOW.strength,
          slowSeconds: Smasher.QUAKE_SLOW.seconds,
          cooldownSeconds: Smasher.QUAKE_COOLDOWN_SECONDS
        }
      }),
      note: "It costs nothing but the cooldown. Enemies that walk in afterwards are not caught."
    });

    actions.push(AutoAbility.attach({
      id: "ability",
      label: "Earthquake",
      detail: cooling
        ? "ready in " + this.quakeCooldown.toFixed(1) + "s"
        : Smasher.QUAKE_STUN_SECONDS + " s stun · whole map",
      effects: "stops every enemy for " + Smasher.QUAKE_STUN_SECONDS + " s, then " +
        Math.round(Smasher.QUAKE_SLOW.strength * 100) + "% slower for " +
        Smasher.QUAKE_SLOW.seconds + " s",
      enabled: !cooling,
      tone: "ability",
      tooltip: quakeCard
    }, this, "ability", "AUTO"));
  }

  return actions;
};

// The hover card for one upgrade: what it costs, every stat it moves with the
// value before and after, a sentence per ability it switches on, and the one
// consequence a price tag cannot show -- that tier 3 shuts the other branch.
//
// Assembled from previewUpgrade's measurement, so it cannot describe anything
// the purchase would not actually do.
Smasher.prototype.upgradeCard = function (upgrade, refusal, preview) {
  // Parameters for the sentences, taken from the upgrade's own row rather
  // than repeated: a retuned slow moves the description with it.
  var params = {
    slow: upgrade.slow
      ? { fraction: upgrade.slow.strength, seconds: upgrade.slow.seconds }
      : null,
    // Off the constants rather than repeated, for the same reason the slow is
    // read off the upgrade's own row: retune the quake and its sentence moves.
    earthquake: {
      stunSeconds: Smasher.QUAKE_STUN_SECONDS,
      slowFraction: Smasher.QUAKE_SLOW.strength,
      slowSeconds: Smasher.QUAKE_SLOW.seconds,
      cooldownSeconds: Smasher.QUAKE_COOLDOWN_SECONDS
    }
  };

  var note = null;
  if (refusal) {
    note = "Unavailable: " + refusal + ".";
  } else if (upgrade.locksPath && this.lockedBranch() === null) {
    // Read off the tier that does the locking rather than typed as "tier 3",
    // so moving `locksPath` up or down the table moves the warning with it.
    // The cap is the tier below it: this only fires on the FIRST locking tier,
    // because after that a branch is already committed.
    var tier = parseInt(upgrade.id.slice(1), 10);
    note = "Tier " + tier + " commits this tower: the other branch is capped at tier " +
      (tier - 1) + " for good.";
  }

  return UpgradeEffects.card({
    title: this.name + "  ·  " + upgrade.id,
    subtitle: refusal ? refusal : this.upgradeCost(upgrade.id) + " mana",
    changes: preview.changes,
    abilities: UpgradeEffects.abilities(preview.grants, params),
    note: note
  });
};

Smasher.prototype.performAction = function (id, context) {
  var auto = AutoAbility.handle(this, id);
  if (auto) return auto;

  if (id === "ability") {
    // The enemy list comes in through the panel's context, like every other
    // action's world access -- see the note on worldContext in game.js. The
    // ability spends no cash, so nothing else in the context is touched.
    var outcome = this.triggerQuake(context.enemies);
    if (!outcome.ok) return outcome.reason;
    return "earthquake — " + outcome.caught + " caught";
  }

  if (id !== "upgradeA" && id !== "upgradeB") return null;

  var next = this.nextUpgrade(id.slice(-1));
  if (!next) return "path maxed";

  // Delegated, not reimplemented: buyUpgrade in game.js owns validation,
  // price and affordability for every upgradeable tower, so the panel button
  // and any other route in cannot disagree about what an upgrade costs.
  var refusal = buyUpgrade(this, next.id);
  if (refusal) return refusal;

  return this.name + " → " + next.id;
};
