# BRIEF — the Tyrant (`enemy-boss`)

Written 2026-08-13 by mira, art director for models, **before any modelling**,
from Diego's leg direction and the approved identity relayed by kaz. Built to
`HOUSE-STANDARD.md`. Its companion is `BRIEF-enemy-boss_fast-vanguard.md`; the
two share a gait law and a leg primitive and should be read together.

Model id is `enemy-boss`, from `typeId`. There are no tiers — a boss is one
body.

**Every pixel figure below is arithmetic: geometry times a measured
projection.** The projection was measured through the game's own `gl-math` and
`gl-camera`, composed exactly as `drawActor` composes, at the fitted default
camera (distance 2022, target [640, 360, 0]), viewport 1280 x 720, basis
geometric coverage. At `sizeScale` 2.4 that is **47.39 screen px per model unit
along model x, 40.11 along model z.** Nothing here has been rendered, because
`enemyModel()` returns null for `boss` today and the body draws as a sphere.
**The read judgement is owed to juno once a mesh exists** — three bearings,
worst frame.

> **REVISION 2, same day.** Section 0 first carried a table claiming the whole
> faction slid, and named `support_left_frames` as an off-by-one. **Both were
> wrong, both were mine, and they were caught by suki and kaz within the hour.**
> The corrected section is below and the retraction is kept in §11 rather than
> deleted, because the thing that was wrong is the thing most likely to be
> re-derived by the next person.

---

## 0. THE LAW THIS BRIEF EXISTS TO ENFORCE

> **One walk cycle is exactly `28.6 / 31.8032` = 0.899281 MODEL UNITS of travel
> along model +x, for every body, at every `sizeScale`, at every speed.**
>
> **A leg planted across P consecutive displayed frames is in contact for P
> intervals, but its pose takes only P values — so there are P−1 TRANSITIONS,
> and the pose must sweep backward along model +x by exactly
> `(P − 1) × 0.899281 / F`.**

Diego's instruction was *"make sure the tyrant doesn't slide but actually
walks."* It is not a preference. **The slip has two components and only one of
them is authorable** — the decomposition is suki's, and `tools/check-gait-slip.js`
already computes it:

- **A — authored gait error.** The pose failing to sweep the distance above.
  Rig-fixable. Target zero.
- **B — the quantization sawtooth.** `bandFrame` **floors**
  (`gl-world.js:1565`), so frame *f* is displayed while the body travels from
  `f·step` to `(f+1)·step` **with the pose held constant**. The contact
  therefore drags forward by one step during every displayed frame and snaps
  back at the transition. **Amplitude is exactly `S / F`. It cannot be authored
  away. The only lever is F.**

### The frame-count law, and it is what actually sets F

    sawtooth in screen px  =  (S / F) x 19.75 x sizeScale
    so  F_min  =  S x 19.75 x sizeScale   puts the slip under ONE SCREEN PIXEL

| body | sizeScale | F | sawtooth (screen px) | F needed |
|---|---|---|---|---|
| Gleaner `enemy-normal` | 1.00 | 8 | **2.22** | 18 |
| Hedger `enemy-angry` | 1.20 | 12 | **1.78** | 22 |
| Dray `enemy-colossus` | 2.10 | 8 | **4.66** | 38 |
| **TYRANT** | **2.40** | **128** | **0.33** | **43** |
| Vanguard `enemy-boss_fast` | 1.90 | 36 | 0.94 | 34 |

**The Gleaner's authored gait is 98.6% correct and it still visibly slides — 2.22
screen px of forward drag, eight times a cycle, on a body ten pixels wide.**
That is what Diego is seeing on the shipped roster, and it was never a gait
error. **Suki's 128 on the Tyrant is three times clear of the 43 it needs, and
that is the right side to be on: at F = 8 this body would drag 5.3 screen px on
a 39 px figure and hold each pose 0.550 s while doing it.**

### `support_left_frames` is CORRECT. Do not change it.

