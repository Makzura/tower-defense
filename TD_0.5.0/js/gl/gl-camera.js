// ---------------------------------------------------------------------------
// The orbit camera. Baldur's Gate / Roblox controls on a mouse, Figma / Google
// Maps gestures on a trackpad:
//
//     MIDDLE drag    orbit -- horizontal spins around the point you are
//                    looking at, vertical raises and lowers the eye
//     SHIFT drag     orbit, for the trackpad -- a MacBook has no middle button
//     OPTION drag    at all, so on that hardware the mouse binding above is not
//                    awkward, it is unreachable. Shift is the one that is
//                    guaranteed to arrive; see the note in pointerdown.
//     RIGHT drag     pan across the ground
//     TWO FINGERS    pan, grabbing the ground under the fingers
//     PINCH          zoom, toward whatever is under the cursor
//     WHEEL          zoom, toward whatever is under the cursor
//     WASD / arrows  pan, in screen directions rather than world ones.
//                    Read by PHYSICAL POSITION, so this is ZQSD on AZERTY and
//                    WASD on QWERTY with nothing to configure -- see the note
//                    on the keydown binding.
//
// THE ONE IDEA THAT MAKES IT FEEL RIGHT: the pan is not "mouse pixels times a
// fudge factor". It grabs the point of ground under the cursor and keeps it
// under the cursor. Anything else drifts -- the same drag covers more world
// when the camera is high than when it is low, and more when it is pitched
// flat than when it is overhead, so a fudge factor is only ever correct at one
// zoom and one angle. Grabbing the ground is correct at all of them, and it is
// the difference between a camera that feels attached to the board and one
// that feels attached to the mouse.
//
// It works because during a pan the yaw, the pitch and the distance are all
// frozen, so the ground point under a given pixel, MEASURED RELATIVE TO THE
// TARGET, does not depend on where the target is. Grab that offset on the way
// down, subtract the live one on every move, and the arithmetic closes:
//
//     target = targetAtGrab + offsetAtGrab - offsetNow
//
// No feedback loop, no iteration, no drift. Zoom-to-cursor is the same trick
// with the distance changed in between.
//
// PAN IS INSTANT, ORBIT AND ZOOM ARE DAMPED. Smoothing a pan is the one place
// damping actively hurts: the grabbed ground point would lag the pointer and
// the whole illusion goes. Orbit and zoom have nothing pinned to the cursor,
// so they get a little easing and feel much better for it.
// ---------------------------------------------------------------------------

function OrbitCamera(canvas, options) {
  "use strict";
  options = options || {};

  // --- the state that IS the camera ---------------------------------------
  // `target` is always ON the ground plane. Keeping it there is what lets the
  // pan maths above drop a term, and there is nothing in this game to look at
  // that is not standing on the floor.
  this.target = options.target ? options.target.slice() : [0, 0, 0];
  this.yaw = options.yaw === undefined ? -Math.PI / 2 : options.yaw;
  // 34.06 degrees is the elevation the 2D game's ground squash implies, so the
  // 3D camera opens on exactly the angle the board has always been drawn at.
  this.pitch = options.pitch === undefined ? 34.06 * Math.PI / 180 : options.pitch;
  this.distance = options.distance === undefined ? 900 : options.distance;

  // What the above are easing toward. Pan writes both at once; orbit and zoom
  // write only these.
  this.wantYaw = this.yaw;
  this.wantPitch = this.pitch;
  this.wantDistance = this.distance;

  this.fovY = (options.fovDeg === undefined ? 32 : options.fovDeg) * Math.PI / 180;
  this.near = options.near === undefined ? 8 : options.near;
  this.far = options.far === undefined ? 12000 : options.far;

  // Limits. Pitch stops short of both the horizon and straight-down: at the
  // horizon the ground ray stops meeting the plane at all and the pan breaks;
  // at 90 the yaw becomes meaningless and the orbit gimbals.
  this.minPitch = (options.minPitchDeg === undefined ? 12 : options.minPitchDeg) * Math.PI / 180;
  this.maxPitch = (options.maxPitchDeg === undefined ? 85 : options.maxPitchDeg) * Math.PI / 180;
  this.minDistance = options.minDistance === undefined ? 160 : options.minDistance;
  this.maxDistance = options.maxDistance === undefined ? 3200 : options.maxDistance;
  // Where the target may wander. Without this you can pan into empty space and
  // lose the board with no way back but a reset.
  this.bounds = options.bounds || null;

  // Radians per pixel of drag. Yaw gets more than pitch on purpose: yaw has a
  // full turn to cover and pitch only 73 degrees, so matching them makes the
  // vertical feel twitchy long before the horizontal feels slow.
  this.orbitSpeed = options.orbitSpeed === undefined ? 0.0052 : options.orbitSpeed;
  this.pitchSpeed = options.pitchSpeed === undefined ? 0.0038 : options.pitchSpeed;
  // GRAB THE BALL, DO NOT PUSH THE CAMERA.
  //
  // There are two conventions and they are exact opposites. "Move the camera"
  // says drag-up tilts the eye up. "Turn the object" says the board is a ball
  // under your hand: whatever you grab follows the cursor, so dragging DOWN
  // rolls the top of the ball toward you and you end up looking down at it.
  //
  // This is the second one, on both axes, because that is the one people
  // actually have in their hands -- it is what every 3D viewer, and Roblox,
  // and the turntable in Blender all do. The first version shipped as the
  // first convention and read as "everything is inverted".
  //
  // These are the ONLY two numbers that decide it. Flip either independently.
  this.yawSign = options.yawSign === undefined ? -1 : options.yawSign;
  this.pitchSign = options.pitchSign === undefined ? 1 : options.pitchSign;
  this.zoomStep = options.zoomStep === undefined ? 1.12 : options.zoomStep;
  // HOW MANY ZOOM NOTCHES ONE PIXEL OF SCROLL IS WORTH. A mouse notch arrives
  // as 100 pixels, so 0.01 keeps a notch worth exactly the 1.12 step it has
  // always been worth. A pinch arrives in much smaller increments and many
  // more of them, hence its own, larger number.
  this.wheelZoomSpeed = options.wheelZoomSpeed === undefined ? 0.01 : options.wheelZoomSpeed;
  this.pinchZoomSpeed = options.pinchZoomSpeed === undefined ? 0.04 : options.pinchZoomSpeed;
  this.keyPanSpeed = options.keyPanSpeed === undefined ? 900 : options.keyPanSpeed;
  // Higher is snappier. Frame-rate independent -- see update().
  this.damping = options.damping === undefined ? 16 : options.damping;

  this.canvas = canvas;
  // WHERE THE MOUSE ACTUALLY LANDS. The 3D board is drawn on a canvas BEHIND
  // the 2D one that carries the HUD, so pointer events never reach it -- the
  // camera bound to its own canvas received nothing at all and the controls
  // appeared to vanish. Input is therefore bound to whatever element is on
  // top, while projection and sizing still use the GL canvas.
  this.input = options.inputTarget || canvas;
  this.enabled = true;
  // Set while a right-drag actually MOVES, so the game can tell a pan from a
  // right-click. Right-click is "cancel" in this game and must keep working.
  this.rightDragMoved = false;

  // --- scratch -------------------------------------------------------------
  this._view = new Float32Array(16);
  this._proj = new Float32Array(16);
  this._viewProj = new Float32Array(16);
  // Cache key for viewProjection() -- see the note there. Null until the first
  // build, so the very first call always misses.
  this._vpKey = null;
  this._eye = [0, 0, 0];
  this._fwd = [0, 0, 0];
  this._right = [0, 0, 0];
  this._up = [0, 0, 0];

  this._drag = null;          // {mode, startTarget, grabOffset} or null
  // {ndc, world} while a middle-drag is turning around a grabbed ground point.
  this._orbitPivot = null;
  this._keys = Object.create(null);

  this._bindInput();
  this._recomputeBasis();
}

