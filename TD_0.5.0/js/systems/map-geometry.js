// ---------------------------------------------------------------------------
// MapGeometry -- the shapes a battlefield is made of, and the two questions
// the game asks about them.
//
// The questions are only ever these:
//
//   CONTAINS   is this point (or this footprint) inside the shape?
//   CROSSES    does this segment reach the shape, and if so, where FIRST?
//
// Placement asks the first. Line of sight and bullets ask the second, and the
// "where first" half is what stops a rail shot at the rock instead of behind
// it. Everything else in the game -- whyCannotBuild, the build ghost, the 3D
// level test, RangeFilter's occlusion hook, HomingBullet, PierceBullet, the
// map difficulty sampler -- goes through this file rather than carrying its
// own copy of a circle test. That rule exists because the copies drift: the
// same map is then buildable in the ghost and refused on the click, or a
// bullet passes through a boulder its tower could not see past.
//
// TANGENCY COUNTS AS CONTACT. Every comparison here is `<=`, never `<`. A
// tower whose footprint exactly grazes a rock is touching the rock, and a shot
// that exactly grazes it has hit it. The alternative is a band one float wide
// where the answer depends on rounding, which is the kind of edge a player
// finds by accident and cannot reproduce.
//
// SPACE: this module is unit-agnostic. It is given numbers and compares them.
// Callers work in WORLD coordinates and convert their own u.l. radii through
// ul() before calling in -- exactly as RangeFilter does, and for the same
// reason (see the note at the top of that file).
//
// NODE-SAFE. No globals, no DOM, no ul(). The suites exercise it directly.
// ---------------------------------------------------------------------------

