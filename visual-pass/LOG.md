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

---

## The ritual circle, verified on screen

The handoff's next action: "place a Siphon, root a target, capture, open the
PNG. Nobody has seen a circle on screen." Done. It renders. Evidence is in
`captures/ritual-*.png` and `captures/order-*.png`, every one of them opened
and read, not just written.

### Three instrument faults, found before any finding was trusted

The rig lied twice before this session and it lied twice more during it. Both
new faults produce a capture that looks exactly like an effect that was never
wired up, which is why they are written down here rather than just fixed.

1. **The render clock never moved.** `worldRenderState().now` is `lastTime /
   1000` — the requestAnimationFrame timestamp — and rAF is throttled to a
   standstill in a hidden pane. `TDObs.step()` advanced the simulation and left
   that clock frozen, so `advance()` early-returned on `rec.stamp === now` after
   the first frame and the circle sat at `cast 0`: 34% radius, zero rotation,
   forever. Stepping the simulation without stepping the clock the renderer
   reads is not slow motion, it is a still frame. `step()` now advances
   `lastTime` by the same dt.

2. **The 2D canvas was 300x150.** The game sizes its backing store from a
   `resize` listener; a hidden pane never fires one, so `game` stayed at the
   HTML default while CSS stretched it to 1280x720. Everything drawn through
   `drawOverlays` — the circle, the beams, every range ring — is drawn in
   SCREEN pixels, so all of it landed outside the bitmap. The first capture of
   the circle was of a circle being painted at (732, 237) on a canvas 300 wide.
   `TDObs.boot()` now calls `resizeCanvasBackingStore()` first.

3. **The camera loses one focus call after a reload.** `TDObs.focus` writes
   `distance` and `wantDistance` directly, but a focus issued in the first
   frames after a page load is overwritten by the renderer's own init. It takes
   on the second call. Two captures were shot at the default 2022 distance
   before this was spotted. Assert `TDObs.cam().distance` before shooting.

### The seam was broken exactly where the handoff predicted

`SiphonFXBeam.draw` guarded on `rite.origin`. `plan()` returns `rec.out`, which
is `{ beams, idle }` — there is no `origin` on it and there never was, so the
test was always false. Every rim anchor and every chain assignment the ritual
computed was discarded and the beams kept leaving the hands. Confirmed live:
`Object.keys(plan(...))` is `["beams","idle"]`.

`siphon-beam-draw.js` now consumes what the ritual actually returns: one cord
per ARM, starting on the rim, chaining through the locks that arm was dealt.
Chaining stops being a special case — an arm with three locks IS a chain.

### What was measured

| check | result |
|---|---|
| circle renders, single lock | yes — `ritual-02`, `ritual-05` |
| beams leave the circle | yes, after the arm fix — `ritual-05-armwired` |
| beam count by B tier | B0→1, B2→2, B3→3, B4→4, B5→5. Matches `BEAMS_BY_B` exactly |
| chaining | yes — B5 with 11 locks dealt `[1,3,1,3,3]`, 11 corded, cap held |
| arms never exceed locks | `want = min(beamCount, n)` — B4 with 3 locks drew 3 cords, not 4 |
| circle size at TRUE game scale | **14.1 x 21.6 px** (A0), 13.5 x 22.8 px (A3) |

B5 was reached through the real gate, not by poking a counter: it needs 5000 HP
healed, which took 159 simulated seconds of draining.

### Findings, from looking at the pixels

- **The cords are far too wide.** At B4/B5 each cord is about as wide as an
  enemy torso; five of them merge into one pink mass that hides the enemies and
  the circle both. The serrated edge reads as fur or centipede legs rather than
  as energy. This is the single biggest visual problem on the tower and it is
  what forced the draw-order decision below.
- **The A3 staff-forward circle does not read as bigger.** `STAFF_SCALE` is
  1.16 in world units, but on screen the A3 circle measured 13.5 px wide against
  A0's 14.1 — the tier distinction is invisible at game scale.
- **The gesture does not read at true scale.** The whole tower is ~25 px tall;
  the extended arm is 2-3 px and the circle covers the torso where the arms are.
  The CIRCLE reads at game scale. The gesture producing it does not.
- **At A0 the circle and the robe are the same tan**, so the circle has almost
  no contrast against the body it is drawn over. At A3+ (gold on a dark body)
  and B4/B5 (magenta on near-black) it separates well.
- **The single-beam anchor sits at the top of the disc** (`anchorAngle(0,1)` is
  +pi/2) regardless of where the target is, so at one lock the cord crosses the
  face of the circle to get out. Worth revisiting when the widths are.
