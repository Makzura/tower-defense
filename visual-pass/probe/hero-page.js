// ---------------------------------------------------------------------------
// HeroRig -- the page-side half of the 1920x1080 hero capture rig.
//
// Loaded AFTER page-probe.js (it reuses TDProbe.warm / TDProbe.cam and the
// game's own draw()). NOT part of the game, never referenced by index.html,
// never edits a game file.
//
// WHAT IT ADDS OVER TDProbe, AND WHY EACH PIECE EXISTS:
//
// 1. A COMPOSITE capture. TDProbe reads #gl and only #gl, which is right for a
//    model measurement -- bodies are on #gl and #gl is bit-stable. But the
//    question here is "does a SCREENSHOT survive at 200 px", and a screenshot
//    is what the compositor produces: the 2D overlay (#game -- health bars,
//    projectiles, beams, HUD) painted over the 3D board. So the composite is
//    built explicitly, source-over in JS, from readPixels(#gl) and
//    getImageData(#game) taken in the SAME synchronous task as one draw().
//    #gl is still captured separately, because its null control reaches
//    exactly 0 and the composite's does not.
//
// 2. AN EXPLICIT AREA-AVERAGE DOWNSCALER. Not drawImage. drawImage's filter is
//    unspecified and varies by driver and version, so a number produced through
//    it does not mean the same thing next month. This is a plain fractional box
//    filter: output pixel [i,i+1) in output space covers [i*s,(i+1)*s) in input
//    space and every input pixel is weighted by its exact overlap. Deterministic,
//    portable, and readable in twenty lines.
//    Run in BOTH sRGB byte space (what an image pipeline does) and linear-light
//    space (what a physically correct resampler does), because the whole
//    conclusion is a threshold count and it should not turn on that choice.
//
// 3. A THRESHOLDED DIFF. "Becomes texture" has a sharp form: the subject
//    survives as MANY pixels with TINY deltas rather than FEW with LARGE ones.
//    So the count is reported at delta > 0, > 8, > 16 and > 32 separately,
//    with the full max-channel-delta histogram behind it.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  var TDProbe = window.TDProbe;
  if (!TDProbe) throw new Error("HeroRig needs page-probe.js loaded first");

  var W = 1920, H = 1080;               // the contract, asserted on every capture
  var caps = Object.create(null);       // key -> {gl, comp, w, h}
  var scaled = Object.create(null);     // key -> Uint8Array (RGB triples)

  function glEl() { return document.getElementById("gl"); }
  function uiEl() { return document.getElementById("game"); }

  // THE ASSERTION KAZ ASKED FOR, AND IT LIVES AT CAPTURE TIME, NOT AT SETUP.
  // gl-world.js runs resize() at the top of drawWorld() on EVERY frame, so the
  // canvas size is re-derived from the layout rect continuously; anything set
  // on the canvas directly is overwritten by the next draw. Checking once after
  // setup would prove nothing about the frame actually captured.
  // 1918x1079 is a failure, not a rounding: the point of the shot is that the
  // 16:9 crop takes nothing.
  function assertSize(where) {
    var g = glEl(), u = uiEl();
    if (g.width !== W || g.height !== H) {
      throw new Error("HERO SIZE FAIL at " + where + ": #gl is " +
        g.width + "x" + g.height + ", required " + W + "x" + H);
    }
    if (u.width !== W || u.height !== H) {
      throw new Error("HERO SIZE FAIL at " + where + ": #game backing store is " +
        u.width + "x" + u.height + ", required " + W + "x" + H);
    }
    return true;
  }

  // One draw, both canvases, one synchronous task. readPixels needs to happen
  // before the compositor can invalidate the drawing buffer, and getImageData
  // on #game needs to happen before anything else draws over it.
  //
  // readPixels rows are BOTTOM-UP; getImageData rows are TOP-DOWN. The flip
  // happens exactly here, once, and everything downstream is top-down.
  function capture(key) {
    assertSize("capture " + key);
    draw();
    var gl = World3D.renderer().gl;
    var raw = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    var ui = uiEl().getContext("2d").getImageData(0, 0, W, H).data;

    var glTop = new Uint8Array(W * H * 4);
    var comp = new Uint8Array(W * H * 4);
    for (var y = 0; y < H; y++) {
      var src = (H - 1 - y) * W * 4;
      var dst = y * W * 4;
      for (var x = 0; x < W * 4; x += 4) {
        var r = raw[src + x], g = raw[src + x + 1], b = raw[src + x + 2];
        glTop[dst + x] = r; glTop[dst + x + 1] = g;
        glTop[dst + x + 2] = b; glTop[dst + x + 3] = 255;
        // source-over: the 2D overlay is drawn on transparent black over the
        // GL board, which is exactly what the browser's compositor does with
        // #game (z-index 1, background transparent) sitting on #gl (z-index 0).
        var a = ui[dst + x + 3] / 255;
        comp[dst + x]     = Math.round(ui[dst + x]     * a + r * (1 - a));
        comp[dst + x + 1] = Math.round(ui[dst + x + 1] * a + g * (1 - a));
        comp[dst + x + 2] = Math.round(ui[dst + x + 2] * a + b * (1 - a));
        comp[dst + x + 3] = 255;
      }
    }
    caps[key] = { gl: glTop, comp: comp, w: W, h: H };
    return { key: key, size: [W, H] };
  }

  // ---- the downscaler ----------------------------------------------------

  // Exact fractional overlap weights for one axis. Output pixel o covers
  // [o*s, (o+1)*s) in input coordinates; input pixel i covers [i, i+1).
  function axisWeights(inN, outN) {
    var s = inN / outN, out = [];
    for (var o = 0; o < outN; o++) {
      var a = o * s, b = (o + 1) * s;
      var i0 = Math.floor(a), i1 = Math.min(inN, Math.ceil(b));
      var idx = [], wt = [], tot = 0;
      for (var i = i0; i < i1; i++) {
        var ov = Math.min(b, i + 1) - Math.max(a, i);
        if (ov > 1e-12) { idx.push(i); wt.push(ov); tot += ov; }
      }
      for (var k = 0; k < wt.length; k++) wt[k] /= tot;   // normalised: a mean
      out.push({ idx: idx, w: wt });
    }
    return out;
  }

  // sRGB byte <-> linear, via a 256-entry LUT so a 6-million-pixel pass does not
  // call Math.pow six million times.
  var TO_LIN = new Float32Array(256);
  for (var v = 0; v < 256; v++) {
    var c = v / 255;
    TO_LIN[v] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function fromLin(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 255;
    var e = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.round(e * 255);
  }

  // `space` is "srgb" (average the encoded bytes -- what an image pipeline
  // does) or "linear" (decode, average, re-encode -- what a physically correct
  // resampler does). Both are run on every measurement so the conclusion cannot
  // be an artefact of the choice.
  function downscale(buf, outW, outH, space) {
    var linear = space === "linear";
    var cw = axisWeights(W, outW), ch = axisWeights(H, outH);
    // horizontal pass: W x H -> outW x H, in float
    var mid = new Float32Array(outW * H * 3);
    for (var y = 0; y < H; y++) {
      var rowIn = y * W * 4, rowMid = y * outW * 3;
      for (var ox = 0; ox < outW; ox++) {
        var e = cw[ox], r = 0, g = 0, b = 0;
        for (var k = 0; k < e.idx.length; k++) {
          var q = rowIn + e.idx[k] * 4, wk = e.w[k];
          if (linear) {
            r += TO_LIN[buf[q]] * wk; g += TO_LIN[buf[q + 1]] * wk; b += TO_LIN[buf[q + 2]] * wk;
          } else {
            r += buf[q] * wk; g += buf[q + 1] * wk; b += buf[q + 2] * wk;
          }
        }
        var m = rowMid + ox * 3;
        mid[m] = r; mid[m + 1] = g; mid[m + 2] = b;
      }
    }
    // vertical pass: outW x H -> outW x outH
    var out = new Uint8Array(outW * outH * 3);
    for (var oy = 0; oy < outH; oy++) {
      var ee = ch[oy];
      for (var x2 = 0; x2 < outW; x2++) {
        var rr = 0, gg = 0, bb = 0;
        for (var j = 0; j < ee.idx.length; j++) {
          var mm = (ee.idx[j] * outW + x2) * 3, wj = ee.w[j];
          rr += mid[mm] * wj; gg += mid[mm + 1] * wj; bb += mid[mm + 2] * wj;
        }
        var oo = (oy * outW + x2) * 3;
        if (linear) {
          out[oo] = fromLin(rr); out[oo + 1] = fromLin(gg); out[oo + 2] = fromLin(bb);
        } else {
          out[oo] = Math.round(rr); out[oo + 1] = Math.round(gg); out[oo + 2] = Math.round(bb);
        }
      }
    }
    return out;
  }

  // ---- diffs -------------------------------------------------------------

  // Max-channel delta per pixel, counted at four thresholds, with the whole
  // histogram behind it. THE THRESHOLDS ARE STRICT: count(t) = #{d > t}, so
  // count(0) is "changed at all" and the four numbers are monotone.
  function diffRGB(a, b, n) {
    var hist = new Int32Array(256);
    var maxD = 0, sum = 0, changed = 0;
    for (var p = 0, q = 0; p < n; p++, q += 3) {
      var d0 = Math.abs(a[q] - b[q]);
      var d1 = Math.abs(a[q + 1] - b[q + 1]);
      var d2 = Math.abs(a[q + 2] - b[q + 2]);
      var d = d0 > d1 ? d0 : d1; if (d2 > d) d = d2;
      hist[d]++;
      if (d > maxD) maxD = d;
      if (d > 0) { changed++; sum += d; }
    }
    function above(t) { var c = 0; for (var i = t + 1; i < 256; i++) c += hist[i]; return c; }
    return {
      pixels: n,
      gt0: above(0), gt8: above(8), gt16: above(16), gt32: above(32),
      fracGt0: +(above(0) / n).toFixed(6),
      fracGt8: +(above(8) / n).toFixed(6),
      fracGt16: +(above(16) / n).toFixed(6),
      fracGt32: +(above(32) / n).toFixed(6),
      maxDelta: maxD,
      meanDeltaOverChanged: changed ? +(sum / changed).toFixed(3) : 0,
      hist: Array.prototype.slice.call(hist)
    };
  }

  // Full-resolution diff on a stored capture layer. This is the POSITIVE
  // CONTROL's home: if the two 1920x1080 frames do not differ by a large
  // count, the deletion did nothing and every downscaled zero below is fake.
  function diffFull(a, b, layer) {
    var A = caps[a], B = caps[b];
    if (!A || !B) throw new Error("missing capture " + a + "/" + b);
    var x = A[layer], y = B[layer];
    var hist = new Int32Array(256);
    var maxD = 0, sum = 0, changed = 0;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (var p = 0, q = 0; q < x.length; q += 4, p++) {
      var d0 = Math.abs(x[q] - y[q]);
      var d1 = Math.abs(x[q + 1] - y[q + 1]);
      var d2 = Math.abs(x[q + 2] - y[q + 2]);
      var d = d0 > d1 ? d0 : d1; if (d2 > d) d = d2;
      hist[d]++;
      if (d > maxD) maxD = d;
      if (d > 0) {
        changed++; sum += d;
        var xx = p % W, yy = (p / W) | 0;
        if (xx < minX) minX = xx; if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy; if (yy > maxY) maxY = yy;
      }
    }
    function above(t) { var c = 0; for (var i = t + 1; i < 256; i++) c += hist[i]; return c; }
    return { pixels: W * H, layer: layer,
             gt0: above(0), gt8: above(8), gt16: above(16), gt32: above(32),
             fracGt0: +(above(0) / (W * H)).toFixed(6),
             maxDelta: maxD,
             meanDeltaOverChanged: changed ? +(sum / changed).toFixed(3) : 0,
             bbox: changed ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : null };
  }

  // ---- PNG ---------------------------------------------------------------

  function pngFromRGBA(buf, w, h) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var img = new ImageData(new Uint8ClampedArray(buf), w, h);
    c.getContext("2d").putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }

  function pngFromRGB(buf, w, h) {
    var rgba = new Uint8ClampedArray(w * h * 4);
    for (var p = 0, q = 0, r = 0; p < w * h; p++, q += 3, r += 4) {
      rgba[r] = buf[q]; rgba[r + 1] = buf[q + 1]; rgba[r + 2] = buf[q + 2]; rgba[r + 3] = 255;
    }
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").putImageData(new ImageData(rgba, w, h), 0, 0);
    return c.toDataURL("image/png");
  }

  var HeroRig = {
    W: W, H: H,
    caps: caps,
    scaled: scaled,
    assertSize: assertSize,
    capture: capture,
    diffFull: diffFull,

    sizes: function () {
      var g = glEl(), u = uiEl();
      return { gl: [g.width, g.height], ui: [u.width, u.height],
               glCss: [g.style.width, g.style.height],
               inner: [window.innerWidth, window.innerHeight],
               dpr: window.devicePixelRatio,
               rect: (function () { var r = u.getBoundingClientRect();
                                    return [r.width, r.height]; })() };
    },

    // Downscale a stored capture layer and keep the result under a name, so a
    // diff can be taken between two results that went through the IDENTICAL
    // path -- which is what makes the null control mean anything.
    shrink: function (key, layer, outW, outH, space) {
      var c = caps[key];
      if (!c) throw new Error("missing capture " + key);
      var name = key + "|" + layer + "|" + outW + "x" + outH + "|" + space;
      // Cached, and the cache is safe because a capture is immutable once
      // stored: the same (key, layer, size, space) can only ever produce the
      // same bytes. That matters beyond speed -- the null control's whole
      // meaning is that both sides went through the IDENTICAL path.
      if (!scaled[name]) scaled[name] = downscale(c[layer], outW, outH, space);
      return { name: name, size: [outW, outH], bytes: scaled[name].length };
    },

    diffScaled: function (nameA, nameB, outW, outH) {
      var a = scaled[nameA], b = scaled[nameB];
      if (!a || !b) throw new Error("missing scaled " + nameA + "/" + nameB);
      return diffRGB(a, b, outW * outH);
    },

    // One call per (layer, size, space): shrink both, diff, return. Keeps the
    // node side from having to keep three names in step.
    battery: function (keyA, keyB, layer, outW, outH, space) {
      var na = HeroRig.shrink(keyA, layer, outW, outH, space).name;
      var nb = HeroRig.shrink(keyB, layer, outW, outH, space).name;
      var d = HeroRig.diffScaled(na, nb, outW, outH);
      d.size = [outW, outH]; d.layer = layer; d.space = space;
      return d;
    },

    pngFull: function (key, layer) {
      var c = caps[key];
      if (!c) throw new Error("missing capture " + key);
      if (c.w !== W || c.h !== H) throw new Error("stored capture is not " + W + "x" + H);
      return pngFromRGBA(c[layer], W, H);
    },

    pngScaled: function (key, layer, outW, outH, space) {
      var name = key + "|" + layer + "|" + outW + "x" + outH + "|" + space;
      if (!scaled[name]) HeroRig.shrink(key, layer, outW, outH, space);
      return pngFromRGB(scaled[name], outW, outH);
    },

    // ---- the scene ------------------------------------------------------

    // Build a real board: towers placed through the GAME'S OWN validity gate
    // and constructor path (the same three lines onClick runs), then the real
    // scheduler deploying a real wave, then the real frame() driving the real
    // update() and the real draw() on a synthetic monotonic clock.
    //
    // rAF is stubbed by TDProbe.setup, so frame() is called here explicitly and
    // no second loop is ever queued. The clock is synthetic because a hidden
    // headless pane throttles rAF dead and `worldRenderState().now` IS the rAF
    // clock -- a frozen effect photographs identically to a correct rest pose.
    buildBoard: function (opts) {
      opts = opts || {};
      var wave = opts.wave === undefined ? 12 : opts.wave;
      var wantTowers = opts.towers === undefined ? 8 : opts.towers;

      enemies.length = 0; towers.length = 0; bullets.length = 0;
      gameOver = false; baseHp = 100000; cash = 9999999;
      paused = false; screen = "play"; inspected = null; selectedSlot = null;
      if (typeof gameSpeed !== "undefined") gameSpeed = 1;

      // TOWERS THROUGH THE GAME'S OWN GATE. whyCannotBuild is the predicate
      // onClick uses; nearestPathTo and the pathProgress scaling are copied
      // from the three lines directly under it. Placing any other way would
      // put a tower where a player cannot, and the picture would then be of a
      // board the game does not allow.
      var placed = [], tried = 0;
      var types = BUILD_SLOTS.filter(function (t) { return !!t; });
      if (!types.length) throw new Error("no tower types in BUILD_SLOTS");
      for (var p = 30; p < path.length - 30 && placed.length < wantTowers; p += 11) {
        var pt = path.pointAt ? path.pointAt(p) : null;
        if (!pt) break;
        for (var side = 0; side < 2 && placed.length < wantTowers; side++) {
          for (var off = 34; off <= 62 && placed.length < wantTowers; off += 7) {
            var tan = path.tangentAt(p);
            var nx = -tan.y, ny = tan.x;
            var sgn = side ? -1 : 1;
            var wx = pt.x + nx * off * sgn, wy = pt.y + ny * off * sgn;
            var type = types[placed.length % types.length];
            tried++;
            if (whyCannotBuild(wx, wy, type) !== null) continue;
            var route = nearestPathTo(wx, wy);
            var built = new type(wx, wy, route.path);
            built.routeId = route.path.id;
            built.pathProgress = route.progress / route.path.length * path.length;
            addTower(built);
            placed.push({ type: type.name || String(type).slice(9, 30),
                          x: Math.round(wx), y: Math.round(wy) });
          }
        }
      }

      // Arm the real scheduler on a mid-campaign wave.
      waveIndex = Math.min(wave, WAVES.length - 1);
      waveSpawned = 0;
      if (typeof waveCountdown !== "undefined") waveCountdown = 0.05;
      if (typeof allWavesDeployed !== "undefined") allWavesDeployed = false;

      return { towersPlaced: placed.length, tried: tried, placed: placed,
               waveIndex: waveIndex, waves: WAVES.length,
               pathLength: path.length };
    },

    // Drive the REAL frame() on a synthetic clock until the board is at its
    // fullest, then stop. Returns the trace so the chosen moment is a measured
    // pick and not a guess.
    //
    // Base HP is held up every step: baseHp reaching 0 sets gameOver and the
    // scheduler then silently stops spawning, which photographs as an empty
    // road and reads as "the wave did not deploy".
    // `drawTail` is how many of the final frames are rendered for real. The
    // ones before it run update() with draw() stubbed to a no-op.
    //
    // WHY THE STUB IS NOT A SHORTCUT THAT CHANGES THE ANSWER, and where it
    // WOULD be one. A 1920x1080 frame under SwiftShader is expensive and 1,500
    // of them is minutes; but update() is the simulation and draw() is
    // feedback the simulation never reads back, so skipping draws cannot move
    // an enemy or a bullet. What it CAN move is effect state, which is built
    // during draw and has memory: splatters, shot pools, the blub watch list,
    // the flier wreck list. So the tail is rendered for real -- long enough
    // that anything with a lifetime shorter than it has been through its whole
    // history before the shutter opens. Reported, not assumed: `drawTail` is
    // in the output beside the counts.
    run: function (seconds, drawTail) {
      var steps = Math.round(seconds * 60);
      var tail = drawTail === undefined ? 90 : drawTail;
      var trace = [], peak = 0, peakFrame = -1;
      var realDraw = window.draw;
      for (var i = 0; i < steps; i++) {
        window.draw = (i >= steps - tail) ? realDraw : function () {};
        lastTime = i * (1000 / 60);
        gameOver = false;
        if (baseHp < 1000) baseHp = 100000;
        frame((i + 1) * (1000 / 60));
        trace.push([i, enemies.length, bullets.length]);
        if (enemies.length > peak) { peak = enemies.length; peakFrame = i; }
      }
      window.draw = realDraw;
      return { steps: steps, drawTail: tail,
               enemies: enemies.length, towers: towers.length,
               bullets: bullets.length, peakEnemies: peak, peakFrame: peakFrame,
               waveIndex: waveIndex, waveSpawned: waveSpawned,
               gameOver: gameOver, baseHp: baseHp,
               drawRestored: window.draw === realDraw,
               finite: enemies.every(function (e) { return isFinite(e.pos.x) && isFinite(e.pos.y); }),
               trace: trace.filter(function (t, ix) { return ix % 30 === 0 || ix >= steps - 5; }) };
    },

    // Freeze: from here on nothing advances. lastTime is left exactly where the
    // run left it, so worldRenderState().now is stable and every later draw()
    // renders the same instant.
    freeze: function () {
      var st = worldRenderState();
      return { now: st.now, lastTime: lastTime, enemies: enemies.length,
               towers: towers.length, bullets: bullets.length };
    },

    // ---- the deletion ----------------------------------------------------

    // Empty the subject. `resetFx` decides whether the FX modules are also
    // reset, and BOTH variants are measured on purpose:
    //
    //   plain  -- exactly what was asked: enemies and towers emptied, nothing
    //             else touched.
    //   reset  -- the same, plus BlubFXSystems / EnemyWreck reset.
    //
    // They can differ, and the difference is a real trap rather than a
    // pedantry: drawWorld() runs BlubFXSystems.update() and EnemyWreck.update()
    // every frame, and both work by DIFFING which bodies are still standing
    // against which were standing last frame. Emptying the arrays therefore
    // looks to them like every flier crashing and every blub dying at once, and
    // the "subject removed" frame can come back carrying a screen full of
    // wreck and splatter FX -- i.e. MORE ink than the frame it was supposed to
    // be the absence of. Measuring both is the only way to know whether that
    // happened here instead of assuming either way.
    removeSubject: function (resetFx) {
      HeroRig._stashE = enemies.slice();
      HeroRig._stashT = towers.slice();
      HeroRig._stashB = bullets.slice();
      enemies.length = 0;
      towers.length = 0;
      var did = [];
      if (resetFx) {
        if (typeof BlubFXSystems !== "undefined" && BlubFXSystems.reset) { BlubFXSystems.reset(); did.push("BlubFXSystems"); }
        if (typeof BlubFXShots !== "undefined" && BlubFXShots.reset) { BlubFXShots.reset(); did.push("BlubFXShots"); }
        if (typeof BlubFXCircles !== "undefined" && BlubFXCircles.reset) { BlubFXCircles.reset(); did.push("BlubFXCircles"); }
        if (typeof EnemyWreck !== "undefined" && EnemyWreck.reset) { EnemyWreck.reset(); did.push("EnemyWreck"); }
      }
      return { enemies: enemies.length, towers: towers.length,
               bullets: bullets.length, fxReset: did };
    },

    restoreSubject: function () {
      enemies.length = 0; towers.length = 0; bullets.length = 0;
      var i;
      for (i = 0; i < HeroRig._stashE.length; i++) enemies.push(HeroRig._stashE[i]);
      for (i = 0; i < HeroRig._stashT.length; i++) towers.push(HeroRig._stashT[i]);
      for (i = 0; i < HeroRig._stashB.length; i++) bullets.push(HeroRig._stashB[i]);
      return { enemies: enemies.length, towers: towers.length, bullets: bullets.length };
    },

    // Where the subject actually is, in world coordinates -- so the close
    // camera is aimed at the bodies rather than at a guessed point.
    subjectCentroid: function () {
      var n = 0, sx = 0, sy = 0;
      var i;
      for (i = 0; i < enemies.length; i++) { sx += enemies[i].pos.x; sy += enemies[i].pos.y; n++; }
      for (i = 0; i < towers.length; i++) { sx += towers[i].x; sy += towers[i].y; n++; }
      return n ? { x: sx / n, y: sy / n, n: n } : null;
    },

    counts: function () {
      var r = World3D.renderer();
      return { enemies: enemies.length, towers: towers.length, bullets: bullets.length,
               drawCalls: r.drawCalls, triangles: r.triangles,
               gameOver: gameOver, screen: screen, paused: paused,
               waveIndex: waveIndex, now: worldRenderState().now };
    },

    dropCaps: function () {
      for (var k in caps) delete caps[k];
      for (var s in scaled) delete scaled[s];
      return "dropped";
    }
  };

  window.HeroRig = HeroRig;
  return "HeroRig installed";
})();
