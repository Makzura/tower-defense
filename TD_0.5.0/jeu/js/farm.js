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
  // Of that total, what a sale refunds nothing of. Only C5 adds to it, and it
  // is a plain number rather than a lookup so `sellValue` stays one line of
  // arithmetic over fields every tower could carry.
  this.unrefundableSpent = 0;

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

  // HOW FAR INTO ITS OWN ANIMATION THIS TOWER IS, in simulation seconds.
  //
  // The Farm's three models carry an AUTHORED loop rather than a solved cycle
  // (tools/glb_to_animated.py), and something has to say where in that loop the
  // crank currently is. It is accumulated HERE, off `update`'s dt, rather than
  // read from the wall clock in the renderer -- which is what `state.now` is,
  // and what the Summoner's idle uses. The difference is the whole point: this
  // one advances on the fixed step, so the well turns three times as fast at 3x
  // speed and stops dead when the run freezes, exactly like the production it
  // is a picture of. A crank still turning over a paused board would be the
  // tower telling the player it is working when it is not.
  //
  // Raw seconds, never wrapped: the renderer divides by the model's own
  // `loopSeconds` and takes the remainder, because the model is what knows how
  // long its loop is. An hour-long run reaches 3600, which is nowhere near a
  // double's precision.
  this.animClock = 0;

  // WHEN EACH ONE-SHOT LAST FIRED, on that same clock, or -1 for never.
  //
  // The T3 models ship an idle loop AND action clips that depict things this
  // tower already does: A3's `produce_tick` is a production tick, B3's
  // `target_lock` is a body entering the field and `kill_capture` is one dying
  // in it, C3's `end_wave_roll` is the network rolling its dice. So the
  // simulation records WHEN, in animClock seconds, and the renderer decides
  // whether that is recent enough to still be playing -- which is the same
  // one-way arrangement as `swingProgress` and `gearPhase`: presentation reads
  // the simulation, and nothing here reads back.
  //
  // -1 rather than 0 because 0 is a real moment: a farm placed and paid on the
  // same step would otherwise play its tick at birth.
  this.lastTick = -1;        // A3/A4: a production tick landed
  this.lastLock = -1;        // B3/B4: a body entered the field
  this.lastCapture = -1;     // B3/B4: a body died inside it
  this.lastRoll = -1;        // C3/C4: the network threw its dice
  this.lastClone = -1;       // A4: the stock cloned itself at a wave boundary
  this.lastWithdraw = -1;    // A4: the player collected the stock
  this.lastGain = -1;        // B4/B5: the field granted the base its hit points
  this.lastEmpower = -1;     // A5: an investment was aimed at a tower
  this.lastExecute = -1;     // B5: the field executed something outright
  this.lastPrep = -1;        // C5: a prep effect was recorded or spent
  // WHICH prep clip, as a name, for the same reason `rollOutcome` is a name:
  // the C5 table is what knows a face 13 from a face 22, and a renderer that
  // re-read the table would be the table in two places.
  this.prepClip = null;
  // Whether this farm's investment was the permanent one, so A5 can tell its
  // two empower clips apart. Set beside `lastEmpower` and read with it.
  this.empowerTemporary = false;
  // WHAT THE LAST THROW MEANT, as a clip name or null -- `result_positive`,
  // `result_negative`, `result_reset`, `critical_success`, `critical_failure`.
  // C4's model has a body for each, and the network already knows which one
  // happened; carrying the NAME rather than a number keeps the decision in the
  // simulation, where the dice are, instead of asking the renderer to re-read a
  // face table it has no business knowing.
  this.rollOutcome = null;

  // Whether the field held anybody last step, so `lastLock` can fire on the
  // EDGE -- a body arriving -- rather than every step something is standing
  // there. Simulation state, but read by nothing that simulates.
  this.fieldHeld = false;

  // PATH A5's investment, as PERMANENT tranches already spent and a temporary
  // burst that is counted in tranches too. Both are read by `Farms.investment`,
  // which is what a boosted tower asks.
  this.investedTranches = 0;
  this.tempTranches = 0;
  this.tempTimer = 0;
  // WHICH TOWER the running surge is on. The bonus lives on that tower; this
  // is the farm's half of the arrangement, so the clock that ends the surge
  // knows what to take it off.
  this.tempTarget = null;

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

  // The bearing the EYE holds, eased toward whatever the field is watching.
  // Starts where the body faces, so a scanner that has never seen anything is
  // looking the way it was built. See update().
  this.viewYaw = this.aim;

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

// How fast the eye catches up, as the rate in `1 - exp(-k dt)`. At 6 it covers
// about 95% of a turn in half a second -- quick enough to read as tracking,
// slow enough that a body crossing the circle does not make it flick.
FarmTower.VIEW_EASE = 6;

// A4's clone, as a fraction of the standing stock. Named because three places
// quote it -- the panel row, the Collect card and the index's description of
// the tier -- and a rate typed out four times is a rate that drifts.
FarmTower.CLONE_RATE = 0.05;

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
  // C5 IS THE ONE TIER THE GAME DOES NOT BUY BACK. 250 000 mana, none of it
  // refunded, for the only die on the board that can double P twice over -- and
  // the only tier anywhere carrying `noRefund`. Priced and sunk this way on
  // 2026-08-28 at the owner's instruction: at 9 000 with the usual half back it
  // was a rounding error against a network already paying thousands a wave, and
  // a one-per-map tier that can be sold for half is a tier you rent.
  { id: "C5", branch: "C", cost: 250000, hp: 500, production: 400,
    dice: 3, table: "C5", requires: "C4", locksPath: true, unique: "c5",
    noRefund: true }
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

  // --- what the PERMANENT upgrades write, at their neutral values -----------
  //
  // ALL INERT AS SET HERE. The five that are absolutes are declared FROM the
  // tower's own constants, so an unequipped Farm resolves the authored number
  // by construction rather than by a copy somebody has to keep in step.
  //
  // **A FARM HAS SEVERAL DIFFERENT KINDS OF MANA AND THEY ARE NOT ONE
  // QUANTITY.** Fixed per-wave production, A3+ timed ticks, mana already
  // STORED, the A4/A5 clone, a withdrawal, B-path kill bounty, the C network's
  // B and P, and a refund are eight separate things that merely share a unit.
  // Each field below states which of them it touches and no node may quietly
  // widen it:
  //
  //   tickSeconds       Accelerated Boiler. The A3+ CLOCK, and not the value
  //                     of a tick
  //   outputMult        Liquid License. PRODUCTION -- the fixed per-wave
  //                     payment and the timed ticks. Not the clone, not a
  //                     withdrawal, not a kill bounty, not a refund
  //   consortiumSolo / consortiumPer / consortiumCap
  //                     Consortium, resolved LIVE from how many other farms are
  //                     standing, so a farm dying mid-run moves it at once
  //   sellRefundRate    Liquid License's other half; 0 means "use the game's"
  //   trancheBonus / tempMultiplier   Patient Investment, A5's two figures
  //   manaArmorPerPoint / manaArmorMax   Mana Armor: stored mana per point of
  //                     damage prevented, and the largest share it may prevent
  //   executeFlat / executeFraction   Execution Tithe, B5's two thresholds
  //   diceProtectNatural / diceAmortizedReset / diceGainScale
  //                     Path C. Read off the FARM whose die is resolving, so
  //                     two farms in one network roll under their own loadouts
  this.tickSeconds = FarmTower.TICK_SECONDS;
  this.outputMult = 1;
  this.consortiumSolo = 0;
  this.consortiumPer = 0;
  this.consortiumCap = 0;
  this.sellRefundRate = 0;
  this.trancheBonus = FarmTower.TRANCHE_BONUS;
  this.tempMultiplier = FarmTower.TEMP_MULTIPLIER;
  this.manaArmorPerPoint = 0;
  this.manaArmorMax = 0;
  this.executeFlat = FarmTower.EXECUTE_FLAT;
  this.executeFraction = FarmTower.EXECUTE_FRACTION;
  this.diceProtectNatural = 0;
  this.diceAmortizedReset = 0;
  this.diceGainScale = 1;

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

  // AND THE PLAYER'S LOADOUT, last. Range comes through elevatedRangePx, so
  // this is damage, rate of fire and health -- the three a Player module can
  // move on any type. See js/systems/player-effects.js.
  if (typeof PlayerEffects !== "undefined") {
    var pDmg = PlayerEffects.damageScale(this);
    if (pDmg !== 1 && typeof this.damage === "number") this.damage *= pDmg;
    var pRate = PlayerEffects.fireRateScale(this);
    if (pRate !== 1) {
      if (typeof this.shotsPerSecond === "number") this.shotsPerSecond *= pRate;
      if (typeof this.cooldownSeconds === "number") this.cooldownSeconds /= pRate;
      if (typeof this.tickSeconds === "number") this.tickSeconds /= pRate;
    }
    this.maxHp = PlayerEffects.scaledMaxHp(this.maxHp);
  }
};

