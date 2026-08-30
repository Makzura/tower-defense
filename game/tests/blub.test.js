// ---------------------------------------------------------------------------
// The Summoner's acceptance list.
//
//   node tests/blub.test.js
//
// Run standalone, like tests/long-range-dps.test.js and tests/beam.test.js --
// it is not part of tests/run.js. Every test here is one of the twenty-eight
// numbered acceptance criteria in the owner's brief, and the numbers in the
// test names are his.
//
// TWO OF THEM PIN A FIGURE THE BRIEF'S PROSE DISAGREES WITH, and both are
// called out where they sit: the Hungry Blub's 1473 total requires compounding
// growth rather than the additive growth the sentence above it describes, and
// the SuperBlub's five lances follow from a lance that costs no charge. The
// numbered acceptance test is the harder constraint in both cases, so it is
// what the code implements and what this file asserts.
// ---------------------------------------------------------------------------

var harness = require("./harness.js");
var runner = require("./assert.js");
var group = runner.group;
var test = runner.test;

// A board with no schedule running and nothing on it, so a test sees only what
// it puts there. `waveIndex = WAVES.length` is the suite's standard way to
// stop the spawner, and it deliberately does NOT read as a victory (see
// allWavesDeployed in js/game.js).
function boot() {
  var h = harness.boot();
  h.run("cash = 1000000");
  h.run("waveIndex = WAVES.length");
  h.clearBoard();
  return h;
}

// A spot the game itself accepts for this build slot, found through the game's
// own whyCannotBuild rather than typed as a coordinate that would quietly rot.
function legalSpot(h, slot) {
  for (var x = 60; x < h.game.VIEW_WIDTH - 60; x += 20) {
    for (var y = 60; y < h.game.BAR_Y - 60; y += 20) {
      if (h.run("overInterfaceChrome(" + x + ", " + y + ")")) continue;
      if (h.run("whyCannotBuild(" + x + ", " + y + ", BUILD_SLOTS[" + slot + "])") === null) {
        return { x: x, y: y };
      }
    }
  }
  return null;
}

function summoner(h, upgrades) {
  var slot = h.slotOf(h.game.BlubTower);
  var spot = legalSpot(h, slot);
  var tower = h.place(spot.x, spot.y, slot);
  (upgrades || []).forEach(function (id) { tower.applyUpgrade(id); });
  return tower;
}

// Switch every summon line off. Combat tests plant the ONE blub they are
// measuring and then run for up to a minute, which is long enough for the
// tower's own cycles to fill the board -- and a second blub changes the answer
// twice over, by adding its own damage and by switching on the swarm buff. The
// toggles are the game's own, not a test-only door.
function mute(tower) {
  ["main", "mini", "heavy"].forEach(function (line) {
    if (tower.lineIsEnabled(line)) tower.toggleLine(line);
  });
  return tower;
}

// A blub at an exact position, bypassing the placement search. Everything else
// is the real spawn path -- the same resolved stats, the same list, the same
// insertion into `towers` -- so a unit test can put one somewhere useful
// without fighting a random point in a disc.
function plant(h, tower, unitId, x, y) {
  var blub = new h.game.Blub(tower, x, y, tower.summonStats(unitId));
  tower.blubs.push(blub);
  h.game.addTower(blub);
  return blub;
}

// A target that stands still and cannot die, beside a blub planted next to it.
// `rooted` is the flag a revived Revenant sets, and it zeroes the enemy's
// speed, which is what keeps a 47-second ammunition test in range of its
// target.
function dummyBesideBlub(h, tower, unitId, health) {
  mute(tower);
  var enemy = h.spawnAt(400, health === undefined ? 1000000 : health, "normal");
  enemy.rooted = true;
  var blub = plant(h, tower, unitId, enemy.pos.x + 12, enemy.pos.y + 12);
  return { enemy: enemy, blub: blub };
}

function blubsOf(h) {
  return h.game.towers.filter(function (t) { return t.isSummon; });
}


group("1-3  summoning and the space it takes");

test("1  a lone base tower plants a Blub I every 20 s, somewhere inside 75 u.l.", function (t) {
  var h = boot();
  var tower = summoner(h);

  h.step(19.5);
  t.eq(blubsOf(h).length, 0, "nothing yet at 19.5 s");

  h.step(1);
  var out = blubsOf(h);
  t.eq(out.length, 1, "one blub just after 20 s");
  t.eq(out[0].unitId, "blub1", "and it is a Blub I");

  var dx = out[0].x - tower.x;
  var dy = out[0].y - tower.y;
  t.ok(Math.sqrt(dx * dx + dy * dy) <= h.run("ul(75)") + 0.001,
    "planted inside the tower's range");

  // And it keeps going: the cycle is a cycle, not a one-off.
  h.step(20);
  t.eq(blubsOf(h).length, 2, "a second one 20 s later");
});

test("2  a saturated zone plants nothing, raises nothing, and waits at full", function (t) {
  var h = boot();
  var tower = summoner(h);

  // No reach at all, so every candidate point lands inside the tower's own
  // footprint and the search legitimately fails. This is the saturated case
  // reduced to its essentials: there IS no free point.
  tower.rangePx = 0;

  h.step(41);
  t.eq(blubsOf(h).length, 0, "two cycles produced nothing");
  t.ok(true, "and neither of them threw");

  // THE BAR STAYS FULL RATHER THAN RESTARTING (2026-08-10, at the owner's
  // request). The brief originally said the cycle simply came round again; in
  // play that meant a full board spent every interval counting down to another
  // failure, so a space that opened sat empty for up to a whole cycle.
  t.eq(tower.lineProgress("main"), 1, "the bar is held at full");
  t.ok(tower.railLines()[0].blocked, "and the box says why");

  // Room appears: the body lands on the NEXT STEP, not on the next cycle.
  tower.rangePx = h.run("ul(75)");
  h.step(1 / 60);
  t.eq(blubsOf(h).length, 1, "placed the instant a space opened");
  t.ok(tower.lineProgress("main") < 0.05, "and only then does the bar restart");
  t.notOk(tower.railLines()[0].blocked, "and the box stops saying no room");
});

test("3  two blubs never overlap, whatever their sizes", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4"]);

  h.step(60);
  var out = blubsOf(h);
  t.ok(out.length >= 4, "a crowd was planted (" + out.length + ")");

  var worst = Infinity;
  for (var i = 0; i < out.length; i++) {
    for (var j = i + 1; j < out.length; j++) {
      var need = out[i].footprintPx + out[j].footprintPx;
      var dx = out[i].x - out[j].x;
      var dy = out[i].y - out[j].y;
      worst = Math.min(worst, Math.sqrt(dx * dx + dy * dy) - need);
    }
    // And none of them is standing on the tower either.
    var tdx = out[i].x - tower.x;
    var tdy = out[i].y - tower.y;
    worst = Math.min(worst,
      Math.sqrt(tdx * tdx + tdy * tdy) - (out[i].footprintPx + tower.footprintPx));
  }
  t.ok(worst >= -0.001, "closest pair still clears by " + worst.toFixed(3) + " px");
});


