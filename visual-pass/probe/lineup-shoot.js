// The read test: do the five Easy bodies read as different enemies ON THE
// BOARD, at the camera the game actually uses?
//
// They share ~88% of their geometry, so no single model answers it and the
// COMPARISON is the deliverable. Everything here is captured from the running
// game at the fitted camera (distance ~2021.24, target [640,360,0]) -- never
// re-rendered closer to make a bigger picture. The magnified images are
// integer nearest-neighbour upscales of the SAME pixels as the 1:1.
//
//   node visual-pass/probe/lineup-shoot.js
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var crypto = require("crypto");
var cdp = require("./cdp");
var serve = require("./serve");
var identity = require("./model-identity");

var PORT = 8796, DEVTOOLS = 9336;
var GAME_URL = "http://127.0.0.1:" + PORT + "/TD_0.5.0/index.html";
var ROOT = path.resolve(__dirname, "..", "..");
var OUT = path.join(ROOT, "visual-pass", "captures", "easy-five");

// Lena's names beside the type ids, because the roster in js/enemy.js still
// carries the old generic displayNames and a picture labelled "Angry" is not
// the picture anyone asked to see.
var BODIES = [
  { typeId: "normal",  name: "Gleaner" },
  { typeId: "armored", name: "Drudge"  },
  { typeId: "fast",    name: "Skimmer" },
  { typeId: "slow",    name: "Tun"     },
  { typeId: "angry",   name: "Hedger"  }
];

function sh(cmd) {
  return require("child_process").execSync(cmd, { cwd: ROOT }).toString().trim();
}

