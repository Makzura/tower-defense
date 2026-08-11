---
name: lying-comments-propagate-into-agents-md
description: A false code comment is worse than no comment — it reads as measured and gets copied into AGENTS.md as fact. Repair the comment and the doc together.
metadata:
  type: project
---

A code comment that states a wrong number is worse than no comment at all,
because it reads as *measured* and gets copied into `AGENTS.md` as though
someone had checked it.

**Why:** on 2026-08-12 the Siphon spout height reached `AGENTS.md` as `0.62`.
That figure existed nowhere in the code — the shipping value has always been
`0.86`. Its only source was a comment above `BeamTower.prototype.spoutPoint`
that asserted 0.62 as an aesthetic ceiling and added "taller was tried and
looked wrong". The code shipped *taller* than the declared ceiling, so the
rationale was not stale, it was inverted. A documentation pass fixed the
document; the source kept generating the error.

**How to apply:**
- When a doc number is found wrong, grep the code for that literal before
  closing it out. If the number lives only in a comment, that comment is the
  source and both must be fixed in the same pass.
- When repairing a comment whose *rationale* is unverifiable, delete the
  rationale rather than re-attaching it to the corrected number. Re-attaching
  is exactly how the first one survived review. Replace it with things a reader
  can check: the value, what it is derived from, and any second site that must
  move with it.
- Comment-only changes are cheap to prove safe: filter the diff for lines that
  do not begin with `//`. An empty result is a stronger argument than a passing
  suite.

Related: [[enemy-schedule-is-fully-populated]],
[[test-baselines-compare-by-name-not-total]].