OrbitCamera.WORLD_UP = [0, 0, 1];

// --- geometry ---------------------------------------------------------------

// Camera position relative to the target, from yaw/pitch/distance. Split out
// because the pan and the zoom both need a camera basis for a state the camera
// is not actually in yet.
OrbitCamera.prototype._orbitVector = function (yaw, pitch, distance) {
  var cp = Math.cos(pitch);
  return [Math.cos(yaw) * cp * distance,
          Math.sin(yaw) * cp * distance,
          Math.sin(pitch) * distance];
};

OrbitCamera.prototype._recomputeBasis = function () {
  var o = this._orbitVector(this.yaw, this.pitch, this.distance);
  this._eye[0] = this.target[0] + o[0];
  this._eye[1] = this.target[1] + o[1];
  this._eye[2] = this.target[2] + o[2];

  var l = Math.hypot(o[0], o[1], o[2]) || 1;
  this._fwd[0] = -o[0] / l; this._fwd[1] = -o[1] / l; this._fwd[2] = -o[2] / l;

  var up = OrbitCamera.WORLD_UP;
  var rx = this._fwd[1] * up[2] - this._fwd[2] * up[1];
  var ry = this._fwd[2] * up[0] - this._fwd[0] * up[2];
  var rz = this._fwd[0] * up[1] - this._fwd[1] * up[0];
  var rl = Math.hypot(rx, ry, rz) || 1;
  this._right[0] = rx / rl; this._right[1] = ry / rl; this._right[2] = rz / rl;

  this._up[0] = this._right[1] * this._fwd[2] - this._right[2] * this._fwd[1];
  this._up[1] = this._right[2] * this._fwd[0] - this._right[0] * this._fwd[2];
  this._up[2] = this._right[0] * this._fwd[1] - this._right[1] * this._fwd[0];
};

OrbitCamera.prototype.aspect = function () {
  return this.canvas.height ? this.canvas.width / this.canvas.height : 1;
};

// A pixel, as normalised device coordinates. Uses the BACKING size, so it is
// correct on a HiDPI canvas where CSS pixels and drawing pixels differ.
OrbitCamera.prototype._ndc = function (clientX, clientY) {
  var r = this.canvas.getBoundingClientRect();
  return [((clientX - r.left) / (r.width || 1)) * 2 - 1,
          1 - ((clientY - r.top) / (r.height || 1)) * 2];
};

