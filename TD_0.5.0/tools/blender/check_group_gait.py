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
# under test.** Re-armed on the exact line under test, the control lights
# **24,236 floats of 217,152, across 8 of the 11 bodies. THREE stay at zero, and
# all three are predicted rather than anomalous:**
#
#     enemy_normal     does not import the chassis at all; own walk at :342
#     enemy_tyrant     imports it, calls neither walk function
#     enemy_vanguard   imports it, calls neither walk function
#
# Re-measured 2026-08-14 over the current population. **Every zero is explained
# by code, not by story** -- that is the bar, and a partial control result is
# only trustworthy once you can name why each zero is a zero.
#
# **A BODY REACHES THE SHARED GAIT BY EITHER OF TWO PATHS, AND GREPPING FOR ONE
# OF THEM IS WHY THIS COMMENT HAS NOW BEEN WRONG TWICE.** Directly via
# `chassis.animate_walk_grouped` (`enemy_dray.py:650`, `enemy_hedger.py:705`,
# `enemy_tender.py:314`), or via the biped wrapper `chassis.animate_walk`
# (`enemy_chassis.py:857`), which calls it at :881. Cooper, Courier, Drudge,
# Skimmer and Tun take the wrapper. A grep for `animate_walk_grouped` alone
# shows five of the eight and makes the other three look like anomalies.
#
# **AND `AGENTS.md` ALREADY SAID SO -- SEE ITS CLAUSE AT ~:4473, "prefer immunity
# by CONSTRUCTION to immunity by arithmetic".** It clears both bosses of the
# `groups[0][0]` steering defect on the grounds that "neither module calls the
# defective functions at all", and it names `chassis.animate_walk_grouped` in the
# list. That is this whole paragraph in one sentence, and it was in the source of
# truth before any of the three of us derived it -- from source, from the call
# graph, and from a Blender run. **When a dispute is about a MECHANISM, grep
# `AGENTS.md` before grepping the code** (petra's rule, and she is the archivist,
# so it cost her most to say). Note also WHY that clause survived the Tripod
# landing while my sentence rotted: it names the REASON, which keeps holding when
# the leg count changes. Stated as a count it would have gone stale the same day.
#
# **THE ROOT CAUSE IS ONE SCREEN BELOW, IN THE CODE.** `derive_bodies()` selects
# on `"import enemy_chassis" in handle.read()` -- **the population is defined by
# IMPORT and the perturbation propagates by CALL.** Those sets are not equal and
# they diverge by exactly the bodies that import the chassis for palette and
# geometry only. Today that is the Tyrant and the Vanguard; it will be true of
# every future body built that way, so expect this list to grow and do not read
# a new zero as a broken harness.
#
# TWICE-WRONG, RECORDED, BECAUSE THE SHAPE REPEATS. This paragraph first named
# two zeros and was right when written. A later edit deleted `enemy_vanguard` on
# the grounds that it imports the chassis and therefore "reaches the shared gait
# like any other chassis body" -- **the false step is `import => reaches`**, and
# it left `8 of the 10` standing beside a single named zero, so the arithmetic
# contradicted itself by exactly one body in a comment whose own closing rule is
# that every zero must be named. Then the Tyrant landed and made the original
# sentence stale too. **A citation can rot in both directions: the claim can go
# false, and the population it was true of can change underneath it.**
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
# `enemy_normal` only, and the reason is exact: **it is the only body that does
# not import the chassis at all**, which is what `derive_bodies()` selects on, so
# it is the only one that would be missed without being named here. Verified:
# zero matches for `import enemy_chassis`.
#
# **`enemy_vanguard` and `enemy_tyrant` also read zero under the control, and
# that is CORRECT rather than a broken harness.** They import the chassis for
# palette and geometry but call neither `animate_walk_grouped` nor the
# `animate_walk` wrapper that reaches it -- see the header. They are held out of
# ANCHORS only because the anchor set is defined by IMPORT and not by CALL, which
# is the same mismatch the header is about. **Keep the code, and do not read
# their zeros as a fault.**
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