// THE FARM'S OWN LAST WORD, called by TowerPerks once the equipped nodes have
// written onto this instance -- which is AFTER `recalcStats` has already
// cached the two derived world-space numbers from the pre-perk values. Compact
// Estate shrinks the footprint and nothing else here moves, but both are
// re-derived from the resolved stats rather than adjusted, so this is safe to
// run on every restat.
FarmTower.prototype.afterPerks = function () {
  this.footprintPx = ul(this.footprintRadiusUl);
  this.rangePx = this.rangeUl > 0 ? elevatedRangePx(this, this.rangeUl) : 0;
};

// PRODUCTION IS BOTH A WAVE'S WORTH AND A TICK'S, from A3 on.
//
// It was EITHER/OR until 2026-08-28, on the brief's word "remplace": A3 read
// as replacing the per-wave figure with 50 mana every five seconds. Played,
// that is a downgrade dressed as a tier -- 1600 mana to trade 400 a wave for
// 50 every five seconds, and the per-wave column it silently switched off
// included the crosspathed B2 the player had also paid for. Owner: "it stops
// producing mana every wave from the moment it starts producing mana each five
// seconds. So that's the problem, because it's way too weak. It should continue
// producing mana as it already did."
//
// So the tick is ADDED. Nothing a farm has bought is ever turned off by
// something else it buys, which is the rule the rest of the tree already
// follows and the one this line was the only exception to.
FarmTower.prototype.producesPerWave = function () {
  return this.perWaveProduction * this.productionScale();
};

// WHAT MULTIPLIES THIS FARM'S PRODUCTION, and production means exactly two
// things: the fixed per-wave payment and the A3+ timed ticks. **The clone, a
// withdrawal, a kill bounty and a refund are not production** and never come
// through here -- see the note on `outputMult` in recalcStats.
//
// It is APPLIED ONCE PER AMOUNT. A farm outside the C network is paid through
// `produce(producesPerWave())`; one inside it contributes
// `nominalProduction()` -- the same function -- to the network's B and is not
// paid separately, so neither route can bill the same mana twice.
//
// Consortium is resolved LIVE rather than folded into a stat, because the
// answer changes when a farm elsewhere on the board dies or is sold. It counts
// OTHER farms only and reads nothing about their output, so it can neither
// count itself nor compound against another farm's already-modified figure.
FarmTower.prototype.productionScale = function () {
  var scale = this.outputMult;
  if (this.consortiumPer > 0 || this.consortiumSolo !== 0) {
    var others = 0;
    var all = Farms.living();
    for (var i = 0; i < all.length; i++) if (all[i] !== this) others++;
    scale *= 1 + this.consortiumSolo +
      Math.min(this.consortiumCap, this.consortiumPer * others);
  }
  return scale;
};

// What this farm contributes to the C network's baseline B. A farm on the C
// path is always paying by the wave -- a T3 on C locks A at 2, so it can never
// hold A3 and therefore never has a tick -- and its nominal production is
// exactly its per-wave figure.
FarmTower.prototype.nominalProduction = function () {
  return this.producesPerWave();
};

// How many tiers this farm owns on a branch. Tiers are sequential -- every row
// past the first names its `requires` -- so this is also the highest tier owned.
FarmTower.prototype.tiersOwned = function (branch) {
  var n = 0;
  for (var t = 1; t <= 5; t++) if (this["has" + branch + t]) n++;
  return n;
};

// The tier number inside its own branch: "B4" is 4. Read off the id rather than
// counted, so a row moved in the table cannot change what it means.
FarmTower.tierNumber = function (id) {
  var n = parseInt(String(id).slice(1), 10);
  return isNaN(n) ? 0 : n;
};
FarmTower.prototype.tierNumber = function (id) {
  return FarmTower.tierNumber(id);
};