An earlier revision of this brief called it an off-by-one. **It is not, and a
brief that names a correct shared function as a bug will get it "fixed", which
would break every body that imports the chassis.** The 4-versus-3 is real but it
is a distinction between two quantities, not an error: four contact **samples**
have three **transitions**, and the pose sweeps across transitions. The fourth
interval is the body advancing under a held pose — that is B, above.

### The gate

**`tools/check-gait-slip.js`** — committed, gated, and about to become a roster
gate on Diego's ruling that the slip is fixed *"for every one."* Run it against
`enemy-boss.js` after export. **Target A = 0.**

Do **not** use a contact definition based on "the lowest vertices at each
frame". That set is a geometric locus, not a material point: it jumps between
different vertices as the sole rolls — measured, **zero of 26 members shared
across the frame where the sole goes flat** — and it under-reports A by about
45%. Track material vertices.

---

## 1. WHAT THE BODY SAYS

**The Tyrant is cargo that walks.** It is not a fighter carrying freight; it is
freight with legs under it.

Read off what the game actually does with it (`js/enemy.js`): 5000 HP with **no
armor and no defense** — a wall you grind, not a wall that also taxes you. The
slowest body in the game at 15 u.l./s. `laneSpread: 0` — it goes dead centre
because it more than fills the road. It **stops dead for 1.3 s** to aim, and it
hits the **highest-DPS tower on the whole map** with no range limit. At half
health it commits reserves: 1000 shield, and forty more bodies called in.

Two consequences for the model, and both are the point:

- **No head and no face, and there is a reason rather than a style.** The aimed
  shot reaches the entire map and needs no eye. Nothing aboard this thing looks
  at you. Every other body in the faction has a lens on a neck; this one has a
  **closed lid.** That absence is the loudest thing on the silhouette and it
  costs nothing.
- **A RANK of ordinary cargo cages, never one big one.** The Tyrant is not a
  monstrous version of a Gleaner. It is a freight rack carrying three of the
  same cages every other body carries one of. **Scale is the sanctioned
  variation** — `cargo_cage()`'s own docstring cites Law 02, *"the same lens
  ring at three scales, variation in count and plating, never in kind"* — so
  three cages at `scale = 0.46` is an ordinary cage three times, not a new part.
  **`cargo_cage()` is SEALED. Place it. Do not rebuild it.**

---

## 2. THE LEGS — Diego's direction, resolved into geometry

> **REVISION 3, SAME DAY — SECTIONS 2 AND 3 BELOW ARE SUPERSEDED. THE BODY
> SHIPPED APEX DOWN.** Added by suki on kaz's instruction, after
> `enemy-boss.js` was built and gated, so that this document does not carry two
> live answers. **The text is kept rather than deleted, exactly as §11 is kept**
> — what was wrong here is what the next reader is most likely to re-derive.
>
> **What is superseded, precisely:** the apex-UP plate, the flat 0.420 sole, the
> heel-to-toe roll and its per-corner contact rule, `theta_m` = 32°, duty 0.625,
> the 32 frames of double support, the 0.005 u double-support tolerance, the
> `B(1−cos θm) + 2L sin θm` identity, and §6's plan-extent figures.
>
> **What still stands and was built:** F = 128; the plate's plane vertical and
> containing the travel axis; the 0.4635 pin height; the 0.420 plate long
> dimension; §4's rank of three cages at 0.46; §5's roots and gates; §7's
> materials; §8's priorities; "ramp the contact, not the angle"; no authored
> bob; no roll; ≥ 0.02 u swing clearance; and §0's gait law, which is the thing
> this brief exists to enforce and which the body meets at **A = 0.004 board
> px**.
>
> **The two reasons, and the first is this brief's own §0 turned on itself.**
>
> 1. **`check-gait-slip.js` cannot score an apex-up Tyrant correctly.** It
>    tracks the **mean x of a fixed sole band** — a material set, which §0 and
>    §11 are both right to insist on. But on a **flat sole rocking about a pin
>    above it, that mean is the sole MIDPOINT**, and the midpoint sweeps only
>    `2 L sin θm` = **0.49124 u** against this brief's own **0.55503 u**
>    requirement. **A perfectly correct apex-up Tyrant scores A = 0.0638 u =
>    4.87 board px.** The 0.0638 is exactly the `B(1 − cos θm)` term in §3's own
>    arithmetic — the share of the contact travel that comes from **the pivot
>    moving from heel to toe**, which no fixed material point can carry. §3 saw
>    the handover and asked for a per-corner check; the gate is not per-corner
>    and making it so would change what it measures on **every body it touches**.
> 2. **Duty 0.625 is not buildable on a point contact.** Two point-contact legs
>    both planted demand hip heights `D cos θ` at two different θ, differing by
>    0.022 u at 8 overlap frames and 0.050 u at 32 — against §3's own 0.005 u
>    tolerance. **Duty is forced to exactly 0.5**, and it answers §3's freeze
>    argument better than double support does: exactly one blade is on the road
>    at **every one of the 128 frames**, and none is airborne.
>
> **The general rule, which outlives this body: a measurement error in a report
> costs one correction; the same error in a GATE costs every body the gate
> touches** — and it is harder to disbelieve, because turning a finding into a
> check reads as diligence. Note the direction: like §11's own error, this one
> fails toward **alarm**, not toward a false pass. A scary number from an
> unvalidated instrument is worth exactly what a clean one is.
>
> **The built geometry is in `tools/blender/enemy_tyrant.py`**, whose header
> carries the derivation, the forced `theta_m` = 28.520°, the proof that a
> point-contact leg at duty 0.5 cannot clear the road without a hip lift, and
> the negative control (`TYRANT_GAIT_DEFECT`) that shows the gate failing a
> known-bad build of this same body at 6.755 board px.

