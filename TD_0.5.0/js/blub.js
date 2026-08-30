// ---------------------------------------------------------------------------
// The Summoner (tower_blub) and its blubs.
//
// A tower that never fires. It plants standing units -- "blubs" -- inside its
// own range, and they do the shooting. A blub's HIT POINTS ARE ITS AMMUNITION:
// every attack costs one, and at zero it dies. That single rule is what makes
// the tower's whole economy legible, and it is why nothing here has a magazine,
// a reload or a lifetime timer.
//
// THE ONE STRUCTURAL DECISION EVERYTHING ELSE FOLLOWS FROM: a blub is IN THE
// GLOBAL `towers` ARRAY. It is not a recruit (js/soldier.js), which lives on
// its parent and is deliberately not a tower. The owner's brief asks for units
// that occupy space under the same rule towers do, that cannot be built on top
// of, that are clicked to open a stats panel, that carry HP and die, and that
// eat area stuns. Every one of those is something `towers` already provides:
//
//   whyCannotBuild()      loops `towers` and compares footprint radii, so the
//                         no-overlap rule is the tower rule, not a copy of it
//   towerAt() / inspected the panel, the stat rows and the Sell button
//   sellValue()           `totalSpent` 0 -> a refund of exactly $0, which is
//                         what the brief asks the blub's sell button to pay
//   TowerHealth.tickStun  area stuns land without this file knowing they exist
//   the destroyed sweep   death animation via Effects.towerDestroyed, and the
//                         footprint released in the same step
//   restartGame()         clears `towers`, so no new run-scoped array exists
//                         for a future session to forget
//
// What being in `towers` must NOT give them is enemy attention. The brief:
// "Les blubs ne peuvent pas etre cibles ni attaques par les ennemis" -- so
// `isSummon` is the flag js/enemy.js filters on, and the ONE exception (a tier
// 3 or 4 monster blub) says so by setting `enemyTargetable`. Zone stuns are
// applied to summons deliberately and separately; see resolveAttack in
// js/enemy.js.
//
// ATTACKS ARE INSTANT, not projectiles, and that is a deliberate departure
// from every other shooting tower here. Two reasons, both about ammunition:
//
//   * A charge must not be spent on a corpse. Blubs pass `skipClaimed` to
//     Targeting.pick like everyone else, but a bullet only claims damage while
//     it is in the air -- with instant resolution the enemy is already dead
//     when the next blub in the same step looks at it, which is strictly
//     better than a claim and costs nothing.
//   * Half this roster does not fire a bullet at all. The Hungry Blub splashes,
//     the SuperBlub fires a piercing lance every tenth attack, the Mechablub
//     MK2 detonates when it dies and a monster blub can hit the whole map.
//     Instant damage through TowerScore.apply is how the Warbringer's blast
//     already works, so the kill credit, the damage counter and mitigation all
//     behave without a special case.
//
// Every blub credits its damage and kills TO THE SUMMONER, the same way the
// Warbringer's chain blast is credited to the Warbringer that caused it. A
// blub has a panel of its own, but it is a readout, not a scoreboard.
//
// TWO NUMBERS IN THE BRIEF DO NOT AGREE WITH EACH OTHER, and both are resolved
// towards the acceptance test, which is the harder constraint. See
// HUNGRY_GROWTH and SuperBlub.laser below.
// ---------------------------------------------------------------------------

function BlubTower(x, y, path) {
  this.x = x;
  this.y = y;

  // HOW HIGH THE GROUND UNDER IT IS, read once, at construction. Zero on dirt.
  // This one number is the whole of elevation: RangeFilter reads it to decide
  // what this tower can see over, bullet.js reads it to decide what its rounds
  // fly over, and elevatedRangePx reads it for the reach bonus.
  this.groundHeight = groundHeightUnder(x, y);

  // Firing priority along the path, same rule as every other tower. The
  // summoner never fires, but its blubs are sorted into the same array by the
  // same key, and a tower without the field would sort as undefined.
  this.pathProgress = path.progressAtPoint(x, y);

  // Kept because summoning needs a road to measure against: when no random
  // spot in range is free, the fallback is the free spot NEAREST THE ENEMY
  // PATH, which is a path question rather than a tower one.
  this.path = path;

  this.name = BlubTower.DISPLAY_NAME;

  this.cost = BlubTower.COST;
  this.totalSpent = BlubTower.COST;

  this.footprintRadiusUl = BlubTower.FOOTPRINT_RADIUS_UL;
  this.footprintPx = ul(this.footprintRadiusUl);

  // Listed explicitly rather than built from the table, so reading the
  // constructor tells you the whole state of a summoner.
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

  // Living blubs called by THIS summoner. They are also in the global `towers`
  // array -- this list is the ownership half, and it is what makes the swarm
  // buff, the HP readout and Coagulation cheap to answer. Kept in step by
  // pruning destroyed entries at the top of update(); the global array is
  // pruned by the main loop's own sweep.
  this.blubs = [];

  // One countdown per active summon line, keyed by line id. Lines that are not
  // unlocked have no entry at all rather than a dead timer.
  this.timers = {};

  // Per-line on/off, unlocked by A3. Absent means on: a line that has never
  // been touched summons, which is what a player expects of a tower they just
  // upgraded.
  this.lineEnabled = {};

  // The deterministic stream the spawn point comes out of. The brief asks for
  // "un point aleatoire"; this project does not use Math.random in the
  // simulation (see Enemy.laneOffsetFor and the note on the boss's attack
  // cycle), because a run that cannot be replayed cannot be tested. A seeded
  // xorshift is random to the player and reproducible to the harness, and
  // seeding it off the tower's own position means two summoners on one board
  // do not lay their blubs down in the same pattern.
  this.rngState = BlubTower.seedFrom(x, y);
  this.summonSerial = 0;

  // Coagulation (A5). `monster` is the merged entity while one exists.
  this.monster = null;
  this.coagCooldown = 0;
  // Set while a TIER 3+ monster is alive: the tower has fused with it and has
  // stopped summoning. Cleared when that monster dies, which is what "la tour
  // redevient une tour de niveau A4" means in state terms.
  this.summoningHalted = false;

  this.aim = -Math.PI / 2;
  this.pulse = 0;                  // cosmetic, aged in update()

  TowerHealth.init(this, BlubTower.BASE_HP);
  this.showRange = false;

  TowerScore.init(this);

  this.recalcStats();
}

BlubTower.DISPLAY_NAME = "Summoner";
BlubTower.COST = 450;

// Stable id for the meta catalogue and save data -- a PERSISTENCE FORMAT, so
// renaming it un-owns the tower for every existing player. See js/meta.js and
// the "Tower names" section of AGENTS.md.
BlubTower.ID = "blub";

BlubTower.BASE_HP = 100;
BlubTower.BASE_RANGE_UL = 75;
BlubTower.FOOTPRINT_RADIUS_UL = 25;

// Every summon interval is floored here. The brief: "les intervalles
// d'invocation ne peuvent jamais devenir nuls ou negatifs. Si un cas de figure
// s'en approche, appliquer un plancher raisonnable plutot que de laisser
// filer." Path B buys -5 s of interval in total and the Mini Blub II summons
// every 3.5 s, so the two cannot legally meet today (A4 locks path A out of
// B5) -- the floor is here for the combination a future retune creates, and
// because a zero interval is an infinite loop inside one step, not a fast
// tower.
BlubTower.MIN_INTERVAL_SECONDS = 0.5;

// The swarm buff (A2). Each living blub grants every OTHER blub of the same
// summoner this much damage and attack speed. Eleven blubs is ten others, i.e.
// the +50% ceiling A2 buys; twenty-one is the +100% ceiling A4 raises it to.
BlubTower.SWARM_PER_BLUB = 0.05;

// The weakening debuff (A4). Every blub hit stacks this much extra damage
// taken onto the enemy for this long, to the DamageAmp cap of +100%.
BlubTower.WEAKEN_PER_HIT = 0.001;
BlubTower.WEAKEN_SECONDS = 5;

BlubTower.COAGULATION_COOLDOWN_SECONDS = 300;


// --- the summon roster ------------------------------------------------------
//
// Straight out of the brief's two tables. `interval` is the line's own cycle,
// `footprintUl` its collision radius under the ordinary tower packing rule, and
// everything else is what it does when it shoots.
//
// The optional blocks are the units that are more than a gun:
//
//   splashUl      damage lands in a circle of this radius around the target
//   growth        each attack multiplies this unit's OWN damage by 1 + growth
//   deathBlast    what it does when its last charge is spent
//   laser         every Nth attack is a piercing lance instead, and is free
//
// FIXED DAMAGE IS SPELLED AS A NUMBER ON THE BLOCK, never derived, because the
// brief is explicit that the MK2's detonation and the SuperBlub's lance are
// "jamais modifies par B1, par le buff d'essaim, ni par quoi que ce soit
// d'autre". They are the only two damage figures in the game that ignore
// everything, so they are the only two that live outside attackDamage().
BlubTower.UNITS = {
  blub1: { id: "blub1", name: "Blub I", family: "A",
    damage: 2, rate: 1.0, hp: 10, rangeUl: 100, interval: 20, footprintUl: 10 },
  blub2: { id: "blub2", name: "Blub II", family: "A",
    damage: 4, rate: 1.25, hp: 15, rangeUl: 125, interval: 18, footprintUl: 13 },
  blub3: { id: "blub3", name: "Blub III", family: "A",
    damage: 6, rate: 1.5, hp: 20, rangeUl: 150, interval: 15, footprintUl: 20 },

  mini1: { id: "mini1", name: "Mini Blub I", family: "A",
    damage: 2, rate: 3.0, hp: 6, rangeUl: 100, interval: 4, footprintUl: 10 },
  mini2: { id: "mini2", name: "Mini Blub II", family: "A",
    damage: 3, rate: 3.0, hp: 12, rangeUl: 115, interval: 3.5, footprintUl: 10 },

  // 4% COMPOUNDING, not 4% of the base value added. The brief's prose says "de
  // 4% de sa valeur de base, cumulatif" and its acceptance test says the unit
  // deals 1473 damage across its 35 charges. Those are two different claims and
  // only one of them can be built: additive growth totals 1176, while
  // 20 x (1.04^35 - 1) / 0.04 = 1472.95, i.e. the stated 1473 to the nearest
  // point. The test is the exact figure, so the test is what this implements --
  // flagged rather than quietly reconciled.
  hungry: { id: "hungry", name: "Hungry Blub", family: "A",
    damage: 20, rate: 0.75, hp: 35, rangeUl: 130, interval: 15, footprintUl: 25,
    splashUl: 8, growth: 0.04 },

  cyber: { id: "cyber", name: "Cyberblub", family: "B",
    damage: 12, rate: 2.0, hp: 40, rangeUl: 200, interval: 20, footprintUl: 25 },
  mecha: { id: "mecha", name: "Mechablub", family: "B",
    damage: 35, rate: 2.5, hp: 75, rangeUl: 175, interval: 25, footprintUl: 30 },
  mecha2: { id: "mecha2", name: "Mechablub MK2", family: "B",
    damage: 100, rate: 2.0, hp: 80, rangeUl: 150, interval: 30, footprintUl: 40,
    deathBlast: { radiusUl: 25, damage: 250 } },

  // 51 HP IS NOT A ROUND NUMBER ON PURPOSE -- the brief says so in as many
  // words ("ne pas l'arrondir"), because it is what makes the lance count come
  // out at exactly five. The lance is free, so 51 charges pay for 51 ordinary
  // attacks and the five free lances fall between them at attacks 10, 20, 30,
  // 40 and 50 of the 56 it makes in total.
  superb: { id: "superb", name: "SuperBlub", family: "B",
    damage: 200, rate: 1.25, hp: 51, rangeUl: 300, interval: 100, footprintUl: 50,
    splashUl: 5, laser: { every: 10, widthUl: 10, damage: 400 } }
};

