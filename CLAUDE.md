# Tower Defense — project context

**Read `AGENTS.md`. It is the single source of truth for this project.**

This file used to be a full second copy of that document. The two drifted
apart repeatedly — by 2026-07-27 this copy still described a spawn timer that
had been replaced by waves, a units system that had been replaced twice, and
tower stats that had been rescaled — which is exactly the failure `AGENTS.md`
opens by warning about. Keeping one document current is hard enough; keeping
two identical is not something anyone will actually do.

So this is now a pointer, deliberately. Everything lives in `AGENTS.md`:
hard constraints, architecture, the u.l. distance system, placement and
economy rules, target claiming, balance maths, the model contract, and the
current values.

The change log moved to `CHANGELOG.md` on 2026-08-09 — it was half of
`AGENTS.md` by line count, and the rules were getting buried under the history.
Read `AGENTS.md` for what is true now; read `CHANGELOG.md` for how it got that
way, and add an entry there for every change you make.

If you are an assistant that was pointed at this file by convention, open
`AGENTS.md` before changing anything.
