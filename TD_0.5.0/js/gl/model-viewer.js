// ---------------------------------------------------------------------------
// ModelViewer3D -- the real 3D body of ANY registered model, at an arbitrary
// yaw and an arbitrary animation frame, as a bitmap the 2D HUD can blit.
//
// WHAT THIS IS FOR, AND WHY IT IS NOT js/gl/tower-preview.js. That module is
// the ICON path: five tower families, frame 0 only, one fixed three-quarter
// yaw, cached per (model, pixel size), and every one of those restrictions is
// deliberate and documented there. It exists so a 22 px slot costs one
// `drawImage` per frame and no GL work at all.
//
// This module is the VIEWER path, and it exists because the interface now has
// to show three things that path cannot express:
//
//   * the index shows a model per tower, per upgrade tier and per enemy, and
//     it was showing the 2D fallback drawing instead -- so a player studied one
//     picture in the guide and met a different one on the road;
//   * the upgrade panel shows the tower's CURRENT body slowly turning, so a5
//     and b5 stop being bodies nobody has ever seen;
//   * the enemy viewer walks an enemy in place while it turns.
//
// A turning, walking body is a live render loop, which is exactly the thing
// tower-preview.js was built to avoid. So the cost rules below are the whole
// design and everything else follows from them.
//
// -- THE TWO POLICIES, AND WHICH SCREEN GETS WHICH ------------------------
//
// A render here is an FBO pass plus a `readPixels`, and the readback is a full
// pipeline flush: tower-preview.js measured 3.6-7.1 ms per icon and named the
// readback as almost all of it. That is affordable in some places and ruinous
// in others, and the dividing line is simply whether the BOARD is drawing.
//
//   CACHED (default).  For anything drawn over a live board -- the build bar,
//   the store cards, the model on the upgrade panel. Yaw is quantised to
//   YAW_STEPS around the turn and every (model, size, yaw step, frame) is kept,
//   so a full revolution renders YAW_STEPS times ONCE and is free forever
//   after. Renders are rate-limited to one per animation frame, so a panel
//   opening never costs more than one readback in any frame; the turn fills in
//   over its first revolution and the slots that miss fall back to their own
//   2D glyph for that frame, which is the same path a no-WebGL build takes
//   permanently. Nothing is ever blank.
//
//   LIVE.  For a full-screen page where `draw()` returns before the board is
//   ever asked to render -- the index, which is the only such screen and is
//   where the enemy viewer lives (js/game.js draw(): `screen === "index"`
//   returns straight after Codex.draw). There the whole frame budget is free,
//   so the body is rendered fresh every frame at continuous yaw with no cache
//   growth at all. That matters: a viewer-sized entry is hundreds of KB, and a
//   revolution's worth of them at every walk frame would be tens of MB.
//
// The policy is the caller's to choose because only the caller knows what else
// is on the screen. Getting it wrong is not a correctness failure in either
// direction -- it is frame time in one and memory in the other.
//
// -- THE FIT IS A CYLINDER, NOT A BOX, AND THAT IS THE ONE THING HERE THAT
// WOULD OTHERWISE SHIP WRONG.
//
// tower-preview.js fits each model to its screen extents AT ITS ONE FIXED YAW.
// Fit a TURNING body that way and it grows and shrinks as it turns -- a rifle
// swinging broadside is 2x the silhouette it is end-on -- so the model pumps
// once per revolution and reads as a zoom rather than a rotation.
//
// So the fit is taken about the axis the body actually turns on. Every vertex
// contributes its radius from the model's +Z axis and its height; the bounding
// CYLINDER is then projected exactly, with no yaw sampling, because the camera
// basis has a horizontal x axis (see basis()):
//
//     max |u|  =  max rho                      (rho = hypot(px, py))
//     v range  =  pz*by[2]  +/-  rho*hypot(by[0], by[1])
//
// One pass, exact for every yaw at once, and the body holds its size all the
// way round.
//
// AND IT IS TAKEN ACROSS THE WHOLE WALK BAND, not at frame 0. A single frame of
// an animated model is a sample, not a measurement: measured on this project's
// own bodies, a rest-pose extent and an all-frames envelope differ by the whole
// leg swing (0.498 u against 0.598 u on one body, the gap occurring at two
// frames in eight). Fitted to the rest pose, a walking viewer clips its own
// stride twice per cycle -- and only twice, which is exactly the kind of defect
// a per-frame review passes.
//
// -- WHICH FRAMES ARE THE WALK is asked of the model, never derived. `bands`
// is the exporter's declaration and World3D.walkBand validates it. Enemies
// treat frame 0 as a walk frame; blubs and summoners reserve it as a rest pose.
// Any arithmetic on `frames.length` here would be wrong for one of those two
// families whichever way it was written.
//
// MEASURED 2026-08-13, and it is a caveat on everything above: every `bands`
// value in the tree is `[[0, frames.length]]` or absent, on all 110 registered
// models. So the banded path ships UNEXERCISED BY REAL GEOMETRY -- a reader
// that ignored the field entirely would behave identically today. Asking
// World3D rather than dividing is what makes that a non-event on the day a
// genuinely banded body lands, which is the only reason the field exists.
//
// PRESENTATION ONLY. Nothing here reads or writes a simulation value.
// ---------------------------------------------------------------------------

