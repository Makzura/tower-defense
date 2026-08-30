// THE STACKER, PART TWO: an honest glyph, and what SCALE ALONE is worth.
//
// Run one fixed two blemishes in the first pass, and answer the question the
// separation ratio cannot.
//
// 1. THE FIRST PASS PUT THE BODY AT WORLD x ~ 0 and the glyph was half off the
//    bitmap -- 23/42/64 px are under-counts of an unknown amount. Here the spot
//    is CHOSEN by measuring where the body's flat box sits clear of every edge,
//    rather than by picking a progress and hoping.
//
// 2. THE SEPARATION RATIO IS THE WRONG INSTRUMENT FOR THIS PAIR AND SAYS SO
//    LOUDLY. It scores "do these two occupy different pixels". Two sizes of one
//    sphere occupy very different pixels, so it returns a high number -- higher
//    than any pair of genuinely different Easy bodies -- while the thing a
//    player has to do is tell a tier from a tier. A ratio cannot separate "two
//    different creatures" from "one creature at two distances", and under a
//    perspective camera those are LITERALLY the same picture.
//
//    So this measures the thing that decides it: how much a body's apparent
//    size changes from one end of the road to the other, against the 17% step
//    between adjacent tiers. If one tier's range along the road covers the next
//    tier's, the size cue is destroyed by position and nothing but a reference
//    object can recover the tier.
//
//   node visual-pass/probe/fractal-scale-probe.js
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cdp = require("./cdp");
var serve = require("./serve");

var PORT = 8796, DEVTOOLS = 9336;
var TYPE = "fractal_slime";
var GAME_URL = "http://127.0.0.1:" + PORT + "/game/index.html";
var INK = [13, 64, 47];
var WRONG_INK = [190, 255, 205];
var PHASE = 0.25;

