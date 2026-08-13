// ---------------------------------------------------------------------------
// The changed-pixel probe. Drives the real game in headless Chrome and returns
// numbers for one enemy type:
//
//   null control          same state twice -> must be exactly 0
//   seam control          progress moved WITHIN one frame bucket -> must be 0
//   model vs no-model     enemy-X registered vs absent (sphere fallback)
//   reversibility         restore the model -> must return to 0 against `with`
//   authored colour       the model's own palette at pixels the model covers,
//                         with the sphere frame scored the same way as control
//   cycle table           every consecutive walk-frame pair, wrap called out
//
// A zero is only evidence if a different capture in the same run is non-zero.
// Every negative below is printed beside its companion positive.
//
//   node visual-pass/probe/model-probe.js enemy-normal enemy-brute
// ---------------------------------------------------------------------------
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cdp = require("./cdp");
var serve = require("./serve");

var PORT = 8793;
var DEVTOOLS = 9333;
var GAME_URL = "http://127.0.0.1:" + PORT + "/TD_0.5.0/index.html";
var ROOT = path.resolve(__dirname, "..", "..");

// The authored palette, read out of the model FILE. GLModels.expand() nulls
// model.raw once the model is expanded, so by capture time there is no authored
// value left in the page to compare a pixel against.
function paletteOf(name) {
  var file = path.join(ROOT, "TD_0.5.0", "js", "gl", "models", name + ".js");
  var fd = fs.openSync(file, "r");
  var buf = Buffer.alloc(8192);
  var n = fs.readSync(fd, buf, 0, 8192, 0);
  fs.closeSync(fd);
  var head = buf.toString("utf8", 0, n);
  var m = /palette:\s*(\[\[[^\]]*\](?:\s*,\s*\[[^\]]*\])*\])/.exec(head);
  if (!m) throw new Error("no palette found in " + name + ".js");
  return JSON.parse(m[1]);
}

function j(v) { return JSON.stringify(v); }

async function main() {
  var types = process.argv.slice(2);
  if (!types.length) types = ["enemy-normal", "enemy-brute"];

  var server = await new Promise(function (res, rej) {
    serve.start(PORT, function (e, s) { e ? rej(e) : res(s); });
  });
  var profile = path.join(os.tmpdir(), "td-probe-profile");
  var chrome = cdp.launch(DEVTOOLS, profile);
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, GAME_URL);
  var S = conn.session;
  var out = { url: GAME_URL, types: {}, env: {} };

  try {
    // Wait for the game's own globals rather than a fixed sleep.
    for (var i = 0; i < 80; i++) {
      var ready = await S.evaluate(
        "typeof startRun === 'function' && typeof World3D !== 'undefined' && typeof GLModels !== 'undefined'");
      if (ready) break;
      await cdp.sleep(250);
    }
    var probeSrc = fs.readFileSync(path.join(__dirname, "page-probe.js"), "utf8");
    await S.evaluate(probeSrc);
    out.env.setup = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.setup())"));

    // Every model the page actually has, so a missing tag is visible as a fact
    // rather than as a quiet sphere.
    out.env.registered = await S.evaluate("GLModels.names().length");

    // CAMERA PROVENANCE. Every magnitude below is quoted at a distance, and it
    // has to be the distance the GAME fits from the board -- not OrbitCamera's
    // constructor default of 900, which is what a probe inherits if it pins the
    // camera itself. Prove the previously-quoted 2022 view and the fitted view
    // are the same view IN PIXELS, not merely in numbers: two camera states
    // agreeing to four decimals can still rasterise differently, and a numeric
    // comparison would not show it.
    await S.evaluate("TDProbe.camDefault()");
    await S.evaluate("TDProbe.warm(2)");
    await S.evaluate("TDProbe.cap('camFitted')");
    await S.evaluate("TDProbe.camHardcoded2022()");
    await S.evaluate("TDProbe.warm(2)");
    await S.evaluate("TDProbe.cap('cam2022')");
    out.env.camera = {
      fitted: out.env.setup.fittedCamera,
      hardcoded2022: JSON.parse(await S.evaluate("JSON.stringify(TDProbe.camState())")),
      fittedVsHardcodedPx: JSON.parse(await S.evaluate(
        "JSON.stringify(TDProbe.diff('camFitted','cam2022',0))")),
      orbitConstructorDefault: 900
    };
    await S.evaluate("TDProbe.camDefault()");
    await S.evaluate("TDProbe.warm(2)");

    for (var t = 0; t < types.length; t++) {
      out.types[types[t]] = await measure(S, types[t]);
      console.error("  done " + types[t]);
    }
  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

