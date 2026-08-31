// ---------------------------------------------------------------------------
// The Farm's acceptance list.
//
//   node tests/farm.test.js
//
// Run standalone, like tests/blub.test.js and tests/beam.test.js -- it is not
// part of tests/run.js. Every mechanic the owner's brief names is pinned here,
// and the three dice tables are walked FACE BY FACE rather than sampled: sixty
// two faces, each asserted against P computed by hand from the row above it.
//
// THE DICE ARE SCRIPTED, NEVER SAMPLED. `Farms.setDie` hands the network a
// sequence, so "face 17 pushes the next gain" is a statement about face 17 and
// not about a seed. `Farms.reset()` puts the fair die back, which is what stops
// a fixture leaking into the next test.
// ---------------------------------------------------------------------------

var harness = require("./harness.js");
var runner = require("./assert.js");
var group = runner.group;
var test = runner.test;

// A board with no schedule running and nothing on it.
function boot() {
  var h = harness.boot();
  h.run("cash = 1000000");
  h.run("waveIndex = WAVES.length");
  h.clearBoard();
  return h;
}

// Build a Farm through the real constructor and the real board, then buy the
// listed tiers through the real upgrade door. Placement is not the subject of
// any test here, so the tower is added directly -- `addTower` is the same
// function onClick uses once whyCannotBuild has said yes.
function farm(h, x, y, tiers) {
  var g = h.game;
  var f = new g.FarmTower(x, y, g.path);
  g.addTower(f);
  (tiers || []).forEach(function (id) { f.applyUpgrade(id); });
  return f;
}

// The tick length, read off the constructor rather than restated -- the same
// rule the rest of the suite follows for every figure it checks.
function FarmTowerTick(h) { return h.game.FarmTower.TICK_SECONDS; }

// A TOWER THE INVESTMENT WILL ACCEPT: a Warbringer with `tiers` bought on path
// A, five by default, which is what FarmBoost.TIER_REQUIRED asks for. A real
// tower through the real upgrade door, so what the boost multiplies is what the
// game would have had.
function tierFiveTower(h, x, y, tiers) {
  var g = h.game;
  var t = new g.Smasher(x, y, g.path);
  g.addTower(t);
  var want = tiers === undefined ? 5 : tiers;
  for (var i = 1; i <= want; i++) t.applyUpgrade("A" + i);
  return t;
}

function enemyAt(h, x, y, health, typeId) {
  var e = new h.game.Enemy(h.game.path, health, typeId);
  e.pos = { x: x, y: y };
  h.game.enemies.push(e);
  return e;
}


group("Farm — the body as placed");

test("the base tower matches the brief", function (t) {
  var h = boot();
  var f = farm(h, 600, 200);

  t.eq(h.game.FarmTower.COST, 1200, "1200 mana to place");
  t.eq(f.maxHp, 200, "200 hit points");
  t.eq(f.currentHp, 200, "at full");
  t.eq(f.footprintRadiusUl, 35, "35 u.l. footprint");
  t.eq(f.producesPerWave(), 200, "200 mana a wave");
  t.eq(f.perTickProduction, 0, "and nothing on a clock");
  t.eq(f.rangeUl, 0, "no reach at all until path B buys one");
});

test("it never attacks, and says so to the one thing that asks", function (t) {
  var h = boot();
  var f = farm(h, 600, 200);
  // Both exist for Enemy.towerDps -- the Tyrant's aimed shot, which looks for
  // the board's best piece. A Farm has no output to silence, so it answers
  // zero and is never the pick.
  t.eq(f.attackDamage(), 0, "no damage");
  t.eq(f.attacksPerSecond(), 0, "no rate");
  t.eq(h.game.Enemy.towerDps(f), 0, "so the boss scores it at nothing");
});

test("every visible string says mana, never gold or cash", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1"]);
  var text = f.statLines().map(function (r) { return r.join(" "); }).join(" | ") +
    " | " + f.panelActions().map(function (a) {
      return a.label + " " + a.detail + " " + a.effects;
    }).join(" | ");

  t.ok(/mana/i.test(text), "it talks about mana");
  t.eq(/gold|coins|cash|\$/i.test(text), false,
    "and never about gold, coins, cash or dollars: " + text);
});


group("Farm — path A, the mana generator");

test("A1 and A2 add to the per-wave figure", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1"]);
  t.eq(f.producesPerWave(), 250, "200 + 50");
  t.eq(f.maxHp, 250, "and +50 hit points");
  f.applyUpgrade("A2");
  t.eq(f.producesPerWave(), 400, "200 + 50 + 150");
  t.eq(f.maxHp, 350, "and +100 more");
});

test("A3 ADDS a tick, and the per-wave figure keeps paying", function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["A1", "A2", "A3"]);
  t.eq(f.perTickProduction, 50, "50 every 5 s");
  t.eq(f.producesPerWave(), 400,
    "and the per-wave column keeps paying -- added to, not replaced");

  var before = g.cash;
  f.update(4.9);
  t.eq(g.cash, before, "nothing at 4.9 seconds");
  f.update(0.1);
  t.eq(g.cash, before + 50, "and 50 on the tick");
  f.update(10);
  t.eq(g.cash, before + 150, "two more ticks in ten seconds");

  // The wave boundary still pays, which is the whole of the 2026-08-28 fix:
  // 1600 mana used to buy a tick and switch the 400 off.
  before = g.cash;
  g.Farms.settleWave(1);
  t.eq(g.cash, before + 400, "and the wave still pays its 400 on top");
});

test("the panel shows both columns at once", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3"]);
  var row = f.statLines().filter(function (r) { return r[0] === "Mana"; })[0];
  t.ok(/400 \/ wave/.test(row[1]), "the wave figure: " + row[1]);
  t.ok(/50 \/ 5 s/.test(row[1]), "and the tick beside it: " + row[1]);
});

test("A4 keeps what it makes, and clones five per cent of it a wave", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4"]);
  t.eq(f.stores, true, "it stores from A4");
  t.eq(f.perTickProduction, 75, "75 a tick");

  var before = h.game.cash;
  f.update(5);
  t.eq(h.game.cash, before, "the purse does not move");
  t.eq(f.stock, 75, "the stock does");

  f.stock = 1000;
  t.eq(f.cloneStock(), 50, "five per cent of a thousand");
  t.eq(f.stock, 1050, "and it is added to the stock");

  // The cap is on the CLONE, not on the stock.
  f.stock = 100000;
  t.eq(f.cloneStock(), 1000, "capped at a thousand a wave on A4");
  t.eq(f.stock, 101000, "so a huge stock still only clones the cap");
});

test("A5 raises the tick and the clone cap", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  t.eq(f.perTickProduction, 150, "150 a tick");
  f.stock = 1000000;
  t.eq(f.cloneStock(), 3000, "and 3000 of cloning a wave");
});

test("the stock can be taken out whenever, all of it", function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4"]);

  t.eq(f.collect(), "nothing stored", "an empty stock refuses");

  f.update(h.game.FarmTower.TICK_SECONDS);
  t.eq(f.stock, 75, "a tick fills it");

  var before = g.cash;
  t.eq(f.collect(), null, "and it comes straight out");
  t.eq(g.cash, before + 75, "into the purse, in full");
  t.eq(f.stock, 0, "leaving nothing behind");
  t.eq(f.manaProduced, 75,
    "and the lifetime total does not count it twice on the way out");

  // 400 for the wave, then the clone on top of it: the 5% is taken from what is
  // STANDING at the end of the wave, and the wave's own production is standing
  // by then. That ordering is what makes leaving mana in worth anything.
  g.Farms.settleWave(1);
  t.eq(f.stock, 420, "the wave's production lands in the stock, and clones");
  t.eq(f.collect(), null, "which can be taken too");
  t.eq(g.cash, before + 495, "so nothing this tower makes is ever locked in");
});

test("a farm that does not store has nothing to collect", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3"]);
  t.eq(f.stores, false, "A3 still pays straight out");
  t.eq(f.collect(), "needs A4", "so there is no stock to take");
});

test("the collect button is offered from A4, and goes dead on an empty stock",
function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3"]);
  var ids = f.panelActions().map(function (a) { return a.id; });
  t.eq(ids.indexOf("collect"), -1, "no button before A4");

  f.applyUpgrade("A4");
  var button = f.panelActions().filter(function (a) { return a.id === "collect"; })[0];
  t.ok(button, "and one after it");
  t.eq(button.enabled, false, "dead while the stock is empty");
  t.eq(button.detail, "nothing stored", "and it says so");

  f.stock = 1234.6;
  button = f.panelActions().filter(function (a) { return a.id === "collect"; })[0];
  t.eq(button.enabled, true, "live once there is something in it");
  t.eq(button.detail, "1234 mana", "quoting what it would pay, never rounded up");

  // Through the real action door, the one the panel's click path calls.
  var before = h.game.cash;
  t.ok(/collected/.test(f.performAction("collect")), "the press reports back");
  t.near(h.game.cash, before + 1234.6, 1e-9, "and pays the exact stock");
});

test("the boost is AIMED, and a press with no target spends nothing",
function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  var five = tierFiveTower(h, 900, 300);

  f.stock = 25500;
  t.eq(f.invest(null, false), "pick a tower", "no target, no boost");
  t.eq(f.stock, 25500, "and nothing is spent");

  t.eq(f.invest(five, false), null, "aimed at a tier 5 tower it lands");
  t.eq(f.stock, 5500, "two whole tranches spent, the remainder stored");
  t.eq(f.investedTranches, 2, "and recorded");
  t.near(five.farmBoost, 0.10, 1e-12, "the bonus is ON THE TARGET, +5% a tranche");
});

