// DID THE OUTLINE MEASURE SEE THE TUN REBUILD?
//
// THE CHALLENGE. I reported the board floor as normal|slow at 0.128 outline
// broadside and called it "the rebuild moved paint, not shape". The Tun rebuild
// demonstrably WAS a shape change: raw top 1.190 -> 0.979 taken out of `lift`
// with dRest holding at 0.00, and rendered height 19.62 -> 16.14 rows. Two
// possibilities and they need opposite responses:
//
//   1. THE INSTRUMENT UNDER-READS HEIGHT. A body that loses 3.5 rows moves the
//      EXTENT of its silhouette while much of the boundary pixel set stays put,
//      so a symmetric-difference measure could barely notice a change the eye
//      cannot miss. If so, that is a serious defect in the metric the whole
//      board now ranks on -- landing the same week the count column was demoted
//      for the opposite bias.
//   2. 0.128 AND 0.97 ARE DIFFERENT SCALES and were never comparable, in which
//      case my sentence was a cross-metric comparison and is simply withdrawn.
//
// NOT RESOLVED BY PICKING. The old model is re-registered at RUNTIME from
// `git show ddef990:...`, so before and after are measured by one rig, one
// camera, one spot, one frame, one launch -- differing in the model bytes and
// nothing else.
//
// THE CONTROL THAT MAKES IT MEAN ANYTHING: the Gleaner is captured in BOTH
// phases and must come back bit-identical. Re-registering enemy-slow must not
// disturb enemy-normal; if it does, every number here is measuring the swap
// rather than the model.
//
// AND THE SEAM IS ASSERTED: raw top must actually read 1.190 after the swap and
// 0.979 before it. A comparison that never changed the variable under test has
// produced a confident zero on this project before.
//
//   node visual-pass/probe/tun-rebuild-probe.js
"use strict";
var fs = require("fs"), path = require("path"), os = require("os");
var cdp = require("./cdp"), serve = require("./serve");

var PORT = 8805, DEVTOOLS = 9345;
var GAME_URL = "http://127.0.0.1:" + PORT + "/TD_0.5.0/index.html";
var TUN = "slow", GLEANER = "normal";
var SPOT = 1870, FRAME = 0;
var BEARINGS = [
  { tag: "front", yaw: -Math.PI / 2 },
  { tag: "three-quarter", yaw: -Math.PI / 2 + 0.7 },
  { tag: "broadside", yaw: 0 }
];

