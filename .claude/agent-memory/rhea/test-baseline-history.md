---
name: test-baseline-history
description: Dated history of the six-suite baseline, each shift with its cause. Start here before re-running anything.
metadata:
  type: project
---

# Baseline history

The authoritative name-level baseline. `AGENTS.md` records totals only (and one
of them is wrong), so this file is the thing to diff against. See
[[known-failure-taxonomy]] for the failure names themselves.

## 2026-08-11 (measured by milo, verified by me, at commit `77a7865`)

```
node tests/run.js                 105 pass /  3 fail   (108 total, exit 1)
node tests/content.test.js        182 pass / 30 fail   (212 total, exit 1)
node tests/long-range-dps.test.js  70 pass /  1 fail   ( 71 total, exit 1)
node tests/beam.test.js            45 pass /  0 fail   ( 45 total, exit 0)
node tests/blub.test.js            53 pass /  0 fail   ( 53 total, exit 0)
node tests/sandbox.smoke.js       150 ok   /  2 FAILED (152, exit 1)
```

Node v24.19.0. Run from the `TD_0.5.0/` project folder. Working tree clean.
No regression. Five of six match the 2026-08-10 documented totals exactly.

**Why the sandbox 150 is soft:** the suite prints `2 FAILED` and no pass count.
150 is a count of its `ok` lines, not a number the harness claims. Do not put it
in `AGENTS.md` as though the suite reported it.

## The one shift: blub 47 -> 53, and it was never real

`AGENTS.md` says blub is `47 pass / 0 fail`. It measures 53/0. This is a
**transcription error in the document, not new coverage and not a regression.**
Proven from git, not inferred:

- `tests/blub.test.js` has 53 `test(` declarations, all at column 0, none
  nested, none inside a loop or an `if` — so the suite can only ever report 53.
- At commit `0b0a79f` — *the same commit that wrote the string `47 pass` into
  `AGENTS.md`* — the file already had 53 declarations. The number was wrong the
  day it was typed.
- `e3bd3f4` only renamed the file into `TD_0.5.0/tests/` (zero changed lines).

**The counting method that proved it:** `grep -cE '^test\(' <suite>`. It
reproduces run.js (108), content (212) and beam (45) totals exactly, which is
what makes it trustworthy. It does *not* work for `long-range-dps.test.js` —
63 static vs 71 measured, because that suite generates tests inside loops.
Check for `^\s+test\(` before trusting a static count.

## Two documented failures that are actually passing

Caught by diffing names, which is the entire reason for the rule:

- `run.js` — `a mixed wave deploys its groups in order, each at its own spacing`
- `content.test.js` — `the enemy tab covers the roster with derived wave appearances`

`AGENTS.md` describes both as current known failures. Both print `ok`.

**They were already passing on 2026-08-10.** `tests/` is byte-identical between
the baseline commit `e3bd3f4` and `77a7865`, and the only non-rendering game
change in that window is two guarded `TowerPreview3D.draw(...) || drawIcon(...)`
fallbacks in `js/game.js` and `js/store.js` — drawing code that cannot touch a
wave schedule or a codex ceiling. So the totals in `AGENTS.md` were right and
its prose examples were stale when written. See [[agents-md-count-drift]].
