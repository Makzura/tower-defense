# BRIEF 1 — the Hedger tripod: the part inventory

mira, art direction (models), 2026-08-13. For kaz; built by suki.
Companion document: `BRIEF-hedger-tripod-gesture.md` — the attack.

Diego approved candidate B, the Tripod: *"The tripod design looks good — the
attack animation needs to fit with the model tho, since it attacks."*

**The gate this document is written to is hugo's, and it is the gate the shipped
Hedger failed in writing: if the card cannot say what a part is FOR, it is
decoration.** Every row below carries a FOR. The parts that could not earn one
are listed at the end, with what they would have to earn to come back.

**Second gate: this body is described with no reference to any other body on the
road.** The word "Gleaner" does not appear below this line.

---

## 0. What this machine is, in four sentences

A sealed drum carried at hip height on three legs. One tool is bolted to the
drum's forward rim and works out in front of the machine at a fixed reach. What
the machine carries is slung underneath, in the space three legs leave and two
do not. It is the only frame the intelligence ever armed, and it was armed by
taking the room the cargo used to have.

**Identity, carried through to every part:** this is the one ordinary frame that
met resistance and was rebuilt to answer it. **The tool is primary structure —
the machine is arranged around it. The cargo hardware is what got displaced to
make room.** No part below is allowed to contradict that ordering, and one part
(the hold) exists specifically to show it.

**hugo's ruling, 2026-08-13, and it is UNRATIFIED — Diego has not seen it:** the
machine does not think it is fighting. It thinks it is **clearing the verge** — a
tower is growth that has come up across the route, and it is cutting it back so
the road stays walkable. There is no category called *enemy* in the intelligence;
when something stood in the road it reached for the classification it already
had — *obstruction* — and armed one frame with the tool you use on obstructions.
Not an escalation. A maintenance vehicle. **Nobody cuts a mesh on this as
settled**, but every FOR below is consistent with it and none of them depends on
it.

---

## 1. The plan numbers this inventory must reproduce

Diego approved a picture, and a picture is a measurement here. The inventory is
not free to drift off it.

| | W x H (screen px) | top-25% fill | mass height | plan radius |
|---|---|---|---|---|
| **what Diego approved** | 17.2 x 26.4 | **0.77** | 55.8% | 0.521 u |
| **this inventory, built** | 17.3 x 26.6 | **0.72** | 55.1% | 0.522 u |
| bodies that PASS | — | 0.65–0.77 | ~50–56% | — |
| bodies Diego rejected or that fail the same way | — | 0.45–0.47 | ~48–51% | — |

Screen px at the game's fitted default camera, mean over 12 gait frames x 8
bearings, at the runtime's own sizeScale 1.25. Plan radius is the envelope across
all frames, not the rest pose.

**The 0.77 → 0.72 is one part and I have isolated it: the bill head.** Not the
leg re-arrangement (0.01), not the frame count (0.00), not the hub or the core or
the hold (0.00 each). It is arithmetic rather than a plan regression — the head
widens the single widest *row*, which is this metric's denominator, without
widening the top quarter's mean. **It is still a real 0.05 and it is a call I
made, not a rounding error: the head is kept and section 3 says what it buys.**
0.72 sits inside the pass band and is 0.25 clear of every body that failed.

Plan radius 0.522 u against the frost-ring budget of 0.8930 u at this sizeScale —
**margin 0.371 u.** This is the most compact body of the four candidates and
tighter in plan than the machine it replaces, because there is no swinging arm.

---

## 2. Proportions are stated as fractions of the figure

**F = the standing height of the machine, drum top to road = 0.920 u.** Every
proportion below is a fraction of F and survives a scale change; the u figures
are given only so suki has a starting geometry that is known to measure right.

---

## 3. The inventory

### The stance

**`leg_a`, `leg_b`, `leg_c` — three identical legs at 120°.**
Thigh 0.39F long x 0.087F square, from the hub down and outward. Shin 0.35F x
0.082F. Foot pad 0.16F x 0.16F x 0.065F, flat, at radius 0.27F from the axis.

> **FOR: it stands still and takes load through the tool.** Two legs have to be
> balanced continuously; three are statically determinate, so this frame can
> push forward against something without walking into it. That is not a styling
> choice — it is the mechanic restated as a body plan.

**Their arrangement is specified and it is not free: TWO LEAD, ONE TRAILS.** Legs
at ±60° off the heading and one at 180°. Two reasons, both load-bearing:

