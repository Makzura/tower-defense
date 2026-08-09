# Tower Defense — project context

**Version 0.5.0** — three thirty-five-wave campaign difficulties: the original
**Easy** schedule at 738 bodies / 13 498 effective HP, **Normal** at 851 /
22 369, and **Hard** at 962 / 30 911. All can be won or lost and end on a boss.
A **nineteen**-type enemy roster (swarms, armor, camo,
an early midboss, one that attacks your towers, one behind a shield that
doubles its speed when the shield breaks, one that gets back up once, a spawner
whose brood is shielded and pays nothing, and the Tyrant at wave 35). Fourteen
types remain on Easy; **all nineteen appear on Normal and Hard**, including
the four v0.4.9 additions and the flying Aether Wisp imported from v0.4.10.0.
**A shield now pays nothing, ever**, and so does healed health;
waves
that mix three or four types at once; a clear bonus of a tenth of each wave;
**six decorated maps** — the four authored routes plus deterministic Shifting
Ley and two-entrance Twin Confluence, each with its own non-interactive
procedural scenery;
**four towers in five build slots** — Warbringer, Arcane Sniper, Siphon and the
 Rifleman, the $300 burst-fire/automatic starter unit (three were renamed
and redrawn on 2026-07-30 for a robot fantasy/magic theme, and the Siphon was
renamed to "Siphon" and back again the same day; **the code still uses
the old names for files, ids and constructors** — see the "Tower names" section
for the mapping and why). **The GUNNER was deleted on 2026-07-30** at the
owner's instruction; `js/tower.js` is still loaded, and only as the shared
footprint/hit-test source and the 100 u.l. reference — see the banner at the top
of that file. Towers
that have hit points, die at zero, and can be stunned; meta coins that
persist between runs and buy towers in an armoury; a title menu (with an Escape
pause menu mid-run); an index screen documenting every tower, upgrade and
enemy; and player-controlled pacing — a 1×/2×/3× speed toggle, a ten-second
pause before wave 1 with a Start button on it, and a between-wave break that
arrives three seconds after you call it in, five after you clear the board, and
ninety if you do neither. See the change log.

**Do not retune the schedule by simulation.** The owner asked for that to stop
on 2026-07-29; its totals are authored to a stated figure. See the note at the
end of the `WAVES` comment in game.js.

(The folder is `TD_0.5.0` and the version above matches it. The two have
drifted twice before — the header said 0.4.7 against a 0.4.9 folder until
2026-07-30 — which is exactly the failure earlier entries in this file record.
The game's version is the one that counts, and nothing in the code encodes it,
so this line and the header are the only places it lives.)

A 2D tower defense game. Long-term goal is a Steam release. Right now it is a
deliberately minimal foundation: correct mechanics, and the first content on
top of it.

Read this before changing anything. The constraints in it are not stylistic
preferences — several are the reason the project runs at all.

---

## Keep this file current

**Every change to the game must be reflected in this document, in the same
edit that makes the change.** Not afterwards, not "later" — the doc going stale
is how a future session ends up acting on facts that are no longer true.

Specifically, when you change something:

- **A constant changed?** Update the Current Values table below.
- **A file added, removed or renamed?** Update the Architecture file map.
- **Something from "Deliberately out of scope" got built?** Remove it from that
  list and describe it where it belongs.
- **A new rule, invariant or gotcha?** Write it into the relevant section. If a
  future session could plausibly break it by accident, it belongs here.
- **Any change at all?** Add an entry to `CHANGELOG.md`, with the date, what
  changed, and *why*. The why matters more than the what — the code already
  shows what.

If a change makes something in this file wrong, fix the wrong part. Do not
append a correction and leave the stale text sitting above it.

**The change log lives in `CHANGELOG.md`, not here** (moved 2026-08-09). It had
grown to 3 800 lines — half this file — and burying the rules under every
decision ever made is the same failure this section opens by warning about, one
level up: a document too long to finish is a document nobody follows. This file
is what is TRUE NOW. That one is how it got that way.

Recording a change is still mandatory, and an entry that notes a new invariant
without writing the rule into this file is exactly how the two drift apart.

---

## How to run and test

**Run the game:** open `index.html` in a browser. That is the entire build
process. No server, no bundler, no install step.

**Test a change:** save the file, press Cmd-R in the browser.

**Testing anything VISUAL:** the suites cover simulation, not pictures. A
rendering change is verified by driving the real game in a browser and reading
the result back — sample the canvas with `getImageData` and compare against the
authored colour, or read the GL framebuffer with `readPixels` and diff two
states. Every rendering claim in the change log below was settled that way, and
several "obvious" visual tests turned out to prove nothing (see the map-fixed
note in the 2026-08-09 entry). Do not accept a screenshot glance as proof.

**Run the test suite:** all five, none of which import each other. These are the
current measured results after the 2026-08-05 enemy-model/shield pass:

```
node tests/run.js                 105 pass / 3 fail   core game and difficulty
node tests/content.test.js        182 pass / 30 fail  content, visuals and index
node tests/long-range-dps.test.js  70 pass / 1 fail   the Longshot spec
node tests/beam.test.js            45 pass / 0 fail   the beam acceptance list
node tests/sandbox.smoke.js       2 failures          sandbox integration
```

The failure groups are unchanged from the checkout baseline. The extra two
core passes and four content passes cover B5's fourth-round impact, moving
channel lock, resolution-frame aim freeze, adapter stun mirroring, Siphon's
hidden beams while stunned, and live base/shield enemy-sheet selection with
segmented field continuity. The three core failures, the Longshot
failure, and both Sandbox failures are the same Arcane-Sniper B5 ability/effect
timing drift already present in the checkout. The content suite includes that
group plus older schedule, boss, price and test fixture drift. Known examples:

- `content.test.js` — four boss/stun tests (`a stunned tower goes completely
  silent`, `the Tyrant's aimed shot…`, `the leap jumps 50 u.l.…`, `after the roar
  it alternates…`) throw **`ReferenceError: w is not defined`**. `w()` is a
  world-coordinate helper defined in `tests/run.js` only; these tests were
  copied across without it. A pure test-file bug — the mechanics themselves are
  fine, and the sandbox exercises them.
- `content.test.js` — `the roar shields it…` expects the boss to shoot every
  1.75 s off a 3.5 s base. The shipping boss is 8 s before the roar and 6 s
  after, which is what this document and the owner's correction describe, so the
  **test** is stale, not the boss.
- `content.test.js` — `the enemy tab covers the roster…` expects a stock normal's
  late-wave ceiling to be 18 and derives 27. A codex/schedule question, untouched
  here. (Its three *bounty* assertions in the same test did break on 2026-07-30 —
  codex bounties are `health × CASH_PER_DAMAGE` — and those were updated to
  derive from the constant, so this test now fails on the ceiling alone, exactly
  as it did before the revamp.)
- `run.js` — `a mixed wave deploys its groups in order` expects 36 bodies across
  three groups and finds 44 in two. A wave-schedule assertion; the schedule was
  out of scope on 2026-07-30, so it was left exactly as found.

Fixing those is a separate job from anything the economy touched.

**This has bitten before, and badly.** v0.4.5 and the first half of v0.4.6 were
also written without Node and never run; when the suite was finally executed it
reported **118 failures**. Almost all of them were the harness or the fixtures
rather than the game — see the change log — but the lesson is the one this file
keeps repeating: untested is not the same as working, and two of those failures
were real bugs that the browser could not show you.

**What v0.4.7 did instead**, since it could not run the suite: it loaded the
real game in a browser and drove the real `update()` from the console — every
new mechanic exercised by hand, every constant the new tests assert read back
off the running build, and the whole campaign simulated on all four routes
under three building policies (the figures are in the `WAVES` comment). That is
a good substitute for the *balance* work and a poor one for the suite. The new
tests are written and believed correct; they are not yet proven.

**Run all five before believing a change is done.** Together they take roughly
25 seconds on the bundled Node runtime.

No install, no dependencies — the suite uses only Node's built-in
`fs`/`path`/`vm`. This does not break the no-toolchain rule: the tests need
Node, the *game* still needs nothing but a browser.

**Use it instead of a browser.** It boots the real game against a stubbed
canvas and drives it through real entry points — the actual click handlers,
the actual `update()` — so passing there means the browser behaves the same.
Checking a change by clicking around in Chrome is slower, and it cannot see
the things that actually matter here (wasted shots, leak counts, claim leaks).

Reach for the browser only for what the harness genuinely cannot judge:
whether something *looks* right, and the DOM debug panel.

**Still do the arithmetic.** Verify numeric changes by reasoning through the
maths (see Balance math below) before assuming a playtest told you anything —
the eye cannot distinguish 53 kills from 55, and balance problems in this genre
hide in exactly that gap.

Things to know if a test misleads you:

- `tests/harness.js` reads the script list **out of `index.html`**, so a new
  game file is picked up automatically. It skips `js/debug-*.js`.
- A hidden browser tab pauses `requestAnimationFrame` entirely, so the canvas
  freezes and nothing simulates. That has fooled a debugging session before —
  if the game looks dead in a background tab, it is not a bug.
- **The harness's `window` is a stub, and it is NOT the global scope.** It
  carries `addEventListener` and `document` and nothing else, so game code that
  reaches for `window.Something` to find a top-level `function Something(){}`
  finds `undefined` in Node while working perfectly in a browser. Reach for
  **`globalThis`** instead — it is the real global in both. This cost 110 test
  failures once (`MetaProgress.constructorOf`, 2026-07-29).
- **`h.place()` returns the tower placed, or `null` if the placement was
  refused.** Not the last element of `towers`: that array is kept sorted by
  `pathProgress`, so a tower placed earlier along the road lands in the middle
  of it. A `null` back almost always means the tower was unaffordable — most
  fixtures need `h.run("cash = 100000")` *before* placing anything but a gunner.
- **Throughput measurements must call `h.pinWaveBreak(5)` first.** The shipping
  break is 90 s (see Waves below), so a 120 s window otherwise contains one wave
  and a minute and a half of empty road. Wave spacing is a pacing choice the
  player makes and is orthogonal to what those tests measure; pinning it keeps
  their figures comparable with everything recorded before 2026-07-29.
  `h.stepCallingWaves()` is the other tool — it calls every break in, for tests
  that need to *reach* the end of the schedule rather than measure a rate. Note
  that since v0.4.7 a called break is 3 s rather than one frame, so a fixed
  second budget for "play the whole campaign" is fragile; loop until victory
  with a generous cap instead (the victory test does).
- **An empty board now calls the next wave in** (v0.4.7). Any fixture that
  wants to sit in a 90 s break needs something still on the board, or the wave
  arrives five seconds later (three, until 2026-07-31). Rooting one enemy
  (`enemies[0].rooted = true`, the same flag a revived Revenant sets) is the
  cheapest way to hold it.
- **`boot(mapId)` starts the run for you, skipping the ten-second opening
  pause** (2026-07-31 — see "A run opens on a pause" under Waves). So `t=0` in a
  test still means "wave 1's first body is on the road", which is what every
  fixture written before that date assumes. To see the REAL opening, click
  through it: `boot(null)` then `h.chooseMap(...)`.
- **`h.step()` cannot see `gameSpeed`**, by design: speed lives in `frame()`,
  and `step()` drives `update()` directly. Use `h.wallClock(seconds)` to go in
  through the real loop.

---

## Hard constraints

These come from the owner's requirements, not from taste. Breaking any of them
breaks the project for him.

**No software, no toolchain.** He works on macOS, edits files in a plain text
editor, and refreshes a browser. Do not introduce npm, a bundler, TypeScript,
a dev server, a framework, or a build step of any kind.

**Must run from `file://`.** The game is opened by double-clicking a local
file. Two consequences:

- **Classic `<script>` tags only. Never `type="module"`.** Browsers block ES
  modules over `file://` for CORS reasons, and the game will silently fail to
  load. This is why every file uses old-style globals and `function`
  constructors rather than `import`/`export`.
- **No `fetch`, no `XMLHttpRequest`, no external asset loading.** Also blocked
  over `file://`.

**Everything is drawn procedurally.** No images, no audio, no font files. Each
entity has a `draw(ctx)` method using canvas primitives. This is what lets the
game run from a bare folder. If art is added later, keeping this property will
need real thought — probably inline SVG or base64 data URIs.

**Keep `update()` free of DOM access.** Simulation and rendering stay separate.
Any future replay, fast-forward, or headless balancing work depends on it.

---

## Architecture

```
index.html          loads the scripts in order; order matters. Since
                     2026-07-28 it loads the SAME tower/systems block as
                     sandbox.html -- the two lists must stay identical, or
                     the sandbox stops being a truthful preview of the game
js/units.js         UNIT_LENGTH + ul(): u.l. -> pixels (must load first)
js/path.js          GamePath: polyline, length, sampling, distance queries,
                     and tangentAt (the road's heading, for lane offsets)
js/targeting.js     WHICH enemy to shoot: the six modes, TowerScore, and
                     Targeting.sees (the camo/flying rules for flat towers:
                     gunner, smasher, Soldier and its recruits)
js/maps.js          four authored maps plus two deterministic generated maps;
                     multi-route normalization, derived difficulty, and
                     themed non-gameplay sci-fi environments
js/enemy.js         Enemy: the nineteen-type roster, movement, lane offsets,
                     health, armor/defense, camo, flight, per-type sprite size,
                     timed slows, hover hit test, damage reporting
js/bullet.js        Bullet (homing) + PierceBullet (straight line, pierces)
js/systems/tower-stats.js  the ONE vocabulary every tower reports its numbers
                     in: damage, range, attack speed, DPS, lifetime totals
js/systems/tower-health.js towers have HP and DIE at zero. init/damage/
                     isDestroyed/mirror, shared by all four types
js/meta.js          MetaProgress: coins, owned towers, the equipped loadout,
                     and the only thing in the game that is SAVED
js/store.js         the armoury screen (screen === "store"): a Store tab that
                     sells towers for coins and an Inventory tab that edits
                     the build bar. Derives everything from meta.js and each
                     tower's own statLines/drawIcon, like js/codex.js
js/tower.js         Tower: targeting, fire rate, footprint, cost
js/smasher.js       Smasher: melee AoE, two upgrade branches, Path A's
                     multi-frame forge-slam, slow, the CHAINING blast, and
                     B5's map-wide earthquake
js/soldier.js       Soldier: the $300 burst/automatic starter, two upgrade
                     branches, and SoldierRecruit -- stop-to-shoot walking
                     units B4 calls in and B5 strengthens; NOT towers
js/effects.js       cosmetic feedback: death bursts, cash popups, base-hit
                     flash, wave banner, earthquake camera shake and temporary
                     floor fissures. Presentation ONLY -- the simulation never
                     reads anything back out of it, and every reference to it
                     is typeof-guarded (sandbox.html loads it too, but nothing
                     may require it)
js/visual-models.js presentation-only registry for replaceable renderers,
                     measurements, still sprites and directional sprite sheets
js/visuals.js       the built-in three-quarter drawing vocabulary and fallback
                     models; simulation never reads anything back from it
js/skins/draw-pack.js the shipped Blender art pack: planted Normal, Swarm,
                     Brute and Hive walks with live shield variants; every
                     legal Arcane-Sniper composite; custom grounding, snapped
                     per-group FX anchors and live A5 stack tally
assets/*.png        loose runtime sprite sheets. They deliberately load through
                     Image() so double-clicked file:// play still works
assets/preview/*.png four-angle model review sheets; output, not source
js/gl/gl-renderer.js the dependency-free WebGL renderer: one flat-shaded
                     program, linear lighting converted to sRGB once on output,
                     and a per-vertex emission channel driven by `uGlow` so a
                     weapon's own coils and aperture light up
js/gl/gl-camera.js  OrbitCamera: middle-drag orbit about the cursor, right-drag
                     pan, wheel zoom-to-cursor. Owns `viewport` (the game's
                     logical 1280x720 space) and the projection cache
js/gl/gl-math.js    perspective, look-at, one multiply, ray/plane. Column-major
js/gl/gl-geometry.js procedural primitives: ground, road, box, sphere, cylinder
js/gl/gl-models.js  the model registry the generated js/gl/models/*.js register
                     into; expands per-triangle data to per-vertex once, lazily
js/gl/gl-parts.js   which parts of a model are bolted to the MAP rather than to
                     the tower, recovered from the geometry for models exported
                     before export_mesh.py learned to emit a `world_fixed`
                     group. See "Building a model that looks like the ones that
                     already work"
js/gl/gl-world.js   the world renderer: map mesh, actors, the projected overlay
                     layer (range, cones, bars, chambers, stun, projectiles,
                     impacts) and `screenToWorld`. The two seams game.js uses
js/gl/models/*.js   GENERATED geometry, one classic script per model. Do not
                     hand-edit; re-run tools/blender/export_mesh.py
tools/blender/td_scene.py shared offline camera/light/material/render pipeline;
                     fixed 0.86 ground pivot, parallel-safe scratch frames,
                     paged atlases and 3 px edge audit
tools/blender/enemy_normal.py, enemy_swarm.py, enemy_brute.py, enemy_hive.py,
                     tower_sniper.py, tower_rifleman.py and summon_recruit.py
                     are authoritative model/animation sources, including
                     shield hardware and world-fixed final-tier foundations
tools/blender/export_mesh.py Blender -> js/gl/models/*.js. Groups geometry by
                     animated ancestor, and by `_world_fixed_child` for
                     anything bolted to the map
tools/blender/td_mesh.py the same primitive vocabulary WITHOUT Blender, emitting
                     export_mesh's exact contract. Geometry is authored in WORLD
                     space here and `parent` picks the animated group -- it is
                     not a second transform. Use it when a model needs no sprite
                     sheet; use Blender when it does
tools/blender/tower_warbringer.py path A, four bodies, built through td_mesh.
                     `python tools/blender/tower_warbringer.py` rebuilds them
                     and prints the weapon-to-body clearance per frame
tools/blender/make_preview.py regenerates review sheets and inspectable .blend
                     files under tools/blender/preview/
tools/blender/WARBRINGER_CONCEPT.md the design the Warbringer will be built
                     from, plus the shortlist of the next five enemies
tools/torn.js       `node tools/torn.js` -- flags any ground prop that is
                     frozen by HALVES. Run it after touching gl-parts.js
tools/fixed-list.js `node tools/fixed-list.js <model>` -- lists the solids a
                     model classifies as map-fixed, with their bounds
tools/check-parts.js one-line summary per model: fixed tris, emissive tris,
                     and the bounding box of everything held still
js/codex.js         the index screen (screen === "index"): the tower/enemy
                     field guide. DERIVES everything it shows -- tower stats
                     from statLines(), the upgrade tree by walking each path
                     on a throwaway instance through panelActions(), enemies
                     from Enemy.TYPES + DIFFICULTIES -- so it cannot go stale
js/game.js          setup, map chooser, waves, victory/loss, base HP,
                     placement, main loop, all drawing
js/debug-cash.js    TEMPORARY debug panel -- delete before release
tests/harness.js    boots the game in Node against a stubbed canvas
tests/assert.js     minimal test runner, no dependencies
tests/run.js        the test suite (the original gunner/wave game)
tests/content.test.js  the content suite: enemy types, targeting modes, the
                     smasher, per-tower scoring, hover, maps and the chooser
README.txt          player-facing notes, written for the owner
MODEL_SKINS_GUIDE.md public contract for replacing presentation assets safely
AGENTS.md           THIS FILE: what is true now. The one to read first
CHANGELOG.md        how it got that way. History only -- no rules live there
CLAUDE.md           a pointer to this file, kept deliberately thin

-- Longshot: the first tower with an upgrade tree. See "The Longshot tower"
   below for why this is a separate, parallel system rather than a change to
   the files above.
js/towers/long-range-dps.config.js   Longshot's stats/upgrades/flags -- pure data
js/towers/tower-runtime.js           ConfiguredTower: generic runtime for ANY
                                      tower built from a config shaped like
                                      the file above
js/systems/stat-resolver.js          base + purchased-tier deltas -> resolved stats
js/systems/crosspath.js              the tier-3-locks-the-other-path-at-2 rule
js/systems/range-filter.js           IS an enemy within reach: circle/cone/
                                      deadzone/camo/flying filtering. Named
                                      RangeFilter, not Targeting -- js/targeting.js
                                      answers the different question of WHICH
                                      reachable enemy to shoot
js/systems/targeting.js              gone; the file is a MOVED notice only
js/systems/pierce.js                 pierce falloff formula (spec 5.1)
js/systems/execute.js                execute-bonus formulas (spec 5.4, and B2's
                                      tentative flat predecessor)
js/systems/damage-pipeline.js        crit -> execute -> pierce resolution order
js/systems/buff-stacks.js            generic timed-stack tracker (kill-stack atk speed)
js/systems/reload.js                 shot-counter reload tracker
js/systems/active-ability.js         B5's nuke: AoE, stun, permanent HP loss
js/towers/longshot-adapter.js        LongshotTower: gives ConfiguredTower the
                                      constructor interface js/game.js expects

-- Beam tower (tower_beam) and the global systems it needed.
js/systems/mitigation.js             armor THEN defense, global, no damage floor.
                                      Takes defPierce (percent, off defense) and
                                      armorPierce (flat, off armor) -- separate,
                                      neither touches the other's stat
js/systems/ramp.js                   per-target damage ramp
js/systems/charge-gold.js            damage -> charges -> gold multiplier
js/systems/gold-power.js             the player's bank -> AD and gold scaling
js/systems/death-denial.js           the one-per-game save, and its knockback
js/systems/healing-ledger.js         run-wide pool of HP healed (gates B5)
js/systems/upgrade-effects.js        deltas + grants -> the one-line description
                                      an upgrade button shows before purchase
js/systems/auto-ability.js           shared OFF-by-default switch for the
                                      Rifleman's recruits and Sniper's B5 nuke
js/towers/beam.config.js             tower_beam's stats/upgrades/mechanics -- pure data
js/towers/beam-adapter.js            BeamTower: the continuous-beam runtime
sandbox.html                         SANDBOX MODE -- the real game plus infinite
                                      cash, on-demand spawning, every tower type,
                                      the Easy/Normal/Hard schedule picker, and
                                      the u.l. debug overlay
js/sandbox/sandbox.js                that page's wiring and schedule controls
                                      (hooks game.js, never edits it)
tests/long-range-dps.test.js         54 tests -- run standalone, not part of run.js
tests/beam.test.js                   42 tests -- the beam spec's acceptance list
tests/sandbox.smoke.js               boots sandbox.html against a stubbed DOM
tools/price-upgrades.js              the DPS model behind the upgrade prices
                                      (not loaded by the game or the suite)
tools/simulate-campaign.js           plays the scripted waves through the real
                                      game under scripted building policies;
                                      the arithmetic behind the schedule
                                      (not loaded by the game or the suite)
tools/measure-starter-kit.js         does the STARTER kit still lose? Added
                                      2026-07-29 because the Soldier put camo
                                      detection on the starter bar for the
                                      first time, which is the premise the
                                      whole meta-progression loop rests on
                                      (not loaded by the game or the suite)

-- superseded, safe to delete (see the banner in the HTML):
long-range-dps-debug.html            old static test bench, replaced by sandbox.html
js/scene/long-range-dps-scene.js     its wiring
tests/long-range-dps-scene.smoke.js  its smoke test
```

There is also a `windows (not needed on mac)` folder containing a launcher
executable. It is irrelevant to development; ignore it.

`js/game.js` is organised into marked sections: setup (`init`), input, the
loop, and rendering. Keep new code in the right section. The build bar lives
across input (`slotRect`, `slotAt`, `onClick`, `onKeyDown`) and rendering
(`drawBuildBar`, `drawInspection`) — hit-test geometry and draw geometry both
come from `slotRect`, so the two can never disagree about where a slot is.

Data flow worth knowing: `Bullet.update()` **returns the damage it landed**,
and the main loop turns that into cash. Nothing uses global mutation for
scoring. Keep it that way.

A bullet also **claims damage on its target while in flight**, which is what
stops two towers wasting shots on the same enemy — see Target claiming below.
That claim is the one piece of cross-entity state in the game, and it is
strictly paired: reserved in the `Bullet` constructor, released when the
bullet dies.

---

## Waves, base health, loss, victory, and restart

`EASY_WAVES` in `game.js` is the original finite enemy schedule, unchanged.
`DIFFICULTIES` owns the three selectable schedules, and `WAVES` is the active
run's compatibility reference. `setDifficulty(id)` is the one place that moves
that reference; do not copy a selected schedule into a second run-state array.

Each wave entry supplies `count`, `interval`, and optionally a `type` (a row of
`Enemy.TYPES`; missing means a stock normal) and a `health` override. A wave's
first enemy spawns immediately; `interval` is the delay between later enemies
in that wave. When a wave's last enemy spawns, the `WAVE_BREAK` countdown
begins. The next wave starts when that countdown reaches zero.

**The three campaign difficulties were added 2026-07-30:**

| tier | waves | scheduled bodies | effective HP | authored pressure |
|---|---:|---:|---:|---|
| Easy | 35 | 738 | 13 498 | the original schedule, byte-identical |
| Normal | 35 | 851 | 22 369 | 8% more bodies, 15% more health, 16% tighter intervals, five roster additions |
| Hard | 35 | 962 | 30 911 | 20% more bodies, 35% more health, 32% tighter intervals, repeated support threats |

Normal and Hard are built from Easy's proven spine by
`buildDifficultyWaves(tuning, additions)`. The transform is deterministic and
authored, not simulated. Health/count increase the workload; interval/lead
compression and the supporters are the important difficulty levers because
they do not simply pay for their own answer through damage income.

**All five formerly sandbox-only types appear in both Normal and Hard:**
Aether Wisp, Shieldbearer, Healer, Vanguard and Camo Heavy. Normal introduces
each once; Hard repeats support enemies and brings Vanguard into the finale.
Camo Heavy is added only to already-pure camo waves. That preserves the
Warbringer collateral rule below.

`selectedDifficultyId` and the active `WAVES` reference survive
`restartGame()`: Restart means replay this route and difficulty. Choosing
another difficulty through the run chooser calls `setDifficulty` before the
route starts. Difficulty is not saved to `MetaProgress`.

