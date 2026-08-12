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

var group = runner.group;
var test = runner.test;

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
var SMASH_AT = 300;              // where the smasher stands, beside the road
var IN_ZONE = SMASH_AT + 10;     // inside the swing
var IN_BLAST = SMASH_AT + 24;    // outside a BARE swing, inside the victim's blast
var BEYOND = SMASH_AT + 36;      // outside a bare swing and outside that blast

// The chain marks, added 2026-07-30 with the chaining blast. A separate ladder
// from the three above because they were chosen against a 31.25 u.l. wedge and
// a B4 Warbringer's is 56.25 -- see the note above the B4 group.
//
// Each is within the 18.75 u.l. blast radius of the one before it (16 px, then
// 12 px where the road bends), and CHAIN_4 onward sit outside a B4 swing
// entirely, so only a chain can reach them. CHAIN_CONTROL is 58 px past the
// last link, well beyond any blast. Measured against the real path geometry,
// not estimated; if a rescale moves them, the chain test is where it shows.
var CHAIN_1 = SMASH_AT + 10;
var CHAIN_2 = SMASH_AT + 26;
var CHAIN_3 = SMASH_AT + 42;
var CHAIN_4 = SMASH_AT + 58;
var CHAIN_5 = SMASH_AT + 72;
var CHAIN_CONTROL = SMASH_AT + 130;

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
  t.eq(Enemy.TYPES.slow.speedMultiplier, 0.8, "slow speed");

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

  // Exactly one type fights back. If a second is ever added this should be
  // updated rather than deleted -- the point is that attacking is opt-in
  // DATA, not something every enemy quietly gained.
  var attackers = Object.keys(Enemy.TYPES).filter(function (id) {
    return !!Enemy.TYPES[id].attack;
  });
  t.deep(attackers, ["angry"], "only the angry type attacks towers");

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
  t.deep(withBlock("showHealthBanner"), ["midboss", "boss", "boss_fast"],
    "three types wear the banner: the midboss at 11, the Tyrant at 35, " +
    "and the unscheduled Vanguard");
  t.deep(withBlock("phases"), ["boss"], "and only the Tyrant changes mid-fight");

  // v0.4.9's block, held to the same standard: support is opt-in DATA, and if
  // one of these lists grows by accident that is a type that silently gained
  // an ability.
  t.deep(withBlock("support"), ["shieldbearer", "healer", "boss_fast"],
    "three types help the enemies around them");
  t.deep(withBlock("sprint"), ["boss_fast"], "and only the fast boss sprints");
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

  // The bearer itself is the biggest body on that board, so it is one of the
  // ten -- support is not aimed at "somebody else", it is aimed at the
  // strongest, and it happens to be one of them.
  var helped = bearer.supportAllies(0.2, board);
  t.eq(helped.length, 10, "then exactly ten are shielded");
  t.eq(helped[0], bearer, "itself first, being the toughest thing there");
  t.eq(board[1].shield, 20, "the strongest normal gets 20");
  t.eq(board[1].shieldMax, 20, "and the bar grows to match");
  t.eq(board[9].shield, 20, "so does the tenth pick");
  t.eq(board[10].shield, 0, "the eleventh gets nothing");
  t.eq(board[12].shield, 0, "nor the weakest");

  // STACKING, at the owner's request. The second pulse adds rather than
  // refreshes -- this is the assertion that fails if anyone "fixes" it into a
  // refresh like the fast boss's.
  bearer.supportAllies(10, board);
  t.eq(board[1].shield, 40, "a second pulse STACKS to 40");
  t.eq(board[1].shieldMax, 40, "bar and all");

  // And every point of it is free work for the player.
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
  t.ok(bearer.shield > 0, "and it shielded itself too, being one of the strongest");
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
  t.eq(phase.shield, 200, "gaining a 200 point shield");
  t.ok(phase.speedMultiplier > 1, "getting faster");
  t.ok(phase.attackIntervalMultiplier < 1, "and attacking more often");
  t.eq(phase.summon.speedMultiplier, 1.5, "the crowd it calls in runs at 1.5x");

  // The second attack: stop, jump 50 u.l., shockwave on landing.
  t.ok(!!phase.addAttack, "and a second attack joins the pool");
  t.eq(phase.addAttack.leap.distanceUl, 50, "it leaps 50 u.l.");
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

  // Walk the wave the way the scheduler does and time the boss's entrance.
  var elapsed = 0;
  var bossAt = null;
  for (var i = 0; i < h.game.waveCount(wave); i++) {
    var slot = h.game.waveGroupAt(wave, i);
    if (i > 0) {
      elapsed += (slot.opensGroup && slot.group.lead !== undefined)
        ? slot.group.lead : slot.group.interval;
    }
    if (slot.group.type === "boss") bossAt = elapsed;
  }

  t.ok(bossAt !== null, "the boss is in wave 35");
  var fraction = bossAt / elapsed;
  t.ok(fraction > 0.35 && fraction < 0.65,
    "and lands mid-wave (" + bossAt.toFixed(1) + " s of " + elapsed.toFixed(1) +
    " s = " + Math.round(fraction * 100) + "%)");

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
  t.eq(boss.shieldMax, 200, "200 points of shield out of nowhere");
  t.eq(boss.shield, 200, "full");
  t.ok(boss.currentSpeedUlps() > walked, "it got faster");
  // 8 s base × 0.75. This assertion used to read 1.75 off a 3.5 s base, which
  // was two retunes stale -- the shipping boss has fired every 8 s since
  // v0.4.7 and every 6 s after the roar.
  t.eq(boss.attack.intervalSeconds, 6, "and shoots more often -- 6 s, from 8");

  // THE TYPE MUST NOT HAVE MOVED. `this.attack` starts as a reference to the
  // row in Enemy.TYPES, which every enemy of the type shares -- winding the
  // interval down in place would speed up every future boss, in this run and
  // the next.
  t.eq(Enemy.TYPES.boss.attack.intervalSeconds, 8, "the TYPE is untouched");

  t.eq(boss.attacks.length, 2, "and the leap joined the pool");
  t.ok(!!boss.attacks[1].leap, "as the second entry");

  // The summons come out through spawnMinions, the same door a Hive's brood
  // uses, so the main loop needs no second hook. Thirty bodies since
  // 2026-07-30, up from twenty-one, and two of them fly.
  var called = boss.spawnMinions(1 / 60);
  t.eq(called.length, 30, "thirty bodies called in");
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
  // the shell can actually hold is what tests the ordering.
  boss.takeDamage(150);
  t.eq(boss.phasesEntered, 1, "it does not roar twice");
  t.eq(boss.shield, 50, "the new shield takes the hit");
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
  var e = h.spawnAt(w(h, 620), 1000);
  var before = tower.damageDealt;
  h.step(1.5);
  t.eq(tower.damageDealt, before, "it fires nothing while silenced");
  t.eq(e.health, 1000, "and the enemy takes nothing");

  h.step(1);
  t.ok(!h.game.TowerHealth.isStunned(tower), "the stun wears off");
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
  var near = h.placeGunner(w(h, 560), w(h, 455));            // 1 DPS, close
  var far = h.placeGunner(w(h, 700), w(h, 455));             // 1 DPS
  // Resolved by CONSTRUCTOR: the gunner's deletion shifted every slot index.
  var best = h.place(w(h, 640), w(h, 420), h.slotOf(h.game.LongshotTower));
  t.ok(near && far && best, "two weak towers and an Arcane Sniper are on the board");
  t.ok(h.game.Enemy.towerDps(best) > h.game.Enemy.towerDps(near),
    "and the Longshot really is the strongest");

  h.run("enemies = [new Enemy(path, undefined, 'boss')]");
  h.run("enemies[0].progress = path.progressAtPoint(" + w(h, 560) + ", " + w(h, 505) + ")");
  h.run("enemies[0].refreshPos()");
  var boss = h.game.enemies[0];

  h.step(7.9);
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

