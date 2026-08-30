// Does a re-exported model with reordered triangles render differently?
//
// suki's finding, as corrected by her: the exporter is NOT byte-reproducible.
// Three exports of the same unchanged source give three different files, and
// the differing region is confined to the 224-triangle UV sphere of the lens
// ball. The triangle MULTISET is identical in all three; only the order moves.
//
// Byte comparison is therefore permanently the wrong instrument for this
// pipeline. Pixels are the right one.
//
// Each candidate is re-registered under the model's own name into a live page
// -- GLModels.register replaces the entry with expanded/gpu nulled, so the next
// mesh() rebuilds from the new bytes while the enemy object, its lane, its
// progress and the camera all stay exactly as they were. That is the narrowest
// possible difference between two captures.
//
// THE OPAQUE PATH IS NOT THE WHOLE RENDERER. setFade enables BLEND with
// depthMask(false), and its own comment says a faded object's triangles then
// composite in BUFFER ORDER -- which is the one place a reorder could surface.
// Both cases are run.
//
//   node visual-pass/probe/reexport-probe.js <fileA> [fileB] ...
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var crypto = require("crypto");
var cdp = require("./cdp");
var serve = require("./serve");

var PORT = 8795, DEVTOOLS = 9335;
var GAME_URL = "http://127.0.0.1:" + PORT + "/game/index.html";
var ROOT = path.resolve(__dirname, "..", "..");
var MODEL = "enemy-normal";
var COMMITTED = path.join(ROOT, "game", "js", "gl", "models", MODEL + ".js");

function md5(f) {
  return crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex");
}

// A structural comparison, so a pixel result can be read against what actually
// differs in the payload rather than against "the files differ".
function structure(src) {
  var g = { calls: [] };
  var fake = { register: function (n, d) { g.calls.push({ name: n, data: d }); } };
  (new Function("GLModels", src))(fake);
  var d = g.calls[0].data;
  var tris = [];
  for (var t = 0; t < d.triangles; t++) {
    var k = [];
    for (var v = 0; v < 9; v++) k.push(d.positions[t * 9 + v]);
    k.push(d.colourIndex[t]);
    tris.push(k.join(","));
  }
  return { name: g.calls[0].name, triangles: d.triangles,
           unitsToPx: d.unitsToPx, groups: JSON.stringify(d.groups),
           frames: JSON.stringify(d.frames).length,
           palette: JSON.stringify(d.palette), triKeys: tris };
}

function compareStructure(a, b) {
  var moved = 0;
  for (var i = 0; i < a.triKeys.length; i++) if (a.triKeys[i] !== b.triKeys[i]) moved++;
  var sa = a.triKeys.slice().sort(), sb = b.triKeys.slice().sort();
  var multisetEqual = sa.length === sb.length && sa.every(function (v, i) { return v === sb[i]; });
  return { movedTriangles: moved, of: a.triKeys.length, multisetIdentical: multisetEqual,
           groupsIdentical: a.groups === b.groups, paletteIdentical: a.palette === b.palette,
           framesSameLength: a.frames === b.frames, trianglesEqual: a.triangles === b.triangles };
}

