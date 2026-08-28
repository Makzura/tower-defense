// ---------------------------------------------------------------------------
// FarmTower ("Farm", id `farm`) -- the tower that produces MANA instead of
// damage, and the first with THREE upgrade paths.
//
// Added 2026-08-27 against a fully specified brief: three five-tier branches,
// a per-wave production that path A turns into a ticking one and then into a
// private stock, a path B that grows the player's BASE and taxes what walks
// past it, and a path C that links every farm on the board into one shared
// production and rolls dice against it every wave.
//
// WHAT MAKES IT DIFFERENT FROM EVERY OTHER TOWER HERE, and what most of this
// file is about: it does not shoot, and almost nothing it does happens on the
// tower. Its output lands in the player's purse, its path B raises a global,
// its path C is a network with state of its own. So the board-wide half lives
// in `Farms` at the bottom of this file and the game calls into it at exactly
// three moments -- a wave ending, a wave starting, and a restart.
//
// **THE WORD IS MANA.** Every string this tower puts on screen says mana, never
// gold, cash or coins, at the owner's instruction. The QUANTITY is the game's
// ordinary `cash` -- there is one run currency and inventing a second would be
// a change to the economy rather than to this tower -- so what the Farm renames
// is its own vocabulary and nothing else. `Farms.pay` is the one door, and it
// is the only place in this file that touches the global.
//
// **NOTHING HERE USES `Math.random`.** The dice are a seeded xorshift, for the
// reason lane offsets and the Summoner's spawn points are: a run that cannot be
// replayed cannot be tested, and this tower's whole output is decided by dice.
// The stream is seeded from the network's own composition and reset by
// `Farms.reset()`, which `restartGame` calls.
//
// THE VISUAL IS A PLACEHOLDER, deliberately and temporarily. The brief
// describes a hooded salvager-wizard behind a repaired dark-metal cauldron of
// cyan-violet mana on a compact wood-and-scrap platform, and names twelve final
// models (base, a shared T1, a shared T2, then one per tier from T3 up on each
// path). None of those exist yet. `drawIcon` and `draw` below are a legible
// stand-in for the base body only; on the 3D board the tower falls through to
// gl-world's own stand-in cylinder, which is what that branch is for. Do not
// read either as the design.
// ---------------------------------------------------------------------------

function FarmTower(x, y, path) {
  this.x = x;
  this.y = y;

  // HOW HIGH THE GROUND UNDER IT IS, read once, at construction. Zero on dirt.
  // Every tower carries it; see the note in js/tower.js.
  this.groundHeight = groundHeightUnder(x, y);

  // Firing priority along the path. The Farm never fires, but `towers` is kept
  // sorted by this and a tower without the field sorts as undefined.
  this.pathProgress = path.progressAtPoint(x, y);
  this.path = path;

  this.name = FarmTower.DISPLAY_NAME;
  this.cost = FarmTower.COST;
  this.totalSpent = FarmTower.COST;

  this.hasA1 = false; this.hasA2 = false; this.hasA3 = false;
  this.hasA4 = false; this.hasA5 = false;
  this.hasB1 = false; this.hasB2 = false; this.hasB3 = false;
  this.hasB4 = false; this.hasB5 = false;
  this.hasC1 = false; this.hasC2 = false; this.hasC3 = false;
  this.hasC4 = false; this.hasC5 = false;

  // PATH A's private purse. From A4 the tower stops paying its production out
  // and keeps it here instead; `stock` is what the cloning compounds and what
  // A5's investment spends.
  this.stock = 0;
  this.tickTimer = 0;              // counts toward the next A3+ production tick

  // PATH A5's investment, as PERMANENT tranches already spent and a temporary
  // burst that is counted in tranches too. Both are read by `Farms.investment`,
  // which is what a boosted tower asks.
  this.investedTranches = 0;
  this.tempTranches = 0;
  this.tempTimer = 0;

  // PATH C. `dice` is what this farm contributed last time it rolled, kept so
  // the panel can show the player what their own tower threw.
  this.lastRolls = [];

  // WHAT THIS TOWER HAS MADE, for as long as it has stood. Two totals rather
  // than one because the Farm makes two different things and no tier makes
  // both in the same way: every tier produces mana (per wave, per tick, per
  // kill, or into its own stock), and path B's tiers also grow the base's
  // maximum HP. They exist because production was INVISIBLE: a plain farm pays
  // 200 mana into the purse at the wave boundary with no popup and no row, so
  // the only evidence it worked was arithmetic on the purse across a wave.
  // Owner, having placed one and watched: "the tower is supposed to produce
  // mana, and it doesn't rn". It did. Nothing said so.
  //
  // Lifetime totals, so investing the stock or spending the purse never moves
  // them, and the result screen picks both up through RESULT_TOTAL_LABELS.
  this.manaProduced = 0;
  this.baseHpProduced = 0;

  this.aim = -Math.PI / 2;
  this.showRange = false;

  TowerHealth.init(this, FarmTower.BASE_HP);
  TowerScore.init(this);

  this.recalcStats();
  this.currentHp = this.maxHp;

  Farms.register(this);
}

FarmTower.DISPLAY_NAME = "Farm";

// Stable id for the meta catalogue and save data. See js/meta.js.
FarmTower.ID = "farm";

FarmTower.COST = 1200;
FarmTower.BASE_HP = 200;

// THE FOOTPRINT IS A RADIUS IN u.l., like every other tower's, and 35 is the
// largest on the board -- the Summoner's 25 was until now. C1 takes it down to
// 25. The owner's first figure was 100; measured against the clearance rule
// (half the road plus the footprint) that would have left almost no legal
// ground on any map, so it was raised as a question and settled at 35.
FarmTower.FOOTPRINT_RADIUS_UL = 35;
FarmTower.C1_FOOTPRINT_RADIUS_UL = 25;

// It has no reach until path B buys one. Zero is a real answer here rather than
// a placeholder: a farm with no B tier taxes nothing, sees nothing and draws no
// circle, and `TowerStats.range` prints the number it is given.
FarmTower.BASE_RANGE_UL = 0;

// Mana per wave, before any upgrade.
FarmTower.BASE_PRODUCTION = 200;

// From A3 the per-wave figure is replaced by a tick. This is the clock; the
// amount per tick is on the tier.
FarmTower.TICK_SECONDS = 5;

// A5's investment. Tranches are whole and the remainder stays stocked.
FarmTower.TRANCHE = 10000;
FarmTower.MAX_TRANCHES = 10;             // 100 000 mana in one go
FarmTower.TEMP_SECONDS = 30;
FarmTower.TEMP_MULTIPLIER = 5;
FarmTower.TRANCHE_BONUS = 0.05;          // +5% damage, attack speed and range

// B5 executes anything under the HIGHER of these two.
FarmTower.EXECUTE_FLAT = 10;
FarmTower.EXECUTE_FRACTION = 0.05;


// --- the three branches -----------------------------------------------------
//
// Every row is a DELTA except `rangeUl`, `productionPer5s` and `footprintUl`,
// which are absolutes the highest owned tier wins -- the same two-column
// arrangement the Warbringer uses, and for the same reason: "+150 mana a wave"
// has to mean +150 whatever else is owned, while "range is 200 now" is a
// restatement that later tiers replace.

