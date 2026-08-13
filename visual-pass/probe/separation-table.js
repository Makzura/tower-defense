// THE PAIRWISE SEPARATION TABLE, built to extend from nine bodies to fifteen.
//
// SEPARATION RATIO = pairwise changed px / mean own silhouette px, on #gl, at
// the same board spot, same walk frame, same yaw, only the model differing.
// 0 is identical; ~2 is no overlap. This is the SAME metric that produced the
// 0.69 board floor last batch and it is quoted in those units and no others.
//
// Every property below is here because it has already cost someone a result:
//
// - THE NULL CONTROL IS THE POINT. Two separate browser launches of this file
//   must agree BIT FOR BIT on every pair at every bearing. `--compare a.json
//   b.json` does that check and is the go/no-go. If it fails, the rig moved and
//   no number in the table means anything.
//
// - A ZERO IS ONLY EVIDENCE IF SOMETHING ELSE IN THE SAME RUN IS NON-ZERO. Each
//   bearing carries its own in-run null (one body captured twice) and its own
//   solo silhouettes, which are all large and non-zero.
//
// - PLACED ON THE REAL PATH, AND GUARDED WITH A RATIO, NOT A FLOOR. A body
//   behind a rock measures 3 px against the 122 it measures in the clear and
//   passes every `changed > 0` check we own. Each body is measured at the
//   chosen spot AND at two alternates, and the tool THROWS if its chosen-spot
//   silhouette falls under 80% of its own best. A guard that publishes a
//   warning instead of throwing is a guard nobody reads.
//
// - ONE DISCARDED FRAME AFTER EVERY SCENE CHANGE. Warm-up has photographed as
//   7,342 px once.
//
// - THE CAMERA IS RECORDED AND camDefault THROWS on distance 900 / target
//   [0,0,0], which is OrbitCamera's constructor default and is indistinguishable
//   from a real reading in every other field. The fitted view is a property of
//   the VIEWPORT, so the viewport travels with it.
//
// - THE WALK FRAME IS STEPPED IN UNITS OF EACH BODY'S OWN STRIDE. `walk =
//   floor(progress / (radiusPx()*2.6) * frames)` is distance-driven, so a fixed
//   progress step samples a slow or small body at a fraction of the cadence of
//   a fast one. TDProbe.frameAt snaps per body. Three of the six new bodies are
//   the slowest in the game and this is exactly where that bites.
//
//   node visual-pass/probe/separation-table.js > pass1.json
//   node visual-pass/probe/separation-table.js > pass2.json
//   node visual-pass/probe/separation-table.js --compare pass1.json pass2.json
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cdp = require("./cdp");
var serve = require("./serve");

var PORT = 8798, DEVTOOLS = 9338;
var GAME_URL = "http://127.0.0.1:" + PORT + "/TD_0.5.0/index.html";
var FRAME = 0;
var GUARD = 0.80;

// The same three bearings the Easy five were signed off at, so the numbers are
// comparable with the 0.69 floor rather than merely similar-looking.
var BEARINGS = [
  { tag: "front", yaw: -Math.PI / 2 },
  { tag: "three-quarter", yaw: -Math.PI / 2 + 0.7 },
  { tag: "broadside", yaw: 0 }
];

// Candidate spots on the real path. The chosen one and two alternates give
// every body a clear-ground reference to be guarded against.
var SPOTS = [200, 420, 640, 900, 1180, 1450];

