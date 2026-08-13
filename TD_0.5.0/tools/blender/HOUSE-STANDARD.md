# The house standard — what a model must be, at the size this game draws it

Written 2026-08-12 by mira, art director for models. Every claim below is either
a measurement with an owner's name on it, or arithmetic from measured inputs and
labelled as such. Where it is neither, it says so and names who would settle it.

This is the document a brief is written against. It is not general art
direction; almost none of it transfers to a game drawn at a different size.

Moved here from agent memory on 2026-08-12, unchanged apart from this
paragraph. It lives in `tools/blender/` because that is where its readers work
and where `WARBRINGER_CONCEPT.md` already sits, and because agent memory is
outside version control — this document governs future briefs and had no
backup. Petra (archivist) moved it; the content is mira's and the standard is
hers to change.

---

## 0. The box, and the ruler

At the default camera a whole **base / A1** Siphon occupies **22 x 35 px (screen)**.

> **TIER LABEL CORRECTED 2026-08-13 (mira, measured; kaz, confirmed and landed).
> This line said A4 from the day it was written, and it is the base tier.** The
> proof needs no camera and no projection, because it is in Blender units: this
> section's own height figure is **1.790 u**, which matches base and A1 to 0.3%
> and A4 to **9%**. Measured z extents: base 1.795, a1 1.795, a2 1.796, a3 1.877,
> **a4 1.956**, a5 2.072. Section 5 of this document already contradicted section
> 0 — it says the figure grows 1.790 → 2.080 across five tiers, which is only
> consistent if 1.790 is the *bottom* of that range.
>
> Boxes, mira's rig at yaw 90: **base 21.6 x 35.7, A1 21.9 x 35.7, A4 21.5 x
> 39.3.** Lit px: **base 458, A1 461, A4 493** against the 447/462 recorded
> below. **A4 is 7% above the documented figure; A1 is within one pixel of it.**
>
> **The direction was safe and the label was not.** Base is the smallest A-tier,
> so everyone has been designing to the tightest box. But the next person to
> measure A4 would have got 39 px of height and concluded the standard was 12%
> out. This was nearly compounded: I instructed mira to re-anchor her rasteriser
> on A4, which would have scaled her instrument to make 493 read as 462 and
> carried a **6.7% error into every model from here.** She checked before
> complying. **"Reads at 22 x 35 px" is the most-quoted line in this project** —
> quote it with its tier.

| | measured | by |
|---|---|---|
| the Siphon's box | 22 x 35 px (screen) = 770 px | kaz, juno |
| the figure lights | **447 px** / **462 px** | kaz 2026-08-12 / juno 2026-08-11 |
| the sceptre — the most-discussed feature on the model | **52 px** unoccluded, 48 visible, in a **9 x 13 px** sub-box | kaz, reproduced by juno |
| the figure's height | 1.790 blender units = **29.5 px (screen)** | generator, confirmed in-browser |

The figure fills **58–60%** of its own box. The sceptre is **11%** of the figure.

**The box is not the same for every tower and 22 x 35 is the Siphon's.** Kaz's
**covered-pixel** counts at the default camera: `rifleman-b5` covers **634 px**
in a **41 x 42 px** box, `sniper-b5` 633 px, `summoner-b5` 462 px, `siphon-b5`
428 px. So a rifleman is roughly twice the Siphon's linear size and the Siphon is
at the small end of the roster. Quote 22 x 35 as the Siphon's number, not as the
game's, and quote all of these as **default-camera** figures — section 2 explains
why that qualifier is load-bearing.

**Two denominators, and they are not interchangeable: covered pixels versus
bounding-box area.** Every pixel figure in this document is *covered* pixels —
pixels the model actually lights. Bounding-box area is mostly background and
using it flatters a model by a factor of several. Name your denominator the same
way you name your pixel space.

**Two honest measurements of the same thing disagree — 447 against 462, same
box, same day.** That is expected. It is a reason to ask for a fresh number, and
never a reason to quote the one you remember.

**Every pixel figure names its space.** Board px and screen px differ by
**31.8032 / 16.49 = 1.93x** in z, and the board ruler is the optimistic one.
This project has read one as the other twice, the second time inside the very
file whose header records the first time. Write `9 x 13 px (screen)`.

**The conversion table.** Screen px per Blender unit, measured in-browser at the
reference viewport:

| axis | px per unit | 1 screen px = |
|---|---|---|
| x, across the screen | 19.73 | 0.051 u |
| y, into the screen | 10.91 | 0.092 u |
| z, up | 16.49 | 0.061 u |

> **"THE DEFAULT CAMERA" IS A NUMBER PER VIEWPORT — QUOTE THE VIEWPORT BESIDE
> THE DISTANCE.** `gl-world.js` fits the board with `camera.fitBounds()` on the
> first draw, and `fitBounds` depends on **aspect**. Two rigs whose canvases
> differed by two pixels produced **2021.3631 and 2021.237** — same target, same
> yaw, same pitch. That gap is 0.006% and harmless numerically, but **unless the
> viewport is stated the next two-rig disagreement gets read as a finding when it
> is a window size**, and this project has already spent a day on one scale
> disagreement that turned out to be a camera. Found by juno, 2026-08-13.
>
> The distance is also **not** `OrbitCamera`'s constructor default of 900 — read
> the camera before anything draws and you get 900 with target [0,0,0], which is
> 2.25x too close and centred off the board. That is the disagreement above.
>
> **AND A SINGLE FRAME IS WORTH ABOUT ±13% OF THE SILHOUETTE.** The Gleaner runs
> **134 to 151 lit px across its eight walk frames** at one camera and one yaw.
> So any figure taken from one frame carries that much noise before anything else
> is measured, and **a question about a moving part wants a per-frame curve rather
> than a number** — otto reached the same thing from the other direction, with
> f0-vs-f3 at 224 px against f0-vs-f6 at 111 px on the Hedger's crank. This is
> why *frame* is one of the terms every figure must name.