// The ground point under a pixel, MEASURED FROM THE TARGET, for a camera state
// that need not be the live one. This is the function the whole control scheme
// is built on -- see the header.
OrbitCamera.prototype._groundOffset = function (ndcX, ndcY, yaw, pitch, distance) {
  var o = this._orbitVector(yaw, pitch, distance);
  var l = Math.hypot(o[0], o[1], o[2]) || 1;
  var fwd = [-o[0] / l, -o[1] / l, -o[2] / l];

  var up = OrbitCamera.WORLD_UP;
  var rx = fwd[1] * up[2] - fwd[2] * up[1];
  var ry = fwd[2] * up[0] - fwd[0] * up[2];
  var rz = fwd[0] * up[1] - fwd[1] * up[0];
  var rl = Math.hypot(rx, ry, rz) || 1;
  var right = [rx / rl, ry / rl, rz / rl];
  var camUp = [right[1] * fwd[2] - right[2] * fwd[1],
               right[2] * fwd[0] - right[0] * fwd[2],
               right[0] * fwd[1] - right[1] * fwd[0]];

  // The target sits on z = 0, so relative to it the ground plane is z = 0 too.
  return GLMath.groundRay(o, fwd, right, camUp, Math.tan(this.fovY / 2),
    this.aspect(), ndcX, ndcY, 0);
};

// Public: the world point under a pixel, for picking. Null past the horizon.
OrbitCamera.prototype.groundAt = function (clientX, clientY) {
  var n = this._ndc(clientX, clientY);
  var off = this._groundOffset(n[0], n[1], this.yaw, this.pitch, this.distance);
  if (!off) return null;
  return [this.target[0] + off[0], this.target[1] + off[1], 0];
};

// World -> canvas pixels. THE KEYSTONE OF THE 2D/3D HYBRID.
//
// Everything the game draws in world space that is not a body -- health bars,
// range circles, the build preview, hover labels, damage popups -- stays on the
// 2D canvas, because it is interface and it has to stay crisp and screen-facing.
// In 2D those things were drawn under a `translate/scale` and got their screen
// position for free. Under a 3D camera there is no such transform, so each one
// asks here instead.
//
// Returns null BEHIND the camera rather than a mirrored point: a bar for a
// tower behind the eye must not be drawn at all, and the naive divide happily
// produces a plausible-looking coordinate for it.
// THE OUTPUT SPACE IS `viewport`, NOT CSS PIXELS, and getting that wrong is
// the single most expensive mistake available here. The game's 2D canvas has a
// FIXED LOGICAL coordinate system -- 1280x720 -- and an adaptive backing store
// that is neither of those; `toGameCoords` maps every mouse event into the
// logical space and every 2D draw call is in it. A projection that returned
// CSS pixels put every health bar, range ring, spark and popup at a plausible
// but wrong place, scaled by whatever the window happened to be. Set
// `camera.viewport = {width, height}` to the logical size and everything
// lands where the 2D canvas expects it.
OrbitCamera.prototype.worldToScreen = function (x, y, z, out) {
  var vp = this.viewProjection();
  var w = vp[3] * x + vp[7] * y + vp[11] * (z || 0) + vp[15];
  if (w <= 1e-6) return null;
  var nx = (vp[0] * x + vp[4] * y + vp[8] * (z || 0) + vp[12]) / w;
  var ny = (vp[1] * x + vp[5] * y + vp[9] * (z || 0) + vp[13]) / w;
  var view = this.viewport || this.canvas.getBoundingClientRect();
  out = out || {};
  out.x = (nx * 0.5 + 0.5) * view.width;
  out.y = (0.5 - ny * 0.5) * view.height;
  // HOW MUCH A WORLD UNIT IS WORTH ON SCREEN AT THIS DEPTH -- measured facing
  // the camera, which is what every caller of it draws: a bloom radius, a
  // spark's width, a projectile's body. Anything that was sized in world units
  // in 2D needs this number.
  //
  // From the PROJECTION alone, never from the view-projection. `vp[5]` is a
  // term of proj*view, so it carries the camera's yaw and pitch: orbiting the
  // board changed it by a factor of five while nothing about the depth or the
  // lens had moved, and every muzzle flash, spark and round quietly shrank as
  // the player turned. `_proj[5]` is `1 / tan(fovY / 2)` and depends on the
  // lens only, which is the whole point of it.
  //
  // `viewProjection()` above has just refilled `_proj`, so it is current.
  out.scale = (this._proj[5] * 0.5 * view.height) / w;
  out.depth = w;
  return out;
};

// Logical view coordinates -> client pixels, the inverse of the game's
// `toGameCoords`. Pointer events arrive in client space and the game speaks
// logical space, so the two have to be converted somewhere; doing it here
// keeps every caller honest about which one it is holding.
OrbitCamera.prototype.viewToClient = function (x, y) {
  var r = this.canvas.getBoundingClientRect();
  var view = this.viewport || r;
  return [r.left + x * (r.width / (view.width || 1)),
          r.top + y * (r.height / (view.height || 1))];
};

// A circle on the ground, as screen points. A ground circle is an ellipse under
// this camera and a skewed one once the board is orbited, so it is projected
// per-vertex rather than approximated with ctx.ellipse -- which is what every
// range indicator, footprint and blast radius in the game is.
OrbitCamera.prototype.groundCircle = function (cx, cy, radius, segments) {
  segments = segments || 48;
  var points = [];
  for (var i = 0; i < segments; i++) {
    var a = Math.PI * 2 * i / segments;
    var p = this.worldToScreen(cx + Math.cos(a) * radius,
                               cy + Math.sin(a) * radius, 0);
    if (!p) return null;      // crosses behind the eye; not drawable as a loop
    points.push(p.x, p.y);
  }
  return points;
};

// Where a ground point lands in NDC, for the live camera. The inverse of
// `_groundOffset`, and the orbit pivot needs it to re-anchor onto the point it
// actually settled on rather than the raw pixel that was clicked.
OrbitCamera.prototype._ndcOfGround = function (x, y) {
  var vp = this.viewProjection();
  var w = vp[3] * x + vp[7] * y + vp[15];
  if (w <= 1e-6) return null;
  return [(vp[0] * x + vp[4] * y + vp[12]) / w,
          (vp[1] * x + vp[5] * y + vp[13]) / w];
};

