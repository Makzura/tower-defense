# BRIEF — the Vanguard (`enemy-boss_fast`)

Written 2026-08-13 by mira, art director for models, **before any modelling**,
from Diego's leg direction and the approved identity relayed by kaz. Built to
`HOUSE-STANDARD.md`. Its companion is `BRIEF-enemy-boss-tyrant.md`, which
carries the shared gait law in full; **read §0 there before this document.** The
two bosses share one primitive and one law, and the whole point of this brief is
that they use them **inverted**.

Model id is `enemy-boss_fast`, from `typeId`. No tiers.

**Every pixel figure below is arithmetic: geometry times a measured
projection.** The projection was measured through the game's own `gl-math` and
`gl-camera`, composed exactly as `drawActor` composes, at the fitted default
camera (distance 2022, target [640, 360, 0]), viewport 1280 x 720, basis
geometric coverage. At `sizeScale` 1.9 that is **37.52 screen px per model unit
along model x, 31.61 along model z.** Nothing here has been rendered —
`enemyModel()` returns null for `boss_fast` today and the body draws as a
sphere. **The read judgement is owed to juno once a mesh exists.**

---

## 0. THE LAW — see the Tyrant brief §0, which is authoritative

The short form, because the numbers here depend on it:

> **One walk cycle is exactly 0.899281 MODEL UNITS of travel along model +x, for
> every body, at every `sizeScale`, at every speed. A leg planted across P
> consecutive displayed frames has P−1 TRANSITIONS, and its contact must sweep
> backward by `(P − 1) × 0.899281 / F`.**

Slip has two components. **A** is authored gait error and its target is zero.
**B** is the quantization sawtooth — `bandFrame` floors, so the pose is held
while the body advances — with amplitude exactly `S / F`, unremovable, and its
only lever is F. Gate: **`tools/check-gait-slip.js`**.

### F = 36, and this is the one number that changed since the gait paragraph

    F_min = S x 19.75 x sizeScale = 0.899281 x 19.75 x 1.9 = 33.7

| F | sawtooth | on a 29.2 px body |
|---|---|---|
| 8 | **4.21 screen px** | 14% of the figure, 12.9 times a second |
| 12 | 2.81 px | 10% |
| **36** | **0.94 px** | **sub-pixel** ✔ |

**F = 36.** Frames are one 4x4 per animated group per frame — they cost bytes
and **zero triangles** — so this is the cheapest correction available anywhere
in this pass. The Vanguard was initially scoped "near 8" on a pose-rate
argument; the sawtooth is the better argument and it overrides it. **If 36 is a
problem, do not solve the angle yourself — the blade geometry depends on F and
mira re-solves it.**

---

## 1. WHAT THE BODY SAYS

**The Vanguard's only job is arriving.** Everything about it is subordinate to
that and nothing else about it is interesting, which is the design.

From `js/enemy.js`: 750 HP — a fifth of the Tyrant — and **the fastest thing in
the game**, 87.5 u.l./s, doubled to 175 for the first 400 u.l. So **the ground
where a board is thinnest is the ground it crosses quickest.** Every seven
seconds it refreshes 100 shield on itself, and those do not stack: what it costs
the player is **tempo**, not attrition. A board that cannot remove 100 shield
plus a slice of health inside seven seconds never touches the body at all.

It has **no attack**. It does not stop, it does not aim, it does not turn. It is
a body you have a fixed and very short number of seconds to remove.

Two consequences, and both are subtractions:

- **It carries NO cargo cage.** `cargo_cage()` is the one part every body in the
  faction shares. **The Vanguard is the only body that does not have one, and
  that absence is its identity.** It is not hauling; it is arriving. Per
  `HOUSE-STANDARD.md` §2, a tier or a body that reads differently because
  something was **removed** beats one that reads differently because something
  was added — it costs less, it resolves better, subtraction is legible at a
  glance where added parts at 0.5 px are not, and **a removal that changes the
  outline is view-independent.** `sniper-a4` is the worked precedent: the
  cheapest tier and the most distinct, because of what it takes away.
- **The most stripped body in the faction at the largest size.** At `sizeScale`
  1.9 it is the second-biggest thing on the board and it has the least on it.
  That contrast is the whole silhouette: **a big empty frame moving fast.**

