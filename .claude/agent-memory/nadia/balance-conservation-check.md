---
name: balance-conservation-check
description: Which HP counts toward the 11 747 scheduled / 13 498 effective campaign totals, and which conjured or spawned HP sits outside them.
metadata:
  type: project
---

The whole-run conservation check is: damage dealt + health leaked to base must
add back to **effective** HP, where effective is
`count x health x (1 + shieldRatio) x (1 + revives)` per group.
Campaign totals: **11 747 scheduled / 13 498 effective**, asserted by `tests/run.js`.

**What is NOT in those totals** — worth knowing before concluding a number broke
the check:

- Any **flat, conjured shield** applied at runtime. Only `shieldRatio` (a ratio of
  `maxHealth`, applied at construction) feeds effective HP. The Tyrant's roar
  shield is flat, so moving it 200 -> 1000 changed the totals by zero. See
  [[tyrant-2026-08-01-retune]].
- **Hive brood** — unscheduled and `noBounty: true`, so it is both unpaid and
  uncounted. This is the documented exception.
- **The Tyrant roar's 40 summoned bodies / 2780 HP** — unscheduled, but they do
  NOT set `noBounty`, so they pay. Cash-equals-HP-removed still holds for them;
  they are simply extra HP the schedule does not name. Two of them are Hives,
  which then produce unpaid brood on top.

**How to apply:** before claiming a tuning change broke or should have moved the
conservation totals, check whether the HP in question is scheduled and whether the
shield is a ratio or a flat grant. A flat runtime shield can be changed by a factor
of five without the balance test noticing.
