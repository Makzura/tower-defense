// ---------------------------------------------------------------------------
// Smoke test for sandbox.html + js/sandbox/sandbox.js.
//
// The sandbox runs the REAL game with three things overridden (cash, wave
// spawning, roster), so the things worth checking here are that the wiring
// holds: that the hooks actually take, that both tower types can be placed
// through the game's own placement path, that spawned enemies walk and get
// shot, and that Longshot's upgrades apply while it is standing on the map.
//
// Numeric behaviour of the towers themselves is covered by
// tests/long-range-dps.test.js; game rules by tests/run.js. This is the
// integration seam neither of those can see.
//
// Run with: node tests/sandbox.smoke.js
// ---------------------------------------------------------------------------

var fs = require("fs");
var nodePath = require("path");
var vm = require("vm");

var ROOT = nodePath.join(__dirname, "..");

// Read the script list out of sandbox.html, the same way tests/harness.js
// reads it out of index.html -- so adding a script to the page cannot leave
// this test loading a stale set.
function sandboxScripts() {
  var html = fs.readFileSync(nodePath.join(ROOT, "sandbox.html"), "utf8");
  var found = [];
  var re = /<script\s+src="([^"]+)"\s*>\s*<\/script>/g;
  var match;
  while ((match = re.exec(html)) !== null) found.push(match[1]);
  if (found.length === 0) throw new Error("no <script src=...> found in sandbox.html");
  return found;
}

// Mirrors tests/harness.js's stub, including the measureText estimate the
// panel's text-clipping needs. See the note there.
function stubContext() {
  var state = {};
  return new Proxy(state, {
    get: function (t, k) {
      if (k === "measureText") {
        return function (text) {
          var size = 13;
          var m = /(\d+(?:\.\d+)?)px/.exec(t.font || "");
          if (m) size = parseFloat(m[1]);
          return { width: String(text).length * size * 0.55 };
        };
      }
      // A gradient factory has to return something with addColorStop on it.
      // The catch-all below returns undefined, which is fine for a draw call
      // whose result is discarded but not for one whose result is then USED --
      // and every gradient in js/skins/draw-pack.js is used on the next line.
      //
      // This was invisible until the B5 channel was made to resolve in this
      // file: the strike's impact effect is the first drawn thing on the
      // sandbox's path that builds a gradient, so the stub gap and the
      // unresolved channel had been hiding each other. Without this the smoke
      // test does not fail, it ABORTS partway, which reads as fewer failures.
      //
      // NOTE this proves only that the path does not throw. It says nothing
      // about what any of it LOOKS like -- that needs pixels, not this file.
      if (k === "createLinearGradient" || k === "createRadialGradient" ||
          k === "createConicGradient" || k === "createPattern") {
        return function () {
          return { addColorStop: function () {} };
        };
      }
      return (k in t) ? t[k] : function () { return undefined; };
    },
    set: function (t, k, v) { t[k] = v; return true; }
  });
}

function makeElement(tag) {
  var listeners = {};
  var el = {
    tagName: (tag || "div").toUpperCase(),
    style: {},
    dataset: {},
    className: "",
    value: "",
    checked: false,
    textContent: "",
    childNodes: [],
    firstChild: null,
    lastChild: null,
    width: 0,
    height: 0,
    _listeners: listeners,

    addEventListener: function (name, fn) { listeners[name] = fn; },
    getContext: function () { return stubContext(); },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 1280, height: 720 }; },

    appendChild: function (child) {
      el.childNodes.push(child);
      el.firstChild = el.childNodes[0];
      el.lastChild = el.childNodes[el.childNodes.length - 1];
      return child;
    },
    insertBefore: function (child) {
      el.childNodes.unshift(child);
      el.firstChild = el.childNodes[0];
      el.lastChild = el.childNodes[el.childNodes.length - 1];
      return child;
    },
    removeChild: function (child) {
      var i = el.childNodes.indexOf(child);
      if (i !== -1) el.childNodes.splice(i, 1);
      el.firstChild = el.childNodes[0] || null;
      el.lastChild = el.childNodes[el.childNodes.length - 1] || null;
      return child;
    },
    querySelectorAll: function (selector) {
      // Only "button" is ever asked for (the tower list).
      return el.childNodes.filter(function (c) {
        return c.tagName === selector.toUpperCase();
      });
    },
    fire: function (name, evt) {
      if (!listeners[name]) throw new Error("no '" + name + "' listener on <" + el.tagName + ">");
      listeners[name](evt || {});
    },
    has: function (name) { return !!listeners[name]; }
  };

  // innerHTML = "" is used to clear; setting it to markup only needs to not
  // throw, since nothing reads it back.
  Object.defineProperty(el, "innerHTML", {
    get: function () { return ""; },
    set: function (v) { if (v === "") { el.childNodes = []; el.firstChild = null; el.lastChild = null; } }
  });

  return el;
}

var IDS = [
  "sidebar",
  "game", "towerList", "enemyHp", "enemyType", "enemyTier", "spawnOne", "spawnFive", "spawnWave1",
  "spawnWave2", "spawnTanky", "clearEnemies", "autoWaves", "selectedName",
  "mapList", "selectedStats", "upgradeControls", "buyA", "buyB", "reaimCone", "useAbility",
  "upgradeNote", "maxField", "maxFieldStatus", "showRange", "showDeadzone", "showFootprint", "showLabels",
  "unitLength", "resetBoard", "exitToMenu", "runState", "log",
  "goldInput", "setGold", "goldPresets", "lockGold", "baseHpInput",
  "setBaseHp", "baseHpPresets"
];

var elements = {};
IDS.forEach(function (id) { elements[id] = makeElement(id === "game" ? "canvas" : "div"); });
elements.enemyHp.value = "3";

// game.js, the shared debug command and sandbox.js register load listeners,
// and the ORDER matters: game.js's init() has to run first so
// update/draw/restartGame exist for the sandbox to wrap. Keep every listener.
var windowListeners = {};
var intervals = [];

var sandbox = {
  console: console,
  Math: Math,
  Proxy: Proxy,
  Object: Object,
  Number: Number,
  isNaN: isNaN,
  isFinite: isFinite,
  parseInt: parseInt,
  parseFloat: parseFloat,
  Infinity: Infinity,
  setInterval: function (fn) { intervals.push(fn); return intervals.length; },
  performance: { now: function () { return 0; } },
  requestAnimationFrame: function () { return 0; },
  document: {
    getElementById: function (id) {
      if (!elements[id]) throw new Error("sandbox smoke: no stub element for #" + id);
      return elements[id];
    },
    createElement: function (tag) { return makeElement(tag); }
  },
  window: {
    addEventListener: function (name, fn) {
      (windowListeners[name] = windowListeners[name] || []).push(fn);
    }
  }
};
sandbox.window.document = sandbox.document;
sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;

vm.createContext(sandbox);
sandboxScripts().forEach(function (src) {
  vm.runInContext(fs.readFileSync(nodePath.join(ROOT, src), "utf8"), sandbox, { filename: src });
});

// The sandbox installs its own full roster over BUILD_SLOTS anyway, but the
// profile is unlocked here too so that what this test boots matches what
// tests/harness.js boots. See the note there.
sandbox.MetaProgress.unlockAll();

function run(expr) { return vm.runInContext(expr, sandbox); }
function step(seconds) {
  var n = Math.round(seconds / sandbox.FIXED_STEP);
  for (var i = 0; i < n; i++) sandbox.update(sandbox.FIXED_STEP);
}

var failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log("  ok   " + label);
  } else {
    failures.push(label);
    console.log("  FAIL " + label + (detail ? "\n         " + detail : ""));
  }
}

console.log("\nSandbox smoke test\n");

// Boot: game.js runs init(), the shared debug UI suppresses its floating box,
// then sandbox.js wraps the game.
check("all load listeners registered (game, shared debug command, sandbox)",
  windowListeners.load.length === 3,
  "listeners = " + windowListeners.load.length);
windowListeners.load.forEach(function (fn) { fn(); });

check("the page boots and the sandbox installs", true);

// --- sandbox rules ---------------------------------------------------------

check("cash is effectively infinite", sandbox.cash >= 999999,
  "cash = " + sandbox.cash);

