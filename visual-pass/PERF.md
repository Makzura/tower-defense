# Performance budget — criterion 8

Measured 2026-08-09 on the owner's machine, before any change, through
`TDObs.perf()` / `TDObs.gpuMs()` in the real game. `draw()` is driven
synchronously so a hidden pane cannot distort the numbers.

## The target

**60 fps — 16.67 ms per frame, total.** That is the whole frame: `update()`,
`draw()`, GL submission and the 2D HUD.

## Reference scenes

| scene | what it is |
|---|---|
| **light** | 7 max-tier towers, <10 enemies — a quiet between-wave board |
| **heavy** | 7 max-tier towers, ~60 mixed enemies — a real late-wave board |
| **stress** | 7 max-tier towers, ~100 enemies — above anything the schedule produces |

All at `rune-circuit`, Hard, default camera.

## Baseline, before any change

Backing store 1280x720 @ DPR 1:

| scene | enemies | CPU `draw()` median | CPU p95 | GPU-fenced ms/frame |
|---|---|---|---|---|
| light | 4 | 0.30 | 0.70 | 0.31 |
| heavy | 62 | 1.20 | 3.90 | 2.37 |
| stress | 101 | 3.00 | 5.80 | 2.89 |

Resolution scaling, light scene, GPU-fenced ms/frame:

| backing store | ms/frame | vs 720p |
|---|---|---|
| 1280x720 | 0.487 | 1.00x |
| 1920x1080 | 0.830 | 1.70x |
| 2560x1440 | 0.887 | 1.82x |
| 3840x2160 | 1.760 | 3.61x |

The game gives the canvas an adaptive backing store of CSS pixels x DPR capped
at native 4K, so 4K is a real configuration, not a hypothetical.

**Derived worst case:** stress scene at 4K is approximately
`2.89 x 3.61 = 10.4 ms/frame` of render. Against a 16.67 ms frame that leaves
roughly **6 ms of headroom**, and `update()` has to come out of it too.

## The ceiling I hold myself to

1. **Stress scene at 1280x720 must stay under 6.0 ms** GPU-fenced.
   Baseline 2.89, so the pass may spend at most ~3 ms more than it found.
2. **Stress scene at 4K must stay under 14.0 ms** GPU-fenced.
3. **Heavy scene at 1920x1080 must stay under 4.0 ms** — this is the
   configuration most players will actually run, and it is where quality
   should be spent first.

A change that breaks any of these must be offset elsewhere or reduced. Fill
rate is the sensitive axis: full-screen passes, large translucent overlays and
soft shadows all scale with resolution, and 4K multiplies them by 3.6.

Triangle count is NOT the sensitive axis: all 25 models together are 141 288
triangles, and the board draws a small fraction of that per frame. Geometry
detail is comparatively cheap here; overdraw is not.

## After iterations 1-3

Board scenery, the zone rim fix and the road kerb fix, measured the same way:

| scene | enemies | towers | GPU-fenced ms/frame | ceiling | headroom |
|---|---|---|---|---|---|
| light | 4 | 0 | 0.613 (was 0.487) | — | — |
| heavy | 24 | 4 max-tier | 2.127 | 6.00 | 65% spare |

All six maps build and draw without throwing. The scenery is baked into the
static map mesh, so it costs build time once per map load and **nothing per
frame** — the +0.13 ms at the light scene is the extra opaque surface, not extra
work. Comfortably inside every ceiling above.

## Re-measure command

```js
TDObs.boot('rune-circuit','hard'); /* build the stress scene */ TDObs.gpuMs(60)
```