FarmTower.UPGRADES = [
  { id: "A1", branch: "A", cost: 250, hp: 50, production: 50 },
  { id: "A2", branch: "A", cost: 675, hp: 100, production: 150, requires: "A1" },
  // A3 STOPS PAYING BY THE WAVE AND STARTS PAYING BY THE CLOCK. `productionPer5s`
  // is what makes the switch: once any tier carries it, the per-wave column is
  // no longer read at all (see `producesPerWave`).
  { id: "A3", branch: "A", cost: 1600, hp: 150, productionPer5s: 50,
    requires: "A2", locksPath: true },
  { id: "A4", branch: "A", cost: 3500, hp: 300, productionPer5s: 75,
    requires: "A3", locksPath: true, stores: true, cloneCap: 1000 },
  { id: "A5", branch: "A", cost: 13000, hp: 500, productionPer5s: 150,
    requires: "A4", locksPath: true, stores: true, cloneCap: 3000, invests: true },

  { id: "B1", branch: "B", cost: 150, hp: 0, baseHpPerWave: 15 },
  { id: "B2", branch: "B", cost: 550, hp: 50, production: 50, baseHpPerWave: 35,
    requires: "B1" },
  { id: "B3", branch: "B", cost: 1800, hp: 150, production: 150, baseHpPerWave: 100,
    rangeUl: 150, manaPerKill: 1, baseHpPerKill: 1,
    requires: "B2", locksPath: true },
  // B4 AND B5 ARE UNIQUE ON THE MAP -- one of the two, not one of each. The
  // rule is enforced in `whyCannotUpgrade` so a refused button says why, and
  // again in `applyUpgrade` so nothing can route around the panel.
  { id: "B4", branch: "B", cost: 2500, hp: 0, baseHpPerWave: 100,
    rangeUl: 200, manaPerKill: 3, baseHpPerKill: 3,
    fieldSlow: 0.05, fieldAmp: 0.05,
    requires: "B3", locksPath: true, unique: "field" },
  { id: "B5", branch: "B", cost: 5000, hp: 0, baseHpPerWave: 200,
    rangeUl: 300, manaPerKill: 10, baseHpPerKill: 5,
    fieldSlow: 0.10, fieldAmp: 0.10, executes: true,
    requires: "B4", locksPath: true, unique: "field" },

  { id: "C1", branch: "C", cost: 300, hp: 50, footprintUl: 25 },
  // C2 buys a dodge and NOTHING else. The brief says "aucun HP supplémentaire"
  // in as many words, so the zero is authored rather than omitted.
  { id: "C2", branch: "C", cost: 600, hp: 0, dodge: 0.20, requires: "C1" },
  { id: "C3", branch: "C", cost: 1600, hp: 150, production: 100,
    dice: 1, table: "C3", requires: "C2", locksPath: true },
  { id: "C4", branch: "C", cost: 3500, hp: 300, production: 200,
    dice: 2, table: "C4", requires: "C3", locksPath: true },
  { id: "C5", branch: "C", cost: 9000, hp: 500, production: 500,
    dice: 3, table: "C5", requires: "C4", locksPath: true, unique: "c5" }
];

FarmTower.upgradeById = function (id) {
  for (var i = 0; i < FarmTower.UPGRADES.length; i++) {
    if (FarmTower.UPGRADES[i].id === id) return FarmTower.UPGRADES[i];
  }
  return null;
};


// --- resolved stats ---------------------------------------------------------
//
// Rebuilt from the flags on every change, so an upgrade can never leave a stale
// number behind and the order tiers were bought in cannot matter. Same fold the
// Warbringer and the Summoner use.

FarmTower.prototype.hasUpgrade = function (id) {
  return this["has" + id] === true;
};

FarmTower.prototype.recalcStats = function () {
  var maxHp = FarmTower.BASE_HP;
  var production = FarmTower.BASE_PRODUCTION;
  var perTick = 0;
  var rangeUl = FarmTower.BASE_RANGE_UL;
  var footprintUl = FarmTower.FOOTPRINT_RADIUS_UL;
  var baseHpPerWave = 0;
  var manaPerKill = 0;
  var baseHpPerKill = 0;

  this.dodgeChance = 0;
  this.fieldSlow = 0;
  this.fieldAmp = 0;
  this.executes = false;
  this.stores = false;
  this.cloneCap = 0;
  this.invests = false;
  this.diceCount = 0;
  this.diceTable = null;
  this.upgradeCount = 0;

  for (var i = 0; i < FarmTower.UPGRADES.length; i++) {
    var u = FarmTower.UPGRADES[i];
    if (!this.hasUpgrade(u.id)) continue;
    this.upgradeCount++;

    maxHp += u.hp || 0;
    production += u.production || 0;
    baseHpPerWave += u.baseHpPerWave || 0;
    manaPerKill += u.manaPerKill || 0;
    baseHpPerKill += u.baseHpPerKill || 0;

    if (u.productionPer5s !== undefined) perTick = Math.max(perTick, u.productionPer5s);
    if (u.rangeUl !== undefined) rangeUl = Math.max(rangeUl, u.rangeUl);
    if (u.footprintUl !== undefined) footprintUl = Math.min(footprintUl, u.footprintUl);
    if (u.dodge !== undefined) this.dodgeChance = Math.max(this.dodgeChance, u.dodge);
    if (u.fieldSlow !== undefined) this.fieldSlow = Math.max(this.fieldSlow, u.fieldSlow);
    if (u.fieldAmp !== undefined) this.fieldAmp = Math.max(this.fieldAmp, u.fieldAmp);
    if (u.executes) this.executes = true;
    if (u.stores) this.stores = true;
    if (u.cloneCap !== undefined) this.cloneCap = Math.max(this.cloneCap, u.cloneCap);
    if (u.invests) this.invests = true;
    if (u.dice !== undefined) { this.diceCount = u.dice; this.diceTable = u.table; }
  }

  this.perWaveProduction = production;
  this.perTickProduction = perTick;
  this.baseHpPerWave = baseHpPerWave;
  this.manaPerKill = manaPerKill;
  this.baseHpPerKill = baseHpPerKill;

  this.rangeUl = rangeUl;
  this.rangePx = rangeUl > 0 ? elevatedRangePx(this, rangeUl) : 0;
  this.footprintRadiusUl = footprintUl;
  this.footprintPx = ul(footprintUl);

  this.maxHp = maxHp;
  if (this.currentHp === undefined) this.currentHp = maxHp;
};

// PRODUCTION IS EITHER A WAVE'S WORTH OR A TICK'S, never both. A3 replaces the
// per-wave figure rather than adding to it -- "remplace la production par vague
// par 50 mana toutes les 5 secondes" -- so the per-wave column stops being read
// the moment any tier carries a tick. The crosspathed B2/B3 production a path-A
// farm may hold goes with it, which is what "replaces" means.
FarmTower.prototype.producesPerWave = function () {
  return this.perTickProduction > 0 ? 0 : this.perWaveProduction;
};