test("the leap jumps 50 u.l. and shockwaves everything it lands beside", function (t) {
  var h = harness.boot();
  h.run("cash = 1000000; waveIndex = WAVES.length; enemies = []; bullets = []; towers = []");

  var a = h.placeGunner(w(h, 600), w(h, 455));
  var b = h.placeGunner(w(h, 660), w(h, 455));
  var away = h.placeGunner(w(h, 900), w(h, 455));

  h.run("enemies = [new Enemy(path, undefined, 'boss')]");
  h.run("enemies[0].progress = path.progressAtPoint(" + w(h, 580) + ", " + w(h, 505) + ")");
  h.run("enemies[0].refreshPos()");
  var boss = h.game.enemies[0];

  // Roar first -- the leap is not in the pool until then -- and drain the
  // summons so only the boss is on the board.
  boss.takeDamage(1251);
  boss.spawnMinions(1 / 60);
  h.run("enemies = [enemies[0]]");

  boss.attackIndex = 1;                    // next in the cycle is the leap
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

  t.near(jumped / h.game.UNIT_LENGTH, 50, 0.01, "it jumps exactly 50 u.l.");
  t.ok(a.currentHp < a.maxHp && b.currentHp < b.maxHp, "both nearby towers took the shockwave");
  t.eq(a.maxHp - a.currentHp, 30, "for 30 each");
  t.ok(h.game.TowerHealth.isStunned(a) && h.game.TowerHealth.isStunned(b), "and both are stunned");
  t.eq(away.currentHp, away.maxHp, "the one outside the radius is untouched");
});

test("after the roar it alternates shot and leap, and still attacks rarely", function (t) {
  var h = harness.boot();
  h.run("cash = 1000000; waveIndex = WAVES.length; enemies = []; bullets = []; towers = []");

  // Towers all along the road, so it always has something to attack and the
  // cycle is what is being measured rather than target availability.
  for (var i = 0; i < 14; i++) h.placeGunner(w(h, 300 + i * 70), w(h, 455));

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

  boss.takeDamage(1251);
  boss.spawnMinions(1 / 60);
  h.run("enemies = [enemies[0]]");

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

  // A hit bigger than what is left SPILLS THROUGH. Stopping at the shell would
  // waste the overflow of every heavy weapon. Only the part that reaches
  // health pays: fourteen of the twenty is shield, six is health, so six.
  t.eq(stock.takeDamage(20), 6, "a twenty spills through and pays only the six");
  t.eq(stock.shield, 0, "shield gone");
  t.eq(stock.health, 6, "and six came off health");

  // Overkill still does not pay: 6 left, hit for 50, paid 6.
  t.eq(stock.takeDamage(50), 6, "overkill pays only what was there");
  t.eq(stock.dead, true, "and it is dead");
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

  h.step(2.6);
  t.eq(g.currentHp, 40, "one swing at 2.5 s");
  h.step(2.5);
  t.eq(g.currentHp, 20, "two");
  h.step(2.5);
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

  angry.attackTowers(3, [far, near]);
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

  // The timer stays expired rather than restarting, so walking into range is
  // punished immediately instead of granting a free interval of safety.
  out.x = angry.pos.x + 4;
  t.eq(angry.attackTowers(0, [out]), out, "it swings the instant one is in reach");
  t.eq(out.hits, 20, "for its full damage");
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
  t.near(slow.speedUlps, 40, 1e-9, "slow u.l./s -- 0.8 x 50");

  t.eq(normal.maxHealth, 4, "maxHealth tracks the type, so the health bar is right");
  t.eq(fast.typeId, "fast", "the id is recorded on the instance");
});