check("every tower type is in the build bar",
  sandbox.BUILD_SLOTS[0] === sandbox.Smasher &&
  sandbox.BUILD_SLOTS[1] === sandbox.LongshotTower &&
  sandbox.BUILD_SLOTS[2] === sandbox.BeamTower &&
  sandbox.BUILD_SLOTS[3] === sandbox.Soldier &&
  // The Summoner took the last slot on 2026-08-09. The sandbox's roster is its
  // own list (ROSTER in js/sandbox/sandbox.js) rather than the meta catalogue,
  // so a tower added to the game has to be added there too or the workbench
  // stops being a truthful preview of it -- which is exactly what this line is
  // for.
  sandbox.BUILD_SLOTS[4] === sandbox.BlubTower,
  "slots = " + sandbox.BUILD_SLOTS.map(function (s) { return s && s.DISPLAY_NAME; }).join(", "));

// --- the extended speed ladder ---------------------------------------------
//
// 5x and 10x on top of the game's 1x/2x/3x (2026-08-09). The workbench EXTENDS
// the shipping array rather than replacing the control, so the order the button
// cycles through has to still contain every multiple the game ships with, in
// its original order -- that is what these two lines are really pinning.

check("the sandbox adds 5x, 10x and 20x to the speed ladder",
  sandbox.GAME_SPEEDS.join(",") === "1,2,3,5,10,20",
  "speeds = " + sandbox.GAME_SPEEDS.join(","));

check("the speed button cycles through all six and wraps",
  (function () {
    var seen = [];
    // Seven presses from 1x: six distinct speeds and then back to the start.
    for (var i = 0; i < 7; i++) seen.push(sandbox.cycleGameSpeed());
    return seen.join(",") === "2,3,5,10,20,1,2";
  })(),
  "cycle = " + sandbox.gameSpeed + "x");

// --- a base that does not end the experiment -------------------------------

check("the sandbox base has 100 000 HP, and keeps it across a restart",
  (function () {
    if (sandbox.BASE_MAX_HP !== 100000 || sandbox.baseHp !== 100000) return false;
    // It moves the CONSTANT, so restartGame -- which sets the live value from
    // it -- carries it. Setting only `baseHp` would have lasted until the first
    // press of the sidebar's restart.
    sandbox.baseHp = 5;
    sandbox.restartGame();
    return sandbox.baseHp === 100000;
  })(),
  "base = " + sandbox.baseHp + " / " + sandbox.BASE_MAX_HP);

// Left where it started, so nothing below runs at 10x by accident.
while (sandbox.gameSpeed !== 1) sandbox.cycleGameSpeed();

check("a fast frame runs many fixed steps and never a scaled one",
  (function () {
    // The whole design of gameSpeed is that the STEP never changes, only how
    // many of them run (see the note on GAME_SPEEDS in js/game.js). At 10x a
    // frame must therefore be ten ordinary 1/60 s steps, not one big one.
    var steps = [];
    var realUpdate = sandbox.update;
    sandbox.update = function (dt) { steps.push(dt); };
    sandbox.gameSpeed = 20;
    sandbox.lastTime = 0;
    sandbox.accumulator = 0;
    sandbox.frame(1000 / 60);           // one real frame at 60 fps
    sandbox.update = realUpdate;
    sandbox.gameSpeed = 1;
    var uniform = steps.every(function (dt) { return dt === sandbox.FIXED_STEP; });
    return steps.length === 20 && uniform;
  })(),
  "steps per frame at 20x");

check("the wave schedule is off and the board starts empty",
  sandbox.enemies.length === 0 && sandbox.waveIndex === sandbox.WAVES.length);

step(5);
check("no enemies appear on their own with waves off",
  sandbox.enemies.length === 0, "enemies = " + sandbox.enemies.length);

// --- the schedule switch ----------------------------------------------------
//
// There is ONE schedule since 2026-08-12. Normal and Hard were deleted as
// unfinished placeholders, and the difficulty concept went with them, so the
// picker and everything that drove it are gone: no `waveDifficulty` element,
// no `selectedDifficultyId`, no `DIFFICULTIES`. What survives is the only part
// that was ever about the workbench -- the auto-waves switch, which runs the
// campaign schedule on a board that otherwise only spawns what you ask it to.
//
// Two checks were DELETED here rather than repaired, because their subject was
// deleted: "the wave picker offers Easy, Normal and Hard" and "Sandbox can
// select the Hard schedule".
//
// The bare `elements.waveDifficulty.fire("change")` that used to sit between
// them went too, and it mattered more than either: it was a loose statement
// outside any check(), and fire() throws when nothing is listening. With the
// dropdown gone it killed the process, so this file stopped REPORTING rather
// than started failing -- and the three checks below it never ran at all. A
// suite that dies quietly reads downstream as an improvement, which is the
// most dangerous output there is.

elements.autoWaves.checked = true;
elements.autoWaves.fire("change");
step(sandbox.FIXED_STEP);
check("the schedule runs from wave 1",
  sandbox.waveIndex === 0 && sandbox.waveSpawned === 1 &&
  sandbox.enemies.length > 0,
  "waveIndex " + sandbox.waveIndex + ", spawned " + sandbox.waveSpawned +
  ", enemies " + sandbox.enemies.length);

elements.autoWaves.checked = false;
elements.autoWaves.fire("change");
check("turning schedules off restores the empty manual-spawn board",
  sandbox.enemies.length === 0 &&
  sandbox.waveIndex === sandbox.WAVES.length,
  "enemies " + sandbox.enemies.length + ", waveIndex " + sandbox.waveIndex +
  " of " + sandbox.WAVES.length);

// --- spawning --------------------------------------------------------------

check("the enemy picker includes the sandbox-only Aether Wisp",
  elements.enemyType.childNodes.some(function (option) {
    return option.value === "flying";
  }));

elements.enemyType.value = "flying";
elements.enemyType.fire("change");
elements.spawnOne.fire("click");
check("the Aether Wisp spawns through the same sandbox control as every enemy",
  sandbox.enemies.length === 1 &&
  sandbox.enemies[0].typeId === "flying" &&
  sandbox.enemies[0].isFlying === true);
elements.clearEnemies.fire("click");
elements.enemyType.value = "";
elements.enemyType.fire("change");

elements.enemyType.value = "fractal_slime";
elements.enemyType.fire("change");
check("Fractal Slime enables tiers and disables arbitrary HP",
  elements.enemyTier.disabled === false && elements.enemyHp.disabled === true &&
  elements.enemyTier.value === "1");
elements.enemyTier.value = "5";
elements.enemyTier.fire("change");
elements.spawnOne.fire("click");
check("the sandbox tier picker spawns an exact T5 Fractal Slime",
  sandbox.enemies.length === 1 &&
  sandbox.enemies[0].typeId === "fractal_slime" &&
  sandbox.enemies[0].fractalTier === 5 && sandbox.enemies[0].maxHealth === 1024);
elements.clearEnemies.fire("click");
elements.enemyType.value = "";
elements.enemyType.fire("change");

elements.spawnOne.fire("click");
check("Spawn 1 puts one enemy on the path", sandbox.enemies.length === 1);

elements.spawnWave1.fire("click");
check("Wave 1 button spawns five more", sandbox.enemies.length === 6);

elements.clearEnemies.fire("click");
check("Clear removes them all", sandbox.enemies.length === 0);

// --- placement, through the game's own click handler ------------------------

// Map coordinates below are the pixel positions the road was originally
// drawn at; w() maps them onto wherever that point sits now. Both constants
// are read from the game, so retuning either cannot invalidate them. Interface coordinates (panel buttons) come
// from the layout and are NOT scaled -- chrome is anchored to the viewport.
function w(value) {
  return value * sandbox.UNIT_LENGTH / sandbox.AUTHORED_AT_PX_PER_UL;
}

// (530, 505) sits beside the long straight -- the spot tests/run.js uses.
// Longshot goes at (700, 545): its 20 u.l. footprint needs more clearance
// from the road centre line than the first placement, so (700, 505) is too close.
function place(slotIndex, x, y) {
  run("selectedSlot = " + slotIndex + "; refreshBlockReason();");
  elements.game.fire("click", { clientX: w(x), clientY: w(y) });
  return sandbox.towers[sandbox.towers.length - 1];
}

var warbringer = place(0, 530, 505);
check("a Warbringer places via the real click handler",
  sandbox.towers.length === 1 && warbringer.name === "Warbringer");

