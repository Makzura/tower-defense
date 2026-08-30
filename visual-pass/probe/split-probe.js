// The three-way split, applied to two questions at once.
//
//   1. THE CAMO ALPHA. A changed-pixel count cannot tune it -- measured, the
//      count is 97-100 px at every alpha from 0.85 to 0.40, because alpha does
//      not move the outline by a single pixel. Only magnitude varies. So the
//      split is not a nicety here, it is the only instrument that can say what
//      the cue IS.
//
//   2. kaz's ranking bias, and his discriminating prediction: the Cooper is
//      built to be the LEAST separated body on the board and its envelope
//      against the Gleaner is x 0.000, z 0.000, y +0.040 u. If a count ranks it
//      HIGH while its silhouette change is near zero, the diagnosis is
//      confirmed by a body nobody designed as a test.
//
//   node visual-pass/probe/split-probe.js
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cdp = require("./cdp");
var serve = require("./serve");

var PORT = 8800, DEVTOOLS = 9340;
var URL = "http://127.0.0.1:" + PORT + "/game/index.html";
var ROOT = path.resolve(__dirname, "..", "..");

var BODIES = [
  { typeId: "normal",      name: "Gleaner" },
  { typeId: "armored",     name: "Drudge"  },
  { typeId: "fast",        name: "Skimmer" },
  { typeId: "slow",        name: "Tun"     },
  { typeId: "angry",       name: "Hedger"  },
  { typeId: "camo_normal", name: "Cooper"  }
];

async function main() {
  var server = await new Promise(function (r, j) {
    serve.start(PORT, function (e, s) { e ? j(e) : r(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-split"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, URL);
  var S = conn.session;
  var out = {};

  try {
    for (var w = 0; w < 80; w++) {
      if (await S.evaluate("typeof startRun === 'function' && typeof GLModels !== 'undefined'")) break;
      await cdp.sleep(250);
    }
    ["page-probe.js", "page-probe-groups.js", "page-probe-split.js"].forEach(function () {});
    await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe.js"), "utf8"));
    await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe-groups.js"), "utf8"));
    await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe-split.js"), "utf8"));
    out.setup = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.setup())"));
    await S.evaluate("TDProbe.camDefault()");
    await S.evaluate("TDProbe.warm(2)");
    out.camera = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.camState())"));
    out.registered = JSON.parse(await S.evaluate(
      "JSON.stringify({cooper:GLModels.has('enemy-camo_normal')})"));

    async function placeAt(typeId, camo) {
      await S.evaluate("TDProbe.place('" + typeId + "',60)");
      await S.evaluate("(function(){var e=TDProbe._e; e.pos.x=640; e.pos.y=360;" +
        " TDProbe._home.x=640; TDProbe._home.y=360; e.isCamo=" + (!!camo) + ";" +
        " TDProbe.frameAt(0); return 1;})()");
      await S.evaluate("TDProbe.warm(2)");
    }
    async function forceAlpha(a) {
      return S.evaluate("(function(){var r=World3D.renderer();" +
        " if(!r._realFade) r._realFade=r.setFade;" +
        " r.setFade=function(v){ return r._realFade.call(r,(v>=1?1:" + a + ")); };" +
        " return 1;})()");
    }

    // Empty board, the membership reference for every split below.
    await S.evaluate("enemies.length=0");
    await S.evaluate("TDProbe.warm(2)");
    await S.evaluate("TDProbe.cap('empty')");

    // ---- 1. THE ALPHA, in split terms.
    await placeAt("camo_normal", true);
    await forceAlpha(1);
    await S.evaluate("TDProbe.warm(2)"); await S.evaluate("TDProbe.cap('a1')");
    out.alphaSweep = [];
    var alphas = [0.85, 0.75, 0.68, 0.62, 0.55, 0.5, 0.4];
    for (var ai = 0; ai < alphas.length; ai++) {
      await forceAlpha(alphas[ai]);
      await S.evaluate("TDProbe.warm(2)"); await S.evaluate("TDProbe.cap('sw')");
      var sp = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.split('a1','sw','empty'))"));
      sp.alpha = alphas[ai];
      out.alphaSweep.push(sp);
    }
    await S.evaluate("(function(){var r=World3D.renderer(); if(r._realFade) r.setFade=r._realFade; return 1;})()");

    // ---- 2. THE RING, on #game. Its whole point is that it ADDS outline where
    // the alpha adds none, so it is measured the same way and the two numbers
    // are directly comparable.
    await S.evaluate("enemies.length=0"); await S.evaluate("TDProbe.warm(2)");
    await S.evaluate("TDProbe.capUI('uiEmpty')");
    await placeAt("camo_normal", true);
    await S.evaluate("TDProbe.capUI('uiOn')");
    await S.evaluate("(function(){TDProbe._e.isCamo=false;return 1;})()");
    await S.evaluate("TDProbe.warm(2)"); await S.evaluate("TDProbe.capUI('uiOff')");
    out.ringSplit = JSON.parse(await S.evaluate(
      "(function(){" +
      " var A=TDProbe.frames['ui:uiOff'],B=TDProbe.frames['ui:uiOn'],E=TDProbe.frames['ui:uiEmpty'];" +
      " var g=0,v=0,rc=0;" +
      " for(var i=0;i<A.length;i+=4){" +
      "  var inA=(A[i]!==E[i]||A[i+1]!==E[i+1]||A[i+2]!==E[i+2]||A[i+3]!==E[i+3]);" +
      "  var inB=(B[i]!==E[i]||B[i+1]!==E[i+1]||B[i+2]!==E[i+2]||B[i+3]!==E[i+3]);" +
      "  if(!inA&&inB){g++;continue;} if(inA&&!inB){v++;continue;}" +
      "  if(inA&&inB&&(A[i]!==B[i]||A[i+1]!==B[i+1]||A[i+2]!==B[i+2])) rc++;}" +
      " return JSON.stringify({gained:g,vacated:v,recoloured:rc});})()"));

    // ---- 3. THE BOARD, count against silhouette. Each body at the SAME spot,
    // same frame, same yaw, opaque, so only the model differs.
    for (var b = 0; b < BODIES.length; b++) {
      await placeAt(BODIES[b].typeId, false);
      await S.evaluate("TDProbe.cap('m_" + BODIES[b].typeId + "')");
    }
    out.pairs = {};
    for (var x = 0; x < BODIES.length; x++) {
      for (var y = x + 1; y < BODIES.length; y++) {
        var k = BODIES[x].name + " vs " + BODIES[y].name;
        out.pairs[k] = JSON.parse(await S.evaluate(
          "JSON.stringify(TDProbe.split('m_" + BODIES[x].typeId +
          "','m_" + BODIES[y].typeId + "','empty'))"));
      }
    }
    out.solo = {};
    for (var s2 = 0; s2 < BODIES.length; s2++) {
      out.solo[BODIES[s2].name] = JSON.parse(await S.evaluate(
        "JSON.stringify(TDProbe.diff('m_" + BODIES[s2].typeId + "','empty',0))")).changed;
    }
  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

main().catch(function (e) { console.error("SPLIT PROBE FAILED: " + e.stack); process.exit(1); });
