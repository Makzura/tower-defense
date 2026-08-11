---
name: siphon-lot-dead-modules
description: Three finished GL effect modules (siphon-ground, siphon-enemy-fx, blub-hp) are loaded by no HTML page and called by no live code — and blub-hp's documented blocker is now stale
metadata:
  type: project
---

`js/gl/siphon-ground.js`, `js/gl/siphon-enemy-fx.js` and `js/gl/blub-hp.js` are
complete, heavily documented effect modules that **no HTML page loads and no
live code calls**. Their wiring instructions exist only as commented-out blocks
inside themselves. Confirmed 2026-08-12 against all four pages (`index.html`,
`3d.html`, `sandbox.html`, `long-range-dps-debug.html`) and `tests/`.

They are invisible to all six suites because `visual-pass/harness.js` reads its
script list from `index.html`.

They are three different situations, and the difference is what matters:

- **`siphon-ground.js`** — dead, but its `buildOccluders`/`occluded` pair is a
  working screen-space occlusion reference. Do not copy its
  `dx*dx+dy*dy > 4900` (70 px) proximity gate: it is scoped to a decal under
  the tower's own feet and would exempt nearly every occluder a long cord
  crosses.
- **`siphon-enemy-fx.js`** — complete, states no blocker, and the simulation
  hooks it reads (`enemy.slowMultiplier`, `enemy.slowTimer`) are live. Wireable
  as-is.
- **`blub-hp.js`** — was written *blocked*, and says so at length. **Its stated
  blocker is now stale.** It claims every blub model has `frames: []` and one
  unnamed group, so `drawActor`'s per-group `overrides` path is unreachable.
  Since the blub animation work the models carry 9–17 frames and named groups
  (`body`, and `arms`/`body`/`lance` on superb), and `drawActor` multiplies
  `overrides[grp.name]` onto the pose as a full 4x4 — so a non-uniform squash
  would now survive. Residual gap: `blub-hungry` still has an unnamed group at
  index 0, which a name-keyed override cannot address.

**Why:** whether these are abandoned or unfinished-and-wanted is Diego's call,
not the rendering lot's, and the answer differs per module.

**How to apply:** do not wire any of them as a side effect of other work. If
asked to revive one, re-verify the blocker claims in its header first —
`blub-hp.js` proves those headers go stale silently.
