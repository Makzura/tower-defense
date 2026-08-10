# Visual direction — the reference for criterion 7 (cohesion)

Settled 2026-08-09 from the owner's brief plus the setting already written into
the game files. Criterion 7 scores an asset against THIS document. If an asset
looks good but does not belong here, it does not score 4.

## The owner's brief, verbatim

> "arcane tech yes like you described but you shouldnt forget the old magician
> wizard style too for the towers sometimes even tho they are also arcane tech a
> lot. ennemies tho should be tech very tech and the more powerful ones organic
> too but unnatural organic."

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

**2. Enemies are TECH — hard, fabricated, unfriendly — and the strong ones go
UNNATURAL ORGANIC.**

Ordinary enemies are machinery: plate, cage, housing, exhaust, a lit core seen
through a slot. No flesh, no faces, no sympathy.

The heavy end (Hive, Brute, Revenant, the Tyrant, bosses) adds organic matter,
and it must read as **wrong** — grown inside a machine that was not built to
hold it. Brood cells, wet membrane behind bars, something breathing under
plating. Not creature-design; contamination. The machine came first and the
organic is what happened to it.

**3. One value ladder, one palette, everywhere.**

From the model contract in `AGENTS.md`: separate by VALUE first, hue second, and
the largest surface takes the darkest value. A palette of five colours inside 8%
luminance renders as one dark blob — that already happened once to the Rifleman.

Shared palette, already defined in `td_scene.py` / `td_mesh.py`:
`iron`, `iron2`, `steel`, `steel_dark`, `brass`, `walnut`, `leather`, `ember`,
`ley`, `ley_dim`.

Colour meaning is fixed and must not drift:

| colour | means |
|---|---|
| **ley cyan** | the player's power, the network, friendly energy |
| **violet / magenta** | ritual and covenant — the Sniper's cost-bearing magic |
| **ember orange** | forge, labour, heat, the Warbringer |
| **red** | enemy cores, enemy life, threat |
| **gold** | money, bounty, a shield breaking |

Light comes from **emissive materials on the geometry**, driven by `uGlow` —
never from canvas discs floating over the model. That was tried and it is what
"looks like a sticker" means. Canvas is only for what has no surface to land
on: arcing current, a rune circle in mid-air, heat haze at a muzzle.

## Quick test for any asset

1. Would this belong on a worked, powered surface — not a field, not a forest?
2. If it is a tower: is there a person in there, and is the magic proportionate
   to the tier?
3. If it is an enemy: is it fabricated? And if it is a heavy, is the organic
   part clearly *wrong*?
4. Does it separate by value before hue, with the biggest surface darkest?
5. Does its light come from geometry rather than from a sprite laid over it?
