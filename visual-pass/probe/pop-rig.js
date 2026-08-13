// ---------------------------------------------------------------------------
// pop-rig.js -- the population sweep.
//
//   node visual-pass/probe/pop-rig.js [--swiftshader] [--out FILE] [--quick]
//
// Drives the REAL game's REAL frame(now) in headless Chrome from 0 to 1000
// bodies, at gameSpeed 1 and 3, and splits the cost into simulation, the GL
// pass and the 2D overlay pass.
//
// WHY THIS ONE DOES NOT USE cdp.launch's FLAGS. Every other probe in this
// directory runs SwiftShader on purpose, because a null control has to reach
// exactly zero and a real driver varies sample resolve order between frames.
// That is right for a pixel diff and WRONG for a timing measurement: software
// rasterisation makes fragments and triangles expensive in a way no player's
// machine is, which is the exact axis the answer turns on. This rig launches
// on whatever raster Chrome actually gets and PRINTS the renderer string, so
// no number can be read without knowing which machine produced it.
// `--swiftshader` runs the same sweep on software raster as a sensitivity
// check on that decision.
//
// A FRAME-TIME MEASUREMENT IS NOT REPEATABLE IN PARALLEL WITH OTHER CAPTURE
// WORK, AND THIS COMPANY ROUTINELY RUNS SEVERAL AT ONCE. A second WebGL
// context on the machine contends for the same GPU and the same cores.
// Measured here: two full sweeps of identical code, one taken with a quiet
// machine and one taken with 33 foreign chrome.exe processes and ~85 leaked
// ones of my own alive, disagreed by 1.3-1.6x on every absolute figure --
// larger than most differences anyone would run this rig to detect.
//
// So the rig COUNTS the browser processes on the machine, before and after,
// and prints them beside the table. A row taken with a high foreign count is
// not a measurement of the game. It is not enough to promise to run alone;
// nothing else here would have told me I had not.
//
// COMPONENT ATTRIBUTION IS DONE BY A/B ON THE SAME SCENE, not by a CPU timer.
// GL commands are queued and 2D canvas calls are recorded; a `performance.now`
// bracket round either pass measures submission, not work. Each row is run
// three times -- unstubbed, with drawOverlays a no-op, with drawWorld a no-op
// -- and the marginal cost of a pass is the difference in SUSTAINED batch
// time, which contains its GPU half.
"use strict";

var childProcess = require("child_process");
var fs = require("fs");
var os = require("os");
var path = require("path");
var cdp = require("./cdp.js");
var serve = require("./serve.js");

var PORT = 9331;
var HTTP = 8794;
var SWIFT = process.argv.indexOf("--swiftshader") >= 0;
var NO2DGPU = process.argv.indexOf("--no2dgpu") >= 0;
var QUICK = process.argv.indexOf("--quick") >= 0;
var FRAMES = QUICK ? 60 : 150;
var OUT = (function () {
  var i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : path.join(__dirname, "out-pop.json");
})();

// Bosses are exempt from the population constraint by Diego's ruling, so they
// are excluded from every "ordinary enemy" composition. There is no `boss`
// flag on Enemy.TYPES -- the roster reports false for all of them -- so the
// classification is by id and is stated here rather than inferred.
var BOSS_IDS = { midboss: 1, boss: 1, boss_fast: 1 };

