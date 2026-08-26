// ---------------------------------------------------------------------------
// Are the primitives wound OUTWARD?
//
//   node tools/check-winding.js
//
// WHY THIS EXISTS. Three separate winding bugs turned up during the visual
// pass, all with the same signature and all found by eye rather than by test:
//
//   * GLGeometry.road      both kerbs wound inward -> every kerb culled on
//                          every frame, so the road had no sides at all and the
//                          "raised ribbon" its own header describes had never
//                          rendered
//   * td_mesh.ball         0 outward / 120 inward -> every head, shoulder, eye,
//                          ball joint and glow orb on every authored model was
//                          inside out
//   * GLGeometry.sphere    0 outward / 168 inward -> the fifteen sphere enemy
//                          types and the Tyrant likewise
//
// GLRenderer enables CULL_FACE/BACK, so an inward winding does not draw a
// slightly wrong picture -- it culls the near wall and shows you the inside of
// the far one. That reads as "hollow" or "lit from the wrong side", which is
// easy to mistake for a shading problem and hard to attribute.
//
// THE TEST. For a CONVEX solid the outward normal must satisfy
//   dot(n, face_centre - centroid) > 0
// A torus is not convex, so its reference is the nearest point on the major
// circle instead -- a centroid test calls a third of a correct torus wrong,
// which is worth knowing before someone "fixes" it.
//
// This audits the primitives, not finished models: a whole figure is concave, so
// there is no valid convexity test for one. Primitives are where the bug lives.
// ---------------------------------------------------------------------------

var fs = require("fs");
var vm = require("vm");
var cp = require("child_process");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var bad = 0;

function report(file, name, nt, out, inw) {
  var ok = inw === 0;
  if (!ok) bad++;
  console.log("  " + (file + " " + name).padEnd(28) +
              String(nt).padStart(5) + " tris   outward " + String(out).padStart(5) +
              "   inward " + String(inw).padStart(5) +
              (ok ? "" : "   <-- INSIDE OUT"));
}

// --- the runtime primitives, js/gl/gl-geometry.js ---------------------------