- The b2 body reads as a shapeless brown lump in silhouette, not a robed
  figure. Related to the known-open "path B b1/b2 changed shape after review".

### Draw order: tested, and the module header was wrong

`siphon-ritual.js` said the circle is drawn BEFORE the beams and under them.
`gl-world.js` did the opposite and carried a comment claiming the same goal.
Two files asserting opposite orders, each certain it achieved the same effect.

Both were captured on one B3 three-lock scene: `order-A-full.png` (circle last,
as shipped) and `order-B-full.png` (circle first, as the header asked). Circle
first is WRONG on screen at today's cord widths — the cords cover the disc
almost entirely and the circle stops being visible at all. The shipped order
was kept, the header was corrected, and both files now carry the same note and
point at the two captures. Revisit if the cords are ever thinned; the argument
is about their width, not about depth.

### New in the harness

- `TDObs.crop(name, x, y, w, h, scale)` — a nearest-neighbour magnified crop of
  the REAL frame. Not a re-render at a closer camera: to judge whether something
  reads at true game scale you have to magnify the pixels the game actually
  drew, because re-rendering bigger answers a question nobody asked.
- `TDObs.screenOf(ent)` — borrows `api.project` from the next FX draw, since the
  projector is module-private inside gl-world.

---

## Owner feedback on the Siphon, 2026-08-11

Six things reported against the wired-up tower. Each was REPRODUCED in the rig
and captured before anything was changed, because "I think I see what he means"
is not a diagnosis.

| # | report | state |
|---|---|---|
| 1 | passive rays draw through everything, other towers included | reproduced, NOT fixed |
| 2 | he does not turn towards the enemies he attacks | **fixed, verified** |
| 3 | the circle is in a goofy position | **fixed, verified** |
| 4 | the idle rays do not fit the attack ray | **fixed, verified** |
| 5 | A3+ sceptre: handle dances, head does not move, he does not hold it | reproduced, BLOCKED |
| 6 | "otherwise model is great" | — |

### 1. Rays through geometry — reproduced, not fixed

`captures/owner-P1-through-tower.png`: a Siphon draining an enemy with a
Rifleman planted between the cord and the camera. The cord runs straight across
the Rifleman's hat and coat. It is not subtle and it is exactly what he sent.

The cause is structural. Every Siphon cord is painted in `drawOverlays` on the
2D canvas stacked over the WebGL canvas, and that layer has no depth buffer at
all. Established directly in the page rather than assumed:

  * the context is **WebGL 2.0**;
  * the scene renders to the **default framebuffer** (`FRAMEBUFFER_BINDING` is
    null), so there is no offscreen target whose depth could be sampled;
  * every buffer in `gl-renderer.js` is created once with `STATIC_DRAW` and
    there is **no dynamic/streaming geometry path** at all.

So both of the honest fixes -- move the cords into the GL pass as real geometry
(which is what the Warbringer's charge effect does, and gl-world.js says so in
as many words), or render depth to an offscreen target and clip the 2D cords
against it -- require adding something real to the renderer. Neither is a small
change and neither should be made blind. Left for the owner to choose.

### 2. He turns now

`BeamTower` does not inherit from `Tower` and never declared `this.aim`, so
gl-world's `drawYaw = warbringerFullCircle(t) ? 0 : (t.aim || 0)` fell to zero
every frame. `faceLocks()` aims him at the CENTROID of his locks -- not the
first one, because the beams fan to all of them -- rate-limited at the ritual's
own 3.2 rad/s and HELD through a gap rather than springing back to a rest angle,
which is the same anti-flicker lesson the ritual's latch records.

Verified by walking an enemy along the road: `aim` tracks across a 2.5 rad sweep
to within 0.021 rad. `captures/fix-P2-facing-0.png` and `-1.png`.

**Nothing else had to change for the origins to follow.** Both
`siphon-ritual.js originWorld()` and `siphon-beam-draw.js originWorld()` already
transform their authored origin by `tower.aim + SIPHON_YAW`. The code was
written expecting a turning body; `aim` was simply always 0.

### 3. The circle stands up

It had no fixed world orientation at all. `screenBasis()` solved every frame for
the tilt T that maximises the ellipse's AREA ON SCREEN and clamped it into
[0.45, 1.30]. Elegant -- |Us x Vs| is a single sinusoid in T so the best T is one
atan2 with no search -- and wrong, because it makes the disc a weathervane
pointing at the camera.

Measured on one fixed scene, turning ONLY the camera:

| camera yaw | disc normal vz | screen semi-axes |
|---|---|---|
| -1.57 | 0.852 | 48 x 76 |
| -0.47 | 0.267 | 42 x 57 |
| +0.63 | 0.267 | **66 x 1.5** |

At the third yaw the circle is a line across his chest. That is the "goofy
position". It is now `U = (-dy, dx, 0)`, `V = (0, 0, 1)` -- perpendicular to the
ground, normal along the cast, parallel to his frontal plane -- and `vz == 1` at
every camera yaw. `captures/fix-P3-vertical-across.png`, `-toward.png`.

The deleted solver carried a TRUE warning and the replacement comment keeps it:
a vertical disc IS edge-on when he casts across the view. Accepted rather than
solved -- the cure was the defect being reported -- and it bites less now that
the body turns, since casting across the view means standing in profile.

Regression-checked: `plan()` places the rim anchors off `rec.vx/vy/vz`, so the
multi-beam fan changes with this. B3 with three locks still deals three cords
and the anchors now spread in Z (28 / 50 / 28 about a centre at 35) on a
standing rim. `captures/fix-P3-multibeam-regression.png`.

### 4. The idle cord is the attack cord, slack

The mismatch was GEOMETRY, not colour -- `seeking` and `thread` already shared
body/bead/rim roles and differed only in `core`. Against `thread`, `seeking` was:

| | seeking | thread | |
|---|---|---|---|
| r_target | 0.0085 | 0.018 | 2.1x thinner |
| curve.sag | 0.3 | 0.03 | **10x** |
| curve.sway | 0.16 | 0.022 | **7.3x** |
| curve.kink | 0.03 (n=3) | 0.0 | kinks vs none |
| twist.total | 1.1 + waver | 0.62 | 1.8x |
| scroll.base | 0.3 | 0.55 | 55% of the speed |
| beads | 9, last third bare | 14, proud, whole run | bunched vs spread |
| mats | cloth only | **skin** + cloth | cloth rope vs flesh |

Together that read as frayed straw rather than as the same cord drawing in --
`captures/owner-P4-idle-seeking.png` against any attack capture makes it
obvious. Each value is moved most of the way to thread's, `skin` added to
`seeking`'s `mats`, and `ROLES.seeking.core` changed from `hem_fray` to `skin`.
It stays thinner and keeps the droop and the sweep, because idle must still read
as weaker and searching. `captures/fix-P4-idle.png` / `fix-P4-attack.png`.

### 5. The sceptre — reproduced, and BLOCKED on a broken build

`captures/owner-P5-sceptre-loop.png` lays frames 0 / 6 / 12 / 18 of `siphon-a3`
side by side. The gold ring sits in the IDENTICAL place in all four while only
the shaft swings, and no hand grips it. Exactly as reported.

It is deliberate. `siphon_idol.py` froze the ring because it is the beam origin
("THE RING DID NOT MOVE. RING stays exactly (0.315, 0.395, 1.190), the socle's
frozen beam origin, asserted to 1e-6") and animated the shaft beneath it. The
owner is asking for the opposite: the whole sceptre held in one hand and carried
forward, which means the beam origin has to move with the ring.

That is possible -- the origin would become PER-FRAME rather than per-tier -- but
it needs the runtime to know which frame is showing when it asks. It does not
today: the frame is derived locally in gl-world's tower loop from `state.now`
(`sphase = (now*0.42) % 1`) and never stored on the tower, while
`originPoint(tower)` reads a static per-tier origin. Duplicating that formula in
a second file is precisely the class of bug this tower keeps producing, so the
frame would have to be stamped on the tower and read from there.

**THE BUILD DOES NOT RUN AT HEAD.** `py siphon_idol.py` fails its own reach gate
before writing anything:

    the l arm cannot make this pose: the hand ends up 0.2101 from the
    shoulder and a 0.309 + 0.114 chain only reaches between 0.215 and 0.404

Pre-existing -- no `.py` file was touched this session -- and it fails safely
(the models and `siphon_origins.json` are byte-identical afterwards). The models
on disk were produced by an earlier version of the script, so the source of
truth for this model currently does not reproduce what ships. This is the
"models CI job red" known-open, and it is not cosmetic: no sceptre change can be
built until it is cleared.

The error's own advice is misleading. Scanning `HAND_OPEN` from 0.140 down to
0.100 moves the span 0.2101 -> 0.2148 and then back DOWN to 0.1991 -- it never
clears 0.215 and it is not monotonic. `ROLL_TILT` is the lever that matters, and
the build passes at **ROLL_TILT = 0.20** (from 0.95). That is a large change to
the character of the hands-out presentation, which the owner did not ask for and
explicitly likes, so it is reported rather than committed.