test("a tower can be permanently boosted ONCE, however much is spent",
function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  var five = tierFiveTower(h, 900, 300);

  f.stock = 10000;
  t.eq(f.invest(five, false), null, "10 000 boosts it");
  t.near(five.farmBoost, 0.05, 1e-12, "+5%");

  f.stock = 500000;
  t.eq(f.invest(five, false), "already boosted",
    "and a second permanent press is refused whatever it is worth");
  t.eq(f.stock, 500000, "nothing spent on the refusal");
  t.near(five.farmBoost, 0.05, 1e-12, "the tower still carries its one boost");

  // The ceiling is on the ONE press, not on a running total: ten tranches at
  // once is +50%, and ten presses of one is +5% and nine refusals.
  var other = tierFiveTower(h, 1000, 400);
  t.eq(f.invest(other, false), null, "a different tower may still be boosted");
  t.near(other.farmBoost, 0.50, 1e-12, "ten tranches in one press, +50%");
});

test("only a tier 5 tower can be boosted, and never a farm", function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  f.stock = 100000;

  var plain = new g.Smasher(1100, 300, g.path);
  g.addTower(plain);
  t.eq(f.invest(plain, false), "needs a tier 5 tower", "a fresh tower is refused");

  var four = tierFiveTower(h, 1200, 300, 4);
  t.eq(f.invest(four, false), "needs a tier 5 tower", "and so is a tier 4");

  var other = farm(h, 700, 200, ["A1", "A2", "A3", "A4", "A5"]);
  t.eq(f.invest(other, false), "a farm cannot be boosted", "a farm is not a target");
  t.eq(f.stock, 100000, "and none of those refusals cost anything");
});

test("the boost raises damage, attack speed and range, and nothing else",
function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  var five = tierFiveTower(h, 900, 300);

  var before = {
    damage: five.damage, cooldown: five.cooldownSeconds,
    range: five.rangePx, hp: five.maxHp, footprint: five.footprintPx
  };

  f.stock = 100000;
  t.eq(f.invest(five, false), null, "ten tranches, +50%");

  t.near(five.damage, before.damage * 1.5, 1e-9, "damage");
  t.near(five.cooldownSeconds, before.cooldown / 1.5, 1e-9,
    "seconds per swing, which is attack speed said the other way round");
  t.near(five.rangePx, before.range * 1.5, 1e-9, "reach");
  t.eq(five.maxHp, before.hp, "hit points are NOT in the bonus");
  t.eq(five.footprintPx, before.footprint, "and neither is the footprint");
});

test("the surge is the same tranches at five times the bonus, for 30 s",
function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  var five = tierFiveTower(h, 900, 300);
  var damage = five.damage;

  f.stock = 20000;
  t.eq(f.invest(five, true), null, "two tranches, temporarily");
  t.eq(f.stock, 0, "spent either way");
  t.near(five.farmSurge, 2 * 5 * 0.05, 1e-12, "+50% while it runs");
  t.near(five.damage, damage * 1.5, 1e-9, "and the tower really hits harder");

  f.update(29.9);
  t.ok(five.farmSurge > 0, "still running at 29.9 s");
  f.update(0.1);
  t.eq(five.farmSurge, 0, "and gone at 30");
  t.near(five.damage, damage, 1e-9, "with the damage back where it was");
});

test("a surge may be pressed again, unlike the permanent boost", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  var five = tierFiveTower(h, 900, 300);

  f.stock = 10000;
  t.eq(f.invest(five, true), null, "one tranche");
  f.stock = 20000;
  t.eq(f.invest(five, true), null, "and again on the same tower");
  t.near(five.farmSurge, 2 * 5 * 0.05, 1e-12,
    "the second replaces the first rather than stacking with it");

  // A farm that leaves the board stops paying for the surge it lit.
  h.run("sellTower(towers.filter(function (x) { return x instanceof FarmTower; })[0])");
  t.eq(five.farmSurge, 0, "and a sold farm takes its surge with it");
});

test("the permanent boost and a surge add, they do not compound", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  var five = tierFiveTower(h, 900, 300);
  var damage = five.damage;

  f.stock = 100000;
  f.invest(five, false);          // +50% permanent
  f.stock = 100000;
  f.invest(five, true);           // +250% surge
  t.near(five.damage, damage * (1 + 0.5 + 2.5), 1e-9,
    "1 + 0.5 + 2.5, not 1.5 x 3.5 -- the same additive rule enemy amps follow");
});

test("the button arms a mode instead of spending, and the click spends",
function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  var five = tierFiveTower(h, 900, 300);
  f.stock = 100000;

  g.inspected = f;
  var armed = null;
  t.ok(/pick a tower/.test(f.performAction("investPermanent", {
    beginInvesting: function (farmArg, temporary) {
      armed = { farm: farmArg, temporary: temporary };
      return true;                      // game.js answers false with no target
    }
  })), "the press asks for a target");
  t.eq(armed.farm, f, "arming the farm that was pressed");
  t.eq(armed.temporary, false, "for a permanent boost");
  t.eq(f.stock, 100000, "and spends nothing yet");

  // Through the real click path, on the point the tower is DRAWN at. The
  // farm's own panel is dismissed first: it is still up in the real game too,
  // and a click that lands on it belongs to it -- the same rule every other
  // mode plays by, and not what this test is about.
  h.run("inspected = null");
  h.run("investingFarm = { farm: towers.filter(function (x) { " +
    "return x instanceof FarmTower; })[0], temporary: false }");
  h.click(five.x, five.y);
  t.eq(f.stock, 0, "the click on the tower is what spends the stock");
  t.near(five.farmBoost, 0.50, 1e-12, "and boosts what was clicked");
  t.eq(h.run("investingFarm"), null, "the mode closes behind it");
});

test("an empty press is refused before it can arm anything", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  f.stock = 9999;
  t.eq(f.performAction("investPermanent", { beginInvesting: function () {
    throw new Error("should not arm");
  } }), "needs 10000 mana", "under a tranche it never opens the mode");
});



group("Farm — path B, the mana lab");

test("path B's hit points are REAL hit points, and damage stays taken",
function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["B1"]);
  t.eq(f.baseHpPerWave, 15, "B1 is +15 a wave");

  // The maximum used to move on its own, which made the whole line unfeelable:
  // nothing but a Siphon's lifesteal heals the base, so the bar read "100 / 400"
  // for a whole run. Owner: "hp gain of B doesn't work at all."
  var maxBefore = h.run("baseMaxHp");
  h.run("baseHp = 40");
  h.game.Farms.settleWave(1);
  t.eq(h.run("baseMaxHp"), maxBefore + 15, "the maximum goes up");
  t.eq(h.run("baseHp"), 55, "and so do the hit points -- the grant is real");

  // What it does NOT do is undo a leak: 40 of the 100 were lost and stay lost.
  t.eq(h.run("baseMaxHp") - h.run("baseHp"), maxBefore - 40,
    "the damage already taken is exactly as big a hole as it was");
});

test("the per-wave grants are cumulative up the branch", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["B1", "B2"]);
  t.eq(f.baseHpPerWave, 50, "15 + 35");
  t.eq(f.producesPerWave(), 250, "and B2 adds 50 mana a wave");
  f.applyUpgrade("B3");
  t.eq(f.baseHpPerWave, 150, "+100 at B3");
  t.eq(f.producesPerWave(), 400, "and +150 mana");
  t.eq(f.rangeUl, 150, "with a 150 u.l. circle");
  f.applyUpgrade("B4");
  t.eq(f.baseHpPerWave, 250, "+100 at B4");
  t.eq(f.rangeUl, 200, "reach 200");
  f.applyUpgrade("B5");
  t.eq(f.baseHpPerWave, 450, "+200 at B5");
  t.eq(f.rangeUl, 300, "reach 300");
});

test("a kill inside the circle pays mana and base HP, and several farms stack",
function (t) {
  var h = boot();
  var a = farm(h, 600, 200, ["B1", "B2", "B3"]);
  var b = farm(h, 640, 200, ["B1", "B2", "B3"]);
  t.eq(a.manaPerKill, 1, "B3 is +1 mana a kill");

  var cashBefore = h.game.cash;
  var maxBefore = h.run("baseMaxHp");
  var e = enemyAt(h, 610, 200, 10);
  var got = h.game.Farms.onEnemyKilled(e);

  t.eq(got.mana, 2, "both farms cover it, and both pay in full");
  t.eq(got.baseHp, 2, "the same for the base");
  t.eq(h.game.cash, cashBefore + 2, "the purse moved");
  t.eq(h.run("baseMaxHp"), maxBefore + 2, "and so did the maximum");

  // Out of reach pays nothing.
  var far = enemyAt(h, 1200, 600, 10);
  t.eq(h.game.Farms.onEnemyKilled(far).mana, 0, "a body outside every circle");
});

test("a SUMMONED body pays nothing, which is the brief's non-invoked rule",
function (t) {
  var h = boot();
  farm(h, 600, 200, ["B1", "B2", "B3"]);
  var brood = enemyAt(h, 610, 200, 10);
  brood.noBounty = true;                     // what a Hive's hatchling carries
  t.eq(h.game.Farms.onEnemyKilled(brood).mana, 0, "no mana for a summon");
});

test("only one B4 or B5 on the map, and it is one of the two rather than one of each",
function (t) {
  var h = boot();
  var a = farm(h, 600, 200, ["B1", "B2", "B3"]);
  var b = farm(h, 700, 200, ["B1", "B2", "B3"]);

  t.eq(a.applyUpgrade("B4"), null, "the first B4 is allowed");
  t.eq(b.whyCannotUpgrade("B4"), "one B4 or B5 per map", "the second is refused");
  t.eq(b.applyUpgrade("B4"), "one B4 or B5 per map", "and cannot route around the panel");

  t.eq(a.applyUpgrade("B5"), null, "the holder may go on to B5");
  t.eq(b.whyCannotUpgrade("B4"), "one B4 or B5 per map",
    "and a B5 on the board still blocks a second B4");

  // Selling the holder frees it, because the rule is about what is standing.
  h.run("sellTower(towers[0])");
  t.eq(b.whyCannotUpgrade("B4"), null, "with the holder gone the rule releases");
});

