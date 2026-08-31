# BRIEF 2 — the Hedger tripod: the attack gesture

mira, art direction (models), 2026-08-13. For kaz; built by suki and otto.
Companion document: `BRIEF-hedger-tripod-parts.md` — the part inventory.

Diego: *"The tripod design looks good — **the attack animation needs to fit with
the model tho, since it attacks.**"*

---

## 0. The headline, and it is bigger than the note that prompted it

**In GL mode the strike currently has no visual whatsoever.** Not a weak one —
none. `attackFlash` is set at `js/enemy.js:1769` and has zero consumers anywhere
under `js/gl/`. The only attack visual that exists is the orange contracting
reach ring at `js/enemy.js:2343-2349`, which is inside `Enemy.prototype.draw`,
which is inside `game.js`'s `if (!world3D)` block, which the GL path never
enters. kaz confirmed this independently before briefing otto.

So this is not an improvement to a tell. **It is the only tell the strike will
ever have**, and the one enemy in the game below boss tier that fights back has
been fighting invisibly.

---

## 1. What the gesture is, in one sentence

**The tool comes down, and then it comes back up at a constant rate, and the
machine does not otherwise acknowledge that anything happened.**

---

## 2. THE SPECIFICATION — group, pivot, axis, degrees, curve

Everything an implementer needs is in this box. Everything after it is why.

> **Group:** `mast` — the drum, rim band, bill, bill head, core and hold, as one
> group. **Not the legs. Nothing touches the legs.**
>
> **Pivot:** rotate about **(0, 0, 0.80)** in model units — the drum's own
> centre, on the machine's vertical axis.
>
> **The `mast` group ROOT goes at (0, 0, 0), not at the pivot.** kaz's
> correction, and it overturns the arithmetic-free version of this design that
> the first draft of this brief specified. `export_mesh.py:200-204` stores each
> group's geometry in **that group's own local space**, and `model.top` is max z
> over the raw `positions` array — so **the height of a group whose root is
> elevated never appears in `positions` at all.** Verified on the shipped file:
> `crank`'s root sits at model z 0.600 and its raw geometry runs z [−0.582, 0],
> so its top reads as **zero**. The tripod puts its tallest geometry — the drum —
> in `mast`. With an elevated root, `model.top` would read a leg's height and the
> health bar would be painted through the machine **permanently**, which is worse
> than the transient case section 4j prices.
>
> **The general rule, and it is the one to carry forward: the group holding the
> model's TALLEST geometry must have its root at z = 0. Not every group — leaf
> roots belong at their own pivots.** Only the one that owns the top.
>
> **So otto supplies the pivot after all:**
> `GLMath.localPose(out, [0, 0, 0.80], 0, ry, 0, 0, 0, 0)` — the same call the
> Wisp's tumble already uses. Three lines, not a bare rotation. I would rather
> have the elegant version, and it was wrong.
>
> **Axis:** the group's local **Y**. Positive rotation takes local +x toward
> local −z — the bill goes **down and slightly back toward the machine**.
>
> **Magnitude:** **34°** at impact.
>
> **Curve:** `angle = 34° * attackFlash`. **Linear. No easing, no overshoot, no
> second stage.** `attackFlash` is already a linear 1 → 0 ramp over 0.400 s
> (`js/enemy.js:1278`, `attackFlash - dt * 2.5`), so the whole gesture is that
> one multiplication.
>
> **Yaw:** **none.** The drum does not turn. See section 4 — this was measured
> and rejected, not skipped.
>
> **Sign check, so nobody ships it inverted:** at `attackFlash == 1` the bill
> tip must be **BELOW** the drum's centre line. If it is above, the sign is
> flipped. Measured target: tip at z **0.509 u**, having started at 0.800.

**Frame 0 of the window is the bottom of the stroke.** There is no anticipation
channel — `angry` carries no `windUpSeconds`, and `attackTimer` cannot be used as
a telegraph because it reaches zero every 2.5 s whether or not a tower is in
reach, so driving off it would make the body work at empty road.

**Do not read that as a compromise.** A machine doing a chore does not wind up,
and the fast half of any cutting stroke is the cut. The window is 0.4 s of
recovery because the cut has already happened, and that is the correct shape for
this gesture rather than the shape we were left with.

I considered spending the first two frames continuing the stroke downward so the
cut's direction is visible rather than only its result. **Dropped, measured:** 7°
over two frames at 60 fps moves the tip 0.9 screen px, which is under the
resolvable floor. It would be cost with no benefit.

