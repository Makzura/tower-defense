// ---------------------------------------------------------------------------
// TowerPreview3D -- the real 3D body of a tower, as a 22 px icon on the 2D HUD.
//
// WHAT THIS REPLACES. The build bar, the armoury cards, the loadout slots and
// the codex rail all draw `Type.drawIcon(ctx, cx, cy, size)`: a hand-drawn 2D
// glyph per tower, authored before any of these towers had a mesh. The player
// picks a tower from a picture that is no longer a picture of it. This module
// renders the actual registered model instead and hands back a bitmap the HUD
// can blit, so the icon and the thing that lands on the board are the same
// object.
//
// WHY AN OFFSCREEN TARGET AND NOT "just draw GL into the HUD". There are two
// canvases: `#gl` (WebGL, the board) and `#game` (2D, everything else). They
// are different contexts and a 2D context cannot receive GL draws. The route
// that does work is to render the model into a framebuffer object on the
// board's OWN context, read it back once, and keep the result as a small 2D
// canvas that the HUD blits like any other image.
//
// WHY THE BOARD'S CONTEXT AND NOT A PRIVATE ONE. GLModels caches a model's
// uploaded buffers on the model object itself (`model.gpu`), not per renderer.
// A second GL context asking GLModels for a mesh would either steal that cache
// -- handing the board buffers belonging to a context it cannot draw with --
// or force a duplicate upload of every previewed body. Sharing the board's
// renderer costs nothing, keeps one cache honest, and makes the degradation
// rule fall out for free: no WebGL means no World3D means no renderer means
// this module reports unavailable and the old `drawIcon` runs untouched.
//
// THE COST, WHICH IS THE PART THAT MATTERS. `PERF.md` allows roughly 6 ms of
// headroom at the stress scene and names overdraw as the sensitive axis. An
// icon re-rendered per slot per frame would be five extra render passes and
// five GPU->CPU readbacks EVERY frame, which is the one thing a readback must
// never be. So a render happens exactly once per (model, pixel size) and the
// steady state is one `drawImage` of a ~22 px bitmap per slot -- no GL work at
// all in the HUD path once the cache is warm. Measured numbers are in the
// visual-pass log; the shape of it is: first frame pays, every frame after
// does not.
//
// PRESENTATION ONLY. Nothing here reads or writes a simulation value. It is
// handed a tower TYPE (or an optional live tower) and produces pixels.
// ---------------------------------------------------------------------------