group("4-7  hit points are ammunition");

test("4  a Blub I dies after exactly 10 attacks, having dealt 20 damage", function (t) {
  var h = boot();
  var tower = summoner(h);
  var pair = dummyBesideBlub(h, tower, "blub1");

  h.step(12);
  t.eq(pair.blub.attacksMade, 10, "attacks made");
  t.ok(pair.blub.isDestroyed(), "and it is spent");
  t.eq(tower.damageDealt, 20, "damage credited to the summoner");
});

test("5  a Blub III dies after 20 attacks, having dealt 120 damage", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2"]);
  var pair = dummyBesideBlub(h, tower, "blub3");

  // 20 charges at 1.5/s is 13.3 s of firing. The swarm buff needs a SECOND
  // blub to do anything, and this one is alone, so the rate is the table's.
  h.step(16);
  t.eq(pair.blub.attacksMade, 20, "attacks made");
  t.ok(pair.blub.isDestroyed(), "and it is spent");
  t.eq(tower.damageDealt, 120, "damage credited to the summoner");
});

test("6  a SuperBlub fires exactly five free lances before it dies", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "B1", "B2", "B3", "B4", "B5"]);

  var Blub = h.game.Blub;
  var original = Blub.prototype.fireLaser;
  var lances = 0;
  Blub.prototype.fireLaser = function () {
    lances++;
    return original.apply(this, arguments);
  };

  var pair;
  try {
    pair = dummyBesideBlub(h, tower, "superb");
    // 51 charges at 1.25/s, plus five free lances, is about 45 s of firing.
    h.step(60);
  } finally {
    Blub.prototype.fireLaser = original;
  }

  t.eq(lances, 5, "lances fired");
  t.ok(pair.blub.isDestroyed(), "and it is spent");

  // The lance costs no charge, so the body outlives its charge count by
  // exactly the number of lances it got. Charges are READ off the tower rather
  // than typed as 51: this build owns B2, which gives every summon one more,
  // and 52 charges still yield five lances -- which is the point of asserting
  // the relationship instead of the number.
  var charges = tower.summonStats("superb").hp;
  t.eq(charges, 52, "51 from the table plus B2's extra");
  t.eq(pair.blub.attacksMade, charges + lances, "total attacks, lances included");
});

test("7  a dead blub's ground is free before its death animation is over", function (t) {
  var h = boot();
  var tower = mute(summoner(h));
  // Well clear of the summoner, so the only thing that can be reported as
  // overlapping here is the blub itself.
  var blub = plant(h, tower, "blub1", tower.x + h.run("ul(140)"), tower.y);

  t.notOk(tower.spotIsFree(blub.x, blub.y, blub.footprintPx),
    "occupied while it lives");
  t.eq(h.run("whyCannotBuild(" + blub.x + ", " + blub.y + ", BlubTower)"),
    "overlaps another tower", "and the build validator says so");

  // Spent, but still in `towers`: the main loop's sweep has not run yet, which
  // is exactly the frame the brief is about.
  blub.currentHp = 0;
  t.ok(h.game.towers.indexOf(blub) !== -1, "still in the tower list");
  t.ok(tower.spotIsFree(blub.x, blub.y, blub.footprintPx),
    "but its ground is already free to a summon");
  t.notOk(h.run("whyCannotBuild(" + blub.x + ", " + blub.y + ", BlubTower)") ===
    "overlaps another tower", "and free to the build validator too");
});


group("8-12  upgrades apply to future summons only");

test("8  buying A1 leaves living Blub Is alone and changes only the next one", function (t) {
  var h = boot();
  var tower = summoner(h);
  var i;
  for (i = 0; i < 3; i++) plant(h, tower, "blub1", tower.x + 40 + i * 40, tower.y - 60);

  tower.applyUpgrade("A1");
  for (i = 0; i < 3; i++) {
    t.eq(tower.blubs[i].unitId, "blub1", "living blub " + i + " is unchanged");
  }

  h.step(20);
  var latest = blubsOf(h).filter(function (b) { return b.unitId !== "blub1"; });
  t.eq(latest.length, 1, "exactly one new kind arrived");
  t.eq(latest[0].unitId, "blub2", "and it is a Blub II");
});

test("9  buying B2 gives no charges to blubs already standing", function (t) {
  var h = boot();
  var tower = summoner(h, ["B1"]);
  var blub = plant(h, tower, "blub1", tower.x + 40, tower.y - 60);
  var before = blub.maxHp;

  tower.applyUpgrade("B2");
  t.eq(blub.maxHp, before, "the standing blub keeps its ceiling");
  t.eq(blub.currentHp, before, "and its charges");

  var next = tower.summonStats("blub1");
  t.eq(next.hp, before + 1, "the next one is born with the extra charge");
});

test("10  B3 cannot be bought without A2", function (t) {
  var h = boot();
  var tower = summoner(h, ["B1", "B2"]);

  t.eq(tower.whyCannotUpgrade("B3"), "needs A2", "refused, and it says why");
  t.eq(h.run("buyUpgrade(towers[0], 'B3')"), "needs A2", "the economy refuses it too");
  t.notOk(tower.hasB3, "and nothing was bought");

  tower.applyUpgrade("A1");
  tower.applyUpgrade("A2");
  t.eq(tower.whyCannotUpgrade("B3"), null, "allowed once A2 is owned");
});

test("11  A3 then A4 runs three summon cycles in parallel and independently", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4"]);

  var lines = tower.lineUnits();
  t.eq(lines.main, "blub3", "main line");
  t.eq(lines.mini, "mini2", "mini line");
  t.eq(lines.heavy, "hungry", "heavy line");

  h.step(20);
  var kinds = {};
  blubsOf(h).forEach(function (b) { kinds[b.unitId] = (kinds[b.unitId] || 0) + 1; });

  t.ok(kinds.mini2 >= 3, "the 3.5 s line ran several times (" + (kinds.mini2 || 0) + ")");
  t.ok(kinds.blub3 >= 1, "the 15 s main line ran");
  t.ok(kinds.hungry >= 1, "the 15 s heavy line ran");
  // Independent clocks: the fast line is not gated on the slow ones.
  t.ok(kinds.mini2 > kinds.blub3, "the fast line outpaced the slow ones");
});

test("12  a toggle silences one line and leaves the others alone", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4"]);

  tower.toggleLine("mini");
  t.notOk(tower.lineIsEnabled("mini"), "mini is off");
  t.ok(tower.lineIsEnabled("main"), "main is untouched");
  t.ok(tower.lineIsEnabled("heavy"), "heavy is untouched");

  h.step(20);
  var kinds = {};
  blubsOf(h).forEach(function (b) { kinds[b.unitId] = (kinds[b.unitId] || 0) + 1; });

  t.eq(kinds.mini2, undefined, "no Mini Blub II appeared");
  t.ok(kinds.blub3 >= 1, "the main line still ran");
  t.ok(kinds.hungry >= 1, "the heavy line still ran");
});


