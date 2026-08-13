// ---------------------------------------------------------------------------
// Does a model's `top` reach the top of the model?
//
//   node tools/check-model-top.js                 all enemy models
//   node tools/check-model-top.js enemy-normal     one model
//   node tools/check-model-top.js --all            every registered model
//
// WHY THIS EXISTS. `model.top` in js/gl/gl-models.js is the max z over RAW
// positions, and positions for an ANIMATED group are stored in that group's
// LOCAL space. So a rig that hangs its geometry off a `body` empty standing at
// z = 0.62 reports a model 0.62 units shorter than it is, and `crownOf` --
// which is where the health bar goes -- lands that far down inside the mesh.
//
// Measured on the current tree, in board px, health bar against true top:
//
//     normal   9.7 INSIDE     brute  27.2 INSIDE     hive  25.1 INSIDE
//     swarm    3.5 above ok   flying  2.3 above ok
//
// NEITHER PASSING CASE PASSES BECAUSE ANYTHING CHECKED. `crownOf` adds a flat
// 10 px of pad and the error is multiplied by the type's `sizeScale`; the
// swarm's 0.55 scale merely shrinks its error under the pad, and the flier's
// group roots happen to sit near the origin. Both are luck, and that is what
// this file replaces.
//
// THE FIX IS IN THE RIG, NOT IN THE ARITHMETIC. Put an animated group's root
// at z = 0 and that group's local space IS world space at frame 1, so the raw
// max z is the true max z and this cannot fail by construction. A limb root
// must stay at its joint to pivot correctly -- but a limb hangs DOWN, so its
// local maxima are small and it never owns the top. It is the body/torso root
// that owns the top, and that root only ever translates, so moving it to the
// origin costs nothing but re-basing the part offsets it carries.
//
// THE UNITS TRAP THIS FILE IS WRITTEN AROUND. `groups[].first` and
// `groups[].count` are VERTEX indices, not triangle indices -- count is always
// exactly 3x the triangle count of the slice. Reading them as triangles lands
// every group matrix on the wrong third of its own mesh and produces a table
// that looks plausible and is wrong throughout.
//
// ---------------------------------------------------------------------------
// WHAT THIS CHECKS, WHAT IT DOES NOT, AND WHERE IT DISAGREES WITH THE RULE
// ---------------------------------------------------------------------------
//
// A tool that does not say what it fails to check invites the misreading that
// lets defects ship. The Hedger passed a four-gate instrument for hours while
// its crank passed through its own arm, not because a test was broken but
// because GREEN WAS READ AS "SOUND" when it meant "the things this looks at are
// fine". So, plainly:
//
// IT CHECKS exactly one thing: that `model.top * unitsToPx * sizeScale + 10`
// covers the model's posed geometry, per model, over every frame.
//
// IT DOES NOT CHECK anything else about the model. Not interpenetration -- a
// part inside another part is invisible here (see AGENTS.md clause 8, and note
// that a whole-GROUP AABB test is NOT the fix: it reports overlap on every
// frame of a correct model, which is the same as reporting nothing. The test
// has to be per SOLID). Not silhouette, contrast or whether anything reads.
// Not triangle budget. Not whether a group root sits at z=0 -- that is the
// usual CAUSE of a failure here, but a model can pass with roots anywhere.
// Not whether the model is registered or loaded by any page: that is
// `check-model-tags.js`, and a model can pass every check in this file and
// still draw as an untextured sphere.
//
// IT IS STRICTER THAN THE CLAUSE IT ENFORCES, and this is the important one.
// AGENTS.md 3b requires the REST frame to be the model's tallest. This sweeps
// EVERY frame, so a model that rises above its rest pose only mid-animation is
// reported here and is legal under the clause. On the enemies the two agree
// exactly, because no enemy rises above its rest pose. On towers they do not:
// `warbringer-a4`, `-a5`, `blub-superb` and `sniper-b3` are clear at rest and
// over the line only mid-swing. THEY ARE NOT FAILURES. Run bare (enemies only)
// to match the clause; `--all` is the stricter sweep and its extra hits want
// reading against the rest-frame rule before anyone acts on them.
// ---------------------------------------------------------------------------

var fs = require("fs");
var vm = require("vm");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var MODELS_DIR = path.join(ROOT, "js", "gl", "models");

// crownOf() adds this many board px of headroom above `model.top`. It is the
// entire margin an under-reporting model has to hide inside.
var CROWN_PAD_PX = 10;