**The faction read has to be carried by something else, and it is carried by the
palette and the blades** — `tin_dark` hull, `tin` blades, one `brass` strap. Not
by the cage, which is gone on purpose.

---

## 2. THE LEGS — Diego's direction, INVERTED, and the reason

> *"Instead of normal legs I was thinking 2 big moving triangles as legs,
> perpendicular to the ground."*

**"Perpendicular to the ground" is resolved the same way as on the Tyrant: the
triangle's PLANE is vertical and contains the travel axis.** The blade lies in
the x–z plane and rotates only about y, so it is a vertical plate at every
frame, never presents as a line, and shows its full triangular area at camera
yaw 0 — the bearing path direction buckets to on **25 of 42 road segments across
all six maps.**

### The ruling, and it is the reason this brief exists

**Triangular legs SERVE the Vanguard, but only inverted. Apex DOWN.** An
apex-up isoceles — the Tyrant's orientation — **fights this card and must not be
used here.**

The reason is one sentence, and it is geometric rather than atmospheric:

> **A triangle reads as stable when its centre of area sits over a wide base,
> and as falling when its centre of area sits ahead of a point contact. Same
> shape, opposite orientation, opposite read.**

The Tyrant is the first case and wants it. The Vanguard is the second and its
card — *mass pitched ahead of its feet, already falling forward* — is the second
case stated in words. **A broad-based triangle on this body would be a
silhouette that contradicts the card**, which is the one failure a brief exists
to prevent.

Two things follow that were not the reason and are worth more than it:

1. **A point contact has ONE contact identity and no heel-to-toe handover**, so
   the zero-slip arithmetic on this body is a single clean identity instead of
   two arcs with an owner change between them. It is the easier of the two
   bodies to get right.
2. **The two bosses become the same primitive mirrored in z.** The Tyrant stands
   on its bases, the Vanguard on its points. They read as a faction rather than
   as two unrelated bodies, and **Diego's instruction lands on both bodies
   instead of being spent on one.** This is what decided it for kaz and it is
   not something I went looking for.

**Ruled and accepted by kaz. Build to it.**

### The blade

Two identical blades, mirrored in y. Leg-local coordinates, **hip pin at the
origin**, a scalene triangle raked forward:

| vertex | leg-local (x, z) | what it is |
|---|---|---|
| **A** | (0.00, 0.00) | the hip pin — top-REAR corner |
| **B** | (+0.34, −0.06) | top-FRONT corner, the forward overhang |
| **C** | (−0.08, −0.41) | **the ground apex — the contact, and it sits BEHIND the pin** |

Read that table as the card: the bulk of the blade hangs **forward** of a
contact point that sits **behind** the hip, and the body above it is thrown
further forward still. **That is "mass pitched ahead of its feet" as a
coordinate rather than as a mood**, and it is the sentence to check the built
model against.

- **Blade span: 0.44 u in x by 0.41 u in z** — **16.5 x 13.0 screen px**. A
  clearly-read triangle at game scale.
- **Thickness in y: 0.10 u.** Blades at y = ±0.09, spanning [0.04, 0.14] and
  [−0.14, −0.04] — **0.08 u of clear air between their facing faces at every
  frame.** Blade-against-blade interpenetration is structurally impossible.
- **The leading edge B→C is the long edge**, 0.424 u, running down and
  *backward*. It is the edge that carries the read and it must stay unbroken —
  no cuts, no notches, no windows in it.

---

## 3. THE GAIT

**The blade does not translate. It rotates about the hip pin A through a
continuous arc of ±25.24°, and the single ground apex C is the contact for the
whole of every support phase.**

### Contact, and which apex

**C, the bottom apex, always. There is no handover and no second pivot.** The
contact never changes owner, so — unlike the Tyrant — the gait check needs no
per-corner bookkeeping and no mandatory flat frame. This is the structural
advantage of the inverted orientation and it is why suki's junior was never
exposed to the measurement dispute that held the Tyrant.

### The arithmetic, and it closes exactly

The apex's position along the travel axis is `x(θ) = −0.08 cos θ − 0.41 sin θ`.
The `−0.08 cos θ` term is common to both extremes and **cancels**, so:

    contact sweep  =  2 x 0.41 x sin θm  =  0.82 sin θm

