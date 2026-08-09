// ---------------------------------------------------------------------------
// WHICH PARTS OF A MODEL ARE BOLTED TO THE MAP.
//
// A tower turns to face what it is shooting, and in 3D that turn is a yaw on
// the whole mesh. For a man with a rifle that is right. For the things he is
// standing among it is not: the Arcane Sniper A5 is a floating cannon on an
// installed foundation, B5 is a prisoner chained to four stone obelisks, and
// the Rifleman fights from behind crates with a spotlight on a stand. None of
// those should pivot when the weapon tracks a target -- they are on the ground,
// and the ground does not move.
//
// THE BLENDER RIG ALREADY KNOWS THIS. tower_sniper.py builds both foundations
// under `_world_fixed_child`, a node carrying a driver that cancels the aiming
// parent's yaw, precisely so the shrine stays bolted to the same world corners
// in all 48 sprite rows. That solution does not survive the export: a DRIVER is
// not an ACTION, so `export_mesh._group_root` walks past it and the foundation
// lands in the same unnamed group as everything else that does not animate.
// The Rifleman's scenery was never counter-yawed at all -- it hangs straight
// off the aim root, so it did spin in the sprites too, and making it stop is a
// change to the design rather than a repair of it.
//
// SO THE SOLIDS ARE RECOVERED HERE, FROM THE GEOMETRY.
//
// Every `td.box`, `td.cyl` and `td.ball` in those build scripts is its own mesh
// with its own vertices. Two of them that merely overlap in space share none.
// So union-find over shared vertex positions puts exactly one authored
// primitive in each connected component, and a component is classified whole --
// which is the property that matters, because half a crate turning would be far
// worse than all of it turning.
//
// Each component is then tested against a short list of volumes taken from the
// build script's own placement calls (`barricade.location`, the pylon ring
// radius, and so on). These are not eyeballed: they are the numbers Blender was
// given, widened by the part's own extent.
//
// WHEN BLENDER IS NEXT AVAILABLE this file should become dead weight --
// export_mesh.py now emits a `world_fixed` group for exactly this subtree, and
// `GLParts.split` prefers that group whenever a model carries one. The
// geometric path stays as the fallback for the models on disk today.
// ---------------------------------------------------------------------------