---

## 3. What it looks like — the silhouette statement

This is the part that has to survive two different people building from it.

**At rest** the widest part of the machine is the tool, sticking straight out
forward at drum height — **row 5 of a 26-row figure, 20 px wide.** The outline
above it is the drum's flat top; below it the figure narrows to the legs.

**At impact** the widest row of the whole silhouette is at **row 10 — halfway
down the figure.** The tool has swung down across the space between the two
leading legs, the drum's rear edge has tipped up, and the machine's broadest
point has migrated **five rows, 19% of the figure height, down the body.**

**Over the next 0.4 s that widest row climbs steadily back to row 5.**

That is the read: **the machine's widest point drops to its middle and walks back
up to its shoulder, at a constant rate, while the legs keep walking underneath as
though nothing had happened.**

Supporting numbers, all screen px at the game's fitted default camera, sizeScale
1.25, on a **17.3 x 26.6 px** figure:

| | |
|---|---|
| bill tip travel, down | **6.0 px** |
| bill tip travel, back toward the body | 2.2 px |
| widest-row migration | row 5 → row 10 of 26 |
| silhouette changed at peak (yaw 0) | **75.2 px**, against a walk-only floor of 14.0 px |

---

## 4. THE MEASUREMENTS KAZ ASKED FOR AND WILL NOT ACCEPT AN ESTIMATE ON

### 4a-0. THE SETTLING TABLE. This supersedes every figure in 4a and 4a-bis

`scratchpad/mira-tripod-settle.js`. Foot excursion 0.30 u (tripod duty 2/3, the
worst realistic stride), stroke 34°, bob 0.015, roll 1.3, 12 baked frames.
**Every row recomputed under the band; nothing carried over.** Road shares are
kaz's census over all 42 segments of all six maps, weighted by road **length**.

**The band is the set of screen rows the `mast` GROUP projects into**, unstruck
or struck. Rig-defined, fixed before any of this was measured, not fitted to
pixels.

| bearing | share of road | gait step, in band | strike, in band | ratio | strike OUTSIDE band |
|---|---|---|---|---|---|
| **0** | **60.2%** | 16.7 px | 70.3 px | **4.21x** | **0.0 px** |
| 45 | 13.4% | 13.8 | 54.3 | 3.93x | **0.0** |
| **315** | **13.2%** | 26.5 | 45.8 | **1.73x** | **0.0** |
| 180 | 6.9% | 16.8 | 70.1 | 4.16x | **0.0** |
| 90 | 4.5% | 9.3 | 32.5 | 3.48x | **0.0** |
| **270** | **1.7%** | 12.7 | 9.4 | **0.74x** | **0.0** |
| 135 | **0.0%** | 13.2 | 54.8 | 4.16x | **0.0** |
| 225 | **0.0%** | 26.3 | 45.8 | 1.74x | **0.0** |

**Weighted by the road that actually exists: 85.0% of it reads at 3.5–4.2x,
13.2% at 1.7x, and 1.7% below 1.0.**

**Three corrections in that table, and two of them go against me.**

1. **Banding lifted yaw 270 from 0.41x to 0.74x.** kaz was right to ask whether
   that row had been recomputed — it had not, and it moved in the direction that
   would have flattered me. **It still fails, so the finding stands**, but it
   stands at 0.74 and not at 0.41.
2. **A realistic stride pulls yaw 315 down to 1.73x, and 315 carries 13.2% of
   the road — the second-busiest bearing on the board.** That is new and it did
   not exist in any earlier table. It passes, but thinly.
3. **My previous "worst bearings" included 225 at 1.74x, and 225 carries no road
   at all.** Half the compass — 135 and 225 — is unused, so two of the eight
   numbers everyone has been quoting, mine included, describe views no player
   ever gets.

### 4a-00. THE METRIC, NAMED — because two of these are different quantities

kaz's challenge, and it was a real one: my ratio set a **temporal** difference
(gait frame N against N+1) over a **counterfactual** (frame N against frame N
struck). A player never sees the counterfactual pair. Two instruments in one
ratio is the error that nearly retired a design here once already.

Both terms made temporal, per rendered frame at 60 fps — the gait is quantised
(one baked step every 4.91 rendered frames) while the stroke is continuous
(1.417° every rendered frame):

| bearing | gait, per rendered frame | strike increment, per rendered frame | ratio |
|---|---|---|---|
| 0 | 3.39 px | **5.52 px** | **1.63x** |
| 90 | 1.90 | 1.54 | 0.81x |
| 270 | 2.58 | 1.00 | 0.39x |

