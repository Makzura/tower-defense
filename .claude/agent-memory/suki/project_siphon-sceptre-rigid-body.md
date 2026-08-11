---
name: siphon-sceptre-rigid-body
description: The A3+ sceptre becoming one rigid body carried by the hand — the geometry that constrains it, and who owns which file
metadata:
  type: project
---

**2026-08-12.** The owner reported the Siphon's sceptre as "the handle dances,
the head doesn't move, and he doesn't hold it". The fix makes the sceptre one
rigid body carried by the gripping hand, and the A3+ beam origin (the ring)
therefore stops being a fixed point — an authorised change, with per-frame
origins exported to `siphon_origins.json` and carried into
`js/gl/siphon-beam-spec.js`.

**Why:** at A3+ only the right arm was rigged (`ARM_GROUPS[True]`), so the left
hand holding the sceptre was static; the shaft had its own animated group
pivoting on `join`, a point on the ring's rim; the rings were parented to the
static body. A shaft that swings, on a ring that cannot move, off a hand that
never moves — three symptoms, one cause.

**How to apply — the geometry that constrains any redesign here.** These are
measured, not derivable by reading:

- **The a5 sceptre cloud is at ground radius 0.6416 against the 0.660 per-frame
  cap** (a3 0.5857, a4 0.6122); the a5 outer ring, major 0.178, eats it. The
  moment the rings join an animated group they start counting against
  `posed_radius`, leaving **0.018 of outward room**. This constraint does not
  exist while the rings are pinned and appears the instant the fix is made.
- **Rotation cannot give the head vertical travel.** The staff is near-vertical
  so the head sits almost above the butt, and a rotated point moves
  perpendicular to its offset from the pivot — so rotation buys the head
  *horizontal* travel, which costs radius the model does not have. Pivoting the
  rigid sceptre about the shoulder measured 1.5 px of head travel before the cap
  bit. Dead end on every pivot tried (grip, HANDS, butt-height).
- **Only a vertical lift works.** 1 unit of z is 16.49 screen px from every
  bearing and costs zero ground radius. Horizontal ranges 19.73..10.91 and, at
  the bearing where they oppose, SUBTRACTS: worst-bearing travel is about
  `16.49*tz - 10.91*|t_horizontal|`, so adding horizontal can shrink the
  measured gesture.
- **A pure vertical lift cannot degrade `penetration` or `clearance`** — see
  [[aabb-axis-separation-proof]], which is the durable form of this and the
  single most valuable thing worked out on this job. The exception is `drape_l`.
- **The tangential direction (-0.782, 0.623)** is the one horizontal move with
  zero radial component against the ring, so it is RADIUS-free. It is NOT
  clearance-free: -x is toward the body, so a displacement `s` along it spends
  `0.782*s` of the shaft's 0.063 clearance (s = 0.03 costs 0.0235, s = 0.06
  costs 0.047). Kaz's mid-stroke bulge idea uses this.

**The arm reach arithmetic, exact — this is the crux and it is razor thin.**
Left arm L1 0.28048, L2 0.14290, window **[0.15758, 0.40338]**; rest |SH-WR|
0.32803, with `WR_L - SH_L = (-0.032, 0.146, -0.292)` so the flat part is
0.022340 and `|SH-WR|^2 = 0.022340 + (lift - 0.292)^2`. Lifting the wrist
straight up walks it TOWARD the shoulder to a minimum of 0.14947 at lift 0.292,
then away again. Two feasible bands with a dead zone between:

| | lift | head px (16.49/unit) |
|---|---|---|
| band one ends | **0.242092** | **3.9921** |
| lift for exactly 4.0 px | 0.242571 | 4.0000 |
| band two starts | 0.341908 | 5.6381 |
| kaz shipped | 0.230 | 3.7927 |

**`MIN_TRAVEL_PX = 4.0` and `REACH_MARGIN = 0.020` are mutually exclusive in
band one, by 0.000479 blender units.** Band one tops out 0.008 px short of the
gate. A straight vertical lift therefore cannot satisfy a 4.0 px head gate at
all — and it cannot simply jump to band two either, because `_amp` interpolates
lift continuously from 0, so every cycle would cross the dead zone and `_elbow`
would `SystemExit` mid-build. Reaching band two needs the hand displaced
horizontally while crossing, which is what the tangential direction above is
for, at the clearance price quoted. UNVERIFIED sketch, not measured: `s ≈ 0.04`
with lift ≈ 0.31 looked like it clears both, at about half the clearance.

**How to apply:** do not "fix" this by lowering `MIN_TRAVEL_PX` or
`REACH_MARGIN`. The file's own header records that the previous animation
shipped invisible precisely because it was signed off against a number measured
in the wrong space, and `_elbow`'s comment records that clamping the solve
pinned the elbow for half a cycle. Both floors are load-bearing.

**Where it stopped (2026-08-12, session ended by a restart).** Kaz built the
carried sceptre: the whole staff parents to `hand_l` and takes a pure vertical
lift, `SCEPTRE_LIFT 0.23`. Head and butt travel EXACTLY equally, because a rigid
translation moves both ends the same — the cleanest expression of the fix. Head
went 0.000013 units -> 3.79 px; the butt's travel went DOWN (the old rake gave it
0.428 units and the head nothing), and that is the right trade. My half —
`siphon_beam.py` reading the origins and emitting `originFrames` — is committed.

**The open item, and it is the whole point of the job:** 3.79 px is UNDER the
`MIN_TRAVEL_PX = 4.0` head-travel gate that was specified for exactly this
defect. Per the table above the gate cannot pass in band one at all. Verify
whether that gate was ever added; if it was added at a lowered value, that is
the file's original sin repeating.

**Ownership as of handover:** kaz took `siphon_idol.py` and
`siphon_origins.json`; suki owns `siphon_beam.py` / `siphon-beam-spec.js`; otto
owns `siphon-beam-draw.js` and the AGENTS.md:4293 `spoutPoint` row. Do not edit
AGENTS.md and let another agent edit it in the same 90-second autopush window —
say which lines you are touching first. See
[[stage-generator-work-offtree]] and [[team-comms-and-python-on-this-box]].