OrbitCamera.prototype._clampTarget = function () {
  var b = this.bounds;
  if (!b) return;
  this.target[0] = Math.max(b.minX, Math.min(b.maxX, this.target[0]));
  this.target[1] = Math.max(b.minY, Math.min(b.maxY, this.target[1]));
  this.target[2] = 0;
};

// --- input ------------------------------------------------------------------

OrbitCamera.prototype._bindInput = function () {
  var self = this;
  var canvas = this.input;   // the element on TOP -- see the note on this.input

  // Right-drag is a pan, so the context menu has to go.
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  canvas.addEventListener("auxclick", function (e) {
    if (e.button === 1) e.preventDefault();
  });

  // MIDDLE-CLICK AUTOSCROLL. On Windows, pressing the middle button puts the
  // browser into autoscroll: it drops that four-arrow puck and then feeds the
  // page a continuous stream of scroll events for as long as the button is
  // down. Those arrive here as `wheel`, so simply HOLDING the middle button --
  // without moving the mouse at all -- zoomed the camera in hard and did not
  // stop. It reads as the camera going haywire; it is the browser scrolling a
  // page that has nothing to scroll.
  //
  // `pointerdown`'s preventDefault does NOT stop it. Autoscroll is armed off
  // the compatibility `mousedown`, so that is the event that has to be
  // cancelled, and it has to be cancelled before the browser sees it.
  canvas.addEventListener("mousedown", function (e) {
    if (e.button === 1) e.preventDefault();
  });

  canvas.addEventListener("pointerdown", function (e) {
    if (!self.enabled) return;
    // A MODIFIED LEFT DRAG IS THE TRACKPAD'S MIDDLE BUTTON. A MacBook trackpad
    // reports exactly two buttons, so `e.button === 1` can never arrive from
    // one and the orbit had no binding at all on that hardware -- not an
    // uncomfortable one, none.
    //
    // SHIFT IS THE ONE THAT SURVIVES THE TRIP. Option was the obvious pick --
    // Blender, Figma and Maya all put the orbit there -- and on Diego's Mac it
    // never reached the page at all: something upstream of the browser claims
    // Option and zooms instead, and whatever claims it, `preventDefault` is
    // downstream of the theft and cannot help. Control is not an option either,
    // because macOS aliases Control+click to a right-click, which is this
    // game's cancel. Shift is left, nothing on the platform wants it, and
    // nothing in the game reads a modifier at all -- verified by grep across
    // js/, where these are the only four modifier reads in the codebase.
    //
    // Option is KEPT as a second binding rather than replaced. Where it is not
    // stolen it is the more familiar gesture, and a binding that silently does
    // not fire costs nothing next to one that does.
    var modified = e.button === 0 && (e.shiftKey || e.altKey);
    var mode = modified ? "orbit"
             : e.button === 1 ? "orbit"
             : (e.button === 2 ? "pan" : null);
    if (!mode) return;
    e.preventDefault();
    // Capture, so a drag that leaves the canvas -- or the window -- still
    // tracks and still gets its pointerup.
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);

    var drag = { mode: mode, id: e.pointerId, x: e.clientX, y: e.clientY,
                 downX: e.clientX, downY: e.clientY };
    if (mode === "pan") {
      self.rightDragMoved = false;
      // DROP THE ORBIT PIVOT. It survives the end of a middle-drag until the
      // easing settles, and while it lives `update()` recomputes the target
      // from it EVERY frame -- which silently overwrote whatever the pan had
      // just set. The symptom was that a right-drag started immediately after
      // turning the camera did nothing at all, while the same drag a second
      // later worked fine. Two gestures cannot both own the target.
      self._orbitPivot = null;
    }

    if (mode === "orbit") {
      // Grab the ground under the cursor and orbit around THAT. Settle the
      // easing first for the same reason the pan does: a pivot measured against
      // a camera that is still moving is a pivot measured against the wrong
      // camera. Falls back to plain target-orbit if the cursor is off the
      // ground plane (above the horizon), which is the only sane thing to do
      // when there is nothing under it to turn around.
      self.yaw = self.wantYaw;
      self.pitch = self.wantPitch;
      self.distance = self.wantDistance;
      self._recomputeBasis();

      var on = self._ndc(e.clientX, e.clientY);
      var pivotOffset = self._groundOffset(on[0], on[1], self.yaw, self.pitch,
        self.distance);
      if (pivotOffset) {
        // CLAMP THE PIVOT, NOT THE TARGET -- see the note in update(). Grabbing
        // just off the edge of the board is easy to do and must not produce an
        // orbit that fights itself.
        // PULL THE PIVOT IN BEFORE USING IT, for two different reasons.
        //
        // Near the top of the screen the ground is very far away -- at a 34
        // degree pitch a pixel a third of the way down the frame can be a
        // kilometre out -- and orbiting around a point that distant sweeps the
        // camera through an enormous arc for a small mouse movement. It is
        // geometrically correct and it feels like the board has been thrown.
        // So the pivot is capped to roughly the ground the camera can actually
        // see, which is what the player thinks they grabbed.
        //
        // Then the board bounds, so grabbing just off the edge does not anchor
        // the view to somewhere there is no game.
        var ox = pivotOffset[0], oy = pivotOffset[1];
        var reach = Math.hypot(ox, oy);
        var maxReach = self.distance * Math.tan(self.fovY / 2) * 1.6;
        if (reach > maxReach && reach > 0) {
          ox *= maxReach / reach;
          oy *= maxReach / reach;
        }
        var wx = self.target[0] + ox;
        var wy = self.target[1] + oy;
        var b = self.bounds;
        if (b) {
          wx = Math.max(b.minX, Math.min(b.maxX, wx));
          wy = Math.max(b.minY, Math.min(b.maxY, wy));
        }
        // Re-derive the anchor pixel from the pivot we actually settled on, or
        // the two disagree from the first frame and the whole lock is built on
        // a point the player did not grab.
        self._orbitPivot = { ndc: on, world: [wx, wy] };
        var reNdc = self._ndcOfGround(wx, wy);
        if (reNdc) self._orbitPivot.ndc = reNdc;
      } else {
        self._orbitPivot = null;
      }
    }

    if (mode === "pan") {
      // THE ORBIT IS FROZEN FOR THE WHOLE PAN, and it has to be settled first.
      //
      // The header's arithmetic only closes if the grabbed offset and every
      // live offset are measured against the SAME yaw/pitch/distance. Reading
      // the live ones looked equivalent and was not: orbit and zoom are DAMPED,
      // so starting a pan within a few frames of either meant every move
      // sampled a slightly different camera and the grabbed ground point slid
      // out from under the cursor -- measured at 1806 px of drift after an
      // orbit-then-pan. Landing the easing instantly on grab costs nothing a
      // player can see (it is ~100 ms from its destination) and makes the pan
      // exact instead of nearly exact.
      self.yaw = self.wantYaw;
      self.pitch = self.wantPitch;
      self.distance = self.wantDistance;
      self._recomputeBasis();

      var n = self._ndc(e.clientX, e.clientY);
      var off = self._groundOffset(n[0], n[1], self.yaw, self.pitch, self.distance);
      // Grabbing above the horizon has no ground point to hold on to. Rather
      // than pan wildly, refuse the drag -- the pointer is not on the board.
      if (!off) return;
      drag.grabOffset = off;
      drag.startTarget = self.target.slice();
      drag.yaw = self.yaw;
      drag.pitch = self.pitch;
      drag.distance = self.distance;
    }
    self._drag = drag;
  });

  canvas.addEventListener("pointermove", function (e) {
    var drag = self._drag;
    if (!drag || drag.id !== e.pointerId) return;
    e.preventDefault();

    if (drag.mode === "orbit") {
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      self.wantYaw += dx * self.orbitSpeed * self.yawSign;
      self.wantPitch = Math.max(self.minPitch, Math.min(self.maxPitch,
        self.wantPitch + dy * self.pitchSpeed * self.pitchSign));
      return;
    }

    // A right-click that never moved is the game's "cancel", not a pan. Four
    // pixels of slop, because a real click always jitters a little and losing
    // deselect to a twitchy hand would be worse than panning four pixels.
    if (Math.abs(e.clientX - drag.downX) > 4 ||
        Math.abs(e.clientY - drag.downY) > 4) {
      self.rightDragMoved = true;
    }

    // Pan. Both the grabbed offset and the live one are measured against the
    // orbit FROZEN AT GRAB TIME, which is what makes this exact rather than
    // merely close -- see the note in pointerdown.
    var n = self._ndc(e.clientX, e.clientY);
    var now = self._groundOffset(n[0], n[1], drag.yaw, drag.pitch, drag.distance);
    if (!now) return;
    self.target[0] = drag.startTarget[0] + drag.grabOffset[0] - now[0];
    self.target[1] = drag.startTarget[1] + drag.grabOffset[1] - now[1];
    self._clampTarget();
    self._recomputeBasis();
  });

  function endDrag(e) {
    if (self._drag && self._drag.id === e.pointerId) {
      if (canvas.releasePointerCapture) {
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
      }
      self._drag = null;
    }
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // Scroll deltas are not always pixels. deltaMode 1 counts LINES and 2 counts
  // PAGES, and Firefox on a mouse still reports lines, so a handler that reads
  // deltaY raw is off by a factor of sixteen on one browser and by a screen
  // height on another.
  function deltaPixels(e) {
    if (e.deltaMode === 1) return { x: e.deltaX * 16, y: e.deltaY * 16 };
    if (e.deltaMode === 2) return { x: e.deltaX * canvas.clientWidth,
                                    y: e.deltaY * canvas.clientHeight };
    return { x: e.deltaX, y: e.deltaY };
  }

  // TELLING A WHEEL FROM TWO FINGERS, which the platform will not tell us.
  //
  // There is no flag for it. What there is: a notched wheel steps in whole
  // multiples of a line or of about 100 pixels, always straight up or down,
  // while a trackpad streams small fractional deltas and almost always leaks a
  // little sideways drift into deltaX. That is a heuristic and it is allowed to
  // be -- being wrong costs one gesture behaving like the other, and BOTH
  // gestures are bound to something sensible, so a miss is a surprise rather
  // than a dead control. Do not tighten this into something that can return
  // "neither".
  function isMouseWheel(e) {
    if (e.deltaMode !== 0) return true;            // lines or pages: a wheel
    return e.deltaX === 0 && Math.abs(e.deltaY) >= 40 &&
           e.deltaY === Math.round(e.deltaY);
  }

  canvas.addEventListener("wheel", function (e) {
    if (!self.enabled) return;
    e.preventDefault();
    // Belt and braces against the autoscroll above, and correct in its own
    // right: a wheel notch arriving mid-drag is not a zoom the player asked
    // for, and zooming under a frozen pan would break the grabbed ground point.
    if (self._drag) return;

    var d = deltaPixels(e);

    // A PINCH IS A WHEEL EVENT WITH ctrlKey FORCED ON. Every engine on macOS
    // synthesises the modifier for a trackpad pinch; there is no pinch event
    // outside Safari's non-standard `gesturechange`, and this is the one signal
    // they all agree on. It is not the player holding Control, and it must be
    // tested BEFORE the wheel heuristic -- a pinch reports deltaMode 0 with a
    // large integer deltaY often enough to be mistaken for a notch.
    if (e.ctrlKey) {
      self.zoomBy(e.clientX, e.clientY, -d.y * self.pinchZoomSpeed);
      return;
    }
    if (isMouseWheel(e)) {
      self.zoomBy(e.clientX, e.clientY, -d.y * self.wheelZoomSpeed);
      return;
    }
    // Two fingers. The ground goes WITH the fingers, which is why the delta is
    // negated: the browser reports how far the document would scroll, and a
    // document scrolling down is content moving up.
    self.panByPixels(-d.x, -d.y);
  }, { passive: false });

  // DO NOT LET AN ORBIT ALSO PLACE A TOWER. The game binds its own `mousedown`
  // and `click` to this same canvas, and the compatibility mouse events fire
  // whatever `pointerdown` did -- so before this, Option+drag turned the camera
  // AND spent the player's gold on whatever was armed. Captured on the window
  // so it lands before the event reaches the canvas at all, which makes it
  // independent of who happened to register their listener first.
  function swallowOrbitClick(e) {
    if (!self.enabled || !(e.shiftKey || e.altKey)) return;
    if (e.target !== canvas && e.target !== self.canvas) return;
    e.stopPropagation();
  }
  window.addEventListener("mousedown", swallowOrbitClick, true);
  window.addEventListener("click", swallowOrbitClick, true);

  // PHYSICAL POSITION, NOT PRINTED LETTER.
  //
  // `e.key` is what the LAYOUT prints, so on an AZERTY board the WASD cluster
  // came back as "z q s d": S and D landed, W and A did not, and moving
  // forward meant reaching for the top-left corner of the keyboard while the
  // other three fingers stayed put. `e.code` names the physical key instead --
  // KeyW is the key above KeyS on every layout ever made -- so the same four
  // keys under the same four fingers work on QWERTY, AZERTY and QWERTZ with
  // nothing to configure and no settings screen to find first.
  window.addEventListener("keydown", function (e) { self._keys[e.code] = true; });
  window.addEventListener("keyup", function (e) { self._keys[e.code] = false; });
  // A window that loses focus mid-key would otherwise pan forever.
  window.addEventListener("blur", function () { self._keys = Object.create(null); });
};

