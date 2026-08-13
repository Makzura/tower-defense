// DOES THE STACKER'S TIER NUMBER EXIST ON THE BOARD WE SHIP?
//
// js/enemy.js:2252 draws `ctx.fillText("T" + this.fractalTier)` in
// rgba(13,64,47,0.82). The Fractal Slime's card calls that number the tier
// separator and forbids a second cue. This measures whether it is there.
//
// THE COMPARISON. One scene, one enemy object, one browser launch. The ONLY
// thing that moves between the two captures of a pair is whether that single
// fillText call is allowed to run. Everything else -- object, lane, tier,
// progress, frame, camera, canvas -- is literally identical.
//
// THE POSITIVE CONTROL IS THE POINT. The same suppression is run on the 2D
// fallback, where the number is known to be drawn, and on the shipping 3D
// board. If the 2D side does not fire, the 3D zero means nothing at all and
// the run reports nothing. That ordering is deliberate: an absence measured
// without its matching presence is the most believable wrong answer this
// project produces.
//
//   node visual-pass/probe/fractal-stencil-probe.js
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cdp = require("./cdp");
var serve = require("./serve");

var PORT = 8795, DEVTOOLS = 9335;
var TYPE = "fractal_slime";
var PROGRESS = 60;                 // the stretch the model probe used; tangent checked straight
var TIERS = [0, 3, 5];
var GAME_URL = "http://127.0.0.1:" + PORT + "/TD_0.5.0/index.html";

var INK = [13, 64, 47];            // the authored stencil colour
var WRONG_INK = [190, 255, 205];   // the camo ring's colour -- must NOT fit

function jp(s) { return JSON.parse(s); }

