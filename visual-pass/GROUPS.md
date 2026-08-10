# Asset groups — how the loop is actually run

The inventory holds **587 assets**. The loop's cap is 200 iterations. One
iteration per asset cannot finish, and pretending otherwise would mean
abandoning most of the inventory rather than improving it.

It would also be the wrong unit of work. Most of these assets are not
independent: every mesh in the game is lit by one shader, every material comes
from one shared palette, and every actor is grounded (or not) by one decision.
Scoring 155 material entries separately and then fixing them one at a time
would be 155 iterations spent re-deciding the same thing, and would guarantee
the palette drifts apart — the exact cohesion failure criterion 7 exists to
catch.

So the loop runs on **groups**: a family of inventory assets that one coherent
change addresses together. Rules kept intact:

- Selection is still lowest-total-first, ties to higher visibility.
- A change is still ONE concrete change.
- Observation is still a capture, and re-scoring is still judged from the
  capture, not from intent.
- A group that does not improve is still reverted and retried differently.
- **Every member of a group is re-scored individually** from the capture. A
  group score is not a shortcut around per-asset scoring; it is the unit of
  *work*, not the unit of *record*. `INVENTORY.json` keeps per-asset scores.
- Five consecutive failures still BLOCKS — at the group level, and the reason
  is recorded against every member.

| id | group | members | notes |
|---|---|---|---|
| G01 | terrain slabs, all six maps | geometry+material | flat, untextured |
| G02 | road mesh and edging | geometry+material | |
| G03 | map scenery props | geometry | **absent in 3D entirely** |
| G04 | board void / backdrop | material | large empty margin |
| G05 | grid lines | material | |
| G06 | shader lighting model | shader | 2 lights + flat ambient |
| G07 | shared material palette | material | value ladder |
| G08 | emission / uGlow channel | shader | |
| G09 | contact shadows / grounding | shader | **absent — actors float** |
| G10 | Warbringer meshes (7 tiers) | geometry | td_mesh, pure Python |
| G11 | Rifleman meshes (5 tiers) | geometry | Blender |
| G12 | Arcane Sniper meshes (7 tiers) | geometry | Blender |
| G13 | Siphon tower | geometry | **placeholder cylinder** |
| G14 | recruit summons (2) | geometry | |
| G15 | modelled enemies (normal/swarm/brute/hive) | geometry | the current best |
| G16 | sphere enemies (15 types) | geometry | **the current worst** |
| G17 | the Tyrant, wave-35 boss | geometry | **a red sphere** |
| G18 | bullet round | geometry | |
| G19 | pierce lance + remnant | particle-effect | |
| G20 | covenant round (B5) | particle-effect | |
| G21 | muzzle flash | particle-effect | |
| G22 | impacts (rifleman / arcane / covenant) | particle-effect | |
| G23 | forge slam (Warbringer A) | animation | |
| G24 | earthquake + fissures (Warbringer B5) | animation | |
| G25 | Siphon beam | particle-effect | |
| G26 | B5 strike / ritual circle | particle-effect | |
| G27 | death burst | particle-effect | |
| G28 | shield field + break pulse | particle-effect | |
| G29 | range circles and cones | material | |
| G30 | status rings, stun, kill stacks | material | |
| G31 | title menu (reactor, comms, backdrop) | animation | |
| G32 | map chooser + thumbnails | material | |
| G33 | build bar | material | |
| G34 | inspection panel | material | |
| G35 | hover cards | material | |
| G36 | health bars, enemy and tower | material | |
| G37 | boss bar | material | |
| G38 | wave banner | transition | |
| G39 | cash popups | animation | |
| G40 | victory / game-over overlays | transition | |
| G41 | pause menu | transition | |
| G42 | index screen | material | |
| G43 | armoury screen | material | |
| G44 | tower icons | geometry | |
| G45 | screen transitions | transition | |
| G46 | 2D fallback models (visuals.js) | geometry | WebGL-off path only |
| G47 | draw-pack sprite composites | texture | WebGL-off path only |
| G48 | Blender sprite sheets | texture | WebGL-off path only |

## Harness rule learned the hard way

Screens must be entered through their own entry point, never by assigning
`screen` directly. `Codex.open()` builds `towerModels`; setting
`screen = "index"` by hand skips it and `drawTowersTab` then throws
`Cannot read properties of null (reading 'forEach')` at `js/codex.js:308`,
killing the frame loop.

This was briefly mistaken for a game bug during the baseline sweep. It is not:
entered properly, the index screen renders fine. The same applies to `store`
and to `play` — use `Codex.open()`, `Store.open()` and `startRun()`.

## Observation constraint

The preview pane cannot reload the page — `location.reload()`, `location.href`
and the navigate tool all leave the existing page instance running. So a code
change is applied by **re-executing the changed file** through
`TDObs.reinject()`, which cache-busts the script, suppresses
`requestAnimationFrame` during injection so no second frame loop starts, and
rebuilds `World3D` when anything under `js/gl/` changed.

Proven end to end: a probe change to the fragment shader moved the sampled
board pixel from `[27,47,60]` to `[45,22,29]`, and `git checkout` plus a second
re-inject restored the region mean to 42.69 exactly.
