// ---------------------------------------------------------------------------
// Test harness
//
// Boots the REAL game in Node with a stubbed canvas, so behaviour can be
// checked without a browser. Nothing here is loaded by the game itself.
//
// This does not add a toolchain: it uses only Node's built-in fs/path/vm, has
// no dependencies, and nothing needs installing. The game still runs by
// double-clicking index.html with no software at all.
//
// Written in the same ES5 style as the game. Node does not need that, but one
// style across the repo is one less thing to think about.
// ---------------------------------------------------------------------------

var fs = require("fs");
var nodePath = require("path");
var vm = require("vm");

var ROOT = nodePath.join(__dirname, "..");

// The script list is READ OUT OF index.html rather than duplicated here, so a
// new game file is picked up by the tests automatically and the two can never
// disagree about what the game consists of.
//
// Debug overlays (js/debug-*.js) are skipped on purpose: they are pure DOM
// chrome with no simulation in them, and the stub document below deliberately
// implements only what the game proper touches.
function gameScripts() {
  var html = fs.readFileSync(nodePath.join(ROOT, "index.html"), "utf8");
  var found = [];
  var re = /<script\s+src="([^"]+)"\s*>\s*<\/script>/g;
  var match;

  while ((match = re.exec(html)) !== null) {
    if (match[1].indexOf("/debug-") !== -1) continue;
    found.push(match[1]);
  }

  if (found.length === 0) {
    throw new Error("harness: found no <script src=...> in index.html");
  }
  return found;
}

// A canvas context that accepts every call and records nothing. Tests assert
// on simulation state, never on pixels.
//
// One exception: measureText returns a real estimate rather than undefined.
// The panel uses it to clip labels so text cannot overlap (see fitText in
// game.js), so a stub that returned nothing would both crash that code and
// hide layout bugs from the suite. The estimate is deliberately crude --
// proportional to length and the font size parsed out of ctx.font -- but it
// is monotonic, which is all the clipping logic needs.
function stubContext() {
  var state = {};

  return new Proxy(state, {
    get: function (target, key) {
      if (key === "measureText") {
        return function (text) {
          var size = 13;
          var match = /(\d+(?:\.\d+)?)px/.exec(target.font || "");
          if (match) size = parseFloat(match[1]);
          return { width: String(text).length * size * 0.55 };
        };
      }
      // A GRADIENT IS AN OBJECT, not a call that returns nothing. Canvas hands
      // back a CanvasGradient and the caller then talks to it; a stub that
      // returned undefined crashed the moment the environment pass started
      // painting skies, which is a hole in the stub rather than a bug in the
      // thing being tested. Records nothing, accepts everything, like the rest.
      if (key === "createLinearGradient" || key === "createRadialGradient" ||
          key === "createPattern") {
        return function () { return { addColorStop: function () {} }; };
      }
      if (key in target) return target[key];
      return function () {};
    },
    set: function (target, key, value) {
      target[key] = value;
      return true;
    }
  });
}


// Boots a fresh game. Every returned helper drives the game through its own
// public entry points -- real event handlers, the real update() -- so a test
// exercises the same code the browser does.
// The board the suites stand on unless they ask for another. See the note
// at the chooseMap call below for why this is not Maps.DEFAULT_ID.
var HARNESS_DEFAULT_MAP = "rune-circuit";