**The ordering survives — 0 > 90 > 270 on both instruments — and at the dominant
bearing the strike beats the walk even on the strictest reading available.**

**Read it as an ordering, not a magnitude.** Per rendered frame both quantities
are small; 1.417° moves the tool tip about 0.2 px. Coherent motion accumulates
across the 24-frame window and a quantised gait step does not, so a per-frame
figure **understates a slow smooth sweep and overstates a jump.** The
counterfactual overstates in the other direction. The truth is bracketed by the
two, which is why both are printed.

### 4a-000. THE HONEST LIMIT ON ALL OF IT

**No ratio settles this at 17 x 26 px.** What the banded number establishes is
that the mast's motion is not drowned in the band where it happens — that is a
**screen**, not a proof. Whether a player *notices* an attack while the legs are
churning is a question about attention across a figure 26 px tall, and this
company has three instruments that have disagreed by 2x on a single event.

**The deciding evidence is a person watching the built model, and that person is
Diego.** Everything above exists to stop us shipping something that cannot
possibly work; none of it can establish that this does.

### 4a. [SUPERSEDED — kept for the record] The first table, on too short a stride

The right control is not the rest pose. It is **what the walk changes on its
own**, because that is the visual noise the strike has to be heard over. So:
XOR between consecutive gait frames (no strike) against XOR between a gait frame
and that same gait frame struck.

**THIS TABLE IS A CORRECTION OF MY OWN FIRST ANSWER AND THE CORRECTION IS
LARGE.** My first proxy had no body bob and no body roll, and I reported 7.4x at
yaw 0. Kaz's note on the chassis `bob` (0.03 u, twice per cycle) and `roll_deg`
(2.6°, once per cycle) sent me back, and **the walk is a great deal noisier than
the proxy I measured against.** Every figure below is at the bob and roll I am
specifying in section 4l, which is half the chassis default:

| bearing | gait-only XOR | strike XOR at peak | ratio |
|---|---|---|---|
| **yaw 0** — 25 of 42 road segments | **14.0 px** [3–27] | **75.2 px** [68–80] | **5.4x** |
| yaw 45 | 15.0 | 55.8 | 3.7x |
| **yaw 90** | 14.2 | 30.8 | **2.2x** |
| yaw 135 | 14.7 | 56.0 | 3.8x |
| yaw 180 | 13.8 | 75.2 | 5.4x |
| yaw 225 | 13.7 | 47.5 | 3.5x |
| **yaw 270** | **17.5** | **7.2** | **0.41x — DOES NOT READ** |
| yaw 315 | 13.8 | 47.2 | 3.4x |
| all-bearing mean | 14.6 px | 49.3 px | 3.4x |

**Do not quote the mean.** The player samples bearings serially, one body at a
time, so the number that describes their experience is the extreme.

**AND THE TABLE ABOVE IS STILL MEASURED ON TOO SHORT A STRIDE — read 4a-bis
before quoting any of it.**

### 4a-bis. The stride correction, and the measure it forced

suki's leg constraint sent me back a second time. **My proxy moved each foot
±0.06 u; a real stride moves it ±0.19 to ±0.30**, because the excursion is set by
the stride distance and not by taste. Worse for a tripod than for a biped: each
foot is in stance for two thirds of the cycle rather than half, so it travels
**1.33x** what a biped's foot does.

Re-run at a real excursion, **the whole-figure ratio collapses to 0.9 and then to
0.67.** On the measure I had been using, the strike is quieter than the walk.

**That measure is wrong, and here is the check on whether I am special-pleading
my way out of a bad result.** The walk's silhouette change is in the **legs**;
the strike's is in the **mast**. A player separates two simultaneous motions by
*where* they happen, not only by how much moved — the same discipline as naming
the part a figure is measured on. So the measure is banded:

| foot excursion | UPPER band (mast) gait / strike | ratio | LOWER band (legs) gait / strike | whole figure |
|---|---|---|---|---|
| 0.06 (my first proxy — not buildable) | 4.2 / 75.6 | 18.1x | 19.3 / **0.0** | 3.22 |
| 0.19 | 9.7 / 73.0 | 7.6x | 56.8 / **0.0** | 1.10 |
| **0.2248 (biped duty)** | **11.5 / 72.2** | **6.3x** | 67.8 / **0.0** | 0.91 |
| **0.30 (tripod duty 2/3 — the likely figure)** | **16.5 / 69.9** | **4.2x** | 87.3 / **0.0** | 0.67 |