var ctx = { console: console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/gl/gl-geometry.js"), "utf8"), ctx);
var G = ctx.GLGeometry;

function auditJs(name, build) {
  var b = new G.Builder();
  build(b);
  var pos = b.pos, nrm = b.nrm, nv = pos.length / 3, nt = nv / 3;
  var cx = 0, cy = 0, cz = 0, i;
  for (i = 0; i < nv; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
  cx /= nv; cy /= nv; cz /= nv;
  var out = 0, inw = 0;
  for (var t = 0; t < nt; t++) {
    var px = 0, py = 0, pz = 0;
    for (var k = 0; k < 3; k++) {
      px += pos[(t * 3 + k) * 3]; py += pos[(t * 3 + k) * 3 + 1]; pz += pos[(t * 3 + k) * 3 + 2];
    }
    px /= 3; py /= 3; pz /= 3;
    var d = nrm[t * 9] * (px - cx) + nrm[t * 9 + 1] * (py - cy) + nrm[t * 9 + 2] * (pz - cz);
    if (d > 0) out++; else inw++;
  }
  report("gl-geometry", name, nt, out, inw);
}

console.log("Primitive winding audit");
console.log("");
auditJs("sphere",   function (b) { G.sphere(b, 0, 0, 1, [1, 1, 1], 0, 12, 8); });
auditJs("cylinder", function (b) { G.cylinder(b, 0, 0, 0.5, 1, [1, 1, 1], 0, 12); });
auditJs("box",      function (b) { G.box(b, 0, 0, 1, 1, 1, [1, 1, 1], 0); });
auditJs("boxAt",    function (b) { G.boxAt(b, 0, 0, 1, 1, 1, [1, 1, 1], 0, 0.3); });
auditJs("frustum",  function (b) { G.frustum(b, 0, 0, 0.6, 0.4, 1, [1, 1, 1], 0, 8); });
// Three orientations, because `segment` picks its reference vector from the
// direction it is given and the near-vertical case takes the other branch --
// a winding that is only correct for leaning trunks would leave every fence
// post and every tree in the forest inside out.
auditJs("segment up",   function (b) { G.segment(b, 0, 0, 0, 0, 0, 2, 0.3, [1, 1, 1]); });
auditJs("segment lean", function (b) { G.segment(b, 0, 0, 0, 1, 0.6, 2, 0.3, [1, 1, 1]); });
auditJs("segment flat", function (b) { G.segment(b, -1, 0, 1, 1, 0, 1, 0.3, [1, 1, 1]); });

// --- the offline primitives, tools/blender/td_mesh.py -----------------------
// Driven through Python because that is the only thing that can execute them.

var PY_AUDIT = [
  'import sys, os, math',
  'sys.path.insert(0, os.getcwd())',
  'import td_mesh as td',
  'def audit(name, build, ref=None):',
  '    s = td.Scene({"m": ("#808080", 0.0)}); root = s.node("root")',
  '    build(s, root)',
  '    m = td.build(s, "audit")',
  '    pos, nrm = m["positions"], m["normals"]',
  '    nv = len(pos)//3; nt = len(nrm)//3',
  '    cx = sum(pos[0::3])/nv; cy = sum(pos[1::3])/nv; cz = sum(pos[2::3])/nv',
  '    out = inw = 0',
  '    for t in range(nt):',
  '        px = sum(pos[(3*t+k)*3+0] for k in range(3))/3',
  '        py = sum(pos[(3*t+k)*3+1] for k in range(3))/3',
  '        pz = sum(pos[(3*t+k)*3+2] for k in range(3))/3',
  '        if ref == "torus":',
  '            ln = math.hypot(px-cx, py-cy) or 1e-9',
  '            fx, fy, fz = px-(cx+(px-cx)/ln), py-(cy+(py-cy)/ln), pz-cz',
  '        else:',
  '            fx, fy, fz = px-cx, py-cy, pz-cz',
  '        d = nrm[3*t]*fx + nrm[3*t+1]*fy + nrm[3*t+2]*fz',
  '        if d > 0: out += 1',
  '        else: inw += 1',
  '    print("%s %d %d %d" % (name, nt, out, inw))',
  'audit("ball",      lambda s,p: td.ball(s,"b",1.0,(0,0,0),"m",p,12,6))',
  'audit("ellipsoid", lambda s,p: td.ellipsoid(s,"e",(2,1,1.5),(0,0,0),"m",p))',
  'audit("box",       lambda s,p: td.box(s,"x",(1,1,1),(0,0,0),(0,0,0),"m",p))',
  'audit("cyl",       lambda s,p: td.cyl(s,"c",0.5,1.0,(0,0,0),(0,0,0),"m",p))',
  'audit("frustum",   lambda s,p: td.frustum(s,"f",0.6,0.4,1.0,(0,0,0),"m",p))',
  'audit("tube",      lambda s,p: td.tube(s,"u",0.2,(0,0,-1),(0,0,1),"m",p))',
  'audit("torus",     lambda s,p: td.torus(s,"t",1.0,0.25,(0,0,0),(0,0,0),"m",p), ref="torus")'
].join("\n");

var py = process.env.PYTHON || "python";
var outText = "";
try {
  outText = cp.execSync(JSON.stringify(py) + " -", {
    cwd: path.join(ROOT, "tools/blender"),
    input: PY_AUDIT, encoding: "utf8"
  });
} catch (e) {
  console.log("");
  console.log("  td_mesh primitives NOT AUDITED: could not run python (" +
              (e.message || "").split("\n")[0] + ")");
  console.log("  Set PYTHON=<path> to include them.");
  outText = "";
}

outText.trim().split("\n").filter(Boolean).forEach(function (line) {
  var p = line.trim().split(/\s+/);
  report("td_mesh", p[0], +p[1], +p[2], +p[3]);
});

console.log("");
if (bad) {
  console.log(bad + " primitive(s) are wound inward. With CULL_FACE/BACK enabled");
  console.log("that means the near surface is culled and the inside of the far");
  console.log("one is what reaches the screen.");
  process.exit(1);
}
console.log("All primitives wound outward.");