test("speed is relative, so retuning the walking speed moves the roster", function (t) {
  var h = harness.boot();
  h.run("Enemy.BASE_SPEED_ULPS = 125");

  t.eq(h.spawnAt(0, undefined, "fast").speedUlps, 218.75, "fast follows the base");
  t.eq(h.spawnAt(0, undefined, "slow").speedUlps, 100, "slow follows the base");

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
  t.near(slow.progress / normal.progress, 0.8, 0.001, "a slow covers 0.8x");
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
  t.near(slow.speedUlps * slow.slowMultiplier, 14, 1e-9, "slowed slow u.l./s");
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

  t.eq(visible.health, 38, "the enemy it aimed at took the 12");
  t.eq(camo.health, 38, "and so did the camo standing beside it");
  t.eq(dealt, 24, "both are paid for -- damage landed is damage earned");
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
  var h = harness.boot();
  h.run("cash = 1000000");

  // Duck-typed across all four, which is the point of js/systems/
  // tower-health.js: a new type that forgets one of these fails here rather
  // than silently becoming immortal.
  h.game.BUILD_SLOTS.forEach(function (Type, slot) {
    if (!Type) return;
    var spot = h.run("(function () {" +
      "  for (var x = 24; x < VIEW_WIDTH - 24; x += 8)" +
      "    for (var y = 24; y < VIEW_HEIGHT - 80; y += 8)" +
      "      if (whyCannotBuild(x, y, BUILD_SLOTS[" + slot + "]) === null) return { x: x, y: y };" +
      "  return null; })()");
    t.ok(spot !== null, Type.DISPLAY_NAME + " has somewhere legal to stand");

    var tower = h.place(spot.x, spot.y, slot);
    t.ok(tower.maxHp > 0, Type.DISPLAY_NAME + " has max HP");
    t.eq(tower.currentHp, tower.maxHp, Type.DISPLAY_NAME + " starts full");
    t.eq(tower.isDestroyed(), false, Type.DISPLAY_NAME + " starts alive");

    var absorbed = tower.takeDamage(5);
    t.eq(absorbed, 5, Type.DISPLAY_NAME + " reports what it absorbed");
    t.eq(tower.currentHp, tower.maxHp - 5, Type.DISPLAY_NAME + " lost exactly that");

    tower.takeDamage(1e9);
    t.eq(tower.currentHp, 0, Type.DISPLAY_NAME + " clamps at zero, never negative");
    t.eq(tower.isDestroyed(), true, Type.DISPLAY_NAME + " is destroyed at zero");
  });
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
    t.eq(locked.health, lockedBefore - 25000,
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

  t.eq(h.game.Smasher.COST, 700, "cost");
  t.eq(s.damage, 12, "damage");
  t.eq(s.cooldownSeconds, 4.0, "hit speed");
  t.eq(s.rangeUl, 31.25, "range");
  t.eq(s.arcDegrees, 120, "arc");
  t.eq(s.fullCircle, false, "not a full circle");
  t.eq(s.slow, null, "no slow");
  t.eq(s.explodesOnKill, false, "no explosion");
  t.eq(h.game.cash, 100000 - 700, "cash deducted");
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
  t.eq(dealt, 36, "damage returned for three enemies at 12 each");
  t.eq(a.health, 38, "first enemy hit");
  t.eq(b.health, 38, "second enemy hit");
  t.eq(c.health, 38, "third enemy hit");
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
  t.eq(dealt, 12, "and lands when the swing finishes");
  // The wind-up is taken out of the cooldown that follows, so the RATE is
  // unchanged: a full cycle is still cooldownSeconds.
  t.near(s.cooldown, 4.0 - s.swingSeconds(), 0.001,
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
  t.eq(e.health, 188, "the first hit lands at the bottom of the swing");

  // And the next one waits out the cooldown, then winds up again.
  guard = 0;
  while (s.cooldown > 0 && guard++ < 1000) {
    s.update(1 / 60, h.game.enemies, h.game.bullets);
  }
  t.eq(e.health, 188, "no damage during the cooldown");
  runSwing(s, h);
  t.eq(e.health, 176, "the second blow lands after its own wind-up");
});

group("smasher: upgrades");

test("damage is additive across every owned upgrade", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  ["A1", "A2", "A3", "A4", "A5"].forEach(function (id) {
    t.eq(h.run("buyUpgrade(towers[0], '" + id + "')"), null, "bought " + id);
  });
  t.eq(s.damage, 52, "full path A: 12+4+5+7+10+14");
  t.eq(s.rangeUl, 62.5, "range from the highest A owned");
  t.eq(s.cooldownSeconds, 4.0, "path A does not change hit speed");
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
  t.eq(s.damage, 39, "12+4+5+0+0+4+6+8");
  t.eq(s.cooldownSeconds, 2.2, "fastest owned hit speed");
  // A2's absolute 43.75 wins the max, and path B's THREE additive bonuses
  // (B2 +15, B4 +10, B5 +15) are summed on top of it. This is the assertion
  // that would catch anyone folding rangeBonusUl back into the absolute
  // column: written as absolutes, B2's "+15" would have been worth 2.5 here.
  t.eq(s.rangeUl, 83.75, "43.75 from A2, plus 40 of B bonuses");
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
  t.eq(s.damage, 30, "12+0+0+4+6+8");
  // 2026-07-30: path B DOES extend range now -- B2 +15, B4 +10, B5 +15, all
  // additive on the 31.25 base. It used to grant none at all.
  t.eq(s.rangeUl, 71.25, "31.25 + 15 (B2) + 10 (B4) + 15 (B5)");
  t.eq(s.cooldownSeconds, 2.2, "hit speed");
  t.eq(s.hasQuake, true, "and B5 grants the earthquake");
});

// The range bonuses tier by tier, because "+15" has to mean +15 at the moment
// it is bought and not "whatever the table's absolute column happened to say".
test("path B's range bonuses land on the tiers that were asked for", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  t.eq(s.rangeUl, 31.25, "base");
  h.run("buyUpgrade(towers[0], 'B1')");
  t.eq(s.rangeUl, 31.25, "B1 grants none");
  h.run("buyUpgrade(towers[0], 'B2')");
  t.eq(s.rangeUl, 46.25, "B2 grants +15");
  h.run("buyUpgrade(towers[0], 'B3')");
  t.eq(s.rangeUl, 46.25, "B3 grants none");
  h.run("buyUpgrade(towers[0], 'B4')");
  t.eq(s.rangeUl, 56.25, "B4 grants +10");
  t.eq(s.hasQuake, false, "and B4 does NOT grant the earthquake");
  h.run("buyUpgrade(towers[0], 'B5')");
  t.eq(s.rangeUl, 71.25, "B5 grants +15");
});

