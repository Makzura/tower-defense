# Handoff — tower defense visual pass

Repo: `github.com/Makzura/tower-defense` (public). Everything is on `main`.
Working copy: `C:\Users\Superuser\Downloads\TD_0.5.1`. Last commit `318af95`.

---

## 1. START THESE THREE PROCESSES FIRST

Nothing is observable and nothing is safe without them.

```
node "C:/Users/Superuser/Downloads/TD_0.5.1/visual-pass/autopush.js" 90
node "<scratchpad>/capture-server.js" "C:/Users/Superuser/Downloads/TD_0.5.1/visual-pass/captures"
node "<scratchpad>/static-server.js"  "C:/Users/Superuser/Downloads/TD_0.5.1" 8792
```

* **autopush.js** commits and pushes every 90 s, independent of the agent. The
  owner's power cuts mid-session; a post-commit hook is NOT enough because
  agents write files for 20–30 minutes between manual commits and everything in
  that window was being lost. This is the fix. **Restart it after every reboot.**
* Game URL: `http://127.0.0.1:8792/game/index.html`. Serve over HTTP, not
  `file://` — the preview pane silently ignores reloads on `file://`, and the
  Chrome MCP forces `https://` onto every URL so it can never open a file URL.

## 2. The observation rig

Inject `/visual-pass/harness.js` into the page. `TDObs` gives you:
`boot`, `showcase`, `filmstrip`, `cam`, `shot`, `reinject`, `stats`, `step`,
`perf`, `gpuMs`, `spawn`, `tower`, `maxPath`.

**Cite your viewport with every measurement.** `drawWorld()` calls `resize()`
every frame, so px-per-unit changes silently when the window resizes and two
reviews stop being comparable. Shared reference: **1278×719**, camera target
640/360, distance 2021.363, pitch 0.5944591432292686, yaw −π/2. Force `#game`'s
CSS box rather than resizing the window.

**A capture nobody opened is not evidence.** After `TDObs.shot(name)`, `Read`
the PNG at `visual-pass/captures/<name>.png` and judge what you SAW. The first
Siphon lot arrived as a script that ran cleanly over geometry no one had looked
at, and it was a cone.

## 3. Build and gate commands

```
cd game/tools/blender && python <script>.py            # colour build
cd game/tools/blender && python <script>.py --silhouette   # review only
cd game && node tools/ci-check.js                      # suites vs baseline
cd game && PYTHON=<python> node tools/check-winding.js  # 12 primitives
```

Python 3.12 at `%LOCALAPPDATA%\Programs\Python\Python312\python.exe`.
Blender 5.3 exists but is NOT needed — all new art is `td_mesh` (pure Python).

**Always commit COLOUR builds.** A `--silhouette` build was committed over the
colour models once and shipped 46 grey models; the CI models job caught it.

Baseline: `105/3, 182/30, 70/1, 45/0, 53/0, 2 sandbox`. These pre-existing
failures are documented in AGENTS.md — CI gates on REGRESSION, not perfection.

---

## 4. WHAT WAS DONE

### Rendering bugs found and fixed (each verified by pixel readback, not by eye)

| bug | detail |
|---|---|
| Zone slabs the wrong colour | The skirt was drawn larger *and* proud of the slab, covering its top face. `P.panel` was invisible **everywhere in the game**. Floor-to-slab separation 7.6% → 37.6%. |
| Road had no sides | Both kerb quads wound normals-inward with `CULL_FACE` on, so every kerb was culled every frame. The "raised ribbon" in that file's own header had never rendered. |
| Everything floated / sank | All actors drew at z=0 on a board with real height. Added a height field; lookup costs 0.093 µs. |
| Effects left behind | After grounding, rings/charges/flashes/beams stayed on the floor. Fixed in `project()` so all move together. |
| Rounds below the barrel | Two bugs: pierce shots sampled ground *under the bullet*; `liftUl` is a generic 33 while the a3 muzzle is 42.6 px. |
| **Every sphere inside out** | `td_mesh.ball` 0/120 outward, `GLGeometry.sphere` 0/168. Owner's catch. |
| **Blubs faced 90° off** | Game convention is forward=+X; all new art was authored +Y. Owner's catch. Currently corrected in the draw path by `authoredFrontOffset()` — see §5. |
| **Siphon beam never drew in 3D** | `BeamTower` draws beams in its own 2D `draw()`, and `game.js:2953` wraps the whole 2D layer in `if (!world3D)`. Never ran on any ordinary load. |
| **Fused creature never drew** | `monsterTier` is a NUMBER, not an object. Note both traps: truthiness fails T0, and bare `typeof` matches ordinary blubs which carry **−1** and would have turned all ten units into cylinders. Guard is number AND ≥ 0. |
| Blubs never animated | `gl-world` had no blub frame branch, so all ten cycles were dead weight. Invisible by design — a frozen blub is identical to a correct rest pose. Check with `grep -c BLUB_CYCLE js/gl/gl-world.js`. |