group("13-16  the swarm buff");

test("13  A2 and eleven blubs is +50% each, and a twelfth adds nothing", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2"]);
  var i;
  for (i = 0; i < 11; i++) plant(h, tower, "blub3", tower.x + 500 + i * 60, tower.y);

  var blub = tower.blubs[0];
  t.near(tower.swarmBonusFor(blub), 0.5, 1e-9, "bonus at eleven");
  t.near(blub.attackDamage(), 6 * 1.5, 1e-9, "damage at eleven");
  t.near(blub.attacksPerSecond(), 1.5 * 1.5, 1e-9, "rate at eleven");

  plant(h, tower, "blub3", tower.x + 500 + 11 * 60, tower.y);
  t.near(tower.swarmBonusFor(blub), 0.5, 1e-9, "still +50% at twelve");
});

test("14  A4 raises the ceiling, and twenty-one blubs is +100%", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4"]);
  for (var i = 0; i < 21; i++) plant(h, tower, "blub3", tower.x + 500 + i * 60, tower.y);

  var blub = tower.blubs[0];
  t.near(tower.swarmBonusFor(blub), 1.0, 1e-9, "bonus at twenty-one");
  t.near(blub.attackDamage(), 12, 1e-9, "damage doubled");
  t.near(blub.attacksPerSecond(), 3, 1e-9, "rate doubled");
});

test("15  a blub alone gets nothing -- it never buffs itself", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2"]);
  var blub = plant(h, tower, "blub3", tower.x + 500, tower.y);

  t.eq(tower.swarmBonusFor(blub), 0, "no bonus");
  t.eq(blub.attackDamage(), 6, "table damage");
  t.eq(blub.attacksPerSecond(), 1.5, "table rate");
});

test("16  a second summoner's blubs count for nothing", function (t) {
  var h = boot();
  var one = summoner(h, ["A1", "A2"]);
  var i;
  for (i = 0; i < 3; i++) plant(h, one, "blub3", one.x + 500 + i * 60, one.y);

  var slot = h.slotOf(h.game.BlubTower);
  var spot = legalSpot(h, slot);
  var two = h.place(spot.x, spot.y, slot);
  ["A1", "A2"].forEach(function (id) { two.applyUpgrade(id); });
  for (i = 0; i < 8; i++) plant(h, two, "blub3", two.x + 500 + i * 60, two.y + 120);

  t.near(one.swarmBonusFor(one.blubs[0]), 0.10, 1e-9, "three of its own is +10%");
  t.near(two.swarmBonusFor(two.blubs[0]), 0.35, 1e-9, "eight of its own is +35%");
});


group("17  the Hungry Blub");

test("17  it compounds 4% an attack and deals 1473 across its 35 charges", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4"]);
  // SWUNG, not landed. A4 grants the Hungry Blub and the weakening debuff in
  // the same tier, so in a real game this unit always amplifies its own target
  // as it feeds -- and the brief's 1473 is a statement about what the unit
  // HITS FOR, not about what a debuffed body ends up absorbing. Both are
  // asserted below; conflating them is what made this test read 1536.
  var Blub = h.game.Blub;
  var originalHit = Blub.prototype.hit;
  var swung = 0;
  Blub.prototype.hit = function (enemy, amount) {
    swung += amount;
    return originalHit.apply(this, arguments);
  };

  var pair;
  try {
    pair = dummyBesideBlub(h, tower, "hungry");

    // Alone, so the swarm buff contributes nothing and the only multiplier
    // live here is its own feeding.
    t.eq(pair.blub.attackDamage(), 20, "first attack is the table value");

    // 35 charges at 0.75/s is about 47 s.
    h.step(52);
  } finally {
    Blub.prototype.hit = originalHit;
  }

  t.eq(pair.blub.attacksMade, 35, "attacks made");
  t.ok(pair.blub.isDestroyed(), "and it is spent");
  t.near(pair.blub.attackDamage(), 20 * Math.pow(1.04, 35), 0.01,
    "its final damage is 35 compoundings above the table");

  // THE BRIEF'S OWN FIGURE, and the one that settles compounding versus
  // additive growth: 20 x (1.04^35 - 1) / 0.04 = 1472.95. Additive growth of
  // "4% of the base value" would have totalled 1176.
  t.near(swung, 1473, 1, "total damage swung over its life");

  // And what actually landed is a little more, because its own tier's debuff
  // was stacking on the target the whole time. Stated rather than tolerated.
  t.ok(tower.damageDealt > swung,
    "the A4 debuff amplified its own damage (" + tower.damageDealt.toFixed(1) + ")");
  t.ok(tower.damageDealt < swung * 1.04, "but only slightly");
});


group("18-19  the weakening debuff");

test("18  fifty hits is +5%, and a thousand is +100% and no more", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4"]);
  var enemy = h.spawnAt(400, 1000000, "normal");
  var DamageAmp = h.game.DamageAmp;
  var i;

  for (i = 0; i < 50; i++) tower.applyWeaken(enemy);
  t.near(DamageAmp.fraction(enemy), 0.05, 1e-9, "fifty hits");

  for (i = 50; i < 1000; i++) tower.applyWeaken(enemy);
  t.near(DamageAmp.fraction(enemy), 1.0, 1e-9, "a thousand hits");

  for (i = 0; i < 500; i++) tower.applyWeaken(enemy);
  t.near(DamageAmp.fraction(enemy), 1.0, 1e-9, "fifteen hundred is still +100%");

  // And it raises damage from ANY source, not just from this tower.
  var fresh = h.spawnAt(500, 100, "normal");
  for (i = 0; i < 500; i++) tower.applyWeaken(fresh);
  var before = fresh.health;
  fresh.takeDamage(10);
  t.near(before - fresh.health, 15, 1e-9, "a plain 10-damage hit lands 15");
});

test("19  every stack keeps its own five seconds and expires on its own", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4"]);
  var enemy = h.spawnAt(400, 1000000, "normal");
  enemy.rooted = true;
  var DamageAmp = h.game.DamageAmp;
  var i;

  for (i = 0; i < 100; i++) tower.applyWeaken(enemy);
  h.step(2);
  for (i = 0; i < 100; i++) tower.applyWeaken(enemy);

  t.near(DamageAmp.fraction(enemy), 0.2, 1e-9, "two hundred live stacks");

  // Three more seconds retires the FIRST hundred and only the first hundred.
  h.step(3.05);
  t.near(DamageAmp.fraction(enemy), 0.1, 1e-9, "the older hundred has gone");

  h.step(2.05);
  t.near(DamageAmp.fraction(enemy), 0, 1e-9, "and then the rest");
});


group("20-26  Coagulation");

// A5's real price is $40 000 and its tiers are bought, not granted -- but every
// test below is about what the merge DOES, so they take the whole path in one
// line rather than re-proving the upgrade plumbing group 8-12 already covers.
var FULL_A = ["A1", "A2", "A3", "A4", "A5"];

