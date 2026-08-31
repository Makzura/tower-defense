# ---------------------------------------------------------------------------
# check_penetration.py -- per-PART, per-FRAME solid overlap for every body that
# implements the `export_build()` contract.
#
#     blender --background --factory-startup \
#             --python tools/blender/check_penetration.py
#     blender --background --factory-startup \
#             --python tools/blender/check_penetration.py -- --only=enemy_dray
#     blender --background --factory-startup \
#             --python tools/blender/check_penetration.py -- --selftest
#
# Exits nonzero if any UNDECLARED pair overlaps on all three axes at any frame.
#
# ---------------------------------------------------------------------------
# WHY THIS EXISTS
# ---------------------------------------------------------------------------
#
# `visual-pass/model-review.js` states in its own header that it has no
# interpenetration test at all, and `enemy-angry` shipped from e015ef5 with the
# crank collar passing through the arm -- 18 penetrating pairs, worst -0.0093 u
# -- with every gate in the project green. AGENTS.md clause 8 has always
# required this check and `tower_warbringer.penetration()` has always been the
# only body that ran one.
#
# It found two defects on the Dray that nothing else would have: six feet
# colliding at 0.070 u because the leg pitch was shorter than the foot, and the
# drum's brass bands passing through the chassis rails.
#
# ---------------------------------------------------------------------------
# THE FOUR RULES THIS IS BUILT ON, EACH OF WHICH HAS ALREADY COST SOMEBODY
# ---------------------------------------------------------------------------
#
# **1. PER PART, NEVER PER GROUP.** A group-level bounding-box check reports
# overlap on essentially every pair, because two group boxes intersect happily
# with every solid inside them far apart. That was tried, on this project, and
# the result is worse than no check: it gives CONFIDENCE rather than coverage.
#
# **2. THE REPORT IS SORTED WORST FIRST, AND SAYS SO IN ITS OWN OUTPUT.** I
# nearly accepted a body by reading the TAIL of my own severity-sorted report --
# seven sub-pixel contacts looked like a clean bill while the head of the same
# output showed feet running 2.9 screen px through each other. The banner below
# exists so the next reader cannot make that mistake quietly.
#
# **3. A BODY WITH NO CONTACT LIST IS SUSPICIOUS, NOT CLEAN.** Real bodies touch
# themselves everywhere -- a foot on its own shin, a drum on its rollers, a hand
# on a haft. Those are DECLARED, in the body's own module, WITH A REASON, which
# is what clause 8 asks for ("exclude the parts that are SUPPOSED to touch, and
# state why in the code"). A module that declares nothing is reported as
# undeclared rather than passed.
#
# **4. LIMB-INTERNAL PAIRS ARE NOT CHECKED, AND THAT IS PRINCIPLED.** Parts
# sharing an animated LIMB root are one rigid solid: they never move relative to
# each other, so their overlaps are joints by construction. A limb root is
# identified structurally -- an animated node that itself rides on another
# animated node -- so this needs no naming convention and no per-body list.
#
# **The BODY root is deliberately NOT treated that way.** Everything else hangs
# off it, it is where a drum meets a rail, and exempting it would have hidden
# one of the two Dray defects.
#
# ---------------------------------------------------------------------------
# WHAT AN AABB PASS CAN AND CANNOT TELL YOU
# ---------------------------------------------------------------------------
#
# It over-reports under rotation, and that is the right direction to fail. Two
# separated solids can have overlapping AXIS-ALIGNED boxes once the body rolls,
# so a small hit is a QUESTION and a clean run is the strong result. It also
# under-reports shape: a box is a poor proxy for a diagonal taper, whose box is
# mostly air -- so a hit on a long thin diagonal member deserves a look at the
# solid before it is believed.
#
# Neither limitation is a reason to skip it. The defects it has actually caught
# were all box-on-box and all unambiguous.
#
# ---------------------------------------------------------------------------
# DECLARING CONTACTS IN A BODY MODULE
# ---------------------------------------------------------------------------
#
#     PENETRATION_CONTACTS = [
#         ("drum", "cradle_roller_", "the drum RESTS on the rollers"),
#         ("knee_", "rail_",         "a leg is socketed into its rail"),
#     ]
#
# Each entry is (prefix_a, prefix_b, reason) and matches in either order. Keep
# the reason a real sentence: it is the only record of why a pair was excused,
# and clause 8's failure mode is a check whose exclusions quietly grew until it
# measured the requirement instead of the defect.
# ---------------------------------------------------------------------------