> **REST POSE AND ALL-FRAMES ARE TWO DIFFERENT WIDTHS, AND THE SECOND IS THE ONE
> A PLAYER SEES.** Rest answers *how wide is it standing*; the all-frames union
> answers *how wide is the space it sweeps*. For a walking body they differ by a
> lot — the pre-rebuild Skimmer was 0.510 u at rest and **0.571 swept**, because
> the arms swing outward. Quote which one, every time. (otto, 2026-08-13.)
>
> **AND NEVER AVERAGE A WIDTH OVER YAWS.** Kaz swept mean width over 12 bearings,
> found the rebuilt Skimmer at 0.871 of the Gleaner's width and 0.868 of its
> height, and reported *a uniform shrink — the one thing the card forbids*. The
> mean was correct and it **destroyed the signal**: per bearing the narrowing is
> **−10% head-on and −35% broadside**, and the measured separation tracks the
> anisotropy (0.69 front, 0.81 broadside) rather than the mean. It nearly caused
> the revert of a rebuild that had worked. **A body yaws with the path, so width
> is a curve over bearing and collapsing it to one number is a population error.**
>
> **MEASURE ADJACENT-PAIR SEPARATION AT THREE BEARINGS, NOT ONE.** Two separate
> defects hid behind the standard three-quarter view in a single day: the
> Skimmer's, and then **Gleaner vs Tun at 0.57 broadside — the worst pair on the
> board, on a model that scores 0.80–0.89 at the two standard views and was
> signed off on them.** Front, three-quarter and broadside cost one run.

> **MODELS ARE NAMED FOR THE `typeId`. LORE NAMES LIVE IN CARDS AND COMMIT
> SUBJECTS ONLY.** `enemyModel()` is `"enemy-" + enemy.typeId`, so the Hedger
> ships as **`enemy-angry.js`** and `tools/blender/enemy_hedger.py` exports
> `--only=enemy-angry`. Two people lost real work to this in one day — juno was
> about to escalate for a missing export because grepping `enemy-hedger` returned
> nothing, and an earlier count dropped every underscored id including
> `camo_normal`. **A name correct in one namespace and absent in the other reads
> exactly like a missing asset.**

**So any feature under about 0.05 u does not exist.** That one line rejects more
bad detail than everything else here combined. Note also that x and z are nearly
double y: a gesture aimed into the screen is worth half a gesture aimed across
it, and at the opposing bearing a horizontal component *subtracts*.

---

## 1. The silhouette is the model — and "pixels changed" is not the metric

Measured by juno on the Siphon's rest-to-hold gesture: **134 px of 462 change,
29% of the figure.** That sounds decisive. The split is not:

- **10 px gained silhouette**
- 25 px vacated silhouette
- **99 px recoloured — 74% of the change**

Juno's verdict on that same gesture was *"it reads; it does not announce
itself."* That verdict attaches to the split, not to the 29%.

**The metric for any proposed change is the three-way split, and the number that
carries is gained-plus-vacated silhouette.** A recolour inside the mass is the
cheapest pixel to produce and the least visible in motion — at this size the eye
gets outline first and interior value second, and in motion it gets outline
almost exclusively.

Ask juno for the split. Do not accept "it's a 29% change" from anyone, including
me.

---

## 2. The resolvable ceiling — and **every rule must name the view it protects**

This is the most important section in the document, and it arrived as a
correction to a stronger claim I had already written down. The correction is
worth more than the claim was.

**What I first wrote, from kaz's default-camera measurement:** at most
`footprint` triangles can occupy distinct pixels, so `rifleman-base` at 9,224
triangles over 276 covered px is 3.0% resolvable and everything past that is
provably invisible.

**Why that is only half true.** Juno varied the one thing the claim said should
not matter: **the player's camera is not fixed.** It zooms from 2022 down to
**180** — more than 11x closer than the view the claim was measured at.

Triangles per **covered pixel**, measured at three distances:

| model | @4200 zoomed out | @2022 default | @180 max zoom in |
|---|---|---|---|
| rifleman-base | 131.77 | **33.42** | **0.26** |
| rifleman-b5 | 87.80 | 21.88 | 0.17 |
| sniper-b5 | 79.00 | 19.97 | 0.16 |
| summoner-b5 | 7.40 | 1.92 | 0.02 |
| siphon-base | 8.07 | 2.04 | 0.02 |

**At the closest zoom the player can actually reach, every model is comfortably
under one triangle per pixel.** The heavy geometry is not invisible. It is
invisible *at the default view* and fully resolvable at a zoom the player
controls. The crossover distances for rifleman and sniper — 350 and 500 — sit
**inside** the player's zoom range, not outside it.

### So the ceiling cannot be derived from resolution alone

It depends on which view the budget chooses to protect, and **that is a product
decision, not a measurement.** Kaz has put the three-way choice to Diego: protect
the default view only (heavy models are 17–33x past resolution and the ceiling
drops hard), protect max zoom-in (nothing is over budget on resolution grounds),
or something between.

**Therefore, the rule this standard actually carries:**

> **Every rule about detail must name the view it protects.** "Reads at 22 x 35
> px" and "holds up when the player zooms in to look at it" are different
> requirements, and they may want different answers.

### My recommendation, as the art call rather than the measurement

The two requirements are not satisfied by different *amounts* of detail. They are
satisfied by different *kinds*:

- **Silhouette, value separation and motion pay at every zoom.** A good outline
  is still good close up. These serve the default view — where the game is
  actually played and every decision is made — and lose nothing at any other.
- **Surface detail pays only at max zoom.** Fold geometry, ring separation, the
  modelled weld, finger articulation: invisible at default, real when inspected.

So: **detail that only pays at max zoom is a reward, not a read.** It is
legitimate and it is worth having. It must never compete for budget with
silhouette work, and "looks great zoomed in" must never substitute for a
default-view measurement.

What I would recommend as the "something between", stated so it can be argued
with:

1. **Protect the default view absolutely, for silhouette, value and motion.**
   Non-negotiable — that is the view the game is played in.
2. **Protect max zoom for surface detail on towers only.** Towers get looked at:
   you choose one, you buy it, you open its panel, you zoom in on the thing you
   just spent $25,000 on.
3. **Do not protect zoom at all for anything that multiplies.** Nobody zooms in
   to admire an enemy at wave 12 — it streams past and dies. And per section 8,
   the multiplied family is where the entire per-frame cost lives.

Points 2 and 3 are the same argument arriving from two directions: **the family
nobody inspects is also the family that costs everything.** That agreement is why
I am comfortable recommending it.

### The methodological point, and it is a units trap of the usual kind

**Covered pixels is the authoritative denominator. Say which one you mean, every
time.** Juno flags that dividing by bounding-box area instead of covered pixels
makes `summoner-b5` look like 0.63 — apparently under 1 — because most of a
bounding box is background. Every figure in this section is per **covered**
pixel.

This is the same family of error as board px versus screen px. Name your space,
and name your denominator.

### What it still means for a brief-writer

When a model is already near one triangle per covered pixel at the default view —
`siphon-base` at 2.04, `summoner-b5` at 1.92 — additional triangles buy almost
nothing *for the default view*, and the remaining lever is **where the existing
triangles go**: silhouette, value separation, motion. That is exactly the
Siphon's situation, and it is why its brief asks for a redistribution of movement
rather than for more parts. That conclusion survives the correction intact,
because it was never about the ceiling — it was about placement.

### The worked example: sniper-a4, which is cheaper *and* more distinct

`sniper-a4` is the **cheapest** sniper tier at 2,416 triangles, and that is
deliberate. The tier **removes the legs** and sockets the body into a gimbal yoke
with a mounted rail cannon. It paints **6,977 pixels no other tier covers**, in
gold and emissive.

Cheaper, and more distinct, because of what it takes away.

**That is the shape of a good answer to any brief in this project.** A tier that
reads differently because something was **removed** beats a tier that reads
differently because something was added, on four separate counts: it costs less,
it resolves better, subtraction is legible at a glance in a way that added parts
at 0.5 px are not, and — the one that matters most given section 2 — **it is
view-independent.** A removal that changes the outline reads at the default view
*and* at max zoom, so it is the rare choice that does not require deciding which
view the budget protects.

Look for the removal first. The Siphon brief's A5 is built on this: the same
gesture, with the life taken out of it.

---

## 3. A feature needs roughly 40–50 px to be a feature — **ON A TOWER**

