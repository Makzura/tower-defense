---
name: siphon-sceptre-geometry
description: The measured constraints that decide how the Siphon's A3+ sceptre can move — reach window, a5 radius headroom, why only vertical works, and the AABB proof that a vertical lift is free
metadata:
  type: project
---

The A3+ sceptre's motion is boxed in by four measured constraints. All of them
cost real measurement; none should be re-derived.

**The defect that was fixed (2026-08-12).** `ARM_GROUPS[True]` rigged only the
RIGHT arm, but the sceptre is on the LEFT (RING at x=+0.315, PALM_L at +0.130,
weld on the left index tip). So `rig.get("hand_l", body)` fell back to the
static body node: the hand holding the staff could not move, while the shaft
swung on its own group pivoting about the ring's rim, and the rings were pinned
to `body`. One cause, all three of the owner's symptoms — dancing handle,
motionless head, not held. Fix: whole sceptre (shaft + weld + rings) rides
`hand_l`'s animated group; `_sceptre_pose`, `SCEPTRE_RAKE` and `SCEPTRE_YAW`
deleted.

**1. Rotation cannot raise the head.** The staff is near-vertical, so the head
sits almost directly above the butt, and under a rotation a point travels
*perpendicular* to its offset from the pivot. Every pivot gives the head
HORIZONTAL travel. Checked at the grip, the HANDS axis, and butt height.
Pivoting the rigid sceptre about the shoulder tops out at 1.5 px (suki).

**2. Horizontal is the expensive axis, vertical is free.** One unit of z is
16.49 screen px from *every* bearing and costs zero ground radius. Horizontal
runs 19.73 down to 10.91 and at the opposing bearing SUBTRACTS —
worst-bearing travel is about `16.49*tz − 10.91*|t_horizontal|`, so a bigger
gesture can measure smaller.

**3. a5 has 0.018 of ground-radius headroom.** The a5 sceptre vertex cloud is
already at 0.6416 against the 0.660 cap (a3 0.5857, a4 0.6122) — the outer ring
at major 0.178 eats it. This constraint *does not exist* until the rings join an
animated group, then appears instantly, because `posed_radius` starts counting
them. The one horizontal direction with zero radial component against the ring
is the tangent `(-0.782, 0.623)`; it is radius-free but NOT clearance-free
(its −x is toward the body, ~0.0235 off a 0.063 margin).

**4. The left arm's reach window is [0.1576, 0.4034]** (L1 0.2805, L2 0.1429,
REACH_MARGIN 0.020), rest |SH−WR| 0.3280. SH_L is only 0.292 above WR_L, so
lifting the wrist walks it *toward* the shoulder. Two feasible bands, with a
dead zone between:
- **Band one, lift ≤ 0.24** → up to 3.96 px of head travel. 0.24 leaves 0.0007
  of margin (too thin to ship); 0.23 leaves 0.0042 and is what shipped.
- **Dead zone 0.24–0.33** — the two-bone solve has no answer; `_elbow` raises
  rather than clamping (deliberately — an earlier clamped version silently
  pinned the elbow for half the cycle).
- **Band two, lift ≈ 0.40** restores |SH−WR| to 0.1844 and would buy 6.60 px,
  but the cycle must cross the dead zone. Untried.

**suki's AABB proof — a pure vertical lift cannot degrade `penetration` or
`clearance`.** Both are AABB tests: `td.overlap` takes the MIN over axes and
`clearance` the MAX over axes of the per-axis separations. A z-translation
leaves every x and y separation between the shaft's patch boxes and the cloth
wedges unchanged, and the shaft's clearance is won on a horizontal axis.

**The exception that actually bites, and it did.** The proof covers the shaft.
It does not cover the ARM, which is re-solved by the lift — `upper_l`, `fore_l`
and especially `drape_l` (a 0.115 x 0.068 x 0.35 box off the upper arm, not in
`_TOUCHABLE`) move in x and y. Measured cost of the 0.23 lift: clearance fell
from 0.063 (2.0 px) to 0.029 (0.9 px). Penetration stayed zero. Read the `who`
field for `drape_l` specifically rather than trusting the worst number.

**MIN_TRAVEL_PX (4.0) and REACH_MARGIN (0.020) are mutually exclusive for the
head, by 0.000479 blender units** — suki's proof, and it is the arithmetic my
own comment first only asserted:

    reach window           [0.15758, 0.40338]
    band ONE ends at lift  0.242092 -> head 3.9921 px
    lift for exactly 4.0px 0.242571 -> head 4.0000 px
    band TWO starts at     0.341908 -> head 5.6381 px
    shipped                0.230    -> head 3.7927 px

Band one tops out 0.008 px short of a 4.0 head gate. **Band two is closed too**
— `_amp` interpolates the lift continuously from zero, so every cycle crosses
the dead zone and `_elbow` would `SystemExit` mid-build. Reaching 4.0 needs the
tangential crossing (radius-free, ~a third of the clearance margin) or
different staff geometry. Never soften `REACH_MARGIN`: `_elbow`'s note records
a clamped solve pinning the elbow for half a cycle.

**How the fix is gated now.** `HEAD_MIN_PX = 3.00` (the head must visibly move)
and `HEAD_RATIO = 0.60` (head travel over butt travel). The ratio is the defect
expressed as a number: carried it is 1.000 because a rigid translation moves
both ends equally; pivoted on the rim it was 0.00003. `MIN_TRAVEL_PX` (4.0)
stays the WHOLE-MODEL gate and still passes at 4.82 px.

See [[visual-evidence-that-proves-nothing]] — the old build printed
"butt travels 0.428, head 0.000013" and PASSED, because the only gate was on
the butt.
