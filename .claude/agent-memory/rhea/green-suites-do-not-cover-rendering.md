---
name: green-suites-do-not-cover-rendering
description: A matching baseline after a day of rendering commits is expected, not reassuring — the suites test simulation, not pixels. Never report it as verification.
metadata:
  type: feedback
---

Never let "the suites match the baseline" stand as evidence that rendering work
is correct. Say explicitly what the run did *not* cover.

**Why:** on 2026-08-11 the whole day's commits were rendering — 3D previews in
the build bar and armoury, Siphon and Summoner frame drivers, a `monsterTier`
draw fix — and every suite landed exactly on its documented numbers. That is
not a signal. The six suites drive `update()` against a stubbed canvas whose
context is a Proxy returning no-op functions for every call, so a draw call that
is wrong, or absent, is indistinguishable from one that is right. `AGENTS.md`
states the rule directly: visual claims need `getImageData` or `readPixels`
evidence, diffed — a screenshot glance proves nothing.

There is a second edge to this. `tests/harness.js` reads its script list out of
`index.html` (skipping `js/debug-*`), and `sandbox.smoke.js` does the same with
`sandbox.html`, so a newly added `<script>` is loaded by every suite
automatically. The 13 tags added on 2026-08-11 therefore *executed* under Node
without breaking anything. That proves they parse and do not throw at load. It
proves nothing whatsoever about what they draw.

**How to apply:** when a baseline comes back clean after visual work, report it
as "unchanged, and not evidence" in the same sentence, and name who owns the
real check — otto for GL runtime, suki for the model pipeline, kaz for the call.
Route the pixel verification rather than implying the green run covered it.

## The corollary that bites hardest: an UNWIRED file is invisible everywhere

Because the harness takes its script list from `index.html`, a file that is
never given a `<script>` tag is never loaded by any suite, never executed, and
never counted as missing. It cannot fail. It also tends not to reach `AGENTS.md`,
because the file map is written from what the page loads.

Found 2026-08-12 while reviewing the doc sweep: `js/gl/blub-hp.js`,
`js/gl/siphon-enemy-fx.js` and `js/gl/siphon-ground.js` are complete, carefully
authored effect modules (`BlubFXHealth`, `SiphonFXEnemy`, `SiphonFXGround`)
loaded by **no** HTML page — not `index.html`, `sandbox.html`, `3d.html` or
`long-range-dps-debug.html` — and referenced by no live code. Each contains its
own integration diff as a commented-out block, so the wiring was written and
never applied. Corroborated independently from kaz's Siphon handoff, which had
already described `siphon-ground.js` as dead.

**How to apply:** the cheap check is a set difference — every `js/**/*.js` on
disk against every `src=` in the HTML pages — and it takes one command. Run it
whenever rendering work has landed in a burst. "All suites green" says nothing
about a file no page loads, and neither does the file map.