> *"Instead of normal legs I was thinking 2 big moving triangles as legs,
> perpendicular to the ground."*

**This is applied to the Tyrant with confidence and is not open here.**

**"Perpendicular to the ground" is resolved as: the triangle's PLANE is vertical
and contains the travel axis.** Not "its edges are vertical" — that would forbid
the swing. The plate lies in the model's x–z plane and rotates only about y, so
it is a vertical plate at every frame, it never presents as a line, and its full
triangular area faces the camera at the dominant bearing. Path direction buckets
to camera yaw 0 on **25 of 42 road segments across all six maps**, and at yaw 0
the model's x axis maps to screen x — so the side view is both the commonest
bearing and the one that shows the whole triangle and the whole swing. **The
direction pays at the bearing the player actually gets.**

### The plate

Two identical plates, mirrored in y. Leg-local coordinates, **hip pin at the
origin**:

| vertex | leg-local (x, z) | what it is |
|---|---|---|
| **P** | (0.000, 0.0000) | the hip pin — apex, top |
| **H** | (−0.210, −0.4635) | heel, rear-bottom vertex |
| **T** | (+0.210, −0.4635) | toe, front-bottom vertex |

- **Sole H→T: 0.420 u** — **19.9 screen px**, over half the body's own screen
  width. A silhouette element, not a detail.
- **Pin height P above sole: 0.4635 u** — **18.6 screen px**.
- **Thickness in y: 0.14 u.** The plates sit at y = ±0.11, spanning
  [0.04, 0.18] and [−0.18, −0.04] — **0.08 u of clear air between their facing
  faces at every frame.** Leg-against-leg interpenetration is structurally
  impossible; the only case `check_penetration.py` has to catch here is
  plate-against-hull, covered in §5.
- Apex up, base down, near-isoceles. **Mass low, contact long.** That is the
  correct orientation *for this body* and the wrong one for the Vanguard — see
  that brief for why the same primitive is inverted there.

---

## 3. THE GAIT — the load-bearing half of this document

**The plate does not translate and it has no ankle. It rocks about the hip pin
through a continuous arc of ±32°, and everything else falls out of that.**

`F = 128`. **Do not sample eight key poses — specify the arc and let 128 samples
follow it.**

### Contact, and which apex

Because the sole is flat and the pin is above it, **the contact point is
whichever bottom vertex is lowest, and it changes owner exactly once per support
phase:**

