// What actually identifies a model file, and what merely identifies the run
// that produced it.
//
// suki's rule, and it corrects how I was bracketing measurements:
//
//   IN THIS PIPELINE A HASH MISMATCH IS NOT EVIDENCE THAT GEOMETRY CHANGED.
//
// Re-exporting unchanged source gives a different file every time -- measured,
// three exports of one source differ from each other by 192-224 of 4032
// triangles, all inside `td_scene.ball`, with identical multisets and zero
// differing pixels. So `hashBefore !== hashAfter` cannot distinguish "the model
// moved" from "somebody re-ran the exporter", and those need opposite
// responses: one invalidates a measurement, the other does not.
//
// The distinguishing test is the TRIANGLE MULTISET.
//
//   same multiset  -> same model, re-exported. Old pixel numbers still stand.
//   diff multiset  -> real geometry change. Every pixel number is superseded.
//
// Triangle COUNT is not a substitute: `enemy-angry` changed its crank length
// and pivot with the count fixed at 4072 and `model.top` fixed at 1.190, so
// both of those agreed across a real change.
//
//   node visual-pass/probe/model-identity.js <fileA> [fileB]
//   node visual-pass/probe/model-identity.js --groups <file>
"use strict";

var fs = require("fs");
var crypto = require("crypto");

function payloadOf(src) {
  var got = null;
  (new Function("GLModels", src))({
    register: function (n, d) { got = { name: n, data: d }; }
  });
  if (!got) throw new Error("file registered nothing");
  return got;
}

// One canonical key per triangle: its three positions and its colour index.
// Order-insensitive once sorted, which is the whole point.
function triangleKeys(d) {
  var keys = [];
  for (var t = 0; t < d.triangles; t++) {
    var k = [];
    for (var v = 0; v < 9; v++) k.push(d.positions[t * 9 + v]);
    k.push(d.colourIndex[t]);
    keys.push(k.join(","));
  }
  return keys;
}

function digest(list) {
  var h = crypto.createHash("sha1");
  list.slice().sort().forEach(function (k) { h.update(k); h.update("\n"); });
  return h.digest("hex");
}

// Per-group extents in the group's OWN local space, plus the group root's
// translation at frame 0. Between them these say where a part is and how big
// it is, which is what a stated authoring change (a longer bar, a raised pivot)
// actually predicts.
function groupBoxes(p) {
  var d = p.data;
  var out = [];
  for (var g = 0; g < d.groups.length; g++) {
    var grp = d.groups[g];
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = grp.first; i < grp.first + grp.count; i++) {
      for (var a = 0; a < 3; a++) {
        var v = d.positions[i * 3 + a];
        if (v < lo[a]) lo[a] = v;
        if (v > hi[a]) hi[a] = v;
      }
    }
    var m0 = d.frames.length ? d.frames[0][g] : null;
    out.push({
      name: grp.name, verts: grp.count,
      localSize: [+(hi[0] - lo[0]).toFixed(4), +(hi[1] - lo[1]).toFixed(4),
                  +(hi[2] - lo[2]).toFixed(4)],
      localZ: [+lo[2].toFixed(4), +hi[2].toFixed(4)],
      rootAtFrame0: m0 ? [+m0[12].toFixed(4), +m0[13].toFixed(4), +m0[14].toFixed(4)] : null
    });
  }
  return out;
}

function identify(file) {
  var src = fs.readFileSync(file, "utf8");
  var p = payloadOf(src);
  var keys = triangleKeys(p.data);
  return {
    file: file,
    md5: crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex"),
    name: p.name,
    triangles: p.data.triangles,
    unitsToPx: p.data.unitsToPx,
    groups: p.data.groups.length,
    frames: p.data.frames.length,
    // THE IDENTITY THAT SURVIVES A RE-EXPORT.
    multiset: digest(keys),
    paletteDigest: digest([JSON.stringify(p.data.palette)]),
    framesDigest: digest([JSON.stringify(p.data.frames)]),
    _keys: keys,
    _payload: p
  };
}

if (require.main === module) {
  var args = process.argv.slice(2);
  if (args[0] === "--groups") {
    var one = identify(args[1]);
    console.log(JSON.stringify({
      file: one.file, md5: one.md5, name: one.name, triangles: one.triangles,
      multiset: one.multiset, groups: groupBoxes(one._payload)
    }, null, 1));
  } else if (args.length === 1) {
    var a = identify(args[0]);
    delete a._keys; delete a._payload;
    console.log(JSON.stringify(a, null, 1));
  } else {
    var x = identify(args[0]), y = identify(args[1]);
    var moved = 0;
    for (var i = 0; i < Math.min(x._keys.length, y._keys.length); i++) {
      if (x._keys[i] !== y._keys[i]) moved++;
    }
    console.log(JSON.stringify({
      a: { file: x.file, md5: x.md5, triangles: x.triangles, multiset: x.multiset },
      b: { file: y.file, md5: y.md5, triangles: y.triangles, multiset: y.multiset },
      md5Same: x.md5 === y.md5,
      triangleCountSame: x.triangles === y.triangles,
      multisetSame: x.multiset === y.multiset,
      framesSame: x.framesDigest === y.framesDigest,
      paletteSame: x.paletteDigest === y.paletteDigest,
      trianglesInDifferentSlots: moved,
      verdict: x.md5 === y.md5 ? "IDENTICAL FILE"
             : x.multiset === y.multiset
               ? "SAME MODEL, RE-EXPORTED -- earlier pixel numbers still stand"
               : "REAL GEOMETRY CHANGE -- every earlier pixel number is superseded"
    }, null, 1));
  }
}

module.exports = { identify: identify, groupBoxes: groupBoxes, digest: digest };