var longshot = place(1, 700, 545);
check("a Longshot places too",
  sandbox.towers.length === 2 && longshot.name === "Arcane Sniper",
  "towers = " + sandbox.towers.map(function (t) { return t.name; }).join(", "));

check("Longshot exposes the game's tower contract",
  typeof longshot.update === "function" &&
  typeof longshot.draw === "function" &&
  typeof longshot.statLines === "function" &&
  typeof longshot.containsPoint === "function" &&
  typeof longshot.pathProgress === "number" &&
  typeof longshot.footprintPx === "number");

check("Longshot's cached world range matches ul(range)",
  Math.abs(longshot.rangePx - sandbox.ul(longshot.core.stats.range)) < 1e-9,
  "rangePx = " + longshot.rangePx);

// --- it actually fights ----------------------------------------------------

run("enemies = []; bullets = [];");
elements.enemyHp.value = "40";
elements.spawnOne.fire("click");
var victim = sandbox.enemies[0];
var startHealth = victim.health;

// Long enough for the walker to actually reach the towers: it enters at the
// far end of the route, and the map now spans the full canvas, so it takes
// roughly 20 s of walking before anything can reach it.
step(22);

check("a spawned enemy walks the path", victim.progress > 0,
  "progress = " + victim.progress.toFixed(1));
check("towers shoot it", victim.health < startHealth || victim.dead,
  "health " + startHealth + " -> " + victim.health);

// Leaks still damage the base -- the normal game rule, not bypassed.
run("enemies = []; bullets = []; towers = [];");
run("var e = new Enemy(path, 7); e.progress = path.length - 1; e.pos = path.pointAt(e.progress); enemies.push(e);");
var baseBefore = sandbox.baseHp;
step(0.2);
check("a leak still costs the base its remaining HP",
  sandbox.baseHp === baseBefore - 7,
  "base " + baseBefore + " -> " + sandbox.baseHp);

// --- upgrades on a placed tower --------------------------------------------

run("enemies = []; bullets = []; towers = [];");
var upgradeTarget = place(1, 700, 545);
run("inspected = towers[0];");

var rangeBefore = upgradeTarget.core.stats.range;
elements.buyA.fire("click");
check("Buy A applies to the tower standing on the map",
  upgradeTarget.core.purchased.A === 1 &&
  upgradeTarget.core.stats.range === rangeBefore + 50,
  "range " + rangeBefore + " -> " + upgradeTarget.core.stats.range);

check("the cached world range followed the upgrade",
  Math.abs(upgradeTarget.rangePx - sandbox.ul(rangeBefore + 50)) < 1e-9);

for (var i = 0; i < 4; i++) elements.buyA.fire("click");
check("A can be taken to tier 5", upgradeTarget.core.purchased.A === 5);

elements.buyB.fire("click");
elements.buyB.fire("click");
elements.buyB.fire("click");
check("crosspath lock still caps B at 2 after A3+",
  upgradeTarget.core.purchased.B === 2,
  "B = " + upgradeTarget.core.purchased.B);

check("statLines renders for an upgraded tower",
  upgradeTarget.statLines().length > 0 &&
  upgradeTarget.statLines().every(function (r) { return r.length === 2; }));

// --- the on-canvas panel buttons -------------------------------------------

run("towers = []; enemies = []; bullets = [];");
var panelTower = place(1, 700, 545);
run("inspected = towers[0];");

var layout = run("inspectionLayout(inspected)");
check("the panel shows two upgrade rectangles and no ability yet",
  layout.actions.length === 2,
  "actions = " + layout.actions.map(function (s) { return s.action.id; }).join(", "));

check("upgrade buttons quote the config's prices",
  layout.actions[0].action.detail === "$" + panelTower.core.config.paths.A[0].cost &&
  layout.actions[1].action.detail === "$" + panelTower.core.config.paths.B[0].cost,
  layout.actions[0].action.detail + " / " + layout.actions[1].action.detail);

// --- what an upgrade DOES, before it is bought ------------------------------
//
// The failure this pins: the panel used to show the tier and the price and
// nothing else, so the only way to learn what $300 bought was to spend it.

check("each upgrade button describes the tier before you buy it",
  typeof layout.actions[0].action.effects === "string" &&
  layout.actions[0].action.effects.length > 0 &&
  layout.actions[1].action.effects.length > 0,
  "A: " + layout.actions[0].action.effects + "  |  B: " + layout.actions[1].action.effects);

check("the description is derived from the config, not written by hand",
  layout.actions[0].action.effects ===
    run("UpgradeEffects.describe(TowerConfigs.longRangeDPS.paths.A[0].deltas, " +
        "TowerConfigs.longRangeDPS.paths.A[0].grants)"),
  layout.actions[0].action.effects);

check("it names both the numbers and the flags a tier grants",
  layout.actions[0].action.effects.indexOf("+5 dmg") === 0 &&
  layout.actions[0].action.effects.indexOf("sees camo") > 0,
  layout.actions[0].action.effects);

check("the description sits inside its rectangle, not over the one beside it",
  layout.actions.every(function (slot) {
    run("ctx.font = '10px system-ui, sans-serif'");
    return run("wrapText(ctx, " + JSON.stringify(slot.action.effects) +
      ", " + (slot.w - 10) + ", 2)").every(function (line) {
        return run("ctx.measureText(" + JSON.stringify(line) + ").width") <= slot.w - 10;
      });
  }),
  "button is " + layout.actions[0].w + "px wide");

check("and it wraps rather than being clipped to nonsense",
  (function () {
    run("ctx.font = '10px system-ui, sans-serif'");
    var lines = run("wrapText(ctx, " + JSON.stringify(layout.actions[0].action.effects) +
      ", " + (layout.actions[0].w - 10) + ", 2)");
    return lines.join(" ") === layout.actions[0].action.effects;
  })(),
  layout.actions[0].action.effects);

check("describing buttons are full width, one per row",
  layout.actions.every(function (slot) {
    return slot.w === layout.w - layout.pad * 2;
  }) &&
  layout.actions[0].y !== layout.actions[1].y,
  "widths " + layout.actions.map(function (s) { return s.w; }).join("/"));

check("the rectangle grew to make room for the third line",
  layout.actions[0].h >= 46, "action height " + layout.actions[0].h);

check("a describing panel still fits above the build bar",
  layout.y >= 0 && layout.y + layout.h <= sandbox.BAR_Y,
  "panel " + layout.y + " -> " + (layout.y + layout.h) + ", bar at " + sandbox.BAR_Y);

// --- the hover card: the rest of the story ---------------------------------
//
// Three short lines on a button are enough to choose between two upgrades and
// not enough to understand either. Hovering one opens a card beside the panel
// with every stat it moves, before and after, and a sentence per ability.

function hoverAt(x, y) {
  elements.game.fire("mousemove", { clientX: x, clientY: y });
}

var slotForCard = layout.actions[0];
hoverAt(slotForCard.x + slotForCard.w / 2, slotForCard.y + slotForCard.h / 2);

var hovered = run("hoveredCard(inspectionLayout(inspected))");
check("hovering an upgrade button produces a card", !!hovered,
  hovered ? hovered.model.title : "nothing under the cursor");
check("it names the tier and the price",
  hovered.model.title.indexOf("path A tier 1") !== -1 &&
  hovered.model.subtitle === "$" + panelTower.core.config.paths.A[0].cost,
  hovered.model.title + "  /  " + hovered.model.subtitle);
check("it shows what every changed stat becomes, not just the delta",
  hovered.model.changes.length >= 3 &&
  hovered.model.changes.every(function (c) { return c.from !== "" && c.to !== ""; }),
  hovered.model.changes.map(function (c) {
    return c.label + " " + c.from + "->" + c.to;
  }).join(", "));
check("and explains the ability the tier switches on",
  hovered.model.abilities.length === 1 &&
  hovered.model.abilities[0].text.length > 20,
  hovered.model.abilities.length ? hovered.model.abilities[0].text : "none");

var cardBox = run("tooltipLayout(ctx, hoveredCard(inspectionLayout(inspected)).model, " +
  "hoveredCard(inspectionLayout(inspected)).anchor, inspectionLayout(inspected))");
var panelBox = run("inspectionLayout(inspected)");