async function measure(S, modelName) {
  var typeId = modelName.replace(/^enemy-/, "");
  var R = { model: modelName, typeId: typeId };
  var palette = paletteOf(modelName);
  R.palette = palette;

  await S.evaluate("TDProbe.drop(), TDProbe.camDefault()");
  await S.evaluate("TDProbe.warm(2)");

  // ---- pick a spot: on screen, and on a straight enough run that stepping
  // the walk cycle does not also rotate the body.
  R.spot = JSON.parse(await S.evaluate(
    "(function(){" +
    "  var best=null;" +
    "  var e=new Enemy(path,100,'" + typeId + "',{routeId:0});" +
    "  var stride=e.radiusPx()*2.6;" +
    "  for(var p=60;p<path.length-stride-60;p+=17){" +
    "    e.progress=p; e.refreshPos();" +
    "    var s=TDProbe.screenOf(e.pos.x,e.pos.y,0);" +
    "    if(!s) continue;" +
    "    var c=document.getElementById('gl');" +
    "    if(s.x<120||s.y<120||s.x>c.width-120||s.y>c.height-120) continue;" +
    "    var y0=TDProbe.yawAt(p+0.0001), y1=TDProbe.yawAt(p+stride);" +
    "    var dy=Math.abs(y1-y0);" +
    "    if(best===null||dy<best.dyaw) best={progress:p,screen:s,dyaw:dy};" +
    "    if(dy===0) break;" +
    "  }" +
    "  return JSON.stringify(best);" +
    "})()"));
  if (!R.spot) { R.error = "no on-screen straight spot found"; return R; }

  R.place = JSON.parse(await S.evaluate(
    "JSON.stringify(TDProbe.place('" + typeId + "'," + R.spot.progress + "))"));
  R.finite = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.finite())"));
  // Named on the result, not left implicit in the code. A magnitude without a
  // distance beside it is not a read of anything.
  R.cameraDefault = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.camState())"));
  R.cameraCloseDistance = 190;
  R.frameCount = await S.evaluate("TDProbe.frameCount()");
  R.settleAfterPlace = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.warm(2))"));

  // Park on a definite frame so nothing below depends on where `place` landed.
  var isFlying = R.place.isFlying;
  await S.evaluate(isFlying
    ? "TDProbe.pinGlow(true), TDProbe.setClock(0.5/(2.6*" + R.frameCount + ")), TDProbe.pinBob(true)"
    : "TDProbe.frameAt(0)");
  await S.evaluate("TDProbe.cap('_warm')");         // discard the first frame

  // ---- NULL CONTROL ---------------------------------------------------
  await S.evaluate("TDProbe.cap('n1')");
  await S.evaluate("TDProbe.cap('n2')");
  R.nullControl = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('n1','n2',0))"));

  // ---- SEAM CONTROL: progress changes, frame bucket does not ----------
  // Proves the picture depends on `progress` ONLY through the walk index. If
  // this is non-zero, a cycle table below is measuring translation or yaw as
  // well as articulation.
  if (!isFlying) {
    R.seamControl = JSON.parse(await S.evaluate(
      "(function(){" +
      "  var stride=TDProbe._e.radiusPx()*2.6, n=TDProbe.frameCount();" +
      "  var a=TDProbe.progressTo(0.25*stride/n);" +
      "  TDProbe.cap('_w'); TDProbe.cap('s1');" +
      "  var b=TDProbe.progressTo(0.75*stride/n);" +
      "  TDProbe.cap('_w'); TDProbe.cap('s2');" +
      "  var d=TDProbe.diff('s1','s2',0);" +
      "  return JSON.stringify({a:a,b:b,sameBucket:a.walk===b.walk,diff:d});" +
      "})()"));
  } else {
    R.seamControl = JSON.parse(await S.evaluate(
      "(function(){" +
      "  var n=TDProbe.frameCount(), q=1/(2.6*n);" +
      "  TDProbe.setClock(0.25*q); TDProbe.pinBob(true); var a=TDProbe.walkIndex();" +
      "  TDProbe.cap('_w'); TDProbe.cap('s1');" +
      "  TDProbe.setClock(0.75*q); TDProbe.pinBob(true); var b=TDProbe.walkIndex();" +
      "  TDProbe.cap('_w'); TDProbe.cap('s2');" +
      "  var d=TDProbe.diff('s1','s2',0);" +
      "  return JSON.stringify({a:{walk:a},b:{walk:b},sameBucket:a===b,diff:d});" +
      "})()"));
  }

  // ---- MODEL vs NO MODEL ----------------------------------------------
  await S.evaluate(isFlying
    ? "TDProbe.setClock(0.5/(2.6*" + R.frameCount + ")), TDProbe.pinBob(true)"
    : "TDProbe.frameAt(0)");
  await S.evaluate("TDProbe.cap('_w')");
  await S.evaluate("TDProbe.cap('with')");
  R.seamBefore = await S.evaluate("TDProbe.seam('" + modelName + "')");
  R.hide = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.hideModel('" + modelName + "'))"));
  await S.evaluate("TDProbe.cap('_w')");
  await S.evaluate("TDProbe.cap('without')");
  R.modelVsNoModel = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('with','without',0))"));
  R.countsWithout = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.counts())"));
  await S.evaluate("TDProbe.showModel()");
  R.seamAfter = await S.evaluate("TDProbe.seam('" + modelName + "')");
  await S.evaluate("TDProbe.cap('_w')");
  await S.evaluate("TDProbe.cap('with2')");
  R.reversibility = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('with','with2',0))"));

  // ---- AUTHORED COLOUR --------------------------------------------------
  // At a CLOSE camera. The default board view puts this body in 13x20 px, of
  // which most are antialiased rim, and a palette cannot be resolved out of
  // that -- the first run matched 0 of 189 pixels to the gold or the red and
  // read as a failed mesh. Distance is a property of the assertion, not of the
  // model: "did my mesh rasterise with its own materials" does not have to be
  // asked at game scale, and the diff and cycle numbers above are all taken at
  // the real one.
  R.colour = await colourBlock(S, modelName, palette, isFlying, R.frameCount);

  // ---- CYCLE TABLE -----------------------------------------------------
  R.cycle = await cycleTable(S, R.frameCount, isFlying);

  // THE SAME TABLE AT A CLOSE CAMERA. At the default board view a Wisp is
  // 14x12 px and every step changes about half of it, which is the resolution
  // floor rather than the animation: a shape read out of ~50 changed pixels is
  // not distinguishable from quantisation. The close table says what the cycle
  // DOES; the default-camera table says what a player can see of it. They are
  // different questions and both are reported.
  await S.evaluate(
    "(function(){var e=TDProbe._e;" +
    " TDProbe.cam({target:[e.pos.x,e.pos.y,0],distance:190,pitch:0.30,yaw:-1.5707963267948966});" +
    " return 1;})()");
  R.cycleCloseSettle = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.warm(2))"));
  // The same within-bucket control, re-taken at this camera: it is what proves
  // the table is the frame index and not some other consumer of the drive.
  R.seamControlClose = JSON.parse(await S.evaluate(isFlying
    ? "(function(){var n=TDProbe.frameCount(),q=1/(2.6*n);" +
      " TDProbe.setClock(0.25*q);TDProbe.pinBob(true);var a=TDProbe.walkIndex();" +
      " TDProbe.cap('_w');TDProbe.cap('t1');" +
      " TDProbe.setClock(0.75*q);TDProbe.pinBob(true);var b=TDProbe.walkIndex();" +
      " TDProbe.cap('_w');TDProbe.cap('t2');" +
      " return JSON.stringify({sameBucket:a===b,diff:TDProbe.diff('t1','t2',0)});})()"
    : "(function(){var st=TDProbe._e.radiusPx()*2.6,n=TDProbe.frameCount();" +
      " var base=Math.round(TDProbe._home.progress/st)*st;" +
      " var a=TDProbe.progressTo(base+0.25*st/n); TDProbe.cap('_w');TDProbe.cap('t1');" +
      " var b=TDProbe.progressTo(base+0.75*st/n); TDProbe.cap('_w');TDProbe.cap('t2');" +
      " return JSON.stringify({sameBucket:a.walk===b.walk,diff:TDProbe.diff('t1','t2',0)});})()"));
  R.cycleClose = await cycleTable(S, R.frameCount, isFlying);
  R.cycleCloseShuffled = await permutedTable(S, R.frameCount, 2, 5);
  await S.evaluate("TDProbe.camDefault()");
  await S.evaluate("TDProbe.warm(2)");

  // A known-bad sequence, so the table is shown to be able to fail. The frames
  // f0..f(n-1) are already captured; this re-diffs a PERMUTED order of the same
  // captures, which is a real measurement of a wrong sequence and not an
  // arithmetic rearrangement of the right one.
  R.cycleShuffled = await permutedTable(S, R.frameCount, 2, 5);

  return R;
}

