// ---------------------------------------------------------------------------
// World3D -- the 3D battlefield, as a drop-in replacement for ONE layer of
// js/game.js's draw().
//
// THE SEAM. `draw()` is already split exactly where this needs it to be: a
// `ctx.save()`, a camera transform, the world (terrain, road, bodies, bullets),
// then `ctx.restore()` and the entire HUD. Everything above that restore is
// what this replaces; everything below it is untouched 2D and stays that way.
// Menus, the map chooser, the codex, the store, the build bar, the boss bar and
// every panel keep working exactly as they do today, because none of them ever
// knew where the camera was.
//
// The second seam is `screenToWorld`, which is the ONE function every
// world-space input goes through -- hover, placement, inspection, aiming. Point
// it at a ground-plane raycast and the whole input layer works in 3D without
// touching a single call site.
//
// WHAT IS 3D AND WHAT IS STILL 2D, and why the split is where it is:
//
//   3D (WebGL)   terrain, road, tower bodies, enemy bodies, projectiles --
//                everything that is a physical thing standing on the board.
//   2D (canvas)  health bars, range rings, the build preview, hover labels --
//                everything that is INTERFACE about a physical thing. These
//                have to stay screen-facing and pixel-crisp, so they are drawn
//                on the 2D canvas at a position asked for from the camera's
//                `worldToScreen`. Billboarding them in the 3D pass would make
//                them shrink with distance and tilt with the board, which is
//                wrong for interface.
//
// NOTHING HERE TOUCHES SIMULATION. No position, radius, range, path, cooldown
// or hit test is read back from this file. It is a renderer.
// ---------------------------------------------------------------------------