function launch(port, profileDir) {
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(profileDir, { recursive: true });
  var args = [
    "--headless=new",
    "--remote-debugging-port=" + port,
    "--user-data-dir=" + profileDir,
    "--no-first-run", "--no-default-browser-check", "--no-sandbox",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--window-size=1280,720",
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit"
  ];
  if (SWIFT) args.push("--use-angle=swiftshader", "--enable-unsafe-swiftshader");
  // THE OVERLAY DEFERRAL CHECK. A GPU-backed 2D canvas RECORDS ctx calls and
  // rasterises them later -- and every frame here begins with a clearRect and
  // is never presented, so a recorded frame can be discarded before it is ever
  // drawn. If that is happening, a CPU bracket round drawOverlays measures
  // bookkeeping and the real cost is invisible. Re-running the sweep with the
  // 2D canvas forced onto the CPU makes every ctx call do its own
  // rasterisation inside drawOverlays, so the two configurations bracket the
  // truth instead of assuming it.
  if (NO2DGPU) args.push("--disable-accelerated-2d-canvas");
  args.push("about:blank");
  var child = childProcess.spawn(cdp.CHROME, args, { stdio: "ignore" });
  child.on("exit", function () {
    setTimeout(function () {
      try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
    }, 250);
  });
  return child;
}

// ---- statistics ------------------------------------------------------------
//
// MEDIAN is the headline. A mean over frame times is dragged by the one GC
// pause and the one-off compile that any sweep contains, and a max over 150
// frames is a single sample of a tail. All three are reported and each is
// named where it is used.
function stats(xs) {
  if (!xs.length) return null;
  var s = xs.slice().sort(function (a, b) { return a - b; });
  function q(f) {
    var i = Math.min(s.length - 1, Math.max(0, Math.round(f * (s.length - 1))));
    return s[i];
  }
  var sum = 0;
  for (var i = 0; i < s.length; i++) sum += s[i];
  return { med: q(0.5), p95: q(0.95), max: s[s.length - 1], mean: sum / s.length,
           n: s.length };
}
function r3(x) { return (x === null || x === undefined) ? null : Math.round(x * 1000) / 1000; }
function statRow(xs) {
  var t = stats(xs);
  if (!t) return null;
  return { med: r3(t.med), p95: r3(t.p95), max: r3(t.max), mean: r3(t.mean), n: t.n };
}
function col(rows, key) { return rows.map(function (r) { return r[key]; }); }
function pad(x, w) { x = String(x); while (x.length < w) x = " " + x; return x; }

// How much OTHER browser work is on this machine right now. `mine` are this
// rig's own processes (matched on the probe profile path, never on the name --
// a blanket chrome match would sweep the user's own windows and every other
// agent's); `foreign` is everything else, and a nonzero foreign count
// invalidates the absolute figures.
function browserLoad() {
  try {
    var ps = childProcess.execSync(
      "powershell -NoProfile -Command \"$a=@(Get-CimInstance Win32_Process -Filter \\\"Name='chrome.exe'\\\");" +
      "$m=@($a|Where-Object{$_.CommandLine -like '*td-pop*'});" +
      "\\\"$($a.Count) $($m.Count)\\\"\"", { encoding: "utf8", timeout: 30000 }).trim().split(/\s+/);
    var total = parseInt(ps[0], 10) || 0, mine = parseInt(ps[1], 10) || 0;
    return { chromeTotal: total, chromeMine: mine, chromeForeign: total - mine };
  } catch (e) { return { error: String(e && e.message) }; }
}

