// ---------------------------------------------------------------------------
// pop-schedule.js -- what peak concurrent population the wave schedule can
// actually produce, per wave, measured by running the real scheduler.
//
//   node visual-pass/probe/pop-schedule.js [--seconds 260] [--out F]
//
// WHY THIS IS SEPARATE FROM THE SWEEP. `js/game.js` was modified on disk at
// 18:08:18Z on 2026-08-13 -- a live retune of EASY_WAVES by another division,
// `count -> round(count x 2 x 1.25)` on twelve waves -- which is INSIDE the
// window the population sweep ran in. The sweep's synthetic boards do not read
// EASY_WAVES and are unaffected, but its schedule census is a claim about a
// file that changed while it was being made.
//
// DATING IS BY CONTENT, NOT BY COMMIT ORDER OR TIMESTAMP. A served working
// tree renders what is SAVED, so a commit hash cannot date a measurement, and
// an mtime only dates the file rather than the run that read it. This prints
// the number of RETUNED markers in the file on disk, the file's md5, and the
// per-wave body counts read out of the LIVE `WAVES` array in the page -- so
// which schedule produced any row below is recoverable from the row itself.
"use strict";

var childProcess = require("child_process");
var crypto = require("crypto");
var fs = require("fs"), os = require("os"), path = require("path");
var cdp = require("./cdp.js");
var serve = require("./serve.js");

var PORT = 9384, HTTP = 8841;
var SECONDS = (function () {
  var i = process.argv.indexOf("--seconds");
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 260;
})();
var OUT = (function () {
  var i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : path.join(__dirname, "out-pop-schedule.json");
})();

function launchChrome(port, dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(dir, { recursive: true });
  var c = childProcess.spawn(cdp.CHROME, ["--headless=new",
    "--remote-debugging-port=" + port, "--user-data-dir=" + dir, "--no-first-run",
    "--no-default-browser-check", "--no-sandbox", "--window-size=1280,720",
    "--force-device-scale-factor=1", "--hide-scrollbars", "--disable-gpu-vsync",
    "about:blank"], { stdio: "ignore" });
  c.on("exit", function () { setTimeout(function () {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }, 250); });
  return c;
}
function pad(x, w) { x = String(x); while (x.length < w) x = " " + x; return x; }