BlubTower.unitById = function (id) {
  return id ? (BlubTower.UNITS[id] || null) : null;
};


// --- the upgrade table ------------------------------------------------------
//
// Two branches under the game's standard crosspath rule -- tier 3 on either
// branch caps the other at tier 2, forever -- plus ONE extra gate that no other
// tower in this game has:
//
//   B3 REQUIRES A2. The Cyberblub is an evolution of the Blub III, so a player
//   going down path B must buy A1 and A2 first. `requiresOther` carries it, and
//   whyCannotUpgrade reports it in the same breath as the ordinary tier
//   prerequisite, so the panel and the codex both explain the gate rather than
//   showing a button that silently refuses.
//
// Every row is a DELTA. Path A's tables on the Rifleman and the Warbringer are
// absolute, which those towers need because their tiers restate a whole firing
// model; here a tier moves the tower's own HP and range and NOTHING about a
// blub except the two flat bonuses B1 and B2 buy. Which unit a line summons is
// a separate question answered by lineUnits() from the flags, not by summing
// anything -- so there is no channel for absolutes to be needed in.
//
//   hp / rangeUl      the SUMMONER's own, added
//   summonDamage      flat damage added to every unit this tower calls (B1)
//   summonHp          flat charges added to every unit this tower calls (B2)
//   intervalDelta     seconds off EVERY line's cycle, floored (B2, B4, B5)
//   swarmCap          the ceiling the swarm buff may reach; the largest wins
//
// The cumulative totals the brief states are what these sum to, and a test
// pins each one: path A reaches $52 100 / 5 550 HP / 250 u.l. of range, and
// path B reaches 150 u.l. of range with A1 and A2 bought to unlock B3.
BlubTower.UPGRADES = [
  { id: "A1", branch: "A", cost: 550, hp: 25, rangeUl: 25 },
  { id: "A2", branch: "A", cost: 1100, hp: 75, rangeUl: 15, requires: "A1",
    swarmCap: 0.5, grants: ["swarmBuff"] },
  { id: "A3", branch: "A", cost: 3500, hp: 100, requires: "A2", locksPath: true,
    grants: ["miniBlubs", "summonToggle"] },
  { id: "A4", branch: "A", cost: 6500, hp: 250, requires: "A3", locksPath: true,
    swarmCap: 1.0, grants: ["hungryBlub", "weakenDebuff"] },
  { id: "A5", branch: "A", cost: 40000, hp: 5000, rangeUl: 135, requires: "A4",
    locksPath: true, grants: ["coagulation"] },

  { id: "B1", branch: "B", cost: 250, hp: 5, summonDamage: 1 },
  { id: "B2", branch: "B", cost: 300, summonHp: 1, intervalDelta: -1,
    requires: "B1" },
  { id: "B3", branch: "B", cost: 1600, hp: 100, requires: "B2",
    requiresOther: "A2", locksPath: true },
  { id: "B4", branch: "B", cost: 4500, hp: 250, rangeUl: 35, intervalDelta: -1,
    requires: "B3", locksPath: true },
  { id: "B5", branch: "B", cost: 8500, hp: 1250, intervalDelta: -3,
    requires: "B4", locksPath: true, grants: ["superBlub"] }
];

BlubTower.upgradeById = function (id) {
  for (var i = 0; i < BlubTower.UPGRADES.length; i++) {
    if (BlubTower.UPGRADES[i].id === id) return BlubTower.UPGRADES[i];
  }
  return null;
};


// --- the monster blub -------------------------------------------------------
//
// What Coagulation produces. Its tier is decided ONCE, by the pooled HP at the
// moment of the merge, and never moves again -- a tier 3 monster that eats its
// way up past 7 777 does not become a tier 4, because the brief makes the tier
// a property of the fusion rather than of the number.
//
// TIER 4 IS AN EXACT THRESHOLD and is tested FIRST, which is the whole joke:
// 7 776 and 7 778 are tier 3 and 7 777 is not. Ordering the check before tier
// 3's `>= 4500` is the only thing that makes that true, so it is written as an
// explicit first case rather than as a range.
//
// RAISED 2026-08-26, from 3 500 and 6 666. Only the two thresholds moved: T0,
// T1 and T2 keep their own, and nothing else about a monster -- rate, splash,
// footprint, jump, targetability -- changed on any tier.
BlubTower.MONSTER_TIERS = [
  { tier: 0, minHp: 0, rangeUl: 150, rate: 1.0, splashUl: 0, footprintUl: 25 },
  { tier: 1, minHp: 500, rangeUl: 175, rate: 1.25, splashUl: 3, footprintUl: 30 },
  { tier: 2, minHp: 1000, rangeUl: 200, rate: 1.5, splashUl: 8, footprintUl: 35,
    jump: { every: 15, damageMultiplier: 1, stunSeconds: 2, hpCost: 20,
      animSeconds: 0.5 } },
  { tier: 3, minHp: 4500, global: true, rate: 2.5, splashUl: 15, footprintUl: 50,
    fused: true, enemyTargetable: true, killsFeedIt: true,
    jump: { every: 15, damageMultiplier: 3, stunSeconds: 3, hpCost: 1,
      animSeconds: 0.5, global: true } },
  { tier: 4, exactHp: 7777, global: true, rate: 5.0, splashGlobal: true,
    footprintUl: 100, fused: true, enemyTargetable: true, killsFeedIt: true,
    stunImmune: true,
    jump: { every: 4, damageMultiplier: 10, stunSeconds: 2, hpCost: 0,
      animSeconds: 0.5, global: true } }
];

BlubTower.monsterTierFor = function (totalHp) {
  var tiers = BlubTower.MONSTER_TIERS;
  // Tier 4 first and by exact equality -- see the note above.
  for (var i = 0; i < tiers.length; i++) {
    if (tiers[i].exactHp !== undefined && totalHp === tiers[i].exactHp) return tiers[i];
  }
  var best = tiers[0];
  for (var j = 0; j < tiers.length; j++) {
    if (tiers[j].exactHp !== undefined) continue;
    if (totalHp >= tiers[j].minHp) best = tiers[j];
  }
  return best;
};


// --- the deterministic spawn stream -----------------------------------------
//
// xorshift32. Seeded from the tower's own position so two summoners on one
// board lay out differently, and never from a clock, so a run replays.

BlubTower.seedFrom = function (x, y) {
  var seed = (Math.round(x * 31) ^ (Math.round(y * 131) << 7)) >>> 0;
  // A zero state is a fixed point of xorshift and would return 0 forever.
  return seed === 0 ? 0x9e3779b9 : seed;
};

BlubTower.prototype.nextRandom = function () {
  var s = this.rngState >>> 0;
  s ^= (s << 13) >>> 0;
  s = s >>> 0;
  s ^= s >>> 17;
  s ^= (s << 5) >>> 0;
  this.rngState = s >>> 0;
  return (this.rngState >>> 8) / 16777216;      // 24 bits, [0, 1)
};


// --- upgrades ---------------------------------------------------------------

BlubTower.prototype.hasUpgrade = function (id) {
  return this["has" + id] === true;
};

// Every stat is rebuilt from the flags, so an upgrade can never leave a stale
// number behind, and the order tiers were bought in cannot matter.
//
// It deliberately does NOT touch currentHp: previewUpgrade sets a flag,
// recalculates and sets it back to measure a tier, and a hovering cursor must
// not heal a damaged tower. The grant lives in applyUpgrade, the same split
// every other upgradeable tower here uses.
BlubTower.prototype.recalcStats = function () {
  var maxHp = BlubTower.BASE_HP;
  var rangeUl = BlubTower.BASE_RANGE_UL;

  this.summonDamageBonus = 0;
  this.summonHpBonus = 0;
  this.intervalDelta = 0;
  this.swarmCap = 0;
  this.upgradeCount = 0;

  for (var i = 0; i < BlubTower.UPGRADES.length; i++) {
    var u = BlubTower.UPGRADES[i];
    if (!this.hasUpgrade(u.id)) continue;

    this.upgradeCount++;
    if (u.hp !== undefined) maxHp += u.hp;
    if (u.rangeUl !== undefined) rangeUl += u.rangeUl;
    if (u.summonDamage !== undefined) this.summonDamageBonus += u.summonDamage;
    if (u.summonHp !== undefined) this.summonHpBonus += u.summonHp;
    if (u.intervalDelta !== undefined) this.intervalDelta += u.intervalDelta;
    // The ceiling, not a sum: A4 RAISES A2's cap rather than adding to it.
    if (u.swarmCap !== undefined) this.swarmCap = Math.max(this.swarmCap, u.swarmCap);
  }

  this.maxHp = maxHp;
  this.rangeUl = rangeUl;
  this.rangePx = elevatedRangePx(this, rangeUl);

  this.hasToggles = this.hasA3;
  this.hasWeaken = this.hasA4;
  this.hasCoagulation = this.hasA5;

  this.syncLines();
};

// Which unit each summon line currently calls, or null for a line that is not
// unlocked. Derived from the flags every time rather than stored, so it cannot
// disagree with them.
//
// THREE LINES, and the third is shared between the branches on purpose. A4
// gives it the Hungry Blub and B5 gives it the SuperBlub, and no tower can ever
// hold both -- A4 locks path A out of B5 -- so a fourth line would be a timer
// that is always dead.
BlubTower.prototype.lineUnits = function () {
  var main = "blub1";
  if (this.hasA1) main = "blub2";
  if (this.hasA2) main = "blub3";
  if (this.hasB3) main = "cyber";
  if (this.hasB4) main = "mecha";
  if (this.hasB5) main = "mecha2";

  return {
    main: main,
    mini: this.hasA4 ? "mini2" : (this.hasA3 ? "mini1" : null),
    heavy: this.hasB5 ? "superb" : (this.hasA4 ? "hungry" : null)
  };
};

