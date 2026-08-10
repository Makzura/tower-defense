# Visual quality pass — iteration log

Durable, append-only. This file is the record of the loop and must survive a
session reset. Every iteration appends one row BEFORE moving to the next.

Companion files, all in this folder:

- `DIRECTION.md` — the visual direction. Criterion 7 is scored against it.
- `PERF.md` — the performance budget and the measured baseline. Criterion 8.
- `INVENTORY.md` — every visual asset, with calibration and current scores.
- `captures/` — PNG observations. `<asset>-before.png` / `<asset>-after-NN.png`.
- `harness.js` — the observation rig. Injected at runtime; not part of the game.

## Rubric

Scored 0-5 each. **Passing bar: 4 or higher on every criterion.**

1. Silhouette readability — recognisable at normal viewing zoom, in one glance
2. Form quality — proportions and detail appropriate to viewing distance
3. Material believability — surface response to light reads as an intentional material
4. Colour and value — clear hierarchy, contrast against background and other assets
5. Motion quality — timing, easing, anticipation, follow-through; no linear robotic motion
6. Effect impact — effects communicate their meaning and land with weight
7. Cohesion — consistent with `DIRECTION.md`
8. Performance cost — quality gained is proportionate to cost paid, within `PERF.md`

Scores are never revised downward for an unchanged asset. A score changes only
when the asset changes. Criteria that cannot apply to an asset (motion on a
static mesh, for example) are marked `n/a` and excluded from its total and from
its passing test.

## Rules of the loop

1. Pick the lowest total score among assets not yet passing; ties break toward
   higher visibility.
2. One concrete change, targeting the weakest criteria.
3. Observe and capture.
4. Re-score from the capture, not from intent. No capture, no score — the
   attempt is a failure.
5. Score did not rise -> revert (`git checkout`) and try a different approach.
6. Append the row here.
7. Every 20 iterations, re-score the whole inventory for cohesion drift.

**BLOCKED** = five consecutive failed attempts. Recorded with a reason, excluded
from the exit condition, reported at the end.

## Environment

- Observe: `TDObs` harness injected into `index.html` in the Browser pane;
  `draw()` driven synchronously so a hidden pane does not freeze capture.
- Capture: composited GL + HUD POSTed to a Node sink on `127.0.0.1:8765`,
  written to `captures/`.
- Revert: git. Baseline commit `50ed7ef`, tree clean at start.
- Rebuild geometry: Python 3.12 for `td_mesh` models (verified byte-identical),
  Blender 5.3.0 Alpha for the Blender-authored models and sprite sheets.

---

## Phase status

**Phase 0 — SETUP: complete.** Every blocker resolved rather than deferred.

- Observation and capture: proven. `TDObs` harness + Node sink on
  `127.0.0.1:8765` writing PNGs to `captures/`.
- Run: `index.html` from `file://`, no build step.
- Visual direction: `DIRECTION.md`, from the owner's brief plus the setting
  already written into `WARBRINGER_CONCEPT.md` and `README.txt`.
