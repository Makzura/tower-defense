# Visual direction — the reference for criterion 7 (cohesion)

Settled 2026-08-09 from the owner's brief plus the setting already written into
the game files. Criterion 7 scores an asset against THIS document. If an asset
looks good but does not belong here, it does not score 4.

**Corrected 2026-08-13 against the world the owner ratified on 2026-08-12.**
That ruling is the authority; where this file disagreed with it, this file was
wrong. It governed rule 2, which has been rewritten. Two standing notes:

- **Every enemy and tower name below is PROVISIONAL** and scheduled for renaming
  once the naming pass lands. Names here identify bodies, they do not fix them.
- This is an art brief, not a lore document. It carries only the parts of the
  world that change what gets built.

## The owner's brief, verbatim

> "arcane tech yes like you described but you shouldnt forget the old magician
> wizard style too for the towers sometimes even tho they are also arcane tech a
> lot. ennemies tho should be tech very tech and the more powerful ones organic
> too but unnatural organic."

This file previously read *"the more powerful ones"* as **strength**, and built
rule 2 on it. The owner's later ruling fixes it as **campaign position** — the
enemies you meet deeper in are the organic ones, and they are also the stronger
ones, but strength is the symptom and not the cause. Rule 2 now says so.

## The setting, as the files already record it

The game is a **leyline defence network**. The menu calls itself LEYLINE DEFENCE
NETWORK / COMMAND TERMINAL. All six maps are named for ley infrastructure —
`rune-circuit`, `mana-coil`, `sigil-lattice`, `null-meridian`, `shifting-ley`,
`twin-confluence` — and the chooser describes them as etchings, windings,
switchbacks and traces. The board is a worked surface with power running
through it, not a landscape.

`WARBRINGER_CONCEPT.md` fixes the three tower characters, and they are people,
not archetypes:

- **Rifleman** — *a gangster*. Top hat, long coat, drum-fed rifle.
- **Arcane Sniper** — *a martyr*. Ritual, seals, covenant rounds, self-cost.
- **Warbringer** — *labour*. A smith: leather apron, bare forearm, soot.

`README.txt` fixes the enemies as **machines**: Normal is a "connected, stooped
carrier" with a red core behind cage bars and inspection windows; Swarm a "low
six-legged scavenger-tick"; Brute a "furnace-backed breach engine" with
overlapping armour; Hive a "walking brood foundry" with an armoured incubator,
visible brood cells and a rear hatch.

## The three rules that follow

**1. Towers are ARCANE TECH WITH A HUMAN INSIDE, and the magic is earned late.**

The tier ladder is the story: early tiers are *craft* — iron, brass, wood,
leather, honest hardware. Ley light arrives at tier 3 and grows. A tower's
final tier may look like sorcery; its base tier may not.

The owner's "old magician wizard" note applies HERE, and only to the towers that
have earned it — the Arcane Sniper's ritual tiers above all, then the
Warbringer's ley-veined path A. It is a costume and a ritual vocabulary
(robes, seals, rune circles, floating focus objects), laid over working
hardware. It is never a substitute for the hardware.

The concept doc's hard cap stands and is not overridden by the brief:

> A3 — *"a bit arcane"* — the owner's phrase, and the ceiling for it: **this
> must never become a wizard.**

That cap is specific to the Warbringer, who is a smith. The Sniper is the tower
that carries the wizard read; the Warbringer carries at most ley in the metal.

**2. Enemies are TECH — and organic matter is earned by CAMPAIGN POSITION, not
by strength.**

Enemies are machinery: plate, cage, housing, exhaust, a lit core seen through a
slot. No faces, no sympathy. They are also **our own hardware** — human
engineering repurposed by something that is no longer ours — so they should
read as built, inherited and re-fitted, never as creatures and never as alien.

**What decides whether a body carries organic matter is how deep in the
campaign it appears.** The machine cannot hold mana; flesh can. As the player
pushes toward the superintelligence, the enemies carry more and more biological
and artificial parts that let them use mana too. A big early enemy is still
pure machine. A modest late enemy may carry flesh. **Size is not the trigger.**

**The consequence for everything currently in the game: build no flesh.**
`EASY_WAVES` is the only wave table in the build (`js/game.js:223`, `:667`), so
every body that exists today is an Easy body, and Easy is the introduction and
contains **no flesh at all**. That includes the four this file used to name as
flesh-carriers — `hive`, `brute`, `revenant` and the wave-35 `boss` — all of
which are Easy bodies. The Hive's brood is a **foundry**: it manufactures
machines, and its brood cells are lit housings, which is what shipped
(`enemy_hive.py`, `core_amb`/`core_red`). Do not turn them into eggs.