check("the card sits beside the panel, never over the button it describes",
  cardBox.x + cardBox.w <= panelBox.x || cardBox.x >= panelBox.x + panelBox.w,
  "card " + cardBox.x + "-" + (cardBox.x + cardBox.w) +
  " vs panel " + panelBox.x + "-" + (panelBox.x + panelBox.w));
check("and stays on screen, above the build bar",
  cardBox.x >= 0 && cardBox.x + cardBox.w <= sandbox.VIEW_WIDTH &&
  cardBox.y >= 0 && cardBox.y + cardBox.h <= sandbox.BAR_Y,
  "card " + cardBox.x + "," + cardBox.y + " " + cardBox.w + "x" + cardBox.h);
check("the box is exactly as tall as the lines that go in it",
  cardBox.h === cardBox.lines.reduce(function (n, l) { return n + l.h; }, 0) + cardBox.pad * 2,
  "h " + cardBox.h + " for " + cardBox.lines.length + " lines");

sandbox.draw();
check("a frame with the card open draws without throwing", true);

// The targeting button explains its mode too -- "first" is one word and it is
// not obvious that it means the enemy NEAREST YOUR BASE.
var targetingBox = run("inspectionLayout(inspected).targeting");
check("a config-driven tower has the targeting button at all",
  !!targetingBox, "no targeting row");
hoverAt(targetingBox.x + targetingBox.w / 2, targetingBox.y + targetingBox.h / 2);
var targetingCard = run("hoveredCard(inspectionLayout(inspected))");
check("hovering it explains what the mode picks",
  targetingCard.model.abilities[0].text.indexOf("furthest along") !== -1,
  targetingCard.model.abilities[0].text);

hoverAt(-999, -999);

// Click the Path A rectangle on the canvas, the way a player would.
var costA = panelTower.nextTierCost("A");
var cashBefore = sandbox.cash;
var slotA = layout.actions[0];
elements.game.fire("click", { clientX: slotA.x + slotA.w / 2, clientY: slotA.y + slotA.h / 2 });

check("clicking the Path A rectangle buys the tier",
  panelTower.core.purchased.A === 1, "A = " + panelTower.core.purchased.A);
check("and charges its price",
  sandbox.cash === cashBefore - costA,
  "cash " + cashBefore + " -> " + sandbox.cash + " (expected -" + costA + ")");

// Take B to 5 so the ability unlocks, then confirm a third rectangle appears.
run("towers = []; inspected = null;");
var abilityTower = place(1, 700, 545);
run("inspected = towers[0];");
for (var b = 0; b < 5; b++) abilityTower.purchase("B");

var abilityLayout = run("inspectionLayout(inspected)");
check("the ability adds a third rectangle once B5 is bought",
  abilityLayout.actions.length === 3 &&
  abilityLayout.actions[2].action.id === "ability",
  "actions = " + abilityLayout.actions.map(function (s) { return s.action.id; }).join(", "));

// Every describing button is full width now, so the ability is no longer the
// only wide one -- but it must still get its OWN row rather than being
// squeezed beside an upgrade.
check("the ability rectangle is on its own row, full width",
  abilityLayout.actions[2].y > abilityLayout.actions[1].y &&
  abilityLayout.actions[2].w === abilityLayout.w - abilityLayout.pad * 2,
  "y " + abilityLayout.actions[1].y + " -> " + abilityLayout.actions[2].y +
  ", w " + abilityLayout.actions[2].w);

check("no action rectangle overlaps the sell button",
  abilityLayout.actions.every(function (s) { return s.y + s.h <= abilityLayout.sell.y; }));

elements.enemyHp.value = "9999";
elements.spawnOne.fire("click");
var maxHpBefore = abilityTower.core.maxHp;
var slotAbility = abilityLayout.actions[2];
elements.game.fire("click", {
  clientX: slotAbility.x + slotAbility.w / 2,
  clientY: slotAbility.y + slotAbility.h / 2
});

// The click only ARMS the ability: it is channelled, and the HP cost and the
// stun are both paid when the strike resolves channelSeconds later. Step the
// board until it does, budgeting from the tower's own config rather than a
// typed number of frames. Expectations read from the same config for the same
// reason -- the stun moved from 10 to 7 when the ritual took the other three
// seconds, and a typed 10 here is what went stale.
(function () {
  var params = abilityTower.core.stats.mechanics.activeAbility;
  var budget = Math.ceil((params.channelSeconds + 1) / sandbox.FIXED_STEP);
  for (var i = 0; i < budget && abilityTower.channel; i++) step(sandbox.FIXED_STEP);
}());
// What this check is about is the CLICK PATH -- that the rectangle reaches the
// ability and that its costs are actually applied -- not what the two numbers
// are worth. So the expectations come from the config the click is supposed to
// wire through. The two `> 0` clauses are what stop that from collapsing into
// "one equals itself": with a maxHpLoss of 0 the subtraction would hold
// against a tower that was never charged at all, and the check would pass
// forever without exercising anything. Balance owns the values; this owns the
// wiring, and refuses to be satisfied by an empty one.
var abilityParams = abilityTower.core.stats.mechanics.activeAbility;
check("clicking the ability rectangle fires it and charges the HP cost",
  abilityParams.maxHpLoss > 0 && abilityParams.stunSeconds > 0 &&
  !abilityTower.channel &&
  abilityTower.core.maxHp === maxHpBefore - abilityParams.maxHpLoss &&
  abilityTower.core.stunTimer === abilityParams.stunSeconds,
  "maxHp " + maxHpBefore + " -> " + abilityTower.core.maxHp +
  ", stun " + abilityTower.core.stunTimer +
  ", channelling " + !!abilityTower.channel);

// --- pierce: one projectile, travelling a line -----------------------------
//
// Two things are being pinned here. First, a shot is ONE projectile whatever
// the pierce value -- this used to spawn a bullet per pierced enemy, which
// made A5 look like a shotgun. Second, pierce is a LINE: the projectile flies
// straight on and hits whatever it runs into, losing one point of pierce and
// one step of damage each time. It is not an area effect, and "infinite
// pierce" does not mean "hits everything on screen".

run("towers = []; enemies = []; bullets = []; inspected = null;");
var piercer = place(1, 700, 545);

run("enemies = [];");
for (var e = 0; e < 12; e++) {
  run("(function () { var en = new Enemy(path, 100000); en.progress = " +
      (piercer.pathProgress - w(60) + e * w(22)) + "; " +
      "en.pos = path.pointAt(en.progress); enemies.push(en); })()");
}

run("bullets = [];");
piercer.core.fireCooldown = 0;
run("towers[0].update(1/60, enemies, bullets);");
check("a base Longshot fires exactly one projectile", sandbox.bullets.length === 1,
  "bullets = " + sandbox.bullets.length);

for (var pa = 0; pa < 3; pa++) piercer.purchase("A");   // pierce 6 + falloff
run("bullets = [];");
piercer.core.fireCooldown = 0;
run("towers[0].update(1/60, enemies, bullets);");
check("still one projectile at pierce 6", sandbox.bullets.length === 1,
  "bullets = " + sandbox.bullets.length);

for (var pb = 0; pb < 2; pb++) piercer.purchase("A");   // A5: infinite pierce
check("A5 has infinite pierce", piercer.core.stats.pierce === Infinity);
run("bullets = [];");
piercer.core.fireCooldown = 0;
piercer.aimAt(sandbox.enemies[6].pos.x, sandbox.enemies[6].pos.y);
run("towers[0].update(1/60, enemies, bullets);");
check("still ONE projectile at infinite pierce", sandbox.bullets.length === 1,
  "bullets = " + sandbox.bullets.length);

// --- the mechanic itself, on a line laid out on purpose --------------------
//
// Driven directly rather than through the map, so the geometry is exact:
// a shot heading along +x, six enemies standing on that line, and one
// standing well off it.

