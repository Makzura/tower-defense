// TORN-PROP DETECTOR.
//
// A prop is a cluster of solids that TOUCH. If some of that cluster is
// classified map-fixed and the rest is not, the prop tears in half the moment
// the tower turns -- which is exactly what happened to the B5 hat rack.
//
// So: find every grounded component that is NOT fixed but whose bounding box
// overlaps (or nearly touches) a fixed one. Each hit is a prop split across the
// boundary, or a genuine contact between a prop and the figure standing on it.
// Both are worth looking at by hand; neither should be ignored.
var fs = require("fs"), path = require("path");
var ROOT = require("path").resolve(__dirname, "..", "..", "jeu");
global.window = global;
function load(p) { (0, eval)(fs.readFileSync(path.join(ROOT, p), "utf8")); }
var models = {};
global.GLModels = { register: function (n, d) { models[n] = d; } };
load("js/gl/gl-parts.js");

var GE = Number(/var GROUND_EPS = ([-0-9.]+);/.exec(
  fs.readFileSync(path.join(ROOT, "js/gl/gl-parts.js"), "utf8"))[1]);

// How close two bounding boxes must be to count as one prop, in Blender units.
// Generous: authored props overlap, they do not merely abut.
var TOUCH = 0.02;

function componentsOf(name) {
  load("js/gl/models/" + name + ".js");
  var d = models[name];
  var pos = new Float32Array(d.positions);
  var groups = d.groups && d.groups.length
    ? d.groups : [{ name: "", first: 0, count: d.triangles * 3 }];
  var count = groups[0].count;
  var parent = new Int32Array(count);
  for (var i = 0; i < count; i++) parent[i] = i;
  function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
  function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }
  var seen = Object.create(null);
  for (i = 0; i < count; i++) {
    var p = i * 3;
    var k = Math.round(pos[p] * 1e4) + "|" + Math.round(pos[p + 1] * 1e4) + "|" +
            Math.round(pos[p + 2] * 1e4);
    if (seen[k] === undefined) seen[k] = i; else union(i, seen[k]);
  }
  for (i = 0; i + 2 < count; i += 3) { union(i, i + 1); union(i, i + 2); }
  var comp = Object.create(null);
  for (var t = 0; t * 3 < count; t++) {
    var r = find(t * 3), c = comp[r];
    if (!c) c = comp[r] = { tris: 0, n: 0, sx: 0, sy: 0, sz: 0,
      x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
    c.tris++;
    for (var v = 0; v < 3; v++) {
      var q = (t * 3 + v) * 3;
      c.sx += pos[q]; c.sy += pos[q + 1]; c.sz += pos[q + 2]; c.n++;
      if (pos[q] < c.x0) c.x0 = pos[q]; if (pos[q] > c.x1) c.x1 = pos[q];
      if (pos[q + 1] < c.y0) c.y0 = pos[q + 1]; if (pos[q + 1] > c.y1) c.y1 = pos[q + 1];
      if (pos[q + 2] < c.z0) c.z0 = pos[q + 2]; if (pos[q + 2] > c.z1) c.z1 = pos[q + 2];
    }
  }
  return Object.keys(comp).map(function (k) { return comp[k]; });
}

function inCyl(x, y, z, v) {
  if (z < v.z0 || z > v.z1) return false;
  var dx = x - v.x, dy = y - v.y;
  return dx * dx + dy * dy <= v.r * v.r;
}
function inBox(x, y, z, v) {
  return x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1 && z >= v.z0 && z <= v.z1;
}
function inCap(x, y, z, v) {
  var ax = v.bx - v.ax, ay = v.by - v.ay, az = v.bz - v.az;
  var px = x - v.ax, py = y - v.ay, pz = z - v.az;
  var l = ax * ax + ay * ay + az * az;
  var t = l > 0 ? (px * ax + py * ay + pz * az) / l : 0;
  if (t < 0) t = 0; if (t > 1) t = 1;
  var dx = px - ax * t, dy = py - ay * t, dz = pz - az * t;
  return dx * dx + dy * dy + dz * dz <= v.r * v.r;
}
function classify(spec, c) {
  if (c.z0 < GE) return false;                 // does not rest on the ground
  var x = c.sx / c.n, y = c.sy / c.n, z = c.sz / c.n;
  var i;
  for (i = 0; spec.cyl && i < spec.cyl.length; i++) if (inCyl(x, y, z, spec.cyl[i])) return true;
  for (i = 0; spec.box && i < spec.box.length; i++) if (inBox(x, y, z, spec.box[i])) return true;
  for (i = 0; spec.cap && i < spec.cap.length; i++) if (inCap(x, y, z, spec.cap[i])) return true;
  return false;
}
function gap(a, b) {
  function ax(lo1, hi1, lo2, hi2) {
    if (hi1 < lo2) return lo2 - hi1;
    if (hi2 < lo1) return lo1 - hi2;
    return 0;
  }
  var dx = ax(a.x0, a.x1, b.x0, b.x1), dy = ax(a.y0, a.y1, b.y0, b.y1),
      dz = ax(a.z0, a.z1, b.z0, b.z1);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

var names = process.argv.slice(2);
if (!names.length) names = Object.keys(global.GLParts.volumes);
var anyTorn = false;
names.forEach(function (name) {
  var spec = global.GLParts.volumes[name];
  if (!spec) return;
  var comps = componentsOf(name);
  var fixed = [], loose = [];
  comps.forEach(function (c) { (classify(spec, c) ? fixed : loose).push(c); });
  var hits = [];
  loose.forEach(function (u) {
    for (var i = 0; i < fixed.length; i++) {
      if (gap(u, fixed[i]) <= TOUCH) {
        hits.push({ u: u, f: fixed[i], d: gap(u, fixed[i]) });
        return;
      }
    }
  });
  var head = name + ": " + fixed.length + " fixed solids, " + loose.length +
    " turning; " + hits.length + " TOUCHING the boundary";
  console.log(hits.length ? "!! " + head : "ok " + head);
  if (hits.length) anyTorn = true;
  hits.slice(0, 8).forEach(function (h) {
    console.log("     turning x[" + h.u.x0.toFixed(2) + "," + h.u.x1.toFixed(2) +
      "] y[" + h.u.y0.toFixed(2) + "," + h.u.y1.toFixed(2) +
      "] z[" + h.u.z0.toFixed(2) + "," + h.u.z1.toFixed(2) + "] tris=" + h.u.tris +
      "  touches fixed x[" + h.f.x0.toFixed(2) + "," + h.f.x1.toFixed(2) +
      "] z[" + h.f.z0.toFixed(2) + "," + h.f.z1.toFixed(2) + "]");
  });
});
process.exit(anyTorn ? 1 : 0);