- Performance budget: `PERF.md`, measured on the real game.
- Toolchain: Python 3.12 installed (verified: regenerates all 7 Warbringer
  models **byte-identical**). Blender 5.3.0 Alpha located at
  `C:\Users\Superuser\Downloads\blender-5.3.0-alpha+main.d0c98651e6fb-windows.amd64-release\`
  (nested one level) and verified: `make_preview.py --frame-riflemen` solved the
  ortho scale through all 48 yaws.
- Revert: `git init` in `TD_0.5.0`, baseline commit `50ed7ef`, 281 files, clean.

**Phase 1 — INVENTORY: complete. 647 assets.** Built by eight parallel readers
over the render subsystems, then swept by a completeness critic which added 60
the readers missed. `INVENTORY.md` is the readable copy, `INVENTORY.json` the
one the loop updates.

geometry 273 · material 158 · texture 71 · animation 62 · particle-effect 40 ·
shader 28 · transition 15. Visibility: 254 high, 248 medium, 145 low.

**Phase 2 — CALIBRATION: complete. 45 groups, none passing.**

Anchors: worst is **G03 map scenery props** at 0.50 (confirmed absent — the 3D
board read `env.zones` and never `env.models`); best is **G26 B5 strike and
ritual circle** at 3.50. Full scores and per-group justification in
`CALIBRATION.md`.

Three groups from the 48 were not scored — G46, G47 and G48, the 2D sprite
fallback path — because they were left out of the scoring batches. They are
only visible when WebGL is unavailable. To be scored before the exit condition
is claimed.

**Phase 3 — LOOP: running.**

### A second stated deviation: bug fixes jump the queue

Iterations 2 and 3 were not the lowest-scoring groups. Both were confirmed
rendering *defects* found during calibration and verified independently before
acting — a zone skirt occluding the surface it surrounds, and road kerbs wound
inside-out so they were culled every frame. Neither is a quality judgement; both
made the calibration scores of every other asset unrepresentative, because the
board is the backdrop the whole rubric's contrast criterion is measured against.
Fixing them first was worth more than holding the ordering rule.

Ordinary quality work follows lowest-first from here.

## A deviation from the brief, stated plainly

The brief caps the loop at 200 iterations. The inventory is 647 assets. One
iteration per asset cannot reach the exit condition, and running it that way
would spend the budget on the first fifth of the inventory and abandon the rest.

It is also the wrong unit of work: these assets are not independent. One shader
lights every mesh; one palette colours every material; one absent decision
(there are no contact shadows anywhere) makes every actor in the game float.

So the loop runs on the 48 **groups** in `GROUPS.md`, while `INVENTORY.json`
keeps the per-asset record. Selection, single-change, observe, re-score, revert
and BLOCK all work exactly as briefed — the group is the unit of work, not a
shortcut around per-asset scoring. Every member of a touched group is re-scored
individually from the capture.

## Two things found during setup that were NOT bugs

Recorded because both looked like defects and neither is, and a future session
should not go chasing them:

- The index screen throwing `Cannot read properties of null` at
  `codex.js:308` was caused by the harness assigning `screen = "index"`
  directly, which skips the `Codex.open()` that builds `towerModels`.
- `+$undefined` cash popups came from the harness calling
  `Effects.enemyKilled(e)` without a bounty argument.

---

## Iterations

| # | asset | criteria targeted | change | before | after | outcome |
|---|---|---|---|---|---|---|
| 1 | **G03** map scenery props | silhouette, form, material, colour, cohesion (all 0 — absent) | Built a scenery vocabulary in `gl-geometry.js` (`frustum`, `boxAt`, `scenery`) covering all ten authored prop kinds, added a per-vertex emissive channel to `Builder`, and baked `env.models` into the static map mesh in `buildMapMesh`. Props take each map's OWN palette, so all six themes follow with no second table. Map pass now drives `uGlow` so the ley accents emit from the geometry. | `0000--03` 3/30 (0.50) | `3334--45` 22/30 (3.67) | **improved** — board is no longer a bare plane. +0.13 ms GPU, no draw calls, no per-frame cost. Not passing: silhouette/form/material still 3. |
| 2 | **G01** terrain slabs | material, colour | Zone skirt was drawn larger in x/y *and* proud of the slab it surrounds (deck slab z 0.4–9.4, skirt 8.1–9.5), so the skirt's top face occluded the slab's completely and `P.panel` was invisible everywhere in the game. Made it a rim below the slab top instead of a lid over it. | `2111--25` 12/30 (2.00) | `4234--35` 21/30 (3.50) | **improved** — slab tops went (27,47,60) metalDark → (26,63,81) panel. Floor-to-slab luminance separation 7.6% → **37.6%**. Not passing: form still 2 (no bevel/subdivision). |
| 9 | **shot height** (owner-reported, 2nd pass) | correctness | Owner: *"effects are good but bullets are not still"*. My iteration-8 `shotGround` was wrong twice: a **piercing** shot has no `target`, so it fell straight through to sampling the ground under itself — the original bug, untouched — and the progress term `travelled / (travelled + 1)` reaches 1 almost immediately, so even homing rounds snapped to local terrain. Rewritten: origin stamped once, pierce shots **hold** their firing height (a rail shot down a fixed heading has no single target to descend to), homing rounds ease origin→target by real distance travelled over total span. | — | — | **fixed** — bolt now sits on the barrel line. Then a second correction: back-projecting one frame put the origin on a deck's *rim* (8.8) not its top (9.4), so the shot is now anchored to the **tower** that fired it. Verified `_gz` 9.4 == tower ground exactly. |
| 8 | **shot/effect rigidity** (owner-reported) | correctness | Owner: *"the effects and the bullets follow the curve, it's funny but very unrealistic, instead make them straight but angled to aim the ennemies"*. Caused by iteration 7: sampling ground per point is right for a decal, wrong for anything rigid or airborne — a barrel's coils and muzzle overhang a deck edge, so the weapon bent; shots inherited the terrain profile. Added `withGround(z, fn)`: a caller owning one object pins one reference for everything it draws. | — | — | **fixed** — tower hardware measures from the tower's ground, recruits from their own, decals still per point so rings drape over edges. |
| 7 | **effects height** (owner-reported) | correctness | Owner: *"les effets, bullets laser charges ne montent pas avec le modele de la tour"*. Direct fallout of iteration 4: models were stood on the surface, the projected overlay was not, so a tower on a deck rose and its charge ring, muzzle anchors and beam stayed on the floor. `project()` now adds the ground height under the point — every z in that layer is a height above the BOARD, not above zero — and `ringPath` projects per point instead of through `camera.groundCircle`, which solves only against the flat plane. | — | — | **fixed** — Sniper A5 on a 9.4 deck now carries its charge ring around its own aperture. One change covers every effect because they all come through `project()`. No measurable cost: stress 4.44 ms vs 4.59 before. |
| 6 | **G13** the Siphon | silhouette, form, material, colour, cohesion (all 0–1 — a placeholder cylinder) | Authored `tools/blender/tower_siphon.py` against `td_mesh` (pure Python, no Blender) and built five bodies — base/a3/a5/b3/b5. This is where the wizard read belongs: the Warbringer's contract forbids it by name, the Sniper is a martyr and the Rifleman a gangster, and the Siphon does no ballistics at all — it holds a beam, drains, banks the drain as gold and heals off it. So: hooded robe, no face but two ley eyes, a focus ring held at arm's length, and a reservoir he cradles that visibly fills. Tiers say what the tiers do — a3 a second vessel, a5 a three-intake harvest rig, b3 a return line into the chest, b5 a heart-vessel. | `00011003` 5/40 (0.63) | `43342355` 29/40 (3.63) | **improved** — 2160–2632 tris, world-fixed dais so the foundation does not turn. Not passing: form 3 (the robe still reads as a cone in silhouette), material 3, motion 2. |
| 5 | **G09** grounding — placement rule | (behaviour, at owner's request) | A tower whose footprint bridges a height edge is half planted and half hanging over the drop. `whyCannotBuild` now rejects it with "not level here", asked of the 3D board via `World3D.isLevelUnder` and guarded so the flat 2D fallback keeps its old rules exactly. | — | — | **works** — on the deck: allowed; straddling the edge (y 385–405): "not level here"; clear of it again at y 410: allowed. The road case never reaches it, already covered by "too close to the path". |
| 4 | **G09** contact shadows and grounding | silhouette, form, motion, cohesion | Actors were all drawn at z=0 while the board has real height (deck tops 9.4, road ribbon 7), so towers sank into decks and enemies walked buried in the track. Added a coarse height field stamped when the map mesh is built, and fed `groundHeightAt` to every actor draw — towers, recruits, modelled enemies, sphere enemies and the stand-in cylinder. | `10010214` 9/40 (1.13) | `33122235` 21/40 (2.63) | **improved** — verified on all six maps: enemies read ground 7 on the road, and 9.4 where sigil-lattice's road crosses a deck. Lookup costs **0.093 µs**, i.e. 0.006 ms/frame at 60 actors. Not passing: material still 1, because contact shadows themselves still do not exist — only half this group is done. |
| 3 | **G02** road mesh and edging | form, material | Both kerb quads in `GLGeometry.road` were wound with normals pointing inward, so with `CULL_FACE`/`BACK` every kerb was culled on every frame — the "raised ribbon with visible kerbs" in the file's own header had never rendered. Reversed both windings. | `3113--24` 14/30 (2.33) | `4323--35` 20/30 (3.33) | **improved** — a dark kerb band now reads at the road edge (luminance 36 against floor 41 and deck 71) and is unmistakable close up. Not passing: material still 2, `theme.roadEdge`/`roadCenter` still unused. |