- The stroke comes down **between the two leading legs, into a clear gap.** With
  one leg leading it comes down onto its own leg. Checked: at full stroke the
  bill's nearest approach to a leading leg is 0.18 u in x and the legs are offset
  ±0.113 u in y — clear on both axes at every stroke angle.
- **The trailing leg is the prop.** It is what stops the frame pitching forward
  onto its work, which is the only reason a machine that pushes needs a third.

At the dominant bearing (yaw 0, 25 of 42 road segments) the two leading legs sit
at the same screen x and separate by **4.7 px in screen y** — they read as one
foot nearer and one further, which is what makes three legs legible from the
side at all. Do not narrow that spread to tidy the outline.

**`hub` — a short cylinder, r 0.17F x 0.15F tall, centred 0.67F up.**

> **FOR: the joint the three legs meet in and the seat the drum sits on.**
> Without it there is no shared member and the machine is three sticks holding a
> barrel.

### The mass

**`drum` — a sealed cylinder, r 0.24F, 0.26F tall, centred 0.87F up.**

> **FOR: the machine's whole working volume and all of its mass.** And **the
> reason it is ROUND is the tool**: the tool is mounted on its rim, so a round
> hub is a hub whose outline does not change shape as anything turns on it. A
> square body would flicker in outline for the same motion.

The drum is also the part that sets `model.top`, and therefore where the health
bar hangs. See the gesture brief, section 4j — this is load-bearing and it is why
nothing may be stacked on top of the drum.

**`rim_band` — a raised ring at the drum's waist, r 0.255F, 0.054F tall.**

> **FOR: the mounting ring the tool bolts through**, so the tool's load goes into
> the drum's shell the whole way round rather than into one plate. It is the
> reason the tool can sit anywhere on the rim, and the reason this frame could be
> converted at all rather than rebuilt.

### The tool — the reason this machine exists

**`bill` — a square bar on the forward rim.** 0.35F long x 0.076F x 0.065F,
running from the rim out to **0.57F forward of the axis**, at drum-centre height
and horizontal at rest.

> **FOR: it is the tool. It is what the frame was rebuilt around.** Below boss
> tier this is the only armed thing in the game, and this bar is the arming.

**Horizontal at rest is a specification, not a default.** It is the pose Diego
approved, it is the pose the model is previewed and health-barred in, and it is
what makes the strike a pure downward event with nothing to trade. See the
gesture brief, section 4j.

**`bill_head` — 0.098F x 0.11F x 0.11F, FLUSH with the bar's tip** (centred at
0.52F forward, ending exactly where the bar ends).

> **FOR: the working end — the part that actually meets the growth.**

**Flush, not proud, and that word is doing work.** Proud (overhanging the bar's
end by 0.025 u) measures 17.6 x 26.7 px and plan radius 0.547; flush measures
17.3 x 26.6 and plan radius **0.522, which is the approved figure to 0.001**.
Same head, same read, and flush gives the approved plan back for free.

Measured, so the hugo gate is answered with a number rather than an assertion:
the head is **+6 lit px at yaw 0, 2.3% of the figure**, and it takes the tip from
**1.2 to 2.1 screen px thick.** That is under the ~11% floor for a feature that
must read *on its own* — and it is not one. It is the terminal lump on a part
that already reads, at the most unoccluded point on the machine, and **it is the
point the eye tracks through the whole attack stroke** (the tip travels 6.3
screen px). This is the same argument the shipped body's step plate won on, and
the same measurement: a bar of this width without a lump on the end
anti-aliases into a line.

**It costs 0.04–0.05 of top-quarter fill and it is kept. That is my call and it
is reviewable.**

**`core` — a port on the drum's forward face, under the bill mount. 0.054F x
0.098F x 0.098F. Material `core_red`.**

> **FOR: it is the battery. It is the power the tool draws, and it is mounted on
> the tool's side because it feeds it.**

**Name it correctly in every downstream document: `core_red` is a BATTERY —
machine power.** Diego, 2026-08-13: *"Enemies do not have mana yet — they don't
have flesh, so no mana. The red my predecessor put was just there for looks, but
we can say it's the battery."* Not mana, not arcane, not corrupted energy. Do not
let those words back in.

Flagged honestly: at **2.2 x 2.2 screen px** and contrast ratio 1.72 against the
tin it sits on, this is **a reward for a player who zooms, not a read at game
scale.** It is first on the drop list in section 5.

(Separately, and not this body's business: `ley` on other models is the enemy's
*shield* and is correct. Colour is an application, never an allegiance — there is
no enemy palette to enforce and nothing to clean up.)

### The displaced part

