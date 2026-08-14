// COURIER (enemy-shielded) AGAINST DRUDGE (enemy-armored), IN THE RUNNING GAME.
//
// A re-export is waiting on this. The argument it settles is currently made
// entirely of projections from the authoring rasteriser -- "0.2 px of rendered
// height where the brief predicted 1.0", "footprint aspect 1.69 against 1.06".
// Both models are registered and on screen, so none of that needs projecting.
//
// WHAT THIS MEASURES THAT A REST-FRAME TABLE CANNOT. These are two bipeds of
// similar height and the parts that distinguish them are close to the parts
// that move, so the whole walk cycle is sampled rather than frame 0. A single
// walk frame is worth ~13% of a silhouette on this board; a pair judged at rest
// is judged at one arbitrary point of that.
//
// BOTH COLUMNS, ALWAYS, AND NEITHER IS "THE" METRIC (kaz):
//   OUTLINE = (gained + vacated) / mean own silhouette. What a MODEL controls;
//             survives a palette change, a lighting change and a fade.
//   COUNT   = changed px / mean own silhouette. What a PLAYER sees, including
//             renderer cues that are not the mesh's doing.
// A pair can be 0.000 on one and 1.000 on the other and both be true -- the
// Cooper and the Gleaner are exactly that. Reported side by side, no threshold.
//
// THE INTERIOR/RIM SPLIT IS LOAD-BEARING HERE, not decoration. If the Drudge is
// nearly all wash against the Courier as well as against the Gleaner (0.110
// outline), the Drudge is the problem body and tuning the Courier fixes
// nothing. That changes which model gets rebuilt, so it is measured rather
// than inferred.
//
//   node visual-pass/probe/courier-drudge-probe.js
"use strict";
var fs = require("fs"), path = require("path"), os = require("os");
var cdp = require("./cdp"), serve = require("./serve");

var PORT = 8813, DEVTOOLS = 9353;
var GAME_URL = "http://127.0.0.1:" + PORT + "/TD_0.5.0/index.html";
// Pair from argv, so the same rig serves Courier/Drudge and Tender/Drudge
// rather than a second copy drifting away from this one.
var A = process.argv[2] || "shielded";      // Courier by default
var B = process.argv[3] || "armored";       // Drudge
var GUARD = 0.80;
var SPOTS = [120, 200, 300, 420, 540, 640, 760, 900, 1030, 1180, 1300, 1450, 1600, 1750, 1870];
var BEARINGS = [
  { tag: "front", yaw: -Math.PI / 2 },
  { tag: "three-quarter", yaw: -Math.PI / 2 + 0.7 },
  { tag: "broadside", yaw: 0 }
];