Required, at P = 15 planted frames of F = 36:

    (P - 1) x S / F  =  14 x 0.899281 / 36  =  0.349720 u

    0.82 sin θm = 0.349720   ->   sin θm = 0.4264878   ->   θm = 25.245 deg

**Exact, to six places.** Suki's builder verified it a second way and the second
form is the more illuminating one: `2 |C| cos(11.041°) = 0.82000` exactly, where
`|C| = 0.417732` and `11.041° = atan(0.08 / 0.41)`. **So the 0.82 lever arm is
the true horizontal reach of an apex 11.041° off vertical, not a rounding of
2 × 0.41.**

> **CORRECTION, and it matters because it is a design lever rather than a
> detail. C's x offset cancels out of the STRIDE and DRIVES THE PITCH — an
> earlier revision of this line called it simply "free", which is wrong.**
>
> | C's x | stride sweep | pin-height drop through stance |
> |---|---|---|
> | 0.00 | identical | 0.0392 u, **symmetric** — a bounce |
> | **−0.08** | identical | **0.0810 u, asymmetric** — a fall |
>
> Both give exactly the same 0.349720 u of contact travel. **Only C's depth
> (0.41) and θm are load-bearing for the stride; C's x is load-bearing for the
> gait's character.** Moving it fore or aft is how the forward-lean read is
> tuned, and it must be tuned **before export** — see §3's free drop, which has
> no later fix at the animation stage.

### Duty, and the float phase

**P = 15 planted frames of 36 per blade, the two blades offset by 18.** Blade L
holds frames 0–14, blade R holds 18–32. **Frames 15–17 and 33–35 have neither
blade down — 6 of 36, a 16.7% float phase.**

**The float is not a compromise, it is the card.** Both feet leave the ground
for a sixth of every cycle, and **a body that leaves the ground is a body that
is falling.** The Tyrant gets 25% double support for the opposite reason: it
must survive being frozen mid-stride. The Vanguard has **no `windUpTimer` and no
attack**, so it is never deliberately stopped by its own behaviour — only by a
player's slow or stun, which is rare and brief. **The two duty cycles are the
two cards, and they are opposite on purpose.**

### Ramp the CONTACT, not the angle

Solve θ per frame so that `−0.41 sin θ` is linear in frame index — an `arcsin`
ramp — rather than ramping θ linearly. Same instruction as the Tyrant, same
reason, and cheaper here because there is only one contact to linearise.

### The free drop — do not author it a second time

Pin height above the contact is `0.41 cos θ − 0.08 sin θ`, equivalently
`|C| cos(θ + 11.041°)`:

| θ | pin height | where in the stance |
|---|---|---|
| −25.245° | 0.40496 | plant |
| **−11.041°** | **0.41773** | **the true peak — inside the swing range** |
| 0° | 0.41000 | mid-stance |
| **+25.245°** | **0.33673** | toe-off |

**The body rises 0.0128 u through the first sixth of every stance and then DROPS
0.0810 u — 2.56 screen px, 4.89 board px — through the rest of it**, then
recovers across the 3 float frames.

> **The peak is at θ = −11.041°, NOT at θ = 0, and an earlier revision of this
> table missed it by sampling the endpoints and the midpoint.** The true maximum
> sits *inside* the swing range, so endpoint sampling under-reported the drop by
> 10%. This is `HOUSE-STANDARD.md`'s own rule — **quote the extreme, not sampled
> points** — caught by suki's builder. Found and corrected the same day.

It is not authored, it falls out of the geometry, and it is exactly the right
motion: **the body pitching forward over its own contact and being caught by the
next blade.** On a sprinting body it reads as a bound, and at 7.7% of the
figure's height it sits inside the 5–10% vertical oscillation a real run has.

**APPROVED AS IS. Do not author a bob on top of it** — an authored bob fights
the geometric one and produces a limp. During the 3-frame float the body is
unconstrained and should continue the fall ballistically until the next plant
catches it.

**And note what CANNOT be fixed later: the pitch is fixed by C, so damping it
means moving C and re-solving θm through `2|C| cos(11.041°) sin θm = 0.349720`.
There is no keyframe-stage fix.** If it is ever to be reduced, that decision has
to be taken before export.

### The swing

The returning blade travels θ = +25.24° → −25.24° across the remaining 21
frames. **Its lowest vertex must be ≥ 0.02 u above z = 0 on every swing frame**,
peaking at 0.05 u (1.6 screen px) at mid-swing.

