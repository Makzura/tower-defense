// Run the shipped GLParts against the shipped models and report what it took
// to be map-fixed, so the classification can be checked against the Blender
// build scripts' own part lists rather than against a screenshot.
var fs = require("fs");
var root = "C:/Users/Superuser/Downloads/TD_0.5.0/TD_0.5.0/";

var sandbox = { console: console, Math: Math, Object: Object, Float32Array: Float32Array,
  Int32Array: Int32Array, JSON: JSON };
new Function("with(this){" + fs.readFileSync(root + "js/gl/gl-parts.js", "utf8") + "; this.GLParts = GLParts;}").call(sandbox);
var GLParts = sandbox.GLParts;

function toLinear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }

fs.readdirSync(root + "js/gl/models").forEach(function (f) {
  var name = f.replace(".js", "");
  if (!GLParts.volumes[name]) return;
  var G = { register: function (n, d) { G.d = d; } };
  new Function("GLModels", fs.readFileSync(root + "js/gl/models/" + f, "utf8"))(G);
  var raw = G.d;
  var tris = raw.triangles;
  var arrays = {
    positions: new Float32Array(raw.positions),
    normals: new Float32Array(tris * 9),
    colors: new Float32Array(tris * 9),
    emissive: new Float32Array(tris * 3)
  };
  // Tag each triangle with its index in the colour array so the partition can
  // be traced back afterwards.
  for (var t = 0; t < tris; t++) {
    for (var v = 0; v < 3; v++) arrays.colors[t * 9 + v * 3] = t;
  }
  var model = { name: name, groups: raw.groups || [], triangles: tris };
  var before = new Float32Array(arrays.positions);
  var fixedVerts = GLParts.split(name, model, arrays);

  // Extent of the geometry that was pulled out.
  var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], solids = {};
  for (var i = 0; i < fixedVerts; i++) {
    for (var a = 0; a < 3; a++) {
      var val = arrays.positions[i * 3 + a];
      if (val < mn[a]) mn[a] = val;
      if (val > mx[a]) mx[a] = val;
    }
  }
  var emissiveTris = 0;
  for (t = 0; t < tris; t++) {
    var c = raw.palette[raw.colourIndex[t]];
    if (c && c[3]) emissiveTris++;
  }
  console.log(name.padEnd(15) +
    " fixed=" + String(fixedVerts / 3).padStart(5) + "/" + tris + " tris" +
    "  emissive=" + String(emissiveTris).padStart(4) +
    (fixedVerts ? ("  x[" + mn[0].toFixed(2) + "," + mx[0].toFixed(2) + "]" +
      " y[" + mn[1].toFixed(2) + "," + mx[1].toFixed(2) + "]" +
      " z[" + mn[2].toFixed(2) + "," + mx[2].toFixed(2) + "]") : ""));
});