// The branch that has passed tier 2, or null while none has. That is what
// "committed" means: the one branch allowed to go on to 5.
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

  // THE CROSSPATH: AT MOST TWO BRANCHES, ONE TO 5 AND THE OTHER TO 2.
  //
  // Both halves were wrong. `lockedBranch` alone refused every other branch
  // outright once one reached T3 -- so a farm that went straight up A could
  // never buy B1, even though the secondary is supposed to be open to tier 2.
  // And nothing counted branches at all, so before any T3 a farm could put two
  // tiers on ALL THREE and only then discover it had painted itself in. Owner:
  // "max 2 paths, one goes up to 2 and the other to 5; right now if a path goes
  // to 3 all other paths get blocked even still at 0, and if none goes to 3 the
  // three can go up to 2 and then it's broken."
  //
  // Said as two rules, in the order a player meets them:
  var tier = this.tierNumber(id);

  //   1. A THIRD BRANCH IS NEVER STARTED. Checked on the branch being opened,
  //      so it fires at the moment of the mistake rather than later.
  if (this.tiersOwned(u.branch) === 0) {
    var started = 0;
    ["A", "B", "C"].forEach(function (b) {
      if (b !== u.branch && this.tiersOwned(b) > 0) started++;
    }, this);
    if (started >= 2) return "two paths at most";
  }

  //   2. ONLY ONE BRANCH PASSES TIER 2, and it is whichever got there first.
  if (tier >= 3) {
    var committed = this.lockedBranch();
    if (committed !== null && committed !== u.branch) {
      return "path " + committed + " is committed";
    }
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
  // And the part of it a sale will not give back. See sellValue in game.js.
  var tier = FarmTower.upgradeById(id);
  if (tier && tier.noRefund) this.unrefundableSpent += this.upgradeCost(id);
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
  // SAID ON THE BUTTON, not only in the card: a quarter of a million mana that
  // a sale gives nothing back for is the kind of thing a player must be told
  // before the press rather than after it.
  if (u.noRefund) effects.push("no refund on sale");

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

FarmTower.prototype.update = function (dt, enemies) {
  // The animation's clock, first and unconditionally: a farm animates whatever
  // else it is doing, and it is the one thing here that is true of every tier.
  this.animClock += dt;

  // A BODY ARRIVING IN THE FIELD, on the edge and not on the state. Only a
  // farm with a field asks -- `rangePx` is 0 until path B buys one -- so a
  // board without one pays a single comparison, and the loop stops at the
  // first body rather than counting them.
  if (this.rangePx > 0 && enemies) {
    // AND THE MACHINE TURNS TO WATCH IT. Every other tower in the game faces
    // what it is working on -- `aim` is read by gl-world's tower loop as the
    // draw yaw -- and the Farm was the only one that stared at a fixed bearing
    // whatever walked through its circle. Owner: "the eyes of the whole machine
    // should be looking at the enemy; right now it just looks at a random place
    // and it's useless."
    //
    // The NEAREST covered body, so a crowd does not make the eye jitter between
    // two equals, and the same sweep that finds the lock edge finds it -- one
    // pass over the enemies, not two.
    var holding = false;
    var closest = null, closestD2 = Infinity;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e || e.dead || !e.pos) continue;
      if (!this.covers(e.pos.x, e.pos.y)) continue;
      holding = true;
      var dx = e.pos.x - this.x, dy = e.pos.y - this.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < closestD2) { closestD2 = d2; closest = e; }
    }
    if (holding && !this.fieldHeld) this.lastLock = this.animClock;
    this.fieldHeld = holding;

    // WHERE THE EYE IS LOOKING, and it is NOT the tower's `aim`.
    //
    // Turning `aim` swung the whole machine -- skid, pylons, operator and all --
    // which is what every other tower does and what this one must not: owner,
    // "the whole model turns, which is not right; only the eye should turn,
    // notice how it already turns alone when in idle". So the bearing is kept
    // here and gl-world spends it on ONE group, the eye's, about its own axis.
    //
    // EASED, NOT SNAPPED. "Make sure the motion is smooth and not staggered;
    // since it doesn't shoot it's alright if he's not exactly on the first
    // enemy." A fixed fraction per second, taken the short way round the circle
    // so a target crossing behind the tower does not send the eye the long way.
    if (closest) {
      var want = Math.atan2(closest.pos.y - this.y, closest.pos.x - this.x);
      var delta = want - this.viewYaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      // 1 - exp(-k dt) rather than a constant step: framerate-independent, and
      // it eases in the way a heavy instrument would rather than ramping.
      this.viewYaw += delta * (1 - Math.exp(-FarmTower.VIEW_EASE * dt));
    }
  }

  if (this.tempTimer > 0) {
    // A residue, not an equality. `30 - 29.9 - 0.1` is 1.4e-15 in binary
    // floating point, so a surge tested against zero would run for ever --
    // the same trap the flash fields document in gl-world.
    this.tempTimer -= dt;
    // The bonus comes OFF the tower it was put on, here and nowhere else. This
    // is the whole clock: it advances at 3x speed and freezes with the run,
    // because it is the tower update loop's dt like every other cooldown.
    if (this.tempTimer <= 1e-9) this.clearSurge();
  }

  // A3+ pays by the clock. Kept out of the wave hooks on purpose: a tick is a
  // property of time, so it advances at 3x speed and freezes with the run,
  // exactly like every other cooldown in the game.
  if (this.perTickProduction > 0) {
    // OFF THE INSTANCE since 2026-08-31: Accelerated Boiler shortens the clock
    // and nothing else does. The VALUE of a tick is `perTickProduction` and
    // that node does not touch it -- what it buys is a tick arriving sooner.
    var period = this.tickSeconds > 0 ? this.tickSeconds : FarmTower.TICK_SECONDS;
    this.tickTimer += dt;
    while (this.tickTimer >= period) {
      this.tickTimer -= period;
      // A tick is PRODUCTION, so it carries the same scale the per-wave
      // payment does -- and carries it here, once, rather than inside
      // `produce`, which the clone and a withdrawal also pass through.
      this.produce(this.perTickProduction * this.productionScale());
      this.lastTick = this.animClock;
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
  var cloned = Math.min(this.stock * FarmTower.CLONE_RATE, this.cloneCap);
  this.stock += cloned;
  // Cloned mana is mana this farm made, so it counts. It does not go through
  // produce() because it never leaves the stock -- the clone IS the stock
  // growing -- and routing it there would pay a non-storing farm for a stock
  // it cannot have.
  this.manaProduced += cloned;
  this.lastClone = this.animClock;
  // BUT IT IS ANNOUNCED LIKE ANYTHING ELSE IT MAKES. Owner: "we can't see
  // whenever an A4 or A5 tower produces mana between waves -- the cloned mana
  // from the storage." Everything else a farm makes throws a popup through
  // produce(); the clone was the one gain with no sign at all, and it is the
  // one that only ever happens between waves, when nothing else on the board is
  // moving to explain the stock going up.
  if (cloned > 0 && typeof Effects !== "undefined") {
    Effects.farmProduced(this, cloned, true);
  }
  return cloned;
};

// TAKE THE STOCK OUT, ALL OF IT, WHENEVER YOU LIKE.
//
// Missing until 2026-08-28, and its absence was most of what made path A read
// as a trap: from A4 the tower stops paying into the purse and fills its own
// stock instead, and the only door out of that stock was A5's investment --
// which needs 13 000 more mana to exist and spends in whole tranches of ten
// thousand. So an A4 farm was a jar with no lid. Owner: "we can't take the mana
// stored whenever we want, which is supposed to be the point."
//
// It is free and it is immediate, and the cost is the one the design already
// has: what you take out stops compounding. `cloneStock` pays 5% of what is
// STANDING at the end of a wave, so collecting every wave turns the tower back
// into an ordinary per-wave farm and leaving it in is what makes A4 worth its
// price. That trade is the decision this button exists to offer.
//
// It does NOT touch `manaProduced`: this mana was counted when it was made, and
// counting it again on the way out would make the total a measure of how often
// the player pressed a button.
FarmTower.prototype.collect = function () {
  if (!this.stores) return "needs A4";
  if (this.stock <= 0) return "nothing stored";

  var amount = this.stock;
  this.stock = 0;
  this.lastWithdraw = this.animClock;
  Farms.pay(amount);
  if (typeof Effects !== "undefined") Effects.farmProduced(this, amount, false);
  return null;
};

// A5's investment. Whole tranches only, a minimum of one, at most ten in a
// press; the remainder stays stocked because a partial tranche buys nothing.
FarmTower.prototype.tranchesAvailable = function () {
  return Math.min(FarmTower.MAX_TRANCHES,
    Math.floor(this.stock / FarmTower.TRANCHE));
};

// THE INVESTMENT IS AIMED, AND THE PERMANENT ONE LANDS ONCE PER TOWER.
//
// Both were true of nothing until 2026-08-28. The bonus was a board-wide figure
// `Farms.investment()` that no tower read, so pressing Invest spent the stock
// and changed nothing at all. Owner: "we can't choose who to boost with the
// ability -- we're supposed to click on the ability, then click on the tower,
// and that target boosted. Also make sure the boosts are one time only: for the
// permanent one it can only boost a tower once. Boosted with 10k is boosted --
// it is limited to 100k, but you can't boost it ten times at 10k."
//
// So: `target` is mandatory, the bonus lives ON the target (see FarmBoost), and
// a tower that already carries a permanent boost refuses a second one whatever
// it would be worth. The ten-tranche ceiling is therefore a ceiling on the ONE
// press a tower ever gets, not on a running total -- 100 000 mana at once is
// +50%, and 10 000 ten times is +5% and nine refusals.
//
// The SURGE has no such rule. It is thirty seconds long and it is meant to be
// pressed again, on the same tower or another one.
FarmTower.prototype.invest = function (target, temporary) {
  if (!this.invests) return "needs A5";
  if (!target) return "pick a tower";

  var refusal = FarmBoost.whyCannotBoost(target, !temporary);
  if (refusal) return refusal;

  var n = this.tranchesAvailable();
  if (n < 1) return "needs " + FarmTower.TRANCHE + " mana";

  this.stock -= n * FarmTower.TRANCHE;
  if (temporary) {
    // The farm keeps the surge's clock, because the farm already has one and a
    // second clock somewhere else would be a second thing that can disagree
    // with the simulation's step. The BONUS is on the target; the countdown
    // that ends it is here.
    this.clearSurge();
    this.tempTranches = n;
    this.tempTimer = FarmTower.TEMP_SECONDS;
    this.tempTarget = target;
    FarmBoost.grant(target, n * this.trancheBonus * this.tempMultiplier, true);
  } else {
    this.investedTranches += n;
    FarmBoost.grant(target, n * this.trancheBonus, false);
  }
  // The vault engine has a clip for each: a long beam for the permanent one,
  // a short bright burst for the surge. Same stamp, one flag to tell them apart.
  this.lastEmpower = this.animClock;
  this.empowerTemporary = !!temporary;
  return null;
};

// Take the running surge off whatever is carrying it. Called when the timer
// runs out, when a second surge replaces it, and when the farm is sold -- the
// bonus belongs to a farm that is paying for it, and a farm that is gone is
// not paying for anything.
FarmTower.prototype.clearSurge = function () {
  if (this.tempTarget) FarmBoost.clearSurge(this.tempTarget);
  this.tempTarget = null;
  this.tempTranches = 0;
  this.tempTimer = 0;
};

// What this farm's permanent tranches were worth, as a plain multiplier's
// fraction. Kept for the panel: the effect itself is on the towers it was
// spent on, and this is only the record of what was spent.
FarmTower.prototype.investmentBonus = function () {
  return this.investedTranches * this.trancheBonus;
};


// --- path B's field ---------------------------------------------------------

// IS THIS POINT INSIDE THE CIRCLE **AND** IN SIGHT OF THE TOWER.
//
// The sight half arrived 2026-08-28. Until then this was a plain radius test,
// which made path B the one reach on the board that ignored terrain: a farm
// behind a stump slowed, amplified, executed and got paid for bodies it could
// not see, while every weapon on the map -- and the red blind-spot overlay the
// player is shown over this very circle -- said the opposite. Owner: "make sure
// when a tower doesn't have vision the buff and debuff don't apply."
//
// Through `RangeFilter.sightClear`, which is the same door the Warbringer's
// acquisition and the Siphon's lock check use, so there is one answer to "can
// this tower see that point" and not a second one written here. The eye is the
// ground under the farm, exactly as it is for a weapon: a farm on a stump sees
// over everything at or below its own height.
FarmTower.prototype.covers = function (x, y) {
  if (this.rangePx <= 0) return false;
  var dx = x - this.x, dy = y - this.y;
  if (dx * dx + dy * dy > this.rangePx * this.rangePx) return false;
  // Cheap test first, always: sight is a shape loop and the circle throws most
  // candidates away before it runs. Same ordering RangeFilter.canTarget uses,
  // and for the same reason.
  if (typeof RangeFilter === "undefined") return true;
  return RangeFilter.sightClear(
    { x: this.x, y: this.y, groundHeight: this.groundHeight || 0 },
    { x: x, y: y });
};

// THE HIGHER OF THE TWO, and only the two constants move. Execution Tithe
// replaces them with 15 and 7.5%; the rule that combines them is B5's own and
// is untouched. Off the instance since 2026-08-31 so a permanent upgrade on one
// farm cannot change what another farm executes.
FarmTower.prototype.executeThreshold = function (enemy) {
  return Math.max(this.executeFlat,
    (enemy.maxHealth || 0) * this.executeFraction);
};


// --- the tower contract -----------------------------------------------------

FarmTower.prototype.takeDamage = function (amount) {
  // C2's dodge takes the WHOLE attack, "et son eventuel effet negatif" -- so it
  // is answered here, at the one door damage comes through, and `Farms.dodged`
  // is what a stun asks before it lands.
  if (this.rollDodge()) return 0;
  return TowerHealth.damage(this, this.spendManaArmor(amount));
};

// MANA ARMOR: this farm's OWN stored mana, burnt to make a hit smaller.
//
// Fifty stored mana buys one point of damage prevented, and at most half of any
// blow may be bought off. A farm that cannot afford the whole half buys what it
// can and takes the rest -- so an empty vault is simply no protection rather
// than a special case, and the stock can never go negative.
//
// IT IS THE TOWER'S ARMOUR AND NOT THE BASE'S, and it spends nothing that is
// not this farm's: never the player's purse, never another farm's stock. A blow
// that was already zero buys nothing, because there is nothing to prevent.
FarmTower.prototype.spendManaArmor = function (amount) {
  if (!(this.manaArmorPerPoint > 0) || !(this.manaArmorMax > 0)) return amount;
  if (!(amount > 0) || !this.stores || !(this.stock > 0)) return amount;

  var want = amount * this.manaArmorMax;
  var afford = this.stock / this.manaArmorPerPoint;
  var prevented = Math.min(want, afford);
  if (!(prevented > 0)) return amount;

  this.stock = Math.max(0, this.stock - prevented * this.manaArmorPerPoint);
  this.lastArmor = this.animClock;
  return amount - prevented;
};

FarmTower.prototype.rollDodge = function () {
  if (this.dodgeChance <= 0) return false;
  return Farms.roll() < this.dodgeChance;
};

FarmTower.prototype.isDestroyed = function () {
  return TowerHealth.isDestroyed(this);
};

FarmTower.prototype.onRemoved = function () {
  this.clearSurge();
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

// WHAT THIS FARM'S OWN DICE SHOWED, and whether each face was worth having.
//
// Returns one entry per die -- `{ face, kind }` -- or null for a farm that has
// never rolled. `kind` is read off the SAME table the resolver uses, so the
// colour a player sees and the arithmetic that moved P can never disagree:
// "gain", "loss", "reset" and "double" are the four things a face does.
//
// It exists because the throw was unreadable. The dice tumble, P moves, and
// nothing on the board says WHICH faces came up -- owner: "we have no way of
// knowing if it's bad or good except the animations, and it's not enough." The
// numbers are the answer, and the colour is the answer at a glance.
//
// The STRING and the reading are the tower's; gl-world only places them. Same
// division as the Summoner's counter, and for the same reason: a renderer that
// re-derived this would be the dice table in a second place.
FarmTower.prototype.rollFaces = function () {
  if (!this.diceCount || !this.lastRolls || !this.lastRolls.length) return null;
  var out = [];
  for (var i = 0; i < this.lastRolls.length; i++) {
    var n = this.lastRolls[i];
    var face = FarmDice.faceOf(this.diceTable, n);
    var kind = "gain";
    if (!face) kind = "gain";
    else if (face.double) kind = "double";
    else if (face.reset) kind = "reset";
    else if (face.percent < 0 || face.flat < 0 || face.worstOf) kind = "loss";
    else if (face.prep && face.flat === undefined && face.percent === undefined &&
             face.nextFlat === undefined && face.nextMult === undefined) {
      kind = "prep";
    }
    out.push({ face: n, kind: kind });
  }
  return out;
};

FarmTower.prototype.statLines = function () {
  var rows = [];

  // BOTH COLUMNS, because from A3 a farm really is paid on both -- see the note
  // on producesPerWave. One row rather than two: they are one answer to "how
  // much does this make", and a panel that split them read as two towers.
  var perWave = Farms.inNetwork(this)
    ? this.nominalProduction() + " / wave  (networked)"
    : this.producesPerWave() + " / wave";
  rows.push(["Mana", this.perTickProduction > 0
    ? perWave + "  ·  " + this.perTickProduction + " / " + FarmTower.TICK_SECONDS + " s"
    : perWave]);

  // ONE ROW, not two: the clone is a property OF the stock -- 5% of what is
  // standing at the end of a wave -- and reading it beside the figure it is a
  // percentage of is how a player decides whether to press Collect. Split
  // across two rows it was also the row that pushed an A5 panel through the
  // build bar once the Collect button arrived, which sandbox.smoke.js and the
  // suite both pin against.
  if (this.stores) {
    rows.push(["Stored", Math.round(this.stock) + " mana  ·  +" +
      Math.round(FarmTower.CLONE_RATE * 100) + "% a wave (max " +
      this.cloneCap + ")"]);
  }
  if (this.invests) {
    var t = this.investedTranches;
    rows.push(["Invested", t + " × " + FarmTower.TRANCHE +
      (t ? "  (+" + Math.round(t * FarmTower.TRANCHE_BONUS * 100) + "%)" : "")]);
    if (this.tempTimer > 0) {
      rows.push(["Surge", "+" + Math.round(this.tempTranches *
        FarmTower.TEMP_MULTIPLIER * FarmTower.TRANCHE_BONUS * 100) + "% on " +
        ((this.tempTarget && this.tempTarget.name) || "a tower") + "  ·  " +
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
  //
  // MARKED AS TOTALS (TowerStats.total), which is what keeps them off the
  // armoury card and out of the index: those two screens show a specimen that
  // has never produced anything, and they drop a row because it is a history
  // rather than because of where it sits in this list. See the note on
  // TowerStats.total -- this tower is the reason it exists.
  rows.push(TowerStats.total("Mana produced",
    TowerStats.formatTotal(this.manaProduced)));
  if (this.baseHpPerWave > 0 || this.baseHpPerKill > 0 || this.baseHpProduced > 0) {
    rows.push(TowerStats.total("Base HP produced",
      TowerStats.formatTotal(this.baseHpProduced)));
  }

  rows.push(["Tower HP", TowerHealth.label(this)]);
  return rows;
};

// THE PARAMETERS EVERY ABILITY SENTENCE QUOTES, in one place.
//
// js/systems/upgrade-effects.js holds the words; this holds the numbers, so a
// retuned tranche, clone rate or die moves the description with it and nobody
// has to remember that a sentence somewhere repeats the figure. Keyed by grant
// name, which is how `UpgradeEffects.abilities` looks a mechanic's parameters
// up -- the same contract the Rifleman's recruits use.
//
// `upgrade` is the tier being described, so the cap and the dice are the ones
// THAT tier buys rather than the ones this tower happens to own today.
FarmTower.prototype.abilityParams = function (upgrade) {
  return {
    farmStock: {
      rate: FarmTower.CLONE_RATE,
      cap: upgrade.cloneCap || this.cloneCap
    },
    farmInvest: {
      tranche: FarmTower.TRANCHE,
      maxTranches: FarmTower.MAX_TRANCHES,
      bonus: FarmTower.TRANCHE_BONUS,
      multiplier: FarmTower.TEMP_MULTIPLIER,
      seconds: FarmTower.TEMP_SECONDS,
      tierRequired: FarmBoost.TIER_REQUIRED
    },
    farmExecute: {
      flat: FarmTower.EXECUTE_FLAT,
      fraction: FarmTower.EXECUTE_FRACTION
    },
    farmNetwork: {
      dice: upgrade.dice,
      sides: FarmDice.sides(upgrade.table)
    }
  };
};

// THE ONE CONSEQUENCE A PRICE TAG CANNOT SHOW, in this tower's own terms.
//
// Every other tower says "Tier 3 commits this tower: the other branch is capped
// at tier 2 for good" on the tier that does the locking, and the Farm said
// nothing at all -- the one tower with THREE paths, and so the one where the
// rule most needs stating. Its rule is not the two-path one either: a farm
// opens at most two paths, and only one of them may pass tier 2 (see
// whyCannotUpgrade, which enforces both halves).
//
// Shown only while nothing is committed yet, exactly as the others do it: once
// a path is locked in, the refusal on the other buttons says so directly.
FarmTower.prototype.crosspathNote = function (upgrade) {
  if (!upgrade.locksPath || this.lockedBranch() !== null) return null;
  var tier = this.tierNumber(upgrade.id);
  var cap = tier - 1;

  // WHICH SECOND PATH, if one is already open. "One other path may still be
  // opened" is true of a farm standing on one path and false of a farm already
  // standing on two, and a note that says the wrong one of those is worse than
  // no note -- it is the sentence a player plans the rest of the tower around.
  var others = [];
  ["A", "B", "C"].forEach(function (b) {
    if (b !== upgrade.branch && this.tiersOwned(b) > 0) others.push(b);
  }, this);

  if (others.length) {
    return "Tier " + tier + " commits this farm to path " + upgrade.branch +
      ": path " + others.join(" and ") + " stays capped at tier " + cap +
      " for good, and no third path opens.";
  }
  return "Tier " + tier + " commits this farm to path " + upgrade.branch +
    ": one other path may still be opened, capped at tier " + cap +
    " for good, and never a third.";
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
      // THROUGH `upgradeCost`, NEVER OFF THE TABLE ROW (2026-08-30). A permanent
      // perk may move what a tier costs, and a button that quoted the authored
      // price while the till charged the perked one is the divergence this
      // whole file already avoids everywhere else.
      detail: refusal ? refusal : self.upgradeCost(next.id) + " mana",
      effects: refusal ? refusal : preview.effects.join(", "),
      reason: refusal,
      enabled: refusal === null &&
        (typeof cash !== "number" || cash >= self.upgradeCost(next.id)),
      tone: "upgrade",
      tooltip: function () {
        return UpgradeEffects.card({
          title: self.name + "  ·  " + next.id,
          subtitle: refusal ? refusal : self.upgradeCost(next.id) + " mana",
          changes: preview.changes,
          // THE NUMBERS FOR THE SENTENCES, off this tower's own constants and
          // the tier's own row rather than repeated in the description table --
          // the same arrangement the Rifleman's recruits have. Handing `null`
          // here is what left four tiers reading "No description written for
          // this one yet." in the index and on the panel.
          abilities: UpgradeEffects.abilities(preview.grants,
            self.abilityParams(next)),
          note: refusal ? "Unavailable: " + refusal + "."
            : (next.noRefund
              ? "This tier is SUNK: selling the tower refunds half of everything "
                + "else on it and nothing of this "
                + self.upgradeCost(next.id) + " mana."
              : self.crosspathNote(next))
        });
      }
    });
  });

  // THE COLLECT BUTTON COMES FIRST of the tower's own actions, because it is
  // the one every storing farm has and the investment is the one only an A5
  // does. Disabled rather than hidden on an empty stock, so a player who just
  // collected can see where the mana goes back to.
  if (this.stores) {
    var stored = Math.floor(this.stock);
    var hasStock = this.stock > 0;
    actions.push({
      id: "collect",
      label: "Collect stored mana",
      detail: hasStock ? stored + " mana" : "nothing stored",
      effects: hasStock ? "all of it, into your purse" : "nothing stored yet",
      enabled: hasStock, tone: "ability",
      tooltip: UpgradeEffects.card({
        title: "Collect",
        subtitle: hasStock ? stored + " mana" : "nothing stored",
        note: "Takes the whole stock into your purse, whenever you like. What " +
          "you leave in keeps compounding -- the clone at the end of a wave is " +
          Math.round(FarmTower.CLONE_RATE * 100) + "% of what is STANDING, up to " +
          this.cloneCap + " -- so collecting " +
          "every wave is the same tower without its stock." +
          (this.invests ? "  An investment spends the stock too." : "")
      })
    });
  }

  if (this.invests) {
    var n = this.tranchesAvailable();
    var ready = n >= 1;
    var perm = Math.round(n * FarmTower.TRANCHE_BONUS * 100);
    actions.push({
      id: "investPermanent",
      label: "Boost a tower  (permanent)",
      detail: ready ? n + " × " + FarmTower.TRANCHE + " mana" : "needs 10000 mana",
      effects: ready ? "pick a tier 5 tower  ·  +" + perm +
        "% damage, attack speed, range" : "not enough stored",
      enabled: ready, tone: "ability",
      tooltip: UpgradeEffects.card({
        title: "Boost  ·  permanent",
        subtitle: ready ? n + " tranche" + (n === 1 ? "" : "s") : "needs 10000 mana",
        note: "Press, then click the tower to boost. Whole tranches of " +
          FarmTower.TRANCHE + " mana, ten at most, and each is +5% damage, " +
          "attack speed and range -- for a tower at tier 5 or above and for the " +
          "units it summons. ONE PERMANENT BOOST PER TOWER, ever: spend all ten " +
          "tranches at once or the rest is wasted on it. The remainder stays stored."
      })
    });
    actions.push({
      id: "investSurge",
      label: "Boost a tower  (surge)",
      detail: ready ? n + " × " + FarmTower.TRANCHE + " mana" : "needs 10000 mana",
      effects: ready ? "pick a tier 5 tower  ·  +" +
        (perm * FarmTower.TEMP_MULTIPLIER) + "% for " +
        FarmTower.TEMP_SECONDS + " s" : "not enough stored",
      enabled: ready, tone: "ability",
      tooltip: UpgradeEffects.card({
        title: "Boost  ·  surge",
        subtitle: FarmTower.TEMP_SECONDS + " seconds",
        note: "Press, then click the tower. The same tranches at five times the " +
          "bonus, for " + FarmTower.TEMP_SECONDS + " seconds, and this one may " +
          "be used again on the same tower. The mana is spent either way."
      })
    });
  }

  return actions;
};

FarmTower.prototype.performAction = function (id, context) {
  if (id === "collect") {
    var refusedCollect = this.collect();
    return refusedCollect ? refusedCollect : this.name + " → collected";
  }
  if (id === "investPermanent" || id === "investSurge") {
    // ARMS THE MODE; it does not spend. The stock is only taken once a target
    // has been clicked, in game.js's click path -- so a mis-press costs
    // nothing, and Escape or a click on open ground backs out for free.
    if (!this.invests) return "needs A5";
    if (this.tranchesAvailable() < 1) return "needs " + FarmTower.TRANCHE + " mana";
    if (context && typeof context.beginInvesting === "function") {
      // It answers false when the board has nothing the investment could land
      // on, which is a refusal the player needs BEFORE they start clicking --
      // see the note on `beginInvesting` in js/game.js.
      if (!context.beginInvesting(this, id === "investSurge")) {
        return "no tier 5 tower to boost";
      }
      return this.name + " → pick a tower";
    }
    // No mode to arm (a fixture, the sandbox): fall back to the direct call so
    // the mechanic is still reachable without the interface.
    return "pick a tower";
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

// ---------------------------------------------------------------------------
// FarmBoost -- the bonus an A5 investment puts ON A TOWER, and the one place
// that knows how a boosted tower differs from an unboosted one.
//
// It lives here rather than in each tower file because the bonus is the Farm's
// mechanic and the towers are only where it lands: five types plus summoned
// units, all of which resolve their stats their own way, and none of which
// should have to know what a tranche is.
//
// WHAT A BOOST DOES: +5% damage, +5% attack speed and +5% range per tranche.
// Nothing else. Hit points, footprint, pierce, crit and every flag are
// untouched, which is what makes this safe to apply as one multiplier at the
// end of a resolve rather than as a set of deltas the resolver has to model.
//
// WHERE EACH QUANTITY IS APPLIED, once each, and this list is the whole of it:
//   range   -- inside `elevatedRangePx` (js/tower.js), the one function every
//              tower converts its reach through.
//   damage  -- at the end of each type's own recompute, below.
//   speed   -- same place. Cooldowns DIVIDE by the multiplier and rates
//              MULTIPLY by it, which is the same thing said in the two units
//              the game uses.
//
// WHO CAN BE BOOSTED: a tower at TIER 5 OR ABOVE on some branch, which is the
// brief's rule and the only spelling all five types share -- see `tierReached`.
// The gunner has no upgrades at all and can therefore never qualify.
// ---------------------------------------------------------------------------

var FarmBoost = (function () {
  "use strict";

  // How far along a branch a tower has actually bought. Every type counts its
  // own purchases differently, so this asks each one the way it can answer:
  // the config towers keep `core.purchased`, the hand-written ones keep
  // `hasA1..hasB5` flags, and the Summoner keeps `upgradeCount` per path.
  function tierReached(tower) {
    if (!tower) return 0;

    // Config-driven towers (Arcane Sniper, Siphon): the purchased list, by path.
    if (tower.core && tower.core.purchased) {
      var counts = {};
      var best = 0;
      for (var i = 0; i < tower.core.purchased.length; i++) {
        var id = tower.core.purchased[i];
        var branch = String(id).charAt(0);
        counts[branch] = (counts[branch] || 0) + 1;
        if (counts[branch] > best) best = counts[branch];
      }
      return best;
    }

    // Everything hand-written spells its tiers `hasA1`.."hasC5".
    var branches = ["A", "B", "C"];
    var most = 0;
    for (var b = 0; b < branches.length; b++) {
      var owned = 0;
      for (var t = 1; t <= 5; t++) {
        if (tower["has" + branches[b] + t]) owned++;
      }
      if (owned > most) most = owned;
    }
    return most;
  }

  // Why this tower cannot take the boost, or null if it can.
  // `permanent` picks which of the two rules applies -- the once-only one is
  // the permanent investment's alone.
  function whyCannotBoost(tower, permanent) {
    if (!tower) return "pick a tower";
    if (tower.isDestroyed && tower.isDestroyed()) return "that tower is gone";
    if (tower instanceof FarmTower) return "a farm cannot be boosted";
    if (tierReached(tower) < TIER_REQUIRED) return "needs a tier 5 tower";
    if (permanent && tower.farmBoost > 0) return "already boosted";
    return null;
  }

  var TIER_REQUIRED = 5;

  // The multiplier a tower is currently carrying. Permanent and surge ADD as
  // fractions before the multiply, so a +50% permanent under a +25% surge is
  // x1.75 rather than x1.875 -- the same additive rule js/enemy.js uses for
  // damage amplification, and for the same reason: two bonuses that multiply
  // are a number nobody can predict from the panel.
  function multiplier(tower) {
    if (!tower) return 1;
    var perm = tower.farmBoost || 0;
    var surge = tower.farmSurge || 0;
    return 1 + perm + surge;
  }

  // Put a boost on. `bonus` is already a fraction (0.05 per tranche, five times
  // that for a surge). Recomputing is what actually moves the tower's numbers.
  function grant(tower, bonus, temporary) {
    if (!tower || bonus <= 0) return;
    if (temporary) tower.farmSurge = bonus;
    else tower.farmBoost = (tower.farmBoost || 0) + bonus;
    refresh(tower);
  }

  function clearSurge(tower) {
    if (!tower || !tower.farmSurge) return;
    tower.farmSurge = 0;
    refresh(tower);
  }

  // RECOMPUTE, THROUGH THE TOWER'S OWN DOOR. Every type already has a function
  // that rebuilds its derived numbers from its purchases, and the boost is
  // applied inside those; calling it here is what makes a boost land and a
  // surge expiring take it back. The config towers need their core resolved
  // again as well, because their damage and rate live in `core.stats`.
  function refresh(tower) {
    if (!tower) return;
    if (tower.core && typeof tower.core._refreshStats === "function") {
      tower.core.farmBoostMult = multiplier(tower);
      tower.core._refreshStats();
    }
    if (typeof tower.refreshDerived === "function") tower.refreshDerived();
    else if (typeof tower.recalcStats === "function") tower.recalcStats();
  }

  return {
    TIER_REQUIRED: TIER_REQUIRED,
    tierReached: tierReached,
    whyCannotBoost: whyCannotBoost,
    multiplier: multiplier,
    grant: grant,
    clearSurge: clearSurge,
    refresh: refresh
  };
})();


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
    { face: 9,  flat: 65 },
    { face: 10, flat: 95 },
    { face: 11, flat: 130 },
    { face: 12, flat: 175 },
    { face: 13, prep: { rerollEights: 3 } },
    { face: 14, flat: 350, prep: { dieBonus: 1 } },
    { face: 15, bestOf: true, flat: 425, percent: 0.10 },
    { face: 16, flat: 225, prep: { dieBonus: 2 } },
    { face: 17, nextFlat: 650, nextPercent: 0.35 },
    { face: 18, bestOf: true, flat: 525, percent: 0.15 },
    { face: 19, nextMult: 2.5 },
    { face: 20, flat: 700, thenPercent: 0.20 },
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

    // ASKED OF EACH FARM THAT COVERS THE BODY, because the threshold is the
    // FARM's now and not the type's: Execution Tithe is a permanent upgrade, so
    // two B5 farms on one board may execute at different health. Any one of
    // them taking the body is enough, which is the same "several may" rule the
    // stamp below already lives under.
    var took = false;
    for (var i = 0; i < list.length; i++) {
      var farm = list[i];
      if (!farm.executes) continue;
      if (farm.isDestroyed && farm.isDestroyed()) continue;
      if (!farm.covers(enemy.pos.x, enemy.pos.y)) continue;
      if (!(enemy.health > 0 && enemy.health < farm.executeThreshold(enemy))) continue;
      // THE PANOPTICON FIRES ITS BEAM WHEN THE FIELD ACTUALLY TAKES SOMETHING.
      farm.lastExecute = farm.animClock;
      took = true;
    }
    return took;
  }

  // --- kills in range -------------------------------------------------------
  //
  // B3+ pays for a body that dies inside its circle, and several farms stack
  // fully: "les recompenses de plusieurs B3 se cumulent entierement".
  // A SUMMONED body pays nothing, which is the brief's "ennemi non invoque" and
  // the same rule the Hive's brood already lives under.

  // WHAT A BODY STANDING HERE IS WORTH TO THE FARMS, or null for nothing.
  //
  // Read by both boards every frame, per body, so it opens with the same
  // length test `fieldAt` does: with no farms on the map it costs one
  // comparison. It exists because path B's per-kill bounty was invisible until
  // the moment it paid -- owner: "you should make it apparent on the enemies
  // that they're affected by the +1 mana and HP per kill" -- and a marker that
  // asked each renderer to re-derive the rule would be the rule in three
  // places. `onEnemyKilled` keeps its own loop because it credits each farm
  // separately; this one only answers the total.
  function killBonusAt(x, y) {
    if (!list.length) return null;
    var mana = 0, baseHp = 0;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f.manaPerKill <= 0) continue;
      if (f.isDestroyed && f.isDestroyed()) continue;
      if (!f.covers(x, y)) continue;
      mana += f.manaPerKill;
      baseHp += f.baseHpPerKill;
    }
    if (mana <= 0 && baseHp <= 0) return null;
    return { mana: mana, baseHp: baseHp };
  }

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
      f.lastCapture = f.animClock;
      // ONE POPUP PER FARM, BESIDE THE BOUNTY AND NOT INSIDE IT. Owner: "on the
      // bounty, it's separated -- imagine it gives four and the tower gives
      // one, it's written +4 and +1, not +5". Summing them would hide the whole
      // reason path B is worth its price, and two farms covering the same
      // corpse read as two gains because they ARE two gains.
      if (typeof Effects !== "undefined") {
        Effects.farmKillBonus(f, enemy, f.manaPerKill, f.baseHpPerKill);
      }
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

  // WHAT A FARM'S OWN THROW MEANT, as the name of the clip that shows it.
  //
  // C4's fate manipulator carries a body for each outcome, and the network
  // already knows which one happened -- so the naming is decided HERE, where
  // the faces are, rather than by a renderer re-reading a face table.
  //
  // Read off THIS FARM'S OWN dice (`lastRolls`) and the network's movement, in
  // that order of specificity:
  //
  //   a doubling face   -> `critical_success`  (21 and 22 on the C5 table)
  //   a reset face      -> `result_reset`      (face 8 puts P back to B)
  //   P more than halved-> `critical_failure`  (C5's face 1 alone takes half)
  //   P went up         -> `result_positive`
  //   P went down       -> `result_negative`
  //   P did not move    -> null, and the idle keeps playing
  //
  // A farm rolling several dice reports the STRONGEST thing its own dice did,
  // which is why a face is asked about before the direction P moved.
  //
  // A RESET IS NAMED BEFORE THE HALVING TEST, and the order is the whole
  // decision: face 8 from a high P is a bigger loss than any other face can
  // deal, so a halving test placed first would swallow it and the shrine would
  // play a generic catastrophe where it has a body for exactly this one.
  function outcomeOf(farm, before) {
    var faces = farm.lastRolls || [];
    var reset = false, double = false;
    for (var i = 0; i < faces.length; i++) {
      var face = FarmDice.faceOf(farm.diceTable, faces[i]);
      if (!face) continue;
      if (face.reset) reset = true;
      if (face.double) double = true;
    }
    // THE C5 TABLE HAS ITS OWN TWO DOUBLES, and the T5 body has a clip for each:
    // face 21 arms the next one, face 22 purges everything under nine AND arms
    // it. A C3 or C4 double has no such face and stays the generic critical.
    if (faces.indexOf(22) !== -1 && farm.diceTable === "C5") {
      return "result_22_purge_double";
    }
    if (faces.indexOf(21) !== -1 && farm.diceTable === "C5") {
      return "result_21_double";
    }
    if (double) return "critical_success";
    if (reset) return "result_reset";
    if (before > 0 && network.P <= before * 0.5) return "critical_failure";
    if (network.P > before) return "result_positive";
    if (network.P < before) return "result_negative";
    return null;
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
      // B4's orrery sweeps its ring when the field hands the base its hit
      // points -- the wave's gain, and the only thing path B does once a wave.
      if (f.baseHpPerWave > 0) f.lastGain = f.animClock;
    }
    if (baseHp > 0 && typeof growBaseMaxHp === "function") growBaseMaxHp(baseHp);

    var before = network.P;
    var rolled = network.live ? rollNetwork() : null;
    // THE SHRINE THROWS ITS DIE WHEN THE NETWORK DOES. Only the farms that
    // actually rolled -- `members()` is the ones carrying dice -- so a C1 farm
    // standing beside a network it is not in does not mime the throw.
    if (rolled) {
      var rollers = members();
      for (i = 0; i < rollers.length; i++) {
        rollers[i].lastRoll = rollers[i].animClock;
        rollers[i].rollOutcome = outcomeOf(rollers[i], before);
      }
    }
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
        // `modified` IS WHAT MAKES A FACE NATURAL. A die that was rerolled is
        // natural again -- it was genuinely thrown -- while one nudged up by a
        // face-14 or face-16 charge is not, and Jet Protected asks exactly that
        // question. See `resolve`.
        rolls.push({ farm: m[i], table: m[i].diceTable, n: rollDie(sides),
                     modified: false });
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
  // WHICH PREP CLIP A FARM SHOULD PLAY, stamped on the farms that own the die
  // the effect touched. The C5 body has a clip for every one of these -- a
  // reroll, a purge of everything under nine, a double armed for next time --
  // and until T5 there was nowhere to play them, which is why they were the
  // four documented as unwired on C4.
  function stampPrep(farm, clip) {
    if (!farm) return;
    farm.lastPrep = farm.animClock;
    farm.prepClip = clip;
  }

  function applyPrep(rolls, hasC5) {
    var i;

    var rerolls = prep.rerollEights;
    for (i = 0; i < rolls.length && rerolls > 0; i++) {
      if (rolls[i].n !== 8) continue;
      rolls[i].n = rollDie(FarmDice.sides(rolls[i].table));
      rolls[i].modified = false;      // thrown again, so natural again
      rerolls--;
      // The die that was rescued is the one that respins on screen.
      stampPrep(rolls[i].farm, "reroll_eight");
    }

    var bonuses = prep.dieBonuses.slice();
    for (i = 0; i < rolls.length && bonuses.length; i++) {
      if (rolls[i].table !== "C5") continue;      // C5 dice only, per the brief
      var add = bonuses.shift();
      stampPrep(rolls[i].farm, "pre_roll_modifiers");
      var sides = FarmDice.sides(rolls[i].table);
      var moved = Math.min(sides, rolls[i].n + add);
      // A +2 THAT LANDS EXACTLY ON 8 BECOMES 9. Only a +2: the brief names the
      // face-16 charge, and a +1 arriving on 8 is left alone.
      if (add === 2 && moved === 8) moved = 9;
      // Only when the number ACTUALLY moved: a charge that lands on a face
      // already at the ceiling has changed nothing, so the face is still the
      // one the die threw.
      if (moved !== rolls[i].n) rolls[i].modified = true;
      rolls[i].n = moved;
    }

    if (prep.cullBelow9) {
      // Every member sweeps its board clean, not just the farms that lost a
      // die: the purge is a state of the whole next series, and the model shows
      // it as sectors sinking on the table.
      for (i = 0; i < rolls.length; i++) stampPrep(rolls[i].farm, "purge_under_nine");
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

    // --- the two Path C permanent upgrades that touch a face's ARITHMETIC ---
    //
    // Read off the FARM whose die this is, never off the network: two farms in
    // one network roll under their own loadouts, and one player's Extra Die
    // must not scale the other's throw.
    //
    // JET PROTECTED asks whether the face is NATURAL -- the number the die
    // actually threw. A reroll is natural again; a face nudged upward by a
    // face-14 or face-16 charge is not, so a 19 walked up to 20 is unprotected
    // and a genuine 20 stays protected however its resolved value is later
    // changed by a queued modifier.
    //
    // EXTRA DIE scales every ordinary gain and loss to 75%, on EVERY die that
    // farm rolls and not merely the one it added.
    //
    // THE TWO COMPOSE MULTIPLICATIVELY, so a protected natural maximum keeps
    // 0.50 x 0.75 = 37.5% of its numeric value under both. Neither of them
    // touches a reset, a reroll, a queued modifier or a purge: those are
    // deferred and non-numeric, and they stay at full strength.
    var farm = entry.farm;
    var scale = (farm && farm.diceGainScale > 0) ? farm.diceGainScale : 1;
    var isNatural = !entry.modified;
    var guarded = !!(farm && farm.diceProtectNatural > 0) && isNatural &&
      (entry.n === 1 || entry.n === FarmDice.sides(entry.table));
    var numeric = scale * (guarded ? 0.5 : 1);

    if (f.reset) {
      // AMORTIZED RESET meets P halfway to B instead of replacing it, using
      // the values as they stand at the moment THIS die resolves -- so a later
      // die in the same series sees what this one produced. Better than the
      // ordinary reset while P is above B and worse below it, which is the
      // whole trade.
      network.P = (farm && farm.diceAmortizedReset > 0)
        ? (network.P + network.B) / 2
        : network.B;
      return;
    }

    if (f.prep) {
      if (f.prep.rerollEights) {
        pending.rerollEights = Math.max(pending.rerollEights, f.prep.rerollEights);
      }
      if (f.prep.dieBonus) pending.dieBonuses.push(f.prep.dieBonus);
      if (f.prep.cullBelow9) pending.cullBelow9 = true;
      // RECORDING one is `queue_modifier`; SPENDING it next wave is one of the
      // clips `applyPrep` stamps. The C5 body shows the two halves differently
      // -- a plaque sliding into its slot, then firing -- so they are two
      // moments and not one.
      stampPrep(entry.farm, "queue_modifier");
    }

    if (f.nextFlat !== undefined) series.nextFlat += f.nextFlat;
    if (f.nextPercent !== undefined) {
      series.nextPercent = Math.max(series.nextPercent, f.nextPercent);
    }
    if (f.nextMult !== undefined) series.nextMult *= f.nextMult;

    if (f.double) {
      // SCALED AS A BONUS ABOVE ONE, which is the only reading that composes:
      // x2 is "+100%", so Jet Protected halving it and Extra Die taking three
      // quarters of what is left gives 1 + 1.0 x 0.50 x 0.75 = x1.375, and
      // either alone gives x1.5 or x1.75. Halving the MULTIPLIER instead would
      // make a protected double a LOSS.
      network.P = Math.max(0, network.P * (1 + (2 - 1) * numeric));
      return;
    }

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

    // THE FACE'S OWN NUMBER, scaled. The queued charges below are deliberately
    // NOT scaled: they are deferred modifiers and both nodes leave those whole.
    delta *= numeric;

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
      // The second half of a face-20 is its own numeric gain and is scaled with
      // the first: C3's "+300 and +10%" reads "+150 and +5%" under Jet
      // Protected, which is the confirmed figure.
      network.P = Math.max(0, network.P * (1 + f.thenPercent * numeric));
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
    killBonusAt: killBonusAt,
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
