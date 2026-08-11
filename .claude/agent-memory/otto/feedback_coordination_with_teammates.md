---
name: coordination-with-teammates
description: A clean git status does not mean a teammate is idle — plus how scope gets extended mid-task on this team
metadata:
  type: feedback
---

**An unchanged `git status` is not evidence that nobody is working.**

**Why:** kaz read a quiet tree as an idle agent and took over suki's file while
she was working correctly — she was staging off-tree, so her work simply was not
visible in `git status`. On this project an autopush watchdog also commits every
90 s, which means the working tree can be clean *because* someone's work was
just committed, not because it does not exist.

**How to apply:** before touching a file another agent owns, ask them. Silence
plus a clean tree means nothing. If a file is generated (`js/gl/models/*.js`,
`js/gl/siphon-beam-spec.js`), never hand-edit it even to test — inject the value
at runtime in the browser instead, which proves the read path without racing the
generator. That is how the per-frame origin was verified before suki's table
landed mid-session.

**Scope here is explicit and it moves.** Files outside the assigned list stay
untouched and get reported with a measurement attached; kaz then either routes
it elsewhere or hands it back with authorisation. That worked well —
`siphon-ritual.js` was reported with numbers, then explicitly put in scope and
fixed in the same session. Report with a number and a file:line, and the
decision comes back fast.

**Documentation ownership:** petra owns `AGENTS.md`. Draft the row, hand it to
kaz, do not write it — concurrent edits collide with her repair passes.
`CHANGELOG.md` entries are still mine to write.

Related: [[visual-proof-that-proved-nothing]], [[siphon-origin-plumbing]].