BlubTower.LINE_IDS = ["main", "mini", "heavy"];

// Start a timer for a line that has just been unlocked, and drop one whose line
// has gone away. A line whose UNIT changed keeps its countdown: buying A1 while
// a Blub I cycle is half spent should not restart the clock, and the unit that
// eventually appears is read at spawn time -- which is also what makes the
// brief's "la transformation s'applique uniquement aux futures apparitions"
// true without any special handling.
BlubTower.prototype.syncLines = function () {
  var units = this.lineUnits();
  for (var i = 0; i < BlubTower.LINE_IDS.length; i++) {
    var id = BlubTower.LINE_IDS[i];
    var unitId = units[id];
    if (!unitId) {
      if (this.timers[id] !== undefined) delete this.timers[id];
      continue;
    }
    if (this.timers[id] === undefined) this.timers[id] = this.intervalFor(unitId);
  }
};

// A RUNNING CLOCK CANNOT EXCEED THE CYCLE IT IS COUNTING.
//
// Tiers that shorten an interval -- A1 and A2 by swapping the unit for one on a
// faster cycle, B2/B4/B5 by subtracting seconds outright -- otherwise leave a
// timer stranded above its own new maximum, and the rail bar (which is
// `1 - left / total`) sits pinned at empty for the overhang. Buying something
// that makes a line faster has to bring the next body CLOSER, not freeze the
// readout.
//
// IT LIVES IN applyUpgrade, NOT IN recalcStats, and that distinction cost a
// test to find. `previewUpgrade` measures a tier by setting its flag,
// recalculating, reading, and setting it back -- so anything in recalcStats
// that touches LIVE state happens every time the cursor crosses an upgrade
// button. With the clamp in syncLines, merely laying out the panel previewed A1
// (an 18 s cycle), clamped the running 20 s clock to 18, and left it there when
// the preview was undone. Same trap the HP grant documents one function down,
// and the same answer: a purchase is the only thing that may move live numbers.
BlubTower.prototype.clampTimersToCycle = function () {
  var units = this.lineUnits();
  for (var i = 0; i < BlubTower.LINE_IDS.length; i++) {
    var id = BlubTower.LINE_IDS[i];
    if (!units[id] || this.timers[id] === undefined) continue;
    var full = this.intervalFor(units[id]);
    if (this.timers[id] > full) this.timers[id] = full;
  }
};

// A unit's cycle for THIS tower: its own interval, path B's reductions, and
// the floor. One function, so nothing anywhere else subtracts seconds.
BlubTower.prototype.intervalFor = function (unitId) {
  var unit = BlubTower.unitById(unitId);
  if (!unit) return BlubTower.MIN_INTERVAL_SECONDS;
  return Math.max(BlubTower.MIN_INTERVAL_SECONDS, unit.interval + this.intervalDelta);
};

// The finished numbers a blub is born with. Resolved HERE and handed over at
// birth rather than looked up while it shoots, which is what makes the brief's
// rule true for the passive bonuses as well as for the tier swaps: "Cette regle
// vaut aussi pour les bonus passifs (B1, B2) : ils ne s'appliquent qu'aux
// unites apparues apres l'achat."
BlubTower.prototype.summonStats = function (unitId) {
  var unit = BlubTower.unitById(unitId);
  if (!unit) return null;
  return {
    unitId: unit.id,
    name: unit.name,
    damage: unit.damage + this.summonDamageBonus,
    rate: unit.rate,
    hp: unit.hp + this.summonHpBonus,
    rangeUl: unit.rangeUl,
    footprintUl: unit.footprintUl,
    splashUl: unit.splashUl || 0,
    growth: unit.growth || 0,
    deathBlast: unit.deathBlast || null,
    laser: unit.laser || null
  };
};

BlubTower.prototype.lockedBranch = function () {
  for (var i = 0; i < BlubTower.UPGRADES.length; i++) {
    var u = BlubTower.UPGRADES[i];
    if (u.locksPath && this.hasUpgrade(u.id)) return u.branch;
  }
  return null;
};

BlubTower.prototype.nextUpgrade = function (branch) {
  for (var i = 0; i < BlubTower.UPGRADES.length; i++) {
    var u = BlubTower.UPGRADES[i];
    if (u.branch === branch && !this.hasUpgrade(u.id)) return u;
  }
  return null;
};

BlubTower.prototype.upgradeCost = function (id) {
  var u = BlubTower.upgradeById(id);
  return u ? u.cost : 0;
};

// null if this upgrade may be bought, otherwise a short human-readable reason.
// Cash is NOT checked here -- that is the economy's business, in game.js.
//
// The path lock is reported first because it is the permanent one, then the
// same-branch prerequisite, then B3's cross-branch one. Reporting "needs A2"
// ahead of "path A already chosen" would tell a locked-out player to go and buy
// something that cannot help them.
BlubTower.prototype.whyCannotUpgrade = function (id) {
  var u = BlubTower.upgradeById(id);
  if (!u) return "no such upgrade";
  if (this.hasUpgrade(id)) return "already owned";

  var locked = this.lockedBranch();
  if (u.locksPath && locked !== null && locked !== u.branch) {
    return "path " + locked + " already chosen";
  }
  if (u.requires && !this.hasUpgrade(u.requires)) {
    return "needs " + u.requires;
  }
  if (u.requiresOther && !this.hasUpgrade(u.requiresOther)) {
    return "needs " + u.requiresOther;
  }
  return null;
};

// Snapshot of everything a hover card compares. The keys are UpgradeEffects'
// vocabulary (damage / fireRate / range / hp) so statChanges renders them and
// derives the DPS row for free; the summon-specific rows are added on top by
// previewUpgrade, because no shared field name means "charges per blub".
//
// `damage` and `fireRate` describe the MAIN line's unit, which is the one every
// tier of both branches actually moves.
BlubTower.prototype.statSnapshot = function () {
  var main = this.summonStats(this.lineUnits().main);
  return {
    damage: main ? main.damage : 0,
    fireRate: main ? main.rate : 0,
    range: this.rangeUl,
    hp: this.maxHp,
    unitName: main ? main.name : "-",
    charges: main ? main.hp : 0,
    interval: this.intervalFor(this.lineUnits().main),
    lines: this.activeLineCount(),
    swarmCap: this.swarmCap
  };
};

BlubTower.prototype.activeLineCount = function () {
  var units = this.lineUnits();
  var n = 0;
  for (var i = 0; i < BlubTower.LINE_IDS.length; i++) {
    if (units[BlubTower.LINE_IDS[i]]) n++;
  }
  return n;
};

// What a tier would do to THIS tower, MEASURED by setting the flag,
// recalculating, and putting it back -- the trick the Warbringer and the
// Rifleman both use. Measuring rather than reading the row is what makes the
// card honest about crosspathing: B1's "+1 damage" reads against whichever unit
// the main line is actually calling.
BlubTower.prototype.previewUpgrade = function (id) {
  var upgrade = BlubTower.upgradeById(id);
  if (!upgrade) return { effects: [], changes: [], grants: [] };

  var before = this.statSnapshot();
  var owned = this.hasUpgrade(id);

  if (!owned) {
    this["has" + id] = true;
    this.recalcStats();
  }
  var after = this.statSnapshot();
  if (!owned) {
    this["has" + id] = false;
    this.recalcStats();
  }

  var changes = UpgradeEffects.statChanges(before, after);

  // The rows no shared field name covers. Order matches the panel: what the
  // line summons, then how tough it is, then how often it arrives.
  if (before.unitName !== after.unitName) {
    changes.unshift({ label: "Summons", from: before.unitName, to: after.unitName,
      delta: "" });
  }
  if (before.charges !== after.charges) {
    changes.push({ label: "Charges", from: String(before.charges),
      to: String(after.charges),
      delta: UpgradeEffects.signed(after.charges - before.charges) });
  }
  if (before.interval !== after.interval) {
    changes.push({ label: "Every", from: before.interval.toFixed(1) + " s",
      to: after.interval.toFixed(1) + " s",
      delta: UpgradeEffects.signed(after.interval - before.interval) + " s" });
  }
  if (before.lines !== after.lines) {
    changes.push({ label: "Summon lines", from: String(before.lines),
      to: String(after.lines), delta: UpgradeEffects.signed(after.lines - before.lines) });
  }
  if (before.swarmCap !== after.swarmCap) {
    changes.push({ label: "Swarm cap", from: Math.round(before.swarmCap * 100) + "%",
      to: Math.round(after.swarmCap * 100) + "%", delta: "" });
  }

  var grants = upgrade.grants ? upgrade.grants.slice() : [];

  // The button's short phrase. Built from the same measurement rather than
  // typed, so a retuned row moves its own description.
  var effects = [];
  if (before.unitName !== after.unitName) effects.push("summons " + after.unitName);
  var deltas = {
    hp: after.hp - before.hp,
    range: after.range - before.range,
    damage: after.damage - before.damage
  };
  var described = UpgradeEffects.describe(deltas, grants);
  if (described) effects.push(described);
  if (after.interval < before.interval) {
    effects.push(UpgradeEffects.signed(after.interval - before.interval) + "s cycle");
  }
  if (after.charges > before.charges) {
    effects.push(UpgradeEffects.signed(after.charges - before.charges) + " charges");
  }

  return { effects: effects, changes: changes, grants: grants };
};

BlubTower.prototype.upgradeEffects = function (id) {
  return this.previewUpgrade(id).effects;
};

// Set the flag and rebuild. Assumes the purchase is allowed and paid for -- go
// through buyUpgrade() in game.js instead of calling this.
//
// A health tier GRANTS ITS DELTA rather than healing to the new maximum, the
// rule both other upgradeable towers follow since 2026-08-01. It matters more
// here than anywhere: A5 adds five thousand points, and "heals to full" would
// make it a full repair on top of everything else it buys.
BlubTower.prototype.applyUpgrade = function (id) {
  var maxHpBefore = this.maxHp;

  this["has" + id] = true;
  this.totalSpent += this.upgradeCost(id);
  this.recalcStats();
  this.clampTimersToCycle();

  if (this.maxHp > maxHpBefore) {
    this.currentHp = Math.min(this.maxHp, this.currentHp + (this.maxHp - maxHpBefore));
  }
};

BlubTower.prototype.ownedUpgradeIds = function () {
  var owned = [];
  for (var i = 0; i < BlubTower.UPGRADES.length; i++) {
    if (this.hasUpgrade(BlubTower.UPGRADES[i].id)) owned.push(BlubTower.UPGRADES[i].id);
  }
  return owned;
};


// --- the fleet --------------------------------------------------------------

