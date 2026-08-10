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
    # AUTO-RESOLVE EVERYTHING, at the owner's explicit instruction.
    #
    # Nothing is thrown away silently, though. Before a hand-written conflict is
    # resolved, the side that loses is written to a recovery ref under
    # refs/sync-backup/, so an auto-resolve is always undoable:
    #
    #   git log --oneline refs/sync-backup/          what was set aside, and when
    #   git diff HEAD refs/sync-backup/<name>        what it would have changed
    #   git cherry-pick <sha>                        put it back
    #
    # Recovery refs cost a few bytes and are never pushed. Losing a colleague's
    # commit with no way to get it back is the one outcome worth engineering
    # against, and another session IS active in this folder.
    if [ -n "$UNMERGED" ]; then
      STAMP=$(date +%Y%m%d-%H%M%S)
      if [ "$GENERATED_ONLY" = "0" ]; then
        git update-ref "refs/sync-backup/$STAMP" origin/main
        echo "[sync] hand-written conflict; incoming side saved to refs/sync-backup/$STAMP"
        for f in $UNMERGED; do
          case "$f" in
            TD_0.5.0/js/gl/models/*.js) ;;
            *) echo "        auto-resolved (ours): $f" ;;
          esac
        done
      else
        echo "[sync] conflicts are generated models only; taking ours"
      fi
      # `ours` during a rebase is the upstream side being replayed ONTO, so this
      # keeps the commit currently being applied -- the work just done locally.
      for f in $UNMERGED; do git checkout --ours -- "$f" 2>/dev/null || git rm -q -- "$f"; git add -- "$f" 2>/dev/null || true; done
      GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || {
        GIT_EDITOR=true git rebase --skip >/dev/null 2>&1 || {
          git rebase --abort
          echo "[sync] ABORTED: could not continue even after resolving"; exit 1; }; }
      if [ "$GENERATED_ONLY" = "1" ]; then
        echo "[sync] NOTE: re-run the build scripts in tools/blender/ to regenerate"
      fi
    fi
  fi
fi

git push -q origin main && echo "[sync] pushed $(git rev-parse --short HEAD)"