**`hold` — a small cage slung UNDER the drum, between the legs.** 0.22F x 0.24F x
0.17F, centred 0.63F up, with two bar plates.

> **FOR: it still carries.** This frame was rebuilt for the tool, and the cargo
> went where there was room left over — underneath, in the space three legs leave
> and two do not. **It is the part that shows the ordering: the tool took the
> front of the machine and the cargo went under it.**

Explicitly demoted: it is inside the silhouette at every bearing, so it is
fiction rather than signal, and it is **not counted as one of this body's reads.**

**IT MUST NOT GO ON THE REAR RIM, and this is the one place in the inventory
where a placement is a hard constraint rather than a preference.** A rear-rim
hold is a tempting design — it balances the tool, it gives the plan a front and a
back, and it measures marginally *better* on top-quarter fill (0.72 vs 0.71).
**Measured, it raises the strike's highest point by 6.6 board px of the health
bar's 10 board px of pad, against 4.1 board px slung under.** It rides up as the
tool comes down, and it eats two thirds of the clearance the health bar has. The
gesture brief section 5 has the full derivation. **Slung under, and the reason is
written down so nobody moves it back.**

---

## 4. What is NOT on this machine, and why — the same gate, applied to absence

A brief that only lists what to build has not applied the gate.

- **No head, no lens, no eye.** The machine does not turn to what it cuts (see
  the gesture brief, section 4 — the aim was measured and rejected). **A sensor
  that steers nothing is decoration.** To come back it would have to steer
  something visible, and nothing on this body turns.
- **No arms.** There is nothing to hold. The tool is bolted to the rim and the
  cargo is a cage, not a grip.
- **No antenna, no crown.** Nothing above the drum, ever. The drum sets
  `model.top`; anything stacked on it moves the health bar for every body on the
  board and buys nothing at 17 px wide.
- **No shield hardware.** `chassis.shield_projectors()` is switched off before
  export in every shipped body and there is no `shield_` group in any of them.
  Authoring it here would export nothing.
- **No lettering, stencil, hull number or decal of any kind.** There is no
  texture path in this engine at all — `td_scene.material` takes a colour key and
  an emission value, and there are no UVs. A letter on this body is under a
  pixel. It is geometry or it is nothing.
- **No emissive glow used as an argument.** Emission is inert on every ground
  enemy: nothing drives the uniform. The palette's fourth component is real and
  unreached. Separation on this body is earned from silhouette or not at all.

---

## 5. What may be dropped, in order — and what may not

**A brief that asks for everything has set no priority, so the priority gets set
by whoever exports it.** This is the order.

**Drop first, and losing it costs nothing at game scale:**

1. **`core`** — 2.2 x 2.2 screen px, contrast 1.72 against its own neighbour. A
   reward for a zoomed player, not a read. If the triangle budget bites, this
   goes before anything else.
2. **`rim_band`** — roughly 1 px of internal edge; it is fiction about how the
   tool is mounted, and the mounting reads from the tool's position without it.
3. **`hold` bar plates** — the two cage bars. Interior at every bearing.

**Never dropped, and if the budget cannot hold these the budget is wrong for
this body:**

- **`bill_head`.** It is the point the eye tracks through the entire attack. Cut
  it and the gesture is a line rotating.
- **The drum's roundness.** Twelve segments minimum. It is what keeps the
  outline stable, and a coarse drum flickers in outline over the gait.
- **The third leg.** It is the plan. Two legs and this is a different machine
  and a rejected one.

---

## 6. What I still need from kaz

**The triangle budget, with its unit on it.** I have not been given one and I am
not carrying one in from memory. Everything above is specified as proportions
precisely so it can be built to whatever the number turns out to be.

The one datum I have: **the shipped Hedger is 4072 triangles.** This body should
come in materially under that — it has no head, no arms, no antenna, no
full-size cargo cage and three simple legs against a full humanoid chassis — but
that is a prediction, not a count, and suki's is the count that settles it.

**A budget quoted without "triangles" or "vertices" on it is unusable.**
`m.groups[].count` is a *vertex* count and is always exactly 3x the header
`triangles`; that trap has already produced a confident 78% here that was really
25.9%.

---

## 7. The grouping suki must export, because the gesture depends on it

Four animated group roots, and no others:

| group | contains | root authored at |
|---|---|---|
| `leg_a` `leg_b` `leg_c` | thigh, shin, foot pad | each leg's own hip, on the hub |
| **`mast`** | **drum, rim band, bill, bill head, core, hold — everything above the hub** | **(0, 0, 0) — the model origin, NOT the drum centre** |