**The thing that proves the band is not gerrymandered is the column of zeroes.**
The strike changes **exactly 0 px** below the hub, at every excursion — not
"little", zero. Because `overrides` acts on the `mast` group and cannot reach the
legs, **the band boundary IS the group boundary**: the partition is defined by
the rig, not chosen from the data. The two motions never compete for the same
pixels, and summing them into one figure was the error.

**Corrected headline: the strike changes 70–76 px in the band it acts in,
against 4–17 px of walk noise in that same band — 4.2x at the worst realistic
stride, 6.3x at the likely one.** The gesture survives, and it survives for a
better reason than the one I first gave it.

**The excursion is not a number I own.** suki sets it from the stride, and the
figures above are a sensitivity table so the answer does not have to be
re-derived when she supplies it. What I do own is the consequence: **no stride in
that range breaks the gesture, and none breaks the plan budget either** — plan
radius envelope goes 0.526 → 0.610 u across the same range, against a frost-ring
**RADIUS** of 0.4465 u (**118% → 137%**). See the correction at 4k: the 0.8930
this originally cited is the ring's DIAMETER, and over 100% is the norm on this
board rather than a failure.

### 4b. THE ONE BEARING WHERE THIS GESTURE FAILS, stated plainly

**At yaw 270 the strike changes 7.2 px against a gait floor of 17.5 px. It is
quieter than the walk. A player looking at that bearing cannot see the machine
attack at all.** Yaw 90 at 2.2x is thin but survives.

**The cause is structural, not a tuning error.** The tool sits on the machine's
centre line, and the body it is mounted on is rotationally symmetric. At the two
head-on bearings the tool projects inside the drum's own screen footprint, and
the part of the stroke that would escape below the drum descends into the legs
instead — which at a head-on bearing are the densest part of the figure.

**I am recommending we accept it, and here is what the alternative costs:**

- **Moving the tool off the centre line** would fix it and would reintroduce
  exactly the defect Diego rejected — one lump hanging off one side of an
  otherwise symmetrical body. Not available.
- **Aiming the drum** would fix it and is rejected on its own numbers in section
  5.
- **Mounting the tool higher on the rim**, so it strokes from above the drum
  rather than from its waist, is the only fix that costs no identity. **It buys a
  head-on read by spending health-bar pad** (section 4j), because the tool's rest
  tip would then set `model.top` instead of the drum. **It is a real trade and I
  am not taking it blind** — it is worth taking only if the bearing distribution
  says head-on is common.
- **A deeper stroke does not help.** Past 34° the tool descends further into the
  legs, not out of them.

**ANSWERED, MEASURED, 2026-08-14 — it is 1.7% of the road and the recommendation
stands on a number.** kaz's census (`scratchpad/kaz-bearing-census.js`) over all
42 segments of all six maps, 13,869 board px of road:

| bearing | 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315 |
|---|---|---|---|---|---|---|---|---|
| share of road by length | **60.2%** | 13.4% | 4.5% | **0.0%** | 6.9% | **0.0%** | **1.7%** | 13.2% |

**I confirmed the convention rather than assuming it, because kaz flagged that a
mirrored one also reproduces 25/42 and would put 4.5% at yaw 270 instead of
1.7%.** `GLMath.modelYaw` (`js/gl/gl-math.js:106`) builds `x' = cx − sy`,
`y' = sx + cy`; my rasteriser's projector builds the identical pair. **Same
convention, so 1.7% is the figure that applies to my table.** Ten seconds, and it
was worth asking for.

Two things in that census are worth more than the answer and belong in every
future brief, not just this one:

- **135° and 225° carry ZERO road. Half the compass never occurs.** Nothing needs
  defending at four of the eight bearings we all measure at — and my own
  "second-worst bearing" was one of them.
- **Segment count and road length are different denominators.** They agree here,
  but a 30 px dogleg and a 600 px straight count the same in the first.

The caveat kaz stated and I am not pretending away: this weights **road**, and
the Hedger only strikes near **towers**, which players place. If players build
overwhelmingly at bends, exposure shifts toward where bearings change. It does
not move the decision — 1.7% and 4.5% are both small and 135/225 are zero.

### 4c. Impact can land on any gait phase, and it does

