---
name: test-baselines-compare-by-name-not-total
description: The six-suite baseline is 36 known failures; the per-file totals are easy to mis-assign, so compare failure names. Recorded name list as of 2026-08-12.
metadata:
  type: project
---

The six suites carry 36 known failures. Compare them **by name**, never by
total.

**Why:** a regression once hid inside an unchanged total here. Separately, the
totals get mis-assigned when quoted as a bare list — a brief on 2026-08-12 gave
"70/1, 45/0, 53/0" for beam / blub / long-range-dps, and the true mapping is
beam 45/0, blub 53/0, long-range-dps 70/1. The multiset matched, so nothing
looked wrong. Two files could swap results without the list changing.

**How to apply:** run each suite and diff this list. Measured 2026-08-12 at
commit `6358cb8`, on `visual-pass`.

- `tests/run.js` — 105 pass, 3 fail: `the Arcane Sniper B5 ability counts its
  landed damage and kills`; `Warbringer swings and Arcane Sniper B5 both respect
  slime AoE resistance`; `both AoE towers emit replaceable impact effects`.
- `tests/content.test.js` — 182 pass, 30 fail. Three clusters, no strays: the
  six Tyrant/roar/stun tests, one `every tower type answers the health
  contract`, and the rest the Soldier and Longshot panel + upgrade-tree groups
  (build slot 2, crosspath, B4 pierce, recruits, auto switch, panel vocabulary).
- `tests/beam.test.js` — 45 pass, 0 fail.
- `tests/blub.test.js` — 53 pass, 0 fail.
- `tests/long-range-dps.test.js` — 70 pass, 1 fail: `ConfiguredTower gates the
  ability behind the B5 flag`.
- `tests/sandbox.smoke.js` — 2 fail: `clicking the ability rectangle fires it
  and charges the HP cost`; `its three active abilities fire immediately and
  stay AUTO`.

Extract names with `node tests/<file> | grep FAIL` — the suites print `FAIL
<name>`, so the diff is a one-liner and there is no excuse for comparing totals.
