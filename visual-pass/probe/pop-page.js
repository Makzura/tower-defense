// ---------------------------------------------------------------------------
// TDPop -- the in-page half of the POPULATION rig.
//
// The question: what does the real frame cost at 100 / 200 / 300 / 400 / 500+
// bodies, at 1x and at 3x, and which COMPONENT is the wall.
//
// NOT part of the game. Injected at runtime, never referenced by index.html,
// never writes a game file. It drives the game's own `frame(now)` -- the real
// accumulator, the real update(), the real draw(), the real World3D pass and
// the real 2D overlay pass. A synthetic scene that calls drawWorld directly
// would skip `World3D.drawOverlays`, which is the component most likely to
// decide the answer and the one the GL counters cannot see.
//
// THREE THINGS THIS FILE EXISTS TO NOT GET WRONG:
//
// 1. A DRAW CALL IS NOT EVIDENCE ANYTHING WAS DRAWN. A body at NaN submits
//    every call and shades nothing. `covered()` diffs the GL framebuffer
//    against an EMPTY-board baseline, so the proof that N bodies are on screen
//    is N-scaling covered pixels, not a counter.
// 2. A HEALTH BAR ONLY DRAWS ON A HURT BODY. `bar()` in gl-world.js returns
//    early unless `now < max`. A board of full-health enemies draws ZERO bars
//    and under-reports the overlay by its largest per-body term. `build()`
//    therefore damages every body by default, and `damaged:false` is kept as
//    the control that isolates exactly that cost.
// 3. THE CAMERA IS FITTED ON FIRST DRAW, NOT AT INSTALL. Read it before
//    anything draws and you get OrbitCamera's constructor defaults (distance
//    900, target [0,0,0]) instead of the board's ~2021 / [640,360,0], and
//    every magnitude is 2.25x wrong. setup() draws once and THROWS on that
//    value, because it is indistinguishable from a real reading otherwise.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  var TDPop = {
    _acc: null,
    _wrapped: false,
    _baseline: null,
    _api: null
  };

  function glCanvas() { return document.getElementById("gl"); }
  function uiCanvas() { return document.getElementById("game"); }
  function glCtx() { return World3D.renderer().gl; }

  function readGL() {
    var gl = glCtx(), c = glCanvas();
    var buf = new Uint8Array(c.width * c.height * 4);
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  }

  function diffCount(a, b, tol) {
    var t = tol || 0, n = 0;
    var w = glCanvas().width;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (var i = 0, p = 0; i < a.length; i += 4, p++) {
      var d0 = Math.abs(a[i] - b[i]);
      var d1 = Math.abs(a[i + 1] - b[i + 1]);
      var d2 = Math.abs(a[i + 2] - b[i + 2]);
      var d = d0 > d1 ? d0 : d1; if (d2 > d) d = d2;
      if (d > t) {
        n++;
        var x = p % w, y = (p / w) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return { changed: n, bboxGL: n ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : null };
  }

  // ---- 1. setup -----------------------------------------------------------

  TDPop.setup = function (mapId) {
    if (typeof resizeCanvasBackingStore === "function") resizeCanvasBackingStore();
    var m = Maps.byId(mapId || Maps.DEFAULT_ID) || Maps.LIST[0];
    startRun(m, "normal");
    World3D.resize();

    // Kill the game's own loop. Everything below drives frame(now) by hand on
    // a synthetic monotonic clock, which keeps the REAL accumulator and the
    // REAL fixed-step loop and is strictly more controllable than rAF -- which
    // in a headless/hidden page may not tick at all.
    var rafTicks = 0;
    window.requestAnimationFrame = function () { rafTicks++; return 0; };

    if (typeof WAVES !== "undefined") waveIndex = WAVES.length;
    gameOver = false;
    victory = false;
    paused = false;
    baseHp = 1e9;
    enemies.length = 0;
    towers.length = 0;
    if (typeof bullets !== "undefined") bullets.length = 0;

    draw();                                     // this is what fits the camera
    var cam = World3D.camera();
    if (Math.abs(cam.distance - 900) < 1e-6 &&
        Math.abs(cam.target[0]) < 1e-6 && Math.abs(cam.target[1]) < 1e-6) {
      throw new Error("camera is OrbitCamera's constructor default (900/[0,0,0]) " +
        "-- nothing has drawn, every magnitude would be 2.25x wrong");
    }

    var gl = glCtx();
    var dbg = gl.getExtension("WEBGL_debug_renderer_info");
    var c = glCanvas(), u = uiCanvas();
    return {
      map: m.id,
      gl: [c.width, c.height],
      ui: [u.width, u.height],
      camera: { distance: cam.distance, target: cam.target.slice(),
                pitch: cam.pitch, yaw: cam.yaw },
      rafTicks: rafTicks,
      webglRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "(no debug ext)",
      webglVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : "(no debug ext)",
      webglVersion: gl.getParameter(gl.VERSION),
      pathLength: paths[0].length,
      pathCount: paths.length,
      clockResolutionMs: TDPop.clockResolution()
    };
  };

  // The smallest non-zero gap performance.now() will report. Without
  // cross-origin isolation Chrome quantises it, and any component under that
  // quantum reads as a median of exactly 0 -- which looks like a free pass.
  TDPop.clockResolution = function () {
    var best = Infinity;
    for (var i = 0; i < 200000; i++) {
      var a = performance.now(), b = performance.now();
      if (b > a && b - a < best) best = b - a;
    }
    return best === Infinity ? null : best;
  };

  // ---- 2. instrumentation -------------------------------------------------
  //
  // `frame` reads `update` as a free variable, so it resolves through the
  // global object every call and replacing window.update replaces what the
  // real loop runs. Same for World3D's two exported passes, which game.js
  // calls by property lookup inside draw().

  TDPop.instrument = function () {
    if (TDPop._wrapped) return "already instrumented";
    var acc = TDPop._acc = { update: 0, steps: 0, gl: 0, ov: 0, dc: 0, tri: 0 };

    var realUpdate = window.update;
    window.update = function (dt) {
      var t0 = performance.now();
      realUpdate(dt);
      acc.update += performance.now() - t0;
      acc.steps++;
    };

    var realDrawWorld = World3D.drawWorld;
    World3D.drawWorld = function (ctx, state) {
      var t0 = performance.now();
      var r = realDrawWorld(ctx, state);
      acc.gl += performance.now() - t0;
      var rr = World3D.renderer();
      acc.dc = rr.drawCalls; acc.tri = rr.triangles;
      return r;
    };

    var realDrawOverlays = World3D.drawOverlays;
    World3D.drawOverlays = function (ctx, state) {
      var t0 = performance.now();
      var r = realDrawOverlays(ctx, state);
      acc.ov += performance.now() - t0;
      return r;
    };

    TDPop._wrapped = true;
    return "instrumented";
  };

  // ---- 3. building a board ------------------------------------------------

  // TYPES WITH AN AUTHORED MESH vs TYPES THAT FALL BACK TO THE PROCEDURAL
  // SPHERE. The sphere is ~168 triangles and one draw call; a mesh is one call
  // per non-empty group. "400 enemies" is not one board and this is the split
  // that makes it two.
  TDPop.roster = function () {
    var out = [];
    for (var k in Enemy.TYPES) {
      if (!Object.prototype.hasOwnProperty.call(Enemy.TYPES, k)) continue;
      var t = Enemy.TYPES[k];
      out.push({
        id: t.id || k,
        meshed: GLModels.has("enemy-" + (t.id || k)),
        boss: !!t.boss,
        speedMultiplier: t.speedMultiplier,
        isFlying: !!t.flying || !!t.isFlying
      });
    }
    return out;
  };

  // spec: { n, mix:[typeId,...], damaged, spread }
  //
  // Bodies are distributed over the REAL path length. The game's own spawner
  // fans them a fixed distance apart, so past ~56 every extra body walks
  // straight off the end and a density sweep flatlines while looking healthy.
  TDPop.build = function (spec) {
    var n = spec.n | 0;
    var mix = spec.mix && spec.mix.length ? spec.mix : ["normal"];
    var damaged = spec.damaged !== false;
    var p = paths[0];
    var L = p.length;
    enemies.length = 0;
    if (typeof bullets !== "undefined") bullets.length = 0;
    var made = {}, i;
    for (i = 0; i < n; i++) {
      var typeId = mix[i % mix.length];
      var e = new Enemy(p, 1000, typeId, { routeId: p.id });
      // Deterministic lane so two launches agree. Enemy.nextLaneIndex() is a
      // global counter that advances on every construction anywhere, so the
      // "same" board is a different board on the next run without this.
      e.laneOffsetUl = ((i % 7) - 3) * (spec.spread === undefined ? 0.9 : spec.spread);
      // Leave a margin at the far end so a run of a few seconds at 3x does not
      // walk bodies off the board and quietly change N mid-measurement.
      e.progress = (i + 0.5) * (L / n) * 0.90;
      e.refreshPos();
      if (damaged) {
        e.health = Math.max(1, Math.floor(e.maxHealth * 0.6));
        if (e.shieldMax > 0) e.shield = Math.floor(e.shieldMax * 0.5);
      }
      // THE CAMO RING CONTROL. `isCamo` is an instance field copied off the
      // type, and the overlay's camo loop reads nothing else -- so flipping it
      // removes the ring and changes NOTHING about the geometry, the draw
      // calls, the health bars or the positions. That is what makes the A/B a
      // measurement of the ring rather than of "camo bodies are different".
      if (spec.forceCamo !== undefined) e.isCamo = !!spec.forceCamo;
      enemies.push(e);
      made[e.typeId] = (made[e.typeId] || 0) + 1;
    }
    // A count of draw calls is not evidence anything was drawn; a NaN position
    // submits every call and shades nothing.
    var finite = 0, hurt = 0, camo = 0;
    for (i = 0; i < enemies.length; i++) {
      var q = enemies[i];
      if (isFinite(q.pos.x) && isFinite(q.pos.y)) finite++;
      if (q.health < q.maxHealth) hurt++;
      if (q.isCamo) camo++;
    }
    return { requested: n, actual: enemies.length, finite: finite, hurt: hurt,
             camo: camo, composition: made, pathLength: L };
  };

  // A BOARD WITH NO DEFENCE IS NOT THE WORST CASE, IT IS A DIFFERENT BOARD.
  //
  // With no towers there are no projectiles and no effects, and `drawShots`
  // and `drawEffects` -- both inside drawOverlays, both per-projectile -- never
  // run. A 400-body board a player actually reaches has towers firing into it
  // continuously. Enemy health is raised to 1e9 here rather than left at the
  // type default, because the point is a board that does NOT clear: kills would
  // empty the road and the measurement would be of a board getting smaller.
  TDPop.towers = function (spec) {
    var n = (spec && spec.n) || 12;
    var maxUps = (spec && spec.maxPath) !== false;
    towers.length = 0;
    if (typeof bullets !== "undefined") bullets.length = 0;
    // A DEFAULT PROFILE OWNS TWO TOWERS. The first version of this placed 12
    // towers and they were six Smashers and six Soldiers, because BUILD_SLOTS
    // is the player's ARMOURY loadout and an unplayed profile has two entries.
    // A "full board" measured that way is a board of the two starter towers.
    if (typeof MetaProgress !== "undefined" && MetaProgress.unlockAll) {
      MetaProgress.unlockAll();
      if (typeof rebuildBuildBar === "function") rebuildBuildBar();
    }
    var slots = [];
    for (var q = 0; q < BUILD_SLOTS.length; q++) if (BUILD_SLOTS[q]) slots.push(BUILD_SLOTS[q]);
    if (!slots.length) return { placed: 0, note: "no BUILD_SLOTS" };
    var p = paths[0], L = p.length;
    cash = 1e9;
    var placed = [];
    for (var i = 0; i < n; i++) {
      var d = (i + 0.5) / n * L;
      var pt = p.pointAt(d), tg = p.tangentAt(d);
      // Perpendicular to the road, alternating sides, so towers stand off the
      // path the way a built board does rather than on top of it.
      var side = (i % 2) ? 1 : -1;
      var ox = -tg.y * 52 * side, oy = tg.x * 52 * side;
      var Ctor = slots[i % slots.length];
      var t;
      try { t = new Ctor(pt.x + ox, pt.y + oy, p); } catch (e) { continue; }
      addTower(t);
      var bought = [];
      if (maxUps && t.panelActions && t.performAction) {
        var want = (i % 2) ? "B" : "A";
        for (var k = 0; k < 5; k++) {
          cash = 1e9;
          var acts = t.panelActions(), picked = null;
          for (var j = 0; j < acts.length; j++) {
            var a = acts[j];
            if (!a || a.readonly || a.enabled === false) continue;
            var br = (a.branch || "").toString().toUpperCase();
            var lbl = (a.label || "").toString().toUpperCase();
            if (br === want || lbl.indexOf("PATH " + want) === 0) { picked = a; break; }
          }
          if (!picked) break;
          try {
            t.performAction(picked.id, { cash: cash,
              spend: function (amt) { cash -= amt; },
              enemies: enemies,
              damage: function (e, amt) { e.takeDamage(amt); },
              beginAiming: function () {} });
            bought.push(picked.label);
          } catch (e) { break; }
        }
      }
      placed.push({ kind: t.constructor && t.constructor.name, bought: bought.length,
                    upgradeCount: t.upgradeCount });
    }
    // RETURN THE EVIDENCE, NOT THE INTENT. The first version reported "12
    // towers placed" while every `hasA1..hasB5` was still false -- the upgrade
    // loop had silently bought nothing, and a "fully upgraded board" row would
    // have measured twelve base towers. A caller has to be able to check.
    var ups = 0, kinds = {};
    for (var z = 0; z < placed.length; z++) {
      ups += placed[z].bought;
      kinds[placed[z].kind] = (kinds[placed[z].kind] || 0) + 1;
    }
    return { placed: towers.length, upgradesBought: ups, kinds: kinds, detail: placed };
  };

  // Make every body effectively unkillable so a firing board stays the size it
  // was built at. `bar()` still draws, because health is below max.
  TDPop.immortal = function () {
    for (var i = 0; i < enemies.length; i++) {
      enemies[i].maxHealth = 1e9;
      enemies[i].health = 6e8;
      if (enemies[i].shieldMax > 0) enemies[i].shield = enemies[i].shieldMax;
    }
    baseHp = 1e9;
    return enemies.length;
  };

  // ---- 4. proof the bodies are ON SCREEN ----------------------------------

  // The renderer does NOT frustum-cull, so an off-screen body still submits
  // its draw calls and costs nothing to shade. Covered pixels is the only
  // honest proof that the fragment half of the measurement is real.
  TDPop.baseline = function () {
    var stash = enemies.slice();
    enemies.length = 0;
    draw(); draw();                         // discard one frame after a change
    TDPop._baseline = readGL();
    // The null: same state twice, nothing changed.
    draw();
    var again = readGL();
    var nul = diffCount(TDPop._baseline, again, 0);
    enemies.length = 0;
    for (var i = 0; i < stash.length; i++) enemies.push(stash[i]);
    draw(); draw();
    return { nullChanged: nul.changed, canvas: [glCanvas().width, glCanvas().height] };
  };

  TDPop.covered = function (tol) {
    if (!TDPop._baseline) throw new Error("no empty-board baseline");
    draw();
    var now = readGL();
    return diffCount(TDPop._baseline, now, tol || 0);
  };

  // A region of the GL canvas that no body ever reaches. It MUST be identical
  // at every N in the sweep. A printed constant (canvas size, camera distance)
  // is a claim about the instrument; this is a measurement of the subject that
  // would move if the camera eased, the viewport changed, or the map pass drew
  // differently.
  // It DRAWS first, always. Read without drawing and you are reading whatever
  // survived in the drawing buffer since the last evaluate, which a composite
  // is free to have cleared -- and the first version of this control reported
  // a moved hash on a frame the whole-canvas diff said was bit-identical to
  // the baseline. Two controls contradicting each other is the tell that one
  // of them is reading a different buffer, not that the scene changed.
  TDPop.controlROI = function (roi) {
    draw();
    var gl = glCtx();
    var buf = new Uint8Array(roi[2] * roi[3] * 4);
    gl.readPixels(roi[0], roi[1], roi[2], roi[3], gl.RGBA, gl.UNSIGNED_BYTE, buf);
    // FNV-1a over the bytes.
    var h = 0x811c9dc5;
    for (var i = 0; i < buf.length; i++) {
      h ^= buf[i];
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    var sum = 0;
    for (i = 0; i < buf.length; i++) sum += buf[i];
    return { hash: ("00000000" + h.toString(16)).slice(-8), sum: sum, px: roi[2] * roi[3] };
  };

  TDPop.projector = function () {
    if (TDPop._api) return true;
    if (typeof SiphonFXRitual === "undefined") return false;
    var real = SiphonFXRitual.draw;
    SiphonFXRitual.draw = function (ctx, state, api) {
      TDPop._api = api; SiphonFXRitual.draw = real;
      return real.apply(this, arguments);
    };
    draw();
    if (!TDPop._api) { SiphonFXRitual.draw = real; return false; }
    return true;
  };

  TDPop.onScreen = function () {
    if (!TDPop.projector()) return null;
    var u = uiCanvas(), W = u.width, H = u.height;
    var inside = 0, total = 0, bad = 0;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      total++;
      var s = TDPop._api.project(e.pos.x, e.pos.y, 0);
      if (!s || !isFinite(s.x) || !isFinite(s.y)) { bad++; continue; }
      if (s.x >= 0 && s.x < W && s.y >= 0 && s.y < H) inside++;
    }
    return { inside: inside, total: total, unprojectable: bad, viewport: [W, H] };
  };

  // ---- 5. the measured run ------------------------------------------------

  // TWO CLOCKS, BECAUSE THEY ANSWER TWO QUESTIONS AND NEITHER SUBSTITUTES.
  //
  // (1) Per-frame `performance.now()` around frame() is CPU MAIN-THREAD time.
  //     That is what blocks the next rAF callback, so it is the quantity a
  //     dropped frame is made of. It is also a SUBMIT time: GL commands are
  //     queued, not executed, and 2D canvas calls are recorded, not
  //     rasterised. Quoting it as "frame time" over-flatters a GPU-bound
  //     board.
  // (2) The whole batch, wall-clock, with ONE fence at the end that drains
  //     both canvases. Over 120 frames the drain amortises and any GPU
  //     back-pressure shows up as the submit thread blocking. That is the
  //     SUSTAINED cost, and it is the honest answer to "can this run cleanly".
  //
  // Per-frame fencing was tried first and abandoned: a 1x1 readPixels costs
  // 8-24 ms of pure round-trip latency on this driver, which is 3-15x the
  // thing being measured and swamps it.
  //
  // `stub` isolates a component by A/B on the SAME scene: 'overlay' replaces
  // World3D.drawOverlays with a no-op, 'gl' replaces drawWorld. The delta
  // against the unstubbed run is that pass's marginal cost INCLUDING its GPU
  // half, which no CPU-side timer can see.
  TDPop.run = function (opts) {
    var frames = opts.frames || 120;
    var warm = opts.warm === undefined ? 12 : opts.warm;
    var dtMs = opts.dtMs || (1000 / 60);
    gameSpeed = opts.speed || 1;
    accumulator = 0;
    var clock = 1e6;
    lastTime = clock;

    var restore = TDPop._stub(opts.stub);
    var i;
    for (i = 0; i < warm; i++) { gameOver = false; victory = false; baseHp = 1e9; clock += dtMs; frame(clock); }
    TDPop._fence();

    var rows = [];
    var t0batch = performance.now();
    for (i = 0; i < frames; i++) {
      var acc = TDPop._acc;
      acc.update = 0; acc.steps = 0; acc.gl = 0; acc.ov = 0;
      // HOLD THE BASE, EVERY FRAME. `update()` returns immediately once
      // `gameOver` is set, so a board that leaks its base to zero mid-run goes
      // on RENDERING 400 bodies while simulating none of them -- frozen walk
      // frames, no firing, no movement -- and every later row inherits the
      // latched flag. It cost a whole firing-board table: 150 frames, 0
      // bullets, 0 HP removed, and enemy `progress` unchanged at 2 from the
      // first frame to the last. Leak damage scales with the leaking body's
      // HEALTH, so making bodies unkillable (which the firing board needs, or
      // it measures itself getting smaller) is exactly what makes one leak
      // worth 6e8 base HP. Two assignments per frame, applied to every row.
      gameOver = false; victory = false; baseHp = 1e9;
      clock += dtMs;
      var a = performance.now();
      frame(clock);
      var b = performance.now();
      rows.push({
        total: b - a,
        update: acc.update, steps: acc.steps,
        gl: acc.gl, ov: acc.ov,
        dc: acc.dc, tri: acc.tri,
        n: enemies.length,
        // Sampled EVERY frame, because a single reading caught 0 on a board
        // that was firing perfectly well -- projectiles are short-lived and an
        // instantaneous count is as likely to land in a gap as on a shot.
        bul: (typeof bullets !== "undefined" ? bullets.length : -1)
      });
    }
    var submitMs = performance.now() - t0batch;
    TDPop._fence();
    var batch = performance.now() - t0batch;
    restore();
    return { rows: rows, batchMs: batch, submitMs: submitMs, frames: frames,
             speed: gameSpeed, dtMs: dtMs, stub: opts.stub || "none",
             nStart: rows.length ? rows[0].n : 0,
             nEnd: enemies.length };
  };

  TDPop._fence = function () {
    var gl = glCtx();
    var one = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one);
    ctx.getImageData(0, 0, 1, 1);
  };

  TDPop._stub = function (which) {
    if (!which || which === "none") return function () {};
    var savedOv = World3D.drawOverlays, savedGl = World3D.drawWorld;
    if (which === "overlay" || which === "both") {
      World3D.drawOverlays = function () { return undefined; };
    }
    if (which === "gl" || which === "both") {
      // Must still return TRUTHY or game.js falls through to the entire 2D
      // fallback board, which is a different renderer and not the control.
      World3D.drawWorld = function () { return true; };
    }
    return function () {
      World3D.drawOverlays = savedOv;
      World3D.drawWorld = savedGl;
    };
  };

  // PER-STEP SIMULATION COST, TIMED AS A BATCH.
  //
  // performance.now() is quantised to 0.1 ms here, and one update() step at
  // 200 bodies lands under that quantum -- it reads as a median of exactly 0,
  // which looks like a free pass and is a defect in the instrument. Timing K
  // steps as ONE measurement is immune to the clamp.
  TDPop.simCost = function (k) {
    k = k || 120;
    var n0 = enemies.length;
    var t0 = performance.now();
    for (var i = 0; i < k; i++) { gameOver = false; baseHp = 1e9; update(1 / 60); }
    var dt = performance.now() - t0;
    return { steps: k, totalMs: dt, msPerStep: dt / k,
             nStart: n0, nEnd: enemies.length };
  };

  // THE PACED RUN -- the empirical form of the stability question.
  //
  // rAF fires no faster than the display, so the next frame's `elapsed` is
  // max(16.67 ms, however long this frame took). Feed frame() exactly that and
  // the accumulator feedback loop is reproduced with real measured costs: a
  // frame that overruns banks more simulation, which lengthens the next frame.
  // The fixed point is kaz's T = R / (1 - speed*60*S); this measures it
  // instead of computing it.
  //
  // A free-running loop is NOT this test. Fed performance.now() directly the
  // loop runs at ~1 ms/frame, the accumulator almost never reaches one step,
  // and the measurement says nothing about a 60 Hz game.
  TDPop.runPaced = function (opts) {
    var frames = opts.frames || 90;
    var warm = opts.warm === undefined ? 15 : opts.warm;
    var vsync = opts.vsyncMs || (1000 / 60);
    gameSpeed = opts.speed || 1;
    accumulator = 0;
    var clock = 3e6;
    lastTime = clock;
    var i, dur = vsync;
    for (i = 0; i < warm; i++) {
      clock += Math.max(vsync, dur);
      var w0 = performance.now(); frame(clock); dur = performance.now() - w0;
    }
    var periods = [], steps = [], fed = [];
    for (i = 0; i < frames; i++) {
      var acc = TDPop._acc; acc.steps = 0;
      gameOver = false; victory = false; baseHp = 1e9;
      var feed = Math.max(vsync, dur);
      clock += feed;
      var a = performance.now();
      frame(clock);
      dur = performance.now() - a;
      periods.push(dur); steps.push(acc.steps); fed.push(feed);
    }
    return { periods: periods, steps: steps, fed: fed,
             speed: gameSpeed, n: enemies.length };
  };

  TDPop.timerQuery = function () {
    var gl = glCtx();
    var e2 = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    var e1 = gl.getExtension("EXT_disjoint_timer_query");
    return { webgl2: !!e2, webgl1: !!e1 };
  };

  // ---- 6. the real wave schedule ------------------------------------------

  // Put the scheduler back on, at a chosen wave, with no defence and an
  // indestructible base, and let it run. The peak population and its
  // composition are then the schedule's own answer rather than mine.
  TDPop.schedule = function (opts) {
    var startWave = opts.startWave || 0;
    var seconds = opts.seconds || 90;
    var dtMs = 1000 / 60;
    enemies.length = 0;
    towers.length = 0;
    if (typeof bullets !== "undefined") bullets.length = 0;
    gameOver = false; victory = false; paused = false;
    baseHp = 1e9;
    waveIndex = startWave;
    if (typeof waveSpawned !== "undefined") waveSpawned = 0;
    if (typeof waveCountdown !== "undefined") waveCountdown = 0.2;
    if (typeof allWavesDeployed !== "undefined") allWavesDeployed = false;
    gameSpeed = 1;
    accumulator = 0;
    var clock = 2e6;
    lastTime = clock;
    var peak = 0, peakComp = null, peakWave = startWave, peakT = 0;
    var trace = [];
    var nFrames = Math.round(seconds * 60);
    for (var i = 0; i < nFrames; i++) {
      clock += dtMs;
      // Simulation only for the scan: this is a census, not a timing run, and
      // drawing 5400 frames costs minutes for nothing.
      update(1 / 60);
      baseHp = 1e9;
      if (enemies.length > peak) {
        peak = enemies.length;
        peakT = i / 60;
        peakWave = waveIndex;
        peakComp = {};
        for (var j = 0; j < enemies.length; j++) {
          peakComp[enemies[j].typeId] = (peakComp[enemies[j].typeId] || 0) + 1;
        }
      }
      if (i % 60 === 0) trace.push([i / 60, enemies.length, waveIndex]);
    }
    return { peak: peak, atSeconds: peakT, waveIndexAtPeak: peakWave,
             composition: peakComp, trace: trace, endWaveIndex: waveIndex };
  };

  // ONE GLOBAL WARM-UP BEFORE THE SWEEP, NOT ONE PER ROW.
  //
  // The smoke run measured 3x FASTER than 1x on the same board, which is
  // impossible -- 3x runs three simulation steps to 1x's one. The cause was
  // ordering: the 1x run paid for JIT compilation of the enemy loop, the
  // overlay pass and the shader paths, and the 3x run that followed inherited
  // warm code. Any sweep whose first row pays a one-off is a sweep whose shape
  // is partly the compiler's.
  TDPop.warmup = function (opts) {
    var n = (opts && opts.n) || 600;
    var mix = (opts && opts.mix) || ["normal"];
    TDPop.build({ n: n, mix: mix, damaged: true });
    TDPop.run({ frames: 150, warm: 20, speed: 3 });
    TDPop.run({ frames: 60, warm: 10, speed: 1, stub: "overlay" });
    TDPop.run({ frames: 60, warm: 10, speed: 1, stub: "gl" });
    TDPop.simCost(200);
    TDPop.runPaced({ frames: 40, warm: 10, speed: 3 });
    enemies.length = 0;
    draw(); draw();
    return "warm";
  };

  TDPop.state = function () {
    var r = World3D.renderer();
    return { enemies: enemies.length, towers: towers.length,
             bullets: typeof bullets !== "undefined" ? bullets.length : -1,
             drawCalls: r.drawCalls, triangles: r.triangles,
             gameSpeed: gameSpeed, gameOver: gameOver, baseHp: baseHp,
             waveIndex: waveIndex };
  };

  window.TDPop = TDPop;
  return "TDPop installed";
})();