function writePng(file, dataUrl) {
  var b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
  return fs.statSync(file).size;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // PROVENANCE FIRST, AND IT IS NOT OPTIONAL. Two people have already measured
  // a superseded Hedger; a picture silently showing the old crank would be the
  // same failure with an image attached. Hash proves the file did not move
  // during the shoot; the multiset digest identifies the MODEL, which a hash
  // cannot -- re-exporting unchanged source gives a new hash every time.
  var prov = BODIES.map(function (b) {
    var f = path.join(ROOT, "TD_0.5.0", "js", "gl", "models", "enemy-" + b.typeId + ".js");
    var id = identity.identify(f);
    return {
      typeId: b.typeId, name: b.name, md5: id.md5,
      multiset: id.multiset.slice(0, 12), triangles: id.triangles,
      commit: sh('git log --oneline -1 -- "TD_0.5.0/js/gl/models/enemy-' + b.typeId + '.js"').split(" ")[0]
    };
  });
  var dirty = sh("git status --porcelain TD_0.5.0/js");
  if (dirty) throw new Error("TD_0.5.0/js is dirty -- refusing to shoot:\n" + dirty);

  var server = await new Promise(function (res, rej) {
    serve.start(PORT, function (e, s) { e ? rej(e) : res(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-shoot"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, GAME_URL);
  var S = conn.session;
  var out = { provenance: prov, files: [], measurements: {} };

  try {
    for (var w = 0; w < 80; w++) {
      if (await S.evaluate("typeof startRun === 'function' && typeof GLModels !== 'undefined'")) break;
      await cdp.sleep(250);
    }
    await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe.js"), "utf8"));
    await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe-shoot.js"), "utf8"));
    var setup = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.setup())"));
    await S.evaluate("TDProbe.camDefault()");   // throws on 900/[0,0,0]
    await S.evaluate("TDProbe.warm(2)");
    out.camera = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.camState())"));
    out.glCanvas = setup.gl;

    var stamp = "commits " + prov.map(function (p) { return p.name + " " + p.commit; }).join("  ");
    var camLine = "game camera, fitted: distance " + out.camera.distance.toFixed(3) +
      "  target [" + out.camera.target.join(",") + "]  pitch " + out.camera.pitch.toFixed(4);

    // ---- TWO YAWS. The Drudge's separator is a profile change and the
    // Hedger's arm is a broken-symmetry read; a single head-on view would
    // understate both, and choosing the flattering one is not my call.
    var YAWS = [
      { tag: "front", yaw: -Math.PI / 2, label: "yaw -90deg (the board default)" },
      { tag: "three-quarter", yaw: -Math.PI / 2 + 0.7, label: "yaw -50deg (three-quarter)" }
    ];

    // PLACE THEM ON THE ROAD, NOT ON A RULER.
    //
    // The first version of this laid the five out on an evenly spaced line
    // across the board (x = 300 + i*170, y = 360) because that photographs
    // tidily. The Drudge landed behind scenery: its silhouette came out **3 px**
    // against the 122 px it measures standing in the clear, and the picture
    // would have read as "the Drudge does not register on the board" when the
    // truth was "the Drudge was behind a rock". A comparison image is exactly
    // where that mistake is invisible.
    //
    // The road is guaranteed clear of scenery by construction, so the spots are
    // taken from the real path and only kept when they are far enough apart on
    // SCREEN to not overlap.
    var specs = JSON.parse(await S.evaluate(
      "(function(){" +
      "  var picks=[], last=null;" +
      "  for(var p=40;p<path.length-40;p+=6){" +
      "    var e=new Enemy(path,1,'normal',{routeId:0}); e.laneOffsetUl=0;" +
      "    e.progress=p; e.refreshPos();" +
      "    var s=TDProbe.screenOf(e.pos.x,e.pos.y,0); if(!s) continue;" +
      "    var c=document.getElementById('gl');" +
      "    if(s.x<90||s.y<90||s.x>c.width-90||s.y>c.height-110) continue;" +
      "    if(last && Math.abs(s.x-last)<74) continue;" +
      "    picks.push({progress:p, x:e.pos.x, y:e.pos.y, sx:Math.round(s.x), sy:Math.round(s.y)});" +
      "    last=s.x;" +
      "  }" +
      "  return JSON.stringify(picks);" +
      "})()"));
    if (specs.length < BODIES.length) {
      throw new Error("only " + specs.length + " clear road spots at yaw " + Y.tag);
    }
    // Spread the five across whatever clear run exists rather than bunching
    // them at its start.
    var step = (specs.length - 1) / (BODIES.length - 1);
    specs = BODIES.map(function (b, i) {
      var s = specs[Math.round(i * step)];
      return { typeId: b.typeId, x: s.x, y: s.y };
    });

    // ---- SOLO SILHOUETTES FIRST, on clear ground at one fixed spot.
    // These are both the separation baseline and the yardstick the lineup's
    // occlusion check is measured against, so they have to exist before any
    // group shot is trusted.
    var soloPx = {};
    for (var pi = 0; pi < YAWS.length; pi++) {
      await S.evaluate("TDProbe.cam({yaw:" + YAWS[pi].yaw + "})");
      soloPx[YAWS[pi].tag] = {};
      for (var bi0 = 0; bi0 < BODIES.length; bi0++) {
        await S.evaluate("TDProbe.lineup(" +
          JSON.stringify([{ typeId: BODIES[bi0].typeId, x: 640, y: 360 }]) + ", 0, 60)");
        await S.evaluate("TDProbe.warm(2)");
        await S.evaluate("TDProbe.cap('p_" + YAWS[pi].tag + "_" + BODIES[bi0].typeId + "')");
      }
      await S.evaluate("enemies.length = 0");
      await S.evaluate("TDProbe.warm(2)");
      await S.evaluate("TDProbe.cap('p_" + YAWS[pi].tag + "_empty')");
      for (var bi1 = 0; bi1 < BODIES.length; bi1++) {
        soloPx[YAWS[pi].tag][BODIES[bi1].typeId] = JSON.parse(await S.evaluate(
          "JSON.stringify(TDProbe.diff('p_" + YAWS[pi].tag + "_" + BODIES[bi1].typeId +
          "','p_" + YAWS[pi].tag + "_empty',0))")).changed;
      }
    }
    out.measurements.soloSilhouettePx = soloPx;

    for (var yi = 0; yi < YAWS.length; yi++) {
      var Y = YAWS[yi];
      await S.evaluate("TDProbe.cam({yaw:" + Y.yaw + "})");
      await S.evaluate("TDProbe.warm(2)");
      var line = JSON.parse(await S.evaluate(
        "JSON.stringify(TDProbe.lineup(" + JSON.stringify(specs) + ", 0, 60))"));
      await S.evaluate("TDProbe.warm(2)");
      var boxes = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.lineupBoxes())"));
      out.measurements[Y.tag] = { lineup: line, boxes: boxes };

      // EVERY BODY MUST BE AS VISIBLE HERE AS IT IS STANDING ALONE.
      //
      // "changed > 0" is not enough -- the Drudge scored 3 px from behind
      // scenery and would have passed a non-zero check. Each body is compared
      // against its own clear-ground silhouette, measured separately below, and
      // anything under 80% of it means the lineup is hiding a body rather than
      // showing it.
      var hidden = boxes.filter(function (b) {
        var solo = soloPx[Y.tag][b.typeId] || 1;
        b.soloPx = solo;
        b.visibleFraction = +(b.changed / solo).toFixed(3);
        return b.visibleFraction < 0.8;
      });
      out.measurements[Y.tag].allBodiesClear = hidden.length === 0;
      if (hidden.length) {
        throw new Error("occluded in lineup at yaw " + Y.tag + ": " +
          hidden.map(function (b) {
            return b.typeId + " " + b.changed + "/" + b.soloPx + " px";
          }).join(", ") + " -- refusing to publish a picture that hides a body");
      }
      // Same frame index and same yaw across all five, asserted not assumed.
      var walks = line.map(function (l) { return l.walk; });
      var yaws = line.map(function (l) { return l.yaw; });
      out.measurements[Y.tag].sameFrame = walks.every(function (v) { return v === walks[0]; });
      out.measurements[Y.tag].sameYaw = yaws.every(function (v) { return v === yaws[0]; });

      // Crop from the measured boxes, converted GL(bottom-up) -> screen(top-down).
      var H = out.glCanvas[1];
      var minX = 1e9, maxX = -1e9, minYs = 1e9, maxYs = -1e9;
      boxes.forEach(function (b) {
        var x0 = b.bboxGL[0], y0gl = b.bboxGL[1], bw = b.bboxGL[2], bh = b.bboxGL[3];
        var yTop = H - (y0gl + bh);
        if (x0 < minX) minX = x0;
        if (x0 + bw > maxX) maxX = x0 + bw;
        if (yTop < minYs) minYs = yTop;
        if (yTop + bh > maxYs) maxYs = yTop + bh;
      });
      var pad = 14;
      var roi = [Math.max(0, minX - pad), Math.max(0, minYs - pad),
                 (maxX - minX) + pad * 2, (maxYs - minYs) + pad * 2];
      out.measurements[Y.tag].roi = roi;

      await S.evaluate("TDProbe.warm(1)");
      await S.evaluate("TDProbe.cap('shot_" + Y.tag + "')");

      var names = BODIES.map(function (b) { return b.name; }).join("   ");
      for (var si = 0; si < 3; si++) {
        var k = [1, 4, 8][si];
        var cap = [
          "THE FIVE EASY BODIES -- " + names,
          k === 1 ? "1:1, exactly the pixels the game drew" :
            k + "x nearest-neighbour upscale of the SAME capture (no re-render, no smoothing)",
          camLine + "   " + Y.label,
          "walk frame 0 on all five   lane offset pinned to 0   crop " + JSON.stringify(roi),
          stamp
        ];
        var url = await S.evaluate(
          "TDProbe.pngFrom('shot_" + Y.tag + "'," + JSON.stringify(roi) + "," + k + "," +
          JSON.stringify(cap) + ")");
        var f = path.join(OUT, "five-" + Y.tag + "-" + k + "x.png");
        out.files.push({ file: f, bytes: writePng(f, url), yaw: Y.tag, scale: k });
      }
    }

    // ---- THE HEDGER'S CRANK AT ITS EXTREMES ----------------------------
    await S.evaluate("TDProbe.cam({yaw:" + (-Math.PI / 2 + 0.7) + "})");
    await S.evaluate("TDProbe.warm(2)");
    await S.evaluate("TDProbe.lineup(" + JSON.stringify([{ typeId: "angry", x: 640, y: 360 }]) + ", 0, 60)");
    await S.evaluate("TDProbe.warm(2)");
    var hb = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.lineupBoxes())"));
    var H2 = out.glCanvas[1];
    var b0 = hb[0].bboxGL;
    var hroi = [b0[0] - 14, (H2 - (b0[1] + b0[3])) - 12, b0[2] + 28, b0[3] + 24];
    out.measurements.hedger = { box: hb[0], roi: hroi, frames: {} };
    for (var fi = 0; fi < 3; fi++) {
      var fk = [0, 3, 6][fi];
      var fr = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.lineupFrame(" + fk + ", 60))"));
      out.measurements.hedger.frames["f" + fk] = fr;
      await S.evaluate("TDProbe.warm(1)");
      await S.evaluate("TDProbe.cap('hedger" + fk + "')");
      var hcap = [
        "HEDGER (enemy-angry) -- crank at frame " + fk + " of 12",
        "8x nearest-neighbour upscale of the game capture (no re-render, no smoothing)",
        camLine + "   yaw -50deg (three-quarter)",
        "frames 0 and 6 are the two ends of the crank's travel",
        "enemy-angry  commit " + prov[4].commit + "  md5 " + prov[4].md5.slice(0, 12)
      ];
      var hurl = await S.evaluate(
        "TDProbe.pngFrom('hedger" + fk + "'," + JSON.stringify(hroi) + ",8," +
        JSON.stringify(hcap) + ")");
      var hf = path.join(OUT, "hedger-crank-f" + fk + "-8x.png");
      out.files.push({ file: hf, bytes: writePng(hf, hurl), frame: fk, scale: 8 });
    }
    // How much the crank actually moves between the two ends, in board pixels.
    out.measurements.hedger.f0VsF6 = JSON.parse(await S.evaluate(
      "JSON.stringify(TDProbe.diff('hedger0','hedger6',0))"));
    out.measurements.hedger.f0VsF3 = JSON.parse(await S.evaluate(
      "JSON.stringify(TDProbe.diff('hedger0','hedger3',0))"));

    // ---- THE SEPARATION NUMBER -----------------------------------------
    // "Does it read as a different enemy" made quantitative: each body at the
    // SAME spot on clear ground, same frame, same yaw, diffed pairwise. Only
    // the model differs. Reuses the solo captures taken above rather than
    // re-shooting them, so the separation numbers and the occlusion yardstick
    // are the same pixels.
    var sep = {};
    for (var ti = 0; ti < YAWS.length; ti++) {
      var tg = YAWS[ti].tag, pairs = {};
      for (var a = 0; a < BODIES.length; a++) {
        for (var b2 = a + 1; b2 < BODIES.length; b2++) {
          pairs[BODIES[a].name + " vs " + BODIES[b2].name] = JSON.parse(await S.evaluate(
            "JSON.stringify(TDProbe.diff('p_" + tg + "_" + BODIES[a].typeId +
            "','p_" + tg + "_" + BODIES[b2].typeId + "',0))")).changed;
        }
      }
      sep[tg] = pairs;
    }
    out.measurements.separation = sep;

    // ---- THE COMPARISON STRIP: the headline image ----------------------
    // Same spot, same frame, same yaw, same crop -- only the model differs.
    // The board shot above shows them in situ but at five different depths,
    // so a body there can look distinct for being nearer rather than for
    // being different. This is the fair comparison.
    for (var sy = 0; sy < YAWS.length; sy++) {
      var tag = YAWS[sy].tag;
      var union = null;
      for (var u = 0; u < BODIES.length; u++) {
        var bx = JSON.parse(await S.evaluate(
          "JSON.stringify(TDProbe.diff('p_" + tag + "_" + BODIES[u].typeId +
          "','p_" + tag + "_empty',0))")).bboxGL;
        if (!union) union = bx.slice();
        else {
          var x1 = Math.max(union[0]+union[2], bx[0]+bx[2]);
          var y1 = Math.max(union[1]+union[3], bx[1]+bx[3]);
          union[0] = Math.min(union[0], bx[0]); union[1] = Math.min(union[1], bx[1]);
          union[2] = x1 - union[0]; union[3] = y1 - union[1];
        }
      }
      var H3 = out.glCanvas[1], m = 10;
      var sroi = [union[0]-m, (H3-(union[1]+union[3]))-m, union[2]+m*2, union[3]+m*2];
      out.measurements["stripRoi_" + tag] = sroi;
      var keys = BODIES.map(function(b){ return "p_" + tag + "_" + b.typeId; });
      var labs = BODIES.map(function(b){ return b.name; });
      for (var sk = 0; sk < 2; sk++) {
        var kk = [4, 8][sk];
        var scap = [
          "THE FIVE EASY BODIES -- same board spot, same walk frame, same yaw. Only the model differs.",
          kk + "x nearest-neighbour upscale of the game capture (no re-render, no smoothing). Each tile is " + sroi[2] + "x" + sroi[3] + " real pixels.",
          camLine + "   " + YAWS[sy].label,
          "walk frame 0   lane offset pinned to 0   board spot [640,360]",
          stamp
        ];
        var surl = await S.evaluate(
          "TDProbe.stripFrom(" + JSON.stringify(keys) + "," + JSON.stringify(labs) + "," +
          JSON.stringify(sroi) + "," + kk + "," + JSON.stringify(scap) + ")", true);
        var sf = require("path").join(OUT, "strip-" + tag + "-" + kk + "x.png");
        out.files.push({ file: sf, bytes: writePng(sf, surl), yaw: tag, scale: kk, kind: "strip" });
      }
    }

  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }

  // Hash again after the shoot: proves nothing moved under us mid-run.
  out.provenanceAfter = BODIES.map(function (b) {
    var f = path.join(ROOT, "TD_0.5.0", "js", "gl", "models", "enemy-" + b.typeId + ".js");
    return { typeId: b.typeId, md5: crypto.createHash("md5")
      .update(fs.readFileSync(f)).digest("hex") };
  });
  console.log(JSON.stringify(out, null, 1));
}

main().catch(function (e) { console.error("SHOOT FAILED: " + e.stack); process.exit(1); });
