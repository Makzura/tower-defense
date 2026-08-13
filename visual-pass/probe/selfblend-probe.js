// DOES A CAMO BODY BLEND OVER ITSELF?
//
// juno's hypothesis, from reading the code rather than measuring it. `setFade`
// sets depthMask(false), so no camo fragment writes depth. Depth TESTING is
// still on, so every camo fragment nearer than the opaque scene passes -- and
// nothing stops a SECOND front face of the same body, further back but still
// nearer than the scene, from passing too. Wherever two front-facing surfaces
// of one camo body overlap in screen space (arm over torso, near leg over far
// leg) that pixel would be blended twice and render DARKER than intended.
//
// If true this is not a metrology curiosity, it is a visual defect on the two
// camo bodies -- and they are already the least separable things on the board.
//
// THE TEST IS PER PIXEL, because an aggregate is what hid it. GL blends in the
// framebuffer AFTER the shader's sRGB encode, so for a single layer
//
//     result = alpha * opaque + (1 - alpha) * plate
//
// holds exactly in 0-255 space. Pixels matching that are single-layer. Pixels
// deviating are multi-layer -- or something else, which is why the run also
// carries a control that must make the deviation vanish.
//
//   node visual-pass/probe/selfblend-probe.js
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cdp = require("./cdp");
var serve = require("./serve");

var PORT = 8802, DEVTOOLS = 9342;
var URL = "http://127.0.0.1:" + PORT + "/TD_0.5.0/index.html";
var ALPHA = 0.62;

async function main() {
  var server = await new Promise(function (r, j) {
    serve.start(PORT, function (e, s) { e ? j(e) : r(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-selfblend"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, URL);
  var S = conn.session;
  var out = { alpha: ALPHA };

  try {
    for (var w = 0; w < 80; w++) {
      if (await S.evaluate("typeof startRun === 'function' && typeof GLModels !== 'undefined'")) break;
      await cdp.sleep(250);
    }
    await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe.js"), "utf8"));
    await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe-groups.js"), "utf8"));
    await S.evaluate("JSON.stringify(TDProbe.setup())");
    await S.evaluate("TDProbe.camDefault()");
    await S.evaluate("TDProbe.warm(2)");
    out.camera = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.camState())"));

    // Classify every body pixel against the single-layer prediction.
    await S.evaluate(
      "(function(){ TDProbe.classify = function (plateK, opaqueK, camoK, a, tol) {" +
      "  var P=TDProbe.frames[plateK], O=TDProbe.frames[opaqueK], C=TDProbe.frames[camoK];" +
      "  var single=0, multi=0, worst=0, sumDev=0, n=0;" +
      "  var c=document.getElementById('gl'), W=c.width;" +
      "  var minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;" +
      "  for (var i=0,p=0;i<O.length;i+=4,p++) {" +
      "    var isBody = (O[i]!==P[i]||O[i+1]!==P[i+1]||O[i+2]!==P[i+2]);" +
      "    if(!isBody) continue; n++;" +
      "    var dmax=0;" +
      "    for(var k=0;k<3;k++){" +
      "      var pred = a*O[i+k] + (1-a)*P[i+k];" +
      "      var dev = Math.abs(C[i+k]-pred); if(dev>dmax) dmax=dev; }" +
      "    sumDev+=dmax; if(dmax>worst) worst=dmax;" +
      "    if(dmax<=tol) single++; else {" +
      "      multi++;" +
      "      var x=p%W, y=(p/W)|0;" +
      "      if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }" +
      "  }" +
      "  return { bodyPx:n, singleLayer:single, deviating:multi," +
      "           deviatingShare: n?+(multi/n).toFixed(3):0," +
      "           meanDeviation: n?+(sumDev/n).toFixed(2):0, worstDeviation:worst," +
      "           bboxGL: multi?[minX,minY,maxX-minX+1,maxY-minY+1]:null };" +
      "}; return 1; })()");

    async function capture(typeId, groupsKept) {
      await S.evaluate("TDProbe.place('" + typeId + "',60)");
      await S.evaluate("(function(){var e=TDProbe._e; e.pos.x=640; e.pos.y=360;" +
        " TDProbe._home.x=640; TDProbe._home.y=360; e.isCamo=true;" +
        " TDProbe.frameAt(0); return 1;})()");
      var model = "enemy-" + typeId;
      if (groupsKept) {
        await S.evaluate("TDProbe.suppress('" + model + "'," +
          JSON.stringify(groupsKept) + ",true)");
      } else {
        await S.evaluate("TDProbe.restoreGroups('" + model + "')");
      }
      // plate: the board with the body gone, same everything else
      await S.evaluate("(function(){TDProbe._stash=enemies.slice();enemies.length=0;return 1;})()");
      await S.evaluate("TDProbe.warm(2)"); await S.evaluate("TDProbe.cap('plate')");
      await S.evaluate("(function(){enemies.length=0;enemies.push(TDProbe._e);return 1;})()");
      // opaque: fade forced inert
      await S.evaluate("(function(){var r=World3D.renderer(); if(!r._rf) r._rf=r.setFade;" +
        " r.setFade=function(v){return r._rf.call(r,1);}; return 1;})()");
      await S.evaluate("TDProbe.warm(2)"); await S.evaluate("TDProbe.cap('opaque')");
      // camo at the shipped alpha
      await S.evaluate("(function(){var r=World3D.renderer();" +
        " r.setFade=function(v){return r._rf.call(r,(v>=1?1:" + ALPHA + "));}; return 1;})()");
      await S.evaluate("TDProbe.warm(2)"); await S.evaluate("TDProbe.cap('camo')");
      return JSON.parse(await S.evaluate(
        "JSON.stringify(TDProbe.classify('plate','opaque','camo'," + ALPHA + ",1))"));
    }

    out.groups = JSON.parse(await S.evaluate(
      "JSON.stringify(TDProbe.groupNames('enemy-camo_normal'))"));

    // THE MEASUREMENT: whole body, every group, self-overlap possible.
    out.wholeBody = await capture("camo_normal", null);

    // THE CONTROL: one group only. A single convex-ish group with back faces
    // culled can barely overlap itself, so the deviating set must collapse.
    // If it does not, the deviation is not self-blending and juno's hypothesis
    // is refuted rather than merely unconfirmed.
    out.bodyGroupOnly = await capture("camo_normal", ["camo_normal_body"]);
    if (out.bodyGroupOnly.bodyPx === 0 && out.groups.length) {
      out.bodyGroupOnly = await capture("camo_normal", [out.groups[0]]);
      out.bodyGroupOnlyUsed = out.groups[0];
    }

    // A limb alone, as a second single-layer reference.
    out.oneArm = await capture("camo_normal", ["arm_l"]);

    // And the Hedger, which has a crank hanging in front of its hip -- the
    // most overlapping body in the set, so it should show the effect hardest
    // if the effect is real.
    out.hedgerWhole = await capture("angry", null);
  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

main().catch(function (e) { console.error("SELFBLEND FAILED: " + e.stack); process.exit(1); });
