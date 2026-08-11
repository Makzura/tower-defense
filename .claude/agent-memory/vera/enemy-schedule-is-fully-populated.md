---
name: enemy-schedule-is-fully-populated
description: All 21 Enemy.TYPES are scheduled on all three difficulties; "normal" only looks unscheduled because 10 wave groups omit the type key. Audit the schedule by booting the harness, not by grepping.
metadata:
  type: project
---

Every one of the 21 entries in `Enemy.TYPES` reaches the player, on all three
difficulties. Nothing carries `sandboxOnly` any more.

**Why:** comments and docs have repeatedly claimed types are parked out of the
campaign. As of 2026-08-12 that is false in every instance found. The four
"v0.4.9" types are scheduled in `EASY_WAVES` at Shieldbearer 27, Camo Heavy 28,
Healer 32, Vanguard 34. Normal and Hard are *derived* from `EASY_WAVES` by
`buildDifficultyWaves` plus `NORMAL_WAVE_ADDITIONS` / `HARD_WAVE_ADDITIONS`, so
anything scheduled on Easy is scheduled everywhere; the additions only pull the
supports earlier.

**How to apply:**
- A naive audit reports `normal` as unscheduled. It is not: ten wave groups
  carry no `type` key at all and fall through to `Enemy.DEFAULT_TYPE`. Resolve
  `group.type || Enemy.DEFAULT_TYPE` before concluding anything, which is what
  `tests/run.js` → `every enemy type is scheduled, and every scheduled type
  exists` does. That test enforces **both** directions, despite comments that
  have claimed it only checks one.
- Do the audit by booting `tests/harness.js` in Node and walking
  `DIFFICULTIES[id].waves` through `waveGroups()`. Grepping `type: "..."` in
  `js/game.js` misses the typeless groups and the derived tables entirely.
- The midboss is wave 11 only, on all three difficulties (one body Easy, two
  Normal/Hard). Wave 9 is `armored`, which is the likely source of the
  long-lived "wave 9 midboss" error.
- Wave groups override type health **upwards**: the midboss type is 250 HP but
  wave 11 authors 420 on Easy. A type block's numbers are a floor, not what
  walks in.

Related: [[lying-comments-propagate-into-agents-md]].