### The sprint costs nothing, and cannot be authored

The cycle is keyed to distance, so **the sprint doubles cadence for free** —
1.610 cycles/s at cruise, 3.220 during the opening 400 u.l. **There is no way to
author a sprint pose.** `gl-world.js:1367` takes `walkBand(em)`, which is
`bands[0]` or the whole strip; **a ground enemy can only ever use band 0**, and
no state input reaches the frame index. Do not build a second strip; it would
never be selected.

---

## 4. SILHOUETTE AND PROPORTION

    z = 1.050  ---- rear stack top -------------  the TALLEST point is at the BACK
    z = 0.900  ---- spine, at the rear ---------
    z = 0.620  ---- spine, at the front --------  the top edge slopes DOWN forward
    z = 0.541  ---- hull underside -------------
    z = 0.410  ---- hip pins -------------------  blade top-rear corner A
    z = 0.000  ---- road -----------------------  blade apex C

| element | model units | screen px (arithmetic) | fraction of figure height |
|---|---|---|---|
| **total height** | 1.050 | **33.2** | 1.00 |
| the two blades | 0.410 | 13.0 | **0.39** |
| rear stack | 0.500 tall, 0.150 long | 15.8 x 5.6 | 0.48 |
| spine, front-to-back | 0.670 long | 25.1 | — |
| free drop through stance | 0.073 | 2.3 | 0.07 |

**Read as a black cutout, side-on: a wedge falling forward.** The tallest point
is at the **back**; the top edge slopes down and forward across the whole body;
the prow is the lowest and forwardmost thing; and the two blades taper to points
that sit *behind* all of it. **Which side is heavier: the front, unambiguously,
and it is the answer to the Tyrant's deliberate symmetry.** Where the Tyrant is
a shape that is going nowhere in particular, the Vanguard is a shape that is
already leaving.

### The number this body is judged on

    prow tip                          x = +0.520
    forwardmost contact (C at -25.24) x = +0.084
    OVERHANG                          = 0.436 u = 16.4 SCREEN PX

**The body hangs 16.4 screen px — half its own screen width — past its own
leading foot.** That is "already falling forward" expressed as a measurement,
and it is the single figure to check the built model against. If a review has
time for one number on this body, it is this one.

### Nothing may break the outline above the spine

**No aerials, no fins, no vents, no cage.** The whole read is one clean falling
wedge, and any part that pokes out of the top edge softens the slope that
carries it. The rear stack is the only vertical element and it is the anchor the
slope falls away from.

---

## 5. CLEARANCES, ROOTS AND GATES

- **Every animated group root sits at z = 0.** Three groups: `boss_fast_body`,
  `leg_l`, `leg_r`. Geometry carries the height; the root does not. **`model.top`
  under-reports on any rig whose animated roots sit above z = 0**, and this body
  has `showHealthBanner: true`. `enemy-colossus` at 2.10 does this correctly —
  copy it.
- **Blade against hull — the one case that needs a number, and it is a wide part
  swinging under a body, which is exactly the design-time smell.** Corner **B**
  is the topmost blade vertex and it rises above the pin as the blade swings
  forward: `z(B) = −0.34 sin θ − 0.06 cos θ`, maximum at θ = −25.24° where it
  reaches **pin + 0.0907 u**. **Hull underside at pin + 0.131 u = z 0.541,
  leaving 0.040 u (1.3 screen px) of clear air at the worst frame.** State this
  pair explicitly in the `check_penetration.py` report; it is the only
  leg-against-body case on the model and the only place this design can fail the
  gate.
- **Blade against blade: impossible**, see §2.
- **Apex against road on swing: ≥ 0.02 u**, see §3.

---

## 6. PLAN EXTENT — 96.7%, inside, and it is inside *because* of the ruling

    blade:  C at θ = +25.24  ->  -0.265309
            B at θ = -25.24  ->  +0.333117
    hull:   rear stack       ->  -0.200
            prow tip         ->  +0.520

    swept plan diameter  =  -0.265309 .. +0.520  =  0.785 u
    max plan radius      =                          0.520 u

| metric | budget at 1.9 | Vanguard | ratio |
|---|---|---|---|
| fore/aft against ring **diameter** | 0.8123 u | 0.785 | **96.7%** ✔ |
| max plan **radius** against ring radius | 0.4062 u | 0.520 | **128%** |