**When flesh does arrive — in content not yet built — it reads as CARE, not
contamination.** This is the reversal, and it is the whole point of the arc:
the machine is **succeeding**. Captives are raised, studied and kept as
material, not tortured; nobody who was taken has come back, so nobody knows.
So the organic housing is the best-maintained thing on the body — clean,
sealed, warmed, serviced, plumbed, obviously expensive. By the late campaign
the machine around it is dented and filthy while that housing is still
immaculate. **Husbandry, not rot.** Nothing wet, nothing straining at bars,
nothing breathing through a crack. The horror is that it works.

Not creature-design and not contamination either: it is livestock plant bolted
onto industrial plant. The organic part must never read as an accident, a
disease, or something that happened *to* the machine.

*Not yet ruled, do not invent:* what colour enemy-held mana is. The table below
gives ley cyan to the player and red to enemy cores; the first asset that needs
enemy mana must ask rather than pick.

**The Tyrant is demoted and gets none of this.** The owner: *"the Tyrant is
nothing, it's just a machine bigger than others that was given more resources
to capture humans."* It is not the antagonist, not a character, and not
entitled to significance. Build it as scale and capture capacity — more
resources, more of the same — not as a personality. The **superintelligence**
is the final boss, and no asset for it exists yet.

**3. One value ladder, one palette, everywhere.**

From the model contract in `AGENTS.md`: separate by VALUE first, hue second, and
the largest surface takes the darkest value. A palette of five colours inside 8%
luminance renders as one dark blob — that already happened once to the Rifleman.

**That is an AUTHORING rule, and this file does not carry the measurement.** The
clause is `AGENTS.md:4395-4405` and it has not moved once; how you *check* it is
section 4 of `tools/blender/HOUSE-STANDARD.md`, which has been retracted and
re-ruled repeatedly and is the only place the instrument lives. Two things
follow, and rendering asked for both to be stated here. Contrast is computed on
**rendered pixels**, and the CR bands in that document are **palette-space**
bands, so a rendered ratio must never be compared against them. And nothing in
this section — the colour table below included — predicts what lands on screen.
It tells you how to author. The frame is measured, not inferred.

The shared palette is the `PALETTE` dict in `tools/blender/td_scene.py:78-145`,
and that file is the only copy — `td_mesh.py` holds no palette. **Read the
names out of it; do not quote them from memory.** The version of this list
printed here until 2026-08-13 gave ten names of which five (`iron`, `iron2`,
`steel`, `steel_dark`, `ley_dim`) exist nowhere in the project; the real
machine greys are `tin`, `tin_dark` and `stone`.

Note while you are in there: `flesh` and `skin` are in that dict already and are
**human** colours — the recruits, a bare forearm. No enemy uses either, and
under rule 2 none currently may.

Colour meaning is fixed and must not drift:

| colour | means |
|---|---|
| **ley cyan** | the player's power, the network, friendly energy |
| **violet / magenta** | ritual and covenant — the Sniper's cost-bearing magic |
| **ember orange** | forge, labour, heat, the Warbringer |
| **red** | enemy cores, enemy life, threat |
| **gold** (`gold` `#E8B84B`) | money, bounty, a shield breaking — and the Rifleman's tailoring |

**`brass` `#B98A38` is not gold and carries no meaning.** It is a machine
material — tarnished fittings — and `td_scene.py:98-101` says so itself. It is
on 8 of 9 enemy bodies and 7 Sniper models and has been from the start; `gold`
is on 5 models, all Rifleman, and on no enemy at all. Brass on an enemy is not
a breach of the gold row and never was.

Light comes from **emissive materials on the geometry**, driven by `uGlow` —
never from canvas discs floating over the model. That was tried and it is what
"looks like a sticker" means. Canvas is only for what has no surface to land
on: arcing current, a rune circle in mid-air, heat haze at a muzzle.

## Quick test for any asset

1. Would this belong on a worked, powered surface — not a field, not a forest?
2. If it is a tower: is there a person in there, and is the magic proportionate
   to the tier?
3. If it is an enemy: is it fabricated, and does it read as re-fitted human
   hardware? Everything in the build today is an Easy body, so it must carry
   **no organic matter at all** — including the heaviest and the boss. If it is
   a late-campaign body from content not yet built, is its organic housing the
   best-kept part of it?
4. Does it separate by value before hue, with the biggest surface darkest?
5. Does its light come from geometry rather than from a sprite laid over it?