// What this farm contributes to the C network's baseline B. A farm on the C
// path is always paying by the wave -- a T3 on C locks A at 2, so it can never
// hold A3 -- and its nominal production is exactly its per-wave figure.
FarmTower.prototype.nominalProduction = function () {
  return this.producesPerWave();
};

FarmTower.prototype.lockedBranch = function () {
  for (var i = 0; i < FarmTower.UPGRADES.length; i++) {
    var u = FarmTower.UPGRADES[i];
    if (u.locksPath && this.hasUpgrade(u.id)) return u.branch;
  }
  return null;
};

FarmTower.prototype.nextUpgrade = function (branch) {
  for (var i = 0; i < FarmTower.UPGRADES.length; i++) {
    var u = FarmTower.UPGRADES[i];
    if (u.branch === branch && !this.hasUpgrade(u.id)) return u;
  }
  return null;
};

// THREE BRANCHES, ONE CROSSPATH RULE. Reaching tier 3 on any branch caps BOTH
// others at tier 2 -- the two-branch rule the Warbringer, the Rifleman and the
// Summoner share, said for three. The brief settles it from the other end: a
// farm with a main path at T3+ wears that path's model, and its secondary
// upgrades are T1/T2 only.
FarmTower.prototype.whyCannotUpgrade = function (id) {
  var u = FarmTower.upgradeById(id);
  if (!u) return "no such upgrade";
  if (this.hasUpgrade(id)) return "already owned";
  if (u.requires && !this.hasUpgrade(u.requires)) return "needs " + u.requires;

  var locked = this.lockedBranch();
  if (locked !== null && locked !== u.branch) {
    return "path " + locked + " is committed";
  }
  if (u.unique && Farms.uniqueHolder(u.unique, this)) {
    return u.unique === "c5" ? "one C5 per map" : "one B4 or B5 per map";
  }
  return null;
};

// What the shared `buyUpgrade` in game.js charges. Every upgradeable tower
// answers this; without it a Farm reads as "not upgradeable" and the panel
// buttons do nothing.
FarmTower.prototype.upgradeCost = function (id) {
  var u = FarmTower.upgradeById(id);
  return u ? u.cost : 0;
};

FarmTower.prototype.applyUpgrade = function (id) {
  var refusal = this.whyCannotUpgrade(id);
  if (refusal) return refusal;

  this["has" + id] = true;
  // Everything sunk in, which is what a sale refunds half of. Grown here
  // rather than in `buyUpgrade` because that is where every other tower
  // grows it, and a tier applied by a fixture is still a tier bought.
  this.totalSpent += this.upgradeCost(id);
  var before = this.maxHp;
  this.recalcStats();
  // A HEALTH TIER GRANTS ITS DELTA rather than healing to the new maximum, the
  // rule both other upgradeable towers follow since 2026-08-01.
  this.currentHp += this.maxHp - before;

  Farms.onUpgraded(this);
  return null;
};

// The panel's before/after card measures this tower rather than reading the
// table, exactly as the Warbringer's does: set the flag, refold, diff, put it
// back. Nothing in `recalcStats` touches live state, which is what makes that
// safe -- see the note on the Summoner's `clampTimersToCycle` for the trap.
FarmTower.prototype.previewUpgrade = function (id) {
  var u = FarmTower.upgradeById(id);
  if (!u) return { changes: [], effects: [], grants: [] };

  var snap = this.statSnapshot();
  var had = this.hasUpgrade(id);
  this["has" + id] = true;
  this.recalcStats();
  var after = this.statSnapshot();
  this["has" + id] = had;
  this.recalcStats();

  var changes = [];
  var effects = [];
  function num(label, from, to, suffix, digits) {
    if (from === to) return;
    var d = to - from;
    changes.push({
      label: label,
      from: FarmTower.fmt(from, digits) + (suffix || ""),
      to: FarmTower.fmt(to, digits) + (suffix || ""),
      delta: (d > 0 ? "+" : "") + FarmTower.fmt(d, digits)
    });
  }

  num("Mana / wave", snap.perWave, after.perWave, "");
  num("Mana / 5 s", snap.perTick, after.perTick, "");
  num("Range", snap.range, after.range, " u.l.");
  num("Footprint", snap.footprint, after.footprint, " u.l.");
  num("Base HP / wave", snap.baseHpPerWave, after.baseHpPerWave, "");
  num("Mana / kill", snap.manaPerKill, after.manaPerKill, "");
  num("Base HP / kill", snap.baseHpPerKill, after.baseHpPerKill, "");
  num("Tower HP", snap.maxHp, after.maxHp, "");

  if (after.perWave !== snap.perWave) {
    effects.push((after.perWave - snap.perWave > 0 ? "+" : "") +
      (after.perWave - snap.perWave) + " mana/wave");
  }
  if (after.perTick !== snap.perTick) {
    effects.push(after.perTick + " mana every " + FarmTower.TICK_SECONDS + " s");
  }
  if (after.range !== snap.range) effects.push(after.range + " u.l. range");
  if (after.footprint !== snap.footprint) {
    effects.push(after.footprint + " u.l. footprint");
  }
  if (after.baseHpPerWave !== snap.baseHpPerWave) {
    effects.push("+" + (after.baseHpPerWave - snap.baseHpPerWave) + " base HP/wave");
  }
  if (after.manaPerKill !== snap.manaPerKill) {
    effects.push("+" + (after.manaPerKill - snap.manaPerKill) + " mana/kill");
  }
  if (after.maxHp !== snap.maxHp) effects.push("+" + (after.maxHp - snap.maxHp) + " HP");
  if (u.dodge) effects.push(Math.round(u.dodge * 100) + "% dodge");
  if (u.fieldSlow) effects.push(Math.round(u.fieldSlow * 100) + "% slow field");
  if (u.fieldAmp) effects.push("+" + Math.round(u.fieldAmp * 100) + "% damage taken");
  if (u.executes) effects.push("executes");
  if (u.stores && !snap.stores) effects.push("stores its own mana");
  if (u.invests) effects.push("investment");
  if (u.dice) effects.push(u.dice + "× d" + FarmDice.sides(u.table));

  var grants = [];
  if (u.stores && !snap.stores) grants.push("farmStock");
  if (u.invests) grants.push("farmInvest");
  if (u.executes) grants.push("farmExecute");
  if (u.dice) grants.push("farmNetwork");

  return { changes: changes, effects: effects, grants: grants };
};

FarmTower.prototype.statSnapshot = function () {
  return {
    perWave: this.producesPerWave(),
    perTick: this.perTickProduction,
    range: this.rangeUl,
    footprint: this.footprintRadiusUl,
    baseHpPerWave: this.baseHpPerWave,
    manaPerKill: this.manaPerKill,
    baseHpPerKill: this.baseHpPerKill,
    maxHp: this.maxHp,
    stores: this.stores
  };
};

FarmTower.fmt = function (n, digits) {
  var d = digits === undefined ? 0 : digits;
  var r = Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
  return String(r);
};


// --- the clock --------------------------------------------------------------

