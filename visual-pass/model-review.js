// Independent review instrument for enemy models -- kaz.
//
//     node visual-pass/model-review.js enemy-drudge enemy-normal ...
//     node visual-pass/model-review.js --all
//
// WHY THIS EXISTS SEPARATELY from tools/check-model-top.js and from otto's
// pixel rig: those are built by the people whose work I am reviewing. Every
// number below is recomputed from the shipped .js model file and js/enemy.js
// alone, so a bug in the build-side gate cannot also pass the review.
//
// Reports four things per model, and every one of them is a property of the
// WHOLE CYCLE rather than of one frame -- a single frame of an animated model
// is a sample, not a measurement:
//
//   1. crown margin      does the health bar clear the mesh, worst frame
//   2. cycle continuity  per-pair displacement + the WRAP printed on its own
//   3. walk envelope     does the body stay inside its own gameplay circle
//   4. geometry          triangles, groups, frames
//
// CHECK 3 IS THE UNIQUE VALUE HERE -- it is unguarded everywhere else in the
// pipeline. A body that overhangs its hover and frost rings at two frames in
// eight would ship silently, and it nearly did: a drum sized off the REST
// footprint rather than the walk envelope went into a build brief 20% too wide.
//
// WHAT THIS TOOL DOES NOT CHECK -- stated because it PASSED a model that had a
// real defect. enemy-angry shipped from e015ef5 with the crank collar passing
// through the arm: 18 penetrating pairs, worst -0.0093 u, and every gate below
// was green. There is no interpenetration test here at all.
//
// The obvious addition would make things worse rather than better. suki's first
// attempt compared whole-GROUP bounding boxes and reported overlap on all twelve
// frames for BOTH hips -- which is the same as reporting nothing, because two
// group boxes intersect happily with every solid far apart. A group-level check
// added in good faith would give false CONFIDENCE, not coverage. The test has to
// be PER PART, which is what AGENTS.md clause 8 already says and what her
// per-part run found in one pass (collar 0.75t -> 0.60t, 0 pairs, +0.0071 u).
//
// So: green here means the four things below are green. It does not mean the
// model is sound, and it should never be quoted as if it did.
//
// CHECK 2 IS A CROSS-CHECK, NOT A GATE, and that is a ruling rather than a
// preference. Max vertex displacement is dominated by whichever SINGLE vertex
// moves fastest, so a wing sweeping edge-on moves vertices hard while changing
// almost no pixels -- on enemy-flying this metric reports period 3 where the
// pixels report period 6, and the disagreement survives a 25x increase in pixel
// count. It is a max over a population of one. THE GATE IS otto's pixel table.
// What survives both metrics, and what this tool is therefore worth quoting on,
// is the WRAP RATIO (geometry 0.76-1.09, pixels 0.92-1.09 over the same five
// models) and DEAD PAIRS. Interior structure is metric-dependent: report it,
// never gate on it.

"use strict";

var fs = require("fs");
var vm = require("vm");
var path = require("path");

var ROOT = path.join(__dirname, "..", "TD_0.5.0");
var UNITS_TO_PX = 31.8032;      // board px per Blender unit
var CROWN_PAD_PX = 10;          // crownOf()'s flat headroom, board px
var RADIUS_PX = 11;             // Enemy.RADIUS_PX

function loadModels(names) {
  var sandbox = { console: console };
  sandbox.self = sandbox;
  var out = {};
  sandbox.GLModels = {
    register: function (n, m) { out[n] = m; },
    has: function () { return false; }
  };
  vm.createContext(sandbox);
  names.forEach(function (n) {
    var file = path.join(ROOT, "js", "gl", "models", n + ".js");
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox);
  });
  return out;
}

function loadTypes() {
  var sandbox = { console: { log: function () {} } };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "enemy.js"), "utf8"),
    sandbox);
  return sandbox.Enemy;
}

// Column-major 4x4, the order the exporter writes and uniformMatrix4fv wants.
function apply(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ];
}

// Every vertex of one frame, posed. `first`/`count` are VERTEX indices, not
// triangle indices -- reading them as triangles lands each group's matrix on
// the wrong third of its mesh.
function posedFrame(model, frame, visit) {
  var p = model.positions;
  var pose = (model.frames && model.frames[frame]) || [];
  for (var gi = 0; gi < model.groups.length; gi++) {
    var g = model.groups[gi];
    var mat = pose[gi];
    for (var v = g.first; v < g.first + g.count; v++) {
      var x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
      visit(mat ? apply(mat, x, y, z) : [x, y, z]);
    }
  }
}

function frameCount(model) {
  return (model.frames && model.frames.length) || 1;
}

