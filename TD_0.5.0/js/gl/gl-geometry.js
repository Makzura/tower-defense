// ---------------------------------------------------------------------------
// Geometry built at runtime: the ground, and the road that crosses it.
//
// The units and the towers come out of Blender, but the BOARD cannot: its
// shape is decided by `Maps` at run time, six different routes, some of them
// generated. So it is extruded here from the same polyline the simulation
// walks -- which means the road you see and the road enemies path along are
// the same list of points, and they cannot drift apart the way a hand-drawn
// backdrop would.
//
// MITRED, NOT STAMPED. The obvious way to draw a thick polyline is a quad per
// segment, and it leaves a wedge-shaped gap on the outside of every bend. Each
// vertex here gets one offset direction shared by both its segments -- the
// mitre -- so the ribbon is continuous. The mitre length is clamped, because
// on a hairpin it goes to infinity and would fire a spike across the map.
// ---------------------------------------------------------------------------

var GLGeometry = (function () {
  "use strict";

  // Accumulates triangles. Flat shading, so each triangle writes its own
  // normal three times: the duplication is the point, not an oversight.
  //
  // `emi` is the same per-vertex emission channel the Blender exporter emits,
  // carried here so runtime-built geometry can own a lit surface too. Board
  // scenery needs it: a reactor core or a holo plinth that glows because the
  // GEOMETRY glows is occluded by whatever stands in front of it, which is the
  // whole difference between a lamp and a sticker (see AGENTS.md, "Light comes
  // from emissive materials, not from a sprite over the top").
  function Builder() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.emi = [];
  }

  Builder.prototype.tri = function (a, b, c, color, emissive) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var nx = uy * vz - uz * vy;
    var ny = uz * vx - ux * vz;
    var nz = ux * vy - uy * vx;
    var l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    var e = emissive || 0;
    var v = [a, b, c];
    for (var i = 0; i < 3; i++) {
      this.pos.push(v[i][0], v[i][1], v[i][2]);
      this.nrm.push(nx, ny, nz);
      this.col.push(color[0], color[1], color[2]);
      this.emi.push(e);
    }
    return this;
  };

  // Wound counter-clockwise seen from the side the normal points at, so back
  // faces cull correctly.
  Builder.prototype.quad = function (a, b, c, d, color, emissive) {
    return this.tri(a, b, c, color, emissive).tri(a, c, d, color, emissive);
  };

  Builder.prototype.build = function (renderer) {
    return renderer.mesh(this.pos, this.nrm, this.col, this.emi);
  };

  Builder.prototype.count = function () { return this.pos.length / 3; };

  // A sphere resting on z = 0 -- the 3D spelling of the 2D game's circle
  // enemies. Low-poly on purpose: the board's whole art style is faceted, and
  // a 12x8 sphere at 22 px reads identically to a 48x32 one.
  function sphere(builder, cx, cy, r, color, lift, segments, rings, emissive) {
    segments = segments || 12;
    rings = rings || 8;
    var zc = (lift || 0) + r;   // centre height: resting on the ground
    for (var ring = 0; ring < rings; ring++) {
      var phi0 = Math.PI * ring / rings, phi1 = Math.PI * (ring + 1) / rings;
      for (var s = 0; s < segments; s++) {
        var th0 = Math.PI * 2 * s / segments;
        var th1 = Math.PI * 2 * (s + 1) / segments;
        function at(phi, th) {
          return [cx + r * Math.sin(phi) * Math.cos(th),
                  cy + r * Math.sin(phi) * Math.sin(th),
                  zc + r * Math.cos(phi)];
        }
        var a = at(phi0, th0), b = at(phi0, th1),
            c = at(phi1, th1), d = at(phi1, th0);
        // WOUND OUTWARD. Every one of these three windings was reversed, so a
        // sphere's normals all pointed at its own centre. With CULL_FACE/BACK
        // enabled the near wall was culled and what you actually saw was the
        // inside of the far wall -- which is why the sphere enemies and the
        // Tyrant read as hollow shells lit from the wrong side.
        //
        // Audited, not eyeballed: for a convex solid an outward normal must
        // satisfy dot(n, face_centre - centroid) > 0. This scored 0 outward /
        // 168 inward before the change. cylinder, box and frustum in this same
        // file were already correct, which is why only the round things looked
        // wrong. td_mesh.ball carried the identical bug offline.
        if (ring === 0) builder.tri(a, d, c, color, emissive);
        else if (ring === rings - 1) builder.tri(a, c, b, color, emissive);
        else builder.quad(a, d, c, b, color, emissive);
      }
    }
    return builder;
  }

  // AN ELLIPSOID CENTRED ON ITS OWN MIDDLE -- the shield bubble, and the first
  // runtime solid here that is not a body or a piece of board.
  //
  // WHY NOT `sphere` ABOVE. A bubble has to enclose the body it belongs to, and
  // bodies are not round: the beacon stands 60 board px tall inside a 15 px
  // radius, so a sphere big enough to contain it is four times too wide and
  // reads as a balloon the enemy is standing in. Two radii is the whole
  // difference, and `renderer.draw` scales uniformly, so the aspect cannot be
  // supplied at draw time -- it has to be in the mesh.
  //
  // DELIBERATELY NOT A REFACTOR OF `sphere`. That function builds geometry that
  // is already on the board (every sphere enemy and the Tyrant's stand-in), and
  // rewriting it to delegate here would change the order its floats are
  // emitted in for no gain anyone can see. The winding note there applies word
  // for word: wound OUTWARD, because CULL_FACE/BACK otherwise shows the inside
  // of the far wall.
  //
  // CONVEX AND CLOSED, WHICH IS WHAT MAKES IT SAFE TO BLEND. With back faces
  // culled, exactly one surface of a convex solid covers any given pixel, so
  // the double-blend that forced the camo bodies into a depth pre-pass
  // (GLRenderer.setFade) cannot happen here -- there is no second layer to
  // blend. It is a property of the shape, not a tolerance.
  function ellipsoid(builder, cx, cy, cz, rx, rz, color, segments, rings,
                     emissive) {
    segments = segments || 14;
    rings = rings || 9;
    function at(phi, th) {
      return [cx + rx * Math.sin(phi) * Math.cos(th),
              cy + rx * Math.sin(phi) * Math.sin(th),
              cz + rz * Math.cos(phi)];
    }
    for (var ring = 0; ring < rings; ring++) {
      var phi0 = Math.PI * ring / rings, phi1 = Math.PI * (ring + 1) / rings;
      for (var s = 0; s < segments; s++) {
        var th0 = Math.PI * 2 * s / segments;
        var th1 = Math.PI * 2 * (s + 1) / segments;
        var a = at(phi0, th0), b = at(phi0, th1),
            c = at(phi1, th1), d = at(phi1, th0);
        if (ring === 0) builder.tri(a, d, c, color, emissive);
        else if (ring === rings - 1) builder.tri(a, c, b, color, emissive);
        else builder.quad(a, d, c, b, color, emissive);
      }
    }
    return builder;
  }

  // A capped cylinder standing on z = 0 -- the placeholder body for a tower
  // whose Blender model has not been exported yet.
  function cylinder(builder, cx, cy, r, h, color, lift, verts) {
    verts = verts || 12;
    var z0 = lift || 0, z1 = z0 + h;
    for (var s = 0; s < verts; s++) {
      var th0 = Math.PI * 2 * s / verts;
      var th1 = Math.PI * 2 * (s + 1) / verts;
      var x0 = cx + r * Math.cos(th0), y0 = cy + r * Math.sin(th0);
      var x1 = cx + r * Math.cos(th1), y1 = cy + r * Math.sin(th1);
      builder.quad([x0, y0, z0], [x1, y1, z0], [x1, y1, z1], [x0, y0, z1],
        color);
      builder.tri([cx, cy, z1], [x0, y0, z1], [x1, y1, z1], color);
    }
    return builder;
  }

  function hex(value) {
    var s = String(value).replace("#", "");
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    // sRGB -> linear, the EXACT curve. This was an approximate 2.0 gamma back
    // when the shader lit sRGB values directly; now that the shader lights in
    // linear and converts once on output, the map's colours and the models'
    // have to travel the same curve or the road and the man standing on it
    // disagree about what a given hex means. Same function as
    // GLModels.toLinear and as td_scene.srgb() in Blender.
    function c(byte) {
      var f = byte / 255;
      return f <= 0.04045 ? f / 12.92 : Math.pow((f + 0.055) / 1.055, 2.4);
    }
    return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)];
  }

  // A flat slab. `z` is its top surface; it has no underside because nothing
  // ever gets below the board.
  function ground(builder, minX, minY, maxX, maxY, z, color) {
    builder.quad([minX, minY, z], [maxX, minY, z], [maxX, maxY, z],
      [minX, maxY, z], color);
    return builder;
  }

  function perp(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  }

  // The road: a raised ribbon with visible kerbs, extruded along `points`.
  //
  // `lift` is what the 2D game fakes by drawing a lighter top and a darker
  // edge. Here it is real height, which is most of why the board reads as 3D
  // at all the moment the camera tilts.
  function road(builder, points, width, lift, topColor, sideColor) {
    if (!points || points.length < 2) return builder;
    var half = width / 2;
    var offs = [];

    for (var i = 0; i < points.length; i++) {
      var prev = points[i - 1], cur = points[i], next = points[i + 1];
      var p1 = prev ? perp(prev.x, prev.y, cur.x, cur.y) : null;
      var p2 = next ? perp(cur.x, cur.y, next.x, next.y) : null;
      var m;
      if (p1 && p2) {
        var mx = p1[0] + p2[0], my = p1[1] + p2[1];
        var ml = Math.hypot(mx, my) || 1;
        mx /= ml; my /= ml;
        // Mitre length: 1/cos(half-angle). Clamped at 2.5 so a hairpin makes a
        // blunt corner rather than a spike several screens long.
        var scale = Math.min(2.5, 1 / Math.max(0.35, mx * p1[0] + my * p1[1]));
        m = [mx * scale, my * scale];
      } else {
        m = p1 || p2;
      }
      offs.push([cur.x + m[0] * half, cur.y + m[1] * half,
                 cur.x - m[0] * half, cur.y - m[1] * half]);
    }

    for (var s = 0; s + 1 < offs.length; s++) {
      var a = offs[s], b = offs[s + 1];
      var lA = [a[0], a[1], lift], rA = [a[2], a[3], lift];
      var lB = [b[0], b[1], lift], rB = [b[2], b[3], lift];
      builder.quad(rA, rB, lB, lA, topColor);              // deck
      // KERBS, wound so their normals point OUTWARD.
      //
      // Both of these used to be wound the other way round, which put both
      // normals on the inside of the ribbon. With CULL_FACE/BACK enabled in
      // GLRenderer that culled every kerb on every frame, so the road had no
      // sides at all and the "raised ribbon" this file's header describes has
      // never actually been on screen -- it rendered as a painted stripe.
      // Worked through for a road along +X, half-width 10, lift 7: the +Y kerb
      // gave u x v = (0,-700,0), pointing back across the road, and the -Y kerb
      // gave (0,+700,0), likewise inward.
      builder.quad(lA, lB, [b[0], b[1], 0], [a[0], a[1], 0], sideColor);
      builder.quad([a[2], a[3], 0], [b[2], b[3], 0], rB, rA, sideColor);
    }
    return builder;
  }

  // A box standing on z = 0, centred on x/y. Stand-in geometry, and the shape
  // the debug grid markers are made of.
  function box(builder, cx, cy, sx, sy, sz, color, z0) {
    var x0 = cx - sx / 2, x1 = cx + sx / 2;
    var y0 = cy - sy / 2, y1 = cy + sy / 2;
    var zA = z0 || 0, zB = zA + sz;
    builder.quad([x0, y0, zB], [x1, y0, zB], [x1, y1, zB], [x0, y1, zB], color);
    builder.quad([x0, y0, zA], [x1, y0, zA], [x1, y0, zB], [x0, y0, zB], color);
    builder.quad([x1, y1, zA], [x0, y1, zA], [x0, y1, zB], [x1, y1, zB], color);
    builder.quad([x1, y0, zA], [x1, y1, zA], [x1, y1, zB], [x1, y0, zB], color);
    builder.quad([x0, y1, zA], [x0, y0, zA], [x0, y0, zB], [x0, y1, zB], color);
    return builder;
  }

  // A tapered capped column. The workhorse of the scenery vocabulary: a mast,
  // a pylon, a reactor shell and a vent stack are all this shape with different
  // ratios, which is what keeps ten prop kinds looking like one factory made
  // them.
  function frustum(builder, cx, cy, r0, r1, h, color, z0, verts, emissive) {
    verts = verts || 8;
    var zA = z0 || 0, zB = zA + h;
    for (var s = 0; s < verts; s++) {
      var t0 = Math.PI * 2 * s / verts, t1 = Math.PI * 2 * (s + 1) / verts;
      var c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      builder.quad([cx + r0 * c0, cy + r0 * s0, zA], [cx + r0 * c1, cy + r0 * s1, zA],
                   [cx + r1 * c1, cy + r1 * s1, zB], [cx + r1 * c0, cy + r1 * s0, zB],
                   color, emissive);
      if (r1 > 0.0001) {
        builder.tri([cx, cy, zB], [cx + r1 * c0, cy + r1 * s0, zB],
                    [cx + r1 * c1, cy + r1 * s1, zB], color, emissive);
      }
    }
    return builder;
  }

  // A box standing on z0, centred on x/y, turned `rot` about its own axis.
  // The authored scenery carries a rotation per prop and a board of props all
  // facing due north reads as wallpaper.
  function boxAt(builder, cx, cy, sx, sy, sz, color, z0, rot, emissive) {
    var co = Math.cos(rot || 0), si = Math.sin(rot || 0);
    var hx = sx / 2, hy = sy / 2, zA = z0 || 0, zB = zA + sz;
    function p(dx, dy, z) { return [cx + dx * co - dy * si, cy + dx * si + dy * co, z]; }
    var a = p(-hx, -hy, zB), b = p(hx, -hy, zB), c = p(hx, hy, zB), d = p(-hx, hy, zB);
    var e = p(-hx, -hy, zA), f = p(hx, -hy, zA), g2 = p(hx, hy, zA), h2 = p(-hx, hy, zA);
    builder.quad(a, b, c, d, color, emissive);
    builder.quad(e, f, b, a, color, emissive);
    builder.quad(g2, h2, d, c, color, emissive);
    builder.quad(f, g2, c, b, color, emissive);
    builder.quad(h2, e, a, d, color, emissive);
    return builder;
  }

  // A SQUARE PRISM BETWEEN TWO POINTS IN SPACE, which is the one shape the
  // three primitives above cannot make: `frustum` and `cylinder` stand upright
  // and `boxAt` only ever turns about z. A leaning trunk, a branch reaching up
  // and out, a stake driven into the ground at an angle and a plank nailed
  // across a barricade are all this.
  //
  // The reference vector is chosen away from the segment's own direction, or
  // the cross product collapses and the prism comes out with no width -- which
  // is exactly the case a vertical post hits, and vertical posts are most of
  // what a camp is built from.
  function segment(builder, ax, ay, az, bx, by, bz, r, color, emissive) {
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return builder;
    dx /= len; dy /= len; dz /= len;
    // Up unless the segment is itself near-vertical, in which case +X.
    var ux = 0, uy = 0, uz = 1;
    if (Math.abs(dz) > 0.9) { ux = 1; uz = 0; }
    var px = dy * uz - dz * uy, py = dz * ux - dx * uz, pz = dx * uy - dy * ux;
    var pl = Math.sqrt(px * px + py * py + pz * pz);
    px /= pl; py /= pl; pz /= pl;
    var qx = dy * pz - dz * py, qy = dz * px - dx * pz, qz = dx * py - dy * px;

    function corner(x, y, z, su, sv) {
      return [x + (px * su + qx * sv) * r,
              y + (py * su + qy * sv) * r,
              z + (pz * su + qz * sv) * r];
    }
    var a0 = corner(ax, ay, az, -1, -1), a1 = corner(ax, ay, az, 1, -1);
    var a2 = corner(ax, ay, az, 1, 1), a3 = corner(ax, ay, az, -1, 1);
    var b0 = corner(bx, by, bz, -1, -1), b1 = corner(bx, by, bz, 1, -1);
    var b2 = corner(bx, by, bz, 1, 1), b3 = corner(bx, by, bz, -1, 1);
    builder.quad(b1, b0, a0, a1, color, emissive);
    builder.quad(b2, b1, a1, a2, color, emissive);
    builder.quad(b3, b2, a2, a3, color, emissive);
    builder.quad(b0, b3, a3, a0, color, emissive);
    builder.quad(b1, b2, b3, b0, color, emissive);
    builder.quad(a0, a3, a2, a1, color, emissive);
    return builder;
  }

  // --- board scenery -------------------------------------------------------
  //
  // The six maps each author nine props (js/maps.js ENVIRONMENTS[].models) and
  // the 3D board used to ignore every one of them, so the board was a bare
  // plane with a road on it. These are those props as real geometry.
  //
  // Every kind is built from the map's OWN palette, so a prop on Mana Coil is
  // violet and the same prop on Sigil Lattice is green without a second table
  // to keep in step. Value ladder per AGENTS.md: the biggest surface takes the
  // darkest value, the ley accent is the only bright note, and the accent is
  // EMISSIVE so it survives being in shadow.
  //
  // Baked into the static map mesh, so nine props cost no draw calls and no
  // per-frame work at all.
  var EMI = 2.6;

  // THE PROPS THAT ARE NOT MACHINERY.
  //
  // The ten kinds below the switch are one facility's equipment and they all
  // stand on the same manufactured footing, which is what makes them read as a
  // set. A dead tree does not stand on a milled plinth and a sandbag wall was
  // not delivered on one, so the forest kinds are listed here and skip it.
  // Membership is the ONLY thing this list decides -- each kind still builds
  // its own geometry in the same switch.
  var WILD = {
    tree: 1, snag: 1, stump: 1, log: 1, brush: 1,
    barricade: 1, spikes: 1, sandbags: 1, watchtower: 1, wreck: 1,
    barrel: 1, fence: 1,
    // Ironwood Frontier's own vocabulary. NOTHING here is shared with the dead
    // forest above it: those are bare snapped stems on black dirt and these are
    // a living wood, a settlement and a machine. Two boards that share prop
    // kinds read as one location with the lights changed.
    ironwood: 1, deadfall: 1, fern: 1, mossrock: 1, ridge: 1,
    boulder: 1, outcrop: 1, trunk: 1, platform: 1,
    house: 1, townhall: 1, storehouse: 1, workshop: 1,
    gate: 1, palisade: 1, lantern: 1,
    depot: 1, "depot-ramp": 1, wheel: 1, exhaust: 1, floodlight: 1
  };

  // A CLOSED IRREGULAR MASS, which is what a rock is and what a cylinder is not.
  //
  // Built as stacked rings whose radius wobbles per ring AND per vertex, all
  // seeded from the prop's own position -- so every boulder on the board has a
  // different profile, the same boulder has the same one every frame, and none
  // of them reads as "a cylinder". The top ring is pulled in so the silhouette
  // closes instead of ending in a flat lid.
  function lumpyMass(builder, cx, cy, r, h, color, z0, rings, squash, seed) {
    var prev = null;
    for (var ring = 0; ring <= rings; ring++) {
      var t = ring / rings;
      // Fattest a third of the way up, like a stone settled into dirt.
      var profile = Math.sin((0.25 + t * 0.72) * Math.PI);
      var rr = r * profile * (0.86 + wobble(cx, cy, seed + ring) * 0.28);
      var z = z0 + h * t;
      if (prev !== null) {
        // Each band is its own frustum, so the sides step and catch light
        // rather than sweeping smoothly.
        frustum(builder, cx, cy, prev.r, rr, z - prev.z, color, prev.z,
          6 + (ring % 2));
      }
      prev = { r: rr, z: z };
    }
    // Two shoulder blocks, off-centre, so no silhouette is symmetrical.
    for (var b = 0; b < 2; b++) {
      var ba = wobble(cx, cy, seed + 40 + b) * Math.PI * 2;
      var bd = r * (0.34 + wobble(cx, cy, seed + 50 + b) * 0.26);
      boxAt(builder, cx + Math.cos(ba) * bd, cy + Math.sin(ba) * bd * squash,
        r * 0.52, r * 0.44, h * (0.28 + wobble(cx, cy, seed + 60 + b) * 0.24),
        color, z0 + h * (0.12 + wobble(cx, cy, seed + 70 + b) * 0.30), ba);
    }
  }

  // A PITCHED-ROOF BUILDING, assembled rather than extruded: a body, a roof
  // made of two leaning slabs, a ridge, a door and lit windows. The roof is the
  // whole point -- a box with a texture on it still reads as a box, and a
  // settlement of boxes is the failure the brief names.
  function cabin(builder, cx, cy, w, d, wallH, roofH, wall, roof, warm, rot) {
    boxAt(builder, cx, cy, w, d, wallH, wall, 0, rot);
    var pitch = 5;
    for (var i = 0; i < pitch; i++) {
      var t = i / (pitch - 1);
      var half = (w / 2) * (1 - t) * 1.08;
      boxAt(builder, cx, cy, half * 2, d * 1.10, roofH / pitch * 1.6, roof,
        wallH + roofH * t * 0.92, rot);
    }
    // The ridge beam, proud of the roof so the top edge is a line and not a
    // fade.
    boxAt(builder, cx, cy, w * 0.10, d * 1.14, roofH * 0.10, wall,
      wallH + roofH * 0.96, rot);
    // Door, and two lit windows either side of it.
    boxAt(builder, cx + Math.cos(rot) * (d / 2), cy + Math.sin(rot) * (d / 2),
      w * 0.22, d * 0.08, wallH * 0.62, roof, 0, rot);
    for (var q = -1; q <= 1; q += 2) {
      boxAt(builder,
        cx + Math.cos(rot + Math.PI / 2) * (w * 0.28) * q + Math.cos(rot) * (d / 2),
        cy + Math.sin(rot + Math.PI / 2) * (w * 0.28) * q + Math.sin(rot) * (d / 2),
        w * 0.16, d * 0.06, wallH * 0.26, warm, wallH * 0.42, rot, 2.4);
    }
  }

  // Deterministic per-prop variation, from the prop's own position.
  //
  // A forest of thirty identical trunks reads as wallpaper, and thirty
  // hand-authored variations are thirty numbers to keep in a map file. This is
  // the middle: the same tree at the same coordinates is the same tree on
  // every machine and every run -- which matters, because the board mesh is
  // built once per map and a prop that moved between builds would be a prop
  // that moved when the player restarted.
  function wobble(cx, cy, salt) {
    var h = Math.imul((cx * 73856093) ^ (cy * 19349663) ^ (salt * 83492791), 2654435761);
    return ((h >>> 8) & 0xffff) / 0xffff;
  }

  // A DEAD STEM, which is the one shape the whole forest is made of.
  //
  // Built from two LEANING segments rather than one upright frustum, and the
  // lean grows with the square of the height so the base still meets the dirt
  // square. A plantation of perfectly straight poles reads as a fence; this is
  // meant to read as something that died standing up.
  //
  // The limbs reach UP as well as out. A branch drawn flat reads as a plank
  // nailed to the trunk, which is the failure the first pass had.
  function deadStem(builder, cx, cy, size, rot, bark, tallness) {
    var r = size / 2;
    var lx = (wobble(cx, cy, 1) - 0.5) * 0.30;
    var ly = (wobble(cx, cy, 2) - 0.5) * 0.30;
    var h = size * tallness * (0.82 + wobble(cx, cy, 3) * 0.36);
    function at(f) {
      return [cx + lx * h * f * f, cy + ly * h * f * f, size * 0.08 + (h - size * 0.08) * f];
    }
    var mid = at(0.55), top = at(1);

    // Root flare, so the trunk grows out of the dirt instead of being pushed
    // into it.
    frustum(builder, cx, cy, r * 0.36, r * 0.22, size * 0.14, bark, 0, 7);
    segment(builder, cx, cy, size * 0.05, mid[0], mid[1], mid[2], r * 0.15, bark);
    segment(builder, mid[0], mid[1], mid[2], top[0], top[1], top[2], r * 0.08, bark);

    var limbs = 2 + Math.floor(wobble(cx, cy, 4) * 3);
    for (var i = 0; i < limbs; i++) {
      var base = at(0.50 + i * 0.14);
      var a = rot + wobble(cx, cy, 20 + i) * Math.PI * 2;
      var reach = size * (0.30 + wobble(cx, cy, 30 + i) * 0.30);
      segment(builder, base[0], base[1], base[2],
        base[0] + Math.cos(a) * reach, base[1] + Math.sin(a) * reach,
        base[2] + reach * (0.35 + wobble(cx, cy, 40 + i) * 0.55),
        r * 0.05, bark);
    }
  }

  // A length the CALLER has already converted to world units, or a fallback.
  // Everything reaching this file is world space -- the map's pixel authoring
  // is converted once, in gl-world's model loop, exactly like `size` is.
  function worldOr(value, fallback) {
    return (typeof value === "number" && value > 0) ? value : fallback;
  }

  // A GAMEPLAY BLOCKER, DRAWN FROM THE SHAPE THAT BLOCKS.
  //
  // Not from a prop beside it with its own size. The five rocks on Ironwood
  // Frontier were authored twice -- once as a collision shape and once as a
  // scenery model -- and the two numbers were about a factor of two apart, so
  // every rock on the board had an invisible skirt of hitbox around it. The
  // owner's report was exactly that: "the hitbox of the obstacles does not
  // correspond with their visual".
  //
  // So there is one number now. This takes the COMPILED shape, in world units,
  // and the silhouette it draws at ground level IS that shape:
  //
  //   circle   base ring at exactly `radius`, jittered inward as it rises
  //   polygon  bottom face is the authored polygon, vertex for vertex
  //   capsule  a barrel of exactly `radius`, lying along a-b
  //
  // A rock may narrow as it rises -- real ones do, and the hitbox is a
  // footprint, so only the base has to agree. It must never grow outward, so
  // every jitter here scales DOWN from 1 and none of them scales up.
  //
  // LIGHT TOPS, DARK SIDES. The first version had it the other way round and
  // the outcrops disappeared into the forest floor: on a board this dark the
  // only thing separating a rock from the dirt is the face pointing at the sky.

  // A stack of rings, each a ring of [x, y, z], skinned with quads and capped.
  // Written here rather than reusing lumpyMass because that one is built around
  // a fixed profile and this needs the BASE ring to be exact.
  function skin(builder, rings, side, top) {
    var i, k;
    for (i = 0; i < rings.length - 1; i++) {
      var lo = rings[i], hi = rings[i + 1];
      for (k = 0; k < lo.length; k++) {
        var k2 = (k + 1) % lo.length;
        builder.quad(hi[k], hi[k2], lo[k2], lo[k], side);
      }
    }
    var cap = rings[rings.length - 1];
    var cx = 0, cy = 0, cz = 0;
    for (k = 0; k < cap.length; k++) { cx += cap[k][0]; cy += cap[k][1]; cz += cap[k][2]; }
    cx /= cap.length; cy /= cap.length; cz /= cap.length;
    for (k = 0; k < cap.length; k++) {
      builder.tri([cx, cy, cz], cap[k], cap[(k + 1) % cap.length], top);
    }
    return [cx, cy, cz];
  }

  function solid(builder, shape, P) {
    if (!shape) return builder;
    // LIGHT TOPS, DARK SIDES, and both of them STONE. The first version had
    // `metal` on the sides and `panel` on top -- panel is the darker of the two
    // on this board, so every rock was lit from underneath and sat darker than
    // the dirt around it. Five invisible rocks is worse than five wrong ones.
    var lit = P.rock || P.metal;                 // the faces pointing at the sky
    var body = P.rockDark || P.panel;            // everything turned away
    var dark = P.metalDark;
    var moss = P.accent2 || P.panel;
    var h = (typeof shape.height === "number" && isFinite(shape.height))
      ? shape.height : 40;
    var i, k, t;

    if (shape.shape === "circle") {
      // FRACTURED STONE, not a wedding cake. Every band is jittered per VERTEX
      // and its centre drifts, so no two bands share an axis and the silhouette
      // breaks up -- five coaxial rings of decreasing radius is a terraced cone
      // and reads as a debug shape, which is what the first version drew.
      var sides = 11, bands = 4, rings = [];
      for (i = 0; i <= bands; i++) {
        t = i / bands;
        var shrink = 1 - t * t * 0.62;              // slow at the base, fast at the top
        var ox = Math.cos(wobble(shape.x, shape.y, 500 + i) * 6.28) *
                 shape.radius * 0.10 * t;
        var oy = Math.sin(wobble(shape.x, shape.y, 510 + i) * 6.28) *
                 shape.radius * 0.10 * t;
        var ring = [];
        for (k = 0; k < sides; k++) {
          var a = k * Math.PI * 2 / sides;
          // The base ring is jittered too, but only INWARD of the radius, and
          // the two vertices nearest each axis stay out at it so the footprint
          // still reads as the circle it is.
          var j = 1 - wobble(shape.x + k * 3.1, shape.y - k * 2.7, 520 + i) *
                      (i === 0 ? 0.10 : 0.26);
          var rr = shape.radius * shrink * j;
          var zz = h * (t + wobble(shape.x + k, shape.y + k, 530 + i) * 0.08 * (i ? 1 : 0));
          ring.push([shape.x + ox + Math.cos(a) * rr,
                     shape.y + oy + Math.sin(a) * rr, zz]);
        }
        rings.push(ring);
      }
      var crown = skin(builder, rings, body, lit);
      // Lichen on the shoulder, where water sits.
      sphere(builder, crown[0] - shape.radius * 0.24, crown[1] + shape.radius * 0.20,
        shape.radius * 0.17, moss, h * 0.72, 6, 4);
      return builder;
    }

    if (shape.shape === "polygon") {
      // BEDROCK: the authored footprint, extruded in tiers that step in toward
      // the centroid with a tilted, broken crown.
      var pts = shape.points, n = pts.length;
      var pcx = 0, pcy = 0;
      for (i = 0; i < n; i++) { pcx += pts[i][0]; pcy += pts[i][1]; }
      pcx /= n; pcy /= n;
      // A shallow tilt across the whole slab, so the top is a plane at an angle
      // rather than a flat lid -- the single cheapest thing that makes an
      // extruded polygon read as rock.
      var tiltA = wobble(pcx, pcy, 560) * 6.28;
      var tiltK = h * 0.22;
      var prings = [];
      [[1.00, 0.00], [0.80, 0.62], [0.46, 1.00]].forEach(function (tier, ti) {
        prings.push(pts.map(function (pt, pi) {
          var kk = ti === 0 ? 1 : tier[0] *
            (1 - wobble(pt[0], pt[1], 570 + ti + pi) * 0.16);
          var px = pcx + (pt[0] - pcx) * kk, py = pcy + (pt[1] - pcy) * kk;
          var lean = ti === 0 ? 0 :
            (Math.cos(tiltA) * (px - pcx) + Math.sin(tiltA) * (py - pcy)) /
            Math.max(1, shapeSpan(pts, pcx, pcy)) * tiltK;
          return [px, py, h * tier[1] + lean];
        }));
      });
      skin(builder, prings, ti0Colour(prings, body, lit), lit);
      return builder;
    }

    if (shape.shape === "capsule") {
      // A FALLEN LOG. Its cross-section is a circle of the capsule's own
      // radius, so it rests with its crown at exactly twice that -- which is
      // why the map declares `height` as 2 * radius for every capsule and a
      // test says so.
      //
      // Built as a real barrel rather than through `segment`, which extrudes a
      // FOUR-sided prism: at a log's proportions that is a black box lying in
      // the clearing, which is precisely what it looked like.
      barrel(builder, shape.a.x, shape.a.y, shape.b.x, shape.b.y,
        shape.radius, 9, body, lit);
      var ang = Math.atan2(shape.b.y - shape.a.y, shape.b.x - shape.a.x);
      for (i = 0; i < 2; i++) {
        var f = 0.34 + i * 0.32;
        var sx = shape.a.x + (shape.b.x - shape.a.x) * f;
        var sy = shape.a.y + (shape.b.y - shape.a.y) * f;
        var sa = ang + (i ? 1.9 : -2.1);
        barrel(builder, sx, sy, sx + Math.cos(sa) * shape.radius * 1.6,
          sy + Math.sin(sa) * shape.radius * 1.6, shape.radius * 0.30, 5, dark, dark);
      }
      sphere(builder, shape.a.x, shape.a.y, shape.radius * 0.55, moss,
        shape.radius * 1.6, 6, 4);
      return builder;
    }
    return builder;
  }

  // How wide a polygon is, for scaling a tilt across it.
  function shapeSpan(pts, cx, cy) {
    var m = 0;
    for (var i = 0; i < pts.length; i++) {
      m = Math.max(m, Math.hypot(pts[i][0] - cx, pts[i][1] - cy));
    }
    return m;
  }
  function ti0Colour(rings, body) { return body; }

  // A round barrel lying between two ground points, resting ON the ground: its
  // axis is one radius up, so the underside touches z = 0 and the crown is at
  // 2r. Capped at both ends.
  function barrel(builder, ax, ay, bx, by, r, sides, side, top) {
    var dx = bx - ax, dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return builder;
    var nx = -dy / len, ny = dx / len;
    var i, k;
    var ends = [];
    for (i = 0; i < 2; i++) {
      var ex = i ? bx : ax, ey = i ? by : ay;
      var ring = [];
      for (k = 0; k < sides; k++) {
        var a = k * Math.PI * 2 / sides;
        ring.push([ex + nx * Math.cos(a) * r, ey + ny * Math.cos(a) * r,
                   r + Math.sin(a) * r]);
      }
      ends.push(ring);
    }
    for (k = 0; k < sides; k++) {
      var k2 = (k + 1) % sides;
      var up = Math.sin(k * Math.PI * 2 / sides) > 0.25;
      builder.quad(ends[1][k2], ends[1][k], ends[0][k], ends[0][k2],
        up ? top : side);
    }
    for (i = 0; i < 2; i++) {
      var cx = i ? bx : ax, cy = i ? by : ay;
      for (k = 0; k < sides; k++) {
        builder.tri([cx, cy, r], ends[i][k], ends[i][(k + 1) % sides], side);
      }
    }
    return builder;
  }

  function scenery(builder, kind, cx, cy, size, rot, P, model) {
    model = model || {};
    var r = size / 2;
    var dark = P.metalDark, body = P.metal, trim = P.panel, ley = P.accent;

    // Every machine stands on the same footing, which is what makes them a set.
    if (!WILD[kind]) {
      frustum(builder, cx, cy, r * 0.92, r * 0.80, size * 0.10, dark, 0, 8);
    }

    switch (kind) {
      case "antenna":
        frustum(builder, cx, cy, r * 0.30, r * 0.10, size * 1.55, body, size * 0.10, 6);
        frustum(builder, cx, cy, r * 0.62, r * 0.22, size * 0.20, dark, size * 0.10, 6);
        // Dish: a shallow open cone, tipped by the prop's rotation.
        frustum(builder, cx, cy, r * 0.06, r * 0.52, size * 0.26, trim, size * 1.42, 10);
        frustum(builder, cx, cy, r * 0.16, r * 0.16, size * 0.05, ley, size * 1.68, 8, EMI);
        break;

      case "server":
        boxAt(builder, cx, cy, size * 0.78, size * 0.54, size * 0.86, dark, size * 0.08, rot);
        // Three lit slots. Thin, and the only bright thing on a dark rack.
        for (var i = 0; i < 3; i++) {
          boxAt(builder, cx, cy, size * 0.80, size * 0.10, size * 0.05, ley,
            size * (0.24 + i * 0.22), rot, EMI);
        }
        boxAt(builder, cx, cy, size * 0.86, size * 0.60, size * 0.07, body, size * 0.90, rot);
        break;

      case "reactor":
        frustum(builder, cx, cy, r * 0.86, r * 0.74, size * 0.30, dark, size * 0.08, 10);
        frustum(builder, cx, cy, r * 0.50, r * 0.50, size * 0.44, ley, size * 0.36, 10, EMI);
        frustum(builder, cx, cy, r * 0.80, r * 0.86, size * 0.30, dark, size * 0.78, 10);
        frustum(builder, cx, cy, r * 0.92, r * 0.92, size * 0.07, body, size * 1.02, 10);
        // Containment ribs, so the core reads as held rather than floating.
        for (var k = 0; k < 4; k++) {
          var a = rot + Math.PI * 2 * k / 4;
          boxAt(builder, cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74,
            size * 0.12, size * 0.12, size * 0.62, body, size * 0.30, a);
        }
        break;

      case "console":
        boxAt(builder, cx, cy, size * 0.90, size * 0.46, size * 0.34, dark, size * 0.08, rot);
        // The screen leans back toward the camera and is the lit face.
        boxAt(builder, cx - Math.sin(rot) * size * 0.10, cy + Math.cos(rot) * size * 0.10,
          size * 0.80, size * 0.09, size * 0.36, trim, size * 0.40, rot);
        boxAt(builder, cx - Math.sin(rot) * size * 0.10, cy + Math.cos(rot) * size * 0.10,
          size * 0.66, size * 0.04, size * 0.26, ley, size * 0.45, rot, EMI);
        break;

      case "pylon":
        frustum(builder, cx, cy, r * 0.56, r * 0.30, size * 1.30, body, size * 0.10, 6);
        frustum(builder, cx, cy, r * 0.44, r * 0.44, size * 0.10, trim, size * 0.72, 6);
        frustum(builder, cx, cy, r * 0.34, r * 0.02, size * 0.34, dark, size * 1.40, 6);
        sphere(builder, cx, cy, r * 0.20, ley, size * 1.30, 8, 6, EMI);
        break;

      case "tank":
        frustum(builder, cx, cy, r * 0.78, r * 0.78, size * 0.82, body, size * 0.08, 12);
        frustum(builder, cx, cy, r * 0.84, r * 0.84, size * 0.06, dark, size * 0.26, 12);
        frustum(builder, cx, cy, r * 0.84, r * 0.84, size * 0.06, dark, size * 0.62, 12);
        frustum(builder, cx, cy, r * 0.70, r * 0.46, size * 0.20, dark, size * 0.90, 12);
        boxAt(builder, cx, cy, size * 0.20, size * 0.06, size * 0.05, ley, size * 1.08, rot, EMI);
        break;

      case "vent":
        frustum(builder, cx, cy, r * 0.88, r * 0.72, size * 0.30, dark, size * 0.06, 10);
        frustum(builder, cx, cy, r * 0.46, r * 0.46, size * 0.40, body, size * 0.34, 10);
        // Louvre stack, and the heat inside it.
        frustum(builder, cx, cy, r * 0.30, r * 0.30, size * 0.10, ley, size * 0.40, 10, EMI * 0.7);
        frustum(builder, cx, cy, r * 0.86, r * 0.86, size * 0.08, body, size * 0.72, 10);
        frustum(builder, cx, cy, r * 0.72, r * 0.72, size * 0.06, dark, size * 0.80, 10);
        break;

      case "holo":
        frustum(builder, cx, cy, r * 0.70, r * 0.56, size * 0.26, dark, size * 0.08, 8);
        frustum(builder, cx, cy, r * 0.40, r * 0.40, size * 0.05, ley, size * 0.34, 8, EMI);
        // The projection itself: a floating faceted shard, turned off-axis so it
        // never reads as part of the plinth.
        frustum(builder, cx, cy, r * 0.05, r * 0.34, size * 0.34, ley, size * 0.52, 6, EMI * 0.55);
        frustum(builder, cx, cy, r * 0.34, r * 0.05, size * 0.34, ley, size * 0.86, 6, EMI * 0.55);
        break;

      case "battery":
        boxAt(builder, cx, cy, size * 0.92, size * 0.62, size * 0.20, dark, size * 0.08, rot);
        for (var b2 = 0; b2 < 3; b2++) {
          var off = (b2 - 1) * size * 0.28;
          var bx = cx + Math.cos(rot) * off, by = cy + Math.sin(rot) * off;
          frustum(builder, bx, by, size * 0.11, size * 0.11, size * 0.52, body, size * 0.26, 8);
          frustum(builder, bx, by, size * 0.13, size * 0.13, size * 0.06, ley, size * 0.76, 8, EMI);
        }
        break;

      case "coil":
        frustum(builder, cx, cy, r * 0.66, r * 0.52, size * 0.20, dark, size * 0.08, 10);
        frustum(builder, cx, cy, r * 0.14, r * 0.14, size * 1.10, body, size * 0.20, 6);
        // Three windings up the post, brightening toward the top so the eye
        // travels up it.
        for (var c2 = 0; c2 < 3; c2++) {
          frustum(builder, cx, cy, r * (0.62 - c2 * 0.10), r * (0.62 - c2 * 0.10),
            size * 0.12, trim, size * (0.30 + c2 * 0.30), 10);
          frustum(builder, cx, cy, r * (0.66 - c2 * 0.10), r * (0.66 - c2 * 0.10),
            size * 0.04, ley, size * (0.34 + c2 * 0.30), 10, EMI * (0.6 + c2 * 0.2));
        }
        sphere(builder, cx, cy, r * 0.17, ley, size * 1.22, 8, 6, EMI);
        break;

      // --- the dead forest ---------------------------------------------
      //
      // Nothing below here has a leaf on it, and nothing below here glows
      // except the fire in the barrel and the lamp on the watchtower. That is
      // the whole difference between this board and the other six: on a ley
      // line the light comes out of the scenery, and in the forest the scenery
      // is what is left when the light went out.

      // --- Ironwood Frontier ------------------------------------------
      //
      // A LIVING WOOD, a settlement and a machine. Every case below builds a
      // LAYERED silhouette on purpose: no important object on this board may
      // read as "a box", "a cylinder" or "three spheres", which is the bar the
      // flagship brief sets and the bar the first pass failed -- every prop
      // came out a grey cube because none of these cases existed.

      case "ironwood": {
        // Buttressed trunk, forking limbs, three canopy masses at different
        // heights. The fork angle, the lean, the canopy offsets and the ring
        // sizes are all drawn from the tree's own position, so eighty-odd of
        // them share no silhouette and none of them flickers.
        var iwLean = (wobble(cx, cy, 11) - 0.5) * 0.24;
        var iwH = size * (1.55 + wobble(cx, cy, 12) * 0.75);
        var forkZ = iwH * 0.52;
        var topX = cx + iwLean * iwH, topY = cy + iwLean * iwH * 0.6;

        // Buttress roots: four flares that meet the dirt square.
        for (var bu = 0; bu < 4; bu++) {
          var buA = bu * Math.PI / 2 + wobble(cx, cy, 13 + bu) * 1.2;
          segment(builder,
            cx + Math.cos(buA) * r * 0.42, cy + Math.sin(buA) * r * 0.42, 0,
            cx, cy, size * 0.30, r * 0.13, dark);
        }
        segment(builder, cx, cy, 0, topX * 0.5 + cx * 0.5, topY * 0.5 + cy * 0.5,
          forkZ, r * 0.22, dark);

        // Two limbs off the fork, each carrying its own canopy.
        var canopyColour = P.accent2 ? P.accent2 : trim;
        for (var lb = 0; lb < 2; lb++) {
          var lbA = rot + lb * Math.PI + wobble(cx, cy, 20 + lb) * 1.6;
          var lbR = size * (0.34 + wobble(cx, cy, 24 + lb) * 0.26);
          var lbX = topX + Math.cos(lbA) * lbR;
          var lbY = topY + Math.sin(lbA) * lbR;
          var lbZ = forkZ + iwH * (0.28 + wobble(cx, cy, 28 + lb) * 0.22);
          segment(builder, topX, topY, forkZ, lbX, lbY, lbZ, r * 0.10, dark);
          sphere(builder, lbX, lbY, size * (0.36 + wobble(cx, cy, 32 + lb) * 0.16),
            canopyColour, lbZ, 7, 5);
        }
        // The crown, largest and highest, sat over the fork.
        sphere(builder, topX, topY, size * (0.50 + wobble(cx, cy, 36) * 0.18),
          canopyColour, forkZ + iwH * 0.46, 8, 6);
        break;
      }

      case "ridge": {
        // A HILL ON THE HORIZON. Not a mountain in any detailed sense -- it is
        // hundreds of units away, behind four rings of trees and most of the
        // haze, and all it has to do is give the forest something to END
        // against. Without one the board reads as a bigger rectangle however
        // far the ground runs.
        //
        // Three overlapping ridges of different heights, each a low ring of
        // blocks with a wobbling profile, so the skyline is a jagged line
        // rather than a dome. Cheap: these are built once, never animated, and
        // there are twenty-two of them on the whole board.
        var rgH = size * (0.30 + wobble(cx, cy, 900) * 0.34);
        for (var mr = 0; mr < 3; mr++) {
          var mrA = rot + mr * 1.1 + wobble(cx, cy, 910 + mr) * 0.7;
          var mrD = size * (0.10 + mr * 0.16);
          var mrH = rgH * (1 - mr * 0.22);
          var mx2 = cx + Math.cos(mrA) * mrD, my2 = cy + Math.sin(mrA) * mrD;
          var slices = 5;
          for (var sl2 = 0; sl2 < slices; sl2++) {
            var t4 = sl2 / (slices - 1);
            var wob2 = 0.72 + wobble(cx, cy, 920 + mr * 8 + sl2) * 0.42;
            boxAt(builder, mx2, my2,
              size * (1.05 - t4 * 0.72) * wob2,
              size * (0.62 - t4 * 0.42) * wob2,
              mrH / slices * 1.7, dark, mrH * t4 * 0.86, mrA);
          }
        }
        break;
      }

      case "deadfall": {
        // Storm-thrown: a leaning snapped trunk with its root plate torn up
        // out of the ground. The plate is what stops this reading as a log.
        var dfA = rot + wobble(cx, cy, 5) * 1.4;
        var dfLen = size * (0.9 + wobble(cx, cy, 6) * 0.5);
        var bx2 = cx + Math.cos(dfA) * dfLen, by2 = cy + Math.sin(dfA) * dfLen;
        segment(builder, cx, cy, size * 0.30, bx2, by2, size * 0.10, r * 0.20, dark);
        // Root plate, on end.
        lumpyMass(builder, cx, cy, r * 0.62, size * 0.66, dark, 0, 3, 0.75, 90);
        for (var dfb = 0; dfb < 3; dfb++) {
          var t3 = 0.3 + dfb * 0.25;
          var bxx = cx + (bx2 - cx) * t3, byy = cy + (by2 - cy) * t3;
          var bz = size * 0.30 + (size * 0.10 - size * 0.30) * t3;
          var brA = dfA + (dfb % 2 ? 1.4 : -1.4);
          segment(builder, bxx, byy, bz,
            bxx + Math.cos(brA) * size * 0.30, byy + Math.sin(brA) * size * 0.30,
            bz + size * 0.22, r * 0.055, dark);
        }
        break;
      }

      case "fern":
        // Low fronds fanned from one crown. Thin segments leaning outward and
        // up, so the mass is airy rather than a dome.
        for (var fr = 0; fr < 7; fr++) {
          var frA = rot + fr * (Math.PI * 2 / 7) + wobble(cx, cy, 60 + fr) * 0.5;
          var frL = size * (0.34 + wobble(cx, cy, 70 + fr) * 0.20);
          segment(builder, cx, cy, size * 0.04,
            cx + Math.cos(frA) * frL, cy + Math.sin(frA) * frL,
            size * (0.26 + wobble(cx, cy, 80 + fr) * 0.16),
            r * 0.045, P.accent2 ? P.accent2 : trim);
        }
        break;

      case "mossrock":
        lumpyMass(builder, cx, cy, r * 0.80, size * 0.42, body, 0, 3, 0.78, 100);
        // The moss cap: a low, flat lens on the sunward shoulder.
        sphere(builder, cx - r * 0.10, cy - r * 0.12, r * 0.36,
          P.accent2 ? P.accent2 : trim, size * 0.30, 7, 4);
        break;

      case "boulder":
        // A GAMEPLAY BLOCKER, so it has to read as solid from any camera angle
        // and at any zoom. Tall enough to be a horizon, lumpy enough not to be
        // a cylinder, with a fractured cap and moss where water sits.
        lumpyMass(builder, cx, cy, r * 0.92, size * 0.86, body, 0, 4, 0.82, 200);
        boxAt(builder, cx + r * 0.18, cy - r * 0.14, r * 0.70, r * 0.58, size * 0.22,
          body, size * 0.66, rot + 0.6);
        sphere(builder, cx - r * 0.20, cy + r * 0.16, r * 0.30,
          P.accent2 ? P.accent2 : trim, size * 0.72, 6, 4);
        break;

      case "outcrop":
        // Bedrock breaking the surface: three tilted slabs rather than one
        // mass, so the silhouette has edges and the shadow has structure.
        for (var sl = 0; sl < 3; sl++) {
          var slA = rot + sl * 1.9 + wobble(cx, cy, 210 + sl) * 0.8;
          var slD = r * (0.20 + sl * 0.18);
          boxAt(builder, cx + Math.cos(slA) * slD, cy + Math.sin(slA) * slD * 0.8,
            r * (1.05 - sl * 0.20), r * (0.80 - sl * 0.14),
            size * (0.72 - sl * 0.16), body, 0, slA);
        }
        lumpyMass(builder, cx, cy, r * 0.60, size * 0.40, body, size * 0.40, 3, 0.8, 220);
        break;

      case "trunk": {
        // THE FALLEN TRUNK BLOCKER. Tapered, barked, with a torn end, two
        // branch stubs and a shallow lean -- resting ON the ground rather than
        // sunk into it, which is what a bare capsule always looks like.
        var tkLen = size * 0.92;
        var ax2 = cx - Math.cos(rot) * tkLen / 2, ay2 = cy - Math.sin(rot) * tkLen / 2;
        var bx3 = cx + Math.cos(rot) * tkLen / 2, by3 = cy + Math.sin(rot) * tkLen / 2;
        segment(builder, ax2, ay2, size * 0.19, bx3, by3, size * 0.15, r * 0.19, dark);
        // The torn end, splintered rather than cut.
        lumpyMass(builder, ax2, ay2, r * 0.26, size * 0.30, trim, size * 0.05, 2, 0.9, 300);
        for (var tb = 0; tb < 2; tb++) {
          var tbT = 0.34 + tb * 0.34;
          var tbX = ax2 + (bx3 - ax2) * tbT, tbY = ay2 + (by3 - ay2) * tbT;
          var tbA = rot + (tb ? 1.5 : -1.5);
          segment(builder, tbX, tbY, size * 0.17,
            tbX + Math.cos(tbA) * size * 0.26, tbY + Math.sin(tbA) * size * 0.26,
            size * 0.30, r * 0.06, dark);
        }
        break;
      }

      case "platform": {
        // A CUT TRUNK, and it has to survive being orbited: the camera goes all
        // the way round, so there is no "front" to hide a bad side on.
        //
        // The first version used the boulder's lumpy-mass helper and came out a
        // brown blob -- the owner's words were that it looked like the Summoner
        // wearing a different colour, which is exactly what a stack of jittered
        // rings looks like. A stump is not a rock: it is a CYLINDER with bark
        // on it, standing on roots, cut flat across the top. So it is built
        // that way -- a straight tapered barrel, vertical bark ridges around
        // it, a level cut face, and roots that flare out and DOWN into the
        // dirt so it is grown rather than dropped.
        //
        // HEIGHT COMES FROM THE MAP, never from `size`. The height field that
        // decides where a tower's feet go reads the same authored number, and
        // when this invented its own the two disagreed and every tower placed
        // on a stump sank into it.
        var pfH = worldOr(model.heightPx, size * 0.30);
        // THE BARREL'S BASE IS THE COLLISION RADIUS. `r` is half the prop size
        // and the barrel flares to pfR * 1.10 at the ground, so pfR is that
        // radius divided back out -- otherwise the widest part of the stump
        // stands three per cent outside the circle that refuses towers, which
        // is the same class of lie the rocks were telling at twice the scale.
        var pfR = r / 1.10;

        // Roots first: they flare from under the barrel and reach the ground,
        // which is what stops the trunk looking pushed into the floor.
        var roots = 6 + Math.floor(wobble(cx, cy, 401) * 3);
        for (var pr2 = 0; pr2 < roots; pr2++) {
          var prA = pr2 * (Math.PI * 2 / roots) + wobble(cx, cy, 410 + pr2) * 0.5;
          var reach = pfR * (1.02 + wobble(cx, cy, 420 + pr2) * 0.30);
          segment(builder,
            cx + Math.cos(prA) * pfR * 0.80, cy + Math.sin(prA) * pfR * 0.80,
            pfH * 0.34,
            cx + Math.cos(prA) * reach, cy + Math.sin(prA) * reach, 0,
            pfR * (0.13 + wobble(cx, cy, 430 + pr2) * 0.06), dark);
        }

        // The barrel: a straight taper, wider at the base, in one piece. A
        // cylinder reads as a stump the moment it has bark and a cut face on
        // it; a stack of wobbling rings never does.
        frustum(builder, cx, cy, pfR * 1.10, pfR, pfH, dark, 0, 11);

        // Bark: vertical ridges standing proud of the barrel, uneven in width
        // and depth, so the side catches light from every direction.
        var ridges = 9;
        for (var rg = 0; rg < ridges; rg++) {
          var rgA = rg * (Math.PI * 2 / ridges) + wobble(cx, cy, 440 + rg) * 0.30;
          var rgD = pfR * (0.92 + wobble(cx, cy, 450 + rg) * 0.10);
          var rgH = pfH * (0.62 + wobble(cx, cy, 460 + rg) * 0.36);
          boxAt(builder, cx + Math.cos(rgA) * rgD, cy + Math.sin(rgA) * rgD,
            pfR * (0.14 + wobble(cx, cy, 470 + rg) * 0.10), pfR * 0.16, rgH,
            dark, pfH * wobble(cx, cy, 480 + rg) * 0.20, rgA);
        }

        // THE CUT FACE, and it is PALE WOOD, not the theme's trim.
        //
        // Trim on this board is a mossy green, which made every stump top look
        // like a lily pad -- the one surface that has to read as "sawn timber
        // you may stand on" was reading as more undergrowth. Fresh heartwood is
        // its own colour and does not belong to the palette, the same way the
        // depot's door light does not.
        var cut = hex("#b9a074");
        var ring = hex("#8a734d");
        frustum(builder, cx, cy, pfR * 0.99, pfR * 0.97, pfH * 0.06, cut, pfH, 14);
        // Growth rings, and a saw scar across them.
        frustum(builder, cx, cy, pfR * 0.62, pfR * 0.60, pfH * 0.012, ring,
          pfH + pfH * 0.06, 14);
        frustum(builder, cx, cy, pfR * 0.30, pfR * 0.28, pfH * 0.010, cut,
          pfH + pfH * 0.07, 12);
        break;
      }

      case "house":
        cabin(builder, cx, cy, size * 0.92, size * 0.72, size * 0.52, size * 0.42,
          dark, body, ley, rot);
        break;

      case "workshop":
        cabin(builder, cx, cy, size * 0.86, size * 0.86, size * 0.46, size * 0.34,
          dark, body, ley, rot);
        // A lean-to and a chimney, so it is not the same house again.
        boxAt(builder, cx + Math.cos(rot + 1.6) * size * 0.52,
          cy + Math.sin(rot + 1.6) * size * 0.52,
          size * 0.34, size * 0.52, size * 0.30, body, 0, rot);
        boxAt(builder, cx - size * 0.26, cy - size * 0.20,
          size * 0.13, size * 0.13, size * 0.62, trim, size * 0.46, rot);
        break;

      case "storehouse":
        cabin(builder, cx, cy, size * 1.24, size * 0.70, size * 0.58, size * 0.34,
          dark, body, ley, rot);
        // Barrels and crates stacked along the long wall.
        for (var st = 0; st < 3; st++) {
          frustum(builder, cx + (st - 1) * size * 0.34,
            cy + Math.sin(rot) * size * 0.44 + size * 0.46,
            size * 0.09, size * 0.09, size * 0.20, trim, 0, 8);
        }
        break;

      case "townhall": {
        // THE SETTLEMENT'S LANDMARK. Two storeys, a wider ground floor, a
        // pitched roof and a bell tower over it -- the tallest thing west of
        // the road, and the silhouette a player navigates by.
        cabin(builder, cx, cy, size * 1.30, size * 1.00, size * 0.66, size * 0.46,
          dark, body, ley, rot);
        boxAt(builder, cx, cy, size * 0.98, size * 0.76, size * 0.42, dark,
          size * 1.12, rot);
        for (var th = 0; th < 4; th++) {
          boxAt(builder, cx, cy, size * (0.94 - th * 0.20), size * (0.72 - th * 0.15),
            size * 0.14, body, size * 1.54 + th * size * 0.12, rot);
        }
        // The bell tower and its lantern.
        boxAt(builder, cx, cy, size * 0.30, size * 0.30, size * 0.62, dark,
          size * 2.02, rot + 0.4);
        sphere(builder, cx, cy, size * 0.13, ley, size * 2.52, 8, 6, EMI);
        // A porch on the road side.
        for (var pc = -1; pc <= 1; pc += 2) {
          segment(builder, cx + Math.cos(rot) * size * 0.62 + pc * size * 0.34,
            cy + Math.sin(rot) * size * 0.62, 0,
            cx + Math.cos(rot) * size * 0.62 + pc * size * 0.34,
            cy + Math.sin(rot) * size * 0.62, size * 0.52, size * 0.045, trim);
        }
        break;
      }

      case "palisade": {
        // Mesh on posts with wire above. It refuses building and deliberately
        // does NOT block sight -- a rifle shoots through mesh.
        var plHalf = size / 2;
        var plA = rot, plC = Math.cos(plA), plS = Math.sin(plA);
        for (var po = 0; po <= 6; po++) {
          var pt = -plHalf + size * po / 6;
          segment(builder, cx + plC * pt, cy + plS * pt, 0,
            cx + plC * pt, cy + plS * pt, size * 0.20, size * 0.016, dark);
        }
        // Two rails and the wire, thin so the fence reads as see-through.
        for (var ra2 = 0; ra2 < 3; ra2++) {
          segment(builder, cx - plC * plHalf, cy - plS * plHalf, size * (0.06 + ra2 * 0.07),
            cx + plC * plHalf, cy + plS * plHalf, size * (0.06 + ra2 * 0.07),
            size * 0.010, ra2 === 2 ? trim : body);
        }
        break;
      }

      case "gate":
        // Closed, because leaked enemies are hammering on it. Two leaves, a
        // frame and a brace.
        for (var gl = -1; gl <= 1; gl += 2) {
          boxAt(builder, cx, cy + gl * size * 0.30, size * 0.14, size * 0.56,
            size * 0.62, body, 0, rot);
        }
        boxAt(builder, cx, cy, size * 0.20, size * 0.18, size * 0.78, dark, 0, rot);
        for (var gp = -1; gp <= 1; gp += 2) {
          boxAt(builder, cx, cy + gp * size * 0.62, size * 0.22, size * 0.22,
            size * 0.86, dark, 0, rot);
        }
        break;

      case "lantern":
        segment(builder, cx, cy, 0, cx, cy, size * 1.5, size * 0.10, dark);
        boxAt(builder, cx, cy, size * 0.44, size * 0.44, size * 0.40, body,
          size * 1.5, rot);
        sphere(builder, cx, cy, size * 0.22, ley, size * 1.70, 8, 6, EMI);
        break;

      case "depot": {
        // MASS FIRST. The first version was a slab: correct proportions, no
        // weight. What a warehouse on wheels needs is a chassis you can see
        // UNDER it, a hull that overhangs that chassis, and enough vertical
        // steps that the eye reads three storeys rather than one prism.
        // THE MOBILE WAREHOUSE. Not a box: a hull with a chamfered nose, a
        // ribbed roof, a stepped upper deck, a stack and a freight door with a
        // lit interior behind it. The door is the brightest thing on this half
        // of the board because that is where the enemies come from.
        var dw = size * 0.62, dd = size * 0.46, dh = size * 0.52;
        // The chassis: a narrower deck the hull sits ON, lifted clear of the
        // dirt so the running gear has somewhere to be and the machine reads as
        // parked rather than buried.
        var lift = size * 0.20;
        boxAt(builder, cx, cy, dw * 1.86, dd * 1.70, lift, body, 0, rot);
        for (var cr = -1; cr <= 1; cr += 2) {
          boxAt(builder, cx + Math.cos(rot + Math.PI / 2) * dd * 1.62 * cr,
            cy + Math.sin(rot + Math.PI / 2) * dd * 1.62 * cr,
            dw * 1.94, dd * 0.22, lift * 0.80, dark, lift * 0.10, rot);
        }
        boxAt(builder, cx, cy, dw * 2, dd * 2, dh, dark, lift, rot);
        // Chamfered nose, west-facing, built from two shrinking blocks.
        for (var no = 0; no < 2; no++) {
          boxAt(builder, cx - dw * (0.92 + no * 0.16), cy,
            dw * 0.30, dd * (1.7 - no * 0.5), dh * (0.92 - no * 0.18), dark,
            lift + dh * (0.04 + no * 0.08), rot);
        }
        // Ribbed roof.
        for (var rb = 0; rb < 7; rb++) {
          boxAt(builder, cx - dw + (dw * 2) * (rb + 0.5) / 7, cy,
            dw * 0.10, dd * 2.06, dh * 0.10, body, lift + dh, rot);
        }
        // Stepped upper deck and a cab at the back.
        boxAt(builder, cx + dw * 0.30, cy, dw * 0.90, dd * 1.30, dh * 0.42, dark,
          lift + dh * 1.06, rot);
        boxAt(builder, cx + dw * 0.86, cy, dw * 0.34, dd * 0.80, dh * 0.34, body,
          lift + dh * 1.48, rot);
        // Gantry rails over the deck, and a hoist on them: loading gear, so
        // the thing reads as a WAREHOUSE and not merely a container.
        for (var gr = -1; gr <= 1; gr += 2) {
          segment(builder, cx - dw * 0.70,
            cy + Math.cos(rot) * dd * 0.86 * gr, lift + dh * 1.48,
            cx + dw * 0.50, cy + Math.cos(rot) * dd * 0.86 * gr,
            lift + dh * 1.48, size * 0.030, body);
        }
        boxAt(builder, cx - dw * 0.24, cy, dw * 0.22, dd * 0.90, dh * 0.20,
          body, lift + dh * 1.30, rot);
        segment(builder, cx - dw * 0.24, cy, lift + dh * 1.30,
          cx - dw * 0.24, cy, lift + dh * 0.70, size * 0.016, body);
        // THE FREIGHT DOOR: a recess in the west face, lit from inside.
        boxAt(builder, cx - dw * 1.02, cy, dw * 0.10, dd * 0.86, dh * 0.72,
          hex("#0a0806"), lift + dh * 0.02, rot);
        boxAt(builder, cx - dw * 0.96, cy, dw * 0.04, dd * 0.70, dh * 0.58,
          ley, lift + dh * 0.06, rot, EMI);
        break;
      }

      case "depot-ramp": {
        // The plate the enemies walk down, in three shallow steps so it meets
        // the dirt instead of ending in mid-air.
        for (var rp = 0; rp < 3; rp++) {
          boxAt(builder, cx - size * (0.30 - rp * 0.30), cy,
            size * 0.34, size * (0.86 + rp * 0.10), size * 0.10, body,
            size * (0.26 - rp * 0.09), rot);
        }
        break;
      }

      case "wheel":
        // COLOURS GO THROUGH hex(). Everything the builder is handed is a
        // PARSED LINEAR TRIPLE, not a "#rrggbb" string -- the palette values
        // this switch normally uses (dark, body, trim, ley) are already parsed.
        // A raw string does not throw: it is read as an array-like, comes out
        // as garbage, and these wheels rendered bright cyan on a black machine
        // until it was spotted on screen.
        //
        // Running gear: a rim, a hub and spokes, lying in the wheel's plane.
        frustum(builder, cx, cy, r * 0.96, r * 0.96, size * 0.34, hex("#141109"),
          size * 0.02, 12);
        frustum(builder, cx, cy, r * 0.42, r * 0.42, size * 0.40, body, 0, 10);
        for (var sk = 0; sk < 6; sk++) {
          var skA = sk * Math.PI / 3 + rot;
          segment(builder, cx, cy, size * 0.20,
            cx + Math.cos(skA) * r * 0.80, cy + Math.sin(skA) * r * 0.80,
            size * 0.20, r * 0.07, body);
        }
        break;

      case "exhaust":
        frustum(builder, cx, cy, r * 0.44, r * 0.34, size * 1.5, body, 0, 8);
        frustum(builder, cx, cy, r * 0.52, r * 0.52, size * 0.14, dark, size * 1.5, 8);
        frustum(builder, cx, cy, r * 0.34, r * 0.34, size * 0.06, hex("#0b0906"),
          size * 1.62, 8);
        break;

      case "floodlight":
        // COLD AND HOSTILE, against the settlement's amber lanterns. Same
        // fixture, opposite colour: the whole read of the board in one prop.
        segment(builder, cx, cy, 0, cx, cy, size * 1.8, size * 0.09, dark);
        boxAt(builder, cx, cy, size * 0.50, size * 0.34, size * 0.34, body,
          size * 1.8, rot);
        sphere(builder, cx - size * 0.22, cy, size * 0.18, hex("#ff5c40"),
          size * 1.96, 8, 6, EMI);
        break;

      case "tree":
        deadStem(builder, cx, cy, size, rot, dark, 2.1);
        break;

      case "snag":
        // Snapped off partway up, with the splinters still on it.
        frustum(builder, cx, cy, r * 0.42, r * 0.31, size * 0.16, dark, 0, 7);
        frustum(builder, cx, cy, r * 0.30, r * 0.21, size * 0.86, dark, size * 0.10, 7);
        for (var sp = 0; sp < 3; sp++) {
          var sa = rot + Math.PI * 2 * sp / 3 + wobble(cx, cy, 50 + sp) * 0.9;
          segment(builder,
            cx + Math.cos(sa) * r * 0.11, cy + Math.sin(sa) * r * 0.11, size * 0.90,
            cx + Math.cos(sa) * r * 0.19, cy + Math.sin(sa) * r * 0.19,
            size * (1.02 + wobble(cx, cy, 60 + sp) * 0.28), r * 0.05, dark);
        }
        break;

      case "stump":
        frustum(builder, cx, cy, r * 0.54, r * 0.45, size * 0.26, dark, 0, 8);
        // The cut face, one value up, so a stump is not a black disc.
        frustum(builder, cx, cy, r * 0.41, r * 0.41, size * 0.03, trim, size * 0.24, 8);
        break;

      case "log":
        // Fallen, lying along its own rotation and RESTING on the dirt rather
        // than half sunk into it.
        segment(builder,
          cx - Math.cos(rot) * size * 0.60, cy - Math.sin(rot) * size * 0.60, r * 0.19,
          cx + Math.cos(rot) * size * 0.60, cy + Math.sin(rot) * size * 0.60, r * 0.21,
          r * 0.19, dark);
        break;

      case "brush":
        // Dead bramble. Low, untidy, and the only thing that fills the gaps
        // between the stems.
        for (var bs = 0; bs < 5; bs++) {
          var ba = rot + wobble(cx, cy, 70 + bs) * Math.PI * 2;
          var bl = size * (0.26 + wobble(cx, cy, 80 + bs) * 0.28);
          segment(builder,
            cx - Math.cos(ba) * bl, cy - Math.sin(ba) * bl, size * 0.02,
            cx + Math.cos(ba) * bl * 0.7, cy + Math.sin(ba) * bl * 0.7,
            size * (0.13 + wobble(cx, cy, 90 + bs) * 0.16), r * 0.035, trim);
        }
        break;

      // --- what the humans put up ----------------------------------------

      case "barricade": {
        // A plank wall somebody threw up in a hurry: uneven boards, two rails
        // across them, and a brace on the inside holding the whole thing off
        // the ground. The unevenness is the point -- a wall of identical
        // boards reads as fencing that was DELIVERED, not as a wall that was
        // built out of whatever was to hand.
        var wco = Math.cos(rot), wsi = Math.sin(rot);
        var span = size * 1.5;
        for (var pk = 0; pk < 7; pk++) {
          var pt = (pk / 6 - 0.5) * span;
          boxAt(builder, cx + wco * pt, cy + wsi * pt,
            size * 0.17, size * 0.09,
            size * (0.66 + wobble(cx + pk * 13, cy, 100) * 0.34), body, 0, rot);
        }
        for (var rl = 0; rl < 2; rl++) {
          segment(builder,
            cx - wco * span * 0.52, cy - wsi * span * 0.52, size * (0.24 + rl * 0.36),
            cx + wco * span * 0.52, cy + wsi * span * 0.52, size * (0.24 + rl * 0.36),
            size * 0.045, dark);
        }
        for (var br = -1; br <= 1; br += 2) {
          segment(builder,
            cx + wco * span * 0.34 * br, cy + wsi * span * 0.34 * br, size * 0.74,
            cx + wco * span * 0.34 * br - wsi * size * 0.52,
            cy + wsi * span * 0.34 * br + wco * size * 0.52, 0, size * 0.05, dark);
        }
        break;
      }

      case "spikes": {
        // Sharpened stakes, crossed in pairs and raked at whatever is coming.
        // Nothing about them is decorative: this is the first thing a camp
        // builds and the last thing it can afford to.
        var kco = Math.cos(rot), ksi = Math.sin(rot);
        for (var xk = 0; xk < 3; xk++) {
          var kt = (xk - 1) * size * 0.52;
          var kx = cx + kco * kt, ky = cy + ksi * kt;
          for (var kside = -1; kside <= 1; kside += 2) {
            segment(builder,
              kx + ksi * size * 0.34 * kside, ky - kco * size * 0.34 * kside, 0,
              kx - ksi * size * 0.28 * kside, ky + kco * size * 0.28 * kside, size * 0.60,
              size * 0.045, body);
          }
        }
        break;
      }

      case "sandbags": {
        // Three courses, each shorter than the one under it, every bag turned
        // a little off true because they were stacked by hand.
        var sco = Math.cos(rot), ssi = Math.sin(rot);
        for (var cr = 0; cr < 3; cr++) {
          var bags = 6 - cr;
          for (var bg = 0; bg < bags; bg++) {
            var bt = (bg - (bags - 1) / 2) * size * 0.26;
            boxAt(builder, cx + sco * bt, cy + ssi * bt,
              size * 0.25, size * 0.31, size * 0.15, cr === 1 ? trim : body,
              size * 0.15 * cr,
              rot + (wobble(cx + bg * 17, cy + cr * 29, 110) - 0.5) * 0.34);
          }
        }
        break;
      }

      case "watchtower": {
        // Four legs raked inward, a platform, a rail -- and a lamp, which is
        // the one thing on this board that is deliberately lit. It marks the
        // camp from across the map through the fog, which is exactly what a
        // watchtower is for.
        var legH = size * 1.55;
        var deck = [];
        for (var lg = 0; lg < 4; lg++) {
          var la = rot + Math.PI / 4 + Math.PI * 2 * lg / 4;
          segment(builder,
            cx + Math.cos(la) * r * 0.90, cy + Math.sin(la) * r * 0.90, 0,
            cx + Math.cos(la) * r * 0.50, cy + Math.sin(la) * r * 0.50, legH,
            size * 0.055, dark);
          deck.push([cx + Math.cos(la) * r * 0.50, cy + Math.sin(la) * r * 0.50]);
        }
        boxAt(builder, cx, cy, size * 0.84, size * 0.84, size * 0.08, body, legH, rot);
        for (var rr = 0; rr < 4; rr++) {
          segment(builder, deck[rr][0], deck[rr][1], legH + size * 0.08,
            deck[rr][0], deck[rr][1], legH + size * 0.44, size * 0.04, dark);
          var nx2 = deck[(rr + 1) % 4];
          segment(builder, deck[rr][0], deck[rr][1], legH + size * 0.40,
            nx2[0], nx2[1], legH + size * 0.40, size * 0.03, dark);
        }
        frustum(builder, cx, cy, size * 0.10, size * 0.07, size * 0.13,
          ley, legH + size * 0.30, 8, EMI);
        break;
      }

      case "wreck": {
        // A burnt-out car, shoved off the track and stripped. It sits low and
        // nothing on it lights up: it is a landmark, not a lamp.
        boxAt(builder, cx, cy, size * 1.20, size * 0.60, size * 0.22, dark,
          size * 0.09, rot);
        boxAt(builder, cx - Math.cos(rot) * size * 0.10, cy - Math.sin(rot) * size * 0.10,
          size * 0.54, size * 0.52, size * 0.24, body, size * 0.29, rot);
        for (var wl = 0; wl < 4; wl++) {
          var wx = ((wl & 1) ? 1 : -1) * size * 0.42;
          var wy = ((wl & 2) ? 1 : -1) * size * 0.30;
          frustum(builder,
            cx + Math.cos(rot) * wx - Math.sin(rot) * wy,
            cy + Math.sin(rot) * wx + Math.cos(rot) * wy,
            size * 0.11, size * 0.11, size * 0.10, dark, 0, 7);
        }
        break;
      }

      case "barrel":
        // A drum with a fire in it. The camp's only warm light, and the reason
        // this board's accent is an ember and not a ley line.
        frustum(builder, cx, cy, r * 0.34, r * 0.34, size * 0.50, body, 0, 10);
        frustum(builder, cx, cy, r * 0.37, r * 0.37, size * 0.04, dark, size * 0.13, 10);
        frustum(builder, cx, cy, r * 0.37, r * 0.37, size * 0.04, dark, size * 0.38, 10);
        // Driven at half the board's emission on purpose. At full EMI the
        // accent clips through orange to a white-yellow cone and the drum
        // under it disappears -- which is a flare, not a fire in a barrel.
        frustum(builder, cx, cy, r * 0.27, r * 0.05, size * 0.34, ley,
          size * 0.48, 7, EMI * 0.5);
        break;

      case "fence": {
        // Corrugated sheet wired to posts -- where the camp ran out of timber.
        var fco = Math.cos(rot), fsi = Math.sin(rot);
        var fspan = size * 1.6;
        for (var fp = 0; fp < 3; fp++) {
          var ft = (fp - 1) * fspan * 0.5;
          segment(builder, cx + fco * ft, cy + fsi * ft, 0,
            cx + fco * ft, cy + fsi * ft, size * 0.84, size * 0.05, dark);
        }
        for (var fs2 = 0; fs2 < 2; fs2++) {
          var fa = (fs2 - 0.5) * fspan * 0.5;
          boxAt(builder, cx + fco * fa, cy + fsi * fa,
            fspan * 0.47, size * 0.05, size * (0.60 + fs2 * 0.11), body,
            size * 0.05, rot);
        }
        break;
      }

      default:
        // An unknown kind still gets a body rather than nothing, so a new prop
        // added to maps.js shows up as a block instead of silently vanishing.
        boxAt(builder, cx, cy, size * 0.6, size * 0.6, size * 0.6, body, size * 0.08, rot);
    }
    return builder;
  }

  return {
    Builder: Builder,
    hex: hex,
    sphere: sphere,
    ellipsoid: ellipsoid,
    cylinder: cylinder,
    ground: ground,
    road: road,
    solid: solid,
    wobble: wobble,
    box: box,
    frustum: frustum,
    boxAt: boxAt,
    segment: segment,
    scenery: scenery,
    SCENERY_KINDS: ["antenna", "server", "reactor", "console", "pylon",
                    "tank", "vent", "holo", "battery", "coil",
                    // The forest board's own vocabulary. Listed beside the
                    // machinery rather than in a second table, because every
                    // reader of this list wants "what can a map ask for".
                    "tree", "snag", "stump", "log", "brush",
                    "barricade", "spikes", "sandbags", "watchtower", "wreck",
                    "barrel", "fence",
                    // Ironwood Frontier's own set -- see the WILD table.
                    "ironwood", "deadfall", "fern", "mossrock", "ridge",
                    "boulder", "outcrop", "trunk", "platform",
                    "house", "townhall", "storehouse", "workshop",
                    "gate", "palisade", "lantern",
                    "depot", "depot-ramp", "wheel", "exhaust", "floodlight"]
  };
})();
