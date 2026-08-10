// ---------------------------------------------------------------------------
// GamePath
//
// A polyline the enemies walk along. Replaces Godot's Path2D / PathFollow2D.
// Holds cumulative segment lengths so we can convert "distance travelled"
// into a position in constant-ish time.
// ---------------------------------------------------------------------------

function GamePath(points) {
  this.points = points;

  // Cumulative distance to the start of each point.
  this.cumulative = [0];
  for (var i = 1; i < points.length; i++) {
    var dx = points[i].x - points[i - 1].x;
    var dy = points[i].y - points[i - 1].y;
    this.cumulative.push(this.cumulative[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }

  this.length = this.cumulative[this.cumulative.length - 1];
}

// Position at a given distance along the path, in pixels.
GamePath.prototype.pointAt = function (distance) {
  if (distance <= 0) return { x: this.points[0].x, y: this.points[0].y };
  if (distance >= this.length) {
    var last = this.points[this.points.length - 1];
    return { x: last.x, y: last.y };
  }

  var i = 1;
  while (i < this.cumulative.length - 1 && this.cumulative[i] < distance) i++;

  var segStart = this.cumulative[i - 1];
  var segLength = this.cumulative[i] - segStart;
  var t = segLength > 0 ? (distance - segStart) / segLength : 0;

  var a = this.points[i - 1];
  var b = this.points[i];
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
};

// The direction the road is heading at a given distance along it, as a UNIT
// vector. Added 2026-07-28 for the enemy lane offset: an enemy that walks a
// little left or right of the centreline has to be offset PERPENDICULAR to the
// road, or it would drift off the tarmac every time the route turns.
//
// Clamped to the first and last segment at the ends, exactly as pointAt is, so
// an enemy sitting at progress 0 (or past the finish) still has a heading.
// Direction snaps at a corner rather than blending across it; that is the same
// polyline the road is drawn from, so the enemy turns where the road does.
GamePath.prototype.tangentAt = function (distance) {
  var i = 1;
  if (distance > 0) {
    while (i < this.cumulative.length - 1 && this.cumulative[i] < distance) i++;
  }

  var a = this.points[i - 1];
  var b = this.points[i];
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 1, y: 0 };       // degenerate segment
  return { x: dx / len, y: dy / len };
};

// Shortest distance in pixels from an arbitrary point to the path.
GamePath.prototype.distanceToPoint = function (px, py) {
  return this.closestToPoint(px, py).distance;
};

// How far along the path the closest point to (px, py) lies, in pixels.
// A tower's position along the path decides its firing priority -- see
// Tower.prototype.update -- so this is what orders towers front to back.
GamePath.prototype.progressAtPoint = function (px, py) {
  return this.closestToPoint(px, py).progress;
};

// The point on the path nearest (px, py): how far away it is, and how far
// along the path it sits. Both queries above are views onto this one search,
// so they can never disagree about which point is nearest.
GamePath.prototype.closestToPoint = function (px, py) {
  var best = { distance: Infinity, progress: 0 };

  for (var i = 1; i < this.points.length; i++) {
    var hit = closestOnSegment(px, py, this.points[i - 1], this.points[i]);
    if (hit.distance < best.distance) {
      var segStart = this.cumulative[i - 1];
      best.distance = hit.distance;
      best.progress = segStart + hit.t * (this.cumulative[i] - segStart);
    }
  }
  return best;
};

// Nearest point on segment a->b, as a distance and the fraction along it.
function closestOnSegment(px, py, a, b) {
  var vx = b.x - a.x;
  var vy = b.y - a.y;
  var wx = px - a.x;
  var wy = py - a.y;

  var lenSq = vx * vx + vy * vy;
  var t = lenSq > 0 ? (wx * vx + wy * vy) / lenSq : 0;
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  var dx = px - (a.x + vx * t);
  var dy = py - (a.y + vy * t);
  return { distance: Math.sqrt(dx * dx + dy * dy), t: t };
}