| phase | θ | pivot | what it looks like |
|---|---|---|---|
| heel strike → early support | −32° → 0° | **H, the rear-bottom vertex** | the plate rocks forward over its heel |
| mid-support | 0° | **the whole sole**, flat on the road | the one frame both corners touch |
| late support → toe-off | 0° → +32° | **T, the front-bottom vertex** | the plate rocks forward over its toe |

That is a real heel-to-toe foot roll and it needs **no second joint**. One
animated group per leg.

> **The handover is why the check must be written per-corner, and it is also why
> a lowest-vertex contact definition fails.** At the flat frame the contact
> identity jumps from H to T — a discontinuity in *which vertex owns the
> measurement*, not in the ground. This is the house standard's **"a comparison
> must not straddle an owner change"** arriving inside a gait check. Measure each
> corner across only the intervals it owns, and **require a frame at exactly
> θ = 0** so the handover lands on a frame boundary.

### The arithmetic, and it closes

Contact travel over one support phase is `B(1 − cos θm) + 2L sin θm`:

    0.420 x (1 - cos 32°)  +  2 x 0.4635 x sin 32°
      = 0.420 x 0.151950   +  0.927 x 0.529919
      = 0.063819           +  0.491235
      = 0.555054 u

Required, at P = 80 planted frames of F = 128:

    (P - 1) x S / F  =  79 x 0.899281 / 128  =  0.555025 u

**Error 0.000029 u = 0.0014 screen px.** If you change any of B, L or θm, hold
that identity — it is the brief, and the three numbers are only one solution to
it.

### Duty, and why it is not 0.5

**Duty 0.625: each leg planted on 80 of 128 frames, the two legs offset by 64.
Leg A holds frames 0–79, leg B holds 64–127 and 0–15. That is 32 frames of
DOUBLE SUPPORT — 25% of the cycle — and no float phase at all.**

This is not a stylistic call. **`currentSpeedUlps()` returns 0 while
`windUpTimer > 0`, so the Tyrant freezes on whatever frame it is on for 1.3 s
every 12 s** — 30% of a 4.400 s walk cycle, 11% of its life. `stunTimer` and
`rooted` do the same. **Every frame of this body's strip has to be a pose it can
hold for a second and a half without looking like it is falling over.** At duty
0.5 there is always exactly one leg down, and at the stride extremes that leg is
balanced on a single corner. Frozen, that reads as a topple. Double support
removes the case.

It is also simply what a heavy walker does, which is the cheapest kind of
correct.

### Ramp the CONTACT, not the angle

Solve θ per frame so the **contact x is linear in frame index** —
`θ_k = arcsin(...)` against the linear contact target — rather than ramping θ
linearly and letting the contact follow. `_set_sole_height` already solves a
per-frame quantity numerically, so this is the same kind of operation.

A linear-θ ramp leaves **0.011 u of residual drift, half a screen pixel**. That
is under the resolvable limit and I would accept it on review; I would not
choose it, because the correct version costs one `arcsin`.

### Two things that are FREE — do not author them a second time

1. **The bob.** With the pin 0.4635 u above a flat sole, the hip rides at
   **0.4635 u at mid-stance and 0.5044 u at both stride extremes.** The body
   **rises and falls 0.0409 u (1.6 screen px) twice per cycle without a single
   keyframe.** That is the heavy beat. **Do not author a bob over the top of
   it** — the chassis's `bob = 0.03` would fight this one and produce a limp.
2. **The cadence.** The cycle is keyed to distance, so the half-health speed
   change (15 → 20.25 u.l./s) speeds the walk up by itself. **Do not author a
   second gait for the phase change.**

### The double-support tolerance, stated so it is not discovered

At every instant in double support the two legs demand hip heights that agree to
within **0.003 u**. They cannot both be exactly right.

> **Solve the body height from the leg demanding the LOWER hip, and check that
> the other contact never sits more than 0.005 u above z = 0.**

Never the higher. Solving to the higher drives the other foot through the road
and straight into `check_penetration.py`.

### The swing