FarmTower.prototype.update = function (dt) {
  if (this.tempTimer > 0) {
    // A residue, not an equality. `30 - 29.9 - 0.1` is 1.4e-15 in binary
    // floating point, so a surge tested against zero would run for ever --
    // the same trap the flash fields document in gl-world.
    this.tempTimer -= dt;
    if (this.tempTimer <= 1e-9) {
      this.tempTimer = 0;
      this.tempTranches = 0;
    }
  }

  // A3+ pays by the clock. Kept out of the wave hooks on purpose: a tick is a
  // property of time, so it advances at 3x speed and freezes with the run,
  // exactly like every other cooldown in the game.
  if (this.perTickProduction > 0) {
    this.tickTimer += dt;
    while (this.tickTimer >= FarmTower.TICK_SECONDS) {
      this.tickTimer -= FarmTower.TICK_SECONDS;
      this.produce(this.perTickProduction);
    }
  }
  return 0;
};

// THE ONE DOOR EVERY MANA THIS TOWER MAKES COMES THROUGH. From A4 it fills the
// tower's own stock instead of the purse, which is the whole of what "tout le
// mana produit est desormais stocke dans cette Farm" changes.
FarmTower.prototype.produce = function (amount) {
  if (amount <= 0) return 0;
  this.manaProduced += amount;
  // PRESENTATION ONLY, and guarded so the tests -- which run without Effects
  // on some paths -- and the sandbox behave identically with it and without.
  if (typeof Effects !== "undefined") {
    Effects.farmProduced(this, amount, !!this.stores);
  }
  if (this.stores) {
    this.stock += amount;
    return 0;
  }
  Farms.pay(amount);
  return amount;
};

// A4's cloning, at the end of a wave: five per cent of what is standing, capped.
FarmTower.prototype.cloneStock = function () {
  if (!this.stores || this.stock <= 0) return 0;
  var cloned = Math.min(this.stock * 0.05, this.cloneCap);
  this.stock += cloned;
  // Cloned mana is mana this farm made, so it counts. It does not go through
  // produce() because it never leaves the stock -- the clone IS the stock
  // growing -- and routing it there would pay a non-storing farm for a stock
  // it cannot have.
  this.manaProduced += cloned;
  return cloned;
};

// A5's investment. Whole tranches only, a minimum of one, at most ten in a
// press; the remainder stays stocked because a partial tranche buys nothing.
FarmTower.prototype.tranchesAvailable = function () {
  return Math.min(FarmTower.MAX_TRANCHES,
    Math.floor(this.stock / FarmTower.TRANCHE));
};

FarmTower.prototype.invest = function (temporary) {
  if (!this.invests) return "needs A5";
  var n = this.tranchesAvailable();
  if (n < 1) return "needs " + FarmTower.TRANCHE + " mana";

  this.stock -= n * FarmTower.TRANCHE;
  if (temporary) {
    this.tempTranches = n;
    this.tempTimer = FarmTower.TEMP_SECONDS;
  } else {
    this.investedTranches += n;
  }
  return null;
};

// What a tower boosted by this farm gets, as a plain multiplier. Permanent
// tranches and a running temporary burst add: the burst is the same bonus
// multiplied by five, not a replacement for it.
FarmTower.prototype.investmentBonus = function () {
  var tranches = this.investedTranches +
    this.tempTranches * FarmTower.TEMP_MULTIPLIER;
  return tranches * FarmTower.TRANCHE_BONUS;
};


// --- path B's field ---------------------------------------------------------

FarmTower.prototype.covers = function (x, y) {
  if (this.rangePx <= 0) return false;
  var dx = x - this.x, dy = y - this.y;
  return dx * dx + dy * dy <= this.rangePx * this.rangePx;
};

FarmTower.prototype.executeThreshold = function (enemy) {
  return Math.max(FarmTower.EXECUTE_FLAT,
    (enemy.maxHealth || 0) * FarmTower.EXECUTE_FRACTION);
};


// --- the tower contract -----------------------------------------------------

FarmTower.prototype.takeDamage = function (amount) {
  // C2's dodge takes the WHOLE attack, "et son eventuel effet negatif" -- so it
  // is answered here, at the one door damage comes through, and `Farms.dodged`
  // is what a stun asks before it lands.
  if (this.rollDodge()) return 0;
  return TowerHealth.damage(this, amount);
};

FarmTower.prototype.rollDodge = function () {
  if (this.dodgeChance <= 0) return false;
  return Farms.roll() < this.dodgeChance;
};

FarmTower.prototype.isDestroyed = function () {
  return TowerHealth.isDestroyed(this);
};

FarmTower.prototype.onRemoved = function () {
  Farms.unregister(this);
};

FarmTower.prototype.containsPoint = Tower.prototype.containsPoint;

// It never attacks, and both of these exist for ONE caller: `Enemy.towerDps`,
// the Tyrant's aimed shot, which looks for the board's best piece. A Farm
// answering a real number would invite the boss to silence a tower that has no
// output to silence, so it answers zero and is never the pick -- the opposite
// of the Summoner's answer, and for the opposite reason: a Summoner's fleet IS
// its damage, and a Farm has none at all.
FarmTower.prototype.attackDamage = function () { return 0; };
FarmTower.prototype.attacksPerSecond = function () { return 0; };

FarmTower.prototype.statLines = function () {
  var rows = [];

  if (this.perTickProduction > 0) {
    rows.push(["Mana", this.perTickProduction + " / " + FarmTower.TICK_SECONDS + " s"]);
  } else if (Farms.inNetwork(this)) {
    rows.push(["Mana", this.nominalProduction() + " / wave  (networked)"]);
  } else {
    rows.push(["Mana", this.producesPerWave() + " / wave"]);
  }

  if (this.stores) {
    rows.push(["Stored", Math.round(this.stock) + " mana"]);
    rows.push(["Cloned / wave", "5%  (max " + this.cloneCap + ")"]);
  }
  if (this.invests) {
    var t = this.investedTranches;
    rows.push(["Invested", t + " × " + FarmTower.TRANCHE +
      (t ? "  (+" + Math.round(t * FarmTower.TRANCHE_BONUS * 100) + "%)" : "")]);
    if (this.tempTimer > 0) {
      rows.push(["Surge", "+" + Math.round(this.tempTranches *
        FarmTower.TEMP_MULTIPLIER * FarmTower.TRANCHE_BONUS * 100) + "%  ·  " +
        Math.ceil(this.tempTimer) + " s"]);
    }
  }

  if (this.rangeUl > 0) rows.push(TowerStats.range(this));
  if (this.baseHpPerWave > 0) rows.push(["Base HP / wave", "+" + this.baseHpPerWave]);
  if (this.manaPerKill > 0) {
    rows.push(["Per kill in range", "+" + this.manaPerKill + " mana, +" +
      this.baseHpPerKill + " base HP"]);
  }
  if (this.fieldSlow > 0) {
    rows.push(["Field", Math.round(this.fieldSlow * 100) + "% slow, +" +
      Math.round(this.fieldAmp * 100) + "% damage taken"]);
  }
  if (this.executes) {
    rows.push(["Execute", "under " + FarmTower.EXECUTE_FLAT + " HP or " +
      Math.round(FarmTower.EXECUTE_FRACTION * 100) + "%"]);
  }
  if (this.dodgeChance > 0) {
    rows.push(["Dodge", Math.round(this.dodgeChance * 100) + "%"]);
  }
  if (this.diceCount > 0) {
    rows.push(["Dice", this.diceCount + " × d" + FarmDice.sides(this.diceTable)]);
    if (this.lastRolls.length) rows.push(["Last roll", this.lastRolls.join(", ")]);
    rows.push(["Network", Math.round(Farms.network.P) + " / " +
      Math.round(Farms.network.B) + " mana"]);
  }

  // THE LIFETIME TOTALS, last before the health line and always in this order.
  // Mana is unconditional because every tier makes some; base HP appears only
  // on a tower that has a tier which makes it, so a farm with no B tier does
  // not print a zero it can never move (the same no-invented-zeroes rule the
  // result screen is built on).
  rows.push(["Mana produced", TowerStats.formatTotal(this.manaProduced)]);
  if (this.baseHpPerWave > 0 || this.baseHpPerKill > 0 || this.baseHpProduced > 0) {
    rows.push(["Base HP produced", TowerStats.formatTotal(this.baseHpProduced)]);
  }

  rows.push(["Tower HP", TowerHealth.label(this)]);
  return rows;
};

