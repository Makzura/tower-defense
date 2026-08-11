---
name: aabb-axis-separation-proof
description: A pure single-axis translation cannot degrade penetration or clearance — both are AABB tests, so it leaves the other two axes' separations untouched
metadata:
  type: project
---

**A rigid translation along ONE axis cannot make `penetration` or `clearance`
worse, provided the separation is currently won on a different axis.** Do not
re-derive this and do not re-measure it per gesture; it is a proof, not an
observation.

**Why it holds.** Both checks in `tools/blender/siphon_idol.py` reduce two solids
to axis-aligned boxes and then combine the three per-axis numbers:

- `td_mesh.overlap` takes the **MIN over axes** of the per-axis overlaps and
  returns 0 the moment any axis is apart — so a pair separated on x is reported
  as clear whatever y and z do.
- `clearance` takes the **MAX over axes** of `max(fb.lo[k] - bb.hi[k],
  bb.lo[k] - fb.hi[k])` — so the reported gap is the axis that separates them
  best.

A translation along z changes only the z terms. Every x and y separation between
every weapon patch box and every cloth wedge is bit-identical before and after.
So if the binding separation is horizontal — which the Siphon's shaft is, its
0.063 is won on x — a vertical lift of ANY size leaves both numbers exactly
where they were.

**How to apply.** When a gesture is a pure translation on one axis, you do not
have to re-run the penetration search to justify it, and you do not have to buy
travel with clearance. This is what made the Siphon's fix tractable: the whole
gesture became a vertical lift precisely because z is the one direction that
costs nothing on radius (`posed_radius` is `hypot(x, y)`) AND nothing on
clearance.

**The exception, and it is the one to actually check.** Anything that is
re-SOLVED rather than translated still moves in x and y. On the Siphon that is
the left arm: `upper_l`, `fore_l` and especially `drape_l` (a 0.115 x 0.068 x
0.35 box, NOT in `_TOUCHABLE`, a plain AABB in `penetration`'s body list). So
shaft-vs-`drape_l` is the single weapon/body pair a vertical lift can genuinely
break — read that name out of the `who` field rather than trusting the worst
number alone.

**Corollary that bites:** the same reasoning says any HORIZONTAL component is
paid for twice — once against the 0.660 radius cap and once against clearance.
See [[siphon-sceptre-rigid-body]] for the measured price.