async function main() {
  var gameJs = path.resolve(__dirname, "..", "..", "game", "js", "game.js");
  var src = fs.readFileSync(gameJs);
  var head = "";
  try {
    head = childProcess.execSync("git show HEAD:game/js/game.js",
      { cwd: path.resolve(__dirname, "..", ".."), maxBuffer: 1 << 26 }).toString();
  } catch (e) { head = ""; }
  var provenance = {
    file: gameJs,
    mtimeUtc: fs.statSync(gameJs).mtime.toISOString(),
    md5Working: crypto.createHash("md5").update(src).digest("hex"),
    md5Head: head ? crypto.createHash("md5").update(head).digest("hex") : null,
    retunedMarkersWorking: (src.toString().match(/RETUNED/g) || []).length,
    retunedMarkersHead: head ? (head.match(/RETUNED/g) || []).length : null,
    dirty: head ? (crypto.createHash("md5").update(src).digest("hex") !==
                   crypto.createHash("md5").update(head).digest("hex")) : null
  };
  console.log("== PROVENANCE OF THE SCHEDULE BEING MEASURED ==");
  console.log("  js/game.js mtime      :", provenance.mtimeUtc);
  console.log("  md5 working / HEAD    :", provenance.md5Working.slice(0, 8), "/",
              provenance.md5Head && provenance.md5Head.slice(0, 8));
  console.log("  'RETUNED' markers     : working " + provenance.retunedMarkersWorking +
              ", HEAD " + provenance.retunedMarkersHead);
  console.log("  working tree is DIRTY :", provenance.dirty);

  var server = await new Promise(function (r, j) {
    serve.start(HTTP, function (e, s) { e ? j(e) : r(s); });
  });
  var chrome = launchChrome(PORT, path.join(os.tmpdir(), "td-popsched-profile"));
  var out = { startedAt: new Date().toISOString(), provenance: provenance,
              secondsPerScan: SECONDS, waves: [] };
  try {
    await cdp.waitForDevTools(PORT, 80);
    var o = await cdp.open(PORT, "http://127.0.0.1:" + HTTP + "/game/index.html");
    var s = o.session;
    await cdp.sleep(2500);
    var J = async function (e) { return JSON.parse(await s.evaluate("JSON.stringify(" + e + ")")); };
    await s.evaluate(fs.readFileSync(path.join(__dirname, "pop-page.js"), "utf8"));
    await J("TDPop.setup()");

    // THE SCHEDULE AS THE PAGE ACTUALLY HAS IT. Scheduled body count per wave,
    // read out of the live array. This is what dates the rows below: it is the
    // subject itself, not a timestamp about it.
    // Read the groups through the GAME'S OWN `waveGroups`, not off `w.groups`.
    // Not every wave row carries a literal `groups` array -- the first attempt
    // read the field directly and threw on the row that does not, which is the
    // cheap version of assuming a schema the code does not promise.
    var scheduled = await J(
      "WAVES.map(function(w,i){var n=0,t={};var gs=waveGroups(w)||[];" +
      "gs.forEach(function(g){n+=g.count;" +
      "t[g.type||'normal']=(t[g.type||'normal']||0)+g.count;});" +
      "return {wave:i+1,count:n,groups:gs.length,types:t};})");
    out.scheduledPerWave = scheduled;
    out.wavesTotal = scheduled.length;
    console.log("\n  waves in schedule     :", scheduled.length,
                " total scheduled bodies:", scheduled.reduce(function (a, w) { return a + w.count; }, 0));

    console.log("\n== PEAK CONCURRENT POPULATION, PER WAVE ==");
    console.log("  (real scheduler, no defence, base held at 1e9 so nothing ends the run.");
    console.log("   Each scan STARTS at that wave, so it excludes stragglers a real run");
    console.log("   would carry in from the wave before -- these are lower bounds.)");
    console.log(pad("wave", 5) + pad("sched", 6) + pad("peak", 6) + pad("at s", 7) + "  composition");
    var globalPeak = 0, globalRow = null;
    for (var w = 0; w < scheduled.length; w++) {
      var r = await J("TDPop.schedule({startWave:" + w + ", seconds:" + SECONDS + "})");
      var row = { wave: w + 1, scheduled: scheduled[w].count, peak: r.peak,
                  atSeconds: r.atSeconds, waveAtPeak: r.waveIndexAtPeak + 1,
                  composition: r.composition };
      out.waves.push(row);
      if (r.peak > globalPeak) { globalPeak = r.peak; globalRow = row; }
      console.log(pad(w + 1, 5) + pad(scheduled[w].count, 6) + pad(r.peak, 6) +
                  pad(Math.round(r.atSeconds), 7) + "  " + JSON.stringify(r.composition));
    }
    out.peakPerWave = globalPeak;
    out.peakRow = globalRow;

    // A continuous run, which is the only thing that can carry stragglers from
    // one wave into the next. Long enough to reach the end of the schedule --
    // 1500 s reached only wave 27 of 35 and reported a peak half the size of
    // the one a wave-30 start finds, which is a scan that did not reach its
    // subject rather than a null result about it.
    console.log("\n== CONTINUOUS WHOLE-GAME RUN ==");
    var cont = await J("TDPop.schedule({startWave:0, seconds:4000})");
    out.continuous = cont;
    console.log("  peak " + cont.peak + " bodies at t=" + Math.round(cont.atSeconds) +
                "s, during wave " + (cont.waveIndexAtPeak + 1) +
                ", reached wave " + (cont.endWaveIndex + 1) + " of " + scheduled.length);
    console.log("  composition: " + JSON.stringify(cont.composition));
    out.pageErrors = await J("window.__err || []");

    console.log("\n== ANSWER ==");
    console.log("  Highest peak concurrent population this schedule produces: " +
                Math.max(globalPeak, cont.peak) + " bodies.");
    console.log("  Diego's constraint is 400-500. Ratio: x" +
                (400 / Math.max(globalPeak, cont.peak)).toFixed(2) + " to x" +
                (500 / Math.max(globalPeak, cont.peak)).toFixed(2) + " beyond it.");
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
