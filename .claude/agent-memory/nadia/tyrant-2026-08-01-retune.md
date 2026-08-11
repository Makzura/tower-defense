---
name: tyrant-2026-08-01-retune
description: The wave-35 Tyrant's 2026-08-01 retune is canonical — shield 1000, 12 s/9 s intervals, leap 90 u.l., 40 bodies/2780 HP summon — and content.test.js is one retune behind on all of it.
metadata:
  type: project
---

The 2026-08-01 owner retune of the Tyrant is the live shipping balance. Code and
AGENTS.md agree; `tests/content.test.js` asserts the superseded 2026-07-29/07-30 set.

**Canonical values** (verified at runtime through `tests/harness.js`, not just read):

| figure | old | live |
|---|---|---|
| roar shield | 200 | **1000** (flat, conjured — not a `shieldRatio`) |
| aimed interval | 8 (was 3.5) | **12** |
| post-roar interval | 6 | **9** (12 x 0.75) |
| leap distance | 50 | **90** u.l. |
| leap radius | 90 | **120** u.l. |
| leap damage | 30 | **80** |
| leap stun | 2 | **3** s |
| leap reach | 150 | **220** u.l. |
| leap wind-up | 1.1 | **1.5** s |
| summon | 30 bodies / 600 HP | **40 / 2780** |

**The summon derivation** — 40/2780 is not a typed figure, it falls out of the
nine group rows and that is why it is trustworthy:

- running mob, unchanged: 8x20 + 10x6 + 6x30 + 4x40 + 2x20 = **30 bodies, 600 HP**
- support court, added 2026-08-01: 2 Hive x150 + 3 Shieldbearer x60 + 3 Healer x200
  + 2 Colossus x550 = **10 bodies, 2180 HP**
- total **40 / 2780**. Runtime confirms exactly.

**Why the tests are not competing intent.** They are structurally behind, not
merely numerically. `Enemy.TYPES.boss.attack.intervalSeconds` asserts a singular
`attack` field the type no longer has — it carries `attacks[]`. That assertion
throws `TypeError`, which kills the test before the `called.length === 30`
assertion below it ever runs. That 30 has therefore never evaluated against
current code and is zero evidence of anything. Meanwhile the one interval
assertion written tolerantly (`intervalSeconds >= 8`) passes at 12.

**The retune does not disturb the conservation check.** The roar shield is flat
and conjured at runtime, not a `shieldRatio`, so it never entered the
11 747 scheduled / 13 498 effective HP totals. 200 -> 1000 leaves those untouched
and the balance test passing — so there was never arithmetic pressure to revert it.
See [[balance-conservation-check]].

**Two stale 200s survive in the tree** (both are readable as current by someone
who does not know the history): `AGENTS.md` line 900, the verbatim 2026-07-29
owner quote sitting ~50 lines above the table that says 1000; and
`js/enemy.js` line 640, a 2026-07-30 comment that says the 200 shield "is
unchanged" — true when written, false since 2026-08-01. The same comment block
calls the body 2500 at lines 639/652 though `health` is 5000.

**Why:** rhea needed a canonical ruling before petra could mark the 07-29 quote
superseded in the AGENTS.md repair pass; she could prove what each source said
but not which was right.

**How to apply:** treat code + AGENTS.md as canonical for the Tyrant and the test
file as stale. If asked again whether a Tyrant number is live, check whether the
assertion that disagrees is even reachable before weighing it.
