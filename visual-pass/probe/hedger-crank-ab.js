// The Hedger's crank, before and after, for Diego to judge by eye.
//
// NOT another measurement -- the measurements are done and they cannot settle
// whether it reads. What measurement IS used for here is choosing the frame,
// and it is chosen AGAINST the after: the least flattering frame, so that if it
// convinces there it convinces. Staging this to win would waste the judgement
// it is asking for.
//
//   node visual-pass/probe/hedger-crank-ab.js
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");
var crypto = require("crypto");
var cdp = require("./cdp");
var serve = require("./serve");
var identity = require("./model-identity");

var PORT = 8798, DEVTOOLS = 9338;
var GAME_URL = "http://127.0.0.1:" + PORT + "/TD_0.5.0/index.html";
var ROOT = path.resolve(__dirname, "..", "..");
var TMP = path.join(ROOT, "visual-pass", "tmp");
var OUT = path.join(ROOT, "visual-pass", "captures", "hedger-crank");
var MODEL = "enemy-angry";

var SIDES = [
  { tag: "before", commit: "e015ef5" },
  { tag: "after",  commit: "22a8091" }
];

// Camera yaw is set here; "yaw 0" in another rig's notes may be a body-relative
// bearing, so the bearing is CHOSEN BY MEASUREMENT below rather than assumed,
// and the camera yaw that produced it is reported.
var BEARINGS = [
  { tag: "camYaw -90 (board default)", yaw: -Math.PI / 2 },
  { tag: "camYaw -45",                 yaw: -Math.PI / 4 },
  { tag: "camYaw 0",                   yaw: 0 },
  { tag: "camYaw +90",                 yaw: Math.PI / 2 },
  { tag: "camYaw 180",                 yaw: Math.PI }
];

