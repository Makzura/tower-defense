# ---------------------------------------------------------------------------
# The grouped-gait regression: does a change to `enemy_chassis.py`'s walk move
# any shipped body?
#
#   blender --background --factory-startup --python tools/blender/check_group_gait.py \
#           -- out.json
#   TRIPOD_CHASSIS=<dir containing a patched enemy_chassis.py>   (optional)
#
# then compare two dumps with `--compare a.json b.json`.
#
# WHY A SEPARATE INSTRUMENT, WHEN THE EXPORTER ALREADY REPORTS COUNTS. **A GAIT
# CHANGE MOVES NO TRIANGLES.** Triangle counts, positions, normals, colour
# indices and every multiset over them are identical across any edit to the
# walk, so every integrity check the exporter runs passes green while the body
# visibly slides. The only field a gait edit can touch is `frames` -- the
# per-frame per-group matrices -- and nothing was reading it.
#
# WHAT IT DUMPS. Every object's world matrix at every frame, for every body that
# imports the chassis, built through `export_mesh._build_enemy` so this exercises
# the SAME path that produces the shipped file rather than a second opinion
# about it. Two dumps that differ nowhere is the evidence that a chassis edit is
# inert.
#
# **AND A CONTROL IS NOT OPTIONAL HERE, BECAUSE THE ANSWER THIS TOOL GIVES IS
# USUALLY "NO DIFFERENCE".** A perturbation that comes back identical reads as
# "proven inert" and is the most believable wrong answer available. The first
# control run against this harness -- moving `animate_walk_grouped`'s `bob=0.03`
# default to 0.031 -- reported 0 differences and the harness was BLIND: the
# biped wrapper `animate_walk` declares its own `bob=0.03` and forwards
# `bob=bob`, and the two multi-leg bodies pass `bob=BOB`, so the grouped
# default is shadowed on every path and perturbing it is a no-op by
# construction.
#
# So: **perturb a line that is unconditionally executed, ideally the exact line
# under test.** Re-armed as `phases[(f + shifts[g] + 1) % frames]` the control
# lights 26,276 floats across 8 of the 10 bodies. The 2 that stay at zero are
# `enemy_normal` (its own `animate_walk`, :342) and `enemy_vanguard` (its own,
# and its header says so), which never reach the shared gait -- **every zero is
# explained by code, not by story**, which is the bar. A partial control result
# is only trustworthy once you can name why each zero is a zero.
#
# THIS IS NOT THE WHOLE GATE. It compares rigs before export. Finish with
# `framesDigest` on the exported file -- that is the end-to-end confirmation on
# the artifact that actually ships, downstream of these floats.

import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Every body that imports the chassis. Derive it rather than trusting this list:
#     grep -l "import enemy_chassis" tools/blender/enemy_*.py | grep -v chassis
# `enemy_normal` and `enemy_vanguard` are here DELIBERATELY even though they
# author their own walks -- they are the negative-control anchors above, and
# dropping them removes the evidence that the zeros mean something.
BODIES = ("enemy_normal", "enemy_hedger", "enemy_tender", "enemy_dray",
          "enemy_drudge", "enemy_skimmer", "enemy_tun", "enemy_cooper",
          "enemy_courier", "enemy_vanguard")

TOL = 1e-9


def compare(path_a, path_b):
    with open(path_a) as fh:
        a = json.load(fh)
    with open(path_b) as fh:
        b = json.load(fh)
    total = differing = 0
    worst = 0.0
    for name in sorted(a):
        rows_a, rows_b = a[name]["rows"], b[name]["rows"]
        if len(rows_a) != len(rows_b):
            print("%-16s ROW COUNT DIFFERS %d vs %d"
                  % (name, len(rows_a), len(rows_b)))
            differing += 1
            continue
        d = 0
        w = 0.0
        for ra, rb in zip(rows_a, rows_b):
            for x, y in zip(ra[2:], rb[2:]):
                total += 1
                e = abs(x - y)
                if e > TOL:
                    d += 1
                w = max(w, e)
        differing += d
        worst = max(worst, w)
        print("%-16s frames %-4d objects %-4d differing floats %-7d max delta %.3e"
              % (name, a[name]["frames"], a[name]["objects"], d, w))
    print("\nTOTAL %d floats compared, %d differing, worst %.3e"
          % (total, differing, worst))
    return 0 if differing == 0 else 1


def dump(out_path):
    sys.path.insert(0, os.path.join(REPO, "tools", "blender"))
    stage = os.environ.get("TRIPOD_CHASSIS", "")
    if stage:
        # FIRST on the path, so every body's `import enemy_chassis` binds the
        # staged copy. td_scene and gait_solve still come from the repo.
        sys.path.insert(0, stage)

    import bpy
    import td_scene as td
    import enemy_chassis as chassis
    import export_mesh

    # PROVENANCE, PRINTED. If the staged copy silently failed to take, both runs
    # would use the same file and report a perfect match -- which is exactly
    # what a passing result looks like. Read this line before believing a zero.
    print("chassis loaded from: %s" % chassis.__file__)

    out = {}
    for name in BODIES:
        td.clear_scene()
        frames = export_mesh._build_enemy(name)()
        rows = []
        for f in range(1, frames + 1):
            bpy.context.scene.frame_set(f)
            bpy.context.view_layer.update()
            for obj in sorted(bpy.data.objects, key=lambda o: o.name):
                m = obj.matrix_world
                rows.append([obj.name, f] + [round(m[r][c], 9)
                                             for r in range(4)
                                             for c in range(4)])
        out[name] = {"frames": frames, "objects": len(bpy.data.objects),
                     "rows": rows}
        print("%-16s frames=%-4d objects=%-4d samples=%d"
              % (name, frames, len(bpy.data.objects), len(rows)))

    with open(out_path, "w") as fh:
        json.dump(out, fh, sort_keys=True)
    print("wrote %s" % out_path)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    if argv and argv[0] == "--compare":
        sys.exit(compare(argv[1], argv[2]))
    dump(argv[0])


main()