### Content built

* **Board scenery** — 10 prop kinds baked into the static map mesh, per-map palette.
* **Summoner**: 10 blub units, 7 invocateur bodies, 5 creature tiers, 24 marks,
  10 attack cycles, detail layer, HP-deflation module, circles/projectiles/systems.
* **Siphon**: rebuilt from scratch (the old one was a cone — forbidden by §2 of
  its brief). 11 bodies, 8 beam states, ritual circle module.
* **CI**: suites gate + model-determinism gate + winding audit.
* **3D tower previews** in the build bar and armoury.

### The blub silhouette failure, fixed

Revue 1 failed the units twice: five of ten shared one circular outline. Solved
as **proportion**, not detail (three families: TALL / LOW / RIG). The ≥0.85
shape-IoU list went from seven pairs to **empty**. `blub1`-in-`blub2`
containment 0.922 → 0.504.

---

## 5. WHAT I WAS DOING WHEN I STOPPED

**Wiring the Siphon ritual circle.** `js/gl/siphon-ritual.js` (861 lines) exists
and is now wired at all three call sites (both HTML pages, `gl-world.js`
`drawOverlays` after the beams, and `siphon-beam-draw.js` origin hook).

**IT IS NOT VERIFIED. Nobody has seen a circle on screen.** That is the very
next thing to do: place a Siphon, give it a rooted target, capture, and open the
PNG. If it does not appear, check that `SiphonFXRitual.plan()` returns an object
with `.origin` — the beam file falls through silently when it does not.

---

## 6. WHAT NEEDS TO BE DONE

### Immediate
1. **Verify the ritual circle draws.** See §5.
2. **Verify the per-tier beam counts.** Owner asked B2→2, B3→3, B4→4, B5→5,
   each beam chaining. Real `maxTargets` are 1/2/4/10/50, so this is a
   deliberate VISUAL cap — the panel still reports the true number.
3. **Verify the hands-out / staff-forward gesture** reads at true game scale. A
   previous attempt failed exactly this (5 px at inspection zoom, invisible on
   the board).
4. **mini2 redesign and MK2/SuperBlub polish** — code is committed, never seen.

### Known-open defects
* **`authoredFrontOffset()` is a stopgap.** All new art is authored front=+Y
  while the game is +X. Fix at source (author +X) and delete the function.
* **Crosspath marks render at the tower's foot**, not on their seats.
  `summoner_figure.py` owns the seat table and prints it.
* **`blub3/cyber` 0.874 shape IoU, 99.5% containment** — the one Revue 1 pair
  never fixed. It is a frame-0 property; animation cannot touch it.
* **Path B b1/b2 need re-review** — they changed shape *after* being reviewed.
* **The two Siphon paths gate their 360° test differently** (A worst-case 0.88,
  B mean 0.90). Thresholds are invented, not from the brief.
* **`models` CI job is red** — it byte-compares a rebuild while agents rewrite
  those files. Should settle once nothing is mid-flight.
* **`.obsidian/` and `Untitled.canvas`** are untracked now but remain in history.

### Not started
* Siphon L6 — the B5 sacrifice sequence (the brief calls it the game's best moment)
* Summoner §12–13 idle/summon animations, creature coagulation sequences
* Passe 3 detailing on the Siphon bodies
* The visual-quality loop is at **iteration 5 of 200, 0 of 45 groups passing**
  (`visual-pass/CALIBRATION.md`, `LOG.md`, `SCORES.json`)

---

## 7. HARD-WON LESSONS — do not relearn these

1. **Auto-push must be a timer, not a hook.** Power cuts + agents writing for
   30 minutes = everything lost.
2. **A capture nobody opened is not evidence.**
3. **Three winding bugs happened.** `tools/check-winding.js` now gates it.
4. **The review rig lied twice**: it forced a glow tint (every colour review was
   blind) and dropped `frame` (every filmstrip showed frame 0 nine times).
   Verify the instrument before trusting the measurement.
5. **Committing mid-agent-write** makes the CI determinism job compare against a
   moving target. Let agents finish.
6. **Screens must be entered through their own entry point** — `Codex.open()`,
   not `screen = "index"`.
7. **Don't hand two agents the same file.** It happened; both rewrote it.
8. **`file://` cannot reload in the preview pane, and Chrome MCP can't open it
   at all.** Serve over HTTP.
