// A CHECK THAT CAN FAIL: does a banded enemy model show its STATE pose while
// merely walking?
//
// THE DEFECT UNDER TEST. gl-world.js:1327 takes the enemy walk length from the
// TOTAL frame count --
//     var frames = em && em.frames.length ? em.frames.length : 1;
//     var walk   = Math.floor((e.progress || 0) / stride * frames);
// -- and drawActor at 1522 wraps on the same total. So a model that carries
// walk frames PLUS a state pose in one list has the state pose inside its walk
// cycle, and a body that has never entered that state presents it once per
// stride, forever.
//
// WHY THIS FILE EXISTS AT ALL. No banded model has been exported yet, so there
// is nothing to photograph and the defect can only be argued from code. An
// argument is not a measurement, and "the sequence is wrong while every frame
// is individually correct" is precisely the failure a per-frame review passes.
// So the ninth frame is SYNTHESISED at runtime on a shipped eight-frame model:
// same file on disk, untouched, one extra pose appended in memory. That gives a
// real banded model to walk, today, before suki exports one.
//
// THE TEST FAILS WITHOUT THE FIX BY CONSTRUCTION -- it asserts the state pose
// is never presented, and today it is. That is the point: it is armed and red
// now, so a green after the fix means something.
//
//   node visual-pass/probe/frame-band-defect.js
"use strict";
var fs = require("fs"), path = require("path"), os = require("os");
var cdp = require("./cdp"), serve = require("./serve");
var PORT = 8801, DEVTOOLS = 9341;
var GAME_URL = "http://127.0.0.1:" + PORT + "/game/index.html";
var TYPE = "normal";            // 8 frames, the plainest chassis
var SPOT = 1450;

async function main() {
  var server = await new Promise(function (r, j) {
    serve.start(PORT, function (e, s) { e ? j(e) : r(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-band"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, GAME_URL);
  var S = conn.session;
  var E = function (js) { return S.evaluate(js); };
  var J = async function (js) { return JSON.parse(await S.evaluate("JSON.stringify(" + js + ")")); };
  var out = {};
  try {
    for (var i = 0; i < 80; i++) {
      if (await E("typeof startRun === 'function' && typeof World3D !== 'undefined'")) break;
      await cdp.sleep(250);
    }
    await E(fs.readFileSync(path.join(__dirname, "page-probe.js"), "utf8"));
    out.setup = await J("TDProbe.setup()");
    await E("TDProbe.camDefault()");
    out.camera = await J("TDProbe.camState()");
    await E("TDProbe.setClock(0)");
    await E("TDProbe.warm(2)");

    out.before = await J("TDProbe.place(" + JSON.stringify(TYPE) + "," + SPOT + ")");
    out.framesBefore = await E("TDProbe.frameCount()");

    // ---- append a synthetic STATE frame -----------------------------------
    //
    // A pose is one matrix per group. The state frame here is frame 0 with
    // every group lifted hard in z, so the body visibly leaves the road: an
    // unmistakable, unambiguous "this is the state pose" that no walk frame can
    // be confused with. The model FILE is not touched -- this is the in-memory
    // expansion, and it is discarded with the browser.
    out.synth = await J(
      "(function(){ var r=World3D.renderer(); var m=GLModels.get(r,'enemy-" + TYPE + "');" +
      " var f0=m.frames[0];" +
      " var st=f0.map(function(mat){ var c=Array.prototype.slice.call(mat);" +
      "   c[14] = (c[14]||0) + 3.0; return c; });" +
      " var walk = m.frames.length;" +
      " m.frames.push(st);" +
      // DECLARE THE LAYOUT. Appending a frame without setting `bands` is the
      // ABSENT case under the contract -- "the exporter did not declare this
      // model's layout" -- whose documented fallback is the whole frame list.
      // A CONFORMING reader must therefore walk all nine frames and MUST
      // present the state pose, so this file would have stayed red against
      // every correct implementation while reading as a defect report.
      // Caught by the reader's author, who correctly refused to edit the test
      // he was being judged by. The line is mine and this is it.
      " m.bands = [[0, walk],[walk, 1]];" +
      " return { framesNow:m.frames.length, groups:m.groups.length," +
      "          bands:m.bands, walkFrames:walk," +
      "          matrixLen:f0[0].length };})()");
    out.framesAfter = await E("TDProbe.frameCount()");

    // ---- walk one FULL stride and look at every bucket ---------------------
    //
    // THE BUG IS INVISIBLE AT ANY SINGLE FRAME. Sampling the whole cycle and
    // printing the wrap is the only form that can see it.
    var n = out.framesAfter;
    var shots = [];
    for (var k = 0; k < n; k++) {
      var fr = await J("TDProbe.frameAt(" + k + ")");
      await E("TDProbe.setClock(0)");
      await E("TDProbe.warm(2)");
      await E("TDProbe.cap('_w'), TDProbe.cap('k" + k + "')");
      await E("TDProbe.depopulate()");
      await E("TDProbe.cap('_w'), TDProbe.cap('ke" + k + "')");
      await E("TDProbe.repopulate()");
      await E("TDProbe.warm(1)");
      var sil = await J("TDProbe.diff('k" + k + "','ke" + k + "',0)");
      shots.push({ k: k, walk: fr.walk, bucket: fr.bucket, progress: fr.progress,
                   silhouette: sil.changed, bboxGL: sil.bboxGL,
                   baseRowGL: sil.bboxGL ? sil.bboxGL[1] : null });
    }
    out.cycle = shots;

    // The state pose is the lifted one. Its signature is a raised silhouette
    // base -- measured, not asserted from the frame index, so the test reads the
    // PICTURE rather than the variable it set.
    var baseRows = shots.map(function (s) { return s.baseRowGL; });
    var walkRows = baseRows.slice(0, out.framesBefore);
    var walkMax = Math.max.apply(null, walkRows);
    out.baseRows = baseRows;
    out.walkBaseRowRange = [Math.min.apply(null, walkRows), walkMax];
    var presented = shots.filter(function (s) {
      return s.baseRowGL > walkMax + 2;
    }).map(function (s) { return { k: s.k, walk: s.walk, baseRowGL: s.baseRowGL }; });
    out.stateFramePresentedAtBuckets = presented;

    // Adjacent deltas across the whole cycle INCLUDING THE WRAP. A per-frame
    // review sees eight plausible walk frames and one plausible state frame; the
    // wrap is where the discontinuity actually lives.
    var deltas = [];
    for (var d = 0; d < n; d++) {
      var a = "k" + d, b = "k" + ((d + 1) % n);
      deltas.push({ from: d, to: (d + 1) % n, wrap: (d === n - 1),
                    changed: (await J("TDProbe.diff('" + a + "','" + b + "',0)")).changed });
    }
    out.adjacentDeltas = deltas;

    out.verdict = presented.length === 0
      ? "PASS -- a walking body never presented the state pose across a full stride"
      : "FAIL -- the state pose is presented at " + presented.length +
        " of " + n + " walk buckets on a body that never entered the state";
    out.testIsArmed = true;
  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}
main().catch(function (e) { console.error("BAND DEFECT PROBE FAILED: " + e.stack); process.exit(1); });