async function main() {
  var server = await new Promise(function (res, rej) {
    serve.start(HTTP, function (e, s) { e ? rej(e) : res(s); });
  });
  var chrome = launch(PORT, path.join(os.tmpdir(), "td-pop-profile"));
  var out = { startedAt: new Date().toISOString(), swiftshader: SWIFT,
              accelerated2dCanvas: !NO2DGPU, framesPerRun: FRAMES, rows: [] };
  try {
    await cdp.waitForDevTools(PORT, 80);
    var o = await cdp.open(PORT, "http://127.0.0.1:" + HTTP + "/TD_0.5.0/index.html");
    var s = o.session;
    await cdp.sleep(2500);
    var J = async function (expr) { return JSON.parse(await s.evaluate("JSON.stringify(" + expr + ")")); };

    await s.evaluate("window.__err=[];window.addEventListener('error',function(e){window.__err.push(String(e.message))});1");
    await s.evaluate(fs.readFileSync(path.join(__dirname, "pop-page.js"), "utf8"));

    var env = await J("TDPop.setup()");
    out.env = env;
    console.log("== ENVIRONMENT ==");
    console.log("  renderer     :", env.webglRenderer);
    console.log("  gl canvas    :", env.gl.join("x"), "  ui canvas:", env.ui.join("x"));
    console.log("  camera       : distance " + r3(env.camera.distance) +
                "  target [" + env.camera.target.map(r3).join(",") + "]");
    console.log("  path length  :", r3(env.pathLength), " routes:", env.pathCount);
    console.log("  perf.now res :", r3(env.clockResolutionMs), "ms");
    out.browserLoadStart = browserLoad();
    console.log("  browser load : chrome.exe total " + out.browserLoadStart.chromeTotal +
                ", mine " + out.browserLoadStart.chromeMine +
                ", FOREIGN " + out.browserLoadStart.chromeForeign +
                (out.browserLoadStart.chromeForeign > 0
                  ? "   <-- foreign browser work is on this machine; absolute times are contaminated"
                  : ""));
    if (Math.abs(env.camera.distance - 900) < 1) throw new Error("camera not fitted");

    await s.evaluate("TDPop.instrument()");
    out.timerQuery = await J("TDPop.timerQuery()");
    console.log("  GPU timer ext:", JSON.stringify(out.timerQuery));

    var roster = await J("TDPop.roster()");
    out.roster = roster;
    var ordinary = roster.filter(function (t) { return !BOSS_IDS[t.id]; });
    var MESHED = ordinary.filter(function (t) { return t.meshed; }).map(function (t) { return t.id; });
    var SPHERE = ordinary.filter(function (t) { return !t.meshed; }).map(function (t) { return t.id; });
    out.meshedOrdinary = MESHED;
    out.sphereOrdinary = SPHERE;
    console.log("\n== ROSTER ==");
    console.log("  meshed ordinary (" + MESHED.length + "): " + MESHED.join(" "));
    console.log("  sphere ordinary (" + SPHERE.length + "): " + SPHERE.join(" "));
    console.log("  bosses, exempt : " + Object.keys(BOSS_IDS).join(" "));

    // ---- what the schedule can actually produce ---------------------------
    console.log("\n== WAVE SCHEDULE PEAK (real scheduler, no defence, base held) ==");
    out.schedule = {};
    // 1500 s of simulation reached only wave 27 of 35, so the first version of
    // this scan reported a whole-game peak of 60 -- half the figure the same
    // rig gets by starting at wave 30. A scan that does not reach the wave
    // under test is not a null result about it.
    var scans = [{ from: 0, seconds: QUICK ? 600 : 3200, tag: "whole game" },
                 { from: 24, seconds: 300, tag: "from wave 25" },
                 { from: 29, seconds: 300, tag: "from wave 30" },
                 { from: 34, seconds: 300, tag: "from wave 35" }];
    var best = null;
    for (var sc of scans) {
      var r = await J("TDPop.schedule({startWave:" + sc.from + ", seconds:" + sc.seconds + "})");
      out.schedule[sc.tag] = r;
      console.log("  " + pad(sc.tag, 12) + " peak " + pad(r.peak, 4) + " bodies at t=" +
                  r3(r.atSeconds) + "s (wave " + (r.waveIndexAtPeak + 1) + ")  " +
                  JSON.stringify(r.composition));
      if (!best || r.peak > best.peak) best = r;
    }
    out.peakComposition = best.composition;
    out.peakPopulation = best.peak;

    // Turn the measured peak composition into a mix array that keeps its
    // proportions at any N, shuffled so one type is not laid consecutively
    // along the road.
    var scheduleMix = [];
    for (var t in best.composition) {
      var share = Math.max(1, Math.round(best.composition[t] / best.peak * 100));
      for (var q = 0; q < share; q++) scheduleMix.push(t);
    }
    var seed = 12345;
    for (var j = scheduleMix.length - 1; j > 0; j--) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var mIdx = seed % (j + 1);
      var tmp = scheduleMix[j]; scheduleMix[j] = scheduleMix[mIdx]; scheduleMix[mIdx] = tmp;
    }
    out.scheduleMix = scheduleMix;
    var schedMeshedShare = scheduleMix.filter(function (x) { return MESHED.indexOf(x) >= 0; }).length /
                           scheduleMix.length;
    out.scheduleMeshedShare = schedMeshedShare;
    console.log("  peak composition is " + Math.round(schedMeshedShare * 100) + "% MESHED types");

    // The schedule scan left the board mid-wave. Rebuild the sandbox.
    await J("TDPop.setup()");
    console.log("\n== WARM-UP (discarded) ==");
    console.log("  " + await s.evaluate("TDPop.warmup({n:600, mix:" + JSON.stringify(MESHED) + "})"));
    await J("TDPop.baseline()");
    var base = await J("TDPop.baseline()");
    out.baselineNull = base.nullChanged;
    console.log("  empty-board null control (same state twice):", base.nullChanged, "changed px");

    // The controlled variable. A corner of the GL canvas no body reaches --
    // measured, at every row, and required not to move. A printed camera
    // distance would look just as controlled and would not be.
    var ROI = [0, 0, 120, 120];
    out.controlROI = ROI;
    var roiRef = await J("TDPop.controlROI(" + JSON.stringify(ROI) + ")");
    out.controlROIRef = roiRef;
    console.log("  control ROI " + JSON.stringify(ROI) + " reference hash " + roiRef.hash);

    // ---- the sweep --------------------------------------------------------

    // The first quick pass had an all-fallback row costing MORE than an
    // all-meshed one at the same N (3.38 vs 2.59 ms sustained) on a quarter of
    // the draw calls, which cannot be a geometry result. Two of the five
    // sphere types are CAMO, and a camo body draws a dashed, projected ground
    // ring in the overlay whether or not it has a mesh. So "sphere" was never
    // a geometry row -- it was a camo row wearing a geometry label. Split.
    var NOCAMO_SPHERE = SPHERE.filter(function (x) { return x.indexOf("camo") !== 0; });
    var CAMO_ALL = roster.filter(function (t) { return t.id.indexOf("camo") === 0; })
                         .map(function (t) { return t.id; });
    out.camoIds = CAMO_ALL;
    var COMPOSITIONS = {
      meshed:   { mix: MESHED, damaged: true,
                  label: "(a) all-meshed ordinary, damaged -- worst realistic case" },
      schedule: { mix: scheduleMix, damaged: true,
                  label: "(b) measured wave-schedule peak composition, damaged" },
      sphere:   { mix: NOCAMO_SPHERE.length ? NOCAMO_SPHERE : ["normal"], damaged: true,
                  label: "(c) fallback sphere, NO camo, damaged -- the cheap geometry end" },
      camo:     { mix: CAMO_ALL, damaged: true,
                  label: "(c2) all-camo -- isolates the projected camo ground ring" },
      undamaged:{ mix: MESHED, damaged: false,
                  label: "(d) all-meshed, UNDAMAGED -- isolates the health bars" }
    };
    var PLAN = [
      { comp: "meshed",    ns: QUICK ? [100, 400] : [0, 50, 100, 200, 300, 400, 500, 700, 1000, 1500, 2000] },
      { comp: "schedule",  ns: QUICK ? [400] : [100, 200, 300, 400, 500] },
      { comp: "sphere",    ns: QUICK ? [400] : [400, 500] },
      { comp: "camo",      ns: QUICK ? [400] : [400, 500] },
      { comp: "undamaged", ns: QUICK ? [400] : [400, 500] }
    ];

    console.log("\n== SWEEP == (all times ms; sustained = batch wall clock / frame, fenced)");
    console.log([pad("comp", 10), pad("N", 5), pad("actual", 6), pad("cover", 7), pad("onScr", 5),
                 pad("calls", 5), pad("ktris", 6), pad("cpu50", 6), pad("cpu95", 6), pad("cpuMax", 6),
                 pad("sus1x", 6), pad("sus3x", 6), pad("ovl", 6), pad("gl", 6),
                 pad("us/step", 7), "ctrl"].join(" "));

    for (var pi = 0; pi < PLAN.length; pi++) {
      var plan = PLAN[pi];
      var C = COMPOSITIONS[plan.comp];
      for (var ni = 0; ni < plan.ns.length; ni++) {
        var N = plan.ns[ni];
        var built = await J("TDPop.build(" +
          JSON.stringify({ n: N, mix: C.mix, damaged: C.damaged }) + ")");
        var cover = await J("TDPop.covered(0)");
        var onScr = await J("TDPop.onScreen()");

        var full1 = await J("TDPop.run({frames:" + FRAMES + ", speed:1})");
        var noOvl = await J("TDPop.run({frames:" + FRAMES + ", speed:1, stub:'overlay'})");
        var noGl  = await J("TDPop.run({frames:" + FRAMES + ", speed:1, stub:'gl'})");
        var full3 = await J("TDPop.run({frames:" + FRAMES + ", speed:3})");
        // Simulation cost is re-measured on a freshly rebuilt board, because
        // the runs above have walked bodies down the road.
        await J("TDPop.build(" + JSON.stringify({ n: N, mix: C.mix, damaged: C.damaged }) + ")");
        var sim = await J("TDPop.simCost(200)");
        var ctrl = await J("TDPop.controlROI(" + JSON.stringify(ROI) + ")");

        var sus1 = full1.batchMs / full1.frames;
        var sus3 = full3.batchMs / full3.frames;
        var susNoOvl = noOvl.batchMs / noOvl.frames;
        var susNoGl = noGl.batchMs / noGl.frames;
        var cpu = statRow(col(full1.rows, "total"));
        var row = {
          comp: plan.comp, label: C.label, N: N,
          builtActual: built.actual, builtFinite: built.finite, builtHurt: built.hurt,
          composition: built.composition,
          coverPx: cover.changed, coverBboxGL: cover.bboxGL,
          coverFraction: r3(cover.changed / (env.gl[0] * env.gl[1])),
          onScreen: onScr && onScr.inside, onScreenTotal: onScr && onScr.total,
          drawCalls: full1.rows[0] ? full1.rows[0].dc : 0,
          triangles: full1.rows[0] ? full1.rows[0].tri : 0,
          nStart1x: full1.nStart, nEnd1x: full1.nEnd,
          nStart3x: full3.nStart, nEnd3x: full3.nEnd,
          cpu1x: cpu, cpu3x: statRow(col(full3.rows, "total")),
          sustained1x: r3(sus1), sustained3x: r3(sus3),
          sustainedNoOverlay: r3(susNoOvl), sustainedNoGL: r3(susNoGl),
          overlayMarginal: r3(sus1 - susNoOvl),
          glMarginal: r3(sus1 - susNoGl),
          submitOnly1x: r3(full1.submitMs / full1.frames),
          cpuGl1x: statRow(col(full1.rows, "gl")),
          cpuOverlay1x: statRow(col(full1.rows, "ov")),
          simMsPerStep: r3(sim.msPerStep),
          simUsPerStep: r3(sim.msPerStep * 1000),
          simNStart: sim.nStart, simNEnd: sim.nEnd,
          ctrlHash: ctrl.hash, ctrlSum: ctrl.sum,
          ctrlHeld: ctrl.hash === roiRef.hash
        };
        // kaz's stability model, evaluated on this row's own measurements.
        // R is the per-frame cost that is NOT simulation: the measured
        // sustained frame minus the simulation actually run inside it (one
        // step per frame at 1x, three at 3x, on the 16.67 ms synthetic clock).
        [[1, sus1], [3, sus3]].forEach(function (pairv) {
          var sp = pairv[0], sus = pairv[1];
          var S = sim.msPerStep;
          var R = sus - S * sp;
          var denom = 1 - sp * 60 * (S / 1000);
          row["modelT" + sp + "x"] = denom > 0 ? r3(R / denom) : null;
          row["modelR" + sp + "x"] = r3(R);
          row["modelDenom" + sp + "x"] = r3(denom);
        });
        out.rows.push(row);
        console.log([pad(plan.comp, 10), pad(N, 5), pad(built.actual, 6), pad(cover.changed, 7),
                     pad(onScr ? onScr.inside : "-", 5), pad(row.drawCalls, 5),
                     pad(Math.round(row.triangles / 1000), 6),
                     pad(r3(cpu.med), 6), pad(r3(cpu.p95), 6), pad(r3(cpu.max), 6),
                     pad(r3(sus1), 6), pad(r3(sus3), 6),
                     pad(r3(sus1 - susNoOvl), 6), pad(r3(sus1 - susNoGl), 6),
                     pad(r3(sim.msPerStep * 1000), 7),
                     ctrl.hash + (ctrl.hash === roiRef.hash ? "" : "  *** CONTROL MOVED ***")].join(" "));
      }
    }

    // ---- the paced runs: the cliff, measured rather than computed ----------
    console.log("\n== PACED (frame fed max(16.67, previous frame duration) -- what rAF does) ==");
    out.paced = [];
    var pacedNs = QUICK ? [400] : [100, 200, 300, 400, 500, 700, 1000, 1500, 2000];
    for (var pn of pacedNs) {
      await J("TDPop.build(" + JSON.stringify({ n: pn, mix: MESHED, damaged: true }) + ")");
      var line = "  N=" + pad(pn, 4);
      for (var sp2 of [1, 3]) {
        var rr = await J("TDPop.runPaced({frames:" + (QUICK ? 60 : 120) + ", speed:" + sp2 + "})");
        var st = statRow(rr.periods), sst = statRow(rr.steps);
        out.paced.push({ n: pn, speed: sp2, period: st, steps: sst, nEnd: rr.n });
        line += "   " + sp2 + "x: " + pad(st.med, 7) + " ms med (p95 " + pad(st.p95, 6) +
                ", max " + pad(st.max, 6) + ") steps/frame " + sst.med;
      }
      console.log(line);
    }

    // ---- closing controls -------------------------------------------------
    var closing = await J("(function(){ enemies.length=0; draw(); draw();" +
      " return { emptyVsBaseline: TDPop.covered(0).changed," +
      " roi: TDPop.controlROI(" + JSON.stringify(ROI) + "), state: TDPop.state() }; })()");
    out.closingControl = closing;
    var envEnd = await J("TDPop.setup()");
    out.envEnd = { camera: envEnd.camera, gl: envEnd.gl, ui: envEnd.ui };
    out.pageErrors = await J("window.__err");
    console.log("\n== CLOSING CONTROLS ==");
    console.log("  empty board vs opening baseline :", closing.emptyVsBaseline, "changed px (want 0)");
    console.log("  control ROI hash at end         :", closing.roi.hash,
                closing.roi.hash === roiRef.hash ? "(held)" : "*** MOVED ***");
    console.log("  camera at end                   : distance " + r3(envEnd.camera.distance) +
                " target [" + envEnd.camera.target.map(r3).join(",") + "]");
    console.log("  page errors                     :", JSON.stringify(out.pageErrors));
    out.browserLoadEnd = browserLoad();
    console.log("  browser load at end             : total " + out.browserLoadEnd.chromeTotal +
                ", mine " + out.browserLoadEnd.chromeMine +
                ", FOREIGN " + out.browserLoadEnd.chromeForeign);
  } finally {
    out.finishedAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    console.log("\nwrote", OUT);
    try { chrome.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
  }
}

main().then(function () { process.exit(0); },
            function (e) { console.error("FAILED:", e && e.stack || e); process.exit(1); });