function lineTest(pierce, hasFalloff, damage) {
  var targets = [];
  for (var i = 0; i < 6; i++) {
    targets.push(run("(function () { var en = new Enemy(path, 1000000); " +
      "en.pos = { x: " + (200 + i * 40) + ", y: 300 }; en.progress = 0; return en; })()"));
  }
  var offLine = run("(function () { var en = new Enemy(path, 1000000); " +
    "en.pos = { x: 300, y: 500 }; en.progress = 0; return en; })()");

  var all = targets.concat([offLine]);
  var shot = run("new PierceBullet({ x: 100, y: 300, angle: 0, damage: " + damage +
    ", pierce: " + (pierce === Infinity ? "Infinity" : pierce) +
    ", hasFalloff: " + hasFalloff + ", falloffParams: { softener: 20, decay: 0.95 }" +
    ", maxTravelPx: 100000 })");

  var before = all.map(function (en) { return en.health; });
  for (var f = 0; f < 400 && !shot.dead; f++) shot.update(1 / 60, all);

  return {
    dealt: all.map(function (en, i) { return Math.round(before[i] - en.health); }),
    offLineHit: offLine.health < before[6]
  };
}

var noPierce = lineTest(0, false, 100);
check("pierce 0 stops at the first enemy on the line",
  noPierce.dealt.slice(0, 6).filter(function (d) { return d > 0; }).length === 1,
  "damage per enemy: " + noPierce.dealt.join(", "));

var pierce3 = lineTest(3, false, 100);
check("pierce 3 goes through exactly four enemies",
  pierce3.dealt.slice(0, 6).filter(function (d) { return d > 0; }).length === 4,
  "damage per enemy: " + pierce3.dealt.join(", "));

var infinite = lineTest(Infinity, true, 500);
var hitCount = infinite.dealt.slice(0, 6).filter(function (d) { return d > 0; }).length;
check("infinite pierce goes through the whole line", hitCount === 6,
  "damage per enemy: " + infinite.dealt.join(", "));

check("and never touches an enemy standing off the line",
  !noPierce.offLineHit && !pierce3.offLineHit && !infinite.offLineHit,
  "an off-line enemy was hit -- this is a line, not an area effect");

// Falloff: each successive enemy takes strictly less, per d(n).
var damages = infinite.dealt.slice(0, 6);
var descending = damages.every(function (d, i) { return i === 0 || d < damages[i - 1]; });
check("damage steps down with each enemy pierced", descending,
  damages.join(" -> "));
check("the first hit takes full damage", damages[0] === 500,
  "first hit = " + damages[0]);

// --- cone re-aim (spec 5.6) ------------------------------------------------

run("towers = []; enemies = []; bullets = []; inspected = null;");
var coneTower = place(1, 700, 545);
run("inspected = towers[0];");

check("no re-aim button before the tower has a cone",
  run("inspectionLayout(inspected).actions").every(function (s) {
    return s.action.id !== "reaim";
  }));

for (var a = 0; a < 4; a++) coneTower.purchase("A");   // A4 -> cone
check("A4 puts the tower in cone mode",
  coneTower.core.stats.targetShape === "cone" && coneTower.core.stats.coneArcDeg === 20);

var coneLayout = run("inspectionLayout(inspected)");
var reaimSlot = null;
coneLayout.actions.forEach(function (s) { if (s.action.id === "reaim") reaimSlot = s; });
check("a re-aim rectangle appears in cone mode", reaimSlot !== null,
  "actions = " + coneLayout.actions.map(function (s) { return s.action.id; }).join(", "));

var aimBefore = coneTower.core.aimRad;
elements.game.fire("click", {
  clientX: reaimSlot.x + reaimSlot.w / 2,
  clientY: reaimSlot.y + reaimSlot.h / 2
});
check("clicking it arms aiming rather than re-aiming immediately",
  sandbox.aimingTower === coneTower && coneTower.core.aimRad === aimBefore);

// The next map click sets the direction -- and must not also place a tower.
var towersBefore = sandbox.towers.length;
run("selectedSlot = 0; refreshBlockReason();");     // arm the gunner too
elements.game.fire("click", { clientX: w(700), clientY: w(200) });  // straight up

check("the next map click sets the cone direction",
  Math.abs(coneTower.core.aimRad - Math.atan2(w(200) - w(545), 0)) < 1e-9,
  "aim = " + coneTower.core.aimRad);
check("and does not also build a tower",
  sandbox.towers.length === towersBefore, "towers = " + sandbox.towers.length);
check("aiming mode clears after the click", sandbox.aimingTower === null);

check("re-aim then goes on its 10s cooldown",
  Math.abs(coneTower.core.reaimCooldownTimer - 10) < 1e-9,
  "cooldown = " + coneTower.core.reaimCooldownTimer);

var blocked = coneTower.aimAt(w(700), w(900));
check("a second re-aim inside the cooldown is refused", blocked.ok === false);

step(10.1);
check("and allowed again once it expires", coneTower.aimAt(w(700), w(900)).ok === true);

run("selectedSlot = null;");

// --- tower_beam, in a running game -----------------------------------------
//
// The parts of the beam spec that only mean something with a real loop
// underneath: continuous fire, lifesteal reaching the base, the B5 unlock
// gate, and death denial. Pure formulas are in tests/beam.test.js.

run("towers = []; enemies = []; bullets = []; inspected = null;");
run("baseHp = BASE_MAX_HP; DeathDenial.reset();");

var beam = place(2, 700, 505);
check("the beam tower places through the normal build path",
  beam && beam.name === "Siphon", "placed = " + (beam && beam.name));

check("its footprint is the config's 15 u.l.", beam.footprintRadiusUl === 15);
check("sell value starts at half the purchase price",
  run("sellValue(towers[0])") === Math.ceil(800 * 0.5),
  "sellValue = " + run("sellValue(towers[0])"));

// --- continuous fire, and armor denying it entirely ------------------------

run("enemies = [];");
run("(function () { var e = new Enemy(path, 5000); e.progress = " +
    beam.pathProgress + "; e.pos = path.pointAt(e.progress); enemies.push(e); })()");
var beamTarget = sandbox.enemies[0];
var hpBefore = beamTarget.health;

step(1);
check("it damages without firing any projectile",
  beamTarget.health < hpBefore && sandbox.bullets.length === 0,
  "health " + hpBefore + " -> " + beamTarget.health.toFixed(1) +
  ", bullets = " + sandbox.bullets.length);

// 1 AD at 10 ticks/s is 10 dps; a second should be about 10 damage.
check("damage over one second is about ad x attackRate",
  Math.abs((hpBefore - beamTarget.health) - 10) < 1.5,
  "dealt " + (hpBefore - beamTarget.health).toFixed(2) + " in 1 s");

// Armor 1 against 1 AD: the tower does literally nothing. No floor.
beamTarget.armor = 1;
var armoredFrom = beamTarget.health;
step(2);
check("an armor-1 enemy takes ZERO from a 1 AD beam",
  beamTarget.health === armoredFrom,
  "health " + armoredFrom.toFixed(1) + " -> " + beamTarget.health.toFixed(1));
beamTarget.armor = 0;

// --- income: the beam is inside the economy, with and without A3 -----------

run("towers = []; enemies = []; inspected = null; cash = 999999;");

// Place FIRST, then stop the top-up and zero the bank -- the tower costs 800,
// so zeroing the cash before placing just refuses the placement.
var earner = place(2, 700, 505);
elements.lockGold.checked = false;
elements.lockGold.fire("change");        // stop the top-up so income is visible
run("cash = 0; enemies = [];");
run("(function () { var e = new Enemy(path, 100000); e.progress = " +
    earner.pathProgress + "; e.pos = path.pointAt(e.progress); enemies.push(e); })()");

step(2);
check("a beam with NO A3 deals damage but earns no per-damage cash",
  earner.damageDealt > 0 && sandbox.cash === 0,
  "damage " + earner.damageDealt.toFixed(2) + ", cash " + sandbox.cash.toFixed(2));

// With A3 and charges banked, the same damage is worth more.
run("towers = []; enemies = []; cash = 999999;");
var charger = place(2, 700, 505);
for (var ca = 0; ca < 3; ca++) charger.purchase("A");
check("A3 grants the charge mechanic", charger.core.stats.flags.charge_to_gold === true);

run("cash = 0; enemies = [];");
// speedUlps 0: a walker leaves the beam's 150 u.l. reach in about three
// seconds, which is nowhere near the 500 damage a first charge needs. Holding
// it still is the point of the test -- charges accumulating, not chasing.
run("(function () { var e = new Enemy(path, 1000000); e.progress = " +
    charger.pathProgress + "; e.pos = path.pointAt(e.progress); " +
    "e.speedUlps = 0; enemies.push(e); })()");

step(40);
check("charges accumulate from damage dealt", charger.charge.charges > 0,
  "charges = " + charger.charge.charges);
