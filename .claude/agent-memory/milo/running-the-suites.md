---
name: running-the-suites
description: Practical facts for running the six suites on this Windows box — cwd, output capture, exit codes, and what the suites cannot prove
metadata:
  type: project
---

# Running the six suites

Run from `TD_0.5.0/` (the inner folder), not the repo root. Plain `node`, no
runner, no flags beyond the file path. Node v24.19.0 as of 2026-08-11.

**Capture output through the Bash tool, not PowerShell.** PowerShell 5.1 wraps
a native executable's stderr in ErrorRecords and flips `$?` to false even on
exit 0. `node tests/x.js > file 2>&1` under Git Bash captures cleanly and
preserves the real exit code.

**Exit codes:** 1 when the suite has any failure, 0 when clean. So beam and
blub exit 0; the other four exit 1 at the current baseline.

**Output shapes differ.** Five suites end with `N passed, M failed`.
`sandbox.smoke.js` ends with just `2 FAILED` and prints no pass count — do not
force it into a pass/fail shape. Its `ok` lines can still be counted (150 at
the 2026-08-11 baseline).

Failure detail is indented under the name: either `label / expected: / actual:`
lines, or `threw: <stack>`. Sandbox prints a single free-form detail line
instead.

**A test does NOT stop at its first failed assertion.** `assert.js` records
every failed assertion into a `problems` array and runs the whole test body; a
genuine exception is caught and appended as one more problem, so `threw:` is
always the **last** line of a block and always means the test died there. One
test can therefore report several assertion failures *and* a throw. "Which
failure came first" is answerable — printed order is chronological — but "the
failure" usually is not, because there are several. A taxonomy that records one
line per failing test silently picks one and drops the rest; that is how the
roar test came to be filed as a bare TypeError when it has three failed
assertions in front of it. Quote the whole block.

**What the suites do not cover: pictures.** They test simulation. A rendering
change can pass all six and be visibly broken. Never certify a visual change on
a green run — that needs pixel evidence from **otto**. AGENTS.md makes the same
point and notes that several "obvious" visual tests turned out to prove
nothing.

**AGENTS.md is 267KB** — too large for one Read. Grep it. The baseline table
and the per-file test inventory are both near the top (the inventory is stale —
see [[baseline-history]]).

**Never record an AGENTS.md line number, and never trust one you are given.**
The file is edited constantly and shifts under a running session: on 2026-08-12
the boss reference row moved from 4210 to 4244 and the roar failure bullet from
144 to 146 *between two greps in the same session*, because petra's repair pass
was live in the working tree. Cite AGENTS.md by heading or quoted phrase and
re-grep every time.
