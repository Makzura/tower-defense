#!/usr/bin/env bash
#
# export_guarded.sh -- run an export and refuse to leave collateral behind.
#
# WHY THIS IS A SCRIPT AND NOT A NOTE. `export_mesh.py --only=` matches by
# PREFIX (`export_mesh.py:629`, `t[0].startswith(w)`), so `--only=enemy-boss`
# selects `enemy-boss` AND `enemy-boss_fast`. A Tyrant run rewrites the
# Vanguard. Two things make a remembered procedure the wrong shape here:
#
#   * IT FIRES ON RUNS THAT FAIL. A build that raises can still have written
#     another target first -- observed: a `TYRANT_HULL_DEFECT` run that ended in
#     an AssertionError had already written `enemy-boss_fast.js`.
#   * IT FIRES ON RUNS NOBODY CALLS AN EXPORT. Running a negative control to
#     check an assert still writes files. That is the case a human skips.
#
# So every run goes through this, including every defect control.
#
# WHY GIT IS THE ORACLE AND NOT AN md5. A re-export changes face order without
# changing a single triangle, so a hash mismatch proves nothing about geometry
# and would cry wolf on every run. Git compares against the committed blob and
# the repair is one command with no stashed copy to lose.
#
# THE PRECONDITION IS THE HALF PEOPLE SKIP. If a guarded file is ALREADY dirty
# before the run, the after-check cannot tell your damage from someone else's,
# so this refuses to start rather than reporting a false positive later.
#
# Usage:
#   tools/blender/export_guarded.sh --only=enemy-boss
#   TYRANT_HULL_DEFECT=0.06 tools/blender/export_guarded.sh --only=enemy-boss
#
# Anything after the script name is passed through to export_mesh.py.

set -u

BLENDER="/c/Users/Superuser/Downloads/blender-5.3.0-alpha+main.d0c98651e6fb-windows.amd64-release/blender-5.3.0-alpha+main.d0c98651e6fb-windows.amd64-release/blender.exe"

# Files this script protects: anything a prefix run can reach that is NOT the
# thing being built. Add to this list, never remove from it.
GUARDED="js/gl/models/enemy-boss_fast.js"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO" || exit 1

if [ ! -x "$BLENDER" ]; then
  echo "export_guarded: blender not found at $BLENDER" >&2
  echo "  It is NOT installed and NOT on PATH -- it is an unpacked directory" >&2
  echo "  in Downloads, and the doubled directory name is real." >&2
  exit 1
fi

# --- precondition ----------------------------------------------------------
dirty_before=""
for f in $GUARDED; do
  if [ -n "$(git status --porcelain -- "$f")" ]; then
    dirty_before="$dirty_before $f"
  fi
done
if [ -n "$dirty_before" ]; then
  echo "export_guarded: REFUSING TO RUN -- guarded file already dirty:$dirty_before" >&2
  echo "  Commit or restore it first. With it already modified this script" >&2
  echo "  cannot tell this run's damage from someone else's, and a guard that" >&2
  echo "  cannot tell those apart is worse than none." >&2
  exit 1
fi

# --- the export ------------------------------------------------------------
echo "export_guarded: guarding:$( for f in $GUARDED; do printf ' %s' "$f"; done)"
"$BLENDER" --background --factory-startup \
  --python tools/blender/export_mesh.py -- "$@"
status=$?

# --- postcondition ---------------------------------------------------------
# Runs even when the export failed: a failed build can still have written a
# different target before it raised.
hit=""
for f in $GUARDED; do
  if [ -n "$(git status --porcelain -- "$f")" ]; then
    hit="$hit $f"
  fi
done

if [ -n "$hit" ]; then
  echo "" >&2
  echo "export_guarded: *** COLLATERAL WRITE ***$hit" >&2
  echo "  The prefix match reached a target you did not ask for. Restoring." >&2
  for f in $hit; do
    git checkout -- "$f" || echo "export_guarded: RESTORE FAILED for $f" >&2
  done
  for f in $hit; do
    if [ -n "$(git status --porcelain -- "$f")" ]; then
      echo "export_guarded: $f IS STILL DIRTY AFTER RESTORE -- do not commit" >&2
      exit 2
    fi
  done
  echo "export_guarded: restored. Export exit status was $status." >&2
  exit 2
fi

echo "export_guarded: no collateral. Export exit status $status."
exit $status
