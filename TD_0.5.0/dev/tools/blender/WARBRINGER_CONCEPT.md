# The Warbringer — model concept

Written 2026-08-09, from the owner's brief, before any modelling. This is the
document `tower_warbringer.py` gets built from. It follows the contract in
`AGENTS.md` → "Building a model that looks like the ones that already work".

The owner's brief, verbatim: *"a guy with a big hammer, A path he get a bigger
hammer that become a bit arcane and like when he is full aoe he doesn't bother
hitting the enemies so he stops turning and just straight up smashes the ground,
b path the hammer changes to something else that still matches the earthquake
ability."*

---

## What the tower actually does, because the model has to sell it

$700, 150 HP, a **120° wedge** 31.25 u.l. deep, 12 damage every 4 s. It **holds
its swing** until something walks into the zone rather than swinging on a
rhythm — so its resting pose is *waiting*, not idling.

| | Path A — WEIGHT | Path B — RESONANCE |
|---|---|---|
| A1/B1 | +4 dmg, 37.5 u.l. | cooldown 4 s → 3 s |
| A2/B2 | +5 dmg, 43.75 | cooldown → 2.2 s, +15 u.l. |
| A3/B3 | +7 dmg, 50 | +4 dmg, **slow 15% / 2 s** |
| A4/B4 | +10 dmg, 56.25, **`fullCircle`** | +6 dmg, slow 40%, **chain blast** |
| A5/B5 | +14 dmg, 62.5, **`fullCircle`** | +8 dmg, slow 65%, **EARTHQUAKE** |
| total | 52 damage, 575 HP | 30 damage, 700 HP, map-wide control |

Two completely different jobs, and the silhouettes must say so from across the
board: **A is one enormous blow. B is a machine that never stops.**

---

## THE ONE THING THAT MAKES A4/A5 SPECIAL

`fullCircle: true` is not flavour. From A4 the wedge becomes 360°, so the tower
**has no facing left to track** — `facingTarget` stops meaning anything.

The owner spotted this from the gameplay alone: *"when he is full aoe he doesn't
bother hitting the enemies so he stops turning and just straight up smashes the
ground."* That is exactly what the code does, so the model should do it too:

> **At A4 and A5 the ENTIRE model is `_world_fixed_child`.** Nothing on it
> turns. He faces one authored direction forever and slams straight down.

This is the cleanest possible case of the map-fixed contract — no volumes to
tune, no prop-versus-figure boundary, no tearing. It is also a genuine gameplay
read: a Warbringer that has stopped tracking is a Warbringer that now covers
every direction, and the player can see that at a glance.

Below A4 he tracks his target like any other tower.

---

## Path A — the hammer gets bigger, and a little arcane

He is a **smith**, not a soldier. Leather apron, one bare forearm, soot. Where
the Rifleman is a gangster and the Sniper is a martyr, this one is **labour** —
and path A is him being handed better and better tools until the tool is the
whole tower.

- **Base** — a working sledge. Wooden haft, plain iron head, both hands. Head
  roughly 0.34 across. He stands in a wide brace, weight back, waiting.
- **A1–A2** — the head is re-forged twice: heavier, squarer, a brass band at
  the collar. The haft gets a steel core and a wrapped grip. Still just a very
  good hammer, still no glow. The first two tiers are *craft*, not magic.
- **A3** — the first ley in the metal. Veins run the head, dim, and they light
  only during the swing (emissive material, driven by `uGlow` off the swing
  clock). The collar band gains a socket with a cut stone in it. *"A bit
  arcane"* — the owner's phrase, and the ceiling for it: this must never become
  a wizard.
- **A4 — HE STOPS TURNING.** The hammer is now bigger than he is: a squared
  monolith head on a two-hand haft, held **overhead** in the resting pose. Feet
  planted wide, one knee bent, the whole body wound up. The ground under him is
  already fractured in a ring — that ring IS the 360° zone, so the model states
  its own range. Ley light pools in the cracks.
- **A5** — the head is a block with a leyline core visible through a slot in
  it, and the haft is braced against a shoulder rig so he can lift it at all.
  The fracture ring is deeper, wider, and permanently lit. He is no longer a man
  with a hammer; he is a man **being used as a hammer stand**.

**The swing already exists in code** — `SWING_SECONDS`, path A's 0.48 s
overhead forge-slam with three afterimages and 1.6 s of AoE cracks. The model's
animated groups must match it: `haft` + `head` keyed as one rigid group over
four frames, overhead → down, with the contact frame held.

**Emissive parts (A):** head veins from A3, collar stone from A3, core slot at
A5, and the ground fracture ring at A4/A5. Nothing else.

---

## Path B — the hammer becomes a resonator