2.5 s between strikes against a 0.982 s stride is 2.546 cycles, so the impact
phase advances **6.55 of 12 frames** every attack and does not repeat soon. A
rest-vs-strike pair would have told us nothing about this. Peak strike XOR at yaw
0, by which gait frame the impact lands on:

```
gait frame   0    1    2    3    4    5    6    7    8    9   10   11
strike XOR  75   76   68   71   70   77   80   78   78   79   76   74
```

**Range 68–80 px — ±8% across every possible impact phase**, against a gait step
that varies from 3 to 27 px over the same frames. The gesture is very nearly
independent of where in the stride it lands. **That is the property that could
not have been assumed and it is why kaz was right to refuse a rest-vs-strike
pair.**

### 4d. It stays above the noise for 87% of the window

| t (s) | attackFlash | angle | strike XOR, yaw 0 | above the 14.0 px gait floor? |
|---|---|---|---|---|
| 0.00 | 1.00 | 34.0° | 75.2 | yes |
| 0.05 | 0.88 | 29.8° | 69.3 | yes |
| 0.10 | 0.75 | 25.5° | 63.4 | yes |
| 0.15 | 0.63 | 21.3° | 56.4 | yes |
| 0.20 | 0.50 | 17.0° | 41.8 | yes |
| 0.25 | 0.38 | 12.8° | 32.3 | yes |
| 0.30 | 0.25 | 8.5° | 22.4 | yes |
| 0.35 | 0.13 | 4.3° | 11.7 | **no** |
| 0.40 | 0.00 | 0.0° | 0.0 | no |

**The gesture sinks under the walk's own noise at t = 0.35 s and reaches exactly
rest at 0.40.** That is the right shape: the last 12% of the recovery is
invisible, which means it lands on rest without a visible stop and there is no
pop when the override goes to identity.

### 4i. Why 34° and not more or less

| angle | strike XOR, yaw 0 | ratio vs gait | health-bar pad spent | tip drop |
|---|---|---|---|---|
| 12° | 34.3 | 3.1x | 17% | 2.4 px |
| 20° | 58.5 | 5.2x | 27% | 3.9 px |
| 26° | 73.1 | 6.5x | 34% | 5.0 px |
| **34°** | **82.8** | **7.4x** | **41%** | **6.3 px** |
| 42° | 84.8 | 7.6x | 46% | 7.6 px |
| 50° | 88.3 | 7.9x | 50% | 8.7 px |

**34° is the knee.** 26° → 34° buys 9.7 px of silhouette for 0.7 board px of
pad; 34° → 42° buys 2.0 px for 0.5. Past the knee the machine is spending health
bar clearance and getting nothing.

### 4j. The health bar. It does not move — and that is exactly the hazard

**No animation of any kind can move `model.top`.** `gl-models.js:120-124`
computes it as max z over the raw `positions` array at load — the **rest** mesh,
before any frame pose and before any override.

**Which is precisely why an override can bury the bar.** The bar is drawn at
`crownOf() = top * unitsToPx * scale + 10`, a flat **10 board px** of pad. If the
strike lifts anything above the rest silhouette, the bar sits inside the mesh —
and it appears and disappears once every 2.5 s, which is worse to look at than a
bar that is simply in the wrong place.

Measured on this geometry, worst case over all 12 gait frames x every angle from
0° to 34°:

