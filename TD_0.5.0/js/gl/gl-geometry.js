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
    barrel: 1, fence: 1
  };

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

  function scenery(builder, kind, cx, cy, size, rot, P) {
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
                    "barrel", "fence"]
  };
})();