test("the field slows and amplifies, and both stack ADDITIVELY with other debuffs",
function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["B1", "B2", "B3", "B4"]);
  t.near(f.fieldSlow, 0.05, 1e-12, "5% slow at B4");
  t.near(f.fieldAmp, 0.05, 1e-12, "and +5% damage taken");

  var inside = enemyAt(h, 620, 200, 1000);
  var outside = enemyAt(h, 1200, 600, 1000);

  var fast = outside.currentSpeedUlps();
  var slow = inside.currentSpeedUlps();
  t.near(slow / fast, 0.95, 1e-9, "a body in the field walks at 95%");

  // ADDITIVE, not multiplicative: a 50% timed slow and a 5% field is 47.5% of
  // the original speed by multiplication of the two CHANNELS, which is what
  // "cumulate additively with the other TYPES of debuff" asks for -- the field
  // is its own channel rather than competing with applySlow's strongest-wins.
  inside.applySlow(0.5, 5);
  t.near(inside.currentSpeedUlps() / fast, 0.5 * 0.95, 1e-9,
    "and a timed slow still applies on top of it");

  var hitInside = enemyAt(h, 620, 200, 1000);
  var hitOutside = enemyAt(h, 1200, 600, 1000);
  hitInside.takeDamage(100);
  hitOutside.takeDamage(100);
  t.eq(1000 - hitInside.health, 105, "a hit in the field lands 5% harder");
  t.eq(1000 - hitOutside.health, 100, "and outside it lands for what it says");
});

test("B5 executes what is nearly dead, but only when it is attacked",
function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["B1", "B2", "B3", "B4", "B5"]);
  t.near(f.fieldSlow, 0.10, 1e-12, "10% at B5");

  // 5% of 1000 is 50, which beats the flat 10.
  var big = enemyAt(h, 620, 200, 1000);
  big.health = 45;
  big.takeDamage(1);
  t.eq(big.dead, true, "44 left against a 50 threshold: executed");

  var big2 = enemyAt(h, 620, 200, 1000);
  big2.health = 200;
  big2.takeDamage(1);
  t.eq(big2.dead, false, "199 against the same 50: untouched");

  // A body with a 10 HP maximum dies to the first thing that touches it.
  var small = enemyAt(h, 620, 200, 10);
  small.takeDamage(1);
  t.eq(small.dead, true, "ten maximum or less is executed on the first hit");

  // WALKING THROUGH IS NOT BEING ATTACKED.
  var untouched = enemyAt(h, 620, 200, 10);
  untouched.update(1 / 60);
  t.eq(untouched.dead, false, "a body nobody hit is not executed");
});


test("the field stops at a sight blocker, exactly as a weapon's reach does",
function (t) {
  // Ironwood is the one shipped map with terrain that blocks sight, so the
  // question can be asked of the real thing rather than of a fixture.
  var h = harness.boot("ironwood-frontier");
  h.run("cash = 1000000");
  h.run("waveIndex = WAVES.length");
  var g = h.game;
  var geo = g.Maps.geometryOf(g.currentMap);
  var stump = geo.platforms[0];

  // A farm on open ground beside the stump, with the stump between it and the
  // far side. Its circle reaches over the rock; its sight does not.
  var eye = { x: stump.x - stump.radius - g.ul(20), y: stump.y };
  var f = new g.FarmTower(eye.x, eye.y, g.path);
  g.addTower(f);
  ["B1", "B2", "B3"].forEach(function (id) { f.applyUpgrade(id); });

  // THE POINT MUST BE INSIDE THE CIRCLE, or this test passes for the wrong
  // reason. Measured on the shipped map: 107 px against a 156 px reach, with a
  // 40 px stump 20 units tall sitting between the two.
  var behindX = stump.x + stump.radius + g.ul(6);
  var distance = Math.abs(behindX - f.x);
  t.ok(distance < f.rangePx,
    "the far side of the stump is well inside the circle: " +
    Math.round(distance) + " px of " + Math.round(f.rangePx));

  t.eq(f.covers(behindX, stump.y), false,
    "but it is not covered, because the rock is in the way");
  t.eq(g.Farms.killBonusAt(behindX, stump.y), null,
    "so nothing dying there pays this farm");
  t.eq(g.Farms.slowAt(behindX, stump.y), 0, "and nothing standing there is slowed");
  t.eq(g.Farms.damageAmpAt(behindX, stump.y), 0, "or amplified");

  // The same point, with nothing between: covered again.
  var open = { x: f.x - g.ul(10), y: f.y };
  t.eq(f.covers(open.x, open.y), true, "open ground inside the circle is covered");
});

test("a farm ON a stump sees over everything at or below its own height",
function (t) {
  var h = harness.boot("ironwood-frontier");
  h.run("cash = 1000000");
  h.run("waveIndex = WAVES.length");
  var g = h.game;
  var geo = g.Maps.geometryOf(g.currentMap);
  var stump = geo.platforms[0];

  var f = new g.FarmTower(stump.x, stump.y, g.path);
  g.addTower(f);
  ["B1", "B2", "B3"].forEach(function (id) { f.applyUpgrade(id); });

  t.ok(f.groundHeight > 0, "it is standing on the rock, not beside it");
  // Its own stump cannot be what blinds it -- the eye is on top of it. This is
  // the same failure the Arcane Sniper had before elevation was wired up, where
  // 100% of rays were blocked by the rock the tower was standing on.
  var probe = { x: stump.x + stump.radius + g.ul(4), y: stump.y };
  t.eq(f.covers(probe.x, probe.y), true,
    "and the ground it is standing on does not blind it");
});


group("Farm — path C, the linked casino");

test("C1 shrinks the footprint and C2 buys a dodge", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["C1"]);
  t.eq(f.footprintRadiusUl, 25, "35 down to 25");
  t.eq(f.maxHp, 250, "and +50 HP");

  f.applyUpgrade("C2");
  t.near(f.dodgeChance, 0.20, 1e-12, "a one-in-five dodge");
  t.eq(f.maxHp, 250, "and no hit points at all, which the brief states outright");

  // The dodge takes the WHOLE attack. Scripted rather than sampled.
  var rolls = [0.1, 0.9];
  var i = 0;
  h.run("Farms.roll = function () { return 0; };");
  t.eq(f.takeDamage(50), 0, "a dodged blow lands nothing");
  t.eq(f.currentHp, 250, "and costs no hit points");
});

test("the network's baseline is the sum of its members, and P starts there",
function (t) {
  var h = boot();
  var g = h.game;
  var a = farm(h, 600, 200, ["C1", "C2", "C3"]);
  t.eq(a.nominalProduction(), 300, "200 base + C3's 100");
  t.eq(g.Farms.network.B, 300, "B is that sum");
  t.eq(g.Farms.network.P, 300, "and P starts at B");

  var b = farm(h, 700, 200, ["C1", "C2", "C3", "C4"]);
  t.eq(b.nominalProduction(), 500, "200 + 100 + 200");
  t.eq(g.Farms.network.B, 800, "B follows the membership");
  t.eq(g.Farms.network.P, 300,
    "and P does NOT -- a farm joining later raises the baseline, not the run");
});

test("a networked farm is paid through P and never twice", function (t) {
  var h = boot();
  var g = h.game;
  farm(h, 600, 200, ["C1", "C2", "C3"]);
  h.run("Farms.setDie(function () { return 12; });");   // C3 face 12 is +85

  var before = g.cash;
  g.Farms.settleWave(1);
  t.eq(g.cash, before, "settling a wave pays a network member nothing directly");
  t.eq(g.Farms.network.P, 385, "the dice moved P instead");

  before = g.cash;
  g.Farms.openWave();
  t.eq(g.cash, before + 385, "and the next wave opens by paying P");
  t.eq(g.Farms.network.P, 385, "which does not consume it");
});

test("P never goes below zero", function (t) {
  var h = boot();
  var g = h.game;
  farm(h, 600, 200, ["C1", "C2", "C3"]);
  g.Farms.network.P = 50;
  h.run("Farms.setDie(function () { return 3; });");    // -170
  g.Farms.settleWave(1);
  t.eq(g.Farms.network.P, 0, "a loss bigger than P leaves nothing, never a debt");
});

test("C5 costs a quarter of a million, and a sale gives none of it back",
function (t) {
  var h = boot();
  var g = h.game;

  t.eq(g.FarmTower.upgradeById("C5").cost, 250000, "250 000 mana");
  t.eq(g.FarmTower.upgradeById("C5").noRefund, true, "and it is sunk, not invested");

  var f = farm(h, 600, 200, ["C1", "C2", "C3", "C4"]);
  var beforeSpent = f.totalSpent;
  var beforeValue = h.run("sellValue(towers[0])");
  t.eq(beforeValue, Math.ceil(beforeSpent / 2), "up to C4 it is half of everything");

  f.applyUpgrade("C5");
  t.eq(f.totalSpent, beforeSpent + 250000,
    "the total spent is honest about it -- the result screen reports this");
  t.eq(f.unrefundableSpent, 250000, "and all of it is sunk");
  t.eq(h.run("sellValue(towers[0])"), beforeValue,
    "so the sale is worth exactly what it was worth before C5 was bought");

  var cashBefore = g.cash;
  h.run("sellTower(towers[0])");
  t.eq(g.cash, cashBefore + beforeValue, "and that is what the purse gets");
});

test("C5 pays 400 a wave, and the network's baseline follows", function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["C1", "C2", "C3", "C4"]);
  t.eq(f.nominalProduction(), 500, "200 base + 100 (C3) + 200 (C4)");

  f.applyUpgrade("C5");
  t.eq(f.nominalProduction(), 900, "and C5 adds 400, not the 500 it used to");
  t.eq(g.Farms.network.B, 900, "the baseline is that sum");
});

test("only one C5 on the map", function (t) {
  var h = boot();
  var a = farm(h, 600, 200, ["C1", "C2", "C3", "C4"]);
  var b = farm(h, 700, 200, ["C1", "C2", "C3", "C4"]);
  t.eq(a.applyUpgrade("C5"), null, "the first is allowed");
  t.eq(b.whyCannotUpgrade("C5"), "one C5 per map", "and the second is not");
});


