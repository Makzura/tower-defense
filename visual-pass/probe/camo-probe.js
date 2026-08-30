// Does the 3D board give a camo enemy ANY visual cue?
//
// The 2D path in js/enemy.js carries both halves: globalAlpha 0.5 on the body,
// and a dashed ring at radiusPx()+4. `isCamo` appears nowhere under js/gl/.
//
// THE EXPERIMENT. One enemy object, `isCamo` flipped on the INSTANCE -- which
// is the field js/enemy.js actually reads -- so the two captures differ in the
// camo flag and in NOTHING else: same type colour, same lane, same progress,
// same frame, same camera. Comparing a camo_normal against a normal instead
// would differ by the type colour too, and a non-zero would say nothing.
//
// #gl and #game are read SEPARATELY and never composited.
//
// A zero here proves nothing on its own, so the same flip is run again with
// World3D.isEnabled forced false, where the 2D path must show both halves.
// That positive control uses shipped code, not a synthetic.
//
//   node visual-pass/probe/camo-probe.js
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cdp = require("./cdp");
var serve = require("./serve");

var PORT = 8794, DEVTOOLS = 9334;
var TYPE = process.argv[2] || "camo_normal";
var GAME_URL = "http://127.0.0.1:" + PORT + "/game/index.html";

async function main() {
  var server = await new Promise(function (res, rej) {
    serve.start(PORT, function (e, s) { e ? rej(e) : res(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-camo"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, GAME_URL);
  var S = conn.session;
  var out = {};
  try {
    for (var i = 0; i < 80; i++) {
      if (await S.evaluate("typeof startRun === 'function' && typeof World3D !== 'undefined'")) break;
      await cdp.sleep(250);
    }
    await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe.js"), "utf8"));
    out.setup = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.setup())"));
    await S.evaluate("TDProbe.camDefault()");
    await S.evaluate("TDProbe.warm(2)");

    await S.evaluate("window.__TYPE = " + JSON.stringify(TYPE));
    out.camoTypeExists = await S.evaluate("!!Enemy.TYPES[__TYPE]");
    out.colours = JSON.parse(await S.evaluate(
      "JSON.stringify({normal:Enemy.TYPES.normal.color, camo:Enemy.TYPES[__TYPE].color," +
      " camoFlag:!!Enemy.TYPES[__TYPE].isCamo," +
      " camoModelRegistered:GLModels.has('enemy-'+__TYPE)," +
      " isCamoInGl:0})"));

    // Put the body somewhere on screen. progress 60 is where the walkers sat
    // for the model probe, on a stretch with a constant tangent.
    out.place = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.place(__TYPE,60))"));
    await S.evaluate("TDProbe.warm(2)");

    // THE 2D CANVAS IS NOT STABLE BETWEEN CONSECUTIVE DRAWS. A first pass
    // measured 1,714 differing pixels across a full-screen bbox with NOTHING
    // changed, which put the 328 px camo result below its own noise floor. So
    // every #game number below is taken over a tight box around the body and
    // quoted beside a null control on that same box. The ring the 2D path draws
    // sits at radiusPx() + 4, so a box of +-3 radii covers it comfortably.
    out.roi = JSON.parse(await S.evaluate(
      "(function(){var e=TDProbe._e; var s=TDProbe.screenOf(e.pos.x,e.pos.y,0);" +
      " var r=e.radiusPx()*3;" +
      " return JSON.stringify({screen:s, roi:[Math.round(s.x-r),Math.round(s.y-r*1.8)," +
      "   Math.round(r*2),Math.round(r*3)]});})()"));
    var ROI = JSON.stringify(out.roi.roi);

    // ---- 3D BOARD ------------------------------------------------------
    out.gl = {};
    await S.evaluate("TDProbe._e.isCamo = true");
    await S.evaluate("TDProbe.cap('_w'), TDProbe.cap('on'), TDProbe.capUI('_w'), TDProbe.capUI('on')");
    // Null controls FIRST, on both canvases, so the zeros below have a proven
    // instrument behind them.
    await S.evaluate("TDProbe.cap('_w'), TDProbe.cap('on2'), TDProbe.capUI('_w'), TDProbe.capUI('on2')");
    out.gl.nullBodies = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('on','on2',0))"));
    out.gl.nullOverlayRoi = JSON.parse(await S.evaluate(
      "JSON.stringify(TDProbe.diffUI('on','on2',0," + ROI + "))"));
    out.gl.nullOverlayFull = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diffUI('on','on2',0))"));

    await S.evaluate("TDProbe._e.isCamo = false");
    await S.evaluate("TDProbe.cap('_w'), TDProbe.cap('off'), TDProbe.capUI('_w'), TDProbe.capUI('off')");
    out.gl.bodies = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('on','off',0))"));
    out.gl.overlayRoi = JSON.parse(await S.evaluate(
      "JSON.stringify(TDProbe.diffUI('on','off',0," + ROI + "))"));

    // POSITIVE COMPANION on #gl in the same run.
    //
    // THE FIRST VERSION OF THIS WAS VACUOUS AND RETURNED A CONFIDENT ZERO.
    // Swapping `_e.type` alone changes nothing on screen: enemySphere() caches
    // its mesh on `typePrims["e:" + enemy.typeId]`, and `typeId` is a separate
    // instance field set at construction. So the camo sphere was re-used and
    // the "positive" control measured 0 px -- indistinguishable from a probe
    // that had captured nothing at all. `typeId` is the seam the renderer
    // reads; both fields have to move.
    await S.evaluate("TDProbe._e.isCamo = true");
    await S.evaluate("TDProbe.cap('_w'), TDProbe.cap('base'), TDProbe.capUI('_w'), TDProbe.capUI('base')");
    out.gl.positiveSetup = JSON.parse(await S.evaluate(
      "(function(){ var e=TDProbe._e;" +
      " e.type = Enemy.TYPES.normal; e.typeId = 'normal';" +
      " return JSON.stringify({typeNow:e.type.id, typeIdNow:e.typeId, colour:e.type.color});})()"));
    await S.evaluate("TDProbe.cap('_w'), TDProbe.cap('recol'), TDProbe.capUI('_w'), TDProbe.capUI('recol')");
    out.gl.positiveBodies = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('base','recol',0))"));
    // A SECOND POSITIVE THAT WORKS FOR ANY TYPE. The colour swap above is
    // vacuous when the type under test IS `normal` -- it swaps normal for
    // normal and returns 0, which reads exactly like a dead instrument.
    // Stepping the walk frame moves pixels on any animated body.
    await S.evaluate("TDProbe.frameAt(0)");
    await S.evaluate("TDProbe.cap('_w'), TDProbe.cap('pf0')");
    await S.evaluate("TDProbe.frameAt(4)");
    await S.evaluate("TDProbe.cap('_w'), TDProbe.cap('pf4')");
    out.gl.positiveFrameStep = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('pf0','pf4',0))"));
    await S.evaluate("TDProbe.frameAt(0)");
    await S.evaluate(
      "(function(){var e=TDProbe._e; e.type=Enemy.TYPES[__TYPE]; e.typeId=__TYPE; return 1;})()");

    // ---- 2D FALLBACK ----------------------------------------------------
    out.flat = {};
    out.flat.switched = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.use2D(true))"));
    await S.evaluate("TDProbe._e.isCamo = true");
    await S.evaluate("TDProbe.capUI('_w'), TDProbe.capUI('fon')");
    await S.evaluate("TDProbe.capUI('_w'), TDProbe.capUI('fon2')");
    out.flat.nullFull = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diffUI('fon','fon2',0))"));

    // WHERE THE BODY ACTUALLY IS ON THE FLAT PATH, measured rather than
    // assumed. The 3D projector and the 2D fallback do NOT put the same body at
    // the same screen coordinates, so the ROI computed from `api.project`
    // above is meaningless here -- it returned 0 changed pixels while the whole
    // canvas showed 2,042, which reads as "no camo cue" and is simply the wrong
    // box. Diffing the body present against the body absent gives its flat
    // screen box directly, ring included.
    await S.evaluate("TDProbe.depopulate()");
    await S.evaluate("TDProbe.capUI('_w'), TDProbe.capUI('fempty')");
    await S.evaluate("TDProbe.repopulate()");
    await S.evaluate("TDProbe.capUI('_w'), TDProbe.capUI('fon3')");
    out.flat.bodyBox = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diffUI('fon3','fempty',0))"));
    var FROI = JSON.stringify(out.flat.bodyBox.bbox
      ? [out.flat.bodyBox.bbox[0] - 6, out.flat.bodyBox.bbox[1] - 6,
         out.flat.bodyBox.bbox[2] + 12, out.flat.bodyBox.bbox[3] + 12]
      : [0, 0, 1280, 720]);
    out.flat.roiUsed = JSON.parse(FROI);
    out.flat.nullRoi = JSON.parse(await S.evaluate(
      "JSON.stringify(TDProbe.diffUI('fon','fon2',0," + FROI + "))"));

    await S.evaluate("TDProbe._e.isCamo = false");
    await S.evaluate("TDProbe.capUI('_w'), TDProbe.capUI('foff')");
    out.flat.overlayRoi = JSON.parse(await S.evaluate(
      "JSON.stringify(TDProbe.diffUI('fon3','foff',0," + FROI + "))"));
    out.flat.overlayFull = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diffUI('fon3','foff',0))"));
    await S.evaluate("TDProbe.use2D(false)");
  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

main().catch(function (e) { console.error("CAMO PROBE FAILED: " + e.stack); process.exit(1); });