// Zoom one notch, keeping the ground under the cursor where it is. Same
// identity as the pan: measure the offset before and after the distance
// change and move the target by the difference.
OrbitCamera.prototype.zoomAt = function (clientX, clientY, direction) {
  this.zoomBy(clientX, clientY, direction > 0 ? -1 : 1);
};

// Zoom by a CONTINUOUS number of notches, positive being closer.
//
// The notched version above threw the magnitude away and read the sign only,
// which was fine while the only source was a mouse and wrong the moment a
// trackpad was one: an inertial two-finger flick delivers dozens of events in a
// few hundred milliseconds, and counting each one as a full 1.12 step meant a
// light gesture crossed the entire zoom range. A fractional delta has to stay
// fractional the whole way through.
OrbitCamera.prototype.zoomBy = function (clientX, clientY, notches) {
  if (!notches) return;
  var n = this._ndc(clientX, clientY);
  // Measured against where the orbit is HEADED, not where it currently is, for
  // the same reason the pan freezes it: mid-orbit the two differ, and mixing
  // them puts the correction on the wrong angle. Both samples use the same
  // pair, so the difference is exact either way -- this just makes it exact
  // about the camera the player is going to be looking through.
  var before = this._groundOffset(n[0], n[1], this.wantYaw, this.wantPitch,
    this.wantDistance);

  var next = this.wantDistance * Math.pow(this.zoomStep, -notches);
  this.wantDistance = Math.max(this.minDistance, Math.min(this.maxDistance, next));

  var after = this._groundOffset(n[0], n[1], this.wantYaw, this.wantPitch,
    this.wantDistance);
  if (before && after) {
    this.target[0] += before[0] - after[0];
    this.target[1] += before[1] - after[1];
    this._clampTarget();
  }
};