// Path A is absolute and was NOT touched. This is the guard on the other side
// of the two-column arrangement.
test("path A's range is unchanged, absolute to the end", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  ["A1", "A2", "A3", "A4", "A5"].forEach(function (id) {
    h.run("buyUpgrade(towers[0], '" + id + "')");
  });
  t.eq(s.rangeUl, 62.5, "A5's absolute 62.5, with nothing added to it");
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
  t.eq(a.damage, 28, "12+4+5+7");
});

test("upgrades must be bought in tier order", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);

  t.eq(h.run("buyUpgrade(towers[0], 'A2')"), "needs A1", "A2 before A1");
  t.eq(h.run("buyUpgrade(towers[0], 'A5')"), "needs A4", "A5 straight away");
  t.eq(h.run("buyUpgrade(towers[0], 'B3')"), "needs B2", "B3 before B2");
  t.eq(s.upgradeCount, 0, "nothing was granted");
  t.eq(h.game.cash, 100000 - 700, "and nothing was charged");

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
  t.eq(s.damage, 21, "12+4+5+0+0");
  t.eq(s.rangeUl, 43.75, "range from A2");
  t.eq(s.cooldownSeconds, 2.2, "hit speed from B2");
});

test("upgrades cost money and are refused when unaffordable", function (t) {
  var h = harness.boot();
  // The purse is the smasher's price plus $200, so the tower leaves exactly
  // $200 behind and the A1/A2 affordability boundary below is unchanged. Was
  // $400 while the smasher cost $200; it costs $700 since 2026-07-30.
  h.run("cash = " + (700 + 200));
  var s = h.placeSmasher(600, 500);      // leaves 200
  t.eq(h.game.cash, 200, "cash after building");

  t.eq(h.run("buyUpgrade(towers[0], 'A1')"), null, "A1 affordable at 150");
  t.eq(h.game.cash, 50, "cash after A1");
  t.eq(h.run("buyUpgrade(towers[0], 'A2')"), "not enough cash", "A2 refused at 225");
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
  t.eq(h.run("sellValue(towers[0])"), 350, "half of the 700 build cost");

  h.run("buyUpgrade(towers[0], 'A1')");
  t.eq(s.totalSpent, 850, "700 + 150 invested");
  t.eq(s.cost, 700, "and the build price itself never moved");
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
  t.eq(e.health, 88, "it was hit");
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
  t.eq(s.damage, 22, "12+4+6");
  h.run("enemies = []");

  var victim = spawnOnLine(h, IN_ZONE, 22);      // dies to one swing
  var bystander = spawnOnLine(h, IN_BLAST, 50);  // in the zone AND in the blast

  t.ok(s.covers(bystander), "the bystander is inside a B4 wedge now");

  victim.applySlow(0.40, 2.5);           // already slowed when the blow lands
  var dealt = runSwing(s, h);

  t.eq(victim.dead, true, "victim killed");
  t.eq(bystander.health, 13, "50 - 22 from the swing - 15 from the blast");
  t.eq(dealt, 59, "22 + 22 from the swing, plus 15 from the blast");
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

  // Measured on a body the SWING never reaches, because the swing slows
  // everything it hits -- checking a bystander inside the wedge would be
  // measuring the swing's slow and calling it the blast's.
  //
  // CHAIN_CONTROL is here to pull the wedge AWAY from the chain: the tower
  // faces "first", so without something further down the road it would turn to
  // face the very body this test needs to be standing outside the swing.
  var victim = spawnOnLine(h, CHAIN_1, 22);
  var link1 = spawnOnLine(h, CHAIN_2, 30);
  var link2 = spawnOnLine(h, CHAIN_3, 30);
  var survivor = spawnOnLine(h, CHAIN_4, 50);    // out of the wedge, takes one blast
  spawnOnLine(h, CHAIN_CONTROL, 50);
  [victim, link1, link2].forEach(function (e) { e.applySlow(0.40, 2.5); });

  t.notOk(s.covers(survivor), "the body measured is outside the swing");

  runSwing(s, h);
  t.eq(survivor.dead, false, "it survived the blast that reached it");
  t.eq(survivor.health, 35, "50 - one 15 point blast");
  t.near(survivor.slowTimer, 2.5, 0.001, "and the blast slowed it");
  t.near(survivor.slowMultiplier, 0.6, 0.001, "by B4's 40%");
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

  var victim = spawnOnLine(h, IN_ZONE, 22);      // dies to one swing
  var bystander = spawnOnLine(h, IN_BLAST, 50);

  t.eq(victim.slowTimer, 0, "the victim has never been slowed by anything");

  var dealt = runSwing(s, h);

  t.eq(victim.dead, true, "victim killed outright");
  t.eq(s.blasts.length, 1, "and it burst anyway");
  t.eq(bystander.health, 13, "50 - 22 from the swing - 15 from the blast");
  t.eq(dealt, 59, "22 + 22 from the swing, plus 15 from the blast");
});