The brief: *"the hammer changes to something else that still matches the
earthquake ability."*

B never gets stronger — it gets **faster**, then it gets **slow**, then a
**chain**, then a **map-wide quake**. None of that is impact. All of it is
**resonance travelling through the ground**. So the weapon stops being a thing
that hits bodies and becomes a thing that hits the FLOOR and lets the floor do
the work.

- **B1–B2** — the same sledge, cut down. Shorter haft, lighter head, he chokes
  up on it and the sleeves come off. Pure speed: 4 s → 2.2 s. Nothing new is
  added, something is *removed*, which is the honest read for a tier that buys
  rate.
- **B3** — the head is re-forged into a **wedge maul** with a single tuned prong
  standing off the back. First slow: the prong hums, and the model gets its
  first ley-lit part. He drives the wedge into the deck rather than swinging
  across.
- **B4** — the wedge becomes a **twin-pronged resonator**, a tuning fork on a
  short heavy haft. The chain blast IS the fork ringing: it strikes the ground
  once and the note jumps body to body. Two prongs, a ley coil between them, and
  a counterweight at the butt so it reads as an instrument, not a weapon.
- **B5** — a **seismic stake and drop-collar**: a long spike he plants in the
  deck, and a heavy ring that runs down the shaft to drive it. The earthquake is
  him dropping the collar the whole length. The deck around him is already
  plated and bolted — he has been working this square long enough to have built
  a platform on it.

**B keeps tracking at every tier** (no `fullCircle`), so B's foundation is the
usual case: **the plated deck, the bolts and any stacked plate are
`_world_fixed_child`; the man, the stake and the collar are not.** Size those
volumes to the plate, not to a comfortable radius — see the contract.

**Emissive parts (B):** prong from B3, coil between the prongs at B4, the stake
core and the deck seams at B5. The quake itself is already an `Effects` event
(`Effects.earthquake`, 0.75 s shake + 2.4 s fissures) and stays procedural.

---

## Palette

Reuse `td_scene` where it already fits and add nothing that is not needed:
`iron`, `iron2`, `steel`, `steel_dark`, `brass`, `walnut` (haft), `leather`
(apron), `ember` (the forge glow he carries), `ley` / `ley_dim` (path A's veins
and path B's resonance).

A value ladder, as always: the apron is the largest surface, so it takes a
**mid-dark** value; the hammer head is darker; the bare forearm and the ley are
the only bright notes. Do not let a 0.5 m hammer head be the brightest thing on
the model — it will read as chrome, not iron.

---

## Group and animation plan

| group | contents | animated |
|---|---|---|
| `world_fixed` | B: deck plate, bolts, stacked plate. **A4/A5: everything.** | no |
| `figure` | legs, apron, torso, head | root |
| `shoulder` | arms | yes, with the swing |
| `haft` | haft + head/resonator/stake as ONE rigid group | yes, 4 frames |
| `collar` | B5 drop-collar only | yes, separate |

Four frames, keyed on empties, geometry stored in the empty's local space —
never per-vertex. Accent seats bit-identical across frames.

---

## The five enemies to model next

Four exist (`normal`, `swarm`, `brute`, `hive`). Every other type is a coloured
sphere. Ranked by *how badly a sphere lies about it*, which is the only ordering
that matters — a type whose mechanic is invisible is a type the player learns by
losing.

1. **`flying`** (wave N12). The strongest case by far: ground-only towers
   **cannot target it at all**. A sphere that floats slightly higher is not an
   explanation. It needs to be unmistakably AIRBORNE from any camera angle — no
   legs, a visible shadow gap under it, and motion that is nothing like a walk.
2. **`camo_normal`** (wave 14), and `camo_fast` / `camo_heavy` for free. "You
   cannot shoot this without detection" is a *rule*, and right now it is a
   colour. Wants a real visual grammar — a body that is partly not there, and
   that visibly resolves when a detector covers it.
3. **`armored`** (wave 9). A flat 20% tax on every hit, and the earliest lesson
   in the game that damage is not damage. Plating, and plating that reads at
   22 px.
4. **`shielded`** (wave 15). The pack **already has shield hardware** for the
   four modelled types, so this is the cheapest of the five and it teaches the
   "be ready when the shell pops" lesson. Two-state model, shell and broken.
5. **`revenant`** (wave 21). Two lives, and the second one pays nothing. It
   should look like something that has already died once — and the second life
   should be visibly a *worse* body, not the same one respawned.

**Runners-up, and why they lost:** `boss` / the Tyrant is the biggest job on the
board and deserves its own pass rather than a slot in a batch of five.
`shieldbearer` and `healer` are support and read best through their *beams*,
which are effects work, not modelling. `fast` is very common but a sphere lies
about it least — speed is legible from motion alone.
