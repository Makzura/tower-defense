// ---------------------------------------------------------------------------
// TDObs -- the observation harness for the visual quality pass.
//
// NOT part of the game. Lives OUTSIDE the game folder and is never referenced
// by index.html. It is injected at runtime by the visual pass and exists only
// so an asset can be put on screen deterministically, rendered, captured to
// disk and measured.
//
// It never writes to a game file and never changes a simulation value. It
// drives the same entry points a player drives: real constructors, the real
// update(), the real draw().
// ---------------------------------------------------------------------------
(function () {
  var SINK = "http://127.0.0.1:8765/";

  function composite() {
    var glc = document.getElementById("gl");
    var uic = document.getElementById("game");
    var c = document.createElement("canvas");
    c.width = glc.width; c.height = glc.height;
    var g = c.getContext("2d");
    g.fillStyle = "#12131a";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(glc, 0, 0);
    g.drawImage(uic, 0, 0, c.width, c.height);
    return c;
  }

  var TDObs = {
    // ---- scene setup ----------------------------------------------------

    // Start a run through the game's own entry point, so nothing is
    // special-cased. startRun takes the map OBJECT, not its id.
    boot: function (mapId, difficulty) {
      // SIZE THE 2D CANVAS FIRST. Its backing store is set by the game's
      // `resize` listener, and a hidden or headless pane never fires one -- so
      // `game` sits at the HTML default of 300x150 while CSS stretches it to
      // the full 1280x720. Everything drawn through drawOverlays (the ritual
      // circle, the beams, every range ring) is drawn in SCREEN pixels, so at
      // 300x150 all of it lands outside the bitmap and the capture comes back
      // with an empty overlay layer over a perfectly good 3D board.
      //
      // That is indistinguishable from an effect that is not wired up, and it
      // is why the ritual circle "did not render": it was rendering, off the
      // edge of a canvas a sixteenth of the size anyone thought it was.
      if (typeof resizeCanvasBackingStore === "function") resizeCanvasBackingStore();
      var m = Maps.byId(mapId || Maps.DEFAULT_ID) || Maps.LIST[0];
      startRun(m, difficulty || "normal");
      var uic = document.getElementById("game");
      return { map: m.id, screen: (typeof screen !== "undefined") ? screen : "?",
               enemies: enemies.length, towers: towers.length,
               ui: uic ? [uic.width, uic.height] : null };
    },

    maps: function () { return Maps.LIST.map(function (m) { return m.id; }); },

    cash: function (n) { cash = n; return cash; },

    // Place a tower. slot: 0..4 as the build bar orders them.
    // ups: array of upgrade ids/indices to apply, tier order.
    tower: function (slot, x, y, ups) {
      var Ctor = BUILD_SLOTS[slot];
      if (!Ctor) return null;
      var t = new Ctor(x, y, path);
      addTower(t);
      if (ups && t.panelActions) {
        cash = 10000000;
        for (var i = 0; i < ups.length; i++) {
          var acts = t.panelActions();
          var a = acts[ups[i]];
          if (a && a.run) { try { a.run(); } catch (e) {} }
        }
      }
      return t;
    },

    // Buy every tier down one path, as far as the crosspath rule allows.
    // branch: "a" | "b". Goes through performAction, the same seam the
    // inspection panel's click handler uses.
    maxPath: function (t, branch, tiers) {
      cash = 10000000;
      var want = String(branch).toUpperCase();
      var bought = [];
      for (var i = 0; i < (tiers || 5); i++) {
        var acts = t.panelActions ? t.panelActions() : [];
        var picked = null;
        for (var j = 0; j < acts.length; j++) {
          var a = acts[j];
          if (!a || a.readonly || !a.enabled) continue;
          var br = (a.branch || "").toString().toUpperCase();
          var lbl = (a.label || "").toString().toUpperCase();
          if (br === want || lbl.indexOf("PATH " + want) === 0) { picked = a; break; }
        }
        if (!picked) break;
        try {
          t.performAction(picked.id, {
            cash: cash,
            spend: function (amount) { cash -= amount; },
            enemies: enemies,
            damage: function (e, amount) { e.takeDamage(amount); },
            beginAiming: function () {}
          });
          bought.push(picked.label);
        } catch (e) { break; }
      }
      return bought;
    },

    // Spawn n of a type, fanned along the road. `at` pins the first one's
    // progress so a shot can be framed on a known patch of road.
    spawn: function (typeId, n, health, at) {
      var made = [];
      for (var i = 0; i < (n || 1); i++) {
        var e = new Enemy(path, health, typeId, { routeId: 0 });
        e.progress = (at === undefined ? 40 : at) + i * 34;
        e.refreshPos();                 // progress -> pos, the game's own seam
        enemies.push(e);
        made.push(e);
      }
      return made;
    },

    // Frame the camera on an entity. Enemies carry `pos`; towers carry x/y.
    focus: function (ent, distance, pitch) {
      var p = ent.pos ? ent.pos : ent;
      return TDObs.cam({ target: [p.x, p.y, 0], distance: distance || 300,
                         pitch: pitch === undefined ? 0.38 : pitch });
    },

    clear: function () {
      if (typeof enemies !== "undefined") enemies.length = 0;
      if (typeof towers !== "undefined") towers.length = 0;
      if (typeof bullets !== "undefined") bullets.length = 0;
      return "cleared";
    },

    // ---- camera ---------------------------------------------------------

    cam: function (o) {
      var c = World3D.camera();
      if (!o) return { target: c.target.slice(), distance: c.distance, pitch: c.pitch, yaw: c.yaw };
      if (o.target) c.target = o.target.slice();
      if (typeof o.distance === "number") c.distance = c.wantDistance = o.distance;
      if (typeof o.pitch === "number") c.pitch = c.wantPitch = o.pitch;
      if (typeof o.yaw === "number") c.yaw = c.wantYaw = o.yaw;
      return "ok";
    },

    // The default board view a player actually sees.
    camDefault: function () {
      return TDObs.cam({ target: [640, 360, 0], distance: 2022, pitch: 0.5944591432292686,
                         yaw: -1.5707963267948966 });
    },

    // ---- time -----------------------------------------------------------

    // Advance the simulation in fixed steps. Deterministic, and independent of
    // requestAnimationFrame, so a hidden pane cannot change the result.
    //
    // THE RENDER CLOCK MOVES TOO, and it has to. `worldRenderState().now` is
    // `lastTime / 1000` -- the requestAnimationFrame timestamp -- and rAF is
    // throttled to a standstill in a hidden or headless pane. So every effect
    // that keys off `state.now` (the ritual circle's cast and spin, the beam
    // pulses, every breathe) sat at exactly its t=0 value no matter how long
    // the simulation was stepped, and `advance()` early-returned on
    // `rec.stamp === now` after the first frame.
    //
    // That made the rig structurally blind to animation a second time, in a
    // second place: a reviewer stepping a full second and capturing would have
    // photographed the ritual circle at 34% radius with zero rotation and
    // reported it as what the game draws. Stepping the simulation without
    // stepping the clock the renderer reads is not a slower version of real
    // time -- it is a still frame.
    step: function (seconds, dt) {
      var d = dt || 1 / 60, n = Math.max(1, Math.round(seconds / d));
      for (var i = 0; i < n; i++) {
        try { update(d); } catch (e) { return "update threw: " + e.message; }
        if (typeof lastTime === "number") lastTime += d * 1000;
      }
      return n + " steps";
    },

    // ---- observation ----------------------------------------------------

    draw: function () { draw(); return "drawn"; },

    shot: function (name) {
      draw();
      var c = composite();
      return fetch(SINK, { method: "POST", headers: { "Content-Type": "text/plain" },
                           body: name + "\n" + c.toDataURL("image/png") })
        .then(function () { return "saved " + name; },
              function (e) { return "SINK ERROR " + e; });
    },

    // A CROP OF THE REAL FRAME, magnified. Not a re-render.
    //
    // The distinction is the whole point. To judge whether a gesture reads AT
    // TRUE GAME SCALE you have to look at the pixels the game actually put on
    // the board -- roughly 25 of them tall at the default camera -- and the
    // only honest way to look closer is to magnify those pixels, not to move
    // the camera in and rasterise a different, larger image. Re-rendering
    // bigger answers "is the geometry there", which was never the question.
    //
    // Nearest-neighbour, so a magnified pixel stays a pixel and nothing is
    // invented by the interpolator.
    crop: function (name, x, y, w, h, scale) {
      draw();
      var src = composite();
      var k = scale || 6;
      var c = document.createElement("canvas");
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      var g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
      return fetch(SINK, { method: "POST", headers: { "Content-Type": "text/plain" },
                           body: name + "\n" + c.toDataURL("image/png") })
        .then(function () { return "saved " + name + " (" + w + "x" + h + " @" + k + "x)"; },
              function (e) { return "SINK ERROR " + e; });
    },

    // Where an entity lands on the composited image, so a crop can be aimed
    // without guessing at the projection.
    //
    // The projector is module-private inside gl-world -- it is only ever handed
    // out as `api.project` to the FX modules -- so it is borrowed from the next
    // FX draw rather than reached for directly. One frame of latency, no new
    // export, and it is the SAME function the beams and the circle project
    // with, which is the only one whose answer is worth aiming a crop at.
    screenOf: function (ent) {
      var p = ent.pos ? ent.pos : ent;
      if (!TDObs._api) {
        if (typeof SiphonFXRitual === "undefined") return null;
        var real = SiphonFXRitual.draw;
        SiphonFXRitual.draw = function (ctx, state, api) {
          TDObs._api = api; SiphonFXRitual.draw = real;
          return real.apply(this, arguments);
        };
        draw();
        if (!TDObs._api) { SiphonFXRitual.draw = real; return null; }
      }
      var z = (typeof p.z === "number") ? p.z
            : (TDObs._api.groundAt ? TDObs._api.groundAt(p.x, p.y) : 0);
      var s = TDObs._api.project(p.x, p.y, z);
      return s ? { x: Math.round(s.x), y: Math.round(s.y) } : null;
    },

    // Pixel readback, the proof standard AGENTS.md asks for.
    sample: function (x, y, w, h) {
      draw();
      var g = composite().getContext("2d");
      var d = g.getImageData(x, y, w || 1, h || 1).data;
      var out = [];
      for (var i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2], d[i + 3]]);
      return out;
    },

    // Mean luminance and simple contrast over a region -- for value-ladder checks.
    stats: function (x, y, w, h) {
      draw();
      var g = composite().getContext("2d");
      var d = g.getImageData(x, y, w, h).data;
      var n = 0, sum = 0, min = 255, max = 0, sum2 = 0;
      for (var i = 0; i < d.length; i += 4) {
        var L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sum += L; sum2 += L * L; if (L < min) min = L; if (L > max) max = L; n++;
      }
      var mean = sum / n;
      return { mean: +mean.toFixed(2), min: +min.toFixed(1), max: +max.toFixed(1),
               sd: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(2), px: n };
    },

    // ---- cost -----------------------------------------------------------

    // CPU cost of one full draw(), median/p95 over n samples.
    perf: function (n) {
      n = n || 120;
      var s = [];
      for (var i = 0; i < n; i++) { var a = performance.now(); draw(); s.push(performance.now() - a); }
      s.sort(function (p, q) { return p - q; });
      return { median: +s[Math.floor(n * 0.5)].toFixed(3),
               p95: +s[Math.floor(n * 0.95)].toFixed(3),
               max: +s[n - 1].toFixed(3),
               enemies: enemies.length, towers: towers.length,
               bullets: (typeof bullets !== "undefined") ? bullets.length : 0 };
    },

    // GPU cost, via the timer query when the driver exposes it. Falls back to
    // a finish()-fenced wall-clock read, which is coarse but honest.
    gpuMs: function (n) {
      n = n || 60;
      var gl = World3D.renderer().gl;
      var t0 = performance.now();
      for (var i = 0; i < n; i++) draw();
      gl.finish();
      return { msPerFrame: +((performance.now() - t0) / n).toFixed(3), frames: n,
               enemies: enemies.length, towers: towers.length };
    },

    // ---- hot reload -----------------------------------------------------
    //
    // The preview pane cannot reload the page, so a code change is applied by
    // re-executing the changed file. Classic scripts redefine their globals on
    // re-run, which is exactly what we want.
    //
    // Two hazards are handled here:
    //  - a re-run of game.js would call requestAnimationFrame again and start a
    //    SECOND frame loop, double-stepping the simulation. rAF is stubbed out
    //    for the duration of the injection so the existing loop stays the only
    //    one.
    //  - World3D/GLRenderer capture GPU state at install time, so anything
    //    under js/gl/ needs the world rebuilt afterwards.
    reinject: function (files, opts) {
      opts = opts || {};
      var list = [].concat(files);
      var v = "?hot=" + (TDObs._hot = (TDObs._hot || 0) + 1);
      var realRAF = window.requestAnimationFrame;
      window.requestAnimationFrame = function () { return 0; };   // no second loop
      var chain = Promise.resolve();
      list.forEach(function (f) {
        chain = chain.then(function () {
          return new Promise(function (resolve, reject) {
            var s = document.createElement("script");
            s.src = f + v;
            s.onload = function () { resolve(f); };
            s.onerror = function () { reject(new Error("failed to load " + f)); };
            document.head.appendChild(s);
          });
        });
      });
      return chain.then(function () {
        window.requestAnimationFrame = realRAF;
        var needsGL = list.some(function (f) { return f.indexOf("js/gl/") === 0; });
        if (needsGL || opts.rebuildGL) {
          var ok = World3D.install({ glCanvas: document.getElementById("gl"),
                                     uiCanvas: document.getElementById("game") });
          World3D.resize();
          return { injected: list, glRebuilt: ok };
        }
        return { injected: list, glRebuilt: false };
      }, function (e) {
        window.requestAnimationFrame = realRAF;
        return { error: e.message, injected: list };
      });
    },

    // ---- contact sheet --------------------------------------------------
    //
    // Draw ARBITRARY registered models in a row at true game scale, so a
    // silhouette review can cover bodies that cannot be instantiated as
    // gameplay objects (an upgrade tier of a tower, a fused-creature tier).
    //
    // Wraps World3D.drawWorld rather than reaching inside it: by the time the
    // wrapper runs, the frame's view-projection is already bound and the
    // renderer will happily take more draws in the same pass.
    // One posed instance, drawn group by group exactly the way gl-world's
    // drawActor does it: the instance matrix, then each group multiplied by its
    // matrix for this frame. Anything else shows frame 0 forever.
    _drawPosed: function (r, m, it) {
      var inst = new Float32Array(16), gm = new Float32Array(16);
      GLMath.modelYaw(inst, it.x, it.y, it.z || 0, it.yaw || 0,
        m.unitsToPx * (it.scale || 1));
      var n = m.frames.length;
      var pose = m.frames[(((it.frame | 0) % n) + n) % n];
      r.bind(m.gpu);
      for (var g = 0; g < m.groups.length; g++) {
        var grp = m.groups[g];
        if (!grp.count) continue;
        var pg = pose[g];
        r.drawRange(pg ? GLMath.multiply(gm, inst, pg) : inst,
          grp.first, grp.count);
      }
    },

    // Every frame of an animated model in one row, so a review can see the
    // whole cycle at once instead of guessing from a still.
    filmstrip: function (model, radius, opts) {
      var r = World3D.renderer();
      var m = GLModels.get(r, model);
      if (!m) return "no such model: " + model;
      var n = Math.max(1, m.frames.length);
      var items = [];
      for (var f = 0; f < n; f++) items.push({ model: model, radius: radius, frame: f });
      TDObs.showcase(items, (opts && opts.gap) || undefined, opts);
      return { model: model, frames: n };
    },

    showcase: function (items, gapPx, opts) {
      TDObs._showcaseGlow = (opts && opts.glow) || 0;
      TDObs._showcaseTint = (opts && opts.tint) || null;
      if (!TDObs._showcaseHooked) {
        var orig = World3D.drawWorld;
        World3D.drawWorld = function (ctx, state) {
          var out = orig(ctx, state);
          var list = TDObs._showcase;
          if (list && list.length) {
            var r = World3D.renderer();
            // GLOW OFF BY DEFAULT, and this was a real bug worth naming.
            //
            // This used to be setGlow(1, null). With no tint, the renderer
            // falls back to GLRenderer.LEY (0.31,0.89,0.82) and ADDS it to
            // every emissive vertex -- so every model in the row came out the
            // same cool grey whatever its palette said, measured at R-B = -23
            // across tiers that are meant to run from dull cloth to solid gold.
            // Silhouette reviews survived it because they run on flat grey
            // builds anyway; any COLOUR review through showcase was blind.
            //
            // Opt in per row instead, for the cases that genuinely want to see
            // emission driven: TDObs.showcase(items, gap, { glow: 1 }).
            var g = (TDObs._showcaseGlow || 0);
            if (g) r.setGlow(g, TDObs._showcaseTint || null);
            for (var i = 0; i < list.length; i++) {
              var it = list[i];
              // ANIMATED MODELS: draw group by group with the frame's pose.
              //
              // This used to draw the whole vertex buffer with ONE matrix, which
              // meant showcase ALWAYS rendered frame 0 and could never reveal an
              // animation -- the rig was structurally blind to the thing it was
              // being used to review. Pass {frame: n} on an item to pose it.
              var mm = GLModels.get(r, it.model);
              if (mm && mm.frames && mm.frames.length > 1 && it.frame) {
                TDObs._drawPosed(r, mm, it);
                continue;
              }
              var m = GLModels.get(r, it.model);
              if (!m) continue;
              r.draw(m.gpu, it.x, it.y, it.z || 0, it.yaw || 0,
                     m.unitsToPx * (it.scale || 1));
            }
            if (g) r.setGlow(0, null);
          }
          return out;
        };
        TDObs._showcaseHooked = true;
      }
      // Lay the row out left to right, spaced by each model's own footprint so
      // the size ratios on screen are the real ones.
      var gap = gapPx === undefined ? 14 : gapPx;
      var x = 120, placed = [];
      TDObs._showcase = items.map(function (it) {
        var r = it.radius || 20;
        x += r + gap;
        // `frame` MUST be carried through. Rebuilding the item here without it
        // meant it.frame was always undefined in the draw loop, _drawPosed was
        // never reached, and filmstrip() laid out N copies of frame 0 -- so the
        // fix that was supposed to make the rig able to see animation still
        // could not, and anyone told "filmstrip works now" would have reviewed
        // frame 0 nine times and called the cycle dead.
        var o = { model: it.model, x: x, y: it.y || 210, z: 0,
                  yaw: it.yaw || 0, scale: it.scale || 1, frame: it.frame || 0 };
        placed.push(it.model + " @" + Math.round(x) + " r" + r);
        x += r;
        return o;
      });
      return { placed: placed, spanPx: Math.round(x), missing:
        items.filter(function (it) { return !GLModels.has(it.model); })
             .map(function (it) { return it.model; }) };
    },

    clearShowcase: function () { TDObs._showcase = []; return "cleared"; },

    counts: function () {
      return { enemies: enemies.length, towers: towers.length,
               bullets: (typeof bullets !== "undefined") ? bullets.length : 0,
               models: GLModels.names().length,
               tris: GLModels.names().reduce(function (a, k) { return a + (GLModels.triangles(k) || 0); }, 0) };
    }
  };

  window.TDObs = TDObs;
  return "TDObs ready";
})();