BlubTower.prototype.livingBlubs = function () {
  var out = [];
  for (var i = 0; i < this.blubs.length; i++) {
    if (!this.blubs[i].isDestroyed()) out.push(this.blubs[i]);
  }
  return out;
};

BlubTower.prototype.blubCount = function () {
  return this.livingBlubs().length;
};

// The sum the player needs in order to aim for a Coagulation tier, and the
// reason the brief asks for it on the tower permanently: the tier is decided by
// CURRENT charges, so this number is the only way to see a merge coming.
BlubTower.prototype.blubHpTotal = function () {
  var living = this.livingBlubs();
  var total = 0;
  for (var i = 0; i < living.length; i++) total += Math.max(0, living[i].currentHp);
  return total;
};

// What one blub gets from the crowd around it: +5% damage and attack speed per
// OTHER living blub of this same summoner, to the owned cap.
//
// A blub never buffs itself, which is why this counts the fleet minus one, and
// only THIS tower's fleet, so a second summoner's blubs contribute nothing.
BlubTower.prototype.swarmBonusFor = function (blub) {
  if (!(this.swarmCap > 0)) return 0;
  // A fused monster has no allies left to draw on, and the brief excludes it at
  // tiers 3 and 4 explicitly. Below that it is an ordinary member of the fleet.
  if (blub && blub.monsterTier >= 3) return 0;
  var others = this.blubCount() - 1;
  if (others <= 0) return 0;
  return Math.min(this.swarmCap, others * BlubTower.SWARM_PER_BLUB);
};

// Every enemy a blub of this summoner hits takes this, once per hit. Called by
// the blubs rather than by the damage pipeline, because "hit by a blub of THIS
// invoker" is exactly the condition and nothing downstream knows it.
BlubTower.prototype.applyWeaken = function (enemy) {
  if (!this.hasWeaken || !enemy) return;
  DamageAmp.add(enemy, BlubTower.WEAKEN_PER_HIT, BlubTower.WEAKEN_SECONDS);
};


// --- summoning --------------------------------------------------------------

// Is this spot free for a body of `radiusPx`? The ordinary tower packing rule,
// asked of the same array the build validator asks -- two footprints may touch
// but not overlap, so the gap is the sum of the two radii.
//
// A DESTROYED TOWER IS ALREADY GONE. The main loop's sweep runs before the
// tower updates, so a blub that spent its last charge during this step is still
// in the array when the next summon looks for room. Skipping it here is what
// makes the brief's "l'emplacement est libere instantanement" literally true
// rather than true one frame later; whyCannotBuild in game.js skips them for
// the same reason.
BlubTower.prototype.spotIsFree = function (x, y, radiusPx) {
  if (typeof VIEW_WIDTH === "number" &&
      (x < 0 || y < 0 || x > VIEW_WIDTH || y > VIEW_HEIGHT)) {
    return false;
  }

  var list = (typeof towers !== "undefined") ? towers : this.blubs;
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    if (t.isDestroyed && t.isDestroyed()) continue;
    var gap = radiusPx + t.footprintPx;
    var dx = t.x - x;
    var dy = t.y - y;
    if (dx * dx + dy * dy < gap * gap) return false;
  }
  return true;
};

// How far a point is from the nearest enemy route. Used only by the fallback
// sweep, and asked of every route on a multi-route map, because "le chemin des
// ennemis" on Twin Confluence is two roads.
BlubTower.prototype.distanceToRoad = function (x, y) {
  var routes = (typeof paths !== "undefined" && paths && paths.length)
    ? paths : [this.path];
  var best = Infinity;
  for (var i = 0; i < routes.length; i++) {
    var d = routes[i].distanceToPoint(x, y);
    if (d < best) best = d;
  }
  return best;
};

// Where the next blub of this size goes, or null if there is nowhere for it.
//
// Three steps, in the order the brief states them:
//
//   1. A RANDOM POINT INSIDE THE TOWER'S RANGE. sqrt on the radius so the
//      sample is uniform over the disc rather than piling up at the centre --
//      which matters here, because the centre is the one part of the disc the
//      tower's own footprint has already taken.
//   2. IF NOTHING RANDOM LANDS, the free point NEAREST THE ENEMY PATH. A
//      deterministic ring sweep, so a saturated board still places its blub
//      where it can do something rather than not at all.
//   3. IF THERE IS GENUINELY NO ROOM, null -- and the caller resets the cycle
//      and tries again next time, with no error and no lost timer.
BlubTower.PLACEMENT_TRIES = 24;
BlubTower.PLACEMENT_RINGS = [0.95, 0.8, 0.65, 0.5, 0.35];
BlubTower.PLACEMENT_ANGLES = 24;

BlubTower.prototype.findSpawnPoint = function (footprintUl) {
  var radiusPx = ul(footprintUl);
  var reachPx = this.rangePx;
  var i;

  for (i = 0; i < BlubTower.PLACEMENT_TRIES; i++) {
    var angle = this.nextRandom() * Math.PI * 2;
    var r = Math.sqrt(this.nextRandom()) * reachPx;
    var x = this.x + Math.cos(angle) * r;
    var y = this.y + Math.sin(angle) * r;
    if (this.spotIsFree(x, y, radiusPx)) return { x: x, y: y };
  }

  return this.findRoadSpot(footprintUl, reachPx);
};

// The free spot NEAREST THE ENEMY PATH, swept deterministically. Two callers,
// and the difference is only how far out they are allowed to look:
//
//   findSpawnPoint  the tower's own range, as the fallback when no random
//                   point in it happened to be free
//   coagulate       further, because a monster blub is one body that has to go
//                   somewhere and "as near as possible to the track" is where
//                   the owner asked for it
//
// Returns null when there is genuinely nowhere, which both callers handle.
BlubTower.prototype.findRoadSpot = function (footprintUl, reachPx) {
  var radiusPx = ul(footprintUl);
  var best = null;
  var bestDist = Infinity;

  for (var ring = 0; ring < BlubTower.PLACEMENT_RINGS.length; ring++) {
    var rr = reachPx * BlubTower.PLACEMENT_RINGS[ring];
    for (var a = 0; a < BlubTower.PLACEMENT_ANGLES; a++) {
      var th = (a / BlubTower.PLACEMENT_ANGLES) * Math.PI * 2;
      var px = this.x + Math.cos(th) * rr;
      var py = this.y + Math.sin(th) * rr;
      if (!this.spotIsFree(px, py, radiusPx)) continue;
      var d = this.distanceToRoad(px, py);
      if (d < bestDist) {
        bestDist = d;
        best = { x: px, y: py };
      }
    }
  }
  return best;
};

// Put one unit of `unitId` on the board. Returns the blub, or null if there was
// no room -- which is not an error and is not logged: the cycle simply resets.
BlubTower.prototype.summon = function (unitId) {
  var stats = this.summonStats(unitId);
  if (!stats) return null;

  var spot = this.findSpawnPoint(stats.footprintUl);
  if (!spot) return null;

  var blub = new Blub(this, spot.x, spot.y, stats);
  this.summonSerial++;
  this.blubs.push(blub);
  this.registerSummon(blub);
  return blub;
};

// A blub joins the global tower list, because that is what makes it occupy
// space, take stuns, be clickable and be swept out when it dies. Routed through
// addTower rather than pushing, so the array stays sorted by pathProgress --
// the invariant the whole target-claiming order rests on.
BlubTower.prototype.registerSummon = function (blub) {
  if (typeof addTower === "function") addTower(blub);
  else if (typeof towers !== "undefined") towers.push(blub);
};

BlubTower.prototype.lineIsEnabled = function (lineId) {
  return this.lineEnabled[lineId] !== false;
};

// How far this line is through its cycle, 0..1. Full means the next body
// arrives now.
//
// It is the FILL, not the countdown -- `1 - left / total` rather than the timer
// itself -- because that is what the panel draws and what the player reads: a
// bar that grows towards an event. Deriving it here rather than in the drawing
// means the bar and the cycle cannot disagree, the same reason `slotRect` is
// shared between drawing and clicking.
//
// A line that is switched off holds its clock (see update), so its bar simply
// stops where it was rather than emptying -- which is the honest picture of
// what the toggle does.
BlubTower.prototype.lineProgress = function (lineId) {
  var unitId = this.lineUnits()[lineId];
  if (!unitId) return 0;

  var total = this.intervalFor(unitId);
  if (!(total > 0)) return 1;

  var left = this.timers[lineId];
  if (left === undefined) return 0;
  return Math.max(0, Math.min(1, 1 - left / total));
};

BlubTower.prototype.toggleLine = function (lineId) {
  this.lineEnabled[lineId] = !this.lineIsEnabled(lineId);
  return this.lineEnabled[lineId];
};


// --- the blub rail ----------------------------------------------------------
//
// One box per summon line, drawn in a column BESIDE the inspection panel rather
// than as rows inside it (2026-08-09, at the owner's request: "separated grey
// color boxes on the left of the panel, one per blub type").
//
// Why beside and not inside. These are not actions on the tower, they are the
// tower's *contents* -- three things it is making, each with its own clock. As
// panel rows they competed for height with the upgrade buttons, cost a layout
// exemption to fit at all, and read as three more things to buy. As a rail they
// are a status column that happens to be clickable, they cost the panel no
// height, and the grey says plainly that they are not a purchase.
//
// **THE BOX IS THE SWITCH** (revised 2026-08-10). It first opened a second
// panel view with a Producing/Stop button inside it, and the owner's verdict
// was that clicking a box "creates an unknown behavior": you clicked a thing
// that looked like a switch and got a different screen with another switch on
// it. It is now what it looks like -- "from a3 onward make the greybox
// highlighted while they produce and if they are left clicked they dim and stop
// production". One click, one meaning, and the state is the box's own
// brightness rather than a word somewhere else.
//
// The BASE STATS moved to the hover card, which is where every other
// explain-this-before-you-touch-it in this game already lives (see cardFor and
// hoveredCard in js/game.js). Hovering is also the gesture that cannot change
// anything, which is the right one for reading.
//
// `toggleable` is false below A3 -- the tier that buys the switches. The box is
// still drawn and still counts down there, because "what is it making and when"
// is worth knowing from the first one; it simply does not answer a click, and
// its card says why.
//
// The tower answers WHAT is on the rail; js/game.js decides WHERE, exactly as
// it does for every other rectangle. `secondsLeft` and `progress` are the same
// clock spelled two ways -- the number to read and the bar to glance at.
BlubTower.prototype.railLines = function () {
  // A FUSED TOWER HAS AN EMPTY RAIL. From tier 3 the monster blub IS the tower
  // and summoning has stopped, so there is nothing being produced to put a box
  // on -- and three frozen bars would say the opposite of what is happening.
  // The rail comes back when the monster dies, along with the summoning.
  if (this.summoningHalted) return [];

  var units = this.lineUnits();
  var out = [];
  var self = this;

  BlubTower.LINE_IDS.forEach(function (lineId) {
    var unitId = units[lineId];
    if (!unitId) return;
    var left = self.timers[lineId];
    var on = self.lineIsEnabled(lineId);
    out.push({
      lineId: lineId,
      unitId: unitId,
      name: BlubTower.unitById(unitId).name,
      on: on,
      toggleable: !!self.hasToggles,
      // BLOCKED: the cycle has run out and there is nowhere to put the body.
      // The bar sits full and the blub lands the instant a space opens (see
      // update), so the box can say "no room" rather than looking stuck.
      blocked: on && left !== undefined && left <= 0,
      progress: self.lineProgress(lineId),
      secondsLeft: Math.max(0, left === undefined ? 0 : left),
      alive: self.countOf(unitId),
      card: self.blubTypeCard(unitId, lineId)
    });
  });

  return out;
};