async function main() {
  var files = process.argv.slice(2);
  if (!files.length) throw new Error("give at least one re-exported file path");
  var all = [{ label: "committed", file: COMMITTED }].concat(
    files.map(function (f, i) {
      return { label: "run" + String.fromCharCode(65 + i), file: path.resolve(f) };
    }));
  all.forEach(function (c) {
    c.md5 = md5(c.file);
    c.src = fs.readFileSync(c.file, "utf8");
    c.struct = structure(c.src);
  });

  var out = { model: MODEL, candidates: all.map(function (c) {
    return { label: c.label, file: c.file, md5: c.md5, triangles: c.struct.triangles };
  }), structure: {}, pixels: {} };

  for (var i = 0; i < all.length; i++) {
    for (var k = i + 1; k < all.length; k++) {
      out.structure[all[i].label + " vs " + all[k].label] =
        compareStructure(all[i].struct, all[k].struct);
    }
  }

  var server = await new Promise(function (res, rej) {
    serve.start(PORT, function (e, s) { e ? rej(e) : res(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-reexport"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, GAME_URL);
  var S = conn.session;
  try {
    for (var w = 0; w < 80; w++) {
      if (await S.evaluate("typeof startRun === 'function' && typeof GLModels !== 'undefined'")) break;
      await cdp.sleep(250);
    }
    await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe.js"), "utf8"));
    out.setup = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.setup())"));
    await S.evaluate("TDProbe.camDefault()");
    await S.evaluate("TDProbe.warm(2)");
    out.place = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.place('normal',60))"));
    // Close in, so the 224-triangle lens ball is many pixels rather than a
    // handful. A zero over 13x20 px would be a statement about resolution.
    await S.evaluate(
      "(function(){var e=TDProbe._e;" +
      " TDProbe.cam({target:[e.pos.x,e.pos.y,0],distance:190,pitch:0.30,yaw:-1.5707963267948966});" +
      " TDProbe.frameAt(0); return 1;})()");
    await S.evaluate("TDProbe.warm(3)");

    for (var mode = 0; mode < 2; mode++) {
      var fade = mode === 0 ? null : 0.5;
      var tag = mode === 0 ? "opaque" : "fade0.5";
      out.pixels[tag] = {};
      await S.evaluate("JSON.stringify(TDProbe.forceFade(" + (fade === null ? "null" : fade) + "))");
      for (var c = 0; c < all.length; c++) {
        await S.evaluate("TDProbe.reregister(" + JSON.stringify(all[c].src) + ")");
        // Prove the re-register actually reached the renderer: the gpu handle
        // must have been rebuilt, not reused. A registration that silently
        // failed would leave the previous mesh on screen and return a clean
        // zero -- "no experiment" is indistinguishable from "no effect".
        out.pixels[tag]["seam:" + all[c].label] = JSON.parse(await S.evaluate(
          "JSON.stringify({registered:GLModels.has('" + MODEL + "')," +
          " tris:GLModels.triangles('" + MODEL + "')," +
          " top:GLModels.get(World3D.renderer(),'" + MODEL + "').top})"));
        await S.evaluate("TDProbe.cap('_w')");
        await S.evaluate("TDProbe.cap('" + tag + ":" + all[c].label + "')");
      }
      // Null control at this fade: same candidate captured twice.
      await S.evaluate("TDProbe.cap('_w')");
      await S.evaluate("TDProbe.cap('" + tag + ":null')");
      out.pixels[tag].nullControl = JSON.parse(await S.evaluate(
        "JSON.stringify(TDProbe.diff('" + tag + ":" + all[all.length - 1].label + "','" + tag + ":null',0))"));
      for (var a2 = 0; a2 < all.length; a2++) {
        for (var b2 = a2 + 1; b2 < all.length; b2++) {
          out.pixels[tag][all[a2].label + " vs " + all[b2].label] = JSON.parse(await S.evaluate(
            "JSON.stringify(TDProbe.diff('" + tag + ":" + all[a2].label + "','" + tag + ":" + all[b2].label + "',0))"));
        }
      }
      // POSITIVE COMPANION at this fade, in the same run: hide the model and
      // the sphere draws. Without it every zero above is indistinguishable from
      // a probe that captured nothing.
      await S.evaluate("TDProbe.hideModel('" + MODEL + "')");
      await S.evaluate("TDProbe.cap('_w')");
      await S.evaluate("TDProbe.cap('" + tag + ":sphere')");
      await S.evaluate("TDProbe.showModel()");
      out.pixels[tag].positiveControl = JSON.parse(await S.evaluate(
        "JSON.stringify(TDProbe.diff('" + tag + ":" + all[0].label + "','" + tag + ":sphere',0))"));
    }
    await S.evaluate("TDProbe.forceFade(null)");
  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

main().catch(function (e) { console.error("REEXPORT PROBE FAILED: " + e.stack); process.exit(1); });
