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
# lights 26,276 floats across 8 of the 10 bodies. **ONE** body stays at zero:
# `enemy_normal`, which authors its own `animate_walk` (:342) and never reaches
# the shared gait -- **every zero is explained by code, not by story**, which is
# the bar. A partial control result is only trustworthy once you can name why
# each zero is a zero.
#
# CORRECTION, 2026-08-14. This paragraph used to name `enemy_vanguard` as a
# second zero "with its own walk, and its header says so". **That is false --
# `enemy_vanguard.py:152` is `import enemy_chassis as chassis`.** It reaches the
# shared gait like any other chassis body and it is not a negative control. The
# claim was believed because it travelled beside a true one about `enemy_normal`.
# A comment that misdescribes WHY a control is a control is worse than no
# comment: the next person preserves it for the stated reason.
#
# THIS IS NOT THE WHOLE GATE. It compares rigs before export. Finish with
# `framesDigest` on the exported file -- that is the end-to-end confirmation on
# the artifact that actually ships, downstream of these floats.

import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# WHICH BODIES THIS GATE COVERS -- DERIVED, NOT LISTED.
#
# The comment here used to give the derivation and then hand-maintain a literal
# beside it. That is the shape that fails silently: `enemy_tyrant` landed, was
# never added, and **the body we had just shipped sat outside its own gate.** A
# list that must be edited when a body is added will eventually not be.
#
# THE DERIVATION IS RUN, AND ITS RESULT IS PRINTED ON EVERY RUN. That is the
# whole point and it is not decoration -- swapping a literal for a comprehension
# nobody reads changes only where the omission hides. A derivation you have
# never watched produce a DIFFERENT answer is a literal with extra steps, so the
# coverage line is printed before any comparison runs, whether or not the gate
# passes.
def derive_bodies():
    """Every enemy build script that imports the chassis, by reading them."""
    blender = os.path.join(REPO, "tools", "blender")
    found = []
    for name in sorted(os.listdir(blender)):
        if not name.startswith("enemy_") or not name.endswith(".py"):
            continue
        if name == "enemy_chassis.py":
            continue
        with open(os.path.join(blender, name), encoding="utf-8") as handle:
            if "import enemy_chassis" in handle.read():
                found.append(name[:-3])
    return tuple(found)


# NEGATIVE-CONTROL ANCHORS: bodies that do NOT import the chassis and are
# covered anyway, so that a control run has a case which MUST stay at zero.
# Without one, "no differences" cannot be distinguished from "harness blind".
#
# `enemy_normal` only. It authors its own `animate_walk` at :342 and never
# reaches the shared gait. `enemy_vanguard` was listed here too and does not
# belong -- it imports the chassis (:152), so it is an ordinary covered body and
# its zero would have meant the harness was broken, not that the control worked.
ANCHORS = ("enemy_normal",)

BODIES = tuple(sorted(set(derive_bodies()) | set(ANCHORS)))

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


def print_coverage():
    """What this gate covers, derived and printed, before it does anything.

    UNCONDITIONAL AND FIRST. A gate that only tells you its scope when it fails
    lets a shrinking scope pass as a clean run -- which is exactly how
    `enemy_tyrant` shipped uncovered. Read this line before believing a pass:
    a zero from a gate covering nothing is still a zero.
    """
    derived = derive_bodies()
    print("coverage: %d bodies (%d derived + %d anchor)"
          % (len(BODIES), len(derived), len(ANCHORS)))
    print("  derived (import enemy_chassis): %s" % ", ".join(derived))
    print("  negative-control anchors:       %s" % ", ".join(ANCHORS))
    missing = [b for b in ANCHORS if b in derived]
    if missing:
        print("  *** ANCHOR IS NOT A CONTROL: %s imports the chassis, so its"
              " zero would mean the harness is blind, not that the control"
              " held. Remove it from ANCHORS or stop calling it a control."
              % ", ".join(missing))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    print_coverage()
    if argv and argv[0] == "--compare":
        sys.exit(compare(argv[1], argv[2]))
    dump(argv[0])


main()