// Slide the view by a screen distance, the ground staying under the fingers.
//
// Same identity the drag-pan is built on, with the canvas CENTRE standing in
// for the grabbed pixel: there is no pointer anchored to a two-finger scroll,
// so there is nothing to grab, but the offset between two pixels measured
// against a frozen orbit is exact wherever it is sampled. `dxPx`/`dyPx` are how
// far the BOARD should travel, not the camera -- hence the subtraction.
OrbitCamera.prototype.panByPixels = function (dxPx, dyPx) {
  if (!dxPx && !dyPx) return;
  var r = this.canvas.getBoundingClientRect();
  var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  var a = this._ndc(cx, cy);
  var b = this._ndc(cx + dxPx, cy + dyPx);
  var from = this._groundOffset(a[0], a[1], this.wantYaw, this.wantPitch,
    this.wantDistance);
  var to = this._groundOffset(b[0], b[1], this.wantYaw, this.wantPitch,
    this.wantDistance);
  // Past the horizon there is no ground to grab and no honest answer.
  if (!from || !to) return;
  this.target[0] -= to[0] - from[0];
  this.target[1] -= to[1] - from[1];
  this._clampTarget();
};

// --- per-frame --------------------------------------------------------------

OrbitCamera.prototype.update = function (dt) {
  var k = this._keys;
  var mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  var my = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  if (mx || my) {
    // Screen-relative, and scaled by distance so a keypress covers the same
    // FRACTION of the view whether you are zoomed in or out.
    var f = this.keyPanSpeed * dt * (this.distance / 900);
    // The forward vector flattened onto the ground: "up" on screen should walk
    // you north, not push the camera into the floor.
    var fx = this._fwd[0], fy = this._fwd[1];
    var fl = Math.hypot(fx, fy) || 1;
    this.target[0] += (this._right[0] * mx + (fx / fl) * my) * f;
    this.target[1] += (this._right[1] * mx + (fy / fl) * my) * f;
    this._clampTarget();
  }

  // Frame-rate independent easing: the fraction of the remaining gap closed
  // per second is constant, so a 30 fps machine and a 144 fps machine take the
  // same real time to settle. A plain `x += (want - x) * 0.2` does not.
  var t = 1 - Math.exp(-this.damping * Math.max(0, dt));
  // Yaw is unwrapped rather than clamped: spinning past a full turn is fine
  // and the shortest-arc form keeps it from unwinding the long way round.
  this.yaw += (this.wantYaw - this.yaw) * t;
  this.pitch += (this.wantPitch - this.pitch) * t;
  this.distance += (this.wantDistance - this.distance) * t;

  // ORBIT AROUND WHAT YOU GRABBED, not around the target.
  //
  // Turning around the target is only what you want when the target IS the
  // thing you are looking at. Put the cursor on a tower off to one side and
  // that tower swings across the screen instead of staying put, which is
  // exactly the complaint zoom-to-cursor already solved for the wheel.
  //
  // Same identity as the zoom, anchored to the pixel the drag STARTED on:
  // `_groundOffset` gives the ground point that pixel sees, measured from the
  // target, so putting the target at `pivot - offset` forces that pixel to keep
  // seeing the pivot. Works for yaw and pitch together and needs no special
  // case for either.
  //
  // Applied HERE rather than in pointermove because the orbit is damped: the
  // angles keep moving for a few frames after the mouse stops, and correcting
  // only on input would let the pivot slide during the settle.
  if (this._orbitPivot) {
    var p = this._orbitPivot;
    var off = this._groundOffset(p.ndc[0], p.ndc[1], this.yaw, this.pitch,
      this.distance);
    // WHEN THE PIVOT CANNOT BE HONOURED, LET GO OF IT.
    //
    // Flatten the camera toward the horizon and the grabbed pixel eventually
    // rises above it: the ground ray stops meeting the plane, or meets it so
    // far away that holding the pivot would fling the target to the other side
    // of the world. Silently skipping the correction on those frames is what
    // the first version did, and the pivot slid 434 px whenever a drag reached
    // the shallow pitch clamp -- the yaw kept turning while nothing held the
    // anchor. Releasing instead degrades to an ordinary target orbit, which is
    // what a flattened camera can actually do.
    // A miss means the anchor pixel has swung above the horizon, which only
    // happens at the shallow end of the pitch range. Hold the target still for
    // that frame rather than releasing the pivot: releasing mid-gesture is what
    // produced a visible 434 px slide, because the yaw carried on turning with
    // nothing holding the anchor.
    if (off) {
      // DELIBERATELY NOT CLAMPED. The target is only the look-at point; while a
      // pivot is live it is a derived value, and clamping a derived value tears
      // the thing it was derived from off its anchor. The first version did
      // clamp here and the pivot slid 313 px on any grab near an edge -- x held
      // and y did not, because only y was out of bounds.
      //
      // The invariant the clamp exists for -- you cannot lose the board -- is
      // enforced on the PIVOT instead, at grab time, where it belongs: if the
      // point you are turning around is on the board, you are looking at the
      // board, whatever the target has to do to arrange that.
      this.target[0] = p.world[0] - off[0];
      this.target[1] = p.world[1] - off[1];
      this.target[2] = 0;
    }
    // Let go once the drag is over AND the easing has caught up, or the pivot
    // would keep steering the camera into the next gesture. The target rejoins
    // the normal rules at that point.
    var settled = Math.abs(this.wantYaw - this.yaw) < 1e-4 &&
      Math.abs(this.wantPitch - this.pitch) < 1e-4;
    if (!this._drag && settled) {
      this._orbitPivot = null;
      this._clampTarget();
    }
  }

  this._recomputeBasis();
};

