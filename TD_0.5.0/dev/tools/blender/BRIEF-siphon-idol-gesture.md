# The Siphon idol — the channelling gesture

**Brief for the A3/A4/A5 arm rework, written 2026-08-12 by mira, before any
geometry is touched.** Written against `HOUSE-STANDARD.md` and the contract in
`AGENTS.md` → *Building a model that looks like the ones that already work*.
Reviewed by kaz before it becomes work; built by suki; measured by juno.

Moved here from agent memory on 2026-08-12 by petra (archivist), unchanged
apart from this paragraph and the last row of the closing table. See
`HOUSE-STANDARD.md` beside it.

The occasion: Diego has authorised reworking the arm for more movement. Juno's
verdict on the current gesture was **"it reads; it does not announce itself."**
This brief says what the gesture is for, so that the rework aims at an intent
rather than at a number.

---

## What the tower actually does, because the gesture has to sell it

$800. A **continuous beam**, 10 damage ticks per second, one target, 75 u.l.

Path A is not a damage path. It is an **extraction loop**, and every tier is
another turn of it:

| | mechanic | what it means |
|---|---|---|
| A1 | `ramp_per_target` 0.15/s, cap **2.0x**, +25% defence pierce | damage **rises the longer the beam stays on one body** |
| A2 | +1 AD, +25 range | — |
| A3 | `charge_to_gold` | sustained damage becomes **gold**; charges decay 1 per 3 s out of combat |
| A4 | ramp raised to 0.20/s, cap **2.5x**; sees flying; `hp_scaling` | it takes harder, and faster |
| A5 | `gold_to_power` | the gold comes back **as power** |

Read the column again: **every path-A mechanic pays for not letting go.** The
tower does not burst, does not reload, does not choose. It attaches, it keeps
taking, what it takes becomes money, and the money becomes more taking. It is
the only tower on the board whose damage is a function of *duration*.

Path B — Transfusion — is the opposite disposition: more targets, slow,
lifesteal, death denial. It takes in order to give back.

**In the Warbringer document's one line:**

> The Warbringer is one enormous blow. **The Siphon never lets go.**
> Path A hoards. Path B transfuses.

---

## THE INTENT — what the gesture must communicate

**A player must be able to tell a Siphon that is channelling from a Siphon that
is idle, across the board, in motion, without reading the beam.**

That is the whole brief in one sentence, and the phrase *without reading the
beam* is the load-bearing part. The beam is always drawn and it is the loudest
thing on the tower — so today the beam is doing all the communicating and the
model is decoration on top of it. The gesture's job is not to duplicate "on".

The gesture must say what the beam cannot: **that this is a hold, and the hold is
costing him.** Not a pull — a pull ends. Not a strike. The verb is **draw**, as
in drawing something out of a body: continuous, one-way, and the return is
reluctance rather than recoil.

### What is already correct, and must not be touched

The generator got the **rhythm** right and it is the single best thing about the
current animation. Reach 0.30 / hold 0.34 / **settle 0.36** — the return is the
slowest leg of the cycle. At the runtime's 2.38 s period: 0.71 s out, 0.81 s
held, 0.86 s back.

**That asymmetry is what separates a hand drawn slowly back from a recoil, and it
is the correct reading of this tower.** Do not change the leg fractions, the
`_smooth` C1 joins, the 24-frame count, or the periodic wrap. The rework is an
amplitude-and-placement change, not a timing change.

### What is wrong

Not the size of the movement. **The place it lands.**

Measured by juno, rest to hold: 134 px of 462 change — but only **10 px of new
silhouette**, 25 vacated, and **99 recoloured (74%)**. The sceptre lifts 4 pixel
rows *inside the figure's existing envelope*.

Meanwhile **the cowl apex — the topmost point of the whole figure, at row 325,
nine rows above the sceptre, with nothing above it to occlude it — never moves.**

The gesture spends its entire amplitude in the one place where amplitude is worth
least, and leaves frozen the one place where any amplitude at all would be
100% new silhouette.