// ---------------------------------------------------------------------------
// --compare: the go/no-go. Two independent launches, bit-for-bit.
// ---------------------------------------------------------------------------
function compare(fa, fb) {
  var A = JSON.parse(fs.readFileSync(fa, "utf8"));
  var B = JSON.parse(fs.readFileSync(fb, "utf8"));
  var report = { bearings: {}, identical: 0, differing: 0, missing: 0, verdict: null };
  if (JSON.stringify(A.bodies) !== JSON.stringify(B.bodies)) {
    report.verdict = "FAIL: the two passes measured different body lists";
    console.log(JSON.stringify(report, null, 1));
    process.exit(1);
  }
  BEARINGS.forEach(function (b) {
    var ra = A.bearings[b.tag], rb = B.bearings[b.tag];
    var rows = [];
    if (!ra || !rb) { report.missing++; return; }
    // The camera has to be the same view, checked as a number AND as pixels --
    // 2021.2374 against 2022 is 0.04% and 3,314 changed pixels board-wide.
    var camSame = JSON.stringify(ra.camera) === JSON.stringify(rb.camera);
    Object.keys(ra.pairs).forEach(function (k) {
      var x = ra.pairs[k], y = rb.pairs[k];
      if (!y) { report.missing++; return; }
      // Every measured field, not just the headline. A table that agrees on
      // `changed` and disagrees on the interior split is still a moved rig.
      var same = x.changed === y.changed && x.soloA === y.soloA &&
                 x.soloB === y.soloB && x.interiorPx === y.interiorPx &&
                 x.rimPx === y.rimPx && x.intersection === y.intersection;
      if (same) report.identical++; else report.differing++;
      if (!same) rows.push({ pair: k, changed: [x.changed, y.changed],
                             soloA: [x.soloA, y.soloA], soloB: [x.soloB, y.soloB],
                             interiorPx: [x.interiorPx, y.interiorPx],
                             rimPx: [x.rimPx, y.rimPx],
                             intersection: [x.intersection, y.intersection] });
    });
    report.bearings[b.tag] = { cameraIdentical: camSame, differingPairs: rows };
  });
  report.verdict = (report.differing === 0 && report.missing === 0)
    ? "GO -- " + report.identical + " of " + report.identical + " pair comparisons bit-identical across two browser launches"
    : "NO-GO -- " + report.differing + " differing, " + report.missing + " missing";
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.differing === 0 && report.missing === 0 ? 0 : 1);
}

if (process.argv[2] === "--compare") {
  compare(process.argv[3], process.argv[4]);
}

// ---------------------------------------------------------------------------

