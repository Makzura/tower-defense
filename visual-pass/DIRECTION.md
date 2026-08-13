# Visual direction — the reference for criterion 7 (cohesion)

Settled 2026-08-09 from the owner's brief plus the setting already written into
the game files. Criterion 7 scores an asset against THIS document. If an asset
looks good but does not belong here, it does not score 4.

**Corrected 2026-08-13 against three rulings by the owner.** His word is the
authority; where this file disagreed with it, this file was wrong. The
2026-08-12 flesh ruling governed **rule 2**. Two later rulings the same week
governed **rule 1** (*"Yes tech goes tech, magic goes magic"* — the wizard look
follows the branch, not the tier) and the **colour table in rule 3** (mana takes
its colour from its use, not its user; cyan is not a faction marker). All three
sections have been rewritten. Two standing notes:

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

**1. Towers are ARCANE TECH WITH A HUMAN INSIDE, and the magic follows the
BRANCH, not the tier.**

The owner, 2026-08-13: *"Yes tech goes tech, magic goes magic."*

A tower does not earn sorcery by climbing. It commits to a kind of answer and
then becomes more of that answer. **A technology branch ends in more technology
at max tier; a magic branch ends in more sorcery.** A maxed hardware path that
sprouts robes at tier 5 is wrong, and so is a maxed ritual path that resolves
into clean machinery.

This file said the opposite until 2026-08-13 — *"the tier ladder is the story
… ley light arrives at tier 3 and grows"* — and hung the wizard read on tier
depth. That was wrong, but the reason it looked right is worth keeping: **tier 3
is where a tower commits its branch.** The crosspath lock fires there on all
three multi-branch towers — `js/smasher.js:257`, `js/blub.js:271`, and
`lockThreshold: 3` at `js/towers/long-range-dps.config.js:273`. The visual
divergence begins exactly where the mechanical divergence begins. Tier 3 is the
fork, not the arrival of magic.

Early tiers are still *craft* — iron, brass, wood, leather, honest hardware —
because a tower that has not committed has not diverged yet. That part survives.

**The Arcane Sniper and the Summoner fork both ways as they upgrade.** That was
the owner's original ruling and is now explicit. The Summoner is already built
this way and is the clearest example in the game: family B is Cyberblub,
Mechablub, Mechablub MK2, SuperBlub, and family A is Blub, Mini Blub, Hungry
Blub (`js/blub.js:193-229`). One branch is machinery and says so in every name;
the other is not.

Where a branch does go magic, the owner's "old magician wizard" note applies to
it: a costume and a ritual vocabulary (robes, seals, rune circles, floating
focus objects) laid over working hardware. It is never a substitute for the
hardware.

*Not yet ruled, do not assign:* which of the Arcane Sniper's two paths is the
ritual one. In code they are mechanical only — A is reach, pierce and cone; B is
damage, execute and crit — and carry no fiction yet. That pairing is settled
with the owner, not inside a model brief. The model already carries both `ley`
and `sigil` (`tower_sniper.py`), so the vocabulary for either exists.

The concept doc's hard cap stands and is not overridden by the brief:

> A3 — *"a bit arcane"* — the owner's phrase, and the ceiling for it: **this
> must never become a wizard.**

That cap is specific to the Warbringer, who is a smith, and it costs him
nothing: his two branches are reach-and-damage and speed-and-slows
(`js/smasher.js:16`), so he forks hardware into hardware and never had a magic
branch to climb. He carries at most ley in the metal. The Sniper and the
Summoner are the two towers that can carry a wizard read, and only down the
branch that goes that way.

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

**Enemy-held mana is now ruled, and there is no enemy palette.** See the mana
rule in section 3 — mana takes its colour from its use, never from its user, so
a machine using mana looks like mana being used for that purpose. Do not build a
corrupted variant of anything.

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

**MANA TAKES ITS COLOUR FROM ITS USE, NEVER FROM ITS USER.** The owner,
2026-08-13: *"Raw mana is light blue and changes colours depending on how it's
used. Used by enemies or not doesn't change the mana's rules — the world is not
racist."*

Three things follow, and the third is the one that bites:

- **Raw mana is light blue.** That is its resting state, before anyone spends
  it. `ley` is the palette key that carries it.
- **A colour is an application, not an allegiance.** Violet on a ritual is
  violet because of the ritual, not because a defender is holding it.
- **Enemy-held mana obeys the identical rules. There is no enemy palette and no
  corrupted variant.** When the machines gain the ability to use mana, it looks
  like mana being used for that purpose — the same as it would in anyone's
  hands.

**Do not invent a colour for a use that does not exist yet.** The rule is
recorded here; each use gets its colour when there is an asset that needs one.

This corrects the row below, which until 2026-08-13 gave ley cyan to "the
player's power, friendly energy". **The shipped assets never agreed with that
row.** `ley` is on five enemy models and in every case it is the enemy's shield
— `shield_ley` at `enemy_normal.py:93`, `enemy_brute.py:73`, `enemy_hive.py:146`,
`enemy_swarm.py:98`, `enemy_chassis.py:185`. A shield is mana deployed to stop
damage, it looks the same in anyone's hands, and it has been drawn that way in
the game since those models were built.

Colour meaning is fixed and must not drift:

| colour | means |
|---|---|
| **ley cyan** (`ley`) | **raw mana** — unspent, at rest, in transit, or shielding. Not a side and not a faction. |
| **violet / magenta** (`sigil`) | mana spent on ritual and covenant — the Sniper's cost-bearing magic |
| **ember orange** (`ember`) | forge, labour, heat, the Warbringer — see the caution below |
| **red** (`core_red`) | a lit enemy core — what the machine has taken, caged because it cannot hold it itself |
| **gold** (`gold` `#E8B84B`) | money, bounty, a shield breaking — and the Rifleman's tailoring |

**"Threat" was struck from the red row.** It was the last allegiance read in
this table: it told you whose colour red was rather than what red is. The core
is described by the model that owns it (`enemy_normal.py:16-22`) as *"what it
has already taken … the machine cannot hold mana itself"*.

*Unresolved, and it goes to the owner before any asset changes:* if the caged
core is taken mana and raw mana is light blue, the red core needs a reason —
either it is mana already put to a use, or it is not mana. **Do not repaint it
to find out.** `core_red` is on 8 of 9 enemy bodies and a guess here repaints
the whole roster; it is also rendering's asset to change, not this file's.
Two measurements to hand whoever asks: `core_amb` sits on exactly the two
bodies that *consume* rather than carry — the Brute's furnace and the Hive's
foundry — and `core_vio` is declared in the palette and used by nothing.

**Caution on ember: it is not established as a mana colour, so do not use it as
one.** `#FF7A3C` is declared inside the Rifleman's block of `td_scene.py`, which
calls him *"the one tower with no magic in him"* and his lit cigar and lamp
*"fire and filament rather than enchantment"*. The Warbringer re-declares the
same hex separately at `tower_warbringer.py:61`. Whether a forge glow is mana
put to work or simply heat is a question for the owner, not an inference from
this table.

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
2. If it is a tower: is there a person in there, and does its look match the
   BRANCH it committed to at tier 3 — tech going further into tech, magic
   further into magic?
3. If it is an enemy: is it fabricated, and does it read as re-fitted human
   hardware? Everything in the build today is an Easy body, so it must carry
   **no organic matter at all** — including the heaviest and the boss. If it is
   a late-campaign body from content not yet built, is its organic housing the
   best-kept part of it?
4. Does it separate by value before hue, with the biggest surface darkest?
5. Does its light come from geometry rather than from a sprite laid over it?
