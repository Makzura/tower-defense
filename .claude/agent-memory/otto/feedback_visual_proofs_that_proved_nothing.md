---
name: visual-proof-that-proved-nothing
description: The running list of visual tests on this project that looked convincing and demonstrated nothing — read before designing a rendering proof
metadata:
  type: feedback
---

Keep adding to this. It is worth more than the list of successes.

**Rule: a rendering claim needs a pixel diff between two states that differ ONLY
in the thing being claimed, plus the negative case.**

**Why:** every entry below was a test someone would have accepted.

**How to apply:** before running a visual test, ask what ELSE differs between
the two captures, and what a broken-in-the-opposite-direction implementation
would photograph as.

Proved nothing, and why:

- **Deleting the blocking tower to test occlusion.** The two frames then differ
  by a whole tower. Use a module flag that turns the predicate off and leaves
  the scene identical (`SiphonFXBeam.setOcclusion(false)`). Kaz asked for this
  export specifically so he could verify independently.
- **Sampling near an occluder's feet.** The base-depth compare happens to be
  fair there, so every assertion passes while the cord still shows through the
  chest and head. See [[gl-overlay-occlusion-facts]].
- **Testing only that the cord disappeared.** Over-occlusion is the easiest way
  to "fix" occlusion and it looks identical to success. Always also prove a cord
  genuinely IN FRONT of a body is still fully drawn, with the body's screen box
  actually covering it — otherwise the negative case is vacuous.
- **Checking only the core layer.** The core can be clipped while the halo, rim
  or knots still paint through. The strong form: diff the occluded region
  against a frame where the whole effect module is stubbed to a no-op. Equal
  means no layer leaked.
- **Reading a per-frame value in a fallback state.** With
  `SiphonBeamSpec.originFrames` absent the static fallback renders a perfectly
  plausible cord, so "the origin looks right" is true whether or not the new
  code path runs at all. Inject a synthetic table at RUNTIME (never edit the
  generated file) whose values are wildly separated, so the frame index is
  recoverable from the measurement. Export an `originAnimated()`-style flag so a
  test can assert which path it measured.
- **Judging animation from stills.** Frames individually plausible, wrong in
  order. Record the whole cycle as a sequence and check monotonicity and wrap.
- **A 300x150 canvas.** `#game` sits at the HTML default while CSS stretches it;
  every overlay lands off the bitmap and photographs as "not wired up". Size it
  before booting.

Related: [[visual-pass-rig-traps]].