---

## THE SILHOUETTE — what the gesture must look like as a black cutout

Three components. They are one gesture and must peak together, not in sequence.

### 1. THE BOW — the primary component, and where the effort goes

**The cowl tips forward and down along the OPEN bearing (67°), the side the hands
and the ring already work on.** He leans into what he is draining.

As a cutout: at rest the apex is a point at the top of a narrow mass over a wide
asymmetric skirt. At the hold **the top of the silhouette is a different shape,
not a lower one** — the apex has moved forward and down, gaining outline on the
open side and vacating it on the trailing side.

Hard constraints on the shape, and these are what make two builders agree:

- **The cowl must keep ownership of the topmost pixel for the whole cycle — on
  THIS model, for a reason specific to it.** The cowl apex sits nine rows above
  the sceptre and the gesture is only three or four pixels, so nothing here
  should ever come close to taking the top. If something does, the amplitude has
  gone somewhere unintended.

  **This is a Siphon constraint, not a general law, and I originally wrote it as
  one.** The general version — *"the apex must remain topmost on every frame"* —
  **fails all seven Warbringer bodies**, each of which hands the topmost position
  between haft and body twice a cycle by design. Suki's corrected general rule is
  in the standard: *a tier comparison must not straddle an owner change.* Handover
  is fine; **comparing across one is not.** It holds here because the Siphon's
  ownership never changes, which makes its apex a clean instrument — and the
  measured reason apex works on this family and not on the Warbringer.
- **The displacement must be diagonal, not vertical.** A purely downward apex
  reads as the figure shrinking. Forward-and-down reads as leaning.
- **The bow deepens the existing 8° forward torso tilt rather than opposing it.**
  The figure is already authored as leaning forward in tension; this is more of
  what it already is.

**Proportion:** apex travel of about **one tenth of the figure height** — roughly
3 screen px on a 29.5 px figure — which is a rotation in the region of **10–20°**
about the shoulder line (SH_L z 1.300, SH_R z 1.240; apex z 1.790, so a lever of
about 0.52 u).

**Measured 2026-08-12: 10–20° fits at every tier.** Kaz reports the cowl's actual
rotational headroom as **54.5° at a3, 38.75° at a4, 28.0° at a5** — see the
constraint section below for the correction that unblocked this.

### The one hard constraint on the bow: a 3 px apex-drop budget

**A bow that lowers a5's apex by more than 3 screen px erases "a5 is taller".**
The a4/a5 tier tell is only 3 rows deep, and the bow carries the apex forward
*and down*. Everything under 3 px of drop is free; past it the gesture starts
eating a tier read to buy a channelling read, which is a bad trade in a game
where tier legibility is already the weakest thing on the board.

Suki's worst-bearing figure is **0.71 px**, so there is comfortable room. This is
the number to check when the amplitude is finally chosen — not the radius, which
was never the constraint.

### The gate I proposed, and why it is withdrawn

**I wrote: "at least 25 px of gained silhouette, of which at least half falls in
the top third of the figure." That number was mine and it was wrong twice over.
Do not design to it.** Kaz has generously described it as his amendment; it is in
my brief in my words and I am recording it as mine, because a gate that shapes
what suki builds has to have an accurate author.

Juno measured it:

- **Unreachable.** Gained silhouette peaks at **21 px against a 25 px bar** across
  the entire usable lean range — short by roughly 2x, so the gesture could never
  have passed however well it was built.
- **The second clause is anti-correlated with the first.** Top-third gained falls
  from **6 px at 10° to 0 px at 25°**, because the third was pinned to the rest
  bounding box and the bow carries the apex forward and *down*, out of it. A gate
  whose second clause is maximised by doing **less** of the thing it rewards is a
  broken instrument, and it would have taught suki to build a smaller gesture
  than the brief asks for.

**No replacement number until someone measures the actual arm-and-cowl
mechanism.** Juno's test was a whole-body lean proxy and she flagged that herself,
unprompted. Inventing a second threshold before measuring the real thing is
exactly how the 4.0 px travel gate happened, and this brief is not going to
produce a third one.