| | |
|---|---|
| rest top (the drum's top face) | 0.9200 u = **36.6 board px** |
| health bar sits at | **46.6 board px** above the road |
| highest point anywhere in the window | 1.0225 u = 40.7 board px |
| **rise over rest** | **4.1 board px — 41% of the pad** |
| **clearance left under the bar** | **5.9 board px** |

**It clears, and 41% of a 10 px pad is not a comfortable margin — it is a budget
that has now been spent and must not be spent twice.** What rises is the drum's
own rear top corner as the mast tips. Two rules follow, and both are already in
the part inventory:

- **Nothing may be stacked above the drum.** The drum sets `top`; a cap, an
  antenna or a boss above it raises the bar for a body that is mostly shorter
  than that, permanently, for a part that does not read at 17 px wide.
- **The hold goes UNDER the drum, never on the rear rim.** A rear-rim hold rides
  up as the tool comes down and takes the rise from 4.1 to **6.6 board px** —
  two thirds of the pad, for a part that is interior at every bearing.

**The trade kaz asked me to price turns out not to be a trade.** Because the bill
carries **horizontal**, its tip sits at drum-centre height, below the drum's top
face — so **the drum sets the bar height and the bill's length does not enter it
at all.** Suki can make the tool any length without moving the health bar. The
constraint that replaces the trade is one line: **the bill's rest pose must keep
its tip at or below the drum's top face.**

### 4k. Two things the structure makes impossible, which is better than stating them

- **The tool can never reach the road.** Its reach from the mast root (0.52 u) is
  less than the mast root's height above the road (0.80 u), so at *any* stroke
  angle up to 90° the tip is at z ≥ 0.28. This is the defect that was written
  wrong three times on the shipped body's crank; here it cannot occur.
- **The strike cannot make the plan envelope worse.** Plan radius envelope —
  **taken over every part of the body, as the plan envelope and not a single
  axis**, across every gait frame and every angle in the window — is **0.5248 u
  projected, 0.5331 u built**, against a frost-ring **RADIUS** of **0.4465 u**:
  **117–119%**. The stroke actually pulls the tool *inward* (tip goes from 0.520
  to 0.431 u forward), so the struck body is narrower in plan than the resting
  one — which is the claim that matters here and is unaffected.

  **CORRECTED 2026-08-14 (kaz). This said "against the frost-ring budget of
  0.8930, margin 0.368 u" and that set a RADIUS against a DIAMETER** — 0.8930 is
  the ring's full width. The heading said "cannot break the plan budget"; the
  body **does** exceed the ring, deliberately, as most of the roster does
  (shipped Hedger 162%, brute 203%, hive 189%, Tyrant 115%, Dray 105%, Tender
  103%). The cost is that the hover and frost rings draw inside the silhouette.
  **The Tripod is the tightest comparable body on the board and 26% better than
  the one it replaces**, which is a stronger claim than the false one it
  replaces. See the parts brief for why a plan radius is not a half-width.

### 4l. `bob` and `roll` — the one lever that fixes two things at once

**Specify `bob = 0.015` and `roll_deg = 1.3` — half the chassis default of 0.03
and 2.6.** Measured, on the same instrument, the strike itself unchanged:

| bob / roll | gait floor, yaw 0 | ratio at yaw 0 | gait floor, 8 bearings | ratio, 8 bearings |
|---|---|---|---|---|
| 0.000 / 0.0° (the proxy I first measured — not buildable) | 11.2 px | 7.0x | 11.0 px | 4.4x |
| **0.015 / 1.3° — SPECIFIED** | **14.0 px** | **5.4x** | **14.6 px** | **3.4x** |
| 0.030 / 2.6° (chassis default) | 17.2 px | 4.4x | 19.1 px | 2.6x |

Halving them **buys back 23% of the strike's margin at the dominant bearing and
30% across all eight, and costs the strike nothing** (75.2 px against 75.0).

Three results from one lever, which is why it is worth spending a paragraph on:

1. **It gives the strike its headroom back.** The gesture and the body roll
   compete for the same visual channel — "the top of the machine is tilting" —
   so every degree of walk roll is noise the strike has to be heard over.
2. **It buys plan margin.** kaz's point, and it is counter-intuitive: this
   chassis rolls about a body root *on the ground*, not through the body's
   centre, so a roll swings a high mass sideways by roughly `height x sin(roll)`
   rather than narrowing it by `cos(roll)`. At the drum's 0.80 u that is 0.036 u
   at 2.6° against 0.018 u at 1.3°.
3. **It softens the 2-against-3.** `bob` and `roll` stay wired to leg group 0, so
   they beat twice per cycle against three footfalls. suki calls that a gait
   rather than a defect and I agree — but it is half as loud at half the
   amplitude.

**I would not take it to zero, and that is a deliberate stop.** A body that does
not bob reads as sliding, which is a worse defect than the one being fixed and a
harder one to diagnose. Half is a measured point, not a compromise; below it, the
next reading belongs to juno rather than to me.

Which decomposes how? **`bob` is the bigger offender at the dominant bearing
(bob-only ratio 4.1 against roll-only 4.7); `roll` is the bigger offender across
all bearings (roll-only 2.8 against bob-only 3.2).** Both are being halved, so
this only matters if one of them has to be kept — in which case keep `roll` if
yaw 0 is all that is being protected, and keep `bob` if all eight are.

### 4m. How low the tool finishes, in the machine's own terms only

The stroke ends with the tool's tip at **0.509 u — 55% of this machine's own
standing height**, having started at 87%. It works in the band between its own
shoulder and its own knee and never enters the road.

**I am deliberately not converting that to a relationship with a tower.** kaz
supplied the raw span of the starter tower (`rifleman-base.js`, z −0.502 to
1.877 model units) with the caution that towers draw at their own scale, which is
not established, and that the model's z range includes geometry below zero so its
origin is not its footing. **Three people have already spent a day here
converting toward a quantity that was never derivable.** If an on-screen
relationship is ever wanted, it is a capture of a Hedger and a gunner in one
frame, and it is juno's.

What can be said without the conversion, and is enough to build from: **the thing
being cut is substantially taller than the machine cutting it**, so a tool
working at the machine's own mid-height is working at the base of the thing in
front of it. The gesture says *low* relative to the obstruction, not relative to
itself.

---

## 5. THE AIM: measured, and rejected. This is my call and here is the number

kaz found that the renderer can know which tower was hit — `resolveAttack` sets
`attackBeam = {x, y, life}` and it has no consumers under `js/gl/` either, so
`atan2` gives a real bearing. He offered aimed or unaimed and did not decide it.

**Unaimed. The drum does not turn.**

The tempting argument for aiming is mine and it is the rule I wrote after the
Courier: *the question is not "does this body have an event" but "is the CAUSE of
the event visible on the body, or only the consequence?"* A machine stroking
forward while a tower off to the side loses health looks like the consequence
without the cause.

**It does not apply here, and I checked rather than assumed. The cause IS on the
body — the stroke is right there.** What aiming adds is not cause, it is
*target linkage*, which is a weaker requirement, and this body pays for it twice
over without buying it:

Measured on the earlier proxy (proud head, no bob/roll), so read the COLUMN as a
comparison and not against section 4a's absolute figures — every row shares the
same conditions, which is what a ranking needs.

| aim | strike XOR, yaw 0 | ratio vs gait | how far the tip moves toward the struck side |
|---|---|---|---|
| **0°** | **82.8 px** | **7.4x** | 0.0 px |
| 15° | 78.1 | 7.0x | 1.6 px |
| 25° | 70.5 | 6.3x | 2.6 px |
| 35° | 62.8 | 5.6x | 3.6 px |
| 50° | 53.8 | 4.8x | 4.8 px |

**Aiming costs silhouette monotonically and buys almost no displacement, because
at yaw 0 — 25 of 42 road segments — the model's +y is the DEPTH axis.** Turning
the tool toward a tower beside the road swings it into the screen, where it
foreshortens from 19.7 px/u to 10.9 px/u and eventually hides behind its own
drum. Measured at yaw 0, the mast's contribution to the silhouette falls from 135
lit px at aim 0° to 47 px at 75°. **That is the exact defect that was already
found and fixed once on this body**, when the shipped Hedger's crank was moved
off the far hip after juno measured its visible area swinging 4 px to 63 px
inside one crank cycle.

**And there is no useful middle.** Below about 25° the sideways displacement (1.6
px on a 2 px tool) is under the resolvable floor while the silhouette cost is
already real — so a small aim is strictly the worst option available. **It is
35°+ or it is nothing**, and 35° costs 24% of the strike's own read at the
bearing that matters most.

The linkage that aiming would have bought is paid for by the mechanism instead:
**the stroke only fires when a tower is within 47.5 u.l. = 49.4 board px**, about
two and a half of this body's own plan radii, and **the Hedger's first appearance
is a pure wave of twenty.** Twenty machines stroking as they file past one dying
tower is attributable by proximity and repetition without anything pointing.

It also happens to be right on hugo's reading — a machine clearing the verge does
not turn to face its work — but **I did not decide it on that**, because that
ruling is unratified and this decision has to survive Diego rejecting it.

**If it is overruled and the aim goes in, the aim bearing MUST be latched at the
start of the window and not read per frame.** `attackBeam.life` decays at `dt*4`
(0.250 s) while `attackFlash` decays at `dt*2.5` (0.400 s), so the target
position vanishes **0.15 s before the gesture ends** and an unlatched aim snaps
back to the heading partway through the recovery. That renders perfectly
plausibly and is wrong, and a still frame cannot show it.

---

## 6. What the piece says about the tower — and the one word to design against

Every other machine on this road walks past whatever you build. This one is the
only thing below boss tier that was ever armed, and the other member of that
category is the final boss.

**hugo's ruling, 2026-08-13 — UNRATIFIED, Diego has not seen it, and he is
batching it tonight with the map concepts. Nobody cuts a mesh on this as
settled.** The machine does not think it is fighting. It thinks it is **clearing
the verge**: a tower is growth that has come up across the route, and it is
cutting it back so the road stays walkable. The intelligence has no category
called *enemy*, so when something stood in the road it reached for the
classification it already had — *obstruction* — and armed one frame with the tool
you use on obstructions. A maintenance vehicle, not an escalation.

**hugo's line, and it is the acceptance test for the animation:** *if it reads as
angry, it is wrong; if it reads as chore, it is right. The horror is the
indifference.*

**Three specification decisions follow from that, and each one is a thing I chose
NOT to do:**

- **The curve is linear.** An eased return reads as effort and a machine on a cam
  returns at a constant rate. This is the difference between a thing that is
  recovering and a thing that is resetting, and this machine is resetting.
- **There is no overshoot and no settle.** A settle is a mass-and-effort cue.
  This gesture is specified as effortless, and the settle would also have been
  the one part of the motion capable of eating health-bar pad for nothing.
- **The legs never react.** Not a hitch, not a brace, not a pause. **The seam
  makes this structural rather than a matter of discipline** — `overrides`
  composes on top of the baked walk and cannot fight it, so the gait is
  untouchable by construction. The machine strikes without breaking step, and
  that is the whole read.

---

## 7. The tier question

**There is none, and that is worth writing down rather than leaving as an
absence.** `angry` is a single enemy type with no upgrade tiers, one geometry and
one sizeScale. Nothing here differs at a glance from anything, and no
tier-separation work is owed on this body.

---

## 8. What may be dropped from the gesture, in order

1. **Nothing, until the angle.** The gesture is one matrix on one group. There is
   no detail in it to cut — it is already the cheapest possible expression of a
   moving part in this engine, costing zero triangles and zero baked frames.
2. **If the health-bar pad is needed elsewhere**, the angle comes down before
   anything else changes. 26° keeps 88% of the read for 34% of the pad instead of
   41%. Below 20° it stops being worth building.
3. **The pull-in is free and unspecified.** The 2.2 px of backward travel is a
   consequence of rotating about the drum centre rather than the rim, not a
   design intent. If suki finds a reason to pivot at the rim instead, the read
   survives; the tip drop grows and the top rise grows with it, so it must be
   re-measured, not assumed.

---

## 9. Instruments, and whose numbers settle this

Everything above is from `scratchpad/mira-tripod-gesture.js` and
`mira-tripod-gesture2.js`, built on `scratchpad/mira-raster.js` — arithmetic
through the house-standard projection at the game's fitted default camera,
calibrated on siphon-a1 at 463 lit px in a 21.9 x 35.7 px box. **The deciding
runs are written to files rather than quoted from a session**, because the last
time a row of mine could not be reproduced suki nearly built a circular torus
where the brief needed a 2:1 ellipse.

**These are projections, not renders. My rasteriser is calibrated, which makes it
good evidence and still not independent evidence.**

**WHICH OF MY NUMBERS NEED A SECOND SOURCE, AND WHICH DO NOT — read this before
quoting anything above.** My rasteriser is calibrated for **silhouette** and has
**no model of what a gait costs.** It does not know a stride length, a bob
amplitude or a roll angle; it is handed them. So:

- **Any walk-relative figure here is provisional until someone who owns the rig
  supplies the amplitudes.** Both large corrections in this document came from
  the build side and neither was findable by measuring more carefully: bob and
  roll from kaz, stride excursion from suki. Each moved a headline by more than
  40%.
- **Static silhouette figures — plan radius, box, top-quarter fill, the health
  bar rise — do not have that dependency** and are as good as the instrument.

This is a property of the instrument, not of this job, and it will be true of the
next brief of mine that quotes a number against a walk. The predictions I am making
in advance, so the gate is someone else's:

> 1. On the built model, at true game scale, at yaw 0, at bob 0.015 / roll 1.3:
>    **the strike changes 68–80 screen px of silhouette whichever gait frame it
>    lands on, against a gait-only frame-to-frame floor near 14 px.**
> 2. **The strike's highest point exceeds the rest mesh's highest point by 4.1
>    board px of the health bar's 10 board px pad, and by nothing more.**
> 3. **At yaw 270 the strike changes under 10 screen px and is quieter than the
>    walk.** I expect this one to be confirmed, not refuted — it is the finding I
>    would most like to be wrong about.

Ask kaz to route all three to **juno**, who did not produce them. Expect small
disagreements between honest measurements — the same figure has come back as 447
lit px from rendering and 462 from quality inside the same box. A gap of that
size is a reason to ask for a fresh number, not to defend mine.
