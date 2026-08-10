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

  function buildHeightField(minX, minY, maxX, maxY, env, routePaths, roadWidth) {
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

    // Zones, using the SAME tops the geometry above emits, so the height an
    // actor stands at and the surface it is standing on cannot drift apart.
    ((env && env.zones) || []).forEach(function (z) {
      var zh = ZONE_HEIGHT[z.kind];
      if (zh === undefined || !z.w || !z.h) return;
      var zw = ul(z.w / AUTHORED_PX_PER_UL), zd = ul(z.h / AUTHORED_PX_PER_UL);
      var cx = ul(z.x / AUTHORED_PX_PER_UL) + zw / 2;
      var cy = ul(z.y / AUTHORED_PX_PER_UL) + zd / 2;
      var thickness = Math.max(1.5, Math.abs(zh));
      var top = (zh < 0 ? -0.2 : 0.4) + thickness;
      stampRect(cx - zw / 2 - 3.5, cy - zd / 2 - 3.5,
                cx + zw / 2 + 3.5, cy + zd / 2 + 3.5, top - 0.6);   // the rim
      stampRect(cx - zw / 2, cy - zd / 2, cx + zw / 2, cy + zd / 2, top);
    });

    // The road, stamped as a real band rather than a bounding box, or every
    // corner would raise a square of open floor beside it.
    var half = roadWidth / 2;
    routePaths.forEach(function (p) {
      var pts = p.points;
      for (var s = 0; s + 1 < pts.length; s++) {
        var ax = pts[s].x, ay = pts[s].y, bx = pts[s + 1].x, by = pts[s + 1].y;
        var dx = bx - ax, dy = by - ay;
        var len2 = dx * dx + dy * dy;
        var i0 = Math.max(0, Math.floor((Math.min(ax, bx) - half - minX) / HEIGHT_CELL));
        var i1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + half - minX) / HEIGHT_CELL));
        var j0 = Math.max(0, Math.floor((Math.min(ay, by) - half - minY) / HEIGHT_CELL));
        var j1 = Math.min(h - 1, Math.ceil((Math.max(ay, by) + half - minY) / HEIGHT_CELL));
        for (var j = j0; j <= j1; j++) {
          for (var i = i0; i <= i1; i++) {
            var px = minX + (i + 0.5) * HEIGHT_CELL, py = minY + (j + 0.5) * HEIGHT_CELL;
            var t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
            t = t < 0 ? 0 : (t > 1 ? 1 : t);
            var qx = px - (ax + dx * t), qy = py - (ay + dy * t);
            if (qx * qx + qy * qy > half * half) continue;
            var k = j * w + i;
            if (ROAD_LIFT > data[k]) data[k] = ROAD_LIFT;
          }
        }
      }
    });

    return f;
  }

  // The height of the surface under (x, y). Presentation only -- nothing in the
  // simulation reads it, and every distance the game measures is still flat.
  function groundHeightAt(x, y) {
    var f = heightField;
    if (!f) return 0;
    var i = Math.floor((x - f.minX) / HEIGHT_CELL);
    var j = Math.floor((y - f.minY) / HEIGHT_CELL);
    if (i < 0) i = 0; else if (i >= f.w) i = f.w - 1;
    if (j < 0) j = 0; else if (j >= f.h) j = f.h - 1;
    return f.data[j * f.w + i];
  }

  // Does a footprint sit on ONE level? A tower straddling a deck edge ends up
  // half planted and half hanging in the air, which is the read the placement
  // rule below exists to refuse. Samples the rim of the footprint as well as
  // its centre, because a small tower can bridge an edge with its middle clear.
  function levelUnder(x, y, radius) {
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
  // How proud of the floor the road ribbon sits. Read by BOTH the mesh and the
  // height field, so the surface an enemy is drawn standing on is the same
  // number as the surface that was built under it.
  var ROAD_LIFT = 7;
  // Mirrors js/game.js. Zones are authored in that space and `Maps.routesOf`
  // has already applied it to route points.
  var AUTHORED_PX_PER_UL = 1.04;

  // Which zone kinds are floor. The other nineteen are props -- consoles,
  // pylons, crystals -- and are deliberately absent rather than faked as slabs.
  var ZONE_HEIGHT = { deck: 9, bay: 5, hazard: 2.5, "void": -4 };

  var prims = null;

  // The action occupies the first part of a firing cycle and the rest is the
  // aimed pose held -- a weapon still cycling when the next shot leaves reads
  // wrong. Same share the sprite pack used.
  var WORK_SHARE = 0.45;

  // --- palette -------------------------------------------------------------

  function paletteFor(map) {
    var t = (typeof Maps !== "undefined" && Maps.themeOf)
      ? (Maps.themeOf(map) || {}) : {};
    function hex(v, fallback) { return GLGeometry.hex(v || fallback); }
    function triple(v, fallback) {
      if (!v) return GLGeometry.hex(fallback);
      var p = String(v).split(",");
      return p.length === 3
        ? [Math.pow(+p[0] / 255, 2.2), Math.pow(+p[1] / 255, 2.2),
           Math.pow(+p[2] / 255, 2.2)]
        : GLGeometry.hex(fallback);
    }
    return {
      terrain: hex(t.floor, "#0c2633"),
      terrainEdge: hex(t.panelDark, "#081d29"),
      panel: hex(t.panel, "#123848"),
      metal: hex(t.metal, "#263f4c"),
      metalDark: hex(t.metalDark, "#132733"),
      roadTop: hex(t.roadInner, "#274553"),
      roadSide: hex(t.roadOuter, "#0a1922"),
      accent: triple(t.accent, "#4FE3D2")
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
    minX = Math.min(minX - 120, 0);
    minY = Math.min(minY - 120, 0);
    maxX = Math.max(maxX + 120, typeof VIEW_WIDTH === "number" ? VIEW_WIDTH : 1280);
    maxY = Math.max(maxY + 120, typeof VIEW_HEIGHT === "number" ? VIEW_HEIGHT : 720);

    var g = new GLGeometry.Builder();
    GLGeometry.ground(g, minX, minY, maxX, maxY, 0, P.terrain);

    var step = 200;
    for (var gx = Math.ceil(minX / step) * step; gx < maxX; gx += step) {
      GLGeometry.box(g, gx, (minY + maxY) / 2, 2.5, maxY - minY, 1.2,
        P.terrainEdge);
    }
    for (var gy = Math.ceil(minY / step) * step; gy < maxY; gy += step) {
      GLGeometry.box(g, (minX + maxX) / 2, gy, maxX - minX, 2.5, 1.2,
        P.terrainEdge);
    }

    var env = (typeof Maps !== "undefined" && Maps.ENVIRONMENTS && map)
      ? Maps.ENVIRONMENTS[map.id] : null;
    ((env && env.zones) || []).forEach(function (z) {
      var h = ZONE_HEIGHT[z.kind];
      if (h === undefined || !z.w || !z.h) return;
      var w = ul(z.w / AUTHORED_PX_PER_UL), d = ul(z.h / AUTHORED_PX_PER_UL);
      var cx = ul(z.x / AUTHORED_PX_PER_UL) + w / 2;
      var cy = ul(z.y / AUTHORED_PX_PER_UL) + d / 2;
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

    var roadWidth = ul(ROAD_WIDTH_UL);
    routePaths.forEach(function (p) {
      GLGeometry.road(g, p.points, roadWidth, ROAD_LIFT, P.roadTop, P.roadSide);
    });

    // The authored scenery. Each map names nine props and until now the 3D
    // board drew none of them, so every route ran across a bare plane while the
    // 2D thumbnails showed a decorated one. They are baked into this static
    // mesh rather than drawn as actors: they never move, never animate and
    // never turn, so they cost one-off build time and nothing per frame.
    //
    // Placed in the SAME authored-pixel space as the zones above, so a prop
    // sits where maps.js says it does relative to the deck it belongs to.
    ((env && env.models) || []).forEach(function (m) {
      if (!m || !m.kind) return;
      GLGeometry.scenery(g, m.kind,
        ul(m.x / AUTHORED_PX_PER_UL), ul(m.y / AUTHORED_PX_PER_UL),
        ul((m.size || 44) / AUTHORED_PX_PER_UL), m.rotation || 0, P);
    });

    bounds = { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    heightField = buildHeightField(minX, minY, maxX, maxY, env, routePaths,
      roadWidth);
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
    if (tower.monsterTier && tower.monsterTier.tier !== undefined) {
      return "blub-monster-t" + tower.monsterTier.tier;
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

  // Only the four authored enemies have meshes. EVERY OTHER TYPE IS A SPHERE,
  // in its own colour at its own radius -- the exact 3D spelling of what the
  // 2D game drew for them, which was a circle. One mesh per type, built lazily
  // and cached; the per-frame scale handles fractal shrinkage.
  var typePrims = Object.create(null);

  function enemyModel(enemy) {
    var id = enemy && enemy.typeId;
    if (GLModels.has("enemy-" + id)) return "enemy-" + id;
    return null;
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
    ensureMap(state.map, state.paths);
    camera.update(state.dt || 1 / 60);
    // ONE DIFF PASS, once per frame, before anything is drawn: which blubs are
    // still standing and which vanished since the last frame. It is idempotent
    // on `state.now`, so it does not matter that drawOverlays also touches the
    // module later in the same frame.
    if (typeof BlubFXSystems !== "undefined") BlubFXSystems.update(state);

    var vp = camera.viewProjection();
    renderer.begin(vp);
    // The board's scenery carries its own emission, so the map pass is drawn
    // with the glow driven. Constant, not animated: these are installations
    // that are simply switched on, and a breathing board would pull the eye off
    // the things that actually change. Reset immediately so a tower that does
    // not set its own glow cannot inherit the board's.
    renderer.setGlow(1, mapPalette ? mapPalette.accent : null);
    renderer.draw(mapMesh, 0, 0, 0, 0, 1);
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
        // Crosspath marks, drawn OVER an unchanged body at the same transform.
        // Authored around their own seat, so they need no offset here -- and
        // because they are separate models the body underneath is literally the
        // same vertices with or without them, which is the rule they exist to
        // satisfy rather than a discipline to remember.
        var marks = (t.constructor && t.constructor.ID === "blub")
          ? summonerMarks(t) : null;
        for (var mi = 0; marks && mi < marks.length; mi++) {
          drawActor(marks[mi], t.x + kx, t.y + ky, drawYaw, 1, tz, 0);
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
          var rFrames = rm && rm.frames.length ? rm.frames.length : 1;
          var rFrame = rc.holding ? 0
            : Math.floor((rc.progress || 0) / 26 * rFrames);
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
    for (i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
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
      if (model) {
        // THE WALK, ADVANCED BY DISTANCE. One full cycle per stride, so a
        // planted foot stays on one patch of road, a slowed enemy's legs drag
        // and a stopped one stops mid-step -- all for free, and all wrong the
        // moment a clock drives it instead. Same rule the sprite pack used.
        var em = GLModels.get(renderer, model);
        var frames = em && em.frames.length ? em.frames.length : 1;
        var walk = Math.floor((e.progress || 0) / stride * frames);
        drawActor(model, e.pos.x, e.pos.y, yaw, radius / 11,
          groundHeightAt(e.pos.x, e.pos.y), walk);
      } else {
        // Sphere types ROLL their bounce instead: squash on the ground beat,
        // stretch at the top, which is the one animation a ball actually has.
        var beat = Math.abs(Math.sin(phase));
        renderer.draw(enemySphere(e).mesh, e.pos.x, e.pos.y,
          groundHeightAt(e.pos.x, e.pos.y) + beat * radius * 0.22, yaw,
          radius * (0.94 + beat * 0.10));
      }
    }
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

  function drawActor(model, x, y, yaw, scale, lift, frame, overrides) {
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
      GLMath.modelYaw(instanceMat, x, y, lift || 0, yaw || 0, size);
      if (!bound) renderer.bind(m.gpu);
      renderer.drawRange(instanceMat, fixed, m.gpu.count - fixed);
      return;
    }
    GLMath.modelYaw(instanceMat, x, y, lift || 0, yaw || 0, size);
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
  var BLUB_FX_API = {
    project: project,
    withGround: withGround,
    groundAt: groundHeightAt
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

    // The hovered enemy's hit ring, at exactly the radius that can be pointed
    // at -- the 2D rule: what you see is what you can click. The readout that
    // goes with it is drawn after the bars, so it lands on top of them.
    if (state.hoveredEnemy && !state.hoveredEnemy.dead) {
      var he = state.hoveredEnemy;
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
    var to = groundHeightAt(shot.target.pos.x, shot.target.pos.y);
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
    // Four kinds are NOT that shape and are dispatched by name, exactly as the
    // 2D pack registers a renderer per kind. A beam remnant is a line between
    // two endpoints; running it through the circle path drew an expanding ring
    // hundreds of pixels wide, centred on the middle of the shot.
    for (i = 0; i < s.aoeImpacts.length; i++) {
      var impact = s.aoeImpacts[i];
      var kind = impact.kind || "area";
      if (kind === "warbringer-swing") { drawForgeSlam(ctx, impact); continue; }
      if (kind === "warbringer-ring") { drawStakeRing(ctx, impact); continue; }
      if (kind === "lance-remnant") { drawLanceRemnant(ctx, impact); continue; }
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
      var h = Math.max(0, 46 * t - 78 * t * t);
      var head = project(p.x, p.y, h);
      if (!head) continue;
      // The tail is where it was a moment ago, so the streak points along the
      // actual path instead of at a guessed angle.
      var back = 0.055;
      var ht = Math.max(0, t - back);
      var tail = project(p.x - p.vx * back, p.y - p.vy * back,
        Math.max(0, 46 * ht - 78 * ht * ht));
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

    // Popups are TEXT, so they stay at screen size whatever the zoom -- a
    // bounty you cannot read is a bounty that may as well not have printed.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (i = 0; i < s.popups.length; i++) {
      p = s.popups[i];
      var alpha = Math.min(1, p.life / (p.maxLife * 0.5));
      var at = project(p.x, p.y, 30 + (1 - p.life / p.maxLife) * 22);
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
    return crownOf(e, enemyModel(e), r, r / 11);
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
    // The board's height under a point, and whether a footprint sits on ONE
    // level. Presentation-derived, but the placement rule reads the second one:
    // a tower bridging a deck edge is half planted and half in mid-air, and
    // that is a picture no amount of shading fixes. Both answer safely when
    // there is no 3D board at all, so the 2D fallback keeps its old behaviour.
    groundHeightAt: function (x, y) { return enabled ? groundHeightAt(x, y) : 0; },
    isLevelUnder: function (x, y, radius) {
      if (!enabled || !heightField) return true;
      return levelUnder(x, y, radius).flat;
    },
    resize: resize
  };
})();
