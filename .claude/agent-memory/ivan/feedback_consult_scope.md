---
name: consult-not-work-order
description: When a colleague spawns me as a consult, answer and stop — do not fix the thing I find, even when the fix is one obvious line
metadata:
  type: feedback
---

A request framed as "consult, not a work order" means: verify, answer, stop.
Do not edit the files I am adjudicating, not even a comment, however obvious
the correction is.

**Why:** Rhea's documentation repair pass edits documentation only. A code fix
smuggled into a doc job lands outside the review channel — vera owns
simulation changes, and a silent patch by the consulted engineer bypasses her.
The separation is what makes the doc pass trustworthy as a record.

**How to apply:** When the brief names a scope ("DOCUMENTATION ONLY", "do not
fix today"), treat every code defect I find as a *finding to report*, with the
file and line, and hand it back to the requester. Running the suites read-only
to confirm a claim is fine and expected — that is evidence, not a change.
Report to the colleague who spawned me, not to main. See
[[agents-md-repair-pass]].