var World3D = (function () {
  "use strict";

  var enabled = false;
  var renderer = null;
  var camera = null;
  var glCanvas = null;
  var uiCanvas = null;

  var mapMesh = null;
  // Created on the first outdoor frame and kept. `undefined` means "not tried
  // yet"; `null` means "tried and this context cannot", which is not an error
  // worth retrying sixty times a second.
  var sky;

  function mixTriple(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t];
  }
  // PROPS THAT DO NOT GLOW IN THE BOARD'S COLOUR, as their own meshes.
  //
  // Emission is `uGlowTint * vEmi` -- ONE tint per draw call, not per vertex --
  // so the whole board pass emits in the map's accent and a prop cannot opt out
  // of that by carrying a different vertex colour: its diffuse would be violet
  // and every lit surface on it would still be adding ember. The only way a
  // prop owns its own LIGHT rather than just its own paint is to be drawn
  // separately, so a prop that declares `accent` is split out of the board mesh
  // into one of these and drawn immediately after it under its own tint.
  //
  // Grouped by colour, not one per prop: six caskets in one violet would cost
  // one draw call, not six.
  var accentMeshes = [];
  var mapKey = null;
  var bounds = null;
  // Kept from the last build so the world pass can light the board's own
  // emissive scenery in the map's colour without re-deriving the theme.
  var mapPalette = null;

  // WHAT AN ACTOR IS STANDING ON.
  //
  // The board has real height -- a deck top sits at z 9.4, the road ribbon at
  // 7 -- but every actor used to be drawn at z 0, so a tower built on a deck
  // sank to its knees in it and every enemy on the road walked buried up to the
  // axles in the track. The models were never wrong; nothing ever told them how
  // high the floor was under them.
  //
  // A coarse height grid, stamped once when the map mesh is built. A lookup is
  // two integer divides and an array read, which is what makes it affordable to
  // ask per actor per frame with a hundred enemies on the board. Rebuilt only
  // when the map changes, exactly like the mesh it is derived from.
  var heightField = null;
  var HEIGHT_CELL = 6;

  function buildHeightField(minX, minY, maxX, maxY, env, routePaths, roadWidth,
      river, map) {
    var w = Math.max(1, Math.ceil((maxX - minX) / HEIGHT_CELL));
    var h = Math.max(1, Math.ceil((maxY - minY) / HEIGHT_CELL));
    var data = new Float32Array(w * h);          // 0 = bare floor
    var f = { minX: minX, minY: minY, w: w, h: h, data: data };

    // Highest surface wins. Where a raised deck and the road overlap, the deck
    // is what is actually visible and so it is what a body rests on.
    // A cell counts as covered when its CENTRE is inside the rect. Rounding
    // outward instead grows every slab by up to a cell on each side, which put
    // deck-height ground almost twenty pixels out into open floor and made the
    // level test below answer for a deck that was not there.
    function stampRect(x0, y0, x1, y1, z) {
      var i0 = Math.max(0, Math.round((x0 - minX) / HEIGHT_CELL - 0.5));
      var i1 = Math.min(w - 1, Math.round((x1 - minX) / HEIGHT_CELL - 0.5));
      var j0 = Math.max(0, Math.round((y0 - minY) / HEIGHT_CELL - 0.5));
      var j1 = Math.min(h - 1, Math.round((y1 - minY) / HEIGHT_CELL - 0.5));
      for (var j = j0; j <= j1; j++) {
        for (var i = i0; i <= i1; i++) {
          var px = minX + (i + 0.5) * HEIGHT_CELL, py = minY + (j + 0.5) * HEIGHT_CELL;
          if (px < x0 || px > x1 || py < y0 || py > y1) continue;
          var k = j * w + i;
          if (z > data[k]) data[k] = z;
        }
      }
    }

    // A RAMP, not a slab: the same band the road is stamped as, but with the
    // height running from one end to the other instead of held flat. The cell
    // grid is 6 units, so a bed dropping fifty over a hundred and twenty comes
    // out as a two-and-a-half-unit staircase, which at this scale is a slope.
    function stampSlope(a, b, half) {
      var dx = b.x - a.x, dy = b.y - a.y;
      var len2 = dx * dx + dy * dy;
      var i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - half - minX) / HEIGHT_CELL));
      var i1 = Math.min(w - 1, Math.ceil((Math.max(a.x, b.x) + half - minX) / HEIGHT_CELL));
      var j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - half - minY) / HEIGHT_CELL));
      var j1 = Math.min(h - 1, Math.ceil((Math.max(a.y, b.y) + half - minY) / HEIGHT_CELL));
      for (var j = j0; j <= j1; j++) {
        for (var i = i0; i <= i1; i++) {
          var px = minX + (i + 0.5) * HEIGHT_CELL, py = minY + (j + 0.5) * HEIGHT_CELL;
          var t = len2 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
          t = t < 0 ? 0 : (t > 1 ? 1 : t);
          var qx = px - (a.x + dx * t), qy = py - (a.y + dy * t);
          if (qx * qx + qy * qy > half * half) continue;
          var z = a.z + (b.z - a.z) * t;
          var k = j * w + i;
          if (z > data[k]) data[k] = z;
        }
      }
    }

    // Zones, using the SAME tops the geometry above emits, so the height an
    // actor stands at and the surface it is standing on cannot drift apart.
    ((env && env.zones) || []).forEach(function (z) {
      var zh = ZONE_HEIGHT[z.kind];
      if (zh === undefined || !z.w || !z.h) return;
      if (zh === 0) return;                       // a patch, not a platform
      var zw = ul(z.w / AUTHORED_PX_PER_UL), zd = ul(z.h / AUTHORED_PX_PER_UL);
      var cx = ul(z.x / AUTHORED_PX_PER_UL) + zw / 2;
      var cy = ul(z.y / AUTHORED_PX_PER_UL) + zd / 2;
      var thickness = Math.max(1.5, Math.abs(zh));
      var top = (zh < 0 ? -0.2 : 0.4) + thickness;
      stampRect(cx - zw / 2 - 3.5, cy - zd / 2 - 3.5,
                cx + zw / 2 + 3.5, cy + zd / 2 + 3.5, top - 0.6);   // the rim
      stampRect(cx - zw / 2, cy - zd / 2, cx + zw / 2, cy + zd / 2, top);
    });

    // THE RIVER, STAMPED BEFORE THE ROAD AND UNCONDITIONALLY.
    //
    // Every other stamp in this function is "highest wins", which is right for
    // slabs laid on a floor and wrong for a hole cut through one: a channel at
    // -25 loses that contest to the bare floor at 0 and the water never
    // appears under anything standing near it. So it is written flat -- and it
    // is written FIRST, so the road's own stamp still wins across the crossing
    // and a body on the bridge stands on the bridge.
    if (river) {
      var rx0 = river.x - river.width / 2 - river.banks;
      var rx1 = river.x + river.width / 2 + river.banks;
      var ri0 = Math.max(0, Math.floor((rx0 - minX) / HEIGHT_CELL));
      var ri1 = Math.min(w - 1, Math.ceil((rx1 - minX) / HEIGHT_CELL));
      for (var rj = 0; rj < h; rj++) {
        for (var ri = ri0; ri <= ri1; ri++) data[rj * w + ri] = -river.depth;
      }
    }

    // THE BUILDABLE STUMPS, stamped as discs so a tower placed on one stands on
    // its cut face instead of inside the trunk.
    //
    // This is where "towers sink into the stumps" came from: the prop had a
    // height and the height field did not know about it, so an actor's feet
    // were solved against bare ground while the geometry drew a trunk around
    // them. Both read the SAME authored number now -- see the platforms table
    // in js/maps.js.
    if (typeof Maps !== "undefined" && Maps.geometryOf && map) {
      Maps.geometryOf(map).platforms.forEach(function (pf) {
        var top = pf.height;
        var i0 = Math.max(0, Math.floor((pf.x - pf.radius - minX) / HEIGHT_CELL));
        var i1 = Math.min(w - 1, Math.ceil((pf.x + pf.radius - minX) / HEIGHT_CELL));
        var j0 = Math.max(0, Math.floor((pf.y - pf.radius - minY) / HEIGHT_CELL));
        var j1 = Math.min(h - 1, Math.ceil((pf.y + pf.radius - minY) / HEIGHT_CELL));
        for (var j = j0; j <= j1; j++) {
          for (var i = i0; i <= i1; i++) {
            var px = minX + (i + 0.5) * HEIGHT_CELL;
            var py = minY + (j + 0.5) * HEIGHT_CELL;
            var dx = px - pf.x, dy = py - pf.y;
            if (dx * dx + dy * dy > pf.radius * pf.radius) continue;
            var k = j * w + i;
            if (top > data[k]) data[k] = top;
          }
        }
      });
    }

    // The road, stamped as a real band rather than a bounding box, or every
    // corner would raise a square of open floor beside it.
    //
    // Off the RIBBON, so a road that changes width is stamped at the width it
    // actually is: the surface a body stands on has to be the surface that was
    // built, and a chokepoint stamped at open-road width would leave an enemy
    // squeezing through the gate walking on a strip of road-height ground
    // wider than the road under it.
    routePaths.forEach(function (p) {
      var pts = roadRibbon(p, roadWidth);
      var flat = roadWidth / 2;
      for (var s = 0; s + 1 < pts.length; s++) {
        var ax = pts[s].x, ay = pts[s].y, bx = pts[s + 1].x, by = pts[s + 1].y;
        var halfA = pts[s].half === undefined ? flat : pts[s].half;
        var halfB = pts[s + 1].half === undefined ? flat : pts[s + 1].half;
        var wide = Math.max(halfA, halfB);
        var dx = bx - ax, dy = by - ay;
        var len2 = dx * dx + dy * dy;
        var i0 = Math.max(0, Math.floor((Math.min(ax, bx) - wide - minX) / HEIGHT_CELL));
        var i1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + wide - minX) / HEIGHT_CELL));
        var j0 = Math.max(0, Math.floor((Math.min(ay, by) - wide - minY) / HEIGHT_CELL));
        var j1 = Math.min(h - 1, Math.ceil((Math.max(ay, by) + wide - minY) / HEIGHT_CELL));
        for (var j = j0; j <= j1; j++) {
          for (var i = i0; i <= i1; i++) {
            var px = minX + (i + 0.5) * HEIGHT_CELL, py = minY + (j + 0.5) * HEIGHT_CELL;
            var t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
            t = t < 0 ? 0 : (t > 1 ? 1 : t);
            var qx = px - (ax + dx * t), qy = py - (ay + dy * t);
            var here = halfA + (halfB - halfA) * t;
            if (qx * qx + qy * qy > here * here) continue;
            var k = j * w + i;
            if (ROAD_LIFT > data[k]) data[k] = ROAD_LIFT;
          }
        }
      }
    });

    // THE DEPOT'S RAMP IS TERRAIN, and it is the only prop on any board that
    // is. Every other prop is a picture a body walks past; this one is the
    // thing the route runs OUT OF, so the bay floor and the ramp bed have to be
    // ground or the spawn stands on bare dirt inside a lit bay and then walks
    // through its own loading ramp on the way out.
    //
    // The surface comes from `GLGeometry.depotWalkway` rather than from numbers
    // restated here, for the same reason the stumps read the platforms table:
    // the height a body stands at and the plank it is drawn beside are one
    // measurement, and two copies of it is how they drift.
    //
    // Stamped AFTER the road, though highest-wins would do it anyway -- at the
    // toe the bed is below ROAD_LIFT and the road takes over, which is what
    // makes the join seamless instead of a step.
    //
    // AND THE BOARD WITHOUT IT IS KEPT, because a ramp is a VEHICLE'S DECK and
    // not ground. A walker coming out of the bay stands on the planks; a flier
    // coming out of it does not, and lifting one off the bed puts a Wisp's
    // cruising height on top of a fifty-unit ramp and flies it out through the
    // depot's own roof. `f.terrain` is this field a moment before the depot was
    // written into it, and `groundHeightAt(x, y, true)` is what reads it.
    var depots = ((env && env.models) || []).filter(function (m) {
      return m && m.kind === "depot";
    });
    if (depots.length && typeof GLGeometry !== "undefined" && GLGeometry.depotWalkway) {
      f.terrain = new Float32Array(data);
      depots.forEach(function (m) {
        GLGeometry.depotWalkway(
          ul(m.x / AUTHORED_PX_PER_UL), ul(m.y / AUTHORED_PX_PER_UL),
          ul((m.size || 44) / AUTHORED_PX_PER_UL), m.rotation || 0
        ).forEach(function (seg) { stampSlope(seg.a, seg.b, seg.half); });
      });
    }

    return f;
  }

  // The height of the surface under (x, y). Presentation only -- nothing in the
  // simulation reads it, and every distance the game measures is still flat.
  // `ignoreDeck` asks for the GROUND under the point rather than the surface: the
  // board without the depot's loading ramp written into it. Only a flier wants
  // that, and only because a ramp is a vehicle's deck and it is not standing on
  // it -- see the note beside the stamp in `buildHeightField`. Every board with
  // no depot on it has no second layer and the flag costs a null check.
  function groundHeightAt(x, y, ignoreDeck) {
    var f = heightField;
    if (!f) return 0;
    var i = Math.floor((x - f.minX) / HEIGHT_CELL);
    var j = Math.floor((y - f.minY) / HEIGHT_CELL);
    if (i < 0) i = 0; else if (i >= f.w) i = f.w - 1;
    if (j < 0) j = 0; else if (j >= f.h) j = f.h - 1;
    var src = (ignoreDeck && f.terrain) ? f.terrain : f.data;
    return src[j * f.w + i];
  }

  // Does a footprint sit on ONE level? A tower straddling a deck edge ends up
  // half planted and half hanging in the air, which is the read the placement
  // rule below exists to refuse. Samples the rim of the footprint as well as
  // its centre, because a small tower can bridge an edge with its middle clear.
  function levelUnder(x, y, radius) {
    // NOT IN THE RIVER, AT ANY DEPTH.
    //
    // The rest of this function refuses a footprint that STRADDLES two levels,
    // and a channel wide enough to swallow a whole footprint passes that test
    // perfectly: the bed is as flat as any deck. It is still a tower standing
    // in running water twenty-five units under the board. The river is
    // therefore its own rule rather than a consequence of the height field,
    // which is honest -- "you cannot build in the river" is not a statement
    // about levels.
    if (riverBand && x + radius > riverBand.x0 && x - radius < riverBand.x1) {
      return { min: riverBand.bed, max: 0, flat: false };
    }
    var lo = Infinity, hi = -Infinity;
    for (var a = 0; a < 8; a++) {
      var th = Math.PI * 2 * a / 8;
      var z = groundHeightAt(x + Math.cos(th) * radius, y + Math.sin(th) * radius);
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
    var c = groundHeightAt(x, y);
    if (c < lo) lo = c;
    if (c > hi) hi = c;
    return { min: lo, max: hi, flat: (hi - lo) < 0.75 };
  }

  var ROAD_WIDTH_UL = 21.875;
  // How finely a road that changes width is resampled for this board, in world
  // units. Mirrors js/game.js's RIBBON_STEP_UL through ul() for the same reason
  // AUTHORED_PX_PER_UL is mirrored below: the mesh and the 2D pass have to
  // resample the same road the same way or the card and the board disagree
  // about where a chokepoint starts.
  function roadRibbon(routePath, roadWidth) {
    return routePath.ribbon ? routePath.ribbon(roadWidth, ul(13))
      : routePath.points;
  }
  // How proud of the floor the road ribbon sits. Read by BOTH the mesh and the
  // height field, so the surface an enemy is drawn standing on is the same
  // number as the surface that was built under it.
  var ROAD_LIFT = 7;
  // Mirrors js/game.js. Zones are authored in that space and `Maps.routesOf`
  // has already applied it to route points.
  var AUTHORED_PX_PER_UL = 1.04;

  // Which zone kinds are floor. The other nineteen are props -- consoles,
  // pylons, crystals -- and are deliberately absent rather than faked as slabs.
  //
  // `dirt` IS ZERO ON PURPOSE, and zero means something different from every
  // other value here: not a slab one unit thick, but a PATCH -- a different
  // ground colour painted onto the floor at the floor's own height. It exists
  // because the forest board wants bare earth, ash and standing water marked
  // out across it, and every other zone kind would answer that with a raised
  // platform. A raised platform is not cosmetic: `levelUnder` refuses a tower
  // that straddles an edge, so a mud puddle built as a slab would quietly
  // become a no-build ring. A patch stamps no height at all and so can never
  // move a build spot.
  //
  // `plate` and `flux` are the same kind of zero as `dirt` -- a cracked floor
  // panel and a patch of ground the buried plant is leaking into, both painted
  // at the floor's own height. Three ground colours rather than one, because a
  // board asked to stop being monochrome cannot answer with one more shade of
  // the same brown.
  var ZONE_HEIGHT = {
    deck: 9, bay: 5, hazard: 2.5, "void": -4,
    dirt: 0, plate: 0, flux: 0
  };

  // What a PATCH is painted in. The floor's own edge colour for bare earth, the
  // board's panel for a plate, and the accent for a leak -- weak, because it is
  // a stain on the ground and not a light: the casket taught this board that a
  // surface painted in the accent at full strength is a bright coloured
  // rectangle, whatever its emission is set to.
  function patchColor(kind, P) {
    if (kind === "plate") return P.panel;
    if (kind === "flux") return GLGeometry.mix(P.terrainEdge, P.accent2, 0.16);
    return P.terrainEdge;
  }

  var prims = null;

  // THE RIVER, IN WORLD UNITS, kept from the last board build.
  //
  // Two things outside `buildMapMesh` need it and neither can re-derive it:
  // the height field has to sink the channel, and `levelUnder` has to refuse a
  // tower standing in it. Null on every board that declares no river, which is
  // six of the seven.
  var riverBand = null;

  // The authored river spec, in world units. `x`, `width`, `banks` and `depth`
  // are authored in the same pixel space as the zones and the props.
  function riverOf(env) {
    var r = env && env.river;
    if (!r || !r.width) return null;
    return {
      x: ul(r.x / AUTHORED_PX_PER_UL),
      width: ul(r.width / AUTHORED_PX_PER_UL),
      banks: ul((r.banks || 0) / AUTHORED_PX_PER_UL),
      depth: ul((r.depth || 24) / AUTHORED_PX_PER_UL),
      spill: r.spill === "max" ? "max" : "min",
      water: r.water, foam: r.foam
    };
  }

  // The action occupies the first part of a firing cycle and the rest is the
  // aimed pose held -- a weapon still cycling when the next shot leaves reads
  // wrong. Same share the sprite pack used.
  var WORK_SHARE = 0.45;

  // --- palette -------------------------------------------------------------

  // An "r,g,b" string as linear light -- the spelling `theme.accent` and the
  // decorations already use. Hoisted out of `paletteFor` because a single PROP
  // can now override the board's accent (see the casket, below), and a second
  // copy of this parse is a second place for the curve to drift.
  function linearTriple(v, fallback) {
    if (!v) return GLGeometry.hex(fallback);
    var p = String(v).split(",");
    return p.length === 3
      ? [Math.pow(+p[0] / 255, 2.2), Math.pow(+p[1] / 255, 2.2),
         Math.pow(+p[2] / 255, 2.2)]
      : GLGeometry.hex(fallback);
  }

  function paletteFor(map) {
    var t = (typeof Maps !== "undefined" && Maps.themeOf)
      ? (Maps.themeOf(map) || {}) : {};
    function hex(v, fallback) { return GLGeometry.hex(v || fallback); }
    // The same parse without the gamma: what the display shows, not what the
    // light is. `GLGeometry.hex` is the linear one.
    function displayHex(v, fallback) {
      var text = String(v || fallback).replace("#", "");
      return [parseInt(text.substr(0, 2), 16) / 255,
              parseInt(text.substr(2, 2), 16) / 255,
              parseInt(text.substr(4, 2), 16) / 255];
    }
    function triple(v, fallback) { return linearTriple(v, fallback); }
    return {
      terrain: hex(t.floor, "#0c2633"),
      terrainEdge: hex(t.panelDark, "#081d29"),
      panel: hex(t.panel, "#123848"),
      metal: hex(t.metal, "#263f4c"),
      metalDark: hex(t.metalDark, "#132733"),
      // Solid blockers. Falls back to the machine colours, so the six boards
      // that have never had a rock on them are byte identical.
      horizon: !!t.horizon,
      rock: hex(t.rock, t.metal || "#263f4c"),
      rockDark: hex(t.rockDark, t.panel || "#123848"),
      // Distant hills. Default to the old near-black so nothing that has not
      // asked for a horizon changes.
      ridge: hex(t.ridge, t.metalDark || "#132733"),
      ridgeDark: hex(t.ridgeDark, t.metalDark || "#132733"),
      roadTop: hex(t.roadInner, "#274553"),
      roadSide: hex(t.roadOuter, "#0a1922"),
      // THE ROAD'S OWN LIGHT, and absent means absent. A board declares
      // `roadGlow` when its floor has no value contrast left to draw the route
      // with -- see the kerb lights in GLGeometry.road. Undefined on the six
      // facility boards, whose lit floor grid already says where everything is.
      roadGlow: t.roadGlow ? triple(t.roadGlow, "#4FE3D2") : null,
      accent: triple(t.accent, "#4FE3D2"),
      // The board's SECOND colour, where it has one. Used by the ground
      // patches that are a leak rather than a surface, so a board can put a
      // cold pool of light on a warm floor without either one being the
      // accent -- see `patchColor`.
      accent2: triple(t.accent2, t.accent || "#4FE3D2"),
      // WEATHER IS OPT-IN, and absent means absent. A board that declares no
      // `fog` renders through exactly the shader path it did before fog
      // existed, because density 0 is what `GLRenderer.begin` restores.
      // `color` is the mist, LINEAR, because the shader mixes it into linear
      // light. `clear` is the void behind the board, in DISPLAY space, because
      // `gl.clearColor` writes straight into the framebuffer and never passes
      // through the shader's sRGB conversion -- handing it a linear triple
      // paints the void several stops darker than everything in front of it.
      // `clear` is normally the background, which on the facility boards is
      // the void OUTSIDE a deck floating in space -- correct there, because
      // that is what those boards are.
      //
      // A BOARD WITH A HORIZON WANTS THE OPPOSITE. On an outdoor map the edge
      // of the ground is not the edge of the world, it is distance, and a floor
      // that fades toward one colour against a void of another draws a hard
      // rectangle in mid-air: the board reads as a tray. Setting `horizon` puts
      // the clear colour ON the mist, so ground, fog and sky are the same value
      // at the far edge and the boundary disappears into haze.
      fog: t.fog ? {
        color: hex(t.fog.color, t.background || "#07090c"),
        // With a horizon the void becomes SKY: the clear colour is the theme's
        // own sky if it names one, and the mist otherwise. Either way ground,
        // fog and sky meet at the same value at the far edge and the boundary
        // disappears instead of drawing a rectangle in mid-air.
        clear: displayHex(t.horizon ? (t.sky || t.fog.color)
                                    : (t.background || t.fog.color), "#07090c"),
        density: t.fog.density || 0,
        height: t.fog.height || 0
      } : null,
      // How far past the play area the ground runs. The facility boards stop
      // just outside it because their floor genuinely ends; an outdoor board
      // has to run past anything the camera can see at any legal zoom, or the
      // player orbits and finds the world's corner.
      apron: typeof t.apron === "number" ? t.apron : 120,
      // A board that is not a facility does not get the facility's floor
      // seams. See where the grid is laid, below.
      wild: !!t.wild
    };
  }

  // --- map geometry --------------------------------------------------------

  function buildMapMesh(map, routePaths) {
    var P = paletteFor(map);
    mapPalette = P;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    routePaths.forEach(function (p) {
      p.points.forEach(function (pt) {
        if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
      });
    });
    // The board is the VIEW, not just the route: towers are placed all over it
    // and the 2D game has always drawn the full canvas rectangle.
    // THE PLAY AREA, which is what the camera frames and what the player may
    // build on. Kept separate from the ground below, because the two answer
    // different questions and conflating them is what put the whole board in
    // the far distance the first time this was tried: the camera framed nine
    // hundred units of empty apron and the clearing became a speck.
    var playMinX = Math.min(minX - 120, 0);
    var playMinY = Math.min(minY - 120, 0);
    var playMaxX = Math.max(maxX + 120,
      typeof VIEW_WIDTH === "number" ? VIEW_WIDTH : 1280);
    var playMaxY = Math.max(maxY + 120,
      typeof VIEW_HEIGHT === "number" ? VIEW_HEIGHT : 720);

    // THE GROUND, which only has to run past anything the camera can see. It is
    // scenery, never a bound: nothing is placed on it and nothing frames to it.
    var apron = ul((P.apron || 120) / AUTHORED_PX_PER_UL);
    minX = playMinX - apron;
    minY = playMinY - apron;
    maxX = playMaxX + apron;
    maxY = playMaxY + apron;

    var env = (typeof Maps !== "undefined" && Maps.ENVIRONMENTS && map)
      ? Maps.ENVIRONMENTS[map.id] : null;

    // THE FLOOR IS ONE QUAD, AND A RIVER NEEDS A HOLE IN IT.
    //
    // `GLGeometry.river` builds a channel that goes below z 0, and nothing it
    // builds is visible under a lid. Every flat surface this function lays --
    // the floor itself and each of the ground PATCHES painted on it -- is
    // therefore laid in two pieces around the river's band, and the band edge
    // is the same ±(width/2 + banks) the channel's outer lip uses. The two
    // numbers are shared rather than matched: an approximation here shows as a
    // strip of void down the whole run.
    var river = riverOf(env);
    var gap = river
      ? { x0: river.x - river.width / 2 - river.banks,
          x1: river.x + river.width / 2 + river.banks }
      : null;
    riverBand = river ? { x0: gap.x0, x1: gap.x1, bed: -river.depth } : null;

    function flat(builder, x0, y0, x1, y1, z, color) {
      if (!gap || gap.x1 <= x0 || gap.x0 >= x1) {
        GLGeometry.ground(builder, x0, y0, x1, y1, z, color);
        return;
      }
      if (gap.x0 > x0) GLGeometry.ground(builder, x0, y0, gap.x0, y1, z, color);
      if (gap.x1 < x1) GLGeometry.ground(builder, gap.x1, y0, x1, y1, z, color);
    }

    var g = new GLGeometry.Builder();
    flat(g, minX, minY, maxX, maxY, 0, P.terrain);

    // IRONWOOD'S GROUND IS LAYERED COLOUR, NEVER GAMEPLAY RELIEF. The module
    // only adds geometry a few hundredths above the existing plane; the height
    // field below remains the sole source of placement and collision truth.
    // It lives outside gl-geometry so the independently-authored tree family
    // can change without either system overwriting the other.
    if (typeof IronwoodGround !== "undefined") {
      IronwoodGround.build(g, {
        map: map,
        groundBounds: { minX: minX, minY: minY, maxX: maxX, maxY: maxY },
        playBounds: {
          minX: playMinX, minY: playMinY, maxX: playMaxX, maxY: playMaxY
        },
        riverGap: gap,
        routeRibbons: routePaths.map(function (p) {
          return roadRibbon(p, ul(ROAD_WIDTH_UL));
        }),
        zones: (env && env.zones) || [],
        keepOut: (typeof Maps !== "undefined" && Maps.keepOutOf)
          ? Maps.keepOutOf(map) : []
      });
    }

    // FLOOR SEAMS ARE A MANUFACTURED FLOOR'S SEAMS. Six of the seven boards are
    // decks inside a facility and the grid is what says so. Ruled lines two
    // hundred units apart across a forest would say the same thing about a
    // forest, which is exactly wrong -- so a board that declares itself wild
    // gets bare ground and the props do the work instead.
    if (!P.wild) {
      var step = 200;
      for (var gx = Math.ceil(minX / step) * step; gx < maxX; gx += step) {
        GLGeometry.box(g, gx, (minY + maxY) / 2, 2.5, maxY - minY, 1.2,
          P.terrainEdge);
      }
      for (var gy = Math.ceil(minY / step) * step; gy < maxY; gy += step) {
        GLGeometry.box(g, (minX + maxX) / 2, gy, maxX - minX, 2.5, 1.2,
          P.terrainEdge);
      }
    }

    ((env && env.zones) || []).forEach(function (z) {
      var h = ZONE_HEIGHT[z.kind];
      if (h === undefined || !z.w || !z.h) return;
      var w = ul(z.w / AUTHORED_PX_PER_UL), d = ul(z.h / AUTHORED_PX_PER_UL);
      var cx = ul(z.x / AUTHORED_PX_PER_UL) + w / 2;
      var cy = ul(z.y / AUTHORED_PX_PER_UL) + d / 2;
      // A PATCH. Painted onto the floor a hair above it -- enough to win the
      // depth test against the ground plane, nowhere near enough to be a step.
      // No rim, because a patch of mud has no edge rail, and no height stamp
      // (see buildHeightField), because it must not move a build spot.
      if (h === 0) {
        if (!(typeof IronwoodGround !== "undefined" &&
              IronwoodGround.handlesPatch(map, z.kind))) {
          flat(g, cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2,
            0.08, patchColor(z.kind, P));
        }
        return;
      }
      var thickness = Math.max(1.5, Math.abs(h));
      var z0 = h < 0 ? -0.2 : 0.4;
      var slabTop = z0 + thickness;
      GLGeometry.box(g, cx, cy, w, d, thickness,
        h < 0 ? P.terrainEdge : P.panel, z0);
      // A RIM around the slab, not a LID over it.
      //
      // This skirt used to be drawn both larger in x/y AND proud of the slab it
      // surrounds -- for a deck the slab spanned z 0.4..9.4 and the skirt
      // 8.1..9.5 -- so the skirt's top face covered the slab's completely.
      // Every zone on every map therefore rendered as flat `metalDark` and
      // `P.panel` was never visible anywhere in the game. Measured before the
      // fix: three separate slab tops all read (27,47,60), which is metalDark
      // through this pipeline to within 1/255; panel resolves to about
      // (27,63,74).
      //
      // Sitting it BELOW the slab top gives back the panel face and turns the
      // skirt into what its size always implied: an edge rail around a raised
      // deck.
      var rimH = 1.4;
      GLGeometry.box(g, cx, cy, w + 7, d + 7, rimH, P.metalDark,
        Math.max(0, slabTop - rimH - 0.6));
    });

    // The channel, cut BEFORE the road is laid so the crossing is drawn over
    // the water rather than into it.
    if (river) GLGeometry.river(g, river, minY, maxY, P);

    var roadWidth = ul(ROAD_WIDTH_UL);
    routePaths.forEach(function (p) {
      // `ribbon` is the route's own points on a board whose road is one width
      // the whole way -- six of the seven -- and a resampled list carrying a
      // per-point half-width where the route declares a profile. One call
      // either way, so a chokepoint is real narrowed tarmac in the mesh and
      // not a marking painted on a road that never changed.
      GLGeometry.road(g, roadRibbon(p, roadWidth), roadWidth, ROAD_LIFT,
        P.roadTop, P.roadSide, P.roadGlow);
    });

    // The authored scenery. Each map names nine props and until now the 3D
    // board drew none of them, so every route ran across a bare plane while the
    // 2D thumbnails showed a decorated one. They are baked into this static
    // mesh rather than drawn as actors: they never move, never animate and
    // never turn, so they cost one-off build time and nothing per frame.
    //
    // Placed in the SAME authored-pixel space as the zones above, so a prop
    // sits where maps.js says it does relative to the deck it belongs to.
    //
    // ONE PROP MAY OWN ITS OWN ACCENT. Every other colour on a board comes out
    // of the theme, and that is what makes a prop on Mana Coil violet and the
    // same prop on Sigil Lattice green without a second table. The exception
    // is a prop whose light is NOT the board's light -- the forest's casket
    // glows violet on a board whose one saturated colour is an ember, and the
    // whole point of it is that it does not belong here. Declared per prop as
    // `accent: "r,g,b"`, the same spelling the theme and the decorations use,
    // and layered over the palette rather than replacing it so everything else
    // about the prop is still the board's.
    var accentGroups = {};
    // `Maps.sceneryOf`, not `env.models`. The authored list is what the board
    // asked for; this is the same list with nothing growing through a building,
    // a fence, a gate or the road -- see the foliage pass in maps.js. The flat
    // board reads the identical call, so the two cannot disagree about where
    // the forest is.
    (((typeof Maps !== "undefined" && Maps.sceneryOf && map)
      ? Maps.sceneryOf(map) : (env && env.models)) || []).forEach(function (m) {
      if (!m || !m.kind) return;
      var into = g, props = P;
      if (m.accent) {
        var group = accentGroups[m.accent];
        if (!group) {
          var tint = linearTriple(m.accent, "#4FE3D2");
          var lit = Object.create(P);
          lit.accent = tint;
          group = accentGroups[m.accent] =
            { builder: new GLGeometry.Builder(), palette: lit, tint: tint };
        }
        into = group.builder;
        props = group.palette;
      }
      // THE MODEL ITSELF GOES THROUGH, and it has to: `scenery` reads per-prop
      // fields off it -- a platform's authored height, and since 2026-08-27
      // which of the eight tree bodies an ironwood is. Dropped here for one
      // commit and every tree on the board drew as the default great tree,
      // which looks exactly like a forest of one model because it is one.
      GLGeometry.scenery(into, m.kind,
        ul(m.x / AUTHORED_PX_PER_UL), ul(m.y / AUTHORED_PX_PER_UL),
        ul((m.size || 44) / AUTHORED_PX_PER_UL), m.rotation || 0, props, m);
    });

    accentMeshes = Object.keys(accentGroups).map(function (key) {
      var group = accentGroups[key];
      return { mesh: group.builder.build(renderer), tint: group.tint };
    });


    // GAMEPLAY GEOMETRY, BUILT FROM THE SHAPES THEMSELVES.
    //
    // Not from the model list above. The rocks and the stumps used to be props
    // in it with sizes of their own beside the collision shapes, and the two
    // sets of numbers were about a factor of two apart -- a blocker of radius
    // 48 had a prop of SIZE 48 -- so every rock on the board was drawn at half
    // the width of the rock a bullet stops against.
    //
    // Reading the compiled geometry means there is one number. `Maps.geometryOf`
    // has already converted it to world units, which is the same space this
    // mesh is built in, so nothing is converted twice either.
    var solids = (typeof Maps !== "undefined" && Maps.geometryOf)
      ? Maps.geometryOf(map) : null;
    if (solids && solids.any) {
      solids.blockers.forEach(function (shape) {
        GLGeometry.solid(g, shape, P);
      });
      // The stumps keep their own prop -- a cut trunk is a lot more than an
      // extruded circle -- but its size and height come from the same table,
      // and the barrel's base ring is exactly the circle that decides where a
      // tower may stand.
      solids.platforms.forEach(function (pf) {
        GLGeometry.scenery(g, "platform", pf.x, pf.y, pf.radius * 2,
          GLGeometry.wobble(pf.x, pf.y, 77) * Math.PI * 2, P,
          { heightPx: pf.height });
      });
    }

    // THE PLAY AREA, not the ground. `bounds` is what the camera frames and
    // what it clamps panning to, so handing it the apron would let the player
    // orbit out over empty forest and would open the run zoomed to a speck.
    bounds = { minX: playMinX, minY: playMinY, maxX: playMaxX, maxY: playMaxY };
    heightField = buildHeightField(playMinX, playMinY, playMaxX, playMaxY, env,
      routePaths, roadWidth, river, map);
    return g.build(renderer);
  }

  // --- which model draws which actor ---------------------------------------
  //
  // Missing models fall back to a plain block rather than to nothing. A tower
  // that does not draw is a tower the player cannot see they have built, which
  // is worse than a placeholder -- and only the Rifleman and the four authored
  // enemies have been exported so far.

  // WHICH BODY A TOWER IS WEARING, as a bare group name. Effects need this as
  // badly as the mesh loader does -- a muzzle sits somewhere different on every
  // one of these weapons -- so it is derived once and both callers read it,
  // rather than the effect layer re-deriving tiers and drifting out of step
  // with the model it is supposed to be welded to.
  function riflemanGroup(tower) {
    var a = 0, b = 0;
    for (var i = 1; i <= 5; i++) {
      if (tower["hasA" + i]) a = i;
      if (tower["hasB" + i]) b = i;
    }
    if (a >= 5) return "a5";
    if (a >= 3) return "a3";
    if (b >= 5) return "b5";
    if (b >= 3) return "b3";
    return "base";
  }

  // Same group rule the sprite pack uses: tier 3 locks the other branch, so
  // one name identifies the body (js/skins/draw-pack.js sniperGroup).
  function sniperGroup(tower) {
    var bought = tower.core && tower.core.purchased;
    var a = bought && bought.A ? bought.A : 0;
    var b = bought && bought.B ? bought.B : 0;
    return a >= 5 ? "a5" : a === 4 ? "a4" : a === 3 ? "a3"
      : b >= 5 ? "b5" : b === 4 ? "b4" : b === 3 ? "b3" : "base";
  }

  // The Warbringer's A path. B still wears the base body until it is modelled,
  // which is honest: B never changes the man, only how fast he works.
  function warbringerGroup(tower) {
    if (typeof tower.hasUpgrade !== "function") return "base";
    if (tower.hasUpgrade("A5")) return "a5";
    if (tower.hasUpgrade("A4")) return "a4";
    if (tower.hasUpgrade("A3")) return "a3";
    // Path B: the hammer gets SHORTER and he starts driving resonator stakes
    // into the road instead of swinging at bodies. B3 plants one, B4 a line of
    // three, B5 a full ring -- the shape of what each tier actually does.
    if (tower.hasUpgrade("B5")) return "b5";
    if (tower.hasUpgrade("B4")) return "b4";
    if (tower.hasUpgrade("B3")) return "b3";
    return "base";
  }

  // A FULL-CIRCLE WARBRINGER HAS NO FACING TO SHOW.
  //
  // From A4 `fullCircle: true` makes the wedge 360 degrees, so `facingTarget`
  // stops meaning anything -- the tower covers every direction and never turns
  // towards anything again. It slams straight down instead. Drawing it at
  // `t.aim` would spin a man who, mechanically, has stopped caring where the
  // enemies are.
  // `fullCircle` is the tower's own resolved stat (js/smasher.js sets it when
  // arcDegrees reaches 360), so this cannot disagree with what the simulation
  // actually covers.
  function warbringerFullCircle(tower) {
    return !!tower.fullCircle;
  }

  // The Siphon's five bodies. It has seven tiers and five models, so 4 wears
  // 3's body -- the tier that adds a rate or a ratio does not change what he is
  // carrying, and inventing a body for it would say something untrue.
  // ELEVEN bodies, one per tier. The Siphon is the exception to the house rule
  // that tiers 1 and 2 are crosspath marks over an unchanged body: its brief
  // gives every tier its own state, because the whole arc IS the body -- path A
  // is a petrification climbing from the fingertips inward and path B is a robe
  // progressively opening. There is nothing to mark; there is only what he has
  // become. So each tier resolves to its own model and none is shared.
  function siphonGroup(tower) {
    var bought = tower.core && tower.core.purchased;
    var a = bought && bought.A ? bought.A : 0;
    var b = bought && bought.B ? bought.B : 0;
    // The higher branch wins, and A is checked first only because the two can
    // never both exceed 2 -- the crosspath rule caps the secondary at tier 2.
    if (a >= 3) return "a" + Math.min(a, 5);
    if (b >= 3) return "b" + Math.min(b, 5);
    if (a >= 1) return "a" + a;
    if (b >= 1) return "b" + b;
    return "base";
  }

  // The Summoner's blubs. They live in `towers` (see js/blub.js for why) and are
  // told apart by carrying a `unitId`; a fused monster carries a tier instead.
  function blubModel(tower) {
    // `monsterTier` IS A NUMBER, not an object. js/blub.js compares it directly
    // (`blub.monsterTier >= 3`) and prints it as "T" + monsterTier.
    //
    // This used to read tower.monsterTier.tier, which is undefined on a number,
    // so every fused creature fell through to the unitId branch, found none, and
    // drew the placeholder cylinder -- all five tiers, invisible, despite the
    // models being built and loaded. The owner reported it as "no model for any
    // tier of the monster blub".
    //
    // TWO TRAPS HERE, and each one alone breaks a different half of the roster.
    //
    // Truthiness fails T0: tier 0 is a real tier and `0 &&` is false, so a
    // truthy test leaves the smallest creature drawing a cylinder.
    //
    // typeof ALONE fails all ten ordinary units: an ordinary blub does not carry
    // `undefined` here, it carries -1. A bare typeof check therefore matched
    // every blub in the game and resolved them to "blub-monster-t-1", which does
    // not exist -- so the fix for the creature would have turned every unit into
    // a placeholder cylinder. Verified in the running game before shipping.
    //
    // So: a number AND non-negative.
    if (typeof tower.monsterTier === "number" && tower.monsterTier >= 0) {
      return "blub-monster-t" + tower.monsterTier;
    }
    return tower.unitId ? "blub-" + tower.unitId : null;
  }

  // THE SUMMONER HIMSELF. Seven bodies for ten tiers: A1/A2 and B1/B2 change
  // what he is WEARING, not what he is, so they are crosspath marks composited
  // over an unchanged body (see summonerMarks) rather than bodies of their own.
  // That is also what keeps the marks superposable, which is the rule.
  function summonerGroup(tower) {
    if (typeof tower.hasUpgrade !== "function") return "base";
    if (tower.hasUpgrade("A5")) return "a5";
    if (tower.hasUpgrade("A4")) return "a4";
    if (tower.hasUpgrade("A3")) return "a3";
    if (tower.hasUpgrade("B5")) return "b5";
    if (tower.hasUpgrade("B4")) return "b4";
    if (tower.hasUpgrade("B3")) return "b3";
    return "base";
  }

  // The four marks he can be wearing, as their own models drawn over the body.
  // A1/A2 ride on a path B build and B1/B2 on a path A build -- that is what a
  // crosspath IS -- so the test is simply "bought, and not already the body".
  var SUMMONER_MARKS = ["a1", "a2", "b1", "b2"];

  // WHERE A MARK SITS, AND WHY THE OFFSET IS THE RUNTIME'S JOB.
  //
  // Each mark is authored around the ORIGIN OF ITS SEAT -- the grimoire around
  // the hip, the gauntlet around the right fist, the visor around the skull --
  // because one mark model has to serve SEVEN different bodies whose hips and
  // fists are in seven different places. No authored position could satisfy
  // more than one of them, so the model carries none and the compositor
  // TRANSLATES it. That translation is what was missing: the marks were drawn
  // at the body's own transform, which put the grimoire and the visor flat on
  // the ground between his feet, inside the chalk ring.
  //
  // THIS TABLE IS A HAND-CARRIED COPY AND SHOULD NOT BE. It is
  // tools/blender/summoner_figure.py's SEATS, which that file derives from its
  // POSES so a seat cannot drift off the limb it names -- but it only PRINTS
  // the table from main(), it does not emit it. So the numbers had to be
  // brought across by hand (read out of the module, not retyped: the rows below
  // were generated by importing summoner_figure and formatting SEATS), and the
  // moment a pose moves, this copy is silently wrong and nothing fails.
  // THE FIX IS ON THE BUILD SIDE: summoner_figure.py should write the table the
  // way siphon_idol.py writes siphon_origins.json -- but as a generated JS file
  // that registers itself, since the game must open over file:// and cannot
  // fetch. When it does, delete this literal and read it from there.
  //
  // Blender units. Keyed by the BODY (summonerGroup), then by seat name; the
  // mark -> seat mapping is summoner_figure.py's MARKS, mirrored below.
  var SUMMONER_SEATS = {
    "base": { circle: [0.0000, 0.0000, 0.0000], hip: [0.2374, -0.0373, 0.6104],
            hand_r: [-0.2500, 0.6000, 0.1900], head: [0.0500, 0.3600, 1.2100] },
    "a3": { circle: [0.0000, 0.0000, 0.0000], hip: [0.2350, -0.0052, 0.9640],
            hand_r: [0.0900, 0.2500, 0.9900], head: [0.0000, 0.0300, 1.5600] },
    "a4": { circle: [0.0000, 0.0000, 0.0000], hip: [-0.5755, -0.1809, 0.9440],
            hand_r: [-0.7600, 0.3000, 0.8600], head: [-0.5400, 0.0500, 1.5400] },
    "a5": { circle: [0.0000, 0.0000, 0.0000], hip: [0.2366, -0.1896, 0.4424],
            hand_r: [-0.2400, 0.5200, 0.0900], head: [0.0700, 0.2300, 0.8700] },
    "b3": { circle: [0.0000, 0.0000, 0.0000], hip: [0.2378, -0.0810, 0.7024],
            hand_r: [-0.3000, 0.4600, 0.1200], head: [0.0400, 0.1700, 1.2700] },
    "b4": { circle: [0.0000, 0.0000, 0.0000], hip: [0.2350, -0.0088, 1.1008],
            hand_r: [-0.3400, 0.2500, 1.0100], head: [0.0100, -0.2500, 1.6600] },
    "b5": { circle: [0.0000, 0.0000, 0.0000], hip: [0.2350, -0.0032, 1.1872],
            hand_r: [-0.8200, 0.0900, 1.5500], head: [0.0000, 0.0000, 1.7900] }
  };

  // Keyed by MODEL NAME so the draw loop needs no string work per frame.
  // a1 is the ground ring's runes and seats at the origin on every body, which
  // is why it was the one mark that already looked right.
  var SUMMONER_MARK_SEAT = {
    "summoner-mark-a1": "circle",
    "summoner-mark-a2": "hip",
    "summoner-mark-b1": "hand_r",
    "summoner-mark-b2": "head"
  };

  function summonerSeats(tower) {
    return SUMMONER_SEATS[summonerGroup(tower)] || SUMMONER_SEATS.base;
  }

  function summonerMarks(tower) {
    if (typeof tower.hasUpgrade !== "function") return null;
    var out = null;
    for (var i = 0; i < SUMMONER_MARKS.length; i++) {
      var m = SUMMONER_MARKS[i];
      if (!tower.hasUpgrade(m.toUpperCase())) continue;
      var name = "summoner-mark-" + m;
      if (!GLModels.has(name)) continue;
      (out || (out = [])).push(name);
    }
    return out;
  }

  // WHICH WAY IS FORWARD ON A MODEL, and a correction that should not be
  // permanent.
  //
  // The game's convention is FORWARD = +X. anchorWorld proves it: with
  // pt = [forward, side, height] it computes
  //   x = tower.x + (cos(aim) * pt[0] - sin(aim) * pt[1]) * k
  // so at aim 0 the forward component lands on +X. Every Blender-authored model
  // (sniper, rifleman, recruits, the four enemies) follows that.
  //
  // The models authored during the visual pass do not. tower_summoner.py puts
  // every face on +Y (`fy = cy + r * 0.80`), and SIPHON-SOCLE.md states
  // "+Y = devant" -- which propagated the same error into the Siphon lots. The
  // symptom is the one the owner reported: a blub turning to attack faces
  // ninety degrees off its target.
  //
  // Correcting it HERE rather than in the geometry is a stopgap, taken because
  // five agents currently own those build scripts and editing them underneath
  // would collide. The real fix is to author front on +X and delete this
  // function; until then this keeps the board correct and keeps the mistake in
  // one visible place instead of spread through the draw path.
  var FRONT_PLUS_Y = /^(blub-|summoner-|siphon-)/;

  function authoredFrontOffset(model) {
    return (model && FRONT_PLUS_Y.test(model)) ? -Math.PI / 2 : 0;
  }

  function towerModel(tower) {
    if (!tower) return null;
    if (tower.isSummon) {
      var bn = blubModel(tower);
      return (bn && GLModels.has(bn)) ? bn : null;
    }
    if (tower.constructor && tower.constructor.ID === "blub") {
      var sn = "summoner-" + summonerGroup(tower);
      return GLModels.has(sn) ? sn : null;
    }
    var id = tower.constructor && tower.constructor.ID;
    var name = null;
    if (id === "soldier") name = "rifleman-" + riflemanGroup(tower);
    else if (id === "longshot") name = "sniper-" + sniperGroup(tower);
    else if (id === "smasher") name = "warbringer-" + warbringerGroup(tower);
    else if (id === "siphon") name = "siphon-" + siphonGroup(tower);
    return (name && GLModels.has(name)) ? name : null;
  }

  // Only the AUTHORED enemies have meshes. EVERY OTHER TYPE IS A SPHERE,
  // in its own colour at its own radius -- the exact 3D spelling of what the
  // 2D game drew for them, which was a circle. One mesh per type, built lazily
  // and cached; the per-frame scale handles fractal shrinkage.
  var typePrims = Object.create(null);

  // A SECOND MESH FOR A BODY THAT HAS ALREADY DIED ONCE.
  //
  // The Revenant is the only type whose fiction changes mid-life: it comes back
  // rooted, at full health, and the owner asked for it to come back as a
  // different thing -- the steampunk zombie walks in, the undead one is what
  // gets up. So a type may name a variant, and the variant is chosen off state
  // the simulation already carries.
  //
  // `revived`, NOT `rooted` AND NOT `revivesLeft`. All three move at the same
  // moment today and they are not the same claim. `rooted` is a movement fact
  // that a future slow, snare or boss effect could set on anything; `revivesLeft`
  // counts DOWN, so a type with two lives would swap on its first death and then
  // have nothing left to say on its second. `revived` means exactly "this body
  // has been dead once", which is the thing the second mesh depicts, and
  // Enemy.prototype.tryRevive is the only place that sets it.
  //
  // FALLS BACK TO THE BASE MESH, never to the sphere: a missing variant file
  // leaves a Revenant looking like a Revenant instead of turning it into a
  // coloured ball at the moment it gets up. `tools/check-model-tags.js` is what
  // catches the missing tag; this only decides that the failure is quiet in the
  // right direction.
  //
  // A SECOND TYPE JOINED ON 2026-08-20 AND MADE THIS A TABLE OF TABLES rather
  // than a table of one key. The Bulwark's fiction changes mid-life too, and
  // for a reason the player can see coming: it walks in behind a shield and
  // comes out the other side of it at twice the speed, and the owner asked for
  // the stripped machine to be a different body ("the no shield appearing after
  // the shield break"). So a type names a MAP of state-flag -> model, and the
  // flag is once more a fact the simulation already carries and already keeps
  // one-way.
  //
  // `shieldBroken`, NOT `shield <= 0`, and js/enemy.js carries the full
  // argument at the field itself: a Shieldbearer refills a broken Bulwark's
  // pool, so the pool goes positive again while the doubled speed does not.
  // Reading the pool would put the halo back on a body that is still running.
  //
  // FIRST MATCH WINS, in the table's own key order, so a body that ever
  // qualifies for two variants gets one answer rather than whichever branch was
  // written last. Nothing has two today; the rule is here so the second one
  // does not have to invent it.
  //
  // A THIRD TYPE JOINED ON 2026-08-26, AND IT IS THE FIRST WHOSE VARIANT IS NOT
  // A ONE-WAY DOOR. The Vanguard shields ITSELF every seven seconds
  // (`support.pick === "self"` on its type row), so its shield is a rhythm: it
  // goes, it is gone for the rest of that window, and it comes back. The owner
  // asked for the wreckage to be visible for exactly that window and for the
  // fragments to reassemble into the shield at the end of it -- so this body
  // swaps INTO the shattered mesh and back OUT of it, several times a run.
  //
  // `shieldOut`, WHICH IS NEITHER OF THE FLAGS ABOVE. `shieldBroken` is
  // permanent and would leave the boss in pieces for the rest of the run;
  // `shield <= 0` is true of a body that has never been shielded at all, and
  // the Vanguard spawns that way and waits out its first seven seconds. The
  // full argument is at the field itself in js/enemy.js -- this is the third
  // time that distinction has had to be drawn on this table and the second time
  // it has been drawn the other way round.
  var ENEMY_VARIANT = {
    revenant: { revived: "enemy-revenant-undead" },
    shielded: { shieldBroken: "enemy-shielded-broken" },
    boss_fast: { shieldOut: "enemy-boss_fast-shattered" }
  };

  // A CAMO BODY WEARS THE MODEL OF THE TYPE IT SHADOWS (2026-08-19, at the
  // owner's instruction: "all camo enemies are modelled as their normal
  // variants but just transparent"). That is the second half of a ruling whose
  // first half already shipped -- "do the camos like the others, just make them
  // a bit translucent or sum" is what the two-pass CAMO_ALPHA draw below exists
  // for. The translucency was there; what was missing is that a camo body had
  // no body to BE translucent.
  //
  // WHAT THIS FIXES IS MOSTLY THE TWO THAT DREW NOTHING. `camo_fast` and
  // `camo_heavy` have never had a mesh of their own, so `GLModels.has` failed
  // and both fell through to the coloured sphere -- a translucent ball beside
  // a translucent machine. Reading the shadowed type's model gives each of them
  // the silhouette the player already knows, which is the whole point of a camo
  // type: it is the SAME threat, and the only difference is that nothing can
  // see it.
  //
  // AN EXPLICIT TABLE, NOT `id.replace("camo_", "")`. The mapping is not a
  // string operation that happens to work -- `camo_heavy` IS A CAMO SLOW
  // (the owner, 2026-08-19), and there is no `heavy` in the roster for a prefix
  // strip to find. Nothing in the type row spells that relationship either:
  // js/enemy.js still says the Camo Heavy "shadows nothing", which was true of
  // its STATS -- it is the only camo body with real defences -- and was never a
  // claim about which body it walks in. What ties it to the Slow is the thing
  // its own comment says out loud, "heavy, so it plods": 0.65 against the
  // Slow's 0.7, and sizeScale 1.4 against a body drawn at 1.0. It is the
  // plodder, walking at a plodder's pace, and now it looks like one.
  //
  // A table also fails VISIBLY when a fourth camo type is added: it gets no
  // row, `GLModels.has` misses, and it draws the sphere it would have drawn
  // anyway, rather than silently resolving to whatever its name happens to
  // spell.
  //
  // `enemy-camo_normal` (the Cooper) is consequently no longer the body the
  // Camo Normal walks in. The file, its <script> tags and its export target are
  // all left alone -- it is a built body that may be wanted again, and deleting
  // a mesh is not what "use the normal's model" asks for.
  var CAMO_SHADOWS = {
    camo_normal: "normal",
    camo_fast: "fast",
    camo_heavy: "slow"
  };

  function enemyModel(enemy) {
    var id = enemy && enemy.typeId;
    var base = "enemy-" + (CAMO_SHADOWS[id] || id);
    if (!GLModels.has(base)) return null;
    var variant = ENEMY_VARIANT[id];
    // Guarded rather than leaning on ES5's "for-in over undefined is a no-op":
    // most ids have no variant at all and this is called several times per body
    // per frame.
    if (variant) {
      for (var flag in variant) {
        if (enemy[flag] && GLModels.has(variant[flag])) return variant[flag];
      }
    }
    return base;
  }

  // --- bodies that are not on the road ---------------------------------------
  //
  // TWO WAYS TO BE OFF THE TARMAC AND ONLY ONE OF THEM IS FLIGHT. A flier is up
  // there because `isFlying` says so, which is a TARGETING fact before it is a
  // height -- no ground tower may shoot it. A hovering body is up there because
  // its type carries a `hover` block, which is only ever a picture: the Healer
  // drifts a foot above the road and every tower on the board can still hit it.
  // The two are kept apart everywhere below for that reason, and share only the
  // things that are genuinely the same -- the bob, and the fact that a body
  // touching nothing cannot have its animation driven by distance.
  //
  // HOW FAR OFF THE ROAD A FLIER RIDES.
  //
  // The 3D board used to lift a flying body by nothing -- every Aether Wisp
  // walked the tarmac. For the sphere it merely looked odd; for a firefly with
  // six legs it reads as a machine that has landed and is being dragged.
  //
  // THE HEIGHT IS `Enemy.FLIGHT_LIFT_RADII`, READ, NOT COPIED. `visualBodyY`,
  // the hover test, the kill burst and this all have to agree about where a
  // flier is, and a number retyped in four files is a number that will be
  // raised in three of them. It went 1.15 -> 3.45 on 2026-08-12 at the owner's
  // request and this file needed no edit for it, which is the point.
  //
  // A HOVERING BODY'S HEIGHT IS ITS TYPE'S OWN, and read the same way for the
  // same reason -- `hover.liftRadii` in js/enemy.js, which both boards turn
  // into pixels through Enemy.prototype.visualBodyLift.
  //
  // ONE BOB SERVES BOTH. It is not a fact about flight, it is what stops a
  // suspended thing looking pinned to a height, and 0.16 radii at 0.75 Hz is a
  // slow breath rather than a flutter on either body.
  var AIR_BOB = 0.16;                     // radii, peak above the rest height
  var AIR_BOB_HZ = 0.75;

  // HOW SOLID A CAMOUFLAGED BODY IS. The owner asked for "a bit translucent".
  //
  // CHOSEN ON PIXEL VALUES, BECAUSE A CHANGED-PIXEL COUNT CANNOT TUNE THIS AT
  // ALL. Measured over alpha 0.85 down to 0.40, the count is 97-100 px at every
  // step and the silhouette change is EXACTLY ZERO at every step -- alpha does
  // not move the outline by one pixel, so the usual instrument is flat across
  // the whole range it is supposed to choose within. What varies is value. At
  // one body pixel, board (21,45,60) and opaque (90,100,118):
  //
  //     alpha 0.62 -> (64,79,96)   0.50 -> (55,72,89)   0.40 -> (48,67,83)
  //
  // 0.62 sits the body a little over halfway back from the board, which reads
  // as washed out while still clearly a body. Below ~0.5 it starts converging
  // on the ground it is standing on, and the thing a player must find becomes
  // the thing that is hardest to see -- fine as fiction, bad as teaching.
  //
  // NOT the 2D pack's 0.5: that was chosen for a flat sprite on a flat board,
  // where nothing else marks the enemy out. Here the RING below carries the
  // teaching and the alpha only has to say "not solid", so it can afford to be
  // gentler. The two paths differ on purpose and agree on the cue that matters.
  //
  // Self-transparency is small because the renderer culls back faces
  // (gl-renderer.js enables CULL_FACE / BACK), so a translucent body shows its
  // own overlapping FRONT faces in buffer order and never its interior.
  // Measured, not assumed: suki's two re-exports of enemy-normal differ only in
  // triangle order, and rendered faded they are still pixel-identical -- so
  // buffer order is not observable on a body this size at this alpha.
  var CAMO_ALPHA = 0.62;

  // The camo ring's colour, dash and radius are lifted verbatim from the 2D
  // pack (js/enemy.js) so a player who learns the cue on one path reads it
  // unchanged on the other. Only the projection differs.
  var CAMO_RING_RGBA = "rgba(190,255,205,0.75)";
  var CAMO_RING_PAD = 4;                  // px beyond radiusPx(), as in 2D

  function flightLiftRadii() {
    return (typeof Enemy !== "undefined" && Enemy.FLIGHT_LIFT_RADII) || 3.45;
  }

  // AND THE ONE ANIMATION IN THIS FILE A CLOCK IS ALLOWED TO DRIVE.
  //
  // Everything else advances by DISTANCE COVERED, because a planted foot has
  // to stay on one patch of road -- that rule is written three times in this
  // file and once in MODEL_SKINS_GUIDE.md, and it is right every time. A Wisp
  // plants nothing. Its wings have to beat while it is slowed, while a
  // Warbringer stun holds it still, and while it hovers in the sandbox with no
  // path under it at all, so distance is exactly the wrong input: a stopped
  // flier would freeze mid-beat and hang in the air like a prop.
  //
  // The model carries TWO beats per cycle (see tools/glb_to_model.py), so this
  // is 5.2 wingbeats a second at ~31 frame changes -- fast enough to flutter,
  // slow enough not to alias against 60 Hz.
  var HOVER_HZ = 2.6;

  // AND THE SECOND BODY THE SAME ARGUMENT APPLIES TO, whose rate is NOT this
  // constant. The Wisp's 2.6 is a wingbeat; the Healer's is a slow drift of its
  // rings, and putting both on one number would tie an apparition's rotation to
  // the speed an insect's wings happen to want. So a hovering type carries its
  // own `hover.animHz` and this constant stays what it always was: the flier's.

  // The board's clock, latched at the top of each pass. The overlay layer draws
  // a flier's health bar from `bar()`, which is handed an actor and no state,
  // and a bar that ignored the bob would float free of the body under it.
  var boardClock = 0;

  // Is this body drawn off the road at all, by either route. The one predicate
  // the three answers below share, so a type that starts hovering cannot pick
  // up the lift and keep a walker's animation, or gain the drift and keep a
  // ball's bounce.
  function afloat(enemy) {
    return !!(enemy && (enemy.isFlying || (enemy.type && enemy.type.hover)));
  }

  // HOW HIGH THE MODEL IS DRAWN, and the only function in this file that says.
  // The health bar, the hover card's anchor, the wreck that falls and the shot
  // that leads a target all read it -- see enemyCrown -- so a body that rises
  // does not need any of them edited.
  function bodyLift(enemy, radius) {
    if (!enemy) return 0;
    var bob = AIR_BOB * Math.sin(boardClock * AIR_BOB_HZ * Math.PI * 2);
    if (enemy.isFlying) return radius * (flightLiftRadii() + bob);
    var hover = enemy.type && enemy.type.hover;
    if (!hover) return 0;
    return radius * (hover.liftRadii + bob);
  }

  // WHAT DRIVES THIS BODY'S CYCLE, in hertz, or 0 for "the road does".
  // See HOVER_HZ above for the whole of the argument; this is where the two
  // exceptions to the distance rule are enumerated, and they are the only two.
  function clockRate(enemy) {
    if (!enemy) return 0;
    if (enemy.isFlying) return HOVER_HZ;
    var hover = enemy.type && enemy.type.hover;
    return (hover && hover.animHz) || 0;
  }

  // A LANTERN THAT DOES NOT EMIT IS NOT A LANTERN.
  //
  // The Wisp's abdomen and eye lens are emissive materials, and until something
  // drives `uGlow` an emissive material is only its own resting floor -- which
  // on a 23 px body at the play camera is a pale dot on a dark shell. Two
  // reasons to light it, one artistic and one that matters more: the Aether
  // Wisp is the enemy no ground tower can touch, so "which of those specks do I
  // need air reach for" has to be answerable at a glance, and it is answerable
  // because the lit one is the flying one.
  //
  // THE COLOUR IS THE TYPE'S OWN, not a constant typed here. `Enemy.TYPES`
  // already says what a Wisp looks like and the kill burst, the codex swatch
  // and the hover card all read it; a seventh copy would be the one that goes
  // stale. Converted to linear per type and cached, exactly as enemySphere
  // does with the same field.
  var LANTERN_BASE = 0.42;
  var LANTERN_SWING = 0.22;
  var LANTERN_HZ = 1.15;

  // Reused, so a board full of wrecks allocates nothing per frame.
  var wreckTilt = { rx: 0, ry: 0, pivotZ: 0 };

  function lanternTint(enemy) {
    var id = enemy.typeId || "unknown";
    var hit = typePrims["glow:" + id];
    if (hit) return hit;
    var c = (enemy.type && enemy.type.color) || { r: 150, g: 200, b: 255 };
    hit = [Math.pow(c.r / 255, 2.2), Math.pow(c.g / 255, 2.2),
           Math.pow(c.b / 255, 2.2)];
    typePrims["glow:" + id] = hit;
    return hit;
  }

  function lanternGlow(enemy) {
    // Off phase with the hover, so the two do not read as one pumping motion.
    var t = boardClock * LANTERN_HZ * Math.PI * 2 + (enemy.progress || 0) * 0.03;
    return LANTERN_BASE + LANTERN_SWING * Math.sin(t);
  }

  // A SUPPORT PULSE, ON THE BODY THAT THREW IT.
  //
  // The tethers say which three bodies were healed; this says which body did
  // it, and it is worth a second mark because those two questions have
  // different answers and only one of them is what the player must shoot. A
  // cord is thin and can be crossed by anything on the road between the two
  // ends of it; the supporter lighting up cannot be mistaken for something
  // else's cord passing over it.
  //
  // DRIVEN BY `supportFlash`, which the simulation already keeps: set to 1 when
  // a pulse RESOLVES and decayed at 0.6 a second, so this runs for about 1.7 s
  // out of every eight -- see js/enemy.js, where that decay rate is chosen
  // against its two readers and this is now the third.
  //
  // ONLY A TYPE THAT AUTHORS A TETHER COLOUR GLOWS. `uGlow` multiplies each
  // material's own emission, so a body with none is unaffected however hard it
  // is driven, and the Shieldbearer -- which pulses on the same field -- has an
  // expanding ring for this and no cyan in it anywhere.
  var SUPPORT_GLOW = 0.85;

  function supportSpec(enemy) {
    var spec = enemy && enemy.type && enemy.type.support;
    return (spec && spec.tether) ? spec.tether : null;
  }

  function supportGlow(enemy) {
    if (!(enemy && enemy.supportFlash > 0) || !supportSpec(enemy)) return 0;
    return SUPPORT_GLOW * enemy.supportFlash;
  }

  // The pulse's own colour in linear light, cached per type exactly as
  // lanternTint caches the body colour it reads -- and read from the same one
  // place the tether's is, so the cord and the body it leaves can never be two
  // different cyans.
  function supportTint(enemy) {
    var id = enemy.typeId || "unknown";
    var hit = typePrims["pulse:" + id];
    if (hit) return hit;
    var c = supportSpec(enemy).color;
    hit = [Math.pow(c.r / 255, 2.2), Math.pow(c.g / 255, 2.2),
           Math.pow(c.b / 255, 2.2)];
    typePrims["pulse:" + id] = hit;
    return hit;
  }

  function enemySphere(enemy) {
    var id = enemy.typeId || "unknown";
    var cached = typePrims["e:" + id];
    if (cached) return cached;
    // The authored colour lives on the TYPE, not the instance -- `Enemy` reads
    // `this.type.color` and so does Effects.enemyKilled. Reading `enemy.color`
    // silently found undefined and every sphere in the game came out the same
    // fallback grey, which looked deliberate and was not.
    var c = (enemy.type && enemy.type.color) || { r: 150, g: 150, b: 160 };
    var lin = [Math.pow(c.r / 255, 2.2), Math.pow(c.g / 255, 2.2),
               Math.pow(c.b / 255, 2.2)];
    var dark = [lin[0] * 0.45, lin[1] * 0.45, lin[2] * 0.45];
    var g = new GLGeometry.Builder();
    // Unit-ish sphere, scaled at draw time by the live radius.
    GLGeometry.sphere(g, 0, 0, 1, lin);
    // A darker cap ring so the sphere shows its rotation... no rotation to
    // show -- but it DOES break the silhouette into two values, which is what
    // stops a one-colour ball reading as a dot.
    GLGeometry.cylinder(g, 0, 0, 0.6, 0.22, dark, 1.85, 10);
    cached = { mesh: g.build(renderer) };
    typePrims["e:" + id] = cached;
    return cached;
  }

  // --- the shield bubble -----------------------------------------------------
  //
  // At the owner's instruction (2026-08-18): "shielded enemies will have a blue
  // clear bubble around them". Any body with a shield pool that still holds --
  // a Bulwark, a Hive's brood, the Tyrant after its roar, and everything a
  // Shieldbearer has just handed a plate to -- gets a translucent blue shell
  // around it, on the same condition the 2D board draws its field panels on
  // (`shieldMax > 0 && (shield > 0 || shieldFlash > 0)`), read from the same
  // two fields so the two boards cannot disagree about who is shielded.
  //
  // IT IS GEOMETRY, NOT A CANVAS CIRCLE, and that is the whole reason it can
  // exist here at all. AGENTS.md's clause 2 settles this: a translucent disc
  // painted over the board is visible THROUGH the bodies in front of it, which
  // is what "looks like a sticker" means. A real shell is occluded by whatever
  // stands between it and the camera, and it is occluded BY the body inside it,
  // which is what makes it read as a shell around a thing rather than a wash
  // over one.
  //
  // WHY THE 2D BOARD KEEPS ITS FOUR PANELS. That renderer tried a complete
  // bubble and rejected it -- see the note in Enemy.prototype.draw: with no
  // depth buffer and no real alpha, a full ring stack buried the model,
  // especially on a crowd of Swarm. The panels are what that constraint
  // produced. This board has both, so it can draw the thing that was wanted;
  // the fallback keeps the language it can afford.
  //
  // SIZED FROM THE MODEL, NEVER FROM A CONSTANT. A bubble has to contain the
  // body, and the bodies are not the same shape: the beacon is 4.05 radii tall
  // inside 1.3 of plan, the Fractal Slime is 2.6 tall inside 2.0 of plan, and
  // one hand-picked pair of radii cuts through half the roster. Both numbers
  // are measured off the model's own REST-frame geometry, once per model, and
  // cached with the other per-type primitives.
  var BUBBLE_PAD = 1.06;                  // of the body it has to contain
  var BUBBLE_MIN_RADII = 1.05;            // ...and never tighter than this
  // CLEAR, WHICH IS A CEILING AND NOT A STYLE. The owner asked for a clear
  // bubble, and the first build read as a frosted egg: 0.13 + 0.17 + 0.34 is
  // 0.64 at the moment of a grant, and a shell that opaque hides the body it
  // is around -- which is the exact failure the 2D board's four panels exist
  // to avoid. These add to at most 0.42 on a fresh full grant and sit at 0.22
  // for a shield merely holding, so the body reads through it at every value.
  var BUBBLE_BASE = 0.10;                 // alpha of an empty-ish shield
  var BUBBLE_HELD = 0.12;                 // ...plus this much at a full one
  var BUBBLE_FLASH = 0.20;                // ...plus this on a grant or a break
  // Linear, because that is the space the shader lights in. A pale blue at a
  // low emission: enough that the unlit side of the shell does not go black
  // (a shadowed bubble reads as a dent), not so much that it whitens -- the
  // resting floor is min(1, e * 0.16) of WHITE added to every channel.
  var BUBBLE_RGB = [0.16, 0.52, 1.0];
  var BUBBLE_EMISSIVE = 0.22;

  // The body's own extent in RADII, from the rest frame: the widest point in
  // plan, and the top. Both scale with the instance, so the ratio is a fact
  // about the model and is cached per model rather than per body -- which is
  // what makes a T5 Fractal Slime and a T0 share one mesh.
  function bodyExtentRadii(name) {
    var m = name ? GLModels.get(renderer, name) : null;
    if (!m || !m.positions) return null;
    var pose = (m.frames && m.frames.length) ? m.frames[0] : null;
    var plan = 0, top = 0;
    for (var g = 0; g < m.groups.length; g++) {
      var grp = m.groups[g];
      var pg = pose ? pose[g] : null;
      for (var v = grp.first; v < grp.first + grp.count; v++) {
        var x = m.positions[v * 3], y = m.positions[v * 3 + 1],
            z = m.positions[v * 3 + 2];
        if (pg) {
          var wx = pg[0] * x + pg[4] * y + pg[8] * z + pg[12];
          var wy = pg[1] * x + pg[5] * y + pg[9] * z + pg[13];
          var wz = pg[2] * x + pg[6] * y + pg[10] * z + pg[14];
          x = wx; y = wy; z = wz;
        }
        var r2 = x * x + y * y;
        if (r2 > plan) plan = r2;
        if (z > top) top = z;
      }
    }
    // Model units -> radii: a body is drawn at `unitsToPx * radiusPx / 11`, so
    // one model unit is `unitsToPx / 11` of the instance's own radius whatever
    // size that instance happens to be.
    var perRadius = m.unitsToPx / 11;
    return { plan: Math.sqrt(plan) * perRadius, top: top * perRadius };
  }

  // KEYED ON THE MODEL IT IS ABOUT TO MEASURE, WHICH IS THE ONLY KEY THAT CAN BE
  // RIGHT. This used to be the type id plus a hand-written `:revived` suffix --
  // correct for the one type that had a second mesh, and a stale-cache bug the
  // moment a second one arrived. `enemyModel` is already the single place that
  // decides which mesh a body wears; asking it, and caching under its answer,
  // means a variant can be added to ENEMY_VARIANT without a matching edit here.
  //
  // IT IS A LIVE CASE ON THE BULWARK, NOT A HYPOTHETICAL. The bubble is drawn
  // while `shieldFlash` decays, and by then `shieldBroken` is already set -- so
  // the FIRST Bulwark bubble a board ever draws can be one measured off the
  // stripped body, whose plan extent is the torso alone against the shielded
  // body's halo. Under the old key that measurement was cached as "the shielded
  // bubble" for the rest of the session, and every Bulwark after it wore a
  // bubble sized to a body it was not in yet.
  //
  // The fallback stays the type id: a body with no mesh gets the sphere, and
  // two sphere-drawn types must not share one bubble.
  function shieldBubble(enemy) {
    var model = enemyModel(enemy);
    var id = model || (enemy.typeId || "unknown");
    var cached = typePrims["bubble:" + id];
    if (cached) return cached;
    var extent = bodyExtentRadii(model);
    // A sphere type has no mesh to measure. `bodyTopOf`'s own fallback is 2.2
    // radii and the drawn ball is one radius across, which is what those two
    // numbers are.
    if (!extent) extent = { plan: 1.0, top: 2.2 };
    var rx = Math.max(BUBBLE_MIN_RADII, extent.plan * BUBBLE_PAD);
    var half = Math.max(BUBBLE_MIN_RADII, extent.top * 0.5 * BUBBLE_PAD);
    var g = new GLGeometry.Builder();
    GLGeometry.ellipsoid(g, 0, 0, extent.top * 0.5, rx, half, BUBBLE_RGB,
      14, 9, BUBBLE_EMISSIVE);
    cached = { mesh: g.build(renderer) };
    typePrims["bubble:" + id] = cached;
    return cached;
  }

  function bubbleAlpha(enemy) {
    if (!(enemy.shieldMax > 0)) return 0;
    var held = Math.max(0, Math.min(1, enemy.shield / enemy.shieldMax));
    if (!(enemy.shield > 0) && !(enemy.shieldFlash > 0)) return 0;
    var a = (enemy.shield > 0 ? BUBBLE_BASE + BUBBLE_HELD * held : 0) +
      BUBBLE_FLASH * (enemy.shieldFlash || 0);
    return Math.min(0.42, a);
  }

  // Scratch, so a board full of shielded bodies allocates nothing per frame.
  var bubbleList = [];

  function drawShieldBubbles(state) {
    bubbleList.length = 0;
    var eye = camera.eye();
    for (var i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
      if (!bubbleAlpha(e)) continue;
      var dx = e.pos.x - eye[0], dy = e.pos.y - eye[1];
      bubbleList.push({ e: e, far: dx * dx + dy * dy });
    }
    if (!bubbleList.length) return;
    // FAR TO NEAR, because these are the only translucent things on the board
    // that routinely overlap EACH OTHER -- ten of them at once is precisely
    // what a Shieldbearer's pulse produces. Depth writes are off while blending
    // (setFade), so nothing else sorts them.
    bubbleList.sort(function (a, b) { return b.far - a.far; });
    for (i = 0; i < bubbleList.length; i++) {
      var body = bubbleList[i].e;
      var r = body.radiusPx ? body.radiusPx() : 11;
      var lift = groundHeightAt(body.pos.x, body.pos.y) + bodyLift(body, r);
      renderer.setFade(bubbleAlpha(body));
      renderer.draw(shieldBubble(body).mesh, body.pos.x, body.pos.y, lift,
        0, r);
    }
    renderer.setFade(1);
  }

  // A tower with no mesh is a CYLINDER in its own tint, on a pad -- clearly a
  // stand-in, clearly which tower it is, never invisible.
  function towerCylinder(tower) {
    var id = (tower.constructor && tower.constructor.ID) || "tower";
    var cached = typePrims["t:" + id];
    if (cached) return cached;
    var tint = (typeof tower.tint === "function") ? tower.tint()
      : { r: 140, g: 150, b: 170 };
    var lin = [Math.pow(tint.r / 255, 2.2), Math.pow(tint.g / 255, 2.2),
               Math.pow(tint.b / 255, 2.2)];
    var dark = [lin[0] * 0.35, lin[1] * 0.35, lin[2] * 0.35];
    var g = new GLGeometry.Builder();
    GLGeometry.cylinder(g, 0, 0, 0.62, 0.22, dark, 0, 14);      // pad
    GLGeometry.cylinder(g, 0, 0, 0.42, 1.35, lin, 0.2, 12);     // body
    GLGeometry.cylinder(g, 0, 0, 0.5, 0.18, dark, 1.55, 12);    // cap
    cached = { mesh: g.build(renderer) };
    typePrims["t:" + id] = cached;
    return cached;
  }

  // A RECRUIT FIRING.
  //
  // They had no shooting action at all: a holding recruit was pinned to frame 0
  // and stood there while rounds left him, which reads as a statue with a
  // sound effect. The rig already has `arm_l`, `arm_r` and `gun` as separate
  // groups, so this is a real pose on real geometry rather than a sprite swap.
  //
  // Two phases off ONE clock -- the same `cooldown` the shot itself is fired
  // from, so the kick cannot drift out of step with the round:
  //   KICK  (first 35%)  the rifle drives back and the muzzle climbs, fast
  //   SETTLE(remainder)  he brings it down again, slower, and overshoots once
  // Nothing is stored. A recruit that stops shooting simply stops posing.
  var recoilArmL = new Float32Array(16);
  var recoilArmR = new Float32Array(16);
  var recoilGun = new Float32Array(16);
  var recoilBody = new Float32Array(16);
  var recoilOut = { arm_l: recoilArmL, arm_r: recoilArmR, gun: recoilGun,
                    body: recoilBody };

  // HE HAS TO BRING THE RIFLE UP FIRST.
  //
  // The rig carries the gun at the HIP -- its group origin is z 0.70 and the
  // muzzle sits at x 0.64 -- but `SoldierRecruit.fire` spawns the round at
  // MUZZLE_HEIGHT_UL = 30.1 and MUZZLE_B4_UL = 18.2 forward. In Blender units
  // that is (0.572, 0.947): a quarter of a unit ABOVE the barrel he is holding.
  // So the rounds came out of thin air over a rifle that never moved, which is
  // exactly what the owner saw.
  //
  // These offsets take the carried pose TO the spawn point, so the barrel ends
  // where the bullet begins. They are derived from those two constants rather
  // than eyeballed -- if the muzzle constants change, this is the one place
  // that has to follow.
  // THE BARREL POINTS 36 DEGREES INTO THE GROUND when carried. Raising the
  // weapon without LEVELLING it left the rounds leaving a barrel aimed at his
  // own boots -- which is why the first fix only half worked.
  //
  // SOLVED FROM THE GEOMETRY, not typed in. Two hand-derived constants were
  // tried and both missed by several u.l., because the barrel's extreme vertex
  // is not exactly on its axis and the weapon is carried off-centre. This reads
  // the gun group's own breech and muzzle out of the shipped model, works out
  // the rotation that levels that line, and then the translation that lands the
  // tip exactly where `SoldierRecruit.fire` spawns the round. Computed once per
  // model and cached; if either the rig or the muzzle constants change, it
  // simply comes out right.
  var aimCache = Object.create(null);

  function recruitAim(modelName, reachUl) {
    var hit = aimCache[modelName];
    if (hit) return hit;
    var m = GLModels.get(renderer, modelName);
    var pos = m && m.expanded && m.expanded.positions;
    var gi = -1, i;
    for (i = 0; m && i < m.groups.length; i++) {
      if (m.groups[i].name === "gun") { gi = i; break; }
    }
    if (!pos || gi < 0 || !m.frames.length) {
      return (aimCache[modelName] = { pitch: 0, fwd: 0, up: 0 });
    }
    var g = m.groups[gi], base = m.frames[0][gi];
    var lo = null, hi = null;
    for (i = g.first; i < g.first + g.count; i++) {
      var p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
      if (!lo || p[0] < lo[0]) lo = p;
      if (!hi || p[0] > hi[0]) hi = p;
    }
    function world(mat, p) {
      return [mat[0] * p[0] + mat[4] * p[1] + mat[8] * p[2] + mat[12],
              mat[1] * p[0] + mat[5] * p[1] + mat[9] * p[2] + mat[13],
              mat[2] * p[0] + mat[6] * p[1] + mat[10] * p[2] + mat[14]];
    }
    var breech = world(base, lo), muzzle = world(base, hi);
    // How far the barrel currently droops, and the rotation that undoes it.
    //
    // NEGATIVE ry lifts the muzzle here: localPose sends a point (d, 0, 0) to
    // (d cos t, -d sin t) in x/z. The barrel droops (muzzle below breech, so
    // this atan2 is negative) and passing that angle straight through cancels
    // it. Negating it first -- which looks like the obvious "undo" -- doubled
    // the droop instead and buried the muzzle in the floor.
    var run = Math.sqrt(Math.pow(muzzle[0] - breech[0], 2) +
                        Math.pow(muzzle[1] - breech[1], 2));
    var pitch = Math.atan2(muzzle[2] - breech[2], run);

    // Where that tip lands once levelled, so the offset can finish the job.
    var lp = GLMath.localPose(new Float32Array(16), [0, 0, 0], 0, pitch, 0,
      0, 0, 0);
    var levelled = world(GLMath.multiply(new Float32Array(16), base, lp), hi);
    var unit = m.unitsToPx / AUTHORED_PX_PER_UL;      // Blender units -> u.l.

    // THE OFFSET IS IN THE GUN'S LOCAL SPACE, and the carry pose rotates it.
    // `posed = base * localPose`, so a local translation t moves the tip by
    // `base_rotation * t` in the world -- feeding it a world-space delta sent
    // the muzzle off at the angle the rifle happens to be held at. Rotate the
    // delta back through the transpose (these groups are rigid, so that is the
    // inverse) and the tip lands exactly on the spawn point.
    var dx = reachUl / unit - levelled[0];
    var dy = -levelled[1];
    var dz = SPAWN_HEIGHT_UL / unit - levelled[2];
    hit = { pitch: pitch,
            fwd: base[0] * dx + base[1] * dy + base[2] * dz,
            side: base[4] * dx + base[5] * dy + base[6] * dz,
            up: base[8] * dx + base[9] * dy + base[10] * dz };
    // The rifle is carried off-centre and should STAY off-centre -- a
    // shouldered weapon sits beside the spine, not on it. Only the reach and
    // the height have to agree with the spawn point.
    hit.side = 0;
    aimCache[modelName] = hit;
    return hit;
  }
  // How far the arms swing to get there. The arm geometry hangs DOWN from the
  // shoulder (local z -0.50..0.01), so a rotation about +Y sweeps the hand
  // forward: at -1.30 rad the hand lands at (0.56, 0.97), which is the rifle.
  var AIM_ARM = -1.30;
  // The height `SoldierRecruit.fire` gives its rounds, in u.l.
  var SPAWN_HEIGHT_UL = 30.1;
  var RECRUIT_SHOULDER = [0.02, 0.0, 0.62];

  function recruitPose(rc) {
    var sps = rc.stats && rc.stats.shotsPerSecond;
    if (!(sps > 0) || !rc.holding) return null;

    // RAISE, then FIRE. `raise` eases in over a quarter second of holding so
    // he shoulders the weapon rather than snapping to it; `kick` rides on top
    // for the moment after each round. Both come off clocks that already
    // exist -- nothing is stored on the recruit.
    var hold = rc.holdTime === undefined ? 1 : rc.holdTime;
    var raise = Math.max(0, Math.min(1, hold / 0.25));
    raise = raise * raise * (3 - 2 * raise);          // smoothstep

    var interval = 1 / sps;
    var age = interval - (rc.cooldown || 0);
    var span = Math.min(0.20, interval);
    var kick = 0;
    if (age >= 0 && age <= span) {
      var t = age / span;
      if (t < 0.35) {
        kick = t / 0.35;                              // driven back
      } else {
        var s = (t - 0.35) / 0.65;
        kick = (1 - s) * Math.cos(s * 5.2) * 0.55;    // settling, one overshoot
      }
    }

    var lift = 0.30 * kick;                  // muzzle climb, radians
    var back = -0.055 * kick;                // straight back along the barrel
    // Rotated about the GUN'S OWN origin, so levelling the barrel swings the
    // muzzle up rather than sweeping the whole weapon around his chest.
    var aim = recruitAim(recruitModel(rc), rc.visualTier === "B5"
      ? SoldierRecruit.MUZZLE_B5_UL : SoldierRecruit.MUZZLE_B4_UL);
    GLMath.localPose(recoilGun, [0, 0, 0], 0, aim.pitch * raise - lift, 0,
      aim.fwd * raise + back, aim.side * raise, aim.up * raise);
    GLMath.localPose(recoilArmR, [0, 0, 0], 0, AIM_ARM * raise - lift * 0.85,
      0, back * 0.8, 0, 0);
    GLMath.localPose(recoilArmL, [0, 0, 0], 0,
      AIM_ARM * 0.82 * raise - lift * 0.55, 0, back * 0.5, 0, 0);
    // The body absorbs it: a small lean back from the hips, an order of
    // magnitude less than the rifle. Without this the gun looks sprung to him
    // rather than braced against him.
    GLMath.localPose(recoilBody, [0, 0, 0], 0, -0.045 * kick, 0,
      back * 0.35, 0, 0);
    return recoilOut;
  }

  function recruitModel(recruit) {
    return (recruit && recruit.visualTier === "B5")
      ? "recruit-b5" : "recruit-b4";
  }

  // --- setup ---------------------------------------------------------------

  function install(options) {
    options = options || {};
    uiCanvas = options.uiCanvas || document.getElementById("game");
    glCanvas = options.glCanvas;
    if (!glCanvas || !uiCanvas) return false;

    renderer = new GLRenderer(glCanvas);
    if (!renderer.gl) return false;

    // One tiny mesh built once. `prims.block` stands in for any tower type that
    // has not been exported from Blender yet -- a tower that draws nothing is a
    // tower the player cannot see they own, which is worse than a placeholder.
    var bg = new GLGeometry.Builder();
    GLGeometry.box(bg, 0, 0, 1, 1, 1, [0.16, 0.17, 0.22], 0);
    GLGeometry.box(bg, 0, 0, 0.72, 0.72, 0.18, [0.34, 0.37, 0.46], 1);
    prims = { block: bg.build(renderer) };

    camera = new OrbitCamera(glCanvas, {
      minDistance: 180,
      maxDistance: 4200,
      // The HUD canvas sits on top, so it is where pointer events actually
      // land. Binding to the GL canvas silently received nothing -- the
      // "camera disappeared" bug.
      inputTarget: uiCanvas
    });
    // Everything this file projects is drawn on the 2D canvas, whose
    // coordinate system is the game's fixed logical view -- not CSS pixels and
    // not the backing store. Telling the camera once is what keeps every
    // overlay in the same space as the HUD it sits beside.
    camera.viewport = {
      width: typeof VIEW_WIDTH === "number" ? VIEW_WIDTH : 1280,
      height: typeof VIEW_HEIGHT === "number" ? VIEW_HEIGHT : 720
    };
    enabled = true;

    // THE SUMMONER'S EFFECT MODULES, handed the helpers they cannot reach.
    //
    // Done here rather than at their own load time because `renderer` and
    // `camera` do not exist until this function has run -- every one of these
    // helpers is a closure over them. Guarded with typeof so a build that ships
    // without the three files installs exactly as it did before, and each
    // module's own entry points no-op until its bind() has been called.
    if (typeof BlubFXCircles !== "undefined") {
      BlubFXCircles.bind({
        project: project,
        withGround: withGround,
        groundHeightAt: groundHeightAt
      });
    }
    if (typeof BlubFXSystems !== "undefined") {
      BlubFXSystems.bind({
        project: project, ringPath: ringPath,
        drawGroundRing: drawGroundRing, drawGroundArc: drawGroundArc,
        drawShockwave: drawShockwave, drawDebrisFan: drawDebrisFan,
        groundHeightAt: groundHeightAt
      });
    }
    // The flier wreck. It is handed the four things it must not have its own
    // copy of -- where a flier is drawn, which mesh it is, what colour it
    // glows, and how high the ground is -- and nothing else.
    if (typeof EnemyWreck !== "undefined") {
      EnemyWreck.bind({
        project: project, groundAt: groundHeightAt,
        bodyLift: bodyLift, modelOf: enemyModel,
        tintOf: lanternTint, unitsToPx: GLModels.unitsToPx
      });
    }
    return true;
  }

  function ensureMap(map, routePaths) {
    var key = (map ? map.id : "none") + ":" + routePaths.length;
    if (key === mapKey && mapMesh) return;
    mapKey = key;
    // A NEW BOARD KEEPS NONE OF THE OLD ONE'S PICTURES. The death splatters and
    // the watch list are keyed on bodies that no longer exist, and the shot
    // pools would open the run with the previous one's brass on the floor.
    if (typeof BlubFXSystems !== "undefined") BlubFXSystems.reset();
    if (typeof BlubFXShots !== "undefined") BlubFXShots.reset();
    if (typeof BlubFXCircles !== "undefined") BlubFXCircles.reset();
    if (typeof EnemyWreck !== "undefined") EnemyWreck.reset();
    mapMesh = buildMapMesh(map, routePaths);
    camera.bounds = bounds;
    camera.fitBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
  }

  // Pin the 3D canvas onto the 2D one, pixel for pixel, every frame. The 2D
  // canvas is centred by flex and sized with min(), so its box moves with the
  // window and there is no layout rule that would keep a second canvas on it;
  // copying the measured rect is the only thing that actually stays true.
  function resize() {
    if (!enabled) return;
    var r = uiCanvas.getBoundingClientRect();
    glCanvas.style.left = r.left + "px";
    glCanvas.style.top = r.top + "px";
    glCanvas.style.width = r.width + "px";
    glCanvas.style.height = r.height + "px";
    // Backing store at device resolution, capped so a 4K display does not ask
    // for a buffer nothing can fill at frame rate.
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(r.width * dpr));
    var h = Math.max(1, Math.round(r.height * dpr));
    if (glCanvas.width !== w || glCanvas.height !== h) {
      glCanvas.width = w;
      glCanvas.height = h;
    }
  }

  // --- the world pass ------------------------------------------------------

  function drawWorld(ctx, state) {
    if (!enabled) return false;
    resize();
    boardClock = state.now || 0;
    ensureMap(state.map, state.paths);
    camera.update(state.dt || 1 / 60);
    // ONE DIFF PASS, once per frame, before anything is drawn: which blubs are
    // still standing and which vanished since the last frame. It is idempotent
    // on `state.now`, so it does not matter that drawOverlays also touches the
    // module later in the same frame.
    if (typeof BlubFXSystems !== "undefined") BlubFXSystems.update(state);
    // Same diff, same reason, for the fliers: an enemy is spliced out of the
    // array at the end of the update tick it dies in, so a death is only ever
    // visible as an ABSENCE by the time anything draws.
    if (typeof EnemyWreck !== "undefined") EnemyWreck.update(state);

    var vp = camera.viewProjection();
    // THE VOID BEHIND A FOGGED BOARD IS THAT BOARD'S OWN BACKGROUND.
    //
    // MEASURED, and the first version of this line was wrong in a way that
    // only a measurement shows: it cleared to the FOG's colour, on the theory
    // that the far edge fades to fog and the void should meet it. It does not.
    // At a density anyone would actually play with, the far edge of the ground
    // only ever reaches about a third of the way to the fog colour -- read off
    // the framebuffer at (41,43,37) against a (43,46,39) clear -- so clearing
    // to the mist puts a band of BRIGHT sky around a dark board and inverts
    // the whole picture. The theme's own background is the colour the board
    // says its void is, which is the answer that was there all along.
    var fog = mapPalette && mapPalette.fog;

    // THE ENVIRONMENT THIS FRAME IS LIT BY, and it arrives in the render state
    // like everything else. This function never advances a clock and never
    // computes a phase: game.js's fixed step owns the time and hands the
    // composed result down. A renderer that ticks the sky is a sky that runs
    // at frame rate and speeds up on a fast machine.
    //
    // OUTDOOR BOARDS ONLY. Six of the eight routes are decks inside a facility;
    // a sunrise over a reactor hall is not atmosphere, it is a mistake. A board
    // opts in by declaring a horizon, which is the same flag that already says
    // "this board has a sky rather than a void". Everything else keeps the
    // authored rig, byte for byte.
    var env = state.environment || null;
    var outdoor = !!(mapPalette && mapPalette.horizon) && !!env;
    if (outdoor) {
      renderer.setLighting({
        keyDir: env.light.keyDir,
        fillDir: env.light.fillDir,
        ambient: env.light.ambient,
        fillColor: env.light.fillColour,
        keyColor: env.light.keyColour,
        keyStrength: env.light.keyStrength
      });
    } else {
      renderer.resetLighting();
    }

    renderer.begin(vp, outdoor ? env.sky.horizon : (fog ? fog.clear : null));

    // THE SKY, before anything else and behind everything. Its own program and
    // its own depth state; `rebind` hands the context back.
    if (outdoor) {
      // `renderer.gl` -- this module has no `gl` of its own, and the first
      // version of this line reached for a bare one. It resolved to something
      // on the global object rather than throwing, so GLSky.create built a Sky
      // against the wrong context: it compiled, it linked, every uniform
      // location came back valid, and it drew nothing. The board still looked
      // right, because the CLEAR colour is the sky's own horizon colour -- so
      // the gradient, the band, the sun, the moon and the stars were all
      // missing behind a background that was exactly the right shade.
      if (sky === undefined) sky = GLSky.create(renderer.gl);
      if (sky) {
        sky.draw(camera, env, glCanvas.height ? glCanvas.width / glCanvas.height : 1);
        renderer.rebind();
      }
    }
    // SET ONCE PER FRAME, BEFORE ANYTHING IS DRAWN, so the board, the towers,
    // the bodies and the projectiles all stand in the same air. `begin` has
    // just restored clear air, so a board with no fog needs no call and cannot
    // inherit the last board's weather.
    //
    // AND THE AIR FOLLOWS THE SKY. Mist is lit by whatever is lighting
    // everything else: at noon it is a pale haze, at midnight it is the deep
    // blue of the horizon behind it. Blending toward the sky's own horizon
    // colour is what stops a board fading into yesterday's daylight at 3am.
    if (fog) {
      var fogColour = fog.color;
      var fogDensity = fog.density;
      if (outdoor) {
        fogColour = mixTriple(fog.color, env.sky.horizon, env.fogSkyMix);
        fogDensity = fog.density * env.fogDensityScale;
      }
      renderer.setFog(fogColour, fogDensity, fog.height);
    }
    // The board's scenery carries its own emission, so the map pass is drawn
    // with the glow driven. Constant, not animated: these are installations
    // that are simply switched on, and a breathing board would pull the eye off
    // the things that actually change. Reset immediately so a tower that does
    // not set its own glow cannot inherit the board's.
    //
    // THE MULTIPLIER IS THE WHOLE NIGHT-LIGHTING MECHANISM. The map mesh is
    // static and is built once; animating a lantern by rebuilding a hundred
    // thousand triangles would be absurd. `uGlow` already scales every emissive
    // vertex in the pass, so a settlement's windows come up at dusk and go out
    // at dawn for the cost of one uniform. Reset to 0 immediately after, so a
    // tower that sets no glow of its own cannot inherit the board's -- which is
    // also what keeps a tower's charge and firing glow entirely its own.
    var sceneryGlow = outdoor ? env.sceneryEmissive : 1;
    renderer.setGlow(sceneryGlow, mapPalette ? mapPalette.accent : null);
    renderer.draw(mapMesh, 0, 0, 0, 0, 1);
    // The board's own exceptions, each under the light it declared. Same
    // static geometry and the same fog; only the tint of what it emits is its
    // own. See `accentMeshes` for why this cannot be one draw call.
    for (var am = 0; am < accentMeshes.length; am++) {
      renderer.setGlow(sceneryGlow, accentMeshes[am].tint);
      renderer.draw(accentMeshes[am].mesh, 0, 0, 0, 0, 1);
    }
    renderer.setGlow(0, null);

    var i;
    // Towers, enemies, recruits and bullets. Depth sorting is the GPU's job
    // now -- the 2D pass had to sort back-to-front by y every frame and this
    // does not, which is one of the things 3D simply gives you.
    for (i = 0; i < state.towers.length; i++) {
      var t = state.towers[i];
      var model = towerModel(t);
      // FIRING RECOIL. `sinceShot` is already derived, already reconciled
      // across both of the Rifleman's firing models, and ages to null -- so
      // the kick needs no state of its own here. The body shifts back along
      // its aim for the first few hundredths of a second after a shot.
      var kick = 0;
      if (typeof t.sinceShot === "function") {
        var age = t.sinceShot();
        if (age !== null && age < 0.09) kick = (1 - age / 0.09) * 3.2;
      }
      var kx = Math.cos(t.aim || 0) * -kick;
      var ky = Math.sin(t.aim || 0) * -kick;

      if (model) {
        // THE WORK CYCLE, off the tower's own clock. `gearPhase()` is already
        // `1 - cooldown / cycleSeconds()` and already reconciles the two
        // firing models, so a burst plays it at burst speed and automatic fire
        // plays it as a continuous shudder -- the identical mapping the sprite
        // sheets used, now driving real geometry.
        var m = GLModels.get(renderer, model);
        var frame = 0;
        if (m && m.frames.length > 1 && typeof t.gearPhase === "function") {
          var phase = t.gearPhase();
          if (isFinite(phase) && phase < WORK_SHARE) {
            frame = 1 + Math.min(m.frames.length - 2,
              Math.floor((phase / WORK_SHARE) * (m.frames.length - 1)));
          }
        }
        // A BLUB'S ANIMATION IS ITS COOLDOWN.
        //
        // It has neither gearPhase nor swingProgress, so without this branch
        // `frame` stays 0 and all ten attack cycles are dead weight -- nine
        // frames on disk and a still board. There is no visible symptom to catch
        // that, because a frozen blub looks exactly like a correct rest pose,
        // which is precisely why frame 0 IS the rest pose. One grep checks it:
        //   grep -c BLUB_CYCLE js/gl/gl-world.js
        //
        // Indexing the strip by reload PHASE rather than by a clock means the
        // cycle can neither overrun the interval nor lag a rate change -- and
        // the swarm buff moves that rate mid-interval.
        //
        // Reading a cooldown of exactly zero as REST is not a detail: an idle
        // blub holds cooldown at 0, and `1 - 0 * rate` is 1, not 0, so the naive
        // formula parks every idle unit on the last frame of its wind-up.
        //
        // Both reads are read-only and neither is a simulation value; js/blub.js
        // already publishes cooldown and attacksMade.
        var BLUB_CYCLE = 8;
        if (m && m.frames.length > 1 && t.isSummon &&
            typeof t.attacksPerSecond === "function") {
          frame = 0;
          var brate = t.attacksPerSecond();
          if (t.cooldown > 0 && brate > 0) {
            var bphase = 1 - t.cooldown * brate;
            if (!(bphase > 0)) bphase = 0;              // a rate that just rose
            if (bphase > 0.999999) bphase = 0.999999;
            // The SuperBlub carries a SECOND band for the interval that ends in
            // its piercing beam, so the shoulder gun has somewhere to come up.
            // The other nine have one band and never take this branch.
            var bands = Math.max(1, Math.round((m.frames.length - 1) / BLUB_CYCLE));
            var band = (bands > 1 && t.laser && t.laser.every &&
                        ((t.attacksMade + 1) % t.laser.every === 0)) ? 1 : 0;
            frame = 1 + band * BLUB_CYCLE + Math.floor(bphase * BLUB_CYCLE);
          }
        }
        // THE SIPHON CHANNELS, SO ITS CLOCK IS NOT A COOLDOWN.
        //
        // BeamTower answers to neither gearPhase nor swingProgress, so without
        // this every Siphon in play drew frame 0 forever -- the same silent
        // failure the blubs had, and just as invisible, because frame 0 is the
        // rest pose. There is no per-shot cooldown to index either: the beam is
        // continuous by design and the brief forbids an attack pulse. So the
        // phase comes from a clock, and only while it actually holds a lock;
        // off the lock it EASES back to rest rather than snapping, because a
        // hard cut to frame 0 is exactly the "strike" read the brief rules out.
        //
        // THE ARITHMETIC USED TO LIVE HERE AND NOW LIVES IN EXACTLY ONE PLACE:
        // SiphonFXBeam.animFrame. The sceptre's ring IS the beam's origin, and
        // it moves per frame -- so js/gl/siphon-beam-draw.js has to read the
        // origin FOR THE FRAME THIS LOOP DRAWS THE BODY AT. Two copies of a
        // clock drift the moment either is tuned, and the symptom would be a
        // cord starting a few pixels off the ring, which looks like a bad model
        // and is not.
        //
        // The ease is mutated per call and this is now one of at least two
        // callers per rendered frame (here, and the overlay pass). animFrame
        // memoises the step on `state.now` for exactly that reason -- see its
        // own comment. Do not step `_chanEase` here as well.
        //
        // NO FALLBACK COPY OF THE FORMULA. If SiphonFXBeam is absent the body
        // holds frame 0 and simply does not animate. Writing the formula out
        // again here "just in case" would reinstate the duplication this call
        // exists to remove, and the fallback is the copy that would go stale.
        if (m && m.frames.length > 1 && t.constructor &&
            t.constructor.ID === "siphon" &&
            typeof SiphonFXBeam !== "undefined" && SiphonFXBeam.animFrame) {
          frame = SiphonFXBeam.animFrame(t, state.now, m.frames.length);
        }
        // THE SUMMONER'S IDLE GROWS WITH ITS SWARM.
        //
        // The brief makes the amplitude of his chant a function of how many
        // units are alive -- he gets more agitated as the swarm grows -- so the
        // band is chosen by the live count and the phase runs off a clock.
        // BlubTower has no gearPhase either; same silent failure as the others.
        if (m && m.frames.length > 1 && t.constructor &&
            t.constructor.ID === "blub" && typeof t.blubCount === "function") {
          var SUM_CYCLE = 15;
          var bandsAvail = Math.max(1, Math.floor((m.frames.length - 1) / SUM_CYCLE));
          var alive = t.blubCount() | 0;
          // One rung per doubling, so the ladder keeps meaning something when a
          // maxed tower is fielding hundreds rather than a handful.
          var rung = alive <= 0 ? 0 : Math.floor(Math.log(alive + 1) / Math.LN2);
          var iband = Math.min(bandsAvail - 1, rung);
          var iphase = (((state.now || 0) * 0.30) % 1 + 1) % 1;
          frame = 1 + iband * SUM_CYCLE + Math.floor(iphase * SUM_CYCLE);
        }
        // THE FORGE-SLAM. The Warbringer has no gearPhase -- it holds its
        // swing until something walks into the zone -- so its frames come from
        // `swingProgress()`, which is already the cosmetic window the 2D pack
        // used and already lands its last frame exactly when damage does.
        var swing = 0;
        if (m && m.frames.length > 1 &&
            typeof t.swingProgress === "function") {
          // 0 is the HELD pose and 1..n-1 are the blow, so the window maps
          // across the whole strip: floor(swing * frames), not
          // 1 + floor(swing * (frames-1)), which skipped frame 1 entirely and
          // showed the last pose for two thirds of the swing.
          swing = t.swingProgress();
          frame = swing > 0
            ? Math.min(m.frames.length - 1, Math.floor(swing * m.frames.length))
            : 0;
        }
        // THE WEAPON IS THE CHARGE EFFECT.
        //
        // Its coil stages, arc core, aperture and breech orb are emissive
        // materials in the model itself, so winding up to fire is a uniform on
        // real geometry rather than a sprite pasted over it. That is the whole
        // point: it is occluded by the barrel in front of it, it lights only
        // the parts that should light, and it cannot be seen through the
        // enemies standing between the player and the tower.
        // A full-circle Warbringer has stopped tracking (see
        // warbringerFullCircle) and is drawn at its authored facing forever.
        var drawYaw = warbringerFullCircle(t) ? 0 : (t.aim || 0);
        drawYaw += authoredFrontOffset(model);
        renderer.setGlow(towerGlow(t), towerGlowTint(t));
        var tz = groundHeightAt(t.x, t.y);
        // A SUMMONED BODY ARRIVES FROM ABOVE, AND THE MACHINES SHOVE BACK.
        //
        // Both are heights and offsets added to a transform this loop already
        // computes, so neither needs a second draw call or a second mesh. The
        // descent is a height ABOVE THE SURFACE -- the module never looks at
        // the height field, which is why it is added to `tz` here and nowhere
        // else -- and it returns 0 for any body that is not mid-arrival, so
        // this is one unconditional addition.
        if (t.isSummon) {
          if (typeof BlubFXCircles !== "undefined") {
            tz += BlubFXCircles.descentLift(t);
          }
          if (typeof BlubFXShots !== "undefined") {
            var bkick = BlubFXShots.recoil(t);
            if (bkick) {
              kx -= Math.cos(t.aim || 0) * bkick * 3.5;
              ky -= Math.sin(t.aim || 0) * bkick * 3.5;
              tz += bkick * 1.5;
            }
          }
        }
        drawActor(model, t.x + kx, t.y + ky, drawYaw, 1, tz, frame);
        // Crosspath marks, drawn OVER an unchanged body -- same yaw, same lift,
        // TRANSLATED ONTO THEIR SEAT. Because they are separate models the body
        // underneath is literally the same vertices with or without them, which
        // is the rule they exist to satisfy rather than a discipline to
        // remember; the seat offset is the only thing this loop adds.
        //
        // The seat is a point in the BODY's model space, so it is spun by the
        // same drawYaw and scaled by the same unitsToPx the body is drawn with
        // -- which is modelYaw's transform written out by hand, and the only
        // honest way to land a mark on a limb the mark model knows nothing
        // about. Body and mark share one unitsToPx (31.8032 for all eleven
        // summoner models) and have to: a mark drawn at a different scale from
        // the body it rides would be the wrong size on it.
        //
        // ONE SEAT IS NOT TURNED, AND THAT IS WHY IT SURVIVES BEING TURNED
        // HERE. summoner-mark-a1's runes live in the model's `world_fixed`
        // group, so drawActor draws them at yaw 0 whatever it is handed -- a
        // ritual on the ground does not swivel. Its seat is the origin, so the
        // rotated offset is (0, 0, 0) and the two agree. A future mark that was
        // both world_fixed AND seated off-centre would NOT: the geometry would
        // stand still while the offset spun. Give that one an unrotated offset,
        // do not "fix" it by rotating the group.
        var marks = (t.constructor && t.constructor.ID === "blub")
          ? summonerMarks(t) : null;
        if (marks) {
          var mSeats = summonerSeats(t);
          var mScale = GLModels.unitsToPx(model);
          var mCos = Math.cos(drawYaw), mSin = Math.sin(drawYaw);
          for (var mi = 0; mi < marks.length; mi++) {
            var mSeat = mSeats[SUMMONER_MARK_SEAT[marks[mi]]];
            if (!mSeat) continue;
            drawActor(marks[mi],
              t.x + kx + (mCos * mSeat[0] - mSin * mSeat[1]) * mScale,
              t.y + ky + (mSin * mSeat[0] + mCos * mSeat[1]) * mScale,
              drawYaw, 1, tz + mSeat[2] * mScale, 0);
          }
        }
        renderer.setGlow(0, null);
      } else {
        // Stand-in cylinder, breathing very slightly while its cooldown runs
        // so it reads as a live machine rather than scenery.
        var pulse = 1 + 0.02 * Math.sin((state.now || 0) * 4 + t.x * 0.01);
        renderer.draw(towerCylinder(t).mesh, t.x + kx, t.y + ky,
          groundHeightAt(t.x, t.y), t.aim || 0,
          (t.footprintPx || 12) * 1.9 * pulse);
      }

      if (t.recruits) {
        for (var r = 0; r < t.recruits.length; r++) {
          var rc = t.recruits[r];
          if (rc.dead) continue;
          // The march: distance-driven bob, exactly the rule the 2D walk
          // cycles follow -- feet sync to ground covered, so a recruit that
          // stops to shoot stands still instead of jogging on the spot.
          // Marching recruits walk; a holding one stands still and shoots,
          // which is the whole design of the unit.
          var rm = GLModels.get(renderer, recruitModel(rc));
          // Same band contract as the enemy walk below. A holding recruit
          // stands on the FIRST frame of its walk band rather than on literal
          // frame 0 -- identical while every band starts at 0, and correct if
          // one ever does not.
          var rBand = walkBand(rm);
          var rFrame = rc.holding ? rBand[0]
            : bandFrame(rBand, (rc.progress || 0) / 26);
          drawActor(recruitModel(rc), rc.x, rc.y, rc.facing, 1,
            groundHeightAt(rc.x, rc.y), rFrame, recruitPose(rc));
        }
      }
    }
    // A DYING BLUB IS STILL REAL GEOMETRY. js/game.js pulled it out of `towers`
    // the moment its last charge was spent -- the ground is already free and a
    // replacement may already be standing on it -- but the object still exists
    // and towerModel() still resolves its mesh, so the swell and the MK2's leap
    // are the model itself rather than a canvas blob standing in for it.
    if (typeof BlubFXSystems !== "undefined") {
      var dying = BlubFXSystems.dyingBodies();
      for (i = 0; i < dying.length; i++) {
        var db = dying[i];
        var dm = towerModel(db.blub);
        if (!dm) continue;
        renderer.setGlow(db.glow, null);
        drawActor(dm, db.x, db.y, db.yaw, db.scale,
          groundHeightAt(db.x, db.y) + db.lift, 0);
        renderer.setGlow(0, null);
      }
    }
    // CAMO BODIES ARE DRAWN TRANSLUCENT, AND THEY ARE DRAWN LAST.
    //
    // `setFade` turns on blending and turns OFF depth writes, so a translucent
    // body lays down no depth. Drawn in array order a camo enemy that happened
    // to be early would let every opaque body behind it composite over the top
    // of it, which reads as a solid enemy standing in front of a ghost that is
    // actually nearer the camera. Two passes fixes that for opaque-vs-camo, and
    // costs one extra walk of a list that is at most a few dozen long.
    //
    // Camo-vs-camo overlap is still resolved in array order rather than by
    // depth. That is deliberate and measured rather than assumed -- see the
    // note on CAMO_ALPHA. Sorting the second pass would fix it and is the
    // obvious next step if the board ever runs many overlapping camo bodies.
    var camoCount = 0;
    for (i = 0; i < state.enemies.length; i++) {
      if (state.enemies[i].isCamo) camoCount++;
    }
    for (var pass = 0; pass < (camoCount ? 2 : 1); pass++) {
      var wantCamo = (pass === 1);
      // Set once per pass, not once per body: `setFade` toggles BLEND and the
      // depth mask, and there is no reason to do that per enemy.
      if (wantCamo) renderer.setFade(CAMO_ALPHA);
    for (i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
      if (!!e.isCamo !== wantCamo) continue;
      var heading = e.path && e.path.tangentAt
        ? e.path.tangentAt(e.progress) : null;
      var yaw = heading ? Math.atan2(heading.y, heading.x) : 0;
      var radius = e.radiusPx ? e.radiusPx() : 11;
      // THE WALK, driven by distance covered -- one bob per stride, feet and
      // ground agreeing, a slowed enemy visibly trudging. The same reason the
      // sprite pack advanced its frames by progress rather than by a clock.
      var stride = radius * 2.6;
      var phase = (e.progress || 0) / stride * Math.PI * 2;
      var model = enemyModel(e);
      // A flier rides above its own path point; a walker sits on it. Read once
      // here so the mesh branch and the sphere branch cannot drift apart, and
      // so the sphere types that are still fliers rise too.
      var lift = groundHeightAt(e.pos.x, e.pos.y, e.isFlying) + bodyLift(e, radius);
      // BUILT ONCE PER RENDERED FRAME, DELIBERATELY OUTSIDE THE CAMO LOOP.
      // `strikeOf` is written to be idempotent within a frame -- the latch
      // moves only when the drive RISES -- but relying on that where hoisting
      // costs nothing would leave the guarantee untested in the shipped path.
      // The object it returns is shared scratch, consumed synchronously by the
      // drawActor call below before any other body reaches this line.
      var strike = strikeOf(e, model);
      // DISJOINT BY CONSTRUCTION -- one body has a mast and the other has
      // shards, and no mesh has both -- but written so the shards win if that
      // ever stops being true, because a strike is a 0.4 s flourish and the
      // shards are the whole of what a broken Vanguard is.
      var shards = shardPose(e, model, yaw, radius / 11, lift);
      // A CAMO BODY IS DRAWN TWICE: depth first, then colour.
      //
      // With depth writes off, EVERY front-facing surface of a translucent body
      // passes the depth test, so an arm over a chest blends that pixel twice
      // and it comes out BRIGHTER -- the translucency reads weakest exactly
      // where the body is thickest. Laying the body's own depth first and then
      // blending with depthFunc EQUAL keeps precisely one layer.
      //
      // Measured on the shipping bodies before the fix: 93-95% of interior
      // pixels departed from the single-layer law, mean 30/255, worst 107/255,
      // against a rim that was clean at 4/255 -- which is what ruled out
      // antialiasing, since a coverage artefact would do the opposite.
      for (var sub = 0; sub < (wantCamo ? 2 : 1); sub++) {
      if (wantCamo) {
        if (sub === 0) { renderer.setFade(1); renderer.setDepthOnly(true); }
        else { renderer.setDepthOnly(false); renderer.setFade(CAMO_ALPHA);
               renderer.setDepthEqual(true); }
      }
      if (model) {
        // THE WALK, ADVANCED BY DISTANCE. One full cycle per stride, so a
        // planted foot stays on one patch of road, a slowed enemy's legs drag
        // and a stopped one stops mid-step -- all for free, and all wrong the
        // moment a clock drives it instead. Same rule the sprite pack used.
        //
        // A BODY THAT TOUCHES NOTHING IS THE EXCEPTION -- the flier and the
        // hovering Healer, and no third case: see HOVER_HZ above for why a
        // cycle with no foot in it cannot be driven by distance, and
        // `clockRate` for the two rates that answer instead.
        //
        // WHICH frames are the walk comes from the model's `bands`, never from
        // arithmetic on `frames.length` -- see walkBand. Frame counts are not
        // uniform even inside the enemy family (8 on nine bodies, 12 on `angry`
        // and `flying`), so any constant here would already be wrong twice.
        var em = GLModels.get(renderer, model);
        var eBand = gaitBand(em, e);
        var rate = clockRate(e);
        var walk = rate
          ? bandFrame(eBand, boardClock * rate)
          : bandFrame(eBand, (e.progress || 0) / stride);
        // TWO REASONS A BODY LIGHTS UP, and they are lit in this order because
        // only one of them is an event. The lantern is CONTINUOUS -- it is how
        // a Wisp says "no ground tower can touch me" and it is true all its
        // life. A support pulse is a MOMENT, and it belongs to the body that
        // threw it for as long as `supportFlash` lasts. No body has both, but
        // the pulse takes precedence if one ever does: a thing that just healed
        // the wave is a more urgent thing to say than what it is.
        var pulse = supportGlow(e);
        if (pulse) renderer.setGlow(pulse, supportTint(e));
        else if (e.isFlying) renderer.setGlow(lanternGlow(e), lanternTint(e));
        drawActor(model, e.pos.x, e.pos.y, yaw, radius / 11, lift, walk,
          shards || strike);
        // Put it back. setGlow is state, not an argument, so a flier that left
        // it lit would hand its lantern to the next body drawn.
        if (pulse || e.isFlying) renderer.setGlow(0, null);
      } else {
        // Sphere types ROLL their bounce instead: squash on the ground beat,
        // stretch at the top, which is the one animation a ball actually has.
        // One that is off the road has no ground to beat against, and whatever
        // holds it up is already in `lift`.
        var beat = afloat(e) ? 0 : Math.abs(Math.sin(phase));
        renderer.draw(enemySphere(e).mesh, e.pos.x, e.pos.y,
          lift + beat * radius * 0.22, yaw,
          radius * (0.94 + beat * 0.10));
      }
      }
      // Depth compare goes back to the board's LEQUAL immediately. EQUAL is
      // only ever correct against a pre-pass this body just laid, and leaving
      // it on would silently reject the next body's every fragment.
      if (wantCamo) renderer.setDepthEqual(false);
    }
      // Put it back, for the same reason setGlow is put back: fade is STATE,
      // and a pass that left it on would hand its translucency to the wrecks
      // and to every later frame's first body.
      if (wantCamo) { renderer.setDepthOnly(false); renderer.setFade(1); }
    }
    // THE WRECKS, drawn last of the bodies. They were the only translucent
    // thing on the board until camo enemies joined them, and a blended draw
    // with depth writes off has to come after everything opaque or it
    // composites against a half-built frame. Each one is the real mesh at a
    // real transform -- see js/gl/enemy-wreck.js.
    if (typeof EnemyWreck !== "undefined") {
      var wrecks = EnemyWreck.bodies();
      for (i = 0; i < wrecks.length; i++) {
        var wr = wrecks[i];
        wreckTilt.rx = wr.roll;
        wreckTilt.ry = wr.pitch;
        wreckTilt.pivotZ = wr.pivotZ;
        if (wr.glow > 0) renderer.setGlow(wr.glow, wr.tint);
        renderer.setFade(wr.fade);
        drawActor(wr.model, wr.x, wr.y, wr.yaw, wr.scale, wr.ground + wr.z,
          wr.frame, null, wreckTilt);
        renderer.setFade(1);
        if (wr.glow > 0) renderer.setGlow(0, null);
      }
    }
    // THE SHIELD BUBBLES, after everything opaque and after the wrecks, for
    // the reason the wrecks are after the bodies: a blended draw with depth
    // writes off composites against whatever is already in the buffer, so it
    // has to be able to see the finished frame behind it. See shieldBubble.
    drawShieldBubbles(state);
    // Projectiles are NOT drawn here. They were, as one grey cube each, until
    // there was something better; they are light, not geometry -- a tracer, a
    // rail lance, a covenant round -- and every one of those is a gradient with
    // a hot core, which is a thing canvas does exactly and a flat-shaded mesh
    // does not do at all. drawShots() in the overlay pass owns them now.
    return true;
  }

  var instanceMat = new Float32Array(16);
  var groupMat = new Float32Array(16);

  // One instance of a model, at animation frame `frame`.
  //
  // A model with no frames is one draw call. An animated one binds once and
  // then issues a call per moving group, each with `instance * groupPose` --
  // so the Rifleman costs four calls instead of one, not a second mesh.
  // The two shot colours, in LINEAR, because that is the space the shader adds
  // them in. Same ley teal and rapture violet the projectiles use.
  var GLOW_LEY = [0.31, 0.89, 0.82];
  var GLOW_SIGIL = [0.66, 0.20, 0.92];

  // How hard a tower is driving its own emissive materials right now, 0..~1.6.
  //
  // Biased hard to the end of the cycle: for most of it there should be almost
  // nothing, and then it winds up just before the shot. A linear ramp reads as
  // a lamp on a dimmer rather than as a capacitor bank filling. A channelling
  // B5 holds near full instead, because it is not cycling -- it is casting.
  function towerGlow(tower) {
    // THE WARBRINGER'S LEY LIGHTS ON THE BLOW, NOT ON A TIMER.
    //
    // From A3 there is ley in the hammer head, and the honest moment for it is
    // the swing: dark while he waits, brightening as it comes over, and a hard
    // flash at contact that decays. `swingProgress()` is derived from the
    // cooldown and lands at exactly 1 when damage does, so the flash cannot
    // drift off the hit.
    if (typeof tower.swingProgress === "function") {
      if (!tower.hasUpgrade || !tower.hasUpgrade("A3")) return 0;
      var s = tower.swingProgress();
      if (!(s > 0)) return 0;
      if (s < Smasher.SWING_HOLD_END) {
        return 0.55 * (s / Smasher.SWING_HOLD_END);      // winding over
      }
      var k = (s - Smasher.SWING_HOLD_END) / (1 - Smasher.SWING_HOLD_END);
      return 0.55 + 1.35 * k * k;                        // into the ground
    }
    var core = tower.core;
    if (!core) return 0;
    if (tower.channel) {
      var ch = tower.channel;
      var p = Math.max(0, Math.min(1, 1 - ch.remaining / (ch.total || 1)));
      return 0.35 + 1.25 * p;
    }
    if (core.stunTimer > 0) return 0;      // dead hardware does not glow
    var t = firingProgress(tower);
    if (!(t > 0)) return 0;
    return 1.45 * t * t * t;
  }

  function towerGlowTint(tower) {
    var bought = tower.core && tower.core.purchased;
    var b = bought && bought.B ? bought.B : 0;
    var a = bought && bought.A ? bought.A : 0;
    return b > a ? GLOW_SIGIL : GLOW_LEY;
  }

  var fixedMat = new Float32Array(16);

  // LIVE POSE, ON TOP OF THE BAKED ONE.
  //
  // The baked frames are a loop -- a walk, a bolt cycle -- and a loop cannot
  // express something that happens at a moment: a recoil, a hammer coming down.
  // `overrides` is an optional { groupName: mat4 } applied AFTER the frame's own
  // pose, in the group's local space, so a recruit can kick his rifle back along
  // the exact axis it is pointing without a second mesh or a second sheet.
  //
  // Deliberately a per-group MATRIX rather than a named animation: the rig
  // already speaks in per-group matrices, and anything that composes cleanly
  // with `instance * groupPose` needs no new concept.
  var overrideMat = new Float32Array(16);

  // A WHOLE-BODY TUMBLE, which is not the same thing as `overrides`.
  //
  // `overrides` is per GROUP and lands in each group's own local space, which is
  // exactly right for a recoil and exactly wrong for a body falling out of the
  // sky: every group would rotate about its own pivot and the wreck would come
  // apart in mid-air. This composes into the INSTANCE matrix instead, so the
  // whole model turns as one rigid thing, about a pivot given in model units --
  // the Wisp rolls about the axis of its own body tube, because rolling about
  // the model origin would swing it around the tips of its legs and drive it
  // through the road.
  var tiltMat = new Float32Array(16);
  var tiltBase = new Float32Array(16);
  var tiltPivot = [0, 0, 0];

  // GLMath.multiply IS NOT ALIAS-SAFE, and the failure is silent. It reads `a`
  // for all four columns while writing `out`, so `multiply(m, m, t)` corrupts
  // the source after the first column and the result is a degenerate matrix --
  // which does not draw a wrong picture, it draws nothing at all, or a
  // one-pixel smear where a body should be. Costs one scratch matrix to avoid.
  function instanceOf(out, x, y, lift, yaw, size, tilt) {
    if (!tilt) return GLMath.modelYaw(out, x, y, lift || 0, yaw || 0, size);
    GLMath.modelYaw(tiltBase, x, y, lift || 0, yaw || 0, size);
    tiltPivot[2] = tilt.pivotZ || 0;
    GLMath.localPose(tiltMat, tiltPivot, tilt.rx || 0, tilt.ry || 0, 0,
      0, 0, 0);
    return GLMath.multiply(out, tiltBase, tiltMat);
  }

  // WHICH FRAMES ARE THE WALK, asked of the model rather than worked out.
  //
  // Returns `[first, count]` for band 0 -- the walk or default cycle. The whole
  // point of the exported `bands` field is that a reader NEVER derives a band
  // count: every off-by-one this replaces came from readers doing arithmetic on
  // `frames.length`, and two incompatible conventions already live in this file
  // (enemies treat frame 0 as a walk frame; blubs and summoners reserve it as a
  // rest pose and count from `frames.length - 1`). If anything here ever starts
  // dividing, the contract has been misread.
  //
  // ABSENT MEANS "THE EXPORTER DID NOT DECLARE THIS LAYOUT", NOT "unbanded".
  // Identical today -- five bodies carry no `bands`, including `enemy-normal`
  // and the flier, and on every one of them the whole list really is the walk.
  // They stop being identical the moment a family the exporter does not emit
  // for gets banded, which is why the fallback is written as a default rather
  // than as a claim about the model.
  // VALIDATED, NOT TRUSTED. A malformed `bands` falls back to the default, so a
  // bad value is never worse than an omitted one -- which matters because the
  // field is generated, and a generator that emits a wrong pair would otherwise
  // index frames that do not exist and throw inside drawActor rather than draw
  // the wrong pose. Every pair must lie inside the frame list.
  function walkBand(m) {
    var n = (m && m.frames.length) ? m.frames.length : 1;
    var b = m && m.bands;
    if (b && b.length && b[0] && b[0].length === 2) {
      var first = b[0][0], count = b[0][1];
      if (typeof first === "number" && typeof count === "number" &&
          first >= 0 && count > 0 && first + count <= n) {
        return b[0];
      }
    }
    return [0, n];
  }

  // WHICH BAND A BODY IS IN, WHEN A BODY HAS MORE THAN ONE GAIT.
  //
  // `walkBand` answers "which frames are the default cycle" and every body in
  // the library was content with that until the Vanguard, which carries two
  // gaits in one mesh: it DASHES the opening 400 u.l. and BOUNDS the rest of
  // the road (the owner, 2026-08-26 -- "an explosive burst of speed, a dash ...
  // then transition to a bouncing attack run at normal speed"). Both are baked,
  // both are distance-driven, and the only thing left to decide per frame is
  // which one is playing.
  //
  // A PREDICATE AND NOT A FLAG NAME, WHICH IS THE ONE PLACE THIS TABLE DIFFERS
  // FROM `ENEMY_VARIANT` NEXT DOOR. A variant is chosen off a stored fact, so
  // that table can name a field. This is not a stored fact: `isSprinting()` is
  // `progress < ul(sprint.untilUl)`, a comparison against WHERE ON THE MAP the
  // body is, and js/enemy.js keeps it as a function on purpose so the 2D wake,
  // the tests and this all ask the same question rather than three copies of
  // the comparison. Caching it into a field would be a fourth copy and the one
  // most likely to go stale.
  //
  // FALLS BACK TO THE DEFAULT BAND, never to a missing one: a type with no row,
  // a body whose mesh declares one band, or a predicate that asks for a band
  // this model does not have all end up drawing band 0, which is the gait the
  // exporter promises is there. See `vanguard` in tools/glb_to_model.py for why
  // band 0 is the BOUND and not the dash -- a fallback should be the common
  // case, and the dash is over 400 u.l. into a route thousands long.
  var ENEMY_GAIT_BAND = {
    boss_fast: function (e) {
      return (e.isSprinting && e.isSprinting()) ? 1 : 0;
    }
  };

  function gaitBand(m, e) {
    var pick = e ? ENEMY_GAIT_BAND[e.typeId] : null;
    if (!pick) return walkBand(m);
    var want = pick(e);
    if (!want) return walkBand(m);
    var n = (m && m.frames.length) ? m.frames.length : 1;
    var b = m && m.bands;
    var row = (b && b.length > want) ? b[want] : null;
    if (row && row.length === 2 &&
        typeof row[0] === "number" && typeof row[1] === "number" &&
        row[0] >= 0 && row[1] > 0 && row[0] + row[1] <= n) {
      return row;
    }
    return walkBand(m);
  }

  // A drive value -- cycles completed -- reduced into a band. Non-negative by
  // construction here (`progress` and `boardClock` never go below zero), so the
  // single `%` is enough and matches what drawActor's own reduction did to the
  // unbounded index this replaces. That is what makes the absent case
  // bit-identical rather than merely equivalent.
  function bandFrame(band, drive) {
    return band[0] + (Math.floor(drive * band[1]) % band[1]);
  }

  // THE STRIKE, WHICH IS A MOMENT AND NOT A LOOP.
  //
  // The Hedger is the only body below boss tier that attacks a tower, and until
  // now it did that with no animation at all. It is NOT a band. The walk is
  // distance-driven -- one cycle per stride, so a planted foot stays on one
  // patch of road -- and a band would REPLACE that cycle, stopping the legs
  // dead in the road every time the body swung. An `overrides` matrix composes
  // with the baked frame instead (see overrideMat above), so the gait carries
  // on underneath and the strike cannot fight it by construction.
  //
  // AND THE BODY DOES NOT STOP TO SWING. `currentSpeedUlps` returns 0 only for
  // `rooted`, `stunTimer` and `windUpTimer`, and `angry` carries no wind-up, so
  // it walks straight through its own 0.4 s window. A band was never viable.
  //
  // DRIVEN BY `attackFlash`. Set to 1 in Enemy.prototype.resolveAttack -- when
  // an attack ACTUALLY RESOLVES -- and decayed at dt * 2.5: one linear 0.4 s
  // ramp per landed blow, and nothing else in the renderer reads it.
  //
  // NOT `attackTimer`, and the difference is the whole design. That counts down
  // every 2.5 s whether or not anything is in reach: `attackTowers` returns
  // without resetting it when no spec has a candidate, so a pose driven off it
  // rears the body up at empty road -- the one state the strike must never
  // appear in -- and it would read as deliberate rather than as a bug.
  //
  // THE GATE IS A CROSSING, NEVER AN EQUALITY. `attackFlash` is decayed by dt,
  // so no sampled frame sees exactly 1; at a fixed 60 Hz it does not land
  // exactly on 0 either (measured: 3.75e-16 at step 24, a true 0 at step 25).
  // `f > 0` opens the window and the curve takes any such residue to rest.

  // ONE RECORD PER MODEL, BECAUSE THE GROUP AND THE PIVOT CANNOT BE UPDATED BY
  // HALVES -- AND BECAUSE THEY FAIL IN OPPOSITE WAYS.
  //
  // A wrong GROUP NAME fails loudly: the lookup misses, `missingGroupOn` fires,
  // and nothing draws. A wrong PIVOT fails SILENTLY -- right group, right
  // moment, right place, and the machine swings about the road instead of about
  // its own axle. That is a plausible picture with the wrong mechanism under it,
  // and no still frame shows it. Keeping the pair in one object is what makes
  // "rename the group and forget the pivot" impossible rather than merely
  // discouraged. `tipCheck` is the instrument that makes the pivot loud: mira's
  // brief states where the tool's tip must ARRIVE, and a wrong pivot puts it
  // somewhere else entirely, so her sign check doubles as a pivot check.
  //
  // THE VALUES ARE mira's, FROZEN, from tools/blender/BRIEF-hedger-tripod-
  // gesture.md section 2 (committed at d2c567f). Not derived here, not tuned
  // here, and not to be adjusted here.
  //
  // THE PIVOT IS NOT THE GROUP ROOT ON THIS BODY, and that is the whole reason
  // this field exists. `mast` carries the drum, which is the model's TALLEST
  // geometry, so its root has to sit at z = 0 or `model.top` -- max z over the
  // RAW positions array -- would not see it and the health bar would be painted
  // through the machine permanently. So the root is at the road and the axle is
  // at the drum's centre, 0.80 u up, and the difference between those two is
  // supplied here.
  //
  // THE SIGN IS A PROPERTY OF THE PART. mira's rule is "a POSITIVE rotation
  // about local Y takes local +x toward local -z", which is exactly what
  // GLMath.localPose does, and the bill projects FORWARD along +x -- so +34
  // degrees sends the tip down and slightly back into the machine, which is the
  // stroke. Verified against her authored arrival point rather than reasoned:
  // the tip vertex sits at local (0.524, 0, ~0.800), 0.520 u out along +x from
  // the pivot, and rotating that by +34 degrees puts it at
  // (0.431, 0.509) -- her table's two numbers to three decimals.
  // 0.8004 AND NOT THE BRIEF'S 0.80, AND IT IS NOT A TYPO TO TIDY UP.
  // `tools/blender/enemy_hedger.py:196` derives it as `MAST_PIVOT_Z = 0.870 * F`
  // with `F = 0.920`, because the pivot's whole justification is that it IS the
  // drum's centre and the drum is authored at 0.87F. The brief's 0.80 and
  // 0.87F agree only if F were 0.9195. The difference is 0.016 board px at this
  // body's sizeScale -- two hundredths of a pixel, invisible -- so this is
  // written down purely so that if the figure height ever moves, the pivot
  // moves with it instead of staying at a literal that used to be right.
  var STRIKE_BY_MODEL = {
    // A RECOIL, NOT A STROKE -- AND THE DOWN-STROKE'S CONSTANTS ARE DELETED
    // RATHER THAN ZEROED.
    //
    // hugo ruled the implement is a gun, so the gesture is re-authored: the
    // mast pitches UP and rides BACK, instead of a bill coming down. `swing`
    // and `tipCheck` retire with the stroke they described. They are removed
    // outright, not set to zero, because a zeroed rotation draws a
    // flawless-looking REST POSE -- the body draws, every control passes, the
    // wrap is clean, and nothing reports a fault. That failure was demonstrated
    // on this seam tonight, from a probe that wrote a swept value back through
    // what looked like a getter. If this record ever loses its group again, the
    // loud path is wanted, never a silent identity matrix.
    //
    // WHY NO ANGLE COULD HAVE SAVED THE STROKE. `check_strike_penetration.py`
    // walks the COMPOSED pose over all 12 walk frames -- the pose no baked-frame
    // gate can see -- and finds first real contact between 7 and 8 degrees,
    // between the mast's holder and a thigh. The curve is monotonic at
    // ~0.0063 u/deg with no local maximum, so the largest clean angle is 7
    // degrees, which is not a stroke. Do not re-tune a rotation here expecting
    // to resolve it: the down-stroke was retired, not shrunk.
    //
    // THE PIVOT IS NOT THE GROUP ROOT, WHATEVER IT GETS CALLED. Measured on the
    // shipped mesh, `mast`'s frame-0 root translation is (0.0000, 0.0000,
    // 0.0000) -- it is at the ROAD, and it has to be, because `mast` carries the
    // drum, which is the model's tallest geometry, and `model.top` is max z over
    // the RAW positions array. An elevated root would take the health bar with
    // it. 0.8004 is the DRUM'S CENTRE, `0.870 * F` with `F = 0.920` from
    // `tools/blender/enemy_hedger.py:196`. Calling it "the mast root" is the one
    // slip that would invite someone to simplify this to [0, 0, 0], which is the
    // real root and the wrong axle -- silently, since a pivot error draws a
    // plausible picture with the wrong mechanism under it.
    //
    // THE SIGN IS DERIVED, NOT TAKEN FROM THE WORD "UP". `GLMath.localPose`
    // maps (x, z) -> (cos*x + sin*z, -sin*x + cos*z), so a POSITIVE rotation
    // takes local +x toward local -z, i.e. DOWN. The bill projects along +x, so
    // pitching it UP is NEGATIVE. Checked against the measured tip rather than
    // asserted: the tip face centroid sits 0.5188 u out and 0.0050 u above the
    // pivot, and -10 degrees lifts it from z 0.8054 to 0.8641 while +10 would
    // drive it to 0.7466.
    //
    // ROTATE FIRST, THEN DISPLACE -- and this seam gets that order for free,
    // which is worth stating because getting it backwards produces a picture
    // that looks entirely correct and puts solid through solid. Pitching first
    // lifts the drum's rear underside clear of the hub band; sliding first
    // sweeps through it. `localPose` applies (tx, ty, tz) AFTER its pivot
    // correction, so one call is exactly `Translate . RotateAboutPivot` and
    // there is no composition order left to get wrong. It is deliberately NOT
    // built as two matrices multiplied together.
    //
    // 10 DEGREES, NOT THE 6.5 FIRST SPECIFIED, and the reason generalises: 6.5
    // was the lowest swept value plus a margin, and a margin assumes more pitch
    // means more clearance. This clearance surface is NOT monotonic, so 6.5 was
    // not a margin, it was an untested point sitting above a tested one. 10 is
    // already swept and clear beyond 0.50 u. Both numbers are art direction's;
    // neither is the renderer's to tune.
    //
    // Cost: 1.5 board px of the 10 board px health-bar pad, against the 4.1 the
    // down-stroke was spending.
    //
    // ---- VALIDATION STATUS: THIS POSE IS OUTSIDE EVERY BAKED GATE ----------
    //
    // Nothing exports this pose. It is composed here at draw time from
    // `attackFlash`, so `check_penetration.py`, `check_group_gait.py` and every
    // other instrument that walks the exported `frames` array reports CLEAN on
    // it and always will -- correctly, and uninformatively. They are not broken
    // and they are not evidence. **`tools/blender/check_strike_penetration.py`
    // is the only instrument that sees this pose at all.**
    //
    // LAST VALIDATED AT: nothing. The 10 degree pitch and the 0.12 u slide are
    // art direction's landed values and suki's run against this exact motion --
    // pitch first, then slide, in that order -- has not come back. **No
    // compliance claim is made here and none should be added until it does.**
    // If the run is dirty the PITCH moves and only the pitch: the slide, the
    // pivot, the group and the acceptance check all stand.
    //
    // The angles that HAVE been measured, on the down-stroke this replaces, by
    // that script, over all 12 walk frames:
    //
    //     2-7 deg    boxes overlap, PHANTOM      0 real triangle pairs
    //     8 deg      REAL                        1
    //     17 deg     REAL                        2    <- shipped, as a
    //                                                    DECLARED violation
    //     34 deg     REAL                        5
    //
    // 17 degrees shipped as a **declared** violation rather than a discovered
    // one, held only because 34 is measurably worse, and that distinction is
    // recorded here deliberately: the two look identical in a diff and are
    // completely different decisions.
    //
    // AND THE TRAP IN THAT TABLE, which generalises past this file: **box
    // overlap is NECESSARY, NOT SUFFICIENT.** From 2 to 7 degrees the bounding
    // boxes intersect and not one triangle does. A gate that reported box hits
    // as violations would have called a clean body dirty across a five-degree
    // band -- a check that cannot return the right answer, in the direction
    // that looks like diligence.
    "enemy-angry": { group: "mast", pivot: [0, 0, 0.8004],
                     pitch: -0.1745329, slide: -0.12 }
  };

  // ONE SCRATCH MATRIX AND ONE SCRATCH OBJECT, allocation-free per frame. Both
  // are safe only because `drawActor` consumes them SYNCHRONOUSLY, on the line
  // after the call, before any other body reaches here -- the same contract the
  // instance and group matrices above already run on. If the enemy draw is ever
  // batched or deferred, this becomes a silent aliasing bug of exactly the kind
  // GLMath.multiply carries its own warning about, and every striking body will
  // wear the last one's pose.
  //
  // `strikeKey` exists so a model whose group is named differently cannot
  // inherit a stale key: the object is reused, so leaving `crank` on it while
  // writing `mast` would hand a `crank`-bearing body a matrix built for another
  // machine's pivot.
  var strikeMat = new Float32Array(16);
  var strikeOverrides = {};
  var strikeKey = null;

  // THE MODELS THAT DO NOT CARRY THE GROUP, REPORTED RATHER THAN IGNORED.
  //
  // `drawActor` looks the override up by NAME and silently skips a miss, so a
  // body whose mesh lacks the group draws its plain walk -- pixel-for-pixel
  // indistinguishable from a body that has not attacked. That is the soft
  // failure that let four model-viewer exports stay undefined past their own
  // author's commit, guarded by `typeof` at every call site, drawing a
  // plausible picture of the wrong thing. Warn once per model, and publish the
  // list through `strikeSeam()` so a test can assert it is EMPTY.
  var strikeMissing = {};

  // The last matrix the strike actually built, published for the pivot check.
  // A test that re-derives the matrix from the same constants agrees with
  // itself and proves nothing; this is the one the renderer used.
  var strikeLast = null;

  function strikeOf(e, model) {
    // The early out every body on the board takes: one property read and a
    // compare.
    var f = e ? e.attackFlash : 0;
    if (!(f > 0)) return null;
    var spec = model ? STRIKE_BY_MODEL[model] : null;
    if (!spec) return null;
    var m = GLModels.get(renderer, model);
    var has = false;
    if (m) {
      for (var g = 0; g < m.groups.length; g++) {
        if (m.groups[g].name === spec.group) { has = true; break; }
      }
    }
    if (!has) {
      if (!strikeMissing[model]) {
        strikeMissing[model] = true;
        if (typeof console !== "undefined" && console.warn) {
          console.warn("World3D: '" + model + "' has no '" + spec.group +
            "' group -- its strike will draw as a plain walk.");
        }
      }
      return null;
    }
    // BOTH CHANNELS LINEAR IN THE SAME DRIVE, on art direction's instruction
    // and against my own first draft, which eased the recovery. `pitch * f` and
    // `slide * f` and nothing else: `attackFlash` is already a linear 1 -> 0
    // ramp over 0.400 s, so the whole gesture is two multiplications. There is
    // no anticipation channel and that is not a compromise -- a machine does not
    // wind up to absorb a recoil, and frame 0 of the window is the FULL recoil
    // because the shot has already happened.
    //
    // Keeping it linear is also what makes the drive an instrument: because the
    // pose is exactly proportional to the flash, SWEEPING THE FLASH SWEEPS THE
    // GESTURE, and a probe needs no write access to any constant here. The
    // shoot asserts that proportionality at flash 1, 0.5, 0.25, 0.1, 0.05 and
    // 0.02 -- the low points included precisely because the easing this
    // replaced lived in the TAIL, where the first three would not have seen it.
    //
    // ONE localPose CALL, DELIBERATELY, NOT TWO MATRICES MULTIPLIED. It applies
    // (tx, ty, tz) after its own pivot correction, so this IS
    // `Translate . RotateAboutPivot` -- rotate first, then displace -- and there
    // is no composition order left for anyone to get backwards. See the record
    // above for why that order is load-bearing rather than cosmetic.
    GLMath.localPose(strikeMat, spec.pivot, 0, spec.pitch * f, 0,
      spec.slide * f, 0, 0);
    strikeLast = { model: model, flash: f, group: spec.group };
    if (strikeKey && strikeKey !== spec.group) delete strikeOverrides[strikeKey];
    strikeKey = spec.group;
    strikeOverrides[spec.group] = strikeMat;
    return strikeOverrides;
  }

  // --- THE VANGUARD'S SHIELD, THROWN ON THE ROAD AND PULLED BACK ------------
  //
  // The owner's brief, 2026-08-26: "the fragments of shield you see must be
  // modeled as to be shooting outwards, and then drop to the floor from the
  // shields that are broken in the shielded model. they will stay there for 3
  // seconds, then in the last 4 seconds, they start flying back to the
  // vanguard, as if attracted to him magnetically and form the shield again, to
  // complete the 7 second cooldown."
  //
  // WHY THIS IS AN OVERRIDE AND NOT BAKED FRAMES, which is the same argument
  // the Hedger's strike makes one section up and a stronger version of it. A
  // baked frame is a pose in the MODEL's own space, so a fragment baked onto
  // the floor travels down the road with the boss -- and this boss is the
  // fastest thing in the game, 175 u.l./s for its opening stretch. Over the
  // three seconds the brief asks the fragments to lie still it covers 525 u.l.
  // A shard that follows it is not lying on the floor, it is being carried.
  //
  // So the drop point is frozen in WORLD space at the moment of the break --
  // `Enemy.prototype.breakShield` records the position and heading, and nothing
  // else needs storing -- and every frame this converts that fixed point back
  // into the body's current model space. The shards really are left behind, and
  // the flight home really does cross the ground the boss gained. Nothing is
  // integrated and nothing accumulates: hand this function the same enemy at
  // the same progress twice and it draws the same thing.
  //
  // THE THREE PHASES ARE SHARES OF THE GAP, NOT SECONDS. `shieldReformProgress`
  // is 0 at the break and 1 on the frame the shield returns, whenever that is,
  // so the reassembly lands exactly on the pulse that refills the pool. At the
  // Vanguard's full seven-second cadence the shares below ARE the brief's 0.9 /
  // 3 / 4; a shield broken two seconds before its own pulse gets the same
  // picture in two seconds rather than a picture that finishes after the shield
  // is already back.
  var SHARD_MODEL = "enemy-boss_fast-shattered";
  // The throw. 0.9 s of the seven, which is long enough to read as a launch and
  // short enough that the fragments are down well inside the three seconds the
  // brief gives them to lie there.
  var SHARD_THROW = 0.9 / 7;
  // When they stop lying still. The brief's three seconds, measured from the
  // break and not from the landing -- "they will stay there for 3 seconds, then
  // in the last 4 seconds" is one seven-second window split once.
  var SHARD_SETTLED = 3 / 7;
  // How far out they are thrown, in MODEL units, plus a per-shard spread. The
  // body is 1.298 units tall, so 1.55 is a little over a body length -- about
  // 94 board px at this type's own size, which is two and a half times its own
  // radius and clearly "off the boss" rather than "beside it".
  var SHARD_BURST = 1.55;
  var SHARD_SPREAD = 0.55;
  // The arc. Up out of the shield, then down under its own weight: the
  // horizontal channel eases OUT (fast off the body, slowing) and the vertical
  // one eases IN (a u-squared fall), which between them is a ballistic curve
  // without integrating one.
  var SHARD_POP = 0.42;
  // The return is a MAGNET and not a throw reversed, so it is cubed rather than
  // eased: almost nothing for the first half of the four seconds, then a rush.
  // A shard that drifts home at a constant rate reads as floating.
  var SHARD_PULL = 3;
  // Off the floor on the way in, and a shiver while the field takes hold of
  // something that is still lying still. Both small -- 0.30 units is 18 board
  // px of lift and 0.03 is under two.
  var SHARD_HOME_LIFT = 0.30;
  var SHARD_SHIVER = 0.03;
  // Roughly one turn over the throw, held through the rest, unwound to nothing
  // by the time the shard is home -- so it locks back into the ring square
  // rather than at whatever angle it happened to stop at.
  var SHARD_TUMBLE = 5.5;

  // A HASH OF THE SHARD'S OWN INDEX, so every fragment differs and none of them
  // differs between two runs of the same board. There is no per-shard state
  // anywhere in this system and this is what pays for that: spread, tumble axis
  // and shiver phase are all read out of the name.
  function shardNoise(index, salt) {
    var h = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
    return h - Math.floor(h);
  }

  // The fragments of one model, measured once. `home` is the group's own
  // centroid in model space -- which is also the point tools/glb_to_model.py's
  // `vanguard_pivot_of` gave it, arrived at from the geometry rather than
  // carried across, so the two cannot disagree about where a shard's centre is.
  // `sit` is how far that centre stands above the shard's lowest point, which
  // is what puts a dropped fragment ON the road instead of half inside it.
  function shardsOf(model) {
    var cached = typePrims["shards:" + model];
    if (cached) return cached;
    var m = GLModels.get(renderer, model);
    var list = [];
    if (m) {
      for (var g = 0; g < m.groups.length; g++) {
        var grp = m.groups[g];
        if (!grp.count || grp.name.indexOf("shard_") !== 0) continue;
        var sx = 0, sy = 0, sz = 0, low = Infinity;
        for (var v = grp.first; v < grp.first + grp.count; v++) {
          var x = m.positions[v * 3], y = m.positions[v * 3 + 1],
              z = m.positions[v * 3 + 2];
          sx += x; sy += y; sz += z;
          if (z < low) low = z;
        }
        var n = grp.count;
        var index = parseInt(grp.name.slice(6), 10) || 0;
        var home = [sx / n, sy / n, sz / n];
        list.push({
          name: grp.name, home: home, sit: home[2] - low,
          spread: shardNoise(index, 1),
          // Mostly about Z, which is what keeps a settled fragment lying FLAT
          // on the road: a full free tumble would leave some of them standing
          // on edge, and `sit` -- measured on the rest pose -- would then be
          // the wrong height to put them at.
          ax: 0.35 * (shardNoise(index, 2) * 2 - 1),
          ay: 0.35 * (shardNoise(index, 3) * 2 - 1),
          turn: 0.7 + 0.6 * shardNoise(index, 4),
          phase: shardNoise(index, 5) * Math.PI * 2,
          mat: new Float32Array(16)
        });
      }
    }
    typePrims["shards:" + model] = list;
    return list;
  }

  // Reused across frames and across bodies. Safe for exactly the reason
  // `strikeOverrides` is: drawActor consumes it SYNCHRONOUSLY on the next line.
  // The keys are the same ten group names every frame, so nothing needs
  // clearing between calls.
  var shardOverrides = null;

  // `scale` IS THE INSTANCE SCALE, NOT THE MODEL-TO-PIXEL FACTOR, and mixing
  // the two is the one arithmetic mistake this function can make silently.
  // `drawActor` draws a body at `m.unitsToPx * scale` board px per model unit;
  // `scale` alone is `radiusPx() / 11`, which is 1.9 on this boss against a
  // real factor of 60.4. Fed the wrong one, every drop point lands about a
  // pixel from the machine's own feet -- the shards still throw, still settle
  // and still come home, so nothing looks broken, it just looks like nothing
  // happened. Found exactly that way on the real board.
  function shardPose(e, model, yaw, scale, lift) {
    if (model !== SHARD_MODEL) return null;
    if (!e || typeof e.shieldReformProgress !== "function") return null;
    var t = e.shieldReformProgress();
    // -1 is "no gap to be through", and 0 is the frame the shield went. See
    // the method: the test is on the sign, never on truthiness.
    if (t < 0) return null;
    var at = e.shieldBreakAt;
    if (!at) return null;
    var list = shardsOf(model);
    if (!list.length) return null;
    if (!shardOverrides) shardOverrides = {};
    // Board px per model unit, the same product drawActor forms.
    var size = GLModels.unitsToPx(model) * scale;
    if (!(size > 0)) return null;

    // The inverse of the instance matrix's rotation, so a fixed world point can
    // be expressed in the body's own space this frame; and the break-time
    // rotation, which is where the drop points were laid down.
    var cos = Math.cos(yaw), sin = Math.sin(yaw);
    var ac = Math.cos(at.yaw), as = Math.sin(at.yaw);

    for (var i = 0; i < list.length; i++) {
      var sh = list[i];
      var home = sh.home;

      // OUTWARD IS RADIAL FROM THE BODY'S OWN AXIS, measured off the fragment's
      // rest position rather than chosen: the artist scattered these around a
      // ring, so each one already knows which way "off the shield" is. A
      // fragment sitting on the axis has no radial direction and is thrown
      // forward instead of dividing by zero.
      var rx = home[0], ry = home[1];
      var r = Math.sqrt(rx * rx + ry * ry);
      if (r < 1e-4) { rx = 1; ry = 0; r = 1; }
      var out = SHARD_BURST + SHARD_SPREAD * sh.spread;
      var mx = home[0] + rx / r * out;
      var my = home[1] + ry / r * out;

      // Where it lands, in board space, frozen at the break.
      var dx = at.x + (mx * ac - my * as) * size;
      var dy = at.y + (mx * as + my * ac) * size;
      var dz = groundHeightAt(dx, dy) + sh.sit * size;

      // ...and back into the model space of the body as it stands NOW. This is
      // the whole trick: the offset grows on its own as the boss runs away from
      // its own wreckage, with nothing tracking the distance.
      var ox = dx - e.pos.x, oy = dy - e.pos.y;
      var tx = (ox * cos + oy * sin) / size - home[0];
      var ty = (oy * cos - ox * sin) / size - home[1];
      var tz = (dz - lift) / size - home[2];

      var px, py, pz, spin;
      if (t < SHARD_THROW) {
        var u = t / SHARD_THROW;
        var fly = 1 - (1 - u) * (1 - u);
        px = tx * fly;
        py = ty * fly;
        pz = tz * u * u + SHARD_POP * Math.sin(Math.PI * u);
        spin = SHARD_TUMBLE * u;
      } else if (t < SHARD_SETTLED) {
        px = tx; py = ty; pz = tz;
        spin = SHARD_TUMBLE;
      } else {
        var v = (t - SHARD_SETTLED) / (1 - SHARD_SETTLED);
        var pull = Math.pow(v, SHARD_PULL);
        var shiver = SHARD_SHIVER * (1 - v) *
          Math.sin(v * 26 + sh.phase);
        px = tx * (1 - pull) + shiver;
        py = ty * (1 - pull) - shiver;
        pz = tz * (1 - pull) + SHARD_HOME_LIFT * Math.sin(Math.PI * v);
        spin = SHARD_TUMBLE * (1 - pull);
      }

      var turn = spin * sh.turn;
      GLMath.localPose(sh.mat, home, turn * sh.ax, turn * sh.ay, turn,
        px, py, pz);
      shardOverrides[sh.name] = sh.mat;
    }
    return shardOverrides;
  }

  function drawActor(model, x, y, yaw, scale, lift, frame, overrides, tilt) {
    var m = model ? GLModels.get(renderer, model) : null;
    if (!m) {
      renderer.draw(prims.block, x, y, lift || 0, yaw || 0, 34);
      return;
    }
    var size = m.unitsToPx * (scale || 1);
    // WHAT IS BOLTED TO THE MAP DOES NOT TURN WITH THE WEAPON.
    //
    // A5 is a floating cannon on an installed foundation and B5 is a man
    // chained to four obelisks; the Rifleman fights from behind crates. Those
    // sit on the ground, so they get the instance matrix with the aim taken
    // out -- same position, same scale, yaw zero. GLParts put them at the head
    // of the buffer precisely so this is one extra draw call and no second
    // mesh. See js/gl/gl-parts.js for how they are identified.
    var fixed = m.gpu.fixedVerts || 0;
    var bound = false;
    var fixedGroup = -1;
    // A model re-exported from Blender since export_mesh.py learned about
    // `_world_fixed_child` carries the foundation as a real named group, and
    // needs none of gl-parts' geometry recovery. Both paths draw the same way.
    for (var fg = 0; fg < m.groups.length; fg++) {
      if (m.groups[fg].name === "world_fixed") { fixedGroup = fg; break; }
    }
    if (fixed > 0 || fixedGroup >= 0) {
      renderer.bind(m.gpu);
      bound = true;
      GLMath.modelYaw(fixedMat, x, y, lift || 0, 0, size);
      if (fixed > 0) renderer.drawRange(fixedMat, 0, fixed);
      if (fixedGroup >= 0) {
        renderer.drawRange(fixedMat, m.groups[fixedGroup].first,
          m.groups[fixedGroup].count);
      }
    }

    if (!m.frames.length) {
      instanceOf(instanceMat, x, y, lift, yaw, size, tilt);
      if (!bound) renderer.bind(m.gpu);
      renderer.drawRange(instanceMat, fixed, m.gpu.count - fixed);
      return;
    }
    instanceOf(instanceMat, x, y, lift, yaw, size, tilt);
    var pose = m.frames[((frame | 0) % m.frames.length + m.frames.length) %
      m.frames.length];
    if (!bound) renderer.bind(m.gpu);
    for (var g = 0; g < m.groups.length; g++) {
      var grp = m.groups[g];
      if (!grp.count) continue;
      if (g === fixedGroup) continue;         // already drawn, without the yaw
      var first = grp.first, count = grp.count;
      // The unnamed group is the one GLParts partitioned; its map-fixed head
      // has already been drawn, so this draws only the remainder.
      if (g === 0 && fixed > 0) {
        first += fixed;
        count -= fixed;
        if (count <= 0) continue;
      }
      var pg = pose[g];
      var base = pg ? GLMath.multiply(groupMat, instanceMat, pg) : instanceMat;
      var ov = overrides ? overrides[grp.name] : null;
      renderer.drawRange(ov ? GLMath.multiply(overrideMat, base, ov) : base,
        first, count);
    }
  }

  // --- interface that lives in world space ---------------------------------
  //
  // Drawn on the 2D canvas, positioned by the camera. Screen-space on purpose:
  // a health bar that shrank with distance or tilted with the board would be a
  // worse bar, and none of these are physical objects.

  // EVERY CALL RETURNS ITS OWN POINT, and that is not an oversight.
  //
  // This used to project into one shared scratch object. `worldToScreen` writes
  // into whatever it is handed and returns it, so two calls returned THE SAME
  // OBJECT -- and almost everything here holds two points at once: a streak's
  // head and tail, a beam's muzzle and head, the four corners of a light
  // column. Every one of those collapsed to a zero-length line the moment the
  // second call overwrote the first. Sparks drew as bare dots and the debris
  // fan drew nothing at all, which looked like a design choice rather than a
  // bug for exactly as long as nobody held three points.
  //
  // A few hundred tiny objects a frame is nothing next to the gradients and
  // colour strings this file already builds per shot.
  // EVERY z IN THIS LAYER IS A HEIGHT ABOVE THE BOARD, NOT ABOVE ZERO.
  //
  // Range rings, charge circles, muzzle anchors, beam endpoints, impact debris
  // and hover-card crowns are all expressed as "so far up from the thing this
  // is attached to". They were projected against the z = 0 plane, which was
  // correct only while the board was flat and every actor stood at zero.
  //
  // Once actors were stood on the surface under them, a tower on a 9.4 deck
  // rose and its own charge ring, muzzle flash and beam stayed on the floor
  // below it -- reported as "les effets, bullets laser charges ne montent pas
  // avec le modele de la tour". Adding the ground height here fixes all of them
  // at once, because they all come through this one function, and it keeps
  // being right for anything added later.
  //
  // The lookup is 0.093 microseconds; a 44-segment ring pays 4 of them.
  //
  // BUT ONLY THINGS LYING ON THE GROUND MAY SAMPLE IT PER POINT. A range ring
  // should drape over a deck edge. A rail cannon should not: its coils, muzzle
  // and discharge are spread along a barrel that overhangs that same edge, and
  // sampling under each of them bent the weapon's own hardware into a curve.
  // A shot in flight is worse -- it inherited the terrain profile and flew a
  // ski jump. The owner's words: "the effects and the bullets follow the curve,
  // it's funny but very unrealistic".
  //
  // So a caller that owns ONE object pins the reference height for everything
  // it draws. Inside `withGround` every z is measured from that one surface, so
  // hardware stays rigid and a shot flies a straight line, angled between the
  // height it left and the height it is going to.
  var groundRef = null;

  // One-shot, so a missing js/visuals.js announces itself once rather than
  // sixty times a second. See the hovered-enemy block in drawOverlays.
  var warnedNoVisuals3Q = false;

  function withGround(z, fn) {
    var prev = groundRef;
    groundRef = z;
    try { fn(); } finally { groundRef = prev; }
  }

  function project(x, y, z) {
    var g = (groundRef !== null) ? groundRef : groundHeightAt(x, y);
    return camera.worldToScreen(x, y, g + (z || 0), null);
  }

  // WHAT THE SUMMONER'S EFFECT MODULES ARE HANDED.
  //
  // `project`, `withGround` and `groundHeightAt` live inside this closure and
  // there is no other way to reach them, so js/gl/blub-projectiles.js takes
  // them through an object. Built ONCE, beside the other module-level tables,
  // because a fresh literal per frame is the only allocation the bridge would
  // otherwise have -- and it is passed on every one of three hundred blubs'
  // worth of drawing. The field is named `groundAt` because that is the name
  // that file asks for.
  //
  // `towerTop` / `enemyTop` were added for the Siphon's cords: a 2D overlay has
  // no depth buffer, so anything drawn on it has to mask itself by hand against
  // the bodies on the GL canvas, and the height of a body is the one number a
  // screen-space occluder cannot invent. They are function DECLARATIONS further
  // down this closure and therefore hoisted, so naming them here is safe.
  var BLUB_FX_API = {
    project: project,
    withGround: withGround,
    groundAt: groundHeightAt,
    towerTop: towerTop,
    enemyTop: enemyTop
  };

  // Projected per point rather than through camera.groundCircle, for the same
  // reason: groundCircle solves against the flat z = 0 plane and cannot know
  // that half of a range ring is lying on a raised deck. Per point, a ring
  // drapes over the edge it crosses instead of cutting through it.
  function ringPath(ctx, x, y, radius, segments) {
    var n = segments || 44;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = Math.PI * 2 * i / n;
      var p = project(x + Math.cos(a) * radius, y + Math.sin(a) * radius, 0.4);
      if (!p) return false;
      pts.push(p.x, p.y);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    return true;
  }

  // Part of a circle on the ground, projected per point like the full ring.
  // A countdown that lies on the board rather than facing the camera.
  function drawGroundArc(ctx, x, y, radius, from, to, stroke, width) {
    var steps = Math.max(6, Math.round(Math.abs(to - from) / (Math.PI * 2) * 48));
    ctx.beginPath();
    for (var i = 0; i <= steps; i++) {
      var a = from + (to - from) * (i / steps);
      var p = project(x + Math.cos(a) * radius, y + Math.sin(a) * radius, 0);
      if (!p) return;
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width || 2;
    ctx.stroke();
  }

  // THE SPRINT WAKE -- "energy trails emphasizing the acceleration".
  //
  // A body with a `sprint` block on its type runs its opening stretch faster
  // than anything else in the game and then never again, and the 2D board has
  // drawn a wake behind it since the type existed (Enemy.prototype.draw) for a
  // reason that is teaching rather than decoration: the player has to be able
  // to SEE where the burst ends, or "it arrived early" is the only evidence
  // they ever get. The 3D board drew nothing, so the one state change the
  // Vanguard announces about itself was invisible on the board the game
  // actually ships.
  //
  // GENERIC, AND KEYED ON `isSprinting()` LIKE EVERYTHING ELSE. Nothing here
  // names the Vanguard; a second type with a `sprint` block gets the wake with
  // no edit, exactly as it would get the 2D one.
  //
  // THREE LANES RATHER THAN ONE, which is the whole difference from the flat
  // 2D stroke. A wake at a single height reads as a shadow on a board with a
  // camera above it; three at different heights up the body read as air coming
  // off a thing that is moving, and they are cheap -- two projected points and
  // one gradient each.
  //
  // FROM THE HEADING, NOT FROM THE PATH, and the 2D wake's comment is the
  // reason: the index screen parks a body at an arbitrary card position with
  // its `progress` still 0, and a wake sampled off the path there is a stray
  // line running to the mouth of the road.
  //
  // THE TYPE'S OWN COLOUR, so the two boards say the same thing about the same
  // body and so the trail belongs to the enemy the hover card describes rather
  // than to whatever palette its mesh happened to import with.
  // 78 u.l., WHICH IS DELIBERATELY LONGER THAN THE 2D BOARD'S 26. That wake is
  // a flat stroke on a flat board and 26 reads there; this one is projected
  // under an elevated camera, so a length in world units is foreshortened to
  // roughly half of itself on screen -- and the near half of it is BEHIND the
  // machine, which is 78 board px tall. Measured on the real page at 34: the
  // streak was 54 screen px, of which the body covered most. What is drawn has
  // to be long enough to leave the silhouette.
  var WAKE_ULS = 78;                       // how far back the streak reaches
  var WAKE_LANES = [0.20, 0.52, 0.84];     // shares of the body's own height
  var WAKE_HZ = 11;                        // flicker, so it reads as energy
  // The streak STARTS behind the body rather than at its centre, for the same
  // reason: a gradient whose hot end is inside the mesh spends its brightest
  // stop on pixels the depth buffer already owns.
  var WAKE_LEAD = 0.55;                    // radii back from the body's point

  function drawSprintWake(ctx, e) {
    if (typeof e.isSprinting !== "function" || !e.isSprinting()) return;
    var heading = (e.path && e.path.tangentAt)
      ? e.path.tangentAt(e.progress) : null;
    if (!heading) return;
    var radius = e.radiusPx ? e.radiusPx() : 11;
    var top = enemyTop(e);
    var tint = e.color || { r: 255, g: 200, b: 120 };
    var rgb = tint.r + "," + tint.g + "," + tint.b;
    var back = ul(WAKE_ULS);

    for (var i = 0; i < WAKE_LANES.length; i++) {
      // Each lane flickers on its own phase and none of them ever reaches
      // zero length, so the wake breathes instead of blinking out.
      var beat = 0.72 + 0.28 *
        Math.sin(boardClock * WAKE_HZ + i * 2.1);
      var reach = back * beat;
      var lead = radius * WAKE_LEAD;
      var z = top * WAKE_LANES[i];
      var head = project(e.pos.x - heading.x * lead,
        e.pos.y - heading.y * lead, z);
      var tail = project(e.pos.x - heading.x * (lead + reach),
        e.pos.y - heading.y * (lead + reach), z * 0.78);
      if (!head || !tail) continue;
      var g = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
      // Hot and nearly solid where it leaves the machine, gone by the tail.
      // The middle lane is the brightest: it is the one over the centre of
      // mass and the other two are the spill either side of it.
      var peak = (i === 1) ? 0.80 : 0.52;
      g.addColorStop(0, "rgba(255,255,255," + (peak * 0.85).toFixed(3) + ")");
      g.addColorStop(0.22, "rgba(" + rgb + "," + peak.toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + rgb + ",0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = radius * (i === 1 ? 0.70 : 0.44);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(head.x, head.y);
      ctx.lineTo(tail.x, tail.y);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  function drawGroundRing(ctx, x, y, radius, stroke, fill, width) {
    if (!ringPath(ctx, x, y, radius)) return;
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width || 1.5;
      ctx.stroke();
    }
  }

  // A shockwave: a bright leading edge with a soft wake behind it, drawn on the
  // ground plane so it lies across the board rather than facing the camera.
  //
  // The first version was one translucent disc that grew and faded, which is
  // the cheapest possible impact and reads as exactly that -- a circle
  // appearing. What sells a hit is that the EDGE is the event: a thin bright
  // rim travelling outward, a dimmer ring chasing it, and a scorch that stays
  // behind after both have gone.
  function drawShockwave(ctx, x, y, radius, progress, rgb) {
    var fade = 1 - progress;
    var ease = 1 - Math.pow(1 - progress, 2.2);   // fast out, slow settle
    var lead = radius * (0.18 + 0.82 * ease);

    // The scorch left underneath, fading slowest.
    drawGroundRing(ctx, x, y, radius * 0.55 * ease, null,
      "rgba(" + rgb + "," + (0.16 * fade * fade).toFixed(3) + ")");
    // The wake, trailing the edge.
    drawGroundRing(ctx, x, y, lead * 0.72, "rgba(" + rgb + "," +
      (0.30 * fade).toFixed(3) + ")", null, 2 + 3 * fade);
    // The edge itself, brightest and thinnest.
    drawGroundRing(ctx, x, y, lead, "rgba(255,246,224," +
      (0.85 * fade * fade).toFixed(3) + ")", null, 1 + 2.4 * fade);
  }

  // Spokes thrown out from a hit, on the ground, in the direction things fly.
  // Deterministic from the impact's own seed so a given blast looks the same
  // every frame it is alive instead of shimmering.
  function drawDebrisFan(ctx, impact, progress, rgb) {
    var fade = 1 - progress;
    var spokes = 7;
    ctx.lineCap = "round";
    for (var i = 0; i < spokes; i++) {
      var a = (impact.seed % 360) * Math.PI / 180 + i * (Math.PI * 2 / spokes);
      var inner = impact.radius * (0.25 + 0.75 * progress);
      var outer = inner + impact.radius * 0.30 * fade;
      var p0 = project(x_(impact, a, inner), y_(impact, a, inner), 2);
      var p1 = project(x_(impact, a, outer), y_(impact, a, outer), 2);
      if (!p0 || !p1) continue;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.strokeStyle = "rgba(" + rgb + "," + (0.55 * fade * fade).toFixed(3) + ")";
      ctx.lineWidth = 1 + 1.8 * fade;
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  function x_(impact, angle, r) { return impact.x + Math.cos(angle) * r; }
  function y_(impact, angle, r) { return impact.y + Math.sin(angle) * r; }

  // A WEDGE ON THE GROUND -- what a cone tower's reach actually is.
  //
  // From A4 the Arcane Sniper stops covering a circle and covers a 24 degree
  // arc it is aimed along, and it can be re-aimed. Drawing it as a circle was
  // a lie about where it shoots, and with no wedge on screen there was nothing
  // to aim BY: the panel offered "click a direction" and the board showed
  // nothing to click against.
  //
  // Built as an arc plus two radii, projected per point like every other ground
  // shape here, and swept from an inner radius so a deadzone reads as the hole
  // it is rather than being hidden under the fill.
  function drawGroundCone(ctx, x, y, radius, inner, aim, arcRad,
                          stroke, fill) {
    var steps = Math.max(10, Math.round(arcRad / (Math.PI * 2) * 64));
    var pts = [];
    var i, a, p;
    for (i = 0; i <= steps; i++) {
      a = aim - arcRad / 2 + arcRad * (i / steps);
      p = project(x + Math.cos(a) * radius, y + Math.sin(a) * radius, 0);
      if (!p) return;
      pts.push(p.x, p.y);
    }
    for (i = steps; i >= 0; i--) {
      a = aim - arcRad / 2 + arcRad * (i / steps);
      p = project(x + Math.cos(a) * inner, y + Math.sin(a) * inner, 0);
      if (!p) return;
      pts.push(p.x, p.y);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }

  // The reach of one tower, whichever shape it has. One place, so a cone tower
  // and a circle tower can never disagree about what "range" means.
  function drawReach(ctx, t, stroke, fill) {
    // THE WARBRINGER'S REACH IS AN AOE WEDGE, and it was drawing as a plain
    // circle -- which is a lie at every tier below A4, where the swing only
    // covers `arcDegrees` in front of him. It keeps its arc on itself rather
    // than in a `core.stats` block (it predates the config-driven towers), so
    // it needs its own branch instead of falling through to the circle.
    if (typeof t.arcDegrees === "number" && typeof t.swingProgress === "function") {
      if (t.fullCircle) {
        drawGroundRing(ctx, t.x, t.y, t.rangePx, stroke, fill);
      } else {
        drawGroundCone(ctx, t.x, t.y, t.rangePx, 0, t.aim || 0,
          t.arcRadians || (t.arcDegrees * Math.PI / 180), stroke, fill);
      }
      return;
    }
    var stats = t.core && t.core.stats;
    var inner = stats && stats.deadzone ? ul(stats.deadzone) : 0;
    if (stats && stats.targetShape === "cone") {
      var aim = (typeof t.core.aimRad === "number") ? t.core.aimRad : 0;
      drawGroundCone(ctx, t.x, t.y, t.rangePx, inner, aim,
        (stats.coneArcDeg || 30) * Math.PI / 180, stroke, fill);
      return;
    }
    drawGroundRing(ctx, t.x, t.y, t.rangePx, stroke, fill);
    if (inner) {
      drawGroundRing(ctx, t.x, t.y, inner, "rgba(230,140,120,0.5)", null);
    }
  }

  function drawOverlays(ctx, state) {
    if (!enabled) return;
    boardClock = state.now || 0;
    var i;

    // Range, for the tower being asked about -- same rule as 2D: only the one
    // inspected or aiming, never permanent furniture.
    for (i = 0; i < state.towers.length; i++) {
      var t = state.towers[i];
      if (!t.showRange || !t.rangePx) continue;
      drawReach(ctx, t, "rgba(140,199,255,0.55)", "rgba(140,199,255,0.07)");
      // And the footprint, so "where exactly does this thing stand" is
      // answerable from any camera angle. The INSPECTED tower's is amber: that
      // is the panel's colour, and it is the mark that says "this is the one
      // the panel is describing" -- drawInspection used to draw it in screen
      // space, which under this camera put it somewhere the tower was not.
      drawGroundRing(ctx, t.x, t.y, t.footprintPx + 6,
        t === state.inspected ? "rgba(255,215,110,0.9)"
                              : "rgba(180,205,235,0.35)", null,
        t === state.inspected ? 2 : 1.5);
    }

    // THE SUMMONER'S GROUND LAYER, in the order it has to lie in.
    //
    // Everything here is flat on the board, so it goes down before any of the
    // interface below it and in one bottom-to-top order: the stain a body left
    // when it died, then what its neighbours have been throwing at the road,
    // then the circle a NEW body is arriving in -- the freshest event on top of
    // the oldest -- and finally the swarm threads, which are the only thing in
    // the group that is not on the ground at all.
    //
    // AT TOP LEVEL, NOT INSIDE A withGround(): every one of these modules pins
    // its own ground reference per mark, and an outer one would flatten a whole
    // board's worth of decals onto whichever surface happened to be current.
    if (typeof BlubFXSystems !== "undefined") {
      BlubFXSystems.drawDecals(ctx, state);
    }
    if (typeof BlubFXShots !== "undefined") {
      BlubFXShots.drawGround(ctx, state, BLUB_FX_API);
    }
    if (typeof BlubFXCircles !== "undefined") {
      BlubFXCircles.draw(ctx, state);
    }
    if (typeof BlubFXSystems !== "undefined") {
      BlubFXSystems.drawThreads(ctx, state);
    }

    // THE FRACTURED RING UNDER A FULL-CIRCLE WARBRINGER.
    //
    // From A4 he stops turning and covers 360 degrees, and this ring IS that
    // circle -- the model stating its own reach without a range ring being
    // asked for. Drawn here rather than modelled because it has to lie FLAT on
    // whatever tile he stands on, and the map's raised `deck` zones sit 9 px
    // proud of the ground plane: as geometry it was buried under the very tile
    // it was supposed to be splitting.
    //
    // It breathes with the swing, so a Warbringer mid-blow visibly loads the
    // ground before the hammer lands.
    for (i = 0; i < state.towers.length; i++) {
      var wt = state.towers[i];
      if (!warbringerFullCircle(wt)) continue;
      var sw = typeof wt.swingProgress === "function" ? wt.swingProgress() : 0;
      var heat = sw > 0
        ? (sw < 0.9 ? sw / 0.9 * 0.35 : 0.35 + (sw - 0.9) / 0.1 * 0.65) : 0;
      var fr = (wt.footprintPx || 12) * 2.15;
      drawGroundRing(ctx, wt.x, wt.y, fr,
        "rgba(79,227,210," + (0.22 + 0.55 * heat).toFixed(3) + ")",
        "rgba(79,227,210," + (0.03 + 0.10 * heat).toFixed(3) + ")",
        1.5 + 2 * heat);
      // Cracks out of it, deterministic per tower so they do not shimmer, and
      // brighter the moment the hammer is coming down.
      ctx.lineCap = "round";
      for (var ck = 0; ck < 10; ck++) {
        var ca = ck * (Math.PI * 2 / 10) + (wt.x + wt.y) * 0.017;
        var r0 = fr * 0.42, r1 = fr * (0.86 + 0.26 * ((ck * 3 % 4) / 4));
        var q0 = project(wt.x + Math.cos(ca) * r0, wt.y + Math.sin(ca) * r0, 1);
        var q1 = project(wt.x + Math.cos(ca) * r1, wt.y + Math.sin(ca) * r1, 1);
        if (!q0 || !q1) continue;
        ctx.strokeStyle = "rgba(79,227,210," + (0.14 + 0.5 * heat).toFixed(3) + ")";
        ctx.lineWidth = (1 + 1.8 * heat) * q0.scale * 0.5;
        ctx.beginPath();
        ctx.moveTo(q0.x, q0.y);
        ctx.lineTo(q1.x, q1.y);
        ctx.stroke();
      }
      ctx.lineCap = "butt";
    }

    // RE-AIMING A CONE. The tower is waiting for a direction, so the wedge
    // follows the cursor and there is something to aim by -- without it the
    // panel says "click a direction" over a board showing nothing.
    if (state.aimingTower && state.worldMouse) {
      var at = state.aimingTower;
      var stats = at.core && at.core.stats;
      if (stats) {
        var angle = Math.atan2(state.worldMouse.y - at.y,
                               state.worldMouse.x - at.x);
        drawGroundCone(ctx, at.x, at.y, at.rangePx,
          stats.deadzone ? ul(stats.deadzone) : 0, angle,
          (stats.coneArcDeg || 30) * Math.PI / 180,
          "rgba(216,170,255,0.9)", "rgba(196,140,255,0.16)");
        var lab = project(state.worldMouse.x, state.worldMouse.y, 0);
        if (lab) {
          ctx.font = "13px system-ui, sans-serif";
          ctx.fillStyle = "rgba(226,190,255,0.95)";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText("click to aim  ·  Esc to cancel", lab.x, lab.y + 16);
          ctx.textAlign = "left";
        }
      }
    }

    // A STUNNED TOWER HAS TO LOOK STUNNED, or a silent board reads as a bug.
    //
    // B5 pays for its strike with seven seconds of stun, which is a long time
    // to stare at a tower that has simply stopped. A ring alone was not enough
    // -- it looks like any other selection mark -- so the ring now carries a
    // countdown sweep and three sparks orbit the head, which is the shorthand
    // every game uses for "this thing has been knocked out".
    for (i = 0; i < state.towers.length; i++) {
      var st = state.towers[i];
      var stun = st.stunTimer || (st.core && st.core.stunTimer) || 0;
      if (!(stun > 0)) continue;
      var full = (st.core && st.core.stats && st.core.stats.mechanics &&
        st.core.stats.mechanics.activeAbility &&
        st.core.stats.mechanics.activeAbility.stunSeconds) || stun;
      drawGroundRing(ctx, st.x, st.y, st.footprintPx + 5,
        "rgba(255,224,120,0.95)", "rgba(20,22,30,0.35)");
      // The remaining share of the stun, as an arc on the ground.
      var left = Math.max(0, Math.min(1, stun / full));
      drawGroundArc(ctx, st.x, st.y, st.footprintPx + 9,
        -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2,
        "rgba(255,224,120,0.95)", 3);
      // Sparks going round the head.
      var head = project(st.x, st.y, (st.footprintPx || 12) * 3.4);
      if (head) {
        var spin = (state.now || 0) * 5.2;
        for (var k = 0; k < 3; k++) {
          var a = spin + k * Math.PI * 2 / 3;
          var rx = 9 * head.scale, ry = 3.4 * head.scale;
          ctx.fillStyle = "rgba(255,232,150," +
            (0.5 + 0.5 * Math.sin(a)).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(head.x + Math.cos(a) * rx, head.y + Math.sin(a) * ry,
            Math.max(1, 1.6 * head.scale), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // The hovered enemy's REACH, then its hit ring, at exactly the radius that
    // can be pointed at -- the 2D rule: what you see is what you can click.
    // The readout that goes with it is drawn after the bars, so it lands on
    // top of them.
    if (state.hoveredEnemy && !state.hoveredEnemy.dead) {
      var he = state.hoveredEnemy;

      // HOW FAR THIS THING CAN HIT A TOWER FROM. Same rule as a tower's range
      // circle and the same grammar: drawGroundRing, projected per point so it
      // drapes over a raised deck, the reach first and the small ring on top.
      // Only the hue differs -- and it, the alphas and the width all come out
      // of js/visuals.js, which is also the only place that decides WHICH
      // radii exist. Reading `he.attacks` there means the Tyrant's unlocked
      // leap and a retuned Hedger both arrive here with no change in this file.
      //
      // ONE body, not a ring for every body that could be hovered: the camo
      // ground ring already costs ~15 us per body against a health bar's 1 us,
      // and it is the per-body overlay term measured to break first.
      //
      // DELIBERATELY NOT SUPPRESSED IN BUILD MODE. `pointingAtBoard` does not
      // hide hover while a tower type is armed, so hovering an enemy mid
      // placement paints the build ghost's range ring AND this one at once.
      // That is busier, and it is also exactly the question the feature exists
      // to answer: will this thing be able to reach the tower I am about to
      // put here. Two rings answer it; one does not.
      // THE GUARD IS NOW UNEXERCISED, and that is recorded rather than acted
      // on. It was here because dressing.html loaded this file WITHOUT
      // js/visuals.js; that page was deleted with the map surround on
      // 2026-08-14, and every remaining page that loads gl-world.js
      // (index.html, sandbox.html) also loads js/visuals.js. Kept as defence
      // against the next such page, not because one exists -- check before
      // citing this guard as evidence that a page can miss the module.
      //
      // The report below still earns its place: a silent miss here is
      // indistinguishable from the correct output for the twenty of
      // twenty-one enemy types that have no attack at all. So a body that HAS
      // attacks and finds no resolver says so, once, by name.
      if (typeof Visuals3Q !== "undefined" && Visuals3Q.enemyReachesUl) {
        var reaches = Visuals3Q.enemyReachesUl(he);
        for (var ri = 0; ri < reaches.length; ri++) {
          drawGroundRing(ctx, he.pos.x, he.pos.y, ul(reaches[ri]),
            Visuals3Q.ENEMY_REACH_STROKE, Visuals3Q.ENEMY_REACH_FILL,
            Visuals3Q.ENEMY_REACH_WIDTH);
        }
      } else if (!warnedNoVisuals3Q && he.attacks && he.attacks.length) {
        warnedNoVisuals3Q = true;
        console.warn("gl-world: no Visuals3Q.enemyReachesUl -- js/visuals.js " +
          "is not loaded, so enemy reach rings are silently off.");
      }

      var pad = (typeof Enemy !== "undefined" && Enemy.HOVER_PAD_PX) || 4;
      drawGroundRing(ctx, he.pos.x, he.pos.y, he.radiusPx() + pad,
        "rgba(255,215,110,0.9)", null);
    }

    // THE WEAKEN SIGIL, at the feet of every enemy carrying DamageAmp stacks.
    // Immediately before the bars, so a mark that answers "how much more damage
    // does this thing take" never lands on top of the bar that answers a
    // different question.
    if (typeof BlubFXSystems !== "undefined") {
      BlubFXSystems.drawSigils(ctx, state);
    }

    // Health bars, for anything hurt. Recruits included: they are friendly
    // bodies that take damage and die, and the 2D pack drew their bar inside
    // SoldierRecruit.draw -- which the 3D branch replaces, so it went missing.
    // Same treatment as an enemy, because it answers the same question.
    for (i = 0; i < state.towers.length; i++) {
      bar(ctx, state.towers[i], "tower");
      var rec = state.towers[i].recruits;
      for (var k = 0; rec && k < rec.length; k++) {
        if (!rec[k].dead) bar(ctx, rec[k], "recruit");
      }
    }
    // THE CAMO RING, and it is drawn as well as the translucency rather than
    // instead of it.
    //
    // Alpha alone is a SUBTRACTIVE cue: it makes the body harder to see, which
    // is the right fiction and the wrong teaching. Wave 14 is the game's pure
    // camo wave -- the one where a player is meant to work out that some things
    // need detection -- and answering "why can nothing shoot that" with a body
    // that is merely fainter asks them to notice an absence. The ring is
    // ADDITIVE: something is there that is not on any other enemy. The 2D pack
    // pairs the two for exactly this reason and its comment says so; dropping
    // the ring here would have made the 3D board a weaker teacher than the
    // fallback it replaced.
    //
    // Full opacity on purpose, again as in 2D, so the marker survives on a body
    // that is deliberately washed out. Projected with the same ringPath the
    // range and hover rings use, so it sits on the ground in perspective rather
    // than as a screen-space circle pasted over a 3D board.
    for (i = 0; i < state.enemies.length; i++) {
      var ce = state.enemies[i];
      if (!ce.isCamo) continue;
      var cr = (ce.radiusPx ? ce.radiusPx() : 11) + CAMO_RING_PAD;
      ctx.save();
      ctx.setLineDash([4, 4]);
      drawGroundRing(ctx, ce.pos.x, ce.pos.y, cr, CAMO_RING_RGBA, null, 1.5);
      ctx.restore();
    }
    // Behind the bars and behind the bodies' own interface, because it is the
    // only thing in this pass that is not information.
    for (i = 0; i < state.enemies.length; i++) {
      drawSprintWake(ctx, state.enemies[i]);
    }
    for (i = 0; i < state.enemies.length; i++) bar(ctx, state.enemies[i], "enemy");

    // THE SUMMONER'S PERMANENT READOUT (js/blub.js). Its blub count and the
    // charges they add up to are drawn over the tower all run, because the
    // pooled figure is what a player aims a Coagulation with -- and the 2D pass
    // that draws it lives in BlubTower.draw, which this branch replaces. Same
    // gap the recruit hover readout had, same fix: the STRING comes from the
    // tower, and only the placement is done here.
    for (i = 0; i < state.towers.length; i++) {
      var sm = state.towers[i];
      if (typeof sm.counterLabel !== "function") continue;
      var tag = project(sm.x, sm.y, towerCrown(sm) + 14);
      if (!tag) continue;

      var text = sm.counterLabel();
      ctx.font = "600 11px system-ui, sans-serif";
      var tw = ctx.measureText(text).width + 10;
      ctx.fillStyle = "rgba(18,22,20,0.85)";
      ctx.fillRect(tag.x - tw / 2, tag.y - 8, tw, 15);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(160,200,150,0.45)";
      ctx.strokeRect(tag.x - tw / 2 + 0.5, tag.y - 7.5, tw - 1, 14);
      ctx.fillStyle = "#d6efc8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, tag.x, tag.y);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
    }

    // The readouts for whatever is being pointed at, over the bars.
    if (state.hoveredEnemy && !state.hoveredEnemy.dead) {
      drawEnemyCard(ctx, state.hoveredEnemy);
    } else if (state.hoveredRecruit && !state.hoveredRecruit.dead) {
      drawRecruitCard(ctx, state.hoveredRecruit);
    }

    // Tower hardware lighting up, then the shots, then the cosmetic burst --
    // in that order so a blast never buries the one ring the player is
    // actively deciding with.
    // A tower's own hardware is RIGID. Its coils, chambers, muzzle and
    // discharge are spread along a weapon that can overhang a deck edge, so
    // every one of them is measured from the height the TOWER stands at -- not
    // from whatever happens to be under that particular part of the barrel,
    // which bent the weapon into a curve.
    for (i = 0; i < state.towers.length; i++) {
      var fxT = state.towers[i];
      var fxId = fxT.constructor && fxT.constructor.ID;
      withGround(groundHeightAt(fxT.x, fxT.y), (function (t, id) {
        return function () {
          if (id === "longshot") {
            var fxGroup = sniperGroup(t);
            drawSniperCharge(ctx, t, fxGroup, state.now);
            if (fxGroup === "a5") drawKillStacks(ctx, t);
            // From B3 the weapon reloads, and the pips are the only thing that
            // says a tower which has stopped firing is busy rather than broken.
            drawChambers(ctx, t);
          } else if (id === "soldier") {
            drawRiflemanFlash(ctx, t, riflemanGroup(t));
          }
        };
      })(fxT, fxId));
      // A recruit walks its own road and is grounded on its own patch of it,
      // so each one keeps its own reference rather than the tower's.
      if (fxId === "soldier") {
        var rec = fxT.recruits;
        for (var rk = 0; rec && rk < rec.length; rk++) {
          if (rec[rk].dead) continue;
          withGround(groundHeightAt(rec[rk].x, rec[rk].y), (function (r) {
            return function () { drawRecruitFlash(ctx, r); };
          })(rec[rk]));
        }
      }
    }
    // THE SIPHON'S BEAM (js/gl/siphon-beam-draw.js).
    //
    // It was invisible in 3D for a simple structural reason: BeamTower draws its
    // fountain AND its beams inside its own 2D draw(), and game.js wraps the
    // whole 2D world layer -- including the actor draw loop that calls it -- in
    // `if (!world3D)`. With the 3D board on, which is every ordinary load, that
    // method never runs, so the tower whose beam the brief calls "more than half
    // its visual value" had no beam at all.
    //
    // Hardware, not a shot: it is continuous while a lock is held, so it belongs
    // in the hardware pass, under the shots and under the cosmetic burst.
    //
    // Called at TOP LEVEL, outside the per-tower withGround, deliberately. A
    // beam spans TWO ground heights -- the deck the tower stands on and the road
    // the target walks -- so it pins its own reference and feeds project()
    // absolute heights, the same rule a shot in flight follows. Called inside a
    // tower's withGround it would flatten every beam onto that tower's deck and
    // the far end would float.
    if (typeof SiphonFXBeam !== "undefined") {
      SiphonFXBeam.draw(ctx, state, BLUB_FX_API);
    }
    // THE RITUAL CIRCLE, and the LATCH that keeps it from strobing.
    //
    // The owner's report: a Siphon re-acquires many times a second on small
    // groups, and an animation restarted on every acquire flickers. So the
    // circle is the persistent animation -- it spins up once, survives any
    // number of lock drops, and only spins down after IDLE_DWELL_SECONDS of
    // genuine idleness. Its rotation is never reset.
    //
    // Drawn AFTER the beams so the beams read as leaving it, and at top level
    // outside any withGround for the same reason the beams are: the circle
    // floats above the deck the tower stands on and pins its own reference.
    //
    // THIS ORDER WAS TESTED, both ways, on the same three-lock B3 scene:
    // captures/order-A-full.png (this order) against order-B-full.png (circle
    // first). Drawing the circle first is what the ritual module's own header
    // asks for and it is WRONG on screen at the cord widths the beam module
    // currently draws -- the cords cover the disc almost completely and the
    // circle stops being visible at all. Painting it last costs the "cords
    // emerge from it" cue and buys a circle you can actually see, which at a
    // 14 px wide feature is the trade worth making. Revisit if the cords are
    // ever thinned; the argument is entirely about their width, not the depth.
    if (typeof SiphonFXRitual !== "undefined") {
      SiphonFXRitual.draw(ctx, state, BLUB_FX_API);
    }
    // The Healer's cords, under the shots for the same reason the Siphon's beam
    // is: what the player's own board is doing is never buried by what the road
    // is doing.
    drawSupportTethers(ctx, state);
    drawShots(ctx, state);
    // A blub's shot is a shot, so it goes exactly where the others go: over the
    // hardware that fired it and under the cosmetic burst layer. The death
    // burst then sits between the two -- it is an event, and the damage popups
    // go over it.
    if (typeof BlubFXShots !== "undefined") {
      BlubFXShots.drawAir(ctx, state, BLUB_FX_API);
    }
    if (typeof BlubFXSystems !== "undefined") {
      BlubFXSystems.drawDeaths(ctx, state);
    }
    drawEffects(ctx);

    // The build preview: where the tower would go, and whether it may.
    if (state.buildGhost) {
      var gpos = state.buildGhost;
      drawGroundRing(ctx, gpos.x, gpos.y, gpos.radius,
        gpos.ok ? "rgba(120,230,170,0.9)" : "rgba(230,110,110,0.9)",
        gpos.ok ? "rgba(120,230,170,0.16)" : "rgba(230,110,110,0.16)");
      if (gpos.rangePx) {
        drawGroundRing(ctx, gpos.x, gpos.y, gpos.rangePx,
          "rgba(140,199,255,0.35)", null);
      }
    }
  }

  // THE SHOTS.
  //
  // Two very different projectiles, and the difference is the whole point of
  // the tower that fires each. An ordinary bullet is a small bright tracer. The
  // Arcane Sniper's lance from A4 is a BEAM that does not converge -- constant
  // width, brightness draining from muzzle to head as pierce eats its damage,
  // which is the one thing worth drawing about it. Both are lifted to barrel
  // height while their simulation position stays flat on the board, the same
  // split the 2D pack used.
  // Fallback barrel height for a shot that arrived without one. The real figure
  // rides on the projectile, because it differs per tier -- a rifle at the
  // shoulder is 33 u.l. and A4's rail cannon on its yoke is 19.
  var SHOT_LIFT_UL = 33;

  function shotLift(shot) {
    // The height the round is DRAWN at. `_lift` is stamped from the firing
    // tower's real muzzle when one can be identified -- see shotGround.
    if (typeof shot._lift === "number") return shot._lift;
    return ul(typeof shot.liftUl === "number" ? shot.liftUl : SHOT_LIFT_UL);
  }

  // THE MUZZLE THIS ROUND ACTUALLY LEFT, in px above the tower's own ground.
  //
  // `liftUl` is a single number per weapon and it does not match the models:
  // the bolt carries 33, while SNIPER_FX puts the a3 muzzle at Blender height
  // 1.341, which is 42.6 px. Ten pixels on a fifty-five pixel model, and it
  // reads exactly as the owner described -- the round hanging below the barrel
  // that fired it.
  //
  // These tables are the authority the muzzle FLASH already uses, so taking the
  // height from the same place is what stops the flash and the round it belongs
  // to disagreeing about where the end of the gun is.
  function muzzleLift(tower) {
    var id = tower && tower.constructor && tower.constructor.ID;
    var pt = null;
    if (id === "longshot") {
      var sg = sniperGroup(tower);
      // The base body has no entry of its own; it shares a3's braced stance and
      // rifle line, which is much closer than the generic constant is.
      var fx = SNIPER_FX[sg] || SNIPER_FX.a3;
      pt = fx && fx.muzzle;
    } else if (id === "soldier") {
      pt = RIFLEMAN_FX_MUZZLE[riflemanGroup(tower)];
    }
    return pt ? pt[2] * unitsToPx() : null;
  }

  // A SHOT FLIES A STRAIGHT LINE, ANGLED BETWEEN THE TWO HEIGHTS IT CONNECTS.
  //
  // Its reference height is fixed once per shot and used for its head, its
  // tail, its lance body and its glow, so the whole round shares one plane
  // instead of each piece sampling whatever it happens to be passing over.
  // Where it came from and where it is going are at different heights, so the
  // reference eases between them by how far along the shot is -- which is a
  // straight line in the world, aimed at the target, and not a curve draped
  // over the terrain.
  // The towers visible to shotGround this frame, so a round can be anchored to
  // whichever one fired it. Set by drawShots; never read by anything else.
  var shotTowers = [];

  function shotGround(shot) {
    // WHERE IT WAS FIRED FROM, remembered once. A piercing shot knows exactly,
    // because it carries the heading and the distance it has run. A homing
    // round carries no history, so it is stamped the first frame it is drawn,
    // which is the frame it left the barrel.
    //
    // Presentation-only fields on a live round, the same trick `shotBody` and
    // `liftUl` already use. Nothing reads them back.
    if (shot._gz === undefined) {
      var ox = shot.x, oy = shot.y;
      if (typeof shot.travelled === "number" && typeof shot.dirX === "number") {
        ox = shot.x - shot.dirX * shot.travelled;
        oy = shot.y - shot.dirY * shot.travelled;
      }
      shot._gx = ox; shot._gy = oy;
      // Anchored to the TOWER that fired it, not to the patch of ground under
      // the muzzle. A muzzle hangs out past its own platform -- back-projecting
      // one frame of flight put the origin on a deck's rim rather than its top,
      // and a tower built near an edge would have dropped its shot a whole deck
      // height the moment it fired.
      var owner = null, best = Infinity;
      for (var ti = 0; ti < shotTowers.length; ti++) {
        var tw = shotTowers[ti];
        var ddx = tw.x - ox, ddy = tw.y - oy;
        var d2 = ddx * ddx + ddy * ddy;
        var reach = (tw.footprintPx || 12) * 4;
        if (d2 < best && d2 < reach * reach) { best = d2; owner = tw; }
      }
      shot._gz = owner ? groundHeightAt(owner.x, owner.y)
                       : groundHeightAt(ox, oy);
      // and the height of the muzzle it actually left, from the same table the
      // flash uses, so the two cannot disagree.
      var mz = owner ? muzzleLift(owner) : null;
      if (mz !== null) shot._lift = mz;
    }

    // A PIERCING SHOT HOLDS ITS FIRING HEIGHT for the whole flight. It is a
    // rail shot down a fixed heading through everything in the way; it has no
    // single target to descend towards, and dipping to follow the floor under
    // it is the exact bug this is here to stop.
    if (!shot.target || !shot.target.pos) return shot._gz;

    // A homing round is aimed at ONE body, so it eases from the height it left
    // to the height that body is standing on, by how far along it is. Straight
    // line, angled at the target.
    //
    // A BODY THAT IS NOT STANDING ON ANYTHING still has a height, and it is the
    // one the model is drawn at. Aiming at the road under an Aether Wisp sent
    // every anti-air round sailing beneath it -- visibly a miss, on the one
    // enemy the game asks you to build a specific answer to.
    var to = groundHeightAt(shot.target.pos.x, shot.target.pos.y) +
      bodyLift(shot.target, shot.target.radiusPx
        ? shot.target.radiusPx() : 11);
    var gx = shot.x - shot._gx, gy = shot.y - shot._gy;
    var gone = Math.sqrt(gx * gx + gy * gy);
    var lx = shot.target.pos.x - shot.x, ly = shot.target.pos.y - shot.y;
    var left = Math.sqrt(lx * lx + ly * ly);
    var span = gone + left;
    var t = span > 0.001 ? gone / span : 1;
    return shot._gz + (to - shot._gz) * (t < 0 ? 0 : (t > 1 ? 1 : t));
  }

  function drawShots(ctx, state) {
    shotTowers = state.towers || [];
    for (var i = 0; i < state.bullets.length; i++) {
      var b = state.bullets[i];
      // A piercing shot travels a fixed heading and knows how far it has come;
      // a homing round has a target and no history. That, not a type check, is
      // what actually distinguishes them.
      withGround(shotGround(b), (function (shot) {
        return function () {
          if (typeof shot.travelled === "number" && typeof shot.dirX === "number") {
            drawPierceShot(ctx, shot);
          } else {
            drawRound(ctx, shot);
          }
        };
      })(b));
    }
  }

  // THE HEALER'S TETHERS.
  //
  // A cord from the body that pulsed to each body it healed, thrown on the
  // pulse and let go a second and a half later. Everything about WHICH bodies
  // and for HOW LONG is the simulation's -- `supportLinks` on the supporter,
  // filled by Enemy.prototype.supportAllies and swept by its update -- and this
  // draws what is there. That split is what puts the same cords on the 2D
  // fallback (Enemy.prototype.draw) without either renderer knowing about the
  // other.
  //
  // ANCHORED AT THE MIDDLE OF EACH BODY, NOT AT ITS FEET. `enemyTop` is the
  // model's own crown, so 0.55 of it is a chest on a zombie, a core on the
  // Healer, and the right height on the next body imported -- none of which
  // would be true of a number typed here. And the lift is added at BOTH ends
  // for the same reason: the Healer floats and the thing it heals usually does
  // not, so a cord that ignored either would leave one end in the road.
  //
  // AT TOP LEVEL, OUTSIDE ANY withGround, exactly as the Siphon's beams are: a
  // cord spans two patches of road that can be at two heights, so each end
  // pins its own ground through `project`'s default rather than sharing one
  // reference that would flatten the far end onto the near end's tile.
  var TETHER_MID = 0.55;                  // of the body's own height
  var TETHER_REACH = 0.2;                 // of its life, spent flying out
  var TETHER_FADE = 0.7;                  // of its life, below which it fades

  function tetherAnchor(e) {
    var r = e.radiusPx ? e.radiusPx() : 11;
    return project(e.pos.x, e.pos.y,
      bodyLift(e, r) + enemyTop(e) * TETHER_MID);
  }

  // A BOWED CORD, WHEN THE SPEC ASKS FOR ONE, AND A STRAIGHT ONE OTHERWISE.
  //
  // The Healer throws three cords at the three most wounded bodies and a
  // straight line is the right mark for it: it AIMS. The Shieldbearer hands
  // twenty points of shield to ten bodies at once, and ten straight lines out
  // of one body is a star -- the lines overlap near the source and there is no
  // reading which went where. A bow separates them, and it also says the right
  // thing about the gesture: a plate of shield is LOBBED across, not fired.
  //
  // `arc` is a fraction of the SPAN, so a target two body-widths away gets a
  // small bow and one across the board a big one; a constant height would be
  // invisible on the first and a rainbow on the second.
  //
  // THE BOW IS IN THE WORLD, NOT ON THE SCREEN. Every point of the curve is
  // projected through `project` at its own height above the road, so the cord
  // passes over the terrain the way anything else in this renderer does. Bent
  // in screen space it would read as flat ribbon lying on the camera, and it
  // would bend the wrong way the moment the board was orbited.
  var TETHER_STEPS = 14;                  // segments in a drawn bow
  var CHIP_SPREAD = 0.55;                 // of the flight, between first and last

  // One point along a link's bow, `t` from the supporter (0) to the target (1).
  // Returned in SCREEN space; `lift` is how high the middle of the bow rises.
  function tetherPoint(from, to, t, lift) {
    var bow = 4 * t * (1 - t);            // 0 at both ends, 1 in the middle
    return { x: from.x + (to.x - from.x) * t,
             y: from.y + (to.y - from.y) * t - lift * bow,
             scale: from.scale + (to.scale - from.scale) * t };
  }

  function drawSupportTethers(ctx, state) {
    for (var i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
      var links = e.supportLinks;
      if (!links || !links.length) continue;
      var spec = supportSpec(e);
      if (!spec) continue;
      var from = tetherAnchor(e);
      if (!from) continue;
      var rgb = spec.color.r + "," + spec.color.g + "," + spec.color.b;
      for (var k = 0; k < links.length; k++) {
        var link = links[k];
        var to = tetherAnchor(link.target);
        if (!to) continue;
        // Out on the first fifth, held, then faded. `beam`'s own `left` is
        // what tapers the far end while the cord is still travelling, so the
        // head of it is bright and the tail behind it has not arrived yet.
        var reach = Math.min(1, (1 - link.life) / TETHER_REACH);
        var fade = Math.min(1, link.life / TETHER_FADE);
        // THE HEIGHT OF THE BOW, in screen pixels, measured off the span it
        // spans. `arc` absent or zero is a straight cord and takes the cheap
        // two-point path below, which is what keeps the Healer's tethers
        // exactly the artefact they already were.
        var arc = spec.arc || 0;
        var lift = arc && Math.hypot(to.x - from.x, to.y - from.y) * arc;
        if (!lift) {
          var head = { x: from.x + (to.x - from.x) * reach,
                       y: from.y + (to.y - from.y) * reach,
                       scale: from.scale };
          beam(ctx, from, head, rgb, 1.5 * from.scale, fade,
            0.55 + 0.45 * reach);
          glow(ctx, head, 3.4 * fade,
            "rgba(" + rgb + "," + (0.8 * fade).toFixed(3) + ")", 0.85 * fade);
          continue;
        }
        // THE BOW: ONE PATH, THREE STROKES, AND IT IS NOT `beam`.
        //
        // Two reasons, and the second is the one that decided it. `beam` draws
        // a straight segment, so a curve means calling it fourteen times --
        // three strokes each, ten cords a pulse, 420 strokes a frame for one
        // enemy's ability. And `beam`'s white core at 0.95 is right for a shot
        // (a round is hot) and wrong for this: what is travelling here is a
        // SHIELD, the thing it arrives as is a blue shell, and a white-hot
        // cord says the beacon is firing at the bodies it is helping. The core
        // is kept, at half the alpha, because a thin blue line on a blue-grey
        // road needs something down the middle of it to be seen at all.
        var path = function () {
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          for (var s = 1; s <= TETHER_STEPS; s++) {
            var pt = tetherPoint(from, to, reach * s / TETHER_STEPS, lift);
            ctx.lineTo(pt.x, pt.y);
          }
        };
        var w = from.scale;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        path();
        ctx.lineWidth = 5.2 * w;
        ctx.strokeStyle = "rgba(" + rgb + "," + (0.20 * fade).toFixed(3) + ")";
        ctx.stroke();
        path();
        ctx.lineWidth = 2.2 * w;
        ctx.strokeStyle = "rgba(" + rgb + "," + (0.62 * fade).toFixed(3) + ")";
        ctx.stroke();
        path();
        ctx.lineWidth = Math.max(0.6, 0.9 * w);
        ctx.strokeStyle = "rgba(232,250,255," + (0.5 * fade).toFixed(3) + ")";
        ctx.stroke();
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        // THE SHIELDS THEMSELVES, GOING OUT. The cord says two bodies are
        // connected; these say which way the help is travelling, which is the
        // half a line cannot state. They are spread along the flight so the
        // stream reads as several plates rather than one bead, and each one is
        // drawn as a disc of the shield's own colour with a white core -- the
        // same grammar the bubble they are about to become is drawn in.
        var chips = spec.chips || 0;
        for (var c = 0; c < chips; c++) {
          var lead = c / Math.max(1, chips) * CHIP_SPREAD;
          var at = reach - lead;
          if (at <= 0 || at > 1) continue;
          var chip = tetherPoint(from, to, at, lift);
          var bright = fade * (1 - lead / (CHIP_SPREAD + 0.001) * 0.55);
          glow(ctx, chip, (4.6 - c * 0.7) * bright,
            "rgba(" + rgb + "," + (0.85 * bright).toFixed(3) + ")",
            0.9 * bright);
        }
        // And the arrival: the leading plate landing on the body it shields,
        // held after the flight is over so the last thing the eye sees is the
        // shield closing rather than the cord going out.
        if (reach >= 1) {
          glow(ctx, to, 6.0 * fade,
            "rgba(" + rgb + "," + (0.5 * fade).toFixed(3) + ")", 0.9 * fade);
        }
      }
    }
  }

  function drawPierceShot(ctx, shot) {
    var rgb = SHOT_RGB[shot.tint] || SHOT_RGB.neutral;
    var lift = shotLift(shot);
    var head = project(shot.x, shot.y, lift);
    if (!head) return;
    var px = head.scale;                       // board px -> screen px here

    // The guaranteed fourth-of-four round REPLACES the ordinary bolt rather
    // than tinting it. The shot that always crits is the one you can see
    // coming, or it may as well not be guaranteed.
    if (shot.empowered) { drawCovenantRound(ctx, shot, head, px); return; }

    // A4 fires a lance, A5 a considerably bigger one; anything below still
    // fires a bolt, because a rifle that shoots a beam is a different weapon.
    if (shot.style === "lance" || shot.style === "meridian") {
      var origin = project(shot.x - shot.dirX * shot.travelled,
                           shot.y - shot.dirY * shot.travelled, lift);
      var base = Math.max(1, shot.baseDamage || 1);
      var now = (typeof shot.currentDamage === "function")
        ? shot.currentDamage() : base;
      var left = Math.max(0.1, Math.min(1, now / base));
      var w = (3.2 + Math.min(1, base / 500) * 4.4) *
        (shot.style === "meridian" ? 2.6 : 1.15) * px;

      // Degenerate at the instant of firing: no length yet, so no gradient.
      if (!origin || shot.travelled < 1) {
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath(); ctx.arc(head.x, head.y, w, 0, Math.PI * 2); ctx.fill();
        return;
      }
      beam(ctx, origin, head, rgb, w, 1, left);
      ctx.fillStyle = "#FFFFFF";
      ctx.globalAlpha = 0.45 + 0.55 * left;
      ctx.beginPath();
      ctx.arc(head.x, head.y, w * 1.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    // The ordinary bolt. Same potency curve the 2D pack uses: a shot carrying
    // more damage simply IS a bigger bolt, so path A's shots get brighter
    // without the projectile knowing anything about upgrade tiers.
    var potency = Math.max(0, Math.min(1, (shot.baseDamage || 0) / 400));
    var length = 13 + potency * 20;
    var width = (2.2 + potency * 2.6) * px;
    var tail = project(shot.x - shot.dirX * length,
                       shot.y - shot.dirY * length, lift);
    if (!tail) tail = head;

    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(" + rgb + "," + (0.18 + potency * 0.16).toFixed(3) + ")";
    ctx.lineWidth = width * 2.6;
    ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.strokeStyle = "rgb(" + rgb + ")";
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(head.x, head.y, width * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }

  // A THREE-LAYER BEAM WHOSE BRIGHTNESS DRAINS ALONG ITS LENGTH.
  //
  // Constant WIDTH, falling ALPHA. That distinction is the whole thing: pierce
  // falloff eats the shot's damage as it goes, and carrying that in the width
  // drew a cone -- a shape that says "spreading out", which is the opposite of
  // what a rail lance does. Shared by the live lance and the remnant it leaves,
  // so the afterimage cannot disagree with the shot that made it.
  function beam(ctx, a, b, rgb, w, fade, left) {
    // A NON-FINITE ALPHA IS A THROWN EXCEPTION, NOT A BAD-LOOKING BEAM.
    //
    // `addColorStop` rejects "rgba(r,g,b,NaN)" with a SyntaxError, and this runs
    // inside draw() -- so one shot whose falloff parameters were incomplete took
    // out the entire frame, HUD included, rather than drawing one wrong line.
    // Clamped here because this is the single funnel every beam goes through,
    // and because no cosmetic value is worth a black screen.
    if (!isFinite(fade)) fade = 1;
    if (!isFinite(left)) left = 1;
    if (!isFinite(w) || w <= 0) w = 1;
    fade = Math.max(0, Math.min(1, fade));
    left = Math.max(0, Math.min(1, left));
    function ramp(alpha) {
      var g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, "rgba(" + rgb + "," + (alpha * fade).toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + rgb + "," + (alpha * fade * left).toFixed(3) + ")");
      return g;
    }
    ctx.lineCap = "butt";
    ctx.strokeStyle = ramp(0.22);
    ctx.lineWidth = w * 4.0 * (0.35 + 0.65 * fade);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

    ctx.strokeStyle = ramp(0.75);
    ctx.lineWidth = w * 1.7 * (0.3 + 0.7 * fade);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

    // White core, faded the same way. At full damage it keeps a hot centre the
    // whole length; a spent shot has one only near the muzzle.
    var core = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    core.addColorStop(0, "rgba(255,255,255," + (0.95 * fade).toFixed(3) + ")");
    core.addColorStop(1, "rgba(255,255,255," +
      (0.95 * fade * left).toFixed(3) + ")");
    ctx.strokeStyle = core;
    ctx.lineWidth = Math.max(0.5, w * 0.66 * fade);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  // B5's covenant round: a violet slug wrapped in a rotating seal, with two
  // sigils riding alongside it. Heavy, slow-looking and obviously different
  // from the four rounds before it.
  function drawCovenantRound(ctx, shot, head, px) {
    var rgb = SHOT_RGB.sigil;
    var phase = (shot.travelled || 0) * 0.05;
    var back = project(shot.x - shot.dirX * 26, shot.y - shot.dirY * 26,
      shotLift(shot)) || head;
    var dx = head.x - back.x, dy = head.y - back.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len; dy /= len;
    var nx = -dy, ny = dx;

    // The wake, drawn first so the round sits on top of it.
    var g = ctx.createLinearGradient(back.x, back.y, head.x, head.y);
    g.addColorStop(0, "rgba(" + rgb + ",0)");
    g.addColorStop(1, "rgba(" + rgb + ",0.5)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 7 * px;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(back.x, back.y); ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.lineCap = "butt";

    ctx.fillStyle = "rgba(" + rgb + ",0.34)";
    ctx.beginPath(); ctx.arc(head.x, head.y, 11 * px, 0, Math.PI * 2); ctx.fill();

    // The slug: a diamond along the heading, not a circle -- it has a point.
    ctx.fillStyle = "rgba(245,228,255,0.96)";
    ctx.beginPath();
    ctx.moveTo(head.x + dx * 6.5 * px, head.y + dy * 6.5 * px);
    ctx.lineTo(head.x + nx * 3.6 * px, head.y + ny * 3.6 * px);
    ctx.lineTo(head.x - dx * 6.5 * px, head.y - dy * 6.5 * px);
    ctx.lineTo(head.x - nx * 3.6 * px, head.y - ny * 3.6 * px);
    ctx.closePath();
    ctx.fill();

    for (var seal = -1; seal <= 1; seal += 2) {
      var across = seal * (11 + Math.sin(phase + seal) * 1.8) * px;
      var along = (-2 + Math.cos(phase * 0.7 + seal) * 2) * px;
      var sx = head.x + dx * along + nx * across;
      var sy = head.y + dy * along + ny * across;
      ctx.fillStyle = "rgba(229,151,255,0.94)";
      ctx.beginPath();
      ctx.moveTo(sx + dx * 3.2 * px, sy + dy * 3.2 * px);
      ctx.lineTo(sx + nx * 2.4 * px, sy + ny * 2.4 * px);
      ctx.lineTo(sx - dx * 3.2 * px, sy - dy * 3.2 * px);
      ctx.lineTo(sx - nx * 2.4 * px, sy - ny * 2.4 * px);
      ctx.closePath();
      ctx.fill();
    }
  }

  // A homing round, in whatever body the weapon that fired it uses. `shotBody`
  // is stamped on the bullet at fire time (js/soldier.js), so a 1-damage
  // recruit carbine and a 20-damage B5 slug are visibly not the same round --
  // which they were, for as long as every shot in the game was one yellow dot.
  function drawRound(ctx, shot) {
    var spec = RIFLEMAN_SHOTS[shot.shotBody] ||
      ["#ffe08c", "255,202,92", 3.0, 12, 0.30];
    var lift = shotLift(shot);
    var head = project(shot.x, shot.y, lift);
    if (!head) return;
    var px = head.scale;
    var rgb = spec[1], radius = spec[2] * px, trail = spec[3], glowA = spec[4];

    var dx = 1, dy = 0;
    if (shot.target && shot.target.pos) {
      dx = shot.target.pos.x - shot.x;
      dy = shot.target.pos.y - shot.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= len; dy /= len;
    }
    var tail = project(shot.x - dx * trail, shot.y - dy * trail, lift) || head;

    // Behind the round along its own heading, tapering to nothing, so a burst
    // of five reads as five rounds in a line rather than as one smear.
    var g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    g.addColorStop(0, "rgba(" + rgb + ",0)");
    g.addColorStop(1, "rgba(" + rgb + "," + glowA.toFixed(2) + ")");
    ctx.strokeStyle = g;
    ctx.lineWidth = radius * 1.5;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.lineCap = "butt";

    ctx.fillStyle = "rgba(" + rgb + "," + (glowA * 0.42).toFixed(2) + ")";
    ctx.beginPath();
    ctx.arc(head.x, head.y, radius * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = spec[0];
    ctx.beginPath();
    ctx.arc(head.x, head.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // The cosmetic layer, projected. The 2D game drew these under its flat
  // world transform; a perspective camera has no such transform, so each
  // element is placed by worldToScreen and sized by that point's own px-per-
  // world-unit. Same information, same colours, same lifetimes -- the arrays
  // are Effects' own, read through its worldState() view.
  function drawEffects(ctx) {
    if (typeof Effects === "undefined" || !Effects.worldState) return;
    var s = Effects.worldState();
    var i, p;

    // Marks left by things landing. Most are a shockwave lying on the ground
    // with debris thrown out along it -- on the ground plane on purpose,
    // because a blast that faced the camera would swing around as the board
    // turned, and the one thing a 3D board can say that a 2D one cannot is
    // that the explosion happened somewhere flat.
    //
    // FIVE kinds are NOT that shape and are dispatched by name, exactly as the
    // 2D pack registers a renderer per kind. A beam remnant is a line between
    // two endpoints; running it through the circle path drew an expanding ring
    // hundreds of pixels wide, centred on the middle of the shot. The Tyrant's
    // gaze is the same shape and joined them on 2026-08-19.
    //
    // `tyrant-blast` is deliberately NOT in that list: the explosion its gaze
    // sets off IS a circle on the ground, so it wants the common path below and
    // is named only so a skin pack can claim it later.
    for (i = 0; i < s.aoeImpacts.length; i++) {
      var impact = s.aoeImpacts[i];
      var kind = impact.kind || "area";
      if (kind === "warbringer-swing") { drawForgeSlam(ctx, impact); continue; }
      if (kind === "warbringer-ring") { drawStakeRing(ctx, impact); continue; }
      if (kind === "lance-remnant") { drawLanceRemnant(ctx, impact); continue; }
      if (kind === "tyrant-gaze") { drawTyrantGaze(ctx, impact); continue; }
      if (kind === "arcane-empowered-hit") { drawCovenantHit(ctx, impact); continue; }
      if (kind === "b5-strike") { drawStrike(ctx, impact); continue; }
      var progress = 1 - impact.life / impact.maxLife;
      var arcane = kind.indexOf("arcane") === 0;
      var rgb = kind === "rifleman-hit" ? "255,214,140"
        : arcane ? "188,160,255" : "238,184,108";
      drawShockwave(ctx, impact.x, impact.y, impact.radius, progress, rgb);
      if (impact.radius > 14) drawDebrisFan(ctx, impact, progress, rgb);
    }

    // Sparks. They ARC -- thrown up, then pulled down -- and they streak along
    // the direction they are travelling rather than being round dots. A round
    // dot at constant size is the thing that reads as "particle system"; a
    // short bright streak that falls reads as debris.
    ctx.lineCap = "round";
    for (i = 0; i < s.particles.length; i++) {
      p = s.particles[i];
      var a = p.life / p.maxLife;
      var t = 1 - a;
      // A real arc: up fast, down under gravity. The 2D pass faked altitude by
      // subtracting from y, which under a 3D camera slides along the ground.
      // `lift` is where the burst STARTED -- zero for anything thrown off the
      // floor, a flier's body height for anything thrown off a flier.
      var lift = p.lift || 0;
      var h = lift + Math.max(0, 46 * t - 78 * t * t);
      var head = project(p.x, p.y, h);
      if (!head) continue;
      // The tail is where it was a moment ago, so the streak points along the
      // actual path instead of at a guessed angle.
      var back = 0.055;
      var ht = Math.max(0, t - back);
      var tail = project(p.x - p.vx * back, p.y - p.vy * back,
        lift + Math.max(0, 46 * ht - 78 * ht * ht));
      var w = Math.max(0.6, p.size * (0.35 + a * 0.65) * head.scale);
      ctx.strokeStyle = "rgba(" + p.color + "," + (0.9 * a).toFixed(3) + ")";
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(tail ? tail.x : head.x, tail ? tail.y : head.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
      // A hot core on the newest ones, so a fresh burst has a bright centre
      // instead of being uniformly dim.
      if (a > 0.65) {
        ctx.fillStyle = "rgba(255,248,230," + ((a - 0.65) * 2.2).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(head.x, head.y, w * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.lineCap = "butt";

    // The flier wreck's own sparks. They keep their own arrays because they
    // carry a real z velocity, which the shared particle record has no room
    // for -- debris off a body that is itself falling cannot be expressed as a
    // fixed arc off the floor.
    if (typeof EnemyWreck !== "undefined") EnemyWreck.draw(ctx);

    // Popups are TEXT, so they stay at screen size whatever the zoom -- a
    // bounty you cannot read is a bounty that may as well not have printed.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (i = 0; i < s.popups.length; i++) {
      p = s.popups[i];
      var alpha = Math.min(1, p.life / (p.maxLife * 0.5));
      var at = project(p.x, p.y,
        30 + (p.lift || 0) + (1 - p.life / p.maxLife) * 22);
      if (!at) continue;
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillStyle = p.bad
        ? "rgba(240,120,110," + alpha.toFixed(3) + ")"
        : "rgba(255,215,110," + alpha.toFixed(3) + ")";
      ctx.fillText(p.text, at.x, at.y);
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  // --- tower effects -------------------------------------------------------
  //
  // WHERE THE LIGHT GOES ON EACH WEAPON, in Blender-local [forward, side,
  // height]. Same table js/skins/draw-pack.js carries, and for the same
  // reason: these are physical parts of the model -- coil stages, a breech, a
  // muzzle -- not percentages of a generic barrel, and lighting a percentage
  // puts the first glow inside the stock. tools/blender/tower_sniper.py prints
  // the muzzles and is the authority both copies follow.
  var SNIPER_FX = {
    a3: { muzzle: [1.56, -0.06, 1.341],
          charge: [[0.74, -0.06, 1.319], [1.00, -0.06, 1.326],
                   [1.26, -0.06, 1.333]] },
    a4: { muzzle: [1.725, 0, 0.740],
          charge: [[0.42, 0, 0.740], [0.78, 0, 0.740], [1.14, 0, 0.740]] },
    a5: { muzzle: [2.06, 0, 0.960],
          charge: [[0.02, 0, 0.96], [0.38, 0, 0.96], [0.74, 0, 0.96],
                   [1.10, 0, 0.96], [1.46, 0, 0.96], [1.82, 0, 0.96]] },
    b3: { muzzle: [1.25, -0.06, 1.333], chamber: [0.20, -0.06, 1.285] },
    b4: { muzzle: [1.25, -0.06, 1.333], chamber: [0.20, -0.06, 1.285] },
    b5: { muzzle: [1.25, -0.06, 1.313], chamber: [0.20, -0.06, 1.265],
          source: [0.005, -0.02, 1.520] }
  };
  var RIFLEMAN_FX_MUZZLE = {
    base: [0.926, -0.200, 1.008], a3: [0.945, -0.180, 1.015],
    a4: [1.200, 0, 1.100], a5: [1.190, 0, 1.140],
    b3: [0.937, -0.200, 0.989], b4: [0.977, -0.200, 0.992],
    b5: [1.145, 0, 1.240]
  };
  // The three shot colours, byte triplets so a gradient stop can be built from
  // one of them at any alpha. Identical values to js/skins/draw-pack.js
  // SHOT_COLOURS: ley is the graft path's teal, sigil the rapture path's
  // violet, neutral the untouched weapon's pale blue.
  var SHOT_RGB = {
    ley: "79,227,210", sigil: "192,97,240", neutral: "191,233,255"
  };

  // The Rifleman's rounds, per tier: core, halo rgb, radius, trail, glow. Same
  // table draw-pack carries -- path A's rounds get hotter and whiter, path B's
  // stay small and pale because its read comes from how MANY there are, and the
  // people he arms fire something visibly poorer than anything he does.
  var RIFLEMAN_SHOTS = {
    base: ["#FFE6A8", "255,206,120", 2.6, 11, 0.30],
    a3: ["#FFE6A8", "255,206,120", 2.9, 13, 0.34],
    a4: ["#FFF2CE", "255,224,150", 3.5, 17, 0.42],
    a5: ["#FFFFFF", "255,236,180", 4.3, 24, 0.55],
    b3: ["#EAF0F6", "214,228,240", 2.3, 9, 0.26],
    b4: ["#EAF0F6", "214,228,240", 2.5, 10, 0.30],
    b5: ["#FFF6E0", "246,214,150", 5.0, 20, 0.62],
    "recruit-b4": ["#D8C79A", "186,168,126", 1.7, 6, 0.16],
    "recruit-b5": ["#E4D6AC", "204,186,142", 2.1, 8, 0.20]
  };

  // Blender units -> board pixels. Read from the registry rather than written
  // out again: it is the exporter's number, and a second copy of it is a second
  // thing to keep true.
  function unitsToPx() {
    return GLModels.unitsToPx("sniper-base") || 31.8032;
  }

  // A model-local anchor, projected. The model is drawn by drawActor with a
  // yaw-and-uniform-scale matrix, so this is that same matrix applied by hand
  // -- which is what keeps a muzzle flash welded to the barrel instead of
  // floating near it.
  //
  // The yaw MUST be the one the mesh was drawn with, which is `tower.aim` flat.
  // Reading the player's chosen `core.aimRad` for a cone tower instead looks
  // more correct and is not: the body on screen is tracking its target inside
  // the arc, so the light would sit off the barrel by however far the two
  // disagree.
  var anchorScratch = { x: 0, y: 0, z: 0 };

  function anchorWorld(tower, pt) {
    var aim = (typeof tower.aim === "number" && isFinite(tower.aim))
      ? tower.aim : 0;
    var k = unitsToPx();
    var c = Math.cos(aim), s = Math.sin(aim);
    anchorScratch.x = tower.x + (c * pt[0] - s * pt[1]) * k;
    anchorScratch.y = tower.y + (s * pt[0] + c * pt[1]) * k;
    anchorScratch.z = pt[2] * k;
    return anchorScratch;
  }

  function anchor(tower, pt) {
    var w = anchorWorld(tower, pt);
    return project(w.x, w.y, w.z);
  }

  // A small horizontal hoop around a model-local point, projected. Used for the
  // tally rings that climb A5's rear spar: they are physical rings on a post,
  // so they lie flat and turn with the board rather than facing the camera.
  function hoop(ctx, tower, pt, radiusUnits) {
    var w = anchorWorld(tower, pt);
    var r = radiusUnits * unitsToPx();
    var cx = w.x, cy = w.y, cz = w.z;
    ctx.beginPath();
    for (var i = 0; i <= 20; i++) {
      var th = i / 20 * Math.PI * 2;
      var p = project(cx + Math.cos(th) * r, cy + Math.sin(th) * r, cz);
      if (!p) return;
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // A screen-space unit vector along the weapon, for effects that run ALONG the
  // barrel (arcs between coils, the rune ring's minor axis). Derived from two
  // projected points rather than from the aim angle, because under a turning
  // camera the barrel's direction on screen is not its direction in the world.
  function barrelAxis(tower, from, to) {
    var a = anchor(tower, from), b = anchor(tower, to);
    if (!a || !b) return null;
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return null;
    return { x: dx / len, y: dy / len, len: len, scale: b.scale };
  }

  // How far through its firing cycle a config-driven tower is, 0..1. Same
  // derivation draw-pack uses; nothing is stored for it.
  function firingProgress(tower) {
    var core = tower && tower.core;
    if (!core || typeof core.effectiveFireRate !== "function") return 1;
    var rate = core.effectiveFireRate();
    if (!(rate > 0)) return 1;
    var left = core.fireCooldown;
    if (!(left > 0)) return 1;
    return Math.max(0, Math.min(1, 1 - left * rate));
  }

  // A bloom, sized in WORLD units and converted here. Light belongs to the
  // object that emits it, so it has to shrink with distance like the barrel it
  // sits on -- a muzzle flash pinned to a screen-pixel radius is the size of
  // the whole weapon when the board is zoomed out.
  function glow(ctx, p, worldRadius, rgba, coreAlpha) {
    if (!p) return;
    var radius = worldRadius * p.scale;
    if (!(radius > 0.2)) return;
    ctx.fillStyle = rgba;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (coreAlpha > 0.01) {
      ctx.fillStyle = "rgba(255,255,255," + coreAlpha.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // A jagged polyline between two screen points. `spread` is how far it may
  // wander off the straight line. Randomised every frame on purpose: lightning
  // that repeats is not lightning.
  function arcBolt(ctx, x1, y1, x2, y2, segments, spread) {
    var nx = -(y2 - y1), ny = (x2 - x1);
    var len = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= len; ny /= len;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (var i = 1; i < segments; i++) {
      var t = i / segments;
      // Zero at both ends, so the arc is anchored to the two coils it jumps
      // between rather than starting somewhere near them.
      var w = (Math.random() - 0.5) * 2 * spread * Math.sin(t * Math.PI);
      ctx.lineTo(x1 + (x2 - x1) * t + nx * w, y1 + (y2 - y1) * t + ny * w);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // A ring drawn AROUND the barrel -- a circle in the plane the shot passes
  // through. In a turning 3D camera that plane turns too, so the ellipse is
  // built from the barrel's own screen axis: major across the shot, minor
  // along it. At A5 this is the rune circle the weapon spins up inside.
  function barrelRing(ctx, centre, axis, radius, spin, ticks) {
    if (!centre || !axis) return;
    // Along the barrel the ring is seen edge-on, so it collapses; across it,
    // full width. That IS the projection -- no squash constant needed, because
    // the axis already came out of the camera.
    var ax = axis.x, ay = axis.y;
    var px = -ay, py = ax;
    var i, th, ox, oy;
    ctx.beginPath();
    for (i = 0; i <= 40; i++) {
      th = i / 40 * Math.PI * 2;
      ox = Math.cos(th) * radius * 0.28;     // along  -- foreshortened
      oy = Math.sin(th) * radius;            // across -- full
      var X = centre.x + ax * ox + px * oy;
      var Y = centre.y + ay * ox + py * oy;
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.closePath();
    ctx.stroke();
    for (i = 0; i < (ticks || 0); i++) {
      th = spin + i * Math.PI * 2 / ticks;
      ox = Math.cos(th) * radius * 0.28;
      oy = Math.sin(th) * radius;
      ctx.beginPath();
      ctx.moveTo(centre.x + ax * ox + px * oy, centre.y + ay * ox + py * oy);
      ctx.lineTo(centre.x + (ax * ox + px * oy) * 1.16,
                 centre.y + (ay * ox + py * oy) * 1.16);
      ctx.stroke();
    }
  }

  // A ritual circle lying FLAT ON THE BOARD, ticks and all. The 2D pack drew
  // this as an ellipse squashed by GROUND_SQUASH because that was the board's
  // only projection; here the camera supplies the real one, which is the single
  // thing that stops a magic circle reading as a sticker.
  function ritualRing(ctx, x, y, radius, spin, ticks, width) {
    ctx.lineWidth = width || 1.5;
    if (ringPath(ctx, x, y, radius, 44)) ctx.stroke();
    for (var i = 0; i < (ticks || 0); i++) {
      var th = spin + i * Math.PI * 2 / ticks;
      var c = Math.cos(th), s = Math.sin(th);
      var a = project(x + c * radius, y + s * radius, 0);
      var b = project(x + c * radius * 1.13, y + s * radius * 1.13, 0);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // The Arcane Sniper winding up. Coil stages light in SEQUENCE along the
  // weapon and the muzzle blooms, biased hard to the end of the cycle -- for
  // most of it there should be almost nothing, then it winds up just before
  // the shot. A linear ramp reads as a lamp on a dimmer.
  //
  // Speed is dynamic by construction: everything here is driven by how far
  // through its cycle the tower is, so buying attack speed -- or A5's live kill
  // stacks -- visibly winds the weapon up quicker with no constant to keep in
  // step.
  function drawSniperCharge(ctx, tower, group, now) {
    var fx = SNIPER_FX[group];
    if (!fx) return;

    // A channelling tower shows the ritual INSTEAD of its ordinary charge. It
    // is not shooting; showing both would say it was.
    if (tower.channel) { drawChannel(ctx, tower, fx, now); return; }

    var charge = firingProgress(tower);
    if (charge <= 0.02) return;
    var t = charge * charge * charge;
    var core = tower.core;
    var graft = (core && core.purchased && core.purchased.A) || 0;
    var rapture = group.charAt(0) === "b";
    var rgb = rapture ? SHOT_RGB.sigil : SHOT_RGB.ley;

    // THE COIL STAGES THEMSELVES ARE NOT DRAWN HERE ANY MORE.
    //
    // They used to be translucent discs on the 2D canvas, one per authored
    // coil point. Being canvas, they sat on top of the whole board: visible
    // through the barrel, through the enemies in front of the tower, through
    // anything. That reads as a sticker, not as a machine warming up.
    //
    // The coils are emissive geometry in the model, so they are lit in the GL
    // pass instead (towerGlow / uGlow) and are occluded by whatever is in
    // front of them, like any other solid. What is left below is only the
    // things geometry genuinely cannot do: current arcing across a gap, a
    // rune circle spinning in mid-air, and the bloom in the air at the mouth.
    var pts = fx.charge || [];
    var lit = [];
    var s;
    for (s = 0; s < pts.length; s++) {
      lit.push(Math.max(0, Math.min(1, t * (pts.length + 1) - s)));
    }

    // A4 ARCS BETWEEN ITS COILS. The rail cannon is not a lamp that brightens;
    // it is a capacitor bank dumping into a rail, and what says so is current
    // jumping the gap between stages once both ends are lit.
    if (graft >= 4 && pts.length > 1) {
      ctx.lineCap = "round";
      for (s = 0; s < pts.length - 1; s++) {
        var pair = Math.min(lit[s], lit[s + 1]);
        if (pair < 0.35) continue;
        var a = anchor(tower, pts[s]), b = anchor(tower, pts[s + 1]);
        if (!a || !b) continue;
        var span = Math.sqrt((b.x - a.x) * (b.x - a.x) +
                             (b.y - a.y) * (b.y - a.y));
        ctx.strokeStyle = "rgba(" + rgb + "," + (0.55 * pair).toFixed(3) + ")";
        ctx.lineWidth = 1.6 * pair;
        arcBolt(ctx, a.x, a.y, b.x, b.y, 5, span * 0.16);
        ctx.strokeStyle = "rgba(245,255,255," + (0.6 * pair * pair).toFixed(3) + ")";
        ctx.lineWidth = 0.8 * pair;
        arcBolt(ctx, a.x, a.y, b.x, b.y, 5, span * 0.10);
      }
      ctx.lineCap = "butt";
    }

    // A5 SPINS A RUNE CIRCLE ROUND THE MUZZLE. The tier that costs 13 900 and
    // takes the man's whole body should not merely be A4 with a brighter lamp.
    if (graft >= 5) {
      var axis = barrelAxis(tower, pts[0] || fx.muzzle, fx.muzzle);
      var mouth = anchor(tower, fx.muzzle);
      var spin = (now || 0) * 1.7;
      var px = unitsToPx() * (mouth ? mouth.scale : 1);
      ctx.strokeStyle = "rgba(" + rgb + "," + (0.25 + 0.55 * t).toFixed(3) + ")";
      ctx.lineWidth = 1.2 + 1.6 * t;
      barrelRing(ctx, mouth, axis, 0.34 * px * (0.7 + 0.3 * t), spin, 8);
      ctx.strokeStyle = "rgba(" + rgb + "," + (0.16 + 0.34 * t).toFixed(3) + ")";
      ctx.lineWidth = 1;
      barrelRing(ctx, mouth, axis, 0.20 * px * (0.7 + 0.3 * t), -spin * 1.6, 0);
    }

    // THE HEAT HAZE AT THE MOUTH. Not the muzzle itself -- that is emissive
    // geometry now -- but the air in front of it, which has nothing to be
    // drawn on and so is the one part of this that genuinely belongs on the
    // canvas. Kept tight and faint: it is a halo around a bright object, not
    // the bright object.
    if (t > 0.25) {
      var haze = (graft >= 5 ? 9 : graft >= 4 ? 6.5 : 5) * (0.35 + 0.65 * t);
      glow(ctx, anchor(tower, fx.muzzle), haze,
        "rgba(" + rgb + "," + (0.13 * t * t).toFixed(3) + ")", 0);
    }
  }

  // HOW MANY SHOTS ARE LEFT BEFORE THE PAUSE.
  //
  // From B3 the Arcane Sniper fires four and then stops for a beat, and that
  // is the one thing about it a player can act on -- whether to expect a shot
  // in the next second. It went missing in the 3D port, so the tower simply
  // stopped firing with nothing on screen to say why, which reads as broken
  // rather than as busy.
  //
  // Pips above the tower rather than chambers modelled into the cylinder: it
  // changes every shot, and this is interface, so it keeps its screen size and
  // stays square to the camera like the health bars it sits above.
  function drawChambers(ctx, tower) {
    var core = tower.core;
    // The tracker is built from config whenever the tower type has a reload at
    // all, but it only GOVERNS firing once the flag is granted -- see
    // ConfiguredTower.canFire. Reading the tracker alone put four pips over a
    // graft-path cannon that never reloads, which is a readout of nothing.
    if (!core || !core.stats.flags.reload) return;
    var r = core.reload;
    if (!r || !r.shotsBeforeReload) return;
    var lift = (tower.footprintPx || 12) * 2.6 + 16;
    var p = project(tower.x, tower.y, lift);
    if (!p) return;

    var total = r.shotsBeforeReload;
    var spent = r.reloading ? total : (r.shotsFired || 0);
    var gap = 7, radius = 2.6;
    var left = p.x - (total - 1) * gap * 0.5;

    for (var i = 0; i < total; i++) {
      var live = i >= spent;
      ctx.beginPath();
      ctx.arc(left + i * gap, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = live ? "#C061F0" : "rgba(52,34,64,0.9)";
      ctx.fill();
      if (live) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.stroke();
      }
    }

    // While reloading, a bar under the pips counts the beat out.
    if (r.reloading) {
      var w = (total - 1) * gap + radius * 2;
      var done = 1 - Math.max(0, Math.min(1,
        r.reloadTimer / (r.reloadDurationSeconds || 1)));
      ctx.fillStyle = "rgba(52,34,64,0.9)";
      ctx.fillRect(left - radius, p.y + 5, w, 2);
      ctx.fillStyle = "#C061F0";
      ctx.fillRect(left - radius, p.y + 5, w * done, 2);
    }
  }

  // A5's kill-stack speed is LIVE COMBAT STATE, so it cannot be baked into the
  // model: five rings climb the rear tally spar, each a fifth of the 200-stack
  // cap. The authored heights are the ones on A5's raised carriage.
  //
  // Drawn unconditionally, empty rings included, because the row of dark hoops
  // is what makes a lit one mean something -- three of five reads as progress;
  // three floating rings read as decoration.
  function drawKillStacks(ctx, tower) {
    var tracker = tower.core && tower.core.killStacks;
    if (!tracker || typeof tracker.count !== "function") return;
    var filled = Math.max(0, Math.min(5,
      tracker.count() / Math.max(1, tracker.maxStacks || 200) * 5));
    for (var i = 0; i < 5; i++) {
      var lit = Math.max(0, Math.min(1, filled - i));
      ctx.lineWidth = 0.9 + lit * 1.4;
      ctx.strokeStyle = lit > 0
        ? "rgba(" + SHOT_RGB.ley + "," + (0.38 + lit * 0.62).toFixed(3) + ")"
        : "rgba(45,78,82,0.65)";
      hoop(ctx, tower, [-0.52, 0, 1.03 + i * 0.14], 0.11);
    }
  }

  // B5's ability: three seconds of channelling before it resolves. The target
  // is LOCKED when the channel starts and the circles follow that same body
  // without retargeting -- which is exactly the information the telegraph has
  // to carry, because that is what the player committed to.
  //
  // The tower pays for it in permanent max HP, so the man is drawn paying: a
  // ring closing IN on him against the one opening OUT at the target.
  function drawChannel(ctx, tower, fx, now) {
    var ch = tower.channel;
    var params = tower.core && tower.core.stats &&
      tower.core.stats.mechanics && tower.core.stats.mechanics.activeAbility;
    if (!ch || !params) return;
    var p = Math.max(0, Math.min(1, 1 - ch.remaining / (ch.total || 1)));
    var rgb = SHOT_RGB.sigil;
    var radius = ul(params.aoeRadius) * (0.35 + 0.65 * p);
    var spin = (now || 0) * 1.43;

    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(" + rgb + "," + (0.30 + 0.6 * p).toFixed(3) + ")";
    ritualRing(ctx, ch.x, ch.y, radius, spin, 12, 1.6 + 2.2 * p);
    ctx.strokeStyle = "rgba(" + rgb + "," + (0.20 + 0.5 * p).toFixed(3) + ")";
    ritualRing(ctx, ch.x, ch.y, radius * 0.62, -spin * 1.6, 6, 1.2);
    ritualRing(ctx, ch.x, ch.y, radius * 0.28, spin * 2.2, 0, 1.2);

    // A COLUMN OF LIGHT STANDING IN THE CIRCLE, growing down from the sky as
    // the channel runs -- so the strike is telegraphed as a DIRECTION and not
    // merely as a place. Four projected corners rather than a screen-space
    // rectangle: this is a shaft standing in the world, and under a turning
    // camera a rectangle would stay bolted to the screen and lean the wrong way.
    var high = 420 * p * p;
    if (high > 2) {
      var w = radius * 0.30;
      var bl = project(ch.x - w, ch.y, 0), br = project(ch.x + w, ch.y, 0);
      var tl = project(ch.x - w, ch.y, high), tr = project(ch.x + w, ch.y, high);
      if (bl && br && tl && tr) {
        var g = ctx.createLinearGradient(tl.x, tl.y, bl.x, bl.y);
        g.addColorStop(0, "rgba(" + rgb + ",0)");
        g.addColorStop(1, "rgba(" + rgb + "," + (0.16 + 0.3 * p).toFixed(3) + ")");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y);
        ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y);
        ctx.closePath();
        ctx.fill();
      }
    }

    // And the man paying for it.
    ctx.strokeStyle = "rgba(" + rgb + "," + (0.5 * p).toFixed(3) + ")";
    ritualRing(ctx, tower.x, tower.y, ul(26) * (1.4 - 0.7 * p), -spin, 8, 1.4);

    var source = anchor(tower, fx.source || fx.muzzle);
    if (source) {
      var scale = source.scale;
      glow(ctx, source, 4 + 8 * p,
        "rgba(" + rgb + "," + (0.22 + 0.48 * p).toFixed(3) + ")", 0.75 * p * p);
      // Sigils tearing off him rather than drifting -- this is the cast, not
      // the idle charge, so they leave fast and hard.
      for (var i = 0; i < 9; i++) {
        var ph = (spin * 0.42 + i / 9) % 1;
        var a = p * (1 - ph) * 0.9;
        if (a <= 0.02) continue;
        var th = i * Math.PI * 2 / 9 + spin * 0.4;
        var reach = ph * 34 * scale;
        var sx = source.x + Math.cos(th) * reach;
        var sy = source.y + Math.sin(th) * reach;
        var arm = 2.2 * scale;
        ctx.strokeStyle = "rgba(" + rgb + "," + a.toFixed(3) + ")";
        ctx.lineWidth = 1.3 * scale;
        ctx.beginPath();
        ctx.moveTo(sx - arm, sy); ctx.lineTo(sx + arm, sy);
        ctx.moveTo(sx, sy - arm); ctx.lineTo(sx, sy + arm);
        ctx.stroke();
      }
    }
    ctx.lineCap = "butt";
  }

  // The Rifleman's muzzle flash. Cordite, not enchantment -- the one piece of
  // light that tower is allowed, and it lasts exactly as long as a shot does.
  // `sinceShot` ages to null on its own, so nothing is stored for this.
  function drawRiflemanFlash(ctx, tower, group) {
    var age = (typeof tower.sinceShot === "function") ? tower.sinceShot() : null;
    if (age === null || age > 0.055) return;
    var fade = 1 - age / 0.055;
    var spec = RIFLEMAN_SHOTS[group] || RIFLEMAN_SHOTS.base;
    var p = anchor(tower, RIFLEMAN_FX_MUZZLE[group] || RIFLEMAN_FX_MUZZLE.base);
    if (!p) return;
    var world = (4 + spec[2] * 1.5) * (0.5 + fade);   // board px
    var size = world * p.scale;                       // screen px, for strokes
    if (size < 0.4) return;
    // The star: a short cross of flame across the muzzle, which is what a rifle
    // actually throws. A plain disc reads as a light bulb.
    ctx.strokeStyle = "rgba(" + spec[1] + "," + (0.55 * fade).toFixed(3) + ")";
    ctx.lineWidth = size * 0.5;
    ctx.lineCap = "round";
    for (var i = 0; i < 4; i++) {
      var th = i * Math.PI / 2 + 0.4;
      var len = size * (i % 2 ? 1.0 : 1.9);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(th) * len, p.y + Math.sin(th) * len);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    glow(ctx, p, world, "rgba(" + spec[1] + "," + (0.7 * fade).toFixed(3) + ")",
      0.95 * fade);
  }

  // THE FORGE-SLAM LANDING.
  //
  // Not a shockwave: a shockwave is a ring travelling outward through air, and
  // this is a hammer arriving. What sells weight is the ground SPLITTING --
  // cracks that race out from one point, brightest at the centre, plus a hard
  // rim at the edge of the zone so the blow states its own reach.
  //
  // The cracks are deterministic from the impact's seed, so a given blow looks
  // the same for its whole life instead of shimmering frame to frame.
  function drawForgeSlam(ctx, impact) {
    var progress = 1 - impact.life / impact.maxLife;
    var fade = 1 - progress;
    var ease = 1 - Math.pow(1 - progress, 2.6);
    var reach = impact.radius * ease;

    // The split, from the middle outward.
    ctx.lineCap = "round";
    var spokes = 9;
    for (var i = 0; i < spokes; i++) {
      var a = (impact.seed % 360) * Math.PI / 180 + i * (Math.PI * 2 / spokes) +
        (i % 2 ? 0.14 : -0.09);
      var inner = impact.radius * 0.05;
      var outer = reach * (0.62 + 0.38 * ((i * 7 % 5) / 5));
      var p0 = project(x_(impact, a, inner), y_(impact, a, inner), 1);
      var mid = project(x_(impact, a + 0.10, (inner + outer) * 0.5),
                        y_(impact, a + 0.10, (inner + outer) * 0.5), 1);
      var p1 = project(x_(impact, a, outer), y_(impact, a, outer), 1);
      if (!p0 || !p1 || !mid) continue;
      ctx.strokeStyle = "rgba(255,168,92," + (0.55 * fade * fade).toFixed(3) + ")";
      ctx.lineWidth = (3.4 - 2.2 * progress) * p0.scale * 0.5;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(mid.x, mid.y, p1.x, p1.y);
      ctx.stroke();
    }
    ctx.lineCap = "butt";

    // A scorch under the head, and the rim of the zone the blow covered.
    drawGroundRing(ctx, impact.x, impact.y, impact.radius * 0.18 * (1 + ease),
      null, "rgba(255,150,70," + (0.30 * fade * fade).toFixed(3) + ")");
    drawGroundRing(ctx, impact.x, impact.y, reach,
      "rgba(255,206,150," + (0.55 * fade * fade).toFixed(3) + ")", null,
      1 + 2.6 * fade);
    // Dust, thrown up rather than out.
    drawDebrisFan(ctx, impact, progress, "238,184,108");
  }

  // PATH B'S STAKES FIRING.
  //
  // Not a split and not a blast: a RING travelling outward, because what this
  // tier does is hum. Three rings chase each other out of the stakes at
  // different speeds so it reads as sound rather than as one expanding circle,
  // and the ground under them barely moves -- the slow is in the air, not in
  // the floor. Teal throughout, which is the same ley the stakes carry, so the
  // effect and the model are visibly the same system.
  function drawStakeRing(ctx, impact) {
    var progress = 1 - impact.life / impact.maxLife;
    var fade = 1 - progress;
    var full = impact.fullCircle !== false;
    var arc = impact.arcRadians || Math.PI * 2;
    var aim = impact.aim || 0;

    for (var r = 0; r < 3; r++) {
      var lag = r * 0.16;
      var t = (progress - lag) / (1 - lag);
      if (t <= 0) continue;
      var ease = 1 - Math.pow(1 - t, 2.1);
      var radius = impact.radius * ease;
      var a = (0.55 - r * 0.14) * fade * fade;
      if (a <= 0.01) continue;
      var stroke = "rgba(79,227,210," + a.toFixed(3) + ")";
      if (full || arc >= Math.PI * 2 - 0.01) {
        drawGroundRing(ctx, impact.x, impact.y, radius, stroke, null,
          (2.6 - r * 0.6) * fade);
      } else {
        // Only the wedge he actually swung through, so the mark cannot claim
        // reach the tower does not have.
        ctx.lineWidth = (2.6 - r * 0.6) * fade;
        drawGroundCone(ctx, impact.x, impact.y, radius,
          radius * 0.90, aim, arc, stroke, null);
      }
    }
    // A short bright pulse right at the stakes, where the sound starts.
    drawGroundRing(ctx, impact.x, impact.y,
      impact.radius * (0.10 + 0.12 * progress), null,
      "rgba(120,240,225," + (0.34 * fade * fade * fade).toFixed(3) + ")");
  }

  // A BEAM HAS TO OUTLIVE ITS PROJECTILE.
  //
  // Once path A's rail tiers made the shot near-instant it crossed the board in
  // about seven frames, so the beam registered as a flash and was gone -- the
  // firing read as a bug rather than as a shot. This is the afterimage, emitted
  // once by the projectile on death because that is the only moment the whole
  // line is known: where it started, and where the crowd actually stopped it.
  // THE TYRANT'S GAZE, PROJECTED. Two lines from the brow to the tower.
  //
  // The 2D pack draws the same impact by subtracting `liftPx` from y and
  // offsetting the pair in screen space, which is the only height and the only
  // perpendicular a flat board has. Here both are real: the eyes are projected
  // at `liftPx` above the Tyrant's own ground, the tower end at its base, and
  // the pair is separated along the WORLD perpendicular of the shot so the
  // spread stays on the boss's brow as the board turns instead of swinging
  // around the camera. That is the same argument `drawEffects` makes about
  // keeping blasts on the ground plane.
  function drawTyrantGaze(ctx, impact) {
    var rgb = impact.tint || "255,96,72";
    var fade = Math.max(0, Math.min(1, impact.life / impact.maxLife));
    var dx = impact.x2 - impact.x1;
    var dy = impact.y2 - impact.y1;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var spread = impact.spreadPx || 0;
    var nx = -dy / len * spread;
    var ny = dx / len * spread;

    var hit = project(impact.x2, impact.y2, 0);
    if (!hit) return;

    for (var side = -1; side <= 1; side += 2) {
      var eye = project(impact.x1 + nx * side, impact.y1 + ny * side,
        impact.liftPx || 0);
      if (!eye) continue;
      // `left` is 1: unlike a lance, a gaze does not spend itself along its
      // length, so the far end is as hot as the near one. Width follows the
      // hit's own px-per-world scale, which is what keeps a beam the same
      // apparent thickness whether the Tyrant is near the camera or far.
      beam(ctx, eye, hit, rgb, 1.9 * hit.scale, fade, 1);
    }
  }

  function drawLanceRemnant(ctx, impact) {
    var rgb = SHOT_RGB[impact.tint] || SHOT_RGB.neutral;
    var fade = Math.max(0, Math.min(1, impact.life / impact.maxLife));
    var lift = shotLift(impact);
    var a = project(impact.x1, impact.y1, lift);
    var b = project(impact.x2, impact.y2, lift);
    if (!a || !b) return;
    var left = Math.max(0.1, Math.min(1,
      impact.endDamage / Math.max(1, impact.baseDamage)));
    var w = (3.2 + Math.min(1, (impact.baseDamage || 0) / 500) * 4.4) *
      (impact.style === "meridian" ? 1.85 : 1.0) * b.scale;
    // Thins as it fades, which is how a hot line cools. The width carrying the
    // FADE is right; it was width carrying the DAMAGE that read as a cone.
    beam(ctx, a, b, rgb, w, fade, left);
  }

  // B5's guaranteed fourth round arriving. Directional, so the hit CONTINUES
  // the line of the incoming shot instead of blooming as an unrelated circle,
  // and the covenant seal breaks into four arcs travelling away from contact.
  function drawCovenantHit(ctx, impact) {
    var rgb = SHOT_RGB.sigil;
    var fade = Math.max(0, Math.min(1, impact.life / impact.maxLife));
    var age = 1 - fade;
    var snap = Math.max(0, 1 - age * 3.6);
    var ease = 1 - Math.pow(1 - age, 3);
    var lift = shotLift(impact);
    var hit = project(impact.x, impact.y, lift);
    var feet = project(impact.x, impact.y, 0);
    if (!hit) return;
    var px = hit.scale;
    var r = Math.max(16, impact.radius || 24) * px;
    var power = 0.82 + (impact.potency || 0) * 0.18;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // A ground seal under the body, and a tether up to the barrel-height hit,
    // so a mark floating at chest height still reads as connected to feet
    // standing on a specific tile.
    drawGroundRing(ctx, impact.x, impact.y,
      (impact.radius || 24) * (0.36 + ease * 0.72),
      "rgba(" + rgb + "," + (0.62 * fade).toFixed(3) + ")", null, 2.5 * fade);
    if (feet) {
      ctx.strokeStyle = "rgba(" + rgb + "," + (0.18 * fade).toFixed(3) + ")";
      ctx.lineWidth = 3.5 * fade;
      ctx.beginPath();
      ctx.moveTo(hit.x, hit.y); ctx.lineTo(feet.x, feet.y);
      ctx.stroke();
    }

    // The entry stroke, along the round's own heading in WORLD space -- taken
    // from two projected points so it keeps pointing the right way when the
    // camera turns.
    var angle = impact.angle || 0;
    var rearW = (impact.radius || 24) * (0.95 + ease * 0.55);
    var frontW = (impact.radius || 24) * (0.36 + snap * 0.24);
    var back = project(impact.x - Math.cos(angle) * rearW,
                       impact.y - Math.sin(angle) * rearW, lift);
    var front = project(impact.x + Math.cos(angle) * frontW,
                        impact.y + Math.sin(angle) * frontW, lift);
    if (back && front) {
      ctx.strokeStyle = "rgba(" + rgb + "," + (0.24 * fade).toFixed(3) + ")";
      ctx.lineWidth = 13 * power * (0.55 + snap * 0.45) * px;
      ctx.beginPath();
      ctx.moveTo(back.x, back.y); ctx.lineTo(front.x, front.y); ctx.stroke();
      ctx.strokeStyle = "rgba(255,245,255," +
        (0.92 * (0.35 + snap * 0.65)).toFixed(3) + ")";
      ctx.lineWidth = 2.6 * power * (0.65 + snap * 0.35) * px;
      ctx.beginPath();
      ctx.moveTo(back.x, back.y); ctx.lineTo(front.x, front.y); ctx.stroke();
    }

    // Broken covenant seal: four separated arcs expanding away from contact.
    // Screen-facing, because this one is not on the ground -- it is around the
    // wound, at the height the round went in.
    ctx.strokeStyle = "rgba(" + rgb + "," + (0.82 * fade).toFixed(3) + ")";
    ctx.lineWidth = Math.max(0.8, 2.4 * fade);
    var sealR = r * (0.28 + ease * 0.64);
    for (var arc = 0; arc < 4; arc++) {
      var start = angle + arc * Math.PI * 0.5 + 0.16;
      ctx.beginPath();
      ctx.arc(hit.x, hit.y, sealR, start, start + 0.72);
      ctx.stroke();
    }
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
  }

  // The ability landing. Emitted by resolveChannel at the instant the damage
  // is applied, so what the player sees and what the simulation did are the
  // same event rather than two things that happen to agree.
  function drawStrike(ctx, impact) {
    var rgb = SHOT_RGB.sigil;
    var fade = Math.max(0, Math.min(1, impact.life / impact.maxLife));
    var age = 1 - fade;
    var r = impact.radiusPx || impact.radius || 26;
    var snap = Math.max(0, 1 - age * 5);

    // The column the channel telegraphed, arriving: a shaft that slams down and
    // collapses. Four projected corners, so it stands in the world.
    var high = 520 * (1 - Math.pow(age, 0.35));
    if (high > 2) {
      var w = r * 0.42 * (0.4 + 0.6 * snap);
      var bl = project(impact.x - w, impact.y, 0);
      var br = project(impact.x + w, impact.y, 0);
      var tl = project(impact.x - w, impact.y, high);
      var tr = project(impact.x + w, impact.y, high);
      if (bl && br && tl && tr) {
        var g = ctx.createLinearGradient(tl.x, tl.y, bl.x, bl.y);
        g.addColorStop(0, "rgba(" + rgb + ",0)");
        g.addColorStop(1, "rgba(255,240,255," + (0.55 * fade).toFixed(3) + ")");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y);
        ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y);
        ctx.closePath();
        ctx.fill();
      }
    }

    // The seal it lands on, thrown outward and fading, plus a counter-rotating
    // inner ring, so the mark is clearly the ritual resolving rather than a
    // generic explosion.
    var spin = age * 6;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,244,255," + (0.9 * fade * fade).toFixed(3) + ")";
    ritualRing(ctx, impact.x, impact.y, r * (0.35 + age * 0.85), spin, 12,
      1 + 3 * fade);
    ctx.strokeStyle = "rgba(" + rgb + "," + (0.55 * fade).toFixed(3) + ")";
    ritualRing(ctx, impact.x, impact.y, r * (0.9 - age * 0.55), -spin * 1.7, 6,
      1 + 1.6 * fade);
    ctx.lineCap = "butt";
    // And the scorch, which outlasts both.
    drawGroundRing(ctx, impact.x, impact.y, r * 0.8, null,
      "rgba(" + rgb + "," + (0.20 * fade * fade).toFixed(3) + ")");
  }

  // One bar, three kinds of owner. Towers, enemies and recruits each keep their
  // health under a different pair of names, so the ONLY thing that varies is
  // where the numbers come from -- the bar itself is identical, which is the
  // point: "this thing has hit points" should look the same whoever owns it.
  // The people he armed, firing. Their round already leaves the end of their
  // rifle rather than the middle of the man (js/soldier.js), so the flash reads
  // the SAME statics -- one number for both, or the light drifts off the barrel
  // the moment either is tuned.
  function drawRecruitFlash(ctx, recruit) {
    var sps = recruit.stats && recruit.stats.shotsPerSecond;
    if (!(sps > 0) || !(recruit.cooldown > 0)) return;
    var age = 1 / sps - recruit.cooldown;
    if (age < 0 || age > 0.05) return;
    var fade = 1 - age / 0.05;
    var b5 = recruit.visualTier === "B5";
    var reach = ul(b5 ? SoldierRecruit.MUZZLE_B5_UL : SoldierRecruit.MUZZLE_B4_UL);
    var p = project(recruit.x + Math.cos(recruit.facing) * reach,
                    recruit.y + Math.sin(recruit.facing) * reach,
                    ul(SoldierRecruit.MUZZLE_HEIGHT_UL));
    if (!p) return;
    var spec = RIFLEMAN_SHOTS[b5 ? "recruit-b5" : "recruit-b4"];
    glow(ctx, p, (2.6 + spec[2]) * fade,
      "rgba(" + spec[1] + "," + (0.75 * fade).toFixed(3) + ")", 0.8 * fade);
  }

  // How high above a thing its readout belongs, in world units. Measured from
  // the MODEL when there is one -- see the note on `model.top` in gl-models.js
  // -- and from the actor's own radius when it is a sphere or a stand-in.
  function crownOf(actor, model, fallbackRadius, scale) {
    var m = model ? GLModels.get(renderer, model) : null;
    if (m && m.top) return m.top * m.unitsToPx * (scale || 1) + 10;
    return (fallbackRadius || 11) * 2.6;
  }

  function towerCrown(t) {
    return crownOf(t, towerModel(t), t.footprintPx, 1);
  }

  function enemyCrown(e) {
    var r = e.radiusPx ? e.radiusPx() : 11;
    // crownOf measures the MODEL; `bodyLift` is where that model currently is.
    // Without the second term a Wisp's health bar hangs at road height, level
    // with its own dangling legs, while the body floats above it -- and the
    // same was true of the Healer's the moment it started to hover, which is
    // why that function answers for both.
    return crownOf(e, enemyModel(e), r, r / 11) + bodyLift(e, r);
  }

  // THE TOP OF THE BODY ITSELF, which is not the same number as its crown.
  // `crownOf` adds 10 px of headroom because it answers "where does the health
  // bar go"; an OCCLUDER that inherits that headroom stands ten pixels taller
  // than the thing it is standing in for and hides whatever passes over the
  // model's head. Measured from the model's own `top` for exactly the reason
  // crownOf is -- a guessed height under-occludes the upper body, which is the
  // half of a tower a cord most often crosses.
  //
  // Handed to the FX modules through BLUB_FX_API; js/gl/siphon-beam-draw.js
  // builds one screen-space capsule per actor out of this plus the actor's own
  // authored radius. Nothing else uses it yet.
  function bodyTopOf(actor, model, fallbackRadius, scale) {
    var m = model ? GLModels.get(renderer, model) : null;
    if (m && m.top) return m.top * m.unitsToPx * (scale || 1);
    return (fallbackRadius || 11) * 2.2;
  }

  function towerTop(t) {
    return bodyTopOf(t, towerModel(t), t.footprintPx, 1);
  }

  // DELIBERATELY NOT LIFTED, unlike enemyCrown above, and this is a known seam
  // rather than an oversight. siphon-beam-draw builds its capsule from a BASE at
  // `groundAt(actor)` plus this height, so adding bodyLift here would not move
  // the occluder up -- it would STRETCH it from the road to the flier's head and
  // mask every cord crossing the empty air beneath a Wisp. Over-occlusion is the
  // failure that photographs as success. Occluding a flier correctly needs a
  // lifted BASE, which is a change to the occluder's signature in
  // js/gl/siphon-beam-draw.js, not to this measurement. Until then a cord shows
  // through a Wisp, which is what it did before fliers were raised at all.
  function enemyTop(e) {
    var r = e.radiusPx ? e.radiusPx() : 11;
    return bodyTopOf(e, enemyModel(e), r, r / 11);
  }

  function bar(ctx, actor, kind) {
    var max, now, pos, lift, w;
    if (kind === "tower") {
      max = actor.maxHp; now = actor.currentHp;
      pos = actor; lift = towerCrown(actor); w = 34;
    } else if (kind === "recruit") {
      max = actor.maxHp; now = actor.hp;
      pos = actor;
      lift = crownOf(actor, recruitModel(actor), 9, 1); w = 20;
    } else {
      max = actor.maxHealth; now = actor.health;
      pos = actor.pos;
      lift = enemyCrown(actor); w = 22;
    }
    // A SHIELD IS A SECOND POOL, AND IT EMPTIES FIRST.
    //
    // Reading only `health` meant a Bulwark could take a dozen hits with
    // nothing to show for it -- every one of them lands on the shield, health
    // stays full, and the bar suppressed itself as undamaged. Two pools that
    // empty in sequence read wrongly as one, which is the same reason the 2D
    // hover card gives the shield its own figure and its own strip.
    var shield = 0, shieldMax = 0;
    if (kind === "enemy" && actor.shieldMax > 0) {
      shield = Math.max(0, actor.shield);
      shieldMax = actor.shieldMax;
    }
    var hurt = (max && now < max) || (shieldMax && shield < shieldMax);
    if (!max || now === undefined || now === null || !hurt) return;
    var p = project(pos.x, pos.y, lift);
    if (!p) return;
    var frac = Math.max(0, Math.min(1, now / max));
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(p.x - w / 2, p.y, w, 5);
    ctx.fillStyle = frac > 0.5 ? "#61d973" : (frac > 0.25 ? "#e8c34a" : "#e06a6a");
    ctx.fillRect(p.x - w / 2, p.y, w * frac, 5);
    if (shieldMax > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(p.x - w / 2, p.y - 4, w, 3);
      ctx.fillStyle = "#8fdcf0";
      ctx.fillRect(p.x - w / 2, p.y - 4,
        w * Math.max(0, Math.min(1, shield / shieldMax)), 3);
    }
  }

  // THE HOVER READOUT.
  //
  // The 2D branch draws this itself, in drawEnemyHover and drawRecruitHover,
  // both of which live inside the world block 3D replaces -- so pointing at a
  // body in 3D produced a ring and no numbers at all.
  //
  // One panel, not two: the figure and, directly under it, the bar it
  // describes, sharing a border. Screen-space and screen-sized, because it is
  // interface -- but ANCHORED to the projected crown of the body, so it follows
  // whatever the camera is doing.
  function hoverCard(ctx, lines, anchorPt, accent, bars) {
    if (!anchorPt) return;
    ctx.font = "600 12px system-ui, sans-serif";
    var PAD = 7, TEXT_H = 13, BAR_H = 6, GAP = 4;
    var i, barW = 58;
    for (i = 0; i < lines.length; i++) {
      barW = Math.max(barW, Math.ceil(ctx.measureText(lines[i]).width));
    }
    var boxW = barW + PAD * 2;
    var boxH = PAD + lines.length * TEXT_H + (bars.length ? GAP : 0) +
      bars.length * (BAR_H + 2) + PAD;

    // Above the body, flipped below when that would leave the canvas -- which
    // it does along the top run of every route.
    var boxX = Math.max(4, Math.min(anchorPt.x - boxW / 2, 1280 - 4 - boxW));
    var boxY = anchorPt.y - 12 - boxH;
    if (boxY < 4) boxY = anchorPt.y + 16;

    ctx.fillStyle = "rgba(20,22,30,0.94)";
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.lineWidth = 1;
    ctx.strokeStyle = accent + "0.55)";
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    ctx.fillStyle = "#ffd76e";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], boxX + boxW / 2,
        boxY + PAD + TEXT_H * i + TEXT_H / 2);
    }
    var barY = boxY + PAD + lines.length * TEXT_H + GAP;
    for (i = 0; i < bars.length; i++) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(boxX + PAD, barY, barW, BAR_H);
      ctx.fillStyle = bars[i].color;
      ctx.fillRect(boxX + PAD, barY,
        barW * Math.max(0, Math.min(1, bars[i].frac)), BAR_H);
      barY += BAR_H + 2;
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  function drawEnemyCard(ctx, e) {
    var label = Math.max(0, e.health) + " / " + e.maxHealth + " HP";
    if (e.shieldMax > 0) {
      label += " + " + Math.max(0, Math.round(e.shield)) + " shield";
    }
    var bars = [{ frac: e.health / e.maxHealth, color: "#61d973" }];
    if (e.shieldMax > 0) {
      bars.push({ frac: e.shield / e.shieldMax, color: "#8fdcf0" });
    }
    hoverCard(ctx, [label], project(e.pos.x, e.pos.y, enemyCrown(e)),
      "rgba(255,215,110,", bars);
  }

  function drawRecruitCard(ctx, r) {
    // Its own reach, so "what does this one actually cover" is answerable by
    // pointing at it -- the rule every tower already follows.
    drawGroundRing(ctx, r.x, r.y, r.rangePx,
      "rgba(196,140,255,0.45)", "rgba(196,140,255,0.06)");
    var hitR = ul(Soldier.RECRUIT_RADIUS_UL) +
      ((typeof Enemy !== "undefined" && Enemy.HOVER_PAD_PX) || 4);
    drawGroundRing(ctx, r.x, r.y, hitR, "rgba(216,178,108,0.95)", null, 2);
    hoverCard(ctx, [r.hoverLabel ? r.hoverLabel() :
        Math.max(0, Math.round(r.hp)) + " / " + r.maxHp + " HP"],
      project(r.x, r.y, crownOf(r, recruitModel(r), 9, 1)),
      "rgba(216,178,108,",
      [{ frac: r.hp / r.maxHp, color: "#61d973" }]);
  }

  // --- input ---------------------------------------------------------------

  // The replacement for game.js's screenToWorld. Everything that places,
  // inspects, hovers or aims comes through here.
  //
  // `x`/`y` arrive in the game's LOGICAL space (0..1280, 0..720) because
  // `toGameCoords` put them there. The first version divided by
  // `uiCanvas.width` -- the BACKING STORE, which is CSS pixels times the
  // device ratio and neither of the two spaces involved. Placement, hover and
  // tower clicks all landed at an offset that changed with the window size.
  function screenToWorld(x, y) {
    if (!enabled) return null;
    var c = camera.viewToClient(x, y);
    var p = camera.groundAt(c[0], c[1]);
    // Off the ground plane -- above the horizon. A point nothing can be at,
    // so hit tests miss rather than matching something at the origin.
    return p ? { x: p[0], y: p[1] } : { x: -99999, y: -99999 };
  }

  return {
    install: install,
    isEnabled: function () { return enabled; },
    camera: function () { return camera; },
    renderer: function () { return renderer; },
    drawWorld: drawWorld,
    drawOverlays: drawOverlays,
    screenToWorld: screenToWorld,
    // WHICH BODY AN ACTOR IS WEARING, published rather than re-derived.
    //
    // js/gl/tower-preview.js has asked for `modelFor` since it was written --
    // its own comment says the per-tier rule "is not duplicated here, because a
    // second copy of a tiering rule is a second copy that drifts" -- and it was
    // never exported, so `World3D.modelFor` was permanently undefined and EVERY
    // preview in the interface fell through to the base body regardless of tier.
    // The build bar and the store cards are drawing a TYPE, which has no tiers,
    // so they were right by accident; anything showing a LIVE tower was not.
    //
    // The two resolvers below and the two band helpers are the whole contract a
    // preview needs. Exporting them is what keeps js/gl/model-viewer.js from
    // owning a second copy of five tier selectors and a band validator.
    modelFor: towerModel,
    enemyModelFor: enemyModel,
    walkBand: walkBand,
    // AND WHICH BAND THIS PARTICULAR BODY IS IN, which `walkBand` cannot say:
    // it takes a model and the model does not know how far down the road the
    // thing wearing it has come. Exported for the same reason `walkBand` is --
    // so a test and the model viewer ask the renderer rather than keeping a
    // second copy of the table -- and because the Vanguard's two gaits are
    // otherwise unassertable from outside this file.
    gaitBand: gaitBand,
    bandFrame: bandFrame,
    // WHAT DRIVES A BODY'S ANIMATION, for a viewer that has no road under it.
    //
    // `walkBand` says WHICH frames are the walk; this says HOW FAST to step
    // them, and it is the seam the codex's enemy viewer was re-deriving.
    //
    // Returns a rate in CYCLES PER SECOND for a body whose animation is driven
    // by a CLOCK, and **null for every body whose animation is driven by
    // DISTANCE** -- which is all of them except the flier and the hovering
    // Healer; `clockRate` is where those two are enumerated. That null is the
    // useful half of the answer: it tells a caller that this body has no
    // authored rate at all, so a viewer standing it still has to invent one
    // (the codex derives speed/stride, which is the right thing to do and is
    // the caller's business, not this file's).
    //
    // WHY A FUNCTION AND NOT THE CONSTANT. Copying `2.6` into the codex would
    // put a second copy of a number in a file that will never be the one
    // retuned, and the failure mode is silent: the viewer would go on beating
    // the old rate after HOVER_HZ moved, and nothing renders wrong enough to
    // notice. Asking for the rule survives the retune. Measured 2026-08-14:
    // the codex's own derivation gives the Wisp 2.567 against this 2.6 -- close
    // by luck rather than by construction, and the next flier will not be.
    animHz: function (enemy) {
      return clockRate(enemy) || null;
    },
    // The board's height under a point, and whether a footprint sits on ONE
    // level. Presentation-derived, but the placement rule reads the second one:
    // a tower bridging a deck edge is half planted and half in mid-air, and
    // that is a picture no amount of shading fixes. Both answer safely when
    // there is no 3D board at all, so the 2D fallback keeps its old behaviour.
    // `ignoreDeck` passes straight through: a caller asking what a FLIER is over
    // wants the ground, not the depot's ramp. Dropped here for one commit, which
    // made every probe of the second layer answer with the first.
    groundHeightAt: function (x, y, ignoreDeck) {
      return enabled ? groundHeightAt(x, y, ignoreDeck) : 0;
    },
    // The board's height field itself, read-only, for a test that has to prove
    // a scenery change did not move a build spot. The PICTURE not changing is
    // not that proof -- placement reads this, never the screen.
    heightField: function () {
      if (!heightField) return null;
      return { minX: heightField.minX, minY: heightField.minY,
               w: heightField.w, h: heightField.h, cell: HEIGHT_CELL,
               data: heightField.data };
    },
    mapMeshInfo: function () {
      return { triangles: mapMesh ? mapMesh.count / 3 : 0,
               vertices: mapMesh ? mapMesh.count : 0,
               drawCalls: mapMesh ? 1 : 0,
               bounds: bounds };
    },
    isLevelUnder: function (x, y, radius) {
      if (!enabled || !heightField) return true;
      return levelUnder(x, y, radius).flat;
    },
    resize: resize,
    // THE STRIKE SEAM, PUBLISHED SO A TEST CAN ASK RATHER THAN INFER.
    //
    // Reports the constants the strike is actually running on and, more
    // importantly, `missingGroupOn` -- every model that was asked for the
    // override group and did not carry it. A body drawing its plain walk
    // because the lookup missed is pixel-for-pixel identical to one that has
    // not attacked, so no capture can tell the two apart; a test asserts this
    // list is EMPTY instead. Same reason SiphonFXBeam exports setOcclusion.
    //
    // STRICTLY READ-ONLY, AND IT HANDS OUT COPIES -- WHICH IT DID NOT AT FIRST,
    // AND THAT WAS A TRAP WITH A DEMONSTRATED FAILURE BEHIND IT.
    //
    // The first version assigned the live record objects into its result. A
    // caller could then write `strikeSeam("enemy-angry").spec.pitch = 0` and
    // corrupt the renderer's own constants from something that reads like a
    // getter. juno hit exactly that shape in her own probe: a save/restore
    // around a swept rotation where two aborted calls interleaved, so the
    // "saved" value was itself mid-sweep and the restore wrote 0. **A zeroed
    // gesture is a flawless-looking REST POSE** -- every control still
    // passes, the body still draws, and nothing anywhere reports a fault.
    //
    // So: deep-copied, including the pivot array, which is the one a shallow
    // copy would still have shared. Neither channel is a knob any more either --
    // the override is `pitch * attackFlash` and `slide * attackFlash`, so
    // **sweeping the flash sweeps the whole gesture** (flash 0.5 is exactly
    // half of both). That runs
    // through the game's own drive, cannot corrupt anything, and needs no
    // write path here at all.
    strikeSeam: function (model) {
      var missing = [];
      for (var k in strikeMissing) missing.push(k);
      function copy(s) {
        return s ? { group: s.group, pivot: s.pivot.slice(),
                     pitch: s.pitch, slide: s.slide } : null;
      }
      var specs = {};
      for (var mk in STRIKE_BY_MODEL) specs[mk] = copy(STRIKE_BY_MODEL[mk]);
      return {
        models: specs,
        spec: model ? copy(STRIKE_BY_MODEL[model]) : null,
        missingGroupOn: missing,
        // The matrix the renderer ACTUALLY built on its last striking body,
        // copied out. A check that re-derives it from the published constants
        // agrees with itself and proves nothing about the pivot; this is the
        // one the geometry went through. Copied rather than handed over,
        // because the live one is scratch that the next body overwrites.
        last: strikeLast ? {
          model: strikeLast.model, flash: strikeLast.flash,
          group: strikeLast.group,
          matrix: Array.prototype.slice.call(strikeMat)
        } : null
      };
    }
  };
})();