async function main() {
  var server = await new Promise(function (r, j) {
    serve.start(PORT, function (e, s) { e ? j(e) : r(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-courier"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, GAME_URL);
  var S = conn.session;
  var E = function (js) { return S.evaluate(js); };
  var J = async function (js) { return JSON.parse(await S.evaluate("JSON.stringify(" + js + ")")); };
  var out = { pair: [A, B], bearings: {}, guard: { threshold: GUARD } };
  global.__partial = out;

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

    out.registered = await J(
      "({a: GLModels.has('enemy-" + A + "'), b: GLModels.has('enemy-" + B + "')," +
      "  aType: !!Enemy.TYPES." + A + ", bType: !!Enemy.TYPES." + B + "})");
    if (!out.registered.a || !out.registered.b) throw new Error("both models must be registered");

    var ALL = await J(
      "GLModels.names().filter(function(n){return n.indexOf('enemy-')===0;})" +
      " .map(function(n){return n.slice(6);}).filter(function(id){return !!Enemy.TYPES[id];}).sort()");
    out.board = ALL;

    async function silhouetteAt(id, spot, frame) {
      await E("TDProbe.place(" + JSON.stringify(id) + "," + spot + ")");
      await E("TDProbe.frameAt(" + frame + ")");
      await E("TDProbe.setClock(0)");
      await E("TDProbe.warm(2)");
      await E("TDProbe.cap('_w'), TDProbe.cap('t')");
      await E("TDProbe.depopulate()");
      await E("TDProbe.cap('_w'), TDProbe.cap('te')");
      await E("TDProbe.repopulate()");
      await E("TDProbe.warm(1)");
      return await J("TDProbe.diff('t','te',0)");
    }

    for (var bi = 0; bi < BEARINGS.length; bi++) {
      var BEAR = BEARINGS[bi];
      await E("TDProbe.camDefault()");
      await E("TDProbe.cam({yaw:" + BEAR.yaw + "})");
      await E("TDProbe.setClock(0)");
      await E("TDProbe.warm(2)");
      var camHere = await J("TDProbe.camState()");
      if (camHere.distance === 900) throw new Error("camera fell back to the constructor default");

      // ---- a spot that serves BOTH headline bodies -------------------------
      // The eleven-body consensus spot smothered the Courier at broadside
      // (0.739). A standalone pair needs only a spot clear for its own two, so
      // it is chosen for them -- and every other body is then guard-checked
      // rather than assumed, with failures EXCLUDED and named.
      var scan = {};
      for (var si = 0; si < SPOTS.length; si++) {
        var sp = SPOTS[si];
        scan[sp] = {};
        scan[sp][A] = (await silhouetteAt(A, sp, 0)).changed;
        scan[sp][B] = (await silhouetteAt(B, sp, 0)).changed;
      }
      var bestA = Math.max.apply(null, SPOTS.map(function (s) { return scan[s][A]; }));
      var bestB = Math.max.apply(null, SPOTS.map(function (s) { return scan[s][B]; }));
      var spot = null, score = -1;
      SPOTS.forEach(function (s) {
        var w = Math.min(scan[s][A] / bestA, scan[s][B] / bestB);
        if (w > score) { score = w; spot = s; }
      });
      if (score < GUARD) {
        out.guard.failure = { bearing: BEAR.tag, score: +score.toFixed(3), scan: scan,
                              ownBest: { a: bestA, b: bestB } };
        throw new Error("SPOT GUARD FAILED at bearing " + BEAR.tag + ": best spot " +
          spot + " leaves a headline body at " + score.toFixed(3) + " of its own clear " +
          "silhouette. A smothered body would make every number below scenery.");
      }

      // ---- the pair, ACROSS THE WHOLE CYCLE --------------------------------
      var frames = {};
      for (var id2 = 0; id2 < 2; id2++) {
        var who = id2 ? B : A;
        await E("TDProbe.place(" + JSON.stringify(who) + "," + spot + ")");
        frames[who] = await E("TDProbe.frameCount()");
      }
      var N = Math.max(frames[A], frames[B]);

      // ONE empty board for this bearing; every mask is built against it.
      await E("TDProbe.depopulate()");
      await E("TDProbe.cap('_w'), TDProbe.cap('empty')");
      await E("TDProbe.repopulate()");
      await E("TDProbe.warm(1)");

      var cycle = [];
      for (var k = 0; k < N; k++) {
        var geo = {};
        for (var s2 = 0; s2 < 2; s2++) {
          var who2 = s2 ? B : A;
          await E("TDProbe.place(" + JSON.stringify(who2) + "," + spot + ")");
          var fr = await J("TDProbe.frameAt(" + k + ")");
          await E("TDProbe.setClock(0)");
          await E("TDProbe.warm(2)");
          await E("TDProbe.cap('_w'), TDProbe.cap('c:" + who2 + "')");
          await E("TDFractal.glMask('c:" + who2 + "','empty'," + JSON.stringify(who2) + ")");
          var sd = await J("TDProbe.diff('c:" + who2 + "','empty',0)");
          geo[who2] = { px: sd.changed, w: sd.bboxGL ? sd.bboxGL[2] : 0,
                        h: sd.bboxGL ? sd.bboxGL[3] : 0, bucket: fr.bucket, yaw: fr.yaw };
        }
        var d = await J("TDProbe.diff('c:" + A + "','c:" + B + "',0)");
        var st = await J("TDFractal.setStats(" + JSON.stringify(A) + "," + JSON.stringify(B) +
          ",'c:" + A + "','c:" + B + "')");
        var mean = (geo[A].px + geo[B].px) / 2;
        cycle.push({
          k: k,
          countRatio: +(d.changed / mean).toFixed(3),
          outlineRatio: +(st.symmetricDifference / mean).toFixed(3),
          changed: d.changed, outlinePx: st.symmetricDifference,
          interiorPx: st.changedInsideIntersection,
          interiorShare: st.shadingShareOfMetric,
          intersectionRepainted: st.intersectionRepaintedFraction,
          courier: geo[A], drudge: geo[B],
          heightDelta: geo[A].h - geo[B].h,
          widthDelta: geo[A].w - geo[B].w,
          courierAspect: geo[A].h ? +(geo[A].w / geo[A].h).toFixed(3) : 0,
          drudgeAspect: geo[B].h ? +(geo[B].w / geo[B].h).toFixed(3) : 0
        });
      }

      // ---- board context at rest, same spot, guard-checked -----------------
      var ctxSolo = {}, excluded = [];
      for (var ci = 0; ci < ALL.length; ci++) {
        var id3 = ALL[ci];
        var own = Math.max.apply(null, SPOTS.map(function (s) {
          return (scan[s] && scan[s][id3]) || 0; }));
        var here = await silhouetteAt(id3, spot, 0);
        // Bodies other than the headline two were not in the spot scan, so
        // their own-best is measured now over three spread spots rather than
        // assumed. A body with no clear reference is EXCLUDED, never included
        // at an unknown ratio.
        var alt = [];
        for (var ai = 0; ai < 3; ai++) {
          alt.push((await silhouetteAt(id3, SPOTS[[1, 7, 13][ai]], 0)).changed);
        }
        var ownBest = Math.max.apply(null, alt.concat([here.changed, own]));
        var ratio = ownBest ? here.changed / ownBest : 0;
        if (ratio < GUARD) { excluded.push({ id: id3, ratio: +ratio.toFixed(3) }); continue; }
        await E("TDProbe.place(" + JSON.stringify(id3) + "," + spot + ")");
        await E("TDProbe.frameAt(0)");
        await E("TDProbe.setClock(0)");
        await E("TDProbe.warm(2)");
        await E("TDProbe.cap('_w'), TDProbe.cap('r:" + id3 + "')");
        await E("TDFractal.glMask('r:" + id3 + "','empty','r" + id3 + "')");
        ctxSolo[id3] = here.changed;
      }
      var ctxPairs = {};
      var ids = Object.keys(ctxSolo);
      for (var x = 0; x < ids.length; x++) {
        for (var y = x + 1; y < ids.length; y++) {
          var P = ids[x], Q = ids[y];
          var dd = await J("TDProbe.diff('r:" + P + "','r:" + Q + "',0)");
          var ss = await J("TDFractal.setStats('r" + P + "','r" + Q + "','r:" + P + "','r:" + Q + "')");
          var mm = (ctxSolo[P] + ctxSolo[Q]) / 2;
          ctxPairs[P + "|" + Q] = { count: +(dd.changed / mm).toFixed(3),
                                    outline: +(ss.symmetricDifference / mm).toFixed(3) };
        }
      }

      out.bearings[BEAR.tag] = {
        yaw: BEAR.yaw, camera: camHere, spot: spot, spotScore: +score.toFixed(3),
        frameCounts: frames, cycle: cycle,
        contextPairsAtRest: ctxPairs, contextExcluded: excluded,
        contextNote: "single pass, same spot, rest frame -- context for ranking, " +
                     "NOT the gated eleven-body table (no two-launch null)"
      };
    }
  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}
main().catch(function (e) {
  console.error("COURIER/DRUDGE PROBE FAILED: " + e.stack);
  if (global.__partial) console.log(JSON.stringify(global.__partial, null, 1));
  process.exit(1);
});