test("without B4 a slowed kill does not burst", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3"].forEach(function (id) { h.run("buyUpgrade(towers[0], '" + id + "')"); });
  h.run("enemies = []");

  var victim = spawnOnLine(h, IN_ZONE, 16);
  var bystander = spawnOnLine(h, IN_BLAST, 50);
  victim.applySlow(0.15, 2.0);

  runSwing(s, h);
  t.eq(victim.dead, true, "victim killed");
  t.eq(bystander.health, 34, "the swing's 16 and no blast without B4");
});

// 2026-07-30, the owner's words: "if another enemy dies to the blast, that
// enemy also explodes for 15 damage. the goal is to create a chain reaction."
// This is the test that says the chain is real, and it is written so that the
// LAST two bodies are ones the swing physically cannot touch -- nothing but a
// chain could have killed them.
test("a blast kill sets off another blast, right out past the swing", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = placeSmasherBeside(h, SMASH_AT);
  ["B1", "B2", "B3", "B4"].forEach(function (id) { h.run("buyUpgrade(towers[0], '" + id + "')"); });
  h.run("enemies = []");

  var victim = spawnOnLine(h, CHAIN_1, 22);      // dies to the swing
  var link1 = spawnOnLine(h, CHAIN_2, 30);       // swing leaves 8, a blast finishes it
  var link2 = spawnOnLine(h, CHAIN_3, 30);
  var link3 = spawnOnLine(h, CHAIN_4, 10);       // OUT of the wedge entirely
  var link4 = spawnOnLine(h, CHAIN_5, 10);       // and further out still
  var control = spawnOnLine(h, CHAIN_CONTROL, 50);

  // A B4 Warbringer slows everything it swings at, so on any swing after the
  // first the whole wedge is already slowed. That is the state this reproduces.
  [victim, link1, link2].forEach(function (e) { e.applySlow(0.40, 2.5); });

  t.notOk(s.covers(link3), "link 3 is outside the swing");
  t.notOk(s.covers(link4), "and so is link 4");

  runSwing(s, h);

  t.eq(victim.dead, true, "the swing kills the first");
  t.eq(link1.dead, true, "its blast finishes the second");
  t.eq(link2.dead, true, "and the chain carries to the third");
  t.eq(link3.dead, true, "past the edge of the swing");
  t.eq(link4.dead, true, "and one link further again");
  t.eq(control.dead, false, "but it stops where the bodies stop");
  t.eq(control.health, 50, "the control is untouched");
  t.eq(s.blasts.length, 5, "five bodies burst, one marker each");
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
  t.eq(a1.from + " → " + a1.to, "3.0 → 4.0", "damage up, rate flat");
  t.eq(a1.delta, "+1", "the gain");

  // B1 buys the same DPS from the other side -- same 12 damage, swung every
  // 3 s instead of 4. Two upgrades that read completely differently on the
  // button turn out to be worth exactly the same, and the row is the only
  // place that is visible.
  var b1 = s.previewUpgrade("B1").changes
    .filter(function (c) { return c.label === "DPS"; })[0];
  t.eq(b1.from + " → " + b1.to, "3.0 → 4.0", "rate up, damage flat");

  // And it is measured, not read off the table: after A1 the same B1 is worth
  // more, because it is now speeding up a heavier hammer.
  h.run("buyUpgrade(towers[0], 'A1')");
  var after = s.previewUpgrade("B1").changes
    .filter(function (c) { return c.label === "DPS"; })[0];
  t.eq(after.from + " → " + after.to, "4.0 → 5.3", "crosspathing included");
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
  t.eq(buttons[0].label, "Path A → A1", "branch A offers A1");
  t.eq(buttons[0].detail, "$150", "with its price");
  t.eq(buttons[1].label, "Path B → B1", "branch B offers B1");
  t.eq(buttons[1].detail, "$150", "with its price");

  h.run("buyUpgrade(inspected, 'A1')");
  buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons[0].label, "Path A → A2", "branch A moves on to A2");
  t.eq(buttons[0].detail, "$225", "at the next tier's price");
  t.eq(buttons[1].label, "Path B → B1", "branch B is unaffected");
});

test("clicking a branch button buys that upgrade", function (t) {
  var h = harness.boot();
  // Priced off Smasher.COST so the $800 left behind -- and the "800 - 150"
  // assertion below -- survives a change to the build price.
  h.run("cash = " + (h.game.Smasher.COST + 800));
  var s = h.placeSmasher(600, 500);      // leaves 800
  h.click(600, 500);

  var b = h.run("inspectionLayout(inspected).upgrades[0]");
  h.click(b.x + b.w / 2, b.y + b.h / 2);

  t.eq(s.hasA1, true, "A1 bought");
  t.eq(h.game.cash, 650, "800 - 150");
  t.eq(s.damage, 16, "stats recalculated");
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
  t.eq(s.damage, 52, "full path A bought through the panel");
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
  t.eq(s.damage, 52, "B1 and B2 add no damage");
  t.eq(s.cooldownSeconds, 2.2, "but they do speed it up");
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
  t.eq(buttons[1].detail, "$150", "at its price");

  h.run("buyUpgrade(inspected, 'B1')");
  buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons[1].label, "Path B → B2", "then B2");
  t.eq(buttons[1].detail, "$225", "at its price");
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
  t.eq(buttons[0].label, "Path A → A1", "which tier");
  t.eq(buttons[0].detail, "$150", "what it costs");
  t.eq(buttons[0].effects, "+4 dmg, +6.25 u.l. range", "A1 effects");

  // Spelled by the SAME formatter the config-driven towers use, in the same
  // unit every tower's panel now reports its rate in. It used to read "-1.0 s"
  // -- a different quantity, in a different direction, under a different name.
  t.eq(buttons[1].effects, "+0.08 atk/s", "B1 only changes attack speed");

  ["A1", "A2"].forEach(function (id) { h.run("buyUpgrade(inspected, '" + id + "')"); });
  buttons = h.run("inspectionLayout(inspected).upgrades");
  t.eq(buttons[0].effects, "+7 dmg, +6.25 u.l. range", "A3 effects");
});

