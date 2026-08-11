// ---------------------------------------------------------------------------
// SiphonFXGround -- LOT L4: what the Siphon does to the ground it stands on.
//
// Two effects, one per path, both DECALS: they lie on the board, they never
// stand up off it, and neither of them is allowed to make the tower look
// bigger than the 15 u.l. footprint the simulation reserves for it.
//
//   THE VEIN (voie B, from B3 where `lifesteal` unlocks)
//     A root that leaves from under the train of the robe, runs the whole map
//     and ends beside the road's exit -- the base. It is the ONLY part of this
//     tower that is visible from across the board, so at rest it is a dark
//     groove and nothing else. It lights when a TRANSFER passes: lifesteal
//     returns HP to the base, and the player watches that HP travel up the
//     cable and arrive. Thin and pale at B3, branched at B4, thick and rooted
//     with secondary rootlets at B5.
//
//   THE GOLD POUR (voie A, from A4)
//     Banked gold overflowing at the idol's feet into an irregular plinth that
//     pools around the open side of the hem and thickens as the run earns. It
//     spreads a little at A5 and NEVER past the footprint radius.
//
// PRESENTATION ONLY. Nothing here is written back into the simulation. The
// module reads `hpHealed` and `goldGenerated` off the tower -- two counters
// the adapter keeps for its own panel -- keeps every byte of its own state in
// its own records, and its only output is canvas calls.
//
// ---------------------------------------------------------------------------
// WHERE gl-world.js MUST CALL THIS  (this file changes nothing else)
// ---------------------------------------------------------------------------
//
// 1. js/index.html, beside the other js/gl scripts -- after gl-world.js, next
//    to the siphon-beam-spec line (index.html:166):
//
//        <script src="js/gl/siphon-ground.js"></script>
//
// 2. js/gl/gl-world.js, inside `drawOverlays`, at the HEAD of the ground-decal
//    layer -- immediately before the `BlubFXSystems.drawDecals` call (the
//    block commented "THE SUMMONER'S GROUND LAYER", gl-world.js:1385):
//
//        // THE SIPHON'S GROUND LAYER (js/gl/siphon-ground.js). The vein and
//        // the gold pour are stains this tower has made on the board, so they
//        // lie under every other decal and every piece of interface.
//        if (typeof SiphonFXGround !== "undefined") {
//          SiphonFXGround.drawGround(ctx, state, BLUB_FX_API);
//        }
//
//    AT TOP LEVEL, NOT INSIDE A withGround(), for exactly the reason the blub
//    modules are: the vein samples the surface under each of its OWN points,
//    which is how it follows the terrain over a raised deck and how it dips
//    under a road tile. An outer withGround() would flatten a map-long shape
//    onto whichever surface happened to be current.
//
// 3. Nothing else. There is no update() to schedule: `drawOverlays` runs once
//    per frame while the board is on screen, and the two counters this module
//    watches cannot move while it is not.
//
// ---------------------------------------------------------------------------
// PERFORMANCE -- and OVERDRAW is the axis, per visual-pass/PERF.md
// ---------------------------------------------------------------------------
//
// A vein is a map-long translucent shape, which is the exact thing PERF.md
// says to be afraid of. Five things keep it nearly free, in order of how much
// they matter:
//
//   1. IT IS A LINE, NEVER A FILL. Nothing here is a translucent area except
//      the pour, which is capped at the footprint (a 15 px radius: about 700
//      px^2, a thousandth of a 720p frame). The trunk at B5 is ~1400 px of
//      length at ~4 px of stroke -- 5 600 px^2, 0.6% of a 720p frame -- and a
//      pulse adds ~160 px of length at ~8 px for another 1 300. Three maxed
//      Siphons together come to roughly 4% of one frame's fill. Against a
//      2.89 ms stress baseline whose board is a full opaque pass, a 4%
//      translucent overlay is inside the noise, and it does not grow with
//      resolution as a share of the frame.
//
//   2. THE GEOMETRY IS BUILT ONCE, NOT PER FRAME. The route, its branches, its
//      rootlets, the road crossings and the pour's irregular contour are all
//      world-space arrays computed when the tower is first seen and rebuilt
//      only when the tier, the map or the pour's (quantised) size changes.
//
//   3. THE PROJECTION IS CACHED BEHIND A TWO-POINT CAMERA PROBE. Projecting a
//      vein is ~180 `worldToScreen` calls. Every frame the module projects TWO
//      probe points; if both land where they landed last frame, and the tower
//      count has not changed, the cached screen-space arrays are reused
//      untouched. A still camera therefore pays 2 projections per vein per
//      frame instead of 180, and the full price is paid only while the player
//      is actually orbiting.
//
//   4. NO GRADIENTS, NO shadowBlur, NO STRINGS BUILT PER FRAME. Every colour
//      this file can emit is a pre-built `rgba()` string in a 33-entry table
//      indexed by quantised alpha (see `inkTable`). The draw path allocates
//      nothing but the point objects `project` itself returns.
//
//   5. THE COSTLIEST PIXELS ARE NEVER DRAWN. Every sample that falls on the
//      road, or behind a tower's own silhouette, is dropped before it is
//      stroked -- so the busiest part of the board (the road, where every
//      enemy is) receives no ink from this module at all.
//
// Set `SiphonFXGround.measure = true` to have `stats()` report strokes and
// stroked area per frame. It is off by default and costs nothing when off.
// ---------------------------------------------------------------------------