FarmTower.prototype.panelActions = function () {
  var actions = [];
  var self = this;

  ["A", "B", "C"].forEach(function (branch) {
    var next = self.nextUpgrade(branch);
    if (!next) {
      actions.push({
        id: "upgrade" + branch, branch: branch, upgradeId: null,
        label: "Path " + branch + "  MAXED", detail: "maxed",
        effects: "every tier bought", reason: "every tier bought",
        enabled: false, tone: "upgrade",
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
      id: "upgrade" + branch, branch: branch, upgradeId: next.id,
      label: "Path " + branch + " → " + next.id,
      detail: refusal ? refusal : next.cost + " mana",
      effects: refusal ? refusal : preview.effects.join(", "),
      reason: refusal,
      enabled: refusal === null && (typeof cash !== "number" || cash >= next.cost),
      tone: "upgrade",
      tooltip: function () {
        return UpgradeEffects.card({
          title: self.name + "  ·  " + next.id,
          subtitle: refusal ? refusal : next.cost + " mana",
          changes: preview.changes,
          abilities: UpgradeEffects.abilities(preview.grants, null),
          note: refusal ? "Unavailable: " + refusal + "." : null
        });
      }
    });
  });

  if (this.invests) {
    var n = this.tranchesAvailable();
    var ready = n >= 1;
    var perm = Math.round(n * FarmTower.TRANCHE_BONUS * 100);
    actions.push({
      id: "investPermanent",
      label: "Invest  (permanent)",
      detail: ready ? n + " × " + FarmTower.TRANCHE + " mana" : "needs 10000 mana",
      effects: ready ? "+" + perm + "% damage, attack speed and range" : "not enough stored",
      enabled: ready, tone: "ability",
      tooltip: UpgradeEffects.card({
        title: "Invest  ·  permanent",
        subtitle: ready ? n + " tranche" + (n === 1 ? "" : "s") : "needs 10000 mana",
        note: "Whole tranches of " + FarmTower.TRANCHE + " mana, ten at most. " +
          "Each is +5% damage, attack speed and range for every tower at tier 5 " +
          "or above, and for the units they summon. The remainder stays stored."
      })
    });
    actions.push({
      id: "investSurge",
      label: "Invest  (surge)",
      detail: ready ? n + " × " + FarmTower.TRANCHE + " mana" : "needs 10000 mana",
      effects: ready ? "+" + (perm * FarmTower.TEMP_MULTIPLIER) + "% for " +
        FarmTower.TEMP_SECONDS + " s" : "not enough stored",
      enabled: ready, tone: "ability",
      tooltip: UpgradeEffects.card({
        title: "Invest  ·  surge",
        subtitle: FarmTower.TEMP_SECONDS + " seconds",
        note: "The same tranches at five times the bonus, for " +
          FarmTower.TEMP_SECONDS + " seconds. The mana is spent either way."
      })
    });
  }

  return actions;
};

FarmTower.prototype.performAction = function (id) {
  if (id === "investPermanent" || id === "investSurge") {
    var refused = this.invest(id === "investSurge");
    return refused ? refused : this.name + " → invested";
  }
  if (id === "upgradeA" || id === "upgradeB" || id === "upgradeC") {
    var next = this.nextUpgrade(id.slice(7));
    if (!next) return "maxed";
    return buyUpgrade(this, next.id);
  }
  return null;
};


// --- the placeholder body ---------------------------------------------------
//
// PROVISIONAL, AND MEANT TO LOOK IT. The brief's base model is a hooded
// salvager-wizard behind a repaired dark-metal cauldron of cyan-violet mana on
// a wood-and-scrap platform, and eleven more bodies follow it. None are built.
// What is drawn here is that silhouette reduced to the four shapes that make it
// recognisable from the top down -- platform, cauldron, mana, hood -- so a
// player can find the Farm on the bar and on the board without mistaking it for
// a finished asset.

FarmTower.PLACEHOLDER = {
  plank: "#3b3128",
  metal: "#4a4f56",
  rim: "#6d757e",
  cauldron: "#23262b",
  mana: "#7fe3ff",
  manaDeep: "#8b6ff0",
  robe: "#39323f",
  hood: "#2a2530"
};

FarmTower.paintPlaceholder = function (ctx, cx, cy, r) {
  var p = FarmTower.PLACEHOLDER;

  // The platform: dark wood with a salvaged plate across it.
  ctx.fillStyle = p.plank;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.metal;
  ctx.fillRect(cx - r * 0.9, cy + r * 0.18, r * 1.8, r * 0.26);

  // The hooded figure, immediately behind the cauldron.
  ctx.fillStyle = p.robe;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.34, cy - r * 0.05);
  ctx.lineTo(cx + r * 0.34, cy - r * 0.05);
  ctx.lineTo(cx + r * 0.22, cy - r * 0.62);
  ctx.lineTo(cx - r * 0.22, cy - r * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = p.hood;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.66, r * 0.24, 0, Math.PI * 2);
  ctx.fill();

  // The cauldron, and the mana in it.
  ctx.fillStyle = p.cauldron;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.06, r * 0.56, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  var glow = ctx.createRadialGradient
    ? ctx.createRadialGradient(cx, cy - r * 0.02, 1, cx, cy - r * 0.02, r * 0.42)
    : null;
  if (glow && glow.addColorStop) {
    glow.addColorStop(0, p.mana);
    glow.addColorStop(1, p.manaDeep);
    ctx.fillStyle = glow;
  } else {
    ctx.fillStyle = p.mana;
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.02, r * 0.40, r * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();

  // Two rivets and a strap, so the metal reads as repaired rather than new.
  ctx.strokeStyle = p.rim;
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.56, cy + r * 0.06);
  ctx.lineTo(cx + r * 0.56, cy + r * 0.06);
  ctx.stroke();
};

FarmTower.drawIcon = function (ctx, cx, cy, size) {
  FarmTower.paintPlaceholder(ctx, cx, cy, size * 0.42);
};

