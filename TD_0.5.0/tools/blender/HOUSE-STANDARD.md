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

At the default camera a whole A4 Siphon occupies **22 x 35 px (screen)**.

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

**That is the shape of a good answer to any brief in this project** — and note
that it is view-independent: a removal that changes the outline reads at the
default view *and* at max zoom. A tier that reads differently because something
was removed beats a tier that reads differently because something was added.
Look for the removal first. The Siphon brief's A5 is built on this: same gesture,
with the life taken out of it.

### The worked example: sniper-a4, which is cheaper *and* more distinct

`sniper-a4` is the **cheapest** sniper tier at 2,416 triangles, and that is
deliberate. The tier **removes the legs** and sockets the body into a gimbal yoke
with a mounted rail cannon. It paints **6,977 pixels no other tier covers**, in
gold and emissive.

Cheaper, and more distinct, because of what it takes away.

**That is the shape of a good answer to any brief in this project.** A tier that
reads differently because something was removed beats a tier that reads
differently because something was added — it costs less, it resolves better, and
subtraction is legible at a glance in a way that added parts at 0.5 px are not.
Look for the removal first. The Siphon brief's A5 is built on this: same
gesture, with the life taken out of it.

---

## 3. A feature needs roughly 40–50 px to be a feature

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

**Proposed thresholds — kaz's to ratify, not mine to impose:**

| CR between two adjacent parts | what happens at this size |
|---|---|
| **under 1.25** | they are the same value. They merge into one shape. |
| **1.25 – 1.6** | separates only across a long, roughly straight boundary |
| **over 2.0** | reads as two things anywhere, including across a jagged 3 px edge |

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

**Consequence, and it is a hard one: A1 and A2 cannot be legible tier purchases
at game scale, and no amount of modelling will make them so.** They are hue
changes at constant value on small parts. Anyone briefing a tier ladder should
plan around that rather than discover it after a build. See section 5.

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

The cost question is separate and still live: per kaz the outer ring eats all of
a5's 0.018 u of ground-radius headroom, which constrains the gesture in the brief.
Reward detail that constrains a read is the wrong trade in either direction.

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