// Three frames at a close camera: mesh, sphere, and an EMPTY board. The mesh's
// silhouette is (mesh XOR empty), eroded by one pixel; the sphere's is
// (sphere XOR empty). Each is then scored against the SAME authored palette.
async function colourBlock(S, modelName, palette, isFlying, n) {
  var out = {};
  await S.evaluate(
    "(function(){var e=TDProbe._e;" +
    " TDProbe.cam({target:[e.pos.x,e.pos.y,0],distance:190,pitch:0.30,yaw:-1.5707963267948966});" +
    " return 1;})()");
  out.settle = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.warm(2))"));
  await S.evaluate(isFlying
    ? "TDProbe.setClock(" + (0.5 / (2.6 * n)) + "), TDProbe.pinBob(true), TDProbe.pinGlow(true)"
    : "TDProbe.frameAt(0)");

  await S.evaluate("TDProbe.showModel()");
  await S.evaluate("TDProbe.cap('_w')"); await S.evaluate("TDProbe.cap('cMesh')");
  await S.evaluate("TDProbe.hideModel('" + modelName + "')");
  await S.evaluate("TDProbe.cap('_w')"); await S.evaluate("TDProbe.cap('cSphere')");
  await S.evaluate("TDProbe.showModel()");
  await S.evaluate("TDProbe.depopulate()");
  await S.evaluate("TDProbe.cap('_w')"); await S.evaluate("TDProbe.cap('cEmpty')");
  await S.evaluate("TDProbe.repopulate()");

  // The close-camera diff, so the colour numbers carry their own positive.
  out.meshVsSphere = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('cMesh','cSphere',0))"));
  out.meshVsEmpty = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('cMesh','cEmpty',0))"));
  out.sphereVsEmpty = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('cSphere','cEmpty',0))"));

  out.meshMask = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.silhouette('cMesh','cEmpty',true))"));
  out.sphereMask = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.silhouette('cSphere','cEmpty',true))"));

  out.mesh = JSON.parse(await S.evaluate(
    "JSON.stringify(TDProbe.paletteOnMask('cMesh','cMesh'," + j(palette) + ",0.06))"));
  out.sphereControl = JSON.parse(await S.evaluate(
    "JSON.stringify(TDProbe.paletteOnMask('cSphere','cSphere'," + j(palette) + ",0.06))"));
  // The board with no body on it, scored the same way: the noise floor for
  // "these pixels happen to lie on an authored ray".
  out.boardControl = JSON.parse(await S.evaluate(
    "JSON.stringify(TDProbe.paletteOnMask('cEmpty','cMesh'," + j(palette) + ",0.06))"));

  await S.evaluate("TDProbe.camDefault()");
  await S.evaluate("TDProbe.warm(2)");
  return out;
}

