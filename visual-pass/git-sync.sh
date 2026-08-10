#!/bin/sh
# Auto-sync: rebase onto the remote, then push. Invoked by .git/hooks/post-commit,
# so every commit reaches GitHub without anyone having to remember.
#
# THE CONFLICT POLICY, and the reason it is not just "-X ours".
#
# This repo has two very different kinds of file and they deserve different
# treatment:
#
#   js/gl/models/*.js   GENERATED. Every one is reproducible by re-running its
#                       build script in tools/blender/. Losing a side of a
#                       conflict here costs nothing -- a rebuild restores it
#                       exactly, and the scripts are deterministic (verified:
#                       the Warbringer set rebuilds byte-identical).
#   everything else     HAND-WRITTEN. Source, briefs, logs, captures. A wrong
#                       auto-resolve here silently destroys someone's work, and
#                       another session is active in this folder.
#
# So: generated files auto-resolve, anything else aborts the rebase cleanly and
# says so. The repo is left exactly as it was, never mid-rebase.
set -e
cd "$(git rev-parse --show-toplevel)"

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "[sync] no remote; nothing to do"; exit 0
fi

git fetch -q origin main 2>/dev/null || { echo "[sync] fetch failed (offline?); leaving local"; exit 0; }

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "")
BASE=$(git merge-base HEAD origin/main 2>/dev/null || echo "")

if [ "$LOCAL" = "$REMOTE" ]; then echo "[sync] already in sync"; exit 0; fi

if [ -n "$REMOTE" ] && [ "$BASE" != "$REMOTE" ]; then
  echo "[sync] remote has diverged; rebasing"
  if ! git rebase origin/main >/dev/null 2>&1; then
    UNMERGED=$(git diff --name-only --diff-filter=U)
    GENERATED_ONLY=1
    for f in $UNMERGED; do
      case "$f" in
        TD_0.5.0/js/gl/models/*.js) ;;
        *) GENERATED_ONLY=0 ;;
      esac
    done
    if [ "$GENERATED_ONLY" = "1" ] && [ -n "$UNMERGED" ]; then
      echo "[sync] conflicts are generated models only; taking ours and continuing"
      for f in $UNMERGED; do git checkout --ours -- "$f" && git add "$f"; done
      GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || {
        git rebase --abort; echo "[sync] ABORTED: rebase would not continue"; exit 1; }
      echo "[sync] NOTE: re-run the build scripts in tools/blender/ to regenerate"
    else
      git rebase --abort
      echo "[sync] ABORTED -- conflicts in hand-written files, resolve by hand:"
      for f in $UNMERGED; do echo "        $f"; done
      exit 1
    fi
  fi
fi

git push -q origin main && echo "[sync] pushed $(git rev-parse --short HEAD)"
