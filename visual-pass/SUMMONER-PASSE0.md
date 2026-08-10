# Summoner — Passe 0: inventaire et liste de production

Per §18, this pass ends by asking for validation of the production list. Nothing
is produced until that list is approved.

---

## 1. The pipeline that already exists

**Geometry.** Authored in Python under `tools/blender/`, emitted as one classic
`<script>` per model into `js/gl/models/*.js`, registered through
`GLModels.register`. Two routes:

| route | needs | used by |
|---|---|---|
| `td_mesh.py` | Python only | Warbringer, and the Siphon I built this session |
| Blender scripts | Blender 5.3 | Sniper, Rifleman, recruits, the four enemies |

Both are verified working on this machine. `td_mesh.py` emits `export_mesh.py`'s
exact contract, so nothing downstream can tell them apart.

**Scale.** `UNITS_TO_PX = 20.0 × 1.529 × 1.04 = 31.8032` px per Blender unit.
A human tower is ~1.75 units ≈ 55 px. `1 u.l. ≈ 1.0 px` on the board, so the
brief's radii in §7 are directly the `footprintUl` values already in
`BlubTower.UNITS` — they match exactly, nothing to reconcile.

**Materials.** A palette dict, `name -> (hex, emission)`. Emission is a real
per-vertex channel driven by the `uGlow` uniform, so a lit part is occluded by
whatever stands in front of it. `AGENTS.md` requires a **value ladder**:
separate by value first, hue second, largest surface darkest.

**Animation.** Frames keyed on empties; one 4×4 per group per frame; geometry
authored in world space with `parent` selecting the animated group. Four frames
is the house norm. `drawActor(model, x, y, yaw, scale, lift, frame, overrides)`
also accepts per-group override matrices for live poses, which is how the
recruit's recoil rides on top of its baked walk.

**Map-fixed parts.** Anything bolted to the tile goes in a `world_fixed` group
so it does not yaw with the body. This is exactly what a summoning circle, a
totem and a chalk ring need.

**Effects.** A projected canvas overlay in `gl-world.js` (`project()`,
`drawGroundRing`, `drawEffects`, …) plus `js/effects.js` for cosmetic feedback.
Per-weapon FX anchors are stored as Blender-local `[forward, side, height]`
points (`SNIPER_FX`, `RIFLEMAN_FX_MUZZLE`) and projected through the model's own
basis — the rule being that light must land on the hardware, not on a percentage
of a generic barrel.

**Grounding.** As of this session the board has a height field; actors stand on
the surface under them and `project()` puts every effect on that same surface.
Summoning circles will inherit this for free.

**2D fallback.** `VisualModels` + `js/skins/draw-pack.js`, from Blender-rendered
sprite sheets. Only ever visible if WebGL is unavailable.

---

## 2. What exists for the Summoner today

`js/blub.js` (84 700 bytes) and `tests/blub.test.js` are complete and match this
brief closely — `BlubTower.UNITS` carries all ten units with the §7 radii, and
`BlubTower.MONSTER_TIERS` carries all five tiers including the tier-4 exact-HP
rule. The mechanics are not in question.

**The visuals do not exist at all.** Verified in the running game
(`captures/passe0-summoner-current.png`): the Summoner draws as a grey
placeholder cylinder and its blubs as identical green cylinders. The only
Summoner visual that exists is the permanent `"10 blubs · 100 HP"` readout.

So this is a from-scratch visual build against finished mechanics — the good
case. Nothing has to be reverse-engineered and nothing gameplay-facing needs to
change.

Tier 4 does **not** leak into `js/codex.js` today (checked: no reference to
`MONSTER_TIERS`, `6666` or `monsterTier`). Acceptance test 26 starts satisfied
and my job is to not break it.

---

## 3. What I propose to produce

### Geometry — 26 bodies + additive marks

Authored with `td_mesh.py` (pure Python, no Blender, deterministic).

**Summoner, 11 bodies** — base, A1–A5, B1–B5, per §6.
Plus a 12th, **the wrecked tower** for monster tier 3 ("la tour est déchirée,
la créature en sort", §15).

**Blubs, 10 bodies** — blub1, blub2, blub3, mini1, mini2, hungry, cyber, mecha,
mecha2, superb.

**Fused creature, 5 bodies** — T0–T4.

**Crosspath marks as separate add-on meshes, not body variants.** This is the
one structural choice I want to flag as a choice: §2 demands that a mark never
alters a silhouette, and acceptance test 3 requires the marked and unmarked
bodies be superposable. Building marks as separate small meshes drawn over an
untouched body makes that true *by construction* rather than by discipline —
the base body is literally the same vertices. Marks needed: B1 mouth-glow, B2
cyan ring, A1 lichen patch, A2 bolted stone plate (on units); B1 gauntlet, B2
visor, A1 circle runes, A2 subordinate grimoire (on the summoner).

### Renderer wiring

- `blubGroup()` + a `towerModel()` branch for `constructor.ID === "blub"`, and a
  unit selector for blubs (they live in `towers` and carry `.unit`).
- **HP-as-deflation** (§8): continuous squash/sag from `hp/maxHp`, never
  stepped; Hungry Blub inflates instead.
- **Anti-carpet variation** (§9): scale ±10 %, idle phase offset, resting
  facing, minor hue — seeded from position, reusing `BlubTower.seedFrom`'s
  xorshift so it stays deterministic and replayable.
- **Summoning circle** (§11): 2 s, diameter ∝ unit radius, A engraves and fades,
  B sweeps out and retracts, B2 adds the cyan liseré and faster spin.
- **Projectiles** (§10), **swarm threads** (§13), **weaken sigil** (§13),
  **deaths and the MK2 leap** (§14), **monster jumps, growth and health**
  (§15), **hover highlight** (§16).

### Passes

Then §18's passes 1→6 in order with their reviews, followed by the three
mandatory critical cycles (7, 8, 9).

---

## 4. Points I will not invent — decisions needed

**(a) Scope of the 2D fallback.** 26 new bodies would each need a Blender-
rendered sprite sheet for `draw-pack.js`. That is a large render job and a large
asset bump, for a path only visible when WebGL fails. **Proposal: 3D only; the
2D fallback keeps drawing its cylinders.** Confirm.

**(b) Tier 4's radius versus §17.** `MONSTER_TIERS` fixes T4 at
`footprintUl: 100` — 200 px across on a 1280 px board. §15 says growth must
never mask the path and §17 says no effect may hide the path or the enemies. At
radius 100 the body itself covers the path. Which gives: the radius, or the
readability rule?

**(c) Eleven summoner bodies, or five.** §6 gives a distinct appearance to every
tier including A1/A2 and B1/B2, but §5 also lists those four as crosspath
*marks*. My reading: on the **main** path they are full stages (§6); as a
**crosspath** mark they are the smaller version (§5) — so 11 bodies. Confirm,
because the other towers here ship 5–7 bodies and 11 is a real step up in work.

**(d) The wrecked tower at T3.** I am assuming a 12th summoner body rather than
hiding the tower. Confirm.

**(e) Where the fused creature's health is shown** (§15: it is the only unit
enemies can attack, so it must show health "de façon lisible", while every other
unit is forbidden a bar). Bar over the body, or the body itself carrying it?

---

## 5. Estimate

Roughly 26 bodies + ~8 mark meshes, plus the effect and animation work in
`gl-world.js`. This is comparable to the Sniper's whole tree, which is the
largest single art job in the project. It will take several passes and I will
not treat any pass as done without running its review.