async function main() {
  var t0 = Date.now();
  var server = await new Promise(function (res, rej) {
    serve.start(PORT, function (e, s) { e ? rej(e) : res(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-sep-" + process.pid));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, GAME_URL);
  var S = conn.session;
  var E = function (js) { return S.evaluate(js); };
  var J = async function (js) { return JSON.parse(await S.evaluate("JSON.stringify(" + js + ")")); };
  var out = { bearings: {}, timing: {}, guard: { threshold: GUARD, rejected: [] } };

  try {
    for (var i = 0; i < 80; i++) {
      if (await E("typeof startRun === 'function' && typeof World3D !== 'undefined'")) break;
      await cdp.sleep(250);
    }
    await E(fs.readFileSync(path.join(__dirname, "page-probe.js"), "utf8"));
    // For glMask/setStats -- the interior-vs-rim split.
    await E(fs.readFileSync(path.join(__dirname, "page-probe-fractal.js"), "utf8"));
    out.setup = await J("TDProbe.setup()");
    await E("TDProbe.camDefault()");
    out.camera = await J("TDProbe.camState()");

    // PIN THE BOARD CLOCK, AND THIS IS NOT DEFENSIVE TIDYING -- the first
    // two-launch null of this rig came back NO-GO on 27 of 135 comparisons and
    // every single one of them involved `flying`, the one body whose animation
    // is not distance-driven. gl-world takes a walker's frame from
    // `progress/stride` and a FLIER's from `boardClock * HOVER_HZ * frames`,
    // and its lantern glow and vertical bob read the same clock. `worldRenderState().now`
    // is the rAF clock, which is whatever `lastTime` happened to be when the
    // loop was stubbed -- so it differs between browser launches and the Wisp
    // was photographed at a different point of its hover each time (60/62,
    // 63/60, 55/54 px). Every pair involving it moved by 1-5 px; the 108 pairs
    // that did not involve it were bit-identical, which is what identified it.
    //
    // Clock 0 is hover frame 0, which is the same choice as walk frame 0 for
    // the walkers, and it is recorded so a later run can prove it used the same
    // instant rather than assume it.
    out.boardClock = await J("(function(){ return {set: TDProbe.setClock(0)}; })()");
    await E("TDProbe.warm(2)");

    // THE BODY LIST, DISCOVERED AT RUNTIME rather than typed. A model file on
    // disk is not a registered model, and a registered model with no Enemy.TYPES
    // entry cannot be placed. Both halves are required, and both are reported,
    // so the run extends to fifteen the day suki lands the six without an edit
    // here -- and so a body that silently failed to register is visible instead
    // of quietly dropping out of the table.
    var discovery = await J(
      "(function(){var reg=GLModels.names().filter(function(n){return n.indexOf('enemy-')===0;});" +
      " var types=Object.keys(Enemy.TYPES);" +
      " var usable=[],regNoType=[],typeNoReg=[];" +
      " reg.forEach(function(n){var id=n.slice(6);" +
      "   if(Enemy.TYPES[id]) usable.push(id); else regNoType.push(id);});" +
      " types.forEach(function(id){ if(!GLModels.has('enemy-'+id)) typeNoReg.push(id);});" +
      " return {registered:reg, usable:usable.sort(), registeredWithoutType:regNoType," +
      "         typesWithoutModel:typeNoReg};})()");
    out.discovery = discovery;
    var BODIES = discovery.usable;
    out.bodies = BODIES;
    if (BODIES.length < 2) throw new Error("fewer than two meshed bodies to compare");

    for (var bi = 0; bi < BEARINGS.length; bi++) {
      var BEAR = BEARINGS[bi];
      var tb = Date.now();
      await E("TDProbe.camDefault()");
      await E("TDProbe.cam({yaw:" + BEAR.yaw + "})");
      await E("TDProbe.setClock(0)");
      await E("TDProbe.warm(2)");
      var camHere = await J("TDProbe.camState()");
      if (camHere.distance === 900) throw new Error("camera fell back to the constructor default");

      // ---- choose the spot, and guard every body against its own best ----
      var perSpot = {};
      for (var si = 0; si < SPOTS.length; si++) {
        var sp = SPOTS[si];
        perSpot[sp] = {};
        for (var mi = 0; mi < BODIES.length; mi++) {
          var id = BODIES[mi];
          await E("TDProbe.place(" + JSON.stringify(id) + "," + sp + ")");
          await E("TDProbe.frameAt(" + FRAME + ")");
          await E("TDProbe.setClock(0)");
          await E("TDProbe.warm(2)");
          await E("TDProbe.cap('_w'), TDProbe.cap('b')");
          await E("TDProbe.depopulate()");
          await E("TDProbe.cap('_w'), TDProbe.cap('e')");
          await E("TDProbe.repopulate()");
          await E("TDProbe.warm(1)");
          var d = await J("TDProbe.diff('b','e',0)");
          perSpot[sp][id] = { px: d.changed, bboxGL: d.bboxGL,
                              fill: d.bboxGL ? +(d.changed / (d.bboxGL[2] * d.bboxGL[3])).toFixed(3) : 0 };
        }
      }

      // The best spot is the one where the WORST-served body does best -- a
      // spot that is generous to the big bodies and buries a small one is not a
      // fair spot for a pairwise table.
      var bestSpot = null, bestScore = -1;
      SPOTS.forEach(function (sp) {
        var worst = 1e9;
        BODIES.forEach(function (id) {
          var own = Math.max.apply(null, SPOTS.map(function (s2) { return perSpot[s2][id].px; }));
          var r = own ? perSpot[sp][id].px / own : 0;
          if (r < worst) worst = r;
        });
        if (worst > bestScore) { bestScore = worst; bestSpot = sp; }
      });

      // THE GUARD, AND IT THROWS. Every body's silhouette at the chosen spot
      // measured against its own best over the candidates.
      var guardRows = {};
      var failures = [];
      BODIES.forEach(function (id) {
        var own = Math.max.apply(null, SPOTS.map(function (s2) { return perSpot[s2][id].px; }));
        var here = perSpot[bestSpot][id].px;
        var ratio = own ? +(here / own).toFixed(3) : 0;
        guardRows[id] = { atSpot: here, ownBest: own, ratio: ratio,
                          fill: perSpot[bestSpot][id].fill };
        if (ratio < GUARD) failures.push(id + " " + here + "/" + own + " = " + ratio);
      });
      if (failures.length) {
        out.guard.rejected.push({ bearing: BEAR.tag, spot: bestSpot, failures: failures });
        throw new Error("SPOT GUARD FAILED at bearing " + BEAR.tag + ", spot " +
          bestSpot + ": " + failures.join("; ") +
          " -- a body under " + GUARD + " of its own clear silhouette is smothered " +
          "and every pair involving it would be measuring scenery.");
      }

      // ---- capture the lineup, one body at a time, at the chosen spot ----
      //
      // ONE empty board per bearing, captured before any body, and every mask
      // is built against that same frame. Re-capturing it per body would make
      // each mask a claim about a slightly different background; the
      // containment run measured all six empty boards bit-identical, which is
      // what makes reusing one honest rather than merely cheaper.
      await E("TDProbe.depopulate()");
      await E("TDProbe.cap('_w'), TDProbe.cap('empty')");
      await E("TDProbe.repopulate()");
      await E("TDProbe.warm(1)");

      var solo = {}, place = {};
      for (var mj = 0; mj < BODIES.length; mj++) {
        var id2 = BODIES[mj];
        var pl = await J("TDProbe.place(" + JSON.stringify(id2) + "," + bestSpot + ")");
        var fr = await J("TDProbe.frameAt(" + FRAME + ")");
        await E("TDProbe.setClock(0)");
        await E("TDProbe.warm(2)");
        await E("TDProbe.cap('_w'), TDProbe.cap('m:" + id2 + "')");
        await E("TDFractal.glMask('m:" + id2 + "','empty'," + JSON.stringify(id2) + ")");
        var sd = await J("TDProbe.diff('m:" + id2 + "','empty',0)");
        var fc = await E("TDProbe.frameCount()");
        solo[id2] = sd.changed;
        place[id2] = { pos: pl.pos, radius: pl.radius, yaw: fr.yaw, walk: fr.walk,
                       bucket: fr.bucket, frames: fc, silhouette: sd.changed,
                       bboxGL: sd.bboxGL, isFlying: pl.isFlying };
      }

      // Every body yaws with the path, so at one spot they must all share a
      // yaw. Asserted, not assumed -- a yaw label does not survive between rigs.
      var yaws = BODIES.map(function (id) { return place[id].yaw; });
      var sameYaw = yaws.every(function (v) { return v === yaws[0]; });

      // IN-RUN NULL: one body captured twice with nothing changed. The zeros
      // and near-zeros in the table need a proven instrument behind them.
      await E("TDProbe.place(" + JSON.stringify(BODIES[0]) + "," + bestSpot + ")");
      await E("TDProbe.frameAt(" + FRAME + ")");
      await E("TDProbe.setClock(0)");
      await E("TDProbe.warm(2)");
      await E("TDProbe.cap('_w'), TDProbe.cap('nl1')");
      await E("TDProbe.cap('_w'), TDProbe.cap('nl2')");
      var inRunNull = (await J("TDProbe.diff('nl1','nl2',0)")).changed;

      // ---- the pairs ----
      var pairs = {};
      for (var a = 0; a < BODIES.length; a++) {
        for (var b = a + 1; b < BODIES.length; b++) {
          var A = BODIES[a], B = BODIES[b];
          var pd = await J("TDProbe.diff('m:" + A + "','m:" + B + "',0)");
          var mean = (solo[A] + solo[B]) / 2;
          // WHAT KIND OF SEPARATION IS THIS? A single ratio calls a pair that
          // differs in outline and a pair that differs only in paint the same
          // result. Measured on the Stacker's tiers, 43-71% of this metric was
          // repaint INSIDE the region both bodies cover -- spurious there,
          // because it was one object at two sizes. Between two genuinely
          // different bodies the same term is at least partly a real read. It
          // is split here rather than assumed either way.
          var st = await J("TDFractal.setStats(" + JSON.stringify(A) + "," +
            JSON.stringify(B) + ",'m:" + A + "','m:" + B + "')");
          pairs[A + "|" + B] = {
            changed: pd.changed, soloA: solo[A], soloB: solo[B],
            ratio: +(pd.changed / mean).toFixed(3), bboxGL: pd.bboxGL,
            intersection: st.intersection,
            interiorPx: st.changedInsideIntersection,
            rimPx: st.changedTotal - st.changedInsideIntersection,
            interiorShare: st.shadingShareOfMetric,
            intersectionRepainted: st.intersectionRepaintedFraction,
            symmetricDifference: st.symmetricDifference,
            ratioSymmetricDifference: +(st.symmetricDifference / mean).toFixed(3)
          };
        }
      }

      out.bearings[BEAR.tag] = {
        yaw: BEAR.yaw, camera: camHere, spot: bestSpot, spotScore: +bestScore.toFixed(3),
        guard: guardRows, sameYaw: sameYaw, yaws: yaws,
        inRunNull: inRunNull, place: place, pairs: pairs,
        pairCount: Object.keys(pairs).length,
        seconds: +((Date.now() - tb) / 1000).toFixed(1)
      };
      out.timing[BEAR.tag] = out.bearings[BEAR.tag].seconds;
    }

    out.timing.totalSeconds = +((Date.now() - t0) / 1000).toFixed(1);
    out.timing.bodiesMeasured = BODIES.length;
    out.timing.pairsPerBearing = BODIES.length * (BODIES.length - 1) / 2;

  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

main().catch(function (e) {
  console.error("SEPARATION TABLE FAILED: " + e.stack);
  process.exit(1);
});