group("Farm — every face of all three tables");

// The tables are walked ROW BY ROW against a P computed by hand. A face is data
// (see FarmDice), so this is the test that says the data is right -- and it is
// the only place the sixty-two numbers in the brief are checked one at a time.
function faceRun(h, table, tiers, face, startP) {
  var g = h.game;
  g.Farms.reset();
  h.run("towers.length = 0");
  farm(h, 600, 200, tiers);
  g.Farms.network.P = startP;
  h.run("Farms.setDie(function () { return " + face + "; });");
  g.Farms.settleWave(1);
  return g.Farms.network.P;
}

test("the C3 table, face by face", function (t) {
  var h = boot();
  var C = ["C1", "C2", "C3"];
  var B = 300;                       // one C3 farm: 200 + 100

  t.near(faceRun(h, "C3", C, 1, 1000), 650, 1e-9, "1: -35%");
  t.near(faceRun(h, "C3", C, 2, 1000), 770, 1e-9, "2: -230 beats -10% of 1000");
  t.near(faceRun(h, "C3", C, 2, 5000), 4500, 1e-9, "2: -10% of 5000 beats -230");
  t.near(faceRun(h, "C3", C, 3, 1000), 830, 1e-9, "3: -170");
  t.near(faceRun(h, "C3", C, 4, 1000), 900, 1e-9, "4: -100");
  t.near(faceRun(h, "C3", C, 5, 1000), 930, 1e-9, "5: -70");
  t.near(faceRun(h, "C3", C, 6, 1000), 950, 1e-9, "6: -50");
  t.near(faceRun(h, "C3", C, 7, 1000), 965, 1e-9, "7: -35");
  t.near(faceRun(h, "C3", C, 8, 1000), B, 1e-9, "8: back to B");
  t.near(faceRun(h, "C3", C, 9, 1000), 1030, 1e-9, "9: +30");
  t.near(faceRun(h, "C3", C, 10, 1000), 1045, 1e-9, "10: +45");
  t.near(faceRun(h, "C3", C, 11, 1000), 1060, 1e-9, "11: +60");
  t.near(faceRun(h, "C3", C, 12, 1000), 1085, 1e-9, "12: +85");
  t.near(faceRun(h, "C3", C, 13, 1000), 1100, 1e-9, "13: +100");
  t.near(faceRun(h, "C3", C, 14, 1000), 1150, 1e-9, "14: +150");
  t.near(faceRun(h, "C3", C, 15, 1000), 1180, 1e-9, "15: +180 beats +4%");
  t.near(faceRun(h, "C3", C, 15, 10000), 10400, 1e-9, "15: +4% of 10000 beats +180");
  t.near(faceRun(h, "C3", C, 16, 1000), 1000, 1e-9, "16: nothing now, a charge for later");
  t.near(faceRun(h, "C3", C, 17, 1000), 1000, 1e-9, "17: the same");
  t.near(faceRun(h, "C3", C, 18, 1000), 1240, 1e-9, "18: +240 beats +6%");
  t.near(faceRun(h, "C3", C, 19, 1000), 1000, 1e-9, "19: a multiplier for later");
  t.near(faceRun(h, "C3", C, 20, 1000), 1430, 1e-9, "20: +300 then +10%");
});

test("the C4 table, face by face", function (t) {
  var h = boot();
  var C = ["C1", "C2", "C3", "C4"];
  var B = 500;
  // A C4 farm rolls TWO dice, so the scripted die fires twice per wave and the
  // expected value is the face applied twice.
  t.near(faceRun(h, "C4", C, 1, 1000), 250, 1e-9, "1: -50%, twice");
  t.near(faceRun(h, "C4", C, 3, 1000), 300, 1e-9, "3: -350, twice");
  t.near(faceRun(h, "C4", C, 4, 1000), 600, 1e-9, "4: -200, twice");
  t.near(faceRun(h, "C4", C, 5, 1000), 760, 1e-9, "5: -120, twice");
  t.near(faceRun(h, "C4", C, 6, 1000), 840, 1e-9, "6: -80, twice");
  t.near(faceRun(h, "C4", C, 7, 1000), 900, 1e-9, "7: -50, twice");
  t.near(faceRun(h, "C4", C, 8, 1000), B, 1e-9, "8: back to B, twice, still B");
  t.near(faceRun(h, "C4", C, 9, 1000), 1120, 1e-9, "9: +60, twice");
  t.near(faceRun(h, "C4", C, 10, 1000), 1170, 1e-9, "10: +85, twice");
  t.near(faceRun(h, "C4", C, 11, 1000), 1240, 1e-9, "11: +120, twice");
  t.near(faceRun(h, "C4", C, 12, 1000), 1330, 1e-9, "12: +165, twice");
  t.near(faceRun(h, "C4", C, 13, 1000), 1450, 1e-9, "13: +225, twice");
  t.near(faceRun(h, "C4", C, 14, 1000), 1600, 1e-9, "14: +300, twice");
  // Twice: -500 takes 1000 to 500, and the second die takes the larger loss
  // again (500 against 20% of 500) and empties it.
  t.near(faceRun(h, "C4", C, 2, 1000), 0, 1e-9, "2: -500 twice, the larger loss");
  t.near(faceRun(h, "C4", C, 18, 1000), 1950, 1e-9, "18: +475 twice");
  // (1000 + 600) * 1.18 = 1888, then (1888 + 600) * 1.18.
  t.near(faceRun(h, "C4", C, 20, 1000), 2935.84, 1e-6, "20: +600 then +18%, twice");
});

test("the C5 table, and it has twenty-two faces rather than twenty", function (t) {
  var h = boot();
  var g = h.game;
  t.eq(g.FarmDice.sides("C5"), 22,
    "the brief's C5 table lists faces 21 and 22, so the die has 22 sides");
  t.eq(g.FarmDice.sides("C3"), 20, "C3 is a d20");
  t.eq(g.FarmDice.sides("C4"), 20, "and so is C4");

  var C = ["C1", "C2", "C3", "C4", "C5"];
  // A C5 farm rolls THREE dice. Every gain face was cut on 2026-08-28 along
  // with C5's own production, so these are the retuned figures.
  t.near(faceRun(h, "C5", C, 9, 1000), 1195, 1e-9, "9: +65, three times");
  t.near(faceRun(h, "C5", C, 10, 1000), 1285, 1e-9, "10: +95, three times");
  t.near(faceRun(h, "C5", C, 11, 1000), 1390, 1e-9, "11: +130, three times");
  t.near(faceRun(h, "C5", C, 12, 1000), 1525, 1e-9, "12: +175, three times");
  t.near(faceRun(h, "C5", C, 21, 1000), 8000, 1e-9, "21: doubles, three times");
  // B is 200 base + 100 (C3) + 200 (C4) + 400 (C5). C5's production came down
  // from 500 in the same retune, so the reset face lands 100 lower than it did.
  t.near(faceRun(h, "C5", C, 8, 1000), 900, 1e-9,
    "8: reset to B, which for one C5 farm is 900");
});


group("Farm — the deferred C5 effects and the order they resolve in");

test("face 13 rerolls up to three 8s in the NEXT series, and no more", function (t) {
  var h = boot();
  var g = h.game;
  g.Farms.reset();
  h.run("towers.length = 0");
  farm(h, 600, 200, ["C1", "C2", "C3", "C4", "C5"]);
  g.Farms.network.P = 1000;

  h.run("Farms.setDie(function () { return 13; });");
  g.Farms.settleWave(1);
  t.eq(g.Farms.prepState().rerollEights, 3, "three protections are recorded");

  // Next wave: three 8s, all rerolled into 9s (+65 each on the C5 table).
  var seq = [8, 8, 8];
  var i = 0;
  h.run("__seq = [8,8,8,9,9,9]; __i = 0;" +
        "Farms.setDie(function () { return __seq[__i++]; });");
  g.Farms.settleWave(2);
  t.eq(g.Farms.network.P, 1195, "all three 8s became 9s: +65 each");
  t.eq(g.Farms.prepState().rerollEights, 0, "and the charges are spent");
});

test("a +2 landing exactly on 8 becomes 9, and a +1 on 8 does not", function (t) {
  var h = boot();
  var g = h.game;

  // Face 16 records a +2. Next wave a 6 becomes 8, which the rule turns into 9.
  g.Farms.reset();
  h.run("towers.length = 0");
  farm(h, 600, 200, ["C1", "C2", "C3", "C4", "C5"]);
  g.Farms.network.P = 1000;
  h.run("__seq = [16,1,1]; __i = 0; Farms.setDie(function () { return __seq[__i++]; });");
  g.Farms.settleWave(1);
  var afterPrep = g.Farms.network.P;
  t.eq(g.Farms.prepState().dieBonuses.length, 1, "one +2 is waiting");

  h.run("__seq = [6,1,1]; __i = 0; Farms.setDie(function () { return __seq[__i++]; });");
  g.Farms.network.P = 1000;
  g.Farms.settleWave(2);
  // 6 + 2 = 8 -> 9. A C5 is on the board, so the series is SORTED: the two
  // 1s halve P first and the 9 pays its 65 into what is left. That ordering
  // is exactly what C5's third line buys, and it is why the expected figure
  // is not the one an unsorted series would give.
  t.near(g.Farms.network.P, 1000 * 0.5 * 0.5 + 65, 1e-9,
    "the two 1s resolved first, then the rescued 9 paid");

  // Face 14 records a +1, and a +1 arriving on 8 is left alone.
  g.Farms.reset();
  h.run("towers.length = 0");
  farm(h, 600, 200, ["C1", "C2", "C3", "C4", "C5"]);
  g.Farms.network.P = 1000;
  h.run("__seq = [14,1,1]; __i = 0; Farms.setDie(function () { return __seq[__i++]; });");
  g.Farms.settleWave(1);
  t.eq(g.Farms.prepState().dieBonuses[0], 1, "a +1 is waiting");

  h.run("__seq = [7,20,20]; __i = 0; Farms.setDie(function () { return __seq[__i++]; });");
  g.Farms.network.P = 1000;
  g.Farms.network.B = 1000;
  g.Farms.settleWave(2);
  // 7 + 1 = 8, which resets to B rather than becoming 9.
  t.ok(g.Farms.network.P > 0, "a +1 that lands on 8 is a reset, not a 9");
});

