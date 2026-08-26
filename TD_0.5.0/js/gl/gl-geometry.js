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

  // Two colours blended, in the LINEAR space every colour in this file is in.
  // Blending display-space hex would darken the middle of the ramp; both
  // arguments have already been through `hex`, so this is honest light.
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t];
  }

  // A flat slab. `z` is its top surface; it has no underside because nothing
  // ever gets below the board.
  function ground(builder, minX, minY, maxX, maxY, z, color) {
    builder.quad([minX, minY, z], [maxX, minY, z], [maxX, maxY, z],
      [minX, maxY, z], color);
    return builder;
  }

  // The road: a raised ribbon with visible kerbs, extruded along `points`.
  //
  // `lift` is what the 2D game fakes by drawing a lighter top and a darker
  // edge. Here it is real height, which is most of why the board reads as 3D
  // at all the moment the camera tilts.
  // `points` may carry a per-point `half` -- see GamePath.ribbon -- and where
  // it does, `width` is only the fallback. That is how a chokepoint gets built
  // as real narrowed tarmac rather than as a painted marking.
  function road(builder, points, width, lift, topColor, sideColor, edgeColor) {
    if (!points || points.length < 2) return builder;
    // ONE COPY OF THE MITRE, in js/path.js, shared with the 2D pass. See the
    // header on `roadEdges` for why offsetting a polyline is not a thing to
    // have two of.
    var offs = roadEdges(points, width / 2, 0);

    for (var s = 0; s + 1 < offs.length; s++) {
      var a = offs[s], b = offs[s + 1];
      var lA = [a.lx, a.ly, lift], rA = [a.rx, a.ry, lift];
      var lB = [b.lx, b.ly, lift], rB = [b.rx, b.ry, lift];
      builder.quad(rA, rB, lB, lA, topColor);              // deck

      // THE KERB LIGHTS, and they are the difference between a road you can
      // see and a road you cannot.
      //
      // A board whose floor is black dirt and whose asphalt is a darker black
      // has no value contrast left to draw the route with -- which is correct
      // for the ground and useless for the one strip of it that decides where
      // every body walks. So the road may carry its own light: two emissive
      // lines inset from its edges, following every change of width, which
      // makes a chokepoint and a plaza read from across the board at a glance.
      //
      // OPT-IN, and six of the seven boards do not take it: `edgeColor` is
      // undefined for them and this block is skipped entirely, so their road
      // is the same three quads per segment it has always been. A facility
      // with a lit floor grid does not need its road outlined.
      if (edgeColor) {
        var lit = lift + 0.35;
        var strip = 2.6;
        function inset(p, q, t) {
          return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, lit];
        }
        var lenA = Math.hypot(a.lx - a.rx, a.ly - a.ry) || 1;
        var lenB = Math.hypot(b.lx - b.rx, b.ly - b.ry) || 1;
        var lA2 = [a.lx, a.ly], rA2 = [a.rx, a.ry];
        var lB2 = [b.lx, b.ly], rB2 = [b.rx, b.ry];
        // Left kerb, then right, each a strip of constant WIDTH however wide
        // the road is: a plaza gets the same line as a gate, or the widest
        // stretch of road would also be the brightest thing on the board.
        //
        // WOUND LIKE THE DECK ABOVE, which is not optional: CULL_FACE/BACK is
        // on, so a strip wound the other way round has its normal pointing
        // into the ground and is culled on every frame -- which is exactly
        // what the first version of this did, and it renders as a road with no
        // lights on it and nothing anywhere saying why. The rule is the deck's:
        // start on one side at A, run to B, cross, and come back.
        builder.quad(
          inset(lA2, rA2, strip / lenA), inset(lB2, rB2, strip / lenB),
          inset(lB2, rB2, 0), inset(lA2, rA2, 0),
          edgeColor, 0.85);
        builder.quad(
          inset(rA2, lA2, 0), inset(rB2, lB2, 0),
          inset(rB2, lB2, strip / lenB), inset(rA2, lA2, strip / lenA),
          edgeColor, 0.85);
      }
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
    // Neither of these stands on a floor either, and for the same reason as
    // the two below: a gate straddles the ROAD, so a milled plinth under its
    // centre would be a plinth in the middle of the tarmac, and a cable run
    // laid on the dirt is not standing on anything at all.
    gate: 1, conduit: 1,
    // Neither of these stands on a floor at all: the bridge stands in a river
    // and the casket is sunk into the dirt. A milled plinth under either one
    // would be a plinth floating in water or buried in earth.
    bridge: 1, casket: 1
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
        //
        // THE DECK IS EMPTY, AND THAT IS THE POINT. The lamp used to stand in
        // the MIDDLE of the platform -- a squat lit cone dead centre, which
        // read as a stool nobody could get past and left a sniper's tower with
        // nowhere for a sniper to stand. A lamp belongs on a corner post
        // anyway: that is where it lights the ladder and the approach instead
        // of the shins of whoever is up there. Nothing about the camp's one
        // deliberate light changed except which square foot it occupies.
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
        // The lamp, on the post the ladder comes up beside.
        var lamp = deck[0];
        frustum(builder, lamp[0], lamp[1], size * 0.085, size * 0.06,
          size * 0.12, ley, legH + size * 0.44, 8, EMI);

        // AND A WAY UP, because a platform nobody can reach is scenery and a
        // platform with a ladder on it is a post. Two rails and five rungs on
        // the face the camp is behind.
        var lad = rot + Math.PI / 4 + Math.PI * 2 * 2 / 4;   // the far corner
        var lx = cx + Math.cos(lad) * r * 0.86;
        var ly = cy + Math.sin(lad) * r * 0.86;
        var tx = cx + Math.cos(lad) * r * 0.46;
        var ty = cy + Math.sin(lad) * r * 0.46;
        var side = [-Math.sin(lad) * size * 0.13, Math.cos(lad) * size * 0.13];
        for (var sd = -1; sd <= 1; sd += 2) {
          segment(builder, lx + side[0] * sd, ly + side[1] * sd, 0,
            tx + side[0] * sd, ty + side[1] * sd, legH, size * 0.028, body);
        }
        for (var rg = 1; rg <= 5; rg++) {
          var f = rg / 6;
          segment(builder,
            lx + (tx - lx) * f - side[0], ly + (ty - ly) * f - side[1], legH * f,
            lx + (tx - lx) * f + side[0], ly + (ty - ly) * f + side[1], legH * f,
            size * 0.022, body);
        }
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

      // --- what the road needs, and what came up out of the ground -------

      case "bridge": {
        // A TIMBER CROSSING, BUILT AROUND A ROAD THAT IS ALREADY THERE.
        //
        // The road ribbon is drawn by `road()` at ROAD_LIFT and this never
        // touches it: the deck here sits a hair UNDER the tarmac and is wider
        // than it, so what shows is plank ends, stringers, rails and piers
        // around a road surface that is still the road surface. Build it the
        // other way round -- a deck ON TOP -- and it z-fights the ribbon for
        // every pixel of the crossing, which is the one thing a bridge over a
        // route must never do.
        //
        // `size` IS THE SPAN, not a footprint: span = 1.5 x size, and the map
        // is responsible for making that reach past both banks. A bridge that
        // stops short of the cut is a bridge with its abutments in the water.
        var span = size * 1.5;
        var halfSpan = span / 2;
        var deckHalf = size * 0.17;        // wider than the road, deliberately
        var deckZ = 6.9;                   // just under ROAD_LIFT (7)
        var bco = Math.cos(rot), bsi = Math.sin(rot);
        function along(t, off, z) {
          return [cx + bco * t - bsi * off, cy + bsi * t + bco * off, z];
        }

        // The closed underside. Without it the camera looks up through the
        // road's one-sided deck quad and sees the gorge through the crossing.
        boxAt(builder, cx, cy, span, deckHalf * 2, size * 0.10,
          dark, deckZ - size * 0.10, rot);

        // Planks across the run, uneven, ends proud of the tarmac.
        var planks = Math.max(6, Math.round(span / (size * 0.14)));
        for (var pl = 0; pl < planks; pl++) {
          var pt = (pl / (planks - 1) - 0.5) * span * 0.99;
          var jitter = (wobble(cx + pl * 31, cy, 130) - 0.5) * size * 0.05;
          boxAt(builder, cx + bco * pt - bsi * jitter,
            cy + bsi * pt + bco * jitter,
            size * 0.135, deckHalf * 2, size * 0.04,
            (pl % 3) ? body : trim, deckZ - size * 0.04, rot);
        }

        // Two stringers under the planks, running the whole span.
        for (var st = -1; st <= 1; st += 2) {
          var s0 = along(-halfSpan, deckHalf * 0.82 * st, deckZ - size * 0.09);
          var s1 = along(halfSpan, deckHalf * 0.82 * st, deckZ - size * 0.09);
          segment(builder, s0[0], s0[1], s0[2], s1[0], s1[1], s1[2],
            size * 0.05, dark);
        }

        // FOUR PIERS, STANDING IN THE WATER. They reach a third of the span
        // below the floor, which clears any channel a map has authored so far
        // and stops well short of hanging off the underside of the board.
        var drop = size * 0.30;
        for (var pr = 0; pr < 4; pr++) {
          var pt2 = ((pr & 1) ? 0.20 : -0.20) * span;
          var po = ((pr & 2) ? 1 : -1) * deckHalf * 0.72;
          var foot = along(pt2, po, -drop);
          var head = along(pt2, po, deckZ - size * 0.09);
          segment(builder, foot[0], foot[1], foot[2],
            head[0], head[1], head[2], size * 0.045, dark);
        }

        // Cross braces, so the piers read as a trestle and not as four sticks.
        for (var bs = -1; bs <= 1; bs += 2) {
          var l0 = along(-0.20 * span, deckHalf * 0.72 * bs, -drop * 0.80);
          var l1 = along(0.20 * span, deckHalf * 0.72 * bs, deckZ - size * 0.12);
          var l2 = along(0.20 * span, deckHalf * 0.72 * bs, -drop * 0.80);
          var l3 = along(-0.20 * span, deckHalf * 0.72 * bs, deckZ - size * 0.12);
          segment(builder, l0[0], l0[1], l0[2], l1[0], l1[1], l1[2],
            size * 0.024, dark);
          segment(builder, l2[0], l2[1], l2[2], l3[0], l3[1], l3[2],
            size * 0.024, dark);
        }

        // Handrails: posts and a top rail, both sides.
        for (var hr = -1; hr <= 1; hr += 2) {
          var off = deckHalf * 0.94 * hr;
          var railZ = deckZ + size * 0.12;
          for (var hp = 0; hp < 7; hp++) {
            var ht = (hp / 6 - 0.5) * span * 0.94;
            var pA = along(ht, off, deckZ);
            segment(builder, pA[0], pA[1], pA[2], pA[0], pA[1], railZ,
              size * 0.024, body);
          }
          var rA = along(-halfSpan * 0.94, off, railZ);
          var rB = along(halfSpan * 0.94, off, railZ);
          segment(builder, rA[0], rA[1], rA[2], rB[0], rB[1], rB[2],
            size * 0.022, body);
        }

        // Stone abutments where the timber comes back down onto the bank.
        for (var ab = -1; ab <= 1; ab += 2) {
          boxAt(builder, cx + bco * halfSpan * 0.94 * ab,
            cy + bsi * halfSpan * 0.94 * ab,
            size * 0.14, deckHalf * 2.3, deckZ, dark, 0, rot);
        }
        break;
      }

      case "casket": {
        // WHERE THE ENEMIES COME FROM, made literal.
        //
        // The route's first point is off the west edge and until now bodies
        // simply existed there, walking in out of nothing. This is the hole
        // they come out of: a stone box let into the black dirt with its lid
        // dragged half off, and a violet light in the gap that is the only
        // colour on this board that is not the camp's ember.
        //
        // THE PIT IS BUILT PROUD, NOT DUG. The floor is a single quad and no
        // prop can cut a hole in it, so the box stands on the dirt with a kerb
        // a few units high and a black interior -- which from any camera the
        // game allows reads as sunk, and from none of them reads as a lid over
        // a hole that was never opened.
        var kco = Math.cos(rot), ksi = Math.sin(rot);
        var boxL = size * 1.15, boxW = size * 0.62, kerb = size * 0.20;
        function at(t, o, z) {
          return [cx + kco * t - ksi * o, cy + ksi * t + kco * o, z];
        }

        // THE GROUND STAIN. This is the "light on the floor" and it is
        // GEOMETRY, per AGENTS.md -- a sticker over the top would sit in front
        // of the bodies standing on it.
        //
        // PAINTED IN THE GROUND'S OWN COLOUR AND LIT BY EMISSION ALONE, which
        // is the whole correction. The first two passes painted these discs
        // `ley` -- the accent at full strength -- and then wondered why a disc
        // driven at emission 0.045 measured (170,100,248) on the framebuffer.
        // It was never the emission: a violet surface lit normally IS bright
        // violet, and what was on the dirt was a hard-edged magenta ellipse.
        // Light falling on black dirt is DIRT, plus what the light adds. So the
        // disc takes the floor's colour and the violet arrives entirely through
        // the emissive channel, which is also the only version of this that
        // dims correctly when the board's fog thickens over it.
        //
        // Six steps rather than three, because the edge of the outermost disc
        // is the thing that gives a "glow" away as a decal.
        var stain = [[1.34, 0.05], [1.12, 0.10], [0.92, 0.17],
                     [0.72, 0.27], [0.54, 0.40], [0.38, 0.58]];
        for (var sg = 0; sg < stain.length; sg++) {
          frustum(builder, cx, cy, size * stain[sg][0], size * stain[sg][0],
            0.001, P.terrain, 0.03 + sg * 0.009, 18, stain[sg][1]);
        }

        // The spoil thrown out of it, so the ground reads as disturbed.
        for (var sp2 = 0; sp2 < 5; sp2++) {
          var sa2 = rot + Math.PI * 2 * sp2 / 5 + wobble(cx, cy, 140 + sp2);
          var sr2 = size * (0.78 + wobble(cx, cy, 150 + sp2) * 0.30);
          frustum(builder, cx + Math.cos(sa2) * sr2, cy + Math.sin(sa2) * sr2,
            size * 0.17, size * 0.09, size * 0.10, dark, 0, 7);
        }

        // The kerb: four walls around a black mouth.
        for (var wl2 = 0; wl2 < 4; wl2++) {
          var lng = wl2 < 2;
          var t2 = lng ? 0 : (wl2 === 2 ? -1 : 1) * (boxL / 2 - kerb / 2);
          var o2 = lng ? (wl2 === 0 ? -1 : 1) * (boxW / 2 - kerb / 2) : 0;
          var c2 = at(t2, o2, 0);
          boxAt(builder, c2[0], c2[1],
            lng ? boxL : kerb, lng ? kerb : boxW - kerb * 2,
            size * 0.17, trim, 0, rot);
        }
        // The mouth. Black floor, then the light standing in it.
        boxAt(builder, cx, cy, boxL - kerb * 2, boxW - kerb * 2, 0.6,
          dark, 0.02, rot);
        boxAt(builder, cx, cy, boxL - kerb * 2.6, boxW - kerb * 2.6, 0.4,
          ley, size * 0.05, rot, EMI * 0.75);

        // THE LID, dragged clear and left leaning on its own kerb. Two solids
        // rather than one: a slab on the dirt and the end of it still up on
        // the stone, which is what "shoved off" actually looks like.
        var lidC = at(boxL * 0.42, -boxW * 0.92, 0);
        boxAt(builder, lidC[0], lidC[1], boxL * 0.72, boxW * 0.80,
          size * 0.11, trim, size * 0.02, rot + 0.22);
        var lidB = at(boxL * 0.06, -boxW * 0.60, 0);
        boxAt(builder, lidB[0], lidB[1], boxL * 0.30, boxW * 0.46,
          size * 0.09, trim, size * 0.14, rot + 0.10);

        // FOUR MARKERS at the corners, lit at the tip. They are what turns a
        // stone box into a grave, and they carry the violet up off the floor
        // so the light is visible from a camera that is not looking straight
        // down into the mouth.
        for (var mk = 0; mk < 4; mk++) {
          var mt = ((mk & 1) ? 1 : -1) * boxL * 0.62;
          var mo = ((mk & 2) ? 1 : -1) * boxW * 1.05;
          var mp = at(mt, mo, 0);
          var lean = rot + (wobble(cx + mk * 17, cy, 160) - 0.5) * 0.5;
          var tall = size * (0.34 + wobble(cx + mk * 17, cy, 170) * 0.22);
          segment(builder, mp[0], mp[1], 0,
            mp[0] + Math.cos(lean) * size * 0.06,
            mp[1] + Math.sin(lean) * size * 0.06, tall, size * 0.055, body);
          frustum(builder, mp[0] + Math.cos(lean) * size * 0.06,
            mp[1] + Math.sin(lean) * size * 0.06,
            size * 0.05, size * 0.03, size * 0.05, ley, tall, 6, EMI);
        }

        // And the light itself leaving the mouth: three wisps, thinning as
        // they rise. Emissive, so they survive the fog the board is under.
        for (var wp = 0; wp < 3; wp++) {
          var wt = (wp - 1) * boxL * 0.28;
          var wb = at(wt, (wobble(cx + wp * 23, cy, 180) - 0.5) * boxW * 0.4,
            size * 0.08);
          segment(builder, wb[0], wb[1], wb[2],
            wb[0] + (wobble(cx + wp * 23, cy, 190) - 0.5) * size * 0.22,
            wb[1] + (wobble(cx + wp * 23, cy, 200) - 0.5) * size * 0.22,
            size * (0.5 + wobble(cx + wp * 23, cy, 210) * 0.42),
            size * 0.022, ley, EMI * 0.55);
        }
        break;
      }

      case "gate": {
        // AN ARCH OVER THE ROAD, and the two ends of a route are the only
        // places it belongs: bodies walk out of one and off the board through
        // the other.
        //
        // Twin Confluence has declared three of these since it was written and
        // every one of them has rendered as the default block below -- the
        // switch had no `gate` case at all. So this is a prop the game already
        // asked for and never had.
        //
        // Straddles `rot`: the posts go out along the perpendicular, so a gate
        // is authored with the direction the ROAD runs and stands across it.
        var gco = Math.cos(rot), gsi = Math.sin(rot);
        function gp(t, o, z) {
          return [cx + gco * t - gsi * o, cy + gsi * t + gco * o, z];
        }
        var reach = size * 0.95, postH = size * 1.30;
        for (var gs = 0; gs < 2; gs++) {
          var off = (gs ? 1 : -1) * reach;
          var foot = gp(0, off, 0);
          frustum(builder, foot[0], foot[1], size * 0.30, size * 0.22,
            size * 0.16, dark, 0, 6);
          boxAt(builder, foot[0], foot[1], size * 0.34, size * 0.30, postH,
            body, size * 0.10, rot);
          // The lamp on the inside face of each post, which is what makes the
          // gate READ at night rather than just stand there.
          var lamp = gp(0, off * 0.72, 0);
          boxAt(builder, lamp[0], lamp[1], size * 0.14, size * 0.10,
            size * 0.72, ley, size * 0.34, rot, EMI);
        }
        // The lintel, and the light hanging under it.
        boxAt(builder, cx, cy, size * 0.36, reach * 2.34, size * 0.26,
          body, postH + size * 0.06, rot);
        boxAt(builder, cx, cy, size * 0.20, reach * 1.90, size * 0.07,
          ley, postH + size * 0.02, rot, EMI);
        // THE THRESHOLD ON THE GROUND. A line of light across the road, which
        // is the half of this prop the player looking straight down actually
        // sees -- the arch above it is for the tilted camera.
        boxAt(builder, cx, cy, size * 0.10, reach * 1.80, 0.4,
          ley, 0.05, rot, EMI * 0.8);
        break;
      }

      case "conduit": {
        // A DATA RUN, laid on the ground beside the road.
        //
        // The one prop on the board whose job is to point ALONG something: a
        // buried armoured cable with its core showing through the breaks in
        // the sheath, laid parallel to the road so the eye is walked down the
        // route rather than stopped by a silhouette. `size` is its half-length,
        // so a run is authored by how far it reaches.
        var cco = Math.cos(rot), csi = Math.sin(rot);
        function cp(t, o) {
          return [cx + cco * t - csi * o, cy + csi * t + cco * o];
        }
        // The sheath, in three sections with the core visible between them.
        for (var cs = -1; cs <= 1; cs++) {
          var sec = cp(cs * size * 0.62, 0);
          boxAt(builder, sec[0], sec[1], size * 0.50, size * 0.20,
            size * 0.09, dark, 0, rot);
        }
        // The core: one continuous line of light, low to the ground, running
        // the whole length under the sheath's breaks.
        boxAt(builder, cx, cy, size * 1.86, size * 0.07, size * 0.05,
          ley, size * 0.03, rot, EMI);
        // Two anchor pins, so it reads as pinned down rather than dropped.
        for (var cn = 0; cn < 2; cn++) {
          var pin = cp((cn ? 1 : -1) * size * 0.90, 0);
          frustum(builder, pin[0], pin[1], size * 0.11, size * 0.07,
            size * 0.16, body, 0, 6);
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

  // --- THE RIVER, AND THE EDGE OF THE WORLD IT FALLS OFF ------------------
  //
  // The one piece of terrain in this game that is not flat, and the only
  // geometry anywhere that goes BELOW the floor. A map declares a centre line
  // and three widths (js/maps.js, ENVIRONMENTS.test.river) and this cuts the
  // channel, fills it and pours it off the board.
  //
  // A CROSS SECTION EXTRUDED ALONG THE RUN, not a trough box. A box has
  // vertical walls and reads as a canal -- a thing that was DUG -- and a
  // channel of constant width reads as a pipe. Two sloped banks, a bench and a
  // bed, with the inner offsets wobbled along the run for the same reason the
  // trees are wobbled.
  //
  // THE OUTER LIP IS EXACT AND MUST STAY THAT WAY. `js/gl/gl-world.js` splits
  // the ground quad around this band, so ±(width/2 + banks) is a SHARED
  // number, not a proportion: wobble it here and the floor and the bank stop
  // meeting, which shows as a strip of void along the whole river.
  //
  // NOTHING HERE IS ANIMATED. The board mesh is built once per map, so the
  // water is running because of what its SHAPE says -- riffles across the
  // stream, a lip that curls, a sheet that breaks into ribbons as it falls --
  // and not because anything moves. That is the same bargain every other prop
  // on this board makes.
  function river(builder, spec, y0, y1, P) {
    var cx = spec.x;
    var hw = spec.width / 2;
    var bank = spec.banks;
    var depth = spec.depth;
    var lip = hw + bank;
    // THE SECTION IS WHAT MAKES A CHANNEL READ AS DEEP, and the first pass got
    // every one of these three numbers wrong in the same direction. A bench at
    // -0.42 under a 34-wide bank is an eighteen-degree slope, and eighteen
    // degrees seen from the game's own camera is FLAT: looking straight across
    // it the river was a ribbon painted on the floor. Steeper bank, and --
    // the part that actually sells it -- a WATERLINE BELOW THE BENCH, so there
    // is always a strip of dry wall between the grass and the water. That strip
    // is the only thing in the picture that says the water is down in
    // something.
    var benchZ = -depth * 0.50;
    var bedZ = -depth;
    var waterZ = -depth * 0.66;

    var earth = P.terrainEdge;
    var rock = P.metalDark;
    function shade(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }
    // A REAL GRADIENT INTO THE CUT. The first pass painted the banks in the
    // floor's own `terrainEdge` and measured (33,33,28) against a (34,34,29)
    // floor -- one value apart, which is not a bank, it is a stripe. The eye
    // reads depth as darkness, so each step down the section is darker than
    // the one above it.
    var bankC = shade(earth, 0.55);
    var wallC = shade(rock, 0.34);
    var bedC = shade(rock, 0.20);
    // THE WATER IS AUTHORED, LIKE EVERY OTHER COLOUR ON A BOARD. It is the one
    // surface here the palette cannot supply: the theme's accent is an ember
    // and its floor is black dirt, and water is neither. Cold, desaturated and
    // only a few stops off the dirt -- this board earns its contrast in VALUE,
    // never in a second hue.
    var water = hex(spec.water || "#18222a");
    var foam = hex(spec.foam || "#55666a");

    // --- the channel ------------------------------------------------------
    function ring(y) {
      var a = 1 + (wobble(Math.round(y * 0.4), 11, 7) - 0.5) * 0.14;
      var b = 1 + (wobble(Math.round(y * 0.4), 12, 7) - 0.5) * 0.22;
      return [[cx - lip, 0], [cx - hw * a, benchZ], [cx - hw * 0.74 * b, bedZ],
              [cx + hw * 0.74 * b, bedZ], [cx + hw * a, benchZ], [cx + lip, 0]];
    }
    var bandColor = [bankC, wallC, bedC, wallC, bankC];
    var steps = Math.max(4, Math.ceil((y1 - y0) / 36));
    var prev = ring(y0), prevY = y0;
    for (var s = 1; s <= steps; s++) {
      var y = y0 + (y1 - y0) * s / steps;
      var cur = ring(y);
      for (var k = 0; k + 1 < prev.length; k++) {
        builder.quad(
          [prev[k][0], prevY, prev[k][1]],
          [prev[k + 1][0], prevY, prev[k + 1][1]],
          [cur[k + 1][0], y, cur[k + 1][1]],
          [cur[k][0], y, cur[k][1]],
          bandColor[k]);
      }
      prev = cur; prevY = y;
    }

    // --- the water --------------------------------------------------------
    //
    // ONE QUAD IS A CONCRETE STRIP. The first pass laid the surface as a single
    // rectangle in a single colour, and a perfectly uniform stripe of anything
    // reads as poured, not as flowing. Laid per step instead, each a hair off
    // its neighbour, so the surface has the same deterministic unevenness the
    // banks either side of it have.
    var ww = hw * 0.80;
    var wPrevY = y0;
    for (var ws = 1; ws <= steps; ws++) {
      var wy = y0 + (y1 - y0) * ws / steps;
      var tone = 0.86 + wobble(Math.round(wy * 0.4), 31, 7) * 0.30;
      builder.quad([cx - ww, wPrevY, waterZ], [cx + ww, wPrevY, waterZ],
                   [cx + ww, wy, waterZ], [cx - ww, wy, waterZ],
        shade(water, tone));
      wPrevY = wy;
    }

    // RIFFLES: where the bed comes up, the surface breaks. They are the whole
    // reason a static plane reads as moving water.
    //
    // SMALL, DIM AND FREQUENT. The first pass made them up to two thirds of the
    // channel wide and painted them in full foam, which at any real zoom is not
    // broken water, it is four sheets of paper lying on the river. Broken water
    // is a lot of small bright specks, so this is many more of them, each a
    // fraction of the width, most of the way back toward the water's own
    // colour, and turned a little off square so they do not read as a ruled
    // line.
    //
    // NOT ONE THING IN THIS CHANNEL EMITS, and the first pass got that wrong in
    // a way worth writing down. Emission in this renderer is `uGlowTint * vEmi`
    // -- ONE tint for the whole board pass, and on this board that tint is the
    // camp's EMBER. So every emissive vertex here, whatever colour it was
    // painted, added orange light: the waterfall was authored a cold grey-green
    // and measured (124,86,70) on the framebuffer, a warm brown, and read as a
    // timber ramp rather than as water. Water does not glow anyway. All of the
    // contrast below is diffuse.
    for (var ry = y0 + 12; ry < y1 - 12; ry += 21) {
      var rf = wobble(Math.round(ry), 21, 7);
      var rc = cx + (rf - 0.5) * ww * 1.3;
      var rr = ww * (0.08 + wobble(Math.round(ry), 22, 7) * 0.16);
      var rt = 1.1 + wobble(Math.round(ry), 23, 7) * 1.5;
      var skew = (wobble(Math.round(ry), 24, 7) - 0.5) * rr * 0.9;
      var tone = 0.42 + wobble(Math.round(ry), 25, 7) * 0.5;
      builder.quad([rc - rr, ry, waterZ + 0.10], [rc + rr, ry, waterZ + 0.10],
                   [rc + rr * 0.6 + skew, ry + rt, waterZ + 0.10],
                   [rc - rr * 0.6 + skew, ry + rt, waterZ + 0.10],
        shade(foam, tone));
    }

    // --- and off the edge of the board ------------------------------------
    //
    // The board is a slab with no underside, so the water does not reach a
    // sea, a pool or anything else: it reaches the last quad of the world and
    // keeps going. A sheet that simply stopped would read as a bug, so it
    // LEANS as it falls and breaks into ribbons that thin to nothing -- which
    // is what the eye reads as "and then it is gone".
    var ys = spec.spill === "max" ? y1 : y0;
    var dir = spec.spill === "max" ? 1 : -1;

    // The cliff the water leaves by, so the near edge is rock rather than the
    // paper edge of a slab.
    var face = ring(ys);
    for (var f2 = 0; f2 + 1 < face.length; f2++) {
      var p0 = face[f2], p1 = face[f2 + 1];
      var lo = -depth - 46;
      var q = dir < 0
        ? [[p1[0], ys, p1[1]], [p0[0], ys, p0[1]],
           [p0[0], ys, lo], [p1[0], ys, lo]]
        : [[p0[0], ys, p0[1]], [p1[0], ys, p1[1]],
           [p1[0], ys, lo], [p0[0], ys, lo]];
      builder.quad(q[0], q[1], q[2], q[3], shade(earth, 0.7));
    }

    // The lip: the surface curling over before it lets go. Started a hair
    // OUTSIDE the cliff plane rather than across it -- drawn straddling ys the
    // two coincide at y = ys and the cliff wins the depth test, which measured
    // (17,16,14) where the brightest thing in the picture was supposed to be.
    builder.quad([cx - ww, ys - dir * 5, waterZ], [cx + ww, ys - dir * 5, waterZ],
                 [cx + ww * 0.97, ys + dir * 7, waterZ - 5],
                 [cx - ww * 0.97, ys + dir * 7, waterZ - 5],
      shade(foam, 1.15));

    // The sheet. Six bands, accelerating downward and leaning out; the lower
    // half is split into ribbons with gaps between them. Every band is emitted
    // TWICE, wound both ways: a falling sheet is seen from whichever side the
    // player has orbited to, and a one-sided quad is invisible from half of
    // them. It DARKENS as it drops, which is the falling water losing the only
    // light there is rather than an effect -- and it is why nothing here needs
    // to emit to read.
    // THE FALL HAS TO FINISH INSIDE THE FRAME, which is the measurement that
    // set this number. The first pass dropped it depth*5.5 + 90 -- 277 units --
    // and a probe down the sheet found everything past about a third of the way
    // projecting to screen y > 720: the board's whole void budget spent on
    // geometry under the build bar. A fall the player can watch END reads as
    // water going into nothing; a fall that leaves the bottom of the screen
    // reads as a fall that was cut off.
    var fallH = depth * 1.8 + 55;
    function fallAt(t) {
      return { z: waterZ - 5 - fallH * (0.18 * t + 0.82 * t * t),
               y: ys + dir * (7 + 40 * t),
               w: ww * (0.97 - 0.45 * t) };
    }
    for (var fb = 0; fb < 6; fb++) {
      var t0 = fb / 6, t1 = (fb + 1) / 6;
      var A = fallAt(t0), B = fallAt(t1);
      var pieces = fb < 3 ? 1 : 3;
      // Bright at the lip and almost gone at the bottom, so the sheet DISSOLVES
      // rather than stopping.
      var col = shade(foam, 1.15 - 1.02 * t0);
      for (var pc = 0; pc < pieces; pc++) {
        var span0 = A.w * 2 / pieces, span1 = B.w * 2 / pieces;
        var mid0 = -A.w + span0 * (pc + 0.5), mid1 = -B.w + span1 * (pc + 0.5);
        var g0 = span0 * (pieces === 1 ? 0.5 : 0.30);
        var g1 = span1 * (pieces === 1 ? 0.5 : 0.22);
        var a0 = [cx + mid0 - g0, A.y, A.z], a1 = [cx + mid0 + g0, A.y, A.z];
        var b1 = [cx + mid1 + g1, B.y, B.z], b0 = [cx + mid1 - g1, B.y, B.z];
        builder.quad(a0, a1, b1, b0, col);
        builder.quad(b0, b1, a1, a0, col);
      }
    }
    return builder;
  }

  return {
    Builder: Builder,
    hex: hex,
    sphere: sphere,
    ellipsoid: ellipsoid,
    cylinder: cylinder,
    mix: mix,
    ground: ground,
    road: road,
    box: box,
    frustum: frustum,
    boxAt: boxAt,
    segment: segment,
    scenery: scenery,
    river: river,
    SCENERY_KINDS: ["antenna", "server", "reactor", "console", "pylon",
                    "tank", "vent", "holo", "battery", "coil",
                    // The forest board's own vocabulary. Listed beside the
                    // machinery rather than in a second table, because every
                    // reader of this list wants "what can a map ask for".
                    "tree", "snag", "stump", "log", "brush",
                    "barricade", "spikes", "sandbags", "watchtower", "wreck",
                    "barrel", "fence",
                    // The crossing and what is buried at the other end of the
                    // road. Neither is a facility part and neither is timber
                    // the camp cut -- they are the two things on this board
                    // that were already here.
                    "bridge", "casket",
                    // The two ends of a road, and the wiring that survived
                    // between them.
                    "gate", "conduit"]
  };
})();
