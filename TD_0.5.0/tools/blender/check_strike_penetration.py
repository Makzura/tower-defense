"""Clause 8 on a pose the exporter never sees: the composed strike.

WHY THIS EXISTS. `check_penetration.py` walks `range(1, frames + 1)` -- the
BAKED frames -- and for the Hedger it reports CLEAN, correctly. Nothing exports
the strike: `gl-world.js` composes it at draw time from `attackFlash` as a
per-group override matrix laid on top of the baked walk. So the body can satisfy
every gate in the pipeline and still have parts inside each other for half of
every gesture window. The instrument narrowed; the rule did not.

WHAT IT MEASURES, AND WHY IT IS NOT THE INSTRUMENT THAT ALREADY FAILED. A
minimum distance between vertex SETS stays positive straight through an
interpenetration -- a vertex can sit deep inside another solid's face without
being near any of that solid's vertices. That is not a subtle failure mode: it
is the one clause 8 was written from, whose own text records a first version
reporting "10 mm of clearance while the haft ran through the man's chest", and
it was reproduced again on this project in 2026-08 by a point-set sweep that
returned +0.02181 u of clearance at an angle with 0.0523 u of real penetration.

This module therefore reuses `check_penetration.scan`'s SOLID test unchanged --
per-part axis-aligned box overlap, positive only when the boxes overlap on all
three axes at once -- and changes only which POSE is measured. Same predicate,
same exemptions, same slack; new poses.

THE COMPOSITION IS THE RENDERER'S, NOT AN APPROXIMATION OF IT. `drawActor`
builds `instance * groupMatrix * override`, and the override is
`GLMath.localPose(pivot, 0, swing * flash, 0, 0, 0, 0)` -- a rotation about the
pivot in the GROUP'S OWN space. In Blender the group root's `matrix_world` is
that group matrix (the model root is identity), so the composed pose is exactly

    mast_root.matrix_world @ T(pivot) @ Ry(theta) @ T(-pivot)

applied after `frame_set`, over every walk frame, at every angle in the sweep.

Usage, under Blender's own Python:

    blender --background --factory-startup \
        --python tools/blender/check_strike_penetration.py -- \
        --body=enemy_hedger --angles=14,15,16,17,18,20,34
"""

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import bpy
from mathutils import Matrix, Vector

# `check_penetration.py` calls `main()` at module level, so a plain import runs
# the whole roster scan and exits. Load its source WITHOUT that trailing call so
# its predicate, exemptions and SLACK are the same objects this probe uses --
# re-implementing them here would let the two drift, which is the one thing a
# companion gate must not do.
def _load_check_penetration():
    import types
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "check_penetration.py")
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    if not source.rstrip().endswith("main()"):
        raise SystemExit("check_penetration.py no longer ends in a bare main() "
                         "call -- re-check how this probe loads it")
    source = source.rstrip()[:-len("main()")]
    module = types.ModuleType("check_penetration_lib")
    module.__file__ = path
    exec(compile(source, path, "exec"), module.__dict__)
    return module


cp = _load_check_penetration()


# The strike spec, mirrored from js/gl/gl-world.js STRIKE_BY_MODEL. Kept as a
# literal here on purpose: if this file and the renderer ever disagree, the
# probe must say so rather than silently measure whatever the renderer now does.
STRIKES = {
    "enemy_hedger": {"group": "mast", "pivot": (0.0, 0.0, 0.8004)},
}


def strike_matrix(pivot, radians):
    """`GLMath.localPose(out, pivot, 0, ry, 0, 0, 0, 0)`, as a Blender matrix.

    Rotate about the pivot in the group's own space. mira's sign rule is that a
    POSITIVE rotation about local Y takes local +x toward local -z, which is
    what `Matrix.Rotation(+ry, 4, 'Y')` does here and what `localPose` does
    there -- verified downstream by the tip landing where she authored it.
    """
    p = Vector(pivot)
    return Matrix.Translation(p) @ Matrix.Rotation(radians, 4, "Y") @ \
        Matrix.Translation(-p)


def bvh_overlap(a, b):
    """TRUE triangle-level intersection between two evaluated meshes.

    AABB overlap on all three axes is NECESSARY for interpenetration and not
    SUFFICIENT: two convex solids can have overlapping boxes and be far apart,
    and a flat plate rotated off-axis has a box far fatter than the plate. This
    project already measures ~0.105 u of PHANTOM box overlap on the Tyrant's
    blade-versus-hull pair, so a box result cannot decide an angle.

    `BVHTree.overlap` returns the actual intersecting triangle pairs, so an
    empty result is real clearance and a non-empty one is real interpenetration.
    Used to CLASSIFY what the box test flags, never to replace it -- the box
    test stays the gate because it cannot miss.
    """
    from mathutils.bvhtree import BVHTree
    deps = bpy.context.evaluated_depsgraph_get()
    trees = []
    for obj in (a, b):
        ev = obj.evaluated_get(deps)
        mesh = ev.to_mesh()
        verts = [obj.matrix_world @ v.co for v in mesh.vertices]
        polys = [tuple(p.vertices) for p in mesh.polygons]
        trees.append(BVHTree.FromPolygons(verts, polys, all_triangles=False))
        ev.to_mesh_clear()
    return trees[0].overlap(trees[1])


