// ---------------------------------------------------------------------------
// pop-attrib.js -- attribution A/Bs for the population sweep.
//
//   node visual-pass/probe/pop-attrib.js [--no2dgpu] [--swiftshader] [--out F]
//
// The sweep says WHAT the frame costs. This says WHICH PART, by pairs of runs
// that differ in exactly one thing on the same scene:
//
//   camo ring     same 400 bodies, `isCamo` flipped -- geometry, draw calls,
//                 bars and positions all identical, only the ring differs
//   health bars   same 400 bodies, damaged vs full -- `bar()` returns early on
//                 a full-health body, so an undamaged board draws zero bars
//   overlay pass  World3D.drawOverlays stubbed to a no-op
//   GL pass       World3D.drawWorld stubbed (returning TRUTHY, or game.js
//                 falls through to the entire 2D fallback board and the
//                 control is a different renderer)
//
// AND IT EXISTS MOSTLY FOR ONE THREAT. A GPU-backed 2D canvas RECORDS ctx
// calls and rasterises them later. Every frame here starts with a clearRect
// and is never presented, so a recorded frame can be thrown away before it is
// ever drawn -- and then a CPU bracket round drawOverlays measures bookkeeping
// while the real cost is invisible, which would flatter exactly the component
// most likely to be the wall. Run this twice, with and without
// `--disable-accelerated-2d-canvas`, and the two configurations bracket it.
"use strict";

var childProcess = require("child_process");
var fs = require("fs"), os = require("os"), path = require("path");
var cdp = require("./cdp.js");
var serve = require("./serve.js");

var SWIFT = process.argv.indexOf("--swiftshader") >= 0;
var NO2DGPU = process.argv.indexOf("--no2dgpu") >= 0;
var PORT = 9341 + (NO2DGPU ? 1 : 0), HTTP = 8797 + (NO2DGPU ? 1 : 0);
var FRAMES = 200;
var OUT = (function () {
  var i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1]
                : path.join(__dirname, "out-pop-attrib" + (NO2DGPU ? "-cpu2d" : "") + ".json");
})();

function launch(port, profileDir) {
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(profileDir, { recursive: true });
  var args = ["--headless=new", "--remote-debugging-port=" + port,
    "--user-data-dir=" + profileDir, "--no-first-run", "--no-default-browser-check",
    "--no-sandbox", "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--window-size=1280,720", "--force-device-scale-factor=1", "--hide-scrollbars",
    "--disable-gpu-vsync", "--disable-frame-rate-limit"];
  if (SWIFT) args.push("--use-angle=swiftshader", "--enable-unsafe-swiftshader");
  if (NO2DGPU) args.push("--disable-accelerated-2d-canvas");
  args.push("about:blank");
  var c = childProcess.spawn(cdp.CHROME, args, { stdio: "ignore" });
  c.on("exit", function () { setTimeout(function () {
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {} }, 250); });
  return c;
}