**Until then the gesture is judged by the intent statement above, not by a
number** — and the honest reading of the 21 px ceiling is that *the bow alone may
not be enough*, which is an argument for keeping all three components rather than
for making the bow bigger.

### 2. THE SCEPTRE — unchanged, and demoted

**Keep `SCEPTRE_LIFT` at 0.230. Do not chase the 4.0 px gate.**

It is already measured and already priced: band one ends at lift 0.242092 giving
3.9921 px; 4.0 px needs 0.242571; `MIN_TRAVEL_PX = 4.0` and `REACH_MARGIN =
0.020` are mutually exclusive for the head by **0.000479 blender units**. Band
two would buy 6.60 px but every cycle would cross the dead zone where `_elbow`
exits. And the last 0.199 px of band one costs the **entire** remaining clearance
margin, on a pair already sitting at 0.0244.

**Spending days to buy 0.2 px nobody can resolve, at the price of all the
clearance, is the trade this brief exists to stop.** The sceptre keeps its lift,
keeps its timing, and becomes the supporting half of a gesture whose primary
component is now the bow.

One free amplification nobody has counted: post-fix, the ring is carried by
`hand_l`, so **the beam's own origin rises 0.230 u with the gesture**. The beam
is the highest-contrast element on the tower. Juno measured the figure mask, so
the beam root's travel is not in the 134 px. *Question for juno via kaz: how much
does the moving beam root add?* If it is substantial, the gesture is already
louder than 10 px suggests and the bow can be smaller.

### 3. THE TRAIN — the late answer, and the first thing to drop

The trailing hem is the widest thing on the model — **0.660 u from the axis
against the open side's 0.350**, which is 13.0 px against 6.9 px, a ground width
of about 19.9 px inside a 22 px box. It is cloth, and cloth answers late.

The train settles a beat behind the torso, in the idiom `OPEN_LAG = 0.06` already
establishes for the hands. Small amplitude.

**This is the component to drop first** if clearance, budget or build time bites.
It is a refinement of a gesture that works without it.

---

## HOW IT READS AT GAME SCALE

**This whole brief protects the DEFAULT camera** — 22 x 35 px (screen), the view
the game is actually played in. Nothing in it is a claim about how the model
looks at max zoom-in, and nothing in it may be approved from a magnified render.
See section 2 and section 9 of the standard for why that qualifier now has to be
written on every rule.

At 22 x 35 px (screen), across the board, in motion, a player must be able to
tell apart — in this order of importance:

1. **Channelling from idle**, without reading the beam. That is the intent above
   and it is the only one this rework changes.
2. **Which tower it is.** The Siphon's identity at this size is a *tall narrow
   mass over a wide asymmetric skirt* — 13.0 px of hem on one side against 6.9 px
   on the other. **Nothing added at the base may make the ground plan
   symmetric.** That asymmetry is the read, and it is already protected by the
   generator's no-surface-of-revolution rule; the bow must not undo it by
   swinging the mass onto the axis.
3. **Path A from path B.** The sceptre. A has it from A3; B never does.
4. **Tier.** Section 5 of the standard — silhouette events, not size.

---

## HOW THE TIERS DIFFER AT A GLANCE

**The gesture keeps the same peak displacement at every tier. What changes is how
much life is in it.** This costs zero triangles, follows the model's own authored
arc, and is legible in motion in a way a material change at CR 1.02 is not.

| tier | the arc says | the gesture |
|---|---|---|
| **A3** | forearms gold to the elbow; the sceptre appears; still a man | full **follow-through**: the train answers late, the bow overshoots slightly and settles |
| **A4** | *"the cloth stops falling: no fray left, the creases are cut deeper and hold. Statuary drapery."* | **half** the lag and half the overshoot. The cloth has stopped being cloth |
| **A5** | complete idol. No skin, no identifiable cloth. The drapery is sculpture | **no secondary motion at all.** Same distance, same timing, moved as one rigid piece. No lag, no overshoot, no settle wobble |