// Left-clicking a box starts or stops that line. Returns null, or a short
// reason -- the same shape whyCannotUpgrade has, so the caller never needs to
// know which tier unlocked what.
BlubTower.prototype.clickLine = function (lineId) {
  if (!this.hasToggles) return "needs A3";
  if (!this.lineUnits()[lineId]) return "no such line";
  this.toggleLine(lineId);
  return null;
};

// How many of one unit type are standing right now.
BlubTower.prototype.countOf = function (unitId) {
  var n = 0;
  for (var i = 0; i < this.blubs.length; i++) {
    if (this.blubs[i].unitId === unitId && !this.blubs[i].isDestroyed()) n++;
  }
  return n;
};

// The hover card for a rail box: what this type arrives with, and what clicking
// the box will do. Hovering is the gesture that cannot change anything, which
// makes it the right one for reading -- and it is where every other
// explain-before-you-touch-it in this game already lives.
BlubTower.prototype.blubTypeCard = function (unitId, lineId) {
  var on = this.lineIsEnabled(lineId);
  var rows = this.blubTypeStatLines(unitId).map(function (row) {
    return { label: row[0], from: "", to: row[1], delta: "" };
  });

  var note;
  if (!this.hasToggles) {
    note = "A3 buys the switches. Until then every line runs.";
  } else {
    note = on
      ? "Click to stop this line. Blubs already on the board are not affected, " +
        "and its countdown holds where it stands rather than resetting."
      : "Click to start it again. It picks the countdown up rather than " +
        "restarting it.";
  }

  return UpgradeEffects.card({
    title: BlubTower.unitById(unitId).name,
    subtitle: on ? "producing" : "stopped",
    changes: rows,
    note: note
  });
};

// A blub type's BASE numbers -- what one of these arrives with, resolved for
// this tower so B1 and B2 are already in them. Deliberately not the live
// numbers of any one body on the board: those are on that body's own panel,
// one click away on the map, and a type card that changed every time a blub
// died would be unreadable.
BlubTower.prototype.blubTypeStatLines = function (unitId) {
  var unit = BlubTower.unitById(unitId);
  var stats = this.summonStats(unitId);
  var rows = [
    ["Unit", unit.name],
    ["Damage", TowerStats.number(stats.damage)],
    ["Attack speed", TowerStats.rate(stats.rate)],
    ["Charges", String(stats.hp)],
    ["Range", TowerStats.distance(stats.rangeUl)],
    ["Footprint", TowerStats.distance(stats.footprintUl)],
    ["Every", this.intervalFor(unitId).toFixed(1) + " s"]
  ];

  if (stats.splashUl > 0) rows.push(["Area", TowerStats.distance(stats.splashUl)]);
  if (stats.growth > 0) {
    rows.push(["Feeds", "+" + Math.round(stats.growth * 100) + "% a hit"]);
  }
  if (stats.laser) {
    rows.push(["Lance", "every " + stats.laser.every + ", " + stats.laser.damage + " dmg"]);
  }
  if (stats.deathBlast) {
    rows.push(["On death", stats.deathBlast.damage + " in " +
      TowerStats.distance(stats.deathBlast.radiusUl)]);
  }
  if (this.swarmCap > 0) {
    rows.push(["Swarm", "+" + Math.round(this.swarmBonusFor(null) * 100) + "% now"]);
  }

  // Lifetime damage a single one of these will do if it spends every charge,
  // which is the number that actually compares two summon lines: a Mini Blub II
  // is 36 and a Cyberblub is 480, and neither their damage nor their rate says
  // so on its own.
  var lifetime = stats.damage * stats.hp;
  if (stats.growth > 0) {
    lifetime = stats.damage * (Math.pow(1 + stats.growth, stats.hp) - 1) / stats.growth;
  }
  rows.push(["Lifetime dmg", TowerStats.formatTotal(lifetime)]);
  rows.push(["DPS", TowerStats.dpsText(stats.damage * stats.rate)]);
  return rows;
};


// --- Coagulation (A5) -------------------------------------------------------

BlubTower.prototype.coagulationReady = function () {
  return this.hasCoagulation && this.coagCooldown <= 0;
};

// Merge every living blub into one. Returns null on success, or a short reason.
//
// THE POOL INCLUDES AN EXISTING MONSTER, which is the brief's "une Coagulation
// ulterieure absorbe le monster blub existant et l'additionne aux nouveaux
// blubs" -- it is in `this.blubs` like everything else, so it needs no special
// case beyond being counted.
//
// HP IS THE CURRENT TOTAL, NOT THE MAXIMUM. A blub that has already fired
// brings less, which is the whole tactical shape of the ability: you merge a
// fresh fleet, not a spent one.
//
// DAMAGE IS THE RAW SUM, and "raw" is the brief's word. B1's flat +1 is part of
// each blub's resolved damage and so is included; the swarm buff and a Hungry
// Blub's compounding are live multipliers on top of that resolved figure and
// are not.
BlubTower.prototype.coagulate = function () {
  if (!this.hasCoagulation) return "needs A5";
  if (this.coagCooldown > 0) {
    return "recharging (" + Math.ceil(this.coagCooldown) + "s)";
  }

  var pool = this.livingBlubs();
  if (!pool.length) return "no blubs to merge";

  var hp = 0;
  var damage = 0;
  for (var i = 0; i < pool.length; i++) {
    hp += Math.max(0, pool[i].currentHp);
    damage += pool[i].baseDamage;
    pool[i].dissolve();
  }
  this.blubs = [];

  var tier = BlubTower.monsterTierFor(hp);

  // WHERE IT STANDS DEPENDS ON WHETHER IT IS THE TOWER (2026-08-10, at the
  // owner's correction: "for t 0 1 and 2 the monster should not replace the
  // tower and now it does, only t 3 and 4 should, and should be placed as near
  // as possible to the track").
  //
  // Below tier 3 the merge produces one big blub and the tower carries on
  // summoning beside it, so putting it ON the tower was wrong twice over: it
  // hid the thing still doing the work, and it made a body that has to shoot
  // stand wherever the tower happened to be built rather than where it can
  // reach.
  //
  // IT IS PLACED LIKE ANY OTHER BLUB: INSIDE THE TOWER'S RANGE (2026-08-10, at
  // the owner's second correction on this — "make sure monster blub spawns like
  // a normal blub inside the range when T 0 1 or 2"). The first version let the
  // search run out to several times the range so it could hug the road from
  // anywhere, and the result was a monster standing well outside the circle its
  // own tower draws — which reads as a bug whatever the reasoning behind it.
  // The range is the tower's promise about where its blubs appear, and a merge
  // does not get to break it.
  //
  // Within that bound it still takes the spot NEAREST THE ROAD rather than a
  // random one, which is the other half of the earlier correction and costs
  // nothing: Coagulation needs A5, and A5 puts the range at 250 u.l., so there
  // is always somewhere for a 35 u.l. body to stand.
  //
  // At tier 3 the monster IS the tower: it has fused with it, summoning has
  // stopped, and the two are one thing standing in one place.
  var spot = { x: this.x, y: this.y };
  if (!tier.fused) {
    spot = this.findRoadSpot(tier.footprintUl, this.rangePx) ||
      this.findSpawnPoint(tier.footprintUl) ||
      spot;
  }

  var monster = new Blub(this, spot.x, spot.y, {
    unitId: "monster",
    name: "Monster Blub T" + tier.tier,
    damage: damage,
    rate: tier.rate,
    hp: hp,
    rangeUl: tier.global ? Infinity : tier.rangeUl,
    footprintUl: tier.footprintUl,
    splashUl: tier.splashUl || 0,
    splashGlobal: !!tier.splashGlobal,
    growth: 0,
    deathBlast: null,
    laser: null
  }, tier);

  this.blubs.push(monster);
  this.registerSummon(monster);
  this.monster = monster;
  this.coagCooldown = BlubTower.COAGULATION_COOLDOWN_SECONDS;

  // A fused monster is the tower now. Summoning stops while it lives, and its
  // death is what starts it again -- see update().
  if (tier.fused) this.summoningHalted = true;

  return null;
};


// --- the loop ---------------------------------------------------------------

// Returns the damage this tower landed ITSELF this step, which is always 0: a
// summoner never attacks. Its blubs are in `towers` and are stepped by the main
// loop directly, and they credit their damage to this tower through
// TowerScore.apply, so there is nothing to forward here.
BlubTower.prototype.update = function (dt, enemies, bullets, world) {
  this.pulse += dt;

  // Drop anything that died. The global array is swept by the main loop; this
  // is the ownership half of the same bookkeeping.
  if (this.blubs.length) {
    var alive = [];
    for (var i = 0; i < this.blubs.length; i++) {
      if (!this.blubs[i].isDestroyed()) alive.push(this.blubs[i]);
    }
    this.blubs = alive;
  }

  if (this.coagCooldown > 0) this.coagCooldown -= dt;

  // THE MONSTER DIED, so the tower is a tower again. The brief: "la tour
  // redevient une tour de niveau A4 et reprend ses invocations normalement."
  // A5 is not refunded and Coagulation is not lost -- what is lost is the
  // fusion, and the cooldown decides when another one is possible.
  if (this.monster && this.monster.isDestroyed()) {
    this.monster = null;
    this.summoningHalted = false;
  }

  if (this.summoningHalted) return 0;

  var units = this.lineUnits();
  for (var l = 0; l < BlubTower.LINE_IDS.length; l++) {
    var lineId = BlubTower.LINE_IDS[l];
    var unitId = units[lineId];
    if (!unitId) continue;
    if (this.timers[lineId] === undefined) this.timers[lineId] = this.intervalFor(unitId);

    // A LINE THAT IS SWITCHED OFF HOLDS ITS CLOCK rather than banking it.
    // Otherwise turning a line back on after a minute would empty a dozen
    // blubs onto the board in one step -- the same hold-at-zero reasoning every
    // firing tower here uses for an idle cooldown.
    if (!this.lineIsEnabled(lineId)) continue;

    this.timers[lineId] -= dt;

    var guard = 0;
    while (this.timers[lineId] <= 0 && guard < 8) {
      guard++;
      // NO ROOM MEANS WAIT, NOT SKIP (2026-08-10, at the owner's request:
      // "lorsqu'il ne peut plus en placer a cause d'un manque de place la bar
      // reste chargee au maximum et un blub est place a l'instant ou une place
      // se libere").
      //
      // The brief originally said a failed cycle simply came round again, and
      // that was worse in play than it sounds: on a full board every line spent
      // its whole interval counting down to another failure, so the moment a
      // blub finally died the board sat empty for up to thirty seconds. Holding
      // the timer at zero makes the bar say "ready, blocked" instead of lying
      // about a countdown, and the next step places the body -- so a space that
      // opens is filled on the frame it opens.
      if (!this.summon(unitId)) {
        this.timers[lineId] = 0;
        break;
      }
      // Added rather than assigned, so a cycle that resolved late in a step
      // keeps its rhythm instead of stretching a frame at a time. `guard` is
      // the backstop the interval floor already makes unnecessary.
      this.timers[lineId] += this.intervalFor(unitId);
    }
  }

  return 0;
};

