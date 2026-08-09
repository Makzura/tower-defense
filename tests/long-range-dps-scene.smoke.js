// ---------------------------------------------------------------------------
// Smoke test for long-range-dps-debug.html + js/scene/long-range-dps-scene.js.
//
// Not part of the assert.js suite (there is nothing numeric worth asserting
// here -- the systems tests already cover every value). This just boots the
// scene against a stubbed DOM/canvas, the same idea as tests/harness.js uses
// for the main game, and drives it through a few frames, a purchase on each
// path, a re-aim click, and the active ability, to catch wiring mistakes
// (missing element ids, method typos, DOM access inside update()) that unit
// tests of the systems in isolation cannot see.
//
// Run with: node tests/long-range-dps-scene.smoke.js
// ---------------------------------------------------------------------------

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");

var SCRIPTS = [
  "js/units.js",
  "js/towers/long-range-dps.config.js",
  "js/systems/stat-resolver.js",
  "js/systems/crosspath.js",
  "js/systems/range-filter.js",
  "js/systems/pierce.js",
  "js/systems/execute.js",
  "js/systems/damage-pipeline.js",
  "js/systems/buff-stacks.js",
  "js/systems/reload.js",
  "js/systems/active-ability.js",
  "js/systems/tower-stats.js",
  "js/systems/upgrade-effects.js",
  "js/towers/tower-runtime.js",
  "js/scene/long-range-dps-scene.js"
];

function stubCtx() {
  return new Proxy({}, {
    get: function (t, k) { return (k in t) ? t[k] : function () { return undefined; }; },
    set: function (t, k, v) { t[k] = v; return true; }
  });
}

function makeElement() {
  var listeners = {};
  var el = {
    style: {},
    childNodes: [],
    firstChild: null,
    lastChild: null,
    addEventListener: function (name, fn) { listeners[name] = fn; },
    appendChild: function (child) {
      el.childNodes.push(child);
      el.firstChild = el.childNodes[0];
      el.lastChild = el.childNodes[el.childNodes.length - 1];
    },
    insertBefore: function (child) {
      el.childNodes.unshift(child);
      el.firstChild = el.childNodes[0];
      el.lastChild = el.childNodes[el.childNodes.length - 1];
    },
    removeChild: function (child) {
      var idx = el.childNodes.indexOf(child);
      if (idx !== -1) el.childNodes.splice(idx, 1);
      el.firstChild = el.childNodes[0] || null;
      el.lastChild = el.childNodes[el.childNodes.length - 1] || null;
    },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 1280, height: 720 }; },
    getContext: function () { return stubCtx(); },
    _fire: function (name, evt) { if (listeners[name]) listeners[name](evt || {}); }
  };
  return el;
}

var elements = {};
["scene", "statsTable", "flagsList", "tierA", "tierB", "buyA", "buyB",
  "crosspathNote", "spawnNormal", "spawnCamo", "spawnFlying", "clearEnemies",
  "triggerAbility", "log", "unitLength"].forEach(function (id) {
  var el = makeElement();
  el.width = 1280;
  el.height = 720;
  elements[id] = el;
});

var rafQueue = [];
var sandbox = {
  console: console,
  Math: Math,
  Proxy: Proxy,
  document: {
    getElementById: function (id) {
      if (!elements[id]) throw new Error("smoke test: no stub element for #" + id);
      return elements[id];
    },
    createElement: function () { return makeElement(); }
  },
  window: {},
  requestAnimationFrame: function (fn) { rafQueue.push(fn); return rafQueue.length; }
};
sandbox.window.document = sandbox.document;
sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;

vm.createContext(sandbox);

SCRIPTS.forEach(function (rel) {
  var file = path.join(ROOT, rel);
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: rel });
});

console.log("boot: ok, requestAnimationFrame scheduled " + rafQueue.length + " frame(s)");

// Drive a handful of frames.
for (var i = 0; i < 5 && rafQueue.length; i++) {
  var fn = rafQueue.shift();
  fn(i * 16.7);
}
console.log("frames: ok");

// Exercise the DOM-driven actions a real session would take.
elements.buyA._fire("click");
elements.buyB._fire("click");
elements.spawnNormal._fire("click");
elements.spawnCamo._fire("click");
elements.spawnFlying._fire("click");
console.log("purchases + spawns: ok");

for (var j = 0; j < 5 && rafQueue.length; j++) {
  var fn2 = rafQueue.shift();
  fn2(1000 + j * 16.7);
}
console.log("more frames after purchase: ok");

elements.scene._fire("click", { clientX: 900, clientY: 300 });
console.log("re-aim click: ok");

elements.triggerAbility._fire("click");
console.log("ability trigger (expected to report not-unlocked without B5): ok");

console.log("\nSMOKE TEST PASSED\n");