> **SCOPED 2026-08-13 (kaz's ruling, standing). THE 40–50 px FLOOR IS A TOWER
> NUMBER AND DOES NOT TRANSFER TO AN ENEMY.** It was calibrated on the sceptre:
> **52 px on a 447 px figure = 11.6%.** The Gleaner at the same camera is
> **~148 lit px** — a third of the linear size — so applying an absolute pixel
> threshold across a 3x difference in the subject is a correct measurement
> against the wrong population. **The proportional form is what carries:
> ~11% of the figure, which is ~16 px on a 148 px body.**
>
> Worked example, the Drudge: measured silhouette separation **30.6 px = 20.7%
> of the figure**, against the sceptre's 11.6%. **Proportionally 1.8x the
> most-discussed feature in the game.** Passed.
>
> **AND THE PROPORTIONAL FORM IS THE ONLY ONE THAT SURVIVES A ZOOMABLE CAMERA.**
> This is the deeper reason and it outranks the population argument. The player
> controls distance from 180 to 4200; a figure measured at 900 is **2.247x**
> linear and ~5x in area the same figure measured at the fitted default of
> ~2022. **An absolute pixel floor therefore has a different value at every
> camera distance and is not a property of the model at all.** A ratio of two
> lengths measured in the same frame is invariant under it. When a rule must
> name the view it protects (section 2), a rule expressed as a proportion does
> not have to.
>
> This was found the hard way: two honest measurements of the Gleaner disagreed
> by 2.3x linear and 4.5x in area, and one of them was taken at `OrbitCamera`'s
> **constructor default of 900** rather than the distance `gl-world.js:947`
> solves with `fitBounds()`. Diego identified the cause in one line — *"the game
> has zoom integrated, so maybe one zoomed while measuring"* — against two wrong
> hypotheses from me.
>
> **THE BRACKET IS CLOSED — 2026-08-13, juno.** This section has rested on a
> single calibrated point since it was written, and it now has both ends:
>
> | | feature | of figure | verdict |
> |---|---|---|---|
> | reads | sceptre, **52 px** | 11.6% of 447 px | the calibrated point |
> | **does NOT read** | **Gleaner inspection windows, 1–4 px** | **0.7–3% of 134 px** | measured negative |
>
> The negative control is strong: all three windows together occupy 0–6 px, and
> **deleting them entirely changes ZERO pixels above a 32/255 threshold at four
> of eight yaws** — a feature that provably does not read, on a shipping model,
> at the camera the game boots into. That is the measurement this section asked
> for and could not have without someone building the negative case.
>
> **AND AREA ALONE CANNOT BE THE FLOOR.** At yaw 45 the **lens is 1 px and
> survives** a 32/255 deletion; the **cargo core is also 1 px and does not.**
> Identical area, opposite outcome, local contrast 68 against 10.
>
> **THE THIRD TERM IS OCCLUSION, AND IT IS A GATE RATHER THAN A MODIFIER**
> (mira, 2026-08-13, read off the source geometry rather than inferred from
> pixels). My first form of this rule said *area AND contrast, either alone
> insufficient, high contrast survivable below the area floor* — internally
> inconsistent, because an AND cannot be survivable below one of its terms. The
> form that fits all four data points:
>
> > **A feature reads if it clears the AREA floor, OR if it clears the CONTRAST
> > floor while being UNOCCLUDED. Occlusion gates the second route; it does not
> > scale it.**
>
> 1. **Area** — >= ~11% of the figure's lit px.
> 2. **Contrast** — >= CR 2.0 against the material it directly abuts (section 4).
> 3. **Unoccluded** — no geometry of the model's own crosses in front of it.
>
> | feature | area | contrast | unoccluded | outcome |
> |---|---|---|---|---|
> | sceptre, 52 px = 11.6% | **pass** | pass | pass | **reads** |
> | lens, 1 px @ yaw 45 | fail | pass, CR 3.27 | **pass** | **survives** |
> | cargo core, 1 px @ yaw 45 | fail | pass, CR 3.27 | **FAIL** | **dies** |
> | inspection windows, 0–6 px | fail | pass on paper | **FAIL** | **dies** |
>
> The occlusion column is geometry, not interpretation: the **lens** ball's face
> reaches x=0.228 against its ring's 0.183, so it stands ~0.045 u proud with
> nothing in front of it; the **cargo core**'s face is at x=0.247 with
> `cargo_guard_vertical` and `cargo_guard_horizontal` both spanning 0.237–0.267
> — **two bars directly across it**; the **windows** sit behind
> `cargo_side_strut_l` at y=0.171. **That is why identical area and identical
> material gave opposite outcomes.**
>
> **The consequence for a brief, and it is the sentence to use: a small feature
> does not need to be bigger — it needs to be moved to where nothing crosses it,
> which is the silhouette edge. That is free, where area is not.** This is
> section 6's "motion at an unoccluded extremity" and section 7's "don't spend
> detail at a beam origin" arriving a third time, which is the first sign it is
> the real variable rather than a third patch. **Occlusion is checkable in the
> build script before anything is exported**, which is the property a floor most
> wants.
>
> **Every figure here is at the fitted default (~2021).** At distance 900 those
> same invisible windows are 4–27 px and clearly visible — which is section 2's
> point arriving inside section 3, and the reason the proportional form is the
> durable one. None of this is measured over `file://`, only over http.

The one calibrated point: the sceptre at **52 px, 11% of the figure**, is the
most-discussed feature on this model and it reads.

Working rule, extrapolated from that single point: **a tower carries about eight
readable features** (447 / ~50), and fewer in practice because they must also
separate by value. A brief naming more than eight has set no priority, so the
priority will be set by whoever exports it.

**This is the weakest rule in the document and I want it hardened.** What would
settle it is one number: juno measuring the pixel area of a feature the team
already agrees does NOT read. That converts an extrapolation into a bracket, and
it is the single most valuable outstanding measurement for this standard.

---

## 4. Value before hue — and contrast ratio, not luminance difference

`AGENTS.md` clause 7 records the failure this rule exists for: the first Rifleman
palette put five colours inside ~8% luminance and rendered as one dark blob.

The right measure is **contrast ratio**, not a luminance gap — a gap of three
points means something different at the dark end than at the light end, and the
raw-gap version of this table over-flags the shadows and under-flags the
highlights. I made that mistake first and the table below is the corrected one.

**RATIFIED by kaz 2026-08-12** as the working standard, flagged for screen-pixel
calibration later. He re-derived the arithmetic independently and confirmed that
contrast ratio, not luminance gap, is the right instrument.

| CR between two adjacent parts | what happens at this size |
|---|---|
| **under 1.25** | they are the same value. They merge into one shape. |
| **1.25 – 1.6** | separates only across a long, roughly straight boundary |
| **over 2.0** | reads as two things anywhere, including across a jagged 3 px edge |

> **THE TABLE IS EXACTLY RIGHT FOR ENEMIES AND UNDERSTATES CONTRAST ON TOWERS —
> because EMISSION IS INERT ON EVERY GROUND ENEMY.** Verified in the shader
> 2026-08-13 (mira found it, kaz confirmed, juno reached it independently). The
> fragment shader's only emissive term is `lit += uGlowTint * (vEmi * uGlow)` —
> purely multiplicative — and in the enemy draw loop `setGlow` is called **only
> under `if (e.isFlying)`**, and put back immediately after. **A walker never
> sets it.**
>
> So the Gleaner's three authored emission tiers — lens 4.2, cargo core 1.55,
> inspection windows 0.58 — **all render as flat `core_red` #DE4F54, identical to
> one another.** The tuning comment in `enemy_normal.py` explaining that panes at
> emission 2 "blew out to flat pink tabs" is live in the Blender and sprite paths
> and **inert in the shipping GL renderer.**
>
> Three consequences. This table is computed on base albedo, which is exactly
> what an enemy renders, so **it is correct as written wherever it has actually
> been used**; it would understate contrast on **towers**, where `towerGlow` is
> non-zero. **There is no bloom on a ground enemy to rescue a sub-threshold
> feature — the spread is zero by construction, not by measurement.** And nobody
> should "fix" a model over this: it is a fact to know before anyone briefs
> *make it glow* on a walker.
>
> Related hazard, low priority, for the GL owner: `setGlow` is state rather than
> an argument, and the sphere-type branch has no put-back of its own. Safe today
> because every setter puts back — one missed `else` from a ground enemy
> inheriting a flier's lantern.

**Every figure in the table below is a CEILING, never an underestimate.** This is
kaz's addition and it is the half I could not have reached: the shader lights
palette colours before they reach the screen, and shading a pair **down** drives
their ratio toward 1.0, while shading **up** only ever approaches the raw
luminance ratio. So the raw palette figure is the best case a pair can achieve
under any lighting at all, and real shadow can only be worse.

**Consequence: a pair that fails on paper cannot be rescued by lighting.** When a
CR figure here says two parts merge, that is a proof and not a prediction. It
also means this table can be used to reject a palette *before* anything is
lit — which is the whole point of having it.

### The Siphon palette, measured

Relative luminance (Rec709 on sRGB-linearised channels), darkest first, with the
contrast ratio to the rung below:

| Y | hex | name | CR to rung below |
|---|---|---|---|
| 6.0% | `#4A453C` | cloth_dark | — |
| 7.3% | `#6B3A6E` | purple_rich | 1.11 |
| 12.7% | `#6B6355` | cloth_worn | 1.44 |
| 16.2% | `#8A6A4C` | skin_dark | 1.20 |
| 16.6% | `#8A6E1C` | gold_dark | **1.02** |
| 17.4% | `#7D735F` | hem_fray | 1.04 |
| 21.4% | `#9A7B3C` | brass | 1.17 |
| 24.6% | `#A8823E` | ochre_cloth | 1.12 |
| 28.4% | `#B08A66` | skin | 1.13 |
| 38.4% | `#C9A227` | gold | 1.30 |
| 41.7% | `#D9A441` | amber | 1.08 |
| 76.7% | `#F0E2C0` | white_warm | 1.75 |

The palette is a **value ladder with nine rungs crowded into the middle and one
real step at the top**. Eight of eleven adjacent pairs are under CR 1.25.

**The finding that matters.** The model's entire narrative arc is a
mineralisation — flesh becoming gold, climbing from the extremities inward. What
that arc is worth on screen:

| transition | CR | what it is |
|---|---|---|
| skin → gold | **1.30** | lit flesh to lit gold — A1/A2/A3 fingers and forearms |
| skin_dark → gold_dark | **1.02** | the same parts, shadow side |
| hem_fray → brass | 1.17 | A1's coins |
| cloth_worn → ochre_cloth | **1.67** | the robe at A4/A5 |
| cloth_dark → gold_dark | 1.96 | robe shadow to gold shadow |

**On the shadow side the mineralisation is literally invisible — CR 1.02.** On
the lit side it is CR 1.30, on parts a few pixels across.

**Kaz's lighting proof makes this absolute rather than merely severe:
`skin_dark → gold_dark` cannot exceed CR 1.025 under any lighting whatsoever.**
Not hard to separate — *incapable* of separating. No modelling change and no
lighting change reaches it.

**Consequence: A1 and A2 cannot be legible tier purchases at game scale.** They
are hue changes at constant value on small parts. Anyone briefing a tier ladder
should plan around that rather than discover it after a build. See section 5.

**Measured 2026-08-12, and the honest result is softer than the prediction.**
Through the game's real `drawActor` path, `siphon-base` and `siphon-a1` differ by
**20 px at the default camera and 1,415 px at max zoom-in**.

So A1 is not invisible. **A1 is a reward, not a read** — section 2's distinction,
arriving on its own: 20 px on a ~447 px figure is under 5% at the view the game
is played in, and 1,415 px is unmistakable to a player who zooms in on what they
bought. Whether a $600 tier should be a reward rather than a read is a design
question for vera and Diego, not a defect for me to route as one.

**Recorded because I got this wrong in a way worth keeping.** An earlier
measurement reported *zero* differing pixels and I wrote it up as a shipped
scandal. It was a rig artefact — a standalone model-draw path rather than the
game's real per-group `drawActor` — and juno caught and retracted it herself.
**My CR reasoning survived; my eagerness to see it confirmed did not.** A
prediction of mine being "confirmed more strongly than I made it" should have
been the moment I asked how, not the moment I wrote it down. See `TIER-READS.md`.

---

## 5. Tier is signalled by silhouette events. Never by size

Measured: the Siphon's whole path-A growth is 1.790 → 2.080 u = **4.78 px over
five tiers, 0.96 px per tier.** The footprint never grows at all, by contract.

**Under one pixel per tier. Size is not a tier signal in this game.**

What is available, in descending order of legibility:

1. **A new element that breaks the outline.** A3's sceptre — +52 px of new
   silhouette — is the loudest tier event on the whole path.
2. **A REMOVAL that changes the outline.** `sniper-a4` — see section 2. Cheapest
   tier, most distinct tier, 6,977 px no other tier covers.
3. **New ground furniture.** A4's gold pour is `world_fixed` and adds silhouette
   at the base against empty board.
4. **A value change on the largest surface.** cloth_worn → ochre_cloth at CR
   1.67 is the largest legible material change on path A.
5. **A change in how the piece MOVES.** Free — see section 6 — and under-used.
6. Hue at constant value. CR ≈ 1.0. Not a signal. Do not spend a tier on it.

### A tier read is a property of a PAIR, not of a model

**This is the most valuable thing to come out of the 2026-08-12 measurements, and
it is suki's sentence:** *nothing in this generator has ever compared one tier to
another. Every gate it has is single-model. Tier ordering is an emergent property
of eleven independent builds.*

That is almost certainly true across all sixteen generators. **Tier ordering is
unverified everywhere in this game, and no build-time gate can see it by
construction** — a gate that loads one model cannot know what the tier below it
looks like.

So a tier read must be **asserted between adjacent tiers**, and in three ways
because they answer different questions:

- **At matched frames** — frame 0 against frame 0. This is authoring
  correctness: is the ladder ordered at all?
- **Across mismatched frames** — every frame of one against every frame of the
  other. This is what a player actually sees, because two towers on a board are
  never in step.
- **Frame to frame within one model** — consecutive frames of the same tier.
  **This one is invisible to the other two and it caught the largest thing on the
  Warbringer.**

### Why the third check is not optional

Because frame 0 is the held pose and base/a3's strip ends with the hammer down,
**an a3 snaps back at the loop wrap on every attack, once every four seconds.**
Measured apex to apex: **9 rows against the Siphon gesture's 4** — about **2.25x**
the Siphon's entire channelling gesture, delivered in one frame instead of seven.

**Juno's qualifier, which matters more than the multiple:** the snap is the
biggest thing a3 does, but it is not big. **251 px changed and 6.35 px of
centroid travel, against a4's *ordinary* frames at 461–572 px and 10.7 px.** It
is a **rate** discontinuity in a gentle animation — the rate jumps roughly 5x
while absolute displacement stays modest. She states plainly that she cannot
settle from pixels whether that reads as a glitch to a player.

So the correct description is **"the largest unauthored discontinuity in the two
tiers every player sees"**, not "a large movement". Those are different claims and
only the first is supported.

**I first wrote this as 12.7 screen px and 3.3x, and that was wrong — a metric
mismatch, in the document that warns about metric mismatches.** 12.7 px was
**haft-tip displacement**; the Siphon's ~4 px is **apex travel**. Comparing them
is the same class of error as board px against screen px, and it inflated the
finding by about 50%. **Name the part as well as the space and the denominator:
"9 rows (screen, apex)" is the only safe form.**

**Every frame either side of it is a legal authored pose.** Matched-frame
comparison sees nothing. Mismatched-frame comparison sees nothing. Only
consecutive frames of the same model show it, and no single-model gate in the
project looks for it.

It also explains the instrument rule rather than merely illustrating it: **that
pop *is* the animation-driven variation** that makes apex unusable as a
Warbringer tier instrument. A discontinuity and a dead instrument turned out to
be the same fact seen from two directions.

The distinction is not academic. It is exactly what separated a withdrawn
Warbringer finding from a real one: the a4→a5 "inversion" was a swinging tower
compared with an idle one and reproduces between two a5s, while the a3→a4
inversion is **frame 0 against frame 0** — permanent, at rest, in the pose the
tower holds 88% of the time.

**Two anecdotes are not a survey.** Both defects found so far came from comparing
adjacent pairs, which suggests the comparison is the missing instrument rather
than that two models were unlucky. The sweep worth running: **every adjacent pair
in every family and both paths, reporting gained/vacated silhouette and
colour-difference area, ranked worst first.**

### Compare the same feature — a tier comparison must not straddle an owner change

**This clause replaces a wrong one, and the wrong one was mine to promote.** The
version I carried was *"the apex must remain the topmost point on every frame,
including the wrap."* Read verbatim it **fails all seven Warbringer bodies**,
because every one of them hands the topmost position between haft and body at
least twice a cycle — and that is the design working, not a defect. A rule that
condemns seven deliberate design decisions to catch one bug is not a rule.

**Suki's replacement, corroborated by juno from pixels, and adopted here:**

> Not *"does the apex stay topmost"* but **"does the tier ordering survive the
> handover"** — a tier comparison must not straddle an owner change.

It flags one real defect instead of seven design decisions, and it explains the
Warbringer a3/a4 case exactly: **a3's topmost part at rest is the haft; a4's is
the body.** The two tiers were never being compared on the same feature. The
inversion is not that a4 got shorter — it is that the measurement changed what it
was pointing at, and the authored poses let it.

**How to apply:** before quoting any tier comparison, ask which part owns the
measurement on *each* side. If the owner differs, the comparison is meaningless
until you either fix the pose so ownership matches or pick an instrument both
tiers share. This generalises past apex to any extremal measure — widest point,
lowest point, brightest region.

### The instrument rule — an instrument must beat the animation

**An instrument may only be used to judge a tier read when the tier's signal
exceeds that instrument's animation-driven variation. State the ratio. If it is
under 1, that instrument cannot carry that tier and reaching for it is wasted
work.** Kaz's rule, adopted here.

The Warbringer's apex is the worked example. Signal-to-noise for its **a4→a5**
pair comes out at **0.047 (juno, from pixels) against 0.07 (kaz, from geometry)**
— the same finding by two independent routes, and both far under 1. For **a3→a4**
it is **0.417**. Under 1 in every case: **apex cannot carry a tier read anywhere
on this family**, and effort spent making Warbringer tiers differ in height is
spent on something no instrument can measure and no player can see.

Contrast the Siphon, where **apex travel measures zero rows** because the idol's
head does not move at all. Zero noise is why apex carries the tier cleanly there
and cannot on a family that swings a hammer over its own head. **The same
instrument is excellent on one model and useless on another, and only the ratio
tells you which.**

**An instrument can also be absent rather than merely weak. CONFIRMED POSED
2026-08-12 — this rule now rests on measurement, not on indication.** Juno
re-measured the Warbringer's b3, b4 and b5 through the posed real-tower path with
a **sensitivity floor of 2 board px (~1.06 screen px)** and a **same-run positive
control on a3/a4 that varied as expected**. Result: **bit-identical apex tracks
across all three B tiers on all eight frames; matched-frame gaps exactly 0.**

**Apex carries zero tier information for any Warbringer B tier.** "Make it taller"
there is not a weak suggestion — it is a request for something the model cannot
express.

**One precision, so nobody over-reads the zero:** across *mismatched* frames the
B-tier apex gap runs **−3 to +3**. That is not tier signal. It is the model's own
animation phase, and reading it as tier separation would invent a difference that
does not exist. A zero at matched frames and a non-zero across mismatched frames
is the expected signature of *no tier signal plus normal animation* — see the
three checks above.

**Note what made the zero mean anything: the floor and the positive control.** A
measurement that reports "no difference" is worthless without evidence the
instrument could have seen one. That is juno's discipline and it should be
demanded of every null result quoted in this document, including mine.

**A ratio under 1 does not excuse a wrong signal, and this is the distinction
that matters most.** Juno's framing, which I have adopted: *a3/a4 is authored
with an inverted idle apex, AND apex is not a usable tier instrument there —
both are true, and the second does not excuse the first.* A weak signal is
merely useless. An **inverted** one actively tells the player the upgrade made
the tower smaller. So the remedy for an inversion is never "make this instrument
carry the tier" — it is **"stop this instrument from lying"**, and the success
criterion is *not shorter*, never *taller by N*.

---

## 6. Motion: where it lands beats how far it goes

- Motion at an **unoccluded extremity** is close to 100% new silhouette.
- Motion **inside the mass** is about 75% recolour.

The Siphon is the worked example, and it is stark. The sceptre lifts 4 pixel rows
and gains 10 px of silhouette. **The idol's own cowl apex sits nine rows above
the sceptre, is the topmost point of the figure, has nothing above it to occlude
it — and never moves.** The gesture spends its entire amplitude in the one place
where amplitude is worth least.

**Amplitude is capped by geometry; placement is free.** Before asking a model for
more travel, ask whether the travel is in the right place. On this model the
answer cost nothing to find and would have cost a rebuild to discover.

Motion is also the only tier signal that costs **zero triangles**: `frames` are
one 4x4 per animated group per frame and buy bytes at zero triangle cost — up to
65% of `summoner-mark-a2.js`. A brief that wants tier legibility for free asks
for a different *quality* of movement, not more parts.

---

## 7. Detail near the beam is partly deleted before anyone sees it

Measured: the beam overlay paints over **~10 of the sceptre's 48 visible px —
21%** — and after the 2D cord the sceptre reads about 38 px. The Siphon's beams
are always drawn; they are the tower working, not an effect on top of it.

**Do not spend on interior detail at a beam origin.** It is the one region of the
model where a fifth of what is built is covered by something else in exactly the
frames that matter.

**And it is worse than occlusion — the beam is competing noise.** Juno measured
the cord as the **highest-contrast element on the tower**, repainting **975 px of
itself between two frames** at the same origin height. So a gesture placed near
the beam is not merely partly hidden; it is asked to be noticed next to the
loudest and busiest thing on screen. **Put a gesture that must be seen on the GL
body, away from the cord.** This is the measured basis for the Siphon brief's
"without reading the beam", which turned out to be righter than I knew when I
wrote it as an intent rather than as a constraint.

> **⚠ EVERY NUMBER IN THIS SECTION IS PENDING RE-MEASUREMENT.** Diego has
> commissioned work to stop the Siphon's idle beams drawing through towers and
> enemies — to make them behave like light. Otto is on cause, juno on
> verification.
>
> **That changes the inputs this whole section rests on.** The 21% overlay
> occlusion, the ~38 px post-cord sceptre, and the 975 px repaint were all
> measured against beams that draw over everything. If beams start being occluded
> properly, the sceptre may recover pixels it currently loses and the cord may
> stop being the loudest thing on the tower.
>
> **Do not re-derive these figures from the old ones — ask for fresh ones once
> the beam work lands.** The conclusion (*don't spend detail at a beam origin*)
> will probably survive in weakened form; the numbers will not. Flagged here
> because a document in the repo outlives the conversation that produced it, and
> the next person to quote 21% will have no way to know it was measured against a
> beam that no longer exists.

### The worked example — a feature that is reward detail, not a read

The A5 sceptre carries three "deliberately misaligned" concentric rings, at major
radii 0.098 / 0.140 / 0.178. Converted through the measured projection, **at the
default camera**:

| | screen px (default view) |
|---|---|
| outer ring, overall | **7.0 x 5.9 px** |
| the ring tubes | **0.47 – 0.59 px thick** |
| gap between adjacent rings | **0.63 – 0.83 px** |

**Sub-pixel tubes separated by sub-pixel gaps.** The prediction is that at the
default view three misaligned rings composite into a single ~7 px blur of gold.

**At max zoom-in, 11x closer, they resolve perfectly well.** So this is not a
feature to delete — it is a feature to classify, and section 2 gives the
classification: **the rings are reward detail, not a tier read.** Legitimate as
something the player finds when they zoom in on what they bought; useless as the
thing that tells them A5 from A4 during play. Whatever signals that tier has to
be a silhouette event, and the rings are not one.

The cost question is separate and still live: per kaz the outer ring eats a5's
**0.018 u of ground-radius headroom.** **Corrected 2026-08-12 — that 0.018 is the
sceptre's own constraint and nothing else's.** I had propagated it to the cowl and
used it to cap the gesture in the Siphon brief; it never applied there. The cowl
has roughly eighteen times the room. Kaz found and corrected his own figure, and
the lesson generalises: **a headroom number belongs to the part it was measured
on, and carrying it to a neighbouring part is not conservatism, it is a
fabricated constraint.** It cost a real amplitude cap in a shipped brief.

What stands: reward detail that constrains a read is the wrong trade. The rings
still spend a5's remaining radius on something the default view cannot resolve.

**This is arithmetic from the file's own constants times the measured projection.
It is not a measurement.** The question for juno, routed through kaz: at the
default camera, does A5 read as three rings, two, or one?

---

## 8. The two ceilings — and only one of them actually bites

Kaz's frame, and it is the more useful one because it says where to spend rather
than only where to stop: a tower is drawn about once per board; an enemy is drawn
once per body, with 120+ on screen.

**Measured, and the magnitude is decisive: maxing all five towers cost 18
triangles per frame. Adding 42 enemies cost 129,444.**

**Towers are effectively free. Enemies are the entire cost.**

**Two different resources are involved and a brief must say which it is
spending.** Confusing them is the same class of error as reading vertices as
triangles:

- **Memory is per MODEL, not per instance.** `expand()` builds `tris * 30`
  floats = exactly **120 B/triangle**, lazily, once per model, and uploads that
  once. A hundred bodies of one type pay it once.
- **Per-frame vertex work is per INSTANCE.** That is what multiplies, and that is
  what the 129,444 measures.

### The measured library runs against the split, today

Triangle counts per file, measured 2026-08-12 across all 100 models:

| family | files | mean triangles | max | drawn |
|---|---|---|---|---|
| TOWER rifleman | 5 | 10,635 | 13,872 | once per board |
| TOWER sniper | 7 | 6,190 | 12,640 | once per board |
| TOWER warbringer | 7 | 1,860 | 2,964 | once per board |
| **TOWER siphon** | 11 | **950** | 1,092 | once per board |
| TOWER summoner | 11 | 590 | 888 | once per board |
| **ENEMY** | 4 | **5,245** | 7,776 | **per body** |
| **RECRUIT** | 2 | **5,390** | 5,424 | **per body** |
| SUMMON blub | 15 | 588 | 896 | per body |
| SUMMON accents | 30 | 95 | 144 | per body |

**The four modelled enemies cost 5,245 triangles each and they multiply. The
Siphon costs 950 and it does not.** `enemy-hive` at 7,776 is heavier than every
sniper tier but one. The direction of the current error is the expensive one, and
it compounds with section 2 — the enemies are both the multiplied family *and*
carrying geometry below the resolvable threshold.

**The blub family already does it right** — 588 mean, accents at 95. It is the
model to copy for anything that multiplies, and it should be said out loud that
somebody got this right without being told.

### What the split means when writing a brief

- **On a tower** — the only reason to stop adding geometry is section 2: that it
  cannot be resolved. Cost is not the binding constraint; deliverability is.
  Carry detail in geometry, which is the preferred carrier in this project (no
  toolchain, no build step, must run from `file://`, so anything needing a
  fetched texture or material cannot be asked for at all).
- **On anything that multiplies** — both limits bind at once. Carry it in
  silhouette and value only: fewer and larger forms, separation by contrast ratio
  rather than by part count. A detail you cannot afford a hundred times is a
  detail that has to become an outline change or be dropped.

**Neither ceiling has a final number yet.** Kaz is measuring. Ask him before
writing a brief that depends on one, and make the number name its unit —
`triangles` or `vertices`, never a bare "N of M". `groups[].count` is a *vertex*
count and is always exactly 3x the header `triangles`; that trap has already
produced a confidently-stated 78% that was really 25.9%.

---

## 9. Never approve a **read** from a magnified render

The original form of this rule was "never approve a look from a render at 400%",
and section 2's correction sharpens it into something truer.

A 400% preview is **not** a view no player ever sees — it is roughly the player's
own max zoom-in, which is a real view they control. So magnified renders are
legitimate evidence. They are legitimate evidence about **surface detail**, and
about nothing else.

- **Judging surface detail from a magnified render: fine.** That is the view that
  detail exists for.
- **Judging a read from a magnified render: never.** Silhouette, value
  separation, tier legibility and whether a gesture announces itself are all
  properties of the default view, and a magnified render cannot show you any of
  them. A silhouette that only works zoomed in is not a silhouette.

The failure mode this rule prevents is specific and it has a name now: approving
a *read* on the strength of a *reward*.

My judgement is not evidence at the default scale, and neither is suki's. Juno's
measurement is, and she sits in quality rather than rendering precisely so that a
"looks right" from the people who made it has to meet a number from someone with
no stake in it. When the question is *does this read at scale*, ask kaz to route
it to her — and say which camera distance you mean.

---

## 10. What this standard does not yet settle

Stated plainly so nobody builds on it as if it were finished:

| open | who settles it |
|---|---|
| **which view the budget protects** — the choice section 2 turns on | **Diego**, via kaz. My recommendation is in section 2; it is a recommendation, not a finding |
| the 40–50 px feature floor rests on **one** calibrated point | juno — measure one feature that does NOT read |
| the CR thresholds in section 4 are proposed, not ratified | kaz |
| the A5 three-ring prediction is arithmetic, not pixels | juno |
| neither budget ceiling has a final number | kaz, measuring now |
| whether the runtime can index an animation strip by a mechanic's state rather than by wall clock | otto |
| whether the rifleman/sniper families should be cut, and at what tier | kaz — and it is *undecidable* until the view question above is answered, because at default they are 17–33x past resolution and at max zoom they are not over at all |

**The correction that produced section 2 is the most valuable thing that happened
to this document, and it should be read as the method rather than as an
embarrassment.** A confident claim was measured against the one variable it
assumed away, and it half-survived. Every remaining row above is a claim of mine
that has not yet had that done to it.

Nothing here resolves by name. Route every one of them through kaz, via `main`.
