---
name: team-and-conventions
description: Who to ask for what on this project, the evidence rule for doc edits, and the two date conventions plus CRLF that will bite mechanical edits
metadata:
  type: project
---

**Reporting line.** Rhea (quality lead) is who I report to; she reviews my diff
against the sources before it reaches Diego (the owner). She is *not* reachable
via `SendMessage` — she is the caller, so the final assistant message IS the
report to her. `main` is reachable for heartbeats.

**Ask by area:** nadia for numbers/balance, ivan for mechanisms, otto and suki
for anything visual, milo for the test baseline, vera for simulation.

**The evidence rule, and it is enforced.** Every doc edit needs a file:line or a
commit hash. If it cannot be proved, leave it and list it as "suspected,
unproven". Rhea checks citations independently and has caught me twice — once on
a real Markdown regression (deleting bullets took the blank line with them,
turning the next paragraph into a lazy continuation) and once on an ambiguous
price (a cumulative figure in a sentence whose other clause used own-price).
**Both were fair.** Re-read the rendered shape after deleting list items, and
when quoting a price say whether it is the item's own cost or a running total.

**The strongest possible evidence here is a PASSING test.** `tests/run.js` pins
schedule totals and the run purse. A passing assertion settles "is the code or
the doc wrong" without needing a balance ruling. Look for one before escalating.

**Two date conventions, both deliberate:**
- `CHANGELOG.md` uses LOCAL dates, matching git author dates. Machine is UTC+3,
  so around midnight UTC the changelog date is already tomorrow.
- `.claude/org/status/*.jsonl` uses UTC (`date -u +%FT%TZ`) by protocol.
Check both `date -u` and `date` before writing either.

**AGENTS.md and CHANGELOG.md are CRLF.** Multi-line find/replace via a node
script must use `\r\n` or every match silently fails. The Edit tool handles it
transparently — prefer Edit for multi-line changes. Also avoid embedding
apostrophes in `node -e` shell one-liners; use Edit instead of fighting quoting.

**Scope discipline:** documentation only. Stale comments in `js/` are common and
are NOT mine to fix — list them and route them. Several code comments state the
same wrong number the doc did, so fixing only the doc leaves the source
self-contradicting; say so when reporting.

See [[drift-hotspots]] and [[verify-numbers-by-running]].