var ModelViewer3D = (function () {
  "use strict";

  // The same correction gl-world applies (`authoredFrontOffset`): the Summoner,
  // the Siphon and the blubs were authored facing +Y while the game's
  // convention is FORWARD = +X. Copied deliberately rather than imported, on
  // the same terms tower-preview.js copied it -- it is four characters of rule,
  // gl-world keeps it private, and it dies in all three places on the day the
  // geometry is re-authored.
  var FRONT_PLUS_Y = /^(blub-|summoner-|siphon-)/;

  // --- the viewer camera ----------------------------------------------------
  //
  // ORTHOGRAPHIC, for the reason the icon camera is: perspective spends
  // silhouette on foreshortening, and every one of these bodies carries its
  // identity along its forward axis -- a rifle, a hammer haft, a sceptre, a
  // pair of wings. Ortho keeps the whole shape at one scale, and it is also
  // what makes the cylindrical fit exact rather than approximate.
  //
  // PITCH 17 degrees, the icon camera's, against the board's 34. Nothing is
  // drawn under these bodies, so a steeper pitch spends its budget on the tops
  // of shoulders; at 17 a standing figure keeps its full height and a walking
  // one keeps its stride visible, which is the whole point of the enemy page.
  //
  // The camera-relative KEY LIGHT is not a stylistic carry-over from the icon
  // path, it is a requirement here: a world-fixed sun on a body that turns
  // through 360 degrees puts the lit side away from the lens for half the
  // revolution, so the body would fade to a silhouette and back once per turn.
  // Bolted to the camera, every surface the viewer can see stays lit and what
  // remains of the shading is form.
  var PITCH = 17 * Math.PI / 180;
  var CAM_YAW = -Math.PI / 2;          // the board's own yaw, so "profile" agrees
  var MARGIN = 0.06;                   // breathing room, fraction of half-extent

  var KEY_FRAME = [-0.30, 0.62, 0.72]; // [right, up, towards eye]
  var FILL_FRAME = [0.55, -0.35, 0.75];
  var AMBIENT = [0.40, 0.42, 0.48];
  var FILL = [0.20, 0.24, 0.30];
  var KEY = 1.25;
  var GLOW = 0.85;

  // Supersample, then downscale in 2D: the FBO cannot be multisampled in WebGL1
  // and this game still supports it. The cap is much higher than the icon
  // path's 192 because a viewer is a picture rather than a glyph -- but it is a
  // cap, because the readback is linear in pixels and it is the readback that
  // costs.
  var SUPERSAMPLE = 3;
  var MAX_RENDER_PX = 512;

  // How many yaw entries a cached revolution costs. 24 is a 15 degree step:
  // at a panel-sized body the step is under a pixel of silhouette movement at
  // the rim, and a full turn is 24 renders paid once. Finer is free at draw
  // time and not free in fill time -- every extra step is another readback the
  // first time round.
  var YAW_STEPS = 24;

  var cache = new Map();               // key -> canvas | null
  var CACHE_MAX = 128;
  var fit = Object.create(null);       // model name -> cylindrical fit

  var fbo = null;                      // { fb, tex, depth, size }
  var pixels = null;
  var scratch = null;
  var liveOut = null;                  // reused output canvas for live renders
  var failed = false;
  var stats = { renders: 0, blits: 0, misses: 0, deferred: 0, live: 0,
                lastRenderMs: 0, totalRenderMs: 0 };

  // ONE CACHED FILL PER ANIMATION FRAME, reset by requestAnimationFrame rather
  // than by a clock -- a render's own duration counts towards a wall-clock gap,
  // so a 12 ms readback satisfies a 10 ms gap by the time the next caller asks
  // and the first frame fills four of them. The clock stays only as a floor for
  // a caller driving draw() by hand with no rAF running, so such a caller
  // converges instead of freezing on one entry forever. Same arrangement, and
  // the same reasoning, as tower-preview.js.
  var budgetUsed = false;
  var ticking = false;
  var lastRenderAt = -1e9;
  var NO_RAF_FALLBACK_MS = 100;

  function startTick() {
    if (ticking || typeof requestAnimationFrame !== "function") return;
    ticking = true;
    (function tick() {
      budgetUsed = false;
      requestAnimationFrame(tick);
    })();
  }

  var mView = new Float32Array(16);
  var mProj = new Float32Array(16);
  var mViewProj = new Float32Array(16);
  var mInstance = new Float32Array(16);
  var mGroup = new Float32Array(16);

  // --- plumbing -------------------------------------------------------------

  function renderer() {
    if (failed) return null;
    if (typeof World3D === "undefined" || !World3D.isEnabled) return null;
    if (!World3D.isEnabled()) return null;
    var r = World3D.renderer();
    if (!r || !r.gl || r.gl.isContextLost()) return null;
    return r;
  }

  function available() { return !!renderer(); }

  function has(name) {
    return !!(name && typeof GLModels !== "undefined" && GLModels.has(name));
  }

  // The camera basis, as three orthonormal world vectors. `z` points from the
  // subject back towards the eye, matching GLMath.lookAt's convention. `x` is
  // horizontal by construction (its z component is zero), which is what makes
  // the cylindrical fit below exact.
  function basis() {
    var cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    var z = [cp * Math.cos(CAM_YAW), cp * Math.sin(CAM_YAW), sp];
    var xx = -z[1], xy = z[0];
    var xl = Math.hypot(xx, xy) || 1;
    var x = [xx / xl, xy / xl, 0];
    var y = [z[1] * x[2] - z[2] * x[1],
             z[2] * x[0] - z[0] * x[2],
             z[0] * x[1] - z[1] * x[0]];
    return { x: x, y: y, z: z };
  }
  var B = basis();

  function inFrame(f) {
    var v = [f[0] * B.x[0] + f[1] * B.y[0] + f[2] * B.z[0],
             f[0] * B.x[1] + f[1] * B.y[1] + f[2] * B.z[1],
             f[0] * B.x[2] + f[1] * B.y[2] + f[2] * B.z[2]];
    var l = Math.hypot(v[0], v[1], v[2]) || 1;
    return new Float32Array([v[0] / l, v[1] / l, v[2] / l]);
  }
  var KEY_DIR = inFrame(KEY_FRAME);
  var FILL_DIR = inFrame(FILL_FRAME);

  // WHICH FRAMES ARE THE WALK. Asked of World3D so there is exactly one
  // validator in the build; the local fallback exists only so this module still
  // draws a static body in a build where gl-world is older than it is, and it
  // is the DEFAULT band, never a derived one.
  function bandOf(m) {
    if (typeof World3D !== "undefined" && typeof World3D.walkBand === "function") {
      return World3D.walkBand(m);
    }
    return [0, (m && m.frames && m.frames.length) ? m.frames.length : 1];
  }

  function bandFrameOf(band, drive) {
    if (typeof World3D !== "undefined" && typeof World3D.bandFrame === "function") {
      return World3D.bandFrame(band, drive);
    }
    return band[0] + (Math.floor(drive * band[1]) % band[1]);
  }

  // THE BOUNDING CYLINDER, ACROSS THE WHOLE WALK BAND.
  //
  // Returns the exact screen extents of the body for EVERY yaw at once, so a
  // turning body holds its size. Runs once per model for the life of the page:
  // one pass over the posed vertices per frame of the band.
  function fitOf(r, name) {
    if (fit[name]) return fit[name];
    var m = GLModels.get(r, name);
    if (!m || !m.expanded) return null;
    var p = m.expanded.positions;
    var band = bandOf(m);
    var by = B.y, bz = B.z;
    // How much of a horizontal radius lands on the vertical screen axis, and
    // how much on depth. Both are constants of the camera, not of the model.
    var sy = Math.hypot(by[0], by[1]);
    var sz = Math.hypot(bz[0], bz[1]);
    var maxRho = 0;
    var vlo = Infinity, vhi = -Infinity, dlo = Infinity, dhi = -Infinity;
    var groups = (m.groups && m.groups.length)
      ? m.groups : [{ first: 0, count: (p.length / 3) | 0 }];
    var frames = (m.frames && m.frames.length) ? m.frames : null;
    var count = frames ? band[1] : 1;

    for (var f = 0; f < count; f++) {
      var pose = frames ? frames[band[0] + f] : null;
      for (var g = 0; g < groups.length; g++) {
        var grp = groups[g];
        if (!grp.count) continue;
        var q = pose ? pose[g] : null;
        var end = (grp.first + grp.count) * 3;
        for (var i = grp.first * 3; i < end; i += 3) {
          var ax = p[i], ay = p[i + 1], az = p[i + 2];
          if (q) {
            // The group's pose matrix, column-major as GLMath writes them.
            var tx = q[0] * ax + q[4] * ay + q[8] * az + q[12];
            var ty = q[1] * ax + q[5] * ay + q[9] * az + q[13];
            var tz = q[2] * ax + q[6] * ay + q[10] * az + q[14];
            ax = tx; ay = ty; az = tz;
          }
          var rho = Math.sqrt(ax * ax + ay * ay);
          if (rho > maxRho) maxRho = rho;
          var vc = az * by[2], vr = rho * sy;
          if (vc - vr < vlo) vlo = vc - vr;
          if (vc + vr > vhi) vhi = vc + vr;
          var dc = az * bz[2], dr = rho * sz;
          if (dc - dr < dlo) dlo = dc - dr;
          if (dc + dr > dhi) dhi = dc + dr;
        }
      }
    }
    if (!isFinite(vlo) || maxRho <= 0 && vhi <= vlo) return null;
    var out = {
      band: band,
      hu: Math.max(1e-4, maxRho),
      cv: (vlo + vhi) / 2,
      hv: Math.max(1e-4, (vhi - vlo) / 2),
      cd: (dlo + dhi) / 2,
      hd: Math.max(1e-4, (dhi - dlo) / 2),
      yawOffset: FRONT_PLUS_Y.test(name) ? -Math.PI / 2 : 0
    };
    fit[name] = out;
    return out;
  }

  function ensureTarget(gl, size) {
    if (fbo && fbo.size === size) return fbo;
    if (fbo) {
      gl.deleteFramebuffer(fbo.fb);
      gl.deleteTexture(fbo.tex);
      gl.deleteRenderbuffer(fbo.depth);
    }
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER, depth);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    if (!ok) { failed = true; return null; }
    fbo = { fb: fb, tex: tex, depth: depth, size: size };
    pixels = new Uint8Array(size * size * 4);
    return fbo;
  }

  // ONE BODY, RENDERED ONCE, at `yaw` and `frame`. Returns a 2D canvas of
  // exactly `px` square with a transparent background, or null if anything at
  // all was unavailable -- in which case the caller falls back and the player
  // never sees a hole.
  //
  // `into` lets the live path reuse one output canvas instead of allocating a
  // fresh one sixty times a second.
  function render(name, px, yaw, frame, glow, tint, into) {
    var r = renderer();
    if (!r) return null;
    var gl = r.gl;
    var m = GLModels.get(r, name);
    if (!m || !m.gpu) return null;
    var f = fitOf(r, name);
    if (!f) return null;

    // Never BELOW the requested size: the cap governs how much supersampling is
    // bought, not how big a picture may be.
    var big = Math.max(px, Math.min(MAX_RENDER_PX, px * SUPERSAMPLE)) | 0;
    var t0 = (typeof performance !== "undefined") ? performance.now() : 0;
    var target = ensureTarget(gl, big);
    if (!target) return null;

    // The board's already-rendered pixels are sitting in the default
    // framebuffer waiting to be composited and nothing else sets the viewport
    // before the next frame's begin(), so both are restored below.
    var prevFB = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    var prevVP = gl.getParameter(gl.VIEWPORT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, big, big);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    // A square box: the larger of the two screen extents sets the scale, and
    // the body is centred on the other axis. `hu` is a radius about the turn
    // axis, so it is already symmetric and needs no centre term.
    var half = Math.max(f.hu, f.hv) * (1 + MARGIN);
    var pad = f.hd + half + 1;
    // The subject's centre in world space: on the turn axis horizontally,
    // mid-body vertically.
    var cwx = B.y[0] * f.cv + B.z[0] * f.cd;
    var cwy = B.y[1] * f.cv + B.z[1] * f.cd;
    var cwz = B.y[2] * f.cv + B.z[2] * f.cd;
    GLMath.lookAt(mView,
      [cwx + B.z[0] * pad, cwy + B.z[1] * pad, cwz + B.z[2] * pad],
      [cwx, cwy, cwz], [0, 0, 1]);
    GLMath.orthographic(mProj, half, 1, 0.01, pad * 2 + 2);
    GLMath.multiply(mViewProj, mProj, mView);

    gl.useProgram(r.program);
    gl.uniformMatrix4fv(r.uniform.viewProj, false, mViewProj);
    gl.uniform3fv(r.uniform.keyDir, KEY_DIR);
    gl.uniform3fv(r.uniform.fillDir, FILL_DIR);
    gl.uniform3fv(r.uniform.ambient, AMBIENT);
    gl.uniform3fv(r.uniform.fillColor, FILL);
    gl.uniform1f(r.uniform.keyStrength, KEY);
    r.setGlow(glow === undefined ? GLOW : glow, tint || null);

    // Drawn group by group with the requested frame's pose, exactly as
    // gl-world's drawActor does it. A single matrix over the whole buffer would
    // show the geometry in each empty's LOCAL space, which for a rig whose rest
    // pose is not identity is a pile of parts and not a body.
    GLMath.modelYaw(mInstance, 0, 0, 0, yaw + f.yawOffset, 1);
    var n = (m.frames && m.frames.length) ? m.frames.length : 0;
    var pose = n ? m.frames[((frame | 0) % n + n) % n] : null;
    r.bind(m.gpu);
    if (!pose || !m.groups.length) {
      r.drawRange(mInstance, 0, m.gpu.count);
    } else {
      for (var g = 0; g < m.groups.length; g++) {
        var grp = m.groups[g];
        if (!grp.count) continue;
        var q = pose[g];
        r.drawRange(q ? GLMath.multiply(mGroup, mInstance, q) : mInstance,
          grp.first, grp.count);
      }
    }

    gl.readPixels(0, 0, big, big, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    r.setGlow(0, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFB);
    gl.viewport(prevVP[0], prevVP[1], prevVP[2], prevVP[3]);

    // GL reads bottom-up; a canvas is top-down. Flipped row by row on the way
    // into the ImageData rather than with a second drawImage, because a
    // negative-scale blit of a translucent bitmap is where fringing comes from.
    if (!scratch) scratch = document.createElement("canvas");
    if (scratch.width !== big) { scratch.width = big; scratch.height = big; }
    var sctx = scratch.getContext("2d");
    var img = sctx.createImageData(big, big);
    var dst = img.data, stride = big * 4;
    for (var row = 0; row < big; row++) {
      dst.set(pixels.subarray((big - 1 - row) * stride, (big - row) * stride),
        row * stride);
    }
    sctx.putImageData(img, 0, 0);

    var out = into || document.createElement("canvas");
    if (out.width !== px || out.height !== px) { out.width = px; out.height = px; }
    var octx = out.getContext("2d");
    octx.clearRect(0, 0, px, px);
    octx.imageSmoothingEnabled = true;
    if (typeof octx.imageSmoothingQuality !== "undefined") {
      octx.imageSmoothingQuality = "high";
    }
    octx.drawImage(scratch, 0, 0, big, big, 0, 0, px, px);

    stats.renders++;
    var dt = ((typeof performance !== "undefined") ? performance.now() : 0) - t0;
    stats.lastRenderMs = dt;
    stats.totalRenderMs += dt;
    return out;
  }

  // The device scale the HUD context is currently drawing at, so a bitmap lands
  // 1:1 on a hidpi display instead of being authored small and upscaled.
  function deviceScale(ctx) {
    if (typeof ctx.getTransform !== "function") return 1;
    try {
      var t = ctx.getTransform();
      var s = Math.hypot(t.a, t.b);
      return (isFinite(s) && s > 0) ? s : 1;
    } catch (e) { return 1; }
  }

  function cached(name, px, step, frame, glow, tint) {
    var key = name + "@" + px + "@" + step + "@" + frame;
    var hit = cache.get(key);
    if (hit !== undefined) {
      cache.delete(key);
      cache.set(key, hit);                 // genuinely least-recently-used
      return hit;
    }
    stats.misses++;
    var now = (typeof performance !== "undefined") ? performance.now() : 0;
    if (budgetUsed && now - lastRenderAt < NO_RAF_FALLBACK_MS) {
      // Deferred, NOT failed -- deliberately not written to the cache, so the
      // next frame tries again instead of remembering a miss forever.
      stats.deferred++;
      return null;
    }
    budgetUsed = true;
    lastRenderAt = now;
    var made = render(name, px, step * 2 * Math.PI / YAW_STEPS, frame,
      glow, tint, null) || null;
    // A null IS cached: a model that cannot be rendered will not start being
    // renderable, and retrying it every frame forever is the one failure mode
    // that would actually cost something.
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, made);
    return made;
  }

  // --- the one call an interface makes -------------------------------------
  //
  // Returns TRUE only if it actually put pixels down. FALSE means "nothing was
  // drawn, draw the 2D fallback" -- the same degradation contract
  // TowerPreview3D.draw offers, so a caller that honours the return value can
  // never have a blank slot.
  //
  //   opts.yaw    radians, 0 = the model's own forward. Quantised in cached
  //               mode; used exactly in live mode.
  //   opts.frame  animation frame index, already resolved. Use walkFrame()
  //               to turn a cycle count into one.
  //   opts.live   true on a screen where the board does not draw. Renders
  //               fresh every call and keeps nothing.
  //   opts.glow   emissive strength, defaults to GLOW.
  //   opts.tint   emissive tint, or null.
  function draw(ctx, name, cx, cy, size, opts) {
    if (!ctx || !size || !has(name)) return false;
    var r = renderer();
    if (!r) return false;
    opts = opts || {};
    var yaw = opts.yaw || 0;
    var frame = opts.frame || 0;
    // Quantised to even pixels: the device scale is read off the live context
    // transform, and a caller that has composed a transform of its own would
    // otherwise mint a cache entry for every intermediate scale it passes
    // through and evict the real ones.
    var px = Math.max(8, Math.round(size * deviceScale(ctx) / 2) * 2);
    if (px > MAX_RENDER_PX) px = MAX_RENDER_PX;
    var img;
    try {
      if (opts.live) {
        if (!liveOut) liveOut = document.createElement("canvas");
        img = render(name, px, yaw, frame, opts.glow, opts.tint, liveOut);
        if (img) stats.live++;
      } else {
        startTick();
        var step = Math.round(yaw / (2 * Math.PI) * YAW_STEPS);
        step = ((step % YAW_STEPS) + YAW_STEPS) % YAW_STEPS;
        img = cached(name, px, step, frame, opts.glow, opts.tint);
      }
    } catch (e) {
      // A GL failure must never take the interface down with it.
      failed = true;
      return false;
    }
    if (!img) return false;
    // `size` IS THE BOX, the same contract drawIcon and TowerPreview3D.draw
    // follow: the footprint the interface has budgeted, centred on (cx, cy).
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    stats.blits++;
    return true;
  }

  // Turn a cycle count into a frame index inside the model's own walk band.
  // `cycles` is "how many complete walk cycles have elapsed" and may be
  // fractional; whole numbers are one full stride.
  function walkFrame(name, cycles) {
    var r = renderer();
    if (!r || !has(name)) return 0;
    var m = GLModels.get(r, name);
    if (!m || !m.frames || !m.frames.length) return 0;
    return bandFrameOf(bandOf(m), cycles < 0 ? 0 : cycles);
  }

  // How many frames the walk band has, for a caller that wants to know whether
  // a body animates at all -- a static body should not be given a walking
  // viewer's furniture.
  function walkLength(name) {
    var r = renderer();
    if (!r || !has(name)) return 0;
    var m = GLModels.get(r, name);
    if (!m || !m.frames || !m.frames.length) return 0;
    return bandOf(m)[1];
  }

  function invalidate() {
    cache.clear();
    fit = Object.create(null);
    // The render target is a GL object, not a JS one: dropping the reference
    // leaks a texture and a renderbuffer per call.
    var r = renderer();
    if (fbo && r) {
      try {
        r.gl.deleteFramebuffer(fbo.fb);
        r.gl.deleteTexture(fbo.tex);
        r.gl.deleteRenderbuffer(fbo.depth);
      } catch (e) { /* a lost context has already reclaimed them */ }
    }
    fbo = null; pixels = null;
  }

  // A LOST CONTEXT TAKES THE CACHE WITH IT: the canvases would survive but the
  // framebuffer, the texture and the model buffers behind them would not.
  //
  // Bound whenever the document is ready rather than on `load` alone, because
  // this file is a classic script in the middle of index.html on a normal load
  // but is also re-executed by the visual pass's hot reloader long after `load`
  // has fired -- and a listener that only waits for an event already in the
  // past is never attached.
  function bindContextEvents() {
    // A BROWSER RETURNS NULL FOR A MISSING ELEMENT; tests/sandbox.smoke.js's DOM
    // stub THROWS on an id it has no stub for, and it has none for "#gl".
    // Nothing here is required for the module to work, so failing to attach
    // must never be fatal.
    var c = null;
    try { c = document.getElementById("gl"); } catch (e) { return; }
    if (!c || c.__modelViewerBound) return;
    c.__modelViewerBound = true;
    c.addEventListener("webglcontextlost", function () {
      cache.clear(); fit = Object.create(null);
      fbo = null; pixels = null; failed = true;
    });
    c.addEventListener("webglcontextrestored", function () {
      failed = false; invalidate();
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", bindContextEvents);
    } else {
      bindContextEvents();
    }
  }

  return {
    available: available,
    has: has,
    draw: draw,
    walkFrame: walkFrame,
    walkLength: walkLength,
    invalidate: invalidate,
    YAW_STEPS: YAW_STEPS,
    stats: function () {
      return { entries: cache.size, renders: stats.renders,
               misses: stats.misses, deferred: stats.deferred,
               live: stats.live, blits: stats.blits,
               lastRenderMs: +stats.lastRenderMs.toFixed(3),
               totalRenderMs: +stats.totalRenderMs.toFixed(3),
               failed: failed };
    }
  };
})();