async function main() {
  var server = await new Promise(function (res, rej) {
    serve.start(PORT, function (e, s) { e ? rej(e) : res(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-fractal"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, GAME_URL);
  var S = conn.session;
  var E = function (js) { return S.evaluate(js); };
  var J = async function (js) { return jp(await S.evaluate("JSON.stringify(" + js + ")")); };
  var out = { tiers: {}, notes: [] };

  try {
    for (var i = 0; i < 80; i++) {
      if (await E("typeof startRun === 'function' && typeof World3D !== 'undefined'")) break;
      await cdp.sleep(250);
    }
    await E(fs.readFileSync(path.join(__dirname, "page-probe.js"), "utf8"));
    await E(fs.readFileSync(path.join(__dirname, "page-probe-fractal.js"), "utf8"));

    out.setup = await J("TDProbe.setup()");
    await E("TDProbe.camDefault()");           // THROWS on 900/[0,0,0]
    out.camera = await J("TDProbe.camState()");
    await E("TDProbe.warm(2)");

    out.typeExists = await E("!!Enemy.TYPES." + TYPE);
    out.meshRegistered = await E("GLModels.has('enemy-" + TYPE + "')");

    for (var ti = 0; ti < TIERS.length; ti++) {
      var tier = TIERS[ti];
      var T = { tier: tier };

      // ================= 2D FALLBACK -- THE POSITIVE CONTROL =================
      await E("TDProbe.use2D(true)");
      T.flatMode = await J("TDProbe.use2D(true)");
      T.place = await J("TDFractal.placeTier('" + TYPE + "'," + PROGRESS + "," + tier + ")");
      T.stencilPoint = await J("TDFractal.stencilPointFlat()");
      await E("TDProbe.warm(2)");

      // Did the shipped fillText run at all, in one real draw?
      T.flatCalls = await J("TDFractal.callsInOneDraw()");

      // WHERE THE BODY IS, MEASURED. The 3D projector's coordinates are wrong
      // for the flat path -- carrying them across returned 0 changed px once
      // while the canvas showed 2,042. Diff body-present against body-absent.
      await E("TDProbe.depopulate()");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('fempty')");
      await E("TDProbe.repopulate()");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('fbody')");
      T.flatBodyBox = await J("TDProbe.diffUI('fbody','fempty',0)");
      var box = T.flatBodyBox.bbox || [0, 0, 1280, 720];
      var ROI = JSON.stringify([box[0] - 8, box[1] - 8, box[2] + 16, box[3] + 16]);
      T.roi = jp(ROI);

      // NULL FIRST. Two captures, nothing changed, same ROI.
      await E("TDProbe.capUI('_w'), TDProbe.capUI('n1')");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('n2')");
      T.flatNullRoi = await J("TDProbe.diffUI('n1','n2',0," + ROI + ")");
      T.flatNullFull = await J("TDProbe.diffUI('n1','n2',0)");

      // THE STENCIL, ON AND OFF.
      await E("TDFractal.suppressTierText(false)");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('son')");
      await E("TDFractal.suppressTierText(true)");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('soff')");
      T.flatSuppressLog = await J("TDFractal.log()");
      await E("TDFractal.suppressTierText(false)");
      T.flatStencil = await J("TDProbe.diffUI('son','soff',0," + ROI + ")");
      T.flatStencilFull = await J("TDProbe.diffUI('son','soff',0)");

      // AND IS IT THE AUTHORED COLOUR? Solved per pixel, plus a wrong ink that
      // must be rejected -- an ink test that cannot fail is not a test.
      T.flatInk = await J("TDFractal.inkFit('son','soff'," + ROI + "," +
        JSON.stringify(INK) + ")");
      T.flatInkWrong = await J("TDFractal.inkFit('son','soff'," + ROI + "," +
        JSON.stringify(WRONG_INK) + ")");

      // ================= 3D BOARD -- THE QUESTION ============================
      await E("TDProbe.use2D(false)");
      T.glMode = await J("TDProbe.use2D(false)");
      T.glPlace = await J("TDFractal.placeTier('" + TYPE + "'," + PROGRESS + "," + tier + ")");
      await E("TDProbe.warm(2)");
      T.glCalls = await J("TDFractal.callsInOneDraw()");

      // The flat stencil point AND the projected body, unioned and padded, so
      // an absence is checked at both places the glyph could be.
      T.glScreen = await J("TDProbe.screenOf(TDProbe._e.pos.x, TDProbe._e.pos.y, 0)");
      var gROI = await J(
        "(function(){var e=TDProbe._e; var r=Math.max(24,e.radiusPx()*3);" +
        " var s=TDProbe.screenOf(e.pos.x,e.pos.y,0)||{x:e.pos.x,y:e.pos.y};" +
        " var p=TDFractal.stencilPointFlat();" +
        " var xs=[s.x-r,s.x+r,p.x-r,p.x+r], ys=[s.y-r*1.8,s.y+r,p.y-r*1.8,p.y+r];" +
        " var x0=Math.floor(Math.min.apply(null,xs)), y0=Math.floor(Math.min.apply(null,ys));" +
        " return [x0,y0,Math.ceil(Math.max.apply(null,xs))-x0,Math.ceil(Math.max.apply(null,ys))-y0];})()");
      T.glRoi = gROI;
      var GR = JSON.stringify(gROI);

      await E("TDProbe.capUI('_w'), TDProbe.capUI('g1')");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('g2')");
      T.glNullRoi = await J("TDProbe.diffUI('g1','g2',0," + GR + ")");
      T.glNullFull = await J("TDProbe.diffUI('g1','g2',0)");

      await E("TDFractal.suppressTierText(false)");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('gson')");
      await E("TDFractal.suppressTierText(true)");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('gsoff')");
      await E("TDFractal.suppressTierText(false)");
      T.glStencil = await J("TDProbe.diffUI('gson','gsoff',0," + GR + ")");
      T.glStencilFull = await J("TDProbe.diffUI('gson','gsoff',0)");
      T.glInk = await J("TDFractal.inkFit('gson','gsoff'," + GR + "," +
        JSON.stringify(INK) + ")");

      // POSITIVE COMPANION ON THE SAME CANVAS IN THE SAME MODE. A zero above is
      // worthless unless a different comparison on #game in 3D returns
      // non-zero. The health bar only draws when the body is hurt, so hurt it.
      T.hurt = await J("TDFractal.hurt(0.5)");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('gbar')");
      await E("TDProbe.depopulate()");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('gempty')");
      await E("TDProbe.repopulate()");
      T.glPositiveOverlay = await J("TDProbe.diffUI('gbar','gempty',0," + GR + ")");
      // And on #gl, so the body is proven to be rendering at all.
      await E("TDProbe.cap('_w'), TDProbe.cap('gl1')");
      await E("TDProbe.depopulate()");
      await E("TDProbe.cap('_w'), TDProbe.cap('glempty')");
      await E("TDProbe.repopulate()");
      await E("TDProbe.cap('_w'), TDProbe.cap('gl2')");
      T.glBodySilhouette = await J("TDProbe.diff('gl1','glempty',0)");
      T.glNullBodies = await J("TDProbe.diff('gl1','gl2',0)");

      out.tiers["T" + tier] = T;
    }

    // ================= SCALE ALONE, ON #gl =================================
    //
    // Adjacent tiers are the SAME sphere at two sizes, so a pairwise
    // changed-pixel count between them is what scale is worth and nothing else.
    // fractalSizeScale = 0.65 + tier*0.35.
    await E("TDProbe.use2D(false)");
    var scale = { pairs: {}, solo: {}, controls: {} };
    var PHASE = 0.25;   // a quarter of a stride into the bounce, held for every tier

    async function shootTier(t, key) {
      var p = await J("TDFractal.placeTier('" + TYPE + "'," + PROGRESS + "," + t + ")");
      var ph = await J("TDFractal.phaseAt(" + PHASE + ")");
      await E("TDProbe.warm(2)");
      await E("TDProbe.cap('_w'), TDProbe.cap('" + key + "')");
      await E("TDProbe.depopulate()");
      await E("TDProbe.cap('_w'), TDProbe.cap('" + key + "_e')");
      await E("TDProbe.repopulate()");
      await E("TDProbe.warm(1)");
      var solo = await J("TDProbe.diff('" + key + "','" + key + "_e',0)");
      return { place: p, phase: ph, solo: solo };
    }

    for (var t = 0; t <= 5; t++) {
      scale.solo["T" + t] = await shootTier(t, "s" + t);
    }

    // REBUILD NULL. Every capture above is a fresh Enemy object -- a rebuilt
    // scene has photographed as a 133 px glow leak that did not exist. Build T4
    // twice and diff: if this is not 0, no pair number below is readable.
    var r1 = await shootTier(4, "rb1");
    var r2 = await shootTier(4, "rb2");
    scale.controls.rebuildNull = await J("TDProbe.diff('rb1','rb2',0)");
    scale.controls.rebuildPlaces = [r1.place, r2.place];

    // WHAT THE PROGRESS/YAW DIFFERENCE ALONE IS WORTH. Holding the phase
    // FRACTION equal means the two tiers sit at different absolute progress, so
    // their yaw differs slightly. Same tier at the two progress values isolates
    // that, and it is the floor any pair number has to clear.
    for (var pi = 0; pi < 2; pi++) {
      var a = [4, 3][pi], b = [5, 4][pi];
      var pa = scale.solo["T" + a].phase.progress;
      var pb = scale.solo["T" + b].phase.progress;
      await E("TDFractal.placeTier('" + TYPE + "'," + PROGRESS + "," + a + ")");
      await E("TDProbe.progressTo(" + pa + ")");
      await E("TDProbe.warm(2)");
      await E("TDProbe.cap('_w'), TDProbe.cap('yc_a')");
      await E("TDProbe.progressTo(" + pb + ")");
      await E("TDProbe.warm(2)");
      await E("TDProbe.cap('_w'), TDProbe.cap('yc_b')");
      scale.controls["yawOnly_T" + a + "_at_T" + b + "progress"] =
        await J("TDProbe.diff('yc_a','yc_b',0)");
    }

    var PAIRS = [[4, 5], [3, 4], [2, 3], [1, 2], [0, 1], [0, 5]];
    for (var q = 0; q < PAIRS.length; q++) {
      var A = PAIRS[q][0], B = PAIRS[q][1];
      var d = await J("TDProbe.diff('s" + A + "','s" + B + "',0)");
      var sa = scale.solo["T" + A].solo.changed, sb = scale.solo["T" + B].solo.changed;
      scale.pairs["T" + A + "-T" + B] = {
        changed: d.changed, bboxGL: d.bboxGL,
        soloA: sa, soloB: sb,
        ratio: +(d.changed / ((sa + sb) / 2)).toFixed(3),
        scaleA: scale.solo["T" + A].place.sizeScale,
        scaleB: scale.solo["T" + B].place.sizeScale,
        diameterStep: +(scale.solo["T" + B].place.sizeScale /
                        scale.solo["T" + A].place.sizeScale).toFixed(3)
      };
    }
    out.scale = scale;

  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

main().catch(function (e) {
  console.error("FRACTAL STENCIL PROBE FAILED: " + e.stack);
  process.exit(1);
});