FarmTower.prototype.draw = function (ctx) {
  // The 2D board only. On the 3D board gl-world draws its own stand-in for a
  // tower with no registered model, which is what that branch exists for.
  FarmTower.paintPlaceholder(ctx, this.x, this.y, this.footprintPx);

  if (this.showRange && this.rangePx > 0) {
    ctx.strokeStyle = "rgba(127,227,255,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.rangePx, 0, Math.PI * 2);
    ctx.stroke();
  }
};


// ---------------------------------------------------------------------------
// FarmDice -- the three tables, and one resolver.
//
// A FACE IS DATA. Every row is `{ n, apply }` or a plain descriptor, and the
// resolver reads the descriptor rather than branching on the number -- the same
// rule js/enemy.js follows for its mechanic blocks. That is what lets the three
// tables differ by their numbers alone and what makes "every face of the three
// tables" a thing a test can walk.
//
// The vocabulary a face may use:
//   flat        a number added to P (negative to subtract)
//   percent     a fraction of P added (negative to subtract)
//   worstOf     take the LARGER loss of `flat` and `percent`
//   bestOf      take the LARGER gain of `flat` and `percent`
//   thenPercent applied AFTER the flat part, to the new P
//   reset       P returns to B
//   double      P doubles
//   nextFlat / nextPercent / nextMult   modify the NEXT gain in this series
//   prep        a C5 effect recorded now and applied to the NEXT wave's series
// ---------------------------------------------------------------------------

var FarmDice = (function () {
  "use strict";

  var C3 = [
    { face: 1,  percent: -0.35 },
    { face: 2,  worstOf: true, flat: -230, percent: -0.10 },
    { face: 3,  flat: -170 },
    { face: 4,  flat: -100 },
    { face: 5,  flat: -70 },
    { face: 6,  flat: -50 },
    { face: 7,  flat: -35 },
    { face: 8,  reset: true },
    { face: 9,  flat: 30 },
    { face: 10, flat: 45 },
    { face: 11, flat: 60 },
    { face: 12, flat: 85 },
    { face: 13, flat: 100 },
    { face: 14, flat: 150 },
    { face: 15, bestOf: true, flat: 180, percent: 0.04 },
    { face: 16, nextFlat: 180 },
    { face: 17, nextFlat: 300, nextPercent: 0.12 },
    { face: 18, bestOf: true, flat: 240, percent: 0.06 },
    { face: 19, nextMult: 1.30 },
    { face: 20, flat: 300, thenPercent: 0.10 }
  ];

  var C4 = [
    { face: 1,  percent: -0.50 },
    { face: 2,  worstOf: true, flat: -500, percent: -0.20 },
    { face: 3,  flat: -350 },
    { face: 4,  flat: -200 },
    { face: 5,  flat: -120 },
    { face: 6,  flat: -80 },
    { face: 7,  flat: -50 },
    { face: 8,  reset: true },
    { face: 9,  flat: 60 },
    { face: 10, flat: 85 },
    { face: 11, flat: 120 },
    { face: 12, flat: 165 },
    { face: 13, flat: 225 },
    { face: 14, flat: 300 },
    { face: 15, bestOf: true, flat: 350, percent: 0.06 },
    { face: 16, nextFlat: 475 },
    { face: 17, nextFlat: 600, nextPercent: 0.30 },
    { face: 18, bestOf: true, flat: 475, percent: 0.12 },
    { face: 19, nextMult: 2.25 },
    { face: 20, flat: 600, thenPercent: 0.18 }
  ];

  var C5 = [
    { face: 1,  percent: -0.50 },
    { face: 2,  worstOf: true, flat: -500, percent: -0.20 },
    { face: 3,  flat: -350 },
    { face: 4,  flat: -200 },
    { face: 5,  flat: -120 },
    { face: 6,  flat: -80 },
    { face: 7,  flat: -50 },
    { face: 8,  reset: true },
    { face: 9,  flat: 75 },
    { face: 10, flat: 110 },
    { face: 11, flat: 150 },
    { face: 12, flat: 200 },
    { face: 13, prep: { rerollEights: 3 } },
    { face: 14, flat: 400, prep: { dieBonus: 1 } },
    { face: 15, bestOf: true, flat: 450, percent: 0.10 },
    { face: 16, flat: 250, prep: { dieBonus: 2 } },
    { face: 17, nextFlat: 700, nextPercent: 0.35 },
    { face: 18, bestOf: true, flat: 550, percent: 0.15 },
    { face: 19, nextMult: 2.5 },
    { face: 20, flat: 750, thenPercent: 0.20 },
    { face: 21, double: true },
    { face: 22, double: true, prep: { cullBelow9: true } }
  ];

  var TABLES = { C3: C3, C4: C4, C5: C5 };

  function table(id) { return TABLES[id] || C3; }
  function sides(id) { return table(id).length; }
  function faceOf(id, n) { return table(id)[n - 1]; }

  return { table: table, sides: sides, faceOf: faceOf, TABLES: TABLES };
})();


// ---------------------------------------------------------------------------
// Farms -- everything about farms that is not about ONE farm.
//
// The board-wide half: who is registered, which unique tiers are taken, the C
// network and its dice, the field an enemy standing in one is under, and the
// three moments the game calls in at. It is a module rather than a bag of
// globals in game.js for the reason js/systems/* are modules: a farm's rules
// are a farm's business, and game.js should only have to say WHEN.
// ---------------------------------------------------------------------------