// sizeScale per enemy type, read out of js/enemy.js rather than retyped -- the
// error is multiplied by it, so a type that grows silently loses margin.
function enemyScales() {
  var src = fs.readFileSync(path.join(ROOT, "js", "enemy.js"), "utf8");
  var scales = {};
  // Each type is `  <id>: {` ... `sizeScale: <n>` before the next type opens.
  var re = /^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{/gm;
  var starts = [];
  var m;
  while ((m = re.exec(src))) starts.push([m[1], m.index]);
  starts.forEach(function (entry, i) {
    var body = src.slice(entry[1], i + 1 < starts.length ? starts[i + 1][1]
                                                         : src.length);
    var s = /sizeScale\s*:\s*([0-9.]+)/.exec(body);
    scales[entry[0]] = s ? parseFloat(s[1]) : 1;
  });
  return scales;
}

// Column-major, the order uniformMatrix4fv wants and the order the exporter
// writes: element (row, col) is m[col * 4 + row].
function applyZ(m, x, y, z) {
  if (!m) return z;
  return m[2] * x + m[6] * y + m[10] * z + m[14];
}

// The raw max z -- exactly what gl-models.js computes as `model.top`.
function rawTop(raw) {
  var p = raw.positions;
  var top = -Infinity;
  for (var i = 2; i < p.length; i += 3) if (p[i] > top) top = p[i];
  return top;
}

// The true max z once every group is posed by its own matrix, over EVERY
// frame. A model whose top is only reached mid-cycle still has to fit.
function posedTop(raw) {
  var p = raw.positions;
  var groups = raw.groups && raw.groups.length
    ? raw.groups
    : [{ name: "", first: 0, count: p.length / 3 }];
  var frames = raw.frames && raw.frames.length ? raw.frames : [null];
  var top = -Infinity;
  var worstFrame = 0;
  for (var f = 0; f < frames.length; f++) {
    var pose = frames[f];
    for (var g = 0; g < groups.length; g++) {
      // first/count are VERTEX indices. This is the line the header warns
      // about; multiplying by 3 gets the float offset.
      var lo = groups[g].first * 3;
      var hi = lo + groups[g].count * 3;
      var m = pose ? pose[g] : null;
      for (var i = lo; i < hi; i += 3) {
        var z = applyZ(m, p[i], p[i + 1], p[i + 2]);
        if (z > top) { top = z; worstFrame = f; }
      }
    }
  }
  return { top: top, frame: worstFrame };
}

var args = process.argv.slice(2);
var wantAll = args.indexOf("--all") >= 0;
var explicit = args.filter(function (a) { return a.indexOf("--") !== 0; });

var files = fs.readdirSync(MODELS_DIR).filter(function (f) {
  return /\.js$/.test(f);
});
if (explicit.length) {
  files = files.filter(function (f) {
    return explicit.indexOf(f.replace(/\.js$/, "")) >= 0;
  });
} else if (!wantAll) {
  files = files.filter(function (f) { return /^enemy-/.test(f); });
}
files.sort();

if (!files.length) {
  console.log("no models matched");
  process.exit(1);
}

var scales = enemyScales();
var bad = 0;

console.log("");
console.log("  " + "model".padEnd(24) + "scale".padStart(6) +
            "top".padStart(9) + "posed".padStart(9) +
            "crown px".padStart(10) + "true px".padStart(9) +
            "margin".padStart(9) + "  verdict");

files.forEach(function (file) {
  var name = file.replace(/\.js$/, "");
  // The registry exposes no accessor for the raw payload, so capture it from
  // the file's own register() call -- which is also the most faithful read,
  // since it is exactly what the browser executes.
  var src = fs.readFileSync(path.join(MODELS_DIR, file), "utf8");
  var payload = null;
  var capCtx = { GLModels: { register: function (n, d) { payload = d; } } };
  vm.createContext(capCtx);
  vm.runInContext(src, capCtx, file);
  if (!payload) {
    console.log("  " + name.padEnd(24) + "  no register() call -- skipped");
    return;
  }

  var typeId = /^enemy-(.+)$/.exec(name);
  typeId = typeId ? typeId[1] : null;
  var scale = typeId && scales[typeId] !== undefined ? scales[typeId] : 1;

  var unitsToPx = payload.unitsToPx || 31.8032;
  var t = rawTop(payload);
  var posed = posedTop(payload);
  var crownPx = t * unitsToPx * scale + CROWN_PAD_PX;
  var truePx = posed.top * unitsToPx * scale;
  var margin = crownPx - truePx;
  var ok = margin >= 0;
  if (!ok) bad++;

  console.log("  " + name.padEnd(24) +
              scale.toFixed(2).padStart(6) +
              t.toFixed(3).padStart(9) +
              posed.top.toFixed(3).padStart(9) +
              crownPx.toFixed(1).padStart(10) +
              truePx.toFixed(1).padStart(9) +
              margin.toFixed(1).padStart(9) +
              "  " + (ok ? "ok" : "BURIED " + (-margin).toFixed(1) +
                            " px inside the mesh"));
});

console.log("");
if (bad) {
  console.log("  " + bad + " model(s) report a `top` too low for their own " +
              "geometry, so the health");
  console.log("  bar draws inside the body. Fix the RIG: move the animated " +
              "group root that");
  console.log("  owns the topmost geometry to z = 0 and re-export.");
  process.exit(1);
}
console.log("  All models report a `top` that covers their posed geometry.");