// REBUILT ONLY WHEN THE CAMERA ACTUALLY MOVED.
//
// This is called once per PROJECTED POINT, not once per frame: `worldToScreen`
// needs it, and the overlay layer projects every vertex of every ground ring,
// cone, ritual circle and debris spoke individually -- that is the whole reason
// those shapes lie correctly on a turning board instead of being ellipses
// pasted on the screen. A 44-point ring was therefore paying for 44 lookAts,
// 44 perspectives and 44 4x4 multiplies. On a crowded board with the effect
// layer running that came to about 20 ms a frame, all of it recomputing the
// same matrix.
//
// The cache key is everything the result depends on: the eye, the target and
// the lens. Eight number comparisons against three matrix builds is not a close
// contest, and it cannot go stale -- `_recomputeBasis()` rewrites `_eye`
// whenever yaw, pitch or distance change, so a moved camera always misses.
OrbitCamera.prototype.viewProjection = function () {
  var e = this._eye, t = this.target, aspect = this.aspect();
  var c = this._vpKey;
  if (c && c[0] === e[0] && c[1] === e[1] && c[2] === e[2] &&
      c[3] === t[0] && c[4] === t[1] && c[5] === t[2] &&
      c[6] === aspect && c[7] === this.fovY) {
    return this._viewProj;
  }
  if (!c) c = this._vpKey = new Float64Array(8);
  c[0] = e[0]; c[1] = e[1]; c[2] = e[2];
  c[3] = t[0]; c[4] = t[1]; c[5] = t[2];
  c[6] = aspect; c[7] = this.fovY;
  GLMath.lookAt(this._view, this._eye, this.target, OrbitCamera.WORLD_UP);
  GLMath.perspective(this._proj, this.fovY, aspect, this.near, this.far);
  return GLMath.multiply(this._viewProj, this._proj, this._view);
};