check("and charged damage creates bonus gold",
  sandbox.cash > 0 && charger.bonusGold > 0,
  "cash " + sandbox.cash.toFixed(0) + " at " + charger.charge.charges + " charges");

// Pinning the += trap: gold banked DURING update (through addGold) must
// survive the loop's own `cash +=`. Reading cash before the call and assigning
// after it silently discarded the entire charge bonus.
//
check("gold banked during update is not overwritten by the loop's own +=",
  Math.abs(sandbox.cash - charger.bonusGold) < 0.01,
  "cash " + sandbox.cash.toFixed(0) + " vs bonus " + charger.bonusGold.toFixed(0));

// The bar's fraction is what the readout above the tower uses.
var fraction = charger.charge.progressFraction();
check("the charge bar's fraction is in range", fraction >= 0 && fraction <= 1,
  "progressFraction = " + fraction.toFixed(3));

// Every gold figure now reports cash the A3 ability actually generated.
check("bonus gold and generated gold are the same paid amount",
  charger.bonusGold > 0 &&
    Math.abs(charger.bonusGold - charger.goldGenerated) < 0.001,
  "bonus " + charger.bonusGold.toFixed(2));

var bonusRow = charger.statLines().filter(function (r) { return r[0] === "Bonus gold"; });
check("the panel row is labelled as the bonus", bonusRow.length === 1,
  charger.statLines().map(function (r) { return r[0]; }).join(", "));

// Charges drain continuously once it stops shooting, rather than vanishing.
run("enemies = [];");
var chargesBeforeIdle = charger.charge.charges;
var levelBeforeIdle = charger.charge.level();
step(1.5);                                   // half a charge's worth of time
var levelAfterIdle = charger.charge.level();
check("idle charges drain continuously, not in one drop",
  levelAfterIdle < levelBeforeIdle && levelAfterIdle > levelBeforeIdle - 1,
  "level " + levelBeforeIdle.toFixed(2) + " -> " + levelAfterIdle.toFixed(2) +
  " after 1.5 s (1 charge per 3 s)");
check("and the rate is one charge per three seconds",
  Math.abs((levelBeforeIdle - levelAfterIdle) - 0.5) < 0.02,
  "drained " + (levelBeforeIdle - levelAfterIdle).toFixed(3) + " in 1.5 s");

elements.lockGold.checked = true;
elements.lockGold.fire("change");

// --- cash is displayed to one decimal, not sixteen -------------------------

check("whole amounts print without a decimal point",
  run("formatCash(100)") === "100" && run("formatCash(0)") === "0",
  run("formatCash(100)"));
check("fractions are cut to a single decimal",
  run("formatCash(8.454662500000001)") === "8.5",
  run("formatCash(8.454662500000001)"));
check("and rounding is nearest, not truncation",
  run("formatCash(8.44)") === "8.4" && run("formatCash(8.46)") === "8.5",
  run("formatCash(8.44)") + " / " + run("formatCash(8.46)"));
check("the underlying value keeps its precision",
  run("(function () { cash = 8.454662500000001; return cash; })()") === 8.454662500000001,
  "cash is still exact behind the display");

// --- lifesteal pushes base HP past its starting value ----------------------

run("towers = []; enemies = []; inspected = null;");
run("baseHp = BASE_MAX_HP; cash = 999999;");
var healer = place(2, 700, 505);
for (var lb = 0; lb < 4; lb++) healer.purchase("B");     // B4: 10:2 lifesteal
check("B4 grants lifesteal at 20%",
  healer.core.stats.flags.lifesteal &&
  healer.core.stats.mechanics.lifesteal.ratio === 0.2);

run("enemies = [];");
run("(function () { var e = new Enemy(path, 100000); e.progress = " +
    healer.pathProgress + "; e.pos = path.pointAt(e.progress); enemies.push(e); })()");

var baseAtStart = sandbox.baseHp;
step(5);
check("lifesteal raises base HP above where it started",
  sandbox.baseHp > baseAtStart,
  "base " + baseAtStart + " -> " + sandbox.baseHp.toFixed(1));
check("and past its original maximum, with no upper clamp",
  sandbox.baseHp > sandbox.BASE_MAX_HP,
  "base " + sandbox.baseHp.toFixed(1) + " vs max " + sandbox.BASE_MAX_HP);

// Healing tracks damage at the configured ratio.
var healedSoFar = sandbox.baseHp - baseAtStart;
check("healing is the configured share of damage dealt",
  Math.abs(healedSoFar - healer.damageDealt * 0.2) < 0.001,
  "healed " + healedSoFar.toFixed(2) + " from " + healer.damageDealt.toFixed(2) + " damage");

// --- healing counter and the B5 gate ---------------------------------------

check("the tower counts the HP it has healed",
  Math.abs(healer.hpHealed - healedSoFar) < 0.001,
  "hpHealed = " + healer.hpHealed.toFixed(2));

var healRow = healer.statLines().filter(function (r) { return r[0] === "HP healed"; });
check("and shows it in the panel", healRow.length === 1,
  healer.statLines().map(function (r) { return r[0]; }).join(", "));

// The same healing also lands in the shared ledger, which is what the gate
// reads -- per tower it would be close to unbuyable, since only one tower can
// ever hold the B5.
check("healing is also recorded in the shared ledger",
  Math.abs(run("HealingLedger.total()") - healer.hpHealed) < 0.001,
  "ledger = " + run("HealingLedger.total()").toFixed(2));

// The gate is on healing DONE, not the base's current HP -- so a huge base
// does not unlock it, and a drained base does not lock it back.
run("HealingLedger.reset(); baseHp = 999999;");
var gateRichBase = healer.checkUnlock("B");
check("a huge base does NOT unlock B5 on its own", gateRichBase.ok === false,
  gateRichBase.reason);

run("HealingLedger.record(4999);");
check("still refused just under the 5 000 threshold",
  healer.checkUnlock("B").ok === false, healer.checkUnlock("B").reason);

run("baseHp = 1; HealingLedger.record(1);");
check("allowed at 5 000 healed, even with the base nearly dead",
  healer.checkUnlock("B").ok === true);

// Pooled: healing from OTHER towers counts toward it.
run("HealingLedger.reset(); HealingLedger.record(3000);");
check("a partial pool still refuses", healer.checkUnlock("B").ok === false);
run("HealingLedger.record(2000);");   // as if a second lifesteal tower helped
check("but another tower's healing tops it up", healer.checkUnlock("B").ok === true);

run("baseHp = BASE_MAX_HP;");

// --- death denial ----------------------------------------------------------

run("towers = []; enemies = []; inspected = null; DeathDenial.reset();");
run("baseHp = 20000; cash = 999999;");
var denier = place(2, 700, 505);
for (var db = 0; db < 4; db++) denier.purchase("B");
run("HealingLedger.reset(); HealingLedger.record(5000);");  // the B5 gate
denier.purchase("B");
check("B5 buys with the gate satisfied", denier.core.purchased.B === 5,
  "B tier = " + denier.core.purchased.B);
check("and claims the global death-denial slot", run("DeathDenial.isHeld()") === true);

// A second tower cannot take it. The rule is global, so it is asked of the
// system rather than of a tower -- with the slot held, even a player with
// plenty of base HP is refused.
var rivalGate = run("DeathDenial.isAvailable()");
check("a second tower is refused the B5 even with the HP",
  rivalGate.ok === false, rivalGate.reason);

// Now kill the base and watch the save fire.
run("enemies = [];");
var deep = run("path.length * 0.8");
for (var k = 0; k < 3; k++) {
  run("(function () { var e = new Enemy(path, 10); e.progress = " + (deep + k * 5) +
      "; e.pos = path.pointAt(e.progress); enemies.push(e); })()");
}
var progressBefore = sandbox.enemies.map(function (e) { return e.progress; });
var towerCountBefore = sandbox.towers.length;

run("baseHp = 1;");
run("(function () { var e = new Enemy(path, 500); e.progress = path.length; " +
    "e.pos = path.pointAt(e.progress); enemies.push(e); })()");
step(1 / 60);

check("death denial sets base HP to 1 instead of ending the run",
  sandbox.baseHp === 1 && sandbox.gameOver === false,
  "base = " + sandbox.baseHp + ", gameOver = " + sandbox.gameOver);