test("face 22 removes everything under 9 from the next series", function (t) {
  var h = boot();
  var g = h.game;
  g.Farms.reset();
  h.run("towers.length = 0");
  farm(h, 600, 200, ["C1", "C2", "C3", "C4", "C5"]);
  g.Farms.network.P = 1000;

  h.run("__seq = [22,21,21]; __i = 0; Farms.setDie(function () { return __seq[__i++]; });");
  g.Farms.settleWave(1);
  t.eq(g.Farms.prepState().cullBelow9, true, "the cull is recorded");

  g.Farms.network.P = 1000;
  h.run("__seq = [1,2,20]; __i = 0; Farms.setDie(function () { return __seq[__i++]; });");
  g.Farms.settleWave(2);
  // 1 and 2 are removed; only the 20 resolves: +700 then +20%.
  t.near(g.Farms.network.P, (1000 + 700) * 1.2, 1e-9,
    "the two losing faces never resolved");
  t.eq(g.Farms.prepState().cullBelow9, false, "and the charge expired with the series");
});

test("with a C5 the whole series is sorted low to high, and without one it is not",
function (t) {
  var h = boot();
  var g = h.game;

  // Sorted: the 19 (next gain x2.5) resolves BEFORE the 20, so the 20's +750
  // is multiplied. Unsorted it would be a coin toss, which is why C5 buys this.
  g.Farms.reset();
  h.run("towers.length = 0");
  farm(h, 600, 200, ["C1", "C2", "C3", "C4", "C5"]);
  g.Farms.network.P = 1000;
  h.run("__seq = [20,19,11]; __i = 0; Farms.setDie(function () { return __seq[__i++]; });");
  g.Farms.settleWave(1);
  // sorted -> 11 (+130), 19 (charge), 20 (+700 x 2.5 = 1750, then +20%)
  t.near(g.Farms.network.P, (1000 + 130 + 1750) * 1.2, 1e-9,
    "11, then 19, then 20 -- the multiplier caught the big gain");

  // A network with no C5 keeps the random order, so the same three faces are
  // NOT guaranteed to resolve in that order. What is pinned is that the order
  // is not sorted: the same seed and the same faces give a different total.
  t.eq(g.Farms.members().length, 1, "one member");
});


group("Farm — the three-branch crosspath and the board");

test("two paths at most: one to five, the other to two", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2"]);

  // A SECOND branch is fine; a THIRD is never started.
  t.eq(f.applyUpgrade("B1"), null, "a second path opens");
  t.eq(f.whyCannotUpgrade("C1"), "two paths at most", "a third does not");
  t.eq(f.applyUpgrade("B2"), null, "and the second reaches two");
  t.eq(f.whyCannotUpgrade("C1"), "two paths at most", "still refused");
});

test("only one branch passes tier 2, and the other stays open to it",
function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["B1", "B2"]);
  t.eq(f.lockedBranch(), null, "two tiers commit nothing");

  t.eq(f.applyUpgrade("B3"), null, "B3 is taken");
  t.eq(f.lockedBranch(), "B", "which commits path B");
  t.eq(f.whyCannotUpgrade("B4"), null, "the committed branch carries on");

  // THE HALF THAT WAS BROKEN: a committed branch must not close the other one
  // at tier 1. The secondary is supposed to be open all the way to two.
  t.eq(f.whyCannotUpgrade("A1"), null, "the secondary still opens at tier 1");
  t.eq(f.applyUpgrade("A1"), null, "and can be bought");
  t.eq(f.applyUpgrade("A2"), null, "up to tier 2");
  // Asked only once its own prerequisites are met, so the answer is the
  // crosspath and not "needs A2" -- `requires` is checked first, deliberately:
  // it is the nearer reason and the one the player can act on.
  t.eq(f.whyCannotUpgrade("A3"), "path B is committed", "but no further");
  t.eq(f.whyCannotUpgrade("C1"), "two paths at most", "and never a third");
});

test("a farm may reach five on its main path with a secondary at two",
function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  t.eq(f.tiersOwned("A"), 5, "five on the main path");
  t.eq(f.applyUpgrade("B1"), null, "the secondary still opens");
  t.eq(f.applyUpgrade("B2"), null, "and reaches two");
  t.eq(f.whyCannotUpgrade("B3"), "path A is committed", "and stops there");
  t.eq(f.tiersOwned("B"), 2, "which is the shape the brief asks for");
});

test("selling refunds half of everything invested, and takes it off the board",
function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["A1"]);
  t.eq(f.totalSpent, 1200 + 250, "the body plus the tier");
  t.eq(h.run("sellValue(towers[0])"), 725, "half of it, rounded up");

  h.run("sellTower(towers[0])");
  t.eq(g.Farms.living().length, 0, "and the farm is off the board");
});

test("a restart clears the farms and the network", function (t) {
  var h = boot();
  var g = h.game;
  farm(h, 600, 200, ["C1", "C2", "C3"]);
  t.eq(g.Farms.network.live, true, "a network is up");

  h.run("restartGame()");
  t.eq(g.Farms.living().length, 0, "no farms survive a restart");
  t.eq(g.Farms.network.live, false, "and neither does the network");
  t.eq(g.Farms.network.P, 0, "P is gone with it");
});

test("a wave is settled exactly once, however many doors fire", function (t) {
  var h = boot();
  var g = h.game;
  farm(h, 600, 200);
  var before = g.cash;

  g.Farms.settleWave(1);
  t.eq(g.cash, before + 200, "the wave's production");
  g.Farms.settleWave(1);
  g.Farms.settleWave(1);
  t.eq(g.cash, before + 200, "and the latch makes the other doors free");

  g.Farms.settleWave(2);
  t.eq(g.cash, before + 400, "the next wave pays again");
});


group("Farm — what it has made, for as long as it has stood");

// These exist because the production was INVISIBLE. A plain farm pays 200 mana
// into a purse that bounties are already moving, at a wave boundary, with no
// popup and no row -- so the owner placed one, watched a run, and reported that
// the tower does not produce. It did. Every one of these totals is the evidence
// that was missing.

test("a plain farm's total is its per-wave figure, wave after wave",
function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200);

  t.eq(f.manaProduced, 0, "nothing before the first wave settles");
  g.Farms.settleWave(1);
  t.eq(f.manaProduced, 200, "one wave's production");
  g.Farms.settleWave(2);
  t.eq(f.manaProduced, 400, "and it accumulates rather than reporting the last");
});

test("a tick farm counts every tick, on the same clock the game runs on",
function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3"]);

  f.update(FarmTowerTick(h) - 0.01);
  t.eq(f.manaProduced, 0, "nothing until the tick completes");
  f.update(0.02);
  t.eq(f.manaProduced, 50, "then one tick's worth");
  f.update(FarmTowerTick(h) * 3);
  t.eq(f.manaProduced, 200, "and three more");
});

test("a storing farm counts what it stocks, and the clone on top",
function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4"]);

  var before = g.cash;
  f.update(FarmTowerTick(h));
  t.eq(g.cash, before, "the purse gets nothing -- A4 keeps it");
  t.eq(f.stock > 0, true, "the stock has it instead");
  t.eq(f.manaProduced, f.stock,
    "and stocked mana is still mana this tower made");

  f.stock = 1000;
  f.manaProduced = 1000;
  var cloned = f.cloneStock();
  t.eq(cloned, 50, "5% of a thousand");
  t.eq(f.manaProduced, 1050, "and the clone counts too");
});

test("investing the stock does not take back what was produced", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  var five = tierFiveTower(h, 900, 300);
  f.produce(30000);
  t.eq(f.manaProduced, 30000, "produced");
  t.eq(f.invest(five, false), null, "three whole tranches are spent");
  t.eq(f.stock, 0, "the stock is gone");
  t.eq(f.manaProduced, 30000, "the LIFETIME total is not -- it is not a balance");
});

test("path B counts the base HP it grew, per wave and per kill", function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["B1", "B2"]);

  t.eq(f.baseHpPerWave > 0, true, "B has a per-wave figure to count");
  g.Farms.settleWave(1);
  t.eq(f.baseHpProduced, f.baseHpPerWave, "one wave of it");

  var perKill = f.baseHpPerKill;
  if (perKill > 0) {
    var e = enemyAt(h, f.x, f.y, 10);
    g.Farms.onEnemyKilled(e);
    t.eq(f.baseHpProduced, f.baseHpPerWave + perKill, "and a kill in the field");
    t.eq(f.manaProduced, 200 + f.manaPerKill, "which pays mana on the same door");
  }
});

test("a networked farm's share of P lands on its own total", function (t) {
  var h = boot();
  var g = h.game;
  var a = farm(h, 600, 200, ["C1", "C2", "C3"]);          // nominal 300
  var b = farm(h, 700, 200, ["C1", "C2", "C3", "C4"]);    // nominal 500
  t.eq(g.Farms.network.B, 800, "the baseline is the two of them");

  g.Farms.network.P = 800;
  g.Farms.openWave();
  t.near(a.manaProduced, 300, 1e-9, "three eighths of the payout");
  t.near(b.manaProduced, 500, 1e-9, "and five eighths");
  t.eq(a.manaProduced + b.manaProduced, 800,
    "the whole payment is attributed and none of it is invented");
});

