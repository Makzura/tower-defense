// ---------------------------------------------------------------------------
// pop-live.js -- the population sweep on a board that is being SHOT AT, and
// the launch-to-launch reproducibility of the whole instrument.
//
//   node visual-pass/probe/pop-live.js [--launches 3] [--out F]
//
// TWO GAPS IN THE MAIN SWEEP, BOTH OF WHICH COULD MOVE THE ANSWER.
//
// 1. IT HAD NO TOWERS. `drawShots` and `drawEffects` are inside drawOverlays
//    and are per-projectile, and a board with nothing shooting runs neither.
//    A 400-body board a player actually reaches has a full bar of upgraded
//    towers firing into it continuously. Enemies here are made effectively
//    unkillable (1e9 HP, held at 60%): the point is a board that does not
//    clear, because a board that clears is measuring itself getting smaller,
//    and because a bar only draws on a hurt body.
//
// 2. IT WAS ONE BROWSER LAUNCH. Two full sweeps of identical code disagreed by
//    1.3-1.6x on absolute frame time -- this machine runs other agents' Chrome
//    processes and its clocks move. An absolute millisecond figure from a
//    single launch is not a measurement of the game, it is a measurement of an
//    afternoon. Every configuration here is run in N separate launches and the
//    spread is reported beside the median, so a reader can see how much of any
//    difference is the subject.
"use strict";

var childProcess = require("child_process");
var fs = require("fs"), os = require("os"), path = require("path");
var cdp = require("./cdp.js");
var serve = require("./serve.js");

var LAUNCHES = (function () {
  var i = process.argv.indexOf("--launches");
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 3;
})();
var OUT = (function () {
  var i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : path.join(__dirname, "out-pop-live.json");
})();
var FRAMES = 150;

function launchChrome(port, profileDir) {
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(profileDir, { recursive: true });
  var args = ["--headless=new", "--remote-debugging-port=" + port,
    "--user-data-dir=" + profileDir, "--no-first-run", "--no-default-browser-check",
    "--no-sandbox", "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--window-size=1280,720", "--force-device-scale-factor=1", "--hide-scrollbars",
    "--disable-gpu-vsync", "--disable-frame-rate-limit", "about:blank"];
  var c = childProcess.spawn(cdp.CHROME, args, { stdio: "ignore" });
  c.on("exit", function () { setTimeout(function () {
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {} }, 250); });
  return c;
}

function stats(xs) {
  var s = xs.slice().sort(function (a, b) { return a - b; });
  function q(f) { return s[Math.min(s.length - 1, Math.round(f * (s.length - 1)))]; }
  return { med: q(0.5), p95: q(0.95), max: s[s.length - 1], min: s[0] };
}
function r3(x) { return x === null || x === undefined ? null : Math.round(x * 1000) / 1000; }
function pad(x, w) { x = String(x); while (x.length < w) x = " " + x; return x; }

var CASES = [];
[100, 200, 300, 400, 500].forEach(function (n) {
  CASES.push({ tag: "quiet " + n, n: n, towers: 0 });
  CASES.push({ tag: "FIRING " + n, n: n, towers: 12 });
});

