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
    // Ironwood Frontier's own vocabulary. NOTHING here is shared with the dead
    // forest above it: those are bare snapped stems on black dirt and these are
    // a living wood, a settlement and a machine. Two boards that share prop
    // kinds read as one location with the lights changed.
    ironwood: 1, deadfall: 1, fern: 1, mossrock: 1, ridge: 1,
    boulder: 1, outcrop: 1, trunk: 1, platform: 1,
    house: 1, townhall: 1, storehouse: 1, workshop: 1,
    "palisade-gate": 1, palisade: 1, lantern: 1,
    depot: 1, "depot-ramp": 1, wheel: 1, exhaust: 1, floodlight: 1,
    // Neither of these stands on a floor either, and for the same reason as
    // the two below: a gate straddles the ROAD, so a milled plinth under its
    // centre would be a plinth in the middle of the tarmac, and a cable run
    // laid on the dirt is not standing on anything at all.
    conduit: 1,
    // Neither of these stands on a floor at all: the bridge stands in a river
    // and the casket is sunk into the dirt. A milled plinth under either one
    // would be a plinth floating in water or buried in earth.
    bridge: 1, casket: 1
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
  // WOUND THE WAY `frustum` WINDS: bottom-left, bottom-right, top-right,
  // top-left. It was the reverse of that for one commit and CULL_FACE/BACK ate
  // every side face on every rock -- what was left was the cap and a view
  // straight through the middle to the dirt, which is why five rocks with live
  // hitboxes could not be seen at all.
  function skin(builder, rings, side, top) {
    var i, k;
    for (i = 0; i < rings.length - 1; i++) {
      var lo = rings[i], hi = rings[i + 1];
      for (k = 0; k < lo.length; k++) {
        var k2 = (k + 1) % lo.length;
        builder.quad(lo[k], lo[k2], hi[k2], hi[k], side);
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

  // THE MOBILE DEPOT, ported from the authored three.js model (Claude Design
  // project a7f0c2ee, `depot-model.js`) into this renderer's primitives -- plus
  // `vbox` and `wheel` below, which are the two shapes those primitives cannot
  // make and which nearly every part of a tracked vehicle turns out to need.
  //
  // The source is a tracked transport in metres, y-up, nose at -x: a running
  // gear of tracks and road wheels, a chamfered armoured hull, a cargo bay lit
  // from inside, a ramp down out of the bay, a deck carrying a superstructure,
  // two stacks and a crane. This board is z-up with the prop's own yaw, so the
  // whole port is one axis swap and one scale:
  //
  //     design x (length, door at -x)  ->  local X
  //     design z (width)               ->  local Y
  //     design y (up)                  ->  local Z (world z)
  //
  // `size` is the HULL LENGTH in board pixels, lamp face to rear rack, which is
  // 8.4 of the design's units -- so one number sets the whole machine and the
  // proportions cannot drift apart the way they do when each part carries its
  // own fraction of `size`.
  //
  // WHAT WAS DROPPED, and why it is not missing. The source is built to be
  // orbited at a metre away: fourteen bolt rows, twenty-six-sided wheels,
  // twelve sprocket teeth, a hundred and fifty track pads, twenty-five chain
  // links and two sagging tarps with per-vertex wrinkles. At the size this
  // board draws it -- two hundred pixels of hull under a camera that is usually
  // looking at the whole route -- a 0.035-unit bolt is a fifth of a pixel. Every
  // one of those is either gone or replaced by the one feature it contributes
  // to the silhouette: the pads became a row of cleats along the track's outer
  // face, the chains became two straight runs, the tarps became slabs. The
  // things that survive whole are the things you can still see: the bay and its
  // light, the ramp, the crane, the stacks, the wheels and the shoulders.
  // THE FIVE NUMBERS BOTH PASSES NEED, hoisted out of the builder below.
  // `mobileDepot` draws the ramp and `depotWalkway` tells the height field
  // where its surface is, and a second copy of the hinge is how the plank a
  // body stands on and the plank it is drawn beside come apart. Design units;
  // both scale them by `size / DEPOT.UNITS`.
  var DEPOT = {
    UNITS: 8.4,                              // hull length, lamp face to rack
    BAY_BACK: -1.18, BAY_HALF: 0.95,         // the bay's inner end, and its beam
    FLOOR_Z: 1.355,                          // the lit bay floor, top face
    HINGE_X: -3.95, HINGE_Z: 1.24,           // the ramp's hinge, on the sill
    RAMP_LEN: 3.00, RAMP_DROP: 1.22, RAMP_HALF: 1.00,
    TREAD: 0.13                              // plank tops, clear of the bed
  };

  // WHAT COMES OUT OF THE DEPOT HAS TO WALK ON IT.
  //
  // The bay floor and the ramp bed, as a two-segment walkway in board units,
  // for `buildHeightField` in gl-world to stamp. Bodies are drawn at the height
  // the field gives them, and a prop contributes nothing to it -- so without
  // this the ramp is a plate the spawn walks THROUGH, and the choice is between
  // an enemy standing on bare dirt inside a lit bay and one coming out from
  // under its own loading ramp. It is the only prop on any board that is also
  // terrain, and it is one because it is the only prop the route runs INTO.
  function depotWalkway(cx, cy, size, rot) {
    var U = size / DEPOT.UNITS;
    var co = Math.cos(rot || 0), si = Math.sin(rot || 0);
    var a = Math.asin(DEPOT.RAMP_DROP / DEPOT.RAMP_LEN);
    var rc = Math.cos(a), rs = Math.sin(a);
    function at(X, Z) {
      return { x: cx + X * co * U, y: cy + X * si * U, z: Z * U };
    }
    var head = at(DEPOT.HINGE_X - DEPOT.TREAD * rs,
                  DEPOT.HINGE_Z + DEPOT.TREAD * rc);
    return [
      { a: at(DEPOT.BAY_BACK, DEPOT.FLOOR_Z), b: head, half: DEPOT.BAY_HALF * U },
      { a: head,
        b: at(DEPOT.HINGE_X - DEPOT.RAMP_LEN * rc - DEPOT.TREAD * rs,
              DEPOT.HINGE_Z - DEPOT.RAMP_LEN * rs + DEPOT.TREAD * rc),
        half: DEPOT.RAMP_HALF * U }
    ];
  }

  function mobileDepot(builder, cx, cy, size, rot, P) {
    var U = size / DEPOT.UNITS;
    var co = Math.cos(rot || 0), si = Math.sin(rot || 0);

    var body = P.metal, dark = P.metalDark, ley = P.accent;
    // Two tones the board's palette does not carry, and both are mixed FROM it
    // rather than stated, so the machine still belongs to whichever map parks
    // it. `steel` is the running gear, a value between the hull and its
    // recesses; `rust` is oxidised iron -- the ramp, the bumper, the drums --
    // and it is the one hue pulled toward a colour of its own, because a rusted
    // plate that is merely a darker olive reads as a shadow rather than as
    // rust.
    var steel = mix(body, dark, 0.42);
    var rust = mix(body, hex("#6a4830"), 0.62);
    // The tarps are the one thing on the machine that is not steel, and `panel`
    // alone made them read as green plastic sheeting -- it is a GROUND colour
    // on this board. Pulled most of the way to the source's khaki canvas.
    var canvas = mix(P.panel, hex("#474334"), 0.62);
    // The headlights are COLD, against a bay that burns -- in their BASE colour,
    // which is all this renderer will allow. One draw call carries one glow
    // tint, so every emissive surface in a prop's mesh emits the same hue (see
    // `accentMeshes` in gl-world), and a white lamp beside a red bay is not a
    // thing the board can say. So the lens is painted cold and emits at barely
    // half the bay's rate: by day it reads as the pale point the source has,
    // and at night it takes the same warm bloom as everything else on the
    // machine rather than going dark. Hardcoded for the same reason the
    // floodlight's lamp is -- this is not the board's light, it is the
    // machine's.
    var lamp = hex("#cfe2ff");

    function px(X, Y) { return cx + (X * co - Y * si) * U; }
    function py(X, Y) { return cy + (X * si + Y * co) * U; }

    // A box in the vehicle's own frame, centred on (X, Y, Z), `w` along the
    // hull, `d` across it, `h` up.
    function dbox(X, Y, Z, w, d, h, color, emi) {
      boxAt(builder, px(X, Y), py(X, Y), w * U, d * U, h * U, color,
        (Z - h / 2) * U, rot, emi);
    }
    // The same, turned about the vertical on top of the prop's own rotation --
    // the source's `rotation.y`, which is what splays the nose cheeks and the
    // lamp housings out from the door.
    function ybox(X, Y, Z, w, d, h, yaw, color, emi) {
      boxAt(builder, px(X, Y), py(X, Y), w * U, d * U, h * U, color,
        (Z - h / 2) * U, (rot || 0) + yaw, emi);
    }
    // A box PITCHED about the across-axis and ROLLED about the along-axis,
    // which `boxAt` cannot do at all -- it only ever turns about z. The glacis,
    // the ramp, the crane boom and every chamfer on the hull's shoulders are
    // this, and without it the machine is a stack of upright slabs.
    function vbox(X, Y, Z, w, d, h, pitch, roll, color, emi) {
      var cp = Math.cos(pitch), sp = Math.sin(pitch);
      var cr = Math.cos(roll), sr = Math.sin(roll);
      // Length, width and normal in the vehicle frame, right-handed (L x W = N).
      var L = [cp, 0, sp];
      var W = [-sp * sr, cr, cp * sr];
      var N = [-sp * cr, -sr, cp * cr];
      var hw = w / 2, hd = d / 2, hh = h / 2;
      function p(a, b, c) {
        var dx = L[0] * a + W[0] * b + N[0] * c;
        var dy = L[1] * a + W[1] * b + N[1] * c;
        var dz = L[2] * a + W[2] * b + N[2] * c;
        return [px(X + dx, Y + dy), py(X + dx, Y + dy), (Z + dz) * U];
      }
      var a1 = p(-hw, -hd, hh), b1 = p(hw, -hd, hh);
      var c1 = p(hw, hd, hh), d1 = p(-hw, hd, hh);
      var e1 = p(-hw, -hd, -hh), f1 = p(hw, -hd, -hh);
      var g1 = p(hw, hd, -hh), h1 = p(-hw, hd, -hh);
      builder.quad(a1, b1, c1, d1, color, emi);
      builder.quad(e1, f1, b1, a1, color, emi);
      builder.quad(g1, h1, d1, c1, color, emi);
      builder.quad(f1, g1, c1, b1, color, emi);
      builder.quad(h1, e1, a1, d1, color, emi);
      builder.quad(h1, g1, f1, e1, color, emi);
    }
    // A wheel: a disc whose axle runs ACROSS the hull. `frustum` stands upright
    // and `barrel` pins its axis one radius off the ground, so neither of them
    // can make the one shape a tracked vehicle is mostly made of.
    function wheel(X, Y, Z, r, w, verts, color) {
      var hd = w / 2, i;
      var capA = [px(X, Y - hd), py(X, Y - hd), Z * U];
      var capB = [px(X, Y + hd), py(X, Y + hd), Z * U];
      var prevA = null, prevB = null;
      for (i = 0; i <= verts; i++) {
        var a = Math.PI * 2 * i / verts;
        var rx = X + Math.cos(a) * r, rz = (Z + Math.sin(a) * r) * U;
        var A = [px(rx, Y - hd), py(rx, Y - hd), rz];
        var B = [px(rx, Y + hd), py(rx, Y + hd), rz];
        if (prevA) {
          builder.quad(prevA, prevB, B, A, color);
          builder.tri(capB, B, prevB, color);
          builder.tri(capA, prevA, A, color);
        }
        prevA = A; prevB = B;
      }
    }
    // A louvred vent: a recessed frame with slats tipped out of it. Four of
    // these carry the whole "this thing has engines in it" read.
    function louvre(X0, X1, Z0, Z1, Y, n, color) {
      var s = Y < 0 ? -1 : 1;
      dbox((X0 + X1) / 2, Y, (Z0 + Z1) / 2, X1 - X0, 0.07, Z1 - Z0, dark);
      for (var i = 0; i < n; i++) {
        var z = Z0 + ((i + 0.5) / n) * (Z1 - Z0);
        vbox((X0 + X1) / 2, Y + s * 0.05, z, X1 - X0 - 0.09, 0.06,
          (Z1 - Z0) / n * 0.62, 0, s * 0.38, color);
      }
    }

    var s, i, x, z;

    /* ---- running gear -------------------------------------------------- */
    // The track is a closed band in the source, extruded with a hole in it. A
    // hole nothing can see through is geometry nobody looks at: this is the
    // same silhouette as a solid run between two round ends.
    var TX0 = -3.52, TX1 = 3.58, TR = 0.52, TZ = 0.52;
    for (s = -1; s <= 1; s += 2) {
      var ty = s * 1.67;
      dbox((TX0 + TX1) / 2, ty, TZ, TX1 - TX0, 0.50, TR * 2, steel);
      wheel(TX0, ty, TZ, TR, 0.50, 10, steel);
      wheel(TX1, ty, TZ, TR, 0.50, 10, steel);
      // Cleats along the outer face: the track pads, at the only scale they
      // still read at.
      for (i = 0; i < 15; i++) {
        x = TX0 + (TX1 - TX0) * i / 14;
        dbox(x, s * 1.955, TZ, 0.17, 0.09, TR * 2 - 0.04,
          i % 5 === 2 ? rust : dark);
      }
      // Sprocket teeth, rear. Eight of the source's twelve, which is all the
      // cog you can see when the tooth is three pixels across.
      for (i = 0; i < 8; i++) {
        var ta = Math.PI * 2 * i / 8;
        vbox(TX1 + Math.cos(ta) * 0.46, s * 1.66, TZ + Math.sin(ta) * 0.46,
          0.16, 0.42, 0.20, ta, 0, dark);
      }
      // Road wheels, inside the band.
      for (i = 0; i < 7; i++) {
        wheel(-2.92 + i * 1.0, ty, TZ, 0.385, 0.56, 8, dark);
        wheel(-2.92 + i * 1.0, ty, TZ, 0.19, 0.60, 6, i % 3 === 1 ? rust : body);
      }
      dbox(0.03, s * 1.40, TZ, 7.10, 0.06, 0.95, dark);
      // The fender skirt lip, and it is what keeps the hull from looking as if
      // it is resting ON the tracks rather than over them.
      dbox(0.10, s * 1.66, 1.28, 7.60, 0.62, 0.12, body);
    }
    dbox(0.10, 0, 0.42, 7.40, 2.60, 0.30, dark);

    /* ---- hull ---------------------------------------------------------- */
    // ONE OUTER SKIN THE WHOLE LENGTH. The source extrudes a closed section for
    // the rear five metres and a pair of half sections for the bay, but both
    // share the same outer profile -- a narrow skirt, a full-width waist and a
    // chamfer in at the shoulder. Built once here and run end to end; only what
    // fills the CENTRE differs, and that is what makes the bay a hole.
    var HX = 0.05, HL = 8.00;               // -3.95 .. 4.05
    for (s = -1; s <= 1; s += 2) {
      dbox(HX, s * 1.125, 0.80, HL, 0.35, 0.50, body);
      vbox(HX, s * 1.625, 1.175, HL, 0.70, 0.16, 0, s * 0.367, body);
      dbox(HX, s * 1.450, 1.825, HL, 1.00, 1.05, body);
      vbox(HX, s * 1.775, 2.525, HL, 0.50, 0.16, 0, -s * 0.7854, body);
    }
    dbox(1.45, 0, 1.625, 5.20, 1.90, 2.15, body);      // the closed rear body
    dbox(-2.55, 0, 2.50, 2.80, 1.90, 0.40, body);      // bay roof
    dbox(-2.55, 0, 0.925, 2.80, 1.90, 0.75, body);     // bay floor deck

    /* ---- the cargo bay, and it is the reason this thing is on the board -- */
    // Every surface inside the opening is the accent, emissive, so the bay is
    // lit from within rather than painted bright: it survives being in shadow,
    // and the enemies that walk out of it come out of a light source.
    var BX = -2.56, BL = 2.76;
    dbox(BX, 0, 1.325, BL, 1.90, 0.06, ley, EMI);
    dbox(BX, 0, 2.295, BL, 1.90, 0.05, ley, EMI * 0.35);
    for (s = -1; s <= 1; s += 2) {
      dbox(BX, s * 0.925, 1.80, BL, 0.05, 1.00, ley, EMI * 0.35);
      for (i = 0; i < 4; i++) {
        x = -3.60 + i * 0.68;
        dbox(x, s * 0.86, 1.80, 0.10, 0.07, 1.00, ley, EMI * 0.6);
      }
    }
    for (i = 0; i < 4; i++) {
      dbox(-3.60 + i * 0.68, 0, 2.25, 0.10, 1.72, 0.07, ley, EMI * 0.6);
      dbox(-3.60 + i * 0.68, 0, 1.37, 0.08, 1.80, 0.05, ley, EMI * 0.6);
    }
    // The blast door at the far end of the bay: the brightest face on the
    // board, and the thing a player actually sees down the barrel of the road.
    dbox(-1.20, 0, 1.80, 0.10, 1.86, 1.00, ley, EMI);
    for (i = 0; i < 3; i++) dbox(-1.25, 0, 1.45 + i * 0.34, 0.13, 1.50, 0.09, ley, EMI);

    /* ---- the opening, the nose and the lamps ---------------------------- */
    dbox(-4.00, 0, 2.40, 0.16, 2.34, 0.22, dark);
    dbox(-4.00, 0, 1.22, 0.20, 2.34, 0.20, rust);
    vbox(-4.05, 0, 0.85, 0.50, 2.00, 0.34, 0.50, 0, body);
    vbox(-3.90, 0, 2.62, 0.34, 2.50, 0.30, -0.25, 0, body);
    for (s = -1; s <= 1; s += 2) {
      dbox(-4.00, s * 1.10, 1.80, 0.16, 0.30, 1.50, dark);
      ybox(-3.90, s * 1.62, 2.00, 0.90, 0.34, 1.15, s * 0.34, body);
      ybox(-3.80, s * 1.66, 1.15, 0.70, 0.30, 0.70, s * 0.30, body);
      ybox(-4.24, s * 1.52, 2.16, 0.30, 0.36, 0.34, s * 0.34, dark);
      ybox(-4.40, s * 1.47, 2.16, 0.06, 0.28, 0.26, s * 0.34, lamp, EMI * 0.55);
      dbox(-4.05, s * 1.50, 2.42, 0.50, 0.10, 0.09, dark);
    }
    // The crew box, on one side only. An asymmetry you can read from above is
    // worth more than four symmetrical fittings you cannot.
    vbox(-3.05, -1.86, 2.42, 1.50, 0.50, 0.62, 0.06, 0, body);
    dbox(-3.20, -2.08, 2.52, 0.85, 0.10, 0.14, ley, EMI);
    dbox(-3.15, -2.00, 2.66, 1.00, 0.30, 0.10, dark);
    louvre(-2.65, -2.35, 2.22, 2.55, -2.02, 3, body);

    /* ---- deck ----------------------------------------------------------- */
    dbox(1.30, 0, 2.72, 5.00, 3.10, 0.08, body);
    dbox(1.35, 0, 2.95, 2.20, 2.00, 0.46, body);
    vbox(0.15, 0, 2.94, 0.50, 1.90, 0.42, -0.42, 0, body);
    dbox(1.00, -0.35, 3.20, 0.80, 0.80, 0.08, dark);
    frustum(builder, px(2.05, 0.25), py(2.05, 0.25), 0.42 * U, 0.42 * U,
      0.16 * U, body, 3.17 * U, 8);
    frustum(builder, px(2.05, 0.25), py(2.05, 0.25), 0.36 * U, 0.36 * U,
      0.08 * U, dark, 3.31 * U, 8);
    louvre(0.70, 1.90, 2.78, 3.12, 1.02, 3, dark);
    louvre(0.70, 1.90, 2.78, 3.12, -1.02, 3, dark);
    dbox(-0.60, 0.05, 2.88, 1.30, 1.70, 0.34, body);
    dbox(-0.60, 0.05, 3.07, 0.90, 1.10, 0.07, dark);
    dbox(0.35, -0.95, 2.765, 1.10, 0.66, 0.05, rust);
    dbox(-3.20, 0.60, 2.715, 0.85, 0.90, 0.06, rust);
    // Stacks.
    for (i = 0; i < 2; i++) {
      x = -1.28 + i * 0.34; z = -0.72;
      frustum(builder, px(x, z), py(x, z), 0.20 * U, 0.17 * U, 0.16 * U, dark, 2.78 * U, 8);
      frustum(builder, px(x, z), py(x, z), 0.135 * U, 0.135 * U, 0.45 * U, dark, 2.98 * U, 8);
      frustum(builder, px(x, z), py(x, z), 0.10 * U, 0.085 * U, 1.00 * U, dark, 2.85 * U, 8);
      frustum(builder, px(x, z), py(x, z), 0.09 * U, 0.12 * U, 0.12 * U, steel, 3.84 * U, 8);
    }
    // A spare barrel stowed on the forward deck, and the cable coil beside it.
    segment(builder, px(-2.85, -1.10), py(-2.85, -1.10), 2.86 * U,
      px(-1.15, -1.10), py(-1.15, -1.10), 2.86 * U, 0.14 * U, body);
    dbox(-2.60, -1.10, 2.76, 0.14, 0.34, 0.30, dark);
    dbox(-1.50, -1.10, 2.76, 0.14, 0.34, 0.30, dark);
    frustum(builder, px(-1.85, 0.90), py(-1.85, 0.90), 0.36 * U, 0.28 * U,
      0.11 * U, dark, 2.76 * U, 10);

    /* ---- crane ----------------------------------------------------------- */
    // The one part of this machine that breaks the roof line, and the reason it
    // reads as a depot rather than as a tank. Kept whole.
    var BOOM = 3.50, BANG = 0.30;
    var bX = 2.35, bZ = 3.45, bY = 0.95;
    var tX = bX - Math.cos(BANG) * BOOM, tZ = bZ + Math.sin(BANG) * BOOM;
    frustum(builder, px(bX, bY), py(bX, bY), 0.44 * U, 0.36 * U, 0.52 * U, body, 2.70 * U, 10);
    frustum(builder, px(bX, bY), py(bX, bY), 0.32 * U, 0.32 * U, 0.16 * U, dark, 3.18 * U, 10);
    dbox(bX, bY, 3.45, 0.46, 0.54, 0.40, body);
    dbox(bX, bY, 3.74, 0.18, 0.18, 0.62, body);
    dbox(bX, bY, 4.06, 0.30, 0.26, 0.10, dark);
    vbox((bX + tX) / 2, bY, (bZ + tZ) / 2, BOOM, 0.34, 0.30, -BANG, 0, body);
    vbox(bX - Math.cos(BANG) * BOOM * 0.45 - 0.05, bY,
      bZ + Math.sin(BANG) * BOOM * 0.45 + 0.26, BOOM * 0.86, 0.26, 0.11, -BANG, 0, dark);
    for (i = 0; i < 3; i++) {
      var wt = 0.20 + i * 0.28;
      vbox(bX - Math.cos(BANG) * BOOM * wt, bY,
        bZ + Math.sin(BANG) * BOOM * wt + 0.16, 0.08, 0.20, 0.40,
        -BANG + (i % 2 ? 0.5 : -0.5), 0, dark);
    }
    dbox(tX, bY, tZ, 0.30, 0.34, 0.30, dark);
    segment(builder, px(bX, bY), py(bX, bY), 4.02 * U, px(tX, bY), py(tX, bY),
      tZ * U, 0.03 * U, dark);
    segment(builder, px(tX - 0.11, bY), py(tX - 0.11, bY), (tZ - 0.07) * U,
      px(tX - 0.11, bY), py(tX - 0.11, bY), (tZ - 1.38) * U, 0.03 * U, dark);
    dbox(tX - 0.11, bY, tZ - 1.55, 0.20, 0.20, 0.30, rust);

    /* ---- sides ----------------------------------------------------------- */
    for (s = -1; s <= 1; s += 2) {
      var sy = s * 1.97;
      louvre(2.00, 3.10, 1.55, 2.25, sy, 4, body);
      dbox(0.55, sy, 1.72, 1.00, 0.14, 0.60, body);
      dbox(0.55, sy, 2.05, 1.05, 0.18, 0.09, dark);
      dbox(-0.65, s * 1.95, 1.90, 0.66, 0.06, 0.66, dark);
      dbox(-0.65, sy, 1.90, 0.55, 0.10, 0.55, body);
      dbox(3.30, sy, 1.42, 0.50, 0.22, 0.10, dark);
      dbox(1.75, sy, 1.85, 0.12, 0.10, 1.10, body);
      dbox(-1.25, sy, 1.85, 0.12, 0.10, 1.10, body);
      dbox(2.20, s * 1.92, 2.42, 2.20, 0.09, 0.09, dark);
      dbox(-2.20, s * 1.40, 2.76, 0.12, 0.12, 0.20, dark);
      dbox(3.40, s * 1.40, 2.76, 0.12, 0.12, 0.20, dark);
      // A fuel drum strapped to each rear quarter.
      segment(builder, px(3.03, s * 1.50), py(3.03, s * 1.50), 2.50 * U,
        px(3.87, s * 1.50), py(3.87, s * 1.50), 2.50 * U, 0.24 * U, rust);
      dbox(3.45, s * 1.50, 2.50, 0.10, 0.56, 0.34, dark);
    }
    // The tarps. Slabs, not cloth -- the source's wrinkles are a millimetre
    // deep and this board draws the whole vehicle in two hundred pixels.
    dbox(0.35, 2.00, 2.05, 1.60, 0.06, 1.00, canvas);
    dbox(0.35, 1.90, 2.53, 1.70, 0.14, 0.09, dark);
    dbox(3.35, -0.50, 2.80, 1.35, 1.15, 0.06, canvas);
    dbox(3.35, -0.25, 2.86, 1.45, 0.09, 0.05, dark);

    /* ---- rear ------------------------------------------------------------ */
    dbox(4.08, 0, 1.90, 0.12, 3.60, 1.50, body);
    dbox(4.14, 0, 1.90, 0.08, 1.60, 0.90, dark);
    for (i = 0; i < 4; i++) {
      vbox(4.19, 0, 1.60 + i * 0.22, 0.06, 1.50, 0.10, 0.30, 0, body);
    }
    for (s = -1; s <= 1; s += 2) {
      dbox(4.14, s * 0.50, 2.45, 0.24, 0.30, 0.30, dark);
      dbox(4.14, s * 1.15, 2.10, 0.24, 0.30, 0.30, dark);
      dbox(4.20, s * 1.00, 1.28, 0.30, 0.22, 0.22, rust);
      dbox(4.18, s * 1.50, 2.55, 0.14, 0.20, 0.20, dark);
    }
    dbox(4.20, 0, 1.22, 0.24, 2.60, 0.22, rust);
    dbox(4.24, 0, 1.90, 0.18, 1.20, 0.70, dark);
    for (i = 0; i < 3; i++) dbox(4.32, 0, 1.68 + i * 0.24, 0.10, 1.10, 0.14, rust);

    /* ---- the ramp, and where the enemies come from ----------------------- */
    // Hinged at the sill and down to the dirt inside its own length, exactly as
    // the source has it. `u` runs out from the hinge along the bed and `v` is
    // clear of it, which is the source's ramp-group local frame with the sign
    // of x flipped -- so the plank spacing and the rail offsets below are its
    // numbers, not new ones.
    //
    // WHERE THE TOE LANDS IS A GAMEPLAY FACT, not a composition one, and it is
    // why the depot is parked where maps.js parks it. Enemies are drawn
    // standing on the flat board, so anything the route crosses UNDER the bed
    // walks through it: the toe has to sit at or west of the route's first
    // point, and the machine hangs east off it.
    var RL = DEPOT.RAMP_LEN, RA = Math.asin(DEPOT.RAMP_DROP / RL);
    var rc = Math.cos(RA), rs = Math.sin(RA);
    var HGX = DEPOT.HINGE_X, HGZ = DEPOT.HINGE_Z;      // the hinge, at the sill
    function ramp(u, v, Y, w, d, h, color, tilt) {
      vbox(HGX - u * rc - v * rs, Y, HGZ - u * rs + v * rc, w, d, h,
        RA + (tilt || 0), 0, color);
    }
    ramp(RL / 2, 0, 0, RL, 2.00, 0.10, rust);
    for (i = 0; i < 6; i++) {
      ramp(RL / 2, 0.09, -0.79 + i * 0.317, RL - 0.10, 0.24, 0.08,
        i % 2 ? rust : dark);
    }
    for (i = 0; i < 4; i++) ramp(0.35 + i * 0.78, 0.12, 0, 0.10, 1.96, 0.10, dark);
    for (s = -1; s <= 1; s += 2) ramp(RL / 2, 0.11, s * 1.03, RL, 0.12, 0.22, dark);
    ramp(0.06, 0.02, 0, 0.20, 2.10, 0.20, dark);
    ramp(RL - 0.05, -0.02, 0, 0.30, 1.98, 0.06, rust, 0.12);

    // The chains off the nose to the ramp head. Two runs, not twenty-five
    // links: at three pixels a link the sag is the only thing that survives,
    // and a two-segment kink says sag.
    for (s = -1; s <= 1; s += 2) {
      dbox(-4.10, s * 1.30, 2.50, 0.16, 0.16, 0.16, dark);
      segment(builder, px(-4.10, s * 1.30), py(-4.10, s * 1.30), 2.46 * U,
        px(-4.62, s * 1.24), py(-4.62, s * 1.24), 1.52 * U, 0.045 * U, dark);
      segment(builder, px(-4.62, s * 1.24), py(-4.62, s * 1.24), 1.52 * U,
        px(-5.05, s * 1.18), py(-5.05, s * 1.18), 1.06 * U, 0.045 * U, dark);
    }
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
        // PALE, not black. A hill drawn in the near-black machine colour is a
        // hole cut in the sky, and the one thing a far-off ridge has to say is
        // "distance" -- so it is drawn in the theme's own haze colour, between
        // the fog and the sky, and the fog then takes it the rest of the way.
        var rgFar = P.ridge || dark, rgNear = P.ridgeDark || dark;
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
              mrH / slices * 1.7, mr === 0 ? rgFar : rgNear,
              mrH * t4 * 0.86, mrA);
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

      case "palisade-gate":
        // Closed, because leaked enemies are hammering on it. Two leaves, a
        // frame and a brace.
        //
        // RENAMED from "gate" on the merge with the route-profile branch: that
        // board authors an arch OVER the road under the same name, and one
        // switch cannot hold two cases of it. The first won and the other one
        // was dead code -- which git merged without a word.
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

      case "depot":
        // THE MOBILE WAREHOUSE, and every part of it -- tracks, ramp,
        // stacks, crane and the lit bay the enemies walk out of -- is one
        // prop. It used to be nine: a slab here plus a separate ramp, five
        // wheels lying on the dirt beside it and two stacks planted in the
        // ground, each with its own size and position, which is nine numbers
        // to keep in step and a machine that came apart the moment anybody
        // moved it. See `mobileDepot` for the port this is built from.
        mobileDepot(builder, cx, cy, size, rot, P);
        break;

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
    solid: solid,
    wobble: wobble,
    box: box,
    frustum: frustum,
    boxAt: boxAt,
    segment: segment,
    scenery: scenery,
    depotWalkway: depotWalkway,
    river: river,
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
                    "palisade-gate", "palisade", "lantern",
                    "depot", "depot-ramp", "wheel", "exhaust", "floodlight",
                    // The crossing and what is buried at the other end of the
                    // road. Neither is a facility part and neither is timber
                    // the camp cut -- they are the two things on this board
                    // that were already here.
                    "bridge", "casket",
                    // The two ends of a road, and the wiring that survived
                    // between them.
                    "conduit"]
  };
})();
