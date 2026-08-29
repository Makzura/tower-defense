# Tower Defense — project context

**Version 0.5.0** — one thirty-five-wave campaign schedule at 830 bodies /
25 939 effective HP (plus every body a Fractal Slime's cascade, a Hive's brood
or the Tyrant's roar creates at runtime), which can be won or lost and ends on a boss. (Three
selectable difficulties existed from 2026-07-30 to 2026-08-12; Normal and Hard
were placeholders and the whole concept was deleted. See the change log.)
A **twenty-one**-type enemy roster (swarms, armor, camo,
an early midboss, one that attacks your towers, one behind a shield that
doubles its speed when the shield breaks, one that gets back up once, a spawner
whose brood is shielded and pays nothing, and the Tyrant at wave 35). **All
twenty-one are scheduled**, including the four v0.4.9
additions and the flying Aether Wisp imported from v0.4.10.0.
**A shield now pays nothing, ever**, and so does healed health;
waves
that mix three or four types at once; a clear bonus of a tenth of each wave;
**seven decorated maps** — the four authored routes plus deterministic Shifting
Ley, two-entrance Twin Confluence and the forest board `test`, each with its own
non-interactive procedural scenery;
**five towers in five build slots, which is now FULL** — Warbringer, Arcane
Sniper, Siphon, the Rifleman, the $300 burst-fire/automatic starter unit, and
the **Summoner** (2026-08-10, the $450 tower that never fires: it plants blubs
whose hit points are their ammunition, and they shoot for it — see its own
section). A sixth TYPE is fine, since the armoury already picks which five of
the owned types are equipped; a sixth SLOT is a decision about the bar's shape
 (three of the first four were renamed
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
enemy; and player-controlled pacing — a 1×/2×/3× speed toggle (the sandbox
extends the same ladder to 5×, 10× and 20×), a ten-second
pause before wave 1 with a Start button on it, and waves that own their own
window — each one runs until it is wiped out or its `duration` expires, and the
next is announced three seconds later if you sent it in, five if it ended on
its own. See the change log.

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

**And when a solve reports a clean number while the picture is still wrong,
suspect a LIMIT CONDITION IS BEING READ AS DATA.** Clipped, absent and
out-of-frame all yield plausible numbers that are not measurements: a clipped
height is a LOWER BOUND, not a height, and a body that drew nothing is not a
body at an extreme. Distinguish "not drawn" from "clipped" explicitly — a
measuring routine that conflates them will drive a solver confidently the wrong
way and report success. See the 2026-08-13 rank-rig entry in the change log.

**Run the test suite:** all six, none of which import each other — **five unit
suites plus `sandbox.smoke.js`, which is a smoke test rather than a suite.**
Where this file says "the five unit suites" it means these six minus the smoke
test, and that is a correct count, not a stale one. Name the set a count counts
before repairing it. These are the current measured results, **re-run
2026-08-27 with the elevation repair**, through
`node tools/ci-check.js`, which is the gate and holds these same numbers as its
baseline:

```
node tests/run.js                 191 pass / 0 fail   core game and schedule
node tests/content.test.js        244 pass / 0 fail   content, visuals and index
node tests/long-range-dps.test.js  74 pass / 0 fail   the Longshot spec
node tests/beam.test.js            47 pass / 0 fail   the beam acceptance list
node tests/blub.test.js            53 pass / 0 fail   the Summoner acceptance list
node tests/sandbox.smoke.js       passed              sandbox integration
```

`run.js` was 107 on 2026-08-14 and is 191 now. **Do not re-derive the steps
from this document** — every one of them is itemised, by test name and with its
self-test, in the baseline comment at the top of `tools/ci-check.js`: 108 → 112
wave identity, → 118 the wave HUD, → 125 the timeline scheduler (eight added,
one merged away), → 127 the identity audit, → 133 the schedule's composition
and timing gates, → 163/167 Ironwood's geometry, placement and elevation,
→ 187 the day/night cycle, → 189 the forest placement pass, → 191 the elevation
rule asked of every tower. Each raise landed in the change that earned it,
which is what that file asks for.

**This block said 133 / 225 / 72 / 45 / 53 until 2026-08-27**, which was the
2026-08-26 reading and four content changes out of date by then. The gate's own
baseline is the number to trust and it is the one this block is now copied
from; where the two disagree, run `node tools/ci-check.js` rather than either
of them.

**The paragraph below is HISTORY, not a live failure list.** The five content
names it records were failing on 2026-08-14; all five pass today. It is kept
because the lesson in it — diff the failure NAMES, never the totals — is the
thing that found the second bug in it.

**The five content failures of 2026-08-14, by name**, so nobody has to
re-derive them: "the
Tyrant's numbers are the ones that were asked for", "the roar shields it, speeds
it up, and calls the wave back", "after the roar it alternates shot and leap,
and still attacks rarely", "B4 pierces DEFENCE in flat percentage points, never
below zero", and "path B answers a brute with damage, not with pierce".

**The content line dipped to `181 / 31` for part of 2026-08-09.**
Adding the Summoner broke one codex test twice over, and both halves were real:
its path B stopped at B3 (the cross-branch `needs A2` gate truncated the walk,
so B4 and B5 were missing from the index), and the same test's *first*
assertion — "the gunner has no upgrade paths" — had been wrong since
2026-07-30, when the gunner was deleted and every roster entry shifted down a
slot, leaving it asserting that the **Warbringer** has no upgrade tree. Both
are fixed. **Diff the failure NAMES rather than the totals** if these numbers
ever look wrong: that is what found the second one, which no total could have
shown.

The failure groups are unchanged from the checkout baseline. The extra core and
content passes cover B5's fourth-round impact, moving channel lock,
resolution-frame aim freeze, adapter stun mirroring, Siphon's
hidden beams while stunned, and live base/shield enemy-sheet selection with
segmented field continuity. The core, Longshot and Sandbox failures are the
same Arcane-Sniper B5 ability/effect timing drift already present in the
checkout — how many of each there are is in the table above, and deliberately
not repeated here. The content suite includes that group plus older schedule,
boss, price and test fixture drift. Known examples:

- `content.test.js` — four boss/stun tests (`a stunned tower goes completely
  silent`, `the Tyrant's aimed shot…`, `the leap jumps 50 u.l.…`, `after the roar
  it alternates…`) throw **`ReferenceError: w is not defined`**. `w()` is a
  world-coordinate helper defined in `tests/run.js` only; these tests were
  copied across without it. A pure test-file bug — the mechanics themselves are
  fine, and the sandbox exercises them.
- `content.test.js` — `the roar shields it…` expects the boss to shoot every
  6 s off an 8 s base. The shipping boss is 12 s before the roar and 9 s
  after, which is what this document and the owner's correction describe, so the
  **test** is stale, not the boss.

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

**Run all six before believing a change is done.** Together they take roughly
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
- **The corollary is the dangerous half: a file with NO `<script>` tag is never
  executed by any suite.** It cannot throw, cannot fail, and cannot appear in
  any count, so every suite reports the same numbers whether that file is
  correct, broken or deleted. **"The suites pass" is not evidence that a file
  loads.** A boss shipped this way on 2026-08-13 — model on disk, no tag, and
  all six suites green, while the type itself was wired into `js/enemy.js`,
  `js/game.js` and two suites. **Add the `<script>` tag in the same commit as
  the file.** `node tools/check-script-manifest.js` is the standing check:
  every `js/**/*.js` is tagged by `index.html` or `sandbox.html`, and every tag
  points at a file that exists. Deliberate exceptions are listed in that file
  with their reasons, and pre-existing unwired files sit in a dated ledger that
  prints every run without failing the build. `tools/ci-check.js` runs it.
- **The mirror image breaks other people rather than you: a tag whose file you
  have but have not COMMITTED.** The harness `readFileSync`s every entry in the
  script list, so a clone at such a commit cannot run a single suite — it dies
  in `boot()` before the first assertion. `d828769` and `181119c` are both in
  that state on this branch, tagging `js/gl/models/enemy-boss.js` two commits
  before it was committed; measured there, run is 1/106, content 0/212 and blub
  0/53. **Your own working tree is always green**, which is exactly why this one
  escapes. The manifest check's third leg compares the tags against
  `git ls-files`. It is skipped, and says so in its output, when run against an
  extraction that has no git index.
- **`node tools/check-script-manifest.js --rev <sha>` asks the other question:
  was the branch bootable at that commit?** It reads the page and the file list
  out of git objects, so it needs no checkout and no extraction. The default
  form is prospective (catch it before it lands); `--rev` is retrospective
  (prove it afterwards). Both are useful and they are not the same gate.
- **Seed a gate run from a commit and you inherit that commit's defects.** When
  you materialise a commit to measure it, take a CONTROL run before the
  treatment: confirm the materialised tree boots at all before attributing any
  failure to your own change.
- **GIT AUTHORSHIP CARRIES NO INFORMATION IN THIS REPO. Never attribute a
  commit from it.** Every commit is authored `Makzura
  <diego.makzume@gmail.com>` — that is the checkout's configured
  `user.email`, so it is what the owner, every agent and the outside
  collaborator all commit as. Verified across sixty consecutive commits: one
  distinct author, including commits agents made themselves in this session.
  **`git log --format=%ae` here is a check that can only ever return one
  value**, and two people reasoned from it in one evening — one to accuse, one
  to exonerate — each finding it persuasive *because* it looked like hard
  evidence. A wrong instrument that flatters your own diligence is the hardest
  kind to doubt. Attribute from the commit message, the working tree, or by
  asking; never from authorship.
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
- **`h.pinWaveBreak(5)` IS A NO-OP SINCE 2026-08-25, and it is kept as a named
  one.** It used to write `WAVE_BREAK`, the 90 s ceiling on the gap between two
  waves, which otherwise left a 120 s throughput window containing one wave and
  a minute and a half of empty road — the four routes all scored an identical 95
  the day the break was lengthened, because none of them reached wave 2. There
  is no such number any more: a wave ends on its own `duration` or on being
  wiped out, and the gap after it is 5 s (3 with auto-send) and nothing else, so
  the cadence these tests were pinning is what the scheduler now does by itself.
  The twenty call sites stay because what they were FOR still needs saying at
  each of them. **Figures measured through those windows before 2026-08-25 are
  not comparable with today's** — the waves inside them arrive on different
  seconds now.
  `h.stepCallingWaves()` is the other tool — it sends every wave the frame it
  can, for tests that need to *reach* the end of the schedule rather than
  measure a rate. A called transition is 3 s rather than one frame, so a fixed
  second budget for "play the whole campaign" is fragile; loop until victory
  with a generous cap instead (the victory test does).
- **A wave that is wiped out calls the next one in five seconds later** (gate 1
  below). Any fixture that wants to sit in a long gap needs something carrying
  *that wave's* number still on the board — a survivor of an earlier wave will
  not do it any more. Rooting one enemy (`enemies[0].rooted = true`, the same
  flag a revived Revenant sets) is the cheapest way to hold it, and holding it
  only lasts until the wave's own `duration` expires.
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

**Nothing is fetched.** No audio FILES, no font files, and nothing that needs a
server. This is what lets the game run from a bare folder by double-click.

This line said "no audio" until 2026-08-18, and that reads wrongly now: the
game has a full sound effects set. What it has none of is audio *files*. Every sound is
synthesized at run time out of oscillators and noise buffers by
`SoundSynthesizer` in `js/game.js`, which needs no asset and no server — see
the Sound section below. The rule that holds is the one this paragraph is
named for: nothing is FETCHED.

This used to read "everything is drawn procedurally, no images", and that
stopped being true: `assets/*.png` ships a full set of Blender-rendered sprite
sheets, and they work from `file://` because they load through `Image()` rather
than `fetch`. The rule that actually holds is the one above. Two ways to add
art, both proven in the shipping build:

- **Geometry**, either exported from Blender into `js/gl/models/*.js` or built
  at runtime from `GLGeometry`'s primitives. Costs nothing to load.
- **Sprite sheets** through `Image()`, as the 2D fallback pack does.

What is still forbidden is `fetch`, `XMLHttpRequest` and anything requiring a
build step or a server.

**Keep `update()` free of DOM access.** Simulation and rendering stay separate.
Any future replay, fast-forward, or headless balancing work depends on it.

---

## Architecture

**Where the repository starts, because it is not where you are standing.** The
git root is **`TD_0.5.1/`**; the game is one level down in **`TD_0.5.0/`**, and
every path in this file is relative to that game folder unless it says
otherwise. A second tracked directory sits beside the game at the root:
**`visual-pass/`** — the design corpus the models and effects were built
against (`SIPHON-SOCLE.md`, `DIRECTION.md`, `CALIBRATION.md`, `HANDOFF.md`,
per-lot review records), plus the `git-sync.sh` that the post-commit hook runs.

**Source files cite those documents repo-root-relative**, so they are invisible
from where you work. `js/gl/gl-world.js`, `js/gl/siphon-enemy-fx.js`,
`js/gl/siphon-ground.js`, `tools/blender/siphon_beam.py` and
`tools/blender/siphon_idol.py` all name `visual-pass/SIPHON-SOCLE.md`, and a
`grep` or `ls` for it from inside `TD_0.5.0/` finds nothing — so the document
looks deleted. **It is not.** On 2026-08-12 that cost two people a search and
came within one step of a "reconstruction" of a file that was tracked, intact
and unchanged the whole time, which would have produced a second copy of a live
document. **Before concluding that any cited document is missing, run
`git ls-files` from the repository root, not from the game folder.**

```
index.html          loads the scripts in order; order matters. Since
                     2026-07-28 it loads the SAME tower/systems block as
                     sandbox.html -- the two lists must stay identical, or
                     the sandbox stops being a truthful preview of the game
js/units.js         UNIT_LENGTH + ul(): u.l. -> pixels (must load first)
js/path.js          GamePath: polyline, length, sampling, distance queries,
                     tangentAt (the road's heading, for lane offsets), the
                     WIDTH and PACE profiles, and `roadEdges` -- the one copy
                     of the mitre both renderers offset the road with
js/targeting.js     WHICH enemy to shoot: the six modes, TowerScore, and
                     Targeting.sees (the camo/flying rules for flat towers:
                     gunner, smasher, Soldier and its recruits)
js/maps.js          five authored maps plus two deterministic generated maps;
                     multi-route normalization, ROUTE PROFILES (a road that
                     changes width and pace along its length), derived
                     difficulty, and themed non-gameplay environments -- six
                     sci-fi facilities and one wild board (a dead relay in a
                     forest: fog, a river, a human camp)
js/enemy.js         Enemy: the twenty-one-type roster, movement, lane offsets
                     (scaled by the road's own width),
                     health, armor/defense, camo, flight, per-type sprite size,
                     timed slows, hover hit test, damage reporting
js/bullet.js        Bullet (homing) + PierceBullet (straight line, pierces).
                     Neither knows what a map is: a shot does not collide with
                     terrain, so the only things that end one are arriving,
                     losing its target, spending its pierce and running out of
                     range
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
js/tower.js         Tower: targeting, fire rate, footprint, cost -- plus the
                     three shared helpers the deleted gunner's file hosts for
                     everybody: `groundHeightUnder` and `elevatedRangePx` (the
                     two halves of elevation) and `towerReach`, the ONE answer
                     to which shape a tower's reach is. See the banner in it
js/smasher.js       Smasher: melee AoE, two upgrade branches, Path A's
                     multi-frame forge-slam, slow, the CHAINING blast, and
                     B5's map-wide earthquake
js/soldier.js       Soldier: the $300 burst/automatic starter, two upgrade
                     branches, and SoldierRecruit -- stop-to-shoot walking
                     units B4 calls in and B5 strengthens; NOT towers
js/farm.js          FarmTower ("Farm", id `farm`): the 1200-mana tower that
                     produces MANA instead of damage, and the first with
                     THREE upgrade paths. Also holds `Farms`, the board-wide
                     half -- the C network, its dice, the field a body is
                     standing in, and the three moments game.js calls in at
                     -- and `FarmDice`, the three tables as DATA
js/blub.js          BlubTower ("Summoner", id `blub`): the $450 tower that
                     never fires, its ten summon types, the swarm buff, the
                     weakening debuff and Coagulation -- plus Blub, one
                     summoned unit, which IS in `towers` (see that file's
                     header for the six things that buys) and whose hit points
                     are its ammunition
js/systems/summon-contact.js  SummonContact: the ONE door every friendly
                     summon uses for contact damage. A summon commits its
                     remaining HP when it hits an enemy; if the strike kills,
                     only the HP the enemy actually absorbed is spent and the
                     rest survives for the next body. Damage still goes
                     through TowerScore.apply, so armor, defense, shields,
                     revives and kill credit keep their normal rules
js/systems/damage-amp.js  timed "+X% damage taken" stacks that each expire on
                     their own clock. Read by Enemy.takeDamage, so it raises
                     damage from EVERY source; written only by the Summoner's
                     A4 today
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
                     logical 1280x720 space) and the projection cache.
                     `planeAt(x, y, z)` casts a pixel at ANY horizontal plane
                     and `groundAt` is it at zero; World3D.screenToWorld
                     brackets the ray with two of them to find the surface
js/gl/gl-math.js    perspective, look-at, one multiply, ray/plane. Column-major
js/gl/gl-geometry.js procedural primitives: ground, road, box, boxAt, sphere,
                     cylinder, frustum, segment (a prism between two points in
                     space -- the leaning-trunk/angled-stake shape the others
                     cannot make) -- plus `scenery`, the twenty-two authored
                     board prop kinds (ten machines, twelve wild: stems, stumps,
                     logs, bramble and the camp's barricades, spikes, sandbags,
                     watchtower, wreck, barrel and fence), and a per-vertex
                     EMISSIVE channel on Builder so runtime geometry can carry a
                     lit surface like an exported model does
js/gl/ironwood-ground.js Ironwood Frontier's deterministic visual ground skin:
                     one continuous olive surface with earth and moss blended
                     into its vertices, plus sparse low-poly tufts. It writes
                     no gameplay height, collision, placement or targeting
                     data and deliberately owns no tree geometry
js/gl/ironwood-path.js GENERATED from the authored forest-road GLBs: their packed
                     earth, worn centre, moss shoulders, side soil and embedded
                     stones, kept at full resolution and bent tile-by-tile
                     along Ironwood's live GamePath and width profile
js/gl/gl-models.js  the model registry the generated js/gl/models/*.js register
                     into; expands per-triangle data to per-vertex once, lazily
js/gl/gl-parts.js   which parts of a model are bolted to the MAP rather than to
                     the tower, recovered from the geometry for models exported
                     before export_mesh.py learned to emit a `world_fixed`
                     group. See "Building a model that looks like the ones that
                     already work"
js/gl/gl-world.js   the world renderer: map mesh, board scenery, actors, the
                     projected overlay layer (range, cones, bars, chambers,
                     stun, projectiles, impacts) and `screenToWorld`. Also owns
                     the HEIGHT FIELD -- a coarse grid stamped from the same
                     numbers the map mesh is built from, so an actor is drawn
                     standing on the surface that was actually built under it.
                     `groundHeightAt` and `isLevelUnder` are the seams; the
                     second is read by the placement rule
js/gl/tower-preview.js TowerPreview3D: renders a tower's REAL registered model
                     into an offscreen framebuffer on the board's own GL
                     context and hands the 2D HUD a small bitmap, so the build
                     bar, armoury, loadout and codex icons are the same object
                     that lands on the board rather than a hand-drawn glyph
js/gl/siphon-beam-spec.js GENERATED by tools/blender/siphon_beam.py -- the
                     Siphon beam's profiles, laws and states. Do not hand-edit.
                     It READS tools/blender/siphon_origins.json rather than
                     retyping the beam origins, so siphon_idol.py runs FIRST
                     and siphon_beam.py second; run it the other way round
                     against a stale origins file and the beams are built at
                     the old point. `originFrames`/`originFrameCount` are
                     emitted only when that file carries per-frame origins,
                     and are keyed by gl-world's LOWERCASE siphonGroup() names
                     -- not by `originByTier`'s uppercase ones beside them
js/gl/siphon-beam-draw.js SiphonFXBeam: draws that spec between two MOVING
                     points. The 3D branch draws towers itself and never calls
                     a tower's own draw(), which is why the 2D beam code in
                     beam-adapter.js rendered nothing until this file existed
js/gl/blub-circles.js BlubFXCircles: the summoning circle under every planted
                     unit -- exactly two seconds, diameter taken from the
                     unit's own footprint so the table can be retuned freely
js/gl/blub-summon.js BlubFXSummon: the summon ceremony, on a duration budget
                     tied to the interval that triggers it
js/gl/blub-projectiles.js what a blub's shot LOOKS like. Presentation only --
                     js/blub.js resolves an attack instantly, so there is no
                     projectile in the air; this reads the cosmetic field
                     resolveAttack/fireLaser leave behind
js/gl/blub-systems.js BlubFXSystems: swarm threads (counting them reads the
                     bonus), the weaken sigil that fills with DamageAmp
                     stacks, and death effects
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
tools/glb_to_path.py `glb/ironwood_forest_path_moduleS.glb` plus its straight
                     `ironwood_forest_path_module.glb` reference -> generated
                     `js/gl/ironwood-path.js`. It unbends the four S instances,
                     preserves every triangle and the exact repeat seams; no
                     GLB is loaded at runtime
tools/blender/td_mesh.py the same primitive vocabulary WITHOUT Blender, emitting
                     export_mesh's exact contract. Geometry is authored in WORLD
                     space here and `parent` picks the animated group -- it is
                     not a second transform. Use it when a model needs no sprite
                     sheet; use Blender when it does
tools/blender/tower_warbringer.py path A, four bodies, built through td_mesh.
                     `python tools/blender/tower_warbringer.py` rebuilds them
                     and prints the weapon-to-body clearance per frame
tools/blender/tower_siphon.py the Siphon's five bodies (base/a3/a5/b3/b5), also
                     through td_mesh, so it needs PYTHON AND NOT BLENDER. The
                     hooded harvester: this is the one tower that carries the
                     old-magician read, because the Warbringer's contract
                     forbids it by name and the other two are a martyr and a
                     gangster. Seven tiers share five bodies
tools/blender/make_preview.py regenerates review sheets and inspectable .blend
                     files under tools/blender/preview/
tools/blender/WARBRINGER_CONCEPT.md the design the Warbringer will be built
                     from, plus the shortlist of the next five enemies
tools/blender/HOUSE-STANDARD.md what a model must be AT THE SIZE THIS GAME
                     DRAWS IT -- the resolvable ceiling, the feature-size
                     floor, value and contrast, how a tier is signalled, and
                     what a read may and may not be approved from. It
                     elaborates the model contract below; the contract is the
                     rule and this is the measurement behind it
tools/blender/BRIEF-siphon-idol-gesture.md the worked brief the Siphon idol was
                     built from -- the example of what a brief looks like here
tools/torn.js       `node tools/torn.js` -- flags any ground prop that is
                     frozen by HALVES. Run it after touching gl-parts.js
tools/fixed-list.js `node tools/fixed-list.js <model>` -- lists the solids a
                     model classifies as map-fixed, with their bounds
tools/check-parts.js one-line summary per model: fixed tris, emissive tris,
                     and the bounding box of everything held still
tools/ci-check.js   `node tools/ci-check.js` -- the gate the whole company
                     runs. Diffs failing test NAMES, not pass/fail totals, and
                     runs the script-manifest check described under "Things to
                     know if a test misleads you"
tools/blender/check_penetration.py  PER-PART, PER-FRAME solid overlap, the
                     clause 8 gate. The unit compared is the mesh OBJECT and it
                     pairs every part with every other; group roots are used
                     only to EXEMPT pairs sharing a limb. Walks the keyed frame
                     range. NEEDS BLENDER
tools/blender/check_group_gait.py  compares rigs before export by perturbing
                     the shared gait and diffing. Prints its derived coverage
                     on every run -- do not copy that roster into a document.
                     Its body list keys on which scripts IMPORT the chassis,
                     while the perturbation travels by CALL, so a body that
                     imports for palette and geometry only reads zero and is
                     EXPECTED, not a broken harness. NEEDS BLENDER
                     -- READ THESE TWO, DO NOT GREP THEM. Both use Blender's
                     vocabulary, so a search for "part", "group", "baked" or
                     "posed" returns nothing and reads as absence.
                     -- NEITHER SEES A LIVE POSED OVERRIDE. That case is ruled
                     to a future check on the JS side under plain `node`,
                     because JS holds the overrides matrix, the stroke constant
                     and the composition order, and Python holds only the
                     solids. Until it exists, "clean" from these two is
                     narrower than it sounds
js/codex.js         the index screen (screen === "index"): the tower/enemy
                     field guide. DERIVES everything it shows -- tower stats
                     from statLines(), the upgrade tree by walking each path
                     on a throwaway instance through panelActions(), enemies
                     from Enemy.TYPES + EASY_WAVES -- so it cannot go stale
js/game.js          setup, map chooser, waves, victory/loss, base HP,
                     placement, main loop, all drawing -- AND, since
                     2026-08-18, SoundSynthesizer and the audio panel, which
                     are in here rather than in a js/audio.js because the ask
                     was for no new files. See the Sound section
js/sandbox/sandbox-max-field.js  the sidebar's Max Field command. Loaded by
                     sandbox.html ONLY, so it is absent from the shipping page
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
tests/long-range-dps.test.js         run standalone, not part of run.js
tests/beam.test.js                   the beam spec's acceptance list
tests/blub.test.js                   one per numbered item in the
                                      Summoner's brief, plus the blub rail
tests/sandbox.smoke.js               boots sandbox.html against a stubbed DOM
tools/price-upgrades.js              the DPS model behind the upgrade prices
                                      (not loaded by the game or the suite)
-- THE TWO BALANCE INSTRUMENTS LEFT THIS REPOSITORY on 2026-08-14 (`0f6bbc3`),
   at the owner's ruling that the game repo is his cross-machine sync and our
   tooling does not belong in it. They now live in `THE_COMPANY/tools/balance/`
   and take the game tree as `TD_ROOT`.
simulate-campaign.js  MOVED. Plays the scripted waves through the real game
                                      under scripted building policies; the
                                      arithmetic behind the schedule
measure-starter-kit.js  MOVED. Does the STARTER kit still lose? Added
                                      2026-07-29 because the Soldier put camo
                                      detection on the starter bar for the
                                      first time, which is the premise the
                                      whole meta-progression loop rests on
                                      ** THE CONSEQUENCE, WHICH IS A COST OF
                                      THE RULING AND NOT A DEFECT: A CLONE OF
                                      THIS REPOSITORY CANNOT REPRODUCE THESE
                                      FIGURES. Anything sourced to either tool
                                      is reproducible only by someone with the
                                      company tree beside the game tree.
                                      ** AND DO NOT RESTORE THEM FROM HISTORY.
                                      The deleted blobs are `e3bd3f4`'s broken
                                      gunner-pegged version; `git checkout` on
                                      these paths gets the tool that was wrong,
                                      not the repaired one that moved. **

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

Data flow worth knowing: `Bullet.update()` **returns the damage it landed**, but
the main loop discards that return — **only the later death sweep pays cash**,
out of `bounty()`. Damage and kill credit are the things that never travel by
global mutation; they go through `TowerScore.apply`. Cash is not in that rule:
it is a global written in four places, and `worldContext.addGold` is the door a
tower uses. Keep scoring that way.

A bullet also **claims damage on its target while in flight**, which is what
stops two towers wasting shots on the same enemy — see Target claiming below.
That claim is the one piece of cross-entity state in the game, and it is
strictly paired: reserved in the constructor, released when the bullet dies.
There are **two** such pairs, not one — `PierceBullet` keeps its own and claims
only the enemy it was AIMED at, so the ones it passes through go unclaimed.
That is deliberate, and documented in the file as a known limitation.

---

## Waves, base health, loss, victory, and restart

`EASY_WAVES` in `game.js` is the campaign's finite enemy schedule, and `WAVES`
is an alias for it — one schedule, nothing to select. **The `EASY_` prefix is
historical.** Three selectable difficulties existed between 2026-07-30 and
2026-08-12 and were deleted along with the whole concept: `DIFFICULTIES`,
`setDifficulty`, `selectedDifficultyId`, `buildDifficultyWaves` and
`difficultyGroup` are all gone. Normal and Hard were placeholder modes a
collaborator added in a few seconds and the owner had forgotten existed; the
schedule below is the only one that ever meant anything. See the change log.

**A WAVE IS A TIMELINE** (2026-08-25; what it replaced is described under *A
wave ends at a gate* below):

```
{ duration, groups: [ { at, count, interval, type?, health?, tier? } ] }
```

`at` is seconds from the START OF THE WAVE, absolute — not a pause measured
from the group above it. The Nth body of a group arrives at `at + N ×
interval`, N counting from 0. `type` is a row of `Enemy.TYPES` and a missing
one means a stock normal; `health` overrides that type's number for that group
only; `tier` is the Fractal Slime's rung. **A MISSING FIELD IS DATA**: never
materialise a default into a group. `Enemy.healthOf` resolves the absence,
`waveSummary` keys on it and the composition gate in `tests/run.js` compares
it, so writing `health: 4` onto a group of stock normals changes no aggregate
anywhere and is still a different authored thing.

`duration` is a CEILING ON THE WAVE, measured from the moment the wave opens —
not a gap after its last body. When it expires the wave is over, its survivors
keep walking and the next wave is announced. Across the schedule it runs from
30 s to 125 s, and it clears the wave's own last arrival by at least 26.02 s
(wave 7, the tightest). A `duration` that fell before its own tail is rejected
at load time by `validateWaveTimelines`, which is the one authoring mistake the
timeline makes easy. **Wave 35 authors no `duration` at all**, and
that absence is the data saying there is nothing after it.

**GROUPS ARE INDEPENDENT AND ROUTINELY OVERLAP.** Measured on the shipping
schedule: 134 groups over 35 waves, and **18 of the 35 have at least one pair
of groups whose windows cross** — wave 22 runs three at once, wave 30 opens two
on the same frame. Reading the list top to bottom reads the WAVE; it is not the
order of arrivals and there is no queue. At an equal timestamp the order is (1)
the group's index in the array, (2) the body's index in the group — stable, and
the only thing that decides a tie.

**Deploying, in play, and a transition are three different states**, and
conflating them is how the old vocabulary misleads:

- **deploying** — the wave still has events left on its cursor. `waveSpawned`
  against `waveEventCount()`; the readout prints it as `12 / 22 deployed`.
- **in play** — this wave is the one on the clock. It starts when the wave
  opens and lasts until a gate closes it, so a wave can be **fully deployed and
  still in play for a minute**, with its Send button live and its ceiling
  ticking. `waveElapsed` is that clock and `duration` is what it is measured
  against.
- **a transition** — no wave is on the clock and `waveCountdown` is counting
  the next one in. 5 s, 3 s, or the 10 s opening pause; never a wait to be sat
  out and never long enough to be one.

An empty road proves nothing about any of the three. See *A wave ends at a
gate* below.

**The schedule, measured 2026-08-20** by summing `waveCount` and
`waveEffectiveHealth` over `WAVES`:

| waves | scheduled bodies | scheduled HP | effective HP |
|---:|---:|---:|---:|
| 35 | 830 | 24 141 | 25 939 |

(866 / 23 796 / 25 898 until the tier ladder landed — see the section below.
The body count FELL while health rose because the trims that funded the two
big slimes took whole escort bodies out, and the cascade's own bodies are born
at runtime and were never in this count.)

Both totals are pinned by `tests/run.js` (`scheduled health across the full
schedule` / `and what it actually takes to clear it`). Effective exceeds
scheduled because `waveEffectiveHealth` multiplies each body by its shield
ratio and revive count — what must actually be removed, not what is declared.

**Authoring a wave: `health` and `count` pay for themselves, `interval` and
`at` do not.** A group's `health` override scales income — `Enemy.bountyOf`
prices a body at `type.bounty × health / type.health`, so raising health raises
its bounty in the same proportion — and more bodies means more bounties.
Tightening an interval, or pulling an `at` back so two groups land on top of
each other, adds neither, which makes compression the cheapest pressure
available in this file. (This sentence used to end "they do
not simply pay for their own answer through damage income"; it was right, for a
mechanism retired on 2026-07-31.)

**The five formerly sandbox-only types are all scheduled:** Aether Wisp (waves
24, 31 and 35), Shieldbearer (27, 29, 30, 34), Camo Heavy (28), Healer (32) and
Vanguard (34). Camo Heavy appears only in wave 28, which is already pure camo
(`camo_normal` ×12 plus `camo_heavy` ×6), and that preserves the Warbringer
collateral rule below. Measured 2026-08-12.

**Type ids do not match display names, and a search on the wrong one proves
nothing.** Vanguard is `boss_fast`, Aether Wisp is `flying`, Bulwark is
`shielded`, the Tyrant is `boss`. A search for `type === "vanguard"` returns an
empty list, which reads as "not scheduled" and is wrong — it once came within a
step of putting a document into this file that contradicted the owner's own
ruling. Resolve the id from `Enemy.TYPES` before searching for a type.

The active `WAVES` reference survives `restartGame()`: Restart means replay this
route. Nothing about the schedule is saved to `MetaProgress`.

**A wave may be MIXED** (2026-07-29, v0.4.7, at the owner's request — "make the
wave a bit more chaotic, still deterministic but with more than 1 type"):
several groups, several types, deliberately on top of each other rather than
one after another. Six groups carry a `tier` on a fractal type (see the tier
ladder below).

**Mixed is about the ROSTER, never about the group count.** Every wave carries
`groups` now, so counting them says nothing: wave 24 is three salvos of Aether
Wisps and is as single-type as it ever was, while wave 13's twenty Angries are
five groups of four. A single-type wave is a question with one answer and those
are what teach the game; a mixed wave asks two at once, which is what makes the
back half feel chaotic rather than merely bigger.

### What guards the schedule in the suite, and what the guards cannot see

Added 2026-08-26 with the timeline scheduler's test pass. Six names in
`tests/run.js` carry the load; know which one to read before changing the
schedule, because they fail for very different reasons.

**`the timeline rewrite moved when bodies arrive and changed nothing else` is
the composition gate, and it is the one a retune trips.** It holds a snapshot
of all 35 waves taken BEFORE the rewrite — bodies, effective HP, clear bounty,
kill bounty, and the AUTHORED SIGNATURE of every group — plus the roster rules
(one Midboss, in 11; one Tyrant, in 35; Vanguard only in 34; Colossus only in
29; flight introduced at 24; 14, 18 and 28 camo end to end; the six fractal
rungs at 16/17/22/25/33/35). **Absence is part of the signature**: a group with
no `health` is a different authored thing from one that writes the type's own
number, and materialising a default while splitting a group is the mistake the
rewrite made easy — every aggregate in the game still balances afterwards, so
nothing else in any suite would notice. If you deliberately retune a wave, this
test is what you update, in the same change, with the reason.

**The kill column in that table is priced off the TYPE ROW and ignores `tier`,
so it is not `waveKillBounty`.** Over the whole campaign the two read $22 321
and $22 987; the gap is the six Fractal Slimes, whose tiers only
`Enemy.bountyOf` can see. Both totals are pinned, deliberately: a group that
loses its tier moves one of them and not the other.

**`the whole campaign runs itself dry, with every authored arrival emitted
once` is the only test in the repo that watches the RUN rather than the data.**
It plays all thirty-five waves with no Send, no auto-send and no click — every
wave closing on elimination or on its own ceiling — and wraps `emitWaveEvent`
to record each arrival as (wave, group, body). A dropped arrival and a doubled
one are both invisible to every count in the suite, because the counts read
`WAVES`: a wave whose ceiling cut its own tail still says 88 bodies and still
pays for 88. It costs about three seconds of CPU and is worth them.

**`a wave's clock starts when the wave opens, never when it finishes arriving`
records an ARBITRATION, not just a behaviour.** `at` and `duration` share one
origin — the moment the wave opens — so wave 1's 32 s ceiling fires at 32.0 s
and not at 35.2 s. The requirement was phrased "the timer starts at the first
spawn", and for 34 of the 35 waves that is the same instant, because their
first group is at `at: 0`. **Wave 11 is the exception**: its Midboss is at
`at: 4`, so four seconds of its 60 s window are empty road. If the other
reading was meant, that test is where it fails and wave 11 is the only wave
that moves.

The other three are `wave 22 runs three groups at once, and wave 30 opens two
on the same frame` (overlap and the same-frame tie-break, on the shipping
schedule rather than on a fixture built to have one), `wave 35's Tyrant walks
in at thirteen seconds and its T5 slime at twenty-eight` (the finale's two
authored landmarks, on the clock — neither was a readable number before `at`
existed), and `a second road mirrors the whole timeline, and is still one wave
and one reward` (Twin Confluence deploys all 88 bodies of wave 12 down each
road, off ONE cursor, and pays one reward).

### The Fractal Slime's tier ladder is SCHEDULED, one rung per wave

2026-08-20, at the owner's instruction: *"i want the slime tiers to spawn in
accordance to their HP as stated in the index and behave in that manner"*. The
mechanic was never wrong — a tier spawned by hand has always carried its stated
health — but the campaign sent **one rung of the six**, the T3 in wave 25, while
the index advertised all six. Five tiers existed only as somebody else's split
children.

Per ROOT, and the group's own total where a wave sends more than one:

| wave | group | root HP | to clear | bodies in all |
|---:|:--|---:|---:|---:|
| 16 | T0 ×4 | 1 | 4 | 4 |
| 17 | T1 ×2 | 4 | 16 | 10 |
| 22 | T2 ×1 | 16 | 48 | 21 |
| 25 | T3 ×1 | 64 | 256 | 85 |
| 33 | T4 ×1 | 256 | 1 280 | 341 |
| 35 | T5 ×1 | 1024 | 6 144 | 1 365 |
| | **1 372 authored** | | **7 748** | **1 826** |

(The last column counts the root and every generation under it, which is where
the 1 826 measured figure comes from; only the roots are in `waveCount`.)

**HP is the placement rule, and "to clear" is the difficulty.** A tier T root
takes `root × (T + 1)` points to remove — it conserves health as it divides,
four bodies at a quarter each — and ends in `4^T` terminal T0s. The base has
100 HP and a leak costs the leaker's remaining health, so a T5 that is not
cleared is 1 024 separate points of base damage. That, not the root, is why T4
waits for 33 and T5 for the last wave.

**The schedule PAID for the ladder rather than growing by it**: effective HP
25 898 → 25 939, +0.16%. Wave 33 funds its T4 exactly (two Bulwarks and a
Brute); wave 35 covers −340 of the T5's 1024 and waves 27, 29, 30, 31, 32 and 34
give up 641 more at 5–9% each — 1 267 trimmed against 1 308 added, and the 41
points of difference are the whole rise. **Nothing was taken off a v0.4.4 spine
opener or off a mechanism body** (Hive, Shieldbearer, Healer, Colossus, boss) —
what got thinner is ordinary escort.

**Do not quote the authored total as if nothing changed.** A board that clears
every cascade removes 7 748 points where the six roots count 1 372 (1 826
bodies born to do it), and earns $3 874 across the generations against the $686
of roots the purse counts. The
authored figures are deliberately blind to death-born bodies, exactly as they
are to a Hive's brood.

**Measured, not asserted** (headless, maxed board, `baseHp` is useless as a
meter because upgrade paths heal it, so leaks were counted directly):

- 20 mixed maxed towers, wave 35: 1 453 kills, **peak 151 bodies on the road**,
  zero leaks, 55 s. Without the T5: 88 kills, peak 40, 37 s.
- 14 maxed Arcane Snipers and nothing else, wave 35: 146 points of leak damage
  against a 100 HP base — **it loses**. The finale now asks for coverage, not
  only for single-target damage, and that is the intended shape.
- The three early rungs cost a weak board nothing: 5 un-upgraded towers took
  the same 11 / 70 / 100 points of leak damage on waves 16, 17 and 22 with the
  ladder in and with it stripped out.
- Simulation cost is linear and small — 1.13 ms per update at 1 024 bodies —
  and the cascade never puts them all on the road at once anyway.

**T0 is in 16 and not in 12 on purpose.** Wave 12 is the suite's mixed-wave
fixture — "a wave resolves into one interleaved timeline of arrivals" and "a
second road mirrors the whole timeline" both walk it, and it was "a mixed wave
deploys its groups in order" that walked it before 2026-08-25. A fixture that
changes shape whenever content lands stops testing the scheduler.

**NEVER give a fractal group a `health` override.** `Enemy.healthOf` takes the
tier branch and discards it, so it is a no-op on the body and a lie in
`waveKillBounty`. `tests/content.test.js` checks the whole schedule for one.

**The index derives all of this and must not be edited to match.** Tier range,
highest campaign HP and the campaign-waves list in `js/codex.js` are read off
the schedule and the type's own `fractal` block, so scheduling a rung moves the
guide with no edit — which is the property the test pins.

**THE FLAT FORM IS GONE (2026-08-25).** Until the timeline rewrite a wave could
be a bare group object — `count`, `interval` and `type` on the wave itself, no
`groups` array at all — and `waveGroups(wave)` reconciled the two shapes with
`return wave.groups || [wave]`. Nineteen of the thirty-five waves used the bare
form, so a hand-rolled walk over `wave.groups` saw **58 groups against the true
77** and silently dropped a quarter of the schedule, reporting a type as
appearing *nowhere* when it was scheduled in plain sight (the midboss, wave 11).
Every wave now carries `groups`; the fallback is deleted, and `waveGroups`
THROWS a named error on a wave without one rather than handing back an
`undefined` that only fails four frames later inside `waveCount`. A fixture that
hands the game a flat wave gets that error, and it says which shape to write.

**IF YOU ARE AUDITING THE SCHEDULE, STILL CALL `waveGroups()` — and
`waveTimeline(wave)` if what you want is arrivals rather than authorship.** The
old undercount cannot recur, but the same mistake has a new form: walking
`wave.groups` by hand gives you the AUTHORED list in AUTHORED ORDER, which is no
longer the order anything reaches the road in. `waveTimeline` is the one
expansion of `at + N × interval` into `{time, groupIndex, bodyIndex, ...}`
events, sorted, and the scheduler emits from that list and nothing else.
`waveCount`, `waveEffectiveHealth` and `waveSummary` are built on `waveGroups`,
and so is the index screen's per-type "appears in waves N, M" list. The schedule
is **134 groups over 35 waves** today, against 82 before the rewrite cut long
groups into salvos (19 of those 35 waves were a single flat group) — the bodies did not move, the group count did.

**CAMO WAVES ARE NEVER MIXED, and that is a rule about the Smasher.** Its swing
damages whatever it physically reaches, camo included; it simply will not
*turn* towards something it cannot see (see the camo table under Content). With
one visible enemy in a camo wave a detectionless Smasher starts swinging and
takes the camo down as collateral, and the whole buy-detection check the
schedule is built around quietly evaporates. A test pins it.

### A wave ends at a gate, and there are three

**What this replaced (2026-08-25).** Until the timeline scheduler the gap
between two waves was `WAVE_BREAK`, a **90 s ceiling** on the pause between one
wave's LAST SPAWN and the next wave's first, ended early by the Send button or
by the board going empty. `WAVE_BREAK` no longer exists. The ceiling moved onto
the wave itself as `duration`, so the thinking room the 90 bought is now bought
by the part of a wave's own window that nothing is walking in, and what is left
between two waves is a transition of 5 s or 3 s.

**`endWave(delay)` is the ONE exit a wave has.** All three gates go through it,
which is what makes *the reward is paid exactly once* a property of a single
function rather than of three call sites agreeing with each other:

| gate | what closes the wave | transition | survivors |
|---|---|---|---|
| **1 — eliminated** | every scheduled body emitted **and** nothing carrying that wave's number still alive, descendants included | `WAVE_CLEAR_DELAY` = 5 s | none, by definition |
| **2 — ceiling** | `waveElapsed` reaches the wave's `duration` | `WAVE_CLEAR_DELAY` = 5 s | keep walking, keep their own wave's number |
| **3 — Send** | the button, or auto-send, once every scheduled body is out | `WAVE_CALL_DELAY` = 3 s | keep walking |

**SURVIVORS ARE NEVER TOUCHED BY A TRANSITION.** Gates 2 and 3 both close a wave
that still has bodies on the road. Those bodies keep walking, keep their origin,
stay fully dangerous, and — this is the half that is easy to get wrong — cannot
hold the NEXT wave open either, because gate 1 asks about one wave's number and
never about the road. See *Every enemy knows which wave it came from* below.

**Gate 1 needs the whole wave emitted first, and that is not the same as an
empty road.** Wave 13 sends five salvos of Angries 4.5 s apart and a good board
empties the road between every pair of them; `lastDeployedWave()` answers `0`
until the event cursor is spent, so those silences are not clears.

**Gate 3 is a real transfer of power, and it did not exist before.** Under the
sequential scheduler a wave ended on its own last body, so a Send could only
ever shorten the pause afterwards — nothing a patient player would not have got
anyway. Now the button goes live the moment the wave has finished arriving, and
it can cut fifty seconds off a wave's window with twelve enemies still walking.
The label stays **Send next wave** rather than becoming *End wave*: what it
honestly promises is that the next wave lands in three seconds, and the closing
of the current one is bookkeeping the player never sees.

**Why three and why five** (2026-07-31, unchanged by the rewrite): a wave that
appeared on the frame of the click gave the player no moment to look up from
what they were reading, and the five is the owner's *"once all the enemies of a
wave have been killed, if not on auto skip, leave a 5 seconds delay until the
next wave"* — the only pause a *winning* player gets, and nobody asked for it,
which is why it is the longer of the two. The opening pause is the third number:
`RUN_START_DELAY` = 10, brought in at **0** by the Start button, because a
button that says Start starts and there is no board to look up from yet.

**"If not on auto skip" still needs no branch anywhere.** Auto-send goes through
the same `skipNextWave()` the button does, so on a deployed wave it takes gate
3's three seconds; inside a transition `callNextWave` uses `Math.min`, and three
is closer than five. A call may only ever bring the next wave CLOSER — with two
seconds left, calling it in must not push it back out. So the toggle keeps its
three-second cadence through a cleared board without the clear path knowing the
toggle exists.

**Auto-send never touches a wave's internal timing.** It ends waves; it cannot
compress an `interval`, move an `at` or drop an arrival, which would be
rewriting the schedule rather than its pacing. A test pins it.

**NO GATE OPENS A TRANSITION FOR WAVE 35**, because there is nothing to
transition to. Gate 2 cannot fire — it authors no `duration`. Gate 3 is refused
by index as well as by deployment, and the button is not drawn. Gate 1 still
fires, on its own branch in `update()`: it pays the last bounty and stops
there, with no `waveIndex++` and no countdown. The cursor is retired instead by
`emitDueSpawns()` on the last body of the last wave — the only place
`allWavesDeployed` is set — and the run then ends on the whole-road victory
test, which is a question about the map rather than about wave 35.

**What is deliberately gone is the FLOOR under a losing board.** The 90 s break
was a wait nobody could lose: with something still walking, the player got as
long as they needed. A wave that is not being killed now ends on its own ceiling
and the next one is announced on top of the survivors. That is the change the
rewrite is FOR rather than a side effect of it, and it is the one thing in this
rewrite that moved difficulty. **Nobody has re-measured the campaign against a
real tower board since** — retuning by simulation is out of bounds in this
repo — so if the back half turns out to be unfair, this paragraph is where to
start looking, not the wave data. Measured consequence on a board that clears
everything, unchanged from before: a winning run takes about 730 s of wall clock
instead of about 3100 s.

### Every enemy knows which wave it came from

2026-08-25. Every body on the road carries `waveId` — the 1-based number of the
wave that scheduled it, matching the number the player is shown. `0` means *no
wave put this here*: sandbox spawns, codex sprites, test fixtures.

**A wave is over when its own bodies are gone, not when the road is empty.**
`waveStillOnTheRoad(n)` in `game.js` scans for `waveId === n`, and the clear
branch in `update()` asks it about `lastDeployedWave()`. What this fixed: a
survivor of an *earlier* wave — the stragglers a wave's `duration` ceiling leaves behind, a
Fractal Slime cascade still unwinding two waves later — used to hold the
current wave's clear open under the old `enemies.length === 0` test. Beating
wave 30 outright paid nothing and called nothing in while one wave-29 Brute was
still walking, and nothing on screen told the player which body was doing it.
Survivors of a previous wave stay fully active and dangerous; they simply no
longer gate the wave in front of them.

**`lastDeployedWave()` answers "which wave has finished arriving", or `0`.**
Corrected 2026-08-26: it returns **`waveIndex + 1`** — the wave *on the clock*,
once its event cursor is spent — and not `waveIndex`, which is what it meant
under the sequential scheduler where `waveIndex` had already moved on by the
time the last body was out. It returns `0` during a transition (`waveCountdown
> 0`: there is no wave arriving), `0` while the wave on the clock is still
arriving, and `WAVES.length` once the schedule is spent and `allWavesDeployed`
is set. A partly deployed wave can therefore never be read as beaten, which is
what stops a road that goes momentarily empty between two of its groups — wave
13 sends five salvos of Angries 4.5 s apart — from closing the wave early.

**The identity is INHERITED, never re-derived.** There are exactly five
`new Enemy` call sites in the project and four of them are on the board:

| site | what it makes | how it gets the wave |
|---|---|---|
| `spawnEnemy` (game.js) | the scheduled body | **minted** — `waveIndex + 1`, the only place an identity is created |
| `spawnMinions` (enemy.js) | a Hive's brood | `waveId` on the `born` overrides |
| `splitOnDeath` (enemy.js) | a Fractal Slime's four children | `waveId` on the child overrides |
| `summon` (enemy.js) | the Tyrant's roar | `waveId` on the summoned overrides |

(The fifth is `codex.js`, a parked sprite that never joins `enemies`.) A
**Revenant needs no code at all**: it gets back up as the same object, so it
keeps the origin it was born with. A phase's roar reaches the board through
`pendingSpawns`, which `spawnMinions()` drains — one door for the brood and the
roar both, so there is no sixth site hiding behind the summon.

**A sixth site is what this fails on, so a test reads the source.** "every place
in js/ that builds an enemy from another one passes the origin on"
(`tests/run.js`) scans every `.js` under `js/` and requires the function around
each `new Enemy(` to mention `waveId`; `js/codex.js` is the one exemption, and
the exemption is itself checked to still have a call site behind it. The rule is
coarse deliberately — `spawnMinions` passes an object built ten lines earlier
while the other two pass literals — but a new site that never says the word
cannot be silent. Its companion, "a wave stays open while a body it never
scheduled is still walking", leaves a wave-25 cascade as the only thing alive
and watches the wave refuse to close for four generations: inheriting the number
and being *held open* by it are two different facts, and only the second one is
the feature.

Reading a global *current wave* inside a child would be actively wrong, not
merely indirect. A T5 slime leaves 1 364 descendants across five generations
and a Hive drops five hatchlings every seven seconds; those bodies routinely
outlive the wave that scheduled their ancestor, and they belong to that wave
however many waves later they are born. Re-parenting them onto the current wave
would make a wave that can never be closed.

**Victory is the one place that still asks about the whole road,** and the
asymmetry is deliberate. A wave transition is a question about one wave; winning
the run is a question about the map. `allWavesDeployed && enemies.length === 0`
stays as it is, so a stray wave-33 Brute still walking during wave 35 keeps the
victory screen away — `waveStillOnTheRoad(35)` would hand the player the win
over its head.

Four tests in `tests/run.js` pin this, one per hop: the scheduler minting it,
broods/splits/summons inheriting it, a straggler failing to hold the next wave
open, and the win still waiting for the road.

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
a "not started yet" mode, so it inherits everything a transition already has: the
readout counts it down (*"Wave 1 in 10 s"*), the Send button is up, auto-send
sends it, the pause key pauses it, and towers can be placed the whole time. Two
consequences that had to be handled explicitly:

- **`betweenWaves()` lost its `waveIndex > 0` guard.** That guard existed only
  because a run used to start with `waveCountdown` at 0 and wave 1 already
  spawning, so there was no transition there to describe. Now there is. `beforeFirstWave()`
  is the new predicate, and it is needed in exactly two places: the button's
  label, and the zero delay.
- **The wave-clear trigger needs a wave to have happened.** An empty road is
  precisely what a run starts with, so without a guard the clear branch reads
  the untouched map as a wave the player just beat and cuts the ten seconds to
  five on the first step. The guard was `!beforeFirstWave()` until 2026-08-25
  and is now `lastDeployedWave() > 0`, which is the stronger form of the same
  statement: 0 is also the identity worn by sandbox and codex bodies, so those
  cannot drive the schedule either.

**The Start button is the Send button.** Same rectangle, same handler, same
thing — bring the next wave in early — and the only honest difference is that
before wave 1 there is no wave to be "next", so `waveSkipButtonLabel()` says
*Start wave 1*. A second button would have been a second rectangle to place,
hit-test, draw and hide in order to say what that one already says.

**The sandbox does not inherit the pause.** It is a workbench; you do not reset
one in order to wait on it. `js/sandbox/sandbox.js` zeroes the countdown in both
of its restart paths, deliberately.

**The test harness does not inherit it either**, for the same reason it used to
pin the break: every test written against "t=0 is wave 1 on the road" should
still measure what it was written to measure. `boot(mapId)` used to run the
game's own `spawnScheduledEnemy()` once; on a timeline there is no "delay to the
next body" for that to return, so it now writes `waveCountdown = 0` and steps
`updateWaves(0)`. That is the same instant said the new way — the opening pause
expires, wave 1 opens, its clock reads 0.00 and every event it authors at
`at: 0` is on the road — and it is `updateWaves` rather than `update` on
purpose, because a zero-length `update()` would also pulse every enemy, tower
and effect on the board. A test that wants the real opening takes the genuine
path — `boot(null)` then `chooseMap(...)` — which four tests in `run.js` do,
including the campaign run-dry test: it wraps `emitWaveEvent` to count arrivals,
and through `boot(mapId)` wave 1's first body is already out before the wrapper
exists, so the count would read 829 against an authored 830.

`skipNextWave()` is kept as the button's name for `callNextWave()`, because the
button, the auto-send toggle and several tests all speak in terms of skipping.

**`autoSkipWaves` is the standing version of that button** (also 2026-07-29, at
the owner's request): with it on, `updateWaves` calls `skipNextWave()` every
step, so every wave is sent the frame it becomes sendable and the campaign runs
unattended. That means a three-second transition rather than a one-frame one,
which is deliberate — it goes through the same `skipNextWave()` the button does,
and that shared path is the point. Two things about the wiring:

- **It goes through `skipNextWave()`, not through its own countdown poke.** So
  it inherits gate 3's guard — a wave that is still arriving cannot be sent —
  and in particular it can never compress the `interval` *within* a wave or
  pull an `at` forward, which would be rewriting the schedule rather than its
  pacing. A test pins it.
- **Its toggle lives in the bottom-right corner beside the speed button, not
  beside the skip.** With auto-send on a transition lasts three seconds, so a
  toggle drawn only between waves would be a control the player has three seconds at a
  time to find. It has to be on screen all run, and a permanently live button
  means a permanently dead patch of map under it, so it goes in the corner where
  this game already keeps that cost. It also belongs with the speed control on
  the merits: both are "how fast does my run go", both outlive a restart,
  neither is run state.

**A generous `duration` costs nothing to give, which is why the ceilings run to
125 s.** Income is a fixed bounty paid once per kill and never a trickle per
second, so idle seconds earn exactly nothing: a wave's window cannot be farmed,
only used or ended early, and no number in Balance math is a function of
wall-clock time.

Three rules keep the call honest:

- **`waveSendAvailable()` is the one condition** behind the button — read by the
  click handler, the drawing and `overInterfaceChrome()` alike. (`betweenWaves()`
  is now the condition behind `callNextWave()` and nothing else; gate 1 asks
  `lastDeployedWave()` and `waveStillOnTheRoad()`, which are questions about a
  wave rather than about a countdown.) The button therefore cannot be drawn
  where it is not clickable, or —
  the nastier direction — sit live over open ground all run swallowing clicks
  meant to place a tower there. Until 2026-08-25 all three call sites spelled
  the conjunction out for themselves and one of the three had already dropped a
  term; see *The wave readout and the Send button* below.
- **`callNextWave()` shortens the countdown; it does not spawn.**
  `updateWaves()` stays the only thing that ever deploys an enemy, so there is
  no second path for `allWavesDeployed` or the wave banner to get wrong.
- **`callNextWave()` only ever shortens a TRANSITION.** Called while a wave is
  on the clock it returns false and changes nothing — a countdown that is not
  running has nothing to shorten. Ending a wave early is a different operation
  with a different function (`endWave`, gate 3), reachable only once every
  scheduled body is out; without that split a player could pile the whole
  schedule onto the board at once.

Gate 1's check lives in `update()` immediately after the dead/leaked filter,
because that is the one moment the enemy list is authoritative: everything that
died this step is out of it and nothing new has spawned, and `updateWaves()`
already ran at the top of the step so a body emitted this frame is in the list
and cannot be missed by the scan.

Note that calling waves in back-to-back is *harder* than letting them space
out — the same enemies arrive in one clump, and a tower that shoots one at a
time kills fewer of them. A wave says how many, how often and which type —
**never how tough**: health comes from the type unless the wave (or one of its
groups) carries a `health` override, resolved through `Enemy.healthOf`, the
same resolver the spawner uses.

**Easy is thirty-five waves, 830 enemies, 24 141 scheduled HP**
(2026-07-29, v0.4.7, rescaled since; 866 / 23 796 until the tier ladder was
scheduled on 2026-08-20; it was 33 waves and 4308 HP, before that 20
waves and 3094, before that two waves and 52). Both figures are pinned by
`tests/run.js`. Scheduled HP is no longer the whole story, so
two more numbers matter:

- **25 939 EFFECTIVE HP on Easy** — what the player actually has to remove. The
  owner's original target was half that ("make it so that the total is like
  13500 hp", 2026-07-29); the spine was rescaled afterwards and 13 500 is no
  longer what the schedule aims at. A
  shield is health you must chew through and a Revenant is two bodies, so
  effective HP is `count × health × (1 + shieldRatio) × (1 + revives)` per
  group — `waveEffectiveHealth` in game.js is the one implementation, and the
  clear bounty reads the same function. **This is NOT the run's purse** — a
  shield is counted here and pays nothing, so effective HP (25 939) and
  scheduled kill bounties ($22 987) are different quantities and always will
  be. Since 2026-08-20 a THIRD gap sits beside that one: a Fractal Slime's
  cascade is death-born, so neither figure counts the 6 376 points the six
  scheduled roots turn into or the $3 188 they pay on the way. See "A SHIELD PAYS NOTHING, EVER" below, which says the same thing from
  the other end.
- **Plus two amounts no table can state**, both decided by how the run goes.
  Every seven seconds a living Hive drops five hatchlings, each with a shield
  equal to its own life and each paying nothing — about 160 points of unpaid
  effective health per Hive that survives thirty seconds. And the wave-35
  boss's roar calls in another 2780 HP at 1.5× speed. Neither is a gap in the
  arithmetic; both are the point of the enemy that produces them.

On top of that, **finishing a wave pays a tenth of it** — about $2 594 across a
run. See "Finishing a wave pays a tenth of it" below.

Waves 1–11 are the introduction and are pinned exactly: single-type, no
`groups`, no v0.4.7 content, with waves 1–2 byte-identical to the original
opening the starting-stake economy is measured against. **The pin is
`tests/run.js`'s deep-equal on `WAVES.slice(0, 11)`, "the introduction, up to
and including the midboss" — so wave 12 is the first wave any retune may
touch**, which is where the 2026-08-14 retune starts.

**Overriding health rather than adding tougher enemy TYPES is deliberate.** A
type is a balance decision the owner makes; late-wave scaling is the same
enemies turned up. It also keeps `Enemy.TYPES` the single place a *type's*
toughness is written down. Note the override touches **health only** — a scaled
brute still carries its 5 flat armor, a scaled camo is still camo, and a scaled
Bulwark still gets twice its *new* health in shield, because the shield is
sized off the instance rather than declared as a number.

**Every wave must be claimed by a type, and the schedule must cover the whole
roster** (revised 2026-07-30). The index derives each type's appearances per
GROUP from the schedule itself rather than from whatever ran last.

The schedule carries all twenty-one types; Aether Wisp, Shieldbearer, Healer,
Vanguard and Camo Heavy all arrive late. `tests/run.js` asserts that every type
is scheduled
and also resolves every scheduled id through `Enemy.typeOf`, so a typo fails
loudly.

**The v0.4.4 twenty-wave spine is still in there, in order.** Those waves were
never replaced: v0.4.5 inserted eleven between them, and v0.4.7 gave some of
them a second group behind their opening and turned their `health` overrides
up. **The invariant weakened on 2026-08-25 and it is worth knowing exactly
how**: each tagged wave used to OPEN with the old wave's exact count, interval
and type, and now it CONTAINS that type and that total count. Old 2 is still
eight stock Normals, but they arrive as 4 + 4 rather than as one group of eight
at 1 s, so no single group carries the old row any more. What is pinned in
`tests/run.js` is the aggregate composition per wave, plus "no old wave was made
weaker". This is not
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
  2026-07-29 the **Soldier's B3** ($750 itself, but $1300 to reach — B1 200 +
  B2 350 + B3 750 — on top of a $300 tower; unlike A1 it cannot be bought
  straight off the shelf). 14 and 18 are
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
`simulate-campaign.js` is the arithmetic behind it (see Balance math below) —
**but it left this repository on 2026-08-14 and now lives in
`THE_COMPANY/tools/balance/`, so a clone of this repo cannot reproduce it.**

**The schedule's length is an ECONOMY constraint, not just a difficulty one.**
Scheduled kill bounties are the bulk of the run's lifetime purse ($22 987 of
$35 686 all in — see the table in the economy section).
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
is true and the enemy list empties — the WHOLE list, descendants and
earlier-wave stragglers included, deliberately unlike the per-wave clear test —
with the base standing, and freezes the
simulation exactly as a loss does, under a mirror-image overlay
(`drawVictory` / `drawGameOver`, both through `drawRunOverlay` — same
buttons, same keys). `allWavesDeployed` is set in **exactly one place**: `emitDueSpawns()`, on the
last body of the last wave, which is also where the cursor is retired — wave 35
has no gate to retire it. (It was `spawnScheduledEnemy` until 2026-08-25.) Tests
and the sandbox disable spawning with `waveIndex = WAVES.length`, and that idiom
must never read as a win — do not add a second assignment or derive the flag from
`waveIndex`. The loss check runs before the victory check so a final enemy
that both empties the board and zeroes the base reads as the defeat it is.

Since total effective HP (25 939) far exceeds the base's 100, an undefended base
really is destroyed — the loss path is reachable in ordinary play, not just
by tests. Both outcomes are pinned: the loss freeze by the original tests,
the victory path (and the manual-idiom non-victory) by
"clearing every scheduled wave wins" in `tests/run.js`.

### The wave readout and the Send button

*(2026-08-25, with the timeline rewrite.)* One line of text in the top-left
corner says where the run is, and one rectangle under it sends the next wave.
Everything below is **display**, in the sense the hard constraints mean it:
`update()` touches no DOM, the whole HUD is canvas, and every string is built by
a **named function** rather than inside a `ctx.fillText` — the test harness's
stub canvas records nothing, so a string composed inside `draw()` is a string no
suite can read, and a readout no suite reads drifts from what it describes
within a release.

**`waveStatusText()` has four states, and they are four different questions.**

| state | line | the question it answers |
|---|---|---|
| a wave is on the road | `Wave 7 / 35  ·  12 / 22 deployed  ·  38 s left` | which wave, how much of it is out, how long it has |
| a transition | `Wave 8 in 3 s` | when does the next one land |
| the final wave, on the road | `Wave 35 / 35  ·  3 / 49 deployed  ·  FINAL WAVE` | which wave, how much of it is out, **and that there is no next one** |
| the schedule is spent | `Final wave  ·  6 still walking` | how many are left to kill |

**One transition state, three delays.** The 10 s opening pause, the 5 s a
wiped-out wave buys and the 3 s a Send or auto-send buys all print the same
line, because to a player they are the same moment and only the number differs.
It reads `waveCountdown` and not a per-gate constant, so the corner cannot claim
three seconds while the scheduler is running five — whichever gate opened the
transition already wrote its own delay there.

**The final wave shows a STATE where the timer goes, never a number.** Wave 35
authors no `duration`, and that absence is the data saying *there is nothing
after this*. `waveTimeRemaining()` returns **null**, not 0 and not a default, and
the readout puts `FINAL WAVE` in the slot — a `0 s left` or a materialised
ceiling would be a countdown to a wave 36 that does not exist. This is the same
never-materialise-a-default rule the wave data follows; here the cost of
breaking it is a lie on screen.

**`waveElapsed` is the wave clock, and it starts when the WAVE OPENS** — the
frame the transition in front of it expires, which is also the frame `at: 0`
fires. `at` and `duration` are measured from that one origin, so a wave called
in early has exactly the same seconds as one that waited its transition out.
**For 34 of the 35 waves that instant is also the first arrival**, because their
first group is at `at: 0`; wave 11 is the exception, its Midboss is at `at: 4`,
and four seconds of its 60 s window are empty road. That is an ARBITRATION —
the requirement was phrased "the timer starts at the first spawn" — and it is
recorded in the test `a wave's clock starts when the wave opens, never when it
finishes arriving`, which is where it fails if the other reading was meant.
It advances in `updateWaves()` beside the
countdown — not in a draw function — because the timeline scheduler wants the
same clock to *enforce* the limit the readout *shows*, and two clocks would be
two things to disagree. `tests/run.js` pins that it advances, so a rewrite of
`updateWaves` that drops the line goes red instead of freezing the corner at the
wave's full duration forever.

**The Send button is live once every scheduled body of the wave in play is on
the road, and never one instant before.** It says nothing about whether the road
is *empty*: survivors of a deployed wave are the player's problem and do not
withhold the button. `waveSendAvailable()` is the single predicate — the
drawing, the click handler and `overInterfaceChrome()` all ask it and none of
them spells out its own conjunction. **The failure this shape rules out is not
"invisible and dead", it is INVISIBLE AND LIVE**: a 168×30 rectangle of open map
at (22, 100), near the top-left where a player builds early, silently eating the
click meant to put a tower there. `tests/run.js` does not reason about the
predicate for this — it sweeps all 344 points of the rectangle in **four**
scheduler states, asks the game's own `overInterfaceChrome()`, and then actually
builds through the click handler in two of them.

**The state that sweep exists for is the final wave, on the road.** It is the
only one where the two halves of the wave chrome disagree: `waveControlsShown()`
is true — the index has not passed the end, so the AUTO toggle is still drawn —
while the Send button is down, because there is no wave 36 to send. Every other
negative has *both* halves off, where a live rectangle would have to be live for
no reason at all; this one has a live half to be dragged along by, and it lasts
the minutes wave 35 takes on a board the player is still building on.

`waveSendReady()` refuses the last wave by index as well as by deployment, and
**that guard is unreachable from a running game**: `emitDueSpawns()` retires the
cursor on the last body of the last wave, so `waveIndex` is already past the end
by the time anything could ask. It is pinned by a fixture-held state anyway — an
untested rule inside a predicate three call sites read is a rule that gets
simplified away.

**The deployment count is what explains the button.** `12 / 22 deployed` reading
`22 / 22` with thirty seconds still on the clock is a sentence the sequential
scheduler could not produce — a wave used to end on its last body — and it is
the only thing on screen that says why a Send button just appeared over the map.
That is why the count keeps its space in the line instead of being dropped for a
tidier one.

**Wave summaries aggregate identical salvos, keyed on `(type, health, tier)`.**
The timeline cut a wave into salvos, so wave 13 sends its twenty Angries as five
groups of four; printing one entry per *group* would give the banner
`4 × Angry + 4 × Angry + 4 × Angry + 4 × Angry + 4 × Angry`, which buries the
one fact a banner exists for. The cut is a **timing** decision and the banner is
a **roster**. But the key is all three fields and **not the display name**:
`Enemy.typeOf` maps every rung of the Fractal ladder onto one row, so a name-only
key would print a T1 salvo and a T5 salvo — 4 HP and 1024 HP — as one
`8 × Fractal Slime`. No wave in the schedule splits a type across two `health`
values or two tiers today (checked wave by wave, all 35), so the strict key
prints exactly what the loose one printed; it is strict anyway because the
banner is the only place a player can see the difference.

**Every banner is checked against `waveCount()`, per wave, across the whole
campaign.** A summing bug here is the kind that hides: a dropped salvo or a
double-counted one still prints a line that reads exactly like a wave, and only
two of the thirty-five banners are pinned as literal strings. So the suite sums
the numbers the banner printed and compares them with the number of bodies the
scheduler will put on the road — per wave and not on the 830-body total, because
two waves wrong in opposite directions is not a state anyone should have to
reason about.

---

## The wave 35 boss — the Tyrant

Specified by the owner on 2026-07-29, after asking for the slot to be held
empty a few hours earlier: *"2500hp slow, arrives at the middle of the 35th
wave, shoots towers stunning them for 2 seconds, at half hp roars, sending
enemies from the waves that have 1.5x speed and the boss gains a 200hp shield
and gets a little faster and shoots more often."*

**Two figures in that quote have since been raised and it is kept verbatim as
the original ask, not as current values**: the body is **5000**, not 2500, and
the shield is **1000**, not 200 (2026-08-01, at the owner's instruction). The
table below is what ships.

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

**It arrives in the MIDDLE of wave 35** — `at: 13`, against a deployment whose
last body is at 28 s, so it walks in at 46% of the wave, dead on the halfway
mark. A boss at the head of a wave is a duel; a boss in the middle of one is a
wave you have to keep answering with a boss in the way. Seven Angries from 15 s
and four Bulwarks from 17 s arrive behind it while it is still crossing, and the
T5 slime closes the wave at 28.

**13 IS AN ABSOLUTE TIME, AND THAT IS WHY IT LANDS.** Until 2026-08-25 the
entrance was `lead: 6` — six seconds appended to however long the groups above
it happened to take — so the boss's moment drifted every time any earlier group
was re-timed, and "mid-wave" was an accident that happened to hold. It is now a
number someone chose, and `tests/run.js` pins it against the deploy length.

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
fraction is 0.1. About **$2 594** across the schedule.

**The bounty is a tenth of the wave's HP, not a tenth of its cash value** — HP
and cash are now separate quantities entirely, since a body's bounty prices its
whole threat rather than its hit points. Against the $35 686 lifetime purse the
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

The reward is written down — `pendingBounty` / `pendingBountyWave` — on the
frame the wave finishes deploying, and `payWaveBounty()` settles it from
**whichever of these comes first**:

1. **`endWave()`** — all three gates, which is the ordinary path and covers the
   wave being wiped out (gate 1), its `duration` expiring with stragglers still
   walking (gate 2) and the player sending the next one (gate 3). Since
   2026-08-25 gate 1 is per-wave rather than per-board: a straggler from an
   EARLIER wave no longer suppresses this payout;
2. **`callNextWave()` succeeding** — shortening a transition. By the time a
   transition exists the gate that opened it has already paid, so this is
   ordinarily a no-op; it is kept because a countdown moved by hand (the
   sandbox, a fixture) has no gate behind it;
3. **`beginWave()`** — the same safety net from the other end, for a cursor that
   was moved without going through a gate;
4. **the last-wave branch in `update()`** — wave 35 has no next wave and no
   transition, so its payout is the whole of closing it.

**The latch is `pendingBounty` itself**, zeroed before the payout, so no two of
them can pay twice even if both fire on the same step, and `waveRewardLatched`
is what stops the reward being OWED twice while a fully deployed wave is still
being fought. Each route has its own test, because paying twice is the whole
risk in a design with four doors. The strongest of them is not a unit test at
all: the campaign run-dry test plays all thirty-five waves with nothing on the
board that can kill, and asserts the cash earned equals the sum of the
thirty-five `waveReward`s exactly.

**Wave 35 has no next wave and no break, so only route 1 can reach it** — which
is correct: the last bounty is paid for actually removing wave 35, descendants
included. On a road with nothing else left on it that is also the step that sets
`victory`; the two conditions are not the same test, though (route 1 asks about
wave 35's bodies, `victory` asks about the whole road), so an earlier wave's
straggler can separate them by however long it lives. A test pins the payout.

It lands as the wave closes and the player is about to read a panel, which is
part of the point — kill bounties arrive one body at a time, at whatever each
body is authored to pay, so the wallet is almost never on a round number at the
moment a decision is being made. (This used to say "damage income arrives in a
dribble". The conclusion held; the mechanism it named was retired on
2026-07-31.)

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

**What one u.l. is worth, and why the constant is 1.04.** The yardstick is
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

## The world has a clock, and it is a VISUAL system with a public state

`js/systems/environment-cycle.js` owns one fact: how far through the day the
board is. `js/systems/environment-lighting.js` turns that into colours. The
renderers read the result. Those are three jobs and they are three files,
because the moment phase arithmetic appears inside `gl-world.js` there are two
answers to "what time is it" and they drift.

**IT IS DECORATION, TODAY.** No combat bonus, no enemy or tower modifier, no
wave or economy effect touches it, and a test asserts that: the same run at
midnight and at noon kills the same enemies for the same money. The state is
public so that a future gameplay system can ask; nothing asks yet.

**TIME COMES FROM THE FIXED STEP.** `EnvironmentCycle.update(dt)` is called from
one line in `update()` in game.js and from nowhere else. That line is already
gated on the run being active, unpaused, not over and not rewinding, and it is
already called more often at 2x and 3x — so pause freezes the sky, speed
accelerates it, and the menu has no clock, and NONE of that is written in the
cycle. There is no `Date.now()` in either file and there must never be one: a
wall clock makes the same run render differently on a slow machine.

**A renderer must never call `update()`.** A sky that ticks in `drawWorld` runs
at frame rate and speeds up on a fast machine.

| | |
|---|---|
| `CYCLE_SECONDS` | 480 simulated seconds — one eight-minute day |
| `START_PHASE` | 0.10, and every run and restart begins there |
| phase 0.00 / 0.25 / 0.50 / 0.75 | sunrise · noon · sunset · midnight |
| day / night | `[0, 0.5)` and `[0.5, 1)` — half-open, so exactly one is true at every phase including both crossings |
| events | `sunrise`, `sunset`, `cycle`, each exactly once per crossing |

**Crossings are WALKED, not compared.** A step can be enormous — a test hands it
three and a half days — and a before/after phase comparison silently keeps the
last crossing and loses the other five. `fireCrossings` counts every half turn
in the interval, in order.

**Nothing interpolates on a band edge.** `visualPhase` ("dawn", "day", "dusk",
"night") names a LOOK and is used by diagnostics; every colour is a continuous
function of the sun's height and of the daylight ramp. One test samples two
thousand four hundred phases and asserts no channel steps.

**The key light swaps bodies where both are dark.** Sun and moon are exact
opposites, so mixing their directions is degenerate. Instead both ramp from zero
with the same `smoothstep` on their own elevation — so at the horizon both carry
zero strength, the key may change body, and ambient and fill carry the twilight
across that moment. A test pins that the key is dark at the swap.

**Modifiers are a seam, and the list is empty.** A future eclipse or storm
provides an id, a priority, a weight, tags and target values; composition is
sorted by priority then by stable id, and each field blends from what the
composition holds toward the target. A modifier CANNOT touch the solar state:
`solarPeriod` is astronomy, `activeEnvironmentTags` is weather, and the composed
lighting is the result. An eclipse may make noon black; it may not make noon
night. Do not add eclipse content until something asks for it.

**Only boards that declare a horizon get any of this.** Six of the eight routes
are decks inside a facility and a sunrise over a reactor hall is a mistake, so
`theme.horizon` opts a board in and everything else keeps the authored rig byte
for byte. `GLRenderer.setLighting` / `resetLighting` are the seam, on exactly
the reasoning `setFog` already used: a preview must never inherit the last run's
midnight.

**The map's night lights are ONE UNIFORM.** `uGlow` already scales every
emissive vertex in the map pass, so the settlement's windows come up at dusk for
the cost of a float. Never rebuild the static mesh to animate a lantern. It is
reset to 0 immediately after, which is also what keeps a tower's own charge and
firing glow entirely its own.

**The HUD is never tinted.** In 3D the world is lit and the interface is drawn
after it; in 2D the tint is applied INSIDE the camera transform and before any
interface. A dark board with a legible interface, never a dark screen.

**Map cards are a fixed late morning** and never the live phase: a player
choosing a route at 3am should not be offered eight thumbnails of a dark forest.

---

## A map may have SOLID scenery, and Ironwood Frontier is the first that does

Every other route in this game is a polyline on an empty floor: the scenery is a
picture, and the same route would score identically on bare ground. Ironwood
Frontier (2026-08-26) is the flagship board and the exception, so anything that
asks a question about a battlefield has to go through `js/systems/map-geometry.js`.

**Three lists on the map, and they answer different questions.**

| list | refuses building | blocks sight | stops bullets |
|---|---|---|---|
| `blockers` | yes | yes | **no** |
| `landmarks` | yes | only if `blocksSight` | **no** |
| `platforms` | no — they are the BEST ground | yes | **no** |

**NOTHING STOPS A BULLET** (2026-08-27, at the owner's instruction). That column
read "yes / only if `blocksSight` / yes" until then. Terrain decides what a
tower may ACQUIRE and nothing after that: once a round is in the air it flies to
what it was aimed at. `js/bullet.js` no longer looks at the map at all, and
`terrainHit` — the game's "where does this shot first meet the map" — is gone
with its two call sites, as is `Effects.terrainImpact`, the mark it fired.

**The pairing this replaces was the right idea and did not hold.** The old rule
was "a round obeys the same rule its shooter's eye does", so that a tower could
never see what it could not shoot — a property two separate mechanisms had to
keep agreeing about. They did not agree: `PierceBullet` has no `owner` field, so
its terrain sweep ran at eye height 0 whatever the tower was standing on, and an
Arcane Sniper on a stump acquired correctly, fired, and had every round killed on
the frame it left the muzzle by the stump under its own feet. Measured on the
first step of a real shot from the tallest stump: **stopped by `stump-p3` at
t = 0.000**. One rule cannot drift from itself, which is the argument for
deleting the collision rather than threading the owner through.

**The consequence, and it is deliberate: a piercing round walks its whole line,
cover included**, so it can reach a body its tower could not have ACQUIRED
through. That is the same family as the Warbringer's blast and the Sniper's B5
ritual, both of which already reach behind cover — a consequence of a shot that
already landed, never a choice of target. Test 15 pins it, and pins that no
tower standing there could have picked that body.

**EVERY SOLID DECLARES A HEIGHT, and a line is only stopped by something
standing higher than the eye that cast it.** `MapGeometry.clears` is the whole
rule. A shape with no declared height compiles to `Infinity`, so the six older
boards behave exactly as they always did: everything stops everything.

A tower's eye height is `groundHeight` — the height of the ground under it, zero
on dirt and the stump's top on a stump — read once at construction and carried on
the tower. `RangeFilter.sightClear` passes it to the injected predicate, and that
is now the only place it is used for sight: a shot does not test terrain at all
(see below), so there is no second rule left to disagree with this one.

**EVERY TOWER TYPE MUST SET `groundHeight`, AND TWO OF THE FIVE DID NOT UNTIL
2026-08-27.** `LongshotTower` and `BeamTower` never declared the field, and both
hand `RangeFilter.canTarget` a freshly built `{x, y}` literal rather than
themselves — so `sightClear` read `towerPos.groundHeight || 0` and put the eye of
an Arcane Sniper or a Siphon **on the floor while the tower stood on a stump**.
That is not a partial failure. A stump is a sight blocker at its own full radius
and the tower is standing INSIDE it, so `segmentHit` returns 0 for every bearing:
measured on the tallest stump, **100% of rays out of a Sniper were blocked**
against 8.3% at the eye it should have had, and the tower could not acquire a
single body anywhere on the board. The player's report was exactly that plus its
visual twin — `silhouetteSpan` on a circle you are inside answers a **180 degree**
span at distance 0, so the blind-spot overlay painted half the range ring red.

Two rules came out of it, and the second is the one that generalises:

- **The object handed to `RangeFilter` IS the tower, not its coordinates.**
  `groundHeight` and `rangePx` are both facts about WHERE a tower stands that its
  stats table cannot know — the first decides what it sees over, the second is
  its reach with the elevation bonus already in it — and a `{x, y}` literal
  silently drops both. `RangeFilter.canTarget` takes `rangePx` off that object
  when it is there and converts `stats.range` when it is not, so a caller passing
  the tower gets the right answer by construction.
- **A test that has only ever asked ONE type has not tested the rule.** Test 21
  pinned the reach bonus and was green for as long as the two towers were broken,
  because it asks a Rifleman. Test 25 walks the LIVE CATALOGUE and asks all five
  for the eye, the reach and one clear line off their own stump.

**Stumps are cover.** They were drawn as a metre of standing timber from the
first day and did not act like any until a playtest noticed. They are in
`sightBlockers` with their own heights, which is what makes elevation worth
something: from the tallest stump you look down over the other five and over the
fallen log; from any of them, over the low shelf; over the boulders, never.

**Elevation also buys reach: `Tower.ELEVATION_RANGE_PER_UL`, +1% per 1.6 u.l.,
a straight line with no cap.** The tallest stump on Ironwood is 24 u.l., which
is +15% — the figure the owner asked for — and the shortest is +6.6%. The rate
is per u.l. and the height arrives in world pixels, so `elevatedRangePx` divides
by `UNIT_LENGTH`: retuning the unit must not retune the bonus. Deliberately
small. A stump is a firing position, not an upgrade.

**Every type's `rangePx` goes through `elevatedRangePx`, and the two adapters
did not until 2026-08-27** — they wrote `ul(this.rangeUl)` in `refreshDerived`
and got no bonus at all. The build preview has always drawn the elevated ring
for them (`previewRangePx` asks the ground, not the type), so hovering a stump
with an Arcane Sniper promised +15% of reach and placing one delivered +0%.
Fixing the eye without fixing this would have swapped one lie for another, which
is why both halves moved in one change.

**A SOLID IS DRAWN FROM THE SHAPE THAT BLOCKS — there is no prop beside it.**
`GLGeometry.solid` takes the compiled shape and builds the rock from it, and
`Maps.drawSolids` is its opposite number on the flat board. The silhouette at
ground level IS the collision shape: a circle's base ring is exactly its radius,
a polygon's bottom face is the authored polygon vertex for vertex, and a
capsule's barrel is exactly its radius — which is why a capsule's `height` must
be twice its radius, since it is a log lying on the ground.

They were authored TWICE until 2026-08-27 — a shape in `blockers` and a scenery
model in `models` with a size of its own — and the two numbers were about a
factor of two apart, so a blocker of radius 48 was drawn 48 wide and every rock
on the board wore an invisible skirt of hitbox. A comment above them claimed
they were "drawn at the position and size the blocker list authors"; a comment
cannot hold two numbers together. Test 22 asserts the second copy stays gone.

A rock may narrow as it RISES — real ones do, and a hitbox is a footprint — so
every jitter in those two functions scales down from 1 and none scales up.
Light tops, dark sides, in the theme's own `rock`/`rockDark`: the first version
lit them from underneath with the machine colours and produced five rocks darker
than the dirt they stood on.

**Decorative foliage is in none of them, and that separation is the design.** The
forest border is dense on purpose; if its canopies decided what could be built or
seen, the board would be unplayable and unpredictable in the same stroke, and a
player cannot read a placement rule off a tree. Gameplay geometry is authored,
listed, and DRAWN TO MATCH — the picture follows the rule, never the reverse.

The settlement's fence is a landmark with `blocksSight: false`, deliberately: it
is mesh and wire, and a rifle shoots through mesh. You cannot build inside it and
you can shoot across it.

**MapGeometry answers exactly two questions** — does this point grown by a
footprint touch this shape, and where does this segment FIRST reach it. Circle,
capsule, polygon. **Tangency counts as contact everywhere**: every comparison is
`<=`, because the alternative is a band one float wide where the answer depends
on rounding. "Where first" is the half that stops a 14 000 u.l./s rail shot at
the near face of a rock instead of behind it.

**Authored in pixels, converted ONCE**, in `Maps.geometryOf`, which compiles and
caches per (map, UNIT_LENGTH). A map with no geometry gets a shared frozen empty
object — which is what makes the other seven boards pay nothing: every consumer
opens with a length test that is false on it.

**Line of sight is INJECTED, never imported.** `RangeFilter.setOcclusion` takes a
predicate when a map loads and `clearOcclusion` takes it away. That module's
value is that it answers "within reach" for anything with an `{x, y}`, in Node,
with no game booted, and a `currentMap` global would end that. Sight is tested
LAST, after range, cone and detection have thrown most candidates away.

Both halves of the game reach it through one hook: the config-driven towers ask
`RangeFilter`, and the Rifleman, the Summoner's creatures and every recruit come
through `Targeting.pick`, which asks `Targeting.hasSightTo`.

**Three intentional exceptions, and they are exceptions on purpose.** The Arcane
Sniper's B5 ritual selects globally and ignores cover, because global means
global. The Warbringer's blast reaches behind cover it could not have ACQUIRED
through — `covers()` is about the zone and `canSee()` is about the line, and they
are two functions so that stays visible. Stump elevation grants nothing: a tower
on a stump has exactly the range, damage and accuracy it has on dirt.

**The difficulty measurement sees the terrain.** Candidate spots inside it are
rejected with the same footprint inflation `whyCannotBuild` uses, and road a
tower cannot SEE does not count as coverage. The six bare boards are byte
identical — 0.826, 0.566, 0.886, 1.061, 0.909, 0.863 — and a test pins that.
Ironwood Frontier measures 0.792, normal, on the curve it is actually walked.

**A tower goes WHERE YOU CLICKED, on a stump exactly as on dirt.** This is a
rule, not an implementation detail: `resolveBuildPoint` moves nothing. It answers
which stump the footprint is standing on, and there are three answers — entirely
on one, crossing a rim, or ordinary ground. Crossing a rim is the only refusal,
because a stump is a raised surface with a hard edge and a footprint overlapping
it has one side on wood and the other on dirt, which the model has no pose for.

It used to SNAP to the stump's centre, and that was wrong twice over: six of the
board's best firing positions had one pose each, and the click landed somewhere
the cursor was not. **There is no "one tower per stump" rule either.** If two
footprints fit side by side on a top without overlapping, they fit — the same
answer open dirt gives. A hard limit would paint half a wide stump red with
visible room on it, which reads as a bug rather than as a rule.

**Stump HEIGHT is declared in the map data and read by both the prop and the
height field.** Two systems inventing the same number is what put towers waist
deep in the wood the first time.

**The red wash means one sentence: if the ghost's footprint touches red, the
tower cannot go there.** `noBuildRings` paints the obstacle ITSELF at its true
size — the road at its own half-width, the blockers and both structures at
theirs, the ground other towers have taken, and each stump rim as a LINE, because
on it and off it are both legal and only crossing is not. Not the obstacle
inflated by the footprint: that would be exact and unreadable. Every rule that is
about SPACE is painted and nothing else is; money and the map edge are not
obstacles, and the ghost still names them. Test 4e samples three thousand spots
and asserts that the wash and `whyCannotBuild` are the same sentence, so the
picture cannot drift from the rule it depicts.

**Placement feedback is drawn from ONE function for both renderers.** The sight
shadows were written, tested in Node, and called only from two flat-only branches
— so on the 3D board, which is every board, they never drew at all. Anything that
paints a placement rule goes in `drawPlacementFeedback`, which is called from the
2D world block and from the 3D overlay pass.

**THE BLIND-SPOT LAYER IS ONE PATH AND ONE FILL, and it is CLIPPED TO THE REACH**
(both 2026-08-27). Two separate rules that were both wrong in the same function:

- **Merged, not stacked.** `drawSightShadows` filled each shape's shadow
  separately at 0.34, so two shadows that overlap — one hidden patch, to a
  player — painted their intersection at `1 − 0.66²` = 0.56 and drew a boundary
  standing for a rule that is not there. It builds every ring into one path and
  fills once under the default nonzero winding, which is `drawNoBuildOverlay`'s
  rule arriving where it always belonged. Measured off the real canvas: a
  single-covered pixel and a double-covered one now read byte-identical
  (216, 88, 88, 98); before, the second read (221, 81, 77, **152**).
- **And the OUTLINE is the union's outline.** One fill fixed the brighter
  overlap and left the other half of the same mistake standing: stroking a
  compound path strokes every subpath, so the boundary of a patch running
  THROUGH another patch was still a visible line across the middle of one
  continuous hidden area — and a player reads a line as a rule. Canvas has no
  union of paths, so it goes the other way round: before stroking patch *i*,
  clip away every other patch, one at a time, with `(a huge rectangle + patch
  j)` under the **even-odd** rule — which is exactly "everywhere except patch
  j", because the rectangle counts once outside it and twice inside — and
  successive `clip()` calls intersect. What survives of patch *i*'s outline is
  precisely the part of it on the union's edge. The rectangle is enormous rather
  than viewport-sized because this runs inside whatever transform the caller is
  in, and it is O(n²) clips in a number that is at most twelve. Measured: a
  point on an internal seam now reads (232, 64, 53, 87), identical to the plain
  fill beside it, while a point on the outer boundary still reads
  (251, 107, 91, 179); before, the seam read (249, 105, 91, **179**) — the
  stroke, in the middle of the patch.
- **Clipped to the reach, whatever shape that is.** Red means *inside my reach
  and I cannot see into it*, so painting it right round the circle on an Arcane
  Sniper covering a 24 degree arc claims blind spots in ground it was never going
  to shoot at — in the one colour on the board that means refused. Measured on a
  20 degree cone: 16 638 shadow pixels inside the wedge and none outside it
  (152 boundary samples, every one within antialiasing distance of the edge and
  not one of them red); unclipped, the same frame put **76 645** outside, up to
  334 px away.

**WHICH SHAPE A REACH IS lives in `towerReach` (js/tower.js) and nowhere else.**
Three types spell it three legitimate ways — the Warbringer keeps
`arcDegrees`/`fullCircle` on itself because it predates the config-driven towers,
the Sniper and the Siphon carry `targetShape`/`coneArcDeg`/`deadzone` in resolved
stats, everything else is a circle — and both `gl-world.js::drawReach` and the
shadow clip read the one answer. Two reconciliations of the same three spellings
is a frame where the wedge DRAWN and the wedge SHADED are different wedges on the
same tower, which is the `slotRect` rule applied to the board instead of the bar.
While a cone is being re-aimed the clip takes the CURSOR's bearing, because that
is the wedge gl-world is drawing at that moment.

The build ghost is deliberately handed a plain circle: a wedge and a cone are
both things a BUILT tower has, and `worldRenderState` draws the ghost as a ring
for every type, so the shadows are clipped to exactly the ring on screen.

**A curved road is one line, and its hard corners are AUTHORED.** `curvedRoad:
true` opts a map in; `Maps.walkablePoints` applies the spline ONCE and everything
downstream — pathing, clearance, the difficulty sampler and both renderers —
reads that. Smoothing only the picture made enemies cut every rounded corner and
walk beside their own road. Curving is opt-in because Rune Circuit is the
reference map whose length fixes the u.l. scale, and curving it turned a hundred
and two tests red at once.

A vertex marked `sharp: true` keeps its angle; every other vertex is rounded.
Classifying corners by turn angle was tried and taken back out: the shape of a
road is a decision, and a threshold put four hard angles back into a track the
owner had already accepted. `Maps.ROAD_CHORD_PX` caps how long a drawn chord may
be, so a long sweep is subdivided as finely as a tight bend.

**A board with no skybox takes its horizon from its own scenery, and the scenery
has to run PAST the camera.** At the flattest pitch and full zoom-out the eye
ends up about nineteen hundred units outside the play rectangle. Ironwood's
forest is ten belts running to three thousand, each taller and tighter packed
than the last, with two lines of hills beyond all of them and ground beyond
those. Fly out as far as the camera allows and you are still in trees.

**THE SKY IS ONLY EVER A SLIVER, and the arithmetic decides it, not the art.**
The field of view is 32 degrees, so the top of the frame sits at
`fov/2 - pitch` above the horizon: at the old 12-degree floor that is four
degrees of sky, and at the default 34-degree pitch the entire frame points
DOWNWARD and no horizon exists at any distance. The floor is 9 degrees now,
which buys seven. Anything that tops out above that fills the band completely —
the hills were 1800 units tall at 2600 units out, which is twenty degrees, and
that is why three rounds of "make the ground bigger" never produced a sky.

So the hills are LOW: they top out around two degrees, just clear of the
treeline, drawn in the theme's own `ridge` haze rather than the near-black
machine colour. A hill drawn in `metalDark` against a light sky is a hole cut in
the world; everything far away goes toward the haze, not away from it.

Two halves to that, and the split matters. Out to 1800 the stems stay MODEST,
because that band is where the eye can actually be and a canopy the size of a
house at fifty units is a black screen — which is exactly what the first attempt
gave. From 2300 out they are enormous, and they can be, because nothing can get
in among them: something far away and big reads as distance and the camera never
gets to check. The hills use the same trick and are simply further.

The periphery is GENERATED from a fixed seed, not hand-placed and never
randomised at load — a forest that reshuffles every run is not a place. And the
2D fallback culls it: that renderer only ever shows the 1280×720 board, so nine
hundred of the thousand props are skipped rather than painted where no camera can
see them.

**It is the default map and Rune Circuit is still the REFERENCE.** Those are
different jobs: the reference fixes the u.l. scale and moving that flag would
silently rescale the campaign. They were the same board for as long as there was
one obvious main route, which made it look like a rule.

**The suites do NOT follow `Maps.DEFAULT_ID`.** `tests/harness.js` pins Rune
Circuit, exactly as `pinWaveBreak` pins the pacing: around a hundred and forty
tests are about towers, not about the default board, and following the default
moved all of them onto a board with rocks and broke thirty-two at once. A test
that wants the shipping default asks for it by name.

---

## Placement rules are derived, not hand-picked

Both build constraints come from geometry, so they stay correct when the map
changes. This was a bug once already — an arbitrary 2.5 m exclusion radius left
a visible 31 px gap between towers and the road — so do not reintroduce magic
numbers here. (**That 31 px is in PRE-2026-07-27 pixels**: `31 / 1.552 = 19.97`,
i.e. ~20 u.l. under the old `UNIT_LENGTH` — what `ul(20)` renders today is
whatever the current constant makes it, and is deliberately not restated here.
The lesson is unchanged; only the figure is dated. See `js/units.js:47-48`.)

**Not on the road:**
`buildClearancePx(type)` = `ul(ROAD_WIDTH_UL / 2 + type.FOOTPRINT_RADIUS_UL)`
= 10.9375 + 11.25 = 22.1875 u.l. for a gunner. That puts it exactly flush against the
road edge, as close as physically possible. `ROAD_WIDTH_UL` also drives how the
road is *drawn*, so the two can never disagree.

**Not across two levels** (2026-08-09, at the owner's request). The 3D board has
real height — a deck top sits at z 9.4, a bay at 5.4, the road ribbon at 7 — and
a footprint that bridges an edge leaves the tower half planted and half hanging
over the drop. There is no pose that reads correctly there: the model has one
ground plane and the tile under it has two. `whyCannotBuild` samples the
footprint's rim and centre through `World3D.isLevelUnder` and refuses the spot
with **"not level here"** if they span more than 0.75.

This is the one placement rule that is NOT pure geometry from the map data — it
asks the renderer, because the renderer is what owns board height. It is guarded
on `World3D.isEnabled()`, so with WebGL unavailable the world is flat, every
spot is level, and the 2D fallback keeps exactly the rules it has always had.
That guard is also why the Node suites are unaffected: the harness has no WebGL
and never reaches the clause.

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

**AND ON A BOARD WITH HEIGHT IN IT THE CLICK TARGET IS A SCREEN-SPACE QUESTION**
(2026-08-27). The rule above is a promise about the player pointing at the thing
they can see, and the 2D→3D move quietly broke it for anything standing on a
stump. `screenToWorld` casts the cursor at the GROUND PLANE, so the world point
under the cursor is where z = 0 sits *below* a raised tower, not where the tower
is drawn. Measured in a browser on Ironwood's tallest stump at the default 34
degree pitch: cursor on the tower's own feet, the pick landed **39 px away —
1.87 footprint radii for an Arcane Sniper, 3.3 for a Rifleman**. Not fiddly:
the target and the tower do not overlap for ANY of the five types, so the panel
could only be opened by clicking bare dirt the right distance below it.

**`pickTower(screenX, screenY)` is the picker the click handler uses**, and
`towerAt(worldX, worldY)` stays as the world-space rule the flat board keeps.
The body is tested where it is DRAWN, as **two shapes**:

| shape | where | radius |
|---|---|---|
| the **dome** | a hemisphere at the tower's feet | the full footprint |
| the **shaft** | a cylinder from the base to the top of the mesh, **and no higher** | `Tower.HIT_SHAFT_FRACTION` of it — 0.5 |

**The shaft was the full footprint for one revision, and a column wider than the
model does not merely forgive — it STEALS.** Two Riflemen one behind the other,
and the near one's column swallowed every click aimed at the far one's body:
the player points straight at a tower they cannot select, which is a worse
failure than the original, where at least nothing appeared to be there.
Reproduced in the real game and measured: the far body sat **8.5 px off** the
near tower's centre line, 78% of the way up its column, against a 9.2 px screen
footprint radius — inside the wide column, outside the 4.6 px shaft. Full width
picks the near tower, half width picks the one being pointed at.

**The dome is NOT reduced**, and the asymmetry is the point: at ground level the
footprint is exactly the promise this game has always made about where a tower
is, and above its base a tower is much narrower than that.

**Half is a baseline, not a measurement.** The honest number is each model's own
plan extent, and it is *not* `bodyExtentRadii` — that measures the whole
silhouette, so a Warbringer's hammer and a Rifleman's rifle would put the column
straight back to the width this exists to cut. A `hitShaftFraction` on the
instance overrides it per body; nothing sets one today.

Two numbers come from the renderer because only it has them —
`World3D.groundHeightAt` for the surface it stood the tower on and
`World3D.towerTopOf` for the height of the mesh it gave it — and the hit test
itself stays in `game.js` with every other hit test. Same division
`isLevelUnder` already has.

**NEAREST TO THE CAMERA WINS**, which is the depth buffer's answer and so the
same one the player's eye gives: footprints cannot overlap in plan, but two
columns certainly overlap on screen at a shallow pitch. A summon still beats a
tower outright, which is the one genuine overlap on the board.

**AND `screenToWorld` RESOLVES ONTO THE SURFACE, NOT THE FLOOR** (2026-08-27).
The click target was only half of it. That function is THE ONE FUNNEL every
world-space input goes through — hover, placement, inspection, aiming — and it
cast the cursor at the ground plane, so hovering a stump to PLACE a tower
answered with the dirt below it. Measured in a browser: pointing at the middle
of the tallest stump answered a point **40.3 units away, on height 0 — outside a
stump of radius 36 entirely**. The ghost, `whyCannotBuild` and `blockReason` all
inherited it, so a tower could not be put where the cursor said it would go.

**The walk is bounded by the terrain's own height, not by the view distance**,
which is what makes it cheap. `OrbitCamera.planeAt(x, y, z)` is the old
`groundAt` with the plane as an argument rather than a literal zero, and two of
them bracket the ray between the top of the height field and its bottom. On
Ironwood's 25-unit stumps at the default pitch that segment is about 37 world
units long — half a dozen samples, then a bisection. Nothing marches to the
horizon. A board whose band is empty skips it entirely, so the six boards with
no terrain are byte-identical by construction, and flat ground on Ironwood
answers the same point it always did, to the float.

Sampling from the TOP means the nearest surface wins, which is what "you cannot
point at ground you cannot see" means: the dirt hidden behind a stump is not a
place the cursor can reach, exactly as it is not a place the player can see.

**AND THE RULES PAINTED ABOUT THE CURSOR MOVED WITH IT.** `projectRing` drew
every ground decal at z = 0 — the road band, the blockers, the ground other
towers have taken, the rim you may not cross — which was invisible while the
cursor was flat too and became a **28.9 px** lie the moment it was not: the
ghost stood on the stump while every rule about it sat below the surface. It
drapes per point now, which is clause 1b's rule for a ground decal. **Two rings
DECLARE their height instead** (`ring.z`): a stump's rim and a tower's
footprint, because both lie exactly ON a discontinuity and sampling a 6-unit
grid along that edge answers two levels one point apart — measured, the tallest
stump's 28-point rim samples 20 points at the floor and 8 on the stump, and one
of the six stumps reads SIX levels because the ramp runs past it.

**`enemyAt` and `recruitAt` still ask the world-space question**, and on the one
board with terrain that is a smaller version of the same defect — a body on the
depot's ramp or the bridge is picked below itself. Left alone rather than swept
in: those are hover readouts rather than the door to a panel, and the fix is the
same shape whenever it is wanted.

`whyCannotBuild(x, y, type)` returns `null` or a short human-readable reason,
shown under the cursor. It is the single source of truth for placement rules —
add new ones there, and never duplicate a rule inline in `onClick`. It takes
the tower *constructor* so every rule is derived from the type being placed
rather than from the gunner specifically.

---

## The economy — fixed bounties per kill

### THE CURRENCY IS CALLED **MANA**, and the code still calls it `cash`

Renamed 2026-08-28, at the owner's instruction: *"j'ai décidé de changer
l'argent pour du mana, donc change s'il te plaît toute instance de argent,
gold, coins en mana"*. It is a rename of **what the player is shown**, and
nothing else moved:

* Every player-facing string says *mana*. Prices read `250 mana`, never `$250`;
  the purse reads `12345 mana`; a refusal reads `not enough mana`; the sell
  button reads `Sell  600 mana`; the armoury reads `600 MANA IN A RUN`; an
  enemy's kill bounty reads `3 mana`; the Siphon's A3/A5 read *charges → mana*
  and *mana → power*.
* **`cash` is still the variable, `gold` is still an identifier.** `cash`,
  `formatCash`, `goldGenerated`, `bonusGold`, `charge_to_gold`, `gold_to_power`,
  `GoldPower`, the sandbox's `lockGold` — all of them stay. They are code and
  save/config keys, and `gold_to_power` in particular is a CONFIG KEY that
  appears in `js/towers/beam.config.js`; renaming those buys nothing a player
  can see and breaks things a player cannot.
* **THE META COINS ARE A DIFFERENT CURRENCY AND KEPT THEIR NAME.** The armoury
  still says `META COINS`, still prices towers in `⬡`, and `needs N more coins`
  is still that sentence. Explicitly excluded by the owner: *"change pas encore
  les metas coins"*. Anything that spends `MetaProgress.coins()` is coins;
  anything that spends `cash` is mana.
* `$` notation survives in THIS document and in code comments as shorthand for
  a mana figure. It is not shorthand anywhere a player can read.

The sweep that proved it: instrument `CanvasRenderingContext2D.fillText`, walk
the menu, the board, the armoury and the index, and grep every string the game
asked the canvas to draw. 679 strings, zero matches for `$`, `gold`, `coins` or
`cash` outside the meta-coin lines above. Do that again rather than grepping the
source if you touch this — the armoury draws letter by letter through
`drawMenuText`, so a source grep and a screen read are different questions.

**Remodelled 2026-07-31.** Ordinary damage never adds cash. Every scheduled
enemy type has an explicit base `bounty` in `Enemy.TYPES`; when the enemy dies,
the removal sweep adds `enemy.bounty()` exactly once and passes the same value
to the `+$` effect. The old `CASH_PER_DAMAGE = 3` constant and both tower/bullet
damage-payment loops are gone.

The point was to break the feedback loop where increasing HP increased income —
**and it was broken for DAMAGE, not for authored health.** Read the two apart or
this section reads as a stronger claim than the code makes. What is gone is
income per point of damage landed, so a shield refresh, a heal, an armor retune
and a longer grind now pay nothing. What REMAINS deliberate is that a wave's
`health` override scales that type's base bounty linearly, through
`Enemy.bountyOf(typeId, healthOverride)` — a stronger scheduled variant is meant
to pay more. Health, shields, armor, speed and abilities determine how hard an
enemy is; `bounty` is a separate authored balance value that the schedule may
scale but nothing else may. The comment above `STARTING_CASH` in `js/game.js`
puts it the same way and is the source to check against.

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
| scheduled kill bounties | $22 987 |
| wave-clear bonuses | $2 594 |
| **authored total** | **$35 686** |

The total excludes Fractal descendants, conditional boss summons and the
Siphon's A3 charge bonus. It was $23 438 / $2 590 / $36 133 until the tier
ladder was scheduled on 2026-08-20, and the fall is the Fractal Slime's
half-price row: **the descendants this table excludes now pay $3 188**, so a
run that clears every cascade is better off, not worse.
It is the single-route schedule total. Twin Confluence mirrors every scheduled
body onto its second route, so it also mirrors kill income. **The two figures
that used to stand here — $47 006 in scheduled kills and $59 707 all in — are
PROVENANCE VOID as of 2026-08-14 and have been removed rather than updated.**
Neither reproduces: $47 006 is not twice any kill total this schedule has ever
had, and $59 707 decomposes as `47 006 + 5 000 + 4 505 + 600 + 2 596`, where
$2 596 is a clear-bounty figure retired on 2026-08-13. **No resolver computes
per-route income** — the mirroring is a spawn-time behaviour, not a schedule
function — so the replacement must be measured through a run and must not be
derived by doubling the single-route total. Until someone does, the mirroring
is the claim and the amount is unknown.
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
`sellValue(tower)` is `Math.ceil((totalSpent - unrefundableSpent) * fraction)`.
The rate lives in game.js as global economy policy; each tower supplies its own
cumulative spend. A 100% refund would make placement reversible and is not the
current design.

**`unrefundableSpent` is mana that is SUNK rather than invested**, subtracted
before the fraction so a tier marked `noRefund` gives back nothing at all while
every other mana on the same tower still gives back half. Exactly one tier uses
it — the Farm's C5 (2026-08-28) — and `totalSpent` stays honest about what was
paid, because that is what the end-of-run screen reports.

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

  **The title screen is THE ASH WASTE: an animated post-apocalyptic
  fantasy-tech world** (2026-08-25, replacing the 2026-08-18 cyan command deck
  entirely at the owner's request — backdrop, props, controls and type). A
  burnt sky over a ruined skyline, a colossal fractured ley-pylon in the left
  bay, a downed sky-relay in the right, rock torn off the ground and left
  floating with shards in orbit, and rifts in the upper air that strike on
  their own clocks. The layout is unchanged: PLAY is still the 480×88 primary
  command, Armoury/Index/Sandbox are still one subordinate rail of 170×58
  controls, and **the four existing rectangle functions remain the single
  source for drawing and hit testing.**

  **THE SCREEN ANIMATES CONTINUOUSLY, AND NOTHING ANIMATED MOVES A HIT
  TARGET.** `draw()` already runs every frame on the menu; the old screen used
  that for one breathing halo and nothing else. Ash falls, embers rise, dust
  sweeps the horizon, the pylon's core gutters, the relay's feed horn sweeps,
  islands bob, rifts crack. Every animated value feeds a colour, an alpha or a
  decoration's own position — none of the four rectangle functions reads the
  clock. **Verified by pixel readback, not by a screenshot glance**, per the
  visual-testing rule above: `draw()` driven at three fixed times off a stubbed
  `performance.now` gives three different core colours, and the hover states
  were diffed at ONE fixed time so the difference could not be the animation.

  **AND SINCE 2026-08-26 EVERY OTHER MENU IS THE SAME THEME** (at the owner's
  instruction: *"arrange the other Menu UI's to match the main menu theme"*).
  The chooser, the index, the armoury, the pause menu and both run-over
  overlays were explicitly deferred when the title screen landed, which left
  the game opening on a burnt sky and cutting to a blue sci-fi grid the moment
  anything was clicked.

  **IT REACHED THREE SCREENS THROUGH TWO FUNCTIONS.** `drawSelectBackdrop` and
  `drawBackButton` are called by the chooser, by `js/codex.js` and by
  `js/store.js` — one backdrop and one control across three screens — so
  re-cutting those two re-cut all three and nothing in the index's or the
  armoury's own layout had to move. **Anything a new screen needs must go
  through the shared pieces for the same reason**: `drawAshInterior`,
  `drawAshFrame`, `drawAshHeading`, `drawAshPlate`, `drawAshControl` and the
  `ASH_EMBER` / `ASH_LEY` / `ASH_BONE` / `ASH_DUST` / `ASH_IRON` palette, all in
  `js/game.js` so the other two files can reach them.

  **AN INTERIOR KEEPS THE THEME'S SURFACE AND DROPS ITS SUBJECT.** The title
  screen is a composition; these screens are dense — six route cards, an enemy
  list with a live 3D viewer, a shop grid — and a scene behind that is noise
  competing with the content for the same pixels. So an interior is the burnt
  sky, the horizon heat, the ground, the ash, the vignette and the corner
  frame, and no pylon, wreck, rift or skyline. **The plate is `menuPlatePath`'s
  own two sheared corners**, so the interiors and the title screen are the same
  piece of hull rather than two designs that resemble each other. Baked through
  the same `drawMenuLayer` machinery, so only the falling ash reads the clock.

  **A HEADING'S SUB-LINE GOES ABOVE ITS TITLE WHEN THE SCREEN HAS TABS**, and
  that is a collision rather than a taste: the index and the armoury put their
  tab row at y = 78, and a centred sub-line landed on it. The rule is an
  argument inside `drawAshHeading` rather than two hand-placed y values, so a
  tab row that moves cannot leave it stranded.

  **THE PANEL INK WAS A PALETTE SWEEP AND NOT A REDESIGN.** The index and the
  armoury carry dozens of colour literals from the old screen; the pass maps
  them (`#cfe3ff` → bone, the `140,179,230` structural blue → ember, `#ffd76e` →
  ember, the "good" green → ley-teal, cool-grey fills → ash-brown at the same
  alphas) and **touches no rectangle, font size or layout number**. `TIER_COLOURS`
  went with it, and the new set is also an ORDER — ley-teal easy, bone normal,
  ember hard — where teal/yellow/pink was not.

  **Ash and rust are the surfaces; ember and bone are the warm accents; and
  ley-teal and ley-violet are the ONLY cool hues, reserved for arcane energy.**
  This replaces the old cyan-and-gold rule rather than extending it. Nothing
  that is not arcane may use the cool pair — the pylon's core reads teal
  against a warm scene precisely because nothing else does.

  **THE CENTRE STAYS QUIET.** The scene's mass is in the outer thirds, and
  `drawMenuAtmosphere` lays a soft dark veil over the middle before any type
  goes down. A burning sky must never cost the title or the controls their
  contrast.

  **Every "random" detail is `menuNoise(i)`, a pure hash of an index** — not a
  generator. The scene keeps hundreds of authored details (skyline shapes,
  wear streaks, ash grains, rubble) without storing one of them between
  frames, and it looks identical on every boot.

  **Type is `MENU_DISPLAY_FONT` (Impact and its fallbacks) and
  `MENU_TECH_FONT` (system monospace), both drawn through `drawMenuText`,
  which does letter tracking by hand.** No webfont: the game runs from a
  double-clicked `file://` page, so a downloaded face would need either a
  server or a megabyte of base64 in the HTML. `ctx.letterSpacing` is not used
  because a browser without it would silently draw every line on the screen
  too tight; `drawMenuText` measures each glyph, lays them out with a gap, and
  honours `ctx.textAlign` itself.

  **Controls are salvaged plates, cut by `menuPlatePath`**: a rectangle with
  the top-left and bottom-right corners sheared off — two cuts, not four,
  because four reads as a rounded sci-fi pill and two reads as hull cut to
  fit. Rivets, mill lines, rust streaks and hazard chevrons are the same on
  all four; the accent `rgb` handed to `drawMenuButton` is the ONLY thing that
  differs, so they read as parts off one wreck. Hover fills the plate's foot
  with ley-light and runs a charge up its left flank; PLAY breathes on its
  own. **`drawMenuButton(r, label, key, rgb, primary)` keeps its signature** —
  the title-screen test counts calls through it.

  **THE TWO STATIC LAYERS ARE BAKED, and that is load-bearing, not a
  polish pass.** The first draft cost **72 ms a frame** against a 2560×1440
  backing store — about 14 fps — and 51 ms of it was two functions that never
  read the clock: the sky's full-width gradient with the sun in it, and the
  atmosphere's calm-centre veil plus two full-screen vignettes and 144
  scanlines. `drawMenuSkyBase` and `drawMenuVeil` are now painted once into
  offscreen canvases at the backing store's own resolution and blitted, which
  brought the frame to **1.8 ms**, both measured through a `getImageData`
  flush because Canvas2D queues its commands and timing `draw()` alone
  measures submission, not rasterisation.

  `menuLayers` is keyed on `canvas.width + "x" + canvas.height`, so a window
  resize or a changed DPR rebuilds it rather than leaving a soft layer behind
  — including the very first frames, where the canvas is still 300×150 because
  the game has not sized it yet. **If anything time-dependent is ever added to
  either baked function it will freeze**; put it in `drawMenuSkyBands` or in
  `drawMenuAtmosphere`'s live tail instead. Baking goes through the same
  function the live path calls, by lending it the module's `ctx`, so one
  drawing of each layer exists and the cached picture cannot drift from the
  uncached one. Where `document.createElement` is missing or gives back
  something without a 2D context — which is exactly the harness — the bake
  fails once, is remembered as `false`, and every frame paints the layer
  directly.

  Both gradient helpers (`menuLinear`, `menuRadial`) fall back to a flat
  colour when handed something that is not a gradient. That is not defensive
  habit: the harness's canvas stub answers unknown methods with a function
  returning `undefined`, so `createLinearGradient(...).addColorStop` would
  throw there and take the whole suite down.
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

  **The card is flipped vertically while the board is the 3D one** (2026-08-25).
  Routes are authored in canvas pixels, where +y is DOWN, and the card paints
  them on a 2D canvas that honours that; the GL board reads the same world y
  under a camera whose screen-up is `0.56*y + 0.829*z`, so +y goes UP. The two
  were exact mirrors in that one axis and identical in the other — measured,
  not eyeballed: world y 160 -> screen y 436 and world y 460 -> 327 on Rune
  Circuit at the opening camera, while world x -60 -> 166 and x 1340 -> 1101.
  **The card is the side that gives**, because no camera above the ground can
  reverse the ground plane's handedness: swinging it to the +y side to put y
  downward puts +x leftward too, trading a vertical mirror for a horizontal
  one. The flip is `translate(0, VIEW_HEIGHT); scale(1, -1)` inside
  `drawMapThumbnail`'s own save/restore, and it is **conditional on
  `World3D.isEnabled()`** — the 2D fallback board is genuinely +y-down, and a
  card flipped against it would be wrong in the other direction. Nothing
  simulated moves; the authored points, `Maps.toWorld` and every analysis
  figure are untouched.

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
  its real sprite, and wave appearances derived from the schedule). Everything on
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

  **The MODEL VIEWER is a modal INSIDE the index, not a value of `screen`**
  (2026-08-13, `js/gl/model-viewer.js` + the viewer block in `js/codex.js`).
  Every value of `screen` is a place with its own Back button, its own key map
  and its own arm in three switch statements; this is one tab of one screen
  showing a body large, turning, and for an enemy walking on the spot. Keeping
  it here is what makes "closing it puts the player back exactly where they
  were" free — the index underneath keeps its scroll, its selection and its
  tab, because it was never left.

  **The consequence is that `Escape` has two jobs on this screen, and the
  return value of `Codex.onKey` is the only thing that separates them.**
  `onKeyDown` in `js/game.js` routes `screen === "index"` to `Codex.onKey`
  *before* its own Escape handling and returns if the key was consumed: Escape
  closes the viewer when one is up and leaves the index when one is not. Same
  rule as the pause menu against the board. A key handler that is written but
  not EXPORTED is exactly as dead as one that was never written. This one sat
  that way in the working tree for a session before anyone noticed — nothing
  throws, the arrows simply do nothing. Same failure as an untagged script
  file, one scope down.

  **Which frames are the walk comes from `World3D.walkBand`, never from
  arithmetic on `frames.length`.** Enemies index frame 0 as a walk frame; blubs
  and summoners reserve it as a rest pose. Any constant would be wrong for one
  of the two families whichever way it was written. The walk RATE is derived
  from the enemy's own speed over its own stride, which is the same quantity
  the board's distance-driven walk uses — so a Sprinter scurries here and a
  Colossus plods, for the same reason and by the same arithmetic.

  **ANY MODULE THAT RENDERS THROUGH `r.program` WITHOUT CALLING
  `GLRenderer.begin` MUST ASSERT THE WHOLE RENDER STATE ITSELF, AND THE FADE IS
  THE ONE EVERYONE FORGETS** (2026-08-14). `uAlpha` is a uniform; it is written
  only by `GLRenderer.setFade`, which outside gl-world's camo pass is called
  only by `begin()`; and **a GL uniform initialises to zero.** So an offscreen
  render on a screen where the board never draws produces a fully transparent
  body — and it does so *silently*, because `readPixels` succeeds and a canvas
  is built. Both `ModelViewer3D` and `TowerPreview3D` shipped this way and both
  now call `setFade(1)` beside their `setGlow`.

  **The failure repairs itself, which is what made it survive review**: once the
  board has drawn once, `begin()` has run and every preview is correct for the
  rest of the session. Only the cold Menu → Index / Menu → Armoury path is
  broken, and it is the first path a player takes.

  **A render that produced no opaque pixel must return FALSE**, or the fallback
  the boolean exists for cannot fire and the screen's own "this is not the mesh"
  line never shows. Both modules scan for one opaque byte and return null when
  there is none. That null is the one null here that is **not** cached — it can
  stop being null, and remembering it would hold a slot on its flat glyph for
  the session over a condition that had already cleared.

  **The viewer fits a body to a bounding CYLINDER about its turn axis, not to
  its screen box at one yaw.** `js/gl/tower-preview.js` may fit to the box
  because it renders one fixed yaw; a body that TURNS and is fitted that way
  grows and shrinks as it goes round — a rifle broadside is about twice the
  silhouette it is end-on — and reads as a zoom rather than a rotation. The fit
  is also taken across the whole walk band rather than at frame 0: a single
  frame of an animated model is a sample, not a measurement, and a viewer
  fitted to the rest pose clips its own stride twice per cycle.
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

**`BUILD_SLOTS` is an array of five tower CONSTRUCTORS**, and it is **DERIVED
from the player's saved loadout** rather than written out as a literal —
`MetaProgress.slotConstructors()` at load, re-read by `rebuildBuildBar()`
whenever the armoury changes it. See "Meta progression" below for the ownership
rules; they are not restated here. An unfilled slot is `null`, so **a fresh
profile arms two of the five**, not all of them. The extension point is the
CATALOGUE in `js/meta.js`: an entry there is a tower the armoury can sell, and
an equipped entry appears in the bar, priced, with an icon, placeable, and
inspectable. Nothing in the bar knows what a gunner is — the gunner is not in
the catalogue at all. To make that work a tower constructor must expose:

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

**On 2026-07-28 every tower that existed reached the shipping game.** There were
four of them then — the Gunner, the Smasher, the Longshot and the Siphon. The
Longshot and the Siphon were finished, priced and fully tested, and were
reachable only through `sandbox.html`, so two of the four were invisible to
anyone actually playing. Wiring them in was a build-bar entry plus
`index.html` loading their systems; no tower code changed. The roster is
neither that size nor that list any more; the current one is at the top of this
file, and the renames are in "Tower names" below.

**The order is not by price.** It is CATALOGUE order in `js/meta.js` —
Warbringer, Arcane Sniper, Siphon, Rifleman, Summoner — which is the historical
build-bar order, preserved because the number keys are muscle memory. Their
build costs run $700, $900, $800, $300, $450, and each comes from that type's own
`COST`; the catalogue's own `price` field is the separate meta-COIN price the
armoury charges, and is not a dollar figure. New types append. Nothing in the
suite hardcodes a slot index any more:
`tests/harness.js`'s `placeSmasher` resolves the Smasher **by constructor**,
through `api.slotOf(sandbox.Smasher)`, precisely so that a shift like the
gunner's deletion fails loudly instead of quietly placing a different tower.

**The fifth slot was held empty for a year of change logs, and the Soldier is
what it was being held for** (2026-07-29, at the owner's request). It existed
so the bar would not change shape the day a fifth type arrived, and it did not.

**A sixth TYPE turned out not to need a sixth SLOT**, which is what the armoury
bought. The Summoner landed on 2026-08-10 as the catalogue's fifth *buildable*
type, and the bar absorbed it without changing shape because the loadout
already decides which five of the owned types are equipped. A sixth SLOT is
still an unmade decision, and still means the bar's geometry (`SLOT_SIZE`,
`BAR_WIDTH`, the `1`–`5` keys, `MetaProgress.SLOT_COUNT`) — but that decision is
about the bar's shape, not about how many towers the game may contain.
`tests/run.js`'s "every built tower type is in the build bar" is where it will
surface.

**`SLOT_SIZE` is 86 and `BAR_Y` is unchanged at 626** (2026-08-13). The slot
grew from 76 because the preview inside it was 22 px — under a twelfth of the
slot's area — and the owner could not tell the towers apart. **The ten pixels
came out of the bar's own bottom margin (18 → 8), not out of the board**, and
that is the pattern to repeat: `BAR_Y` is the ceiling `inspectionLayout` clamps
every panel against, the floor of the playable area, and the subject of
`L.y + L.h <= BAR_Y` assertions in five suites. Growing the bar UPWARD moves all
of that; growing it DOWNWARD into a margin nothing was using moves nothing. The
bar is 50 px wider as a result and now spans **x 405–875** rather than 430–850 —
check that against `speedButtonRect` and the auto-send toggle before widening it
again.

**The preview and the fallback glyph carry the SAME size literal**, in all four
places that draw a tower picture (build bar, store card, armoury loadout row,
codex rail): `size` is the BOX for both `TowerPreview3D.draw` and
`Type.drawIcon`, so they stay matched at whatever the number is. The loadout row
was the odd one out until 2026-08-13 — it drew the flat glyph while the bar it
previews drew the mesh, so the picture a player checked before a run did not
match the bar they then played with.

**A consequence worth knowing: the expensive towers cannot stand where a
gunner can.** Placement clearance is derived from each type's own footprint
(see Placement rules), and the Longshot's and Siphon's are much larger, so
they need more room from the road. Anything that picks a build spot
programmatically — `Maps.bestSpots` rates ground for a *gunner* — must re-check
`whyCannotBuild` for the actual type, or it will silently fall back to placing
a tower of the wrong type. Both `simulate-campaign.js` (now in
`THE_COMPANY/tools/balance/`) and the roster test in `tests/run.js` search for
type-legal ground for exactly this reason.

**Input priority in `onClick`, in order:** speed toggle → auto-send toggle →
wave skip → build bar → the open panel's Sell button → existing tower → empty
ground. Anything drawn *on top of* the map must consume clicks *before* the
map, or the player builds underneath it. Anything that adds a new click target
must slot into that same ordering, not run alongside it.

The three buttons sit at the top only because they are the cheapest tests; none
of these rectangles overlap, so the order among them cannot matter. The wave
skip is additionally gated on `waveSendAvailable()` — `betweenWaves()` alone
until 2026-08-25, which was one term short of what the click handler asked —
so whenever the button is not drawn its rectangle is ordinary map and builds on
as usual. Both wave controls are gated on `waveControlsShown()`, so they
disappear together once the last wave has deployed; the two halves DISAGREE for
the length of wave 35, where the AUTO toggle is still drawn and the Send button
is not.

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

**The bottom-right corner belongs to the speed toggle**, and the rule it
produced outlived the collision that taught it: a fixed DOM overlay put in that
corner covers the button completely, and a canvas button underneath one is not
a button. (The overlay in question was the debug cash panel, moved out of the
corner 2026-07-29 and deleted outright 2026-08-13.)

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
(and cancels aiming).

**Three panel shortcuts, live only while a panel is open** (2026-08-10, at the
owner's request), plus `Delete`/`Backspace`, which have always sold:

| key | does |
|---|---|
| `X` | sell the inspected tower — or destroy the inspected blub, which pays $0 |
| `O` | buy the next tier on **path A** |
| `P` | buy the next tier on **path B** |

Two things make these safe to be bare letters. They are gated on `inspected`,
so outside a panel they are ordinary keys; and **none of them is a camera key** —
panning is WASD and the arrows (`CAMERA_KEY_AXES`), which is why `S` was never
available for Sell and `X` is the key that was. `O` and `P` are adjacent to it
and to each other, in path order.

**`O` and `P` press the BUTTON; they do not reimplement it.** `pressUpgradeButton`
finds the branch's rectangle in `inspectionLayout(...).upgrades` — the flattened
view that already carries each button's branch letter, which every one of the
five tower types sets, adapters included — and calls `runPanelAction` at its
centre. So a shortcut inherits the context object, `refreshBlockReason`, and the
rule that a maxed, locked-out or unaffordable button swallows the press and does
nothing. A shortcut that called `performAction` directly would be a second
implementation of "buy the next tier", free to drift from the mouse.

**The letters are drawn on the buttons** (`drawKeyHint`), dim and against the
right-hand edge, from the layout rather than folded into any tower's label: the
keyboard handler owns the mapping, and five copies of "  (O)" in five
`panelActions` would be five places for it to go stale. Upgrade buttons never
carry an auto pill — only abilities do — so that edge is free.

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

**The payout is a LADDER on waves FINISHED** (2026-08-26). `coinsForRun` is
gone: it took the wave REACHED and returned a bare number, and both halves were
wrong under the ladder. `MetaProgress.repeatableCoins(wavesCompleted, victory)`
is the promise a store screen can make, and `awardRun(run)` is the banking.

| waves finished | 0–9 | 10–14 | 15–19 | 20–24 | 25–29 | 30–34 | cleared |
|---|---|---|---|---|---|---|---|
| coins | 0 | 5 | 10 | 18 | 28 | 40 | **80** |

A clear REPLACES the tier rather than adding to it, so a win is worth exactly
twice dying on wave 34 and never 120. On top of that sit one-time objectives:
reaching waves 11/20/25/30 pays 10/15/20/25 once per save, and a first clear of
each route pays 25, keyed on the route ID. A first full clear on a fresh
profile and a new route is **175**.

**`awardRun` returns sources, not a number** — `{ repeatable, objectives,
bounties, total }`, each source carrying a stable id, a printable label and an
amount, with the total summed FROM them. The result screen prints that list and
never re-derives it. `bounties` is empty and present on purpose: it is the shape
the rotating objectives will land in.

**Six fields persist now**, not three: coins, owned, equipped, runs, the
high-water `bestWave`, and the claimed `milestones` / `routesWon` ledgers. An
old save keeps everything it had and starts every objective unclaimed; nothing
is paid retroactively. It was pure so the armoury could promise a
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

**The starting kit is the Soldier alone** (2026-08-26) — the one catalogue
entry priced at 0 coins, which is what `MetaProgress.reset()` leaves owned, and
it lands in slot 1 with the rest of the bar empty. (The Soldier joined the kit
2026-07-29; the gunner left the catalogue 2026-07-30; the **Smasher left the kit
2026-08-26** and is now a 10-coin purchase **gated on having reached wave 11**.
That gate is enforced in `MetaProgress.buy()`, not in the store's drawing code,
so a hand-edited save hits the same wall — the store asks through `buy(id,
{ dryRun: true })` rather than re-deriving the condition.) Reaching wave 11 for
the first time pays exactly 10 coins, so the run that shows you the Midboss
hands you the answer to it, and **losing to it still counts** — the gate is the
wave reached. The Longshot costs 40 coins, the Siphon 150 and the Summoner 90. That is tuned against the payout and it is the whole
progression loop, measured:

> A first run on a fresh profile **loses on every route** and pays 30–56 coins.
> That buys the Longshot immediately. With the Longshot and its A1, the
> campaign is winnable on every route.

So run one teaches you what you are missing and pays for it. Do not "fix" the
fact that a fresh profile cannot win — that IS the loop.

**The Soldier's B3 changed the PREMISE of that loop, and it was re-measured
rather than assumed.** Until 2026-07-29 the reason a fresh profile could not
win was simple: nothing on the starter bar could see camo, so waves 14, 18 and
28 leaked whatever they liked. The Soldier's B3 *is* camo detection, so for the
first time the starter bar could buy the thing the loop is built on withholding.

**What it costs is no longer close, and the old figures were pegged to a deleted
tower.** This passage read "$15 + 75 + 125 + 200 = **$415** … not far off the
Longshot's $375" until 2026-08-12; the $15 was the gunner's price and the gunner
left the catalogue on 2026-07-30. Live, the Rifleman's detection is **$1 600**
all in (tower 300 + B1 200 + B2 350 + B3 750) against the Arcane Sniper's
**$1 200** (tower 900 + A1 300) — **a third dearer, not a tenth**. The
conclusion did not survive the arithmetic: the starter bar's detection is not
"not far off", it is the expensive way to get it. What the table below shows is
that it moves the wall anyway.

**The flag is spelled differently on each tower, and one grep will mislead you.**
The Rifleman's B3 carries `seesCamo: true`; the Arcane Sniper's A1 carries
`grants: ["camoDetection"]` and has no `seesCamo` key at all. Cite each tower's
own symbol — a reader checking with a single `seesCamo` grep concludes the
Sniper has no detection and "corrects" a sentence that is right.

`tools/measure-starter-kit.js` was written for exactly this question and the
answer is that **the loop survives, for a new reason**. Scripted play, starter
bar only, best build order found by sweeping:

> **THE TABLE BELOW IS PROVENANCE VOID; THE INSTRUMENT IS NOT (restated
> 2026-08-14).** ~~The tool that produced the table below is pegged to the
> deleted gunner.~~ **The flag is on the TABLE, and it was moved there
> deliberately.** `measure-starter-kit.js` has since been repaired, reproduces,
> and carries an acceptance check beside it that was broken on purpose to prove
> it can fail — it is a live instrument that happens to live in another
> repository (see the file map). What is still void is **these four rows**: they
> are the output of the dead gunner-pegged version, they have NOT been
> re-measured, and a migration is not a re-measurement.
>
> What survives is the *finding*: the starter bar loses on every route, and it
> loses for a different reason than it used to. That conclusion is the
> load-bearing part and nothing here contradicts it.
>
> **~~The wave number is genuinely unknown and is being left that way. Three
> sources disagree… Re-measuring is unauthorised new work and sits with vera.~~
> ANSWERED 2026-08-13, and `js/meta.js:283` was right all along.** It was
> authorised, and measured through a repaired `measure-starter-kit.js`: **wave
> 11 on three of six routes before the wave-11 fix, and wave 17–18 on the
> default route after it.** So "somewhere around wave 17" was correct, and what
> had broken it was the 420 HP midboss override deleted in `ac4ca48` — not the
> starter kit and not the meta curve. The dead tool's 11 and the table's w19–20
> were both artefacts.
>
> **THE BANNER STAYS, AND ITS CONDITION HAS BEEN RESTATED BECAUSE THE OLD ONE
> BECAME UNSATISFIABLE.** It used to read *"lift only when the rebuilt tool is
> committed **and** the table has been re-measured through it"*, and
> ~~`tools/measure-starter-kit.js` and `tools/simulate-campaign.js` are
> uncommitted in the simulation division's tree~~. Both halves rotted on
> 2026-08-14: the tools are committed, but **in `THE_COMPANY`, so the first
> condition can never be met in this repository** and read literally the banner
> would be permanent.
>
> **LIFT IT WHEN THE TABLE HAS BEEN RE-MEASURED THROUGH THE RELOCATED TOOL —
> that is the whole condition.** Those numbers want re-running, not
> un-flagging.

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
- **It is still not a win, anywhere.** Buying the $1 300 of upgrades that reach
  B3 costs you the
  board that earns it: the winning lines run 60–70 towers and the lines that
  reach B3 run 12–41. The detection is affordable *in principle* and not *at
  the moment wave 13 lands*, which is a more interesting reason to lose than
  "you cannot buy it at all" and is still a reason to lose. (This bullet read
  "$415" until 2026-08-12, from the same deleted-gunner peg as the sentence
  above.)
- **The trap, if you re-measure**: a greedy builder that spends every dollar the
  moment it has one never accumulates an upgrade's worth, so a "build, then upgrade" script
  measures building and reports it as upgrading. The first draft of that tool
  did precisely this and confidently reported no change. Its policies now have
  an explicit saving phase, and the reading prints how many Soldiers actually
  reached B3 so the claim is checkable. **When** saving starts decides the run:
  from a board of 4 it dies at wave 11, from 10 it reaches 28.

Absolute numbers in that table are not comparable with the browser-console
table in Balance math below — different method, same caveat as always.

**Two ways to make an unplayable bar, and `MetaProgress.unequip` refuses
both:** an empty bar, and a bar whose cheapest tower costs more than
`STARTING_CASH`. The second is the same deadlock with an extra step — stripping
the bar down to the $800 Siphon alone, against a $600 stake, is a board you can
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
never moves; `totalSpent` is everything paid into the tower, and is what
`sellValue()` refunds half of — less `unrefundableSpent`, see the economy
section. Before this, the smasher grew its `cost`, the beam grew a
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
schedule contains **24 141 scheduled / 25 939 effective** HP (per-wave table is a
comment on `WAVES`). Damage dealt plus health leaked to the base must add back
to the *effective* total; that is the quickest whole-run conservation check —
note it is a check on HP, not on cash, **and that since 2026-08-20 it needs the
fourth exception below before it balances at all**. **Damage does not pay at all.**
`CASH_PER_DAMAGE` was $3 per point for one day, from the 2026-07-30 economy
revamp until the 2026-07-31 bounty merge removed it, and there is no
damage-to-cash path in the code now — the removal is recorded in the comment
block above `STARTING_CASH` in `js/game.js`, which ends "anything still reading
a per-damage rate is stale". **Measured at runtime on 2026-08-12, not argued
from the source:** kill cash equals `bounty()` exactly, and is the same figure
for a clean kill and for a 50× overkill, across six types; non-lethal damage
pays $0; and a per-damage rate would have paid about three times what a full
clear actually realises. Anything balanced against the fossil clause is
balanced against a game three times richer than the one that ships. (The
figures here read 6466/8056 until 2026-07-30.
Those were the v0.4.6 schedule's and were left behind when v0.4.7 rewrote it;
24 141/25 939 are what `tests/run.js` asserts and what the harness reports —
23 796/25 898 from the 2026-08-13 curve retune until the tier ladder landed.)

**Effective, not scheduled, and the difference is v0.4.7's.** A shield is
health the player must remove and a Revenant is two bodies, so effective HP is
`count × health × (1 + shieldRatio) × (1 + revives)` per group. `remainingHealth()`
on an Enemy is the same idea at the instance level.

**Conservation has three exceptions now, and all are by design.**

1. Mitigation removes damage before it lands: a hit that armor eats entirely
   takes nothing off the enemy, so against `armored`, `brute` and `midboss` the
   *shots fired* no longer divide evenly into the HP removed. **Cash is not
   part of this any more** — the main loop discards a bullet's returned damage
   and only the later death sweep pays, out of `bounty()`. Cash does still
   equal HP removed against those three, but only because each was authored
   with `bounty` equal to `health`, and nothing enforces that; `Enemy.bountyOf`
   scales bounty with a wave's `health` override, so the ratio survives an
   override but would not survive a retune of either field. Across the whole
   schedule the ratio is 0.8862, and per type — **each type at its own BASE
   health, which is a property of `Enemy.TYPES` and not of the schedule** — it
   runs 0.4545 (`colossus`) to 1.5 (`fast`, `camo_fast`, `camo_heavy`).

   **The denominator is EFFECTIVE HP — what you must actually remove — and
   naming it is load-bearing.** 0.8862 is `22 987 / 25 939`; against *declared*
   health the same figure would be 0.9522, so the two readings are not
   interchangeable. (0.9050 = `23 438 / 25 898` until 2026-08-20. It fell
   because the Fractal Slime pays $0.50 a point where an ordinary body pays $1
   and the ladder converted 1 308 points of schedule into new slime roots — the
   cash comes back from the generations, which no schedule figure counts.) Every per-type number above is bounty over effective HP
   too. Schedule ratios measured 2026-08-20; the per-type range measured across
   all 21 types, and a wave `health` override cannot move it because
   `Enemy.bountyOf` scales bounty in the same proportion.

   **AND THERE IS A SECOND RATIO IN CIRCULATION UNDER THE SAME NAME. IT IS NOT
   THIS ONE.** The balance tooling reports a "money density" of **1.3758**
   (1.3952 until the tier ladder),
   which is *authored purse over effective HP* — it carries the $10 105 of
   purse that no schedule change touches. **The figure this passage means is
   kill bounties over effective HP, 0.8862.** Say which numerator you mean
   wherever either appears.

   The trap this closes, because it has already been reported as a defect
   once: **`shielded` reads 20/12 = 1.6667 against declared health and
   20/36 = 0.5556 against effective**, because a Bulwark carries 24 shield on
   12 health and the shield pays nothing. Under the declared reading it looks
   like the top of the range; under the one this passage actually uses it is
   near the bottom, and 1.6667 is a number no player can ever realise, since
   the 12 cannot be removed without the 36. `revenant` splits the same way
   (1.25 declared, 0.625 effective). Every other type is identical under both,
   which is why the mismatch stayed invisible. **Do not "correct" the range to
   1.6667** — that would contradict the 0.8862 schedule ratio at the head of
   this exception.
2. **A Hive's brood is not in the schedule at all.** Five hatchlings every
   seven seconds is unscheduled effective HP, and it PAYS NOTHING, so a run
   removes more health than the schedule names while earning exactly the
   schedule's worth. There is no closed form for the excess; that is the point
   of the enemy.
3. **Nothing the schedule names is unpaid.** `noBounty` is a per-spawn
   property, not a type one, so every body `WAVES` names pays its `bounty()`
   and only the broods carry it. That is all this exception claims. It does
   NOT mean cash equals HP removed across the schedule — see exception 1; that
   stopped being true on 2026-07-31, when bounties replaced the per-damage
   rate.
4. **A Fractal Slime's cascade is not in the schedule either, and unlike a
   brood it PAYS.** Only the root is authored, so the six scheduled roots
   (1 372 points) become 7 748 points of work and $3 874 of income — and unlike
   the Hive's excess this one HAS a closed form: a tier T root costs
   `root × (T + 1)` and pays `bounty × (T + 1)`, because each generation
   conserves the parent's health and the type prices health at a flat $0.50 a
   point. Whole-run conservation therefore needs `+6 376` on the damage side
   before it balances.

Shots per kill is therefore only a clean diagnostic on undefended, unshielded
bodies that were born of neither a Hive nor a cascade — check it against
scheduled normals.

**The whole-campaign arithmetic does NOT live in this repository.**
`simulate-campaign.js` moved to `THE_COMPANY/tools/balance/` on 2026-08-14 and
takes this tree as `TD_ROOT`. It plays the real schedule through the real loop
under scripted building policies (no towers, stop at N starter towers, greedy
build at `Maps.bestSpots`) — **and running it requires the company tree beside
this one, so a clone of this repository cannot reproduce anything sourced to
it.** That is a cost of the owner's ruling on what belongs in the game repo,
not a defect.

> **STALE as of the v0.4.5 roster change.** Every policy it scripts builds
> gunners, and gunners cannot answer camo (waves 14/18/28) or brutes (now
> waves 20/22/29/31/33) by design, so "greedy honest building wins on every route" is no
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
`update()` from the browser console — what `simulate-campaign.js` does, by hand
(the tool is in `THE_COMPANY/tools/balance/`, not this repo). **The schedule is
measured, not guessed**, on all four routes:

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

That is the economy doing its job rather than luck — **though not by the
mechanism this passage originally gave.** ~~Income is proportional to damage
($1 per point when this was measured, $3 since 2026-07-30).~~ Damage has paid
nothing since the 2026-07-31 bounty merge removed `CASH_PER_DAMAGE`. **The
conclusion survives on the real mechanism:** `Enemy.bountyOf` prices a body at
`type.bounty × health / type.health`, so a wave's `health` override raises its
bounty in the same proportion, and a heavier wave still funds the towers that
answer it. **What a turn-up
on this economy buys is more to DO, not a thinner margin** — which is the right
outcome for the easy tier, and worth knowing before anyone tries to make the
game harder by adding HP alone. If a future ask wants a genuinely harder tier,
the levers that are NOT self-funding are the ones to reach for: arrival
density, counter costs, and base HP.

What DID move sharply is wall-clock time: the same winning run takes ~730 s
instead of ~3100 s, because a board that clears its waves never waits out a
wave's full window — it closes each one on gate 1, five seconds out. `null-meridian` staying unwinnable for this policy is not a v0.4.7
regression — it was already unwinnable for it, and the v0.4.5 table above used
a hand-tuned line this crude policy does not reproduce.

**What is still NOT verified: the five unit suites.** In particular the pinned
opening figures above (1 gunner → 2 killed / 11 leaked / base 66; 2 gunners →
4 / 9 / 83) were not re-measured. A lane offset changes the chord an enemy
walks through a gunner's circle by about 1% — the perpendicular distance moves
by up to **±4 u.l. against the 100 u.l. reference radius** — and a 4 HP normal takes ~3.9 damage
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
  enemy's fate is decided exactly once) and in `beginWave()` (the wave
  announces itself when it OPENS, not on its first body — wave 11's Midboss is
  at `at: 4`, and four seconds of held breath is the wave doing its job rather
  than the banner being late). `Smasher.triggerQuake` tells Effects where
  the landing happened; it does not read the shake or cracks back. The gunner's
  muzzle flash is not in this file at all: it is DERIVED in `Tower.draw` from
  the cooldown, so it needed no state and no hook.
- Particle count is capped (`MAX_PARTICLES = 400`, oldest dropped) so a mass
  kill cannot grow the array without bound.

`sandbox.html` loads it too; `long-range-dps-debug.html` (superseded) does
not, which the guards make harmless.

### A support mark is DECLARED on the type, and drawn twice

An enemy that helps other enemies is the one case where a cosmetic decision has
to be made once and obeyed by two renderers. `support.tether` on the type row is
that decision — `seconds`, `color`, and since 2026-08-18 `arc` and `chips` —
and `Enemy.prototype.supportAllies` records a `{ target, life }` per body helped
while `update()` ages and sweeps them. Both boards read the same fields off the
same row, so **neither renderer holds a palette or a shape of its own**, and a
supporter whose spec asks for no cord throws none (the Vanguard shields itself;
a cord to its own chest would be a line of length zero).

Three rules came out of giving the Shieldbearer one:

- **The shape says what the gesture is.** A straight cord AIMS — right for the
  Healer, which picks the three most wounded. A bow is LOBBED — right for a
  plate of shield, and it is what keeps ten cords out of one body from
  collapsing into a star. `arc` is a fraction of the SPAN, never a fixed
  height: a constant is invisible on a close target and a rainbow on a far one.
- **Bend it in the WORLD, not on the screen.** Every point of the curve is
  projected at its own height above the road, so it drapes over terrain and
  stays right through an orbit. Bent in screen space it is a ribbon lying on
  the camera.
- **A curve is not fourteen `beam` calls.** That helper draws a straight
  segment and costs three strokes; a fourteen-segment bow at ten cords a pulse
  is 420 strokes a frame, against three for one path stroked three times. Its
  0.95 white core is also a claim — a hot line reads as a shot — and a
  supporter is not firing at what it helps.

### A shield is a BUBBLE, and only the 3D board can draw one

Any body with a shield that still holds — `shieldMax > 0 && (shield > 0 ||
shieldFlash > 0)`, which is a Bulwark, a Hive's brood, the Tyrant after its roar
and anything a Shieldbearer has touched — wears a translucent blue shell on the
3D board (2026-08-18, at the owner's request).

**It is GEOMETRY, and that is what makes it possible at all.** Clause 2 of the
model contract already says why: a translucent disc painted over the board is
visible THROUGH the bodies in front of it, which is what "looks like a sticker"
means. A real shell is occluded by whatever stands between it and the camera and
by the body inside it. It is convex and closed, so with back faces culled
exactly one surface covers any pixel — the double-blend that forced camo bodies
into a depth pre-pass cannot happen here, by the shape rather than by a
tolerance. Drawn after the wrecks, sorted far to near, because depth writes are
off while blending and ten shells at once is exactly what a pulse produces.

**Sized from the model, never from a constant.** A bubble has to contain a body,
and the bodies are not one shape: the beacon is 4.05 radii tall inside 1.3 of
plan, the Fractal Slime 2.6 inside 2.0. Both radii are measured off each model's
own REST-frame geometry once and cached per type — which is also why one mesh
serves all six Fractal Slime tiers, since the ratio is a fact about the model and
the instance scale multiplies both.

**"Clear" is a ceiling, not a style.** The first build totalled 0.64 alpha on a
fresh grant and read as a frosted egg — the same failure the 2D board's four
panels exist to avoid. The shipped values total at most 0.42 and sit at 0.22 for
a shield merely holding.

**THE 2D FALLBACK KEEPS ITS PANELS, AND THAT IS NOT AN OVERSIGHT.** That
renderer tried a complete bubble and rejected it: with no depth buffer and no
real alpha, a full ring stack buried the model, especially on a crowd of Swarm
(the note is in `Enemy.prototype.draw`). The two boards say the same thing about
the same state in the language each can afford.

### The Tyrant's aimed shot is a pair of eye beams and a blast

When the wave-35 boss takes its aimed shot it fires from the three
`Tower_Threat_Sensor` lenses across its brow and detonates where the beams land
(2026-08-19, at the owner's instruction: "when the tyrant attacks a tower, he
shoots lasers out of his eyes at that tower and it creates an explosion on
impact"). Two marks, through `Effects.aoeImpact`:

- **`tyrant-gaze`** carries the two endpoints, `liftPx` and `spreadPx`, and has
  a renderer on each board — `js/skins/draw-pack.js` for the flat one,
  `drawTyrantGaze` in `gl-world.js` for the projected one. It needs both for
  `lance-remnant`'s reason: **a beam is a line, and the circular fallback draws
  an expanding ring centred on the middle of the shot**, hundreds of pixels
  wide. It sets `particles: false` — a clean energy line should not throw debris
  out of thin air along its length.
- **`tyrant-blast`** is the explosion, and has NO renderer on purpose. An
  unrecognised kind falls through to the shockwave-and-debris path both boards
  already end in, which is exactly the shape an explosion wants; naming it
  anyway is what lets a skin pack claim it later.

**IT IS OPT-IN ON THE SPEC, NEVER ON THE TYPE ID** — the rule `facesTarget`
already follows. The Tyrant's pool holds an aimed shot AND the leap the roar
unlocks, and only the aimed one has eyes to fire from; a `typeId === "boss"`
check would put beams on the leap too. The four numbers in the `eyeBeam` block
are MEASURED off `enemy-boss`, not chosen: the sensor band sits at model z
0.871..0.942 of a 1.076 u body (**2.62 radii**, 69.2 px at sizeScale 2.4), and
the outer two lenses are at source x ±0.335 (**0.235 radii**, ±6.2 px). Heights
are in RADII like `FLIGHT_LIFT_RADII` so they survive a rescale.

**TWO BEAMS, CONVERGING, AND THE PLAIN BOLT IS SUPPRESSED.** A single line reads
as a gun barrel; a converging pair reads as a thing looking at you. `attackBeam`
— the old cosmetic bolt — leaves the body's CENTRE, so on a body this tall it
read as a shot from the belly; a spec with `eyeBeam` does not set it, rather
than drawing both. Note that `attackBeam` is drawn by the 2D renderer ONLY, so
before this the boss's signature attack was invisible on the 3D board.

**NONE OF IT IS SIMULATION.** `emitEyeBeam` is called from `resolveAttack`,
which is simulation, so the rule at the top of `js/effects.js` applies without
exception: an Effects-free game must play identically. It returns early when
`Effects` is absent, nothing is read back, and `tests/content.test.js` pins the
tower taking the spec's 45 whether or not a mark ever drew.

### A camo body is the body it shadows, drawn through

A camo type has no mesh of its own. `gl-world.js::enemyModel` maps it through
`CAMO_SHADOWS` to the type it shadows and draws THAT model at `CAMO_ALPHA`
(0.62) — `camo_normal` → `normal`, `camo_fast` → `fast`, `camo_heavy` → `slow`
(2026-08-19, at the owner's instruction: "all camo enemies are modelled as their
normal variants but just transparent"). It completes a ruling whose other half
already shipped: "do the camos like the others, just make them a bit translucent
or sum" is what the two-pass draw below exists for.

**THE TRANSLUCENCY WAS NEVER THE MISSING PART — THE BODY WAS.** `camo_fast` and
`camo_heavy` have never had a mesh registered under their own ids, so
`GLModels.has("enemy-camo_fast")` failed and both fell through to the coloured
sphere. The 3D board was fading a ball. Only `camo_normal` had a body at all
(the Cooper, `enemy-camo_normal.js`), and it is no longer the one that walks:
the file, its `<script>` tags and its `export_mesh.py` row are all still there,
because a built body that may be wanted again is not something to delete.

**`camo_heavy` IS A CAMO SLOW, and nothing in `Enemy.TYPES` says so.** That row
still reads "the camo types above shadow a normal and a fast; this one shadows
nothing", which was a claim about its STATS — it is the only camo body with real
defences, 5 flat armor behind 20% defense — and never about which body it walks
in. What ties it to the Slow is the thing its own comment says out loud, "heavy,
so it plods": ×0.65 against the Slow's ×0.7, at sizeScale 1.4. Do not re-derive
this mapping from the stat table; it is a decision, and it is written down here.

**THE TABLE IS EXPLICIT, NOT `id.replace("camo_", "")`.** A prefix strip finds no
`heavy` in the roster, and it would resolve a future `camo_wisp` to whatever its
name happened to spell rather than failing where someone can see it. A type with
no row misses `GLModels.has` and draws the sphere it would have drawn anyway.
`tests/run.js` pins every camo type to a registered, non-camo body.

### A moment on top of a loop: the `overrides` strike seam

A baked frame list is a LOOP — a walk, a bolt cycle — and a loop cannot express
something that happens at a moment. `drawActor(model, x, y, yaw, scale, lift,
frame, overrides, tilt)` takes an optional `{ groupName: mat4 }` applied AFTER
the frame's own pose, in that group's LOCAL space. The Hedger's strike
(2026-08-14) is the enemy-side user; the **Vanguard's shield fragments**
(2026-08-26) are the second; `js/gl/blub-summon.js` is the other.

Four rules, each of which has already cost something:

- **Compose, never replace.** The enemy walk is distance-driven, and the Hedger
  does not stop to swing (`currentSpeedUlps` returns 0 only for `rooted`,
  `stunTimer` and `windUpTimer`). A second animation BAND would stop the legs
  dead in the road; an override leaves the gait running underneath.
- **The pivot is NOT reliably the group's root, and the group and the pivot must
  live in one record.** `export_mesh.py` stores each group's geometry in that
  group's own local space, and `model.top` is max z over the raw `positions`
  array — so **the height of a group whose root is elevated never appears in
  `positions` at all**. The group carrying the model's TALLEST geometry
  therefore has to be rooted at z = 0 or the health bar is painted through the
  machine permanently. On the Hedger's Tripod that group is `mast`: its root is
  at the road and its axle is the drum's centre, 0.8004 u up, supplied by the
  renderer. Other leaf groups are still authored about their own pivots. **Read
  both out of the model and the build script; take neither from a brief, and
  keep them in one object** — a wrong group name fails LOUDLY (nothing draws, a
  warning, a published list) while a wrong pivot fails SILENTLY, swinging the
  machine about the road at the right moment in the right place.
- **A silent pivot needs an authored arrival point.** The art brief states where
  the tool's tip must end up (`0.509 u`, below the drum's centre line), which
  makes the sign check a pivot check as well: a wrong pivot puts the tip
  somewhere else entirely — measured, substituting the group root moves it
  0.468 u = 18.6 board px. Check it through the matrix the renderer actually
  built, never a re-derivation from the same constants.
- **Drive it off a signal that only exists when the thing happened.**
  `attackFlash` is set when an attack RESOLVES. `attackTimer` counts down
  whether or not anything is in reach, so a pose driven off it telegraphs at
  empty road. **Gate on a crossing (`f > 0`), never an equality**: these flash
  fields are decayed by `dt`, are never exactly 1 on a sampled frame, and at a
  fixed 60 Hz `Math.max(0, f - dt*k)` lands on a float residue (3.75e-16) one
  step before it reaches a true 0.
- **A missed group name must be loud.** `drawActor` skips an override whose name
  is not on the model, and the resulting plain walk is pixel-identical to a body
  that never triggered. `World3D.strikeSeam().missingGroupOn` publishes every
  model that was asked and did not carry the group; a test asserts it is empty.

**AND A FIFTH THE SECOND USER ADDED: AN OVERRIDE IS THE ONLY WAY TO PUT A PIECE
OF A MODEL SOMEWHERE THE MODEL IS NOT.** A baked frame is a pose in the model's
own space, so a part baked onto the floor travels with the body. That is
harmless on a walker and wrong on the Vanguard: the owner's brief has its broken
shield fall on the road and lie there for three seconds while the boss keeps
running, and at 175 u.l./s that is 525 u.l. of road. `shardPose` in
`gl-world.js` freezes the drop point in WORLD space at the break
(`Enemy.prototype.breakShield` records position and heading, and that is all it
records) and converts it back into the body's current model space every frame:
`p = R(-yaw) · (W - pos) / (unitsToPx · scale)`. Two consequences worth carrying:

- **`scale` IS NOT THE MODEL-TO-PIXEL FACTOR.** `drawActor` draws at
  `m.unitsToPx * scale`, and `scale` alone is `radiusPx() / 11` — 1.9 on this
  boss against a real factor of 60.4. Fed the wrong one, every fragment lands
  about a pixel from the machine's own feet: it still throws, still settles and
  still comes home, so nothing looks broken, it just looks like nothing
  happened. Found that way on the real board, not by a test.
- **A DRIVEN GROUP'S BAKED POSE SHOULD BE THE IDENTITY.** The shards' frames are
  identity in both bands, so the override's space is the model's own rather than
  the torso's — and a body drawn with no override at all then wears its
  fragments exactly where the artist scattered them, which is the honest
  fallback.

**NOTHING INTEGRATES AND NOTHING ACCUMULATES.** Per-shard variation (spread,
tumble axis, shiver phase) is a hash of the shard's own index, and the phase is
`Enemy.prototype.shieldReformProgress()` — a share of the CURRENT gap, so the
reassembly lands on the frame the shield actually returns whatever the gap
turned out to be. Hand the same body at the same progress twice and it draws the
same thing.

Render state may be parked on a simulation object (the strike latches its
bearing on `enemy._glStrike`) only while it is strictly one-way: `update()` must
never read it. That is the same rule as the rest of this section.

---

## Sound — synthesized, one-way, and switchable off

`SoundSynthesizer` in **`js/game.js`** (2026-08-18) is the game's audio: eight
sounds, all built at run time out of `OscillatorNode`, `GainNode`,
`BiquadFilterNode` and a noise buffer. **There are no audio files and there is
no fetch**, which is what lets it ship under the hard constraint above.

**It is in `game.js` rather than in a `js/audio.js` of its own** because the ask
was explicitly for no new files. If a future session splits it out, the split is
mechanical — the `--- Audio ---` and `--- The audio panel ---` sections and one
`<script>` line before `game.js` in **both** `index.html` and `sandbox.html`,
which must stay identical.

**IT IS PRESENTATION, AND IT OBEYS THE SAME ONE-WAY RULE AS `js/effects.js`.**
The simulation tells it things; nothing simulated ever reads anything back. A
silent game plays identically, every call site is guarded, and every method
no-ops when there is no `AudioContext` — which is not politeness but a
requirement: `tests/harness.js` boots `game.js` in Node, where there is none.
`Math.random()` appears here as well as in `effects.js`, and it is safe for the
same reason: it picks a pitch and dies. Do not derive a gameplay value from one.

The eight, with the events they are hooked to:

| Sound | Fired from | Notes |
|---|---|---|
| `playTowerPlace` | `onClick`, after `addTower` | inharmonic struck-bar partials, ±10% pitch. In the click handler and NOT in `addTower`, because a Summoner's blubs go through `addTower` too and a mechanic placing a body is not the player placing a tower |
| `playEnemyHit(damage)` | `Enemy.prototype.takeDamage` (js/enemy.js) | the ONE line of audio outside `game.js`, and it is there because that function is the single door every damage source comes through — the same property that makes mitigation global. Scales with damage; **silent on a killing blow**, which the death sound covers |
| `playEnemyDeath` | `update()`'s end-of-life sweep, beside `Effects.enemyKilled` | the one place a fate is decided exactly once. Up to **3 stack** within 90 ms, each quieter and detuned; the rest are dropped |
| `playWaveStart` | `beginWave`, beside `Effects.announce` | major triad over three octaves, ~1.4 s. Once per wave, on the frame the wave OPENS — not once per entrance, and not on the first body |
| `playLowHealthAlert` | `updateLowHealthAlert` | four pulses alternating 620/440 Hz. Cannot stack: a call arriving while one is sounding is dropped |
| `playGameOver` | `update()`, on the step `baseHp` reaches 0 | 200 → 80 Hz into a feedback-delay tail |
| `playUIClick` | every button branch in `onClick`, plus `onKeyDown` where it acts | see the note below about the armoury and the index |
| `playTowerFire(kind)` | `update()`, when the bullet array grew during the tower loop | **no line in any of the five tower files.** A projectile appearing in `bullets` is the only definition of "a tower fired" all five types already agree on. Beam and Summoner towers spawn no bullets and are correctly silent — neither of them fires |

**The armoury and the index play a click on EVERY click**, not only on their
buttons. Both are full-screen interfaces whose layouts live in `js/store.js` and
`js/codex.js`; telling a press from a miss in `game.js` would need a second copy
of those layouts, and a second copy of a layout is exactly what this project has
been bitten by. The cost is a click on the background of a dense UI screen.

**Rules that are load-bearing:**

- **The context is created on a USER GESTURE**, from inside `onClick` and
  `onKeyDown` — never from a listener of its own. **The test harness keeps
  exactly one listener per event name**, so a second `window` `keydown` or a
  second canvas `click` handler would silently REPLACE the game's and take the
  whole suite with it. Do not add listeners here; extend the ones that exist.
- **Everything is rate limited, in REAL time rather than game time.** A beam
  tower deals damage every step, so `playEnemyHit` without its 45 ms throttle is
  a buzz rather than a series of impacts; at 3× speed the limits still have to
  mean what they say. Voices are capped at `SOUND_MAX_VOICES = 28`, claimed from
  a self-pruning list rather than by timers.
- **Nothing clips.** Buses run into a compressor and a `tanh` waveshaper BEFORE
  the master fader, so pulling the volume down never fights a limiter and muting
  is genuinely silent. Measured at the master output in a browser: every
  individual sound peaks between 0.14 and 0.56, and the worst case the game can
  produce — a wave swell, the alarm, twelve deaths, twelve hits, eight shots, a
  placement and the loss all in one step — peaks at **0.70**.
- **Every gain change ramps** (30 ms). A fader jumped to zero mid-explosion is a
  click, and "mute in the middle of a sound" is one of the cases this had to get
  right.
- **The low-health warning is a sound AND a light**, and the light is not a
  fallback for the muted. `updateLowHealthAlert` drives both: the klaxon, and a
  pulse behind the base HP readout in `drawStatus`. An alert that exists only as
  a sound is an alert half the audience never receives. The threshold has
  hysteresis (arms at 25% of `BASE_MAX_HP`, disarms above 32%) because base HP
  is a free counter that lifesteal pushes back up, and it repeats on a 9 s timer
  while the danger lasts rather than sounding once and stopping.

**The mixer is drawn on the game canvas**, in the bottom-right chrome row with
the speed and auto-wave buttons — a speaker button that opens a panel with a
mute toggle, master/effects/music faders and Quiet/Normal/Loud presets. `M`
mutes, **on the board only**: `m` already means "change route" on the game-over
overlay, and one letter that did two things depending on whether you had just
lost is a key nobody would trust. Opening the panel does not pause the run.

Two rules it inherits from the rest of the HUD, both of which this project has
paid for before: it is **drawn exactly when it is clickable** (`onClick`'s pause
and loss branches return before the mixer gets a look, so the panel is not drawn
under those overlays), and it is listed in **`overInterfaceChrome`**, or the
build preview offers to put a tower under it.

**Volumes are a PREFERENCE, not run state.** `Sound.reset()` in `restartGame`
cuts the alarm and clears the rate limiters and leaves the faders alone — the
same distinction the camera zoom and the speed toggle already make. Nothing
about audio is saved: `js/meta.js` still holds four fields and no settings, and
that remains deliberate (see the save/load note in "Deliberately out of scope").

---

## The debug cash panel is GONE — the sandbox is the testing surface

`js/debug-cash.js` was deleted on 2026-08-13 at the owner's instruction: *"That
debug cheat panel can go, we have the sandbox which gives everything we need to
test towers and enemies."* It put a floating cash-granting panel on the first
screen a player sees. It is not hidden, not gated behind a flag — the file is
gone and no page loads it.

**Its Max Field command survived and moved to `js/sandbox/sandbox-max-field.js`,
loaded by `sandbox.html` only.** `tests/harness.js` reads its script list out of
`index.html`, so the suite never sees it either.

**The Fractal Slime's tier row is the other thing on that page worth copying.**
Six buttons and a `Ladder`, built from the type's own `fractal` block — so the
ladder they offer is the ladder the game actually has, and a seventh tier
arrives as a seventh button with nothing edited. Which type they spawn is
derived too: the row that carries a `fractal` block, never a typed id. Two rules
came out of building it. **A shortcut must not rewrite the controls it
shortcuts** — these leave the type and tier dropdowns exactly where the operator
left them, because a button that silently changed them would leave the sidebar
disagreeing with the board. And **spacing comes off the bodies, not off a
constant**: a T5 is drawn at 26.4 board px and a T0 at 7.15, so any single gap
is either an overlap or a hike.

Two choices from it worth preserving if you add another testing aid:

- **DOM, not canvas.** No testing code in the render loop, none in the input
  handling, and it is visibly not part of the game.
- **Load it from `sandbox.html`, not `index.html`.** That single fact is what
  keeps it out of the shipping page *and* out of the test harness, and it does
  not depend on anyone remembering a filename convention. (The old `debug-`
  prefix skip at `tests/harness.js:35` still works and is still worth keeping
  for anything that must load from `index.html`.)

The one place the game *did* change for that panel is the `INPUT`/`TEXTAREA`
guard in `onKeyDown`, and that is worth keeping regardless.

---

## Deliberately out of scope right now

The owner has explicitly excluded these. Do not add them unprompted:

- Moving a placed tower (selling exists; drag-to-reposition does not)

He is building the foundation before choosing a direction. Adding content now
is actively unhelpful.

**2026-08-18: "Sound" came off this list.** It was the second entry above until
that date, and it came off the way every other entry has: an explicit,
fully-specified ask — eight named sounds with their frequencies, durations and
envelopes, the Web Audio constraints, the events to hook, and the volume and
mute controls to put on screen. That is the ask this guard was waiting for, and
what was built is what was asked for and nothing beside it. See the Sound
section below.

It does NOT generalise. MUSIC is still out of scope: the mixer has a music bus
and a fader because the ask named "SFX vs Music balance ... for future music
addition", and **nothing feeds that bus**. A soundtrack is a new decision, not
an extension of this one. Neither is a second sound for an event that has one.

**2026-07-29: "Save/load" came off this list.** The owner asked for meta coins
"kept in between run", and a currency that resets on refresh is not a currency.
What was built is the narrowest thing that satisfies that — four fields in
`js/meta.js` (coins, owned, equipped, and a run counter) and nothing else. **Run state is still
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

**Maps (`js/maps.js`).** Seven in the current pool. Five are authored at
`AUTHORED_AT_PX_PER_UL`; Shifting Ley and Twin Confluence are deterministic,
versioned generator outputs with fixed seeds. `rune-circuit` is the reference
and remains the original path.

Every map owns a full non-gameplay environment: a `theme` palette, at least
four large coloured `zones`, nine or more top-down `models`, and its older
`decorations` as fine-detail decals. `Maps.drawEnvironment` paints manufactured
floor panels, deck bays, circuit trunks, reactors, pylons, consoles, tanks,
servers, vents, antennae, holograms, coils and gates under the road. The road
uses the same map theme for its casing, surface, edge glow and segmented energy
guide. All of this is **background only**. None of it is read by `Maps.analyse`,
`buildableSpot`, path construction, placement or targeting. Coordinates pass
through the same authored-pixel scale as the road, so a UNIT_LENGTH retune
cannot pull scenery away from its map.

**`test` is the one board that is not a facility, and the one whose road is not
one width** (2026-08-26). A dead relay station on black dirt, with the forest
grown over it: bare leaning stems banked around the edges, stumps, fallen logs
and bramble in the route's pockets, a buried plant still lit in cold cyan, and a
human camp — barricades, crossed stakes, sandbag courses, a watchtower, a
burnt-out car, wire fence and fire barrels — built along the inside of the last
two legs of the road. A river runs north–south at x 420, crossed once by a
timber bridge on the long straight after the notch and spilling off the near
edge of the board into the void; the road's first point is a stone casket sunk
in the dirt under a lit arch, and its last is a second arch at the base.

**The route is eleven legs and reads as six decisions**, in order: the muster
yard just inside the gate (road at 1.90), the notch on the descent (0.68), the
crossing narrowed onto the bridge (0.90), two switchbacks 190 and 170 units
apart around two islands, the basin around the top corner (2.95) and the wire
gate into the final gauntlet (0.62, and the pace profile at 1.55). 2 451 u.l.,
crossed in 39.8 s, scored 0.78 — as hard as the straight-legged route it
replaced (0.79) and three seconds quicker across, on fourteen per cent more
road.

**Four raised decks are the tower zones**, and they are placed rather than
scattered: the west spur over the entry and the notch, the relay island inside
the first switchback (ninety units from the lane going out and ninety from the
lane coming back — both inside a Rifleman's 100), the knoll between the basin
and the switchback below it, and the camp deck over the wire gate and the run
in. **Nothing stands on any of them**: props are drawn at floor height whatever
they are standing over, so a prop on a deck sinks into it, and a deck is where
the player's guns go. They are marked with energy nodes at the corners instead.

Its theme carries **four keys no other map sets**, all opt-in so the other six
render byte-identically without them:

- `wild: true` turns off the two things that say *manufactured floor* — the
  ruled panel grid under everything and the circuit trunks strung between
  props — in **both** renderers.
- `fog: { color, density, height }` is real distance fog in the 3D board
  (`GLRenderer.setFog`, applied in linear light before the sRGB conversion,
  thinning with an e-fold over `height` so stems stand out of the bank) and a
  painted mist in the 2D pass, so the card and the battlefield agree. Density 0
  — every other map — is the state `GLRenderer.begin` restores, so no board and
  no preview can inherit another's weather.
- `roadGlow: "r,g,b"` lays two emissive lines along the road's kerbs in the 3D
  board (`GLGeometry.road`). It exists because **black asphalt on black dirt has
  no value contrast left to be seen by**: before it, the route on this board was
  invisible from the opening camera and the width profile below could not be
  read at all. A facility with a lit floor grid needs none of it, and undefined
  means the road is the three quads per segment it has always been.
- `accent2` is a real second colour here rather than a near-white highlight.
  The board's argument is two lights and two owners: the camp is an ember
  (barrels, the watchtower lamp, the relay consoles they took over, the arch at
  the base) and the buried facility is cold cyan (cable cores, sensor masts,
  the nodes at the deck corners, the leaks in the ground). Cyan props declare
  `accent` per prop, which costs one draw call per colour and is the only way a
  prop owns its own light.

It also introduces three zone kinds **whose height is 0 and which mean a PATCH,
not a platform**: `dirt` (bare earth), `plate` (cracked floor panel, milled and
seamed) and `flux` (ground the buried plant is leaking into, painted in
`accent2`). Every other zone kind is a raised slab, and `World3D.levelUnder`
refuses a tower that straddles a slab edge — so bare earth built as a slab would
be an invisible no-build ring in open ground. A patch stamps no height and
cannot move a build spot.

**IRONWOOD'S BASE GROUND HAS FOUR VISUAL MATERIAL READS AND ZERO GAMEPLAY
RELIEF** (2026-08-27): loam, grass, worn earth and moss, followed by sparse
blades for silhouette depth. `js/gl/ironwood-ground.js` puts the first four into
ONE continuous vertex-coloured floor at nominal z = 0; it REPLACES the ordinary
ground quad on this map rather than sitting above it. Earth and moss are colour
fields inside those same triangles, never coplanar decals. A deterministic
micro-relief of at most ±0.675 gives the faces light and depth, and each blade
roots on that visual surface. `buildHeightField` reads none of this, so towers,
bodies, shots, collision and placement still see the same flat z = 0 terrain.

**DO NOT STACK FLAT GROUND ISLANDS.** The first pass put every earth polygon at
0.045 and every moss polygon at 0.065. Islands within each family overlapped at
exactly equal depth, producing hard camouflage plates at distance and unstable
texture overlap while zooming. The second pass still failed: one continuous
skin at z = 0.025 remained above the old z = 0 floor. At maximum zoom-out those
depths collapsed to the same depth-buffer value and the whole board z-fought.
There is now exactly ONE floor mesh. New variation must blend into its vertex
colour or deform that surface; it must never add another ground face above or
below it.

The skin is **deterministic and Ironwood-only**. Its coverage reaches the full
outdoor apron so orbiting cannot reveal a decorated rectangle, but fine stains
and tufts concentrate around the playable clearing. The river uses the same
open band as the floor. Tufts additionally reject the route's real width ribbon
and `Maps.keepOutOf(map)`, so no blade grows through the road or an authored
solid. The four rectangular `dirt` zones remain useful authoring envelopes but
are not drawn as rectangles on this map; they bias a noise-torn earth colour
field inside the continuous skin instead. All other maps retain their ordinary
patch rendering.

**KEEP GROUND AND TREES IN DIFFERENT FILES.** The tree family is authored in
`gl-geometry.js` and assigned in `maps.js`; the ground skin owns neither. The
only integration seam is the guarded `IronwoodGround.build` call in
`gl-world.js`, plus the identical classic-script entry in `index.html` and
`sandbox.html`. This separation is what lets either asset family be revised
without overwriting the other.

**IRONWOOD'S ROAD IS AN AUTHORED MODULE BENT ALONG THE REAL ROUTE**
(2026-08-27). `glb/ironwood_forest_path_moduleS.glb` is the source from Claude
Design: four already-bent instances, each with twelve named pieces for the
packed dirt, lighter worn centre, moss shoulders, soil skirts, end caps,
embedded stones and moss clumps. Its 25 688 triangles are four exact instances
of the 6 422-triangle straight module kept beside it as
`ironwood_forest_path_module.glb`. The browser reads neither binary.
`tools/glb_to_path.py` verifies that relationship, unbends the instances and
writes `js/gl/ironwood-path.js`, a classic script that still runs from
`file://`. **There is no vertex clustering, decimation or face removal.**

The module is **not** placed as a chain of rigid rectangles. Every source
vertex carries a cross-road and along-road coordinate; `IronwoodPath.build`
maps the latter to `GamePath.pointAt`/`tangentAt` and the former to the route's
live `widthScaleAt`. The visible dirt therefore follows the same curved centre
line and the same chokepoint/plaza widths that enemies, placement and the height
field use. Its two authored end cross-sections are identical and the importer
keeps their original coordinates exact. Internal caps are omitted, so adjacent
modules share an edge rather than overlapping at nearly equal depth; that is
the z-fighting invariant. Only the first and last caps close the full route.

The GLB is a **thin dirt bed, not a seven-pixel manufactured deck**. Its source
height/width ratio is preserved: at the current scale the requested +25% width
is about 28.44 px and the highest authored vertex is about 2.25 px above the
floor. Separate stones and moss keep their full authored Y. The five continuous
dirt/shoulder bands retain **68%** of their small height variation around the
source bed at Y 0.31: enough real relief to catch light, without the dense
wrinkling reading unlike the rest of the game's broad low-poly planes. This
compression fades smoothly back to 100% across the outer 0.25 source units, so
every vertex shared with the left/right side meshes is untouched. The two side
meshes themselves are never transformed and still descend all the way to the
floor. Never flatten the top, change those sides, replace them with a second
wide slab or stretch them back to `ROAD_LIFT = 7`: each destroys the model
Design supplied.

The +25% is declared as Ironwood's constant route profile (`scale: 1.25`), not
as a transform on the model. Enemy lanes, build clearance, the 2D road, the 3D
module and the height field therefore all use the same wider edge. The depot's
metal ramp ends above this thin dirt bed, so `gl-world.js` derives its toe from
`GLGeometry.depotWalkway` and applies one short 40 u.l. smooth descent to both
the visible road and the height field. `gl-world.js` chooses this builder only
for `ironwood-frontier`; every other map still goes through
`GLGeometry.road` byte-for-byte as before. Rebuild the generated file after
changing the GLB; do not hand-edit it and do not add a runtime GLB loader.

And two scenery kinds: **`conduit`**, a buried cable run laid parallel to the
road, which is the only prop in the game whose job is to point *along*
something; and **`gate`**, an arch that straddles the road. `gate` was already
declared three times by Twin Confluence and had no case in the scenery switch
at all — every one of them rendered as the default block.

**The river (2026-08-26) is the only terrain in the game that is not flat, and
the only geometry anywhere that goes below the floor.** A board declares it as
`river: { x, width, banks, depth, spill, water, foam }` beside its zones; six of
the seven declare none and `map.river` is `null` for them. Four facts about it
are load-bearing:

- **The band is a shared number.** `GLGeometry.river` puts the channel's outer
  lip at `width/2 + banks` either side of `x`, and `World3D.buildMapMesh` opens
  the floor at *exactly* that offset — the floor is one quad and the ground
  patches are painted on it, so both are laid in two pieces around the band.
  Nothing at run time checks the two agree; when they do not the board shows a
  strip of void down the whole run. Pinned by a test.
- **The height field writes the channel FLAT and BEFORE the road.** Every other
  stamp is "highest wins", which is right for a slab on a floor and wrong for a
  hole through one — a bed at −34 loses that contest to bare floor at 0. Writing
  it first leaves the road's own stamp to win across the crossing, so a body on
  the bridge stands on the bridge.
- **"You cannot build in the river" is its own rule**, not a consequence of the
  height field. A channel wide enough to swallow a whole footprint passes the
  straddle test perfectly: the bed is as flat as any deck. `levelUnder` refuses
  the band outright.
- **Scenery is never validated against terrain.** Nine props had to move off the
  strip when the river landed, and a tenth added later would be a dead stem
  growing out of a river bed with every suite green. A test pins the clearance.

The **`spill`** end (`"min"` or `"max"` in y) is where the water leaves the
board and falls into the void. `"min"` is the NEAR edge under the default
camera, which is the only one where the fall is seen face-on rather than from
behind. The fall's length is chosen so it FINISHES inside the frame — a sheet
that leaves the bottom of the screen reads as cut off, not as water going into
nothing.

**A PROP MAY NOT HOLD ANYTHING OVER THE ROUTE — unless it is also TERRAIN, and
exactly one is.** Bodies are drawn standing on the height field, and a prop
contributes nothing to it, so authored geometry that spans the walked line at
body height is geometry the bodies walk through. Ironwood's depot found it: its
loading ramp is hinged at a sill 1.2 hull-units up and drops to the dirt over its
own length, and the route's first point sat under the middle of it.

**`GLGeometry.depotWalkway` is the answer, and it is the only prop surface on any
board that is stamped into `buildHeightField`.** It returns the bay floor and the
ramp bed as two segments in board units, from the SAME table `mobileDepot` builds
the planks from — the stumps' rule, applied to a vehicle: the height a body
stands at and the surface it is drawn beside are one measurement, and two copies
of it is how they drift. The wave then appears in the depot's doorway, walks down
fifty units of ramp and steps off onto the road.

Three consequences, and none of them is optional once the ramp is real:

- **`x` is decided by the ramp**, not by the footprint. The bed has to lie on the
  route's first straight or it hangs over a corner with the road turning out from
  under it, and the hinge has to land on the route's first point or the wave
  appears somewhere other than the door.
- **A ramp is a VEHICLE'S DECK, not ground, and a flier is not standing on it.**
  `f.terrain` is the field a moment before the depot was written into it, and
  `groundHeightAt(x, y, true)` reads it. Without that, a Wisp's cruising height
  stacks on top of fifty units of ramp and it flies out through the depot's roof.
- **You cannot build on it**, and that falls out rather than being ruled:
  `levelUnder` refuses a footprint that straddles a height change, and a slope
  straddles everywhere. It is a small patch either side of the road at the mouth
  of the ramp, and it is the right answer — that is the enemy's loading ramp.

Anything else with a ramp, a raised deck, a gantry or an arch over the road owes
the same three answers, and "it misses the ground" is not one of them.

**A PROP KIND MAY HAVE MORE THAN ONE BODY, and `ironwood` has eight.** The
authored set (Claude Design a7f0c2ee) is a great broadleaf, a conifer, a leaner,
a sapling, a broad crown, a storm-struck survivor, a standing deadwood and a
shattered stump, all built by `ironwoodTree` in gl-geometry.js. Which one stands
at a given position is decided ONCE, in `Maps.assignTrees`, and arrives on the
model as `variant` -- the renderer draws a tree and never chooses one.

**THE MODEL OBJECT HAS TO REACH `GLGeometry.scenery`.** `gl-world` dropped it
for one commit and every tree on the board drew as the default body: the census
said eight and the board showed one, which is indistinguishable from a forest
that was never varied. Any per-prop field -- a platform's authored height, a
tree's variant -- is only real if that eighth argument is passed.

**Two axes decide it, and conflating them is the trap.** STATURE is the authored
`size`, which the rings already use as depth (24 at the clearing, 172 at the
horizon), so short bodies go on small trees and a treeline recedes. CONDITION is
the ground. **`Maps.TREE_EXPOSURE_PX` (150) is the canopy gap and measures
everything; `Maps.TREE_BLIGHT_PX` (260) is how far ruin reaches and measures
only what `Maps.BLIGHT` marks as ruin.** A road is exposure, not ruin -- its
shoulder grows saplings. Merge the two and every clearing wears a collar of dead
trees.

**An even list, never a weighted one.** `Maps.TREE_SETS` cells are walked from a
hashed start, so a repeated entry is a WEIGHT: the first table listed `conifer`
and `great` twice each and came out two thirds those two. And every body has to
appear under a stature the relevant ground actually HAS -- `deadwood` was listed
only under the tall statures, the blighted ground here is the ring authored
small, and it never came up once in nine hundred trees.

**AND NOTHING GROWS THROUGH A BUILDING.** A board's foliage is placed in bulk
-- Ironwood plants nine hundred and seventy-three ironwoods -- and until
2026-08-27 nothing asked whether any of it landed on anything. Thirty-seven
props stood inside the settlement, through its wall or out of the road, which is
the one thing a forest border must never do: a player reads a canopy as "I
cannot build here", and on this board the rule is the landmark and the blockers,
not the leaves.

**`Maps.sceneryOf(map)` IS WHAT BOTH BOARDS DRAW**, and `map.models` is only
what the board ASKED for. The flat pass and the mesh builder call it or they
grow different forests and only one of them is ever checked. It is cached on the
map, it is deterministic -- a tree is pushed straight out of whatever it is
stuck in, then round a fan of eight bearings at growing distance -- and it drops
a prop only when there is nowhere to push it to. On Ironwood: 26 moved, 11
dropped, 37 overlaps to 0. Test 4e pins it, and it pins the BEFORE count too, so
it cannot pass by the pass doing nothing.

Two radii per kind, in maps.js. `Maps.SOLID` is how much room a BUILT thing
takes as a fraction of its `size`; `Maps.CANOPY` is what a GROWN thing needs for
its trunk and inner crown. Both are read off the builders in gl-geometry.js
rather than guessed. A kind in neither table is neither an obstacle nor a
candidate.

**MEASURE IT WITH `Maps.foliageRadiusOf`, INCLUDING IN THE TEST.** A tree with a
chosen body is measured off THAT body -- a sapling needs a fifth of what a great
tree does -- and `CANOPY` is only the fallback for a board with no renderer
loaded. Test 4e read `CANOPY` while the pass read the model, and eleven
correctly-placed saplings came back as failures: a check that disagrees with the
thing it is checking is worse than no check.

**THE RENDERER REGISTERS FOOTPRINTS WITH THE MAP LAYER, not the other way
round.** `Maps.registerFootprint(kind, fn)` at the bottom of gl-geometry.js: a
village six hundred pixels across is mostly grass, and only the file that draws
it knows it is a ring of eight houses rather than a disc. Without a provider the
kind falls back to its `SOLID` circle, which always clears MORE ground -- so a
node test with no renderer loaded is conservative rather than wrong. **Register
it ABOVE the `return`**; below it, it is unreachable and the only symptom is a
forest cleared to a blanket circle.

**A prop may own its own light.** `accent: "r,g,b"` on a
model overrides the board's accent for that prop. It needs a **separate draw
call**, not just a different vertex colour: emission in the shader is
`uGlowTint * vEmi` — one tint per draw — so the whole board pass emits in the
map's accent and a violet-painted prop would still add orange light. Props that
declare `accent` are split out of the board mesh into `accentMeshes`, grouped by
colour, and drawn immediately after it under their own tint. The forest's
`casket` at the route's first point was the first user: its violet is the point
precisely because it is not the camp's ember. Ironwood's floodlights and — since
2026-08-27 — the depot itself are the rest.

**ONE TINT PER DRAW IS A LIMIT INSIDE A PROP TOO, and that is not obvious until
it bites.** Every emissive surface in a prop's mesh emits the colour its group
was drawn under, so **a prop cannot carry two lights**. The depot's source model
has cold white headlights either side of a bay that burns red, and the board may
have one or the other. What it does instead is paint the lens cold and emit at
barely half the bay's rate: the base colour carries it by day and the lens takes
the same bloom as the rest of the machine by night. The alternative is a second
prop at the same position, which is exactly the coupling that model was brought
in to delete.

And the matching trap, paid for twice: **light falling on the ground is painted
in the GROUND's colour and carried entirely by emission.** Painting the stain
discs `accent` and driving them at emission 0.045 still measured (206,117,245) —
a violet surface lit normally *is* bright violet, and what was on the dirt was a
hard-edged magenta ellipse rather than light.

`Maps.routesOf` normalizes every map to route definitions. Authored single-route
maps may keep `points`; generated maps use `routes`. The runtime owns `paths`
plus a primary-route compatibility alias `path`.

### A route may declare what the road DOES along its length (2026-08-26)

A route was a polyline and nothing else, and every property of the road was a
global: one width in `js/game.js`, one speed off the enemy type. A **profile** is
the other half — a property that varies *along* the route, authored per map. Two
exist, deliberately the same shape so that a third is a data change and not a
mechanism:

| key | what it multiplies | authored as |
| --- | --- | --- |
| `width` | `ROAD_WIDTH_UL` | `[{ at, scale }, …]` |
| `pace` | how fast a body walks that stretch | `[{ at, scale }, …]` |

`at` is a **fraction of the route's own length**, not a pixel and not a point
index. Pixels would need re-authoring every time a leg moved; indices could not
put a chokepoint halfway along a straight, which is where chokepoints belong.
The value ramps linearly between anchors and holds outside the ends, so a flat
road is one anchor. Both live on the route (`Maps.profileOf`), because a
two-entrance board could narrow one road and not the other.

**Everything that reads the road reads the profile, and there is one copy of
each rule:**

- **Placement.** `buildClearanceOn(path, progress, type)` is half of however
  wide the road is *here*, plus the tower's footprint — the same derivation
  `buildClearancePx` always made, with the local half-width in place of the
  nominal one. This is why a chokepoint is worth something: the road pulls its
  edge in, the clearance ring comes with it, and a gun stands closer. A plaza
  does the opposite. Neither is a bonus bolted on. It asks
  `maxWidthScaleNear`, not the width at one distance, because the nearest point
  of the centreline is not always where the road is widest.
- **Both renderers.** `GamePath.ribbon` resamples the route with a per-point
  half-width and **both** the 3D mesh and the 2D pass build from it, so a
  chokepoint cannot be in one and not the other. The mitre that offsets a
  polyline is `roadEdges` in `js/path.js` — **one copy**, shared, because two
  would drift and the road's corners would be one shape on the board and
  another on the card. A road that changes width cannot be *stroked*
  (`lineWidth` is one number per path), so the 2D pass fills outlines instead;
  an unprofiled route still takes the original five strokes.
- **The height field.** Stamped off the ribbon, so the surface a body stands on
  is the surface that was built.
- **The column.** `Enemy.positionAt` scales the lane offset by the local width.
  An offset authored against the nominal road would put half a wave in the ditch
  either side of a gate — the queue would not read as squeezing through, it
  would read as walking past.
- **Speed.** `currentSpeedUlps` multiplies by `paceScaleAt` at the end. Same
  shape of fact as a type's `sprint` and the other side of the same seam:
  `sprint` is a property of the TYPE, pace is a property of the ROUTE.
  Multiplied, not substituted, so a tower's slow still applies.
- **The measurement.** `Maps.analyse` offsets its candidate spots by the local
  clearance (at the nominal one, every candidate beside a plaza is refused and
  the widest stretch of the route contributes nothing), and grace comes off the
  crossing clock.

**Profiles are opt-in and absence is exact, not approximate.** A route that
declares neither gets `1` from both lookups through a null check, gets its **own
points array back** from `ribbon` — identity, not a copy — and the same divide
and the same grace it always had. Six of the seven boards declare nothing and are
provably untouched; a test walks all six and pins it.

Two bounds on the numbers, and neither is taste. **Narrow:** a body is 22 px
across and the nominal road is 22.75, so below about 0.55 the road is no longer
a road. **Wide:** clearance grows with the road, so a plaza pushes every tower
off it — the forest's basin at 2.95 costs about 15 u.l. of covered road against
open road, which is the point of a plaza and is meant to be a cost.

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
reference length over this route's **crossing time × base speed**. 1.00 is "as
hard as a plain straight road". The analysis is cached on the map object, not
recomputed.

**Grace is a clock, and length was only ever a proxy for it.** The term exists
because a longer route gives the economy more time before the first leak lands,
so on a route that declares a pace profile the honest measure is how long the
crossing actually takes — `Maps.walkSeconds` integrates the reciprocal of the
pace along the route rather than dividing by a speed the road no longer has. On
the six boards that declare none this is the same division it always was, and
deliberately by the same arithmetic: a board's published score is not the place
to move a last decimal for nothing.

Two findings from that measurement are worth not re-deriving: **turn count
barely matters** (a corner helps the tower on the inside and hurts the one on
the outside, and they cancel), and **length matters least** — every enemy
walks past every tower regardless, so length only changes how long you have
before the first leak. What actually moves the number is whether the road
comes back *near itself*, within the Rifleman's reach of a second lane.

**Enemy types (`Enemy.TYPES`).** Twenty-one, and **all twenty-one are
scheduled** — a passing test in `tests/run.js` pins that.

| id | HP | speed | armor | defense | camo | size | first seen | what it asks of the player |
|---|---|---|---|---|---|---|---|---|
| `normal` | 4 | ×1.0 | — | — | — | 1.0 | 1 | nothing in particular |
| `fast` | 2 | ×1.75 | — | — | — | 1.0 | 3 | coverage early on the road |
| `slow` | 7 | ×0.7 | — | — | — | 1.0 | 5 | sustained damage |
| `swarm` | 1 | ×1.3 | — | — | — | 0.55 | 7 | *rate*, not damage — every body dies to one hit, the question is how many hits per second |
| `armored` | 4 | ×0.95 | — | 20% | — | 1.05 | 9 | a flat 20% tax on every hit; blocks nothing outright |
| `midboss` | 250 | ×0.45 | — | 10% | — | 1.8 | 11 | that a board exists at all by wave 11 |
| `angry` | 14 | ×0.7 | — | — | — | 1.25 | 13 | that you can afford to LOSE towers — it hits them for 20 every 2.5 s |
| `camo_normal` | 4 | ×1.0 | — | — | **yes** | 1.0 | 14 | camo detection (Longshot A1 / beam B1) |
| `flying` | 6 | ×1.2 | — | — | — | 0.85 | 24 | air eligibility — ground-only towers cannot target it |
| `shielded` | 12 **+24 shield** | ×0.9, **×1.8 broken** | — | — | — | 1.15 | 15 | that the damage is READY when the shell pops, not that there is more of it |
| `camo_fast` | 2 | ×1.75 | — | — | **yes** | 1.0 | 18 | the same as camo_normal, under time pressure |
| `brute` | 40 | ×0.55 | **5** | — | — | 1.5 | 20 | a weapon that hits for more than 5 — gunners and the beam do **zero** |
| `revenant` | 16 **×2 lives** | ×0.85, **0 after** | — | — | — | 1.2 | 21 | attention — a parked body keeps eating shots meant for the wave behind it |
| `hive` | 150 | ×0.4 | — | — | — | 1.6 | 26 | speed of kill — it seeds 5 normals every 7 s, and each of THOSE wears a shield equal to its life and pays nothing |
| `boss` | 5000 **+1000 at half** | ×0.3, **×0.405 after** | — | — | — | 2.4 | 35 | DEPTH — it stops, aims, and hits your single best tower for 45 and a stun; after the roar it also leaps 90 u.l. and shockwaves whatever it lands beside |
| `shieldbearer` | 60 | ×0.45 | — | — | — | 1.35 | 27 | that you shoot the SUPPORT — 20 shield to the 10 strongest bodies every 10 s, stacking, and none of it pays. **Never to itself** (2026-08-26). **Hovers** since its body became the beacon — a picture, not a targeting rule, and since the Healer started flying it is the only type left that does |
| `healer` | 200 | ×0.4 | — | — | — | 1.45 | 32 | BURST — 15 HP/s for 4 s to the 3 most wounded every 8 s, and healed HP pays nothing either. **FLIES** since 2026-08-26 — a targeting rule, so wave 32 needs air reach (it hovered, as a picture only, until then) |
| `boss_fast` | 750 | ×3.5 **for the first 400 u.l.**, then ×1.75 | — | — | — | 1.9 | 34 | TEMPO — 100 shield every 7 s that never stacks, on a body that crosses the opening stretch faster than anything else in the game |
| `camo_heavy` | 20 | ×0.65 | **5** | 20% | **yes** | 1.4 | 28 | that SEEING it and KILLING it are two separate purchases |

The four v0.4.9 additions and the Aether Wisp are all scheduled, and all arrive
late — Aether Wisp 24/31/35, Shieldbearer 27/29/30/34, Camo Heavy 28, Healer 32,
Vanguard 34. The index derives those appearances from the schedule itself; the
sandbox's type dropdown still exposes every roster row individually.

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
**eight** mechanic blocks now, each read by one method that asks whether the
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

Tests pin the exact membership of each list — `attack` is `["angry"]`,
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

**A SHIELD ABSORBS THE WHOLE BLOW — NOTHING SPILLS THROUGH** (2026-08-26, the
owner's words: *"for any shielded enemy, the shield should absorb all damage,
for example if a enemy has 100 HP and 10 shield and gets hit for 200 damage, the
shield breaks because it is inferior to 200 but nothing happens to the
health"*). One hit takes at most one layer. This REVERSES the spill rule, and
the argument the spill rule had is still true and is now the point: stopping the
overflow at the shell wastes the rest of a heavy weapon's blow, which is the
same waste target claiming exists to prevent — so **a shield is worth a whole
SHOT rather than its own thickness**, and the answer to a shielded wave is many
cheap hits rather than one expensive one. Three things that did NOT move with
it, each of which a reader will assume did:

- **It is not a damage cap.** A body with no shield takes the full blow, and a
  body whose shield emptied on an earlier hit takes the next one in full. Only
  the hit that BREAKS the shell is absorbed by it.
- **Effective HP is unchanged.** `waveEffectiveHealth` counts a shield as health
  the player must remove and it still must be removed; what changed is how many
  shots that costs, and no authored figure in this document counts shots.
- **`breakShield` still fires on the same frame**, so the Bulwark still doubles
  its speed and the Vanguard still throws its fragments onto the road at the
  moment the pool empties.

**It is a real difficulty change and it is not measured anywhere.** Every
shielded body — the Bulwark, a Hive's brood, anything a Shieldbearer has
touched, the Vanguard on its seven-second cadence — costs at least one more shot
than it did. A retune, if one is wanted, is its own piece of work.

**A SHIELD PAYS NOTHING, EVER** (2026-07-30, the owner's exact words: *"make it
so that shield gives 0 money, ever"*). This is a fifth rule and it changed a
number the rest of this document leaned on for a long time, so it is worth
being precise about what moved:

- **`Enemy.takeDamage` returns only what landed on HEALTH.** The shield still
  soaks in full and still flashes — the *return value* is
  what changed, and that value has always meant "what this blow was worth to
  the player" rather than "what it removed". It is the same door a Hive's
  brood already came through, which is why one edit covered every till at once:
  cash, the beam's lifesteal, its charge meter, and each tower's damage
  counter. **A Siphon chewing a shield now earns no lifesteal and no charges**,
  which follows from the same principle and was not separately asked for.
- **`Enemy.bounty()` is priced off `maxHealth`, not `maxRemainingHealth()`.**
  The two answer different questions and only one of them is about money — a
  Bulwark's 24 points of shield never enter the price. **The figure itself is
  the authored bounty, NOT the health**: `bounty()` is
  `Enemy.bountyOf(typeId, maxHealth)`, which returns
  `type.bounty × health / type.health`, so the death popup over a Bulwark reads
  **20**, not the 12 this bullet claimed and not the 36 the player had to
  remove. The 12 is the LEAK cost — `baseHp -= gone.health` in the same sweep —
  and the two were conflated here while cash was still priced per point of
  damage.
- **`waveEffectiveHealth` did NOT change**, and must not. It measures what the
  player has to REMOVE — which is what the clear bounty is a tenth of — and
  that is still what it measures, now 25 939. It is simply no longer a purse.
  **Confusing the two is now the easiest way to get the economy wrong**; there
  is a warning to that effect on the function itself.
- **What it costs the player is 1 786 HP** — the shields the schedule carries,
  all of them Bulwarks (`shielded` is the only scheduled type with a `shield`
  block) — and under bounties that costs no income whatsoever. A Bulwark pays
  the same `bounty()` whether the player removed 12 or 36, so a shield is a
  cost in TIME and in nothing else. **Measured 2026-08-14** against the real
  `WAVES`, with the same expression `tests/run.js` uses for the shield
  component, and it does **not** move with the wave 12/13/16 retune — no
  retuned group carries a shield. **This bullet used to read "$4 092 off a
  $42 443 purse, a 10% pay cut", and that was damage-era arithmetic end to
  end**: $4 092 was `CASH_PER_DAMAGE` × a then-current shield total, and
  $42 443 was the 2026-07-30 purse against a current authored $35 686. Nobody has asked for the
  schedule or the prices to move in compensation and neither was touched.

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

**`breakShield` ALSO SETS `shieldBroken`, A ONE-WAY FLAG, AND IT IS NOT THE SAME
CLAIM AS `shield <= 0`** (2026-08-20). It is set for every shielded body whose
pool empties — including a Hive's brood, which carries no `onBreak` at all — and
it is never cleared. **The 3D board reads it to swap the Bulwark's mesh** for
`enemy-shielded-broken`, the same way it reads `revived` to swap the Revenant's;
see the model section. Reading the POOL there would be wrong, and the case is
live rather than hypothetical: a Shieldbearer's pulse picks the ten strongest
bodies on the road, a broken Bulwark is exactly the kind of body it picks, and
20 points of granted soak puts `shield` back above zero while nothing puts
`speedScale` back. The halo would return to a machine still running at
90 u.l./s. **Anything that needs to know "has this body stood without its
shield" reads `shieldBroken`; anything that needs to know "is it shielded right
now" reads the pool.** The bubble in `gl-world.js` is the second kind and
deliberately still reads `shieldMax > 0 && (shield > 0 || shieldFlash > 0)`.

**Revives (v0.4.7).** `revive: { times, healFraction, roots }`. `takeDamage`
asks `tryRevive()` before setting `dead`, so a revived enemy never registers as
a kill, never pays a bounty and never fires a death effect. `roots` sets a
permanent `rooted` flag that `currentSpeedUlps()` reads as zero.

**A rooted Revenant cannot soft-lock a run, and the reason is structural rather
than lucky:** it comes back exactly where it fell, and it fell because
something shot it there — so a tower already covers that spot. The only way to
strand one is to sell or lose that tower afterwards, and the answer to that is
to build within reach of it, which the player can always do. Waves are
unaffected either way: a wave still ends on its own `duration` whether or not
the board is clear, so a rooted Revenant delays a wave at most until that
ceiling (it does keep its wave from ever being ELIMINATED, and it keeps the
victory screen away, since victory asks about the whole road). Do not "fix" this with a decay timer; it would delete the
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

- **A SUPPORTER AIMED AT OTHERS NEVER PICKS ITSELF; ONE AIMED AT ITSELF STILL
  DOES** (2026-08-26, at the owner's instruction: *"the shieldbearer should not
  shield himself"*). This bullet said the opposite until then — "it is not 'help
  somebody else', it is 'help the strongest', and a 60 HP Shieldbearer usually
  *is* one of the ten" — and the reversal is the owner's. It mattered more than
  "usually" suggested: `"strongest"` sorts on life still standing, so the
  beacon's own stacking plate made it the strongest body on the board by a
  wider margin after every pulse, compounding, and the type that exists to make
  everything else expensive was quietly the hardest thing to remove.

  **The exclusion is one line in `supportCandidates`, and that is the whole of
  what it can mean.** `pick: "self"` never comes through that function —
  `supportAllies` short-circuits to `[this]` — so the fast boss, whose entire
  mechanic is shielding itself, is untouched. The two are still one block with
  one field between them, not two mechanisms.
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
- **A pulse may author a TETHER, and the cord is the spec's, not the
  mechanic's** (2026-08-18). `tether: { seconds, color }` makes the pulse throw
  a cyan cord from the supporter to each body it helped;
  `Enemy.prototype.supportAllies` records them on `supportLinks` and both boards
  draw what is there. The Shieldbearer authors none and keeps its expanding
  ring, which is the right shape for its own claim: a ring says "a lot of bodies
  at once", a cord says **which three**, and naming three of a wave of twenty is
  the whole reason the Healer's cue is different. The cord is the DELIVERY and
  the target's green ring is the effect, so it runs 1.4 s against a heal of 4 —
  nine cords standing across the board would stop naming anything.
- **`supportLinks` is the only place `js/enemy.js` holds a reference to another
  enemy**, and the sweep in `update()` is what keeps that safe: a cord is
  dropped the instant its target is `dead` or `leaked`, and always inside its
  own 1.4 s. It holds the enemy rather than a `{x, y}` — which is what
  `attackBeam` does — because a tower cannot move and a healed body is still
  walking.

**HOVERING IS A HEIGHT. FLYING IS A TARGETING RULE. NEVER CONFLATE THEM**
(2026-08-18). A type may carry `hover: { liftRadii, animHz }`, which lifts its
body off the road and hands its animation a clock. It is **cosmetic in full**;
`isFlying` is the other thing entirely — `Targeting.sees` and `RangeFilter` both
fail closed on it, so a tower without air reach cannot touch a flier — and a
body that quietly picked up that immunity would be a defect **nothing on screen
would show**.

**THE DISTINCTION STANDS. THE HEALER IS NO LONGER AN EXAMPLE OF IT** (2026-08-26,
at the owner's instruction: *"make the healer a flying unit"*). This block used
to name the Healer as the hovering case and argue that every tower could still
shoot it. That ruling is REVERSED: the Healer is `isFlying`, wave 32 is now
answerable only with air reach, and **its `hover` block is deleted** rather than
left beside the flag that overrides it — every reader takes the flying branch
first, so it would have been a declaration nothing reads. **The Shieldbearer is
the surviving hovering type**, and it is the one to read for what `hover` means.

Three readers, one number:

- `Enemy.prototype.visualBodyLift` turns `liftRadii` into pixels and is the only
  place any of the three heights becomes a number. `GROUND_LIFT_RADII` (0.48) is
  a walker lifted off its own shadow, `hover.liftRadii` (0.55 on the
  Shieldbearer) is a body drifting above the road, `FLIGHT_LIFT_RADII` (3.45) is
  air.
- `gl-world.js::bodyLift` is the 3D half — renamed from `flightLift` when it
  stopped being only about flight — and the health bar, the hover card's anchor,
  the falling wreck and a shot leading its target all read it through
  `enemyCrown`. Adding a hovering type needs **no edit to any of them**.
- `gl-world.js::clockRate` decides which bodies escape the distance rule, and
  `tools/check-gait-slip.js`'s `HOVERS` table must be kept in step with it by
  hand. See the rig section for what happens when it is not.

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

**This does not weaken the camo waves, and not by luck.** **A camo wave never
mixes camo with visible bodies** — that is the rule, and it is narrower than
"a wave names exactly one type", which is false (wave 16 has three groups and
wave 28 has two, `camo_normal` ×12 plus `camo_heavy` ×6). So during waves 14,
18 and 28 there is nothing visible on the board for a detectionless smasher to
swing at, and `sightedIn` keeps its hammer still. The
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

**But `radiusPx()` is the GAMEPLAY extent, and on the 3D board it is NOT the
drawn body.** It is the hit test, the frost and camo rings (`radiusPx() + 4`),
the hover ring (`radiusPx() + 9`), the health-bar fallback — and, on the 2D
renderer, the body itself, which really is drawn `2 × radiusPx()` across
(`ctx.ellipse(x, bodyY, radius, radius * 0.96)`). On the shipping GL renderer
the body is a mesh: `drawActor` is handed `radiusPx() / 11` as its scale, so
`radiusPx()` still *scales* the mesh, but the mesh's drawn extent is `its own
extent in Blender units × unitsToPx × radiusPx() / 11`. **How much of its own
circle a body fills is therefore authored into the model, not derived from the
type** — measured across the shipped roster on 2026-08-13 it runs from 0.72
(`enemy-normal` at rest, 0.86 at the stride extremes) to 1.57 (`enemy-brute`)
and 2.14 (`enemy-hive`).

Two ways this has already been got wrong, both on 2026-08-13, and both worth the
warning:

- **Do not quote it as a constant.** "An enemy is 22 px across" is the `normal`
  value and every other type scales it; a per-type quantity written as a
  constant is half of how nineteen design cards came to be sized against a body
  twice the real width. Write `2 × radiusPx()`.
- **Do not check anything against the bare circle.** A check built against
  `radiusPx()` rather than the ring radii reported four of five meshed enemies
  as overhanging their own rings; with the pads named, only two are. The
  bare-circle reading produces a very convincing false alarm.

**A type may own MORE THAN ONE mesh** (2026-08-16). `enemyModel` resolves
`enemy-<typeId>` and then consults `ENEMY_VARIANT`, a table in `gl-world.js`
keyed by type id, whose value is a map of **state flag → model name**, first
match wins. **There are three entries** (2026-08-26): the Revenant draws
`enemy-revenant` until it dies and `enemy-revenant-undead` after it gets back
up; the **Bulwark** draws `enemy-shielded` until its shield empties and
`enemy-shielded-broken` afterwards; and the **Vanguard** draws `enemy-boss_fast`
while its shield holds and `enemy-boss_fast-shattered` while it is gone. Three
rules, and each one is load-bearing:

- **THE PREDICATE IS A FACT ABOUT THIS BODY THAT SOMETHING OWNS AND KEEPS —
  never a live reading of the mechanic it came from, and not necessarily
  one-way.** The one-way part was the rule until 2026-08-26 and it was a rule
  about the two types that had variants, not about variants. The Revenant's
  is `revived`, never `rooted` and never `revivesLeft`: all three move at the
  same instant on today's only revive spec and none of them mean the same thing.
  `rooted` is a movement fact any future snare could set on any type;
  `revivesLeft` counts *down*, so a two-life type would swap on its first death
  and have nothing left to say on its second. `revived` means "this body has
  been dead once", and `Enemy.prototype.tryRevive` is its only writer.
  The Bulwark's is `shieldBroken`, never `shield <= 0`, and that one has a live
  counterexample rather than a hypothetical: a Shieldbearer refills a broken
  Bulwark's pool, so the pool goes positive again while the doubled speed the
  break bought never comes back. See the shield section for the full argument;
  `Enemy.prototype.breakShield` is its only writer.

  **THE VANGUARD'S IS `shieldOut`, AND IT IS NEITHER OF THE OTHER TWO — WHICH IS
  WHY THE HEADLINE OF THIS BULLET CHANGED.** That boss shields ITSELF every
  seven seconds (`support.pick === "self"`), so its shield is a rhythm and not
  an event: it goes, it is gone for the rest of that window, and it comes back.
  Both of the readings that work elsewhere are wrong here, in opposite
  directions. `shieldBroken` is permanent and would leave the fast boss in its
  wreckage for the rest of the run. `shield <= 0` is true of a body that has
  **never been shielded at all** — the Vanguard spawns with `shieldMax` 0 and
  waits out its first seven seconds — and would walk the boss onto the board
  already in pieces. `shieldOut` means "the pool has emptied and nothing has
  refilled it yet": set in `breakShield`, cleared in `grantShield` by ANY grant,
  so a Shieldbearer's plate closes a Vanguard's gap exactly as its own pulse
  does. `shieldBroken` deliberately does NOT follow it back, and the Bulwark
  still keys on that one.

  The generalisation, since three types have now needed three different
  answers: **ask what the second mesh DEPICTS, and pick the flag that is true
  exactly while that is true.** Wreckage that is repaired is not the same claim
  as wreckage that is permanent, and neither is the same claim as an empty
  pool.
- **A missing variant falls back to the BASE mesh, not to the sphere.** Losing a
  `<script>` tag must not turn a Revenant into a coloured ball at the one moment
  the player is looking at it. `tools/check-model-tags.js` is what actually
  catches the missing tag; the fallback only chooses which way the failure is
  quiet.
- **Every mesh of one type is authored at ONE scale and graded at that type's
  `sizeScale`.** The variants are imported with a shared `--span` so the swap
  changes the creature and not its size, and `check-gait-slip.js` /
  `check-model-top.js` both map `enemy-<type>-<variant>` back to `<type>` — a
  variant graded at the default 1 under-reports its slip and its crown margin by
  the whole of the type's scale.

**AND ANYTHING THAT CACHES GEOMETRY PER TYPE MUST CACHE IT PER MODEL INSTEAD**
(2026-08-20). `gl-world.js` builds a shield bubble sized off the body's own rest
extent and keeps it in `typePrims`. That cache was keyed on the type id plus a
hand-written `:revived` suffix — correct while one type had a second mesh, and a
stale-cache bug the moment a second one arrived. It is now keyed on the name
`enemyModel` returns, which is the thing it actually measured, so a new
`ENEMY_VARIANT` row needs no matching edit there. **The Bulwark is what would
have sprung it:** the bubble draws while `shieldFlash` decays and `shieldBroken`
is already set by then, so the first Bulwark bubble a board ever drew could be
one measured off the stripped body — no halo, a much smaller plan extent — and
every Bulwark for the rest of the session would have worn it.

**AND UNTIL 2026-08-26 THAT CACHE HAD NEVER MEASURED ANYTHING, ON ANY BODY.**
`bodyExtentRadii` reads `m.positions` off the object `GLModels.get()` returns,
and **that field did not exist**: `expand` built the array, filed it under
`expanded` and nulled `raw`. The guard `if (!m.positions) return null` therefore
fired on every model in the library, and every shield bubble in the game was
drawn at the stand-in size meant for bodies with **no mesh at all** — 1.0 plan
radii and 2.2 top. Nothing threw, nothing was reported, and a sphere-sized
bubble around a Bulwark looked deliberate. One line in `gl-models.js`
(`model.positions = arrays.positions`) fixes it, and the bubbles now hug the
hulls they are measured off.

**THE RULE THIS IS AN INSTANCE OF, and it is the same one `bands` already
records:** *any new field on the model contract has to be added where it is
built AND where it is published, or it is decoration.* `bands` shipped on eight
models while `register` dropped it; `positions` existed on every model while
`get()` never exposed it. Both were found by the first caller that had no
fallback — which is also the argument for **not** writing a fallback into a
reader that is measuring something real.

**Geometry imported through `--rig humanoid` is stored in WORLD space, with the
joint written into the frame matrix** (`T(J).R.T(-J)`), rather than offset to
each group's pivot. `GLModels.expand` computes `model.top` — the height the
health bar is drawn at — from the raw stored positions with *no* group matrix
applied, so an offset body reports a top partway up itself. Run
`node tools/check-model-top.js`: five shipped bodies are BURIED, `enemy-normal`
by 9.7 px into its own chest. Both Revenants read `ok`. The five are left alone
deliberately — repairing them moves a shipped health bar and is its own change,
not a side effect of adding an enemy.

**A GAIT IS FOUR PLANT WINDOWS AND NOTHING ELSE** (2026-08-17). `--rig
quadruped` runs the Fast type on all four legs, and it shares `leg_series` with
`--rig humanoid` rather than owning a second solver: a walk and a gallop differ
in WHICH frames each foot is down and in nothing else about a leg. The biped
holds each boot down for half the cycle precisely so no frame has both feet in
the air; **a run is the gait that gives that up.** At `RUN_DUTY = 0.25` the four
windows (16 frames: 0–3, 2–5, 7–10, 9–12) leave frame 6 and frames 13–15 with
nothing on the road at all — the gathered suspension after the hinds push off
and the extended one after the fores. `check-gait-slip.js` reads **A = 0.000 px
on all four paws** at 25 % duty each, so the solver's guarantee does not weaken
with more legs or shorter contacts. A rig declares its own legs and a declared
leg that does not arrive is an **error**, not a limp — a source that spells one
differently would otherwise weld it into the torso and ship a body galloping on
three, which survives a preview and is found on the board.

Three consequences, each of which was got wrong first:

- **A short contact shortens the leg's arc, and the reach is bought back in the
  air.** The plant sweep is not a style choice; it is exactly the ground covered
  while that paw is down. Quartering the contact quarters the arc, so a gallop
  animated by the duty alone swings its legs *less* than the walk it replaced.
  `leg_series(swing_reach=)` adds a forward overshoot at mid-swing, zero at both
  ends, spent entirely on frames no instrument grades.
- **The body's motion is DERIVED from the windows, never run off a sine of its
  own.** `airborne_lift` eases a rise over each run of unsupported frames and
  `fore_centre` phases the pitch off the forehand's landing. Retune a phase and
  the body follows; a hand-phased sine keeps its old timing and puts the animal
  at the top of its arc with a paw planted on the road.
- **A leg follows the body's rise, and only while it is in the air.** A planted
  paw belongs to the road and must not climb with the chest, or the solve is
  undone. The body's PITCH is deliberately not followed: it moves each joint by
  up to 0.04 u (hidden — a thigh joint sits inside its cowl), and following it
  drags the paw that has just left the road back into it. Measured: **2.946 px**
  of gait error on two legs with the pitch followed, 0.000 without.

**A SPRING IS THE OTHER HALF OF THE CURVE `airborne_lift` LEAVES AT ZERO**
(2026-08-20). `--rig bulwark_overdrive` runs the Bulwark after its shield goes,
and the owner asked for it to move "like a kangaroo, but one leg at a time" —
so the two legs hop in turn at `BOUND_DUTY = 0.25`, which puts **half the cycle
in the air**, more than the hound's gallop spends. That much suspension exposes
what `airborne_lift` does not answer: it eases a rise over every unsupported run
and returns **0 for every supported frame**, and a body riding zeros through its
own landing is being *carried* over the road rather than pushing off it.
`bulwark_body_rise` eases the mirror of the same curve DOWN over each stance —
zero at both ends, deepest at mid-plant — so the body compresses onto the leg
that caught it and extends off it. One continuous curve, both halves read off
the same windows, every inflection in it a footfall. Three things follow:

- **The PLANTED leg must not follow the crouch, and the SWINGING one must.**
  `plant_leg` sets each leg's own lowest point on the road independently of the
  body, so a hip that sinks while the sole stays put IS the leg compressing —
  which is the thing being drawn. That is the same rule the gallop states about
  the rise, and it is what sizes the crouch: the airborne boot goes down with
  the body and still has to clear `check-gait-slip.js`'s 0.015 plant band. The
  two are naturally in opposition — the deepest crouch of one leg's stance falls
  at the peak of the other's swing — and the instrument is what proves it stayed
  that way. **A = 0.000 px.**
- **The pitch is the curve's own vertical VELOCITY**, normalised by its own
  peak: nose up climbing, nose down falling. `fore_centre` cannot serve a biped
  with two suspensions per cycle, and a cosine phased off frame 0 would keep its
  old timing the moment a duty moved.
- **`swing_reach` IS FOR A JOINTED LEG AND THESE HAVE ONE HINGE.** `BOUND_REACH`
  was 0.95 — near the hound's 0.85 — and it shipped a straight-legged high kick
  twice a cycle, because `humanoid_pivot_of` gives a leg a hip and nothing at the
  knee, so an overshoot cannot fold a limb, only swing the whole rigid thing
  further. On a body whose foot is a third of its own height that is very
  visible. It is 0.35, and the spring is bought in the body instead. **Caught on
  the real renderer and by nothing else**: slip read 0.000 at both values,
  because a foot in the air has nothing to slide against.

**AND A "FAST AND NIMBLE" WALK IS A DUTY, NOT AN AMPLITUDE.** `--rig bulwark`
is the same body with its shield, and what separates it from `--rig humanoid` —
which drew this type until 2026-08-20 — is not bigger numbers. `walk_cycle`
holds each boot down for exactly half the cycle so that no frame has both feet
off the road; at `SPRINT_DUTY = 0.46` two frames per cycle do, `airborne_lift`
gives the body a rise over each, and the stoop drops from the zombie's 0.10 to
0.045. Lightness is the suspension; the posture and the arm swing only agree
with it.

**A CYCLE IS ONE STRIDE, BUT A STRIDE NEED NOT BE ONE STEP** (2026-08-18).
`--rig walker` runs the Midboss — a four-legged salvage machine with two arms
and a turret — and it is the first body to take **two** steps per stride
(`MARCH_STEPS`). The format's only rule is that the frame list repeats over one
stride of 0.899281 u; how many times each foot plants inside it was a choice
every earlier body made the same way, and it is the wrong one for a short-legged
body. **A planted foot must travel back the whole share of the stride it is
down for**, so a single plant at 60 % duty asked the Harvester's 0.408 u leg for
a 0.539 u sweep: 83°, with the front claw digging 0.156 u through the road at
one end and the chassis jacking 0.136 u into the air at the other. At two steps
every one of those figures more than halves and the solve is untouched —
`solve_hip_angles` is handed `CYCLE_UNITS / MARCH_STEPS` and answers the same
question. `check-gait-slip.js` reads **A = 0.001 px on all four claws**, two
plants each. **If a new source's legs are short relative to its body, reach for
this before reaching for a slipping gait.**

Three more rules came out of that body, and each is general:

- **A gait that never puts two feet down on one side cannot rock.** The owner
  asked for a chassis that "rocks side-to-side as weight shifts between leg
  pairs". Pairing the legs front-to-rear — the reading the words alone suggest —
  keeps one foot down per side on every frame at every duty, so the support is
  balanced left to right always and `support_roll` correctly derives nothing.
  The **lateral sequence** (front left, rear left, front right, rear right) is
  what puts both left claws down together and then both right ones, and it is
  why an ambling elephant rolls. The roll is read off the support count, so it
  cannot lean the machine onto a foot that is in the air.
- **A SOLVE CENTRED UNDER THE HIP COLLAPSES A SPLAYED STANCE.**
  `solve_hip_angles` puts the sole directly beneath the hip at mid-plant, which
  is right for every body whose leg hangs straight down (0.012 u of difference
  on the zombie) and silently rotates the Harvester's front legs 27° back and
  its rear legs 27° forward on every frame of every plant — the artist's stance
  gone, and the machine jacked 6 px into the air to reach the road from it.
  `solve_hip_angles(about_rest=True)` centres the sweep on the pose in the FILE
  instead. It is opt-in because it spends reach on the splay
  (`|cx| + anchor <= R`), and it is what a splayed source needs.
- **The chassis rides down on its own legs** (`stance_drop`). A rigid leg does
  not hold its shoulder at a constant height above its own claw through a sweep,
  and `plant_leg` spends the difference by moving the LEG — which keeps the foot
  honest and slides the leg through a socket that has not moved. The body takes
  the mean of what its planted legs ask for. On this gait that mean is nearly
  zero (front and rear legs roll opposite ways, so the body only bobs 2.1 px)
  and what is left at each socket is the leg's own roll: **0.091 u, 5.2 px,
  against a shoulder ball 6.9 px across** — the largest approximation in the
  rig, spent upward as often as downward, under the chassis skirt. **The real
  fix is a two-link leg with a knee**, and it is the right next change if this
  body ever has to bear scrutiny at a larger size. **The biped and the
  quadruped both carry the same defect** and hide it in smaller sweeps.
- **A rig may place a part by WHERE IT IS, not only by what it is called.**
  `midboss.glb` names all four legs `leg` and both arms `manipulator_arm`, so
  the hierarchy says which KIND of limb a mesh is on and only the geometry says
  which one. `build` therefore centres the body in plan BEFORE calling
  `group_of`, so a sign test is taken against the machine's own centre line.
  The three earlier imports reproduce byte-identical across that reordering.

**WHICH WAY A FILE FACES IS THE FILE'S TO SAY, AND GETTING IT WRONG IS SILENT**
(2026-08-19). A rig declares `source_forward` beside `source_up`, in the same
SOURCE coordinates, because the up-axis remap fixes which way is up and says
nothing about which way the body is POINTING once it is standing. The game's
forward is +X, and the y-up remap sends source +Z there — so every import until
now assumed "this file faces +Z", which happened to be true of all six.

It is not true of all of them. **`slow.glb` faces −Z** (its ToePlates,
ChestPlate and FacePlate all sit at negative z, where the Revenant's
`chest_plate` is at +0.108..+0.295) and **`boss.glb` is z-up AND faces −Y**, so
the identity remap the beacon needs marches the Tyrant sideways.

**NOTHING IN THE TOOLCHAIN MEASURES FACING, which is why this needs writing
down.** The plodder was imported backwards first: the gait solved, and
`check-gait-slip.js` scored **A = 0.000 px**, because a heel plants exactly as
well as a toe. Every instrument was green and the body walked down the road
backwards. The check that caught it is comparing the head group's mean x against
a body known to be right: the Revenant's head sits at +0.0709 and the plodder's
was at **−0.0753**, the same magnitude with the sign reversed. It reads +0.0753
now. That comparison is the only facing test this repo has — run it by hand
against a known-good body after any import.

The defaults are the old behaviour exactly: `+z` under a y-up remap and `+x`
under a z-up one both land on +X, which is a yaw of zero, and a zero yaw skips
the rotation entirely rather than multiplying every point by an identity built
from cos and sin. The six imports that predate this reproduce byte-identical —
verified by printing the yaw each shipped rig resolves to, not by re-running
them, since their original flags are not recorded anywhere.

**A RIG IS THE GROUPING, AND SOMETIMES ONLY THE GROUPING** (2026-08-19).
`--rig plodder` runs the Slow — `slow.glb`, a two-legged machine — and it
borrows `humanoid_pivot_of` and `walk_cycle` *verbatim*, by reference rather
than by copy, so a fix to the walk reaches both bodies. A boot plants exactly
the way a zombie's does and the solve is not a matter of per-file taste.

What it cannot borrow is `humanoid_group_of`, and the reason is a property of
the FILE and not of the body. **`slow.glb` is FLAT**: all thirty meshes are
direct children of one `Plodder_Root`, so `chain[1]` — the limb the humanoid rig
matches on — does not exist. The limb identity is carried in the MESH NAME
instead (`Thigh.L`, `Forearm.R`, `FacePlate`), which is the other convention an
exporter reaches for and is no less complete. Pointing the humanoid rig at it is
not a bad walk, it is a **statue sliding down the road**: every triangle lands in
the body group, and a body group is drawn with one matrix.

`PLODDER_LIMBS` maps base name → limb, and the side is taken off FIRST because
the suffix alone is not the limb — `Eye.L` ends the way `Fist.L` does, and a
suffix-only rule welds the face onto the arms and swings it.

**It fits to 0.979 u, which is the body it REPLACED and not this mesh's own
proportions.** The Slow has drawn 31.1 px since the chassis built it and is
deliberately shorter than a normal's 37.8; the humanoid's own 1.19 default would
have quietly made the slow type the taller of the two. Same argument as the
beacon's 1.40 — an import inherits the silhouette the waves were balanced to
read. `node tools/check-gait-slip.js` scores it **A = 0.000 px**.

`--rig tyrant` is the same argument for the wave-35 boss — `boss.glb`, a
Hunter-Killer with a claw arm and an executioner arm — and it too supplies only
a `group_of`. It is the first source to break BOTH conventions at once: z-up
like the beacon, and facing −Y, which nothing before it did. Its names are
matched differently from the plodder's because the file names parts for the
MACHINE rather than for the limb: the arms are the `Hunter_` one and the
`Windup_`/`Executioner_` one, so half the right arm carries no side token at all
(`Windup_Charge_Ring_01`, `Executioner_Fist`). Two orderings in
`tyrant_group_of` are load bearing and both are traps —
**`Foot_Claw_Left_+0.00` carries "claw" AND "foot"**, and **`Chest_Armor_Left`
and `Phase2_Rib_Vent_Left_01` carry "left" and are TORSO**, so a rule that read
the side first and asked what the part was second would tear the chest plating
off and swing it from the shoulder. The shoulders are BODY here rather than
pauldrons on the arm: `Shoulder_Mass_Left` spans x −1.79..−0.41 against a torso
half-width of 1.12, so swinging it opens a gap at its inboard edge on the widest
body in the game. Fitted to **1.076 u**, the body it replaces — AGENTS.md
balances the roster against the Tyrant's "82 tall and 70 wide" — and it scores
**A = 0.001 px** on 16 frames with both feet at 50% duty.

**A RIG NEED NOT BE A GAIT** (2026-08-18). `--rig spectre` runs the Healer —
`healer.glb`, a crystal core inside two counter-rotating rings, six
shards in orbit, a skirt of ectoplasm and a crown of plumes — and it is the
first import with **no legs at all**. The three rigs before it are variations on
one hard constraint (a planted foot must travel back exactly the stride the body
travels forward, or it skates); a body that touches nothing has no such
constraint and no plant to solve. What replaces it:

- **The cycle is driven by a CLOCK, and this is the second case of the flier's
  exemption rather than a new one.** `gl-world.js::clockRate` is now the single
  place the exceptions to the distance rule are enumerated: `isFlying` gives the
  Wisp `HOVER_HZ`, and a type carrying a `hover` block gives its own
  `hover.animHz`. **Anything that plants a foot is still distance-driven and
  always will be.** `World3D.animHz` answers for both, so the codex viewer needed
  no edit.
- **`tools/check-gait-slip.js` must be told**, in `HOVERS`. That table is the one
  thing in the tool kept in step by hand, and forgetting it does not lose a check
  — it produces a WRONG one: the Healer's skirt sweeps 12.5 px through a cycle it
  is supposed to sweep, and graded as a gait that is the second-worst reading in
  the library. The rule the table mirrors is "`isFlying`, or a `hover` block".
- **Every term in the cycle is a whole number of turns or a sine of the cycle**,
  because the caller loops the frame list: a term that ends anywhere but where it
  started is a visible jump once per cycle forever. Half a turn is admissible on
  a part that is symmetric about the axis it turns on, and on nothing else.
- **Three kinds of joint, all measured.** A part that SPINS turns about its own
  centroid (the six shards are evenly spaced, so their common centroid *is* the
  axis they orbit); a part that HANGS swings from its top; a part that RISES
  bends at its base. Nothing in the rig is a coordinate read off a viewport.

**A TRANSLUCENT PART IMPORTS AS AN OPAQUE ONE, AND THE FORMAT CANNOT SAY
OTHERWISE.** A palette entry is `[r, g, b, emission]` — there is no alpha in it.
`healer.glb` authors an `aura_shroud` at alpha 0.35, a 0.9 u envelope
around a 0.5 u core, which imports as a **shell with the whole lantern sealed
inside it**. It is dropped with `--exclude aura_shroud`, the same mechanism and
the same reasoning as the undead zombie's `grave_ground`: a decision about the
SOURCE belongs on the command line and in the run's own output, never buried in
a rig. **Check a new source's alpha modes before believing its silhouette** —
this is a property of the format and will apply to the next import too.

**AN IMPORTED EMISSIVE STRENGTH IS A ROUTE TO WHITE, NOT A BRIGHTNESS.** `uGlow`
is 0 for every body except a flier, so at rest the whole of a material's
emission is `GLModels.expand`'s resting floor: `min(1, e * 0.16)` added to each
LINEAR channel. An outside renderer's `emissiveStrength: 5` is a floor of 0.80
added to all three channels — the hound's first import drew a black dog with
WHITE panels, on the two parts that carry the type's colour. `--emit-cap` exists
for that. **This is a property of the renderer, so it applies to any import, not
to this one body**: check a new model's strengths before believing its palette.

**THE COROLLARY IS THE USEFUL HALF: SATURATION FALLS AS EMISSION RISES.** The
floor is added to every channel equally, so it is white — a hot number does not
make a part more orange, it drags all three channels toward 1 together, and the
brightest heat available is also the palest. A saturated colour on a lit part is
therefore bought with a LOW emission, which reads as wrong when you write it
down and is what the numbers actually do. The hound's lava is `e = 0.55` on the
crust cracks against the `e = 1.55` amber it replaced, and it is the more
vivid of the two: (254, 127, 93) where the amber pinned both red and green at
254. A tint entry may carry a fourth number — its own emission — because one
body's emissive materials are rarely one temperature and `--emit-cap` can only
flatten them together. It is applied only to materials that already glow, so a
palette decision cannot turn plating into a lamp.

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

**The smasher (`js/smasher.js`).** Melee AoE: a 120° wedge, **40 u.l., 14
damage every 3.2 s, $600** — 4.38 DPS as placed. Retuned twice: 2026-08-26 from
31.25 / 12 / 4.0 s / $700 in the change that took it out of the opening hand,
and **2026-08-27 at the owner's instruction ("il est trop faible, il n'aide
pas assez, il est trop cher"), which raised the body by 28% of its DPS and left
the build price alone** — what moved instead is the first four tiers, $50 dearer
each and carrying more (see the two path sections below). It **holds its swing** until something is in the zone
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

**Range on B1 (+5 u.l.), B2 (+20), B4 (+10) and B5 (+15).** Path B granted none
at all before 2026-07-30; a full B Warbringer now reaches **90 u.l.** against
the 40 base, and A1+A2+full-B crosspaths to 103.75. **These are ADDITIVE on the
base**, unlike path A's `rangeUl` where the longest owned value wins — so both
base rises carried the whole B column up with them without a line of path B
moving.

**AND THAT IS WHY A1 AND A2 SELL THEIR REACH THE SAME WAY SINCE 2026-08-27.**
A1 granted an absolute `rangeUl: 37.50`; the 2026-08-26 base rise met it exactly
and the tier silently stopped selling any reach at all — the max cannot be won
by a value equal to it. Its five units are a `rangeBonusUl` now, which is summed
after the max and so survives the next base rise as well as carrying up path A.
A2 keeps its absolute 43.75, which still beats the 40 base, and takes its five
on top. **Check this column against the base before moving either**: an absolute
at or below the base is a tier claiming to sell reach it does not sell.

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
`3 × 1 / 1.2 = 2.5` at base, `5 × 8 / (34/60) = 70.6` at A5 — and it is why
`attacksPerSecond()` is `shotsPerBurst / burstCooldown` for a burst weapon. Shot
spacing is therefore a *shape*: it decides how bunched a burst is, never how
often one happens. Every tier keeps `(shots − 1) × spacing` comfortably under the
cooldown (0.28 s against 0.6 s at A5), and a test asserts that relationship
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

**Path A tightens the burst** (A1 200, A2 325, A3 700, A4 1900, A5 3275): more
shots, less space between them, a shorter pause, then raw damage. It is a burst
weapon all the way up.

**Its top two tiers were retuned up on 2026-07-30**, in the same session that
rebuilt path B and specifically to answer the dominance the rebuild created (see
the note further down): **A4 went from 2 to 4 damage**, and **A5 from 3 to 8
damage with 0.6 s between bursts instead of 0.7**. Shot spacing did not move.
The ladder is now 1 / 1 / 2 / 4 / 8 damage, and A5 is 70.6 DPS where it was 21.4.
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
second. A B-path Rifleman that had spent $525 crosspathing into them (A1 200 +
A2 325) got **nothing whatsoever** for it the moment B3 landed. Each now also adds **+0.25
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
| A5 | 8 | 8.82/s burst | **70.6** |

**The two branches now answer each other, and getting there took two passes.**
The path B rebuild landed first and left full B at 44 DPS against full A's 21.4 —
for $150 *less*, and while also carrying camo detection, armor pierce, +25 range,
+30 HP and recruits. Path A was flatly dominated. That was reported rather than
quietly fixed, and the owner's answer was the A4/A5 retune above. Where it sits
now:

- **Path A wins on the tower** — 70.6 DPS against path B's 50 (60 crosspathed into A1+A2).
- **And path A is CHEAPER**, which is the thing to look at first: full A is
  $6 700 all in (300 + 200/325/700/1900/3275) against full B's $7 500
  (300 + 200/350/750/2100/3800). **$800 less, not $150 more** — this passage
  said the opposite until 2026-08-12, on the strength of a path-A ladder that
  had been retuned out from under it. The Current values table had A right the
  whole time; the prose here was the stale copy.
- **Path B wins on everything else** — camo, 10 points of defence pierce, +25 range, +425 HP,
  and four recruits worth 7.5 DPS each while they live, which closes most of the
  raw-damage gap when they are out and closes none of it when they are not.

**So this is NOT the clean trade-off the section used to claim.** On live prices
path A is ahead on the tower *and* undercuts path B by 12%, so what B is really
selling is the utility column, and it charges $800 for it. Whether that is the
intended shape is a balance question and is nobody's to settle in this document
— it is recorded here because the section previously argued for a trade-off the
game does not offer. It is also the whole balance of this tower resting on one
45 s cooldown, so anyone retuning either branch should re-derive both columns
rather than one.

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
walks into it rather than by the length of the road — which also makes the ~47 s
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

- **Walk speed is 80% of `Enemy.BASE_SPEED_ULPS`** (40 u.l./s). A recruit
  marching against the traffic at four fifths of its pace crosses the reference
  route in ~47 s, which is what makes the 45 s cooldown read as "your last group
  is just gone".
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

## The Farm — a tower that produces MANA, and the first with three paths

Added 2026-08-27 against a fully specified brief. `js/farm.js`, **1200 mana**,
id `farm`, constructor `FarmTower`, display name **Farm**. It does not shoot.

**THE WORD IS MANA, AND ONLY THE WORD.** Every string this tower puts on screen
says mana — never gold, cash, coins or a dollar sign — at the owner's
instruction. The QUANTITY is the game's ordinary `cash`: there is one run
currency and inventing a second would be a change to the economy rather than to
this tower. `Farms.pay` is the one door onto that global and the only place in
the file that touches it. A test reads every panel string and every stat row and
fails on the sight of a `$`.

**IT IS THE SIXTH TYPE AND NOT A SIXTH SLOT.** The bar is five and stays five;
the armoury already picks which five of the owned types are equipped, which is
exactly the case a sixth type needs. The SANDBOX shows six, because a workbench
has no coins to spend and is a preview of the towers rather than of the bar — it
re-derives `BAR_WIDTH`/`BAR_X` after installing its roster so the extra slot is
not drawn off the end of a bar centred for five.

**A T3 ON ANY BRANCH CAPS BOTH OTHERS AT 2.** The two-branch crosspath rule the
other four towers share, said for three. The brief settles it from the other
end: a Farm with a main path at T3+ wears that path's model, and its secondary
upgrades are T1/T2 only.

### Where its output goes, and when

**`Farms` is the board-wide half** and lives at the bottom of the same file. A
farm's own upgrades are a farm's business; who is registered, which unique tiers
are taken, the network, the field and the wave boundary are not. `game.js` says
only WHEN, at three moments: a wave ending, a wave starting, and a restart.

**`settleWave` is LATCHED ON THE WAVE NUMBER**, exactly as `payWaveBounty` is
and for the same reason: it is reachable from all three gates plus two safety
nets, and paying a wave's production twice is the whole risk in a design with
several doors. **`Farms.reset()` clears that latch**, and forgetting to was a
real defect the suite caught: a second run would silently skip its own wave 1.

**A3 ADDS a tick; it does not replace the per-wave figure** (changed
2026-08-28). It read as “replaces” from the brief's word *remplace*, and played,
that is a downgrade dressed as a tier: 1600 mana to trade 400 a wave for 50
every five seconds, silently switching off the crosspathed B2 the player had
also paid for. Owner: *“it should continue producing mana as it already did.”*
Nothing a farm buys is ever turned off by something else it buys. The tick is
driven from `update(dt)` rather than from a wave hook — so it advances at 3×
speed and freezes with the run like every other cooldown.

**From A4 production fills the tower's own stock instead of the purse, and
`collect()` is the door out of it** — free, immediate, the whole stock, whenever
the player likes. That door was missing until 2026-08-28, and its absence was
most of what made path A read as a trap: the only other way out was A5's
investment, 13 000 mana further on and spending in whole tranches of ten
thousand. Owner: *“we can't take the mana stored whenever we want, which is
supposed to be the point.”* The cost of collecting is the one the design already
has — `cloneStock` pays 5% of what is STANDING at the end of a wave, so
collecting every wave turns the tower back into an ordinary per-wave farm, and
leaving it in is what makes A4 worth its price.

**IT KEEPS TWO LIFETIME TOTALS, AND THEY EXIST BECAUSE THE PRODUCTION WAS
INVISIBLE** (2026-08-28). `manaProduced` and `baseHpProduced` are on the tower,
they never go down, and the panel prints them. A plain farm pays 200 mana into a
purse that bounties are already moving, at a wave boundary, with no popup and no
row — so the owner placed one, watched a run, and reported: *"the tower is
supposed to produce mana, and it doesn't rn"*. It did, at 200 a wave, measured
against a farmless run at the same seed. Nothing on the screen said so.

Every door that makes either credits its own farm:

* `produce()` is the one door for mana, so the wave figure, the tick and the
  stock all land there. **The stocked mana counts as produced** — the stock is
  where it went, not whether it was made — and `cloneStock` credits its clone
  too. Spending the stock through A5 does not take it back: a lifetime total is
  not a balance.
* A kill in a path-B field credits both totals inside `Farms.onEnemyKilled`.
* **The C network's payout is SPLIT across its members** by each farm's share of
  `B`, inside `openWave`. Without that split a C-path farm would read `0 mana
  produced` for a whole run while paying the player every wave, which is exactly
  the illusion these totals exist to end.
* `Effects.farmProduced` puts a `+200 mana` popup over the farm, the same one an
  enemy's bounty gets, and says `stored` instead when A4 kept it. Presentation
  only, guarded on `typeof Effects`, and the simulation never reads it back.

`RESULT_TOTAL_LABELS` carries both labels, so they appear on the end-of-run
screen like any other tower's totals. **`Base HP produced` is shown only on a
farm with a tier that makes it** — no invented zeroes, the rule that screen is
built on.

### A5's investment is AIMED, and the permanent one lands once per tower

**`FarmBoost` (bottom of js/farm.js) is the whole of it**, and it exists because
until 2026-08-28 the bonus was a board-wide figure `Farms.investment()` that no
tower read: pressing Invest spent the stock and changed nothing at all. Owner:
*“we can't choose who to boost — we're supposed to click on the ability, then
click on the tower, and that target boosted. Also make sure the boosts are one
time only… boosted with 10k is boosted. It is limited to 100k, but you can't
boost it ten times at 10k.”*

**Two clicks, and the mode is a mode.** `performAction` ARMS rather than
spends: it calls `context.beginInvesting(farm, temporary)`, which sets
`investingFarm` in game.js — the same shape, the same rules and the same clears
as `aimingTower` beside it. It consumes the next click ahead of building and
inspecting, a click on open ground cancels it, Escape cancels it, and it goes
with the farm if the farm is sold or destroyed. **A mis-press costs nothing**:
the stock is only taken once a target has been clicked.

**One permanent boost per tower, ever.** The ten-tranche ceiling is a ceiling on
that ONE press, not on a running total: 100 000 mana at once is +50%, and 10 000
ten times is +5% and nine refusals (`already boosted`). The SURGE has no such
rule — thirty seconds, re-pressable, and a second one replaces the first rather
than stacking.

**Who can be boosted**: a tower at tier 5 or above on some branch
(`FarmBoost.tierReached`, which reads `core.purchased` on the config towers and
`hasA1..hasC5` on the hand-written ones), and never a Farm. The eligible towers
wear a ring while the mode is up, so the once-only rule is visible BEFORE the
click rather than explained after it.

**What a boost does, and the one place each quantity is applied.** +5% damage,
+5% attack speed, +5% range per tranche. Nothing else — not hit points, not the
footprint, not a flag:

| quantity | applied in |
|---|---|
| range | `elevatedRangePx` (js/tower.js) — every type converts its reach through it, so the Summoner's blubs and the Siphon's beam get it for free |
| damage, speed | the end of each type's own recompute: `recalcStats` for the Rifleman and the Warbringer, `_refreshStats` for the config towers, `Blub.attackDamage`/`attacksPerSecond` for the summoned units |

Cooldowns DIVIDE by the multiplier and rates MULTIPLY by it — the same statement
in the two units the game uses. **The blubs read the boost off their OWNER at use
time** rather than baking it in at birth, so a thirty-second surge lifts the
blubs already standing rather than only the ones planted while it runs.

**Permanent and surge ADD as fractions**, so +50% under a +250% surge is ×4.00
and not ×5.25 — the same additive rule `js/enemy.js` uses for damage
amplification, and for the same reason: two bonuses that multiply are a number
nobody can predict from the panel.

### Path B raises a global, so the base's maximum is run state now

`BASE_MAX_HP` is still where a run begins and still what the sandbox overrides.
**`baseMaxHp` is what the run is currently playing with**, and `growBaseMaxHp`
is the one door.

**A GRANTED HIT POINT IS A REAL HIT POINT** (changed 2026-08-28). This read
“raising the maximum does not heal”, on the brief's word, and the result was a
tier nobody could feel: a B3 farm bought +150 a wave, the bar read *Base 100 /
400* after two waves, and the player's actual health had never moved — nothing
in the game heals the base except a Siphon's lifesteal, so the headroom was room
to repair into with no repair in sight. Owner: *“hp gain of B doesn't work at
all.”* `growBaseMaxHp` now raises both.

**What it still does not do is undo damage already taken.** At 50/100 a grant of
150 gives 200/250, never 250/250. That is why the two variables stay separate: a
Farm gives what it makes and gives back nothing that was lost.

### The field and the per-kill bounty need LINE OF SIGHT

`FarmTower.covers` is a circle test **and** a sight test, through
`RangeFilter.sightClear` — the same door the Warbringer's acquisition and the
Siphon's lock check use, with the ground under the farm as the eye. Everything
path B does reads through it: the slow, the damage amplification, B5's execution
and the per-kill mana and base HP.

The sight half arrived 2026-08-28. Until then this was the one reach on the
board that ignored terrain — a farm behind a stump slowed, amplified and got
paid for bodies it could not see, **while the red blind-spot overlay drawn over
that very circle said the opposite**. Owner: *“make sure when a tower doesn't
have vision the buff and debuff don't apply.”* Measured on Ironwood: a point 107
px away inside a 156 px reach, with a 40 px stump 20 units tall between, is now
refused by `covers`, by `killBonusAt`, by `slowAt` and by `damageAmpAt` — and the
overlay paints 8 063 red pixels over exactly that side of the circle.

**A farm ON a stump sees over everything at or below its own height**, like
every other tower — the eye is `groundHeight`, so its own rock cannot blind it.
That was the total failure the Arcane Sniper had before elevation was wired up.

**The cost is small and was measured rather than assumed**: 2 µs per body for
the whole `killBonusAt` sweep, against the ~15 µs per body the camo ground ring
costs, in a 0.84 ms frame. The circle test runs first and throws most candidates
away before any shape loop — the same ordering `RangeFilter.canTarget` uses.

**THE FIELD IS ITS OWN CHANNEL, not a slow and not a DamageAmp stack.**
`applySlow` takes the strongest and refreshes it, which is right for a timed
debuff a tower applies and wrong for a standing field — a Warbringer's 65% would
have swallowed a Farm's 5% entirely. The brief asks for these to stack
**additively with the other kinds**, so `js/enemy.js` reads them as a third
channel: the slow multiplies alongside `slowMultiplier`, and the damage
amplifier is SUMMED with DamageAmp's fraction and applied once. With no farms on
the board that sum is DamageAmp's own multiplier to the float, which is what
keeps every existing figure in the suite where it was.

**B5's execution is asked AFTER the blow, never instead of it.** "Un ennemi
situé dans la portée est ATTAQUÉ" — a body that walks through untouched is never
executed; being hit is what asks the question. It takes the ordinary death path,
so a Revenant still gets up and the bounty is still paid once by the sweep.

### Everything it makes is visible on the board, not only in the panel

Four separate reports, all from 2026-08-28 and all the same complaint: the tower
worked and nothing said so.

* **A payment throws a popup** — `Effects.farmProduced(tower, amount, stored)`,
  the same one an enemy's bounty gets, saying `stored` when A4 kept it. The
  CLONE throws one too, and that one matters most: it is the only gain that
  happens *between* waves, when nothing else on the board is moving to explain
  the stock going up. Owner: *“we can't see whenever an A4 or A5 tower produces
  mana between waves — the cloned mana from the storage.”*
* **A path-B farm's share of a kill is its OWN popup**, green, above the gold
  bounty, never added into it. Owner: *“imagine it gives four and the tower
  gives one — it's written +4 and +1, not +5.”* Two farms over one corpse are
  two gains and read as two.
* **A body a farm will be paid for wears a ring while it is still alive**, in
  the same green, solid where the camo ring is dashed so a camo body inside a
  field reads as both. Gated on `Farms.killBonusAt`, which costs one length test
  with no farm on the board — this is the per-body overlay term measured to
  break first.

**BOTH BOARDS DRAW ALL OF IT.** Every one of these lives in two places — the 2D
pass and gl-world's — and each was found by the 3D board silently not doing it:
the popup colour was honoured only in `Effects.drawWorld` and painted gold in
gl-world; the target ring was called only inside `if (!world3D)` and so stroked
nothing at all (measured: zero changed pixels between a frame with the mode
armed and one without). **A popup's `y` is a world coordinate and its `lift` is a
HEIGHT** — raising a label means raising the lift; changing `y` walks it
northwards across the map, which is how two popups sixteen units apart ended up
in one eighteen-pixel band.

### Path C is a network, and its dice are DATA

Every C3+ farm joins one network. **B** is the sum of the members' nominal
productions; **P** is the permanent figure the dice batter and the next wave
pays. P starts at B when the network comes into being and never tracks it again
— a farm joining later raises the baseline a face 8 resets to, and does not undo
the dice. **A networked farm is never paid twice**: its production is already
inside B and therefore inside P, so `settleWave` skips it and `openWave` pays P
once. Paying does not consume P.

**NOTHING HERE USES `Math.random`.** The dice are a seeded xorshift, for the
reason lane offsets and the Summoner's spawn points are: a run that cannot be
replayed cannot be tested, and this tower's whole output is decided by dice.

**A FACE IS A DESCRIPTOR, and the resolver never branches on a number.** `flat`,
`percent`, `worstOf`, `bestOf`, `thenPercent`, `reset`, `double`, the three
"next gain" charges and `prep` are the whole vocabulary; three tables differ by
their numbers alone. That is what lets `tests/farm.test.js` walk all sixty-two
faces individually, with a scripted die rather than a seed.

**C5's TABLE HAS TWENTY-TWO FACES.** The brief calls it a D20 and then lists 21
and 22, so the table is the harder constraint and the die has 22 sides. It is
recorded here rather than quietly reconciled.

**C5 IS PRICED AND SUNK, AND IT IS THE ONLY TIER IN THE GAME THAT IS** (retuned
2026-08-28, to the owner's figures). 250 000 mana, up from 9 000; **the sale
refunds none of it**; and its own production came down from +500 a wave to
+400. Every gain face on its table was cut with it: 9 +65, 10 +95, 11 +130,
12 +175, 14 +350, 15 max(+425, +10%), 16 +225, 17 next gain max(+650, +35%),
18 max(+525, +15%), 20 +700 then +20%. The loss faces, the reset, the reroll,
the cull, the multiplier and the two doubles are unchanged.

**The no-refund half is a tier flag, not a Farm rule**: `noRefund: true` on the
row, `unrefundableSpent` on the tower, and `sellValue` in js/game.js subtracts
it before the refund fraction. `totalSpent` stays honest about what was paid —
that is the figure the end-of-run screen reports — so the two must not be
conflated. Any future tier can be sunk the same way by adding the flag.

**The deferred effects are ordered, and the order is mandated because every step
changes what the next one sees**: a face 13's protections reroll up to three 8s;
then the +1/+2 land on C5 dice; then a +2 that produces exactly 8 becomes 9 (a
+1 arriving on 8 is left alone, which is the brief's wording); then a previous
face 22 removes what is still under 9; then what survives is sorted and resolved
low to high. **Sorting is what C5 buys** — without one on the board the order is
random, and the "next gain" faces are worth more when the gains after them are
big.

### Three of the twelve models exist, and they arrived animated

**Twelve are planned**: the base, a T1 shared by A1/B1/C1, a T2 shared by
A2/B2/C2, and one each for A3-A5, B3-B5 and C3-C5. **No crosspath ever gets a
model of its own** — a Farm with a main path at T3+ wears that path's body and
its secondary T1/T2 add no overlay.

**All twelve are built**, imported from Claude Design. `farm-base` is a stone mana well
with a crank, a pulley, a rope and a bucket, and a novice working it; `farm-t1`
is a hand pump with a lever, a piston, a hose and a bottle; `farm-t2` is that
pump reinforced with a flywheel and a pressure tank (all three 2026-08-28). Then
the three T3 bodies, one per path (2026-08-29): `farm-t3a` a relic piston
refinery, `farm-t3b` a targeting array on a gimbal, `farm-t3c` a d20 fate altar.
Then the three T4s the same day: `farm-t4a` a storage-and-cloning generator,
`farm-t4b` a control-zone orrery, `farm-t4c` a two-dice fate manipulator. And
the T5s that finish the set: `farm-t5a` the Mana Vault Engine, `farm-t5b` the
Azure Panopticon, `farm-t5c` The House Always Wins.

`farmGroup` in gl-world answers with **the highest model that has been
AUTHORED**, not the highest tier bought, so a T5 on path B wears `farm-t3b`
until its own is built. From T3 the PATH picks the body, which is the brief's
rule; the crosspath makes that unambiguous, since a T3 anywhere caps the other
two branches at 2.

**Every model carries authored clips** rather than a cycle this project solved.
Base/T1/T2 have one loop each (8 s, 7.5 s, 7.5 s). The T3 bodies have an idle
AND one-shots, and each one-shot depicts something the tower already does:

| model | idle | one-shots | fired by |
|---|---|---|---|
| `farm-t3a` | `idle_work` 4 s | `produce_tick` 1.6 s | a production tick (A3+) |
| `farm-t3b` | `idle_scan` 6 s | `target_lock` 0.35 s | a body entering the field |
| | | `kill_capture` 0.7 s | a body dying inside it |
| `farm-t3c` | `idle_magic` 3 s | `end_wave_roll` 2.4 s | the C network rolling |
| `farm-t4a` | `idle_process` 4 s | `produce_tick` 1.6 s | a production tick |
| | | `clone_wave` 2.2 s | the stock cloning at a wave |
| | | `withdraw` 1.4 s | the player collecting it |
| `farm-t4b` | `idle_orbit` 8 s | `field_pulse` 1.5 s | *a second IDLE — see below* |
| | | `target_lock` 0.35 s | a body entering the field |
| | | `kill_capture` 0.8 s | a body dying inside it |
| | | `wave_gain` 1.1 s | the base being given its HP |
| `farm-t4c` | `idle_fate` 4 s | `end_wave_roll` 2.4 s | the C network rolling |
| | | `result_positive/negative` | what that throw did to P |
| | | `result_reset` 1 s | a reset face (8) |
| | | `critical_success/failure` | a doubling face, or P halved |
| `farm-t5a` | `idle_vault` 6 s | `produce_tick` · `clone_wave` · `withdraw_mana` | as A4 |
| | | `empower_permanent` 3.4 s | A5's permanent investment |
| | | `empower_temporary` 2.2 s | A5's surge |
| `farm-t5b` | `idle_panopticon` 10 s | `field_aura` 2 s | *a second IDLE, as B4's* |
| | | `target_lock` · `kill_capture` · `wave_gain` | as B4 |
| | | `execute` 1.25 s | B5 taking a body outright |
| `farm-t5c` | `idle_casino` 6 s | `end_wave_roll` 3 s | the C network rolling |
| | | `queue_modifier` 0.9 s | a face RECORDING a prep effect |
| | | `reroll_eight` · `purge_under_nine` · `pre_roll_modifiers` | one being SPENT |
| | | `result_21_double` · `result_22_purge_double` | the C5 table's own doubles |
| | | the other `result_*` | as C4 |

**RECORDING A PREP EFFECT AND SPENDING IT ARE TWO MOMENTS**, and T5-C draws them
differently — a plaque sliding into its slot, then firing. `resolve` stamps
`queue_modifier` when a face banks one; `applyPrep` stamps `reroll_eight`,
`purge_under_nine` or `pre_roll_modifiers` when the next series consumes it.
These are the four clips that shipped on C4 with nowhere to play: T5's body has
the states they describe, so they are wired now.

**THE C5 TABLE HAS ITS OWN TWO DOUBLES.** Face 21 arms the next one and face 22
purges everything under nine as well, and the T5 body has a clip for each; a C3
or C4 double has no such face and stays the generic `critical_success`.
`outcomeOf` checks the face numbers, and only when the farm's table IS `C5`.

**`field_pulse` IS A SECOND IDLE, NOT A ONE-SHOT.** It is a seamless 1.5 s loop,
and it replaces band 0 for as long as B4's zone holds a body — which the tower
already knows, because `fieldHeld` is kept for the lock edge. Any model without
the clip falls through to its own band 0.

**THE SIMULATION NAMES ITS OWN OUTCOME.** C4 has a body for each way a throw can
go, so `outcomeOf` in js/farm.js decides which — reading that farm's OWN dice
(`lastRolls`) and the network's movement, in order: a doubling face is a
critical success, a reset face names itself, P halved or worse is a critical
failure, then merely up or down. The order is the decision: face 8 from a high P
is a bigger loss than any other face can deal, so testing the halving first would
swallow it and play a generic catastrophe where the shrine has a body for exactly
that. The renderer never re-reads a face table.

**C4's four unwired clips are wired on T5-C**, where the same effects have
bodies that show the resulting STATE — a queued plaque, purged sectors, an armed
double. C4 keeps its own four unplayed, because its model has no such states to
land in and a farm wearing it has not bought C5 anyway.

**THE SIMULATION RECORDS *WHEN*, THE RENDERER DECIDES *WHETHER*.** `lastTick`,
`lastLock`, `lastCapture`, `lastRoll`, `lastClone`, `lastWithdraw`, `lastGain`,
`lastExecute`, `lastEmpower` and `lastPrep` are animClock stamps on the tower,
-1 for never — 0 is a real moment and a farm paid on its first step would otherwise
play its tick at birth. `farmFrame` in gl-world picks the most recent one-shot
still inside its own duration, else the idle. One-way, exactly like
`swingProgress` and `gearPhase`: nothing simulated reads any of it back.

**Clips are matched BY NAME, never by band index** — `bandNames` on the model —
because an index points at whatever happens to be second in the file, and B3
already carries two one-shots where A3 and C3 carry one. A test pins the names.

### The mana has to be VISIBLE, and two separate things were hiding it

Owner, on the first import: *“il n'y a pas de shine ni de couleur… le A path
est censé avoir des couleurs violettes, le C orange un peu plus vibrant, le B
briller quand il y a des interactions.”* Both causes were real and neither was
the model's fault.

**1. GLASS SHIPS OPAQUE, so it walled the mana in.** The design paints glass at
35% opacity (`alphaMode: BLEND`); a palette row here is `[r, g, b, emission]`
with no fourth channel. So every glass shell arrived as a solid pale object with
the mana sealed inside it — A4's reservoir was a white cylinder. Each is now
`--exclude`d at import, which is the Bulwark's argument again (see
`Integrated_Kinetic_Field` in `glb_to_model.py`). **None of the glass nodes
carry mana as a child**, which is what makes dropping the subtree safe, and the
caps, necks and bands are separate nodes that stay — the silhouette survives.
C3 and C4 have no glass at all, which is exactly why their gold read from the
start.

**2. EMISSION IS A ROUTE TO WHITE, so the colour that did show was washed.**
`GLModels.expand` bakes `min(1, emit * 0.16)` into every LINEAR channel as a
resting floor. At the authored 1.15–2.6 the purple goes from `#794aff` to
`#cdb9ff` — saturation 0.71 down to 0.27. Every farm model is imported with
`--emit-cap 0.8`, which lands it at `#9a7bff` and keeps it mana.

**THE BRIGHTNESS THAT CAP GIVES UP IS REPAID BY A REAL GLOW.** A farm had none:
`towerGlow` returns 0 for anything with no swing and no core, so the mana was
lit only by the sun. `farmGlow` gives it a steady pilot light (0.42–0.62,
breathing on a 2.4 s period that is deliberately no clip's length) plus a flash
of up to 1.15 that decays over 0.6 s on **every** event the tower already
stamps. `vEmi` is per material, so this brightens the mana, the coils, the dice
and the orrery's core and never the wood — one number standing in for the
handoff's per-material curves, because the shader is already picking the right
surfaces.

**THE TINT IS THE PATH'S, AND IT IS IN LINEAR.** `#7a4bff`, `#46d8ff`,
`#ff9d2e` — the handoff's own tokens, converted: (0.195, 0.070, 1.0),
(0.061, 0.687, 1.0), (1.0, 0.337, 0.027). The shader adds `uGlowTint * (vEmi *
uGlow)` BEFORE its single sRGB conversion, so passing the sRGB triplets pours
two and a half times too much red into every flash and turns a purple chamber
pink. Measured on the board: with the linear tints a flash brightens 92 tower
pixels, the strongest `#47616a → #82aeb2`, and the hue holds.

**The per-material CURVES are still not imported and cannot be.** The handoff
specifies them per material (`mana_chamber_t3a` at `1.15 + 0.35·sin`, and so
on) and the format carries one static scalar per palette row. What ships is the
right colour, lit, brightening on every event — not five independent curves.

**THE ANIMATION RUNS ON THE SIMULATION CLOCK, not `state.now`.**
`FarmTower.animClock` is accumulated in `update(dt)`, so the well turns three
times as fast at 3× speed and stops dead when the run freezes — a picture of
the production it is. `state.now` is `performance.now()`, which is why the
Summoner's idle keeps chanting over a paused board; do not copy that here. The
renderer divides `animClock` by the MODEL's own `loopSeconds` and takes the
remainder, because the model is what knows how long its loop is.

**The 2D fallback is still a placeholder**, and is meant to look it: a canvas
glyph reduced to the four shapes that read from the top down — platform,
cauldron, mana, hood. Only the WebGL board has the real bodies.

---

## The Summoner — a tower that never fires

Added 2026-08-09 against a fully-specified brief (concept, both upgrade tables,
every unit's stats, the two crowd mechanics, Coagulation's five tiers and
twenty-eight numbered acceptance tests). `js/blub.js`, **$450**, id `blub`,
constructor `BlubTower`, display name **Summoner**. Its units are **blubs**, and
the brief's names for them are kept exactly: Blub I/II/III, Mini Blub I/II,
Hungry Blub, Cyberblub, Mechablub, Mechablub MK2, SuperBlub, Monster Blub.

**A blub's hit points ARE its ammunition.** Every attack spends one and at zero
it dies. That is the whole economy of this tower and the reason nothing in it
has a magazine, a reload or a lifetime timer: a Blub I with 10 charges makes
exactly ten attacks for exactly 20 damage, and both halves are pinned.

### A blub is IN `towers`, and that is the structural decision

Everything else follows from it. A blub is **not** a recruit (`js/soldier.js`),
which lives on its parent and is deliberately not a tower. The brief asks for
units that occupy space under the tower packing rule, that cannot be built on
top of, that open a stats panel when clicked, that carry HP and die, and that
eat area stuns — and `towers` already provides every one of those:

| what the brief asks for | what `towers` already does |
|---|---|
| blubs never overlap anything | `whyCannotBuild` compares footprint radii |
| click one for a stats panel | `towerAt` → `inspected` → `inspectionLayout` |
| a sell button paying $0 | `sellValue` reads `totalSpent`, which is 0 |
| area stuns land on them | `TowerHealth.tickStun` in the main loop |
| death animation, ground freed at once | the destroyed sweep + `Effects.towerDestroyed` |
| nothing survives a restart | `restartGame()` clears `towers` |

**`isSummon` is the flag that takes back the one thing `towers` should not
give them: enemy attention.** `Enemy.attackCandidates` skips summons, so no
enemy targets one and — the subtler half — an aimed shot that takes the two
highest-DPS towers can never spend one of its picks on a blub it cannot hurt.
The single exception says so itself by setting `enemyTargetable` (a tier 3+
monster blub).

**Zone stuns are applied separately, and only stuns.** The brief keeps both
halves — blubs cannot be attacked, but *"les blubs subissent les stuns de zone"* —
so `resolveAttack` sweeps summons within a **leap's** radius for its stun alone,
after the ordinary hit loop. Only a leap qualifies: an aimed shot picks one
tower by name and has no area, so silencing the blubs beside its victim would be
inventing reach it does not have.

### Attacks are INSTANT, not projectiles

A deliberate departure from every other shooting tower here, for two reasons
that are both about ammunition:

- **A charge must not be spent on a corpse.** Blubs pass `skipClaimed` to
  `Targeting.pick` like everyone else, but a bullet only claims while it is in
  the air. With instant resolution the enemy is already dead when the next blub
  in the same step looks at it — strictly better than a claim, and free.
- **Half the roster does not fire a bullet at all.** The Hungry Blub splashes,
  the SuperBlub fires a piercing lance every tenth attack, the Mechablub MK2
  detonates when it dies, and a monster blub can hit the whole map. Instant
  damage through `TowerScore.apply` is how the Warbringer's blast already works.

Every blub credits its damage and kills **to the Summoner**, the way the
Warbringer's chain blast is credited to the Warbringer that caused it. A blub's
own panel is a readout, not a scoreboard.

### Where a blub appears

A **random point inside the tower's range**, then the free point **nearest the
enemy path** if nothing random lands, then **nothing at all** — and a cycle that
places nothing is not an error.

**A BLOCKED LINE WAITS AT FULL; IT DOES NOT START OVER** (2026-08-10, at the
owner's correction). The brief said the cycle "reprend normalement au cycle
suivant", and that was worse in play than it sounds: on a full board every line
spent its whole interval counting down to another failure, so the moment a blub
finally died the board sat empty for up to thirty seconds. The timer now **holds
at zero** — the rail bar pins full and the box says "no room" rather than lying
about a countdown — and the next step places the body, so a space that opens is
filled on the frame it opens. Same hold-at-zero rule an idle rifle follows for
its cooldown, and a test pins both halves.

**The randomness is a seeded xorshift on the tower, not `Math.random`.** Same
reason lane offsets and the boss's attack cycle are not random: a run that
cannot be replayed cannot be tested. It is seeded from the tower's own position,
so two Summoners on one board lay out differently.

**The overlap rule is the only placement rule applied.** Blubs are checked
against every tower and every other blub by the sum of the footprint radii, and
against the map edges — but *not* against the road. The brief lists only
overlap ("la règle est identique à celle appliquée aux tours" is about that
rule), and a blub standing in the road has precedent: a Rifleman's recruits
already do. Enemies walk through them without collision.

**A destroyed body has already released its ground**, in `BlubTower.spotIsFree`
*and* in `whyCannotBuild`. The main loop's sweep runs once a step, so without
this a blub that spent its last charge would hold its footprint until the next
frame — and the brief asks for instant release as **one rule for every tower in
the game**, which is why the change is in the shared validator and not only in
the summoner.

### The units

| unit | dmg | atk/s | charges | range | interval | footprint |
|---|---:|---:|---:|---:|---:|---:|
| Blub I | 2 | 1.0 | 10 | 100 | 20 s | 10 |
| Blub II | 4 | 1.25 | 15 | 125 | 18 s | 13 |
| Blub III | 6 | 1.5 | 20 | 150 | 15 s | 20 |
| Mini Blub I | 2 | 3.0 | 6 | 100 | 4 s | 10 |
| Mini Blub II | 3 | 3.0 | 12 | 115 | 3.5 s | 10 |
| Hungry Blub | 20 | 0.75 | 35 | 130 | 15 s | 25 |
| Cyberblub | 12 | 2.0 | 40 | 200 | 20 s | 25 |
| Mechablub | 35 | 2.5 | 75 | 175 | 25 s | 30 |
| Mechablub MK2 | 100 | 2.0 | 80 | 150 | 30 s | 40 |
| SuperBlub | 200 | 1.25 | **51** | 300 | 100 s | 50 |

**Targeting is always `first` and there is no cycle button.** The brief:
*"toujours le premier ennemi dans leur portée. Aucune logique de ciblage
alternative."* The mode therefore lives on a `view` object rather than on the
blub, because `inspectionLayout` draws the targeting cycle for anything carrying
a string `targeting`, and offering a choice the unit does not have is a button
that lies.

**THREE SUMMON LINES, each on its own independent clock**: `main`, `mini` and
`heavy`. The third is shared between the branches on purpose — A4 gives it the
Hungry Blub and B5 the SuperBlub, and no tower can hold both, so a fourth line
would be a timer that is always dead.

**A tier swap applies to FUTURE summons only**, and so do B1's and B2's flat
bonuses. That falls out of the design rather than being enforced: a blub is
handed finished numbers at birth by `BlubTower.summonStats`, exactly as a
recruit is, and never looks at an upgrade flag again.

### Path A — the swarm

| tier | cost | tower HP | tower range | what it does |
|---|---:|---:|---:|---|
| A1 | 550 | +25 | +25 | Blub I → Blub II |
| A2 | 1100 | +75 | +15 | Blub II → Blub III · unlocks the swarm buff |
| A3 | 3500 | +100 | — | adds the Mini Blub I line · unlocks the toggles |
| A4 | 6500 | +250 | — | Mini I → Mini II · adds the Hungry Blub · swarm cap to 100% · unlocks the weakening debuff |
| A5 | 40000 | +5000 | +135 | unlocks Coagulation |

Cumulative: $52 100, 5 550 HP, 250 u.l. of range. A test pins every row.

### Path B — the machines

| tier | cost | tower HP | tower range | what it does |
|---|---:|---:|---:|---|
| B1 | 250 | +5 | — | +1 damage to every summon |
| B2 | 300 | — | — | +1 charge to every summon · −1 s on every interval |
| B3 | 1600 | +100 | — | Blub III → Cyberblub. **Requires A2** |
| B4 | 4500 | +250 | +35 | Cyberblub → Mechablub · −1 s more |
| B5 | 8500 | +1250 | — | Mechablub → MK2 · adds the SuperBlub · −3 s more |

Interval reductions are cumulative: −1 s at B2, −2 s at B4, −5 s at B5, applied
to **every** line. **`BlubTower.MIN_INTERVAL_SECONDS` = 0.5 floors all of them.**
The brief asks for a floor rather than letting a number run to zero, and a zero
interval is not a fast tower — it is an infinite loop inside one step.

**B3 REQUIRES A2, and no other tower in this game has a gate like it.** The
Cyberblub is an evolution of the Blub III, so a path-B player must buy A1 and A2
first. `requiresOther` carries it structurally and `whyCannotUpgrade` reports it
after the path lock — telling a locked-out player to go and buy something that
cannot help them would be the wrong order. **The index screen walks past the
gate rather than stopping at it** (`satisfyCrossBranchGate` in js/codex.js): a
guide that stopped at B3 would hide B4 and B5 entirely, and the tiers it did
show would be measured on a tower no real path-B build ever looks like.

### The swarm buff (A2)

Every living blub gives every **other** blub of the same Summoner **+5% damage
and +5% attack speed**. Capped at +50% (A2) and +100% (A4) — eleven and
twenty-one blubs respectively, since a blub never buffs itself. Recomputed
continuously from the fleet, and only from **this** tower's fleet.

### The weakening debuff (A4)

Every enemy hit by a blub of this Summoner takes **+0.1% damage from all
sources for 5 s**, stacking to **+100%**, with **each stack keeping its own five
seconds**. `js/systems/damage-amp.js` owns it.

**It is not `js/systems/buff-stacks.js`, and the difference is the point.** That
tracker is a count of stacks sharing one refreshed window (the Sniper's kill
stacks); a new stack pushes the whole thing out. This one must decay a thousand
hits as a thousand separate timers. Making one module do both would have been
two behaviours behind one name.

**Applied AFTER mitigation, in `Enemy.takeDamage`.** It is *damage taken*, not a
bigger swing that armor then eats: a brute hit for 6 through 5 flat armor takes
1, and at +100% it takes 2, not 7. Before mitigation the same debuff would have
been worth twelve times as much against an unarmoured swarm as against the
armour it exists to help crack.

### The special units

**Hungry Blub — 4% COMPOUNDING, and this is the one place the brief contradicts
itself.** Its prose says damage grows by "4% de sa valeur de base, cumulatif",
which reads additive; its acceptance test says the unit deals **1473** across
its 35 charges. Additive growth totals 1176. `20 × (1.04³⁵ − 1) / 0.04 = 1472.95`.
The numbered test is the exact figure, so compounding is what shipped — flagged
here rather than quietly reconciled. **The attack counter advances last**, so
the first attack lands the table value and the growth is what it leaves behind;
incrementing first put the lifetime total 4% over.

**SuperBlub — the lance is free, which is what buys exactly five of them.** Its
51 charges are deliberately not a round number (the brief says so). Every tenth
attack fires a piercing lance instead, at a **fixed 400 damage**, and costs no
charge — so 51 charges pay for 51 ordinary attacks and five lances fall among
the 56 it makes. With B2's extra charge it is 52 and 57, and still five lances,
which is why the test asserts the relationship rather than the number.

**Mechablub MK2 — the one exception to "blubs never move".** When its last
charge is spent it hops to the nearest enemy, or to the road if none is in
reach, and detonates for a **fixed 250** in 25 u.l. The move belongs to the
death animation, on a body already being swept off the board.

**Both fixed figures are fixed absolutely** — never touched by B1, the swarm
buff, or anything else. They are the only two damage numbers in the game that
ignore everything, so they are the only two that live outside `attackDamage()`.

### Coagulation (A5)

A manual ability on a **300 s** cooldown. Every living blub merges into one
**monster blub**, which never moves.

**WHERE IT STANDS DEPENDS ON WHETHER IT IS THE TOWER** (2026-08-10, at the
owner's correction: *"for t 0 1 and 2 the monster should not replace the tower
and now it does, only t 3 and 4 should, and should be placed as near as possible
to the track"*). Below tier 3 the merge produces one big blub and **the tower
carries on summoning beside it**, so putting it on the tower was wrong twice
over: it hid the thing still doing the work, and it made a body that has to
shoot stand wherever the tower happened to be built rather than where it can
reach. T0–T2 take the free spot **nearest the road that is still inside the tower's
range**. At **T3 and T4 the monster IS the tower**: it has fused with it,
summoning has stopped, and the two are one thing in one place.

**"Inside the range" is the half that had to be corrected twice** (2026-08-10).
The first version let the nearest-the-road sweep run out to several times the
range so it could hug the track from anywhere, and the result was a monster
standing well outside the circle its own tower draws — which reads as a bug
whatever the reasoning behind it. The owner's words: *"make sure monster blub
spawns like a normal blub inside the range when T 0 1 or 2."* The range is the
tower's promise about where its blubs appear and a merge does not get to break
it. Nothing is lost by bounding it: Coagulation needs A5, and A5 puts the range
at 250 u.l., so there is always somewhere for a 35 u.l. body to stand. That overlap is the only one on the board, and it is why `towerAt`
prefers a summon — clicking the fused pair opens the monster.

- **HP is the CURRENT total, not the maximum.** A blub that has already fired
  brings less, which is the whole tactical shape of it: you merge a fresh fleet,
  not a spent one. This is why the tower shows its pooled HP permanently.
- **Damage is the raw sum.** B1's flat +1 is part of each blub's resolved damage
  and is included; the swarm buff and a Hungry Blub's compounding are live
  multipliers on top of that and are not.
- **A later Coagulation absorbs the existing monster** — it is in `this.blubs`
  like everything else, so it needs no special case beyond being counted.
- **Absorbed blubs are removed immediately**, through `Blub.dissolve()` rather
  than through the ordinary death path. A merge is not a death: leaving them to
  the destroyed sweep would hold their footprints for the rest of the step —
  which is exactly the ground the monster needs — and fire a hundred death
  bursts for something nobody killed.
- **THE LEAP IS AN ATTACK, NOT A HEARTBEAT** (2026-08-10, at the owner's
  correction: *"the bounce should activate like an attack, only when there is
  ennemies"*). It fired on a bare timer, and a tier 2 leap costs 20 charges — so
  a monster standing on an empty board spent 20 every 15 seconds into nothing
  and eventually killed itself between waves. It now fires only when there is
  something inside its reach, and the clock **holds at zero** otherwise, so the
  blow lands the instant a wave arrives and waiting costs nothing.
  `jumpTargets()` is the ONE reach test, used both to decide whether it fires
  and to apply it, so the damage and the stun cannot land on different bodies.

| tier | pooled HP | range | atk/s | area | footprint |
|---|---|---|---:|---|---:|
| T0 | < 500 | 150 | 1.0 | — | 25 |
| T1 | 500–999 | 175 | 1.25 | 3 | 30 |
| T2 | 1000–3499 | 200 | 1.5 | 8 | 35 |
| T3 | ≥ 4500 | global | 2.5 | 15 | 50 |
| T4 | **exactly 7777** | global | 5.0 | global | 100 |

**Tier 4 is an exact threshold and is tested FIRST.** 7 776 and 7 778 are tier
3; 6 666 is not tier 4 at all. Ordering the check ahead of tier 3's `>= 4500`
is the only thing that makes that true, so it is written as an explicit first
case rather than as a range.

**This table said 6666 until 2026-08-27, and the Current values table said 7777
the whole time.** `BlubTower.MONSTER_TIERS` in `js/blub.js` carries
`exactHp: 7777`, so the row above was the wrong copy: the threshold moved in
`3724919` and only one of the two places that state it came with. Two passages
of this document disagreeing about the same constant is exactly the failure the
"Keep this file current" section opens by warning about, one document down from
the `CLAUDE.md` case. The code is the tie-break, and it was read before this was
edited.

**The tier is decided once, at the merge, and never moves again** — a tier 3
monster that eats its way past 6 666 does not become a tier 4.

- **T2** leaps every 15 s: full area damage, 2 s stun, 20 charges, 0.5 s of not
  attacking.
- **T3** fuses with the tower. Summoning **stops**, reach goes global, the leap
  hits for ×3 map-wide with a 3 s stun, and every kill the Summoner scores adds
  **+1 charge and +1 damage permanently**. It can now be attacked by enemies.
- **T4** is T3 with a 4 s leap at ×10, and **total stun immunity** — enforced by
  a `stunImmune` check inside `TowerHealth.stun`, so the boss's aimed shot, its
  shockwave and the monster's own leap cannot each forget it.
- **A monster at 0 returns the tower to A4** and summoning resumes. A5 is not
  refunded and Coagulation is not lost; what is lost is the fusion.

**WHERE IT STANDS DEPENDS ON WHETHER IT IS THE TOWER** (2026-08-10, at the
owner's correction: *"for t 0 1 and 2 the monster should not replace the tower
and now it does, only t 3 and 4 should, and should be placed as near as possible
to the track"*).

Below tier 3 the merge produces one big blub and **the tower carries on
summoning beside it**, so putting it on the tower was wrong twice over: it hid
the thing still doing the work, and it made a body that has to shoot stand
wherever the tower happened to be built rather than where it can reach. It goes
to the free spot **nearest the road** instead — `findRoadSpot`, the same
deterministic sweep a blocked summon falls back to, given room to look past the
tower's own range because this is one body that gets one chance to be placed.

From tier 3 the monster **is** the tower: fused, summoning stopped for good, two
things standing in one place. That is also why `towerAt` prefers a summon —
clicking the fused pair opens the monster, which is the thing you can see.

### The blub rail

**One grey box per summon line, in a column beside the panel** (2026-08-09, at
the owner's request: *"separated grey color boxes on the left of the panel, one
per blub type"*). They were three compact rows inside the panel for a few hours
first; the rail is better and the reason is worth keeping.

**Why beside and not inside.** These are not actions on the tower, they are its
*contents* — three things it is making, each with its own clock. As panel rows
they competed for height with the upgrade buttons, needed a layout exemption to
fit at all, and read as three more things to buy. As a rail they cost the panel
no height and the **grey says "status, not shop"** before a word is read: every
other rectangle on that panel is an offer (green buys a tier, violet fires an
ability, gold is a live reading) and these are none of those.

**THE BOX IS THE SWITCH** (revised 2026-08-10). It first *opened* a second panel
view with a Producing/Stop button inside it, and the owner's verdict was that
clicking a box *"creates an unknown behavior"*: you clicked a thing that looked
like a switch and got a different screen with another switch on it. His
correction is what shipped — *"from a3 onward make the greybox highlighted while
they produce and if they are left clicked they dim and stop production"*.

So: **lit while it produces, dim when it does not**, and a left click flips it.
No word has to be read to tell the two apart, which is the point of a column you
glance at while watching the road. One click, one meaning.

**A3 buys the switches**, and a box below it is still drawn and still counts
down — what a tower is making and when is worth knowing from the first one. It
simply refuses the click, and its card says why. The refusal comes from the
tower (`clickLine` returns `"needs A3"`), so `game.js` never learns which tier
buys what.

**The base stats moved to the hover card.** Hovering is the gesture that cannot
change anything, which makes it the right one for reading, and it is where every
other explain-this-before-you-touch-it in this game already lives. The card
carries the type's resolved numbers plus its **lifetime damage** — what one will
do if it spends every charge, which is the figure that actually compares two
lines: a Mini Blub II is 36 and a Cyberblub 480, and neither the damage nor the
rate says so alone.

**Each box carries the same clock twice.** A bar fills left to right as the
cycle runs and is **full on the frame the next body appears**; the seconds sit
beside it. The bar is for glancing at, the number for when "nearly full" needs
to mean one second rather than twenty. A box also shows `×N`, how many of that
type are standing — the other half of the same question. A **stopped line holds
its bar where it stands** rather than emptying it, which is the honest picture
of what the switch does to the clock.

**NO ROOM MEANS WAIT, NOT SKIP** (2026-08-10, at the owner's request). When the
cycle runs out and there is nowhere to put the body, the timer **holds at zero**:
the bar stays full, the box says *no room*, and the blub lands on the first step
a space opens. The brief originally said the cycle simply came round again, and
that was worse in play than it sounds — on a full board every line spent its
whole interval counting down to another failure, so a space that opened sat
empty for up to a whole cycle.

**A tier that shortens a cycle brings the next body closer.** A1/A2 swap the unit
for one on a faster cycle and B2/B4/B5 subtract seconds outright, so a running
clock is clamped to the new interval by `clampTimersToCycle`. **It is called from
`applyUpgrade`, never from `recalcStats`** — and that distinction cost a test to
find. `previewUpgrade` measures a tier by setting its flag, recalculating and
setting it back, so anything in `recalcStats` that touches live state runs every
time the cursor crosses an upgrade button: with the clamp there, merely laying
out the panel previewed A1's 18 s cycle, clamped the live 20 s clock to 18, and
left it there. Same trap the HP grant documents, and the same answer — only a
purchase may move live numbers.

**A fused tower has an empty rail.** From tier 3 the monster blub *is* the tower
and nothing is being produced, so three frozen bars would say the opposite of
what is happening. It comes back when the monster dies.

The tower answers **what** is on the rail (`railLines`); `inspectionLayout`
decides **where**; `railBoxAt` is the one hit test both the click handler and the
hover card go through, so what you can click and what you can hover are the same
rectangles — the same division, and the same one-rectangle rule, that `slotRect`
has for the build bar. `hitsBlubRail` consumes the click before a tower can be
built under it.

The tower itself still shows its **blub count and pooled current HP
permanently**, on the panel and over the tower — the pooled figure is what a
player aims a Coagulation with. A blub on the board has its own panel too, one
click away on the map, and its Sell button pays exactly $0.

**A BLUB DESTROYED THROUGH ITS PANEL LEAVES THE FLEET** (2026-08-10). `sellTower`
calls `onRemoved`, which sets `removed`, which `isDestroyed` reports — so every
reader that already went through `livingBlubs()` is correct at once. Without it a
sold blub was gone from `towers`, unable to shoot or be clicked, while still
counting in its summoner's blub count, its pooled HP, the swarm buff every other
blub drew on, and the next Coagulation's tier. One flag, one place.

**`action.compact` was added to `inspectionLayout`**: 34 px instead of the
full-width 60 px an upgrade description needs, two to a row. Nothing sets it
today — it survives the rail's rewrite because the layout it enables is the
right one for any future one-word button, and because rows are now **planned
before the panel height is known** and placed by walking that same plan, so what
is measured and what is drawn cannot disagree. `action.progress` is the other
shared addition: 0..1, swept across a button as its own clock runs.

**A summon wins a click over the tower underneath it** (`towerAt`). Only one
pair of things on this board can genuinely overlap — a Summoner and the monster
blub Coagulation puts on it — and it resolves to the thing the player can see,
the same "whatever is drawn on top wins" rule the enemy/recruit hover follows.

### What it reports, and why

`attackDamage()` returns its **whole fleet's damage per second** and
`attacksPerSecond()` returns **1**, so the product is that figure. Those two
exist for one caller: `Enemy.towerDps`, i.e. the Tyrant's aimed shot. A tower
answering zero would be permanently invisible to the one attack in the game that
goes looking for the board's best piece, which is not a property this tower
should have. **The panel does not print them** through `TowerStats.damage` /
`attackSpeed` — an "Attack speed 1.00/s" row on a tower that never attacks is a
lie — and prints its own fleet rows instead.

### Not a starter

It is a **90-coin purchase** in `js/meta.js`, not part of the opening kit. That
was a decision, not an omission: `starter: true` would put a tower producing
free damage forever into the starting hand, and *a fresh profile cannot win* is
the premise the whole meta loop rests on — the one `measure-starter-kit.js`
exists to keep checking. ~~That tool's provenance is void.~~ **The tool was
repaired and reproduces; what is void is the starter-kit TABLE, which is still
the dead version's output** — see the file map and the Balance math section.
The instrument now lives in `THE_COMPANY/tools/balance/`, so **checking this
premise is possible but not reproducible from a clone of this repository**, and
the table has not been re-measured through it. The premise stands as a
design decision; what has lapsed is the instrument that verified it. If the
owner wants it in the opening hand it is one field plus a re-run, and the
re-run needs the tool repaired first — unauthorised work sitting with vera,
not a step to take in passing.

**It fills the fifth build slot**, which had been empty since the gunner was
deleted. The bar is now genuinely full, and a sixth type needs a decision about
the bar's shape — the armoury's Inventory tab already chooses which five of the
owned types are equipped, so "full" is a statement about the bar, not the roster.

**The sandbox keeps its own roster list** (`ROSTER` in `js/sandbox/sandbox.js`),
which is NOT derived from the meta catalogue — a workbench has no coins to spend.
A tower added to the game has to be added there too, or the sandbox stops being
a truthful preview of it. A test pins it.

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
  therefore its stun length **and its cooldown**: `cooldownSeconds` was `null`
  with a TODO against it until 2026-08-26 and is **60 s** now, started at
  ACTIVATION rather than after the ten seconds of channel and exhaustion — those
  are already the price, and charging after them would charge twice. A refused
  press never spends it, and the auto path inherits all three refusals because
  it goes through the same `performAction`.

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
- **Tests:** `node tests/long-range-dps.test.js` -- independent of
  `tests/run.js`: it requires the systems/config files directly rather than
  booting through `tests/harness.js`, since Longshot's systems have no DOM
  dependency to stub. **Its pass/fail figures live in the suite table under
  "How to run and test" and nowhere else.** This line used to carry its own
  test count; it drifted, and it was removed rather than corrected, because a
  count kept in two places diverges again. Do not recount the suite with
  `grep -c '^test('` either -- it generates cases inside `forEach` loops over
  the spec's own path tables, so a static count reads low. Only a real run is
  authoritative. `node tests/long-range-dps-scene.smoke.js` boots the
  debug scene against a stubbed DOM to catch wiring mistakes the unit tests
  can't see (missing element ids, DOM calls leaking into `update()`).

---

## Building a model that looks like the ones that already work

The Arcane Sniper, the Rifleman and the meshed enemies set the bar. The Warbringer
now has all seven tiers built through `td_mesh` (no Blender needed for it). **The
Siphon now has all eleven tiers built too**; **every enemy type with no
`js/gl/models/enemy-<typeId>.js` still draws as an untextured sphere**. Every
future enemy has the same problem to solve.

**A ROCKING FOOT READS SHORT ON THE INSTRUMENT, AND A SHORT READING IS A REAL
SIGNAL.** `check-gait-slip.js` decides contact from the vertices lowest in the
REST pose, so a rigid foot that rolls onto a different claw reports a shorter
plant than the rig authored while still scoring A = 0 on every frame it does
grade. The Harvester read ten, nine, ten, nine against ten-frame plants
(2026-08-18) — and the cause was worth finding rather than explaining away: its
solve was collapsing a splayed stance (see `about_rest` above). With that fixed
it reads ten, ten, ten, ten. Read the Tyrant's note immediately below before
concluding a short reading is only an instrument artefact.

**Both bosses are now meshed** — the Vanguard (`enemy-boss_fast`) and the Tyrant
(`enemy-boss`, the wave-35 boss the whole campaign ends on), on 2026-08-13. They
are the two bodies to read for a GAIT, because they are the only two whose swing
angle is solved against the stride rather than inherited: `tools/blender/
gait_solve.py` and their build scripts' headers carry the reasoning, and
`tools/check-gait-slip.js` is the gate. **Read the Tyrant's before writing a
contact measure of your own** — it records why a fixed-sole-centroid measure,
which is the correct choice on every other body here, scores a *correct*
flat-soled rocking foot at 0.55 of requirement.

**A GAIT WITH MORE THAN TWO LEG GROUPS HAS TWO RULES OF ITS OWN, AND THE SOLVER
ENFORCES NEITHER.** `enemy_chassis.animate_walk_grouped` takes any number of
evenly-phased groups, but every body shipped before 2026-08-14 passed exactly
two, and two is the count at which both of these are free:

- **The frame count must divide by the group count.** `shifts` are whole
  frames, so three groups at `frames` 8, 10 or 16 gives gaps of 3/2/3, 3/4/3 and
  5/6/5 — a body whose legs are unevenly phased, silently. The function now
  raises on this; the multiples for three groups are 6, 9, 12, 15, 18, 21, 24.
- **A clean `gait_solve` is not a clean gait.** The solver steers on
  `groups[0][0]` and measures no other foot, so it converges and reports success
  while the other groups slide. `tools/check-gait-slip.js` is the instrument
  that answers this — it iterates every foot and reports a worst foot. **Run the
  gate, not the solver's own convergence**, on anything above two groups.

Also expect the body's `bob` and `roll_deg` to stay wired to group 0, so an odd
group count gives two body dips per cycle against N footfalls. And remember a
roll on this chassis *adds* to the plan extent rather than shrinking it, because
clause 3b puts the animated root on the ground — so trimming those two buys
plan margin as well as rhythm.

**"GROUPS" MEANS TWO DIFFERENT THINGS AND THE RULE ABOVE IS ABOUT ONLY ONE OF
THEM.** Say which every time, because the two counts differ on every walking
body in the library:

- **Mesh groups** — what the exporter emits and what `groups[]` holds in the
  generated JS, one per animated root. This is the number in an export line
  (`3 moving group(s)`) and in `check-model-top` / `check-gait-slip` output.
- **Gait groups** — how many *evenly-phased leg phases* the walk has. This is
  the number the two rules above are about.

The Tyrant is **3 mesh groups** (`boss_body`, `leg_l`, `leg_r`) and **2 gait
groups**. Reporting the first into a conversation about the second read as an
alarm on a shipped boss for several minutes and cost a rendering lead a
re-check. The mesh count is always at least gait count + 1, because the body
root is a mesh group and is not a leg.

**And prefer immunity by CONSTRUCTION to immunity by arithmetic when you clear a
body of a defect.** Both bosses are clear of the `groups[0][0]` steering defect
— but not because `+N/2 ≡ −N/2 (mod N)` makes it invisible at two groups, which
is true and expires silently the day someone adds a third. They are clear
because **neither module calls the defective functions at all**: no
`gait_solve.solve_contact_x`, no `verify_plant`, no `gait_solve.contact_x`, no
`chassis.animate_walk_grouped`. That reason keeps holding when the leg count
changes; the arithmetic one does not, and nothing announces when it stops.

**Verify every leg, not the first one.** Both boss modules re-measure their
plant from posed geometry per leg (`measure_plant("leg_l")` *and*
`("leg_r")`) — the Vanguard did only `leg_l` until 2026-08-14, and "fine by
symmetry" is the same assumption that let the solver report success on feet
sliding 19.3 board px. The fix was one line and both legs read 0.000000 u.
**An instrument that has only ever returned one answer has not been tested,
whichever answer it is** — so ask what case your check has never been *given*.

**The roster is deliberately not counted here.** It moved by five in a single day
on 2026-08-13 and any figure written down is wrong by the next commit;
`enemyModel()` in `js/gl/gl-world.js` derives it — `GLModels.has("enemy-" + id)`,
falling back to the sphere — so `ls js/gl/models/enemy-*.js` against
`Enemy.TYPES` is the answer, and it is always current.

**THIRTEEN BODIES NOW COME FROM A `.glb` AND NOT FROM `tools/blender`**, and which
ones cannot be worked out from the directory listings. `enemy-flying` (the
Aether Wisp) was the first, brought in on 2026-08-12; both Revenant meshes
followed on 2026-08-16; **`enemy-fast` joined them on 2026-08-17**;
**`enemy-midboss` (the Harvester) and `enemy-healer` on 2026-08-18**, both of
which had drawn a coloured sphere until then; **`enemy-shieldbearer` (the
Auroris beacon) the same day**; **`enemy-slow` (the plodder) and
**`enemy-boss` (the Tyrant Hunter-Killer) on 2026-08-19**; and
**`enemy-shielded` and `enemy-shielded-broken` (the Bulwark, before and after
its shield goes) on 2026-08-20**; and **`enemy-boss_fast` and
`enemy-boss_fast-shattered` (the Vanguard, before and after its own shield
goes) on 2026-08-26**. All thirteen are
regenerated by
`tools/glb_to_model.py` from `glb/`, and none of them can be rebuilt from
`tools/blender`. **Six of the thirteen REPLACED a body this repo had already
built** — `enemy-fast`, `enemy-shieldbearer`, `enemy-slow`, `enemy-boss`,
`enemy-shielded` and `enemy-boss_fast` —
and each cost a row in `export_mesh.py::TARGETS`; see the trap below, which has
now been sprung six times.

**A SECOND IMPORTER EXISTS, AND IT IS NOT A VARIANT OF THE FIRST.**
`tools/glb_to_animated.py` imports a `.glb` that carries **its own animation**;
`glb_to_model.py` imports one that does not and synthesises the motion from a
rig. The Farm's three models are the only users so far, and they are the only
files in `glb/` with an `animations` array in them.

The split is a real one rather than tidiness. `glb_to_model.py` answers "what
should this body do" — a walk cycle that must stay in step with distance
covered is SOLVED, not authored, and `walk_cycle` inverts the hip rotation to
prove it. The animated importer answers "what does this file already do": it
reads the glTF samplers and bakes them into the frame list, and there is nothing
to solve. A model needing both would be one with an authored idle and a solved
gait, and there is none.

What it shares it IMPORTS rather than copies: the `.glb` reader, the mesh walk,
the palette derivation, the axis convention and the emitted format. What it adds
is grouping by **nearest animated ancestor**, geometry stored in MODEL space
with every pivot at zero, and one field, `loopSeconds`.

**GEOMETRY IN MODEL SPACE IS THE FORMAT'S RULE, NOT A CHOICE**, and it is the
same one the walker rigs make with `origin_pivot`. A frame matrix is applied as
`instance * pose`, so it must land its points in model space; storing them
relative to a joint means every matrix has to carry that joint's translation
back, and getting the direction of that wrong shifts a whole group by its pivot.
It did, on the first version of this tool: the well's bucket and rope were
pushed out of frame, the novice's hands ended up inside the well, and the pumps'
levers sank into the ground. Owner: *"pour la base y a pas de seau ni de corde
et les mains sont dans le puits, et pour les deux autres les mains et le shaft
sont dans le sol"*.

Nothing is lost by it: the delta a group is posed by already turns about that
part's own origin, because it is built from the node's world transform rather
than from a rotation at the model root.

**HOW TO CHECK AN IMPORT WITHOUT LOADING THE GAME**, and this is the check that
would have caught the above in one run: pose each group's rest origin by its own
frame matrix and compare against the glTF sampled directly at the same time. The
three Farm models agree with their sources to 8e-6 model units on the bucket,
the rope, the pulley, the crank and both of the novice's hands.

**`GLModels.register` COPIES FIELDS EXPLICITLY, so a new one has to be added
there too.** `loopSeconds` is on that list because `bands` was not for eight
models — the field shipped, `register` dropped it, every reader took the
documented fallback, and the whole thing looked like it worked. A missing
`loopSeconds` fails the same silent way: the animation plays at a default rate
nobody chose.

**THE TRAP THAT COST A REGENERATION**: `Animation.sample` must fall back to the
node's AUTHORED value for every channel the animation does not drive. An
animated node is normally driven on one component — `well_pulley` has a rotation
channel and nothing else — and rebuilding its local matrix from the animation
alone drops the translation that puts it up on the beam. The first run did
exactly that, and the pulley's frame matrix carried a residual shift of -1.44 in
z, which is its own height. It is checkable in one line: a group animated by a
pure rotation about its own pivot must have a frame translation of zero.

**TWO PAIRS ARE ONE BODY IMPORTED TWICE, AND THE SECOND IMPORT IS NEVER
INDEPENDENT OF THE FIRST.** `bulwark_shield.glb` and `bulwark_no_shield.glb` are
the same machine, and the stripped one is imported with `--span 3.0771` — the
span the FIRST command prints — so that the pair share a scale rather than
merely a fitted height. The two files are 3.0771 and 3.0371 source units tall;
fitting each to 1.354 independently would make the stripped body 1.3% larger and
grow the Bulwark at the instant its shield pops. Re-run them as a pair, and read
`glb_to_model.py`'s header for both command lines. The same `--span` rule is why
the Revenant's two halves are the same size, and why the Vanguard's shattered
body carries `--span 4.3500` off the intact file (4.3500 against its own 4.3700,
so an independent fit would have grown the boss 0.5% at the instant its shield
popped). That is what the flag exists for.

**AND THE VANGUARD'S PAIR IS THE ONE WHERE THE TWO FILES DO *NOT* MEAN TWO
GAITS.** The Bulwark needs two rigs because its shield break is permanent and
the machine moves differently afterwards forever. The Vanguard's two states are
not before-and-after anything: it dashes the opening 400 u.l. and bounds the
rest of the road, and it does both with its shield up and with it gone — the
shield comes back every seven seconds. So the pair of gaits lives in the MODEL,
as two `bands`, and BOTH files carry both. One rig, two cycles. Read the block
above `VANGUARD_HEAD_PARTS` before assuming a second file implies a second rig.

**EVERY SOURCE FILE IS NAMED FOR ITS ENEMY, AND THAT IS A RULE ABOUT `glb/`
RATHER THAN ABOUT THE IMPORTER** (2026-08-19, at the owner's instruction:
"in all glb files, rename the corresponding .glb file to its enemy name"). The
directory used to hold `robo-hound.glb`, `Auroris_Shield_Beacon.glb`,
`plodder_slow_enemy.glb`, `Tyrant_Hunter_Killer_Boss.glb` and four more
named for what the artist drew, so
answering "which file is the Fast?" meant opening files. It is now
`boss.glb`, `fast.glb`, `flying.glb`, `healer.glb`, `midboss.glb`,
`revenant.glb`, `revenant-undead.glb`, `shieldbearer.glb`, `slow.glb` — the
model's own id with `enemy-` taken off. **`bulwark_shield.glb` and
`bulwark_no_shield.glb` (2026-08-20) are named for the ENEMY and not for the
model**, and that is the rule holding rather than bending: the enemy is the
Bulwark, its type id is `shielded` for historical reasons the tower-names
section explains, and naming a source `shielded.glb` would have named it after
the id rather than after the thing. Read the `--name` in `glb_to_model.py`'s
header for the mapping to `enemy-shielded` / `enemy-shielded-broken`. **Nothing at runtime reads a `.glb`**, so the rename could
not break the game; what it does touch is every `--name` line in
`glb_to_model.py`'s header and the "Source of truth is X.glb" line each
generated model carries, and both were retargeted with it.

**THE TWO FILES IN `glb/` THAT ARE STILL NOT NAMED FOR AN ENEMY ARE NOT
OVERSIGHTS.** `fractal-slime.glb` is the unit sphere described below and is not
the Fractal Slime's source, so naming it `fractal_slime.glb` would assert
exactly the thing that paragraph exists to deny — and would put a filename one
`--name` away from the body `enemy_slime.py` builds. `raptor-war-machine.glb`
(392 parts, a segmented spine) corresponds to no type in the roster and is
imported by nothing; it is a source waiting for a body, and giving it an
enemy's name before it has one would be the same mistake in the other
direction.

**A SOURCE .glb IS NOT ALWAYS Y-UP.** Seven of the nine are, which is the glTF
convention and was wired into `glb_to_model.py` as a fact until the beacon
arrived authored **Z-UP** — base on z = 0, antenna tip at z = 5.35 — and the
Y-up remap laid a five-metre spire on its side. A rig now declares `source_up`,
because the convention belongs to the FILE and a rig is written against one
file's hierarchy. Both maps are proper rotations (the z-up one is the identity),
so neither can flip a winding and put the back-face cull on the wrong side.
`fit_axis` stays in SOURCE coordinates for both — it answers "which axis of THIS
FILE is the body measured along", which is 1 for a y-up file and 2 for a z-up
one.

**A `.glb` IN `glb/` IS NOT EVIDENCE THAT A BODY CAME FROM ONE. MEASURE THE
FILE.** `glb/fractal-slime.glb` sits in that directory and is not the Fractal
Slime's source: 253 500 vertices, 84 500 triangles, one primitive, **zero
materials**, and every vertex 1.000000 units from the origin — it is a unit
SPHERE, and whatever displaced it into a slime lived in the authoring tool's
shader graph and did not survive the export. There is no texture path here to
bring that back (see clause 7's corollary), so importing it would ship the same
ball `gl-world`'s fallback already draws, at 84 500 triangles instead of
nothing. That body is built by `tools/blender/enemy_slime.py` instead, and it is
the **first enemy authored through `td_mesh`** rather than through Blender or an
import. Two directory listings cannot tell you any of that; ten lines of
`struct.unpack` can, and the header of that script carries the numbers.

**`enemy-fast` is the trap of the set, because `enemy_skimmer.py` is still
there.** The Skimmer mech built that file until the hound replaced it, and its
row in `export_mesh.py::TARGETS` has been REMOVED for exactly that reason: the
filename, the registered id and the model contract are identical either way, so
a batch `--only=enemy-` would have rewritten the hound as the mech with nothing
anywhere reporting a problem. The script is kept — the Courier and the Vanguard
both measure against its chest — but it no longer owns a shipped file. **The
rule this generalises to: a `.glb` import and a Blender target must never name
the same output.** Whichever one ran last wins, silently. It has a second body
to protect now: `enemy-fractal_slime.js` is written by
`tools/blender/enemy_slime.py`, there is a `fractal-slime.glb` a step away in
`glb/`, and no `--name enemy-fractal_slime` exists anywhere. There must not be
one.

**AND IT HAS BEEN SPRUNG A SECOND TIME, WHICH IS WHY IT IS A RULE AND NOT AN
ANECDOTE.** `enemy-shieldbearer` went the same way on 2026-08-18: the four-legged
Tender (`enemy_tender.py`) built that filename until `shieldbearer.glb`
replaced it, and its TARGETS row is gone for exactly the Skimmer's reason. The
script is kept for the same kind of reason too — it is the chassis's four-legged
worked example and `enemy_dray.py` measures against it — but it no longer owns a
shipped file.

**AND A THIRD TIME, ON 2026-08-19: `enemy-slow`.** The Tun (`enemy_tun.py`)
built that filename until `slow.glb` — the plodder — replaced it, and its
TARGETS row is gone for the Skimmer's reason and the Tender's. `enemy_tun.py`
is kept because `make_preview.py` still builds its contact sheet from it.

**AND A FOURTH, THE SAME DAY: `enemy-boss`.** The container-with-legs
(`enemy_tyrant.py`) built the wave-35 boss until `boss.glb` replaced it.
`enemy_tyrant.py` is kept — it is still the worked example of a swing angle
DERIVED from leg depth rather than typed. **Removing that row also closed a
hazard the block itself had been warning about:** `enemy-boss` was the first
target name in TARGETS that is a PREFIX of another (`enemy-boss_fast`), so
`--only=enemy-boss` rewrote the Vanguard too — identical in triangles, not in
bytes. With the row gone the prefix has one match again.

**AND A SIXTH, ON 2026-08-26: `enemy-boss_fast`.** The chassis Vanguard
(`enemy_vanguard.py`) built the fast boss until `vanguard.glb` replaced it.
`enemy_vanguard.py` is KEPT for a reason that has nothing to do with the row: it
was the first body in this repo whose swing angle was SOLVED rather than
authored, and `tools/blender/check_group_gait.py`'s notes are written against
exactly that module. **And removing the row put the prefix hazard BACK, in the
other direction**: `enemy-boss_fast` is now a prefix of
`enemy-boss_fast-shattered`. Neither has a TARGETS row, so `_requested()` cannot
be what goes wrong — and `glb_to_model.py` takes an exact `--name` with no
prefix matching at all — but any batch tool that grows a prefix match has two
files to hit here and must name the one it means.

**AND A FIFTH, ON 2026-08-20: `enemy-shielded`.** The Courier
(`enemy_courier.py`) built the Bulwark until `bulwark_shield.glb` replaced it.
`enemy_courier.py` is KEPT — `enemy_tender.py` and `enemy_vanguard.py` both
measure against its chest, and `enemy_chassis.py`'s own header cites its export
as the worked example of a chassis body. **The second half of that import,
`enemy-shielded-broken`, has never been built here and must never be given a
row**, which is the `enemy-fractal_slime` rule pointing the other way: there the
danger is a `--name` that does not exist yet, here it is a TARGETS row that does
not exist yet.

Five for five: **every import that has ever landed on a name this repo already
built has needed a TARGETS row removed in the same change**, so treat that as
the default expectation rather than as a thing to check for.

**Check TARGETS whenever an import lands on a name this repo has
ever built**, because nothing else will: the filename, the registered id and the
model contract are identical either way, and the only symptom is the wrong body
walking the road.

(**The load-bearing half is that
`enemy_flying.py` does not exist while `enemy-flying.js` does** — still true on
2026-08-13. Do not re-derive that by matching the two directory listings:
**the four original bodies are named for their typeId (`enemy_brute`,
`enemy_hive`, `enemy_normal`, `enemy_swarm`) and the five added 2026-08-13 are
named for their LORE name** — `enemy_skimmer` → `enemy-fast`, `enemy_tun` →
`enemy-slow`, `enemy_drudge` → `enemy-armored`, `enemy_hedger` → `enemy-angry`,
`enemy_cooper` → `enemy-camo_normal`. A name-match across the two lists reports
mismatches that are not real. `enemy_chassis.py` is the shared frame, not a
body. **Three of those five arrows no longer describe a SHIPPED file** —
`enemy_skimmer`, `enemy_tender` and `enemy_tun` have all lost their TARGETS
rows to imports, and `enemy_cooper` still has its row but no longer draws the
Camo Normal, which now wears the `normal`'s body. The arrows are kept because
they are still what the naming convention IS, and the convention is what this
paragraph is for; read TARGETS for what is built.)

This is the contract. A model that meets it needs no
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

**1b. In the projected overlay, z is a height above the BOARD — and who owns
the reference decides whether a thing bends.**

`project()` adds the ground height under the point, so a range ring, cone or
fissure drapes over a raised deck instead of cutting through it. That is right
for a decal lying on the board and **wrong for anything rigid or airborne**: a
rail cannon's coils, muzzle and discharge are spread along a barrel that
overhangs the deck edge, and sampling under each of them bent the weapon into a
curve. A shot did worse — it inherited the terrain profile and flew a ski jump.

So a caller that owns one object pins the reference for everything it draws with
`withGround(z, fn)`:

- **tower hardware** — the height the TOWER stands at, so a weapon stays rigid
  however far it overhangs;
- **a shot** — one reference per round, eased between the ground it left and the
  ground its target is on, which is a straight line aimed at the target;
- **a recruit** — its own, because it walks its own patch of road;
- **ground decals** — no pin at all; per-point sampling is the point.

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

**3b. The REST frame must be the model's tallest — or everything drawn ABOVE the
model gets drawn INSIDE it.**

Clause 3 stores each animated group's geometry in its group root's local space
and poses it with a per-frame 4×4. `GLModels.expand` (`js/gl/gl-models.js`) sets
`model.top` from the largest **raw** z in that stored geometry, *before* any
frame transform is applied — despite the comment above it, which claims the
model's real top. `crownOf` (`js/gl/gl-world.js`) then places the health bar,
the hover readout and the occluder capsule at that height plus 10 board px. So a
group root whose rest frame *lifts* its geometry makes the model under-report
its own height by exactly that lift, and the readouts land inside the mesh.

Clause 6 governs where the ORIGIN sits. This governs the animated group ROOT,
which is a different node and a different failure: a model can satisfy 6
perfectly — flush foundation, feet at z = 0 — and still bury its own health bar
the moment it is rigged.

**The condition**, for every animated group `g`, with `R` the model's rest
frame:

    (max z of frames[R][g] · v  −  model.top) × unitsToPx × scale  ≤  10

`scale` is the actor's own — `radiusPx() / 11`, which is the type's `sizeScale`,
for an enemy; 1 for a tower. Whatever the left-hand side exceeds 10 by is how
many board pixels the health bar is drawn *inside* the body.

**The gate is `tools/check-model-top.js`.** It reads the exported model data and
needs no browser and no runtime. Run bare it covers the enemies, and three of the
five fail it today. **Read `--all` with care: it sweeps EVERY frame, which is
stricter than this clause**, so it reports nine — and four of those nine
(`warbringer-a4`, `-a5`, `blub-superb`, `sniper-b3`) are clear at rest and are
only over the line mid-swing, which this clause allows. The bare enemy run and
the rest-frame condition happen to agree today because no enemy rises above its
own rest pose.

Three things about the condition, each of which has already caught someone:

- **The REST frame, not the worst frame.** A Warbringer's A5 hammer stands 25
  board px higher mid-swing than at rest; pinning the bar to the swing would
  leave it hanging in empty air in the pose the tower holds most of the time.
  The contract is about the pose the actor is usually in, and "the model's true
  top" is ambiguous for anything that swings.
- **The scale term.** The same rig passes on a small type and fails on a large
  one, because the error is multiplied by `sizeScale` and the 10 px of headroom
  is not.
- **It is not an enemy problem.** Towers reach the same code through
  `towerCrown` at scale 1 and are affected in exactly the same way.

**How to meet it, and this is the form the five Easy bodies are built to:** the
animated group root that owns the topmost geometry sits at **z = 0 with identity
rotation at frame 1**. Its local space is then world space, the raw maximum z is
the true maximum z, and the defect cannot occur — by construction rather than by
margin, which is the difference between a rule and a tolerance. Limb roots stay
at their joints; a limb hangs down and never owns the top.

**The root's position is not the proof, though.** That root still translates for
the walk bob, so quote the margin from `tools/check-model-top.js`, which sweeps
every frame, and never from the root's own z.

**AND THAT RECIPE ASSUMES A BODY THAT NEVER LEAVES THE GROUND. One does.** The
Fractal Slime jumps: it rises 0.2025 u above its rest pose twice a second, so a
root at z = 0 reports the RESTING crown and the health bar is swallowed at every
apex — 6.4 board px inside a T1, 15.5 inside a T5 — with **nothing reporting
it**, because the bare enemy run of the gate reads the rest frame and the clause
above allows a rise. The condition is what has to hold; the recipe is one way of
meeting it, and for an airborne body the way is a PAIR of nodes per group:

- `hop_<g>` — the animation (translate, lean, uniform scale), and **the identity
  at frame 0**;
- `<g>` — the exported group, a fixed child at **z = −RISE**.

`td_mesh.build` stores geometry as `inverse(matrix_world at frame 0) * world`,
so the −RISE and the stored +RISE cancel: the drawn pose at frame f is exactly
`hop(f) * world`, every rotation and scale still pivots where it was authored,
and `model.top` becomes the crown of the body AT THE TOP OF ITS JUMP. **RISE is
measured, never typed** — pose every frame, take the highest vertex — which is
what makes the gate report a margin of exactly 10.0 px at every instance scale
instead of approximately. `tools/blender/enemy_slime.py` is the worked example.

The cost is real and belongs with the rule: at rest the bar floats RISE above
the crown, and `bodyTopOf` — the Siphon's occluder capsule — is that much too
tall. That is the good direction to be wrong in for a bar and the bad one for an
occluder, and over-occlusion photographs as success.

**A FRACTAL'S `sizeScale` ROW IS NOT ITS DRAWN SIZE, and both gates were reading
it as one.** `sizeScale` is per TYPE; a fractal carries `fractalSizeScale =
minSizeScale + tier * sizeStep` per INSTANCE and `radiusPx()` multiplies the
two, so the Fractal Slime's row says 1 while a T5 draws at **2.40**. Every
figure in `check-model-top.js` and `check-gait-slip.js` is multiplied by the
scale, so quoting the row under-reports a real miss by 2.4× on the tier the
player meets at wave 25. Both now grade the worst tier — the first by deriving
it from the type's own three fields, the second from its table.

**The worked example, chosen because it has no hidden multiplier.**
`enemy-normal` carries 0.620 u of group-root lift; × 31.8032 `unitsToPx` ×
`sizeScale` 1 = 19.72 board px, against 10 px of headroom. Its health bar is
therefore drawn 9.7 px inside its own body.

**As of 2026-08-13 the runtime side is NOT repaired, and this clause is the
model-side contract that holds until it is.** Teaching `model.top` to read
rest-frame posed geometry belongs to the rendering division, is not authorised,
and is gated on a measurement: `crownOf` also feeds `bodyTopOf` and the Siphon
occluder capsules, so making a body taller makes its occluder taller, and
over-occlusion photographs as success. The models that predate this clause, and
by how much each misses, are listed in the CHANGELOG entries for 2026-08-13 —
a dated reading, which is why it is recorded there and not here.

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

**AND THE HARDER CONSTRAINT NOBODY HAD WRITTEN DOWN: COLOUR IS PER-FACE, AND
NOTHING CAN BE DRAWN *ON* A FACE.** There is no texture path in this pipeline at
all — `td_scene.material()` takes a colour key, emission, roughness and metallic,
and there is no UV unwrap, no image texture and no decal route anywhere in
`tools/blender`. Every surface is a flat palette colour, and the mesh export
carries rgb plus emission per vertex and nothing else. **So a marking is
GEOMETRY or it does not exist**: a hull number, a stencil, lettering, wear, a
painted-over patch are all unbuildable as described, and at enemy scale they are
unresolvable as geometry too. Brief the shape, never the paint. (Verified
2026-08-13. Note `roughness` and `metallic` reach the *sprite-render* path only —
the runtime shader has no input for either.)

**How to check it is section 4 of `tools/blender/HOUSE-STANDARD.md`**, which
carries the instrument, the thresholds and the worked palettes. It is deliberately
not repeated here: that measurement has been retracted and re-ruled repeatedly
while this clause has not moved once, so a copy here would be the drifting one.
Note in particular that the CR bands there are **palette-space** bands. That
document cites this clause back.

**8. A weapon must not be inside the body, and PROVE it with solids.**

`tower_warbringer.penetration()` tests the weapon's solids against the body's
solids as boxes, per frame, and fails the build on any overlap. Do not measure
this vertex-to-vertex: two boxes interpenetrate happily with their corners far
apart, and a first version of exactly that check reported 10 mm of clearance
while the haft ran through the man's chest. Exclude the parts that are SUPPOSED
to touch -- hands and forearms on the grip, inlays in the head, the ground under
a rested weapon -- and state why in the code.

**BOTH MEASUREMENT ERRORS ARE NOW REPRODUCED WITH NUMBERS, and they fail in
OPPOSITE directions. Anyone building a penetration check reads these first.**

- **Vertex-to-vertex is blind to interpenetration — a FALSE PASS.** Minimum
  distance between two vertex sets stays positive straight through an overlap,
  because a vertex can sit inside another solid's face while being nowhere near
  any of its vertices. Measured 2026-08-14 on the Tripod's strike at 34°: a
  vertex-set sweep reported **+0.02181 u of clearance** where the solids carry
  **0.0523 u of penetration**. That is this clause's founding failure,
  reproduced by the rendering lead *after reading the clause*, and reported
  against himself. It is the whole reason the mandate says solids.
- **A bare AABB is too fat for a faceted solid — a FALSE FAIL.** The Tripod's
  hub is a 16-gon prism of radius 0.1564 whose axis-aligned box reaches
  **0.221 at the corners**. Test posed vertices against that box and the gate
  goes red on a body that complies, and the natural reading of that red — "take
  the angle lower" — makes a correct model worse. Use the solid, or a hull, or
  accept per-face tests; do not let the bounding volume become the claim.

**A check that fails in the safe direction is not safe.** The false pass ships a
defect; the false fail spends someone's day making a compliant body wrong. Any
new penetration gate is validated against three rows on a real body: **red at
the known-bad, green at the known-good, and silent on a designed abutment.**

Related, and the reason the failure happened at all: a two-handed weapon at rest
belongs OFF the centreline. On the model's own axis it will pass through the
torso in some pose, whatever the numbers say.

**THE CLAUSE REACHES A POSE THE EXPORTER NEVER SEES. Ruled 2026-08-14.** It
covers **any pose the player can be shown**, not only the baked frames, and it
covers **part inside part**, not only weapon inside body — the narrower wording
above is the original incident, not the boundary. The clause says the failure
arrives "in some pose, whatever the numbers say", which is a direct instruction
that a passing measurement does not discharge it; `check_penetration.py` walks
the exported frames because those were the only poses that existed when it was
written. **The instrument narrowed. The rule did not.**

The first body with a live attack pose is **one body under three names, and all
three are needed to find this again**: the Blender script is
`tools/blender/enemy_hedger.py` ("the Hedger"), the enemy type is `angry`, and
the player sees **the Tripod**. Its strike is a per-group `overrides` matrix
composed on top of the baked walk at draw time and is never exported, so
`check_penetration.py` passes it correctly while the drum rim reaches
**0.0523 u into the hub at z 0.595**, from 18° of a 34° stroke, for **47% of
each gesture window** — about 1.1% of a body's time on screen. A body must not
be able to satisfy every gate in the pipeline and still have parts inside each
other for half of every gesture.

**Be careful adding any frame outside the walk cycle to a shipped model, and
know whether the body is banded — the hazard is CONDITIONAL.** `walkBand()`
(`js/gl/gl-world.js:1553`) returns `bands[0]` when the field is present and
validates, and **falls back to the whole strip when it is not**. Inside a valid
band, `bandFrame()` at `:1571` keeps the index within it. So a **banded** body
is protected by construction, and an **unbanded** one is exposed: any frame
added outside its walk cycles once per stride, every frame individually correct
and only the sequence wrong, which a per-frame review passes.

Measured across the fifteen enemy models on 2026-08-14 — **banded, protected:**
`angry`, `armored`, `boss`, `boss_fast`, `camo_normal`, `colossus`, `fast`,
`shieldbearer`, `shielded`, `slow`. **`bands` null, exposed:** `brute`,
`flying`, `hive`, `normal`, `swarm` — exactly the bodies not re-exported in the
batch that introduced the field. The exporter emits `bands` now, so a re-export
is the fix and no body is wrong today. `angry` — the Hedger, the one body with a
live strike — is on the protected side.

Gate poses still belong in a declared band or in a separate export that
`index.html` never loads. **If you choose the separate export, give it an
`ALLOWED` entry in `tools/check-script-manifest.js`** — an unwired model is
exactly what that gate fails the build on, and the wrong repair to that red is
to wire a gate-only model into the shipping page.

**A clean silhouette does NOT discharge this clause, and no render can.** The
clause mandates solids precisely because appearance-based measurement gave a
false pass once — the first version "reported 10 mm of clearance while the haft
ran through the man's chest". "It never breaks the outline" is a statement about
severity, and it is worth having; it is not a clearance.

**Two dispositions only, and the difference matters.** Either remove the
overlap, or DECLARE it under the exclusion above — and an exclusion is a claim
that the parts are *supposed* to touch, by design, stated in code with its
reason, as hands on a grip or the ground under a rested weapon are. **"Small
enough" and "not visible" are not exclusions; they are waivers, and this clause
has no waiver.** Whoever declares one signs the design claim.

**Whatever grows to cover posed geometry must satisfy two things.** The pose
must have ONE source of truth — a Blender-side gate holding its own copy of a
matrix the renderer owns is two copies of the truth and they will drift; baking
the stroke extremes as gate-only frames keeps one. And it must be shown to FAIL
on a real known-bad before it is trusted. A posed check that does not go red on
the body that prompted it has not been shown to work.

**KNOWN VIOLATION, DECLARED, OPEN — this is CURRENT STATE, verified in the
shipping code 2026-08-14.** `js/gl/gl-world.js:1792` carries
`swing: 0.2967060` for `enemy-angry`, which is exactly **17.000°**, and `:1860`
passes it to `GLMath.localPose` as **ry — a rotation**. The file declares the
violation itself at `:1731`. The Tripod does **not** comply at any stroke angle
that reads as a gesture: 2 intersecting triangle pairs, `hold` against
`thigh_2`, first real contact between 7° and 8°, largest clean angle 7°, and
monotonic at ~0.0063 u/deg from 2° to 34°, so no safe pocket exists.

**It is held at 17° deliberately and that is the right call:** 34° is
measurably worse at 5 real pairs against 2. The violation predates the ruling
and the ruling reduced it. Take this entry out when the geometry lands, not
before.

**PROPOSED, NOT LANDED — re-authoring the strike as a recoil.** The implement
has been ruled a gun, so the gesture would become a pure **translation** of
`mast` along its own axis with no rotation. If that lands it removes *this*
overlap by construction — the measured intrusion comes entirely from rotating a
rigid body about its own centre, which lowers one side whatever it raises.
**Nothing about it is in the code yet**, and it does not clear the body: `mast`
also carries the **hold**, slung under the drum in the same place as the hub, so
a slide needs its own per-z-slice sweep of the full travel before anything here
changes.

**This paragraph exists because I corrected this clause to describe the recoil
as current, and it was not.** A design decision was relayed to me and I wrote it
into the operative document ahead of the code. **That is worse than a stale
claim: the code's own header would have looked like the out-of-date thing.**
Record a gesture change here only against a commit sha in `js/gl/gl-world.js`,
never against a description of intent — neither of us can see the other's
working tree, which is exactly why the file has to follow the code.

**Read the ruling on its grounds, not on that instance.** The grounds are the
clause's own text — *"in some pose, whatever the numbers say"* — and every
condition that made the seam dangerous is untouched: `check_penetration.py`
still walks baked frames only, `overrides` still compose live at draw time, and
a body can still satisfy every gate in the pipeline while having parts inside
each other for part of every gesture. **A principle argued from an instance is
not refuted when the instance goes away.**

**AND THE BODY IS UNPROVEN, NOT CLEARED — do not record it as compliant.** A
translation cannot produce *that* intrusion; it can produce a different one
nobody has measured. `mast` carries the **hold**, slung *under* the drum in the
same place as the hub. The drum stays above the hub under a horizontal slide
and is safe by construction; **the hold is not, and it is in the same group.**
A sweep of 0 → 0.12 u per z-slice, every part of `mast` against every part
outside it, is what closes this — a measured number, not the argument above.

**Note what the earlier round cost, because the shape recurs.** The operative
pair turned out to be the holder against a **thigh**, never the drum against
its hub where the original 18° figure came from — **the window everyone argued
over was never the operative one.** A non-monotonic reading that made a safe
pocket look possible was an artefact of a point-set instrument. And "clean by
construction" reached this file having never been measured, inferred from a
threshold found on a *different pair*.

**That makes THREE states, not two, and only the middle one is a loophole.**
Compliant; **declared violation** — measured, owned, dated, and visible like
this one; or a declared **exclusion**, which is a claim that the parts are
*supposed* to touch. A known violation is honest. An exclusion asserting design
intent over an overshoot is not.

**Checks before calling a model done:** `--validate-riflemen` (or its
equivalent) passes; `--frame-riflemen` reports the ortho actually used;
`tools/check-model-top.js` passes (clause 3b) and `tools/check-model-tags.js`
passes — a model with no `<script>` tag throws nothing, draws as the fallback
sphere and keeps all six suites green, so nothing else can see it; the model
loads in `index.html` with no console errors; and, for anything with a
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

## `bands` — which frames are the walk, and which are a state pose

A model may declare `bands: [[first, count], ...]`, one pair per band. **Band 0
is the walk or default cycle**; any state bands follow it. The exporter emits it
for **enemies and recruits**; it is deliberately absent on blubs, summoners and
towers, whose layouts the exporter does not model.

**ABSENT OR `null` MEANS "THE EXPORTER DID NOT DECLARE THIS MODEL'S LAYOUT",
NOT "this model is unbanded", and the fallback is the whole frame list.** Those
two readings are identical today and stop being identical the moment a family we
do not emit for gets banded. Five of the twelve enemy and recruit models rely on
the fallback right now — `enemy-normal`, `brute`, `flying`, `hive`, `swarm` —
because they have not been re-exported since the field landed; the other seven
declare an explicit `[[0, n]]` that means exactly the same thing.

**TWO OF THE THREE WRITERS EMIT IT NOW.** `export_mesh.py` always did.
**`tools/glb_to_model.py` does since 2026-08-26**, but only for a rig that
declares more than one cycle — a single-cycle import emits no `bands` at all, so
the seven that predate the change reproduce byte-identical. `tools/blender/
td_mesh.py` still does not, and should not: it writes towers, blubs and
summoners, which are the families the field is deliberately absent on. So an
IMPORTED enemy with one gait, and `enemy-fractal_slime`, ship without it for a
reason that has nothing to do with re-exporting, and a re-export is NOT the fix
for them.

It is correct on all of them today, because each ships exactly one cycle and the
fallback is the whole strip. What it costs is that they are exposed to the
hazard clause 8 records: a frame added outside the cycle would cycle once per
stride, every frame individually right and only the sequence wrong. When one of
those bodies needs a state pose, the fix is to teach its WRITER the field —
never to hand-edit a generated file.

**Measured 2026-08-26.** `bands` present: `angry`, `armored`, `boss`,
`boss_fast`, `boss_fast-shattered`, `camo_normal`, `colossus`, `shielded`,
`slow`. Absent: `brute`, `fast`, `flying`, `fractal_slime`, `healer`, `hive`,
`midboss`, `normal`, `revenant`, `revenant-undead`, `shieldbearer`, `swarm`.
`fast` and `shieldbearer` moved from the first group to the second on 2026-08-18
without losing anything: both were REPLACED by imports, and the writer changed
under them. **`boss_fast` moved BACK on 2026-08-26**, and it is the only row
that has ever done so — it was replaced by an import too, and that import
declares two real bands.

**A PAIR, NOT A LENGTH, and the reason is a defect this replaces.** Two
incompatible arithmetics already coexist in `gl-world.js`: enemies index frame 0
as a walk frame, while blubs and summoners reserve it as a rest pose and count
from `frames.length - 1`. A bare cycle *length* cannot say which applies, and
guessing wrong does not throw — it draws a plausible body on the wrong frame of
the wrong band. A pair leaves the reader nothing to derive.

**`GLModels.register` MUST COPY IT.** It builds its model object from an explicit
field list, and when `bands` was missing from that list the field shipped on
eight bodies while `m.bands` was `undefined` on every one of them. A reader
written only in `gl-world.js` would have taken the absent-fallback thirteen
times, changed nothing, and passed a null control perfectly. **Any new field on
the model contract has to be added in two places or it is decoration.**

**Acceptance for a change to the reader** is two gates, not one, because every
band in the tree is currently `[[0, frames.length]]`: a **regression null**
(as-shipped versus stripped versus explicit whole-list, bit-identical across
every registered body — 12 × 3 bearings at worst 0 px) proves nothing broke, and
a **synthetic positive** (a band that is not the whole list, injected at runtime,
asserting the walk never presents the state pose) is the only thing that
exercises the feature at all. The first alone passes a reader that ignores the
field entirely.

**`bands[n][0]` HAS A CALLER SINCE 2026-08-26, and it is the Vanguard.** This
paragraph read "no caller yet ... ships unexercised by real geometry until the
first genuinely banded body lands" for eight days. That body has landed:
`enemy-boss_fast` and `enemy-boss_fast-shattered` each declare `[[0, 16], [16,
16]]`, and `gaitBand` in `gl-world.js` addresses band 1 whenever the boss is
inside its opening sprint.

**BAND 1 IS A SECOND GAIT HERE, NOT A STATE POSE, and the field turns out to be
the right shape for both.** A state pose is addressed once and held; a second
gait is a second CYCLE, driven by the same distance drive as the first. Nothing
in the contract had to change for that — a pair is a pair — but the acceptance
argument above did: a second band that is a cycle can SKATE, and the
whole-list-fallback null cannot see it. `tools/check-gait-slip.js` now grades
**every declared band** (one row per band, `--band N` for one), which is the
gate that catches it. Grading band 0 twice and reporting a library sweep is
exactly the failure this document warns about elsewhere: an instrument that has
only ever returned one answer has not been tested.

**WHICH BAND A BODY IS IN IS A SEPARATE QUESTION FROM WHICH BANDS EXIST, and
they are two functions on purpose.** `walkBand(model)` answers the second and
cannot answer the first — a model does not know how far down the road the thing
wearing it has come. `gaitBand(model, enemy)` answers the first, off
`ENEMY_GAIT_BAND`, a table of type id → predicate. It is a **predicate and not a
flag name**, which is the one place it differs from `ENEMY_VARIANT`: `isSprinting()`
is `progress < ul(sprint.untilUl)`, a comparison against where on the MAP the
body is, and `js/enemy.js` keeps it as a function so the 2D wake, the tests and
the renderer all ask one question rather than keeping three copies of it.
Everything falls back to `walkBand`: a type with no row, a mesh with one band,
or a predicate asking for a band this model does not have.

---

## Tower names: what a tower is CALLED versus what it IS

**2026-07-30.** The roster that day was Smasher, Longshot, Siphon, Soldier and
Gunner. Four of those five were renamed and redrawn for a robot fantasy/magic
theme; the Gunner was the exception, and was deleted later the same day. That
is the roster the table below records — it is a snapshot of 2026-07-30, not the
current build bar, and the Summoner did not exist yet. **Nothing else changed**
— not a stat, not a cost, not a behaviour, not a footprint, not a range.

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
way out. But it IS removed from play: it is not in `BUILD_SLOTS`, not in the
meta catalogue, and no longer the tower the u.l. system is anchored to — the
Rifleman carries the 100 u.l. reference now (`Maps.REFERENCE_TOWER`). What
survives is the file itself, as the shared footprint/hit-test source. Actually
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
| Rendered sheet cache version | `ASSET_VERSION = 14` | js/skins/draw-pack.js |
| Measured rendered `contentTop` | Normal .8438; Swarm .6875; Brute .6937; Hive .5750 (shield-safe); Sniper base .7695, A3 .7539, A4 .5547, A5 .5625, B3 .7383, B4 .6406, B5 .5938 | js/skins/draw-pack.js; printed by tools/blender/td_scene.py |
| Path length | ~1865 u.l. on the reference route | `Maps.referenceLengthUl()` (derived, not declared) |
| Maps | 7: five authored (including the forest board `test`, the only one whose road changes width) plus fixed-seed Shifting Ley and two-route Twin Confluence | `Maps.LIST`, `Maps.DEFAULT_ID`, `Maps.routesOf`, `Maps.profileOf` |
| Map chooser grid | up to 6 routes: 3 columns at 372x240. Past 6: 4 columns, card width fitted to the viewport and height derived from it at 16:9 | `mapGrid`, `mapCardRect` in game.js |
| Map authoring scale | 1.04 px per u.l. | `AUTHORED_AT_PX_PER_UL` in game.js, applied by `Maps.toWorld` |
| Road width | 21.875 u.l. | `ROAD_WIDTH_UL` in game.js |
| Base HP | 100 | `BASE_MAX_HP` in game.js |
| The schedule | 35 waves, 830 enemies, 24 141 scheduled HP / **25 939 effective**, plus each Hive's brood, each Fractal Slime's cascade and the boss's summons. One schedule — selectable difficulties were deleted 2026-08-12 | `EASY_WAVES` in game.js, aliased as `WAVES` |
| Wave clear bounty | a tenth of the wave's effective HP, ~$2 594 across the run | `WAVE_CLEAR_BOUNTY_FRACTION`, `waveBounty`, `waveEffectiveHealth` |
| Wave reward, all in | clear bounty + redistributed opening cash + rising allowance | `waveReward`, `waveProgressionReward`, `waveEscalatingReward` |
| The boss | Tyrant, wave 35, 5000 HP; aimed shot at the highest-DPS tower (45 + 2 s stun, every 12 s after a 1.3 s wind-up); roars at half and adds a 90 u.l. leap | `Enemy.TYPES.boss` |
| Tyrant roar | +1000 shield, ×1.35 speed, intervals ×0.75 (12 s → 9 s), leap unlocked, and 40 bodies / 2780 HP called in at 1.5× — the running mob plus 2 Hives, 3 Shieldbearers, 3 Healers, 2 Colossi | `Enemy.TYPES.boss.phases[0]` |
| Tyrant leap | 90 u.l. jump, 120 u.l. shockwave, 80 damage + 3 s stun to everything it reaches, commits within 220 u.l., 1.5 s wind-up | `phases[0].addAttack` |
| Wave bonus timing | owed on the frame the wave finishes deploying; paid once, by whichever gate closes the wave (`endWave`), with `callNextWave` and `beginWave` as latched safety nets | `pendingBounty`, `waveRewardLatched`, `payWaveBounty` |
| Tower stun | longest wins; no update, cooldown, aim tracking or live Siphon beam presentation while stunned | `TowerHealth.stun / isStunned / tickStun`, `BeamTower.visibleLocks` |
| Waves 1-11 | the introduction, single-type, pinned exactly | `WAVES.slice(0, 11)` — deep-equal test in run.js |
| Wave shape | `{ duration, groups: [ { at, count, interval, type?, health?, tier? } ] }`. `at` is absolute, from the wave's own start; body N lands at `at + N × interval`; groups overlap freely and tie on (group index, body index). No flat form, no `lead`, no wave-level count | `waveGroups`, `waveTimeline`, `waveCount`, `waveSummary` (`waveGroupAt` and the `|| [wave]` fallback were deleted with the sequential scheduler) |
| Wave `duration` | ceiling on the WAVE, from the frame it opens — 30 s to 125 s, at least 26.02 s clear of the wave's own last arrival; expiring keeps the survivors and announces the next wave. Wave 35 has none | `duration` in `EASY_WAVES`, `waveTimeRemaining`, `validateWaveTimelines` in game.js |
| Wave summary key | `(type, health, tier)` — identical salvos sum, unlike ones stay apart; NOT the display name, which merges the whole Fractal ladder | `waveSummary` in game.js |
| Wave gates | three, one exit: eliminated (5 s), `duration` expired (5 s, survivors stay), Send/auto-send once fully deployed (3 s, survivors stay). Wave 35 has none of them | `endWave`, `WAVE_CALL_DELAY`, `WAVE_CLEAR_DELAY`, `callNextWave`, `waveSendReady` in game.js |
| Transition | the gap between two waves — 3 s, 5 s or the 10 s opening pause; never a wait to be sat out. `WAVE_BREAK` is GONE (was 90 s, after the last spawn) | `waveCountdown`, `betweenWaves` in game.js |
| Wave identity | every body carries the 1-based number of the wave that scheduled it; descendants inherit it; 0 = no wave | `waveId` on Enemy, `waveStillOnTheRoad`, `lastDeployedWave` in game.js |
| Run opening | 10 s before wave 1, or the Start button; 0 with auto-send | `RUN_START_DELAY`, `beforeFirstWave`, `waveSkipButtonLabel` in game.js |
| Wave call triggers | inside a transition: the Send button or auto-send, shortening it and never lengthening it. A wave on the clock is ended instead, never shortened | `callNextWave`, `skipNextWave`, `endWave` in game.js |
| Send button availability | live once every scheduled body of the wave in play is out, never before, and never at all on wave 35; ONE predicate read by the drawing, the click and the build preview's chrome test | `waveSendAvailable`, `waveSkipButtonRect`, `overInterfaceChrome` in game.js |
| Wave readout | four states: wave on the road (number / deployed / `s left`), transition (`Wave 8 in 3 s`), final wave (`FINAL WAVE` where the timer goes — wave 35 has no `duration`), schedule spent (survivor count) | `waveStatusText`, `waveTimeRemaining`, `countdownSeconds` in game.js |
| Wave clock | `waveElapsed`, seconds since the wave OPENED (same origin as `at`; for 34 of 35 waves that is also the first arrival — wave 11 opens 4 s before its Midboss); 0 when no wave is in play; the opening pause is not part of wave 1 | `waveElapsed`, `waveInPlay`, `waveFullyDeployed` in game.js |
| Auto-send waves | off by default; sends every wave the frame it becomes sendable (fully deployed), and shortens every transition to 3 s. Never touches an `at`, an `interval` or an arrival | `autoSkipWaves`, `toggleAutoSkipWaves` in game.js |
| Boss banner | a named bar at the top for any type flagged `showHealthBanner` | `drawBossBar`, `bossBarEnemies` in game.js |
| Game speed | 1x / 2x / 3x in the game, **1/2/3/5/10/20 in the sandbox**, cycled from the bottom-right button, not run state. The sandbox APPENDS to the same array rather than replacing the button, so speed stays applied in exactly one place | `GAME_SPEEDS`, `gameSpeed`, `cycleGameSpeed` in game.js; `installSpeeds` in sandbox.js |
| Speed button chevrons | capped at 3; the NUMBER is the precise statement, so 10x reads as three chevrons and "10×" rather than a bar of arrowheads | `drawSpeedButton` |
| Sandbox base HP | **100 000**, against the game's 100, so a leak is a reading rather than an ending. Moves `BASE_MAX_HP`, so it survives every restart | `installBase` in js/sandbox/sandbox.js |
| Run-over buttons | Restart (R/Enter), Choose another route (M), Main menu (Escape) | `restartButtonRect`, `changeMapButtonRect`, `mainMenuButtonRect` |
| Victory | all waves naturally deployed + the WHOLE road clear, descendants and earlier-wave stragglers included + base standing | `allWavesDeployed`, `victory` in game.js |
| Wave banner | 2.4 s, on each wave's first spawn | `BANNER_SECONDS` in js/effects.js |
| Sound | 8 synthesized effects, no files, no fetch; created on the first user gesture | `SoundSynthesizer`, `Sound` in js/game.js |
| Default mix | master 0.7, effects 1.0, music 0.8 (fed by nothing), not muted, not saved | `SoundSynthesizer` constructor |
| Volume presets | Quiet 0.3 / Normal 0.7 / Loud 1.0 — master only, so a mix the player made is not thrown away | `SOUND_PRESETS`, `applyPreset` |
| Polyphony cap | 28 voices; ≤3 simultaneous death explosions; worst-case measured peak 0.70 at the master output | `SOUND_MAX_VOICES`, `claimVoices`, `playEnemyDeath` |
| Low-health alert | arms at 25% of BASE_MAX_HP, disarms above 32%, repeats every 9 s; klaxon AND a pulse behind the HP readout | `LOW_HEALTH_FRACTION`, `LOW_HEALTH_CLEAR_FRACTION`, `LOW_HEALTH_REPEAT`, `updateLowHealthAlert`, `drawStatus` |
| Mute | the panel's toggle or `M` **on the board only** (`m` is "change route" on the loss overlay) | `Sound.toggleMute`, `onKeyDown`, `drawAudioPanel` |
| Enemy roster | 21 types, all 21 scheduled, including the flying Aether Wisp | `Enemy.TYPES`, `EASY_WAVES` |
| Enemy mechanic blocks | `attack`, `shield`, `revive`, `spawns`, `phases`, `support`, `sprint` — data, never a branch on the id | `Enemy.TYPES`, and one method per block |
| What a shield pays | **nothing, ever** (2026-07-30). Healed HP too. Only health pays | `Enemy.takeDamage`, `Enemy.bounty` |
| Bulwark | 12 HP + 24 shield (ratio 2), ×2 speed when the shield breaks, **and a second mesh from that moment on** | `Enemy.TYPES.shielded`, `shieldBroken`, `ENEMY_VARIANT` |
| Vanguard's shield | 100 every 7 s, non-stacking, granted to ITSELF. A break swaps in the shattered mesh, throws the fragments onto the road and pulls them home again, and the mesh swaps BACK when the pool refills | `Enemy.TYPES.boss_fast.support`, `shieldOut`, `shieldReformProgress`, `ENEMY_VARIANT`, `shardPose` |
| Vanguard's two gaits | a dash for the opening 400 u.l., a bound for the rest — two `bands` in one mesh, both distance-driven | `Enemy.TYPES.boss_fast.sprint`, `isSprinting`, `ENEMY_GAIT_BAND`, `gaitBand` |
| Revenant | 16 HP, revives once to full and roots where it fell | `Enemy.TYPES.revenant` |
| Hive | 150 HP, ordinary, pays normally | `Enemy.TYPES.hive` |
| Hive brood | 5 normals every 7 s, each with a shield equal to its life and paying $0 | `Enemy.TYPES.hive.spawns` |
| Shieldbearer | 60 HP, ×0.45; +20 shield to the 10 strongest every 10 s, STACKING. Normal/Hard | `Enemy.TYPES.shieldbearer` |
| Shieldbearer hover | 0.55 radii off the road, broadcast turning at 0.18 Hz | `Enemy.TYPES.shieldbearer.hover` |
| Shieldbearer tether | 1.8 s per cord, `rgb(150, 214, 255)`, bowed 0.34 of the span, 3 plates | `Enemy.TYPES.shieldbearer.support.tether` |
| Healer | 200 HP, ×0.4; 15 HP/s for 4 s to the 3 most wounded every 8 s. Normal/Hard | `Enemy.TYPES.healer` |
| Healer hover | 1.25 radii off the road, rings turning at 0.32 Hz | `Enemy.TYPES.healer.hover` |
| Healer tether | 1.4 s per cord, `rgb(142, 232, 255)` | `Enemy.TYPES.healer.support.tether` |
| Vanguard (fast boss) | 750 HP; ×3.5 for the first 400 u.l. then ×1.75; 100 shield every 7 s, no stacking. Normal/Hard | `Enemy.TYPES.boss_fast` |
| Camo Heavy | 20 HP, ×0.65, camo, 5 flat armor + 20% defense. Normal/Hard | `Enemy.TYPES.camo_heavy` |
| Brood trail | 12 u.l. between hatchlings, back along the road | `Enemy.BROOD_TRAIL_UL` |
| Enemy lane offsets | a 32-bit hash of the spawn index, ±7 u.l. | `Enemy.laneOffsetFor`, `Enemy.LANE_SPREAD_UL` |
| Tower HP | Rifleman 80 (145 with B1+B2), Warbringer 150, Arcane Sniper / Siphon from their stat tables (the deleted gunner was 60) | `Soldier.BASE_HP`, `Smasher.BASE_HP`, `config.base.hp` |
| Angry attack | 20 damage, 47.5 u.l. reach, every 2.5 s, nearest tower only | `Enemy.TYPES.angry.attack` |
| Meta payout | ladder on waves FINISHED: 10/15/20/25/30 → 5/10/18/28/40, a clear **replaces** it with 80; plus one-time 11/20/25/30 → 10/15/20/25 and 25 per first route clear | `MetaProgress.repeatableCoins`, `awardRun` |
| Store prices | Arcane Sniper 40 coins, **Summoner 90**, Siphon 150; Warbringer and Rifleman are the starting kit | `CATALOGUE` in js/meta.js |
| Save key | `towerDefense.meta.v1` in localStorage | `MetaProgress.STORAGE_KEY` |
| Default enemy HP | 4 | `Enemy.BASE_HEALTH` |
| Enemy speed | 50 u.l./s (~37 s crossing) | `Enemy.BASE_SPEED_ULPS` |
| Enemy lane spread | ±7 u.l. off the centreline, deterministic hash | `Enemy.LANE_SPREAD_UL`, `Enemy.laneOffsetFor` |
| Enemy gameplay radius | 11 px × the type's `sizeScale` — swarm 0.55 is the smallest, boss 2.4 the largest, and a type that declares none counts as 1. A fractal split multiplies again by its own `fractalSizeScale`. This is the hit test, the rings and the 2D body; on the 3D board it scales the mesh but is not the mesh's drawn extent — see the sprite-extent note in Enemies | `Enemy.RADIUS_PX`, `Enemy.prototype.radiusPx` |
| Camo detection | Arcane Sniper **A1** (not B — see the naming section), Siphon B1, **Rifleman B3** — nothing else has it | `seesCamo` |
| Flying eligibility | fail-closed: Arcane Sniper at base and Siphon A4 can target flyers; flat towers cannot unless `seesFlying` is explicit | `Targeting.sees`, `RangeFilter.canTarget` |
| Defence pierce (flat) | Rifleman B4 only: 10 percentage points off `defense`, clamped at 0 so it is never a damage bonus. Nothing pierces flat armor | `Mitigation.mitigate`'s 4th argument |
| Targeting modes | first, last, weakest, strongest, fastest, nearest | `Targeting.MODES` in js/targeting.js |
| Reference range | 100 u.l. — the yardstick the whole u.l. system is anchored to. Carried by the Rifleman since the gunner was deleted | `Soldier.BASE_RANGE_UL`, `Maps.REFERENCE_TOWER` |
| Shared footprint | 11.25 u.l. radius — Warbringer and Rifleman both take it from here | `Tower.FOOTPRINT_RADIUS_UL` |
| Elevation | one number per tower, read once at construction: what it sees OVER and +1% reach per 1.6 u.l. **Every one of the five types carries it** — the two adapters did not until 2026-08-27 | `groundHeightUnder`, `elevatedRangePx`, `RangeFilter.sightClear` |
| Tower reach shape | `{ radius, inner, aim, arcRad, full }` — the one reconciliation of the Warbringer's wedge, the Sniper's cone and everything else's circle. Read by the renderer AND by the blind-spot clip | `towerReach` in js/tower.js |
| Tower click target | a **dome** at the feet at the full footprint radius, plus a **cylinder** to the top of the mesh and no higher at half of it. Nearest to the camera wins; a summon beats a tower. The world-space footprint test is the flat board's rule and the fallback | `pickTower` / `towerAt` in game.js, `Tower.HIT_SHAFT_FRACTION`, `World3D.towerTopOf` |
| Where the cursor lands | the SURFACE under it, not the floor — the ray is walked through the height field's own band, so a stump top is what you point at. Boards with one level skip it entirely | `World3D.screenToWorld`, `OrbitCamera.planeAt` |
| Placement feedback height | draped over the board per point; a stump rim and a tower footprint declare their own (`ring.z`) because they lie ON the edge | `projectRing`, `noBuildRings`, `drawNoBuildOverlay` |
| Blind-spot overlay | red where a reach is held but not seen: ONE path, ONE fill (overlaps merge, never stack), the outline is the UNION's outline (no seams through the middle) and the whole layer is clipped to the reach's own shape | `drawSightShadows`, `coneRing` in game.js |
| What stops a shot | arriving, losing its target, spending its pierce, running out of range. **Not terrain** — sight gates acquisition and nothing gates the round | `js/bullet.js` |
| Bullet speed | 562.5 u.l./s | `Bullet.BASE_SPEED_ULPS` |
| Pierce hit radius | 12 u.l. | `PierceBullet.HIT_RADIUS_UL` |
| Warbringer base | **14 damage every 3.2 s, 40 u.l., 120° = 4.38 DPS** as placed (12 / 3.5 / 37.5 until 2026-08-27) | `Smasher.BASE_*` |
| Warbringer range | 40 u.l. base, **72.5 at A5**, **90 at full B**, 103.75 on the A1+A2+full-B crosspath. A1 +5 and A2 +5 are additive like path B's; only A2-A5 carry absolutes | `Smasher.BASE_RANGE_UL`, `rangeUl` / `rangeBonusUl` in `Smasher.UPGRADES` |
| Warbringer blast | 18.75 u.l. radius, **15 damage, CHAINS, and applies the tower's slow**; fires on ANY kill by the swing (B4) | `Smasher.EXPLOSION_RADIUS_UL`, `Smasher.EXPLOSION_DAMAGE`, `explode()` |
| Warbringer swing order | slow FIRST, then damage, then the burst — a one-shot kill still bursts | `Smasher.prototype.swing` |
| Warbringer earthquake (B5) | map-wide: 3 s movement stun, then 60% slow for 5 s, **45 s cooldown**, no damage; 0.75 s world shake and 2.4 s floor fissures | `Smasher.QUAKE_*`, `triggerQuake`, `Effects.earthquake` |
| Enemy stun | timed, movement only, longest wins — distinct from `rooted` and from a slow | `Enemy.stunTimer`, `Enemy.applyStun` |
| Warbringer cost | **600** (200 before 2026-07-30, 700 until 2026-08-26; this row said 700 until 2026-08-27 and the code said 600) | `Smasher.COST` |
| Warbringer full A | 4600 on top of $600 (**250/400**/600/1400/1950) = $5200, for 65 damage at 3.0 s = 21.7 DPS | `Smasher.UPGRADES` |
| Warbringer full B | 6400 on top of $600 (**250/450**/900/1900/2900) = $7000, for 34 damage at 2.1 s = 16.2 DPS | `Smasher.UPGRADES` |
| Tower HP from upgrades | every tier on both towers carries `hp`; Warbringer 150 → 575 (A) / 700 (B), Rifleman 80 → 380 (A) / 505 (B) | `Smasher.UPGRADES`, `Soldier.UPGRADES` |
| Health tier semantics | GRANTS its delta — it does not heal to the new maximum | `applyUpgrade` on both |
| Warbringer swing animation | base/B 0.2 s; Path A 0.48 s with three overhead afterimages and 1.6 s AoE cracks; damage still lands only at cooldown zero | `Smasher.SWING_SECONDS`, `PATH_A_*`, `swingPose`, `pathAImpact` |
| Rifleman base | 1 dmg x 3 shots / 1.2 s = 2.5 DPS, 100 u.l., 80 HP as placed (upgrades take it to 380 / 505) | `Soldier.BASE_*` |
| Rifleman burst | cycle runs burst-START to burst-START; spacing is shape, not cost | `Soldier.prototype.attacksPerSecond` |
| Rifleman automatic | B3 onwards: 2.5 shots/s, derived from the burst it replaces | `Soldier.BASE_AUTO_SHOTS_PER_SECOND` |
| Rifleman A damage ladder | 1 / 1 / 2 / 4 / 8 | `Soldier.UPGRADES` |
| Rifleman A5 | 8 dmg x 5 shots / (34/60) s = 70.6 DPS | `Soldier.UPGRADES` |
| Rifleman B5 | 20 dmg @ 2.5/s = 50 DPS (3.0/s and 60 with A1+A2), plus 4 recruits at 7.5 DPS each while alive, 45 s cooldown | `Soldier.UPGRADES` |
| Rifleman full A | 6400 on top of $300 (200/325/700/1900/3275) = $6700 for 70.6 DPS | `Soldier.UPGRADES` |
| Rifleman full B | 7200 on top of $300 (200/350/750/2100/3800) = $7500 | `Soldier.UPGRADES` |
| Rifleman cost | 300 | `Soldier.COST` |
| Rifleman footprint | 11.25 u.l. — the gunner's, so it stands where a gunner can | `Soldier.FOOTPRINT_RADIUS_UL` |
| Recruits (B4) | 2 per press, 0.25 s stagger, 45 s cooldown; drawn as smaller automatons | `Soldier.RECRUIT_*` |
| Recruit stats (B4) | 1 dmg @ 2/s, 20 HP, 100 u.l., walks END → START at 40 u.l./s and stops to shoot | `SoldierRecruit` |
| Recruit stats (B5) | 4 per press, 3 dmg @ 2.5/s, 40 HP, still a 45 s cooldown | B5 `recruitBoost` |
| Recruit contact | mutual, out of a pool: each body costs what killing it is worth (`armor + hp / (1 − def%)`), capped at what the recruit has left | `SoldierRecruit.takeContactDamage`, `contactCostFor` |
| Recruit hover | HP and range under the cursor plus a violet range ring; yields to enemy hover | `recruitAt`, `drawRecruitHover` |
| Auto-ability switch | pill in the ability button; OFF by default, not saved, no safety guard | `AutoAbility` |
| Towers with auto | Rifleman `recruits`, Arcane Sniper B5 `ability`; not Sniper cone re-aim | `AutoAbility.attach` call sites |
| Defense cap | 99% | `Mitigation.DEFENSE_CAP` |
| Siphon base | 1 AD x 10/s, 75 u.l., 1 target | `TowerConfigs.beam.base` |
| Siphon cost | 800, unchanged (full A 33 800, full B 17 900) | `beam.config.js` |
| Siphon beam origin | TWO ORIGINS, and only the 3D one executes in the shipping build. **3D (what the player sees):** the hands on base/A1/A2 and on the whole of path B, the sceptre's RING from A3 — and the ring is carried by the hand, so the A3/A4/A5 rows give a different point on EVERY ANIMATION FRAME, up to 0.23 model units from frame 0, while base/A1/A2 are 25 identical copies of the hands. A model-space `[x, y, z]`, placed by the tower's aim and `unitsToPx`. Path B has no rows by contract and pours from the static hands. **2D:** the spout, a screen-space `{x, y}` 8 px + 0.86 x footprint above centre — beams rise out of the basin. **Keep it, but do not read it as live:** it is the Siphon's ONLY 2D origin, since the draw pack registers nothing for `siphon` (nor for `smasher` or `blub`), and it does NOT run in the shipping configuration, because `World3D.drawWorld` replaces the whole layer that would call any tower's `draw()`. Measured: zero calls across five real draws | 3D: `SiphonFXBeam.originPoint` / `originWorld` over `SiphonBeamSpec.originFrames`, frame from `SiphonFXBeam.animFrame`. 2D: `BeamTower.prototype.spoutPoint`, reached only when `World3D` is not drawing |
| Death denial knockback | 500 u.l. along the path | `DeathDenial.KNOCKBACK_UL` |
| Rewind animation | 1.4 s, simulation frozen | `DeathDenial.REWIND_SECONDS` |
| Charge decay | 1 charge / 3 s, continuous, out of combat | `charge_to_gold.decaySeconds` |
| Gold scaling ceiling | 50 000 gold (5 tiers, cap x10) | `GoldPower.MAX_SCALING_GOLD` |
| Death denial gate | 5 000 HP healed, pooled across all towers | `beam.config.js` B5 `unlockCondition` |
| Sell refund | half of everything spent, less anything sunk | `SELL_REFUND_FRACTION`, `sellValue()`, `unrefundableSpent` |
| Starting cash | 600 (was 20 before 2026-07-30); buys two Riflemen. BUILD prices were deliberately not touched by the 2026-08-01 repricing, to keep that true | `STARTING_CASH` |
| Combat income | each body's authored kill bounty, paid once on final death | `Enemy.TYPES[*].bounty`, `Enemy.bountyOf`, `Enemy.prototype.bounty` |
| Cash per damage | **gone since 2026-07-31.** Damage pays nothing | — |
| Redistributed opening cash | $5000 across waves 1-34 (+$148 on 1-2, +$147 on 3-34) | `WAVE_PROGRESSION_REWARD_TOTAL`, `waveProgressionReward` |
| Rising wave allowance | $50 on wave 1, +$5 per wave, $215 on wave 34, $4505 total | `WAVE_ESCALATING_REWARD_BASE`, `WAVE_ESCALATING_REWARD_STEP` |
| Easy run purse | $35 686 = $22 987 kill bounties + $2 594 clear bounties + $5 000 redistributed + $4 505 allowance + $600 stake. The last three are wave-NUMBER-only and do not move with the schedule; $9 505 of that is the wave-number rewards, $10 105 including the stake | asserted in `tests/run.js` |
| Sell refund | half, rounded up | `SELL_REFUND_FRACTION` |
| Summoner | $450, 100 HP, 75 u.l. range, 25 u.l. footprint; plants a Blub I every 20 s and never fires itself | `BlubTower` in js/blub.js |
| Summoner full A | $52 100 all in, 5 550 tower HP, 250 u.l. range; three summon lines and Coagulation | `BlubTower.UPGRADES` |
| Summoner full B | $17 250 all in with the A1/A2 gate, 1 805 tower HP, 150 u.l. range; Mechablub MK2 + SuperBlub | `BlubTower.UPGRADES` |
| Blub ammunition | hit points ARE charges: one per attack, dead at zero. A Blub I makes 10 attacks for 20 damage | `Blub.prototype.resolveAttack` |
| Blub placement | a seeded-random point in the tower's range, else the free point nearest the road. NO ROOM holds the bar full and places on the first step a space opens | `findSpawnPoint`, `findRoadSpot`, `update` |
| Summon interval floor | 0.5 s, after path B's cumulative −5 s | `BlubTower.MIN_INTERVAL_SECONDS` |
| Swarm buff | +5% damage and attack speed per OTHER living blub of the same tower; cap +50% (A2), +100% (A4) | `BlubTower.swarmBonusFor` |
| Weakening debuff | +0.1% damage taken per blub hit, 5 s each, independent expiry, cap +100%, ALL sources | `DamageAmp`, applied in `Enemy.takeDamage` |
| Hungry Blub | 4% COMPOUNDING per attack; 1473 damage across its 35 charges (the brief's prose says additive — see its section) | `BlubTower.UNITS.hungry` |
| SuperBlub | a free piercing lance every 10th attack, 400 fixed damage; 51 charges buys exactly 5 | `BlubTower.UNITS.superb` |
| Mechablub MK2 | on death it hops to the nearest enemy and detonates for a fixed 250 in 25 u.l. | `BlubTower.UNITS.mecha2` |
| Coagulation | 300 s; merges every living blub's CURRENT charges and raw damage into one monster blub. T0-T2 stands beside the tower, as near the road as it can get **without leaving the tower's range**; T3+ stands ON it | `BlubTower.prototype.coagulate`, `findRoadSpot` |
| Panel shortcuts | while a panel is open: **X** sells, **O** buys the next path A tier, **P** the next path B tier. Delete/Backspace still sell. None is a camera key; all go through the real button | `onKeyDown`, `pressUpgradeButton`, `drawKeyHint` |
| Monster tiers | T0 <500, T1 500, T2 1000, T3 4500 (fuses the tower, targetable, +1/kill), T4 **exactly 7777** (stun-immune) | `BlubTower.MONSTER_TIERS` |
| Summons and enemies | never targeted (`isSummon`), but a LEAP's shockwave still stuns them | `Enemy.attackCandidates`, `Enemy.resolveAttack` |
| Destroyed footprint | released the instant HP hits zero, before the sweep — one rule for every tower | `whyCannotBuild`, `BlubTower.spotIsFree` |
| Blub rail | one grey box per summon line beside the panel: a bar that fills to the next spawn, the seconds, and how many of that type are alive. LIT while producing, DIM when not | `BlubTower.railLines`, `inspectionLayout` `.rail`, `drawBlubRail` |
| Blub rail click | left click STARTS OR STOPS that line, from A3 on; below A3 it is refused. Base stats are on the HOVER card. A fused tower has no rail | `clickLine`, `railBoxAt`, `blubTypeCard` |
| Sandbox speeds | 5x, 10x and 20x appended to the shipping ladder, so the button cycles 1/2/3/5/10/20. The chevrons cap at three; the number is the statement | `SANDBOX_SPEEDS`, `installSpeeds` in js/sandbox/sandbox.js |
| Sandbox base HP | 100 000, against the game's 100, and it survives a restart because the CONSTANT moves | `SANDBOX_BASE_HP`, `installBase` in js/sandbox/sandbox.js |
| Blub removed by hand | selling one through its panel takes it out of the fleet, the pooled HP, the swarm buff and the next merge | `sellTower` -> `Blub.onRemoved` -> `isDestroyed` |
| Summon clock vs cycle | a tier that shortens an interval clamps the running timer to it -- from applyUpgrade, NEVER from recalcStats | `BlubTower.clampTimersToCycle` |
| Compact panel actions | `action.compact` — 34 px, two per row, so six action rows still fit | `inspectionLayout` in game.js |
| Build slots | 5, and **six TYPES since 2026-08-27**: the armoury picks which five of the owned types are equipped. A sixth SLOT is still an unmade decision | `BUILD_SLOTS` in game.js, `MetaProgress.SLOT_COUNT` |
| Tower prices, all six | Rifleman $300, Summoner $450, Warbringer $600, Siphon $800, Arcane Sniper $900, **Farm 1200 mana** | each type's `COST` |
| Farm | 1200 mana, 200 HP, 35 u.l. footprint (25 at C1), no reach until path B. 200 mana a wave | `FarmTower` in js/farm.js |
| Farm path A | +50/+150 mana a wave, then a TICK that replaces the per-wave figure (50/75/150 every 5 s), a private stock from A4 cloning 5% a wave (cap 1000, then 3000), and A5's investment in whole 10 000 tranches | `FarmTower.UPGRADES`, `produce`, `cloneStock`, `invest` |
| Farm path B | the base's MAXIMUM grows +15/+35/+100/+100/+200 a wave and never heals; a circle of 150/200/300 u.l. that pays for kills inside it and, from B4, slows and amplifies. B5 executes under the higher of 10 HP and 5% | `baseMaxHp`, `growBaseMaxHp`, `Farms.fieldAt`, `Farms.executes` |
| Farm path C | every C3+ joins ONE network: B is the sum of nominal productions, P is what the dice batter and what the next wave pays. C3 rolls one d20, C4 two, C5 three d22 | `Farms.network`, `FarmDice` |
| Farm uniqueness | one B4-or-B5 on the map (not one of each), and one C5 | `unique` on the tier, `Farms.uniqueHolder` |
| Tower prices | Rifleman $300, **Summoner $450**, Warbringer $700, Siphon $800, Arcane Sniper $900 — BUILD prices; upgrade paths cost $5200–$7500 (Warbringer, Rifleman), $15 150–$51 650 (Summoner), $17 900–$33 800 (Siphon), $20 250–$28 575 (Sniper) | each type's `COST`, each `UPGRADES`/config |
| Screens | menu → route chooser (`select`) / index / store → play | `screen` in game.js |
| Pause menu | Escape only, no HUD button | `paused`, `drawPauseMenu` |
| Build slot size | **86 px**, 10 px gap (76 until 2026-08-13; this row was left behind and said 76 until 2026-08-27, while the build-bar section above had 86) | `SLOT_SIZE`, `SLOT_GAP` |
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