test("20  a hundred full Mini Blub IIs pool 1200 HP, which is tier 2", function (t) {
  var h = boot();
  var tower = summoner(h, FULL_A);
  for (var i = 0; i < 100; i++) plant(h, tower, "mini2", tower.x + 500 + i * 40, tower.y);

  t.eq(tower.blubHpTotal(), 1200, "pooled charges");
  t.eq(tower.coagulate(), null, "the merge was accepted");
  t.eq(tower.monster.monsterTier, 2, "tier");
  t.eq(tower.monster.currentHp, 1200, "the monster carries the pool");
  t.eq(blubsOf(h).filter(function (b) { return b.unitId === "mini2"; }).length, 0,
    "and every merged blub is gone");
});

test("21  the same hundred after six shots each pool 600, which is tier 1", function (t) {
  var h = boot();
  var tower = summoner(h, FULL_A);
  for (var i = 0; i < 100; i++) {
    var b = plant(h, tower, "mini2", tower.x + 500 + i * 40, tower.y);
    b.currentHp -= 6;                       // six attacks' worth of charges
  }

  t.eq(tower.blubHpTotal(), 600, "CURRENT charges, not maximum");
  tower.coagulate();
  t.eq(tower.monster.monsterTier, 1, "tier");
  t.eq(tower.monster.currentHp, 600, "the monster carries the spent pool");
});

test("22  7777 is tier 4 exactly; 7776 and 7778 are tier 3", function (t) {
  var h = boot();
  var tiers = h.game.BlubTower;

  t.eq(tiers.monsterTierFor(7777).tier, 4, "7777");
  t.eq(tiers.monsterTierFor(7776).tier, 3, "7776");
  t.eq(tiers.monsterTierFor(7778).tier, 3, "7778");
  t.eq(tiers.monsterTierFor(4500).tier, 3, "4500 is the tier 3 floor");
  t.eq(tiers.monsterTierFor(4499).tier, 2, "4499 is not");
  t.eq(tiers.monsterTierFor(999).tier, 1, "999");
  t.eq(tiers.monsterTierFor(499).tier, 0, "499");

  // And through the real merge, not just the classifier.
  var tower = summoner(h, FULL_A);
  var blub = plant(h, tower, "blub3", tower.x + 500, tower.y);
  blub.maxHp = 7777;
  blub.currentHp = 7777;
  tower.coagulate();
  t.eq(tower.monster.monsterTier, 4, "a 7777 pool merges to tier 4");
});

test("20b  below tier 3 the monster stands beside the tower, near the track", function (t) {
  var h = boot();
  var tower = mute(summoner(h, FULL_A));
  var blub = plant(h, tower, "blub3", tower.x + 500, tower.y);
  blub.currentHp = 300;                                   // < 500: tier 0
  tower.coagulate();

  var m = tower.monster;
  t.eq(m.monsterTier, 0, "tier 0");

  // IT MUST NOT REPLACE THE TOWER (2026-08-10, at the owner's correction).
  // Below tier 3 the tower carries on summoning beside it, so a monster sitting
  // on top of it hid the thing still doing the work.
  t.ok(m.x !== tower.x || m.y !== tower.y, "it is not on the tower");
  var gap = Math.sqrt(Math.pow(m.x - tower.x, 2) + Math.pow(m.y - tower.y, 2));
  t.ok(gap >= m.footprintPx + tower.footprintPx - 0.001,
    "and it clears the tower's footprint properly");

  // AND AS NEAR THE TRACK AS IT CAN GET: closer to the road than the tower that
  // made it, which is the whole reason it is placed rather than parked.
  t.ok(tower.distanceToRoad(m.x, m.y) < tower.distanceToRoad(tower.x, tower.y),
    "and closer to the road than the tower is");

  t.notOk(tower.summoningHalted, "the tower is still summoning");
  var before = blubsOf(h).length;
  tower.toggleLine("main");
  h.step(16);
  t.ok(blubsOf(h).length > before, "and proves it");
});

test("23  tier 3 fuses the tower, becomes targetable, and grows on every kill", function (t) {
  var h = boot();
  var tower = summoner(h, FULL_A);
  var blub = plant(h, tower, "blub3", tower.x + 500, tower.y);
  blub.maxHp = 5000;
  blub.currentHp = 5000;
  tower.coagulate();

  var monster = tower.monster;
  t.eq(monster.monsterTier, 3, "tier");
  // ONLY FROM TIER 3 does it stand where the tower stands: it has fused with
  // it, summoning has stopped for good, and the two are one thing in one place.
  t.eq(monster.x, tower.x, "it is ON the tower");
  t.eq(monster.y, tower.y, "in both axes");
  t.ok(tower.summoningHalted, "the tower has stopped summoning");
  t.ok(monster.enemyTargetable, "and the monster can be attacked");
  t.eq(monster.rangePx, Infinity, "its reach is global");

  // A full main cycle passes and nothing new is planted.
  var before = blubsOf(h).length;
  h.step(20);
  t.eq(blubsOf(h).length, before, "no new blubs while it is fused");

  var hp = monster.currentHp;
  var dmg = monster.baseDamage;
  tower.kills += 3;
  h.step(1 / 60);
  t.eq(monster.currentHp, hp + 3, "three kills, three charges");
  t.eq(monster.baseDamage, dmg + 3, "three kills, three damage");
});

test("23b  the leap is an attack: no enemies, no leap, and no charges spent", function (t) {
  var h = boot();
  var tower = mute(summoner(h, FULL_A));
  var blub = plant(h, tower, "blub3", tower.x + 500, tower.y);
  blub.currentHp = 1500;                                  // tier 2: it leaps
  tower.coagulate();

  var m = tower.monster;
  t.eq(m.monsterTier, 2, "tier 2");
  t.eq(m.jump.every, 15, "it leaps every 15 s");
  t.eq(m.jump.hpCost, 20, "and each one costs 20 charges");

  // AN EMPTY BOARD COSTS IT NOTHING (2026-08-10). It used to leap on a bare
  // timer, so a monster between waves spent 20 charges every 15 s into nothing
  // and eventually killed itself standing still.
  var full = m.currentHp;
  h.step(60);
  t.eq(m.currentHp, full, "four leap windows passed and it is untouched");
  t.eq(m.jumpTimer, 0, "the clock is held ready, not banked negative");

  // A body walks in: the held leap lands at once rather than waiting out
  // another 15 s.
  //
  // The MONSTER is moved onto the enemy rather than the other way round. An
  // enemy's `pos` is recomputed from its progress on every step, so a
  // hand-placed one snaps back to the road; a blub's is simply where it stands.
  var enemy = h.spawnAt(400, 100000, "normal");
  enemy.rooted = true;
  m.x = enemy.pos.x;
  m.y = enemy.pos.y;
  h.step(1 / 60);
  t.eq(m.currentHp, full - 20, "it leapt the moment there was something to hit");
  t.ok(enemy.stunTimer > 0, "and stunned it");
  t.ok(tower.damageDealt > 0, "for real damage");

  // And then it goes back on its ordinary 15 s cadence.
  t.near(m.jumpTimer, 15, 0.1, "the cooldown restarted");
});

