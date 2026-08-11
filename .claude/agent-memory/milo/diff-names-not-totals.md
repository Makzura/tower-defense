---
name: diff-names-not-totals
description: Always diff failing test NAMES, never pass/fail totals; and treat a changed denominator as its own separate event
metadata:
  type: feedback
---

Diff the **failing test names**, never the totals. Report every failing name
verbatim — no truncation, no "and 26 others". Report the total (pass+fail) as
well as pass and fail separately, because a changed **denominator** means tests
were added or removed, which is a different event from a pass flipping to a
fail.

**Why:** a regression once hid completely inside an unchanged total — one test
broke in the same run another was silently fixed. No count could have shown it.
The documented instance: after the gunner was deleted on 2026-07-30 every
roster entry shifted a slot, leaving an assertion claiming the **Warbringer**
has no upgrade tree. It had been wrong for months and no total revealed it.

**How to apply:** when a number looks wrong, produce the name-level diff
*before* producing an explanation. Save each suite's complete combined
stdout+stderr to its own file and hand over the paths unfiltered — Rhea reads
them herself and does not want them trimmed or summarised.

## The unit is the failing test NAME. The problem list is a SECOND field.

Rhea's ruling, 2026-08-12, after her own taxonomy proved unsound: never collapse
a failing test into one cause. Diff the **names**; carry each test's **list of
problems** as a separate field beside it. One test can log several failed
assertions *and then* a throw — see [[running-the-suites]] for why.

Two things this prevents, both of which actually happened:

- **Counting problem lines as failures.** ivan reported the content suite
  "failing far more widely — roughly forty failures". The suite prints 30 `FAIL`
  lines and 9 `threw:` lines against `182 passed, 30 failed`. He counted problem
  lines. The total had not moved at all.
- **"It threw, so it proved nothing."** Rhea's taxonomy recorded one cause per
  test and concluded "seven of the thirty prove nothing at all". False: a
  `threw:` line is the *last* problem, not the only one. The roar test has three
  real assertion failures ahead of its TypeError. The replacement figure is not
  9 either — the question is malformed, so do not answer it with a number.

Corollary: a repair can make a problem list **longer** with no regression, by
removing a throw that was hiding later assertions. [[tyrant-test-vs-code]] has a
live example queued.

Related: a suite that dies partway reports *fewer* failures than it should,
which reads as an improvement. Always state whether each suite ran to
completion, and say so loudly if a process aborted. See [[baseline-history]].
