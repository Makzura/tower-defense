#!/bin/sh
# Auto-sync: rebase onto the remote, then push. Invoked by .git/hooks/post-commit,
# so every commit reaches GitHub without anyone having to remember.
#
# -----------------------------------------------------------------------------
# THE CONFLICT POLICY
#
# Someone outside this company shares this repository. That one fact sets the
# policy: where there is any doubt this script STOPS and leaves the repository
# exactly as it found it. A wrong auto-resolve now destroys a person's work,
# and they would have no way of knowing why it vanished.
#
# WHICH SIDE IS WHICH. Measured on git 2.55.0 in a throwaway repo on
# 2026-08-12 -- read out of the file, not taken from documentation:
#
#     in a REBASE   git checkout --ours    -> the UPSTREAM side (origin/BRANCH)
#                   git checkout --theirs  -> the commit being REPLAYED (local work)
#     in a MERGE    the two are exactly reversed
#
# A rebase checks out the upstream and replays your commits onto it, so the
# upstream is the side already in place -- it is "ours" -- and your own commit
# arrives as "theirs". Anyone who learned these words from `git merge` will
# reach for --ours meaning "keep my work" and silently keep the remote instead.
# This script did exactly that until 2026-08-12: it resolved with --ours while
# the comment beside it claimed that kept the local commit. It did the opposite.
#
# WHAT HAPPENS NOW when a rebase conflicts:
#
#   1. If any commit in the divergence was authored outside this company, the
#      script stops, aborts the rebase, and prints who and what. It does not
#      pick a winner. Someone else's commit is not ours to resolve away.
#   2. Otherwise BOTH sides are saved under refs/sync-backup/ before anything
#      is touched, in two refs named for what they hold, so the resolve is
#      reversible in either direction.
#   3. The conflict is resolved in favour of the LOCAL side -- the commit being
#      replayed, the work just done -- using --theirs. See the table above.
#   4. `git rebase --skip` is never used to paper over a failure. Measured: it
#      drops the entire commit being replayed, content and all. If the rebase
#      cannot be continued, the script aborts it -- which puts the repository
#      back exactly where it started -- and says so at length.
#
# The repo holds two kinds of file. js/gl/models/*.js are GENERATED and
# reproducible by re-running the scripts in tools/blender/, so a conflict there
# costs a rebuild rather than lost work. Everything else is hand-written. Both
# are subject to rule 1: who wrote it outweighs which kind of file it is.
# -----------------------------------------------------------------------------
set -e
cd "$(git rev-parse --show-toplevel)"

# The identities this company commits under. A commit by anyone else stops the
# sync rather than being resolved away. Override for a new collaborator with:
#
#     git config sync.owner-emails "diego.makzume@gmail.com noreply@anthropic.com someone@else"
#
# LIMITATION, stated plainly because it decides whether this check protects
# anyone: it can only separate people who commit under different git
# identities. Every agent here commits as noreply@anthropic.com, so a
# collaborator whose tooling also commits as noreply@anthropic.com is
# indistinguishable from us and their work would be treated as ours. Anyone
# sharing this repo should set their own user.email. Verify with:
#     git log --format='%an <%ae>' | sort -u
OWNER_EMAILS=$(git config sync.owner-emails 2>/dev/null || echo "diego.makzume@gmail.com noreply@anthropic.com")

# 0 if the commit was authored by this company, 1 otherwise (including unknown).
is_ours() {
  _email=$(git log -1 --format='%ae' "$1" 2>/dev/null || echo "")
  [ -z "$_email" ] && return 1
  for _owner in $OWNER_EMAILS; do
    if [ "$_email" = "$_owner" ]; then return 0; fi
  done
  return 1
}

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "[sync] no remote; nothing to do"; exit 0
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch -q origin "$BRANCH" 2>/dev/null || { echo "[sync] no upstream $BRANCH yet; pushing"; git push -q -u origin "$BRANCH" && echo "[sync] pushed $(git rev-parse --short HEAD)"; exit 0; }

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$BRANCH 2>/dev/null || echo "")
BASE=$(git merge-base HEAD origin/$BRANCH 2>/dev/null || echo "")

if [ "$LOCAL" = "$REMOTE" ]; then echo "[sync] already in sync"; exit 0; fi

