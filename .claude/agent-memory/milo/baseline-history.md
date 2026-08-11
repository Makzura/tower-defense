---
name: baseline-history
description: Dated record of every measured change to the six-suite baseline, with cause and the failure names that moved
metadata:
  type: project
---

# Suite baseline history

Each entry: date measured, what moved, cause, and the failure NAMES that
changed. Totals alone are never sufficient — see [[diff-names-not-totals]].

## 2026-08-12 (measured by milo, spot check for rhea, HEAD 77a7865)

`content.test.js` only: **182 passed, 30 failed, exit 1**. Total unchanged
*and* all 30 failure names identical to 2026-08-11. Nothing moved.

Sharpened two entries in the standing content group, both examined at source:

- `the Tyrant's numbers are the ones that were asked for` (l.498) and
  `the roar shields it, speeds it up, and calls the wave back` (l.570) fail on
  the 2026-08-01 boss retune — shield 200 vs shipping 1000, leap 50 vs 90,
  post-roar interval 6 vs 9. Balance ruling pending with **nadia**; not mine.
- **Ruled 2026-08-12: the code is canonical, the tests are one retune behind.**
  Not drift, not a regression, and not mine to fix. Full detail and the exact
  expected deltas in [[tyrant-test-vs-code]].
- The roar test *additionally* throws `TypeError` at l.601 because
  `Enemy.TYPES.boss` has key `attacks` (array) and **no key `attack`**. That is
  test-side and independent of any balance ruling — restoring the old numbers
  would not stop it. Probed: the invariant l.601 means to guard (the shared
  TYPE row must not be mutated by the roar) actually **holds**, so the throw
  masks nothing.

## 2026-08-11 (measured by milo, daily check)

Measured, from `TD_0.5.0/`, node v24.19.0:

```
tests/run.js                 105 pass /  3 fail  total 108  exit 1
tests/content.test.js        182 pass / 30 fail  total 212  exit 1
tests/long-range-dps.test.js  70 pass /  1 fail  total  71  exit 1
tests/beam.test.js            45 pass /  0 fail  total  45  exit 0
tests/blub.test.js            53 pass /  0 fail  total  53  exit 0
tests/sandbox.smoke.js       150 ok  /  2 FAILED total 152  exit 1
```

**No failure name moved in any suite.** All six ran to completion.

**The one discrepancy is documentation, not code: blub prints 53, AGENTS.md
says 47.** Established by git, not by assumption:

- `tests/blub.test.js` was created in `0b0a79f` (2026-08-10, +1295 lines) and
  has **53** `test(` declarations.
- `e3bd3f4` (2026-08-10 16:45) only *renamed* it into `TD_0.5.0/tests/` —
  `--stat` shows 0 changed lines.
- Working tree is clean and byte-identical to `0b0a79f` modulo CRLF.

So the file has never produced 47. The `47 pass / 0 fail` line was wrong the
day it was written. It is not new coverage and not a regression.

The same AGENTS.md inventory block (~line 477) is stale in three more places:
long-range-dps "54 tests" (actual 71), beam "42 tests" (actual 45), blub
"46 tests" (actual 53). Note it also contradicts itself — 46 tests vs 47 pass
on the same file. Archivist (petra) work, not a test fix.

## 2026-08-10 (recorded in AGENTS.md, not measured by me)

Documented baseline after the Summoner landed. Content dipped to 181/31 during
2026-08-09 and returned; both halves were real bugs — Summoner path B stopped
at B3, and a first assertion had been asserting the **Warbringer** has no
upgrade tree ever since the gunner was deleted on 2026-07-30 and the roster
shifted a slot. That second one is the canonical example of why names beat
totals.

## Standing failure groups (stable, all pre-existing)

- **Arcane Sniper B5 ability/effect timing drift** — 3 in run.js, 1 in
  long-range-dps, both sandbox failures. One group, six names.
- **content.test.js** — that same group plus older schedule, boss, price and
  fixture drift. Several are test-side, not code-side: five throw
  `ReferenceError: w is not defined` or read a property off `undefined`, which
  is a broken fixture rather than a simulation bug.