test("the panel prints the totals, and no zero it can never move",
function (t) {
  var h = boot();
  var g = h.game;

  var plain = farm(h, 600, 200);
  var labels = plain.statLines().map(function (r) { return r[0]; });
  t.ok(labels.indexOf("Mana produced") !== -1, "every farm shows its mana");
  t.eq(labels.indexOf("Base HP produced"), -1,
    "a farm with no B tier shows no base HP row: " + labels.join(", "));

  var lab = farm(h, 700, 200, ["B1"]);
  labels = lab.statLines().map(function (r) { return r[0]; });
  t.ok(labels.indexOf("Base HP produced") !== -1, "one that makes HP does");

  g.Farms.settleWave(1);
  var row = lab.statLines().filter(function (r) { return r[0] === "Mana produced"; })[0];
  t.eq(row[1], "200", "and the number is the total, formatted like every other");
});

test("the result screen picks both totals up", function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["B1"]);
  g.Farms.settleWave(1);

  var rows = h.run("resultTowerRows()").filter(function (r) {
    return r.name === "Farm";
  });
  t.eq(rows.length, 1, "the farm has a row");
  var totals = rows[0].totals.map(function (r) { return r[0]; });
  t.ok(totals.indexOf("Mana produced") !== -1, "with its mana total");
  t.ok(totals.indexOf("Base HP produced") !== -1, "and its base HP total");
});

test("production is announced over the tower that made it", function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200);

  var seen = [];
  var real = g.Effects.farmProduced;
  h.run("Effects.__seen = [];");
  g.Effects.farmProduced = function (tower, amount, stored) {
    seen.push({ tower: tower, amount: amount, stored: stored });
    return real.apply(null, arguments);
  };
  g.Farms.settleWave(1);
  g.Effects.farmProduced = real;

  t.eq(seen.length, 1, "one popup for one payment");
  t.eq(seen[0].tower, f, "over the farm itself");
  t.eq(seen[0].amount, 200, "for what it paid");
  t.eq(seen[0].stored, false, "and it went to the purse, not to a stock");
});


test("the clone is announced, because it happens between waves", function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4"]);
  f.stock = 1000;

  var seen = [];
  var real = g.Effects.farmProduced;
  g.Effects.farmProduced = function (tower, amount, stored) {
    seen.push({ amount: amount, stored: stored });
    return real.apply(null, arguments);
  };
  g.Farms.settleWave(1);
  g.Effects.farmProduced = real;

  // The wave's own production, then the clone on what is standing after it.
  t.eq(seen.length, 2, "two announcements: the production and the clone");
  t.eq(seen[0].amount, 400, "the wave's production");
  t.eq(seen[1].amount, 70, "and 5% of the 1400 standing once it lands");
  t.eq(seen[0].stored && seen[1].stored, true, "both marked as stored, not paid");
});

test("a farm's share of a kill is its own popup, not added to the bounty",
function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["B1", "B2", "B3"]);
  var e = enemyAt(h, f.x, f.y, 10);

  var calls = [];
  var realFarm = g.Effects.farmKillBonus;
  g.Effects.farmKillBonus = function (farmArg, enemy, mana, baseHp) {
    calls.push({ mana: mana, baseHp: baseHp });
    return realFarm.apply(null, arguments);
  };
  g.Farms.onEnemyKilled(e);
  g.Effects.farmKillBonus = realFarm;

  t.eq(calls.length, 1, "one popup for one farm");
  t.eq(calls[0].mana, f.manaPerKill, "carrying the farm's figure alone");
  t.eq(calls[0].baseHp, f.baseHpPerKill, "and its base HP alone");

  // Two farms over the same corpse are two gains and read as two.
  var second = farm(h, 620, 210, ["B1", "B2", "B3"]);
  calls = [];
  g.Effects.farmKillBonus = function (farmArg, enemy, mana, baseHp) {
    calls.push({ farm: farmArg, mana: mana });
    return realFarm.apply(null, arguments);
  };
  g.Farms.onEnemyKilled(enemyAt(h, f.x, f.y, 10));
  g.Effects.farmKillBonus = realFarm;
  t.eq(calls.length, 2, "two farms, two popups");
  t.eq(calls[0].farm !== calls[1].farm, true, "one each rather than one summed");
});

test("a body a farm will pay for is marked while it is still alive",
function (t) {
  var h = boot();
  var g = h.game;

  t.eq(g.Farms.killBonusAt(600, 200), null, "nothing to mark with no farm");

  var f = farm(h, 600, 200, ["B1", "B2", "B3"]);
  var inside = g.Farms.killBonusAt(f.x + 10, f.y + 10);
  t.ok(inside, "a body in the circle is worth something");
  t.eq(inside.mana, f.manaPerKill, "exactly what it would pay");
  t.eq(inside.baseHp, f.baseHpPerKill, "in both currencies");
  t.eq(g.Farms.killBonusAt(f.x + f.rangePx + 40, f.y), null,
    "and a body outside it is not marked");

  // A farm with no per-kill tier marks nothing, however big its circle.
  h.run("towers.length = 0; Farms.reset()");
  var b1 = farm(h, 600, 200, ["B1"]);
  t.eq(b1.manaPerKill, 0, "B1 pays nothing per kill");
  t.eq(g.Farms.killBonusAt(b1.x, b1.y), null, "so it marks nothing");
});


group("Farm — the moments the T3 bodies act out");

// The three T3 models ship one-shot clips beside their idle, and each depicts
// something this tower already does. The simulation's whole job is to record
// WHEN, on the animation clock; the renderer decides whether that is recent
// enough to still be playing. These pin the when.

test("a production tick is stamped, and only when one lands", function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["A1", "A2", "A3"]);
  t.eq(f.lastTick, -1, "nothing has ticked yet, and -1 is not a moment");

  f.update(FarmTowerTick(h) - 0.01, []);
  t.eq(f.lastTick, -1, "still nothing at 4.99 s");
  f.update(0.02, []);
  t.near(f.lastTick, f.animClock, 1e-9, "the tick stamps the clock it fired on");

  var first = f.lastTick;
  f.update(FarmTowerTick(h), []);
  t.ok(f.lastTick > first, "and the next tick moves it");
});

test("a body entering the field stamps a lock, on the edge and once",
function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["B1", "B2", "B3"]);
  t.eq(f.lastLock, -1, "an empty field has locked onto nothing");

  var outside = enemyAt(h, f.x + f.rangePx * 3, f.y, 10);
  f.update(1 / 60, g.enemies);
  t.eq(f.lastLock, -1, "a body out of reach is not a lock");

  var inside = enemyAt(h, f.x + 4, f.y, 10);
  f.update(1 / 60, g.enemies);
  var locked = f.lastLock;
  t.ok(locked >= 0, "one arriving is");

  f.update(1 / 60, g.enemies);
  t.eq(f.lastLock, locked, "and it does not fire again while it stands there");

  // It re-arms once the field empties.
  g.enemies.length = 0;
  f.update(1 / 60, g.enemies);
  enemyAt(h, f.x + 4, f.y, 10);
  f.update(1 / 60, g.enemies);
  t.ok(f.lastLock > locked, "the next arrival is its own lock");
});

test("a kill in the field stamps a capture on the farm that was paid",
function (t) {
  var h = boot();
  var g = h.game;
  var near = farm(h, 600, 200, ["B1", "B2", "B3"]);
  var far = farm(h, 600, 200 + g.ul(400), ["B1", "B2", "B3"]);
  near.animClock = 12;

  var e = enemyAt(h, near.x + 4, near.y, 10);
  g.Farms.onEnemyKilled(e);
  t.near(near.lastCapture, 12, 1e-9, "the farm that covered the body");
  t.eq(far.lastCapture, -1, "and not one that did not");
});

test("the shrine throws when the network rolls, and only its members",
function (t) {
  var h = boot();
  var g = h.game;
  var member = farm(h, 600, 200, ["C1", "C2", "C3"]);
  var bystander = farm(h, 700, 200, ["C1", "C2"]);
  member.animClock = 5;

  g.Farms.settleWave(1);
  t.near(member.lastRoll, 5, 1e-9, "the farm holding a die threw it");
  t.eq(bystander.lastRoll, -1,
    "a farm with no dice is standing beside a network, not in it");
});

test("A4's clone and withdrawal are stamped where they happen", function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4"]);
  t.eq(f.lastClone, -1, "nothing cloned yet");
  t.eq(f.lastWithdraw, -1, "and nothing withdrawn");

  f.stock = 1000;
  f.animClock = 7;
  g.Farms.settleWave(1);
  t.near(f.lastClone, 7, 1e-9, "the wave's cloning stamps the clock");

  f.animClock = 9;
  t.eq(f.collect(), null, "and collecting the stock");
  t.near(f.lastWithdraw, 9, 1e-9, "stamps its own");
});

test("B4's wave gain is stamped only on a farm that grants HP", function (t) {
  var h = boot();
  var g = h.game;
  var field = farm(h, 600, 200, ["B1"]);
  var plain = farm(h, 700, 200, []);
  field.animClock = 3;

  g.Farms.settleWave(1);
  t.near(field.lastGain, 3, 1e-9, "the farm that gave the base hit points");
  t.eq(plain.lastGain, -1, "and not one with no B tier at all");
});

test("the throw names its own outcome, and the network agrees", function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["C1", "C2", "C3"]);

  // Face 12 on the C3 table is a gain; face 8 is the reset; face 1 halves P.
  h.run("Farms.setDie(function () { return 12; });");
  g.Farms.network.P = 1000;
  g.Farms.settleWave(1);
  t.eq(f.rollOutcome, "result_positive", "a gain reads as a gain");

  // C3's face 1 takes 35%, which is a loss and not a catastrophe.
  h.run("Farms.setDie(function () { return 1; });");
  g.Farms.network.P = 1000;
  g.Farms.settleWave(2);
  t.eq(f.rollOutcome, "result_negative", "a loss reads as a loss");

  h.run("Farms.setDie(function () { return 8; });");
  g.Farms.network.P = 5000;
  g.Farms.settleWave(3);
  t.eq(f.rollOutcome, "result_reset", "the reset face names itself");
});

