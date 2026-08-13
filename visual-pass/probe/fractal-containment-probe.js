// TRYING TO BREAK THE CONTAINMENT FORMULA, not to confirm it.
//
// THE PREDICTION (kaz, labelled as one): adjacent Stacker tiers are one object
// at two scales, both anchored at the ground contact, so the smaller silhouette
// is CONTAINED in the larger and
//
//     separation = 2(k^2 - 1)/(k^2 + 1),  k = scaleB / scaleA
//
// THE ASSUMPTION IS THE TARGET, NOT THE ALGEBRA. Re-deriving algebra and
// getting self-consistent numbers is not a test of anything -- this project has
// already shipped one endorsement chain three deep on exactly that mistake, and
// I was the third link in it. So nothing below evaluates the formula against
// itself. It measures two things the formula asserts and cannot see:
//
//   1. CONTAINMENT, as a set operation. Build each tier's silhouette mask from
//      its own body-vs-empty capture and count |smaller \ larger| directly. If
//      that is not 0 the nesting is false and the algebra has no object.
//
//   2. WHAT THE METRIC ACTUALLY COUNTS. A changed-pixel diff counts pixels
//      whose colour moved. The formula counts symmetric difference of
//      silhouettes. Those are the same number only if the region both bodies
//      cover is repainted identically -- and a rescaled sphere is shaded
//      differently at every pixel of it. Split the metric into the part inside
//      the intersection and the part on the rim, and the two stop being
//      comparable quantities.
//
// ANCHORING, checked first, because if the sphere pivots differently from a
// mesh then this measures spheres and not the case. gl-geometry.js:74 builds
// the sphere with `zc = lift + r` -- "resting on the ground" -- so its bottom
// is at model z = 0 and `renderer.draw(..., radius * (...))` scales it about
// the ground contact. drawActor scales a mesh by `radius/11` about a model
// origin that is also at the feet. Same anchoring, and the run below asserts it
// in pixels by checking the silhouette base stays put across tiers.
//
//   node visual-pass/probe/fractal-containment-probe.js
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cdp = require("./cdp");
var serve = require("./serve");

var PORT = 8797, DEVTOOLS = 9337;
var TYPE = "fractal_slime";
var PROGRESS = 200;
var PHASE = 0.25;
var GAME_URL = "http://127.0.0.1:" + PORT + "/TD_0.5.0/index.html";

function predict(k) { return 2 * (k * k - 1) / (k * k + 1); }

async function main() {
  var server = await new Promise(function (res, rej) {
    serve.start(PORT, function (e, s) { e ? rej(e) : res(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-fcont"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, GAME_URL);
  var S = conn.session;
  var E = function (js) { return S.evaluate(js); };
  var J = async function (js) { return JSON.parse(await S.evaluate("JSON.stringify(" + js + ")")); };
  var out = { tiers: {}, pairs: {}, controls: {} };

  try {
    for (var i = 0; i < 80; i++) {
      if (await E("typeof startRun === 'function' && typeof World3D !== 'undefined'")) break;
      await cdp.sleep(250);
    }
    await E(fs.readFileSync(path.join(__dirname, "page-probe.js"), "utf8"));
    await E(fs.readFileSync(path.join(__dirname, "page-probe-fractal.js"), "utf8"));
    out.setup = await J("TDProbe.setup()");
    await E("TDProbe.camDefault()");
    out.camera = await J("TDProbe.camState()");
    await E("TDProbe.warm(2)");

    // Every tier at ONE spot, phase held at the same fraction of its own
    // stride, mask taken against an empty board.
    for (var t = 0; t <= 5; t++) {
      var pl = await J("TDFractal.placeTier('" + TYPE + "'," + PROGRESS + "," + t + ")");
      var ph = await J("TDFractal.phaseAt(" + PHASE + ")");
      await E("TDProbe.warm(2)");
      await E("TDProbe.cap('_w'), TDProbe.cap('f" + t + "')");
      await E("TDProbe.depopulate()");
      await E("TDProbe.cap('_w'), TDProbe.cap('e" + t + "')");
      await E("TDProbe.repopulate()");
      await E("TDProbe.warm(1)");
      var mk = await J("TDFractal.glMask('f" + t + "','e" + t + "','m" + t + "')");
      var sil = await J("TDProbe.diff('f" + t + "','e" + t + "',0)");
      out.tiers["T" + t] = { sizeScale: pl.sizeScale, radius: pl.radius,
                             phase: ph.phaseFrac, yaw: ph.yaw,
                             maskPx: mk.px, silhouette: sil.changed,
                             bboxGL: sil.bboxGL };
    }

    // ANCHORING, ASSERTED IN PIXELS. If every tier's silhouette shares a base
    // row in GL space, the scaling really is about the ground contact and the
    // formula at least has the geometry it assumes. GL rows are bottom-up, so
    // the base is bboxGL[1].
    out.controls.baseRows = {};
    for (var b = 0; b <= 5; b++) {
      out.controls.baseRows["T" + b] = out.tiers["T" + b].bboxGL[1];
    }

    // The empty boards must all be the same board -- if they are not, every
    // mask above was taken against a different background.
    out.controls.emptyBoardsIdentical = {};
    for (var q = 1; q <= 5; q++) {
      out.controls.emptyBoardsIdentical["e0_vs_e" + q] =
        (await J("TDProbe.diff('e0','e" + q + "',0)")).changed;
    }

    var PAIRS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]];
    for (var p = 0; p < PAIRS.length; p++) {
      var A = PAIRS[p][0], B = PAIRS[p][1];
      var st = await J("TDFractal.setStats('m" + A + "','m" + B + "','f" + A + "','f" + B + "')");
      var k = out.tiers["T" + B].sizeScale / out.tiers["T" + A].sizeScale;
      var meanOwn = (st.a + st.b) / 2;
      out.pairs["T" + A + "-T" + B] = {
        k: +k.toFixed(4),
        predictedSeparation: +predict(k).toFixed(4),
        // The metric as this rig has always computed it.
        measuredSeparation_changedPixels: +(st.changedTotal / meanOwn).toFixed(4),
        // The quantity the formula ACTUALLY describes: symmetric difference of
        // the two silhouettes over their mean area. Quoted separately because
        // comparing a prediction about sets against a measurement of colour is
        // the error the formula invites.
        measuredSeparation_symmetricDifference:
          +(st.symmetricDifference / meanOwn).toFixed(4),
        stats: st
      };
    }

    // NULL. Same tier, rebuilt, same everything: masks and metric must be 0.
    await E("TDFractal.placeTier('" + TYPE + "'," + PROGRESS + ",4)");
    await E("TDFractal.phaseAt(" + PHASE + ")");
    await E("TDProbe.warm(2)");
    await E("TDProbe.cap('_w'), TDProbe.cap('n1')");
    await E("TDFractal.placeTier('" + TYPE + "'," + PROGRESS + ",4)");
    await E("TDFractal.phaseAt(" + PHASE + ")");
    await E("TDProbe.warm(2)");
    await E("TDProbe.cap('_w'), TDProbe.cap('n2')");
    out.controls.rebuildNull = (await J("TDProbe.diff('n1','n2',0)")).changed;

  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

main().catch(function (e) {
  console.error("FRACTAL CONTAINMENT PROBE FAILED: " + e.stack);
  process.exit(1);
});