async function main() {
  var beforeSrc = fs.readFileSync(path.join(__dirname, "tun", "before.js"), "utf8");
  var afterSrc = fs.readFileSync(path.join(__dirname, "tun", "after.js"), "utf8");

  var server = await new Promise(function (r, j) {
    serve.start(PORT, function (e, s) { e ? j(e) : r(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-tun"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, GAME_URL);
  var S = conn.session;
  var E = function (js) { return S.evaluate(js); };
  var J = async function (js) { return JSON.parse(await S.evaluate("JSON.stringify(" + js + ")")); };
  var out = { phases: {}, controls: {}, bearings: {} };

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
    await E("TDProbe.setClock(0)");
    await E("TDProbe.warm(2)");

    async function rawTop(id) {
      return await E("(function(){var m=GLModels.get(World3D.renderer(),'enemy-" + id + "');" +
        " return m ? +m.top.toFixed(4) : null;})()");
    }

    async function shoot(id, key) {
      await E("TDProbe.place(" + JSON.stringify(id) + "," + SPOT + ")");
      await E("TDProbe.frameAt(" + FRAME + ")");
      await E("TDProbe.setClock(0)");
      await E("TDProbe.warm(2)");
      await E("TDProbe.cap('_w'), TDProbe.cap('" + key + "')");
      await E("TDFractal.glMask('" + key + "','empty','" + key + "')");
      return await J("TDProbe.diff('" + key + "','empty',0)");
    }

    // ---- PHASE A: the model as it ships (post-rebuild) ---------------------
    out.phases.A = { label: "AFTER rebuild (509eba1, as shipped)",
                     rawTopSlow: await rawTop(TUN) };

    for (var b = 0; b < BEARINGS.length; b++) {
      var BE = BEARINGS[b];
      await E("TDProbe.camDefault()");
      await E("TDProbe.cam({yaw:" + BE.yaw + "})");
      await E("TDProbe.setClock(0)");
      await E("TDProbe.warm(2)");
      await E("TDProbe.depopulate()");
      await E("TDProbe.cap('_w'), TDProbe.cap('empty')");
      await E("TDProbe.repopulate()");
      await E("TDProbe.warm(1)");
      out.bearings[BE.tag] = { yaw: BE.yaw, camera: await J("TDProbe.camState()") };
      out.bearings[BE.tag].A = {
        gleaner: await shoot(GLEANER, "gA_" + b),
        tun: await shoot(TUN, "tA_" + b)
      };
      // Keep the empty frame for this bearing so phase B builds masks against
      // the SAME background rather than a re-derived one.
      await E("TDProbe.frames['empty_" + b + "'] = TDProbe.frames['empty']");
    }

    // ---- THE SWAP, asserted at the seam ------------------------------------
    out.controls.reregister = await J("TDProbe.reregister(" + JSON.stringify(beforeSrc) + ")");
    // The mesh is rebuilt lazily, so force a draw before reading top.
    await E("TDProbe.place(" + JSON.stringify(TUN) + "," + SPOT + ")");
    await E("TDProbe.warm(2)");
    out.phases.B = { label: "BEFORE rebuild (ddef990)", rawTopSlow: await rawTop(TUN) };
    out.controls.seamMoved = out.phases.A.rawTopSlow !== out.phases.B.rawTopSlow;
    if (!out.controls.seamMoved) {
      throw new Error("SEAM DID NOT MOVE: raw top is " + out.phases.B.rawTopSlow +
        " both before and after re-registering the old model. The swap did not " +
        "take and every number below would be the same model twice.");
    }

    // ---- PHASE B: the pre-rebuild model, same rig ---------------------------
    for (var b2 = 0; b2 < BEARINGS.length; b2++) {
      var BE2 = BEARINGS[b2];
      await E("TDProbe.camDefault()");
      await E("TDProbe.cam({yaw:" + BE2.yaw + "})");
      await E("TDProbe.setClock(0)");
      await E("TDProbe.warm(2)");
      await E("TDProbe.frames['empty'] = TDProbe.frames['empty_" + b2 + "']");
      out.bearings[BE2.tag].B = {
        gleaner: await shoot(GLEANER, "gB_" + b2),
        tun: await shoot(TUN, "tB_" + b2)
      };

      // THE CONTROL: the Gleaner must be bit-identical across the swap.
      out.bearings[BE2.tag].gleanerNull =
        (await J("TDProbe.diff('gA_" + b2 + "','gB_" + b2 + "',0)")).changed;

      async function pair(tunKey, gleanKey, tunPx, gleanPx) {
        var d = await J("TDProbe.diff('" + tunKey + "','" + gleanKey + "',0)");
        var st = await J("TDFractal.setStats('" + tunKey + "','" + gleanKey + "','" +
          tunKey + "','" + gleanKey + "')");
        var mean = (tunPx + gleanPx) / 2;
        return { count: +(d.changed / mean).toFixed(3),
                 outline: +(st.symmetricDifference / mean).toFixed(3),
                 changedPx: d.changed, outlinePx: st.symmetricDifference,
                 interiorPx: st.changedInsideIntersection };
      }
      var A = out.bearings[BE2.tag].A, B = out.bearings[BE2.tag].B;
      out.bearings[BE2.tag].pairAfter =
        await pair("tA_" + b2, "gA_" + b2, A.tun.changed, A.gleaner.changed);
      out.bearings[BE2.tag].pairBefore =
        await pair("tB_" + b2, "gB_" + b2, B.tun.changed, B.gleaner.changed);

      // THE TUN AGAINST ITSELF ACROSS THE REBUILD. This is the direct test of
      // whether the instrument can see the change at all: if a body that lost
      // 3.5 rows of height reads near zero here, the measure is blind to height.
      var dSelf = await J("TDProbe.diff('tA_" + b2 + "','tB_" + b2 + "',0)");
      var stSelf = await J("TDFractal.setStats('tA_" + b2 + "','tB_" + b2 + "','tA_" +
        b2 + "','tB_" + b2 + "')");
      var meanSelf = (A.tun.changed + B.tun.changed) / 2;
      out.bearings[BE2.tag].tunVsItself = {
        count: +(dSelf.changed / meanSelf).toFixed(3),
        outline: +(stSelf.symmetricDifference / meanSelf).toFixed(3),
        changedPx: dSelf.changed, outlinePx: stSelf.symmetricDifference
      };

      // The height claim, in this rig's own units.
      out.bearings[BE2.tag].renderedHeight = {
        after: A.tun.bboxGL ? A.tun.bboxGL[3] : null,
        before: B.tun.bboxGL ? B.tun.bboxGL[3] : null,
        gleaner: A.gleaner.bboxGL ? A.gleaner.bboxGL[3] : null,
        deltaRows: (B.tun.bboxGL && A.tun.bboxGL) ? B.tun.bboxGL[3] - A.tun.bboxGL[3] : null
      };
    }

    // Restore, and prove the restore took.
    await E("TDProbe.reregister(" + JSON.stringify(afterSrc) + ")");
    await E("TDProbe.place(" + JSON.stringify(TUN) + "," + SPOT + ")");
    await E("TDProbe.warm(2)");
    out.controls.rawTopRestored = await rawTop(TUN);

  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}
main().catch(function (e) {
  console.error("TUN REBUILD PROBE FAILED: " + e.stack);
  process.exit(1);
});
