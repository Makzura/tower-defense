---
name: rhea-reporting
description: How Rhea (quality lead) wants measurement work delivered — separation of measuring from fixing, and what she reads herself
metadata:
  type: feedback
---

Rhea separates **measuring** from **fixing** strictly. On a measurement job:
report what is broken, do not repair it — not even a one-line fixture repair
that is obviously correct. Write it down and hand it back.

**Why:** a measurement run has to be trustworthy as a record of the state of
the tree at a point in time. Fixing something mid-run means the numbers
reported no longer describe any commit that ever existed.

**How to apply:**

- Save each suite's complete combined stdout+stderr to its own file and give
  absolute paths. She reads them herself — do not trim, filter or summarise the
  saved files, even the long stack traces.
- State the measured numbers plainly. Do not reconcile them toward the
  documented baseline, do not assume a mismatch is your own error, and do not
  soften it. Equally, do not manufacture drama: if it matches, say it matches.
- She may supply a hypothesis about where a change is expected to show. Treat
  it as something to test, not to confirm — on 2026-08-11 the expected suites
  (content, sandbox) were exactly on baseline and the movement was somewhere
  else entirely.
- Re-run only the suites whose numbers moved, to check for flakiness, and
  compare the failure name sets between the two runs.
- No report `.md` files. Findings go in the reply.

See [[diff-names-not-totals]] for the name-level rule, and
[[baseline-history]] for the running record.