**A wave may be MIXED** (2026-07-29, v0.4.7, at the owner's request — "make the
wave a bit more chaotic, still deterministic but with more than 1 type"). In
place of the flat fields a wave may carry `groups: [...]`, a list of groups
each with its own `count`/`interval`/`type`/`health` and an optional `lead` —
the pause before that group's first body, used instead of its `interval`. The
groups deploy in order, so a wave reads top to bottom as the thing the player
watches arrive.

**The flat form is not legacy, it is the single-group case**, and half the
schedule still uses it deliberately: a wave of one type is a question with one
answer, and those are what teach the game. `waveGroups(wave)` is the ONE place
the two forms are reconciled — it returns `wave.groups` or `[wave]` — and
nothing else in the game reads `wave.count` or `wave.type` directly.
`waveCount`, `waveGroupAt` and `waveSummary` are built on it, and so is the
index screen's per-type "appears in waves N, M" list.

**CAMO WAVES ARE NEVER MIXED, and that is a rule about the Smasher.** Its swing
damages whatever it physically reaches, camo included; it simply will not
*turn* towards something it cannot see (see the camo table under Content). With
one visible enemy in a camo wave a detectionless Smasher starts swinging and
takes the camo down as collateral, and the whole buy-detection check the
schedule is built around quietly evaporates. A test pins it.

**The break is 90 seconds, and three things end it** (2026-07-29; it was 5 s,
then 90 s with an instant skip). Ninety seconds is thinking room — long enough
to walk the board, read a panel, compare two upgrades on their hover cards,
which is where the game is actually played. Ending it:

- the **90 s running out**, which spawns the wave on the spot;
- the **Send next wave** button under the wave readout;
- **the board going empty** — every enemy from the last wave dead or gone.

The last two do not spawn immediately, and **since 2026-07-31 they no longer
put the same number on the clock**, both through `callNextWave(delay)`:

| ending the break | delay | why that number |
|---|---|---|
| Send next wave (button, auto-send) | `WAVE_CALL_DELAY` = 3 | a wave that appeared on the frame of the click gave the player no moment to look up from what they were reading |
| the board going empty | `WAVE_CLEAR_DELAY` = 5 | the owner's *"once all the enemies of a wave have been killed, if not on auto skip, leave a 5 seconds delay until the next wave"* — the only pause a *winning* player gets, and nobody asked for it, which is why it is the longer of the two |
| **Start wave 1** (the opening pause only) | 0 | a button that says Start starts; there is no board to look up from yet |

**"If not on auto skip" needs no branch anywhere**, and that is the point of
the `Math.min`: auto-send calls every break in at three, three is closer than
five, and a call may only ever bring the next wave CLOSER. So the toggle keeps
its three-second cadence through a cleared board without the clear path knowing
the toggle exists.

**`callNextWave` uses `Math.min`, never assignment.** A call may only ever
bring the next wave CLOSER; with two seconds left, calling it in must not push
it back out.

**What the board-clear trigger does to the 90 s break is worth being explicit
about.** On a board that is killing everything, almost every break is now five
seconds. The long break has become a floor under a board that is *losing* —
with something still walking you get as long as you need — rather than a
standing pause. That is the trade the owner asked for. Measured consequence: a
winning run takes about 730 s of wall clock instead of about 3100 s.

### A run opens on a pause, not on a body

2026-07-31, at the owner's request: *"when starting a run, do not send the first
wave immediately, either wait 10 seconds, or the user can press a start button
manually."* `RUN_START_DELAY` = 10, in `restartGame()`.

**What this replaced is the interesting part.** `restartGame()` used to end with
`waveCountdown = spawnScheduledEnemy()` — it deployed wave 1's first enemy
*itself*, on the frame the map card was clicked, which made it the only place
outside `updateWaves` that ever spawned anything. The run began with a body
already walking and a player still reading the board.

**Wave 1 is now an ordinary wave, and that is the whole design.** The opening is
a plain countdown handed to the ordinary scheduler, not a fifth screen state or
a "not started yet" mode, so it inherits everything a break already has: the
readout counts it down (*"Wave 1 in 10 s"*), the Send button is up, auto-send
sends it, the pause key pauses it, and towers can be placed the whole time. Two
consequences that had to be handled explicitly:

- **`betweenWaves()` lost its `waveIndex > 0` guard.** That guard existed only
  because a run used to start with `waveCountdown` at 0 and wave 1 already
  spawning, so there was no break there to describe. Now there is. `beforeFirstWave()`
  is the new predicate, and it is needed in exactly two places: the button's
  label, and the zero delay.
- **The board-clear trigger needs `!beforeFirstWave()`.** An empty road is
  precisely what a run starts with, so without it the clear branch reads the
  untouched map as a wave the player just beat and cuts the ten seconds to five
  on the first step. A wave has to have *happened* for clearing the board to
  mean anything.

**The Start button is the Send button.** Same rectangle, same handler, same
thing — bring the next wave in early — and the only honest difference is that
before wave 1 there is no wave to be "next", so `waveSkipButtonLabel()` says
*Start wave 1*. A second button would have been a second rectangle to place,
hit-test, draw and hide in order to say what that one already says.

**The sandbox does not inherit the pause.** It is a workbench; you do not reset
one in order to wait on it. `js/sandbox/sandbox.js` zeroes the countdown in both
of its restart paths, deliberately.

**The test harness does not inherit it either**, for the same reason it pins the
90 s break: `boot(mapId)` runs the game's own `spawnScheduledEnemy()` once, so
every test written against "t=0 is wave 1 on the road" still measures what it
was written to measure. A test that wants the real opening takes the genuine
path — `boot(null)` then `chooseMap(...)` — which four of them do.

`skipNextWave()` is kept as the button's name for `callNextWave()`, because the
button, the auto-send toggle and several tests all speak in terms of skipping.

**`autoSkipWaves` is the standing version of that button** (also 2026-07-29, at
the owner's request): with it on, `updateWaves` calls `skipNextWave()` every
step, so each break is called in the frame it opens and the campaign runs
unattended. Since v0.4.7 that means a three-second break rather than a
one-frame one, which is deliberate — it goes through the same `callNextWave()`
the button does, and that shared path is the point. Two things about the wiring:

- **It goes through `skipNextWave()`, not through its own countdown poke.** So
  it inherits the "only ever ends a break" guard, and in particular it can
  never compress the `interval` *within* a wave — that would be rewriting the
  schedule rather than its pacing. A test pins it.
- **Its toggle lives in the bottom-right corner beside the speed button, not
  beside the skip.** With auto-send on a break lasts three seconds, so a toggle
  drawn only during breaks would be a control the player has three seconds at a
  time to find. It has to be on screen all run, and a permanently live button
  means a permanently dead patch of map under it, so it goes in the corner where
  this game already keeps that cost. It also belongs with the speed control on
  the merits: both are "how fast does my run go", both outlive a restart,
  neither is run state.

**Lengthening the break costs nothing, which is why the ceiling is 90 and not
15.** Income is a fixed bounty paid once per kill and never a trickle
per second, so idle seconds earn exactly nothing: the break cannot be farmed,
only used or skipped, and no number in Balance math is a function of wall-clock
time.

Three rules keep the call honest:

- **`betweenWaves()` is the one condition**, read by the click handler, the
  drawing, the board-clear check and `callNextWave()` alike. The button
  therefore cannot be drawn where it is not clickable, or — the nastier
  direction — sit live over open ground all run swallowing clicks meant to
  place a tower there.
- **`callNextWave()` shortens the countdown; it does not spawn.**
  `updateWaves()` stays the only thing that ever deploys an enemy, so there is
  no second path for `allWavesDeployed` or the wave banner to get wrong.
- **It only ever ends a break.** Called mid-wave it does nothing, or a player
  could pile the whole schedule onto the board at once.

The board-clear check lives in `update()` immediately after the dead/leaked
filter, because that is the one moment the enemy list is authoritative:
everything that died this step is out of it and nothing new has spawned.

Note that calling waves in back-to-back is *harder* than letting them space
out — the same enemies arrive in one clump, and a tower that shoots one at a
time kills fewer of them. A wave says how many, how often and which type —
**never how tough**: health comes from the type unless the wave (or one of its
groups) carries a `health` override, resolved through `Enemy.healthOf`, the
same resolver the spawner uses.

**Easy is thirty-five waves, 738 enemies, 11 747 scheduled HP**
(2026-07-29, v0.4.7; it was 33 waves and 4308 HP, before that 20 waves and 3094,
before that two waves and 52). Scheduled HP is no longer the whole story, so
two more numbers matter:

- **13 498 EFFECTIVE HP on Easy** — what the player actually has to remove, and the
  owner's target ("make it so that the total is like 13500 hp", 2026-07-29). A
  shield is health you must chew through and a Revenant is two bodies, so
  effective HP is `count × health × (1 + shieldRatio) × (1 + revives)` per
  group — `waveEffectiveHealth` in game.js is the one implementation, and the
  clear bounty reads the same function. Everything the schedule *names* pays,
  so this is also the run's lifetime purse.
- **Plus two amounts no table can state**, both decided by how the run goes.
  Every seven seconds a living Hive drops five hatchlings, each with a shield
  equal to its own life and each paying nothing — about 160 points of unpaid
  effective health per Hive that survives thirty seconds. And the wave-35
  boss's roar calls in another 274 HP at 1.5× speed. Neither is a gap in the
  arithmetic; both are the point of the enemy that produces them.

On top of that, **finishing a wave pays a tenth of it** — about $1350 across
an Easy run. Normal and Hard derive the same per-wave rule from their larger
waves. See "Finishing a wave pays a tenth of it" below.

Easy waves 1–10 are the introduction and are pinned exactly: single-type, no
`groups`, no v0.4.7 content, with waves 1–2 byte-identical to the original
opening the starting-stake economy is measured against.

**Overriding health rather than adding tougher enemy TYPES is deliberate.** A
type is a balance decision the owner makes; late-wave scaling is the same
enemies turned up. It also keeps `Enemy.TYPES` the single place a *type's*
toughness is written down. Note the override touches **health only** — a scaled
brute still carries its 5 flat armor, a scaled camo is still camo, and a scaled
Bulwark still gets twice its *new* health in shield, because the shield is
sized off the instance rather than declared as a number.

**Every wave must be claimed by a type, and Normal/Hard must cover the whole
roster** (revised 2026-07-30). The index derives each type's appearances per
GROUP across all three `DIFFICULTIES`, rather than from whichever schedule
happened to run last. A type present at the same wave numbers everywhere reads
"All modes"; the five additions state their Normal/Hard appearances.

Easy deliberately keeps the earlier fourteen-type roster. The exact Easy-only
absences are Aether Wisp, Shieldbearer, Healer, Vanguard and Camo Heavy.
Normal and Hard must contain all nineteen; `tests/run.js` asserts both halves
and also resolves every scheduled id through `Enemy.typeOf`, so a typo fails
loudly.

**The v0.4.4 twenty-wave spine is still in there, in order.** Those waves were
never replaced: v0.4.5 inserted eleven between them, and v0.4.7 gave some of
them a second group behind their opening and turned their `health` overrides
up. Each still OPENS a wave with its exact count, interval and type, and a test
in `tests/run.js` pins that plus "no old wave was made weaker". This is not
tidiness. A schedule rebuilt from scratch put the first swarm at wave 5, when
three towers are on the board, and `null-meridian` could not survive it —
measured, twice. The old escalation curve is load-bearing; keep the spine or
re-measure everything.

**The ORDER OF THE INTRODUCTIONS is measured too, and it bit during v0.4.7.**
The first draft of the new schedule moved the Brute introduction from wave 19
to wave 13. That was measured and reverted: a gunner does *literally nothing*
to a Brute, so the wave is unanswerable until the player owns something hitting
for more than 5, and at 13 it killed a competent 30-tower board on
`null-meridian` outright. It is back at 20, and the three v0.4.7 types are
fitted around the proven order rather than through it.

**Waves that are CHECKS, not filler.** They ask whether the player has built a
particular thing:

- **Wave 11 is the midboss** — one enemy, 250 HP behind 10% defense, with a
  named bar across the top of the screen. The base pays an enemy's *remaining*
  health on a leak, so a midboss that gets through untouched takes a 100 HP
  base to zero on its own.
- **Waves 14, 18 and 28 are camo** — three things grant detection: the
  Longshot's A1 ($300 on top of a $900 tower — the tower was $75 before the
  2026-07-30 revamp; A1's own price did not move), the beam's B1, and since
  2026-07-29 the **Soldier's B3** ($400 on top of a $15 tower). 14 and 18 are
  deliberately *small* (32 and 40 HP): a healthy base can afford to leak them
  while it saves up, which is the point — an early camo wave the player cannot
  yet answer has to be a warning, not a run-ender. Wave 28's 100 HP is the one
  that demands it. All three are single-type, for the Smasher reason above.
- **Waves 20, 22, 31 and 34 carry brutes** — 5 *flat* armor, and mitigation has
  no damage floor, so gunners (1 damage), Soldiers (1–3 damage, path A included)
  and the beam (1 damage ten times a second) do literally nothing to them. A
  **plain $900 Longshot** answers a brute (10 − 5) — it was $75 until the
  2026-07-30 economy revamp, so this counter is now a considered purchase rather
  than pocket change; the purse it is bought out of grew by more than the price
  did. The Rifleman's **B5** is the
  other answer, and it answers with raw damage rather than with pierce: 20 a
  shot against 5 flat armor lands 15, at 5.5 shots a second.

  **This moved on 2026-07-30 and the gap is worth knowing.** B4 used to carry 6
  points of FLAT ARMOR pierce, which took a brute's armor to zero and made B4
  itself the counter — an awkward one, at 2.5 DPS. That pierce is now 10 points
  of *defence* instead (see the Rifleman's section), and **nothing in the game
  pierces flat armor any more**, so a B4 Rifleman's 5 damage does literally
  nothing to a brute. Path B's answer arrives one tier later than it used to.
- **Wave 26 is the first Hive** — the only wave whose cost is decided by how
  fast the player answers it. Hives also appear at 30 (three of them) and 33
  (two).


The cheap-counter/expensive-counter split is the whole reason the schedule is
survivable. Anyone retuning it has to keep each counter *affordable* at the
point its wave lands — income is each body's authored kill bounty (since
2026-07-31), so the purse at wave *N* is the sum of the bounties scheduled
before it, plus that wave's clear reward, minus whatever leaked and minus every
Hive brood. Bounties scale with a wave's health override, so a heavier wave
still funds its own answer — but only when it is actually KILLED, which is the
point of the change: damage on its own no longer pays.

**Wave 35 is the boss wave** — the Tyrant walks in mid-wave. It has its own
section below, after this one.

The full table with per-wave HP is a comment on `WAVES` itself;
`tools/simulate-campaign.js` is the reproducible arithmetic behind it (see
Balance math below).

**The schedule's length is an ECONOMY constraint, not just a difficulty one.**
Scheduled kill bounties are the bulk of the run's lifetime purse ($23 503 of
$36 204 all in — see the table in the economy section).
At the old 454 HP the $800 Siphon was unbuyable — it would have sat in
the build bar permanently greyed out, which is not meaningfully different from
not shipping it. A test pins `purse > dearest tower × 2`; if a tower is ever
priced above that, either the schedule or the price has to move. The 2026-07-30
revamp raised the dearest tower to $900 (the Longshot) and tripled the purse in
the same edit, so that check now passes by a very wide margin — which means it
is no longer doing much work, and a future reprice should not read its passing
as evidence the prices are sane.

The base starts at `BASE_MAX_HP = 100`. A leak subtracts the enemy's
**remaining** health, not its maximum health, so partial damage still protects
the base. Leaks are charged in `update()`'s end-of-life sweep immediately
before the enemy is filtered out, which makes the damage apply exactly once.
That same sweep is where `runKills` is counted and where cosmetic feedback
fires (see the Effects section). Base HP clamps at zero.

At zero HP, `gameOver` makes `update()` return immediately, freezing all
simulation. The opaque loss overlay owns input until one of its **three**
buttons is used: Restart (or R/Enter), Choose another route (or M), and **Main
menu** (or Escape). `restartGame()` resets the whole run: base HP, cash,
towers, enemies, bullets, selection, effects, the enemy lane sequence, and the
wave schedule. Adding any new run-scoped state means adding it there too —
`victory`, `allWavesDeployed`, `runKills` and `Enemy.laneSequence` are all
reset there. `gameSpeed` and `autoSkipWaves` are deliberately **not**: they are
preferences, not run state.

**The Main menu button was added 2026-07-29, at the owner's request.** Before
it the overlay offered "restart this route" and "choose another route" and no
way out of the run loop at all — the armoury, where the coins the same overlay
had just awarded are actually spent, could only be reached by reloading the
page. It goes through `leaveRun()`, the seam that lets the sandbox (which has
no menu screen to switch to) send it to `index.html` instead.

It sits on **its own row below** the other two rather than making a line of
three. The first two are both "play again" and this one is not, and a row of
three equals would make the odd one out easy to hit by accident on a screen the
player usually arrives at by losing. **Escape leaves here**, which it never
does mid-run — see the pause menu, where Escape only ever cancels. That is not
an inconsistency: the run is already over, so there is nothing left to cancel
and nothing left to lose by backing out of it.

**The run can be won** (2026-07-28). `victory` is set when `allWavesDeployed`
is true and the enemy list empties with the base standing, and freezes the
simulation exactly as a loss does, under a mirror-image overlay
(`drawVictory` / `drawGameOver`, both through `drawRunOverlay` — same
buttons, same keys). `allWavesDeployed` is set in **exactly one place**: the
scheduler naturally running dry in `spawnScheduledEnemy`. Tests and the
sandbox disable spawning with `waveIndex = WAVES.length`, and that idiom must
never read as a win — do not add a second assignment or derive the flag from
`waveIndex`. The loss check runs before the victory check so a final enemy
that both empties the board and zeroes the base reads as the defeat it is.

Since total effective HP (13 498) far exceeds the base's 100, an undefended base
really is destroyed — the loss path is reachable in ordinary play, not just
by tests. Both outcomes are pinned: the loss freeze by the original tests,
the victory path (and the manual-idiom non-victory) by
"clearing every scheduled wave wins" in `tests/run.js`.

---

## The wave 35 boss — the Tyrant

Specified by the owner on 2026-07-29, after asking for the slot to be held
empty a few hours earlier: *"2500hp slow, arrives at the middle of the 35th
wave, shoots towers stunning them for 2 seconds, at half hp roars, sending
enemies from the waves that have 1.5x speed and the boss gains a 200hp shield
and gets a little faster and shoots more often."*

**It silences towers; it does not destroy them**, and that is the whole design.
A threat that kills towers is answered by rebuilding. A threat that switches
them off is answered by having more board than it can silence at once — which
is a question about how the previous thirty-four waves were spent, and the only
question a final boss in this game can usefully ask.

**It fights in deliberate, telegraphed beats.** Every attack begins by stopping
it dead for a second or so (`windUpSeconds`, enforced in `currentSpeedUlps`) —
the seconds it spends aiming are seconds it is not advancing, which is what
makes a heavy attack fair and the fight readable. **`attackTowers` commits to a
spec BEFORE the wind-up and resolves that same spec after it**, so the attack
that lands is always the one that was telegraphed.

| | before the roar | after |
|---|---|---|
| health | 5000 | + a **1000** point shield |
| speed | ×0.3 (15 u.l./s) | ×0.405 (20.25) |
| pool | AIMED SHOT only, every **12 s** | + LEAP, and it alternates, every **9 s** |
| — | | **40 bodies / 2780 HP** called in at 1.5× |

**AIMED SHOT.** It stops, picks the tower with the **highest DPS on the whole
board** — not the nearest — and hits it for **45 damage and a 2 s stun**. Two of
those kill a 60 HP gunner. Going for the best tower rather than the closest is
the entire character of the move: it is answered by having depth, not by having
a bodyguard. Made possible by the vocabulary every tower answers
(`attackDamage() × attacksPerSecond()`, via `Enemy.towerDps`), so the enemy
never has to know what a Longshot is.

**LEAP**, unlocked by the roar, and **the heavier of the two moves** since
2026-08-01. It stops for a **1.5 s** wind-up, **jumps 90 u.l. up the road**, and
lands with a shockwave that damages (**80**) and stuns (**3 s**) **every** tower
within **120 u.l.** of where it landed; it commits at any tower within
**220 u.l.**. Order matters and is the whole feel of it: the shockwave belongs
to the landing, not to the take-off. `targets` does not apply — a shockwave
takes everything it reaches. The jump is the threat: it buys back the ground the
wind-up cost it and can carry the fight into a cluster that was safe a moment
ago. It is clamped at the end of the road, and a leap that carries it past the
base **is** a leak, deliberately: nothing here gets to cheat the one rule every
other enemy lives by.

That the leap now outhits the aimed shot is the right way round: **the aimed
shot picks your best tower, the leap takes the whole corner.** Every figure in
it moved together on 2026-08-01, because half a leap is not frightening — it has
to arrive somewhere it was not and it has to matter when it lands. The wind-up
grew with it (1.1 → 1.5 s), and that is the fairness half of the same change,
not an afterthought: a blow this size has to be visible coming.

**THE ROAR IS A WALL AND A COURT.** Its shield is **1000** — a fifth of the
boss's own health, conjured at the halfway line. At the old 200 against a 5000
HP body the roar announced a wall and then did not put one up: two seconds of a
finished board's fire. And behind the running mob it has always called (30
bodies, 600 HP, cheap and meant to be killed) it now calls a **support court**:
2 Hives, 3 Shieldbearers, 3 Healers, 2 Colossi. That is 40 bodies and 2780 HP,
but the size is not the point — the **shape** is. It used to be a rush you
outlast; it is now a formation you have to take apart in the right order, and
the Shieldbearers stacking 20 onto the ten strongest bodies on the road means
the roar's 1000 is not the last shield the player has to chew through. It is the
one moment in the campaign that asks whether they learnt the support types.

**The pool cycles**, deterministically — `attackIndex` is a counter, never
`Math.random`, for the same reason lane offsets are not random. After the roar
it goes shot, leap, shot, leap.

**Both the rate and the damage are a correction, twice over.** The first version
fired every 3.5 s, stunned three towers at once, and did no damage at all —
which read as a busy AoE pulse that never hurt anything. The owner's words:
*"right now the boss shoots an aoe wave way too often that does no damages."*
That took it to 8 s. On 2026-08-01 he asked for less again (*"make the tyrant
attack less often"*) and it went to **12 s**, 9 after the roar's 0.75
multiplier — roughly 4 attacks in 45 s before the roar and 5 after. Slowing the
rhythm is what buys the individual blows room to be heavy, which is the other
half of that same edit: see LEAP above. Any test asserting the old interval is
asserting a number the owner has now moved twice, deliberately, in the same
direction.

**It arrives in the MIDDLE of wave 35** — the second of four groups, about
sixteen seconds into a thirty-five second deployment. A boss at the head of a
wave is a duel; a boss in the middle of one is a wave you have to keep
answering with a boss in the way. Its group carries a **six second `lead`**,
the longest silence in the schedule, because at ordinary spacing it is just the
next thing out of the gate rather than an entrance.

**Everything the roar does is the `phases` block**, and nothing about the fight
is special-cased anywhere. Phases fire in order and once — `phasesEntered` is a
counter, so an enemy healed back above a threshold cannot re-trigger one, and
one that drops past two thresholds in a single hit enters both. `checkPhases`
runs in `takeDamage` **before the death test**, so a phase that grants a shield
can fire on the blow that would otherwise have been fatal.

Two traps worth knowing, both closed:

- **`enterPhase` COPIES every attack spec; it never mutates one.** The specs in
  `this.attacks` start as references to the rows in `Enemy.TYPES`, which every
  enemy of that type shares — winding an interval down in place would
  permanently speed up every future boss, including the one in the next run. A
  test pins the type being untouched.
- **The summons come out through `spawnMinions`**, the same door a Hive's brood
  uses, by way of a `pendingSpawns` queue the phase fills. That is deliberate:
  the main loop already asks every enemy "did you make anything" every step,
  and a second hook would be a second place to get the mid-walk append wrong.

**The banner** is a `showHealthBanner: true` flag on the type, not a check for
a particular id — which is why the boss cost one line to give a bar across the
top of the screen. Bars stack rather than overlap; "one boss at a time" is a
property of the current schedule, not something the renderer is entitled to
assume.

**The name "Tyrant" is a placeholder.** The owner has not named it, and nothing
derives from the string but the banner label and the index card, so changing it
is one line in `Enemy.TYPES`.

---

## Finishing a wave pays a tenth of it

2026-07-29, at the owner's request: *"give money at the end of each round,
around 1/10 of the hp of the wave."* `waveBounty(wave)` is
`round(waveEffectiveHealth(wave) × WAVE_CLEAR_BOUNTY_FRACTION)`, and the
fraction is 0.1. About **$2596** across the schedule.

**The bounty is a tenth of the wave's HP, not a tenth of its cash value** — HP
and cash are now separate quantities entirely, since a body's bounty prices its
whole threat rather than its hit points. Against the $36 204 lifetime purse the
clear bonus is about **7%**. Two further rewards ride on the same payout since
2026-07-31 — the redistributed $5000 and the rising $50 + $5-per-wave allowance
— and `waveReward()` is where the three are summed. If it is meant to stay a tenth of
income rather than a tenth of health, that is a change to `waveBounty` and
nobody has asked for it.

**Derived, never typed in per wave**, so retuning a wave moves its payout with
it and the two cannot drift. `waveEffectiveHealth` is also what the balance
tests sum, so the design figures and the payout are the same arithmetic.

**OWED when the wave finishes deploying, PAID when the wave is over.** The
owner's correction, the same day: *"the clear bonus should come after defeating
the wave, so basically at the start of the countdown to the next wave if the
wave was skipped."* The first version paid on deployment, which is not the same
thing at all — it paid you for a wave that was still walking.

`spawnScheduledEnemy` sets `pendingBounty` / `pendingBountyWave`, and
`payWaveBounty()` settles it from **whichever of three moments comes first**:

1. **the board going empty** — the wave was defeated, the honest case;
2. **`callNextWave()` succeeding** — the player skipped, so the countdown to the
   next wave has started, which is the owner's second clause exactly;
3. **the next wave's first spawn** — the 90 s ran out with stragglers still
   walking; the wave is over regardless.

**The latch is `pendingBounty` itself**, zeroed before the payout, so none of
the three can pay twice even if two fire on the same step. Each route has its
own test, because paying twice is the whole risk in a design with three doors.

**Wave 35 has no next wave and no break, so only route 1 can reach it** — which
is correct: the last bounty is paid for actually clearing the board, and that is
the same step that sets `victory`. A test pins it.

It lands when the break opens and the player is about to read a panel, which is
part of the point — damage income arrives in a dribble, so the wallet is almost
never on a round number at the moment a decision is being made.

It deliberately does **not** count a Hive's brood or the boss's summons. A
payout has to be knowable in advance to be worth anything.


---

## The core invariant: all distances are u.l., converted once, at the edge

**2026-07-26: this replaces the old path-calibrated meter system** (the
previous version of this section described `Units.calibrateFromPath`,
`Units.PATH_LENGTH_M` and `Units.m2px()` — that file is gone; see the change
log entry below for why and what changed).

**Every distance and speed in the game is authored in "unit lengths" (u.l.),
never in pixels.** Tower range, deadzone, footprint, AoE/aura radii,
projectile and enemy speed, and the path's own geometry (`PATH_POINTS_UL` in
`game.js`) are all u.l. numbers at rest. A hypothetical tower with range 100
u.l. is a permanent yardstick — that number never changes on its own.