test("23c  a T0-T2 monster stands INSIDE the range, as near the road as it can", function (t) {
  var h = boot();

  [300, 700, 1500].forEach(function (pooled) {
    var tower = mute(summoner(h, FULL_A));
    var seed = plant(h, tower, "blub3", tower.x + 300, tower.y + 60);
    seed.maxHp = pooled;
    seed.currentHp = pooled;
    t.eq(tower.coagulate(), null, pooled + " HP merged");

    var m = tower.monster;
    var away = Math.hypot(m.x - tower.x, m.y - tower.y);

    // INSIDE THE RANGE, like any other blub. The first version searched out to
    // several times the range so it could hug the road from anywhere, and put
    // the monster well outside the circle its own tower draws.
    t.ok(away <= tower.rangePx + 0.001,
      "T" + m.monsterTier + " is inside the range (" + Math.round(away) + " <= " +
      Math.round(tower.rangePx) + ")");
    // And not on top of the tower, which still has three lines to run.
    t.ok(away >= tower.footprintPx + m.footprintPx - 0.001,
      "T" + m.monsterTier + " does not sit on the tower");
    t.notOk(tower.summoningHalted, "T" + m.monsterTier + " leaves it summoning");

    // Nearest the road of everything legal, which is the other half of the rule.
    var best = tower.findRoadSpot(m.footprintRadiusUl, tower.rangePx);
    if (best) {
      t.ok(tower.distanceToRoad(m.x, m.y) <= tower.distanceToRoad(best.x, best.y) + 1,
        "T" + m.monsterTier + " took the spot nearest the road");
    }
  });
});

test("24  a tier 4 monster ignores every stun", function (t) {
  var h = boot();
  var tower = summoner(h, FULL_A);
  var blub = plant(h, tower, "blub3", tower.x + 500, tower.y);
  blub.maxHp = 7777;
  blub.currentHp = 7777;
  tower.coagulate();

  var monster = tower.monster;
  t.eq(monster.monsterTier, 4, "tier");
  h.run("TowerHealth.stun(towers.filter(function (x) { return x.stunImmune; })[0], 3)");
  t.notOk(h.run("TowerHealth.isStunned(towers.filter(function (x) { return x.stunImmune; })[0])"),
    "still not stunned");

  // A tier 3 one is NOT immune, which is what makes the tier 4 line mean
  // something.
  var h2 = boot();
  var t2 = summoner(h2, FULL_A);
  var b2 = plant(h2, t2, "blub3", t2.x + 500, t2.y);
  b2.maxHp = 5000;
  b2.currentHp = 5000;
  t2.coagulate();
  h2.game.TowerHealth.stun(t2.monster, 3);
  t.ok(h2.game.TowerHealth.isStunned(t2.monster), "a tier 3 monster is stunnable");
});

test("25  a second Coagulation absorbs the monster and adds the new blubs to it", function (t) {
  var h = boot();
  var tower = summoner(h, FULL_A);
  var first = plant(h, tower, "blub3", tower.x + 500, tower.y);
  first.currentHp = 300;
  tower.coagulate();
  t.eq(tower.monster.currentHp, 300, "first merge");
  t.eq(tower.monster.monsterTier, 0, "tier 0, so the tower keeps summoning");

  var added = plant(h, tower, "blub3", tower.x + 560, tower.y);
  added.currentHp = 250;
  tower.coagCooldown = 0;
  tower.coagulate();

  t.eq(tower.monster.currentHp, 550, "the old monster's charges were carried in");
  t.eq(tower.monster.monsterTier, 1, "and the bigger pool picked a higher tier");
  t.eq(tower.blubs.length, 1, "exactly one body remains");
});

test("26  a monster at zero returns the tower to A4 and summoning resumes", function (t) {
  var h = boot();
  var tower = summoner(h, FULL_A);
  var blub = plant(h, tower, "blub3", tower.x + 500, tower.y);
  blub.maxHp = 5000;
  blub.currentHp = 5000;
  tower.coagulate();
  t.ok(tower.summoningHalted, "fused");

  tower.monster.currentHp = 0;
  h.step(0.1);
  t.eq(tower.monster, null, "the monster is gone");
  t.notOk(tower.summoningHalted, "the tower is a tower again");

  var before = blubsOf(h).length;
  h.step(16);
  t.ok(blubsOf(h).length > before, "and it is summoning again");
});


group("27-28  the interface");

test("27  the tower reports its blub count and their exact pooled charges", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2"]);

  t.eq(tower.blubCount(), 0, "nothing yet");
  t.eq(tower.blubHpTotal(), 0, "and nothing pooled");

  var a = plant(h, tower, "blub3", tower.x + 500, tower.y);
  var b = plant(h, tower, "blub3", tower.x + 560, tower.y);
  a.currentHp -= 7;

  t.eq(tower.blubCount(), 2, "two blubs");
  t.eq(tower.blubHpTotal(), 33, "13 + 20 charges");

  // And both numbers are on the panel, where the brief asks for them.
  var rows = {};
  tower.statLines().forEach(function (row) { rows[row[0]] = row[1]; });
  t.eq(rows.Blubs, "2", "the Blubs row");
  t.eq(rows["Blub HP"], "33", "the Blub HP row");
});

test("28  a blub opens its own panel, and selling it pays $0 and destroys it", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2"]);
  var blub = plant(h, tower, "blub3", tower.x + h.run("ul(50)"), tower.y);

  // Clicked on the map, through the real handler, exactly as a player does.
  var world = h.run("(function () { var c = { x: " + blub.x + ", y: " + blub.y +
    " }; return c; })()");
  t.eq(h.run("towerAt(" + world.x + ", " + world.y + ")") === blub, true,
    "the click lands on the blub");

  h.game.inspected = blub;
  var L = h.run("inspectionLayout(inspected)");
  t.ok(L.h > 0 && L.y >= 0, "its panel fits the canvas");
  t.ok(L.y + L.h <= h.game.BAR_Y, "and clears the build bar");

  var labels = L.rows.map(function (row) { return row[0]; });
  ["Unit", "Ammo", "Damage", "Attack speed", "Range", "Footprint"].forEach(function (want) {
    t.ok(labels.indexOf(want) !== -1, "the panel states " + want);
  });

  t.eq(h.game.sellValue(blub), 0, "it sells for nothing");
  var cashBefore = h.game.cash;
  h.click(L.sell.x + L.sell.w / 2, L.sell.y + L.sell.h / 2);
  t.eq(h.game.cash, cashBefore, "no money changed hands");
  t.eq(h.game.towers.indexOf(blub), -1, "and it is off the board");
});

