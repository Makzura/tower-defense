// ---------------------------------------------------------------------------
// Campaign simulator
//
// Plays the real scripted wave schedule through the real game loop (via
// tests/harness.js) under a few scripted building policies, and reports how
// each run ends. This is the reproducible arithmetic behind the schedule in
// game.js -- run it after retuning WAVES, tower stats or the economy, the
// same way tools/price-upgrades.js backs the upgrade prices.
//
//   node tools/simulate-campaign.js [mapId]
//
// Not loaded by the game or by the test suites. Needs Node, like the tests;
// the game itself still needs nothing.
//
// The policies are deliberately crude. "greedy" is a competent-but-simple
// player: build a gunner at the best free spot the moment one is affordable.
// It is a floor on skilled play (no upgrades, no smasher, no selling), so:
//
//   - if "none" survives, the schedule cannot threaten anyone -- too easy;
//   - if "greedy" loses, honest building cannot win -- too hard;
//   - "lazy-N" policies show how much under-building the schedule forgives.
// ---------------------------------------------------------------------------

var harness = require("../tests/harness.js");

// How many gunners the "mixed" policy puts down before it starts saving for
// the expensive types. Below this the run simply dies before the saving can
// pay off; it is a floor on survival, not a tuned figure.
var MIX_CORE_GUNNERS = 30;

// A policy is { limit, mix }. `mix` makes the policy buy the expensive types
// as soon as it can afford them, which is what proves the Longshot and the
// Siphon are REACHABLE in the shipping economy rather than merely listed in
// the build bar.
// Ground the game will actually accept for the type in `slot`. The map's own
// bestSpots are rated for a GUNNER and hug the road, so the Longshot and the
// Siphon -- whose footprints are far larger -- fit at almost none of them.
// Reusing a gunner spot therefore silently downgraded every expensive
// purchase back to a gunner, which is why this searches instead.
function spotFor(h, spots, from, slot) {
  var i;
  for (i = from; i < spots.length; i++) {
    if (h.run("whyCannotBuild(" + spots[i].x + ", " + spots[i].y +
        ", BUILD_SLOTS[" + slot + "])") === null) return spots[i];
  }
  // Nothing on the rated list fits: sweep the playable rectangle.
  for (var x = 40; x < h.game.VIEW_WIDTH - 40; x += 24) {
    for (var y = 40; y < h.game.BAR_Y - 40; y += 24) {
      if (h.run("whyCannotBuild(" + x + ", " + y +
          ", BUILD_SLOTS[" + slot + "])") === null) return { x: x, y: y };
    }
  }
  return null;
}

function simulate(mapId, buildLimit, mix) {
  var h = harness.boot(mapId);
  var spots = h.game.Maps.bestSpots(h.game.Maps.byId(mapId), 60);
  var bought = {};
  var placed = 0;
  var t = 0;
  var STEP = 0.5;                       // how often the policy checks its wallet
  var CAP = 900;                        // well past the last possible leak

  var stats = { killed: 0, leaked: 0 };
  var Enemy = h.game.Enemy;
  var originalUpdate = Enemy.prototype.update;
  var originalTakeDamage = Enemy.prototype.takeDamage;
  Enemy.prototype.update = function (dt) {
    var was = this.leaked;
    originalUpdate.call(this, dt);
    if (!was && this.leaked) stats.leaked++;
  };
  Enemy.prototype.takeDamage = function (amount, defPierce) {
    var was = this.dead;
    var dealt = originalTakeDamage.call(this, amount, defPierce);
    if (!was && this.dead) stats.killed++;
    return dealt;
  };

  try {
    while (t < CAP && !h.game.gameOver && !h.game.victory) {
      // When mixing, the policy plays the way a person does: put down a
      // survivable core of gunners first, then SAVE for each expensive tower
      // in turn instead of dribbling every $15 into another gunner. Without
      // the saving step the balance never rises above the price of a gunner
      // and the expensive towers are unreachable in practice even though the
      // run earns many times their price -- exactly the trap a real player
      // falls into, and the thing worth proving is escapable.
      var slot = 0;
      var needed = h.game.Tower.COST;

      if (mix && placed >= MIX_CORE_GUNNERS) {
        // The DEAREST type not yet owned is the next goal. Cheapest-first
        // never reaches the Siphon: each small purchase resets the savings
        // and the balance never climbs to $800 while gunners keep eating it.
        var goal = -1;
        for (var s2 = 1; s2 < h.game.BUILD_SLOTS.length; s2++) {
          var type = h.game.BUILD_SLOTS[s2];
          if (!type || bought[s2]) continue;
          if (goal < 0 || type.COST > h.game.BUILD_SLOTS[goal].COST) goal = s2;
        }
        if (goal >= 0) {
          if (h.game.cash >= h.game.BUILD_SLOTS[goal].COST) {
            slot = goal;
            needed = h.game.BUILD_SLOTS[goal].COST;
          } else {
            // Saving properly: a gunner only comes out of what is spare
            // ABOVE the goal, so the balance actually climbs to it. A partial
            // reserve never gets there -- gunners keep pulling the balance
            // back down and the dearest tower is never bought.
            needed = h.game.Tower.COST + h.game.BUILD_SLOTS[goal].COST;
          }
        }
      }

      if (placed < buildLimit && h.game.cash >= needed) {
        var spot = spotFor(h, spots, placed, slot);
        if (spot) {
          h.place(spot.x, spot.y, slot);
          if (slot > 0) bought[slot] = true;
          placed++;
        } else if (slot === 0) {
          placed++;                    // no gunner ground left; stop trying
        }
      }

      h.step(STEP);
      t += STEP;
    }
  } finally {
    Enemy.prototype.update = originalUpdate;
    Enemy.prototype.takeDamage = originalTakeDamage;
  }

  var roster = h.game.towers.map(function (x) { return x.name; })
    .filter(function (n, i, all) { return all.indexOf(n) === i; }).join("+");

  return {
    roster: roster,
    outcome: h.game.victory ? "VICTORY" : (h.game.gameOver ? "LOSS" : "TIMEOUT"),
    seconds: t,
    towers: placed,
    baseHp: Math.round(h.game.baseHp),
    cash: Math.round(h.game.cash),
    killed: stats.killed,
    leaked: stats.leaked,
    reachedWave: h.game.reachedWave()
  };
}

var mapId = process.argv[2] || null;
var maps = mapId ? [mapId] : ["mana-coil", "rune-circuit", "sigil-lattice", "null-meridian"];
var policies = [
  { name: "none      ", limit: 0 },
  { name: "lazy-6    ", limit: 6 },
  { name: "lazy-12   ", limit: 12 },
  { name: "lazy-20   ", limit: 20 },
  { name: "greedy    ", limit: 999 },
  { name: "mixed     ", limit: 999, mix: true }
];

maps.forEach(function (id) {
  console.log("\n== " + id);
  policies.forEach(function (p) {
    var r = simulate(id, p.limit, p.mix);
    console.log("  " + p.name + " " + r.outcome +
      "  t=" + r.seconds.toFixed(0) + "s" +
      "  wave " + r.reachedWave +
      "  towers=" + r.towers +
      "  base=" + r.baseHp +
      "  $" + r.cash +
      "  killed=" + r.killed + " leaked=" + r.leaked +
      (p.mix ? "\n              roster: " + r.roster : ""));
  });
});
