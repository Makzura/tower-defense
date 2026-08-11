---
name: siphon-chan-ease-double-step
description: tower._chanEase is mutated per call and now has two callers per rendered frame — the memo guard in SiphonFXBeam.animFrame is load-bearing
metadata:
  type: project
---

`SiphonFXBeam.animFrame(tower, now, frameCount)` is the ONE place the Siphon's
animation frame is derived (added 2026-08-12). It is called at least twice per
rendered frame: once from `gl-world.js`'s tower loop (the GL body pass) and once
from `SiphonFXBeam.draw` (the overlay pass, which needs the frame to read the
ring's origin).

`tower._chanEase` — the ease toward "he is channelling", 0.06 per step — is
MUTATED inside it. A naive implementation steps once per caller, so the spin-up
runs at twice its designed rate. The step is memoised on `tower._chanStamp`
keyed by `now`; the frame index itself is NOT cached, so two callers holding
models with different frame counts each get a right answer.

**Why:** a 0.4 s ramp measured at 0.2 s still looks like an ease. Nobody
reports it.

**How to apply:** never add a third caller that steps the ease itself, and never
write a fallback copy of the formula into `gl-world.js` — without the module the
body correctly holds frame 0.

**How to test it.** Reset `_chanEase = 0`, hold a lock, run K rendered frames
(step the clock AND draw each time), read the ease. One step per frame gives
`1 - 0.94^K`; double gives `1 - 0.94^(2K)`. Measured at K = 20: 0.709894 (single)
vs 0.915838 (double). Unambiguous.

Related: [[siphon-origin-plumbing]], [[visual-pass-rig-traps]].