OrbitCamera.prototype.eye = function () { return this._eye; };

// Put the whole board on screen and keep it there THROUGH A FULL ORBIT.
//
// Solved rather than guessed, because "distance = board size" is only right at
// one aspect ratio and one pitch. At distance d with half-FOV f, the camera
// sees `d*tan(f)*aspect` of ground across, and `d*tan(f)/sin(pitch)` of ground
// in depth -- depth is the interesting one, because a shallow pitch stretches
// the same screen height over far more ground, so a fit computed flat crops
// badly the moment you tilt down.
//
// Both use the board's half-DIAGONAL, not its half-width. The diagonal is the
// one radius that does not change as the board spins under the camera, so a fit
// made at one yaw holds at all 360 degrees of them and an orbit never clips a
// corner into view.
OrbitCamera.prototype.fitBounds = function (minX, minY, maxX, maxY, margin) {
  margin = margin === undefined ? 1.06 : margin;
  var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

  // THE FOUR REAL CORNERS, AT THE CURRENT YAW -- not the circumscribed circle.
  //
  // The circle is the yaw-proof choice and it was the first thing tried: fit it
  // once and no orbit can ever crop the board. But these boards are about 2.3:1,
  // so their circumscribed circle is more than twice the area they occupy, and
  // the fit came out spending over half the window on empty floor. Every camera
  // in the genre lets the level leave frame when you spin it; none of them opens
  // on a view that small. So this fits what is actually there.
  var r = Math.hypot(maxX - minX, maxY - minY) / 2;
  var corners = [
    [minX, minY, 0], [maxX, minY, 0], [maxX, maxY, 0], [minX, maxY, 0],
    // Edge midpoints too: under perspective the middle of the near edge can
    // project wider than either corner beside it.
    [cx, minY, 0], [cx, maxY, 0], [minX, cy, 0], [maxX, cy, 0]
  ];

  // Iterate rather than solve. A closed form exists for a flat rectangle under
  // an unpitched camera and is wrong for this one: perspective magnifies the
  // NEAR corners, so the widest point on screen is the bottom edge of the
  // board rather than its middle, and a fit computed at the target's depth
  // crops both sides the moment the camera is tilted. Projecting the real
  // corners and scaling by the overshoot converges in three passes and is
  // correct at any pitch, aspect and yaw.
  // Fitting the circumscribed CIRCLE rather than the rectangle is what makes
  // one fit hold at every yaw: the circle looks identical from all of them, so
  // there is no worst angle to search for.
  var keptYaw = this.yaw, keptPitch = this.pitch, keptDist = this.distance;
  var keptTarget = this.target.slice();
  this.target[0] = cx; this.target[1] = cy; this.target[2] = 0;
  this.yaw = this.wantYaw;
  this.pitch = Math.max(this.wantPitch, this.minPitch);

  var d = Math.max(this.minDistance, r * 2);
  for (var pass = 0; pass < 6; pass++) {
    this.distance = d;
    this._recomputeBasis();
    var vp = this.viewProjection();
    var worst = 0;
    for (var c = 0; c < corners.length; c++) {
      var p = corners[c];
      var w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
      // Behind the eye: no finite scale fixes this pass, so back off hard and
      // let the next one measure again.
      if (w <= 1e-6) { worst = Math.max(worst, 3); continue; }
      var nx = (vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12]) / w;
      var ny = (vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13]) / w;
      worst = Math.max(worst, Math.abs(nx), Math.abs(ny));
    }
    if (worst <= 1e-6) break;
    // Screen extent falls off as 1/d, so scaling by the overshoot lands the
    // worst point on the frame edge. Two or three passes is plenty.
    d *= worst;
    if (Math.abs(worst - 1) < 0.002) break;
  }
  d *= margin;

  this.yaw = keptYaw; this.pitch = keptPitch; this.distance = keptDist;
  this.target = keptTarget;
  this._recomputeBasis();

  this.maxDistance = Math.max(this.maxDistance, d * 1.5);
  this.frame(cx, cy, d);
  return d;
};

OrbitCamera.prototype.frame = function (x, y, distance) {
  this.target[0] = x; this.target[1] = y; this.target[2] = 0;
  if (distance !== undefined) {
    this.wantDistance = Math.max(this.minDistance,
      Math.min(this.maxDistance, distance));
    this.distance = this.wantDistance;
  }
  this._clampTarget();
  this._recomputeBasis();
};