check("the tower holding it is destroyed",
  sandbox.towers.length === towerCountBefore - 1,
  "towers " + towerCountBefore + " -> " + sandbox.towers.length);

// The knockback is ANIMATED: the board freezes and enemies are dragged back
// over about a second and a half, rather than teleporting.
check("a rewind starts rather than an instant teleport",
  run("DeathDenial.isRewinding()") === true);

var midProgress = sandbox.enemies.map(function (e) { return e.progress; });
step(0.4);
var afterSome = sandbox.enemies.map(function (e) { return e.progress; });
check("enemies move backwards gradually while it plays",
  afterSome.some(function (p, i) { return p < midProgress[i]; }) &&
  run("DeathDenial.isRewinding()") === true,
  "still rewinding after 0.4 s");

// Nothing else advances while time is stopped.
run("var frozenSpawn = enemies.length;");
step(0.3);
check("the simulation is frozen meanwhile",
  run("enemies.length === frozenSpawn") === true);

// Run to the exact end and measure THERE: once it finishes the simulation
// resumes and the enemies start walking forward again, which would quietly
// eat into the distance being checked.
var guard = 0;
while (run("DeathDenial.isRewinding()") && guard++ < 600) {
  sandbox.update(sandbox.FIXED_STEP);
}
check("the rewind ends by itself", run("DeathDenial.isRewinding()") === false,
  "took " + guard + " frames");

var progressAtEnd = sandbox.enemies.map(function (e) { return e.progress; });

var pushedBack = sandbox.enemies.filter(function (e, i) {
  return progressBefore[i] !== undefined && e.progress < progressBefore[i];
}).length;
check("surviving enemies end up pushed back along the path", pushedBack > 0,
  pushedBack + " enemies knocked back");

// Within a frame of movement: the enemies advance one step before the save
// fires, so the distance is measured from where they were when time turned.
check("the knockback is 500 u.l. measured along the route",
  sandbox.enemies.length === 0 ||
  Math.abs((progressBefore[0] - progressAtEnd[0]) - run("ul(500)")) < 2 ||
  progressAtEnd[0] === 0,
  "moved " + (progressBefore[0] - progressAtEnd[0]).toFixed(1) +
  " px, expected " + run("ul(500)").toFixed(1));

check("the enemy that reached the base is rescued rather than filtered out",
  sandbox.enemies.every(function (e) { return !e.leaked; }),
  "no enemy left flagged as leaked");

check("the slot is released once spent", run("DeathDenial.isHeld()") === false);

// It only fires once: the next lethal hit ends the run.
run("baseHp = 1; enemies = [];");
run("(function () { var e = new Enemy(path, 500); e.progress = path.length; " +
    "e.pos = path.pointAt(e.progress); enemies.push(e); })()");
step(1 / 60);
check("a second lethal hit is not denied", sandbox.gameOver === true,
  "gameOver = " + sandbox.gameOver);

run("baseHp = BASE_MAX_HP; gameOver = false; towers = []; enemies = []; inspected = null;");

// --- the economy controls --------------------------------------------------

run("towers = []; enemies = []; inspected = null; DeathDenial.reset();");
run("baseHp = BASE_MAX_HP; gameOver = false;");

// Setting gold must SURVIVE the next step -- the whole reason the top-up is
// switchable. This is the failure mode the control exists to avoid.
elements.goldInput.value = "50000";
elements.setGold.fire("click");
check("setting gold takes effect", sandbox.cash === 50000, "cash = " + sandbox.cash);
check("and turns the top-up off so it is not overwritten",
  elements.lockGold.checked === false);

step(1);
check("the value survives a step", sandbox.cash === 50000,
  "cash after a step = " + sandbox.cash);

// Re-arming the top-up puts it back.
elements.lockGold.checked = true;
elements.lockGold.fire("change");
step(1 / 60);
check("re-enabling the top-up restores infinite gold", sandbox.cash >= 999999,
  "cash = " + sandbox.cash);

// Base HP, in both directions, with no ceiling. The figure has to sit ABOVE
// BASE_MAX_HP for this to prove anything, and the sandbox raised that to
// 100 000 on 2026-08-10 -- so the old 10 000 stopped being above the maximum
// and started being a fifth of it. Written off the constant rather than as a
// literal, so it cannot go stale the same way twice.
var overMax = sandbox.BASE_MAX_HP * 2 + 1;
elements.baseHpInput.value = String(overMax);
elements.setBaseHp.fire("click");
check("base HP can be set above its starting maximum",
  sandbox.baseHp === overMax && sandbox.baseHp > sandbox.BASE_MAX_HP,
  "baseHp = " + sandbox.baseHp + " against a max of " + sandbox.BASE_MAX_HP);

// Setting it clears a lost run rather than leaving a healthy base frozen.
run("gameOver = true; baseHp = 0;");
elements.baseHpInput.value = "500";
elements.setBaseHp.fire("click");
check("setting base HP above zero un-freezes a lost run",
  sandbox.baseHp === 500 && sandbox.gameOver === false,
  "baseHp = " + sandbox.baseHp + ", gameOver = " + sandbox.gameOver);

// The point of the gold control: A5's AD scales off the live bank, so being
// able to pin gold is what makes it testable at all.
run("towers = []; enemies = []; cash = 999999;");
var a5 = place(2, 700, 505);
for (var ga = 0; ga < 5; ga++) a5.purchase("A");
check("A5 grants gold-to-power", a5.core.stats.flags.gold_to_power === true);

elements.goldInput.value = "0";
elements.setGold.fire("click");
var adAtZero = a5.effectiveAD(sandbox.cash);

elements.goldInput.value = "200000";
elements.setGold.fire("click");
var adAtRich = a5.effectiveAD(sandbox.cash);

check("the tower's AD follows the gold it can now be set to",
  Math.abs((adAtRich - adAtZero) - 15) < 1e-9,
  "AD " + adAtZero + " at 0 gold -> " + adAtRich + " at 200k (+15 expected)");

// The passive was invisible before: the panel showed the RESOLVED ad while
// damage used the gold-boosted one, so A5 looked like it did nothing.
run("inspected = towers[0];");
// "Damage", not "AD": every tower's per-hit figure is under the same label
// now, and this one used to fold the attack rate into the same cell as well.
var adRow = a5.statLines().filter(function (r) { return r[0] === "Damage"; })[0];
check("the Damage row shows the effective value, including the A5 bonus",
  adRow[1].indexOf("+15") !== -1,
  "Damage row reads: " + adRow[1]);

var passive = a5.panelActions().filter(function (x) { return x.id === "passiveGoldPower"; })[0];
check("a passive readout appears once A5 is bought", !!passive,
  a5.panelActions().map(function (x) { return x.id; }).join(", "));
check("it reports the live AD bonus", passive.label.indexOf("+15") !== -1, passive.label);
// At 200k the gold scaling is long since capped at its 50k ceiling, so the
// readout should show the capped tier rather than 20.
check("and the gold tiers driving it, capped at the 50k ceiling",
  passive.detail.indexOf("tier 5") !== -1 && passive.detail.indexOf("cap x10.0") !== -1,
  passive.detail);
check("it is a readout, not a button", passive.readonly === true);

// Being a readout, clicking it must do nothing -- but still consume the click
// so a tower is not built underneath the panel.
run("inspected = towers[0];");
var passiveLayout = run("inspectionLayout(inspected)");
var passiveSlot = null;
passiveLayout.actions.forEach(function (s2) {
  if (s2.action.id === "passiveGoldPower") passiveSlot = s2;
});
check("the readout has a rectangle in the panel", passiveSlot !== null);

var towersBeforePassive = sandbox.towers.length;
run("selectedSlot = 0; refreshBlockReason();");
elements.game.fire("click", {
  clientX: passiveSlot.x + passiveSlot.w / 2,
  clientY: passiveSlot.y + passiveSlot.h / 2
});
check("clicking it builds nothing underneath",
  sandbox.towers.length === towersBeforePassive,
  "towers " + towersBeforePassive + " -> " + sandbox.towers.length);
run("selectedSlot = null;");

// A tower without A5 has no such readout.
check("a tower without A5 shows no passive readout",
  earner.panelActions().every(function (x) { return x.id !== "passiveGoldPower"; }));