var GLParts = (function () {
  "use strict";

  var DEG = Math.PI / 180;

  // A ring of N identical props, the shape both sniper foundations use.
  function ring(count, radius, firstDeg, localRadius, z0, z1) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var a = (firstDeg + i * (360 / count)) * DEG;
      out.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius,
                 r: localRadius, z0: z0, z1: z1 });
    }
    return out;
  }

  // The two-segment tethers from each B5 obelisk's clevis to the floating
  // body's waist. Same authored path `_build_rapture_anchor` returns and
  // `build_rapture5` draws along, as capsules rather than cylinders because a
  // chain is a line, not a column.
  function chains() {
    var out = [];
    for (var i = 0; i < 4; i++) {
      var a = (45 + i * 90) * DEG;
      var c = Math.cos(a), s = Math.sin(a);
      out.push({ ax: c * 0.455, ay: s * 0.455, az: 0.575,
                 bx: c * 0.39, by: s * 0.39, bz: 0.68, r: 0.11 });
      out.push({ ax: c * 0.39, ay: s * 0.39, az: 0.68,
                 bx: c * 0.20, by: s * 0.20, bz: 0.96, r: 0.11 });
    }
    return out;
  }

  // How far below z = 0 a component may reach and still count as resting on
  // the ground. Small and non-zero: the props are authored flush at 0 and this
  // only absorbs float error from the export.
  var GROUND_EPS = -0.03;

  // Model-local volumes, in Blender units. `cyl` is an upright cylinder,
  // `cap` a capsule between two points. A component belongs to the foundation
  // when its CENTRE falls inside one AND it rests on the ground (see
  // GROUND_EPS) -- centre rather than full containment, because a crate's
  // corner may poke outside the radius its placement implies.
  var FIXED = {
    // A4's squat mount: the base cylinder, the gimbal ring it swings in, and
    // the ley disc between them. Everything ABOVE z 0.36 is the gimbal itself
    // -- yoke arms at 0.49, axle and trunnions at 0.72 -- and that genuinely
    // does swing with the weapon, so the cut is between the two.
    "sniper-a4": {
      cyl: [{ x: 0, y: 0, r: 0.52, z0: -0.01, z1: 0.36 }]
    },
    // The installed mount: base ring, tread and glow disc, plus three faceted
    // anchor pylons at 90/210/330. The carriage that holds the lance starts at
    // z 0.86 and is deliberately excluded.
    "sniper-a5": {
      cyl: [{ x: 0, y: 0, r: 0.90, z0: -0.01, z1: 0.22 }]
        .concat(ring(3, 0.66, 90, 0.28, -0.01, 0.80))
    },
    // The shrine: four stone obelisks at 45/135/225/315 and the chains that
    // hold him off the ground.
    "sniper-b5": {
      cyl: ring(4, 0.66, 45, 0.30, -0.01, 1.12),
      cap: chains()
    },
    // His case, on the ground beside him.
    "rifleman-base": {
      cyl: [{ x: -0.30, y: 0.30, r: 0.36, z0: -0.60, z1: 0.34 }]
    },
    // The feed stand: a foot, a chromed column, the rack of clips at the top,
    // the servo, and the case he graduated from, leaning on the column.
    //
    // Nudged 0.06 away from the man (the stand is authored at -0.26, -0.38)
    // because his rear shoe sits 0.26 from that point and the stand's own foot
    // is 0.23 wide. Off the authored centre the two overlap; off this one they
    // do not. The loader arm is an animated group and so is never a candidate
    // -- it has to keep reaching for the gun.
    // TWO volumes, because one cannot separate them. The stand's servo box sits
    // at (-0.08, -0.23) -- 0.27 from the stand's centre -- and his shoulder and
    // hip arm sit at 0.26 to 0.30 from the same point. A single radius wide
    // enough for the servo also takes his arm. So the stand gets a tight 0.22,
    // and the servo gets its own small box high up where no part of him is.
    "rifleman-a3": {
      cyl: [{ x: -0.26, y: -0.44, r: 0.22, z0: -0.60, z1: 1.40 },
            { x: -0.08, y: -0.23, r: 0.13, z0: 1.02, z1: 1.32 }]
    },
    // The bolted mount column the heavy gun swivels on. The gun still turns;
    // the column it is bolted to does not.
    "rifleman-a5": {
      cyl: [{ x: 0.12, y: 0, r: 0.52, z0: -0.60, z1: 0.62 }]
    },
    // Crates and a spotlight on a stand.
    "rifleman-b3": {
      // The spotlight radius is 0.20, not the 0.30 the stand's splayed legs
      // suggest. At 0.30 the volume reached to y = -0.10, which is the man's
      // own y, and it froze his near arm and part of his coat -- the exact
      // failure the owner reported on this tier. A prop volume is sized to the
      // PROP, and the figure is always the thing standing next to it.
      cyl: [{ x: 0.40, y: 0.33, r: 0.48, z0: -0.60, z1: 0.62 },
            { x: -0.30, y: -0.40, r: 0.20, z0: -0.60, z1: 1.00 }]
    },
    // The dais he stands ON -- deck, lip and four corner crates -- plus a rack
    // of spare guns and hats and two spotlights. The deck is the largest single
    // surface on the model, so it turning was the most obvious of the lot.
    //
    // z stops at 0.215: the dais top is 0.1975 and his soles start there, so
    // this takes the platform and leaves the man standing on it.
    "rifleman-b5": {
      // THE HAT RACK IS A BOX, AND HAD TO BECOME ONE.
      //
      // It stands at x -0.66 with posts at y +/-0.30 and four hats hanging at
      // x -0.72, y +/-0.255. Measured from its own centre those sit 0.30 and
      // 0.262 out -- and the back of the man's overcoat sits 0.30 to 0.34 out.
      // The two ranges OVERLAP, so no radius separates them: 0.25 cut the stand
      // in half (bar and inner hats frozen, posts and outer hats still
      // turning), and 0.42 took his coat. What separates them is x, not
      // distance, so the rack is an axis-aligned box: everything behind
      // x = -0.56 is rack, everything in front of it is man.
      cyl: [{ x: 0.10, y: -0.62, r: 0.32, z0: -0.60, z1: 1.15 },
            { x: -0.02, y: 0.62, r: 0.32, z0: -0.60, z1: 1.05 }],
      box: [
        // The rack. See the note above.
        { x0: -0.90, x1: -0.56, y0: -0.45, y1: 0.45, z0: -0.05, z1: 1.55 },
        // The dais: deck (1.02 x 0.90 at -0.06), lip, four corner crates and
        // their bands. z stops at 0.20 -- the deck surface is 0.1975 and his
        // boots start there, so this takes the platform and leaves the man
        // standing on it.
        { x0: -0.65, x1: 0.55, y0: -0.55, y1: 0.55, z0: -0.05, z1: 0.20 },
        // The strongbox. It needed its own volume: the dais cylinder reached
        // its body but not its dial (0.84 out, past the 0.80 radius) nor its
        // gold bar (z 0.315, past the deck cut), so the box sat still while its
        // own lock and loot turned with the man.
        { x0: 0.26, x1: 0.70, y0: -0.66, y1: -0.22, z0: -0.05, z1: 0.40 }
      ]
    }
  };

  // Union-find over vertices quantised to a tenth of a millimetre in model
  // space. Quantising rather than comparing floats because a shared corner
  // makes the round trip through the exporter's own rounding.
  function componentsOf(positions, triCount, first, count) {
    var n = count;
    var parent = new Int32Array(n);
    var i;
    for (i = 0; i < n; i++) parent[i] = i;

    function find(a) {
      while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
      return a;
    }
    function union(a, b) {
      a = find(a); b = find(b);
      if (a !== b) parent[a] = b;
    }

    var seen = Object.create(null);
    for (i = 0; i < n; i++) {
      var p = (first + i) * 3;
      var key = (Math.round(positions[p] * 1e4) + "|" +
                 Math.round(positions[p + 1] * 1e4) + "|" +
                 Math.round(positions[p + 2] * 1e4));
      var prev = seen[key];
      if (prev === undefined) seen[key] = i; else union(i, prev);
    }
    // Every triangle's own three corners are one solid whether or not they are
    // shared -- a lone tri is still a part.
    for (i = 0; i + 2 < n; i += 3) { union(i, i + 1); union(i, i + 2); }
    return { find: find, size: n };
  }

  function inCylinder(x, y, z, v) {
    if (z < v.z0 || z > v.z1) return false;
    var dx = x - v.x, dy = y - v.y;
    return dx * dx + dy * dy <= v.r * v.r;
  }

  // An axis-aligned box. Often the RIGHT shape and a cylinder is not: a rack
  // standing beside a man is long in y and thin in x, and any circle wide
  // enough to hold its end posts also reaches back far enough to hold his coat.
  // A box separates them on the axis that actually separates them.
  function inBox(x, y, z, v) {
    return x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1 &&
           z >= v.z0 && z <= v.z1;
  }

  function inCapsule(x, y, z, v) {
    var ax = v.bx - v.ax, ay = v.by - v.ay, az = v.bz - v.az;
    var px = x - v.ax, py = y - v.ay, pz = z - v.az;
    var len2 = ax * ax + ay * ay + az * az;
    var t = len2 > 0 ? (px * ax + py * ay + pz * az) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var dx = px - ax * t, dy = py - ay * t, dz = pz - az * t;
    return dx * dx + dy * dy + dz * dz <= v.r * v.r;
  }

  function isFixed(spec, x, y, z) {
    var i;
    if (spec.cyl) {
      for (i = 0; i < spec.cyl.length; i++) {
        if (inCylinder(x, y, z, spec.cyl[i])) return true;
      }
    }
    if (spec.box) {
      for (i = 0; i < spec.box.length; i++) {
        if (inBox(x, y, z, spec.box[i])) return true;
      }
    }
    if (spec.cap) {
      for (i = 0; i < spec.cap.length; i++) {
        if (inCapsule(x, y, z, spec.cap[i])) return true;
      }
    }
    return false;
  }

  // Returns how many VERTICES at the head of the unnamed group belong to the
  // map rather than to the tower, having reordered `arrays` so they are
  // contiguous. Zero means nothing on this model is ground-fixed.
  //
  // Only the unnamed group is touched. The animated groups that follow it own
  // explicit (first, count) ranges and their own per-frame matrices; shuffling
  // a triangle across that boundary would hand the bolt's pose to the stock.
  function split(name, model, arrays) {
    var spec = FIXED[name];
    if (!spec) return 0;
    var groups = model.groups;
    // A model exported with a real `world_fixed` group needs none of this.
    for (var g = 0; g < groups.length; g++) {
      if (groups[g].name === "world_fixed") return 0;
    }
    var count = groups.length ? groups[0].count : model.triangles * 3;
    if (!count) return 0;

    var pos = arrays.positions;
    var uf = componentsOf(pos, model.triangles, 0, count);

    // Accumulate each component's centre, then decide the whole component at
    // once. Classifying per triangle would tear a crate in half at the exact
    // radius the volume happens to cut through.
    var sums = Object.create(null);
    var t, root;
    for (t = 0; t * 3 < count; t++) {
      root = uf.find(t * 3);
      var s = sums[root];
      if (!s) s = sums[root] = { n: 0, x: 0, y: 0, z: 0, minZ: Infinity };
      for (var v = 0; v < 3; v++) {
        var p = (t * 3 + v) * 3;
        s.x += pos[p]; s.y += pos[p + 1]; s.z += pos[p + 2];
        if (pos[p + 2] < s.minZ) s.minZ = pos[p + 2];
        s.n++;
      }
    }
    var fixed = Object.create(null);
    var anyFixed = false;
    for (var k in sums) {
      var c = sums[k];
      // A THING BOLTED TO THE MAP RESTS ON THE MAP. So a component that dips
      // below the ground plane cannot be one, whatever volume it falls inside.
      //
      // This is the whole guard, and it is doing real work: the Riflemen are
      // authored with their origin at hip height and their legs running to
      // z = -0.5, so a volume drawn around the B5 dais -- which is centred on
      // him, because he stands on it -- also enclosed his shins and part of his
      // torso, and froze them. Every ground prop on every model starts at
      // z = 0 by construction; nothing else does.
      if (c.minZ < GROUND_EPS) { fixed[k] = false; continue; }
      var hit = isFixed(spec, c.x / c.n, c.y / c.n, c.z / c.n);
      fixed[k] = hit;
      if (hit) anyFixed = true;
    }
    if (!anyFixed) return 0;

    // Stable partition into [fixed ... turning ...], carrying all three vertex
    // arrays together so a triangle keeps its own normals and colours.
    var order = [];
    var tail = [];
    for (t = 0; t * 3 < count; t++) {
      (fixed[uf.find(t * 3)] ? order : tail).push(t);
    }
    var fixedTris = order.length;
    order = order.concat(tail);

    var src = { positions: arrays.positions, normals: arrays.normals,
                colors: arrays.colors, emissive: arrays.emissive };
    var outP = new Float32Array(count * 3);
    var outN = new Float32Array(count * 3);
    var outC = new Float32Array(count * 3);
    var outE = src.emissive ? new Float32Array(count) : null;
    for (var i = 0; i < order.length; i++) {
      var from = order[i] * 9;
      var to = i * 9;
      for (var j = 0; j < 9; j++) {
        outP[to + j] = src.positions[from + j];
        outN[to + j] = src.normals[from + j];
        outC[to + j] = src.colors[from + j];
      }
      if (outE) {
        for (j = 0; j < 3; j++) outE[i * 3 + j] = src.emissive[order[i] * 3 + j];
      }
    }
    arrays.positions.set(outP, 0);
    arrays.normals.set(outN, 0);
    arrays.colors.set(outC, 0);
    if (outE) arrays.emissive.set(outE, 0);
    return fixedTris * 3;
  }

  return { split: split, volumes: FIXED };
})();