var TowerPreview3D = (function () {
  "use strict";

  // --- which mesh family belongs to which tower id -------------------------
  //
  // Only the FAMILY lives here. The per-tier group name ("base", "a3", "b5")
  // is decided by gl-world's own selectors -- riflemanGroup, sniperGroup,
  // warbringerGroup, siphonGroup, summonerGroup -- and those rules are not
  // duplicated here, because a second copy of a tiering rule is a second copy
  // that drifts. When gl-world exports its resolver (`World3D.modelFor`) a live
  // tower is asked through it; otherwise every call site in the interface is
  // drawing a tower TYPE that has no tiers yet, and a type is always its base
  // body.
  var FAMILY = {
    smasher: "warbringer",
    soldier: "rifleman",
    longshot: "sniper",
    siphon: "siphon",
    blub: "summoner",
    // THE SIXTH TYPE, AND THE ONE THIS MAP EXISTS TO CATCH. A tower absent
    // from here is not an error anywhere -- `modelName` answers null, every
    // caller falls back to `drawIcon`, and nothing logs. So the Farm shipped
    // its twelve bodies to the board while the armoury, the loadout row, the
    // build bar and the index rail all kept drawing its flat glyph, and the
    // only symptom was a picture that looked deliberate.
    farm: "farm"
  };

  // The same correction gl-world applies (`authoredFrontOffset`): the Summoner,
  // the Siphon and the blubs were authored facing +Y while the game's
  // convention is FORWARD = +X. Copied deliberately rather than imported --
  // it is four characters of rule and gl-world keeps it private -- and it dies
  // in both places on the day the geometry is re-authored.
  var FRONT_PLUS_Y = /^(blub-|summoner-|siphon-|rifleman-)/;

  // --- the icon camera ------------------------------------------------------
  //
  // NOT the board camera, and the differences are all in service of 22 px.
  //
  // ORTHOGRAPHIC. Perspective spends silhouette on foreshortening: the parts
  // nearest the lens grow and the rest shrinks, which at 22 px means a rifle
  // muzzle eating the man holding it. Ortho keeps every part at one scale, so
  // the whole shape gets to contribute to a shape that is 22 px wide.
  //
  // PITCH 17 degrees, against the board's 34. Pitch is height traded for
  // ground plan, and an icon has no ground: nothing under these models is
  // drawn, so the entire top-down half of a 34-degree view would be spent on
  // the tops of shoulders. At 17 degrees a standing figure keeps its full
  // height in a square box -- the head, the weapon line and the stance all
  // stay separable -- and there is still just enough tilt to tell a pauldron
  // from a hat.
  //
  // YAW -25 degrees off profile, which is a shallower three-quarter than a
  // character sheet would use, and it was chosen by measurement rather than by
  // taste. Every one of these towers carries its weapon along its forward
  // axis, so yaw is the dial that decides how much weapon survives: swept from
  // -15 to -95 degrees, the Arcane Sniper's silhouette goes from 1.03 wide-to-
  // tall down to 0.34 as his rifle turns away from the lens and collapses into
  // his body. The Rifleman does the same thing more gently, 0.75 to 0.47.
  //
  // Those two are the pair a player can actually confuse -- both are navy
  // coats holding a long gun -- and the angle that separates them most is the
  // shallow one, where the Sniper reads as WIDE and the Rifleman as COMPACT.
  // -25 keeps almost all of that separation while still turning enough body
  // towards the lens to show the Warbringer's hammer head and the Rifleman's
  // pack, which pure profile flattens away.
  var ICON_PITCH = 17 * Math.PI / 180;
  var ICON_YAW = -25 * Math.PI / 180;
  // The board camera's own yaw, so "profile" here means the same thing it
  // means on the board and a tower does not read mirrored between the two.
  var CAM_YAW = -Math.PI / 2;
  // Breathing room inside the box, as a fraction of the fitted half-extent.
  // Kept to a hair, because the rim below adds its own ring of padding and
  // the two margins stack: with both at 6% the model came out filling 89% of
  // an icon that only has 22 pixels to spend.
  var MARGIN = 0.015;

  // THE KEY LIGHT IS BOLTED TO THE CAMERA, and that is the single change that
  // made these icons readable.
  //
  // The board's sun sits at a fixed world angle, which is correct for a board:
  // it is the same sun for everything and the shadow side of a body is
  // information. An icon has no environment and no neighbours -- it is 22 px on
  // a panel at luminance 30 -- and a body whose lit side happens to face away
  // from the world sun arrives as a dark smudge. The first build measured mean
  // ink luminance of 49 (Rifleman) to 66 (Siphon): twenty points above the
  // panel behind it, which is not a picture, it is a stain.
  //
  // So the key is placed in the CAMERA's frame instead -- upper left of frame,
  // the same direction td_scene lights from, but relative to this view rather
  // than to the world. Every surface the viewer can see is now facing
  // substantially towards the light, and what remains of the shading is the
  // upper-left-to-lower-right gradient that gives the shape its form. The
  // trade is real and deliberate: an icon this small spends its budget on
  // presence, not on truthful shadow direction.
  var KEY_FRAME = [-0.30, 0.62, 0.72];   // [right, up, towards eye]
  var FILL_FRAME = [0.55, -0.35, 0.75];
  // Swept against measured mean ink luminance and against the fraction of
  // pixels clipping to white. Going further is not free and not worth it: from
  // here to ambient 0.50 / key 1.40 buys the Rifleman four more points of
  // luminance and costs the Summoner 5.6% of his pixels blown to flat white,
  // which at 22 px is a hole in the middle of the icon.
  var ICON_AMBIENT = [0.40, 0.42, 0.48];
  var ICON_FILL = [0.20, 0.24, 0.30];
  var ICON_KEY = 1.25;
  // Emissive materials driven a little. The ley coils, the arc core and the
  // Siphon's gold are the single strongest identity cue these bodies have --
  // at 22 px a teal spark is legible when a silhouette detail is not.
  var ICON_GLOW = 0.85;

  // Supersample, then downscale in 2D. The FBO cannot be multisampled in
  // WebGL1 and this game still supports it, so antialiasing is bought by
  // rendering big and letting the 2D context filter it down -- which is also
  // the only step of the whole pipeline that gets the icon a soft edge against
  // the panel behind it. Capped so a 3x HUD scale cannot ask for a 600 px
  // render of a 22 px picture.
  var SUPERSAMPLE = 4;
  var MAX_RENDER_PX = 192;

  // A RIM, DRAWN IN 2D, AROUND THE SILHOUETTE.
  //
  // Three of these five bodies are dark clothing on an almost-black panel --
  // the Rifleman's ink coat measured mean ink luminance 66 against a panel at
  // 30 -- and no amount of lighting fixes that, because the surface colour the
  // art board specifies is genuinely nearly black and brightening it past a
  // point simply stops being that tower. What separates a dark shape from a
  // dark ground is an edge, so the icon gets one: the alpha mask, splatted
  // eight ways and filled with the HUD's own slot-border blue, under the model
  // itself.
  //
  // Done on the 2D side rather than as a scaled-up second GL pass because from
  // here it is a mask operation with a controllable colour and opacity, where
  // in the shader it could only ever have been geometry clipped to flat white.
  // It costs eight blits of a ~150 px canvas, once, at cache-fill.
  // Swept at 0 / 0.5 / 0.7 / 0.9 final pixels against real 22 px icons. At 0
  // the Rifleman is a smudge. At 0.9 the rim starts winning: a rifle barrel is
  // about one pixel wide at this size, so a 0.9 px rim on both sides of it
  // replaces the barrel entirely and the Sniper turns into a grey mannequin
  // with his arms out. 0.65 is the last value where every interior colour
  // survives.
  var RIM_COLOR = "rgba(196,214,240,0.62)";
  var RIM_PX = 0.65;                    // in FINAL icon pixels

  // --- state ----------------------------------------------------------------

  var cache = new Map();          // key -> canvas | null
  var CACHE_MAX = 64;
  // Set by render() when a render came back with no opaque pixel at all, read
  // and cleared by cached(), which must not remember such a result. See the
  // guard in render().
  var emptyRender = false;
  // ONE CACHE FILL PER FRAME, AND NOT BECAUSE THE RENDER IS EXPENSIVE.
  //
  // Measured on the five base bodies: the bbox pass is 0.1-0.9 ms and the rest
  // -- 3.6 to 7.1 ms per icon -- is almost entirely `readPixels`, which is a
  // full pipeline flush. Filling five slots in one frame is a ~24 ms hitch on
  // the frame the build bar first appears, which is a visible stutter at the
  // exact moment a run starts.
  //
  // So a render is rate-limited to one per frame and the slots that miss fall
  // through to their own 2D glyph for that frame, which is the same path the
  // no-WebGL build takes permanently. The bar is fully 3D within five frames
  // -- under a tenth of a second -- and no frame ever pays more than one
  // readback. Nothing is ever blank at any point in that.
  //
  // THE BUDGET IS RESET BY requestAnimationFrame, NOT BY A CLOCK. A wall-clock
  // gap was tried first and does not work, because a render's own duration
  // counts towards its own gap: a 12 ms readback stall satisfies a 10 ms gap
  // by the time the next slot asks, and the first frame filled four icons and
  // took 181 ms. The animation frame is the only thing that actually means
  // "next frame". The clock stays only as a floor for a caller driving draw()
  // by hand with no rAF running, so such a caller still converges instead of
  // freezing at one icon forever.
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
  var fit = Object.create(null);  // model name -> view-space extents
  var fbo = null;                 // { fb, tex, depth, size }
  var pixels = null;              // readback scratch
  var scratch = null;             // supersampled 2D canvas
  var failed = false;             // a hard failure disables the module for good
  var stats = { renders: 0, blits: 0, misses: 0, deferred: 0, lastRenderMs: 0,
                totalRenderMs: 0 };

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

  // The model name for a tower TYPE (or a live tower, when gl-world offers its
  // resolver). Returns null when nothing is registered, which is the signal to
  // let the old 2D glyph run.
  function modelName(what, tower) {
    if (typeof GLModels === "undefined") return null;
    if (tower && typeof World3D !== "undefined" &&
        typeof World3D.modelFor === "function") {
      var live = World3D.modelFor(tower);
      if (live && GLModels.has(live)) return live;
    }
    var id = (typeof what === "string") ? what
      : (what && (what.ID || (what.constructor && what.constructor.ID)));
    var fam = FAMILY[id];
    if (!fam) return null;
    var name = fam + "-base";
    return GLModels.has(name) ? name : null;
  }

  // The camera basis, as three orthonormal world vectors. `z` points from the
  // subject back towards the eye, matching GLMath.lookAt's convention.
  function basis() {
    var cp = Math.cos(ICON_PITCH), sp = Math.sin(ICON_PITCH);
    var z = [cp * Math.cos(CAM_YAW), cp * Math.sin(CAM_YAW), sp];
    // x = normalize(up x z) with up = +Z.
    var xx = -z[1], xy = z[0], xz = 0;
    var xl = Math.hypot(xx, xy, xz) || 1;
    var x = [xx / xl, xy / xl, xz / xl];
    var y = [z[1] * x[2] - z[2] * x[1],
             z[2] * x[0] - z[0] * x[2],
             z[0] * x[1] - z[1] * x[0]];
    return { x: x, y: y, z: z };
  }
  var B = basis();

  // A direction expressed in the camera's frame, resolved into world space.
  function inFrame(f) {
    var v = [f[0] * B.x[0] + f[1] * B.y[0] + f[2] * B.z[0],
             f[0] * B.x[1] + f[1] * B.y[1] + f[2] * B.z[1],
             f[0] * B.x[2] + f[1] * B.y[2] + f[2] * B.z[2]];
    var l = Math.hypot(v[0], v[1], v[2]) || 1;
    return new Float32Array([v[0] / l, v[1] / l, v[2] / l]);
  }
  var KEY_DIR = inFrame(KEY_FRAME);
  var FILL_DIR = inFrame(FILL_FRAME);

  // HOW BIG THE THING ACTUALLY IS, ON SCREEN, IN THIS VIEW.
  //
  // Measured in the camera's own basis rather than as a world AABB, because an
  // AABB's eight corners over-report a diagonal silhouette and the icon would
  // be fitted to a box the model never fills. One pass over the posed vertices
  // gives the exact screen extents, and it runs once per model for the life of
  // the page.
  //
  // Posed with FRAME 0 -- the rest pose, which the animation contract requires
  // to be the pose a frameless runtime shows. An icon that breathed would be a
  // per-frame re-render, which is the cost this whole module exists to avoid.
  function fitOf(r, name) {
    if (fit[name]) return fit[name];
    var m = GLModels.get(r, name);
    if (!m || !m.expanded) return null;
    var p = m.expanded.positions;
    var yaw = ICON_YAW + (FRONT_PLUS_Y.test(name) ? -Math.PI / 2 : 0);
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var bx = B.x, by = B.y, bz = B.z;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    var pose = (m.frames && m.frames.length) ? m.frames[0] : null;
    var groups = (m.groups && m.groups.length)
      ? m.groups : [{ first: 0, count: (p.length / 3) | 0 }];

    for (var g = 0; g < groups.length; g++) {
      var grp = groups[g];
      if (!grp.count) continue;
      var q = pose ? pose[g] : null;
      var end = (grp.first + grp.count) * 3;
      for (var i = grp.first * 3; i < end; i += 3) {
        var ax = p[i], ay = p[i + 1], az = p[i + 2];
        if (q) {
          // The group's rest-pose matrix, column-major as GLMath writes them.
          var tx = q[0] * ax + q[4] * ay + q[8] * az + q[12];
          var ty = q[1] * ax + q[5] * ay + q[9] * az + q[13];
          var tz = q[2] * ax + q[6] * ay + q[10] * az + q[14];
          ax = tx; ay = ty; az = tz;
        }
        // The instance yaw, about +Z.
        var wx = ax * cy - ay * sy;
        var wy = ax * sy + ay * cy;
        var wz = az;
        var u = wx * bx[0] + wy * bx[1] + wz * bx[2];
        var v = wx * by[0] + wy * by[1] + wz * by[2];
        var d = wx * bz[0] + wy * bz[1] + wz * bz[2];
        if (u < lo[0]) lo[0] = u; if (u > hi[0]) hi[0] = u;
        if (v < lo[1]) lo[1] = v; if (v > hi[1]) hi[1] = v;
        if (d < lo[2]) lo[2] = d; if (d > hi[2]) hi[2] = d;
      }
    }
    if (!isFinite(lo[0])) return null;
    var f = {
      yaw: yaw,
      cu: (lo[0] + hi[0]) / 2, cv: (lo[1] + hi[1]) / 2, cd: (lo[2] + hi[2]) / 2,
      hu: Math.max(1e-4, (hi[0] - lo[0]) / 2),
      hv: Math.max(1e-4, (hi[1] - lo[1]) / 2),
      hd: Math.max(1e-4, (hi[2] - lo[2]) / 2)
    };
    fit[name] = f;
    return f;
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

  // ONE ICON, RENDERED ONCE. Returns a 2D canvas of exactly `px` square with a
  // transparent background, or null if anything at all was not available --
  // in which case the caller falls back and the player never sees a hole.
  function render(name, px) {
    var r = renderer();
    if (!r) return null;
    var gl = r.gl;
    var m = GLModels.get(r, name);
    if (!m || !m.gpu) return null;
    var f = fitOf(r, name);
    if (!f) return null;

    // Never BELOW the requested size: the cap is on how much supersampling is
    // bought, not on how big an icon may be. Written the other way round it
    // silently rendered a 256 px request at 192 and upscaled it.
    var big = Math.max(px, Math.min(MAX_RENDER_PX, px * SUPERSAMPLE)) | 0;
    var t0 = (typeof performance !== "undefined") ? performance.now() : 0;
    var target = ensureTarget(gl, big);
    if (!target) return null;

    // Everything this pass touches is put back. The world pass re-uploads its
    // own uniforms in `begin()` every frame, so the uniform state does not
    // strictly need restoring -- but the framebuffer binding and the viewport
    // do, because the board's already-rendered pixels are sitting in the
    // default framebuffer waiting to be composited and nothing else will set
    // the viewport before the next frame's `begin()`.
    var prevFB = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    var prevVP = gl.getParameter(gl.VIEWPORT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, big, big);
    // Transparent, so the panel colour behind the icon shows through: every lit
    // pixel is opaque and only the cleared background stays clear, which is
    // precisely the mask an icon wants.
    //
    // THIS COMMENT USED TO SAY "the shader always writes alpha 1", AND THAT WAS
    // THE ASSUMPTION THAT BROKE. It is not a property of the shader, it is a
    // property of `uAlpha`, which is a uniform -- and the camo pass made it a
    // variable without anyone revisiting the two places that had written this
    // sentence down. The opacity is now asserted below, next to `setGlow`,
    // rather than assumed here.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    // Fit: a square box, so the larger of the two screen extents sets the
    // scale and the model is centred on the other axis.
    var half = Math.max(f.hu, f.hv) * (1 + MARGIN);
    var pad = f.hd + half + 1;
    var cx = B.x[0] * f.cu + B.y[0] * f.cv + B.z[0] * f.cd;
    var cyw = B.x[1] * f.cu + B.y[1] * f.cv + B.z[1] * f.cd;
    var cz = B.x[2] * f.cu + B.y[2] * f.cv + B.z[2] * f.cd;
    GLMath.lookAt(mView,
      [cx + B.z[0] * pad, cyw + B.z[1] * pad, cz + B.z[2] * pad],
      [cx, cyw, cz], [0, 0, 1]);
    GLMath.orthographic(mProj, half, 1, 0.01, pad * 2 + 2);
    GLMath.multiply(mViewProj, mProj, mView);

    gl.useProgram(r.program);
    gl.uniformMatrix4fv(r.uniform.viewProj, false, mViewProj);
    gl.uniform3fv(r.uniform.keyDir, KEY_DIR);
    gl.uniform3fv(r.uniform.fillDir, FILL_DIR);
    gl.uniform3fv(r.uniform.ambient, ICON_AMBIENT);
    gl.uniform3fv(r.uniform.fillColor, ICON_FILL);
    gl.uniform1f(r.uniform.keyStrength, ICON_KEY);
    r.setGlow(ICON_GLOW, null);
    // OPACITY IS ASSERTED, NOT INHERITED. `uAlpha` is a uniform, and outside
    // gl-world's camo pass the only thing that ever writes it is
    // `GLRenderer.begin`. A GL uniform initialises to ZERO, so on any screen
    // reached without the board having drawn -- the index, the armoury -- every
    // icon rendered here came back fully transparent while this function
    // happily returned a canvas and its caller returned TRUE. The bug hides
    // because it repairs itself: once the board has drawn once, `begin()` has
    // run and every icon is correct for the rest of the session.
    r.setFade(1);

    // Drawn group by group with frame 0's pose, exactly as gl-world's
    // drawActor does it. A single matrix over the whole buffer would show the
    // geometry in each empty's LOCAL space, which for a rig whose rest pose is
    // not identity is a pile of parts and not a tower.
    GLMath.modelYaw(mInstance, 0, 0, 0, f.yaw, 1);
    var pose = (m.frames && m.frames.length) ? m.frames[0] : null;
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

    // AN EMPTY BITMAP IS A FAILURE, NOT AN ICON. Without this, "the render
    // succeeded" and "there is something in it" are the same answer, and the
    // caller's fallback -- the whole reason `draw()` returns a boolean -- can
    // never fire for the one failure that actually happened. Early-breaks on
    // the first opaque byte, so the cost lands on the failing case.
    var opaque = false;
    for (var ai = 3; ai < dst.length; ai += 4) {
      if (dst[ai] !== 0) { opaque = true; break; }
    }
    if (!opaque) { emptyRender = true; return null; }
    sctx.putImageData(img, 0, 0);

    // The rim, then the model over it, both still at supersampled size so the
    // downscale below antialiases the edge as one picture rather than
    // compositing two already-aliased ones.
    var k = big / px;
    var ring = Math.max(1, Math.round(RIM_PX * k));
    var lit = scratch;
    if (RIM_PX > 0) {
      var side = big + ring * 2;
      var rc = document.createElement("canvas");
      rc.width = side; rc.height = side;
      var rctx = rc.getContext("2d");
      // Eight directions rather than four: with four, a diagonal edge -- a
      // rifle barrel, a hammer haft, every interesting line on these models --
      // gets a rim on one side and nothing on the other.
      for (var a = 0; a < 8; a++) {
        var th = a * Math.PI / 4;
        rctx.drawImage(scratch,
          ring + Math.round(Math.cos(th) * ring),
          ring + Math.round(Math.sin(th) * ring));
      }
      rctx.globalCompositeOperation = "source-in";
      rctx.fillStyle = RIM_COLOR;
      rctx.fillRect(0, 0, side, side);
      rctx.globalCompositeOperation = "source-over";
      rctx.drawImage(scratch, ring, ring);
      lit = rc;
    }

    var out = document.createElement("canvas");
    out.width = px; out.height = px;
    var octx = out.getContext("2d");
    octx.imageSmoothingEnabled = true;
    if (typeof octx.imageSmoothingQuality !== "undefined") {
      octx.imageSmoothingQuality = "high";
    }
    octx.drawImage(lit, 0, 0, lit.width, lit.height, 0, 0, px, px);

    stats.renders++;
    var dt = ((typeof performance !== "undefined") ? performance.now() : 0) - t0;
    stats.lastRenderMs = dt;
    stats.totalRenderMs += dt;
    return out;
  }

  // The device scale the HUD context is currently drawing at. game.js gives
  // `#game` a backing store of up to 3x the logical 1280x720 and bakes the
  // ratio into the context transform, so a bitmap authored at logical size
  // would be upscaled and soft on every hidpi display. Rendering at the real
  // device size and blitting into a logical-size box lands 1:1.
  function deviceScale(ctx) {
    if (typeof ctx.getTransform !== "function") return 1;
    try {
      var t = ctx.getTransform();
      var s = Math.hypot(t.a, t.b);
      return (isFinite(s) && s > 0) ? s : 1;
    } catch (e) { return 1; }
  }

  function cached(name, px, immediate) {
    var key = name + "@" + px;
    var hit = cache.get(key);
    if (hit !== undefined) {
      // Re-inserted so the eviction order is genuinely least-recently-used
      // rather than insertion order.
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    stats.misses++;
    var now = (typeof performance !== "undefined") ? performance.now() : 0;
    if (!immediate && budgetUsed && now - lastRenderAt < NO_RAF_FALLBACK_MS) {
      // Deferred, NOT failed -- deliberately not written to the cache, so the
      // next frame tries again instead of remembering a miss forever.
      stats.deferred++;
      return null;
    }
    budgetUsed = true;
    lastRenderAt = now;
    emptyRender = false;
    var made = render(name, px) || null;
    // AN EMPTY RENDER IS NOT REMEMBERED, and it is the exception to the rule
    // below: it is the one null that can stop being null. The missing-fade bug
    // produced empty bitmaps until the board had drawn once and correct ones
    // forever after, so caching it would hold a build slot on its flat glyph
    // for the whole session over a condition that had already cleared.
    if (emptyRender) { emptyRender = false; return null; }
    // Every OTHER null IS cached: a model that cannot be rendered at all will
    // not start being renderable, and retrying it every frame forever is the
    // one failure mode that would actually cost something.
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, made);
    return made;
  }

  // --- the one call an interface makes -------------------------------------
  //
  // Same shape as `Type.drawIcon(ctx, cx, cy, size)`, and returns TRUE only if
  // it actually put pixels down. False means "nothing was drawn, draw the 2D
  // glyph", which is the whole degradation contract: a caller that ignores the
  // return value leaves a blank slot, and a caller that honours it can never
  // have one.
  function draw(ctx, what, cx, cy, size, tower) {
    if (!ctx || !size) return false;
    var r = renderer();
    if (!r) return false;
    startTick();
    var name = modelName(what, tower);
    if (!name) return false;
    // Quantised to even pixels. The device scale is read off the live context
    // transform, and a caller that has composed any transform of its own -- a
    // camera shake, a hover zoom -- would otherwise mint a new cache entry for
    // every intermediate scale it passes through and evict the real ones.
    var px = Math.max(8, Math.round(size * deviceScale(ctx) / 2) * 2);
    var img;
    try {
      img = cached(name, px);
    } catch (e) {
      // A GL failure must never take the interface down with it. One bad
      // render disables the module and every icon reverts for the session.
      failed = true;
      return false;
    }
    if (!img) return false;
    // `size` IS THE BOX, not a radius. Smasher.drawIcon fills `size` square
    // around (cx, cy) and Soldier.drawIcon inscribes a circle of diameter
    // `size` in the same square, so `size` is the footprint the interface has
    // budgeted -- in the build bar exactly the 22 px between the hotkey above
    // and the tower name below, whose top edge is 12 px under the icon centre.
    // Anything larger runs into the label.
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    stats.blits++;
    return true;
  }

  // A canvas of the icon, for a caller that wants to composite it itself
  // (the sandbox draws into its own little 2D canvas rather than the HUD).
  function icon(what, sizePx, tower) {
    var name = modelName(what, tower);
    if (!name) return null;
    // Immediate: an explicit ask from a tool or a one-off composite is not a
    // frame of the game and has no per-frame budget to protect.
    try { return cached(name, Math.max(8, Math.round(sizePx)), true); }
    catch (e) { failed = true; return null; }
  }

  // Drop everything. Called on a context loss, and useful from the console
  // after a camera constant is retuned.
  function invalidate() {
    cache.clear();
    fit = Object.create(null);
    // The render target is a GL object, not a JS one: dropping the reference
    // leaks a texture and a renderbuffer per call, and `invalidate` is exactly
    // what a retune loop calls a hundred times.
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

  // A LOST CONTEXT TAKES THE CACHE WITH IT. Every entry is a 2D canvas and
  // would survive, but the framebuffer, the texture and the model buffers
  // behind them would not, so the next fill would draw into a dead target.
  //
  // Bound whenever the document is ready rather than on `load` alone: this
  // file is a classic script in the middle of index.html on a normal load, but
  // it is also re-executed by the visual pass's hot reloader long after `load`
  // has fired, and a listener that only ever waits for an event already in the
  // past is a listener that is never attached.
  function bindContextEvents() {
    // A BROWSER RETURNS NULL FOR A MISSING ELEMENT. tests/sandbox.smoke.js does
    // not: its DOM stub THROWS on an id it has no stub for, and it has none for
    // "#gl" because the smoke test drives the 2D board. That turned a load-time
    // convenience into a crash that took the whole suite down -- it stopped
    // reporting a summary line at all, which is how ci-check caught it.
    //
    // Nothing here is required for the module to work; losing the listeners
    // only costs a cache flush on a context loss, so failing to attach them
    // must never be fatal.
    var c = null;
    try { c = document.getElementById("gl"); } catch (e) { return; }
    if (!c || c.__towerPreviewBound) return;
    c.__towerPreviewBound = true;
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
    draw: draw,
    icon: icon,
    modelName: modelName,
    invalidate: invalidate,
    stats: function () {
      return { entries: cache.size, renders: stats.renders,
               misses: stats.misses, deferred: stats.deferred,
               blits: stats.blits,
               lastRenderMs: +stats.lastRenderMs.toFixed(3),
               totalRenderMs: +stats.totalRenderMs.toFixed(3),
               failed: failed };
    }
  };
})();