async function oneLaunch(idx) {
  var PORT = 9360 + idx, HTTP = 8820 + idx;
  var server = await new Promise(function (res, rej) {
    serve.start(HTTP, function (e, s) { e ? rej(e) : res(s); });
  });
  var chrome = launchChrome(PORT, path.join(os.tmpdir(), "td-poplive-profile" + idx));
  try {
    await cdp.waitForDevTools(PORT, 80);
    var o = await cdp.open(PORT, "http://127.0.0.1:" + HTTP + "/TD_0.5.0/index.html");
    var s = o.session;
    await cdp.sleep(2500);
    var J = async function (e) { return JSON.parse(await s.evaluate("JSON.stringify(" + e + ")")); };
    await s.evaluate("window.__err=[];window.addEventListener('error',function(e){window.__err.push(String(e.message))});1");
    await s.evaluate(fs.readFileSync(path.join(__dirname, "pop-page.js"), "utf8"));
    var env = await J("TDPop.setup()");
    if (Math.abs(env.camera.distance - 900) < 1) throw new Error("camera not fitted");
    await s.evaluate("TDPop.instrument()");
    var roster = await J("TDPop.roster()");
    var MESHED = roster.filter(function (t) {
      return t.meshed && ["midboss", "boss", "boss_fast"].indexOf(t.id) < 0;
    }).map(function (t) { return t.id; });
    await s.evaluate("TDPop.warmup({n:600, mix:" + JSON.stringify(MESHED) + "})");
    await J("TDPop.baseline()");

    var res = [];
    for (var ci = 0; ci < CASES.length; ci++) {
      var c = CASES[ci];
      var built = await J("TDPop.build(" +
        JSON.stringify({ n: c.n, mix: MESHED, damaged: true }) + ")");
      var tw = c.towers
        ? await J("TDPop.towers({n:" + c.towers + "})")
        : await J("(function(){ towers.length=0; if(typeof bullets!=='undefined') bullets.length=0; return {placed:0}; })()");
      await J("TDPop.immortal()");
      // Let the towers acquire, fire and fill the board with projectiles and
      // effects before anything is timed. A board measured on frame one of a
      // firing run has no shots in the air and is the quiet board again.
      await J("TDPop.run({frames:120, warm:0, speed:1})");
      await J("TDPop.immortal()");
      var live = await J("TDPop.state()");
      // PROOF THE BOARD IS FIRING = HP ACTUALLY REMOVED FROM THE ENEMIES.
      // `tower.damageDealt` is declared on Tower and never incremented by the
      // shipped towers, so a run summing it reports 0 on a board doing 7,702
      // damage. A proof metric that is always zero is not a null result, it is
      // a broken instrument -- and this one read as "the towers never fired".
      var hpSum = "enemies.reduce(function(a,e){return a+e.health;},0)";
      var dmg0 = await s.evaluate(hpSum);
      var full = await J("TDPop.run({frames:" + FRAMES + ", speed:1})");
      var dmg1 = await s.evaluate(hpSum);
      var noOv = await J("TDPop.run({frames:" + FRAMES + ", speed:1, stub:'overlay'})");
      var full3 = await J("TDPop.run({frames:" + FRAMES + ", speed:3})");
      var cover = await J("TDPop.covered(0)");
      var cpu = stats(full.rows.map(function (r) { return r.total; }));
      var ov = stats(full.rows.map(function (r) { return r.ov; }));
      var gl = stats(full.rows.map(function (r) { return r.gl; }));
      var bul = stats(full.rows.map(function (r) { return r.bul; }));
      res.push({
        tag: c.tag, n: c.n, towersWanted: c.towers, towersPlaced: tw.placed,
        upgradesBought: tw.upgradesBought || 0, towerKinds: tw.kinds || null,
        // PROOF THE BOARD IS FIRING, not an assumption that it is. A single
        // instantaneous bullet count read 0 on a board doing 3,612 damage.
        bulletsMed: bul.med, bulletsMax: bul.max,
        hpRemovedDuringRun: Math.round(dmg0 - dmg1),
        enemiesLive: live.enemies,
        drawCalls: full.rows[0].dc, triangles: full.rows[0].tri,
        coverPx: cover.changed,
        sustained1x: r3(full.batchMs / full.frames),
        sustained3x: r3(full3.batchMs / full3.frames),
        overlayMarginal: r3(full.batchMs / full.frames - noOv.batchMs / noOv.frames),
        cpu: { med: r3(cpu.med), p95: r3(cpu.p95), max: r3(cpu.max) },
        cpuOverlay: { med: r3(ov.med), p95: r3(ov.p95), max: r3(ov.max) },
        cpuGL: { med: r3(gl.med), p95: r3(gl.p95), max: r3(gl.max) },
        nStart: full.nStart, nEnd: full.nEnd
      });
      console.log("  [" + idx + "] " + pad(c.tag, 12) +
        " tw " + pad(tw.placed, 2) + "/" + pad(tw.upgradesBought || 0, 2) +
        " bul " + pad(bul.med, 3) + "/" + pad(bul.max, 3) +
        " hpLost " + pad(Math.round(dmg0 - dmg1), 9) +
        " calls " + pad(full.rows[0].dc, 5) +
        " sus1x " + pad(r3(full.batchMs / full.frames), 7) +
        " sus3x " + pad(r3(full3.batchMs / full3.frames), 7) +
        " cpu50 " + pad(r3(cpu.med), 6) +
        " ovl " + pad(r3(ov.med), 5) + " gl " + pad(r3(gl.med), 5));
    }
    var errs = await J("window.__err");
    return { env: env, results: res, pageErrors: errs };
  } finally {
    try { chrome.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
  }
}

async function main() {
  var out = { startedAt: new Date().toISOString(), launches: LAUNCHES, runs: [] };
  try {
    for (var i = 0; i < LAUNCHES; i++) {
      console.log("== LAUNCH " + i + " ==");
      out.runs.push(await oneLaunch(i));
      // Let the machine settle between launches so one run's teardown is not
      // inside the next run's measurement.
      await cdp.sleep(3000);
    }
    out.env = out.runs[0].env;
    console.log("\n== ACROSS " + LAUNCHES + " LAUNCHES (median, and min-max spread) ==");
    console.log(pad("case", 12) + pad("calls", 7) + pad("sus1x med", 10) + pad("range", 16) +
                pad("spread", 8) + pad("sus3x med", 10) + pad("cpuOvl", 8) + pad("cpuGL", 8));
    out.summary = [];
    CASES.forEach(function (c, k) {
      var xs = out.runs.map(function (r) { return r.results[k].sustained1x; });
      var x3 = out.runs.map(function (r) { return r.results[k].sustained3x; });
      var ov = out.runs.map(function (r) { return r.results[k].cpuOverlay.med; });
      var glv = out.runs.map(function (r) { return r.results[k].cpuGL.med; });
      var st = stats(xs), st3 = stats(x3);
      var row = { tag: c.tag, n: c.n, towers: c.towers,
                  drawCalls: out.runs[0].results[k].drawCalls,
                  bullets: out.runs[0].results[k].bullets,
                  sustained1x: { med: st.med, min: st.min, max: st.max,
                                 spread: r3(st.max / st.min) },
                  sustained3x: { med: st3.med, min: st3.min, max: st3.max },
                  cpuOverlayMed: stats(ov).med, cpuGLMed: stats(glv).med,
                  all1x: xs, all3x: x3 };
      out.summary.push(row);
      console.log(pad(c.tag, 12) + pad(row.drawCalls, 7) + pad(st.med, 10) +
        pad(st.min + " - " + st.max, 16) + pad("x" + r3(st.max / st.min), 8) +
        pad(st3.med, 10) + pad(stats(ov).med, 8) + pad(stats(glv).med, 8));
    });
    var spreads = out.summary.map(function (r) { return r.sustained1x.spread; });
    out.worstSpread = Math.max.apply(null, spreads);
    console.log("\n  WORST launch-to-launch spread on any row: x" + out.worstSpread);
    console.log("  (this is the instrument's own disagreement with itself and" +
                " bounds every absolute figure)");
  } finally {
    out.finishedAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    console.log("wrote", OUT);
  }
}
main().then(function () { process.exit(0); },
            function (e) { console.error("FAILED:", e && e.stack || e); process.exit(1); });
