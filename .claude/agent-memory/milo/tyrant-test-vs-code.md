---
name: tyrant-test-vs-code
description: The wave-35 Tyrant deltas in content.test.js are a ruled test-vs-code disagreement, not drift — expected on every run until an unauthorised test update happens
metadata:
  type: project
---

# The Tyrant deltas are KNOWN, not drift

Two `content.test.js` tests fail on the wave-35 boss every run. **nadia has
ruled the CODE canonical** (2026-08-12): shield 1000, aimed interval 12 s, 9 s
post-roar, leap 90 u.l. is the intended shipping balance as of the 2026-08-01
retune — a deliberate tune, **not a partial revert**. `tests/content.test.js`
is one retune behind at 200 / 8 / 6 / 50 / 30 bodies.

**Why:** a future baseline run will see these and reach for "regression". They
are neither a regression nor a code bug. Updating the tests to match is a
**separate job that has NOT been authorised** — do not fix them in passing.

**How to apply:** expect exactly these, and treat any *other* Tyrant failure as
genuinely new. Verified at HEAD 77a7865, 2026-08-12.

## Observed deltas

`the Tyrant's numbers are the ones that were asked for` (l.498) — 2 assertions,
no throw:

| line | asserts | code gives |
|---|---|---|
| 521 | `phase.shield` 200 | 1000 |
| 528 | `addAttack.leap.distanceUl` 50 | 90 |

`the roar shields it, speeds it up, and calls the wave back` (l.570) — 3
assertions **then** a throw:

| line | asserts | code gives |
|---|---|---|
| 589 | `boss.shieldMax` 200 | 1000 |
| 590 | `boss.shield` 200 | 1000 |
| 595 | `boss.attack.intervalSeconds` 6 | 9 (12 × 0.75) |
| 601 | `Enemy.TYPES.boss.attack.intervalSeconds` 8 | **TypeError** |

## l.601 is balance-independent — a wrong key, not a wrong number

`Enemy.TYPES.boss` carries **`attacks[]`** and has **never had a key
`attack`**; the *instance* gets `.attack` at `js/enemy.js:169`. So l.601 reads
a property off `undefined` and throws regardless of how nadia rules. I probed
the invariant it means to guard — that the roar must not wind down the shared
TYPE row in place — and it **holds**: TYPE `attacks[0].intervalSeconds` is 12
before and after, and `boss.attack !== Enemy.TYPES.boss.attacks[0]`. The throw
masks no bug.

## The trap: l.610 is UNREACHABLE, so it is a LATENT delta

Rhea's note lists l.610 (`t.eq(called.length, 30)`) among the deltas to expect
every run. **It is not observed and never has been** — the throw at l.601 ends
the test, so l.610 and everything after it never execute.

It *would* fail: the roar calls in **40 bodies / 2780 HP** from the nine groups
at `js/enemy.js:751-759` (probed directly, matching nadia).

So **repairing l.601 alone will make this test's problem list get LONGER** — a
new failure appears at l.610, plus whatever else lies below it. The failing
test *count* will not move. Do not read that growth as a regression; it is a
previously-hidden assertion becoming reachable. See
[[diff-names-not-totals]].

## Pointer corrections (do not propagate)

- The summon figure lives at AGENTS.md **942, 976 and the reference table**,
  not 955 — 955 is the leap paragraph. Anchor by content; see
  [[running-the-suites]] on why AGENTS.md line numbers are worthless.

Related: [[baseline-history]].