var Farms = (function () {
  "use strict";

  var list = [];

  // The C network. `B` is the sum of every member's nominal production and is
  // recomputed whenever membership changes; `P` is the permanent, dice-battered
  // figure the player is actually paid, and it moves ONLY through the dice.
  var network = { P: 0, B: 0, live: false };

  // Effects a C5 recorded during wave N, to be applied to wave N+1's series.
  var prep = { rerollEights: 0, dieBonuses: [], cullBelow9: false };

  // A run's dice stream. Seeded, never Math.random -- see the file header.
  var rngState = 0x9e3779b9;

  // The last wave number `settleWave` paid for. See the note there.
  var settledWave = 0;

  function seed(n) { rngState = (n >>> 0) || 0x9e3779b9; }

  function roll() {
    // xorshift32, the same generator the Summoner lays its blubs out with.
    var x = rngState;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;  x >>>= 0;
    rngState = x;
    return x / 4294967296;
  }

  function fairDie(sides) { return 1 + Math.floor(roll() * sides); }

  // THE DIE IS A VARIABLE so a test can hand the network a scripted sequence
  // and walk every face of all three tables. Nothing in the game replaces it,
  // and `reset()` puts the fair one back -- a stuck die surviving a restart
  // would be a fixture leaking into a run.
  var rollDie = fairDie;

  // THE NETWORK OBJECT IS NEVER REPLACED, only emptied. It is handed out by
  // reference (`Farms.network`), so rebinding the local would leave the panel,
  // the tests and the sandbox reading a snapshot of the previous run for ever.
  // Found by the suite: every network figure came back zero because the object
  // being read was the one `reset()` had orphaned.
  function reset() {
    list = [];
    network.P = 0;
    network.B = 0;
    network.live = false;
    prep = { rerollEights: 0, dieBonuses: [], cullBelow9: false };
    rollDie = fairDie;
    seed(0x9e3779b9);
    // THE WAVE LATCH GOES WITH THE RUN, and forgetting it is a live defect
    // rather than tidiness: `settleWave` refuses a number it has already seen,
    // so a second run would silently skip its own wave 1 -- the wave every farm
    // placed before the first Send is waiting to be paid for. Found by the
    // suite, which settles wave 1 once per face and got the first answer
    // sixty-one times.
    settledWave = 0;
  }

  function register(farm) {
    if (list.indexOf(farm) === -1) list.push(farm);
  }

  function unregister(farm) {
    var i = list.indexOf(farm);
    if (i !== -1) list.splice(i, 1);
    refreshNetwork();
  }

  function living() {
    return list.filter(function (f) {
      return !(f.isDestroyed && f.isDestroyed()) && !f.removed;
    });
  }

  function members() {
    return living().filter(function (f) { return f.diceCount > 0; });
  }

  function inNetwork(farm) { return farm.diceCount > 0 && network.live; }

  // Who already holds a unique tier, ignoring `except`. `unique: "field"` is
  // B4 AND B5 together -- the brief says one of the two on the map, not one of
  // each -- and `unique: "c5"` is C5 alone.
  function uniqueHolder(kind, except) {
    var all = living();
    for (var i = 0; i < all.length; i++) {
      var f = all[i];
      if (f === except) continue;
      if (kind === "field" && (f.hasB4 || f.hasB5)) return f;
      if (kind === "c5" && f.hasC5) return f;
    }
    return null;
  }

  // B is the sum of the nominal productions. P starts AT B the moment the
  // network comes into being and never tracks it again: a farm joining later
  // raises the baseline a face 8 resets to, and does not undo the dice.
  function refreshNetwork() {
    var m = members();
    var b = 0;
    for (var i = 0; i < m.length; i++) b += m[i].nominalProduction();
    network.B = b;
    if (m.length === 0) {
      network.live = false;
      network.P = 0;
      return;
    }
    if (!network.live) {
      network.live = true;
      network.P = b;
      seed(0x9e3779b9 ^ (Math.round(b) * 2654435761));
    }
  }

  function onUpgraded() { refreshNetwork(); }

  function pay(amount) {
    if (amount <= 0) return 0;
    if (typeof cash === "number") cash += amount;
    return amount;
  }

  // --- the field an enemy is standing in ------------------------------------
  //
  // Read by js/enemy.js on its two hot paths, so it is a plain loop over a
  // short list with a length test in front of it: with no farms on the board it
  // costs one comparison, which is the same shape `mapSightBlockers` uses.

  function fieldAt(x, y) {
    if (!list.length) return null;
    var slow = 0, amp = 0, executes = false;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f.fieldSlow <= 0 && !f.executes) continue;
      if (f.isDestroyed && f.isDestroyed()) continue;
      if (!f.covers(x, y)) continue;
      // Only one B4/B5 can exist, so these are a max rather than a sum by
      // construction; written as a max anyway so a future second field is a
      // data change rather than a surprise.
      if (f.fieldSlow > slow) slow = f.fieldSlow;
      if (f.fieldAmp > amp) amp = f.fieldAmp;
      if (f.executes) executes = true;
    }
    if (slow === 0 && amp === 0 && !executes) return null;
    return { slow: slow, amp: amp, executes: executes };
  }

  // ADDITIVE WITH EVERY OTHER DEBUFF, which the brief asks for by name. It is
  // returned as a fraction and js/enemy.js adds it to whatever DamageAmp is
  // carrying rather than multiplying the two.
  function damageAmpAt(x, y) {
    var f = fieldAt(x, y);
    return f ? f.amp : 0;
  }

  function slowAt(x, y) {
    var f = fieldAt(x, y);
    return f ? f.slow : 0;
  }

  // B5's execution. Asked AFTER a blow has landed, so "attacked in the field"
  // is exactly what it means: a body that walks in untouched is not executed.
  function executes(enemy) {
    if (!enemy || !enemy.pos) return false;
    var f = fieldAt(enemy.pos.x, enemy.pos.y);
    if (!f || !f.executes) return false;
    var threshold = Math.max(FarmTower.EXECUTE_FLAT,
      (enemy.maxHealth || 0) * FarmTower.EXECUTE_FRACTION);
    return enemy.health > 0 && enemy.health < threshold;
  }

  // --- kills in range -------------------------------------------------------
  //
  // B3+ pays for a body that dies inside its circle, and several farms stack
  // fully: "les recompenses de plusieurs B3 se cumulent entierement".
  // A SUMMONED body pays nothing, which is the brief's "ennemi non invoque" and
  // the same rule the Hive's brood already lives under.

  function onEnemyKilled(enemy) {
    if (!list.length || !enemy || !enemy.pos) return { mana: 0, baseHp: 0 };
    if (enemy.noBounty) return { mana: 0, baseHp: 0 };

    var mana = 0, baseHp = 0;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f.manaPerKill <= 0) continue;
      if (f.isDestroyed && f.isDestroyed()) continue;
      if (!f.covers(enemy.pos.x, enemy.pos.y)) continue;
      mana += f.manaPerKill;
      baseHp += f.baseHpPerKill;
      // Credited here rather than through produce(): the payment below is one
      // call for the whole board, and a B-path farm cannot hold A4 anyway (a
      // T3 on B caps A at 2), so there is no stock for this mana to fall into.
      f.manaProduced += f.manaPerKill;
      f.baseHpProduced += f.baseHpPerKill;
    }
    if (mana > 0) pay(mana);
    if (baseHp > 0 && typeof growBaseMaxHp === "function") growBaseMaxHp(baseHp);
    return { mana: mana, baseHp: baseHp };
  }

  // --- the investment a boosted tower reads ---------------------------------
  //
  // A5 raises damage, attack speed and range by 5% a tranche for every tower at
  // TIER 5 OR ABOVE and for the units they summon. "Tier 5" is read off a
  // tower's own upgrade count reaching five on one branch, which is the only
  // spelling all five types share.

  function investment() {
    var total = 0;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f.invests) continue;
      if (f.isDestroyed && f.isDestroyed()) continue;
      total += f.investmentBonus();
    }
    return total;
  }

  // --- the wave boundary ----------------------------------------------------

  // END OF A WAVE. Production for the wave that just ended, path A's cloning,
  // and the C network's dice. LATCHED ON THE WAVE NUMBER for the same reason
  // `payWaveBounty` is latched: it is reachable from every gate plus two safety
  // nets, and paying a wave twice is the whole risk in a design with four doors.
  function settleWave(number) {
    if (!number || number === settledWave) return null;
    settledWave = number;

    var paid = 0, cloned = 0, baseHp = 0;
    var all = living();
    var i;

    for (i = 0; i < all.length; i++) {
      var f = all[i];
      // A networked farm is paid THROUGH the network and never twice; its
      // nominal production is already inside B and therefore inside P.
      if (!inNetwork(f)) paid += f.produce(f.producesPerWave());
      cloned += f.cloneStock();
      baseHp += f.baseHpPerWave;
      f.baseHpProduced += f.baseHpPerWave;
    }
    if (baseHp > 0 && typeof growBaseMaxHp === "function") growBaseMaxHp(baseHp);

    var rolled = network.live ? rollNetwork() : null;
    return { paid: paid, cloned: cloned, baseHp: baseHp, dice: rolled };
  }

  // START OF A WAVE. The network pays P, and the payment does not consume it.
  //
  // P belongs to the network, not to any one farm, so it is SPLIT across the
  // members for the lifetime totals -- by each farm's share of B, which is the
  // only per-farm number the network is built out of. Without this a C-path
  // farm would read "0 mana produced" for a whole run while paying the player
  // every wave, which is precisely the illusion these totals exist to end.
  function openWave() {
    if (!network.live) return 0;
    var amount = Math.max(0, Math.round(network.P));
    if (amount <= 0) return 0;

    var m = members();
    if (m.length) {
      var i;
      var share = network.B > 0 ? 0 : amount / m.length;
      for (i = 0; i < m.length; i++) {
        m[i].manaProduced += network.B > 0
          ? amount * (m[i].nominalProduction() / network.B)
          : share;
      }
    }
    return pay(amount);
  }

  // --- the dice -------------------------------------------------------------

  function rollNetwork() {
    var m = members();
    var i, k;
    var rolls = [];

    for (i = 0; i < m.length; i++) {
      m[i].lastRolls = [];
      for (k = 0; k < m[i].diceCount; k++) {
        var sides = FarmDice.sides(m[i].diceTable);
        rolls.push({ farm: m[i], table: m[i].diceTable, n: rollDie(sides) });
      }
    }

    var hasC5 = false;
    for (i = 0; i < m.length; i++) if (m[i].hasC5) hasC5 = true;

    rolls = applyPrep(rolls, hasC5);

    // WITHOUT A C5 THE ORDER IS RANDOM, with one it is sorted low to high --
    // which is the whole of what C5's third line buys, and it matters because
    // the "next gain" faces are worth more when the gains after them are big.
    if (hasC5) {
      rolls.sort(function (a, b) { return a.n - b.n; });
    } else {
      shuffle(rolls);
    }

    var series = { nextFlat: 0, nextPercent: 0, nextMult: 1 };
    var pending = { rerollEights: 0, dieBonuses: [], cullBelow9: false };

    for (i = 0; i < rolls.length; i++) {
      resolve(rolls[i], series, pending);
      rolls[i].farm.lastRolls.push(rolls[i].n);
    }

    prep = pending;
    return rolls.map(function (r) { return r.n; });
  }

  // THE MANDATED ORDER, and it is mandated because every step can change what
  // the next one sees. Straight out of the brief:
  //   1. a face 13's protections reroll up to three 8s
  //   2. the +1/+2 land on C5 dice
  //   3. a +2 that produces exactly 8 becomes 9
  //   4. a previous face 22 removes what is still under 9
  //   5. what survives is sorted
  //   6. and resolved low to high
  // Steps 5 and 6 are the caller's; 1 to 4 are here.
  function applyPrep(rolls, hasC5) {
    var i;

    var rerolls = prep.rerollEights;
    for (i = 0; i < rolls.length && rerolls > 0; i++) {
      if (rolls[i].n !== 8) continue;
      rolls[i].n = rollDie(FarmDice.sides(rolls[i].table));
      rerolls--;
    }

    var bonuses = prep.dieBonuses.slice();
    for (i = 0; i < rolls.length && bonuses.length; i++) {
      if (rolls[i].table !== "C5") continue;      // C5 dice only, per the brief
      var add = bonuses.shift();
      var sides = FarmDice.sides(rolls[i].table);
      var moved = Math.min(sides, rolls[i].n + add);
      // A +2 THAT LANDS EXACTLY ON 8 BECOMES 9. Only a +2: the brief names the
      // face-16 charge, and a +1 arriving on 8 is left alone.
      if (add === 2 && moved === 8) moved = 9;
      rolls[i].n = moved;
    }

    if (prep.cullBelow9) {
      rolls = rolls.filter(function (r) { return r.n >= 9; });
    }

    // Unused charges expire with the series they were prepared for.
    prep = { rerollEights: 0, dieBonuses: [], cullBelow9: false };
    return rolls;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(roll() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }

  // ONE RESOLVER FOR THREE TABLES. Nothing here branches on a face number --
  // the descriptor says what to do, which is what makes a new face a data
  // change and what lets a test walk all sixty-two of them.
  function resolve(entry, series, pending) {
    var f = FarmDice.faceOf(entry.table, entry.n);
    if (!f) return;

    if (f.reset) { network.P = network.B; return; }

    if (f.prep) {
      if (f.prep.rerollEights) {
        pending.rerollEights = Math.max(pending.rerollEights, f.prep.rerollEights);
      }
      if (f.prep.dieBonus) pending.dieBonuses.push(f.prep.dieBonus);
      if (f.prep.cullBelow9) pending.cullBelow9 = true;
    }

    if (f.nextFlat !== undefined) series.nextFlat += f.nextFlat;
    if (f.nextPercent !== undefined) {
      series.nextPercent = Math.max(series.nextPercent, f.nextPercent);
    }
    if (f.nextMult !== undefined) series.nextMult *= f.nextMult;

    if (f.double) { network.P = Math.max(0, network.P * 2); return; }

    var delta = 0;
    if (f.worstOf) {
      // "en prenant la perte la plus importante" -- the bigger loss wins.
      delta = -Math.max(Math.abs(f.flat), Math.abs(network.P * f.percent));
    } else if (f.bestOf) {
      delta = Math.max(f.flat, network.P * f.percent);
    } else if (f.percent !== undefined) {
      delta = network.P * f.percent;
    } else if (f.flat !== undefined) {
      delta = f.flat;
    }

    if (delta > 0) {
      // A "next gain" charge is spent on the next gain and on nothing else, so
      // it is applied here and cleared here.
      delta *= series.nextMult;
      delta += series.nextFlat;
      if (series.nextPercent > 0) delta += delta * series.nextPercent;
      series.nextFlat = 0; series.nextPercent = 0; series.nextMult = 1;
    }

    network.P = Math.max(0, network.P + delta);
    if (f.thenPercent !== undefined) {
      network.P = Math.max(0, network.P * (1 + f.thenPercent));
    }
  }

  return {
    register: register,
    unregister: unregister,
    onUpgraded: onUpgraded,
    reset: reset,
    living: living,
    members: members,
    inNetwork: inNetwork,
    uniqueHolder: uniqueHolder,
    pay: pay,
    roll: roll,
    fieldAt: fieldAt,
    slowAt: slowAt,
    damageAmpAt: damageAmpAt,
    executes: executes,
    onEnemyKilled: onEnemyKilled,
    investment: investment,
    settleWave: settleWave,
    openWave: openWave,
    // Exposed so the panel, the tests and the sandbox can read the network
    // without a second copy of the arithmetic.
    network: network,
    prepState: function () { return prep; },
    seed: seed,
    // Test seam ONLY: hand the network a scripted die. `reset()` puts the fair
    // one back, so a fixture cannot leak into a run.
    setDie: function (fn) { rollDie = fn || fairDie; },
    // What a settled wave rolled, for the panel and the tests.
    faces: function (tableId) { return FarmDice.table(tableId); }
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { FarmTower: FarmTower, FarmDice: FarmDice, Farms: Farms };
}
