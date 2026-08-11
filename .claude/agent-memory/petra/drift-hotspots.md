---
name: drift-hotspots
description: The specific AGENTS.md sections that go stale repeatedly, and the structural reason why — prose copies rot while the Current Values table stays current
metadata:
  type: project
---

In AGENTS.md, **the Current Values table is usually RIGHT and the prose copies
of the same number are wrong.** This inverts the intuition the file itself
encourages (it warns you to watch the values table hardest).

Evidence from the 2026-08-12 repair pass: the Tyrant's shipping figures
(1000 shield / 12 s / 9 s / 90 u.l. leap) were correct in the Current Values
table and correct in the Tyrant section's own table, but wrong in *three*
prose sites — the testing section's failure bullet, the enemy roster table row,
and the 2026-07-29 owner quote being read as live.

**Why:** a number in the values table has one obvious owner and a stated
measurement context, so whoever retunes it updates it. A number embedded in an
explanatory sentence four hundred lines away has no owner and is invisible to
grep unless you already suspect it.

**How to apply:** when a constant changes, do not check the values table — check
`grep -n` for the *digits* across the whole file. Every prose mention is a
separate copy. The specific recurring hotspots, in order of how often they were
wrong:

1. **The test baseline block (~line 107-180).** Counts, named example failures,
   and the "run all N suites" number. Three separate defects here in one pass.
   The named failures are the worst: they claim specific tests fail, and nobody
   re-runs them to check.
2. **The architecture file map (~line 281+).** New files simply do not get
   added. Eight `index.html` scripts were missing after one day's work.
3. **Any tower price.** The Rifleman/Soldier's $300 appeared correctly in seven
   places and as a stale $15 in two others.
4. **Campaign schedule totals.** Stated in four places (header, difficulty
   table, prose, current values) and all four were pre-rescale.
5. **Boss/Tyrant values.** Stated in four-plus places, see above.

**The reliable tell for a stale number: a duplicated fact.** If a figure appears
twice, one of them is drifting. See [[pointer-not-copy]].