BlubTower.prototype.takeDamage = function (amount) {
  return TowerHealth.damage(this, amount);
};

BlubTower.prototype.isDestroyed = function () {
  return TowerHealth.isDestroyed(this);
};

BlubTower.prototype.containsPoint = Tower.prototype.containsPoint;


// --- what this tower reports ------------------------------------------------

// A SUMMONER'S ATTACK IS ITS FLEET, resolved once a second.
//
// These two exist for one caller: Enemy.towerDps, which is how the Tyrant picks
// the strongest tower on the board. A tower that answered zero would be
// permanently invisible to the one attack in the game that goes looking for the
// board's best piece, which is not a property this tower should have -- so it
// answers with what its blubs are actually doing, and the rate is 1 so that the
// product IS that figure.
//
// The panel does NOT print these through TowerStats.damage/attackSpeed: an
// "Attack speed 1.00/s" row on a tower that never attacks would be a lie. It
// prints its own fleet rows instead -- see statLines.
BlubTower.prototype.fleetDps = function () {
  var living = this.livingBlubs();
  var total = 0;
  for (var i = 0; i < living.length; i++) {
    total += living[i].attackDamage() * living[i].attacksPerSecond();
  }
  return total;
};

BlubTower.prototype.attackDamage = function () { return this.fleetDps(); };
BlubTower.prototype.attacksPerSecond = function () { return 1; };

BlubTower.prototype.statLines = function () {
  var rows = TowerStats.totals(this).concat([
    TowerStats.range(this),
    ["Tower HP", TowerHealth.label(this)]
  ]);

  // The two readouts the brief asks for permanently. The HP sum is the one that
  // matters most: Coagulation's tier is decided by it, so it is the number a
  // player aims with.
  rows.push(["Blubs", String(this.blubCount())]);
  rows.push(["Blub HP", String(Math.round(this.blubHpTotal()))]);

  if (this.swarmCap > 0) {
    rows.push(["Swarm", "+" + Math.round(this.swarmBonusFor(null) * 100) + "%  (max " +
      Math.round(this.swarmCap * 100) + "%)"]);
  }
  if (this.monster) {
    rows.push(["Monster", "T" + this.monster.monsterTier]);
  }
  if (this.hasCoagulation && this.coagCooldown > 0) {
    rows.push(["Coagulation", Math.ceil(this.coagCooldown) + " s"]);
  }

  rows.push(["Fleet DPS", TowerStats.dpsText(this.fleetDps())]);
  return rows;
};


// --- the shared upgrade panel -----------------------------------------------

BlubTower.prototype.panelActions = function () {
  var actions = [];
  var self = this;

  ["A", "B"].forEach(function (branch) {
    var next = self.nextUpgrade(branch);

    if (!next) {
      actions.push({
        id: "upgrade" + branch,
        branch: branch,
        upgradeId: null,
        label: "Path " + branch + "  MAXED",
        detail: "maxed",
        effects: "every tier bought",
        reason: "every tier bought",
        enabled: false,
        tone: "upgrade",
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
      enabled: refusal === null &&
        (typeof cash !== "number" || cash >= self.upgradeCost(next.id)),
      tone: "upgrade",
      tooltip: function () { return self.upgradeCard(next, refusal, preview); }
    });
  });

  // The summon lines USED TO BE THREE COMPACT ROWS HERE and are now the rail
  // beside the panel (see railLines). They were moved on 2026-08-09 at the
  // owner's request, and the panel is better for it: three fewer rows means the
  // upgrade buttons and Coagulation are the whole action area again, which is
  // what an action area should be.

  if (this.hasCoagulation) {
    var cooling = this.coagCooldown > 0;
    var pooled = Math.round(this.blubHpTotal());
    var tier = BlubTower.monsterTierFor(pooled);

    actions.push({
      id: "coagulate",
      label: "Coagulation",
      detail: cooling ? "ready in " + Math.ceil(this.coagCooldown) + "s" : "ready",
      effects: this.blubCount() + " blubs · " + pooled + " HP → tier " + tier.tier,
      enabled: !cooling && this.blubCount() > 0,
      tone: "ability",
      tooltip: UpgradeEffects.card({
        title: "Coagulation",
        subtitle: cooling ? "ready in " + Math.ceil(this.coagCooldown) + " s" : "ready",
        changes: [
          { label: "Blubs merged", from: "", to: String(this.blubCount()), delta: "" },
          { label: "Pooled HP", from: "", to: String(pooled), delta: "" },
          { label: "Resulting tier", from: "", to: "T" + tier.tier, delta: "" }
        ],
        abilities: UpgradeEffects.abilities(["coagulation"], null),
        note: "Permanent. The merge uses CURRENT charges, so a spent fleet " +
          "merges smaller. Tier 4 needs exactly 7777."
      })
    });
  }

  return actions;
};

BlubTower.prototype.upgradeCard = function (upgrade, refusal, preview) {
  var note = null;
  if (refusal) {
    note = "Unavailable: " + refusal + ".";
  } else if (upgrade.requiresOther && !this.hasUpgrade(upgrade.requiresOther)) {
    note = "Needs " + upgrade.requiresOther + " on the other branch first.";
  } else if (upgrade.locksPath && this.lockedBranch() === null) {
    var tier = parseInt(upgrade.id.slice(1), 10);
    note = "Tier " + tier + " commits this tower: the other branch is capped at tier " +
      (tier - 1) + " for good.";
  }

  return UpgradeEffects.card({
    title: this.name + "  ·  " + upgrade.id,
    subtitle: refusal ? refusal : this.upgradeCost(upgrade.id) + " mana",
    changes: preview.changes,
    abilities: UpgradeEffects.abilities(preview.grants, null),
    note: note
  });
};

BlubTower.prototype.performAction = function (id, context) {
  if (id === "coagulate") {
    var refused = this.coagulate();
    return refused ? refused : this.name + " → coagulation";
  }

  if (id && id.indexOf("line:") === 0) {
    var lineId = id.slice(5);
    var on = this.lineIsEnabled(lineId);
    this.toggleLine(lineId);
    return this.name + " → " + lineId + (on ? " off" : " on");
  }

  if (id !== "upgradeA" && id !== "upgradeB") return null;

  var next = this.nextUpgrade(id.slice(-1));
  if (!next) return "path maxed";

  var refusal = buyUpgrade(this, next.id);
  if (refusal) return refusal;

  return this.name + " → " + next.id;
};


// --- drawing ----------------------------------------------------------------

// Branch decides the colour: A is organic (a warm moss green that reads as
// something grown), B is machined (cold steel blue), and an uncommitted
// summoner is the pale sac colour both start from.
BlubTower.prototype.tint = function () {
  var branch = this.lockedBranch();
  if (branch === "A") return { r: 138, g: 214, b: 126 };
  if (branch === "B") return { r: 124, g: 176, b: 232 };
  return { r: 196, g: 206, b: 168 };
};

BlubTower.prototype.draw = function (ctx) {
  var rgb = this.tint();
  var base = "rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")";
  var r = this.footprintPx;

  if (this.showRange) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.rangePx, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.05)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.4)";
    ctx.stroke();
  }

  // The pad, drawn as a circle at the footprint radius exactly like the
  // Rifleman's -- what you see is what collides and what you click.
  ctx.beginPath();
  ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(24,28,26,0.92)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = base;
  ctx.stroke();

  // The brood sac, breathing off a clock rather than storing a phase.
  var breathe = 1 + 0.07 * Math.sin(this.pulse * 1.7);
  ctx.beginPath();
  ctx.arc(this.x, this.y - r * 0.1, r * 0.58 * breathe, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.55)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();

  // Owned upgrades as pips around the rim, the same signal the Warbringer and
  // the Rifleman use.
  for (var i = 0; i < this.upgradeCount; i++) {
    var a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(this.x + Math.cos(a) * (r - 4), this.y + Math.sin(a) * (r - 4), 2, 0,
      Math.PI * 2);
    ctx.fillStyle = base;
    ctx.fill();
  }

  this.drawCounters(ctx, r);
};

// The two permanent readouts the brief asks for: how many blubs are alive, and
// what their charges add up to.
//
// THE STRING LIVES HERE because both renderers draw it. The 2D world pass calls
// drawCounters below; the 3D branch skips that pass entirely and draws the same
// label in its own overlay layer (js/gl/gl-world.js), positioned by asking the
// camera where the tower landed. Two drawing paths, one sentence -- the same
// arrangement the recruit hover readout ended up with, and for the same reason:
// a second copy of the text is a second thing to keep true.
BlubTower.prototype.counterLabel = function () {
  return this.blubCount() + " blubs  ·  " + Math.round(this.blubHpTotal()) + " HP";
};

// On the tower itself rather than only in the panel, because the pooled HP is
// what a player watches while deciding when to Coagulate, and a readout you
// have to open a panel to see is not a readout.
BlubTower.prototype.drawCounters = function (ctx, r) {
  var text = this.counterLabel();
  ctx.font = "600 11px system-ui, sans-serif";
  var w = ctx.measureText(text).width + 10;
  var x = this.x - w / 2;
  var y = this.y - r - 18;

  ctx.fillStyle = "rgba(18,22,20,0.85)";
  ctx.fillRect(x, y, w, 15);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(160,200,150,0.45)";
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 14);

  ctx.fillStyle = "#d6efc8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, this.x, y + 8);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
};