function stats(xs) {
  var s = xs.slice().sort(function (a, b) { return a - b; });
  function q(f) { return s[Math.min(s.length - 1, Math.round(f * (s.length - 1)))]; }
  return { med: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}
function r3(x) { return x === null || x === undefined ? null : Math.round(x * 1000) / 1000; }
function pad(x, w) { x = String(x); while (x.length < w) x = " " + x; return x; }

async function main() {
  var server = await new Promise(function (res, rej) {
    serve.start(HTTP, function (e, s) { e ? rej(e) : res(s); });
  });
  var chrome = launch(PORT, path.join(os.tmpdir(), "td-popattrib-profile" + (NO2DGPU ? "2" : "")));
  var out = { startedAt: new Date().toISOString(), swiftshader: SWIFT,
              accelerated2dCanvas: !NO2DGPU, framesPerRun: FRAMES, cases: [] };
  try {
    await cdp.waitForDevTools(PORT, 80);
    var o = await cdp.open(PORT, "http://127.0.0.1:" + HTTP + "/TD_0.5.0/index.html");
    var s = o.session;
    await cdp.sleep(2500);
    var J = async function (e) { return JSON.parse(await s.evaluate("JSON.stringify(" + e + ")")); };
    await s.evaluate("window.__err=[];window.addEventListener('error',function(e){window.__err.push(String(e.message))});1");
    await s.evaluate(fs.readFileSync(path.join(__dirname, "pop-page.js"), "utf8"));
    var env = await J("TDPop.setup()");
    out.env = env;
    console.log("renderer:", env.webglRenderer);
    console.log("2D canvas acceleration:", NO2DGPU ? "DISABLED (forced CPU)" : "default (GPU)");
    if (Math.abs(env.camera.distance - 900) < 1) throw new Error("camera not fitted");
    await s.evaluate("TDPop.instrument()");
    var roster = await J("TDPop.roster()");
    var MESHED = roster.filter(function (t) {
      return t.meshed && ["midboss", "boss", "boss_fast"].indexOf(t.id) < 0;
    }).map(function (t) { return t.id; });
    var CAMO = roster.filter(function (t) { return t.id.indexOf("camo") === 0; })
                     .map(function (t) { return t.id; });
    await s.evaluate("TDPop.warmup({n:600, mix:" + JSON.stringify(MESHED) + "})");
    await J("TDPop.baseline()");

    var CASES = [
      { tag: "meshed400 damaged",   spec: { n: 400, mix: MESHED, damaged: true } },
      // The health-bar pair pins camo OFF in BOTH halves, so the one field
      // that differs is health. The all-meshed mix contains camo_normal, and
      // leaving its ring in one half of a bar A/B mixes two effects.
      { tag: "meshed400 bars ON",   spec: { n: 400, mix: MESHED, damaged: true, forceCamo: false } },
      { tag: "meshed400 bars OFF",  spec: { n: 400, mix: MESHED, damaged: false, forceCamo: false } },
      { tag: "camo400 rings ON",    spec: { n: 400, mix: CAMO, damaged: true, forceCamo: true } },
      { tag: "camo400 rings OFF",   spec: { n: 400, mix: CAMO, damaged: true, forceCamo: false } },
      { tag: "meshed500 damaged",   spec: { n: 500, mix: MESHED, damaged: true } }
    ];

    console.log("\ncase                    N  camo hurt  calls   full   noOvl    noGL |" +
                " cpuOvl med  p95   max | cpuGL med");
    for (var ci = 0; ci < CASES.length; ci++) {
      var c = CASES[ci];
      var built = await J("TDPop.build(" + JSON.stringify(c.spec) + ")");
      var full = await J("TDPop.run({frames:" + FRAMES + ", speed:1})");
      var noOv = await J("TDPop.run({frames:" + FRAMES + ", speed:1, stub:'overlay'})");
      var noGl = await J("TDPop.run({frames:" + FRAMES + ", speed:1, stub:'gl'})");
      var ovCpu = stats(full.rows.map(function (r) { return r.ov; }));
      var glCpu = stats(full.rows.map(function (r) { return r.gl; }));
      var rec = {
        tag: c.tag, spec: c.spec, built: built,
        sustainedFull: r3(full.batchMs / full.frames),
        sustainedNoOverlay: r3(noOv.batchMs / noOv.frames),
        sustainedNoGL: r3(noGl.batchMs / noGl.frames),
        overlayMarginal: r3(full.batchMs / full.frames - noOv.batchMs / noOv.frames),
        glMarginal: r3(full.batchMs / full.frames - noGl.batchMs / noGl.frames),
        cpuOverlay: { med: r3(ovCpu.med), p95: r3(ovCpu.p95), max: r3(ovCpu.max) },
        cpuGL: { med: r3(glCpu.med), p95: r3(glCpu.p95), max: r3(glCpu.max) },
        drawCalls: full.rows[0].dc, triangles: full.rows[0].tri
      };
      out.cases.push(rec);
      console.log(pad(c.tag, 20) + pad(built.actual, 5) + pad(built.camo, 6) +
        pad(built.hurt, 5) + pad(rec.drawCalls, 7) +
        pad(rec.sustainedFull, 7) + pad(rec.sustainedNoOverlay, 8) + pad(rec.sustainedNoGL, 8) +
        " |" + pad(rec.cpuOverlay.med, 11) + pad(rec.cpuOverlay.p95, 5) + pad(rec.cpuOverlay.max, 6) +
        " |" + pad(rec.cpuGL.med, 10));
    }

    function find(t) { return out.cases.filter(function (x) { return x.tag === t; })[0]; }
    var ringOn = find("camo400 rings ON"), ringOff = find("camo400 rings OFF");
    var bars = find("meshed400 bars ON"), noBars = find("meshed400 bars OFF");
    out.derived = {
      camoRing400_sustained: r3(ringOn.sustainedFull - ringOff.sustainedFull),
      camoRing400_cpuOverlay: r3(ringOn.cpuOverlay.med - ringOff.cpuOverlay.med),
      camoRingPerBodyUs: r3((ringOn.sustainedFull - ringOff.sustainedFull) / 400 * 1000),
      healthBars400_sustained: r3(bars.sustainedFull - noBars.sustainedFull),
      healthBars400_cpuOverlay: r3(bars.cpuOverlay.med - noBars.cpuOverlay.med),
      healthBarPerBodyUs: r3((bars.sustainedFull - noBars.sustainedFull) / 400 * 1000)
    };
    console.log("\n== ISOLATED, SAME SCENE, ONE FIELD FLIPPED ==");
    console.log("  camo ring, 400 bodies  : " + out.derived.camoRing400_sustained +
      " ms sustained  (" + out.derived.camoRingPerBodyUs + " us/body)" +
      "   cpu-overlay delta " + out.derived.camoRing400_cpuOverlay + " ms");
    console.log("  health bars, 400 bodies: " + out.derived.healthBars400_sustained +
      " ms sustained  (" + out.derived.healthBarPerBodyUs + " us/body)" +
      "   cpu-overlay delta " + out.derived.healthBars400_cpuOverlay + " ms");

    // Does the CPU bracket agree with the A/B? If it does, 2D canvas work is
    // not being deferred past the measurement in a way that matters. If it
    // does not, the A/B is the number to trust and the bracket is bookkeeping.
    console.log("\n== CPU BRACKET vs A/B (agreement means no hidden deferral) ==");
    out.cases.forEach(function (c) {
      console.log("  " + pad(c.tag, 20) + " overlay: bracket " + pad(c.cpuOverlay.med, 6) +
        "  A/B " + pad(c.overlayMarginal, 7) +
        "   GL: bracket " + pad(c.cpuGL.med, 6) + "  A/B " + pad(c.glMarginal, 7));
    });
    out.pageErrors = await J("window.__err");
    console.log("\npage errors:", JSON.stringify(out.pageErrors));
  } finally {
    out.finishedAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    console.log("wrote", OUT);
    try { chrome.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
  }
}
main().then(function () { process.exit(0); },
            function (e) { console.error("FAILED:", e && e.stack || e); process.exit(1); });
