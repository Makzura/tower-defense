---
name: rig-traps-visual-pass
description: The four rig traps that silently produce fake-looking or fake-passing visual results in this repo's browser harness — zero viewport, camera reset, throttled rAF, file:// reloads
metadata:
  type: project
---

Driving the real game to get pixel evidence has four traps that each cost real
time and each produce a result that *looks* like a finding but is not one.

1. **The preview pane opens with a ZERO viewport.** Call `resize_window` to
   1280x720 *before* `TDObs.boot()`. Otherwise the 2D canvas stays at its
   300x150 default while CSS stretches it, and every overlay — ritual circle,
   beams, range rings — draws off the edge of the bitmap. The symptom reads as
   "the feature is unwired", which is the wrong conclusion.
2. **The camera resets during `TDObs.run()`.** Set `TDObs.cam()` *immediately*
   before `draw()`/`shot()`, never earlier in the sequence.
3. **rAF is throttled dead in a hidden pane**, and `worldRenderState().now` is
   the rAF clock. `visual-pass/harness.js step()` advances `lastTime` on purpose
   to compensate. Do not "simplify" that away or every time-driven FX freezes at
   its t=0 value — and a frozen FX photographs identically to a correct rest
   pose.
4. **Serve over HTTP, not `file://`.** The preview pane silently ignores reloads
   on `file://`. Static server on 8792, game at
   `http://127.0.0.1:8792/TD_0.5.0/index.html`. (The *game itself* must still
   run from `file://` — classic `<script>`, no fetch — this is only about the
   harness reload path.) Pass the static root with BACKSLASHES or every request
   403s on a `path.join` prefix check.

**Why:** all four fail *silently and plausibly*. A frozen animation, an
off-bitmap overlay and a reset camera all photograph as "looks fine, feature
missing" rather than as an error.

**How to apply:** before believing any negative visual result ("the effect does
not draw", "the animation is frozen"), rule out all four first. Before believing
a positive one, confirm the clock actually advanced between the two captures.

See [[visual-evidence-that-proves-nothing]] for the assertion-level version of
the same problem.