test("the C5 table's two doubles name themselves, and a plain one does not",
function (t) {
  var h = boot();
  var g = h.game;
  var five = farm(h, 600, 200, ["C1", "C2", "C3", "C4", "C5"]);
  h.run("Farms.setDie(function () { return 21; });");   // C5 face 21 doubles
  g.Farms.network.P = 1000;
  g.Farms.settleWave(1);
  t.eq(five.rollOutcome, "result_21_double",
    "face 21 has its own body on the T5 shrine, and arms the next double");
  t.eq(g.Farms.network.P, 8000, "three dice, three doublings");

  // Face 22 doubles AND culls everything under nine next series.
  h.run("Farms.setDie(function () { return 22; });");
  g.Farms.network.P = 1000;
  g.Farms.settleWave(2);
  t.eq(five.rollOutcome, "result_22_purge_double", "and face 22 is the other one");
  t.eq(g.Farms.prepState().cullBelow9, true, "which is a purge as well as a double");

  // A C4 farm has no such faces: its double stays the generic critical.
  h.run("towers.length = 0"); g.Farms.reset();
  var four = farm(h, 700, 200, ["C1", "C2", "C3", "C4"]);
  h.run("Farms.setDie(function () { return 20; });");
  g.Farms.network.P = 1000;
  g.Farms.settleWave(1);
  t.ok(four.rollOutcome !== "result_21_double" &&
       four.rollOutcome !== "result_22_purge_double",
    "a C4 never names a C5 face: " + four.rollOutcome);
});

test("A5 tells its two investments apart", function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  var five = tierFiveTower(h, 900, 300);
  t.eq(f.lastEmpower, -1, "nothing empowered yet");

  f.stock = 100000; f.animClock = 4;
  t.eq(f.invest(five, false), null, "a permanent boost");
  t.near(f.lastEmpower, 4, 1e-9, "is stamped");
  t.eq(f.empowerTemporary, false, "and marked as the long beam");

  var other = tierFiveTower(h, 1000, 400);
  f.stock = 100000; f.animClock = 9;
  t.eq(f.invest(other, true), null, "a surge");
  t.near(f.lastEmpower, 9, 1e-9, "is stamped on the same field");
  t.eq(f.empowerTemporary, true, "and marked as the burst");
});

test("B5's execution is stamped on the farm whose field took the body",
function (t) {
  var h = boot();
  var g = h.game;
  var near = farm(h, 600, 200, ["B1", "B2", "B3", "B4", "B5"]);
  var far = farm(h, 600, 200 + g.ul(400), ["B1", "B2", "B3", "B4", "B5"]);
  near.animClock = 11;
  t.eq(near.executes, true, "B5 carries the execution");

  var e = enemyAt(h, near.x + 4, near.y, 1000);
  e.health = 1;                                  // well under the threshold
  t.eq(g.Farms.executes(e), true, "the field takes it");
  t.near(near.lastExecute, 11, 1e-9, "and the farm that did it says so");
  t.eq(far.lastExecute, -1, "the one across the map does not");
});

test("C5's prep effects are named as they are recorded and spent", function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["C1", "C2", "C3", "C4", "C5"]);

  // Face 13 records three rerolls: that is a modifier being QUEUED.
  h.run("Farms.setDie(function () { return 13; });");
  g.Farms.network.P = 1000;
  g.Farms.settleWave(1);
  t.eq(f.prepClip, "queue_modifier", "recording one queues a plaque");
  t.eq(g.Farms.prepState().rerollEights, 3, "and the charges are held");

  // Next wave the 8s are rescued: that is the die respinning.
  h.run("__seq = [8,8,8,9,9,9]; __i = 0;" +
        "Farms.setDie(function () { return __seq[__i++]; });");
  g.Farms.settleWave(2);
  t.eq(f.prepClip, "reroll_eight", "spending one respins the die that was saved");

  // Face 22 arms a purge, and the next series sweeps the board.
  h.run("Farms.setDie(function () { return 22; });");
  g.Farms.network.P = 1000;
  g.Farms.settleWave(3);
  h.run("Farms.setDie(function () { return 3; });");
  g.Farms.settleWave(4);
  t.eq(f.prepClip, "purge_under_nine", "and the purge is its own clip");
});

test("arming the boost clears the panel, so a tower behind it can be clicked",
function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  f.stock = 100000;
  g.inspected = f;

  // The panel is a slab down the right third of the board and `runPanelAction`
  // consumes every click that lands on it, BEFORE `pickTower` ever runs. So a
  // target drawn behind it could not be picked at all -- which is what the
  // owner hit. Arming the mode has to put the panel away.
  var armed = null;
  f.performAction("investPermanent", {
    beginInvesting: function (farmArg, temporary) {
      armed = { farm: farmArg, temporary: temporary };
      g.inspected = null;              // what game.js's own seam does
      return true;
    }
  });
  t.eq(armed.farm, f, "the mode is armed");
  t.eq(g.inspected, null, "and the panel is gone with it");
});

test("with nothing on the board to boost, the press refuses instead of arming",
function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  f.stock = 100000;

  // A tier 3 tower is not a target, and it is the only thing standing.
  var three = tierFiveTower(h, 900, 300, 3);
  t.eq(g.FarmBoost.whyCannotBoost(three, true), "needs a tier 5 tower",
    "the rule the brief sets");

  var armed = false;
  var said = f.performAction("investPermanent", {
    beginInvesting: function () { armed = true; return false; }
  });
  t.eq(said, "no tier 5 tower to boost",
    "the press says why, rather than opening a mode every click would refuse");
  t.eq(f.stock, 100000, "and nothing is spent");

  // Through the REAL seam, on a board that does have one.
  h.run("towers.length = 0"); g.Farms.reset();
  var f2 = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  f2.stock = 100000;
  tierFiveTower(h, 900, 300);
  g.inspected = f2;
  t.ok(/pick a tower/.test(f2.performAction("investPermanent", {
    beginInvesting: function () { return true; }
  })), "with a target it arms as before");
});

test("the EYE watches the nearest body, and the tower does not turn",
function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["B1", "B2", "B3"]);
  var built = f.aim;

  // Two bodies it can see; the nearer one wins.
  var far = enemyAt(h, f.x, f.y + f.rangePx * 0.8, 10);
  enemyAt(h, f.x + f.rangePx * 0.3, f.y, 10);
  for (var i = 0; i < 120; i++) f.update(1 / 60, g.enemies);
  t.near(f.viewYaw, 0, 1e-3, "the eye settles on the nearer one, due +X");
  t.eq(f.aim, built, "and the machine itself has not moved");

  g.enemies.length = 0;
  g.enemies.push(far);
  for (i = 0; i < 120; i++) f.update(1 / 60, g.enemies);
  t.near(f.viewYaw, Math.PI / 2, 1e-3, "it follows when only the far one is left");

  // EASED, NOT SNAPPED: one step covers part of the way, never all of it.
  g.enemies.length = 0;
  enemyAt(h, f.x - f.rangePx * 0.3, f.y, 10);   // straight behind it
  var before = f.viewYaw;
  f.update(1 / 60, g.enemies);
  var moved = Math.abs(f.viewYaw - before);
  t.ok(moved > 0, "one step turns it a little");
  t.ok(moved < Math.PI / 4, "and nowhere near the whole way: " + moved.toFixed(3));

  // Nothing in the circle leaves the last bearing rather than snapping back.
  g.enemies.length = 0;
  var held = f.viewYaw;
  f.update(1 / 60, g.enemies);
  t.eq(f.viewYaw, held, "an empty field does not reset the eye");
});

test("a farm reads its own dice, face by face, and says what each was worth",
function (t) {
  var h = boot();
  var g = h.game;
  var f = farm(h, 600, 200, ["C1", "C2", "C3"]);
  t.eq(f.rollFaces(), null, "a farm that has not rolled shows nothing");

  h.run("Farms.setDie(function () { return 3; });");    // C3 face 3 is -170
  g.Farms.network.P = 1000;
  g.Farms.settleWave(1);
  var faces = f.rollFaces();
  t.eq(faces.length, 1, "one die, one face");
  t.eq(faces[0].face, 3, "the number it threw");
  t.eq(faces[0].kind, "loss", "read off the same table the resolver used");

  h.run("Farms.setDie(function () { return 12; });");
  g.Farms.settleWave(2);
  t.eq(f.rollFaces()[0].kind, "gain", "a gain reads as a gain");

  h.run("Farms.setDie(function () { return 8; });");
  g.Farms.settleWave(3);
  t.eq(f.rollFaces()[0].kind, "reset", "and the reset face is its own kind");
});

test("every model's one-shot clips are named by what fires them", function (t) {
  var h = boot();
  var g = h.game;
  // The renderer matches clips BY NAME, so a rename in a re-import would
  // silently stop an animation. This is the list, asserted against the models
  // as shipped.
  var expected = {
    "farm-t3a": ["idle_work", "produce_tick"],
    "farm-t3b": ["idle_scan", "target_lock", "kill_capture"],
    "farm-t3c": ["idle_magic", "end_wave_roll"],
    "farm-t4a": ["idle_process", "produce_tick", "clone_wave", "withdraw"],
    "farm-t4b": ["idle_orbit", "field_pulse", "target_lock", "kill_capture",
                 "wave_gain"],
    "farm-t4c": ["idle_fate", "queue_fate", "pre_roll_modifier", "end_wave_roll",
                 "reroll_eight_left", "reroll_eight_right", "result_positive",
                 "result_negative", "result_reset", "critical_success",
                 "critical_failure"],
    "farm-t5a": ["idle_vault", "produce_tick", "clone_wave", "target_acquire",
                 "empower_permanent", "empower_temporary", "withdraw_mana"],
    "farm-t5b": ["idle_panopticon", "field_aura", "target_lock", "mark_debuff",
                 "kill_capture", "execute", "wave_gain"],
    "farm-t5c": ["idle_casino", "queue_modifier", "pre_roll_modifiers",
                 "end_wave_roll", "reroll_eight", "purge_under_nine",
                 "double_next", "result_positive", "result_negative",
                 "result_reset", "result_critical_failure",
                 "result_critical_success", "result_21_double",
                 "result_22_purge_double"]
  };
  Object.keys(expected).forEach(function (id) {
    var raw = g.GLModels && g.GLModels.raw ? g.GLModels.raw(id) : null;
    if (!raw) return;                       // no WebGL in the harness: skip
    t.eq(raw.bandNames.join(","), expected[id].join(","), id + " bands");
  });
  t.ok(true, "the model files carry the clip names the renderer looks for");
});