async function main() {
  var server = await new Promise(function (res, rej) {
    serve.start(PORT, function (e, s) { e ? rej(e) : res(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-fscale"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, GAME_URL);
  var S = conn.session;
  var E = function (js) { return S.evaluate(js); };
  var J = async function (js) { return JSON.parse(await S.evaluate("JSON.stringify(" + js + ")")); };
  var out = { notes: [] };

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
    out.pathLength = await E("path.length");

    // ---- a spot where the biggest body is clear of every canvas edge -------
    await E("TDProbe.use2D(true)");
    await E("TDProbe.warm(4)");           // the mode switch itself is a scene change
    var scan = [];
    for (var p = 100; p <= 1900; p += 100) {
      await E("TDFractal.placeTier('" + TYPE + "'," + p + ",5)");
      await E("TDProbe.warm(2)");
      await E("TDProbe.depopulate()");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('e')");
      await E("TDProbe.repopulate()");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('b')");
      var d = await J("TDProbe.diffUI('b','e',0)");
      var box = d.bbox;
      var margin = box ? Math.min(box[0], box[1], 1280 - (box[0] + box[2]),
                                  720 - (box[1] + box[3])) : -1;
      scan.push({ progress: p, changed: d.changed, bbox: box, margin: margin });
    }
    out.flatSpotScan = scan;
    var best = scan.filter(function (s) { return s.margin >= 20; })
                   .sort(function (a, b) { return b.margin - a.margin; })[0];
    if (!best) throw new Error("no flat spot with a 20 px margin on every edge");
    out.flatSpot = best;
    var P = best.progress;

    // ---- the glyph, unclipped, every tier ---------------------------------
    out.flatGlyph = {};
    for (var t = 0; t <= 5; t++) {
      var g = { tier: t };
      g.place = await J("TDFractal.placeTier('" + TYPE + "'," + P + "," + t + ")");
      await E("TDProbe.warm(2)");
      g.calls = await J("TDFractal.callsInOneDraw()");
      await E("TDProbe.depopulate()");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('fe')");
      await E("TDProbe.repopulate()");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('fb')");
      var bb = await J("TDProbe.diffUI('fb','fe',0)");
      g.bodyBox = bb.bbox; g.bodyPx = bb.changed;
      var ROI = JSON.stringify([bb.bbox[0] - 8, bb.bbox[1] - 8,
                                bb.bbox[2] + 16, bb.bbox[3] + 16]);
      g.roi = JSON.parse(ROI);
      await E("TDProbe.capUI('_w'), TDProbe.capUI('n1')");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('n2')");
      g.nullRoi = (await J("TDProbe.diffUI('n1','n2',0," + ROI + ")")).changed;
      await E("TDFractal.suppressTierText(false)");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('on')");
      await E("TDFractal.suppressTierText(true)");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('off')");
      await E("TDFractal.suppressTierText(false)");
      g.stencil = await J("TDProbe.diffUI('on','off',0," + ROI + ")");
      g.stencilFull = (await J("TDProbe.diffUI('on','off',0)")).changed;
      g.ink = await J("TDFractal.inkFit('on','off'," + ROI + "," + JSON.stringify(INK) + ")");
      g.inkWrong = await J("TDFractal.inkFit('on','off'," + ROI + "," + JSON.stringify(WRONG_INK) + ")");
      // The glyph as a share of the body it is printed on -- the number that
      // says whether it can be read at game scale, which "42 px" cannot.
      g.glyphShareOfBody = +(g.stencil.changed / g.bodyPx).toFixed(4);
      out.flatGlyph["T" + t] = g;
    }

    // ---- the same six tiers on the shipping board -------------------------
    await E("TDProbe.use2D(false)");
    await E("TDProbe.warm(4)");
    out.glGlyph = {};
    for (var t2 = 0; t2 <= 5; t2++) {
      var q = { tier: t2 };
      await E("TDFractal.placeTier('" + TYPE + "'," + P + "," + t2 + ")");
      await E("TDProbe.warm(2)");
      q.calls = await J("TDFractal.callsInOneDraw()");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('n1')");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('n2')");
      q.nullFull = (await J("TDProbe.diffUI('n1','n2',0)")).changed;
      await E("TDFractal.suppressTierText(false)");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('on')");
      await E("TDFractal.suppressTierText(true)");
      await E("TDProbe.capUI('_w'), TDProbe.capUI('off')");
      await E("TDFractal.suppressTierText(false)");
      q.stencilFull = (await J("TDProbe.diffUI('on','off',0)")).changed;
      out.glGlyph["T" + t2] = q;
    }

    // ---- APPARENT SIZE ALONG THE ROAD -------------------------------------
    //
    // The tier separator, if it is scale, has to survive the camera. A tier's
    // apparent size is measured at spots spanning the whole route; if T4's
    // range covers T5's, then two bodies of different tier standing at
    // different points of the road are the same picture and no amount of
    // authored size step recovers the tier.
    var SPOTS = [];
    var L = out.pathLength;
    for (var k = 0; k < 12; k++) SPOTS.push(Math.round((k + 0.5) * L / 12));
    out.spots = SPOTS;
    out.apparent = {};
    for (var t3 = 0; t3 <= 5; t3++) {
      var rows = [];
      for (var si = 0; si < SPOTS.length; si++) {
        var sp = SPOTS[si];
        var pl = await J("TDFractal.placeTier('" + TYPE + "'," + sp + "," + t3 + ")");
        await E("TDFractal.phaseAt(" + PHASE + ")");
        await E("TDProbe.warm(2)");
        await E("TDProbe.cap('_w'), TDProbe.cap('a')");
        await E("TDProbe.depopulate()");
        await E("TDProbe.cap('_w'), TDProbe.cap('ae')");
        await E("TDProbe.repopulate()");
        await E("TDProbe.warm(1)");
        var sd = await J("TDProbe.diff('a','ae',0)");
        var scr = await J("TDProbe.screenOf(TDProbe._e.pos.x,TDProbe._e.pos.y,0)");
        rows.push({ progress: sp, px: sd.changed, bboxGL: sd.bboxGL,
                    w: sd.bboxGL ? sd.bboxGL[2] : 0,
                    h: sd.bboxGL ? sd.bboxGL[3] : 0,
                    depth: scr ? +scr.depth.toFixed(1) : null,
                    worldPos: pl.pos });
      }
      var pxs = rows.map(function (r) { return r.px; });
      var hs = rows.map(function (r) { return r.h; });
      out.apparent["T" + t3] = {
        sizeScale: (await J("TDFractal.placeTier('" + TYPE + "'," + P + "," + t3 + ")")).sizeScale,
        rows: rows,
        pxMin: Math.min.apply(null, pxs), pxMax: Math.max.apply(null, pxs),
        hMin: Math.min.apply(null, hs), hMax: Math.max.apply(null, hs)
      };
    }

    // A NULL FOR THE SWEEP: the same tier at the same spot, rebuilt. If this is
    // not 0 the spread above is the rig, not the camera.
    await E("TDFractal.placeTier('" + TYPE + "'," + SPOTS[3] + ",3)");
    await E("TDFractal.phaseAt(" + PHASE + ")");
    await E("TDProbe.warm(2)");
    await E("TDProbe.cap('_w'), TDProbe.cap('z1')");
    await E("TDFractal.placeTier('" + TYPE + "'," + SPOTS[3] + ",3)");
    await E("TDFractal.phaseAt(" + PHASE + ")");
    await E("TDProbe.warm(2)");
    await E("TDProbe.cap('_w'), TDProbe.cap('z2')");
    out.sweepNull = (await J("TDProbe.diff('z1','z2',0)")).changed;

  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

main().catch(function (e) {
  console.error("FRACTAL SCALE PROBE FAILED: " + e.stack);
  process.exit(1);
});
