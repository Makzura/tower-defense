// ---------------------------------------------------------------------------
// Ironwood Frontier's living ground.
//
// The gameplay terrain stays the same perfectly flat z = 0 plane. This module
// OWNS that one visual plane: grass, worn earth and moss are blended into the
// SAME triangles, then sparse low blades give silhouette depth. The route is
// built later at z = 7, so it remains the clearest surface
// on the board, while tufts are kept away from its exact ribbon and from
// authored solid scenery.
//
// Kept out of gl-geometry.js on purpose. Trees are an independent authored
// asset family and can change without touching the ground system.
// ---------------------------------------------------------------------------

var IronwoodGround = (function () {
  "use strict";

  var lastStats = null;

  function hashInts(ix, iy, salt) {
    var h = Math.imul(ix ^ (salt * 374761393), 668265263);
    h = Math.imul(h ^ iy, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return (h >>> 0) / 4294967295;
  }

  function hash(x, y, salt) {
    return hashInts(Math.floor(x * 0.173 + 0.5),
      Math.floor(y * 0.197 + 0.5), salt);
  }

  function colour(list, x, y, salt) {
    return list[Math.min(list.length - 1,
      Math.floor(hash(x, y, salt) * list.length))];
  }

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t];
  }

  function smoothstep(a, b, value) {
    var t = (value - a) / (b - a);
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return t * t * (3 - 2 * t);
  }

  function noise(x, y, scale, salt) {
    var gx = Math.floor(x / scale), gy = Math.floor(y / scale);
    var tx = x / scale - gx, ty = y / scale - gy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    // `gx` and `gy` are already lattice coordinates. Feeding them through the
    // world-position hash quantised six neighbouring cells to one value and
    // stretched a 118-unit texture into a near-uniform 700-unit wash.
    var a = hashInts(gx, gy, salt), b = hashInts(gx + 1, gy, salt);
    var c = hashInts(gx, gy + 1, salt), d = hashInts(gx + 1, gy + 1, salt);
    return (a + (b - a) * tx) +
      ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  }

  function surfaceZ(x, y) {
    return (noise(x, y, 190, 901) - 0.5) * 1.00 +
      (noise(x, y, 58, 902) - 0.5) * 0.35;
  }

  function smoothTri(builder, a, b, c, ca, cb, cc, tone) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var nx = uy * vz - uz * vy;
    var ny = uz * vx - ux * vz;
    var nz = ux * vy - uy * vx;
    var length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= length; ny /= length; nz /= length;
    var points = [a, b, c], colors = [ca, cb, cc];
    tone = typeof tone === "number" ? tone : 1;
    for (var i = 0; i < 3; i++) {
      builder.pos.push(points[i][0], points[i][1], points[i][2]);
      builder.nrm.push(nx, ny, nz);
      builder.col.push(colors[i][0] * tone, colors[i][1] * tone,
        colors[i][2] * tone);
      builder.emi.push(0);
    }
  }

  // A shared-vertex irregular grid: continuous coverage without either cracks
  // or the huge isolated polygons that read as camouflage from the game
  // camera. Each cell chooses its diagonal independently, so no long ruled
  // line survives across the clearing.
  function carpet(builder, x0, y0, x1, y1, step, grass, earth, moss,
                  zones, salt, stats) {
    if (!(x1 > x0) || !(y1 > y0)) return 0;
    var cols = Math.max(1, Math.ceil((x1 - x0) / step));
    var rows = Math.max(1, Math.ceil((y1 - y0) / step));
    var dx = (x1 - x0) / cols, dy = (y1 - y0) / rows;

    function vertex(ix, iy) {
      var px = x0 + ix * dx, py = y0 + iy * dy;
      if (ix > 0 && ix < cols) {
        px += (hashInts(ix, iy, salt) - 0.5) * dx * 0.26;
      }
      if (iy > 0 && iy < rows) {
        py += (hashInts(ix, iy, salt + 1) - 0.5) * dy * 0.26;
      }
      return [px, py, surfaceZ(px, py)];
    }

    function at(point) {
      var broad = noise(point[0], point[1], 390, 107);
      var fine = noise(point[0], point[1], 118, 108);
      var grain = noise(point[0], point[1], 36, 109);
      var t = 0.10 + broad * 0.40 + fine * 0.30 + grain * 0.20;
      var result = mix(grass[0], grass[grass.length - 1], t);

      // WORN EARTH IS A COLOUR FIELD IN THIS ONE SURFACE, not another face
      // laid over it. Authored dirt zones shape the broad clearings; coherent
      // noise tears their edges and adds smaller wear between them. `max`
      // combines zones without ever stacking opacity or geometry.
      var wear = smoothstep(0.70, 0.91,
        noise(point[0], point[1], 175, 120)) * 0.34;
      for (var zi = 0; zi < zones.length; zi++) {
        var zone = zones[zi];
        if (!zone || zone.kind !== "dirt") continue;
        var zx = zone.x + zone.w / 2, zy = zone.y + zone.h / 2;
        var dxz = (point[0] - zx) / Math.max(1, zone.w * 0.58);
        var dyz = (point[1] - zy) / Math.max(1, zone.h * 0.58);
        var ragged = (noise(point[0], point[1], 92, 121) - 0.5) * 0.34;
        var zoneWear = 1 - smoothstep(0.54, 1.03,
          Math.sqrt(dxz * dxz + dyz * dyz) + ragged);
        if (zoneWear * 0.58 > wear) wear = zoneWear * 0.58;
      }
      if (wear > 0.025) stats.earth++;
      result = mix(result, earth, wear);

      // Moss is the same rule at a finer scale: a restrained tint in the one
      // carpet, never a decal. It can colour worn earth but cannot cover it.
      var mossAmount = smoothstep(0.72, 0.94,
        noise(point[0], point[1], 104, 130)) * (1 - wear) * 0.26;
      if (mossAmount > 0.02) stats.moss++;
      return mix(result, moss, mossAmount);
    }

    var triangles = 0;
    for (var iy = 0; iy < rows; iy++) {
      for (var ix = 0; ix < cols; ix++) {
        var a = vertex(ix, iy), b = vertex(ix + 1, iy);
        var c = vertex(ix + 1, iy + 1), d = vertex(ix, iy + 1);
        var ca = at(a), cb = at(b), cc = at(c), cd = at(d);
        var toneA = 0.94 + hashInts(ix * 2, iy * 2, salt + 60) * 0.12;
        var toneB = 0.94 + hashInts(ix * 2 + 1, iy * 2 + 1,
          salt + 61) * 0.12;
        if (hashInts(ix, iy, salt + 4) < 0.5) {
          smoothTri(builder, a, b, c, ca, cb, cc, toneA);
          smoothTri(builder, a, c, d, ca, cc, cd, toneB);
        } else {
          smoothTri(builder, a, b, d, ca, cb, cd, toneA);
          smoothTri(builder, b, c, d, cb, cc, cd, toneB);
        }
        triangles += 2;
      }
    }
    return triangles;
  }

  function segmentDistance(x, y, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var d2 = dx * dx + dy * dy;
    var t = d2 ? ((x - a.x) * dx + (y - a.y) * dy) / d2 : 0;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var px = a.x + dx * t, py = a.y + dy * t;
    var halfA = typeof a.half === "number" ? a.half : 12;
    var halfB = typeof b.half === "number" ? b.half : halfA;
    var half = halfA + (halfB - halfA) * t;
    dx = x - px;
    dy = y - py;
    return { distance: Math.sqrt(dx * dx + dy * dy), half: half };
  }

  function onRoad(x, y, ribbons, margin) {
    for (var p = 0; p < ribbons.length; p++) {
      var points = ribbons[p];
      for (var i = 0; i < points.length - 1; i++) {
        var hit = segmentDistance(x, y, points[i], points[i + 1]);
        if (hit.distance < hit.half + margin) return true;
      }
    }
    return false;
  }

  function insideKeepOut(x, y, keepOut, margin) {
    for (var i = 0; i < keepOut.length; i++) {
      var k = keepOut[i];
      var dx = x - k.x, dy = y - k.y;
      var r = (k.r || 0) + margin;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }

  function blade(builder, x, y, z, angle, width, height, color, lean) {
    var sx = Math.cos(angle) * width;
    var sy = Math.sin(angle) * width;
    var lx = Math.cos(angle + Math.PI / 2) * lean;
    var ly = Math.sin(angle + Math.PI / 2) * lean;
    var a = [x - sx, y - sy, z];
    var b = [x + sx, y + sy, z];
    var tip = [x + lx, y + ly, z + height];
    builder.tri(a, b, tip, color);
    builder.tri(b, a, tip, color);
  }

  function tuft(builder, x, y, z, size, color, salt) {
    var count = 3 + Math.floor(hash(x, y, salt) * 3);
    var turn = hash(x, y, salt + 1) * Math.PI;
    for (var i = 0; i < count; i++) {
      var spread = (i - (count - 1) / 2) * size * 0.28;
      var side = turn + Math.PI / 2;
      var bx = x + Math.cos(side) * spread;
      var by = y + Math.sin(side) * spread;
      var height = size * (0.72 + hash(x + i * 7, y, salt + 2) * 0.55);
      blade(builder, bx, by, z, turn + i * 0.66,
        size * (0.09 + i * 0.006), height, color,
        size * (0.12 + hash(x, y + i * 11, salt + 3) * 0.16));
    }
    return count * 2;
  }

  function build(builder, options) {
    options = options || {};
    var map = options.map;
    if (!map || map.id !== "ironwood-frontier") return null;

    var bounds = options.groundBounds;
    var play = options.playBounds;
    var gap = options.riverGap || null;
    var ribbons = options.routeRibbons || [];
    var zones = options.zones || [];
    var keepOut = options.keepOut || [];

    var grass = ["#34411f", "#435027", "#53602f", "#66733b"].map(GLGeometry.hex);
    var earth = GLGeometry.hex("#725a3b");
    var moss = GLGeometry.hex("#7b8745");
    var blades = ["#697538", "#7a8240", "#8a8e46"].map(GLGeometry.hex);
    var stats = { grass: 0, earth: 0, moss: 0, tufts: 0, triangles: 0 };
    var x, y;

    // LEVEL 1 — one continuous grass skin. The clearing is finely tessellated
    // so its colour and tiny facets remain visible up close. The immense apron
    // uses larger cells because it is seen only through trees and fog. These
    // five rectangles share EDGES and never overlap; the river clips each one
    // through the identical band the old floor quad used.
    function region(x0, y0, x1, y1, step, salt) {
      if (!(x1 > x0) || !(y1 > y0)) return;
      if (!gap) {
        stats.triangles += carpet(builder, x0, y0, x1, y1, step,
          grass, earth, moss, zones, salt, stats);
        return;
      }
      if (gap.x0 > x0) {
        stats.triangles += carpet(builder, x0, y0, Math.min(x1, gap.x0), y1,
          step, grass, earth, moss, zones, salt, stats);
      }
      if (gap.x1 < x1) {
        stats.triangles += carpet(builder, Math.max(x0, gap.x1), y0, x1, y1,
          step, grass, earth, moss, zones, salt + 1, stats);
      }
    }

    var detailX0 = Math.max(bounds.minX, play.minX - 180);
    var detailY0 = Math.max(bounds.minY, play.minY - 180);
    var detailX1 = Math.min(bounds.maxX, play.maxX + 180);
    var detailY1 = Math.min(bounds.maxY, play.maxY + 180);
    region(bounds.minX, bounds.minY, bounds.maxX, detailY0, 72, 10);
    region(bounds.minX, detailY1, bounds.maxX, bounds.maxY, 72, 20);
    region(bounds.minX, detailY0, detailX0, detailY1, 72, 30);
    region(detailX1, detailY0, bounds.maxX, detailY1, 72, 40);
    region(detailX0, detailY0, detailX1, detailY1, 18, 50);
    stats.grass = Math.floor(stats.triangles / 2);

    // LEVEL 2 — real silhouette depth, but only around the playable clearing.
    // Blades never touch the walked ribbon, the river or a solid model, and
    // they have no height-field entry, collision or placement consequence.
    for (y = play.minY - 160; y <= play.maxY + 160; y += 54) {
      for (x = play.minX - 160; x <= play.maxX + 160; x += 54) {
        if (hash(x, y, 70) > 0.58) continue;
        var tx = x + (hash(x, y, 71) - 0.5) * 36;
        var ty = y + (hash(x, y, 72) - 0.5) * 36;
        if (gap && tx > gap.x0 - 5 && tx < gap.x1 + 5) continue;
        if (onRoad(tx, ty, ribbons, 10)) continue;
        if (insideKeepOut(tx, ty, keepOut, 8)) continue;
        stats.triangles += tuft(builder, tx, ty, surfaceZ(tx, ty) + 0.03,
          2.6 + hash(tx, ty, 73) * 2.8,
          colour(blades, tx, ty, 74), 75);
        stats.tufts++;
      }
    }

    lastStats = stats;
    return stats;
  }

  return {
    build: build,
    ownsBase: function (map) {
      return !!map && map.id === "ironwood-frontier";
    },
    handlesPatch: function (map, kind) {
      return !!map && map.id === "ironwood-frontier" && kind === "dirt";
    },
    stats: function () { return lastStats; }
  };
})();