async function cycleTable(S, n, isFlying) {
  var keys = [];
  for (var k = 0; k < n; k++) {
    if (isFlying) {
      await S.evaluate("TDProbe.setClock(" + ((k + 0.5) / (2.6 * n)) + "), TDProbe.pinBob(true), TDProbe.pinGlow(true)");
    } else {
      await S.evaluate("TDProbe.frameAt(" + k + ")");
    }
    var w = await S.evaluate("TDProbe.walkIndex()");
    // The yaw a walker draws with is recomputed from `progress` on EVERY draw,
    // so a cycle table that steps progress can be measuring rotation rather
    // than articulation. Record it per capture and let the caller see whether
    // it held.
    var yw = await S.evaluate("TDProbe.yawAt(TDProbe._e.progress)");
    var px = await S.evaluate("TDProbe._e.pos.x + ',' + TDProbe._e.pos.y");
    await S.evaluate("TDProbe.cap('_w')");
    await S.evaluate("TDProbe.cap('f" + k + "')");
    keys.push({ k: k, walk: w, bucket: w % n, yaw: yw, pos: px });
  }
  var yaws = keys.map(function (q) { return q.yaw; });
  var poss = keys.map(function (q) { return q.pos; });
  var steps = [];
  for (var i = 0; i < n; i++) {
    var a = "f" + i, b = "f" + ((i + 1) % n);
    var d = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('" + a + "','" + b + "',0))"));
    steps.push({ pair: i + "->" + ((i + 1) % n), wrap: (i === n - 1),
                 changed: d.changed, maxChan: d.maxChan, bboxGL: d.bboxGL });
  }
  var interior = steps.filter(function (s) { return !s.wrap; }).map(function (s) { return s.changed; });
  var wrap = steps[steps.length - 1].changed;
  var mean = interior.reduce(function (a2, b2) { return a2 + b2; }, 0) / interior.length;
  return {
    frames: n, walkIndices: keys,
    // Both must be true or the table is not measuring articulation alone.
    yawHeld: yaws.every(function (v) { return v === yaws[0]; }),
    posHeld: poss.every(function (v) { return v === poss[0]; }),
    bucketsDistinct: (function () {
      var s = {}; keys.forEach(function (q) { s[q.bucket] = 1; });
      return Object.keys(s).length === n;
    })(),
    steps: steps,
    interiorMin: Math.min.apply(null, interior),
    interiorMean: +mean.toFixed(1),
    interiorMax: Math.max.apply(null, interior),
    wrap: wrap,
    wrapOverMean: +(wrap / mean).toFixed(2),
    deadPairs: steps.filter(function (s) { return s.changed === 0; }).map(function (s) { return s.pair; })
  };
}