var MapGeometry = (function () {
  "use strict";

  // How close two floats have to be before they are the same number. Used only
  // where a division could be by zero -- degenerate segments, parallel lines.
  var EPS = 1e-9;

  // --- distances -----------------------------------------------------------

  // Squared distance from a point to a SEGMENT (not to the infinite line).
  // Squared because every caller compares it against a squared radius, and the
  // square root is the expensive half of this function.
  function pointToSegmentSq(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var lenSq = dx * dx + dy * dy;
    if (lenSq <= EPS) {                       // degenerate: a and b coincide
      var ddx = px - ax, ddy = py - ay;
      return ddx * ddx + ddy * ddy;
    }
    var t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    if (t < 0) t = 0; else if (t > 1) t = 1;  // clamp ONTO the segment
    var cx = ax + t * dx, cy = ay + t * dy;
    var ex = px - cx, ey = py - cy;
    return ex * ex + ey * ey;
  }

  // --- contains ------------------------------------------------------------

  // Ray casting, with the ray shot along +x. `inflate` is handled by the
  // caller's edge test rather than here: a polygon cannot be "grown" by moving
  // its vertices without changing its shape at the corners, so an inflated
  // polygon is "inside the polygon OR within `inflate` of one of its edges",
  // which is what containsPolygon below actually asks.
  function pointInPolygonStrict(points, x, y) {
    var inside = false;
    for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
      var xi = points[i][0], yi = points[i][1];
      var xj = points[j][0], yj = points[j][1];
      var crosses = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function containsPolygon(points, x, y, inflate) {
    if (pointInPolygonStrict(points, x, y)) return true;
    // THE EDGE TEST RUNS EVEN AT ZERO INFLATE, and that is the tangency rule
    // rather than a wasted loop. Ray casting is deliberately strict -- a point
    // exactly ON an edge is "outside" to it, and which side it lands on
    // depends on the float -- so without this a footprint resting precisely
    // against a rock face reads as clear. `inflate` of 0 makes the comparison
    // `distance <= 0`, which is exactly "on the edge".
    var rSq = inflate * inflate;
    for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
      if (pointToSegmentSq(x, y, points[j][0], points[j][1],
                           points[i][0], points[i][1]) <= rSq) return true;
    }
    return false;
  }

  // Is `(x, y)`, grown by `inflate`, touching `shape`?
  //
  // `inflate` is how the placement rule is expressed: a tower is not a point,
  // so "can this tower stand here" is "is the tower's FOOTPRINT clear", and a
  // footprint is the point grown by its radius. Growing the query rather than
  // shrinking the shape is what lets one shape serve towers of every size.
  function contains(shape, x, y, inflate) {
    inflate = inflate || 0;
    if (!shape) return false;

    if (shape.shape === "circle") {
      var dx = x - shape.x, dy = y - shape.y;
      var r = shape.radius + inflate;
      return dx * dx + dy * dy <= r * r;
    }

    if (shape.shape === "capsule") {
      var cr = shape.radius + inflate;
      return pointToSegmentSq(x, y, shape.a.x, shape.a.y, shape.b.x, shape.b.y)
        <= cr * cr;
    }

    if (shape.shape === "polygon") {
      return containsPolygon(shape.points, x, y, inflate);
    }

    return false;
  }

  // --- segment crossings ---------------------------------------------------
  //
  // Every one of these returns the EARLIEST `t` in [0, 1] along the segment, or
  // -1 for a miss. Earliest rather than "does it hit", because a bullet has to
  // stop at the near face of a rock and not at the far one, and a sight line
  // that clips two boulders is blocked by whichever comes first.

  // Segment vs circle. The quadratic is written so a tangent -- discriminant
  // exactly zero -- returns the touch point rather than a miss.
  function segmentCircle(ax, ay, bx, by, cx, cy, r) {
    var dx = bx - ax, dy = by - ay;
    var fx = ax - cx, fy = ay - cy;

    var a = dx * dx + dy * dy;
    if (a <= EPS) {                            // zero-length segment: a point
      return (fx * fx + fy * fy <= r * r) ? 0 : -1;
    }
    var b = 2 * (fx * dx + fy * dy);
    var c = fx * fx + fy * fy - r * r;

    if (c <= 0) return 0;                      // starts inside or on the rim

    var disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    var root = Math.sqrt(disc);
    // Near root first. The far root is only reachable from inside, which the
    // `c <= 0` line above already answered with 0.
    var t = (-b - root) / (2 * a);
    return (t >= 0 && t <= 1) ? t : -1;
  }

  // Segment vs segment. Returns `t` along AB, or -1. Parallel segments report
  // a miss: two lines that lie on top of each other have no single first
  // crossing, and every shape here is closed, so its other edges answer.
  function segmentSegment(ax, ay, bx, by, cx, cy, dx2, dy2) {
    var r1x = bx - ax, r1y = by - ay;
    var r2x = dx2 - cx, r2y = dy2 - cy;
    var denom = r1x * r2y - r1y * r2x;
    if (Math.abs(denom) <= EPS) return -1;
    var t = ((cx - ax) * r2y - (cy - ay) * r2x) / denom;
    var u = ((cx - ax) * r1y - (cy - ay) * r1x) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) return -1;
    return t;
  }

  function best(current, candidate) {
    if (candidate < 0) return current;
    if (current < 0) return candidate;
    return candidate < current ? candidate : current;
  }

  function segmentPolygon(points, ax, ay, bx, by, inflate) {
    // Starting inside is a hit at once -- a shot fired from within a rock is
    // already in the rock.
    if (containsPolygon(points, ax, ay, inflate)) return 0;
    var t = -1;
    for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
      var px = points[j][0], py = points[j][1];
      var qx = points[i][0], qy = points[i][1];
      t = best(t, segmentSegment(ax, ay, bx, by, px, py, qx, qy));
      // The inflated skirt: each edge becomes a capsule of radius `inflate`,
      // which is the same shape a footprint sweeps along it.
      if (inflate > 0) {
        t = best(t, segmentCapsule(ax, ay, bx, by, px, py, qx, qy, inflate));
      }
    }
    return t;
  }

  // Segment vs capsule, decomposed into the two end circles and the two
  // straight flanks. Exact, and much easier to be sure of than solving the
  // quartic that the swept-distance form produces.
  function segmentCapsule(ax, ay, bx, by, cx, cy, dx2, dy2, r) {
    if (pointToSegmentSq(ax, ay, cx, cy, dx2, dy2) <= r * r) return 0;

    var t = -1;
    t = best(t, segmentCircle(ax, ay, bx, by, cx, cy, r));
    t = best(t, segmentCircle(ax, ay, bx, by, dx2, dy2, r));

    var ex = dx2 - cx, ey = dy2 - cy;
    var len = Math.sqrt(ex * ex + ey * ey);
    if (len > EPS) {
      var nx = -ey / len * r, ny = ex / len * r;   // outward normal, scaled
      t = best(t, segmentSegment(ax, ay, bx, by, cx + nx, cy + ny, dx2 + nx, dy2 + ny));
      t = best(t, segmentSegment(ax, ay, bx, by, cx - nx, cy - ny, dx2 - nx, dy2 - ny));
    }
    return t;
  }

  // Where along AB does this segment FIRST reach `shape`? -1 for a miss.
  function segmentHit(shape, ax, ay, bx, by, inflate) {
    inflate = inflate || 0;
    if (!shape) return -1;

    if (shape.shape === "circle") {
      return segmentCircle(ax, ay, bx, by, shape.x, shape.y, shape.radius + inflate);
    }
    if (shape.shape === "capsule") {
      return segmentCapsule(ax, ay, bx, by, shape.a.x, shape.a.y,
                            shape.b.x, shape.b.y, shape.radius + inflate);
    }
    if (shape.shape === "polygon") {
      return segmentPolygon(shape.points, ax, ay, bx, by, inflate);
    }
    return -1;
  }

  // --- the two questions, over a whole list --------------------------------

  // THE FAST EMPTY CHECK COMES FIRST, and it is the reason six of the seven
  // maps pay nothing for any of this: they have no blockers, so every call
  // below returns on the length test before touching a single float.

  function containsAny(shapes, x, y, inflate) {
    if (!shapes || !shapes.length) return null;
    for (var i = 0; i < shapes.length; i++) {
      if (contains(shapes[i], x, y, inflate)) return shapes[i];
    }
    return null;
  }

  // The earliest contact along AB, as { t, x, y, shape }, or null.
  //
  // Returns a fresh object ONLY on a hit. Misses are the overwhelmingly common
  // case on a live board -- most shots reach their target -- and allocating a
  // "no hit" record per bullet per step is exactly the churn the hot paths in
  // this game are written to avoid.
  // A SHAPE ONLY STOPS AN EYE THAT IS BELOW ITS TOP.
  //
  // `eyeHeight` is how high the line is being cast from -- zero on the ground,
  // the stump's top for a tower standing on one. A shape whose height is at or
  // under that is looked over and does not participate. Shapes with no height
  // declared come out of the compiler as Infinity, so a board that has never
  // heard of elevation behaves exactly as it did: every shape stops everything.
  //
  // Strictly greater, not >=: standing exactly as high as a rock is standing on
  // top of the sightline, and the alternative is a band one float wide where
  // the answer depends on rounding -- the same reasoning as tangency.
  function clears(shape, eyeHeight) {
    return eyeHeight > 0 && shape.height !== undefined && shape.height <= eyeHeight;
  }

  function firstHit(shapes, ax, ay, bx, by, inflate, eyeHeight) {
    if (!shapes || !shapes.length) return null;
    var bestT = -1, bestShape = null;
    for (var i = 0; i < shapes.length; i++) {
      if (eyeHeight && clears(shapes[i], eyeHeight)) continue;
      var t = segmentHit(shapes[i], ax, ay, bx, by, inflate);
      if (t < 0) continue;
      if (bestT < 0 || t < bestT) { bestT = t; bestShape = shapes[i]; }
    }
    if (bestT < 0) return null;
    return {
      t: bestT,
      x: ax + (bx - ax) * bestT,
      y: ay + (by - ay) * bestT,
      shape: bestShape
    };
  }

  // Is the straight line from A to B clear of every shape?
  //
  // Separate from firstHit because this is the question asked most often --
  // once per tower per candidate enemy per step -- and it does not need the
  // contact point, so it must not build one.
  function clearLine(shapes, ax, ay, bx, by, eyeHeight) {
    if (!shapes || !shapes.length) return true;
    for (var i = 0; i < shapes.length; i++) {
      if (eyeHeight && clears(shapes[i], eyeHeight)) continue;
      if (segmentHit(shapes[i], ax, ay, bx, by, 0) >= 0) return false;
    }
    return true;
  }

  return {
    contains: contains,
    containsAny: containsAny,
    segmentHit: segmentHit,
    firstHit: firstHit,
    clearLine: clearLine,
    clears: clears,
    // Exposed for the suites and for callers that need the primitives on their
    // own -- the stump snap measures a plain point-to-centre distance, and the
    // difficulty sampler measures road distance the same way.
    pointToSegmentSq: pointToSegmentSq,
    segmentCircle: segmentCircle,
    segmentSegment: segmentSegment,
    segmentCapsule: segmentCapsule,
    pointInPolygon: pointInPolygonStrict
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = MapGeometry;
}
