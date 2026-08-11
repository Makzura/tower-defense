---
name: visual-pass-rig-traps
description: How to drive the real game for pixel readback — paths, service ports, boot order, and the traps that silently invalidate a capture
metadata:
  type: reference
---

**Where.** Working copy `C:\Users\Superuser\Downloads\TD_0.5.1`, game under
`TD_0.5.0\`. Harness `visual-pass\harness.js` is a SIBLING of `TD_0.5.0`, not
inside it. Ignore any `.claude\worktrees\` copy — stale.

**Served over HTTP, not `file://`** — the preview pane silently ignores reloads
on `file://`. `http://127.0.0.1:8792/TD_0.5.0/index.html`; harness at
`/visual-pass/harness.js`. Capture sink on 8765. An autopush watchdog commits
and pushes every 90 s, so never leave the tree broken between edits.

**Boot order that actually works:**

1. `resize_window` to 1280x720 FIRST. `#game` otherwise sits at 300x150 while
   CSS stretches it and every overlay draws off the bitmap.
2. inject `/visual-pass/harness.js`, then `TDObs.boot()`.
3. `World3D.resize()` after boot — the GL canvas is installed against a zero
   rect and stays 1x1 otherwise.
4. **Stub `requestAnimationFrame` to a no-op.** The game's own loop IS alive in
   this pane; the camera eases back to the board default between tool calls, so
   anything measured across two calls measures a different frame than the one
   set up. After stubbing, three consecutive `draw()`s are bit-identical.
5. Set the camera IMMEDIATELY before each `draw()`, in the SAME call. `_eye` is
   only recomputed inside `camera.update()`, i.e. inside `draw()`.

**`TDObs.step(seconds, dt)` advances `lastTime` deliberately** — rAF is throttled
dead in a hidden pane and `worldRenderState().now` IS the rAF clock. One rendered
frame = `TDObs.step(1/60, 1/60)` then `draw()`. Do not "simplify" the clock away:
a frozen effect photographs identically to a correct rest pose.

**Placing a Siphon.** It is not in `BUILD_SLOTS` by default; construct
`new BeamTower(x, y, path)` and `addTower()`. `TDObs.maxPath(t, "a")` buys the A
path (A5 -> `column` state, range 182 px, gold `#C9A227` / `white_warm`
`#F0E2C0` — far easier to assert on than base `thread`, which is drab browns).

**Reinjecting a changed `js/gl/` file:** `TDObs.reinject(["js/gl/x.js"])`
rebuilds the world. Faster than a reload and keeps the frozen-rAF state.

Related: [[visual-proof-that-proved-nothing]], [[gl-overlay-occlusion-facts]].