function boot(mapId) {
  var canvasListeners = {};
  var windowListeners = {};
  var ctx = stubContext();

  var canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: function () { return ctx; },
    addEventListener: function (name, fn) { canvasListeners[name] = fn; },
    // Reported at exactly the game's internal resolution, so test coordinates
    // and game coordinates are the same numbers (see toGameCoords in game.js).
    getBoundingClientRect: function () {
      return { left: 0, top: 0, width: sandbox.VIEW_WIDTH, height: sandbox.VIEW_HEIGHT };
    }
  };

  var sandbox = {
    console: console,
    performance: { now: function () { return 0; } },
    // Swallowed: tests drive the clock themselves via step().
    requestAnimationFrame: function () { return 0; },
    document: { getElementById: function () { return canvas; } },
    window: { addEventListener: function (name, fn) { windowListeners[name] = fn; } }
  };
  sandbox.window.document = sandbox.document;

  vm.createContext(sandbox);
  gameScripts().forEach(function (src) {
    var file = nodePath.join(ROOT, src);
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: src });
  });

  // Every tower owned and in the bar, before init() reads the loadout.
  //
  // A REAL profile starts with the gunner and the Smasher; the Longshot and
  // the Siphon are bought with meta coins (js/meta.js). The suite is about
  // what the towers DO, not about how they are unlocked, and a locked roster
  // would silently reduce most of these tests to "the tower was not in the
  // bar". There is no localStorage in Node, so this profile is in-memory and
  // dies with the process -- one boot cannot leak progress into the next.
  //
  // The unlock is a real MetaProgress entry point, not a test-only back door
  // in the gate: the shipping game and the harness go through the same code.
  sandbox.MetaProgress.unlockAll();
  sandbox.rebuildBuildBar();

  // The game normally starts on window load; the harness starts it explicitly.
  sandbox.init();

  var api = {
    // Escape hatch: evaluate an expression inside the game's global scope.
    // Prefer the named helpers below -- they go through real entry points.
    run: function (expr) { return vm.runInContext(expr, sandbox); },

    game: sandbox,

    // --- input ---------------------------------------------------------

    click: function (x, y) { canvasListeners.click({ clientX: x, clientY: y }); },

    // Leave the title screen for the route chooser, by clicking PLAY exactly
    // as a player does. boot() calls this itself, so every test sees the same
    // state it saw before the menu existed -- `boot(null)` still means "stop
    // on the chooser". A test that wants the MENU calls `run("openMenu()")`
    // and drives its buttons from there.
    pressPlay: function () {
      var r = sandbox.playButtonRect();
      api.click(r.x + r.w / 2, r.y + r.h / 2);
    },

    // Start a run by clicking a map card, exactly as a player does. boot()
    // calls this itself, so a test only needs it to switch routes mid-suite.
    chooseMap: function (id) {
      var list = sandbox.Maps.LIST;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id !== id) continue;
        var r = sandbox.mapCardRect(i);
        api.click(r.x + r.w / 2, r.y + r.h / 2);
        return list[i];
      }
      throw new Error("harness: no such map '" + id + "'");
    },
    move: function (x, y) { canvasListeners.mousemove({ clientX: x, clientY: y }); },
    leave: function () { canvasListeners.mouseleave(); },
    key: function (k) { windowListeners.keydown({ key: k }); },

    // Click the middle of build slot i.
    armSlot: function (i) {
      var r = sandbox.slotRect(i);
      api.click(r.x + r.w / 2, r.y + r.h / 2);
    },

    // Which build slot holds this constructor, or -1. **Slot indices are not
    // stable and must not be typed in**: deleting the gunner on 2026-07-30 shed
    // the first catalogue entry and shifted every one of them down by one. Ask
    // for the tower you mean.
    slotOf: function (ctor) {
      for (var i = 0; i < sandbox.BUILD_SLOTS.length; i++) {
        if (sandbox.BUILD_SLOTS[i] === ctor) return i;
      }
      return -1;
    },

    // Arm a build slot and place one, the way a player would. The FIRST slot
    // unless told otherwise. Returns the tower placed, or null if the placement
    // was refused.
    //
    // Deliberately NOT `towers[towers.length - 1]`, which is what this used to
    // do. addTower keeps the array sorted by pathProgress -- that ordering IS
    // the target-claiming priority (see AGENTS.md) -- so a tower placed
    // earlier along the road lands in the MIDDLE of the array and the last
    // entry belongs to somebody else. A test that placed a gunner far down the
    // route and then a smasher near the start got the gunner back and failed
    // with "smasher.facingTarget is not a function", which points nowhere near
    // the actual cause. Diffing the array says exactly what arrived, and
    // returns null on a refusal rather than an unrelated tower.
    place: function (x, y, slot) {
      var want = (slot === undefined) ? 0 : slot;
      if (sandbox.selectedSlot !== want) api.armSlot(want);
      var before = sandbox.towers.slice();
      api.click(x, y);
      for (var i = 0; i < sandbox.towers.length; i++) {
        if (before.indexOf(sandbox.towers[i]) === -1) return sandbox.towers[i];
      }
      return null;
    },

    // Resolved by CONSTRUCTOR, not by the literal 1 this used to be. See
    // slotOf: the gunner's deletion moved the Warbringer from slot 1 to slot 0,
    // and a hardcoded index would have quietly started placing a different
    // tower rather than failing.
    placeSmasher: function (x, y) {
      return api.place(x, y, api.slotOf(sandbox.Smasher));
    },

    // **THE GUNNER, WHICH IS NO LONGER A TOWER YOU CAN BUILD** (2026-07-30).
    //
    // It is not in the catalogue, so it has no build slot and cannot be placed
    // through one. It is still in the code as the shared footprint /
    // containsPoint source and as the 100 u.l. reference (see the banner in
    // js/tower.js), and a large part of this suite measures the reference
    // tower's PHYSICS -- target claiming, u.l. invariance, bullet flight,
    // throughput per unit of DPS. Those tests are still worth having and still
    // true, so this constructs one directly and drops it on the board.
    //
    // It bypasses the click handler, which the slot-based `place` deliberately
    // does not. That is the trade: what it can no longer prove is that the
    // PLACEMENT UI works for this tower, and the UI no longer offers it, so
    // there is nothing left to prove there. addTower is the game's own
    // insertion, so the pathProgress ordering that target claiming rests on is
    // still the real one.
    placeGunner: function (x, y) {
      if (sandbox.whyCannotBuild(x, y, sandbox.Tower)) return null;
      var tower = new sandbox.Tower(x, y, sandbox.path);
      sandbox.addTower(tower);
      return tower;
    },

    // --- clock ---------------------------------------------------------

    // Advance the simulation, at the same fixed step the real loop uses.
    step: function (seconds) {
      var steps = Math.round(seconds / sandbox.FIXED_STEP);
      for (var i = 0; i < steps; i++) sandbox.update(sandbox.FIXED_STEP);
    },

    // Advance like step(), but call every wave in the moment its break opens
    // -- what a player does with the Send next wave button, at the fastest a
    // player could possibly do it.
    //
    // For long runs that need to REACH somewhere: the victory path has to get
    // through thirty-five waves, and thirty-four 90 s breaks would add nearly
    // an hour of simulated empty road to a test about whether the scheduler
    // runs dry.
    //
    // Since v0.4.7 a called break is WAVE_CALL_DELAY (3 s) rather than one
    // frame, so a flat second budget for "play the whole campaign" is fragile.
    // Loop until the outcome you want, with a generous cap.
    //
    // NOT for throughput measurements. Back-to-back waves are denser than
    // spaced ones, and a denser board changes what a fixed number of towers
    // can kill -- use pinWaveBreak for those.
    stepCallingWaves: function (seconds) {
      var steps = Math.round(seconds / sandbox.FIXED_STEP);
      for (var i = 0; i < steps; i++) {
        sandbox.skipNextWave();
        sandbox.update(sandbox.FIXED_STEP);
      }
    },

    // Drive the REAL loop -- frame(), not update() -- for `seconds` of
    // WALL-CLOCK time at a steady 60 fps.
    //
    // step() advances simulation directly and so cannot see gameSpeed at all,
    // which is the point of where gameSpeed lives: it is applied once, to how
    // much time frame() hands the fixed-step accumulator, and update() is
    // deliberately unaware of it. Testing it therefore has to go in through
    // the loop. requestAnimationFrame is swallowed by the stub, so calling
    // frame() by hand does not recurse.
    wallClock: function (seconds) {
      var frames = Math.round(seconds * 60);
      for (var i = 1; i <= frames; i++) {
        // Timestamps computed from the base rather than accumulated, so a long
        // run cannot drift a fraction of a step and hand one frame an extra
        // update.
        sandbox.frame(i * (1000 / 60));
      }
    },

    // Hold the gap between waves at `seconds` for this boot.
    //
    // A NO-OP SINCE THE TIMELINE SCHEDULER (2026-08-25), and kept as a named
    // no-op rather than deleted from its six call sites (all in run.js:
    // 133, 140, 3057, 3062, 4195, 4205), because what it was FOR still needs
    // saying at each of them.
    //
    // It used to write `WAVE_BREAK`, the 90 s ceiling on the pause between two
    // waves. Every throughput test in the suite measures what a board does over
    // a FIXED window of simulated time -- 120 s of gunners, 70 s of one route
    // against another -- and at 90 s those windows contained one wave and a
    // long silence: the four routes all scored an identical 95 the day the
    // break was lengthened, because none of them reached wave 2. Pinning it at
    // the old 5 s put the waves back.
    //
    // There is no such number any more. A wave now ends on its own `duration`
    // or on being wiped out, and the gap after it is 5 s (or 3 with auto-send)
    // and nothing else -- so a board that is killing things already runs at the
    // cadence these tests were pinning it to, and a board that is not is being
    // measured on exactly the thing it is bad at. Nothing left to hold still.
    //
    // The argument for pinning was never that the tests were dodging the
    // change: wave spacing is a PACING choice, income is a fixed bounty per
    // kill and nothing per second, so the economy is identical either way, and
    // holding the pacing still is what leaves the route or the tower count as
    // the only variable. That argument is now satisfied by the scheduler
    // itself.
    pinWaveBreak: function (seconds) {
      return seconds;
    },

    draw: function () { sandbox.draw(); },

    // --- board setup ---------------------------------------------------

    clearBoard: function () {
      sandbox.enemies = [];
      sandbox.bullets = [];
      sandbox.towers = [];
      sandbox.inspected = null;
      sandbox.selectedSlot = null;
    },

    // Put an enemy at an exact spot on the path, for deterministic scenarios.
    // refreshPos, not path.pointAt: since v0.4.5 an enemy walks a little to
    // one side of the centreline (Enemy.laneOffsetUl), and writing pos from
    // the centreline would put a test enemy somewhere it would never actually
    // stand -- and somewhere it would jump away from on the first update().
    spawnAt: function (progress, health, typeId) {
      var e = new sandbox.Enemy(sandbox.path, health, typeId);
      e.progress = progress;
      e.refreshPos();
      sandbox.enemies.push(e);
      return e;
    },

    // --- measurement ---------------------------------------------------

    // Run for a while and count what happened to the enemies. update() drops
    // dead and leaked enemies at the end of each step, so the only reliable
    // place to count them is at the moment the flag flips.
    //
    // Every caller measures throughput over a fixed window, so every caller
    // should pinWaveBreak first -- see that helper for why.
    tally: function (seconds) {
      var Enemy = sandbox.Enemy;
      var originalUpdate = Enemy.prototype.update;
      var originalTakeDamage = Enemy.prototype.takeDamage;
      var killed = 0;
      var leaked = 0;

      Enemy.prototype.update = function (dt) {
        var was = this.leaked;
        originalUpdate.call(this, dt);
        if (!was && this.leaked) leaked++;
      };
      Enemy.prototype.takeDamage = function (amount) {
        var was = this.dead;
        var dealt = originalTakeDamage.call(this, amount);
        if (!was && this.dead) killed++;
        return dealt;
      };

      try {
        api.step(seconds);
      } finally {
        Enemy.prototype.update = originalUpdate;
        Enemy.prototype.takeDamage = originalTakeDamage;
      }

      return { killed: killed, leaked: leaked };
    },

    // Counts shots fired against damage actually landed. They should be equal:
    // a gunner's bullet lands 1 damage, so a gap is wasted firepower. Damage
    // is intercepted directly now that cash is paid per kill rather than per
    // point of damage -- the cash delta stopped being a damage meter the
    // moment bounties replaced CASH_PER_DAMAGE.
    // Returns a stop() that reports the totals.
    meter: function () {
      var Tower = sandbox.Tower;
      var Enemy = sandbox.Enemy;
      var originalFire = Tower.prototype.fire;
      var originalTakeDamage = Enemy.prototype.takeDamage;
      var shots = 0;
      var kills = 0;
      var damage = 0;

      Tower.prototype.fire = function (target, bullets) {
        shots++;
        return originalFire.call(this, target, bullets);
      };

      // Kills are COUNTED, not inferred from damage / BASE_HEALTH. Enemies
      // have types now (v0.3.5), so a wave's health need not match the base
      // figure and dividing would silently report the wrong rate -- which it
      // did, the moment types arrived.
      Enemy.prototype.takeDamage = function () {
        var was = this.dead;
        var dealt = originalTakeDamage.apply(this, arguments);
        damage += dealt;
        if (!was && this.dead) kills++;
        return dealt;
      };

      return function stop() {
        Tower.prototype.fire = originalFire;
        Enemy.prototype.takeDamage = originalTakeDamage;
        return {
          shots: shots,
          damage: damage,
          wasted: shots - damage,
          shotsPerKill: kills > 0 ? shots / kills : 0,
          // A claim must never outlive the bullet holding it.
          strayClaims: sandbox.enemies.filter(function (e) {
            return e.incomingDamage > 0;
          }).length - sandbox.bullets.length
        };
      };
    }
  };

  // The game boots into the title menu, then the map chooser, so nothing
  // simulates until a route is picked. Both steps are taken here through the
  // real click handlers, which leaves every test looking at the same state it
  // saw before either screen existed. Pass null to stop on the chooser and
  // test it directly.
  api.pressPlay();
  if (mapId !== null) {
    // THE SUITES BOOT ON A BOARD WITH NO TERRAIN, and they say which one
    // rather than following Maps.DEFAULT_ID.
    //
    // Ironwood Frontier became the default on 2026-08-26 and it is the first
    // map with solid geometry -- rocks that refuse placement and block sight.
    // Around a hundred and forty tests here are about TOWERS, not about the
    // default board, and they place gunners and read what they hit on the
    // assumption of an empty floor. Following the default silently moved all
    // of them onto a forest and broke thirty-two at once, none of which had
    // anything to do with what had changed.
    //
    // So this is pinned, exactly as pinWaveBreak pins the pacing and for the
    // same reason: the harness holds the SETTING still so the tests can be
    // about their subject. A test that wants the shipping default asks for it
    // by name -- harness.boot("ironwood-frontier") -- and several now do.
    api.chooseMap(mapId || HARNESS_DEFAULT_MAP);

    // AND THEN START THE RUN, skipping the ten-second opening pause.
    //
    // A shipping run opens on a countdown with an empty road (RUN_START_DELAY,
    // 2026-07-31). Almost nothing in this suite is about that: these tests are
    // about what towers do to enemies, and they are written against t=0 being
    // "wave 1's first body is on the road" -- which is what boot() meant for
    // every test written before that date. Handing all of them ten seconds of
    // empty road would shift every throughput measurement in the suite to
    // re-prove a pause that two tests can prove directly.
    //
    // Same trade as pinWaveBreak: the harness holds the run's PACING still so
    // the tests can be about its content.
    //
    // It goes through the game's own scheduler and not through a fake. This
    // read `waveCountdown = spawnScheduledEnemy()` until the timeline rewrite,
    // when spawning stopped returning the delay to the next body -- there is no
    // such number on a timeline, only a clock. Zeroing the transition and
    // stepping the scheduler by ZERO seconds is the same instant expressed the
    // way the new scheduler expresses it: the opening pause expires, wave 1
    // starts, its clock reads 0.00, and every event the wave authors at `at: 0`
    // is on the road. Nothing else in the world moves, because no other system
    // is stepped.
    //
    // updateWaves rather than update: a zero-length update() would also pulse
    // every enemy, tower and effect on the board, and a harness that quietly
    // ran one extra half-frame of the world is exactly the sort of thing that
    // makes a timing test unreproducible.
    //
    // A test that wants the REAL opening asks for the chooser and clicks
    // through it itself, which touches none of this:
    //
    //     var h = harness.boot(null);
    //     h.chooseMap(h.game.Maps.DEFAULT_ID);   // waveCountdown === 10
    sandbox.waveCountdown = 0;
    sandbox.updateWaves(0);
  }

  return api;
}


