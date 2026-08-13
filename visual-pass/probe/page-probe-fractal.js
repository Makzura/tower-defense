// ---------------------------------------------------------------------------
// TDFractal -- the in-page half of the Stacker tier-stencil probe.
//
// Loaded AFTER page-probe.js and depends on it. Not part of the game, never
// referenced by index.html, never writes a game file.
//
// THE QUESTION. js/enemy.js:2252 draws `ctx.fillText("T" + this.fractalTier)`
// in rgba(13,64,47,0.82). The lore card calls that number the tier separator.
// Is it on screen in the game we ship?
//
// THE EXPERIMENT. The narrowest possible difference: wrap
// CanvasRenderingContext2D.prototype.fillText and skip ONLY calls whose string
// matches /^T\d$/. Two captures of one unchanged scene then differ in that one
// fillText call and in nothing else -- same enemy object, same lane, same
// progress, same tier, same camera, same frame. Deleting the enemy, or
// comparing two tiers, or comparing 2D against 3D, all differ in more than the
// stencil and none of them can carry the claim.
//
// A ZERO IS ONLY EVIDENCE IF THE SAME COMPARISON RETURNS NON-ZERO SOMEWHERE.
// So the identical suppression runs in the 2D fallback (must fire) and in the
// shipping 3D board (the question), in ONE browser launch, on the same object.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  if (typeof TDProbe === "undefined") throw new Error("page-probe.js must load first");

  var TIER_RE = /^T\d$/;
  var log = { calls: 0, tierCalls: 0, tierStrings: [], suppressed: 0 };

  var realFillText = CanvasRenderingContext2D.prototype.fillText;
  var suppressing = false;

  CanvasRenderingContext2D.prototype.fillText = function (s) {
    log.calls++;
    if (typeof s === "string" && TIER_RE.test(s)) {
      log.tierCalls++;
      if (log.tierStrings.indexOf(s) < 0) log.tierStrings.push(s);
      if (suppressing) { log.suppressed++; return; }
    }
    return realFillText.apply(this, arguments);
  };

  function uiFrame(key) { return TDProbe.frames["ui:" + key]; }

  var TDFractal = {

    // ---- the scene ------------------------------------------------------

    // Same discipline as TDProbe.place: lane pinned, ONE object kept for the
    // life of a comparison. The tier goes through the constructor because
    // `fractalSizeScale` is computed there from `fractalTier` and never
    // recomputed -- writing `fractalTier` alone gives a T5 number on a T1 body,
    // which is a scene the game can never produce and would make every
    // measurement taken on it unquotable.
    placeTier: function (typeId, progress, tier) {
      enemies.length = 0;
      var e = new Enemy(path, 100000, typeId, { routeId: 0, tier: tier });
      e.laneOffsetUl = 0;
      e.progress = progress;
      e.refreshPos();
      enemies.push(e);
      TDProbe._e = e;
      TDProbe._home = { x: e.pos.x, y: e.pos.y, progress: progress };
      return {
        typeId: e.typeId, tier: e.fractalTier, sizeScale: e.fractalSizeScale,
        radius: e.radiusPx(), pos: [e.pos.x, e.pos.y],
        maxHealth: e.maxHealth, health: e.health,
        modelRegistered: GLModels.has("enemy-" + e.typeId),
        // The two fields the drawing code reads, printed so a run can prove the
        // tier under test actually reached the renderer.
        fractalSpec: e.type.fractal ? {
          minSizeScale: e.type.fractal.minSizeScale,
          sizeStep: e.type.fractal.sizeStep
        } : null
      };
    },

    // Put a body at the SAME point of its own bounce cycle at any tier.
    //
    // The sphere path's squash is `Math.abs(Math.sin(progress/stride*2pi))` and
    // `stride = radiusPx()*2.6` -- so `stride` is itself a function of tier. Two
    // tiers held at one progress therefore sit at DIFFERENT points of the
    // bounce, and a T4-vs-T5 diff taken that way is scale plus bounce phase
    // with no way to separate them. Holding the FRACTION of a stride equal
    // instead makes the pair differ in size alone. `yaw` still moves with
    // progress (gl-world recomputes it from tangentAt every draw), so it is
    // returned here and the caller runs the fixed-tier control that measures
    // what that alone is worth.
    phaseAt: function (frac) {
      var e = TDProbe._e;
      var stride = e.radiusPx() * 2.6;
      var base = Math.round(TDProbe._home.progress / stride) * stride;
      e.progress = base + frac * stride;
      e.pos.x = TDProbe._home.x;
      e.pos.y = TDProbe._home.y;
      return { progress: e.progress, stride: stride,
               phaseFrac: (e.progress / stride) % 1,
               yaw: TDProbe.yawAt(e.progress) };
    },

    hurt: function (frac) {
      var e = TDProbe._e;
      e.health = e.maxHealth * frac;
      return { health: e.health, maxHealth: e.maxHealth,
               hurt: e.health < e.maxHealth };
    },

    // ---- the seam under test --------------------------------------------

    suppressTierText: function (on) {
      suppressing = !!on;
      return { suppressing: suppressing };
    },

    resetLog: function () {
      log.calls = 0; log.tierCalls = 0; log.suppressed = 0;
      log.tierStrings = [];
      return "reset";
    },

    // Call counts over the draws since the last reset. `tierCalls` answers a
    // different question from any pixel count: it says whether the shipped
    // fillText ran AT ALL. A pixel zero plus a call zero is "the code never
    // executed"; a pixel zero with a non-zero call count would be "it drew and
    // something covered it", and those need opposite responses.
    log: function () {
      return { fillTextCalls: log.calls, tierTextCalls: log.tierCalls,
               tierStrings: log.tierStrings.slice(), suppressed: log.suppressed };
    },

    // Count the tier-text calls made by exactly ONE draw of the real game.
    callsInOneDraw: function () {
      TDFractal.resetLog();
      draw();
      return TDFractal.log();
    },

    // ---- the ink ---------------------------------------------------------

    // IS THE INK THE AUTHORED COLOUR? Solved, not eyeballed.
    //
    // For every pixel that differs between the stencil-on and stencil-off
    // frames, the on-pixel must be the off-pixel composited under a source of
    // colour `ink` at some alpha:  on = a*ink + (1-a)*off.  Each channel gives
    // its own estimate of `a`; a genuine composite of THAT ink agrees across
    // all three, an unrelated difference does not. So this returns the spread
    // between the three per-channel alphas as the residual, and the largest
    // alpha found -- which for a fully-covered glyph interior must approach the
    // authored 0.82.
    //
    // Run it a second time against a DIFFERENT ink and it must fail. An ink
    // test that cannot be shown to reject is not a test.
    inkFit: function (onKey, offKey, roi, ink) {
      var a = uiFrame(onKey), b = uiFrame(offKey);
      if (!a || !b) throw new Error("missing ui frame " + onKey + "/" + offKey);
      var c = document.getElementById("game"), w = c.width, h = c.height;
      var x0 = Math.max(0, roi[0] | 0), y0 = Math.max(0, roi[1] | 0);
      var x1 = Math.min(w, x0 + (roi[2] | 0)), y1 = Math.min(h, y0 + (roi[3] | 0));
      var n = 0, fitted = 0, maxAlpha = 0, sumRes = 0, worstRes = 0;
      var samples = [];
      for (var yy = y0; yy < y1; yy++) {
        for (var xx = x0; xx < x1; xx++) {
          var i = (yy * w + xx) * 4;
          if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue;
          n++;
          // Per-channel alpha, only from channels where the background and the
          // ink are far enough apart for the division to mean anything.
          var alphas = [], k;
          for (k = 0; k < 3; k++) {
            var bg = b[i + k], on = a[i + k], src = ink[k];
            if (Math.abs(bg - src) < 24) continue;
            alphas.push((bg - on) / (bg - src));
          }
          if (alphas.length < 2) continue;
          var lo = Math.min.apply(null, alphas), hi = Math.max.apply(null, alphas);
          var mid = alphas.reduce(function (s, v) { return s + v; }, 0) / alphas.length;
          var res = hi - lo;
          sumRes += res; if (res > worstRes) worstRes = res;
          if (res <= 0.12 && mid > 0.02 && mid <= 1.05) {
            fitted++;
            if (mid > maxAlpha) maxAlpha = mid;
          }
          if (samples.length < 6) {
            samples.push({ xy: [xx, yy], on: [a[i], a[i + 1], a[i + 2]],
                           off: [b[i], b[i + 1], b[i + 2]],
                           alpha: +mid.toFixed(3), spread: +res.toFixed(3) });
          }
        }
      }
      return { ink: ink, differing: n, fitted: fitted,
               fittedFraction: n ? +(fitted / n).toFixed(3) : 0,
               maxAlpha: +maxAlpha.toFixed(3),
               meanSpread: n ? +(sumRes / n).toFixed(3) : 0,
               worstSpread: +worstRes.toFixed(3),
               roi: roi, samples: samples };
    },

    // ---- silhouette set algebra, for the containment question -------------
    //
    // The prediction under test says a smaller tier's silhouette is CONTAINED
    // in the larger's, because both are the same object scaled about the ground
    // contact -- and that if so, separation = 2(k^2-1)/(k^2+1) with no camera
    // involved. Containment is a claim about SETS, so it is measured as one:
    // build each body's silhouette from its own body-vs-empty diff and count
    // the leak |A \ B| directly. Nothing here is inferred from a ratio.
    //
    // It also splits the changed-pixel metric in two, which is the part the
    // algebra silently assumes away. A diff counts pixels whose COLOUR moved,
    // and inside the region both bodies cover, a rescaled sphere is shaded
    // differently at every pixel -- so the metric sees the overlap as well as
    // the rim. Those are separated here and reported apart, because a formula
    // built on symmetric difference cannot be compared against a number that
    // contains both.
    glMask: function (bodyKey, emptyKey, name) {
      var a = TDProbe.frames[bodyKey], b = TDProbe.frames[emptyKey];
      if (!a || !b) throw new Error("missing gl frame " + bodyKey + "/" + emptyKey);
      var m = new Uint8Array(a.length / 4), n = 0;
      for (var p = 0, q = 0; q < a.length; q += 4, p++) {
        if (a[q] !== b[q] || a[q + 1] !== b[q + 1] || a[q + 2] !== b[q + 2]) {
          m[p] = 1; n++;
        }
      }
      TDProbe.frames["fmask:" + name] = m;
      return { name: name, px: n };
    },

    setStats: function (nameA, nameB, frameA, frameB) {
      var A = TDProbe.frames["fmask:" + nameA], B = TDProbe.frames["fmask:" + nameB];
      var fa = TDProbe.frames[frameA], fb = TDProbe.frames[frameB];
      if (!A || !B) throw new Error("missing mask");
      if (!fa || !fb) throw new Error("missing frame");
      var onlyA = 0, onlyB = 0, both = 0, a = 0, b = 0;
      var changedInBoth = 0, changedTotal = 0, changedOutside = 0;
      for (var p = 0; p < A.length; p++) {
        var ia = A[p], ib = B[p];
        if (ia) a++;
        if (ib) b++;
        if (ia && ib) both++;
        else if (ia) onlyA++;
        else if (ib) onlyB++;
        var q = p * 4;
        var moved = fa[q] !== fb[q] || fa[q + 1] !== fb[q + 1] || fa[q + 2] !== fb[q + 2];
        if (moved) {
          changedTotal++;
          if (ia && ib) changedInBoth++;
          else if (!ia && !ib) changedOutside++;
        }
      }
      return {
        a: a, b: b, intersection: both, onlyA: onlyA, onlyB: onlyB,
        symmetricDifference: onlyA + onlyB,
        // The containment claim, stated as a number. If A (the smaller) is
        // inside B, onlyA is 0.
        leakOfAOutsideB: onlyA,
        containedFraction: a ? +(1 - onlyA / a).toFixed(4) : 0,
        changedTotal: changedTotal,
        changedInsideIntersection: changedInBoth,
        changedOutsideBothMasks: changedOutside,
        // What share of the metric is shading inside the overlap rather than
        // silhouette. The formula accounts for none of it.
        shadingShareOfMetric: changedTotal
          ? +(changedInBoth / changedTotal).toFixed(4) : 0,
        intersectionRepaintedFraction: both
          ? +(changedInBoth / both).toFixed(4) : 0
      };
    },

    // Where js/enemy.js WOULD put the glyph, in flat-board screen coordinates,
    // from the shipped expression. Reported so an absence can be checked
    // against the right place rather than against a guess.
    stencilPointFlat: function () {
      var e = TDProbe._e;
      var r = e.radiusPx();
      return { x: e.pos.x, y: e.visualBodyY() + r * 0.22,
               radius: r, font: Math.max(7, r * 0.62),
               bodyY: e.visualBodyY() };
    }
  };

  window.TDFractal = TDFractal;
  return "TDFractal installed";
})();
