---
name: working-copy-and-autopush
description: The live tree is C:\Users\Superuser\Downloads\TD_0.5.1 (game under TD_0.5.0/); .claude/worktrees copies are stale. An autopush commits every 90 seconds, so never leave a file half-edited.
metadata:
  type: project
---

The live working copy is `C:\Users\Superuser\Downloads\TD_0.5.1`, git root at
that level, game under `TD_0.5.0/`. Copies under
`TD_0.5.0/.claude/worktrees/*` are stale and must not be edited — but the org
infrastructure (`.claude/org/status/`, `.claude/agent-memory/`) lives in the
worktree, so status and memory go there while code goes to the live tree.

**Why:** an autopush watchdog commits and pushes every 90 seconds with a
`wip: autosave` message. It is not a person and must not be started a second
time. Anything on disk when it fires is published, including a half-finished
edit.

**How to apply:**
- Make each file's edit complete in one `Edit` call. Do not stage a broken
  intermediate state and fix it in the next call.
- `git status` will often come back clean moments after you edit, because the
  watchdog already committed. That is not evidence your change was lost —
  check `git show --stat HEAD`.
- Autopush bundles unrelated agents' files into one commit, so a shared commit
  is not a collision. Check for a collision per-file, before and after: if the
  file you are about to touch is already modified by another team, leave it and
  report rather than racing the interval.
- Line numbers in a brief are usually stale by the time you read it — the
  tree moves under you. Grep for the offending *text*, not the line.

Related: [[lying-comments-propagate-into-agents-md]].
