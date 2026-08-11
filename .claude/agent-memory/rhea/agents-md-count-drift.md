---
name: agents-md-count-drift
description: AGENTS.md states suite counts in two places that disagree with each other and with reality; CHANGELOG lags commits. Which parts to trust.
metadata:
  type: project
---

# AGENTS.md states the suite counts twice, and the two disagree

Found 2026-08-11. Nothing has been fixed — the baseline job was measurement
only. This is petra work when it is commissioned.

**Location 1 — the baseline block (~line 110).** `105/3`, `182/30`, `70/1`,
`45/0`, `47/0`, sandbox `2 failures`.

**Location 2 — the file inventory (~lines 475-477).** A second set of counts:

```
tests/long-range-dps.test.js         54 tests
tests/beam.test.js                   42 tests
tests/blub.test.js                   46 tests
```

Measured reality is 71, 45 and 53. So blub is stated as **46** in one place,
**47** four hundred lines away, and is actually **53**. Three numbers, one file.

**Why this matters more than the arithmetic:** `CLAUDE.md` was deliberately
reduced to a pointer because two copies of the truth drift apart. The same
failure is now happening *inside a single document*. When correcting it, prefer
deleting the second inventory over updating it — a number that exists in two
places will diverge again.

## What to trust in that block

- **Totals: trust them.** Five of six were exactly right on 2026-08-11.
- **The narrative characterizations: trust them.** "The three core failures, the
  Longshot failure and both Sandbox failures are Arcane-Sniper B5 drift" is
  precisely correct, name for name.
- **The bulleted "known examples": do not trust them.** Two of the named
  examples pass and provably passed when the block was written. Details in
  [[test-baseline-history]].

## CHANGELOG lag

On 2026-08-11 the newest `CHANGELOG.md` entry was at commit `db570ad`, with
**8 later commits** touching `TD_0.5.0/js`, `index.html` and `sandbox.html`
unrecorded — including the 3D build-bar/armoury previews and the `monsterTier`
draw fix. The file's own header says "Add an entry here for every change."
