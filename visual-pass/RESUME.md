# Where to pick up

Written at the owner's request before pausing for usage limits. Everything here
is on disk and pushed; nothing needs re-deriving.

## Start the two servers first — nothing observable works without them

```
node <scratchpad>/capture-server.js  "C:\Users\Superuser\Downloads\TD_0.5.1\visual-pass\captures"
node <scratchpad>/static-server.js   "C:\Users\Superuser\Downloads\TD_0.5.1" 8792
```

The capture sink on `127.0.0.1:8765` receives composited PNGs. The static server
exists because **the Chrome MCP forces `https://` onto any URL and can never open
`file://`** — serving the project over HTTP is the only way to get a second live
game instance, and Chrome is the better surface because it can genuinely RELOAD,
which the preview pane cannot.

Then open `http://127.0.0.1:8792/TD_0.5.0/index.html` in as many Chrome tabs as
you need, and inject `/visual-pass/harness.js` in each. `TDObs.showcase()` draws
arbitrary registered models in a row at true game scale — that is the review rig.

## Git

Auto-push is installed: `.git/hooks/post-commit` runs `visual-pass/git-sync.sh`,
which rebases and pushes on every commit. It auto-resolves ALL conflicts at the
owner's instruction, but saves the losing side of any hand-written conflict to
`refs/sync-backup/<timestamp>` first, so a resolution is always undoable:

```
git log --oneline refs/sync-backup/
git cherry-pick <sha>
```

Remote is `github.com/Makzura/tower-defense`, private. `Makzura/Game` is a
DIFFERENT project (Vite/TypeScript) and was deliberately left untouched.

## Three tracks, and their true state

### 1. Visual quality loop — 45 groups, iteration 5 of 200
`CALIBRATION.md` has every score, `LOG.md` the iterations, `SCORES.json` the live
state. Five iterations done, **0 groups passing**. Next by the rule (lowest
first) is **G13** at 0.63 — but G13 was the old Siphon, which has since been
DELETED, so its entry needs retiring before the rule can be applied again.

Three real rendering bugs were found and fixed here, all verified by pixel
readback: zone slabs rendering the wrong colour (`P.panel` was invisible
everywhere in the game), road kerbs wound inside-out so every kerb was culled
every frame, and actors drawn at z=0 while the board has real height.

### 2. Summoner — Passe 1, NOT closed
46 models built (10 units, 7 invocateur bodies, 5 creature tiers, 20 marks + 4
summoner marks). Revue 1 **failed first time** and was fixed — see
`SUMMONER-REVUE1.md`. It has still only been run on the ten units; it must be
re-run across ALL silhouettes together before Passe 2.

Three FX modules exist but **have never executed in the game**:
`js/gl/blub-circles.js`, `blub-projectiles.js`, `blub-systems.js`. They are not
loaded by either HTML page. Their performance numbers came from a counting STUB,
not the real renderer, so treat them as claims until measured with
`TDObs.gpuMs(60)` on a real board.

### 3. Siphon — rebuilt from scratch, half done
The earlier Siphon was DELETED, not patched: its robe was a `td.frustum`, i.e. a
cone, and the brief forbids any part being generable by revolution about the
vertical axis.

`SIPHON-SOCLE.md` is the frozen contract — scale, both beam origins as
coordinates, both palettes, ground anchors, the eight beam state names. Two
things it settles by reading `beam.config.js` rather than guessing: the ground
vein appears at **B3** (where `lifesteal` unlocks) and the Midas gauge is **A5**
(`gold_to_power`), not A3.

| lot | state |
|---|---|
| L2 abyss (b1-b5) | built and reviewed, holds the no-cylinder rule |
| L3 beam (8 states) | built, **never looked at** |
| L1 idol (base, a1-a5) | **FAILED** — see below |
| L4 ground effects, L5 enemy effects, L6 the B5 sequence | not started |

**L1 failed its own validator and refused to write:**
`siphon-base FAILED the 360 test: quarter 0.88, mirror 0.86 -- it is a surface of
revolution, rebuild it`. That is the second time this tower has been built as a
cone, so the body must be built OFF-AXIS from the first line rather than centred
and corrected afterwards. Keep the validator in `siphon_idol.py`; it is the thing
that caught the failure.

## The lesson worth carrying forward

A capture nobody opened is not evidence. The first idol lot arrived as a script
that ran cleanly over geometry no one had looked at — and it was a cone. Every
agent brief since then requires the agent to `Read` its own PNG and report what
it SAW, not what it intended.