The returning plate travels θ = +32° → −32° across the remaining 48 frames,
planting heel-first. **Its lowest vertex must be ≥ 0.02 u above z = 0 on every
swing frame, peaking at 0.06 u (2.4 screen px) at mid-swing.** Below 0.02 u a
tipped corner clips the road on a body this large.

### No roll

**Do not roll this body about x.** The free bob is the beat. A roll on a
container on a rack reads as a limp, and the Tyrant does not limp — it is the
one body in the game that never hurries.

---

## 4. SILHOUETTE AND PROPORTION

Everything relative, in fractions of the figure, so it survives a scale change.

    z = 0.9735 ---- cage tops ------------------  the rank breaks the outline
    z = 0.8535 ---- hull lid -------------------  a CLOSED lid. no head.
    z = 0.4935 ---- hull underside -------------
    z = 0.4635 ---- hip pins -------------------  plate apexes
    z = 0.0000 ---- road -----------------------  sole

| element | model units | screen px (arithmetic) | fraction of figure height |
|---|---|---|---|
| **total height** | 0.9735 | **39.0** | 1.00 |
| the two plates | 0.4635 | 18.6 | **0.48** |
| hull | 0.360 tall, 0.780 long, 0.520 wide | 14.4 x 37.0 | 0.37 |
| the rank of three cages | 0.120 proud of the lid | 4.8 | 0.12 |
| free bob | 0.0409 | 1.6 | 0.04 |

**Read as a black cutout, side-on:** a wide closed box, sitting low, on two large
triangles that are nearly half the figure's height. The top edge is broken only
by the three cage housings — a rhythm, not a shape. Nothing above the lid line
but that rhythm. **Which side is heavier: neither. The Tyrant is symmetrical fore
and aft, and that is the statement** — it is not going anywhere in particular, it
is arriving everywhere.

### The rank

**Three cages, `scale = 0.46`, ranked along model +x, centres 0.276 u apart,
total rank length 0.778 u.** Each housing is **10.7 screen px** long with
**2.4 px** gaps between them.

**The rank runs along the travel axis and not across it.** At camera yaw 0 — the
dominant bearing — model x maps to screen x, so a fore-aft rank reads as three
blocks in a row. A transverse rank would sit one behind the other and merge into
one lump at exactly the bearing the player gets most often. **A separator must
name its axis; this one is x, and it is chosen for the bearing where x
contributes most to screen width.**

Set the cages **into the top edge** so their upper halves break the outline. Per
the standard's occlusion gate, a small feature does not need to be bigger — it
needs to be where nothing crosses it, and the silhouette edge is free where area
is not.

The 2.4 px gaps are the one thing here I would want juno to confirm rather than
assert. Route it.

---

## 5. CLEARANCES, ROOTS AND GATES

- **Every animated group root sits at z = 0.** Three groups: `boss_body`,
  `leg_l`, `leg_r`. Geometry carries the height; the root does not.
  **`model.top` under-reports on any rig whose animated roots sit above z = 0,
  and the error scales with `sizeScale`, so 2.4 is the worst case in the game.**
  This body has `showHealthBanner: true`; a wrong `top` buries the health bar
  inside the hull. `enemy-colossus` at 2.10 does this correctly — copy it.
- **Plate against hull.** The plate's topmost vertex is the pin itself, at
  z = 0.4635, and rotating about the pin never lifts it. Hull underside at
  z = 0.4935 → **0.030 u of clearance at every frame.** Join with a short
  `tin_dark` hip boss, 0.03 u long and 0.10 u across, dropping from the underside
  to the pin. **State this pair in the penetration report** — it is the only
  leg-against-body case on the model.
- **Plate against plate: impossible**, see §2.
- **Sole against road on swing: ≥ 0.02 u**, see §3.

---

## 6. PLAN EXTENT — a deliberate overrun, approved, quoted on both metrics

Swept plan along x, driven by the toe at maximum forward swing and the heel at
maximum rearward swing:

    T at θ = -32°:  0.210 x cos 32° + 0.4635 x sin 32°  =  +0.423708 u
    H at θ = +32°:                                          -0.423708 u
    swept plan diameter                                =    0.847416 u
    max plan radius                                    =    0.423708 u