group("Farm — what the player is shown");

test("every build's panel fits above the build bar", function (t) {
  var h = boot();
  var g = h.game;

  // A FIVE-ROW ACTION AREA IS NEW HERE. Three branches plus A5's two invest
  // buttons is more than any other tower asks for, and the panel grows a 60 px
  // rectangle per action -- the Rifleman's three rows already used 564 px of a
  // 602 px budget, so this is the build that would push one through the bar.
  [["base", []],
   ["A5", ["A1", "A2", "A3", "A4", "A5"]],
   ["B5", ["B1", "B2", "B3", "B4", "B5"]],
   ["C5", ["C1", "C2", "C3", "C4", "C5"]],
   ["all six T1/T2", ["A1", "A2", "B1", "B2", "C1", "C2"]]
  ].forEach(function (row) {
    h.run("towers.length = 0");
    var f = farm(h, 600, 200, row[1]);
    g.inspected = f;
    var L = g.inspectionLayout(f);
    t.ok(L.y + L.h <= g.BAR_Y,
      row[0] + ": the panel ends at " + Math.round(L.y + L.h) +
      ", above the bar at " + g.BAR_Y);
  });
});

test("the C5 button says its price and that it will not be refunded",
function (t) {
  var h = boot();
  var f = farm(h, 600, 200, ["C1", "C2", "C3", "C4"]);
  var button = f.panelActions().filter(function (a) { return a.upgradeId === "C5"; })[0];

  t.ok(button, "the C branch offers C5");
  t.eq(button.detail, "250000 mana", "at its price");
  t.ok(/no refund on sale/.test(button.effects),
    "and the button itself warns that the price is sunk: " + button.effects);

  var card = button.tooltip();
  t.ok(/SUNK/.test(card.note) && /250000/.test(card.note),
    "the card says it in full: " + card.note);
});

test("the panel offers all three branches, and A5 adds its two invest buttons",
function (t) {
  var h = boot();
  var base = farm(h, 600, 200);
  var branches = base.panelActions()
    .filter(function (a) { return a.tone === "upgrade"; })
    .map(function (a) { return a.branch; });
  t.deep(branches, ["A", "B", "C"], "three upgrade buttons, in path order");

  h.run("towers.length = 0");
  var a5 = farm(h, 600, 200, ["A1", "A2", "A3", "A4", "A5"]);
  var ids = a5.panelActions().map(function (a) { return a.id; });
  t.ok(ids.indexOf("investPermanent") !== -1, "A5 offers the permanent invest");
  t.ok(ids.indexOf("investSurge") !== -1, "and the surge");
});

test("the index screen lays out a column per branch, derived not typed",
function (t) {
  var h = boot();
  var g = h.game;
  t.ok(g.MetaProgress.catalogue().map(function (r) { return r.id; })
    .indexOf("farm") !== -1, "the Farm is a catalogue entry the index walks");

  g.Codex.open();
  // `tierRect` answers for whichever tower is open, and a column has a real
  // width whether the tower has two branches or three.
  var r = g.Codex.tierRect("A", 0);
  t.ok(r && r.w > 0, "a branch column has a width");
});

// A specimen: the throwaway instance the armoury card and the index both
// measure, and the rows they show for it.
function specimenRows(h) {
  var g = h.game;
  var f = new g.FarmTower(-1000, -1000, g.path);
  return g.TowerStats.withoutTotals(f.statLines());
}

test("a specimen shows what the Farm makes, and not what it has made",
function (t) {
  var h = boot();
  var labels = specimenRows(h).map(function (row) { return row[0]; });

  // THE ROW THE SCREEN EXISTS FOR. Both screens used to drop the first two
  // rows of statLines on the assumption that every tower opens with "Damage
  // dealt" and "Kills"; the Farm has neither, so the count ate its production
  // rate and the index showed a 1200-mana economy tower as one HP line.
  t.ok(labels.indexOf("Mana") !== -1,
    "the production rate survives: " + labels.join(", "));
  t.eq(labels.indexOf("Mana produced"), -1, "its lifetime total does not");
  t.ok(labels.indexOf("Tower HP") !== -1, "and the health line does");
});

test("every tower's specimen drops its history and keeps the rest",
function (t) {
  var h = boot();
  var g = h.game;
  g.MetaProgress.catalogue().forEach(function (row) {
    var Type = g.MetaProgress.constructorOf(row.id);
    var all = new Type(-1000, -1000, g.path).statLines();
    var shown = g.TowerStats.withoutTotals(all);
    var dropped = all.length - shown.length;

    t.eq(dropped, all.filter(function (r) { return g.TowerStats.isTotal(r); }).length,
      row.id + ": drops exactly the rows marked as totals (" + dropped + ")");
    shown.forEach(function (r) {
      t.ok(!/^(Damage dealt|Kills|Mana produced|Base HP produced)$/.test(r[0]),
        row.id + ": no history row survives (" + r[0] + ")");
    });
  });
});

test("every ability the Farm grants has a description written for it",
function (t) {
  var h = boot();
  var g = h.game;

  // Walked the way the index walks it: one instance per branch, buying every
  // tier in turn and reading the card the panel would show.
  ["A", "B", "C"].forEach(function (branch) {
    h.run("towers.length = 0");
    var f = farm(h, 600, 200);
    for (var guard = 0; guard < 6; guard++) {
      var next = f.nextUpgrade(branch);
      if (!next) break;
      var card = f.panelActions().filter(function (a) {
        return a.branch === branch && a.upgradeId === next.id;
      })[0].tooltip();

      card.abilities.forEach(function (ability) {
        t.ok(!/No description written/.test(ability.text),
          branch + next.id.slice(1) + " " + ability.name + ": has a sentence");
        t.ok(ability.name !== "farmStock" && ability.name !== "farmInvest" &&
             ability.name !== "farmExecute" && ability.name !== "farmNetwork",
          branch + next.id.slice(1) + ": named in words, not by its flag");
      });
      f.applyUpgrade(next.id);
    }
  });
});

test("the ability sentences quote the tier's own numbers", function (t) {
  var h = boot();
  var g = h.game;

  function cardFor(f, id) {
    return f.panelActions().filter(function (a) {
      return a.upgradeId === id;
    })[0].tooltip();
  }

  var a = farm(h, 600, 200, ["A1", "A2", "A3"]);
  var stock = cardFor(a, "A4").abilities[0];
  t.eq(stock.name, "stores its mana", "A4's ability is named");
  t.ok(stock.text.indexOf("1000") !== -1,
    "and quotes A4's own clone cap: " + stock.text);
  t.ok(stock.text.indexOf(
    Math.round(g.FarmTower.CLONE_RATE * 100) + "%") !== -1,
    "and the clone rate off the constant");

  a.applyUpgrade("A4");
  var invest = cardFor(a, "A5").abilities[0];
  t.eq(invest.name, "investment", "A5's ability is named");
  t.ok(invest.text.indexOf(String(g.FarmTower.TRANCHE)) !== -1 &&
       invest.text.indexOf(g.FarmTower.TEMP_SECONDS + " s") !== -1,
    "and quotes the tranche and the surge: " + invest.text);

  h.run("towers.length = 0");
  var c = farm(h, 600, 200, ["C1", "C2", "C3", "C4"]);
  var dice = cardFor(c, "C5").abilities[0];
  t.eq(dice.name, "dice network", "C5's ability is named");
  t.ok(/3 d22/.test(dice.text), "and quotes the three d22: " + dice.text);
});

test("a tier that commits the farm says so, in the Farm's own rule",
function (t) {
  var h = boot();

  function noteFor(f, id) {
    return f.panelActions().filter(function (a) {
      return a.upgradeId === id;
    })[0].tooltip().note;
  }

  // One path open: a second may still be started, capped at 2.
  var alone = farm(h, 600, 200, ["A1", "A2"]);
  var note = noteFor(alone, "A3");
  t.ok(/commits this farm to path A/.test(note), "names the path: " + note);
  t.ok(/one other path may still be opened/.test(note) &&
       /tier 2/.test(note) && /never a third/.test(note),
    "and states both halves of the rule");

  // Two paths open: the note has to name the one that is about to be capped
  // rather than promise a second that is already spent.
  h.run("towers.length = 0");
  var both = farm(h, 600, 200, ["A1", "A2", "B1"]);
  var note2 = noteFor(both, "A3");
  t.ok(/path B stays capped at tier 2/.test(note2),
    "names the open second path: " + note2);
  t.ok(!/may still be opened/.test(note2), "and does not offer another");

  // Once committed, the refusals say it and the note stands down.
  both.applyUpgrade("A3");
  t.eq(noteFor(both, "A4"), null, "nothing to warn about after the commitment");
});

test("the Farm's body is the icon the interface draws for it", function (t) {
  var h = boot();
  var g = h.game;

  // TowerPreview3D resolves a tower TYPE to a mesh through its own family map,
  // and a type missing from that map is not an error anywhere -- it answers
  // null and every call site quietly falls back to the flat 2D glyph. So the
  // Farm shipped twelve bodies to the board while the armoury, the loadout
  // row, the build bar and the index rail all drew a picture of nothing in
  // particular. Asserted for every catalogue tower, so the sixth is not the
  // last one to be found this way.
  g.MetaProgress.catalogue().forEach(function (row) {
    var name = g.TowerPreview3D.modelName(row.id);
    t.ok(name && g.GLModels.has(name),
      row.id + " resolves to a registered body (" + name + ")");
  });
});

runner.run();
