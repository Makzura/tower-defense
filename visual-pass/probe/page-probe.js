// ---------------------------------------------------------------------------
// TDProbe -- the in-page half of the changed-pixel rig.
//
// NOT part of the game. Injected at runtime, never referenced by index.html,
// never writes a game file. It drives the game's own globals: the real
// update(), the real draw(), the real constructors.
//
// IT READS #gl AND ONLY #gl. Bodies are drawn there. The 2D overlay (#game)
// carries projectiles, health bars, beams and range rings -- diffing the wrong
// canvas returns a clean zero, and a clean zero is the most believable wrong
// answer available. Every capture below is a gl.readPixels off the WebGL
// drawing buffer, taken in the SAME synchronous task as the draw() that filled
// it, so no preserveDrawingBuffer is needed and no compositor step can
// invalidate it.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  var frames = Object.create(null);
  var meta = Object.create(null);

  function glCanvas() { return document.getElementById("gl"); }
  function glCtx() { return World3D.renderer().gl; }

  // readPixels returns rows bottom-up. Nothing here flips them: a diff does not
  // care, and every coordinate this file reports is labelled GL-space so it
  // cannot be silently read as screen-space.
  function readGL() {
    var gl = glCtx();
    var c = glCanvas();
    var buf = new Uint8Array(c.width * c.height * 4);
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  }

  function drawAndRead() {
    draw();                       // the game's own top-level draw
    return readGL();
  }

  function diffBuf(a, b, tol) {
    var c = glCanvas(), w = c.width, h = c.height;
    var t = tol || 0;
    var changed = 0, maxChan = 0;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (var i = 0, p = 0; i < a.length; i += 4, p++) {
      var d0 = Math.abs(a[i] - b[i]);
      var d1 = Math.abs(a[i + 1] - b[i + 1]);
      var d2 = Math.abs(a[i + 2] - b[i + 2]);
      var d = d0 > d1 ? d0 : d1; if (d2 > d) d = d2;
      if (d > maxChan) maxChan = d;
      if (d > t) {
        changed++;
        var x = p % w, y = (p / w) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return { changed: changed, total: w * h, maxChan: maxChan,
             bboxGL: changed ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : null,
             canvas: [w, h] };
  }

  var TDProbe = {
    frames: frames,
    meta: meta,

    // ---- setup ----------------------------------------------------------

    // Order matters and every step of it has cost someone a measurement.
    setup: function (mapId) {
      var notes = [];
      // 1. Size the 2D backing store. A 300x150 #game with CSS stretching it
      //    puts every overlay off the bitmap. We do not measure #game, but the
      //    game's draw() writes to it and a throw there kills the frame.
      if (typeof resizeCanvasBackingStore === "function") resizeCanvasBackingStore();
      var m = Maps.byId(mapId || Maps.DEFAULT_ID) || Maps.LIST[0];
      startRun(m, "normal");
      // 2. The GL canvas is installed against whatever rect existed at install
      //    time and stays 1x1 otherwise.
      World3D.resize();
      // 3. Kill the game's own loop. Anything measured across two tool calls
      //    otherwise measures a different frame than the one that was set up.
      var ticks = 0;
      var realRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = function () { ticks++; return 0; };
      notes.push("rAF stubbed");
      // 4. Stop the scheduler the documented way, and keep the base alive --
      //    baseHp reaching 0 sets gameOver and spawning stops silently.
      if (typeof WAVES !== "undefined") waveIndex = WAVES.length;
      gameOver = false;
      baseHp = 100000;
      enemies.length = 0;
      towers.length = 0;
      if (typeof bullets !== "undefined") bullets.length = 0;
      // THE GAME'S OWN VIEW, SOLVED FROM THE BOARD -- AND IT DOES NOT EXIST
      // UNTIL SOMETHING DRAWS.
      //
      // `camera.fitBounds()` is at gl-world.js:947 inside `ensureMap`, and the
      // only caller of `ensureMap` is line 978, inside `drawWorld`. So the fit
      // runs on the FIRST DRAW, not at install and not at startRun. Read the
      // camera before that and you get OrbitCamera's constructor defaults --
      // distance 900 (gl-camera.js:48) and target [0,0,0] -- which is 2.25x
      // closer than a player's opening view and centred off the board entirely.
      //
      // I made exactly that mistake here: reading the camera straight after
      // startRun() returned 900/[0,0,0] and I recorded it as "the game's fitted
      // view". Measured, the two views differ by 3,314 px, so every magnitude
      // taken against it would have been a read of a different picture. The
      // draw below is what makes the value real.
      draw();
      var cam = World3D.camera();
      TDProbe._fitted = { target: cam.target.slice(), distance: cam.distance,
                          pitch: cam.pitch, yaw: cam.yaw };
      var c = glCanvas();
      return { map: m.id, gl: [c.width, c.height],
               fittedCamera: TDProbe._fitted,
               orbitConstructorDefault: 900,
               ui: [document.getElementById("game").width,
                    document.getElementById("game").height],
               dpr: window.devicePixelRatio,
               visibility: document.visibilityState,
               notes: notes };
    },

    cam: function (o) {
      var c = World3D.camera();
      if (o.target) c.target = o.target.slice();
      if (typeof o.distance === "number") c.distance = c.wantDistance = o.distance;
      if (typeof o.pitch === "number") c.pitch = c.wantPitch = o.pitch;
      if (typeof o.yaw === "number") c.yaw = c.wantYaw = o.yaw;
      return "ok";
    },

    // THE VIEW THE GAME ITSELF FITTED, not a hardcoded number that happened to
    // match it once. Restoring the recorded fit keeps every magnitude quotable
    // as "what a player's opening view shows", and it cannot silently drift to
    // the constructor's 900 if fitBounds is ever retuned.
    camDefault: function () {
      if (!TDProbe._fitted) throw new Error("setup() must run before camDefault()");
      // Refuse the constructor default outright. It is the one value that means
      // "the fit had not happened yet", and it is indistinguishable from a real
      // reading in every field except this one.
      if (TDProbe._fitted.distance === 900 && TDProbe._fitted.target[0] === 0 &&
          TDProbe._fitted.target[1] === 0) {
        throw new Error("camDefault: recorded camera is OrbitCamera's " +
          "constructor default (900, [0,0,0]) -- fitBounds had not run. " +
          "setup() must draw before recording.");
      }
      return TDProbe.cam(TDProbe._fitted);
    },

    // The old hardcoded value, kept ONLY so a run can prove the fitted view and
    // the previously-quoted 2022 are the same view before trusting either.
    camHardcoded2022: function () {
      return TDProbe.cam({ target: [640, 360, 0], distance: 2022,
                           pitch: 0.5944591432292686, yaw: -1.5707963267948966 });
    },

    camState: function () {
      var c = World3D.camera();
      return { target: c.target.slice(), distance: c.distance,
               pitch: c.pitch, yaw: c.yaw };
    },

    // Discard N rendered frames. THE FIRST RENDER AFTER ANY SCENE CHANGE
    // DIFFERS FROM THE ONES AFTER IT, and an immediate capture has measured
    // 7,342 px of pure warm-up once already. Every capture in this file is
    // preceded by a discarded draw for that reason.
    //
    // THERE WAS A settle() HERE -- draw until two consecutive frames are
    // bit-identical -- AND IT WAS DELETED ON PURPOSE. `TDProbe.cam` writes
    // `distance` AND `wantDistance` together, so no camera ease is ever left to
    // converge and it returned "settled in 1" every single time. An attempt to
    // make it fail (moving only `wantDistance`) reported "not settled in 400
    // draws" on one run and "settled in 1" on the next from identical code, so
    // it could not even be shown to be falsifiable. An unexercised control is
    // worse than no control: it reads as rigour and establishes nothing. The
    // load-bearing discipline is the discard below, whose null control is
    // exactly 0 on every type measured.
    warm: function (n) {
      var k = n || 1;
      for (var i = 0; i < k; i++) draw();
      return { discarded: k };
    },

    // ---- capture --------------------------------------------------------

    cap: function (key) {
      frames[key] = drawAndRead();
      return { key: key, bytes: frames[key].length };
    },

    diff: function (a, b, tol) {
      if (!frames[a] || !frames[b]) throw new Error("missing frame " + a + "/" + b);
      return diffBuf(frames[a], frames[b], tol || 0);
    },

    // THE OTHER CANVAS, read separately and never composited with #gl.
    // Bodies are on #gl; the 2D overlay carries health bars, beams,
    // projectiles, range rings -- and, on the 2D fallback path, the whole
    // board. A claim about one canvas measured on a composite of both is not a
    // claim about either.
    capUI: function (key) {
      draw();
      var c = document.getElementById("game");
      var g = c.getContext("2d");
      frames["ui:" + key] = g.getImageData(0, 0, c.width, c.height).data;
      return { key: key, size: [c.width, c.height] };
    },

    // `roi` is [x, y, w, h] in SCREEN pixels on #game. The 2D canvas is not
    // stable between two consecutive draws -- measured 1,714 differing pixels
    // across a full-screen bounding box with nothing changed at all -- so a
    // whole-canvas number on it is below its own noise floor and means nothing.
    // Every ROI result here must be quoted beside an ROI null control.
    diffUI: function (a, b, tol, roi) {
      var x = frames["ui:" + a], y = frames["ui:" + b];
      if (!x || !y) throw new Error("missing ui frame");
      var c = document.getElementById("game"), w = c.width, h = c.height;
      var x0 = roi ? Math.max(0, roi[0] | 0) : 0;
      var y0 = roi ? Math.max(0, roi[1] | 0) : 0;
      var x1 = roi ? Math.min(w, x0 + (roi[2] | 0)) : w;
      var y1 = roi ? Math.min(h, y0 + (roi[3] | 0)) : h;
      var t = tol || 0, changed = 0, maxChan = 0, n = 0;
      var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (var yy = y0; yy < y1; yy++) {
        for (var xx = x0; xx < x1; xx++) {
          var i = (yy * w + xx) * 4; n++;
          var d = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]),
                           Math.abs(x[i + 2] - y[i + 2]), Math.abs(x[i + 3] - y[i + 3]));
          if (d > maxChan) maxChan = d;
          if (d > t) {
            changed++;
            if (xx < minX) minX = xx; if (xx > maxX) maxX = xx;
            if (yy < minY) minY = yy; if (yy > maxY) maxY = yy;
          }
        }
      }
      return { changed: changed, inspected: n, maxChan: maxChan,
               roi: roi || [0, 0, w, h],
               bbox: changed ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : null,
               canvas: [w, h] };
    },

    // Force the 2D fallback. Every consumer in js/game.js gates on
    // World3D.isEnabled(), so this is the seam the game itself reads -- not a
    // reimplementation of the choice.
    use2D: function (on) {
      if (!World3D._realEnabled) World3D._realEnabled = World3D.isEnabled;
      World3D.isEnabled = on ? function () { return false; }
                             : World3D._realEnabled;
      return { flat: !World3D.isEnabled() ? true : false,
               isEnabled: World3D.isEnabled() };
    },

    drop: function () { for (var k in frames) delete frames[k]; return "dropped"; },

    // ---- the scene ------------------------------------------------------

    // ONE enemy, kept for the life of the measurement. It is never respawned:
    // `laneSpread` gives each enemy a random lane offset at CONSTRUCTION, so a
    // rebuilt scene is a different scene wearing the same description, and a
    // walker respawned "identically" has photographed as a 133-pixel glow leak
    // that did not exist.
    place: function (typeId, progress) {
      enemies.length = 0;
      var e = new Enemy(path, 100000, typeId, { routeId: 0 });
      // PIN THE LANE. `laneOffsetUl` comes from Enemy.nextLaneIndex(), a
      // counter that advances on every construction -- including the throwaway
      // enemies a spot scan builds. So the "same" body lands on a different
      // line across the road on a different run, its silhouette lands on
      // different pixels, and the model-vs-no-model count drifts a few percent
      // between runs while every control inside a run is still exactly 0.
      // Measured: enemy-swarm 58 px one run, 55 px the next, from a 2.1 u.l.
      // lane shift and nothing else. Pinned, the number is a fingerprint
      // instead of a magnitude.
      e.laneOffsetUl = 0;
      e.progress = progress;
      e.refreshPos();
      enemies.push(e);
      TDProbe._e = e;
      TDProbe._home = { x: e.pos.x, y: e.pos.y, progress: progress };
      return { typeId: e.typeId, pos: [e.pos.x, e.pos.y], radius: e.radiusPx(),
               isFlying: !!e.isFlying, health: e.health,
               modelName: "enemy-" + e.typeId,
               modelRegistered: GLModels.has("enemy-" + e.typeId) };
    },

    // Hold the body where it is and move ONLY the animation frame.
    //
    // `walk = floor(progress / (radius*2.6) * frames)` -- the walk is DISTANCE
    // driven, not clock driven, so driving the clock leaves a walker frozen on
    // frame 0 and a frozen animation photographs exactly like a correct rest
    // pose. Stepping `progress` is therefore the real seam. But `progress` also
    // feeds pos (via refreshPos) and yaw (via path.tangentAt every draw), so
    // both are pinned here and BOTH pins are asserted by the caller:
    // `yawAt` below lets a run prove the tangent did not move.
    // The base is snapped to a whole multiple of `stride` NEAR where the body
    // was placed, so `walk` still advances one bucket per k while `progress`
    // stays inside the stretch of path whose tangent was measured straight.
    // Without the snap the cycle runs at progress 0..stride regardless of where
    // the body stands, and the yaw for every capture is read off a piece of
    // road the run never checked.
    frameAt: function (k) {
      var e = TDProbe._e;
      var stride = e.radiusPx() * 2.6;
      var n = TDProbe.frameCount();
      var base = Math.round(TDProbe._home.progress / stride) * stride;
      // Land in the middle of bucket k so float error cannot fall into k-1.
      e.progress = base + (k + 0.5) * stride / n;
      e.pos.x = TDProbe._home.x;
      e.pos.y = TDProbe._home.y;
      return { k: k, progress: e.progress, walk: TDProbe.walkIndex(),
               bucket: TDProbe.walkIndex() % n, yaw: TDProbe.yawAt(e.progress) };
    },

    // Set progress directly without touching pos. Used for the control that
    // proves the picture depends on progress ONLY through the frame index.
    progressTo: function (p) {
      var e = TDProbe._e;
      e.progress = p;
      e.pos.x = TDProbe._home.x;
      e.pos.y = TDProbe._home.y;
      return { progress: p, walk: TDProbe.walkIndex(), yaw: TDProbe.yawAt(p) };
    },

    // The exact expression gl-world.js uses, recomputed here so a run can print
    // which frame it believes it captured beside the pixels it captured.
    walkIndex: function () {
      var e = TDProbe._e;
      var n = TDProbe.frameCount();
      if (e.isFlying) {
        var st = worldRenderState();
        return Math.floor((st.now || 0) * 2.6 * n);
      }
      var stride = e.radiusPx() * 2.6;
      return Math.floor((e.progress || 0) / stride * n);
    },

    frameCount: function () {
      var e = TDProbe._e;
      var m = GLModels.get(World3D.renderer(), "enemy-" + e.typeId);
      return m && m.frames.length ? m.frames.length : 1;
    },

    // The board path is a global; read it there so a spot can be chosen before
    // any enemy exists.
    yawAt: function (p) {
      var pa = (TDProbe._e && TDProbe._e.path) || path;
      var h = pa && pa.tangentAt ? pa.tangentAt(p) : null;
      return h ? Math.atan2(h.y, h.x) : 0;
    },

    // ---- the seam under test --------------------------------------------

    // enemyModel() resolves through GLModels.has("enemy-" + typeId) and nothing
    // else. Patching `has` for ONE name is therefore the narrowest possible
    // difference between "the mesh draws" and "the procedural sphere draws":
    // the enemy object, its lane, its progress, its health and every other body
    // on the board are literally the same objects across the two captures.
    //
    // Assert it at the seam the renderer reads -- a comparison that never
    // changed the variable under test has produced a confident zero here
    // before.
    hideModel: function (name) {
      if (!GLModels._realHas) GLModels._realHas = GLModels.has;
      GLModels.has = function (n) {
        if (n === name) return false;
        return GLModels._realHas(n);
      };
      return { hidden: name, seamReads: GLModels.has(name) };
    },

    showModel: function () {
      if (GLModels._realHas) GLModels.has = GLModels._realHas;
      return { restored: true };
    },

    seam: function (name) { return GLModels.has(name); },

    // ---- geometry of the shot --------------------------------------------

    // Where the body lands on screen, so a zero can be checked against the
    // frustum instead of believed. Borrowed from the FX api -- the same
    // projector the beams and the circle use.
    screenOf: function (x, y, z) {
      if (!TDProbe._api) {
        if (typeof SiphonFXRitual === "undefined") return null;
        var real = SiphonFXRitual.draw;
        SiphonFXRitual.draw = function (ctx, state, api) {
          TDProbe._api = api; SiphonFXRitual.draw = real;
          return real.apply(this, arguments);
        };
        draw();
        if (!TDProbe._api) { SiphonFXRitual.draw = real; return null; }
      }
      var s = TDProbe._api.project(x, y, z || 0);
      return s ? { x: s.x, y: s.y, depth: s.depth } : null;
    },

    // ---- authored colour --------------------------------------------------

    // THE MODEL'S OWN PALETTE, AT PIXELS THE MODEL COVERS.
    //
    // A diff cannot tell "my mesh drew" from "something moved". This can: the
    // shader is `pow(vCol * (ambient + key + fill*fillColor) * depthLift, 1/2.2)`
    // with emission ADDED on top, so for a body drawn with uGlow = 0 the
    // rendered linear colour is EXACTLY a positive scalar times the authored
    // linear colour. Decode the pixel, then for each authored palette entry
    // solve the one free scalar in closed form and keep the residual. A hit is
    // a pixel whose colour lies along an authored palette ray -- brightness is
    // free, hue and saturation are not.
    //
    // Fed the authored sRGB palette read out of the model FILE, because
    // GLModels.expand() nulls model.raw once expanded and there is then no
    // authored value left in the page to compare against.
    // Remove the enemy entirely, so a silhouette can be defined against an
    // EMPTY board. Defining it as "pixels that differ between the mesh frame
    // and the sphere frame" mixes the two bodies together and scores the
    // sphere's own pixels as if the mesh had drawn them -- which is how the
    // first version of this test came back reporting the sphere as a BETTER
    // match to the mesh's palette than the mesh.
    depopulate: function () {
      TDProbe._stash = enemies.slice();
      enemies.length = 0;
      return { enemies: enemies.length };
    },
    repopulate: function () {
      enemies.length = 0;
      for (var i = 0; i < TDProbe._stash.length; i++) enemies.push(TDProbe._stash[i]);
      return { enemies: enemies.length };
    },

    // Pixels present in `key` and not in `empty`, ERODED by one pixel so the
    // antialiased rim -- which is a blend of the body and the board behind it,
    // and therefore lies on no authored ray at all -- is not scored as if it
    // were a material.
    silhouette: function (key, empty, erode) {
      var a = frames[key], b = frames[empty];
      if (!a || !b) throw new Error("missing frame");
      var c = glCanvas(), w = c.width, h = c.height;
      var on = new Uint8Array(w * h);
      var n = 0;
      for (var p = 0, q = 0; q < a.length; q += 4, p++) {
        if (a[q] !== b[q] || a[q + 1] !== b[q + 1] || a[q + 2] !== b[q + 2]) {
          on[p] = 1; n++;
        }
      }
      if (erode !== false) {
        var er = new Uint8Array(w * h), m = 0;
        for (var y = 1; y < h - 1; y++) {
          for (var x = 1; x < w - 1; x++) {
            var i = y * w + x;
            if (on[i] && on[i - 1] && on[i + 1] && on[i - w] && on[i + w]) { er[i] = 1; m++; }
          }
        }
        frames["mask:" + key] = er;
        return { raw: n, interior: m };
      }
      frames["mask:" + key] = on;
      return { raw: n, interior: n };
    },

    paletteMatch: function (key, mask, palette, maxResidual) {
      var buf = frames[key], ref = frames[mask];
      if (!buf || !ref) throw new Error("missing frame");
      var c = glCanvas(), w = c.width;
      // sRGB -> linear, the exact curve gl-models.js applies to the palette.
      function toLinear(v) {
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      }
      var pal = [];
      for (var i = 0; i < palette.length; i++) {
        var e = palette[i];
        var lc = [toLinear(e[0]), toLinear(e[1]), toLinear(e[2])];
        var nn = lc[0] * lc[0] + lc[1] * lc[1] + lc[2] * lc[2];
        pal.push({ c: lc, nn: nn, emissive: e.length > 3 ? e[3] : 0, hits: 0 });
      }
      var covered = 0, matched = 0, worst = 0, sumRes = 0;
      var thresh = maxResidual === undefined ? 0.06 : maxResidual;
      for (var p = 0, q = 0; q < buf.length; q += 4, p++) {
        // The model's footprint: pixels that differ between the with-model and
        // the without-model frame. Not a guessed box.
        if (buf[q] === ref[q] && buf[q + 1] === ref[q + 1] && buf[q + 2] === ref[q + 2]) continue;
        covered++;
        // The shader's own encode is pow(lit, 1/2.2); this is its inverse.
        var pr = Math.pow(buf[q] / 255, 2.2);
        var pg = Math.pow(buf[q + 1] / 255, 2.2);
        var pb = Math.pow(buf[q + 2] / 255, 2.2);
        var pn = Math.sqrt(pr * pr + pg * pg + pb * pb);
        if (pn < 1e-6) continue;
        var best = 1e9, bestI = -1;
        for (var j = 0; j < pal.length; j++) {
          var e2 = pal[j];
          if (e2.nn < 1e-9) continue;
          var k = (pr * e2.c[0] + pg * e2.c[1] + pb * e2.c[2]) / e2.nn;
          if (k <= 0) continue;
          var dr = pr - k * e2.c[0], dg = pg - k * e2.c[1], db = pb - k * e2.c[2];
          var res = Math.sqrt(dr * dr + dg * dg + db * db) / pn;
          if (res < best) { best = res; bestI = j; }
        }
        if (bestI >= 0 && best <= thresh) { matched++; pal[bestI].hits++; }
        if (best < 1e8) { sumRes += best; if (best > worst) worst = best; }
      }
      return { covered: covered, matched: matched,
               fraction: covered ? +(matched / covered).toFixed(4) : 0,
               meanResidual: covered ? +(sumRes / covered).toFixed(4) : 0,
               worstResidual: +worst.toFixed(4),
               perEntry: pal.map(function (e3, ix) {
                 return { i: ix, hits: e3.hits, emissive: e3.emissive };
               }),
               threshold: thresh };
    },

    // Score a frame's pixels against an authored palette over a MASK built by
    // silhouette(). Reports the per-entry histogram, which is the part that
    // discriminates: the procedural fallback sphere is one authored colour and
    // its 0.45x cap, so it can only ever occupy ONE ray in linear space, while
    // a mesh occupies as many rays as its palette has distinct hues. An
    // aggregate "fraction matched" cannot tell those apart -- and for
    // enemy-normal it comes out HIGHER for the sphere, because the type's 2D
    // colour {222,79,84} is bit-for-bit palette entry 3.
    paletteOnMask: function (key, maskKey, palette, maxResidual) {
      var buf = frames[key], on = frames["mask:" + maskKey];
      if (!buf || !on) throw new Error("missing frame/mask");
      function toLinear(v) {
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      }
      var pal = [], seen = [];
      for (var i = 0; i < palette.length; i++) {
        var e = palette[i];
        var lc = [toLinear(e[0]), toLinear(e[1]), toLinear(e[2])];
        // Entries that share an rgb and differ only in emission are ONE ray.
        var rayKey = e[0] + "/" + e[1] + "/" + e[2];
        var ray = seen.indexOf(rayKey);
        if (ray < 0) { seen.push(rayKey); ray = seen.length - 1; }
        pal.push({ c: lc, nn: lc[0] * lc[0] + lc[1] * lc[1] + lc[2] * lc[2],
                   emissive: e.length > 3 ? e[3] : 0, ray: ray, hits: 0, rgb: rayKey });
      }
      var rayHits = [];
      for (var z = 0; z < seen.length; z++) rayHits.push(0);
      var covered = 0, matched = 0, sumRes = 0, worst = 0;
      var thresh = maxResidual === undefined ? 0.06 : maxResidual;
      for (var p = 0; p < on.length; p++) {
        if (!on[p]) continue;
        covered++;
        var q = p * 4;
        var pr = Math.pow(buf[q] / 255, 2.2);
        var pg = Math.pow(buf[q + 1] / 255, 2.2);
        var pb = Math.pow(buf[q + 2] / 255, 2.2);
        var pn = Math.sqrt(pr * pr + pg * pg + pb * pb);
        if (pn < 1e-6) continue;
        var best = 1e9, bestI = -1;
        for (var jx = 0; jx < pal.length; jx++) {
          var e2 = pal[jx];
          if (e2.nn < 1e-9) continue;
          var k = (pr * e2.c[0] + pg * e2.c[1] + pb * e2.c[2]) / e2.nn;
          if (k <= 0) continue;
          var dr = pr - k * e2.c[0], dg = pg - k * e2.c[1], db = pb - k * e2.c[2];
          var res = Math.sqrt(dr * dr + dg * dg + db * db) / pn;
          if (res < best) { best = res; bestI = jx; }
        }
        sumRes += best; if (best > worst) worst = best;
        if (bestI >= 0 && best <= thresh) {
          matched++; pal[bestI].hits++; rayHits[pal[bestI].ray]++;
        }
      }
      return { covered: covered, matched: matched,
               fraction: covered ? +(matched / covered).toFixed(4) : 0,
               meanResidual: covered ? +(sumRes / covered).toFixed(4) : 0,
               worstResidual: +worst.toFixed(4), threshold: thresh,
               rays: seen.map(function (rgb, ix) {
                 return { rgb: rgb, hits: rayHits[ix] };
               }),
               raysOccupied: rayHits.filter(function (v) { return v > 0; }).length };
    },

    // Pin the flier's glow so the emissive ADD cannot break the scalar model
    // the palette test relies on, and so a lantern cycle cannot masquerade as a
    // wingbeat.
    pinGlow: function (on) {
      var r = World3D.renderer();
      if (on) {
        if (!r._realSetGlow) r._realSetGlow = r.setGlow;
        r.setGlow = function () { return r._realSetGlow.call(r, 0, null); };
      } else if (r._realSetGlow) {
        r.setGlow = r._realSetGlow;
      }
      return { glowPinned: !!on };
    },

    // Pin the flier's vertical bob. flightLift reads Enemy.FLIGHT_LIFT_RADII on
    // every call, so writing the cancelling value there removes the bob exactly
    // without touching gl-world.
    pinBob: function (on) {
      if (on) {
        var st = worldRenderState();
        Enemy.FLIGHT_LIFT_RADII = 3.45 - 0.16 * Math.sin((st.now || 0) * 0.75 * Math.PI * 2);
      } else {
        Enemy.FLIGHT_LIFT_RADII = 3.45;
      }
      return { flightLiftRadii: Enemy.FLIGHT_LIFT_RADII };
    },

    // Put the WHOLE scene on the blended path. `begin()` resets fade to 1 every
    // frame, so the only honest way to hold it is to re-apply it immediately
    // after the real begin. setFade enables BLEND with depthMask(false), and
    // its own comment says a faded object's triangles then composite in BUFFER
    // ORDER -- which is the one place a re-export's triangle reordering could
    // become visible. Today its only caller is the flier wreck fade.
    forceFade: function (a) {
      var r = World3D.renderer();
      if (!r._realBegin) r._realBegin = r.begin;
      if (a === null || a === undefined || a >= 1) {
        r.begin = r._realBegin;
        return { fade: 1 };
      }
      r.begin = function () {
        var out = r._realBegin.apply(r, arguments);
        r.setFade(a);
        return out;
      };
      return { fade: a };
    },

    // Re-register a model under its own name from an exporter payload. register()
    // replaces the entry wholesale with expanded/gpu nulled, so the next mesh()
    // rebuilds from the new bytes -- no reload, and the enemy object, its lane,
    // its progress and the camera all stay exactly as they were.
    reregister: function (src) {
      var before = GLModels.names().length;
      (new Function("GLModels", src))(GLModels);
      return { models: GLModels.names().length, wasModels: before };
    },

    setClock: function (t) {
      if (typeof lastTime === "number") lastTime = t * 1000;
      return worldRenderState().now;
    },

    counts: function () {
      var r = World3D.renderer();
      return { enemies: enemies.length, towers: towers.length,
               drawCalls: r.drawCalls, triangles: r.triangles };
    },

    // A body at NaN submits every draw call and shades nothing; a draw-call
    // count is not evidence that anything was drawn.
    finite: function () {
      var e = TDProbe._e;
      return { x: isFinite(e.pos.x), y: isFinite(e.pos.y),
               progress: isFinite(e.progress), pos: [e.pos.x, e.pos.y] };
    }
  };

  window.TDProbe = TDProbe;
  return "TDProbe installed";
})();