var SiphonFXGround = (function () {
  "use strict";

  // --- the frozen socle ----------------------------------------------------
  //
  // visual-pass/SIPHON-SOCLE.md section 4, and tools/blender/siphon_origins.json
  // which the idol script emits. Copied rather than read because L4 must draw
  // before L1 has landed, and because a renderer that silently draws nothing
  // when a model file is missing is worse than one that draws in the right
  // place from the contract. If `SiphonOrigins` ever becomes a loaded global,
  // `anchor()` below picks it up without another edit.
  var ANCHORS = {
    VEIN_ROOT: [-0.12, -0.28, 0.02],   // behind the figure, on the train side
    POUR_ROOT: [0.09, 0.14, 0.01]      // at the open side of the hem
  };

  // Blender units -> WORLD PIXELS, which is what `drawActor` multiplies a model
  // by (`size = m.unitsToPx * scale`, gl-world.js:1054) and therefore the only
  // conversion that puts a decal where the body actually is.
  //
  // NOTE, and it is a real 4% and not a rounding: the pipeline emits 31.8032
  // px per Blender unit, i.e. ONE px per u.l., while the game's `ul()` is 1.04
  // px per u.l. So the idol's own authored footprint radius (0.4717 bu =
  // 15.0 px) is 4% smaller than the footprint the game reserves for it
  // (ul(15) = 15.6 px). Everything here is capped against the SMALLER of the
  // two, so the decal cannot enlarge the footprint under either reading.
  var U = 31.8032;
  var HEM_LONG = 0.66;    // train side, model -Y, from the axis
  var HEM_SHORT = 0.35;   // open side, model +Y
  var FOOT_BU = 0.4717;   // 15 u.l. as the model was authored

  function anchor(name) {
    var g = (typeof SiphonOrigins !== "undefined" && SiphonOrigins.socle)
      ? SiphonOrigins.socle[name] : null;
    return g || ANCHORS[name];
  }

  // --- palette, voie B and voie A, straight off the socle -------------------
  var INK = {
    oil: inkTable(20, 16, 28),        // oil_black  #14101C  the groove
    tendon: inkTable(107, 85, 112),   // tendon     #6B5570  pale filament
    mid: inkTable(114, 72, 102),      // tendon x rose_dim, the mature core
    roseDim: inkTable(122, 58, 92),   // rose_dim   #7A3A5C  pulse halo
    rose: inkTable(232, 111, 168),    // rose_sick  #E86FA8  the transfer
    gold: inkTable(201, 162, 39),     // gold       #C9A227
    goldDark: inkTable(138, 110, 28), // gold_dark  #8A6E1C
    amber: inkTable(217, 164, 65),    // amber      #D9A441
    warm: inkTable(240, 226, 192)     // white_warm #F0E2C0
  };

  // 33 pre-built strings per ink, alpha 0/32 .. 32/32. Every colour this file
  // emits comes out of one of these by index, so no frame ever concatenates a
  // string -- which is the rule PERF.md's "no per-frame string building" makes
  // and which this file would otherwise break once per stroke per vein.
  function inkTable(r, g, b) {
    var head = "rgba(" + r + "," + g + "," + b + ",";
    var out = new Array(33);
    for (var i = 0; i <= 32; i++) out[i] = head + (i / 32).toFixed(3) + ")";
    return out;
  }

  function ink(table, alpha) {
    var i = (alpha * 32 + 0.5) | 0;
    return table[i < 0 ? 0 : (i > 32 ? 32 : i)];
  }

  // --- deterministic noise -------------------------------------------------
  //
  // Every wobble, rootlet and pour lobe is hashed from the tower's own
  // position, so a given Siphon draws the same vein for the whole run instead
  // of shimmering, and two Siphons on one board never take the same line.
  function hash(n) {
    n = (n << 13) ^ n;
    return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) /
      1073741824;                                        // 0 .. ~2
  }
  function noise(seed, i) { return hash((seed * 1013904223 + i * 374761393) | 0) - 1; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function smooth(t) { return t <= 0 ? 0 : (t >= 1 ? 1 : t * t * (3 - 2 * t)); }

  // --- board facts, cached per map -----------------------------------------
  //
  // The road as a flat segment list, and the point the vein is heading for.
  // Rebuilt when the map object changes, which is the only thing that can move
  // either of them.
  var board = null;

  function unitPx() { return (typeof UNIT_LENGTH === "number") ? UNIT_LENGTH : 1.04; }

  function buildBoard(state) {
    var widthUl = (typeof ROAD_WIDTH_UL === "number") ? ROAD_WIDTH_UL : 21.875;
    var half = widthUl * unitPx() / 2;
    var segs = [];                       // x0,y0,x1,y1,dx,dy,len2 per segment
    var verts = [];                      // x,y per interior vertex
    var paths = state.paths || [];
    for (var p = 0; p < paths.length; p++) {
      var pts = paths[p].points;
      if (!pts || pts.length < 2) continue;
      for (var i = 0; i + 1 < pts.length; i++) {
        var dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
        segs.push(pts[i].x, pts[i].y, dx, dy, dx * dx + dy * dy || 1);
        if (i > 0) verts.push(pts[i].x, pts[i].y);
      }
    }
    return {
      map: state.map,
      routes: paths.length,
      segs: segs,
      verts: verts,
      half: half,
      // The mitre in GLGeometry.road pushes the outer edge of a corner out by
      // up to 2.5 half-widths, so a corner is treated as a disc of that radius.
      // Over-generous on purpose: over-hiding a few samples beside a bend costs
      // nothing, and a vein drawn ACROSS the tarmac breaks section 9.
      corner: half * 1.55,
      base: null
    };
  }

  // ON THE ROAD? -- the one test that decides where the vein is not allowed to
  // be seen. A point-segment distance against a flat array; no allocation, and
  // it is asked once per sample at BUILD time only, never per frame.
  function onRoad(b, x, y, pad) {
    var lim = b.half + (pad || 0);
    var s = b.segs, i;
    for (i = 0; i < s.length; i += 5) {
      var qx = x - s[i], qy = y - s[i + 1];
      var t = (qx * s[i + 2] + qy * s[i + 3]) / s[i + 4];
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var ex = qx - s[i + 2] * t, ey = qy - s[i + 3] * t;
      if (ex * ex + ey * ey < lim * lim) return true;
    }
    var c = b.corner + (pad || 0);
    for (i = 0; i < b.verts.length; i += 2) {
      var vx = x - b.verts[i], vy = y - b.verts[i + 1];
      if (vx * vx + vy * vy < c * c) return true;
    }
    return false;
  }

  // WHERE THE BASE IS.
  //
  // The game has no base object: a leak is an enemy reaching the END of a
  // route, and routes are authored to finish off-screen ("routes start and end
  // off-screen so enemies walk in and out of view", js/maps.js). So the base is
  // the last point of the first route -- and drawing the arrival there would
  // put the payoff past the edge of the board.
  //
  // The vein therefore ends at the last point of that route that is still ON
  // the board, pushed clear of the tarmac so it does not terminate on a tile it
  // is forbidden to be seen on. What the player sees is the vein coming to the
  // road's exit, gripping the ground beside it and diving under -- which is
  // where their HP is going.
  function baseTerminus(b, fromX, fromY) {
    var s = b.segs;
    if (!s.length) return null;
    var i = s.length - 5;
    var ax = s[i], ay = s[i + 1], dx = s[i + 2], dy = s[i + 3];
    var vw = (typeof VIEW_WIDTH === "number") ? VIEW_WIDTH : 1280;
    var vh = (typeof VIEW_HEIGHT === "number") ? VIEW_HEIGHT : 720;
    var inset = 30;
    // Walk back along the final segment until the point is inside the board.
    var t = 1, ex = ax + dx, ey = ay + dy;
    for (var k = 0; k < 24; k++) {
      if (ex >= inset && ex <= vw - inset && ey >= inset && ey <= vh - inset) break;
      t -= 1 / 24;
      if (t < 0) { t = 0; break; }
      ex = ax + dx * t; ey = ay + dy * t;
    }
    // WELL off the tarmac, on the side the tower is on. The first build put it
    // 8 px clear of the kerb, and with the approach also aligned to the road
    // the last third of the vein came in parallel and lay along the kerb for
    // 450 px -- on screen, under this camera's tilt, indistinguishable from
    // being ON the road. 26 px leaves a clear lane of ground between the two,
    // and `px,py` is handed out so each vein can push a little further still.
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var px = -dy / len, py = dx / len;
    var side = ((fromX - ex) * px + (fromY - ey) * py) < 0 ? -1 : 1;
    px *= side; py *= side;
    var off = b.half + 26;
    return {
      x: ex + px * off,
      y: ey + py * off,
      roadX: ex, roadY: ey,
      px: px, py: py, off: off,
      dirX: dx / len, dirY: dy / len
    };
  }

  // --- strands -------------------------------------------------------------
  //
  // Trunk, branch, rootlet, delta finger and root fan are all THE SAME THING: a
  // polyline lying on the ground, some of whose samples are underneath
  // something and must not be drawn. One shape, one projector, one stroker.
  //
  //   wx  world x,y per sample          sx  screen x,y per sample
  //   wz  decal height per sample       sv  1 = may be drawn this frame
  //   wm  0..1 along the strand         wh  1 = hidden in WORLD space (road)
  function strand(pts, zBase, b, roadPad) {
    var n = pts.length / 2;
    var st = {
      n: n,
      wx: new Float32Array(pts),
      wz: new Float32Array(n),
      wm: new Float32Array(n),
      wh: new Uint8Array(n),
      sx: new Float32Array(n * 2),
      sv: new Uint8Array(n),
      len: 0,
      s0: 0, s1: 1                 // where this strand sits along the trunk
    };
    var acc = 0, i;
    for (i = 1; i < n; i++) {
      var dx = st.wx[i * 2] - st.wx[i * 2 - 2], dy = st.wx[i * 2 + 1] - st.wx[i * 2 - 1];
      acc += Math.sqrt(dx * dx + dy * dy);
      st.wm[i] = acc;
    }
    st.len = acc || 1;
    for (i = 0; i < n; i++) {
      st.wm[i] /= st.len;
      st.wz[i] = zBase;
      if (b && onRoad(b, st.wx[i * 2], st.wx[i * 2 + 1], roadPad || 0)) st.wh[i] = 1;
    }
    // THE DIVE. A sample next to a hidden one is a LIP: it is the last ground
    // the vein is on before it goes under the road, so it drops below the
    // surface it is lying on. The board has real height -- the road ribbon sits
    // 7 above the floor -- so a lip at -1.6 is unambiguously under the tile it
    // is about to pass beneath, and the stroker (below) leaves the bright core
    // off the lip sample so the vein visibly narrows and darkens into the dive
    // rather than being chopped off.
    for (i = 0; i < n; i++) {
      if (st.wh[i]) continue;
      if ((i > 0 && st.wh[i - 1]) || (i + 1 < n && st.wh[i + 1])) st.wz[i] = zBase - 1.6;
    }
    return st;
  }

  // --- geometry: the vein --------------------------------------------------

  function rot(x, y, c, s) { return [x * c - y * s, x * s + y * c]; }

  // THE YAW THE BODY IS ACTUALLY DRAWN AT, which is NOT `t.aim`.
  //
  // Everything this module rotates is a MODEL-space vector -- buildPour works
  // in "the model-space direction at phi off +Y", buildVein takes the train
  // side as model (0,-1) -- and gl-world draws siphon models at
  // `aim + authoredFrontOffset(model)`, which for /^siphon-/ is `aim - PI/2`.
  // `rot` is a plain CCW rotation, so rotating the authored +Y front by this
  // lands it on (cos aim, sin aim): the direction the body faces.
  //
  // Storing raw `aim` instead put every decal 90 degrees off the body. That was
  // invisible for exactly as long as `aim` was 0 and this module was unloaded.
  var SIPHON_YAW = -Math.PI / 2;

  function drawYaw(t) {
    var aim = (t && typeof t.aim === "number" && isFinite(t.aim)) ? t.aim : 0;
    return aim + SIPHON_YAW;
  }

  function buildVein(rec, t, b) {
    var tierB = rec.tierB;
    var seed = ((t.x * 73856093) ^ (t.y * 19349663)) | 0;
    // The yaw is frozen the first time the vein is built. BeamTower has no
    // `aim` (it is a continuous weapon and never turns), so this is 0 today --
    // but a root grown into the ground does not swing when the body above it
    // turns, and freezing it is what makes that true if the tower ever gains
    // one. The anchor itself is 9.7 px from the axis, i.e. under a robe whose
    // hem reaches 21 px on that side, so the emergence point is never on
    // screen anyway; what the freeze protects is the SHAPE of the route.
    var c = Math.cos(rec.yaw), s = Math.sin(rec.yaw);
    var va = anchor("VEIN_ROOT");
    var r = rot(va[0] * U, va[1] * U, c, s);
    var rootX = t.x + r[0], rootY = t.y + r[1];
    var zBase = va[2] * U;                       // 0.64 px -- the socle's own z

    var shared = b.base;
    if (!shared) return null;
    // EVERY VEIN ENDS AT THE SAME BASE, and three of them arriving on exactly
    // the same 20 px of ground read as one fat cable rather than three. Each
    // takes its own lane, always FURTHER from the road, never nearer.
    var lane = Math.abs(noise(seed, 13)) * 34;
    var term = {
      x: shared.x + shared.px * lane, y: shared.y + shared.py * lane,
      roadX: shared.roadX, roadY: shared.roadY,
      px: shared.px, py: shared.py, off: shared.off + lane,
      dirX: shared.dirX, dirY: shared.dirY
    };

    var toX = term.x - rootX, toY = term.y - rootY;
    var L = Math.sqrt(toX * toX + toY * toY);
    if (!(L > 40)) return null;
    var ux = toX / L, uy = toY / L;

    // IT LEAVES FROM BEHIND. The departure heading is the train side of the
    // figure (model -Y), which is the side VEIN_ROOT is on and the side the
    // socle says the vein must use -- so it never crosses the front of the
    // model. Clamped to 105 degrees off the bearing to the base, or a base
    // sitting in front of the figure would make the root hairpin around it.
    var tr = rot(0, -1, c, s);
    var aBase = Math.atan2(uy, ux), aTrain = Math.atan2(tr[1], tr[0]);
    var d = aTrain - aBase;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    var LIMIT = 1.40;                            // 80 degrees
    if (d > LIMIT) d = LIMIT; else if (d < -LIMIT) d = -LIMIT;
    var aDep = aBase + d;

    // Two control points, each pushed sideways by a hashed amount, so the route
    // meanders like something grown rather than a drawn line -- and so two
    // Siphons feeding the same base take visibly different routes.
    //
    // THE AMPLITUDES ARE SMALL AND THE SECOND IS SMALLER, and both of those are
    // corrections to what the first build actually did on screen. At +/-16% of a
    // 900 px run the meander was +/-140 px: one vein arced clean off the top of
    // the board and another swung north of the exit road and back, so it crossed
    // the tarmac twice in its last 200 px -- visible in the capture as a pink arc
    // lying along the kerb. The approach control point is the one that decides
    // whether the last stretch stays on the tower's side of the road, so it gets
    // the least freedom.
    //
    // AND THE DEPARTURE IS A LOCAL FACT, NOT A HEADING. "It leaves from behind
    // the figure" is true of the first few dozen pixels; it is not a statement
    // about where the vein goes. Pulling the first control point a third of the
    // whole run along the train bearing made it one: on rune-circuit the vein
    // set off due north until it was level with the exit road and then ran 450
    // px east parallel to it, which is the one shape a ground effect must not
    // have next to a road. Capped at 120 px, it leaves from behind and then
    // takes the diagonal, crossing the road square instead of shadowing it.
    var m1 = noise(seed, 11) * 0.10, m2 = noise(seed, 23) * 0.05;
    var depLen = Math.min(L * 0.20, 120);
    var px = -uy, py = ux;
    var p0x = rootX, p0y = rootY;
    var p1x = rootX + Math.cos(aDep) * depLen + px * m1 * L;
    var p1y = rootY + Math.sin(aDep) * depLen + py * m1 * L;
    // The approach carries a TOUCH of the road's own heading, so the vein turns
    // toward the exit rather than arriving square on it -- but only a touch. At
    // 0.4 it arrived parallel and then ran the kerb; at 0.15 it comes in on the
    // diagonal from wherever the tower is, which is also what makes three veins
    // fan in from three directions instead of merging.
    var ex = ux * 0.85 + term.dirX * 0.15, ey = uy * 0.85 + term.dirY * 0.15;
    var el = Math.sqrt(ex * ex + ey * ey) || 1;
    var appLen = Math.min(L * 0.25, 200);
    var p2x = term.x - (ex / el) * appLen + px * m2 * L;
    var p2y = term.y - (ey / el) * appLen + py * m2 * L;

    // AND THE ROUTE STAYS ON THE BOARD. A cubic lies inside the convex hull of
    // its four control points, and the two ends are already on the board, so
    // clamping the two middle ones is enough to guarantee it -- no per-sample
    // clamp, which would flatten the curve against the edge instead of bending
    // it away.
    var vw = (typeof VIEW_WIDTH === "number") ? VIEW_WIDTH : 1280;
    var vh = (typeof VIEW_HEIGHT === "number") ? VIEW_HEIGHT : 720;
    p1x = clamp(p1x, 24, vw - 24); p1y = clamp(p1y, 24, vh - 24);
    p2x = clamp(p2x, 24, vw - 24); p2y = clamp(p2y, 24, vh - 24);

    var n = clamp(Math.round(L / 15), 26, 120) | 0;
    var pts = new Array(n * 2);
    for (var i = 0; i < n; i++) {
      var u = i / (n - 1), v = 1 - u;
      var bx = v * v * v * p0x + 3 * v * v * u * p1x + 3 * v * u * u * p2x + u * u * u * term.x;
      var by = v * v * v * p0y + 3 * v * v * u * p1y + 3 * v * u * u * p2y + u * u * u * term.y;
      // Micro-wander, two hashed frequencies, killed at both ends so the root
      // and the terminus stay exactly where the socle put them.
      var taper = Math.pow(Math.sin(Math.PI * u), 0.6);
      var w = (Math.sin(u * 17.3 + noise(seed, 3) * 6.3) * 3.1 +
               Math.sin(u * 41.7 + noise(seed, 7) * 6.3) * 1.7) * taper;
      // Tangent, for a perpendicular that follows the curve.
      var tx = 3 * v * v * (p1x - p0x) + 6 * v * u * (p2x - p1x) + 3 * u * u * (term.x - p2x);
      var ty = 3 * v * v * (p1y - p0y) + 6 * v * u * (p2y - p1y) + 3 * u * u * (term.y - p2y);
      var tl = Math.sqrt(tx * tx + ty * ty) || 1;
      pts[i * 2] = bx + (-ty / tl) * w;
      pts[i * 2 + 1] = by + (tx / tl) * w;
    }
    var trunk = strand(pts, zBase, b, 2);

    // BRANCHES -- one at B4, two at B5. Each leaves the trunk, bows out and
    // rejoins it, which is what makes a mature vein read as a vein rather than
    // as a thicker line.
    var branches = [];
    var nb = tierB >= 5 ? 2 : (tierB >= 4 ? 1 : 0);
    for (var k = 0; k < nb; k++) {
      var a0 = 0.26 + k * 0.30 + noise(seed, 31 + k) * 0.04;
      var a1 = a0 + 0.22 + noise(seed, 41 + k) * 0.03;
      if (a1 > 0.94) { a1 = 0.94; a0 = 0.72; }
      var bow = (k % 2 ? -1 : 1) * (9 + 7 * Math.abs(noise(seed, 51 + k)));
      var bp = [];
      var steps = 11;
      for (var q = 0; q <= steps; q++) {
        var f = q / steps;
        var sm = a0 + (a1 - a0) * f;
        var idx = sampleIndex(trunk, sm);
        var bx2 = trunk.wx[idx * 2], by2 = trunk.wx[idx * 2 + 1];
        var nx = trunk.wx[Math.min(trunk.n - 1, idx + 1) * 2] - bx2;
        var ny = trunk.wx[Math.min(trunk.n - 1, idx + 1) * 2 + 1] - by2;
        var nl = Math.sqrt(nx * nx + ny * ny) || 1;
        var off = Math.sin(Math.PI * f) * bow;
        bp.push(bx2 + (-ny / nl) * off, by2 + (nx / nl) * off);
      }
      var br = strand(bp, zBase, b, 2);
      br.s0 = a0; br.s1 = a1;
      branches.push(br);
    }

    // ROOTLETS -- short spurs off the trunk, and a fan of fingers at the root
    // itself. This is the whole difference between "a cable" and "rooted".
    var rootlets = [];
    var nr = tierB >= 5 ? 12 : (tierB >= 4 ? 4 : 0);
    for (var j = 0; j < nr; j++) {
      var sm2 = 0.06 + 0.86 * ((j + 0.5) / nr) + noise(seed, 61 + j) * 0.02;
      var id2 = sampleIndex(trunk, sm2);
      var ox = trunk.wx[id2 * 2], oy = trunk.wx[id2 * 2 + 1];
      var jx = trunk.wx[Math.min(trunk.n - 1, id2 + 1) * 2] - ox;
      var jy = trunk.wx[Math.min(trunk.n - 1, id2 + 1) * 2 + 1] - oy;
      var jl = Math.sqrt(jx * jx + jy * jy) || 1;
      var sgn = (j % 2) ? 1 : -1;
      // Length falls off toward the base: the root is fattest where it is
      // anchored, exactly as the trunk tapers.
      var ln = (7 + 11 * Math.abs(noise(seed, 71 + j))) * (1 - 0.45 * sm2);
      var lean = 0.35 + 0.5 * noise(seed, 81 + j);
      var e1x = ox + (-jy / jl) * sgn * ln * 0.6 - (jx / jl) * ln * lean * 0.5;
      var e1y = oy + (jx / jl) * sgn * ln * 0.6 - (jy / jl) * ln * lean * 0.5;
      var e2x = ox + (-jy / jl) * sgn * ln - (jx / jl) * ln * lean;
      var e2y = oy + (jx / jl) * sgn * ln - (jy / jl) * ln * lean;
      var rl = strand([ox, oy, e1x, e1y, e2x, e2y], zBase, b, 2);
      rl.s0 = sm2; rl.s1 = sm2;
      rootlets.push(rl);
    }
    if (tierB >= 5) {
      // The fan under the hem: four fingers spread across the train side.
      for (var f2 = 0; f2 < 4; f2++) {
        var ang = aDep + (f2 - 1.5) * 0.46;
        var fl = 13 + 7 * Math.abs(noise(seed, 91 + f2));
        rootlets.push(strand([
          rootX, rootY,
          rootX + Math.cos(ang) * fl * 0.55, rootY + Math.sin(ang) * fl * 0.55,
          rootX + Math.cos(ang + 0.18) * fl, rootY + Math.sin(ang + 0.18) * fl
        ], zBase, b, 2));
      }
    }

    // THE DELTA -- where the vein reaches the base and goes under the road.
    //
    // NOT A FAN FROM THE END POINT. That is what this was first, three fingers
    // radiating from the terminus, and at the right-hand edge of the board it
    // drew an arrowhead pointing off the map -- an icon, which section 8 forbids
    // outright, and one that says "exit" rather than "this is where your life
    // goes in". Instead the last tenth of the trunk FRAYS: three short roots
    // leave it sideways at three different stations, head under the road, and
    // are cut at the kerb by the same mask that cuts the trunk. Three parallel
    // dives, staggered, with no common origin to read as a point.
    var delta = [];
    var nd = 3;
    var reach = (term.off - b.half + 10) * (tierB >= 5 ? 1.0 : (tierB >= 4 ? 0.88 : 0.74));
    for (var g2 = 0; g2 < nd; g2++) {
      var sm3 = 0.885 + g2 * 0.045;
      var id3 = sampleIndex(trunk, sm3);
      var dx3 = trunk.wx[id3 * 2], dy3 = trunk.wx[id3 * 2 + 1];
      // Toward the road: the opposite of the offset that put the terminus clear
      // of it, turned a little per finger so they are not three copies.
      var da = Math.atan2(-term.py, -term.px) + (g2 - 1) * 0.22 +
        noise(seed, 111 + g2) * 0.12;
      var dd = reach * (0.8 + 0.35 * Math.abs(noise(seed, 101 + g2)));
      delta.push(strand([
        dx3, dy3,
        dx3 + Math.cos(da) * dd * 0.45, dy3 + Math.sin(da) * dd * 0.45,
        dx3 + Math.cos(da) * dd, dy3 + Math.sin(da) * dd
      ], zBase, b, 0));
    }

    return {
      trunk: trunk, branches: branches, rootlets: rootlets, delta: delta,
      rootX: rootX, rootY: rootY, lenPx: L,
      // Travel time scales with distance: a vein across a long map takes
      // visibly longer to deliver, which is the one honest thing a length can
      // say. Clamped so it is never a crawl and never a flicker.
      travel: clamp(L / 900, 0.7, 1.8)
    };
  }

  function sampleIndex(st, m) {
    var lo = 0, hi = st.n - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (st.wm[mid] < m) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  // --- geometry: the gold pour ---------------------------------------------
  //
  // A RING SECTOR, NOT A DISC, and that is not a saving -- it is the only
  // correct shape. This layer is drawn on the 2D canvas OVER the WebGL board,
  // with no depth buffer to stop it, so a filled puddle centred on the tower
  // would be painted straight over the bottom of the model. The ground under
  // the robe cannot be seen anyway, so the pour starts at the HEM and runs
  // outward: 11.1 px from the axis on the open side, 21.0 on the train side
  // (socle section 1, converted at 31.8032 px per Blender unit).
  //
  // It is also held to the FRONT of the figure, which is where POUR_ROOT is and
  // where the robe opens. That is what the brief asks for, and it happens to be
  // the half of the ground that projects DOWN-screen, in front of the body,
  // where a decal can never cover it.
  var POUR_SPOKES = 24;

  function buildPour(rec, t) {
    var seed = ((t.x * 83492791) ^ (t.y * 29399999)) | 0;
    var c = Math.cos(rec.yaw), s = Math.sin(rec.yaw);
    var pa = anchor("POUR_ROOT");
    var zBase = pa[2] * U;                        // 0.32 px
    // Which bearing the gold actually comes out at, from the anchor itself:
    // 33 degrees off the figure's front, toward its +X side.
    var phi0 = Math.atan2(pa[0], pa[1]);

    // NEVER LARGER THAN THE FOOTPRINT. Both readings of it (see the note on U),
    // smaller wins, and 0.97 of that so the cap is visible as a cap.
    var cap = Math.min(FOOT_BU * U,
      (typeof t.footprintPx === "number" ? t.footprintPx : FOOT_BU * U)) * 0.97;

    // HOW A CAPPED DECAL STILL SPREADS PER TIER.
    //
    // It cannot spread outward: the footprint is the ceiling and the hem is the
    // floor, and on the train side the hem (21 px) is already OUTSIDE the
    // footprint (15 px) -- there is no ground between them to pour onto, which
    // is why the spokes there are dropped rather than clamped. So A5 spreads
    // ROUND: a wider arc of the hem is under gold, and the band it does have is
    // thicker. Radius never moves.
    var arcLimit = rec.tierA >= 5 ? 1.50 : 1.05;
    var band = (rec.tierA >= 5 ? 7.4 : 5.2) * (0.70 + 0.30 * rec.goldK);
    var inner = new Float32Array(POUR_SPOKES * 2);
    var outer = new Float32Array(POUR_SPOKES * 2);
    var mid = new Float32Array(POUR_SPOKES * 2);
    var lit = new Uint8Array(POUR_SPOKES);
    var on = new Uint8Array(POUR_SPOKES);

    for (var i = 0; i < POUR_SPOKES; i++) {
      var phi = -arcLimit + (2 * arcLimit) * (i / (POUR_SPOKES - 1));
      // model-space direction at phi off +Y, then into world.
      var dm = rot(Math.sin(phi), Math.cos(phi), c, s);
      // The hem, interpolated between the socle's two measured radii.
      var rIn = (0.505 - 0.155 * Math.cos(phi)) * U - 2.0;   // 2 px under the lip
      if (rIn > cap - 0.8) continue;              // hem already past the cap
      // Heaviest where it pours from, thinning away round the hem, with a
      // hashed irregularity so no two towers pool the same shape.
      var dphi = phi - phi0;
      var lobe = 0.34 + 0.66 * Math.exp(-(dphi * dphi) / 1.55);
      var rough = 0.74 + 0.13 * (1 + noise(seed, i * 7)) +
                  0.18 * Math.sin(i * 2.7 + noise(seed, 5) * 6.3);
      var rOut = rIn + band * lobe * rough;
      if (rOut > cap) rOut = cap;                 // the footprint, and no more
      var rMid = rIn + (rOut - rIn) * 0.55;
      inner[i * 2] = t.x + dm[0] * rIn; inner[i * 2 + 1] = t.y + dm[1] * rIn;
      mid[i * 2] = t.x + dm[0] * rMid; mid[i * 2 + 1] = t.y + dm[1] * rMid;
      outer[i * 2] = t.x + dm[0] * rOut; outer[i * 2 + 1] = t.y + dm[1] * rOut;
      lit[i] = (phi > phi0 - 0.9 && phi < phi0 + 1.4) ? 1 : 0;
      on[i] = 1;
    }
    return {
      inner: inner, mid: mid, outer: outer, lit: lit, on: on, z: zBase,
      si: new Float32Array(POUR_SPOKES * 2),
      sm: new Float32Array(POUR_SPOKES * 2),
      so: new Float32Array(POUR_SPOKES * 2),
      sv: new Uint8Array(POUR_SPOKES)
    };
  }

  // --- records -------------------------------------------------------------

  var records = [];
  var counters = { veins: 0, pours: 0, projections: 0, strokes: 0, ink: 0 };

  function recordFor(t) {
    for (var i = 0; i < records.length; i++) if (records[i].t === t) return records[i];
    var rec = {
      t: t, seen: true,
      // FROZEN, and only the VEIN may use it: a root grown into the ground does
      // not swing when the body above it turns. The POUR carries its own live
      // yaw (`pourYaw`) because it is held to the front of the figure.
      yaw: drawYaw(t),
      pourYaw: drawYaw(t),
      tierA: -1, tierB: -1,
      vein: null, pour: null,
      healSeen: t.hpHealed || 0, healAccum: 0, sincePulse: 9,
      goldSeen: t.goldGenerated || 0, goldGlow: 0, goldK: 0, goldStep: -1,
      grow: 0, arrive: 0,
      pulses: [],
      // The two-point camera probe (see the header). Screen space is only
      // rebuilt when one of these moves.
      pa: null, pb: null, towerCount: -1
    };
    for (var k = 0; k < 6; k++) rec.pulses.push({ live: false, s: 0, amt: 0 });
    records.push(rec);
    return rec;
  }

  // --- per-frame update ----------------------------------------------------

  function tierOf(t, which) {
    var p = t.core && t.core.purchased;
    return (p && p[which]) || 0;
  }

  function updateRecord(rec, t, dt) {
    var tierA = tierOf(t, "A"), tierB = tierOf(t, "B");
    // The vein is keyed to the MECHANIC, which is what the socle settles by
    // reading beam.config.js: lifesteal unlocks at B3 and the vein appears
    // exactly there. The tier is the fallback for a tower whose stats have not
    // been resolved yet.
    var stats = t.core && t.core.stats;
    var hasVein = stats && stats.flags ? !!stats.flags.lifesteal : tierB >= 3;
    var hasPour = tierA >= 4;                    // socle section 4: A4

    // Gold, quantised into 16 steps so a decal that grows with the purse does
    // not rebuild its contour on the frame every coin lands.
    var gold = t.goldGenerated || 0;
    rec.goldK = clamp(Math.log(1 + gold / 900) / Math.log(1 + 20), 0, 1);
    var step = (rec.goldK * 16) | 0;

    if (tierA !== rec.tierA || tierB !== rec.tierB || rec.dirty) {
      rec.tierA = tierA; rec.tierB = tierB; rec.dirty = false;
      rec.vein = hasVein ? buildVein(rec, t, board) : null;
      rec.pour = null;
      rec.goldStep = -1;
      if (hasVein && rec.grow <= 0) rec.grow = 0.0001;   // it grows in
      rec.pa = null;
    }
    if (hasPour && (step !== rec.goldStep || !rec.pour)) {
      rec.goldStep = step;
      rec.pour = buildPour(rec, t);
      rec.pa = null;
    } else if (!hasPour) {
      rec.pour = null;
    }

    if (rec.grow > 0 && rec.grow < 1) rec.grow = Math.min(1, rec.grow + dt / 1.1);

    // THE TRANSFER. `hpHealed` is a total the adapter keeps for its own panel;
    // its INCREASE is the only honest signal that HP just went home, and it is
    // read, never written.
    //
    // Lifesteal lands on every damage tick -- ten a second -- which as ten
    // pulses a second would be a strobe, not a transfer. So the healed amount
    // is accumulated and released as one packet at most every 0.28 s, and the
    // packet carries what it accumulated: fast draining sends fatter pulses,
    // not more of them.
    var healed = (t.hpHealed || 0) - rec.healSeen;
    rec.healSeen = t.hpHealed || 0;
    if (healed < 0) { rec.healAccum = 0; healed = 0; }    // a run restarted
    if (healed > 0) rec.healAccum += healed;
    rec.sincePulse += dt;
    if (rec.vein && rec.healAccum > 0 && rec.sincePulse >= 0.28) {
      for (var i = 0; i < rec.pulses.length; i++) {
        if (rec.pulses[i].live) continue;
        rec.pulses[i].live = true;
        rec.pulses[i].s = 0;
        rec.pulses[i].amt = rec.healAccum;
        break;
      }
      rec.healAccum = 0;
      rec.sincePulse = 0;
    }
    var speed = rec.vein ? 1 / rec.vein.travel : 0;
    for (var j = 0; j < rec.pulses.length; j++) {
      var p = rec.pulses[j];
      if (!p.live) continue;
      p.s += speed * dt;
      if (p.s >= 1) { p.live = false; rec.arrive = 0.30; }   // it lands
    }
    if (rec.arrive > 0) rec.arrive = Math.max(0, rec.arrive - dt);

    // The pour answers to income the same way: gold banked lights it briefly.
    var dg = gold - rec.goldSeen;
    rec.goldSeen = gold;
    if (dg > 0) rec.goldGlow = 1;
    if (rec.goldGlow > 0) rec.goldGlow = Math.max(0, rec.goldGlow - dt * 2);
  }

  // --- screen space --------------------------------------------------------
  //
  // Occluders: a tower's own body. There is no depth buffer on this canvas, so
  // a ground point BEHIND a tower has to be masked by hand or the vein would be
  // painted over the body it is supposed to be growing out from under. A screen
  // box plus a depth compare is enough: `project` returns both.
  var occ = [];

  function buildOccluders(state, project) {
    occ.length = 0;
    var list = state.towers || [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var fp = t.footprintPx || 12;
      var b0 = project(t.x, t.y, 0);
      if (!b0) continue;
      var top = project(t.x, t.y, fp * 3.8 + 12);
      occ.push({
        x: b0.x, y: b0.y, depth: b0.depth,
        top: top ? top.y : b0.y - 40,
        // The robe's own reach: the socle's long hem is 0.66 bu = 21 px, i.e.
        // 1.35 footprint radii, and a narrower box let one spoke of the gold
        // pour survive behind the body and show up as a speck on its chest.
        hw: fp * 1.38 * (b0.scale || 1),
        wx: t.x, wy: t.y
      });
    }
  }

  function occluded(sx, sy, depth, wx, wy) {
    for (var i = 0; i < occ.length; i++) {
      var o = occ[i];
      // Only a tower the sample is actually NEAR can hide it; a distant tower's
      // tall box would otherwise erase a vein passing in front of it.
      var dx = wx - o.wx, dy = wy - o.wy;
      if (dx * dx + dy * dy > 4900) continue;              // 70 px
      if (depth <= o.depth) continue;                      // in front of it
      if (sx < o.x - o.hw || sx > o.x + o.hw) continue;
      if (sy > o.y + 2 || sy < o.top) continue;
      return true;
    }
    return false;
  }

  function projectStrand(st, project) {
    for (var i = 0; i < st.n; i++) {
      if (st.wh[i]) { st.sv[i] = 0; continue; }
      var wx = st.wx[i * 2], wy = st.wx[i * 2 + 1];
      var p = project(wx, wy, st.wz[i]);
      if (!p) { st.sv[i] = 0; continue; }
      st.sx[i * 2] = p.x; st.sx[i * 2 + 1] = p.y;
      st.sv[i] = occluded(p.x, p.y, p.depth, wx, wy) ? 0 : 1;
      counters.projections++;
    }
  }

  function refreshScreen(rec, state, project) {
    var v = rec.vein, i;
    if (v) {
      projectStrand(v.trunk, project);
      for (i = 0; i < v.branches.length; i++) projectStrand(v.branches[i], project);
      for (i = 0; i < v.rootlets.length; i++) projectStrand(v.rootlets[i], project);
      for (i = 0; i < v.delta.length; i++) projectStrand(v.delta[i], project);
    }
    var po = rec.pour;
    if (po) {
      for (i = 0; i < POUR_SPOKES; i++) {
        if (!po.on[i]) { po.sv[i] = 0; continue; }
        var pi = project(po.inner[i * 2], po.inner[i * 2 + 1], po.z);
        var pm = project(po.mid[i * 2], po.mid[i * 2 + 1], po.z);
        var pO = project(po.outer[i * 2], po.outer[i * 2 + 1], po.z);
        if (!pi || !pm || !pO) { po.sv[i] = 0; continue; }
        po.si[i * 2] = pi.x; po.si[i * 2 + 1] = pi.y;
        po.sm[i * 2] = pm.x; po.sm[i * 2 + 1] = pm.y;
        po.so[i * 2] = pO.x; po.so[i * 2 + 1] = pO.y;
        // THE CAMERA CAN ORBIT BEHIND THE FIGURE. The pour is authored on the
        // open side of the hem, which is normally the side facing the player --
        // but swing the camera round and that ground is behind the body, and
        // this canvas has no depth buffer to stop it being painted over the
        // robe. Orbiting 165 degrees put the whole pool up the front of the
        // model, which the capture caught as a pale arc across its chest.
        //
        // The first attempt PINCHED an occluded spoke onto its inner point,
        // which fixes the two fills (they collapse to zero area) and does
        // nothing at all for the two contour STROKES -- the inner point is just
        // as hidden as the outer one. So an occluded spoke is dropped outright,
        // and every part of the pour is drawn in RUNS of consecutive visible
        // spokes: the pool ends where the body begins, with no chord across it.
        po.sv[i] = occluded(pO.x, pO.y, pO.depth, po.outer[i * 2],
                            po.outer[i * 2 + 1]) ? 0 : 1;
        counters.projections += 3;
      }
    }
  }

  // --- stroking ------------------------------------------------------------
  //
  // Runs of consecutive drawable samples, optionally clipped to a window of the
  // strand's own arclength. The bright core is drawn one sample SHORT of a lip,
  // which is what makes a road crossing read as a dive rather than a cut.
  function strokeRuns(ctx, st, from, to, style, width, insetLip, overlap) {
    if (width <= 0.12) return;
    // A CEILING ON THE WIDTH, because `scale` is per-camera and a camera pushed
    // right down onto the board makes every world unit worth a lot of pixels.
    // The vein is allowed to look thick underfoot; it is not allowed to become
    // a fill, which is the one thing PERF.md says costs real money.
    if (width > 14) width = 14;
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    var i = 0, drawn = 0, len = 0;
    while (i < st.n) {
      if (!st.sv[i] || st.wm[i] < from || st.wm[i] > to) { i++; continue; }
      var a = i;
      // WHY A RUN MAY END ONE SAMPLE PAST `to`. The trunk is stroked in three
      // width bands, and a band that stopped at its own boundary would leave
      // the segment BETWEEN the last sample of one band and the first of the
      // next undrawn -- a visible nick in the vein at 0.34 and 0.68. With
      // `overlap` the bands share one segment instead. The pulse passes it
      // false, because there a spare sample is 15 px of stray light.
      while (i + 1 < st.n && st.sv[i + 1] &&
             (overlap ? st.wm[i] <= to : st.wm[i + 1] <= to)) i++;
      var b = i;
      if (insetLip) {
        if (a > 0 && !st.sv[a - 1] && b - a >= 2) a++;
        if (b < st.n - 1 && !st.sv[b + 1] && b - a >= 2) b--;
      }
      if (b > a) {
        ctx.beginPath();
        ctx.moveTo(st.sx[a * 2], st.sx[a * 2 + 1]);
        for (var k = a + 1; k <= b; k++) ctx.lineTo(st.sx[k * 2], st.sx[k * 2 + 1]);
        ctx.stroke();
        drawn++;
        if (measureOn) {
          for (var m = a + 1; m <= b; m++) {
            var dx = st.sx[m * 2] - st.sx[m * 2 - 2];
            var dy = st.sx[m * 2 + 1] - st.sx[m * 2 - 1];
            len += Math.sqrt(dx * dx + dy * dy);
          }
        }
      }
      i++;
    }
    counters.strokes += drawn;
    if (measureOn) counters.ink += len * width;
  }

  // --- drawing: the vein ---------------------------------------------------

  var TRUNK_W = { 3: 1.05, 4: 1.75, 5: 2.60 };   // world px, root end
  var BANDS = [0, 0.34, 0.68, 1];

  function drawVein(ctx, rec, scale) {
    var v = rec.vein;
    if (!v) return;
    var tier = rec.tierB < 3 ? 3 : (rec.tierB > 5 ? 5 : rec.tierB);
    var w0 = TRUNK_W[tier] * scale;
    var grow = rec.grow;
    var i, k;

    // AT REST IT IS A GROOVE, not a light. One dark casing pass at a constant
    // width, then the core in three bands so the vein is visibly fattest where
    // it is rooted and finest where it enters the base.
    var coreInk = tier >= 5 ? INK.mid : (tier >= 4 ? INK.mid : INK.tendon);
    var restA = tier >= 5 ? 0.40 : (tier >= 4 ? 0.34 : 0.28);

    strokeRuns(ctx, v.trunk, 0, grow, ink(INK.oil, 0.30), w0 * 1.85, false, true);
    for (k = 0; k < 3; k++) {
      var f = 1 - 0.42 * (k / 2);                  // 1.00, 0.79, 0.58 of w0
      strokeRuns(ctx, v.trunk, BANDS[k], Math.min(BANDS[k + 1], grow),
        ink(coreInk, restA), w0 * f, true, true);
    }

    for (i = 0; i < v.branches.length; i++) {
      var br = v.branches[i];
      if (br.s0 > grow) continue;
      strokeRuns(ctx, br, 0, 1, ink(INK.oil, 0.26), w0 * 1.15, false, true);
      strokeRuns(ctx, br, 0, 1, ink(coreInk, restA * 0.85), w0 * 0.58, true, true);
    }
    if (v.rootlets.length) {
      ctx.lineCap = "round";
      for (i = 0; i < v.rootlets.length; i++) {
        var rl = v.rootlets[i];
        if (rl.s0 > grow) continue;
        strokeRuns(ctx, rl, 0, 1, ink(coreInk, restA * 0.80), w0 * 0.42, false, true);
      }
      ctx.lineCap = "butt";
    }

    // The delta, and its arrival flash -- the only moment the far end of the
    // map says anything, and it says "this landed".
    var arr = rec.arrive > 0 ? rec.arrive / 0.30 : 0;
    if (grow >= 0.98) {
      for (i = 0; i < v.delta.length; i++) {
        strokeRuns(ctx, v.delta[i], 0, 1, ink(INK.oil, 0.24), w0 * 1.0, false, true);
        strokeRuns(ctx, v.delta[i], 0, 1,
          arr > 0 ? ink(INK.rose, 0.30 + 0.55 * arr) : ink(coreInk, restA * 0.9),
          w0 * (0.5 + 0.5 * arr), false, true);
      }
    }

    // THE TRANSFER ITSELF. A window of the trunk, lit from behind by a rose
    // halo and cored in rose_sick, travelling root -> base. Nothing else on the
    // vein changes: what moves is the only thing that is bright.
    var win = clamp(90 / v.lenPx, 0.05, 0.30);
    for (i = 0; i < rec.pulses.length; i++) {
      var p = rec.pulses[i];
      if (!p.live) continue;
      // Fatter packets are brighter and wider, never more numerous.
      var amt = clamp(Math.log(1 + p.amt) / Math.log(1 + 14), 0.30, 1);
      var head = p.s, tail = Math.max(0, p.s - win);
      // Fade in and out at the two ends so a pulse does not pop into existence
      // at the root or vanish at the terminus.
      var edge = Math.min(1, Math.min(p.s / 0.06, (1 - p.s) / 0.06));
      edge = edge < 0 ? 0 : edge;
      var a = amt * edge;
      strokeRuns(ctx, v.trunk, tail, Math.min(head, grow),
        ink(INK.roseDim, 0.34 * a), w0 * 2.5, false, false);
      strokeRuns(ctx, v.trunk, tail, Math.min(head, grow),
        ink(INK.rose, 0.55 + 0.35 * a), w0 * 1.05, true, false);
      // A branch lights only while the packet is actually inside its span.
      for (k = 0; k < v.branches.length; k++) {
        var b2 = v.branches[k];
        if (head < b2.s0 || head > b2.s1) continue;
        strokeRuns(ctx, b2, 0, 1, ink(INK.rose, 0.28 * a), w0 * 0.62, true, true);
      }
      // The head, as a cap on the last visible sample -- the one filled shape
      // in the whole vein, and it is a few px across.
      var hi = sampleIndex(v.trunk, Math.min(head, grow));
      if (v.trunk.sv[hi]) {
        ctx.fillStyle = ink(INK.rose, 0.55 + 0.4 * a);
        ctx.beginPath();
        ctx.arc(v.trunk.sx[hi * 2], v.trunk.sx[hi * 2 + 1],
          Math.max(0.8, w0 * (0.85 + 0.5 * a)), 0, Math.PI * 2);
        ctx.fill();
        counters.strokes++;
        if (measureOn) {
          var rr = Math.max(0.8, w0 * (0.85 + 0.5 * a));
          counters.ink += Math.PI * rr * rr;
        }
      }
    }
  }

  // --- drawing: the gold pour ----------------------------------------------

  // Fill the band between two contours, over ONE run of visible spokes.
  function pourFill(ctx, po, outA, inA, a, b) {
    if (b <= a) return;
    var i;
    ctx.beginPath();
    ctx.moveTo(outA[a * 2], outA[a * 2 + 1]);
    for (i = a + 1; i <= b; i++) ctx.lineTo(outA[i * 2], outA[i * 2 + 1]);
    for (i = b; i >= a; i--) ctx.lineTo(inA[i * 2], inA[i * 2 + 1]);
    ctx.closePath();
    ctx.fill();
    counters.strokes++;
  }

  function pourStroke(ctx, po, arr, a, b, litOnly) {
    var i, started = false, any = false;
    ctx.beginPath();
    for (i = a; i <= b; i++) {
      if (litOnly && !po.lit[i]) { started = false; continue; }
      if (!started) { ctx.moveTo(arr[i * 2], arr[i * 2 + 1]); started = true; }
      else { ctx.lineTo(arr[i * 2], arr[i * 2 + 1]); any = true; }
    }
    if (any) { ctx.stroke(); counters.strokes++; }
  }

  function drawPour(ctx, rec, scale) {
    var po = rec.pour;
    if (!po) return;
    // Cooled metal at the lip, brighter where it is still pooling against the
    // hem. Flat fills and hairlines only -- no gradient, no blur -- and every
    // one of them walks the same runs of visible spokes, so an orbited camera
    // ends the pool at the body's edge instead of painting it up the robe.
    var lipW = Math.max(0.7, 0.9 * scale);
    var litW = Math.max(0.7, 1.1 * scale);
    var darkInk = ink(INK.goldDark, 0.62);
    var poolInk = ink(INK.gold, 0.52 + 0.16 * rec.goldGlow);
    var lipInk = ink(INK.goldDark, 0.75);
    var litInk = rec.goldGlow > 0 ? ink(INK.warm, 0.30 + 0.45 * rec.goldGlow)
                                  : ink(INK.amber, 0.42);
    var i = 0, spans = 0;
    while (i < POUR_SPOKES) {
      if (!po.sv[i]) { i++; continue; }
      var a = i;
      while (i + 1 < POUR_SPOKES && po.sv[i + 1]) i++;
      var b = i;
      i++;
      if (b <= a) continue;
      spans++;
      ctx.fillStyle = darkInk;  pourFill(ctx, po, po.so, po.si, a, b);
      ctx.fillStyle = poolInk;  pourFill(ctx, po, po.sm, po.si, a, b);
      ctx.strokeStyle = lipInk; ctx.lineWidth = lipW;
      pourStroke(ctx, po, po.so, a, b, false);
      ctx.strokeStyle = litInk; ctx.lineWidth = litW;
      pourStroke(ctx, po, po.sm, a, b, true);
    }
    // The decal is capped at the footprint, so its area is bounded by
    // pi * 15^2 whatever the tier: charged generously and once.
    if (measureOn && spans) counters.ink += 720 * scale * scale;
  }

  // --- entry point ---------------------------------------------------------

  var measureOn = false;

  function drawGround(ctx, state, api) {
    if (!state || !state.towers || !state.towers.length) return;
    var project = (api && api.project) || null;
    if (!project) return;

    counters.veins = 0; counters.pours = 0;
    counters.projections = 0; counters.strokes = 0; counters.ink = 0;
    measureOn = !!SiphonFXGround.measure;

    if (!board || board.map !== state.map || board.routes !== (state.paths || []).length) {
      board = buildBoard(state);
      for (var r = 0; r < records.length; r++) records[r].dirty = true;
      board.base = null;
    }
    if (!board.segs.length) return;

    var dt = clamp(state.dt || 1 / 60, 0, 0.1);
    var i, k;
    for (i = 0; i < records.length; i++) records[i].seen = false;

    var live = 0;
    for (i = 0; i < state.towers.length; i++) {
      var t = state.towers[i];
      if (!t.constructor || t.constructor.ID !== "siphon") continue;
      if (!board.base) board.base = baseTerminus(board, t.x, t.y);
      var rec = recordFor(t);
      rec.seen = true;
      updateRecord(rec, t, dt);
      if (rec.vein || rec.pour) live++;
    }
    for (i = records.length - 1; i >= 0; i--) if (!records[i].seen) records.splice(i, 1);
    if (!live) return;

    // Occluders are rebuilt whenever anything might have moved -- which is the
    // same condition the screen cache uses, so they are shared.
    var towerCount = state.towers.length;
    var occBuilt = false;

    var prevCap = ctx.lineCap, prevJoin = ctx.lineJoin;
    ctx.lineJoin = "round";

    for (i = 0; i < records.length; i++) {
      var rc = records[i];
      if (!rc.vein && !rc.pour) continue;

      // THE CAMERA PROBE. Two points, BOTH BESIDE THE TOWER -- not the two ends
      // of the vein, which is what this was first written as and which broke
      // outright: `project` returns null for anything behind the eye, the base
      // end of a map-long vein goes behind the eye as soon as the player orbits,
      // and a null probe threw away the whole record. Orbiting 165 degrees drew
      // NOTHING AT ALL, vein and pour together. Two points 85 px apart on the
      // ground by the tower are effectively never behind the eye, and they still
      // pin the camera exactly: no orbit, pan or zoom can leave two ground
      // points at the same two screen positions.
      //
      // If neither has moved and the tower list is the same length, every
      // projected sample from last frame is still right, and ~180
      // worldToScreen calls are simply not made.
      var pa = project(rc.t.x, rc.t.y, 0);
      var pb = project(rc.t.x + 60, rc.t.y + 60, 0);
      counters.projections += 2;

      var still = pa && pb && rc.pa && rc.pb && rc.towerCount === towerCount &&
        Math.abs(rc.pa.x - pa.x) < 0.02 && Math.abs(rc.pa.y - pa.y) < 0.02 &&
        Math.abs(rc.pb.x - pb.x) < 0.02 && Math.abs(rc.pb.y - pb.y) < 0.02;
      if (!still) {
        if (!occBuilt) { buildOccluders(state, project); occBuilt = true; }
        refreshScreen(rc, state, project);
        rc.pa = pa ? { x: pa.x, y: pa.y } : null;
        rc.pb = pb ? { x: pb.x, y: pb.y } : null;
        rc.towerCount = towerCount;
      }
      var scale = (pa && pa.scale) || (pb && pb.scale) || 1;

      if (rc.vein) { drawVein(ctx, rc, scale); counters.veins++; }
      if (rc.pour) { drawPour(ctx, rc, scale); counters.pours++; }
    }

    ctx.lineCap = prevCap;
    ctx.lineJoin = prevJoin;
  }

  function reset() {
    records.length = 0;
    board = null;
  }

  function stats() {
    return {
      veins: counters.veins, pours: counters.pours,
      projections: counters.projections, strokes: counters.strokes,
      inkPx: Math.round(counters.ink)
    };
  }

  return {
    drawGround: drawGround,
    reset: reset,
    stats: stats,
    measure: false,
    ANCHORS: ANCHORS,
    UNITS_TO_PX: U
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = SiphonFXGround;
}
