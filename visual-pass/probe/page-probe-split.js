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
// THERE WAS A meanRecolourDelta HERE AND IT IS DELETED, NOT FIXED.
//
// It reported the mean magnitude of the recolour and its SIGN WAS BACKWARDS:
// it fell as alpha fell, where the blend equation says the delta from opaque
// must grow. A wrong number with a caveat recorded somewhere else is worse
// than no number, because numbers travel and their caveats do not -- and a
// backwards sign looks like a finding rather than like noise.
//
// THE CAUSE IS STILL UNKNOWN, and two plausible diagnoses are both REFUTED by
// the ratios rather than merely unconfirmed:
//   board-referenced (juno)  would give mean proportional to alpha:
//     0.85 -> 0.40 should fall by 2.13x. Observed 24.7 -> 19.1 = 1.29x.
//   opaque-referenced        would give mean proportional to (1 - alpha):
//     it should GROW 4x. Observed falls.
// Neither fits, so this is an open instrument defect and not a diagnosed one.
//
// The worked check that IS correct, from raw pixel reads on one body pixel --
// board (21,45,60), opaque (90,100,118):
//     alpha 0.62 -> (64,79,96) delta 26
//     alpha 0.50 -> (55,72,89) delta 35
//     alpha 0.40 -> (48,67,83) delta 42
// Correct sign, and (1-alpha)*(opaque-board) to within a unit at each step.
// If the mean comes back it needs a control that would FAIL, like everything
// else here.
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
    var bodyA = 0, bodyB = 0;
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
        if (d > 0) { recoloured++; }
      }
    }
    var silhouette = gained + vacated;
    return {
      gained: gained, vacated: vacated, recoloured: recoloured,
      silhouettePx: silhouette,
      changedPx: silhouette + recoloured,
      bodyA: bodyA, bodyB: bodyB,
      silhouetteShare: (silhouette + recoloured)
        ? +(silhouette / (silhouette + recoloured)).toFixed(3) : 0
    };
  };
})();
