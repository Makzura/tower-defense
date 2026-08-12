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

## 1. Normal and Hard are placeholders — are they deleted?

**Status:** the caveat is **ruled and has moved out of this file.** What remains
open is only whether the two modes are deleted.

### The ruled part is no longer here — deliberately

The owner's ruling of 2026-08-12 — what Easy is, what Normal and Hard are, the
caveat every citing claim must carry, and the dropped `tier` on wave 25 that
demonstrates it — now lives in `AGENTS.md`, under the three-campaign-difficulties
table, and that is its only home. Moved 2026-08-12 by petra in the same edit
that recorded the ruling, per rule 2 above. **Do not restate any of it here.**

### What is still open

The owner has authorised deleting the two modes outright. That is deliberately
not being done unilaterally: they are a collaborator's contribution, that
collaborator is actively working in this repository, and removing another
person's work without their knowledge is not a call this project makes on their
behalf. It stays a conversation between the two of them.

Until it happens, the modes ship and the caveat in `AGENTS.md` governs.

### Lands in

**Done 2026-08-12** — the caveat is written into `AGENTS.md` at the four sites
that stated or implied the opposite:

- the difficulty table whose last column is headed **"authored pressure"**;
- **"Normal and Hard are built from Easy's proven spine"**, whose
  **"authored, not simulated"** clause was the exact contradiction;
- **"All five formerly sandbox-only types appear in both Normal and Hard"**;
- both mixed-wave field lists — the prose **"each with its own
  `count`/`interval`/`type`/`health` and an optional `lead`"** and the current
  values row **"Mixed waves"** — which omitted `tier` and so read as though it
  were not a group field. It is one (`js/game.js` authors `tier: 3` on wave 25),
  and it is the one the derivation drops.

**Outstanding, only if the modes are deleted** — all four of those sites change
again, along with `DIFFICULTIES`, the run chooser, and the `selectedDifficultyId`
paragraph. This entry cannot close until they do, and closing it moves this list
into the `CHANGELOG.md` entry.

---