def group_objects(root):
    return [o for o in bpy.data.objects
            if o.type == "MESH" and cp.group_root(o) is root]


def scan_posed(module, frames, exempt, spec, radians):
    """`check_penetration.scan`, with the strike composed on before measuring.

    The pose is applied AFTER `frame_set` and never re-read from the action, so
    the animation system cannot quietly undo it between the write and the
    measurement.
    """
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    root = bpy.data.objects.get(spec["group"])
    if root is None:
        raise SystemExit("no group root named %r -- the strike group in "
                         "gl-world.js does not exist in this rig" % spec["group"])
    posed = group_objects(root)
    if not posed:
        raise SystemExit("group %r owns no meshes" % spec["group"])
    strike = strike_matrix(spec["pivot"], radians)

    worst = {}
    for frame in range(1, frames + 1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        base = root.matrix_world.copy()
        root.matrix_world = base @ strike
        bpy.context.view_layer.update()

        boxes = dict((o.name, cp.aabb(o)) for o in meshes)
        import itertools
        for a, b in itertools.combinations(sorted(boxes), 2):
            if exempt(a, b):
                continue
            la, ha = boxes[a]
            lb, hb = boxes[b]
            depth = min(min(ha[k] - lb[k], hb[k] - la[k]) for k in range(3))
            if depth > cp.SLACK and depth > worst.get((a, b), (0.0, 0))[0]:
                hits = bvh_overlap(bpy.data.objects[a], bpy.data.objects[b])
                worst[(a, b)] = (depth, frame, len(hits))

        root.matrix_world = base

    return posed, worst


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    body = "enemy_hedger"
    angles = [14.0, 15.0, 16.0, 17.0, 18.0, 20.0, 34.0]
    for arg in argv:
        if arg.startswith("--body="):
            body = arg.split("=", 1)[1]
        elif arg.startswith("--angles="):
            angles = [float(x) for x in arg.split("=", 1)[1].split(",")]

    spec = STRIKES.get(body)
    if spec is None:
        raise SystemExit("no strike spec for %r" % body)

    module = __import__(body)
    frames = cp.build(body, module)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    exempt, declared, ncontacts = cp.exempt_fn(module, meshes)

    print("STRIKE PENETRATION -- %s, group %r, pivot %s" %
          (body, spec["group"], spec["pivot"]))
    print("  solid test: per-part AABB overlap on all three axes "
          "(check_penetration.scan's predicate, unchanged)")
    print("  slack %g, %d walk frames, %d declared contact(s)"
          % (cp.SLACK, frames, ncontacts))
    print("  worst depth over ALL walk frames at each angle; "
          "positive = interpenetration\n")
    print("  %-8s %-12s %-10s %-6s %-8s %s" % ("angle", "box depth", "frame", "bvh", "realpairs", "worst pair"))

    rows = []
    for deg in angles:
        _, worst = scan_posed(module, frames, exempt, spec,
                              math.radians(deg))
        if worst:
            pair, rec = max(worst.items(), key=lambda kv: kv[1][0])
            depth, frame, hits = rec
            real = sum(1 for r in worst.values() if r[2] > 0)
            print("  %-8.1f %-12.5f %-10d %-6s %-8d %s / %s"
                  % (deg, depth, frame, ("REAL" if hits else "phantom"),
                     real, pair[0], pair[1]))
            rows.append((deg, depth if hits else 0.0))
        else:
            print("  %-8.1f %-12s %-10s %-6s %-8d %s" % (deg, "CLEAR", "-", "-", 0, "-"))
            rows.append((deg, 0.0))

    # THE INSTRUMENT MUST BE ABLE TO FAIL IN BOTH DIRECTIONS, and it says so
    # rather than leaving the reader to assume it.
    penetrating = [d for d, x in rows if x > 0.0]
    clear = [d for d, x in rows if x == 0.0]
    print("\n  penetrates at: %s" % (penetrating or "NOWHERE"))
    print("  clear at:      %s" % (clear or "NOWHERE"))
    if not penetrating:
        print("  *** BLIND: an instrument that reports clearance at every angle "
              "has not been shown able to fail. Do not quote it.")
        return 2
    if not clear:
        print("  *** NO ANGLE IN THIS SWEEP IS CLEAR. That is a geometry "
              "finding about the parts, not an angle to tune -- widen the "
              "sweep or change the drum and hub.")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