test("28c  a blub destroyed through its panel leaves the fleet too", function (t) {
  var h = boot();
  var tower = mute(summoner(h, ["A1", "A2"]));
  var a = plant(h, tower, "blub3", tower.x + 500, tower.y);
  plant(h, tower, "blub3", tower.x + 560, tower.y);
  plant(h, tower, "blub3", tower.x + 620, tower.y);

  t.eq(tower.blubCount(), 3, "three standing");
  t.eq(tower.blubHpTotal(), 60, "sixty charges pooled");
  t.near(tower.swarmBonusFor(a), 0.10, 1e-9, "and two others buffing each one");

  // Sold through its own panel's button, which is the only way a player
  // destroys one. It was leaving `towers` -- so it could not shoot or be
  // clicked -- while still counting in every one of these numbers.
  h.run("sellTower(towers.filter(function (x) { return x.isSummon; })[0])");

  t.eq(tower.blubCount(), 2, "two standing");
  t.eq(tower.blubHpTotal(), 40, "forty charges pooled");
  t.near(tower.swarmBonusFor(tower.livingBlubs()[0]), 0.05, 1e-9,
    "and only one other buffing");

  // And it is gone from the tower's own list on the next step, not merely
  // filtered out of every reader for ever.
  h.step(1 / 60);
  t.eq(tower.blubs.length, 2, "pruned from the fleet list");

  // A Coagulation now pools what is actually there.
  tower.applyUpgrade("A3");
  tower.applyUpgrade("A4");
  tower.applyUpgrade("A5");
  tower.coagulate();
  t.eq(tower.monster.currentHp, 40, "the merge counts the survivors only");
});

test("28b  a monster blub is selectable and sellable exactly like the rest", function (t) {
  var h = boot();
  var tower = summoner(h, FULL_A);
  var blub = plant(h, tower, "blub3", tower.x + 500, tower.y);
  blub.maxHp = 7777;
  blub.currentHp = 7777;
  tower.coagulate();

  var monster = tower.monster;
  // It stands ON its tower, so the click has to resolve to the monster rather
  // than to the thing underneath it.
  t.eq(h.run("towerAt(" + tower.x + ", " + tower.y + ")") === monster, true,
    "clicking the fused pair opens the monster");

  h.game.inspected = monster;
  var L = h.run("inspectionLayout(inspected)");
  t.ok(L.h > 0, "its panel lays out");
  t.eq(h.game.sellValue(monster), 0, "and it sells for nothing");

  h.click(L.sell.x + L.sell.w / 2, L.sell.y + L.sell.h / 2);
  t.eq(h.game.towers.indexOf(monster), -1, "destroyed on the spot");
});


group("the blub rail");

test("one grey box per summon line, beside the panel and never over it", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4"]);
  h.game.inspected = tower;

  var L = h.run("inspectionLayout(inspected)");
  t.eq(L.rail.length, 3, "one box per active line");
  t.deep(L.rail.map(function (b) { return b.line.lineId; }), ["main", "mini", "heavy"],
    "in line order");
  t.deep(L.rail.map(function (b) { return b.line.name; }),
    ["Blub III", "Mini Blub II", "Hungry Blub"], "named by their unit");

  L.rail.forEach(function (box, i) {
    t.ok(box.x >= 12 && box.x + box.w <= h.game.VIEW_WIDTH - 12,
      "box " + i + " is on the canvas");
    t.ok(box.y >= 12 && box.y + box.h <= h.game.BAR_Y,
      "box " + i + " clears the build bar");
    // Beside the panel, not on top of it.
    t.ok(box.x + box.w <= L.x || box.x >= L.x + L.w,
      "box " + i + " does not overlap the panel");
    if (i > 0) t.ok(box.y > L.rail[i - 1].y, "box " + i + " is below the one before");
  });

  // A base tower has one line, so one box.
  var h2 = boot();
  var plain = summoner(h2);
  h2.game.inspected = plain;
  t.eq(h2.run("inspectionLayout(inspected)").rail.length, 1, "a base tower shows one");
});

test("the box fills as the cycle runs and is full when the blub arrives", function (t) {
  var h = boot();
  var tower = summoner(h);          // one line, Blub I, every 20 s
  h.game.inspected = tower;

  function fill() {
    return h.run("inspectionLayout(inspected)").rail[0].line.progress;
  }

  t.eq(fill(), 0, "empty at the start of a cycle");
  h.step(5);
  t.near(fill(), 0.25, 0.02, "a quarter of the way");
  h.step(5);
  t.near(fill(), 0.5, 0.02, "halfway");
  h.step(9.9);
  t.ok(fill() > 0.99, "all but full just before it lands");

  var before = blubsOf(h).length;
  h.step(0.2);
  t.eq(blubsOf(h).length, before + 1, "and that is the frame it lands on");
  t.ok(fill() < 0.05, "then the bar starts again");

  // A stopped line HOLDS its bar rather than emptying it, which is the honest
  // picture of what the toggle does to the clock.
  h.step(5);
  var held = fill();
  tower.toggleLine("main");
  h.step(6);
  t.near(fill(), held, 1e-9, "a stopped line's bar does not move");
  tower.toggleLine("main");
  h.step(1);
  t.ok(fill() > held, "and picks up where it left off when restarted");
});

test("a box is lit while it produces and dims when clicked, from A3 on", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4"]);
  h.game.inspected = tower;

  var box = h.run("inspectionLayout(inspected)").rail[1];       // Mini Blub II
  t.eq(box.line.name, "Mini Blub II", "the middle box");
  t.ok(box.line.on, "lit: it is producing");
  t.ok(box.line.toggleable, "and A3 has bought the switches");

  // ONE CLICK, ONE MEANING. The box IS the switch (2026-08-10) -- it used to
  // open a second panel view with another switch inside it, which the owner
  // reported as "an unknown behavior".
  h.click(box.x + box.w / 2, box.y + box.h / 2);
  t.notOk(tower.lineIsEnabled("mini"), "clicking it stopped that line");
  t.notOk(h.run("inspectionLayout(inspected)").rail[1].line.on, "and the box dims");
  t.ok(tower.lineIsEnabled("main") && tower.lineIsEnabled("heavy"),
    "the other lines are untouched");

  // Nothing new of that type arrives while it is dim. Sixteen seconds, so the
  // 15 s main line has time to prove it is still running.
  var before = blubsOf(h).filter(function (b) { return b.unitId === "mini2"; }).length;
  h.step(16);
  t.eq(blubsOf(h).filter(function (b) { return b.unitId === "mini2"; }).length, before,
    "a dimmed line produces nothing");
  t.ok(blubsOf(h).filter(function (b) { return b.unitId === "blub3"; }).length > 0,
    "while the lit ones carry on");

  // And clicking it again lights it back up.
  h.click(box.x + box.w / 2, box.y + box.h / 2);
  t.ok(tower.lineIsEnabled("mini"), "a second click starts it again");
  t.ok(h.run("inspectionLayout(inspected)").rail[1].line.on, "and the box lights");
});

