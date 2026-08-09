// ---------------------------------------------------------------------------
// Does the STARTER KIT still lose?
//
//   node tools/measure-starter-kit.js
//
// AGENTS.md's meta-progression loop rests on one measured claim: a fresh
// profile CANNOT WIN, because the camo waves (13, 16 and 26) need detection
// and the starter bar had none. That is what makes the first run teach you
// what you are missing and pay for the Longshot that answers it.
//
// The Soldier (2026-07-29) is a starter, and its B3 grants camo detection. So
// for the first time the starter bar can buy detection at all -- $415 all in,
// against the Longshot's $375 -- and the claim had to be RE-MEASURED rather
// than assumed. This is the tool that does it: the real game, the real
// schedule, the real loop, under scripted building policies.
//
// TWO METHOD NOTES, both of which cost a wrong answer before they were fixed:
//
// 1. A greedy builder that spends every $15 the moment it has one NEVER
//    accumulates the $200 an upgrade tier costs. A naive "build, then upgrade"
//    script therefore measures "build" and reports it as "upgrade" -- the
//    first draft of this file confidently reported that two Soldiers reached
//    B3 when none ever had. Each policy below has an explicit SAVING phase in
//    which it deliberately builds nothing, and the reading prints how many
//    Soldiers actually got there so the claim is checkable.
//
// 2. WHEN it starts saving decides the whole run. Saving from a board of four
//    Soldiers dies at wave 11; from ten, it reaches 28. `BUILD_OUT` is that
//    knob, and 10 is the best value found by sweeping it -- fewer and the
//    board cannot earn, more and wave 13 arrives before the detection does.
//
// Absolute numbers here are NOT comparable with the browser-console table in
// AGENTS.md's Balance math section: those were taken by hand, these place at
// Maps.bestSpots and act once per simulated second. Read the rows against each
// other, not against that table.
//
// Not loaded by the game or by the test suite.
// ---------------------------------------------------------------------------

var harness = require("../tests/harness");

// How many bodies go up before anyone saves for upgrades. Swept: 4 -> w11,
// 6 -> w14, 8 -> w19, 10 -> w28.
var BUILD_OUT = 10;
var SMASHERS = 4;
var B_TIERS = ["B1", "B2", "B3", "B4", "B5"];

// Each policy: which body to spam, how deep to take two of them down path B
// (0 = never upgrade), and how many to take there.
var POLICIES = [
  { name: "gunners + smashers (the old kit)", body: "Tower", depth: 0 },
  { name: "soldiers + smashers, no upgrades", body: "Soldier", depth: 0 },
  { name: "soldiers, 2 taken to B3 (camo)", body: "Soldier", depth: 3, want: 2 },
  { name: "soldiers, 2 taken to B4 (+pierce)", body: "Soldier", depth: 4, want: 2 },
  { name: "soldiers, 1 taken to B3 (camo)", body: "Soldier", depth: 3, want: 1 }
];

function playRoute(mapId, policy) {
  var h = harness.boot(mapId);
  var g = h.game;

  // The STARTER bar and nothing else -- that is the question being asked.
  g.BUILD_SLOTS[0] = g.Tower;
  g.BUILD_SLOTS[1] = g.Smasher;
  g.BUILD_SLOTS[2] = g.Soldier;
  g.BUILD_SLOTS[3] = null;
  g.BUILD_SLOTS[4] = null;

  var Body = g[policy.body];
  var spots = g.Maps.bestSpots(g.currentMap, 400) || [];

  // Place at the best rated spot the game itself will accept. BOTH questions
  // are asked, exactly as the game asks them: whyCannotBuild for whether the
  // world allows it, overInterfaceChrome for whether a click would even land.
  function build(Type) {
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i];
      if (g.whyCannotBuild(s.x, s.y, Type) !== null) continue;
      if (g.overInterfaceChrome(s.x, s.y)) continue;
      g.addTower(new Type(s.x, s.y, g.path));
      g.cash -= Type.COST;
      return true;
    }
    return false;
  }

  function bodies() {
    return g.towers.filter(function (t) { return t instanceof Body; });
  }
  function bTiers(t) {
    return t.ownedUpgradeIds ? t.ownedUpgradeIds().filter(function (id) {
      return id.charAt(0) === "B";
    }).length : 0;
  }

  var second = Math.round(1 / g.FIXED_STEP);
  // 33 waves behind 90 s breaks is about 50 simulated minutes; a stalled run
  // has to end rather than spin.
  var limit = 100 * 60;

  for (var t = 0; t < limit && !g.gameOver && !g.victory; t++) {
    var mine = bodies();
    var smashers = g.towers.filter(function (x) { return x instanceof g.Smasher; }).length;

    if (mine.length < BUILD_OUT) {
      if (g.cash >= Body.COST) build(Body);
    } else if (smashers < SMASHERS && g.cash >= g.Smasher.COST) {
      build(g.Smasher);
    } else if (policy.depth > 0 &&
        mine.filter(function (x) { return bTiers(x) >= policy.depth; }).length < policy.want) {
      // SAVING. Nothing is built this second, on purpose -- see note 1.
      var climbing = mine.filter(function (x) {
        var n = bTiers(x);
        return n > 0 && n < policy.depth;
      })[0] || mine.filter(function (x) { return bTiers(x) === 0; })[0] || mine[0];

      var next = climbing && climbing.nextUpgrade && climbing.nextUpgrade("B");
      if (next && B_TIERS.indexOf(next.id) < policy.depth && g.cash >= next.cost) {
        g.buyUpgrade(climbing, next.id);
      }
    } else if (g.cash >= Body.COST) {
      build(Body);
    }

    for (var k = 0; k < second; k++) g.update(g.FIXED_STEP);
  }

  return {
    outcome: g.victory ? "WIN" : (g.gameOver ? "loss" : "timeout"),
    wave: g.reachedWave(),
    baseHp: Math.max(0, Math.round(g.baseHp)),
    towers: g.towers.length,
    seers: g.towers.filter(function (x) { return x.seesCamo; }).length
  };
}

var ROUTES = ["rune-circuit", "mana-coil", "sigil-lattice", "null-meridian"];

function pad(s, n) {
  s = String(s);
  while (s.length < n) s += " ";
  return s;
}

console.log("\nStarter-kit campaign readings -- gunner + Smasher + Soldier only");
console.log("(build " + BUILD_OUT + " bodies, then " + SMASHERS +
  " Smashers, then save for path B)\n");
console.log(pad("policy", 36) + ROUTES.map(function (r) { return pad(r, 19); }).join(""));

POLICIES.forEach(function (policy) {
  var cells = ROUTES.map(function (route) {
    var r = playRoute(route, policy);
    var cell = r.outcome === "WIN" ? "WIN base " + r.baseHp
      : r.outcome + " w" + r.wave;
    cell += " (" + r.towers + "t";
    if (r.seers) cell += ", " + r.seers + " camo";
    cell += ")";
    return pad(cell, 19);
  });
  console.log(pad(policy.name, 36) + cells.join(""));
});

console.log("");