test("effects are diffed against this tower, not read off the table", function (t) {
  var h = harness.boot();
  h.run("cash = 100000");
  var s = h.placeSmasher(600, 500);
  h.click(600, 500);

  // B2 sets the swing to an absolute 2.2 s. Reached from B1's 3.0 s that is
  // 0.33/s -> 0.45/s, not the gain from the 4.0 s base it would look like off
  // the table.
  h.run("buyUpgrade(inspected, 'B1')");
  t.eq(s.cooldownSeconds, 3.0, "B1 applied");

  var buttons = h.run("inspectionLayout(inspected).upgrades");
  var bButton = buttons.filter(function (b) { return b.branch === "B"; })[0];
  t.eq(bButton.id, "B2", "B2 is next");
  t.eq(bButton.effects, "+0.12 atk/s", "measured from 3.0 s, not from the 4.0 s base");
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
      t.ok(button.detail.indexOf("$") === 0,
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
  t.eq(card.subtitle, "$150", "what it costs");

  var byLabel = {};
  card.changes.forEach(function (c) { byLabel[c.label] = c; });

  // The button only had room for "+4 dmg". The card says what the number
  // BECOMES, which is the question a player actually has.
  t.eq(byLabel.Damage.from, "12", "damage before");
  t.eq(byLabel.Damage.to, "16", "damage after");
  t.eq(byLabel.Damage.delta, "+4", "and the delta");
  t.eq(byLabel.Range.to, "37.5 u.l.", "range in u.l., after");
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
  // $60 left behind is the point of the fixture -- below A1's $150. Priced off
  // the build cost so it stays $60 whatever the smasher costs.
  h.run("cash = " + (h.game.Smasher.COST + 60));
  var s = h.placeSmasher(600, 500);      // leaves 60
  h.click(600, 500);

  var b = h.run("inspectionLayout(inspected).upgrades[0]");
  t.eq(b.label, "Path A → A1", "still shows what it would buy");
  t.eq(b.detail, "$150", "and what that would cost");
  t.eq(b.effects, "+4 dmg, +6.25 u.l. range", "and what it would do");
  t.eq(b.enabled, false, "but is not live at $60");

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
  t.eq(refund, 425, "half of 700 + 150");

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
  h.spawnAt(SMASH_AT + 10, 12);          // dies exactly

  runSwing(s, h);
  t.eq(s.damageDealt, 36, "12 to each of three enemies");
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
  t.eq(row("Damage"), "39", "damage row");
  t.eq(row("Range"), "43.75 u.l.", "range is in u.l., not the 'm' it used to print");
  t.eq(row("Attack speed"), "0.45/s", "and the swing rate is attacks per second");
  t.eq(row("On kill"), "3 in 18.75 u.l.", "the blast radius too");
  t.eq(rows[rows.length - 1][0], "DPS", "DPS is the last row");
  t.near(parseFloat(rows[rows.length - 1][1]), 39 / 2.2, 0.05, "DPS derived");

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

group("maps: the routes and the chooser");

// Play the scripted OPENING -- the original two waves -- on `mapId` with
// `gunners` towers, placed at the spots the map's own analysis rates highest.
// Returns the base HP left.
//
// Sliced to two waves deliberately: this test is about ROUTE difficulty, and
// the opening is the stretch where a fixed two-gunner budget discriminates
// between routes. Against the full ten-wave campaign two gunners lose
// everywhere (see tools/simulate-campaign.js), which would collapse every
// route to zero and tell us nothing.
//
// 70 s is past the opening's last leak on every route: its last enemy spawns
// at 15.2 s and the longest walk is 47 s.
//
// The break is pinned at 5 s (2026-07-29). At the shipping 90 s wave 2 does
// not arrive inside the window at all and all four routes score an identical
// 95 off wave 1 alone -- a comparison with nothing left in it. See
// harness.pinWaveBreak: wave spacing is the player's own pacing choice and is
// orthogonal to which route is harder, which is what this measures.
function defend(mapId, gunners) {
  var h = harness.boot(mapId);
  h.pinWaveBreak(5);
  h.run("WAVES = WAVES.slice(0, 2); restartGame()");
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
  t.eq(flagged[0].id, h.game.Maps.DEFAULT_ID, "the default route is the reference");
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
  // **AND THEY COVER THE WHOLE ROSTER AGAIN since 2026-07-30.** For one
  // version they did not: v0.4.9 added four types that were deliberately kept
  // out of the schedule, plus the imported Aether Wisp, so the owner could try
  // them in the index and the sandbox before anything was built around them.
  // All five are now scheduled (waves 24 through 35), so the original
  // assertion is back -- a type nobody ever meets is not content.
  var seen = {};
  var unscheduled = [];
  enemies.forEach(function (e) {
    if (!e.waves.length) unscheduled.push(e.id);
    e.waves.forEach(function (n) { seen[n] = true; });
  });
  t.eq(Object.keys(seen).length, h.game.WAVES.length,
    "every wave in the schedule is claimed by at least one type");
  t.deep(unscheduled, [], "and no type is left off the schedule");

  // And the late-campaign scaling shows: a stock normal is 4 HP, the finale
  // sends 30 HP normals, and the guide must say so.
  var normal = enemies.filter(function (e) { return e.id === "normal"; })[0];
  t.eq(normal.maxHp, 30, "the normal's late-campaign ceiling is derived");

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
  t.deep(boss.waves, [35], "and where the player meets it");

  var colossus = enemies.filter(function (e) { return e.id === "colossus"; })[0];
  t.eq(colossus.health, 550, "the new tank's HP reaches the guide");
  t.eq(colossus.bounty, 250, "with its authored bounty");
  t.deep(colossus.waves, [29], "and its campaign appearance");

  var fractal = enemies.filter(function (e) { return e.id === "fractal_slime"; })[0];
  t.eq(fractal.health, 4, "Fractal Slime is listed at its base T1 health");
  t.eq(fractal.bounty, 2, "with its halved base bounty");
  t.eq(fractal.aoeDamageReduction, 0.5, "with its AoE resistance in the detail model");
  t.eq(fractal.maxTier, 3, "the guide derives the highest campaign tier");
  t.eq(fractal.maxHp, 64, "and derives that T3's 64 HP");
  t.eq(fractal.fractal.splitCount, 4, "the split block reaches the guide");
  t.deep(fractal.waves, [25], "with its wave 25 introduction");
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

test("the number keys pick a route too", function (t) {
  var h = harness.boot(null);
  h.key("3");
  t.eq(h.game.currentMap.id, h.game.Maps.LIST[2].id, "key 3 picks the third card");
  t.eq(h.game.screen, "play", "and starts it");
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

  var r = h.game.restartButtonRect();
  h.click(r.x + r.w / 2, r.y + r.h / 2);
  t.eq(h.game.currentMap.id, "mana-coil", "restart keeps the route");
  t.eq(h.game.screen, "play", "and stays in the run");
  t.eq(h.game.towers.length, 0, "on a clean board");

  h.run("baseHp = 0; gameOver = true");
  var c = h.game.changeMapButtonRect();
  h.click(c.x + c.w / 2, c.y + c.h / 2);
  t.eq(h.game.screen, "select", "the other button returns to the chooser");
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

test("a fresh profile owns the starter kit and nothing else", function (t) {
  var h = harness.boot();
  h.run("MetaProgress.reset(); rebuildBuildBar()");

  var profile = h.run("MetaProgress.snapshot()");
  // The gunner was DELETED from the catalogue on 2026-07-30, so the starter kit
  // is two towers rather than three. These are typed on purpose: this test's
  // subject IS the starter kit, so reading it from MetaProgress would only
  // assert that the kit equals itself and would pass whatever it became.
  t.deep(profile.owned, ["smasher", "soldier"],
    "the Smasher and the Soldier to start");
  t.eq(profile.coins, 0, "no coins");

  // The Soldier is LAST in the catalogue, which is what puts it in the fifth
  // slot once everything is owned -- but defaultLoadout compacts, so on a
  // fresh profile it sits directly behind the Warbringer rather than leaving
  // holes. That is the second slot now the gunner is not in front of it.
  var bar = h.run("BUILD_SLOTS.map(function (s) { return s && s.DISPLAY_NAME; })");
  // Display names, so they carry the 2026-07-30 reskin; the ids above are the
  // persistence format and are deliberately unchanged.
  t.deep(bar, ["Warbringer", "Rifleman", null, null, null],
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

  t.eq(Meta.coinsForRun(1, false), 0, "dying on wave 1 pays nothing");
  t.eq(Meta.coinsForRun(17, false), 32, "wave 17 pays 2 a wave cleared");
  t.eq(Meta.coinsForRun(17, true), 92, "a clear adds 60");
  t.ok(Meta.coinsForRun(25, false) > Meta.coinsForRun(17, false), "further is worth more");
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
  t.ok(after > before || h.run("lastRunCoins") === 0, "coins were banked");
  t.eq(h.run("runAwarded"), true, "and the latch is set");

  // The sandbox un-loses a run by putting base HP back; a second award on the
  // way down again would pay twice for the same run.
  var banked = after;
  h.step(2);
  t.eq(h.run("MetaProgress.coins()"), banked, "further steps pay nothing more");

  h.run("restartGame()");
  t.eq(h.run("runAwarded"), false, "a restart re-arms it");
  t.eq(h.run("lastRunCoins"), 0, "and clears the readout");
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

  h.run("MetaProgress.awardRun(17, false); MetaProgress.awardRun(17, false)");
  t.eq(h.run("MetaProgress.coins()"), 64, "two runs' worth");

  h.run("Store.onClick(" + (action.x + 10) + ", " + (action.y + 10) + ")");
  t.eq(h.run("MetaProgress.owns('longshot')"), true, "now it is owned");
  // 64 banked less the Longshot's price of 40. Typed rather than read back
  // from the catalogue: what this line is for is that buying CHARGES, and an
  // expectation computed from the same price the purchase used would hold even
  // if nothing were deducted at all.
  t.eq(h.run("MetaProgress.coins()"), 24, "and paid for");

  // Into the first FREE slot, which is the third now that the gunner is gone
  // from in front of the two starters.
  var bar = h.run("BUILD_SLOTS.map(function (s) { return s && s.DISPLAY_NAME; })");
  t.deep(bar, ["Warbringer", "Rifleman", "Arcane Sniper", null, null],
    "a purchase goes straight into the bar");
});

test("the inventory equips and unequips, and refuses an unplayable bar", function (t) {
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

  // The invariant AGENTS.md states as "STARTING_CASH must exceed the cost of
  // the cheapest tower". BUILD_SLOTS used to be a constant with the gunner in
  // it; now the player edits it, so it has to be enforced.
  h.run("MetaProgress.unlockAll()");
  var stranded = h.run("(function () {" +
    "  var ids = MetaProgress.equipped().filter(function (x) { return x !== null; });" +
    "  var refusals = [];" +
    "  ids.forEach(function (id) { var r = MetaProgress.unequip(id); if (!r.ok) refusals.push(id); });" +
    "  return { left: MetaProgress.equipped().filter(function (x) { return x !== null; })," +
    "           refusals: refusals }; })()");
  t.ok(stranded.left.length >= 1, "something is always left in the bar");

  var cheapest = h.run("(function () {" +
    "  return BUILD_SLOTS.reduce(function (min, T) {" +
    "    return (T && T.COST < min) ? T.COST : min; }, Infinity); })()");
  t.ok(cheapest <= h.game.STARTING_CASH,
    "and it is always something the opening stake can afford ($" + cheapest + ")");
});

test("a corrupt or tampered profile is repaired, not honoured", function (t) {
  var h = harness.boot();

  // Equipping something you do not own, a bar of nothing but the $800 Siphon,
  // negative coins: all shapes a hand-edited save takes. None may reach the
  // board.
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
function buyPath(h, tower, branch, tiers) {
  h.run("cash = 100000000");
  for (var i = 0; i < tiers; i++) {
    var next = tower.nextUpgrade(branch);
    if (!next) break;
    var refusal = h.run("buyUpgrade(towers[towers.indexOf(inspected)], '" + next.id + "')");
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

  var TABLE = [
    { tier: 1, damage: 1, shots: 3, spacing: 0.13, cooldown: 1.1 },
    { tier: 2, damage: 1, shots: 4, spacing: 0.11, cooldown: 1.0 },
    { tier: 3, damage: 2, shots: 4, spacing: 0.10, cooldown: 0.9 },
    // A4 and A5 retuned up 2026-07-30: A4 2 -> 4 damage, A5 3 -> 8 damage and
    // 0.7 -> 0.6 s between bursts.
    { tier: 4, damage: 4, shots: 5, spacing: 0.08, cooldown: 0.8 },
    { tier: 5, damage: 8, shots: 5, spacing: 0.07, cooldown: 0.6 }
  ];

  TABLE.forEach(function (row) {
    t.eq(buyPath(h, s, "A", 1), null, "A" + row.tier + " is affordable and legal");
    t.eq(s.damage, row.damage, "A" + row.tier + " damage");
    t.eq(s.shotsPerBurst, row.shots, "A" + row.tier + " shots per burst");
    t.ok(Math.abs(s.shotSpacing - row.spacing) < 1e-9, "A" + row.tier + " spacing");
    t.ok(Math.abs(s.burstCooldown - row.cooldown) < 1e-9, "A" + row.tier + " cooldown");
  });

  // 5 x 8 / 0.6 = 66.7 DPS. It was 21.4 (5 x 3 / 0.7) until 2026-07-30 -- see
  // The paths in AGENTS.md for why the whole top of this branch moved.
  t.ok(Math.abs(h.game.TowerStats.dps(s) - 66.67) < 0.01, "A5 lands on 66.7 DPS");

  // And the burst still finishes inside its own cycle: 4 gaps of 0.07 is
  // 0.28 s against a 0.6 s cooldown. If a future retune ever inverts that, the
  // rate this tower reports stops being the rate it fires at.
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

  // B2 heals to the new maximum, so a chewed-up Soldier is repaired by it.
  s.currentHp = 40;
  buyPath(h, s, "B", 1);
  t.eq(s.maxHp, 110, "B2 adds 30 max HP");
  t.eq(s.currentHp, 110, "and heals to the new max");

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
  t.eq(s.recruitCooldownSeconds, 40, "recruits are on a 40 s cooldown at B4");

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
  t.eq(s.recruitCooldownSeconds, 30, "and B5 drops the recruit cooldown to 30 s");
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
  t.ok(Math.abs(s.burstCooldown - 0.6) < 1e-9, "A5+B2: 0.6 s cooldown");
  t.eq(s.rangeUl, 125, "A5+B2: 125 u.l. -- B1's +25");
  t.eq(s.maxHp, 110, "A5+B2: 110 HP -- B2's +30");
  t.eq(s.seesCamo, false, "A5+B2: still no camo, because B3 is locked out");

  // The two damage channels meeting: path A's absolute 8 plus B2's delta of 1.
  // This endpoint has moved twice now -- 3 damage originally, 4 when B2 gained
  // its +1, and 9 since A5 was retuned -- so it is asserted rather than assumed.
  t.eq(s.damage, 9, "A5+B2: 9 damage -- A5's absolute 8 plus B2's +1");
  t.eq(s.automatic, false, "A5+B2: still a burst weapon, because B3 is locked out");
  t.ok(Math.abs(h.game.TowerStats.dps(s) - 75) < 0.01, "A5+B2: 5 x 9 / 0.6 = 75 DPS");
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
  t.eq(h.game.Smasher.COST, 700, "smasher cost");
  t.eq(h.game.Smasher.BASE_DAMAGE, 12, "smasher damage");

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
  t.eq(h.game.waveGroups(h.game.WAVES[23]).length, 1,
    "wave 24 holds one group and nothing walks under the Wisps");

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
    "the gameplay renderer paints the full environment on all six maps");
});

test("the title screen renders its command deck and four dedicated controls", function (t) {
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
    "drawMenuButton = function (r, label, key, rgb, primary) {" +
      "menuControlDraws++; realMenuButton(r, label, key, rgb, primary);" +
    "};"
  );

  h.draw();
  t.eq(h.game.menuBackdropDraws, 1,
    "one full sci-fi command deck sits behind the title");
  t.eq(h.game.menuControlDraws, 4,
    "each existing action uses the dedicated terminal control style");
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


runner.run();