if [ -n "$REMOTE" ] && [ "$BASE" != "$REMOTE" ]; then
  echo "[sync] remote has diverged; rebasing"
  if ! git rebase origin/$BRANCH >/dev/null 2>&1; then

    UNMERGED_LIST="$(git rev-parse --git-dir)/sync-unmerged.$$"
    git diff --name-only --diff-filter=U > "$UNMERGED_LIST"

    if [ ! -s "$UNMERGED_LIST" ]; then
      rm -f "$UNMERGED_LIST"
      git rebase --abort 2>/dev/null || true
      echo "[sync] STOPPED: the rebase failed but no file is in conflict, so this"
      echo "       script has no idea what went wrong and will not guess."
      echo "       The rebase was aborted. Your commit is safe at $LOCAL."
      echo "       Run this by hand to see the real error:  git rebase origin/$BRANCH"
      exit 1
    fi

    # ---- rule 1: is every commit in this divergence ours? --------------------
    # Two places an outsider's commit can be sitting: the commit being replayed
    # (ours normally, but another session may be committing in this folder),
    # and the upstream commits we are replaying onto.
    STOPPED_SHA=$(git rev-parse REBASE_HEAD 2>/dev/null || cat "$(git rev-parse --git-dir)/rebase-merge/stopped-sha" 2>/dev/null || cat "$(git rev-parse --git-dir)/rebase-apply/original-commit" 2>/dev/null || echo "")
    FOREIGN=""
    if [ -n "$STOPPED_SHA" ] && ! is_ours "$STOPPED_SHA"; then
      FOREIGN="$STOPPED_SHA"
    fi
    for sha in $(git log --format='%H' "$BASE..$REMOTE" 2>/dev/null || echo ""); do
      if ! is_ours "$sha"; then FOREIGN="$FOREIGN $sha"; fi
    done

    if [ -n "$FOREIGN" ]; then
      # Read the list BEFORE aborting: the abort clears the unmerged state and
      # there is no way to ask for it afterwards. Naming the files is the whole
      # point of this message.
      CLASHING=$(cat "$UNMERGED_LIST")
      rm -f "$UNMERGED_LIST"
      git rebase --abort 2>/dev/null || true
      echo ""
      echo "==========================================================================="
      echo "[sync] STOPPED. This conflict involves a commit that this company"
      echo "       did not write, so nothing was resolved and nothing was pushed."
      echo ""
      echo "       Commits by someone outside this company:"
      for sha in $FOREIGN; do
        echo "         $(git log -1 --format='%h  %an <%ae>  %s' "$sha")"
      done
      echo ""
      echo "       The files that clash:"
      echo "$CLASHING" | sed 's/^/         /'
      echo ""
      echo "       The rebase was ABORTED. Nothing was lost on either side:"
      echo "         your commits are exactly where they were, at $LOCAL"
      echo "         theirs are untouched on the remote, at $REMOTE"
      echo ""
      echo "       WHAT TO DO: do not resolve this with a script, and do not"
      echo "       force-push. Talk to whoever wrote the commits above and agree"
      echo "       which change survives. To see the two sides:"
      echo "         git log --oneline $BASE..$REMOTE      what they did"
      echo "         git log --oneline $BASE..$LOCAL       what we did"
      echo "==========================================================================="
      exit 1
    fi

    # ---- everything here is ours; classify for the rebuild note --------------
    GENERATED_ONLY=1
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      case "$f" in
        game/js/gl/models/*.js) ;;
        *) GENERATED_ONLY=0 ;;
      esac
    done < "$UNMERGED_LIST"

    # ---- rule 2: save BOTH sides before touching anything --------------------
    # Named for what they hold, because the old single unnamed ref held the side
    # that WON and was documented as if it held the side that was lost.
    #
    #   <stamp>-local   every local commit exactly as it stood before the rebase.
    #                   This is the work a bad resolve destroys -- restore from here.
    #   <stamp>-remote  the upstream tip. Its version of the clashing files is the
    #                   side this resolve overwrites.
    STAMP=$(date +%Y%m%d-%H%M%S)
    git update-ref "refs/sync-backup/$STAMP-local" "$LOCAL"
    git update-ref "refs/sync-backup/$STAMP-remote" "$REMOTE"

    if [ "$GENERATED_ONLY" = "1" ]; then
      echo "[sync] conflicts are generated models only; keeping the local side"
    else
      echo "[sync] hand-written conflict; keeping the LOCAL side (the commit just made)"
      while IFS= read -r f; do
        [ -z "$f" ] && continue
        case "$f" in
          game/js/gl/models/*.js) ;;
          *) echo "        kept local, overwrote the remote version of: $f" ;;
        esac
      done < "$UNMERGED_LIST"
    fi
    echo "[sync] before: your commits    refs/sync-backup/$STAMP-local   ($(git rev-parse --short "$LOCAL"))"
    echo "[sync] before: the remote side refs/sync-backup/$STAMP-remote  ($(git rev-parse --short "$REMOTE"))"
    echo "[sync] to undo this resolve:"
    echo "         git diff refs/sync-backup/$STAMP-remote HEAD    what the remote lost"
    echo "         git checkout refs/sync-backup/$STAMP-remote -- <file>   take their version back"
    echo "         git reset --hard refs/sync-backup/$STAMP-local  put the branch back as it was"

    # --theirs = the commit being replayed = the local work. Measured; see header.
    # Read line by line: five tracked paths in this repo contain spaces, and
    # word-splitting them used to leave the repo stranded mid-rebase.
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      git checkout --theirs -- "$f" 2>/dev/null || git rm -q -- "$f" 2>/dev/null || true
      git add -- "$f" 2>/dev/null || true
    done < "$UNMERGED_LIST"

    STILL_UNMERGED=$(git diff --name-only --diff-filter=U)
    if [ -n "$STILL_UNMERGED" ]; then
      rm -f "$UNMERGED_LIST"
      git rebase --abort 2>/dev/null || true
      echo "[sync] STOPPED: these files could not be resolved automatically:"
      echo "$STILL_UNMERGED" | sed 's/^/         /'
      echo "       The rebase was ABORTED and your commits are safe at $LOCAL."
      echo "       Finish it by hand:  git rebase origin/$BRANCH"
      exit 1
    fi

    # ---- rule 4: continue, and never paper a failure over with --skip --------
    # One case is genuinely safe to skip and it is checked positively, not
    # assumed: if nothing is staged against HEAD, the replayed commit adds
    # nothing the new base does not already have. That is announced by name.
    #
    # HONESTY NOTE: this branch is defensive and was NOT reached by any test on
    # 2026-08-12. Git drops an already-applied commit by itself, before any
    # conflict arises, so the combination needed to get here -- a real conflict
    # that resolves to a tree identical to HEAD -- could not be constructed. It
    # is kept because aborting in that state would loop forever on every commit.
    # If you are reading this because it fired, treat it as unproven and check
    # refs/sync-backup/<stamp>-local by hand.
    if ! GIT_EDITOR=true git rebase --continue >/dev/null 2>&1; then
      if git diff --cached --quiet HEAD 2>/dev/null; then
        SKIPPED_DESC=$(git log -1 --format='%h %s' "$STOPPED_SHA" 2>/dev/null || echo "$STOPPED_SHA")
        GIT_EDITOR=true git rebase --skip >/dev/null 2>&1 || {
          rm -f "$UNMERGED_LIST"
          git rebase --abort 2>/dev/null || true
          echo "[sync] STOPPED: rebase could not continue or skip. ABORTED; your"
          echo "       commits are safe at $LOCAL. Finish by hand: git rebase origin/$BRANCH"
          exit 1; }
        echo ""
        echo "[sync] NOTE: commit $SKIPPED_DESC was dropped from the branch."
        echo "       It was checked first and adds nothing that the remote does not"
        echo "       already contain, so no change was lost. If you disagree, it is"
        echo "       kept in full at refs/sync-backup/$STAMP-local."
        echo ""
      else
        rm -f "$UNMERGED_LIST"
        git rebase --abort 2>/dev/null || true
        echo ""
        echo "==========================================================================="
        echo "[sync] STOPPED: the rebase could not be continued after resolving."
        echo "       It was ABORTED rather than skipped. Skipping would have thrown"
        echo "       away the whole commit, which is how work has gone missing before."
        echo ""
        echo "       Nothing was lost. Your commits are exactly where they were,"
        echo "       at $LOCAL, and nothing was pushed."
        echo "       Both sides are also kept at refs/sync-backup/$STAMP-local"
        echo "       and refs/sync-backup/$STAMP-remote."
        echo ""
        echo "       Do it by hand:  git rebase origin/$BRANCH"
        echo "==========================================================================="
        exit 1
      fi
    fi

    rm -f "$UNMERGED_LIST"
    if [ "$GENERATED_ONLY" = "1" ]; then
      echo "[sync] NOTE: re-run the build scripts in tools/blender/ to regenerate"
    fi
  fi
fi

# Publishing behaviour below is deliberate and out of scope for the resolver fix
# of 2026-08-12; left exactly as it was at the owner's instruction.
git push -q origin "$BRANCH" && { [ "$BRANCH" != "main" ] && git branch -f main "$BRANCH" && git push -q --force-with-lease origin main; true; } && echo "[sync] pushed $(git rev-parse --short HEAD)"