**The conversion factor is one global constant, and there is exactly one
helper that applies it** (`js/units.js`):

```js
var UNIT_LENGTH = 1.04;
function ul(value) { return value * UNIT_LENGTH; }
```

`ul()` is the ONLY place a u.l. number becomes a screen/world one. **Any code
that multiplies by `UNIT_LENGTH` outside `ul()` is a bug.** Config files, save
data, and game logic all stay in u.l.; conversion happens only at the render
and collision layer, at the moment of use — e.g. `Tower`'s constructor calls
`ul()` once and caches `rangePx`/`footprintPx`, rather than every file that
compares a distance re-deriving pixels from scratch (that caching is what
"converting the radius once" means in practice — see `Tower.prototype.
findTarget`, which compares two already-world-space numbers, never a raw u.l.
one against a pixel one).

**What one u.l. is worth, and why the constant is 1.552.** The yardstick is
the hypothetical 100 u.l. reference tower, and **the gunner IS that
reference** — its range is exactly 100 u.l. A Longshot at 250 is two and a
half reference towers, which is what "long range" means here; the map is
~1865 u.l., about eighteen and a half of them end to end.

The whole game was re-anchored onto that yardstick on 2026-07-27. Before
then the gunner was 8 u.l. on a 100 u.l. map, inherited from an older meters
system, and Longshot's 250/20 could not coexist with it. Every legacy
distance was multiplied by 12.5 and `UNIT_LENGTH` divided by the same
(19.4 → 1.552), which left every distance in pixels untouched. It was then
tuned down a further 33% to 1.04 by eye — see the change log. See `js/units.js` for
the derivation, and `sandbox.html` for a live box to retune the constant
with immediate visual feedback.

**The path is a u.l.-authored quantity too, not fixed pixel geometry.** Since
v0.3.5 there are four routes and they live in `js/maps.js`. Each is DRAWN in
pixels — a shape is easier to author that way — and `Maps.toWorld` divides by
`AUTHORED_AT_PX_PER_UL` and multiplies by `ul()` to turn those into world
coordinates. That division is the whole trick: the drawing is a u.l. quantity
expressed at a known authoring scale, so it scales with `UNIT_LENGTH` like
everything else rather than being frozen in pixels. `PATH_POINTS_UL` in
`game.js` is now just the reference route's points, kept for the tests that
rebuild the path directly. This is what keeps the map's length
proportional to `UNIT_LENGTH` exactly like every tower/enemy stat — if the
path stayed fixed in pixels while everything else scaled, changing
`UNIT_LENGTH` would change how long it takes an enemy to cross the map, which
would be exactly the "mixing world space and u.l." failure mode this system
exists to prevent. `Maps.referenceLengthUl()` is DERIVED by measuring the
reference route, never declared, for the same reason: a second declared
constant is a second thing that can disagree with the first. `tests/run.js`'s "changing UNIT_LENGTH" group proves this:
halving the constant and rebuilding the path from the same `PATH_POINTS_UL`
produces identical kill/leak/base-HP outcomes over the same 120 s run.

**Rule: no pixel literal may appear in gameplay logic.** Go through `ul()`.
Pixel literals are acceptable in exactly two places, both of which must *not*
scale with `UNIT_LENGTH`:

- inside `draw()` methods, for cosmetic details (border widths, health bar
  height, glow radii);
- in **interface chrome** — the build bar, the inspection panel, the speed
  toggle and the wave-skip button. These are anchored to the 1280×720 viewport,
  not to the world, so their sizes and positions are pixels on purpose
  (`SLOT_SIZE`, `BAR_X`, `SPEED_BUTTON_W`, panel padding). A build slot must
  stay the same size no matter how big the map is. Note this
  also means the viewport does NOT grow with the map — raising `UNIT_LENGTH`
  enough can push placeable ground outside the fixed canvas; see the test
  note above for why that test scales down rather than up.

**Angles are not u.l. and never go through `ul()`.** Cone arcs and similar
are authored and used in degrees throughout (see the Longshot tower).

New towers, enemies or abilities get their range/speed/size constants in
u.l., named `*_UL` or `*_ULPS`.

---

## Placement rules are derived, not hand-picked

Both build constraints come from geometry, so they stay correct when the map
changes. This was a bug once already — an arbitrary 2.5 m exclusion radius left
a visible 31 px gap between towers and the road — so do not reintroduce magic
numbers here.

**Not on the road:**
`buildClearancePx(type)` = `ul(ROAD_WIDTH_UL / 2 + type.FOOTPRINT_RADIUS_UL)`
= 10.9375 + 11.25 = 22.1875 u.l. for a gunner. That puts it exactly flush against the
road edge, as close as physically possible. `ROAD_WIDTH_UL` also drives how the
road is *drawn*, so the two can never disagree.

**Not on each other:** two centres must be at least the **sum of the two
footprint radii** apart — `type.FOOTPRINT_RADIUS_UL + existing.footprintRadiusUl`,
22.5 u.l. between two gunners. It is written as a sum rather than
`FOOTPRINT_RADIUS_UL * 2` so that towers of different sizes pack correctly the
day a second type exists. Each tower instance carries its own
`footprintRadiusUl` / `footprintPx` for this reason.

**The footprint circle and the drawn base are locked together.** The base is
drawn as a square *inscribed* in the footprint circle
(`half = this.footprintPx / √2`), so the square's diagonal exactly equals the
footprint diameter. Bases therefore can never visually overlap, not even corner
to corner. The footprint is also the tower's **click target**
(`Tower.prototype.containsPoint`) — one radius does all three jobs. If you
change how towers are drawn, preserve this relationship or both the collision
rule and the hit box stop matching what the player sees.

`whyCannotBuild(x, y, type)` returns `null` or a short human-readable reason,
shown under the cursor. It is the single source of truth for placement rules —
add new ones there, and never duplicate a rule inline in `onClick`. It takes
the tower *constructor* so every rule is derived from the type being placed
rather than from the gunner specifically.

---

## The economy — fixed bounties per kill

**Remodelled 2026-07-31.** Ordinary damage never adds cash. Every scheduled
enemy type has an explicit base `bounty` in `Enemy.TYPES`; when the enemy dies,
the removal sweep adds `enemy.bounty()` exactly once and passes the same value
to the `+$` effect. The old `CASH_PER_DAMAGE = 3` constant and both tower/bullet
damage-payment loops are gone.

The point is to break the feedback loop where increasing HP increased both
difficulty and income. Health, shields, armor, speed and abilities now determine
how hard an enemy is; bounty is a separate authored balance value. A wave
`health` override scales its type's base bounty linearly through
`Enemy.bountyOf(typeId, healthOverride)`, so a deliberately stronger scheduled
variant pays more without exposing the economy to every shield refresh or heal.

| Enemy | Base bounty |
|---|---:|
| Normal / Fast / Slow / Swarm / Armored | 3 / 3 / 5 / 1 / 4 |
| Brute / Camo Normal / Camo Fast / Flying / Angry | 40 / 4 / 3 / 6 / 15 |
| Midboss / Shielded / Revenant / Hive / Tyrant | 250 / 20 / 20 / 175 / 3000 |
| Shieldbearer / Healer / Vanguard / Camo Heavy | 75 / 250 / 1100 / 30 |

Those values price the complete authored enemy, not just its red health bar:

- shield, armor, defense, speed, camo, flight, support, attacks and boss phases
  are already reflected in the base bounty;
- a Revenant pays only when its final life ends, not on the temporary death that
  triggers its revive;
- a Hive pays $175, while each brood spawn keeps `noBounty = true` and pays $0;
- temporary shield refreshes and healing never change the payout;
- conditional Tyrant summons are ordinary enemies and pay their normal bounty
  if the player kills them;
- overkill cannot inflate a bounty because payment does not inspect damage.

The current authored purse is:

| Source | Cash |
|---|---:|
| Easy starting stake | $600 |
| progression rewards, waves 1–34 | $5 000 |
| escalating wave allowance, waves 1–34 | $4 505 |
| scheduled kill bounties | $23 503 |
| wave-clear bonuses | $2 596 |
| **authored total** | **$36 204** |

The total excludes Fractal descendants, conditional boss summons and the
Siphon's A3 charge bonus.
It is the single-route schedule total. Twin Confluence mirrors every scheduled
body onto its second route, so it also mirrors kill income: $47 006 in scheduled
kills and $59 707 including its one stake, progression rewards and one set of
HP-based clear bonuses.
The Siphon exception is intentional: `baseGoldPerDamage = 1` is now only the internal
unit for A3's extra charge-generated gold. Ordinary Siphon beam damage pays no
cash, and `goldGenerated` / `bonusGold` count only that explicit bonus.

**The starting stake is $600: exactly two $300 Riflemen.** The removed $5000 is
spread evenly across the first 34 completed-wave rewards: $148 on waves 1–2 and
$147 on waves 3–34. Every one of those rewards also gets a rising allowance:
$50 on wave 1, then $5 more each wave, through $215 on wave 34. Wave 35 gets
none because the run is already over. Enemy bounties, tower prices and schedule
are unchanged.

Per-run cash **does not persist**: `MetaProgress` saves coins, owned tower types
and the loadout, and nothing else. The multi-run currency is still coins.

**Selling refunds half, rounded up.** `SELL_REFUND_FRACTION = 0.5` and
`sellValue(tower)` is `Math.ceil(tower.cost * fraction)`. The rate lives in
game.js as global economy policy; each tower supplies its actual cumulative
`cost`. A 100% refund would make placement reversible and is not the current
design.

When adding or changing an enemy, update its `bounty` deliberately and test both
base and health-override resolution. When changing a tower price, re-run the
Easy policies. Do not reintroduce any generic conversion from returned damage to
cash: returned damage still feeds statistics, Siphon charge/lifesteal and test
meters, which are separate ledgers.

---

## Screens: menu → chooser → play

`screen` is `"menu"`, `"select"` or `"play"`. Each is a full SCREEN, not an
overlay: nothing behind one runs, so it cannot be interacted with by accident.

- **`"menu"`** (added 2026-07-28) is the title screen: PLAY, the armoury, the
  index, and a link into sandbox mode. It also shows the coin purse — a
  currency you cannot see is a currency nobody spends. Before it, the page
  opened straight onto the chooser and the sandbox had no entrance from the
  game at all — you had to know `sandbox.html` existed and open it by hand.
- **`"store"`** (added 2026-07-29, `js/store.js`) is the armoury: a **Store**
  tab that sells tower types for meta coins and an **Inventory** tab that puts
  owned towers into the five build-bar slots. Built exactly like the index —
  nothing written down twice, prices from `MetaProgress`'s catalogue, stats
  from a throwaway instance's own `statLines()`, icons from `drawIcon`. Same
  Back button and Escape as the index. **Every mutation goes through
  `MetaProgress`**; do not adjust coins or splice the loadout in the screen,
  because that module refuses an empty or unaffordable bar and saves after
  every change.
- **`"select"`** is the combined run chooser. Easy / Normal / Hard sit above
  the route cards; click one (or E/N/H), then click a ley-line (or 1–6).
  Easy is selected by default. The `← Menu` button and Escape go back.

  **Each route card IS the map** (2026-08-01). `drawMapThumbnail` renders the
  whole 1280×720 battlefield into the card through the same three calls the
  play screen makes in the same order — the theme's background,
  `Maps.drawEnvironment`, then `drawRoadOn`. **One road renderer paints both
  the card and the battlefield**, which is the only honest way to promise the
  preview is the map, and it means a theme retune or a change to the road's
  five strokes reaches the cards with no edit here. The card before this drew
  an abstract polyline in the difficulty band's colour on a flat swatch, so
  every map looked like every other map in a different tint.

  **`mapPreviewRect` is 16:9 and that is load-bearing.** The scale is uniform;
  a non-16:9 box would force either letterboxing or a squashed map, and a
  squashed map misrepresents exactly the shape the card is asking the player to
  judge. The blurb and the four stats are drawn as translucent bands *over* the
  render because a 16:9 thumbnail at the card's width is 196 px of a 240 px
  card — the same arrangement the in-game HUD has with the battlefield. Towers,
  enemies and the old start/end dots are deliberately absent: the first are run
  state and there is no run yet, and the dots were interface the battlefield
  itself never shows.