BlubTower.drawIcon = function (ctx, cx, cy, size) {
  var r = size * 0.36;
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.06, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(30,38,32,0.95)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#8ad67e";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.02, r * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(138,214,126,0.6)";
  ctx.fill();

  // Three little ones around it -- the tower's whole idea in one glyph.
  for (var i = 0; i < 3; i++) {
    var a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 1.35, cy + size * 0.06 + Math.sin(a) * r * 1.35,
      size * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = "#c8e8b8";
    ctx.fill();
  }
};


// ---------------------------------------------------------------------------
// Blub -- one summoned unit.
//
// It is a tower as far as the board is concerned (see the file header) and a
// creature as far as the player is concerned. `isSummon` is what separates the
// two: js/enemy.js will not target one, and js/game.js gives it no build slot.
//
// ITS HIT POINTS ARE ITS AMMUNITION. currentHp/maxHp are spelled the way every
// tower spells them so the shared health bar, the stun system and the destroyed
// sweep all work untouched -- but every attack spends one, so the bar over a
// blub is a magazine emptying rather than a wound opening.
// ---------------------------------------------------------------------------

function Blub(owner, x, y, stats, monsterTier) {
  this.owner = owner;
  this.x = x;
  this.y = y;
  this.isSummon = true;

  this.pathProgress = owner.path ? owner.path.progressAtPoint(x, y) : 0;

  this.unitId = stats.unitId;
  this.name = stats.name;

  // A blub is free and refunds nothing. sellValue() reads totalSpent, so this
  // is also what makes its panel's Sell button pay exactly 0 mana -- the brief's
  // "option de vente a 0 gold" needs no special case anywhere.
  this.cost = 0;
  this.totalSpent = 0;

  this.footprintRadiusUl = stats.footprintUl;
  this.footprintPx = ul(this.footprintRadiusUl);

  this.baseDamage = stats.damage;
  this.baseRate = stats.rate;
  this.rangeUl = stats.rangeUl;
  this.rangePx = stats.rangeUl === Infinity ? Infinity : ul(stats.rangeUl);
  this.splashUl = stats.splashUl || 0;
  this.splashGlobal = !!stats.splashGlobal;
  this.growth = stats.growth || 0;
  this.deathBlast = stats.deathBlast || null;
  this.laser = stats.laser || null;

  // Targeting is ALWAYS "first" and there is deliberately no cycle button: the
  // brief says "toujours le premier ennemi dans leur portee. Aucune logique de
  // ciblage alternative". The mode lives on a view object rather than on the
  // blub itself because inspectionLayout draws the targeting cycle for anything
  // carrying a string `targeting`, and offering a choice the unit does not have
  // would be a button that lies.
  this.view = {
    x: x, y: y, rangePx: this.rangePx, targeting: "first",
    seesCamo: false, seesFlying: false
  };

  this.attacksMade = 0;
  this.cooldown = 0;
  this.aim = -Math.PI / 2;

  // Cosmetic only: the last shot's endpoint and its age, so draw() can put a
  // tracer on an attack that is otherwise instantaneous. Nothing reads it back.
  this.tracer = null;

  this.monsterTier = monsterTier ? monsterTier.tier : -1;
  this.monster = monsterTier || null;
  this.enemyTargetable = !!(monsterTier && monsterTier.enemyTargetable);
  this.stunImmune = !!(monsterTier && monsterTier.stunImmune);
  this.killsFeedIt = !!(monsterTier && monsterTier.killsFeedIt);
  this.jump = monsterTier && monsterTier.jump ? monsterTier.jump : null;
  this.jumpTimer = this.jump ? this.jump.every : 0;
  this.jumpAnim = 0;
  this.lastKills = owner ? owner.kills : 0;

  TowerHealth.init(this, stats.hp);
  this.showRange = false;
  TowerScore.init(this);
}

// OFF THE BOARD IS OFF THE FLEET, however it left.
//
// `removed` is set by sellTower (js/game.js) when a blub is destroyed through
// its own panel. Without it a sold blub was gone from `towers` -- so it could
// not shoot and could not be clicked -- while still counting towards its
// summoner's blub count, its pooled HP, the swarm buff every other blub was
// drawing on, and the next Coagulation's tier. It was a ghost in exactly the
// numbers the tower is played on.
//
// Folded into isDestroyed rather than handled at each reader, because every one
// of those numbers already goes through livingBlubs(), which already asks this
// question. One flag, one place, and the tower's own update() prunes the body
// on the next step.
Blub.prototype.isDestroyed = function () {
  return this.removed === true || TowerHealth.isDestroyed(this);
};

// Called by sellTower when this body leaves the board by any route other than
// spending its last charge.
Blub.prototype.onRemoved = function () {
  this.removed = true;
};

// Only a tier 3+ monster blub can ever be hit, and js/enemy.js is what enforces
// that by skipping summons in attackCandidates. This stays honest anyway rather
// than trusting the caller: an ordinary blub absorbs nothing.
Blub.prototype.takeDamage = function (amount) {
  if (!this.enemyTargetable) return 0;
  return TowerHealth.damage(this, amount);
};

Blub.prototype.containsPoint = Tower.prototype.containsPoint;

// Remove this blub from the board IMMEDIATELY and without a death animation.
// Used by Coagulation, which absorbs its fleet rather than killing it.
//
// Leaving it to the main loop's destroyed sweep was wrong on both counts: the
// bodies would sit in `towers` holding their footprints for the rest of the
// step -- so the monster could not be placed where the fleet had just been --
// and each of the hundred absorbed blubs would fire Effects.towerDestroyed,
// turning a merge into a hundred simultaneous death bursts.
//
// It goes through sellTower with `refund: false`, which is the game's own
// "removed, not sold" path: it keeps the array's pathProgress ordering, clears
// `inspected` if the panel was open on this body, and refreshes the build
// preview because the ground has changed.
Blub.prototype.dissolve = function () {
  this.currentHp = 0;
  this.maxHp = 0;
  this.dissolved = true;

  if (typeof sellTower === "function") {
    sellTower(this, { refund: false });
  } else if (typeof towers !== "undefined") {
    var at = towers.indexOf(this);
    if (at >= 0) towers.splice(at, 1);
  }
};

Blub.prototype.findTarget = function (enemies) {
  return Targeting.pick(this.view, enemies, true);
};

// The damage ONE attack lands, before mitigation.
//
// Three multipliers in a fixed order, and the order is the reason each of them
// is testable on its own:
//
//   1. the resolved base -- the unit's own damage plus B1's flat bonus, fixed
//      at birth (see BlubTower.summonStats)
//   2. a Hungry Blub's compounding, which is a property of this ONE body and
//      dies with it
//   3. the swarm buff, which is a property of the fleet around it right now
// A FARM'S INVESTMENT REACHES THE BLUBS, not just the tower that plants them:
// "+5% damage, attack speed and range for every tower at tier 5 or above, AND
// FOR THE UNITS THEY SUMMON". Read off the OWNER at use time rather than baked
// in at birth, so a thirty-second surge lifts the blubs already standing on the
// board instead of only the ones planted while it runs -- which is what a
// thirty-second window is for.
Blub.prototype.farmBoost = function () {
  return (typeof FarmBoost === "undefined") ? 1 : FarmBoost.multiplier(this.owner);
};

Blub.prototype.attackDamage = function () {
  var d = this.baseDamage;
  if (this.growth > 0) d *= Math.pow(1 + this.growth, this.attacksMade);
  return d * (1 + this.owner.swarmBonusFor(this)) * this.farmBoost();
};

Blub.prototype.attacksPerSecond = function () {
  return this.baseRate * (1 + this.owner.swarmBonusFor(this)) * this.farmBoost();
};

// Damage one enemy and stack the summoner's weakening debuff on it. Every point
// of damage any blub deals comes through here, so neither the credit nor the
// debuff can be forgotten by a new attack shape.
Blub.prototype.hit = function (enemy, amount) {
  if (!enemy || enemy.dead || enemy.leaked) return 0;
  TowerScore.apply(this.owner, enemy, amount);
  this.owner.applyWeaken(enemy);
  return enemy.lastDamageTaken || 0;
};

// Everything within `radiusUl` of a point, or the whole board when the tier
// says so.
Blub.prototype.splashInto = function (enemies, cx, cy, radiusUl, amount, global) {
  var landed = 0;
  var reach = global ? Infinity : ul(radiusUl);
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead || e.leaked) continue;
    if (!global) {
      var dx = e.pos.x - cx;
      var dy = e.pos.y - cy;
      var span = reach + e.radiusPx();
      if (dx * dx + dy * dy > span * span) continue;
    }
    landed += this.hit(e, amount);
  }
  return landed;
};

// The SuperBlub's lance: a straight line from the blub through its target and
// on to the far side of the board, hitting everything whose body touches it.
//
// 400 FIXED DAMAGE. Not this.attackDamage() -- the brief is explicit that
// neither B1 nor the swarm buff nor anything else moves it.
Blub.prototype.fireLaser = function (target, enemies) {
  var spec = this.laser;
  var dx = target.pos.x - this.x;
  var dy = target.pos.y - this.y;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  var ux = dx / len;
  var uy = dy / len;
  // Far past any board, so the line is effectively infinite in that direction.
  var reach = 4000;
  var halfWidth = ul(spec.widthUl) / 2;

  var landed = 0;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead || e.leaked) continue;
    var ex = e.pos.x - this.x;
    var ey = e.pos.y - this.y;
    var along = ex * ux + ey * uy;
    if (along < 0 || along > reach) continue;         // behind it, or past the end
    var off = Math.abs(ex * uy - ey * ux);
    if (off > halfWidth + e.radiusPx()) continue;
    landed += this.hit(e, spec.damage);
  }

  this.tracer = { x: this.x + ux * reach, y: this.y + uy * reach, age: 0,
    kind: "laser" };
  return landed;
};

// The Mechablub MK2's detonation. It is the ONE exception to "blubs never
// move": it hops onto the nearest enemy -- or onto the road if none is in
// reach -- and goes off there. The move is part of the death animation, so it
// happens on a body that is already being swept off the board this step.
//
// 250 FIXED DAMAGE, for the same reason the lance is fixed.
Blub.prototype.detonate = function (enemies) {
  var spec = this.deathBlast;
  var best = null;
  var bestDist = Infinity;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead || e.leaked) continue;
    var dx = e.pos.x - this.x;
    var dy = e.pos.y - this.y;
    var d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; best = e; }
  }

  var tx = this.x;
  var ty = this.y;
  if (best && bestDist <= this.rangePx * this.rangePx) {
    tx = best.pos.x;
    ty = best.pos.y;
  } else if (this.owner.path) {
    var hit = this.owner.path.closestToPoint(this.x, this.y);
    var pt = this.owner.path.pointAt(hit.progress);
    tx = pt.x;
    ty = pt.y;
  }

  this.x = tx;
  this.y = ty;
  this.blasted = true;
  this.splashInto(enemies, tx, ty, spec.radiusUl, spec.damage, false);
};