**A5's gesture is the same gesture with the life taken out of it.** He does not
move less; he moves like a mechanism. That is petrifaction stated in motion, at
no cost, and it is the same shape of answer as `sniper-a4` — a tier that reads
differently because of what was **removed**.

**The risk, named honestly:** A5 could read as *doing less* at the tier where the
tower is strongest. The mitigation is that A5's peak displacement is unchanged —
what it loses is softness, not size — and its loudness comes from silhouette it
already has: the spire, the plinth, the frozen pour.

**CORRECTED 2026-08-12 — I claimed this agreed with the model's tightest
constraint, and it did not, because the constraint was not on this part.**

What I wrote: that A5 has only 0.018 u of ground-radius headroom, is therefore
the tier least able to afford a forward lean, and that intent and constraint
pointed the same way. Kaz found the error in his own figure: **the 0.018 u is
`ring_2`'s headroom — the sceptre's — and it never applied to the cowl at all.
The cowl has roughly eighteen times the room: 54.5° at a3, 38.75° at a4, 28.0° at
a5.**

**So the tier plan stands on its own merits and gets no support from geometry.**
A5 moves rigidly because it is an idol, not because it cannot move. That is a
weaker argument than the one I made and it is the true one. The reason to keep
the plan is the authored arc and `sniper-a4`'s precedent, and if kaz or suki
think that is not enough, the plan should be argued on those grounds rather than
propped up by a constraint that was never there.

**The lesson, and it is mine to carry: a headroom number belongs to the part it
was measured on.** I took a figure measured on the sceptre and applied it to the
cowl. That is not conservatism — it fabricates a constraint, and this one capped
the amplitude of the gesture the brief exists to enlarge.

**One genuine agreement survives, and it inverts what I feared.** Kaz withdraws
the collision he had raised as blocking: separation goes from **30 px at rest to
76 px through the hold**, so a channelling a5 is **two and a half times more
distinguishable**, not less. The gesture improves the tier read rather than
threatening it.

---

## WHAT MAY BE DROPPED

Named explicitly, because a brief that asks for everything has set no priority.

**Spend on:**
- the cowl apex. It is the topmost pixel of the figure, unoccluded, against empty
  board, and currently frozen. Everything else in this brief is secondary to it.

**Stop spending on:**
- **the 4.0 px sceptre gate.** Capped by the reach window; the last fraction costs
  all the clearance. See component 2.
- **A5's third ring as a *tier signal*.** Sub-pixel tubes separated by sub-pixel
  gaps at the default camera — see section 7 of the standard. It resolves at max
  zoom, so it is legitimate **reward** detail and should not be deleted on sight;
  it simply cannot be the thing that tells A5 from A4 during play, and it must
  not go on eating a5's ground-radius headroom in order to fail at that job.
- **A1 and A2 as legible tier events.** CR 1.30 lit, **1.02 in shadow**, on parts
  a few pixels across. They cannot read and no modelling will make them.

**Drop first if anything bites:**
- the train's late answer (component 3), at A3 and A4. A4 and A5 barely have it
  by design anyway.

---

## BUDGET

**Written so a number can be dropped in when kaz's measurement lands.**

**As specified, this brief asks for zero additional triangles.** It is a rig and
animation change: a cowl group keyed on an empty, per clause 3 of the contract —
geometry ships once in the empty's local space, and a frame is one 4x4 per group.
Per the census, `frames` cost bytes at **zero triangle cost**. One new animated
group across 25 frames is 25 x 16 floats — about 1.6 KB, and nothing at all
against either ceiling.

**The renderer sets no ceiling — render is not the bottleneck by about 7x.** But
that was only ever half the answer, and kaz has supplied the other half:

**`siphon_idol.py` enforces its own gate — `700 <= triangles <= 1100`, at line
2512 — and `siphon-a5` sits at 1,092. Eight triangles of room.**

