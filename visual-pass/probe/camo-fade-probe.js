// Verification for the camo translucency + ring.
//
// The obvious test -- camo body against ordinary body -- is the WRONG one:
// those two differ by their type colour and would show a difference even if
// the fade did nothing. Everything here isolates the change instead.
//
//   A  reorder is inert     old build vs new build with alpha FORCED TO 1.
//                           Must be EXACTLY 0. This is the negative control,
//                           and it also proves the two-pass split is neutral.
//   B  the cue              alpha on vs alpha off, same body, spot, frame.
//   C  alpha sweep          cue strength against remaining body contrast.
//   D  buffer order         THE question this change raises: under setFade a
//                           model's own triangles composite in buffer order.
//                           suki's two re-exports of enemy-normal differ ONLY
//                           in triangle order, so rendering them faded and
//                           diffing measures observability directly.
//   E  the ring             on #game, ROI'd, against an ROI null control.
//   F  camo over camo       two overlapping camo bodies, array order swapped.
//
//   node visual-pass/probe/camo-fade-probe.js
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");
var cdp = require("./cdp");
var serve = require("./serve");

var PORT = 8799, DEVTOOLS = 9339;
var ROOT = path.resolve(__dirname, "..", "..");
var BASE = path.join(ROOT, "visual-pass", "tmp", "camo-base");
var NEW_URL = "http://127.0.0.1:" + PORT + "/TD_0.5.0/index.html";
var OLD_URL = "http://127.0.0.1:" + PORT + "/visual-pass/tmp/camo-base/TD_0.5.0/index.html";

function sh(c) { return cp.execSync(c, { cwd: ROOT }).toString(); }

async function boot(url) {
  var conn = await cdp.open(DEVTOOLS, url);
  var S = conn.session;
  for (var i = 0; i < 80; i++) {
    if (await S.evaluate("typeof startRun === 'function' && typeof GLModels !== 'undefined'")) break;
    await cdp.sleep(250);
  }
  await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe.js"), "utf8"));
  await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe-groups.js"), "utf8"));
  await S.evaluate("JSON.stringify(TDProbe.setup())");
  await S.evaluate("TDProbe.camDefault()");
  await S.evaluate("TDProbe.warm(2)");
  return S;
}

// One camo body at a fixed spot and frame. `isCamo` is set on the INSTANCE,
// which is the field gl-world actually reads.
async function placeCamo(S, typeId, camo) {
  await S.evaluate("TDProbe.place('" + typeId + "',60)");
  await S.evaluate("(function(){var e=TDProbe._e; e.pos.x=640; e.pos.y=360;" +
    " TDProbe._home.x=640; TDProbe._home.y=360; e.isCamo=" + (!!camo) + ";" +
    " TDProbe.frameAt(0); return 1;})()");
  await S.evaluate("TDProbe.warm(2)");
}

// Force every faded draw to a chosen alpha without editing the game, so a
// sweep runs in ONE page session. Passing 1 makes the fade inert, which is the
// negative control.
async function forceAlpha(S, a) {
  return S.evaluate(
    "(function(){var r=World3D.renderer();" +
    " if(!r._realFade) r._realFade=r.setFade;" +
    " r.setFade=function(v){ return r._realFade.call(r, (v>=1?1:" + a + ")); };" +
    " return 'forced " + a + "';})()");
}
async function unforceAlpha(S) {
  return S.evaluate("(function(){var r=World3D.renderer();" +
    " if(r._realFade) r.setFade=r._realFade; return 'restored';})()");
}