// --- the DPS ceiling counts everything that multiplies damage --------------
//
// It used to be resolved-AD x rate x targets, which ignored the gold bonus,
// the ramp and the HP scaling -- so a fully upgraded 5-2 read a flat 200 no
// matter how strong it actually was.

elements.goldInput.value = "50000";
elements.setGold.fire("click");

var s5 = a5.core.stats;
var expectedDps = a5.effectiveAD(sandbox.cash) * s5.attackRate * s5.maxTargets *
  (1 + s5.mechanics.ramp_per_target.rampCap) *
  (1 + s5.mechanics.hp_scaling.maxBonus);

check("max DPS multiplies in the ramp cap, HP scaling and the gold bonus",
  Math.abs(a5.maxDps() - expectedDps) < 1e-6,
  "maxDps " + a5.maxDps().toFixed(0) + " vs expected " + expectedDps.toFixed(0));

check("which is far above the naive ad x rate x targets it used to show",
  a5.maxDps() > s5.ad * s5.attackRate * s5.maxTargets * 2,
  "maxDps " + a5.maxDps().toFixed(0) + " vs naive " +
  (s5.ad * s5.attackRate * s5.maxTargets));

// The ceiling has its own row. "DPS" means the same thing on every tower --
// damage x attack speed against ONE enemy -- so this tower's every-lock,
// every-multiplier figure cannot borrow that label.
var dpsRow = a5.statLines().filter(function (r) { return r[0] === "Max DPS"; })[0];
check("and the panel row reports that figure, not the naive one",
  parseFloat(dpsRow[1]) === Math.round(a5.maxDps()),
  "Max DPS row: " + dpsRow[1] + "  (naive would read " +
  (s5.ad * s5.attackRate * s5.maxTargets) + ")");

var singleRow = a5.statLines().filter(function (r) { return r[0] === "DPS"; })[0];
check("while DPS itself is damage x attack speed, comparable with any tower",
  Math.abs(parseFloat(singleRow[1]) - a5.attackDamage() * a5.attacksPerSecond()) < 0.05,
  "DPS row: " + singleRow[1] + " for " + a5.attackDamage().toFixed(2) + " x " +
  a5.attacksPerSecond());

elements.lockGold.checked = true;
elements.lockGold.fire("change");
run("towers = []; enemies = []; inspected = null; baseHp = BASE_MAX_HP; gameOver = false;");

// --- every panel still fits above the build bar ----------------------------
//
// The panel grows a row for every stat a tower reports and a 60 px rectangle
// for every button, and it is clamped between the top of the canvas and the
// build bar. The tallest case -- a 5-2 Siphon, whose A5 adds a third button --
// currently uses 608 of the 614 px available. That is not much headroom: a row
// added to every tower's stat block would put it through the bar. This walks
// the builds rather than trusting the arithmetic.

var BUILDS = [[0, 0], [5, 2], [2, 5], [3, 2], [5, 0], [0, 5]];
var overflowing = [];

// Slots 0-3: the Smasher, the Longshot, the Siphon and the Soldier -- every
// current tower in the sandbox has an upgrade tree.
[0, 1, 2, 3].forEach(function (slotIndex) {
  BUILDS.forEach(function (build) {
    run("towers = []; enemies = []; bullets = []; inspected = null; cash = 99999999;");
    var tower = place(slotIndex, 700, 545);
    run("inspected = towers[0];");

    ["A", "B"].forEach(function (branch, i) {
      for (var n = 0; n < build[i]; n++) {
        if (tower.purchase) tower.purchase(branch);
        else {
          var next = tower.nextUpgrade(branch);
          if (next) run("buyUpgrade(towers[0], '" + next.id + "')");
        }
      }
    });

    var L = run("inspectionLayout(inspected)");
    if (L.y < 0 || L.y + L.h > sandbox.BAR_Y) {
      overflowing.push(tower.name + " " + build.join("-") + ": " +
        L.y + " -> " + (L.y + L.h) + " against " + sandbox.BAR_Y);
    }
  });
});

check("every upgradeable tower's panel fits the canvas at every build",
  overflowing.length === 0, overflowing.join("; "));

// The walk above cannot reach the Soldier's TALLEST panel on its own: its
// recruit-cooldown row only exists while the cooldown is running, so the 0-5
// build it measured was one row short of the worst case. Press the button and
// measure again -- eleven rows plus three buttons is the most a Soldier can
// ever ask for.
run("towers = []; enemies = []; bullets = []; inspected = null; cash = 99999999;");
var recruiter = place(3, 700, 545);
run("inspected = towers[0];");
for (var bTier = 0; bTier < 5; bTier++) {
  var tier = recruiter.nextUpgrade("B");
  if (tier) run("buyUpgrade(towers[0], '" + tier.id + "')");
}
recruiter.callRecruits();
var recruitLayout = run("inspectionLayout(inspected)");
check("a Soldier with recruits out still fits above the build bar",
  recruitLayout.y >= 0 && recruitLayout.y + recruitLayout.h <= sandbox.BAR_Y,
  "panel " + recruitLayout.y + " -> " + (recruitLayout.y + recruitLayout.h) +
  ", bar at " + sandbox.BAR_Y);

run("towers = []; enemies = []; bullets = []; inspected = null; cash = 999999;");

// --- shared MAX FIELD debug command ---------------------------------------

run("towers = [" +
  "new Smasher(450, 520, path), " +
  "new LongshotTower(620, 520, path), " +
  "new BeamTower(790, 520, path), " +
  "new Soldier(960, 520, path)]; " +
  "enemies = [new Enemy(path, 100000)]; " +
  "enemies[0].pos = { x: 620, y: 430 };");
elements.maxField.fire("click");

var maxedWarbringer = sandbox.towers[0];
var maxedSniper = sandbox.towers[1];
var maxedSiphon = sandbox.towers[2];
var maxedRifleman = sandbox.towers[3];

check("the sandbox MAX FIELD button makes every tower exact A2/B5",
  maxedWarbringer.hasA2 && !maxedWarbringer.hasA3 && maxedWarbringer.hasB5 &&
  maxedSniper.core.purchased.A === 2 && maxedSniper.core.purchased.B === 5 &&
  maxedSiphon.core.purchased.A === 2 && maxedSiphon.core.purchased.B === 5 &&
  maxedRifleman.hasA2 && !maxedRifleman.hasA3 && maxedRifleman.hasB5,
  elements.maxFieldStatus.textContent);

// The Warbringer's quake and the Rifleman's recruits both bite on the press,
// but the Sniper's ability is channelled: on the frame of the press its
// evidence is an ARMED CHANNEL, and the stun only appears three seconds later
// when the strike resolves. So the "immediately" half is recorded before any
// time passes, and the board is then stepped to collect the rest -- otherwise
// this would be asserting that a channelled ability is instant.
var sniperArmedImmediately = !!maxedSniper.channel;
(function () {
  var params = maxedSniper.core.stats.mechanics.activeAbility;
  var budget = Math.ceil((params.channelSeconds + 1) / sandbox.FIXED_STEP);
  for (var i = 0; i < budget && maxedSniper.channel; i++) step(sandbox.FIXED_STEP);
}());

check("its three active abilities fire immediately and stay AUTO",
  sandbox.AutoAbility.isOn(maxedWarbringer, "ability") &&
  sandbox.AutoAbility.isOn(maxedSniper, "ability") &&
  sandbox.AutoAbility.isOn(maxedRifleman, "recruits") &&
  maxedWarbringer.quakeCooldown > 0 &&
  sniperArmedImmediately &&
  maxedSniper.core.stunTimer > 0 &&
  maxedRifleman.recruitCooldown > 0,
  elements.maxFieldStatus.textContent +
  " · sniper armed on the press " + sniperArmedImmediately +
  ", stun after resolving " + maxedSniper.core.stunTimer);

// --- rendering -------------------------------------------------------------

sandbox.draw();
check("a full sandbox frame draws without throwing (overlay included)", true);

elements.showRange.checked = false;
elements.showRange.fire("change");
sandbox.draw();
check("toggling an overlay layer off still draws", true);

// The sidebar refresher runs on an interval in the browser; call it directly.
intervals.forEach(function (fn) { fn(); });
check("the sidebar refresh runs without throwing", true);

console.log("");
if (failures.length) {
  console.log(failures.length + " FAILED\n");
  process.exit(1);
}
console.log("SANDBOX SMOKE TEST PASSED\n");
