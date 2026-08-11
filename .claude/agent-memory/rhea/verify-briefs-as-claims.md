---
name: verify-briefs-as-claims
description: Items handed down as "already proven, do not re-derive" must still be verified before staff act on them; one inverted on 2026-08-12.
metadata:
  type: feedback
---

Treat every item in a task brief as a CLAIM, including items labelled "already
known — do not re-derive". Verify each against the source before a staff member
writes anything from it.

**Why:** on 2026-08-12 Diego's documentation brief listed five proven defects.
Four held. The fifth — "the roar passage is INVERTED, the test matches the
documented value and the game disagrees, fix the direction of that claim" — was
backwards. `AGENTS.md`'s Tyrant section and `js/enemy.js` AGREE (shield 1000,
12 s → 9 s, leap 90 u.l.); `tests/content.test.js` is the outlier at 200/8/6/50.
Flipping the blame would have made the source of truth accuse the game of values
the owner asked for twice in writing, and invited a future session to "fix" the
game backwards. The coordinator's own words afterwards: *"a confident wrong
correction is worse than the drift it replaces"*, and he re-labelled the whole
brief as claims rather than facts.

The error was honest and instructive — he had promoted an earlier, more nuanced
reading of mine into the brief as settled. **My own half-finished findings can
come back to me as instructions.** A note that says "flagged but not diagnosed"
must not be acted on as though it were diagnosed, by me or by anyone quoting me.

**How to apply:** before delegating a "just fix it" list, read the primary
source for each item — the code, the test, the commit — and confirm the defect
exists in the direction stated. Cost on 2026-08-12 was about four minutes for
five items. Send staff the correction *before* they write, not after; petra had
the corrected item in hand before she reached that paragraph. And when a brief
item turns out to be wrong, say so explicitly and in full rather than quietly
implementing the correct version — the person who wrote the brief needs to know
their evidence chain broke. See [[working-with-diego]] for the review-not-relay
principle this is the upstream half of.
