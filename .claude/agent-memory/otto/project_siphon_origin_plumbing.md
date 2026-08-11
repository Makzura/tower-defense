---
name: siphon-origin-plumbing
description: The Siphon beam origin has three derivations across two live files; siphon-ritual.js used to discard the authoritative one — fixed 2026-08-12, and the shape of that bug is the thing to remember
metadata:
  type: project
---

The Siphon's beam origin (the hands, or the sceptre ring from A3) is derived in
more than one place. As of 2026-08-12:

1. `js/gl/siphon-beam-draw.js` — `originPoint(tower, frame)` / `originWorld`.
   **The authoritative one.** Frame-aware, reads `SiphonBeamSpec.originFrames`.
2. `js/gl/siphon-ritual.js:374-380` — a private static `originPoint(tower)` with
   no frame parameter, plus its own `originWorld`. **Fallback only**, reached
   when `SiphonFXBeam` is absent.
3. `js/towers/beam-adapter.js` — `BeamTower.prototype.spoutPoint`, `{x, y}` with
   no z, only called from the 2D `draw()` that 3D never invokes. Dead for
   rendering. AGENTS.md's "Siphon beam origin" row still points here; a
   correction was routed to petra.

**The bug that was there, and why it is worth remembering.** `plan()` installed
the handed-over origin at :660-662 under a comment calling it authoritative,
then `advance()` overwrote `rec.ox/oy/oz` three lines later at :466 from copy 2.
The assignment survived three lines. Invisible for as long as both copies were
static and agreed.

**Why:** a silent discard downstream of correct wiring reads as working. The
generator, the spec table and `originPoint` were all right and all thrown away.

**How to apply:** when plumbing a value through a seam, measure it at the far
end, not at the hand-off. The hand-off logged perfectly. Fixed by stamping
`rec.handed = now` in `plan()` and guarding :466 with `if (rec.handed !== now)`
— the local copy becomes the fallback rather than the winner.

**The measurement that found it and the one that closed it** (A5, one full
cycle, real table): origin handed in travels 7.315 px. Cord root actually drawn:
0.799 px before, **6.767 px after**, correlation 0.9971, root-minus-origin
varying only 0.96 px across the cycle (that residual is the ritual circle's
breathe, `1 + 0.028 sin`, and is correct). Fallback checked separately with the
beam module's draw stubbed: circle still placed at (266.1, 350, 37.8) for a
tower at (250, 350), not collapsed to the world origin.

Related: [[siphon-tier-key-case-split]], [[gl-overlay-occlusion-facts]],
[[visual-proof-that-proved-nothing]].
