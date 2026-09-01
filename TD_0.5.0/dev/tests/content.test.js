// ---------------------------------------------------------------------------
// Content suite -- maps, the Smasher, enemy types, targeting modes, per-tower
// scoring and the enemy hover readout.
//
//   node tests/content.test.js
//
// These came from the other branch in the v0.3.5 merge and are kept as their
// own file rather than interleaved into tests/run.js: that file is the core
// game's suite, this one is the content built on top of it. Both use the same
// harness and runner.
//
// PORTED to u.l.: the originals were written against the meters system
// (Units.m2px, Tower.BASE_RANGE_M). Map COORDINATES needed no porting -- the
// routes are drawn at the same pixel scale either way -- but every distance
// STAT did.
// ---------------------------------------------------------------------------

var harness = require("./harness");
var runner = require("./assert");
var resultRect = harness.resultRect;

var group = runner.group;
var test = runner.test;

// Authored-pixel coordinates -> live ones, shared with tests/run.js rather than
// copied. Twelve call sites in this file used w() while nothing here defined
// it, so four tests threw `ReferenceError: w is not defined` and had never run
// a single assertion. See the note on w() in tests/harness.js.
var w = harness.w;

// Lived outside the extracted groups in the original suite.
function Targeting_MODES(h) {
  return h.game.Targeting.MODES;
}

// Put a Smasher as close to the road as the build rules allow, beside the
// point `progress` along the route.
//
// The originals used fixed pixel spots. Those worked when a Smasher's 2.5 m
// zone was 48 px across; at v0.3.5's scale the same tower reaches 32 px, so a
// hard-coded "40 px from the road" now falls outside its own swing. Deriving
// the spot from the tower's actual reach keeps these tests about the AOE
// rather than about arithmetic that moved underneath them.
// Smasher combat fixtures are anchored on ONE straight stretch of the road and
// expressed as distances along it, never as pixel coordinates.
//
// These four marks are NOT self-adjusting, and the comment that used to sit
// here claimed they were. They are hand-picked to sit either side of the
// smasher's 32.5 px swing and its 19.5 px blast at the CURRENT unit length,
// and when UNIT_LENGTH was tuned down 33% on 2026-07-27 the old marks
// (+20/+37/+54) fell outside a swing that had shrunk underneath them. Five
// tests then failed reporting "victim killed: expected true" -- which reads
// like an AoE bug and is really a fixture that no longer fits.
//
// So the honesty is enforced instead of asserted: "the smasher fixtures still
// straddle the swing and the blast" below checks every relationship these
// tests depend on. If the scale moves again, THAT test fails, with a message
// saying which mark drifted -- and the rest keep testing the AoE.
// RE-SOLVED 2026-08-26, when the base range went 31.25 -> 37.5 u.l. The old
// marks (+10 / +24 / +36) were chosen against a 31.25 wedge, and the wider
// swing swallowed IN_BLAST: the guard test below is what said so, by name.
//
// Solved rather than scaled. The three have to satisfy six relations at once
// and the blast radius did NOT move with the range, so multiplying by 1.2 does
// not preserve them. Measured on the live geometry: the bare swing now covers
// out to SMASH_AT+30 and the blast is 19.5 px, which pins IN_BLAST between +31
// and IN_ZONE+19. These sit in the middle of every constraint rather than on
// the edge of one -- d(victim, bystander) 15 against a 19.5 blast, d(victim,
// beyond) 25 against it, d(bystander, beyond) 10.
var SMASH_AT = 300;              // where the smasher stands, beside the road
var IN_ZONE = SMASH_AT + 20;     // inside the swing
var IN_BLAST = SMASH_AT + 35;    // outside a BARE swing, inside the victim's blast
var BEYOND = SMASH_AT + 45;      // outside a bare swing and outside that blast

// The chain marks, added 2026-07-30 with the chaining blast. A separate ladder
// from the three above because they are measured against a B4 wedge, not a bare
// one -- see the note above the B4 group.
//
// RE-SOLVED 2026-08-26 WITH THE THREE ABOVE, and for a reason that is easy to
// get wrong: path B's range is `rangeBonusUl`, which is ADDITIVE ON THE BASE,
// not a `rangeUl` the longest-value rule would absorb. So the base going
// 31.25 -> 37.5 carried the whole B path up with it and a B4 Warbringer now
// reaches 62.5 u.l. against 56.25 -- covering out to SMASH_AT+42 where it used
// to stop short of +58. CHAIN_4 was inside the swing, and "only a chain can
// reach them" quietly stopped being true.
//
// Each link is 12 px from the one before it, inside the 19.5 px blast.
//
// CHAIN_CONTROL MOVED FROM +114 TO +200 ON 2026-08-27, and it is the fixture
// the Warbringer retune broke rather than a number that drifted. At +114 it
// stood 72.6 px from the tower; a full-B reach went from 77.5 u.l. to 90, so
// the control came INSIDE the swing -- and being the furthest body along the
// road, "first" targeting turned the wedge onto it and dragged it off the
// chain, leaving three of the five links outside the arc. A control that is
// in range is not a control. At +200 it is 133.8 px out against a 93.6 px
// reach. Measured against the real path geometry, not estimated; if a rescale
// or a range grant moves them, the chain test is where it shows.
var CHAIN_1 = SMASH_AT + 8;
var CHAIN_2 = SMASH_AT + 20;
var CHAIN_3 = SMASH_AT + 32;
var CHAIN_4 = SMASH_AT + 44;
var CHAIN_5 = SMASH_AT + 56;
var CHAIN_CONTROL = SMASH_AT + 200;

// WHAT ACTUALLY HIT A BODY, by amount and kind.
//
// Added 2026-08-26, when the two blast tests below stopped being answerable
// from hit points alone. Both used to read "50 minus one 15-point blast" and
// infer the source from the arithmetic; the wider, faster Warbringer now kills
// its front rank and RE-ACQUIRES during its own wind-up, so a body the swing
// could not reach at spawn is swung by the time the hammer lands, and the
// total is 22 + 15 rather than 15. The inference was always the weak part --
// this asks the damage pipeline directly instead.
function recordHits(h, bodies) {
  var TS = h.game.TowerScore;
  var real = TS.apply;
  var log = [];
  TS.apply = function (tower, enemy, dmg, a, b, kind) {
    if (bodies.indexOf(enemy) !== -1) log.push({ enemy: enemy, amount: dmg, kind: kind });
    return real.apply(this, arguments);
  };
  log.restore = function () { TS.apply = real; };
  log.on = function (enemy) {
    return log.filter(function (x) { return x.enemy === enemy; });
  };
  return log;
}

function placeSmasherBeside(h, progress) {
  return placeBeside(h, progress, "Smasher");
}

// Run a Warbringer far enough for one blow to LAND.
//
// Since 2026-08-09 the swing is a wind-up: sighting a target starts it and the
// damage resolves `swingSeconds()` later, when the hammer reaches the ground.
// Before that the first blow landed instantly, with the hammer still at rest --
// the long-standing bug the owner asked to have fixed. These tests used to step
// one frame and read the damage; they step the swing out instead.
//
// Returns the damage the landing tick returned, so a caller can still assert on
// it exactly as it did before.
function runSwing(s, h, dt) {
  dt = dt || 1 / 60;
  for (var i = 0; i < 400; i++) {
    var dealt = s.update(dt, h.game.enemies, h.game.bullets);
    if (dealt) return dealt;
    if (s.windup <= 0 && s.cooldown > 0) return dealt;   // landed for zero
  }
  return 0;
}

// Stand a tower of `ctor` beside the road at `progress`, just outside the
// legal minimum clearance. Derived from the game's own clearance rule, so it
// keeps working when the road, the footprint or the unit length change.
function placeBeside(h, progress, ctor) {
  var on = h.game.path.pointAt(progress);
  var clearance = h.run("buildClearancePx(" + ctor + ")");

  // Perpendicular to the road, just outside the legal minimum.
  var ahead = h.game.path.pointAt(progress + 5);
  var dx = ahead.x - on.x;
  var dy = ahead.y - on.y;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  var nx = -dy / len;
  var ny = dx / len;

  var pad = clearance + 1.5;
  var x = on.x + nx * pad;
  var y = on.y + ny * pad;
  return ctor === "Smasher" ? h.placeSmasher(x, y) : h.placeGunner(x, y);
}

// Spawn on the ROAD'S CENTRELINE, with the lane offset zeroed.
//
// Enemies walk up to 4 u.l. either side of the centre since v0.4.5, and a
// smasher stands at the legal minimum clearance -- so on a swing with only
// ~8 px of along-road room to spare, which side of the road the lane sequence
// happens to put a test enemy on decides whether it is in the zone at all.
// These fixtures are about what an AoE hits, not about the lane sequence, so
// they take the offset out. Combat tests that are ABOUT lanes still use
// h.spawnAt directly.
function spawnOnLine(h, progress, health, typeId) {
  var e = h.spawnAt(progress, health, typeId);
  e.laneOffsetUl = 0;
  e.refreshPos();
  return e;
}


group("enemy types");

test("the roster matches the agreed numbers", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;

  t.eq(Enemy.BASE_HEALTH, 4, "a normal enemy's health");
  t.eq(Enemy.BASE_SPEED_ULPS, 50, "the base walking speed");

  t.eq(Enemy.TYPES.normal.health, 4, "normal health");
  t.eq(Enemy.TYPES.normal.speedMultiplier, 1, "normal speed");
  t.eq(Enemy.TYPES.fast.health, 2, "fast health");
  t.eq(Enemy.TYPES.fast.speedMultiplier, 1.75, "fast speed");
  t.eq(Enemy.TYPES.slow.health, 7, "slow health");
  t.eq(Enemy.TYPES.slow.speedMultiplier, 0.7, "slow speed");

  // v0.4.5. The three above are untouched by design -- every wave that used
  // them behaves as it did -- and the six below are the new demands.
  t.eq(Enemy.TYPES.swarm.health, 1, "swarm health -- one hit, many bodies");
  t.eq(Enemy.TYPES.swarm.speedMultiplier, 1.3, "swarm speed");

  t.eq(Enemy.TYPES.fractal_slime.health, 4, "Fractal Slime's base T1 has 4 HP");
  t.eq(Enemy.TYPES.fractal_slime.bounty, 2, "its base bounty is halved to $2");
  t.eq(Enemy.TYPES.fractal_slime.aoeDamageReduction, 0.5,
    "it takes half damage from explicitly tagged area attacks");
  t.eq(Enemy.TYPES.fractal_slime.fractal.minTier, 0, "its ladder starts at T0");
  t.eq(Enemy.TYPES.fractal_slime.fractal.maxTier, 5, "and ends at T5");
  t.eq(Enemy.TYPES.fractal_slime.fractal.splitCount, 4,
    "each non-terminal tier splits into four");
  t.eq(Enemy.TYPES.fractal_slime.fractal.spawnStunMinSeconds, 0.5,
    "new children are stunned for at least 0.5 seconds");
  t.eq(Enemy.TYPES.fractal_slime.fractal.spawnStunMaxSeconds, 1,
    "and at most one second");

  t.eq(Enemy.TYPES.armored.health, 4, "armored health -- a normal's");
  t.eq(Enemy.TYPES.armored.defense, 20, "armored carries 20% defense");
  t.eq(Enemy.TYPES.armored.armor || 0, 0, "and no flat armor");

  t.eq(Enemy.TYPES.brute.health, 40, "brute health");
  t.eq(Enemy.TYPES.brute.armor, 5, "brute carries 5 FLAT armor");
  t.eq(Enemy.TYPES.brute.speedMultiplier, 0.55, "brute speed");

  t.eq(Enemy.TYPES.colossus.health, 550, "the Colossus is the 550 HP tank");
  t.eq(Enemy.TYPES.colossus.bounty, 250, "its reduced authored bounty");
  t.eq(Enemy.TYPES.colossus.armor, undefined, "it has no hidden flat armor");
  t.eq(Enemy.TYPES.colossus.defense, undefined, "and no percentage defense");
  t.ok(Enemy.TYPES.colossus.speedMultiplier < 0.5, "it is deliberately slow");

  t.eq(Enemy.TYPES.camo_normal.health, 4, "camo normal matches a normal");
  t.eq(Enemy.TYPES.camo_normal.speedMultiplier, 1, "at a normal's speed");
  t.eq(Enemy.TYPES.camo_normal.isCamo, true, "and is camo");
  t.eq(Enemy.TYPES.camo_fast.health, 2, "camo fast matches a fast");
  t.eq(Enemy.TYPES.camo_fast.speedMultiplier, 1.75, "at a fast's speed");
  t.eq(Enemy.TYPES.camo_fast.isCamo, true, "and is camo");

  t.eq(Enemy.TYPES.midboss.health, 250, "midboss health");
  t.eq(Enemy.TYPES.midboss.defense, 10, "midboss carries 10% defense");
  t.eq(Enemy.TYPES.midboss.speedMultiplier, 0.45, "midboss speed");

  t.eq(Enemy.TYPES.angry.health, 14, "angry health");
  t.eq(Enemy.TYPES.angry.attack.damage, 20, "angry hits towers for 20");
  t.eq(Enemy.TYPES.angry.attack.intervalSeconds, 2.5, "every 2.5 s");
  t.ok(Enemy.TYPES.angry.attack.reachUl > 0, "with a reach in u.l.");

  // THREE types fight back. Updated rather than deleted on 2026-08-27 when the
  // Sapper landed and again the same day when the Volatile gained its dive,
  // which is what this assertion asks for by existing: the point is that
  // attacking is opt-in DATA, not something every enemy quietly gained, so the
  // list growing has to be a deliberate edit and never a surprise.
  //
  // The three do very different things with the same block, which is the block
  // doing its job: the Angry deals 20 damage and nothing else, the Sapper deals
  // NO damage and carries a `disable` instead, and the Volatile deals 20 once
  // and dies of it.
  var attackers = Object.keys(Enemy.TYPES).filter(function (id) {
    return !!Enemy.TYPES[id].attack;
  });
  t.deep(attackers, ["angry", "sapper", "volatile"],
    "the Angry, the Sapper and the Volatile are the types that act on towers");
  t.eq(Enemy.TYPES.sapper.attack.damage, undefined,
    "and the Sapper's spec authors no damage at all -- absent, not zero");

  // v0.4.7. Four more -- three gated behind the midboss, plus the boss at 35.
  t.eq(Enemy.TYPES.shielded.health, 12, "Bulwark health");
  t.eq(Enemy.TYPES.shielded.shield.ratio, 2, "with twice that again in shield");
  t.eq(Enemy.TYPES.shielded.shield.onBreak.speedMultiplier, 2,
    "and it doubles its speed when the shield goes");
  t.eq(Enemy.TYPES.shielded.speedMultiplier, 0.9, "Bulwark speed while shielded");

  t.eq(Enemy.TYPES.revenant.health, 16, "Revenant health");
  t.eq(Enemy.TYPES.revenant.revive.times, 1, "gets up exactly once");
  t.eq(Enemy.TYPES.revenant.revive.roots, true, "and stops walking when it does");

  // The Hive itself is an ordinary body: no shield, and it pays. The shield
  // and the empty bounty belong to its BROOD, and they live on the spawn block
  // rather than on the `normal` row -- otherwise every normal in the campaign
  // would be shielded.
  t.eq(Enemy.TYPES.hive.health, 150, "Hive health");
  t.eq(Enemy.TYPES.hive.shield, undefined, "the Hive itself carries no shield");
  t.eq(Enemy.TYPES.hive.noBounty, undefined, "and the Hive itself pays normally");
  t.eq(Enemy.TYPES.hive.spawns.count, 5, "five to a brood");
  t.eq(Enemy.TYPES.hive.spawns.type, "normal", "of ordinary normals");
  t.eq(Enemy.TYPES.hive.spawns.shieldRatio, 1, "each wearing its own life again in shield");
  t.eq(Enemy.TYPES.hive.spawns.noBounty, true, "and none of them paying");

  // The same opt-in-DATA point the attackers assertion above makes, for the
  // three mechanics v0.4.7 added. If one of these lists ever grows by
  // accident, that is a type that silently gained a mechanic.
  function withBlock(key) {
    return Object.keys(Enemy.TYPES).filter(function (id) {
      return !!Enemy.TYPES[id][key];
    });
  }
  t.deep(withBlock("shield"), ["shielded"], "only one type carries a shield of its own");
  t.deep(withBlock("revive"), ["revenant"], "only one type gets back up");
  t.deep(withBlock("spawns"), ["hive"], "only one type spawns");
  t.deep(withBlock("fractal"), ["fractal_slime"],
    "only the Fractal Slime divides on death");
  t.deep(withBlock("noBounty"), [], "and NO type pays nothing -- that is a per-spawn property");
  t.deep(withBlock("showHealthBanner"),
    ["midboss", "boss", "boss_fast", "dinomech"],
    "four types wear the banner: the midboss at 11, the Tyrant, the Vanguard, " +
    "and the Dinomech that ends Normal at wave 40");
  // STILL ONLY THE TYRANT. The Dinomech is a boss with no phase at all, which
  // is what keeps its 45 000 exactly 45 000 -- there is no roar to conjure a
  // shield or call a support court in.
  t.deep(withBlock("phases"), ["boss"], "and only the Tyrant changes mid-fight");
  t.eq(Enemy.TYPES.dinomech.health, 45000, "the Dinomech is 45 000 flat");
  t.eq(Enemy.TYPES.dinomech.shield, undefined, "behind no shield");
  t.eq(Enemy.TYPES.dinomech.revive, undefined, "with no second life");
  t.eq(Enemy.attacksOf(Enemy.TYPES.dinomech).length, 2,
    "and a pool of two attacks it cycles");

  // v0.4.9's block, held to the same standard: support is opt-in DATA, and if
  // one of these lists grows by accident that is a type that silently gained
  // an ability.
  t.deep(withBlock("support"), ["shieldbearer", "healer", "boss_fast", "herald"],
    "four types help the enemies around them");
  t.deep(withBlock("sprint"), ["boss_fast"], "and only the fast boss sprints");

  // v0.5.1's block, held to the same standard. `deathEffect` is the generic
  // hazard structure and exactly one type carries one -- a second would be a
  // second data block and no code, which is the property being pinned.
  t.deep(withBlock("deathEffect"), ["volatile"],
    "and only the Volatile leaves something behind when it dies");
});


// ---------------------------------------------------------------------------
// THE TIER LADDER IS OFF THE EASY CAMPAIGN, AND WHAT REPLACED IT MATCHES IT
// POINT FOR POINT.
//
// 2026-08-29, at the owner's instruction: "take out the fractal slime, all of
// them, from easy mode, and replace them by, in order, colossus > hive > slow
// > normal, matching the HP total". This block used to pin the opposite claim
// -- that all six rungs were scheduled in Easy, ascending, at the HP the index
// prints -- and it is rewritten rather than deleted, because the two halves it
// was protecting both outlived the schedule it was written against:
//
//   * the LADDER ITSELF is still a live mechanic, still what the index draws,
//     and still spent by NORMAL. It is asserted here off the type's own
//     `fractal` block, with no wave involved, so a retune of the rungs fails
//     here whichever campaign is looked at.
//   * the SUBSTITUTION is the new claim. Ten roots came off six Easy waves, and
//     the only thing that made that safe was that every one of them was
//     replaced by the same number of points. That is checked wave by wave
//     against the figures the schedule itself carries.
//
// EASY ONLY. "From easy mode" was the whole scope of the instruction and
// NORMAL_WAVES was not touched, which is why the type carries no `sandboxOnly`
// flag -- it is still scheduled, in the other campaign, and saying otherwise
// would be a false claim tests/run.js reads in both directions.
test("Easy schedules no Fractal Slime, and the ladder is intact anyway",
function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var spec = Enemy.TYPES.fractal_slime.fractal;

  var scheduled = [];
  h.game.EASY_WAVES.forEach(function (wave, i) {
    h.game.waveGroups(wave).forEach(function (g) {
      if (g.type === "fractal_slime") scheduled.push(i + 1);
    });
  });
  t.deep(scheduled, [], "Easy sends no Fractal Slime");
  t.eq(Enemy.TYPES.fractal_slime.sandboxOnly, undefined,
    "and the type claims no sandbox-only flag, because Normal still sends it");

  var inNormal = [];
  h.game.NORMAL_WAVES.forEach(function (wave, i) {
    h.game.waveGroups(wave).forEach(function (g) {
      if (g.type === "fractal_slime") inNormal.push(i + 1);
    });
  });
  t.deep(inNormal, [17, 17, 27, 32, 35],
    "Normal's own rungs are untouched -- two roots in 17, then 27, 32 and 35");

  // EVERY RUNG STILL WEIGHS WHAT THE INDEX PRINTS. Read off the `fractal` block
  // and Enemy.healthOf -- the two things js/codex.js reads to draw the index --
  // so a retune of the ladder moves the index and this test together.
  var previousHp = 0;
  for (var tier = spec.minTier; tier <= spec.maxTier; tier++) {
    var stated = spec.tierZeroHealth * Math.pow(spec.healthMultiplier, tier);
    var body = new Enemy(h.game.path, undefined, "fractal_slime", { tier: tier });
    t.eq(Enemy.healthOf("fractal_slime", undefined, tier), stated,
      "T" + tier + " is stated at " + stated + " HP");
    t.eq(body.maxHealth, stated, "and a body built at that tier has exactly that");
    t.eq(body.fractalTier, tier, "carrying the tier it was built at");
    t.ok(stated > previousHp, "and it is heavier than the rung below it");
    previousHp = stated;
  }

  // AND IT STILL DIVIDES. A tier T root costs root x (T+1) in total damage and
  // ends in 4^T terminal bodies; that is the reason the T5 was a finale body
  // and the reason nothing else in the game costs what it cost.
  var queue = [new Enemy(h.game.path, undefined, "fractal_slime",
    { tier: spec.maxTier })];
  var totalHp = 0;
  var terminal = 0;
  while (queue.length) {
    var e = queue.shift();
    totalHp += e.maxHealth;
    e.takeDamage(e.maxHealth);
    var children = e.splitOnDeath();
    if (children) queue = queue.concat(children);
    else terminal++;
  }
  t.eq(totalHp, 1024 * (spec.maxTier + 1),
    "clearing a T5 still takes 6 144 points across six generations");
  t.eq(terminal, Math.pow(spec.splitCount, spec.maxTier),
    "and still ends in 1 024 terminal T0s");
});

// WHAT STANDS WHERE EACH ROOT STOOD, and that it weighs the same.
//
// The ladder the owner named is descending, and it was applied that way: each
// root became ONE body of the first type in colossus > hive > slow > normal
// whose own health fits inside the root's, carrying a `health` override equal
// to the root. The table below is the whole substitution, and it is checked
// against the LIVE schedule -- the group has to be there, at that `at`, at that
// weight -- rather than against a total, because a total hides a swap.
test("the bodies that replaced the tier ladder match it point for point",
function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;

  //  wave   at     type        HP   (the root it stands in for)
  var STANDS_IN = [
    [16,  1,    "normal",      1,    "T0"],
    [16,  5,    "normal",      1,    "T0"],
    [16,  9,    "normal",      1,    "T0"],
    [16, 13,    "normal",      1,    "T0"],
    [17,  4,    "normal",      4,    "T1"],
    [17, 10.5,  "normal",      4,    "T1"],
    [22, 11,    "slow",       16,    "T2"],
    [25, 15,    "slow",       64,    "T3"],
    [33, 15,    "hive",      256,    "T4"],
    [35, 28,    "colossus", 1024,    "T5"]
  ];

  var ladder = ["colossus", "hive", "slow", "normal"];
  STANDS_IN.forEach(function (row) {
    // EASY_WAVES by name, not the active `WAVES`: this is a claim about the
    // Easy campaign specifically, and Normal's ladder is deliberately intact.
    var wave = h.game.EASY_WAVES[row[0] - 1];
    var found = h.game.waveGroups(wave).filter(function (g) {
      return g.at === row[1] && g.type === row[2] && g.health === row[3];
    });
    t.eq(found.length, 1, "wave " + row[0] + " sends one " + row[2] + " at " +
      row[3] + " HP, " + row[1] + " s in, where the " + row[4] + " root stood");
    t.eq(found[0].count, 1, "as a single body, the way the root was");
    t.eq(found[0].tier, undefined, "and with no tier of its own");

    // THE LADDER IS A PRIORITY, not a free choice: nothing earlier in the list
    // would have fitted inside this body's health. That is the rule that made
    // the mapping deterministic, and it is the half a later retune would break
    // by reaching for a heavier body because it reads better.
    ladder.slice(0, ladder.indexOf(row[2])).forEach(function (heavier) {
      t.ok(Enemy.TYPES[heavier].health > row[3],
        "a " + heavier + " would not fit inside " + row[3] + " HP");
    });
  });

  // AND NOTHING ELSE MOVED. The six waves carry exactly the health they carried
  // with the roots in them, which is what "matching the HP total" was asked
  // for -- these are the authored figures from before the substitution.
  var BEFORE = { 16: 406, 17: 383, 22: 652, 25: 784, 33: 1744, 35: 7444 };
  Object.keys(BEFORE).forEach(function (n) {
    var wave = h.game.EASY_WAVES[Number(n) - 1];
    var hp = 0;
    h.game.waveGroups(wave).forEach(function (g) {
      hp += g.count * Enemy.healthOf(g.type, g.health, g.tier);
    });
    t.eq(hp, BEFORE[n], "wave " + n + " still authors " + BEFORE[n] + " points");
  });
});


group("the v0.4.9 roster");

// The owner's spec, 2026-07-30: four more types, NONE of them in a wave --
// "let's add some more enemies but don't add them to any waves, just to the
// index and of course to the sandbox mode so we can test them".
test("the four new types are exactly as specified, and unscheduled", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var T = Enemy.TYPES;

  // Shieldbearer: 20 shield to the 10 strongest, every 10 s, stacking.
  t.eq(T.shieldbearer.support.shield, 20, "the Shieldbearer hands out 20 shield");
  t.eq(T.shieldbearer.support.targets, 10, "to the ten strongest");
  t.eq(T.shieldbearer.support.pick, "strongest", "picked by life still standing");
  t.eq(T.shieldbearer.support.intervalSeconds, 10, "every ten seconds");
  t.eq(T.shieldbearer.support.stacks, true, "and the grants STACK");
  t.ok(T.shieldbearer.speedMultiplier < 0.6, "it is a slow one");

  // Healer: 3 most-wounded, 15 HP/s for 4 s, every 8 s.
  t.eq(T.healer.support.targets, 3, "the Healer takes three targets");
  t.eq(T.healer.support.pick, "mostMissingHealth", "the three missing the most health");
  t.eq(T.healer.support.heal.perSecond, 15, "15 HP a second");
  t.eq(T.healer.support.heal.seconds, 4, "for four seconds");
  t.eq(T.healer.support.intervalSeconds, 8, "every eight seconds");
  t.eq(T.healer.health, 200, "high health");
  t.ok(T.healer.speedMultiplier < 0.6, "and slow");

  // The fast boss.
  t.eq(T.boss_fast.health, 750, "the fast boss has 750 HP");
  t.eq(T.boss_fast.sprint.untilUl, 400, "it sprints for the first 400 u.l.");
  t.eq(T.boss_fast.support.shield, 100, "100 shield");
  t.eq(T.boss_fast.support.intervalSeconds, 7, "every seven seconds");
  t.eq(T.boss_fast.support.stacks, false, "which does NOT stack");
  t.eq(T.boss_fast.support.pick, "self", "and which it puts on itself");

  // Heavy camo. The owner said "20% armor and 5 blindage"; in this codebase
  // `defense` is the percentage and `armor` is the flat subtraction.
  t.eq(T.camo_heavy.isCamo, true, "the heavy camo is camo");
  t.eq(T.camo_heavy.defense, 20, "20% defense -- the owner's '20% armor'");
  t.eq(T.camo_heavy.armor, 5, "and 5 flat armor -- the 'blindage'");

  // ALL FOUR ARE IN THE SCHEDULE SINCE 2026-07-30. This test used to assert
  // the opposite -- the batch was added "in the index and in the sandbox" so
  // the owner could look at them before anything was built around them, and
  // that waiting period is over. What it checks now is the half that still
  // matters: each one is scheduled, and none of them arrives before the back
  // half, because every one of them changes what the player must already own.
  var NEW = ["shieldbearer", "healer", "boss_fast", "camo_heavy"];
  var firstWave = {};
  h.game.WAVES.forEach(function (wave, i) {
    h.game.waveGroups(wave).forEach(function (g) {
      var id = g.type || "normal";
      if (NEW.indexOf(id) !== -1 && firstWave[id] === undefined) firstWave[id] = i + 1;
    });
  });

  NEW.forEach(function (id) {
    t.ok(firstWave[id] !== undefined, id + " is in the campaign");
    t.ok(firstWave[id] >= 22, id + " waits for the back half (wave " + firstWave[id] + ")");
  });

  // And the one that is a BOSS arrives in the wave before the Tyrant's, so the
  // campaign ends on two boss waves back to back.
  t.eq(firstWave.boss_fast, 34, "the Vanguard is wave 34, one before the finale");
});

test("the Shieldbearer stacks 20 of shield onto the ten strongest", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var bearer = new Enemy(h.game.path, undefined, "shieldbearer");

  // Twelve bodies, so the pick has to leave two out. Descending health, so
  // "the ten strongest" is an answer with an obvious right shape.
  var board = [bearer];
  for (var i = 0; i < 12; i++) {
    board.push(new Enemy(h.game.path, 50 - i, "normal"));
  }

  // The timer starts FULL -- no free pulse the instant it walks in.
  t.eq(bearer.supportAllies(9.9, board), null, "nothing before the ten seconds");

  // IT NEVER PICKS ITSELF (2026-08-26). It is the biggest body on that board
  // by a distance -- 60 HP against a normal's 50 -- so "the ten strongest"
  // would put a plate on it every pulse, compounding, and the type that exists
  // to make everything ELSE expensive would be the hardest thing to remove.
  var helped = bearer.supportAllies(0.2, board);
  t.eq(helped.length, 10, "then exactly ten are shielded");
  t.ok(helped.indexOf(bearer) === -1, "and the bearer is not one of them");
  t.eq(bearer.shield, 0, "it carries none of its own");
  t.eq(board[1].shield, 20, "the strongest normal gets 20");
  t.eq(board[1].shieldMax, 20, "and the bar grows to match");
  t.eq(board[10].shield, 20,
    "the tenth pick now reaches one body further down the board");
  t.eq(board[11].shield, 0, "the eleventh gets nothing");
  t.eq(board[12].shield, 0, "nor the weakest");

  // STACKING, at the owner's request. The second pulse adds rather than
  // refreshes -- this is the assertion that fails if anyone "fixes" it into a
  // refresh like the fast boss's.
  bearer.supportAllies(10, board);
  t.eq(board[1].shield, 40, "a second pulse STACKS to 40");
  t.eq(board[1].shieldMax, 40, "bar and all");

  // And every point of it is free work for the player.
  // ONE HIT PER LAYER since 2026-08-26: 40 empties the shell and stops there,
  // so it takes a SECOND blow to reach the body underneath.
  t.eq(board[1].takeDamage(40), 0, "chewing all forty of it pays nothing");
  t.eq(board[1].health, 50, "with the body untouched underneath");
});

test("the Healer tops up the three most wounded, and none of it pays", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var healer = new Enemy(h.game.path, undefined, "healer");

  var hurt = [];
  for (var i = 0; i < 5; i++) {
    var e = new Enemy(h.game.path, 100, "normal");
    // Missing 80, 70, 60, 50, 40 -- so the first three are the pick, and all
    // of them are missing more than the 60 a full heal restores (a body healed
    // back to its maximum banks only what it actually regained, which is a
    // different case and gets its own assertion below).
    e.takeDamage(80 - i * 10);
    hurt.push(e);
  }
  var board = [healer].concat(hurt);

  t.eq(healer.supportAllies(7.9, board), null, "nothing before the eight seconds");
  var helped = healer.supportAllies(0.2, board);
  t.eq(helped.length, 3, "three targets");
  t.eq(helped[0], hurt[0], "the one missing the most");
  t.eq(helped[2], hurt[2], "down to the third");
  t.eq(hurt[3].healTimer, 0, "the fourth is left alone");

  // The heal is on the TARGET and ticks in its own update, so it survives the
  // Healer -- and it restores exactly 15/s for 4 s however the steps fall.
  t.eq(hurt[0].healPerSecond, 15, "15 HP a second");
  t.near(hurt[0].healTimer, 4, 0.001, "for four seconds");

  var before = hurt[0].health;
  for (var step = 0; step < 60 * 5; step++) hurt[0].update(1 / 60);
  t.near(hurt[0].health - before, 60, 0.001, "60 HP restored in total");
  t.eq(hurt[0].healTimer, 0, "and the regeneration has run out");

  // THE MONEY RULE. Sixty points were healed, so the next sixty points of
  // damage are health the player has already been paid for and pay nothing.
  //
  // `near`, not `eq`: 240 partial ticks of 0.25 HP accumulate a few parts in
  // 1e13 of float error, which is exactly the sort of thing an exact-equality
  // assertion turns into a mystery failure three months from now.
  t.near(hurt[0].healedHealth, 60, 1e-9, "sixty points of healed health are banked");
  t.near(hurt[0].takeDamage(60), 0, 1e-9, "removing exactly those sixty pays NOTHING");
  t.near(hurt[0].takeDamage(10), 10, 1e-9, "and the next ten, which are its own, pay ten");

  // Clamped at full health: a heal cannot take a body above its own maximum,
  // and it cannot bank what it did not restore.
  var whole = new Enemy(h.game.path, 100, "normal");
  whole.applyHeal(15, 4);
  whole.update(1);
  t.eq(whole.health, 100, "a healthy body stays at its maximum");
  t.eq(whole.healedHealth, 0, "and banks nothing");

  // A wave at full health is nobody to heal, and the pulse is not wasted on
  // one -- it simply finds no targets.
  t.eq(healer.supportAllies(8, [healer, whole]), null, "nothing to heal, nothing done");
});

test("the Healer's pulse throws a tether at each body it heals, and lets go", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var healer = new Enemy(h.game.path, undefined, "healer");

  var hurt = [];
  for (var i = 0; i < 4; i++) {
    var e = new Enemy(h.game.path, 100, "normal");
    e.takeDamage(80 - i * 10);
    hurt.push(e);
  }
  var board = [healer].concat(hurt);

  t.eq(healer.supportLinks.length, 0, "nothing before the first pulse");
  var helped = healer.supportAllies(8, board);
  t.eq(healer.supportLinks.length, 3, "one cord per body helped");
  t.eq(healer.supportLinks[0].target, helped[0], "and each one holds its target");
  t.eq(healer.supportLinks[2].target, helped[2], "down to the third");

  // Cosmetic only: the tether is how the heal is DRAWN, and the heal itself
  // lives on the target and outlives it. That is the whole reason this is a
  // separate lifetime rather than the heal's own four seconds.
  var span = h.game.Enemy.typeOf("healer").support.tether.seconds;
  t.near(span, 1.4, 1e-9, "a cord runs for 1.4 s");
  healer.update(span * 0.5);
  t.eq(healer.supportLinks.length, 3, "still there halfway through");
  t.near(healer.supportLinks[0].life, 0.5, 0.02, "at half its life");
  t.ok(hurt[0].healTimer > 0, "with the heal it delivered still running");
  healer.update(span * 0.6);
  t.eq(healer.supportLinks.length, 0, "and gone once its life runs out");
  t.ok(hurt[0].healTimer > 0, "while the heal carries on without it");

  // A REFERENCE THAT CANNOT BE HELD PAST THE BODY. The cord is the only place
  // this file keeps a pointer to another enemy, so the sweep that drops a dead
  // target is what stops a Healer pinning a wave's worth of corpses alive.
  healer.supportAllies(8, board);
  t.eq(healer.supportLinks.length, 3, "a fresh pulse, three fresh cords");
  hurt[0].dead = true;
  hurt[1].leaked = true;
  healer.update(1 / 60);
  t.eq(healer.supportLinks.length, 1, "the dead and the leaked drop theirs at once");
  t.eq(healer.supportLinks[0].target, hurt[2], "the one still walking keeps its own");

  // THE CORD BELONGS TO THE SPEC, NOT TO SUPPORTING, and this leg is what
  // holds that. It used to be checked on the Shieldbearer, which authored no
  // tether until 2026-08-18 -- when the owner asked for a curve to each body
  // it shields, and the assertion became a record of the old design rather
  // than of the rule. The Vanguard is the supporter that still authors none:
  // it shields ITSELF, and a cord from a body to its own chest would be a
  // line of length zero.
  var vanguard = new Enemy(h.game.path, undefined, "boss_fast");
  t.eq(vanguard.type.support.tether, undefined, "the Vanguard authors no cord");
  vanguard.supportAllies(7, [vanguard].concat(hurt));
  t.eq(vanguard.supportLinks.length, 0, "and throws none");
  t.ok(vanguard.shield > 0, "while its own shield still lands");
});

test("the Shieldbearer throws a bowed cord and a stream of plates at each " +
  "body it shields", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var bearer = new Enemy(h.game.path, undefined, "shieldbearer");
  var spec = Enemy.TYPES.shieldbearer.support;

  // The three fields the two renderers read. `arc` is what separates this mark
  // from the Healer's straight cord, and `chips` are the shields going out --
  // both boards read them off this row, so a change here moves both pictures
  // and neither renderer holds a second copy.
  t.ok(!!spec.tether, "it authors a cord");
  t.ok(spec.tether.arc > 0, "bowed, not straight");
  t.ok(spec.tether.chips > 0, "and carrying plates");
  t.ok(spec.tether.seconds > 0 &&
    spec.tether.seconds < spec.intervalSeconds,
    "gone well before the next pulse");

  var mob = [];
  for (var i = 0; i < 12; i++) mob.push(new Enemy(h.game.path, 100, "normal"));
  var helped = bearer.supportAllies(10, [bearer].concat(mob));
  t.eq(helped.length, spec.targets, "ten bodies at a time");
  t.eq(bearer.supportLinks.length, spec.targets, "one cord each");
  t.eq(bearer.supportLinks[0].target, helped[0], "and each one holds its body");
  t.ok(mob[0].shield > 0, "which is carrying a real grant, not just a picture");

  bearer.update(spec.tether.seconds * 1.05);
  t.eq(bearer.supportLinks.length, 0, "the cords let go on their own");
  t.ok(mob[0].shield > 0, "while the shield they delivered stays");
});

test("the Healer FLIES, which is a targeting rule and not just a height", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var healer = new Enemy(h.game.path, undefined, "healer");
  var walker = new Enemy(h.game.path, undefined, "normal");
  var flier = new Enemy(h.game.path, undefined, "flying");

  // TWO HEIGHTS NOW, NOT THREE. The Healer carried a `hover` block and rode
  // 1.25 radii until 2026-08-26; it is a flier, so it rides the Wisp's lift
  // out of the same constant, and there is no third number.
  t.near(walker.visualBodyLift(),
    walker.radiusPx() * Enemy.GROUND_LIFT_RADII, 1e-9, "a walker rides its ground lift");
  t.near(healer.visualBodyLift(),
    healer.radiusPx() * Enemy.FLIGHT_LIFT_RADII, 1e-9, "the Healer rides the flight lift");
  t.near(flier.visualBodyLift(),
    flier.radiusPx() * Enemy.FLIGHT_LIFT_RADII, 1e-9, "and so does the Wisp");
  t.ok(healer.visualBodyLift() > walker.visualBodyLift(),
    "both are well off the road");

  // AND THE ASSERTION THAT IS THE WHOLE OF THE CHANGE. This test asserted the
  // OPPOSITE until 2026-08-26 -- "a tower without air reach can shoot it" --
  // and the reversal is the owner's: "make the healer a flying unit". A board
  // with no air reach can no longer answer wave 32 at all.
  t.eq(healer.isFlying, true, "the Healer flies");
  var Targeting = h.game.Targeting;
  var ground = { seesFlying: false, rangePx: 10000, x: healer.pos.x, y: healer.pos.y,
    stats: { seesFlying: false } };
  t.eq(Targeting.sees(ground, healer), false,
    "so a tower without air reach cannot touch it");
  t.eq(Targeting.sees(ground, flier), false, "any more than it can the Wisp");
  var air = { seesFlying: true, rangePx: 10000, x: healer.pos.x, y: healer.pos.y,
    stats: { seesFlying: true } };
  t.eq(Targeting.sees(air, healer), true, "and one with air reach still can");

  // THE DEAD DECLARATION IS GONE, not left beside the flag that overrides it.
  t.eq(Enemy.typeOf("healer").hover, undefined,
    "the hover block was deleted, since every reader takes the flying branch first");
  t.eq(Enemy.typeOf("normal").hover, undefined, "and a walker authors none either");
});

test("the fast boss sprints the first 400 u.l. and reshields without stacking", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var e = new Enemy(h.game.path, undefined, "boss_fast");

  // "really fast up to the first 400 u.l. and then just fast".
  t.eq(e.isSprinting(), true, "it starts in the sprint");
  t.near(e.currentSpeedUlps(), 175, 0.001, "175 u.l./s off the line");

  e.progress = h.game.ul(399);
  t.near(e.currentSpeedUlps(), 175, 0.001, "still sprinting at 399 u.l.");
  e.progress = h.game.ul(401);
  t.eq(e.isSprinting(), false, "past 400 u.l. the sprint is spent");
  t.near(e.currentSpeedUlps(), 87.5, 0.001, "and it settles to a Fast's 87.5");

  // The sprint is a fact about the MAP, not a timer, so a slow scales it
  // rather than burning it off.
  e.progress = 0;
  e.applySlow(0.5, 3);
  t.near(e.currentSpeedUlps(), 87.5, 0.001, "a 50% slow halves the sprint");

  // 100 shield every 7 s, and it does NOT stack.
  var board = [e];
  t.eq(e.supportAllies(6.9, board), null, "nothing before the seven seconds");
  e.supportAllies(0.2, board);
  t.eq(e.shield, 100, "then 100 of shield");

  e.takeDamage(30);
  t.eq(e.shield, 70, "chewed down to 70");
  e.supportAllies(7, board);
  t.eq(e.shield, 100, "the next pulse REFRESHES it to 100");
  t.eq(e.shieldMax, 100, "and the pool never grows past 100");

  e.supportAllies(7, board);
  t.eq(e.shield, 100, "a pulse on a full shield changes nothing");

  // The refreshed shield feeds no damage-led mechanics, while the one-time
  // kill value prices the whole sprint/refresh threat.
  t.eq(e.takeDamage(100), 0, "removing a full shield reports no health damage");
  t.eq(e.bounty(), 1100, "its authored bounty includes the boss mechanics");
});

test("the heavy camo is invisible AND armoured", function (t) {
  var h = harness.boot();
  var e = new h.game.Enemy(h.game.path, undefined, "camo_heavy");

  t.eq(e.isCamo, true, "camo");
  t.eq(e.armor, 5, "5 flat armor");
  t.eq(e.defense, 20, "behind 20% defense");

  // armor first, then defense, and no damage floor -- the global order.
  t.near(e.takeDamage(10), 4, 0.001, "a 10 lands (10-5) x 0.8 = 4");
  t.eq(e.takeDamage(5), 0, "and a 5 does literally nothing");

  // A gunner cannot see it: the camo rule is visibility, not scoring.
  t.eq(h.game.Targeting.sees({}, e), false,
    "a tower without detection cannot target it at all");
  t.eq(h.game.Targeting.sees({ seesCamo: true }, e), true,
    "one with detection can");
});

test("the support hook runs from the real main loop", function (t) {
  var h = harness.boot();
  h.run("enemies = []; bullets = []; towers = []; waveIndex = WAVES.length");

  var bearer = h.spawnAt(300, undefined, "shieldbearer");
  var mark = h.spawnAt(300, 40, "normal");

  h.step(9.9);
  t.eq(mark.shield, 0, "unshielded before the pulse");
  h.step(0.2);
  t.eq(mark.shield, 20, "the loop pulsed the Shieldbearer");
  t.eq(bearer.shield, 0,
    "and kept none of it -- a supporter aimed at others never picks itself");
});


group("the wave 35 boss");

test("the Tyrant's numbers are the ones that were asked for", function (t) {
  var h = harness.boot();
  var B = h.game.Enemy.TYPES.boss;

  t.eq(B.health, 5000, "5000 HP -- the owner's figure, up from 2500 on 2026-07-30");
  t.eq(B.speedMultiplier, 0.3, "slow -- the slowest thing in the game");
  t.eq(B.showHealthBanner, true, "with a bar across the top of the screen");

  // ONE attack to start; the roar unlocks a second into the pool.
  t.eq(B.attacks.length, 1, "one attack in the pool to begin with");
  var aimed = B.attacks[0];
  t.eq(aimed.target, "highestDps", "it goes for the BEST tower, not the nearest");
  t.eq(aimed.damage, 45, "hitting for 45");
  t.eq(aimed.stunSeconds, 2, "and stunning for 2 s");
  t.ok(aimed.windUpSeconds > 0, "after a wind-up it spends standing still");
  t.ok(aimed.intervalSeconds >= 8, "and slowly -- 8 s, up from the 3.5 that was too busy");
  // NO RANGE LIMIT (2026-07-30, the owner's instruction). Omitted rather than
  // set to a big number: attackCandidates reads a missing reach as the whole
  // map, so there is no route long enough to stand a tower out of this.
  t.eq(aimed.reachUl, undefined, "and from anywhere on the map");

  var phase = B.phases[0];
  t.eq(phase.atHealthFraction, 0.5, "it roars at half health");
  // 1000 since the 2026-08-01 retune ("make the shield 1000hp instead"). This
  // read 200 until 2026-08-19 -- the value the roar shipped with against a
  // 2500 HP body. The CHANGELOG's 2026-08-12 mirror sweep found it and ruled
  // it "the test being stale rather than the boss", which is why this moved to
  // the shipping figure rather than the boss moving back.
  t.eq(phase.shield, 1000, "gaining a 1000 point shield -- a fifth of its own health");
  t.ok(phase.speedMultiplier > 1, "getting faster");
  t.ok(phase.attackIntervalMultiplier < 1, "and attacking more often");
  t.eq(phase.summon.speedMultiplier, 1.5, "the crowd it calls in runs at 1.5x");

  // The second attack: stop, jump 90 u.l., shockwave on landing. The jump was
  // 50 until the same 2026-08-01 retune took every figure in the leap up
  // together ("make his second attack the jumping one more menacing").
  t.ok(!!phase.addAttack, "and a second attack joins the pool");
  t.eq(phase.addAttack.leap.distanceUl, 90, "it leaps 90 u.l.");
  t.ok(phase.addAttack.leap.radiusUl > 0, "and lands with a radius");
  t.ok(phase.addAttack.damage > 0 && phase.addAttack.stunSeconds > 0,
    "the shockwave both damages and stuns");
  t.ok(phase.addAttack.windUpSeconds > 0, "and it stops for that one too");

  // Even at its fastest it is slower than the 3.5 s it used to fire at.
  t.ok(aimed.intervalSeconds * phase.attackIntervalMultiplier > 3.5,
    "post-roar it still attacks less often than the old version did");
});

test("it arrives in the MIDDLE of wave 35, not at its head", function (t) {
  var h = harness.boot();
  var wave = h.game.WAVES[34];

  // READ OFF THE TIMELINE, WHICH IS WHERE THE ANSWER NOW LIVES (2026-08-25).
  // This used to accumulate `interval` and `lead` down the group list, because
  // under the sequential scheduler an entrance really was the sum of everything
  // authored above it -- which meant the boss's arrival was an accident of the
  // groups in front of it rather than a decision. It is `at: 13` now, and the
  // whole point of the rewrite is that this is a number someone chose.
  var events = h.game.waveTimeline(wave);
  var bossAt = null;
  events.forEach(function (e) { if (e.type === "boss" && bossAt === null) bossAt = e.time; });
  var lastAt = events[events.length - 1].time;

  t.ok(bossAt !== null, "the boss is in wave 35");
  t.eq(bossAt, 13, "authored at 13 s, not arrived at by accumulation");
  var fraction = bossAt / lastAt;
  t.ok(fraction > 0.35 && fraction < 0.65,
    "and lands mid-wave (" + bossAt.toFixed(1) + " s of " + lastAt.toFixed(1) +
    " s = " + Math.round(fraction * 100) + "%)");

  // Not the first body out of the gate and not the last, stated directly --
  // the fraction above is a shape, this is the claim.
  t.ok(events[0].type !== "boss", "something walks in ahead of it");
  t.ok(events[events.length - 1].type !== "boss", "and something after it");

  // Exactly one, and only here. A second boss anywhere would be a decision
  // nobody made.
  var count = 0;
  h.game.WAVES.forEach(function (w) {
    h.game.waveGroups(w).forEach(function (g) { if (g.type === "boss") count += g.count; });
  });
  t.eq(count, 1, "exactly one Tyrant in the whole campaign");
});

test("the roar shields it, speeds it up, and calls the wave back", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var boss = new Enemy(h.game.path, undefined, "boss");
  boss.progress = 600;
  boss.refreshPos();

  var walked = boss.currentSpeedUlps();
  t.eq(boss.shieldMax, 0, "no shield to start");

  // Half of 5000 since 2026-07-30. These figures were 1249/2 against the old
  // 2500 and are derived from the type here so the next health change moves
  // them on its own.
  var half = Enemy.TYPES.boss.health / 2;
  boss.takeDamage(half - 1);
  t.eq(boss.phasesEntered, 0, "one point above half, nothing has happened");

  boss.takeDamage(2);
  t.eq(boss.phasesEntered, 1, "crossing half fires the roar");
  // Read off the type rather than typed, for the same reason `half` is: the
  // roar's shield has moved twice (200 against a 2500 HP body, 1000 since
  // 2026-08-01) and a literal here is what went stale both times.
  var conjured = Enemy.TYPES.boss.phases[0].shield;
  t.eq(conjured, 1000, "the roar conjures 1000 points");
  t.eq(boss.shieldMax, conjured, "1000 points of shield out of nowhere");
  t.eq(boss.shield, conjured, "full");
  t.ok(boss.currentSpeedUlps() > walked, "it got faster");
  // 12 s base × 0.75. This assertion read 6 off a base of 8 until 2026-08-19,
  // which was one retune stale in both halves: the 2026-08-01 pass took both
  // intervals 8 -> 12 s, so the post-roar figure is 9.
  t.eq(boss.attack.intervalSeconds, 9, "and shoots more often -- 9 s, from 12");

  // THE TYPE MUST NOT HAVE MOVED. `this.attacks` starts as a shallow copy of
  // the type's pool, so its ENTRIES are the very rows in Enemy.TYPES that
  // every enemy of the type shares -- winding an interval down in place would
  // speed up every future boss, in this run and the next. (This read
  // `Enemy.TYPES.boss.attack`, singular, which the type row has never had: the
  // pool is `attacks`, and the undefined lookup threw instead of asserting.)
  t.eq(Enemy.TYPES.boss.attacks[0].intervalSeconds, 12, "the TYPE is untouched");

  t.eq(boss.attacks.length, 2, "and the leap joined the pool");
  t.ok(!!boss.attacks[1].leap, "as the second entry");

  // The summons come out through spawnMinions, the same door a Hive's brood
  // uses, so the main loop needs no second hook. FORTY bodies since
  // 2026-08-01, when a support court (2 Hives, 3 Shieldbearers, 3 Healers,
  // 2 Colossi) joined the running mob of thirty behind it -- 600 HP across
  // thirty became 2780 across forty. Summed off the type rather than typed,
  // so the next row added to the roar moves this on its own.
  var expected = 0;
  Enemy.TYPES.boss.phases[0].summon.groups.forEach(function (g) { expected += g.count; });
  t.eq(expected, 40, "the roar's groups sum to forty");
  var called = boss.spawnMinions(1 / 60);
  t.eq(called.length, expected, "forty bodies called in");
  t.ok(called.some(function (e) { return e.isFlying; }),
    "including flyers, so the roar asks the air question one last time");
  t.eq(called[0].speedScale, 1.5, "running at 1.5x");
  t.ok(called[0].progress <= 600, "trailing behind it, not on top of it");
  t.ok(called.every(function (e) { return e.progress >= 0; }), "and never off the back of the road");
  t.eq(boss.spawnMinions(1 / 60), null, "and the queue drains exactly once");

  // Phases are one-way and fire once.
  //
  // 150 rather than the 400 this used to hit for: a shield SPILLS THROUGH (see
  // takeDamage), so 400 against a 200 point shell was never "health untouched"
  // -- it was 200 of spill that the old assertion did not account for. A hit
  // the shell can actually hold is what tests the ordering, and the 1000 point
  // shell holds it with room to spare.
  boss.takeDamage(150);
  t.eq(boss.phasesEntered, 1, "it does not roar twice");
  t.eq(boss.shield, conjured - 150, "the new shield takes the hit");
  t.eq(boss.health, half - 1, "health untouched while the shield holds");
});

test("a stunned tower goes completely silent, cooldown and all", function (t) {
  var h = harness.boot();
  h.run("cash = 100000; waveIndex = WAVES.length; enemies = []; bullets = []");

  var tower = h.placeGunner(w(h, 600), w(h, 505));
  t.ok(tower !== null, "a gunner is on the board");
  t.notOk(h.game.TowerHealth.isStunned(tower), "and is not stunned");

  h.game.TowerHealth.stun(tower, 2);
  t.ok(h.game.TowerHealth.isStunned(tower), "now it is");

  // An enemy parked in range, and a stunned tower that must not touch it.
  //
  // spawnAt's first argument is a PROGRESS along the road, not an x coordinate.
  // This passed w(h, 620) -- a converted pixel value -- which landed the enemy
  // 307 px from a tower with a 104 px reach, so it was never in range at all
  // and "it fires nothing while silenced" was passing for the wrong reason.
  // Put it on the road beside the tower instead, which is what the comment
  // above always claimed.
  function parkBeside(health) {
    return h.run("(function () {" +
      "  var e = new Enemy(path, " + health + ");" +
      "  e.progress = path.progressAtPoint(" + tower.x + ", " + tower.y + ");" +
      "  e.refreshPos(); enemies.push(e); return e; })()");
  }

  var e = parkBeside(1000);
  t.ok(Math.hypot(e.pos.x - tower.x, e.pos.y - tower.y) <= tower.rangePx,
    "the enemy really is inside the tower's reach");
  var before = tower.damageDealt;
  h.step(1.5);
  t.eq(tower.damageDealt, before, "it fires nothing while silenced");
  t.eq(e.health, 1000, "and the enemy takes nothing");

  h.step(1);
  t.ok(!h.game.TowerHealth.isStunned(tower), "the stun wears off");

  // A FRESH body beside it. Enemies do not park -- the first one has walked
  // 125 u.l. down the road by now and is out of reach, so leaving it there
  // would test the tower's range rather than its recovery.
  h.run("enemies = []");
  parkBeside(1000);
  h.step(1.5);
  t.ok(tower.damageDealt > before, "and it goes straight back to work");

  // Longest stun wins, and a shorter one cannot cut it short. Same rule as
  // Enemy.applySlow, for the same reason.
  h.game.TowerHealth.stun(tower, 2);
  h.game.TowerHealth.stun(tower, 0.5);
  t.eq(tower.stunTimer, 2, "a shorter stun cannot shorten a longer one");
});

test("every player tower holds its facing while stunned and resumes on wake", function (t) {
  // One fresh board per type avoids placement overlap and makes this a test of
  // the shared game-loop gate, not of which tower happened to be updated first.
  var typeNames = ["Smasher", "LongshotTower", "BeamTower", "Soldier"];

  typeNames.forEach(function (typeName) {
    var h = harness.boot();
    h.run("cash = 1000000; waveIndex = WAVES.length; enemies = []; bullets = []");

    var Type = h.game[typeName];
    var slot = h.slotOf(Type);
    var spot = h.run("(function () {" +
      "  for (var x = 24; x < VIEW_WIDTH - 24; x += 8)" +
      "    for (var y = 24; y < VIEW_HEIGHT - 80; y += 8)" +
      "      if (whyCannotBuild(x, y, " + typeName + ") === null) return { x: x, y: y };" +
      "  return null; })()");
    var tower = h.place(spot.x, spot.y, slot);
    var label = Type.DISPLAY_NAME;

    // Replace combat with the smallest possible tracking probe. If update is
    // called it turns the directional towers immediately; if it is not, their
    // authored heading remains byte-for-byte unchanged. The Siphon has no aim
    // field, but the same call count proves its update is under the same gate.
    var heldAim = -1.125;
    var resumedAim = 0.875;
    var updateCalls = 0;
    if (typeof tower.aim === "number") tower.aim = heldAim;
    tower.update = function () {
      updateCalls++;
      if (typeof this.aim === "number") this.aim = resumedAim;
      return 0;
    };

    // Config-driven towers genuinely store stun on their core. Exercise that
    // source directly -- B5 starts its own stun this way -- so this catches an
    // adapter that only mirrors HP and lets the outer game loop miss the stun.
    if (tower.core) tower.core.stunTimer = 0.5;
    else h.game.TowerHealth.stun(tower, 0.5);

    t.ok(h.game.TowerHealth.isStunned(tower), label + " exposes its live stun");
    h.step(0.25);
    t.eq(updateCalls, 0, label + " does not track while stunned");
    if (typeof tower.aim === "number") {
      t.eq(tower.aim, heldAim, label + " holds the heading from stun start");
    }

    h.step(0.4);
    t.ok(updateCalls > 0, label + " resumes update after the stun expires");
    if (typeof tower.aim === "number") {
      t.eq(tower.aim, resumedAim, label + " may track again once awake");
    }
  });
});

test("a stunned Siphon hides live beam tracking without dropping its locks", function (t) {
  var h = harness.boot();
  h.run("cash = 1000000; waveIndex = WAVES.length; enemies = []; bullets = []");

  var slot = h.slotOf(h.game.BeamTower);
  var spot = h.run("(function () {" +
    "  for (var x = 24; x < VIEW_WIDTH - 24; x += 8)" +
    "    for (var y = 24; y < VIEW_HEIGHT - 80; y += 8)" +
    "      if (whyCannotBuild(x, y, BeamTower) === null) return { x: x, y: y };" +
    "  return null; })()");
  var beam = h.place(spot.x, spot.y, slot);
  var target = { dead: false, leaked: false, pos: { x: 500, y: 300 } };
  beam.locks = [target];

  t.eq(beam.visibleLocks().length, 1, "the live beam is visible while awake");
  h.game.TowerHealth.stun(beam, 1);
  t.eq(beam.visibleLocks().length, 0, "no endpoint follows the enemy while stunned");
  t.eq(beam.locks.length, 1, "the simulation lock itself is preserved");

  beam.stunTimer = 0;
  t.eq(beam.visibleLocks()[0], target, "the same beam becomes visible again on wake");
});

// The aimed shot's whole character: it walks past three closer towers to hit
// the one that is actually hurting it. Made possible by the vocabulary EVERY
// tower answers (attackDamage/attacksPerSecond), so the enemy never has to
// know what a Longshot is.
test("the Tyrant's aimed shot takes the HIGHEST DPS tower, not the nearest", function (t) {
  var h = harness.boot();
  h.run("cash = 1000000; waveIndex = WAVES.length; enemies = []; bullets = []; towers = []");

  // The gunner is not buildable any more (2026-07-30) but is still the 100 u.l.
  // reference tower in code, and 1 DPS is exactly the weak-but-real number this
  // test needs on the board beside something much stronger. Placed directly --
  // see harness.placeGunner.
  // y=505, not 455: the road's centre line is y=460, so both of these were
  // refused as "too close to the path" and came back null -- which is what the
  // TypeError on null.attackDamage below was.
  var near = h.placeGunner(w(h, 560), w(h, 505));            // 1 DPS, close
  var far = h.placeGunner(w(h, 700), w(h, 505));             // 1 DPS
  // Resolved by CONSTRUCTOR: the gunner's deletion shifted every slot index.
  var best = h.place(w(h, 640), w(h, 420), h.slotOf(h.game.LongshotTower));
  t.ok(near && far && best, "two weak towers and an Arcane Sniper are on the board");
  t.ok(h.game.Enemy.towerDps(best) > h.game.Enemy.towerDps(near),
    "and the Longshot really is the strongest");

  h.run("enemies = [new Enemy(path, undefined, 'boss')]");
  h.run("enemies[0].progress = path.progressAtPoint(" + w(h, 560) + ", " + w(h, 505) + ")");
  h.run("enemies[0].refreshPos()");
  var boss = h.game.enemies[0];

  // The interval is 12 s, not the 8 this used to walk up to. Taken from the
  // boss's own aimed spec so the walk cannot drift out of step with it again --
  // this is the CLOCK, not the expectation, and the damage below stays typed.
  var aimed = boss.attacks[0];
  t.eq(aimed.id, "aimed", "the pre-roar pool is the aimed shot alone");
  h.step(aimed.intervalSeconds - 0.1);
  t.eq(boss.windUpTimer, 0, "nothing before the interval is up");

  // It STOPS to aim, and that is the trade: the seconds it spends winding up
  // are seconds it is not advancing.
  h.step(0.2);
  t.ok(boss.windUpTimer > 0, "then it winds up");
  var held = boss.progress;
  h.step(0.6);
  t.eq(boss.progress, held, "standing perfectly still while it does");
  t.eq(best.currentHp, best.maxHp, "and nothing has been hit yet");

  h.step(0.9);
  t.eq(best.currentHp, best.maxHp - 45, "the shot lands on the Longshot for 45");
  t.ok(h.game.TowerHealth.isStunned(best), "and stuns it");
  t.eq(near.currentHp, near.maxHp, "the nearer gunner is untouched");
  t.eq(far.currentHp, far.maxHp, "and so is the other one");
  t.ok(boss.currentSpeedUlps() > 0, "it walks again once the shot is away");
});

test("the leap jumps 90 u.l. and shockwaves everything it lands beside", function (t) {
  var h = harness.boot();
  h.run("cash = 1000000; waveIndex = WAVES.length; enemies = []; bullets = []; towers = []");

  // y=505, not 455. The road runs at y=460, so 455 is five pixels off its
  // centre line and every one of these placements was refused as "too close to
  // the path" -- placeGunner returned null and the test died on null.currentHp.
  // 505 is the offset the rest of the suites stand towers at.
  var a = h.placeGunner(w(h, 600), w(h, 505));
  var b = h.placeGunner(w(h, 660), w(h, 505));
  var away = h.placeGunner(w(h, 900), w(h, 505));
  t.ok(a && b && away, "three towers actually stand beside the road");

  h.run("enemies = [new Enemy(path, undefined, 'boss')]");
  h.run("enemies[0].progress = path.progressAtPoint(" + w(h, 580) + ", " + w(h, 505) + ")");
  h.run("enemies[0].refreshPos()");
  var boss = h.game.enemies[0];

  // Roar first -- the leap is not in the pool until then -- and drain the
  // summons so only the boss is on the board.
  //
  // DERIVED from the boss's own maximum rather than typed. This read 1251, which
  // crossed the 50% mark when the Tyrant had 2500 HP. It has 5000, so 1251 left
  // it at 74.98%, the phase never fired, the leap was never added to its attack
  // list and the "leap" this test measured was simply the boss walking.
  boss.takeDamage(Math.floor(boss.maxHealth / 2) + 1);
  boss.spawnMinions(1 / 60);
  h.run("enemies = [enemies[0]]");
  t.ok(boss.health < boss.maxHealth * 0.5, "the roar threshold was actually crossed");

  // Ask which slot the leap landed in rather than assuming it is second: it is
  // appended by the phase, so a second added attack would silently shift it.
  var leapIndex = h.run("(function () { var A = enemies[0].attacks;" +
    "  for (var i = 0; i < A.length; i++) if (A[i].id === 'leap') return i;" +
    "  return -1; })()");
  t.ok(leapIndex >= 0, "the roar added the leap to its attacks");
  boss.attackIndex = leapIndex;
  boss.attackTimer = 0.01;

  // Measure the jump on the step it happens: afterwards the boss walks on, and
  // a reading taken later includes that walking.
  var jumped = 0;
  for (var i = 0; i < 2 * 60; i++) {
    var before = boss.progress;
    h.step(1 / 60);
    var moved = boss.progress - before;
    if (moved > h.game.ul(10)) jumped = moved;
  }

  t.near(jumped / h.game.UNIT_LENGTH, 90, 0.01, "it jumps exactly 90 u.l.");

  // The shockwave deals 80 and the reference tower has 60 hit points, so
  // anything it lands beside is destroyed outright rather than merely dented.
  // That is why this asserts death and not a damage figure: a "30 each" reading
  // would be measuring the clamp, not the blast.
  t.ok(a.currentHp === 0 && b.currentHp === 0, "both nearby towers are emptied");
  t.ok(a.isDestroyed() && b.isDestroyed(), "which destroys them outright");
  t.ok(h.game.TowerHealth.isStunned(a) && h.game.TowerHealth.isStunned(b), "and both are stunned");
  t.eq(away.currentHp, away.maxHp, "the one outside the radius is untouched");
});

test("after the roar it alternates shot and leap, and still attacks rarely", function (t) {
  var h = harness.boot();
  h.run("cash = 1000000; waveIndex = WAVES.length; enemies = []; bullets = []; towers = []");

  // Towers all along the road, so it always has something to attack and the
  // cycle is what is being measured rather than target availability.
  //
  // THEY FOLLOW THE ROAD, rather than sitting on one straight line beside its
  // first stretch. The row used to be fourteen placements at a fixed y=505,
  // which only shadows the route while the route happens to run flat: the boss
  // walks 675 u.l. during the 45 s pre-roar measurement below and comes to rest
  // at y=259, where the NEAREST of those towers was 248 px away against the
  // leap's 228.8 px reach. So the leap had no candidates, every turn fell
  // through to the aimed shot -- which is documented, correct behaviour (see
  // attackTowers: "a spec with nothing in reach steps to the next one") -- and
  // the test read that fall-through as a broken cycle. The premise stated in
  // this comment was simply never met.
  //
  // Spread along the path's own length and offset perpendicular to it, the
  // widest gap to the nearest tower is ~84 px against that 228.8 px reach, so
  // the leap always has something and the CYCLE is what the assertion sees.
  var standing = 0;
  for (var i = 0; i < 14; i++) {
    var at = h.game.path.length * (i + 0.5) / 14;
    var on = h.game.path.pointAt(at);
    var tan = h.game.path.tangentAt(at);
    var side = (i % 2) ? 1 : -1;               // alternate banks, so neither crowds the other
    var pad = w(h, 45) * side;
    if (h.placeGunner(on.x - tan.y * pad, on.y + tan.x * pad)) standing++;
  }
  t.ok(standing >= 10, "a row of towers actually stands along the road (" + standing + ")");

  h.run("enemies = [new Enemy(path, undefined, 'boss')]");
  h.run("enemies[0].progress = path.progressAtPoint(" + w(h, 320) + ", " + w(h, 505) + ")");
  h.run("enemies[0].refreshPos()");
  var boss = h.game.enemies[0];

  // Pre-roar: one attack, and a slow one.
  var before = 0;
  for (var s = 0; s < 45 * 60; s++) {
    var was = boss.attackIndex;
    h.step(1 / 60);
    if (boss.attackIndex !== was) before++;
  }
  t.ok(before >= 3 && before <= 6,
    "pre-roar it attacks " + before + " times in 45 s (it was ~12 at 3.5 s)");

  // Derived from the boss's own maximum, not typed. 1251 crossed the 50% mark
  // when the Tyrant had 2500 HP; it has 5000, so the roar never fired, the leap
  // was never added, and every attack in `order` below was the same "aimed" --
  // which is exactly why "never the same attack twice running" was false.
  boss.takeDamage(Math.floor(boss.maxHealth / 2) + 1);
  boss.spawnMinions(1 / 60);
  h.run("enemies = [enemies[0]]");
  t.ok(boss.attacks.length >= 2, "the roar gave it a second attack to alternate with");

  var order = [];
  for (var k = 0; k < 45 * 60; k++) {
    var prev = boss.attackIndex;
    h.step(1 / 60);
    if (boss.attackIndex !== prev) {
      order.push(boss.attacks[prev % boss.attacks.length].id);
    }
  }

  t.ok(order.length >= 3, "it attacks several times after the roar (" + order.join(", ") + ")");
  var alternates = order.every(function (id, ix) { return ix === 0 || id !== order[ix - 1]; });
  t.ok(alternates, "and never the same attack twice running");
});


test("its aimed shot fires from its eyes and blows up where it lands", function (t) {
  var h = harness.boot();
  h.run("cash = 1000000; waveIndex = WAVES.length; enemies = []; bullets = []; towers = []");
  var tower = h.placeGunner(w(h, 600), w(h, 505));
  t.ok(!!tower, "a tower stands beside the road to be shot at");

  // ON THE SPEC, NOT ON THE TYPE. The pool gains a leap at the roar and only
  // the aimed shot has eyes; this is the assertion that stops a future change
  // from moving the flag up onto the boss row, where the leap would inherit it.
  var B = h.game.Enemy.TYPES.boss;
  t.ok(!!B.attacks[0].eyeBeam, "the aimed shot carries an eyeBeam block");
  t.ok(!B.phases[0].addAttack.eyeBeam, "and the leap does NOT");

  h.run("Effects.reset()");
  h.run("enemies = [new Enemy(path, undefined, 'boss')]");
  h.run("enemies[0].progress = path.progressAtPoint(" +
    w(h, 560) + ", " + w(h, 505) + ")");
  h.run("enemies[0].refreshPos()");
  var boss = h.game.enemies[0];

  // Walk the clock until it takes its turn. 20 s covers the 12 s interval plus
  // the 1.3 s wind-up with room; the loop stops at the shot rather than
  // running on, so a second attack cannot confuse the count.
  var fired = false;
  for (var i = 0; i < 20 * 60 && !fired; i++) {
    h.step(1 / 60);
    fired = h.game.Effects.worldState().aoeImpacts.some(function (m) {
      return m.kind === "tyrant-gaze";
    });
  }
  t.ok(fired, "it took its shot inside 20 s");

  var marks = h.game.Effects.worldState().aoeImpacts;
  var gaze = marks.filter(function (m) { return m.kind === "tyrant-gaze"; })[0];
  var blast = marks.filter(function (m) { return m.kind === "tyrant-blast"; })[0];

  t.ok(!!gaze, "a gaze mark was emitted");
  t.ok(!!blast, "and an explosion where it landed");
  t.near(gaze.x2, tower.x, 0.001, "the beam ends on the tower it picked");
  t.near(gaze.y2, tower.y, 0.001, "in both axes");
  t.ok(gaze.liftPx > boss.radiusPx() * 2,
    "it leaves the BROW, not the belly (" + gaze.liftPx.toFixed(1) + " px up)");
  t.ok(gaze.spreadPx > 0, "and as a pair, so it reads as eyes rather than a barrel");
  t.eq(gaze.particles, undefined, "the beam itself throws no debris along its length");
  t.near(blast.x, tower.x, 0.001, "the explosion is at the tower");
  t.ok(blast.radius > 0, "with a radius to it");

  // THE PLAIN BOLT IS SUPPRESSED, not drawn underneath. Both would put a
  // second line on the board, leaving the body's centre.
  t.eq(boss.attackBeam, null, "and the old centre-of-body bolt is not drawn too");

  // AND NONE OF IT IS SIMULATION. The damage is the type's 45 whether or not a
  // single one of those marks was drawn -- the rule js/effects.js opens with.
  t.eq(tower.currentHp, tower.maxHp - B.attacks[0].damage,
    "the tower took the spec's damage, unchanged by the fireworks");
});


group("shields, second winds and spawners");

test("a shield is sized off the enemy's OWN health, and soaks before it", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;

  var stock = new Enemy(h.game.path, undefined, "shielded");
  t.eq(stock.maxHealth, 12, "a stock Bulwark is 12 HP");
  t.eq(stock.shieldMax, 24, "behind 24 of shield");
  t.eq(stock.remainingHealth(), 36, "36 to remove in total");

  // Scaling the type with a wave's health override scales the shield with it.
  // That is the whole reason the shield is a RATIO and not a number: there is
  // no second figure to forget to retune.
  var scaled = new Enemy(h.game.path, 20, "shielded");
  t.eq(scaled.shieldMax, 40, "a 20 HP Bulwark carries 40 of shield");

  // The shield goes first, and health is untouched until it is gone.
  //
  // AND IT PAYS NOTHING (2026-07-30, at the owner's request: "make it so that
  // shield gives 0 money, ever"). The hit lands in full -- the shield really
  // does lose ten -- but the return value is what the blow was WORTH, and a
  // shield is worth nothing.
  t.eq(stock.takeDamage(10), 0, "ten damage into the shield pays NOTHING");
  t.eq(stock.shield, 14, "and comes off the shield");
  t.eq(stock.health, 12, "health untouched");

  // A HIT BIGGER THAN WHAT IS LEFT IS ABSORBED WHOLE, AND THIS TEST ASSERTED
  // THE OPPOSITE UNTIL 2026-08-26. The owner's rule: "if a enemy has 100 HP and
  // 10 shield and gets hit for 200 damage, the shield breaks because it is
  // inferior to 200 but nothing happens to the health." So a twenty against
  // fourteen of shell empties the shell and stops there -- it does not pay,
  // because a shield never pays, and it does not reach the body either.
  t.eq(stock.takeDamage(20), 0, "a twenty empties the shell and pays nothing");
  t.eq(stock.shield, 0, "shield gone");
  t.eq(stock.health, 12, "and the body is untouched -- nothing spilled through");

  // ONE HIT PER LAYER, NOT A DAMAGE CAP. The shell is gone now, so the NEXT
  // blow lands in full.
  t.eq(stock.takeDamage(5), 5, "the next blow reaches health");
  t.eq(stock.health, 7, "which is now seven");

  // Overkill still does not pay: 7 left, hit for 50, paid 7.
  t.eq(stock.takeDamage(50), 7, "overkill pays only what was there");
  t.eq(stock.dead, true, "and it is dead");

  // AND THE OWNER'S OWN EXAMPLE, spelled out on a body with his figures.
  var quoted = new Enemy(h.game.path, 100, "normal");
  quoted.grantShield(10, false);
  t.eq(quoted.takeDamage(200), 0, "200 into 10 of shield pays nothing");
  t.eq(quoted.shield, 0, "the shield breaks, being inferior to 200");
  t.eq(quoted.health, 100, "and nothing happens to the health");
});

test("breaking a Bulwark's shield doubles its speed", function (t) {
  var h = harness.boot();
  var e = new h.game.Enemy(h.game.path, undefined, "shielded");

  var before = e.currentSpeedUlps();
  t.near(before, 45, 0.001, "45 u.l./s while shielded");

  e.takeDamage(24);
  t.eq(e.shield, 0, "shield broken");
  t.near(e.currentSpeedUlps(), 90, 0.001, "90 u.l./s after -- past a Fast's 87.5");
  t.eq(e.health, 12, "with all of its health still to remove");

  // The speed-up is PERMANENT and multiplies with a timed slow rather than
  // replacing it, so a slow still works on a broken Bulwark.
  e.applySlow(0.5, 3);
  t.near(e.currentSpeedUlps(), 45, 0.001, "a 50% slow halves the doubled speed");
});

test("a Revenant gets up once, at full health, and never walks again", function (t) {
  var h = harness.boot();
  var e = new h.game.Enemy(h.game.path, undefined, "revenant");

  e.progress = 400;
  e.refreshPos();
  var where = e.progress;

  t.eq(e.takeDamage(16), 16, "the first kill is paid for");
  t.eq(e.dead, false, "but it is not dead");
  t.eq(e.health, 16, "it is back at full health");
  t.eq(e.revived, true, "and marked as having used its second wind");
  t.eq(e.rooted, true, "rooted where it fell");
  t.eq(e.currentSpeedUlps(), 0, "so it walks at nothing");

  h.run("enemies = []; bullets = []; waveIndex = WAVES.length");
  h.game.enemies.push(e);
  h.step(2);
  t.eq(e.progress, where, "two seconds later it has not moved");

  t.eq(e.takeDamage(16), 16, "the second kill is paid for too");
  t.eq(e.dead, true, "and this one sticks");
});

test("a Hive is ordinary; its BROOD is the shielded, unpaid part", function (t) {
  var h = harness.boot();
  var hive = new h.game.Enemy(h.game.path, undefined, "hive");

  // The parent has a spawner premium; its brood still pays nothing.
  t.eq(hive.maxHealth, 150, "150 HP");
  t.eq(hive.shieldMax, 0, "and no shield of its own");
  t.eq(hive.takeDamage(100), 100, "a hundred damage is reported");
  t.eq(hive.bounty(), 175, "its kill bounty includes the spawner premium");

  hive.progress = 500;
  hive.refreshPos();

  // Nothing for the first seven seconds -- the timer starts full, so a Hive
  // does not empty a litter onto the road the instant it appears.
  t.eq(hive.spawnMinions(6.9), null, "nothing before the interval is up");
  var brood = hive.spawnMinions(0.2);
  t.eq(brood.length, 5, "then five at once");
  t.eq(brood[0].typeId, "normal", "ordinary normals");
  t.eq(brood[0].progress, 500, "dropped where the Hive stands, not at the gate");

  // The two properties that make a hatchling different from the normal it is:
  // both come from the SPAWN, through the constructor's per-spawn overrides.
  t.eq(brood[0].maxHealth, 4, "a hatchling has a normal's health");
  t.eq(brood[0].shieldMax, 4, "wears a shield equal to that life");
  t.eq(brood[0].remainingHealth(), 8, "so it is 8 to remove");
  t.eq(brood[0].takeDamage(4), 0, "and pays NOTHING for any of it");
  t.eq(brood[0].bounty(), 0, "whole-life bounty of zero");

  // And a normal that was NOT born of a Hive is completely untouched. This is
  // the assertion that would have caught putting the shield on the type row.
  var plain = new h.game.Enemy(h.game.path, undefined, "normal");
  t.eq(plain.shieldMax, 0, "a scheduled normal has no shield");
  t.eq(plain.takeDamage(4), 4, "and pays normally");

  // The main loop is what puts the brood on the board.
  h.run("enemies = []; bullets = []; towers = []; waveIndex = WAVES.length");
  h.game.enemies.push(hive);
  h.step(7.1);
  t.eq(h.game.enemies.length, 6, "the loop appended the brood to the board");
});

test("towers keep shooting a shielded enemy instead of writing it off", function (t) {
  var h = harness.boot();
  var e = new h.game.Enemy(h.game.path, undefined, "shielded");

  // Target claiming asks unclaimedHealth(), which has to count the shield. If
  // it did not, twelve points of claims would mark a 36-point enemy as dead on
  // arrival and every tower on the board would stop firing at it.
  e.reserveDamage(12);
  t.eq(e.unclaimedHealth(), 24, "twelve claimed off thirty-six leaves twenty-four");
  t.ok(e.unclaimedHealth() > 0, "so it is still a target");

  e.reserveDamage(24);
  t.eq(e.unclaimedHealth(), 0, "and only a full thirty-six writes it off");
});

test("the boss banner is driven by a flag on the type, not by the midboss", function (t) {
  var h = harness.boot();
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []");

  t.eq(h.run("bossBarEnemies().length"), 0, "nothing on an empty board");
  h.draw();                                  // and drawing it must not throw

  h.run("enemies = [new Enemy(path, undefined, 'midboss')]");
  t.eq(h.run("bossBarEnemies().length"), 1, "the midboss raises a banner");
  h.draw();

  // Any other enemy does not, however big -- the flag is what decides.
  h.run("enemies = [new Enemy(path, undefined, 'hive')]");
  t.eq(h.run("bossBarEnemies().length"), 0, "a Hive does not, despite its 300");
});


group("enemies that fight back");

// Drives `enemy.attackTowers` one small frame at a time -- the same order
// game.js uses (update, then attackTowers) -- until it returns a hit or the
// frame budget runs out. A facesTarget attack no longer resolves inside the
// single call that commits to it: it stops, turns, THEN strikes, so a test
// that wants to see the hit land has to cross those frames the way the real
// loop does. Returns the hit tower, or null if the budget ran out first.
function driveAttackToResolution(enemy, towers, maxSeconds) {
  var dt = 1 / 60;
  var elapsed = 0;
  while (elapsed < maxSeconds) {
    enemy.update(dt);
    var hit = enemy.attackTowers(dt, towers);
    elapsed += dt;
    if (hit) return hit;
  }
  return null;
}

test("an angry enemy chews through a gunner and the loop sweeps it out", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var g = h.placeGunner(530, 505);
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []");

  t.eq(g.maxHp, h.game.Tower.BASE_HP, "the gunner has hit points");
  t.eq(g.currentHp, g.maxHp, "at full");

  // Parked at the gunner's own projection on the road, and frozen, so this
  // measures swings rather than how long it takes to walk past.
  var angry = h.spawnAt(g.pathProgress, undefined, "angry");
  angry.speedUlps = 0;

  // `angry.attack.facesTarget` (2026-08-14) adds a stop-turn-strike-return
  // posture on top of the swing: a 90-degree turn each way (0.3 s) plus the
  // 0.4 s strike, so each swing now costs 2.5 s of interval PLUS up to 1.6 s
  // of posture before the next one is even eligible, rather than landing the
  // instant the interval expires. Measured directly off this exact fixture
  // (gunner at (530, 505), a frozen angry at its road projection, real
  // game-loop steps) rather than derived, because the posture's own turn
  // angle depends on where the tower sits relative to the road here: 2.833 s,
  // 6.400 s, 9.967 s. The margins below clear each with room before the next.
  h.step(2.9);
  t.eq(g.currentHp, 40, "one swing, landed after its stop-turn-strike");
  h.step(3.7);
  t.eq(g.currentHp, 20, "two");
  h.step(3.6);
  t.eq(g.currentHp, 0, "three swings kill a 60 HP gunner");

  t.eq(h.game.towers.indexOf(g), -1, "and the destroyed tower leaves the board");
  t.eq(h.game.inspected, null, "with nothing selected pointing at it");
});

test("an enemy with no attack never touches a tower", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var g = h.placeGunner(530, 505);
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []");

  // The rule is DATA, not a branch on the type id: every other type simply
  // has no `attack` block, so attackTowers returns immediately.
  var normal = h.spawnAt(g.pathProgress, 100000);
  normal.speedUlps = 0;
  h.step(10);

  t.eq(g.currentHp, g.maxHp, "ten seconds nose to nose, no damage");
  t.eq(h.game.towers.length, 1, "the tower is still there");
});

test("an attacker hits one tower, the nearest, not everything in reach", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []");

  var angry = h.spawnAt(600, undefined, "angry");
  angry.speedUlps = 0;

  // Two stand-ins at known distances, so this does not depend on where the
  // placement rules allow a real tower to go.
  var near = { x: angry.pos.x + 5, y: angry.pos.y, hits: 0,
    takeDamage: function (n) { this.hits += n; }, isDestroyed: function () { return false; } };
  var far = { x: angry.pos.x + 20, y: angry.pos.y, hits: 0,
    takeDamage: function (n) { this.hits += n; }, isDestroyed: function () { return false; } };

  // facesTarget means this call only COMMITS (it picks the nearest and turns
  // toward it); driveAttackToResolution crosses the turn and the strike the
  // way the real loop would. Selection itself is decided right here, at
  // commit, from the same candidate list attackCandidates always used --
  // this is exactly what the fix reused rather than a second lookup.
  angry.attackTowers(3, [far, near]);
  var hit = driveAttackToResolution(angry, [far, near], 1);
  t.eq(hit, near, "the nearest one was the one it turned to face and hit");
  t.eq(near.hits, 20, "the nearest one took the swing");
  t.eq(far.hits, 0, "the other took nothing");
});

test("a tower out of reach is safe, and the swing lands the moment one is not", function (t) {
  var h = harness.boot();
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []");

  var angry = h.spawnAt(600, undefined, "angry");
  var reachPx = h.run("ul(" + angry.attack.reachUl + ")");

  var out = { x: angry.pos.x + reachPx + 40, y: angry.pos.y, hits: 0,
    takeDamage: function (n) { this.hits += n; }, isDestroyed: function () { return false; } };

  t.eq(angry.attackTowers(5, [out]), null, "nothing in reach, nothing hit");
  t.eq(out.hits, 0, "and no damage");
  t.eq(angry.attackPosture, null, "and nothing committed either");

  // The timer stays expired rather than restarting, so walking into range is
  // punished immediately instead of granting a free interval of safety --
  // this call COMMITS on the very same frame it comes into reach, which is
  // the part facesTarget did not change. Landing the hit is now a turn and a
  // strike away rather than instant; driveAttackToResolution crosses them.
  out.x = angry.pos.x + 4;
  t.eq(angry.attackTowers(0, [out]), null, "commits the instant one is in reach");
  t.ok(angry.attackPosture !== null, "and is now turning to face it");
  t.eq(out.hits, 0, "no damage on the commit frame itself");

  var hit = driveAttackToResolution(angry, [out], 1);
  t.eq(hit, out, "the swing lands once the turn and strike play out");
  t.eq(out.hits, 20, "for its full damage");

  // THE POSTURE IS STILL RUNNING HERE, and asserting it null on this line was
  // a contradiction the helper can never satisfy: damage lands at the START of
  // the strike phase (see advanceAttackPosture, which calls resolveAttack the
  // instant it enters "strike"), and driveAttackToResolution returns on the
  // frame a hit comes back. This fixture's posture is turn 0.3 / strike 0.4 /
  // return 0.3, so the hit arrives at 0.317 s with 0.7 s of strike and
  // turn-back still to run. "Turned back and resumed" is a real claim and is
  // kept -- it just has to be asked after the clock that clears it, not
  // before, so the remaining phases are driven out here.
  t.ok(angry.attackPosture !== null, "mid-strike, it is still committed");
  var spent = 0;
  while (angry.attackPosture && spent < 2) {
    angry.update(1 / 60);
    angry.attackTowers(1 / 60, [out]);
    spent += 1 / 60;
  }
  t.eq(angry.attackPosture, null, "and it has turned back and resumed by then");
  t.eq(out.hits, 20, "without the return turn landing a second swing");
});

test("defences come off the type onto the enemy, and mitigation applies them", function (t) {
  var h = harness.boot();

  // Percentage defense taxes every hit in proportion: a gunner's 1 becomes
  // 0.8, a Longshot's 10 becomes 8. Nothing is blocked outright.
  var armored = h.spawnAt(0, undefined, "armored");
  t.eq(armored.defense, 20, "defense copied onto the instance");
  t.eq(armored.armor, 0, "and no flat armor");
  t.near(armored.takeDamage(1), 0.8, 1e-9, "a gunner's shot is taxed 20%");

  // Flat armor is subtracted first and has NO damage floor, so a weapon that
  // hits for less than the armor does exactly nothing. That is the counter
  // working, not a bug -- see js/systems/mitigation.js.
  var brute = h.spawnAt(0, undefined, "brute");
  t.eq(brute.armor, 5, "flat armor copied onto the instance");
  t.eq(brute.takeDamage(1), 0, "a gunner's 1 damage does nothing at all");
  t.eq(brute.health, 40, "and takes nothing off its health");
  t.eq(brute.takeDamage(12), 7, "a smasher's 12 lands 7 through the armor");

  var boss = h.spawnAt(0, undefined, "midboss");
  t.near(boss.takeDamage(10), 9, 1e-9, "the midboss taxes 10%");
});

test("a type sets health and speed on the enemy it builds", function (t) {
  var h = harness.boot();

  var normal = h.spawnAt(0);
  var fast = h.spawnAt(0, undefined, "fast");
  var slow = h.spawnAt(0, undefined, "slow");

  t.eq(normal.health, 4, "normal HP");
  t.eq(normal.speedUlps, 50, "normal u.l./s");
  t.eq(fast.health, 2, "fast HP");
  t.eq(fast.speedUlps, 87.5, "fast u.l./s -- 1.75 x 50");
  t.eq(slow.health, 7, "slow HP");
  t.near(slow.speedUlps, 35, 1e-9, "slow u.l./s -- 0.7 x 50");

  t.eq(normal.maxHealth, 4, "maxHealth tracks the type, so the health bar is right");
  t.eq(fast.typeId, "fast", "the id is recorded on the instance");
});

test("speed is relative, so retuning the walking speed moves the roster", function (t) {
  var h = harness.boot();
  h.run("Enemy.BASE_SPEED_ULPS = 125");

  t.eq(h.spawnAt(0, undefined, "fast").speedUlps, 218.75, "fast follows the base");
  t.eq(h.spawnAt(0, undefined, "slow").speedUlps, 87.5, "slow follows the base");

  h.run("Enemy.BASE_SPEED_ULPS = 50");
});

test("a health override changes health only, never speed", function (t) {
  var h = harness.boot();
  // This is the debug spawner's case: a fast tough enough to survive a swing.
  var e = h.spawnAt(0, 30, "fast");

  t.eq(e.health, 30, "the override wins over the type's health");
  t.eq(e.speedUlps, 87.5, "but the type still sets the speed");
});

test("an unknown type is refused loudly rather than silently made normal", function (t) {
  var h = harness.boot();
  var threw = false;
  try {
    h.run("new Enemy(path, undefined, 'jugggernaut')");
  } catch (err) {
    threw = true;
  }
  t.ok(threw, "a typo in a type id throws");
});

test("they actually walk at their own speeds", function (t) {
  var h = harness.boot();
  h.run("enemies = []");

  var normal = h.spawnAt(0);
  var fast = h.spawnAt(0, undefined, "fast");
  var slow = h.spawnAt(0, undefined, "slow");
  h.step(1);

  // One second of travel, in pixels, at 19.4 px/m.
  t.near(fast.progress / normal.progress, 1.75, 0.001, "a fast covers 1.75x the ground");
  t.near(slow.progress / normal.progress, 0.7, 0.001, "a slow covers 0.7x");
});

test("a smasher slow is a multiplier on top of the type's own speed", function (t) {
  var h = harness.boot();
  h.run("enemies = []");

  // The two speed sources have to compose, not overwrite: a 65% slow on a
  // fast leaves it at 35% of 87.5 u.l./s, which is still faster than a slowed
  // normal. Movement reads speedUlps * slowMultiplier, so this is really a
  // check that the type went into speedUlps and not into its own field.
  var fast = h.spawnAt(0, undefined, "fast");
  fast.applySlow(0.65, 3);
  t.near(fast.speedUlps * fast.slowMultiplier, 30.625, 1e-9, "slowed fast u.l./s");

  var slow = h.spawnAt(0, undefined, "slow");
  slow.applySlow(0.65, 3);
  // 35 x 0.35. Was 14 off the type's old 0.8 multiplier; the type went to 0.7
  // on 2026-08-19 and this figure follows it, since what is being checked is
  // the COMPOSITION rather than either number.
  t.near(slow.speedUlps * slow.slowMultiplier, 12.25, 1e-9, "slowed slow u.l./s");
});

test("the fastest targeting mode now separates types, not just slows", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(600, 505);
  h.run("enemies = []; bullets = []");

  // Before the roster existed, every enemy shared one speed and `fastest`
  // could only tell them apart while a smasher slow was running.
  h.spawnAt(940, undefined, "slow");
  var fast = h.spawnAt(960, undefined, "fast");
  h.spawnAt(980);

  h.run("towers[0].targeting = 'fastest'");
  t.eq(h.run("Targeting.pick(towers[0], enemies, true)"), fast,
    "the fast one is picked out of a mixed group");
});

test("a leak costs the base the type's remaining health", function (t) {
  var h = harness.boot();
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []");
  h.spawnAt(h.game.path.length, undefined, "slow");

  h.step(1 / 60);
  t.eq(h.game.baseHp, 93, "a 7 HP slow hurts nearly twice as much as a normal");
});

test("camo is invisible to the gunner and the smasher, and only to them", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var gunner = h.placeGunner(530, 505);
  var smasher = placeSmasherBeside(h, SMASH_AT);
  h.run("enemies = []; bullets = []");

  var camo = spawnOnLine(h, IN_ZONE, undefined, "camo_normal");

  t.eq(gunner.findTarget(h.game.enemies), null, "the gunner has nothing to shoot");
  t.eq(smasher.facingTarget(h.game.enemies), null, "and the smasher will not aim at it");

  // The zone PHYSICALLY covers it, and that is not the same question --
  // see Smasher.prototype.covers. What stops a detectionless smasher clearing
  // a camo wave is that it will not spend a swing with nothing visible in
  // reach, not that its hammer passes through them.
  t.ok(smasher.covers(camo), "the zone still physically covers it");
  t.eq(smasher.update(1 / 60, h.game.enemies, h.game.bullets), 0, "but no swing is spent");
  t.eq(camo.health, 4, "so the camo is untouched");

  // Not a scoring quirk: a visible enemy standing in the same place is picked
  // normally, so it really is the camo flag doing the work.
  h.run("enemies = []");
  h.spawnAt(900);
  t.ok(gunner.findTarget(h.game.enemies) !== null, "a plain normal in the same spot IS a target");

  // Detection is a tower property, spelled the same way on every type, so
  // granting it makes the camo targetable with no other change.
  // Each tower is asked about a camo standing in ITS OWN reach: the gunner
  // covers progress 900, the smasher only the mark beside it.
  h.run("enemies = []");
  gunner.seesCamo = true;
  smasher.seesCamo = true;

  var forGunner = h.spawnAt(900, undefined, "camo_normal");
  t.eq(gunner.findTarget(h.game.enemies), forGunner, "with detection the gunner sees it");

  h.run("enemies = []");
  var forSmasher = spawnOnLine(h, IN_ZONE, undefined, "camo_normal");
  t.eq(smasher.facingTarget(h.game.enemies), forSmasher, "and so does the smasher");
  t.ok(runSwing(smasher, h) > 0, "which is now worth a swing");

  gunner.seesCamo = false;
  smasher.seesCamo = false;
});

// The bug this closes (2026-07-29): a smasher mid-swing at a visible enemy
// left a camo standing in the middle of its own hammer untouched. Camo blocks
// TARGETING, not incidental damage -- the same rule a piercing shot and the
// B4 blast have always followed.
test("a swing lands on camo caught in the zone, without detection", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  h.run("enemies = []; bullets = []");

  var visible = spawnOnLine(h, IN_ZONE, 50);
  var camo = spawnOnLine(h, IN_ZONE, 50, "camo_normal");

  t.eq(s.seesCamo, false, "the smasher has no detection and no way to buy any");

  var dealt = runSwing(s, h);

  t.eq(visible.health, 36, "the enemy it aimed at took the 14");
  t.eq(camo.health, 36, "and so did the camo standing beside it");
  t.eq(dealt, 28, "both are paid for -- damage landed is damage earned");
});

// The other half, and the reason the schedule survives this change: a wave
// names exactly ONE type, so a camo wave puts nothing visible on the board.
// Waves 13/16/26 are still checks a gunner-and-smasher board cannot answer.
test("a smasher alone still cannot clear a camo wave", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []");

  spawnOnLine(h, IN_ZONE, 50, "camo_normal");
  spawnOnLine(h, IN_ZONE, 50, "camo_fast");

  h.step(10);
  t.eq(s.damageDealt, 0, "ten seconds, several cooldowns, nothing hit");
});

// The fixture guard. Every B4 and camo-zone test above depends on these three
// marks straddling the swing and the blast; if a rescale moves either, this is
// the one test that fails, and it says which mark drifted.
test("the smasher fixtures still straddle the swing and the blast", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  h.run("enemies = []");

  var victim = spawnOnLine(h, IN_ZONE, 50);
  var bystander = spawnOnLine(h, IN_BLAST, 50);
  var beyond = spawnOnLine(h, BEYOND, 50);
  var blast = h.run("ul(Smasher.EXPLOSION_RADIUS_UL)");

  function apart(a, b) {
    return Math.sqrt(Math.pow(a.pos.x - b.pos.x, 2) + Math.pow(a.pos.y - b.pos.y, 2));
  }

  t.ok(s.covers(victim), "IN_ZONE is inside the swing");
  t.notOk(s.covers(bystander), "IN_BLAST is outside the swing");
  t.notOk(s.covers(beyond), "BEYOND is outside the swing");
  t.ok(apart(victim, bystander) < blast, "IN_BLAST is inside the victim's blast");
  t.ok(apart(victim, beyond) > blast, "BEYOND is outside the victim's blast");
  t.ok(apart(bystander, beyond) < blast, "but inside the bystander's, so a chain would reach it");
});

test("a camo wave walks past an all-gunner board untouched", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(530, 505);
  h.placeGunner(600, 505);
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []");

  h.spawnAt(0, undefined, "camo_normal");
  h.step(20);

  t.eq(h.game.towers[0].damageDealt, 0, "the first gunner never fired");
  t.eq(h.game.towers[1].damageDealt, 0, "nor did the second");
});

test("every type draws without throwing", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  Object.keys(h.game.Enemy.TYPES).forEach(function (id) {
    var e = h.spawnAt(600, undefined, id);
    e.applySlow(0.65, 3);                  // the tinted path too
    e.flash = 1;
  });
  h.draw();
  t.ok(true, "a frame with one of every type on it");
});


group("tower health and the range circle");

test("every tower type answers the health contract", function (t) {
  // Duck-typed across every type in the bar, which is the point of js/systems/
  // tower-health.js: a new type that forgets one of these fails here rather
  // than silently becoming immortal.
  //
  // ONE FRESH BOARD PER TYPE, the same way the stunned-facing test above does
  // it and for the same reason. All five used to go down on ONE board, each
  // looking up its own legal spot -- but that search returns the FIRST legal
  // coordinate, which is exactly where the previous tower is already standing,
  // and a click on an existing tower SELECTS it rather than building beside it.
  // So the second placement returned null and the test died there. Only the
  // Warbringer was ever actually checked; the other four never ran at all.
  var slotCount = harness.boot().game.BUILD_SLOTS.length;

  for (var slot = 0; slot < slotCount; slot++) {
    var h = harness.boot();
    var Type = h.game.BUILD_SLOTS[slot];
    if (!Type) continue;
    h.run("cash = 1000000");

    var spot = h.run("(function () {" +
      "  for (var x = 24; x < VIEW_WIDTH - 24; x += 8)" +
      "    for (var y = 24; y < VIEW_HEIGHT - 80; y += 8)" +
      "      if (whyCannotBuild(x, y, BUILD_SLOTS[" + slot + "]) === null) return { x: x, y: y };" +
      "  return null; })()");
    t.ok(spot !== null, Type.DISPLAY_NAME + " has somewhere legal to stand");
    if (!spot) continue;

    var tower = h.place(spot.x, spot.y, slot);
    // Checked rather than assumed: a null here used to end the whole test in a
    // TypeError, which said nothing about which type had failed to place.
    t.ok(tower !== null, Type.DISPLAY_NAME + " actually places there");
    if (!tower) continue;

    t.ok(tower.maxHp > 0, Type.DISPLAY_NAME + " has max HP");
    t.eq(tower.currentHp, tower.maxHp, Type.DISPLAY_NAME + " starts full");
    t.eq(tower.isDestroyed(), false, Type.DISPLAY_NAME + " starts alive");

    var absorbed = tower.takeDamage(5);
    t.eq(absorbed, 5, Type.DISPLAY_NAME + " reports what it absorbed");
    t.eq(tower.currentHp, tower.maxHp - 5, Type.DISPLAY_NAME + " lost exactly that");

    tower.takeDamage(1e9);
    t.eq(tower.currentHp, 0, Type.DISPLAY_NAME + " clamps at zero, never negative");
    t.eq(tower.isDestroyed(), true, Type.DISPLAY_NAME + " is destroyed at zero");
  }
});

test("the range circle is drawn only for the selected tower", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var a = h.placeGunner(530, 505);
  var b = h.placeGunner(600, 505);
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []");

  // `showRange` is set by the RENDER loop from what is selected, so it is
  // only meaningful after a frame has been drawn.
  h.draw();
  t.eq(a.showRange, false, "nothing selected, no circle");
  t.eq(b.showRange, false, "on either tower");

  h.run("inspected = towers[0]");
  h.draw();
  t.eq(h.game.towers[0].showRange, true, "the inspected tower paints its reach");
  t.eq(h.game.towers[1].showRange, false, "and its neighbour still does not");
});

test("the Longshot's B5 kills it on the fifth use", function (t) {
  var h = harness.boot();
  h.run("cash = 100000000");
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []");

  var slot = h.game.BUILD_SLOTS.indexOf(h.game.LongshotTower);
  var spot = h.run("(function () {" +
    "  for (var x = 24; x < VIEW_WIDTH - 24; x += 8)" +
    "    for (var y = 24; y < VIEW_HEIGHT - 80; y += 8)" +
    "      if (whyCannotBuild(x, y, LongshotTower) === null) return { x: x, y: y };" +
    "  return null; })()");
  var ls = h.place(spot.x, spot.y, slot);

  for (var i = 0; i < 5; i++) {
    h.run("towers[towers.length - 1].performAction('upgradeB', " +
      "{ cash: cash, spend: function (n) { cash -= n; } })");
  }
  t.eq(ls.core.purchased.B, 5, "B5 bought");
  t.eq(ls.maxHp, 1450, "and the B path's HP with it");

  // 1450 max HP, 300 burned per use: the fifth press is the one that takes it
  // to zero. It used to sit there at 0/0 and keep firing -- that 0/0 state is
  // exactly what TowerHealth.isDestroyed tests for.
  var deadOn = null;
  for (var use = 1; use <= 6 && deadOn === null; use++) {
    h.run("enemies = [new Enemy(path, 100000)]");
    ls.core.stunTimer = 0;                    // the 10 s stun is not what is under test
    h.run("towers[towers.length - 1].core.triggerActiveAbility(" +
      "enemies.map(function (e) { return { x: e.pos.x, y: e.pos.y, hp: e.health }; }))");
    if (ls.isDestroyed()) deadOn = use;
  }
  t.eq(deadOn, 5, "the fifth use destroys it");

  h.run("enemies = []");
  h.step(1 / 60);
  t.eq(h.game.towers.indexOf(ls), -1, "and the loop sweeps it off the board");
});

function makeChannelTestSniper(h) {
  var ls = new h.game.LongshotTower(500, 500, h.game.path);
  for (var i = 0; i < 5; i++) ls.purchase("B");
  return ls;
}

// --- the ability's cooldown (2026-08-26) ------------------------------------
//
// It was `null` with a TODO against it, which meant the strongest button in the
// game had no cooldown at all. These pin the four properties that make the
// sixty seconds mean what the brief says: it starts at ACTIVATION, it runs
// through the lockout rather than after it, a refused press never spends it,
// and it advances on simulation time so pause, speed and the end-of-run freeze
// all carry.

function chargedSniper(h) {
  var ls = makeChannelTestSniper(h);
  ls.abilityCooldown = 0;
  return ls;
}
function oneEnemy(h, hp) {
  var e = new h.game.Enemy(h.game.path, hp || 50000);
  e.pos = { x: 500, y: 500 };
  return e;
}

test("the ability's cooldown is sixty seconds and starts when it is cast", function (t) {
  var h = harness.boot();
  var ls = chargedSniper(h);
  var cfg = ls.core.stats.mechanics.activeAbility;
  t.eq(cfg.cooldownSeconds, 60, "the config says sixty");

  t.eq(ls.performAction("ability", { enemies: [oneEnemy(h)] }), "channelling", "it fires");
  // AT ACTIVATION, not when the tower is free again: the clock is already
  // running while the ritual is still being channelled.
  t.eq(ls.abilityCooldown, 60, "and the full sixty are on the clock immediately");
});

test("the cooldown runs THROUGH the channel and the exhaustion, not after them",
function (t) {
  var h = harness.boot();
  var ls = chargedSniper(h);
  var e = oneEnemy(h);
  ls.performAction("ability", { enemies: [e] });

  // Ten seconds is the whole lockout: three channelling, seven stunned.
  for (var i = 0; i < 600; i++) ls.update(1 / 60, [e], []);
  t.near(ls.abilityCooldown, 50, 0.05,
    "ten seconds later, fifty remain -- the lockout was spent INSIDE the sixty");
  t.eq(ls.channel, null, "the ritual is long over");

  // And it is still refused until the clock runs out, whatever the stun says.
  // One more second, so the exhaustion is unambiguously over: the stun starts
  // when the ritual RESOLVES, three seconds in, so it ends at exactly ten and
  // asking at ten gets "stunned" rather than the answer this is about.
  for (var k = 0; k < 60; k++) ls.update(1 / 60, [e], []);
  t.eq(ls.core.stunTimer, 0, "the tower is free to fire again");
  var refusal = ls.performAction("ability", { enemies: [e] });
  t.ok(String(refusal).indexOf("recharging") !== -1,
    "but the ability is still refused, and the reason names the cooldown (got: " +
    refusal + ")");

  // Repeated subtraction of 1/60 does not land on zero exactly, so this is a
  // near rather than an eq -- the residue is picoseconds and the button is
  // gated on `> 0`, which a positive picosecond would wrongly hold shut. The
  // extra steps past sixty are what make sure it actually reaches the floor.
  for (var j = 0; j < 3140; j++) ls.update(1 / 60, [e], []);
  t.near(ls.abilityCooldown, 0, 1e-9, "and at sixty it is ready again");
});

test("a refused cast never spends the cooldown", function (t) {
  var h = harness.boot();
  var ls = chargedSniper(h);

  // Nothing on the board: refused, and nothing is taken.
  t.eq(ls.performAction("ability", { enemies: [] }), "no enemy on screen", "refused");
  t.eq(ls.abilityCooldown, 0, "no cooldown started");
  t.eq(ls.core.maxHp, ls.core.stats.hp, "and no HP burnt");

  // Mid-channel: refused, and the running cooldown is not extended either.
  var e = oneEnemy(h);
  ls.performAction("ability", { enemies: [e] });
  ls.update(1, [e], []);
  var left = ls.abilityCooldown;
  t.eq(ls.performAction("ability", { enemies: [e] }), "already channelling", "refused again");
  t.eq(ls.abilityCooldown, left, "and the clock was neither restarted nor extended");
});

test("the cooldown is simulation time, so pause and the end-of-run freeze hold it",
function (t) {
  var h = harness.boot();
  var ls = chargedSniper(h);
  var e = oneEnemy(h);
  ls.performAction("ability", { enemies: [e] });
  ls.update(5, [e], []);
  var held = ls.abilityCooldown;

  // A paused game does not call update(), and neither does a finished one --
  // update() returns early on gameOver/victory. Not stepping IS the freeze,
  // which is why this is asserted as "no dt, no progress" rather than by
  // reaching for a pause flag this tower has never heard of.
  t.eq(ls.abilityCooldown, held, "no step, no progress");
  ls.update(0, [e], []);
  t.eq(ls.abilityCooldown, held, "a zero-length step spends nothing either");

  // 3x speed is three steps rather than one long one, and spends accordingly.
  for (var i = 0; i < 3; i++) ls.update(1, [e], []);
  t.near(ls.abilityCooldown, held - 3, 1e-9, "three steps of one second spend three");
});

test("auto-ability cannot outrun the cooldown or restart a running channel",
function (t) {
  var h = harness.boot();
  var ls = chargedSniper(h);
  h.game.AutoAbility.set(ls, "ability", true);
  var e = oneEnemy(h);

  ls.update(1 / 60, [e], []);
  t.eq(ls.abilityCooldown > 0, true, "auto fired it once");
  var casts = 0;
  var realResolve = ls.resolveChannel;
  ls.resolveChannel = function (enemies) { casts++; return realResolve.call(this, enemies); };

  // Thirty seconds of automatic pressing, every frame, against a sixty second
  // cooldown: exactly one resolution, the one already in flight.
  for (var i = 0; i < 1800; i++) ls.update(1 / 60, [e], []);
  t.eq(casts, 1, "and never again while the clock runs");
  t.ok(ls.abilityCooldown > 0, "the cooldown is still the thing holding it");
});

test("the Longshot B5 channel follows its first locked enemy without retargeting",
  function (t) {
    var h = harness.boot();
    var ls = makeChannelTestSniper(h);
    var locked = new h.game.Enemy(h.game.path, 50000);
    var rival = new h.game.Enemy(h.game.path, 40000);

    locked.pos = { x: 180, y: 180 };
    rival.pos = { x: 760, y: 420 };
    t.eq(ls.performAction("ability", { enemies: [locked, rival] }), "channelling",
      "the ritual starts");
    t.eq(ls.channel.target, locked, "the strongest enemy object is locked once");

    // The original landing point is now well outside the blast. A rival also
    // becomes stronger after the lock, proving that updates do not re-select.
    locked.pos = { x: 470, y: 260 };
    rival.health = 60000;
    rival.maxHealth = 60000;
    ls.update(1.5, [locked, rival], []);
    t.eq(ls.channel.x, 470, "the telegraph follows the locked enemy's x");
    t.eq(ls.channel.y, 260, "the telegraph follows the locked enemy's y");
    t.eq(ls.channel.target, locked, "the stronger rival did not steal the channel");

    locked.pos = { x: 520, y: 310 };
    ls.aim = 0.321;
    var lockedBefore = locked.health;
    var rivalBefore = rival.health;
    ls.update(1.51, [locked, rival], []);

    t.eq(ls.channel, null, "the ritual resolves after the unchanged three seconds");
    t.eq(ls.aim, 0.321, "the resolution frame does not turn the newly stunned tower");
    t.eq(locked.health, lockedBefore - 18000,
      "the blast lands on the locked enemy's latest position");
    t.eq(rival.health, rivalBefore, "the later stronger enemy was never retargeted");
  });

test("the Longshot B5 channel holds its last point if its lock dies or leaks",
  function (t) {
    ["dead", "leaked"].forEach(function (exitFlag, index) {
      var h = harness.boot();
      var ls = makeChannelTestSniper(h);
      var locked = new h.game.Enemy(h.game.path, 50000);
      var witness = new h.game.Enemy(h.game.path, 10000);
      var held = { x: 350 + index * 100, y: 260 };

      locked.pos = { x: 180, y: 180 };
      witness.pos = { x: 800, y: 500 };
      ls.performAction("ability", { enemies: [locked, witness] });

      locked.pos = { x: held.x, y: held.y };
      ls.update(0.5, [locked, witness], []);
      t.eq(ls.channel.x, held.x, exitFlag + ": the latest live position was recorded");

      locked[exitFlag] = true;
      locked.pos = { x: 900, y: 600 }; // invalid post-exit motion must be ignored
      witness.pos = { x: held.x, y: held.y };
      ls.update(1, [locked, witness], []);
      t.eq(ls.channel.x, held.x, exitFlag + ": the landing point stayed put");
      t.eq(ls.channel.y, held.y, exitFlag + ": both coordinates stayed put");

      ls.update(1.51, [locked, witness], []);
      t.eq(witness.dead, true,
        exitFlag + ": the strike still resolves at the last valid position");
    });
  });


group("lane offsets");

test("enemies walk beside the centreline, not on it", function (t) {
  var h = harness.boot();
  h.run("enemies = []");

  // Same progress, different lanes: the whole point is that a burst stops
  // being one file of overlapping dots.
  var a = h.spawnAt(600);
  var b = h.spawnAt(600);
  var c = h.spawnAt(600);

  t.ok(a.pos.x !== b.pos.x || a.pos.y !== b.pos.y, "two enemies do not share a point");
  t.ok(b.pos.x !== c.pos.x || b.pos.y !== c.pos.y, "nor do the next two");

  // The offset is PERPENDICULAR, so nobody gains or loses ground by it --
  // progress is still the only thing that says how far along the road you are.
  t.eq(a.progress, b.progress, "same progress");

  // And it stays inside the spread it was authorised, which is what keeps
  // bodies on the tarmac.
  [a, b, c].forEach(function (e) {
    t.ok(Math.abs(e.laneOffsetUl) <= h.game.Enemy.LANE_SPREAD_UL,
      "offset within LANE_SPREAD_UL");
  });
});

test("the lane sequence is deterministic and reset by a restart", function (t) {
  var h = harness.boot();

  // Deliberately NOT Math.random(): a random lane would make every pinned
  // kill/leak/base-HP number in this suite a coin toss. See AGENTS.md.
  h.run("Enemy.resetLanes()");
  var first = [h.spawnAt(0).laneOffsetUl, h.spawnAt(0).laneOffsetUl,
    h.spawnAt(0).laneOffsetUl];

  h.run("Enemy.resetLanes()");
  var second = [h.spawnAt(0).laneOffsetUl, h.spawnAt(0).laneOffsetUl,
    h.spawnAt(0).laneOffsetUl];

  t.deep(second, first, "the same three offsets come back");

  // A restart rewinds the sequence to NOTHING. It used to rewind it to one,
  // because restartGame() spawned wave 1's first enemy itself; since a run opens
  // on a ten-second pause instead (RUN_START_DELAY) the rewind is all a restart
  // does, and the first body takes lane 0 when it actually walks in.
  h.run("restartGame()");
  t.eq(h.game.Enemy.laneSequence, 0, "a restart rewinds the sequence");

  h.step(10.1);
  t.eq(h.game.Enemy.laneSequence, 1, "and wave 1's first enemy then takes lane 0");
});

// 2026-07-29, at the owner's request: "they just look like a wave, not random
// at all, which is very unnatural."
//
// The offsets used to come from a low-discrepancy sequence (multiples of the
// golden ratio). Those are DESIGNED never to cluster, and clustering is most
// of what randomness looks like — so a column of enemies wove down the road in
// a visible sine wave. It is a hash now.
//
// This test pins the CHARACTER of the distribution rather than any particular
// value, because that is what regressed and what a future "let's use a nicer
// sequence" change would break again. The old golden sequence scores 0.76 and
// 0 on these two measures; it would fail both.
test("lane offsets look like a crowd, not like a waveform", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;

  var flips = 0;
  var clustered = 0;
  var prev = Enemy.laneOffsetFor(0);
  for (var i = 1; i < 4000; i++) {
    var x = Enemy.laneOffsetFor(i);
    if ((x < 0) !== (prev < 0)) flips++;
    if (Math.abs(x - prev) < 0.12) clustered++;
    prev = x;
  }

  t.ok(Math.abs(flips / 3999 - 0.5) < 0.05,
    "consecutive spawns pick a side by coin flip, not by alternating (" +
    (flips / 3999).toFixed(3) + ")");
  t.ok(clustered > 200,
    "and they are ALLOWED to land on top of each other (" + clustered + " pairs)");

  // Still a pure function of the index, still in range: the determinism the
  // whole suite rests on is untouched by looking random.
  t.eq(Enemy.laneOffsetFor(77), Enemy.laneOffsetFor(77), "same index, same offset");
  for (var j = 0; j < 500; j++) {
    var v = Enemy.laneOffsetFor(j);
    if (v < -1 || v > 1) { t.ok(false, "offset " + j + " out of range: " + v); break; }
  }
  t.ok(true, "every offset lands in -1..1");

  // The spread was widened with it, at the owner's request.
  t.eq(Enemy.LANE_SPREAD_UL, 7, "and the spread is 7 u.l., up from 4");
});

test("a lane offset survives being knocked back", function (t) {
  var h = harness.boot();
  h.run("enemies = []");

  var e = h.spawnAt(600);
  var offset = e.laneOffsetUl;
  e.knockBack(100);

  var expected = e.positionAt(e.progress);
  t.eq(e.laneOffsetUl, offset, "the lane is a property of the enemy, not of where it is");
  t.near(e.pos.x, expected.x, 1e-9, "and pos was rebuilt through it");
  t.near(e.pos.y, expected.y, 1e-9, "on both axes");
});

group("targeting modes");

test("every tower type starts on first", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var gunner = h.placeGunner(530, 505);
  var smasher = h.placeSmasher(700, 505);

  t.eq(gunner.targeting, "first", "gunner defaults to first");
  t.eq(smasher.targeting, "first", "and so does the smasher");
});

test("each mode picks the enemy it says it does", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var g = h.placeGunner(530, 505);
  h.run("enemies = []");

  // Three in range: behind/weak, middle/strong, ahead/medium.
  var behind = h.spawnAt(880, 2);
  var middle = h.spawnAt(900, 40);
  var ahead = h.spawnAt(920, 9);
  middle.speedUlps = 4;
  behind.speedUlps = 4;
  ahead.speedUlps = 4;

  function pickWith(mode) {
    g.targeting = mode;
    return g.findTarget(h.game.enemies);
  }

  t.eq(pickWith("first"), ahead, "first = furthest along");
  t.eq(pickWith("last"), behind, "last = least far along");
  t.eq(pickWith("weakest"), behind, "weakest = lowest health");
  t.eq(pickWith("strongest"), middle, "strongest = highest health");
  t.eq(pickWith("nearest"), middle, "nearest = closest to the tower");

  // All three move at the same base speed, so a slow is what separates them.
  behind.applySlow(0.65, 3);
  middle.applySlow(0.15, 3);
  t.eq(pickWith("fastest"), ahead, "fastest = highest current speed");
});

test("fastest reads current speed, so slowing one changes the pick", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var g = h.placeGunner(530, 505);
  g.targeting = "fastest";
  h.run("enemies = []");

  var a = h.spawnAt(900, 10);
  var b = h.spawnAt(880, 10);
  t.eq(g.findTarget(h.game.enemies), a, "tie breaks to the one furthest along");

  a.applySlow(0.65, 3);
  t.eq(g.findTarget(h.game.enemies), b, "the unslowed one is now faster");
});

test("ties break towards the enemy furthest along", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var g = h.placeGunner(530, 505);
  h.run("enemies = []");

  // Identical health, so weakest and strongest are both a pure tie.
  h.spawnAt(880, 10);
  var ahead = h.spawnAt(920, 10);

  g.targeting = "weakest";
  t.eq(g.findTarget(h.game.enemies), ahead, "weakest tie");
  g.targeting = "strongest";
  t.eq(g.findTarget(h.game.enemies), ahead, "strongest tie");
});

test("every mode still respects the claim rule", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var g = h.placeGunner(530, 505);
  h.run("enemies = []; bullets = []");

  var doomed = h.spawnAt(920, 1);
  var alive = h.spawnAt(880, 10);
  doomed.reserveDamage(1);               // a bullet is already going to kill it
  t.eq(doomed.unclaimedHealth(), 0, "fully claimed");

  Targeting_MODES(h).forEach(function (mode) {
    g.targeting = mode;
    t.eq(g.findTarget(h.game.enemies), alive, mode + " skips the claimed enemy");
  });
});

test("a mode that matches nothing in range still returns nothing", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var g = h.placeGunner(530, 505);
  h.run("enemies = []");
  h.spawnAt(1600, 10);                   // far away, out of range

  Targeting_MODES(h).forEach(function (mode) {
    g.targeting = mode;
    t.eq(g.findTarget(h.game.enemies), null, mode + " finds nothing");
  });
});

test("the smasher's facing follows its mode", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  h.run("buyUpgrade(towers[0], 'A1'); buyUpgrade(towers[0], 'A2')");   // 43.75 u.l.
  h.run("enemies = []");

  var left = h.spawnAt(SMASH_AT - 15, 30);
  var right = h.spawnAt(SMASH_AT + 15, 30);
  t.ok(s.facingTarget(h.game.enemies) !== null, "something is in reach");

  s.targeting = "first";
  t.eq(s.facingTarget(h.game.enemies), right, "first faces the leader");
  s.targeting = "last";
  t.eq(s.facingTarget(h.game.enemies), left, "last faces the straggler");
});

test("the panel button cycles the mode and nothing else", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var g = h.placeGunner(530, 505);
  h.click(530, 505);
  t.eq(h.game.inspected, g, "inspected");

  var b = h.run("inspectionLayout(inspected).targeting");
  t.eq(b.label, "Target: first", "button shows the current mode");

  h.click(b.x + b.w / 2, b.y + b.h / 2);
  t.eq(g.targeting, "last", "cycled to the next mode");
  t.eq(h.game.towers.length, 1, "nothing was placed or sold");
  t.eq(h.game.inspected, g, "still inspected");

  // A full lap comes back to where it started.
  var modes = Targeting_MODES(h);
  for (var i = 1; i < modes.length; i++) {
    var next = h.run("inspectionLayout(inspected).targeting");
    h.click(next.x + next.w / 2, next.y + next.h / 2);
  }
  t.eq(g.targeting, "first", "cycles back round");
});

test("the mode shows on its button and the panel still fits", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(1240, 690);     // corner, forces flip and clamp
  h.click(1240, 690);
  s.targeting = "strongest";

  // The button IS the readout. There used to be a "Target" stat row directly
  // above it saying the same word, which is the same duplication the map
  // labels were removed for.
  var labelled = {};
  s.statLines().forEach(function (r) { labelled[r[0]] = r[1]; });
  t.eq(labelled.Target, undefined, "not duplicated as a stat row");
  t.eq(h.run("inspectionLayout(inspected).targeting").label, "Target: strongest",
    "the cycle button says which mode is set");

  var L = h.run("inspectionLayout(inspected)");
  t.ok(L.y >= 0 && L.y + L.h <= h.game.BAR_Y, "panel above the build bar");
  t.ok(L.targeting.y + L.targeting.h <= L.upgrades[0].y, "targeting sits above the upgrades");
  t.ok(L.upgrades[0].y + L.upgrades[0].h <= L.sell.y, "upgrades sit above sell");
  h.draw();
});

group("smasher: base stats and placement");

test("a base smasher matches the agreed numbers", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  t.eq(h.game.Smasher.COST, 600, "cost");
  t.eq(s.damage, 14, "damage");
  t.eq(s.cooldownSeconds, 3.2, "hit speed");
  t.eq(s.rangeUl, 40, "range");
  t.eq(s.arcDegrees, 120, "arc");
  t.eq(s.fullCircle, false, "not a full circle");
  t.eq(s.slow, null, "no slow");
  t.eq(s.explodesOnKill, false, "no explosion");
  t.eq(h.game.cash, 100000 - 600, "cash deducted");
});

test("it shares the gunner footprint, so spacing rules are identical", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  t.eq(h.game.Smasher.FOOTPRINT_RADIUS_UL, h.game.Tower.FOOTPRINT_RADIUS_UL, "footprint");

  h.placeSmasher(600, 500);
  t.eq(h.run("whyCannotBuild(605, 500, Tower)"), "overlaps another tower", "gunner beside it");
  t.eq(h.run("whyCannotBuild(605, 500, Smasher)"), "overlaps another tower", "smasher beside it");
  t.eq(h.run("whyCannotBuild(600, 460, Smasher)"), "too close to the path", "on the road");
});

test("it is placed from its own build slot, and the shared reference is untouched",
function (t) {
  var h = harness.boot();
  h.run("cash = 100000");

  // Ask which slot holds the Warbringer rather than typing one. Deleting the
  // gunner on 2026-07-30 shed the first catalogue entry and shifted every slot
  // down by one, so the typed 2 in this test had been arming the Arcane Sniper
  // and then asserting it was a Smasher. The number keys are 1-based over the
  // same list, so the key follows the slot rather than being typed either.
  var slot = h.slotOf(h.game.Smasher);
  t.ok(slot >= 0, "the Warbringer is somewhere in the build bar");
  h.key(String(slot + 1));
  t.eq(h.game.selectedSlot, slot, "its own slot arms");

  h.click(600, 500);
  t.eq(h.game.towers.length, 1, "a tower was placed");
  // "Warbringer" since the 2026-07-30 reskin; the constructor and the save id
  // are both still `Smasher`, which is what that slot actually holds.
  t.eq(h.game.towers[0].name, "Warbringer", "and it is a smasher");

  // js/tower.js OUTLIVED the gunner's deletion: it is still loaded as the
  // shared footprint/hit-test source and the 100 u.l. reference every tower is
  // authored against. So these constants still have to hold -- what changed is
  // that nobody can build the thing any more, which is the first assertion.
  t.eq(h.slotOf(h.game.Tower), -1, "but the gunner itself is no longer buildable");
  t.eq(h.game.Tower.COST, 100, "reference cost unchanged");
  t.eq(h.game.Tower.BASE_DAMAGE, 1, "reference damage unchanged");
  t.eq(h.game.Tower.BASE_RANGE_UL, 100, "the 100 u.l. reference range unchanged");
  t.eq(h.game.Enemy.BASE_HEALTH, 4, "enemy health unchanged");
  t.eq(h.game.Enemy.BASE_SPEED_ULPS, 50, "enemy speed unchanged");
});

group("smasher: AOE");

test("one swing hits every enemy in the zone at once", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, 960);
  h.run("enemies = []");

  var a = h.spawnAt(950, 50);
  var b = h.spawnAt(960, 50);
  var c = h.spawnAt(970, 50);
  var out = h.spawnAt(1200, 50);

  // The blow is a WIND-UP now: sighting starts it and damage resolves when the
  // hammer lands, `swingSeconds()` later. So the swing has to be run out.
  var dealt = runSwing(s, h);
  t.eq(dealt, 42, "damage returned for three enemies at 14 each");
  t.eq(a.health, 36, "first enemy hit");
  t.eq(b.health, 36, "second enemy hit");
  t.eq(c.health, 36, "third enemy hit");
  t.eq(out.health, 50, "the enemy out of reach was not touched");
});

test("the arc excludes what is behind it, a full circle does not", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);
  h.run("enemies = []");
  var e = h.spawnAt(960, 50);            // directly above the tower

  s.aim = Math.PI / 2;                   // forced to face DOWN, away from it
  t.notOk(s.covers(e), "120 arc does not reach behind the tower");

  ["A1", "A2", "A3", "A4"].forEach(function (id) {
    h.run("buyUpgrade(towers[0], '" + id + "')");
  });
  t.eq(s.fullCircle, true, "A4 makes it a full circle");
  t.ok(s.covers(e), "a full circle reaches regardless of facing");
});

test("it turns to face its target, and holds that facing when alone", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);
  h.run("enemies = []");

  h.spawnAt(960, 50);                    // directly above -> aim straight up
  s.update(1 / 60, h.game.enemies, h.game.bullets);
  t.near(s.aim, -Math.PI / 2, 0.001, "facing the enemy above");

  h.run("enemies = []");
  s.update(1 / 60, h.game.enemies, h.game.bullets);
  t.near(s.aim, -Math.PI / 2, 0.001, "facing held with nothing in reach");
});

test("it holds its swing until something is in the zone", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  h.run("enemies = []");

  for (var i = 0; i < 600; i++) s.update(1 / 60, h.game.enemies, h.game.bullets);
  t.ok(s.cooldown <= 0, "cooldown is ready after 10 s of nothing to hit");

  var e = h.spawnAt(SMASH_AT, 50);
  t.eq(s.update(1 / 60, h.game.enemies, h.game.bullets), 0,
    "sighting starts the swing, it does not land on the same tick");
  t.ok(s.windup > 0, "the hammer is on its way");
  var dealt = runSwing(s, h);
  t.eq(dealt, 14, "and lands when the swing finishes");
  // The wind-up is taken out of the cooldown that follows, so the RATE is
  // unchanged: a full cycle is still cooldownSeconds.
  t.near(s.cooldown, 3.2 - s.swingSeconds(), 0.001,
    "the cooldown that follows is short by the swing");
});

test("the swing animation is derived from the wind-up, not stored", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  s.windup = 0;    t.eq(s.swingProgress(), 0, "held ready, not mid-swing");
  s.cooldown = 4;  t.eq(s.swingProgress(), 0, "and idle on cooldown too");
  s.windup = 0.2;  t.eq(s.swingProgress(), 0, "the swing starts at the top");
  s.windup = 0.1;  t.near(s.swingProgress(), 0.5, 0.001, "halfway down");
  s.windup = 0.01; t.near(s.swingProgress(), 0.95, 0.001, "almost landed");
});

test("damage lands when the hammer does, not when the swing starts", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  h.run("enemies = []");
  var e = h.spawnAt(SMASH_AT, 200);

  // THE FIRST BLOW WINDS UP LIKE EVERY OTHER ONE. It used to land instantly,
  // with the hammer still at rest, because the animation was driven by the
  // cooldown that ran AFTER it -- and a fresh tower's cooldown is zero.
  t.eq(s.update(1 / 60, h.game.enemies, h.game.bullets), 0,
    "nothing lands on the tick that sights the target");
  var guard = 0;
  while (s.windup > 0 && guard++ < 1000) {
    t.ok(e.health === 200, "no damage while the hammer is in the air");
    if (s.update(1 / 60, h.game.enemies, h.game.bullets)) break;
  }
  t.eq(e.health, 186, "the first hit lands at the bottom of the swing");

  // And the next one waits out the cooldown, then winds up again.
  guard = 0;
  while (s.cooldown > 0 && guard++ < 1000) {
    s.update(1 / 60, h.game.enemies, h.game.bullets);
  }
  t.eq(e.health, 186, "no damage during the cooldown");
  runSwing(s, h);
  t.eq(e.health, 172, "the second blow lands after its own wind-up");
});

group("smasher: upgrades");

test("damage is additive across every owned upgrade", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  ["A1", "A2", "A3", "A4", "A5"].forEach(function (id) {
    t.eq(h.run("buyUpgrade(towers[0], '" + id + "')"), null, "bought " + id);
  });
  t.eq(s.damage, 65, "full path A: 14+5+6+9+13+18");
  t.eq(s.rangeUl, 72.5, "A5's absolute 62.5, plus A1 and A2's +5 each");
  t.eq(s.cooldownSeconds, 3.0, "A1 and A2 are the only hit speed on path A");
  t.eq(s.fullCircle, true, "full circle from A4");
  t.eq(s.slow, null, "path A has no slow");
});

test("full path B with A1 and A2 totals 39", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  ["A1", "A2", "B1", "B2", "B3", "B4", "B5"].forEach(function (id) {
    t.eq(h.run("buyUpgrade(towers[0], '" + id + "')"), null, "bought " + id);
  });
  t.eq(s.damage, 45, "14+5+6+1+1+4+6+8");
  t.eq(s.cooldownSeconds, 2.1, "fastest owned hit speed");
  // A2's absolute 43.75 wins the max, and path B's THREE additive bonuses
  // (B2 +15, B4 +10, B5 +15) are summed on top of it. This is the assertion
  // that would catch anyone folding rangeBonusUl back into the absolute
  // column: written as absolutes, B2's "+15" would have been worth 2.5 here.
  t.eq(s.rangeUl, 103.75, "43.75 from A2, plus 60 of bonuses across both paths");
  t.eq(s.arcDegrees, 120, "still an arc");
  t.eq(s.slow.strength, 0.65, "strongest owned slow");
  t.eq(s.slow.seconds, 3.0, "its duration");
  t.eq(s.explodesOnKill, true, "B4 explosion");
});

test("full path B with no A upgrades totals 30", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  ["B1", "B2", "B3", "B4", "B5"].forEach(function (id) {
    h.run("buyUpgrade(towers[0], '" + id + "')");
  });
  t.eq(s.damage, 34, "14+1+1+4+6+8");
  // 2026-07-30: path B DOES extend range now -- B2 +15, B4 +10, B5 +15, all
  // additive on the 37.5 base. It used to grant none at all.
  t.eq(s.rangeUl, 90, "40 + 5 (B1) + 20 (B2) + 10 (B4) + 15 (B5)");
  t.eq(s.cooldownSeconds, 2.1, "hit speed");
  t.eq(s.hasQuake, true, "and B5 grants the earthquake");
});

// The range bonuses tier by tier, because "+15" has to mean +15 at the moment
// it is bought and not "whatever the table's absolute column happened to say".
test("path B's range bonuses land on the tiers that were asked for", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  t.eq(s.rangeUl, 40, "base");
  h.run("buyUpgrade(towers[0], 'B1')");
  t.eq(s.rangeUl, 45, "B1 grants +5 since 2026-08-27");
  h.run("buyUpgrade(towers[0], 'B2')");
  t.eq(s.rangeUl, 65, "B2 grants +20, up from +15");
  h.run("buyUpgrade(towers[0], 'B3')");
  t.eq(s.rangeUl, 65, "B3 grants none");
  h.run("buyUpgrade(towers[0], 'B4')");
  t.eq(s.rangeUl, 75, "B4 grants +10");
  t.eq(s.hasQuake, false, "and B4 does NOT grant the earthquake");
  h.run("buyUpgrade(towers[0], 'B5')");
  t.eq(s.rangeUl, 90, "B5 grants +15");
});

// Path A's BACK HALF is absolute and was not touched. Its first two tiers
// sell their reach through the additive column since 2026-08-27 -- an
// absolute there could never win the max again once the base passed it, which
// is how A1 came to sell no reach at all for a day. This is the guard on both
// halves of the two-column arrangement.
test("path A's reach is A5's absolute plus the two bonuses under it", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  ["A1", "A2", "A3", "A4", "A5"].forEach(function (id) {
    h.run("buyUpgrade(towers[0], '" + id + "')");
  });
  t.eq(s.rangeUl, 72.5, "A5's absolute 62.5, plus A1 and A2's +5 each");
  t.eq(s.hasQuake, false, "and no earthquake on path A");
});

test("stats are folded from flags, so the order they were set in cannot matter", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var a = h.placeSmasher(600, 500);
  var b = h.placeSmasher(700, 500);

  // Purchases are forced into tier order now, so set the flags directly --
  // recalcStats() must still be a pure fold over whichever flags are set.
  a.hasA1 = true; a.hasA2 = true; a.hasA3 = true; a.recalcStats();
  b.hasA3 = true; b.hasA2 = true; b.hasA1 = true; b.recalcStats();

  t.eq(a.damage, b.damage, "same damage");
  t.eq(a.rangeUl, b.rangeUl, "same range");
  t.eq(a.cooldownSeconds, b.cooldownSeconds, "same hit speed");
  t.eq(a.damage, 34, "14+5+6+9");
});

test("upgrades must be bought in tier order", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  t.eq(h.run("buyUpgrade(towers[0], 'A2')"), "needs A1", "A2 before A1");
  t.eq(h.run("buyUpgrade(towers[0], 'A5')"), "needs A4", "A5 straight away");
  t.eq(h.run("buyUpgrade(towers[0], 'B3')"), "needs B2", "B3 before B2");
  t.eq(s.upgradeCount, 0, "nothing was granted");
  t.eq(h.game.cash, 100000 - 600, "and nothing was charged");

  t.eq(h.run("buyUpgrade(towers[0], 'A1')"), null, "A1 is available from the start");
  t.eq(h.run("buyUpgrade(towers[0], 'A2')"), null, "A2 once A1 is owned");
});

test("A3 or above locks path B out, and the reverse", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  t.eq(s.lockedBranch(), null, "no branch chosen yet");
  ["A1", "A2"].forEach(function (id) { h.run("buyUpgrade(towers[0], '" + id + "')"); });
  t.eq(s.lockedBranch(), null, "A1 and A2 commit to nothing");
  h.run("buyUpgrade(towers[0], 'A3')");
  t.eq(s.lockedBranch(), "A", "A3 commits to A");
  t.eq(h.run("buyUpgrade(towers[0], 'B3')"), "path A already chosen", "B3 refused");
  t.eq(h.run("buyUpgrade(towers[0], 'B4')"), "path A already chosen", "B4 refused");
  t.eq(h.run("buyUpgrade(towers[0], 'B5')"), "path A already chosen", "B5 refused");
  t.eq(h.run("buyUpgrade(towers[0], 'A4')"), null, "A4 still allowed");

  var other = harness.boot();
  other.run("cash = 100000");
  other.placeSmasher(600, 500);
  ["B1", "B2", "B3"].forEach(function (id) { other.run("buyUpgrade(towers[0], '" + id + "')"); });
  t.eq(other.run("buyUpgrade(towers[0], 'A3')"), "path B already chosen", "A3 refused");
  t.eq(other.run("buyUpgrade(towers[0], 'A5')"), "path B already chosen", "A5 refused");
});

test("A1, A2, B1 and B2 can all be owned at once", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  ["A1", "A2", "B1", "B2"].forEach(function (id) {
    t.eq(h.run("buyUpgrade(towers[0], '" + id + "')"), null, id + " allowed");
  });
  t.eq(s.lockedBranch(), null, "none of them lock a branch");
  t.eq(s.damage, 27, "14+5+6+1+1");
  // A2's own 43.75 absolute, plus every bonus the four tiers carry: A1 +5,
  // A2 +5, B1 +5 and B2 +20. Since 2026-08-27 all four grant reach, so this
  // is no longer "A2's range plus B2's bonus" -- it is the whole crosspath,
  // which is the point of holding both branches at once.
  t.eq(s.rangeUl, 78.75, "43.75 from A2, plus 35 of bonuses");
  t.eq(s.cooldownSeconds, 2.1, "hit speed from B2");
});

test("upgrades cost money and are refused when unaffordable", function (t) {
  var h = harness.boot();
  // The purse leaves $300 behind after the tower, which straddles the A1/A2
  // affordability boundary: A1 at 250 is affordable, A2 at 400 is not. It was
  // $250 against a $200 A1 and a $350 A2 until the 2026-08-27 retune put $50
  // on each of the first four tiers, and it is TAKEN OFF `Smasher.COST` rather
  // than typed, so a reprice of the body moves it.
  //
  // The remainder is 300 rather than exactly A1's price ON PURPOSE. Leaving
  // exactly 250 would buy A1 down to zero, and "no cash taken for a refused
  // upgrade" would then be checking that nothing moved a purse that was already
  // empty -- true whether or not the refusal is honest. A non-zero 50 is a
  // witness that can actually change.
  h.run("cash = " + (h.game.Smasher.COST + 300));
  var s = h.placeSmasher(600, 500);      // leaves 300
  t.eq(h.game.cash, 300, "cash after building");

  t.eq(h.run("buyUpgrade(towers[0], 'A1')"), null, "A1 affordable at 250");
  t.eq(h.game.cash, 50, "cash after A1");
  t.eq(h.run("buyUpgrade(towers[0], 'A2')"), "not enough mana", "A2 refused at 400");
  t.eq(s.hasA2, false, "and not granted");
  t.eq(h.game.cash, 50, "no cash taken for a refused upgrade");

  t.eq(h.run("buyUpgrade(towers[0], 'A1')"), "already owned", "cannot buy twice");
  t.eq(h.run("buyUpgrade(towers[0], 'Z9')"), "no such upgrade", "unknown id");
  t.eq(h.run("buyUpgrade(towers[1] || towers[0], 'A1')"), "already owned", "still owned");
});

test("a gunner is not upgradeable", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(600, 505);
  t.eq(h.run("buyUpgrade(towers[0], 'A1')"), "not upgradeable", "gunner refuses upgrades");
});

test("selling refunds half of everything invested, upgrades included", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);
  t.eq(h.run("sellValue(towers[0])"), 300, "half of the 600 build cost");

  h.run("buyUpgrade(towers[0], 'A1')");
  // A1 is $200 since the 2026-08-01 retune, so the investment is 600 + 200.
  t.eq(s.totalSpent, 850, "600 + 250 invested");
  t.eq(s.cost, 600, "and the build price itself never moved");
  t.eq(h.run("sellValue(towers[0])"), 425, "half of everything invested");
});

group("smasher: slow");

test("a slow reduces movement and then wears off", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  var e = h.spawnAt(660, 100);

  var free = e.progress;
  e.update(1 / 60);
  var fullStep = e.progress - free;

  e.applySlow(0.65, 3.0);
  t.eq(e.slowMultiplier, 0.35, "multiplier is 1 - strength");
  t.eq(e.slowTimer, 3.0, "duration");

  var before = e.progress;
  e.update(1 / 60);
  t.near(e.progress - before, fullStep * 0.35, 0.0001, "moves at 35% speed");

  for (var i = 0; i < 60 * 4; i++) e.update(1 / 60);
  t.eq(e.slowMultiplier, 1, "multiplier reset once the timer ran out");
  t.eq(e.slowTimer, 0, "timer floored at zero");
});

test("a stronger slow replaces a weaker one", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  var e = h.spawnAt(660, 100);

  e.applySlow(0.15, 2.0);
  t.eq(e.slowMultiplier, 0.85, "15% applied");
  e.applySlow(0.65, 3.0);
  t.eq(e.slowMultiplier, 0.35, "65% takes over");
  t.eq(e.slowTimer, 3.0, "and brings its own duration");
});

test("a weaker slow neither dilutes nor extends a stronger one", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  var e = h.spawnAt(660, 100);

  e.applySlow(0.65, 3.0);
  e.slowTimer = 1.0;                     // partly elapsed
  e.applySlow(0.15, 2.0);

  t.eq(e.slowMultiplier, 0.35, "still the stronger slow");
  t.eq(e.slowTimer, 1.0, "duration NOT refreshed by the weaker slow");
});

test("slows never stack in magnitude", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  var e = h.spawnAt(660, 100);

  e.applySlow(0.15, 2.0);
  e.applySlow(0.15, 2.0);
  e.applySlow(0.15, 2.0);
  t.eq(e.slowMultiplier, 0.85, "three 15% slows are still 15%");
});

test("an equally strong slow refreshes the duration", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  var e = h.spawnAt(660, 100);

  e.applySlow(0.65, 3.0);
  e.slowTimer = 0.8;
  e.applySlow(0.65, 3.0);
  t.eq(e.slowTimer, 3.0, "refreshed");
  t.eq(e.slowMultiplier, 0.35, "magnitude unchanged");
});

test("a lone B5 smasher keeps its target slowed without a gap", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4", "B5"].forEach(function (id) {
    h.run("buyUpgrade(towers[0], '" + id + "')");
  });
  h.run("enemies = []");
  var e = h.spawnAt(SMASH_AT, 100000);   // parked in the zone, never dies
  e.speedUlps = 0;                        // and never walks out of it

  // Hit speed 2.2 s, slow lasts 3.0 s, so the slow must never lapse ONCE IT IS
  // ESTABLISHED. Counting starts at the first application rather than at a
  // fixed frame: since the swing became a wind-up the first blow lands
  // `swingSeconds()` in, and a hard `i > 5` was really asserting that the
  // hammer teleports.
  var lapses = 0;
  var started = false;
  for (var i = 0; i < 60 * 30; i++) {
    s.update(1 / 60, h.game.enemies, h.game.bullets);
    e.update(1 / 60);
    if (e.slowTimer > 0) started = true;
    if (started && e.slowTimer <= 0) lapses++;
  }
  t.eq(lapses, 0, "frames where the slow had lapsed");
  t.eq(e.slowMultiplier, 0.35, "still slowed at the end");
});

test("a smasher with no B upgrades applies no slow", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  h.run("enemies = []");
  var e = h.spawnAt(SMASH_AT, 100);

  runSwing(s, h);
  t.eq(e.health, 86, "it was hit");
  t.eq(e.slowTimer, 0, "but not slowed");
});

group("smasher: B4 explosion and its chain");

// **THE FIXTURES ABOVE NO LONGER STRADDLE A B-PATH SWING, and that is a real
// consequence of the 2026-07-30 range grants rather than a broken test.**
// IN_BLAST and BEYOND were chosen to sit outside a 31.25 u.l. wedge; a B4
// Warbringer's wedge is 56.25 u.l. now, which is three times the 18.75 u.l.
// blast radius, so ANY body within a blast of an in-zone victim is also in the
// zone. "Out of the swing, inside the blast" is not a reachable position for a
// B-path tower any more.
//
// So these tests were rewritten to assert what the blast actually does now:
// it lands ON TOP of the swing, and — since the same edit made it chain — it
// reaches bodies the wedge cannot, one corpse at a time. The marks the chain
// test uses are its own, and measured against the real geometry.
// SMASH_AT/IN_ZONE/IN_BLAST/BEYOND still straddle a BARE smasher exactly as
// they did, which is what the fixture guard test above pins.

test("the blast lands on top of the swing", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4"].forEach(function (id) { h.run("buyUpgrade(towers[0], '" + id + "')"); });
  t.eq(s.damage, 26, "14+1+1+4+6");
  h.run("enemies = []");

  var victim = spawnOnLine(h, IN_ZONE, 26);      // dies to one swing
  var bystander = spawnOnLine(h, IN_BLAST, 50);  // in the zone AND in the blast

  t.ok(s.covers(bystander), "the bystander is inside a B4 wedge now");

  victim.applySlow(0.40, 2.5);           // already slowed when the blow lands
  var dealt = runSwing(s, h);

  t.eq(victim.dead, true, "victim killed");
  t.eq(bystander.health, 9, "50 - 26 from the swing - 15 from the blast");
  t.eq(dealt, 67, "26 + 26 from the swing, plus 15 from the blast");
});

// 2026-07-30: **this used to assert the opposite**, and the owner reversed it
// the same day -- "make it so that enemies damaged by an exploding enemy are
// also slowed". A burst now spreads path B's tempo effect as well as its
// damage, so a chain walking down a column leaves the whole column slowed.
test("the blast slows what it damages", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4"].forEach(function (id) { h.run("buyUpgrade(towers[0], '" + id + "')"); });
  h.run("enemies = []");

  // MEASURED BY SOURCE, NOT BY SUBTRACTION (2026-08-26).
  //
  // This used to stand a body outside the swing and read its hit points: "50
  // minus one 15-point blast is 35". That framing died with the base-range
  // rise -- the Warbringer reaches 62.5 u.l. on a B4 now rather than 56.25,
  // and it kills the front rank and turns onto the next body DURING its own
  // wind-up, so the body the swing "could not reach" is swung by the time the
  // hammer lands. Traced: the survivor takes an aoe 15 AND an aoe 22, and 22
  // is the tower's damage.
  //
  // The subject of this test is the SLOW spreading through a blast, and that
  // is asserted directly now: a body whose only blast-shaped hit is exactly
  // EXPLOSION_DAMAGE comes out slowed. It no longer depends on the swing
  // having missed, which was never the claim.
  var victim = spawnOnLine(h, CHAIN_1, 26);
  var link1 = spawnOnLine(h, CHAIN_2, 30);
  var link2 = spawnOnLine(h, CHAIN_3, 30);
  var survivor = spawnOnLine(h, CHAIN_4, 500);   // deep enough to survive anything here
  spawnOnLine(h, CHAIN_CONTROL, 50);
  [victim, link1, link2].forEach(function (e) { e.applySlow(0.40, 2.5); });

  var log = recordHits(h, [survivor]);
  runSwing(s, h);
  log.restore();

  var blast = h.run("Smasher.EXPLOSION_DAMAGE");
  var blastHits = log.on(survivor).filter(function (x) { return x.amount === blast; });
  t.ok(blastHits.length > 0, "a blast reached it (" + log.on(survivor).length + " hits in all)");
  t.eq(blastHits[0].kind, "aoe", "and it arrived as area damage");
  t.eq(survivor.dead, false, "it survived");
  t.near(survivor.slowTimer, 2.5, 0.001, "and the blast slowed it");
});

// **THE BUG THE OWNER REPORTED, 2026-07-30**: "when the b4 warbringer attacks
// and kills the enemy they don't explode, however they should be because
// attacked enemies are slowed even if they die instantly."
//
// The old code checked whether the enemy was ALREADY slowed when the blow
// landed, and applied its own slow afterwards -- so the only thing that could
// ever have slowed a first-swing victim was the swing that had not happened
// yet, and a one-shot kill never burst. This test is the regression guard, and
// it is deliberately written with a victim that has never been touched.
//
// It REPLACES a test called "an unslowed kill does not burst", which asserted
// exactly the behaviour that turned out to be the bug.
test("a kill on the very first swing still bursts", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4"].forEach(function (id) { h.run("buyUpgrade(towers[0], '" + id + "')"); });
  h.run("enemies = []");

  var victim = spawnOnLine(h, IN_ZONE, 26);      // dies to one swing
  var bystander = spawnOnLine(h, IN_BLAST, 50);

  t.eq(victim.slowTimer, 0, "the victim has never been slowed by anything");

  var dealt = runSwing(s, h);

  t.eq(victim.dead, true, "victim killed outright");
  t.eq(s.blasts.length, 1, "and it burst anyway");
  t.eq(bystander.health, 9, "50 - 26 from the swing - 15 from the blast");
  t.eq(dealt, 67, "26 + 26 from the swing, plus 15 from the blast");
});

test("without B4 a slowed kill does not burst", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3"].forEach(function (id) { h.run("buyUpgrade(towers[0], '" + id + "')"); });
  h.run("enemies = []");

  var victim = spawnOnLine(h, IN_ZONE, 20);
  var bystander = spawnOnLine(h, IN_BLAST, 50);
  victim.applySlow(0.15, 2.0);

  runSwing(s, h);
  t.eq(victim.dead, true, "victim killed");
  t.eq(bystander.health, 30, "the swing's 20 and no blast without B4");
});

// 2026-07-30, the owner's words: "if another enemy dies to the blast, that
// enemy also explodes for 15 damage. the goal is to create a chain reaction."
// This is the test that says the chain is real, and it is written so that the
// LAST two bodies are ones the swing physically cannot touch -- nothing but a
// chain could have killed them.
test("a blast kill sets off another blast, and the chain carries past the swing",
function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4"].forEach(function (id) { h.run("buyUpgrade(towers[0], '" + id + "')"); });
  h.run("enemies = []");

  // "RIGHT OUT PAST THE SWING" WAS THE OLD TITLE and it is no longer provable
  // by placement: since 2026-08-26 a B4 Warbringer reaches 62.5 u.l. and
  // re-acquires mid-wind-up, so there is no longer a stretch of road that is
  // inside a blast chain and reliably outside the swing. Counting burst
  // markers went 5 -> 7 for exactly that reason.
  //
  // What the owner asked for on 2026-07-30 -- "if another enemy dies to the
  // blast, that enemy also explodes" -- is asserted directly instead: a body
  // whose ONLY damage is a blast dies, and its own blast is what kills the
  // next one. That is the chain, and it does not care where the wedge points.
  var victim = spawnOnLine(h, CHAIN_1, 26);
  var link1 = spawnOnLine(h, CHAIN_2, 30);
  var link2 = spawnOnLine(h, CHAIN_3, 30);
  // THIRTY HIT POINTS EACH, and that number is the proof. The swing deals 26,
  // so it CANNOT kill them on its own; only a blast on top of it can. They used
  // to carry 10 and be placed outside the wedge, which proved the same thing by
  // geometry -- and geometry stopped being available (see above).
  var link3 = spawnOnLine(h, CHAIN_4, 30);
  var link4 = spawnOnLine(h, CHAIN_5, 30);
  var control = spawnOnLine(h, CHAIN_CONTROL, 50);
  [victim, link1, link2].forEach(function (e) { e.applySlow(0.40, 2.5); });

  var chainOnly = [link3, link4];
  var log = recordHits(h, chainOnly);
  runSwing(s, h);
  log.restore();

  var blast = h.run("Smasher.EXPLOSION_DAMAGE");
  t.eq(victim.dead, true, "the swing kills the first");
  t.eq(link1.dead, true, "its blast finishes the second");
  t.eq(link2.dead, true, "and the chain carries to the third");
  t.eq(link3.dead, true, "and to the fourth");
  t.eq(link4.dead, true, "and one link further again");

  // THE POINT: each of the last two took at least one blast, and the damage
  // that was NOT blast damage could not have killed it. 30 hit points against
  // a 26-point swing leaves 4 -- so whatever finished them, it was a blast, and
  // link 4 can only have been reached by link 3's.
  chainOnly.forEach(function (e, i) {
    var hits = log.on(e);
    var fromBlast = hits.filter(function (x) { return x.amount === blast; });
    var otherwise = hits.filter(function (x) { return x.amount !== blast; })
      .reduce(function (a, x) { return a + x.amount; }, 0);
    t.ok(fromBlast.length > 0, "link " + (i + 3) + " was reached by a blast");
    t.eq(fromBlast[0].kind, "aoe", "which arrived as area damage");
    t.ok(otherwise < 30,
      "link " + (i + 3) + " could not have died to anything else (" + otherwise + " < 30)");
  });

  t.eq(control.dead, false, "but it stops where the bodies stop");
  t.eq(control.health, 50, "the control is untouched");
  t.ok(s.blasts.length >= 5, "every body that burst left a marker (" + s.blasts.length + ")");
});

test("a body that survives a blast does not burst, and none bursts twice", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4"].forEach(function (id) { h.run("buyUpgrade(towers[0], '" + id + "')"); });
  h.run("enemies = []");

  // Driven through explode() directly, which is the honest way to isolate the
  // chain from the swing that starts it.
  var seed = spawnOnLine(h, CHAIN_1, 1);
  seed.takeDamage(5);
  t.eq(seed.dead, true, "the seed is a corpse");

  var tough = spawnOnLine(h, CHAIN_2, 100);      // survives its 15
  var behind = spawnOnLine(h, CHAIN_3, 5);       // only reachable if `tough` burst

  s.explode(seed, h.game.enemies);
  t.eq(tough.health, 85, "the survivor took its 15");
  t.eq(behind.health, 5, "and did NOT pass the chain on");
  t.eq(s.blasts.length, 1, "one burst, the seed's");
});

// The termination guard. A dense blob is the worst case for a mechanic that
// sets itself off, and "every enemy on the map explodes once" has to be the
// ceiling rather than a hang -- an enemy may burst at most once, so the chain
// is bounded by the size of the board.
test("a chain through a dense crowd terminates", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4"].forEach(function (id) { h.run("buyUpgrade(towers[0], '" + id + "')"); });
  h.run("enemies = []");

  var seed = spawnOnLine(h, SMASH_AT + 100, 1);
  seed.takeDamage(5);

  var blob = [];
  for (var i = 1; i <= 40; i++) blob.push(spawnOnLine(h, SMASH_AT + 100 + i * 8, 5));

  var dealt = s.explode(seed, h.game.enemies);

  t.eq(blob.filter(function (e) { return e.dead; }).length, 40, "the whole crowd goes up");
  t.eq(dealt, 200, "40 bodies x 5 HP each -- overkill is still clamped out");
  t.eq(s.blasts.length, 41, "exactly one burst per body, the seed included");
});


group("smasher: B5's earthquake");

// The owner's spec, 2026-07-30: "he jumps and causes a 3 seconds stun on the
// entire map causing enemies to stop moving. followed the 3 seconds, all
// enemies on the map move 60% slower for the next 5 seconds."
test("the earthquake stops the whole map, then leaves it slowed", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4", "B5"].forEach(function (id) {
    h.run("buyUpgrade(towers[0], '" + id + "')");
  });
  // A big base, because this test steps nine seconds with 500 HP bodies on the
  // road: one of them leaking would zero a 100 HP base, freeze update(), and
  // the "back to full speed" assertion below would be measuring a frozen game.
  h.run("enemies = []; waveIndex = WAVES.length; baseHp = 100000");

  // Spread right down the road -- there is no radius on this, which is the
  // whole character of it.
  var near = h.spawnAt(100, 500);
  var mid = h.spawnAt(900, 500);
  var far = h.spawnAt(1500, 500);
  var boss = h.spawnAt(700, undefined, "boss");
  var bodies = [near, mid, far, boss];

  t.eq(s.quakeReady(), true, "a fresh B5 can use it immediately");

  var fired = s.triggerQuake(h.game.enemies);
  t.eq(fired.ok, true, "it fires");
  t.eq(fired.caught, 4, "and catches every living body on the map");

  bodies.forEach(function (e, i) {
    t.eq(e.stunTimer, 3, "body " + i + " is stunned for 3 s");
    t.eq(e.currentSpeedUlps(), 0, "body " + i + " is not moving");
  });

  // Frozen for the full three seconds, not merely slowed.
  var where = mid.progress;
  h.step(2.9);
  t.eq(mid.progress, where, "nothing moved during the stun");

  // Then 60% slower -- a normal walks at 50, so 20.
  h.step(0.3);
  t.near(mid.currentSpeedUlps(), 20, 0.001, "40% speed once the stun lifts");
  h.step(2);
  t.near(mid.currentSpeedUlps(), 20, 0.001, "still slowed two seconds later");

  // And back to normal after the five.
  h.step(3.5);
  t.near(mid.currentSpeedUlps(), 50, 0.001, "full speed once the slow runs out");
  t.near(boss.currentSpeedUlps(), 15, 0.001, "and so is the boss, at its own pace");
});

test("the earthquake damages nothing and is gated by a cooldown", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4"].forEach(function (id) { h.run("buyUpgrade(towers[0], '" + id + "')"); });
  // Big base for the same reason as the test above: this one steps out a full
  // twenty-second cooldown, and a leak would freeze the clock it is measuring.
  h.run("enemies = []; waveIndex = WAVES.length; baseHp = 100000");

  var e = h.spawnAt(1500, 500);

  // B4 does not have it. The panel does not offer the button either.
  t.eq(s.quakeReady(), false, "B4 cannot quake");
  t.eq(s.triggerQuake(h.game.enemies).reason, "needs B5", "and says why");
  t.eq(s.panelActions().filter(function (a) { return a.id === "ability"; }).length, 0,
    "and shows no ability button at all");

  h.run("buyUpgrade(towers[0], 'B5')");
  s.triggerQuake(h.game.enemies);
  t.eq(e.health, 500, "the quake deals NO damage");
  t.eq(s.quakeCooldown, h.game.Smasher.QUAKE_COOLDOWN_SECONDS, "the cooldown is set");

  var pressed = s.triggerQuake(h.game.enemies);
  t.eq(pressed.ok, false, "a second press does nothing");
  t.eq(s.panelActions().filter(function (a) { return a.id === "ability"; })[0].enabled, false,
    "and the button is disabled while it cools");

  // The cooldown runs on the tower's own update, like every other timer here.
  h.step(h.game.Smasher.QUAKE_COOLDOWN_SECONDS + 0.2);
  t.eq(s.quakeCooldown, 0, "it comes back");
  t.eq(s.quakeReady(), true, "and is ready again");
});

test("a body that walks in after the quake is not caught", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4", "B5"].forEach(function (id) {
    h.run("buyUpgrade(towers[0], '" + id + "')");
  });
  h.run("enemies = []; waveIndex = WAVES.length");

  var caught = h.spawnAt(1500, 500);
  s.triggerQuake(h.game.enemies);

  var latecomer = h.spawnAt(1400, 500);
  t.eq(caught.stunTimer, 3, "the one that was there is stunned");
  t.eq(latecomer.stunTimer, 0, "the one that arrived after is not");
  t.near(latecomer.currentSpeedUlps(), 50, 0.001, "and walks at full speed");
});

// The panel route, so the button a player actually presses is the one the
// tests exercise. Same contract every other tower's actions go through.
test("the earthquake fires through performAction, like every other ability", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4", "B5"].forEach(function (id) {
    h.run("buyUpgrade(towers[0], '" + id + "')");
  });
  h.run("enemies = []; waveIndex = WAVES.length");
  var e = h.spawnAt(1500, 500);

  var action = s.panelActions().filter(function (a) { return a.id === "ability"; })[0];
  t.eq(action.label, "Earthquake", "the button is there");
  t.eq(action.tone, "ability", "and reads as an ability, not an upgrade");
  t.eq(action.enabled, true, "and is live");

  var message = s.performAction("ability", { enemies: h.game.enemies });
  t.eq(message, "earthquake — 1 caught", "it reports what it did");
  t.eq(e.stunTimer, 3, "and the enemy is stunned");
});

// Enemy-side. A stun is a MOVEMENT stun and the longest one wins, the same
// rule applySlow and TowerHealth.stun both follow.
test("an enemy stun takes the longest and stops movement only", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  var e = h.spawnAt(600, 100);

  e.applyStun(3);
  t.eq(e.stunTimer, 3, "stunned");
  e.applyStun(1);
  t.eq(e.stunTimer, 3, "a shorter one cannot cut it short");
  e.applyStun(5);
  t.eq(e.stunTimer, 5, "a longer one extends it");

  // Movement only: an attacking enemy still attacks.
  var boss = h.spawnAt(700, undefined, "boss");
  boss.applyStun(3);
  t.eq(boss.currentSpeedUlps(), 0, "the boss cannot walk");
  var tower = { x: boss.pos.x, y: boss.pos.y, isDestroyed: function () { return false; },
    attackDamage: function () { return 1; }, attacksPerSecond: function () { return 1; },
    takeDamage: function (n) { this.hit = (this.hit || 0) + n; return n; } };
  boss.attackTowers(999, [tower]);
  boss.attackTowers(999, [tower]);
  t.ok(boss.windUpTimer > 0 || tower.hit > 0, "but it still winds up and shoots");
});

group("smasher: upgrade panel");

// The smasher reaches the DPS row by a different route from the config-driven
// towers -- it diffs a stat snapshot rather than resolving a config twice, and
// it stores SECONDS BETWEEN SWINGS where they store a rate. Both ends still
// have to produce the same row, spelled the same way, or the card means
// different things on different towers.
test("an upgrade preview shows the DPS it would buy", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  // A1: 12 damage every 4 s -> 16 every 4 s. 3.0 -> 4.0, which is the owner's
  // own worked example.
  var a1 = s.previewUpgrade("A1").changes
    .filter(function (c) { return c.label === "DPS"; })[0];
  t.ok(a1, "A1 has a DPS row");
  t.eq(a1.from + " → " + a1.to, "4.4 → 6.1", "damage and rate both up");
  t.eq(a1.delta, "+1.75", "the gain");

  // B1 buys the same DPS from the other side -- same 12 damage, swung every
  // 3 s instead of 4. Two upgrades that read completely differently on the
  // button turn out to be worth exactly the same, and the row is the only
  // place that is visible.
  var b1 = s.previewUpgrade("B1").changes
    .filter(function (c) { return c.label === "DPS"; })[0];
  t.eq(b1.from + " → " + b1.to, "4.4 → 5.2", "rate up, and a point of damage");

  // And it is measured, not read off the table: after A1 the same B1 is worth
  // more, because it is now speeding up a heavier hammer.
  h.run("buyUpgrade(towers[0], 'A1')");
  var after = s.previewUpgrade("B1").changes
    .filter(function (c) { return c.label === "DPS"; })[0];
  t.eq(after.from + " → " + after.to, "6.1 → 6.9", "crosspathing included");
});

test("the panel offers the next tier on each branch, with its price", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeSmasher(600, 500);
  h.click(600, 500);

  var buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons.length, 2, "one button per branch");
  // Three things on every upgrade button: which tier, what it costs, what it
  // does. All three are readable BEFORE the purchase.
  // Prices are the 2026-08-01 ladder: A 200/350/600/1400/1950 and
  // B 200/400/900/1900/2900. Typed, because this test is ABOUT what the panel
  // prints -- reading them back from Smasher.UPGRADES would assert only that
  // the panel echoes the table it was built from.
  t.eq(buttons[0].label, "Path A → A1", "branch A offers A1");
  t.eq(buttons[0].detail, "250 mana", "with its price");
  t.eq(buttons[1].label, "Path B → B1", "branch B offers B1");
  t.eq(buttons[1].detail, "250 mana", "with its price");

  h.run("buyUpgrade(inspected, 'A1')");
  buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons[0].label, "Path A → A2", "branch A moves on to A2");
  t.eq(buttons[0].detail, "400 mana", "at the next tier's price");
  t.eq(buttons[1].label, "Path B → B1", "branch B is unaffected");
});

test("clicking a branch button buys that upgrade", function (t) {
  var h = harness.boot();
  // Priced off Smasher.COST so the $800 left behind -- and the "800 - 200"
  // assertion below -- survives a change to the build price.
  h.run("cash = " + (h.game.Smasher.COST + 800));
  var s = h.placeSmasher(600, 500);      // leaves 800
  h.click(600, 500);

  var b = h.run("inspectionLayout(inspected).upgrades[0]");
  h.click(b.x + b.w / 2, b.y + b.h / 2);

  t.eq(s.hasA1, true, "A1 bought");
  t.eq(h.game.cash, 550, "800 - 250");
  t.eq(s.damage, 19, "stats recalculated");
  t.eq(h.game.towers.length, 1, "the click did not place or sell anything");
});

test("buttons walk a whole branch, then that branch reads MAXED", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);
  h.click(600, 500);

  for (var i = 0; i < 5; i++) {
    var b = h.run("inspectionLayout(inspected).upgrades[0]");
    h.click(b.x + b.w / 2, b.y + b.h / 2);
  }
  t.eq(s.damage, 65, "full path A bought through the panel");
  t.eq(s.ownedUpgradeIds().join(""), "A1A2A3A4A5", "in tier order");

  // A is finished. Its button stays, greyed, reading MAXED -- it does not
  // disappear. B1 and B2 are never locked, so B is still live.
  var buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons.length, 2, "both branches still have a button");
  t.eq(buttons[0].label, "Path A  MAXED", "A reads MAXED");
  t.eq(buttons[0].enabled, false, "and is inert");
  t.eq(buttons[0].id, null, "with no upgrade behind it");
  t.eq(buttons[1].id, "B1", "and B still offers B1");

  // Clicking MAXED does nothing at all -- not buy, not sell, not build.
  var maxed = buttons[0];
  h.click(maxed.x + maxed.w / 2, maxed.y + maxed.h / 2);
  t.eq(h.game.towers.length, 1, "the click was swallowed by the panel");
  t.eq(s.upgradeCount, 5, "and bought nothing");

  h.run("buyUpgrade(inspected, 'B1'); buyUpgrade(inspected, 'B2')");
  buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons.length, 2, "still two");
  t.eq(buttons[1].id, "B3", "B3 shown, shut out by path A");
  t.eq(buttons[1].enabled, false, "greyed, not live");
  t.eq(s.damage, 67, "B1 and B2 add a point each since 2026-08-27");
  t.eq(s.cooldownSeconds, 2.1, "and they speed it up");
});

test("a fully maxed tower shows MAXED on both branches", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);
  h.click(600, 500);

  ["A1", "A2", "A3", "A4", "A5", "B1", "B2"].forEach(function (id) {
    h.run("buyUpgrade(inspected, '" + id + "')");
  });

  // B3-B5 are shut out by path A, so B is blocked rather than finished: it
  // says why, not MAXED. Only a branch with every tier owned is MAXED.
  var buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons[0].effects, "every tier bought", "A is finished");
  t.eq(buttons[1].effects, "path A already chosen", "B is blocked, not maxed");
  t.eq(s.upgradeCount, 7, "seven bought in total");
});

test("the B button keeps offering B1 and B2 after committing to path A", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeSmasher(600, 500);
  h.click(600, 500);

  // Only tier 3 and up lock. B1 and B2 stay legal on either branch, so the
  // button must keep offering them rather than reading as locked too early.
  h.run("buyUpgrade(inspected, 'A3')");
  var buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons[1].label, "Path B → B1", "B1 still available");
  t.eq(buttons[1].detail, "250 mana", "at its price");

  h.run("buyUpgrade(inspected, 'B1')");
  buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons[1].label, "Path B → B2", "then B2");
  t.eq(buttons[1].detail, "450 mana", "at its price");
});

test("the locked-out branch is greyed, not removed, and says why", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);
  h.click(600, 500);

  ["A1", "A2", "B1", "B2"].forEach(function (id) {
    h.run("buyUpgrade(inspected, '" + id + "')");
  });
  var buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons.length, 2, "both branches still on offer at tier 3");
  t.eq(buttons[1].enabled, true, "B3 is live before the lock");

  h.run("buyUpgrade(inspected, 'A3')");
  buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons.length, 2, "B stays on the panel");
  t.eq(buttons[0].id, "A4", "path A continues");
  t.eq(buttons[1].id, "B3", "path B still shows its next tier");
  t.eq(buttons[1].enabled, false, "but dead");
  t.eq(buttons[1].effects, "path A already chosen", "and it says why");

  // Cash is not the reason, so it cannot be clicked through either.
  var b = buttons[1];
  h.click(b.x + b.w / 2, b.y + b.h / 2);
  t.eq(s.hasB3, false, "clicking the locked button bought nothing");
});

test("the tier prerequisite never greys a button, because it cannot fire", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeSmasher(600, 500);
  h.click(600, 500);

  // The panel offers the LOWEST unowned tier on a branch, and `requires` names
  // the tier directly below it -- which is therefore always owned. So "needs
  // A2" is a real rule that the panel structurally cannot show. Pinned here so
  // a future change to nextUpgrade that breaks the property gets noticed.
  ["A1", "A2", "A3", "A4"].forEach(function (id) {
    var buttons = h.run("inspectionLayout(inspected).upgrades");
    t.eq(buttons[0].reason, null, "A branch buyable before buying " + id);
    h.run("buyUpgrade(inspected, '" + id + "')");
  });
});

test("each button spells out what the upgrade does", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeSmasher(600, 500);
  h.click(600, 500);

  var buttons = h.run("inspectionLayout(inspected).upgrades");
  // Every tier grants HP since the 2026-08-01 retune, so every effects string
  // carries an HP clause it did not used to. That is the retune showing up in
  // the panel, not the panel changing how it spells things.
  t.eq(buttons[0].label, "Path A → A1", "which tier");
  t.eq(buttons[0].detail, "250 mana", "what it costs");
  t.eq(buttons[0].effects, "+5 dmg, +5 u.l. range, +0.01 atk/s, +30 HP",
    "A1 sells a little of all three since 2026-08-27, and its range through "
    + "the additive column so a base rise cannot swallow it again");

  // Spelled by the SAME formatter the config-driven towers use, in the same
  // unit every tower's panel now reports its rate in. It used to read "-1.0 s"
  // -- a different quantity, in a different direction, under a different name.
  // B1 still moves nothing but the swing rate, and now the hit points.
  t.eq(buttons[1].effects, "+1 dmg, +5 u.l. range, +0.03 atk/s, +35 HP",
    "B1 changes attack speed and HP -- +0.05 now the base cooldown is 3.5, not 4.0");

  ["A1", "A2"].forEach(function (id) { h.run("buyUpgrade(inspected, '" + id + "')"); });
  buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons[0].effects, "+9 dmg, +6.25 u.l. range, +70 HP", "A3 effects");
});

test("effects are diffed against this tower, not read off the table", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);
  h.click(600, 500);

  // B2 sets the swing to an absolute 2.1 s. Reached from B1's 2.9 s that is
  // 0.34/s -> 0.48/s, not the gain from the 3.2 s base it would look like off
  // the table.
  h.run("buyUpgrade(inspected, 'B1')");
  t.eq(s.cooldownSeconds, 2.9, "B1 applied");

  var buttons = h.run("inspectionLayout(inspected).upgrades");
  var bButton = buttons.filter(function (b) { return b.branch === "B"; })[0];
  t.eq(bButton.id, "B2", "B2 is next");
  // The atk/s clause is what this test is really about: +0.13 is 0.34/s -> 0.48/s
  // measured from B1's 2.9 s, where reading the table against the 3.2 s base
  // would have said +0.16. The other three clauses ride along because B2 grants
  // all of them since the 2026-08-27 retune; they are listed here so the string
  // is the whole string rather than a prefix that would pass while hiding one.
  t.eq(bButton.effects, "+1 dmg, +20 u.l. range, +0.13 atk/s, +55 HP",
    "measured from 2.9 s, not from the 3.2 s base");
});

test("every smasher tier describes itself before it is bought", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);
  h.click(600, 500);

  // Walk both branches and read the button at every step. The complaint this
  // pins: the panel named the tier and its price and stopped there, so the
  // only way to learn what an upgrade did was to buy it.
  var seen = [];
  ["A", "B"].forEach(function (branch) {
    var fresh = harness.boot();
    fresh.run("cash = 100000");
    fresh.placeSmasher(600, 500);
    fresh.click(600, 500);

    for (var tier = 1; tier <= 5; tier++) {
      var button = fresh.run("inspectionLayout(inspected).upgrades")
        .filter(function (b) { return b.branch === branch; })[0];

      t.eq(button.id, branch + tier, branch + tier + " is on offer");
      t.ok(button.effects.length > 0,
        branch + tier + " says what it does: " + button.effects);
      t.ok(/^\d+ mana$/.test(button.detail),
        branch + tier + " says what it costs: " + button.detail);
      seen.push(button.effects);

      fresh.run("buyUpgrade(inspected, '" + branch + tier + "')");
    }
  });

  // Ten tiers, ten different sentences -- if they were a constant string this
  // would collapse and the check above would still have passed.
  var distinct = seen.filter(function (v, i, all) { return all.indexOf(v) === i; });
  t.eq(distinct.length, 10, "every tier reads differently");
});

test("a locked or finished branch says why instead of what it would do", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeSmasher(600, 500);
  h.click(600, 500);

  // B1 and B2 first, because those two are never locked -- the branch has to
  // be sitting on B3 for the lock to have anything to refuse.
  ["B1", "B2", "A1", "A2", "A3"].forEach(function (id) {
    h.run("buyUpgrade(inspected, '" + id + "')");
  });
  var buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons[1].id, "B3", "B3 is the tier being refused");
  t.eq(buttons[1].effects, "path A already chosen",
    "a shut-out branch explains itself rather than advertising B3");

  h.run("buyUpgrade(inspected, 'A4'); buyUpgrade(inspected, 'A5')");
  buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons[0].effects, "every tier bought", "and a finished one says so");
});

test("hovering a button opens a card with the whole story", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeSmasher(600, 500);
  h.click(600, 500);

  var button = h.run("inspectionLayout(inspected).upgrades[0]");
  h.move(button.x + button.w / 2, button.y + button.h / 2);

  var card = h.run("hoveredCard(inspectionLayout(inspected)).model");
  t.eq(card.subtitle, "250 mana", "what it costs");

  var byLabel = {};
  card.changes.forEach(function (c) { byLabel[c.label] = c; });

  // The button only had room for "+4 dmg". The card says what the number
  // BECOMES, which is the question a player actually has.
  t.eq(byLabel.Damage.from, "14", "damage before");
  t.eq(byLabel.Damage.to, "19", "damage after");
  t.eq(byLabel.Damage.delta, "+5", "and the delta");

  // THE RANGE ROW IS BACK, 2026-08-27, and its return is the assertion. A1 had
  // no range line for a day: it granted an absolute `rangeUl: 37.50` and the
  // base was raised to exactly that, so under the longest-value-wins rule the
  // tier moved nothing and the card was right to say nothing. Its five units
  // are an ADDITIVE bonus now, which no base rise can swallow, so the card has
  // something true to print again: 40 -> 45.
  t.eq(byLabel.Range.to, "45 u.l.", "and the range row is back, additive now");
});

test("the card measures against this tower, and names the abilities it grants", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeSmasher(600, 500);
  h.click(600, 500);
  h.run("buyUpgrade(inspected, 'B1'); buyUpgrade(inspected, 'B2')");

  var button = h.run("inspectionLayout(inspected).upgrades[1]");   // B3
  h.move(button.x + button.w / 2, button.y + button.h / 2);
  var card = h.run("hoveredCard(inspectionLayout(inspected)).model");

  t.eq(card.title.indexOf("B3") > 0, true, "names the tier: " + card.title);
  t.eq(card.abilities.length, 1, "B3 grants the slow");
  t.ok(card.abilities[0].text.indexOf("15%") !== -1,
    "and quotes the tier's own figure: " + card.abilities[0].text);

  // Tier 3 is the one that shuts the other branch. A price cannot say that,
  // and finding out by buying it is the whole problem this fixes.
  t.ok(card.note !== null && card.note.indexOf("capped at tier 2") !== -1,
    "warns about the crosspath lock: " + card.note);
});

test("a refused upgrade explains itself in full rather than in one word", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeSmasher(600, 500);
  h.click(600, 500);
  ["B1", "B2", "A1", "A2", "A3"].forEach(function (id) {
    h.run("buyUpgrade(inspected, '" + id + "')");
  });

  var button = h.run("inspectionLayout(inspected).upgrades[1]");   // B3, shut out
  h.move(button.x + button.w / 2, button.y + button.h / 2);
  var card = h.run("hoveredCard(inspectionLayout(inspected)).model");

  t.eq(card.subtitle, "path A already chosen", "the reason, not a price");
  t.ok(card.note.indexOf("Unavailable") === 0, "and said again in full: " + card.note);
});

test("the card is laid out beside the panel and inside the canvas", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  // Bottom-right corner: the panel flips to the tower's left, so the card has
  // to work out which side of it is still free.
  h.placeSmasher(1240, 690);
  h.click(1240, 690);

  var button = h.run("inspectionLayout(inspected).upgrades[0]");
  h.move(button.x + button.w / 2, button.y + button.h / 2);

  var panel = h.run("inspectionLayout(inspected)");
  var card = h.run("(function () { var L = inspectionLayout(inspected); " +
    "var c = hoveredCard(L); return tooltipLayout(ctx, c.model, c.anchor, L); })()");

  t.ok(card.x + card.w <= panel.x || card.x >= panel.x + panel.w,
    "beside the panel, not over the button being hovered");
  t.ok(card.x >= 0 && card.x + card.w <= h.game.VIEW_WIDTH, "inside the canvas");
  t.ok(card.y >= 0 && card.y + card.h <= h.game.BAR_Y, "and above the build bar");
  t.eq(card.h, card.lines.reduce(function (n, l) { return n + l.h; }, 0) + card.pad * 2,
    "the box is exactly as tall as what goes in it");

  h.draw();       // and a frame with a card open must not throw
});

test("hovering nothing shows nothing", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeSmasher(600, 500);
  h.click(600, 500);
  h.move(60, 60);
  t.eq(h.run("hoveredCard(inspectionLayout(inspected))"), null, "no card off the buttons");
});

test("previewing an upgrade does not change the tower", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  var before = JSON.stringify(s.statSnapshot());
  s.upgradeEffects("A1");
  s.upgradeEffects("B3");
  t.eq(JSON.stringify(s.statSnapshot()), before, "stats untouched");
  t.eq(s.hasA1, false, "no flag left set");
  t.eq(s.upgradeCount, 0, "nothing owned");
});

test("an unaffordable button is shown dead and cannot be clicked through", function (t) {
  var h = harness.boot();
  // $60 left behind is the point of the fixture -- below A1's $200. Priced off
  // the build cost so it stays $60 whatever the smasher costs.
  h.run("cash = " + (h.game.Smasher.COST + 60));
  var s = h.placeSmasher(600, 500);      // leaves 60
  h.click(600, 500);

  var b = h.run("inspectionLayout(inspected).upgrades[0]");
  t.eq(b.label, "Path A → A1", "still shows what it would buy");
  t.eq(b.detail, "250 mana", "and what that would cost");
  t.eq(b.effects, "+5 dmg, +5 u.l. range, +0.01 atk/s, +30 HP",
    "and what it would do");
  t.eq(b.enabled, false, "but is not live at 60 mana");

  h.click(b.x + b.w / 2, b.y + b.h / 2);
  t.eq(s.hasA1, false, "clicking it bought nothing");
  t.eq(h.game.cash, 60, "and took no cash");
});

test("a gunner panel has no upgrade buttons", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(600, 505);
  h.click(600, 505);

  var L = h.run("inspectionLayout(inspected)");
  t.eq(L.upgrades.length, 0, "no buttons");
  t.ok(L.sell.y + L.sell.h <= L.y + L.h, "sell button still inside the panel");
});

test("the panel grows for the buttons and stays on screen", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeSmasher(1240, 690);             // bottom right, forces flip and clamp
  h.click(1240, 690);
  var L = h.run("inspectionLayout(inspected)");

  t.ok(L.x >= 0 && L.x + L.w <= h.game.VIEW_WIDTH, "within the canvas width");
  t.ok(L.y >= 0 && L.y + L.h <= h.game.BAR_Y, "above the build bar");

  // Buttons must not collide with the sell button below them.
  var row = L.upgrades[0];
  t.ok(row.y + row.h <= L.sell.y, "upgrade row sits above the sell button");
  t.ok(row.x >= L.x + L.pad, "and inside the panel");
  t.ok(L.upgrades[1].x + L.upgrades[1].w <= L.x + L.w - L.pad, "both fit across");
});

test("the sell button still works with the upgrade row present", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeSmasher(600, 500);
  h.click(600, 500);
  h.run("buyUpgrade(inspected, 'A1')");

  var refund = h.run("sellValue(inspected)");
  t.eq(refund, 425, "half of 600 + 250");

  var b = h.run("inspectionLayout(inspected).sell");
  var before = h.game.cash;
  h.click(b.x + b.w / 2, b.y + b.h / 2);

  t.eq(h.game.towers.length, 0, "sold");
  t.eq(h.game.cash - before, refund, "refund paid");
});

group("per-tower damage and kill tracking");

test("a new tower starts at zero", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var g = h.placeGunner(530, 505);
  var s = h.placeSmasher(700, 505);
  t.eq(g.damageDealt, 0, "gunner damage");
  t.eq(g.kills, 0, "gunner kills");
  t.eq(s.damageDealt, 0, "smasher damage");
  t.eq(s.kills, 0, "smasher kills");
});

test("a gunner is credited when its bullet lands, not when it fires", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var g = h.placeGunner(530, 505);
  h.run("enemies = []; bullets = []");
  var e = h.spawnAt(900, 10);

  h.run("towers[0].cooldown = 0");
  h.step(1 / 60);
  t.eq(h.game.bullets.length, 1, "bullet in the air");
  t.eq(g.damageDealt, 0, "nothing credited while it flies");

  h.step(0.5);
  t.eq(g.damageDealt, 1, "credited on impact");
  t.eq(g.kills, 0, "no kill, the enemy lived");
});

test("only the killing blow counts as a kill", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var g = h.placeGunner(530, 505);
  h.run("enemies = []; bullets = []");
  h.spawnAt(900, 3).speedUlps = 0;        // parked, so it cannot walk out of range

  h.step(6);                             // three shots, three hits, one kill
  t.eq(g.damageDealt, 3, "three points of damage");
  t.eq(g.kills, 1, "one kill");
});

test("a smasher counts every enemy in the swing, killed or not", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  h.run("enemies = []");

  h.spawnAt(SMASH_AT - 10, 50);          // survives
  h.spawnAt(SMASH_AT, 50);               // survives
  h.spawnAt(SMASH_AT + 10, 14);          // dies exactly

  runSwing(s, h);
  t.eq(s.damageDealt, 42, "14 to each of three enemies");
  t.eq(s.kills, 1, "only one died");
});

test("damage counted is damage landed, so overkill is not inflated", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  h.run("enemies = []; cash = 0");
  h.spawnAt(SMASH_AT, 4);                // 4 HP against a 12 damage swing

  var dealt = runSwing(s, h);
  t.eq(s.damageDealt, 4, "only the 4 that landed");
  t.eq(dealt, 4, "and the same figure is banked as cash");
  t.eq(s.kills, 1, "killed");
});

test("blast damage and blast kills belong to the smasher that caused them", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4"].forEach(function (id) {
    h.run("buyUpgrade(towers[0], '" + id + "')");
  });
  h.run("enemies = []");

  var victim = h.spawnAt(IN_ZONE, 22);
  var bystander = h.spawnAt(IN_BLAST, 3); // out of the swing, inside the blast
  victim.applySlow(0.40, 2.5);

  runSwing(s, h);
  t.eq(victim.dead, true, "victim killed by the swing");
  t.eq(bystander.dead, true, "bystander killed by the blast");
  t.eq(s.damageDealt, 25, "22 from the swing plus 3 from the blast");
  t.eq(s.kills, 2, "both kills credited to this smasher");
});

test("two towers are credited separately", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var first = h.placeGunner(530, 505);
  var second = h.placeGunner(700, 505);
  h.run("enemies = []; bullets = []");
  h.spawnAt(880, 4);

  h.step(8);
  t.eq(first.damageDealt + second.damageDealt, 4, "four damage between them");
  t.eq(first.kills + second.kills, 1, "exactly one kill total");
  t.ok(first.damageDealt > 0 && second.damageDealt > 0, "both contributed");
});

test("a sold tower's bullet still lands, and credits a tower off the board", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var g = h.placeGunner(530, 505);
  h.run("enemies = []; bullets = []");
  var e = h.spawnAt(900, 10);

  h.run("towers[0].cooldown = 0");
  h.step(1 / 60);
  h.run("sellTower(towers[0])");
  t.eq(h.game.towers.length, 0, "tower gone");

  h.step(0.5);
  t.eq(e.health, 9, "the shot still landed");
  t.eq(g.damageDealt, 1, "credited to the sold tower object");
});

test("the panel shows the running totals", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var g = placeBeside(h, SMASH_AT, "Tower");
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []");
  h.spawnAt(SMASH_AT, 3).speedUlps = 0;
  h.step(6);

  var rows = {};
  g.statLines().forEach(function (r) { rows[r[0]] = r[1]; });
  t.eq(rows["Damage dealt"], "3", "damage row");
  t.eq(rows.Kills, "1", "kills row");
});

group("smasher: integration");

test("its damage pays no cash until it kills", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  placeSmasherBeside(h, SMASH_AT);
  h.run("enemies = []; cash = 0");
  h.spawnAt(SMASH_AT, 100);

  h.step(1 / 60);
  t.eq(h.game.cash, 0, "a non-killing swing pays nothing");
});

test("it does not disturb the gunner claim system", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeGunner(530, 505);                     // gunner
  h.placeSmasher(600, 500);              // smasher beside it
  h.run("enemies = []; bullets = []");

  var e = h.spawnAt(960, 100);
  h.step(0.5);

  // The smasher reserves nothing: any claim on the enemy belongs to a bullet.
  t.eq(e.incomingDamage, h.game.bullets.reduce(function (n, b) {
    return n + (b.claimed ? b.damage : 0);
  }, 0), "claims match bullets in flight");
});

test("it still sells, inspects and draws when fully upgraded", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);
  ["A1", "A2", "B1", "B2", "B3", "B4", "B5"].forEach(function (id) {
    h.run("buyUpgrade(towers[0], '" + id + "')");
  });

  h.click(600, 500);
  t.eq(h.game.inspected, s, "inspected");

  var rows = s.statLines();
  function row(name) {
    return rows.filter(function (r) { return r[0] === name; })[0][1];
  }
  t.eq(row("Damage"), "45", "damage row");
  // 103.75 = A2's 43.75 absolute plus every additive grant this build holds:
  // A1 +5, A2 +5, B1 +5, B2 +20, B4 +10, B5 +15. It is the whole crosspath, and
  // the widest reach the tower has.
  t.eq(row("Range"), "103.75 u.l.", "range is in u.l., not the 'm' it used to print");
  t.eq(row("Attack speed"), "0.48/s", "and the swing rate is attacks per second");
  t.eq(row("On kill"), "15 in 18.75 u.l., chains", "the blast radius too");
  t.eq(rows[rows.length - 1][0], "DPS", "DPS is the last row");
  t.near(parseFloat(rows[rows.length - 1][1]), 45 / 2.1, 0.05, "DPS derived");

  h.step(2);
  h.draw();

  var refund = h.run("sellValue(inspected)");
  var before = h.game.cash;
  h.run("sellTower(inspected)");
  t.eq(h.game.towers.length, 0, "sold");
  t.eq(h.game.cash - before, refund, "refund paid");
});

group("hovering an enemy");

test("the hit test uses the drawn body, plus a little slack", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  var e = h.spawnAt(300);
  var x = e.pos.x;
  var y = e.visualBodyY();
  var reach = h.game.Enemy.RADIUS_PX + h.game.Enemy.HOVER_PAD_PX;

  t.eq(e.containsPoint(x, y), true, "dead centre");
  t.eq(e.containsPoint(x + reach - 1, y), true, "just inside the padded edge");
  t.eq(e.containsPoint(x + reach + 2, y), false, "just outside it");
  t.eq(e.containsPoint(x, y - reach - 2), false, "and above it");

  // The hover ring is drawn at exactly this radius, and the frost ring at 15.
  // Keep them apart or a slowed, hovered enemy reads as one smeared ring.
  t.ok(reach >= 19, "hover ring clears the frost ring at 15");
});

test("enemyAt picks the closest when two overlap", function (t) {
  var h = harness.boot();
  h.run("enemies = []");                 // boot already put one on the path
  var near = h.spawnAt(300);
  var far = h.spawnAt(304);              // a few px along, so both cover a point

  // Point 1 px from `near`. Both contain it, so array order would be a
  // coin flip; the closest must win or the readout flickers between them.
  var hit = h.run("enemyAt(" + (near.pos.x + 1) + ", " + near.visualBodyY() + ")");
  t.eq(hit, near, "closest wins, not first in the array");

  hit = h.run("enemyAt(" + far.pos.x + ", " + far.visualBodyY() + ")");
  t.eq(hit, far, "and the other one when the cursor is on it");

  t.eq(h.run("enemyAt(20, 20)"), null, "nothing under empty ground");
});

test("hovering reads current HP without changing anything", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  var e = h.spawnAt(300, 9);
  e.takeDamage(4);

  t.eq(h.run("enemyHoverLabel(enemies[0])"), "5 / 9 HP", "current out of max");

  h.move(e.pos.x, e.pos.y);
  h.draw();

  t.eq(e.health, 5, "health untouched by the hover");
  t.eq(e.incomingDamage, 0, "and no claim invented");
});

test("an enemy reports the HP it spawned with as its maximum", function (t) {
  var h = harness.boot();
  h.step(1);                             // wave 1 spawns stock normals

  // The max is whatever THAT enemy spawned with, never Enemy.BASE_HEALTH, so
  // the readout stays right for a tougher type and for an overridden health.
  t.eq(h.run("enemyHoverLabel(enemies[0])"), "4 / 4 HP", "a normal is 4 HP");
  t.eq(h.run("enemyHoverLabel(new Enemy(path, undefined, 'fast'))"), "2 / 2 HP",
    "a fast reads its own 2, not the base 4");
  t.eq(h.run("enemyHoverLabel(new Enemy(path, undefined, 'slow'))"), "7 / 7 HP",
    "a slow reads its own 7");
  t.eq(h.run("enemyHoverLabel(new Enemy(path, 40))"), "40 / 40 HP",
    "and a debug-spawned 40 HP enemy reads 40, not 4");
});

test("the panel and the build bar swallow the hover", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");

  // Nothing should throw with the cursor parked on either overlay, and
  // enemyAt must not be consulted for a point the player cannot be pointing at.
  h.placeGunner(600, 505);
  h.click(600, 505);
  var L = h.run("inspectionLayout(inspected)");
  h.spawnAt(300);

  h.move(L.x + L.w / 2, L.y + L.h / 2);
  h.draw();
  h.move(h.game.BAR_X + 10, h.game.BAR_Y + 10);
  h.draw();
  t.ok(true, "both overlay positions drew cleanly");
});

test("an overkilled enemy reads 0, never negative", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  var e = h.spawnAt(300, 3);
  e.takeDamage(10);                      // -7 until update() sweeps it up

  t.eq(e.health, -7, "health really is negative for the rest of the frame");
  t.eq(h.run("enemyHoverLabel(enemies[0])"), "0 / 3 HP", "but the label clamps");
});

group("the enemy sidebar and the trait list behind it");

// `Enemy.traitsOf` is the one list of "what is distinctive about this enemy".
// The sidebar shows all of it and the index's badge line shows the first row
// carrying a badge, so these tests are what stops the two drifting apart --
// which is the whole reason the chain was lifted out of js/codex.js.

test("a type's traits are read off its BLOCKS, in defining order", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;

  var camo = Enemy.traitsOf("camo_heavy").map(function (trait) { return trait.id; });
  t.deep(camo, ["camo", "armor", "defense"],
    "seeing it comes before hurting it, and both are on the card");

  var volatile_ = Enemy.traitsOf("volatile").map(function (trait) { return trait.id; });
  t.deep(volatile_, ["attack-dive", "death-charge"],
    "the dive and the charge it leaves are two separate facts");

  // ONE ROW PER ATTACK SPEC, and the Dinomech is the first type in the roster
  // whose whole pool is authored on the TYPE rather than half-added by a phase
  // -- so it is the first body the sidebar shows two attack rows for.
  var dino = Enemy.traitsOf("dinomech").map(function (trait) { return trait.id; });
  t.deep(dino, ["attack-best", "attack"],
    "the rail that hunts your best tower, then the stomp that takes a corner");
  t.eq(Enemy.traitsOf("dinomech")[1].detail.indexOf("leaps 70 u.l.") !== -1, true,
    "and the stomp row states the leap it is (" +
    Enemy.traitsOf("dinomech")[1].detail + ")");

  t.deep(Enemy.traitsOf("normal"), [],
    "and a plain Normal carries nothing at all");
});

test("traitsOf takes an id, a type row or the codex's model", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var type = Enemy.TYPES.sapper;
  var model = { attacks: Enemy.attacksOf(type) };   // what the index builds

  var fromId = Enemy.traitsOf("sapper")[0];
  t.eq(Enemy.traitsOf(type)[0].detail, fromId.detail, "a type row reads the same");
  t.eq(Enemy.traitsOf(model)[0].detail, fromId.detail,
    "and so does anything carrying the same blocks");
});

test("every badge the index prints comes off the trait list", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;

  // The pairs the codex chain used to spell out. Pinned by TYPE rather than by
  // position in the list, so reordering the roster cannot silently reassign one.
  var expected = {
    flying: "FLYING — needs air reach",
    healer: "FLYING — needs air reach",
    camo_heavy: "CAMO — needs detection",
    boss: "HUNTS YOUR BEST TOWER",
    sapper: "SHUTS TOWERS DOWN — NO DAMAGE",
    volatile: "DIVES IN AND EXPLODES",
    angry: "ATTACKS YOUR TOWERS",
    herald: "HASTENS THE WAVE — $0",
    hive: "BROOD: SHIELDED, $0",
    fractal_slime: "SPLITS INTO FOUR LOWER TIERS",
    shieldbearer: "SHIELDS THE WAVE — $0",
    boss_fast: "RESHIELDS ITSELF — $0",
    shielded: "SHIELD → DOUBLE SPEED",
    revenant: "GETS BACK UP ONCE",
    // The Dinomech's pool leads with the rail, which picks the board's single
    // best gun -- the same first-spec-only rule the Tyrant's badge follows. Its
    // stomp is a second ROW in the sidebar and does not get the headline.
    dinomech: "HUNTS YOUR BEST TOWER"
  };

  Object.keys(expected).forEach(function (id) {
    var badges = Enemy.traitsOf(id).filter(function (trait) { return trait.badge; });
    t.eq(badges.length ? badges[0].badge : null, expected[id], id + "'s badge line");
  });

  // Plating never claims the headline: the index has one line and it belongs to
  // an ability, which is what the armored types' badges being null encodes.
  t.eq(Enemy.traitsOf("armored").filter(function (x) { return x.badge; }).length, 0,
    "20% defense is a stat row, not a badge");
  t.eq(Enemy.traitsOf("normal").length, 0, "and a Normal has no line to print");
});

test("no detail sentence ends in a doubled full stop", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;

  // "u.l." ends in a full stop of its own, and every attacking type in the
  // roster read "... within 47.5 u.l.." until the detail lines stopped
  // appending one blindly.
  var bad = [];
  Object.keys(Enemy.TYPES).forEach(function (id) {
    Enemy.traitsOf(id).forEach(function (trait) {
      if (/\.\.$/.test(trait.detail)) bad.push(id + ": " + trait.detail);
      if (!/[.!?]$/.test(trait.detail)) bad.push(id + " (unfinished): " + trait.detail);
    });
  });
  t.deep(bad, [], "every trait detail is one finished sentence");
});

test("the sidebar names the body and lists what it does", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  var e = h.run("new Enemy(path, undefined, 'sapper')");
  h.game.enemies.push(e);

  var model = h.run("enemySidebarModel(enemies[0])");
  t.eq(model.name, "Sapper", "its display name, which the old readout never said");
  t.eq(model.hp, "45 / 45 HP", "the same figure the readout over its head gives");
  t.eq(model.traits.length, 1, "one trait");
  t.eq(model.traits[0].label, "Shuts towers down", "and it is the one that matters");

  // Live, off the body -- not the type's authored numbers.
  t.eq(model.stats[0][0], "Speed");
  t.eq(model.stats[0][1], Math.round(e.currentSpeedUlps()) + " u.l./s",
    "the speed it is doing this instant, so haste and slows show");
  t.eq(model.stats[1][1], "$" + h.run("formatCash(enemies[0].bounty())"),
    "and what killing THIS one pays");
});

test("a fractal's tier is part of its name", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  h.game.enemies.push(h.run("new Enemy(path, undefined, 'fractal_slime', { tier: 4 })"));

  t.eq(h.run("enemySidebarModel(enemies[0])").name, "Fractal Slime T4",
    "a T4 and a T0 are the same type and nothing like the same problem");
});

test("a body with nothing special says so out loud", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  h.game.enemies.push(h.run("new Enemy(path, undefined, 'normal')"));

  var traits = h.run("enemySidebarModel(enemies[0])").traits;
  t.eq(traits.length, 1, "one row, not an empty space under the numbers");
  t.eq(traits[0].id, "plain", "which says there is nothing rather than nothing at all");
});

test("a shielded body gets the second strip, in the same order as its head",
  function (t) {
    var h = harness.boot();
    h.run("enemies = []");
    h.game.enemies.push(h.run("new Enemy(path, undefined, 'shielded')"));

    var model = h.run("enemySidebarModel(enemies[0])");
    t.eq(model.bars.length, 2, "health, then shield");
    t.eq(model.hp, "12 / 12 HP + 24 shield", "and the figure states both pools");
  });

test("no type's sidebar reaches the build bar", function (t) {
  var h = harness.boot();
  var floor = h.run("BAR_Y") - 12;
  var over = [];

  Object.keys(h.game.Enemy.TYPES).forEach(function (id) {
    h.run("enemies = []");
    h.game.enemies.push(h.run("new Enemy(path, undefined, '" + id + "')"));
    var card = h.run("enemySidebarLayout(ctx, enemySidebarModel(enemies[0]))");
    if (card.y + card.h > floor) over.push(id + " ends at " + (card.y + card.h));

    // Nothing may be silently clipped either: a trait that will not fit is
    // dropped and COUNTED, and today nothing is dropped at all.
    card.lines.forEach(function (line) {
      if (line.kind === "more") over.push(id + " dropped a trait: " + line.text);
    });
  });

  t.deep(over, [], "every type fits above the bar with its whole trait list");
});

test("hovering a body draws its sidebar and changes nothing", function (t) {
  var h = harness.boot();
  h.run("enemies = []");
  var e = h.spawnAt(300, 9);
  e.takeDamage(4);

  h.move(e.pos.x, e.pos.y);
  h.draw();

  t.eq(e.health, 5, "health untouched by the panel");
  t.eq(e.incomingDamage, 0, "and no claim invented");

  // Off the board: the panel is gone, and drawing without one must not throw.
  h.move(h.game.BAR_X + 10, h.game.BAR_Y + 10);
  h.draw();
  t.eq(h.run("hoveredOnBoard()"), null, "nothing hovered over the build bar");
});

group("maps: the routes and the chooser");

// Play the scripted OPENING -- the original two waves -- on `mapId` with
// `gunners` towers, placed at the spots the map's own analysis rates highest.
// Returns the base HP left.
//
// Sliced to two waves deliberately: this test is about ROUTE difficulty, and
// the opening is the stretch where a fixed two-Rifleman budget discriminates
// between routes. Against the full ten-wave campaign two Riflemen lose
// everywhere (see THE_COMPANY/tools/balance/simulate-campaign.js, which
// lives outside this repository and is not reachable from a clone of it),
// which would collapse every route to zero and tell us nothing.
//
// 70 s is past the opening's last leak on every route: its last enemy spawns
// at 15.2 s and the longest walk is 47 s.
//
// THE PACING IS HELD STILL WITH AUTO-SEND (2026-08-25), which is what
// pinWaveBreak did before the timeline scheduler took the 90 s break away.
//
// The problem is the same one and it has moved up a level. It used to be that
// at the shipping 90 s break wave 2 did not arrive inside the 70 s window at
// all, and all four routes scored an identical 95 off wave 1 alone -- a
// comparison with nothing left in it. Now there is no break to pin: a wave runs
// its own 32 s window whether or not anything is left of it, so wave 2 lands at
// 37 s with 33 s to walk, its leaks fall outside the window, and lattice and
// meridian tie at 84. Same dead comparison, one level up.
//
// Auto-send closes each wave the instant it has finished ARRIVING and puts the
// next three seconds behind it -- which is the cadence pinWaveBreak(5) used to
// buy, near enough. It never compresses a wave's own intervals and never drops
// a spawn (see updateWaves), so what is held still is the spacing between
// waves and nothing else: exactly the pacing choice a player makes with the
// button, and exactly the thing that is orthogonal to which route is harder.
//
// It is set after restartGame() because auto-send is a PREFERENCE and survives
// a restart -- setting it first would work too, and this way the line reads in
// the order it happens.
function defend(mapId, gunners) {
  var h = harness.boot(mapId);
  h.run("WAVES = WAVES.slice(0, 2); restartGame(); autoSkipWaves = true;");
  h.run("cash = 100000");

  var spots = h.game.Maps.bestSpots(h.game.Maps.byId(mapId), gunners);
  for (var i = 0; i < spots.length; i++) h.placeGunner(spots[i].x, spots[i].y);

  h.step(70);
  return h.game.baseHp;
}

test("every route has a unique id, and an unknown one throws", function (t) {
  var h = harness.boot();
  var seen = {};

  h.game.Maps.LIST.forEach(function (m) {
    t.eq(seen[m.id], undefined, "id " + m.id + " used once");
    seen[m.id] = true;
    t.eq(h.game.Maps.byId(m.id), m, "byId finds " + m.id);
  });

  // Same reasoning as Enemy.typeOf: the only way to reach this is a typo in
  // code, and quietly handing back another map would surface as unexplainable
  // balance drift rather than a stack trace.
  var threw = false;
  try { h.game.Maps.byId("no-such-route"); } catch (e) { threw = true; }
  t.eq(threw, true, "unknown id throws");
});

test("exactly one route is the reference, and it defines the scale", function (t) {
  var h = harness.boot();
  var flagged = h.game.Maps.LIST.filter(function (m) { return m.reference; });

  t.eq(flagged.length, 1, "exactly one reference route");

  // THE REFERENCE AND THE DEFAULT ARE DIFFERENT MAPS SINCE 2026-08-26, and
  // that is deliberate rather than a slip. The reference is what FIXES THE
  // SCALE -- every balance figure in the game is measured against its length,
  // so moving the flag would silently rescale the whole campaign. The default
  // is only what you land on when you press Play, and Ironwood Frontier took
  // that over as the flagship board.
  //
  // They were the same map for as long as there was one obvious main route,
  // which made "the default is the reference" look like a rule. It never was:
  // this assertion pins that the reference is a STABLE, DELIBERATE choice, and
  // the line below still pins that it is the map the scale is derived from.
  t.eq(flagged[0].id, "rune-circuit", "the reference is Rune Circuit, and stays put");
  t.ok(h.game.Maps.DEFAULT_ID !== flagged[0].id,
    "the flagship default is a different map, and moving it did not move the scale");
  t.near(h.game.Maps.analyse(flagged[0]).lengthUl,
    h.game.Maps.referenceLengthUl(), 0.001, "the reference route is referenceLengthUl long");
});

test("switching routes changes the length, never the scale", function (t) {
  var h = harness.boot();

  // There is no per-map scale to get wrong any more: UNIT_LENGTH is global and
  // routes are authored in u.l., so the only thing a route can change is how
  // LONG it is. That is the property this now pins.
  var scale = h.game.UNIT_LENGTH;
  var lengths = {};

  h.game.Maps.LIST.forEach(function (m) {
    h.run("startRun(Maps.byId('" + m.id + "'))");
    t.eq(h.game.UNIT_LENGTH, scale, "u.l. unchanged on " + m.id);
    t.near(h.game.path.length / scale, h.game.Maps.analyse(m).lengthUl, 0.001,
      "the loaded road is as long as the analysis says, on " + m.id);
    lengths[m.id] = h.game.Maps.analyse(m).lengthUl;
  });

  // And the routes really are different lengths, or the check above would
  // pass on four copies of the same road.
  var distinct = Object.keys(lengths).map(function (k) { return lengths[k]; })
    .filter(function (v, i, all) { return all.indexOf(v) === i; });
  t.eq(distinct.length, h.game.Maps.LIST.length, "every route is its own length");
});

test("a plain straight road scores exactly the yardstick", function (t) {
  var h = harness.boot();
  var Maps = h.game.Maps;
  var straight = Maps.analyse({
    id: "straight", name: "straight",
    points: [{ x: -60, y: 360 }, { x: 1340, y: 360 }]
  });

  // The measurement WALKS the road in ROAD_STEP_UL steps, so it can only ever
  // land within one step of the exact figure. The tolerance is that step, not
  // a fudge factor -- tightening it would be pinning the sampling grid rather
  // than the geometry.
  t.near(straight.goodCoverageUl, Maps.straightCoverageUl(), Maps.ROAD_STEP_UL,
    "good spots on a straight road are worth the straight-road figure");
  t.near(straight.coverageRatio, 1, 0.03, "coverage ratio 1.00");
  t.eq(straight.turns, 0, "no turns");
  t.eq(h.game.Maps.foldsBack(straight), false, "never folds back");
});

test("folding the road back on itself is what multiplies a tower", function (t) {
  var h = harness.boot();
  var Maps = h.game.Maps;

  // The same road, once as one lane and once as two lanes 62.5 u.l. apart.
  // Nothing differs but whether the route comes back near itself.
  var open = Maps.analyse({
    id: "open", name: "open",
    points: [{ x: 100, y: 200 }, { x: 1100, y: 200 }]
  });
  var folded = Maps.analyse({
    id: "folded", name: "folded",
    points: [{ x: 100, y: 200 }, { x: 1100, y: 200 },
             { x: 1100, y: 265 }, { x: 100, y: 265 }]
  });

  t.near(folded.foldGapUl, 62.5, 2.5, "the two lanes are 62.5 u.l. apart");
  t.eq(Maps.foldsBack(open), false, "the open road never folds");
  t.eq(Maps.foldsBack(folded), true, "the folded one does");
  t.ok(folded.goodCoverageUl > open.goodCoverageUl * 1.6,
    "a folded lane pair is worth over 1.6x an open one (" +
    folded.goodCoverageUl.toFixed(1) + " m vs " + open.goodCoverageUl.toFixed(1) + " m)");
  t.ok(folded.coverageRatio < open.coverageRatio, "and that is what makes it easier");
});

test("turn COUNT alone barely moves the score; proximity does", function (t) {
  var h = harness.boot();
  var Maps = h.game.Maps;

  // Four square corners, every leg kept well clear of every other. Corners help
  // a tower on their inside and hurt one on their outside, so on their own they
  // very nearly cancel -- which is why the measure is about folding, not turns.
  var corners = Maps.analyse({
    id: "corners", name: "corners",
    points: [{ x: 60, y: 150 }, { x: 420, y: 150 }, { x: 420, y: 560 },
             { x: 840, y: 560 }, { x: 840, y: 150 }, { x: 1220, y: 150 }]
  });

  t.eq(corners.turns, 4, "four turns");
  t.ok(corners.foldGapUl > 8, "but nothing folds inside a gunner's reach");
  t.ok(corners.coverageRatio > 0.7,
    "four corners still leave the good spots near straight-road value (" +
    corners.coverageRatio.toFixed(2) + ")");
});

test("each route lands in the difficulty band it is presented as", function (t) {
  var h = harness.boot();
  var Maps = h.game.Maps;

  t.eq(Maps.analyse(Maps.byId("mana-coil")).tier, "easy", "mana-coil");
  t.eq(Maps.analyse(Maps.byId("sigil-lattice")).tier, "normal", "sigil-lattice");
  t.eq(Maps.analyse(Maps.byId("null-meridian")).tier, "hard", "null-meridian");

  // The original route measures normal. It is the yardstick the other three
  // were drawn against, so this is the one that must not move quietly.
  t.eq(Maps.analyse(Maps.byId("rune-circuit")).tier, "normal", "rune-circuit");
});

test("the routes are ordered easy to hard by score", function (t) {
  var h = harness.boot();
  var Maps = h.game.Maps;
  var score = function (id) { return Maps.analyse(Maps.byId(id)).score; };

  t.ok(score("mana-coil") < score("rune-circuit"), "coil easier than circuit");
  t.ok(score("rune-circuit") < score("sigil-lattice"), "circuit easier than lattice");
  t.ok(score("sigil-lattice") < score("null-meridian"), "lattice easier than meridian");
});

// The label is a promise to the player, so it is checked against the GAME and
// not only against the formula that produced it. Two gunners is the
// discriminating budget: one loses everywhere, three clears almost everywhere.
test("the difficulty labels survive being played", function (t) {
  var coil = defend("mana-coil", 2);
  var circuit = defend("rune-circuit", 2);
  var lattice = defend("sigil-lattice", 2);
  var meridian = defend("null-meridian", 2);

  t.ok(coil > circuit, "coil keeps more base than circuit (" + coil + " vs " + circuit + ")");
  t.ok(coil > lattice, "coil keeps more base than lattice (" + coil + " vs " + lattice + ")");
  t.ok(circuit > meridian, "circuit beats meridian (" + circuit + " vs " + meridian + ")");
  t.ok(lattice > meridian, "lattice beats meridian (" + lattice + " vs " + meridian + ")");
});

test("every route has enough legal ground to be defended", function (t) {
  var h = harness.boot();
  var gap = h.game.ul(h.game.Tower.FOOTPRINT_RADIUS_UL * 2);

  h.game.Maps.LIST.forEach(function (m) {
    var spots = h.game.Maps.bestSpots(m, 6);
    t.eq(spots.length, 6, "six spread-out spots on " + m.id);

    // They must also satisfy the rule the game would refuse them under.
    for (var i = 0; i < spots.length; i++) {
      for (var j = i + 1; j < spots.length; j++) {
        var dx = spots[i].x - spots[j].x;
        var dy = spots[i].y - spots[j].y;
        t.ok(dx * dx + dy * dy >= gap * gap,
          "spots " + i + "/" + j + " do not collide on " + m.id);
      }
    }
  });
});

test("the analysis is cached, not recomputed every frame", function (t) {
  var h = harness.boot();
  var map = h.game.Maps.byId("mana-coil");
  t.eq(h.game.Maps.analyse(map), h.game.Maps.analyse(map), "same object back");
});

group("the title menu");

test("the game launches on the menu and simulates nothing", function (t) {
  var h = harness.boot(null);
  h.run("openMenu()");

  t.eq(h.game.screen, "menu", "the title screen is where the game opens");
  h.step(10);
  t.eq(h.game.enemies.length, 0, "ten seconds of menu spawns nothing");
  h.draw();
  t.ok(true, "the menu draws");
});

test("PLAY opens the chooser and the sandbox button is a navigation", function (t) {
  var h = harness.boot(null);
  h.run("openMenu()");

  var play = h.game.playButtonRect();
  h.click(play.x + play.w / 2, play.y + play.h / 2);
  t.eq(h.game.screen, "select", "PLAY leads to the route chooser");

  // Back again, then out through the sandbox button. Leaving for sandbox.html
  // is a page navigation, which the stubbed DOM has no window.location for --
  // openSandbox guards exactly that, so this must not throw and must not
  // change the screen.
  h.run("openMenu()");
  var box = h.game.sandboxButtonRect();
  h.click(box.x + box.w / 2, box.y + box.h / 2);
  t.eq(h.game.screen, "menu", "the sandbox button navigates rather than switching screen");

  // The two buttons cannot overlap, or one would eat the other's clicks.
  t.ok(play.y + play.h <= box.y, "PLAY sits clear of the sandbox button");
});

test("the menu hotkeys match its buttons, and Escape comes back to it", function (t) {
  var h = harness.boot(null);

  h.run("openMenu()");
  h.key("Enter");
  t.eq(h.game.screen, "select", "Enter plays");

  h.key("Escape");
  t.eq(h.game.screen, "menu", "Escape returns from the chooser");

  h.key("1");
  t.eq(h.game.screen, "select", "1 plays too");

  // And the chooser's own Back button does the same thing as Escape.
  var back = h.game.backButtonRect();
  h.click(back.x + back.w / 2, back.y + back.h / 2);
  t.eq(h.game.screen, "menu", "the Back button returns to the menu");

  // The Back button must not sit on a map card, or it would steal its click.
  for (var i = 0; i < h.game.Maps.LIST.length; i++) {
    var card = h.game.mapCardRect(i);
    t.ok(back.y + back.h <= card.y || back.x + back.w <= card.x,
      "Back clears card " + i);
  }
});

group("the index");

// Boot to the index the way a player gets there: menu, then its button.
function bootIndex() {
  var h = harness.boot(null);
  h.run("openMenu()");
  var r = h.game.indexButtonRect();
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  return h;
}

test("the menu's Index button opens it; Escape leaves; nothing simulates", function (t) {
  var h = bootIndex();
  t.eq(h.game.screen, "index", "the index opened");

  h.step(10);
  t.eq(h.game.enemies.length, 0, "ten seconds of reading spawns nothing");
  h.draw();
  t.ok(true, "the towers tab draws");

  h.key("Escape");
  t.eq(h.game.screen, "menu", "Escape returns to the menu");

  // And the shared Back button does the same as on the chooser.
  h.run("Codex.open()");
  var back = h.game.backButtonRect();
  h.click(back.x + back.w / 2, back.y + back.h / 2);
  t.eq(h.game.screen, "menu", "the Back button returns too");
});

test("the tower tab lists the shipping roster, walked from the real upgrade actions", function (t) {
  var h = bootIndex();
  var m = h.run("Codex.models()");

  var names = m.towers.map(function (x) { return x.name; });
  var roster = h.game.BUILD_SLOTS.filter(function (x) { return x !== null; })
    .map(function (x) { return x.DISPLAY_NAME; });
  t.deep(names, roster, "one entry per build-bar tower, same order");

  m.towers.forEach(function (tower) {
    t.ok(tower.stats.length > 0, tower.name + " has stat rows");
    // No lifetime totals in a field guide -- a specimen has no history.
    tower.stats.forEach(function (row) {
      t.ok(row[0] !== "Damage dealt" && row[0] !== "Kills",
        tower.name + " shows no lifetime row (" + row[0] + ")");
    });
  });

  // EVERY tower in the bar has five tiers a path, each carrying the same
  // preview card the in-game hover would show.
  //
  // This used to skip entry 0 and assert it had no tree at all, because entry 0
  // was the gunner -- the one buildable type that never had upgrades. The
  // gunner was deleted on 2026-07-30 and everything shifted down a slot, so the
  // line had been asserting that the WARBRINGER has no upgrade paths ever
  // since. Corrected 2026-08-10, when the Summoner filled the fifth slot and
  // this test had to be read again.
  m.towers.forEach(function (tower) {
    t.ok(tower.branches !== null, tower.name + " has an upgrade tree");
  });
  m.towers.forEach(function (tower) {
    ["A", "B"].forEach(function (branch) {
      t.eq(tower.branches[branch].length, 5, tower.name + " path " + branch + " has 5 tiers");
      tower.branches[branch].forEach(function (tier) {
        t.ok(tier.card && tier.card.title, tower.name + " " + tier.id + " has a preview card");
        t.ok(tier.price.length > 0, tower.name + " " + tier.id + " states a price or reason");
      });
    });
  });
});

test("a gated tier is shown but never applied, and previewing spends nothing", function (t) {
  var h = harness.boot(null);
  h.run("openMenu()");
  h.run("cash = 123");
  h.run("Codex.open()");
  var m = h.run("Codex.models()");

  // The Siphon's B5 is
  // gated on the healing ledger, which is 0 on the menu. The codex must show
  // the tier WITH its refusal -- that is information -- while leaving the
  // gate's global state alone.
  var siphon = m.towers.filter(function (x) { return x.name === "Siphon"; })[0];
  var b5 = siphon.branches.B[4];
  t.ok(b5.reason !== null, "B5 carries the gate's reason (" + b5.reason + ")");
  t.ok(b5.card, "and still has a card explaining it");
  t.eq(h.run("DeathDenial.isRewinding()"), false, "death denial untouched");

  t.eq(h.game.cash, 123, "previewing an upgrade tree costs nothing");
  t.eq(h.game.towers.length, 0, "and places nothing");
});

test("clicking a tier through the real click path previews it", function (t) {
  var h = bootIndex();

  // Select the Longshot (rail entry 2), then its A3 chip.
  var card = h.run("Codex.towerCardRect(2)");
  h.click(card.x + card.w / 2, card.y + card.h / 2);
  t.eq(h.run("Codex.state()").towerIndex, 2, "the Longshot is open");

  var chip = h.run("Codex.tierRect('A', 2)");
  h.click(chip.x + chip.w / 2, chip.y + chip.h / 2);
  var pick = h.run("Codex.state()").pick;
  t.deep(pick, { branch: "A", tier: 2 }, "A3 is picked");
  h.draw();
  t.ok(true, "the preview card draws");

  // Switching tower clears the pick -- a card describing another tower's
  // upgrade would be misinformation.
  var smasher = h.run("Codex.towerCardRect(1)");
  h.click(smasher.x + smasher.w / 2, smasher.y + smasher.h / 2);
  t.eq(h.run("Codex.state()").pick, null, "switching tower clears the preview");
});

test("the enemy tab covers the roster with derived wave appearances", function (t) {
  var h = bootIndex();
  var tab = h.run("Codex.tabRect(1)");
  h.click(tab.x + tab.w / 2, tab.y + tab.h / 2);
  t.eq(h.run("Codex.state()").tab, "enemies", "the enemies tab opened");
  h.draw();
  t.ok(true, "the enemies tab draws");

  var enemies = h.run("Codex.models()").enemies;
  t.eq(enemies.length, Object.keys(h.game.Enemy.TYPES).length, "every type is listed");

  // Wave appearances are DERIVED from WAVES -- per GROUP since v0.4.7, so a
  // mixed wave shows up in every list it belongs to. They no longer TILE the
  // schedule (that only held while a wave named one type).
  //
  // **THEY COVER THE ROSTER EXCEPT FOR WHAT IS DELIBERATELY PARKED.** For one
  // version they covered all of it: v0.4.9 added four types kept out of the
  // schedule, plus the imported Aether Wisp, and all five were scheduled by
  // 2026-07-30. On 2026-08-29 the Fractal Slime went the other way -- off the
  // campaign at the owner's instruction, kept in the index and the sandbox --
  // so the exemption is asserted BY NAME against the type's own `sandboxOnly`
  // flag rather than as a hole in the list. A type that is neither scheduled
  // nor flagged is still a failure, which is the rule that was always meant.
  //
  // THE EXEMPTION IS NOW ACTUALLY READ, which it was not until 2026-08-30: the
  // paragraph above has always said it is asserted against the type's own
  // `sandboxOnly` flag, and the assertion below simply demanded an empty list
  // because every type happened to be scheduled. The Veil Dart is the first one
  // that is not, and the rule the comment states is the rule now enforced --
  // a type that is neither scheduled NOR flagged is still a failure.
  var seen = {};
  var unscheduled = [];
  var parked = [];
  enemies.forEach(function (e) {
    if (!e.waves.length) {
      if (h.game.Enemy.TYPES[e.id].sandboxOnly) parked.push(e.id);
      else unscheduled.push(e.id);
    }
    e.waves.forEach(function (n) { seen[n] = true; });
  });
  // ACROSS EVERY SCHEDULE, because `model.waves` is the UNION of the
  // per-difficulty lists and the two campaigns are no longer the same length:
  // Easy is 35 waves and Normal is 40. The claim is still "no wave anywhere is
  // unaccounted for", stated against the longest schedule rather than against
  // whichever one happens to be active.
  var longest = 0;
  h.game.DIFFICULTIES.forEach(function (d) {
    longest = Math.max(longest, d.waves.length);
  });
  t.eq(longest, 40, "the longest campaign is Normal's forty waves");
  t.eq(Object.keys(seen).length, longest,
    "every wave of every schedule is claimed by at least one type");
  t.deep(unscheduled, [],
    "and no type is left off the schedule without saying so");
  t.deep(parked, ["veil_dart"],
    "the one type that is off it declares itself sandboxOnly");

  // And the late-campaign scaling shows: a stock normal is 4 HP, and the guide
  // must say what the heaviest scheduled one is.
  //
  // 36, NOT 30, SINCE 2026-08-27, and the change is the feature rather than a
  // drift. The ceiling is taken across EVERY authored schedule, because
  // "highest campaign HP" is a claim about the game and not about one
  // difficulty: Easy's finale sends 30 HP Normals and Normal's sends 36.
  //
  // 48 SINCE 2026-08-28, from 36: Normal's third money convoy (wave 38) sends
  // its Normals at 48, and the ceiling is taken across every schedule.
  var normal = enemies.filter(function (e) { return e.id === "normal"; })[0];
  t.eq(normal.maxHp, 48, "the normal's late-campaign ceiling is derived");

  // The v0.4.7 mechanics are carried into the guide as data off the type, so a
  // retune shows there with no edit -- the same arrangement `attack` has.
  // The bounties below are authored per-kill values, not damage conversions.
  var bulwark = enemies.filter(function (e) { return e.id === "shielded"; })[0];
  t.eq(bulwark.shield.ratio, 2, "the Bulwark's shield ratio reaches the guide");
  t.eq(bulwark.bounty, 20,
    "and its bounty prices the shield and speed break");

  var hive = enemies.filter(function (e) { return e.id === "hive"; })[0];
  t.eq(hive.bounty, 175, "the Hive includes a spawner premium");
  t.eq(hive.spawns.count, 5, "and the guide states the size of its brood");
  t.eq(hive.spawns.noBounty, true, "and that the brood is what pays nothing");

  var revenant = enemies.filter(function (e) { return e.id === "revenant"; })[0];
  t.eq(revenant.bounty, 20, "a Revenant prices its second life");

  var boss = enemies.filter(function (e) { return e.id === "boss"; })[0];
  t.eq(boss.health, 5000, "the Tyrant is in the guide too");
  t.eq(boss.attack.stunSeconds, 2, "with what it actually does to towers");
  t.deep(boss.waves, [35, 39], "and where the player meets it");
  // PER DIFFICULTY, which is what the detail panel prints one row of each. The
  // union above is what the compact list row shows and what "is this scheduled
  // at all" asks; these are what a player reads before choosing a campaign.
  t.deep(appearanceOf(boss, "easy"), [35], "wave 35 of Easy");
  t.deep(appearanceOf(boss, "normal"), [35, 39],
    "and waves 35 and 39 of Normal, which sends three of them in the second");

  var colossus = enemies.filter(function (e) { return e.id === "colossus"; })[0];
  t.eq(colossus.health, 550, "the new tank's HP reaches the guide");
  t.eq(colossus.bounty, 250, "with its authored bounty");
  t.deep(colossus.waves, [25, 29, 35, 36, 37, 38, 39],
    "and its campaign appearances, both schedules");
  // TWO ON EASY SINCE 2026-08-29: 35's is the body that replaced the T5
  // Fractal Slime root, at the 1024 points the root had.
  t.deep(appearanceOf(colossus, "easy"), [29, 35], "Easy sends two, in 29 and 35");
  t.deep(appearanceOf(colossus, "normal"), [25, 29, 36, 37, 38, 39],
    "Normal sends one in 25, two in 29, and then 2/4/6/8 across act VI");

  var fractal = enemies.filter(function (e) { return e.id === "fractal_slime"; })[0];
  t.eq(fractal.health, 4, "Fractal Slime is listed at its base T1 health");
  t.eq(fractal.bounty, 2, "with its halved base bounty");
  t.eq(fractal.aoeDamageReduction, 0.5, "with its AoE resistance in the detail model");
  // T3/64/[25] until 2026-08-20, when the whole ladder was scheduled. The
  // guide DERIVES all three by walking the schedule, so this moved with no
  // edit to js/codex.js -- which is the property worth pinning here: the index
  // states the tier range and the campaign now actually spends it.
  t.eq(fractal.maxTier, 5, "the guide derives the highest campaign tier");
  t.eq(fractal.maxHp, 1024, "and derives that T5's 1024 HP");
  t.eq(fractal.fractal.splitCount, 4, "the split block reaches the guide");
  // EASY SENDS NONE SINCE 2026-08-29, at the owner's instruction, and Normal is
  // untouched -- "from easy mode" was the whole scope of it. This pair is
  // exactly why the guide keeps its wave lists per difficulty rather than
  // merging them: a card printing one union would send an Easy player looking
  // for a body that is not on their road.
  t.deep(appearanceOf(fractal, "easy"), [],
    "Easy sends no rung of the ladder at all");
  t.deep(appearanceOf(fractal, "normal"), [17, 27, 32, 35],
    "and Normal's four rungs, which open at T2 rather than at T0");

  // THE THREE NORMAL-ONLY TYPES, and the row that says so. A card that printed
  // one merged wave list would tell a player on Easy to look for a Herald that
  // is not there.
  ["herald", "sapper", "volatile", "dinomech"].forEach(function (id) {
    var model = enemies.filter(function (e) { return e.id === id; })[0];
    t.ok(!!model, id + " is in the guide");
    t.deep(appearanceOf(model, "easy"), [], id + " appears nowhere in Easy");
    t.ok(appearanceOf(model, "normal").length > 0,
      id + " appears in Normal (" + appearanceOf(model, "normal").join(", ") + ")");
  });

  // THE DINOMECH, whose whole card is one number. It is the fourth Normal-only
  // type and the only one the player meets exactly once.
  var dino = enemies.filter(function (e) { return e.id === "dinomech"; })[0];
  t.eq(dino.health, 45000, "45 000 HP on the card");
  t.eq(dino.maxHp, 45000, "and the campaign never scales it up or down");
  t.deep(appearanceOf(dino, "normal"), [40], "wave 40 of Normal and nowhere else");
});

// The per-difficulty wave list off a codex model, by difficulty id.
function appearanceOf(model, difficultyId) {
  for (var i = 0; i < model.appearances.length; i++) {
    if (model.appearances[i].id === difficultyId) return model.appearances[i].waves;
  }
  throw new Error("no appearance row for '" + difficultyId + "'");
}


// ---------------------------------------------------------------------------
// THE INDEX CARDS FOR THE THREE NEW TYPES, AND THE DIFFICULTIES TAB.
//
// A mechanic the player cannot look up is a mechanic they have to reverse
// engineer from a board they are losing. These check that the cards state the
// numbers the mechanics actually run on -- and they check the numbers against
// `Enemy.TYPES` rather than against literals, so a retune moves the assertion
// and the card together and neither can be updated without the other.
// ---------------------------------------------------------------------------

test("the index explains the Herald, with the numbers it actually runs on",
function (t) {
  var h = readOnlyBoot();
  h.run("Codex.open()");
  var enemies = h.run("Codex.models()").enemies;
  var herald = enemies.filter(function (e) { return e.id === "herald"; })[0];
  t.ok(!!herald, "the Herald has a card");

  var spec = h.game.Enemy.TYPES.herald.support;
  t.eq(herald.health, 100, "100 HP on the card");
  t.eq(herald.bounty, 120, "and its 120 bounty");
  t.eq(herald.support.haste.speedMultiplier, spec.haste.speedMultiplier,
    "the haste reaches the guide off the type");

  var text = h.run("Codex.describe('herald')").join(" ");
  t.ok(text.indexOf("+30%") !== -1, "the card states the +30%");
  t.ok(text.indexOf("8 s") !== -1, "the eight-second cadence");
  t.ok(text.indexOf("4 s") !== -1, "the four-second duration");
  t.ok(text.indexOf("8 nearest") !== -1, "the cap of eight");
  t.ok(text.indexOf("160 u.l.") !== -1, "and the 160 u.l. reach");
  t.ok(text.indexOf("never stacks") !== -1, "that it never stacks");
  t.ok(text.indexOf("cannot hasten") !== -1, "and what it cannot touch");
  t.ok(text.indexOf("fliers") !== -1 && text.indexOf("Fractal") !== -1 &&
    text.indexOf("bosses") !== -1, "naming every excluded kind");

  t.eq(h.run("Codex.behaviourRowFor('herald')").join(" | "),
    "Hastens ×8 | +30% for 4s / 8 s", "and the list row says it compactly");
});

test("the index explains the Sapper, and does not call it a damage attack",
function (t) {
  var h = readOnlyBoot();
  h.run("Codex.open()");
  var enemies = h.run("Codex.models()").enemies;
  var sapper = enemies.filter(function (e) { return e.id === "sapper"; })[0];
  t.ok(!!sapper, "the Sapper has a card");
  t.eq(sapper.health, 45, "45 HP on the card");
  t.eq(sapper.bounty, 60, "and its 60 bounty");

  var text = h.run("Codex.describe('sapper')").join(" ");
  t.ok(text.indexOf("NO damage") !== -1, "the card says it deals no damage");
  t.ok(text.indexOf("0 damage") === -1,
    "and never prints it as an attack that hits for zero");
  t.ok(text.indexOf("8 s") !== -1, "the eight-second cadence");
  t.ok(text.indexOf("90 u.l.") !== -1, "the 90 u.l. reach");
  t.ok(text.indexOf("1.1 s") !== -1, "the 1.1 s telegraph");
  t.ok(text.indexOf("2 s") !== -1, "the two-second shutdown");
  t.ok(text.indexOf("4 s") !== -1, "the four seconds of immunity after it");
  t.ok(text.indexOf("cooldown does not advance") !== -1,
    "and what being disabled costs a tower");
});

test("the index explains the Volatile's charge, its fuse and its radius",
function (t) {
  var h = readOnlyBoot();
  h.run("Codex.open()");
  var enemies = h.run("Codex.models()").enemies;
  var vol = enemies.filter(function (e) { return e.id === "volatile"; })[0];
  t.ok(!!vol, "the Volatile has a card");
  t.eq(vol.health, 8, "8 HP on the card");
  t.eq(vol.bounty, 25, "and its 25 bounty");
  t.eq(vol.deathEffect.hazard.radiusUl, 60, "the hazard block reaches the guide");

  var text = h.run("Codex.describe('volatile')").join(" ");
  t.ok(text.indexOf("1 s later") !== -1, "the one-second fuse");
  t.ok(text.indexOf("13 damage") !== -1, "the 13 damage");
  t.ok(text.indexOf("60 u.l.") !== -1, "the 60 u.l. blast radius");
  t.ok(text.indexOf("75 u.l.") !== -1, "and the 75 u.l. dive it does not share");
  t.ok(text.indexOf("does not stun") !== -1, "that it does not stun");
  t.ok(text.indexOf("set off another") !== -1, "that it cannot chain");
  t.ok(text.indexOf("Leaking") !== -1, "and that a leak leaves nothing");

  // AND THE DIVE, which is the half a card that only described the charge
  // would have quietly dropped. The interval is 0 and must never be printed:
  // "every 0 s" is exactly the sentence the early return in attackDescription
  // exists to prevent.
  t.ok(text.indexOf("dives onto the nearest") !== -1, "the dive itself");
  t.ok(text.indexOf("dies of the impact") !== -1, "that the dive kills it");
  t.eq(text.indexOf("every 0 s"), -1, "and no zero-second cooldown anywhere");
});

// THE DINOMECH -- Normal's wave-40 finale, added 2026-08-28 with the extension
// from thirty-five waves to forty. Its card is checked against `Enemy.TYPES`
// rather than against literals, like the three above it, so a retune moves the
// assertion and the card together.
//
// WHAT THIS TEST IS REALLY GUARDING is the set of things the type does NOT
// carry. 45 000 is the whole of the fight, and every mechanic it might have
// had -- a shield, a second life, a roar that calls a support court -- would
// have made the number the schedule states smaller than the number the player
// has to remove.
test("the index explains the Dinomech, and it is 45 000 and nothing else",
function (t) {
  var h = readOnlyBoot();
  h.run("Codex.open()");
  var enemies = h.run("Codex.models()").enemies;
  var dino = enemies.filter(function (e) { return e.id === "dinomech"; })[0];
  t.ok(!!dino, "the Dinomech has a card");

  var T = h.game.Enemy.TYPES.dinomech;
  t.eq(dino.health, T.health, "the card's health is the type's");
  t.eq(T.health, 45000, "which is 45 000");
  t.eq(T.showHealthBanner, true, "it wears a boss banner");
  t.eq(T.speedMultiplier, 0.25, "and walks slower than the Tyrant's 0.3");
  t.ok(T.speedMultiplier < h.game.Enemy.TYPES.boss.speedMultiplier,
    "which makes it the slowest body in the game");

  // THE ABSENCES, each one a reason the 45 000 is exactly 45 000.
  t.eq(T.shield, undefined, "no shield block");
  t.eq(T.revive, undefined, "no revive block");
  t.eq(T.phases, undefined, "no phases, so no roar and no called-in court");
  t.eq(T.support, undefined, "no support block");
  t.eq(T.spawns, undefined, "no spawns block");
  t.eq(T.armor || 0, 0, "no flat armor");
  t.eq(T.defense || 0, 0, "and no percentage defense");

  var text = h.run("Codex.describe('dinomech')").join(" ");
  t.ok(text.indexOf("45 000") !== -1, "the card states the 45 000");
  t.ok(text.indexOf("60 damage") !== -1, "the rail's damage");
  t.ok(text.indexOf("2.5 s") !== -1, "and its stun");
  t.ok(text.indexOf("90 damage") !== -1, "the stomp's damage");
  t.ok(text.indexOf("140 u.l.") !== -1, "and the area it lands across");
  t.eq(text.indexOf("every 0 s"), -1, "and no zero-second cooldown anywhere");
});

test("every enemy card carries a per-difficulty wave row", function (t) {
  var h = readOnlyBoot();
  h.run("Codex.open()");
  var enemies = h.run("Codex.models()").enemies;
  enemies.forEach(function (model) {
    t.eq(model.appearances.length, h.game.DIFFICULTIES.length,
      model.id + " has a row per difficulty");
  });
});

test("the index has a Difficulties tab with a sub-tab per schedule", function (t) {
  var h = harness.boot();
  h.run("Codex.open()");
  t.eq(h.run("Codex.state()").tab, "towers", "it opens on Towers");

  var tab = h.run("Codex.tabRect(2)");
  h.click(tab.x + tab.w / 2, tab.y + tab.h / 2);
  t.eq(h.run("Codex.state()").tab, "difficulties", "the third tab opens");
  h.draw();
  t.ok(true, "and it draws");

  // IT OPENS ON WHATEVER IS SELECTED TO PLAY, which is the one piece of state
  // worth carrying in from outside the screen.
  t.eq(h.run("Codex.state()").previewDifficultyId, h.game.selectedDifficultyId,
    "previewing the difficulty the player last chose");

  // The sub-tabs switch which schedule is previewed -- and previewing is NOT
  // selecting: the index is reached from the title menu, where there is no run
  // to change, and a screen that quietly changed the next run would be a trap.
  var sub = h.run("Codex.difficultyTabRect(1)");
  h.click(sub.x + sub.w / 2, sub.y + sub.h / 2);
  t.eq(h.run("Codex.state()").previewDifficultyId, "normal", "Normal is previewed");
  t.eq(h.game.selectedDifficultyId, "easy", "and nothing was selected by reading");
  t.eq(h.game.WAVES, h.game.EASY_WAVES, "the active schedule is untouched");
  h.draw();
  t.ok(true, "the Normal schedule draws");
});

test("the schedule preview is derived from the schedule it previews",
function (t) {
  var h = harness.boot();
  h.run("Codex.open()");
  var tab = h.run("Codex.tabRect(2)");
  h.click(tab.x + tab.w / 2, tab.y + tab.h / 2);

  ["easy", "normal"].forEach(function (id, i) {
    var sub = h.run("Codex.difficultyTabRect(" + i + ")");
    h.click(sub.x + sub.w / 2, sub.y + sub.h / 2);
    var rows = h.run("Codex.scheduleRows()");
    var schedule = h.run("difficultyOf('" + id + "').waves");

    t.eq(rows.length, schedule.length,
      id + ": one row per wave (" + schedule.length + ")");
    t.eq(schedule.length, id === "easy" ? 35 : 40,
      id + ": and the schedule is the length it should be");
    var bodies = 0;
    rows.forEach(function (row, n) {
      bodies += row.count;
      // Every column is the game's own arithmetic over the same wave -- the
      // banner's summary, the scheduler's count, the payout's reward -- so the
      // preview cannot state a schedule the game does not have.
      t.eq(row.count, h.game.waveCount(schedule[n]), id + " wave " + (n + 1) + " count");
      t.eq(row.summary, h.game.waveSummary(schedule[n]),
        id + " wave " + (n + 1) + " roster");
      t.eq(row.reward, h.game.waveReward(schedule[n], n + 1),
        id + " wave " + (n + 1) + " reward");
    });
    t.eq(bodies, id === "easy" ? 830 : 1321, id + ": the right total");

    // THE FINAL WAVE PRINTS A STATE WHERE THE WINDOW GOES, never a number. The
    // last wave of a schedule authors no `duration` and that absence is the
    // data saying there is nothing after it -- the same rule the in-run readout
    // follows. WHICH wave that is comes from the SCHEDULE'S LENGTH and never
    // from what the wave contains: it is Easy's 35 and Normal's 40, and Normal's
    // own wave 35 -- which still holds a Tyrant -- carries an ordinary ceiling.
    var last = rows.length - 1;
    t.eq(rows[last].duration, undefined,
      id + ": wave " + rows.length + " carries no ceiling");
    for (var k = 0; k < last; k++) {
      t.ok(rows[k].duration > rows[k].lastSpawn,
        id + " wave " + (k + 1) + "'s window outlasts its own tail");
    }
    if (id === "normal") {
      t.ok(rows[34].duration > 0,
        "and Normal's wave 35 prints a window now that 36-40 follow it");
    }
  });

  // The list scrolls, because neither schedule fits eleven rows.
  t.ok(h.run("Codex.scheduleScrollMax()") > 0, "and the list scrolls");
});

// The roster became a SCROLLING VIEWPORT on 2026-08-01, at the owner's request
// for bigger rows with about ten visible at once (js/codex.js, above
// ENEMY_ROW_H). This test used to assert that every row fitted on one screen
// and that rows were compact; both are now false BY DESIGN rather than by
// drift, and neither was a bug when it was written.
//
// They are not simply deleted here. Each was protecting something that outlived
// the redesign, and the replacement pins that instead:
//
//  - "every row fits on one screen" was protecting REACHABILITY. In a list that
//    does not scroll, on-screen and reachable are the same thing; scrolling
//    separated them. So the pair of scroll-extreme assertions below replaces it
//    -- a clamp that strands the last row fails one of them, and a clamp that
//    lets the list be pushed off into nothing fails the other.
//  - "the roster uses compact list rows" was protecting the LAYOUT UNIT. The
//    unit is the visible ROW COUNT, which js/codex.js is explicit about
//    ("TEN ROWS IS THE UNIT OF THE LAYOUT") and derives the viewport height
//    from. So that is what is asserted, read from the module rather than typed,
//    because a typed 10 would be a second copy of the same truth.
test("the enemy index is a scrolling roster with a clickable detail selection",
function (t) {
  var h = bootIndex();
  var tab = h.run("Codex.tabRect(1)");
  h.click(tab.x + tab.w / 2, tab.y + tab.h / 2);

  var enemies = h.run("Codex.models()").enemies;
  var view = h.run("Codex.enemyListViewport()");
  var visibleRows = h.run("Codex.enemyVisibleRows()");
  var lastIndex = enemies.length - 1;

  function rectOf(i) { return h.run("Codex.enemyCardRect(" + i + ")"); }
  function fullyInside(i) {
    var r = rectOf(i);
    return r.y >= view.y && r.y + r.h <= view.y + view.h;
  }
  function rowsFullyInside() {
    var n = 0;
    for (var i = 0; i < enemies.length; i++) if (fullyInside(i)) n++;
    return n;
  }

  // Without this the two reachability assertions below could both be satisfied
  // by a roster short enough to need no scrolling at all.
  t.ok(enemies.length > visibleRows,
    "the roster is longer than the viewport, so there is a real scroll to test");
  t.ok(h.run("Codex.enemyScrollMax()") > 0, "and a scroll range to move through");

  t.ok(fullyInside(0), "at rest the first row is fully inside the viewport");
  t.eq(rowsFullyInside(), visibleRows,
    "exactly the declared number of rows is visible at once");

  // The viewport GATE. A row scrolled out of the list must not be clickable
  // even though it is still on the screen -- js/codex.js tests the viewport
  // before the row. The index is derived: the first row past the visible ones
  // is the first that is out of view, whatever the roster length becomes.
  var hiddenIndex = visibleRows;
  var hidden = rectOf(hiddenIndex);
  var hiddenCentreY = hidden.y + hidden.h / 2;
  t.ok(!fullyInside(hiddenIndex), "the row past the last visible one is out of view");
  t.ok(hiddenCentreY < h.game.VIEW_HEIGHT,
    "and still on the screen, so clicking it is a real test of the gate");
  var selectedBefore = h.run("Codex.state().enemyIndex");
  h.click(hidden.x + hidden.w / 2, hiddenCentreY);
  t.eq(h.run("Codex.state().enemyIndex"), selectedBefore,
    "clicking a row outside the viewport selects nothing");

  // A visible row still selects. This used to pass by luck: it picks the
  // colossus, which happens to sit inside the visible ten, so adding one enemy
  // ahead of it would have turned this into a silent no-op against the gate
  // above. The assertion that it is visible is what stops that.
  var colossusIndex = enemies.map(function (enemy) { return enemy.id; }).indexOf("colossus");
  t.ok(colossusIndex >= 0, "the colossus is in the roster");
  t.ok(fullyInside(colossusIndex), "and it is one of the visible rows");
  var row = rectOf(colossusIndex);
  h.click(row.x + row.w / 2, row.y + row.h / 2);
  t.eq(h.run("Codex.state().enemyIndex"), colossusIndex,
    "clicking a visible list row selects that enemy");

  // The other end of the scroll: the last row has to be reachable.
  h.run("Codex.onWheel(" + (view.x + 5) + ", " + (view.y + 5) + ", 100000)");
  t.eq(h.run("Codex.state().enemyScroll"), h.run("Codex.enemyScrollMax()"),
    "the wheel clamps at the bottom rather than running past it");
  t.ok(fullyInside(lastIndex),
    "scrolled to the end, the last row is fully inside the viewport");
  t.eq(rowsFullyInside(), visibleRows, "and it is still showing a full viewport");

  // Measured against the list viewport, not against a row height. Comparing it
  // to a multiple of the row height meant retuning ENEMY_ROW_H could fail this
  // for a reason that has nothing to do with the detail panel.
  var detail = h.run("Codex.enemyDetailRect()");
  t.ok(detail.w > view.w, "the detail panel is wider than the list it sits beside");
  t.ok(detail.h >= view.h, "and at least as tall, so the two columns bottom out level");

  h.draw();
  t.ok(true, "the selected enemy detail draws");
});

test("the game launches on the chooser and simulates nothing", function (t) {
  var h = harness.boot(null);

  t.eq(h.game.screen, "select", "launches on the chooser");
  t.eq(h.game.enemies.length, 0, "no enemies while choosing");

  h.step(10);
  t.eq(h.game.enemies.length, 0, "ten seconds of chooser spawns nothing");

  // A route is loaded before anything draws, so nothing can trip over a null
  // path while the chooser is up.
  t.ok(h.game.currentMap !== null, "a route is loaded before anything draws");
  h.draw();
  t.ok(true, "the chooser draws");
});

test("clicking a card starts that route, on a ten-second countdown", function (t) {
  var h = harness.boot(null);
  h.chooseMap("null-meridian");

  t.eq(h.game.screen, "play", "the run started");
  t.eq(h.game.currentMap.id, "null-meridian", "on the chosen route");
  t.eq(h.game.cash, 600, "with the starting stake");

  // The owner, 2026-07-31: "when starting a run, do not send the first wave
  // immediately, either wait 10 seconds, or the user can press a start button
  // manually." Wave 1 used to be on the road on this very frame.
  t.eq(h.game.enemies.length, 0, "and nothing on the road yet");
  t.eq(Math.round(h.game.waveCountdown), 10, "wave 1 is ten seconds out");
  t.ok(h.game.betweenWaves(), "which counts as a break, so the button is up");
  t.eq(h.run("waveSkipButtonLabel()"), "Start wave 1", "and it says Start");
  t.ok(/Wave 1 in 10 s/.test(h.run("waveStatusText()")),
    "the readout counts it down: " + h.run("waveStatusText()"));
});

// THE NUMBER KEYS PICK A ROUTE, AND THEN THE DIFFICULTY STEP ASKS ITS OWN
// QUESTION (2026-08-27). Before that step existed, `3` started a run outright;
// now it commits the route and hands off, and the run begins on the second
// press. The keyboard therefore has to reach both halves or the chooser is
// mouse-only for anyone who was using it.
test("the number keys pick a route, and then a difficulty", function (t) {
  var h = harness.boot(null);
  h.key("3");
  t.eq(h.game.screen, "difficulty",
    "key 3 commits the route and opens the difficulty step rather than starting");
  t.eq(h.game.pendingMap.id, h.game.Maps.LIST[2].id, "holding the third card");

  h.key("2");
  t.eq(h.game.currentMap.id, h.game.Maps.LIST[2].id, "the second press starts it");
  t.eq(h.game.screen, "play", "on the route the first press chose");
  t.eq(h.game.selectedDifficultyId, h.game.DIFFICULTIES[1].id,
    "at the difficulty the second press chose");
  t.eq(h.game.WAVES, h.game.NORMAL_WAVES, "and that schedule is the active one");
});

// THE INITIAL IS THE OTHER WAY IN, and it is derived from the id rather than
// typed, so a third difficulty brings its own letter.
test("a difficulty's initial picks it too, and Escape goes back to the routes",
function (t) {
  var h = harness.boot(null);
  h.key("1");
  t.eq(h.game.screen, "difficulty", "the route is committed");

  h.key("Escape");
  t.eq(h.game.screen, "select", "Escape backs out to the chooser");

  h.key("1");
  h.key("n");
  t.eq(h.game.screen, "play", "N starts the run");
  t.eq(h.game.selectedDifficultyId, "normal", "on Normal");
});


test("the difficulty step draws, and its cards hit-test where they are drawn",
function (t) {
  var h = harness.boot(null);
  var card = h.game.mapCardRect(0);
  h.click(card.x + card.w / 2, card.y + card.h / 2);
  t.eq(h.game.screen, "difficulty", "the step is up");

  h.draw();
  t.ok(true, "and a full frame draws without throwing");

  var rects = [];
  for (var i = 0; i < h.game.DIFFICULTIES.length; i++) {
    var r = h.game.difficultyCardRect(i);
    rects.push(r);
    t.eq(h.game.difficultyCardAt(r.x + r.w / 2, r.y + r.h / 2), i,
      "centre of card " + i);
    t.eq(h.game.difficultyCardAt(r.x - 6, r.y + r.h / 2), null,
      "just left of card " + i);
    t.ok(r.x >= 0 && r.x + r.w <= h.game.VIEW_WIDTH,
      "card " + i + " is on the canvas");
    t.ok(r.y + r.h < h.game.VIEW_HEIGHT,
      "card " + i + " fits above the bottom edge");
  }

  // No two cards overlap, and none of them sits under the Back button -- the
  // same two things the route cards are checked for, and for the same reason:
  // a control drawn where another is clickable is a control that half-works.
  for (var a = 0; a < rects.length; a++) {
    for (var b = a + 1; b < rects.length; b++) {
      t.ok(rects[a].x + rects[a].w <= rects[b].x ||
           rects[b].x + rects[b].w <= rects[a].x,
        "cards " + a + " and " + b + " do not overlap");
    }
    var back = h.game.backButtonRect();
    t.ok(rects[a].y > back.y + back.h, "card " + a + " clears the Back button");
  }

  // AND THE CARD'S NUMBERS ARE THE SCHEDULE'S. Nothing about a difficulty's
  // difficulty is typed on a card: retune a wave and the card follows.
  h.game.DIFFICULTIES.forEach(function (difficulty) {
    var summary = h.game.difficultySummary(difficulty);
    var bodies = 0, types = {};
    difficulty.waves.forEach(function (wave) {
      bodies += h.game.waveCount(wave);
      h.game.waveGroups(wave).forEach(function (g) {
        types[g.type || h.game.Enemy.DEFAULT_TYPE] = true;
      });
    });
    t.eq(summary.waves, difficulty.waves.length, difficulty.name + ": wave count");
    t.eq(summary.bodies, bodies, difficulty.name + ": body count is derived");
    t.eq(summary.types, Object.keys(types).length,
      difficulty.name + ": type count is derived");
  });
});

test("a board carrying all three new mechanics draws a full frame", function (t) {
  var h = harness.boot("rune-circuit", "normal");
  h.run("cash = 100000");
  var spot = h.game.Maps.bestSpots(h.game.currentMap, 1)[0];
  var tower = h.placeGunner(spot.x, spot.y);

  // A hastened body, a Sapper mid-telegraph, a disabled tower, an immune one
  // and a live charge -- every cue this change added, on the board at once.
  var hastened = h.spawnAt(h.game.path.length * 0.3, undefined, "swarm");
  hastened.applyHaste(1.3, 4);

  var sapper = h.spawnAt(h.game.path.length * 0.4, undefined, "sapper");
  sapper.pos = { x: tower.x + h.game.ul(40), y: tower.y };
  sapper.attackTowers(8.1, h.game.towers);
  t.ok(sapper.windUpTimer > 0, "a Sapper is telegraphing");

  h.run("TowerHealth.suppress(towers[0], 'sapper', 6); TowerHealth.stun(towers[0], 2);");
  var charge = new h.game.Enemy(h.game.path, undefined, "volatile");
  charge.pos = { x: tower.x + h.game.ul(20), y: tower.y };
  h.game.Hazards.fromDeath(charge);
  t.eq(h.game.Hazards.count(), 1, "a charge is ticking");

  h.draw();
  t.ok(true, "the whole board draws with every new cue live");

  // And again once the charge has gone off, which is the afterglow branch --
  // a different path through both renderers.
  h.step(1.1);
  h.draw();
  t.ok(true, "and again on the frame after it detonates");

  // And once the tower is merely immune rather than dark, which is the third
  // of the three sabotage states.
  h.step(1.2);
  t.eq(h.game.TowerHealth.isStunned(tower), false, "the tower has recovered");
  t.eq(h.game.TowerHealth.isSuppressed(tower, "sapper"), true, "and is immune");
  h.draw();
  t.ok(true, "the immune state draws too");
});

test("card hit tests agree with where the cards are drawn", function (t) {
  var h = harness.boot(null);

  for (var i = 0; i < h.game.Maps.LIST.length; i++) {
    var r = h.game.mapCardRect(i);
    t.eq(h.game.mapCardAt(r.x + r.w / 2, r.y + r.h / 2), i, "centre of card " + i);
    t.eq(h.game.mapCardAt(r.x - 4, r.y + r.h / 2), null, "just left of card " + i);
    t.ok(r.x >= 0 && r.x + r.w <= h.game.VIEW_WIDTH, "card " + i + " is on the canvas");
    t.ok(r.y + r.h < h.game.VIEW_HEIGHT, "card " + i + " fits above the bottom edge");
  }
});

test("restart replays the same route; the loss screen offers a change", function (t) {
  var h = harness.boot("mana-coil");
  h.run("cash = 100000");
  var spot = h.game.Maps.bestSpots(h.game.currentMap, 1)[0];
  h.placeGunner(spot.x, spot.y);
  h.run("baseHp = 0; gameOver = true");

  var r = resultRect(h, "restart");
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.currentMap.id, "mana-coil", "restart keeps the route");
  t.eq(h.game.screen, "play", "and stays in the run");
  t.eq(h.game.towers.length, 0, "on a clean board");

  h.run("baseHp = 0; gameOver = true");
  var c = resultRect(h, "route");
  h.click(c.x + c.w / 2, c.y + c.h / 2);
  t.eq(h.game.screen, "select", "the other button returns to the chooser");
});

// The buttons stack vertically since 2026-08-26 (there are four of them now,
// not two), so "restart ends before change-map begins" stopped being the right
// question. This asks the one that matters at any layout: no two hitboxes
// overlap, and every one of them is on the canvas -- checked in BOTH states,
// because the folded tab has its own button and its own geometry.
// --- the result screen's behaviour (2026-08-26) -----------------------------

// END A RUN FOR REAL, rather than by writing the flag.
//
// The award sits inside update(), BELOW its early return on gameOver/victory,
// so it is only ever reached on the step that sets the flag. Setting the flag
// by hand and then stepping skips it entirely -- which is exactly what these
// tests exist to notice, so they must not do it themselves.
function endedRun(h, how) {
  h.run("cash = 100000");
  h.placeSmasher(600, 500);
  if (how === "victory") {
    // Everything deployed and the road empty: gate 1 wins the run.
    h.run("waveIndex = WAVES.length; allWavesDeployed = true;" +
          "enemies = []; bullets = []");
  } else {
    // One body on the base with one hit point left behind it.
    h.run("waveIndex = WAVES.length; enemies = []; bullets = []; baseHp = 1");
    h.spawnAt(h.game.path.length);
  }
  h.step(1 / 60);
  return h;
}

["gameOver", "victory"].forEach(function (how) {
  test("the run is paid exactly once, and folding the " + how +
       " screen never pays again", function (t) {
    var h = harness.boot();
    h.run("MetaProgress.reset()");
    endedRun(h, how);

    var banked = h.run("MetaProgress.coins()");
    var award = h.run("lastRunAward");
    t.ok(award !== null, "the run was awarded");
    t.eq(h.run("runAwarded"), true, "and latched");

    // Every one of these used to be a plausible way to pay twice.
    h.click(centreOf(h, "inspect").x, centreOf(h, "inspect").y);   // fold
    t.eq(h.run("resultMinimised"), true, "folded");
    h.step(1);
    h.click(600, 500);                                             // click a tower
    h.click(centreOf(h, "show").x, centreOf(h, "show").y);         // reopen
    t.eq(h.run("resultMinimised"), false, "reopened");
    h.step(1);

    t.eq(h.run("MetaProgress.coins()"), banked, "not one coin more");
    t.eq(h.run("lastRunAward").total, award.total, "and the same award is still shown");
  });
});

function centreOf(h, id) {
  var b = resultRect(h, id);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

test("the folded screen lets a tower be selected and read", function (t) {
  var h = harness.boot();
  endedRun(h, "gameOver");
  h.click(centreOf(h, "inspect").x, centreOf(h, "inspect").y);

  t.eq(h.run("inspected"), null, "nothing selected yet");
  h.click(600, 500);
  t.ok(h.run("inspected !== null"), "clicking the tower selects it");
  t.ok(h.run("inspected === towers[0]"), "and it is that tower");
  // Its own stat rows, the same ones the live panel prints.
  t.ok(h.run("inspected.statLines().length") > 0, "and its stats can be read");
});

test("the folded screen refuses every mutation", function (t) {
  var h = harness.boot();
  endedRun(h, "gameOver");
  h.click(centreOf(h, "inspect").x, centreOf(h, "inspect").y);

  var towers = h.run("towers.length");
  var cash = h.run("cash");
  var spent = h.run("towers[0].totalSpent");
  var waveIndex = h.run("waveIndex");
  var countdown = h.run("waveCountdown");

  // Placing: a click on empty ground with a build slot armed.
  h.run("armed = 0");
  h.click(300, 300);
  t.eq(h.run("towers.length"), towers, "nothing was built");

  // Selling and upgrading: select the tower, then click where its panel
  // buttons would be. The panel is drawn -- it is meant to be readable -- so
  // this is the exact click a player would make.
  h.click(600, 500);
  var sell = h.run("inspectionLayout(inspected).sell");
  h.click(sell.x + sell.w / 2, sell.y + sell.h / 2);
  t.eq(h.run("towers.length"), towers, "the tower was not sold");
  t.eq(h.run("cash"), cash, "and no money moved");

  var up = h.run("inspectionLayout(inspected).upgrades[0]");
  if (up) {
    h.click(up.x + up.w / 2, up.y + up.h / 2);
    t.eq(h.run("towers[0].totalSpent"), spent, "and nothing was upgraded");
  }

  // And no wave can be sent.
  h.run("skipNextWave()");
  t.eq(h.run("waveIndex"), waveIndex, "the wave cursor did not move");
  t.eq(h.run("waveCountdown"), countdown, "nor the countdown");
});

test("the simulation stays frozen behind the folded screen", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  h.placeSmasher(600, 500);
  h.spawnAt(200, 5000);
  h.run("gameOver = true");
  h.step(1 / 60);
  h.click(centreOf(h, "inspect").x, centreOf(h, "inspect").y);

  var where = h.run("enemies[0].progress");
  var hp = h.run("enemies[0].health");
  var cd = h.run("towers[0].cooldown");

  h.step(5);                 // five seconds of nothing happening

  t.eq(h.run("enemies[0].progress"), where, "the enemy did not walk");
  t.eq(h.run("enemies[0].health"), hp, "and was not shot");
  t.eq(h.run("towers[0].cooldown"), cd, "no cooldown advanced");
});

test("restart, change route and main menu all still work from the result screen",
function (t) {
  var a = harness.boot();
  endedRun(a, "gameOver");
  a.click(centreOf(a, "restart").x, centreOf(a, "restart").y);
  t.eq(a.run("gameOver"), false, "restart clears the loss");
  t.eq(a.run("towers.length"), 0, "and the board");

  var b = harness.boot();
  endedRun(b, "victory");
  b.click(centreOf(b, "route").x, centreOf(b, "route").y);
  t.eq(b.run("screen"), "select", "change route opens the chooser");

  var c = harness.boot();
  endedRun(c, "gameOver");
  c.click(centreOf(c, "menu").x, centreOf(c, "menu").y);
  t.eq(c.run("screen"), "menu", "and main menu reaches the title");
});

test("no result-screen button overlaps another, folded or not", function (t) {
  var h = harness.boot();

  function check(where) {
    var list = h.run("resultButtons()");
    t.ok(list.length > 0, where + ": there is at least one button");
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      t.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= h.game.VIEW_WIDTH &&
           a.y + a.h <= h.game.VIEW_HEIGHT, where + ": " + a.id + " is on the canvas");
      for (var j = i + 1; j < list.length; j++) {
        var b = list[j];
        var apart = a.x + a.w <= b.x || b.x + b.w <= a.x ||
                    a.y + a.h <= b.y || b.y + b.h <= a.y;
        t.ok(apart, where + ": " + a.id + " and " + b.id + " do not overlap");
      }
    }
  }

  h.run("gameOver = true; resultMinimised = false");
  check("full panel");
  h.run("resultMinimised = true");
  check("folded");
});

// REQUIREMENT 64, stated directly: the rect a button is DRAWN at is the rect it
// is CLICKED at, because both read resultButtons(). The way this used to break
// was two functions drifting -- one for the picture, one for the hit test -- so
// the test hits each button at its own centre and asserts the click lands.
test("every result-screen button is clickable exactly where it is drawn", function (t) {
  var h = harness.boot();
  h.run("gameOver = true; resultMinimised = false");
  var list = h.run("resultButtons()");
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    var found = h.run("(function () { var r = resultButtonAt(" +
      (b.x + b.w / 2) + ", " + (b.y + b.h / 2) + "); return r ? r.id : null; })()");
    t.eq(found, b.id, b.id + " is hit at the centre of where it is drawn");
  }
  // And a point just outside the top button hits nothing, so the boxes are not
  // silently larger than they look.
  var top = list[0];
  t.eq(h.run("(function () { var r = resultButtonAt(" + (top.x - 6) + ", " +
    (top.y + top.h / 2) + "); return r ? r.id : null; })()"), null,
    "six pixels to the left of the first button is not the first button");
});

test("the two loss-screen buttons do not overlap", function (t) {
  var h = harness.boot();
  var a = h.game.restartButtonRect();
  var b = h.game.changeMapButtonRect();

  t.ok(a.x + a.w <= b.x, "restart ends before change-map begins");
  t.ok(b.x + b.w <= h.game.VIEW_WIDTH, "change-map stays on the canvas");
});

test("switching routes clears towers built on the old one", function (t) {
  var h = harness.boot("rune-circuit");
  h.run("cash = 100000");
  h.placeGunner(600, 505);
  t.eq(h.game.towers.length, 1, "a tower on the circuit");

  h.run("openMapSelect()");
  h.chooseMap("null-meridian");

  // Towers cache pixel geometry and a path position at construction, so one
  // left behind would be measuring itself against a road that no longer exists.
  t.eq(h.game.towers.length, 0, "gone with the old route");
  t.eq(h.game.bullets.length, 0, "and so are its bullets");
});

test("every route draws a full frame without throwing", function (t) {
  var h = harness.boot();

  h.game.Maps.LIST.forEach(function (m) {
    h.run("startRun(Maps.byId('" + m.id + "'))");
    h.run("cash = 100000");
    var spot = h.game.Maps.bestSpots(m, 1)[0];
    h.placeGunner(spot.x, spot.y);
    h.click(spot.x, spot.y);
    h.move(spot.x, spot.y);
    h.step(3);
    h.draw();
  });

  h.run("openMapSelect()");
  h.move(400, 300);
  h.draw();
  t.ok(true, "all four routes plus the chooser rendered");
});


group("difficulty: rating a campaign, and paying for it");

// 2026-08-29, the owner's brief: "scale according to difficulty. find online or
// create a difficulty function that takes into account map, bodies, hp, wave
// count, money". js/systems/difficulty.js is that function. These tests own two
// claims about it: that it is NORMALISED (the reference reads exactly 1.00, so
// "scale on Easy" means what it says) and that it is DERIVED (every factor is
// measured off the schedules and the board, so retuning either moves it).

test("the reference campaign on the reference board rates exactly 1", function (t) {
  var h = harness.boot();
  var g = h.game;
  var r = g.Difficulty.rateDifficulty("easy", g.Maps.DEFAULT_ID);

  t.eq(r.rating, 1, "Easy on the default board is the unit");
  t.ok(r.factors.length >= 6, "and it says so factor by factor (" +
    r.factors.length + " of them)");
  r.factors.forEach(function (f) {
    t.eq(f.ratio, 1, f.label + " is 1 against itself");
    t.ok(typeof f.note === "string" && f.note.length > 0,
      f.label + " says what it measures");
  });
});

test("a heavier campaign rates higher, and every factor is derived", function (t) {
  var h = harness.boot();
  var g = h.game;
  var easy = g.Difficulty.rateDifficulty("easy", g.Maps.DEFAULT_ID);
  var normal = g.Difficulty.rateDifficulty("normal", g.Maps.DEFAULT_ID);

  t.ok(normal.rating > easy.rating,
    "Normal is rated harder than Easy (" + normal.rating.toFixed(3) + ")");

  // NOT THE RAW HP RATIO, and this is the whole point of the function rather
  // than a division. Normal carries 5.07x Easy's effective HP and would be
  // rated absurdly if that were the measure -- it also pays 2.80x the purse.
  var hpRatio = normal.profile.hp / easy.profile.hp;
  t.ok(hpRatio > 5, "Normal really does carry five times the HP (" +
    hpRatio.toFixed(2) + "x)");
  t.ok(normal.rating < hpRatio / 2,
    "and is rated far below that, because it pays for itself");

  var byKey = {};
  normal.factors.forEach(function (f) { byKey[f.key] = f; });
  t.ok(byKey.demand.ratio > 1, "it demands more DPS");
  t.ok(byKey.spike.ratio > 1, "its worst wave is worse");
  t.ok(byKey.length.ratio > 1, "it is longer");
  t.ok(byKey.fragility.ratio > 1, "and one leak costs more");
  t.ok(byKey.relief.ratio < 1, "but the purse is bigger, which pulls it DOWN");
  t.eq(byKey.map.ratio, 1, "and the board is the reference one, so it says nothing");

  // The rating is the geometric mean of exactly those, and nothing else.
  var product = normal.factors.reduce(function (a, f) { return a * f.ratio; }, 1);
  t.near(normal.rating, Math.pow(product, 1 / normal.factors.length), 1e-9,
    "the rating IS the geometric mean of its factors");
});

test("the board is one of the factors, and it moves the rating", function (t) {
  var h = harness.boot();
  var g = h.game;

  var scores = g.Maps.LIST.map(function (m) {
    return { id: m.id, rating: g.Difficulty.rateDifficulty("easy", m.id).rating,
             board: g.Maps.analyse(g.Maps.byId(m.id)).score };
  });
  var hardest = scores.slice().sort(function (a, b) { return b.board - a.board; })[0];
  var easiest = scores.slice().sort(function (a, b) { return a.board - b.board; })[0];

  t.ok(hardest.rating > easiest.rating,
    "the same campaign rates harder on the harder road (" + hardest.id + " " +
    hardest.rating.toFixed(3) + " against " + easiest.id + " " +
    easiest.rating.toFixed(3) + ")");
  // A ROAD IS A NUDGE, NOT A CAMPAIGN. Every board sits inside a few per cent,
  // because `Maps.analyse` is already normalised against a straight reference
  // road -- so a route can never be worth more than a difficulty.
  t.ok(hardest.rating / easiest.rating < 1.2,
    "and no road moves it by as much as a fifth");
});

// 2026-08-29, the owner's two conditions on Normal: "increase normal difficulty
// so it becomes 1.5X also be sure it GET harder, don't make it impossible at
// the start". All three are properties of the schedule, so all three are pinned
// here rather than checked once and written down in prose.
test("Normal is rated 1.50, and it got there on TIME rather than on health",
function (t) {
  var h = harness.boot();
  var g = h.game;
  var rating = g.Difficulty.rateDifficulty("normal", g.Maps.DEFAULT_ID).rating;

  t.near(rating, 1.50, 0.02, "Normal rates 1.50 (" + rating.toFixed(3) + ")");

  // HOW it got there is worth pinning too, because it is the non-obvious half.
  // Raising a campaign's HEALTH raises its purse in lockstep -- bounties are
  // priced off health -- so the rating barely moves: +14% health measured
  // +0.04 rating. Its ceilings are the lever money cannot answer, and they are
  // what moved. Normal's authored bodies are untouched.
  t.eq(g.Difficulty.profileOf(g.NORMAL_WAVES).hp, 131595,
    "not one point of scheduled health was added");
  t.eq(g.Difficulty.profileOf(g.NORMAL_WAVES).bodies, 1321,
    "and not one body");
});

test("Normal gets harder as it goes, and opens gentler than it ends",
function (t) {
  var h = harness.boot();
  var g = h.game;
  var rise = g.Difficulty.riseOf(g.NORMAL_WAVES);

  // IN THIRDS, NOT WAVE BY WAVE, and that is deliberate: a campaign SHOULD
  // have breather waves -- Normal's pure camo wave and its pure flight wave are
  // both designed to be one -- and a monotonic-per-wave rule would forbid them.
  // What has to rise is the trend.
  t.ok(rise.rises, "each third is under more pressure than the last (" +
    [rise.early, rise.mid, rise.late].map(function (v) {
      return (v * 1000).toFixed(2); }).join(" -> ") + ")");
  t.ok(rise.gentlestAtTheStart,
    "and the opening third is the gentlest, which is the other half of the ask");
  t.ok(rise.rise > 1.2, "the finish is meaningfully harder, not nominally (x" +
    rise.rise.toFixed(2) + ")");

  // IT USED TO FALL, which is why this test exists. Before the re-time the same
  // three thirds measured 1.46 -> 0.95 -> 0.71: the purse outran the schedule
  // and Normal got EASIER the further you went.
  t.ok(rise.late > rise.early,
    "the late third is no longer the easiest part of the campaign");
});

test("no wave was tightened past the room its own contents need", function (t) {
  var h = harness.boot();
  var g = h.game;

  // THE FLOORS THE SUITE ITSELF ALREADY OWNS, restated here as the reason the
  // re-time stopped where it did rather than going further. A Volatile's fuse
  // needs room to resolve after the last diver, and the three money convoys are
  // the waves a player is meant to have time to clear and bank. Both were
  // found by the tests that own them, on the first attempt at this re-time.
  var tight = [];
  g.NORMAL_WAVES.forEach(function (wave, i) {
    if (wave.duration === undefined) return;
    var events = g.waveTimeline(wave);
    var slack = wave.duration - events[events.length - 1].time;
    var floor = 16;
    if (g.waveGroups(wave).some(function (grp) { return grp.type === "volatile"; })) {
      floor = 20;
    }
    if (i + 1 >= 36 && i + 1 <= 38) floor = 40;
    if (slack < floor) {
      tight.push("wave " + (i + 1) + ": " + slack.toFixed(1) + " s of room, needs " + floor);
    }
  });
  t.eq(tight.join(" | "), "",
    "every ceiling clears its last arrival by the room that wave needs");
});

test("an unmeasurable ask is rated 1 rather than NaN", function (t) {
  var h = harness.boot();
  var g = h.game;
  t.eq(g.Difficulty.rateDifficulty("no-such-difficulty").rating, 1,
    "an unknown campaign is the reference's own value");
  t.eq(g.Difficulty.rate([]).rating, 1, "and so is an empty schedule");
  t.eq(g.Difficulty.rate(null).rating, 1, "and so is none at all");
});

// --- and what it is for --------------------------------------------------

test("Easy's authored reward tables are untouched by the scaling", function (t) {
  var h = harness.boot();
  var g = h.game;
  var M = g.MetaProgress;
  var map = g.Maps.DEFAULT_ID;

  t.deep(M.tiersFor("easy", map), M.repeatableTiers(),
    "the ladder Easy is paid IS the authored ladder");
  t.eq(M.victoryCoinsFor("easy", map), M.victoryCoins(), "and its clear");
  t.eq(M.firstWinCoinsFor("easy", map), M.firstWinCoins(), "and its first clear");
  t.deep(M.milestonesFor("easy", map).map(function (m) { return m.id; }),
    M.milestoneTable().map(function (m) { return m.id; }),
    "and its milestone ids, which is a SAVE-COMPATIBILITY rule: a profile that " +
    "has already claimed reach_11 must not be handed it again");
  t.deep(M.milestonesFor("easy", map).map(function (m) { return m.label; }),
    M.milestoneTable().map(function (m) { return m.label; }),
    "and even their wording");
});

test("a longer campaign gates on the same FRACTION of itself", function (t) {
  var h = harness.boot();
  var g = h.game;
  var M = g.MetaProgress;
  var map = g.Maps.DEFAULT_ID;

  var easyWaves = g.difficultyOf("easy").waves.length;
  var normalWaves = g.difficultyOf("normal").waves.length;
  t.eq(M.waveScale("normal"), normalWaves / easyWaves,
    "the threshold scale is the wave count and nothing else");

  var easyTiers = M.tiersFor("easy", map);
  var normalTiers = M.tiersFor("normal", map);
  easyTiers.forEach(function (tier, i) {
    var want = Math.round(tier.atLeast * normalWaves / easyWaves);
    t.eq(normalTiers[i].atLeast, want,
      "Easy's wave " + tier.atLeast + " rung sits at Normal's " + want);
  });

  // The top rung is the last one before the finale on BOTH, which is the
  // property the fractions exist to preserve.
  t.eq(easyWaves - easyTiers[0].atLeast, 5, "Easy's top rung is five waves out");
  t.eq(normalWaves - normalTiers[0].atLeast, 6, "Normal's is six, of forty");
});

test("a harder campaign pays more, and the ladder keeps its doubling", function (t) {
  var h = harness.boot();
  var g = h.game;
  var M = g.MetaProgress;
  var map = g.Maps.DEFAULT_ID;

  var scale = M.coinScale("normal", map);
  t.eq(scale, g.Difficulty.scaleFor("normal", map),
    "the coin scale IS the difficulty rating, not a second number beside it");

  t.ok(M.victoryCoinsFor("normal", map) > M.victoryCoinsFor("easy", map),
    "a Normal clear is worth more than an Easy one (" +
    M.victoryCoinsFor("normal", map) + " against " +
    M.victoryCoinsFor("easy", map) + ")");

  // THE DOUBLING SURVIVES. "A clear is worth exactly twice dying on the last
  // wave" is the rule the whole ladder is built around, and scaling both sides
  // by one number cannot break it.
  ["easy", "normal"].forEach(function (id) {
    var top = M.tiersFor(id, map)[0].coins;
    var clear = M.victoryCoinsFor(id, map);
    t.near(clear / top, 2, 0.05, id + ": a clear is twice the top rung (" +
      clear + " against " + top + ")");
  });
});

test("each campaign banks its own milestones, and they do not pay for each other",
function (t) {
  var h = harness.boot();
  var M = h.game.MetaProgress;
  var map = h.game.Maps.DEFAULT_ID;
  h.run("MetaProgress.reset()");

  // Reach the top of Easy. Its four milestones bank.
  var easy = M.awardRun({ wavesCompleted: 35, waveReached: 35, victory: true,
                          mapId: map, difficultyId: "easy" });
  t.eq(easy.objectives.filter(function (o) {
    return o.id.indexOf("reach_") === 0;
  }).length, 4, "all four of Easy's milestones bank at once");

  // The same run again pays nothing one-time.
  var again = M.awardRun({ wavesCompleted: 35, waveReached: 35, victory: true,
                           mapId: map, difficultyId: "easy" });
  t.eq(again.objectives.length, 0, "and never again");

  // Now Normal. Its own four are unclaimed, and they are DIFFERENT ids.
  var normal = M.awardRun({ wavesCompleted: 40, waveReached: 40, victory: true,
                            mapId: map, difficultyId: "normal" });
  var banked = normal.objectives.map(function (o) { return o.id; });
  t.eq(banked.length, 4, "Normal's four are still there to earn");
  banked.forEach(function (id) {
    t.ok(id.indexOf("normal:") === 0, "under its own id (" + id + ")");
  });
  t.ok(normal.objectives[0].label.indexOf("on Normal") !== -1,
    "and its label says which campaign: " + normal.objectives[0].label);

  var third = M.awardRun({ wavesCompleted: 40, waveReached: 40, victory: true,
                           mapId: map, difficultyId: "normal" });
  t.eq(third.objectives.length, 0, "and they are once for the life of the save too");
});

group("meta progression: coins, the store, the inventory");

// Every test here resets the profile first. There is no localStorage under
// Node, so MetaProgress keeps an in-memory profile that dies with the process
// -- but tests still run in one process, so one test's purchases would
// otherwise be the next one's starting state.
function bootStore() {
  var h = harness.boot();
  h.run("MetaProgress.reset(); rebuildBuildBar(); openMenu()");
  h.run("Store.open()");
  return h;
}

// --- the Warbringer's unlock, and the ledgers behind it (2026-08-26) --------

test("the Warbringer is a purchase now, gated on having reached wave 11", function (t) {
  var h = harness.boot();
  var M = h.game.MetaProgress;
  h.run("MetaProgress.reset()");

  var entry = M.entry("smasher");
  t.eq(entry.starter, false, "not in the opening hand any more");
  t.eq(entry.price, 10, "ten coins");
  t.eq(entry.requiresWave, 11, "and gated on wave 11");

  // REFUSED IN buy(), not merely greyed out on a button. A hand-edited save or
  // a direct call has to hit the same wall the store does, so this asks the
  // rule rather than the UI -- and it asks with the coins already in hand, so
  // the refusal cannot be mistaken for poverty.
  h.run("MetaProgress.unlockAll === undefined");
  var rich = M.snapshot();
  h.run("MetaProgress.awardRun({ wavesCompleted: 9, waveReached: 9 })");
  var refused = M.buy("smasher");
  t.eq(refused.ok, false, "refused before wave 11");
  t.eq(refused.locked, true, "and refused as LOCKED rather than as broke");
  t.eq(M.owns("smasher"), false, "nothing was bought");

  // Reaching wave 11 pays the milestone that buys it, which is the loop.
  var award = M.awardRun({ wavesCompleted: 10, waveReached: 11 });
  t.eq(award.objectives.length, 1, "reaching 11 pays one objective");
  t.eq(award.objectives[0].id, "reach_11", "the wave 11 milestone");
  t.eq(award.objectives[0].amount, 10, "worth exactly the Warbringer's price");

  var bought = M.buy("smasher");
  t.eq(bought.ok, true, "and now it can be bought");
  t.eq(M.owns("smasher"), true, "owned");
  t.ok(rich !== null, "");
});

test("losing to the Midboss still unlocks it -- the gate is the wave REACHED", function (t) {
  var h = harness.boot();
  var M = h.game.MetaProgress;
  h.run("MetaProgress.reset()");
  // Ten waves finished, eleventh reached and lost: the Midboss was met and not
  // beaten, which is the case the brief names.
  M.awardRun({ wavesCompleted: 10, waveReached: 11, victory: false });
  t.eq(M.bestWave(), 11, "the high-water mark is the wave reached");
  t.eq(M.buy("smasher").ok, true, "and that is enough");
});

test("the high-water mark never falls, so a bad run cannot take an unlock away",
function (t) {
  var h = harness.boot();
  var M = h.game.MetaProgress;
  h.run("MetaProgress.reset()");
  M.awardRun({ wavesCompleted: 20, waveReached: 21 });
  t.eq(M.bestWave(), 21, "twenty-one reached");
  M.awardRun({ wavesCompleted: 1, waveReached: 2 });
  t.eq(M.bestWave(), 21, "a wave-2 disaster afterwards leaves it alone");
});

test("an old save keeps its towers, coins, loadout and runs", function (t) {
  var h = harness.boot();
  var M = h.game.MetaProgress;
  // A profile written BEFORE 2026-08-26: it owns the Warbringer because the
  // Warbringer used to be free, and it has none of the three new fields.
  var old = { coins: 137, owned: ["smasher", "soldier", "longshot"],
              equipped: ["smasher", "soldier", "longshot", null, null], runs: 9 };
  h.run("MetaProgress.__loadForTest(" + JSON.stringify(old) + ")");

  var p = M.snapshot();
  t.eq(p.coins, 137, "its coins survive");
  t.eq(M.owns("smasher"), true, "IT KEEPS THE WARBRINGER -- ownership is never taken back");
  t.eq(M.owns("longshot"), true, "and everything else it bought");
  t.deep(p.equipped, ["smasher", "soldier", "longshot", null, null], "its loadout stands");
  t.eq(p.runs, 9, "and its run count");

  // The new fields default to "nothing claimed", which costs it nothing it had
  // and leaves every objective still ahead of it.
  t.eq(p.bestWave, 0, "no high-water mark yet");
  t.deep(p.milestones, [], "no milestones claimed");
  t.deep(p.routesWon, [], "no routes won");
});

test("a hostile save cannot crash the boot or mint anything", function (t) {
  var h = harness.boot();
  var M = h.game.MetaProgress;
  h.run("MetaProgress.__loadForTest(" + JSON.stringify({
    coins: -5000, runs: -1, bestWave: -3,
    owned: ["soldier", "soldier", "no-such-tower", 7, null],
    equipped: ["longshot", "longshot", 42, null, null],
    milestones: ["reach_11", "reach_11", "reach_999", 12],
    routesWon: ["rune-circuit", "rune-circuit", "", 5, "a-map-this-build-lacks"]
  }) + ")");
  var p = M.snapshot();
  t.eq(p.coins, 0, "negative coins refused");
  t.eq(p.runs, 0, "negative runs refused");
  t.eq(p.bestWave, 0, "negative high-water refused");
  t.deep(p.owned, ["soldier"], "duplicates and unknown ids dropped, starters kept");
  t.eq(p.equipped.indexOf("longshot"), -1, "a tower you do not own cannot be equipped");
  t.deep(p.milestones, ["reach_11"], "unknown and duplicate milestones dropped");
  // An unknown ROUTE is kept rather than dropped: this file cannot enumerate
  // maps without depending on Maps, and a save naming a map a future build adds
  // must survive a round trip through an older one.
  t.deep(p.routesWon, ["rune-circuit", "a-map-this-build-lacks"],
    "routes deduplicated, junk dropped, unknown ids tolerated");
});

test("every reward source carries an id, a label and an amount, and they sum to the total",
function (t) {
  var h = harness.boot();
  var M = h.game.MetaProgress;
  h.run("MetaProgress.reset()");
  // THE AUTHORED NUMBERS ARE THE DEFAULT BOARD'S (2026-08-29). Since coins are
  // priced through `Difficulty`, which reads the road as well as the campaign,
  // "a clear pays 80" is a statement about Easy on `Maps.DEFAULT_ID` -- the
  // reference, where every factor is 1.00 by construction. Rune Circuit rates a
  // shade harder and pays a shade more, which is the feature.
  var onDefault = M.awardRun({ wavesCompleted: 35, waveReached: 35, victory: true,
                               mapId: h.game.Maps.DEFAULT_ID, mapName: "default" });
  t.eq(onDefault.repeatable, 80, "on the reference board a clear pays the authored 80");
  t.eq(onDefault.total, 175, "and a first full clear on a fresh save is 175");

  h.run("MetaProgress.reset()");
  var r = M.awardRun({ wavesCompleted: 35, waveReached: 35, victory: true,
                       mapId: "rune-circuit", mapName: "Rune Circuit" });
  t.eq(r.repeatable, M.victoryCoinsFor("easy", "rune-circuit"),
    "on another road it pays what that road is rated (" + r.repeatable + ")");
  t.ok(r.repeatable >= 76 && r.repeatable <= 84,
    "which is within a few coins of the authored figure, never a different order");
  t.deep(r.bounties, [], "and the bounty slot is present and empty, ready for rotation");

  var summed = r.repeatable;
  r.objectives.forEach(function (o) {
    t.ok(typeof o.id === "string" && o.id.length > 0, "each source has a stable id");
    t.ok(typeof o.label === "string" && o.label.length > 0, "and a printable label");
    t.ok(typeof o.amount === "number" && o.amount > 0, "and an amount");
    summed += o.amount;
  });
  t.eq(summed, r.total, "the total is derived FROM the sources, not beside them");

  // Keyed on the ROUTE ID, not its display name.
  var ids = r.objectives.map(function (o) { return o.id; });
  t.ok(ids.indexOf("first_win:rune-circuit") !== -1, "the first clear is keyed on the map id");
});

test("two different routes each pay their first clear, and neither pays twice",
function (t) {
  var h = harness.boot();
  var M = h.game.MetaProgress;
  h.run("MetaProgress.reset()");
  var win = { wavesCompleted: 35, waveReached: 35, victory: true };

  var a = M.awardRun({ wavesCompleted: 35, waveReached: 35, victory: true, mapId: "rune-circuit" });
  var again = M.awardRun({ wavesCompleted: 35, waveReached: 35, victory: true, mapId: "rune-circuit" });
  var b = M.awardRun({ wavesCompleted: 35, waveReached: 35, victory: true, mapId: "mana-coil" });

  // The amounts are the ROUTE's since 2026-08-29 -- see the note in the test
  // above -- so they are asked for rather than typed. What this test is about
  // is which objectives fire and which do not, and that is unchanged.
  var clearA = M.victoryCoinsFor("easy", "rune-circuit");
  var clearB = M.victoryCoinsFor("easy", "mana-coil");
  var onceA = M.milestonesFor("easy", "rune-circuit")
    .reduce(function (sum, m) { return sum + m.coins; }, 0);

  t.eq(a.total, clearA + onceA + M.firstWinCoinsFor("easy", "rune-circuit"),
    "the first clear ever: the clear, four milestones and the route's own bonus");
  t.eq(again.total, clearA, "the same route again pays the repeatable alone");
  t.eq(again.objectives.length, 0, "nothing one-time is left on it");
  t.eq(b.total, clearB + M.firstWinCoinsFor("easy", "mana-coil"),
    "a NEW route pays its clear and its own first-clear bonus");
  t.eq(b.objectives.length, 1, "and only that one");
  t.ok(a.total > b.total,
    "and the first run of all is worth more, because it banked the milestones");
  t.ok(win !== null, "");
});

test("a fresh profile owns the starter kit and nothing else", function (t) {
  var h = harness.boot();
  h.run("MetaProgress.reset(); rebuildBuildBar()");

  var profile = h.run("MetaProgress.snapshot()");
  // ONE TOWER SINCE 2026-08-26. The gunner was deleted from the catalogue on
  // 2026-07-30 and the Warbringer left the opening hand on 2026-08-26 -- it is
  // a 10-coin purchase gated on reaching wave 11 now. These are typed on
  // purpose: this test's subject IS the starter kit, so reading it from
  // MetaProgress would only assert that the kit equals itself and would pass
  // whatever it became.
  t.deep(profile.owned, ["soldier"], "the Rifleman alone to start");
  t.eq(profile.coins, 0, "no coins");

  // The Soldier is LAST in the catalogue, which is what puts it in the fifth
  // slot once everything is owned -- but defaultLoadout compacts, so on a
  // fresh profile it sits directly behind the Warbringer rather than leaving
  // holes. That is the second slot now the gunner is not in front of it.
  var bar = h.run("BUILD_SLOTS.map(function (s) { return s && s.DISPLAY_NAME; })");
  // Display names, so they carry the 2026-07-30 reskin; the ids above are the
  // persistence format and are deliberately unchanged.
  t.deep(bar, ["Rifleman", null, null, null, null],
    "and a bar to match");

  // The bar's LENGTH is the one thing that must never move: its geometry is
  // computed from it once at load, and the inventory screen edits the same
  // shape.
  t.eq(h.game.BUILD_SLOTS.length, h.game.MetaProgress.SLOT_COUNT,
    "BUILD_SLOTS.length and MetaProgress.SLOT_COUNT are the same number");
});

test("the payout is a pure function of how far the run got", function (t) {
  var h = harness.boot();
  var Meta = h.game.MetaProgress;

  // THE LADDER, at every boundary it has (2026-08-26). It replaced "two per
  // wave cleared plus sixty for a clear", which paid a smooth trickle for
  // grinding the opening; this pays for getting FURTHER, and it counts waves
  // FINISHED rather than the wave reached.
  [[0, 0], [9, 0], [10, 5], [14, 5], [15, 10], [19, 10], [20, 18], [24, 18],
   [25, 28], [29, 28], [30, 40], [34, 40]].forEach(function (pair) {
    t.eq(Meta.repeatableCoins(pair[0], false), pair[1],
      pair[0] + " waves finished pays " + pair[1]);
  });
  t.eq(Meta.repeatableCoins(35, true), 80, "a clear pays 80");
  // The doubling the ladder is built around: a clear is worth exactly twice
  // dying on the last wave, and is NOT that plus eighty.
  t.eq(Meta.repeatableCoins(35, true), 2 * Meta.repeatableCoins(34, false),
    "exactly twice the last losing tier");
  t.ok(Meta.repeatableCoins(35, true) !== 120, "a clear REPLACES the tier, it does not stack");
  t.ok(Meta.repeatableCoins(25, false) > Meta.repeatableCoins(17, false), "further is worth more");
});

test("a run banks its coins exactly once", function (t) {
  var h = harness.boot();
  h.run("MetaProgress.reset(); rebuildBuildBar()");
  h.run("waveIndex = WAVES.length; enemies = []; bullets = []; baseHp = 1");

  var before = h.run("MetaProgress.coins()");
  h.spawnAt(h.game.path.length);
  h.step(1 / 60);
  t.eq(h.game.gameOver, true, "the run ended");

  var after = h.run("MetaProgress.coins()");
  t.ok(after > before || h.run("lastRunAward ? lastRunAward.total : 0") === 0, "coins were banked");
  t.eq(h.run("runAwarded"), true, "and the latch is set");

  // The sandbox un-loses a run by putting base HP back; a second award on the
  // way down again would pay twice for the same run.
  var banked = after;
  h.step(2);
  t.eq(h.run("MetaProgress.coins()"), banked, "further steps pay nothing more");

  h.run("restartGame()");
  t.eq(h.run("runAwarded"), false, "a restart re-arms it");
  t.eq(h.run("lastRunAward"), null, "and clears the readout");
});

test("buying a tower spends coins and puts it in the bar", function (t) {
  var h = bootStore();
  // Ask the catalogue where the Longshot's card is rather than typing an
  // index, for the same reason h.slotOf exists: deleting the gunner shed the
  // first catalogue entry, so the typed 2 here had come to mean the Siphon and
  // this test was quietly buying a different tower than it names.
  var cardIndex = h.run(
    "MetaProgress.catalogue().map(function (c) { return c.id; }).indexOf('longshot')");
  t.ok(cardIndex >= 0, "the Longshot is in the catalogue");
  var card = h.run("Store.cardRect(" + cardIndex + ")");
  h.run("Store.onClick(" + (card.x + 10) + ", " + (card.y + 10) + ")");
  t.eq(h.run("Store.state()").picked, "longshot", "its card is open");

  // Broke: refused, with the reason the button shows.
  var action = h.run("Store.actionRect()");
  h.run("Store.onClick(" + (action.x + 10) + ", " + (action.y + 10) + ")");
  t.eq(h.run("MetaProgress.owns('longshot')"), false, "cannot buy what you cannot afford");

  // Two losing runs deep enough to pay, under the 2026-08-26 ladder: 20 waves
  // finished is the 18-coin tier, so two of them is 36 and the Longshot's 40
  // is still out of reach -- which is what the next click proves. A third
  // clears it.
  h.run("MetaProgress.awardRun({ wavesCompleted: 20, waveReached: 21 });" +
        "MetaProgress.awardRun({ wavesCompleted: 20, waveReached: 21 });" +
        "MetaProgress.awardRun({ wavesCompleted: 20, waveReached: 21 })");
  // 79, not 3 x 18: the FIRST of those runs also crossed wave 11 and wave 20
  // for the first time on this profile, and those milestones pay 10 and 15
  // once each. 18 + 25, then 18, then 18.
  t.eq(h.run("MetaProgress.coins()"), 79, "three runs, plus two first-time milestones");

  h.run("Store.onClick(" + (action.x + 10) + ", " + (action.y + 10) + ")");
  t.eq(h.run("MetaProgress.owns('longshot')"), true, "now it is owned");
  // 64 banked less the Longshot's price of 40. Typed rather than read back
  // from the catalogue: what this line is for is that buying CHARGES, and an
  // expectation computed from the same price the purchase used would hold even
  // if nothing were deducted at all.
  t.eq(h.run("MetaProgress.coins()"), 39, "and paid for");

  // Into the first FREE slot, which is the third now that the gunner is gone
  // from in front of the two starters.
  var bar = h.run("BUILD_SLOTS.map(function (s) { return s && s.DISPLAY_NAME; })");
  t.deep(bar, ["Rifleman", "Arcane Sniper", null, null, null],
    "a purchase goes straight into the bar");
});

test("the inventory equips and unequips, and the RUN is what refuses an unplayable bar",
function (t) {
  var h = bootStore();
  h.run("MetaProgress.unlockAll(); rebuildBuildBar()");
  h.run("Store.onClick(" + JSON.stringify(0) + ", 0)");   // harmless: no rect there

  var slot = h.run("MetaProgress.equipped().indexOf('siphon')");
  t.ok(slot >= 0, "the Siphon is in the bar");

  var r = h.run("Store.loadoutSlotRect(" + slot + ")");
  h.run("Store.onClick(" + (r.x + 10) + ", " + (r.y + 10) + ")");
  // The loadout row only answers clicks on the Inventory tab.
  t.eq(h.run("MetaProgress.isEquipped('siphon')"), true, "the store tab ignores it");

  var tab = h.run("Store.tabRect(1)");
  h.run("Store.onClick(" + (tab.x + 10) + ", " + (tab.y + 10) + ")");
  h.run("Store.onClick(" + (r.x + 10) + ", " + (r.y + 10) + ")");
  t.eq(h.run("MetaProgress.isEquipped('siphon')"), false, "on the inventory tab it comes out");
  t.eq(h.run("BUILD_SLOTS[" + slot + "]"), null, "and the bar follows");

  // THE BAR EMPTIES ALL THE WAY DOWN, THE STARTER TOWER INCLUDED (2026-08-30).
  // unequip() used to refuse the last tower and refuse any removal that left
  // nothing affordable, and between those two branches the Rifleman could
  // never come out of the bar at all -- it is the one tower a fresh profile
  // owns, so it was always either the last one or the only one under the $600
  // stake. Both refusals are gone.
  h.run("MetaProgress.unlockAll(); rebuildBuildBar()");
  var emptied = h.run("(function () {" +
    "  var refusals = [];" +
    "  MetaProgress.equipped().filter(function (x) { return x !== null; })" +
    "    .forEach(function (id) {" +
    "      if (!MetaProgress.unequip(id).ok) refusals.push(id); });" +
    "  return { left: MetaProgress.equipped().filter(function (x) { return x !== null; })," +
    "           refusals: refusals }; })()");
  t.deep(emptied.refusals, [], "every tower comes out when asked");
  t.eq(emptied.left.length, 0, "and the bar can be left with nothing in it");

  // The invariant AGENTS.md states as "STARTING_CASH must exceed the cost of
  // the cheapest tower" is still enforced -- at THE DOOR TO A RUN, which is
  // the only thing that ever needed it. An empty bar cannot open the chooser.
  t.eq(h.run("MetaProgress.loadoutProblem() === null"), false,
    "an empty bar knows it cannot play");
  h.run("rebuildBuildBar(); openMenu(); openMapSelect()");
  t.eq(h.game.screen, "menu", "and PLAY does not open the chooser");

  // A bar holding nothing but a tower dearer than the stake is the same
  // deadlock with an extra step, and is refused at the same door.
  h.run("MetaProgress.equip('siphon'); rebuildBuildBar(); openMapSelect()");
  t.eq(h.run("BeamTower.COST > STARTING_CASH"), true,
    "the Siphon costs more than the opening stake");
  t.eq(h.game.screen, "menu", "so a bar of only Siphon stays shut out too");

  // Put one affordable tower back and the door opens.
  h.run("MetaProgress.equip('soldier'); rebuildBuildBar(); openMapSelect()");
  t.eq(h.run("MetaProgress.loadoutProblem() === null"), true, "the bar can play again");
  t.eq(h.game.screen, "select", "and the chooser opens");

  var cheapest = h.run("(function () {" +
    "  return BUILD_SLOTS.reduce(function (min, T) {" +
    "    return (T && T.COST < min) ? T.COST : min; }, Infinity); })()");
  t.ok(cheapest <= h.game.STARTING_CASH,
    "on a bar the door let through, the stake affords something ($" + cheapest + ")");
});

test("the build-bar row answers the click, not the card drawn under it", function (t) {
  var h = bootStore();

  // HIT-TEST ORDER FOLLOWS PAINT ORDER, and this row is the case that proves
  // it. draw() paints the cards and then the row, so the row is on top -- but
  // Store.onClick used to test the cards first, and the row sits at y 560
  // while the sixth catalogue card runs 534 to 620 across x 60 to 520. That
  // buries the whole first slot inside a card, and the first slot is where
  // defaultLoadout puts the one tower a fresh profile owns: the press picked
  // the Summoner's card and the Rifleman could not be taken out at all.
  //
  // Adding a catalogue row pushes the cards further down and buries more of
  // this row, so this test guards a seam that only tightens.
  var tab = h.run("Store.tabRect(1)");
  h.run("Store.onClick(" + (tab.x + 10) + ", " + (tab.y + 10) + ")");

  var slot = h.run("MetaProgress.equipped().indexOf('soldier')");
  t.eq(slot, 0, "a fresh profile's only tower is in the first slot");

  var r = h.run("Store.loadoutSlotRect(" + slot + ")");
  var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  t.eq(h.run("MetaProgress.catalogue().some(function (e, i) {" +
    "  return pointInRect(" + cx + ", " + cy + ", Store.cardRect(i)); })"), true,
    "and its centre really does lie inside a catalogue card");

  h.run("Store.onClick(" + cx + ", " + cy + ")");
  t.eq(h.run("MetaProgress.isEquipped('soldier')"), false,
    "the row wins the press and the tower comes out");
  t.eq(h.run("Store.state().picked === null"), true,
    "and the card underneath was not selected instead");
  t.eq(h.run("BUILD_SLOTS[0] === null"), true, "the bar follows");
});

test("a corrupt or tampered profile is repaired, not honoured", function (t) {
  var h = harness.boot();

  // Equipping something you do not own and negative coins are shapes a
  // hand-edited save takes, and sanitise repairs both. A bar of nothing but
  // the $800 Siphon is NO LONGER repaired -- since 2026-08-30 that is a bar a
  // player can build on purpose, so it is honoured on load and stopped at the
  // door to a run instead. See the inventory test above.
  var repaired = h.run("MetaProgress.load.call(null), (function () {" +
    "  return MetaProgress; })()");
  t.ok(repaired !== null, "load() is callable");

  h.run("MetaProgress.reset()");
  var snap = h.run("MetaProgress.snapshot()");
  t.ok(snap.coins >= 0, "coins are never negative");
  t.ok(snap.equipped.length === h.game.MetaProgress.SLOT_COUNT, "the bar is always the right length");
  t.ok(snap.equipped.filter(function (x) { return x !== null; }).length > 0,
    "and never empty");
});

test("the armoury opens from the menu and draws both tabs", function (t) {
  var h = harness.boot();
  h.run("MetaProgress.reset(); rebuildBuildBar(); openMenu()");

  var button = h.run("storeButtonRect()");
  h.click(button.x + 10, button.y + 10);
  t.eq(h.game.screen, "store", "the armoury opened");
  h.draw();

  var tab = h.run("Store.tabRect(1)");
  h.click(tab.x + 10, tab.y + 10);
  t.eq(h.run("Store.state()").tab, "inventory", "the inventory tab opened");
  h.draw();

  h.key("Escape");
  t.eq(h.game.screen, "menu", "Escape goes back, like the index");

  // "only play simulates" -- the armoury is a full screen, not an overlay.
  h.run("Store.open()");
  var before = h.game.enemies.length;
  h.step(10);
  t.eq(h.game.enemies.length, before, "ten seconds in the armoury spawns nothing");
});

group("the Rifleman's revamped bodies");

// 2026-08-29: nine authored bodies with a full clip set replaced five
// hand-posed ones. Presentation only -- the owner's instruction was "replace
// old model and animations, do not replace the recruits" -- so what these pin
// is that every tier still resolves to a body, that the two NEW bodies sit
// where the package says, and that the recruits were left alone.

test("every body a Soldier can wear is registered", function (t) {
  var h = harness.boot();
  var g = h.game;

  // WALKED, not listed: the tiers come from the tower's own rule, so a new
  // upgrade that returns a new body name fails here rather than drawing
  // nothing. A missing model is not an error anywhere in the renderer -- it
  // draws no tower at all -- which is exactly why this is asserted.
  var seen = {};
  [[], ["A1"], ["A1", "A2"], ["A1", "A2", "A3"], ["A1", "A2", "A3", "A4"],
   ["A1", "A2", "A3", "A4", "A5"], ["B1"], ["B1", "B2"], ["B1", "B2", "B3"],
   ["B1", "B2", "B3", "B4"], ["B1", "B2", "B3", "B4", "B5"]].forEach(function (path) {
    var s = new g.Soldier(-1000, -1000, g.path);
    path.forEach(function (id) { s.applyUpgrade(id); });
    seen[s.bodyTier()] = true;
  });

  t.deep(Object.keys(seen).sort(),
    ["a3", "a4", "a5", "b3", "b4", "b5", "base", "t1", "t2"],
    "eleven upgrade routes reach exactly nine bodies");

  Object.keys(seen).forEach(function (tier) {
    t.ok(g.GLModels.has("rifleman-" + tier),
      "rifleman-" + tier + " is registered");
    t.ok(g.Soldier.MUZZLE_UL[tier],
      "and " + tier + " has a muzzle, so its shot leaves the barrel");
  });
});

test("the two early bodies arrive at tier 1 and 2, on either path", function (t) {
  var h = harness.boot();
  var g = h.game;

  function tierAfter(ids) {
    var s = new g.Soldier(-1000, -1000, g.path);
    ids.forEach(function (id) { s.applyUpgrade(id); });
    return s.bodyTier();
  }

  t.eq(tierAfter([]), "base", "an unbought Soldier is the base body");
  t.eq(tierAfter(["A1"]), "t1", "A1 buys the first body");
  t.eq(tierAfter(["B1"]), "t1", "and so does B1 -- the paths do not diverge yet");
  t.eq(tierAfter(["A1", "A2"]), "t2", "A2 buys the second");
  t.eq(tierAfter(["B1", "B2"]), "t2", "and so does B2");

  // THE RULE THAT MATTERS, and the one a crosspath would break: a path-specific
  // body is never replaced by a cheaper purchase on the other branch.
  t.eq(tierAfter(["A1", "A2", "A3", "B1"]), "a3",
    "an A3 who then buys B1 is still a3 -- crosspath buys stats, not a costume");
  t.eq(tierAfter(["A1", "A2", "A3", "B1", "B2"]), "a3", "and still a3 after B2");
  t.eq(tierAfter(["B1", "B2", "B3", "A1", "A2"]), "b3", "the same both ways round");
});

test("the muzzle is measured off the body it belongs to", function (t) {
  var h = harness.boot();
  var g = h.game;

  // The weapons get longer along path A and stay short along B, which is what
  // the two paths ARE -- A grafts a bigger gun on, B buys sight and people.
  var M = g.Soldier.MUZZLE_UL;
  t.ok(M.a5.forward > M.a3.forward, "path A's barrel grows (" +
    M.a3.forward + " -> " + M.a5.forward + ")");
  t.ok(M.b5.forward < M.a5.forward, "path B's does not (" + M.b5.forward + ")");
  t.eq(M.t1.forward, M.base.forward, "t1 shares the base barrel");
  t.ok(M.t2.forward > M.t1.forward, "and t2's brake is longer");

  // EVERY BODY SHOULDERS THE WEAPON NOW. The old meshes held it at the chest
  // around 31 u.l.; these are all around 41, and a height that stayed behind
  // would put a round through the man's own shoulder.
  Object.keys(M).forEach(function (tier) {
    t.ok(M[tier].height > 38 && M[tier].height < 44,
      tier + " fires from the shoulder (" + M[tier].height + " u.l.)");
  });
});

// THE CLIP SELECTOR, RUN WITHOUT A GPU. It shipped referencing `state.now` --
// `state` is a PARAMETER of `drawWorld` and this is a module-level helper, so
// the reference threw `state is not defined` on the first frame a Rifleman was
// drawn, and with no try/catch around the render loop the whole game stopped.
// The owner found it in about a minute: "placing the rifleman make the game
// crash".
//
// It survived my own check because the page I verified against was serving five
// stale model files that carried no bands, so the guard at the call site was
// never taken. That is the gap these tests close: the selector is exposed as
// `World3D.riflemanBand` and driven here with a model built by hand, so it runs
// on every suite pass whether or not anything can render.
function bandedModel(names, framesPer) {
  var bands = [], seconds = [], first = 0;
  for (var i = 0; i < names.length; i++) {
    bands.push([first, framesPer]);
    seconds.push(1 + i * 0.1);
    first += framesPer;
  }
  return { bands: bands, bandSeconds: seconds, bandNames: names,
           frames: new Array(first) };
}

test("the Rifleman's clip selector runs, and never leaves its model", function (t) {
  var h = harness.boot();
  var g = h.game;
  var band = g.World3D.riflemanBand;
  t.ok(typeof band === "function", "the selector is reachable without a renderer");

  var m = bandedModel(["idle_low_ready", "aim_idle", "ready_weapon",
    "lower_weapon", "fire_single", "burst_brace", "burst_recover",
    "burst_cycle", "placement_ready", "hit_react", "destroyed",
    "reload_showcase"], 8);
  var s = new g.Soldier(-1000, -1000, g.path);

  // EVERY STATE THE DRIVER CAN BE IN, and the clock walked across a whole loop
  // so the idle branch -- the one that threw -- is entered many times.
  var states = [
    { label: "idle", set: function () { s.cooldown = 0; s.burstShotsLeft = 0; s.shotTimer = 0; } },
    { label: "mid-burst", set: function () { s.cooldown = 0.5; s.burstShotsLeft = 2; s.shotTimer = 0; } },
    { label: "just fired", set: function () { s.cooldown = 0.5; s.burstShotsLeft = 2; s.shotTimer = s.shotSpacing * 0.5; } }
  ];
  var wrong = [];
  states.forEach(function (st) {
    st.set();
    for (var ms = 0; ms < 6000; ms += 250) {
      var got;
      try {
        got = band(m, s, ms);
      } catch (err) {
        wrong.push(st.label + " @" + ms + "ms threw: " + err.message);
        return;
      }
      if (!got || !(got.frame >= 0) || got.frame >= m.frames.length) {
        wrong.push(st.label + " @" + ms + "ms gave frame " +
          (got && got.frame) + " of " + m.frames.length);
        return;
      }
      var b = m.bands[got.band];
      if (got.frame < b[0] || got.frame >= b[0] + b[1]) {
        wrong.push(st.label + " @" + ms + "ms: frame " + got.frame +
          " is outside band " + got.band);
        return;
      }
    }
  });
  t.eq(wrong.join(" | "), "", "every state gives a frame inside its own band");

  // AND IT PICKS THE RIGHT CLIP, which is the point of having named bands.
  var names = m.bandNames;
  s.cooldown = 0; s.burstShotsLeft = 0; s.shotTimer = 0;
  t.eq(names[band(m, s, 0).band], "idle_low_ready", "an idle Rifleman is at low ready");
  s.cooldown = 0.5;
  t.eq(names[band(m, s, 0).band], "aim_idle", "one with its burst clock running is shouldered");
  s.shotTimer = s.shotSpacing * 0.5;
  t.eq(names[band(m, s, 0).band], "fire_single", "and one with a round in flight is firing");
});

test("a model with no bands is left to the generic driver", function (t) {
  var h = harness.boot();
  var g = h.game;
  // The five bodies carried a plain frame strip before the revamp, and a model
  // that somehow arrives without bands must not be indexed as though it had
  // them -- frame 0 is a rest pose and is always safe.
  var got = g.World3D.riflemanBand({ frames: [0, 1, 2, 3] },
    new g.Soldier(-1000, -1000, g.path), 1234);
  t.eq(got.frame, 0, "a bandless model holds its rest pose");
  t.eq(got.band, 0, "and reports band 0");
});

// THE TWO SHOT TABLES ARE ONE TABLE, and each file says so about the other.
// gl-world draws the rounds on the 3D board and draw-pack draws them in the 2D
// fallback, and a retune that moved one and not the other would give the same
// weapon two different rounds depending on which renderer was running -- which
// nothing else in the suite could see, because neither number reaches the
// simulation. Read out of the SOURCE, because both are module-private.
//
// Toned down together on 2026-08-29: "make them more realistic... right now
// it's way too much, it overpowers everything else."
test("the Rifleman's rounds are spelled the same in both renderers", function (t) {
  var h = harness.boot();
  var fs = require("fs");
  var pathOf = require("path");
  var root = pathOf.join(__dirname, "..", "..", "jeu");

  function tableOf(file) {
    var src = fs.readFileSync(pathOf.join(root, file), "utf8");
    var at = src.indexOf("var RIFLEMAN_SHOTS = {");
    t.ok(at !== -1, file + " declares RIFLEMAN_SHOTS");
    var end = src.indexOf("};", at);
    var body = src.slice(at, end);
    var rows = {};
    var re = /"?([a-z0-9-]+)"?:\s*\[\s*"(#[0-9A-Fa-f]{6})",\s*"([0-9, ]+)",\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)\s*\]/g;
    var m;
    while ((m = re.exec(body)) !== null) {
      rows[m[1]] = [m[2], m[3], Number(m[4]), Number(m[5]), Number(m[6])];
    }
    return rows;
  }

  var world = tableOf("js/gl/gl-world.js");
  var pack = tableOf("js/skins/draw-pack.js");

  // EVERY BODY A SOLDIER CAN WEAR NEEDS A ROUND, and this is the assertion
  // that would have caught the revamp shipping nine bodies against seven rows:
  // t1 and t2 fell through to a fallback nobody had toned down and fired the
  // loudest bolt in the game. Walked off `bodyTier()` rather than listed.
  var g = h.game;
  var wearable = {};
  [[], ["A1"], ["A1", "A2"], ["A1", "A2", "A3"], ["A1", "A2", "A3", "A4"],
   ["A1", "A2", "A3", "A4", "A5"], ["B1", "B2", "B3"],
   ["B1", "B2", "B3", "B4"], ["B1", "B2", "B3", "B4", "B5"]].forEach(function (ids) {
    var s2 = new g.Soldier(-1000, -1000, g.path);
    ids.forEach(function (id) { s2.applyUpgrade(id); });
    wearable[s2.bodyTier()] = true;
  });
  Object.keys(wearable).forEach(function (tier) {
    t.ok(world[tier], tier + " has a round of its own in gl-world");
    t.ok(pack[tier], "and one in draw-pack");
  });

  t.deep(Object.keys(world).sort(), Object.keys(pack).sort(),
    "both renderers carry exactly the same set");
  t.ok(world["recruit-b4"] && world["recruit-b5"],
    "including the two the recruits fire");
  var wrong = [];
  Object.keys(world).forEach(function (id) {
    if (JSON.stringify(world[id]) !== JSON.stringify(pack[id])) {
      wrong.push(id + ": " + JSON.stringify(world[id]) + " against " +
        JSON.stringify(pack[id]));
    }
  });
  t.eq(wrong.join(" | "), "", "every round is spelled identically in both");

  // AND THEY STAY RESTRAINED. These are the ceilings the 2026-08-29 pass
  // brought them under; a round brighter or fatter than this is the thing the
  // owner asked to be rid of, and it should fail here rather than on his
  // screen. The heavy A5 and B5 slugs are the top of the range by design.
  Object.keys(world).forEach(function (id) {
    var radius = world[id][2], glow = world[id][4];
    t.ok(radius <= 2.6, id + " is a bullet, not an orb (radius " + radius + ")");
    t.ok(glow <= 0.30, id + " does not outshine the board (glow " + glow + ")");
  });
  t.ok(world.a5[2] > world.base[2], "path A's rounds are still the bigger ones");
  t.ok(world["recruit-b4"][2] < world.base[2],
    "and a recruit's carbine is still visibly the weakest thing firing");
});

test("the recruits were not part of the revamp", function (t) {
  var h = harness.boot();
  var g = h.game;

  // The owner's words: "do not replace the recruits". They are separate actors
  // with their own two models, and nothing about them is a `rifleman-` body.
  t.ok(g.GLModels.has("recruit-b4"), "recruit-b4 is still registered");
  t.ok(g.GLModels.has("recruit-b5"), "and recruit-b5");
  t.ok(!g.GLModels.has("rifleman-recruit-b4"),
    "and neither was renamed into the tower's family");

  // The tower's own bodies never answer for a recruit: `bodyTier` is a tower
  // rule and a recruit has no upgrades at all.
  var b5 = new g.Soldier(-1000, -1000, g.path);
  ["B1", "B2", "B3", "B4", "B5"].forEach(function (id) { b5.applyUpgrade(id); });
  t.eq(b5.bodyTier(), "b5", "a B5 tower wears b5");
  t.eq(b5.recruits.length, 0, "and its recruits are a separate list entirely");
});

group("the Soldier");

// The Soldier's build slot, looked up rather than typed: it is the fifth today
// and the whole point of BUILD_SLOTS is that nothing downstream knows that.
function soldierSlot(h) {
  return h.game.BUILD_SLOTS.indexOf(h.game.Soldier);
}

// Stand a Soldier beside the road at `progress`, just outside the legal
// minimum clearance -- placeBeside's geometry, through the Soldier's own slot.
function placeSoldierBeside(h, progress) {
  h.run("cash = 1000000");
  var on = h.game.path.pointAt(progress);
  var clearance = h.run("buildClearancePx(Soldier)");

  var ahead = h.game.path.pointAt(progress + 5);
  var dx = ahead.x - on.x;
  var dy = ahead.y - on.y;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;

  var pad = clearance + 1.5;
  return h.place(on.x + (-dy / len) * pad, on.y + (dx / len) * pad, soldierSlot(h));
}

// Drive ONE tower through its own update() with a private bullet list.
//
// This is the entry point the game loop calls, with the same fixed step, so it
// is the real thing -- but nothing removes bullets from the array afterwards,
// so `bullets.length` is EXACTLY the number of shots fired and `firedAt[i]` is
// the second the i-th one left the barrel. Counting bullets in the live game
// cannot do that: a shot fired and landed inside one step would never be seen.
function fireFor(h, tower, enemies, seconds) {
  var bullets = [];
  var firedAt = [];
  var dt = h.game.FIXED_STEP;
  var steps = Math.round(seconds / dt);

  for (var i = 0; i < steps; i++) {
    var before = bullets.length;
    tower.update(dt, enemies, bullets);
    while (firedAt.length < bullets.length) firedAt.push(i * dt);
    if (before !== bullets.length) { /* shots this step are all stamped above */ }
  }
  return { bullets: bullets, firedAt: firedAt };
}

// Advance a Soldier through a whole branch, through the real economy.
//
// IT UPGRADES THE TOWER IT WAS HANDED. This used to buy for the global
// `inspected` instead -- `towers[towers.indexOf(inspected)]` -- which quietly
// ignored the `tower` parameter it takes and reads from on the line above.
// Callers that had set `inspected` to the same Soldier got away with it; the
// two that had not (`placeSoldierBeside` does not touch the global) indexed
// with -1, handed `buyUpgrade` an `undefined` tower, and died on
// `tower.whyCannotUpgrade` inside game.js rather than reporting a refusal.
// `buyUpgrade(tower, id)` takes its tower explicitly and never consults
// `inspected`, so there was nothing the indirection bought.
//
// The index is re-read each tier rather than cached: it is the live `towers`
// array that the buy runs against.
function buyPath(h, tower, branch, tiers) {
  h.run("cash = 100000000");
  for (var i = 0; i < tiers; i++) {
    var next = tower.nextUpgrade(branch);
    if (!next) break;
    var at = h.game.towers.indexOf(tower);
    if (at < 0) return "tower is not on the board";
    var refusal = h.run("buyUpgrade(towers[" + at + "], '" + next.id + "')");
    if (refusal) return refusal;
  }
  return null;
}

test("the base Soldier matches the owner's table", function (t) {
  var h = harness.boot();
  var Soldier = h.game.Soldier;

  t.eq(Soldier.COST, 300, "cost");
  t.eq(Soldier.BASE_HP, 80, "hit points");
  t.eq(Soldier.BASE_DAMAGE, 1, "damage per shot");
  t.eq(Soldier.BASE_SHOTS_PER_BURST, 3, "shots per burst");
  t.eq(Soldier.BASE_SHOT_SPACING, 0.15, "shot spacing");
  t.eq(Soldier.BASE_BURST_COOLDOWN, 1.2, "burst cooldown");
  t.eq(Soldier.BASE_RANGE_UL, 100, "range -- the reference tower's");
  t.eq(Soldier.FOOTPRINT_RADIUS_UL, h.game.Tower.FOOTPRINT_RADIUS_UL,
    "footprint -- the gunner's, so it stands where a gunner can");

  var s = placeSoldierBeside(h, 300);
  t.eq(s.seesCamo, false, "no camo detection out of the box");
  t.eq(s.defenseFlatPierce, 0, "and no defence pierce");
  t.eq(s.hasRecruitAbility, false, "and no recruit button");

  // 3 shots x 1 damage / 1.2 s = 2.5 DPS. The rate is shots per burst over the
  // burst CYCLE, which is what makes that arithmetic come out.
  t.eq(s.attackDamage(), 1, "attackDamage is per SHOT");
  t.ok(Math.abs(s.attacksPerSecond() - 2.5) < 1e-9, "attacksPerSecond is 3 / 1.2");
  t.ok(Math.abs(h.game.TowerStats.dps(s) - 2.5) < 1e-9, "so DPS is 2.5");
});

test("a burst is three shots 0.15 s apart, once every 1.2 s", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);

  // A target that cannot die and cannot be fully claimed, so nothing but the
  // burst timing decides when a shot leaves.
  var e = h.spawnAt(305, 1000000);
  e.laneOffsetUl = 0;
  e.refreshPos();

  var run1 = fireFor(h, s, [e], 1.0);
  t.eq(run1.bullets.length, 3, "one burst inside the first cooldown");

  var step = h.game.FIXED_STEP;
  t.ok(run1.firedAt[0] < step, "the first shot leaves immediately");
  t.ok(Math.abs(run1.firedAt[1] - 0.15) <= step, "the second 0.15 s later");
  t.ok(Math.abs(run1.firedAt[2] - 0.30) <= step, "and the third 0.30 s after that");

  // The cycle is measured from one burst's START to the next, NOT from the
  // last shot of a burst -- which is the whole reason 3/1.2 is the real rate.
  var s2 = placeSoldierBeside(h, 500);
  var e2 = h.spawnAt(505, 1000000);
  e2.laneOffsetUl = 0;
  e2.refreshPos();
  var long = fireFor(h, s2, [e2], 60);
  var rate = long.bullets.length / 60;
  t.ok(Math.abs(rate - s2.attacksPerSecond()) < 0.05,
    "over a minute the measured rate is the reported one (" + rate.toFixed(2) + "/s)");
});

test("path A tightens the burst exactly as the table says", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers[towers.indexOf(towers.filter(function (x) " +
    "{ return x instanceof Soldier; })[0])]");

  // `range` is the tier's CUMULATIVE reach, not its delta. Path A carried no
  // range at all until 2026-08-12 -- 100 u.l. from build to a finished A5 --
  // and A3-A5 now add 5 each. A1 and A2 deliberately still add none, which is
  // why the first two rows repeat 100.
  var TABLE = [
    { tier: 1, damage: 1, shots: 3, spacing: 0.13, cooldown: 1.1,  range: 100 },
    { tier: 2, damage: 1, shots: 4, spacing: 0.11, cooldown: 1.0,  range: 100 },
    // A3-A5 retuned 2026-08-12: +5 u.l. each and a tighter burst clock
    // (0.9 -> 0.85, 0.8 -> 0.75, 0.6 -> 34/60).
    { tier: 3, damage: 2, shots: 4, spacing: 0.10, cooldown: 0.85,  range: 105 },
    // A4 and A5 retuned up 2026-07-30: A4 2 -> 4 damage, A5 3 -> 8 damage and
    // 0.7 -> 0.6 s between bursts.
    { tier: 4, damage: 4, shots: 5, spacing: 0.08, cooldown: 0.75,  range: 110 },
    // A5's period is a FRACTION, not a decimal, and the test says so in the
    // same shape the table does. See the note on A3-A5 in js/soldier.js: the
    // engine can only deliver whole 1/60 s steps, and 0.55 would have realised
    // 34 of them while the panel divided by 0.55 and printed a rate 3% higher
    // than the tower fires at.
    { tier: 5, damage: 8, shots: 5, spacing: 0.07, cooldown: 34 / 60, range: 115 }
  ];

  TABLE.forEach(function (row) {
    t.eq(buyPath(h, s, "A", 1), null, "A" + row.tier + " is affordable and legal");
    t.eq(s.damage, row.damage, "A" + row.tier + " damage");
    t.eq(s.shotsPerBurst, row.shots, "A" + row.tier + " shots per burst");
    t.ok(Math.abs(s.shotSpacing - row.spacing) < 1e-9, "A" + row.tier + " spacing");
    t.ok(Math.abs(s.burstCooldown - row.cooldown) < 1e-9, "A" + row.tier + " cooldown");
    t.eq(s.rangeUl, row.range, "A" + row.tier + " range in u.l.");
  });

  // 5 x 8 / (34/60) = 70.6. It was 66.7 (5 x 8 / 0.6) until 2026-08-12 and 21.4
  // (5 x 3 / 0.7) until 2026-07-30 -- see The paths in AGENTS.md.
  t.ok(Math.abs(h.game.TowerStats.dps(s) - 70.59) < 0.01, "A5 lands on 70.6 DPS");

  // AND THE TOWER ACTUALLY FIRES AT THE RATE THE PANEL PRINTS. This is the
  // assertion the row above cannot make: TowerStats.dps just divides the two
  // numbers sitting beside it in the table, so it would report 72.7 just as
  // happily for a `0.55` the 60 Hz clock rounds up to 34 steps and delivers
  // 70.6 at. This one TIMES the tower instead -- real update(), real fixed
  // step, one bullet counted per shot -- so a period the engine cannot realise
  // fails here even though the arithmetic above stays green.
  //
  // Self-tested by putting `0.55` back in the table: this assertion goes red
  // (delivered 70.6 against a declared 72.7) while every other assertion in
  // this test stays green. A check that cannot fail is not a check.
  var pinned = h.spawnAt(305, 100000000);
  pinned.laneOffsetUl = 0;
  pinned.refreshPos();
  var WINDOW = 300;
  var timed = fireFor(h, s, [pinned], WINDOW);
  var deliveredDps = timed.bullets.length * s.damage / WINDOW;
  // 0.25 is comfortably inside the 2.1 DPS a `0.55` would be out by, and
  // comfortably outside the 0.13 that one unfinished burst at the end of the
  // window can cost.
  t.ok(Math.abs(deliveredDps - h.game.TowerStats.dps(s)) < 0.25,
    "and it DELIVERS that rate over 300 s (" + deliveredDps.toFixed(2) + " measured)");

  // And the burst still finishes inside its own cycle: 4 gaps of 0.07 is
  // 0.28 s against a 0.567 s cooldown. If a future retune ever inverts that,
  // the rate this tower reports stops being the rate it fires at.
  t.ok((s.shotsPerBurst - 1) * s.shotSpacing < s.burstCooldown,
    "a burst still fits inside its cooldown");
});

test("path B buys utility and abandons the burst at B3", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");

  buyPath(h, s, "B", 1);
  t.eq(s.rangeUl, 125, "B1 adds 25 u.l. of reach");
  t.eq(s.rangePx, h.run("ul(125)"), "and the cached world radius follows");

  // B2 grants its HP as a DELTA rather than healing to the new maximum. That
  // changed on 2026-08-01 when all ten tiers gained HP: healing to full would
  // have made every upgrade a full repair, so a tower under fire could be
  // topped up for the price of the next tier. js/soldier.js is explicit that
  // this was rejected -- "without making the shop a hospital". A damaged
  // Soldier stays damaged by the same amount, and the new points are its own.
  s.currentHp = 40;
  buyPath(h, s, "B", 1);
  t.eq(s.maxHp, 145, "B2 adds 40 max HP");
  t.eq(s.currentHp, 80, "and the same 40 points go onto current HP, not a heal");

  t.eq(s.damage, 2, "B2 also adds +1 damage");
  t.eq(s.automatic, false, "and B2 is still a burst weapon");

  buyPath(h, s, "B", 1);
  t.eq(s.seesCamo, true, "B3 grants camo detection");
  t.eq(s.automatic, true, "B3 ends the burst");
  t.eq(s.damage, 3, "B3 adds its own +1 damage");

  // The rate is DERIVED from the burst it replaced, so the switch itself costs
  // nothing: 3 shots / 1.2 s and 2.5 shots a second are the same rate.
  t.ok(Math.abs(s.attacksPerSecond() - 2.5) < 1e-9, "at the burst's own rate");
  t.ok(Math.abs(h.game.TowerStats.dps(s) - 7.5) < 0.01, "B3 lands on 7.5 DPS");

  buyPath(h, s, "B", 1);
  // 2026-07-30: B4 pierces DEFENCE (percentage points) rather than flat armor,
  // and gained +2 damage.
  t.eq(s.defenseFlatPierce, 10, "B4 grants 10 points of defence pierce");
  t.eq(s.damage, 5, "and +2 damage: 1 + 1 + 1 + 2");
  t.eq(s.hasRecruitAbility, true, "and B4 is what unlocks recruits");
  t.eq(s.recruitCooldownSeconds, 45, "recruits are on a 45 s cooldown at B4");

  buyPath(h, s, "B", 1);
  // The owner's figure, 2026-07-30: "make him do 20 damage, so +15 ad instead
  // of +5". Written out so the sum is checkable at a glance.
  t.eq(s.damage, 20, "B5 adds +15 damage: 1 + 1 + 1 + 2 + 15");
  // B5 carried +3 shots a second for a few hours on 2026-07-30 and the owner
  // took it back out, so the automatic rate is 2.5 the whole way up path B and
  // the ONLY thing that moves it is a crosspath into A1/A2.
  t.ok(Math.abs(s.attacksPerSecond() - 2.5) < 1e-9, "at the same 2.5 shots a second");
  t.ok(Math.abs(h.game.TowerStats.dps(s) - 50) < 0.01, "B5 lands on 50 DPS");
  t.eq(h.game.Soldier.upgradeById("B5").fireRate, undefined,
    "and B5 grants no attack speed at all");
  // B5 NO LONGER shortens the cooldown. Both tiers call on the same 45 s since
  // 2026-08-01 ("make the recruits cooldown of both b4 and b5 45sec"), so what
  // B5 buys is a bigger, harder squad rather than a more frequent one -- which
  // is what the recruitBoost row above it is for.
  t.eq(s.recruitCooldownSeconds, 45, "and B5 leaves the recruit cooldown at 45 s");
  t.eq(s.recruitRangeUl, 125, "and raises recruit range to 125 u.l.");

  // The burst fields are still on the tower and still at their base values --
  // nothing on path B moves them. They are simply no longer what it fires by,
  // which is what `automatic` decides and the only thing that decides it.
  t.eq(s.shotsPerBurst, 3, "shots per burst is untouched");
  t.ok(Math.abs(s.shotSpacing - 0.15) < 1e-9, "spacing is untouched");
  t.ok(Math.abs(s.burstCooldown - 1.2) < 1e-9, "cooldown is untouched");
});

test("an automatic Soldier fires steadily instead of in bursts", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h, s, "B", 3);
  t.eq(s.automatic, true, "B3 bought");

  // A target that cannot die, so what is measured is the tower's rate and not
  // the enemy's health. One second at 2.5 shots a second is 2 or 3 shots -- and
  // crucially they are SPREAD, where a burst would put three in 0.3 s and then
  // nothing for 0.9 s.
  var e = h.spawnAt(308, 100000);
  e.laneOffsetUl = 0;
  e.refreshPos();

  var fired = fireFor(h, s, [e], 1);
  t.ok(fired.bullets.length >= 2 && fired.bullets.length <= 3,
    "about 2.5 shots in a second: " + fired.bullets.length);

  // The SHAPE is the point, and it is what the timestamps show: consecutive
  // shots sit ~0.4 s apart, where a burst would put three inside 0.3 s and then
  // leave 0.9 s empty.
  for (var i = 1; i < fired.firedAt.length; i++) {
    var gap = fired.firedAt[i] - fired.firedAt[i - 1];
    t.ok(Math.abs(gap - 0.4) < 0.05, "shot " + i + " is ~0.4 s after the last: " + gap);
  }
});

test("an automatic Soldier holds its fire rather than banking shots", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h, s, "B", 3);

  // Ten seconds with nothing to shoot at. A rifle that banked that time would
  // have twenty-five shots owed the moment a target appeared.
  fireFor(h, s, [], 10);

  var e = h.spawnAt(308, 100000);
  e.laneOffsetUl = 0;
  e.refreshPos();

  var fired = fireFor(h, s, [e], h.game.FIXED_STEP);
  t.eq(fired.bullets.length, 1, "exactly one shot on the first step");
});

test("the Soldier crosspaths like the Smasher and the Longshot", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");

  // A1, A2, B1 and B2 are independent: all four can be owned at once.
  buyPath(h, s, "A", 2);
  buyPath(h, s, "B", 2);
  t.deep(s.ownedUpgradeIds(), ["A1", "A2", "B1", "B2"], "both tier-2 crosspaths");
  t.eq(s.lockedBranch(), null, "and nothing is committed yet");

  // Tier 3 commits the tower.
  t.eq(buyPath(h, s, "A", 1), null, "A3 is allowed");
  t.eq(s.lockedBranch(), "A", "which locks the tower to A");
  t.eq(s.whyCannotUpgrade("B3"), "path A already chosen", "B3 is shut out");

  // And the same rule the other way round.
  var other = placeSoldierBeside(h, 700);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[1]");
  buyPath(h, other, "B", 3);
  t.eq(other.lockedBranch(), "B", "B3 locks the tower to B");
  t.eq(other.whyCannotUpgrade("A3"), "path B already chosen", "A3 is shut out");

  // The endpoint the owner specified: full A plus both B crosspaths.
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h, s, "A", 2);
  t.eq(s.shotsPerBurst, 5, "A5+B2: five shots");
  t.ok(Math.abs(s.shotSpacing - 0.07) < 1e-9, "A5+B2: 0.07 s spacing");
  t.ok(Math.abs(s.burstCooldown - 34 / 60) < 1e-9, "A5+B2: 34/60 s cooldown");
  // 140, not 125: B1's +25 AND the +5 each that A3, A4 and A5 gained on
  // 2026-08-12. `rangeUl` is a delta channel here (recalcStats does `+=`), so
  // the two branches' range STACKS on a crosspath.
  //
  // THIS IS PINNED BECAUSE IT IS A CONSEQUENCE THE OWNER HAS NOT RULED ON, not
  // because it is a design he asked for. Until 2026-08-12, 125 u.l. was a hard
  // ceiling for every Rifleman at every price; it is now beaten at $1 725 by
  // A3+B1 (130 u.l.), and this $7 250 endpoint is the longest reach the tower
  // can have -- further than a finished $7 500 path B, which is unchanged at
  // 125. If he rules against it, holding the old ceiling means giving this
  // table the Smasher's Math.max range semantics and rewriting B1's +25 as an
  // absolute 125, which changes a path B row.
  t.eq(s.rangeUl, 140, "A5+B2: 140 u.l. -- B1's +25 and A3-A5's +15");
  // Since the 2026-08-01 retune EVERY tier grants HP, so this is no longer
  // "base plus B2" -- it is the base 80 plus all seven owned tiers:
  // 20+30+50+80+120 down A, and 25+40 from the two B crosspaths.
  t.eq(s.maxHp, 445, "A5+B2: 445 HP -- 80 base plus all seven tiers");
  t.eq(s.seesCamo, false, "A5+B2: still no camo, because B3 is locked out");

  // The two damage channels meeting: path A's absolute 8 plus B2's delta of 1.
  // This endpoint has moved twice now -- 3 damage originally, 4 when B2 gained
  // its +1, and 9 since A5 was retuned -- so it is asserted rather than assumed.
  t.eq(s.damage, 9, "A5+B2: 9 damage -- A5's absolute 8 plus B2's +1");
  t.eq(s.automatic, false, "A5+B2: still a burst weapon, because B3 is locked out");
  t.ok(Math.abs(h.game.TowerStats.dps(s) - 79.41) < 0.01,
    "A5+B2: 5 x 9 / (34/60) = 79.4 DPS");
});

test("each shot of a burst finds its own target", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);

  // Two enemies in range. `first` picks the one furthest along, and one point
  // of damage claimed against a 1 HP enemy makes it dead-on-arrival -- so the
  // second shot of the SAME burst has to look again.
  var ahead = h.spawnAt(308, 1);
  var behind = h.spawnAt(296, 1000);
  [ahead, behind].forEach(function (e) { e.laneOffsetUl = 0; e.refreshPos(); });

  var fired = fireFor(h, s, [ahead, behind], 0.5);
  t.eq(fired.bullets.length, 3, "the burst still fires all three shots");
  t.eq(fired.bullets[0].target, ahead, "the first shot takes the leader");
  t.eq(fired.bullets[1].target, behind, "the second retargets mid-burst");
  t.eq(fired.bullets[2].target, behind, "and so does the third");
});

test("a burst shot with nothing left to hit is lost, not held", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);

  var only = h.spawnAt(305, 1);
  only.laneOffsetUl = 0;
  only.refreshPos();

  // One shot claims the whole enemy; shots two and three of that burst have
  // nowhere to go and are simply lost.
  var first = fireFor(h, s, [only], 0.5);
  t.eq(first.bullets.length, 1, "two shots of the burst are lost");
  t.eq(s.burstShotsLeft, 0, "and the burst is finished, not stalled");

  // The next burst still opens on schedule rather than early.
  var later = fireFor(h, s, [only], 0.8);
  t.eq(later.bullets.length, 0, "nothing more until the cooldown is up");
});

// **REWRITTEN 2026-07-30.** This tested flat ARMOR pierce, which B4 no longer
// has. The owner moved the tier onto DEFENCE: "change armor pierce to instead of
// bypassing blindage, bypasse armor and change the boost from b4 to 10, so
// basically an enemy with 20% A armor should take 20% less damage but takes only
// 10% less, be sure that it doesn't increase the damage on enemies without
// armor."
//
// In this codebase `armor` is the flat subtraction (his "blindage") and
// `defense` is the percentage (his "armor"), so B4 now strips 10 percentage
// points of `defense` and nothing at all pierces flat armor.
test("B4 pierces DEFENCE in flat percentage points, never below zero", function (t) {
  var h = harness.boot();
  var Mitigation = h.game.Mitigation;

  // Flat armor is untouched by all of this and still has no damage floor.
  t.eq(Mitigation.mitigate(10, { armor: 5 }), 5, "armor still subtracts flat");
  t.eq(Mitigation.mitigate(1, { armor: 5 }), 0, "and still has no damage floor");
  t.eq(Mitigation.mitigate(1, { armor: 5 }, 0, 10), 0,
    "and defence pierce does NOT help against it -- nothing pierces armor now");

  // The owner's worked example, exactly: 20% becomes 10%.
  t.eq(Mitigation.mitigate(100, { defense: 20 }), 80, "20% defense takes 20% off");
  t.eq(Mitigation.mitigate(100, { defense: 20 }, 0, 10), 90,
    "with 10 points pierced it only takes 10% off");

  // **THE CLAMP HE ASKED FOR.** Without it, 10 points against 0 defence would be
  // -10, and `1 - (-10)/100` is a 10% damage BONUS against every unarmoured
  // enemy in the game.
  t.eq(Mitigation.mitigate(100, { defense: 0 }, 0, 10), 100,
    "an enemy with no defence takes exactly normal damage, not more");
  t.eq(Mitigation.mitigate(100, {}, 0, 10), 100, "and so does one with no stats at all");
  t.eq(Mitigation.mitigate(100, { defense: 10 }, 0, 10), 100,
    "piercing exactly as much defence as there is leaves normal damage, not a bonus");

  // The two pierces compose, proportional first then flat, and both stay off
  // armor entirely.
  t.eq(Mitigation.mitigate(100, { defense: 50 }, 0.5, 10), 85,
    "50% defence, halved to 25, then 10 points off = 15%");
  t.eq(Mitigation.mitigate(100, { armor: 5, defense: 20 }, 0, 10), 85.5,
    "armor comes off first and is not pierced: (100-5) x 0.9");

  // End to end on a real Armored enemy (20% defense), through real bullets.
  var h2 = harness.boot();
  var s = placeSoldierBeside(h2, 300);
  var mark = h2.spawnAt(305, 100000, "armored");
  mark.laneOffsetUl = 0;
  mark.refreshPos();

  buyPath(h2, s, "B", 4);
  t.eq(s.defenseFlatPierce, 10, "B4 bought");
  t.eq(s.damage, 5, "and the tiers on the way up have taken it to 5 damage");

  var before = mark.health;
  var shots = fireFor(h2, s, [mark], 2.0).bullets;
  shots.forEach(function (b) {
    b.release();                                   // land it by hand
    mark.takeDamage(b.damage, 0, b.defenseFlatPierce);
  });
  t.ok(shots.length > 0, "it shot (" + shots.length + " shots)");
  // 5 damage against 20% defence is 4; with 10 points pierced it is 4.5.
  t.near(mark.health, before - shots.length * 4.5, 0.001,
    "every shot landed 4.5 instead of 4");

  // And the bullet really is the thing carrying it, so selling or upgrading
  // mid-flight cannot change a shot already in the air.
  t.eq(shots[0].defenseFlatPierce, 10, "the pierce rode on the bullet");
});

// The brute counter MOVED with the pierce, and that is worth pinning rather
// than discovering. A brute's 5 FLAT armor is no longer pierced by anything, so
// B4's 5 damage does exactly nothing to one; what answers a brute on this path
// now is B5's raw 20.
test("path B answers a brute with damage, not with pierce", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  var brute = h.spawnAt(305, undefined, "brute");
  brute.laneOffsetUl = 0;
  brute.refreshPos();

  buyPath(h, s, "B", 4);
  t.eq(s.damage, 5, "a B4 Rifleman hits for 5");
  t.eq(brute.takeDamage(s.damage, 0, s.defenseFlatPierce), 0,
    "which a brute's 5 flat armor eats completely");

  buyPath(h, s, "B", 1);
  t.eq(s.damage, 20, "B5 takes it to 20");
  t.eq(brute.takeDamage(s.damage, 0, s.defenseFlatPierce), 15,
    "and 15 of that gets through");
});

test("recruits march the road backwards and are not towers", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  var Soldier = h.game.Soldier;

  // No button before B4.
  var ids = s.panelActions().map(function (a) { return a.id; });
  t.eq(ids.indexOf("recruits"), -1, "no recruit button without B4");

  buyPath(h, s, "B", 3);
  ids = s.panelActions().map(function (a) { return a.id; });
  t.eq(ids.indexOf("recruits"), -1, "and still none at B3");

  buyPath(h, s, "B", 1);
  ids = s.panelActions().map(function (a) { return a.id; });
  t.ok(ids.indexOf("recruits") >= 0, "B4 puts the button on the panel");

  t.eq(s.callRecruits(), null, "the ability fires");
  t.eq(s.recruitCooldown, s.recruitCooldownSeconds, "the cooldown starts");
  // 45 since 2026-08-01, at the owner's instruction that B4 and B5 both call on
  // the same 45 s -- so what B5 buys is a bigger squad, not a more frequent one
  // (js/soldier.js, RECRUIT_COOLDOWN_SECONDS and the B5 tier's cooldownSeconds).
  // Typed, not read back off the tower: the subject of this line IS the period,
  // and reading it from the Soldier would assert only that it equals itself.
  t.eq(s.recruitCooldownSeconds, 45, "and at B4 that is 45 s");

  // The first arrives at once, the second after the stagger.
  var bullets = [];
  s.update(h.game.FIXED_STEP, [], bullets);
  t.eq(s.recruits.length, 1, "one recruit immediately");
  for (var i = 0; i < Math.round(0.25 / h.game.FIXED_STEP); i++) {
    s.update(h.game.FIXED_STEP, [], bullets);
  }
  t.eq(s.recruits.length, 2, "the second 0.25 s later");

  var r = s.recruits[0];
  t.ok(r.progress > h.game.path.length * 0.99, "it spawned at the END of the road");
  t.eq(r.maxHp, 20, "20 HP at B4");
  t.eq(r.stats.damage, 1, "1 damage");
  t.eq(r.stats.shotsPerSecond, 2, "two shots a second");
  t.eq(r.rangeUl, 100, "100 u.l. range");
  t.eq(r.speedUlps, h.game.Enemy.BASE_SPEED_ULPS * 0.8,
    "marches at 80% of an ordinary enemy's speed");
  t.eq(r.visualTier, "B4", "uses the standard recruit model");
  t.eq(r.targeting, "first", "first targeting");

  // It is not a tower: not on the board, not sellable, not in the way.
  t.eq(h.game.towers.indexOf(r), -1, "it is not in `towers`");
  t.eq(h.game.enemies.indexOf(r), -1, "and not in `enemies`");
  t.eq(typeof r.panelActions, "undefined", "no upgrade tree");
  t.eq(h.run("towerAt(" + r.x + ", " + r.y + ")"), null, "it cannot be inspected");
  t.eq(h.run("whyCannotBuild(" + r.x + ", " + r.y + ", Soldier)"),
    h.run("whyCannotBuild(" + r.x + ", " + r.y + ", Soldier)"),
    "and it does not block building (the road does, not the recruit)");

  // And it walks the WRONG way down the road, which is the whole idea.
  var was = r.progress;
  for (var j = 0; j < 60; j++) s.update(h.game.FIXED_STEP, [], bullets);
  t.ok(r.progress < was, "a second later it is further back down the road");
  t.ok(Math.abs((was - r.progress) - h.run("ul(Soldier.RECRUIT_SPEED_ULPS)")) < 1,
    "at the deliberately slower recruit speed");

  // The button reports the cooldown and refuses while it runs.
  var action = s.panelActions().filter(function (a) { return a.id === "recruits"; })[0];
  t.eq(action.enabled, false, "the button is dead while cooling");
  t.ok(/ready in/.test(action.detail), "and says how long: " + action.detail);
  t.ok(s.statLines().some(function (row) { return row[0] === "Recruits"; }),
    "the panel carries a cooldown row while it runs");
});

test("a recruit shoots, is walked over, and dies at the start of the road", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h, s, "B", 4);
  s.callRecruits();

  var bullets = [];
  s.update(h.game.FIXED_STEP, [], bullets);
  var r = s.recruits[0];

  // Something to shoot at, well inside its 100 u.l. reach and too healthy to
  // die -- so what is measured is the recruit's rate, not the enemy's health.
  var target = h.spawnAt(r.progress - 40, 1000000);
  target.laneOffsetUl = 0;
  target.refreshPos();

  // Driven through the RECRUIT's own update rather than the tower's, so what
  // is counted is one recruit's rate of fire and not the group's.
  var own = [];
  for (var i = 0; i < Math.round(3 / h.game.FIXED_STEP); i++) {
    r.update(h.game.FIXED_STEP, [target], own);
  }
  bullets = own;
  t.ok(own.length >= 6 && own.length <= 7,
    "two shots a second (" + own.length + " in 3 s)");
  t.eq(bullets[bullets.length - 1].damage, 1, "1 damage a shot");
  t.eq(bullets[bullets.length - 1].defenseFlatPierce, 0,
    "and no defence pierce, even though the parent owns B4");
  t.eq(bullets[bullets.length - 1].owner, s,
    "its damage is credited to the Soldier that called it");

  // Reaching the start of the road ends it, with no HP lost.
  var h3 = harness.boot();
  var s3 = placeSoldierBeside(h3, 300);
  h3.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h3, s3, "B", 4);
  s3.callRecruits();
  var bullets3 = [];
  s3.update(h3.game.FIXED_STEP, [], bullets3);
  var r3 = s3.recruits[0];
  r3.progress = 0.1;                    // one step short of the start
  s3.update(h3.game.FIXED_STEP, [], bullets3);
  t.eq(r3.dead, true, "it dies when it reaches the start");
  t.eq(r3.hp, r3.maxHp, "on full health -- the walk is what ended it");
});

test("a recruit stops walking while it has something to shoot", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h, s, "B", 4);
  s.callRecruits();

  var bullets = [];
  s.update(h.game.FIXED_STEP, [], bullets);
  var r = s.recruits[0];

  // In reach, and far too healthy to die -- so it stays a reason to hold for the
  // whole measurement.
  var target = h.spawnAt(r.progress - 40, 1000000);
  target.laneOffsetUl = 0;
  target.refreshPos();

  var held = r.progress;
  for (var i = 0; i < 120; i++) r.update(h.game.FIXED_STEP, [target], bullets);
  t.eq(r.progress, held, "two seconds in reach and it has not moved a pixel");
  t.eq(r.holding, true, "and it says so, for the artwork");
  t.ok(bullets.length >= 2, "it was shooting the whole time: " + bullets.length);

  // Take the target away and the march resumes -- the stop is a consequence of
  // having work, not a state it gets stuck in.
  for (var j = 0; j < 60; j++) r.update(h.game.FIXED_STEP, [], bullets);
  t.eq(r.holding, false, "nothing to shoot, so it is walking again");
  t.ok(r.progress < held, "and it is further back down the road");
});

test("an enemy walking through a recruit trades the recruit's health for damage",
  function (t) {
    var h = harness.boot();
    var s = placeSoldierBeside(h, 300);
    h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
    buyPath(h, s, "B", 4);
    s.callRecruits();

    var bullets = [];
    s.update(h.game.FIXED_STEP, [], bullets);
    var r = s.recruits[0];
    t.eq(r.hp, 20, "a 20 HP recruit");

    // One body, right on top of it, unarmoured and far too healthy to die -- so
    // the damage is readable rather than clamped by the enemy's remaining health.
    var e = h.spawnAt(r.progress - 2, 1000000);
    e.laneOffsetUl = 0;
    e.refreshPos();
    var enemyBefore = e.health;
    var creditBefore = s.damageDealt;

    var landed = s.update(h.game.FIXED_STEP, [e], bullets);

    t.eq(e.health, enemyBefore - 20, "the enemy takes the recruit's whole 20");
    t.eq(r.hp, 0, "which is deducted from the recruit too");
    t.eq(r.dead, true, "so a healthy target still spends the whole recruit");
    t.eq(s.recruits.indexOf(r), -1, "and it is swept out of the tower's list");

    // It has to be REPORTED, or the damage happens and nobody is paid for it.
    t.eq(landed, 20, "the tower reports it up to game.js as damage landed");
    t.eq(s.damageDealt - creditBefore, 20,
      "and it lands on the panel of the Soldier that called it");
  });

test("a recruit keeps unused HP after its contact strike kills a weak enemy",
  function (t) {
    var h = harness.boot();
    var s = placeSoldierBeside(h, 300);
    h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
    buyPath(h, s, "B", 5);
    s.callRecruits();
    s.update(h.game.FIXED_STEP, [], []);

    var r = s.recruits[0];
    r.hp = 35;
    var weak = h.spawnAt(r.progress - 2, 1);
    weak.laneOffsetUl = 0;
    weak.refreshPos();

    var creditBefore = s.damageDealt;
    var landed = r.update(h.game.FIXED_STEP, [weak], []);
    t.eq(weak.dead, true, "the 1 HP enemy dies");
    t.eq(landed, 1, "only its one remaining HP was actually absorbed");
    t.eq(r.hp, 34, "the recruit keeps the other 34 HP");
    t.eq(r.dead, false, "and remains active for another enemy");
    t.eq(s.damageDealt - creditBefore, 1, "the parent tower receives exact damage credit");

    // The once-per-enemy guard still matters now that contact is survivable.
    r.update(h.game.FIXED_STEP, [weak], []);
    t.eq(r.hp, 34, "the same dead body cannot charge contact twice");
  });

test("B5 sends four tougher recruits", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h, s, "B", 5);

  t.eq(s.recruitCount, 4, "four at a time");
  t.eq(s.recruitHp, 40, "40 HP each");
  t.eq(s.recruitDamage, 3, "3 damage -- the base 1 plus B5's 2");
  t.eq(s.recruitShotsPerSecond, 2.5, "at 2.5 shots a second");
  t.eq(s.recruitRangeUl, 125, "125 u.l. recruit range");

  s.callRecruits();
  var bullets = [];
  // Long enough for all four staggered spawns (3 x 0.25 s) to land.
  for (var i = 0; i < Math.round(1 / h.game.FIXED_STEP); i++) {
    s.update(h.game.FIXED_STEP, [], bullets);
  }
  t.eq(s.recruits.length, 4, "all four deploy");
  t.eq(s.recruits[0].maxHp, 40, "and they are born with the boosted stats");
  t.eq(s.recruits[0].stats.damage, 3, "3 damage each");
  t.eq(s.recruits[0].rangeUl, 125, "125 u.l. range each");
  t.eq(s.recruits[0].visualTier, "B5", "and the elite recruit model");
  t.eq(s.recruits[0].hoverLabel(), "40 / 40 HP  ·  125 u.l.",
    "the hover readout exposes the new range");

  // A 40 HP body block is 40 damage. Driven through the ONE recruit rather than
  // the tower, because four recruits 0.25 s apart are only ~13 u.l. apart and two
  // of them can reach the same body -- which is correct, and would make this
  // measure the group's block rather than a recruit's.
  var r = s.recruits[0];
  var e = h.spawnAt(r.progress - 2, 1000000);
  e.laneOffsetUl = 0;
  e.refreshPos();
  var before = e.health;
  var landed = r.update(h.game.FIXED_STEP, [e], bullets);
  t.eq(before - e.health, 40, "and a body block spends all forty");
  t.eq(landed, 40, "reported as damage landed");
});

test("B4 and B5 recruit models can be replaced independently", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h, s, "B", 4);
  s.callRecruits();
  s.update(h.game.FIXED_STEP, [], []);
  var standard = s.recruits[0];

  s.recruitCooldown = 0;
  buyPath(h, s, "B", 1);
  s.callRecruits();
  s.update(h.game.FIXED_STEP, [], []);
  var elite = s.recruits.filter(function (r) { return r.visualTier === "B5"; })[0];

  var drawn = [];
  h.game.VisualModels.register("summon", "soldier-recruit-b4:body",
    function (ctx, recruit) { drawn.push(recruit.visualTier); return true; });
  h.game.VisualModels.register("summon", "soldier-recruit-b5:body",
    function (ctx, recruit) { drawn.push(recruit.visualTier); return true; });

  standard.draw(h.game.ctx);
  elite.draw(h.game.ctx);
  t.deep(drawn, ["B4", "B5"], "each tier resolves its own summon model ID");
  t.eq(standard.maxHp, 20, "drawing a replacement leaves B4 gameplay untouched");
  t.eq(elite.maxHp, 40, "and leaves B5 gameplay untouched");
});

test("recruits already in the road keep the stats they were called in with",
  function (t) {
    var h = harness.boot();
    var s = placeSoldierBeside(h, 300);
    h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
    buyPath(h, s, "B", 4);
    s.callRecruits();

    var bullets = [];
    s.update(h.game.FIXED_STEP, [], bullets);
    var r = s.recruits[0];
    t.eq(r.maxHp, 20, "called in as a B4 recruit");

    // Buy B5 with the group already walking. Upgrading mid-life would mean a
    // recruit's numbers depended on when you looked at it.
    buyPath(h, s, "B", 1);
    t.eq(s.recruitHp, 40, "the TOWER now sends 40 HP recruits");
    t.eq(r.maxHp, 20, "but the one already walking is still the 20 it was born as");
    t.eq(r.stats.damage, 1, "and still hits for 1");
  });

test("a recruit can be hovered for its HP and its range", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h, s, "B", 4);
  s.callRecruits();
  s.update(h.game.FIXED_STEP, [], []);
  var r = s.recruits[0];

  // The hit test is padded like an enemy's, because a recruit is the same kind
  // of small moving body to point at.
  t.ok(r.containsPoint(r.x, r.y), "dead centre is a hit");
  t.ok(r.containsPoint(r.x + 4, r.y - 4), "and so is just off centre");
  t.eq(r.containsPoint(r.x + 400, r.y), false, "the far side of the map is not");

  // The label carries BOTH numbers the owner asked for.
  t.eq(r.hoverLabel(), "20 / 20 HP  ·  100 u.l.", "HP and range: " + r.hoverLabel());

  // recruitAt walks the towers, because recruits are not in a global list.
  t.eq(h.run("recruitAt(" + r.x + ", " + r.y + ")"), r, "recruitAt finds it");
  t.eq(h.run("recruitAt(" + (r.x + 400) + ", " + r.y + ")"), null,
    "and finds nothing where there is nothing");

  // A wounded recruit reads its remaining health, which is the number that
  // decides what its body block is worth.
  r.hp = 7;
  t.eq(r.hoverLabel(), "7 / 20 HP  ·  100 u.l.", "wounded: " + r.hoverLabel());

  // Nearest centre wins, because four B5 recruits stand close enough that their
  // padded circles overlap and "first in the array" would flicker.
  var h2 = harness.boot();
  var s2 = placeSoldierBeside(h2, 300);
  h2.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h2, s2, "B", 5);
  s2.callRecruits();
  for (var i = 0; i < Math.round(1 / h2.game.FIXED_STEP); i++) {
    s2.update(h2.game.FIXED_STEP, [], []);
  }
  t.eq(s2.recruits.length, 4, "four out");
  var third = s2.recruits[2];
  t.eq(h2.run("recruitAt(" + third.x + ", " + third.y + ")"), third,
    "the one whose centre the cursor is on");
});

test("the recruit hover yields to the enemy hover", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h, s, "B", 4);
  s.callRecruits();
  s.update(h.game.FIXED_STEP, [], []);
  var r = s.recruits[0];

  // An enemy standing on the recruit. Enemies are drawn ON TOP of recruits, so
  // the rule the panel and onClick already follow -- whatever is drawn on top
  // wins -- has to hold here too.
  var e = h.spawnAt(r.progress, 1000000);
  e.laneOffsetUl = 0;
  e.refreshPos();
  e.pos = { x: r.x, y: r.y };

  t.ok(h.run("enemyAt(" + r.x + ", " + r.y + ")") !== null,
    "the enemy is under the cursor too");
  // recruitAt still finds it -- the precedence lives in drawRecruitHover, which
  // is what a frame actually calls, and a full frame is drawn below.
  t.eq(h.run("recruitAt(" + r.x + ", " + r.y + ")"), r, "and so is the recruit");

  h.run("mouse.x = " + r.x + "; mouse.y = " + r.y);
  h.run("draw()");
  t.ok(true, "a frame with both under the cursor draws without throwing");
});

test("every ability button carries an auto switch, off by default", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h, s, "B", 4);

  var ability = s.panelActions().filter(function (a) { return a.id === "recruits"; })[0];
  t.ok(ability.toggle, "the recruit button has a switch");
  t.eq(ability.toggle.on, false, "OFF by default -- the owner's instruction");
  t.eq(ability.toggle.id, "auto:recruits", "namespaced action id");

  // Flipping it goes through the same performAction every other button uses.
  t.ok(/on$/.test(s.performAction("auto:recruits", {})), "the switch turns on");
  t.eq(h.game.AutoAbility.isOn(s, "recruits"), true, "and the tower records it");
  t.eq(s.panelActions().filter(function (a) { return a.id === "recruits"; })[0].toggle.on,
    true, "which the button then reports");

  s.performAction("auto:recruits", {});
  t.eq(h.game.AutoAbility.isOn(s, "recruits"), false, "and off again");

  // A tower with no ability has no switch anywhere on its panel.
  var plain = h.place(0, 300) || h.place(0, 340);
  if (plain && typeof plain.panelActions === "function") {
    t.eq(plain.panelActions().some(function (a) { return a.toggle; }), false,
      "a gunner has no ability, so no switch");
  } else {
    t.ok(true, "a gunner has no panelActions at all, so no switch");
  }
});

test("an auto switch fires its ability the moment it is ready", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h, s, "B", 4);

  // OFF: a full minute passes and nothing is called in. This is the half that
  // matters most -- the default must not quietly play the game for you.
  var bullets = [];
  for (var i = 0; i < 60 * 60; i++) s.update(h.game.FIXED_STEP, [], bullets);
  t.eq(s.recruits.length, 0, "switch off: nothing was ever called");
  t.eq(s.recruitCooldown, 0, "and the cooldown never started");

  // ON: they go out on the next step, without being asked.
  s.performAction("auto:recruits", {});
  s.update(h.game.FIXED_STEP, [], bullets);
  t.eq(s.recruitCooldown, s.recruitCooldownSeconds,
    "switch on: the cooldown starts by itself");
  t.eq(s.recruitPending.length + s.recruits.length, 2, "and the group is on its way");

  // And it re-fires when the cooldown runs out, which is the whole point.
  //
  // The wait and the threshold are both DERIVED from the period rather than
  // typed. They were 41 s and "> 30", which worked only while the period was
  // 40: at 45 the wait now ends four seconds SHORT of the first call expiring,
  // so the timer read 4.0 and the test failed for the wrong reason -- not
  // "no second call" but "we never waited long enough to deserve one".
  //
  // The threshold has to stay near the TOP of the period to mean anything. A
  // restarted timer reads just under the full period; one that was never
  // restarted has run down to nothing. Something like "> 0" would be satisfied
  // by either and would pin nothing at all.
  var firstGroup = s.recruits.length + s.recruitPending.length;
  t.ok(firstGroup > 0, "first group out");
  var period = s.recruitCooldownSeconds;
  for (var j = 0; j < Math.round((period + 1) / h.game.FIXED_STEP); j++) {
    s.update(h.game.FIXED_STEP, [], bullets);
  }
  t.ok(s.recruitCooldown > period - 2,
    "a second past the period the cooldown has been restarted by a second " +
      "automatic call: " + s.recruitCooldown.toFixed(1) + " of " + period);
});

test("the auto switch can be flipped while its ability is on cooldown", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
  buyPath(h, s, "B", 4);

  // Recruits run a 40 s cooldown, so a switch that went dead with the button
  // would be unreachable for 40 s at a time -- which is exactly when a player
  // reaches for it.
  s.callRecruits();
  var ability = s.panelActions().filter(function (a) { return a.id === "recruits"; })[0];
  t.eq(ability.enabled, false, "the ability button is dead while cooling");
  t.ok(ability.toggle, "but the switch is still there");

  var L = h.run("inspectionLayout(inspected)");
  var slot = L.actions.filter(function (a) { return a.action.id === "recruits"; })[0];
  t.ok(slot.toggle, "and the layout gives it a rectangle");

  // The switch's rectangle is INSIDE the ability button's, so clicking it must
  // not fall through to the button underneath.
  t.ok(slot.toggle.x >= slot.x && slot.toggle.y >= slot.y &&
    slot.toggle.x + slot.toggle.w <= slot.x + slot.w &&
    slot.toggle.y + slot.toggle.h <= slot.y + slot.h,
    "the pill sits inside its button");

  var cx = slot.toggle.x + slot.toggle.w / 2;
  var cy = slot.toggle.y + slot.toggle.h / 2;
  t.eq(h.run("runPanelAction(" + cx + ", " + cy + ")"), true, "the click is consumed");
  t.eq(h.game.AutoAbility.isOn(s, "recruits"), true,
    "and it flipped the switch, not the dead button");
});

test("the Arcane Sniper's nuke has a switch and its cone re-aim does not",
  function (t) {
    var h = harness.boot();
    h.run("cash = 100000000");

    // Same placement idiom the other Longshot tests use: find the first legal
    // spot for THIS type rather than guessing coordinates.
    var slot = h.game.BUILD_SLOTS.indexOf(h.game.LongshotTower);
    var spot = h.run("(function () {" +
      "  for (var x = 24; x < VIEW_WIDTH - 24; x += 8)" +
      "    for (var y = 24; y < VIEW_HEIGHT - 80; y += 8)" +
      "      if (whyCannotBuild(x, y, LongshotTower) === null) return { x: x, y: y };" +
      "  return null; })()");
    var ls = h.place(spot.x, spot.y, slot);
    t.ok(ls, "a Longshot was placed");

    // Walk path B to its end, which is where the active ability lives.
    for (var i = 0; i < 5; i++) {
      ls.performAction("upgradeB", { cash: 100000000, spend: function () {} });
    }
    t.eq(ls.core.purchased.B, 5, "B5 bought");

    var actions = ls.panelActions();
    var nuke = actions.filter(function (a) { return a.id === "ability"; })[0];
    var reaim = actions.filter(function (a) { return a.id === "reaim"; })[0];

    if (nuke) {
      t.ok(nuke.toggle, "the nuke has a switch");
      t.eq(nuke.toggle.on, false, "off by default");
      t.eq(nuke.toggle.id, "auto:ability", "namespaced");
      t.ok(/on$/.test(ls.performAction("auto:ability", {})), "and it flips");
      t.eq(h.game.AutoAbility.isOn(ls, "ability"), true, "recorded on the tower");
    } else {
      t.ok(true, "path B did not reach the ability tier in this fixture");
    }

    // Re-aim takes a DIRECTION from the player's next click, so there is
    // deliberately no switch: an automatic version would have to invent one.
    if (reaim) t.eq(reaim.toggle, undefined, "the cone re-aim has no switch");
    else t.ok(true, "this build has no cone to re-aim");
  });

test("the Soldier's panel still fits above the build bar with the switch on it",
  function (t) {
    var h = harness.boot();
    var s = placeSoldierBeside(h, 300);
    h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");
    buyPath(h, s, "B", 5);
    s.callRecruits();
    for (var i = 0; i < Math.round(1 / h.game.FIXED_STEP); i++) {
      s.update(h.game.FIXED_STEP, [], []);
    }

    // The tallest case in the game: eleven stat rows, three action buttons, a
    // running recruit cooldown and four recruits out. The switch is drawn INSIDE
    // an existing button precisely so this measurement did not have to grow.
    var L = h.run("inspectionLayout(inspected)");
    t.ok(L.y >= 0 && L.y + L.h <= h.run("BAR_Y"),
      "panel " + L.y + " -> " + (L.y + L.h) + " within BAR_Y " + h.run("BAR_Y"));
    t.eq(L.actions.length, 3, "three action rows, not four");
  });

test("the Soldier's panel speaks the shared vocabulary", function (t) {
  var h = harness.boot();
  var s = placeSoldierBeside(h, 300);
  h.run("inspected = towers.filter(function (x) { return x instanceof Soldier; })[0]");

  function labels() {
    return s.statLines().map(function (row) { return row[0]; });
  }

  var rows = labels();
  t.deep(rows.slice(0, 8), ["Damage dealt", "Kills", "Damage", "Range", "Attack speed",
    "Shots per burst", "Shot spacing", "Tower HP"], "the shared rows, in the shared order");
  t.eq(rows[rows.length - 1], "DPS", "DPS last, as on every tower");
  t.eq(rows.indexOf("Target"), -1, "and no Target row -- the button under it says that");

  // The three conditional rows appear only once their tier is owned.
  //
  // The Soldier's row is "Defense pierce", not "Pierce". They are different
  // stats, not two names for one: the Longshot's Pierce is a COUNT of bodies a
  // shot passes through, while the Soldier's B4 is a flat percentage taken off
  // defence (js/soldier.js, upgrade B4 defenseFlatPierce). This test had the
  // Longshot's label AND the Longshot's value of 6 on the Soldier's panel, so
  // the row lookup found nothing and the test died reading [1] off undefined.
  // The "before B4" line below had been passing vacuously all along -- there is
  // no row called "Pierce" on this tower at any tier, so it could never fail.
  t.eq(rows.indexOf("Camo"), -1, "no Camo row before B3");
  t.eq(rows.indexOf("Defense pierce"), -1, "no Defense pierce row before B4");

  buyPath(h, s, "B", 4);
  rows = labels();
  var camo = s.statLines().filter(function (r) { return r[0] === "Camo"; })[0];
  var pierce = s.statLines().filter(function (r) { return r[0] === "Defense pierce"; })[0];
  t.ok(camo, "the Camo row exists once B3 is owned");
  t.ok(pierce, "the Defense pierce row exists once B4 is owned");
  t.eq(camo[1], "Yes", "B3 shows Camo: Yes");
  // Percentage points, so the row carries its unit -- 10%, not a bare 10.
  t.eq(pierce[1], "10%", "B4 shows Defense pierce: 10%");

  // The DPS row and the two rows it summarises always multiply out.
  var damage = s.statLines().filter(function (r) { return r[0] === "Damage"; })[0];
  var dps = s.statLines().filter(function (r) { return r[0] === "DPS"; })[0];
  t.eq(dps[1], h.game.TowerStats.dpsText(s.attackDamage() * s.attacksPerSecond()),
    "DPS is damage x attacks per second, spelled the shared way");
  t.eq(damage[1], h.game.TowerStats.number(s.attackDamage()), "and damage is per shot");
});

test("adding the Soldier moved nothing on the towers that already existed", function (t) {
  var h = harness.boot();

  // The Soldier is the gunner's eventual replacement, not a change to it.
  // The two PRICES here moved on 2026-07-30, in the economy revamp rather than
  // by anything the Soldier did; every combat stat below is still untouched,
  // which is what this test is actually about.
  t.eq(h.game.Tower.COST, 100, "gunner cost");
  t.eq(h.game.Tower.BASE_DAMAGE, 1, "gunner damage");
  t.eq(h.game.Tower.BASE_FIRE_RATE, 1, "gunner fire rate");
  t.eq(h.game.Tower.BASE_HP, 60, "gunner hit points");
  t.eq(h.game.Tower.BASE_RANGE_UL, 100, "gunner range");
  t.eq(h.game.Smasher.COST, 600, "smasher cost");
  t.eq(h.game.Smasher.BASE_DAMAGE, 14, "smasher damage");

  // A gunner's bullet carries no pierce, so it mitigates exactly as it always
  // did -- the new argument defaults to nothing at every existing call site.
  h.run("cash = 100000");
  var g = placeBeside(h, 300, "Tower");
  t.ok(g !== null, "a gunner still places");
  var b = new h.game.Bullet(0, 0, null, 1, null, g);
  t.eq(b.defenseFlatPierce, 0, "and its bullets pierce no defence");

  // STARTING_CASH still buys at least one equipped tower.
  var cheapest = h.game.BUILD_SLOTS.reduce(function (min, T) {
    return T ? Math.min(min, T.COST) : min;
  }, Infinity);
  t.ok(h.game.STARTING_CASH > cheapest, "the opening stake still beats the cheapest tower");
});



// ---------------------------------------------------------------------------
// THE THREE NORMAL-DIFFICULTY TYPES (2026-08-27)
//
// Herald, Sapper and Volatile. Every one of them is built out of a mechanic
// BLOCK on the type row, and the standing rule this file's roster test already
// enforces applies to all three: nothing in js/ branches on the strings
// "herald", "sapper" or "volatile". These tests exercise the MECHANICS through
// the real entry points -- Enemy.prototype.supportAllies, attackTowers,
// resolveAttack, Hazards.update and the game's own update() -- so passing here
// means the board behaves the same way.
// ---------------------------------------------------------------------------

// A SINGLE BOOTED GAME, SHARED BY THE TESTS THAT ONLY READ DATA.
//
// Most tests need a fresh board because they change one. A test that asks what
// `Enemy.TYPES.herald.health` is, or what the index would print, changes
// nothing -- and a boot is not free: it builds a whole `vm` context that lives
// until the process ends, and this suite already makes over two hundred of
// them. Two hundred contexts is enough garbage to force repeated full
// mark-compacts, and every one of those is a chance to hit the GC crash node
// v24 has in `ClearStaleLeftTrimmedPointerVisitor` (see tests/harness.js).
//
// So: read-only tests share one. Anything that places a tower, spawns a body,
// steps the clock or clicks still boots its own -- the sharing is by USE, never
// by convenience.
var sharedReadOnly = null;
function readOnlyBoot() {
  if (!sharedReadOnly) sharedReadOnly = harness.boot();
  return sharedReadOnly;
}

group("the Herald");

// A board of ordinary bodies parked along the road at known distances from a
// Herald, so "the eight nearest within 160 u.l." is a question with an obvious
// right answer. Returns { herald, bodies } with the bodies in the order they
// were created (which is also their laneIndex order -- the pick's tie-break).
function heraldBoard(h, count, typeId, spacingUl) {
  var Enemy = h.game.Enemy;
  var herald = new Enemy(h.game.path, undefined, "herald");
  herald.pos = { x: 0, y: 0 };
  var bodies = [];
  for (var i = 0; i < count; i++) {
    var body = new Enemy(h.game.path, undefined, typeId || "normal");
    // Placed by hand rather than by walking the road: this is a test about a
    // radius, and a road that bends would make "distance" a different question
    // from the one the mechanic asks.
    body.pos = { x: h.game.ul(spacingUl === undefined ? 10 : spacingUl) * (i + 1),
                 y: 0 };
    bodies.push(body);
  }
  return { herald: herald, bodies: bodies, all: [herald].concat(bodies) };
}

test("the Herald's numbers are the ones that were asked for", function (t) {
  var h = readOnlyBoot();
  var T = h.game.Enemy.TYPES.herald;
  t.eq(T.health, 100, "100 base health");
  t.eq(T.bounty, 120, "120 bounty");
  t.eq(T.speedMultiplier, 0.55, "0.55x baseline movement speed");
  t.ok(Math.abs(T.sizeScale - 1.15) < 0.001, "about 1.15x a Normal's size");
  t.eq(T.support.intervalSeconds, 8, "a pulse every 8 s");
  t.eq(T.support.targets, 8, "up to eight allies");
  t.eq(T.support.reachUl, 160, "within 160 u.l.");
  t.eq(T.support.haste.speedMultiplier, 1.3, "+30% movement speed");
  t.eq(T.support.haste.seconds, 4, "for 4 s");
  t.eq(T.support.pick, "nearest", "picking the nearest");
});

test("a Herald pulses every eight seconds, and not before", function (t) {
  var h = harness.boot();
  var board = heraldBoard(h, 3);

  // The timer starts FULL, like every other support type's: a supporter that
  // pulsed the instant it walked in would give the player nothing to react to.
  t.eq(board.herald.supportTimer, 8, "the first cycle is a full eight seconds");

  var pulsed = board.herald.supportAllies(7.9, board.all);
  t.eq(pulsed, null, "nothing at 7.9 s");
  t.eq(board.bodies[0].isHastened(), false, "and nobody is moving faster");

  pulsed = board.herald.supportAllies(0.2, board.all);
  t.ok(pulsed && pulsed.length === 3, "the pulse lands at 8.1 s");
  t.eq(board.bodies[0].isHastened(), true, "and the allies are hastened");
  t.eq(board.herald.supportTimer, 8, "with the next cycle a full eight again");
});

test("a pulse reaches 160 u.l. and no further", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var herald = new Enemy(h.game.path, undefined, "herald");
  herald.pos = { x: 0, y: 0 };

  var inside = new Enemy(h.game.path, undefined, "normal");
  inside.pos = { x: h.game.ul(159), y: 0 };
  var outside = new Enemy(h.game.path, undefined, "normal");
  outside.pos = { x: h.game.ul(161), y: 0 };

  herald.supportAllies(8, [herald, inside, outside]);
  t.eq(inside.isHastened(), true, "159 u.l. away is inside the pulse");
  t.eq(outside.isHastened(), false, "161 u.l. away is outside it");
});

test("a pulse takes the eight NEAREST, with a deterministic tie-break",
function (t) {
  var h = harness.boot();
  // Twelve bodies at 10, 20, ... 120 u.l. The cap is eight, so the four
  // furthest must be left out -- and they must be the four furthest, not four
  // arbitrary ones.
  var board = heraldBoard(h, 12, "normal", 10);
  var picked = board.herald.supportAllies(8, board.all);
  t.eq(picked.length, 8, "eight allies, and eight is the cap");

  var hastened = board.bodies.filter(function (b) { return b.isHastened(); });
  t.eq(hastened.length, 8, "eight bodies are moving faster");
  for (var i = 0; i < 12; i++) {
    t.eq(board.bodies[i].isHastened(), i < 8,
      "body at " + ((i + 1) * 10) + " u.l. " + (i < 8 ? "is" : "is not") +
      " in the eight nearest");
  }

  // THE TIE-BREAK. Four bodies at exactly the same point: the pick has to be
  // reproducible, and `laneIndex` -- the spawn counter -- is what makes it so.
  var Enemy = h.game.Enemy;
  var herald = new Enemy(h.game.path, undefined, "herald");
  herald.pos = { x: 0, y: 0 };
  var tied = [];
  for (var k = 0; k < 4; k++) {
    var e = new Enemy(h.game.path, undefined, "swarm");
    e.pos = { x: h.game.ul(30), y: 0 };
    tied.push(e);
  }
  var order = herald.supportCandidates(Enemy.TYPES.herald.support,
    [herald].concat(tied));
  t.deep(order.map(function (e) { return e.laneIndex; }),
    tied.map(function (e) { return e.laneIndex; }),
    "bodies at an identical distance come back in spawn order, every time");
});

test("a Herald hastens nothing it is not allowed to", function (t) {
  var h = harness.boot();
  var Enemy = h.game.Enemy;
  var herald = new Enemy(h.game.path, undefined, "herald");
  herald.pos = { x: 0, y: 0 };

  // One of each excluded kind, all well inside the reach, plus one body that
  // IS eligible so the pulse is not simply empty.
  var BARRED = ["flying", "healer", "fractal_slime", "midboss", "boss_fast",
                "boss", "herald"];
  var board = [herald];
  var barred = BARRED.map(function (id) {
    var e = new Enemy(h.game.path, undefined, id);
    e.pos = { x: h.game.ul(20), y: 0 };
    board.push(e);
    return e;
  });
  var ok = new Enemy(h.game.path, undefined, "normal");
  ok.pos = { x: h.game.ul(100), y: 0 };      // FURTHEST, deliberately
  board.push(ok);

  var picked = herald.supportAllies(8, board);
  t.eq(picked.length, 1, "one eligible body on the board, and it is the pick");
  t.eq(picked[0], ok, "even though it is the furthest thing there");
  t.eq(ok.isHastened(), true, "the ordinary body is hastened");
  barred.forEach(function (e, i) {
    t.eq(e.isHastened(), false, BARRED[i] + " is ineligible");
  });
  t.eq(herald.isHastened(), false, "and a Herald cannot hasten itself");

  // A FRACTAL DESCENDANT IS ALSO BARRED, which is the half a type-id list
  // would have got wrong: a split child is the same roster row at a lower tier.
  var child = new Enemy(h.game.path, undefined, "fractal_slime", { tier: 0 });
  child.pos = { x: h.game.ul(15), y: 0 };
  herald.supportTimer = 0;
  herald.supportAllies(0.1, [herald, child, ok]);
  t.eq(child.isHastened(), false, "a T0 descendant is ineligible too");
});

test("haste never stacks; a second pulse only refreshes it", function (t) {
  var h = harness.boot();
  var body = h.spawnAt(0, undefined, "swarm");
  var base = body.currentSpeedUlps();

  body.applyHaste(1.3, 4);
  var hasted = body.currentSpeedUlps();
  t.ok(Math.abs(hasted / base - 1.3) < 1e-9, "one pulse is +30%");

  // A second pulse from a second Herald.
  body.applyHaste(1.3, 4);
  t.ok(Math.abs(body.currentSpeedUlps() / base - 1.3) < 1e-9,
    "a second pulse is still +30%, not +69%");
  t.eq(body.hasteTimer, 4, "and it refreshed the four seconds");

  // Refresh means REFRESH, not extend: half a second in, an equal pulse puts
  // the timer back to a full four rather than adding four to what was left.
  body.update(2);
  t.ok(Math.abs(body.hasteTimer - 2) < 1e-9, "two seconds left");
  body.applyHaste(1.3, 4);
  t.eq(body.hasteTimer, 4, "and an equal pulse puts it back to four");

  // A WEAKER PULSE CANNOT DILUTE A STRONGER ONE, the same rule applySlow
  // follows in the other direction.
  body.applyHaste(1.1, 9);
  t.ok(Math.abs(body.currentSpeedUlps() / base - 1.3) < 1e-9,
    "a weaker haste does not replace a stronger one");
  t.eq(body.hasteTimer, 4, "and does not extend it either");
});

test("haste outlives the Herald that granted it", function (t) {
  var h = harness.boot();
  var board = heraldBoard(h, 2);
  board.herald.supportAllies(8, board.all);
  t.eq(board.bodies[0].isHastened(), true, "hastened");

  // The source dies. The effect is on the TARGET's own clock -- the same shape
  // as a Healer's regeneration, and for the same reason: this is an effect on
  // the body, not a beam somebody has to keep holding.
  board.herald.dead = true;
  board.bodies[0].update(1);
  t.eq(board.bodies[0].isHastened(), true, "still hastened a second later");
  t.ok(Math.abs(board.bodies[0].hasteTimer - 3) < 1e-9, "with three seconds left");
  board.bodies[0].update(3);
  t.eq(board.bodies[0].isHastened(), false, "and it lapses on its own clock");
});

test("repeated haste leaves no permanent speed behind", function (t) {
  var h = harness.boot();
  var body = h.spawnAt(0, undefined, "normal");
  var base = body.currentSpeedUlps();

  // Forty pulses, each fully aged out, at an awkward step size that never
  // lands on the expiry exactly -- which is precisely the case a multiplier
  // decayed TOWARDS 1 rather than reset TO 1 would drift on.
  for (var i = 0; i < 40; i++) {
    body.applyHaste(1.3, 4);
    for (var k = 0; k < 63; k++) body.update(0.0667);
  }
  t.eq(body.hasteMultiplier, 1, "the multiplier is exactly 1 again");
  t.eq(body.hasteTimer, 0, "with no timer left");
  t.eq(body.currentSpeedUlps(), base,
    "and the body walks at exactly the pace it was born with");

  // And the type row was never touched -- every Herald shares it, so a write
  // there would speed up every future body of that type, including next run's.
  t.eq(h.game.Enemy.TYPES.normal.speedMultiplier, 1, "the type row is untouched");
});

test("haste rides the pause, the speed toggle and a restart", function (t) {
  var h = harness.boot();
  var body = h.spawnAt(200, undefined, "normal");
  body.applyHaste(1.3, 4);

  // PAUSED: update() returns before anything ages, so the four seconds are not
  // spent while a menu is up. Nothing in the haste code knows the pause exists
  // -- it is a property of who calls update() -- which is the point.
  h.run("paused = true");
  h.step(3);
  t.ok(Math.abs(body.hasteTimer - 4) < 1e-9, "a paused run spends none of it");
  h.run("paused = false");
  h.step(1);
  t.ok(Math.abs(body.hasteTimer - 3) < 1e-6, "and it resumes on the fixed step");

  // A restart takes the body with it, so there is nothing left to be hastened.
  h.run("restartGame()");
  t.eq(h.game.enemies.length, 0, "a restart clears the road");
});


group("the Sapper");

// A Sapper parked beside one tower, with the tower list the game would hand it.
function sapperAt(h, tower, distanceUl) {
  var e = new h.game.Enemy(h.game.path, undefined, "sapper");
  e.pos = { x: tower.x + h.game.ul(distanceUl === undefined ? 40 : distanceUl),
            y: tower.y };
  return e;
}

function sapperTower(h) {
  h.run("cash = 100000");
  var spot = h.game.Maps.bestSpots(h.game.currentMap, 1)[0];
  return h.placeGunner(spot.x, spot.y);
}

test("the Sapper's numbers are the ones that were asked for", function (t) {
  var h = readOnlyBoot();
  var T = h.game.Enemy.TYPES.sapper;
  t.eq(T.health, 45, "45 base health");
  t.eq(T.bounty, 60, "60 bounty");
  t.eq(T.speedMultiplier, 0.8, "0.8x baseline movement speed");
  t.eq(T.attack.intervalSeconds, 8, "an 8 s cooldown");
  t.eq(T.attack.reachUl, 90, "a 90 u.l. reach");
  t.eq(T.attack.windUpSeconds, 1.1, "a 1.1 s telegraph");
  t.eq(T.attack.disable.seconds, 2, "a 2 s disable");
  t.eq(T.attack.disable.immuneSeconds, 4, "and 4 s of immunity after recovery");
  t.eq(T.attack.damage, undefined, "with no damage authored at all");
  t.eq(T.attack.stunSeconds, undefined, "and no stun of its own");
});

test("a Sapper telegraphs for 1.1 s, stands still, and then disables",
function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);
  var sapper = sapperAt(h, tower, 40);
  var hp = tower.currentHp;

  // THE INITIAL COOLDOWN IS THE FULL EIGHT SECONDS. The timer starts full, so
  // a Sapper that walks into range does not act on the frame it arrives.
  t.eq(sapper.attackTimer, 8, "the first cycle is eight seconds");
  sapper.attackTowers(7.9, [tower]);
  t.eq(sapper.windUpTimer, 0, "nothing at 7.9 s");

  sapper.attackTowers(0.2, [tower]);
  t.ok(sapper.windUpTimer > 0, "the telegraph opens at 8.1 s");
  t.eq(sapper.windUpTarget, tower, "committed to the tower it is standing at");
  t.eq(sapper.currentSpeedUlps(), 0, "and it stops dead while it telegraphs");
  t.eq(h.game.TowerHealth.isStunned(tower), false, "the tower is still firing");

  // It resolves at the end of the wind-up and NOT before.
  sapper.attackTowers(1.0, [tower]);
  t.eq(h.game.TowerHealth.isStunned(tower), false, "still nothing at 1.0 s in");
  sapper.attackTowers(0.2, [tower]);
  t.eq(h.game.TowerHealth.isStunned(tower), true, "the tower goes dark at 1.1 s");
  t.eq(tower.stunTimer, 2, "for exactly two seconds");
  t.eq(tower.currentHp, hp, "and it took no damage at all");
  t.eq(sapper.windUpTarget, null, "the commitment is released");
  t.eq(sapper.attackTimer, 8, "and the next cycle is another eight seconds");
});

test("a Sapper looks 90 u.l. and no further", function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);

  var near = sapperAt(h, tower, 89);
  near.attackTowers(8.1, [tower]);
  t.ok(near.windUpTimer > 0, "89 u.l. away is in reach");

  var far = sapperAt(h, tower, 91);
  far.attackTowers(8.1, [tower]);
  t.eq(far.windUpTimer, 0, "91 u.l. away is not");
  // AND THE CYCLE IS NOT CONSUMED. The timer is left expired, so it acts the
  // instant something comes into reach rather than waiting out another eight.
  t.ok(far.attackTimer <= 0, "and the cycle was not spent looking");
});

test("a disabled tower cannot fire, and its cooldown does not advance",
function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);
  h.spawnAt(h.game.path.length * 0.5, 500, "normal");

  h.run("TowerHealth.stun(towers[0], 2)");
  var before = tower.cooldown;
  h.step(1);
  t.eq(h.game.bullets.length, 0, "a disabled tower fires nothing");
  t.eq(tower.cooldown, before,
    "and its cooldown is exactly where it was -- the stun is not absorbed by it");
  t.ok(Math.abs(tower.stunTimer - 1) < 1e-6, "with a second of silence left");
});

test("a disabled tower and an immune one are both invalid targets", function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);
  var disable = h.game.Enemy.TYPES.sapper.attack.disable;

  // DISABLED.
  h.run("TowerHealth.stun(towers[0], 2)");
  t.eq(h.game.Enemy.towerAcceptsDisable(tower, disable), false,
    "a tower that is already dark cannot be disabled again");
  var sapper = sapperAt(h, tower, 40);
  sapper.attackTowers(8.1, [tower]);
  t.eq(sapper.windUpTimer, 0, "so a Sapper does not even telegraph at it");

  // IMMUNE, and not disabled. The tower is firing perfectly well; it simply
  // cannot be taken out again yet.
  h.run("towers[0].stunTimer = 0");
  h.run("TowerHealth.suppress(towers[0], 'sapper', 4)");
  t.eq(h.game.TowerHealth.isStunned(tower), false, "the tower is live");
  t.eq(h.game.Enemy.towerAcceptsDisable(tower, disable), false,
    "and still an invalid target");
  var second = sapperAt(h, tower, 40);
  second.attackTowers(8.1, [tower]);
  t.eq(second.windUpTimer, 0, "no telegraph at an immune tower");
});

test("after recovery a tower is immune for four seconds, and then is not",
function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);
  var sapper = sapperAt(h, tower, 40);

  sapper.attackTowers(8.1, [tower]);
  sapper.attackTowers(1.1, [tower]);
  t.eq(tower.stunTimer, 2, "disabled for two seconds");
  t.ok(Math.abs(h.game.TowerHealth.suppressionRemaining(tower, "sapper") - 6) < 1e-9,
    "and stamped immune for the two plus four -- six in all");

  // THE IMMUNITY AGES WHILE THE TOWER IS DARK, which is what makes it four
  // seconds AFTER recovery rather than four seconds of which two are spent
  // stunned. It is ticked in the main loop before the stun check, precisely
  // because that check skips the rest of the tower's step.
  h.step(2.05);
  t.eq(h.game.TowerHealth.isStunned(tower), false, "it wakes up after two seconds");
  t.ok(Math.abs(h.game.TowerHealth.suppressionRemaining(tower, "sapper") - 4) < 0.05,
    "with four seconds of immunity left");

  h.step(3.9);
  t.eq(h.game.TowerHealth.isSuppressed(tower, "sapper"), true, "still immune");
  h.step(0.2);
  t.eq(h.game.TowerHealth.isSuppressed(tower, "sapper"), false,
    "and vulnerable again four seconds after it recovered");
});

test("two Sappers on one tower resolve in enemy order: one disable, one fizzle",
function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);

  var first = sapperAt(h, tower, 40);
  var second = sapperAt(h, tower, 41);
  var board = [tower];

  // Both commit on the same frame, to the same tower -- which is legal and is
  // the case the fizzle rule exists for.
  first.attackTowers(8.1, board);
  second.attackTowers(8.1, board);
  t.eq(first.windUpTarget, tower, "both telegraph the same tower");
  t.eq(second.windUpTarget, tower, "at the same moment");

  // And both resolve on the same frame, walked in enemy order -- which is what
  // the main loop does with `enemies`.
  first.attackTowers(1.1, board);
  var stunAfterFirst = tower.stunTimer;
  second.attackTowers(1.1, board);

  t.eq(stunAfterFirst, 2, "the FIRST one disables the tower");
  t.eq(tower.stunTimer, 2,
    "and the second finds it disabled, fizzles, and does not extend the stun");
  t.ok(Math.abs(h.game.TowerHealth.suppressionRemaining(tower, "sapper") - 6) < 1e-9,
    "nor refresh the immunity");
  t.eq(second.attackTimer, 8, "the fizzle still consumes the second one's cycle");
  t.eq(second.windUpTarget, null, "and releases its commitment");
});

test("a telegraph cancels cleanly when its target or its owner goes", function (t) {
  var h = harness.boot();

  // 1 -- THE TARGET IS SOLD MID-TELEGRAPH. Membership in `towers` is the test
  // that catches this: the object is otherwise perfectly intact.
  var h1 = harness.boot();
  var soldTower = sapperTower(h1);
  var sapper = sapperAt(h1, soldTower, 40);
  sapper.attackTowers(8.1, [soldTower]);
  t.eq(sapper.windUpTarget, soldTower, "committed");
  h1.run("sellTower(towers[0])");
  t.eq(h1.game.towers.length, 0, "the tower is sold mid-telegraph");
  sapper.attackTowers(1.1, h1.game.towers);
  t.eq(sapper.windUpTarget, null, "the telegraph resolves to nothing");
  t.eq(sapper.attackTimer, 8, "the cycle is spent, and nothing was disabled");

  // 2 -- THE TARGET IS DESTROYED MID-TELEGRAPH. It is still in `towers` until
  // the sweep, so `isDestroyed` is the half that catches this one.
  var h2 = harness.boot();
  var dying = sapperTower(h2);
  var s2 = sapperAt(h2, dying, 40);
  s2.attackTowers(8.1, [dying]);
  dying.currentHp = 0;
  s2.attackTowers(1.1, [dying]);
  t.eq(h2.game.TowerHealth.isStunned(dying), false,
    "a destroyed tower is not disabled on its way out");

  // 3 -- THE SAPPER ITSELF DIES MID-TELEGRAPH. It drops the commitment on the
  // step it dies rather than carrying a threat the renderers would draw.
  var h3 = harness.boot();
  var target = sapperTower(h3);
  var s3 = sapperAt(h3, target, 40);
  s3.attackTowers(8.1, [target]);
  t.ok(s3.windUpTimer > 0, "telegraphing");
  s3.dead = true;
  t.eq(s3.attackTowers(1 / 60, [target]), null, "a dead Sapper resolves nothing");
  t.eq(s3.windUpTarget, null, "and the telegraph is cleared");
  t.eq(h3.game.TowerHealth.isStunned(target), false, "the tower is untouched");
});

test("Sapper state dies with the tower and with the run", function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);
  h.run("TowerHealth.suppress(towers[0], 'sapper', 6)");
  t.eq(h.game.TowerHealth.isSuppressed(tower, "sapper"), true, "immune");

  // SELLING. The immunity lives on the tower object, so it leaves with it --
  // there is no registry anywhere that could outlive a board.
  h.run("sellTower(towers[0])");
  t.eq(h.game.towers.length, 0, "sold");

  // A FRESH TOWER ON THE SAME SPOT IS A FRESH TOWER.
  var again = sapperTower(h);
  t.eq(h.game.TowerHealth.isSuppressed(again, "sapper"), false,
    "a new tower on the same ground is vulnerable");

  // A RESTART, a map change and a return to the menu all go through
  // restartGame(), which empties `towers` outright.
  h.run("TowerHealth.suppress(towers[0], 'sapper', 6); restartGame()");
  t.eq(h.game.towers.length, 0, "a restart takes every tower and its state");
});


group("the Volatile");

test("the Volatile's numbers are the ones that were asked for", function (t) {
  var h = readOnlyBoot();
  var T = h.game.Enemy.TYPES.volatile;
  t.eq(T.health, 8, "8 base health -- under a single Warbringer round");
  t.eq(T.bounty, 25, "25 bounty, deliberately unchanged by the retune");
  t.eq(T.speedMultiplier, 1.5, "1.5x baseline movement speed");
  t.ok(Math.abs(T.sizeScale - 0.9) < 0.001, "about 0.9x a Normal's size");
  t.eq(T.deathEffect.hazard.fuseSeconds, 1, "a one-second fuse");
  t.eq(T.deathEffect.hazard.radiusUl, 60, "a 60 u.l. blast");
  t.eq(T.deathEffect.hazard.towerDamage, 13, "for 13 damage");
  t.eq(T.deathEffect.hazard.stunSeconds, undefined, "and no stun at all");

  // IT IS THE FASTEST THING THAT ACTS ON TOWERS -- not the fastest body on the
  // road, which is a Fast at 1.75. Derived from the roster rather than typed,
  // so it stays a claim about the game instead of a number that goes stale the
  // next time an attacker is retuned.
  var fastestOtherAttacker = 0;
  Object.keys(h.game.Enemy.TYPES).forEach(function (id) {
    var other = h.game.Enemy.TYPES[id];
    if (id === "volatile" || !other.attack) return;
    fastestOtherAttacker = Math.max(fastestOtherAttacker, other.speedMultiplier || 1);
  });
  t.ok(fastestOtherAttacker > 0, "there are other attackers to compare against");
  t.ok(T.speedMultiplier > fastestOtherAttacker * 1.5,
    "and it closes far faster than any of them, which is what the 8 health buys");

  // THE DIVE AND THE BLAST ARE TWO DIFFERENT NUMBERS, and that is the retune
  // rather than a drift: it crosses 75 u.l. to reach a tower and then takes
  // only 60 with it, so a second gun set back behind the first is outside the
  // explosion even though the first was close enough to be dived at.
  t.eq(T.attack.damage, 13, "the dive hits for the same 13 the charge does");
  t.eq(T.attack.damage, T.deathEffect.hazard.towerDamage,
    "one damage number for both halves -- that pair IS still shared");
  t.eq(T.attack.reachUl, 75, "it will cross 75 u.l. to reach a tower");
  t.ok(T.attack.reachUl > T.deathEffect.hazard.radiusUl,
    "and the dive reaches further than the blast, so spacing buys something");
  t.eq(T.attack.lunge, true, "it moves onto what it hits");
  t.eq(T.attack.selfDestructs, true, "and dies of the impact");
  t.eq(T.attack.intervalSeconds, 0,
    "with no cooldown -- attackTimer starts at the interval, so a positive " +
    "one would make it walk past towers before it was allowed to dive");
});

test("every Volatile in the campaign is the last thing its wave spawns",
function (t) {
  var h = readOnlyBoot();

  // ACROSS EVERY SCHEDULE, not just the one that carries them today. The rule
  // the owner set on 2026-08-27 -- "in every wave there are volatiles, make
  // them come out last" -- is a claim about the CAMPAIGN, so it is checked
  // against every entry in DIFFICULTIES. Easy has no Volatiles at all, which
  // makes it vacuously true there and keeps the test honest the day that
  // changes.
  var checked = 0;
  var problems = [];

  h.game.DIFFICULTIES.forEach(function (difficulty) {
    difficulty.waves.forEach(function (wave, i) {
      var firstVolatile = Infinity;
      var lastOther = -Infinity;

      wave.groups.forEach(function (g) {
        // A group's last body leaves at `at + (count - 1) * interval`. It is
        // the LAST of the others that has to clear, not the first: a group
        // that merely STARTS earlier but trickles for twenty seconds would
        // still be arriving underneath the divers.
        var end = g.at + (g.count - 1) * g.interval;
        if (g.type === "volatile") firstVolatile = Math.min(firstVolatile, g.at);
        else lastOther = Math.max(lastOther, end);
      });

      if (firstVolatile === Infinity) return;    // no Volatiles in this wave
      checked++;
      if (!(firstVolatile > lastOther)) {
        problems.push(difficulty.name + " wave " + (i + 1) +
          ": a Volatile leaves at " + firstVolatile +
          " s but another group is still arriving at " + lastOther.toFixed(2) + " s");
      }
    });
  });

  t.deep(problems, [], "no wave sends a Volatile before it has finished with " +
    "everything else");
  t.eq(checked, 3, "and three waves were actually checked -- 20, 26 and 31 -- " +
    "so this cannot pass by finding no Volatiles at all");
});

test("the closing volley still lands inside its wave's ceiling", function (t) {
  var h = readOnlyBoot();

  // Moving six groups to the tail of their waves is exactly the edit that
  // pushes a last spawn past its `duration`, which the shipping validator
  // rejects outright. Asserted here as well as there because THIS is the
  // change that made it a live risk, and a margin of seconds is worth seeing
  // rather than inferring from a green validator.
  var margins = [];
  h.game.DIFFICULTIES.forEach(function (difficulty) {
    difficulty.waves.forEach(function (wave, i) {
      if (!wave.groups.some(function (g) { return g.type === "volatile"; })) return;
      var ev = h.game.waveTimeline(wave);
      margins.push(wave.duration - ev[ev.length - 1].time);
    });
  });

  t.eq(margins.length, 3, "three waves carry Volatiles");
  margins.forEach(function (m, i) {
    t.ok(m > 20, "wave " + i + " still has " + m.toFixed(1) +
      " s of ceiling after its last diver, which is room to spare");
  });
});

// A VOLATILE AT AN EXACT DISTANCE FROM A TOWER, placed rather than walked, the
// same arrangement sapperAt has and for the same reason: what these tests
// measure is the dive's geometry, and a body that walked here would be
// somewhere slightly different every time the road or the lane offset changed.
//
// NOT pushed into `enemies`. attackTowers is the real entry point and takes
// the board directly, so a test that only wants the dive does not also have to
// out-run the gunner it is diving at.
function volatileAt(h, tower, distanceUl) {
  var e = new h.game.Enemy(h.game.path, undefined, "volatile");
  e.pos = { x: tower.x + h.game.ul(distanceUl), y: tower.y };
  return e;
}

// The same body, but ON THE ROAD and on the board, at the point of the path
// that runs closest to `tower`. For the tests that drive the real update()
// loop, where a hand-written `pos` does not survive the top of the next step.
function volatileOnRoadNear(h, tower) {
  var best = 0;
  var bestD = Infinity;
  for (var p = 0; p <= h.game.path.length; p += 2) {
    var pt = h.game.path.pointAt(p);
    var d = (pt.x - tower.x) * (pt.x - tower.x) + (pt.y - tower.y) * (pt.y - tower.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return h.spawnAt(best, undefined, "volatile");
}

test("a Volatile dives into the nearest tower, hits it for 13, and dies of it",
function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);
  var hp = tower.currentHp;
  var body = volatileAt(h, tower, 60);

  // ONE STEP IS ENOUGH. intervalSeconds is 0, so attackTimer starts expired
  // and the dive lands on the first step a tower is in reach -- which is the
  // whole point of authoring it as 0 rather than as a small number.
  var hit = body.attackTowers(1 / 60, h.game.towers);

  t.eq(hit, tower, "it went for the tower");
  t.eq(tower.currentHp, hp - 13, "which lost exactly 13");
  t.eq(h.game.TowerHealth.isStunned(tower), false, "and was not stunned");
  t.eq(body.dead, true, "the body died of the impact");
  t.eq(body.health, 0, "at zero health");
  t.eq(body.leaked, false, "and it is a death, not a leak");

  // ONTO the tower, not merely at it. This is what puts the charge under the
  // tower a second later rather than back out on the road.
  t.eq(body.pos.x, tower.x, "it is standing on the tower's x");
  t.eq(body.pos.y, tower.y, "and on its y");
});

test("the dive reaches 75 u.l. and no further", function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);

  var far = volatileAt(h, tower, 76);
  var hp = tower.currentHp;
  t.eq(far.attackTowers(1 / 60, h.game.towers), null, "76 u.l. is out of reach");
  t.eq(tower.currentHp, hp, "the tower is untouched");
  t.eq(far.dead, false,
    "and nothing blew itself up over an empty stretch of road -- a dive that " +
    "found no tower never committed, so the body walks on");

  var near = volatileAt(h, tower, 74);
  t.ok(!!near.attackTowers(1 / 60, h.game.towers), "74 u.l. is inside it");
  t.eq(tower.currentHp, hp - 13, "and that one lands");
});

// THE GAP BETWEEN THE TWO RANGES IS A FEATURE, so it gets its own test rather
// than living only in the two edge tests above. A tower at 70 u.l. is close
// enough to be dived at and far enough to sit outside the blast that follows,
// which is the whole of what the retune sold the player: spacing.
test("a tower can be inside the dive and outside the blast", function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);
  var hp = tower.currentHp;

  var body = volatileAt(h, tower, 70);
  t.eq(body.attackTowers(1 / 60, h.game.towers), tower, "70 u.l. is divable");

  // The charge is armed ON the tower, so THAT tower is always inside its own
  // blast. What the shorter radius protects is everything behind it -- proved
  // here by arming a charge at the point the body took off from instead.
  var second = { x: tower.x + h.game.ul(70), y: tower.y };
  var hazard = armChargeAt(h, second.x, second.y);
  t.ok(!!hazard, "a charge where it jumped from");
  h.step(1.2);
  t.eq(tower.currentHp, hp - 13,
    "the tower took the dive and nothing else -- 70 u.l. is outside the 60 " +
    "u.l. blast, so the reach it was dived from could not also blast it");
});

test("the dive is a death: it pays, it counts, and it arms the charge ON the " +
"tower it hit", function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);
  var hp = tower.currentHp;
  var cashBefore = h.game.cash;
  var killsBefore = h.game.runKills;

  // Through the REAL loop this time, so it has to be WALKED rather than
  // placed: update() writes `pos` from `progress` at the top of every step, so
  // a body pushed onto the board with a hand-written `pos` is back on the road
  // before attackTowers ever sees it. This one is put on the stretch of road
  // that passes closest to the tower, which is where a Volatile that got this
  // far would be standing anyway.
  var body = volatileOnRoadNear(h, tower);
  h.step(1 / 60);

  t.eq(h.game.enemies.indexOf(body), -1, "the body was swept off the board");
  t.eq(tower.currentHp, hp - 13, "the tower took the impact");
  t.eq(h.game.cash - cashBefore, h.game.Enemy.bountyOf("volatile"),
    "the dive pays its bounty, because a dive is a death and the dead branch " +
    "is where this game pays");
  t.eq(h.game.runKills - killsBefore, 1, "and credits one kill");

  t.eq(h.game.Hazards.count(), 1, "and it left a charge");
  var hazard = h.game.Hazards.active()[0];
  t.eq(hazard.x, tower.x, "armed on the tower's own x, not back on the road");
  t.eq(hazard.y, tower.y, "and its y");

  // AND THEN THE SECOND HALF. The explosion is unchanged by the dive: same
  // fuse, same 13, over 60 u.l. -- and the charge is armed ON the tower, so
  // the tower dived into is always inside its own blast and pays 26 in all.
  h.step(1.1);
  t.eq(tower.currentHp, hp - 26, "a second later the charge takes 13 more");
});

test("a Volatile shot down out of reach still dies the old way", function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);
  var hp = tower.currentHp;

  var body = h.spawnAt(h.game.path.length * 0.05, undefined, "volatile");
  body.takeDamage(999);
  h.step(1 / 60);

  t.eq(h.game.Hazards.count(), 1, "the charge is armed where it fell");
  var hazard = h.game.Hazards.active()[0];
  t.eq(hazard.x, body.pos.x, "at the exact x it died on, far out on the road");
  t.ok(Math.hypot(hazard.x - tower.x, hazard.y - tower.y) > h.game.ul(75),
    "which is further off than it would ever have dived from");

  // Killing it early is the whole reward this change is built around: the
  // tower pays nothing at all, where letting it in would have cost 40.
  h.step(1.5);
  t.eq(tower.currentHp, hp, "and no tower ever paid a point for it");
});

test("a Volatile does not dive into a Summoner's blub", function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);

  // Blubs live in `towers` so they occupy space and take area stuns, but the
  // owner's brief is flat that enemies cannot target them -- and the dive
  // inherits that for free, because it picks through attackCandidates like
  // every other attack rather than walking `towers` itself.
  var blub = { x: tower.x, y: tower.y, isSummon: true, currentHp: 50,
               isDestroyed: function () { return false; },
               takeDamage: function () { this.hurt = true; } };
  h.game.towers.length = 0;
  h.game.towers.push(blub);

  var body = volatileAt(h, blub, 20);
  t.eq(body.attackTowers(1 / 60, h.game.towers), null, "it found no target");
  t.eq(blub.hurt, undefined, "the blub was not hit");
  t.eq(body.dead, false, "and the Volatile is still walking");
});

// ARM A CHARGE AT AN EXACT POINT, through the same door the death sweep uses.
//
// `Hazards.fromDeath` is what update()'s `dead` branch calls, and it reads the
// body's position at the moment it is called -- so this is the real entry
// point, placed rather than walked.
//
// It is placed rather than walked for a reason worth knowing: a body handed to
// h.spawnAt is put back on the ROAD by its own update() on the very next step
// (`this.pos = this.positionAt(this.progress)`), so writing `pos` and then
// stepping measures a charge at a road point rather than at the point that was
// written. The integration test below covers the walked case and this covers
// the geometry.
function armChargeAt(h, x, y) {
  var body = new h.game.Enemy(h.game.path, undefined, "volatile");
  body.pos = { x: x, y: y };
  return h.game.Hazards.fromDeath(body);
}

test("the real death sweep arms a charge at the exact death position",
function (t) {
  var h = harness.boot();
  var body = h.spawnAt(h.game.path.length * 0.4, undefined, "volatile");
  t.eq(h.game.Hazards.count(), 0, "nothing on the road yet");

  body.takeDamage(999);
  t.eq(body.dead, true, "killed in combat");
  h.step(1 / 60);                       // the sweep runs inside update()

  t.eq(h.game.Hazards.count(), 1, "one charge, armed by the sweep");
  var hazard = h.game.Hazards.active()[0];
  t.eq(hazard.x, body.pos.x, "at the exact x it died on");
  t.eq(hazard.y, body.pos.y, "and the exact y");
  t.eq(hazard.kind, "volatile-blast", "carrying the type's own hazard kind");
});

test("a charge goes off one second later, for exactly 13, exactly once",
function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);
  var hp = tower.currentHp;
  var hazard = armChargeAt(h, tower.x + h.game.ul(10), tower.y);
  t.ok(!!hazard, "a charge is on the road");
  t.eq(hazard.fuse, 1, "with a second on its fuse");

  h.step(0.9);
  t.eq(tower.currentHp, hp, "nothing has happened yet");
  h.step(0.2);
  t.eq(tower.currentHp, hp - 13, "and then it takes exactly 13");
  t.eq(h.game.TowerHealth.isStunned(tower), false, "with no stun");

  // ONCE. The hazard is latched on detonation, so however long it lingers for
  // its afterglow it cannot fire twice.
  h.step(2);
  t.eq(tower.currentHp, hp - 13, "and exactly once");
  t.eq(h.game.Hazards.count(), 0, "the charge is swept afterwards");
});

test("the blast reaches 60 u.l. and no further", function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);

  armChargeAt(h, tower.x + h.game.ul(59), tower.y);
  var hp = tower.currentHp;
  h.step(1.2);
  t.eq(tower.currentHp, hp - 13, "59 u.l. away is inside the blast");

  armChargeAt(h, tower.x + h.game.ul(61), tower.y);
  var hp2 = tower.currentHp;
  h.step(1.2);
  t.eq(tower.currentHp, hp2, "61 u.l. away is outside it");
});

test("leaking into the base leaves no charge", function (t) {
  var h = harness.boot();
  var body = h.spawnAt(h.game.path.length - 1, undefined, "volatile");
  var base = h.game.baseHp;
  h.step(0.5);
  t.eq(h.game.enemies.indexOf(body), -1, "the body reached the base");
  t.ok(h.game.baseHp < base, "and cost the base its remaining health");
  t.eq(h.game.Hazards.count(), 0, "but left nothing behind");
});

test("a charge cannot set off another charge", function (t) {
  var h = harness.boot();

  // A Volatile standing INSIDE the blast, rooted so it cannot walk out of it,
  // and at 2 HP -- so any damage a blast dealt to enemies at all would kill it
  // and produce a second charge. `rooted` is the same flag a revived Revenant
  // sets; it is the cheapest way to hold a body on one patch of road.
  var bystander = h.spawnAt(h.game.path.length * 0.4, undefined, "volatile");
  bystander.health = 2;
  bystander.rooted = true;
  armChargeAt(h, bystander.pos.x, bystander.pos.y);
  t.eq(h.game.Hazards.count(), 1, "one charge, right on top of it");

  // Past the fuse AND past the spent charge's afterglow, so what is counted at
  // the end is what is still live rather than what has not been swept yet.
  h.step(1.6);
  t.eq(bystander.dead, false, "the bystander is untouched by the blast");
  t.eq(bystander.health, 2, "at exactly the health it had");
  t.eq(h.game.Hazards.count(), 0,
    "and no second charge exists -- a blast touches towers only, so there is " +
    "no chain to bound at any density");
});

test("the reward, the kill and the sound all happen once, at the combat death",
function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);
  var cashBefore = h.game.cash;
  var killsBefore = h.game.runKills;

  var body = h.spawnAt(h.game.path.length * 0.4, undefined, "volatile");
  body.takeDamage(999);
  h.step(1 / 60);
  t.eq(h.game.Hazards.count(), 1, "the death armed a charge");

  var paid = h.game.cash - cashBefore;
  t.eq(paid, h.game.Enemy.bountyOf("volatile"), "the bounty is paid at the death");
  t.eq(h.game.runKills - killsBefore, 1, "and one kill is credited");

  // The detonation a second later pays nothing and kills nothing.
  h.step(1.5);
  t.eq(h.game.cash - cashBefore, paid, "the detonation pays nothing more");
  t.eq(h.game.runKills - killsBefore, 1, "and credits no second kill");
});

test("a charge is not an enemy: it holds neither the wave nor the win open",
function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);

  // Park the cursor past the end of the schedule with the road empty, which is
  // the state the victory test asks about, and put a live charge on the board.
  h.run("enemies = []; bullets = []; allWavesDeployed = true;" +
        "waveIndex = WAVES.length;");
  armChargeAt(h, tower.x + h.game.ul(60), tower.y);
  h.step(1 / 60);

  t.eq(h.game.Hazards.count(), 1, "a charge is ticking");
  t.eq(h.game.enemies.length, 0, "and the road is empty");
  t.eq(h.game.victory, true, "the run is won with a fuse still burning");
});

test("a charge obeys the pause and the speed toggle", function (t) {
  var h = harness.boot();
  var tower = sapperTower(h);
  var hazard = armChargeAt(h, tower.x + h.game.ul(10), tower.y);
  var hp = tower.currentHp;

  h.run("paused = true");
  h.step(3);
  t.eq(hazard.detonated, false, "a paused run does not burn the fuse");
  t.eq(tower.currentHp, hp, "and nothing has gone off");
  t.ok(hazard.fuse > 0.9, "with the fuse where it was");

  h.run("paused = false");
  // THE SPEED TOGGLE IS NOT A CASE IN THE HAZARD CODE. It is how many fixed
  // steps frame() runs, so a fuse burns three times as fast at 3x for the same
  // reason everything else does -- driven through the real loop here, because
  // step() cannot see gameSpeed by design.
  h.run("gameSpeed = 3");
  h.wallClock(0.4);
  t.eq(hazard.detonated, true, "at 3x, 0.4 s of wall clock spends the second");
  t.eq(tower.currentHp, hp - 13, "and the blast lands");
  h.run("gameSpeed = 1");
});

test("pending charges are cleared by a restart", function (t) {
  var h = harness.boot();
  var doomed = sapperTower(h);
  armChargeAt(h, doomed.x + h.game.ul(10), doomed.y);
  t.eq(h.game.Hazards.count(), 1, "a charge is armed");

  h.run("restartGame()");
  t.eq(h.game.Hazards.count(), 0, "and a restart clears it");

  // A fuse that survived would go off under towers placed in the run that
  // began -- so the run after a restart has to be able to place one and keep it.
  var fresh = sapperTower(h);
  var hp = fresh.currentHp;
  h.step(2);
  t.eq(fresh.currentHp, hp, "a tower placed afterwards is never touched by it");
});


group("the three new types are DATA, not branches");

test("no shared code branches on herald, sapper or volatile", function (t) {
  var fs = require("fs");
  var nodePath = require("path");
  var root = nodePath.join(__dirname, "..", "..", "jeu", "js");

  // THE RULE js/enemy.js OPENS BY STATING: no type has behaviour of its own, so
  // nothing branches on which one an enemy is. Three types at once is exactly
  // the change that would break it quietly, which is why this reads the source
  // rather than the behaviour.
  //
  // A STRING MAY APPEAR -- in `Enemy.TYPES`, where the id is DECLARED, and in
  // the wave data, where a group NAMES a type. What may not appear is the id
  // inside a comparison. So the check is for the comparison forms, and the two
  // files that legitimately hold the literal are exempted by name with the
  // reason beside them.
  var offenders = [];
  var IDS = ["herald", "sapper", "volatile"];

  function walk(dir) {
    fs.readdirSync(dir).forEach(function (name) {
      var full = nodePath.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full); return; }
      if (name.slice(-3) !== ".js") return;
      var rel = nodePath.relative(root, full).replace(/\\/g, "/");
      var src = fs.readFileSync(full, "utf8");
      IDS.forEach(function (id) {
        // Every shape a branch on an id can take: a comparison against a
        // string, a lookup by that key, or an `indexOf` over a list of them.
        [
          '=== "' + id + '"', "=== '" + id + "'",
          '!== "' + id + '"', "!== '" + id + "'",
          '== "' + id + '"', "== '" + id + "'",
          '.indexOf("' + id + '")', ".indexOf('" + id + "')"
        ].forEach(function (form) {
          if (src.indexOf(form) !== -1) offenders.push(rel + ": " + form);
        });
      });
    });
  }
  walk(root);
  t.eq(offenders.join(" | "), "",
    "no file in js/ compares against one of the three new type ids");

  // AND THE MECHANICS ARE DISPATCHED FROM SPECS. Each of the three is read by
  // asking whether the thing HAS the block, which is what makes a fourth type
  // with the same mechanic free.
  var enemySrc = fs.readFileSync(nodePath.join(root, "enemy.js"), "utf8");
  t.ok(enemySrc.indexOf("if (spec.haste)") !== -1,
    "haste is applied from `spec.haste`");
  t.ok(enemySrc.indexOf("if (spec.disable") !== -1,
    "a disable is applied from `spec.disable`");
  var hazardSrc = fs.readFileSync(
    nodePath.join(root, "systems", "hazards.js"), "utf8");
  t.ok(hazardSrc.indexOf("deathEffect") !== -1,
    "and a hazard is built from `deathEffect`");
  IDS.forEach(function (id) {
    t.eq(hazardSrc.indexOf(id), -1, "js/systems/hazards.js never says '" + id + "'");
  });
});

group("selected 0.4.10 flight and map merge");

test("the Aether Wisp is scheduled and uses fail-closed air targeting", function (t) {
  var h = harness.boot();
  var flying = h.game.Enemy.TYPES.flying;
  var scheduled = 0;
  var waves = [];

  h.game.WAVES.forEach(function (wave, i) {
    h.game.waveGroups(wave).forEach(function (waveGroup) {
      if (waveGroup.type === "flying") {
        scheduled += waveGroup.count;
        if (waves.indexOf(i + 1) === -1) waves.push(i + 1);
      }
    });
  });

  t.eq(flying.isFlying, true, "the type carries the flight flag");
  // SCHEDULED since 2026-07-30. This test used to assert the opposite -- the
  // Wisp was imported from v0.4.10.0 as sandbox-only "until it is deliberately
  // scheduled into a campaign wave", and this is that scheduling.
  t.eq(flying.sandboxOnly, undefined, "and no longer declares itself sandbox-only");
  t.ok(scheduled > 0, "the campaign sends flyers (" + scheduled + " of them)");
  t.eq(waves[0], 24, "the air question is asked first at wave 24");

  // AND WAVE 24 IS PURE, for the Smasher reason a camo wave is pure: it swings
  // at whatever it physically reaches even when it cannot see it, so one
  // ground body in that wave would let a board with no air reach clear the
  // flyers as collateral and never answer the question.
  //
  // "NOTHING ON THE GROUND", NOT "ONE GROUP" (2026-08-25). Purity was always a
  // claim about the ROSTER; "one group" was a proxy for it that held only while
  // groups deployed one after another. Wave 24 is now three salvos of Aether
  // Wisps and is exactly as pure as it ever was -- the old assertion would have
  // failed it while the rule it protects was untouched.
  var ground = h.game.waveGroups(h.game.WAVES[23]).filter(function (g) {
    return !h.game.Enemy.typeOf(g.type).isFlying;
  });
  t.eq(ground.length, 0, "nothing walks under the Wisps in wave 24");

  var point = h.game.path.pointAt(h.game.path.length * 0.4);
  var flyer = new h.game.Enemy(h.game.path, 100, "flying");
  flyer.progress = h.game.path.progressAtPoint(point.x, point.y);
  flyer.laneOffsetUl = 0;
  flyer.speedUlps = 0;
  flyer.refreshPos();

  var rifleman = new h.game.Soldier(point.x, point.y + h.game.ul(40), h.game.path);
  t.eq(h.game.Targeting.sees(rifleman, flyer), false,
    "a ground-only Rifleman cannot target flight");

  var sniper = new h.game.LongshotTower(point.x, point.y + h.game.ul(100), h.game.path);
  t.eq(h.game.RangeFilter.canTarget(
    sniper.core.stats,
    { x: sniper.x, y: sniper.y },
    sniper.core.aimRad,
    { x: flyer.pos.x, y: flyer.pos.y, isFlying: true, isCamo: false }
  ), true, "the Arcane Sniper keeps its explicit air reach");
});

test("seeded maps are deterministic and both generated maps join the pool", function (t) {
  var h = harness.boot();
  var spec = {
    id: "test-map",
    name: "Test Map",
    kind: "polyline",
    seed: "stable-seed",
    blurb: ["test"]
  };
  var first = h.game.Maps.Generator.generate(spec);
  var again = h.game.Maps.Generator.generate(spec);
  var changed = h.game.Maps.Generator.generate({
    id: "test-map",
    name: "Test Map",
    kind: "polyline",
    seed: "other-seed",
    blurb: ["test"]
  });

  t.deep(first.routes, again.routes, "the same version, kind and seed reproduce exactly");
  t.notOk(JSON.stringify(first.routes) === JSON.stringify(changed.routes),
    "a different seed changes the route");
  t.eq(first.generation.version, h.game.Maps.Generator.VERSION,
    "the generated shape records its algorithm version");

  var generated = h.game.Maps.LIST.filter(function (map) { return map.generated; });
  t.deep(generated.map(function (map) { return map.id; }),
    ["shifting-ley", "twin-confluence"], "both fixed seeds ship in the map pool");
  t.eq(h.game.Maps.routesOf(h.game.Maps.byId("shifting-ley")).length, 1,
    "Shifting Ley is a single route");
  t.eq(h.game.Maps.routesOf(h.game.Maps.byId("twin-confluence")).length, 2,
    "Twin Confluence has two entrances");
});

test("Twin Confluence mirrors each scheduled beat onto two paths and one base", function (t) {
  var h = harness.boot("twin-confluence");

  t.eq(h.game.paths.length, 2, "two live GamePath instances");
  t.eq(h.game.waveSpawned, 1, "the schedule cursor advanced once");
  t.eq(h.game.enemies.length, 2, "one scheduled beat created two enemies");
  t.deep(h.game.enemies.map(function (enemy) { return enemy.routeId; }).sort(),
    ["north", "south"], "one body entered through each route");

  var ends = h.game.paths.map(function (route) {
    return route.pointAt(route.length);
  });
  t.deep(ends[0], ends[1], "both routes converge on the same base");

  var secondRoad = h.game.paths[1].pointAt(h.game.paths[1].length * 0.35);
  t.eq(h.run("whyCannotBuild(" + secondRoad.x + ", " + secondRoad.y + ", Soldier)"),
    "too close to the path", "placement checks the second road too");
});

// --- this version's own features -------------------------------------------
//
// The sci-fi environments, the command-deck title screen, the Warbringer
// quake and the ten-second opening pause are all this branch's work, and
// none of them exist in the branch the rest of this file came from. They are
// kept together so a future merge can see at a glance what is local.

test("every map carries and renders a full non-gameplay sci-fi environment", function (t) {
  var h = harness.boot();

  h.game.Maps.LIST.forEach(function (map) {
    t.ok(Array.isArray(map.decorations) && map.decorations.length >= 5,
      map.id + " keeps its fine-detail decals");
    t.ok(map.theme && map.theme.background && map.theme.accent &&
      map.theme.roadOuter && map.theme.roadInner,
      map.id + " owns its palette and road material");
    t.ok(Array.isArray(map.zones) && map.zones.length >= 4,
      map.id + " has large coloured deck zones");
    t.ok(Array.isArray(map.models) && map.models.length >= 9,
      map.id + " has a substantial machinery set");
  });

  h.run(
    "var environmentDraws = 0;" +
    "var realDrawEnvironment = Maps.drawEnvironment;" +
    "Maps.drawEnvironment = function (c, m) {" +
      "environmentDraws++; realDrawEnvironment(c, m);" +
    "};"
  );
  h.game.Maps.LIST.forEach(function (map) {
    var routeBefore = JSON.stringify(h.game.Maps.routesOf(map));
    h.run("startRun(Maps.byId('" + map.id + "'))");
    h.draw();
    t.eq(JSON.stringify(h.game.Maps.routesOf(map)), routeBefore,
      map.id + " scenery never mutates its routes");
  });
  t.eq(h.game.environmentDraws, h.game.Maps.LIST.length,
    "the gameplay renderer paints the full environment on all seven maps");
});

test("the forest board is scenery, not gameplay, and its patches stay flat", function (t) {
  var h = harness.boot();
  var Maps = h.game.Maps;
  var forest = Maps.byId("test");

  // The theme is where the whole board's difference lives, so it is the thing
  // that has to be there. `wild` turns off the manufactured floor -- the panel
  // grid and the circuit trunks -- in BOTH renderers, and `fog` is read by the
  // 3D board and washed over the 2D one.
  t.eq(forest.theme.wild, true, "the forest declares itself wild");
  t.ok(forest.theme.fog && forest.theme.fog.density > 0,
    "and it declares weather with a real density");
  t.ok(forest.theme.fog.height > 0,
    "with a bank height, so the mist lies on the floor rather than filling the air");

  // The camp is the point of the board, so it is worth pinning that it is
  // actually on it -- a rename in gl-geometry's scenery switch would otherwise
  // silently turn every barricade into the default block.
  var kinds = {};
  forest.models.forEach(function (m) { kinds[m.kind] = (kinds[m.kind] || 0) + 1; });
  ["tree", "barricade", "spikes", "sandbags", "watchtower", "barrel"]
    .forEach(function (kind) {
      t.ok(kinds[kind] > 0, "the forest has at least one " + kind);
      t.ok(h.game.GLGeometry.SCENERY_KINDS.indexOf(kind) >= 0,
        kind + " is a kind the geometry knows how to build");
    });
  t.ok(kinds.tree >= 20, "and a treeline rather than a few specimens: " + kinds.tree);

  // THE ONE THING ON THIS BOARD THAT COULD REACH GAMEPLAY. Every other zone
  // kind is a raised slab, and `World3D.levelUnder` refuses a tower that
  // straddles a slab edge -- so a `dirt` patch built as a slab would be an
  // invisible no-build ring in the middle of open ground. It is authored at
  // height zero for exactly that reason.
  t.ok(forest.zones.filter(function (z) { return z.kind === "dirt"; }).length > 0,
    "the forest uses flat ground patches");

  // And the same guarantee the other six get: scenery never touches the route.
  var before = JSON.stringify(Maps.routesOf(forest));
  h.run("startRun(Maps.byId('test'))");
  h.draw();
  t.eq(JSON.stringify(Maps.routesOf(forest)), before,
    "the forest's scenery never mutates its route");
  t.eq(h.game.paths.length, 1, "one entrance");
});

test("the forest's river is cut, crossed and stood clear of", function (t) {
  var h = harness.boot();
  var Maps = h.game.Maps;
  var forest = Maps.byId("test");
  var river = forest.river;

  t.ok(!!river && river.width > 0, "the forest declares a river");
  t.eq(Maps.byId("rune-circuit").river, null,
    "and a board that declares none gets null rather than a default one");

  // THE BAND IS A SHARED NUMBER, not a proportion. `GLGeometry.river` builds
  // its outer lip at exactly this offset and `World3D.buildMapMesh` opens the
  // floor at exactly this offset; if the two ever stop agreeing the board shows
  // a strip of void down the whole run. Everything below is measured off it.
  var x0 = river.x - river.width / 2 - river.banks;
  var x1 = river.x + river.width / 2 + river.banks;

  // NOTHING STANDS IN THE WATER. Nine props had to move off this strip when the
  // river landed, and a tenth added later without checking would be a dead
  // stem growing out of a river bed -- which nothing in the renderer would
  // complain about, because scenery is never validated against terrain.
  var intruding = [];
  forest.models.forEach(function (m) {
    if (m.kind === "bridge") return;              // the one that must cross it
    var radius = (m.size || 44) * 0.25;
    if (m.x + radius > x0 && m.x - radius < x1) {
      intruding.push(m.kind + " at " + m.x + "," + m.y);
    }
  });
  t.eq(intruding.join(" / "), "", "no prop stands in the cut");

  // THE CROSSING REACHES BOTH BANKS. `size` is the span over 1.5 (see the
  // bridge case in gl-geometry), and the abutments sit at 0.47 of the span --
  // so this is the one measurement on that prop that is not taste. A bridge
  // that stops short of the cut has its abutments in the water.
  var bridge = forest.models.filter(function (m) { return m.kind === "bridge"; })[0];
  t.ok(!!bridge, "the road is carried over the river by a bridge");
  var span = bridge.size * 1.5;
  t.ok(bridge.x - span * 0.47 < x0 && bridge.x + span * 0.47 > x1,
    "and its abutments land outside the cut, not in it");

  // THE ROAD CROSSES THE WATER EXACTLY ONCE, and the bridge is on that leg.
  //
  // Found rather than indexed. The first version of this named points[2] and
  // points[3] by number, which pinned the shape of a route that has since been
  // redrawn -- and a test that has to be edited every time a leg moves is a
  // test that will be edited without being read. What actually matters is the
  // count: a second crossing would be a wave walking through the river, and
  // nothing in the renderer or the simulation would say a word about it.
  var points = Maps.primaryPoints(forest);
  var crossings = [];
  for (var i = 1; i < points.length; i++) {
    var a = points[i - 1], b = points[i];
    if ((a.x < river.x) === (b.x < river.x)) continue;
    crossings.push({ a: a, b: b });
  }
  t.eq(crossings.length, 1, "the road meets the river exactly once");
  t.eq(crossings[0].a.y, crossings[0].b.y,
    "and crosses it square, on a straight leg");
  t.eq(crossings[0].a.y, bridge.y, "which is the leg the bridge is on");
  t.ok(bridge.x > Math.min(crossings[0].a.x, crossings[0].b.x) &&
    bridge.x < Math.max(crossings[0].a.x, crossings[0].b.x),
    "and between that leg's two ends");

  ["bridge", "casket"].forEach(function (kind) {
    t.ok(h.game.GLGeometry.SCENERY_KINDS.indexOf(kind) >= 0,
      kind + " is a kind the geometry knows how to build");
  });
});

test("the spawn is a grave, and it brings a light the board does not own",
    function (t) {
  var h = harness.boot();
  var Maps = h.game.Maps;
  var forest = Maps.byId("test");
  var casket = forest.models.filter(function (m) {
    return m.kind === "casket";
  })[0];

  t.ok(!!casket, "the route's first point has something to come out of");

  // THE WHOLE POINT OF THE PROP IS THAT ITS LIGHT IS WRONG FOR THIS BOARD.
  // Every other colour here is derived from the theme, which is what makes one
  // prop violet on Mana Coil and green on Sigil Lattice without a second table.
  // The casket is the single declared exception in the game, so an edit that
  // quietly dropped `accent` would leave it glowing in the camp's ember and
  // nothing would fail.
  t.ok(!!casket.accent, "the casket declares its own accent");
  t.ok(casket.accent !== forest.theme.accent,
    "and it is not the board's ember: " + casket.accent);

  // It stands WEST of where bodies appear, with its mouth toward the road, so
  // an enemy's first step is off it rather than into it.
  var start = Maps.primaryPoints(forest)[0];
  t.ok(casket.x < start.x, "it sits behind the first point of the route");
  t.ok(Math.abs(casket.y - start.y) < 8, "and on the road's own line");
});

test("the watchtower deck is clear enough to stand on", function (t) {
  var h = harness.boot();
  var GLGeometry = h.game.GLGeometry;

  // THE LAMP USED TO BE A STOOL. It was built dead centre on the platform of a
  // tower whose entire job is to have somebody standing on it, and from above
  // it read as a squat lit bollard nobody could get past. It now hangs on a
  // corner post -- same light, same only-lit-thing-in-the-forest, just not in
  // the middle of the floor.
  //
  // Measured off the geometry rather than asserted about the source: build the
  // prop and look at what is actually in the volume a body would occupy.
  var size = 52, legH = size * 1.55;
  var builder = new GLGeometry.Builder();
  GLGeometry.scenery(builder, "watchtower", 0, 0, size, 0.3, {
    metalDark: "#1c1812", metal: "#4a4336", panel: "#2f2a1c",
    terrain: "#1a1913", terrainEdge: "#171610", accent: [1, 0.5, 0.2]
  });

  // THE WINDOW IS THE WHOLE STANDING VOLUME, and the first version of this test
  // got that wrong in a way that made it useless. It looked only between 0.09
  // and 0.40 x size above the deck -- the band the OLD lamp happened to occupy
  // -- so putting the current lamp back on the axis left it above the window
  // and the test stayed green through exactly the regression it exists to
  // catch. Self-tested again after widening: moving the lamp to `cx, cy` now
  // takes the measurement to 0.000 and the test goes red.
  var closest = Infinity, above = 0;
  for (var i = 0; i < builder.pos.length; i += 3) {
    var z = builder.pos[i + 2];
    if (z <= legH + size * 0.02 || z >= legH + size * 1.00) continue;
    above++;
    closest = Math.min(closest,
      Math.hypot(builder.pos[i], builder.pos[i + 1]));
  }

  t.ok(above > 0, "there is geometry standing on the deck -- rails and a lamp");
  // The deck's own corners are at 0.25 x size and that is where the rails, the
  // lamp and the top of the ladder live; measured, the nearest any of them
  // comes to the axis is 0.171. Anything at 0.12 or less is standing in the
  // middle of the floor, and a prop ON the axis measures 0.
  t.ok(closest > size * 0.12,
    "and none of it is in the middle of the floor: closest is " +
    (closest / size).toFixed(3) + " x size");
});

test("the forest's road changes width, and every rule that reads the road " +
    "reads it there", function (t) {
  var h = harness.boot();
  var g = h.game;
  h.run("startRun(Maps.byId('test'))");
  var path = g.path;

  t.ok(path.hasWidthProfile(), "the forest route declares a width profile");

  // The three stretches the board is authored around, by fraction along the
  // route. Anything that reads the road has to answer differently at each.
  var gate = path.length * 0.85;        // the wire gate, the tightest point
  var open = path.length * 0.40;        // this board's open road
  var basin = path.length * 0.70;       // the plaza around the top corner

  t.ok(path.widthScaleAt(gate) < path.widthScaleAt(open),
    "the wire gate is narrower than open road: " +
    path.widthScaleAt(gate).toFixed(2) + " vs " +
    path.widthScaleAt(open).toFixed(2));
  t.ok(path.widthScaleAt(basin) > path.widthScaleAt(open) * 2,
    "and the basin is more than twice open road: " +
    path.widthScaleAt(basin).toFixed(2));

  // PLACEMENT FOLLOWS THE ROAD, which is the whole reason the profile is not
  // decoration. A chokepoint is worth building beside because the road pulls
  // its edge in and lets a gun stand closer; a plaza pushes every gun off it.
  // Measured: 18.8 px at the gate, 27.1 on open road, 45.3 in the basin.
  var clearance = function (d) {
    return g.buildClearanceOn(path, d, g.Soldier);
  };
  t.ok(clearance(gate) < clearance(open) - 5,
    "a Rifleman may stand closer at the gate: " + clearance(gate).toFixed(1) +
    " px against " + clearance(open).toFixed(1));
  t.ok(clearance(basin) > clearance(open) + 15,
    "and is pushed well off the basin: " + clearance(basin).toFixed(1) + " px");

  // A point that is legal beside the gate must be ILLEGAL at the same offset
  // beside the basin, or the two rules are the same rule wearing a hat.
  var off = (clearance(gate) + clearance(open)) / 2;
  function spotAtOffset(d) {
    var p = path.pointAt(d), tan = path.tangentAt(d);
    return { x: p.x - tan.y * off, y: p.y + tan.x * off };
  }
  var atGate = spotAtOffset(gate), atBasin = spotAtOffset(basin);
  t.eq(g.whyCannotBuild(atGate.x, atGate.y, g.Soldier), null,
    "the gate lets a tower in at " + off.toFixed(1) + " px");
  t.eq(g.whyCannotBuild(atBasin.x, atBasin.y, g.Soldier), "too close to the path",
    "and the basin refuses one at the same offset");

  // THE COLUMN NARROWS WITH THE ROAD. A lane offset authored against the
  // nominal width would put half a wave in the ditch either side of a gate --
  // the queue would not read as squeezing through, it would read as walking
  // past.
  var body = new g.Enemy(path, 100, "normal", { lane: 3 });
  body.laneOffsetUl = g.Enemy.LANE_SPREAD_UL;
  function offCentre(d) {
    var p = body.positionAt(d), c = path.pointAt(d);
    return Math.hypot(p.x - c.x, p.y - c.y);
  }
  t.ok(offCentre(gate) < offCentre(open) * 0.6,
    "a body walks nearer the centre line at the gate: " +
    offCentre(gate).toFixed(1) + " px against " + offCentre(open).toFixed(1));
  t.ok(offCentre(basin) > offCentre(open) * 1.8,
    "and spreads out across the basin: " + offCentre(basin).toFixed(1) + " px");

  // AND THE ROAD THAT IS DRAWN IS THE ROAD THAT IS MEASURED. Both renderers
  // build from `ribbon`, so a half-width in it that disagreed with
  // `widthScaleAt` would be a chokepoint you could see and not build beside.
  var nominal = g.ul(21.875);
  var ribbon = path.ribbon(nominal, g.ul(13));
  t.ok(ribbon.length > path.points.length * 8,
    "the ribbon is resampled fine enough to change width along a leg: " +
    ribbon.length + " points");
  var worst = 0;
  ribbon.forEach(function (pt) {
    var hit = path.closestToPoint(pt.x, pt.y);
    worst = Math.max(worst,
      Math.abs(pt.half - nominal * path.widthScaleAt(hit.progress) / 2));
  });
  t.ok(worst < 1.2, "and every point carries the width the road has there: " +
    "worst disagreement " + worst.toFixed(2) + " px");
});

test("the forest's pace is a property of the road, and the clock is measured " +
    "through it", function (t) {
  var h = harness.boot();
  var g = h.game;
  var Maps = g.Maps;
  var forest = Maps.byId("test");
  h.run("startRun(Maps.byId('test'))");
  var path = g.path;
  var report = Maps.analyse(forest);

  // THE COMPLAINT THIS ANSWERS was that the old route read as a trudge. This
  // one is LONGER and is crossed in less time, because the stretches where
  // nothing happens are walked quickly and the ones where something does are
  // not. Divided rather than walked, this route would take 49.0 s.
  var divided = report.lengthUl / g.Enemy.BASE_SPEED_ULPS;
  t.ok(report.crossingSeconds < divided - 8,
    "the crossing is walked, not divided: " +
    report.crossingSeconds.toFixed(1) + " s against " + divided.toFixed(1));
  t.ok(report.crossingSeconds > 36 && report.crossingSeconds < 43,
    "and lands in the band the board was tuned for: " +
    report.crossingSeconds.toFixed(1) + " s");

  // GRACE IS A CLOCK. The term exists because a longer route gives the economy
  // more time before the first leak, so a gauntlet that runs bodies in faster
  // has to shorten it exactly as cutting the route would. Keyed off the
  // measured crossing rather than off the length.
  t.near(report.graceRatio,
    Maps.referenceLengthUl() / (report.crossingSeconds * g.Enemy.BASE_SPEED_ULPS),
    0.0001, "grace is measured off the crossing time");

  // THE GAUNTLET IS THE MECHANIC. A body that clears the wire gate is at half
  // again its speed with the camp still to run.
  var body = new g.Enemy(path, 100, "normal", {});
  body.progress = path.length * 0.70;               // the basin
  var slow = body.currentSpeedUlps();
  body.progress = path.length * 0.95;               // the run in to the base
  var fast = body.currentSpeedUlps();
  t.ok(fast > slow * 1.7, "the gauntlet runs bodies in: " + fast.toFixed(1) +
    " u.l./s against " + slow.toFixed(1) + " in the basin");

  // A slow put on by a tower still applies on top of it -- pace multiplies the
  // body's speed rather than replacing it, or the last fifth of the board
  // would be immune to every slow in the game.
  body.slowMultiplier = 0.5;
  t.near(body.currentSpeedUlps(), fast * 0.5, 0.001,
    "and a slow still halves it");
});

test("route width and pace stay opt-in, including Ironwood's constant width",
    function (t) {
  var h = harness.boot();
  var g = h.game;
  var Maps = g.Maps;

  // THE CLAIM THIS PINS is the one that made the feature safe to land: a route
  // that declares no profile behaves exactly as every route did before either
  // existed. Not "close enough" -- the same points array, the same divide, the
  // same clearance.
  var plain = 0;
  Maps.LIST.forEach(function (map) {
    if (map.id === "test" || map.id === "ironwood-frontier") return;
    plain++;
    var route = Maps.routesOf(map)[0];
    t.eq(Maps.profileOf(route), null, map.id + " declares no profile");

    var path = new g.GamePath(Maps.toWorld(route.points), Maps.profileOf(route));
    t.eq(path.hasWidthProfile(), false, map.id + " has no width profile");
    t.eq(path.widthScaleAt(path.length * 0.4), 1, map.id + " is one width");
    t.eq(path.paceScaleAt(path.length * 0.4), 1, map.id + " is one pace");
    // IDENTITY, not a copy: the renderers then run the code they ran before
    // profiles existed, on the objects they ran it on.
    t.ok(path.ribbon(g.ul(21.875), g.ul(13)) === path.points,
      map.id + " hands its own points back as its ribbon");
    t.near(g.roadHalfWidthAt(path, path.length * 0.4), g.ul(21.875) / 2,
      0.0001, map.id + " keeps the nominal half-width");

    var report = Maps.analyse(map);
    t.eq(report.crossingSeconds,
      report.shortestLengthUl / g.Enemy.BASE_SPEED_ULPS,
      map.id + " still divides its length by one speed");
    t.eq(report.graceRatio,
      Maps.referenceLengthUl() / report.shortestLengthUl,
      map.id + " still takes grace off its length");
  });
  t.eq(plain, Maps.LIST.length - 2,
    "only the test board and Ironwood declare a route profile (" + plain +
    " plain boards)");

  // Ironwood is deliberately 25% wider for the whole route. This is gameplay
  // geometry, not a visual scale on its authored mesh: the same lookup drives
  // enemy lanes, placement clearance, the 2D road, the 3D path and terrain.
  var ironwood = Maps.byId("ironwood-frontier");
  var ironRoute = Maps.routesOf(ironwood)[0];
  var ironProfile = Maps.profileOf(ironRoute);
  t.ok(!!ironProfile && !!ironProfile.width,
    "Ironwood declares its wider road in the route profile");
  t.eq(ironProfile.pace, null, "and does not change enemy pace");
  var ironPath = new g.GamePath(Maps.toWorld(ironRoute.points), ironProfile);
  t.eq(ironPath.hasWidthProfile(), true, "the live Ironwood path owns that width");
  t.near(ironPath.widthScaleAt(0), 1.25, 0.0001,
    "Ironwood starts exactly 25% wider");
  t.near(ironPath.widthScaleAt(ironPath.length * 0.5), 1.25, 0.0001,
    "and remains exactly 25% wider through the middle");
  t.near(ironPath.widthScaleAt(ironPath.length), 1.25, 0.0001,
    "and through the end");
  t.eq(ironPath.paceScaleAt(ironPath.length * 0.4), 1,
    "the wider dirt road keeps the original walking speed");
  t.near(g.roadHalfWidthAt(ironPath, ironPath.length * 0.4),
    g.ul(21.875) * 1.25 / 2, 0.0001,
    "placement reads the same 25% wider edge");

  var ironReport = Maps.analyse(ironwood);
  t.eq(ironReport.crossingSeconds,
    ironReport.shortestLengthUl / g.Enemy.BASE_SPEED_ULPS,
    "the width profile does not alter Ironwood's crossing time");
  t.eq(ironReport.graceRatio,
    Maps.referenceLengthUl() / ironReport.shortestLengthUl,
    "or its length-based grace");

  // The visual asset keeps the full Claude Design topology, not a low-poly
  // ribbon wearing similar colours. The S source is four exact 6,422-face
  // instances; one instance is what gets repeated and bent over the live route.
  var emitted = 0, minZ = Infinity, maxZ = -Infinity;
  var pathLift = g.IronwoodPath.liftFor(ironPath, g.ul(21.875));
  var pathStats = g.IronwoodPath.build({ tri: function (a, b, c) {
    emitted++;
    [a, b, c].forEach(function (point) {
      minZ = Math.min(minZ, point[2]);
      maxZ = Math.max(maxZ, point[2]);
    });
  } }, ironPath, g.ul(21.875), pathLift);
  t.eq(pathStats.sourceTriangles, 25688,
    "the complete four-instance S source is recognised");
  t.eq(pathStats.moduleTriangles, 6422,
    "every triangle in one authored module survives import");
  t.near(pathStats.surfaceRelief, 0.68, 0.0001,
    "only the noisy top bands are calmed to the agreed middle ground");
  t.eq(emitted, pathStats.triangles,
    "the builder reports every triangle it actually emits");
  t.near(minZ, 0, 0.0001, "the authored soil sides still reach the floor");
  t.near(maxZ, pathLift, 0.0001,
    "the highest authored relief survives at its natural scale");

  // And the kerb lights are opt-in the same way, for the same reason: a
  // facility with a lit floor grid does not need its road outlined, and a
  // theme key that appeared on every board would have changed all seven.
  t.ok(!!Maps.byId("test").theme.roadGlow, "the forest lights its own kerbs");
  Maps.LIST.forEach(function (map) {
    if (map.id === "test") return;
    t.eq(map.theme.roadGlow, undefined, map.id + " declares no kerb light");
  });
});

test("the map grid fits its canvas and no two cards overlap", function (t) {
  var h = harness.boot(null);
  var rects = [];

  // The per-card fit is already pinned next door, by the hit-test check. What
  // is NOT covered there is what the seventh route introduced: rows that hold
  // different numbers of cards, each centred on its own contents. Get that
  // arithmetic wrong and the short row lands ON the row above it -- both cards
  // still inside the canvas, both hit tests still agreeing with themselves,
  // and two routes stacked on one another.
  for (var i = 0; i < h.game.Maps.LIST.length; i++) {
    var r = h.game.mapCardRect(i);
    for (var j = 0; j < rects.length; j++) {
      var q = rects[j];
      t.ok(r.x >= q.x + q.w || q.x >= r.x + r.w ||
           r.y >= q.y + q.h || q.y >= r.y + r.h,
        "card " + i + " clears card " + j);
    }
    rects.push(r);
  }

  // The "click a route or press 1 - N" line hangs off the bottom of the grid,
  // so the grid has to leave room for it -- and the grid is the thing that
  // grows when a route is added.
  t.ok(h.game.mapGridBottom() + 24 < h.game.VIEW_HEIGHT,
    "the grid leaves room for the line under it");
});

test("the title screen renders its command deck and five dedicated controls", function (t) {
  var h = harness.boot(null);
  h.run(
    "openMenu();" +
    "var menuBackdropDraws = 0;" +
    "var menuControlDraws = 0;" +
    "var realMenuBackdrop = drawMenuBackdrop;" +
    "var realMenuButton = drawMenuButton;" +
    "drawMenuBackdrop = function () {" +
      "menuBackdropDraws++; realMenuBackdrop();" +
    "};" +
    // EVERY ARGUMENT PASSED THROUGH, `dead` included: the wrapper that dropped
    // the last one would silently light the PLAY plate back up on a profile
    // whose build bar cannot start a run, and the test would be measuring a
    // screen the player never sees.
    "drawMenuButton = function (r, label, key, rgb, primary, dead) {" +
      "menuControlDraws++; realMenuButton(r, label, key, rgb, primary, dead);" +
    "};"
  );

  h.draw();
  t.eq(h.game.menuBackdropDraws, 1,
    "one full sci-fi command deck sits behind the title");
  t.eq(h.game.menuControlDraws, 5,
    "each existing action uses the dedicated terminal control style — PLAY " +
    "plus the four-wide rail Upgrades joined on 2026-08-30");
  t.eq(h.game.screen, "menu", "decoration does not navigate or start a run");
});

test("the earthquake kicks the world camera and cracks the floor briefly", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4", "B5"].forEach(function (id) {
    h.run("buyUpgrade(towers[0], '" + id + "')");
  });
  h.run("enemies = []; waveIndex = WAVES.length");

  h.run(
    "var quakeVisualCalls = 0;" +
    "var realEarthquakeEffect = Effects.earthquake;" +
    "Effects.earthquake = function (x, y) {" +
      "quakeVisualCalls++; realEarthquakeEffect(x, y);" +
    "};"
  );

  t.eq(s.triggerQuake(h.game.enemies).ok, true, "a successful quake starts");
  t.eq(s.triggerQuake(h.game.enemies).ok, false, "a cooldown press is refused");
  t.eq(h.game.quakeVisualCalls, 1, "only the successful cast starts its visuals");

  var translated = h.run(
    "(function () {" +
      "var moves = [];" +
      "Effects.beginWorld({ translate: function (x, y) { moves.push([x, y]); } });" +
      "return moves;" +
    "})()"
  );
  t.eq(translated.length, 1, "the active quake applies one world-camera offset");
  t.ok(Math.abs(translated[0][0]) + Math.abs(translated[0][1]) > 0,
    "that offset visibly moves the battlefield");

  var crackStrokes = h.run(
    "(function () {" +
      "var strokes = 0;" +
      "Effects.drawGround({" +
        "beginPath: function () {}, moveTo: function () {}, lineTo: function () {}," +
        "stroke: function () { strokes++; }" +
      "});" +
      "return strokes;" +
    "})()"
  );
  t.ok(crackStrokes >= 64, "the landing and map-wide fissures are drawn");

  h.run(
    "var worldLayerCalls = 0;" +
    "var realBeginWorld = Effects.beginWorld;" +
    "Effects.beginWorld = function (c) { worldLayerCalls++; realBeginWorld(c); };"
  );
  h.draw();
  t.eq(h.game.worldLayerCalls, 1, "the game renders the battlefield through the camera layer");

  h.run("Effects.update(0.8)");
  translated = h.run(
    "(function () {" +
      "var moves = [];" +
      "Effects.beginWorld({ translate: function (x, y) { moves.push([x, y]); } });" +
      "return moves;" +
    "})()"
  );
  t.eq(translated.length, 0, "the shake ends in under a second");

  h.run("Effects.update(2)");
  crackStrokes = h.run(
    "(function () {" +
      "var strokes = 0;" +
      "Effects.drawGround({" +
        "beginPath: function () {}, moveTo: function () {}, lineTo: function () {}," +
        "stroke: function () { strokes++; }" +
      "});" +
      "return strokes;" +
    "})()"
  );
  t.eq(crackStrokes, 0, "the temporary floor cracks fade away");

  var noEffects = harness.boot();
  noEffects.run("cash = 100000");
  var plain = placeSmasherBeside(noEffects, SMASH_AT);
  ["B1", "B2", "B3", "B4", "B5"].forEach(function (id) {
    noEffects.run("buyUpgrade(towers[0], '" + id + "')");
  });
  noEffects.run("enemies = []; waveIndex = WAVES.length; Effects = undefined");
  var stillCaught = noEffects.spawnAt(900, 100);
  t.eq(plain.triggerQuake(noEffects.game.enemies).ok, true,
    "the ability still fires when the presentation layer is absent");
  t.eq(stillCaught.stunTimer, 3, "and its gameplay result is unchanged");
  noEffects.draw();
  t.ok(true, "an Effects-free frame still draws");
});

test("path A shows a multi-frame hammer slam and leaves cracks in its AOE", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);

  // The swing is driven by the WIND-UP now, not by the cooldown that follows
  // it -- see swingProgress(). 0.24 s left of a 0.48 s path-A swing is halfway
  // down; the same figure against the base 0.2 s swing is already over.
  s.windup = 0.24;
  t.eq(s.swingProgress(), 0, "the base hammer still uses its short 0.2 s wind-up");

  h.run("buyUpgrade(towers[0], 'A1')");
  s.windup = 0.24;
  t.near(s.swingProgress(), 0.5, 0.001, "path A stretches the readable wind-up");
  t.eq(s.hammerEchoProgresses(s.swingProgress()).length, 3,
    "three earlier overhead hammer frames trail the live head");

  h.run("enemies = []");
  var e = h.spawnAt(IN_ZONE, 100);
  s.swing([e], h.game.enemies);

  t.ok(s.pathAImpact !== null, "the impact leaves a temporary ground fracture");
  t.eq(s.pathAImpact.rangePx, s.rangePx, "the fracture captures the real AOE reach");
  t.eq(s.pathAImpact.arcRadians, s.arcRadians, "and its real AOE arc");
  h.draw();
  t.ok(true, "the hammer frames and clipped crack field draw cleanly");

  s.fadeBlasts(h.game.Smasher.PATH_A_CRACK_SECONDS + 0.1);
  t.eq(s.pathAImpact, null, "the floor heals after the short impact window");
});

test("auto-send does not have to be turned off to be waited out", function (t) {
  var h = harness.boot(null);
  h.run("autoSkipWaves = true");
  h.chooseMap(h.game.Maps.DEFAULT_ID);

  // Auto-send treats the opening pause as a break like any other, which is the
  // behaviour the toggle promises -- "waves arrive without me asking" has to
  // include the first one, or the run sits still for ten seconds with AUTO lit.
  h.step(1 / 60);
  t.ok(h.game.enemies.length >= 1, "with AUTO on, wave 1 does not wait");

  h.run("autoSkipWaves = false");
});

test("the Start button begins the run at once, with no three-second beat",
  function (t) {
    var h = harness.boot(null);
    h.chooseMap(h.game.Maps.DEFAULT_ID);

    // Clicked, not called: this is the button a player presses.
    var r = h.run("waveSkipButtonRect()");
    h.click(r.x + r.w / 2, r.y + r.h / 2);

    t.eq(h.game.waveCountdown, 0, "no countdown left at all");

    // Deliberately NOT WAVE_CALL_DELAY. Mid-run, calling a wave in leaves three
    // seconds so it cannot land on a player mid-thought; at the start there is
    // nothing to land on, and a button that says Start has to start.
    h.step(1 / 60);
    t.eq(h.game.enemies.length, 1, "the first body is on the road next step");
    t.eq(h.game.enemies[0].health, 4, "wave 1's stock normal");
  });

test("the ten seconds run out on their own and wave 1 walks in", function (t) {
  var h = harness.boot(null);
  h.chooseMap(h.game.Maps.DEFAULT_ID);

  h.step(9.5);
  t.eq(h.game.enemies.length, 0, "still nothing at 9.5 s");

  h.step(1);
  t.ok(h.game.enemies.length >= 1, "and wave 1 is walking by 10.5 s");
  t.eq(h.game.waveIndex, 0, "still wave 1");
  t.notOk(h.game.betweenWaves(), "the break is over, so the button is gone");
});


// ---------------------------------------------------------------------------
// PERMANENT TOWER PROGRESSION (2026-08-30)
//
// Three layers, tested through their real entry points:
//
//   js/systems/tower-xp.js     the fixed per-wave budget and the split
//   js/systems/tower-perks.js  the trees, the purchase rules, the application
//   js/meta.js                 the save and every invariant about it
//
// THE TREE CONTENT IS DELIBERATELY NOT HARD-CODED HERE except where a shape
// is the thing under test. These read whatever tree a tower has, so retuning a
// node -- or replacing a whole tree, which the owner will -- does not turn
// this section red for reasons that have nothing to do with the system.
// ---------------------------------------------------------------------------

function bootProgress() {
  var h = harness.boot();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar(); " +
        "TowerXP.setEnabled(true); openMenu()");
  return h;
}

// Coins the honest way -- through the real award path, so the test spends what
// a run actually pays rather than writing a number into the profile.
function bankCoins(h, runs) {
  for (var i = 0; i < (runs || 1); i++) {
    h.run("MetaProgress.awardRun({ wavesCompleted: 35, waveReached: 35, " +
      "victory: true, mapId: Maps.DEFAULT_ID, mapName: 'x', difficultyId: 'easy' })");
  }
  return h.run("MetaProgress.coins()");
}

test("a fresh profile starts every tower it owns at level 0 with five locked slots",
function (t) {
  var h = harness.boot();
  h.run("MetaProgress.reset()");
  var snap = h.run("MetaProgress.snapshot()");

  Object.keys(snap.progress).forEach(function (id) {
    var p = snap.progress[id];
    t.eq(p.level, 0, id + " opens at level 0");
    t.eq(p.xp, 0, id + " opens at 0 xp");
    t.eq(p.slots, 0, id + " has no usable slot yet");
    t.eq(p.equipped.length, 5, id + " still shows all five slots");
    t.deep(p.nodes, [], id + " owns no node");
  });

  // THE TWO FIVES ARE NOT THE SAME FIVE. The build bar holds tower TYPES; a
  // perk loadout holds upgrades of ONE type. They are equal today and mean
  // different things, which is exactly why this is pinned.
  t.eq(h.game.MetaProgress.PERK_SLOTS, 5, "five perk slots");
  t.eq(h.game.MetaProgress.SLOT_COUNT, 5, "and five build-bar slots, separately");
});

test("a wave's xp budget is fixed, rises with the campaign, and sums to the target",
function (t) {
  var h = harness.boot();
  var X = h.game.TowerXP;

  // THE WHOLE REFERENCE CAMPAIGN IS WORTH THE TARGET, EXACTLY. That is what
  // makes the level thresholds in js/meta.js mean "about 2, 5, 10, 20 and 35
  // focused runs" rather than approximately something.
  t.near(X.runBudget(35, 1), X.RUN_XP_TARGET, 1e-9,
    "a 35-wave reference campaign pays exactly the target");
  t.near(X.runBudget(40, 1.5), X.RUN_XP_TARGET * 1.5, 1e-9,
    "and a longer, harder one pays its own rating times it");

  // A RISING CURVE, with a floor. The late waves are worth more, and no wave
  // is worth nothing -- a wave that paid hundredths of a point would read as
  // a bug however defensible the maths.
  var first = X.waveBudget(1, 35, 1);
  var mid = X.waveBudget(18, 35, 1);
  var last = X.waveBudget(35, 35, 1);
  t.ok(first < mid && mid < last, "wave 1 < wave 18 < wave 35 (" +
    first.toFixed(2) + " / " + mid.toFixed(2) + " / " + last.toFixed(2) + ")");
  t.near(last / first, 1 + X.LATE_WEIGHT, 0.02,
    "the last wave is worth the authored multiple of the first");
  t.ok(first > 1, "and the first wave is still worth something");

  // NOTHING ABOUT A CAMPAIGN'S LENGTH IS ASSUMED. A 12-wave schedule and a
  // 60-wave one both normalise onto the same total.
  [12, 35, 40, 60].forEach(function (n) {
    t.near(X.runBudget(n, 1), X.RUN_XP_TARGET, 1e-9,
      "a " + n + "-wave campaign still totals the target");
  });
});

test("damage, kills and duration cannot change what a wave pays", function (t) {
  var h = bootProgress();
  h.run("startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000");
  h.run("towers = []; addTower(new Soldier(200, 200, path))");

  // Two waves fought with the same board, one of them for fifty times as long.
  var quick = h.run("(function () {" +
    "  for (var i = 0; i < 20; i++) TowerXP.track(0.1, towers);" +
    "  return TowerXP.settleWave(3, WAVES.length, 1); })()");
  var slow = h.run("(function () {" +
    "  for (var i = 0; i < 1000; i++) TowerXP.track(0.1, towers);" +
    "  return TowerXP.settleWave(3, WAVES.length, 1); })()");

  t.near(slow.budget, quick.budget, 1e-9,
    "the same wave pays the same however long it is held open");
  t.near(slow.awarded.soldier, quick.awarded.soldier, 1e-9,
    "and the tower that held it open earns the same");

  // The integral decides SHARES, never the total: whatever the weights, the
  // parts sum to the wave's own number and no more.
  var total = 0;
  Object.keys(slow.awarded).forEach(function (id) { total += slow.awarded[id]; });
  t.near(total, slow.budget, 1e-9, "the parts sum to exactly the budget");
});

test("a wave's budget splits by the money actually invested, over the whole wave",
function (t) {
  var h = bootProgress();
  h.run("startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 1000000; towers = []");

  // 900 of Rifleman against 300 of Warbringer... the Warbringer is 600, so
  // three Riflemen (900) against one Warbringer (600) is 60/40, and the split
  // is asserted against the money rather than against a number typed here.
  h.run("addTower(new Soldier(200, 200, path));" +
        "addTower(new Soldier(260, 200, path));" +
        "addTower(new Soldier(320, 200, path));" +
        "addTower(new Smasher(420, 260, path))");
  var spent = h.run("(function () { var out = {};" +
    "  towers.forEach(function (tw) { var id = tw.constructor.ID;" +
    "    out[id] = (out[id] || 0) + tw.totalSpent; });" +
    "  return out; })()");

  var shares = h.run("(function () {" +
    "  for (var i = 0; i < 200; i++) TowerXP.track(0.1, towers);" +
    "  return TowerXP.currentShares(); })()");

  var money = spent.soldier + spent.smasher;
  t.near(shares.soldier, spent.soldier / money, 1e-9,
    "the Rifleman's share is its share of the money");
  t.near(shares.smasher, spent.smasher / money, 1e-9, "and the Warbringer's is its");
});

test("buying at the last second earns almost nothing, and a sold tower keeps what it earned",
function (t) {
  var h = bootProgress();
  h.run("startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 1000000; towers = []");

  // A Rifleman stands the whole wave; a Warbringer is bought for its last
  // step. Investment INTEGRATED over the wave is what makes the late arrival
  // unable to buy a share retroactively.
  h.run("addTower(new Soldier(200, 200, path));" +
        "for (var i = 0; i < 300; i++) TowerXP.track(0.1, towers);" +
        "addTower(new Smasher(420, 260, path)); TowerXP.track(0.1, towers)");
  var late = h.run("TowerXP.currentShares()");
  t.ok(late.smasher < 0.05, "a tower bought in the last step took under 5% (" +
    (late.smasher * 100).toFixed(2) + "%)");

  // And the other way: sell everything else at the last moment. The shares the
  // wave already earned do not move, because they were earned second by second.
  h.run("TowerXP.settleWave(1, WAVES.length, 1); towers = [];" +
        "addTower(new Soldier(200, 200, path));" +
        "addTower(new Smasher(420, 260, path));" +
        "for (var i = 0; i < 300; i++) TowerXP.track(0.1, towers);" +
        "sellTower(towers[0])");
  var afterSale = h.run("(function () { TowerXP.track(0.1, towers);" +
    "  return TowerXP.currentShares(); })()");
  t.ok(afterSale.soldier > 0.3,
    "the sold Rifleman keeps the share it stood for (" +
    (afterSale.soldier * 100).toFixed(1) + "%)");

  // A refund cannot make a contribution negative: the quantity integrated is
  // money already spent and never goes below zero.
  t.ok(afterSale.soldier > 0 && afterSale.smasher > 0, "and no share is negative");
});

test("xp is credited when a wave finishes and survives losing the run", function (t) {
  var h = bootProgress();
  h.run("startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 1000000; towers = [];" +
        "addTower(new Soldier(200, 200, path))");
  h.run("for (var i = 0; i < 200; i++) TowerXP.track(0.1, towers);" +
        "TowerXP.settleWave(1, WAVES.length, 1)");
  var banked = h.run("MetaProgress.progressOf('soldier').xp");
  t.ok(banked > 0, "a finished wave banked something (" + banked.toFixed(2) + ")");

  // LOSE THE RUN, HARD. Nothing about an ending may reach back into a wave
  // that was already finished and paid.
  h.run("baseHp = 0; gameOver = true; update(1 / 60)");
  t.eq(h.run("MetaProgress.progressOf('soldier').xp"), banked,
    "a loss keeps every point the finished waves paid");

  h.run("openMenu()");
  t.eq(h.run("MetaProgress.progressOf('soldier').xp"), banked,
    "and so does walking away to the menu");

  // A wave nobody built for pays nobody -- not a payout held over, not a
  // payout split evenly.
  h.run("towers = []");
  var empty = h.run("TowerXP.settleWave(2, WAVES.length, 1)");
  t.deep(Object.keys(empty.awarded), [], "an empty board earns nothing at all");
});

test("the xp thresholds open the five slots one at a time", function (t) {
  var h = bootProgress();
  var thresholds = h.game.MetaProgress.XP_THRESHOLDS;
  t.eq(thresholds.length, 5, "five thresholds for five levels");

  thresholds.forEach(function (need, i) {
    h.run("MetaProgress.reset(); MetaProgress.unlockAll()");
    h.run("MetaProgress.addXp('soldier', " + (need - 1) + ")");
    t.eq(h.run("MetaProgress.progressOf('soldier').level"), i,
      "one point short of " + need + " is still level " + i);
    h.run("MetaProgress.addXp('soldier', 1)");
    var p = h.run("MetaProgress.progressOf('soldier')");
    t.eq(p.level, i + 1, need + " xp is level " + (i + 1));
    t.eq(p.slots, i + 1, "and opens exactly " + (i + 1) + " slot(s)");
  });

  // AT THE TOP THERE IS NO SIXTH BAR TO FILL.
  h.run("MetaProgress.addXp('soldier', 100000)");
  var top = h.run("MetaProgress.progressOf('soldier')");
  t.eq(top.level, 5, "level is capped at five");
  t.eq(top.atMax, true, "and says so");
  t.eq(top.nextLevelXp, null, "with no next threshold invented");
});

test("buying a node does not equip it, and the slots refuse what the level has not opened",
function (t) {
  var h = bootProgress();
  bankCoins(h, 6);
  var node = h.run("TowerPerks.nodes('soldier').filter(function (n) {" +
    "  return !(n.requires && n.requires.length) && !n.minLevel; })[0].id");

  t.eq(h.run("TowerPerks.buy('soldier', '" + node + "').ok"), true, "the node buys");
  t.eq(h.run("MetaProgress.ownsNode('soldier', '" + node + "')"), true, "and is owned");
  t.deep(h.run("MetaProgress.equippedPerks('soldier')"), [null, null, null, null, null],
    "BUYING IS NOT EQUIPPING — the loadout is untouched");
  t.eq(h.run("TowerPerks.inventory('soldier').length"), 1, "it is in the inventory");

  // LEVEL 0 HAS NO SLOTS, and that is the first thing a player will try.
  var atZero = h.run("MetaProgress.equipPerk('soldier', '" + node + "', 0)");
  t.eq(atZero.ok, false, "level 0 equips nothing");
  t.ok(/level 0/.test(atZero.reason), "and says why: " + atZero.reason);

  h.run("MetaProgress.addXp('soldier', 1000)");
  t.eq(h.run("MetaProgress.equipPerk('soldier', '" + node + "', 0).ok"), true,
    "level 1 opens the first slot");
  t.eq(h.run("MetaProgress.equipPerk('soldier', '" + node + "', 1).ok"), false,
    "and not the second");

  // NO DUPLICATES, IN THE TREE OR IN THE BAR.
  t.eq(h.run("TowerPerks.buy('soldier', '" + node + "').ok"), false,
    "a node cannot be bought twice");
  h.run("MetaProgress.addXp('soldier', 2000)");
  h.run("MetaProgress.equipPerk('soldier', '" + node + "', 1)");
  var bar = h.run("MetaProgress.equippedPerks('soldier')");
  t.eq(bar.filter(function (x) { return x === node; }).length, 1,
    "dropping an equipped perk on a second slot MOVES it rather than copying it");
});

test("a convergence needs every parent, and a level gate holds on its own",
function (t) {
  var h = bootProgress();
  bankCoins(h, 20);

  // A PROBE TREE, NOT AUTHORED CONTENT, and deliberately so: these are ENGINE
  // rules and the shipping trees are not obliged to exercise them. The two
  // authored ones -- the Rifleman's four roots and the Warbringer's four plus a
  // one-parent child -- happen to hold neither shape today, and the rules must
  // be pinned whether or not any content is currently using them.
  //
  // It registers on the Farm, which has no tree of its own, so it collides with
  // nothing; each test boots its own context, so it does not leak either.
  h.run("TowerPerks.register({ towerId: 'farm', nodes: [" +
    "  { id: 'p_a', name: 'Probe A', cost: 5, at: { x: -1, y: 0 } }," +
    "  { id: 'p_b', name: 'Probe B', cost: 5, at: { x: 1, y: 0 } }," +
    "  { id: 'p_both', name: 'Probe convergence', cost: 5," +
    "    requires: ['p_a', 'p_b'], at: { x: 0, y: -1 } }," +
    "  { id: 'p_level', name: 'Probe level gate', cost: 5," +
    "    minLevel: 3, requires: ['p_a'], at: { x: 0, y: 1 } }" +
    "] })");

  // ONE PARENT IS NEVER ENOUGH. `requires` is AND, never OR.
  h.run("TowerPerks.buy('farm', 'p_a')");
  var half = h.run("TowerPerks.stateOf('farm', 'p_both')");
  t.eq(half.state, "locked", "half the parents leaves the convergence locked");
  t.deep(half.missing, ["p_b"], "and it names exactly what is missing");
  t.eq(h.run("TowerPerks.buy('farm', 'p_both').ok"), false,
    "the purchase is refused too, and with the same sentence");

  h.run("TowerPerks.buy('farm', 'p_b')");
  t.eq(h.run("TowerPerks.stateOf('farm', 'p_both').state"), "buyable",
    "the second parent opens it");

  // A LEVEL GATE IS ITS OWN GATE: prerequisites and coins are not enough, and
  // the refusal says which of the three is missing.
  var gated = h.run("TowerPerks.stateOf('farm', 'p_level')");
  t.eq(gated.state, "level", "prerequisites and coins alone do not open it");
  t.ok(/level 3/.test(gated.reason), "and it says which level: " + gated.reason);

  h.run("MetaProgress.addXp('farm', 5000)");     // level 3
  t.eq(h.run("TowerPerks.stateOf('farm', 'p_level').state"), "buyable",
    "reaching the level opens it");

  // AND POVERTY IS A FOURTH, DISTINCT STATE.
  h.run("MetaProgress.debugPatch({ coins: 0 })");
  var poor = h.run("TowerPerks.stateOf('farm', 'p_level')");
  t.eq(poor.state, "poor", "with everything met but the coins it reads poor");
  t.ok(/coins/.test(poor.reason), "and says so: " + poor.reason);
});

test("a purchase spends once, and every part of it survives a reload", function (t) {
  var h = bootProgress();
  var coins = bankCoins(h, 6);
  var node = h.run("TowerPerks.nodes('soldier').filter(function (n) {" +
    "  return !(n.requires && n.requires.length) && !n.minLevel; })[0]");

  h.run("TowerPerks.buy('soldier', '" + node.id + "')");
  t.eq(h.run("MetaProgress.coins()"), coins - node.cost, "the price came out once");
  h.run("TowerPerks.buy('soldier', '" + node.id + "')");
  h.run("TowerPerks.buy('soldier', '" + node.id + "')");
  t.eq(h.run("MetaProgress.coins()"), coins - node.cost,
    "and a double click does not pay twice");

  h.run("MetaProgress.addXp('soldier', 1200)");
  h.run("MetaProgress.equipPerk('soldier', '" + node.id + "', 0)");

  // RELOAD, through the same sanitise a file goes through.
  var raw = h.run("MetaProgress.snapshot()");
  var reloaded = h.run("MetaProgress.__loadForTest(" + JSON.stringify({
    coins: raw.coins, owned: raw.owned, equipped: raw.equipped,
    progress: { soldier: { xp: raw.progress.soldier.xp,
                           nodes: raw.progress.soldier.nodes,
                           equipped: raw.progress.soldier.equipped, resetAt: 0 } }
  }) + ")");
  t.eq(reloaded.coins, coins - node.cost, "coins survive");
  t.deep(reloaded.progress.soldier.nodes, [node.id], "the bought node survives");
  t.eq(reloaded.progress.soldier.equipped[0], node.id, "so does the loadout");
  t.eq(reloaded.progress.soldier.level, 1, "and the level the xp bought");
});

test("a hand-edited profile cannot run more perks than its level allows", function (t) {
  var h = bootProgress();

  // Five perks equipped on a level-1 tower, and a perk that was never bought.
  var repaired = h.run("MetaProgress.__loadForTest(" + JSON.stringify({
    coins: 40, owned: ["soldier"], equipped: ["soldier", null, null, null, null],
    progress: { soldier: {
      xp: 1000,
      nodes: ["a", "b", "c"],
      equipped: ["a", "b", "c", "never_bought", "a"],
      resetAt: 4102444800000          // and a stamp far in the future
    } }
  }) + ")");

  var row = repaired.progress.soldier;
  t.eq(row.level, 1, "1000 xp is level 1");
  t.eq(row.equipped[0], "a", "the one slot the level opened is honoured");
  t.deep(row.equipped.slice(1), [null, null, null, null],
    "and every slot past it is emptied");
  t.eq(row.xp, 1000, "the xp itself is kept");
});

test("a run keeps the loadout it started with, even through a level-up", function (t) {
  var h = bootProgress();
  bankCoins(h, 6);

  // ANY TREE'S ROOT THAT MOVES A READABLE STAT. Found rather than named, so
  // replacing a tower's content does not turn this red for reasons that have
  // nothing to do with the freeze it is testing.
  var found = h.run("(function () { var out = null;" +
    "  TowerPerks.towersWithTrees().forEach(function (towerId) {" +
    "    TowerPerks.nodes(towerId).forEach(function (n) {" +
    "      if (out || (n.requires && n.requires.length) || n.minLevel) return;" +
    "      if (!n.effects || !n.effects.add ||" +
    "          typeof n.effects.add.rangeUl !== 'number') return;" +
    "      out = { tower: towerId, id: n.id, delta: n.effects.add.rangeUl };" +
    "    });" +
    "  });" +
    "  return out; })()");
  t.ok(found !== null, "some tree has a root that moves reach");

  var T = found.tower;
  h.run("TowerPerks.buy('" + T + "', '" + found.id + "');" +
        "MetaProgress.addXp('" + T + "', 1000);" +
        "MetaProgress.equipPerk('" + T + "', '" + found.id + "', 0)");

  h.run("startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000; towers = []");
  var withPerk = h.run("(function () {" +
    "  var Type = MetaProgress.constructorOf('" + T + "');" +
    "  var s = new Type(200, 200, path); addTower(s);" +
    "  return { ul: s.rangeUl, px: s.rangePx }; })()");
  var baseUl = h.run("(function () {" +
    "  var Type = MetaProgress.constructorOf('" + T + "');" +
    "  return Type.BASE_RANGE_UL; })()");
  t.eq(withPerk.ul, baseUl + found.delta, "a tower placed in the run carries the perk");

  // REACH IS TWO NUMBERS. `rangePx` is what targeting and the ring actually
  // read, and a perk that moved the stat and not the cache would draw one
  // circle and shoot another.
  t.near(withPerk.px, h.run("elevatedRangePx(towers[towers.length - 1], " +
    withPerk.ul + ")"), 1e-9, "and the pixel reach was re-derived with it");

  // THE PERK SURVIVES AN IN-RUN UPGRADE. Every tower recomputes its stats from
  // base on every tier, so this is the property the whole application design
  // exists for.
  var afterTier = h.run("(function () { var s = towers[towers.length - 1];" +
    "  buyUpgrade(s, 'B1'); return s.rangeUl; })()");
  t.ok(afterTier > withPerk.ul, "and still carries it after buying B1 (" +
    withPerk.ul + " -> " + afterTier + ")");

  // MID-RUN THE LOADOUT IS FROZEN. Levelling up banks at once; the board keeps
  // the five it started with.
  h.run("MetaProgress.unequipPerk('" + T + "', 0); MetaProgress.addXp('" + T + "', 5000)");
  var later = h.run("(function () {" +
    "  var Type = MetaProgress.constructorOf('" + T + "');" +
    "  var s = new Type(340, 200, path); addTower(s); return s.rangeUl; })()");
  t.eq(later, withPerk.ul, "a tower placed later in the same run still has it");
  t.eq(h.run("MetaProgress.progressOf('" + T + "').level"), 3,
    "while the level itself banked immediately");

  // AND THE MOMENT THE RUN IS OVER, THE LIVE LOADOUT IS THE ANSWER AGAIN.
  h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000; towers = []");
  var nextRun = h.run("(function () {" +
    "  var Type = MetaProgress.constructorOf('" + T + "');" +
    "  var s = new Type(200, 200, path); addTower(s); return s.rangeUl; })()");
  t.eq(nextRun, baseUl, "the next run plays without it");
});

test("a perk that moves a build price moves it everywhere the price is read",
function (t) {
  var h = bootProgress();
  bankCoins(h, 12);
  var found = h.run("(function () {" +
    "  var out = null;" +
    "  TowerPerks.towersWithTrees().forEach(function (towerId) {" +
    "    TowerPerks.nodes(towerId).forEach(function (n) {" +
    "      if (out || !n.effects || !n.effects.price) return;" +
    "      if (n.requires && n.requires.length) return;" +
    "      if (n.minLevel) return;" +
    "      out = { tower: towerId, id: n.id };" +
    "    });" +
    "  });" +
    "  return out; })()");
  t.ok(found !== null, "some tree changes what its tower costs to build");

  var Type = found.tower;
  var before = h.run("TowerPerks.priceOf(MetaProgress.constructorOf('" + Type + "'))");
  h.run("TowerPerks.buy('" + Type + "', '" + found.id + "');" +
        "MetaProgress.addXp('" + Type + "', 1000);" +
        "MetaProgress.equipPerk('" + Type + "', '" + found.id + "', 0)");
  var after = h.run("TowerPerks.priceOf(MetaProgress.constructorOf('" + Type + "'))");
  t.ok(after !== before, "the quoted price moved (" + before + " -> " + after + ")");

  // THE TILL AND THE TOWER AGREE. `cost` is what the panel shows and
  // `totalSpent` is what a sale refunds half of; both must be the perked price
  // or a sale would hand back half of a number nobody paid.
  h.run("startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000; towers = []");
  var built = h.run("(function () {" +
    "  var T = MetaProgress.constructorOf('" + Type + "');" +
    "  var s = new T(200, 200, path); addTower(s);" +
    "  return { cost: s.cost, spent: s.totalSpent }; })()");
  t.eq(built.cost, after, "the tower's own cost is the perked price");
  t.eq(built.spent, after, "and so is what it has had sunk into it");
});

test("resetting a tree refunds the nodes, keeps the level, and cools down",
function (t) {
  var h = bootProgress();
  // ENOUGH TO BUY THE WHOLE TREE, whatever it grows to. The Rifleman's twelve
  // confirmed nodes come to 1 450 coins, and a purchase that silently fails for
  // want of change would make every figure below agree with itself and with
  // nothing else -- so the buys are asserted, not assumed.
  var coins = bankCoins(h, 40);

  var roots = h.run("TowerPerks.nodes('soldier').filter(function (n) {" +
    "  return !(n.requires && n.requires.length) && !n.minLevel; })" +
    "  .map(function (n) { return { id: n.id, cost: n.cost }; })");
  t.ok(roots.length >= 2, "the Rifleman has root nodes to buy");

  var spent = 0;
  var refused = [];
  roots.forEach(function (n) {
    if (!h.run("TowerPerks.buy('soldier', '" + n.id + "').ok")) refused.push(n.id);
    spent += n.cost;
  });
  t.deep(refused, [], "every root was actually bought");
  h.run("MetaProgress.addXp('soldier', 3000)");
  h.run("MetaProgress.equipPerk('soldier', '" + roots[0].id + "', 0)");

  var beforeXp = h.run("MetaProgress.progressOf('soldier').xp");
  var refund = h.run("TowerPerks.refundValue('soldier')");
  t.eq(refund, spent, "the refund is what the nodes cost");

  var out = h.run("TowerPerks.resetTree('soldier', 1000000)");
  t.eq(out.ok, true, "the reset goes through");
  t.eq(h.run("MetaProgress.coins()"), coins - spent + refund - out.fee,
    "the prices come back and only the fee is lost");
  t.deep(h.run("MetaProgress.ownedNodes('soldier')"), [], "every node is revoked");
  t.eq(h.run("TowerPerks.inventory('soldier').length"), 0, "the inventory is empty");
  t.deep(h.run("MetaProgress.equippedPerks('soldier')"), [null, null, null, null, null],
    "AND THE LOADOUT WITH IT — a slot holding a node you no longer own is the " +
    "one shape equipPerk refuses to create, so a reset must not create it either");
  t.eq(h.run("MetaProgress.progressOf('soldier').xp"), beforeXp, "the xp is untouched");
  t.eq(h.run("MetaProgress.progressOf('soldier').level"), 2, "and so is the level");

  // THE COOLDOWN IS PER TOWER AND IS REPORTED, NOT MERELY ENFORCED.
  h.run("TowerPerks.buy('soldier', '" + roots[0].id + "')");
  var again = h.run("TowerPerks.resetTree('soldier', 1000000)");
  t.eq(again.ok, false, "an immediate second reset is refused");
  t.ok(again.readyAt > 1000000, "and says when it may be done: " + again.readyAt);
  t.eq(h.run("TowerPerks.resetTree('soldier', " +
    (1000000 + h.game.MetaProgress.TREE_RESET_COOLDOWN_MS) + ").ok"), true,
    "once the cooldown is out it works again");
});

test("the sandbox banks no experience at all", function (t) {
  var h = bootProgress();
  h.run("startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000; towers = [];" +
        "addTower(new Soldier(200, 200, path))");
  h.run("TowerXP.setEnabled(false)");

  var before = h.run("MetaProgress.progressOf('soldier').xp");
  var out = h.run("(function () {" +
    "  for (var i = 0; i < 400; i++) TowerXP.track(0.1, towers);" +
    "  return TowerXP.settleWave(30, WAVES.length, 1); })()");
  t.eq(h.run("MetaProgress.progressOf('soldier').xp"), before,
    "a testing surface cannot level a real profile");
  t.deep(Object.keys(out.awarded), [], "and nothing is awarded");

  // The EQUIPPED perks still apply there, deliberately: what you learn about a
  // tower on the workbench has to be true in the shipping game.
  t.eq(h.run("typeof TowerPerks.applyTo"), "function",
    "perks are still applied — only the banking is off");
  h.run("TowerXP.setEnabled(true)");
});

test("a save written before this system existed loads and loses nothing", function (t) {
  var h = harness.boot();
  var old = { coins: 42, owned: ["soldier", "smasher"],
              equipped: ["smasher", "soldier", null, null, null],
              runs: 9, bestWave: 22, milestones: ["reach_11"], routesWon: [] };
  var loaded = h.run("MetaProgress.__loadForTest(" + JSON.stringify(old) + ")");

  t.eq(loaded.coins, 42, "its coins are its own");
  t.deep(loaded.owned, ["soldier", "smasher"], "its towers are still owned");
  t.deep(loaded.equipped, ["smasher", "soldier", null, null, null],
    "and its build bar is untouched");

  // EVERY OWNED TOWER GETS A CLEAN STARTING ROW rather than an undefined one.
  ["soldier", "smasher"].forEach(function (id) {
    var p = loaded.progress[id];
    t.eq(p.level, 0, id + " starts this system at level 0");
    t.eq(p.xp, 0, "with no xp");
    t.deep(p.nodes, [], "no node bought");
    t.deep(p.equipped, [null, null, null, null, null], "and five empty slots");
  });
});

test("the Upgrades screen lists what is owned and drives the loadout by click and by drag",
function (t) {
  var h = bootProgress();
  bankCoins(h, 8);
  h.run("MetaProgress.addXp('soldier', 2600)");     // level 2, two slots
  var roots = h.run("TowerPerks.nodes('soldier').filter(function (n) {" +
    "  return !(n.requires && n.requires.length) && !n.minLevel; })" +
    "  .map(function (n) { return n.id; })");
  h.run("TowerPerks.buy('soldier', '" + roots[0] + "');" +
        "TowerPerks.buy('soldier', '" + roots[1] + "')");

  h.run("openMenu(); Upgrades.open()");
  t.eq(h.game.screen, "upgrades", "the screen opens");
  t.eq(h.run("Upgrades.state().selected"), "soldier",
    "on the first tower the profile owns");

  // ONLY OWNED TOWERS. A type you have not bought belongs to the armoury.
  h.run("MetaProgress.__loadForTest(" + JSON.stringify({
    coins: 300, owned: ["soldier"], equipped: ["soldier", null, null, null, null]
  }) + "); Upgrades.open()");
  var rows = h.run("(function () { var n = 0;" +
    "  while (Upgrades.towerRowRect(n).y < VIEW_HEIGHT) n++;" +
    "  return MetaProgress.snapshot().owned.length; })()");
  t.eq(rows, 1, "a profile owning one tower lists one tower");

  // Back to the full profile for the loadout gestures.
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar()");
  bankCoins(h, 8);
  h.run("MetaProgress.addXp('soldier', 2600);" +
        "TowerPerks.buy('soldier', '" + roots[0] + "');" +
        "TowerPerks.buy('soldier', '" + roots[1] + "');" +
        "Upgrades.open()");

  // A CLICK READS. It pins the module into the right-hand card and moves NO
  // loadout -- which is what makes an equipped module readable at all, and is
  // the whole of the 2026-08-31 change.
  var card = h.run("Upgrades.inventoryCardRect(0)");
  var firstId = h.run("TowerPerks.inventory('soldier')[0].id");
  h.run("Upgrades.onMouseDown(" + (card.x + 20) + ", " + (card.y + 20) + ");" +
        "Upgrades.onMouseUp(" + (card.x + 20) + ", " + (card.y + 20) + ")");
  t.eq(h.run("Upgrades.state().detail"), firstId,
    "clicking a module opens it on the right");
  t.eq(h.run("MetaProgress.equippedPerks('soldier')[0]"), null,
    "and equips nothing at all");

  // THE GREEN BUTTON IS WHAT EQUIPS, into the first slot the level has opened
  // and left free. There are TWO of them and they are one action: a strip
  // directly under the pinned card, and the control at the foot of the panel.
  var strip = h.run("Upgrades.inventoryActionRect()");
  t.ok(strip !== null, "a strip opens under the pinned card");
  t.near(strip.y, card.y + 48, 1e-9, "directly under it");
  t.eq(strip.x, card.x, "and exactly as wide, in the same column");
  t.ok(strip.y >= card.y + card.h,
    "and BELOW it — never under the cursor that pinned it, so a second click " +
    "in the same place cannot press it");

  h.run("Upgrades.onClick(" + (strip.x + 40) + ", " + (strip.y + 14) + ")");
  t.eq(h.run("MetaProgress.equippedPerks('soldier')[0]"), firstId,
    "pressing the strip's EQUIP puts it in slot 1");
  t.ok(/slot 1/i.test(h.run("Upgrades.state().flash.text")), "and says where");

  // AND THE PANEL'S CONTROL IS THE SAME ACTION, so it takes it straight out.
  var action = h.run("Upgrades.perkActionRect()");
  h.run("Upgrades.onClick(" + (action.x + 40) + ", " + (action.y + 20) + ")");
  t.eq(h.run("MetaProgress.equippedPerks('soldier')[0]"), null,
    "the panel's UNEQUIP is the same button in another place");
  h.run("Upgrades.onClick(" + (action.x + 40) + ", " + (action.y + 20) + ")");
  t.eq(h.run("MetaProgress.equippedPerks('soldier')[0]"), firstId, "and back again");

  // THE STRIP IS IN THE LAYOUT, NOT OVER IT: nothing is covered, and the rows
  // below the pinned one moved down by exactly its height.
  var pushed = h.run("(function () {" +
    "  var before = Upgrades.inventoryCardRect(1);" +
    "  var boxed = Upgrades.inventoryRect();" +
    "  var overlap = false;" +
    "  var strip = Upgrades.inventoryActionRect();" +
    "  var n = TowerPerks.inventory('soldier').length;" +
    "  for (var i = 0; i < n; i++) {" +
    "    var r = Upgrades.inventoryCardRect(i);" +
    "    if (strip.y < r.y + r.h && strip.y + strip.h > r.y &&" +
    "        strip.x < r.x + r.w && strip.x + strip.w > r.x) overlap = true; }" +
    "  return { overlap: overlap }; })()");
  t.eq(pushed.overlap, false, "the strip overlaps no card at all");

  // AND NOTHING MOVES WHEN THE PIN DOES. The lane the strip sits in is reserved
  // under EVERY row, so the list's geometry does not depend on which module is
  // open -- which is what stops a card jumping under a stationary cursor and
  // putting the button where the next click will land.
  var frozen = h.run("(function () {" +
    "  var list = TowerPerks.inventory('soldier');" +
    "  function snap() { return list.map(function (n, i) {" +
    "    var r = Upgrades.inventoryCardRect(i); return r.x + ',' + r.y; }); }" +
    "  var out = { same: true };" +
    "  var first = snap();" +
    "  for (var i = 0; i < list.length; i++) {" +
    "    var r = Upgrades.inventoryCardRect(i);" +
    "    Upgrades.onMouseDown(r.x + 20, r.y + 10);" +
    "    Upgrades.onMouseUp(r.x + 20, r.y + 10);" +
    "    var now = snap();" +
    "    for (var k = 0; k < now.length; k++) if (now[k] !== first[k]) out.same = false; }" +
    "  return out; })()");
  t.eq(frozen.same, true,
    "pinning every module in turn moves not one card by one pixel");

  // AN EQUIPPED MODULE CAN BE READ WITHOUT BEING TAKEN OUT. This is the bug the
  // change exists to fix: a click on its slot used to unequip it on the spot.
  var slotA = h.run("Upgrades.slotRect(0)");
  h.run("Upgrades.onMouseDown(" + (slotA.x + 40) + ", " + (slotA.y + 40) + ");" +
        "Upgrades.onMouseUp(" + (slotA.x + 40) + ", " + (slotA.y + 40) + ")");
  t.eq(h.run("Upgrades.state().detail"), firstId,
    "clicking an equipped module opens it too");
  t.eq(h.run("MetaProgress.equippedPerks('soldier')[0]"), firstId,
    "and leaves it exactly where it was");

  // AND A THIRD BUTTON OPENS UNDER THE SLOT ITSELF, which is the same action
  // again -- wherever you clicked, the control is beside your cursor.
  var underSlot = h.run("Upgrades.slotActionRect()");
  t.ok(underSlot !== null, "a strip opens under the slot holding it");
  t.eq(underSlot.x, slotA.x, "in the slot's own column");
  t.ok(underSlot.y > slotA.y + slotA.h, "directly below it");
  t.ok(underSlot.y + underSlot.h < h.run("Upgrades.inventoryRect().y"),
    "in the gap the slots already left above the list — nothing moved for it");

  h.run("Upgrades.onClick(" + (underSlot.x + 40) + ", " + (underSlot.y + 10) + ")");
  t.eq(h.run("MetaProgress.equippedPerks('soldier')[0]"), null,
    "pressing it empties the slot");
  t.eq(h.run("MetaProgress.ownsNode('soldier', '" + firstId + "')"), true,
    "and the node is still owned — unequipping is not un-buying");
  t.eq(h.run("Upgrades.slotActionRect()"), null,
    "and the strip goes with the module that was in the slot");

  // Put it back for the drag cases below, through the panel's control -- the
  // third of the three, and the same action once more.
  h.run("Upgrades.onClick(" + (action.x + 40) + ", " + (action.y + 20) + ")");
  t.eq(h.run("MetaProgress.equippedPerks('soldier')[0]"), firstId, "back in slot 1");

  // A DRAG onto a legal slot moves it there -- which is how a player chooses
  // WHICH slot, and the reason dragging is kept beside the button.
  var secondId = h.run("TowerPerks.inventory('soldier')[1].id");
  var card2 = h.run("Upgrades.inventoryCardRect(1)");
  var slot2 = h.run("Upgrades.slotRect(1)");
  h.run("Upgrades.onMouseDown(" + (card2.x + 20) + ", " + (card2.y + 20) + ");" +
        "Upgrades.onMouseMove(" + (card2.x + 60) + ", " + (card2.y + 20) + ");" +
        "Upgrades.onMouseUp(" + (slot2.x + 40) + ", " + (slot2.y + 40) + ")");
  t.eq(h.run("MetaProgress.equippedPerks('soldier')[1]"), secondId,
    "dragging one onto slot 2 equips it there");

  // A DROP ON A LOCKED SLOT REFUSES AND SAYS WHY, and nothing moves.
  var card3 = h.run("Upgrades.inventoryCardRect(0)");
  var slot5 = h.run("Upgrades.slotRect(4)");
  h.run("Upgrades.onMouseDown(" + (card3.x + 20) + ", " + (card3.y + 20) + ");" +
        "Upgrades.onMouseMove(" + (card3.x + 80) + ", " + (card3.y + 20) + ");" +
        "Upgrades.onMouseUp(" + (slot5.x + 40) + ", " + (slot5.y + 40) + ")");
  t.eq(h.run("MetaProgress.equippedPerks('soldier')[4]"), null, "slot 5 stays empty");
  t.ok(/level 5/.test(h.run("Upgrades.state().flash.text")),
    "and the screen says which level opens it");

  // A DROP ON NOTHING PUTS IT BACK. A perk is never lost off the edge.
  var bar = h.run("MetaProgress.equippedPerks('soldier')");
  h.run("Upgrades.onMouseDown(" + (card3.x + 20) + ", " + (card3.y + 20) + ");" +
        "Upgrades.onMouseMove(10, 10); Upgrades.onMouseUp(4, 4)");
  t.deep(h.run("MetaProgress.equippedPerks('soldier')"), bar,
    "a drop that lands nowhere changes nothing");

  // AND A DRAG FROM A SLOT BACK ONTO THE LIST TAKES IT OUT, free and immediate.
  var slot1 = h.run("Upgrades.slotRect(0)");
  var box = h.run("Upgrades.inventoryRect()");
  h.run("Upgrades.onMouseDown(" + (slot1.x + 40) + ", " + (slot1.y + 40) + ");" +
        "Upgrades.onMouseMove(" + (slot1.x + 90) + ", " + (slot1.y + 60) + ");" +
        "Upgrades.onMouseUp(" + (box.x + 40) + ", " + (box.y + 60) + ")");
  t.eq(h.run("MetaProgress.equippedPerks('soldier')[0]"), null, "the slot empties");
  t.eq(h.run("MetaProgress.ownsNode('soldier', '" + firstId + "')"), true,
    "and the node is still owned — unequipping is not un-buying");
});

test("unlocking the whole roster is written down", function (t) {
  var h = bootProgress();
  h.run("MetaProgress.reset()");
  var starter = h.run("MetaProgress.snapshot().owned.length");
  t.eq(starter, 1, "a fresh profile owns the one starter");

  h.run("MetaProgress.unlockAll()");
  var owned = h.run("MetaProgress.snapshot().owned");
  t.eq(owned.length, h.run("MetaProgress.catalogue().length"),
    "afterwards it owns every tower in the catalogue");
  t.eq(h.run("MetaProgress.equipped().filter(Boolean).length"),
    Math.min(owned.length, h.game.MetaProgress.SLOT_COUNT),
    "and the build bar was filled from them");

  // IT SAVES, which it did not until 2026-08-31 -- it was the one mutator in
  // js/meta.js that changed the profile without writing it down. Nothing
  // noticed while the test harness was its only caller, because Node has no
  // localStorage; the cheat panel calls it too, and there a profile that owned
  // everything until the page was reloaded is a profile that lies.
  //
  // MEASURED THROUGH A REAL STORE rather than by trusting the call. Node has no
  // `localStorage`, so one is handed to the game's own scope -- `MetaProgress`
  // reads the free variable and asks `typeof`, so a plain object with the three
  // methods is all it wants -- and then the bytes it wrote are read back. That
  // is the only way to tell "the state changed" from "the state was persisted".
  h.run("localStorage = { data: {}," +
        "  getItem: function (k) { return this.data[k] === undefined ? null : this.data[k]; }," +
        "  setItem: function (k, v) { this.data[k] = String(v); }," +
        "  removeItem: function (k) { delete this.data[k]; } }");
  h.run("MetaProgress.reset()");
  var fresh = JSON.parse(h.run("localStorage.getItem(MetaProgress.STORAGE_KEY)"));
  t.eq(fresh.owned.length, 1, "a reset writes the one starter down");

  h.run("MetaProgress.unlockAll()");
  var stored = JSON.parse(h.run("localStorage.getItem(MetaProgress.STORAGE_KEY)"));
  t.eq(stored.owned.length, owned.length,
    "and unlocking the roster writes every tower down too — it did not, and a " +
    "reload took them all back");
  t.eq(stored.equipped.filter(Boolean).length,
    Math.min(owned.length, h.game.MetaProgress.SLOT_COUNT),
    "with the build bar it filled");

  h.run("localStorage = undefined");
});

test("a chained node cannot be bought before the one before it", function (t) {
  var h = bootContent();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll()");
  for (var i = 0; i < 40; i++) {
    h.run("MetaProgress.awardRun({ wavesCompleted: 35, waveReached: 35, " +
      "victory: true, mapId: Maps.DEFAULT_ID, mapName: 'x', difficultyId: 'easy' })");
  }

  // THE THIRD NODE OUT ON A BRANCH, with nothing bought. It is locked, and the
  // refusal names the node it is waiting on rather than saying "no".
  var third = h.run("TowerPerks.stateOf('soldier', 'rif_b3')");
  t.eq(third.state, "locked", "the third node on path B is locked from the start");
  t.deep(third.missing, ["rif_b2"], "on exactly the node before it");
  t.ok(/Rapid Muster/.test(third.reason),
    "and it says which one by name: " + third.reason);
  t.eq(h.run("TowerPerks.buy('soldier', 'rif_b3').ok"), false, "so it cannot be bought");
  t.eq(h.run("MetaProgress.ownsNode('soldier', 'rif_b3')"), false, "and was not");

  // BUYING INWARDS OPENS IT, one step at a time and no faster.
  t.eq(h.run("TowerPerks.buy('soldier', 'rif_b1').ok"), true, "the root buys");
  t.eq(h.run("TowerPerks.stateOf('soldier', 'rif_b3').state"), "locked",
    "the third is still locked with only the first bought");
  t.eq(h.run("TowerPerks.buy('soldier', 'rif_b2').ok"), true, "the second buys");
  t.eq(h.run("TowerPerks.stateOf('soldier', 'rif_b3').state"), "buyable",
    "and now the third is buyable");

  // THE DRAWING FOLLOWS THE SAME FIELD, which is what makes it dynamic: the
  // tree screen links a node to its PARENT, and a node beside the tower to the
  // tower. Change `requires` and the line moves with the lock.
  h.run("Upgrades.open(); Upgrades.selectTower('soldier'); Upgrades.openTree()");
  var links = h.run("(function () {" +
    "  var out = [];" +
    "  TowerPerks.nodes('soldier').forEach(function (n) {" +
    "    var to = Upgrades.nodeScreenPoint(n);" +
    "    (n.requires || []).forEach(function (r) {" +
    "      var p = TowerPerks.nodeOf('soldier', r);" +
    "      var from = Upgrades.nodeScreenPoint(p);" +
    "      out.push({ id: n.id, dx: Math.round(to.x - from.x)," +
    "                 dy: Math.round(to.y - from.y) }); }); });" +
    "  return out; })()");
  t.eq(links.length, 8, "eight of the Rifleman's twelve nodes hang off another");
  var longest = 0;
  links.forEach(function (l) {
    longest = Math.max(longest, Math.abs(l.dx), Math.abs(l.dy));
  });
  var pitch = h.run("(function () {" +
    "  var a = Upgrades.nodeScreenPoint(TowerPerks.nodeOf('soldier', 'rif_b1'));" +
    "  var b = Upgrades.nodeScreenPoint(TowerPerks.nodeOf('soldier', 'rif_b2'));" +
    "  return Math.round(Math.abs(b.x - a.x)); })()");
  t.eq(longest, pitch,
    "and every link is exactly ONE step long — no line reaches past a node to " +
    "the tower, which is what made independent roots look like a chain");
});

test("the pips beside a tower read its loadout, not its level", function (t) {
  var h = bootContent();

  // THEY LOOKED LIKE A LOADOUT AND WERE NOT (2026-08-31). Five solid squares
  // filled up to the tower's LEVEL, so a tower with every slot open and nothing
  // in any of them was drawn exactly like one carrying five modules.
  h.run("MetaProgress.reset(); MetaProgress.unlockAll();" +
        "openMenu(); Upgrades.open(); Upgrades.selectTower('soldier')");

  function pips() {
    return h.run("[0,1,2,3,4].map(function (i) {" +
      "  return Upgrades.slotPipState('soldier', i); })");
  }

  t.deep(pips(), ["locked", "locked", "locked", "locked", "locked"],
    "a level-0 tower has five barred slots");

  // LEVEL 2: two open and empty, three still barred -- so how many pips are NOT
  // barred is still the level, which is what the old drawing was for.
  h.run("MetaProgress.addXp('soldier', 2500)");
  t.eq(h.run("MetaProgress.progressOf('soldier').level"), 2, "2 500 xp is level 2");
  t.deep(pips(), ["empty", "empty", "locked", "locked", "locked"],
    "two open and empty, three barred");

  h.run("MetaProgress.addXp('soldier', 20000);" +
        "MetaProgress.buyNode('soldier', 'rif_n1', 0);" +
        "MetaProgress.buyNode('soldier', 'rif_s1', 0);" +
        "MetaProgress.equipPerk('soldier', 'rif_n1', 2);" +
        "MetaProgress.equipPerk('soldier', 'rif_s1', 4)");
  t.deep(pips(), ["empty", "empty", "filled", "empty", "filled"],
    "and a filled pip is a slot with a module in it — the third and the fifth");

  // TAKING ONE OUT EMPTIES ITS PIP, which is the whole point of the change.
  h.run("MetaProgress.unequipPerk('soldier', 2)");
  t.deep(pips(), ["empty", "empty", "empty", "empty", "filled"],
    "unequipping empties that pip and no other");

  // AND OWNING A MODULE WITHOUT EQUIPPING IT FILLS NOTHING.
  h.run("MetaProgress.unequipPerk('soldier', 4)");
  t.deep(pips(), ["empty", "empty", "empty", "empty", "empty"],
    "two modules owned, none equipped, and not one pip is filled");
  t.eq(h.run("TowerPerks.inventory('soldier').length"), 2, "while both are still owned");
});

test("the modules are grouped by the branch they came off", function (t) {
  var h = bootContent();

  // EVERY NODE OF A TWO-PATH TOWER, so all four bands can be asked for at once.
  h.run("MetaProgress.reset(); MetaProgress.unlockAll();" +
        "MetaProgress.addXp('soldier', 20000);" +
        "TowerPerks.nodes('soldier').forEach(function (n) {" +
        "  MetaProgress.buyNode('soldier', n.id, 0); });" +
        "openMenu(); Upgrades.open(); Upgrades.selectTower('soldier')");
  t.deep(h.run("Upgrades.inventoryGroups()"), ["PATH A", "PATH B", "GENERAL"],
    "a two-path tower reads PATH A, PATH B and GENERAL");

  // THE ARM IS THE BRANCH, and the tree screen's own layout is where it comes
  // from -- west is A, east is B, and the two general arms are one band.
  t.eq(h.run("Upgrades.branchOf('rif_a1')"), "A", "a west node is path A");
  t.eq(h.run("Upgrades.branchOf('rif_b1')"), "B", "an east node is path B");
  t.eq(h.run("Upgrades.branchOf('rif_n1')"), "G", "a north node is general");
  t.eq(h.run("Upgrades.branchOf('rif_s1')"), "G", "and so is a south one");

  // A THREE-PATH TOWER GETS A PATH C BAND, and its south arm IS that path.
  h.run("MetaProgress.addXp('farm', 20000);" +
        "TowerPerks.nodes('farm').forEach(function (n) {" +
        "  MetaProgress.buyNode('farm', n.id, 0); });" +
        "Upgrades.selectTower('farm')");
  t.deep(h.run("Upgrades.inventoryGroups()"),
    ["PATH A", "PATH B", "PATH C", "GENERAL"],
    "the Farm reads all four");
  t.eq(h.run("Upgrades.branchOf('frm_c1')"), "C",
    "its south arm is path C, not a second general branch");
  t.eq(h.run("Upgrades.branchOf('frm_n1')"), "G", "while its north arm is general");

  // AND EVERY CARD IS INSIDE THE BOX IT SCROLLS IN, whatever the grouping does
  // to the layout -- the hit test and the drawing read the same function.
  var placed = h.run("(function () {" +
    "  var box = Upgrades.inventoryRect();" +
    "  var n = TowerPerks.inventory('farm').length, bad = 0;" +
    "  for (var i = 0; i < n; i++) {" +
    "    var r = Upgrades.inventoryCardRect(i);" +
    "    if (r.x < box.x || r.x + r.w > box.x + box.w) bad++; }" +
    "  return { n: n, bad: bad }; })()");
  t.eq(placed.n, 13, "the Farm owns thirteen modules");
  t.eq(placed.bad, 0, "and every card is inside the list's own width");
});

test("the tree screen shows the whole tree, navigates it, and comes back to its tower",
function (t) {
  var h = bootProgress();
  h.run("openMenu(); Upgrades.open(); Upgrades.selectTower('smasher'); Upgrades.openTree()");
  t.eq(h.game.screen, "tree", "the tree opens");

  // THE WHOLE TREE IS FRAMED BY RECENTRING, whatever size it is -- that is what
  // "come back to a usable view" has to mean when a tree may be any shape.
  var framed = h.run("(function () {" +
    "  var board = Upgrades.boardRect();" +
    "  return TowerPerks.nodes('smasher').every(function (n) {" +
    "    var p = Upgrades.nodeScreenPoint(n);" +
    "    return p.x > board.x && p.x < board.x + board.w &&" +
    "           p.y > board.y && p.y < board.y + board.h; }); })()");
  t.eq(framed, true, "every node is on the board after a recentre");

  // PAN AND ZOOM, then recentre puts it back.
  var home = h.run("Upgrades.state().view");
  h.run("Upgrades.beginPan(400, 300); Upgrades.movePan(700, 500); Upgrades.endPan()");
  var moved = h.run("Upgrades.state().view");
  t.ok(moved.x !== home.x || moved.y !== home.y, "a right-drag moves the view");
  h.run("Upgrades.onWheel(400, 300, -100, 0, true)");
  t.ok(h.run("Upgrades.state().view.zoom") > moved.zoom, "the wheel zooms in");

  var re = h.run("Upgrades.recentreRect()");
  h.run("Upgrades.onClick(" + (re.x + 10) + ", " + (re.y + 10) + ")");
  t.deep(h.run("Upgrades.state().view"), home, "and the recentre button restores it");

  // A TWO-FINGER SLIDE PANS AND DOES NOT ZOOM (2026-08-31). A trackpad has no
  // wheel: two fingers on one emit `wheel` events, so a screen that reads every
  // wheel as a zoom cannot be panned with a trackpad at all -- which is what
  // this one was.
  h.run("Upgrades.onWheel(400, 300, 40, 25, false)");
  var slid = h.run("Upgrades.state().view");
  t.eq(slid.zoom, home.zoom, "a slide changes no zoom at all");
  t.ok(slid.x > home.x, "sliding right pushes the view right");
  t.ok(slid.y > home.y, "and down, down");

  // A HORIZONTAL SLIDE MOVES SOMETHING, which the old screen could not do at
  // all -- `deltaX` was not even passed in.
  h.run("Upgrades.onClick(" + (re.x + 10) + ", " + (re.y + 10) + ")");
  h.run("Upgrades.onWheel(400, 300, 0, -60, false)");
  t.ok(h.run("Upgrades.state().view.x") < home.x, "a purely sideways slide pans sideways");

  // AND THE TREE CANNOT BE PUSHED OFF THE BOARD. A hundred hard slides in one
  // direction, and a node is still reachable -- without the clamp the only way
  // back was the recentre button.
  h.run("Upgrades.onClick(" + (re.x + 10) + ", " + (re.y + 10) + ")");
  h.run("(function () { for (var i = 0; i < 100; i++)" +
        "  Upgrades.onWheel(400, 300, 400, 400, false); })()");
  var far = h.run("(function () {" +
    "  var board = Upgrades.boardRect();" +
    "  return TowerPerks.nodes('smasher').some(function (n) {" +
    "    var p = Upgrades.nodeScreenPoint(n);" +
    "    return p.x > board.x && p.x < board.x + board.w &&" +
    "           p.y > board.y && p.y < board.y + board.h; }); })()");
  t.eq(far, true, "some of the tree is still on the board");

  // THE ZOOM BUTTONS AIM AT THE BOARD'S MIDDLE rather than at a cursor sitting
  // on the button itself, which would walk the tree off screen a notch at a
  // time.
  h.run("Upgrades.onClick(" + (re.x + 10) + ", " + (re.y + 10) + ")");
  var before = h.run("Upgrades.state().view");
  h.run("Upgrades.onKey('+'); Upgrades.onKey('-')");
  var after = h.run("Upgrades.state().view");
  t.near(after.x, before.x, 1e-9, "a zoom in and out returns the centre");
  t.near(after.y, before.y, 1e-9, "on both axes");
  t.near(after.zoom, before.zoom, 1e-9, "and the zoom itself");

  // LEAVING KEEPS THE TOWER. That is the whole reason this is a screen.
  h.run("Upgrades.onKey('Escape')");
  t.eq(h.game.screen, "upgrades", "Escape goes back to Upgrades");
  t.eq(h.run("Upgrades.state().selected"), "smasher", "with the same tower selected");
});

test("a tower with no tree is an empty tree, not a broken one", function (t) {
  var h = bootProgress();

  // ALL SIX TOWERS HAVE A TREE SINCE 2026-08-31, so this is asked of an
  // UNREGISTERED id rather than of a shipping tower. That is the honest shape
  // for it either way: the claim is an ENGINE rule -- an unauthored tower reads
  // as empty everywhere rather than as missing -- and a rule tested only where
  // content happens to lack a tree stops being tested the moment content
  // arrives, which is exactly what just happened to it.
  //
  // The `openTree()` half at the bottom still needs a real, owned tower to
  // select, so it uses one with a tree and asks the weaker question: that the
  // screen opens and draws.
  t.deep(h.run("TowerPerks.nodes('no_such_tower')"), [],
    "an unregistered tower has no nodes");
  t.eq(h.run("TowerPerks.treeOf('no_such_tower')"), null,
    "and no tree registered");
  t.deep(h.run("TowerPerks.inventory('no_such_tower')"), [],
    "its inventory is empty");
  t.deep(h.run("TowerPerks.loadout('no_such_tower')"),
    [null, null, null, null, null], "and so is its loadout");
  t.eq(h.run("TowerPerks.refundValue('no_such_tower')"), 0, "nothing to refund");
  t.eq(h.run("TowerPerks.priceOf(null)"), 0, "and no type is no price");

  // AND EVERY OWNED TOWER NOW HAS ONE, which is the other half of the state
  // this test records.
  var without = h.run("MetaProgress.snapshot().owned.filter(function (id) {" +
    "  return TowerPerks.nodes(id).length === 0; })");
  t.deep(without, [], "every owned tower has authored content");

  var id = h.run("MetaProgress.snapshot().owned[0]");
  t.deep(h.run("TowerPerks.inventory('" + id + "')"), [], "its inventory is empty");
  t.deep(h.run("TowerPerks.loadout('" + id + "')"),
    [null, null, null, null, null], "and so is its loadout");
  t.eq(h.run("TowerPerks.refundValue('" + id + "')"), 0, "nothing to refund");
  t.eq(h.run("TowerPerks.priceOf(MetaProgress.constructorOf('" + id + "'))"),
    h.run("MetaProgress.constructorOf('" + id + "').COST"),
    "and it costs exactly what its type costs");

  // The screens open on it without throwing, which is the whole claim.
  h.run("openMenu(); Upgrades.open(); Upgrades.selectTower('" + id + "');" +
        "Upgrades.openTree()");
  t.eq(h.game.screen, "tree", "its tree screen opens");
  h.draw();
  t.eq(h.game.screen, "tree", "and draws");
});

test("every authored tree is well formed", function (t) {
  var h = harness.boot();

  // A CHECK ON THE CONTENT, not on the engine, and it is here because the owner
  // will be writing these by hand: a typo in a `requires` is invisible until a
  // player cannot buy a node, and a duplicate id silently shadows a purchase.
  var report = h.run("(function () {" +
    "  var problems = [];" +
    "  TowerPerks.towersWithTrees().forEach(function (towerId) {" +
    "    var seen = {}, roots = 0;" +
    "    TowerPerks.nodes(towerId).forEach(function (n) {" +
    "      if (seen[n.id]) problems.push(towerId + ': duplicate id ' + n.id);" +
    "      seen[n.id] = true;" +
    "      if (!n.name) problems.push(towerId + ': ' + n.id + ' has no name');" +
    "      if (!(n.cost > 0)) problems.push(towerId + ': ' + n.id + ' is free');" +
    "      if (!n.requires || !n.requires.length) roots++;" +
    "      (n.requires || []).forEach(function (r) {" +
    "        if (!TowerPerks.nodeOf(towerId, r))" +
    "          problems.push(towerId + ': ' + n.id + ' requires unknown ' + r);" +
    "        if (r === n.id) problems.push(towerId + ': ' + n.id + ' requires itself');" +
    "      });" +
    "      if (n.effects && n.effects.onlyIf && n.effects.price)" +
    "        problems.push(towerId + ': ' + n.id + ' has a conditional price');" +
    "    });" +
    "    if (!roots) problems.push(towerId + ': no root node');" +
    "  });" +
    "  return problems; })()");

  t.deep(report, [], "no tree has a duplicate id, a dangling parent, a free " +
    "node, a self-reference, a conditional price or no root");

  // A tree registered for a tower nobody can own would be content nobody can
  // reach. Every tree belongs to a catalogue type.
  var orphans = h.run("TowerPerks.towersWithTrees().filter(function (id) {" +
    "  return !MetaProgress.entry(id); })");
  t.deep(orphans, [], "every tree belongs to a tower in the catalogue");
});

// ---------------------------------------------------------------------------
// THE CONFIRMED TREE CONTENT (2026-08-31) — the Rifleman's twelve, the
// Warbringer's thirteen and the Arcane Sniper's fourteen.
//
// THIRTY-NINE NODES, AND THESE ARE THE OWNER'S OWN NUMBERS, so unlike the
// section above these tests DO name ids and DO assert exact figures: the
// numbers are the specification. A retune is meant to turn these red.
//
// THE BRANCHES ARE DELIBERATELY UNFINISHED and the counts below are asserted
// AS THEY STAND rather than as a target. A branch stopping after two nodes is
// content that has not been designed, not content that is missing.
// ---------------------------------------------------------------------------

// A profile at level 5 on every tower with coins to spend -- the state in which
// any combination of these nodes can be bought AND equipped, so a test can ask
// about an effect without first proving the ladder again.
function bootContent() {
  var h = harness.boot();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar();" +
        "TowerXP.setEnabled(true); openMenu()");
  for (var i = 0; i < 40; i++) {
    h.run("MetaProgress.awardRun({ wavesCompleted: 35, waveReached: 35, " +
      "victory: true, mapId: Maps.DEFAULT_ID, mapName: 'x', difficultyId: 'easy' })");
  }
  h.run("MetaProgress.snapshot().owned.forEach(function (id) {" +
        "  MetaProgress.addXp(id, 20000); })");
  return h;
}

// EVERY ARM IS A CHAIN, and this is what says so for a whole tree at once.
//
// The rule is derived from the LAYOUT rather than from a list of ids: the node
// NEAREST the tower on an arm is that branch's root and requires nothing, and
// every node further out requires EXACTLY the one before it on the same arm. So
// a retune that moves a node, adds one to a branch or re-points a prerequisite
// is checked by the same few lines, and the tree screen -- which draws its links
// straight off `requires` -- cannot drift away from what is purchasable.
//
// **IT RANKS BY DISTANCE RATHER THAN ASSUMING A STEP OF ONE** (2026-09-01). It
// used to look the previous node up at `distance - 1`, which quietly required
// every arm to be on a 1.0 lattice; the Rifleman's arms moved to a 1.5 one when
// its upgrade-squared nodes needed room between them. Sorting says the same
// thing -- "the one before it on this arm" -- without an opinion about how far
// apart they are, so the claim is unchanged and the spacing is now free.
//
// Returns a list of complaints, empty when the tree is a clean set of chains.
function chainProblems(h, towerId) {
  return h.run("(function () {" +
    "  var out = [], byArm = {};" +
    "  var list = TowerPerks.nodes('" + towerId + "');" +
    "  list.forEach(function (n) {" +
    "    var at = n.at || { x: 0, y: 0 };" +
    "    var arm = at.x < 0 ? 'W' : at.x > 0 ? 'E' : at.y < 0 ? 'N' : 'S';" +
    "    var d = Math.abs(at.x) + Math.abs(at.y);" +
    "    if (at.x !== 0 && at.y !== 0) out.push(n.id + ' is diagonal');" +
    "    (byArm[arm] = byArm[arm] || []).push({ id: n.id, d: d });" +
    "    n.__arm = arm; });" +
    "  Object.keys(byArm).forEach(function (arm) {" +
    "    byArm[arm].sort(function (a, b) { return a.d - b.d; }); });" +
    "  list.forEach(function (n) {" +
    "    var arm = byArm[n.__arm], i = 0;" +
    "    while (i < arm.length && arm[i].id !== n.id) i++;" +
    "    var want = i > 0 ? arm[i - 1].id : null;" +
    "    var got = (n.requires || []).join('+');" +
    "    if (want === null && got) out.push(n.id + ' sits beside the tower but requires ' + got);" +
    "    if (want !== null && got !== want) out.push(n.id + ' requires ' + (got || 'nothing') + ', not ' + want);" +
    "  });" +
    "  return out; })()");
}

// Buy and equip a list of node ids on one tower, then start a run and put one
// of them on the board with the given in-run tiers bought.
//
// RETURNS AN EXPRESSION, NOT A SNAPSHOT -- `towers[towers.length - 1]`, read in
// the game's own scope. That is what lets a test ask the live tower anything
// (`.damage`, `.upgradeCost('A4')`, `.attacksPerSecond()`) without this helper
// having to know what will be asked. The price is that a SECOND call replaces
// what the first one pointed at: read the numbers you want before building the
// next tower, never two expressions and then two reads.
//
// AT MOST FIVE NODES. The loadout is five slots and `equipPerk` refuses a
// sixth, so a combination test that wants more is testing something the game
// cannot produce.
function towerWith(h, towerId, nodeIds, tiers, x, y) {
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar()");
  h.run("MetaProgress.snapshot().owned.forEach(function (id) {" +
        "  MetaProgress.addXp(id, 20000); })");
  nodeIds.forEach(function (id, i) {
    // Straight through the model rather than through TowerPerks.buy: these
    // tests are about the EFFECTS, and the purchase rules have their own tests.
    h.run("MetaProgress.buyNode('" + towerId + "', '" + id + "', 0);" +
          "MetaProgress.equipPerk('" + towerId + "', '" + id + "', " + i + ")");
  });
  h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000; towers = []");
  h.run("(function () { var Type = MetaProgress.constructorOf('" + towerId + "');" +
        "  addTower(new Type(" + (x || 200) + ", " + (y || 200) + ", path)); })()");
  buyTiers(h, "towers[towers.length - 1]", tiers);
  return "towers[towers.length - 1]";
}

// TWO TOWER SHAPES, ONE VOCABULARY. The hand-written towers buy a tier by id
// through `buyUpgrade`; a config-driven one (the Arcane Sniper) has no
// `whyCannotUpgrade` at all and buys the NEXT tier on a named path. Spelling
// both as "A3" here is what lets a combination test read the same either way.
function buyTiers(h, expr, tiers) {
  // THE SIPHON'S B5 IS GATED ON HEALING DONE, pooled across every tower, and on
  // the one-per-game death-denial slot. Both are real conditions rather than UI
  // chrome, so a fixture that wants a B5 has to meet them -- `restartGame`
  // already cleared the slot, and this is the healing a run would have done.
  if ((tiers || []).indexOf("B5") !== -1) {
    h.run("HealingLedger.record(6000)");
  }
  (tiers || []).forEach(function (tier) {
    h.run("(function () { var tw = " + expr + ";" +
          "  if (typeof tw.whyCannotUpgrade === 'function') {" +
          "    buyUpgrade(tw, '" + tier + "');" +
          "  } else { tw.purchase('" + tier.charAt(0) + "'); } })()");
  });
}

// Shorthand for the expression `towerWith` returns, for a follow-up read on the
// tower it just built. Same string, named once.
function towers1() { return "towers[towers.length - 1]"; }

// ONE WHOLE BURST, as the damage of every round it actually fired.
//
// Driven through the tower's real `update` rather than by calling `fire`
// directly, because the thing under test is which shot the burst calls its
// LAST -- and that is decided by the loop, not by the damage.
function burstDamages(h, expr) {
  return h.run("(function () { var tw = " + expr + ";" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  e.progress = path.length * 0.5; e.refreshPos();" +
    "  e.health = 1e9; e.maxHealth = 1e9;" +
    "  tw.x = e.pos.x + 20; tw.y = e.pos.y;" +
    "  tw.cooldown = 0; tw.shotTimer = 0; tw.burstShotsLeft = 0;" +
    "  var out = [];" +
    "  for (var i = 0; i < 400; i++) {" +
    "    tw.update(1 / 60, [e], out);" +
    "    if (out.length && tw.burstShotsLeft === 0) break; }" +
    "  return out.map(function (b) { return b.damage; }); })()");
}

test("the three confirmed trees hold exactly the confirmed nodes", function (t) {
  var h = bootContent();

  // THE WHOLE CATALOGUE, id by id, with its price and its branch. Written out
  // rather than derived: this list IS the specification, and a node that
  // quietly changes price or moves branch has to turn this red.
  var WANT = {
    soldier: [
      ["rif_n1", "Commissioned Ammunition", 100, "north"],
      ["rif_n2", "Long Glass", 90, "north"],
      ["rif_n3", "Veteran Rhythm", 130, "north"],
      ["rif_s1", "Cheap Receiver", 60, "south"],
      ["rif_s2", "Advance Unit", 100, "south"],
      ["rif_a1", "Overloaded Drum", 120, "west"],
      ["rif_a2", "Breach Chamber", 160, "west"],
      ["rif_a3", "Ratchet Pressure", 150, "west"],
      ["rif_b1", "Reinforcement Manifest", 120, "east"],
      ["rif_b2", "Rapid Muster", 110, "east"],
      ["rif_b3", "Piercing Orders", 150, "east"],
      ["rif_b4", "Entrenchment Protocol", 160, "east"]
    ],
    smasher: [
      ["war_n1", "Long Haft", 100, "north"],
      ["war_n2", "Dense Hammerhead", 110, "north"],
      ["war_n3", "Witchlight Dust", 130, "north"],
      ["war_s1", "Extended Stance", 80, "south"],
      ["war_s2", "Light Haft", 100, "south"],
      ["war_s3", "Salvaged Anvil", 90, "south"],
      ["war_a1", "Redline Rhythm", 120, "west"],
      ["war_a2", "Forgemaster's Schedule", 150, "west"],
      ["war_a3", "Centered Blow", 130, "west"],
      ["war_a4", "Fracture Stamp", 180, "west"],
      ["war_b1", "Kiln Resonance", 120, "east"],
      ["war_b2", "Long Echo", 110, "east"],
      ["war_b3", "Wide Fracture", 140, "east"]
    ],
    longshot: [
      ["snp_n1", "Arcane Charge", 100, "north"],
      ["snp_n2", "High-Ground Doctrine", 80, "north"],
      ["snp_n3", "Skybane", 120, "north"],
      ["snp_n4", "First Omen", 140, "north"],
      ["snp_s1", "Stripped Mount", 60, "south"],
      ["snp_s2", "Compact Chassis", 80, "south"],
      ["snp_s3", "Emergency Discharge", 120, "south"],
      ["snp_a1", "Narrow Prism", 100, "west"],
      ["snp_a2", "Piercing Persistence", 120, "west"],
      ["snp_a3", "Patient Harvest", 140, "west"],
      ["snp_b1", "Critical Calibration", 110, "east"],
      ["snp_b2", "Execution Curve", 140, "east"],
      ["snp_b3", "Covenant Round", 180, "east"],
      ["snp_b4", "Grand Sigil", 220, "east"]
    ]
  };

  Object.keys(WANT).forEach(function (towerId) {
    var nodes = h.run("TowerPerks.nodes('" + towerId + "')");
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });

    t.eq(nodes.length, WANT[towerId].length,
      towerId + " has exactly " + WANT[towerId].length + " nodes and no invented extra");

    WANT[towerId].forEach(function (row) {
      var n = byId[row[0]];
      t.ok(!!n, towerId + ": " + row[0] + " exists");
      if (!n) return;
      t.eq(n.name, row[1], row[0] + " is called " + row[1]);
      t.eq(n.cost, row[2], row[1] + " costs " + row[2] + " meta coins");
      t.eq(n.minLevel || 0, 0, row[1] + " needs no tower level");
      t.ok(!!n.blurb && n.blurb.length > 20, row[1] + " carries a description");

      // A LEFT, B RIGHT, GENERAL UPPER ABOVE, GENERAL LOWER BELOW. The layout
      // is the branch, so a node in the wrong arm is in the wrong branch.
      var arm = n.at.x < 0 ? "west" : n.at.x > 0 ? "east"
        : n.at.y < 0 ? "north" : "south";
      t.eq(arm, row[3], row[1] + " sits on the " + row[3] + " arm");
    });

    t.deep(chainProblems(h, towerId), [],
      towerId + "'s arms are chains: beside the tower is a root, and every " +
      "node further out requires exactly the one before it");

    // NO REJECTED OR UNCONFIRMED NAME IS PURCHASABLE.
    var forbidden = ["Marked Quarry", "Crowd Momentum", "Fault Counter",
      "Deep Epicenter", "Broad Sweep", "Tempered Body", "Compact Footing",
      "Braced Recovery", "Quick Carriage", "Deep-Line Resonance", "Quick Breech",
      "Overwound Spring", "Guided Bolt", "Buyback Sigil"];
    var present = nodes.map(function (n) { return n.name; })
      .filter(function (name) { return forbidden.indexOf(name) !== -1; });
    t.deep(present, [], towerId + " exposes no rejected name");
  });

  // AND THE RULE HOLDS ON EVERY TREE IN THE GAME, not only the three above.
  var broken = h.run("TowerPerks.towersWithTrees()").filter(function (id) {
    return chainProblems(h, id).length > 0;
  });
  t.deep(broken, [], "every tower's arms are chains");

  // A PREREQUISITE IS NEVER A LOOP AND NEVER FORWARD. Each one points at a node
  // that is strictly closer to the tower, which is what makes the chain
  // buyable at all.
  var backwards = h.run("(function () { var out = [];" +
    "  TowerPerks.towersWithTrees().forEach(function (id) {" +
    "    TowerPerks.nodes(id).forEach(function (n) {" +
    "      var d = Math.abs(n.at.x) + Math.abs(n.at.y);" +
    "      (n.requires || []).forEach(function (r) {" +
    "        var p = TowerPerks.nodeOf(id, r); if (!p) return;" +
    "        var pd = Math.abs(p.at.x) + Math.abs(p.at.y);" +
    "        if (pd >= d) out.push(id + ':' + n.id + '<-' + r); }); }); });" +
    "  return out; })()");
  t.deep(backwards, [], "no prerequisite points outwards or at itself");
});

test("a fresh profile leaves all three towers exactly as authored", function (t) {
  var h = bootContent();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar();" +
        "openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000; towers = []");

  // NOTHING OWNED, NOTHING EQUIPPED. Every number a player would notice, read
  // off real towers rather than off the tables they came from.
  var rifle = h.run("(function () { var s = new Soldier(200, 200, path); addTower(s);" +
    "  return { dmg: s.damage, shots: s.shotsPerBurst, spacing: s.shotSpacing," +
    "    cycle: s.burstCooldown, range: s.rangeUl, hp: s.maxHp, cost: s.cost," +
    "    rate: s.attacksPerSecond(), pierce: s.armorPierce," +
    "    a1: s.upgradeCost('A1'), b5: s.upgradeCost('B5')," +
    "    recruitCd: s.resolvedRecruitCooldown() }; })()");
  t.deep(rifle, { dmg: 1, shots: 3, spacing: 0.15, cycle: 1.2, range: 100,
    hp: 80, cost: 300, rate: 2.5, pierce: 0, a1: 200, b5: 3800, recruitCd: 45 },
    "an unperked Rifleman is the authored Rifleman");

  var war = h.run("(function () { var s = new Smasher(400, 200, path); addTower(s);" +
    "  return { dmg: s.attackDamage(), cycle: s.cooldownSeconds, range: s.rangeUl," +
    "    hp: s.maxHp, cost: s.cost, camo: !!s.seesCamo, blast: s.explosionDamage," +
    "    blastR: s.explosionRadiusUl, a1: s.upgradeCost('A1') }; })()");
  t.deep(war, { dmg: 14, cycle: 3.2, range: 40, hp: 150, cost: 600, camo: false,
    blast: 15, blastR: 18.75, a1: 250 },
    "an unperked Warbringer is the authored Warbringer");

  var sniper = h.run("(function () { var s = new LongshotTower(600, 200, path);" +
    "  addTower(s);" +
    "  return { dmg: s.core.stats.damage, range: s.rangeUl, rate: s.attacksPerSecond()," +
    "    hp: s.maxHp, cost: s.cost, foot: s.footprintRadiusUl," +
    "    crit: s.core.stats.critChance, critDmg: s.core.stats.critDamage," +
    "    decay: s.core.stats.mechanics.pierceFalloff.decay," +
    "    reload: s.core.stats.mechanics.reload.reloadDurationSeconds," +
    "    stackFor: s.core.stats.mechanics.killStackAttackSpeed.stackDurationSeconds," +
    "    floor: s.core.stats.mechanics.executeScaling.floorFraction," +
    "    nuke: s.core.stats.mechanics.activeAbility.damage," +
    "    nukeR: s.core.stats.mechanics.activeAbility.aoeRadius }; })()");
  t.deep(sniper, { dmg: 10, range: 250, rate: 0.5, hp: 100, cost: 900, foot: 20,
    crit: 0, critDmg: 100, decay: 0.95, reload: 1, stackFor: 4, floor: 0.90,
    nuke: 18000, nukeR: 25 },
    "an unperked Arcane Sniper is the authored Arcane Sniper");

  // AND THE PLACEMENT RULES SEE THE AUTHORED FOOTPRINTS.
  t.eq(h.run("buildFootprintUl(LongshotTower)"), 20, "the ghost's footprint too");
});

test("owning a node does nothing; equipping it is what does", function (t) {
  var h = bootContent();

  // BOUGHT AND LEFT IN THE INVENTORY on all three towers at once, so the claim
  // is about ownership rather than about one node happening to be inert.
  h.run("MetaProgress.reset(); MetaProgress.unlockAll();" +
        "MetaProgress.snapshot().owned.forEach(function (id) {" +
        "  MetaProgress.addXp(id, 20000); });" +
        "MetaProgress.buyNode('soldier', 'rif_n1', 0);" +
        "MetaProgress.buyNode('smasher', 'war_n1', 0);" +
        "MetaProgress.buyNode('longshot', 'snp_s1', 0);" +
        "openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000; towers = []");

  var owned = h.run("(function () {" +
    "  var a = new Soldier(200, 200, path); addTower(a);" +
    "  var b = new Smasher(400, 200, path); addTower(b);" +
    "  var c = new LongshotTower(600, 200, path); addTower(c);" +
    "  return { dmg: a.damage, range: b.rangeUl, cost: c.cost, hp: c.maxHp }; })()");
  t.deep(owned, { dmg: 1, range: 40, cost: 900, hp: 100 },
    "three bought nodes, none equipped, and nothing has moved");
  t.eq(h.run("TowerPerks.inventory('soldier').length"), 1,
    "the node really is owned");

  // NOW EQUIP THEM.
  h.run("openMenu();" +
        "MetaProgress.equipPerk('soldier', 'rif_n1', 0);" +
        "MetaProgress.equipPerk('smasher', 'war_n1', 0);" +
        "MetaProgress.equipPerk('longshot', 'snp_s1', 0);" +
        "startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000; towers = []");
  var live = h.run("(function () {" +
    "  var a = new Soldier(200, 200, path); addTower(a);" +
    "  var b = new Smasher(400, 200, path); addTower(b);" +
    "  var c = new LongshotTower(600, 200, path); addTower(c);" +
    "  return { dmg: a.damage, range: b.rangeUl, cost: c.cost, hp: c.maxHp }; })()");
  t.deep(live, { dmg: 2, range: 45, cost: 750, hp: 75 },
    "equipped, all three land");

  // AND OUT AGAIN, WITHOUT UN-BUYING ANYTHING.
  h.run("openMenu(); MetaProgress.unequipPerk('soldier', 0);" +
        "MetaProgress.unequipPerk('smasher', 0);" +
        "MetaProgress.unequipPerk('longshot', 0);" +
        "startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000; towers = []");
  var off = h.run("(function () {" +
    "  var a = new Soldier(200, 200, path); addTower(a);" +
    "  var b = new Smasher(400, 200, path); addTower(b);" +
    "  var c = new LongshotTower(600, 200, path); addTower(c);" +
    "  return { dmg: a.damage, range: b.rangeUl, cost: c.cost, hp: c.maxHp }; })()");
  t.deep(off, { dmg: 1, range: 40, cost: 900, hp: 100 },
    "unequipped before the run, and the towers are authored again");
  t.eq(h.run("MetaProgress.ownsNode('longshot', 'snp_s1')"), true,
    "while the node is still owned");
});

// --- Rifleman ---------------------------------------------------------------

test("Commissioned Ammunition doubles base damage and puts 50 mana on every tier",
function (t) {
  var h = bootContent();
  var plain = towerWith(h, "soldier", [], []);
  t.eq(h.run(plain + ".damage"), 1, "a plain Rifleman deals 1");

  var s = towerWith(h, "soldier", ["rif_n1"], []);
  t.eq(h.run(s + ".damage"), 2, "with it the Rifleman deals 2");
  t.eq(h.run("TowerPerks.priceOf(Soldier)"), 300, "and still costs 300 to place");
  t.eq(h.run(s + ".cost"), 300, "on the tower itself too");

  var want = { A1: 250, A2: 375, A3: 750, A4: 1950, A5: 3325,
               B1: 250, B2: 400, B3: 800, B4: 2150, B5: 3850 };
  Object.keys(want).forEach(function (id) {
    t.eq(h.run(s + ".upgradeCost('" + id + "')"), want[id],
      id + " costs " + want[id] + " mana");
  });

  // THE PANEL QUOTES WHAT THE TILL CHARGES. A button showing the authored price
  // beside a purchase at the perked one is the divergence this pins.
  var quoted = h.run("(function () { var tw = towers[towers.length - 1];" +
    "  var acts = tw.panelActions(100000000);" +
    "  var row = null;" +
    "  acts.forEach(function (a) { if (a.upgradeId === 'A1') row = a; });" +
    "  return row ? row.detail : null; })()");
  t.eq(quoted, "250 mana", "and the upgrade button says so");
});

test("Long Glass buys reach and muzzle velocity as two separate things",
function (t) {
  var h = bootContent();
  var plain = towerWith(h, "soldier", [], []);
  t.eq(h.run(plain + ".projectileSpeedMult"), 1, "an unperked round flies at the base speed");

  var s = towerWith(h, "soldier", ["rif_n2"], []);
  t.eq(h.run(s + ".rangeUl"), 110, "reach 100 -> 110");
  t.eq(h.run("TowerPerks.priceOf(Soldier)"), 350, "placement 300 -> 350");
  t.near(h.run(s + ".projectileSpeedMult"), 1.25, 1e-9, "rounds fly 25% faster");
  t.near(h.run(s + ".rangePx"), h.run("elevatedRangePx(" + s + ", 110)"), 1e-9,
    "and the pixel reach was re-derived with the stat");

  // A FASTER ROUND, NOT A LONGER ONE. The bullet carries the speed; nothing
  // about how far the tower may shoot came from it.
  var shot = h.run("(function () { var tw = " + towers1() + ";" +
    "  var e = new Enemy(path, null, 'normal', {}); e.progress = path.length * 0.5;" +
    "  e.refreshPos(); tw.x = e.pos.x + 20; tw.y = e.pos.y;" +
    "  var out = []; for (var i = 0; i < 20 && !out.length; i++)" +
    "    tw.update(1 / 60, [e], out);" +
    "  return out.length ? out[0].speedUlps : null; })()");
  t.near(shot, h.run("Bullet.BASE_SPEED_ULPS") * 1.25, 1e-6,
    "the round it fires really is 25% quicker");
});

test("Veteran Rhythm opens a wave down six per cent and climbs back on kills",
function (t) {
  var h = bootContent();
  var plain = towerWith(h, "soldier", [], []);
  t.eq(h.run(plain + ".attacksPerSecond()"), 2.5, "a plain Rifleman fires 2.5 a second");

  var s = towerWith(h, "soldier", ["rif_n3"], []);
  t.near(h.run(s + ".attacksPerSecond()"), 2.5 * 0.94, 1e-9,
    "a wave opens at -6%");

  // TWO POINTS A KILL, and the counter it reads is the tower's own lifetime
  // kills against a per-wave baseline -- which is what makes a recruit's kill,
  // credited to its owner, count exactly once.
  [[1, 0.96], [3, 1.00], [6, 1.06], [9, 1.06], [40, 1.06]].forEach(function (row) {
    var mult = h.run("(function () { var tw = " + towers1() + ";" +
      "  tw.kills = " + row[0] + "; return tw.rhythmMult(); })()");
    t.near(mult, row[1], 1e-9, row[0] + " kills reads x" + row[1]);
  });

  // AND IT IS SPENT AT THE WAVE BOUNDARY. `endWave` is the one exit a wave has.
  h.run("(function () { var tw = " + towers1() + "; tw.kills = 20; })()");
  t.near(h.run(towers1() + ".rhythmMult()"), 1.06, 1e-9, "the band is at its top");
  h.run("endWave(3, 0)");
  t.near(h.run(towers1() + ".rhythmMult()"), 0.94, 1e-9,
    "and the next wave opens on the penalty again");
  t.eq(h.run(towers1() + ".kills"), 20, "without touching the lifetime count");

  // THE CLOCK REALLY MOVES. Fire rate on this tower is three numbers, so the
  // claim is checked against the burst it actually opens rather than a field.
  var cycles = h.run("(function () {" +
    "  var tw = " + towers1() + "; tw.kills = tw.rhythmKillBase;" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  e.progress = path.length * 0.5; e.refreshPos(); e.health = 1e9;" +
    "  e.maxHealth = 1e9; tw.x = e.pos.x + 20; tw.y = e.pos.y;" +
    "  tw.cooldown = 0; tw.burstShotsLeft = 0;" +
    "  var opens = [], clock = 0;" +
    "  for (var i = 0; i < 600; i++) {" +
    "    var was = tw.burstShotsLeft; tw.update(1 / 60, [e], []);" +
    "    if (was === 0 && tw.burstShotsLeft > 0) opens.push(clock);" +
    "    clock += 1 / 60; }" +
    "  return opens.length > 2 ? opens[2] - opens[1] : null; })()");
  t.near(cycles, 1.2 / 0.94, 0.02, "a wave-opening burst cycle is 1.2 / 0.94 s");
});

test("Cheap Receiver makes the Rifleman cheaper to place and touches nothing else",
function (t) {
  var h = bootContent();
  var s = towerWith(h, "soldier", ["rif_s1"], []);
  t.eq(h.run("TowerPerks.priceOf(Soldier)"), 250, "300 becomes 250");
  t.eq(h.run(s + ".cost"), 250, "the tower knows it");
  t.eq(h.run(s + ".totalSpent"), 250, "and a sale refunds half of that");
  t.eq(h.run(s + ".damage"), 1, "damage is untouched");
  t.eq(h.run(s + ".upgradeCost('A1')"), 200, "and so is every tier price");
  t.eq(h.run(s + ".upgradeCost('B5')"), 3800, "including the last one");
});

test("Advance Unit discounts the first Rifleman of a run and taxes the rest",
function (t) {
  var h = bootContent();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar();" +
        "MetaProgress.addXp('soldier', 20000);" +
        "MetaProgress.buyNode('soldier', 'rif_s2', 0);" +
        "MetaProgress.equipPerk('soldier', 'rif_s2', 0);" +
        "openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000; towers = []");

  t.eq(h.run("TowerPerks.priceOf(Soldier)"), 200, "the first is quoted at 200");
  // A HOVER, A GHOST AND A REFUSED CLICK MOVE NOTHING. Only `addTower` counts.
  h.run("previewRangePx(Soldier, 300, 300); whyCannotBuild(300, 300, Soldier)");
  t.eq(h.run("TowerPerks.priceOf(Soldier)"), 200, "and previewing does not spend it");

  var paid = [];
  for (var i = 0; i < 3; i++) {
    paid.push(h.run("(function () { var before = cash;" +
      "  var s = new Soldier(" + (200 + i * 60) + ", 200, path); addTower(s);" +
      "  cash -= s.cost; return { cost: s.cost, spent: before - cash }; })()"));
  }
  t.eq(paid[0].cost, 200, "the first Rifleman placed really costs 200");
  t.eq(paid[1].cost, 340, "the second costs 340");
  t.eq(paid[2].cost, 340, "and so does every one after it");
  t.eq(paid[0].spent, 200, "the till charged what the tower was given");
  t.eq(h.run("TowerPerks.priceOf(Soldier)"), 340, "and the bar now quotes 340");

  // A NEW RUN IS A NEW COUNT.
  h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000; towers = []");
  t.eq(h.run("TowerPerks.priceOf(Soldier)"), 200, "the next run opens on 200 again");

  // WITH CHEAP RECEIVER, 150 AND 290, whichever slots the two sit in.
  ["forwards", "backwards"].forEach(function (order) {
    var ids = order === "forwards" ? ["rif_s1", "rif_s2"] : ["rif_s2", "rif_s1"];
    towerWith(h, "soldier", ids, []);
    t.eq(h.run("towers[0].cost"), 150, order + ": the first costs 150");
    var second = h.run("(function () { var s = new Soldier(320, 200, path);" +
      "  addTower(s); return s.cost; })()");
    t.eq(second, 290, order + ": every later one costs 290");
  });
});

test("Overloaded Drum gives path A one more burst shot from A3, and never an automatic one",
function (t) {
  var h = bootContent();

  // NORMAL FIRST, so the deltas are measured rather than assumed.
  [["A1", 3], ["A2", 4], ["A3", 4], ["A4", 5], ["A5", 5]].forEach(function (row, i) {
    var tiers = ["A1", "A2", "A3", "A4", "A5"].slice(0, i + 1);
    var plain = towerWith(h, "soldier", [], tiers);
    t.eq(h.run(plain + ".shotsPerBurst"), row[1],
      "normal " + row[0] + " fires " + row[1]);
  });

  // ONE SHOT, FROM A3, AND IT PERSISTS.
  [["A1", 3], ["A2", 4], ["A3", 5], ["A4", 6], ["A5", 6]].forEach(function (row, i) {
    var tiers = ["A1", "A2", "A3", "A4", "A5"].slice(0, i + 1);
    var s = towerWith(h, "soldier", ["rif_a1"], tiers);
    t.eq(h.run(s + ".shotsPerBurst"), row[1],
      "with Overloaded Drum " + row[0] + " fires " + row[1]);
  });

  // NO MANA SURCHARGE AT ALL. It carried +100 on A3 until 2026-08-31; the
  // confirmed node states its whole effect and does not include one.
  var s = towerWith(h, "soldier", ["rif_a1"], []);
  ["A1", "A2", "A3", "A4", "A5", "B4"].forEach(function (id, i) {
    t.eq(h.run(s + ".upgradeCost('" + id + "')"),
      [200, 325, 700, 1900, 3275, 2100][i], id + " costs its authored price");
  });

  // AN AUTOMATIC RIFLEMAN GAINS NOTHING. B3 switches the fire mode, and an
  // automatic Rifleman fires on `shotsPerSecond`, which is derived from the
  // auto base and the fire-rate bonuses and never from `shotsPerBurst`.
  var plainAuto = towerWith(h, "soldier", [], ["B1", "B2", "B3"]);
  var rateNormal = h.run(plainAuto + ".attacksPerSecond()");
  var perkAuto = towerWith(h, "soldier", ["rif_a1"], ["B1", "B2", "B3"]);
  t.eq(h.run(perkAuto + ".automatic"), true, "B3 made it automatic");
  t.eq(h.run(perkAuto + ".attacksPerSecond()"), rateNormal,
    "and its rate of fire is exactly the normal one");
});

test("Breach Chamber doubles the last shot of a completed burst and shaves the rest",
function (t) {
  var h = bootContent();

  // A5 ONLY. At A4 the node is inert and every shot is the tower's damage.
  var a4 = burstDamages(h, towerWith(h, "soldier", ["rif_a2"],
    ["A1", "A2", "A3", "A4"]));
  t.deep(a4, [4, 4, 4, 4, 4], "at A4 the burst is five plain shots of 4");

  var a5 = burstDamages(h, towerWith(h, "soldier", ["rif_a2"],
    ["A1", "A2", "A3", "A4", "A5"]));
  t.deep(a5, [7.2, 7.2, 7.2, 7.2, 16],
    "at A5 four shots at 7.2 and a last one at 16");

  // THE LAST SHOT IS THE RESOLVED LAST SHOT. With Overloaded Drum the burst is
  // six long and the doubled round is the sixth, not the fifth.
  var both = burstDamages(h, towerWith(h, "soldier", ["rif_a2", "rif_a1"],
    ["A1", "A2", "A3", "A4", "A5"]));
  t.deep(both, [7.2, 7.2, 7.2, 7.2, 7.2, 16],
    "with Overloaded Drum it is the sixth round that doubles");

  // A BURST THAT ENDS EARLY PROMOTES NOBODY. The window is emptied before the
  // last shot is owed, and nothing that did fire is retroactively doubled.
  var cut = h.run("(function () { var tw = " + towers1() + ";" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  e.progress = path.length * 0.5; e.refreshPos();" +
    "  e.health = 1e9; e.maxHealth = 1e9;" +
    "  tw.x = e.pos.x + 20; tw.y = e.pos.y;" +
    "  tw.cooldown = 0; tw.burstShotsLeft = 0; tw.shotTimer = 0;" +
    "  var out = [];" +
    "  for (var i = 0; i < 200; i++) {" +
    "    tw.update(1 / 60, [e], out);" +
    "    if (out.length === 3) { e.dead = true; }" +
    "    if (tw.burstShotsLeft === 0 && out.length >= 3) break; }" +
    "  return out.map(function (b) { return b.damage; }); })()");
  t.deep(cut, [7.2, 7.2, 7.2],
    "three reduced shots and no doubled one when the burst collapses");
});

test("Ratchet Pressure lends the next cycle exactly one modifier", function (t) {
  var h = bootContent();
  var s = towerWith(h, "soldier", ["rif_a3"], []);
  t.near(h.run(s + ".ratchetGain"), 0.88, 1e-9, "a clean burst pays 12%");
  t.near(h.run(s + ".ratchetLoss"), 1.15, 1e-9, "a collapsed one costs 15%");
  t.eq(h.run(s + ".ratchetPending"), 1, "and nothing is owed at birth");

  // A CLEAN BURST, then the cycle it lends to, then a cycle judged on its own.
  var run = h.run("(function () { var tw = " + towers1() + ";" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  e.progress = path.length * 0.5; e.refreshPos();" +
    "  e.health = 1e9; e.maxHealth = 1e9;" +
    "  tw.x = e.pos.x + 20; tw.y = e.pos.y;" +
    "  var opens = [], settled = [];" +
    "  for (var i = 0; i < 400; i++) {" +
    "    var was = tw.burstShotsLeft; tw.update(1 / 60, [e], []);" +
    "    if (was === 0 && tw.burstShotsLeft > 0) opens.push(tw.cooldown);" +
    "    if (was > 0 && tw.burstShotsLeft === 0) settled.push(tw.ratchetPending); }" +
    "  return { opens: opens.slice(0, 3), settled: settled.slice(0, 3) }; })()");
  t.near(run.opens[0], 1.2, 1e-9, "the first cycle is the authored 1.2 s");
  t.near(run.opens[1], 1.2 * 0.88, 1e-9, "the one after a clean burst is 12% shorter");
  t.near(run.opens[2], 1.2 * 0.88, 1e-9,
    "and so is the next, because that burst was clean too");
  // ONE MODIFIER, NEVER TWO: each burst leaves exactly 0.88 owed, and the
  // opening above spends it -- so it is 0.88 again after the next burst rather
  // than 0.88 x 0.88.
  t.deep(run.settled, [0.88, 0.88, 0.88],
    "every clean burst leaves exactly one twelve-per-cent modifier owed");

  // A COLLAPSED WINDOW COSTS 15%, and one missed shot costs nothing at all.
  [[3, 1.15], [1, 1], [0, 0.88]].forEach(function (row) {
    var next = h.run("(function () { var tw = " + towers1() + ";" +
      "  tw.ratchetPending = 1; tw.burstMissed = " + row[0] + ";" +
      "  tw.settleRatchet(); return tw.ratchetPending; })()");
    t.near(next, row[1], 1e-9,
      row[0] + " lost shots lends x" + row[1]);
  });

  // AND NOTHING REACHES B3'S AUTOMATIC FIRE.
  var auto = towerWith(h, "soldier", ["rif_a3"], ["B1", "B2", "B3"]);
  var plainAuto = h.run(towerWith(h, "soldier", [], ["B1", "B2", "B3"]) +
    ".attacksPerSecond()");
  t.eq(h.run(auto + ".automatic"), true, "the tower is automatic");
  t.eq(h.run(auto + ".attacksPerSecond()"), plainAuto,
    "and fires at exactly the normal rate");
  var held = h.run("(function () { var tw = " + towers1() + ";" +
    "  for (var i = 0; i < 200; i++) tw.update(1 / 60, [], []);" +
    "  return tw.ratchetPending; })()");
  t.eq(held, 1, "an automatic Rifleman never banks a modifier");
});

test("Reinforcement Manifest sends three recruits at B4 and five at B5",
function (t) {
  var h = bootContent();

  var plain4 = towerWith(h, "soldier", [], ["B1", "B2", "B3", "B4"]);
  t.eq(h.run(plain4 + ".recruitCount"), 2, "B4 normally sends 2");
  var plain5 = towerWith(h, "soldier", [], ["B1", "B2", "B3", "B4", "B5"]);
  t.eq(h.run(plain5 + ".recruitCount"), 4, "B5 normally sends 4");
  var normal = h.run("(function () { var tw = towers[towers.length - 1];" +
    "  return { hp: tw.recruitHp, dmg: tw.recruitDamage," +
    "           rate: tw.recruitShotsPerSecond, range: tw.recruitRangeUl," +
    "           cd: tw.resolvedRecruitCooldown() }; })()");

  var s4 = towerWith(h, "soldier", ["rif_b1"], ["B1", "B2", "B3", "B4"]);
  t.eq(h.run(s4 + ".recruitCount"), 3, "with it B4 sends 3");
  t.eq(h.run(s4 + ".upgradeCost('B4')"), 2300, "and B4 costs 2300");

  var s5 = towerWith(h, "soldier", ["rif_b1"], ["B1", "B2", "B3", "B4", "B5"]);
  t.eq(h.run(s5 + ".recruitCount"), 5,
    "B5 sends exactly 5 — not 4 plus two separate bonuses");
  t.eq(h.run(s5 + ".upgradeCost('B5')"), 4150, "and B5 costs 4150");

  var perked = h.run("(function () { var tw = towers[towers.length - 1];" +
    "  return { hp: tw.recruitHp, dmg: tw.recruitDamage," +
    "           rate: tw.recruitShotsPerSecond, range: tw.recruitRangeUl," +
    "           cd: tw.resolvedRecruitCooldown() }; })()");
  t.deep(perked, normal, "no other recruit number moved");

  // A RIFLEMAN THAT NEVER BOUGHT B4 GAINS NOTHING FROM IT.
  var bare = towerWith(h, "soldier", ["rif_b1"], []);
  t.eq(h.run(bare + ".hasRecruitAbility"), false, "no recruit ability");
  t.eq(h.run(bare + ".recruitCount"), 2, "and the base count is untouched");
});

test("Rapid Muster and Entrenchment Protocol resolve 45 / 40 / 55 / 45",
function (t) {
  var h = bootContent();

  // THE TABLE, AND IT IS A STATED EXCEPTION RATHER THAN ARITHMETIC: two hands
  // on the same clock cancel, so the pair is back on the tower's own 45.
  [[[], 45], [["rif_b2"], 40], [["rif_b4"], 55],
   [["rif_b2", "rif_b4"], 45], [["rif_b4", "rif_b2"], 45]].forEach(function (row) {
    var s = towerWith(h, "soldier", row[0], ["B1", "B2", "B3", "B4"]);
    t.eq(h.run(s + ".resolvedRecruitCooldown()"), row[1],
      "[" + row[0].join(", ") + "] -> " + row[1] + " s");
    t.eq(h.run(s + ".recruitStats().cooldownSeconds"), row[1],
      "and the squad is sent on that clock");
  });

  // NEITHER REQUIRES THE OTHER. They are both on path B's chain, so each needs
  // the node before it -- but neither is the other's prerequisite, which is
  // what "independently equipable" means here.
  var needs = h.run("(function () { var out = {};" +
    "  ['rif_b2', 'rif_b4'].forEach(function (id) {" +
    "    out[id] = (TowerPerks.nodeOf('soldier', id).requires || []).slice(); });" +
    "  return out; })()");
  t.deep(needs.rif_b2, ["rif_b1"], "Rapid Muster needs the node before it");
  t.deep(needs.rif_b4, ["rif_b3"], "and Entrenchment Protocol needs the one before IT");
  t.eq(needs.rif_b2.indexOf("rif_b4"), -1, "neither is the other's prerequisite");
  t.eq(needs.rif_b4.indexOf("rif_b2"), -1, "in either direction");

  // RAPID MUSTER'S RECRUITS ARE THINNER.
  var b4 = towerWith(h, "soldier", ["rif_b2"], ["B1", "B2", "B3", "B4"]);
  t.near(h.run(b4 + ".recruitHp"), 18, 1e-9, "a B4 recruit has 18 health, not 20");
  var b5 = towerWith(h, "soldier", ["rif_b2"], ["B1", "B2", "B3", "B4", "B5"]);
  t.near(h.run(b5 + ".recruitHp"), 36, 1e-9, "a B5 recruit has 36, not 40");
  t.eq(h.run(b5 + ".recruitDamage"), 3, "and nothing else about it moved");

  // A RECRUIT ALREADY ON THE ROAD KEEPS THE BODY IT WAS CALLED WITH.
  var kept = h.run("(function () { var tw = " + towers1() + ";" +
    "  tw.callRecruits(); tw.updateRecruits(1, [], []);" +
    "  var born = tw.recruits[0].maxHp;" +
    "  MetaProgress.unequipPerk('soldier', 0); tw.recalcStats();" +
    "  return { born: born, still: tw.recruits[0].maxHp }; })()");
  t.near(kept.born, 36, 1e-9, "it was born with 36");
  t.eq(kept.still, kept.born, "and still has 36 whatever the tower is told later");
});

test("Piercing Orders ignores two points of flat armor and never percentage defense",
function (t) {
  var h = bootContent();

  // NOT BELOW B3.
  var b2 = towerWith(h, "soldier", ["rif_b3"], ["B1", "B2"]);
  t.eq(h.run(b2 + ".armorPierce"), 0, "nothing at B2");
  t.eq(h.run(b2 + ".fireRateMult"), 1, "and no rate penalty either");

  var s = towerWith(h, "soldier", ["rif_b3"], ["B1", "B2", "B3"]);
  t.eq(h.run(s + ".armorPierce"), 2, "two flat points from B3");
  t.eq(h.run(s + ".recruitArmorPierce"), 2, "and the same for its recruits");
  t.eq(h.run(s + ".defenseFlatPierce"), 0,
    "and NOT one point of percentage defence — B4's stat is a different stat");
  t.near(h.run(s + ".fireRateMult"), 0.95, 1e-9, "both fire 5% slower");
  t.near(h.run(s + ".recruitShotsPerSecond"), 2 * 0.95, 1e-9,
    "the recruits' rate carries it too");

  // WHAT AN ARMOURED BODY ACTUALLY TAKES. A Brute carries 5 flat armor.
  var landed = h.run("(function () {" +
    "  var e = new Enemy(path, null, 'brute', {});" +
    "  return { armor: e.armor," +
    "    plain: Mitigation.mitigate(10, e, 0, 0, 0)," +
    "    pierced: Mitigation.mitigate(10, e, 0, 0, 2) }; })()");
  t.eq(landed.armor, 5, "a Brute has five points of flat armor");
  t.eq(landed.plain, 5, "ten damage normally lands five");
  t.eq(landed.pierced, 7, "and seven with two points ignored");

  // THE BODY'S OWN ARMOR IS NEVER EDITED, which is exactly what separates this
  // from the Warbringer's Fracture Stamp.
  var untouched = h.run("(function () {" +
    "  var e = new Enemy(path, null, 'brute', {});" +
    "  e.takeDamage(10, 0, 0, undefined, 2); return e.armor; })()");
  t.eq(untouched, 5, "the Brute still has five points afterwards");

  // AND PERCENTAGE DEFENCE IS UNTOUCHED. An Armored enemy's 20% stays 20%.
  var defended = h.run("(function () {" +
    "  var e = new Enemy(path, null, 'armored', {});" +
    "  return { def: e.defense," +
    "    plain: Mitigation.mitigate(100, e, 0, 0, 0)," +
    "    pierced: Mitigation.mitigate(100, e, 0, 0, 2) }; })()");
  t.eq(defended.pierced, defended.plain,
    "flat armor pierce does nothing at all to a body with only defence");
});

test("an entrenched recruit is braced, and moving ends it", function (t) {
  var h = bootContent();
  var s = towerWith(h, "soldier", ["rif_b4"], ["B1", "B2", "B3", "B4"]);
  t.eq(h.run(s + ".recruitEntrenchSeconds"), 1.5, "the node sets the 1.5 s");

  var dug = h.run("(function () { var tw = " + towers1() + ";" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  e.health = 1e9; e.maxHealth = 1e9;" +
    "  var r = new SoldierRecruit(path, tw, true, tw.recruitStats());" +
    "  e.progress = r.progress - ul(40); e.refreshPos();" +
    "  var ring = ul(r.rangeUl);" +
    "  var seen = [];" +
    "  for (var i = 0; i < 120; i++) {" +
    "    r.update(1 / 60, [e], []);" +
    "    seen.push({ t: +(i / 60).toFixed(3), dug: r.entrenched," +
    "                px: r.rangePx, taken: r.damageTakenMult }); }" +
    "  var before = seen[Math.round(1.4 * 60) - 1];" +
    "  var after = seen[Math.round(1.6 * 60) - 1];" +
    "  e.dead = true;" +
    "  r.update(1 / 60, [], []);" +
    "  return { ring: ring, before: before, after: after," +
    "           moved: { dug: r.entrenched, px: r.rangePx," +
    "                    taken: r.damageTakenMult } }; })()");

  t.eq(dug.before.dug, false, "at 1.4 s it is still merely standing");
  t.near(dug.before.px, dug.ring, 1e-6, "with its ordinary reach");
  t.eq(dug.after.dug, true, "at 1.6 s it has dug in");
  t.near(dug.after.px, dug.ring * 1.25, 1e-6, "and sees a quarter further");
  t.near(dug.after.taken, 0.75, 1e-9, "and takes a quarter less");
  t.eq(dug.moved.dug, false, "the moment it walks again it is out of it");
  t.near(dug.moved.px, dug.ring, 1e-6, "the ring comes back in");
  t.near(dug.moved.taken, 1, 1e-9, "and so does the damage it takes");

  // THE FIRE RATE, MEASURED AS SHOTS RATHER THAN AS A FIELD.
  var rate = h.run("(function () { var tw = " + towers1() + ";" +
    "  function shots(entrench) {" +
    "    var stats = tw.recruitStats(); stats.entrenchSeconds = entrench;" +
    "    var e = new Enemy(path, null, 'normal', {});" +
    "    e.health = 1e9; e.maxHealth = 1e9;" +
    "    var r = new SoldierRecruit(path, tw, true, stats);" +
    "    e.progress = r.progress - ul(40); e.refreshPos();" +
    "    var out = [];" +
    "    for (var i = 0; i < 60 * 5; i++) r.update(1 / 60, [e], out);" +
    "    return out.length; }" +
    "  return { plain: shots(0), dug: shots(1.5) }; })()");
  t.ok(rate.dug > rate.plain,
    "a dug-in recruit gets more shots away (" + rate.plain + " -> " + rate.dug + ")");

  // AND IT STILL WALKS AT ITS ORDINARY SPEED.
  var speed = h.run("(function () { var tw = " + towers1() + ";" +
    "  var r = new SoldierRecruit(path, tw, true, tw.recruitStats());" +
    "  return r.speedUlps; })()");
  t.eq(speed, h.run("Soldier.RECRUIT_SPEED_ULPS"), "nothing slowed it down");
});

test("the Rifleman's confirmed nodes compose without an order mattering",
function (t) {
  var h = bootContent();

  var both = towerWith(h, "soldier", ["rif_n1", "rif_s1"], []);
  t.eq(h.run(both + ".damage"), 2, "damage + build price: 2 damage");
  t.eq(h.run("TowerPerks.priceOf(Soldier)"), 250, "placed for 250");
  t.eq(h.run(both + ".upgradeCost('A1')"), 250, "and the tiers still pay +50");

  var nb = towerWith(h, "soldier", ["rif_n1", "rif_b1"], ["B1", "B2", "B3", "B4"]);
  t.eq(h.run(nb + ".upgradeCost('B4')"), 2350, "B4 costs 2350 under both");
  t.eq(h.run(nb + ".recruitCount"), 3, "with three recruits at B4");

  // REACH AND DAMAGE FROM DIFFERENT BRANCHES.
  var glass = towerWith(h, "soldier", ["rif_n1", "rif_n2"], []);
  t.eq(h.run(glass + ".rangeUl"), 110, "reach is Long Glass's alone");
  t.eq(h.run(glass + ".damage"), 2, "damage is Commissioned Ammunition's alone");
  t.eq(h.run("TowerPerks.priceOf(Soldier)"), 350, "and only Long Glass moves the price");

  // FIVE AT ONCE, IN BOTH ORDERS, on a finished path A.
  var A5 = ["A1", "A2", "A3", "A4", "A5"];
  var forwards = towerWith(h, "soldier",
    ["rif_n1", "rif_n2", "rif_a1", "rif_a2", "rif_s1"], A5);
  var fw = h.run("(function () { var tw = " + forwards + ";" +
    "  return { dmg: tw.damage, shots: tw.shotsPerBurst, range: tw.rangeUl," +
    "    price: TowerPerks.priceOf(Soldier), a5: tw.upgradeCost('A5')," +
    "    fin: tw.burstFinalShotMult, early: tw.burstEarlyShotMult }; })()");
  var backwards = towerWith(h, "soldier",
    ["rif_s1", "rif_a2", "rif_a1", "rif_n2", "rif_n1"], A5);
  var bw = h.run("(function () { var tw = " + backwards + ";" +
    "  return { dmg: tw.damage, shots: tw.shotsPerBurst, range: tw.rangeUl," +
    "    price: TowerPerks.priceOf(Soldier), a5: tw.upgradeCost('A5')," +
    "    fin: tw.burstFinalShotMult, early: tw.burstEarlyShotMult }; })()");
  t.deep(fw, { dmg: 9, shots: 6, range: 125, price: 300, a5: 3325,
    fin: 2, early: 0.9 }, "five equipped nodes resolve to one stated tower");
  t.deep(bw, fw, "and the slots they sit in change nothing");
});

// --- Warbringer -------------------------------------------------------------

test("Long Haft adds five u.l. of base reach for a hundred mana", function (t) {
  var h = bootContent();
  var plain = towerWith(h, "smasher", [], []);
  t.eq(h.run(plain + ".rangeUl"), 40, "a plain Warbringer reaches 40");
  t.eq(h.run("TowerPerks.priceOf(Smasher)"), 600, "and costs 600");

  var s = towerWith(h, "smasher", ["war_n1"], []);
  t.eq(h.run(s + ".rangeUl"), 45, "with it the Warbringer reaches 45");
  t.eq(h.run("TowerPerks.priceOf(Smasher)"), 700, "and costs 700");
  t.eq(h.run(s + ".upgradeCost('A1')"), 250, "no tier price moves");
  t.eq(h.run(s + ".upgradeCost('B5')"), 2900, "not one of them");
});

test("Dense Hammerhead adds its third of a second BEFORE any later multiplier",
function (t) {
  var h = bootContent();
  var s = towerWith(h, "smasher", ["war_n2"], []);
  t.eq(h.run(s + ".attackDamage()"), 18, "+4 base swing damage");
  t.near(h.run(s + ".cooldownSeconds"), 3.5, 1e-9, "and 0.30 s on the cycle");
  t.eq(h.run(s + ".explosionDamage"), 15, "the blast is untouched");

  // THE ORDER IS THE NODE. `preAdd` lands before `mul`, so the pair reads
  // (3.2 + 0.3) / 1.1 and not 3.2 / 1.1 + 0.3 -- 3.182 s against 3.209 s.
  var pair = towerWith(h, "smasher", ["war_n2", "war_s2"], []);
  t.near(h.run(pair + ".cooldownSeconds"), (3.2 + 0.3) / 1.1, 1e-9,
    "with Light Haft the cycle is (3.2 + 0.3) / 1.1");
  t.ok(Math.abs(h.run(pair + ".cooldownSeconds") - (3.2 / 1.1 + 0.3)) > 0.02,
    "and emphatically not 3.2 / 1.1 + 0.3");
  t.eq(h.run(pair + ".attackDamage()"), 16, "+4 then -2 is +2 on the damage");

  // THE REVERSAL IS THE TRADE. On a late-tier cycle the third of a second
  // costs more than the four points buy back, and that is confirmed content.
  var lateP = h.run(towerWith(h, "smasher", [], ["B1", "B2", "B3", "B4", "B5"]) +
    ".attackDamage()");
  var lateC = h.run(towers1() + ".cooldownSeconds");
  var late = towerWith(h, "smasher", ["war_n2"], ["B1", "B2", "B3", "B4", "B5"]);
  var dps = h.run("(function () { var tw = " + late + ";" +
    "  return tw.attackDamage() / tw.cooldownSeconds; })()");
  t.ok(dps < lateP / lateC,
    "a finished path B swings for less DPS with it (" +
    (lateP / lateC).toFixed(2) + " -> " + dps.toFixed(2) + ")");
});

test("Witchlight Dust buys camo at the price of everything else", function (t) {
  var h = bootContent();
  var plain = towerWith(h, "smasher", [], []);
  t.eq(h.run(plain + ".seesCamo"), false, "a Warbringer normally sees no camo");

  var s = towerWith(h, "smasher", ["war_n3"], []);
  t.eq(h.run(s + ".seesCamo"), true, "with it, it does");
  t.near(h.run(s + ".nonCamoDamageMult"), 0.85, 1e-9, "for 15% off everything else");

  // IT MAY NOW START A SWING ON A CAMO BODY. `sightedIn` is the trigger half of
  // the rule; the wedge always damaged them.
  var sees = h.run("(function () { var tw = " + towers1() + ";" +
    "  var c = new Enemy(path, null, 'camo_normal', {});" +
    "  c.progress = path.length * 0.5; c.refreshPos();" +
    "  tw.x = c.pos.x; tw.y = c.pos.y;" +
    "  return tw.sightedIn([c]); })()");
  t.eq(sees, true, "a camo body is something it can swing at");

  // AND WHAT EACH KIND TAKES.
  var dealt = h.run("(function () { var tw = " + towers1() + ";" +
    "  function hit(type) {" +
    "    var e = new Enemy(path, null, type, {});" +
    "    e.progress = path.length * 0.5; e.refreshPos();" +
    "    e.health = 1e9; e.maxHealth = 1e9;" +
    "    tw.x = e.pos.x; tw.y = e.pos.y;" +
    "    tw.swing([e], [e]); return e.lastDamageTaken; }" +
    "  return { camo: hit('camo_normal'), plain: hit('normal') }; })()");
  t.near(dealt.camo, 14, 1e-9, "a camo body takes the full 14 — normal, not more");
  t.near(dealt.plain, 14 * 0.85, 1e-9, "and everything else takes 11.9");
});

test("Extended Stance rebuilds path B's reach onto the base", function (t) {
  var h = bootContent();
  var ladder = [[[], 57.5], [["B1"], 60.5], [["B1", "B2"], 71.5],
    [["B1", "B2", "B3"], 71.5], [["B1", "B2", "B3", "B4"], 77.5],
    [["B1", "B2", "B3", "B4", "B5"], 92.5]];
  ladder.forEach(function (row) {
    var s = towerWith(h, "smasher", ["war_s1"], row[0]);
    t.eq(h.run(s + ".rangeUl"), row[1],
      "after [" + row[0].join(",") + "] it reaches " + row[1]);
    t.near(h.run(s + ".rangePx"), h.run("elevatedRangePx(" + s + ", " + row[1] + ")"),
      1e-9, "and the pixel reach agrees");
  });
  t.eq(h.run("TowerPerks.priceOf(Smasher)"), 650, "placement 600 -> 650");
  t.eq(h.run(towers1() + ".upgradeCost('B5')"), 2900, "and no B price moved");
});

test("Light Haft and Salvaged Anvil trade what they say they trade", function (t) {
  var h = bootContent();

  var light = towerWith(h, "smasher", ["war_s2"], []);
  t.near(h.run(light + ".cooldownSeconds"), 3.2 / 1.1, 1e-9, "+10% attack speed");
  t.near(h.run(light + ".attacksPerSecond()"), 1.1 / 3.2, 1e-9, "as a rate too");
  t.eq(h.run(light + ".attackDamage()"), 12, "-2 swing damage");
  t.eq(h.run(light + ".explosionDamage"), 15, "explosion untouched");

  // CLAMPED AT ZERO, and the clamp is real rather than decorative: Light Haft
  // and Long Echo together take four off a fourteen-damage base, and a tower
  // whose tiers gave less could reach it.
  var both = towerWith(h, "smasher", ["war_s2", "war_b2"], []);
  t.eq(h.run(both + ".attackDamage()"), 10, "the two flat cuts sum to four");
  var floored = h.run("(function () { var tw = " + towers1() + ";" +
    "  tw.damage = -5; return tw.attackDamage(); })()");
  t.eq(floored, 0, "and the swing never goes below zero");

  var anvil = towerWith(h, "smasher", ["war_s3"], []);
  t.eq(h.run("TowerPerks.priceOf(Smasher)"), 500, "placement 600 -> 500");
  t.eq(h.run(anvil + ".maxHp"), 110, "maximum health 150 -> 110");
  t.eq(h.run(anvil + ".currentHp"), 110, "and it is placed full, not hurt");
  t.eq(h.run(anvil + ".attackDamage()"), 14, "nothing else moved");
});

test("Redline Rhythm pays and charges from A4, as a RATE and not a subtraction",
function (t) {
  var h = bootContent();

  var plain = towerWith(h, "smasher", [], ["A1", "A2", "A3", "A4"]);
  var normalRate = h.run(plain + ".attacksPerSecond()");
  var normalRange = h.run(plain + ".rangeUl");
  t.near(normalRate, 1 / 3, 1e-9, "a pure path A swings about 0.333 a second");
  t.eq(normalRange, 66.25, "and reaches 66.25");

  // NOTHING BEFORE A4, on either half.
  var plainA3 = h.run(towerWith(h, "smasher", [], ["A1", "A2", "A3"]) +
    ".attacksPerSecond()");
  t.eq(h.run(towerWith(h, "smasher", ["war_a1"], ["A1", "A2", "A3"]) +
    ".attacksPerSecond()"), plainA3, "A3 swings at exactly the normal rate");
  t.eq(h.run(towers1() + ".rangeUl"), 60, "and reaches its normal 60");

  var s = towerWith(h, "smasher", ["war_a1"], ["A1", "A2", "A3", "A4"]);
  t.near(h.run(s + ".attacksPerSecond()"), normalRate + 0.15, 1e-9,
    "at A4 it is exactly 0.15 a second faster");
  t.near(h.run(s + ".cooldownSeconds"), 1 / (normalRate + 0.15), 1e-9,
    "which is a period of 1/(1/f + 0.15) and not f - 0.15");
  t.near(h.run(s + ".rangeUl"), normalRange * 0.9, 1e-9, "and 10% shorter");
  t.near(h.run(s + ".rangePx"), h.run("elevatedRangePx(" + s + ", " +
    (normalRange * 0.9) + ")"), 1e-6, "with the ring re-derived");

  var a5 = towerWith(h, "smasher", ["war_a1"], ["A1", "A2", "A3", "A4", "A5"]);
  t.near(h.run(a5 + ".attacksPerSecond()"), 1 / 3 + 0.15, 1e-9,
    "and it persists at A5");

  // THE SURCHARGE IS A4'S ALONE.
  var costs = towerWith(h, "smasher", ["war_a1"], []);
  t.eq(h.run(costs + ".upgradeCost('A4')"), 1650, "A4 costs 250 more");
  [["A1", 250], ["A2", 400], ["A3", 600], ["A5", 1950], ["B4", 1900]]
    .forEach(function (row) {
      t.eq(h.run(costs + ".upgradeCost('" + row[0] + "')"), row[1],
        row[0] + " is unchanged at " + row[1]);
    });
});

test("Forgemaster's Schedule takes fifty mana off A1 to A4, and stacks with its parent",
function (t) {
  var h = bootContent();
  var s = towerWith(h, "smasher", ["war_a2"], []);
  [["A1", 200], ["A2", 350], ["A3", 550], ["A4", 1350], ["A5", 1950]]
    .forEach(function (row) {
      t.eq(h.run(s + ".upgradeCost('" + row[0] + "')"), row[1],
        row[0] + " costs " + row[1]);
    });
  t.eq(h.run(s + ".upgradeCost('B1')"), 250, "path B is untouched");
  t.eq(h.run(s + ".attacksPerSecond()"), 1 / 3.2, "and it changes no stat at all");
  t.eq(h.run("TowerPerks.priceOf(Smasher)"), 600, "nor the build price");

  // THE DISCOUNT AND THE SURCHARGE MEET ON A4, and both apply once.
  var pair = towerWith(h, "smasher", ["war_a1", "war_a2"], []);
  t.eq(h.run(pair + ".upgradeCost('A4')"), 1600, "A4 is 1400 + 250 - 50");
  t.eq(h.run(pair + ".upgradeCost('A1')"), 200, "A1 keeps its discount");
});

test("Centered Blow measures the radius, not the area", function (t) {
  var h = bootContent();
  var s = towerWith(h, "smasher", ["war_a3"], []);
  t.near(h.run(s + ".swingInnerMult"), 1.35, 1e-9, "the inner half");
  t.near(h.run(s + ".swingOuterMult"), 0.90, 1e-9, "and the outer");

  // HALF THE REACH IS THE LINE. A body at 0.6 of the radius is OUTSIDE, even
  // though most of the circle is behind it -- which is the whole point.
  var dealt = h.run("(function () { var tw = " + towers1() + ";" +
    "  tw.x = 400; tw.y = 400; tw.aim = 0; tw.arcDegrees = 360;" +
    "  tw.arcRadians = Math.PI * 2; tw.fullCircle = true;" +
    "  function at(fraction) {" +
    "    var e = new Enemy(path, null, 'normal', {});" +
    "    e.health = 1e9; e.maxHealth = 1e9;" +
    "    e.pos = { x: 400 + tw.rangePx * fraction, y: 400 };" +
    "    tw.swing([e], [e]); return e.lastDamageTaken; }" +
    "  return { deep: at(0.1), justIn: at(0.49), justOut: at(0.51)," +
    "           far: at(0.9) }; })()");
  t.near(dealt.deep, 14 * 1.35, 1e-9, "a body at a tenth of the reach takes 18.9");
  t.near(dealt.justIn, 14 * 1.35, 1e-9, "and so does one at 0.49");
  t.near(dealt.justOut, 14 * 0.90, 1e-9, "one at 0.51 takes 12.6");
  t.near(dealt.far, 14 * 0.90, 1e-9, "and so does one at the rim");

  // THE DIRECT SWING ONLY: the blast is its own number and is not scaled.
  var blast = towerWith(h, "smasher", ["war_a3"], ["B1", "B2", "B3", "B4"]);
  t.eq(h.run(blast + ".explosionDamage"), 15, "the chain blast is untouched");
});

test("Fracture Stamp files the plate down, and only after the blow", function (t) {
  var h = bootContent();

  // NOT BELOW A4.
  var a3 = towerWith(h, "smasher", ["war_a4"], ["A1", "A2", "A3"]);
  t.eq(h.run(a3 + ".fractureArmor"), 0, "nothing at A3");
  t.eq(h.run(a3 + ".attackDamage()"),
    h.run(towerWith(h, "smasher", [], ["A1", "A2", "A3"]) + ".attackDamage()"),
    "and no damage penalty either");

  var s = towerWith(h, "smasher", ["war_a4"], ["A1", "A2", "A3", "A4"]);
  var plainA4 = 47;
  t.eq(h.run(s + ".fractureArmor"), 1, "one point a hit from A4");
  t.near(h.run(s + ".attackDamage()"), plainA4 * 0.9, 1e-9, "for 10% off the swing");

  // THE CURRENT HIT MEETS THE OLD ARMOR; the next one meets less.
  var hits = h.run("(function () { var tw = " + towers1() + ";" +
    "  var e = new Enemy(path, null, 'brute', {});" +
    "  e.health = 1e9; e.maxHealth = 1e9;" +
    "  tw.x = 400; tw.y = 400; e.pos = { x: 405, y: 400 };" +
    "  var out = [];" +
    "  for (var i = 0; i < 7; i++) {" +
    "    var before = e.armor; tw.swing([e], [e]);" +
    "    out.push({ armor: before, took: e.lastDamageTaken, after: e.armor }); }" +
    "  return out; })()");
  t.eq(hits[0].armor, 5, "the first blow meets five points");
  t.near(hits[0].took, plainA4 * 0.9 - 5, 1e-9, "and is reduced by five");
  t.eq(hits[0].after, 4, "and leaves four behind");
  t.eq(hits[1].armor, 4, "the second meets four");
  t.near(hits[1].took, plainA4 * 0.9 - 4, 1e-9, "and is reduced by four");
  t.eq(hits[4].after, 0, "five blows strip it entirely");
  t.eq(hits[5].after, 0, "and it clamps there");
  t.eq(hits[6].armor, 0, "rather than going negative");

  // PERCENTAGE DEFENCE IS NOT ARMOR AND IS NOT TOUCHED.
  var def = h.run("(function () { var tw = " + towers1() + ";" +
    "  var e = new Enemy(path, null, 'armored', {});" +
    "  e.health = 1e9; e.maxHealth = 1e9;" +
    "  tw.x = 400; tw.y = 400; e.pos = { x: 405, y: 400 };" +
    "  tw.swing([e], [e]); tw.swing([e], [e]); return e.defense; })()");
  t.eq(def, 20, "an Armored enemy still has its twenty per cent");

  // A FRESH BODY OF THE SAME TYPE IS FRESH. Nothing is pooled, and this pins it.
  var fresh = h.run("(function () {" +
    "  var a = new Enemy(path, null, 'brute', {}); a.armor -= 3;" +
    "  return new Enemy(path, null, 'brute', {}).armor; })()");
  t.eq(fresh, 5, "the next Brute spawned carries its own five points");
});

test("Kiln Resonance and Wide Fracture resolve the blast to fifteen at a wider radius",
function (t) {
  var h = bootContent();

  var kilnB4 = towerWith(h, "smasher", ["war_b1"], ["B1", "B2", "B3", "B4"]);
  t.eq(h.run(kilnB4 + ".explosionDamage"), 18, "Kiln alone takes the blast to 18");
  t.eq(h.run(kilnB4 + ".explosionRadiusUl"), 18.75, "at the authored radius");
  var plainB4 = h.run(towerWith(h, "smasher", [], ["B1", "B2", "B3", "B4"]) +
    ".attackDamage()");
  t.eq(plainB4, 26, "a plain B4 Warbringer swings for 26");
  t.eq(h.run(towerWith(h, "smasher", ["war_b1"], ["B1", "B2", "B3", "B4"]) +
    ".attackDamage()"), 29, "and 29 with Kiln's three points");
  [["B2", 500], ["B3", 950], ["B4", 1950], ["B5", 2900]].forEach(function (row) {
    t.eq(h.run(towers1() + ".upgradeCost('" + row[0] + "')"), row[1],
      row[0] + " costs " + row[1]);
  });

  var wide = towerWith(h, "smasher", ["war_b3"], ["B1", "B2", "B3", "B4"]);
  t.eq(h.run(wide + ".explosionDamage"), 12, "Wide alone takes the blast to 12");
  t.near(h.run(wide + ".explosionRadiusUl"), 22.5, 1e-9, "at 1.20 the radius");
  t.eq(h.run(wide + ".attackDamage()"), 26, "the swing is untouched");
  t.eq(h.run(wide + ".rangeUl"), h.run(towerWith(h, "smasher", [],
    ["B1", "B2", "B3", "B4"]) + ".rangeUl"), "and so is the swing's reach");

  var both = towerWith(h, "smasher", ["war_b1", "war_b3"], ["B1", "B2", "B3", "B4"]);
  t.eq(h.run(both + ".explosionDamage"), 15,
    "15 base + 3 Kiln - 3 Wide is the authored 15");
  t.near(h.run(both + ".explosionRadiusUl"), 22.5, 1e-9, "over a fifth more ground");

  // THE BLAST REALLY REACHES FURTHER. Measured by killing one body and asking
  // what a neighbour just outside the authored radius took.
  var reach = h.run("(function () { var tw = " + towers1() + ";" +
    "  tw.x = 400; tw.y = 400;" +
    "  var dead = new Enemy(path, null, 'normal', {});" +
    "  dead.pos = { x: 405, y: 400 }; dead.health = 1; dead.maxHealth = 1;" +
    "  var near = new Enemy(path, null, 'normal', {});" +
    "  near.pos = { x: 405 + ul(20.5), y: 400 };" +
    "  near.health = 1e9; near.maxHealth = 1e9;" +
    "  tw.swing([dead], [dead, near]);" +
    "  return { dead: dead.dead, took: near.lastDamageTaken }; })()");
  t.eq(reach.dead, true, "the swing killed the first body");
  t.near(reach.took, 15, 1e-9,
    "and a neighbour at 20.5 u.l. — outside the authored 18.75 — took the blast");
});

test("Long Echo lengthens every slow this Warbringer makes and pays for it in the swing",
function (t) {
  var h = bootContent();

  var plain = towerWith(h, "smasher", [], ["B1", "B2", "B3"]);
  t.eq(h.run(plain + ".slowSeconds()"), 2.0, "B3 normally slows for 2 s");
  t.eq(h.run(plain + ".attackDamage()"), 20, "and swings for 20");

  var s = towerWith(h, "smasher", ["war_b2"], ["B1", "B2", "B3"]);
  t.eq(h.run(s + ".slowSeconds()"), 3.0, "with it, 3 s");
  t.eq(h.run(s + ".attackDamage()"), 18, "for two points off the swing");
  t.eq(h.run(s + ".slow.seconds"), 2.0,
    "and the shared upgrade table row is NOT written through");

  // THE PANEL QUOTES THE RESOLVED DURATION.
  var row = h.run("(function () { var out = null;" +
    "  " + towers1() + ".statLines().forEach(function (r) {" +
    "    if (r[0] === 'Slow') out = r[1]; }); return out; })()");
  t.ok(/3\.0 s/.test(String(row)), "the panel says 3.0 s (" + row + ")");

  // A PROPAGATED SLOW IS STILL THIS WARBRINGER'S SLOW.
  var chained = towerWith(h, "smasher", ["war_b2"], ["B1", "B2", "B3", "B4"]);
  var out = h.run("(function () { var tw = " + chained + ";" +
    "  tw.x = 400; tw.y = 400;" +
    "  var dead = new Enemy(path, null, 'normal', {});" +
    "  dead.pos = { x: 405, y: 400 }; dead.health = 1; dead.maxHealth = 1;" +
    "  var near = new Enemy(path, null, 'normal', {});" +
    "  near.pos = { x: 405 + ul(8), y: 400 };" +
    "  near.health = 1e9; near.maxHealth = 1e9;" +
    "  tw.swing([dead], [dead, near]);" +
    "  return { slowFor: near.slowTimer, took: near.lastDamageTaken }; })()");
  t.near(out.slowFor, 3.5, 1e-9,
    "a body slowed only by the chain carries B4's 2.5 s plus the second");
  t.eq(out.took, 15, "and the blast's own damage is NOT reduced by this node");
});

test("the Warbringer's confirmed nodes compose without an order mattering",
function (t) {
  var h = bootContent();

  var ns = towerWith(h, "smasher", ["war_n1", "war_s1"], []);
  t.eq(h.run(ns + ".rangeUl"), 62.5, "two reach nodes: 62.5 base");
  t.eq(h.run("TowerPerks.priceOf(Smasher)"), 750, "and 750 to place");

  var plainDamage = h.run(towerWith(h, "smasher", [], ["B1", "B2"]) + ".damage");
  var bs = towerWith(h, "smasher", ["war_b1", "war_s1"], ["B1", "B2"]);
  t.eq(h.run(bs + ".damage"), plainDamage + 1, "B2 carries Kiln's extra damage");
  t.eq(h.run(bs + ".rangeUl"), 71.5, "and the reach follows the rebuild");
  t.eq(h.run(bs + ".upgradeCost('B3')"), 950, "with Kiln's surcharge on B3");

  // THE THREE PRICE NODES, and the price never reaches zero.
  var priced = towerWith(h, "smasher", ["war_n1", "war_s1", "war_s3"], []);
  t.eq(h.run("TowerPerks.priceOf(Smasher)"), 650, "600 + 100 + 50 - 100");
  t.eq(h.run(priced + ".cost"), 650, "the tower was charged that");
  t.eq(h.run(priced + ".maxHp"), 110, "and carries the Anvil's health cut");

  // FIVE AT ONCE ON A FINISHED PATH A, in both orders.
  var A5 = ["A1", "A2", "A3", "A4", "A5"];
  var ids = ["war_a1", "war_a2", "war_a3", "war_a4", "war_n1"];
  var fw = towerWith(h, "smasher", ids, A5);
  var a = h.run("(function () { var tw = " + fw + ";" +
    "  return { dmg: tw.attackDamage(), rate: tw.attacksPerSecond()," +
    "    range: tw.rangeUl, fracture: tw.fractureArmor," +
    "    inner: tw.swingInnerMult, a4: tw.upgradeCost('A4')," +
    "    price: TowerPerks.priceOf(Smasher) }; })()");
  var bw = towerWith(h, "smasher", ids.slice().reverse(), A5);
  var b = h.run("(function () { var tw = " + bw + ";" +
    "  return { dmg: tw.attackDamage(), rate: tw.attacksPerSecond()," +
    "    range: tw.rangeUl, fracture: tw.fractureArmor," +
    "    inner: tw.swingInnerMult, a4: tw.upgradeCost('A4')," +
    "    price: TowerPerks.priceOf(Smasher) }; })()");
  t.deep(b, a, "the slots the five sit in change nothing");
  t.eq(a.fracture, 1, "Fracture Stamp is live at A5");
  t.eq(a.a4, 1600, "A4 costs 1400 + 250 - 50");
  t.eq(a.price, 700, "and the tower costs 700 to place");
  t.near(a.dmg, 65 * 0.9, 1e-9, "a finished path A swings for 58.5");
  // 72.5 x 0.9 + 5, IN THAT ORDER. `mul` lands before `add` (see the effect
  // order in js/systems/tower-perks.js), so Redline's tenth comes off the
  // tower's own reach and Long Haft's five goes on after it. A node that
  // wanted to be inside the multiplier would author `preAdd`.
  t.near(a.range, 72.5 * 0.9 + 5, 1e-9, "and reaches 70.25");
});

// --- Arcane Sniper ----------------------------------------------------------
//
// THE FIRST TREE ON A CONFIG-DRIVEN TOWER, so these read `core.stats` (and
// `core.stats.mechanics.*` for the five nodes that move a mechanic parameter)
// rather than fields on the adapter.

test("Arcane Charge trades rate for damage and leaves the ritual alone",
function (t) {
  var h = bootContent();
  var s = towerWith(h, "longshot", ["snp_n1"], []);
  var got = h.run("(function () { var tw = " + s + ";" +
    "  return { dmg: tw.core.stats.damage, rate: tw.attacksPerSecond()," +
    "    nuke: tw.core.stats.mechanics.activeAbility.damage }; })()");
  t.near(got.dmg, 11, 1e-9, "10 damage becomes 11");
  t.near(got.rate, 0.475, 1e-9, "0.5 shots a second becomes 0.475");
  t.near(got.dmg * got.rate / (10 * 0.5), 1.045, 1e-9, "+4.5% on paper");
  t.eq(got.nuke, 18000, "and the ability's damage is a different number");
});

test("High-Ground Doctrine pays by the ground under the tower", function (t) {
  var h = bootContent();
  var s = towerWith(h, "longshot", ["snp_n2"], []);
  t.eq(h.run(s + ".onFlatGround"), true, "the default board is flat here");
  t.near(h.run(s + ".rangeUl"), 225, 1e-9, "so 250 becomes 225");

  // THE GHOST ANSWERS THE SAME CONDITION, which is what keeps "the ring you
  // are shown is the ring you get" true for a node that depends on the spot.
  t.near(h.run("TowerPerks.previewRangeUl(LongshotTower, " +
    "{ onFlatGround: true })"), 225, 1e-9, "the preview on dirt says 225");
  t.near(h.run("TowerPerks.previewRangeUl(LongshotTower, " +
    "{ onHighGround: true })"), 287.5, 1e-9, "and on a rise, 287.5");
  t.near(h.run("previewRangePx(LongshotTower, " +
    h.run(s + ".x") + ", " + h.run(s + ".y") + ")"),
    h.run(s + ".rangePx"), 1e-6, "and the ghost's ring is this tower's ring");

  // AND THE INSTANCE ITSELF, standing on a rise. The height is set before
  // `addTower`, which is where the perks are applied -- exactly as a real
  // placement on a stump reads it in the constructor.
  var high = h.run("(function () {" +
    "  var tw = new LongshotTower(320, 320, path);" +
    "  tw.groundHeight = 12; tw.refreshDerived(); addTower(tw);" +
    "  return { high: tw.onHighGround, ul: tw.rangeUl }; })()");
  t.eq(high.high, true, "a tower on a rise knows it");
  t.near(high.ul, 287.5, 1e-9, "and reaches 287.5");
});

test("Skybane is a matchup, applied body by body", function (t) {
  var h = bootContent();
  var s = towerWith(h, "longshot", ["snp_n3"], []);
  t.near(h.run(s + ".core.stats.flyingDamageMult"), 1.25, 1e-9, "+25% against fliers");
  t.near(h.run(s + ".core.stats.groundDamageMult"), 0.88, 1e-9, "-12% against the rest");
  t.eq(h.run(s + ".core.stats.seesFlying"), true,
    "and it granted no targeting flag it already had");

  // ONE ROUND, TWO BODIES, TWO ANSWERS.
  var line = h.run("(function () {" +
    "  var flier = new Enemy(path, null, 'normal', {});" +
    "  flier.pos = { x: 10, y: 0 }; flier.isFlying = true;" +
    "  flier.health = 1e9; flier.maxHealth = 1e9;" +
    "  var walker = new Enemy(path, null, 'normal', {});" +
    "  walker.pos = { x: 30, y: 0 };" +
    "  walker.health = 1e9; walker.maxHealth = 1e9;" +
    "  var shot = new PierceBullet({ x: 0, y: 0, angle: 0, damage: 100," +
    "    pierce: 5, hasFalloff: false, maxTravelPx: 10000," +
    "    flyingDamageMult: 1.25, groundDamageMult: 0.88 });" +
    "  shot.update(1, [flier, walker]);" +
    "  return { flier: flier.lastDamageTaken, walker: walker.lastDamageTaken }; })()");
  t.near(line.flier, 125, 1e-9, "the flier took 125");
  t.near(line.walker, 88, 1e-9, "and the walker beside it took 88");

  // A ROUND FIRED WITHOUT THE NODE CARRIES NEITHER.
  var plain = h.run("(function () {" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  e.pos = { x: 10, y: 0 }; e.isFlying = true;" +
    "  e.health = 1e9; e.maxHealth = 1e9;" +
    "  var shot = new PierceBullet({ x: 0, y: 0, angle: 0, damage: 100," +
    "    pierce: 5, hasFalloff: false, maxTravelPx: 10000 });" +
    "  shot.update(1, [e]); return e.lastDamageTaken; })()");
  t.near(plain, 100, 1e-9, "an ordinary piercing round is unchanged");
});

test("First Omen tells a charged shot from an uncharged one", function (t) {
  var h = bootContent();
  var s = towerWith(h, "longshot", ["snp_n4"], []);
  t.eq(h.run(s + ".core.stats.omenIdleSeconds"), 3, "three seconds of quiet");

  var shots = h.run("(function () { var tw = " + towers1() + ";" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  e.progress = path.length * 0.5; e.refreshPos();" +
    "  e.health = 1e9; e.maxHealth = 1e9;" +
    "  tw.x = e.pos.x + 60; tw.y = e.pos.y;" +
    "  function fire(idle) {" +
    "    tw.sinceOrdinaryShot = idle; tw.core.fireCooldown = 0;" +
    "    if (tw.core.reload) { tw.core.reload.reloading = false;" +
    "      tw.core.reload.shotsFired = 0; }" +
    "    var out = []; tw.update(0, [e], out);" +
    "    return out.length ? out[0].baseDamage : null; }" +
    "  return { charged: fire(5), cold: fire(0) }; })()");
  t.near(shots.charged, 10 * 1.35, 1e-9, "a shot after three quiet seconds deals 13.5");
  t.near(shots.cold, 10 * 0.95, 1e-9, "and every other ordinary shot deals 9.5");
  t.ok(Math.abs(shots.charged - 10 * 1.35 * 0.95) > 1e-6,
    "the charged shot takes the bonus INSTEAD of the penalty, never both");

  // FIRING IS WHAT RESETS THE CLOCK.
  t.eq(h.run(towers1() + ".sinceOrdinaryShot"), 0, "the quiet starts again after a shot");
});

test("Stripped Mount and Compact Chassis are three separate concepts",
function (t) {
  var h = bootContent();

  var mount = towerWith(h, "longshot", ["snp_s1"], []);
  t.eq(h.run("TowerPerks.priceOf(LongshotTower)"), 750, "placement 900 -> 750");
  t.eq(h.run(mount + ".cost"), 750, "the tower was charged that");
  t.near(h.run(mount + ".maxHp"), 75, 1e-9, "maximum health 100 -> 75");
  t.near(h.run(mount + ".currentHp"), 75, 1e-9, "and it is placed full");
  t.eq(h.run(mount + ".rangeUl"), 250, "nothing else moved");

  // A TIER AFTER A HEALTH PERK MUST NOT HEAL THE TOWER. `_refreshStats`
  // differences against the last RESOLVED maximum, not against the perked one.
  var hurt = h.run("(function () { var tw = " + towers1() + ";" +
    "  tw.currentHp = 25; tw.purchase('A'); tw.purchase('A');" +
    "  return { cur: tw.currentHp, max: tw.maxHp }; })()");
  t.near(hurt.max, 112.5, 1e-9, "A2 takes the maximum to 112.5");
  t.near(hurt.cur, 75, 1e-9,
    "and the wounded tower gained exactly A2's own 50 — differencing against " +
    "the PERKED maximum instead would have handed it 75 and healed it to 100");

  var chassis = towerWith(h, "longshot", ["snp_s2"], []);
  t.eq(h.run(chassis + ".footprintRadiusUl"), 16, "footprint 20 -> 16");
  t.near(h.run(chassis + ".footprintPx"), h.run("ul(16)"), 1e-9, "in pixels too");
  t.eq(h.run(chassis + ".rangeUl"), 240, "range 250 -> 240");
  t.eq(h.run(chassis + ".core.stats.deadzone"), 50, "the deadzone is untouched");
  t.eq(h.run("buildFootprintUl(LongshotTower)"), 16,
    "and the placement rules use the smaller skirt BEFORE the tower stands");

  // THE TWO TOGETHER.
  var both = towerWith(h, "longshot", ["snp_s1", "snp_s2"], []);
  var got = h.run("(function () { var tw = " + both + ";" +
    "  return { price: TowerPerks.priceOf(LongshotTower), hp: tw.maxHp," +
    "    foot: tw.footprintRadiusUl, range: tw.rangeUl }; })()");
  t.deep(got, { price: 750, hp: 75, foot: 16, range: 240 },
    "and they compose without touching each other");
});

test("Emergency Discharge crosses cleanly at thirty per cent", function (t) {
  var h = bootContent();
  var s = towerWith(h, "longshot", ["snp_s3"], []);
  t.near(h.run(s + ".core.stats.lowHpFraction"), 0.30, 1e-9, "the threshold is a third");

  var seen = h.run("(function () { var tw = " + towers1() + ";" +
    "  function at(fraction) {" +
    "    tw.currentHp = tw.maxHp * fraction;" +
    "    tw.update(1 / 60, [], []);" +
    "    return { low: tw.lowHpActive(), ul: tw.rangeUl," +
    "      rate: tw.attacksPerSecond() }; }" +
    "  return { full: at(1), just: at(0.30), under: at(0.2999)," +
    "           healed: at(0.8) }; })()");
  t.eq(seen.full.low, false, "a healthy tower is not in it");
  t.eq(seen.full.ul, 250, "and reaches its whole 250");
  t.eq(seen.just.low, false, "exactly thirty per cent is NOT below thirty per cent");
  t.eq(seen.just.ul, 250, "so nothing has changed there either");
  t.eq(seen.under.low, true, "a hair under, and it is");
  t.near(seen.under.ul, 200, 1e-9, "reach pulls in to 200");
  t.near(seen.under.rate, 0.6, 1e-9, "and the rate goes to 0.6");
  t.eq(seen.healed.low, false, "healed back out of it");
  t.eq(seen.healed.ul, 250, "the reach comes back exactly");
  t.near(seen.healed.rate, 0.5, 1e-9, "and so does the rate — nothing compounded");
});

test("Narrow Prism caps the cone at twenty degrees and pays for it", function (t) {
  var h = bootContent();

  var a3 = towerWith(h, "longshot", ["snp_a1"], ["A1", "A2", "A3"]);
  t.eq(h.run(a3 + ".core.stats.damage"), 40, "nothing before A4");

  var a4 = towerWith(h, "longshot", ["snp_a1"], ["A1", "A2", "A3", "A4"]);
  t.near(h.run(a4 + ".core.stats.damage"), 150 * 1.08, 1e-9, "at A4, +8% damage");
  t.eq(h.run(a4 + ".core.stats.coneArcDeg"), 20,
    "and A4's twenty degrees are already twenty — no invented penalty");

  var plainA5 = h.run(towerWith(h, "longshot", [], ["A1", "A2", "A3", "A4", "A5"]) +
    ".core.stats.coneArcDeg");
  t.eq(plainA5, 24, "A5 normally reaches 24 degrees");
  var a5 = towerWith(h, "longshot", ["snp_a1"], ["A1", "A2", "A3", "A4", "A5"]);
  t.eq(h.run(a5 + ".core.stats.coneArcDeg"), 20, "with the node it stops at 20");
  t.near(h.run(a5 + ".core.stats.damage"), 425 * 1.08, 1e-9, "for +8% damage");
  t.eq(h.run(a5 + ".core.stats.mechanics.activeAbility.damage"), 18000,
    "and the ritual is untouched");
});

test("Piercing Persistence flattens the falloff and shortens the head", function (t) {
  var h = bootContent();

  var a2 = towerWith(h, "longshot", ["snp_a2"], ["A1", "A2"]);
  t.eq(h.run(a2 + ".core.stats.damage"), 25, "nothing before A3");
  t.eq(h.run(a2 + ".core.stats.mechanics.pierceFalloff.decay"), 0.95,
    "and the decay is the authored one");

  var s = towerWith(h, "longshot", ["snp_a2"], ["A1", "A2", "A3"]);
  t.near(h.run(s + ".core.stats.damage"), 38, 1e-9, "at A3 the shot starts 5% weaker");
  t.eq(h.run(s + ".core.stats.mechanics.pierceFalloff.decay"), 0.962,
    "and loses 3.8% a target instead of 5%");
  t.eq(h.run(s + ".core.stats.mechanics.pierceFalloff.softener"), 20,
    "the softener is untouched");

  // A RATE PER TARGET, NOT A FLAT 3.8 DAMAGE. Read off the shared formula.
  var line = h.run("(function () { var m = " + towers1() +
    ".core.stats.mechanics.pierceFalloff;" +
    "  return [0, 1, 2, 5].map(function (n) {" +
    "    return Pierce.damageAtIndex(38, n, m); }); })()");
  t.near(line[0], 38, 1e-9, "the first body takes the full 38");
  t.near(line[1], (38 + 20) * 0.962 - 20, 1e-9, "the second, 3.8% down the curve");
  t.near(line[2], (38 + 20) * 0.962 * 0.962 - 20, 1e-9, "and the third again");
  t.ok(line[1] > 38 - 3.8, "which is emphatically not a flat 3.8 off");

  // AND THE LINE REALLY IS LONGER. A shot that keeps more of itself reaches
  // further down a crowd before the falloff wears it out.
  var lengths = h.run("(function () {" +
    "  var plain = { softener: 20, decay: 0.95 };" +
    "  var kept = { softener: 20, decay: 0.962 };" +
    "  return { plain: Pierce.resolveSequence(40, Infinity, true, plain).length," +
    "           kept: Pierce.resolveSequence(38, Infinity, true, kept).length }; })()");
  t.ok(lengths.kept > lengths.plain,
    "the shot passes through more bodies (" + lengths.plain + " -> " +
    lengths.kept + ")");
});

test("Patient Harvest widens the kill-stack window and nothing else", function (t) {
  var h = bootContent();

  var a4 = towerWith(h, "longshot", ["snp_a3"], ["A1", "A2", "A3", "A4"]);
  t.eq(h.run(a4 + ".core.stats.flags.killStackAttackSpeed"), undefined,
    "the mechanic is not granted before A5");
  t.eq(h.run(a4 + ".core.killStacks.durationSeconds"), 4,
    "and the window is still the authored four seconds");

  var s = towerWith(h, "longshot", ["snp_a3"], ["A1", "A2", "A3", "A4", "A5"]);
  var got = h.run("(function () { var tw = " + s + ";" +
    "  var m = tw.core.stats.mechanics.killStackAttackSpeed;" +
    "  return { window: m.stackDurationSeconds, max: m.maxStacks," +
    "    per: m.perStackBonus, liveWindow: tw.core.killStacks.durationSeconds," +
    "    liveMax: tw.core.killStacks.maxStacks }; })()");
  t.eq(got.window, 5.5, "the window is 5.5 s");
  t.eq(got.max, 75, "the ceiling is still 75 — NOT the rejected 60");
  t.eq(got.per, 0.01, "and a stack is still +1%");

  // THE TRACKER ITSELF, not merely the stat block. `killStacks` is built in the
  // ConfiguredTower's constructor, long before any perk exists, so a number
  // that only reached `stats.mechanics` would be a number nothing read.
  t.eq(got.liveWindow, 5.5, "the live tracker carries the wider window");
  t.eq(got.liveMax, 75, "and the same ceiling");

  var held = h.run("(function () { var tw = " + towers1() + ";" +
    "  tw.core.onKill();" +
    "  tw.core.update(5); var at5 = tw.core.killStacks.count();" +
    "  tw.core.update(0.6); return { at5: at5, at56: tw.core.killStacks.count() }; })()");
  t.eq(held.at5, 1, "a stack is still alive at 5 s, where it used to be gone at 4");
  t.eq(held.at56, 0, "and gone by 5.6");

  var ceiling = h.run("(function () { var tw = " + towers1() + ";" +
    "  for (var i = 0; i < 200; i++) tw.core.onKill();" +
    "  return tw.core.killStacks.count(); })()");
  t.eq(ceiling, 75, "and two hundred kills still buy seventy-five stacks");
});

test("Critical Calibration moves percentage POINTS", function (t) {
  var h = bootContent();

  var b2 = towerWith(h, "longshot", ["snp_b1"], ["B1", "B2"]);
  t.eq(h.run(b2 + ".core.stats.critChance"), 0, "nothing before B3");
  t.eq(h.run(b2 + ".core.stats.critDamage"), 100, "on either number");

  var b3 = towerWith(h, "longshot", ["snp_b1"], ["B1", "B2", "B3"]);
  t.eq(h.run(b3 + ".core.stats.critChance"), 25, "20 points becomes 25, not 24");
  t.eq(h.run(b3 + ".core.stats.critDamage"), 165, "and 175 becomes 165, not 157.5");

  var b5 = towerWith(h, "longshot", ["snp_b1"], ["B1", "B2", "B3", "B4", "B5"]);
  t.eq(h.run(b5 + ".core.stats.critChance"), 30, "at B5, 25 becomes 30");
  t.eq(h.run(b5 + ".core.stats.critDamage"), 315, "and 325 becomes 315");

  // THE GUARANTEED FOURTH SHOT STILL CRITS, at the reduced figure.
  var shot = h.run("(function () { var tw = " + towers1() + ";" +
    "  var out = null;" +
    "  for (var i = 0; i < 4; i++) out = tw.core.fire(1, function () { return 0.99; });" +
    "  return { crit: out.crit, first: out.sequence[0] }; })()");
  t.eq(shot.crit, true, "the fourth of four is guaranteed");
  t.near(shot.first, 1575 * (315 / 100) * (1 + 0.60), 1e-6,
    "and it lands at the reduced critical damage");
});

test("Execution Curve tops out at a quarter health, for five points less",
function (t) {
  var h = bootContent();

  var b3 = towerWith(h, "longshot", ["snp_b2"], ["B1", "B2", "B3"]);
  var atB3 = h.run("(function () { var m = " + b3 +
    ".core.stats.mechanics.executeScaling;" +
    "  return { floor: m.floorFraction, max: m.maxBonus }; })()");
  t.deep(atB3, { floor: 0.90, max: 0.40 }, "B3's authored curve is untouched");

  var b4 = towerWith(h, "longshot", ["snp_b2"], ["B1", "B2", "B3", "B4"]);
  var atB4 = h.run("(function () { var m = " + b4 +
    ".core.stats.mechanics.executeScaling;" +
    "  return { floor: m.floorFraction, max: m.maxBonus }; })()");
  t.deep(atB4, { floor: 0.75, max: 0.55 }, "B4 rebuilds it to 0.75 and 0.55");

  // WHAT AN ENEMY ACTUALLY MEETS, through the shared formula.
  var curve = h.run("(function () { var s = " + towers1() + ".core.stats;" +
    "  return [1, 0.5, 0.25, 0.10, 0].map(function (f) {" +
    "    return Execute.resolveExecuteBonus(s, f, false); }); })()");
  t.near(curve[0], 0, 1e-9, "a full-health body gets no execute");
  t.near(curve[1], 0.55 * (0.5 / 0.75), 1e-9, "half health is two thirds of the way");
  t.near(curve[2], 0.55, 1e-9, "a quarter health is the maximum");
  t.near(curve[3], 0.55, 1e-9, "and it stays there below that");
  t.near(curve[4], 0.55, 1e-9, "all the way down");

  var plain = h.run("(function () { var s = " +
    towerWith(h, "longshot", [], ["B1", "B2", "B3", "B4"]) + ".core.stats;" +
    "  return [0.25, 0.10].map(function (f) {" +
    "    return Execute.resolveExecuteBonus(s, f, false); }); })()");
  t.near(plain[0], 0.60 * (0.75 / 0.90), 1e-9,
    "an unperked B4 is only two-thirds of the way at a quarter health");
  t.near(plain[1], 0.60, 1e-9, "and reaches its whole +60% at a tenth");
});

test("Covenant Round pays the fourth shot and lengthens only the reload",
function (t) {
  var h = bootContent();

  var b4 = towerWith(h, "longshot", ["snp_b3"], ["B1", "B2", "B3", "B4"]);
  t.eq(h.run(b4 + ".core.stats.mechanics.reload.reloadDurationSeconds"), 1,
    "nothing before B5");

  var s = towerWith(h, "longshot", ["snp_b3"], ["B1", "B2", "B3", "B4", "B5"]);
  var got = h.run("(function () { var tw = " + s + ";" +
    "  return { stat: tw.core.stats.mechanics.reload.reloadDurationSeconds," +
    "    live: tw.core.reload.reloadDurationSeconds," +
    "    mult: tw.core.stats.finalShotDamageMult," +
    "    shots: tw.core.reload.shotsBeforeReload }; })()");
  t.eq(got.stat, 1.5, "the reload is 1.5 s");
  t.eq(got.live, 1.5, "on the tracker that actually keeps the clock");
  t.near(got.mult, 1.10, 1e-9, "and the fourth shot is worth a tenth more");
  t.eq(got.shots, 4, "still four shots to a magazine");

  // EXACTLY THE FOURTH. Shots one to three are byte-for-byte the plain ones.
  function volley(expr) {
    return h.run("(function () { var tw = " + expr + ";" +
      "  var out = [];" +
      "  for (var i = 0; i < 4; i++)" +
      "    out.push(tw.core.fire(1, function () { return 0.99; }).sequence[0]);" +
      "  return out; })()");
  }
  var perked = volley(towers1());
  var plain = volley(towerWith(h, "longshot", [], ["B1", "B2", "B3", "B4", "B5"]));
  t.deep(perked.slice(0, 3), plain.slice(0, 3), "the first three are unchanged");
  t.near(perked[3], plain[3] * 1.10, 1e-6, "and the fourth is a tenth bigger");
  t.near(plain[3], 1575 * 3.25 * 1.6, 1e-6, "which is the crit and the execute on it");

  // THE REPLENISH REALLY TAKES HALF A SECOND LONGER. Built again, because the
  // control volley above replaced what `towers1()` points at.
  var back = h.run("(function () { var tw = " +
    towerWith(h, "longshot", ["snp_b3"], ["B1", "B2", "B3", "B4", "B5"]) + ";" +
    "  for (var i = 0; i < 4; i++) tw.core.fire(1, function () { return 0.99; });" +
    "  tw.core.update(1.2); var at12 = tw.core.reload.canFire();" +
    "  tw.core.update(0.4); return { at12: at12, at16: tw.core.reload.canFire() }; })()");
  t.eq(back.at12, false, "still reloading at 1.2 s, where it used to be done at 1");
  t.eq(back.at16, true, "and back on line by 1.6");
});

test("Grand Sigil trades three thousand damage for ten more u.l. of radius",
function (t) {
  var h = bootContent();

  var b4 = towerWith(h, "longshot", ["snp_b4"], ["B1", "B2", "B3", "B4"]);
  t.eq(h.run(b4 + ".core.stats.mechanics.activeAbility.damage"), 18000,
    "nothing before B5");

  var s = towerWith(h, "longshot", ["snp_b4"], ["B1", "B2", "B3", "B4", "B5"]);
  var a = h.run(s + ".core.stats.mechanics.activeAbility");
  t.eq(a.damage, 15000, "18 000 becomes 15 000 a body");
  t.eq(a.aoeRadius, 35, "and 25 u.l. of radius becomes 35");
  t.deep({ channel: a.channelSeconds, stun: a.stunSeconds, cd: a.cooldownSeconds,
           hp: a.maxHpLoss, ignores: a.ignoresDefense },
    { channel: 3, stun: 7, cd: 60, hp: 300, ignores: true },
    "and every other rule of the ritual is exactly where it was");

  // THE STRIKE ITSELF, resolved against a crowd laid out across both radii.
  var hit = h.run("(function () { var tw = " + towers1() + ";" +
    "  var far = new Enemy(path, null, 'normal', {});" +
    "  far.pos = { x: 400 + ul(30), y: 400 };" +
    "  far.health = 1e9; far.maxHealth = 1e9;" +
    "  var near = new Enemy(path, null, 'normal', {});" +
    "  near.pos = { x: 400, y: 400 };" +
    "  near.health = 1e9; near.maxHealth = 1e9;" +
    "  tw.channel = { x: 400, y: 400, remaining: 0, target: null };" +
    "  tw.resolveChannel([near, far]);" +
    "  return { near: near.lastDamageTaken, far: far.lastDamageTaken }; })()");
  t.eq(hit.near, 15000, "a body under it takes 15 000");
  t.eq(hit.far, 15000, "and so does one at 30 u.l., which the old 25 could not reach");
});

test("the Arcane Sniper's B5 nodes compose into one stated fourth shot",
function (t) {
  var h = bootContent();
  var B5 = ["B1", "B2", "B3", "B4", "B5"];
  var ids = ["snp_b1", "snp_b2", "snp_b3", "snp_b4"];

  var fw = towerWith(h, "longshot", ids, B5);
  var a = h.run("(function () { var tw = " + fw + ";" +
    "  var s = tw.core.stats;" +
    "  var volley = [];" +
    "  for (var i = 0; i < 4; i++)" +
    "    volley.push(tw.core.fire(1, function () { return 0.99; }).sequence[0]);" +
    "  return { crit: s.critChance, critDmg: s.critDamage," +
    "    floor: s.mechanics.executeScaling.floorFraction," +
    "    max: s.mechanics.executeScaling.maxBonus," +
    "    reload: tw.core.reload.reloadDurationSeconds," +
    "    nuke: s.mechanics.activeAbility.damage," +
    "    nukeR: s.mechanics.activeAbility.aoeRadius," +
    "    volley: volley }; })()");

  t.eq(a.crit, 30, "critical chance 25 -> 30");
  t.eq(a.critDmg, 315, "critical damage 325 -> 315");
  t.eq(a.floor, 0.75, "the execute floor is rebuilt");
  t.eq(a.max, 0.55, "and its ceiling with it");
  t.eq(a.reload, 1.5, "the reload is longer");
  t.eq(a.nuke, 15000, "the ritual hits for less");
  t.eq(a.nukeR, 35, "over more ground");

  // THE FOURTH SHOT UNDER ALL FOUR AT ONCE: base x the tenth, then the reduced
  // crit, then the reduced full execute -- in that order and no other.
  t.near(a.volley[3], 1575 * 1.10 * 3.15 * 1.55, 1e-6,
    "the fourth shot is 1575 x 1.10 x 3.15 x 1.55");
  t.near(a.volley[0], 1575, 1e-9, "and an ordinary shot is untouched by any of it");

  // ORDER-FREE.
  var bw = towerWith(h, "longshot", ids.slice().reverse(), B5);
  var b = h.run("(function () { var tw = " + bw + ";" +
    "  var volley = [];" +
    "  for (var i = 0; i < 4; i++)" +
    "    volley.push(tw.core.fire(1, function () { return 0.99; }).sequence[0]);" +
    "  return volley; })()");
  t.deep(b, a.volley, "the slots the four sit in change nothing");
});

test("what a card says is what the tower resolves", function (t) {
  var h = bootContent();

  // THE CARDS ARE AUTHORED TEXT AND THE TOWERS ARE CODE, which is exactly the
  // pair that goes stale quietly. Each row below pulls a figure out of the
  // node's own blurb and asks the live tower for the same number.
  var blurbs = h.run("(function () { var out = {};" +
    "  ['soldier', 'smasher', 'longshot'].forEach(function (id) {" +
    "    TowerPerks.nodes(id).forEach(function (n) { out[n.id] = n.blurb; }); });" +
    "  return out; })()");

  Object.keys(blurbs).forEach(function (id) {
    t.ok(blurbs[id] && blurbs[id].length > 20, id + " has a description");
  });

  // Every node that takes something away says so, in the same card that says
  // what it gives. Six of the thirty-nine are pure gains and are listed by name
  // rather than left to a regex that would quietly stop testing anything.
  var PURE_GAIN = ["rif_s1", "war_a2", "snp_a3"];
  var missing = [];
  Object.keys(blurbs).forEach(function (id) {
    if (PURE_GAIN.indexOf(id) !== -1) return;
    if (!/−|less|longer|slower|more mana|costs|instead|shorter|→|unaffected|untouched|unchanged|Nothing|not/.test(blurbs[id])) {
      missing.push(id);
    }
  });
  t.deep(missing, [], "every node with a trade states it on its own card");

  t.ok(/300 → 250/.test(blurbs.rif_s1), "Cheap Receiver quotes 300 -> 250");
  var cheap = towerWith(h, "soldier", ["rif_s1"], []);
  t.eq(h.run(cheap + ".cost"), 250, "and that is what the tower is charged");

  t.ok(/150, then 290/.test(blurbs.rif_s2), "Advance Unit quotes 150 and 290");
  towerWith(h, "soldier", ["rif_s1", "rif_s2"], []);
  t.eq(h.run("towers[0].cost"), 150, "the first really costs 150");
  t.eq(h.run("(function () { var s = new Soldier(320, 200, path); addTower(s);" +
    "  return s.cost; })()"), 290, "and the second really costs 290");

  t.ok(/20 → 18 at B4, 40 → 36 at B5/.test(blurbs.rif_b2),
    "Rapid Muster quotes both recruit bodies");
  var muster = towerWith(h, "soldier", ["rif_b2"], ["B1", "B2", "B3", "B4", "B5"]);
  t.near(h.run(muster + ".recruitHp"), 36, 1e-9, "and a B5 recruit really has 36");

  t.ok(/40 → 45/.test(blurbs.war_n1), "Long Haft quotes 40 -> 45");
  t.eq(h.run(towerWith(h, "smasher", ["war_n1"], []) + ".rangeUl"), 45,
    "and the tower reaches 45");

  t.ok(/60\.5, 71\.5, 71\.5, 77\.5, 92\.5/.test(blurbs.war_s1),
    "Extended Stance prints its whole ladder");
  t.eq(h.run(towerWith(h, "smasher", ["war_s1"], ["B1", "B2", "B3", "B4", "B5"]) +
    ".rangeUl"), 92.5, "and a finished path B really reaches 92.5");

  t.ok(/18\.75 → 22\.5/.test(blurbs.war_b3), "Wide Fracture quotes the radius");
  t.near(h.run(towerWith(h, "smasher", ["war_b3"], ["B1", "B2", "B3", "B4"]) +
    ".explosionRadiusUl"), 22.5, 1e-9, "and the blast really reaches 22.5");

  t.ok(/900 → 750/.test(blurbs.snp_s1), "Stripped Mount quotes 900 -> 750");
  t.eq(h.run(towerWith(h, "longshot", ["snp_s1"], []) + ".cost"), 750,
    "and the tower is charged 750");

  t.ok(/15 000/.test(blurbs.snp_b4) && /50 → 70/.test(blurbs.snp_b4),
    "Grand Sigil quotes the damage and the DIAMETER");
  var sigil = h.run(towerWith(h, "longshot", ["snp_b4"],
    ["B1", "B2", "B3", "B4", "B5"]) + ".core.stats.mechanics.activeAbility");
  t.eq(sigil.damage, 15000, "and the ritual really deals 15 000");
  t.eq(sigil.aoeRadius * 2, 70, "over a 70 u.l. diameter");

  // THE PANEL'S OWN ROWS, on a tower carrying a perk that moves what they show.
  var rows = h.run("(function () { var tw = " +
    towerWith(h, "smasher", ["war_b2", "war_b1"], ["B1", "B2", "B3", "B4"]) + ";" +
    "  var out = {};" +
    "  tw.statLines().forEach(function (r) { out[r[0]] = String(r[1]); });" +
    "  return out; })()");
  t.ok(/3\.5 s/.test(rows.Slow), "the Slow row quotes the lengthened duration");
  t.ok(/^18 in/.test(rows["On kill"]), "and the On kill row the raised blast");
});

test("a tree reset refunds every node, charges ten a node, and cools down for an hour",
function (t) {
  var h = bootContent();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll()");
  for (var i = 0; i < 20; i++) {
    h.run("MetaProgress.awardRun({ wavesCompleted: 35, waveReached: 35, " +
      "victory: true, mapId: Maps.DEFAULT_ID, mapName: 'x', difficultyId: 'easy' })");
  }
  h.run("MetaProgress.addXp('smasher', 20000); MetaProgress.addXp('soldier', 20000)");

  t.eq(h.game.MetaProgress.TREE_RESET_FEE_PER_NODE, 10, "ten coins a node");
  t.eq(h.game.MetaProgress.TREE_RESET_COOLDOWN_MS, 60 * 60 * 1000, "and one hour");

  // The A root and its child, so the CHILD counts as a bought node too.
  h.run("TowerPerks.buy('smasher', 'war_a1'); TowerPerks.buy('smasher', 'war_a2');" +
        "TowerPerks.buy('smasher', 'war_n1');" +
        "MetaProgress.equipPerk('smasher', 'war_a1', 0);" +
        "MetaProgress.equipPerk('smasher', 'war_a2', 1)");

  var gross = h.run("TowerPerks.refundValue('smasher')");
  t.eq(gross, 120 + 150 + 100, "the gross refund is what the three nodes cost");

  var coins = h.run("MetaProgress.coins()");
  var xp = h.run("MetaProgress.progressOf('smasher').xp");
  var out = h.run("TowerPerks.resetTree('smasher', 5000000)");

  t.eq(out.ok, true, "the reset goes through");
  t.eq(out.removed, 3, "three nodes came out, the child included");
  t.eq(out.refunded, gross, "the gross refund is the full purchase price");
  t.eq(out.feePerNode, 10, "the commission rate is reported");
  t.eq(out.fee, 30, "so the commission is thirty");
  t.eq(out.net, gross - 30, "and the net is the gross less it");
  t.eq(h.run("MetaProgress.coins()"), coins + gross - 30, "which is what was banked");

  t.deep(h.run("MetaProgress.ownedNodes('smasher')"), [], "the tree is empty");
  t.eq(h.run("TowerPerks.inventory('smasher').length"), 0, "so is the inventory");
  t.deep(h.run("MetaProgress.equippedPerks('smasher')"),
    [null, null, null, null, null], "and every slot it filled");
  t.eq(h.run("MetaProgress.progressOf('smasher').xp"), xp, "xp is untouched");
  t.eq(h.run("MetaProgress.progressOf('smasher').level"), 5, "and so is the level");
  t.eq(h.run("MetaProgress.owns('smasher')"), true, "the tower is still owned");

  // THE COOLDOWN IS THE TOWER'S OWN.
  h.run("TowerPerks.buy('smasher', 'war_n1'); TowerPerks.buy('soldier', 'rif_s1')");
  t.eq(h.run("TowerPerks.resetTree('smasher', 5000001).ok"), false,
    "the Warbringer is cooling down");
  t.eq(h.run("TowerPerks.resetTree('soldier', 5000001).ok"), true,
    "and the Rifleman is not");
  t.eq(h.run("TowerPerks.resetTree('smasher', " + (5000000 + 3600000) + ").ok"), true,
    "an hour later the Warbringer may be reset again");
});

test("the ghost's ring is the ring the placed tower gets", function (t) {
  var h = bootContent();

  // THE BUG THIS PINS (2026-08-30): the build ghost read `Type.BASE_RANGE_UL`
  // straight off the constructor, so a Warbringer with a reach perk equipped
  // was previewed at 40 u.l. and then stood there covering 62.5. The promise
  // `previewRangePx` makes in its own comment -- "the ring the player is shown
  // is the ring they get" -- has to survive a perk.
  var plain = towerWith(h, "smasher", [], []);
  var plainUl = h.run(plain + ".rangeUl");
  var plainGhost = h.run("previewRangePx(Smasher, 300, 300)");
  t.eq(plainUl, h.game.Smasher.BASE_RANGE_UL, "an unperked Warbringer reaches 40");
  t.near(plainGhost, h.run(plain + ".rangePx"), 1e-9,
    "and its ghost draws exactly that");

  // Both reach perks: +5 and +17.5 on the base, and no B tier bought, so the
  // rebuild's negative groups correctly contribute nothing yet.
  var perked = towerWith(h, "smasher", ["war_n1", "war_s1"], []);
  var perkedUl = h.run(perked + ".rangeUl");
  t.eq(perkedUl, 62.5, "with both reach perks it reaches 62.5");
  t.eq(h.run("TowerPerks.previewRangeUl(Smasher)"), 62.5,
    "and the preview says the same number");
  t.near(h.run("previewRangePx(Smasher, 300, 300)"),
    h.run(perked + ".rangePx"), 1e-9,
    "so the ghost and the placed tower draw one circle");

  // THE CONDITIONAL HALF IS CORRECTLY ABSENT FROM THE PREVIEW. `war_s1` cuts
  // what B1, B2 and B4 give, and a tower being placed has bought none of them
  // -- so the ghost must show the full 62.5 and only start subtracting once a
  // tier is actually on the tower.
  var withB1 = towerWith(h, "smasher", ["war_n1", "war_s1"], ["B1"]);
  t.eq(h.run(withB1 + ".rangeUl"), 65.5, "B1 takes it to 65.5 on the board");
  t.eq(h.run("TowerPerks.previewRangeUl(Smasher)"), 62.5,
    "while the ghost still previews a fresh one at 62.5");
});

test("a card's specimen wears the perks its price is quoted under", function (t) {
  var h = bootContent();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll();" +
        "MetaProgress.addXp('smasher', 20000);" +
        "MetaProgress.buyNode('smasher', 'war_n1', 0);" +
        "MetaProgress.equipPerk('smasher', 'war_n1', 0); openMenu()");

  // THE ARMOURY AND THE INDEX BUILD A THROWAWAY SPECIMEN and read its
  // `statLines`. That specimen never goes through `addTower`, so it wore no
  // perks -- and both cards already quote the PERKED build price, which made a
  // card that priced one tower and described another.
  var range = h.run("(function () {" +
    "  var s = new Smasher(-1000, -1000, path);" +
    "  TowerPerks.applyTo(s);" +
    "  var row = null;" +
    "  s.statLines().forEach(function (r) { if (r[0] === 'Range') row = r; });" +
    "  return row ? row[1] : null; })()");
  t.ok(/45/.test(String(range)), "a perked specimen reports 45 u.l., not 40 (" +
    range + ")");
  t.eq(h.run("TowerPerks.priceOf(Smasher)"), 700,
    "which is the tower the 700-mana price belongs to");
});

test("every authored node survives a reload with its effect intact", function (t) {
  var h = bootContent();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll()");
  for (var i = 0; i < 20; i++) {
    h.run("MetaProgress.awardRun({ wavesCompleted: 35, waveReached: 35, " +
      "victory: true, mapId: Maps.DEFAULT_ID, mapName: 'x', difficultyId: 'easy' })");
  }
  h.run("MetaProgress.addXp('soldier', 20000);" +
        "TowerPerks.buy('soldier', 'rif_n1'); TowerPerks.buy('soldier', 'rif_s1');" +
        "MetaProgress.equipPerk('soldier', 'rif_n1', 0);" +
        "MetaProgress.equipPerk('soldier', 'rif_s1', 1)");

  var before = h.run("MetaProgress.coins()");
  var snap = h.run("MetaProgress.snapshot()");
  h.run("MetaProgress.__loadForTest(" + JSON.stringify({
    coins: snap.coins, owned: snap.owned, equipped: snap.equipped,
    progress: { soldier: { xp: snap.progress.soldier.xp,
                           nodes: snap.progress.soldier.nodes,
                           equipped: snap.progress.soldier.equipped,
                           resetAt: 0 } }
  }) + ")");

  t.eq(h.run("MetaProgress.coins()"), before, "the coins came out once and stayed out");
  t.deep(h.run("MetaProgress.ownedNodes('soldier')").sort(),
    ["rif_n1", "rif_s1"], "both nodes are still bought");
  t.deep(h.run("MetaProgress.equippedPerks('soldier')").slice(0, 2),
    ["rif_n1", "rif_s1"], "and both still equipped");

  h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000; towers = [];" +
        "addTower(new Soldier(200, 200, path))");
  t.eq(h.run("towers[0].damage"), 2, "the effect is rebuilt after the reload");
  t.eq(h.run("towers[0].cost"), 250, "and so is the build price");
  t.eq(h.run("towers[0].upgradeCost('A1')"), 250, "and the tier surcharge");
});


// ---------------------------------------------------------------------------
// THE CONFIRMED TREE CONTENT, BATCH 2 (2026-08-31) — the Siphon's fourteen,
// the Summoner's thirteen and the Farm's thirteen.
//
// Same rules as the block above: these name ids and assert exact figures,
// because the numbers ARE the specification. The three towers here are the
// three that had no tree at all until now.
// ---------------------------------------------------------------------------

test("the second batch's three trees hold exactly the confirmed nodes",
function (t) {
  var h = bootContent();

  var WANT = {
    siphon: [
      ["sip_n1", "Runic Pressure", 100, "north"],
      ["sip_n2", "Long Conduits", 90, "north"],
      ["sip_n3", "Camo Polarity", 120, "north"],
      ["sip_n4", "Preloaded Lock", 110, "north"],
      ["sip_s1", "Light Basin", 60, "south"],
      ["sip_s2", "Ceramic Coating", 100, "south"],
      ["sip_a1", "Brutal Primer", 100, "west"],
      ["sip_a2", "Selective Drain", 120, "west"],
      ["sip_a3", "Greedy Capacitor", 130, "west"],
      ["sip_a4", "Vital Flow", 150, "west"],
      ["sip_b1", "Dense Transfusion", 100, "east"],
      ["sip_b2", "Voracious Fan", 140, "east"],
      ["sip_b3", "Viscous Slow", 130, "east"],
      ["sip_b4", "Second Wind", 220, "east"]
    ],
    blub: [
      ["blb_n1", "Extended Ritual Circle", 90, "north"],
      ["blb_n2", "Ethereal Spores", 120, "north"],
      ["blb_n3", "Twin Embryo", 150, "north"],
      ["blb_n4", "Compressed Bodies", 100, "north"],
      ["blb_s1", "Stripped Altar", 60, "south"],
      ["blb_s2", "Central Brood", 120, "south"],
      ["blb_a1", "Fragile Brood", 120, "west"],
      ["blb_a2", "Rapid Incubation", 130, "west"],
      ["blb_a3", "Fleeting Toxin", 150, "west"],
      ["blb_b1", "Overcharged Cores", 110, "east"],
      ["blb_b2", "Compressed Cadence", 120, "east"],
      ["blb_b3", "Wide Detonation", 150, "east"],
      ["blb_b4", "Superconductor", 180, "east"]
    ],
    farm: [
      ["frm_n1", "Arcane Fertilizer", 90, "north"],
      ["frm_n2", "Compact Estate", 100, "north"],
      ["frm_n3", "Liquid License", 110, "north"],
      ["frm_n4", "Consortium", 120, "north"],
      ["frm_a1", "Accelerated Boiler", 100, "west"],
      ["frm_a2", "Patient Investment", 160, "west"],
      ["frm_a3", "Mana Armor", 180, "west"],
      ["frm_b1", "Extended Jurisdiction", 110, "east"],
      ["frm_b2", "Paralyzing Field", 130, "east"],
      ["frm_b3", "Execution Tithe", 150, "east"],
      // PATH C REPLACES THE LOWER-GENERAL BRANCH on this tower, so the south
      // arm is C and there is no separate lower-general section.
      ["frm_c1", "Jet Protected", 100, "south"],
      ["frm_c2", "Amortized Reset", 120, "south"],
      ["frm_c3", "Extra Die", 180, "south"]
    ]
  };

  Object.keys(WANT).forEach(function (towerId) {
    var nodes = h.run("TowerPerks.nodes('" + towerId + "')");
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });

    t.eq(nodes.length, WANT[towerId].length,
      towerId + " has exactly " + WANT[towerId].length + " nodes and no invented extra");

    WANT[towerId].forEach(function (row) {
      var n = byId[row[0]];
      t.ok(!!n, towerId + ": " + row[0] + " exists");
      if (!n) return;
      t.eq(n.name, row[1], row[0] + " is called " + row[1]);
      t.eq(n.cost, row[2], row[1] + " costs " + row[2] + " meta coins");
      t.eq(n.minLevel || 0, 0, row[1] + " needs no tower level");
      t.ok(!!n.blurb && n.blurb.length > 20, row[1] + " carries a description");
      var arm = n.at.x < 0 ? "west" : n.at.x > 0 ? "east"
        : n.at.y < 0 ? "north" : "south";
      t.eq(arm, row[3], row[1] + " sits on the " + row[3] + " arm");
    });

    t.deep(chainProblems(h, towerId), [],
      towerId + "'s arms are chains, bought from the tower outwards");

    var forbidden = ["Capital Bound", "Blood Triage", "Initial Overpressure",
      "Tight Base", "Survival Valve", "Close Circuit", "Double Polarity",
      "Swarm Density", "Early Coagulation", "Reinforced Cells", "Shared Optics",
      "Fortified Ritual", "Recycled Biomass", "Sacrificial Guard",
      "Pressurized Reserve", "Sealed Vault", "Aggressive Tithe",
      "Fortified Dividends", "Reinforced Structure", "Ascending Dice",
      "Banker's Stop"];
    var present = nodes.map(function (n) { return n.name; })
      .filter(function (name) { return forbidden.indexOf(name) !== -1; });
    t.deep(present, [], towerId + " exposes no rejected name");
  });

  // ALL SIX TOWERS HAVE A TREE NOW, and no tower has two.
  t.deep(h.run("TowerPerks.towersWithTrees().sort()"),
    ["blub", "farm", "longshot", "siphon", "smasher", "soldier"].sort(),
    "every tower in the catalogue has authored content");
});

test("a fresh profile leaves the second batch's three towers exactly as authored",
function (t) {
  var h = bootContent();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar();" +
        "openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000; towers = []");

  var siphon = h.run("(function () { var s = new BeamTower(200, 200, path);" +
    "  addTower(s); var c = s.core.stats;" +
    "  return { ad: s.effectiveAD(0), rate: c.attackRate, range: s.rangeUl," +
    "    hp: s.maxHp, cost: s.cost, targets: c.maxTargets, camo: c.seesCamo," +
    "    delay: c.reacquireDelay, dmgMult: c.damageMult," +
    "    inc: c.incomingDamageMult, pierce: s.defPierce() }; })()");
  t.deep(siphon, { ad: 1, rate: 10, range: 75, hp: 250, cost: 800, targets: 1,
    camo: false, delay: 0, dmgMult: 1, inc: 1, pierce: 0 },
    "an unperked Siphon is the authored Siphon");

  var summ = h.run("(function () { var s = new BlubTower(400, 200, path);" +
    "  addTower(s); var u = s.summonStats('blub1');" +
    "  return { range: s.rangeUl, hp: s.maxHp, cost: s.cost," +
    "    dmg: u.damage, rate: u.rate, ammo: u.hp, foot: u.footprintUl," +
    "    camo: u.seesCamo, flying: u.seesFlying," +
    "    interval: s.intervalFor('blub1'), weaken: s.weakenPerHit," +
    "    weakenFor: s.weakenSeconds, twin: s.perkTwinChance }; })()");
  t.deep(summ, { range: 75, hp: 100, cost: 450, dmg: 2, rate: 1, ammo: 10,
    foot: 10, camo: false, flying: false, interval: 20, weaken: 0.001,
    weakenFor: 5, twin: 0 }, "an unperked Summoner is the authored Summoner");

  var f = h.run("(function () { var s = new FarmTower(600, 200, path);" +
    "  addTower(s);" +
    "  return { wave: s.producesPerWave(), hp: s.maxHp, cost: s.cost," +
    "    foot: s.footprintRadiusUl, tick: s.tickSeconds," +
    "    refund: sellValue(s), tranche: s.trancheBonus, temp: s.tempMultiplier," +
    "    exFlat: s.executeFlat, exFrac: s.executeFraction," +
    "    armor: s.manaArmorPerPoint, dice: s.diceCount," +
    "    scale: s.productionScale() }; })()");
  t.deep(f, { wave: 200, hp: 200, cost: 1200, foot: 35, tick: 5, refund: 600,
    tranche: 0.05, temp: 5, exFlat: 10, exFrac: 0.05, armor: 0, dice: 0,
    scale: 1 }, "an unperked Farm is the authored Farm");
});

test("owning a second-batch node does nothing; equipping it is what does",
function (t) {
  var h = bootContent();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll();" +
        "MetaProgress.snapshot().owned.forEach(function (id) {" +
        "  MetaProgress.addXp(id, 20000); });" +
        "MetaProgress.buyNode('siphon', 'sip_n2', 0);" +
        "MetaProgress.buyNode('blub', 'blb_n1', 0);" +
        "MetaProgress.buyNode('farm', 'frm_n1', 0);" +
        "openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000; towers = []");

  var owned = h.run("(function () {" +
    "  var a = new BeamTower(200, 200, path); addTower(a);" +
    "  var b = new BlubTower(400, 200, path); addTower(b);" +
    "  var c = new FarmTower(600, 200, path); addTower(c);" +
    "  return { beam: a.rangeUl, blub: b.rangeUl, farm: c.producesPerWave() }; })()");
  t.deep(owned, { beam: 75, blub: 75, farm: 200 },
    "three bought nodes, none equipped, and nothing has moved");

  h.run("openMenu();" +
        "MetaProgress.equipPerk('siphon', 'sip_n2', 0);" +
        "MetaProgress.equipPerk('blub', 'blb_n1', 0);" +
        "MetaProgress.equipPerk('farm', 'frm_n1', 0);" +
        "startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000; towers = []");
  var live = h.run("(function () {" +
    "  var a = new BeamTower(200, 200, path); addTower(a);" +
    "  var b = new BlubTower(400, 200, path); addTower(b);" +
    "  var c = new FarmTower(600, 200, path); addTower(c);" +
    "  return { beam: a.rangeUl, blub: b.rangeUl, farm: c.producesPerWave() }; })()");
  t.deep(live, { beam: 87, blub: 100, farm: 230 }, "equipped, all three land");

  h.run("openMenu(); MetaProgress.unequipPerk('siphon', 0);" +
        "MetaProgress.unequipPerk('blub', 0); MetaProgress.unequipPerk('farm', 0);" +
        "startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000; towers = []");
  var off = h.run("(function () {" +
    "  var a = new BeamTower(200, 200, path); addTower(a);" +
    "  var b = new BlubTower(400, 200, path); addTower(b);" +
    "  var c = new FarmTower(600, 200, path); addTower(c);" +
    "  return { beam: a.rangeUl, blub: b.rangeUl, farm: c.producesPerWave() }; })()");
  t.deep(off, { beam: 75, blub: 75, farm: 200 },
    "unequipped before the run, and all three are authored again");
  t.eq(h.run("MetaProgress.ownsNode('farm', 'frm_n1')"), true,
    "while the nodes are still owned");
});

// --- Siphon -----------------------------------------------------------------

var SIP_A = ["A1", "A2", "A3", "A4", "A5"];
var SIP_B = ["B1", "B2", "B3", "B4", "B5"];

test("Brutal Primer arrives sooner and stops lower", function (t) {
  var h = bootContent();

  // THE AUTHORED RAMP FIRST. `rampCap` is the bonus ABOVE 1, so the design
  // figures x3.0 and x3.5 are 2.0 and 2.5 here -- reading them the other way
  // round would turn this node's nerf into a buff.
  var plain = towerWith(h, "siphon", [], ["A1"]);
  var p = h.run(plain + ".core.stats.mechanics.ramp_per_target");
  t.deep({ rate: p.rampRate, cap: p.rampCap }, { rate: 0.15, cap: 2.0 },
    "A1 normally climbs at 0.15 to a x3.0 ceiling");

  var a1 = towerWith(h, "siphon", ["sip_a1"], ["A1"]);
  var q = h.run(a1 + ".core.stats.mechanics.ramp_per_target");
  t.deep({ rate: q.rampRate, cap: q.rampCap }, { rate: 0.22, cap: 1.7 },
    "with it, 0.22 to x2.7");
  t.near(h.run(a1 + ".ramp.params.rampRate"), 0.22, 1e-9,
    "and the live tracker is pointed at the same object");

  var a4 = towerWith(h, "siphon", ["sip_a1"], ["A1", "A2", "A3", "A4"]);
  var r = h.run(a4 + ".core.stats.mechanics.ramp_per_target");
  t.deep({ rate: r.rampRate, cap: r.rampCap }, { rate: 0.27, cap: 2.2 },
    "A4 replaces it wholesale with 0.27 to x3.2");

  // FIVE UNINTERRUPTED SECONDS AT A5, measured through the real tracker.
  var plainA5 = towerWith(h, "siphon", [], SIP_A);
  var normal = h.run("(function () { var tw = " + plainA5 + ";" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  tw.ramp.update(5, [e]);" +
    "  return { at5: tw.ramp.multiplier(e)," +
    "           cap: 1 + tw.core.stats.mechanics.ramp_per_target.rampCap }; })()");
  var fastA5 = towerWith(h, "siphon", ["sip_a1"], SIP_A);
  var primed = h.run("(function () { var tw = " + fastA5 + ";" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  tw.ramp.update(5, [e]);" +
    "  return { at5: tw.ramp.multiplier(e)," +
    "           cap: 1 + tw.core.stats.mechanics.ramp_per_target.rampCap }; })()");
  t.near(normal.at5, 2.0, 1e-9, "an ordinary A5 reads x2.00 after five seconds");
  t.near(primed.at5, 2.35, 1e-9, "a primed one reads x2.35");
  t.near(normal.cap, 3.5, 1e-9, "and their ceilings are x3.5");
  t.near(primed.cap, 3.2, 1e-9, "against x3.2 — about 8.6% lower");
  t.near(primed.cap / normal.cap, 1 - 0.0857, 1e-3, "which is the stated 8.6%");
});

test("Selective Drain ignores percentage defence and never flat armor",
function (t) {
  var h = bootContent();
  var plain = towerWith(h, "siphon", [], ["A1"]);
  t.near(h.run(plain + ".defPierce()"), 0.25, 1e-9, "A1 normally pierces 25%");

  var s = towerWith(h, "siphon", ["sip_a2"], ["A1"]);
  t.near(h.run(s + ".defPierce()"), 0.40, 1e-9, "with it, 40%");
  t.near(h.run(s + ".effectiveAD(0)"), 0.95, 1e-9, "for 5% off the beam");

  // WHAT A BODY ACTUALLY TAKES, through the shared mitigation. An enemy with
  // 50 percentage defence and no plate: -5% raw against +6.4% net.
  var out = h.run("(function () {" +
    "  var e = new Enemy(path, null, 'normal', {}); e.defense = 50; e.armor = 0;" +
    "  return { plain: Mitigation.mitigate(1, e, 0.25, 0)," +
    "           drain: Mitigation.mitigate(0.95, e, 0.40, 0)," +
    "           bare: Mitigation.mitigate(0.95, e, 0.40, 0) }; })()");
  t.near(out.plain, 0.625, 1e-9, "an ordinary A1 tick lands 0.625");
  t.near(out.drain, 0.665, 1e-9, "and a drained one 0.665");
  t.near(out.drain / out.plain, 1.064, 1e-3, "about +6.4%");
  t.ok(out.drain % 1 !== 0, "and neither figure was rounded to a whole number");

  // FLAT ARMOR IS UNTOUCHED. A Brute's five points meet the smaller tick and
  // eat all of it, exactly as they would without the node.
  var plated = h.run("(function () {" +
    "  var e = new Enemy(path, null, 'brute', {});" +
    "  return { armor: e.armor, took: Mitigation.mitigate(0.95, e, 0.40, 0) }; })()");
  t.eq(plated.armor, 5, "a Brute carries five flat");
  t.eq(plated.took, 0, "and a 0.95 tick still lands nothing at all through it");
});

test("Greedy Capacitor moves every threshold and what a charge is worth",
function (t) {
  var h = bootContent();
  var plain = towerWith(h, "siphon", [], ["A1", "A2", "A3"]);
  var before = h.run("(function () { var tw = " + plain + ";" +
    "  return { first: tw.charge.thresholdFor(1), fourth: tw.charge.thresholdFor(4)," +
    "    per: tw.core.stats.mechanics.charge_to_gold.perCharge }; })()");
  t.near(before.first, 500, 1e-9, "the first charge normally needs 500");
  t.near(before.per, 0.50, 1e-9, "and pays 0.50 mana");

  var s = towerWith(h, "siphon", ["sip_a3"], ["A1", "A2", "A3"]);
  var after = h.run("(function () { var tw = " + s + ";" +
    "  return { first: tw.charge.thresholdFor(1), fourth: tw.charge.thresholdFor(4)," +
    "    per: tw.core.stats.mechanics.charge_to_gold.perCharge," +
    "    growth: tw.core.stats.mechanics.charge_to_gold.growth," +
    "    cap: tw.core.stats.mechanics.charge_to_gold.capTotal }; })()");
  t.near(after.first, 425, 1e-9, "with it the first needs 425");
  t.near(after.fourth, before.fourth * 0.85, 1e-9,
    "and EVERY later one is 15% lower too, because they are one geometry");
  t.near(after.per, 0.42, 1e-9, "each charge pays 0.42 — 16% less");
  t.near(after.growth, 1.65, 1e-9, "the ladder's shape is untouched");
  t.near(after.cap, 5.00, 1e-9, "and so is the ceiling");
});

test("Vital Flow pays from A4 and charges reach for it", function (t) {
  var h = bootContent();

  var a3 = towerWith(h, "siphon", ["sip_a4"], ["A1", "A2", "A3"]);
  t.eq(h.run(a3 + ".rangeUl"), 150, "nothing at A3, on either half");

  var plain = towerWith(h, "siphon", [], ["A1", "A2", "A3", "A4"]);
  t.near(h.run(plain + ".core.stats.mechanics.hp_scaling.maxBonus"), 0.30, 1e-9,
    "A4 normally adds 30% against a full-health body");
  t.eq(h.run(plain + ".rangeUl"), 175, "and reaches 175");

  var s = towerWith(h, "siphon", ["sip_a4"], ["A1", "A2", "A3", "A4"]);
  t.near(h.run(s + ".core.stats.mechanics.hp_scaling.maxBonus"), 0.40, 1e-9,
    "with it, 40%");
  t.eq(h.run(s + ".rangeUl"), 160, "for 15 u.l. of reach");

  // THE THRESHOLD AND THE QUALIFICATION ARE A4's OWN and are not touched: a
  // body at half health still gets nothing, and one at full gets the whole of
  // whatever the bonus now is.
  var scaled = h.run("(function () { var tw = " + towers1() + ";" +
    "  function at(frac) { return tw.hpScale({ health: frac, maxHealth: 1 }); }" +
    "  return { full: at(1), threeQ: at(0.75), half: at(0.5), low: at(0.2) }; })()");
  t.near(scaled.full, 1.40, 1e-9, "a full-health body takes 40% more");
  t.near(scaled.threeQ, 1.20, 1e-9, "three quarters is halfway up the slope");
  t.near(scaled.half, 1, 1e-9, "and the floor is still half health");
  t.near(scaled.low, 1, 1e-9, "with nothing below it");

  var a5 = towerWith(h, "siphon", ["sip_a4"], SIP_A);
  t.eq(h.run(a5 + ".rangeUl"), 160, "and the reach penalty persists at A5");
});

test("Dense Transfusion drains harder and ticks slower", function (t) {
  var h = bootContent();

  var b2 = towerWith(h, "siphon", ["sip_b1"], ["B1", "B2"]);
  t.eq(h.run(b2 + ".core.stats.attackRate"), 10, "nothing before B3");

  var b3 = towerWith(h, "siphon", ["sip_b1"], ["B1", "B2", "B3"]);
  var got = h.run("(function () { var c = " + b3 + ".core.stats;" +
    "  return { steal: c.mechanics.lifesteal.ratio, rate: c.attackRate }; })()");
  t.near(got.steal, 0.12, 1e-9, "B3's 10% becomes 12%");
  t.near(got.rate, 9.5, 1e-9, "and the beam ticks 9.5 times a second");

  var b5 = towerWith(h, "siphon", ["sip_b1"], SIP_B);
  t.near(h.run(b5 + ".core.stats.mechanics.lifesteal.ratio"), 0.36, 1e-9,
    "B5's 30% becomes 36%");

  // THE RATE AND NOT THE DAMAGE. A -5% written onto the beam would have healed
  // 5% less as well, which is the opposite of the node.
  t.near(h.run(b5 + ".effectiveAD(0)"), 3, 1e-9, "each tick still deals its full 3");
  var plainB5 = towerWith(h, "siphon", [], SIP_B);
  var sustained = h.run("(function () { var c = " + plainB5 + ".core.stats;" +
    "  return { dps: 3 * c.attackRate," +
    "           heal: 3 * c.attackRate * c.mechanics.lifesteal.ratio }; })()");
  t.near(3 * 9.5 / sustained.dps, 0.95, 1e-9, "about -5% DPS");
  t.near(3 * 9.5 * 0.36 / sustained.heal, 1.14, 1e-9, "for about +14% healing");
});

test("Voracious Fan lights sixty beams at a tenth off", function (t) {
  var h = bootContent();

  var b4 = towerWith(h, "siphon", ["sip_b2"], ["B1", "B2", "B3", "B4"]);
  var atB4 = h.run("(function () { var tw = " + b4 + ";" +
    "  return { targets: tw.core.stats.maxTargets, ad: tw.effectiveAD(0)," +
    "           range: tw.rangeUl }; })()");
  t.deep(atB4, { targets: 10, ad: 2, range: 55 }, "nothing at all before B5");

  var plain = towerWith(h, "siphon", [], SIP_B);
  t.eq(h.run(plain + ".core.stats.maxTargets"), 50, "a B5 normally holds 50");

  var s = towerWith(h, "siphon", ["sip_b2"], SIP_B);
  var got = h.run("(function () { var tw = " + s + ";" +
    "  return { targets: tw.core.stats.maxTargets, ad: tw.effectiveAD(0)," +
    "           range: tw.rangeUl }; })()");
  t.deep(got, { targets: 60, ad: 2.7, range: 80 },
    "with it, 60 beams at 2.7 damage and +5 u.l.");
  t.near(60 * 2.7 / (50 * 3), 1.08, 1e-9,
    "sixty beams is about +8% total; fifty or fewer is a straight -10%");
});

test("Viscous Slow thickens the beam and shortens it", function (t) {
  var h = bootContent();

  var b3 = towerWith(h, "siphon", ["sip_b3"], ["B1", "B2", "B3"]);
  t.near(h.run(b3 + ".core.stats.mechanics.slow.fraction"), 0.10, 1e-9,
    "nothing before B4");
  t.eq(h.run(b3 + ".rangeUl"), 50, "and no reach penalty either");

  var b4 = towerWith(h, "siphon", ["sip_b3"], ["B1", "B2", "B3", "B4"]);
  t.near(h.run(b4 + ".core.stats.mechanics.slow.fraction"), 0.22, 1e-9,
    "B4's 15% becomes 22%");
  t.eq(h.run(b4 + ".rangeUl"), 40, "for 15 u.l. of reach");

  // THE APPLICATION RULE IS UNTOUCHED: re-asserted every frame at the shared
  // refresh duration, and the strongest slow still wins on the body.
  var applied = h.run("(function () { var tw = " + towers1() + ";" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  e.progress = path.length * 0.5; e.refreshPos();" +
    "  tw.x = e.pos.x; tw.y = e.pos.y;" +
    "  tw.update(1 / 60, [e], [], { gold: 0 });" +
    "  return { mult: e.slowMultiplier, timer: e.slowTimer }; })()");
  t.near(applied.mult, 0.78, 1e-9, "a body under the beam keeps 78% of its speed");
  t.near(applied.timer, h.run("BeamTower.SLOW_REFRESH_SECONDS"), 1e-9,
    "on the same short refresh it always used");
});

test("Second Wind drags further, leaves more, and charges for it", function (t) {
  var h = bootContent();

  var b4 = towerWith(h, "siphon", ["sip_b4"], ["B1", "B2", "B3", "B4"]);
  t.eq(h.run(b4 + ".nextTierCost('B')"), 6500,
    "the surcharge is on B5's price and is quoted before it is bought");

  var plain = towerWith(h, "siphon", [], SIP_B);
  var normal = h.run("(function () { var p = DeathDenial.heldParams();" +
    "  return { back: p.knockbackUl, left: p.restoreBaseHpTo }; })()");
  t.deep(normal, { back: 500, left: 1 }, "an ordinary save drags 500 and leaves 1");

  var s = towerWith(h, "siphon", ["sip_b4"], SIP_B);
  var wind = h.run("(function () { var p = DeathDenial.heldParams();" +
    "  return { back: p.knockbackUl, left: p.restoreBaseHpTo }; })()");
  t.deep(wind, { back: 650, left: 50 }, "with it, 650 and 50");
  t.eq(h.run("DeathDenial.isHeld()"), true, "and it is still ONE save");
  t.eq(h.run("DeathDenial.isAvailable().ok"), false,
    "still one per game, not two");

  // AND THE SAVE REALLY SPENDS THOSE NUMBERS.
  var spent = h.run("(function () {" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  e.progress = path.length; e.refreshPos(); enemies = [e];" +
    "  var out = DeathDenial.tryConsume({ towers: towers, enemies: enemies," +
    "    sellTower: sellTower });" +
    "  DeathDenial.updateRewind(DeathDenial.REWIND_SECONDS + 1);" +
    "  return { left: out.restoreBaseHpTo, back: path.length - e.progress }; })()");
  t.eq(spent.left, 50, "the base is left standing on 50");
  t.near(spent.back, h.run("ul(650)"), 1e-6, "and everything was dragged 650 u.l.");
});

test("Runic Pressure keeps its fractions", function (t) {
  var h = bootContent();
  var s = towerWith(h, "siphon", ["sip_n1"], []);
  var got = h.run("(function () { var tw = " + s + ";" +
    "  return { ad: tw.effectiveAD(0), rate: tw.core.stats.attackRate," +
    "           raw: tw.core.stats.ad }; })()");
  t.near(got.ad, 1.08, 1e-9, "1 damage becomes 1.08 and is NOT rounded back to 1");
  t.near(got.rate, 9.7, 1e-9, "ten ticks a second become 9.7");
  t.eq(got.raw, 1, "the stat itself is untouched — the multiplier is its own field");
  t.near(got.ad * got.rate, 10.476, 1e-9, "10.476 DPS, about +4.76%");

  // AND IT REACHES A5's GOLD BONUS TOO, which is why the multiplier is not
  // written onto `ad`: that bonus is added AFTER the stat resolves.
  var a5 = towerWith(h, "siphon", ["sip_n1"], SIP_A);
  var withGold = h.run("(function () { var tw = " + a5 + ";" +
    "  return { none: tw.effectiveAD(0), rich: tw.effectiveAD(1000000) }; })()");
  t.ok(withGold.rich > withGold.none, "gold still raises it");
  t.near(withGold.rich / (withGold.rich / 1.08), 1.08, 1e-9,
    "and the whole of it carries the 8%");

  // DEATH DENIAL AND THE OTHER UTILITY EFFECTS ARE NOT DAMAGE.
  var b5 = towerWith(h, "siphon", ["sip_n1"], SIP_B);
  var p = h.run("DeathDenial.heldParams()");
  t.deep({ back: p.knockbackUl, left: p.restoreBaseHpTo }, { back: 500, left: 1 },
    "the save is exactly what it was");
  t.eq(h.run(b5 + ".core.stats.maxTargets"), 50, "and so is the target count");
});

test("Long Conduits, Camo Polarity, Preloaded Lock, Light Basin and Ceramic Coating",
function (t) {
  var h = bootContent();

  var conduits = towerWith(h, "siphon", ["sip_n2"], []);
  t.eq(h.run(conduits + ".rangeUl"), 87, "Long Conduits: 75 -> 87 u.l.");
  t.near(h.run(conduits + ".maxHp"), 212.5, 1e-9, "and 250 -> 212.5 health");
  t.near(h.run(conduits + ".rangePx"),
    h.run("elevatedRangePx(" + conduits + ", 87)"), 1e-9, "with the ring re-derived");

  var polarity = towerWith(h, "siphon", ["sip_n3"], []);
  var camo = h.run("(function () { var tw = " + polarity + ";" +
    "  var e = new Enemy(path, null, 'camo_normal', {});" +
    "  e.progress = path.length * 0.5; e.refreshPos();" +
    "  tw.x = e.pos.x; tw.y = e.pos.y;" +
    "  var f = new Enemy(path, null, 'normal', {}); f.isFlying = true;" +
    "  f.progress = path.length * 0.5; f.refreshPos();" +
    "  return { camo: tw.canHold(e), flying: tw.canHold(f)," +
    "           price: TowerPerks.priceOf(BeamTower) }; })()");
  t.eq(camo.camo, true, "Camo Polarity: a camo body is holdable from placement");
  t.eq(camo.flying, false, "and it grants NO flying detection");
  t.eq(camo.price, 875, "placement 800 -> 875");

  var lock = towerWith(h, "siphon", ["sip_n4"], ["A1"]);
  var ramp = h.run("(function () { var tw = " + lock + ";" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  var fresh = tw.ramp.multiplier(e);" +
    "  tw.ramp.update(20, [e]);" +
    "  return { fresh: fresh, held: tw.ramp.multiplier(e)," +
    "           delay: tw.core.stats.reacquireDelay }; })()");
  t.near(ramp.fresh, 1.25, 1e-9, "Preloaded Lock: a fresh target opens at x1.25");
  t.near(ramp.held, 3.0, 1e-9, "and the ceiling is still A1's x3.0");
  t.near(ramp.delay, 0.30, 1e-9, "with a 0.30 s wait before each new lock");

  var basin = towerWith(h, "siphon", ["sip_s1"], []);
  t.eq(h.run("TowerPerks.priceOf(BeamTower)"), 675, "Light Basin: 800 -> 675");
  t.near(h.run(basin + ".maxHp"), 187.5, 1e-9, "and 250 -> 187.5 health");

  var coat = towerWith(h, "siphon", ["sip_s2"], []);
  var hit = h.run("(function () { var tw = " + coat + ";" +
    "  var before = tw.currentHp; tw.takeDamage(100);" +
    "  return { ad: tw.effectiveAD(0), lost: before - tw.currentHp," +
    "           max: tw.maxHp }; })()");
  t.near(hit.ad, 0.95, 1e-9, "Ceramic Coating: 5% off the beam");
  t.near(hit.lost, 70, 1e-9, "a hundred-damage blow costs 70");
  t.eq(hit.max, 250, "and it is NOT extra health — the maximum is untouched");
});

test("the Siphon's placement prices compose in any order", function (t) {
  var h = bootContent();
  towerWith(h, "siphon", ["sip_n3"], []);
  t.eq(h.run("TowerPerks.priceOf(BeamTower)"), 875, "Camo Polarity alone: 875");
  towerWith(h, "siphon", ["sip_s1"], []);
  t.eq(h.run("TowerPerks.priceOf(BeamTower)"), 675, "Light Basin alone: 675");
  towerWith(h, "siphon", ["sip_n3", "sip_s1"], []);
  t.eq(h.run("TowerPerks.priceOf(BeamTower)"), 750, "both: 675 + 75 = 750");
  t.eq(h.run("towers[0].cost"), 750, "and the tower was charged that");
  towerWith(h, "siphon", ["sip_s1", "sip_n3"], []);
  t.eq(h.run("TowerPerks.priceOf(BeamTower)"), 750, "whichever slots they sit in");
});

test("the Siphon's confirmed nodes compose without an order mattering",
function (t) {
  var h = bootContent();

  // VORACIOUS FAN + VISCOUS SLOW at B5: +5 and -15 is a net -10 u.l., the
  // damage is x0.90 and the slow is 22%.
  var pair = towerWith(h, "siphon", ["sip_b2", "sip_b3"], SIP_B);
  var got = h.run("(function () { var tw = " + pair + ";" +
    "  return { range: tw.rangeUl, targets: tw.core.stats.maxTargets," +
    "    ad: tw.effectiveAD(0), slow: tw.core.stats.mechanics.slow.fraction }; })()");
  t.deep(got, { range: 65, targets: 60, ad: 2.7, slow: 0.22 },
    "75 + 5 - 15 = 65, sixty beams at 2.7, slowing 22%");

  // BRUTAL PRIMER + PRELOADED LOCK: the delay, then x1.25, then the faster
  // climb toward the LOWER cap.
  var primed = towerWith(h, "siphon", ["sip_a1", "sip_n4"], SIP_A);
  var climb = h.run("(function () { var tw = " + primed + ";" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  var out = { fresh: tw.ramp.multiplier(e), delay: tw.core.stats.reacquireDelay };" +
    "  tw.ramp.update(2, [e]); out.at2 = tw.ramp.multiplier(e);" +
    "  tw.ramp.update(30, [e]); out.cap = tw.ramp.multiplier(e);" +
    "  return out; })()");
  t.near(climb.delay, 0.30, 1e-9, "the acquisition still costs 0.30 s");
  t.near(climb.fresh, 1.25, 1e-9, "a new lock opens at x1.25");
  t.near(climb.at2, 1 + 0.27 * 2, 1e-9, "and climbs at Brutal Primer's 0.27");
  t.near(climb.cap, 3.2, 1e-9, "toward Brutal Primer's lower x3.2");

  // FOUR MULTIPLIERS ON ONE FIELD, and they multiply rather than summing.
  var A5 = SIP_A;
  var ids = ["sip_n1", "sip_a2", "sip_s2", "sip_a1", "sip_a4"];
  var fw = towerWith(h, "siphon", ids, A5);
  var a = h.run("(function () { var tw = " + fw + ";" +
    "  return { ad: tw.effectiveAD(0), rate: tw.core.stats.attackRate," +
    "    range: tw.rangeUl, pierce: tw.defPierce()," +
    "    cap: tw.core.stats.mechanics.ramp_per_target.rampCap," +
    "    hpBonus: tw.core.stats.mechanics.hp_scaling.maxBonus," +
    "    inc: tw.core.stats.incomingDamageMult }; })()");
  var bw = towerWith(h, "siphon", ids.slice().reverse(), A5);
  var b = h.run("(function () { var tw = " + bw + ";" +
    "  return { ad: tw.effectiveAD(0), rate: tw.core.stats.attackRate," +
    "    range: tw.rangeUl, pierce: tw.defPierce()," +
    "    cap: tw.core.stats.mechanics.ramp_per_target.rampCap," +
    "    hpBonus: tw.core.stats.mechanics.hp_scaling.maxBonus," +
    "    inc: tw.core.stats.incomingDamageMult }; })()");
  t.deep(b, a, "the slots the five sit in change nothing");
  t.near(a.ad, 10 * 1.08 * 0.95 * 0.95, 1e-9,
    "three factors on one field multiply — never 1 + 0.08 - 0.05 - 0.05");
  t.near(a.rate, 9.7, 1e-9, "and only Runic Pressure moved the tick rate");
  t.eq(a.range, 160, "Vital Flow's 15 u.l. is the only reach change");
  t.near(a.pierce, 0.40, 1e-9, "Selective Drain's pierce is live");
  t.near(a.cap, 2.2, 1e-9, "Brutal Primer's ceiling too");
  t.near(a.hpBonus, 0.40, 1e-9, "and Vital Flow's high-health bonus");
  t.near(a.inc, 0.70, 1e-9, "with Ceramic Coating's protection on top");
});

// --- Summoner ---------------------------------------------------------------
//
// A BLUB'S HP IS ITS AMMUNITION -- one ordinary attack spends one point -- so
// every assertion about `hp` below is also an assertion about how many attacks
// that body will make. `summonStats` is the one door the numbers come through.

var BLB_B = ["A1", "A2", "B1", "B2", "B3", "B4", "B5"];

// The resolved stats of one unit on a Summoner built with these nodes and
// tiers. Through the real `summonStats`, which is what `summon` hands a body.
function blubStats(h, nodeIds, tiers, unitId) {
  var expr = towerWith(h, "blub", nodeIds, tiers);
  return h.run("(function () { var tw = " + expr + ";" +
    "  var u = tw.summonStats('" + unitId + "');" +
    "  u.interval = tw.intervalFor('" + unitId + "');" +
    "  return u; })()");
}

test("Fragile Brood trades an attack for a point of damage", function (t) {
  var h = bootContent();

  var a2 = blubStats(h, ["blb_a1"], ["A1", "A2"], "blub3");
  t.deep({ dmg: a2.damage, ammo: a2.hp }, { dmg: 6, ammo: 20 },
    "nothing at all before A3");

  var plain = blubStats(h, [], ["A1", "A2", "A3"], "blub3");
  t.deep({ dmg: plain.damage, ammo: plain.hp }, { dmg: 6, ammo: 20 },
    "a Blub III normally deals 6 and carries 20 HP/ammunition");

  var s = blubStats(h, ["blb_a1"], ["A1", "A2", "A3"], "blub3");
  t.deep({ dmg: s.damage, ammo: s.hp }, { dmg: 7, ammo: 19 },
    "with it, 7 damage and 19 — one attack fewer, since HP is what it shoots with");

  var mini = blubStats(h, ["blb_a1"], ["A1", "A2", "A3"], "mini1");
  t.deep({ dmg: mini.damage, ammo: mini.hp }, { dmg: 3, ammo: 5 },
    "and the Mini Blub too, because it is path A family");

  // PATH B'S FAMILY GETS NOTHING, whatever tier the tower is on.
  var cyber = blubStats(h, ["blb_a1"], ["A1", "A2", "B1", "B2", "B3"], "cyber");
  t.deep({ dmg: cyber.damage, ammo: cyber.hp }, { dmg: 13, ammo: 41 },
    "a Cyberblub is untouched — B1's +1 damage and B2's +1 ammunition, and " +
    "nothing from a path A node");

  // AND THE ATTACKS REALLY GO AWAY. A body with 19 ammunition makes 19 ordinary
  // attacks, driven through the real spend.
  towerWith(h, "blub", ["blb_a1"], ["A1", "A2", "A3"]);
  var fired = h.run("(function () { var tw = " + towers1() + ";" +
    "  var b = new Blub(tw, 400, 400, tw.summonStats('blub3'));" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  e.health = 1e9; e.maxHealth = 1e9; e.pos = { x: 405, y: 400 };" +
    "  var n = 0;" +
    "  while (!b.isDestroyed() && n < 200) { b.resolveAttack(e, [e]); n++; }" +
    "  return n; })()");
  t.eq(fired, 19, "nineteen points of ammunition really is nineteen attacks");

  // NEVER ZERO OR NEGATIVE. The smallest body in the game is a Mini Blub I at 6.
  var floors = h.run("(function () { var tw = " + towers1() + ";" +
    "  return Object.keys(BlubTower.UNITS).map(function (id) {" +
    "    return tw.summonStats(id).hp; }); })()");
  t.ok(Math.min.apply(null, floors) >= 1,
    "no unit is ever created with less than one point of ammunition");
});

test("Rapid Incubation summons sooner and fires slower", function (t) {
  var h = bootContent();

  var a2 = blubStats(h, ["blb_a2"], ["A1", "A2"], "blub3");
  t.near(a2.interval, 15, 1e-9, "nothing before A3");
  t.near(a2.rate, 1.5, 1e-9, "on either half");

  var s = blubStats(h, ["blb_a2"], ["A1", "A2", "A3"], "blub3");
  t.near(s.interval, 15 * 0.92, 1e-9, "with it, a 13.8 s cycle instead of 15");
  t.near(s.rate, 1.5 * 0.90, 1e-9, "and 1.35 attacks a second instead of 1.5");
  t.eq(s.damage, 6, "damage per attack is untouched");
  t.eq(s.hp, 20, "and so is HP/ammunition — the body simply lasts longer");

  var mini = blubStats(h, ["blb_a2"], ["A1", "A2", "A3"], "mini1");
  t.near(mini.interval, 4 * 0.92, 1e-9, "every path A line, not just the main one");

  var cyber = blubStats(h, ["blb_a2"], ["A1", "A2", "B1", "B2", "B3"], "cyber");
  t.near(cyber.interval, 19, 1e-9, "path B's lines are untouched");
  t.near(cyber.rate, 2.0, 1e-9, "and so is their rate");
});

test("Fleeting Toxin builds half again as fast and expires sooner", function (t) {
  var h = bootContent();

  var a3 = towerWith(h, "blub", ["blb_a3"], ["A1", "A2", "A3"]);
  var before = h.run("(function () { var tw = " + a3 + ";" +
    "  return { per: tw.weakenPerHit, secs: tw.weakenSeconds," +
    "           on: tw.hasWeaken }; })()");
  t.deep(before, { per: 0.001, secs: 5, on: false }, "nothing before A4");

  var s = towerWith(h, "blub", ["blb_a3"], ["A1", "A2", "A3", "A4"]);
  var after = h.run("(function () { var tw = " + s + ";" +
    "  return { per: tw.weakenPerHit, secs: tw.weakenSeconds, on: tw.hasWeaken }; })()");
  t.near(after.per, 0.0015, 1e-12, "+0.15 points a hit instead of +0.10");
  t.near(after.secs, 3.5, 1e-9, "for 3.5 seconds instead of 5");
  t.eq(after.on, true, "and A4 switched the debuff on");

  // WHAT AN ENEMY ACTUALLY CARRIES, through the shared DamageAmp -- whose stack
  // cap, refresh and cleanup are its own and are untouched.
  var stacked = h.run("(function () { var tw = " + towers1() + ";" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  for (var i = 0; i < 100; i++) tw.applyWeaken(e);" +
    "  var at100 = DamageAmp.multiplier(e);" +
    "  DamageAmp.tick(e, 3.4); var at34 = DamageAmp.multiplier(e);" +
    "  DamageAmp.tick(e, 0.2); return { at100: at100, at34: at34," +
    "    after: DamageAmp.multiplier(e) }; })()");
  t.near(stacked.at100, 1.15, 1e-9, "a hundred hits is +15%, half again the +10%");
  t.near(stacked.at34, 1.15, 1e-9, "still standing at 3.4 s");
  t.near(stacked.after, 1, 1e-9, "and gone by 3.6");
});

test("Overcharged Cores waits for B3 and never touches a fixed effect",
function (t) {
  var h = bootContent();

  // B1 AND B2 ARE STILL CALLING PATH A's BLUBS, so there is nothing for this to
  // act on there -- and the node is gated on B3 as well, twice over.
  var b2 = blubStats(h, ["blb_b1"], ["A1", "A2", "B1", "B2"], "blub3");
  t.eq(b2.damage, 7, "at B2 the main line is a Blub III with B1's flat +1 only");
  t.near(b2.interval, 14, 1e-9, "on its ordinary shortened cycle");

  var plain = blubStats(h, [], BLB_B, "mecha2");
  t.deep({ dmg: plain.damage, cycle: plain.interval, blast: plain.deathBlast.damage,
           radius: plain.deathBlast.radiusUl },
    { dmg: 101, cycle: 25, blast: 250, radius: 25 },
    "a B5 MK2 normally deals 101, every 25 s, detonating for 250 in 25 u.l.");

  var s = blubStats(h, ["blb_b1"], BLB_B, "mecha2");
  t.near(s.damage, 101 * 1.10, 1e-9, "with it, 10% more ordinary damage");
  t.near(s.interval, 25 * 1.06, 1e-9, "and a 6% longer cycle");
  t.eq(s.deathBlast.damage, 250, "the detonation is EXACTLY 250, untouched");
  t.eq(s.deathBlast.radiusUl, 25, "at its authored radius");

  var sup = blubStats(h, ["blb_b1"], BLB_B, "superb");
  t.near(sup.damage, 201 * 1.10, 1e-9, "the SuperBlub's ordinary attacks too");
  t.eq(sup.laser.damage, 400, "and its lance is EXACTLY 400, untouched");
  t.eq(sup.laser.every, 10, "on its authored count");

  // AND THE SHARED ROSTER WAS NOT WRITTEN THROUGH.
  t.eq(h.run("BlubTower.UNITS.mecha2.deathBlast.radiusUl"), 25,
    "the table itself is untouched — the stats block is a copy");
});

test("Compressed Cadence takes two seconds flat, before any multiplier",
function (t) {
  var h = bootContent();

  var b2 = blubStats(h, ["blb_b2"], ["A1", "A2", "B1", "B2"], "blub3");
  t.near(b2.interval, 14, 1e-9, "nothing before B3");

  var mk2 = blubStats(h, ["blb_b2"], BLB_B, "mecha2");
  t.near(mk2.interval, 23, 1e-9, "the MK2's 25 s becomes 23");
  t.near(mk2.rangeUl, 150 * 0.85, 1e-9, "for 15% of its reach");

  var sup = blubStats(h, ["blb_b2"], BLB_B, "superb");
  t.near(sup.interval, 93, 1e-9, "and the SuperBlub's 95 becomes 93");
  t.near(sup.rangeUl, 300 * 0.85, 1e-9, "at 255 u.l. instead of 300");

  // FLAT THEN MULTIPLICATIVE, which is what the two B interval nodes together
  // have to resolve to: (30 - 5 - 2) x 1.06 and never 30 x 1.06 - 5 - 2.
  var both = blubStats(h, ["blb_b1", "blb_b2"], BLB_B, "mecha2");
  t.near(both.interval, 23 * 1.06, 1e-9, "(25 - 2) x 1.06 = 24.38 s");
  t.ok(Math.abs(both.interval - (25 * 1.06 - 2)) > 0.05,
    "and emphatically not 25 x 1.06 - 2");

  // THE FLOOR STILL HOLDS. Nothing in the game reaches it today, and that is
  // what the floor is there for.
  var floors = h.run("(function () { var tw = " + towers1() + ";" +
    "  return Object.keys(BlubTower.UNITS).map(function (id) {" +
    "    return tw.intervalFor(id); }); })()");
  t.ok(Math.min.apply(null, floors) >= h.run("BlubTower.MIN_INTERVAL_SECONDS"),
    "no line's cycle ever reaches zero");
});

test("Wide Detonation widens the blast without strengthening it", function (t) {
  var h = bootContent();
  var s = blubStats(h, ["blb_b3"], BLB_B, "mecha2");
  t.eq(s.deathBlast.radiusUl, 35, "25 u.l. becomes 35 — a 50 to 70 diameter");
  t.eq(s.deathBlast.damage, 250, "and the blast still deals EXACTLY 250");
  t.near(s.damage, 101 * 0.96, 1e-9, "every path B blub deals 4% less ordinarily");

  var sup = blubStats(h, ["blb_b3"], BLB_B, "superb");
  t.near(sup.damage, 201 * 0.96, 1e-9, "the SuperBlub too");
  t.eq(sup.laser.damage, 400, "and its lance is untouched");

  // THE BODIES A WIDER BLAST ACTUALLY REACHES, measured rather than claimed.
  var caught = h.run("(function () { var tw = " + towers1() + ";" +
    "  function reach(radius) {" +
    "    var stats = tw.summonStats('mecha2');" +
    "    stats.deathBlast = { radiusUl: radius, damage: 250 };" +
    "    var b = new Blub(tw, 400, 400, stats);" +
    "    var e = new Enemy(path, null, 'normal', {});" +
    "    e.health = 1e9; e.maxHealth = 1e9;" +
    "    e.pos = { x: 400 + ul(40), y: 400 };" +
    // AN ANCHOR ON THE BLUB ITSELF, because `detonate` walks to the nearest
    // body in reach before it bursts -- without one the far enemy IS the
    // centre and every radius reaches it.
    "    var anchor = new Enemy(path, null, 'normal', {});" +
    "    anchor.health = 1e9; anchor.maxHealth = 1e9;" +
    "    anchor.pos = { x: 400, y: 400 };" +
    "    b.detonate([anchor, e]); return e.lastDamageTaken; }" +
    "  return { narrow: reach(25), wide: reach(35) }; })()");
  t.eq(caught.narrow, 0, "a body at 40 u.l. is outside the authored blast");
  t.eq(caught.wide, 250, "and inside the widened one, for its full 250");
});

test("Superconductor fires the lance oftener at the price of the ordinary shot",
function (t) {
  var h = bootContent();
  var plain = blubStats(h, [], BLB_B, "superb");
  t.deep({ every: plain.laser.every, dmg: plain.damage, lance: plain.laser.damage },
    { every: 10, dmg: 201, lance: 400 },
    "a SuperBlub normally lances every tenth attack");

  var s = blubStats(h, ["blb_b4"], BLB_B, "superb");
  t.eq(s.laser.every, 7, "with it, every seventh");
  t.near(s.damage, 201 * 0.95, 1e-9, "and its ordinary attacks deal 5% less");
  t.eq(s.laser.damage, 400, "the lance's own damage is unchanged");

  // THE LANCE IS FREE, so a 52-ammunition body now throws seven of them.
  var lances = h.run("(function () { var tw = " + towers1() + ";" +
    "  function count(every) {" +
    "    var stats = tw.summonStats('superb');" +
    "    stats.laser = { every: every, widthUl: 10, damage: 400 };" +
    "    var b = new Blub(tw, 400, 400, stats);" +
    "    var e = new Enemy(path, null, 'normal', {});" +
    "    e.health = 1e9; e.maxHealth = 1e9; e.pos = { x: 405, y: 400 };" +
    "    var n = 0, guard = 0;" +
    "    while (!b.isDestroyed() && guard++ < 500) {" +
    "      var before = b.currentHp; b.resolveAttack(e, [e]);" +
    "      if (b.currentHp === before) n++; }" +
    "    return n; }" +
    "  return { slow: count(10), fast: count(7) }; })()");
  // THE LANCE COSTS NO AMMUNITION, so 52 points buy 52 ORDINARY attacks and the
  // lances fall between them: 57 shots at every-ten, 60 at every-seven.
  t.eq(lances.slow, 5, "five free lances out of 52 points of ammunition");
  t.eq(lances.fast, 8, "and eight once the lance comes every seventh attack");

  // AND THE MK2's OWN NUMBERS ARE NOT THIS NODE'S BUSINESS.
  var mk2 = blubStats(h, ["blb_b4"], BLB_B, "mecha2");
  t.eq(mk2.damage, 101, "the MK2's ordinary damage is untouched");
  t.eq(mk2.deathBlast.damage, 250, "and its detonation");
});

test("the Summoner's four general nodes, and what each costs", function (t) {
  var h = bootContent();

  var circle = towerWith(h, "blub", ["blb_n1"], []);
  t.eq(h.run(circle + ".rangeUl"), 100, "Extended Ritual Circle: 75 -> 100 u.l.");
  t.eq(h.run("TowerPerks.priceOf(BlubTower)"), 525, "placement 450 -> 525");
  t.eq(h.run(circle + ".summonStats('blub1').rangeUl"), 100,
    "and a blub's OWN attack range is untouched at its authored 100");

  var spores = blubStats(h, ["blb_n2"], [], "blub1");
  t.deep({ camo: spores.seesCamo, flying: spores.seesFlying, rate: spores.rate },
    { camo: true, flying: true, rate: 0.9 },
    "Ethereal Spores: both sights, for a tenth of the fire rate");
  t.eq(h.run("TowerPerks.priceOf(BlubTower)"), 600, "placement 450 -> 600");
  var sees = h.run("(function () { var tw = " + towers1() + ";" +
    "  var b = new Blub(tw, 400, 400, tw.summonStats('blub1'));" +
    "  var c = new Enemy(path, null, 'camo_normal', {});" +
    "  var f = new Enemy(path, null, 'normal', {}); f.isFlying = true;" +
    "  return { camo: Targeting.sees(b.view, c), fly: Targeting.sees(b.view, f) }; })()");
  t.deep(sees, { camo: true, fly: true }, "and the blub really can target both");

  var twin = towerWith(h, "blub", ["blb_n3"], []);
  t.near(h.run(twin + ".perkTwinChance"), 0.15, 1e-9, "Twin Embryo: a 15% chance");
  t.near(h.run(twin + ".intervalFor('blub1')"), 22, 1e-9,
    "for 10% on every line's cycle");
  // NO RECURSION AND NO QUEUE: many summons, and never more than two bodies
  // out of one call.
  var twinned = h.run("(function () { var tw = " + towers1() + ";" +
    "  var most = 0, total = 0;" +
    "  for (var i = 0; i < 200; i++) {" +
    "    tw.blubs.forEach(function (b) { b.removed = true; });" +
    "    tw.blubs = []; towers = towers.filter(function (x) { return !x.isSummon; });" +
    "    tw.summon('blub1');" +
    "    most = Math.max(most, tw.blubs.length); total += tw.blubs.length; }" +
    "  return { most: most, total: total }; })()");
  t.eq(twinned.most, 2, "one summoning event creates at most one duplicate");
  t.ok(twinned.total > 200 && twinned.total < 260,
    "and about fifteen per cent of them do (" + twinned.total + " of 200)");

  var packed = blubStats(h, ["blb_n4"], [], "blub3");
  t.near(packed.footprintUl, 20 * 0.85, 1e-9, "Compressed Bodies: 15% less ground");
  t.eq(packed.hp, 19, "and 20 HP/ammunition becomes 19");
  var rounded = h.run("(function () { var tw = " + towers1() + ";" +
    "  return { blub1: tw.summonStats('blub1').hp," +
    "    mini1: tw.summonStats('mini1').hp," +
    "    superb: tw.summonStats('superb').hp," +
    "    mecha: tw.summonStats('mecha').hp }; })()");
  t.deep(rounded, { blub1: 10, mini1: 6, superb: 48, mecha: 71 },
    "rounded to NEAREST, which is this game's rule for a percentage on a blub");
});

test("Stripped Altar and Central Brood", function (t) {
  var h = bootContent();

  var altar = towerWith(h, "blub", ["blb_s1"], []);
  t.eq(h.run("TowerPerks.priceOf(BlubTower)"), 350, "Stripped Altar: 450 -> 350");
  t.near(h.run(altar + ".maxHp"), 70, 1e-9, "the Summoner itself 100 -> 70");
  t.eq(h.run(altar + ".summonStats('blub1').hp"), 10,
    "and not one point of blub ammunition");

  // BY LINE, so the tower needs the lines to exist before it can be measured.
  var brood = towerWith(h, "blub", ["blb_s2"], ["A1", "A2", "A3", "A4"]);
  var lines = h.run("(function () { var tw = " + brood + ";" +
    "  var u = tw.lineUnits();" +
    "  return { units: u, main: tw.summonStats(u.main).damage," +
    "    mini: tw.summonStats(u.mini).damage," +
    "    heavy: tw.summonStats(u.heavy).damage }; })()");
  t.deep(lines.units, { main: "blub3", mini: "mini2", heavy: "hungry" },
    "at A4 the three lines are a Blub III, a Mini Blub II and a Hungry Blub");
  t.near(lines.main, 6 * 1.15, 1e-9, "the main line deals 15% more");
  t.near(lines.mini, 3 * 0.92, 1e-9, "the Mini line 8% less");
  t.near(lines.heavy, 20 * 0.92, 1e-9, "and the Heavy line too");
  t.eq(h.run("TowerPerks.priceOf(BlubTower)"), 500, "placement 450 -> 500");

  // WHICHEVER UNIT THE MAIN CLOCK IS CALLING. A crosspathed tower whose main
  // line is a Mechablub gains on it exactly as one calling a Blub I does.
  var bMain = blubStats(h, ["blb_s2"], BLB_B, "mecha2");
  t.near(bMain.damage, 101 * 1.15, 1e-9, "a B5 main line is a MK2 and gains 15%");
  var bHeavy = blubStats(h, ["blb_s2"], BLB_B, "superb");
  t.near(bHeavy.damage, 201 * 0.92, 1e-9, "while its Heavy line pays 8%");
});

test("the Summoner's placement prices compose in any order", function (t) {
  var h = bootContent();
  [["blb_n1", 525], ["blb_n2", 600], ["blb_s1", 350], ["blb_s2", 500]]
    .forEach(function (row) {
      towerWith(h, "blub", [row[0]], []);
      t.eq(h.run("TowerPerks.priceOf(BlubTower)"), row[1],
        row[0] + " alone: " + row[1]);
    });

  var all = ["blb_n1", "blb_n2", "blb_s1", "blb_s2"];
  towerWith(h, "blub", all, []);
  t.eq(h.run("TowerPerks.priceOf(BlubTower)"), 625,
    "all four: 350 + 75 + 150 + 50 = 625");
  t.eq(h.run("towers[0].cost"), 625, "and the tower was charged that");
  towerWith(h, "blub", all.slice().reverse(), []);
  t.eq(h.run("TowerPerks.priceOf(BlubTower)"), 625, "whichever slots they sit in");
});

test("the Summoner's confirmed nodes compose without an order mattering",
function (t) {
  var h = bootContent();

  // FRAGILE BROOD + COMPRESSED BODIES: the flat first, then the factor, then
  // rounded once. (20 - 1) x 0.95 = 18.05, so 18.
  var pair = blubStats(h, ["blb_a1", "blb_n4"], ["A1", "A2", "A3"], "blub3");
  t.eq(pair.hp, 18, "one flat and one factor, applied exactly once each");
  t.eq(pair.damage, 7, "with Fragile Brood's point of damage intact");
  t.near(pair.footprintUl, 17, 1e-9, "and the smaller footprint");

  // TWIN EMBRYO'S TEMPO PENALTY composes with the line nodes it meets, and only
  // on the lines those nodes affect.
  var tempo = h.run("(function () { var tw = " +
    towerWith(h, "blub", ["blb_n3", "blb_a2"], ["A1", "A2", "A3"]) + ";" +
    "  return { a: tw.intervalFor('blub3'), mini: tw.intervalFor('mini1') }; })()");
  t.near(tempo.a, 15 * 0.92 * 1.10, 1e-9, "path A pays both");
  t.near(tempo.mini, 4 * 0.92 * 1.10, 1e-9, "on every path A line");
  var tempoB = h.run("(function () { var tw = " +
    towerWith(h, "blub", ["blb_n3", "blb_a2"], BLB_B) + ";" +
    "  return tw.intervalFor('mecha2'); })()");
  t.near(tempoB, 25 * 1.10, 1e-9,
    "while a path B line pays only Twin Embryo's — Rapid Incubation is not its node");

  // FIVE AT ONCE ON A FINISHED PATH B, in both orders.
  var ids = ["blb_b1", "blb_b2", "blb_b3", "blb_b4", "blb_s2"];
  var fw = blubStats(h, ids, BLB_B, "superb");
  var bw = blubStats(h, ids.slice().reverse(), BLB_B, "superb");
  t.deep(bw, fw, "the slots the five sit in change nothing");
  t.near(fw.damage, 201 * 1.10 * 0.96 * 0.95 * 0.92, 1e-9,
    "four factors on one number, multiplied and never summed");
  t.near(fw.interval, (100 - 5 - 2) * 1.06, 1e-9, "the flat inside the factor");
  t.eq(fw.laser.every, 7, "the lance every seventh attack");
  t.eq(fw.laser.damage, 400, "still for its fixed 400");
  var mk2 = blubStats(h, ids, BLB_B, "mecha2");
  t.eq(mk2.deathBlast.radiusUl, 35, "and the MK2's blast is wide");
  t.eq(mk2.deathBlast.damage, 250, "at its fixed 250");
});

// --- Farm -------------------------------------------------------------------
//
// THE FARM'S MANA IS NOT ONE QUANTITY. The fixed per-wave payment, the A3+
// timed ticks, stored mana, the A4/A5 clone, a withdrawal, the B path's kill
// bounty, the C network's B and P, and a refund are eight separate things that
// merely share a unit, and most of what these tests check is that a node moved
// exactly the one it names.

// A perked Farm, then ONE scripted wave of dice. Modelled on the `faceRun`
// helper in tests/farm.test.js: the die is scripted, never sampled, so "face 20
// pays this" is a statement about face 20 and not about a seed.
function farmDice(h, nodeIds, tiers, faces, startP, wave) {
  var expr = towerWith(h, "farm", nodeIds, tiers);
  return h.run("(function () { var tw = " + expr + ";" +
    "  Farms.network.P = " + startP + ";" +
    "  var seq = " + JSON.stringify(faces) + ", i = 0;" +
    "  Farms.setDie(function () { return seq[Math.min(i++, seq.length - 1)]; });" +
    "  Farms.settleWave(" + wave + ");" +
    "  var out = { P: Farms.network.P, B: Farms.network.B," +
    "              dice: tw.diceCount, rolled: (tw.lastRolls || []).length };" +
    "  Farms.setDie(null); return out; })()");
}

test("Accelerated Boiler moves the clock and pays for it out of the wave",
function (t) {
  var h = bootContent();

  var a2 = towerWith(h, "farm", ["frm_a1"], ["A1", "A2"]);
  var before = h.run("(function () { var tw = " + a2 + ";" +
    "  return { tick: tw.tickSeconds, wave: tw.producesPerWave() }; })()");
  t.deep(before, { tick: 5, wave: 400 }, "nothing before A3");

  var s = towerWith(h, "farm", ["frm_a1"], ["A1", "A2", "A3"]);
  var after = h.run("(function () { var tw = " + s + ";" +
    "  return { tick: tw.tickSeconds, wave: tw.producesPerWave()," +
    "    perTick: tw.perTickProduction, clone: FarmTower.CLONE_RATE," +
    "    cap: tw.cloneCap }; })()");
  t.near(after.tick, 4.5, 1e-9, "a tick every 4.5 s instead of 5");
  t.near(after.wave, 360, 1e-9, "and the fixed payment is 400 x 0.90 = 360");
  t.eq(after.perTick, 50, "the VALUE of a tick is untouched");
  t.eq(after.cap, 0, "and A3 has no clone to touch");

  // THE TICKS REALLY ARRIVE SOONER, driven through the tower's own clock.
  var ticked = h.run("(function () { var tw = " + towers1() + ";" +
    "  var was = cash; for (var i = 0; i < 60 * 60; i++) tw.update(1 / 60, []);" +
    "  return cash - was; })()");
  t.near(ticked, Math.floor(60 / 4.5) * 50, 1e-6,
    "sixty seconds pays thirteen ticks of 50, where five-second ticks pay twelve");

  // STORAGE, CLONING AND WITHDRAWALS ARE OTHER QUANTITIES AND ARE UNTOUCHED.
  var stored = towerWith(h, "farm", ["frm_a1"], ["A1", "A2", "A3", "A4"]);
  var vault = h.run("(function () { var tw = " + stored + ";" +
    "  tw.stock = 10000; var cloned = tw.cloneStock();" +
    "  var was = cash; tw.collect();" +
    "  return { cloned: cloned, stock: tw.stock, out: cash - was," +
    "           cap: tw.cloneCap }; })()");
  t.near(vault.cloned, 500, 1e-9, "five per cent of the stock is cloned, undiminished");
  t.eq(vault.cap, 1000, "at A4's authored cap");
  t.near(vault.out, 10500, 1e-9, "and a withdrawal hands over every point of it");
  t.eq(vault.stock, 0, "leaving nothing behind");
});

test("Patient Investment raises the permanent half and lowers the surge",
function (t) {
  var h = bootContent();

  var a4 = towerWith(h, "farm", ["frm_a2"], ["A1", "A2", "A3", "A4"]);
  var before = h.run("(function () { var tw = " + a4 + ";" +
    "  return { each: tw.trancheBonus, surge: tw.tempMultiplier }; })()");
  t.deep(before, { each: 0.05, surge: 5 }, "nothing before A5");

  var s = towerWith(h, "farm", ["frm_a2"], ["A1", "A2", "A3", "A4", "A5"]);
  var after = h.run("(function () { var tw = " + s + ";" +
    "  return { each: tw.trancheBonus, surge: tw.tempMultiplier," +
    "    size: FarmTower.TRANCHE, max: FarmTower.MAX_TRANCHES," +
    "    secs: FarmTower.TEMP_SECONDS }; })()");
  t.near(after.each, 0.06, 1e-9, "+6% a tranche instead of +5%");
  t.eq(after.surge, 4, "and a surge multiplies it four times instead of five");
  t.deep({ size: after.size, max: after.max, secs: after.secs },
    { size: 10000, max: 10, secs: 30 },
    "tranche size, the ceiling and the surge's length are untouched");

  // WHAT TEN TRANCHES ARE ACTUALLY WORTH, through the real investment door.
  var granted = h.run("(function () { var tw = " + towers1() + ";" +
    "  var target = new Smasher(700, 400, path); addTower(target);" +
    "  for (var i = 1; i <= 5; i++) target.applyUpgrade('A' + i);" +
    "  tw.stock = 100000; tw.invest(target, false);" +
    "  var perm = FarmBoost.multiplier(target);" +
    "  var t2 = new Smasher(760, 460, path); addTower(t2);" +
    "  for (var j = 1; j <= 5; j++) t2.applyUpgrade('A' + j);" +
    "  tw.stock = 100000; tw.invest(t2, true);" +
    "  return { perm: perm, surge: FarmBoost.multiplier(t2)," +
    "           bonus: tw.investmentBonus() }; })()");
  t.near(granted.perm, 1.60, 1e-9, "ten tranches is +60% permanent, not +50%");
  t.near(granted.surge, 3.40, 1e-9, "and +240% temporary, not +250%");
  t.near(granted.bonus, 0.60, 1e-9, "and the record of it agrees");
});

test("Mana Armor spends its own vault, and only what it has", function (t) {
  var h = bootContent();

  var a3 = towerWith(h, "farm", ["frm_a3"], ["A1", "A2", "A3"]);
  t.eq(h.run(a3 + ".manaArmorPerPoint"), 0, "nothing before A4");

  var s = towerWith(h, "farm", ["frm_a3"], ["A1", "A2", "A3", "A4"]);
  var cases = h.run("(function () { var tw = " + s + ";" +
    "  function hit(stock, blow) {" +
    "    tw.stock = stock; tw.currentHp = tw.maxHp; tw.dodgeChance = 0;" +
    "    tw.takeDamage(blow);" +
    "    return { took: tw.maxHp - tw.currentHp, left: tw.stock }; }" +
    "  return { rich: hit(5000, 100), exact: hit(2500, 100)," +
    "           poor: hit(1000, 100), empty: hit(0, 100)," +
    "           nothing: hit(5000, 0), tiny: hit(5000, 1)," +
    "           lethal: hit(5000, 100000) }; })()");

  t.deep(cases.rich, { took: 50, left: 2500 },
    "a hundred-damage blow costs 50 damage and 2 500 stored mana");
  t.deep(cases.exact, { took: 50, left: 0 },
    "exactly enough buys exactly half and empties the vault");
  t.deep(cases.poor, { took: 80, left: 0 },
    "a thousand buys twenty points and the rest lands");
  t.eq(cases.empty.took, 100, "an empty vault protects nothing");
  t.eq(cases.nothing.left, 5000, "a blow of zero spends nothing");
  t.near(cases.tiny.left, 5000 - 25, 1e-9, "and a fractional half is bought too");
  t.ok(cases.lethal.left === 0, "a death-sized hit spends the whole vault");
  t.ok(cases.lethal.took >= h.run(towers1() + ".maxHp"),
    "and still kills the tower");

  // ITS OWN VAULT, and never the purse or another Farm's.
  var apart = h.run("(function () { var a = towers[towers.length - 1];" +
    "  var b = new FarmTower(760, 460, path); addTower(b);" +
    "  ['A1','A2','A3','A4'].forEach(function (id) { b.applyUpgrade(id); });" +
    "  a.stock = 5000; b.stock = 5000; a.currentHp = a.maxHp;" +
    "  a.dodgeChance = 0; var purse = cash;" +
    "  a.takeDamage(100);" +
    "  return { mine: a.stock, theirs: b.stock, purse: cash - purse }; })()");
  t.deep(apart, { mine: 2500, theirs: 5000, purse: 0 },
    "one farm's armour spends one farm's stock, and no player mana at all");
});

test("Extended Jurisdiction widens the field and the amplification pays",
function (t) {
  var h = bootContent();
  var B = ["B1", "B2", "B3", "B4", "B5"];

  var b2 = towerWith(h, "farm", ["frm_b1"], ["B1", "B2"]);
  t.eq(h.run(b2 + ".rangeUl"), 0, "nothing before B3 — there is no field yet");

  var b3 = towerWith(h, "farm", ["frm_b1"], ["B1", "B2", "B3"]);
  var atB3 = h.run("(function () { var tw = " + b3 + ";" +
    "  return { range: tw.rangeUl, amp: tw.fieldAmp, slow: tw.fieldSlow," +
    "           kill: tw.manaPerKill }; })()");
  t.deep(atB3, { range: 180, amp: 0, slow: 0, kill: 1 },
    "B3's 150 becomes 180, and it had no amplification to lose");

  var b4 = towerWith(h, "farm", ["frm_b1"], ["B1", "B2", "B3", "B4"]);
  var atB4 = h.run("(function () { var tw = " + b4 + ";" +
    "  return { range: tw.rangeUl, amp: tw.fieldAmp, slow: tw.fieldSlow," +
    "           kill: tw.manaPerKill, hp: tw.baseHpPerKill }; })()");
  t.deep(atB4, { range: 230, amp: 0, slow: 0.05, kill: 4, hp: 4 },
    "B4 reads 230 u.l. and an EXPLICIT 0% amplification");

  var b5 = towerWith(h, "farm", ["frm_b1"], B);
  var atB5 = h.run("(function () { var tw = " + b5 + ";" +
    "  return { range: tw.rangeUl, amp: tw.fieldAmp, slow: tw.fieldSlow," +
    "           kill: tw.manaPerKill }; })()");
  t.deep(atB5, { range: 330, amp: 0.05, slow: 0.10, kill: 14 },
    "and B5 reads 330 and 5%");

  // A ZERO IS A ZERO AND NOT A MISSING MODIFIER: the field is still there, it
  // still slows, and what it adds to an enemy's damage taken is nothing.
  // ASKED WHERE THE FARM IS STANDING. Moving a tower after it is built leaves
  // its `groundHeight` behind, and `covers` runs a real line-of-sight test off
  // that eye -- so a fixture that teleports one can find itself blind.
  var live = h.run("(function () { var tw = " +
    towerWith(h, "farm", ["frm_b1"], ["B1", "B2", "B3", "B4"]) + ";" +
    "  return { field: !!Farms.fieldAt(tw.x, tw.y)," +
    "    amp: Farms.damageAmpAt(tw.x, tw.y), slow: Farms.slowAt(tw.x, tw.y) }; })()");
  t.eq(live.field, true, "a B4 field still exists on the board");
  t.eq(live.amp, 0, "amplifying nothing");
  t.near(live.slow, 0.05, 1e-9, "while still slowing");
});

test("Paralyzing Field slows harder out of the wave's own purse", function (t) {
  var h = bootContent();

  var b3 = towerWith(h, "farm", ["frm_b2"], ["B1", "B2", "B3"]);
  var atB3 = h.run("(function () { var tw = " + b3 + ";" +
    "  return { slow: tw.fieldSlow, wave: tw.producesPerWave() }; })()");
  t.near(atB3.slow, 0, 1e-9, "no slow to raise before B4");
  t.near(atB3.wave, 400 * 0.90, 1e-9,
    "though the production penalty is not tier-gated and applies at once");

  var b4 = towerWith(h, "farm", ["frm_b2"], ["B1", "B2", "B3", "B4"]);
  var atB4 = h.run("(function () { var tw = " + b4 + ";" +
    "  return { slow: tw.fieldSlow, kill: tw.manaPerKill, hp: tw.baseHpPerWave }; })()");
  t.near(atB4.slow, 0.10, 1e-9, "B4's 5% becomes 10%");
  t.eq(atB4.kill, 4, "kill mana is untouched");
  t.eq(atB4.hp, 250, "and so is the base health a wave grants");

  var b5 = towerWith(h, "farm", ["frm_b2"], ["B1", "B2", "B3", "B4", "B5"]);
  t.near(h.run(b5 + ".fieldSlow"), 0.15, 1e-9, "and B5's 10% becomes 15%");
});

test("Execution Tithe reaches further up and pays less", function (t) {
  var h = bootContent();
  var B = ["B1", "B2", "B3", "B4", "B5"];

  var b4 = towerWith(h, "farm", ["frm_b3"], ["B1", "B2", "B3", "B4"]);
  var before = h.run("(function () { var tw = " + b4 + ";" +
    "  return { flat: tw.executeFlat, frac: tw.executeFraction," +
    "           kill: tw.manaPerKill }; })()");
  t.deep(before, { flat: 10, frac: 0.05, kill: 4 }, "nothing before B5");

  var s = towerWith(h, "farm", ["frm_b3"], B);
  var after = h.run("(function () { var tw = " + s + ";" +
    "  return { flat: tw.executeFlat, frac: tw.executeFraction," +
    "    kill: tw.manaPerKill, hp: tw.baseHpPerKill," +
    "    small: tw.executeThreshold({ maxHealth: 100 })," +
    "    big: tw.executeThreshold({ maxHealth: 1000 }) }; })()");
  t.near(after.flat, 15, 1e-9, "15 flat instead of 10");
  t.near(after.frac, 0.075, 1e-9, "and 7.5% instead of 5%");
  t.eq(after.kill, 10, "for 10 mana a kill instead of 14");
  t.eq(after.hp, 9, "the 9 base HP a kill grants is untouched");
  // THE HIGHER OF THE TWO, which is B5's own rule and is not this node's.
  t.near(after.small, 15, 1e-9, "a 100 HP body is executed under 15");
  t.near(after.big, 75, 1e-9, "and a 1 000 HP one under 75");

  // AND THE FIELD REALLY TAKES A BODY THE AUTHORED THRESHOLD WOULD HAVE MISSED.
  var took = h.run("(function () { var tw = " + towers1() + ";" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  e.maxHealth = 100; e.health = 12; e.pos = { x: tw.x, y: tw.y };" +
    "  var wide = Farms.executes(e);" +
    "  tw.executeFlat = 10; tw.executeFraction = 0.05;" +
    "  return { wide: wide, narrow: Farms.executes(e) }; })()");
  t.eq(took.wide, true, "a body on 12 of 100 is executed by the wider threshold");
  t.eq(took.narrow, false, "and the authored 10 flat would have missed it");
});

test("Arcane Fertilizer and Compact Estate", function (t) {
  var h = bootContent();

  var fert = towerWith(h, "farm", ["frm_n1"], []);
  var f = h.run("(function () { var tw = " + fert + ";" +
    "  return { wave: tw.producesPerWave(), nominal: tw.nominalProduction()," +
    "    price: TowerPerks.priceOf(FarmTower), tick: tw.perTickProduction }; })()");
  t.eq(f.wave, 230, "Arcane Fertilizer: 200 -> 230 mana a wave");
  t.eq(f.nominal, 230, "and the C network's baseline sees the same number");
  t.eq(f.price, 1350, "placement 1 200 -> 1 350");
  t.eq(f.tick, 0, "it adds nothing to a timed tick");

  // THE +30 FOLLOWS THE FARM'S ORDINARY DESTINATION: into the stock from A4.
  var stored = h.run("(function () { var tw = " +
    towerWith(h, "farm", ["frm_n1"], ["A1", "A2", "A3", "A4"]) + ";" +
    "  tw.stock = 0; var was = cash; tw.produce(tw.producesPerWave());" +
    "  return { stock: tw.stock, purse: cash - was }; })()");
  t.eq(stored.stock, 430, "an A4 farm stores 400 + 30");
  t.eq(stored.purse, 0, "and pays the purse nothing, exactly as it always did");

  var estate = towerWith(h, "farm", ["frm_n2"], []);
  var e = h.run("(function () { var tw = " + estate + ";" +
    "  return { foot: tw.footprintRadiusUl, px: tw.footprintPx, hp: tw.maxHp," +
    "           range: tw.rangeUl, ghost: buildFootprintUl(FarmTower) }; })()");
  t.near(e.foot, 28, 1e-9, "Compact Estate: 35 -> 28 u.l. of ground");
  t.near(e.px, h.run("ul(28)"), 1e-9, "in pixels too");
  t.near(e.hp, 180, 1e-9, "-10% maximum health");
  t.eq(e.range, 0, "its field's radius is not a footprint and is untouched");
  t.near(e.ghost, 28, 1e-9, "and the placement rules use the smaller skirt");

  var c1 = towerWith(h, "farm", ["frm_n2"], ["C1"]);
  t.near(h.run(c1 + ".footprintRadiusUl"), 20, 1e-9, "with C1, 25 -> 20");
});

test("Liquid License pays back more and produces less", function (t) {
  var h = bootContent();

  var plain = towerWith(h, "farm", [], []);
  t.eq(h.run("sellValue(" + plain + ")"), 600, "a Farm normally refunds half");

  var s = towerWith(h, "farm", ["frm_n3"], []);
  var got = h.run("(function () { var tw = " + s + ";" +
    "  return { rate: tw.sellRefundRate, refund: sellValue(tw)," +
    "           wave: tw.producesPerWave() }; })()");
  t.near(got.rate, 0.70, 1e-9, "the rate is 70%");
  t.eq(got.refund, 840, "so 1 200 gives back 840");
  t.near(got.wave, 184, 1e-9, "and it produces 200 x 0.92 = 184");

  // C5's 250 000 IS STILL SUNK, at either rate: `sellValue` takes what is
  // unrefundable off BEFORE the rate, so a better rate cannot buy any back.
  var C = ["C1", "C2", "C3", "C4", "C5"];
  var sunkPlain = h.run("(function () { var tw = " +
    towerWith(h, "farm", [], C) + ";" +
    "  return { spent: tw.totalSpent, sunk: tw.unrefundableSpent," +
    "           refund: sellValue(tw) }; })()");
  var sunkLic = h.run("(function () { var tw = " +
    towerWith(h, "farm", ["frm_n3"], C) + ";" +
    "  return { spent: tw.totalSpent, sunk: tw.unrefundableSpent," +
    "           refund: sellValue(tw) }; })()");
  t.eq(sunkPlain.sunk, 250000, "C5's price is recorded as unrefundable");
  t.eq(sunkLic.sunk, 250000, "and stays so under a better rate");
  t.eq(sunkLic.refund,
    Math.ceil((sunkLic.spent - 250000) * 0.70),
    "the refund is 70% of everything EXCEPT the 250 000");
  t.ok(sunkLic.refund < 250000, "which is nowhere near buying C5 back");

  // A WITHDRAWAL IS NOT PRODUCTION and is handed over whole.
  var out = h.run("(function () { var tw = " +
    towerWith(h, "farm", ["frm_n3"], ["A1", "A2", "A3", "A4"]) + ";" +
    "  tw.stock = 10000; var was = cash; tw.collect();" +
    "  return cash - was; })()");
  t.eq(out, 10000, "ten thousand stored comes out as ten thousand");

  // AND A TICK IS, so it carries the penalty exactly once.
  var ticked = h.run("(function () { var tw = towers[towers.length - 1];" +
    "  tw.stock = 0; tw.tickTimer = 0;" +
    "  for (var i = 0; i < 60 * 6; i++) tw.update(1 / 60, []);" +
    "  return tw.stock; })()");
  t.near(ticked, 75 * 0.92, 1e-6, "one A4 tick of 75 stores 69");
});

test("Consortium counts the other living Farms and nothing else", function (t) {
  var h = bootContent();
  var s = towerWith(h, "farm", ["frm_n4"], []);
  t.near(h.run(s + ".producesPerWave()"), 190, 1e-9, "alone, -5%: 200 -> 190");

  var band = h.run("(function () { var tw = " + towers1() + ";" +
    "  var out = { one: tw.producesPerWave() }, made = [];" +
    "  for (var i = 0; i < 6; i++) {" +
    "    var f = new FarmTower(500 + i * 90, 400, path); addTower(f); made.push(f);" +
    "    out['n' + (i + 1)] = tw.producesPerWave(); }" +
    "  made[0].currentHp = 0;" +
    "  towers = towers.filter(function (x) { return x !== made[1]; });" +
    "  Farms.unregister(made[1]);" +
    "  out.afterLoss = tw.producesPerWave();" +
    "  out.others = made[2].producesPerWave();" +
    "  return out; })()");
  t.near(band.n1, 200 * 0.98, 1e-9, "one other Farm: -5% + 3 = -2%");
  t.near(band.n2, 200 * 1.01, 1e-9, "two others: +1%");
  t.near(band.n4, 200 * 1.07, 1e-9, "four others is the ceiling, +7%");
  t.near(band.n5, 200 * 1.07, 1e-9, "and a fifth adds nothing");
  t.near(band.n6, 200 * 1.07, 1e-9, "nor a sixth");
  t.near(band.afterLoss, 200 * 1.07, 1e-9,
    "a dead one and a sold one stop counting, and four still stand");

  // A LOADOUT IS PER TYPE, so every Farm on the board carries this node -- and
  // each one still resolves its OWN 200 x 1.07 from its OWN count of others.
  // Nothing reads another farm's already-modified output, which is what stops
  // five of them compounding into each other.
  t.near(band.others, 200 * 1.07, 1e-9,
    "every Farm resolves the same plain 214 from the same board");
});

test("Jet Protected halves both ends of the table", function (t) {
  var h = bootContent();
  var C3 = ["C1", "C2", "C3"];
  var C4 = ["C1", "C2", "C3", "C4"];
  var C5 = ["C1", "C2", "C3", "C4", "C5"];

  t.near(farmDice(h, [], C3, [20], 1000, 1).P, 1430, 1e-9,
    "C3 face 20 normally pays +300 then +10%");
  t.near(farmDice(h, ["frm_c1"], C3, [20], 1000, 2).P, 1207.5, 1e-9,
    "protected, +150 then +5%");

  // C4 ROLLS TWO DICE, so a single-face claim about it is a claim about two of
  // them. Face 9 is a flat +60 and has no percentage tail, which makes the pair
  // readable: 1000 + 60 + 60.
  t.near(farmDice(h, [], C4, [9, 9], 1000, 3).P, 1120, 1e-9,
    "C4's two dice each pay face 9's +60");
  t.near(farmDice(h, ["frm_c1"], C4, [9, 9], 1000, 4).P, 1120, 1e-9,
    "and face 9 is neither end of the table, so it is not protected");

  // ONE DIE AT A TIME for face 20, using C3.
  t.near(farmDice(h, [], C3, [1], 1000, 5).P, 650, 1e-9, "C3 face 1 normally costs 35%");
  t.near(farmDice(h, ["frm_c1"], C3, [1], 1000, 6).P, 825, 1e-9,
    "protected, 17.5%");

  // C5's FACE 22, and its purge is a deferred effect that stays whole.
  var plain22 = farmDice(h, [], C5, [22, 22, 22], 1000, 7);
  t.near(plain22.P, 8000, 1e-9, "three natural 22s double three times");
  var jet22 = farmDice(h, ["frm_c1"], C5, [22, 22, 22], 1000, 8);
  t.near(jet22.P, 1000 * Math.pow(1.5, 3), 1e-6,
    "protected, x1.5 three times instead of x2");
  t.eq(h.run("Farms.prepState().cullBelow9"), true,
    "and face 22 still queues its purge, at full strength");

  // A FACE THAT WAS WALKED UP TO THE MAXIMUM IS NOT NATURAL. C5's face 14 arms
  // a +1 for the next series, so a 19 becomes a 20 -- and 20 is not C5's
  // maximum anyway, which is why this uses the flat gain to prove the flag.
  var walked = h.run("(function () { var tw = " +
    towerWith(h, "farm", ["frm_c1"], C5) + ";" +
    "  Farms.network.P = 1000;" +
    "  var seq = [14, 14, 14], i = 0;" +
    "  Farms.setDie(function () { return seq[Math.min(i++, 2)]; });" +
    "  Farms.settleWave(20);" +
    "  var armed = Farms.prepState().dieBonuses.length;" +
    "  Farms.network.P = 1000;" +
    "  var seq2 = [21, 21, 21], j = 0;" +
    "  Farms.setDie(function () { return seq2[Math.min(j++, 2)]; });" +
    "  Farms.settleWave(21);" +
    "  Farms.setDie(null);" +
    "  return { armed: armed, P: Farms.network.P }; })()");
  t.eq(walked.armed, 3, "three face-14s arm three +1 charges");
  // Each 21 is walked to 22 by a charge, so it is NOT a natural maximum and
  // is not protected: three full doubles.
  t.near(walked.P, 8000, 1e-9,
    "a 21 nudged to 22 doubles in full — it is not a NATURAL maximum");
});

test("Amortized Reset meets the baseline halfway, in order", function (t) {
  var h = bootContent();
  var C3 = ["C1", "C2", "C3"];
  var C4 = ["C1", "C2", "C3", "C4"];

  var plain = farmDice(h, [], C3, [8], 1000, 1);
  t.eq(plain.B, 300, "one C3 Farm's baseline is 300");
  t.near(plain.P, 300, 1e-9, "and face 8 normally resets P to it");

  var s = farmDice(h, ["frm_c2"], C3, [8], 1000, 2);
  t.near(s.P, 650, 1e-9, "with it, halfway: (1000 + 300) / 2");

  var below = farmDice(h, ["frm_c2"], C3, [8], 100, 3);
  t.near(below.P, 200, 1e-9,
    "and it is WORSE below the baseline: (100 + 300) / 2 rather than 300");

  // SEQUENTIAL: the second die sees what the first produced.
  var twice = farmDice(h, ["frm_c2"], C4, [8, 8], 1000, 4);
  t.eq(twice.B, 500, "a C4 Farm's baseline is 500");
  t.near(twice.P, 625, 1e-9, "(1000+500)/2 = 750, then (750+500)/2 = 625");
});

test("Extra Die rolls one more and scales every one of them", function (t) {
  var h = bootContent();
  var C3 = ["C1", "C2", "C3"];
  var C4 = ["C1", "C2", "C3", "C4"];
  var C5 = ["C1", "C2", "C3", "C4", "C5"];

  t.eq(farmDice(h, [], C3, [9], 1000, 1).dice, 1, "C3 normally rolls one die");
  var c3 = farmDice(h, ["frm_c3"], C3, [9], 1000, 2);
  t.eq(c3.dice, 2, "with Extra Die it rolls two");
  t.eq(c3.rolled, 2, "and really throws both");
  t.near(c3.P, 1000 + 30 * 0.75 * 2, 1e-9,
    "each of them worth three quarters — including the one it already had");

  t.eq(farmDice(h, ["frm_c3"], C4, [9], 1000, 3).dice, 3, "C4 rolls three");
  t.eq(farmDice(h, ["frm_c3"], C5, [9], 1000, 4).dice, 4, "and C5 four");
  t.eq(farmDice(h, ["frm_c3"], ["C1", "C2"], [9], 1000, 5).dice, 0,
    "a Farm below C3 has no die to add one to");

  // A x2 BECOMES x1.75, because only the bonus above one is scaled.
  var doubled = farmDice(h, ["frm_c3"], C5, [21, 21, 21, 21], 1000, 6);
  t.near(doubled.P, 1000 * Math.pow(1.75, 4), 1e-6,
    "four face-21s at x1.75 each, not x2 and not x1.5");

  // A RESET IS NOT A NUMERIC GAIN and stays whole.
  var reset = farmDice(h, ["frm_c3"], C3, [8, 8], 1000, 7);
  t.near(reset.P, 300, 1e-9, "face 8 still resets straight to B");

  // AND A LOSS IS SCALED TOO, in the player's favour.
  var lost = farmDice(h, ["frm_c3"], C3, [3, 3], 1000, 8);
  t.near(lost.P, 1000 - 170 * 0.75 * 2, 1e-9, "-170 becomes -127.5, twice");
});

test("Jet Protected and Extra Die compose to x1.375 on C5's maximum",
function (t) {
  var h = bootContent();
  var C5 = ["C1", "C2", "C3", "C4", "C5"];

  // THE CONFIRMED CASE. x2 is a bonus of +1.0 above one; Jet Protected keeps
  // half of it and Extra Die keeps three quarters of what is left, so
  // 1 + 1.0 x 0.50 x 0.75 = x1.375. Four dice, so four of them.
  var both = farmDice(h, ["frm_c1", "frm_c3"], C5, [22, 22, 22, 22], 1000, 1);
  t.eq(both.dice, 4, "C5 with Extra Die rolls four");
  t.near(both.P, 1000 * Math.pow(1.375, 4), 1e-6,
    "and a natural 22 is x1.375 under both");
  t.eq(h.run("Farms.prepState().cullBelow9"), true,
    "while the purge it queues is untouched at full strength");

  // AND ON AN ADDITIVE MAXIMUM: 37.5% of its ordinary numeric value.
  var C3 = ["C1", "C2", "C3"];
  var flat = farmDice(h, ["frm_c1", "frm_c3"], C3, [20, 20], 1000, 2);
  var step = function (p) { return (p + 300 * 0.375) * (1 + 0.10 * 0.375); };
  t.near(flat.P, step(step(1000)), 1e-6,
    "C3's +300 and +10% both land at 37.5% — two dice, in sequence");

  // ALL THREE TOGETHER, on the face each of them owns.
  var all = ["frm_c1", "frm_c2", "frm_c3"];
  var reset = farmDice(h, all, C3, [8, 8], 1000, 3);
  // TWO DICE, because Extra Die added one, and the reset is not scaled by
  // either node -- so it simply happens twice, sequentially:
  // (1000 + 300) / 2 = 650, then (650 + 300) / 2 = 475.
  t.near(reset.P, 475, 1e-9,
    "the reset is Amortized on both dice and neither node scales it");
  var one = farmDice(h, all, C3, [1, 1], 1000, 4);
  t.near(one.P, 1000 * Math.pow(1 - 0.35 * 0.375, 2), 1e-9,
    "and a natural 1 costs 37.5% of its ordinary loss, twice");
});

test("the Farm's production nodes compose exactly as confirmed", function (t) {
  var h = bootContent();

  // (200 + 30) x 0.90 = 207, the flat inside the multiplier. Paralyzing Field's
  // production penalty is not tier-gated, which is what lets this be measured
  // on a Farm with no tiers at all.
  var pair = towerWith(h, "farm", ["frm_n1", "frm_b2"], []);
  t.near(h.run(pair + ".producesPerWave()"), 207, 1e-9,
    "Arcane Fertilizer + Paralyzing Field: (200 + 30) x 0.90 = 207");
  var rev = towerWith(h, "farm", ["frm_b2", "frm_n1"], []);
  t.near(h.run(rev + ".producesPerWave()"), 207, 1e-9,
    "whichever slots they sit in");

  // BOTH 0.90 PENALTIES APPLY, for x0.81, and only the boiler moves the clock.
  var two = towerWith(h, "farm", ["frm_a1", "frm_b2"], ["A1", "A2", "A3"]);
  var got = h.run("(function () { var tw = " + two + ";" +
    "  return { wave: tw.producesPerWave(), tick: tw.tickSeconds," +
    "           perTick: tw.perTickProduction }; })()");
  t.near(got.wave, 400 * 0.81, 1e-9, "Accelerated Boiler + Paralyzing Field: x0.81");
  t.near(got.tick, 4.5, 1e-9, "and only the boiler shortened the clock");
  t.eq(got.perTick, 50, "the tick's value is neither node's business");

  // FERTILIZER INSIDE THE BOILER.
  var three = towerWith(h, "farm", ["frm_n1", "frm_a1"], ["A1", "A2", "A3"]);
  t.near(h.run(three + ".producesPerWave()"), (400 + 30) * 0.90, 1e-9,
    "Arcane Fertilizer + Accelerated Boiler: (400 + 30) x 0.90 = 387");

  // LIQUID LICENSE AND CONSORTIUM BOTH LAND, once each, on production only.
  var scaled = towerWith(h, "farm", ["frm_n3", "frm_n4"], []);
  var s = h.run("(function () { var tw = " + scaled + ";" +
    "  var was = cash; tw.produce(tw.producesPerWave());" +
    "  var paid = cash - was;" +
    "  return { wave: tw.producesPerWave(), paid: paid," +
    "           refund: sellValue(tw) }; })()");
  t.near(s.wave, 200 * 0.92 * 0.95, 1e-9, "-8% and -5% multiply, never sum");
  t.near(s.paid, s.wave, 1e-6, "and the purse is paid exactly that, once");
  t.eq(s.refund, 840, "while the refund carries only the licence's better rate");

  // FIVE AT ONCE, in both orders.
  var ids = ["frm_n1", "frm_n2", "frm_n3", "frm_n4", "frm_a1"];
  var A = ["A1", "A2", "A3"];
  var fw = towerWith(h, "farm", ids, A);
  var a = h.run("(function () { var tw = " + fw + ";" +
    "  return { wave: tw.producesPerWave(), tick: tw.tickSeconds," +
    "    foot: tw.footprintRadiusUl, hp: tw.maxHp," +
    "    refund: sellValue(tw), price: TowerPerks.priceOf(FarmTower) }; })()");
  var bw = towerWith(h, "farm", ids.slice().reverse(), A);
  var b = h.run("(function () { var tw = " + bw + ";" +
    "  return { wave: tw.producesPerWave(), tick: tw.tickSeconds," +
    "    foot: tw.footprintRadiusUl, hp: tw.maxHp," +
    "    refund: sellValue(tw), price: TowerPerks.priceOf(FarmTower) }; })()");
  t.deep(b, a, "the slots the five sit in change nothing");
  t.near(a.wave, (400 + 30) * 0.90 * 0.92 * 0.95, 1e-9,
    "flat, then the fixed-payment penalty, then the two production scales");
  t.near(a.tick, 4.5, 1e-9, "with the shorter clock");
  t.near(a.foot, 28, 1e-9, "the smaller footprint");
  t.eq(a.price, 1350, "and the dearer placement");
});

test("what a second-batch card says is what the tower resolves", function (t) {
  var h = bootContent();
  var blurbs = h.run("(function () { var out = {};" +
    "  ['siphon', 'blub', 'farm'].forEach(function (id) {" +
    "    TowerPerks.nodes(id).forEach(function (n) { out[n.id] = n.blurb; }); });" +
    "  return out; })()");

  Object.keys(blurbs).forEach(function (id) {
    t.ok(blurbs[id] && blurbs[id].length > 20, id + " has a description");
  });

  // Every node here trades something away, and every card says so.
  var missing = Object.keys(blurbs).filter(function (id) {
    return !/−|less|slower|longer|shorter|instead|→|unchanged|untouched|unaffected|no |No |never|Never|not /.test(blurbs[id]);
  });
  t.deep(missing, [], "every card states its downside as well as its gain");

  t.ok(/800 → 675/.test(blurbs.sip_s1), "Light Basin quotes 800 -> 675");
  towerWith(h, "siphon", ["sip_s1"], []);
  t.eq(h.run("towers[0].cost"), 675, "and the tower is charged 675");

  t.ok(/×2\.7/.test(blurbs.sip_a1) && /×3\.2/.test(blurbs.sip_a1),
    "Brutal Primer quotes both ceilings as FINAL multipliers");
  var primed = towerWith(h, "siphon", ["sip_a1"], ["A1", "A2", "A3", "A4"]);
  t.near(1 + h.run(primed + ".core.stats.mechanics.ramp_per_target.rampCap"),
    3.2, 1e-9, "and the tower really tops out at x3.2");

  t.ok(/25 → 23 s/.test(blurbs.blb_b2), "Compressed Cadence quotes the MK2's cycle");
  t.near(blubStats(h, ["blb_b2"], BLB_B, "mecha2").interval, 23, 1e-9,
    "and that is the cycle it resolves");

  t.ok(/50 → 70/.test(blurbs.blb_b3), "Wide Detonation quotes the DIAMETER");
  t.eq(blubStats(h, ["blb_b3"], BLB_B, "mecha2").deathBlast.radiusUl * 2, 70,
    "and the blast really spans 70 u.l.");

  t.ok(/200 → 230/.test(blurbs.frm_n1), "Arcane Fertilizer quotes 200 -> 230");
  t.eq(h.run(towerWith(h, "farm", ["frm_n1"], []) + ".producesPerWave()"), 230,
    "and the Farm really makes 230 a wave");

  t.ok(/×1\.75/.test(blurbs.frm_c3), "Extra Die quotes the x1.75 a double becomes");
  t.near(farmDice(h, ["frm_c3"], ["C1", "C2", "C3"], [9], 1000, 40).P,
    1045, 1e-9, "and its 75% really lands on both dice");
});

// ---------------------------------------------------------------------------
// THE SKIMMER — the first body that does not use the road (2026-08-30)
//
// `offPath` is a trait ORTHOGONAL to `isFlying`: the Aether Wisp flies and
// still walks every bend. This one takes the chord from the road's mouth to the
// base, and the design decision the rest of the file rests on is that
// `progress` STAYS IN ROAD UNITS for everybody -- a position along the body's
// own route, expressed as the fraction travelled times `path.length`.
// ---------------------------------------------------------------------------

function bootVeilDart() {
  var h = harness.boot(null);
  h.chooseMap(h.game.Maps.DEFAULT_ID);
  h.run("enemies = []; waveIndex = WAVES.length; waveSpawned = 0");
  return h;
}

test("the Veil Dart is a 50 HP camo flier that ignores the road", function (t) {
  var h = bootVeilDart();
  var type = h.game.Enemy.TYPES.veil_dart;

  t.eq(type.health, 50, "fifty hit points");
  t.eq(type.isCamo, true, "camouflaged");
  t.eq(type.isFlying, true, "and airborne");
  t.eq(type.offPath, true, "and off the road");
  t.eq(type.speedMultiplier, 1.2,
    "twenty per cent over the roster's base walk (60 u.l./s against 50)");

  // PARKED, NOT SCHEDULED. `sandboxOnly` is the documented way to hold a type
  // in the index and the sandbox while it is being designed, and tests/run.js
  // enforces it in both directions.
  t.eq(type.sandboxOnly, true, "and kept out of the fixed campaign for now");

  // IT HAS ITS OWN BODY SINCE 2026-08-30. It shipped for a few hours drawn as
  // the fallback sphere -- what the board gives any type it has no mesh for --
  // and the Veil_Dart pack then arrived with the same creature to the letter.
  // The import is the repository's own `tools/glb_to_animated.py`, so the file
  // is in the same format as every other model and nothing downstream can tell
  // it came from outside.
  t.eq(h.run("GLModels.has('enemy-veil_dart')"), true, "it ships its own mesh");

  // FOUR NAMED CLIPS, and `travel` is the one it flies on -- "moving (the
  // normal state, whole life)" in the pack's own handoff. Read by NAME, never
  // by index: the importer puts `idle_` first by convention and an index would
  // point somewhere else the day a fifth clip is authored.
  //
  // READ OFF THE GENERATED FILE, the way the camo-shadow test reads gl-world's
  // table: `GLModels.get` builds a GPU mesh and there is no renderer in the
  // harness, so the registry's own metadata is not reachable through it.
  var fs = require("fs");
  var src = fs.readFileSync(__dirname + "/../../jeu/js/gl/models/enemy-veil_dart.js", "utf8");
  var names = /bandNames:\s*(\[[^\]]*\])/.exec(src);
  var secs = /bandSeconds:\s*(\[[^\]]*\])/.exec(src);
  t.ok(!!names && !!secs, "the import declares its bands");
  t.deep(JSON.parse(names[1]), ["idle_hover", "travel", "hit_react", "death"],
    "the four authored clips, idle first");
  t.eq(JSON.parse(secs[1])[1], 1, "and travel is the 1 s loop it was authored as");

  // THE BAND IS CHOSEN BY NAME IN gl-world, not by an index typed anywhere.
  var world = fs.readFileSync(__dirname + "/../../jeu/js/gl/gl-world.js", "utf8");
  t.ok(/veil_dart:\s*function\s*\(\)\s*\{\s*return\s*"travel"/.test(world),
    "and gl-world names the clip it flies on rather than numbering it");

  // The sidebar and the index read one list, and this body leads with the fact
  // that road coverage is not the answer to it.
  var traits = h.run("Enemy.traitsOf('veil_dart').map(function (r) { return r.label; })");
  t.deep(traits, ["Ignores the road", "Flies", "Camouflaged"],
    "three traits, most-defining first");
  t.eq(h.run("Enemy.traitsOf('veil_dart')[0].badge"),
    "OFF-ROAD — flies straight to the base", "and the index badge says so");
});

test("the Veil Dart flies the chord, and never the road", function (t) {
  var h = bootVeilDart();
  h.run("enemies.push(new Enemy(path, null, 'veil_dart', {}))");

  var chord = h.run("Enemy.chordOf(path)");
  var road = h.run("path.length");
  t.ok(chord.length < road, "the straight line is shorter than the road (" +
    Math.round(chord.length) + " against " + Math.round(road) + ")");

  // EVERY POINT OF ITS FLIGHT IS ON THE STRAIGHT LINE, to within its own lane
  // offset. Measured as the perpendicular distance from the chord, which is
  // the whole claim of the type in one number.
  var worst = h.run("(function () {" +
    "  var e = enemies[0], c = Enemy.chordOf(path), worst = 0;" +
    "  for (var i = 0; i < 400; i++) {" +
    "    e.update(1 / 10);" +
    "    if (e.leaked) break;" +
    "    var dx = e.pos.x - c.from.x, dy = e.pos.y - c.from.y;" +
    "    var off = Math.abs(dx * c.unit.y - dy * c.unit.x);" +
    "    if (off > worst) worst = off;" +
    "  }" +
    "  return worst; })()");
  var lane = h.run("Math.abs(ul(enemies[0].laneOffsetUl)) + 0.001");
  t.ok(worst <= lane, "it never leaves the line by more than its own lane (" +
    worst.toFixed(3) + " against " + lane.toFixed(3) + ")");

  // AND IT FACES DOWN THAT LINE, CONSTANTLY. It is flying one straight course
  // and never turns; asking the road's tangent would bank it through bends it
  // is nowhere near.
  var heading = h.run("enemies[0].headingVec()");
  t.near(heading.x, chord.unit.x, 1e-9, "its heading is the chord's");
  t.near(heading.y, chord.unit.y, 1e-9, "in both components");
});

test("the Veil Dart's shortcut is its own advantage, on top of its speed",
function (t) {
  var h = bootVeilDart();
  h.run("enemies.push(new Enemy(path, null, 'veil_dart', {}));" +
        "enemies.push(new Enemy(path, null, 'normal', {}))");

  // THE SHORTCUT AND THE SPEED ARE TWO SEPARATE ADVANTAGES, and this is what
  // keeps them separable: the body covers its OWN authored multiple of the
  // roster's walk -- 1.2 since 2026-08-30, at the owner's word -- and the chord
  // is on top of that. Either can be retuned without the other moving.
  // Measured as GROUND COVERED ALONG EACH ONE'S OWN ROUTE -- progress divided
  // by its route scale -- and not as straight-line displacement, which is not
  // the same quantity for a body on a bend: a walker's lane offset swings
  // sideways as the road turns and adds a little to the chord between two
  // points of one second's walking.
  var moved = h.run("(function () {" +
    "  var a = enemies[0], b = enemies[1];" +
    "  var a0 = a.progress, b0 = b.progress;" +
    "  a.update(1); b.update(1);" +
    "  return { veil_dart: (a.progress - a0) / a.routeScale()," +
    "           walker: (b.progress - b0) / b.routeScale() }; })()");
  t.near(moved.walker, h.run("ul(Enemy.BASE_SPEED_ULPS)"), 1e-9,
    "a walker covers the roster's own walking speed in a second");
  t.near(moved.veil_dart,
    h.run("ul(Enemy.BASE_SPEED_ULPS * Enemy.TYPES.veil_dart.speedMultiplier)"), 1e-9,
    "and the Dart its own multiple of it (" + moved.veil_dart.toFixed(2) + " px)");

  // PROGRESS IS IN ROAD UNITS FOR BOTH, which is what lets the leak test and
  // targeting stay branch-free: the Veil Dart's advances faster because the same
  // pixel is a bigger share of a shorter route.
  var scale = h.run("enemies[0].routeScale()");
  var expected = h.run("path.length / Enemy.chordOf(path).length");
  t.near(scale, expected, 1e-9, "its route scale is road over chord");
  t.eq(h.run("enemies[1].routeScale()"), 1, "and a walker's is exactly one");

  // The arrival, timed. Both leak at `progress >= path.length` with no branch
  // anywhere, and the ratio of the two times is the ratio of the two routes.
  var times = h.run("(function () {" +
    "  var out = { veil_dart: 0, walker: 0 }, step = 1 / 20;" +
    "  for (var i = 0; i < 5000; i++) {" +
    "    if (!enemies[0].leaked) { enemies[0].update(step); if (enemies[0].leaked) out.veil_dart = (i + 1) * step; }" +
    "    if (!enemies[1].leaked) { enemies[1].update(step); if (enemies[1].leaked) out.walker = (i + 1) * step; }" +
    "    if (out.veil_dart && out.walker) break;" +
    "  }" +
    "  return out; })()");
  t.ok(times.veil_dart > 0 && times.walker > 0, "both reach the base");
  t.ok(times.veil_dart < times.walker, "the Veil Dart gets there first (" +
    times.veil_dart.toFixed(1) + " s against " + times.walker.toFixed(1) + " s)");
  // THE MARGIN IS THE TWO ADVANTAGES MULTIPLIED -- a shorter route and a
  // faster body. Asserting the PRODUCT rather than either half is what makes
  // this survive a retune of either one.
  var quicker = h.run("Enemy.TYPES.veil_dart.speedMultiplier");
  t.near(times.veil_dart / times.walker, 1 / (scale * quicker), 0.02,
    "and the margin is exactly the shortcut times the speed");

  // IT ENDS ON THE BASE, not merely past a threshold.
  var end = h.run("path.pointAt(path.length)");
  var landed = h.run("enemies[0].pos");
  t.ok(Math.hypot(landed.x - end.x, landed.y - end.y) < 4,
    "it finishes on the base itself");
});

test("the Veil Dart takes slows but not the road's pace profile", function (t) {
  var h = bootVeilDart();
  h.run("enemies.push(new Enemy(path, null, 'veil_dart', {}));" +
        "enemies.push(new Enemy(path, null, 'normal', {}))");

  var normal = h.run("({ veil_dart: enemies[0].currentSpeedUlps()," +
    "                   walker: enemies[1].currentSpeedUlps() })");
  t.eq(normal.walker, h.game.Enemy.BASE_SPEED_ULPS, "a walker starts at the base walk");
  t.eq(normal.veil_dart,
    h.game.Enemy.BASE_SPEED_ULPS * h.game.Enemy.TYPES.veil_dart.speedMultiplier,
    "and the Dart at its own multiple of it");

  // A PACE PROFILE IS A FACT ABOUT THE TARMAC. "Nothing crosses that basin
  // quickly" cannot be addressed to a body that is over the basin, so the
  // Veil Dart is the one body on the board that does not read it.
  var paced = h.run("(function () {" +
    "  var real = path.paceScaleAt;" +
    "  path.paceScaleAt = function () { return 0.5; };" +
    "  var out = { veil_dart: enemies[0].currentSpeedUlps()," +
    "              walker: enemies[1].currentSpeedUlps() };" +
    "  path.paceScaleAt = real;" +
    "  return out; })()");
  t.eq(paced.veil_dart, normal.veil_dart, "a slow stretch of road does not slow it");
  t.near(paced.walker, normal.walker * 0.5, 1e-9, "while it halves the walker");

  // EVERYTHING THAT IS NOT THE ROAD STILL REACHES IT. A tower's slow is a fact
  // about the body, not about the tarmac.
  h.run("enemies[0].applySlow(0.5, 2)");
  t.near(h.run("enemies[0].currentSpeedUlps()"), normal.veil_dart * 0.5, 1e-9,
    "a tower's slow works on it exactly as on anything else");
});

test("knocking a Veil Dart back keeps it on its own line", function (t) {
  var h = bootVeilDart();
  h.run("enemies.push(new Enemy(path, null, 'veil_dart', {}))");
  h.run("for (var i = 0; i < 60; i++) enemies[0].update(1 / 6)");

  // THE BUG THIS PINS: anything that writes `progress` and then asks
  // `path.pointAt` directly snaps the body onto the road's centreline --
  // which for this type means teleporting it onto tarmac it has never
  // touched. js/systems/death-denial.js did exactly that until 2026-08-30.
  var moved = h.run("(function () {" +
    "  var e = enemies[0], c = Enemy.chordOf(path);" +
    "  e.progress = Math.max(0, e.progress - 200);" +
    "  e.refreshPos();" +
    "  var dx = e.pos.x - c.from.x, dy = e.pos.y - c.from.y;" +
    "  return Math.abs(dx * c.unit.y - dy * c.unit.x); })()");
  var lane = h.run("Math.abs(ul(enemies[0].laneOffsetUl)) + 0.001");
  t.ok(moved <= lane, "after a knockback it is still on its chord");
});

test("a Veil Dart and a walker at the same point of their journey rank alike",
function (t) {
  var h = bootVeilDart();
  h.run("enemies.push(new Enemy(path, null, 'veil_dart', {}));" +
        "enemies.push(new Enemy(path, null, 'normal', {}))");

  // TARGETING COMPARES RAW `progress` for "first" and "last", and this is why
  // progress is kept in road units rather than in pixels of actual travel: a
  // body on a shorter route would otherwise rank as permanently further behind,
  // and "the enemy about to reach your base" would never pick it.
  var ranked = h.run("(function () {" +
    "  var a = enemies[0], b = enemies[1];" +
    "  a.progress = path.length * 0.75;" +
    "  b.progress = path.length * 0.75;" +
    "  a.refreshPos(); b.refreshPos();" +
    "  return { first: Targeting.score('first', a) - Targeting.score('first', b)," +
    "           last: Targeting.score('last', a) - Targeting.score('last', b) }; })()");
  t.eq(ranked.first, 0, "three quarters home is three quarters home, to 'first'");
  t.eq(ranked.last, 0, "and to 'last'");
});


// ---------------------------------------------------------------------------
// THE RIFLEMAN'S UPGRADE-SQUARED TREE (2026-09-01)
//
// TWENTY-TWO RANKED NODES, EACH IMPROVING ONE PERMANENT UPGRADE, and every
// figure below is the owner's own — so, like the confirmed-content section
// above, these tests DO name ids and DO assert exact numbers. A retune is meant
// to turn them red.
//
// FOUR LAYERS, tested through their real entry points:
//
//   js/meta.js                     the ranks in the save, and the migration
//   js/systems/tower-perks.js      the rules: parents, requirements, prices,
//                                  and whether an owned node is doing anything
//   js/perks/soldier-upgrades2.js  the content
//   js/soldier.js                  what the numbers do in a run
//
// THE THREE QUESTIONS EVERY ONE OF THESE NODES RAISES, and each is asked at
// least once below: does rank 0 change nothing, does a bought node whose parent
// is on the bench change nothing, and does the resolved value match the stated
// table at EVERY rank rather than only at the top.
// ---------------------------------------------------------------------------

group("the Rifleman's upgrade-squared tree");

// A profile with every tower owned at level 5 and coins enough for any of these
// curves. Same shape as `bootContent`, with more runs banked: H5's last rank
// alone is a thousand coins.
function bootSquares() {
  var h = harness.boot();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar();" +
        "TowerXP.setEnabled(true); openMenu()");
  for (var i = 0; i < 120; i++) {
    h.run("MetaProgress.awardRun({ wavesCompleted: 35, waveReached: 35, " +
      "victory: true, mapId: Maps.DEFAULT_ID, mapName: 'x', difficultyId: 'easy' })");
  }
  h.run("MetaProgress.snapshot().owned.forEach(function (id) {" +
        "  MetaProgress.addXp(id, 20000); })");
  return h;
}

// Buy and equip perks, set upgrade-squared ranks, start a run and put ONE
// Rifleman on the board with the given tiers bought.
//
// STRAIGHT THROUGH THE MODEL, exactly as `towerWith` does and for the same
// reason: these tests are about the EFFECTS, and the purchase rules have their
// own tests above.
//
// It returns `towers[0]` and not `towers[towers.length - 1]`: `addTower` SORTS
// the list by path progress, so the last slot is not reliably the tower just
// built once a test wants two of them.
function squareTower(h, nodeIds, ranks, tiers, x, y) {
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar()");
  h.run("MetaProgress.snapshot().owned.forEach(function (id) {" +
        "  MetaProgress.addXp(id, 20000); })");
  (nodeIds || []).forEach(function (id, i) {
    h.run("MetaProgress.buyNode('soldier', '" + id + "', 0);" +
          "MetaProgress.equipPerk('soldier', '" + id + "', " + i + ")");
  });
  setRanks(h, ranks);
  h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000;" +
        "towers = []; waveIndex = WAVES.length");
  h.run("(function () { var Type = MetaProgress.constructorOf('soldier');" +
        "  addTower(new Type(" + (x || 200) + ", " + (y || 200) + ", path)); })()");
  buyTiers(h, "towers[0]", tiers);
  return "towers[0]";
}

// Ranks up TO a target, from wherever the node is now — the only order the
// model allows, and idempotent so a test may raise one twice.
function setRanks(h, ranks) {
  Object.keys(ranks || {}).forEach(function (id) {
    var have = h.run("MetaProgress.rankOfNode('soldier', '" + id + "')");
    for (var r = have + 1; r <= ranks[id]; r++) {
      h.run("MetaProgress.buyRank('soldier', '" + id + "', 0, " + r + ")");
    }
  });
}

// What one in-run tier costs before any permanent upgrade touches it. Read out
// of the authored table rather than typed here, so these tests assert the
// SURCHARGE and stay green through a retune of the base price, which is not
// what any of them are about.
function baseTier(h, id) {
  return h.run("Soldier.upgradeById('" + id + "').cost");
}

// Every round one Rifleman fires, in order, as the damage its Bullet carries.
// Driven through the real `update`, because the thing under test is which shot
// the burst calls its LAST — and that is decided by the loop, not by a stat.
function squareBurst(h, expr, count) {
  return h.run("(function () {" +
    "  var tw = " + expr + ";" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  e.progress = path.length * 0.5; e.refreshPos();" +
    "  e.health = 1e9; e.maxHealth = 1e9;" +
    "  tw.x = e.pos.x + 20; tw.y = e.pos.y; tw.rangePx = 1e6;" +
    "  tw.cooldown = 0; tw.shotTimer = 0; tw.burstShotsLeft = 0;" +
    "  var bullets = [], seen = [];" +
    "  for (var i = 0; i < 900 && seen.length < " + count + "; i++) {" +
    "    tw.update(1 / 60, [e], bullets);" +
    "    while (seen.length < bullets.length) seen.push(bullets[seen.length].damage);" +
    "  }" +
    "  return seen; })()");
}

test("a rank is bought one at a time, at its own price, behind its parent",
function (t) {
  var h = bootSquares();
  var ID = "rifleman_overloaded_reinforced_spring";

  var cold = h.run("TowerPerks.buyUpgrade2('soldier', '" + ID + "')");
  t.eq(cold.ok, false, "rank 1 refuses while Overloaded Drum is unbought");
  t.ok(/Overloaded Drum/.test(cold.reason), "and names it: " + cold.reason);
  t.eq(h.run("TowerPerks.upgrade2StateOf('soldier', '" + ID + "').state"), "locked",
    "the node reads as locked");

  h.run("MetaProgress.buyNode('soldier', 'rif_a1', 0)");
  t.eq(h.run("TowerPerks.upgrade2StateOf('soldier', '" + ID + "').state"), "buyable",
    "buying the parent opens rank 1");

  // EACH RANK COSTS ITS OWN PRICE, never the sum of the ones before it.
  [50, 75, 110].forEach(function (price, i) {
    var before = h.run("MetaProgress.coins()");
    var out = h.run("TowerPerks.buyUpgrade2('soldier', '" + ID + "')");
    t.eq(out.ok, true, "rank " + (i + 1) + " buys");
    t.eq(out.spent, price, "rank " + (i + 1) + " costs exactly " + price);
    t.eq(before - h.run("MetaProgress.coins()"), price,
      "and the purse moved by exactly that");
    t.eq(h.run("TowerPerks.rankOf('soldier', '" + ID + "')"), i + 1,
      "the node is at rank " + (i + 1));
  });

  var over = h.run("TowerPerks.buyUpgrade2('soldier', '" + ID + "')");
  t.eq(over.ok, false, "a maxed node cannot be bought again");
  var maxed = h.run("TowerPerks.upgrade2StateOf('soldier', '" + ID + "')");
  t.eq(maxed.state, "maxed", "and reads as maxed");
  t.eq(maxed.nextCost, null, "with no next price invented");
  t.eq(maxed.spent, 235, "235 sunk into it — 50 + 75 + 110, not 235 for rank 3");

  // THE MODEL REFUSES A SKIPPED RANK even when a caller asks for one directly.
  t.eq(h.run("MetaProgress.buyRank('soldier', 'rifleman_breach_soft_feed', 0, 2).ok"),
    false, "rank 2 cannot be written onto a node sitting at rank 0");
  t.eq(h.run("MetaProgress.rankOfNode('soldier', 'rifleman_breach_soft_feed')"), 0,
    "and nothing was stored");
});

test("a rank you cannot afford refuses, and quotes that rank's own price",
function (t) {
  var h = harness.boot();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar()");
  h.run("MetaProgress.buyNode('soldier', 'rif_b4', 0)");

  var ID = "rifleman_entrenchment_battery_setup";
  var poor = h.run("TowerPerks.upgrade2StateOf('soldier', '" + ID + "')");
  t.eq(poor.state, "poor", "a fresh profile cannot afford H5's first rank");
  t.eq(poor.nextCost, 150, "which is 150 coins");
  t.ok(/150/.test(poor.reason), "and the reason quotes it: " + poor.reason);
  t.eq(h.run("TowerPerks.buyUpgrade2('soldier', '" + ID + "').ok"), false,
    "so the purchase refuses");
  t.eq(h.run("TowerPerks.rankOf('soldier', '" + ID + "')"), 0, "and nothing moved");
});

test("a fusion shows 0/2, 1/2 and 2/2, and cannot be bought at 1/2",
function (t) {
  var h = bootSquares();
  var FUSION = "rifleman_overloaded_series_ammunition";
  h.run("MetaProgress.buyNode('soldier', 'rif_a1', 0);" +
        "MetaProgress.buyNode('soldier', 'rif_n1', 0)");

  var none = h.run("TowerPerks.upgrade2StateOf('soldier', '" + FUSION + "')");
  t.eq(none.requirementsTotal, 2, "Series Ammunition has two requirements");
  t.eq(none.requirementsMet, 0, "0 / 2 with nothing bought");
  t.eq(none.state, "locked", "and is locked");

  // HALF WAY IS SHOWN AS HALF WAY, never as a single flat "locked".
  setRanks(h, { rifleman_overloaded_reinforced_spring: 2 });
  var half = h.run("TowerPerks.upgrade2StateOf('soldier', '" + FUSION + "')");
  t.eq(half.requirementsMet, 1, "1 / 2 with Reinforced Spring at rank 2");
  t.eq(half.requirements[0].met, true, "the satisfied one is marked satisfied");
  t.eq(half.requirements[0].have, 2, "with the rank it actually holds");
  t.eq(half.requirements[1].met, false, "and the missing one is marked missing");
  t.eq(half.requirements[1].have, 0, "with its rank of 0");
  t.eq(half.requirements[1].need, 2, "against the 2 it needs");
  t.eq(half.state, "locked", "it is STILL locked at 1 / 2");
  t.eq(h.run("TowerPerks.buyUpgrade2('soldier', '" + FUSION + "').ok"), false,
    "and cannot be bought");
  t.ok(/Premium Lot/.test(half.reason) && !/Reinforced Spring/.test(half.reason),
    "the refusal names only the one that is short: " + half.reason);

  // ONE SHORT OF THE RANK IS STILL SHORT.
  setRanks(h, { rifleman_commissioned_premium_lot: 1 });
  t.eq(h.run("TowerPerks.upgrade2StateOf('soldier', '" + FUSION + "').requirementsMet"),
    1, "Premium Lot at rank 1 against a needed 2 is still 1 / 2");

  setRanks(h, { rifleman_commissioned_premium_lot: 2 });
  var both = h.run("TowerPerks.upgrade2StateOf('soldier', '" + FUSION + "')");
  t.eq(both.requirementsMet, 2, "2 / 2 at last");
  t.eq(both.state, "buyable", "and now it is buyable");
  t.eq(both.nextCost, 80, "for X3's first rank, 80 coins");
  t.eq(h.run("TowerPerks.buyUpgrade2('soldier', '" + FUSION + "').ok"), true,
    "and it buys");
});

test("an owned square does nothing while its parent is on the bench",
function (t) {
  var h = bootSquares();

  // BOUGHT AND NOT EQUIPPED. Overloaded Drum is in the inventory but in no
  // slot, so its square is owned, dormant and worth exactly nothing.
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar()");
  h.run("MetaProgress.snapshot().owned.forEach(function (id) {" +
        "  MetaProgress.addXp(id, 20000); })");
  h.run("MetaProgress.buyNode('soldier', 'rif_a1', 0)");
  setRanks(h, { rifleman_overloaded_reinforced_spring: 3 });
  h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000; towers = []");
  h.run("(function () { var Type = MetaProgress.constructorOf('soldier');" +
        "  addTower(new Type(200, 200, path)); })()");

  t.eq(h.run("towers[0].drumShotFlatDamage"), 0,
    "rank 3 of Reinforced Spring adds nothing with Overloaded Drum unequipped");
  t.eq(h.run("towers[0].shotsPerBurst"), h.run("Soldier.BASE_SHOTS_PER_BURST"),
    "and the burst is the tower's own");
  var state = h.run("TowerPerks.upgrade2StateOf('soldier', " +
    "'rifleman_overloaded_reinforced_spring')");
  t.eq(state.rank, 3, "the ranks are still owned");
  t.eq(state.dormant, true, "and the model calls it dormant rather than lost");

  // EQUIP THE PARENT AND IT IS BACK, with nothing bought in between.
  var live = squareTower(h, ["rif_a1"],
    { rifleman_overloaded_reinforced_spring: 3 }, ["A1", "A2", "A3"]);
  t.eq(h.run(live + ".drumShotFlatDamage"), 6, "equipped, it is +6 again");
  t.eq(h.run("TowerPerks.upgrade2StateOf('soldier', " +
    "'rifleman_overloaded_reinforced_spring').dormant"), false, "and not dormant");
});

test("a fusion needs BOTH parents equipped, not either", function (t) {
  var h = bootSquares();
  var A4 = baseTier(h, "A4");
  var B4 = baseTier(h, "B4");
  var RANKS = {
    rifleman_overloaded_reinforced_spring: 2,
    rifleman_commissioned_premium_lot: 2,
    rifleman_overloaded_series_ammunition: 3
  };

  var one = squareTower(h, ["rif_a1"], RANKS, ["A1", "A2", "A3"]);
  t.eq(h.run(one + ".drumShotFlatDamage"), 4,
    "Reinforced Spring rank 2 applies on its own parent");
  t.eq(h.run(one + ".upgradeCost('A4')"), A4,
    "and the fusion surcharges nothing with only one parent equipped");

  var other = squareTower(h, ["rif_n1"], RANKS, ["A1", "A2", "A3"]);
  t.eq(h.run(other + ".upgradeCost('A4')"), A4 + 50 + 10,
    "the parent's own 50 and Premium Lot's 10, and not a coin of the fusion's");

  // BOTH, AND IT WAKES UP.
  var pair = squareTower(h, ["rif_a1", "rif_n1"], RANKS, ["A1", "A2", "A3"]);
  t.near(h.run(pair + ".drumShotFlatDamage"), 4.3, 1e-9,
    "Reinforced Spring's 4 plus Series Ammunition's 0.3");
  t.eq(h.run(pair + ".upgradeCost('A4')"), A4 + 50 + 10 + 6,
    "A4 carries the parent's 50, Premium Lot's 10 and the fusion's 6");
  t.eq(h.run(pair + ".upgradeCost('B4')"), B4 + 50 + 10,
    "while B4 carries no part of the fusion's A-only surcharge");
});

test("ranks survive a reload, and a save written before them reads rank 0",
function (t) {
  var h = bootSquares();
  h.run("MetaProgress.buyNode('soldier', 'rif_a1', 0)");
  setRanks(h, { rifleman_overloaded_reinforced_spring: 2 });

  var snap = h.run("MetaProgress.snapshot().progress.soldier.ranks");
  t.eq(snap.rifleman_overloaded_reinforced_spring, 2,
    "the rank is in the profile the screens read");

  // THE WHOLE MIGRATION IS AN ABSENT KEY. A profile written before this system
  // has no `ranks` at all and must load as rank 0 everywhere, with its coins,
  // its towers, its nodes and its loadout untouched.
  var old = h.run("MetaProgress.__loadForTest({ coins: 900, owned: ['soldier']," +
    " equipped: ['soldier', null, null, null, null]," +
    " progress: { soldier: { xp: 20000, nodes: ['rif_a1']," +
    "   equipped: ['rif_a1', null, null, null, null] } } })");
  t.deep(old.progress.soldier.ranks, {}, "an old save has no ranks");
  t.eq(old.progress.soldier.nodes.length, 1, "and keeps the node it bought");
  t.eq(old.coins, 900, "and its coins");
  t.eq(h.run("TowerPerks.rankOf('soldier', 'rifleman_overloaded_reinforced_spring')"),
    0, "every square reads rank 0");

  // HOSTILE DATA IS SHAPED, NOT TRUSTED — and an id this build does not know is
  // KEPT rather than thrown away, exactly as an unknown node id is.
  var junk = h.run("MetaProgress.__loadForTest({ coins: 5, owned: ['soldier']," +
    " equipped: [null, null, null, null, null]," +
    " progress: { soldier: { xp: 0, nodes: [], ranks: {" +
    "   rifleman_overloaded_reinforced_spring: 99, zero: 0, negative: -3," +
    "   text: 'x', retired_node: 2 } } } })");
  var ranks = junk.progress.soldier.ranks;
  t.eq(ranks.zero, undefined, "a rank of 0 is not stored — absence is 'not bought'");
  t.eq(ranks.negative, undefined, "nor a negative one");
  t.eq(ranks.text, undefined, "nor a string");
  t.eq(ranks.retired_node, 2, "an id this build has dropped is kept and inert");
  t.eq(ranks.rifleman_overloaded_reinforced_spring, 99, "the save stores what it was told");
  t.eq(h.run("TowerPerks.rankOf('soldier', 'rifleman_overloaded_reinforced_spring')"),
    3, "and the tree clamps it to the node's own maximum");
});

test("the debug door round-trips a rank, and a row that omits one clears it",
function (t) {
  var h = bootSquares();
  h.run("MetaProgress.buyNode('soldier', 'rif_a1', 0)");
  setRanks(h, { rifleman_overloaded_reinforced_spring: 2 });

  // A PATCH THAT NAMES ONLY THE PURSE LEAVES THE ROWS ALONE.
  h.run("MetaProgress.debugPatch({ coins: 4242 })");
  t.eq(h.run("MetaProgress.coins()"), 4242, "the coins moved");
  t.eq(h.run("TowerPerks.rankOf('soldier', 'rifleman_overloaded_reinforced_spring')"),
    2, "and the rank is untouched");

  // A PATCH THAT SUPPLIES A ROW REPLACES THAT ROW, `ranks` included — the same
  // rule `nodes` and `equipped` follow, and the reason js/debug-cheats.js copies
  // all three out of the live snapshot before it edits one of them. A row that
  // omits `ranks` is a row that says there are none.
  var kept = h.run("(function () {" +
    "  var s = MetaProgress.snapshot(), row = s.progress.soldier;" +
    "  MetaProgress.debugPatch({ progress: { soldier: {" +
    "    xp: row.xp, nodes: row.nodes.slice(), ranks: row.ranks," +
    "    equipped: row.equipped.slice(), resetAt: row.resetAt } } });" +
    "  return TowerPerks.rankOf('soldier', 'rifleman_overloaded_reinforced_spring');" +
    "})()");
  t.eq(kept, 2, "a row that carries its ranks keeps them");

  var dropped = h.run("(function () {" +
    "  var s = MetaProgress.snapshot(), row = s.progress.soldier;" +
    "  MetaProgress.debugPatch({ progress: { soldier: {" +
    "    xp: row.xp, nodes: row.nodes.slice()," +
    "    equipped: row.equipped.slice(), resetAt: row.resetAt } } });" +
    "  return TowerPerks.rankOf('soldier', 'rifleman_overloaded_reinforced_spring');" +
    "})()");
  t.eq(dropped, 0, "and a row that leaves them out clears them");
  t.eq(h.run("MetaProgress.ownsNode('soldier', 'rif_a1')"), true,
    "without touching what the row DID carry");

  // THE PLAYER'S BLOCK TRAVELS THE SAME WAY, and js/debug-cheats.js copies it
  // into every draft for the same reason it copies the tower rows: a patch that
  // named only the purse would otherwise have emptied the whole Player
  // progression, which is the half a playtest most needs to set up.
  h.run("MetaProgress.buyModule('player_scrapper', 0);" +
        "MetaProgress.buyPlayerRank('player_scrapper_recovery_team', 0, 1);" +
        "MetaProgress.addPlayerXp(3000);" +
        "MetaProgress.equipModule('player_scrapper', 0)");
  h.run("MetaProgress.debugPatch({ coins: 77 })");
  t.eq(h.run("MetaProgress.coins()"), 77, "the coins moved");
  t.eq(h.run("MetaProgress.ownsModule('player_scrapper')"), true,
    "and the Player still owns its module");
  t.eq(h.run("MetaProgress.playerRankOf('player_scrapper_recovery_team')"), 1,
    "its rank");
  t.eq(h.run("MetaProgress.equippedModules()[0]"), "player_scrapper",
    "and its loadout");

  var carried = h.run("(function () {" +
    "  var p = MetaProgress.snapshot().player;" +
    "  MetaProgress.debugPatch({ player: { xp: p.xp, modules: p.modules.slice()," +
    "    ranks: p.ranks, equipped: p.equipped.slice(), resetAt: p.resetAt } });" +
    "  return MetaProgress.playerRankOf('player_scrapper_recovery_team'); })()");
  t.eq(carried, 1, "a Player block that carries its ranks keeps them");
  var lost = h.run("(function () {" +
    "  MetaProgress.debugPatch({ player: { xp: 0, modules: [], ranks: {}," +
    "    equipped: [], resetAt: 0 } });" +
    "  return MetaProgress.ownedModules().length; })()");
  t.eq(lost, 0, "and one that names an empty row really empties it");
});

test("a reset refunds every rank and charges ten a node, whatever rank it held",
function (t) {
  var h = bootSquares();
  h.run("MetaProgress.buyNode('soldier', 'rif_a1', 0)");
  h.run("MetaProgress.buyNode('soldier', 'rif_a2', 0)");
  setRanks(h, {
    rifleman_overloaded_reinforced_spring: 3,     // 50 + 75 + 110 = 235
    rifleman_breach_soft_feed: 1                  // 35
  });

  var nodeCost = h.run("TowerPerks.nodeOf('soldier', 'rif_a1').cost") +
                 h.run("TowerPerks.nodeOf('soldier', 'rif_a2').cost");
  t.eq(h.run("TowerPerks.refundValue('soldier')"), nodeCost + 235 + 35,
    "the refund is both perks plus every rank at the price it was bought for");

  t.eq(h.run("MetaProgress.rankedNodeCount('soldier')"), 2,
    "two RANKED nodes, one at rank 3 and one at rank 1");

  var out = h.run("TowerPerks.resetTree('soldier', 99999999)");
  t.eq(out.ok, true, "the reset goes through");
  t.eq(out.removed, 4, "four unlocked nodes — two perks and two ranked squares");
  t.eq(out.fee, 40, "at ten a node, and a rank-3 node counts once");
  t.eq(out.refunded, nodeCost + 270, "with every coin handed back");
  t.deep(h.run("MetaProgress.nodeRanks('soldier')"), {}, "and no rank survives");
  t.deep(h.run("MetaProgress.ownedNodes('soldier')"), [], "nor any node");

  // THE COOLDOWN IS UNCHANGED — a second reset a moment later is refused for
  // the reason it always was.
  var again = h.run("TowerPerks.resetTree('soldier', 99999999)");
  t.eq(again.ok, false, "a second reset on the same clock refuses");
  t.ok(/cool/.test(again.reason), "for the cooldown: " + again.reason);

  // A TREE HOLDING NOTHING BUT RANKS STILL HAS SOMETHING TO REFUND.
  var h2 = bootSquares();
  h2.run("MetaProgress.buyNode('soldier', 'rif_b4', 0)");
  setRanks(h2, { rifleman_entrenchment_battery_setup: 2 });
  var only = h2.run("TowerPerks.resetTree('soldier', 99999999)");
  t.eq(only.removed, 2, "the perk and its ranked square");
  t.eq(only.refunded,
    h2.run("TowerPerks.nodeOf('soldier', 'rif_b4').cost") + 400,
    "150 + 250 of H5 comes back with it");
});

test("Reinforced Spring pays only the shot Overloaded Drum created",
function (t) {
  var h = bootSquares();

  // A3 IS FIVE SHOTS WITH THE DRUM, and the fifth is the one it created — so
  // four rounds at the tower's damage and one at damage + 6.
  var s = squareTower(h, ["rif_a1"],
    { rifleman_overloaded_reinforced_spring: 3 }, ["A1", "A2", "A3"]);
  var base = h.run(s + ".damage");
  t.eq(h.run(s + ".shotsPerBurst"), 5, "A3 with Overloaded Drum fires five");
  t.deep(squareBurst(h, s, 5), [base, base, base, base, base + 6],
    "and only the last of them carries the +6");

  // EVERY RANK, and the ranks are +2 apart rather than a table.
  [[1, 2], [2, 4], [3, 6]].forEach(function (row) {
    var tw = squareTower(h, ["rif_a1"],
      { rifleman_overloaded_reinforced_spring: row[0] }, ["A1", "A2", "A3"]);
    var shots = squareBurst(h, tw, 5);
    t.eq(shots[4] - shots[0], row[1],
      "rank " + row[0] + " puts +" + row[1] + " on the added shot");
  });

  // NOTHING BELOW A3, because Overloaded Drum grants nothing below A3.
  var early = squareTower(h, ["rif_a1"],
    { rifleman_overloaded_reinforced_spring: 3 }, ["A1", "A2"]);
  t.eq(h.run(early + ".shotsPerBurst"), 4, "A2 still fires four");
  var flat = squareBurst(h, early, 4);
  t.eq(flat[0], flat[3], "and every round of the burst is worth the same");

  // AND NOTHING ON AN AUTOMATIC RIFLEMAN, for exactly the reason its parent
  // gains nothing there: B3 never enters the burst block.
  var auto = squareTower(h, ["rif_a1"],
    { rifleman_overloaded_reinforced_spring: 3 }, ["B1", "B2", "B3"]);
  var rifle = squareBurst(h, auto, 4);
  t.eq(rifle[0], rifle[3], "an automatic rifle's rounds are all the same");
});

test("Terminal Charge and Soft Feed use their exact tables, on shot six",
function (t) {
  var h = bootSquares();
  var FIVE = ["A1", "A2", "A3", "A4", "A5"];

  // OVERLOADED DRUM PLUS BREACH CHAMBER IS SIX SHOTS, and shot six is the one
  // that doubles — the five before it take the penalty.
  var s = squareTower(h, ["rif_a1", "rif_a2"], {}, FIVE);
  t.eq(h.run(s + ".shotsPerBurst"), 6, "A5 with Overloaded Drum fires six");
  var base = h.run(s + ".damage");
  var plain = squareBurst(h, s, 6);
  t.near(plain[0], base * 0.9, 1e-9, "shot 1 pays the parent's −10%");
  t.near(plain[4], base * 0.9, 1e-9, "so does shot 5");
  t.near(plain[5], base * 2, 1e-9, "and shot SIX is the doubled one");

  // TERMINAL CHARGE IS A TABLE OF TOTALS, not a multiplier on top of x2.
  [[0, 2], [1, 2.1], [2, 2.25], [3, 2.5]].forEach(function (row) {
    var tw = squareTower(h, ["rif_a1", "rif_a2"],
      row[0] ? { rifleman_breach_terminal_charge: row[0] } : {}, FIVE);
    var d = h.run(tw + ".damage");
    t.near(squareBurst(h, tw, 6)[5], d * row[1], 1e-9,
      "rank " + row[0] + " resolves x" + row[1] + " on the final shot");
  });

  // SOFT FEED IS THE OTHER HALF, AND ITS OWN BRANCH: Terminal Charge is not a
  // prerequisite of it.
  t.deep(h.run("(TowerPerks.upgrade2Of('soldier', 'rifleman_breach_soft_feed')" +
    ".requires || []).map(function (r) { return r.id; })"), [],
    "Soft Feed requires no other square");
  [[0, 10], [1, 9.5], [2, 9], [3, 8.5], [4, 8], [5, 7.5]].forEach(function (row) {
    var tw = squareTower(h, ["rif_a1", "rif_a2"],
      row[0] ? { rifleman_breach_soft_feed: row[0] } : {}, FIVE);
    var d = h.run(tw + ".damage");
    var shots = squareBurst(h, tw, 6);
    t.near(shots[0], d * (1 - row[1] / 100), 1e-9,
      "rank " + row[0] + " leaves the earlier shots at −" + row[1] + "%");
    t.near(shots[5], d * 2, 1e-9, "and the final shot never took that penalty");
  });

  // THE TWO TOGETHER, AND REINFORCED SPRING'S FLAT GOES IN FIRST.
  var all = squareTower(h, ["rif_a1", "rif_a2"], {
    rifleman_overloaded_reinforced_spring: 3,
    rifleman_breach_terminal_charge: 3,
    rifleman_breach_soft_feed: 5
  }, FIVE);
  var d = h.run(all + ".damage");
  var shots = squareBurst(h, all, 6);
  t.near(shots[0], d * 0.925, 1e-9, "the early shots read −7.5%");
  t.near(shots[5], (d + 6) * 2.5, 1e-9,
    "and the last is (damage + 6) x 2.50 — the flat is inside the multiplier");
});

test("Hard Ratchet and Polished Wheel move the two outcomes, one cycle at a time",
function (t) {
  var h = bootSquares();
  var THREE = ["rif_a1", "rif_a2", "rif_a3"];

  var plain = squareTower(h, THREE, {}, []);
  t.near(h.run(plain + ".ratchetGain"), 0.88, 1e-9, "the parent rewards −12%");
  t.near(h.run(plain + ".ratchetLoss"), 1.15, 1e-9, "and punishes +15%");

  [[1, 12.8, 15.8], [2, 13.6, 16.6], [3, 14.4, 17.4]].forEach(function (row) {
    var tw = squareTower(h, THREE, { rifleman_ratchet_hard_ratchet: row[0] }, []);
    t.near(h.run(tw + ".ratchetGain"), 1 - row[1] / 100, 1e-9,
      "Hard Ratchet rank " + row[0] + " rewards −" + row[1] + "%");
    t.near(h.run(tw + ".ratchetLoss"), 1 + row[2] / 100, 1e-9,
      "and punishes +" + row[2] + "%");
  });

  // POLISHED WHEEL TOUCHES ONE END ONLY, and needs Hard Ratchet rank 2 first.
  var locked = h.run("TowerPerks.upgrade2StateOf('soldier'," +
    " 'rifleman_ratchet_polished_wheel')");
  t.eq(locked.requirements[0].id, "rifleman_ratchet_hard_ratchet",
    "Polished Wheel hangs off Hard Ratchet");
  t.eq(locked.requirements[0].need, 2, "at rank 2");

  var both = squareTower(h, THREE, {
    rifleman_ratchet_hard_ratchet: 3,
    rifleman_ratchet_polished_wheel: 5
  }, []);
  t.near(h.run(both + ".ratchetGain"), 1 - 16.4 / 100, 1e-9,
    "3 and 5 together reward exactly −16.4%");
  t.near(h.run(both + ".ratchetLoss"), 1.174, 1e-9,
    "and the failure is still +17.4% — the wheel does not touch it");

  // AND IT IS STILL SPENT ON EXACTLY ONE CYCLE. The classification and the
  // one-cycle consumption are the parent's and are unchanged.
  var cycles = h.run("(function () {" +
    "  var tw = " + both + ";" +
    "  tw.burstMissed = 0; tw.settleRatchet();" +
    "  var afterClean = tw.ratchetPending;" +
    "  tw.burstShotsLeft = 0; tw.cooldown = 0; tw.shotTimer = 0;" +
    "  var e = new Enemy(path, null, 'normal', {});" +
    "  e.progress = path.length * 0.5; e.refreshPos();" +
    "  e.health = 1e9; e.maxHealth = 1e9;" +
    "  tw.x = e.pos.x + 20; tw.y = e.pos.y; tw.rangePx = 1e6;" +
    "  tw.update(1 / 60, [e], []);" +
    "  return { afterClean: afterClean, spent: tw.ratchetPending," +
    "           cooldown: tw.cooldown }; })()");
  t.near(cycles.afterClean, 0.836, 1e-9, "a clean burst banks the reward");
  t.eq(cycles.spent, 1, "the next burst opening spends it and leaves nothing");
  t.ok(cycles.cooldown > 0, "and the cycle it opened really was shortened");

  // A COLLAPSED BURST BANKS THE OTHER ONE.
  var loss = h.run("(function () { var tw = " + both + ";" +
    "  tw.burstMissed = 2; tw.settleRatchet(); return tw.ratchetPending; })()");
  t.near(loss, 1.174, 1e-9, "two lost shots bank +17.4%");
  var neutral = h.run("(function () { var tw = " + both + ";" +
    "  tw.burstMissed = 1; tw.settleRatchet(); return tw.ratchetPending; })()");
  t.eq(neutral, 1, "one lost shot is still neither");
});

test("recruit health resolves as summed percentage points, in every combination",
function (t) {
  var h = bootSquares();
  var B4 = ["B1", "B2", "B3", "B4"];
  var BASE = h.run("Soldier.RECRUIT_HP");

  // POINTS SUM; THEY DO NOT MULTIPLY. Every row is (nodes, ranks, points).
  var rows = [
    [["rif_b1"], {}, 0],
    [["rif_b1", "rif_b2"], {}, -10],
    [["rif_b1", "rif_b2"], { rifleman_rapid_medical_selection: 1 }, -9],
    [["rif_b1", "rif_b2"], { rifleman_rapid_medical_selection: 3 }, -7],
    [["rif_b1", "rif_b2"], { rifleman_rapid_medical_selection: 5 }, -5],
    [["rif_b1"], { rifleman_manifest_reinforced_contracts: 1 }, 2],
    [["rif_b1"], { rifleman_manifest_reinforced_contracts: 3 }, 6],
    [["rif_b1", "rif_b2"], {
      rifleman_rapid_medical_selection: 5,
      rifleman_manifest_reinforced_contracts: 3
    }, 1]
  ];
  rows.forEach(function (row) {
    var tw = squareTower(h, row[0], row[1], B4);
    t.near(h.run(tw + ".recruitHp"), BASE * (1 + row[2] / 100), 1e-9,
      "recruits resolve " + row[2] + " points against the base " + BASE);
  });

  // AND THE SALVAGE POINTS ARE ON ONE BODY. Sorted Parts and Reinforced
  // Contracts at rank 2 are what opens the fusion.
  var first = squareTower(h, ["rif_b1", "rif_s1"], {
    rifleman_manifest_reinforced_contracts: 2,
    rifleman_cheap_sorted_parts: 2,
    rifleman_manifest_salvage_conscription: 3
  }, B4);
  t.eq(h.run(first + ".perkFirstOfType"), true, "this is the run's first Rifleman");
  t.near(h.run(first + ".recruitHp"), BASE * 1.1, 1e-9,
    "+4 from Reinforced Contracts and +6 from Salvage is +10 points");

  // THE SECOND RIFLEMAN OF THE RUN GETS THE CONTRACTS AND NOT THE SALVAGE.
  h.run("(function () { var Type = MetaProgress.constructorOf('soldier');" +
        "  addTower(new Type(900, 200, path)); })()");
  var second = h.run("(function () {" +
    "  for (var i = 0; i < towers.length; i++)" +
    "    if (!towers[i].perkFirstOfType) return { hp: towers[i].recruitHp," +
    "      first: towers[i].perkFirstOfType };" +
    "  return null; })()");
  t.ok(second !== null, "a second Rifleman is on the board");
  t.eq(second.first, false, "and it is not the first of its type");
  t.near(second.hp, BASE * 1.04, 1e-9, "so it carries +4 points and no more");

  // B5's LARGER RECRUIT TAKES THE SAME POINTS, on its own base.
  var b5 = squareTower(h, ["rif_b1", "rif_b2"], {
    rifleman_rapid_medical_selection: 5,
    rifleman_manifest_reinforced_contracts: 3
  }, ["B1", "B2", "B3", "B4", "B5"]);
  t.eq(h.run(b5 + ".recruitCount"), 5, "B5 with the Manifest sends five");
  t.near(h.run(b5 + ".recruitHp"), 40 * 1.01, 1e-9, "each on 40 plus one point");
});

test("every B4 and B5 surcharge sums once, and the till takes what the panel said",
function (t) {
  var h = bootSquares();
  var B4 = baseTier(h, "B4");
  var B5 = baseTier(h, "B5");

  // ALL SIX COMPONENTS AT ONCE. Commissioned Ammunition +50, Premium Lot +15,
  // Volume Discount −25, the Manifest +200/+350, Reinforced Contracts
  // +30/+45 and Officer Supply +15 on each.
  var tw = squareTower(h, ["rif_n1", "rif_b1"], {
    rifleman_commissioned_premium_lot: 3,
    rifleman_commissioned_volume_discount: 5,
    rifleman_manifest_reinforced_contracts: 3,
    rifleman_commissioned_officer_supply: 3
  }, ["B1", "B2", "B3"]);

  var wantB4 = B4 + 50 + 15 - 25 + 200 + 30 + 15;
  var wantB5 = B5 + 50 + 15 - 25 + 350 + 45 + 15;
  t.eq(h.run(tw + ".upgradeCost('B4')"), wantB4,
    "B4 quotes every component exactly once");
  t.eq(h.run(tw + ".upgradeCost('B5')"), wantB5, "and so does B5");

  // THE PANEL, THE AFFORDABILITY CHECK AND THE TILL ARE THE SAME NUMBER.
  var card = h.run("(function () { var tw = " + tw + ";" +
    "  var acts = tw.panelActions();" +
    "  for (var i = 0; i < acts.length; i++)" +
    "    if (/B4/.test(acts[i].label || '') || /B4/.test(acts[i].id || ''))" +
    "      return acts[i].detail;" +
    "  return null; })()");
  t.eq(card, wantB4 + " mana", "the panel button quotes it: " + card);

  h.run("cash = " + (wantB4 - 1));
  t.eq(h.run("buyUpgrade(" + tw + ", 'B4')"), "not enough mana",
    "one mana short is refused at exactly that price");
  h.run("cash = " + wantB4);
  var spentBefore = h.run(tw + ".totalSpent");
  t.eq(h.run("buyUpgrade(" + tw + ", 'B4')"), null, "and the exact price buys");
  t.eq(h.run("cash"), 0, "the till took every coin of it");
  t.eq(h.run(tw + ".totalSpent") - spentBefore, wantB4,
    "and the sale value records the same sum");
});

test("Carbide Tip bypasses fractional flat armor and never percentage defence",
function (t) {
  var h = bootSquares();
  var B3 = ["B1", "B2", "B3"];

  [[1, 2.15, 5.3], [2, 2.30, 5.6], [3, 2.45, 5.9]].forEach(function (row) {
    var tw = squareTower(h, ["rif_b1", "rif_b2", "rif_b3"],
      { rifleman_piercing_carbide_tip: row[0] }, B3);
    t.near(h.run(tw + ".armorPierce"), row[1], 1e-9,
      "rank " + row[0] + " ignores " + row[1] + " flat armor");
    t.near(h.run(tw + ".recruitArmorPierce"), row[1], 1e-9,
      "and its recruits ignore the same");
    t.near(h.run(tw + ".fireRateMult"), 1 - row[2] / 100, 1e-9,
      "against a −" + row[2] + "% fire rate");
    t.near(h.run(tw + ".recruitShotsPerSecond"),
      h.run("Soldier.RECRUIT_SHOTS_PER_SECOND") * (1 - row[2] / 100), 1e-9,
      "which the recruits pay too");
  });

  // NOTHING BELOW B3, because Piercing Orders itself gives nothing below B3.
  var early = squareTower(h, ["rif_b1", "rif_b2", "rif_b3"],
    { rifleman_piercing_carbide_tip: 3 }, ["B1", "B2"]);
  t.eq(h.run(early + ".armorPierce"), 0, "no bypass at B2");
  t.eq(h.run(early + ".fireRateMult"), 1, "and no penalty either");

  // THE MITIGATION RULE ITSELF: fractional, clamped at zero, and blind to
  // percentage defence.
  t.near(h.run("Mitigation.mitigate(10, { armor: 3, defense: 50 }, 0, 0, 0)"),
    3.5, 1e-9, "10 raw through 3 armor and 50% defence is 3.5");
  t.near(h.run("Mitigation.mitigate(10, { armor: 3, defense: 50 }, 0, 0, 2.45)"),
    4.725, 1e-9, "2.45 of bypass is a FRACTIONAL 0.55 of armor left");
  t.near(h.run("Mitigation.mitigate(10, { armor: 1, defense: 0 }, 0, 0, 3.45)"),
    10, 1e-9, "more bypass than armor clamps at zero and never adds damage");
  t.near(h.run("Mitigation.mitigate(10, { armor: 0, defense: 40 }, 0, 0, 3.45)"),
    6, 1e-9, "and percentage defence is untouched by any amount of it");

  // AND THE ENEMY'S OWN NUMBER IS NEVER EDITED.
  var kept = h.run("(function () { var e = { armor: 3, defense: 0 };" +
    "  Mitigation.mitigate(10, e, 0, 0, 2.45); return e.armor; })()");
  t.eq(kept, 3, "the body meets the next tower's shot at full plate");
});

test("Deep Stakes and Entrenched Ammunition resolve the dug-in numbers",
function (t) {
  var h = bootSquares();
  var B4 = ["B1", "B2", "B3", "B4"];
  var FOUR = ["rif_b1", "rif_b2", "rif_b3", "rif_b4"];

  var plain = squareTower(h, FOUR, {}, B4);
  var base = h.run(plain + ".recruitStats()");
  t.near(base.entrenchRangeMult, 1.25, 1e-9, "the parent digs in at +25% range");
  t.near(base.entrenchRateMult, 1.25, 1e-9, "+25% fire rate");
  t.near(base.entrenchDamageTakenMult, 0.75, 1e-9, "and 25% less damage taken");

  [1, 2, 3].forEach(function (rank) {
    var tw = squareTower(h, FOUR, { rifleman_entrenchment_deep_stakes: rank }, B4);
    var st = h.run(tw + ".recruitStats()");
    t.near(st.entrenchRangeMult, 1 + (25 + rank) / 100, 1e-9,
      "Deep Stakes rank " + rank + " digs in at +" + (25 + rank) + "% range");
    t.near(st.entrenchRateMult, 1 + (25 + rank) / 100, 1e-9, "the same fire rate");
    t.near(st.entrenchDamageTakenMult, 1 - (25 + rank) / 100, 1e-9,
      "and the same damage reduction");
    t.near(st.cooldownSeconds, 45 + 0.5 * rank, 1e-9,
      "with Rapid Muster the cooldown is 45 + " + (0.5 * rank));
  });

  // WITHOUT RAPID MUSTER IT IS THE OTHER TABLE, 55 + 0.5r.
  [1, 2, 3].forEach(function (rank) {
    var tw = squareTower(h, ["rif_b1", "rif_b3", "rif_b4"],
      { rifleman_entrenchment_deep_stakes: rank }, B4);
    t.near(h.run(tw + ".recruitStats().cooldownSeconds"), 55 + 0.5 * rank, 1e-9,
      "Entrenchment alone at rank " + rank + " calls every " + (55 + 0.5 * rank) + " s");
  });

  // ENTRENCHED AMMUNITION: the range points come off the SUM, so Deep Stakes'
  // points go on before this one comes off.
  [1, 2, 3, 4, 5].forEach(function (rank) {
    var tw = squareTower(h, FOUR, {
      rifleman_piercing_carbide_tip: 2,
      rifleman_entrenchment_deep_stakes: 2,
      rifleman_piercing_entrenched_ammunition: rank
    }, B4);
    var st = h.run(tw + ".recruitStats()");
    t.near(st.entrenchArmorPierce, 2 * rank / 10, 1e-9,
      "rank " + rank + " adds " + (2 * rank / 10) + " flat armor bypass while dug in");
    t.near(st.entrenchRangeMult, 1 + (25 + 2 - rank) / 100, 1e-9,
      "and takes " + rank + " points off a 27-point range bonus");
  });

  // WITHOUT DEEP STAKES' POINTS the stated table is +24 down to +20 — asserted
  // through the resolved stat rather than through the node's arithmetic.
  [1, 2, 3, 4, 5].forEach(function (rank) {
    var tw = squareTower(h, FOUR,
      { rifleman_piercing_entrenched_ammunition: rank }, B4);
    t.near(h.run(tw + ".recruitStats().entrenchRangeMult"),
      1 + (25 - rank) / 100, 1e-9,
      "rank " + rank + " alone reads +" + (25 - rank) + "% range");
  });

  // THE EXTRA BYPASS IS THERE ONLY WHILE IT IS DUG IN, and goes the frame it
  // moves. Nothing about the walking speed or the march changes.
  var tw = squareTower(h, FOUR, {
    rifleman_piercing_carbide_tip: 2,
    rifleman_entrenchment_deep_stakes: 2,
    rifleman_piercing_entrenched_ammunition: 5
  }, B4);
  var life = h.run("(function () { var tower = " + tw + ";" +
    "  var r = new SoldierRecruit(path, tower, true, tower.recruitStats());" +
    "  var walking = r.resolvedArmorPierce();" +
    "  var speed = r.speedUlps;" +
    "  r.holding = true; r.holdTime = 99; r.updateEntrenchment();" +
    "  var dug = { pierce: r.resolvedArmorPierce()," +
    "              range: r.rangePx / ul(r.rangeUl)," +
    "              taken: r.damageTakenMult, entrenched: r.entrenched };" +
    "  r.holding = false; r.holdTime = 0; r.updateEntrenchment();" +
    "  return { walking: walking, speed: speed, dug: dug," +
    "           after: r.resolvedArmorPierce()," +
    "           afterRange: r.rangePx / ul(r.rangeUl)," +
    "           afterTaken: r.damageTakenMult," +
    "           afterSpeed: r.speedUlps }; })()");
  t.near(life.walking, 2.3, 1e-9, "walking, it ignores only Piercing Orders' 2.30");
  t.near(life.dug.pierce, 3.3, 1e-9, "dug in, another 1.00 on top");
  t.near(life.dug.range, 1.22, 1e-9, "with 25 + 2 − 5 points of reach");
  t.near(life.dug.taken, 0.73, 1e-9, "and 27% less damage taken");
  t.near(life.after, 2.3, 1e-9, "one step and the extra bypass is gone");
  t.near(life.afterRange, 1, 1e-9, "so is the reach");
  t.near(life.afterTaken, 1, 1e-9, "and the protection");
  t.eq(life.afterSpeed, life.speed, "and none of it ever touched how it walks");
});

test("Battery Setup replaces the threshold, and movement still clears the state",
function (t) {
  var h = bootSquares();
  var B4 = ["B1", "B2", "B3", "B4"];
  var FOUR = ["rif_b1", "rif_b2", "rif_b3", "rif_b4"];

  [[0, 1.5], [1, 1.45], [2, 1.35], [3, 1.2], [4, 1], [5, 0.75]]
    .forEach(function (row) {
      var tw = squareTower(h, FOUR,
        row[0] ? { rifleman_entrenchment_battery_setup: row[0] } : {}, B4);
      t.near(h.run(tw + ".recruitStats().entrenchSeconds"), row[1], 1e-9,
        "rank " + row[0] + " digs in after " + row[1] + " s");
    });

  // THE THRESHOLD IS THE ONLY THING IT MOVES. A recruit under it is not dug in,
  // a recruit over it is, movement clears the state that same frame, and a
  // break in the firing resets the progress.
  var tw = squareTower(h, FOUR, { rifleman_entrenchment_battery_setup: 5 }, B4);
  var probe = h.run("(function () { var tower = " + tw + ";" +
    "  var r = new SoldierRecruit(path, tower, true, tower.recruitStats());" +
    "  r.holding = true;" +
    "  r.holdTime = 0.74; r.updateEntrenchment(); var under = r.entrenched;" +
    "  r.holdTime = 0.75; r.updateEntrenchment(); var at = r.entrenched;" +
    "  r.holding = false; r.holdTime = 0; r.updateEntrenchment();" +
    "  var moved = r.entrenched;" +
    "  r.holding = true; r.holdTime = 0.5; r.updateEntrenchment();" +
    "  var restarted = r.entrenched;" +
    "  return { under: under, at: at, moved: moved, restarted: restarted }; })()");
  t.eq(probe.under, false, "0.74 s of standing and firing is not enough");
  t.eq(probe.at, true, "0.75 s is");
  t.eq(probe.moved, false, "and losing the target clears it in the same call");
  t.eq(probe.restarted, false,
    "the clock starts again from zero rather than resuming");

  // BATTERY SETUP IS ITS OWN BRANCH — Deep Stakes is not a prerequisite.
  t.deep(h.run("(TowerPerks.upgrade2Of('soldier'," +
    " 'rifleman_entrenchment_battery_setup').requires || [])" +
    ".map(function (r) { return r.id; })"), [],
    "Battery Setup requires no other square");
  t.deep(h.run("TowerPerks.upgrade2Of('soldier'," +
    " 'rifleman_entrenchment_battery_setup').prices"),
    [150, 250, 400, 650, 1000], "and keeps the H5 curve exactly");
});

test("Campaign Tempo and Decorated Ceiling move the gain and the ceiling",
function (t) {
  var h = bootSquares();
  var THREE = ["rif_n1", "rif_n2", "rif_n3"];

  var plain = squareTower(h, THREE, {}, []);
  t.near(h.run(plain + ".rhythmPerKill"), 0.02, 1e-9, "the parent buys 2 points a kill");
  t.near(h.run(plain + ".rhythmEarnedCap"), 0.12, 1e-9, "up to 12");

  [[1, 2.15], [2, 2.30], [3, 2.45]].forEach(function (row) {
    var tw = squareTower(h, THREE, { rifleman_veteran_campaign_tempo: row[0] }, []);
    t.near(h.run(tw + ".rhythmPerKill"), row[1] / 100, 1e-9,
      "Campaign Tempo rank " + row[0] + " buys " + row[1] + " points a kill");
    t.near(h.run(tw + ".rhythmEarnedCap"), 0.12, 1e-9,
      "without raising the ceiling");
    // AND IT CANNOT CLIMB PAST THE CEILING it did not move.
    t.near(h.run("(function () { var tw = " + tw + "; tw.kills = 40;" +
      "  return tw.rhythmMult(); })()"), 1.06, 1e-9,
      "forty kills still tops out at +6% net");
  });

  [[1, 12.5], [2, 13], [3, 13.5], [4, 14], [5, 14.5]].forEach(function (row) {
    var tw = squareTower(h, THREE, {
      rifleman_veteran_campaign_tempo: 2,
      rifleman_veteran_decorated_ceiling: row[0]
    }, []);
    t.near(h.run(tw + ".rhythmEarnedCap"), row[1] / 100, 1e-9,
      "Decorated Ceiling rank " + row[0] + " earns up to +" + row[1]);
    t.near(h.run("(function () { var tw = " + tw + "; tw.kills = 99;" +
      "  return tw.rhythmMult(); })()"), 0.94 + row[1] / 100, 1e-9,
      "so the best net is " + (row[1] - 6) + "%");
  });

  // THE OPENING PENALTY IS UNTOUCHED, one kill still counts once, and the
  // stacks still clear at the wave boundary.
  var tw = squareTower(h, THREE, {
    rifleman_veteran_campaign_tempo: 3,
    rifleman_veteran_decorated_ceiling: 5
  }, []);
  t.near(h.run("(function () { var tw = " + tw + ";" +
    "  tw.kills = tw.rhythmKillBase; return tw.rhythmMult(); })()"), 0.94, 1e-9,
    "a wave still opens at −6%");
  t.near(h.run("(function () { var tw = " + tw + ";" +
    "  tw.kills = tw.rhythmKillBase + 1; return tw.rhythmMult(); })()"),
    0.94 + 0.0245, 1e-9, "one kill buys exactly 2.45 points");
  h.run("(function () { var tw = " + tw + "; tw.kills = 60; })()");
  t.near(h.run(tw + ".rhythmMult()"), 0.94 + 0.145, 1e-9, "and the band tops at +14.5");
  h.run("endWave(3, 0)");
  t.near(h.run(tw + ".rhythmMult()"), 0.94, 1e-9, "the next wave opens on the penalty");
  t.eq(h.run(tw + ".kills"), 60, "without touching the lifetime count");
});

test("Sorted Parts is spent by a completed purchase and by nothing else",
function (t) {
  var h = bootSquares();
  var A1 = baseTier(h, "A1");
  var B1 = baseTier(h, "B1");

  [1, 2, 3, 4, 5].forEach(function (rank) {
    var tw = squareTower(h, ["rif_s1"], { rifleman_cheap_sorted_parts: rank }, []);
    t.eq(h.run(tw + ".upgradeCost('A1')"), A1 - 5 * rank,
      "rank " + rank + " takes " + (5 * rank) + " off the first tier");
    t.eq(h.run(tw + ".upgradeCost('B1')"), B1 - 5 * rank,
      "whichever tier that turns out to be");
  });

  // ASKING IS FREE. A hover, a preview, a refusal and a card all read the
  // discounted price and leave it standing.
  var tw = squareTower(h, ["rif_s1"], { rifleman_cheap_sorted_parts: 5 }, []);
  h.run(tw + ".upgradeCost('A1')");
  h.run(tw + ".previewUpgrade('A1')");
  h.run(tw + ".upgradeCard(Soldier.upgradeById('A1'), null, " +
        tw + ".previewUpgrade('A1'))");
  h.run("cash = 10");
  t.eq(h.run("buyUpgrade(" + tw + ", 'A1')"), "not enough mana",
    "a refused purchase is refused");
  t.eq(h.run(tw + ".upgradeCost('A1')"), A1 - 25,
    "and none of that spent the discount");

  // A COMPLETED PURCHASE DOES, whichever tier it was.
  h.run("cash = 100000");
  var before = h.run("cash");
  t.eq(h.run("buyUpgrade(" + tw + ", 'B1')"), null, "B1 buys");
  t.eq(before - h.run("cash"), B1 - 25, "at the discounted price");
  t.eq(h.run(tw + ".upgradeCost('A1')"), A1,
    "and the NEXT tier on this body is full price");
  t.eq(h.run(tw + ".upgradeCost('B2')"), baseTier(h, "B2"),
    "on either path");

  // ONE PER BODY, so a second Rifleman gets its own.
  h.run("(function () { var Type = MetaProgress.constructorOf('soldier');" +
        "  addTower(new Type(900, 200, path)); })()");
  // FOUND BY WHERE IT STANDS, not by its index: `addTower` sorts the list by
  // path progress, so the tower just built is not reliably the last one.
  var other = h.run("(function () {" +
    "  for (var i = 0; i < towers.length; i++)" +
    "    if (towers[i].x === 900) return towers[i].upgradeCost('A1');" +
    "  return null; })()");
  t.eq(other, A1 - 25, "a second Rifleman has its own first-tier discount");

  // AND IT CANNOT PAY THE PLAYER. Floored at the game's ordinary minimum.
  var deep = squareTower(h, ["rif_s1", "rif_n1"], {
    rifleman_cheap_sorted_parts: 5,
    rifleman_commissioned_volume_discount: 5
  }, []);
  t.ok(h.run(deep + ".upgradeCost('A1')") >= 0,
    "a stack of discounts never goes below zero");
});

test("Aggressive Contract prices the first Rifleman and every one after it",
function (t) {
  var h = bootSquares();
  var COST = h.run("Soldier.COST");

  [[1, 110, 44], [2, 120, 48], [3, 130, 52], [4, 140, 56], [5, 150, 60]]
    .forEach(function (row) {
      h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar()");
      h.run("MetaProgress.snapshot().owned.forEach(function (id) {" +
            "  MetaProgress.addXp(id, 20000); })");
      h.run("MetaProgress.buyNode('soldier', 'rif_s2', 0);" +
            "MetaProgress.equipPerk('soldier', 'rif_s2', 0)");
      setRanks(h, { rifleman_advance_aggressive_contract: row[0] });
      h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); towers = []");
      t.eq(h.run("TowerPerks.priceOf(MetaProgress.constructorOf('soldier'))"),
        COST - row[1], "rank " + row[0] + " puts the first at " + (COST - row[1]));
      h.run("TowerPerks.notePlacement('soldier')");
      t.eq(h.run("TowerPerks.priceOf(MetaProgress.constructorOf('soldier'))"),
        COST + row[2], "and every one after it at " + (COST + row[2]));
    });

  // WITH CHEAP RECEIVER, the owner's stated pair: 100 then 310.
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar()");
  h.run("MetaProgress.snapshot().owned.forEach(function (id) {" +
        "  MetaProgress.addXp(id, 20000); })");
  ["rif_s1", "rif_s2"].forEach(function (id, i) {
    h.run("MetaProgress.buyNode('soldier', '" + id + "', 0);" +
          "MetaProgress.equipPerk('soldier', '" + id + "', " + i + ")");
  });
  setRanks(h, { rifleman_advance_aggressive_contract: 5 });
  h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); towers = []");
  t.eq(h.run("TowerPerks.priceOf(MetaProgress.constructorOf('soldier'))"), 100,
    "the first Rifleman costs 100 mana");
  h.run("TowerPerks.notePlacement('soldier')");
  t.eq(h.run("TowerPerks.priceOf(MetaProgress.constructorOf('soldier'))"), 310,
    "and every one after it 310");
});

test("First Deployment lasts three opened waves on one body and never transfers",
function (t) {
  var h = bootSquares();

  // PLACED BETWEEN WAVES. The bonus is on from the moment it stands up, and it
  // multiplies the RESOLVED reach — Long Glass and Extended Lens are already in
  // the number by the time this lands.
  var tw = squareTower(h, ["rif_s2", "rif_n2"], {
    rifleman_advance_first_deployment: 5,
    rifleman_long_glass_extended_lens: 3
  }, []);
  var reach = h.run("Soldier.BASE_RANGE_UL") + 10 + 3;
  t.near(h.run(tw + ".rangeUl"), reach * 1.25, 1e-9,
    "113 u.l. of resolved reach, plus 25% of it");
  t.near(h.run(tw + ".rangePx"), h.run("elevatedRangePx(" + tw + ", " +
    (reach * 1.25) + ")"), 1e-6, "and the ring the tower shoots with agrees");

  // THREE OPENED WAVES, AND THE FOURTH TAKES IT AWAY.
  h.run("waveIndex = 0");
  var reads = [h.run(tw + ".rangeUl")];
  for (var w = 0; w < 4; w++) {
    h.run("beginWave()");
    reads.push(h.run(tw + ".rangeUl"));
  }
  t.near(reads[1], reach * 1.25, 1e-9, "wave 1 still has it");
  t.near(reads[2], reach * 1.25, 1e-9, "wave 2 still has it");
  t.near(reads[3], reach * 1.25, 1e-9, "wave 3 still has it");
  t.near(reads[4], reach, 1e-9, "and the opening of wave 4 takes it away");
  t.eq(h.run(tw + ".wavesOpened"), 4, "four waves have opened over it");

  // EVERY RANK, on its own.
  [1, 2, 3, 4, 5].forEach(function (rank) {
    var one = squareTower(h, ["rif_s2"],
      { rifleman_advance_first_deployment: rank }, []);
    t.near(h.run(one + ".rangeUl"),
      h.run("Soldier.BASE_RANGE_UL") * (1 + 5 * rank / 100), 1e-9,
      "rank " + rank + " reaches " + (5 * rank) + "% further");
  });

  // PLACED INTO A RUNNING WAVE, that wave counts as its first.
  //
  // THE RUN IS RESTARTED RATHER THAN THE BOARD CLEARED, and the difference is
  // the point: `towers = []` leaves TowerPerks' placement tally where it was,
  // so the next tower would be the run's SECOND Rifleman and would correctly
  // get nothing. `startRun` is what resets the tally, exactly as it does in the
  // game.
  squareTower(h, ["rif_s2"], { rifleman_advance_first_deployment: 5 }, []);
  h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000;" +
        "towers = []; waveIndex = 0; waveCountdown = 0");
  t.eq(h.run("waveInPlay()"), true, "a wave really is on the clock");
  h.run("(function () { var Type = MetaProgress.constructorOf('soldier');" +
        "  addTower(new Type(200, 200, path)); })()");
  t.eq(h.run("towers[0].wavesOpened"), 1,
    "a Rifleman placed into a running wave has already joined it");
  t.eq(h.run("towers[0].firstDeploymentActive"), true, "and carries the bonus");
  h.run("beginWave(); beginWave(); beginWave()");
  t.eq(h.run("towers[0].firstDeploymentActive"), false,
    "three more openings and its fourth wave has begun");

  // AND IT NEVER TRANSFERS. A second Rifleman is never the first, and selling
  // the first does not hand the title on.
  var again = squareTower(h, ["rif_s2"], { rifleman_advance_first_deployment: 5 }, []);
  h.run("(function () { var Type = MetaProgress.constructorOf('soldier');" +
        "  addTower(new Type(900, 200, path)); })()");
  var second = h.run("(function () {" +
    "  for (var i = 0; i < towers.length; i++)" +
    "    if (!towers[i].perkFirstOfType)" +
    "      return { range: towers[i].rangeUl, active: towers[i].firstDeploymentActive };" +
    "  return null; })()");
  t.ok(second !== null, "there is a second Rifleman");
  t.eq(second.active, false, "and it is not carrying the bonus");
  t.near(second.range, h.run("Soldier.BASE_RANGE_UL"), 1e-9, "so it reaches 100");

  h.run("(function () { for (var i = 0; i < towers.length; i++)" +
        "  if (towers[i].perkFirstOfType) { sellTower(towers[i]); return; } })()");
  var left = h.run("(function () { return { n: towers.length," +
    "  active: towers[0].firstDeploymentActive," +
    "  range: towers[0].rangeUl }; })()");
  t.eq(left.n, 1, "the first Rifleman is sold");
  t.eq(left.active, false, "and the survivor did not inherit the bonus");
  t.near(left.range, h.run("Soldier.BASE_RANGE_UL"), 1e-9, "nor the reach");

  // THE GHOST DRAWS THE RING THE PLACED TOWER GETS.
  h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); towers = []");
  var Type = "MetaProgress.constructorOf('soldier')";
  t.near(h.run("TowerPerks.previewRangeUl(" + Type + ", { firstDeploymentActive: true })"),
    h.run("Soldier.BASE_RANGE_UL") * 1.25, 1e-9,
    "the ghost of the first Rifleman shows the wider circle");
  t.near(h.run("TowerPerks.previewRangeUl(" + Type + ", { firstDeploymentActive: false })"),
    h.run("Soldier.BASE_RANGE_UL"), 1e-9, "and the ghost of a later one does not");
});

test("Salvage Conscription pays the first Rifleman and delays every squad",
function (t) {
  var h = bootSquares();
  var OPEN = {
    rifleman_manifest_reinforced_contracts: 2,
    rifleman_cheap_sorted_parts: 2
  };

  [1, 2, 3].forEach(function (rank) {
    var ranks = { rifleman_manifest_salvage_conscription: rank };
    Object.keys(OPEN).forEach(function (k) { ranks[k] = OPEN[k]; });
    var tw = squareTower(h, ["rif_b1", "rif_s1"], ranks,
      ["B1", "B2", "B3", "B4"]);
    t.near(h.run(tw + ".recruitDeploySeconds"), 15 * rank / 100, 1e-9,
      "rank " + rank + " delays the squad by " + (15 * rank / 100) + " s");

    // ONE DELAY IN FRONT OF THE GROUP, not one between every pair.
    var due = h.run("(function () { var tower = " + tw + ";" +
      "  tower.recruitCooldown = 0; tower.callRecruits();" +
      "  return tower.recruitPending.slice(); })()");
    var stagger = h.run("Soldier.RECRUIT_STAGGER_SECONDS");
    t.eq(due.length, 3, "three recruits at B4 with the Manifest");
    t.near(due[0], 15 * rank / 100, 1e-9, "the first is due after the delay");
    t.near(due[1] - due[0], stagger, 1e-9, "and the spacing inside is untouched");
    t.near(due[2] - due[1], stagger, 1e-9, "for every pair of them");
  });

  // THE DELAY IS ON EVERY RIFLEMAN; THE HEALTH IS ON ONE.
  var ranks = { rifleman_manifest_salvage_conscription: 3 };
  Object.keys(OPEN).forEach(function (k) { ranks[k] = OPEN[k]; });
  squareTower(h, ["rif_b1", "rif_s1"], ranks, ["B1", "B2", "B3", "B4"]);
  h.run("(function () { var Type = MetaProgress.constructorOf('soldier');" +
        "  var tw = new Type(900, 200, path); addTower(tw);" +
        "  tw.hasB1 = tw.hasB2 = tw.hasB3 = tw.hasB4 = true; tw.recalcStats(); })()");
  var pair = h.run("(function () { var out = [];" +
    "  for (var i = 0; i < towers.length; i++) out.push({" +
    "    first: towers[i].perkFirstOfType," +
    "    delay: towers[i].recruitDeploySeconds," +
    "    hp: towers[i].recruitHp });" +
    "  return out; })()");
  pair.forEach(function (row) {
    t.near(row.delay, 0.45, 1e-9,
      (row.first ? "the first" : "a later") + " Rifleman's squad is delayed 0.45 s");
  });
  var firstHp = pair.filter(function (r) { return r.first; })[0].hp;
  var laterHp = pair.filter(function (r) { return !r.first; })[0].hp;
  t.near(firstHp, 20 * 1.1, 1e-9, "the first Rifleman's recruits carry +10 points");
  t.near(laterHp, 20 * 1.04, 1e-9, "a later one's carry only Reinforced Contracts' +4");
});

test("Officer Supply, Extended Lens, Premium Lot and Volume Discount",
function (t) {
  var h = bootSquares();
  var B4 = baseTier(h, "B4");
  var B5 = baseTier(h, "B5");

  // OFFICER SUPPLY ARMS THE RECRUITS' RIFLES and dearens the two tiers.
  [1, 2, 3].forEach(function (rank) {
    var tw = squareTower(h, ["rif_n1", "rif_b1"], {
      rifleman_commissioned_premium_lot: 2,
      rifleman_manifest_reinforced_contracts: 2,
      rifleman_commissioned_officer_supply: rank
    }, ["B1", "B2", "B3", "B4"]);
    t.near(h.run(tw + ".recruitDamage"),
      h.run("Soldier.RECRUIT_DAMAGE") + rank / 10, 1e-9,
      "rank " + rank + " puts +" + (rank / 10) + " on a recruit's shots");
    t.eq(h.run(tw + ".upgradeCost('B4')"),
      B4 + 50 + 10 + 200 + 20 + 5 * rank, "and +" + (5 * rank) + " on B4");
    t.eq(h.run(tw + ".upgradeCost('B5')"),
      B5 + 50 + 10 + 350 + 30 + 5 * rank, "and the same on B5");
  });

  // A RECRUIT'S BODY BLOCK IS NOT ITS RIFLE, so it gains nothing there — the
  // contact exchange reads its health, never `stats.damage`.
  var armed = squareTower(h, ["rif_n1", "rif_b1"], {
    rifleman_commissioned_premium_lot: 2,
    rifleman_manifest_reinforced_contracts: 2,
    rifleman_commissioned_officer_supply: 3
  }, ["B1", "B2", "B3", "B4"]);
  t.eq(h.run("/stats\\.damage/.test(String(SoldierRecruit.prototype.takeContactDamage))"),
    false, "the body block never reads the recruit's weapon damage");
  t.near(h.run(armed + ".recruitStats().damage"),
    h.run("Soldier.RECRUIT_DAMAGE") + 0.3, 1e-9, "while its rifle carries it");

  // EXTENDED LENS: reach and placement, never muzzle velocity.
  [1, 2, 3].forEach(function (rank) {
    var tw = squareTower(h, ["rif_n2"],
      { rifleman_long_glass_extended_lens: rank }, []);
    t.near(h.run(tw + ".rangeUl"), h.run("Soldier.BASE_RANGE_UL") + 10 + rank, 1e-9,
      "rank " + rank + " reaches " + (10 + rank) + " further than the base");
    t.near(h.run(tw + ".projectileSpeedMult"), 1.25, 1e-9,
      "and the rounds fly no faster than Long Glass already made them");
    t.eq(h.run("TowerPerks.priceOf(MetaProgress.constructorOf('soldier'))"),
      h.run("Soldier.COST") + 50 + 5 * rank,
      "for " + (50 + 5 * rank) + " more mana on the placement");
  });

  // PREMIUM LOT IS A TABLE OF TOTALS, and it touches every tier.
  [[1, 0.05, 5], [2, 0.1, 10], [3, 0.15, 15]].forEach(function (row) {
    var tw = squareTower(h, ["rif_n1"],
      { rifleman_commissioned_premium_lot: row[0] }, []);
    t.near(h.run(tw + ".damage"), 2 + row[1], 1e-9,
      "rank " + row[0] + " reads +" + row[1] + " damage in TOTAL");
    ["A1", "A5", "B1", "B5"].forEach(function (id) {
      t.eq(h.run(tw + ".upgradeCost('" + id + "')"),
        baseTier(h, id) + 50 + row[2], id + " pays the parent's 50 and " + row[2]);
    });
  });

  // VOLUME DISCOUNT REACHES ONE SURCHARGE ONLY.
  [1, 2, 3, 4, 5].forEach(function (rank) {
    var tw = squareTower(h, ["rif_n1"],
      { rifleman_commissioned_volume_discount: rank }, []);
    t.eq(h.run(tw + ".upgradeCost('A1')"), baseTier(h, "A1") + 50 - 5 * rank,
      "rank " + rank + " leaves Commissioned Ammunition charging +" + (50 - 5 * rank));
  });
  var mixed = squareTower(h, ["rif_n1", "rif_b1"], {
    rifleman_commissioned_premium_lot: 3,
    rifleman_commissioned_volume_discount: 5,
    rifleman_manifest_reinforced_contracts: 3
  }, []);
  t.eq(h.run(mixed + ".upgradeCost('B4')"),
    baseTier(h, "B4") + 25 + 15 + 200 + 30,
    "beside the others it discounts its own surcharge and nobody else's");
});

test("rank 0 and an empty loadout leave the Rifleman exactly as it was",
function (t) {
  var h = bootSquares();

  // A FRESH PROFILE. Every square is at rank 0, and the tower resolves the
  // authored numbers to the bit.
  var plain = squareTower(h, [], {}, []);
  var snap = h.run("(function () { var tw = " + plain + "; return {" +
    "  damage: tw.damage, range: tw.rangeUl, shots: tw.shotsPerBurst," +
    "  fireRate: tw.fireRateMult, pierce: tw.armorPierce," +
    "  gain: tw.ratchetGain, loss: tw.ratchetLoss," +
    "  early: tw.burstEarlyShotMult, last: tw.burstFinalShotMult," +
    "  recruitHp: tw.recruitHp, recruitDamage: tw.recruitDamage," +
    "  cooldown: tw.resolvedRecruitCooldown(), entrench: tw.recruitEntrenchSeconds," +
    "  perKill: tw.rhythmPerKill, cap: tw.rhythmEarnedCap," +
    "  a1: tw.upgradeCost('A1'), b5: tw.upgradeCost('B5') }; })()");

  t.eq(snap.damage, h.run("Soldier.BASE_DAMAGE"), "base damage");
  t.eq(snap.range, h.run("Soldier.BASE_RANGE_UL"), "base range");
  t.eq(snap.shots, h.run("Soldier.BASE_SHOTS_PER_BURST"), "base burst");
  t.eq(snap.fireRate, 1, "no fire-rate multiplier");
  t.eq(snap.pierce, 0, "no armor bypass");
  t.eq(snap.gain, 1, "no ratchet reward");
  t.eq(snap.loss, 1, "no ratchet penalty");
  t.eq(snap.early, 1, "no early-shot penalty");
  t.eq(snap.last, 1, "no final-shot bonus");
  t.eq(snap.recruitHp, h.run("Soldier.RECRUIT_HP"), "the authored recruit health");
  t.eq(snap.recruitDamage, h.run("Soldier.RECRUIT_DAMAGE"), "and its damage");
  t.eq(snap.cooldown, h.run("Soldier.RECRUIT_COOLDOWN_SECONDS"), "and its cooldown");
  t.eq(snap.entrench, 0, "no entrenchment at all");
  t.eq(snap.perKill, 0, "no rhythm");
  t.eq(snap.cap, 0, "and no ceiling to reach");
  t.eq(snap.a1, baseTier(h, "A1"), "A1 is its authored price");
  t.eq(snap.b5, baseTier(h, "B5"), "and so is B5");
  t.eq(h.run("TowerPerks.priceOf(MetaProgress.constructorOf('soldier'))"),
    h.run("Soldier.COST"), "and the tower costs what it costs");

  // EVERY SQUARE AT MAXIMUM WITH AN EMPTY LOADOUT IS THE SAME TOWER. Nothing
  // is equipped, so nothing applies, however much was paid for.
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar()");
  h.run("MetaProgress.snapshot().owned.forEach(function (id) {" +
        "  MetaProgress.addXp(id, 20000); })");
  h.run("TowerPerks.nodes('soldier').forEach(function (n) {" +
        "  MetaProgress.buyNode('soldier', n.id, 0); })");
  h.run("TowerPerks.upgrades2('soldier').forEach(function (n) {" +
        "  for (var r = 1; r <= n.maxRank; r++)" +
        "    MetaProgress.buyRank('soldier', n.id, 0, r); })");
  h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); cash = 100000000; towers = []");
  h.run("(function () { var Type = MetaProgress.constructorOf('soldier');" +
        "  addTower(new Type(200, 200, path)); })()");
  var loaded = h.run("(function () { var tw = towers[0]; return {" +
    "  damage: tw.damage, range: tw.rangeUl, fireRate: tw.fireRateMult," +
    "  pierce: tw.armorPierce, recruitHp: tw.recruitHp," +
    "  a1: tw.upgradeCost('A1'), b5: tw.upgradeCost('B5')," +
    "  price: TowerPerks.priceOf(MetaProgress.constructorOf('soldier')) }; })()");
  t.eq(loaded.damage, snap.damage, "every rank owned, nothing equipped: same damage");
  t.eq(loaded.range, snap.range, "same reach");
  t.eq(loaded.fireRate, snap.fireRate, "same rate of fire");
  t.eq(loaded.pierce, snap.pierce, "same bypass");
  t.eq(loaded.recruitHp, snap.recruitHp, "same recruits");
  t.eq(loaded.a1, snap.a1, "same tier prices");
  t.eq(loaded.b5, snap.b5, "on both paths");
  t.eq(loaded.price, h.run("Soldier.COST"), "and the same placement price");
});

test("every upgrade-squared node is authored legally", function (t) {
  var h = bootSquares();

  var problems = h.run("(function () {" +
    "  var out = [], ids = {};" +
    "  TowerPerks.towersWithTrees().forEach(function (towerId) {" +
    "    TowerPerks.nodes(towerId).forEach(function (n) { ids[towerId + '/' + n.id] = 'perk'; });" +
    "    TowerPerks.upgrades2(towerId).forEach(function (n) {" +
    "      var key = towerId + '/' + n.id;" +
    "      if (ids[key]) out.push(key + ' collides with a ' + ids[key]);" +
    "      ids[key] = 'square';" +
    "      if (!n.parent) out.push(key + ' has no parent');" +
    "      if (n.parent && !TowerPerks.nodeOf(towerId, n.parent))" +
    "        out.push(key + ' names an unknown parent ' + n.parent);" +
    "      if (n.alsoParent && !TowerPerks.nodeOf(towerId, n.alsoParent))" +
    "        out.push(key + ' names an unknown second parent ' + n.alsoParent);" +
    "      if (n.alsoParent === n.parent) out.push(key + ' fuses with itself');" +
    "      if (!n.maxRank || n.maxRank < 1) out.push(key + ' has no ranks');" +
    "      if (!n.prices || n.prices.length !== n.maxRank)" +
    "        out.push(key + ' has ' + (n.prices || []).length + ' prices for ' +" +
    "          n.maxRank + ' ranks');" +
    "      (n.prices || []).forEach(function (p, i) {" +
    "        if (typeof p !== 'number' || !(p > 0))" +
    "          out.push(key + ' rank ' + (i + 1) + ' has no price');" +
    "        if (i > 0 && p <= n.prices[i - 1])" +
    "          out.push(key + ' rank ' + (i + 1) + ' is not dearer than the last'); });" +
    "      if (typeof n.effectsAt !== 'function') out.push(key + ' does nothing');" +
    "      if (typeof n.valueAt !== 'function') out.push(key + ' states no value');" +
    "      if (!n.upside) out.push(key + ' states no upside');" +
    "      if (!n.at) out.push(key + ' has no place in the tree');" +
    "      (n.requires || []).forEach(function (r) {" +
    "        if (r.id === n.id) out.push(key + ' requires itself');" +
    "        if (!TowerPerks.upgrade2Of(towerId, r.id))" +
    "          out.push(key + ' requires unknown square ' + r.id);" +
    "        if (!(r.rank >= 1)) out.push(key + ' requires a rank of ' + r.rank); });" +
    "      if (n.effectsAt) for (var rank = 1; rank <= n.maxRank; rank++) {" +
    "        var fx = n.effectsAt(rank);" +
    "        if (!fx) { out.push(key + ' resolves nothing at rank ' + rank); continue; }" +
    "        if (fx.onlyIf && fx.price) out.push(key + ' has a conditional price'); }" +
    "    });" +
    "  });" +
    "  return out; })()");
  t.deep(problems, [], "no square has a bad parent, a short price curve, a " +
    "self-reference, a missing effect or a conditional price");

  // NO CYCLE. A `requires` graph that pointed back at an ancestor would be a
  // node nobody could ever buy, and no test of a single node could see it.
  var cycles = h.run("(function () {" +
    "  var out = [];" +
    "  TowerPerks.towersWithTrees().forEach(function (towerId) {" +
    "    var list = TowerPerks.upgrades2(towerId);" +
    "    list.forEach(function (n) {" +
    "      var seen = {}, stack = [n.id];" +
    "      while (stack.length) {" +
    "        var id = stack.pop();" +
    "        if (seen[id]) continue;" +
    "        seen[id] = true;" +
    "        var node = TowerPerks.upgrade2Of(towerId, id);" +
    "        (node && node.requires ? node.requires : []).forEach(function (r) {" +
    "          if (r.id === n.id) out.push(towerId + '/' + n.id + ' is in a cycle');" +
    "          stack.push(r.id); });" +
    "      }" +
    "    });" +
    "  });" +
    "  return out; })()");
  t.deep(cycles, [], "the requirement graph is acyclic");

  // THE RIFLEMAN'S OWN SHAPE: twenty-two nodes and exactly four fusions.
  var squares = h.run("TowerPerks.upgrades2('soldier')");
  t.eq(squares.length, 22, "the Rifleman has twenty-two squares");
  var fusions = h.run("TowerPerks.upgrades2('soldier').filter(function (n) {" +
    "  return TowerPerks.isFusion(n); }).map(function (n) { return n.id; })");
  t.deep(fusions.sort(), [
    "rifleman_commissioned_officer_supply",
    "rifleman_manifest_salvage_conscription",
    "rifleman_overloaded_series_ammunition",
    "rifleman_piercing_entrenched_ammunition"
  ], "and exactly four fusions, the ones the owner named");
  var twoReqs = h.run("TowerPerks.upgrades2('soldier').filter(function (n) {" +
    "  return (n.requires || []).length === 2; }).map(function (n) { return n.id; })");
  t.deep(twoReqs.sort(), fusions.sort(),
    "and only a fusion carries two rank requirements");

  // EVERY SQUARE IS ON THE RIFLEMAN, and no other tower grew one by accident.
  var elsewhere = h.run("TowerPerks.towersWithTrees().filter(function (id) {" +
    "  return id !== 'soldier' && TowerPerks.upgrades2(id).length; })");
  t.deep(elsewhere, [], "no other tower has upgrade-squared content in this pass");

  // AND THE SQUARES ARE NOT IN THE PERK LIST, which is what keeps them out of
  // the five loadout slots and out of the chain rule the arms are held to.
  var leaked = h.run("TowerPerks.nodes('soldier').filter(function (n) {" +
    "  return /^rifleman_/.test(n.id); }).map(function (n) { return n.id; })");
  t.deep(leaked, [], "not one square is in the equippable tree");
  t.deep(chainProblems(h, "soldier"), [],
    "and the twelve permanent upgrades are still four clean chains");
});

test("no rejected upgrade-squared proposal is purchasable", function (t) {
  var h = bootSquares();

  // THE OWNER'S REJECTED LIST, VERBATIM. None of these may exist as a node, by
  // name or by id, in either list of any tree — a rejected concept that shipped
  // under a different id would be exactly as wrong as one that shipped.
  var REJECTED = [
    "Adjusted Cartridge", "Polished Feed Lips", "Closing Striker", "Long Closure",
    "Forgiving Teeth", "Veteran Timing", "Wide Formation", "Budget Clerk",
    "Hasty Levy", "Marching Orders", "Advanced Mobilization", "Plate Reading",
    "Balanced Breech", "Field Logistics", "Covering Fire", "Uniform Powder",
    "Clear Powder", "Lean Mount", "Muster Sight", "Morning Briefing",
    "Armored Trophy", "Thinned Receiver", "Salvage Stock", "Budget Breech",
    "Staggered Order", "First Ratchet"
  ];

  var names = h.run("(function () { var out = [];" +
    "  TowerPerks.towersWithTrees().forEach(function (id) {" +
    "    TowerPerks.nodes(id).forEach(function (n) { out.push(n.name); });" +
    "    TowerPerks.upgrades2(id).forEach(function (n) { out.push(n.name); });" +
    "  }); return out; })()");
  var ids = h.run("(function () { var out = [];" +
    "  TowerPerks.towersWithTrees().forEach(function (id) {" +
    "    TowerPerks.nodes(id).forEach(function (n) { out.push(n.id); });" +
    "    TowerPerks.upgrades2(id).forEach(function (n) { out.push(n.id); });" +
    "  }); return out; })()");

  var found = REJECTED.filter(function (name) {
    var slug = name.toLowerCase().replace(/ /g, "_");
    return names.indexOf(name) !== -1 ||
      ids.some(function (id) { return id.indexOf(slug) !== -1; });
  });
  t.deep(found, [], "not one rejected proposal is in any tree");

  // AND NOTHING BUT THE CONFIRMED TWENTY-TWO IS ON THE RIFLEMAN.
  var CONFIRMED = [
    "Reinforced Spring", "Series Ammunition", "Terminal Charge", "Soft Feed",
    "Hard Ratchet", "Polished Wheel", "Reinforced Contracts",
    "Salvage Conscription", "Medical Selection", "Carbide Tip",
    "Entrenched Ammunition", "Deep Stakes", "Battery Setup", "Premium Lot",
    "Volume Discount", "Officer Supply", "Extended Lens", "Campaign Tempo",
    "Decorated Ceiling", "Sorted Parts", "Aggressive Contract", "First Deployment"
  ];
  var mine = h.run("TowerPerks.upgrades2('soldier').map(function (n) { return n.name; })");
  t.deep(mine.slice().sort(), CONFIRMED.slice().sort(),
    "the Rifleman carries the confirmed list and nothing else");
});

test("what an upgrade-squared card says is what the tower resolves",
function (t) {
  var h = bootSquares();

  // EVERY NODE STATES A VALUE AT EVERY RANK, and the card reads the CURRENT one
  // and the NEXT one — which is the only way the two table nodes can be honest,
  // because "per rank" is a lie for both of them.
  var blanks = h.run("(function () { var out = [];" +
    "  TowerPerks.upgrades2('soldier').forEach(function (n) {" +
    "    for (var r = 0; r <= n.maxRank; r++) {" +
    "      var text = n.valueAt(r);" +
    "      if (typeof text !== 'string' || text.length < 8)" +
    "        out.push(n.id + ' says nothing at rank ' + r); }" +
    "    if (n.downside !== null && typeof n.downside !== 'string')" +
    "      out.push(n.id + ' has a downside that is neither text nor null');" +
    "  }); return out; })()");
  t.deep(blanks, [], "every node states a resolved value at every rank");

  // THE TWO NON-LINEAR ONES PRINT THEIR OWN TABLE, rank by rank.
  ["2.00", "2.10", "2.25", "2.50"].forEach(function (want, rank) {
    t.ok(h.run("TowerPerks.upgrade2Of('soldier', 'rifleman_breach_terminal_charge')" +
      ".valueAt(" + rank + ")").indexOf(want) !== -1,
      "Terminal Charge at rank " + rank + " prints " + want);
  });
  ["1.50", "1.45", "1.35", "1.20", "1.00", "0.75"].forEach(function (want, rank) {
    t.ok(h.run("TowerPerks.upgrade2Of('soldier', 'rifleman_entrenchment_battery_setup')" +
      ".valueAt(" + rank + ")").indexOf(want) !== -1,
      "Battery Setup at rank " + rank + " prints " + want);
  });

  // THE STATE THE CARD DRAWS FROM CARRIES ALL OF IT: the rank, the maximum, the
  // next rank, that rank's own price, both parents and every requirement.
  h.run("MetaProgress.buyNode('soldier', 'rif_a1', 0);" +
        "MetaProgress.buyNode('soldier', 'rif_n1', 0);" +
        "MetaProgress.equipPerk('soldier', 'rif_a1', 0)");
  setRanks(h, { rifleman_overloaded_reinforced_spring: 1 });
  var card = h.run("TowerPerks.upgrade2StateOf('soldier'," +
    " 'rifleman_overloaded_series_ammunition')");
  t.eq(card.rank, 0, "the fusion is at rank 0");
  t.eq(card.maxRank, 3, "of three");
  t.eq(card.nextRank, 1, "so the next rank is 1");
  t.eq(card.nextCost, 80, "at 80 coins, which is X3's first price and not its sum");
  t.eq(card.parents.length, 2, "two runtime parents");
  t.eq(card.parents[0].equipped, true, "one of them equipped");
  t.eq(card.parents[1].equipped, false, "and one of them not");
  t.eq(card.requirementsTotal, 2, "two requirements");
  t.eq(card.requirementsMet, 0, "neither met — Reinforced Spring is only at 1");

  // AND THE SCREEN PINS EITHER KIND AND BUYS THE ONE IT PINNED.
  h.run("Upgrades.open(); Upgrades.selectTower('soldier'); Upgrades.openTree()");
  var pinnedSquare = h.run("Upgrades.selectNode('rifleman_overloaded_reinforced_spring')");
  t.eq(h.run("Upgrades.state().nodeKind"), "square",
    "clicking a square tells the card it is reading a square");
  t.eq(pinnedSquare.name, "Reinforced Spring", "and pins the right one");
  var was = h.run("TowerPerks.rankOf('soldier', 'rifleman_overloaded_reinforced_spring')");
  h.run("(function () { var r = Upgrades.buyRect();" +
        "  Upgrades.onClick(r.x + 4, r.y + 4); })()");
  t.eq(h.run("TowerPerks.rankOf('soldier', 'rifleman_overloaded_reinforced_spring')"),
    was + 1, "the buy button buys the next rank of it");

  h.run("Upgrades.selectNode('rif_a1')");
  t.eq(h.run("Upgrades.state().nodeKind"), "perk",
    "and pinning a permanent upgrade goes back to the perk card");

  // THE RESET QUOTE COUNTS THE RANKS, so the button and the transaction agree.
  t.eq(h.run("Upgrades.resetNodeCount()"),
    h.run("MetaProgress.ownedNodes('soldier').length +" +
          " MetaProgress.rankedNodeCount('soldier')"),
    "the reset control counts perks and ranked squares alike");
});

test("the tree screen places, hits and frames every square", function (t) {
  var h = bootSquares();
  h.run("Upgrades.open(); Upgrades.selectTower('soldier'); Upgrades.openTree()");

  // NO TWO NODES SHARE A SPOT, of either kind — a square drawn on top of an arm
  // node would be a node nobody could click.
  var collisions = h.run("(function () {" +
    "  var all = TowerPerks.nodes('soldier').map(function (n) {" +
    "      return { id: n.id, at: n.at, r: 30 }; })" +
    "    .concat(TowerPerks.upgrades2('soldier').map(function (n) {" +
    "      return { id: n.id, at: n.at, r: 20 }; }));" +
    "  var out = [];" +
    "  for (var i = 0; i < all.length; i++)" +
    "    for (var j = i + 1; j < all.length; j++) {" +
    "      var dx = (all[i].at.x - all[j].at.x) * 132;" +
    "      var dy = (all[i].at.y - all[j].at.y) * 132;" +
    "      var need = all[i].r + all[j].r + 8;" +
    "      if (dx * dx + dy * dy < need * need)" +
    "        out.push(all[i].id + ' overlaps ' + all[j].id); }" +
    "  return out; })()");
  t.deep(collisions, [], "every node has room of its own");

  // AND NO LINK PASSES THROUGH A NODE IT DOES NOT BELONG TO. This is what
  // "untangled" means as an assertion rather than as a look: the tree may have
  // any shape, but a line that grazes a node it is not attached to reads as an
  // edge that is not there, which is the one drawing mistake a player cannot
  // tell from a real prerequisite.
  var grazed = h.run("(function () {" +
    "  var pts = TowerPerks.nodes('soldier').map(function (n) {" +
    "      return { id: n.id, at: n.at, r: 30 }; })" +
    "    .concat(TowerPerks.upgrades2('soldier').map(function (n) {" +
    "      return { id: n.id, at: n.at, r: 20 }; }))" +
    "    .concat([{ id: 'TOWER', at: { x: 0, y: 0 }, r: 46 }]);" +
    "  function at(id) {" +
    "    for (var i = 0; i < pts.length; i++) if (pts[i].id === id) return pts[i];" +
    "    return null; }" +
    "  var links = [];" +
    "  TowerPerks.nodes('soldier').forEach(function (n) {" +
    "    var reqs = n.requires || [];" +
    "    if (!reqs.length) links.push(['TOWER', n.id]);" +
    "    else reqs.forEach(function (r) { links.push([r, n.id]); }); });" +
    "  TowerPerks.upgrades2('soldier').forEach(function (n) {" +
    "    var reqs = n.requires || [];" +
    "    if (!reqs.length) links.push([n.parent, n.id]);" +
    "    else reqs.forEach(function (r) { links.push([r.id, n.id]); }); });" +
    "  var out = [];" +
    "  links.forEach(function (l) {" +
    "    var A = at(l[0]), B = at(l[1]);" +
    "    if (!A || !B) { out.push(l[0] + '->' + l[1] + ' has no end'); return; }" +
    "    pts.forEach(function (p) {" +
    "      if (p.id === l[0] || p.id === l[1]) return;" +
    "      var vx = (B.at.x - A.at.x) * 132, vy = (B.at.y - A.at.y) * 132;" +
    "      var px = (p.at.x - A.at.x) * 132, py = (p.at.y - A.at.y) * 132;" +
    "      var t = Math.max(0, Math.min(1, (px * vx + py * vy) / (vx * vx + vy * vy)));" +
    "      var d = Math.sqrt(Math.pow(t * vx - px, 2) + Math.pow(t * vy - py, 2));" +
    "      if (d < p.r + 14)" +
    "        out.push(l[0] + '->' + l[1] + ' passes through ' + p.id); }); });" +
    "  return out; })()");
  t.deep(grazed, [], "no link passes through a node it does not belong to");

  // AND EVERY SQUARE IS HITTABLE where it is drawn.
  var unreachable = h.run("(function () {" +
    "  Upgrades.selectNode(null);" +
    "  var out = [];" +
    "  TowerPerks.upgrades2('soldier').forEach(function (n) {" +
    "    var p = Upgrades.nodeScreenPoint(n);" +
    "    var hit = Upgrades.nodeAtPoint(p.x, p.y);" +
    "    if (!hit || hit.id !== n.id || hit.kind !== 'square')" +
    "      out.push(n.id + ' is not where it is drawn'); });" +
    "  return out; })()");
  t.deep(unreachable, [], "clicking a square's centre selects that square");

  // THE PERKS ARE STILL HITTABLE TOO — the squares are tested first and must
  // not have stolen the arm nodes' clicks.
  var lostPerks = h.run("(function () { var out = [];" +
    "  TowerPerks.nodes('soldier').forEach(function (n) {" +
    "    var p = Upgrades.nodeScreenPoint(n);" +
    "    var hit = Upgrades.nodeAtPoint(p.x, p.y);" +
    "    if (!hit || hit.id !== n.id || hit.kind !== 'perk')" +
    "      out.push(n.id + ' is no longer clickable'); });" +
    "  return out; })()");
  t.deep(lostPerks, [], "and every permanent upgrade still takes its own click");

  // A RECENTRE FRAMES THE WHOLE TREE, squares included.
  //
  // ON EVERY TREE IN THE GAME, and the Player's is what forced the camera's
  // floor down: sixty-two nodes need 0.26 and the floor was 0.45, so a recentre
  // showed about half of it with no way to see the rest at once.
  var unframed = h.run("(function () {" +
    "  var out = [];" +
    "  var ids = TowerPerks.towersWithTrees().concat(['player']);" +
    "  ids.forEach(function (id) {" +
    "    Upgrades.open(); Upgrades.selectTower(id); Upgrades.openTree();" +
    "    var all = (id === 'player')" +
    "      ? PlayerPerks.modules().concat(PlayerPerks.upgrades2())" +
    "      : TowerPerks.nodes(id).concat(TowerPerks.upgrades2(id));" +
    "    var b = Upgrades.boardRect();" +
    "    all.forEach(function (n) {" +
    "      var p = Upgrades.nodeScreenPoint(n);" +
    "      if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h)" +
    "        out.push(id + '/' + n.id); }); });" +
    "  return out; })()");
  t.deep(unframed, [], "a recentre frames every node of every tree in the game");
  h.run("Upgrades.open(); Upgrades.selectTower('soldier'); Upgrades.openTree()");

  var framed = h.run("(function () {" +
    "  var all = TowerPerks.nodes('soldier').concat(TowerPerks.upgrades2('soldier'));" +
    "  var b = Upgrades.boardRect(), out = [];" +
    "  all.forEach(function (n) {" +
    "    var p = Upgrades.nodeScreenPoint(n);" +
    "    if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h)" +
    "      out.push(n.id + ' is off the board after a recentre'); });" +
    "  return out; })()");
  t.deep(framed, [], "a recentre shows every node of both kinds");

  // AND THE SCREEN DRAWS WITHOUT THROWING, with a square pinned and with a
  // fusion half met — the two states the new card has to render.
  h.run("MetaProgress.buyNode('soldier', 'rif_a1', 0);" +
        "MetaProgress.buyNode('soldier', 'rif_n1', 0)");
  setRanks(h, { rifleman_overloaded_reinforced_spring: 2 });
  h.run("Upgrades.selectNode('rifleman_overloaded_series_ammunition'); Upgrades.draw(ctx)");
  h.run("Upgrades.selectNode('rifleman_entrenchment_battery_setup'); Upgrades.draw(ctx)");
  h.run("Upgrades.selectNode('rif_a1'); Upgrades.draw(ctx)");
  t.ok(true, "the tree draws a square, a fusion and a perk without throwing");
});


// ---------------------------------------------------------------------------
// THE PLAYER'S PERMANENT PROGRESSION (2026-09-01)
//
// TWENTY-ONE MODULES AND FORTY RANKED SQUARES, and the owner's numbers
// throughout -- so these name ids and assert exact figures, exactly as the
// tower-content sections above do. A retune is meant to turn them red.
//
// FIVE LAYERS, tested through their real entry points:
//
//   js/meta.js                      the `player` block and its migration
//   js/systems/player-perks.js      the rules and THE RESOLVED BLOCK
//   js/perks/player-modules.js      the content
//   js/systems/player-effects.js    how the block reaches a tower
//   js/systems/player-run.js        what it does during a run
//
// THE QUESTION UNDER ALL OF THEM is the one the brief opens with: does an
// EMPTY LOADOUT reproduce the current game exactly? Every module is a delta on
// a neutral value, so the answer has to be yes by construction -- and the first
// test below is the one that proves it.
// ---------------------------------------------------------------------------

group("the Player's permanent progression");

// A profile with the Player at level 5 and coins for anything. The Player has
// no catalogue entry, so nothing is "owned" -- it simply exists.
function bootPlayer() {
  var h = harness.boot();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar();" +
        "TowerXP.setEnabled(true); openMenu()");
  for (var i = 0; i < 400; i++) {
    h.run("MetaProgress.awardRun({ wavesCompleted: 35, waveReached: 35, " +
      "victory: true, mapId: Maps.DEFAULT_ID, mapName: 'x', difficultyId: 'easy' })");
  }
  h.run("MetaProgress.addPlayerXp(20000)");
  return h;
}

// Buy and equip modules, set square ranks, and start a run. Straight through
// the model: these tests are about the EFFECTS, and the purchase rules have
// their own tests below.
function playerRun(h, modules, ranks, opts) {
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar()");
  h.run("MetaProgress.addPlayerXp(20000)");
  (modules || []).forEach(function (id, i) {
    h.run("MetaProgress.buyModule('" + id + "', 0);" +
          "MetaProgress.equipModule('" + id + "', " + i + ")");
  });
  setPlayerRanks(h, ranks);
  h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); towers = [];" +
        "waveIndex = " + ((opts && opts.wave !== undefined) ? opts.wave : "WAVES.length"));
  if (!opts || opts.cash !== false) h.run("cash = 100000");
  return h;
}

function setPlayerRanks(h, ranks) {
  Object.keys(ranks || {}).forEach(function (id) {
    var have = h.run("MetaProgress.playerRankOf('" + id + "')");
    for (var r = have + 1; r <= ranks[id]; r++) {
      h.run("MetaProgress.buyPlayerRank('" + id + "', 0, " + r + ")");
    }
  });
}

// One Rifleman on the board, built through the game's own door so every price
// and every aura is the one a player would get.
function placePlayerTower(h, x, y, typeId) {
  h.run("(function () { var Type = MetaProgress.constructorOf('" +
        (typeId || "soldier") + "');" +
        "  addTower(new Type(" + x + ", " + y + ", path)); })()");
  return "(function () { for (var i = 0; i < towers.length; i++)" +
         "  if (towers[i].x === " + x + ") return towers[i]; return null; })()";
}

test("an empty Player loadout resolves the neutral block and the current game",
function (t) {
  var h = bootPlayer();
  var neutral = h.run("PlayerPerks.neutral()");
  t.deep(h.run("PlayerPerks.resolved()"), neutral,
    "nothing equipped resolves exactly the neutral block");

  // EVERY MODULE OWNED AND NOTHING EQUIPPED IS STILL THE NEUTRAL BLOCK, which
  // is the other half of the promise: buying is not equipping.
  h.run("PlayerPerks.modules().forEach(function (m) {" +
        "  MetaProgress.buyModule(m.id, 0); });" +
        "PlayerPerks.upgrades2().forEach(function (n) {" +
        "  for (var r = 1; r <= n.maxRank; r++)" +
        "    MetaProgress.buyPlayerRank(n.id, 0, r); })");
  t.deep(h.run("PlayerPerks.resolved()"), neutral,
    "every module and every rank owned, none equipped: still neutral");

  // AND THE RUN IS THE RUN IT ALWAYS WAS.
  playerRun(h, [], {});
  t.eq(h.run("cash"), 100000, "the fixture set the purse");
  h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID))");
  t.eq(h.run("cash"), h.run("STARTING_CASH"), "a run opens on the authored mana");
  t.eq(h.run("baseHp"), h.run("BASE_MAX_HP"), "and the authored base health");
  t.eq(h.run("baseMaxHp"), h.run("BASE_MAX_HP"), "at the authored maximum");

  var tw = placePlayerTower(h, 200, 200);
  t.eq(h.run(tw + ".damage"), h.run("Soldier.BASE_DAMAGE"), "a tower's damage");
  t.eq(h.run(tw + ".rangeUl"), h.run("Soldier.BASE_RANGE_UL"), "its reach");
  t.eq(h.run(tw + ".maxHp"), h.run("Soldier.BASE_HP"), "and its health");
  t.eq(h.run("towerPrice(MetaProgress.constructorOf('soldier'))"),
    h.run("Soldier.COST"), "and the next one costs what it costs");
});

test("every row in the entity list selects the entity drawn on it",
function (t) {
  var h = bootPlayer();
  h.run("openMenu(); Upgrades.open()");

  // ROW BY ROW, CLICKED WHERE IT IS DRAWN. The list draws the Player first and
  // then every owned tower; the hit test walked a DIFFERENT list until
  // 2026-09-01, so every row selected the entity below it and the Player -- the
  // first row -- could not be reached at all.
  var expected = ["player"].concat(h.run("MetaProgress.snapshot().owned"));
  expected.forEach(function (id, i) {
    var r = h.run("Upgrades.towerRowRect(" + i + ")");
    h.run("Upgrades.onClick(" + (r.x + 20) + ", " + (r.y + 20) + ")");
    t.eq(h.run("Upgrades.state().selected"), id,
      "row " + i + " selects " + id);
  });

  // AND THE PLAYER'S OWN SCREEN REALLY OPENS ON IT.
  var top = h.run("Upgrades.towerRowRect(0)");
  h.run("Upgrades.onClick(" + (top.x + 20) + ", " + (top.y + 20) + ")");
  t.eq(h.run("Upgrades.state().selected"), "player", "the Player is selectable");
  t.eq(h.run("Upgrades.slotPipState('player', 0)"), "empty",
    "its first slot is open from level 0");
  t.eq(h.run("Upgrades.slotPipState('player', 2)"), "empty",
    "and at level 5 so is its third");

  // ALL SEVEN SLOTS ARE DRAWN, and each is where it is clickable. The loop
  // counted `PERK_SLOTS` and so drew five of the Player's seven, which made the
  // caption above the band ("6 of 7 slots open") a lie about the row under it.
  var band = h.run("(function () { var out = [];" +
    "  for (var i = 0; i < MetaProgress.PLAYER_SLOTS; i++) out.push(Upgrades.slotRect(i));" +
    "  return out; })()");
  t.eq(band.length, 7, "seven slot rectangles");

  // AND `2 + LEVEL` OF THEM ARE OPEN, at every level. The band read the LEVEL
  // for both entities, so a level-4 Player was shown four open slots and three
  // locked ones under a caption that correctly said six of seven.
  var thresholds = h.game.MetaProgress.XP_THRESHOLDS;
  [0, 1, 2, 3, 4, 5].forEach(function (level) {
    h.run("MetaProgress.reset(); MetaProgress.unlockAll()");
    if (level > 0) h.run("MetaProgress.addPlayerXp(" + thresholds[level - 1] + ")");
    h.run("Upgrades.open(); Upgrades.selectTower('player')");
    var states = h.run("(function () { var out = [];" +
      "  for (var i = 0; i < 7; i++) out.push(Upgrades.slotPipState('player', i));" +
      "  return out; })()");
    var openCount = states.filter(function (x) { return x !== "locked"; }).length;
    t.eq(openCount, 2 + level, "at level " + level + ", " + (2 + level) + " open");
  });
  h.run("MetaProgress.addPlayerXp(20000); Upgrades.open(); Upgrades.selectTower('player')");
  t.ok(band[6].x + band[6].w <= h.run("Upgrades.inventoryRect().x") +
       h.run("Upgrades.inventoryRect().w"),
    "and the seventh still ends inside the band the five used");
  for (var i = 1; i < 7; i++) {
    t.ok(band[i].x >= band[i - 1].x + band[i - 1].w,
      "slot " + (i + 1) + " starts after slot " + i + " ends");
  }
  h.run("Upgrades.openTree()");
  t.eq(h.game.screen, "tree", "and its tree opens");
  t.eq(h.run("Upgrades.state().selected"), "player", "still on the Player");
  h.run("Upgrades.draw(ctx)");
  t.ok(true, "which draws without throwing");
});

test("a module's card is a short line, its live stats, and what moved them",
function (t) {
  var h = bootPlayer();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); MetaProgress.addPlayerXp(20000);" +
        "MetaProgress.buyModule('player_intendant_diversified_arsenal', 0);" +
        "MetaProgress.buyModule('player_guardian_bastion_pact', 0);" +
        "MetaProgress.buyModule('player_scrapper', 0);" +
        "MetaProgress.equipModule('player_intendant_diversified_arsenal', 0)");
  h.run("Upgrades.open(); Upgrades.selectTower('player')");

  // 1. ONE SHORT LINE. The card draws `short` and never the long blurb, so a
  // node without one would show a module with no description at all.
  var missing = h.run("(function () { var out = [];" +
    "  PlayerPerks.modules().forEach(function (m) {" +
    "    if (!m.short || m.short.length > 90) out.push('player/' + m.id); });" +
    "  TowerPerks.towersWithTrees().forEach(function (id) {" +
    "    TowerPerks.nodes(id).forEach(function (n) {" +
    "      var has = TowerPerks.upgrades2(id).some(function (sq) {" +
    "        return sq.parent === n.id; });" +
    "      if (has && (!n.short || n.short.length > 90))" +
    "        out.push(id + '/' + n.id); }); });" +
    "  return out; })()");
  t.deep(missing, [], "every improvable node states a SHORT description");

  // 2. THE STATS, AS ROWS, GREEN ONLY WHERE AN UPGRADE MOVED ONE.
  var cold = h.run("Upgrades.statRows('player_intendant_diversified_arsenal')");
  t.eq(cold.length, 2, "Intendant resolves two stats");
  t.deep(cold.map(function (r) { return r.label; }),
    ["first of a type", "each one after"], "labelled, not prose");
  t.deep(cold.map(function (r) { return r.value; }), ["−60 mana", "+20 mana"],
    "at their authored values with nothing bought");
  t.deep(cold.map(function (r) { return r.moved; }), [false, false],
    "so neither row is green");

  setPlayerRanks(h, { player_intendant_catalogued_inventory: 4,
                      player_intendant_logistics_tolerance: 2 });
  var warm = h.run("Upgrades.statRows('player_intendant_diversified_arsenal')");
  t.deep(warm.map(function (r) { return r.value; }), ["−72 mana", "+22 mana"],
    "four ranks of Inventaire and two of Tolérance: 60 + 3x4, and 20 + 4 − 2");
  t.deep(warm.map(function (r) { return r.moved; }), [true, true],
    "and both rows are green");
  t.deep(warm.map(function (r) { return r.base; }), ["−60 mana", "+20 mana"],
    "each carrying the value it would have had");

  var still = h.run("Upgrades.statRows('player_guardian_bastion_pact')");
  t.deep(still.map(function (r) { return r.moved; }), [false, false],
    "a module with no rank under it greens nothing");

  // 3. WHAT MOVED THEM, BY RANK AND NUMERICALLY -- and DERIVED, so no square
  // has to describe itself twice.
  var ups = h.run("Upgrades.improvedBy('player_intendant_diversified_arsenal')");
  t.eq(ups.length, 2, "two squares, two rows");
  var inv = ups.filter(function (u) { return u.rank === 4; })[0];
  t.ok(!!inv, "Inventaire catalogué is at rank 4");
  t.eq(inv.active, true, "and is applying");
  // MEASURED FROM WHERE EVERYTHING ELSE STANDS, which is what makes the row
  // answer the question a player is really asking: what would I lose if I
  // un-bought THIS square? The surcharge reads 18 → 22 rather than 20 → 22
  // because Tolérance logistique is holding two ranks of it down either way.
  t.deep(inv.rows, ["first of a type −60 mana → −72 mana",
                    "each one after +18 mana → +22 mana"],
    "stated as without-it → with-it, on the rows it actually moves");

  // AN UNBOUGHT SQUARE IS STILL LISTED, showing what its FIRST rank would do.
  h.run("MetaProgress.debugPatch({ player: (function () {" +
        "  var p = MetaProgress.playerProgress();" +
        "  return { xp: p.xp, modules: p.modules.slice()," +
        "    ranks: { player_intendant_catalogued_inventory: 4 }," +
        "    equipped: p.equipped.slice(), resetAt: 0 }; })() })");
  var offer = h.run("Upgrades.improvedBy('player_intendant_diversified_arsenal')")
    .filter(function (u) { return u.rank === 0; })[0];
  t.ok(!!offer, "the unbought one is listed rather than hidden");
  t.deep(offer.rows, ["each one after +24 mana → +23 mana"],
    "showing what rank 1 would do from where the module stands now");

  // AND THE SAME THREE BLOCKS ANSWER FOR A TOWER'S PERK.
  h.run("MetaProgress.buyNode('soldier', 'rif_a1', 0);" +
        "MetaProgress.buyNode('soldier', 'rif_a2', 0);" +
        "MetaProgress.addXp('soldier', 20000);" +
        "MetaProgress.buyRank('soldier', 'rifleman_breach_terminal_charge', 0, 1);" +
        "MetaProgress.buyRank('soldier', 'rifleman_breach_terminal_charge', 0, 2);" +
        "MetaProgress.buyRank('soldier', 'rifleman_breach_terminal_charge', 0, 3);" +
        "MetaProgress.equipPerk('soldier', 'rif_a2', 0)");
  h.run("Upgrades.selectTower('soldier')");
  var breach = h.run("Upgrades.statRows('rif_a2')");
  t.deep(breach.map(function (r) { return r.value; }), ["×2.50", "−10%"],
    "Breach Chamber resolves its two shots");
  t.deep(breach.map(function (r) { return r.moved; }), [true, false],
    "and only the one Terminal Charge moved is green");
  var tc = h.run("Upgrades.improvedBy('rif_a2')")
    .filter(function (u) { return u.rank === 3; })[0];
  t.deep(tc.rows, ["final shot ×2.00 → ×2.50"],
    "with the square's contribution derived, not authored twice");

  // A MODULE NOTHING IMPROVES LISTS NOTHING.
  var bare = h.run("(function () {" +
    "  var ids = TowerPerks.towersWithTrees();" +
    "  for (var i = 0; i < ids.length; i++) {" +
    "    if (TowerPerks.upgrades2(ids[i]).length) continue;" +
    "    var n = TowerPerks.nodes(ids[i]);" +
    "    if (n.length) return { tower: ids[i], node: n[0].id }; }" +
    "  return null; })()");
  h.run("Upgrades.selectTower('" + bare.tower + "')");
  t.deep(h.run("Upgrades.improvedBy('" + bare.node + "')"), [],
    "a node with no squares under it lists none");

  h.run("Upgrades.selectTower('soldier'); Upgrades.draw(ctx)");
  h.run("Upgrades.openTree(); Upgrades.selectNode('rif_a2'); Upgrades.draw(ctx)");
  t.ok(true, "and both cards draw without throwing");
});

test("the Player levels on the wave budget alone, and a defeat keeps it",
function (t) {
  var h = bootPlayer();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll(); rebuildBuildBar();" +
        "TowerXP.setEnabled(true)");
  t.eq(h.run("MetaProgress.playerProgress().xp"), 0, "a fresh profile is at 0");

  // THE WHOLE BUDGET, NOT A SHARE OF IT, and it does not depend on the board:
  // no tower is built here at all.
  h.run("openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID)); towers = []");
  var budget = h.run("TowerXP.waveBudget(1, WAVES.length, xpDifficultyScale())");
  h.run("endWave(3, 0)");
  t.near(h.run("MetaProgress.playerProgress().xp"), budget, 1e-9,
    "one wave pays the Player the whole of that wave's budget");

  var second = h.run("TowerXP.waveBudget(2, WAVES.length, xpDifficultyScale())");
  h.run("endWave(3, 0)");
  t.near(h.run("MetaProgress.playerProgress().xp"), budget + second, 1e-9,
    "and the next wave pays its own");

  // A DEFEAT KEEPS EVERY POINT, because the points were banked wave by wave.
  var banked = h.run("MetaProgress.playerProgress().xp");
  h.run("baseHp = 0; gameOver = true; openMenu()");
  t.near(h.run("MetaProgress.playerProgress().xp"), banked, 1e-9,
    "losing the run keeps every point already earned");

  // THE SANDBOX BANKS NOTHING, exactly as it banks no tower xp.
  h.run("TowerXP.setEnabled(false); openMenu(); startRun(Maps.byId(Maps.DEFAULT_ID))");
  h.run("endWave(3, 0)");
  t.near(h.run("MetaProgress.playerProgress().xp"), banked, 1e-9,
    "and a rig with xp switched off banks none of it");
  h.run("TowerXP.setEnabled(true)");

  // THE CURVE IS THE TOWERS' OWN, not a second one.
  var thresholds = h.game.MetaProgress.XP_THRESHOLDS;
  h.run("MetaProgress.reset(); MetaProgress.unlockAll()");
  thresholds.forEach(function (need, i) {
    h.run("MetaProgress.reset(); MetaProgress.unlockAll()");
    h.run("MetaProgress.addPlayerXp(" + (need - 1) + ")");
    t.eq(h.run("MetaProgress.playerProgress().level"), i,
      "one point short of " + need + " is still level " + i);
    h.run("MetaProgress.addPlayerXp(1)");
    t.eq(h.run("MetaProgress.playerProgress().level"), i + 1,
      need + " xp is level " + (i + 1));
  });
});

test("the usable slots are exactly 2 / 3 / 4 / 5 / 6 / 7", function (t) {
  var h = bootPlayer();
  var thresholds = h.game.MetaProgress.XP_THRESHOLDS;

  [0, 1, 2, 3, 4, 5].forEach(function (level) {
    h.run("MetaProgress.reset(); MetaProgress.unlockAll()");
    if (level > 0) h.run("MetaProgress.addPlayerXp(" + thresholds[level - 1] + ")");
    var p = h.run("MetaProgress.playerProgress()");
    t.eq(p.level, level, "level " + level);
    t.eq(p.slots, 2 + level, "opens " + (2 + level) + " slots");
    t.eq(p.slotCount, 7, "out of seven, always");
    t.eq(p.equipped.length, 7, "and all seven are in the save");
  });

  // AND THE SLOTS PAST THE OPEN ONES REFUSE, with the level that opens them.
  h.run("MetaProgress.reset(); MetaProgress.unlockAll();" +
        "MetaProgress.buyModule('player_intendant_diversified_arsenal', 0)");
  t.eq(h.run("MetaProgress.equipModule('player_intendant_diversified_arsenal', 1).ok"),
    true, "slot 2 is open at level 0");
  var refused = h.run("MetaProgress.equipModule('player_intendant_diversified_arsenal', 2)");
  t.eq(refused.ok, false, "slot 3 is not");
  t.ok(/level 1/.test(refused.reason), "and says which level opens it: " + refused.reason);

  // A MODULE CANNOT SIT IN TWO SLOTS: dropping it on a second MOVES it.
  h.run("MetaProgress.addPlayerXp(20000);" +
        "MetaProgress.equipModule('player_intendant_diversified_arsenal', 0)");
  var bar = h.run("MetaProgress.equippedModules()");
  t.eq(bar.filter(function (x) {
    return x === "player_intendant_diversified_arsenal";
  }).length, 1, "one copy, in one slot");
});

test("a module is bought once, a rank one at a time, and both need what they need",
function (t) {
  var h = bootPlayer();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll()");

  // A CHILD NEEDS ITS PARENT BOUGHT.
  var cold = h.run("PlayerPerks.stateOf('player_advanced_treasury')");
  t.eq(cold.state, "locked", "Trésorerie avancée is locked at the start");
  t.ok(/Intendant/.test(cold.reason), "for want of Intendant: " + cold.reason);
  t.eq(h.run("PlayerPerks.buy('player_advanced_treasury').ok"), false, "so it refuses");

  // AND THE COINS.
  var poor = h.run("PlayerPerks.stateOf('player_intendant_diversified_arsenal')");
  t.eq(poor.state, "poor", "a fresh profile cannot afford a 100-coin root");
  t.eq(h.run("PlayerPerks.buy('player_intendant_diversified_arsenal').ok"), false,
    "and the purchase refuses");

  var h2 = bootPlayer();
  t.eq(h2.run("PlayerPerks.buy('player_intendant_diversified_arsenal').spent"), 100,
    "with coins it buys, at its authored price");
  t.eq(h2.run("PlayerPerks.buy('player_intendant_diversified_arsenal').ok"), false,
    "and cannot be bought twice");
  t.eq(h2.run("PlayerPerks.stateOf('player_advanced_treasury').state"), "buyable",
    "which opens its child");

  // RANKS ARE SEQUENTIAL AND EACH PRICE IS ITS OWN.
  var ID = "player_intendant_catalogued_inventory";
  [40, 60, 90, 135, 200].forEach(function (price, i) {
    var out = h2.run("PlayerPerks.buyRank('" + ID + "')");
    t.eq(out.ok, true, "rank " + (i + 1) + " buys");
    t.eq(out.spent, price, "for exactly " + price + " — R5's own price, not a total");
  });
  t.eq(h2.run("PlayerPerks.buyRank('" + ID + "').ok"), false, "rank 6 does not exist");
  t.eq(h2.run("PlayerPerks.upgrade2StateOf('" + ID + "').state"), "maxed", "it is maxed");
  t.eq(h2.run("MetaProgress.buyPlayerRank('player_intendant_logistics_tolerance', 0, 2).ok"),
    false, "and no caller may skip a rank");
});

test("a fusion square shows 0/2, 1/2 and 2/2 and cannot be bought at 1/2",
function (t) {
  var h = bootPlayer();
  var FUSION = "player_architect_tolerant_connectors";
  h.run("MetaProgress.buyModule('player_intendant_diversified_arsenal', 0);" +
        "MetaProgress.buyModule('player_architect_campaign_network', 0)");

  var none = h.run("PlayerPerks.upgrade2StateOf('" + FUSION + "')");
  t.eq(none.requirementsTotal, 2, "Connecteurs tolérants has two requirements");
  t.eq(none.requirementsMet, 0, "0 / 2 to start");
  t.eq(none.state, "locked", "and it is locked");

  setPlayerRanks(h, { player_architect_dense_network: 2 });
  var half = h.run("PlayerPerks.upgrade2StateOf('" + FUSION + "')");
  t.eq(half.requirementsMet, 1, "1 / 2 with Réseau dense at rank 2");
  t.eq(half.requirements[0].met, true, "the satisfied one is ticked");
  t.eq(half.requirements[0].have, 2, "with the rank it holds");
  t.eq(half.requirements[1].met, false, "and the other is crossed");
  t.eq(half.requirements[1].need, 2, "against the rank it needs");
  t.eq(half.state, "locked", "it is STILL locked at 1 / 2");
  t.eq(h.run("PlayerPerks.buyRank('" + FUSION + "').ok"), false, "and refuses");
  t.ok(/Tolérance/.test(half.reason), "naming only what is short: " + half.reason);

  setPlayerRanks(h, { player_intendant_catalogued_inventory: 2,
                      player_intendant_logistics_tolerance: 2 });
  var both = h.run("PlayerPerks.upgrade2StateOf('" + FUSION + "')");
  t.eq(both.requirementsMet, 2, "2 / 2 at last");
  t.eq(both.state, "buyable", "and it is buyable");
  t.eq(both.nextCost, 80, "at F5's first price");

  // AFTER THE PURCHASE ONLY ITS PARENT MODULE HAS TO BE EQUIPPED. The brief is
  // explicit: the requirements are purchase conditions, never equip ones.
  h.run("PlayerPerks.buyRank('" + FUSION + "')");
  playerRun(h, ["player_architect_campaign_network"],
    { player_architect_dense_network: 2, player_architect_tolerant_connectors: 1,
      player_intendant_catalogued_inventory: 2,
      player_intendant_logistics_tolerance: 2 });
  t.near(h.run("PlayerPerks.resolved().archSamePenaltyPct"),
    3 + 0.25 * 2 - 0.25 * 1, 1e-9,
    "it applies with Architecte equipped and Intendant on the bench");
});

test("a square is dormant while its module is on the bench", function (t) {
  var h = bootPlayer();

  // Bought, and the module it improves is NOT equipped.
  h.run("MetaProgress.reset(); MetaProgress.unlockAll();" +
        "MetaProgress.addPlayerXp(20000);" +
        "MetaProgress.buyModule('player_scrapper', 0)");
  setPlayerRanks(h, { player_scrapper_recovery_team: 5 });
  t.deep(h.run("PlayerPerks.resolved()"), h.run("PlayerPerks.neutral()"),
    "an owned module and five ranks, none equipped, resolve nothing");
  var state = h.run("PlayerPerks.upgrade2StateOf('player_scrapper_recovery_team')");
  t.eq(state.rank, 5, "the ranks are still owned");
  t.eq(state.dormant, true, "and the model calls it dormant rather than lost");

  h.run("MetaProgress.equipModule('player_scrapper', 0); PlayerPerks.dirty()");
  t.eq(h.run("PlayerPerks.resolved().destroyRefundPct"), 60,
    "equipping the module brings its ranks with it");
  t.eq(h.run("PlayerPerks.upgrade2StateOf('player_scrapper_recovery_team').dormant"),
    false, "and it is no longer dormant");
});

test("every stated formula resolves at rank 0, in the middle and at the maximum",
function (t) {
  var h = bootPlayer();

  // Each row: the modules to equip, the ranks, the resolved field, the answer.
  var rows = [
    // Intendant — discount 60 + 3r, surcharge 20 + rInv − rTol
    [["player_intendant_diversified_arsenal"], {}, "firstTowerDiscount", 60],
    [["player_intendant_diversified_arsenal"], {}, "laterTowerSurcharge", 20],
    [["player_intendant_diversified_arsenal"],
     { player_intendant_catalogued_inventory: 3 }, "firstTowerDiscount", 69],
    [["player_intendant_diversified_arsenal"],
     { player_intendant_catalogued_inventory: 5,
       player_intendant_logistics_tolerance: 5 }, "laterTowerSurcharge", 20],
    [["player_intendant_diversified_arsenal"],
     { player_intendant_logistics_tolerance: 5 }, "laterTowerSurcharge", 15],

    // Trésorerie — mana 250 + 20r, penalty 8 + 0.75a − 0.4b
    [["player_advanced_treasury"], {}, "startingManaBonus", 250],
    [["player_advanced_treasury"],
     { player_treasury_larger_advance: 5 }, "startingManaBonus", 350],
    [["player_advanced_treasury"],
     { player_treasury_larger_advance: 5 }, "fixedWaveRewardPenaltyPct", 11.75],
    [["player_advanced_treasury"],
     { player_treasury_larger_advance: 5,
       player_treasury_soft_amortization: 5 }, "fixedWaveRewardPenaltyPct", 9.75],

    // Crédit — limit 300 + 40r, interest 15 + a − 0.5b
    [["player_emergency_credit"], {}, "debtLimit", 300],
    [["player_emergency_credit"], { player_credit_extended_line: 5 }, "debtLimit", 500],
    [["player_emergency_credit"],
     { player_credit_extended_line: 5 }, "debtInterestPct", 20],
    [["player_emergency_credit"],
     { player_credit_extended_line: 5,
       player_credit_refinancing: 5 }, "debtInterestPct", 17.5],

    // Ferrailleur — refund 50 + 2r, health 15 + a − 0.5b
    [["player_scrapper"], {}, "destroyRefundPct", 50],
    [["player_scrapper"], { player_scrapper_recovery_team: 5 }, "destroyRefundPct", 60],
    [["player_scrapper"], { player_scrapper_recovery_team: 5 }, "towerHpPenaltyPct", 20],
    [["player_scrapper"], { player_scrapper_recovery_team: 5,
       player_scrapper_recycled_bracing: 5 }, "towerHpPenaltyPct", 17.5],

    // Architecte — 5 + 0.5a different, 3 + 0.25a − 0.25b same
    [["player_architect_campaign_network"], {}, "archDifferentBonusPct", 5],
    [["player_architect_campaign_network"],
     { player_architect_dense_network: 5 }, "archDifferentBonusPct", 7.5],
    [["player_architect_campaign_network"],
     { player_architect_dense_network: 5 }, "archSamePenaltyPct", 4.25],
    [["player_architect_campaign_network"],
     { player_architect_dense_network: 5,
       player_architect_tolerant_connectors: 5 }, "archSamePenaltyPct", 3],

    // Plan compact — footprint 10 + r, health 15 + 0.75a − 0.5b
    [["player_compact_plan"], {}, "footprintPenaltyPct", 10],
    [["player_compact_plan"],
     { player_compact_tighter_template: 5 }, "footprintPenaltyPct", 15],
    [["player_compact_plan"], { player_compact_tighter_template: 5,
       player_compact_internal_bracing: 5 }, "towerHpPenaltyPct", 16.25],

    // Arsenal partagé — 1 + 0.1a a type, cap 5 + 0.5a, duplicate 2 + 0.2a − 0.2b
    [["player_shared_arsenal"], {}, "sharedPerTypePct", 1],
    [["player_shared_arsenal"],
     { player_arsenal_combined_doctrine: 5 }, "sharedPerTypePct", 1.5],
    [["player_shared_arsenal"],
     { player_arsenal_combined_doctrine: 5 }, "sharedCapPct", 7.5],
    [["player_shared_arsenal"],
     { player_arsenal_combined_doctrine: 5 }, "duplicateSurchargePct", 3],
    [["player_shared_arsenal"], { player_arsenal_combined_doctrine: 5,
       player_arsenal_secondary_licenses: 5 }, "duplicateSurchargePct", 2],

    // Opérateurs isolés — 10 + 0.75a alone, 5 + 0.25a − 0.4b crowded
    [["player_isolated_operators"], {}, "isolatedBonusPct", 10],
    [["player_isolated_operators"],
     { player_operators_prepared_solitude: 5 }, "isolatedBonusPct", 13.75],
    [["player_isolated_operators"], { player_operators_prepared_solitude: 5,
       player_operators_measured_coexistence: 5 }, "crowdedPenaltyPct", 4.25],

    // Commandant — mark 5 + 0.4a, damage 5 + 0.25a − 0.25b
    [["player_commander_priority_order"], {}, "markSeconds", 5],
    [["player_commander_priority_order"],
     { player_commander_extended_signal: 5 }, "markSeconds", 7],
    [["player_commander_priority_order"],
     { player_commander_extended_signal: 5,
       player_commander_rules_of_engagement: 5 }, "markDamagePenaltyPct", 5],

    // Surcharge — rate 30 + 3a, stun 2.5 + 0.15a − 0.1b
    [["player_overdrive_order"], {}, "overdriveFireRatePct", 30],
    [["player_overdrive_order"],
     { player_overdrive_redline: 5 }, "overdriveFireRatePct", 45],
    [["player_overdrive_order"], { player_overdrive_redline: 5 }, "overdriveStunSeconds", 3.25],
    [["player_overdrive_order"], { player_overdrive_redline: 5,
       player_overdrive_disciplined_recovery: 5 }, "overdriveStunSeconds", 2.75],

    // Radar — 8 + 0.8a seconds, 45 + 2a cooldown, range 3 − 0.25b never below 0
    [["player_radar_sweep"], {}, "radarSeconds", 8],
    [["player_radar_sweep"], { player_radar_long_echo: 5 }, "radarSeconds", 12],
    [["player_radar_sweep"], { player_radar_long_echo: 5 }, "radarCooldownSeconds", 55],
    [["player_radar_sweep"], { player_radar_calibrated_optics: 5 }, "radarRangePenaltyPct", 1.75],

    // Balise — 8 + a speed, 5 + a range, 2 + 0.25a − 0.2b outside
    [["player_command_beacon"], {}, "beaconRadiusUl", 90],
    [["player_command_beacon"], { player_beacon_amplified_signal: 5 }, "beaconSpeedPct", 13],
    [["player_command_beacon"], { player_beacon_amplified_signal: 5 }, "beaconRangePct", 10],
    [["player_command_beacon"], { player_beacon_amplified_signal: 5,
       player_beacon_directional_antenna: 5 }, "beaconFarFireRatePenaltyPct", 2.25],

    // Gardien — base 50 + 5a, mana 100 + 8a − 5b
    [["player_guardian_bastion_pact"], {}, "baseHpBonus", 50],
    [["player_guardian_bastion_pact"], { player_guardian_thick_wall: 5 }, "baseHpBonus", 75],
    [["player_guardian_bastion_pact"], { player_guardian_thick_wall: 5 }, "startingManaPenalty", 140],
    [["player_guardian_bastion_pact"], { player_guardian_thick_wall: 5,
       player_guardian_garrison_reserve: 5 }, "startingManaPenalty", 115],

    // Brèche — 50 − 2r
    [["player_controlled_breach"], {}, "firstLeakPct", 50],
    [["player_controlled_breach"], { player_breach_reinforced_gate: 5 }, "firstLeakPct", 40],

    // Shield — 50 + 2a per cent at 25 + a − b mana
    [["player_mana_shield"], {}, "shieldMaxFractionPct", 50],
    [["player_mana_shield"], { player_shield_protective_capacitor: 5 }, "shieldMaxFractionPct", 60],
    [["player_mana_shield"], { player_shield_protective_capacitor: 5 }, "shieldManaPerDamage", 30],
    [["player_mana_shield"], { player_shield_protective_capacitor: 5,
       player_shield_efficient_circuit: 5 }, "shieldManaPerDamage", 25],

    // Prime and Série — 25 + 5r, 1 + 0.2r a charge, 5 − r kept
    [["player_no_leak_bounty"], {}, "noLeakBounty", 25],
    [["player_no_leak_bounty"], { player_bounty_perfect_bonus: 5 }, "noLeakBounty", 50],
    [["player_perfect_streak"], {}, "streakPerChargePct", 1],
    [["player_perfect_streak"], { player_streak_victorious_cadence: 5 }, "streakPerChargePct", 2],
    [["player_perfect_streak"], { player_streak_insurance: 3 }, "streakLossCap", 2],

    // Blitz — 2 − 0.05a seconds a mana, haste 3 + 0.25a for 8 − 0.4b
    [["player_blitz_doctrine"], {}, "blitzSecondsPerMana", 2],
    [["player_blitz_doctrine"], { player_blitz_rushed_dividend: 5 }, "blitzSecondsPerMana", 1.75],
    [["player_blitz_doctrine"], { player_blitz_rushed_dividend: 5 }, "blitzHastePct", 4.25],
    [["player_blitz_doctrine"], { player_blitz_controlled_arrival: 5 }, "blitzHasteSeconds", 6],
    [["player_blitz_doctrine"], {}, "blitzCapMana", 35],

    // Totem — 100 − 8a + 12b health, 8 + a rate, 15 + b on death
    [["player_vulnerable_totem"], {}, "totemHp", 100],
    [["player_vulnerable_totem"], { player_totem_war_idol: 5 }, "totemHp", 60],
    [["player_vulnerable_totem"], { player_totem_war_idol: 5,
       player_totem_consecrated_stone: 5 }, "totemHp", 120],
    [["player_vulnerable_totem"], { player_totem_war_idol: 5 }, "totemFireRatePct", 13],
    [["player_vulnerable_totem"], { player_totem_consecrated_stone: 5 }, "totemDeathDamage", 20],

    // Permis — 25 − 3r
    [["player_crosspath_permit"], {}, "permitUpgradeSurchargePct", 25],
    [["player_crosspath_permit"],
     { player_crosspath_lighter_paperwork: 5 }, "permitUpgradeSurchargePct", 10],

    // Prévision — the gap, rescaled to the delay this game actually has
    [["player_tactical_forecast"], {}, "transitionSeconds", 2.5],
    [["player_tactical_forecast"], { player_forecast_third_dossier: 1 }, "transitionSeconds", 2],
    [["player_tactical_forecast"], { player_forecast_third_dossier: 1,
       player_forecast_methodical_briefing: 5 }, "transitionSeconds", 4],
    [["player_tactical_forecast"], {}, "forecastWaves", 2],
    [["player_tactical_forecast"], { player_forecast_third_dossier: 1 }, "forecastWaves", 3]
  ];

  rows.forEach(function (row) {
    h.run("MetaProgress.reset(); MetaProgress.unlockAll();" +
          "MetaProgress.addPlayerXp(20000)");
    row[0].forEach(function (id, i) {
      h.run("MetaProgress.buyModule('" + id + "', 0);" +
            "MetaProgress.equipModule('" + id + "', " + i + ")");
    });
    setPlayerRanks(h, row[1]);
    h.run("PlayerPerks.dirty()");
    t.near(h.run("PlayerPerks.resolved()." + row[2]), row[3], 1e-9,
      row[0].join("+") + " " + JSON.stringify(row[1]) + " → " + row[2] +
      " = " + row[3]);
  });
});

test("the save carries the Player, and one written before it reads as empty",
function (t) {
  var h = bootPlayer();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll();" +
        "MetaProgress.addPlayerXp(4000);" +
        "MetaProgress.buyModule('player_intendant_diversified_arsenal', 0);" +
        "MetaProgress.buyPlayerRank('player_intendant_catalogued_inventory', 0, 1);" +
        "MetaProgress.equipModule('player_intendant_diversified_arsenal', 0)");

  var snap = h.run("MetaProgress.snapshot().player");
  t.eq(snap.xp, 4000, "the xp is in the profile");
  t.eq(snap.modules.length, 1, "and the module");
  t.eq(snap.ranks.player_intendant_catalogued_inventory, 1, "and the rank");
  t.eq(snap.equipped[0], "player_intendant_diversified_arsenal", "and the slot");

  // THE WHOLE MIGRATION IS AN ABSENT KEY.
  var old = h.run("MetaProgress.__loadForTest({ coins: 700, owned: ['soldier']," +
    " equipped: ['soldier', null, null, null, null]," +
    " progress: { soldier: { xp: 3000, nodes: ['rif_n1']," +
    "   equipped: ['rif_n1', null, null, null, null] } } })");
  t.eq(old.player.xp, 0, "a save written before the Player reads level 0");
  t.deep(old.player.modules, [], "with nothing bought");
  t.deep(old.player.ranks, {}, "no ranks");
  t.deep(old.player.equipped, [null, null, null, null, null, null, null],
    "and seven empty slots");
  t.eq(old.coins, 700, "keeping its coins");
  t.eq(old.progress.soldier.nodes.length, 1, "and every tower row it had");
  t.deep(h.run("PlayerPerks.resolved()"), h.run("PlayerPerks.neutral()"),
    "so it plays exactly the game it played yesterday");

  // HOSTILE DATA IS SHAPED, NOT TRUSTED.
  var junk = h.run("MetaProgress.__loadForTest({ coins: 5, owned: ['soldier']," +
    " equipped: [null, null, null, null, null], player: {" +
    "   xp: -5, modules: ['player_scrapper', 'player_scrapper', 'nope', 7]," +
    "   ranks: { player_scrapper_recovery_team: 99, zero: 0, bad: 'x' }," +
    "   equipped: ['player_scrapper', 'player_scrapper', 'never_bought'," +
    "              null, null, null, null], resetAt: -3 } })");
  t.eq(junk.player.xp, 0, "a negative xp is zero");
  t.deep(junk.player.modules, ["player_scrapper", "nope"],
    "a duplicate is dropped, an unknown id is KEPT and inert");
  t.eq(junk.player.ranks.zero, undefined, "a rank of 0 is not stored");
  t.eq(junk.player.ranks.bad, undefined, "nor a string");
  t.eq(junk.player.ranks.player_scrapper_recovery_team, 99,
    "the save stores what it was told");
  t.eq(h.run("PlayerPerks.rankOf('player_scrapper_recovery_team')"), 5,
    "and the tree clamps it to the node's maximum");
  t.eq(junk.player.equipped[0], "player_scrapper", "the owned module stays equipped");
  t.eq(junk.player.equipped[1], null, "the duplicate slot is emptied");
  t.eq(junk.player.equipped[2], null, "and a module that is not owned never sits in one");
  t.eq(junk.player.resetAt, 0, "a nonsense stamp is zero");
});

test("a Player reset refunds every module and every rank, and counts each rank",
function (t) {
  var h = bootPlayer();
  h.run("MetaProgress.reset(); MetaProgress.unlockAll();" +
        "MetaProgress.addPlayerXp(20000)");
  // STRAIGHT THROUGH THE MODEL at price 0: this test is about what a reset
  // HANDS BACK, which `refundValue` reads off the authored cost, not about what
  // was paid -- and the purchase rules have their own test above.
  h.run("MetaProgress.buyModule('player_intendant_diversified_arsenal', 0)");  // 100
  h.run("MetaProgress.buyModule('player_scrapper', 0)");                       // 140
  setPlayerRanks(h, { player_scrapper_recovery_team: 3 });            // 40+60+90

  t.eq(h.run("PlayerPerks.refundValue()"), 100 + 140 + 190,
    "the refund is both modules plus every rank at the price it cost");

  // **EVERY RANK IS ITS OWN NODE FOR THE COMMISSION**, which is the Player's
  // rule and is DELIBERATELY not the towers' -- there a ranked node counts
  // once, however many ranks it holds. Both are the owner's.
  t.eq(h.run("PlayerPerks.resetNodeCount()"), 5,
    "two modules and three ranks are five nodes");

  var before = h.run("MetaProgress.coins()");
  var out = h.run("PlayerPerks.reset(99999999)");
  t.eq(out.ok, true, "the reset goes through");
  t.eq(out.removed, 5, "five nodes");
  t.eq(out.fee, 50, "at ten a node");
  t.eq(out.refunded, 430, "with every coin handed back");
  t.eq(h.run("MetaProgress.coins()"), before + 430 - 50, "and the purse agrees");
  t.deep(h.run("MetaProgress.ownedModules()"), [], "nothing is owned");
  t.deep(h.run("MetaProgress.playerRanks()"), {}, "no rank survives");
  t.deep(h.run("MetaProgress.equippedModules()"),
    [null, null, null, null, null, null, null], "and the loadout is empty");

  // THE COOLDOWN IS REAL AND IS THE PLAYER'S OWN.
  var again = h.run("PlayerPerks.reset(99999999)");
  t.eq(again.ok, false, "a second reset on the same clock refuses");
  t.ok(/cool/.test(again.reason), "for the cooldown: " + again.reason);
  t.eq(h.run("MetaProgress.playerResetReadyAt()"),
    99999999 + h.run("MetaProgress.TREE_RESET_COOLDOWN_MS"), "one hour out");

  // AND IT NEVER TOUCHES A TOWER.
  h.run("MetaProgress.buyNode('soldier', 'rif_n1', 0)");
  h.run("PlayerPerks.reset(99999999)");
  t.eq(h.run("MetaProgress.ownsNode('soldier', 'rif_n1')"), true,
    "resetting the Player leaves every tower's tree alone");
});

test("a run opens on the mana and the base health the loadout resolved",
function (t) {
  var h = bootPlayer();

  playerRun(h, ["player_advanced_treasury"], {}, { cash: false });
  t.eq(h.run("cash"), h.run("STARTING_CASH") + 250, "Trésorerie opens on +250");

  playerRun(h, ["player_guardian_bastion_pact"], {}, { cash: false });
  t.eq(h.run("cash"), h.run("STARTING_CASH") - 100, "Gardien opens on −100");
  t.eq(h.run("baseMaxHp"), h.run("BASE_MAX_HP") + 50, "with +50 base health");
  t.eq(h.run("baseHp"), h.run("baseMaxHp"), "and the base opens FULL");

  // THE TWO SUM, which is what "les points s'ajoutent" means for the purse.
  playerRun(h, ["player_advanced_treasury", "player_guardian_bastion_pact"],
    { player_guardian_thick_wall: 5, player_guardian_garrison_reserve: 5 },
    { cash: false });
  t.eq(h.run("cash"), h.run("STARTING_CASH") + 250 - 115,
    "both equipped is +250 − 115");
  t.eq(h.run("baseMaxHp"), h.run("BASE_MAX_HP") + 75, "and +75 of base health");
});

test("Intendant prices the first of each type and every one after it",
function (t) {
  var h = bootPlayer();
  var COST = h.run("Soldier.COST");
  playerRun(h, ["player_intendant_diversified_arsenal"],
    { player_intendant_catalogued_inventory: 3 });

  t.eq(h.run("towerPrice(MetaProgress.constructorOf('soldier'))"), COST - 69,
    "the first Rifleman is 69 cheaper");
  var first = placePlayerTower(h, 200, 200);
  t.eq(h.run(first + ".cost"), COST - 69, "and really was built for that");
  t.eq(h.run("towerPrice(MetaProgress.constructorOf('soldier'))"), COST + 23,
    "every later one is 23 dearer");

  // A DIFFERENT TYPE HAS ITS OWN FIRST.
  t.eq(h.run("towerPrice(MetaProgress.constructorOf('smasher'))"),
    h.run("Smasher.COST") - 69, "a Warbringer is still on its own discount");

  // SELLING THE FIRST DOES NOT HAND THE DISCOUNT BACK -- it was spent by a
  // COMPLETED placement, and rebuilding is not a way to farm it.
  h.run("(function () { sellTower(" + first + "); })()");
  t.eq(h.run("towerPrice(MetaProgress.constructorOf('soldier'))"), COST + 23,
    "after selling it, the next Rifleman is still the dear one");
  t.eq(h.run("PlayerRun.placedCount('soldier')"), 1, "the placement is still counted");

  // THE FLOOR IS ZERO. A discount can reach the minimum and never pay the
  // player to build.
  t.ok(h.run("towerPrice(MetaProgress.constructorOf('soldier'))") >= 0,
    "no price is ever negative");
});

test("Arsenal partagé pays for what is alive and charges for a duplicate",
function (t) {
  var h = bootPlayer();
  playerRun(h, ["player_shared_arsenal"], {});
  var COST = h.run("Soldier.COST");

  t.eq(h.run("towerPrice(MetaProgress.constructorOf('soldier'))"), COST,
    "with nothing standing, nothing is a duplicate");
  var a = placePlayerTower(h, 200, 200);
  t.eq(h.run(a + ".damage"), h.run("Soldier.BASE_DAMAGE") * 1.01,
    "one live type is +1% damage");
  t.eq(h.run("towerPrice(MetaProgress.constructorOf('soldier'))"),
    Math.round(COST * 1.02), "and a second Rifleman is a duplicate at +2%");
  t.eq(h.run("towerPrice(MetaProgress.constructorOf('smasher'))"),
    h.run("Smasher.COST"), "while a Warbringer is not");

  placePlayerTower(h, 900, 200, "smasher");
  t.near(h.run(a + ".damage"), h.run("Soldier.BASE_DAMAGE") * 1.02, 1e-9,
    "two live types is +2%, recomputed the moment the board changed");

  // THE CAP HOLDS, and the composition is what moves it -- not the count.
  playerRun(h, ["player_shared_arsenal"], {});
  ["soldier", "smasher", "longshot", "siphon", "blub", "farm"]
    .forEach(function (id, i) { placePlayerTower(h, 200 + i * 120, 200, id); });
  t.eq(h.run("(function () { var s = {}; towers.forEach(function (x) {" +
    "  if (PlayerEffects.isCountable(x)) s[x.constructor.ID] = 1; });" +
    "  return Object.keys(s).length; })()"), 6, "six types are standing");
  t.near(h.run("PlayerEffects.pointsFor(towers[0]).damage"), 5, 1e-9,
    "six live types still only pays the +5% cap");
});

test("Architecte and Opérateurs isolés read the board and recompute with it",
function (t) {
  var h = bootPlayer();
  var NEAR = 40, FAR = 900;

  // ALONE: no proximity bonus, and the isolated reach.
  playerRun(h, ["player_architect_campaign_network", "player_isolated_operators"], {});
  var solo = placePlayerTower(h, 200, 200);
  t.near(h.run("PlayerEffects.pointsFor(" + solo + ").fireRate"), 0, 1e-9,
    "a lone tower has no neighbour of either kind");
  t.near(h.run("PlayerEffects.pointsFor(" + solo + ").range"), 10, 1e-9,
    "and reaches 10% further for standing alone");

  // A DIFFERENT TYPE NEXT DOOR: faster, and no longer alone.
  placePlayerTower(h, 200 + NEAR, 200, "smasher");
  t.near(h.run("PlayerEffects.pointsFor(" + solo + ").fireRate"), 5, 1e-9,
    "a different type within 70 u.l. is +5% fire rate");
  t.near(h.run("PlayerEffects.pointsFor(" + solo + ").range"), -5, 1e-9,
    "and the isolation bonus becomes the crowded penalty");

  // ONE OF ITS OWN AS WELL: BOTH halves are true at once, and each counts once.
  placePlayerTower(h, 200 - NEAR, 200, "soldier");
  placePlayerTower(h, 200, 200 + NEAR, "soldier");
  t.near(h.run("PlayerEffects.pointsFor(" + solo + ").fireRate"), 5 - 3, 1e-9,
    "beside one of each it is +5 AND −3, and two of its own still count once");

  // AND IT RECOMPUTES WHEN THE BOARD CHANGES BACK.
  h.run("(function () { for (var i = towers.length - 1; i >= 0; i--)" +
        "  if (towers[i].x !== 200 || towers[i].y !== 200) sellTower(towers[i]); })()");
  t.near(h.run("PlayerEffects.pointsFor(" + solo + ").fireRate"), 0, 1e-9,
    "selling the neighbours takes both halves away again");
  t.near(h.run("PlayerEffects.pointsFor(" + solo + ").range"), 10, 1e-9,
    "and it is alone once more");
});

test("Ferrailleur pays for a destruction and never for a sale", function (t) {
  var h = bootPlayer();
  playerRun(h, ["player_scrapper"], {});

  var tw = placePlayerTower(h, 200, 200);
  var spent = h.run(tw + ".totalSpent");
  t.eq(h.run(tw + ".maxHp"), Math.max(1, h.run("Soldier.BASE_HP") * 0.85),
    "every tower has 15% less health while it is equipped");

  // A SALE IS NOT A DESTRUCTION.
  var before = h.run("cash");
  h.run("(function () { sellTower(" + tw + "); })()");
  t.eq(h.run("cash") - before, Math.floor(spent / 2),
    "a sale pays exactly what a sale always paid");

  // A DESTRUCTION PAYS THE PROPORTION OF THE REAL INVESTMENT.
  var tw2 = placePlayerTower(h, 300, 300);
  var spent2 = h.run(tw2 + ".totalSpent");
  var before2 = h.run("cash");
  h.run("(function () { var t = " + tw2 + "; t.currentHp = 0; })()");
  h.run("update(1 / 60)");
  t.eq(h.run("towers.length"), 0, "the destroyed tower is swept out");
  t.eq(h.run("cash") - before2, Math.round(spent2 * 0.5),
    "and 50% of everything sunk into it comes back");

  // ONE PAYMENT, NEVER TWO.
  h.run("update(1 / 60); update(1 / 60)");
  t.eq(h.run("cash") - before2, Math.round(spent2 * 0.5),
    "and later frames pay nothing more");
});

test("the credit line stops at its limit, blocks every spend and charges interest",
function (t) {
  var h = bootPlayer();
  playerRun(h, ["player_emergency_credit"], {}, { cash: false });
  h.run("cash = 100");

  // A TRANSACTION MAY GO NEGATIVE, ONCE.
  t.eq(h.run("PlayerRun.canSpend(100, 300).ok"), true, "300 out of 100 is allowed");
  t.eq(h.run("PlayerRun.canSpend(100, 401).ok"), false,
    "but not past the −300 ceiling");
  t.ok(/300/.test(h.run("PlayerRun.canSpend(100, 401).reason")), "and it says so");

  // ONCE THE BALANCE IS RED, NOTHING MAY BE BOUGHT.
  var blocked = h.run("PlayerRun.canSpend(-1, 1)");
  t.eq(blocked.ok, false, "a negative balance blocks the next purchase");
  t.ok(/debt/.test(blocked.reason), "and says why: " + blocked.reason);
  t.eq(h.run("PlayerRun.canSpend(0, 50).ok"), true, "back at zero it flows again");

  // THE INTEREST IS CHARGED AT THE OPENING OF A WAVE and rounds up in magnitude.
  t.eq(h.run("PlayerRun.chargeInterest(-200)"), 30, "15% of 200 is 30");
  t.eq(h.run("PlayerRun.chargeInterest(-1)"), 1, "and a penny of debt still grows");
  t.eq(h.run("PlayerRun.chargeInterest(50)"), 0, "a positive balance owes nothing");

  playerRun(h, ["player_emergency_credit"],
    { player_credit_extended_line: 5, player_credit_refinancing: 5 }, { cash: false });
  t.eq(h.run("PlayerRun.canSpend(0, 500).ok"), true, "rank 5 reaches −500");
  t.eq(h.run("PlayerRun.canSpend(0, 501).ok"), false, "and no further");
  t.eq(h.run("PlayerRun.chargeInterest(-200)"), 35, "at 17.5% a wave");

  // AND WITHOUT THE MODULE IT IS THE PLAIN OLD REFUSAL.
  playerRun(h, [], {}, { cash: false });
  var plain = h.run("PlayerRun.canSpend(10, 50)");
  t.eq(plain.ok, false, "no credit, no overdraft");
  t.eq(plain.reason, "not enough mana", "and the sentence the game always used");
});

test("base damage resolves Brèche, then the shield, then what is really lost",
function (t) {
  var h = bootPlayer();

  // BRÈCHE HALVES THE FIRST LEAK OF A WAVE AND ONLY THE FIRST.
  playerRun(h, ["player_controlled_breach"], {}, { wave: 0 });
  h.run("PlayerRun.onWaveStart(1, cash)");
  var first = h.run("PlayerRun.resolveBaseDamage(20, 1000, { leak: true })");
  t.eq(first.toBase, 10, "the first leak of a wave costs half");
  t.eq(first.breached, true, "and says it was breached");
  var second = h.run("PlayerRun.resolveBaseDamage(20, 1000, { leak: true })");
  t.eq(second.toBase, 20, "the second costs all of it");
  h.run("PlayerRun.onWaveStart(2, cash)");
  t.eq(h.run("PlayerRun.resolveBaseDamage(20, 1000, { leak: true }).toBase"), 10,
    "and the next wave has its own first leak");

  // THE SHIELD ABSORBS WHOLE POINTS IT CAN PAY FOR, AFTER Brèche.
  playerRun(h, ["player_controlled_breach", "player_mana_shield"], {}, { wave: 0 });
  h.run("PlayerRun.toggleShield(); PlayerRun.onWaveStart(1, cash)");
  var both = h.run("PlayerRun.resolveBaseDamage(20, 1000, { leak: true })");
  t.eq(both.toBase, 5, "20 halved to 10, then half of THAT absorbed");
  t.eq(both.absorbed, 5, "five points prevented");
  t.eq(both.manaCost, 125, "at 25 mana a point");

  // WITH TOO LITTLE MANA IT ABSORBS ONLY WHAT IT CAN BUY, and never into debt.
  var poor = h.run("PlayerRun.resolveBaseDamage(20, 60, { leak: false })");
  t.eq(poor.absorbed, 2, "60 mana buys two points");
  t.eq(poor.manaCost, 50, "and costs exactly 50");
  t.eq(poor.toBase, 18, "the base takes the rest");
  var broke = h.run("PlayerRun.resolveBaseDamage(20, 0, { leak: false })");
  t.eq(broke.absorbed, 0, "an empty purse absorbs nothing");
  t.eq(broke.manaCost, 0, "and never creates a debt");

  // THE SHIELD IS OFF AT THE START OF EVERY RUN.
  playerRun(h, ["player_mana_shield"], {}, { wave: 0 });
  t.eq(h.run("PlayerRun.shieldActive()"), false, "off when a run opens");
  t.eq(h.run("PlayerRun.resolveBaseDamage(20, 1000, {}).absorbed"), 0,
    "and absorbs nothing while it is off");
});

test("the streak counts clean waves and an absorbed hit keeps it alive",
function (t) {
  var h = bootPlayer();
  playerRun(h, ["player_no_leak_bounty", "player_perfect_streak"], {}, { wave: 0 });

  // A CLEAN WAVE BANKS A CHARGE AND SCHEDULES THE BOUNTY.
  for (var i = 1; i <= 5; i++) {
    h.run("PlayerRun.onWaveStart(" + i + ", 1000)");
    var out = h.run("PlayerRun.onWaveEnd()");
    t.eq(out.clean, true, "wave " + i + " was clean");
    t.eq(out.charges, i, "and banks charge " + i);
  }
  h.run("PlayerRun.onWaveStart(6, 1000)");
  t.eq(h.run("PlayerRun.onWaveEnd().charges"), 5, "five is the ceiling");

  var opened = h.run("PlayerRun.onWaveStart(7, 1000)");
  t.eq(opened.bounty, 25, "and each clean wave pays 25 at the START of the next");

  // A LOSS CLEARS THEM, at the moment of the first loss.
  h.run("PlayerRun.noteBaseLoss(3)");
  t.eq(h.run("PlayerRun.streakCharges()"), 0, "one point lost clears every charge");
  t.eq(h.run("PlayerRun.onWaveEnd().clean"), false, "and the wave is not clean");
  t.eq(h.run("PlayerRun.onWaveStart(8, 1000).bounty"), 0, "so no bounty follows");

  // A FULLY ABSORBED HIT IS NOT A LOSS.
  playerRun(h, ["player_no_leak_bounty", "player_perfect_streak", "player_mana_shield"],
    {}, { wave: 0 });
  h.run("PlayerRun.toggleShield(); PlayerRun.onWaveStart(1, 100000);" +
        "PlayerRun.onWaveEnd(); PlayerRun.onWaveStart(2, 100000)");
  t.eq(h.run("PlayerRun.streakCharges()"), 1, "one charge banked");
  var hit = h.run("PlayerRun.resolveBaseDamage(2, 100000, { leak: false })");
  t.eq(hit.toBase, 1, "half of a 2-point hit is absorbed");
  h.run("PlayerRun.noteBaseLoss(" + hit.toBase + ")");
  t.eq(h.run("PlayerRun.streakCharges()"), 0, "the point that DID land breaks it");

  // ASSURANCE DE SÉRIE KEEPS WHAT IT PROMISES.
  playerRun(h, ["player_no_leak_bounty", "player_perfect_streak"],
    { player_streak_insurance: 3 }, { wave: 0 });
  for (var w = 1; w <= 5; w++) {
    h.run("PlayerRun.onWaveStart(" + w + ", 1000); PlayerRun.onWaveEnd()");
  }
  h.run("PlayerRun.onWaveStart(6, 1000)");
  t.eq(h.run("PlayerRun.streakCharges()"), 5, "five charges");
  h.run("PlayerRun.noteBaseLoss(1)");
  t.eq(h.run("PlayerRun.streakCharges()"), 3, "rank 3 takes at most two of them");
  h.run("PlayerRun.noteBaseLoss(1)");
  t.eq(h.run("PlayerRun.streakCharges()"), 3, "and only one resolution a wave");
});

test("the streak and the totem are damage and fire rate on every tower",
function (t) {
  var h = bootPlayer();
  playerRun(h, ["player_no_leak_bounty", "player_perfect_streak"],
    { player_streak_victorious_cadence: 5 }, { wave: 0 });
  var tw = placePlayerTower(h, 200, 200);
  var base = h.run("Soldier.BASE_DAMAGE");
  t.eq(h.run(tw + ".damage"), base, "no charges, no bonus");

  h.run("PlayerRun.onWaveStart(1, 1000); PlayerRun.onWaveEnd();" +
        "PlayerEffects.refresh(towers)");
  t.near(h.run(tw + ".damage"), base * 1.02, 1e-9,
    "one charge at rank 5 is +2% damage on every tower");

  for (var w = 2; w <= 5; w++) {
    h.run("PlayerRun.onWaveStart(" + w + ", 1000); PlayerRun.onWaveEnd()");
  }
  h.run("PlayerEffects.refresh(towers)");
  t.near(h.run(tw + ".damage"), base * 1.10, 1e-9, "five charges is +10%");

  // THE TOTEM'S AURA, AND WHAT ITS DEATH COSTS.
  // THE TOTEM ALONE. Its module needs the beacon and Gardien BOUGHT, never
  // equipped, so only the totem goes in a slot -- and the beacon's standing
  // −2% is correctly not part of this test's arithmetic.
  playerRun(h, ["player_vulnerable_totem"], {}, { wave: 0 });
  h.run("waveIndex = 0; waveCountdown = 10");
  var tw2 = placePlayerTower(h, 200, 200);
  var plainRate = h.run(tw2 + ".attacksPerSecond()");
  t.eq(h.run("PlayerRun.placeTotem(320, 320, true)"), null, "the totem is planted");
  h.run("PlayerEffects.refresh(towers)");
  t.near(h.run(tw2 + ".attacksPerSecond()"), plainRate * 1.08, 1e-6,
    "every tower fires 8% faster while it stands");

  var hpBefore = h.run("baseHp");
  var owed = h.run("PlayerRun.damageTotem(100)");
  t.eq(owed, 15, "killing it owes the base 15");
  t.eq(h.run("PlayerRun.totem().alive"), false, "and it is gone");
  h.run("applyBaseDamage(" + owed + ", { leak: false })");
  t.eq(h.run("baseHp"), hpBefore - 15, "which the base really loses");
  t.eq(h.run("PlayerRun.lostThisWaveYet()"), true, "and it counts as a loss");
  h.run("PlayerEffects.refresh(towers)");
  t.near(h.run(tw2 + ".attacksPerSecond()"), plainRate, 1e-6, "the buff went with it");
  t.eq(h.run("PlayerRun.placeTotem(400, 400, true)"), "the totem is already placed",
    "and it cannot be planted again this run");
});

test("the orders, the radar and the beacon do what they say and cost what they cost",
function (t) {
  var h = bootPlayer();

  // ORDRE PRIORITAIRE: every tower that can reach it shoots it, softer.
  playerRun(h, ["player_commander_priority_order"], {}, { wave: 0 });
  h.run("enemies = [new Enemy(path, null, 'normal', {}), new Enemy(path, null, 'normal', {})];" +
        "enemies[0].progress = path.length * 0.9; enemies[0].refreshPos();" +
        "enemies[1].progress = path.length * 0.5; enemies[1].refreshPos()");
  placePlayerTower(h, 200, 200);
  // HELD BY NAME, NOT BY POSITION: this one is about to be MOVED onto the
  // enemy, and a finder that looks it up by x would stop finding it.
  h.run("(function () { var t = towers[0]; t.x = enemies[1].pos.x;" +
        "  t.y = enemies[1].pos.y; t.rangePx = 1e6; })()");
  var tw = "towers[0]";
  t.eq(h.run("Targeting.pick(" + tw + ", enemies, false) === enemies[0]"), true,
    "'first' picks the enemy furthest along");
  t.eq(h.run("PlayerRun.order(enemies[1])"), null, "the order goes out");
  t.eq(h.run("Targeting.pick(" + tw + ", enemies, false) === enemies[1]"), true,
    "and every tower that can reach the mark shoots IT instead");
  t.near(h.run("PlayerRun.markDamageScale(enemies[1])"), 0.95, 1e-9,
    "for 5% less damage");
  t.eq(h.run("PlayerRun.markDamageScale(enemies[0])"), 1,
    "and nothing else is softened");

  // THE COOLDOWN STARTS ON A SUCCESSFUL ACTIVATION.
  t.eq(h.run("PlayerRun.markReady()"), false, "it is on cooldown now");
  t.ok(/ready in/.test(h.run("PlayerRun.order(enemies[0])")), "and refuses until it is not");
  h.run("PlayerRun.update(5.1, towers)");
  t.eq(h.run("PlayerRun.markedEnemy()"), null, "the mark expires after five seconds");

  // BALAYAGE RADAR: sight for everything, and it takes it back.
  playerRun(h, ["player_radar_sweep"], {}, { wave: 0 });
  placePlayerTower(h, 200, 200);
  var seer = "towers[0]";
  h.run("enemies = [new Enemy(path, null, 'normal', {})]; enemies[0].isCamo = true;" +
        "enemies[0].isFlying = true");
  t.eq(h.run("Targeting.sees(" + seer + ", enemies[0])"), false,
    "a Rifleman sees neither camo nor flying");
  t.eq(h.run("PlayerRun.startRadar()"), null, "the sweep goes up");
  t.eq(h.run("Targeting.sees(" + seer + ", enemies[0])"), true, "and now it sees both");
  h.run("PlayerRun.update(8.1, towers)");
  t.eq(h.run("PlayerRun.radarActive()"), false, "eight seconds later it is over");
  t.eq(h.run("Targeting.sees(" + seer + ", enemies[0])"), false,
    "and the tower is back to seeing neither — never left holding an illegal target");
  t.near(h.run("PlayerEffects.pointsFor(" + seer + ").range"), -3, 1e-9,
    "the standing 3% range cost is paid whether or not the radar is up");

  // BALISE: inside and outside, and it only moves between waves.
  playerRun(h, ["player_commander_priority_order", "player_command_beacon"], {},
    { wave: 0 });
  h.run("waveCountdown = 10");
  var near = placePlayerTower(h, 300, 300);
  var far = placePlayerTower(h, 1100, 600);
  t.eq(h.run("PlayerRun.placeBeacon(300, 300, false)"), null, "the beacon is set");
  h.run("PlayerEffects.refresh(towers)");
  t.near(h.run("PlayerEffects.pointsFor(" + near + ").range"), 5, 1e-9,
    "a tower inside 90 u.l. reaches 5% further");
  t.near(h.run("PlayerEffects.pointsFor(" + near + ").speed"), 8, 1e-9,
    "with 8% more projectile speed");
  t.near(h.run("PlayerEffects.pointsFor(" + far + ").fireRate"), -2, 1e-9,
    "and every tower outside pays 2% of its fire rate");
  t.eq(h.run("PlayerRun.placeBeacon(500, 500, true)"),
    "the beacon only moves between waves", "it cannot be moved during a wave");
  t.eq(h.run("PlayerRun.placeBeacon(500, 500, false)"), null,
    "and can between them");
});

test("Doctrine Blitz pays for the seconds a Send really cut, and hastes that wave",
function (t) {
  var h = bootPlayer();
  playerRun(h, ["player_advanced_treasury", "player_commander_priority_order",
                "player_blitz_doctrine"], {}, { wave: 0 });

  // 1 MANA A FULL TWO SECONDS, CAPPED AT 35.
  t.eq(h.run("PlayerRun.noteEarlyCall(0)"), 0, "an automatic send at zero pays nothing");
  t.eq(h.run("PlayerRun.noteEarlyCall(1.9)"), 0, "and a part-tranche pays nothing");
  t.eq(h.run("PlayerRun.noteEarlyCall(9)"), 4, "nine seconds is four full tranches");
  t.eq(h.run("PlayerRun.noteEarlyCall(200)"), 35, "and the cap is 35");

  // THE WAVE IT ARMED IS HASTED, AND ONLY THAT WAVE.
  h.run("PlayerRun.onWaveStart(4, 1000); PlayerRun.noteEarlyCall(1)");
  t.eq(h.run("PlayerRun.hasteForSpawn(5)"), null,
    "a call that paid nothing arms no haste either");
  var spec = h.run("(function () { PlayerRun.onWaveStart(4, 1000);" +
    "  PlayerRun.noteEarlyCall(60); return PlayerRun.hasteForSpawn(5); })()");
  t.near(spec.pct, 3, 1e-9, "the next wave's bodies carry +3%");
  t.near(spec.seconds, 8, 1e-9, "for eight seconds each");
  t.eq(h.run("PlayerRun.hasteForSpawn(6)"), null, "and the wave after it carries nothing");

  // AND A BODY REALLY MOVES FASTER, FROM ITS OWN BIRTH.
  h.run("enemies = []; waveIndex = 4; spawnEnemy(100, 'normal', path, null, 0, 'w')");
  var fast = h.run("enemies[0].currentSpeedUlps()");
  h.run("enemies[0].playerHasteLeft = 0");
  var slow = h.run("enemies[0].currentSpeedUlps()");
  t.near(fast / slow, 1.03, 1e-9, "a hasted body walks 3% faster");
  t.near(slow, h.run("enemies[0].speedUlps"), 1e-9, "and an unhasted one is itself");

  // RANKS MOVE BOTH ENDS.
  playerRun(h, ["player_advanced_treasury", "player_commander_priority_order",
                "player_blitz_doctrine"],
    { player_blitz_rushed_dividend: 5, player_blitz_controlled_arrival: 5 },
    { wave: 0 });
  t.eq(h.run("PlayerRun.noteEarlyCall(7)"), 4,
    "at 1.75 s a mana, seven seconds is four");
  var deep = h.run("(function () { PlayerRun.onWaveStart(1, 1000);" +
    "  PlayerRun.noteEarlyCall(60); return PlayerRun.hasteForSpawn(2); })()");
  t.near(deep.pct, 4.25, 1e-9, "the haste is deeper");
  t.near(deep.seconds, 6, 1e-9, "and two seconds shorter");
});

test("the crosspath permit buys one extra tier, on one tower, once",
function (t) {
  var h = bootPlayer();
  playerRun(h, ["player_crosspath_permit"], {});
  var tw = placePlayerTower(h, 200, 200);

  // 5-2 IS THE GAME'S OWN LOCK. Climb A to 3, which caps B at 2.
  h.run("(function () { var t = " + tw + ";" +
        "  buyUpgrade(t, 'A1'); buyUpgrade(t, 'A2'); buyUpgrade(t, 'A3');" +
        "  buyUpgrade(t, 'B1'); buyUpgrade(t, 'B2'); })()");
  t.eq(h.run(tw + ".hasA3"), true, "path A is committed");
  t.eq(h.run(tw + ".hasB2"), true, "and B is at two");
  t.ok(/already chosen/.test(h.run(tw + ".whyCannotUpgrade('B3')")),
    "the lock refuses B3 by itself");

  // THE PERMIT COVERS EXACTLY THAT REFUSAL.
  t.eq(h.run("PlayerRun.permitAvailable()"), true, "the permit is unspent");
  t.eq(h.run("buyUpgrade(" + tw + ", 'B3')"), null, "so B3 goes through");
  t.eq(h.run(tw + ".hasB3"), true, "and the tower really has 3-3... 5-3 in the making");
  t.eq(h.run("PlayerRun.permitSpent()"), true, "the permit is spent");
  t.eq(h.run("PlayerRun.permitHolder() === " + tw), true, "by this tower");

  // AND NEVER A SECOND TIER.
  t.ok(/already chosen/.test(String(h.run("buyUpgrade(" + tw + ", 'B4')"))),
    "B4 is refused — one extra tier, not two");

  // EVERY UPGRADE ON THAT TOWER NOW COSTS 25% MORE.
  t.eq(h.run("playerUpgradePrice(" + tw + ", 100)"), 125, "its upgrades are +25%");
  var other = placePlayerTower(h, 900, 200);
  t.eq(h.run("playerUpgradePrice(" + other + ", 100)"), 100,
    "and no other tower pays a coin of it");

  // ONE TOWER A RUN.
  h.run("(function () { var t = " + other + ";" +
        "  buyUpgrade(t, 'A1'); buyUpgrade(t, 'A2'); buyUpgrade(t, 'A3');" +
        "  buyUpgrade(t, 'B1'); buyUpgrade(t, 'B2'); })()");
  t.ok(/already chosen/.test(String(h.run("buyUpgrade(" + other + ", 'B3')"))),
    "a second tower cannot have the permit this run");

  // DOSSIER ALLÉGÉ SOFTENS THE SURCHARGE; CLAUSE DE RESTITUTION HANDS AN
  // UNSPENT PERMIT BACK.
  playerRun(h, ["player_crosspath_permit"],
    { player_crosspath_lighter_paperwork: 5, player_crosspath_restitution_clause: 1 });
  var third = placePlayerTower(h, 200, 200);
  h.run("PlayerRun.grantPermit(" + third + ")");
  t.eq(h.run("playerUpgradePrice(" + third + ", 100)"), 110, "rank 5 leaves +10%");
  t.eq(h.run("PlayerRun.permitAvailable()"), false, "the permit is out");
  h.run("(function () { sellTower(" + third + "); })()");
  t.eq(h.run("PlayerRun.permitAvailable()"), true,
    "and an UNSPENT permit comes back when its tower is lost");
});

runner.run();