- **`"index"`** (added 2026-07-28, `js/codex.js`) is the field guide: a Towers
  tab (every roster tower, its stats, and its full upgrade tree — click a
  tier and the SAME preview card the in-game hover shows is drawn by the same
  renderer, `drawCardBox`) and an Enemies tab (every `Enemy.TYPES` row with
  its real sprite, and wave appearances derived from all `DIFFICULTIES`). Everything on
  it is measured off real instances at open time; nothing is a second copy.
  The preview walker advances throwaway instances through `purchase()` /
  `applyUpgrade()` — deliberately BELOW `buyUpgrade`, which is the economy —
  and stops at any tier whose action carries a `reason`, so a gated tier (the
  Siphon's B5) is shown with its refusal but never applied. Same Back button
  and Escape as the chooser.

  **The enemy roster scrolls** (2026-08-01). Rows are 50 px with **ten in
  view**, and `ENEMY_LIST_H` is derived from `ENEMY_VISIBLE_ROWS × (ENEMY_ROW_H
  + gap)` rather than typed in, so retuning the row height moves the viewport
  and the scroll clamp together and the three cannot disagree. `Codex.onWheel`
  is scoped to that viewport rectangle, so the wheel is inert over the detail
  panel; `onClick` tests the viewport **before** the rows, without which a click
  above a scrolled list would land on whichever row was sitting off the top of
  it. The wheel reaches it through `onWheel` in game.js, registered
  non-passive so it can `preventDefault` the page scroll. Rows were 26 px and
  fitted all twenty-one types at once, which made the screen a directory: a
  nine-pixel sprite and room for a name and two numbers.
- **`"play"`** is a run.

**`update()` tests `screen !== "play"`, not a list of screens to skip.** This
is not style. The menu was added by extending the old `screen === "select"`
check and the simulation promptly ran *behind the title screen* — waves
spawning, enemies walking, the base taking damage before the player pressed
PLAY. Written as "only play simulates", any future screen is inert by default.
A test pins it.

**Leaving for the sandbox is a page navigation** (`openSandbox`), the only one
in the game: `sandbox.html` installs its own roster and hooks at load time, so
it is a separate page rather than a mode this one can switch into. It is
guarded on `window.location` existing, because the test harness's stubbed DOM
has none and an unguarded menu button would take the whole suite down.

`sandbox.html` and `long-range-dps-debug.html` call `startRun()` themselves at
load, so they bypass both screens and land straight on a board.

**Getting back out of a run** (2026-07-28) is the **pause menu**, opened with
Escape and nothing else. There is deliberately no button for it on the HUD: a
permanent `Menu` control beside the build bar was built first and taken back
out the same day, because it spent screen space all run to be used once and
sat one stray click away from ending a twenty-wave game. A test asserts no
such button exists.

**Escape CANCELS FIRST, then opens the menu.** If a slot is armed, a tower is
inspected, or a tower is aiming, Escape backs out of that — the job it has
always had. Only with nothing left to cancel does it pause. Getting this order
wrong means a player trying to drop a half-placed tower gets a menu instead.
Escape also closes the menu, so the key toggles.

**RIGHT-CLICK IS THE CANCEL HALF OF THAT, ON A MOUSE BUTTON** (2026-08-01, at
the owner's request). `onRightClick` clears the armed slot, the inspected tower
and a pending aim click together — "selected" is one idea to the player even
though it is three fields here, and clearing only the slot would leave the panel
up over the map and read as a button that half-worked. It is inert while paused,
lost, won, or off the play screen.

**It deliberately does NOT open the pause menu when there is nothing to
cancel**, which is exactly where it parts company with Escape. A menu is a place
you go; a right-click is a dismissal, and one that could put a modal on screen
would be a trap on a button people click by reflex. It calls `preventDefault`
on every screen regardless, because the browser's own context menu over a game
canvas is never what was wanted.

**Pausing freezes the simulation** (`update()` returns early on `paused`) and
the menu owns every click, so nothing underneath it — board, build bar or
panel — is reachable. Freezing is not a convenience: a menu that let enemies
keep walking would charge the player for opening it. `paused` is run state,
so `restartGame()` clears it.

The menu shows where the run stands (route, wave, towers, kills, base) and
offers **Resume** and **Back to main menu**. There is no separate "are you
sure?" step, because the menu itself is the safety — leaving takes Escape and
then a deliberate click.

**`leaveRun()` is a seam.** In the shipping game it calls `openMenu()`. The
sandbox is a separate PAGE, so there is no menu screen to switch to and it
overrides `leaveRun` to navigate to `index.html` — wrapping the global exactly
as it wraps `update`/`updateWaves`/`restartGame`, with no edit to `game.js`.
The sandbox sidebar also has a direct `← Back to main menu` button.

---

## The build bar and the inspection panel

Towers are no longer placed by clicking bare ground. The player **arms a build
slot first**, then clicks the map.

**`BUILD_SLOTS` is an array of tower CONSTRUCTORS**, currently
`[Tower, Smasher, LongshotTower, BeamTower, Soldier]` — five slots, **all five
now filled**. This is the whole extension point: drop a new constructor into a
`null` slot and it appears in the bar, priced, with an icon, placeable, and
inspectable. Nothing in the bar knows what a gunner is. To make that work a
tower constructor must expose:

| Member | Used for |
|---|---|
| `new Type(x, y, path)` | the path argument is required — the tower needs it to work out its `pathProgress`, which sets its firing priority |
| `DISPLAY_NAME` | slot label, inspection panel title |
| `COST` | slot price, affordability, `whyCannotBuild` |
| `BASE_RANGE_UL`, `FOOTPRINT_RADIUS_UL` | build preview, placement rules |
| `drawIcon(ctx, cx, cy, size)` | the slot icon |
| `prototype.statLines()` | the inspection panel rows |
| `prototype.containsPoint(x, y)` | click-to-inspect hit test |
| `prototype.attackDamage()`, `prototype.attacksPerSecond()` | the shared stat rows and DPS — see "One vocabulary" below |

**All four built towers are in the shipping game as of 2026-07-28.** The
Longshot and the Siphon existed, were fully tested, and were reachable only
through `sandbox.html` — so two of the project's four towers were invisible to
anyone actually playing. Wiring them in was a build-bar entry plus
`index.html` loading their systems; no tower code changed.

**The order is not by price** ($100, $700, $900, $800, $15 since the 2026-07-30
revamp; it was $15, $200, $75, $800, $15). It preserves the
slots that already existed, because the number keys are muscle memory and
`tests/harness.js`'s `placeSmasher` addresses the Smasher as slot 1. New types
append. Sorting the bar by cost means moving that helper too.

**The fifth slot was held empty for a year of change logs, and the Soldier is
what it was being held for** (2026-07-29, at the owner's request). It existed
so the bar would not change shape the day a fifth type arrived, and it did not.
**The bar is now full**, so a sixth type is no longer a drop-in: it needs a
decision about the bar's geometry (`SLOT_SIZE`, `BAR_WIDTH`, the `1`–`5` keys,
`MetaProgress.SLOT_COUNT`) that nobody has made. `tests/run.js`'s "every built
tower type is in the build bar" is where that decision will surface.

**A consequence worth knowing: the expensive towers cannot stand where a
gunner can.** Placement clearance is derived from each type's own footprint
(see Placement rules), and the Longshot's and Siphon's are much larger, so
they need more room from the road. Anything that picks a build spot
programmatically — `Maps.bestSpots` rates ground for a *gunner* — must re-check
`whyCannotBuild` for the actual type, or it will silently fall back to placing
a gunner. Both `tools/simulate-campaign.js` and the roster test in
`tests/run.js` search for type-legal ground for exactly this reason.

**Input priority in `onClick`, in order:** speed toggle → auto-send toggle →
wave skip → build bar → the open panel's Sell button → existing tower → empty
ground. Anything drawn *on top of* the map must consume clicks *before* the
map, or the player builds underneath it. Anything that adds a new click target
must slot into that same ordering, not run alongside it.

The three buttons sit at the top only because they are the cheapest tests; none
of these rectangles overlap, so the order among them cannot matter. The wave
skip is additionally gated on `betweenWaves()`, so outside a break its
rectangle is ordinary map and builds on as usual, and both wave controls are
gated on `waveControlsShown()` so they disappear together once the last wave
has deployed.

**A button over the map is a lie unless the build preview knows about it.**
`overInterfaceChrome(x, y)` is the single list of screen-space rectangles that
will swallow a click, and `drawBuildPreview` bails on it. Without that the
preview draws a green "yes, build here" circle under the cursor and the click
then presses a button instead — which it did for the speed toggle from the
moment that was added. **Add any new play-screen button to that function**, and
it inherits the fix.

It is deliberately *not* folded into `whyCannotBuild`: that answers whether the
**world** allows a tower there (road, footprint, neighbours) and its answers are
geometry in u.l., which a viewport rectangle in pixels has no business in.
"Will the click even reach the map" is a different question and is asked
separately — including by `tests/run.js`'s placement fixture, which searches for
ground that satisfies both.

**The bottom-right corner belongs to the speed toggle, and `js/debug-cash.js`
was moved out of it** (2026-07-29). That panel is a fixed DOM overlay and it
covered the button completely — a canvas button underneath one is not a button.
The debug panel yielded rather than the game moving, because it is the
disposable one: it is marked for deletion before release and no game code
refers to it.

A consequence worth knowing: while a panel is open, its Sell button also
blocks *building* on the ground beneath it. That is correct and consistent
with the build bar — there is a test pinning it.

**The panel's geometry lives in `inspectionLayout(tower)`**, which both the
drawing and the click test read, so the Sell button cannot be drawn somewhere
other than where it is clickable. Same arrangement as `slotRect`. It also
clamps the panel inside the canvas and above the build bar.

Selection state is two variables: `selectedSlot` (index or `null`) and
`inspected` (a `Tower` or `null`). They are independent — inspecting a tower
does not disarm the bar. Number keys `1`–`5` arm a slot; `Escape` clears both
(and cancels aiming); `Delete`/`Backspace` sells the inspected tower.

**Placing a tower disarms the slot** (changed 2026-07-27, at the owner's
request). One click, one tower: the next click on open ground clears the
selection instead of building a second one by accident. This reverses an
earlier decision — the bar used to stay armed so several towers could be
placed in a row — so if rapid repeat placement is ever wanted back, that is
the trade being made, and the number keys make re-arming one keystroke. A
*refused* placement leaves the slot armed, so a misclick on the road does not
cost you the selection.

A third piece of input state, `aimingTower`, is set while a tower waits for
the player to click a **direction** rather than a position (the Longshot's
cone re-aim, spec 5.6). It consumes the next map click, ordered *below* the
panel's own buttons and *above* building — so setting a direction can never
also place a tower.

`onKeyDown` ignores events whose target is an `INPUT` or `TEXTAREA`. Without
that, typing `1` into the debug panel's number field would arm a build slot.
Keep the guard if you ever add any other text field.

**`statLines()` derives its numbers**, it does not store them — see the next
section. A displayed stat therefore cannot drift from the real one. Keep it
that way: do not add a hand-maintained `this.dps`.

The build preview only draws when a slot is armed, and is suppressed while the
cursor is over the bar.

---

## Towers have hit points, and at zero they die

`js/systems/tower-health.js` (2026-07-29). This answers a question that sat in
this document as an open placeholder from the Longshot spec since 2026-07-26 —
*"what tower HP actually does (damageable by what, dies at zero?)"*. The owner
answered it: an enemy that attacks towers, and towers that die at zero.

**The contract every tower type honours:**

| member | meaning |
|---|---|
| `maxHp`, `currentHp` | > 0, and 0..maxHp |
| `takeDamage(n)` | returns the damage actually absorbed |
| `isDestroyed()` | `currentHp <= 0` **or** `maxHp <= 0` |

**`maxHp <= 0` is part of the death test on purpose.** A tower whose *maximum*
has been burned to nothing is destroyed even though "current ≤ max" is still
satisfied at 0/0. That 0/0 state is exactly the bug this closes: the
Longshot's B5 burns 300 permanent max HP per press against 1450, and its owner
expected five presses to kill it — instead it sat at 0/0 and kept firing.
**It now dies on the fifth use**, and a test pins the number.

**Towers have NO mitigation.** `armor` and `defense` are enemy stats. Running
tower damage through `Mitigation` would silently give every tower a 0%
resistance that somebody would later be tempted to make non-zero.

**The two config-driven towers MIRROR rather than copy.** Longshot and Siphon
are thin adapters over a `ConfiguredTower` core, and the core is where their HP
and stun timer genuinely live — the stat resolver writes HP on every upgrade,
and B5 burns max HP and starts its self-stun directly there.
`TowerHealth.mirror(adapter, core)` forwards `maxHp`, `currentHp` and
`stunTimer`, so the adapter seen by the game loop and its core always expose one
state rather than two values that need re-syncing after every purchase or hit.
A copy is the shape this whole module exists to prevent.

**The sweep lives in one place.** `update()` removes destroyed towers with a
`filter`, immediately after the enemy attacks and before the towers act.
`filter` preserves order, so `towers` stays sorted by `pathProgress` — the
invariant target claiming rests on. The sweep also clears `inspected` and
`aimingTower` if they pointed at the casualty, because a panel open on a dead
tower would offer to sell something that is not there.

---

## Game speed: 1×, 2×, 3×, applied in exactly one place

**2026-07-29, at the owner's request.** A button in the bottom-right corner
cycles the speed, at any moment during a run.

**It is applied once, to how much time `frame()` hands the fixed-step
accumulator**, and nowhere else:

```js
accumulator += elapsed * gameSpeed;
```

That is what makes "applies to everything" true *by construction* rather than
by audit. At 3× the loop runs three times as many 1/60 s steps, and every
single thing that reads `dt` — waves, enemies, bullets, cooldowns, slows, buff
stacks, reloads, the death-denial rewind, cosmetic effects — advances with it
because none of them can tell the difference. A per-system multiplier would be
something every future system had to remember; this cannot be forgotten.

**Never scale the step itself.** Feeding `update()` a 3× `dt` would change
collision and cooldown outcomes: fast bullets would tunnel, "is it in range"
would be sampled a third as often, and the same board would play differently at
speed. Three steps at 3× are bit-for-bit the three steps 1× would have run over
three times as long. Two tests pin this — one counts steps and asserts every
`dt` is `FIXED_STEP`, one plays the same board at both speeds and compares the
resulting state.

The `MAX_FRAME_TIME` clamp is applied to **real** elapsed time, before the
multiplier. It exists to stop a stalled tab banking minutes of simulation, and
that hazard is the same size at any speed; clamping afterwards would quietly
cap 3× at a third of the catch-up 1× gets.

**`gameSpeed` is not run state and `restartGame()` does not clear it.** It is a
pacing preference the player set for themselves, like a volume knob — being
dropped back to 1× by every restart is the kind of thing that gets a feature
sworn at.

---

## Range circles: only for the tower you asked about

**2026-07-29, at the owner's request.** Every tower used to paint its own reach
every frame. On a full board — and the measured winning builds run to 65–70
towers — that was a fog of overlapping circles with the road invisible
underneath.

The rule now: **a tower draws its range only when it is `inspected`, or when it
is waiting for an aim click.** The decision is made in **one place**, the render
loop in `game.js`, which sets `tower.showRange` before calling `draw(ctx)`. Each
`draw()` reads the flag; none of them decides it. That is what keeps all four
types agreeing, and it is why the rule is visible from the render loop rather
than buried in four files.

Two deliberate exceptions:

- **The Smasher still flashes its wedge on impact.** The zone brightens through
  the swing, and that flash is how a player sees *what was hit*; hiding it
  entirely made the tower look inert. So: quiet at rest, loud on impact, fully
  mapped on demand.
- **The Siphon's beams are always drawn.** They are the tower working, not a
  reach indicator. What is hidden is the idle circle.

`sandbox.html`'s own overlay already only drew for `inspected`, so it needed no
change — the two now agree about when a circle means anything.

---

## Meta progression — the only thing that outlives a run

`js/meta.js` (2026-07-29). Three fields persist: **coins**, **owned** towers,
and the **equipped** loadout. Nothing else. Cash, base HP, towers on the board
and wave progress are still run state that `restartGame()` wipes.

**"Save/load" came off the out-of-scope list for this**, because a meta
currency that resets on refresh is not a meta currency. This is the narrowest
save system that can work — three fields, no run state — and it should stay
that way.

**Storage is `localStorage`, wrapped in try/catch, with an in-memory
fallback.** It does work from `file://` in Chrome and Safari. The fallback is
not defensive padding: Safari's private mode *throws* on write, the Node test
harness has no `localStorage` at all, and a corrupt or hand-edited value must
not take the game down on the title screen. A fallback profile plays
identically and is forgotten afterwards — playable, honest, never a crash.

**Everything read off disk is treated as hostile.** `sanitise()` rebuilds the
profile from what it recognises and drops the rest: unknown tower ids, negative
coins, equipping something you do not own, a bar of the wrong length.

**The payout is a pure function**, `coinsForRun(waveReached, victory)` = two
per wave cleared, plus sixty for a clear. Pure so the armoury can promise a
number before the run and the overlay can show the same one after, without
either re-deriving the rule. It is banked **exactly once**, latched by
`runAwarded` — the sandbox un-loses a run by restoring base HP, and a second
award on the way down again would pay twice for the same run.

**`BUILD_SLOTS` is now DERIVED from the loadout**, via `rebuildBuildBar()`.
Everything downstream is unchanged: the bar still reads constructors out of
that array and still knows nothing about what a gunner is, and a slot empty
because it was never bought looks exactly like a slot empty because nothing was
written there. `BUILD_SLOTS.length` and `MetaProgress.SLOT_COUNT` must stay the
same number — the bar's geometry is computed from it once at load — and a test
pins that.

**The starting kit is the gunner, the Smasher and the Soldier** (the Soldier
joined it 2026-07-29, at the owner's request). The Longshot costs 40 coins and
the Siphon 150. That is tuned against the payout and it is the whole
progression loop, measured:

> A first run on a fresh profile **loses on every route** and pays 30–56 coins.
> That buys the Longshot immediately. With the Longshot and its A1, the
> campaign is winnable on every route.

So run one teaches you what you are missing and pays for it. Do not "fix" the
fact that a fresh profile cannot win — that IS the loop.

**The Soldier's B3 changed the PREMISE of that loop, and it was re-measured
rather than assumed.** Until 2026-07-29 the reason a fresh profile could not
win was simple: nothing on the starter bar could see camo, so waves 13, 16 and
26 leaked whatever they liked. The Soldier's B3 *is* camo detection, and at
$15 + 75 + 125 + 200 = **$415** it is not far off the Longshot's $375 — so for
the first time the starter bar can buy the thing the loop is built on
withholding.

`tools/measure-starter-kit.js` was written for exactly this question and the
answer is that **the loop survives, for a new reason**. Scripted play, starter
bar only, best build order found by sweeping:

| policy | rune-circuit | mana-coil | sigil-lattice | null-meridian |
|---|---|---|---|---|
| gunners + smashers (the old kit) | loss w19 | loss w20 | loss w19 | loss w19 |
| soldiers + smashers, no upgrades | loss w19 | loss w20 | loss w19 | loss w19 |
| soldiers, 2 taken to B3 (camo) | loss w28 | loss w28 | loss w19 | loss w19 |
| soldiers, 2 taken to B4 (+pierce) | loss w28 | loss w28 | loss w19 | loss w19 |

Two things to take from that, and one trap:

- **Detection is what moves the wall**, from wave 19 to wave 28 on the two
  easier routes. That is the camo waves no longer leaking, and it is the
  Soldier doing exactly what it was added to be able to do.
- **It is still not a win, anywhere.** Buying $415 of upgrades costs you the
  board that earns it: the winning lines run 60–70 towers and the lines that
  reach B3 run 12–41. The detection is affordable *in principle* and not *at
  the moment wave 13 lands*, which is a more interesting reason to lose than
  "you cannot buy it at all" and is still a reason to lose.
- **The trap, if you re-measure**: a greedy builder that spends every $15 the
  moment it has one never accumulates $200, so a "build, then upgrade" script
  measures building and reports it as upgrading. The first draft of that tool
  did precisely this and confidently reported no change. Its policies now have
  an explicit saving phase, and the reading prints how many Soldiers actually
  reached B3 so the claim is checkable. **When** saving starts decides the run:
  from a board of 4 it dies at wave 11, from 10 it reaches 28.

Absolute numbers in that table are not comparable with the browser-console
table in Balance math below — different method, same caveat as always.

**Two ways to make an unplayable bar, and `MetaProgress.unequip` refuses
both:** an empty bar, and a bar whose cheapest tower costs more than
`STARTING_CASH`. The second is the same deadlock with an extra step —
unequipping the gunner and leaving only the $800 Siphon is a board you can
never build on. AGENTS has always stated this invariant as "STARTING_CASH must
exceed the cost of the cheapest tower"; it used to be guaranteed by
`BUILD_SLOTS` being a constant with the gunner in it, and now that the player
edits the bar it needs enforcing. It is enforced in `meta.js`, not in the
screen, so no other caller can route around it.

**The test harness calls `MetaProgress.unlockAll()`** before `init()`. That is
a real entry point, not a back door in the gate: the suite is about what towers
*do*, not how they are unlocked, and a locked roster would silently reduce most
of those tests to "the tower was not in the bar". Node has no `localStorage`,
so the harness profile dies with the process.

---

## One vocabulary: every tower reports its numbers the same way

`js/systems/tower-stats.js` exists because four towers called the same
quantity four different things, in two different units:

| tower | said | meaning |
|---|---|---|
| gunner | `Cooldown 1.00 s` | seconds per shot |
| smasher | `Hit speed 4.00 s` | seconds per swing |
| Longshot | `Fire rate 0.50/s` | shots per second |
| beam | `AD  1 x 10/s` | damage *and* rate, in one cell |

No player could compare those and no reader of the code could tell which way
round "hit speed" ran. The smasher also printed its distances in **metres**, a
unit the game stopped using on 2026-07-26.

**The rule now:**

- Every tower answers **`attackDamage()`** and **`attacksPerSecond()`**.
- Every shared row is built by `TowerStats` from those two answers. A tower may
  add rows of its own; it may not spell a shared one its own way.
- **`DPS` means the same thing on every tower**: `damage × attacks per second`
  against ONE enemy, derived by `TowerStats.dps`. A tower that hits several at
  once does that much to *each*; where the ceiling is worth stating it gets its
  own row (the beam's `Max DPS`), rather than quietly redefining `DPS`.

Towers still STORE their rate however their own model wants — the smasher keeps
seconds between swings because its whole upgrade table is written that way.
`attacksPerSecond()` is the single conversion point, exactly as `ul()` is for
distances.

The row order is part of the contract: **lifetime totals → damage → range →
attack speed → the type's own rows → DPS last** (the panel emphasises the last
row).

**There is no "Target" row.** The targeting button sits directly under the
stats and already reads `Target: first`; a row above it saying the same word is
the duplication the map labels were deleted for (2026-07-27).

**Every tower carries `cost` AND `totalSpent`.** `cost` is the build price and
never moves; `totalSpent` is everything sunk in, and is what `sellValue()`
refunds half of. Before this, the smasher grew its `cost`, the beam grew a
separate `totalSpent`, and the Longshot grew neither — so a Longshot with
$19 000 of upgrades on it sold for $38.

**Every tower has a `targeting` mode**, and `inspectionLayout` gives the cycle
button to anything that does. The Longshot and the beam sort their targets
(a piercing shot walks the line; a beam fills several locks), so they use
`Targeting.comparator(tower)` — same scoring, same tie-break as
`Targeting.pick`, applied to an already-reachable list. They used to sort by
path progress inline, which silently ignored the player's chosen mode.

---

## Hover cards — what an upgrade does, in full, before you buy it

A button has room for three short lines: which tier, what it costs, and a
clipped summary. That is enough to choose between two upgrades and not enough
to understand either — `+5 pierce, pierce falloff` never says what pierce
falloff *is*, what the range would *become*, or that tier 3 shuts the other
path for the rest of the run.

So **hovering any button in the panel opens a card beside it**: every stat the
tier moves with the value before and after, a sentence per ability it switches
on, and the consequence a price tag cannot show. `js/game.js` owns the layout
(`hoveredCard` → `tooltipLayout` → `drawHoverCard`); the towers own the model,
because only a tower can measure a before/after on itself.

- **The numbers are measured, not read off the table.**
  `ConfiguredTower.previewNextTier` resolves the config twice — once as the
  tower stands, once with the extra tier — and diffs. So a printed "+100 range"
  is the gain on *this* tower, crosspathing included, and a stat that a flag
  overrides outright (cone shape, infinite pierce) shows up even though the
  table has no number for it. The Smasher gets there by diffing a stat
  snapshot, for the same reason it always did.
- **The last row is DPS, before and after** (2026-07-29, at the owner's
  request: "also show dps change (Ex 3 --> 5 dps)"). Damage and attack speed
  are the two numbers a player is really trading between, and neither answers
  the question alone — "+6 dmg" on a slow tower and "+0.4 atk/s" on a fast one
  can be the same purchase, and seeing that meant multiplying in your head,
  twice, before deciding. `UpgradeEffects.dpsChange` derives it from the same
  pair the Damage and Attack speed rows print, by the same definition
  `TowerStats.dps` uses for the panel, so the card and the panel underneath it
  cannot disagree. It is **last** because it is the conclusion of the rows
  above it — the same position the panel gives it. A tier that moves neither
  damage nor rate gets no row at all rather than "5.0 → 5.0".
  `UpgradeEffects.attackPair` is where the two config vocabularies are
  reconciled (the Longshot's `damage`/`fireRate`, the beam's `ad`/`attackRate`)
  — the same union `FIELDS` already takes for the individual rows.
- **The prose is per MECHANIC, not per tier.** `UpgradeEffects.MECHANICS` maps
  a flag name to one sentence; the numbers inside each sentence are
  interpolated from that mechanic's own resolved parameters. A name cannot go
  stale when a number is retuned, and B4 raising B3's execute cap makes the
  same ability read 60% instead of 40% with nothing to edit.
- **A tier grants flags under three spellings** — `grants`, `mechanics`, and a
  `flags` object — exactly as `StatResolver` reads them. `UpgradeEffects.
  grantsOf(tier)` is the one place that union is taken. The beam's B1 grants
  camo detection through `flags`, and its button said nothing but "+150 HP"
  until the description looked there too.
- **Cards are built on demand.** Assembling one resolves a tower's stats a
  second time and the panel lays itself out two or three times a frame, so an
  action carries a *thunk* and only the button under the cursor pays for it
  (`cardFor` in game.js). A card that costs nothing to build may be a plain
  object; `cardFor` takes either.
- The card is placed **beside the panel, never over it** — it would hide the
  button being hovered and flicker as the cursor left it — and is clamped
  inside the canvas and above the build bar.
- `tooltipLines` returns a flat display list carrying each line's own height;
  layout sums them and the drawing walks the same array, so the box can never
  be a different size from what goes in it. Same arrangement `inspectionLayout`
  has with `drawInspection`.

**Headroom warning.** The panel grows a row per stat and a 60 px rectangle per
button. The tallest case — a 5-2 Siphon, whose A5 adds a third button — uses
**608 of the 614 px** available between the canvas top and the build bar.
Adding a row to *every* tower's stat block will push it through the bar.
`tests/sandbox.smoke.js` walks six builds of all three upgradeable towers and
fails if any panel stops fitting.

---

## Target claiming — two towers never waste a shot on the same enemy

**The problem this solves.** Two gunners whose ranges overlap would both fire
at the same 1 HP enemy. The first bullet killed it; the second landed on a
corpse and paid nothing. With mirrored gunners it cost **one shot in four** —
measured at 4.00 shots per 3 HP kill, so a quarter of the player's firepower
evaporated. The more towers overlapped, the worse it got, which is why adding
a gunner could feel like it did nothing.

**The mechanism: bullets claim their damage up front.**

- `Bullet` calls `target.reserveDamage(damage)` in its **constructor** and
  `release()`s the claim when it lands or loses its target. It is done in the
  constructor, not in `Tower.fire`, so a future tower type that fires
  differently cannot forget to do it.
- `Enemy.unclaimedHealth()` = `health - incomingDamage`.
- `Tower.findTarget()` skips any enemy with `unclaimedHealth() <= 0`. That
  enemy is already dead on arrival and belongs to somebody else.
- A tower with no unclaimed target in range **holds fire**. Cooldown keeps
  ticking while it waits, so holding costs nothing — it fires the instant a
  real target appears.

Only the *wasted killing blow* is blocked. Two gunners still happily focus a
healthy 3 HP enemy, because it has unclaimed health for both.

**Firing priority: earliest along the path wins.** `Tower` records
`pathProgress` (via `GamePath.progressAtPoint`) at construction, and
`addTower()` keeps the `towers` array sorted by it. **The update loop is
therefore the priority order** — whoever runs first claims first, and later
towers see the claim and move on.

Earliest-first is the right way round: an enemy in range of two towers is
always closer to leaving the *earlier* one's circle, so that tower's
opportunity is the one about to expire. The later tower will get another look;
the earlier one will not. Towers projecting to the same point on the path
(mirrored across the road, say) tie, and the tie is broken arbitrarily —
correctly, since neither is earlier.

**Three things to preserve:**

1. `towers` must stay sorted by `pathProgress`. `addTower()` sorts on
   placement and `sellTower()` uses `splice`, which preserves order — so the
   array is sorted at all times without a per-frame sort. If you ever let a
   tower *move*, re-sort at that point too.
2. Every `Bullet` exit path must `release()`. There are exactly two (target
   lost, target hit) and both do. A third one that forgets would permanently
   inflate `incomingDamage` and make towers refuse to shoot that enemy.
3. `release()` happens *before* `takeDamage()` on impact — the claim reserves
   damage that has not landed yet, and at that moment it is landing.

Selling a tower does **not** cancel bullets it already fired: bullets do not
reference the tower that fired them, so they keep homing, still land, and
still pay. That is correct — the shot was already spent — and it is pinned by
a test.

---

## Balance math, and the failure signature to watch for

Wave burst throughput is `enemy HP / interval`: wave 1 delivers
`4 / 0.8 = 5 HP/sec`, and wave 2 delivers `4 / 1 = 4 HP/sec`. A gunner
outputs `damage × fireRate = 1.0 dmg/sec`. The five-second break gives towers
some catch-up time, but even two gunners are below either wave's arrival burst.

Measured with gunners beside the long straight over the complete OPENING (the
original two waves — the whole-run tests slice `WAVES` to them, since that is
the stretch the starting stake is tuned on):

- 1 gunner → 2 killed, 11 leaked, base ends at 66 HP.
- 2 gunners → 4 killed, 9 leaked, base ends at 83 HP.

(The previous figures here — 71/88/96 with 3 HP normals — predate the v0.3.5
roster change and were stale; the ones above are what `tests/run.js` pins.)

The opening contains `5 × 4 + 8 × 4 = 52` HP; the full thirty-five-wave
schedule contains **11 747 scheduled / 13 498 effective** HP (per-wave table is a
comment on `WAVES`). Damage dealt plus health leaked to the base must add back
to the *effective* total; that is the quickest whole-run conservation check —
note it is a check on HP, not on cash, and cash has been damage × 3 since
2026-07-30. (The figures here read 6466/8056 until 2026-07-30. Those were the
v0.4.6 schedule's and were left behind when v0.4.7 rewrote it; 11 747/13 498 are
what `tests/run.js` asserts and what the harness reports.)

**Effective, not scheduled, and the difference is v0.4.7's.** A shield is
health the player must remove and a Revenant is two bodies, so effective HP is
`count × health × (1 + shieldRatio) × (1 + revives)` per group. `remainingHealth()`
on an Enemy is the same idea at the instance level.

**Conservation has three exceptions now, and all are by design.**

1. Damage *landed* is what pays, and mitigation removes damage before it lands:
   a hit that armor eats entirely pays nothing and takes nothing off the enemy.
   So against `armored`, `brute` and `midboss` the player's cash still equals
   the HP removed, but the *shots fired* no longer divide evenly into it.
2. **A Hive's brood is not in the schedule at all.** Five hatchlings every
   seven seconds is unscheduled effective HP, and it PAYS NOTHING, so a run
   removes more health than the schedule names while earning exactly the
   schedule's worth. There is no closed form for the excess; that is the point
   of the enemy.
3. **Nothing the schedule names is unpaid.** `noBounty` is a per-spawn
   property, not a type one, so cash-equals-HP-removed still holds for
   everything in `WAVES` — it is only the broods that break it.

Shots per kill is therefore only a clean diagnostic on undefended, unshielded
bodies that were not born of a Hive — check it against scheduled normals.

**The whole-campaign arithmetic lives in `tools/simulate-campaign.js`** — it
plays the real schedule through the real loop under scripted building
policies (no towers, stop at N gunners, greedy build at `Maps.bestSpots`).

> **STALE as of the v0.4.5 roster change.** Every policy it scripts builds
> gunners, and gunners cannot answer camo (now waves 14/18/28) or brutes (now
> 20/22/31/34) by design, so "greedy honest building wins on every route" is no
> longer a claim this tool can make about the current schedule. It needs
> re-running, and it needs the policy v0.4.7 measured by hand in the browser:
> a core of gunners, then Longshots, then path A on each of them (A1 is the
> camo detection). The readings below are the *twenty-wave* schedule's, kept as
> the record of what was true then; the current figures are under
> "How v0.4.7 was measured" below and in the `WAVES` comment.

Its 2026-07-28 readings against the twenty-wave schedule, which were that
schedule's design targets:

- **No towers loses on every route** (base falls during waves 6–9), so the
  loss screen is finally reachable in real play.
- **Greedy honest building wins on every route**, finishing with enough spare
  cash that the $200 smasher is a real mid-run option (a full clear pays $454
  before spending).
- **Under-building is punished in proportion**: 4 gunners scrape through only
  on the easier routes; 6 wins everywhere but ends the hard routes on a
  sliver of base.

Run that simulator (and the burst arithmetic) before changing any of spawn
rate, enemy HP or type mix, tower damage or fire rate. It tells you the
answer faster and more reliably than playing.

**How v0.4.5 was measured, given no Node.** That session ran on a machine
where `node` does not exist, so none of the five suites could be executed.
Instead the real game was loaded from `file://` and driven through its own
`update()` from the browser console — what `tools/simulate-campaign.js` does,
by hand. **The schedule is measured, not guessed**, on all four routes:

| policy | rune-circuit | mana-coil | sigil-lattice | null-meridian |
|---|---|---|---|---|
| build nothing | dies w7 | dies w11 | dies w8 | dies w7 |
| gunners only, greedy at `Maps.bestSpots` | dies w25 | dies w30 | dies w26 | dies w17 |
| 25 gunners, then Longshots, A1 at w18 | **win, 60 base** | **win, 57** | **win, 72** | **win, 17** |
| the STARTER kit (gunner + Smasher only) | dies w25 | dies w30 | dies w26 | dies w17 |

That is the shape the schedule is for: spam loses, diversifying wins, the hard
route wins on a sliver. Note the middle rows — **a pure gunner board can no
longer win**, a deliberate change from v0.4.4, where it could. Camo and flat
armor are counters; a board with no answer to them is meant to fall short.

The last row is the meta-progression loop: a **fresh profile cannot win**,
because the Longshot (and its camo detection) has to be bought with coins
first. That first losing run pays 30–56 coins and the Longshot costs 40, so
the lesson and its answer arrive together. See "Meta progression" above.

Re-measured on 2026-07-29 after the Angry enemy and tower deaths went in; the
winning runs lose 3–18 towers to enemy attacks along the way, and still win.

**How v0.4.7 was measured, also given no Node.** Same method: the real game
loaded from `file://`, the real `update()` driven from the console, all four
routes, the whole 35-wave schedule.

| policy | rune-circuit | mana-coil | sigil-lattice | null-meridian |
|---|---|---|---|---|
| build nothing | dies w4 | dies w4 | dies w4 | dies w4 |
| gunners only, greedy at `Maps.bestSpots` | dies w20 | dies w21 | dies w20 | dies w18 |
| 20 gunners, then Longshots, buying path A as affordable | **win, 43 base** | **win, 94** | **win, 23** | dies w11 |
| 28 gunners, then the same | **win, 89** | **win, 94** | **win, 88** | dies w18 |

**The row that matters is the comparison, not the figures.** The identical
policy on the v0.4.6 schedule at v0.4.6 pacing finishes on **43 / 94 / 21** and
*also* loses on `null-meridian` (at w19 rather than w18). So 80% more effective
HP and two more waves left the survival margin almost exactly where it was.
Re-measured again after the Hive correction and the lane-offset rewrite:
unchanged.

That is the economy doing its job rather than luck: income is proportional to
damage ($1 per point when this was measured, $3 since 2026-07-30), so a heavier
schedule funds the towers that answer it. **What a turn-up
on this economy buys is more to DO, not a thinner margin** — which is the right
outcome for the easy tier, and worth knowing before anyone tries to make the
game harder by adding HP alone. If a future ask wants a genuinely harder tier,
the levers that are NOT self-funding are the ones to reach for: arrival
density, counter costs, and base HP.

What DID move sharply is wall-clock time: the same winning run takes ~730 s
instead of ~3100 s, because a board that clears its waves never waits out a
90 s break. `null-meridian` staying unwinnable for this policy is not a v0.4.7
regression — it was already unwinnable for it, and the v0.4.5 table above used
a hand-tuned line this crude policy does not reproduce.

**What is still NOT verified: the five unit suites.** In particular the pinned
opening figures above (1 gunner → 2 killed / 11 leaked / base 66; 2 gunners →
4 / 9 / 83) were not re-measured. A lane offset changes the chord an enemy
walks through a gunner's circle by about 1% — the perpendicular distance moves
by up to ±4.16 px against a 104 px radius — and a 4 HP normal takes ~3.9 damage
per pass, so 1% can flip a kill. If `tests/run.js` fails on one of those by one
or two, **that is this change**: re-record the number here and in the test. If
it fails by more, or anything else fails, it is a real bug.

**The one number that tells you whether firepower is being wasted: shots per
kill.** On a controlled stream of 3 HP enemies it should equal
`enemy HP / tower damage` exactly — 3.00 at the current tower damage. Wave 2's
4 HP enemies require 4.00 shots. Anything above the applicable figure is
bullets landing on corpses. The controlled 3 HP scenario sat at 4.00 with two
mirrored gunners before target claiming existed. If damage does not divide
enemy HP evenly, reason from the remainder rather than assuming a bug.

The deceptive failure mode can recur: under-DPS combined with "first"
targeting spreads damage across enemies that are about to exit, so several
escape with the same low HP and few die. It looks like a targeting bug, but it
can be a simple arithmetic shortfall. Check shots per kill and leaked remaining
HP before changing targeting.

**Two different faults produce the same "my towers do nothing" complaint, and
shots per kill separates them.** At 3.00, every bullet is doing its job and you
are simply short on DPS — add damage. Above 3.00, towers are wasting shots on
enemies that are already dead on arrival — that is a target-claiming
regression, and no amount of extra damage will fix it.

Targeting is "first" (furthest along the path within range), the genre default,
in `Tower.prototype.findTarget`. Other modes (last, strongest, weakest,
closest) belong there when wanted.

---

## Effects — feedback the simulation never reads back

`js/effects.js` (2026-07-28) is the game's juice: death bursts in the enemy's
own colour, "+$" bounty popups, a red screen-edge pulse when the base is hit,
the wave announcement banner, and now the Warbringer earthquake's camera kick
and temporary map fissures. The rules that keep it safe:

- **One-way information flow.** The simulation TELLS Effects things
  (`enemyKilled`, `baseHit`, `announce`); nothing simulated ever reads
  anything back. An Effects-free game must play identically — every
  `Effects` reference in game code is `typeof`-guarded, and the suites prove
  the neutrality by running the full game with effects live against pinned
  kill/leak/cash outcomes.
- **`Math.random()` lives here and nowhere else in the game loop.** Safe only
  because nothing simulated depends on these numbers. Do not derive a
  gameplay value from a particle. When the simulation needs something that
  *looks* scattered — the enemy lane offsets — it uses a deterministic
  low-discrepancy sequence instead, for exactly this reason.
- **It updates from `update()`, not `draw()`**, so effect timing rides the
  same fixed step as the world and freezes when the world freezes (loss,
  victory, the death-denial rewind). That freeze is correct: when time stops,
  everything stops.
- **It has three draw layers.** `drawGround` puts quake fissures over the road
  but under units; `drawWorld` carries particles/popups with the camera;
  `drawScreen` keeps the base flash and banner anchored. `game.js` wraps only
  the battlefield in `beginWorld`'s shake transform, so the HUD never moves.
  All three remain under interface chrome and reset in `restartGame()`.
- The event hooks live in `update()`'s end-of-life sweep (the one place an
  enemy's fate is decided exactly once) and in `spawnScheduledEnemy` (a
  wave's first spawn announces it). `Smasher.triggerQuake` tells Effects where
  the landing happened; it does not read the shake or cracks back. The gunner's
  muzzle flash is not in this file at all: it is DERIVED in `Tower.draw` from
  the cooldown, so it needed no state and no hook.
- Particle count is capped (`MAX_PARTICLES = 400`, oldest dropped) so a mass
  kill cannot grow the array without bound.

`sandbox.html` loads it too; `long-range-dps-debug.html` (superseded) does
not, which the guards make harmless.

---

## The debug cash panel is temporary — remove it before release

`js/debug-cash.js` puts a floating panel in the bottom-right corner that grants
arbitrary cash. **The owner asked for it for testing and asked for it to be
removed afterwards.** It is loud on purpose: dashed magenta border, the words
"REMOVE BEFORE RELEASE" across the top.

**To remove it:** delete the file, delete its one `<script>` line from
index.html. That is the whole job. Nothing in the game refers to it, and no
game code was shaped around it.

Two deliberate choices worth preserving if you add other debug tools:

- **It is DOM, not canvas.** No debug code in the render loop, no debug
  branches in the input handling, and it is visibly not part of the game.
- **It is not loaded by the tests.** `tests/harness.js` skips
  `js/debug-*.js`, so the suite exercises the shipping game. Keep the
  `debug-` prefix for anything similar.

The one place the game *did* change for it is the `INPUT`/`TEXTAREA` guard in
`onKeyDown`, and that is worth keeping regardless.

---

## Deliberately out of scope right now

The owner has explicitly excluded these. Do not add them unprompted:

- Moving a placed tower (selling exists; drag-to-reposition does not)
- Sound

He is building the foundation before choosing a direction. Adding content now
is actively unhelpful.

**2026-07-29: "Save/load" came off this list.** The owner asked for meta coins
"kept in between run", and a currency that resets on refresh is not a currency.
What was built is the narrowest thing that satisfies that — three fields in
`js/meta.js` (coins, owned, equipped) and nothing else. **Run state is still
not saved and must not be**: no resuming a run, no saved boards, no settings
file. If a future ask needs one of those, it is a new decision, not an
extension of this one.

**2026-07-28: "Multiple enemy types" and "menus" came off this list** in the
v0.3.5 fusion. Both already existed on the other branch -- `Enemy.TYPES` and
the map chooser -- so the choice was to merge them or to throw away working,
tested content. Neither was added speculatively here. The same guard still
applies to anything new: no more enemy types, and no more menus, without an
explicit ask.

**2026-07-28, later the same day: the owner asked for six more types by
name** -- a low-HP swarm, a 20%-armor normal, a slow high-HP one with 5 flat
armor, camo normals and camo fasts, and an early ~250 HP midboss with 10%
armor -- plus the lane offsets. That is the explicit ask the guard above was
waiting for, and it is why the roster is nine and not three. It does NOT
generalise: a tenth type still needs its own ask.

**2026-07-29, later: the wave 35 BOSS was specified and built.** The owner had
asked, that morning, for the slot to be held empty while he thought about it;
that afternoon he gave the full spec (2500 HP, slow, mid-wave, stuns towers for
2 s, roars at half health for a shield / speed / rate of fire / a called-in
crowd at 1.5x). That is the ask this guard was waiting for. It does NOT
generalise to a second boss, or to putting one on any other wave.

**2026-07-29: the owner asked for three more by name** -- one with a shield
worth twice its health that doubles its speed once the shield is broken; one
that, when it dies, stops moving and heals to full life once; and a 150 HP slow
spawner with a shield equal to its life that seeds five normals every few
seconds and gives no money. That is the ask, and it is why the roster is
thirteen. The guard is unchanged: a fourteenth type still needs its own ask.

**The wave 35 boss is the live example of that guard working.** The owner asked
for a boss *and then asked for it to be held back* -- "don't add it yet, I'm
gonna think about it a bit more so the boss is original and marking". An
assistant filling that slot with an invented boss would be doing exactly what
this list exists to prevent.

**2026-07-26: "Tower levels or upgrades" and "multiple tower types" were
removed from this list.** Both were built today (the Longshot tower, see
below) against an explicit, fully-specified request -- not added
speculatively. If a future session is asked to add a *third* tower or another
upgrade tree without a similarly explicit ask, treat that the way this list
originally intended: check with the owner first. This paragraph is the record
of why those two items are gone rather than just silently vanishing from the
list.

---

## Content: routes, enemy types, targeting modes, the smasher

All four arrived in the v0.3.5 fusion. Each one is built the same way: **the
data is in one place and everything else is derived from it.** That is the
property to preserve when extending any of them.

**Maps (`js/maps.js`).** Six in the current pool. Four are authored at
`AUTHORED_AT_PX_PER_UL`; Shifting Ley and Twin Confluence are deterministic,
versioned generator outputs with fixed seeds. `rune-circuit` is the reference
and remains the original path.

Every map owns a full non-gameplay environment: a `theme` palette, at least
four large coloured `zones`, nine top-down machinery `models`, and its older
`decorations` as fine-detail decals. `Maps.drawEnvironment` paints manufactured
floor panels, deck bays, circuit trunks, reactors, pylons, consoles, tanks,
servers, vents, antennae, holograms, coils and gates under the road. The road
uses the same map theme for its casing, surface, edge glow and segmented energy
guide. All of this is **background only**. None of it is read by `Maps.analyse`,
`buildableSpot`, path construction, placement or targeting. Coordinates pass
through the same authored-pixel scale as the road, so a UNIT_LENGTH retune
cannot pull scenery away from its map.

`Maps.routesOf` normalizes every map to route definitions. Authored single-route
maps may keep `points`; generated maps use `routes`. The runtime owns `paths`
plus a primary-route compatibility alias `path`.

Twin Confluence has two entrances and one shared endpoint. Each fixed schedule
beat is mirrored onto both routes and advances the wave cursor once, so it has
twice the enemy bodies at unchanged timing. Enemies, broods and boss summons
carry the route they belong to.

The difficulty label on each card is **measured, not declared**.
`Maps.analyse` walks the road and asks, at every legal building spot, how much
road the reference Rifleman standing there could actually shoot — using the game's own
clearance rule, so it can never count a spot the player is not allowed to use.
Score is `(coverageRatio² × graceRatio × routeCount)^⅓`, where coverage is the straight-road
yardstick over what the map's good spots actually offer, and grace is the
reference length over this route's length. 1.00 is "as hard as a plain
straight road". The analysis is cached on the map object, not recomputed.

Two findings from that measurement are worth not re-deriving: **turn count
barely matters** (a corner helps the tower on the inside and hurts the one on
the outside, and they cancel), and **length matters least** — every enemy
walks past every tower regardless, so length only changes how long you have
before the first leak. What actually moves the number is whether the road
comes back *near itself*, within the Rifleman's reach of a second lane.

**Enemy types (`Enemy.TYPES`).** Nineteen since the selective v0.4.10.0 merge:
**fourteen on Easy, all nineteen on Normal and Hard**.

| id | HP | speed | armor | defense | camo | size | first seen | what it asks of the player |
|---|---|---|---|---|---|---|---|---|
| `normal` | 4 | ×1.0 | — | — | — | 1.0 | 1 | nothing in particular |
| `fast` | 2 | ×1.75 | — | — | — | 1.0 | 3 | coverage early on the road |
| `slow` | 7 | ×0.8 | — | — | — | 1.0 | 5 | sustained damage |
| `swarm` | 1 | ×1.3 | — | — | — | 0.55 | 7 | *rate*, not damage — every body dies to one hit, the question is how many hits per second |
| `armored` | 4 | ×0.95 | — | 20% | — | 1.05 | 9 | a flat 20% tax on every hit; blocks nothing outright |
| `midboss` | 250 | ×0.45 | — | 10% | — | 1.8 | 11 | that a board exists at all by wave 11 |
| `angry` | 14 | ×0.7 | — | — | — | 1.25 | 13 | that you can afford to LOSE towers — it hits them for 20 every 2.5 s |
| `camo_normal` | 4 | ×1.0 | — | — | **yes** | 1.0 | 14 | camo detection (Longshot A1 / beam B1) |
| `flying` | 6 | ×1.2 | — | — | — | 0.85 | N12 / H12 | air eligibility — ground-only towers cannot target it |
| `shielded` | 12 **+24 shield** | ×0.9, **×1.8 broken** | — | — | — | 1.15 | 15 | that the damage is READY when the shell pops, not that there is more of it |
| `camo_fast` | 2 | ×1.75 | — | — | **yes** | 1.0 | 18 | the same as camo_normal, under time pressure |
| `brute` | 40 | ×0.55 | **5** | — | — | 1.5 | 20 | a weapon that hits for more than 5 — gunners and the beam do **zero** |
| `revenant` | 16 **×2 lives** | ×0.85, **0 after** | — | — | — | 1.2 | 21 | attention — a parked body keeps eating shots meant for the wave behind it |
| `hive` | 150 | ×0.4 | — | — | — | 1.6 | 26 | speed of kill — it seeds 5 normals every 7 s, and each of THOSE wears a shield equal to its life and pays nothing |
| `boss` | 2500 **+200 at half** | ×0.3, **×0.405 after** | — | — | — | 2.4 | 35 | DEPTH — it stops, aims, and hits your single best tower for 45 and a stun; after the roar it also leaps 50 u.l. and shockwaves whatever it lands beside |
| `shieldbearer` | 60 | ×0.45 | — | — | — | 1.35 | N16 / H15 | that you shoot the SUPPORT — 20 shield to the 10 strongest bodies every 10 s, stacking, and none of it pays |
| `healer` | 200 | ×0.4 | — | — | — | 1.45 | N24 / H24 | BURST — 15 HP/s for 4 s to the 3 most wounded every 8 s, and healed HP pays nothing either |
| `boss_fast` | 750 | ×3.5 **for the first 400 u.l.**, then ×1.75 | — | — | — | 1.9 | N32 / H32 | TEMPO — 100 shield every 7 s that never stacks, on a body that crosses the opening stretch faster than anything else in the game |
| `camo_heavy` | 20 | ×0.65 | **5** | 20% | **yes** | 1.4 | N18 / H18 | that SEEING it and KILLING it are two separate purchases |

The four v0.4.9 additions and the Aether Wisp are **Easy-absent by design** and
scheduled on both higher tiers. The index derives per-difficulty appearances;
the sandbox's type dropdown still exposes every roster row individually.

Speeds are stored as **multipliers** of `BASE_SPEED_ULPS` so retuning the
walking speed moves the whole roster in proportion; health is stored as plain
numbers because each figure is its own balance decision.

**The three original types were left untouched** when the six were added —
same health, same speed, same colours, same sprite size — so every wave that
already used them behaves exactly as it did. The v0.4.7 three did not touch
anything either.

**The v0.4.7 three are all gated behind the midboss**, at the owner's request:
the first eleven waves are the introduction and have no vocabulary for a shield
or a second life. A test asserts none of them appears before wave 12.

**Flat `armor` vs percentage `defense` is the whole design of the two tanky
types**, and they are not interchangeable. Percentage scales with the hit, so
`armored` taxes everything evenly. Flat subtracts before anything else and
there is **no damage floor** (`js/systems/mitigation.js`), so `brute` is a
hard *counter* — a 1-damage weapon does nothing to it, however fast it fires.
Do not "fix" that with a `Math.max(1, …)`; it deletes the counter.

**Behaviour is DATA, not a branch on the type id.** The `angry` type was the
first enemy that did anything but walk, and it did not get a special case: it
carries an `attack: { damage, reachUl, intervalSeconds }` block, and
`Enemy.prototype.attackTowers` asks *"does this enemy have an attack"*, never
*"is this enemy angry"*. The file's founding rule — "no type has behaviour of
its own, so nothing branches on which one an enemy is" — still holds across
**seven** mechanic blocks now, each read by one method that asks whether the
enemy HAS one:

| block | what it does | read by |
|---|---|---|
| `attack` / `attacks` | one attack, or a POOL it cycles through | `attackTowers`, `Enemy.attacksOf` |
| `shield` | a pool that soaks damage first, and what breaking it does | `takeDamage`, `breakShield` |
| `revive` | gets back up, at `healFraction` of full, `times` times | `tryRevive` |
| `spawns` | seeds a brood as it walks | `spawnMinions` |
| `phases` | changes what it IS at a health threshold | `checkPhases`, `enterPhase` |
| `support` | helps OTHER enemies on a timer — shields or heals them | `supportAllies` |
| `sprint` | faster over the OPENING stretch of road, then never again | `currentSpeedUlps`, `isSprinting` |

Tests pin the exact membership of each list — `attack` is `["angry", "boss"]`,
`shield` is `["shielded"]`, `revive` is `["revenant"]`, `spawns` is `["hive"]`,
`phases` is `["boss"]`, `support` is
`["shieldbearer", "healer", "boss_fast"]`, `sprint` is `["boss_fast"]` — so a
type gaining a mechanic by accident is caught. Adding an eighth mechanic means
an eighth block and one method that reads it, not a branch in an existing one.

**`sprint` is on this list even though it is two lines**, and that is the point
of the pattern rather than an over-application of it: the alternative was a
`if (typeId === "boss_fast")` inside `currentSpeedUlps`, which is exactly the
branch this whole arrangement exists to prevent.

**A type carries either one `attack` or a pool in `attacks`** — the same
one-or-many arrangement a wave has with `groups`, reconciled in one place by
`Enemy.attacksOf`, so nothing downstream cares which form it got. The pool is
copied onto the instance because it GROWS: the boss's roar appends its leap.

**The shape of an attack, all of it data on the spec:**

| field | what it does |
|---|---|
| `windUpSeconds` | the enemy STOPS for this long, then it resolves |
| `target` | `"highestDps"`, or nearest by default |
| `targets` | how many it takes; 1 unless stated |
| `damage` / `stunSeconds` | independent — either, or both |
| `leap` | `{ distanceUl, radiusUl }` — jump forward, then hit everything near where it LANDED |

The Angry is one attack: 20 damage to the nearest tower, no stun, no wind-up. An
area attack that DESTROYS towers is a much bigger balance decision than anyone
has asked for, which is why `targets` stays 1 there. See "The wave 35 boss"
below for what a pool looks like.

**Stun lives in `js/systems/tower-health.js`**, beside tower HP, because it is
the same kind of thing: per-tower state every type must honour and no type
should have to implement. `TowerHealth.stun / isStunned / tickStun`, and the
enforcement is a single `continue` in the main loop — the one place all four
tower types come through. A per-type implementation would be four chances to
forget.

A stunned tower does **nothing**, cooldown included, so two seconds of stun
really costs two seconds of output rather than being partly absorbed by a
cooldown that kept running underneath it. `stunTimer` is deliberately not
initialised by the plain tower constructors: `undefined > 0` is false, so an
un-stunned tower reads as un-stunned without anyone remembering a field. The
config-driven cores do initialise it to zero and their adapters mirror it.
Both shapes fail safe in the same direction. Longest stun wins and a shorter
one cannot cut a longer one short, exactly as with `Enemy.applySlow`.

That silence includes facing and presentation. Directional towers keep their
last `aim` because the central gate never calls their target update. Siphon is
the one special visual case: its stored locks contain live enemy objects, so
`visibleLocks()` hides its beams for the duration of a stun while preserving
the locks and ramp underneath. Otherwise a non-damaging beam would visibly
swivel after a moving target and make the tower look active while disabled.

**Shields (v0.4.7).** `shield: { ratio, onBreak }`. The pool is sized as a
MULTIPLE of the enemy's own health at construction (`maxHealth * ratio`), never
as a flat number — so a wave that scales the type with a `health` override
scales its shield in step, and there is no second figure to forget to retune.
Four rules:

- **The shield soaks first, and a bigger hit SPILLS THROUGH into health.**
  Stopping the overflow at the shell would waste the excess of every heavy
  weapon, which is the same class of waste target claiming exists to prevent.
- **`unclaimedHealth()` counts the shield**, and it has to. A Bulwark stands at
  full health behind 24 points of shield; measuring claims against health alone
  would let 12 points of claims mark a 36-point enemy as dead on arrival and
  every tower on the board would stop shooting it.
- **`Targeting.score` counts it too** — `remainingHealth()` for
  weakest/strongest, so a full-shielded Bulwark reads as the tank it is.
- **A LEAK does not.** `baseHp -= gone.health`, still: a shield is armour the
  enemy was wearing, not mass it throws at the base. A Bulwark that walks in
  untouched costs 12, which is what makes its 36 points of toughness a cost in
  *time* rather than a bigger leak.
- **AND THE TILL DOES NOT.** See below.

**A SHIELD PAYS NOTHING, EVER** (2026-07-30, the owner's exact words: *"make it
so that shield gives 0 money, ever"*). This is a fifth rule and it changed a
number the rest of this document leaned on for a long time, so it is worth
being precise about what moved:

- **`Enemy.takeDamage` returns only what landed on HEALTH.** The shield still
  soaks in full, still spills through, still flashes — the *return value* is
  what changed, and that value has always meant "what this blow was worth to
  the player" rather than "what it removed". It is the same door a Hive's
  brood already came through, which is why one edit covered every till at once:
  cash, the beam's lifesteal, its charge meter, and each tower's damage
  counter. **A Siphon chewing a shield now earns no lifesteal and no charges**,
  which follows from the same principle and was not separately asked for.
- **`Enemy.bounty()` is `maxHealth`, not `maxRemainingHealth()`.** The two
  answer different questions and only one of them is about money. The death
  popup over a Bulwark reads its 12, not the 36 the player had to remove.
- **`waveEffectiveHealth` did NOT change**, and must not. It measures what the
  player has to REMOVE — which is what the 13 498 target and the clear bounty
  are a tenth of — and that is still 13 498. It is simply no longer a purse.
  **Confusing the two is now the easiest way to get the economy wrong**; there
  is a warning to that effect on the function itself.
- **What it costs the player is exactly 1 364 HP** — the shields the schedule
  carries, all of them Bulwarks — so **$4 092 off a $42 443 purse, a 10% pay
  cut** concentrated on precisely the waves that carry them. Measured against
  the real `WAVES`, not estimated. Nobody has asked for the schedule or the
  prices to move in compensation and neither was touched.

**HEALED HEALTH PAYS NOTHING EITHER**, for the same reason and by the same
mechanism — `healedHealth` on the instance is health the player has already
been paid for once, it sits on top of `health`, and it is the first thing a
blow takes off. Without it a Healer would be an income tap instead of a tax.
A revive deliberately does NOT count as healing: a second life is scheduled
(`waveEffectiveHealth` counts it, the index prices it) so it pays in full, and
`tryRevive` clears the healed pool to say so.

`onBreak` is what happens when the pool empties; the Bulwark's is
`{ speedMultiplier: 2 }`, applied to a per-instance `speedScale`. That scale
MULTIPLIES with the timed slow rather than replacing it, so a slow still works
on a broken Bulwark.

**Revives (v0.4.7).** `revive: { times, healFraction, roots }`. `takeDamage`
asks `tryRevive()` before setting `dead`, so a revived enemy never registers as
a kill, never pays a bounty and never fires a death effect. `roots` sets a
permanent `rooted` flag that `currentSpeedUlps()` reads as zero.

**A rooted Revenant cannot soft-lock a run, and the reason is structural rather
than lucky:** it comes back exactly where it fell, and it fell because
something shot it there — so a tower already covers that spot. The only way to
strand one is to sell or lose that tower afterwards, and the answer to that is
to build within reach of it, which the player can always do. Waves are
unaffected either way: a break still ends on the 90 s ceiling whether or not
the board is clear. Do not "fix" this with a decay timer; it would delete the
mechanic to protect against a case the player already controls.

**Spawners (v0.4.7).**
`spawns: { count, type, intervalSeconds, health?, shieldRatio?, noBounty?, armor?, defense? }`.

`spawnMinions(dt)` RETURNS the brood rather than pushing it anywhere, for the
same reason `attackTowers` is separate from `update`: the enemy list belongs to
the main loop, and an enemy reaching into a global `enemies` array would spawn
into the codex's parked sprites and into every test that only wanted something
to walk. The loop collects broods into a separate list and appends them AFTER
the walk — `enemies.length` is re-read every iteration, so a brood pushed
mid-walk would be stepped on the frame it appeared.

The brood drops at the parent's own progress, not at the mouth of the road. A
spawner that seeded the start of the map would just be a wave on a timer;
dropping them at its feet is what makes killing it early actually save you the
walk they would have had.

It is also **staggered backwards** by `Enemy.BROOD_TRAIL_UL` (12 u.l.) per
hatchling, clamped at 0. Without that all five share a progress value, and
since they also share a walking speed they stay in a perpendicular rank for the
rest of their lives — five bodies abreast, which is precisely the unnatural
look the lane offsets exist to prevent. Trailing them reads as a brood coming
out of the parent.

**THE COST OF A HIVE IS ITS BROOD, NOT ITS BODY**, and getting that round the
wrong way was a real misreading during v0.4.7 (the first pass shielded the Hive
and made *it* pay nothing). The Hive is an ordinary 150 HP body that pays
ordinarily. Each **hatchling** is a normal carrying a shield equal to its own
life and paying nothing — so every seven seconds a living Hive puts 40 points
of unpaid effective health on the road, forever, and how much that costs you is
decided by how fast you kill the parent.

**Those two properties live on the SPAWN, not on the `normal` row.** They are
facts about how those particular bodies were born; on the type they would have
shielded every normal in the campaign. The `Enemy` constructor's fourth
argument (`overrides`, the old `defenses`) carries them — `shieldRatio`,
`noBounty`, `armor`, `defense` — and the constructor prefers an override to the
type's own value. A test asserts a scheduled normal is still unshielded and
still pays, which is the assertion that would have caught the mistake.

**`noBounty` is enforced at exactly one door**, wherever it comes from:
`Enemy.takeDamage` returns `0` instead of the damage dealt. That return value
has always meant "what this hit was worth to the player" — it is why overkill
is clamped out of it — so every consumer is covered by construction rather than
by audit: cash, the beam's lifesteal, its charge meter, and the tower's own
damage counter. Note `this.noBounty` and `this.shieldOnBreak` are read off the
INSTANCE, not `this.type`, for the same reason: a shield that came from a spawn
has no type row to look it up in.

**Support (v0.4.9).**
`support: { intervalSeconds, pick, targets?, reachUl?, shield?, stacks?, heal? }`.

The sixth mechanic block, and the first that acts on **the road rather than on
your board**. `attack` hits towers; `support` hands out shields or
regeneration to other enemies on a timer. `supportAllies(dt, enemies)` reads
it, and — like `spawnMinions` and `attackTowers` — it is **separate from
`update(dt)`** because it needs the whole enemy list and `update` needs nothing
but the path. The main loop calls it once per enemy per step, **after the brood
is appended** (so a hatchling born this step is a candidate) **and before the
towers act** (so a shield granted this step is a shield they have to shoot
through this step).

| field | what it does |
|---|---|
| `intervalSeconds` | how often it pulses. Starts FULL, like the attack and brood timers — no free pulse the instant it walks in |
| `pick` | `"strongest"` (most life still standing, `remainingHealth()`), `"mostMissingHealth"` (whoever your board just hurt), or `"self"` |
| `targets` | how many it takes, best first; ignored by `"self"` |
| `reachUl` | how far it reaches. **Omitted means the whole map**, which is what both walking supporters use |
| `shield` | points granted, with `stacks` deciding whether they pile up or merely refresh a pool of that size |
| `heal` | `{ perSecond, seconds }` — regeneration put ON the target, which then ticks in **its own** `update()` |

Five things about it that are decisions rather than details:

- **The supporter is a candidate for its own pulse.** It is not "help somebody
  else", it is "help the strongest", and a 60 HP Shieldbearer usually *is* one
  of the ten. The fast boss's self-shield is the same block with `pick: "self"`
  rather than a second mechanism.
- **A heal outlives the Healer that granted it**, because the timer lives on
  the target. That is what makes killing the Healer mid-pulse feel like the
  right play rather than a wasted one: you stop the *next* four seconds, not
  this one.
- **Heals are TAKEN, never stacked** — the same rule `applySlow` follows, and
  for the same reason. A stronger heal replaces a weaker one, an equal one
  refreshes the duration, a weaker one cannot dilute what is running. Two
  Healers make the regeneration *last* rather than double, which is what keeps
  "15 HP/s" a number the index can state truthfully. **Shields are the
  opposite** and stack by default, because the Shieldbearer was specified that
  way; `stacks: false` is what the fast boss uses to get a refreshed pool
  instead of a growing wall.
- **`grantShield` moves `shieldMax` with `shield`**, always. It is what the
  shield bar is drawn against, so a grant that raised one without the other
  would draw a full pool as a sliver or overflow the bar.
- **A pulse that finds nobody still burns its interval.** A Healer beside a
  healthy wave waits out its full eight seconds rather than retrying every
  frame — an ability that fired the instant the first shot landed is not a
  rhythm the player can read.

**Sprint (v0.4.9).** `sprint: { untilUl, speedMultiplier }`, read by
`currentSpeedUlps` and by `isSprinting()`. Keyed on **progress along the road,
not on a timer**: it is a fact about which part of the *map* the enemy is on,
so a slowed sprinter still gets its full 400 u.l. of running rather than
watching the boost tick away while it crawls. The multiplier composes with the
timed slow and with `speedScale` like everything else, so a 50% slow halves a
sprint rather than cancelling it.

The wake behind a sprinting body is drawn from `path.tangentAt(progress)`, not
from `positionAt(progress - n)`, and that is load-bearing: the index screen
parks a sprite at a card position while its `progress` still says 0, and a wake
computed from the path would be a stray line running from the card off to the
mouth of the road.

`attackTowers(dt, towers)` is deliberately **separate from `update(dt)`**.
Movement needs nothing but the path; attacking needs the board, and threading
`towers` through `update()` would force every caller that only wants an enemy
to walk (the tests, the codex's parked sprites) to supply one. The main loop
calls both, in that order, and sweeps destroyed towers immediately after — so
a tower killed this step cannot also get a shot off.

It hits the **nearest single tower in reach**, not everything in reach: an
area attack on towers is a much bigger balance decision than was asked for.
When nothing is in reach the timer stays expired rather than restarting, so
walking into range is punished immediately instead of buying a free interval.

**Camo blocks TARGETING, not incidental damage.** `Targeting.sees` (used by the
gunner, the smasher, the Soldier and its recruits) and `RangeFilter.canTarget`
(used by the Longshot and the beam) both refuse an undetected camo enemy. A
`SoldierRecruit` gets the rule for free by spelling `x`, `y`, `rangePx`,
`targeting` and `seesCamo` the way a tower spells them — `Targeting.pick`
duck-types a shooter, which is what let a non-tower unit reuse all six
targeting modes and the camo rule without a line of new logic. What deliberately does
*not* check camo is collateral: the smasher's B4 blast, the Longshot's B5
blast, and a `PierceBullet` travelling through a crowd all hit whatever they
physically reach. Those are consequences of a hit that already landed, not a
choice of target.

**The smasher's swing is collateral too** (2026-07-29, at the owner's request —
"aoe units do not hit camos, even if in their range whilst the tower is
attacking another unit"). `Smasher.prototype.covers` used to check
`Targeting.sees`, so a hammer already coming down on a visible enemy passed
harmlessly through a camo standing in the middle of the wedge. It no longer
does. The rule is now split across the two places that decide different things:

| question | who answers | camo? |
|---|---|---|
| who does the wedge turn towards | `facingTarget` → `Targeting.pick` | yes, refuses |
| is a swing worth spending | `update` → `sightedIn` | yes, needs one visible |
| what the swing damages | `covers` | **no — physical reach only** |

**This does not weaken the camo waves, and not by luck.** A wave names exactly
one type, so during waves 13/16/26 there is nothing visible on the board for a
detectionless smasher to swing at, and `sightedIn` keeps its hammer still. The
counter-cost split the schedule depends on is untouched. Both halves have a
test — "a swing lands on camo caught in the zone, without detection" and "a
smasher alone still cannot clear a camo wave" — and if you ever remove the
`sightedIn` guard, the second is the one that will tell you what you broke.

**`sizeScale` is per-type** since 2026-07-28, which the old comment in
`enemy.js` forbade. The reason it was forbidden was that the frost ring (15 px)
and the hover ring (20 px) were hand-tuned constants that only cleared each
other at one body size. Both are now derived — `radiusPx() + 4` and
`radiusPx() + 9` — so the 5 px clearance holds at every size, and at the
original radius of 11 they are still exactly 15 and 20. Everything that needs
the sprite's extent (body, rings, hit test, health bar, hover readout) reads
`radiusPx()`.

A wave says how many and how often, **never how tough** — health comes from
the type, unless the wave carries a `health` override (waves 17–31 do, bar the brutes at 18). An
unknown type id throws rather than silently defaulting to normal.

Do not confuse a *slow enemy* (a walking speed) with a *slowed* enemy (a timed
debuff). Slows do not stack: the strongest wins, an equal one refreshes the
duration, a weaker one does neither.

**Lane offsets: enemies do not walk in single file** (2026-07-28). Each enemy
carries a signed `laneOffsetUl`, and `Enemy.positionAt` pushes it that far
**perpendicular to the road** (via `GamePath.tangentAt`, so it follows the
corners). Three rules keep it honest:

1. **In u.l., not pixels.** Unlike `RADIUS_PX`, this offset moves the enemy in
   the *world* — towers measure range to the offset position — so it has to
   scale with `UNIT_LENGTH` or `tests/run.js`'s "changing UNIT_LENGTH" group
   (same run, same outcome at half the constant) stops holding.
2. **Deterministic, never `Math.random()`.** `Enemy.laneOffsetFor(n)` is a pure
   function of the spawn index, which is handed out by `Enemy.laneSequence` and
   reset in `restartGame()`. Random lanes would make every pinned kill/leak/
   base-HP figure in the suite a coin toss — and `Math.random()` lives in
   `js/effects.js` and nowhere else in the simulation for exactly that reason.
3. **One place computes it.** `positionAt(progress)` is the only conversion
   from progress to position; anything that writes `progress` directly calls
   `refreshPos()` (knockBack, the sandbox spacer, the test harness) rather than
   `path.pointAt`, or the enemy snaps back onto the centreline.

**2026-07-29: the offsets were a low-discrepancy sequence and they looked
WRONG.** They were the fractional parts of multiples of the golden ratio, on
the reasoning that consecutive spawns should land far apart and therefore look
scattered. They do land far apart — that is the problem. The first twenty
offsets were

```
+0.24  -0.53  +0.71  -0.06  -0.82  +0.42  -0.35  +0.89  +0.12  -0.64  ...
```

a near-perfect alternation with a regular amplitude staircase, and on screen it
read as a column of enemies weaving down the road in a sine wave. The owner's
words: *"they just look like a wave, not random at all, which is very
unnatural."*

**A low-discrepancy sequence is designed never to cluster, and clustering is
most of what randomness looks like.** Two bodies side by side and then a gap is
what a crowd does; perfect spacing is what a machine does. Measured over 4000
spawns the golden sequence flipped sides 76% of the time and put ZERO
consecutive pairs within 0.12 of each other.

`laneOffsetFor` is a **hash** now — index in, offset out, no state — and over
the same 4000 spawns it flips sides 49% of the time and clusters 479 pairs.
Mean amplitude is unchanged at 0.50, which is what keeps the balance figures
comparable: enemies are spread as widely as before, just no longer *evenly*.
`tests/content.test.js` pins both measures, so a future "let's use a nicer
sequence" change fails rather than quietly bringing the waveform back.

**The mixer is 32-bit integer arithmetic on purpose.** `Math.imul`, `^` and
`>>>` are exactly specified, so the same index gives the same offset in every
JS engine. Do not rebuild it on `Math.sin`: the spec lets engines approximate
the transcendentals differently, and the same run would then walk differently
on different machines. `Math.imul` is the one non-ES5 call in the codebase —
used because a plain `*` on two 32-bit values overflows a double's exact range,
present in every browser since 2013, and needing no transpilation, so the
no-toolchain rule is intact.

**`LANE_SPREAD_UL = 7` since 2026-07-29, up from 4**, also at the owner's
request. Four was chosen to keep every sprite on the tarmac and the result was
a column that barely left the centreline. Seven is a little under two thirds of
the road's half-width (`ROAD_WIDTH_UL / 2 = 10.9375`), and **full-size sprites
now hang off the edge of the road**. That is the accepted cost, not an
oversight: a sprite is 22 px across on a 22.75 px road, so *any* visible spread
overhangs — even 4 did, by about 4 px. Small bodies (the swarm at 0.55 scale)
stay on it comfortably, which is where the scattering reads best anyway. If it
ever has to be undone, the real fix is a wider road, not a narrower spread.

Per-type `laneSpread` still scales it — the midboss sits at 0, the brute at
0.35, a swarm takes the full width.

**This change moves the balance slightly, and it was not re-measured.** The
offset changes how long an enemy spends inside a tower's circle by about 1%,
and the opening figures below sit on a knife edge (a 4 HP normal takes ~3.9
damage from one gunner as it walks past). See the note at the end of Balance
math.

**Targeting modes (`js/targeting.js`).** first, last, weakest, strongest,
fastest, nearest. One button in the inspection panel cycles them, laid out by
`inspectionLayout` for any tower with a `targeting` string, so a new tower
type gets it without opting in. Ties break towards the enemy furthest along —
without that the pick flickers frame to frame.

**Careful: two things called targeting.** `js/targeting.js` answers *which*
reachable enemy to shoot. `js/systems/range-filter.js` (`RangeFilter`) answers
*whether* an enemy is reachable at all — range, deadzone, cone, camo, flying.
They were both called `Targeting` on the two branches; the merge kept the name
for the first and renamed the second.

**The smasher (`js/smasher.js`).** Melee AoE: a 120° wedge, 31.25 u.l., 12
damage every 4 s, $700. It **holds its swing** until something is in the zone
rather than swinging on a fixed rhythm — the zone is narrow enough that a
fixed rhythm would miss most enemies. Two five-tier branches under the same
crosspath rule as the Longshot (tier 3 locks the other branch at 2), bought
through the same shared `buyUpgrade` in `game.js` and shown through the same
generic `panelActions`/`performAction` panel.

### Path A's overhead forge-slam (presentation only)

Path A now has a **0.48 s cosmetic wind-up** instead of the base/B path's
0.2 s window. `swingProgress()` is still derived from cooldown and damage still
lands only when cooldown reaches zero, so this changes no attack timing. During
the wind-up `hammerEchoProgresses()` supplies three older top-down poses behind
the live hammer head. On impact `pathAImpact` captures aim, range, arc and
full-circle state and draws deterministic orange-edged floor fractures clipped
to that exact AoE for 1.6 s. Capturing the geometry matters: the tower can turn
before the cracks fade, and a live read would make them slide.

**B4's blast used to be very conditional, and that turned out to be a BUG
rather than a design** (fixed 2026-07-30). The old note here said the enemy
"must survive one swing to pick up the slow AND still be in the zone for the
next one" and asked that nobody loosen the condition without being asked. The
owner asked: *"when the b4 warbringer attacks and kills the enemy they don't
explode, however they should be because attacked enemies are slowed even if
they die instantly."*

He is right, and the old behaviour was incoherent rather than strict. `swing()`
recorded `wasSlowed` **before** the blow and applied its own slow **after** it,
so the only thing that could ever have slowed a first-swing victim was the swing
that had not happened yet — a one-shot kill never burst, however slowed the
enemy "should" have been. **The fix is the ordering**: the slow lands, then the
damage, then the burst. The `wasSlowed` guard is gone entirely and would be dead
code if it stayed — B4 requires B3, B3 grants the slow, so every Warbringer that
can burst at all slows everything it swings at.

### Path B, rebuilt 2026-07-30 — range, a chain reaction, and the earthquake

Four things were asked for in one instruction, and all four are on branch B.

**Range on B2 (+15 u.l.), B4 (+10) and B5 (+15).** Path B granted none at all
before; a full B Warbringer now reaches **71.25 u.l.** against the 31.25 it
used to, and A2+full-B crosspaths to 83.75.

**They live in a SECOND, ADDITIVE column** (`rangeBonusUl`) beside the existing
absolute one, and that is the load-bearing detail. Path A's `rangeUl` figures
are absolute and the longest owned wins, which is right for a branch where
every tier restates the reach. "+15 u.l." cannot be written that way: a tower
that already owned A2 (43.75) would get 2.5 u.l. out of B2's "+15". So the
bonuses are summed and added *after* the max, which makes +15 mean +15 whatever
else the tower owns. Path A was not touched. A test walks B1→B5 one tier at a
time, and another pins path A's 62.5.

**A consequence worth knowing before retuning anything here: the blast radius
is now entirely inside the swing.** 18.75 u.l. of blast against a 56.25 u.l.
wedge at B4 means every body within a blast of an in-zone victim is *also* in
the zone, so the burst no longer reaches anything the swing missed on its own.
What makes it matter is the chain below. This also broke the old B4 test
fixtures, which were chosen to straddle a 31.25 u.l. wedge — see the note above
that group in `content.test.js`.

**The blast is 15 damage at every tier, and it CHAINS.** Up from 3. Anything
that *dies* to a burst bursts in turn, so a tight column can go up end to end
and the chain can travel far outside the tower's own zone — which is exactly
what gives the blast a job again now that the wedge has swallowed its radius.

**What stops it running forever is that a body may burst at most once**,
tracked in a local `burst` list and driven by a queue rather than by recursion.
Every link is therefore a distinct enemy, the board is finite, and the worst
case is "every enemy on the map explodes once" — which is the good case, not a
hang. A test drives a forty-body crowd through it to pin that. The old comment
on `explode()` refused to build this precisely because an unbounded cascade was
the risk; the once-per-body rule is what made it safe to build.

**The chain has no slow requirement of its own**, and since the same day
**the blast APPLIES the tower's slow to everything it damages** — the owner's
second correction: *"make it so that enemies damaged by an exploding enemy are
also slowed"*. This reverses the file's older rule that a blast was "a
consequence of a blow that already landed, not a second swing". A burst now
spreads path B's tempo effect as well as its damage, so a chain running down a
column leaves the whole column slowed behind it, and the slow is applied
*before* the damage for the same reason the swing's is.

**B5 grants the EARTHQUAKE**, an active ability on the shared
`panelActions`/`performAction` contract — the same button contract the Arcane
Sniper's nuke uses, so the panel, the hover card and the sandbox sidebar picked
it up with no work. The owner's spec: *"he jumps and causes a 3 seconds stun on
the entire map causing enemies to stop moving. followed the 3 seconds, all
enemies on the map move 60% slower for the next 5 seconds."*

- **MAP-WIDE, no radius.** Everything else this tower does is about a wedge of
  ground; this one is about the clock. It is what path B — the tempo branch —
  has been arguing towards all along.
- **It deals no damage at all**, and costs no cash and no tower HP.
- **The stun is a MOVEMENT stun.** A stunned Tyrant still aims and still fires.
  The spec's own words define it — "causing enemies to stop moving" — and an
  attack lockout is a much larger promise than that carries.
- **The stun and the slow are applied in the SAME instant**, with the slow's
  duration covering the stun (3 + 5 = 8 s). A stunned enemy is already at zero
  speed, so the first three seconds of that slow are unobservable and what the
  player sees is exactly the specified sequence. The alternative was a
  scheduler holding a pending slow, which is a second kind of timed global
  state for no difference on screen. `triggerQuake` is the one place to change
  if that ever stops being true.
- **It catches what is on the board when it fires.** A body that walks in
  during the aftermath walks in at full speed: the ability punishes what is
  already there, it is not a field the wave has to cross.
- **The cooldown is 45 s, and that IS the owner's number.** It was 20 for a few
  hours — a figure this file picked because the spec named none and a map-wide
  freeze with no gate is a button that ends the campaign — and he raised it to
  45 on review. 8 s of effect against 45 is about 18% uptime rather than 40%,
  which turns the earthquake from something you press whenever it is up into
  something you save.
- **The cast now shakes the battlefield for 0.75 s and leaves floor cracks for
  2.4 s.** The source-centered break plus scattered fissures live in Effects;
  the HUD is outside the camera transform. Both are cosmetic and the ability
  still deals no damage.

**The enemy-side stun is a new field**, `Enemy.stunTimer`, and it is
deliberately distinct from the three other ways an enemy can be stopped:
`rooted` is permanent and set by a revive, `windUpTimer` is the enemy's own
doing, `slowMultiplier` is a fraction of speed rather than all of it. Longest
wins, the same rule `applySlow` and `TowerHealth.stun` both follow.

**One interaction to know:** the Warbringer's own B5 swing slow is 65%, which is
*stronger* than the quake's 60%, and `applySlow` takes the strongest and
replaces the duration. So a B5 swing landing during the aftermath shortens the
quake's remaining slow to its own 3 s while making it slightly deeper. That
falls out of the "never stack, strongest wins" rule the game has always had and
was left alone rather than given a second slow channel.

---

## The Soldier — the burst-fire starter unit, and the gunner's replacement

Added 2026-07-29 and selectively overwritten from v0.4.10.0 on 2026-07-30.
`js/soldier.js`, **$300**, a build slot, and a member of the starting kit.

**It replaced the deleted gunner in v0.4.9.** It deliberately retains that
tower's footprint and 100 u.l. reference reach, so it can stand anywhere the
gunner could. The selective import changes the Rifleman itself but does not
bring back the gunner or change the Warbringer, Longshot, Siphon, campaign
schedule, cash-per-damage rule, or starting cash.

**Path B was rebuilt on 2026-07-30** into an automatic rifle that brings bodies
with it. Everything below describes the current tower, but note that the burst is
now only half the story — see The paths.

**Written like the Smasher, not like the Longshot.** Its upgrade tables are
absolute per-tier values, which is the shape the owner wrote them in and the
shape `recalcStats()`-plus-flags handles directly. A config-driven
`ConfiguredTower` would have meant translating his table into deltas — a second
representation to keep honest for no gain. It uses the same
`buyUpgrade`/`panelActions`/`performAction` contract as everything else, so the
panel, the hover cards, the codex and the armoury all picked it up for free.

### The burst, and the one arithmetic fact everything rests on

A gunner fires one bullet a second forever. A Soldier fires a fixed number of
shots close together and then pauses:

**The cycle is measured from one burst's START to the next**, not from the last
shot of a burst. That is what makes the owner's DPS figures come out —
`3 × 1 / 1.2 = 2.5` at base, `5 × 8 / 0.6 = 66.7` at A5 — and it is why
`attacksPerSecond()` is `shotsPerBurst / burstCooldown` for a burst weapon. Shot
spacing is therefore a *shape*: it decides how bunched a burst is, never how
often one happens. Every tier keeps `(shots − 1) × spacing` comfortably under the
cooldown (0.28 s against 0.7 s at A5), and a test asserts that relationship
still holds — invert it and the rate the tower reports stops being the rate it
fires at.

**Since 2026-07-30 there are TWO firing models, and B3 switches between them.**
Path B's third tier ends the burst: from there the tower fires steadily, one
shot every `1 / shotsPerSecond`, with `shotsPerBurst`, `shotSpacing` and
`burstCooldown` still sitting on the instance at their base values and no longer
deciding anything. `this.automatic` is the only thing that says which model
applies, and three rules keep the pair honest:

- **The automatic rate is DERIVED from the burst it replaces.**
  `BASE_AUTO_SHOTS_PER_SECOND` is `BASE_SHOTS_PER_BURST / BASE_BURST_COOLDOWN`
  — 2.5 — so the switch costs and gains exactly nothing, and B3's real payment
  is its +1 damage. Typing `2.5` there instead would be a second number free to
  drift from the burst's. **The owner chose this reading** over "the rifle simply
  never pauses" (1 / 0.15 s spacing = 6.7/s), which would have been a 2.7×
  jump on one tier.
- **`attacksPerSecond()` is still the ONE conversion**, and it now branches on
  `automatic`. Nothing outside `js/soldier.js` knows there are two models: the
  panel, the hover cards, the codex, `TowerStats.dps` and the Tyrant's
  "highest DPS on the board" scan all keep reading the one method. `Soldier.rateOf`
  is the same conversion against a *snapshot*, for `previewUpgrade`.
- **Automatic fire holds at zero exactly as the burst does.** A rifle with
  nothing to shoot at clamps its cooldown rather than banking time, or ten idle
  seconds would empty twenty-five shots into the first thing to walk in. It
  retargets per shot for the same reason the burst does, and it uses a `while`
  rather than an `if` because 5.5 shots a second is a 0.18 s interval against a
  0.05 s step at 3× speed. Both have tests.

The drawing follows the same split through `cycleSeconds()` — the gears spin off
whichever clock is live, and `sinceShot()` measures the muzzle flash from
`shotTimer` in burst mode and from the shot cooldown in automatic mode, so the
flash stays the same length in both.

**Retargeting is per SHOT, not per burst.** Each shot asks `findTarget` at the
moment it fires, so a burst that opens on an enemy which dies to shot one puts
shots two and three into whatever the targeting mode picks next. A shot with
nothing left to hit is simply lost and the burst carries on rather than being
abandoned — losing the remainder would make a Soldier standing over a thinning
wave much worse than its DPS row claims. Both halves have a test.

The shots are ordinary homing `Bullet`s, identical to the gunner's, so claiming,
payout and kill-crediting all work without the Soldier knowing about any of it.

### The paths

**Path A tightens the burst** (A1 150, A2 250, A3 400, A4 700, A5 1200): more
shots, less space between them, a shorter pause, then raw damage. It is a burst
weapon all the way up.

**Its top two tiers were retuned up on 2026-07-30**, in the same session that
rebuilt path B and specifically to answer the dominance the rebuild created (see
the note further down): **A4 went from 2 to 4 damage**, and **A5 from 3 to 8
damage with 0.6 s between bursts instead of 0.7**. Shot spacing did not move.
The ladder is now 1 / 1 / 2 / 4 / 8 damage, and A5 is 66.7 DPS where it was 21.4.
Both retuned tiers still keep `(shots − 1) × spacing` under the cooldown
(0.28 s against 0.6 s at A5), which is the relationship a test pins.

**Path B was rebuilt on 2026-07-30**, at the owner's request, into a heavy
automatic that brings bodies with it. It no longer leaves the burst alone — the
prose above this line said exactly that until B3 started ending it:

**A1 AND A2 CARRY `fireRate` FOR PATH B'S SAKE**, added the same day after the
owner spotted the hole: *"a1 and a2 gives attack speed and tightens the burst
but doesn't affect b3 attack speed basically rendering them useless for b path,
so make it that each upgrade gives +0.25/s to b path."*

He is right. A1 and A2 buy their attack speed as `shots`/`spacing`/`cooldown` —
the shape of a BURST — and B3 throws the burst away for a flat 2.5 shots a
second. A B-path Rifleman that had spent $400 crosspathing into them got
**nothing whatsoever** for it the moment B3 landed. Each now also adds **+0.25
to the automatic rate**, so the same purchase pays out in whichever firing model
the tower ends up in: full B is 2.5/s alone and **3.0/s with A1+A2** -- they are now the only attack speed path B can get.

Only those two tiers can ever apply it — A3 carries `locksPath`, so a tower
holding A3 or above can never own B3 and can never be automatic. A3–A5
deliberately do **not** carry `fireRate`: a number that cannot be reached is
worse than an absent one.

| tier | cost | what it adds |
|---|---|---|
| B1 | 200 | +25 u.l. range, **+25 max HP** |
| B2 | 350 | **+40 max HP** and **+1 damage** |
| B3 | 750 | camo detection, **+1 damage**, **+70 max HP**, and the **burst becomes steady automatic fire** |
| B4 | 2100 | **10 points of defence pierce**, **+2 damage**, **+110 max HP**, and the recruit ability |
| B5 | 3800 | **+15 damage (to 20 flat)**, **+180 max HP**, and the recruits go to 4 × 40 HP, 3 damage, 2.5/s. Still a **45 s cooldown** — B5 buys a bigger squad, not a more frequent one. No attack speed |

Every tier carries HP and the prices were rescaled on 2026-08-01 — see the
change log. A health tier **grants its delta**; it no longer heals to the new
maximum.

Every ability on either path also carries an **auto ON/OFF switch** — see the
Auto-ability switch section below.

Same crosspath rule as the Smasher and the Longshot: tier 3 on either branch caps
the other at tier 2 forever. **Recruits moved from B5 to B4** in that edit, and
B5 became the tier that makes both the rifle and the recruits heavy.

The resolved ladder, all of it derived by `recalcStats()` rather than special-cased:

| build | damage | rate | DPS | recruits |
|---|---|---|---|---|
| base | 1 | 2.50/s burst | 2.5 | — |
| B1+B2 | 2 | 2.50/s burst | 5.0 | — |
| +B3 | 3 | 2.50/s **auto** | 7.5 | — |
| +B4 | 5 | 2.50/s auto | 12.5 | 2 × 20 HP, 1 dmg @ 2/s, 45 s |
| +B5 | **20** | 2.50/s auto | **50.0** | 4 × 40 HP, 3 dmg @ 2.5/s, **45 s** |
| +B5, with A1+A2 | 20 | **3.00/s** auto | **60.0** | as above |

And path A, for comparison, after its own 2026-07-30 retune:

| build | damage | rate | DPS |
|---|---|---|---|
| A3 | 2 | 4.44/s burst | 8.9 |
| A4 | 4 | 6.25/s burst | 25.0 |
| A5 | 8 | 8.33/s burst | **66.7** |

**The two branches now answer each other, and getting there took two passes.**
The path B rebuild landed first and left full B at 44 DPS against full A's 21.4 —
for $150 *less*, and while also carrying camo detection, armor pierce, +25 range,
+30 HP and recruits. Path A was flatly dominated. That was reported rather than
quietly fixed, and the owner's answer was the A4/A5 retune above. Where it sits
now:

- **Path A wins on the tower** — 66.7 DPS against path B's 50 (60 crosspathed into A1+A2), for $150 more.
- **Path B wins on everything else as well** — camo, 10 points of defence pierce, +25 range, +425 HP,
  and four recruits worth 7.5 DPS each while they live, which closes most of the
  raw-damage gap when they are out and closes none of it when they are not.

That is a real choice rather than a right answer, which is what a two-branch tree
is for. It is also the whole balance of this tower resting on one 45 s cooldown,
so anyone retuning either branch should re-derive both columns rather than one.

**The A5 + B1 + B2 endpoint has moved twice**, and it is worth stating because it
was the owner's originally specified build. It resolved to 3 damage / 21.4 DPS
when the Soldier shipped; B2 gaining +1 damage made it 4 damage / 28.6 DPS; the A5
retune makes it **9 damage / 75 DPS** (A5's absolute 8 plus B2's delta of 1).
Nothing special-cases it at any point — it is what the two tables sum to, which is
the property the two-channel damage rule exists to preserve. A test pins the
current figure.

**Path A's rows are ABSOLUTE and path B's are DELTAS**, which is worth knowing
before retuning either. A3's "2 damage" is the damage a Soldier at A3 *has*, not
two on top of what it had.

**Damage is therefore the one stat with two spellings**, and this is deliberate:
`damage` on path A's rows (largest owned wins) and `damageDelta` on path B's
(every owned one adds), summed exactly once at the end of `recalcStats()`. Path B
had no damage tiers before 2026-07-30, so one channel was enough; folding the new
ones into `damage` would have meant either rewriting path A into deltas — losing
the property that retuning A3 alone does what it looks like — or letting
`Math.max` silently swallow a B2 bought behind A5's 3 damage. Two named channels
make which rule a row follows visible in the row itself.

**A health tier GRANTS ITS DELTA, and the grant lives in `applyUpgrade`, not in
`recalcStats`.** `previewUpgrade` measures a tier by setting its flag,
recalculating, and setting it back — the Smasher's trick — so anything that
touched current HP inside `recalcStats` would repair a damaged tower every time
the cursor crossed the button. The condition is written as "did the maximum go
up", not `id === "B2"`, so every health tier inherits it.

**It used to heal to the new maximum, and that changed on 2026-08-01** when
every tier on this tower and the Warbringer gained an `hp` delta. One full heal
on one tier is a perk; twenty of them would have made every upgrade a full
repair, so a tower under fire could be topped up for the price of the next
tier — a far bigger change than the health itself, and nobody asked for it. A
damaged tower now keeps its wound and gains the new points on top.

### FLAT DEFENCE pierce (B4) — and why it is not armor pierce any more

**Moved on 2026-07-30.** B4 used to carry 6 points of **flat armor** pierce.
The owner moved it onto **defence**: *"change armor pierce to instead of
bypassing blindage, bypasse armor and change the boost from b4 to 10, so
basically an enemy with 20% A armor should take 20% less damage but takes only
10% less, be sure that it doesn't increase the damage on enemies without
armor."*

**Mind the vocabulary, because his and the code's are swapped.** In this
codebase `armor` is the FLAT subtraction and `defense` is the PERCENTAGE; in his
words "blindage" is the flat one and "armor" is the percentage. So the tier now
strips **10 percentage points of `defense`**, and **nothing in the game pierces
flat armor any more.** The old `armorPierce` parameter was removed rather than
left unused; if it is ever wanted back it is four lines.

There are therefore two ways to pierce defence, and they are different shapes:

| | what it does | who has it |
|---|---|---|
| `defPierce` (0..1) | PROPORTIONAL — ignores a fraction, so 25% against a 50-defense enemy faces 37.5 | Siphon A1 |
| `defenseFlatPierce` (points) | FLAT — subtracts percentage points, so 10 against 20 leaves 10 | Rifleman B4 |

`Mitigation.mitigate(raw, enemy, defPierce, defenseFlatPierce)` applies the
proportional one first, then the flat one, then clamps to [0, 99].

**THE LOW CLAMP IS LOAD-BEARING and was explicitly asked for.** Without it, 10
points against a 0-defence enemy gives −10, and `1 − (−10)/100` is a 10% damage
**bonus** against every unarmoured enemy in the game. Pierce removes mitigation;
it never adds damage. There is a test on the zero case, the exactly-equal case
and the no-stats-at-all case.

**The brute counter moved with it, and that is a real consequence rather than an
oversight.** A brute's 5 flat armor is no longer pierced by anything, so a B4
Rifleman's 5 damage does *literally nothing* to one. What answers a brute on this
path now is B5's raw 20. Path B therefore has no answer to brutes between B4 and
B5, where it used to have one at B4. A test pins both halves.

It threads through `Enemy.takeDamage` → `TowerScore.apply` → `Bullet`,
all as trailing optional arguments, so **every existing call site passes nothing
and pierces nothing** — no other tower's damage moved.

The pierce rides on the **bullet**, not on a lookup of the owner at impact: a
shot's damage is fixed when it is fired, and upgrading or selling the tower
mid-flight must not change what is already in the air. It deliberately does not
affect the **claim**, which reserves raw damage and always has (a gunner claims
1 on a brute and lands 0); making pierce the one source that claimed
post-mitigation damage would give claiming a different meaning on one tower.

This is what lets a 1-damage weapon touch a brute's 5 flat armor at all, which
is the whole point of the tier — see the no-damage-floor rule under Content.

### Recruits (B4, boosted by B5) — units that are emphatically not towers

A panel button spawns temporary soldiers on a **45 s cooldown at both tiers**
(2026-08-01; B4 was 40 and B5 shortened it to 30 — B5 now buys a bigger squad,
not a more frequent one), staggered 0.25 s apart. Each spawns at the **end** of
the road and marches back towards the start, stopping to shoot whatever it
meets.

| | B4 | B5 |
|---|---|---|
| count per press | 2 | 4 |
| HP each | 20 | 40 |
| damage a shot | 1 | 3 |
| rate | **2/s** | 2.5/s |
| range | 100 u.l. | 100 u.l. |
| cooldown | 45 s | 45 s |
| max HP added by the tier | +110 | +180 |

(B4's rate was 1/s for a few hours on 2026-07-30 and the owner raised it to 2/s
the same day. B5's 2.5/s is therefore a much smaller step than it was, and the
real jump at B5 is the count and the health.)

**They live on B4 rather than B5 as of 2026-07-30** (they were B5's whole tier
before that), and B5 is now the tier that makes them heavy along with the rifle.

**A recruit's four stats are handed to it at birth**, as a resolved `stats`
object from `Soldier.recruitStats()`, rather than looked up from the constants
when it fires. Two things follow. `Soldier.RECRUIT_*` are the **B4** values only,
and are not read at all by a Soldier that owns B5 — a panel button or hover card
that reads them directly is a bug, and the button did until this edit. And a
recruit **keeps the numbers it was called in with for its whole life**, so buying
B5 with a group already walking upgrades the *next* group, not that one. A test
pins it; the alternative is a unit whose stats depend on when you look at it.

**A recruit is not a tower**, and the list of things that follow is the design:
it is not in `towers`, so it is not in the build bar, cannot be inspected or
sold, has no upgrade tree and does not block building; it is not in `enemies`,
so nothing targets it and it never leaks. It fires real `Bullet`s, so it claims
its damage like everything else, and those bullets carry the **parent Soldier**
as owner — its work shows up on the panel of the tower whose B5 paid for it,
the same way the Smasher's B4 blast is credited to the Smasher that caused it.

**Recruits live on the Soldier that called them** (`tower.recruits`), driven by
its `update` and drawn by its `draw`. That is deliberate and it is why there is
no new run-scoped array: `restartGame()` clears `towers`, which clears recruits
with them, and nothing new can be forgotten there. The consequence to state
plainly is that **recruits go with the tower that called them** — sell or lose
the Soldier and its group vanishes. That is unlike a bullet already in flight,
which outlives its tower because the shot was already spent; a recruit is the
tower still acting, not something it has finished doing.

**THEY STOP TO SHOOT** (2026-07-30, the owner's "they must stop while
shooting"). A recruit is either marching or firing, never both, and `holding` is
the flag. That changes what a recruit is *for*: it holds the ground where it met
the wave instead of trading shots on the way past, so its life is decided by what
walks into it rather than by the length of the road — which also makes the ~37 s
crossing a **floor** on how long one lasts rather than an estimate. Targeting
therefore happens **before** movement in `SoldierRecruit.update`, because whether
there is a target is what decides whether it moves at all; the old order marched
first and shot from wherever that left it.

**CONTACT IS MUTUAL AND COMES OUT OF A POOL** (2026-07-30, the owner's "if an
enemy passes through them, the recruits HP is deducted from them and the enemy";
**corrected 2026-07-31** — see below). A recruit's health is a **pool of block**.
Each enemy that walks through it costs **what killing that enemy is worth**, that
cost comes off the pool, and the recruit dies when the pool runs out — not on the
first thing that touches it.

**What it cost before the correction, and why it was wrong.** The first version
spent the recruit's *whole remaining health* on the first enemy to reach it. The
owner's case: *"when a recruit (40 HP) faces a swarm of 40 enemies (40 HP total),
it should be able to stop it entirely because of its HP — the recruit dies as
soon as the first enemy of the swarm touches it."* Exactly so: 40 points went
into a 1 HP runner, 39 of them overkill that `Enemy.takeDamage` clamps away
unpaid, and the other thirty-nine walked over the corpse. A block that cannot be
divided is a block whose HP does not mean anything — the number on the recruit
has to be the number of hit points of wave it can stop, or it is decoration.

- **The cost is the raw damage that just kills the body**, not its bare health:
  `SoldierRecruit.contactCostFor` inverts `Mitigation.mitigate`, so it is
  `armor + health / (1 - defense%)`. It has to invert it, because the pool is
  spent *before* mitigation takes its cut — handing an armoured enemy its bare
  health would leave it standing on a recruit that had already paid for the kill.
  A shield counts, via `remainingHealth()`: getting through the shell but not the
  body has stopped nothing.
- **A block is still one heavy hit against anything it cannot afford.** The cost
  is capped at what is left, so a recruit that meets a brute still empties itself
  into it. The old behaviour survives for exactly the enemies it was written for.
- It goes through **`TowerScore.apply`**, like every other damage source, so
  mitigation, the kill count and the owner's lifetime damage total all work
  without contact being a special case. Armor is why a 40 HP block does 35 to a
  brute rather than 40, and no armor pierce is passed for the same reason the
  bullets pass none.
- **It has to be reported upward or the damage counter loses it.** Contact
  resolves inside `tower.update()` rather than in a bullet, so
  `SoldierRecruit.update` → `updateRecruits` → `Soldier.update` all return the
  damage landed. Before this, `Soldier.update` returned a hard `0`. Since
  2026-07-31 that return no longer buys anything — cash comes from the kill
  bounty in the death sweep — but it still feeds the tower's lifetime damage
  total, its lifesteal and the Siphon's charge, so the chain still matters.
  `SummonContact` is what actually credits the kill to the owning tower.
- `touched` genuinely fills up now — forty entries in the owner's case — and the
  **once-per-enemy rule** it enforces is load-bearing: per frame of overlap would
  make a recruit's life depend on the frame rate and on how slowly an enemy
  happened to be walking. An enemy that *survives* contact (armor, or a revive)
  is never charged again; it got its one walk-through.
- **The pool arithmetic is exact and the float margin is not charged to it.**
  `health / 0.8 × 0.8` does not always come back as `health` in binary floating
  point, so a fully-paid block is nudged by a relative `1e-12` **on the way out**
  rather than in the cost. Overkill pays nothing, so the nudge is free — and
  keeping it out of the pool is what makes forty 1 HP bodies come to exactly
  40 HP of recruit instead of thirty-nine and a bit. A test pins both halves.

Three derivations, so the rest of the numbers are not arbitrary:

- **Walk speed is `Enemy.BASE_SPEED_ULPS`.** A recruit marching against the
  traffic at the traffic's own pace crosses the reference route in ~37 s, which
  is what makes the 45 s cooldown read as "your last group is just gone".
- **Range is `Soldier.BASE_RANGE_UL`** — a recruit is a Soldier, so it sees as
  far as one that has bought nothing. The owner's "100 UL range" and that
  derivation are the same number, which is why it is still written as the
  derivation.
- **Body radius is half the Soldier's footprint** — it is a body, not an
  emplacement.

Two carve-outs, and they go opposite ways, which is worth reading carefully:

- **Armor pierce does NOT carry**, on the owner's explicit instruction — B4 buys
  pierce for the Soldier's shots and a recruit's bullets are constructed with
  none.
- **Camo detection DOES carry.** The owner did not say either way, and B4
  requires B3 — so a Soldier that can call recruits *always* has detection, and a
  blind recruit would be useless on exactly the waves its parent was upgraded to
  answer. That the spec bothered to carve out armor pierce and not this is the
  reading taken. **If it turns out to be the wrong one, it is one boolean**
  (the third argument to `new SoldierRecruit`).

### Drawing

**The base is a filled circle at the footprint radius**, where the gunner and
the Smasher draw a square *inscribed* in that same circle. That keeps the rule
those two exist to keep — what you see is exactly what collides and exactly what
you click — while reading as a firing position rather than a turret block. Two
Soldiers at minimum spacing are tangent, never overlapping, because the spacing
rule is the sum of the two radii. A figure and a rifle sit on top of the pad;
those are cosmetic pixel sizes inside a `draw()`, which is allowed.

The muzzle flash is **derived from a clock, never stored**, exactly as the
gunner's is derived from its cooldown — no state, no timers, nothing for
`update()` to carry. In burst mode it measures from `shotTimer`, whose window
scales with the shot spacing, so an A5 burst reads as a stutter of light rather
than one flash with four dark gaps. In automatic mode there is no `shotTimer`
running at all, so `sinceShot()` measures from the shot cooldown instead and
flashes for a shot spacing's worth of it — the same flash *length* in both modes,
which is what makes a steady rifle read as a pulse rather than a stutter.
`gearPhase()` splits the same way through `cycleSeconds()`. B3 shows as a scan
ring inside the pad, and owned upgrades as pips around it like the Smasher's.

**A recruit that has stopped to shoot draws braced** — a pair of feet planted
across its line of fire, under the hull, only while `holding`. The stop rule is a
mechanic the player has to be able to see, and "this one is not moving" is not
something to make them infer from watching it for a second.

### Hovering a recruit

2026-07-30, at the owner's request: *"hover recruits to be able to see their HP
and range."* `recruitAt(x, y)` and `drawRecruitHover()` in game.js, against
`SoldierRecruit.containsPoint` and `hoverLabel` in js/soldier.js.

**A hover readout is the only place a recruit's numbers can go.** It is not a
tower, so it cannot be selected, has no panel and has no upgrade tree — and its
HP is the one number that decides what its body block is worth, which since
contact went mutual is the most important thing about it.

Four decisions worth knowing:

- **`recruitAt` walks the towers, not a global array**, because recruits live on
  the Soldier that called them. That is the cost of the ownership decision and it
  is small: `towers` is short, and only a Soldier with B4 has a `recruits` array.
- **Nearest centre wins**, exactly as `enemyAt` does. Four B5 recruits stand about
  13 u.l. apart, so their padded hit circles genuinely overlap, and "whichever was
  first in the array" would make the readout flicker between two of them while the
  cursor sat still.
- **The hit test is padded like an ENEMY's** (`Enemy.HOVER_PAD_PX`), not exact
  like a tower's. A tower's click target is precisely its footprint because you
  are *selecting a fixed emplacement*; a recruit is a small moving body you are
  *peeking at*, which is the same problem an enemy has.
- **It draws the range RING, where the enemy hover has no equivalent.** "Range"
  is not a number you can read off a body — the ring is the answer to the
  question. It is violet, so it does not read as a tower's blue selection ring.

**It yields to the enemy hover.** Enemies are drawn on top of recruits in the
render loop, so an enemy standing on a recruit is what the cursor is pointing at —
the same "whatever is drawn on top wins" rule `onClick` and the inspection panel
already follow. `drawRecruitHover` returns early when `enemyAt` finds anything.

---

## The auto-ability switch

2026-07-30, at the owner's request: *"add an auto ability button on every tower
with an ability that can be turned on and off"*, with *"auto ability button is off
by default, can be turned on by the user"* and *"the decision is up to the user"*.
`js/systems/auto-ability.js`.

An ability is a panel button pressed when the player judges the moment right.
That is fine for one tower and unmanageable for eight, so every ability that can
run itself gets a switch: flip it on and the tower fires that ability the instant
it comes off cooldown, until the switch goes off again.

**Two towers have one today**: the Rifleman's `recruits` and the Arcane
Sniper's `ability` (the B5 nuke). Adding a third is three lines — `AutoAbility`
holds all of it.

**OFF BY DEFAULT, and there is deliberately NO safety rule anywhere.** Both halves
are the owner's instruction. The consequence to state plainly: the Sniper's nuke
permanently lowers its own maximum health every cast, so a switch left on will
eventually destroy that tower. That is allowed, and a guard that quietly declined
to fire the ability the player switched on would be the game overriding the choice
the switch exists to give them — invisibly. The card on the switch says so before
it is flipped.

**What may have a switch.** An ability qualifies only if firing it needs nothing
from the player but the decision to fire:

- **The Sniper's cone RE-AIM does not qualify** and deliberately has no switch. It
  arms a mode and then takes a *direction* from the player's next click on the map,
  so an automatic version would have to invent one — and inventing a direction is a
  balance decision dressed up as a convenience.
- **The Siphon's panel readout does not qualify** either: it is `readonly`,
  a passive reporting itself, not an ability.

**Three lines per tower, and no new machinery inside them:**

```
panelActions()   AutoAbility.attach(action, this, abilityId, "AUTO")
performAction()  var auto = AutoAbility.handle(this, id); if (auto) return auto;
update()         if (AutoAbility.isOn(this, id) && ready) fire()
```

Details that are load-bearing:

- **The switch lives on the tower** (`tower.autoAbilities`), like every other piece
  of per-tower state, so it dies with the tower and `restartGame()` clears it by
  clearing `towers`. It is **not saved** — `MetaProgress` persists coins, owned
  towers and the loadout, and a switch on a tower that no longer exists is not a
  thing to remember. A missing map reads as every switch off, so a tower that never
  calls into this file behaves exactly as it did before it existed.
- **Action ids are namespaced** `auto:<abilityId>`, and `AutoAbility.handle` is the
  only thing that parses one. Each tower's `performAction` calls it **first**,
  because the switch is a different click in the same rectangle as the ability.
- **The automatic cast goes through the same door the button does.** The Soldier
  calls `callRecruits()`; the Sniper calls its own `performAction("ability", …)`.
  Neither reimplements what the ability does, so the automatic and manual casts
  cannot drift — including the Sniper's permanent HP cost.
- **Readiness is the ability's own business.** `triggerActiveAbility` already
  refuses while the tower is stunned, and `recruitsReady()` already checks the
  cooldown, so the auto path asks rather than re-deriving. The Sniper's cadence is
  therefore its stun length, which is the only gate its config defines (its
  `cooldownSeconds` is `null` on purpose — see the ActiveAbility header).

### Where the button is, and why it is not a row

**It is a small pill inside its own ability button's top-right corner**, not a
panel row of its own. Both reasons matter:

- **It is an attribute of one ability, not a peer of it.** "Auto" with no ability
  named next to it means nothing, and on a tower with two abilities a floating
  auto row would not say which one it belonged to.
- **A fourth full-width row did not fit.** The Rifleman's panel at full
  path B is 564 px of a 602 px budget (`BAR_Y − 24`) and an action row costs 66,
  so the row would have pushed the panel through the build bar. A test pins the
  panel fitting with the switch on it, and asserts it is still three action rows.

The rectangle is computed in `inspectionLayout` alongside the button, for the same
reason `slotRect` is shared between drawing and clicking: one rectangle, so what
is drawn is exactly what can be hit. Three places then read it, and all three give
the pill precedence over the button underneath — `runPanelAction`, `hoveredCard`
(the switch has its own card) and `drawInspection`.

**The switch is clickable while its ability is not.** `runPanelAction` tests the
pill *before* the `readonly || !enabled` bail, deliberately: recruits run a 45 s
cooldown, so a switch that went dead with its button would be unreachable for 45 s
at a time — which is exactly when a player reaches for it. A test pins it.

**Lit when on.** An off switch is an offer and reads as chrome; an on switch is the
tower acting on its own and has to be visible at a glance from across the panel, so
it fills violet with dark text and says "AUTO ON" rather than "AUTO".

---

## The Longshot tower — a config-driven upgrade tree, and the template for the next one

Added 2026-07-26, against a fully-specified request covering exact stat
tables, formulas, and cross-check verification numbers for every upgrade
combination. It intentionally lives beside the gunner rather than inside it:

- **It is a parallel system, not a rewrite.** Longshot has its own config, its
  own systems files, its own runtime object (`ConfiguredTower`), its own test
  suite, and its own runnable scene (`long-range-dps-debug.html`). Nothing
  about IT required changing the gunner or the build bar. (`js/tower.js`,
  `js/game.js`, `js/enemy.js` and `js/bullet.js` *were* later touched, on
  2026-07-26, but for an unrelated reason -- the global distance system
  replacement described two sections up -- not to accommodate Longshot.)
- **Data and logic are strictly separated.** `js/towers/long-range-dps.config.js`
  is pure data -- base stats, ten upgrade tiers' worth of deltas, and which
  flags each tier grants. Every number in the spec's tables lives there and
  nowhere else. `js/systems/*.js` contain zero tower-specific branching: they
  read `config.paths`, `config.mechanics`, and the resolved `stats.flags` --
  a second tower with a totally different flag set (an AoE splash tower, a
  melee tower, an income tower) plugs into the same systems files unchanged.
  **That is the concrete test of "no changes to systems code" this was built
  against**, not just an aspiration -- see `tests/long-range-dps.test.js`,
  which exercises `js/systems/*.js` only through a config object.
- **Stat model:** `js/systems/stat-resolver.js` sums every purchased tier's
  deltas onto the base, then applies a small, fixed set of flag effects
  (camo detection, infinite pierce, cone shape, deadzone removal) -- the only
  four things the spec calls out as absolute overrides rather than deltas.
- **Crosspathing** (`js/systems/crosspath.js`): reaching tier 3 on one path
  locks the other at tier 2, forever. Enforced by simulating the purchase and
  checking the *resulting* state's validity, so there is exactly one place
  this rule can be gotten wrong, and both directions (A locking B, B locking
  A) run through it.
- **u.l. is this project's global distance system** (`js/units.js`, see two
  sections up) -- Longshot's config carries plain numbers (range 250,
  deadzone 50, ...) that go through `ul()` exactly like the gunner's, never a
  raw pixel literal. Since the 2026-07-27 re-anchoring, those numbers sit on
  the same scale as everything else: 250 u.l. is 2.5 reference towers and a
  fifth of the map, rather than 2.5x the whole map.
- **Cone re-aiming** (spec 5.6) is a panel action, not automatic: it arms an
  aiming mode and the next map click sets the direction, on a 10 s cooldown.
  See `aimingTower` in game.js for how that click is intercepted ahead of
  building but behind the panel's own buttons.
- **What's still a placeholder (spec section 7, deliberately not invented):**
  sell/refund rate, default
  targeting mode, projectile speed and hitscan-vs-travelling behaviour, the
  B5 active ability's cooldown, what tower HP actually does (damageable by
  what, dies at zero?), the cone's default aim direction on placement, and
  the precise definition of "strongest enemy" for the B5 ability target. Each
  is a `null` field in the config with a `// TODO(section 7)` comment, or (for
  "strongest enemy") a clearly-flagged placeholder heuristic in
  `js/systems/active-ability.js`. Do not fill any of these in without asking
  -- that is the same "do not invent" instruction the spec itself gave.
- **Tests:** `node tests/long-range-dps.test.js` (58 tests, independent of
  `tests/run.js` -- it requires the systems/config files directly rather than
  booting through `tests/harness.js`, since Longshot's systems have no DOM
  dependency to stub). `node tests/long-range-dps-scene.smoke.js` boots the
  debug scene against a stubbed DOM to catch wiring mistakes the unit tests
  can't see (missing element ids, DOM calls leaking into `update()`).

---

## Building a model that looks like the ones that already work

The Arcane Sniper, the Rifleman and the four enemies set the bar. The Warbringer
and the Siphon are still placeholder cylinders, and every future enemy has the
same problem to solve. This is the contract. A model that meets it needs no
special-casing anywhere in the renderer; a model that skips a clause needs a
patch in `js/gl/gl-parts.js`, which is a worse outcome for everyone.

**1. Anything bolted to the map goes under a `_world_fixed_child`.**

A tower turns to face its target, and in 3D that turn is a yaw on the whole
mesh. Correct for a figure and its weapon. Wrong for everything the figure is
standing on or among: a base plate, a plinth, pylons, crates, sandbags, a
spotlight on a stand, a dais, a rack. Those belong to the tile, and a foundation
that pivots is the single most obvious way for a model to look wrong.

`tower_sniper.py::_world_fixed_child(name, aim_parent)` builds the node: a
centred child with a driver that cancels its parent's yaw. Parent the whole
foundation to it. `export_mesh.py` recognises those nodes and emits their
geometry as a `world_fixed` group, which `drawActor` draws with the aim taken
out — one extra draw call, no second mesh, nothing to configure.

Getting this wrong is not cosmetic-only in one place: it also decides where a
muzzle flash lands, because `gl-world.js::anchor()` applies the same yaw.

**2. Light comes from emissive materials, not from a sprite over the top.**

Give every part that should glow — coil stages, a breech core, an aperture, a
readout, a lamp — an emissive material in the palette (the fourth channel; see
`td_scene.material`). The runtime carries emission as its own vertex attribute
and drives it from the tower's firing cycle through `uGlow`, so the geometry
itself brightens and is occluded by whatever stands in front of it.

Do NOT plan to draw the charge as canvas circles over the model. That was tried,
and translucent discs floating over the whole board — visible through the barrel
and through the enemies in front of the tower — is what "looks like a sticker"
means. Canvas is for what has no surface to land on: arcing current, a rune
circle spinning in mid-air, heat haze at the mouth.

**3. Animate by keying EMPTIES; never by moving vertices.**

Geometry ships once, in the local space of whichever animated empty owns it, and
a frame is one 4×4 per group. Four frames of the Rifleman's bolt cycle is about
700 bytes; the same four frames as vertex copies is 2.8 MB. `_group_root` walks
up from each mesh to its nearest animated ancestor, so a rig that gains a moving
part exports correctly with no table to update.

**4. Every accent seat must be bit-identical across frames.**

`make_preview.py --validate-riflemen` asserts it. If a hat, a badge or a muzzle
anchor drifts between frames, composited accent layers separate from the body.

**5. Measure the orthographic scale, do not guess it.**

`--frame-riflemen` solves the minimum safe ortho by projecting evaluated
vertices through all 48 yaws. The binding constraint is almost always the
BOTTOM: a prop at ground radius r projects `0.56 * r` below the origin, and only
0.14 of a tile sits there. Hand-picked values clipped all seven Rifleman groups.

**6. Local origin at the tile centre, feet at z = 0.**

Both snipers do this and their foundations sit flush. The Riflemen do not — the
origin is at hip height and geometry runs to z = -0.5 — which is survivable only
because the ground slab is thick. New models should not repeat it.

**7. Keep the palette a value ladder.**

The first Rifleman palette had five colours inside ~8% luminance and rendered as
one dark blob. Separate by VALUE first, hue second. The largest surface takes
the darkest value, or it pulls the eye off the character.

**8. A weapon must not be inside the body, and PROVE it with solids.**

`tower_warbringer.penetration()` tests the weapon's solids against the body's
solids as boxes, per frame, and fails the build on any overlap. Do not measure
this vertex-to-vertex: two boxes interpenetrate happily with their corners far
apart, and a first version of exactly that check reported 10 mm of clearance
while the haft ran through the man's chest. Exclude the parts that are SUPPOSED
to touch -- hands and forearms on the grip, inlays in the head, the ground under
a rested weapon -- and state why in the code.

Related, and the reason the failure happened at all: a two-handed weapon at rest
belongs OFF the centreline. On the model's own axis it will pass through the
torso in some pose, whatever the numbers say.

**Checks before calling a model done:** `--validate-riflemen` (or its
equivalent) passes; `--frame-riflemen` reports the ortho actually used; the
model loads in `index.html` with no console errors; and, for anything with a
foundation, BOTH halves of the map-fixed check below.

**The map-fixed check has two halves, and one of them cannot be automated.**

1. *Nothing frozen moves.* Suppress every yaw-carrying draw and diff the
   framebuffer at two aims: **zero** pixels. Note that the naive version of this
   — diffing the whole tower — is useless, because a barrel sweeps over its own
   base and occlusion changes those pixels whether or not anything rotated.
2. *Only the right things are frozen.* Render the fixed set and the turning set
   SEPARATELY and look at them. The figure must be whole in the turning set.

Half 1 passing means nothing on its own: it passed with a Rifleman's torso in
the fixed set, because a frozen torso does not move either. A prop volume must
be sized to the PROP — the figure is always the thing standing next to it, and
on three separate models a comfortable-looking radius reached far enough to take
an arm, a shoulder, or the back of a coat.

3. *Nothing is frozen by halves.* A prop is a cluster of solids that touch. If
   part of it is fixed and the rest is not, it tears in half the moment the
   tower turns — which is what happened to the B5 hat rack and, unnoticed, to
   the strongbox beside it. Flag every grounded solid that is NOT fixed but
   whose bounding box touches one that is, then read each hit against the build
   script: a man's boots on the deck he stands on is a contact, not a tear.

**Use a BOX when a circle cannot separate the prop from the figure.** The rack's
posts sit 0.30 from its centre and the man's coat 0.30 to 0.34 from the same
point — overlapping ranges, so no radius works. What separates them is x. Radial
volumes are the wrong default for anything long and thin standing beside a body.

**When a solid is borderline, let it TURN.** A detail that turns with the tower
is a much smaller error than a prop split down the middle.

---

## Tower names: what a tower is CALLED versus what it IS

**2026-07-30.** Four of the five towers were renamed and redrawn for a robot
fantasy/magic theme. **Nothing else changed** — not a stat, not a cost, not a
behaviour, not a footprint, not a range.

| was | is now | constructor | id (SAVE FORMAT) |
|---|---|---|---|
| Smasher | **Warbringer** | `Smasher` | `smasher` |
| Longshot | **Arcane Sniper** | `LongshotTower` | `longshot` |
| Siphon | **Siphon** (was "Mana Fountain" for a few hours on 2026-07-30) | `BeamTower` | `siphon` |
| Soldier | **Rifleman** | `Soldier` | `soldier` |
| Gunner | **DELETED 2026-07-30** — not in the catalogue, not buildable | `Tower` (still loaded; see the banner in js/tower.js) | `gunner` |

**Only `DISPLAY_NAME` moved.** Three strings per tower could plausibly have
been renamed and two of them must never be:

- **`Type.ID`** is a persistence format. `MetaProgress` writes these to
  localStorage, so renaming one silently un-owns that tower for every existing
  player. See the note on `CATALOGUE` in js/meta.js.
- **The constructor's global name** is how `MetaProgress.constructorOf` finds
  the type (the catalogue stores `global: "Smasher"`, not a reference, because
  meta.js loads before the tower files).
- **`DISPLAY_NAME`** is read by the build bar, the inspection panel, the
  armoury and the index screen, and by nothing that persists. It is the one
  string that is purely cosmetic, so it is the one string that moved.

The consequence for anyone reading this document: **the prose below still
mostly says "Smasher", "Longshot", "Siphon" and "Soldier"**, and that is
deliberate rather than stale. Those are the names of the *code* — the files are
`js/smasher.js`, `js/soldier.js`, `js/towers/longshot-adapter.js`,
`js/towers/beam-adapter.js`, and the tests, ids and constructors all speak that
way. Rewriting 190 references to point at names the code does not use would
make this file harder to check against the source, not easier. Read the table
above as a glossary.

**The gunner was deliberately left alone.** The owner's instruction for it was
"delete this tower, but it stays in code as a placeholder for now", so it keeps
its name and its old artwork and is now the one tower on the board that still
looks like the pre-reskin game — which is the right signal for a unit on its
way out. Nothing was removed: it is still in `BUILD_SLOTS`, still a starter in
the meta catalogue, and still **the reference tower the whole u.l. system is
anchored to** (100 u.l. range — see the core invariant section). Actually
deleting it is a mechanics change and needs its own decision; see the note on
`Tower.DISPLAY_NAME` in js/tower.js.

**What the reskin is allowed to touch, and what it is not.** Every change was
inside a `draw()`/`drawIcon()` or a cosmetic field feeding one. Three towers
gained purely cosmetic animation state, each written by the thing that causes
it and read only by drawing code:

- `Smasher.slam` / `Smasher.weight` / `Smasher.pathAImpact` — the shockwave,
  path B's lingering magical weight, and Path A's clipped ground fracture. Set
  in `swing()`, aged in `fadeBlasts()`. Needed because the swing animation is
  derived from the cooldown and the *aftermath* of a slam happens after the
  cooldown has been reset, so there is nothing left to derive it from.
- `BeamTower.healGlow` — the lifesteal halo. Set in `settleEconomy()`, aged in
  `update()`.

Everything else is derived from stats that already existed:
`Soldier.gearPhase()` off the burst cooldown, `Smasher.forgeHeat()`/`haste()`
off damage and cooldown, `Smasher.swingPose()` and its hammer echoes off
`swingProgress()`, the Arcane Sniper's potency off resolved damage and pierce,
`BeamTower.chargeGlow()`/`flowPower()` off the charge meter and AD.

**Two of those read a STAT, not a branch letter, and that was on purpose.** A
Warbringer's hammer is drawn heavy because its damage is high, not because
path A is ticked; the Arcane Sniper's reticle appears because
`flags.camoDetection` is on, whoever granted it. Crosspathed towers therefore
draw honestly, and a future retune of an upgrade table moves the artwork with
it instead of leaving it lying about the tower.

Note the brief for the reskin described the Arcane Sniper's camo detection as
path B and the Warbringer's speed scaling as path A. In the shipping game camo
detection is the Longshot's **A1** and the Smasher's speed is its **B** path
(see the Current values table). The visuals follow the code, not the brief, and
no mechanic was moved to match the description.

---

## Current values

| Thing | Value | Where |
|---|---|---|
| UNIT_LENGTH | 1.04 px/u.l. | `UNIT_LENGTH` in js/units.js |
| Logical canvas | 1280 × 720; all gameplay, UI and input coordinates remain here | `VIEW_WIDTH`, `VIEW_HEIGHT` in js/game.js |
| Physical canvas | displayed CSS size × DPR, one uniform scale clamped to 1×–3× (1280×720 through 3840×2160) | `resizeCanvasBackingStore`, `MAX_CANVAS_SCALE` in js/game.js |
| Rendered model sheets | Normal, Swarm, Brute and Hive: aligned base/shield sheets with 128×160 tiles, 8 facings × 8 walk frames; Arcane Sniper: 48 facings, normally 256×256, A5 512×512 and B5 384×384 paged as 3×16 direction rows, 20 composited sheets covering 27 legal builds | tools/blender, js/skins/draw-pack.js |
| Rendered sheet cache version | `ASSET_VERSION = 12` | js/skins/draw-pack.js |
| Measured rendered `contentTop` | Normal .8438; Swarm .6875; Brute .6937; Hive .5750 (shield-safe); Sniper base .7695, A3 .7539, A4 .5547, A5 .5625, B3 .7383, B4 .6406, B5 .5938 | js/skins/draw-pack.js; printed by tools/blender/td_scene.py |
| Path length | ~1865 u.l. on the reference route | `Maps.referenceLengthUl()` (derived, not declared) |
| Maps | 6: four authored plus fixed-seed Shifting Ley and two-route Twin Confluence | `Maps.LIST`, `Maps.DEFAULT_ID`, `Maps.routesOf` |
| Map authoring scale | 1.04 px per u.l. | `AUTHORED_AT_PX_PER_UL` in game.js, applied by `Maps.toWorld` |
| Road width | 21.875 u.l. | `ROAD_WIDTH_UL` in game.js |
| Base HP | 100 | `BASE_MAX_HP` in game.js |
| Campaign difficulties | Easy / Normal / Hard, selected before the route; Restart keeps the selected tier | `DIFFICULTIES`, `setDifficulty`, `selectedDifficultyId` |
| Easy schedule | 35 waves, 738 enemies, 11 747 scheduled HP / **13 498 effective**, plus each Hive's brood and the boss's summons | `EASY_WAVES` in game.js |
| Normal schedule | 35 waves, 851 enemies / **22 369 effective HP**, all nineteen types | `DIFFICULTIES.normal` |
| Hard schedule | 35 waves, 962 enemies / **30 911 effective HP**, all nineteen types with repeated support threats | `DIFFICULTIES.hard` |
| Wave clear bounty | a tenth of the wave's effective HP, ~$2596 across the run | `WAVE_CLEAR_BOUNTY_FRACTION`, `waveBounty`, `waveEffectiveHealth` |
| Wave reward, all in | clear bounty + redistributed opening cash + rising allowance | `waveReward`, `waveProgressionReward`, `waveEscalatingReward` |
| The boss | Tyrant, wave 35, 5000 HP; aimed shot at the highest-DPS tower (45 + 2 s stun, every 12 s after a 1.3 s wind-up); roars at half and adds a 90 u.l. leap | `Enemy.TYPES.boss` |
| Tyrant roar | +1000 shield, ×1.35 speed, intervals ×0.75 (12 s → 9 s), leap unlocked, and 40 bodies / 2780 HP called in at 1.5× — the running mob plus 2 Hives, 3 Shieldbearers, 3 Healers, 2 Colossi | `Enemy.TYPES.boss.phases[0]` |
| Tyrant leap | 90 u.l. jump, 120 u.l. shockwave, 80 damage + 3 s stun to everything it reaches, commits within 220 u.l., 1.5 s wind-up | `phases[0].addAttack` |
| Wave bonus timing | owed on deploy; paid on board-clear, on a skip, or when the next wave arrives | `pendingBounty`, `payWaveBounty` |
| Tower stun | longest wins; no update, cooldown, aim tracking or live Siphon beam presentation while stunned | `TowerHealth.stun / isStunned / tickStun`, `BeamTower.visibleLocks` |
| Waves 1-10 | the introduction, single-type, pinned exactly | `WAVES.slice(0, 11)` — deep-equal test in run.js |
| Mixed waves | `groups: [...]`, each with its own count/interval/type/health/lead | `waveGroups`, `waveCount`, `waveGroupAt`, `waveSummary` |
| Wave break | 90 s ceiling; 3 s once called in; 5 s once the board is cleared | `WAVE_BREAK`, `WAVE_CALL_DELAY`, `WAVE_CLEAR_DELAY`, `callNextWave` in game.js |
| Run opening | 10 s before wave 1, or the Start button; 0 with auto-send | `RUN_START_DELAY`, `beforeFirstWave`, `waveSkipButtonLabel` in game.js |
| Wave call triggers | the Send button, an empty board, or the 90 s running out | `callNextWave` in game.js |
| Auto-send waves | off by default; calls every break in the frame it opens | `autoSkipWaves`, `toggleAutoSkipWaves` in game.js |
| Boss banner | a named bar at the top for any type flagged `showHealthBanner` | `drawBossBar`, `bossBarEnemies` in game.js |
| Game speed | 1x / 2x / 3x, cycled from the bottom-right button, not run state | `GAME_SPEEDS`, `gameSpeed`, `cycleGameSpeed` in game.js |
| Run-over buttons | Restart (R/Enter), Choose another route (M), Main menu (Escape) | `restartButtonRect`, `changeMapButtonRect`, `mainMenuButtonRect` |
| Victory | all waves naturally deployed + board clear + base standing | `allWavesDeployed`, `victory` in game.js |
| Wave banner | 2.4 s, on each wave's first spawn | `BANNER_SECONDS` in js/effects.js |
| Enemy roster | 19 types: 14 on Easy, all 19 on Normal/Hard, including the flying Aether Wisp | `Enemy.TYPES`, difficulty additions |
| Enemy mechanic blocks | `attack`, `shield`, `revive`, `spawns`, `phases`, `support`, `sprint` — data, never a branch on the id | `Enemy.TYPES`, and one method per block |
| What a shield pays | **nothing, ever** (2026-07-30). Healed HP too. Only health pays | `Enemy.takeDamage`, `Enemy.bounty` |
| Bulwark | 12 HP + 24 shield (ratio 2), ×2 speed when the shield breaks | `Enemy.TYPES.shielded` |
| Revenant | 16 HP, revives once to full and roots where it fell | `Enemy.TYPES.revenant` |
| Hive | 150 HP, ordinary, pays normally | `Enemy.TYPES.hive` |
| Hive brood | 5 normals every 7 s, each with a shield equal to its life and paying $0 | `Enemy.TYPES.hive.spawns` |
| Shieldbearer | 60 HP, ×0.45; +20 shield to the 10 strongest every 10 s, STACKING. Normal/Hard | `Enemy.TYPES.shieldbearer` |
| Healer | 200 HP, ×0.4; 15 HP/s for 4 s to the 3 most wounded every 8 s. Normal/Hard | `Enemy.TYPES.healer` |
| Vanguard (fast boss) | 750 HP; ×3.5 for the first 400 u.l. then ×1.75; 100 shield every 7 s, no stacking. Normal/Hard | `Enemy.TYPES.boss_fast` |
| Camo Heavy | 20 HP, ×0.65, camo, 5 flat armor + 20% defense. Normal/Hard | `Enemy.TYPES.camo_heavy` |
| Brood trail | 12 u.l. between hatchlings, back along the road | `Enemy.BROOD_TRAIL_UL` |
| Enemy lane offsets | a 32-bit hash of the spawn index, ±7 u.l. | `Enemy.laneOffsetFor`, `Enemy.LANE_SPREAD_UL` |
| Tower HP | Rifleman 80 (110 with B2), Warbringer 150, Arcane Sniper / Siphon from their stat tables (the deleted gunner was 60) | `Soldier.BASE_HP`, `Smasher.BASE_HP`, `config.base.hp` |
| Angry attack | 20 damage, 47.5 u.l. reach, every 2.5 s, nearest tower only | `Enemy.TYPES.angry.attack` |
| Meta payout | 2 per wave cleared, +60 for a clear | `MetaProgress.coinsForRun` |
| Store prices | Arcane Sniper 40 coins, Siphon 150; Warbringer and Rifleman are the starting kit | `CATALOGUE` in js/meta.js |
| Save key | `towerDefense.meta.v1` in localStorage | `MetaProgress.STORAGE_KEY` |
| Default enemy HP | 4 | `Enemy.BASE_HEALTH` |
| Enemy speed | 50 u.l./s (~37 s crossing) | `Enemy.BASE_SPEED_ULPS` |
| Enemy lane spread | ±7 u.l. off the centreline, deterministic hash | `Enemy.LANE_SPREAD_UL`, `Enemy.laneOffsetFor` |
| Enemy sprite radius | 11 px × the type's `sizeScale` (0.55 swarm … 1.8 midboss) | `Enemy.RADIUS_PX`, `Enemy.prototype.radiusPx` |
| Camo detection | Arcane Sniper **A1** (not B — see the naming section), Siphon B1, **Rifleman B3** — nothing else has it | `seesCamo` |
| Flying eligibility | fail-closed: Arcane Sniper at base and Siphon A4 can target flyers; flat towers cannot unless `seesFlying` is explicit | `Targeting.sees`, `RangeFilter.canTarget` |
| Defence pierce (flat) | Rifleman B4 only: 10 percentage points off `defense`, clamped at 0 so it is never a damage bonus. Nothing pierces flat armor | `Mitigation.mitigate`'s 4th argument |
| Targeting modes | first, last, weakest, strongest, fastest, nearest | `Targeting.MODES` in js/targeting.js |
| Reference range | 100 u.l. — the yardstick the whole u.l. system is anchored to. Carried by the Rifleman since the gunner was deleted | `Soldier.BASE_RANGE_UL`, `Maps.REFERENCE_TOWER` |
| Shared footprint | 11.25 u.l. radius — Warbringer and Rifleman both take it from here | `Tower.FOOTPRINT_RADIUS_UL` |
| Bullet speed | 562.5 u.l./s | `Bullet.BASE_SPEED_ULPS` |
| Pierce hit radius | 12 u.l. | `PierceBullet.HIT_RADIUS_UL` |
| Warbringer range | 31.25 u.l. base, 62.5 at A5, **71.25 at full B** (B2 +15, B4 +10, B5 +15, additive) | `Smasher.BASE_RANGE_UL`, `rangeBonusUl` in `Smasher.UPGRADES` |
| Warbringer blast | 18.75 u.l. radius, **15 damage, CHAINS, and applies the tower's slow**; fires on ANY kill by the swing (B4) | `Smasher.EXPLOSION_RADIUS_UL`, `Smasher.EXPLOSION_DAMAGE`, `explode()` |
| Warbringer swing order | slow FIRST, then damage, then the burst — a one-shot kill still bursts | `Smasher.prototype.swing` |
| Warbringer earthquake (B5) | map-wide: 3 s movement stun, then 60% slow for 5 s, **45 s cooldown**, no damage; 0.75 s world shake and 2.4 s floor fissures | `Smasher.QUAKE_*`, `triggerQuake`, `Effects.earthquake` |
| Enemy stun | timed, movement only, longest wins — distinct from `rooted` and from a slow | `Enemy.stunTimer`, `Enemy.applyStun` |
| Warbringer cost | 700 (was 200 before 2026-07-30) | `Smasher.COST` |
| Warbringer full A | 4500 on top of $700 (200/350/600/1400/1950) = $5200 | `Smasher.UPGRADES` |
| Warbringer full B | 6300 on top of $700 (200/400/900/1900/2900) = $7000 | `Smasher.UPGRADES` |
| Tower HP from upgrades | every tier on both towers carries `hp`; Warbringer 150 → 575 (A) / 700 (B), Rifleman 80 → 380 (A) / 505 (B) | `Smasher.UPGRADES`, `Soldier.UPGRADES` |
| Health tier semantics | GRANTS its delta — it does not heal to the new maximum | `applyUpgrade` on both |
| Warbringer full A | 4500 on top of $700 (200/350/600/1400/1950) = $5200 | `Smasher.UPGRADES` |
| Warbringer full B | 6300 on top of $700 (200/400/900/1900/2900) = $7000 | `Smasher.UPGRADES` |
| Tower HP from upgrades | every tier on both towers carries `hp`; Warbringer 150 → 575 (A) / 700 (B), Rifleman 80 → 380 (A) / 505 (B) | `Smasher.UPGRADES`, `Soldier.UPGRADES` |
| Health tier semantics | GRANTS its delta — it does not heal to the new maximum | `applyUpgrade` on both |
| Warbringer swing animation | base/B 0.2 s; Path A 0.48 s with three overhead afterimages and 1.6 s AoE cracks; damage still lands only at cooldown zero | `Smasher.SWING_SECONDS`, `PATH_A_*`, `swingPose`, `pathAImpact` |
| Rifleman base | 1 dmg x 3 shots / 1.2 s = 2.5 DPS, 100 u.l., 80 HP as placed (upgrades take it to 380 / 505) | `Soldier.BASE_*` |
| Rifleman burst | cycle runs burst-START to burst-START; spacing is shape, not cost | `Soldier.prototype.attacksPerSecond` |
| Rifleman automatic | B3 onwards: 2.5 shots/s, derived from the burst it replaces | `Soldier.BASE_AUTO_SHOTS_PER_SECOND` |
| Rifleman A damage ladder | 1 / 1 / 2 / 4 / 8 | `Soldier.UPGRADES` |
| Rifleman A5 | 8 dmg x 5 shots / 0.6 s = 66.7 DPS | `Soldier.UPGRADES` |
| Rifleman B5 | 20 dmg @ 2.5/s = 50 DPS (3.0/s and 60 with A1+A2), plus 4 recruits at 7.5 DPS each while alive, 45 s cooldown | `Soldier.UPGRADES` |
| Rifleman full A | 6400 on top of $300 (200/325/700/1900/3275) = $6700 for 66.7 DPS | `Soldier.UPGRADES` |
| Rifleman full B | 7200 on top of $300 (200/350/750/2100/3800) = $7500 | `Soldier.UPGRADES` |
| Rifleman cost | 300 | `Soldier.COST` |
| Rifleman footprint | 11.25 u.l. — the gunner's, so it stands where a gunner can | `Soldier.FOOTPRINT_RADIUS_UL` |
| Recruits (B4) | 2 per press, 0.25 s stagger, 45 s cooldown; drawn as smaller automatons | `Soldier.RECRUIT_*` |
| Recruit stats (B4) | 1 dmg @ 2/s, 20 HP, 100 u.l., walks END → START at 50 u.l./s and stops to shoot | `SoldierRecruit` |
| Recruit stats (B5) | 4 per press, 3 dmg @ 2.5/s, 40 HP, still a 45 s cooldown | B5 `recruitBoost` |
| Recruit contact | mutual, out of a pool: each body costs what killing it is worth (`armor + hp / (1 − def%)`), capped at what the recruit has left | `SoldierRecruit.takeContactDamage`, `contactCostFor` |
| Recruit hover | HP and range under the cursor plus a violet range ring; yields to enemy hover | `recruitAt`, `drawRecruitHover` |
| Auto-ability switch | pill in the ability button; OFF by default, not saved, no safety guard | `AutoAbility` |
| Towers with auto | Rifleman `recruits`, Arcane Sniper B5 `ability`; not Sniper cone re-aim | `AutoAbility.attach` call sites |
| Defense cap | 99% | `Mitigation.DEFENSE_CAP` |
| Siphon base | 1 AD x 10/s, 75 u.l., 1 target | `TowerConfigs.beam.base` |
| Siphon cost | 800, unchanged (full A 33 800, full B 17 900) | `beam.config.js` |
| Siphon beam origin | the spout, 0.62 x footprint above centre — beams rise out of the basin | `BeamTower.prototype.spoutPoint` |
| Death denial knockback | 500 u.l. along the path | `DeathDenial.KNOCKBACK_UL` |
| Rewind animation | 1.4 s, simulation frozen | `DeathDenial.REWIND_SECONDS` |
| Charge decay | 1 charge / 3 s, continuous, out of combat | `charge_to_gold.decaySeconds` |
| Gold scaling ceiling | 50 000 gold (5 tiers, cap x10) | `GoldPower.MAX_SCALING_GOLD` |
| Death denial gate | 5 000 HP healed, pooled across all towers | `beam.config.js` B5 `unlockCondition` |
| Sell refund | half of everything spent | `SELL_REFUND_FRACTION`, `sellValue()` |
| Starting cash | 600 (was 20 before 2026-07-30); buys two Riflemen. BUILD prices were deliberately not touched by the 2026-08-01 repricing, to keep that true | `STARTING_CASH` |
| Combat income | each body's authored kill bounty, paid once on final death | `Enemy.TYPES[*].bounty`, `Enemy.bountyOf`, `Enemy.prototype.bounty` |
| Cash per damage | **gone since 2026-07-31.** Damage pays nothing | — |
| Redistributed opening cash | $5000 across waves 1-34 (+$148 on 1-2, +$147 on 3-34) | `WAVE_PROGRESSION_REWARD_TOTAL`, `waveProgressionReward` |
| Rising wave allowance | $50 on wave 1, +$5 per wave, $215 on wave 34, $4505 total | `WAVE_ESCALATING_REWARD_BASE`, `WAVE_ESCALATING_REWARD_STEP` |
| Easy run purse | ~$42 443 = 13 498 effective HP x $3 + $1 349 bounties + $600 stake | derived; asserted in `tests/run.js` |
| Sell refund | half, rounded up | `SELL_REFUND_FRACTION` |
| Build slots | 5, FOUR FILLED since the gunner was deleted: Warbringer, Arcane Sniper, Siphon, Rifleman | `BUILD_SLOTS` in game.js |
| Tower prices | Rifleman $300, Warbringer $700, Siphon $800, Arcane Sniper $900 — BUILD prices; upgrade paths cost $5200–$7500 (Warbringer, Rifleman), $17 900–$33 800 (Siphon), $20 250–$28 575 (Sniper) | each type's `COST`, each `UPGRADES`/config |
| Screens | menu → difficulty + route chooser / index → play | `screen` in game.js |
| Pause menu | Escape only, no HUD button | `paused`, `drawPauseMenu` |
| Build slot size | 76 px, 10 px gap | `SLOT_SIZE`, `SLOT_GAP` |
| Attack speed unit | attacks per second, on every tower | `TowerStats.rate` |
| Hover card | 300 px wide, 12 px padding | `TOOLTIP_WIDTH`, `TOOLTIP_PAD` in game.js |
| Tallest panel | 608 px of the 614 available (a 5-2 Siphon) | `inspectionLayout`, pinned in sandbox.smoke.js |
| Tower display names | cosmetic only; ids and constructors are unchanged | each type's `DISPLAY_NAME` — see the naming section above |

Enemy speed, bullet speed and footprint radius were chosen by an assistant, not
specified by the owner — they are the values that make his stated numbers work.
Everything else is his.

---

## Known limitations, in the order they will actually bite

1. `Tower.findTarget()` loops every enemy, every frame, for every tower.
   O(towers × enemies). Fine now, degrades around a few hundred enemies. Fix
   with a spatial hash when it matters.
2. Bullets are allocated and discarded per shot. Pool them when wave counts get
   real.
3. `whyCannotBuild()` loops every tower on every mouse move. Irrelevant until
   hundreds of towers.
4. `GamePath.pointAt()` and `closestToPoint()` do linear scans over segments.
   Fine for 7 points. `closestToPoint` runs on tower placement only, not per
   frame.
5. `addTower()` re-sorts the whole array on each placement. O(n log n) on a
   click is free; it would not be if towers were ever placed in bulk.

None are worth fixing yet. Do not preemptively optimise.

---

## Conventions

- ES5-style: `var`, `function`, prototype methods. Not preference — it keeps
  everything loadable as classic scripts with no transpilation.
- Two-space indent, semicolons, double quotes.
- Constants in `SCREAMING_SNAKE`, u.l. distances suffixed `_UL`, speeds `_ULPS`.
- Comments explain *why*, especially where a value is derived from another.
- Each entity owns its own `update(dt)` and `draw(ctx)`.

---

## The big open question

No hook has been chosen yet. The owner is deferring it deliberately.

This matters more than any code in the repo. Tower defense is heavily saturated
on Steam, and essentially every commercial success crossed the genre with
something else — roguelike runs, production chains, hero units, action combat,
or a decade of content depth. A well-executed pure tower defense does not sell.

When he is ready to decide, that choice should drive the architecture rather
than being retrofitted onto it. Until then, keep the foundation general and
resist building content that assumes a direction.
