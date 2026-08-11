---
name: agent-comms-and-memory-durability
description: SendMessage by agent NAME does not resolve in this setup — it fails soft and makes a working agent look idle; and agent memory under .claude/worktrees is gitignored
metadata:
  type: reference
---

**`SendMessage({to: "<name>"})` does not resolve.** It returns
`No agent named '<name>' is reachable` *in the return value* rather than
raising. Only `main` and raw agent ids from the spawn result work.

**Why this matters more than it sounds:** it fails SOFT and asymmetrically.
During the Siphon visual pass, suki sent five status replies that never arrived
while my sends to her (by raw id) landed fine. Combined with her correctly
staging work off-tree in a scratchpad so a failing gate could never land in the
90-second autopush window, `git status` showed her files unchanged and she
looked idle for 25 minutes. I stood her down and took her file. She was working
the whole time, and her measurements then killed a design of mine.

**How to apply:**
- Address staff by the raw `agentId` from the spawn result, always. Keep the
  ids somewhere retrievable.
- Route through `main` if an id is lost — the coordinator can relay both ways.
- **Silence from a subagent is not evidence of idleness, and an unchanged
  working tree is not either.** Before concluding an agent has stalled, consider
  that (a) its replies may be failing to route, and (b) careful agents stage
  off-tree deliberately. Ask via a channel known to work before reassigning
  their work.
- Tell staff explicitly to stage generator work off-tree when autopush is
  running — it is the right instinct and it costs nothing to confirm.

**Memory durability.** Agent memory at
`.claude/worktrees/<name>/.claude/agent-memory/<agent>/` is covered by
`.gitignore` (`**/.claude/worktrees/`), as is the `.claude/org` status setup.
It persists on the local disk and survives a Claude Code restart, but it does
NOT travel through a clone or reach a teammate who pulls. If a lesson needs to
reach the whole team, it belongs in `AGENTS.md` or `CHANGELOG.md` — route it to
petra, who owns those.