// The known-bad positive control. Swap two frames in the ORDER and re-diff the
// pairs that order produces. A gate that has never failed is not known to be
// able to fail.
async function permutedTable(S, n, a, b) {
  if (n < 6) return { skipped: "fewer than 6 frames" };
  var order = [];
  for (var i = 0; i < n; i++) order.push(i);
  var tmp = order[a]; order[a] = order[b]; order[b] = tmp;
  var steps = [];
  for (var s = 0; s < n; s++) {
    var x = order[s], y = order[(s + 1) % n];
    var d = JSON.parse(await S.evaluate(
      "JSON.stringify(TDProbe.diff('f" + x + "','f" + y + "',0))"));
    steps.push({ pair: x + "->" + y, wrap: (s === n - 1), changed: d.changed });
  }
  var interior = steps.filter(function (q) { return !q.wrap; })
                      .map(function (q) { return q.changed; });
  var mean = interior.reduce(function (p, q) { return p + q; }, 0) / interior.length;
  return { order: order, swapped: [a, b], steps: steps,
           interiorMin: Math.min.apply(null, interior),
           interiorMean: +mean.toFixed(1),
           interiorMax: Math.max.apply(null, interior),
           wrap: steps[steps.length - 1].changed,
           wrapOverMean: +(steps[steps.length - 1].changed / mean).toFixed(2) };
}

main().catch(function (e) { console.error("PROBE FAILED: " + e.stack); process.exit(1); });