// Everything the monster blub's leap would land on: its splash radius, or the
// whole board from tier 3.
//
// ONE reach test, used to decide whether the leap fires AND to apply it, so the
// question "is there anything to leap at" and the answer "here is what it hit"
// cannot disagree. The damage and the stun used to walk the enemy list twice
// with the geometry written out in both places.
Blub.prototype.jumpTargets = function (enemies) {
  var spec = this.jump;
  if (!spec) return [];

  var global = !!spec.global || this.splashGlobal;
  var reach = ul(this.splashUl);
  var out = [];

  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead || e.leaked) continue;
    if (!global) {
      var dx = e.pos.x - this.x;
      var dy = e.pos.y - this.y;
      var span = reach + e.radiusPx();
      if (dx * dx + dy * dy > span * span) continue;
    }
    out.push(e);
  }
  return out;
};

// The monster blub's leap (tier 2 and up). It never moves either -- what jumps
// is the blow, not the body.
//
// IT IS AN ATTACK, NOT A HEARTBEAT (2026-08-10, at the owner's correction:
// "the bounce should activate like an attack, only when there is ennemies").
// It fired on a bare timer before, and a tier 2 leap costs 20 charges -- so a
// monster standing on an empty board spent 20 HP every 15 seconds into nothing
// and eventually killed itself between waves. Returns false when there is
// nothing to hit, and the caller holds the clock rather than banking it, which
// is the same rule every firing thing in this game follows for an idle
// cooldown.
Blub.prototype.performJump = function (enemies) {
  var spec = this.jump;
  var hits = this.jumpTargets(enemies);
  if (!hits.length) return false;

  var amount = this.attackDamage() * spec.damageMultiplier;
  for (var i = 0; i < hits.length; i++) {
    this.hit(hits[i], amount);
    hits[i].applyStun(spec.stunSeconds);
  }

  if (spec.hpCost > 0) this.currentHp -= spec.hpCost;
  this.jumpAnim = spec.animSeconds;
  this.jumpTimer = spec.every;
  return true;
};

// Resolve one attack. Returns the damage landed.
//
// THE CHARGE IS SPENT HERE and nowhere else, which is what keeps the ammunition
// arithmetic exact: a Blub I with 10 charges makes exactly 10 attacks for
// exactly 20 damage, and the acceptance tests count both.
Blub.prototype.resolveAttack = function (target, enemies) {
  // THE COUNTER IS ADVANCED LAST, and that is load-bearing for the Hungry
  // Blub: "chaque attaque augmente ses propres degats" means the FIRST attack
  // lands the table value and the growth is what the attack leaves behind.
  // Incrementing first made attack one worth 20.8 and put the lifetime total
  // 4% over the brief's 1473.
  var shotNumber = this.attacksMade + 1;
  var isLance = !!(this.laser && shotNumber % this.laser.every === 0);
  var landed;

  if (isLance) {
    // Free by design: the lance costs no charge, which is why 51 of them buys
    // exactly five.
    landed = this.fireLaser(target, enemies);
  } else {
    var amount = this.attackDamage();
    if (this.splashGlobal) {
      landed = this.splashInto(enemies, this.x, this.y, 0, amount, true);
    } else if (this.splashUl > 0) {
      landed = this.splashInto(enemies, target.pos.x, target.pos.y, this.splashUl,
        amount, false);
    } else {
      landed = this.hit(target, amount);
    }
    this.currentHp -= 1;
    this.tracer = { x: target.pos.x, y: target.pos.y, age: 0, kind: "shot" };
  }

  this.attacksMade = shotNumber;
  this.aim = Math.atan2(target.pos.y - this.y, target.pos.x - this.x);
  return landed;
};

Blub.prototype.update = function (dt, enemies, bullets, world) {
  if (this.isDestroyed()) return 0;

  if (this.tracer) {
    this.tracer.age += dt;
    if (this.tracer.age > 0.12) this.tracer = null;
  }

  // A tier 3+ monster grows on every kill its summoner scores, permanently.
  // Read as a DELTA off the owner's lifetime counter rather than hooked into
  // the kill path, so nothing else has to know this unit exists.
  if (this.killsFeedIt) {
    var kills = this.owner.kills;
    if (kills > this.lastKills) {
      var gained = kills - this.lastKills;
      this.lastKills = kills;
      this.maxHp += gained;
      this.currentHp += gained;
      this.baseDamage += gained;
    }
  }

  // Mid-leap: it is not shooting. Same shape as the boss's wind-up -- the
  // animation is a real pause, not a skin over one.
  if (this.jumpAnim > 0) {
    this.jumpAnim -= dt;
    return 0;
  }

  if (this.jump) {
    if (this.jumpTimer > 0) this.jumpTimer -= dt;
    if (this.jumpTimer <= 0) {
      // Ready. It leaps only if there is something to leap at; otherwise the
      // clock HOLDS at zero rather than going negative, so the blow lands the
      // instant a wave arrives and waiting costs nothing. Exactly the
      // hold-at-zero rule an idle rifle follows -- see Soldier.update.
      if (this.performJump(enemies)) return 0;
      this.jumpTimer = 0;
    }
  }

  var rate = this.attacksPerSecond();
  if (!(rate > 0)) return 0;

  if (this.cooldown > 0) this.cooldown -= dt;

  var landed = 0;
  var guard = 0;
  // A `while`, for the same reason every fast tower here uses one: a Mini Blub
  // at 3/s with the swarm buff is a 0.17 s interval against a 0.05 s step at 3x
  // speed, so two attacks really can fall in one frame.
  while (this.cooldown <= 0 && !this.isDestroyed() && guard < 16) {
    guard++;
    var target = this.findTarget(enemies);
    if (!target) {
      // Nothing to shoot: HOLD at zero rather than banking time. A blub that
      // waited a minute must not empty its whole magazine into the first thing
      // that walks in -- and here that would be its entire life.
      this.cooldown = 0;
      break;
    }
    landed += this.resolveAttack(target, enemies);
    this.cooldown += 1 / rate;
  }

  // The last charge is gone. The detonation belongs to the death, so it is
  // resolved here, once, before the main loop sweeps the body out.
  if (this.currentHp <= 0 && this.deathBlast && !this.blasted) {
    this.detonate(enemies);
  }

  return landed;
};

// The panel the brief asks a left click to open: what this unit is, what it has
// left, and every number that decides what it does. It carries no actions, so
// the shared layout gives it stat rows and the Sell button -- which pays $0 and
// simply destroys it.
Blub.prototype.statLines = function () {
  var rows = [
    ["Unit", this.name],
    ["Ammo", Math.max(0, Math.round(this.currentHp)) + " / " + Math.round(this.maxHp)],
    ["Damage", TowerStats.number(this.attackDamage())],
    ["Attack speed", TowerStats.rate(this.attacksPerSecond())],
    ["Range", this.rangeUl === Infinity ? "global" : TowerStats.distance(this.rangeUl)],
    ["Footprint", TowerStats.distance(this.footprintRadiusUl)]
  ];

  if (this.splashGlobal) rows.push(["Area", "global"]);
  else if (this.splashUl > 0) rows.push(["Area", TowerStats.distance(this.splashUl)]);

  var swarm = this.owner.swarmBonusFor(this);
  if (swarm > 0) rows.push(["Swarm", "+" + Math.round(swarm * 100) + "%"]);
  if (this.growth > 0) {
    rows.push(["Fed", "+" + Math.round((Math.pow(1 + this.growth, this.attacksMade) - 1)
      * 100) + "%"]);
  }
  if (this.laser) {
    rows.push(["Lance in", String(this.laser.every -
      (this.attacksMade % this.laser.every)) + " shots"]);
  }
  if (this.deathBlast) {
    rows.push(["On death", this.deathBlast.damage + " in " +
      TowerStats.distance(this.deathBlast.radiusUl)]);
  }
  if (this.jump) rows.push(["Leap", "every " + this.jump.every + " s"]);
  if (this.stunImmune) rows.push(["Stun", "immune"]);
  if (this.enemyTargetable) rows.push(["Targeted", "yes"]);

  rows.push(["DPS", TowerStats.dpsText(this.attackDamage() * this.attacksPerSecond())]);
  return rows;
};

// No upgrades and no abilities: a blub is a readout, not a build. The shared
// layout still gives it a Sell button, which is the destroy control the brief
// asks for.
Blub.prototype.panelActions = function () { return []; };

Blub.prototype.tint = function () {
  if (this.monsterTier >= 3) return { r: 236, g: 118, b: 96 };
  if (this.monsterTier >= 0) return { r: 214, g: 158, b: 92 };
  var unit = BlubTower.unitById(this.unitId);
  if (unit && unit.family === "B") return { r: 124, g: 176, b: 232 };
  return { r: 138, g: 214, b: 126 };
};

Blub.prototype.draw = function (ctx) {
  var rgb = this.tint();
  var base = "rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")";
  var r = this.footprintPx;

  if (this.showRange && this.rangePx !== Infinity) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.rangePx, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.05)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.4)";
    ctx.stroke();
  }

  if (this.tracer) {
    var fade = 1 - this.tracer.age / 0.12;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.tracer.x, this.tracer.y);
    ctx.lineWidth = this.tracer.kind === "laser" ? ul(this.laser.widthUl) : 2;
    ctx.strokeStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," +
      (fade * 0.7).toFixed(3) + ")";
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // The body. Path A's units are blobs, path B's are plated; the leap squashes
  // whichever it is.
  var squash = this.jumpAnim > 0 ? 1.25 : 1;
  var unit = BlubTower.unitById(this.unitId);
  var machine = unit && unit.family === "B";

  ctx.beginPath();
  if (machine) {
    var h = r * 0.82 / squash;
    ctx.rect(this.x - r * 0.82, this.y - h, r * 1.64, h * 2);
  } else {
    ctx.ellipse(this.x, this.y, r * 0.9 * squash, r * 0.78 / squash, 0, 0, Math.PI * 2);
  }
  ctx.fillStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.75)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(20,26,22,0.9)";
  ctx.stroke();

  // One eye, looking at whatever it last shot. It is the cheapest possible
  // signal that this thing is alive and pointed somewhere.
  var ex = this.x + Math.cos(this.aim) * r * 0.3;
  var ey = this.y + Math.sin(this.aim) * r * 0.3;
  ctx.beginPath();
  ctx.arc(ex, ey, Math.max(2, r * 0.2), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(16,20,18,0.95)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ex, ey, Math.max(1, r * 0.09), 0, Math.PI * 2);
  ctx.fillStyle = base;
  ctx.fill();
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { BlubTower: BlubTower, Blub: Blub };
}