import os
import sys
import itertools

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Vector
import td_scene as td

# A bevel is 0.012 wide, so two faces meeting within a fraction of that are
# coplanar rather than inside one another. Deliberately an order of magnitude
# below the bevel: the point is to drop exact-touch noise, not real overlap.
SLACK = 0.0005


def _argv():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def _opt(name, default=None):
    for arg in _argv():
        if arg.startswith("--%s=" % name):
            return arg.split("=", 1)[1]
    return default


def _flag(name):
    return ("--" + name) in _argv()


def bodies():
    """Every enemy module exposing `export_build()`, excluding the chassis.

    Derived from the directory rather than listed, so a new body is covered the
    day it lands instead of the day somebody remembers this file.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    out = []
    for entry in sorted(os.listdir(here)):
        if not entry.startswith("enemy_") or not entry.endswith(".py"):
            continue
        name = entry[:-3]
        if name == "enemy_chassis":
            continue
        module = __import__(name)
        if hasattr(module, "export_build"):
            out.append((name, module))
    return out


def group_root(obj):
    """The nearest animated ancestor, matching `export_mesh._group_root`."""
    node = obj
    while node is not None:
        data = getattr(node, "animation_data", None)
        if data and data.action:
            return node
        node = node.parent
    return None


def is_limb(root):
    """A limb root rides on ANOTHER animated root; the body root does not.

    Structural, so it needs no naming convention: `leg_3` hangs off
    `colossus_body`, and `colossus_body` hangs off the model root, which is not
    animated.
    """
    return root is not None and root.parent is not None and \
        group_root(root.parent) is not None


def aabb(obj):
    pts = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return ([min(p[i] for p in pts) for i in range(3)],
            [max(p[i] for p in pts) for i in range(3)])


def exempt_fn(module, meshes):
    contacts = getattr(module, "PENETRATION_CONTACTS", None)
    declared = contacts is not None
    contacts = contacts or []
    roots = dict((o.name, group_root(o)) for o in meshes)

    def exempt(a, b):
        ra, rb = roots[a], roots[b]
        # Rule 4: one rigid limb. Never the body root.
        if ra is not None and ra is rb and is_limb(ra):
            return True
        for entry in contacts:
            x, y = entry[0], entry[1]
            if (a.startswith(x) and b.startswith(y)) or \
               (a.startswith(y) and b.startswith(x)):
                return True
        return False

    return exempt, declared, len(contacts)


def scan(module, frames, exempt):
    """Worst overlap per undeclared pair, over every frame. Depth in units."""
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    worst = {}
    for frame in range(1, frames + 1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        boxes = dict((o.name, aabb(o)) for o in meshes)
        for a, b in itertools.combinations(sorted(boxes), 2):
            if exempt(a, b):
                continue
            la, ha = boxes[a]
            lb, hb = boxes[b]
            depth = min(min(ha[k] - lb[k], hb[k] - la[k]) for k in range(3))
            if depth > SLACK and depth > worst.get((a, b), (0.0, 0))[0]:
                worst[(a, b)] = (depth, frame)
    return meshes, worst


def moving_pair(roots, a, b):
    """Do these two parts move RELATIVE to each other over the cycle?

    THIS IS THE WHOLE VALUE OF THE REPORT ON AN UNDECLARED BODY. Two parts on
    the same animated root are rigid with respect to one another: their overlap
    is identical on every frame and is nearly always construction -- a band
    around a torso, a lens in its ring, a neck into a collar. Two parts on
    DIFFERENT roots swing through each other, and that is the class the Hedger's
    crank collar belonged to.

    So a body with no contact list still yields a short actionable list, instead
    of a hundred lines of its own welds.
    """
    return roots[a] is not roots[b]


def build(name, module):
    td.scene(ortho_scale=getattr(module, "ORTHO_SCALE", 1.5),
             tile_w=64, tile_h=64)
    return module.export_build()


def run(name, module):
    frames = build(name, module)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    exempt, declared, n_contacts = exempt_fn(module, meshes)
    meshes, worst = scan(module, frames, exempt)
    pairs = len(list(itertools.combinations(meshes, 2)))
    limbs = sorted(set(r.name for r in
                       (group_root(o) for o in meshes) if is_limb(r)))

    print("")
    print("=" * 74)
    print("%s   %d parts, %d frames, %d pairs" % (name, len(meshes), frames,
                                                  pairs))
    print("  limb roots (internal pairs not checked): %s"
          % (", ".join(limbs) if limbs else "none"))
    if declared:
        print("  declared contacts: %d" % n_contacts)
    else:
        print("  *** NO PENETRATION_CONTACTS IN THIS MODULE -- every"
              " supposed-to-touch pair below is unexcused, which makes this"
              " list a starting point rather than a defect list ***")
    if not worst:
        print("  CLEAN. Every undeclared pair is apart on some axis at every"
              " frame.")
        return 0
    roots = dict((o.name, group_root(o)) for o in meshes)
    items = sorted(worst.items(), key=lambda kv: -kv[1][0])
    mov = [i for i in items if moving_pair(roots, i[0][0], i[0][1])]
    sta = [i for i in items if not moving_pair(roots, i[0][0], i[0][1])]

    def show(rows):
        for (a, b), (depth, frame) in rows:
            print("    %-24s %-24s %8.4f u   worst at frame %d"
                  % (a, b, depth, frame))

    print("  %d UNDECLARED OVERLAP(S), SORTED WORST FIRST -- READ THE TOP OF"
          " EACH LIST." % len(worst))
    print("  -- MOVING pairs (%d): different animated roots, so these swing"
          " through each other." % len(mov))
    if mov:
        show(mov)
    else:
        print("    none")
    print("  -- STATIC pairs (%d): one rigid assembly, identical every frame;"
          " usually construction." % len(sta))
    show(sta[:12])
    if len(sta) > 12:
        print("    ... and %d more static pair(s), suppressed." % (len(sta) - 12))
    return len(worst)


def selftest(name, module):
    """Prove the check CAN fail before believing that it passed.

    A gate that has never been seen red is not evidence. This builds the body,
    confirms it clean, then translates one part bodily into another and
    confirms the same code reports it. Both halves are required: a check that
    is always green and a check that is always red look identical from one run.
    """
    print("SELF-TEST on %s -- a check that cannot fail is not a check.\n" % name)
    frames = build(name, module)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    exempt, _declared, _n = exempt_fn(module, meshes)
    _m, before = scan(module, frames, exempt)
    print("  baseline                     %d undeclared overlap(s)" % len(before))

    # Pick two parts on the SAME root that are currently apart, and move one
    # onto the other. Same root so the perturbation is not itself excused, and
    # apart-now so any hit is caused by this move rather than pre-existing.
    body_parts = [o for o in meshes
                  if group_root(o) is not None and not is_limb(group_root(o))]
    victim = donor = None
    for a, b in itertools.combinations(sorted(body_parts, key=lambda o: o.name), 2):
        if not exempt(a.name, b.name) and (a.name, b.name) not in before:
            victim, donor = a, b
            break
    if victim is None:
        print("  SELF-TEST INCONCLUSIVE: no separated undeclared pair to use.")
        return 1

    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    offset = (donor.matrix_world.translation - victim.matrix_world.translation)
    victim.location = victim.location + offset
    bpy.context.view_layer.update()
    print("  perturbed                    %s moved onto %s"
          % (victim.name, donor.name))
    _m, after = scan(module, frames, exempt)
    print("  after perturbation           %d undeclared overlap(s)" % len(after))

    hit = (victim.name, donor.name) in after or (donor.name, victim.name) in after
    if hit and len(after) > len(before):
        print("\n  SELF-TEST PASSED: the check went red on a deliberate"
              " overlap it had not seen before.")
        return 0
    print("\n  *** SELF-TEST FAILED: a part was moved bodily inside another and"
          " this check did not report that pair. Do not trust a green run. ***")
    return 1


def main():
    only = _opt("only")
    wanted = set(v.strip() for v in only.split(",")) if only else None
    all_bodies = bodies()
    todo = [(n, m) for n, m in all_bodies if wanted is None or n in wanted]
    if not todo:
        print("no matching body modules (have: %s)"
              % ", ".join(n for n, _ in all_bodies))
        sys.exit(2)

    if _flag("selftest"):
        sys.exit(selftest(*todo[0]))

    print("PER-PART, PER-FRAME SOLID OVERLAP -- AGENTS.md clause 8.")
    print("Depths are Blender units. Lists are SORTED WORST FIRST.")
    total = 0
    for name, module in todo:
        total += run(name, module)
    print("\n%s\n%d undeclared overlap(s) across %d bod%s."
          % ("=" * 74, total, len(todo), "y" if len(todo) == 1 else "ies"))
    sys.exit(1 if total else 0)


main()
