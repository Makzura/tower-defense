# Open items

Decisions that are waiting on the owner. Each entry states what was measured,
what the constraints are, and what the options cost — so the decision can be
made from this file without reconstructing the conversation that found it.

**This file holds one tense: *what is not yet decided.*** `AGENTS.md` holds
*what is true now*; `CHANGELOG.md` holds *how it got that way*. A fact lives in
exactly one of the three. Two documents making the same claim in the *same*
tense is the second-copy failure that reduced `CLAUDE.md` to a pointer, and two
rules keep this file out of it:

1. **Every entry carries a "Lands in" list** — the file and section each outcome
   obligates, cited by phrase rather than line number, because line numbers
   move. An entry cannot close until those edits are made; closing it moves the
   list into the `CHANGELOG.md` entry.
2. **A ruled entry moves in the same edit that records the ruling**, never in a
   follow-up. The instant a decision lands, that content stops being undecided
   and becomes true-now, so it belongs to `AGENTS.md` from that instant. Any gap
   before it moves is a live contradiction between two documents. That is not
   theoretical: on 2026-08-12 it took twenty minutes to produce one.

Measurements appear here only as **inputs to a pending choice**, never as
reference. The moment a figure here is useful for anything but deciding, it
belongs in `AGENTS.md` and this file points at it.

---

## 1. Normal and Hard are placeholders — are they deleted?  CLOSED

**Closed 2026-08-12.** They were deleted, with the whole difficulty concept,
in `a94ca3b`. Nothing about this entry is open any more.

Per rule 2 above, the entry does not linger now that its decision has landed.
Its `Lands in` list has moved into the `CHANGELOG.md` entry that records the
documentation repair, which is where the record of what it obligated belongs.
The rule it was waiting on — one schedule, no selection — is in `AGENTS.md`.

**Left here as a stub rather than erased**, because this entry is the worked
example the two rules above were written from, and a queue with no history of
having drained is a queue nobody trusts. Delete it once a second entry exists.

---