**Both columns, because "the worst body" is undefined until the metric is
named:**

| metric | budget at 2.4 | Tyrant | ratio | precedent |
|---|---|---|---|---|
| fore/aft against ring **diameter** | 0.7966 u | 0.847416 | **106.4%** | brute 127%, hive 174% |
| max plan **radius** against ring radius | 0.3983 u | 0.423708 | **106.4%** | brute 203%, hive 189% |

**The two columns agree exactly here, and that is a property of this body rather
than a coincidence:** the budget diameter is exactly twice the ring radius, so a
body **symmetric fore and aft** scores identically on both. Brute and hive swap
rank between the columns precisely because they are not symmetric. The Tyrant is,
by design (§4), so it is the clean case — but carry both columns anyway, because
the next body will not be.

**Approved by kaz.** What is and is not outside the ring matters: the container,
both hip pins and **both contact points** stay inside. What crosses it is the
**airborne** leading toe and trailing heel at maximum stride only. So "I selected
this" and "this is slowed" still read on the mass, which is what the budget
protects.

The alternative was measured rather than assumed: a 0.30 u sole fits (0.770 u,
97%) and gives a triangle **14 screen px** wide on a 39 px body. That is not a
big triangle, and Diego asked for big triangles. **His triangles were not shrunk
quietly; kaz had both numbers and made the call.**

> **The general fact, and it is worth more than this one decision: a body that
> does not slide has a plan extent of roughly one stride, so the plan budget and
> a correct gait are structurally in tension at every `sizeScale` above about
> 1.0.**

---

## 7. MATERIALS

The chassis palette, unchanged: `tin_dark`, `tin`, `brass`, `core_red`.

- **`tin_dark` on the hull.** Largest surface, darkest value — the faction's own
  value ladder, and this body has the largest surface in the game.
- **`tin` on the two plates.** They must separate from the hull above them and
  from the road below. This is the one material call on the model that carries a
  read, and the palette table **cannot settle it** — it can only flag a gross
  difference. **Measure `tin` against the hull and against `roadTop`/`roadSide`
  on rendered pixels, at the worst frame, before export.** The Hedger's crank is
  the cautionary case: chosen on palette arithmetic, and the palette's ranking
  against the road is exactly reversed on three contiguous frames of twelve.
- **`brass` on the cage retainers only.** One warm element, carried not worn.
- **`core_red` wherever `cargo_cage()` puts it, and expect nothing from it.**
  **Emission is inert on every ground enemy** — `setGlow` is called only under
  `if (e.isFlying)`. The cage's authored emission tiers all render as flat
  `core_red`. **Do not brief or expect a glow, and do not spend a decision on
  emission values here.**

---

## 8. WHAT MAY BE DROPPED, AND WHAT MAY NOT

The triangle budget is retired and a boss is explicitly exempt. This section is
about **priority**, not cost — a brief that asks for everything has set no
priority, so the priority gets set by whoever exports it.

**Spend on, in this order:**

1. **The gait.** It is the deliverable. Everything else on this model could be a
   grey box and it would still be the best boss in the game if it walks.
2. **The two plates' silhouette** — sole length and pin height. These are the
   figure.
3. **The rank rhythm on the top edge.**

**Drop without asking:**

- **The cage inspection windows.** Measured on a shipping model: 0–6 px, and
  deleting all three changes **zero pixels above a 32/255 threshold at four of
  eight yaws.** They sit behind `cargo_side_strut` and fail the occlusion gate.
  They come free with the sealed cage; do not spend a decision defending them.
- Any surface detail on the hull. Panel lines, rivets, bracing, weld beads — all
  sub-pixel at the default view, and this body is not inspected.
- Any articulation beyond the two hip pins. No knee, no ankle, no lid hinge.

**If something has to give, take it out of `core_segments` (12 → 8) on the
cages. Never out of the sole length, the pin height or the frame count.**

---

## 9. THE ONE THING THIS MODEL CANNOT SAY, AND IT NEEDS A DECISION

**The half-health phase — the unloading — is not expressible on the body.**

