---
name: known-failure-taxonomy
description: The 36 known failure NAMES as of 2026-08-11, grouped by cause, and which are noise. Diff against this, never against totals.
metadata:
  type: project
---

# Known failure names (2026-08-11)

The name set to diff against. Recorded because nothing else records it —
`AGENTS.md` gives totals plus six example names, so before today a real
name-level diff was impossible. Anything **not** on this list is new.

## Arcane-Sniper B5 ability/effect timing drift — pre-existing, 6 names

`run.js` (all 3 of its failures):
- `the Arcane Sniper B5 ability counts its landed damage and kills`
- `Warbringer swings and Arcane Sniper B5 both respect slime AoE resistance`
- `both AoE towers emit replaceable impact effects`

`long-range-dps.test.js` (its 1 failure):
- `ConfiguredTower gates the ability behind the B5 flag` (stun 10 vs 7)

`sandbox.smoke.js` (both failures):
- `clicking the ability rectangle fires it and charges the HP cost`
- `its three active abilities fire immediately and stay AUTO`

## content.test.js — 30 names

- **Boss / Tyrant (6):** `the Tyrant's numbers are the ones that were asked for`,
  `the roar shields it, speeds it up, and calls the wave back`,
  `a stunned tower goes completely silent, cooldown and all`,
  `the Tyrant's aimed shot takes the HIGHEST DPS tower, not the nearest`,
  `the leap jumps 50 u.l. and shockwaves everything it lands beside`,
  `after the roar it alternates shot and leap, and still attacks rarely`
- **Tower health contract (1):** `every tower type answers the health contract`
- **Smasher roster shift and pricing (12):** `it is placed from build slot 2 and
  does not disturb the gunner`, `A1, A2, B1 and B2 can all be owned at once`,
  `upgrades cost money and are refused when unaffordable`, `selling refunds half
  of everything invested, upgrades included`, `the panel offers the next tier on
  each branch, with its price`, `clicking a branch button buys that upgrade`,
  `the B button keeps offering B1 and B2 after committing to path A`, `each
  button spells out what the upgrade does`, `effects are diffed against this
  tower, not read off the table`, `hovering a button opens a card with the whole
  story`, `an unaffordable button is shown dead and cannot be clicked through`,
  `the sell button still works with the upgrade row present`,
  `it still sells, inspects and draws when fully upgraded`
- **Index / meta progression (3):** `the enemy index is a compact list with a
  clickable detail selection`, `a fresh profile owns the starter kit and nothing
  else`, `buying a tower spends coins and puts it in the bar`
- **The Soldier (7):** `path B buys utility and abandons the burst at B3`, `the
  Soldier crosspaths like the Smasher and the Longshot`, `B4 pierces DEFENCE in
  flat percentage points, never below zero`, `path B answers a brute with
  damage, not with pierce`, `recruits march the road backwards and are not
  towers`, `an auto switch fires its ability the moment it is ready`, `the
  Soldier's panel speaks the shared vocabulary`

## METHOD CORRECTION (2026-08-12) — one cause per test is unsound

`tests/assert.js` gives each test a `problems` array; `record()` appends and
returns rather than throwing, so **the whole test body runs and one test can
report several failed assertions AND a throw.** A `threw:` line is the last
problem in its block, not the only one.

So the "seven prove nothing" section below is **wrong in method**. It kept the
dramatic-looking throw and silently dropped the assertion failures sitting in
front of it. The roar test is the counter-example: three genuine assertion
failures, *then* its TypeError. Measured 2026-08-12: 30 `FAIL` lines against 9
`threw:` lines — and 9 is not the replacement figure, because some of those nine
also failed assertions first.

**The unit to diff is the failing TEST NAME. The per-test problem list is a
second, separate field. Never collapse them.** Re-derive the "proves nothing"
subset properly before quoting it again.

This also settled a staff disagreement: ivan reported the content suite at
"roughly forty failures", milo at 30. Milo was right; ivan had counted problem
lines. Verified by running it myself.

## The Tyrant numbers are a known TEST-vs-CODE disagreement, not drift

Ruled by nadia 2026-08-12: the **code is canonical**. Shield 1000, aimed
interval 12 s, 9 s post-roar, leap 90 u.l. — the 2026-08-01 retune, not a
partial revert. The roar summon derives to 40 bodies / 2780 HP from the nine
groups at `js/enemy.js:750-759`. `AGENTS.md` agrees with the code.

`tests/content.test.js` is one retune behind at lines 521, 528, 589, 590, 595,
601, 610 (200 / 50 / 200 / 200 / 6 / 8 / 30 bodies). Expect those exact deltas
on every run until the tests are updated — **not authorised as of 2026-08-12.**

Separately, `content.test.js:601` reads `Enemy.TYPES.boss.attack`, a key the
TYPE has never carried — it has `attacks[]`, and the instance gets `.attack` at
`js/enemy.js:169`. That throw is balance-independent and survives any ruling.
The invariant it was reaching for (the roar must not mutate the shared type row)
was checked by milo and **holds**.

## Seven of the thirty prove nothing at all — SUPERSEDED, see method note above

They throw before reaching any assertion, so the behaviour is **uncovered while
being counted as a known failure** — the worst kind of green-adjacent number:

- `ReferenceError: w is not defined` at `content.test.js:634, :749, :786, :827`.
  `w()` is a world-coordinate helper that exists only in `tests/run.js`; these
  tests were copied across without it. Test-file bug, mechanics are fine.
- `TypeError` on undefined at `content.test.js:601` and `:5140`.
- `content.test.js:4226` and `:4584` throw *inside product code* at
  `js/game.js:1838`, where `whyCannotUpgrade` is read off an undefined tower.
  Pre-existing — that line is unchanged since the baseline commit.

## Roster-shift signature — RESOLVED 2026-08-12: stale tests, not a bug

Three content failures (`it is placed from build slot 2...`, `a fresh profile
owns the starter kit...`, `buying a tower spends coins...`) show the starter kit
missing `gunner` and slots reading one position off — `Arcane Sniper` where
`Warbringer` is expected.

**That is the intended behaviour.** The gunner was deliberately removed from the
meta catalogue on 2026-07-30 and the whole roster shifted down a slot. Proof, in
the code's own words:

- `js/meta.js:56-64` — the catalogue is the single source for `BUILD_SLOTS`, the
  starting kit, the armoury, the index and the sandbox roster, and an old save
  carrying `"gunner"` **drops it silently** via `sanitise`.
- The catalogue is five entries and the gunner is not among them: `smasher`,
  `longshot`, `siphon`, `soldier`, `blub` (`js/meta.js:67-110`).
- `tests/harness.js:210-213` — `placeSmasher` was changed away from a literal
  slot index precisely because "the gunner's deletion moved the Warbringer from
  slot 1 to slot 0, and a hardcoded index would have quietly started placing a
  different tower rather than failing."
- `tests/harness.js:216-233` — `placeGunner` bypasses the click handler because
  the gunner "is not in the catalogue, so it has no build slot and cannot be
  placed through one." It survives only as the shared footprint/`containsPoint`
  source and the 100 u.l. reference (`js/tower.js:127`, `:138`).

So these are **stale test expectations**, the same 2026-07-30 shift that
`AGENTS.md` already documents elsewhere. Not a vera/ivan question after all, and
not the highest-value thing to look at. Repairing them is milo's, and it is a
separate authorised job — do not fold it into a documentation pass.