function sh(c) { return cp.execSync(c, { cwd: ROOT }).toString(); }
function md5(b) { return crypto.createHash("md5").update(b).digest("hex"); }
function writePng(f, url) {
  fs.writeFileSync(f, Buffer.from(url.replace(/^data:image\/png;base64,/, ""), "base64"));
  return fs.statSync(f).size;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  SIDES.forEach(function (s) {
    var lf = Buffer.from(sh("git show " + s.commit + ":TD_0.5.0/js/gl/models/" + MODEL + ".js"));
    s.src = lf.toString("utf8");
    // BOTH md5 FORMS. git show yields LF; a checked-out working tree on this
    // repo is CRLF, and that is the hash anyone verifying the file on disk will
    // compute. Quoting only one invites "that is not the file I have".
    s.md5lf = md5(lf);
    s.md5crlf = md5(Buffer.from(s.src.replace(/\r?\n/g, "\r\n"), "utf8"));
    var f = path.join(TMP, "angry-" + s.tag + ".js");
    fs.writeFileSync(f, lf);
    var id = identity.identify(f);
    // Line-ending independent, and the only one that identifies the MODEL.
    s.multiset = id.multiset.slice(0, 12);
    s.triangles = id.triangles;
  });
  if (SIDES[0].multiset === SIDES[1].multiset) {
    throw new Error("both sides are the same model -- no experiment");
  }

  var out = { sides: SIDES.map(function (s) {
    return { tag: s.tag, commit: s.commit, md5crlf: s.md5crlf, md5lf: s.md5lf,
             multiset: s.multiset, triangles: s.triangles };
  }), scan: {}, choice: null, files: [] };

  var server = await new Promise(function (r, j) {
    serve.start(PORT, function (e, s) { e ? j(e) : r(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-crank"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, GAME_URL);
  var S = conn.session;

  try {
    for (var w = 0; w < 80; w++) {
      if (await S.evaluate("typeof startRun === 'function' && typeof GLModels !== 'undefined'")) break;
      await cdp.sleep(250);
    }
    await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe.js"), "utf8"));
    await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe-shoot.js"), "utf8"));
    await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe-groups.js"), "utf8"));
    out.setup = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.setup())"));
    await S.evaluate("TDProbe.camDefault()");
    await S.evaluate("TDProbe.warm(2)");
    out.camera = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.camState())"));

    async function loadSide(s) {
      await S.evaluate("TDProbe.reregister(" + JSON.stringify(s.src) + ")");
      var g = JSON.parse(await S.evaluate(
        "JSON.stringify({groups:TDProbe.groupNames('" + MODEL + "')," +
        " tris:GLModels.triangles('" + MODEL + "')})"));
      if (g.tris !== s.triangles) throw new Error("reregister did not take for " + s.tag);
      if (g.groups.indexOf("crank") < 0) throw new Error("no crank group in " + s.tag);
      return g;
    }

    // Place once; the body never moves again.
    await S.evaluate("TDProbe.place('angry',60)");
    await S.evaluate("(function(){var e=TDProbe._e; e.pos.x=640; e.pos.y=360;" +
      " TDProbe._home.x=640; TDProbe._home.y=360; return 1;})()");

    // crank contribution / crank alone, at one bearing and frame.
    async function fractionAt(k) {
      await S.evaluate("TDProbe.restoreGroups('" + MODEL + "')");
      await S.evaluate("TDProbe.frameAt(" + k + ")");
      await S.evaluate("TDProbe.warm(1)"); await S.evaluate("TDProbe.cap('full')");
      await S.evaluate("TDProbe.suppress('" + MODEL + "','crank',false)");
      await S.evaluate("TDProbe.warm(1)"); await S.evaluate("TDProbe.cap('nocrank')");
      await S.evaluate("TDProbe.suppress('" + MODEL + "','crank',true)");
      await S.evaluate("TDProbe.warm(1)"); await S.evaluate("TDProbe.cap('crankonly')");
      await S.evaluate("enemies.length=0");
      await S.evaluate("TDProbe.warm(1)"); await S.evaluate("TDProbe.cap('empty')");
      await S.evaluate("(function(){enemies.length=0;enemies.push(TDProbe._e);return 1;})()");
      await S.evaluate("TDProbe.restoreGroups('" + MODEL + "')");
      var contrib = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('full','nocrank',0))")).changed;
      var alone = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('crankonly','empty',0))")).changed;
      return { k: k, contribution: contrib, alone: alone,
               fraction: alone ? +(contrib / alone).toFixed(3) : null };
    }

    // ---- STEP 1: find the bearing the defect actually lives at, rather than
    // trusting a yaw label from another rig's convention. juno's signature for
    // the BEFORE model is a per-frame fraction ranging about 0.08 to 0.86.
    await loadSide(SIDES[0]);
    for (var bi = 0; bi < BEARINGS.length; bi++) {
      await S.evaluate("TDProbe.cam({yaw:" + BEARINGS[bi].yaw + "})");
      await S.evaluate("TDProbe.warm(2)");
      var fr = [];
      for (var k = 0; k < 12; k++) fr.push((await fractionAt(k)).fraction);
      var lo = Math.min.apply(null, fr), hi = Math.max.apply(null, fr);
      out.scan[BEARINGS[bi].tag] = { yaw: BEARINGS[bi].yaw, perFrame: fr,
                                     min: lo, max: hi, spread: +(hi - lo).toFixed(3) };
      console.error("  scanned " + BEARINGS[bi].tag + "  min " + lo + " max " + hi);
    }
    // The bearing where the before model's occlusion is worst AND most variable
    // is the one the fix was aimed at.
    var best = null;
    Object.keys(out.scan).forEach(function (t) {
      var s = out.scan[t];
      var score = s.spread + (1 - s.min);      // deep minimum + wide swing
      if (!best || score > best.score) best = { tag: t, score: score, yaw: s.yaw };
    });
    out.chosenBearing = best;

    // ---- STEP 2: both sides, 12 frames, at that bearing.
    await S.evaluate("TDProbe.cam({yaw:" + best.yaw + "})");
    await S.evaluate("TDProbe.warm(2)");
    var per = {};
    for (var si = 0; si < SIDES.length; si++) {
      await loadSide(SIDES[si]);
      var rows = [];
      for (var k2 = 0; k2 < 12; k2++) rows.push(await fractionAt(k2));
      per[SIDES[si].tag] = rows;
    }
    out.perFrame = per;

    // ---- STEP 3: pick the frame AGAINST the after.
    var adv = [], beforeBest = -1, afterWorst = -1;
    for (var f2 = 0; f2 < 12; f2++) {
      adv.push(+(per.after[f2].fraction - per.before[f2].fraction).toFixed(3));
      if (beforeBest < 0 || per.before[f2].fraction > per.before[beforeBest].fraction) beforeBest = f2;
      if (afterWorst < 0 || per.after[f2].fraction < per.after[afterWorst].fraction) afterWorst = f2;
    }
    var minAdv = 0;
    for (var f3 = 1; f3 < 12; f3++) if (adv[f3] < adv[minAdv]) minAdv = f3;
    out.choice = {
      advantagePerFrame: adv,
      frameMinimisingAfterAdvantage: minAdv,
      frameWhereBeforeIsLeastOccluded: beforeBest,
      frameWhereAfterIsLowest: afterWorst,
      criteriaAgree: (minAdv === beforeBest && minAdv === afterWorst)
    };
    var shots = [minAdv];
    if (beforeBest !== minAdv) shots.push(beforeBest);
    if (afterWorst !== minAdv && afterWorst !== beforeBest) shots.push(afterWorst);
    out.choice.framesShot = shots;

    // ---- STEP 4: render. Crop from the measured body box.
    var H = out.setup.gl[1];
    await loadSide(SIDES[1]);
    await S.evaluate("TDProbe.frameAt(" + shots[0] + ")");
    await S.evaluate("TDProbe.warm(1)"); await S.evaluate("TDProbe.cap('box')");
    await S.evaluate("enemies.length=0"); await S.evaluate("TDProbe.warm(1)");
    await S.evaluate("TDProbe.cap('boxempty')");
    await S.evaluate("(function(){enemies.length=0;enemies.push(TDProbe._e);return 1;})()");
    var bb = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.diff('box','boxempty',0))")).bboxGL;
    var m = 12;
    var roi = [bb[0] - m, (H - (bb[1] + bb[3])) - m, bb[2] + m * 2, bb[3] + m * 2];
    out.roi = roi;

    var bF = per.before.map(function (r) { return r.fraction; });
    var aF = per.after.map(function (r) { return r.fraction; });
    var bMin = Math.min.apply(null, bF), bMax = Math.max.apply(null, bF);
    var aMin = Math.min.apply(null, aF), aMax = Math.max.apply(null, aF);
    for (var q = 0; q < shots.length; q++) {
      var K = shots[q];
      var keys = [];
      for (var si2 = 0; si2 < SIDES.length; si2++) {
        await loadSide(SIDES[si2]);
        await S.evaluate("TDProbe.restoreGroups('" + MODEL + "')");
        await S.evaluate("TDProbe.frameAt(" + K + ")");
        await S.evaluate("TDProbe.warm(2)");
        await S.evaluate("TDProbe.cap('shot_" + SIDES[si2].tag + "')");
        keys.push("shot_" + SIDES[si2].tag);
      }
      var why = K === minAdv
        ? "frame " + K + " -- chosen AGAINST the after: it minimises the after's advantage over the before"
        : (K === beforeBest
            ? "frame " + K + " -- the before's BEST frame (least occluded of the twelve)"
            : "frame " + K + " -- the after's WORST frame (lowest crank separation of the twelve)");
      var cam = out.camera;
      for (var sk = 0; sk < 2; sk++) {
        var kk = [1, 8][sk];
        var cap = [
          "HEDGER CRANK -- before / after.  " + why,
          (kk === 1 ? "1:1, exactly the pixels the game drew"
                    : kk + "x nearest-neighbour upscale of the SAME capture (no re-render, no smoothing)"),
          "game camera, fitted: distance " + cam.distance.toFixed(3) + "  target [" +
            cam.target.join(",") + "]  pitch " + cam.pitch.toFixed(4) +
            "  viewport " + cam.viewport[0] + "x" + cam.viewport[1] + "   " + best.tag,
          "before " + SIDES[0].commit + " md5 " + SIDES[0].md5crlf.slice(0, 8) +
            "   after " + SIDES[1].commit + " md5 " + SIDES[1].md5crlf.slice(0, 8) +
            "   (md5 of the checked-out CRLF file; git show gives " +
            SIDES[0].md5lf.slice(0, 8) + " / " + SIDES[1].md5lf.slice(0, 8) + ")",
          // THIS IMAGE'S OWN NUMBERS FIRST, at this bearing, this metric, this
          // frame. juno's figures follow and are ATTRIBUTED, because they were
          // taken with a depth-based front-most metric at her bearing, not with
          // this contribution-over-solo metric at camYaw -45. Presenting them as
          // if they described this view is the same category error the last line
          // warns about, one level down.
          "THIS IMAGE (contribution/solo at " + best.tag + "): crank visible " +
            per.before[K].fraction.toFixed(3) + " -> " + per.after[K].fraction.toFixed(3) +
            " at this frame; across 12 frames before " + bMin.toFixed(2) + "-" + bMax.toFixed(2) +
            ", after " + aMin.toFixed(2) + "-" + aMax.toFixed(2) + ".",
          "OCCLUSION ELIMINATED (juno, depth front-most metric, her bearing): 1.00 at all 12 " +
            "frames, was 0.08-0.86. Share registering when removed 48% -> 86%.",
          "CONTRAST (juno): rendered CR 1.30-1.88 against the hip, worst frame 1.30. NOT COMPARABLE " +
            "to the standard's 2.0 bar -- that threshold was reasoned in PALETTE space, and rendered " +
            "CR reaches only 2.63 even for white on tin at this size and camera.",
          "WHETHER THIS READS IS A JUDGEMENT, NOT A MEASUREMENT.",
          "NOT COVERED: file://, the seven other bearings for the after, the collar interpenetration; " +
            "and juno's figures above are at her bearing and metric, not this image's."
        ];
        var url = await S.evaluate(
          "TDProbe.stripFrom(" + JSON.stringify(keys) + "," +
          JSON.stringify(["BEFORE  " + SIDES[0].commit, "AFTER  " + SIDES[1].commit]) + "," +
          JSON.stringify(roi) + "," + kk + "," + JSON.stringify(cap) + ")", true);
        var file = path.join(OUT, "crank-f" + K + "-" + kk + "x.png");
        out.files.push({ file: file, bytes: writePng(file, url), frame: K, scale: kk });
      }
    }
  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

main().catch(function (e) { console.error("CRANK AB FAILED: " + e.stack); process.exit(1); });