Verified rather than assumed. `gl-world.js:1367` takes `walkBand(em)`, which
returns `bands[0]` or the whole strip, and **nothing else reaches the enemy frame
index.** The enemy draw call passes no `overrides`. The second-band channel
exists in the exporter and is **unreachable at runtime for a walker**.

So the roar cannot open the cages, and no brief should ask it to. What carries
the phase today is the announce banner and the forty bodies it calls in.

**The strongest thing the model can do is make those forty bodies read as having
come out of it** — which means the cage rank should look like something that
opens, and the answer depends on where the runtime puts the spawns relative to
the Tyrant's own position. **That is a question for otto or nadia, routed through
kaz, and I have not answered it.** kaz is putting the state-input question to
otto as a separate proposal; it is not a boss blocker.

---

## 10. WHAT IS MEASURED, WHAT IS ARITHMETIC, AND WHAT IS OWED

| claim | status |
|---|---|
| the 0.899281 u stride | **derived** from `radiusPx x 2.6` and `unitsToPx`, in model units, never through u.l. |
| the A/B slip decomposition and the frame-count law | **measured**, and reproduced by three people independently. Gate: `tools/check-gait-slip.js` |
| the Gleaner's authored gait at 98.6% | **measured**, suki's sole population; kaz's material-vertex route gives 101.6%. **Two routes bracketing 100%** |
| 47.39 / 40.11 screen px per model unit at 2.4 | **measured**, through the game's own camera; reproduces `HOUSE-STANDARD.md` §0's per-unit table to 0.1% from an independent implementation |
| every screen-px figure for this body | **arithmetic** — geometry times the above. No mesh exists yet |
| the 2.4 px cage gaps read | **unmeasured.** juno, once there is a mesh |
| `tin` plate against hull and against road | **unmeasured.** Rendered pixels, worst frame, before export |
| where the roar's forty bodies appear | **unmeasured.** otto or nadia |
| **cycle time 4.400 s; pose hold 0.550 s at N = 8** | **settled.** `js/units.js:66` is `UNIT_LENGTH = 1.04`, so **`ul()` is not identity — one u.l. is 1.04 board px.** `68.64 / (15 x 1.04)` = 4.400 s. An earlier 4.576 s here divided board px by u.l./s and was wrong. The same factor is in the leap: 90 u.l. is 93.6 board px, so a leap snaps the walk frame forward **1.364 cycles** |

Nothing here resolves by name. Route every one of them through kaz.

---

## 11. THE RETRACTION, KEPT ON PURPOSE

Revision 1 of this brief asserted, as measured fact, that the whole faction slid
— Gleaner 44.6%, Hedger 35.6%, Dray 1.5% — and that `support_left_frames` was an
off-by-one throwing away a third of the swing arc. **Both claims were wrong.**

**The first was an instrument error and it is the one worth keeping.** My contact
definition took the **lowest vertices at each frame**. That is a geometric locus,
not a material point: it jumps between different vertices as the sole rolls —
**zero of 26 members shared across the frame where the sole goes flat** — so at
one frame it measured the heel and at another the toe, compressing the sweep by
about half a foot length. **It under-reports by roughly 45%, and it is a
per-frame-varying population, which is the single error `HOUSE-STANDARD.md`
spends most of its length warning about.** I made it in the measurement I sent
out as the headline finding of this job.

**The second was the right observation with the wrong sign.** There is a real
4-versus-3 and it is worth 1.333x, but it is the distinction between contact
*time* and pose *transitions* — and I applied it to the requirement instead of
recognising it, inflating my own denominator from 0.337230 to 0.449640. Half the
gap between my number and suki's was that one substitution.

Two things came out of it that are worth more than the claim was. **The B
component and the frame-count law in §0** — which correctly explains the slide
Diego actually sees, and locates the fix in frame count, at zero triangle cost.
And Diego's roster-wide ruling to fix the slip on every body, which followed from
re-deriving the support window rather than trusting it.

**The instinct to re-derive was right; the diagnosis was wrong; and a brief that
records which was which is worth more than one that quietly reads correct.**
