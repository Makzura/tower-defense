---
name: verify-numbers-by-running
description: How to get authoritative numbers out of this codebase — boot the test harness and call the game's own functions rather than re-deriving them
metadata:
  type: project
---

Do not re-derive a schedule or balance figure by hand. **Boot the real game in
Node and call the function the document itself names as the implementation.**

```
node -e "var h=require('<abs path>/tests/harness.js').boot('rune-circuit');
         console.log(h.run('<expression>'));"
```

`h.run(code)` evaluates a string in the booted sandbox and returns the result.
There is no `h.sandbox` property — `h.run` is the door. Keep the evaluated code
on one line or build it by joining an array; a template literal with real
newlines fails to parse inside the vm.

**Why this matters:** hand-summing gave a schedule "authored HP" of 23 807 while
CHANGELOG.md recorded 23 782 for the same quantity, and I could not reconcile
the 25. Calling the game's own `waveEffectiveHealth()` (js/game.js:604) gave
25 969, which matched the changelog's independently recorded figure exactly.
The hand-derived number would have been a wrong number in the source of truth.

**How to apply:** if a figure has a function behind it, call the function and
cite it. If it does not — "scheduled HP" has no implementation in game.js — say
so and refuse to write a number. A quantity with no implementation cannot be
verified and should be reported as unverifiable rather than estimated.

Useful entry points confirmed working: `waveCount()` js/game.js:553,
`waveEffectiveHealth()` js/game.js:604, `waveBounty()`, `DIFFICULTIES`,
`EASY_WAVES`, `Enemy.TYPES`, and any bare global constant by name.

A cross-check that caught a real inconsistency: the document's own `$2596`
clear-bounty total is exactly 0.1 x the CURRENT effective HP, proving the
document already contained a figure consistent only with the rescaled schedule
while stating the pre-rescale HP elsewhere. **Internal arithmetic consistency is
strong evidence about which of two conflicting numbers is the stale one.**
