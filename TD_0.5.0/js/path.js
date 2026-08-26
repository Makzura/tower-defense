// ---------------------------------------------------------------------------
// GamePath
//
// A polyline the enemies walk along. Replaces Godot's Path2D / PathFollow2D.
// Holds cumulative segment lengths so we can convert "distance travelled"
// into a position in constant-ish time.
// ---------------------------------------------------------------------------

// `profile` is optional and carries what the road DOES along its length --
// `{ width: [...], pace: [...] }`, both anchor lists. See the block at the
// bottom of this file. Omitted, every lookup answers 1 and this is the same
// object it has always been.
function GamePath(points, profile) {
  this.points = points;
  this.widthProfile = (profile && profile.width) || null;
  this.paceProfile = (profile && profile.pace) || null;

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
//
// THE SNAP IS LOAD-BEARING FOR THE RENDERER. DO NOT SMOOTH IT WITHOUT READING
// THIS.
//
// Because this returns the segment's own vector, heading is PIECEWISE CONSTANT:
// yaw rate is exactly zero along 100% of road length, and the whole turn
// happens in the single frame that crosses a waypoint. Measured over all seven
// routes: 35 corners, median turn 61.2 degrees, max 90, five crossed per body,
// which is 0.25% of the rendered frames in one body's life.
//
// gl-world.js draws an enemy at `atan2(heading.y, heading.x)` straight off this,
// with no smoothing anywhere between. A body's silhouette therefore changes for
// exactly two reasons: its baked animation frame, and any live per-group
// `overrides` matrix. Rounding corners here would add a third, on every bend,
// competing with both.
//
// The threshold, measured rather than guessed: heading motion above roughly
// ONE DEGREE PER RENDERED FRAME swamps a live `overrides` gesture outright.
// At 0.5 deg/frame a body's silhouette changes 2.08 px against a 5.52 px
// gesture; at 1.0 it is 8.00 px and the gesture is no longer the loudest thing
// on the model; at 2.0 it is 16.92 and three to one the other way.
//
// This is not about any one enemy. It is a property of the seam every animated
// body now shares, so it outlives whichever gesture is currently using it.
// Smoothing the heading through corners looks like pure polish and would break
// this silently, with no failing test anywhere in the six suites.
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

// ---------------------------------------------------------------------------
// PROFILES: what the road DOES along its own length.
//
// Until now a route was a polyline and nothing else, and every property of the
// road was a global: one width in js/game.js, one enemy speed off the type.
// A profile is the other half -- a property that varies ALONG the route,
// authored per map, read by everything that draws or measures the road.
//
// Two exist, and they are deliberately the same shape so a third is a data
// change rather than a mechanism:
//
//   width   a multiplier on ROAD_WIDTH_UL. 0.6 is a gate you squeeze through,
//           3.0 is a plaza. It moves the ROAD and, because build clearance is
//           derived from the road's own half-width, it moves where towers may
//           stand with it -- a chokepoint is worth building beside precisely
//           because the road pulls its edge in and lets a tower stand closer.
//   pace    a multiplier on how fast a body walks. It is a fact about the
//           STRETCH OF ROAD, not about the body, which is why it lives here
//           and not on the enemy type -- the same way `sprint` (js/enemy.js) is
//           keyed on progress rather than on a timer.
//
// A route that declares neither behaves exactly as every route did before this
// existed: both lookups return 1 through a null check, `ribbon` hands back the
// authored points untouched, and six of the seven boards render byte-identical
// geometry.
//
// ANCHORS ARE FRACTIONS OF THE ROUTE'S OWN LENGTH, not pixels and not point
// indices. Pixels would have to be re-authored every time a leg moved; indices
// would mean a profile could not put a chokepoint halfway along a straight,
// which is where chokepoints belong. Between two anchors the value ramps
// LINEARLY, and outside the first and last it holds -- so a flat road is one
// anchor and a road that narrows and opens again is three.
// ---------------------------------------------------------------------------

// The value of an anchor list at t (0..1). Held flat outside the ends.
function profileScaleAt(anchors, t) {
  if (!anchors || !anchors.length) return 1;
  if (t <= anchors[0].at) return anchors[0].scale;
  var last = anchors[anchors.length - 1];
  if (t >= last.at) return last.scale;

  for (var i = 1; i < anchors.length; i++) {
    if (t > anchors[i].at) continue;
    var a = anchors[i - 1], b = anchors[i];
    var span = b.at - a.at;
    var f = span > 0 ? (t - a.at) / span : 0;
    return a.scale + (b.scale - a.scale) * f;
  }
  return last.scale;
}

GamePath.prototype.hasWidthProfile = function () {
  return !!(this.widthProfile && this.widthProfile.length);
};

// The road's width multiplier at a distance along it. 1 on a route that
// declares no profile, which is what keeps every other board unchanged.
GamePath.prototype.widthScaleAt = function (distance) {
  if (!this.hasWidthProfile()) return 1;
  return profileScaleAt(this.widthProfile,
    this.length > 0 ? distance / this.length : 0);
};

// THE WIDEST THE ROAD GETS NEAR A POINT, and the reason placement asks for
// this rather than for the width at one distance.
//
// A tower is refused when it stands closer to the CENTRELINE than the road's
// own half-width plus its footprint, and the nearest point of the centreline
// is not necessarily where the road is widest: standing beside a ramp into a
// plaza, the tarmac that would swallow the tower is a little further along.
// Sampling a window either side and taking the worst case closes that, and on
// a route with no profile it is one comparison against 1.
GamePath.prototype.maxWidthScaleNear = function (distance, windowPx) {
  if (!this.hasWidthProfile()) return 1;
  var worst = 0;
  for (var i = 0; i <= 6; i++) {
    var d = distance - windowPx + (windowPx * 2) * (i / 6);
    var s = this.widthScaleAt(d < 0 ? 0 : (d > this.length ? this.length : d));
    if (s > worst) worst = s;
  }
  return worst;
};

// How fast a body walks here, as a multiplier. 1 without a profile.
GamePath.prototype.paceScaleAt = function (distance) {
  if (!this.paceProfile || !this.paceProfile.length) return 1;
  return profileScaleAt(this.paceProfile,
    this.length > 0 ? distance / this.length : 0);
};

// THE ROAD AS A RIBBON: the same polyline, resampled fine enough that a width
// that changes along it has somewhere to change.
//
// Every renderer of the road -- the 2D board, the map card, the 3D mesh and the
// height field the actors stand on -- builds from this one list, so a
// chokepoint cannot be in one of them and not another. Each point carries its
// own `half`, in the same world pixels the points are in.
//
// A route with no width profile is handed back its OWN points array, not a
// copy: the four callers then run exactly the code they ran before profiles
// existed, on the same objects, and six boards are provably untouched.
GamePath.prototype.ribbon = function (width, stepPx) {
  if (!this.hasWidthProfile()) return this.points;

  var step = stepPx || 14;
  var out = [];
  for (var i = 1; i < this.points.length; i++) {
    var a = this.points[i - 1], b = this.points[i];
    var segStart = this.cumulative[i - 1];
    var segLength = this.cumulative[i] - segStart;
    var pieces = Math.max(1, Math.ceil(segLength / step));
    // The first point of every segment, and the last point of the last one:
    // corners are authored and must stay exactly where they were authored.
    for (var k = 0; k < pieces; k++) {
      var f = k / pieces;
      out.push({
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        half: width * this.widthScaleAt(segStart + segLength * f) / 2
      });
    }
    if (i === this.points.length - 1) {
      out.push({
        x: b.x, y: b.y,
        half: width * this.widthScaleAt(this.length) / 2
      });
    }
  }
  return out;
};

// THE TWO EDGES OF THE ROAD, and there is exactly one copy of this in the game.
//
// Offsetting a polyline is not hard and it is not obvious either -- the mitre
// at a corner has to be lengthened by 1/cos(half-angle) or the outside of every
// bend pulls in, and the lengthening has to be CLAMPED or a hairpin throws a
// spike several screens long. Getting that subtly different in the 2D pass and
// the 3D mesh would show up as a road whose corners are one shape on the board
// and another on the map card, which is precisely the drift `drawRoadOn`'s
// header exists to prevent.
//
// So both renderers call this. It lives in path.js because that is the file
// both of them already load (js/gl/gl-geometry.js is loaded after it on every
// page that has a 3D board) and because the shape of the road is a fact about
// the route.
//
// `points` may carry a per-point `half` -- what GamePath.ribbon emits for a
// route with a width profile. Where it does not, `defaultHalf` is used, which
// is every route that declares no profile. `inflate` widens BOTH edges, for
// the 2D pass's outer glow.
//
// Returns one entry per point: the point pushed out to the left edge and to
// the right edge.
function roadEdges(points, defaultHalf, inflate) {
  var out = [];
  var grow = (inflate || 0) / 2;

  for (var i = 0; i < points.length; i++) {
    var prev = points[i - 1], cur = points[i], next = points[i + 1];
    var p1 = prev ? edgeNormal(prev.x, prev.y, cur.x, cur.y) : null;
    var p2 = next ? edgeNormal(cur.x, cur.y, next.x, next.y) : null;
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
    var half = (cur.half === undefined ? defaultHalf : cur.half) + grow;
    out.push({
      lx: cur.x + m[0] * half, ly: cur.y + m[1] * half,
      rx: cur.x - m[0] * half, ry: cur.y - m[1] * half
    });
  }
  return out;
}

// Unit normal of the segment a->b, turned 90 degrees.
function edgeNormal(ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var l = Math.hypot(dx, dy) || 1;
  return [-dy / l, dx / l];
}