test("the panel keeps describing the TOWER whatever the rail is doing", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4"]);
  h.game.inspected = tower;

  function rowNames() {
    return tower.statLines().map(function (r) { return r[0]; });
  }
  function actionIds() {
    return tower.panelActions().map(function (a) { return a.id; });
  }

  t.ok(rowNames().indexOf("Blubs") !== -1, "the tower's fleet row is there");
  t.deep(actionIds(), ["upgradeA", "upgradeB"], "and its own two buttons");

  var box = h.run("inspectionLayout(inspected)").rail[0];
  h.click(box.x + box.w / 2, box.y + box.h / 2);

  t.ok(rowNames().indexOf("Blubs") !== -1, "still the tower after a rail click");
  t.deep(actionIds(), ["upgradeA", "upgradeB"], "and still its own two buttons");
});

test("below A3 a box still counts down but refuses the click", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2"]);          // no A3: no switches
  h.game.inspected = tower;

  var box = h.run("inspectionLayout(inspected)").rail[0];
  t.ok(box.line.on, "it is producing");
  t.notOk(box.line.toggleable, "but there is no switch yet");

  h.click(box.x + box.w / 2, box.y + box.h / 2);
  t.ok(tower.lineIsEnabled("main"), "the click changed nothing");
  t.eq(tower.clickLine("main"), "needs A3", "and it says why");

  // The countdown is still worth showing: what it makes and when.
  h.step(5);
  t.near(h.run("inspectionLayout(inspected)").rail[0].line.progress, 1 / 3, 0.02,
    "the bar runs regardless");
});

test("hovering a box explains the blub rather than clicking doing it", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4"]);
  h.game.inspected = tower;

  var box = h.run("inspectionLayout(inspected)").rail[1];       // Mini Blub II
  h.move(box.x + box.w / 2, box.y + box.h / 2);

  var card = h.run("hoveredCard(inspectionLayout(inspected))");
  t.ok(card && card.model, "hovering a box opens a card");
  t.eq(card.model.title, "Mini Blub II", "for that blub type");
  t.eq(card.model.subtitle, "producing", "with its state");

  var rows = {};
  card.model.changes.forEach(function (c) { rows[c.label] = c.to; });
  t.eq(rows.Damage, "3", "its base damage");
  t.eq(rows["Attack speed"], "3.00/s", "its rate");
  t.eq(rows.Charges, "12", "its charges");
  t.eq(rows.Range, "115 u.l.", "its range");
  t.eq(rows.Footprint, "10 u.l.", "its footprint");
  t.eq(rows.Every, "3.5 s", "how often one arrives");
  t.eq(rows["Lifetime dmg"], "36", "3 damage x 12 charges");
  t.ok(card.model.note.indexOf("Click to stop") === 0, "and what a click will do");
});

test("a rail click never falls through and builds a tower", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4"]);
  h.game.inspected = tower;

  var box = h.run("inspectionLayout(inspected)").rail[0];
  h.armSlot(h.slotOf(h.game.BlubTower));
  var before = h.game.towers.length;
  h.click(box.x + box.w / 2, box.y + box.h / 2);
  t.eq(h.game.towers.length, before, "no tower was placed under the rail");
  t.notOk(tower.lineIsEnabled("main"), "the click switched the box instead");
});

test("a box reports how many of its type are standing", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2"]);
  h.game.inspected = tower;
  t.eq(h.run("inspectionLayout(inspected)").rail[0].line.alive, 0, "none yet");

  plant(h, tower, "blub3", tower.x + 500, tower.y);
  plant(h, tower, "blub3", tower.x + 560, tower.y);
  t.eq(h.run("inspectionLayout(inspected)").rail[0].line.alive, 2, "two now");
});

test("a fused tower has no rail, and gets it back when the monster dies", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4", "A5"]);
  h.game.inspected = tower;
  t.eq(h.run("inspectionLayout(inspected)").rail.length, 3, "three lines running");

  var blub = plant(h, tower, "blub3", tower.x + 500, tower.y);
  blub.maxHp = 5000;
  blub.currentHp = 5000;
  tower.coagulate();

  t.eq(h.run("inspectionLayout(inspected)").rail.length, 0,
    "a fused tower is producing nothing, so it shows nothing");
  t.ok(tower.statLines().length > 0, "the panel still lays out");
  t.ok(h.run("inspectionLayout(inspected)").h > 0, "including its geometry");

  tower.monster.currentHp = 0;
  h.step(0.1);
  t.eq(h.run("inspectionLayout(inspected)").rail.length, 3, "the rail returns with it");
});


group("panel keyboard shortcuts");

test("X sells the inspected tower, and only while a panel is open", function (t) {
  var h = boot();
  var tower = summoner(h);
  var before = h.game.towers.length;

  // No panel: X is an ordinary letter and does nothing.
  h.key("x");
  t.eq(h.game.towers.length, before, "nothing sold with no panel open");

  h.game.inspected = tower;
  var cashBefore = h.game.cash;
  h.key("x");
  t.eq(h.game.towers.length, before - 1, "the tower is gone");
  t.eq(h.game.inspected, null, "and its panel closed");
  t.eq(h.game.cash - cashBefore, Math.ceil(450 * 0.5), "half of what it cost");
});

test("X destroys a blub for nothing, exactly as its Sell button does", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2"]);
  var blub = plant(h, tower, "blub3", tower.x + 300, tower.y + 40);
  h.game.inspected = blub;

  var cashBefore = h.game.cash;
  h.key("x");
  t.eq(h.game.cash, cashBefore, "a blub refunds nothing");
  t.eq(tower.blubCount(), 0, "and leaves the fleet");
});

test("O and P buy the next tier on each path, through the button", function (t) {
  var h = boot();
  var tower = summoner(h);
  h.game.inspected = tower;

  var cashBefore = h.game.cash;
  h.key("o");
  t.deep(tower.ownedUpgradeIds(), ["A1"], "O bought A1");
  t.eq(cashBefore - h.game.cash, 550, "and charged for it");

  h.key("p");
  t.deep(tower.ownedUpgradeIds(), ["A1", "B1"], "P bought B1");

  // Case does not matter, and neither does which tower it is.
  h.key("O");
  t.deep(tower.ownedUpgradeIds(), ["A1", "A2", "B1"], "capital O works too");
});

test("a shortcut is refused wherever the button would be", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3"]);   // A3 locks path B out of B3
  h.game.inspected = tower;
  tower.applyUpgrade("B1");
  tower.applyUpgrade("B2");

  var owned = tower.ownedUpgradeIds().join(",");
  h.key("p");
  t.eq(tower.ownedUpgradeIds().join(","), owned, "P cannot buy a locked-out tier");

  // Nor an unaffordable one.
  h.run("cash = 10");
  h.key("o");
  t.eq(tower.ownedUpgradeIds().join(","), owned, "O cannot buy what is unaffordable");

  // A maxed branch swallows the press without throwing.
  h.run("cash = 1000000");
  ["A4", "A5"].forEach(function (id) { tower.applyUpgrade(id); });
  h.key("o");
  t.eq(tower.ownedUpgradeIds().indexOf("A5") >= 0, true, "path A is maxed");
  t.ok(true, "and pressing O on it does not throw");
});