**CORRECTED 2026-08-14 by kaz, and the correction is the opposite of what this
brief first said.** The first draft put the `mast` root at the drum's centre so
the runtime override could be a bare rotation with no pivot arithmetic. **That
would have painted the health bar through the machine permanently.**
`export_mesh.py:200-204` stores each group's geometry in that group's own local
space, and `model.top` is max z over the raw `positions` array — so **an elevated
root's height never appears in `positions` at all.** The tripod's tallest
geometry is the drum, which lives in `mast`; with an elevated root, `top` would
read a leg instead of 0.92.

**The rule, and it is worth more than this one body: the group holding the
model's TALLEST geometry must have its root at z = 0. Only that one — leaf roots
belong at their own pivots.**

So `mast`'s root goes at the model origin and **otto supplies the pivot in code**
(`GLMath.localPose(out, [0, 0, 0.80], ...)`, the call the Wisp's tumble already
uses). The gesture, the angle, the axis and the curve are all unchanged; the
health-bar figures in the gesture brief become *correct* rather than optimistic.

**The `mast` root's position is still the single most load-bearing number in
either document** — it has simply moved, and it moved because a still frame
cannot show what it breaks. The attack is one bare rotation matrix applied to `mast` in its own
local space, which pivots about wherever that root is authored. Put it at z = 0
— the default, and where a group root naturally lands — and the whole machine
swings about a point on the road. **That renders perfectly plausibly and is
wrong, and a still frame cannot show it.**

Authored at the drum centre, the override needs no translation at all, and there
is no pivot arithmetic anywhere in the runtime to get wrong. See the gesture
brief, section 2.

### 7a. The footfall wave — the layout is asymmetric, so the rotation reads

kaz: the shared gait fix has two equally correct forms giving **opposite**
rotations, and it only becomes observable on a body whose legs are asymmetric
fore and aft. **This layout is asymmetric — two lead, one trails — so it is
observable and the call is mine.**

**The swing travels from one leading leg, to the other leading leg, and then to
the trailing leg.** Stated that way on purpose: it does not depend on how suki
indexes the groups, and it cannot be transcribed backwards.

The consequence, which is the reason: **the trailing leg is only ever off the
ground while both leading legs are planted. It never swings between them.** That
is what the third leg is FOR — it is the prop that stops the frame pitching
forward onto its work — and a prop that leaves the ground between the two
placements it is bracing is a prop at the one moment it is not propping.

Everything else about the gait is suki's and I have not touched it. Her structural
argument I have accepted without qualification: **a tripod is dynamically
balanced at every duty**, because two feet is a line and not a support polygon, so
no duty makes it statically stable and there is nothing to fix there. Standing on
one foot for six of twelve frames with touchdowns at 2, 6 and 10 is a gait, not a
defect.

### 7b. `bob` and `roll` at HALF the chassis default

**`bob = 0.015` and `roll_deg = 1.3`, against the chassis defaults of 0.03 and
2.6.** Full derivation and the measurement table are in the gesture brief,
section 4l. In summary, one lever with three results:

1. It buys back **23% of the attack's margin at the dominant bearing and 30%
   across all eight**, and costs the strike itself nothing.
2. It halves this chassis's roll contribution to plan extent — the roll is about
   a body root **on the ground**, so it swings a high mass sideways rather than
   narrowing it (0.036 u at 2.6° against 0.018 u at 1.3°, at the drum's height).
3. It halves the amplitude of the 2-against-3 beat between `bob`/`roll` (twice a
   cycle) and three footfalls.

**Not to zero.** A body that does not bob reads as sliding, which is a worse
defect and a harder one to diagnose than the one being fixed.

---

## 8. A note on how the figures above are quoted

Every extent in this document names **the part it is taken over and whether it is
one axis or the plan envelope**, because a spec figure a builder cannot reproduce
is indistinguishable from a builder who missed — and the builder always assumes
it is them. My **106.4%** on the Tyrant cost suki exactly that: it was legs only,
x axis, frame 0, while the hull corner was what actually set that body's plan
radius, and she logged a miss against herself for a disagreement that was mine to
label.

- **"plan radius 0.522 u"** — the plan *envelope*, over *every part*, across all
  12 gait frames. Not one axis, not the rest pose.
- **"17.3 x 26.6 px"** — the bounding box of the whole lit silhouette, screen px,
  mean over 12 frames x 8 bearings, at sizeScale 1.25.
- **"top-25% fill 0.72"** — mean width of the top quarter of the *figure*
  (not of the drum) divided by the *widest single row*, same sampling.

---