That is the real constraint on this brief and it is nothing like "no ceiling".
Anything that adds geometry to a5 fails the build immediately. The gate holds
unless a build demonstrates the crest actually facets, in which case kaz will
authorise a measured increase.

**So the zero-triangle framing above is not a nicety, it is the only version of
this brief that can be built today.** If the bow needs the cowl re-lofted with
more angular samples, that is a gate conversation with kaz *before* suki starts,
not a discovery at export.

For context, unchanged: the Siphon family mean is **950** triangles against a
library mean of 1,773 and a rifleman mean of 10,635, and `siphon-base` runs at
**2.04 triangles per covered pixel at the default camera** (0.02 at max zoom-in)
against `rifleman-base` at 33.42. The Siphon is one of the two families already
sized close to the display at the view the game is played in.

**The general lesson, which is kaz's and worth more than the number: "no ceiling"
was true of the renderer and false of the generator.** Ask both. A model can be
free to draw and still be forbidden to build.

---

## THE ONE THING THIS BRIEF CANNOT DELIVER ALONE

The intent I actually want is stronger than the one above: **the gesture should
say how long the beam has been on.** `ramp_per_target` is the entire path-A
damage model — 0.15/s to 2.0x, 0.20/s to 2.5x at A4 — and **nothing on screen
expresses it.** A player cannot tell a Siphon that just latched from one eight
seconds into a 2.5x ramp. The tower's defining mechanic is invisible.

The animation strip cannot express it as built: `gl-world.js` indexes it with a
free-running wall clock, `sphase = (now * 0.42) % 1`, which knows nothing about
the ramp.

**ANSWERED 2026-08-12 by otto, and the answer is better than the question.**

Direct indexing **cannot** work, and the reason is the thing I praised about the
strip: it is a genuinely seamless loop, so a full ramp lands on the same pose as
just-latched. Driving the phase from the ramp would destroy the exact distinction
the gesture exists to create. My proposal would have quietly deleted its own
purpose.

**The answer is band selection with the clock still running the phase** — the
house idiom already, per the Summoner, which takes its band from blub count and
its phase from the clock.

**Kaz has asked for that second brief and it is written — `BRIEF-siphon-ramp-bands.md`,
held in mira's memory pending petra's call on whether it ships here.**

**Read it before building this one.** It rules that the ramp takes follow-through
and that **the tier-differentiation table below gives it up** — they cannot both
have that channel, and they collide worst at A5, which under the tier plan has no
follow-through to spend and is the tier where the ramp matters most. The tier
plan keeps its silhouette events; it loses the follow-through decay. Kaz's to
confirm.

I am raising it rather than designing around it because a model being asked to
carry a meaning the runtime does not supply is exactly the gap this role exists
to close, and it is cheaper to ask now than to rebuild later.

---

## OPEN QUESTIONS, WITH OWNERS

All route through kaz; nothing resolves by name.

| question | owner | status |
|---|---|---|
| Measure gained silhouette on the **real arm-and-cowl mechanism**, not a whole-body lean proxy | juno | **the one open blocker.** No gate number can be set until this exists |
| Does A5 read as three rings, two, or one? | juno | open |
| Does the moving beam root add visible travel the 134 px did not count? | juno | open — and now lower priority: the cord is competing noise, so beam-adjacent motion is the wrong place to look for a read |
| Will the crest facet under rotation, and does that need geometry a5 has no room for? | suki, then kaz | open — 8 triangles of headroom |
| ~~Gained-silhouette gate ≥25 px, half in top third~~ | mira | **WITHDRAWN — mine, and wrong twice over. See the section above.** |
| ~~Can a forward cowl lean fit A5's 0.018 u of radius headroom?~~ | suki | **Void — the 0.018 was the sceptre's. Cowl has 28.0–54.5°.** |
| ~~Can the strip be indexed by ramp state?~~ | otto | **Answered: no, and banding is better. See `BRIEF-siphon-ramp-bands.md`.** |
| ~~Does this document belong in the repo beside `WARBRINGER_CONCEPT.md`?~~ | petra | **Answered: yes — it is here now.** |