**Carry both columns, and note that here they DISAGREE where the Tyrant's agree.**
The budget diameter is exactly twice the ring radius, so the two columns agree
only for a body symmetric fore and aft. **The Tyrant is symmetric and the
Vanguard deliberately is not** — its whole card is that its mass is forward — so
its plan centroid is offset and the radius column runs 128% while the diameter
column runs 97%. **This is the case that proves "the worst body" is undefined
until the metric is named**, and it is why kaz asked for both.

What that means in play: the hover and frost rings are centred on `pos`, which
is the path point, so **the prow overhangs the ring on the leading side while
the trailing side has room to spare.** The rings still read on the spine, the
blades and both contacts. **Deliberate, and cheaper than the Tyrant's overrun**,
which crosses the ring on both sides at once.

**The general fact, from the Tyrant brief and confirmed here from the other
direction:** a body that does not slide has a plan extent of roughly one stride.
The Vanguard fits where the Tyrant does not **precisely because of the ruling** —
an apex-down point contact spends nothing on fore/aft contact length, where the
Tyrant's 0.42 u sole adds its whole length to the swing. **The inverted triangle
paid for itself twice: once on the card and once on the budget.**

---

## 7. MATERIALS

- **`tin_dark` on the spine, the rear stack and the prow.** Largest surface,
  darkest value.
- **`tin` on the two blades.** They must separate from the hull above and the
  road below. **Measure on rendered pixels at the worst frame before export** —
  the palette table can only flag a gross difference and it is confidently wrong
  in specific windows. The Hedger's crank is the cautionary case.
- **`brass` on one strap across the spine, and nothing else.** One warm element,
  carried not worn, and it is the whole of the faction's shared warmth on a body
  that has given up the cage.
- **No `core_red` anywhere on this model.** It is the cage's colour, and this
  body has no cage. **Emission is inert on every ground enemy** in any case —
  `setGlow` is called only under `if (e.isFlying)` — so do not brief a glow and
  do not spend a decision on emission values.

---

## 8. WHAT MAY BE DROPPED, AND WHAT MAY NOT

A boss is exempt from the triangle budget. This is about **priority**.

**Spend on, in this order:**

1. **The gait**, and F = 36. It is the deliverable.
2. **The blade silhouette** — the unbroken leading edge B→C, and the apex.
3. **The forward overhang**, §4's 16.4 px. The prow and the falling top edge.

**Drop without asking:** every panel line, rivet, vent, grille and bracket. Any
articulation beyond the two hip pins — no knee, no ankle, no neck. Any lens,
antenna or head; **this body has no head for the same reason the Tyrant has
none, and one fewer excuse.** Any attempt to suggest the shield pulse in
geometry — it is a runtime state with no channel to the model (§3).

**If something has to give, take it out of the rear stack. Never out of the
blade depth (0.41), the swing angle (25.24°), F, or the prow overhang.**

---

## 9. WHAT IS MEASURED, WHAT IS ARITHMETIC, AND WHAT IS OWED

| claim | status |
|---|---|
| the 0.899281 u stride, and the A/B decomposition | **measured / derived**; reproduced independently by mira, suki and kaz. Gate: `tools/check-gait-slip.js` |
| F_min = 33.7, sawtooth 0.94 px at F = 36 | **arithmetic** from the measured projection |
| 37.52 / 31.61 screen px per model unit at 1.9 | **measured** through the game's own camera; reproduces `HOUSE-STANDARD.md` §0's per-unit table to 0.1% from an independent implementation |
| every screen-px figure for this body | **arithmetic** — geometry times the above. No mesh exists yet |
| that the inverted blade reads as *falling* | **unmeasured, and it is the central claim of this brief.** juno, at three bearings, worst frame, once there is a mesh. The instrument I would ask for is the overhang in §4 and the silhouette against the Tyrant's |
| `tin` blade against hull and against road | **unmeasured.** Rendered pixels, worst frame, before export |
| cycle time | **settled.** `UNIT_LENGTH = 1.04`, so one u.l. is 1.04 board px. Cruise `54.34 / (87.5 x 1.04)` = **0.597 s** per cycle; sprint **0.298 s** |

Nothing here resolves by name. Route every one of them through kaz.