function review(name, model, scale) {
  var F = frameCount(model);
  var lines = [];

  // --- 1. crown margin, worst frame -----------------------------------------
  var rawTop = 0, p = model.positions;
  for (var q = 2; q < p.length; q += 3) if (p[q] > rawTop) rawTop = p[q];
  var posedTop = -Infinity, worstTopFrame = -1;
  for (var f = 0; f < F; f++) {
    var hi = -Infinity;
    posedFrame(model, f, function (w) { if (w[2] > hi) hi = w[2]; });
    if (hi > posedTop) { posedTop = hi; worstTopFrame = f; }
  }
  var crown = rawTop * UNITS_TO_PX * scale + CROWN_PAD_PX;
  var trueTop = posedTop * UNITS_TO_PX * scale;
  var margin = crown - trueTop;
  lines.push("  crown margin  " + margin.toFixed(1) + " px  " +
    (margin >= 0 ? "OK" : "*** BAR BURIED " + (-margin).toFixed(1) + " px ***") +
    "   (raw top " + rawTop.toFixed(3) + ", posed top " + posedTop.toFixed(3) +
    " at frame " + worstTopFrame + " of " + F + ")");

  // --- 2. cycle continuity, wrap on its own row -----------------------------
  function step(a, b) {
    var pa = [], pb = [], i = 0;
    posedFrame(model, a, function (w) { pa.push(w); });
    posedFrame(model, b, function (w) { pb.push(w); });
    var mx = 0;
    for (i = 0; i < pa.length; i++) {
      var d = Math.hypot(pa[i][0] - pb[i][0], pa[i][1] - pb[i][1],
        pa[i][2] - pb[i][2]);
      if (d > mx) mx = d;
    }
    return mx * UNITS_TO_PX * scale;
  }
  if (F > 1) {
    var steps = [], dead = [];
    for (var s = 0; s < F - 1; s++) {
      steps.push(step(s, s + 1));
      if (steps[s] < 0.01) dead.push(s + "->" + (s + 1));
    }
    var wrap = step(F - 1, 0);
    var mean = steps.reduce(function (a, b) { return a + b; }, 0) / steps.length;
    var max = Math.max.apply(null, steps);
    var min = Math.min.apply(null, steps);
    lines.push("  cycle         " + F + " frames   interior min/mean/max  " +
      min.toFixed(2) + " / " + mean.toFixed(2) + " / " + max.toFixed(2) +
      "   (board px)");
    lines.push("  WRAP          " + wrap.toFixed(2) + " px  = " +
      (wrap / mean).toFixed(2) + "x mean, " + (wrap / max).toFixed(2) + "x max" +
      "   [observed enemy band 0.76-1.09x mean]");
    lines.push("  per-pair      " +
      steps.map(function (v) { return v.toFixed(1); }).join(" ") +
      "  | wrap " + wrap.toFixed(1));
    if (dead.length) {
      lines.push("  *** DEAD FRAME PAIR(S): " + dead.join(", ") +
        " -- authored but never moves ***");
    }
  } else {
    lines.push("  cycle         *** NOT ANIMATED (1 frame) ***");
  }

  // --- 3. walk envelope vs the gameplay circle ------------------------------
  // Unguarded anywhere else. A body wider than its circle overhangs its own
  // hover and frost rings, and only at the stride extremes.
  var envX = [Infinity, -Infinity], envY = [Infinity, -Infinity];
  var perFrameW = [], perFrameD = [];
  for (var ff = 0; ff < F; ff++) {
    var fx = [Infinity, -Infinity], fy = [Infinity, -Infinity];
    posedFrame(model, ff, function (w) {
      if (w[0] < fx[0]) fx[0] = w[0]; if (w[0] > fx[1]) fx[1] = w[0];
      if (w[1] < fy[0]) fy[0] = w[1]; if (w[1] > fy[1]) fy[1] = w[1];
    });
    perFrameW.push((fx[1] - fx[0]) * UNITS_TO_PX * scale);
    perFrameD.push((fy[1] - fy[0]) * UNITS_TO_PX * scale);
    if (fx[0] < envX[0]) envX[0] = fx[0]; if (fx[1] > envX[1]) envX[1] = fx[1];
    if (fy[0] < envY[0]) envY[0] = fy[0]; if (fy[1] > envY[1]) envY[1] = fy[1];
  }
  // THE UNION ACROSS FRAMES IS THE WRONG QUANTITY FOR THE RING QUESTION, and it
  // false-alarmed on the Hedger before this was fixed. The model is drawn at a
  // fixed position and its parts swing within it, so the union is the SWEPT
  // volume -- a shape the body never occupies at any single instant. A ring is
  // drawn around the body once per frame, so the only thing that can overhang it
  // is the largest extent in a SINGLE frame. Hedger: union 38.3 board px against
  // a 35.5 frost ring, which reads as 2.8 px proud, while its worst single frame
  // is 31.9 and inside by 3.6. Same family as a max taken over the wrong
  // population -- and the second false alarm this one check has produced, after
  // the bare-circle denominator. The swept figure is still printed, because a
  // large gap between swept and per-frame is worth seeing; it is not gated on.
  var envW = Math.max.apply(null, perFrameW);
  var envD = Math.max.apply(null, perFrameD);
  var sweptW = (envX[1] - envX[0]) * UNITS_TO_PX * scale;
  var restW = perFrameW[0];
  // THE RINGS ARE NOT DRAWN AT radiusPx(). The hover ring sits at
  // radiusPx() + HOVER_PAD_PX (9) and the frost/camo rings at radiusPx() + 4 --
  // see the comment above Enemy.HOVER_PAD_PX, which exists to keep the two 5 px
  // apart at every body size. Comparing a model's plan extent against the bare
  // 2*radiusPx() circle reports FOUR of the five shipped enemies as overhanging,
  // and that is an artefact of the wrong denominator, not a defect. The frost
  // ring is the tighter of the two and therefore the binding one.
  var hitCircle = 2 * RADIUS_PX * scale;
  var frostRing = 2 * (RADIUS_PX * scale + 4);
  var hoverRing = 2 * (RADIUS_PX * scale + 9);
  var worst = Math.max(envW, envD);
  lines.push("  envelope      " + envW.toFixed(1) + " x " + envD.toFixed(1) +
    " board px (worst single frame; swept "+sweptW.toFixed(1)+")   hit circle " + hitCircle.toFixed(1) +
    ", frost ring " + frostRing.toFixed(1) +
    ", hover ring " + hoverRing.toFixed(1));
  lines.push("  vs rings      " + (worst <= frostRing
    ? "inside both, " + (frostRing - worst).toFixed(1) + " px of slack to the frost ring"
    : worst <= hoverRing
      ? "*** proud of the FROST ring by " + (worst - frostRing).toFixed(1) + " px ***"
      : "*** proud of BOTH rings, hover by " + (worst - hoverRing).toFixed(1) + " px ***"));
  lines.push("  width by frame " + perFrameW.map(function (v) {
    return v.toFixed(1);
  }).join(" ") + "   (rest " + restW.toFixed(1) +
    ", swing adds " + (envW - restW).toFixed(1) + ")");

  // --- 4. geometry ----------------------------------------------------------
  //
  // THE FLAT 4032 "GLEANER PARITY" CEILING WAS RETIRED 2026-08-13, because it
  // measures the wrong thing and it misfired on the first model of batch 2.
  // A model's cost is its triangles TIMES how many of it are on the road at
  // once, and by that measure the ranking inverts: the Tender is the dearest
  // MODEL in its batch (6,328) and the second cheapest body on the road
  // (12,656), while the Stacker is the cheapest model (1,908) and by far the
  // dearest body (122,112) because one wave-25 spawn cascades to 64 of it.
  // The old flag would have sent a smith to shave a model that costs nothing
  // and waved through the one type in the game that multiplies.
  //
  // MAX_ON_ROAD is the largest simultaneous population, read off EASY_WAVES
  // (js/game.js). It is a schedule fact, so it goes stale if the waves change
  // -- an absent entry prints no peak rather than guessing one.
  var MAX_ON_ROAD = {
    "enemy-normal": 30, "enemy-swarm": 30, "enemy-fast": 18, "enemy-slow": 14,
    "enemy-armored": 10, "enemy-angry": 10, "enemy-flying": 8, "enemy-brute": 4,
    "enemy-hive": 3, "enemy-camo_normal": 10, "enemy-camo_fast": 12,
    "enemy-camo_heavy": 6, "enemy-shielded": 6, "enemy-revenant": 6,
    "enemy-healer": 3, "enemy-shieldbearer": 2, "enemy-colossus": 1,
    // 1 T3 -> 4 T2 -> 16 T1 -> 64 T0. The only type that multiplies.
    "enemy-fractal_slime": 64
  };
  var moving = model.groups.filter(function (g) { return g.name; }).length;
  var onRoad = MAX_ON_ROAD[name];
  lines.push("  geometry      " + model.triangles + " triangles, " +
    model.groups.length + " groups (" + moving + " animated), " +
    model.palette.length + " colours" +
    (onRoad
      ? "   peak " + (model.triangles * onRoad).toLocaleString() +
        " tri (x" + onRoad + " on road)   [Gleaner 120,960; hive 23,328]"
      : "   [no schedule entry -- peak not computed]"));

  console.log(name + "   scale " + scale.toFixed(2));
  lines.forEach(function (l) { console.log(l); });
  console.log("");
}

function main() {
  var args = process.argv.slice(2);
  var Enemy = loadTypes();
  var names;
  if (!args.length || args[0] === "--all") {
    names = fs.readdirSync(path.join(ROOT, "js", "gl", "models"))
      .filter(function (f) { return /^enemy-.*\.js$/.test(f); })
      .map(function (f) { return f.replace(/\.js$/, ""); });
  } else {
    names = args;
  }
  var models = loadModels(names);
  console.log("Model review -- every figure is across ALL FRAMES unless said " +
    "otherwise.\n");
  names.forEach(function (n) {
    var typeId = n.replace(/^enemy-/, "");
    var type = Enemy.TYPES[typeId];
    if (!type) {
      console.log(n + "   *** no Enemy.TYPES entry for id '" + typeId +
        "' -- enemyModel() will never find this file ***\n");
      return;
    }
    var scale = RADIUS_PX * (type.sizeScale || 1) / 11;
    review(n, models[n], scale);
  });
}

main();