test("the shortcuts work on every tower type, not just the Summoner", function (t) {
  var h = boot();
  h.game.BUILD_SLOTS.forEach(function (Type, slot) {
    if (Type === null || Type === h.game.BlubTower) return;
    var spot = legalSpot(h, slot);
    if (!spot) return;
    var tower = h.place(spot.x, spot.y, slot);
    h.game.inspected = tower;
    var before = tower.ownedUpgradeIds ? tower.ownedUpgradeIds().length : null;
    h.key("o");
    if (before !== null) {
      t.eq(tower.ownedUpgradeIds().length, before + 1,
        Type.DISPLAY_NAME + " bought a path A tier with O");
    }
    h.key("x");
    t.eq(h.game.inspected, null, Type.DISPLAY_NAME + " sold with X");
  });
});


group("the rest of the board is unchanged");

test("enemies never target a blub, but a shockwave still stuns one", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2"]);
  var blub = plant(h, tower, "blub3", tower.x + h.run("ul(50)"), tower.y);

  var enemy = h.spawnAt(400, 100, "normal");
  var aimed = { target: "highestDps", targets: 3, damage: 10, stunSeconds: 2,
    intervalSeconds: 5, windUpSeconds: 0 };
  var picked = enemy.attackCandidates(aimed, h.game.towers, null);
  t.eq(picked.filter(function (p) { return p.tower.isSummon; }).length, 0,
    "no summon is ever a candidate");

  // Its shockwave, however, reaches everything -- and takes only the stun.
  // Planted beside the enemy's own position, because a leap resolves its
  // shockwave from where it LANDS: resolveAttack advances the progress and
  // refreshes pos before it looks around, so a hand-written pos would be
  // overwritten.
  var near = plant(h, tower, "blub3", enemy.pos.x + 8, enemy.pos.y + 8);
  var hpBefore = near.currentHp;
  enemy.resolveAttack({ leap: { distanceUl: 0, radiusUl: 200 }, damage: 80,
    stunSeconds: 3, intervalSeconds: 9, windUpSeconds: 0 }, h.game.towers);
  t.ok(h.game.TowerHealth.isStunned(near), "the blub was stunned");
  t.eq(near.currentHp, hpBefore, "and took no damage from it");
  t.notOk(h.game.TowerHealth.isStunned(blub), "one out of reach was not");
});

test("a stunned blub does not fire, and does not bank the time either", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2"]);
  var pair = dummyBesideBlub(h, tower, "blub3");

  h.game.TowerHealth.stun(pair.blub, 2);
  h.step(2);
  t.eq(pair.blub.attacksMade, 0, "silent for the whole stun");

  h.step(1);
  t.ok(pair.blub.attacksMade >= 1 && pair.blub.attacksMade <= 2,
    "and it starts again at its own rate, not in a burst (" +
    pair.blub.attacksMade + ")");
});

test("a tier that shortens a cycle brings the next body closer", function (t) {
  var h = boot();
  var tower = summoner(h);
  t.eq(tower.timers.main, 20, "a base Blub I line counts 20 s");

  // A1 and A2 swap the unit for one on a shorter cycle. The RUNNING clock must
  // come down with it: left where it was, it would sit above its own new
  // maximum and the bar -- 1 - left/total -- would read empty until it caught
  // up, which is the opposite of what buying a faster tier should look like.
  tower.applyUpgrade("A1");
  t.eq(tower.timers.main, 18, "A1's Blub II cycle is 18 s, and the clock follows");
  tower.applyUpgrade("A2");
  t.eq(tower.timers.main, 15, "A2's Blub III cycle is 15 s");
  t.eq(tower.lineProgress("main"), 0, "the bar starts from empty, not from stuck");

  h.step(5);
  t.near(tower.lineProgress("main"), 1 / 3, 0.02, "and runs at the new rate");

  // Path B subtracts seconds outright, and the same rule applies.
  var h2 = boot();
  var b = summoner(h2, ["A1", "A2", "B1"]);
  b.timers.main = 15;
  b.applyUpgrade("B2");
  t.eq(b.intervalFor("blub3"), 14, "B2 takes a second off every cycle");
  t.eq(b.timers.main, 14, "and off the clock already running");
});

test("the cumulative tables match the brief", function (t) {
  var h = boot();
  var a = summoner(h, []);
  t.eq(a.maxHp, 100, "base HP");
  t.eq(a.rangeUl, 75, "base range");
  t.eq(h.game.BlubTower.COST, 450, "price");
  t.eq(a.footprintRadiusUl, 25, "footprint");

  var steps = [
    { id: "A1", hp: 125, range: 100, spent: 1000 },
    { id: "A2", hp: 200, range: 115, spent: 2100 },
    { id: "A3", hp: 300, range: 115, spent: 5600 },
    { id: "A4", hp: 550, range: 115, spent: 12100 },
    { id: "A5", hp: 5550, range: 250, spent: 52100 }
  ];
  steps.forEach(function (step) {
    a.applyUpgrade(step.id);
    t.eq(a.maxHp, step.hp, step.id + " tower HP");
    t.eq(a.rangeUl, step.range, step.id + " tower range");
    t.eq(a.totalSpent, step.spent, step.id + " cumulative price");
  });

  var h2 = boot();
  var b = summoner(h2, ["A1", "A2", "B1", "B2", "B3", "B4", "B5"]);
  t.eq(b.summonDamageBonus, 1, "B1 gives every summon +1 damage");
  t.eq(b.summonHpBonus, 1, "B2 gives every summon +1 charge");
  t.eq(b.intervalDelta, -5, "B2/B4/B5 take five seconds off every cycle");
  t.eq(b.rangeUl, 150, "full B range with the A1/A2 gate bought");
  t.eq(b.lineUnits().main, "mecha2", "the main line ends at the MK2");
  t.eq(b.lineUnits().heavy, "superb", "and B5 adds the SuperBlub");
  t.eq(b.intervalFor("mecha2"), 25, "the MK2 arrives every 25 s");
  t.eq(b.intervalFor("superb"), 95, "and the SuperBlub every 95 s");
});

test("no interval can ever reach zero", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "A3", "A4"]);
  // Far past anything the table can buy, to prove the floor is a floor rather
  // than an arithmetic accident.
  tower.intervalDelta = -1000;
  t.eq(tower.intervalFor("mini2"), h.game.BlubTower.MIN_INTERVAL_SECONDS,
    "clamped, not negative");
  h.step(5);
  t.ok(blubsOf(h).length > 0, "and it still summons rather than hanging");
});

test("the Mechablub MK2 detonates where it dies", function (t) {
  var h = boot();
  var tower = summoner(h, ["A1", "A2", "B1", "B2", "B3", "B4", "B5"]);
  var pair = dummyBesideBlub(h, tower, "mecha2", 1000000);

  // 81 charges (80 + B2) at 2/s is about 40 s.
  h.step(45);
  t.ok(pair.blub.isDestroyed(), "it is spent");
  t.ok(pair.blub.blasted, "and it went off");

  // 81 attacks at 101 damage, plus the fixed 250 of the detonation.
  t.near(tower.damageDealt, 81 * 101 + 250, 1, "ordinary damage plus a fixed 250");
});

runner.run();
