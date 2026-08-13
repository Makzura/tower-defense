# Per-part, per-frame AABB penetration pass for the Dray.
#
#     blender --background --factory-startup #             --python tools/blender/enemy_dray_check.py
#
# WHY THIS EXISTS AND WHY IT LIVES HERE. `visual-pass/model-review.js` says in
# its own header that it has no interpenetration test at all, and `enemy-angry`
# shipped with a crank collar through an arm past every green gate in the
# project. AGENTS.md clause 8 gives the method -- solids as BOXES, per frame,
# with the supposed-to-touch pairs EXCLUDED and the reason stated in the code --
# and `tower_warbringer.penetration()` is the precedent for keeping such a check
# beside the body it checks rather than in a shared tool.
#
# IT FOUND TWO REAL DEFECTS ON THIS BODY that nothing else in the pipeline
# would have reported:
#
#   * the mid and rear feet ran 0.070 u -- 2.9 screen px -- through each other
#     on every frame, because the fore/aft leg pitch was shorter than the foot;
#   * the brass bands ran through the chassis rails once the drum was seated
#     0.012 deeper in its cradle, and `build()`'s own assert missed it because
#     the assert was written against the drum's radius while the bands stand
#     proud of it.
#
# TWO THINGS ABOUT THE METHOD, both learned the hard way on this body:
#
#   * `exempt()` MATCHES ON LIMB INDEX, NOT ON PREFIX ALONE. A prefix-only rule
#     that exempts "foot_ against knee_" exempts all six legs from EACH OTHER as
#     well as each leg from itself, and six colliding feet then read as a clean
#     model. Same-limb is a contact; cross-limb is a defect.
#   * THE REPORT IS SORTED WORST-FIRST, SO READ ITS HEAD. Reading the tail of it
#     is how the foot collision survived a first look.
#
# AN AABB PASS OVER-REPORTS UNDER ROTATION and that is the right direction to
# err. Two separated solids can have overlapping axis-aligned boxes once the
# body rolls, so a small hit near the slack threshold is worth confirming before
# it is treated as geometry. A CLEAN run is the strong result; a dirty one is a
# question.
#
# It generalises to any body in this directory: change the import and give it
# that body's declared contacts.
import os
import sys
import itertools

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import td_scene as td
import enemy_dray as dray

td.scene(ortho_scale=dray.ORTHO_SCALE)
frames = dray.export_build()

meshes = [o for o in bpy.data.objects if o.type == "MESH"]

# DECLARED CONTACTS. Each is a place two solids are SUPPOSED to touch, with the
# reason, exactly as clause 8 requires. A pair is exempt if both names match one
# rule's two sides.
EXEMPT = [
    # a leg is socketed into its rail and slides up into it through the swing
    ("knee_", "rail_"), ("knee_", "cross_brace_"),
    ("leg_", "rail_"), ("leg_", "cross_brace_"),
    ("foot_", "leg_"),          # the foot casting is bolted to its own shin
    ("knee_", "leg_"),          # knee and shin are one limb
    # the drum RESTS on the rollers -- contact is the whole point of a cradle
    ("drum", "cradle_roller_"),
    ("drum", "drum_"),          # shell, rims and bands are one assembly
    ("drum_", "drum_"),
    # the bench is bolted through its own plate to its own post
    ("bench_", "bench_"),
    # the lens is welded into its ring, and the ring into the prow
    ("lens", "lens_ring"), ("lens_ring", "prow"), ("lens", "prow"),
    # the prow head, the bench post and its bolt plate are one welded front
    # structure -- the post has to reach the deck through the prow to land on
    # anything at all
    ("prow", "bench_post"), ("prow", "bench_bolt_plate"),
    ("bench_foot_board", "prow"),
    # the cradle is one welded frame
    ("rail_", "cross_brace_"), ("cradle_roller_", "rail_"),
    ("cradle_roller_", "cross_brace_"), ("tail_plate", "rail_"),
    ("tail_plate", "cross_brace_"),
    ("bench_post", "rail_"), ("bench_post", "cross_brace_"),
    ("bench_bolt_plate", "rail_"), ("bench_bolt_plate", "cross_brace_"),
    ("prow", "rail_"), ("prow", "cross_brace_"),
]
SLACK = 0.0005   # a bevel's worth; below this two faces are coplanar, not inside


def limb(name):
    """The leg index a part belongs to, or None. foot_3 / knee_3 / leg_3_shin."""
    for pre in ("foot_", "knee_", "leg_"):
        if name.startswith(pre):
            tail = name[len(pre):].split("_")[0]
            if tail.isdigit():
                return int(tail)
    return None


def exempt(a, b):
    # Parts of the SAME limb are one solid by construction -- foot bolted under
    # shin under knee. Parts of DIFFERENT limbs are not, and a prefix-only rule
    # exempts those too, which is how six colliding feet read as clean.
    la, lb = limb(a), limb(b)
    if la is not None and la == lb:
        return True
    if la is not None and lb is not None:
        return False
    for x, y in EXEMPT:
        if (a.startswith(x) and b.startswith(y)) or (a.startswith(y) and b.startswith(x)):
            return True
    return False


def aabb(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return ([min(p[i] for p in pts) for i in range(3)],
            [max(p[i] for p in pts) for i in range(3)])


worst = {}
for f in range(1, frames + 1):
    bpy.context.scene.frame_set(f)
    bpy.context.view_layer.update()
    boxes = {o.name: aabb(o) for o in meshes}
    for a, b in itertools.combinations(sorted(boxes), 2):
        if exempt(a, b):
            continue
        la, ha = boxes[a]
        lb, hb = boxes[b]
        pen = min(min(ha[k] - lb[k], hb[k] - la[k]) for k in range(3))
        if pen > SLACK:
            key = (a, b)
            if pen > worst.get(key, (0, 0))[0]:
                worst[key] = (pen, f)

print("parts %d   frames %d   pairs tested %d"
      % (len(meshes), frames, len(list(itertools.combinations(meshes, 2)))))
if not worst:
    print("PENETRATION: none. Every undeclared pair is apart on some axis at every frame.")
else:
    print("PENETRATION: %d undeclared pair(s)" % len(worst))
    for (a, b), (pen, f) in sorted(worst.items(), key=lambda kv: -kv[1][0]):
        print("   %-22s %-22s  %.4f u  worst at frame %d" % (a, b, pen, f))

# The two gait clearances the header asserts, MEASURED per frame rather than
# reasoned -- max dip and max swing lift are in antiphase, so a max-against-max
# reading of these is wrong in the safe direction and tells you nothing.
print("")
print("frame  leg   foot top   rail floor    knee top   rail ceiling")
for f in range(1, frames + 1):
    bpy.context.scene.frame_set(f)
    bpy.context.view_layer.update()
    rail_lo = min(aabb(bpy.data.objects["rail_1"])[0][2],
                  aabb(bpy.data.objects["rail_-1"])[0][2])
    rail_hi = max(aabb(bpy.data.objects["rail_1"])[1][2],
                  aabb(bpy.data.objects["rail_-1"])[1][2])
    for i in range(6):
        ft = aabb(bpy.data.objects["foot_%d" % i])[1][2]
        kt = aabb(bpy.data.objects["knee_%d" % i])[1][2]
        flag = ""
        if ft > rail_lo:
            flag += "  *** FOOT IN RAIL ***"
        if kt > rail_hi:
            flag += "  *** KNEE OUT OF RAIL ***"
        if flag or i == 0:
            print("  %d    leg_%d   %.4f     %.4f      %.4f     %.4f%s"
                  % (f, i, ft, rail_lo, kt, rail_hi, flag))