// ---------------------------------------------------------------------------
// AUTHORED-PIXEL COORDINATES -> LIVE ONES.
//
// Map coordinates in the suites are written as the pixel positions the road was
// originally DRAWN at. w() maps them onto wherever that point actually sits
// now: the path is authored in u.l. (PATH_POINTS_UL = drawn pixels /
// AUTHORED_AT_PX_PER_UL) and rendered through ul(), so the same ratio maps a
// drawn coordinate to a live one. Reading both constants from the game means
// retuning either cannot invalidate a single coordinate in a suite -- which has
// already happened twice.
//
// INTERFACE coordinates -- build slots, the Sell button, the panel -- are NOT
// passed through this. Chrome is anchored to the 1280x720 viewport and
// deliberately does not scale (see AGENTS.md).
//
// It lives HERE, in the harness, rather than in either suite, because both need
// it and a second copy of one conversion reading the same two game constants is
// how the two quietly diverge. content.test.js had no copy at all: four of its
// tests called w() and threw `ReferenceError: w is not defined`, so they had
// never executed a single assertion. Copying the four lines across would have
// fixed those four and created exactly the duplication this project keeps
// paying for -- so it moved instead. Same precedent as slotOf above.
// ---------------------------------------------------------------------------
function w(h, value) {
  return value * h.game.UNIT_LENGTH / h.game.AUTHORED_AT_PX_PER_UL;
}


// WHERE A RESULT-SCREEN BUTTON ACTUALLY IS, asked of the game rather than
// typed. Since 2026-08-26 `resultButtons()` is the single source of both the
// drawing and the hit test, and which buttons exist depends on whether the
// panel is folded -- so a test that wants to click one has to ask, exactly as
// onClick does. Typing a rect here is how a suite ends up clicking a button
// that has moved and reporting the move as a behaviour change.
function resultRect(h, id) {
  var list = h.run("resultButtons()");
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  throw new Error("harness: no result button '" + id + "' (folded: " +
    h.run("resultMinimised") + ")");
}

module.exports = { boot: boot, gameScripts: gameScripts, w: w, resultRect: resultRect };