async function main() {
  fs.rmSync(BASE, { recursive: true, force: true });
  fs.mkdirSync(BASE, { recursive: true });
  // HEAD is the pre-change tree; the edit under test is uncommitted.
  sh('git archive HEAD | tar -x -C "' + BASE.replace(/\\/g, "/") + '"');
  if (!fs.existsSync(path.join(BASE, "TD_0.5.0", "js", "gl", "gl-world.js"))) {
    throw new Error("base tree did not extract");
  }
  var out = { note: "old = HEAD (pre-change), new = working tree" };

  var server = await new Promise(function (r, j) {
    serve.start(PORT, function (e, s) { e ? j(e) : r(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-camo2"));
  await cdp.waitForDevTools(DEVTOOLS);

  try {
    // ---- OLD BUILD: the reference frames.
    var O = await boot(OLD_URL);
    out.oldHasCamoCode = await O.evaluate(
      "(function(){var s=document.querySelector('script[src*=\"gl-world\"]'); return !!s;})()");
    await placeCamo(O, "camo_normal", true);
    await O.evaluate("TDProbe.cap('ref')");
    await O.evaluate("TDProbe.capUI('refui')");
    await O.evaluate("TDProbe.cap('ref2')");
    out.oldNull = JSON.parse(await O.evaluate("JSON.stringify(TDProbe.diff('ref','ref2',0))")).changed;
    var refPix = await O.evaluate(
      "(function(){var b=TDProbe.frames['ref'],h=0;" +
      " for(var i=0;i<b.length;i+=4){h=(h*31+b[i]+b[i+1]*7+b[i+2]*13)|0;} return h;})()");
    out.refHash = refPix;
    var refBox = JSON.parse(await O.evaluate(
      "(function(){TDProbe.depopulate();TDProbe.warm(1);TDProbe.cap('e');" +
      " TDProbe.repopulate();TDProbe.warm(1);TDProbe.capUI('eui');" +
      " return JSON.stringify(TDProbe.diff('ref','e',0));})()"));
    out.refSilhouette = refBox.changed;

    // ---- NEW BUILD.
    var N = await boot(NEW_URL);
    await placeCamo(N, "camo_normal", true);

    // A: alpha forced to 1 must reproduce the old build EXACTLY.
    await forceAlpha(N, 1);
    await N.evaluate("TDProbe.warm(2)");
    await N.evaluate("TDProbe.cap('a1')");
    var a1Hash = await N.evaluate(
      "(function(){var b=TDProbe.frames['a1'],h=0;" +
      " for(var i=0;i<b.length;i+=4){h=(h*31+b[i]+b[i+1]*7+b[i+2]*13)|0;} return h;})()");
    out.A_reorderInert = { refHash: refPix, newAlpha1Hash: a1Hash, identical: refPix === a1Hash };

    // B: the cue itself.
    await unforceAlpha(N);
    await N.evaluate("TDProbe.warm(2)");
    await N.evaluate("TDProbe.cap('on')");
    out.B_cue = JSON.parse(await N.evaluate("JSON.stringify(TDProbe.diff('a1','on',0))"));
    await N.evaluate("TDProbe.warm(1)"); await N.evaluate("TDProbe.cap('on2')");
    out.B_null = JSON.parse(await N.evaluate("JSON.stringify(TDProbe.diff('on','on2',0))")).changed;

    // C: the sweep. Cue strength against how much of the body survives.
    await N.evaluate("TDProbe.depopulate()"); await N.evaluate("TDProbe.warm(1)");
    await N.evaluate("TDProbe.cap('empty')");
    await N.evaluate("TDProbe.repopulate()"); await N.evaluate("TDProbe.warm(1)");
    out.C_sweep = [];
    var alphas = [0.85, 0.75, 0.68, 0.62, 0.55, 0.5, 0.4];
    for (var ai = 0; ai < alphas.length; ai++) {
      await forceAlpha(N, alphas[ai]);
      await N.evaluate("TDProbe.warm(2)");
      await N.evaluate("TDProbe.cap('sw')");
      var cue = JSON.parse(await N.evaluate("JSON.stringify(TDProbe.diff('a1','sw',0))"));
      var body = JSON.parse(await N.evaluate("JSON.stringify(TDProbe.diff('sw','empty',0))"));
      out.C_sweep.push({ alpha: alphas[ai], cuePx: cue.changed, cueMaxChan: cue.maxChan,
                         bodyPx: body.changed, bodyMaxChan: body.maxChan,
                         bodyKept: +(body.changed / out.refSilhouette).toFixed(3) });
    }
    await unforceAlpha(N);

    // D: IS TRIANGLE ORDER OBSERVABLE UNDER FADE? suki's two re-exports of
    // enemy-normal differ only in triangle order (multisets identical, 192 of
    // 4032 in different slots). Opaque they are pixel-identical -- measured
    // earlier, 0 px. Faded, buffer order decides compositing, so this is the
    // direct test of the hazard rather than an argument about it.
    var A = fs.readFileSync(path.join(ROOT, "visual-pass", "tmp", "enemy-normal.reexport.js"), "utf8");
    var B = fs.readFileSync(path.join(ROOT, "visual-pass", "tmp", "enemy-normal.reexportB.js"), "utf8");
    out.D_bufferOrder = {};
    for (var camo = 0; camo < 2; camo++) {
      await placeCamo(N, "normal", camo === 1);
      await N.evaluate("TDProbe.reregister(" + JSON.stringify(A) + ")");
      await N.evaluate("TDProbe.warm(2)"); await N.evaluate("TDProbe.cap('ra')");
      await N.evaluate("TDProbe.reregister(" + JSON.stringify(B) + ")");
      await N.evaluate("TDProbe.warm(2)"); await N.evaluate("TDProbe.cap('rb')");
      out.D_bufferOrder[camo ? "faded" : "opaque"] =
        JSON.parse(await N.evaluate("JSON.stringify(TDProbe.diff('ra','rb',0))"));
    }

    // E: the ring, on #game, in a box measured from the body rather than guessed.
    await placeCamo(N, "camo_normal", true);
    await N.evaluate("TDProbe.capUI('ringOn')");
    await N.evaluate("TDProbe.capUI('ringOn2')");
    await N.evaluate("(function(){TDProbe._e.isCamo=false;return 1;})()");
    await N.evaluate("TDProbe.warm(2)"); await N.evaluate("TDProbe.capUI('ringOff')");
    await N.evaluate("(function(){TDProbe._e.isCamo=true;return 1;})()");
    var roi = JSON.parse(await N.evaluate(
      "(function(){var e=TDProbe._e;var s=TDProbe.screenOf(e.pos.x,e.pos.y,0);" +
      " var r=e.radiusPx()*4;" +
      " return JSON.stringify([Math.round(s.x-r),Math.round(s.y-r),Math.round(r*2),Math.round(r*2)]);})()"));
    out.E_ring = {
      roi: roi,
      nullPx: JSON.parse(await N.evaluate(
        "JSON.stringify(TDProbe.diffUI('ringOn','ringOn2',0," + JSON.stringify(roi) + "))")).changed,
      cuePx: JSON.parse(await N.evaluate(
        "JSON.stringify(TDProbe.diffUI('ringOn','ringOff',0," + JSON.stringify(roi) + "))"))
    };

    // F: camo over camo. Two overlapping camo bodies, array order swapped.
    out.F_camoOverCamo = JSON.parse(await N.evaluate(
      "(function(){" +
      "  enemies.length=0;" +
      "  var a=new Enemy(path,1e5,'camo_normal',{routeId:0}); a.laneOffsetUl=0;" +
      "  var b=new Enemy(path,1e5,'camo_normal',{routeId:0}); b.laneOffsetUl=0;" +
      "  a.progress=60; a.refreshPos(); b.progress=60; b.refreshPos();" +
      "  a.pos.x=640; a.pos.y=360; b.pos.x=648; b.pos.y=356;" +
      "  a.isCamo=true; b.isCamo=true;" +
      "  enemies.push(a); enemies.push(b);" +
      "  TDProbe.warm(2); TDProbe.cap('ab');" +
      "  enemies.length=0; enemies.push(b); enemies.push(a);" +
      "  TDProbe.warm(2); TDProbe.cap('ba');" +
      "  return JSON.stringify(TDProbe.diff('ab','ba',0));" +
      "})()"));
  } finally {
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

main().catch(function (e) { console.error("CAMO FADE PROBE FAILED: " + e.stack); process.exit(1); });
