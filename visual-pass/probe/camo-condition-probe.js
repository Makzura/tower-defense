// WHICH COOPER DID THE SEPARATION TABLE MEASURE -- the faded one that ships, or
// an opaque one that does not exist?
//
// kaz's caveat, and it is the six-terms rule pointed at the CONDITION a body was
// rendered under rather than at the metric, the bearing or the population.
//
// The camo cue is in js/gl/ NOW: CAMO_ALPHA = 0.62 (gl-world.js:609), a two-pass
// draw at 1305-1316 that puts every camo body in a second faded pass, and a
// projected ring at 2004. My own memory said `isCamo` appeared ZERO times under
// js/gl/ -- that was measured on 2026-08-13 and it has since been ported, so the
// memory is stale and this run is what replaces it. A note about code is a claim
// with a date on it.
//
// THE EXPERIMENT. `isCamo` flipped on the SAME instance -- the field both
// gl-world and js/enemy.js actually read -- so the two captures differ in the
// camo condition and in nothing else. Comparing camo_normal against normal
// instead differs by the mesh palette too and could not separate the two causes.
//
//   node visual-pass/probe/camo-condition-probe.js
"use strict";
var fs = require("fs"), path = require("path"), os = require("os");
var cdp = require("./cdp"), serve = require("./serve");
var PORT = 8802, DEVTOOLS = 9342;
var GAME_URL = "http://127.0.0.1:" + PORT + "/game/index.html";
var SPOT = 1450;   // the three-quarter/broadside spot the separation table chose

async function main() {
  var server = await new Promise(function (r, j) {
    serve.start(PORT, function (e, s) { e ? j(e) : r(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-camocond"));
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
    await E(fs.readFileSync(path.join(__dirname, "page-probe-fractal.js"), "utf8"));
    out.setup = await J("TDProbe.setup()");
    await E("TDProbe.camDefault()");
    out.camera = await J("TDProbe.camState()");
    await E("TDProbe.setClock(0)");
    await E("TDProbe.warm(2)");

    // Does the SHIPPED code path exist, and does a placed body carry the flag?
    out.glCamoWired = await E(
      "(function(){var s=World3D.drawWorld.toString();return -1;})()");
    out.place = await J("TDProbe.place('camo_normal'," + SPOT + ")");
    await E("TDProbe.frameAt(0)");
    out.instanceFlag = await J(
      "(function(){var e=TDProbe._e;return {isCamo:e.isCamo, typeId:e.typeId," +
      " typeIsCamo:!!e.type.isCamo, meshRegistered:GLModels.has('enemy-'+e.typeId)," +
      " color:e.type.color};})()");

    // ---- is the fade actually reaching the picture? ----
    await E("TDProbe.setClock(0)"); await E("TDProbe.warm(2)");
    await E("TDProbe.cap('_w'), TDProbe.cap('faded')");
    await E("TDProbe.cap('_w'), TDProbe.cap('faded2')");
    out.nullGl = (await J("TDProbe.diff('faded','faded2',0)")).changed;

    await E("TDProbe._e.isCamo = false");
    await E("TDProbe.setClock(0)"); await E("TDProbe.warm(2)");
    await E("TDProbe.cap('_w'), TDProbe.cap('opaque')");
    out.fadeIsLive = await J("TDProbe.diff('faded','opaque',0)");

    // Silhouettes of each condition against an empty board.
    await E("TDProbe.depopulate()");
    await E("TDProbe.cap('_w'), TDProbe.cap('empty')");
    await E("TDProbe.repopulate()");
    await E("TDProbe.setClock(0)"); await E("TDProbe.warm(2)");
    await E("TDProbe.cap('_w'), TDProbe.cap('opaque')");
    await E("TDFractal.glMask('opaque','empty','opaque')");
    out.soloOpaque = (await J("TDProbe.diff('opaque','empty',0)")).changed;

    await E("TDProbe._e.isCamo = true");
    await E("TDProbe.setClock(0)"); await E("TDProbe.warm(2)");
    await E("TDProbe.cap('_w'), TDProbe.cap('faded')");
    await E("TDFractal.glMask('faded','empty','faded')");
    out.soloFaded = (await J("TDProbe.diff('faded','empty',0)")).changed;

    // ---- the pair, BOTH WAYS ----
    await E("TDProbe.place('normal'," + SPOT + ")");
    await E("TDProbe.frameAt(0)");
    await E("TDProbe.setClock(0)"); await E("TDProbe.warm(2)");
    await E("TDProbe.cap('_w'), TDProbe.cap('gleaner')");
    await E("TDFractal.glMask('gleaner','empty','gleaner')");
    out.soloGleaner = (await J("TDProbe.diff('gleaner','empty',0)")).changed;

    async function pair(aKey, aMask, aSolo, label) {
      var d = await J("TDProbe.diff('" + aKey + "','gleaner',0)");
      var st = await J("TDFractal.setStats('" + aMask + "','gleaner','" + aKey + "','gleaner')");
      var mean = (aSolo + out.soloGleaner) / 2;
      return { label: label, changed: d.changed, soloCooper: aSolo,
               soloGleaner: out.soloGleaner, ratio: +(d.changed / mean).toFixed(3),
               intersection: st.intersection, rimPx: st.symmetricDifference,
               interiorPx: st.changedInsideIntersection,
               interiorShare: st.shadingShareOfMetric,
               intersectionRepainted: st.intersectionRepaintedFraction };
    }
    out.pairFadedShipping = await pair("faded", "faded", out.soloFaded, "Cooper AS SHIPPED (isCamo true, fade 0.62)");
    out.pairOpaque = await pair("opaque", "opaque", out.soloOpaque, "Cooper FORCED OPAQUE (does not ship)");

    // ---- the ring, on the other canvas ----
    await E("TDProbe.place('camo_normal'," + SPOT + ")");
    await E("TDProbe.frameAt(0)");
    await E("TDProbe.setClock(0)"); await E("TDProbe.warm(2)");
    var GR = await J(
      "(function(){var e=TDProbe._e;var s=TDProbe.screenOf(e.pos.x,e.pos.y,0);" +
      " var r=Math.max(30,e.radiusPx()*4);" +
      " return [Math.round(s.x-r),Math.round(s.y-r*1.6),Math.round(r*2),Math.round(r*2.6)];})()");
    out.ringRoi = GR;
    var R = JSON.stringify(GR);
    await E("TDProbe.capUI('_w'), TDProbe.capUI('r1')");
    await E("TDProbe.capUI('_w'), TDProbe.capUI('r2')");
    out.ringNullRoi = (await J("TDProbe.diffUI('r1','r2',0," + R + ")")).changed;
    await E("TDProbe._e.isCamo = false");
    await E("TDProbe.capUI('_w'), TDProbe.capUI('r3')");
    out.ringOnOff = await J("TDProbe.diffUI('r1','r3',0," + R + ")");
    await E("TDProbe._e.isCamo = true");

  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}
main().catch(function (e) { console.error("CAMO CONDITION PROBE FAILED: " + e.stack); process.exit(1); });
