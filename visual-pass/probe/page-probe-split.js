// ---------------------------------------------------------------------------
// THE THREE-WAY SPLIT: gained / vacated / recoloured.
//
// A changed-pixel count treats a pixel that MOVED THE OUTLINE and a pixel that
// merely CHANGED VALUE as the same event. At 22 px the eye takes outline first
// and interior value second, and in motion almost only outline -- so a count
// ranks a recolour and a silhouette change equally when they are not equal.
//
//   gained     board in A, body in B   -- the outline grew
//   vacated    body in A, board in B   -- the outline shrank
//   recoloured body in both, value differs
//
// Membership is decided against an EMPTY-board frame, so "body" means "differs
// from the board with nothing on it" rather than a guessed box.
//
// gained + vacated is the silhouette change and is what separation should be
// ranked on. `changed` (= all three) stays reported, because it is the right
// instrument for "did anything change at all" and the wrong one for "is this a
// separator".
// ---------------------------------------------------------------------------
(function () {
  "use strict";
  var TDProbe = window.TDProbe;

  TDProbe.split = function (aKey, bKey, emptyKey) {
    var A = TDProbe.frames[aKey], B = TDProbe.frames[bKey], E = TDProbe.frames[emptyKey];
    if (!A || !B || !E) throw new Error("missing frame");
    var gained = 0, vacated = 0, recoloured = 0;
    var bodyA = 0, bodyB = 0, sumDelta = 0;
    for (var i = 0; i < A.length; i += 4) {
      var inA = (A[i] !== E[i] || A[i + 1] !== E[i + 1] || A[i + 2] !== E[i + 2]);
      var inB = (B[i] !== E[i] || B[i + 1] !== E[i + 1] || B[i + 2] !== E[i + 2]);
      if (inA) bodyA++;
      if (inB) bodyB++;
      if (!inA && inB) { gained++; continue; }
      if (inA && !inB) { vacated++; continue; }
      if (inA && inB) {
        var d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]),
                         Math.abs(A[i + 2] - B[i + 2]));
        if (d > 0) { recoloured++; sumDelta += d; }
      }
    }
    var silhouette = gained + vacated;
    return {
      gained: gained, vacated: vacated, recoloured: recoloured,
      silhouettePx: silhouette,
      changedPx: silhouette + recoloured,
      bodyA: bodyA, bodyB: bodyB,
      meanRecolourDelta: recoloured ? +(sumDelta / recoloured).toFixed(1) : 0,
      silhouetteShare: (silhouette + recoloured)
        ? +(silhouette / (silhouette + recoloured)).toFixed(3) : 0
    };
  };
})();
