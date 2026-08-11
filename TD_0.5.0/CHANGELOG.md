# Tower Defense — change log

Newest at the top. Date, what changed, why.

**This is history, not rules.** The operative document is `AGENTS.md`: hard
constraints, architecture, mechanics, the model contract and the current
values all live there, and that is the file to read before changing anything.
This one exists so that reading the rules does not mean scrolling past every
decision ever made — it was half of `AGENTS.md` by line count, and a rules
document nobody finishes reading is a rules document nobody follows.

Add an entry here for every change, and fix the rule in `AGENTS.md` in the
same edit. An entry that records a new invariant without writing it into
`AGENTS.md` is how the two drift apart.

**2026-08-12 — a documentation repair pass over `AGENTS.md`, and eight missing
change log entries reconstructed.**

No game code was touched. Every correction below is backed by a file and line in
`js/` or `tests/`, or by a commit hash, and anything that could not be proved was
left alone and reported instead — a confident guess in the source of truth is
worse than a known gap.

**Why it was needed.** `AGENTS.md` opens by warning that a stale document is how
a session ends up acting on facts that are no longer true, and it had drifted in
exactly the ways it warns about. The eight commits of 2026-08-11 landed without a
log entry between them, so the history this file exists to carry simply stopped
on the 11th. Those eight are reconstructed below and marked as such.

**The counts, which had drifted three ways at once.** `tests/blub.test.js` was
recorded as 47 in the baseline block and 46 in the architecture file map, and is
53 — measured, and 53 at the commit that typed "47", so it was a transcription
error the day it was written rather than a coverage change. The file map also
carried counts for `long-range-dps.test.js` and `beam.test.js` that disagreed
with the baseline block. **Those three counts are now deleted rather than
corrected**, and that is the point: a file map answers "what is this file",
which a test count is not, and the baseline block is the only place that also
records WHEN it was measured. A count with no measurement date cannot be
falsified, so it rots silently. This project already paid for the two-copies
lesson once when `CLAUDE.md` was reduced to a pointer; refreshing the second copy
would have rebuilt the same trap with newer numbers.

**Two named "known failures" that pass.** The bulleted examples under the
baseline claimed `a mixed wave deploys its groups in order` and `the enemy tab
covers the roster` were failing. Both print `ok`, and `tests/` is byte-identical
between the checkout baseline and `77a7865`, so they cannot have been fixed since
— the prose was wrong when it was written. Removed. The `ReferenceError: w is not
defined` bullet above them is correct and is untouched.

**The Tyrant bullet was stale by two retunes.** It said the test wants 1.75 s off
a 3.5 s base and the game ships 8 s and 6 s. The test asserts 6 off a base of 8
(`tests/content.test.js:595`, `:601`) and the game ships 12 and 9
(`js/enemy.js:664`, `:681`) — so the bullet described a test state and a shipping
value that had both moved on, and on its own figures it convicted the test of
matching. Only the numbers changed; **the conclusion that the test is stale
rather than the boss is correct and was deliberately left standing**, because the
1000/12/9/90 set is what the owner asked for twice in writing and inviting a
future session to "fix" the game back to 200/8/6/50 would be a worse defect than
the one being repaired. The 2026-07-29 owner quote that opens the Tyrant section
is kept verbatim as the original ask and now carries a marker saying the body and
the shield were raised afterwards, because readers were lifting its 200 out as a
live value. The enemy roster table separately still described the boss as
2500 **+200** with a 50 u.l. leap; it now reads 5000, **+1000**, 90.

**The build bar section described a system that had been replaced.** It said
`BUILD_SLOTS` is the literal `[Tower, Smasher, LongshotTower, BeamTower,
Soldier]` with "all five now filled". It is derived from the saved loadout
(`js/game.js:1120`, re-read by `rebuildBuildBar()` at `:1131`), the gunner is not
in the catalogue at all, and a fresh profile arms two of five, not five. The
meta-progression section 280 lines away already said this correctly — the same
two-copies failure, inside one document, with the wrong copy sitting where a
reader reaches it first. The stale copy now points at the correct one instead of
restating it. In the same section: the bar order is catalogue order rather than a
price list that had the Rifleman at $15 against a shipping $300, the claim that
`placeSmasher` addresses slot 1 was the opposite of what `tests/harness.js`
does, and "a sixth type is no longer a drop-in" was outlived by the Summoner,
which landed as a sixth type precisely because the armoury made a sixth SLOT
unnecessary.

**Smaller factual corrections.** The document told the reader to run "all five"
suites nine lines after listing six. The data-flow paragraph said the main loop
turns a bullet's returned damage into cash — it discards it, and only the death
sweep pays — and said nothing scores by global mutation, which is true of damage
and kill credit but not of cash. Target claiming was described as one
constructor pair when `PierceBullet` has a second. The u.l. section was headed
"why the constant is 1.552" directly above a code block showing 1.04. The camo
line priced the Soldier's B3 at "$400 on top of a $15 tower" against a shipping
$750 on a $300 tower, and now says both the tier price and the $1300 needed to
reach it, labelled, because B3 cannot be bought off the shelf the way the
Longshot's A1 can. An unequip example used the gunner, which can no longer be
equipped.

**Eight scripts that `index.html` loads were missing from the architecture file
map** — `js/systems/summon-contact.js` and seven `js/gl/` modules from the
2026-08-11 rendering work. The file's own rules require the map to be updated
when a file is added, and a map that omits a third of a day's work is how the
next session concludes a module does not exist.

**Every campaign schedule figure in the file was pre-rescale**, in eight places
including the version header. Easy is 797 bodies, 23 867 scheduled HP and
**25 969 effective**, not 738 / 11 747 / 13 498; Normal is 918 / 43 844 and Hard
1039 / 56 895. This was held back at first as a possible balance defect rather
than a documentation one, because the file quotes 13 500 as the owner's stated
target — but it is settled by `tests/run.js`, which pins 23 867 and 25 969 in an
assertion that PASSES, so the schedule is intended and the document was the only
thing left behind. The file had in fact already half-corrected itself without
noticing: its clear-bounty figure of ~$2596 is a tenth of 25 969 and cannot be
derived from 13 498 at all. The run purse is $36 204, also pinned, not the
~$42 443 the values table computed from a cash-per-damage rate the same table
records as retired. The 13 500 target is now recorded as the original ask that
the rescale moved past, in the same way as the Tyrant quote.

**The roster is twenty-one types, not nineteen**, and all twenty-one are
scheduled on every difficulty — the "fourteen on Easy" split has not been true
since the five supposedly Easy-absent types were scheduled into `EASY_WAVES`
itself. Corrected in the five places it appeared.

**Deliberately not changed, and reported instead.** Four stale comments in game
code, which a documentation pass does not touch and which were routed to their
owners — two of them say the same wrong thing the document said, so correcting
only the document would have left the source contradicting itself. The "roughly
25 seconds" suite runtime, which measured 52 s on the machine doing this pass
but is a claim about the owner's, and so was left as unverified rather than
replaced with a number from the wrong computer.

**2026-08-11 — the fused creature never drew: `monsterTier` is a number, not an
object.**

Owner, game-testing: *"there is no model or animation for any tier of the monster
blub yet."* All five creature models were built AND loaded by both pages; the
resolver was wrong. `blubModel()` tested `tower.monsterTier.tier`, but
`js/blub.js` carries `monsterTier` as a NUMBER — it compares it directly
(`blub.monsterTier >= 3`) and prints it as `"T" + monsterTier`. `.tier` on a
number is `undefined`, so every creature fell through to the `unitId` branch,
found none, and drew the placeholder cylinder.

The fix has TWO traps and each breaks a different half of the roster. Truthiness
fails T0: tier 0 is real and `0 &&` is false, so a truthy test leaves the
smallest creature a cylinder. `typeof` alone fails all ten ordinary units: an
ordinary blub does not carry `undefined` here, it carries `-1`, so a bare
`typeof` check matches every blub and resolves it to `blub-monster-t-1`, which
does not exist — the fix for the creature would have turned all ten UNITS into
cylinders. The guard is now a number AND non-negative. The `typeof` version was
written first and the second trap was caught by checking a live board before
shipping, not by reasoning about it.

*(Reconstructed 2026-08-12 from commit `77a7865`, which landed without a log
entry.)*

**2026-08-11 — fix the regression the previous commit shipped.**

`tower-preview.js` called `document.getElementById('gl')` at load time to attach
`webglcontextlost` listeners. A browser returns `null` for a missing element and
the code already handled that — but `tests/sandbox.smoke.js`'s DOM stub THROWS on
an id it has no stub for, and it has none for `#gl` because the smoke test drives
the 2D board. The throw took the whole suite down: it stopped emitting a summary
line at all, which is exactly how `ci-check` flagged it as a regression rather
than as a count change.

Guarded. Nothing there is required for the module to work — losing the listeners
only costs a cache flush on context loss — so failing to attach them must never
be fatal. Worth recording that the gate did its job: this is the first regression
the CI check has caught, and it caught it on the commit that introduced it.

*(Reconstructed 2026-08-12 from commit `a83f5f6`, which landed without a log
entry.)*

**2026-08-11 — 3D model previews in the build bar and armoury; frame drivers for
the Siphon and the Summoner.**

THE PREVIEWS, which the owner asked for. `js/gl/tower-preview.js` renders a
tower's real mesh into an FBO on World3D's OWN GL context — not a private one,
because `GLModels` caches uploaded buffers on the model object and a second
context would either steal the board's buffers or duplicate every mesh — reads
back once, and keeps a 2D bitmap keyed on (model, device px). Steady state is one
`drawImage` per slot and zero GL work: measured 2 renders against 458 blits, 352
deferred, 15.3 ms of render total. Wired at both call sites with the same rule:
try the mesh, fall back to the tower's own `drawIcon` when it returns false. With
WebGL unavailable World3D is never installed and the old glyph is simply what
runs, so a slot is never blank.

FRAME DRIVERS. Two more towers had animation built and nothing driving it — the
same silent failure as the blubs, and just as invisible, since frame 0 is the
rest pose. The Siphon CHANNELS, so its clock is not a cooldown: there is no
per-shot cadence to index and the brief forbids an attack pulse, so the phase
runs off a clock and only while a lock is held, easing back to rest rather than
cutting, because a hard cut to frame 0 is exactly the "strike" read the brief
rules out for this tower. The Summoner's idle band is chosen by its LIVING UNIT
COUNT, because the brief makes the amplitude of his chant a function of how big
the swarm has grown — one rung per doubling, so the ladder still means something
when a maxed tower fields hundreds. `liveBlubs()` was guessed for that count and
checked before shipping; the real method is `blubCount()`.

*(Reconstructed 2026-08-12 from commit `3bb48f3`, which landed without a log
entry.)*

**2026-08-11 — blubs actually animate now, and the harness can finally show it.**

Two blockers, both invisible by design.

`gl-world` had NO blub frame branch. A blub has neither `gearPhase` nor
`swingProgress`, so `frame` stayed 0 and all ten attack cycles were dead weight —
nine frames on disk and a still board. Nothing would ever have caught it: **a
frozen blub looks exactly like a correct rest pose**, which is the whole reason
frame 0 IS the rest pose. It is now one grep, and the build script says so —
`grep -c BLUB_CYCLE js/gl/gl-world.js`, where 0 means every blub is frozen. The
strip is indexed by reload PHASE, not by a clock, so a cycle can neither overrun
its interval nor lag a rate change, and the swarm buff moves that rate
mid-interval. A cooldown of exactly zero reads as REST: an idle blub holds
cooldown at 0 and `1 - 0*rate` is 1, not 0, so the naive formula would park every
idle unit on the last frame of its wind-up.

The second blocker was the review rig. The harness fix an hour earlier
(`d2bb8ec`, in `visual-pass/`) was incomplete and unchecked: `showcase()`'s layout
rebuilt each item without copying `frame`, so `it.frame` was always `undefined`,
`_drawPosed` was never reached, and `filmstrip()` laid out N copies of frame 0.
The agents had been told "filmstrip is fixed, use it" — one of them found the
hole and worked around it in-page rather than trusting that. Verified after:
nine visibly different poses.

*(Reconstructed 2026-08-12 from commits `d80b6cd` and `d2bb8ec`, which landed
without a log entry.)*

**2026-08-11 — blub attack frames reviewed frame by frame; four of the ten were
wrong.**

Nobody had ever seen these move — `showcase` drew the whole buffer with one
matrix, so the review rig was blind to animation until the harness fix above.
Every unit is now measured off the built strip (max vertex travel from rest, per
frame, in screen pixels) and looked at in a filmstrip at 2–6× and again at true
game scale. Six units passed and are untouched, their model files byte-identical.
Four did not:

- **hungry** — the stomach piston DETACHED. The gut front sits at −0.18 r, the
  jaw it slides out of ends at −0.50 r, and the stroke is 0.43 r, so the two shot
  frames opened three pixels of black sky between the animal and its own stomach.
  It read as a part falling off. A `gut_neck` buried inside the jaw at rest now
  spans the stroke, and the rise comes down 0.30 → 0.18 so the shaft stays in the
  jaw's own z band.
- **mecha** — five of eight poses within 1.6 px of rest (9.4, 10.3, 4.1, 1.5, 0.6,
  0.2, 0.6, 1.6): a recoil with 200 ms of photograph in front of it and no
  anticipation at all. Release untouched, tail of NOD/RUN deepened; the coil goes
  1.6 → 7.0 px.
- **mecha2** — same disease, 4.2 px of wind-up against a 19.8 px release. Now
  11.3, and the MK2 visibly hauls itself forward to reload.
- **mini2** — the file claimed frame 1 was "three times the amplitude of the buzz
  around it"; it was 1.7×, and the intake was exactly the buzz floor. The cause
  was anatomy: a 12 px slab cannot show the rotation a spire shows, so its two
  accents move the body bodily on push instead. 4.0 → 5.7 px shot, 2.2 → 4.1
  intake, floor down to 1.5.

**Frame 0 is untouched, and that is measured rather than argued.** Silhouettes by
frame differential at the reference viewport 1278 × 719 and the default game
camera, three yaws, come back BIT-FOR-BIT IDENTICAL for all ten units, including
hungry with its new neck — same boxes, same areas, same masks. So all 45 pair
IoUs are unchanged, the `>= 0.85` circular family stays empty (worst pair
blub1/cyber at 0.833), and the three profiles, the maw on the head and the ten
footprints cannot have moved.

Doc fix in the same pass: the build script's header credited a `--check` flag
that has never existed; the checks run on every build.

*(Reconstructed 2026-08-12 from commit `af9501a`, which landed without a log
entry.)*

**2026-08-11 — sceptre out of the body, blub attack frames, and the summon
ceremony wired.**

SCEPTRE, proven rather than eyeballed. The old shaft ran from the ring THROUGH
the palm, and the cause was geometric rather than a typo: RING
(0.315, 0.395, 1.190) is 0.185 outboard of the palm and only 0.150 above it, so
any straight line through both is at x = −0.36 by z = 0.62 — through his hip. It
now drops nearly plumb from the ring's lower rim, raking out and back, off the
centreline the whole way, which is `tower_warbringer.py`'s lesson that **a weapon
at rest belongs OFF the axis**. The hand meets it at the TOP and `_weld` bridges
the gap.

That file's `penetration()` check is ported in and is NOT vacuous: re-run against
the old geometry it rejects 3/3 tiers. After, penetration is 0.000 on every tier
and frame, clearance 0.063 (2 px). A real bug in the check itself was fixed on
the way — `_patch_boxes` dropped vertices on faces with more than four sides, and
a frustum's caps are pentagons, so it under-covered the weapon and could have
missed a hit.

Animation is 4 frames on a `sceptre` empty rotating about the join, so the head is
the pivot. **The RINGS stay on the static group, so the beam origin is
structurally incapable of moving.** Frame 0 is exactly identity, so a frameless
runtime still gets the rest pose. `siphon_origins.json` is byte-identical, so the
beam lot needs no edit, and triangle counts are unchanged. Also lands the blub
attack frames and wires `js/gl/blub-summon.js`, which had never executed once:
~1,300 drawn frames across five scenarios, zero exceptions.

*(Reconstructed 2026-08-12 from commit `82464bf`, which landed without a log
entry.)*

**2026-08-11 — the Siphon's beam was never drawn in 3D. Wire it.**

ROOT CAUSE, and it is structural rather than a bug in the beam code. `BeamTower`
draws its fountain AND its beams inside its own 2D `draw()`. `js/game.js:2953`
wraps the entire 2D world layer in `if (!world3D)` — including the actor loop at
`:3011` that calls `tower.draw(ctx)`. With the 3D board installed, which is every
ordinary load of `index.html`, that method never runs. So the tower whose beam
the brief calls "more than half its visual value" had no beam at all, and had not
had one since the 3D board shipped.

`js/gl/siphon-beam-draw.js` already existed — written by an agent that reached the
same diagnosis independently before it died on the session limit — and it
documents its own call sites. Wired exactly as specified: loaded in `index.html`
and `sandbox.html` after `siphon-beam-spec.js`, whose table it reads at call time
(the two pages must stay identical); called in `drawOverlays` at the END of the
tower-hardware pass, immediately before `drawShots`, because **the beam is
hardware, not a shot** — it is continuous while a lock is held, so it belongs
under the shots and under the cosmetic burst; and at TOP LEVEL, outside the
per-tower `withGround`. That last one matters: **a beam spans TWO ground
heights**, the deck the tower stands on and the road its target walks, so it pins
its own reference and feeds `project()` absolute heights, the same rule a shot in
flight follows. Called inside a tower's `withGround` it would flatten every beam
onto that tower's deck and the far end would float.

*(Reconstructed 2026-08-12 from commit `5e8a74f`, which landed without a log
entry.)*

**2026-08-11 — salvage the wave that died on the session limit. UNVERIFIED.**

All four agents failed mid-task on the session limit, but had already written
substantial work that validates, so it was kept rather than thrown away:
`js/gl/siphon-beam-draw.js` (1058 lines, parses), `js/gl/blub-summon.js` (1275
lines, parses), and `tools/blender/tower_summoner.py`, which still builds and now
puts the ten units at 5012 triangles against 4672, so attack geometry was added.

**What this is not: verified.** Nothing in it had been seen running. The two
modules were inert because no script tag loaded them, and that is the only reason
it was safe to commit half-finished work — the game was unaffected either way.
Both were wired and checked in the commits above. The diagnostics survive and
were worth reading before the work was retried: the beam agent captured the
BEFORE state (`captures/siphon-beam-BEFORE-locked.png`, `-close.png`) and the
sceptre agent captured the path A head.

Gates at the time: all 12 primitives wound outward, suites at baseline
(105/3, 182/30, 70/1, 45/0, 53/0, 2).

*(Reconstructed 2026-08-12 from commit `936f358`, which landed without a log
entry.)*

**2026-08-11 — the ten blub units get a detail layer (pass 3).**

New `tools/blender/blub_detail.py` builds ten add-on meshes, `blub-detail-<unit>`,
composited over untouched bodies the way `summoner_unit_marks.py` composites the
crosspath marks. Ten script tags added to `index.html`. Nothing else was edited:
no body, no simulation value, no footprint. 1144 triangles for the ten, worst 144
against a budget of 150.

The owner's report was that the bodies "have very little identity and coolness" —
pass 1 silhouette plus a flat palette, with pass 3 never run. One beat per unit:
blub1 a brow and cheek folds and a wobble; blub2 the crust lashed on with straps
and a buckle; blub3 a cut jaw and collar tabs under the pauldrons; the two Minis
ragged, mini1 upward and mini2 sideways; the Hungry Blub gums, a drool ledge and
a gorge that runs backwards; the Cyberblub gaskets where the grafts enter the gel,
inset panels and a suture; the Mechablub rivets, vents and a cockpit frame; the
MK2 tank straps, chevrons and pipes under tension; and the SuperBlub's porthole
rebuilt so the tiny frightened blub inside it is legible — its face was authored
with eyes 0.07 screen pixels across, so the gag the whole B path rests on did not
exist on screen.

**Two invariants this establishes, both now in the file header.**

1. *A detail layer READS its bodies, it does not copy them.* The script imports
   `tower_summoner`, rebuilds each body into a throwaway scene and ray-probes the
   triangles: `radial()`, `front()`, `top()` are casts against the real mesh, and
   seats are taken from the body's own named solids. The bodies were re-profiled
   twice while this was being written and the details followed. `main()` prints
   every anchor that had to fall back, so a rename shows up on the next build.
2. *A detail on a small unit must move the OUTLINE or swap a block of VALUE.*
   Revue 1 measured the b1 marks at 3–7 px and called them invisible. Every unit
   here changes at least 11 px and 6 % of its own pixels at its worst of four
   yaws, measured at the review's reference viewport (1278 × 719), and mean
   luminance over the body's footprint goes DOWN on all ten — the value ladder,
   measured rather than asserted.

**2026-08-11 — the ten blub units are rebuilt on three proportions, not one.**

`tools/blender/tower_summoner.py` only. No simulation value moved: the ground
radii still print 10/13/20/10/10/25/25/30/40/50 from `js/blub.js`
`UNITS[].footprintUl`, which was not edited.

`visual-pass/SUMMONER-REVUE1.md` failed the units and said why: **five of the
ten** (mini2, blub1, blub2, hungry, cyber) shared one circular outline at
>= 0.85 shape IoU, so correcting the three worst pairs one at a time would only
have moved the confusion. At true scale mini1 is 10 x 13 px, so an appendage is
one pixel; the separation had to be the animal. Every A-path body used to come
out of one `drop()`. Now there are three profiles as data (`EGG`, `SPIRE`,
`SQUAT`) plus `_stack`, and the family splits into TALL (blub1, mini1, cyber)
against LOW (blub2, mini2, hungry). `drop()` survives for blub3 alone, which
passed revue 1 on that shape. Measured at the review's reference scale
(viewport 1278 x 719 equivalent; superb 68 x 66, mecha2 69 x 38):

| pair | raw IoU 0/45/90 | shape IoU | blub1 inside blub2 |
|---|---|---|---|
| mini1 / mini2 | 0.951/0.921/0.986 → **0.603/0.615/0.592** | — → 0.780 max | — |
| blub1 / blub2 | 0.639/0.668/0.606 → **0.321/0.412/0.685** | 0.895 → **0.764** max | 0.922 → **0.504** (0.737 worst yaw) |
| hungry / cyber | 0.862/0.785/0.785 → **0.751/0.648/0.634** | 0.877 → **0.740** max | — |

No pair among the ten now reaches 0.85 shape IoU at all; the seven-entry
`>= 0.85` list in the review is empty.

**The mouths, reported twice by the owner** ("the mini blub and hungry blub are
unreadable because they're open from behind"). The dark throat cavities added
last time closed the see-through hole and left the cause alone: the jaws were
wide plates flared apart with an ellipsoid WIDER than them wedged between, so
the outline was an open clamshell with no head above the gape. New rule, in
`maw()`: **the mouth never touches the outline.** It is a band of dark tiles
laid on the head's own curve at `radius_at()`, with the teeth on the same
surface — it cannot widen the silhouette, cannot be seen through, and the head
closes over it. `teeth_ring()` is gone; the review had already measured its
crown as "une frange de 1 px". The Hungry Blub's head is now two wedges of
falling width (jaw under skull, prognathous) under a domed cranium, with the
gape a dark line strictly smaller than both in x and y. Checked at four yaws in
silhouette: no daylight through either unit from any angle.

Colour build committed (not the silhouette build — that mistake shipped 46 grey
models once). Verified on a fresh page load: 10/10 registered, 3 to 10 palette
entries each, mean chroma 31.4 over 8885 model pixels, 2.8% achromatic and that
is the stone and the chrome. `node tools/check-winding.js`: all 12 primitives
outward — no new primitive was added, only `td_mesh`'s existing ones.

Screen area now rises with the footprint across the whole family: 108, 134, 232
(fp 10), 249 (13), 612 (20), 824 and 832 (25), 858 (30), 2046 (40), 3095 (50).

**2026-08-10 — the Summoner's three effect modules are wired in.**

`js/gl/blub-circles.js`, `js/gl/blub-projectiles.js` and `js/gl/blub-systems.js`
had been written but were loaded by nothing and had never executed. They are now
in both script lists (after `js/gl/gl-world.js`, and the two lists stay
identical) and called from `js/gl/gl-world.js` at the sites each file documents:

* `install()` binds both helper-taking modules and builds `BLUB_FX_API` once;
  `ensureMap()` resets all three on a map change, so a new board keeps none of
  the old one's splatters, circles or brass.
* `drawWorld()` runs `BlubFXSystems.update` before anything is drawn, adds
  `BlubFXCircles.descentLift` and `BlubFXShots.recoil` to a summoned body's own
  transform, and draws `dyingBodies()` as real geometry between the tower loop
  and the enemy loop.
* `drawOverlays()` lays the ground group down in one bottom-to-top order —
  death stains, shot decals, summoning circles, swarm threads — then the weaken
  sigils immediately before the health bars, then the air group (`drawAir`,
  `drawDeaths`) between `drawShots` and `drawEffects`. All at top level, never
  inside a `withGround`: each module pins its own ground per mark.

Nothing in the three files was modified; `js/blub.js` was not touched. Measured
at 1280x720 on a 7-maxed-Summoner board (95 blubs, 100 enemies, 72 live circles,
~95 threads): `draw()` 1.40 ms without the modules, 2.30 ms with them — **+0.90
ms**, against the 6.0 ms ceiling in `visual-pass/PERF.md`.

**2026-08-10 — the rail box becomes the switch, and five corrections around it.**

All six from the owner, in one pass, and four of them are him catching something
the previous session got wrong.

**THE GREY BOX IS THE SWITCH NOW.** Clicking one used to open a second panel
view with a Producing/Stop button inside it. His verdict: it *"creates an unknown
behavior"* — you click a thing that looks like a switch and get a different
screen with another switch on it. He is exactly right, and the fix is his:
*"from a3 onward make the greybox highlighted while they produce and if they are
left clicked they dim and stop production."* Lit or dim, one click, one meaning,
and no word has to be read to tell the two states apart.

The base stats moved to the **hover card**, which is where they should have gone
first: hovering is the gesture that cannot change anything, which makes it the
right one for reading, and every other explain-before-you-touch-it in this game
already lives there. A box below A3 still draws and still counts down — what a
tower is making and when is worth knowing from the first one — it just refuses
the click, and its card says why. The whole panel-view apparatus
(`selectedLine`, `viewedLine`, `clearPanelView`, the Back button, the swapped
`statLines`) is gone rather than left lying about.

**NO ROOM NOW MEANS WAIT, NOT SKIP.** *"lorsqu'il ne peut plus en placer a cause
d'un manque de place la bar reste chargee au maximum et un blub est place a
l'instant ou une place se libere."* The brief originally said a failed cycle
simply came round again, and in play that was worse than it sounds: on a full
board every line spent its whole interval counting down to another failure, so a
space that opened sat empty for up to a cycle. The timer holds at zero, the bar
stays full, the box says *no room*, and the body lands on the first step there is
somewhere to put it.

**A TIER THAT SHORTENS A CYCLE NOW BRINGS THE NEXT BODY CLOSER**, and the way
that went wrong is the entry worth keeping. A running clock has to be clamped to
a newly shortened interval or the bar — `1 - left / total` — sits pinned at empty
for the overhang. The clamp went into `syncLines`, which `recalcStats` calls…
which `previewUpgrade` calls twice per hover. So merely laying out the panel
previewed A1's 18 s cycle, clamped the live 20 s clock to 18, and left it there:
**hovering the tower made it summon faster.** It lives in `applyUpgrade` now,
beside the HP grant, which documents the identical trap for the identical
reason. A test pins it.

**T0–T2 MONSTERS NO LONGER REPLACE THE TOWER.** *"for t 0 1 and 2 the monster
should not replace the tower and now it does, only t 3 and 4 should, and should
be placed as near as possible to the track."* Below tier 3 the tower carries on
summoning beside its monster, so parking the monster on top of it hid the thing
still doing the work — and stood a body that has to shoot wherever the tower
happened to be built. It goes to the free spot nearest the road now
(`findRoadSpot`, the same sweep a blocked summon falls back to). From tier 3 it
*is* the tower and stands where the tower stands, which was always the intent.

**A BLUB SOLD THROUGH ITS PANEL LEAVES THE FLEET.** He noticed it was "counted as
still alive", and it was: `sellTower` took it out of `towers` — so it could not
shoot or be clicked — while it went on counting in its summoner's blub count,
its pooled HP, the swarm buff every other blub was drawing on, and the next
Coagulation's tier. A ghost in exactly the numbers the tower is played on.
`sellTower` calls `onRemoved`, `isDestroyed` reports it, and every reader that
already went through `livingBlubs()` is correct at once.

**THE SANDBOX GETS 20x AND A 100 000 HP BASE.** The speed is one more entry in
the array the workbench already extends. The base is the more interesting one: a
workbench needs leaks to be a *reading* rather than an ending, and at 100 HP a
single Brute finishes the session — which turns every measurement into a race
and makes the loss overlay the thing you spend your time dismissing. It moves
`BASE_MAX_HP` rather than `baseHp`, so `restartGame()` carries it; the loss path
is still reachable, so it stays testable. One existing smoke test asserted "base
HP can be set above its starting maximum" using a literal 10 000, which stopped
being above the maximum the moment it became 100 000 — it derives the figure
from the constant now.

**2026-08-09 (latest+4) — the blub rail, and 5x/10x on the workbench.**

Two owner requests on top of the Summoner, both about being able to SEE what it
is doing.

**THE SUMMON LINES LEFT THE PANEL AND BECAME A RAIL.** They shipped as three
compact rows inside the inspection panel a few hours earlier; the owner asked
for *"separated grey color boxes on the left of the panel, one per blub type
that can be clicked to show the blub base stat"*, and he is right about all
three parts of that.

They are not actions on the tower, they are its *contents* — three things it is
making, each on its own clock. As panel rows they competed for height with the
upgrade buttons, needed a layout exemption to fit at all, and read as three more
things to buy. **The grey is the load-bearing part**: every other rectangle on
that panel is an offer (green buys a tier, violet fires an ability, gold is a
live reading), so grey says "status, not shop" before a word of it is read.

Each box carries the same clock twice — **a bar that fills to the moment the
next body appears**, which was the request before this one, and the seconds
beside it. A bar is for glancing at while you watch the road; a number is for
when "nearly full" has to mean one second rather than twenty. It also shows how
many of that type are standing, which is the other half of the same question. A
stopped line **holds its bar where it stands** rather than emptying it, because
that is what stopping actually does to the clock.

Clicking a box swaps the panel to that blub TYPE, including a **lifetime damage**
row — what one will do if it spends every charge. That is the number that
actually compares two summon lines, and neither the damage nor the rate says it:
a Mini Blub II is 36 and a Cyberblub is 480.

`action.compact` survives from the row version, now carrying the blub view's two
one-word buttons, and `action.progress` joins it — 0..1, swept across a button
as its own clock runs. Both are generic, both are set by one tower.

**A FUSED TOWER HAS AN EMPTY RAIL.** From tier 3 the monster blub is the tower
and nothing is being produced; three frozen bars would say the opposite of what
is happening. A test pins that it comes back when the monster dies, because "the
panel is stuck on a line that no longer exists" is exactly the bug this shape
invites.

**5x AND 10x, IN THE SANDBOX ONLY.** `js/sandbox/sandbox.js` APPENDS to
`GAME_SPEEDS` rather than replacing the button, which matters more than it
looks: the entire design of `gameSpeed` is that speed is applied in exactly one
place — how many fixed steps `frame()` runs, never a scaled dt — and a
sandbox-only second implementation would be a second place to get that wrong.
A test asserts that one frame at 10x is ten ordinary 1/60 s steps and not one
big one.

The shipping ladder is deliberately untouched. A workbench exists to reach a
board state quickly and 10x turns a two-minute wait into twelve seconds; in a
real run the same button is a difficulty setting, because nobody can react at
10x. The speed button's chevrons now cap at three — ten arrowheads do not fit in
a 78 px button, the cap is invisible in the game, and the number was always the
precise statement.

**2026-08-09 (latest+3) — the Summoner, the fifth tower: it never fires, and
its units' hit points are their ammunition.**

Built against a fully-specified brief from the owner — concept, both upgrade
tables, ten units' stats, two crowd mechanics, Coagulation's five tiers, and
twenty-eight numbered acceptance tests. `js/blub.js`, $450, id `blub`, and it
takes the fifth build slot that has been empty since the gunner was deleted.
The full rules are in `AGENTS.md` under "The Summoner"; this records the
decisions, which is what the code cannot show.

**A BLUB IS IN THE `towers` ARRAY, and every other decision falls out of that.**
The brief asks for units that occupy space under the tower packing rule, cannot
be built on top of, open a stats panel when clicked, carry HP, die, and eat area
stuns. `towers` already provides all six — `whyCannotBuild` compares footprint
radii, `towerAt`/`inspected` opens the panel, `sellValue` reads `totalSpent` and
so pays exactly $0, `TowerHealth.tickStun` handles stuns, the destroyed sweep
does the death animation and frees the ground, and `restartGame()` clears the
lot. Building them as recruits instead (`js/soldier.js`, units that are
deliberately NOT towers) would have meant reimplementing all six.

What being in `towers` must not give them is enemy attention, so `isSummon` is
the flag `Enemy.attackCandidates` skips. That placement matters more than it
looks: excluding them from the candidate list rather than at each attack is
what keeps `targets` honest, so an aimed shot taking "the two highest-DPS
towers" can never spend a pick on a blub it cannot hurt.

**ATTACKS ARE INSTANT, not projectiles**, which is a departure from every other
shooting tower here and is entirely about ammunition. A charge must not be spent
on a corpse, and a bullet only claims damage while it is in the air — with
instant resolution the enemy is already dead when the next blub in the same step
looks at it, which is strictly better than a claim and costs nothing. Half the
roster does not fire a bullet anyway: one splashes, one fires a piercing lance
every tenth attack, one detonates when it dies, and a merged monster can hit the
whole map.

**TWO NUMBERS IN THE BRIEF DISAGREE WITH THEIR OWN PROSE, and both were
resolved towards the acceptance test rather than quietly reconciled.** The
Hungry Blub's text says its damage grows by "4% de sa valeur de base,
cumulatif", which reads additive and totals 1176 — but its numbered test says
1473 across 35 charges, and `20 × (1.04³⁵ − 1) / 0.04 = 1472.95`. It compounds.
The SuperBlub's "51 PV n'autorisent que 51 attaques" sits beside a free lance
and an exact count of five: the lance costs no charge, so 51 charges buy 51
paid attacks and five lances fall among the 56 it makes. Both are flagged in
`AGENTS.md` and in the code, because a silent reconciliation is a decision the
owner never got to make.

**Randomness is a seeded xorshift, not `Math.random`.** The brief asks for "un
point aléatoire"; this project does not put a clock or an unseeded generator in
the simulation, for the same reason lane offsets and the boss's attack cycle are
deterministic — a run that cannot be replayed cannot be tested. Seeded off the
tower's own position, so two Summoners lay out differently.

**Three shared changes, each because the rule belonged there and not here:**

- **`whyCannotBuild` now skips a tower at zero HP.** The brief asks for the
  death animation to play while the ground is freed instantly, and for that to
  be "la même pour toutes les tours du jeu". The destroyed sweep runs once a
  step, so without this a spent blub held its footprint until the next frame.
- **`TowerHealth.stun` respects a `stunImmune` flag.** A tier 4 monster blub is
  immune, and the boss's aimed shot, its landing shockwave and the monster's own
  leap all reach for that one function — an immunity at the call sites would
  have been three chances to forget it.
- **`inspectionLayout` learned `action.compact`.** A finished path A carries six
  action rows and at 60 px each the panel grows through the build bar, which
  `sandbox.smoke.js` pins against. A toggle's whole text is a unit name and the
  word ON. Rows are now planned before the height is known and placed by walking
  that plan, so the measurement and the drawing cannot disagree; nothing else in
  the game sets the flag and every existing panel lays out unchanged.

**`js/systems/damage-amp.js` is new, and is deliberately not
`js/systems/buff-stacks.js`.** That tracker is a count of stacks sharing one
refreshed window (the Sniper's kill stacks) — a new stack pushes the whole
thing out. The weakening debuff must decay a thousand hits as a thousand
separate five-second timers, which is the opposite behaviour, and teaching one
module both would have put two behaviours behind one name. It is applied AFTER
mitigation in `Enemy.takeDamage`: it is *damage taken*, so a brute hit for 6
through 5 flat armor takes 1, and at +100% takes 2 rather than 7.

**The index screen walks past B3's cross-branch gate.** B3 requires A2 — the
Cyberblub is an evolution of the Blub III — and the codex's branch walk stops at
any refused tier, so path B would have shown three tiers and hidden B4 and B5.
`satisfyCrossBranchGate` buys the named chain first, structurally off the
upgrade table rather than by parsing "needs A2" out of a sentence, and the tiers
it then shows are measured on the tower a real path-B player actually holds.

**A 90-COIN PURCHASE, NOT A STARTER**, and that was a decision. Putting a tower
that produces free damage forever into the opening kit would move the premise
the whole meta loop rests on — *a fresh profile cannot win* — which
`tools/measure-starter-kit.js` exists to keep checking. One field and a re-run
of that tool if the owner wants it in the starting hand.

**Two renderers, one readout.** The blub count and pooled charges are drawn
over the tower all run, and the 2D pass that draws them lives in
`BlubTower.draw` — which the WebGL branch replaces wholesale, so in 3D they
simply were not there. Same gap the recruit hover readout hit, same fix: the
STRING comes from `BlubTower.counterLabel()` and only the placement is done in
`gl-world.js`'s overlay pass. Verified by reading the GL framebuffer and the
overlay canvas back — 11 blubs paint 10 151 pixels of board that vanish when
they are removed and return byte-identical when they are put back, and the
badge itself is 1 616 pixels of the overlay layer.

`tests/blub.test.js` is the acceptance list, one test per numbered item, 34
passing. Three fixtures moved with the roster: `tests/run.js`'s build-bar line
now expects five towers, its shared-run line counts non-summons (a Summoner
plants its first blub at the 20 s mark, and a raw length would grow for a reason
that has nothing to do with what that line asserts), and `sandbox.smoke.js`
expects the fifth slot filled. The sandbox's `ROSTER` is its own list, not the
meta catalogue — a workbench has no coins — so it had to be told separately.

**The content suite's line in `AGENTS.md` was stale, and this found it.** It
read 182/30; the checkout measures 181/31 with or without any of this, because
two of its tests still assert the 40 s recruit cooldown that moved to 45 s on
2026-08-01. Diffing failure NAMES rather than totals is what showed it.

**2026-08-09 (latest+2) — the Siphon gets a body, and the overlay layer learns
the board has height.**

**THE SIPHON IS NO LONGER A PLACEHOLDER CYLINDER.**
`tools/blender/tower_siphon.py` builds five bodies — base/a3/a5/b3/b5 — against
`td_mesh`, so it needs **Python and not Blender**. 2160–2632 tris each.

**Why this is the tower that carries the wizard read.** The owner asked for the
old magician style to survive somewhere in a project that is otherwise arcane
tech. It cannot be the Warbringer — the model contract caps him by name, *"this
must never become a wizard"*, because he is a smith. The Sniper is a martyr and
the Rifleman a gangster. The Siphon is the only tower with no ballistics at all:
it holds a beam on a body, drains it, banks the drain as gold, heals off it and
at B5 refuses a death. So: a hooded robe, no face but two ley points, a focus
ring held at arm's length, and a brass reservoir he cradles whose fill rises
with the tier. He carries no weapon anywhere. The dais is a `world_fixed` child.

Seven tiers share five bodies — 4 wears 3's, because a tier that buys a rate or
a ratio does not change what a man is carrying.

**EVERY z IN THE OVERLAY LAYER IS A HEIGHT ABOVE THE BOARD, NOT ABOVE ZERO.**
Owner-reported against the previous entry: *"les effets, bullets laser charges
ne montent pas avec le modele de la tour"*. Standing the models on the surface
left the projected layer behind, so a tower on a 9.4 deck rose while its range
ring, charge circle and muzzle anchors stayed on the floor. `project()` adds the
ground height, and `ringPath` projects per point rather than through
`camera.groundCircle`, which solves only against the flat plane.

**AND THEN THE OPPOSITE MISTAKE, reported immediately after:** *"the effects and
the bullets follow the curve, it's funny but very unrealistic"*. Sampling the
ground under every point is right for a decal and wrong for anything rigid or
airborne — a rail cannon's coils and muzzle are spread along a barrel that
overhangs a deck edge, so the weapon's own hardware bent into a curve, and a
shot in flight flew a ski jump over the terrain.

**The rule that came out of it, and it is the one to keep:** a caller that owns
one object pins the reference height for everything it draws (`withGround`).
Tower hardware measures from the height the TOWER stands at, so a weapon stays
rigid however far it overhangs. A shot fixes one reference per round, eased
between the ground it left and the ground its target is on, so it flies a
straight line aimed at the target. Recruits keep their own. Ground decals still
sample per point — that is what makes a range ring drape over an edge.

No regression: stress board 4.44 ms against a 6.00 ms ceiling. All five suites
unchanged.

**2026-08-09 (latest+1) — everything on the board was standing inside it.**

Reported by the owner from two screenshots: a Rifleman built on a raised deck
was buried to the knee in it, and a column of carriers was walking sunk into the
road up to the axles.

**THE BOARD HAS HAD REAL HEIGHT SINCE THE ZONES AND ROAD WERE EXTRUDED, AND
NOTHING EVER TOLD THE ACTORS.** Every actor was drawn at `z = 0` while a deck
top sits at 9.4 and the road ribbon at 7. The models were never wrong; they had
no idea how high the floor under them was, because nothing could tell them.

`gl-world.js` now stamps a coarse HEIGHT FIELD when it builds the map mesh, from
the same numbers the geometry is built from, so the surface a body is drawn
standing on and the surface actually built under it cannot drift apart.
`ROAD_LIFT` became a named constant for exactly that reason — it was a bare `7`
at its one call site. Highest surface wins, so where a route crosses a raised
deck the actor rides the deck, which is the surface that is visible there.

A lookup is two integer divides and an array read: **0.093 µs**, or 0.006 ms per
frame with sixty actors, 0.03% of the frame budget. That is what makes it
affordable per actor per frame instead of caching per entity and going stale the
next time the map changes.

One subtlety worth keeping: a cell counts as covered when its **centre** falls
inside the stamped rect. Rounding outward instead grew every slab by up to a
cell on each side, which put deck-height ground nearly twenty pixels out into
open floor — and the level test below then answered for a deck that was not
there.

**A TOWER MAY NO LONGER BE BUILT ACROSS TWO LEVELS.** New rule, at the owner's
request, and the one placement rule that is not pure geometry from the map data
— it asks the renderer, because the renderer owns board height. See "Placement
rules are derived, not hand-picked" in `AGENTS.md`. Guarded on
`World3D.isEnabled()`, so the flat 2D fallback and the Node suites are
unaffected; all five suites report their unchanged figures.

**2026-08-09 (latest) — the board had no props, its decks were the wrong
colour, and the road had no sides.**

Three findings from a visual quality pass over the whole project. All three are
presentation only; no simulation value, collision volume, path or stat moved,
and all five suites report the same figures as before (105/3, 182/30, 70/1,
45/0, 2 sandbox failures).

**THE SIX MAPS EACH AUTHOR NINE SCENERY PROPS AND THE 3D BOARD DREW NONE OF
THEM.** `buildMapMesh` read `Maps.ENVIRONMENTS[id].zones` and never `.models`,
so every route ran across a bare plane while the map chooser's own thumbnails
showed a decorated one. `gl-geometry.js` gains a scenery vocabulary --
`frustum`, `boxAt` and `scenery` -- covering all ten authored kinds (antenna,
server, reactor, console, pylon, tank, vent, holo, battery, coil), and
`buildMapMesh` bakes them into the STATIC map mesh. They never move, animate or
turn, so nine props cost no draw calls and nothing per frame; measured cost is
+0.13 ms GPU at the light scene.

Each prop is built from its own map's palette, so Mana Coil's props are violet
and Sigil Lattice's are green with no second table to keep in step. Value ladder
per the model contract: dark shell, ley accent as the only bright note.

**`GLGeometry.Builder` now carries a per-vertex emissive channel**, the same one
the Blender exporter emits, so runtime-built geometry can own a lit surface too.
The map pass drives `uGlow` in the map's accent colour and resets it immediately
afterwards. This is the emissive-geometry rule applied to the board: a reactor
core glows and is occluded by whatever stands in front of it, rather than being
a disc painted over the top.

**EVERY ZONE IN THE GAME RENDERED AS `metalDark`, AND `P.panel` WAS NEVER
VISIBLE ANYWHERE.** The skirt around a zone slab was drawn both larger in x/y
AND proud of the slab -- for a deck the slab spanned z 0.4..9.4 and the skirt
8.1..9.5 -- so the skirt's top face occluded the slab's completely. Measured
before: three separate slab tops all read (27,47,60), which is `#132733` through
this pipeline to within 1/255. They now read (26,63,81), and floor-to-slab
luminance separation goes from **7.6% to 37.6%** -- out of the sub-8% "one dark
blob" band this project has already been burned by once on the Rifleman's
palette. The skirt is now a rim below the slab top rather than a lid over it,
which is what its size always implied.

**THE ROAD HAD NO SIDES, ON ANY MAP, EVER.** Both kerb quads in
`GLGeometry.road` were wound with their normals pointing INWARD, and
`CULL_FACE`/`BACK` is enabled in `GLRenderer`, so both were culled on every
frame. Worked through for a road along +X at half-width 10 and lift 7: the +Y
kerb's `u x v` came out (0,-700,0) and the -Y kerb's (0,+700,0), both pointing
back across the ribbon. That file's own header promises "a raised ribbon with
visible kerbs... real height, which is most of why the board reads as 3D the
moment the camera tilts" -- none of which had ever been on screen. Both windings
reversed; a kerb band now reads at luminance 36 against floor 41 and deck 71.

The lesson worth keeping: **a culled face and an absent face look identical, and
neither throws.** Winding is not checkable by looking at a still of the thing
from one angle, which is how this survived. Cross-product the quad by hand, or
turn `CULL_FACE` off for one frame and diff.

**2026-08-10 (later) — three panel shortcuts, and the monster blub comes back
inside the range.**

**X SELLS, O BUYS PATH A, P BUYS PATH B**, at the owner's request, and only
while a panel is open — outside one they are ordinary letters. `Delete` and
`Backspace` keep selling. None of the three is a camera key: panning is WASD
and the arrows, which is why `S` was never available for Sell and `X` is the
key that was, with `O` and `P` beside it in path order.

**The two upgrade keys press the BUTTON rather than reimplementing it.**
`pressUpgradeButton` looks the branch's rectangle up in
`inspectionLayout(...).upgrades` and calls `runPanelAction` at its centre, so it
inherits the context object, `refreshBlockReason`, and the rule that a maxed,
locked-out or unaffordable button swallows the press and does nothing. Calling
`performAction` directly would have been a second implementation of "buy the
next tier", free to drift from the mouse — and it needed no knowledge of any
tower's action ids, because all five types tag their upgrade actions with a
branch letter, the two config-driven adapters included. **The letters are drawn
on the buttons** (`drawKeyHint`), dim, against the right edge, from the layout —
five copies of "  (O)" in five `panelActions` would be five places to go stale.

**THE MONSTER BLUB WAS STANDING OUTSIDE ITS OWN TOWER'S RANGE.** Yesterday's fix
for "place it as near as possible to the track" let the sweep run out to several
times the range, and at tiers 0–2 that put the merged body well beyond the
circle the tower draws. The owner: *"make sure monster blub spawns like a normal
blub inside the range when T 0 1 or 2."* It is bounded to `rangePx` now and
still takes the spot nearest the road within it. Nothing is lost — Coagulation
needs A5 and A5 puts the range at 250 u.l., so a 35 u.l. body always has
somewhere to stand. Measured on all five tiers: T0/T1/T2 land 200 u.l. out
against a 250 u.l. range, 3.8 u.l. from the road, clear of the tower and leaving
it summoning; T3/T4 still fuse.

**A note for the next session that verifies in a browser.** `python -m
http.server` plus Chrome's heuristic cache served STALE `js/*.js` after edits
while reporting a successful navigation, and two placement readings taken that
way were measuring yesterday's code. Re-fetching every `script[src]` with
`fetch(url, {cache: "reload"})` before `location.reload()` is what forces the
real build. Check a known-new symbol exists before trusting a reading.

**2026-08-10 — the fifth tower: the Summoner, and the blubs that do its
shooting.**

**IT NEVER FIRES.** `js/blub.js`, $450, and the fifth build slot — the last one
the bar had. It plants standing units inside its own range and they shoot for
it. **A blub's hit points ARE its ammunition**: every attack costs one and at
zero it dies, which is the whole economy of the tower in one rule and the
reason nothing here has a magazine, a reload or a lifetime timer.

Built against a full written brief — two paths of five tiers, ten unit types,
a swarm buff, a weakening debuff, and Coagulation — with twenty-eight numbered
acceptance criteria. `tests/blub.test.js` is those criteria, one test each,
plus the regressions the session turned up. It runs standalone like the
Longshot and beam suites: **47 pass / 0 fail**.

**THE STRUCTURAL DECISION EVERYTHING ELSE FOLLOWS FROM: a blub is in the global
`towers` array.** It is not a recruit — those live on their parent and are
deliberately not towers. The brief asks for units that occupy space under the
tower rule, cannot be built on top of, open a stats panel when clicked, carry
HP, die, and eat area stuns. `towers` already provides every one of those:
`whyCannotBuild` compares footprint radii, `towerAt`/`inspected` gives the
panel and the Sell button, `sellValue` reads `totalSpent` (0, so the sell
button pays exactly the $0 the brief asks for), `TowerHealth.tickStun` catches
area stuns without this file knowing they exist, the destroyed sweep plays the
death animation and frees the ground in the same step, and `restartGame()`
clears the lot. `isSummon` is the one flag that takes it back out again — for
enemy attention.

**ATTACKS ARE INSTANT, not projectiles**, and that is a deliberate departure
from every other shooting tower here. A charge must not be spent on a corpse,
and instant resolution is strictly better than a claim: the enemy is already
dead when the next blub in the same step looks at it. Half the roster does not
fire a bullet anyway — the Hungry Blub splashes, the SuperBlub fires a free
piercing lance every tenth attack, the Mechablub MK2 detonates when it dies,
and a monster blub can hit the whole map.

**TWO FIGURES IN THE BRIEF DISAGREE WITH THEIR OWN PROSE, and the acceptance
test won both times.** The Hungry Blub's stated 1473 total across 35 charges
requires **compounding** 4% growth (additive totals 1176; `20 × (1.04³⁵ − 1) /
0.04 = 1472.95`), not the "4% of its base value" the sentence above it
describes. And the SuperBlub's five lances follow from a lance that costs no
charge. Both are flagged in the code and in `AGENTS.md` rather than quietly
reconciled.

**Also new, and both shared rather than tower-specific:**

- `js/systems/damage-amp.js` — the weakening debuff's stacks. NOT
  `buff-stacks.js`: that one is a count sharing one refreshed window, and the
  brief wants a thousand hits inside a second to decay as a thousand separate
  five-second timers. Running total plus a head index, so both operations are
  O(1) amortised on an enemy carrying its capped thousand stacks. Applied in
  `Enemy.takeDamage` **after** mitigation, because "+X% dégâts subis" is damage
  this body takes rather than a bigger swing armour then eats — before
  mitigation the same debuff would be worth twelve times as much against a
  swarm as against the armour it exists to crack.
- `TowerHealth.stun` learned `stunImmune`, checked in the one place rather than
  at the three call sites that stun.

**A SHOCKWAVE STUNS SUMMONS AND ONLY STUNS THEM.** The brief keeps both halves —
blubs cannot be attacked, but they take area stuns — so they are absent from
`attackCandidates` (no damage, and they can never soak an aimed shot meant for
a real tower) and a leap sweeps them separately for its stun alone. An aimed
shot picks one tower by name and has no area, so it does not qualify.

**Six corrections came out of playing it, and each is worth its own line:**

- **THE MONSTER BLUB WAS BLEEDING ITSELF TO DEATH ON AN EMPTY BOARD.** Its leap
  fired on a bare timer, and a tier 2 leap costs 20 charges — so a monster
  between waves spent 20 every 15 seconds into nothing. It is an attack now: no
  targets, no leap, and the clock **holds at zero** rather than banking, so the
  blow lands the instant a wave arrives. Same hold-at-zero rule an idle rifle
  has followed since v0.4.7.
- **A BLOCKED LINE NOW WAITS AT FULL INSTEAD OF STARTING OVER.** The brief said
  a failed cycle simply came round again; in play a full board spent every
  interval counting down to another failure, so a space that opened sat empty
  for up to thirty seconds. The bar pins full, the box says "no room", and the
  body lands on the frame a space opens.
- **THE SUMMON TOGGLES LEFT THE PANEL FOR A RAIL BESIDE IT.** Three action rows
  cost the panel its height and needed a layout exemption to fit; as grey boxes
  in a column they cost it nothing and the colour says "status, not shop".
  First cut opened a second panel view with a Producing/Stop button inside it,
  which the owner reported as "an unknown behavior" — clicking something that
  looks like a switch handing you another screen with a different switch on it.
  **The box is the switch now**: lit while producing, dim when clicked, with the
  base stats on the hover card, which is the gesture that cannot change
  anything.
- **COAGULATION STOPPED REPLACING THE TOWER BELOW TIER 3.** Putting the monster
  on the tower was wrong twice over under tier 3 — it hid the thing still doing
  the work, and it made a body that has to shoot stand wherever the tower
  happened to be built. T0–T2 go to the free spot nearest the road; T3 and T4
  fuse, because there the monster IS the tower.
- **A SOLD BLUB WAS A GHOST IN EVERY NUMBER.** It left `towers` — so it could
  not shoot and could not be clicked — while still counting towards its
  summoner's blub count, pooled HP, the swarm buff every other blub drew on,
  and the next Coagulation's tier. `sellTower` tells the owner now, through
  `isDestroyed`, so all five readers are fixed at once.
- **LAYING OUT THE PANEL PERMANENTLY SHORTENED A SUMMON CLOCK.** The fix for
  "a faster tier must bring the next body closer" was a clamp inside
  `recalcStats` — and `previewUpgrade` measures a tier by setting its flag,
  recalculating, and setting it back, so merely drawing the panel previewed A1's
  18 s cycle, clamped the running 20 s clock to 18, and left it there. It lives
  in `applyUpgrade` now. Same trap the HP grant documents one function down, and
  the same answer: a purchase is the only thing that may move live numbers.

**THE INDEX WAS TRUNCATING PATH B AT ITS CROSS-BRANCH GATE.** B3 requires A2 —
the Cyberblub is an evolution of the Blub III — and `walkBranch` stops at any
tier the tower refuses, so B4 and B5 were absent from the field guide entirely,
which is the one thing the field guide exists to prevent. A refusal that NAMES
another tier the specimen could buy is a route, not a wall: it buys it and asks
again. The Siphon's B5 gate names no tier, so that one still stops, as it
should.

**The panel layout gained `action.compact`** — a 34 px row that pairs with the
next one, for a switch rather than a purchase. Nothing sets it today (the
toggles moved to the rail before it shipped), so every existing panel lays out
exactly as it did; it is kept because the row planner it required is the
clearer code and because the next switch will want it.

**Two stale test lines were corrected on the way past.** `tests/content.test.js`
asserted "the gunner has no upgrade paths" against entry 0 of the roster — the
gunner was deleted on 2026-07-30 and everything shifted down a slot, so it had
been asserting that the **Warbringer** has no upgrade tree ever since. And
`tests/run.js`'s shared-run test counted `towers.length`, which a Summoner grows
for reasons that have nothing to do with what the line asserts.

**Sandbox only:** 5×, 10× and 20× on top of the game's 1×/2×/3×, by extending
`GAME_SPEEDS` rather than by replacing the button — speed is applied in exactly
one place and a second implementation would stop the workbench being a truthful
preview of the loop. And **base HP 100 000**, so a leak is a reading rather than
an ending. Neither touches the game.

**Priced at 90 coins in the armoury, NOT a starter.** `starter: true` would put
a tower that produces free damage forever into the opening kit, and the premise
the whole meta loop rests on — a fresh profile cannot win, which
`tools/measure-starter-kit.js` exists to keep checking — is measured against the
kit as it stands. If it belongs in the opening hand that is one field plus a
re-run of that tool.

**2026-08-09 (late) — the hammer came out of his chest, and the check that
should have caught it was worthless.**

**THE A4/A5 HAFT RAN STRAIGHT THROUGH HIS TORSO.** The rest pose put the weapon
on his centreline (y = -0.02) with the butt behind his shoulder and the head on
the ground in front, which is a line through his chest and hips. It now rests
off his ribs at `_SIDE`, where a man actually leans a tool.

**AND THE CLEARANCE CHECK REPORTED A COMFORTABLE GAP THE WHOLE TIME.** It
compared VERTEX TO VERTEX, and two boxes interpenetrate happily with their
corners far apart -- so a haft buried in a torso measured as 10 mm of clearance.
It was documented as "a proximity measure, not a proof", which was honest and
useless: a check that cannot fail on the thing it is named after should not have
shipped.

It now tests the weapon SOLIDS against the body SOLIDS as boxes and reports how
deep the worst one goes (`td_mesh.overlap`, `tower_warbringer.penetration`), and
the build FAILS on any overlap. Three classes of part are excluded and each for
a stated reason: hands and forearms, because closing on the haft is the point;
ley veins and the A5 core, because they are inlaid in the head; the anvil pad
and the stakes, because the head is supposed to rest on the deck. All seven
bodies now report 0.000 across all eight frames.

**THE WARBRINGER'S AOE NEVER DREW.** `drawReach` looked for `core.stats
.targetShape`, which the Smasher does not have -- it predates the config-driven
towers and keeps `arcDegrees` / `fullCircle` on itself -- so inspecting one
showed a plain circle where the real reach is a 120 degree wedge, or nothing
that matched the panel's own "AOE" row. It has its own branch now: a wedge on
its live aim below A4, a full circle from A4.

**PATH B'S STAKES GOT THEIR OWN IMPACT.** `warbringer-ring`: three rings chasing
each other outward at different speeds, teal like the stakes, with almost no
disturbance of the floor -- the tier hums, it does not split rock. The A path
keeps the forge-slam. `swing()` picks the kind off `hasUpgrade("B3")`, so one
event still resolves at one instant and only the picture differs.

**2026-08-09 (night) — the Warbringer winds up before it hits, recruits raise
their rifles, and path B plants stakes.**

**THE FIRST BLOW USED TO LAND INSTANTLY, ON ONE ENEMY, WITH NO ANIMATION.** A
long-standing bug the owner had been looking at. `attack()` applied damage the
moment a target appeared and then spent the cooldown playing the animation — so
the swing on screen was a REPLAY of a hit that had already happened, and a fresh
tower's cooldown is zero, so its first blow had no animation at all.

The swing is a real wind-up now: sighting starts it, `swingSeconds()` of
animation plays, and damage resolves at the END against the zone AS IT IS THEN.
That is also why it stops hitting only one enemy — half a second is long enough
for the rest of the group to walk in, which is what an overhead slam should be
waiting for. `swingProgress()` reads the wind-up instead of the cooldown, so the
frame showing the hammer touching the ground IS the tick that resolves it.

**The RATE is unchanged**: the wind-up is taken out of the cooldown that
follows, so a full cycle is still `cooldownSeconds`. Six content tests encoded
the old instant-damage behaviour and were updated to step the swing out through
a new `runSwing()` helper; one asserted the slow never lapses from a hard frame
6, which was really asserting that the hammer teleports, and now counts from the
first application instead.

**A4/A5 REST WITH THE HEAD ON THE GROUND**, at the owner's request — a monolith
on a haft, stood on the deck by his front foot with the shaft raked back to his
hands. He is leaning on it. The blow hauls it up past vertical, hangs for a
beat, and drives it down through the front. **Frames went 4 -> 8**: the arc
sweeps about 165 degrees and four frames could not describe it without the
hammer appearing to jump. Frames cost one 4x4 per group each, so eight is about
a kilobyte.

**PATH B PLANTS RESONATOR STAKES** (`build_b`, three bodies). He keeps a hammer
— a SHORT one, choked up for speed, because the tier sells rate and not weight —
and drives tuned stakes into the road instead of swinging at bodies. B3 plants
one, B4 a line of three, B5 a full ring, which is the shape of what each tier
does: one target, a chain, then everything at once. The stakes hang off a
`world_fixed` node, so they stay driven into the road while he turns.

**RECRUITS RAISE THEIR RIFLES.** The recoil landed, but the weapon never came up
— the rig carries it at the HIP (group origin z 0.70) with the barrel pointing
**36 degrees into the ground**, while `SoldierRecruit.fire` spawns the round at
30.1 u.l. high and 18.2 forward. So the rounds left a barrel aimed at his own
boots, which is exactly what "the bullets come out of thin air" looks like.

The aim pose is SOLVED FROM THE GEOMETRY rather than typed in: it reads the gun
group's own breech and muzzle out of the shipped model, works out the rotation
that levels that line, and then the translation that lands the tip on the spawn
point. Two hand-derived attempts missed — the first ignored the rotation
entirely, the second got its sign backwards and doubled the droop. Measured on
the real draw afterwards: barrel pitch **0.0 degrees**, muzzle height exact,
reach within 0.6 px. The small lateral offset is kept deliberately — a
shouldered rifle sits beside the spine, not on it.

`drawActor` grew an optional per-group pose applied on top of the baked frame,
and `GLMath.localPose` builds those matrices: rotate about a pivot, then
translate, in the group's own space. That ordering is what lets a recoil be
written as "swing the rifle about the shoulder and shove it back", which is what
a recoil physically is.

**2026-08-09 (evening) — the Warbringer's A path is in the game, recruits shoot,
and models can now be built without Blender.**

**`tools/blender/td_mesh.py` — THE SAME PRIMITIVES, NO BLENDER.** Blender is not
installed on the owner's machine, so a new model could not be authored at all.
This is a bpy-free implementation of td_scene's vocabulary (box, cyl, ball,
frustum, ellipsoid, tube, torus) that emits export_mesh's EXACT file contract:
same grouping rule, same group-local storage at frame 1, same column-major
per-frame matrices. `gl-models.js` cannot tell the two apart. Blender stays the
source of truth for anything that also needs a rendered sprite sheet.

One contract difference, documented in the file: **geometry is authored in WORLD
space and `parent` selects the animated group, not a second transform.** Baking
`location` into the vertices is what lets `_hands_on` put a fist on the haft by
naming the point on it. The first version also applied the parent chain and
transformed everything twice — the hammer floated a metre over his head.

**THE WARBRINGER, PATH A** (`tower_warbringer.py`, four bodies): a smith with a
sledge that grows through A1–A2, takes ley in the metal at A3, and by A4 is
holding a monolith overhead. Both hands close on the haft, and every hand is a
point along the haft's own axis, so the grip cannot drift off the shaft.

- **A4/A5 STOP TURNING**, which is the owner's read of the gameplay and exactly
  what the code does: `fullCircle: true` makes the wedge 360°, so `facingTarget`
  stops meaning anything. `gl-world.js` passes yaw 0 for a full-circle
  Warbringer — refusing the yaw at the CALL SITE covers the whole model, where a
  `world_fixed` group would have left his arms and hammer swinging round.
- **The fractured ring is drawn, not modelled.** As geometry it was invisible:
  the map's `deck` zones stand 9 px proud of the ground plane, so a crack lying
  0.4 px above z=0 is buried under the tile it is splitting. Anything that must
  lie FLAT goes through the camera; solid props with real height stay geometry.
- **The swing** comes from `swingProgress()`, already derived from the cooldown
  and already landing at 1 exactly when damage does. The frame mapping was
  `1 + floor(swing * (frames-1))`, which never showed frame 1 and held the last
  pose for two thirds of the blow; it is `floor(swing * frames)` now.
- **The ley lights on the blow**, not on a timer — dark while he waits, brighter
  as it comes over, a hard flash at contact.
- **`warbringer-swing` gets its own impact**: ground splitting from one point,
  not a shockwave. A shockwave is a ring travelling through air; this is a
  hammer arriving.

**A CLEARANCE CHECK, because "the hammer isn't passing through him" was asked
for by name.** Every weapon vertex against every body vertex, per frame, in
world space. His arms are excluded from both sides — a forearm across the chest
is a man holding something. It is a proximity measure, not a proof of
non-intersection, and it caught the two real failures: a swing that pivoted at
his ankles instead of his shoulders, and a pitch sign that swung the head
backward through his own back.

**RECRUITS SHOOT.** They had no firing action at all — a holding recruit was
pinned to frame 0 while rounds left him. `drawActor` now takes an optional
per-group pose applied on top of the baked frame, so the rifle drives back and
the muzzle climbs on the same `cooldown` the shot is fired from, the body
absorbs a fraction of it, and nothing is stored. The rig already had `arm_l`,
`arm_r` and `gun` as separate groups; this is real geometry moving, not a
sprite swap.

**2026-08-09 (later still) — a prop must be frozen WHOLE, and there is now a
tool that checks it.**

Reported: the B5 hat rack "separed, some part move some part doesn t". Exactly
so, and the numbers say why. The rack's posts sit 0.30 from its centre and its
outer hats 0.262 — while the back of the man's overcoat sits 0.30 to 0.34 from
the same point. **The two ranges overlap, so no radius separates them**: 0.42
took his coat (yesterday's bug), 0.25 cut the stand in half. What separates a
rack from a man is x, not distance.

So `gl-parts.js` grew **axis-aligned box volumes**, and the rack, the dais and
the strongbox now use them. The strongbox was torn the same way and nobody had
noticed: its body was frozen while its dial (0.84 out, past the 0.80 radius) and
its gold bar (z 0.315, past the deck cut) still turned with the man.

**THE WARBRINGER CONCEPT IS WRITTEN**, in
`tools/blender/WARBRINGER_CONCEPT.md`, from the owner's brief and before any
modelling — the same order the Rifleman was done in. The one finding worth
repeating here: the owner's instinct that at full AoE "he doesn't bother hitting
the enemies, he stops turning" **is what the code already does**. `fullCircle:
true` at A4/A5 makes the wedge 360°, so `facingTarget` stops meaning anything
and the tower has no facing left to track. So at A4/A5 the ENTIRE model is
`_world_fixed_child` — the cleanest possible case of the map-fixed contract, no
volumes to tune and nothing that can tear. The doc also ranks the next five
enemies to model, by how badly a coloured sphere lies about each one.

**A TORN-PROP DETECTOR, because eyeballing this does not scale.** A prop is a
cluster of solids that TOUCH; if part of that cluster is map-fixed and the rest
is not, it tears the moment the tower turns. The tool flags every grounded
solid that is NOT fixed but whose bounding box touches one that is. Run it after
changing any volume. It reports contacts as well as tears — a man's boots on the
deck he stands on will always show up — so each hit is read against the build
script rather than fixed blindly. On the current set every remaining hit is a
genuine figure-on-prop contact.

Bias, at the owner's instruction ("be cautious with the details"): when a solid
is borderline, let it TURN. A detail that turns with the tower is a far smaller
error than a prop split down the middle.

**2026-08-09 (later) — the readouts came back, the volumes stopped eating the
man, and this log moved out of `AGENTS.md`.**

**THIS FILE EXISTS AS OF TODAY.** The owner asked whether a 7 500-line
`AGENTS.md` was really necessary. It was not: 3 800 of those lines were this
log, so the rules were buried under the history. `AGENTS.md` is now 3 700 lines
of what is TRUE NOW; every entry is preserved here, unchanged.

**HEALTH BARS WERE DRAWN AT THE WRONG HEIGHT, WHICH IS THE SAME AS NOT AT ALL.**
The lift came from `footprintPx * 2.6` — footprint measures how much GROUND a
tower occupies. A Rifleman's is 11.7 and he stands 64 px tall, so the bar was
painted across his waist: a dark bar on a dark coat, invisible in play. Models
now record their own top at expand time (`model.top`, gl-models.js) and every
readout hangs off that. A sphere or a stand-in cylinder still falls back to the
radius rule, because for those the old figure was right.

**A SHIELD IS A SECOND POOL AND IT EMPTIES FIRST.** The bar read only `health`,
so a Bulwark could absorb a dozen hits with nothing to show for it — each one
lands on the shield, health stays full, and the bar suppressed itself as
undamaged. Enemy bars now carry a shield strip, the same split the 2D hover card
always used.

**THE HOVER READOUTS WERE NEVER PORTED.** `drawEnemyHover` and
`drawRecruitHover` live inside the 2D world block that the 3D branch replaces,
so pointing at a body gave a ring and no numbers. Both are now drawn by
`World3D.drawOverlays`, anchored to the projected crown of the body so they
follow the camera, with the recruit's own reach ring restored alongside.

**THREE PROP VOLUMES WERE SWALLOWING THE FIGURE.** Reported: "b4 and b5 torso
and part of his legs count as the non moving part." All three were volumes sized
to a comfortable radius rather than to the prop:

- B5's rack, r 0.42 at x -0.66, reached x -0.24 and froze the back of his
  overcoat and his shoulders. Now 0.25, which covers the rack and its hats.
- B3's spotlight, r 0.30 at (-0.30, -0.40), reached the man's own y and froze
  his near arm. Now 0.20.
- A3's stand, r 0.30, took his shoulder and hip arm. The servo box genuinely
  sits 0.27 from the stand centre and his arm sits 0.26 to 0.30 from the same
  point, so no single radius separates them: the stand is now a tight 0.22 and
  the servo has its own small box high up, where no part of him is.

And a guard that makes the whole class of bug harder to reintroduce: **a
component that dips below the ground plane can never be map-fixed**
(`GROUND_EPS`). Ground props rest on the ground by construction; the Riflemen
are authored with their origin at hip height and their legs running to z = -0.5,
so this alone rules the figure out of every volume drawn around him.

**The lesson about testing, again.** The zero-pixels-moved test proves the fixed
set does not ROTATE. It says nothing about whether the fixed set is CORRECT — it
passed with his torso in it. What found this was rendering the two sets
separately and looking at them, which is now the documented check.

**2026-08-09 — the ground stopped turning, the guns light themselves, and the
rules for the next model are written down.**

The owner's verdict on the result: the game "feels much much much better". What
follows is the mechanism, and **the contract every future model has to meet is
now a body section — "Building a model that looks like the ones that already
work"** — rather than something to be reverse-engineered out of this log. The
Warbringer and the Siphon are the next two, and they should meet it from the
first commit.

**LIGHTING WAS RAISED**, at the owner's request, once the models stopped being
lit by canvas blobs sitting on top of them: key 0.88 -> 1.02, ambient and fill
lifted in the same proportion. The RATIO is untouched, so a sunlit top face
still lands near the authored colour instead of blowing out.

**EVERY BASE ON EVERY MODEL IS NOW MAP-FIXED**, not just the two that were
reported. A sweep of all twelve tower models — searching the exported geometry
for wide flat solids sitting near z 0, then reading the build script to confirm
what each one is — found three more that were turning:

- Rifleman B5's `dais`: the deck, lip and four corner crates he stands ON, and
  the largest single surface on the model.
- Rifleman A3's `feed_stand`: foot, chromed column, clip rack, servo and the
  case leaning against it.
- Sniper A4's `mount_base` / `mount_ring` / `mount_glow`: the squat bolted
  mount. The cut is at z 0.36, because everything above it — yoke arms at 0.49,
  axle and trunnions at 0.72 — is the GIMBAL, which genuinely does swing with
  the weapon.

Sniper base/A3/B3/B4 have no base geometry at all (`build_caster`: "NO PLINTH --
Tower.draw already puts a raised platform under every tower"), so there is
nothing to fix on those and nothing missing. That was checked rather than
assumed: an earlier draft of this entry claimed the same about A4 and was wrong.

The A3 stand volume is authored 0.06 off the stand's own centre: his rear shoe
sits 0.26 from that point and the stand's foot is 0.23 wide, so centred on the
authored value the two overlap and centred here they do not. That kind of nudge
is exactly what clause 1 of the model contract exists to make unnecessary.

**WHAT IS BOLTED TO THE MAP NO LONGER PIVOTS WITH THE WEAPON.** A tower turns to
face its target, and in 3D that is a yaw on the whole mesh. Right for a man with
a rifle; wrong for what he is standing among. A5 is a floating cannon on an
installed foundation, B5 is a prisoner chained to four stone obelisks, and the
Rifleman fights from behind crates with a spotlight on a stand. All of it
orbited once per turn.

The Blender rig already knew. `tower_sniper.py` builds both foundations under
`_world_fixed_child`, whose driver cancels the aiming parent's yaw precisely so
the shrine stays bolted to the same world corners in all 48 sprite rows. That
did not survive the export: **a driver is not an action**, so
`export_mesh._group_root` walked straight past it and the foundation landed in
the same unnamed group as everything else that does not animate. The Rifleman's
scenery was never counter-yawed at all — it hangs off the aim root, so it span
in the sprites too; stopping it is a change to the design, at the owner's
request.

Fixed at both ends:

- `export_mesh.py` now recognises those nodes and emits a `world_fixed` group.
  The next Blender run makes the runtime recovery below dead weight.
- Blender is not installed here, so the models on disk cannot be re-exported.
  `js/gl/gl-parts.js` recovers the same subtrees from the shipped geometry:
  union-find over shared vertex positions puts exactly one authored primitive
  in each connected component (every `td.box`/`td.cyl`/`td.ball` is its own
  mesh, and two that merely overlap share no vertices), each component is
  classified WHOLE against volumes taken from the build script's own placement
  calls, and the triangles are stably partitioned so the map-fixed ones are a
  contiguous head of the unnamed group. `drawActor` draws that head with the
  yaw taken out — one extra draw call, no second mesh.

Classifying whole components rather than triangles is the part that matters:
half a crate turning would be worse than all of it turning. Only the unnamed
group is reordered; the animated groups own explicit ranges and their own
per-frame matrices, and moving a triangle across that boundary would hand the
bolt's pose to the stock.

Verified by suppressing every draw that carries a yaw and diffing the
framebuffer at two different aims: **zero pixels moved**, on both snipers and on
the Rifleman. (The naive test — diffing the whole tower — is useless here: the
barrel sweeps over its own foundation, so occlusion changes those pixels
whether or not anything rotated.)

**THE CHARGE IS THE WEAPON NOW, NOT A DECAL OVER IT.** The wind-up was drawn as
translucent discs on the 2D canvas, one per authored coil point. Being canvas
they sat on top of the entire board — visible through the barrel, through the
enemies standing in front of the tower, through everything — which reads as a
sticker rather than as a machine warming up, and the owner's word for it was
"ugly".

These models already carry emissive materials on exactly the right parts: the
coil stages, the arc core, the aperture, the breech orb, the pylon lamps. That
emission used to be folded into the vertex colour as a floor, which is right for
a cigar and wrong for a weapon. It is now its own per-vertex channel with a
`uGlow` uniform driving it, so a tower hands its firing cycle straight to the
shader and the light lands on the geometry it belongs to — **occluded by
whatever is in front of it, because it is real geometry.** Cubed against the
cycle, so most of the cycle is dark and it winds up just before the shot; a
linear ramp reads as a lamp on a dimmer. What stays on the canvas is only what
geometry cannot do: current arcing across a gap, the spinning rune circle, and a
faint heat haze in the air at the mouth.

**THE B-PATH RELOAD READOUT AND THE STUN CAME BACK.** From B3 the Sniper fires
four and stops for a beat, which is the one thing about it a player can act on.
The 3D port lost the pips, so the tower simply stopped firing with nothing on
screen to say why. Restored as pips above the tower with a countdown bar under
them while reloading — and gated on `stats.flags.reload`, not on the presence of
the tracker, because the tracker is built from config for the whole tower type
and a graft-path cannon that never reloads was showing four pips of nothing. The
stun (B5 pays seven seconds for its strike) now carries a countdown arc on the
ground and three sparks orbiting the head, rather than a ring indistinguishable
from a selection mark.

**HOW THE MAP-FIXED CLAIM IS TESTED**, because the obvious test is wrong.
Diffing the whole tower between two aims proves nothing: the barrel sweeps over
its own foundation, so occlusion changes those pixels whether or not anything
rotated — it read as a failure twice before that was spotted. The test that
works is to suppress every draw whose matrix carries a yaw, leaving only the
geometry claimed as map-fixed, and diff THAT at two aims. All seven models with
declared foundations move **zero** pixels.

All four suites at baseline: 105/3, 182/30, 70/1, 45/0.

**2026-08-08 (night) — every tower effect is in the 3D build, and three
projection bugs that were quietly wrong came out with them.**

**THE EFFECTS ARE PORTED, NOT REINVENTED.** `js/gl/gl-world.js` now draws
everything the 2D pack drew, from the same tables and the same constants:
the Arcane Sniper's coil charge (`SNIPER_FX`, the authored muzzle and coil
points `tower_sniper.py` prints), A4's arcs jumping between lit coils, A5's
rune ring around the muzzle and its five kill-stack hoops, the A4/A5 lance and
the remnant it leaves, B5's covenant round and the seal it breaks on contact,
the three-second channel telegraph and the strike that resolves it, the
Rifleman's per-tier rounds and muzzle star, and the recruits' poorer version of
both. Where 2D drew a screen-space ellipse for a thing lying on the board, 3D
projects the real shape per vertex — a ritual circle is a ground circle under
this camera, not a squashed sticker.

Two rules the port is built on, both learned the hard way here:

- **A beam keeps its WIDTH and loses its ALPHA.** Pierce falloff eats the
  shot's damage as it travels; carrying that in the width draws a cone, which
  says "spreading out" — the opposite of what a rail lance does. One `beam()`
  serves the live shot and its remnant so the afterimage cannot disagree with
  the shot that made it.
- **Light is sized in WORLD units.** `glow()` takes a board-pixel radius and
  converts. A muzzle flash pinned to a screen-pixel radius is the size of the
  whole weapon once the board is zoomed out.

**`project()` RETURNED THE SAME OBJECT EVERY TIME.** It projected into one
shared scratch, and `worldToScreen` writes into whatever it is handed and
returns it — so two calls returned one object. Almost everything here holds two
points at once: a spark's head and tail, a beam's muzzle and head, the four
corners of a light column. Every one collapsed to a zero-length line the moment
the second call overwrote the first, which is why sparks drew as bare dots and
the debris fan drew nothing at all. It reads as a design choice right up until
someone holds three points. Each call allocates now; a few hundred small objects
a frame is nothing beside the gradients this file already builds per shot.

**`worldToScreen`'s SCALE CAME FROM THE VIEW-PROJECTION.** It read `vp[5]`,
which is a term of `proj * view` and therefore carries the camera's yaw and
pitch: orbiting the board changed it by a factor of five while neither the depth
nor the lens had moved, so every spark, bar and bloom silently shrank as the
player turned. It reads `_proj[5]` — `1 / tan(fovY / 2)`, the lens alone — and
now matches measured pixels-per-world-unit to 0.06%. The compensating `* 0.5`
that had been sprinkled over every caller is gone with it.

**`viewProjection()` REBUILT THREE MATRICES PER PROJECTED POINT.** It is called
once per point, not once per frame, and the overlay layer projects every vertex
of every ring, cone and spoke — so a 44-point ring paid for 44 lookAts, 44
perspectives and 44 multiplies. Cached on eight numbers (eye, target, lens);
`_recomputeBasis()` rewrites `_eye` whenever the camera moves, so it cannot go
stale. A crowded board with 24 live impacts went 22.2 ms → 16.1 ms.

**THE STRAY RING BESIDE THE PANEL WAS `drawInspection`, AND HAD BEEN ALL
ALONG.** Reported three times and "fixed" twice on the wrong suspect. It draws
the subject highlight and range circle at the tower's WORLD position but after
`ctx.restore()`, in raw logical screen pixels. In 2D that is correct by
construction — the world transform is identity at the default camera, so world
(560, 300) and screen (560, 300) are the same point. Under the 3D camera they
are not the same point and cannot be made into one, so it painted a 260 px
circle at logical (560, 300), which lands next to the inspection panel. It now
draws neither when the 3D world is on; `drawOverlays` owns both marks, and the
inspected tower's footprint ring is amber to keep the panel's colour language.

**A NaN ALPHA IS A THROWN EXCEPTION, NOT A BAD-LOOKING BEAM.** `addColorStop`
rejects `rgba(r,g,b,NaN)` with a SyntaxError, and this runs inside `draw()` — so
one shot with incomplete falloff parameters took out the whole frame, HUD
included. `beam()` clamps.

**AND THE NaN WAS REAL, NOT A TEST ARTEFACT — IT WAS CRASHING sandbox.html ON
EVERY LOAD.** `Pierce.damageAtIndex` read `params.softener` and `params.decay`
blindly, though this file's own header has promised the spec's 20 and 0.95 as
defaults since it was written. A tower holding the `pierceFalloff` FLAG with no
mechanics block — a legal intermediate state while an upgrade tree is authored,
and what the sandbox scene produced — returned NaN.

This is a simulation bug, not a cosmetic one, and NaN is the worst possible
answer to give here: it is not `<= 0`, so `PierceBullet`'s "the falloff has worn
this shot out" test does not catch it, and the shot goes on to call
`enemy.takeDamage(NaN)`. It only surfaced because the renderer now treats that
number as an alpha and canvas refuses to. `damageAtIndex` implements the
documented defaults.

Verified in the browser on the real game, not on a harness: recruit bars sampled
pixel-by-pixel at 0.97/0.75/0.40/0.15 health and matching the authored green,
amber and red exactly; the cone wedge and its cursor-following re-aim preview
committing the angle it previewed; the channel, strike, lance, remnant and
covenant round each framed and read; 20 maxed towers with 60 enemies and 40
rounds in flight at 50 fps with the overlay layer measuring at essentially zero
cost against the WebGL pass. All four suites at their recorded baselines:
105/3, 182/30, 70/1, 45/0.

Also fixed `.claude/launch.json` in the repo root, which still served
`TD_0.4.13`.

**2026-08-08 (evening) — the models animate, the effects have shape, and the
last pointer bug is gone.**

**RIGID-GROUP ANIMATION, NOT VERTEX FRAMES.** The obvious export is a copy of
the mesh per frame, and for these models it is enormous: the base Rifleman is
9224 triangles, so four frames of a bolt cycle in which only the bolt moves is
about 2.8 MB. Every rig here animates by keying EMPTIES and the geometry
hanging off each one is rigid, so `export_mesh.py` now walks up from each mesh
to its nearest animated ancestor, stores the geometry once in that empty's
local space, and writes one 4x4 per group per frame. **The Rifleman's whole
animation costs 2 KB** (687.9 against 685.7). The runtime uploads one mesh and
issues a draw call per moving group.

Animated: all five Rifleman bodies (4 frames), both recruits and all four
enemies (8), and the Sniper's base/B3/B4 (4). A3-A5 and B5 are stills on
purpose -- those tiers charge rather than reload and that was always drawn
procedurally.

**The clocks are the ones that already existed.** Towers index the cycle off
`gearPhase()`, which already reconciles burst and automatic fire; enemies and
recruits advance by `progress`, so a planted foot stays on one patch of road, a
slowed enemy's legs drag and a stopped one stops mid-step. Identical mapping to
the sprite sheets -- the 3D board plays the animation the 2D board could only
flip between. Measured with 25 towers and 62 enemies: **1.23 ms/frame, 411 draw
calls, 494k triangles.**

**Effects have structure now.** A blast was one translucent disc that grew and
faded, which reads as exactly that -- a circle appearing. It is now a
shockwave lying ON THE GROUND: a thin bright leading edge, a dimmer wake
chasing it, a scorch that outlives both, and a deterministic debris fan. Sparks
follow a real ballistic arc and are drawn as short streaks along their own
path with a hot core while fresh, rather than as round dots that shrink. All on
the ground plane deliberately -- a camera-facing blast would swing around as
the board turned, and lying flat is the one thing a 3D board can say that a 2D
one cannot.

**`worldMouse` was stale for a frame or three, and it was the last of the
pointer bugs.** It was recomputed on mousemove, which covered every case in 2D
because the 2D camera only moved during a drag and a drag IS a mousemove. The
orbit camera keeps easing for a few hundred milliseconds after the mouse stops
and refits itself when a map loads, so the ground under a stationary cursor
kept changing with nothing to trigger a refresh -- **98 px of drift**, showing
up as a build ghost and a range ring sitting away from the cursor.
`refreshWorldPointer()` now also runs once per frame while 3D is on.

**2026-08-08 (later still) — the 3D overlays were in the wrong coordinate
space, and five bugs fell out of one line.**

**THE CANVAS HAS THREE COORDINATE SPACES AND THEY ARE NOT INTERCHANGEABLE.**
`VIEW_WIDTH`x`VIEW_HEIGHT` is the fixed LOGICAL space every 2D draw call and
every `toGameCoords` result lives in; the CSS box is whatever the window makes
it; the backing store is CSS times device ratio, capped. `worldToScreen`
returned CSS pixels and `screenToWorld` divided by the BACKING STORE. Neither
matched the space the game speaks, so:

- the build ghost and its range ring sat away from the cursor,
- clicking a tower missed it, so upgrades were unreachable,
- health bars, hover rings and effects were all displaced,
- and the error scaled with window size, which is why it looked arbitrary.

`OrbitCamera` now takes a `viewport` (set to the logical view) that
`worldToScreen` and `groundCircle` project into, plus `viewToClient` as the
explicit inverse of `toGameCoords`. A logical -> world -> logical round trip is
exact at every probe. **When adding anything that draws in world space, say
which of the three spaces the number is in.**

**Right-drag did nothing immediately after an orbit.** The orbit pivot outlives
the middle-drag until the easing settles, and while it lives `update()`
recomputes the target from it every frame -- overwriting whatever the pan had
just set. Two gestures cannot both own the target, so starting a pan drops the
pivot.

**No range ring ever drew in 3D.** `showRange` was assigned inside the 2D world
block, which the 3D branch skips. It is set in `worldRenderState()` now, so one
rule serves both renderers. The inspected tower also gets its deadzone and
footprint rings, without which a Sniper cannot be repositioned by eye.

**Every sphere enemy was the fallback grey.** The authored colour is on
`enemy.type.color`; the code read `enemy.color`, found undefined, and fell
through -- silently, and it looked deliberate.

**The hover ring stuck to dead enemies.** `hoveredEnemy` only refreshes on
mousemove; `drawEnemyHover` has always re-asked `enemyAt` per frame for exactly
that reason, and the 3D path now does too.

**2026-08-08 (later) — 3D IS the game now: index.html and sandbox.html both
render the WebGL board, and every actor has a 3D body.**

`game3d.html` is gone — it existed for one session as a safe copy, and keeping
a second page was exactly the duplicated-document failure this file opens by
warning about. `index.html` and `sandbox.html` carry the 3D stack themselves;
if WebGL is unavailable the install fails cleanly and the 2D renderer takes
over unchanged. All suites at baseline after (105/3, 182/30, 70/1, 45/0, plus
the sandbox smoke).

**The "camera disappeared" bug was an input-routing bug.** The 3D board draws
on a canvas BEHIND the HUD canvas, so the camera bound to its own canvas
received no pointer events at all. `OrbitCamera` now takes an `inputTarget`
(the top canvas) separate from its projection canvas. The three gestures the
2D game already owned are shared rather than fought over: the 2D middle-drag
map-grab and wheel-zoom stand down when World3D is on, and right-click-cancel
checks `camera.rightDragMoved` (4 px of slop) so a pan is not a deselect but a
twitchy click still is.

**Every actor renders in 3D now, by one of three routes:**
- *Exported Blender model* — the Arcane Sniper joined the Rifleman: all seven
  of its bodies (base/A3/A4/A5/B3/B4/B5), picked by the same `purchased`-tier
  rule the sprite pack uses. 18 models, ~128k triangles total.
- *Sphere* — every enemy type without an authored mesh is a low-poly sphere in
  its own type colour at its own live radius, with a darker cap ring so it is
  two values instead of a dot. The 2D game drew these as circles; the sphere
  is the same statement in the new grammar.
- *Cylinder* — a tower without a mesh (Warbringer, Siphon) is a capped
  cylinder in its own `tint()`, on a pad. Never invisible, clearly a stand-in.

**Effects are visible in 3D.** `Effects.worldState()` exposes the live
particle/popup/impact arrays read-only; `World3D.drawEffects` projects them —
impacts as expanding ground rings via `groundCircle`, sparks as dots that rise
in real z (the 2D pass faked altitude by subtracting from y, which under a
perspective camera slides along the ground instead), bounty popups as
screen-size text. The quake cracks and screen flash still work: drawScreen was
always outside the world transform.

**Animation is procedural whole-body for now.** Enemies bob once per stride
driven by `progress` — distance, not a clock, the same rule the sprite walk
cycles follow, so a slowed enemy trudges and a stopped one stands. Sphere
types squash-and-stretch on the same beat. Recruits bob while marching and
stand still while `holding`. Towers kick back along their aim for 90 ms after
`sinceShot()`. Per-frame rig export (real limbs moving) is the follow-up.

**The models were always 3D.** `tools/blender/*.py` has been the source of
truth since the first enemy and the sprite sheets are a *render* of it, taken
from one fixed camera and quantised to 48 facings. `tools/blender/export_mesh.py`
exports the geometry itself instead — 11 models, 85k triangles, replacing about
40 MB of PNG. They ship as plain `.js` that calls `GLModels.register`, because
over `file://` `fetch` and `XHR` are blocked and a `.glb` cannot be loaded at
all. No loader, no parser, no dependency, and the game still opens by
double-clicking.

**THE WHOLE PORT IS TWO HOOKS**, because `draw()` was already split exactly
where it needed to be:

- `draw()` — one `if` around the existing world block. `World3D.drawWorld`
  replaces terrain, road, bodies and projectiles and returns false when the 3D
  build is not installed. Everything past `ctx.restore()` — HUD, panels, menus,
  chooser, codex, store — never knew where the camera was and still does not.
- `screenToWorld()` — the single funnel every world-space input goes through
  (hover, placement, inspection, aiming). Pointing it at a ground-plane raycast
  makes the entire input layer work in 3D without touching one call site.

**What is 3D and what is deliberately not.** Physical things — terrain, road,
bodies, projectiles — are WebGL. Interface *about* a physical thing — health
bars, range rings, the build ghost — stays on the 2D canvas, positioned by
`OrbitCamera.worldToScreen`. Billboarding those into the 3D pass would make
them shrink with distance and tilt with the board, which is wrong for
interface. A ground circle is projected per-vertex by `groundCircle`, because
under an orbited camera a range ring is a skewed ellipse and `ctx.ellipse`
cannot draw one.

**The camera is Baldur's Gate / Roblox.** Middle-drag orbits, right-drag pans,
wheel zooms to the cursor, WASD pans, R refits. Three properties are exact
rather than approximate, and each is asserted numerically rather than eyeballed:
the pan grabs the ground under the cursor and holds it (0.000 px drift), the
zoom holds the ground under the cursor (0.000 px), and the orbit turns around
the point grabbed at drag start (0.02 px on screen across the pitch range).
Each was wrong once and measurement is what found it — a pan reading the live
damped orbit drifted 1806 px, a released pivot slid 434 px, and clamping the
target instead of the pivot tore it off its anchor.

**One measurement trap worth recording.** Pivot drift measured in WORLD units
looked like a 505 px failure; the same error measured on SCREEN was 0.02 px. At
a shallow pitch the ground is nearly edge-on, so a sub-pixel screen error is
hundreds of world units. Measure the quantity the player can actually see.

**Colour is linear now, everywhere.** The first 3D pass multiplied sRGB values
by the light term, which is the classic mistake and does not look subtly wrong
— `#2E2F3C` charcoal rendered as mid-grey. sRGB stretches the dark end, so a
1.3x multiply lands far further up the curve than the same multiply in linear.
`GLGeometry.hex`, `GLModels.expand` and `td_scene.srgb` now all use the exact
same curve, and the shader converts once on output.

**What is NOT done.** Effects (particles, popups, the earthquake, blast rings)
still draw through the 2D path and are currently invisible in 3D. Only the
Rifleman and the four authored enemies have meshes; the Warbringer, Arcane
Sniper and Siphon draw as placeholder blocks. Enemy walk cycles and tower
firing animations are not wired — the exported meshes are single poses. The
terrain reads lighter than its authored floor colour and wants a lighting pass
against the Blender previews.

**2026-08-08 — the rendered models were unplayable at fifty enemies, and it was
never the sprites.**

Presentation only. The owner reported the board freezing once the rendered
enemy models were in with about fifty bodies on it. Measured rather than
guessed, and the answer was two canvas features, not the art:

```
150 enemies + 10 towers, draw only
  as shipped                              31.0 ms/frame   (32 fps)
  without ctx.filter                      ~13   ms/frame
  without ctx.filter and canvas shadows    7.5 ms/frame   (133 fps)
```

**`ctx.filter` and canvas shadows are not ordinary state changes.** Each forces
the drawImage it wraps onto a separate surface, filters or blurs it, and
composites it back — per sprite, per frame. Blitting 150 sprites costs about
6 ms; filtering and rimming them cost 25.

**Both were being paid by every enemy on every frame regardless of state.**
`enemyFilter`'s resting value was a permanent `brightness(1.04) contrast(1.08)`
lift and `enemyRimColor`'s was a constant pale halo, so nothing on the board
ever took the cheap path. **The rule now is that a filter or a shadow may only
carry STATE**, and anything wanted on a resting model has to be baked into the
sheet by Blender instead.

The hit flash and slow tint moved off `ctx.filter` onto a new `tint` option in
`js/visual-models.js`: the tile is copied into one shared scratch canvas,
`source-in` floods it with the colour while keeping the sprite's alpha, and the
silhouette is drawn over the sprite at the requested strength. Two ordinary
blits instead of a filter pass, and no per-sheet cache to hold in memory.

The rim is gone entirely, including for the flash. Keeping it for that alone
still cost about **1 ms per flashing enemy**: a quarter of a fifty-enemy board
taking a hit ran at 20.8 ms against 7.1 ms resting. The tint already washes the
whole body white at the moment of the hit, which is a larger and more legible
change than an edge glow was.

Real end-to-end frame times after, median over 70 frames:

| enemies | resting | a quarter flashing |
|---|---|---|
| 50 | **7.0 ms (143 fps)** | 13.9 ms (72 fps) |
| 150 | **7.0 ms (143 fps)** | 20.9 ms (48 fps) |
| 450 | 14.1 ms (71 fps) | 62.4 ms (16 fps) |

Fifty enemies was 32 fps and is now 143. **What is left is the tint itself** at
high simultaneous-flash counts — about 0.55 ms per flashing body, which only
bites when an area attack lights up a large fraction of a very full board. The
next lever there, if it is ever wanted, is one lazily-built white-silhouette
copy per sheet (about 5 MB each) so the flash becomes a single extra blit with
no per-draw fill. It was not built because the reported problem is fixed with
room to spare and 40 MB of canvases is a real cost to pay for a case nobody has
hit yet.

**Leaving the browser was considered and rejected.** Canvas was never near its
limit here; one badly-chosen canvas feature was doing 4x the work of the entire
rest of the frame.

**2026-08-07 — the Rifleman is a rendered model: a boss in a suit, and the one
tower on the board with no magic in it.**

Presentation only. Not a stat, a cost, a footprint, a range, a rate, a tier
table, a recruit number or a targeting rule moved. `tools/blender/tower_rifleman.py`
builds seven bodies and sixteen accent layers; `js/skins/draw-pack.js` composites
them over `soldier:body`; the procedural clockwork automaton in
`Soldier.prototype.drawFigure` is still there and is still the fallback.

**What he is now, and why it is the right answer for the STARTING tower.** Every
other defender pays for power by stopping being a person -- the Arcane Sniper
bolts the enemy's own hardware onto himself on path A and burns what is inside
him on path B, and the Warbringer was never a man. The Rifleman is the one who
does not: a boss in a three-piece suit and a fedora, with a lit cigar, a gold
watch chain and a violin case of gold-cased clips at his feet, firing a
walnut-stocked carbine from the hip. He is the baseline the rest of the roster is
measured against, he is what $300 buys, and he is still standing there unchanged
at wave 35. That is the whole design.

**HE HAS NO FACTION COLOUR AND MUST NOT GAIN ONE.** He owns none of the
ley/sigil palette. `td_scene.PALETTE` gained a tailoring set -- charcoal,
ivory, oxblood, real gold, walnut, blued steel -- and the only two emissive
materials on the model are a cigar ember and a spotlight filament. Both are
fire and tungsten. Path A is allowed *a bit* of cybernetic, because path A is
the arsenal and by A4 he is wearing hardware to work a mounted gun: the budget
is exactly three things (a chromed forearm brace, one servo readout, a
targeting monocle) and it is spent so that A5 still reads as a man in a suit
operating a machine -- the direct inverse of the Sniper's A5, whose point is
that nothing of him is left. Path B gets none of it at all. Its camo detection
is a filament in a can on a tripod, its defence pierce is a case of gold-tipped
shells, and its recruits are hats on a rack.

**The tiers, and what each one draws.** A0-A2 a carbine and the case; A3 a
chromed feed column and a loader arm, so he stops reaching -- which IS the
shorter burst cooldown; A4 the gun leaves his hands onto a hopper-fed pintle;
A5 a four-barrel battery with a drift of spent gold around the pad. B3 the
burst ends and so does the weapon -- drum-fed automatic, overcoat, barricade,
spotlight; B4 crates and riveted plate, a rack with two spare guns and TWO
HATS, an open case of gold-tipped shells; B5 a dais, a heavy tripod gun, a
fur collar, a strongbox and FOUR HATS. **The hats are the recruit count**, so
B4's two and B5's four are readable without opening the panel, and
`make_preview.py --validate-riflemen` asserts both.

**Two things it does differently from the Sniper, both deliberate.** Its final
tiers DO carry crosspath accents (sixteen accent sheets, not eight): A5+B1+B2
is the owner's own specified build at 9 damage / 75 DPS and B5+A1+A2 is a row
in the DPS table, so leaving those bare would hide a bought upgrade on exactly
the two builds the balance notes single out. And the four animated frames are
indexed off `Soldier.gearPhase()`, which already reconciles the tower's two
firing models -- so the same sheet plays as a measured burst at base, a fast
one at A5 and a continuous shudder from B3, with no second clock anywhere.

**His recruits are modelled too, and they are deliberately pitiful.**
`tools/blender/summon_recruit.py` builds `soldier-recruit-b4` and `-b5`. They
are not his crew: B4 is a survivor in a coat two sizes too big, one boot and
one rag-wrapped foot, a rag over the mouth, a bedroll and a satchel, carrying a
short carbine that is wire-wrapped at the wrist because it broke once already.
B5 is the same person four weeks later -- a helmet a size too big, a webbing
belt, boots that match, a full-length bolt rifle, and **the Rifleman's oxblood
armband**, which is the only thing on either model that says who sent him. He
stands straighter and he is still thin and still hunched, because 40 hp and 3
damage must not read as a unit that holds a lane.

They use the ENEMY pipeline, not the tower one, because they walk a path: 8
facings and a cycle advanced by `progress` so a planted foot stays on one patch
of road. What they add is a second state the enemies have no equivalent of --
**they stop to shoot**, so `holding` selects a separate braced sheet whose
four-frame recoil runs off the recruit's own shot cooldown. A distance-driven
cycle on a unit that has stopped would freeze mid-step forever.

**THE SHOT NOW LEAVES THE BARREL.** `Soldier.fire` used a flat 16 pixels
forward, which was right for the old clockwork automaton and wrong for a tower
whose muzzle is 28 u.l. out at base and 37 from A4 -- every round appeared in
mid-air beside him. It is now `Soldier.MUZZLE_UL`, one forward distance per
rendered body, converted once from the Blender print. **This is a simulation
value**, not a presentation one: a bullet's start position is where it starts
homing from. The change is sub-frame in flight time and all four suites are
unmoved, but it is the one thing in this pass that is not purely cosmetic and
it should be read as a deliberate correction rather than a skin. The model's
small lateral offset is dropped rather than approximated -- `aim` is a screen
angle and the simulation has no ground plane to rotate a sideways offset in.
Recruits got the same correction with their own numbers.

Two presentation-only fields ride on each round: `liftUl`, which draws it at
barrel height while its real position stays on the plane it does its hit tests
on, and `shotBody`, which picks its appearance. Both are stamped once at fire
time rather than looked up from the owner, so selling or upgrading a tower
cannot change what is already in the air. **Every tier fires a different
round** -- brass tracers at base, bigger and whiter through A4 into A5's
battery, small pale rapid rounds on path B, one heavy slug at B5, and visibly
duller and smaller ones from the recruits, because 1 damage should not look
like 8. Each lands a matching `rifleman-hit` impact, emitted through the
Bullet's existing `onHit` hook so no other tower's shot gains a mark it did not
ask for.

**Two tooling changes came out of building it, and both are reusable.**
`make_preview.py --frame-riflemen` computes the smallest `ortho_scale` each
body can be rendered at without touching the tile gutter, by sweeping every
evaluated vertex through all 48 yaws and projecting through this exact camera.
The first shipped pass was hand-framed and **all seven groups clipped**; the
gutter warning is the right safety net but a terrible feedback loop at minutes
per body, and the camera is a fixed linear projection, so the answer is
arithmetic. The binding constraint is almost always the BOTTOM -- a prop at
ground radius `r` projects `0.56 * r` below the world origin and only 0.14 of a
tile sits there. `--validate-riflemen` is the other: it asserts the four accent
seats hold identical world matrices across all four animated frames, which is
the failure a still cannot show.

**One shared-file change worth knowing about.** `td_scene.py` gained public
`frustum`, `ellipsoid`, `torus` and `tube`; `tower_sniper.py` now aliases its
four private copies to them rather than keeping a second implementation.
`make_preview.py --validate-snipers` passes unchanged, which is what proves it.

**2026-08-05 — dimensional Swarm, Hive and Brute models, plus restrained live
shield variants for them and the Normal.**

Presentation only. No health, armour, shield quantity, speed, spawn rule,
lane, path, radius, hover area, hit box, bounty, timing or other simulation
value changed.

Three roster roles now explain themselves in silhouette. Swarm is a low
six-legged scavenger-tick with a connected chassis, fork feelers and recessed
red intake; its alternating tripod gait remains readable at `sizeScale .55`.
Brute is a broad breach engine with overlapping slab armour, buried head,
furnace, exhausts, huge gauntlets and a compressed planted march. Hive is a
six-legged brood foundry: armoured incubator, repeated recessed brood windows,
rear hatch and a heavy tripod walk, rather than a large recoloured counter.
All are real directional volumes built facing +X and rendered through the same
eight-row camera contract as Normal; there are no camera-facing cards.

Normal, Swarm, Brute and Hive each have an exactly aligned `*_walk_shielded`
sheet. The alternate image adds only dark-mounted ley projectors and is chosen
from the live instance's `shield > 0`; the instant the pool breaks, the clean
base body returns while `shieldFlash` finishes the transition. Added opaque
area is deliberately small: 5.57%, 5.71%, 1.83% and 2.67% respectively. The
old full circle became four separated elliptical field panels, leaving the
body readable in a crowd. A steady cyan layer remains under the gold grant
pulse so the last pulse frame cannot fade to nothing and pop back to cyan;
after a break, gold expands alone and disappears.

Walk frames remain driven by distance, but no longer borrow Normal's stride.
Evaluated planted-sole travel gives per-height cycles of Normal `.62`, Swarm
`.192`, Brute `.16` and Hive `.11`. Ground audits measured maximum planted-foot
errors of 3e-8 / 1e-8 / 2e-8 / 5e-8 and positive recovery clearance on every
frame. The public health-bar metrics use measured `contentTop`: `.8438`,
`.6875`, `.6937` and Hive's shield-safe `.5750`.

Every base/shield enemy sheet is 1024×1280 (8 facings × 8 frames of 128×160). A final
per-tile alpha audit passed all eight files. Minimum left/right/top/bottom
gutters are Normal 25/25/25/9, Swarm 9/9/50/5, Brute 12/12/49/4 and Hive
22/22/68/3, so none touches the outer-three-pixel contract. Cache version is
`ASSET_VERSION = 12`.

The first parallel render exposed a tooling race: every Blender process wrote
`assets/_tmp_frame.png`. `td_scene.render_sheet` now uses a sheet-name + PID
scratch path and removes it in `finally`, so independent model renders neither
truncate each other nor leave debris after an exception. Enemy previews now
cover all four base/shield pairs, `--enemies-only` skips the Sniper set, and
saved clean `.blend` previews hide shield-only hardware in both render and
viewport state.

One focused core test creates immediately-ready image sheets and proves all
four bodies choose base → shielded → base across a shield break, then checks
the steady field remains beneath the tail of a grant pulse. Full-suite totals
are 105/3 core, 182/30 content, 70/1 Longshot, 45/0 beam and the same two
Sandbox failures as before. The in-app browser's URL policy refused a fresh
localhost reload/inspection, so no live-browser claim is made; rendered atlas
inspection, the full-frame harness and the source/alpha audits are the visual
verification for this pass.

**2026-08-05 — B5's fourth-round punctuation, a moving ability lock, and
visually silent tower stuns.**

Three focused corrections following the final-tier model rebuild. None changes
a stat, damage formula, reload interval, projectile speed, ability duration,
stun duration, target priority or upgrade cost.

B5's guaranteed fourth round no longer asks a colour change to carry an 8k+
crit. The existing `empowered` presentation flag now selects a wholly separate
covenant-round silhouette: diamond penetrator, split violet rails, orbiting
seal fragments and forked discharge. Each enemy it physically intersects also
gets one compact, 0.46-second `arcane-empowered-hit` at the actual contact point
and barrel lift. Its entry slash, broken seal, flash, shards and grounding ring
are emitted only after the unchanged damage path resolves; the effect is never
read back by simulation. A focused test gives identical 10-damage normal and
empowered fixtures, observes zero versus one impact, and pins the impact's
target position, radius and lift.

B5's three-second ritual now stores the strongest enemy object chosen on the
button press and copies only that object's live position into the telegraph on
each channel frame. A later stronger body cannot steal it. A dead or leaked
lock leaves the last valid point behind, so an already-promised strike neither
snaps nor disappears. The resolution frame returns immediately after the
detonation; it cannot rotate or fire in the sliver between starting its
self-stun and the next central update gate.

Stun state now has one route through config adapters too:
`TowerHealth.mirror` forwards `stunTimer` beside both HP fields, so an enemy
stunning the outer tower and B5 stunning its core are the same timer seen by
the main loop. That loop already keeps every directional tower's stored aim
unchanged by skipping `update()`. Siphon was the visual exception because its
beam renderer followed live enemy objects even while simulation was skipped;
`visibleLocks()` hides those beams during stun without dropping locks or ramp,
then exposes the same locks again on wake.

Focused coverage added one core test and four content passes. Full-suite totals
are 104/3 core, 182/30 content, 70/1 Longshot, 45/0 beam and the same two
Sandbox failures as before. A live Sandbox pass caught the fourth hit by its
damage-step transition and showed the new diamond round plus contact slash at
gameplay scale; the moving ritual circle also stayed centred on its chosen
walker. The console remained clean.

**2026-08-05 — corrective visual rebuild: planted normal-enemy motion,
volumetric Sniper foundations, model-locked effects and sharper final tiers.**

Presentation only. No stat, price, range, timing, hit box, footprint, target,
projectile path, damage rule or other simulation value changed.

The shared render contract is explicit now. `td_scene.py` raises the camera by
`0.36` of its orthographic frame, placing Blender world origin at `0.86` of a
tile's height. Runtime sprites align that invariant projected origin, not a
changing lowest-alpha pixel; a foreground swing foot can project below the
planted foot in this camera. `report_content_box` now audits every individual
direction/frame tile against an outer three-pixel gutter, because aggregate
bounds hid one-pose clipping. `render_sheet` can page directions horizontally
while preserving one PNG and the same runtime row mapping. A5 uses 512 px
source tiles and B5 384 px, with their 48 facings arranged as three 16-row
pages so final-tier art stays native at the canvas's maximum 3x backing scale.

`enemy_normal.py` rebuilt the normal carrier's visual hierarchy: its core and
side/rear inspection windows are recessed inside larger dark housings and
solid cage bars, rather than protruding as glowing cards. The gait uses even
fore/aft samples and plants one support sole at z=0 in every frame while the
other clears the floor. `draw-pack.js` aligns the fixed 0.86 pivot and adds a
small contact-occlusion ellipse between the support point and the existing
directional cast shadow, removing the gap that made the enemy look airborne.

`tower_sniper.py` replaces card-like structure with readable volume: jointed
limbs and weapon anatomy below the final tiers; B3/B4 offering motion confined
to the upper body so their boots stay planted; B4's cathedral split into a
grounded, reload-independent fixture with tapered posts; and map-fixed A5/B5
foundations that counter-yaw beneath the aiming body. B5's four restraints are
closed faceted obelisks with stepped feet, alternating tapered faces, ribs,
caged cores, pointed crowns and inboard clevises. Two joined solid chain
segments connect each clevis to the captive instead of stopping nearby. A5's
three engineered pylons received the same faceted/caged depth language.

The custom Sniper body bypasses the fallback body's platform, so its renderer
now paints a flat faction pad and directional cast shadow before a decoded
sprite; this grounds every group without changing the gameplay footprint or
moving Blender's origin. Procedural charge, rapture and B5 ritual light no
longer follows continuous aim or percentages of a generic barrel. A table of
per-group Blender-local anchors names the real muzzles, A3/A4 coils, A5
collars/rune, B3/B4 chambers and fissures, and B5 face glare. Their projection
repeats the sprite sheet's ground-unsquash and 48-row snap, so effects and the
rendered hardware use the same visible axes.

A flattened-layer limitation is recorded rather than hidden: A4+B2 has accent
geometry both behind and around opaque A4 parts. A restrained partial redraw
of the A4 body restores foreground teal after the magenta overlay, but exact
per-pixel depth would require a third Blender-authored holdout/depth mask. Do
not generalise that special-case hierarchy correction to other crosspaths.

The final walk and Sniper runtime sheets were regenerated and the cache key is
now `ASSET_VERSION = 11`. Measured `contentTop` is normal `.8438`; Sniper base
`.7695`, A3 `.7539`, A4 `.5547`, A5 `.5625`, B3 `.7383`, B4 `.6406` and B5
`.5938`. The per-tile audit reported zero outer-three-pixel edge hits across
the normal walk and all Sniper runtime sheets. A forced-row image harness also
sampled all 48 A5 and B5 facings: every source rectangle stayed in bounds and
each of the three atlas pages covered local rows 0–15 exactly once.
Twelve-heading actual-game-size contact sheets verified that both final-tier
foundations stay fixed while their weapon rigs turn. Live local-page reload
was blocked by the in-app browser's URL policy on the final pass, so no browser
claim is made here.

All five suites remain at the documented checkout baseline: 103/3 core,
178/30 content, 70/1 Longshot, 45/0 beam and two Sandbox failures. Twenty-eight
obsolete/automatic preview outputs (`sniper_a0`, the old `*_over_a0` sheets and
Blender `.blend1` backups) were removed; all are generated artifacts and can be
recreated from the authoritative scripts.

**2026-08-04 — readable normal-enemy and complete Arcane-Sniper models, plus
adaptive native-resolution rendering with no gameplay change.**

Presentation only. No stat, price, path, range, timing, footprint, collision,
hit radius, muzzle position or logical coordinate changed.

The authoritative Blender sources were cleaned at the silhouette scale the
game actually displays. `enemy_normal.py` now has a broader connected torso,
larger head/lens, sturdier articulated limbs and red core/cargo windows visible
from every one of its eight facings. `tower_sniper.py` enlarges the A1/A2/B1/B2
tier marks, locks overlays to both reload rigs, clarifies A3 through B5, and
removes A5's misleading baked stack rings. Twenty sheets now cover all 27 legal
Sniper builds; A5's five tally rings are drawn from the live stack tracker.
`make_preview.py` also covers B5. Four-angle previews, inspectable `.blend`
outputs, the normal walk/death sheets and every Sniper body/overlay sheet were
regenerated with Blender 4.4.3. `ASSET_VERSION` is 9.

Rendered bodies get a restrained cool separation rim. The normal enemy also
recovers the built-in renderer's visible hit flash and slow-state tint through
optional, save/restored sprite `filter`/shadow styling in `visual-models.js`.
These fields are documented in `MODEL_SKINS_GUIDE.md`; unsupported canvas
filters simply fall back to the rim. The death sheet remains generated but is
still intentionally not wired into runtime timing.

`resizeCanvasBackingStore()` now follows the canvas's displayed CSS size times
device pixel ratio, using one uniform scale clamped from the original 1280×720
floor through native 4K (3840×2160). All draw, world, UI and input coordinates
remain 1280×720. Resize restores the context after either backing dimension
changes, and Sandbox CSS no longer lets intrinsic backing dimensions control
layout. Browser checks measured 1920×1080 and 3840×2160 backing stores, clean
console output, and readable live B5/enemy models.

All five suites were run before and after. Both sides measured 103/3 core,
178/30 content, 70/1 Longshot, 45/0 beam, and two Sandbox failures. The failure
groups are the checkout's existing B5/timing and stale fixture drift; this pass
added none.

**2026-08-03 — the first rendered art: a Blender sprite pipeline, animated
directional sprite sheets, and a canvas that actually fills the window.**

Presentation only. No rule, stat, distance, reward or hit box moved, and the
game is byte-for-byte the same simulation with `js/skins/draw-pack.js`
deleted.

**A 3D-to-sprite pipeline in `tools/blender/`.** `td_scene.py` is an offline
art tool — it is never loaded by the game, adds no build step, and the game
still opens by double-clicking `index.html`. Its camera is *derived from this
codebase, not chosen*: `Visuals3Q.GROUND_SQUASH` of 0.56 fixes the camera
elevation at `asin(0.56)` = 34.06°, `LIGHT_X/LIGHT_Y` fix the key light at
upper-left, and the `(reach, reach × 0.7)` shadow offset with its `0.32`
per-unit-lift term fixes the sun elevation at 68°. Orthographic, because the
game maps world to screen linearly and a perspective render would disagree at
the board edges. Set once, so a model rendered a year from now still matches
the ellipses `Visuals3Q` draws around it. `enemy_normal.py` is the first
model, built from primitives — at `Enemy.RADIUS_PX` = 11 a sculpted mesh and a
stretched cube are the same handful of pixels, so the effort belongs in the
silhouette. Four things bit hard enough to be worth naming: Blender's default
AgX view transform destroys a specified palette (use Standard); `metallic`
above ~0.2 renders black without an environment to reflect; parenting via
`matrix_parent_inverse` reads a stale `matrix_world` in a build script and
tears animated limbs off; and the camera must rise `0.36` of its frame along
its own up-axis. That projects world origin to `0.86` of tile height, leaves
ground margin for feet and shrine anchors, and avoids the decapitation caused
by aiming the camera straight at z = 0.

**`VisualModels.registerSpriteSheet`.** A sibling to `registerSprite` for
animated, directional skins: one PNG, normally one row per facing and one
column per frame. `directionRows` may page a taller direction set horizontally;
page `d / directionRows` owns another block of frame columns while row
`d % directionRows` stays inside the declared height. This is how the 48-way
A5/B5 sheets fit in three 16-row bands without changing their visible rows.
22 enemy types × 8 directions × 8 frames is 1408 files as loose frames and 44
as sheets. Row choice undoes the ground squash before taking an angle — a 45°
screen heading is a 61° world one, and skipping that picks the wrong row on
every diagonal. The registry still holds no per-subject state, so a one-shot
animation needs a caller-supplied `frame` function.

**Assets are loose PNGs, which bends "everything is drawn procedurally".**
That constraint's own note anticipated this ("probably inline SVG or base64
data URIs"). `fetch` and XHR genuinely are blocked over `file://`; an
`Image()` src is not, and the game was verified loading and animating sheets
from a bare folder with no server. Nothing reads pixels back, so canvas
tainting is moot — there is no `toDataURL` or `getImageData` anywhere. The
release form is the same sheets base64-encoded into a `.js` file, which needs
no code change because `source` is passed straight to `Image()`. **This is the
owner's constraint and his to settle.**

**The canvas fills the window.** It was `max-width/max-height: 100%`, which
can only ever *shrink* an element below its intrinsic size — so on any display
wider than 1280 the game sat at 1280×720 in dead space. Now sized to the
letterboxed box with `min()`. The element is sized rather than `object-fit`
used, deliberately: `toCanvasPos` divides by `getBoundingClientRect().width`,
and letterboxing inside a larger element would put every click off by the
bar's height. `UNIT_LENGTH` is untouched, so the world is still 1280×720 and
every distance is still u.l.

**Health bars follow the art, via a measurements registry.** The bar hung at
`bodyY - radius - 12`, which is the crown of the *built-in* circle — with a
sprite four times that tall it sat in the creature's chest. `VisualModels` now
carries per-model measurements beside the renderers (`registerMetric` /
`metric`), a sprite sheet publishes its own `topY`, and `Enemy.draw` asks for
it with the old expression as the fallback. Measurements only: the hit box,
the claim distance and the hover ring still come from `radiusPx`, which is the
entire reason those are separate numbers. The `contentTop` fraction it needs
is **measured, not computed** — `render_sheet` prints it from the rendered
alpha, because animation moves the model after the geometry is authored and
every figure derived from `ortho_scale` and body height was wrong.

**Rendering at display resolution.** With the canvas stretched to fill the
window, a 1280-wide backing store on a 2560-wide display was being doubled and
everything went soft. The backing store now follows the element's CSS size
times `devicePixelRatio`, with one uniform total scale clamped from 1× through
3× (1280×720 through native 4K). Capping the total scale, rather than DPR
alone, also bounds a DPR-1 5K or 8K display. Every drawing call still uses the
same 1280×720 logical world. Input is unchanged because `toCanvasPos` divides
by `getBoundingClientRect()` in CSS pixels. Assigning either canvas dimension
resets the 2D context, so `resizeCanvasBackingStore()` restores its transform
and smoothing after the final assignment; it runs in `init()` and on window
resize. The sandbox canvas has an explicit 16:9 CSS size so its enlarged
intrinsic backing store can never drive layout.

**The sniper is rendered as LAYERS, because 27 towers is not a thing.**
`crosspath.js` caps the other path at 2 once either reaches 3, which still
leaves 27 legal (A, B) combinations — and it would multiply again at A4, which
is player-aimed (`aimRad`) and needs 48 yaw steps. The two paths were designed
never to touch the same part of the model: the graft takes eye, arm, spine and
legs; the rapture occupies skin, coat, free hand and the air. So a tower is a
BODY sheet plus an OVERLAY sheet, and 20 reusable sheets cover all 27 states.
`draw-pack.js` reads `tower.core.purchased` and composites. One asymmetry
worth knowing: B3–B5 change the body itself (he offers, floats, burns), so
those will be rendered as bodies with A1/A2 as overlays instead — legal
precisely because crosspath guarantees A ≤ 2 whenever B ≥ 3. That inversion is
why the compositor chooses which sheet is the body rather than assuming.

The tree is complete. A3/A4 have body sheets plus B1/B2 overlays; A5 is a
one-piece machine body; B3/B4 have animated bodies plus A1/A2 overlays; and B5
is a one-piece rapture body. A5's five stack rings are deliberately drawn live
from `killStacks` instead of baked into the PNG, so the art never claims stacks
the tower has not earned. None of this feeds a rule or hit box.

**The walk is driven by distance, not by a clock.** A fixed-rate loop plays at
its own speed whatever the enemy is doing, so the feet and the ground disagree
and the body looks like a sticker being dragged along the road. Advancing the
cycle by `enemy.progress` ties them together, and every speed case then comes
out right for nothing: a `fast` covers ground quicker so its legs move
quicker, a slowed enemy's legs drag, a stopped one stops mid-step. The stride
constant follows from the model's hip height and swing angle, but the honest
test is whether the feet skate on screen, so it is tuned in `draw-pack.js`
rather than derived anywhere. The authored samples now sweep the support sole
back in even increments, pin one support foot to z=0 in every frame and lift
the recovery foot. Runtime grounding uses the camera's invariant 0.86 world
pivot instead of chasing the visually lowest foot, and a small contact ellipse
joins that point to the existing cast shadow.

**The sniper turns to face its target, in 48 steps.** `LongshotTower.update`
already wrote `this.aim` every time it picked a target, so the facing cost
nothing but sprites to point with; `core.aimRad` wins once A4 grants
`coneShape`, because that one is the player's decision rather than a
consequence. The worst mismatch between a snapped row and the desired angle is
3.75° at 48 facings; below about four degrees the long barrel stops reading as
a snapping cut-out. The procedural effects repeat this exact row snap.

**The generic Blender bodies contain no baked base; the custom renderer owns
one ground pad.** The first model included a stone plinth while the fallback
Longshot body also painted `Visuals3Q.platform`, producing a doubled platform.
Removing both was wrong in the other direction: a successful custom `:body`
return skips the fallback branch entirely, so the rendered actor hovered over
an unmarked map coordinate. `drawSniperGround` now paints one flat faction pad
and the shared down-right shadow before the decoded body. It does not move the
Blender origin or change the gameplay footprint. A5 and B5 additionally carry
authored map-fixed foundations as part of their silhouettes; those are siege
hardware on top of the one runtime ground contract, not a second generic pad.

**Render quality.** Three changes, in order of how much they mattered: every
box is bevelled (a cube lit by a directional key has three flat faces and no
edge highlight at all, which is most of what makes primitive-built models read
as programmer art); tiles are supersampled 2× and averaged down, with colour
premultiplied by alpha before averaging or every edge picks up a dark fringe
from the transparent pixels' black; and ambient occlusion is on, without which
every crevice is lit as brightly as the faces around it. The renderer also
audits the outer three pixels of every facing/frame tile independently; one
clipped pose can hide inside a plausible aggregate content box.

**`sandbox.html` loads the art pack too**, so the sandbox is checking the
models the player actually sees rather than the built-in bodies.

**The caster holds his rifle.** The first pose put a rod in world space near a
figure who was not gripping it — it read as a man being skewered by a stick.
The weapon now hangs off a `shoulder` empty with both hands on it, his eye
behind the scope, a braced stance and a bipod, so the hold cannot drift. The
hat came down from wider-than-his-shoulders to a modest brim; it had been
sized to carry the silhouette at 20 px and had overcorrected into a mushroom.

**Tiers 1 and 2 are colour, not geometry.** A1/A2/B1/B2 change nothing about
the model. The body renders once and each tier is a thin emissive ACCENT layer
composited over it — six sheets total. The accents keep the same mounting rule
the later tiers use: the graft lights the TOP of the weapon (scope, rail), the
rapture lights the UNDERSIDE (the groove along the barrel), so an A2 B2 shows
both colours and neither lands on the other's metal.

**The shot leaves the end of the barrel.** It used to be born 1 u.l. from the
tower's centre, which with a rifle this long is inside his coat.
`projectile.muzzleOffsetUl` (36) lives in the tower CONFIG rather than the art
pack, because the simulation needs it and simulation never reads back from the
presentation registry. **It does not extend reach**: the adapter subtracts the
same distance from `maxTravelPx`, so the far end of a shot is exactly where it
always was — starting 36 u.l. closer and travelling 36 u.l. less is the same
line, and `range-filter.js` still measures targeting from the tower's centre.
If the rifle is re-modelled, `tower_sniper.py` prints `MUZZLE_WORLD`; that is
the number to bring back to the config.

The bolt is drawn LIFTED to barrel height while its real position stays on the
ground — the same split the engine already uses for enemies, where `pos` is
the feet and `visualBodyY` is where the body is painted. The bullet must stay
on the flat plane it does its hit tests on; only the picture rises.
`PierceBullet` gained a `tint` field so the shot and its impact can carry the
path's colour. Cosmetic only: nothing in `update()`, `currentDamage()`, the
claim or the hit test reads it, and an untinted shot behaves identically.

**A3, A4 and the four crosspaths.** A3 is the first real graft: the forward
arm is gone, twin rails run from the shoulder socket into the handguard with
an arc between them, a three-stage coil stack is bolted up his spine, and a
clamp holds his skull still because the rig decides how he stands now. A4
takes the legs — what is left of him is socketed into a gimbal yoke and the
weapon is a rail cannon lying flat on the mount, his head still up at the
breech. Both bake their teal into the body, so there is no separate A accent
above tier 2; by then the graft *is* the model.

`crosspath.lockThreshold` is 3, so buying A3 caps B at 2 forever and the only
crosspaths these two reach are A3B1, A3B2, A4B1 and A4B2. Path B lights a
groove under the barrel, and that groove is somewhere completely different on
a coil rifle or a rail cannon than on the original weapon — so each body
carries its own B accents rather than sharing one sheet. On A4 there is no
forearm left to carve, so the rapture takes the mount instead.

**Sheet groups, and why the camera moves per tier.** A body and the accents
over it must share a camera or they will not line up — but the A0–A2 rifle
already ran off the edge of the old tile and a rail cannon would not have
fitted at all. Each group now renders at its own `ortho_scale` (the world
height one tile spans) and `draw-pack.js` draws it at a size proportional to
that same number, via one shared `PX_PER_WORLD`. That is what keeps the man
the same size on screen at A3 as he was at A2 even though his tile covers more
world. Change `PX_PER_WORLD` and every tier rescales together, which is the
only way this stays consistent. Ordinary groups use 256 px source tiles; A5
uses 512 and B5 384 so their larger final silhouettes survive a 3x canvas
backing without enlargement. Those two page 48 facings into three horizontal
blocks of 16 direction rows. All body/accent placement uses the shared 0.86
projected-world-origin pivot, never unrelated alpha bottoms.

`projectile.muzzleOffsetUlByGraft` follows the same fact: the weapon gets
longer as it grafts, so the muzzle moves (36 → 48 → 54 u.l.). Still taken
straight back off `maxTravelPx`, so reach is unchanged at every tier.

**A5 — the Meridian Lance, and nothing left of him.** A4 still had his head at
the breech; A5 is what the rig finishes, which was the owner's call and it
changes what the model has to do. With no figure to read against, the only
thing carrying the tier is scale and menace: a braced siege mount on three
faceted, caged anchor pylons, a lance floating free inside six magnetic
collars, and an aperture the size of the old man's whole body. The foundation
counter-yaws under the aiming carriage, so its ring and pylons stay bolted to
the same map-facing positions instead of orbiting with every direction row.
The breech block deliberately echoes A4's torso socket — same collar, same
proportions, nobody inside. The tally spar is the kill-stack counter, and the
one part of the model that moves with the fight.

**A5 has no crosspath variant**, by the owner's decision: there is nothing
human left for the rapture to mark, so it looks the same whatever B did. One
sheet, and `draw-pack.js` skips the B accent entirely at that tier.

**A4 and A5 fire a lance, not a bolt.** From A4 the weapon is a rail cannon
and the shot is drawn as a tapered beam whose width tracks what it still hits
for — wide where it started, narrow at the head, in proportion to
`currentDamage() / baseDamage`. That makes pierce falloff (js/systems/pierce.js)
visible: a player can watch a shot run out of power through a crowd without
reading a number. Drawn as a quad rather than a stroke, because a stroke
cannot change width along its length. `PierceBullet.style` carries it and is
cosmetic in exactly the way `tint` is.

**B3, B4 and their four crosspaths — the rapture is the mirror of the graft.**
Where path A bolts the enemy's hardware onto him, path B bolts nothing on: it
is cloth, bone, chain and things burning that should not be. B3 (Communion)
loses the hat, wears a mantle, carries a bone censer on a chain and a
four-chamber cylinder of rune slugs, and the forward hand is cut open —
that is how the cylinder gets loaded. B4 (Cathedral) grows the mantle into a
housing: an arch standing over him with a rune window, a bell on a bracket,
and a barrel of carved bone split by molten violet. B3/B4's body hierarchy is
volumetric and jointed rather than built from broad cards. Their offering
reload now moves the head, hand and cylinder inside the upper-body rig while
the boots remain planted. B4's cathedral lives directly under the aim root,
separate from the organic reload: its splayed feet, tapered faceted posts,
capitals, projecting ribs and bell stay fixed through all four frames.

The layering rule inverts cleanly. Whichever path went past tier 2 bakes its
colour into the body and the OTHER path becomes the overlay — so A3–A5 carry
teal with B1/B2 painted on, and B3/B4 carry violet with A1/A2 painted on.
`crosspath.lockThreshold` of 3 guarantees the two branches can never both be
taken, which is what lets one group name identify a body. The four crosspaths
here are A1B3, A2B3, A1B4, A2B4. A4+B2 is the one flattened-layer depth
holdout: its magenta geometry crosses both behind and around opaque A4 parts,
so the compositor redraws the A4 body at restrained opacity after the accent.
That restores the foreground teal read but cannot be exact without a separate
Blender-authored depth/holdout mask.

**A camera: zoom and pan, and it is presentation only.** The world is still
exactly 1280×720 of flat coordinates and every distance is still u.l. — this
only decides which part of it the canvas looks at. `update()`, targeting,
placement and pathing do not know it exists, and at zoom 1 with no pan the
transform is the identity, so a run that never touches it behaves exactly as
before.

It goes INSIDE the world save/restore that already existed for the
earthquake, so the HUD is untouched and the shake composes on top (a kick at
3× zoom moves 3× as far on screen, which is right — it is a camera kick, not
a screen effect).

**TWO COORDINATE SPACES, AND THIS IS THE WHOLE RISK IN IT.** `mouse` stays
SCREEN space, because nearly all of its readers are interface hover tests and
they were all correct already; `worldMouse` is the same cursor through the
camera and only the handful of map readers use it (`enemyAt`, `recruitAt`,
`whyCannotBuild`, the cone-aim angle, and the build/aim previews — which are
drawn inside the world layer and so must emit world coordinates while their
GUARDS stay screen). In `onClick` the seam is marked explicitly: everything
above it is chrome reading `p`, everything below is map reading `w`. Crossing
that line in either direction is the bug this change could most easily
introduce.

Controls: wheel zooms about the CURSOR (anchoring to the cursor rather than
the centre is the difference between zooming in on what you are looking at
and having to chase it), middle-drag pans, WASD/arrows pan, `+`/`-` zoom,
`0` resets. Pan keys are tracked as a held set and integrated per frame
rather than acted on per keydown — a key repeat rate belongs to the operating
system and panning at it arrives as a stutter with a pause at the front. Pan
speed is divided by zoom so the map moves at a constant rate ON SCREEN;
without that, panning at 4× flies across the board exactly when the player is
looking closely. The camera integrates on REAL elapsed time outside the
fixed-step loop and unscaled by `gameSpeed`, so it feels identical at 1× and
3× and keeps working while paused.

Zoom floor is 1: the map is authored to fill the canvas, so zooming out only
adds empty bars. `clampCamera` keeps the view inside the board, which at zoom
1 pins it dead centre — that is what makes "never zoomed" identical to "no
camera at all".

**The shot was not leaving the barrel, and the reason was foreshortening.**
The muzzle offset is the barrel's length in the WORLD, but the board is drawn
obliquely — a barrel pointing up or down the screen projects to
GROUND_SQUASH (0.56) of its length while one pointing sideways does not. A
fixed distance along the aim therefore hit the muzzle only when the tower
fired east or west, and landed up to 44 % past it firing north or south. It
got worse the longer the weapon grew, which is why it showed up once A5 and
B4 existed. `LongshotTower.muzzleOffsetPx` divides by
`hypot(cos a, sin a / squash)`, which is 1 sideways and 1/squash vertically.
Verified ×1.00 / ×1.45 / ×1.79 at 0°, 45°, 90°.

The second half was the barrel HEIGHT: one constant for every tier ran A4's
beam through its own mount. It is per-tier now (`muzzleHeightUlByGraft`: 33
shouldered, 19 on A4's yoke, 24 on A5's lance) and rides on the shot as
`liftUl`. Presentation only — the shot's real position stays on the flat
plane it does its hit tests on.

**B5 — Rapture, and deliberately A5's opposite.** A5 finished the job and
what is left is a machine. B5 does not remove him at all, and that is the
horror: feet off the ground, four arms, the face gone inside its own glare,
the coat frayed into tatters rather than hemmed, and one arm charred through
at the elbow — that is where the permanent max-hp loss went. The four
restraints are not holding him up. They are chains: closed octagonal obelisks
with stepped feet, alternating tapered faces, brass ribs, caged cores, pointed
crowns and inboard clevises. Two joined solid segments run from each real axle
to the floating body. The entire shrine foundation counter-yaws beneath the
aiming captive, so it remains fixed to the map instead of turning like four
flat cards when the weapon tracks.

**The ability is a three-second ritual now, and the stun dropped to 7.** At
the owner's request, and it changes what the ability IS: it was an instant
button and it is now a commitment. `performAction("ability")` only ARMS it —
the strongest enemy at that moment becomes the locked target, and the ground
circle follows that SAME enemy throughout the ritual. It never retargets to a
later or stronger arrival. If the locked enemy dies or leaks, the ritual holds
its last valid position and still resolves there. The tower cannot fire while
channelling, and `resolveChannel` pays the cost — stun and permanent max-hp —
on RESOLUTION rather than on the press, so a channel is not yet a wound.

Total lockout is unchanged at 10 s. What moved is when it is paid: three
seconds of visible ritual you can watch, then seven of exhaustion, instead of
ten flat afterwards.

Drawn as circles ON THE GROUND at the locked target from the first frame —
proper ellipses squashed by GROUND_SQUASH, because they lie on the board rather
than face the camera, and getting that wrong is the single most common way a
magic circle reads as a sticker. The circle and its descending column move
with the original target, while a ring closes IN on the caster. `b5-strike` is
emitted by resolveChannel at the instant the damage lands, so what the player
sees and what the simulation did are one event rather than two that agree.

**The fourth shot is a path B mechanic, not A5's.** `guaranteedReloadShotCrit`
is B5, and A5 can never hold it — buying A5 caps B at 2. It is drawn as a
separate covenant round — diamond penetrator, split violet rails, orbiting
seal fragments and forked discharge — rather than as a larger ordinary bolt.
Every actual empowered collision emits one compact, presentation-only
`arcane-empowered-hit`: a directional entry slash at barrel height, broken
seal, white body flash, shards and a grounding ring. It stays violet even on a
teal crosspath because the crit comes from the covenant, not from the rig.
Neither the projectile skin nor the impact is read by damage, reload or timing.
A5's own lance went from 1.85× to 2.6×, because at 1.85 the tier that costs
13 900 and takes the man's whole body looked like a slightly thicker A4.

**The rapture does not charge, and it does not reload. It pays.** Both of
these were wrong on the first pass and the owner caught them together.

The first was a straight BUG: `drawCharge` only skipped the base group, so a
B3 or B4 tower — which can only carry A0–A2 — was being handed path A's teal
coil stages and muzzle bloom. A violet, cloth-and-bone tower was winding up
like a rail gun. Path B now routes to `drawRapture` and never reaches A's
code at all.

The second was a design failure that the bug was hiding. B3/B4's reload
originally tipped the weapon up and spun the cylinder — a bolt cycle with
extra steps, which is path A's motion wearing path B's clothes. The whole
point of the rapture is that nothing about it is mechanical: he does not
service a weapon, he gives it something. The four frames are an upper-body
offering now — his boots remain planted while the head bows, the opened hand
crosses the breech, the cylinder turns because HE turns it, and he withdraws
without fully recovering inside the beat. The `figure` empty is an explicit
animation boundary, but its ground-contact transform is keyed unchanged; the
forward arm has its own pivot so it can leave the handguard. B4's cathedral is
outside that boundary, so its posts and bell never inherit the organic pose.

The charge is a different IDEA, not a recolour. The graft spins up: stage
after stage, hardware accumulating. The rapture has no hardware, so nothing
accumulates — what builds is pressure inside a man. Light gathers at the
wound in his hand and in the chambers, sigils lift off him and fade upward
(rising and escaping, where A's lightning arcs between fixed points because
it is conducting), B4's bone fissures pour rather than glow, and at the top it
leaves the muzzle as a bloom — let go rather than aimed. Squared ramp instead
of cubed, so it swells instead of snapping.

The general rule this leaves behind: when the two paths need the same KIND of
feedback, that is the moment to check they are not being given the same
MOTION. Same information, opposite bodies.

**The reload runs on a different clock from every other animation.** From B3
the tower fires four shots and stops for a beat, and `js/systems/reload.js`
makes that beat deliberately independent of fire rate. So B3/B4's frames are
driven by the `ReloadTracker`'s own timer rather than by the firing cycle
everything else uses: buy attack speed and the four shots rattle off faster
while the pause stays exactly as long, and the animation says so.

Shots-remaining is drawn as **pips**, procedurally, read straight off the live
tracker so it cannot disagree with the simulation — plus a bar counting the
beat out while reloading, without which the tower just stops and reads as
broken rather than busy. Pips rather than modelled chambers because the count
changes every shot: baking four states into the sheet would multiply an axis
already 48 facings deep, and pips read at 50 px where a turned chamber does
not.

**Health bars came off the sprites and moved into the hover panel.** Every
enemy used to wear a bar permanently. At one or two bodies that is fine; at
swarm density — thirty specks at 0.55 scale, each with a 26 px MINIMUM-width
bar over it — the bars overlap into a solid ribbon and the only thing on
screen is the bars, not the enemies they belong to. The information is rarely
wanted in bulk either: a player reads one enemy's health while deciding about
that enemy, not thirty at once.

So `Enemy.draw` now takes `showBars` as an OPT-IN (with `hideBars` still
winning over it, so no existing caller is surprised) and the live render loop
passes neither. The readout lives in `drawEnemyHover`, where the figure and
the bar are ONE panel sharing a border rather than a floating label plus a bar
pinned to the sprite's crown — reading an enemy used to mean looking at two
places and pairing them mentally. Shields keep a second bar in the same panel,
for the same reason they keep a separate figure in the label: two pools that
empty in sequence read wrongly as one.

Bosses are unaffected — they already have their own bar across the top of the
screen, which is the right place for the one enemy the whole board is about.

**Animation, and the one number that drives all of it.** Every tier's
animation is indexed off how far through its firing cycle the tower is —
`fireCooldown` counted against `effectiveFireRate()` — rather than off a
clock. That makes animation speed dynamic with attack speed by construction,
with no constant to keep in step, and it picks up A5's kill stacks for free
because those are a live multiplier on the rate: a tower mid-massacre visibly
winds up faster.

*A0–A2 and B1–B2* share a four-frame bolt cycle baked into the body sheet
(rest → recoil/bolt lifting → bolt fully back → driven home). It occupies the
first 55% of the cycle and holds the aimed pose for the rest; a rifle still
cycling when it fires reads wrong. **Only the bolt, rear arm and a little
shoulder kick are keyed** — the barrel, scope and forward hand deliberately
hold still, because the emissive accent sheets are one frame composited over
every frame of the body, so anything they sit on must not move or the glow
slides off its metal. Four frames of a whole body would also have cost 4× a
sheet that is already 48 facings deep.

*A3, A4 and A5 charge instead*, and that is drawn **procedurally in canvas,
not baked**. Two reasons: lightning and a turning rune circle want to be
continuous and different every frame, which a short loop cannot be; and
frames multiply the facing axis, which is the expensive one. A3 lights its
coil stages in sequence with a muzzle bloom; A4 adds arcs that grow in number
rather than just brightness; A5 adds a rune circle that opens around the
barrel, turns, and flares at the top of the cycle. The charge is biased late
(cubed) — a linear ramp reads as a lamp on a dimmer rather than as something
building to a release.

The charge is positioned from authored model points, not from a generic
`muzzleOffsetUlByGraft` percentage. `SNIPER_EFFECT_ANCHORS` names each group's
real muzzle plus A3/A4 coil cylinders, A5 collars and rune, B3/B4 chambers and
fissures, and B5's face glare. `sniperSpriteBasis` repeats the sprite loader's
ground-unsquash and 48-row rounding before those Blender-local
`[forward, side, height]` points are projected. The picture and the canvas
effect therefore share the exact visible axes; continuous `tower.aim` no
longer leaves the glow up to 3.75° off the hardware.

**The fast shot tunnelled, and the swept test is the fix.** `PierceBullet`
moved its full step and then tested a circle around where it LANDED. That is
correct only while a tick's travel is small next to a body: at 562.5 u.l./s a
step is ~10 px and nothing is missed. The moment path A's rail tiers took the
speed to 14 000 a step became ~243 px, and the shot teleported clean over
22 px-wide enemies without ever testing them — it hit almost nothing, which
looked like the beam "not colliding". It now tests the whole SEGMENT travelled
this tick, which is what a straight-line shot always meant, and it is strictly
more correct at the old speed too (a fast enemy crossing between two samples
could previously slip through). Verified: a 243 px/tick shot through six
enemies spaced 40 px apart hits all six.

Hits are also applied IN ORDER ALONG THE SEGMENT now, not in array order.
Array order is spawn order, which is meaningless here — and over a long sweep
the falloff would otherwise charge the far body full damage and the near one
the remainder, which is backwards.

**A beam has to outlive its projectile.** Near-instant shots cross the board
in about seven frames, so the firing registered as a flash and read as a bug.
`PierceBullet.leaveRemnant` emits one `lance-remnant` effect ON DEATH — the
only moment the whole line is known, since where it stopped depends on how
much pierce survived the crowd — and it fades over about a fifth of a second.
Shots below A4 have no `style` and emit nothing.

`Effects.aoeImpact` grew an optional `extra` argument for this: not every mark
is a circle, and a beam needs a second endpoint that x/y/radius cannot
express. Two reserved keys, `life` and `particles: false` (a clean energy beam
should not throw debris).

**Smooth turning is not available from pre-rendered sprites** — that is the
one real cost of this pipeline, and worth stating plainly rather than working
around badly. A sprite is a picture from a fixed angle, so facing is always
quantised; the only lever is how fine. Worst-case error is 180/N degrees:
11.25 at 16, 7.5 at 24, **3.75 at 48**, 2.8 at 64. Below about four degrees it
stops reading as snapping, so 48 is where this landed; 64 costs a third more
memory for a difference nobody can point at. Rotating the sprite by the
leftover angle in canvas was considered and rejected: rotating a
three-quarter view in screen space tilts the man's vertical axis, so he leans.
It would be fine for A4 and A5, which are near-horizontal machines, and wrong
for every tier below them — a rule that applies to half the tiers is worse
than a bigger sheet. Sheets stay lazy (`registerSpriteSheet` does not create
its Image until the layer is first drawn), so a run only pays for tiers it
actually builds.

**A laser does not fly.** `projectile.speedUlpsByGraft` raises the shot from
562.5 u.l./s to 6 000 at A4 and 14 000 at A5. For scale: A5's range is 1500
u.l., which at the base speed is 2.7 SECONDS in the air — long enough to watch
it cross the board, which is not what a beam does. At 14 000 it is 0.107 s.
**This is a balance change, not only a visual one**: a shot that lands sooner
is one a fast enemy has less chance to walk out of. `predictedPosition` reads
the same number through `shotSpeedUlps()`, so lead and flight cannot drift
apart — with the old hardcoded `Bullet.BASE_SPEED_ULPS` the tower would have
aimed for a slow shot and fired a fast one, missing ahead of everything.

**The beam dims rather than narrows.** The first version showed pierce falloff
by tapering the beam toward the head, and it read as a long triangle — a cone,
which is a different weapon entirely. A laser's defining property is that it
does not converge. Width is now constant and the drain is carried by
brightness: a gradient from full intensity at the muzzle to whatever fraction
of the damage survives at the head. Same information, still a straight line. A
gradient rather than discrete steps because the shot knows how much damage is
left but not WHERE along the line each enemy took its bite.

**The build/Index icon is the model.** The old one was three violet strokes
standing in for a tower nobody had drawn; an icon that does not match what it
buys is a small lie the player has to unlearn. It cannot go through
`registerSpriteSheet` — the icon subject is `{cx, cy, size, type}`, with no
position, footprint or purchased tier — so it loads the body and tier-0 accent
by URL (cache serves them; it costs a decode, not a fetch) and blits row 0.
`ICON_FILL` is deliberately generous because the tile is sized to fit the
RIFLE, which sticks out sideways, so the man is only about half the tile wide.

**A cone tower still tracks, inside its arc.** Pointing A4 flat at `aimRad`
made it look switched off — it fires at things all over its cone and
acknowledged none of them. The player's chosen direction is the CENTRE of what
it covers, not the only thing it may look at, so the facing follows the
current target and is clamped to the edge of the arc instead of snapping back.

**48 facings, not 16 or 24.** The gap between facings shows up as the barrel
and shot disagreeing about where "forward" is; worst error is 11.25° at 16,
7.5° at 24 and 3.75° at 48. The final value is the first one below the roughly
four-degree threshold where this long weapon stops reading as a snap. Ordinary
256 px sheets keep 48 direction rows. A5's 512 px and B5's 384 px tiles would
make impractically tall images in that layout, so each uses three horizontal
atlas pages of 16 rows. A state that fails to draw immediately after a reload
may still be decoding; the loader remains lazy.

WATCH OUT WHEN TESTING: the browser serves stale `<script src>` files hard.
A run that shows old behaviour after an edit is usually cache, not code —
hard-refresh before believing a failure.

**`ASSET_VERSION` at the top of `draw-pack.js` — bump it whenever a sheet is
re-rendered.** A cached sheet is not merely stale, it is the WRONG SHAPE: when
the body sheet went from one frame to four its width went 256 → 1024, and the
cached 256-wide image made every frame past the first read off the end of it
and draw nothing. That looks exactly like a broken animation and is not — it
is last week's file. It cost two false diagnoses before the version query went
in. There is no server here to set cache headers, so the query string is the
whole mechanism.

NOT VERIFIED: `tests/run.js` was not run — no Node on the machine this was
done on. The changes are presentation-only *except* the muzzle offset, which
moves where a bullet is born and compensates `maxTravelPx` to match; that one
deserves the suite's attention when Node is available.

**2026-08-01 — a scrolling enemy index, real map previews, right-click to
deselect, and the Warbringer and Rifleman brought up to the Siphon and Sniper's
price band.**

Eight requests from the owner, in one pass.

**The enemy index scrolls, and its rows are twice the size.** The roster list
was 26-pixel rows sized so all twenty-one types fitted on screen at once. That
fitted, but it made the screen a directory: the sprite was a nine-pixel speck
and the row had space for a name and two numbers. Rows are now 50 px with ten
in view — the owner's figure — and the list scrolls under the wheel. Ten is the
*unit of the layout*, not a consequence of it: `ENEMY_LIST_H` is derived from
`ENEMY_VISIBLE_ROWS × (ENEMY_ROW_H + gap)`, so retuning the row height moves the
viewport and the scroll clamp together. The extra height buys the sprite at a
size you can identify, the badge line, and the speed beside the health, so the
list now answers "what is this and how fast is it coming" without the detail
panel. `Codex.onWheel` is scoped to the viewport rectangle, so the wheel does
nothing while the cursor is over the detail panel, and `onClick` tests the
viewport *before* the rows — without that, a click above a scrolled list would
land on whichever row was sitting off the top of it.

**The route cards are the actual map now.** They used to draw the polyline in
the difficulty band's colour on a flat dark swatch, which meant every map looked
like every other map in a different tint and none of them looked like the thing
you were about to play — terrain, road width and theme, everything that makes a
route recognisable, was absent. `drawMapThumbnail` renders the whole 1280×720
battlefield into the card through the same three calls the play screen makes in
the same order: the theme's background, `Maps.drawEnvironment`, then the road.
`drawRoad()` was split into `drawRoadOn(routeList, map)` for this — **one
function paints both**, which is the only honest way to promise the preview is
the map, and it means a theme retune or a change to the road's five strokes
shows up on the cards without anyone remembering to update them. The scale is
uniform and the preview box is built 16:9 to make that possible; a non-16:9 box
would force either letterboxing or a squashed map, and neither is "looks exactly
like the map we're playing in". The card layout is what that costs — a 16:9
render at the card's width is 196 px of a 240 px card, so the blurb and the four
stats moved *onto* the render as translucent bands, the same arrangement the
in-game HUD has with the battlefield. Towers, enemies and the old start/end dots
are deliberately absent: the first are run state and there is no run yet, and the
dots were interface the battlefield itself never shows.

**Right-click deselects.** It clears the armed slot, the inspected tower and a
pending aim click together, because "selected" is one idea to the player even
though it is three fields here. It deliberately does *not* open the pause menu
when there is nothing to cancel, which is where it parts company with Escape: a
menu is a place you go, a right-click is a dismissal, and one that could put a
modal on screen would be a trap on a button people click by reflex.

**Both recruit tiers call at 45 s.** B4 was 40 and B5 shortened it to 30. B5 now
buys a bigger, harder squad rather than a more frequent one.

**The Tyrant's roar is a wall and a court.** The shield goes 200 → **1000**: at
200 against a 5000 HP body the roar announced a wall and then did not put one
up — two seconds of a finished board's fire. And the summon gains four rows
behind the running mob it always called: 2 Hives, 3 Shieldbearers, 3 Healers and
2 Colossi, taking it from 600 HP across thirty bodies to **2780 across forty**.
That changes its *shape*, not just its size — it used to be a rush you outlast
and it is now a formation you take apart in the right order, and the
Shieldbearers stacking onto the strongest body on the road means the roar's 1000
is not the last shield the player has to chew through. It is the one moment in
the campaign that asks whether they learnt the support types.

**The Tyrant acts less often and leaps far harder.** Both intervals go 8 → 12 s
(9 after the roar's 0.75 multiplier). Slowing the rhythm is what buys the
individual blows room to be heavy: the leap is now damage 30 → **80**, radius
90 → **120 u.l.**, jump 50 → **90 u.l.**, stun 2 → **3 s** and reach 150 → **220
u.l.**, which makes it the heavier of the two moves. That is the right way
round — the aimed shot picks your best tower, the leap takes the whole corner.
The wind-up grew with it (1.1 → 1.5 s), and that is not optional: a blow this
size has to be visible coming, and the seconds it spends crouching are seconds
it is not walking.

**The Warbringer and the Rifleman gained HP on every tier and were repriced to
the Siphon and Sniper's band.** Two changes that had to happen together.

The Warbringer had *no* health tier at all, which is a strange gap on the one
tower whose job is to stand in the road: its 150 was the same at A5 as the
moment it was placed. Every tier on both towers now carries an `hp` delta —
Warbringer to 575 (A) / 700 (B), Rifleman to 380 (A) / 505 (B). The Smasher
needed the plumbing built: `maxHp` is now derived in `recalcStats()` like every
other stat, which is what makes `previewUpgrade`'s set-flag-recalculate-diff
report the right number and keeps purchase order from mattering.

**A health tier now grants its delta rather than healing to the new maximum.**
That rule was right while the Rifleman's B2 was the only tier that moved the
ceiling — one full heal on one tier is a perk. With HP on all twenty tiers it
would have quietly turned every upgrade into a full repair, so a tower under
fire could be topped up for the price of the next tier. That is a far bigger
change than the health itself and nobody asked for it.

On price: the Siphon and the Sniper cost roughly **$70–$140 for every point of
DPS a finished path produces** (Sniper A is $20 250 for 300 DPS, Siphon A is
$33 800 for 250 ramped). The Rifleman was selling its 66.7 DPS path A for
$3 000 — $45 — and the Warbringer a finished path for $2 525. Both now land in
the band:

| Path | Was | Now | Finished DPS | $ / DPS |
|---|---:|---:|---:|---:|
| Rifleman A | $3 000 | **$6 700** | 66.7 | 100 |
| Rifleman B | $2 850 | **$7 500** | ~75 with recruits and defence pierce | 100 |
| Warbringer A | $2 525 | **$5 200** | 13 × ~4 bodies = ~52 | 100 |
| Warbringer B | $2 675 | **$7 000** | 13.6 × ~4 = ~54, plus the 65% slow, the blast and the quake | ~130 |

The Warbringer is priced against its **effective** output because its damage is
area damage — the swing lands on every body in the zone at once, and four is a
fair count for a wave walking a road. **Both build prices are untouched**
($300 and $700): `STARTING_CASH` is 600 precisely so the opening buys two
Riflemen, and that pair is a documented invariant of the first two waves.
Tactical tiers pay a premium on top of their damage delta, per the owner's
instruction — the Rifleman's B3 (camo) and B4 (defence pierce *and* recruits),
the Warbringer's A4 (120° arc → full circle), B3 (the slow granted), B4 (blast
on kill) and B5 (the only map-wide effect in the game).

**The Automaton Rifleman is now just the Rifleman.** Cosmetic only, and the
same rule the reskin followed: `Soldier.ID` is a persistence format and the
catalogue resolves the constructor by the global name `Soldier`, so neither
moved. `DISPLAY_NAME` is the one string that is purely cosmetic, so it is the
one string that changed.

**Not done, and deliberately: no playtest.** The owner asked to run it himself.
The changes were verified in a real browser against the running `index.html` —
every screen draws, the wheel scrolls end to end through the DOM and is inert
over the detail panel, right-click clears the selection in play and is inert
while paused, the six route cards are exactly 16:9 and sample to a median colour
difference of 12 against a live render of the same map, and the price/HP/boss
tables above were read back off live instances. **The Node test suites were not
run: there is no Node on this machine.** They should be run before this ships.

**2026-07-31 — merged the v0.4.12 branch: kill bounties, two new enemies, a
rebuilt enemy index, three-quarter actors, and the rescaled wave spine.**

The owner asked for sixteen numbered changes from a parallel v0.4.12 branch to
be brought into this one. The branches had diverged: v0.4.12 answered "the game
is too easy" by **rescaling the schedule**, while this one answered it by
**adding Easy/Normal/Hard**, and each had presentation work the other had never
seen. So this was a merge with real decisions in it, not a copy. What follows is
what was taken, what was kept, and the two places the owner had to choose.

**The economy is now bounties, and `CASH_PER_DAMAGE` is gone.** Every type has
an authored `bounty` pricing its whole threat — speed, armour, shields, revives,
abilities — not its hit points. `Enemy.bountyOf` scales that with a wave's
health override, so a tougher body is still worth more, but only when it is
actually killed. Paid once, in the death sweep, on the final death: a Revenant's
first life pays nothing, shields and heals inflate nothing, and Hive brood is
`noBounty` and worth $0. The Siphon's A3 charge income survives as the one
deliberate exception. Damage still flows upward for counters, lifesteal and
charge — it simply stops being money.

The wallet opens at **$600**, and $5000 arrives through play: `waveProgression-
Reward` pays $148 on waves 1–2 and $147 on 3–34, and `waveEscalatingReward` adds
$50 on wave 1 rising by $5 a wave to $215 on wave 34. `waveReward()` sums those
with the old HP-based clear bonus. Note for anyone reading the other branch's
notes: **this branch never held the $5600 opening wallet** that one shed, so the
$5000 is money ADDED to the schedule here rather than money moved out of the
opening. Both branches land on the same lifetime purse, which is what matters.

**Damage counters were lying, twice.** `Enemy.takeDamage` returns 0 for $0 brood
so the Siphon cannot farm charge off a Hive — and `TowerScore` was reading that
same return, so every point of brood damage vanished from tower totals.
`lastDamageTaken` now records what a blow physically absorbed (shields and
restored health included, overkill excluded) and the scoreboard reads that while
the reward mechanics keep the old value. Pierce bullets read it too. Separately,
the Arcane Sniper's B5 was calling `takeDamage` straight from its adapter and
bypassing the scorer entirely; it now goes through `TowerScore.apply` on both
manual and automatic casts.

**Two new enemies.** The **Colossus** is 550 HP, $250, 17.5 u.l./s, oversized,
and deliberately has no shield, armour, defence, revive or ability at all — a
wall with nothing clever about it. Wave 29 gains one, escorted by two 120 HP
Shieldbearers whose scaled bounties replace exactly the $300 taken off the
Colossus. The **Fractal Slime** is one type with per-instance tiers T0–T5,
health `4^tier`, and a halved bounty ladder from $0.50 to $512. On death T1–T5
split into four of the next tier down, once only; the death sweep collects the
children and appends them AFTER the parent is paid and removed, which is what
stops cleanup eating the new generation or declaring the wave clear early. They
are spaced `18 + 8 × childTier` u.l. apart with fresh lane offsets and
deterministic 0.5–1.0 s stuns so they do not land as one puddle. A full T3 is 85
bodies, 256 HP and $128. Wave 25 gains one. Every tier carries
`aoeDamageReduction: 0.5`, and `takeDamage` now takes a `damageKind` so only
attacks tagged `"aoe"` — the Warbringer's wedge, its B4 chain, the Sniper's B5 —
are halved. The Sniper's ordinary piercing line is deliberately NOT area damage
and keeps full value.

**The enemy index was rebuilt** as a compact left column (skin, name, HP,
bounty, all twenty-one on one screen) beside a detail panel that derives base
and effective HP, bounty, speed, crossing time, armour, defence, AoE reduction,
size, visibility, wave appearances and a data-driven behaviour description.
`Enemy.draw(ctx, { hideBars: true })` gives the portraits their skin without a
health bar. **Kept from this branch:** the panel still walks all three
difficulties, because five enemies are only reachable in Normal and Hard and a
guide that hid them would be lying about its own roster. The HP and tier
CEILINGS stay Easy-only, though — the panel prints Easy's wave list beside them,
and a Hard-derived figure next to an Easy wave list is two campaigns reported as
one.

**Presentation: actors yes, terrain no** — the first of the owner's two choices.
v0.4.12 replaced the battlefield with BTD6-style grass and packed-earth roads,
which would have deleted this branch's `Maps.ENVIRONMENTS`: six authored sci-fi
facilities with per-map palettes, four deck/hazard zones and nine machinery
models each, plus route decorations. The owner chose to keep them. So the
three-quarter camera came across for ACTORS only — ground shadows, lifted
bodies, depth sorting by ground Y, the new Warbringer/Sniper/Siphon/Rifleman
silhouettes, projectile shadows and trails — and the terrain hooks fall back to
the authored environments. `enemyAt` had to follow the bodies up: it measures to
`visualBodyY()` now, or the cursor picks the wrong one of two overlapping
enemies.

`Effects.aoeImpact` adds a bounded impact layer (72 max, cleared by `reset()`)
for Warbringer swings, per-target contacts, B4 bursts and the B5's violet ring,
fissures, shards and energy pillar. It sits beside — not instead of — this
branch's earthquake, which keeps its camera kick and floor cracks, and beside
the Path A staged forge-slam.

`js/visual-models.js` is a registry any of that can be replaced through, by
category and id, with `registerSprite` for PNG/WebP/SVG packs;
`MODEL_SKINS_GUIDE.md` documents the ids and `js/skins/example-pack.js` is a
disabled template.

**`js/systems/summon-contact.js`** replaces this branch's inline recruit-contact
pool with a shared rule every future friendly summon inherits: a summon commits
its remaining HP, and if the strike kills it only loses what was physically
absorbed — 35 HP against a 1 HP enemy leaves 34 and walks on. A survivor
consumes the whole commitment, and a revived enemy counts as a survivor.
Recruits move at 40 u.l./s, B4 reaches 100 and B5 now 125, and both wear new
three-quarter clockwork infantry models (brass at B4, steel and cyan at B5) with
independently replaceable model ids.

**`MAX FIELD · A2 / B5 + AUTO`** in the purple debug panel and the Sandbox
sidebar rebuilds every placed tower to exactly A2/B5 — ignoring cost, crosspath
locks, the global B5 gate and the Siphon's healing condition — restores max HP,
fires every real AUTO ability once and leaves it armed. The Warbringer's
Earthquake moved onto `AutoAbility.attach/handle/isOn` so its AUTO survives that
first cast. `debug-cash.js` suppresses its floating panel when the Sandbox
sidebar exists, so the command lives in one place per page.

**The wave spine was rescaled** — the owner's second choice, and the larger one.
This branch's Easy was the v0.4.6 spine at 738 bodies and 11 706 HP; v0.4.12 had
roughly doubled it. The owner chose to adopt the rescale, so `EASY_WAVES` is now
797 bodies and 23 782 authored HP (25 969 effective), the Tyrant is 5000 rather
than 2500, and the five formerly unscheduled types appear in waves 24–35.
**Normal and Hard were NOT retuned** and still layer their additions on top, so
they are currently a smaller step up from Easy than they were designed to be.
That is a known, deliberate debt and it is flagged in the comment above
`NORMAL_WAVE_ADDITIONS`.

Authored totals, all verified live in the browser against the running build:

| Quantity | Value |
|---|---:|
| Enemy types | 21 |
| Scheduled bodies | 797 |
| Scheduled HP / effective | 23 782 / 25 969 |
| Scheduled kill bounties | $23 503 |
| HP-based clear bonuses | $2 596 |
| Starting cash | $600 |
| Redistributed opening cash | $5 000 |
| Rising wave allowance | $4 505 |
| Single-route purse | **$36 204** |

**What was deliberately NOT taken.** v0.4.12 had also removed the gunner from
the shipping build bar; that was not among the sixteen requested changes, so the
build bar is untouched here. The grass terrain is not here either, per the
choice above. Both branches had independently dropped the gunner from the
Sandbox roster already, which is why that fixture failure disappeared.

**Verification:** `run.js` 106/0 and `sandbox.smoke.js` 148/148 — both were
failing before. `content.test.js` 192/16, and the sixteen were confirmed
identical to the v0.4.12 branch's own sixteen by diffing the failure lists.
Longshot 71/0 and beam 45/0 unchanged. Driven live in a browser through the real
`index.html`: the command deck, the sci-fi routes, the ten-second Start pause,
`$600` with "Enemy bounties paid on kill", a T3 slime dividing into 85 bodies for
$128, a Colossus beside two Shieldbearers, both towers taken to exact A2/B5 by
the debug button, and the rebuilt index — with zero console errors. A pre-merge
snapshot is in `TD_0.4.11_premerge_backup.tgz`.

**2026-07-31 — a run opens on a ten-second pause with a Start button, and a
beaten wave is followed five seconds later instead of three.**

Two pacing corrections in one instruction, both about a moment the player was
not being given.

**`WAVE_CLEAR_DELAY = 5`.** *"Once all the enemies of a wave have been killed,
if not on auto skip, leave a 5 seconds delay until the next wave."* The board
clear used to share `WAVE_CALL_DELAY` with the Send button, and they are not the
same event: pressing Send is the player saying they are ready, while clearing
the board is the game deciding for them, and the pause afterwards is the only
one a winning player gets. "If not on auto skip" needed no branch — auto-send
calls in at three, `callNextWave` only ever moves a wave closer, and three beats
five — which is a fair check on that `Math.min` having been the right shape.

**`RUN_START_DELAY = 10`, and the Send button becomes Start.** *"When starting a
run, do not send the first wave immediately, either wait 10 seconds, or the user
can press a start button manually."* `restartGame()` used to spawn wave 1's first
enemy itself, so a run began with a body already walking and a player still
reading the board. Wave 1 is now handed to the ordinary scheduler, which is what
lets the opening inherit the readout, the button, auto-send and the pause key
rather than becoming a fifth screen state. Two guards carry it: `betweenWaves()`
lost the `waveIndex > 0` that existed only because the opening used to have no
break in it, and the board-clear trigger gained `!beforeFirstWave()` — without
that one, an empty road at t=0 reads as a wave just beaten and the ten seconds
silently become five.

Pressing Start is instant, deliberately unlike a mid-run call: the three seconds
that stop a wave landing on a distracted player are three seconds of nothing at
the start of a run.

The sandbox opts out (a workbench is not paced), and so does `boot(mapId)` in the
test harness — same trade as `pinWaveBreak`, with four tests taking the real path
through the chooser to cover what it skips.

**2026-07-31 — The title screen is now a decorated sci-fi command deck.**

The chooser's faint grid was not enough to connect the main menu to the newly
model-filled maps. `drawMenuBackdrop` now builds a complete command room from
Canvas shapes: coloured wall/floor panels, recessed bays, luminous circuit
trunks, industrial hazard markings, a large ley reactor and a deep-space relay
with a holographic tactical screen. A framed centre terminal keeps the title
and navigation legible over the richer room.

The four existing hit rectangles are unchanged, but `drawMenuButton` now paints
them as numbered illuminated controls with mechanical brackets, per-action
accent colours, shadows and stronger hover states. The coin readout became an
armoury-credit status panel. A focused content test verifies the command deck
draws once and all four controls use the dedicated renderer without changing
screen state.

**2026-07-31 — The six maps are now distinct, model-filled sci-fi facilities.**

The earlier motif pass was too faint and left the battlefields reading as
mostly blank gray canvases. Each map now owns a strong per-map palette, four
large deck/hazard zones and nine substantial top-down machinery models. Rune
Circuit is a cyan command deck, Mana Coil a violet capacitor foundry, Sigil
Lattice a green research array, Null Meridian a red-violet containment site,
Shifting Ley a blue phase lab, and Twin Confluence an amber transit nexus.

`Maps.drawEnvironment` overscans the floor for camera shake, adds panel seams,
bevels, hazard markings, circuit trunks and layered pseudo-3D machines before
the route is drawn. `drawRoad` now consumes the same theme for a dark casing,
coloured surface, luminous edge and segmented centre guide. All environment
data remains presentation-only; a focused test renders every map, validates
its palette/zones/model count and proves drawing does not mutate route data.

**2026-07-30 — Warbringer impacts now move and mark the ground; every map has
its own procedural scenery.**

The earthquake now calls the presentation-only `Effects.earthquake` hook on a
successful cast. For 0.75 s `beginWorld` offsets the battlefield with two
irregular frequencies while the HUD remains fixed; a source-centered break and
twenty scattered fissures stay for 2.4 s. Ground, world and screen effects were
split into explicit draw layers so cracks sit under units, particles follow the
camera, and banners remain readable. Failed/cooldown casts start nothing, and
the simulation never reads an effect value.

Path A gained a longer **cosmetic** 0.48 s overhead wind-up with three trailing
hammer poses. Damage timing is untouched: progress still comes from cooldown
and the hit still lands at zero. A successful Path A swing captures its real
aim/range/arc/full-circle geometry and leaves orange-edged cracks clipped to
that AoE for 1.6 s; stored geometry prevents them rotating after impact.

All six maps now carry at least five background decorations in their map data,
with a different motif for each route. `Maps.drawDecorations` paints them under
the road through the same authored scale. They do not participate in route
analysis, placement or targeting. Three focused content checks cover the
Path A frames/cracks, quake shake/fissure lifetime and all-map rendering. The
suite measures 86/6, **187/16**, 71/0 and 45/0; the Sandbox reaches the same
inherited layout failure as before.

**2026-07-30 — Easy remains the original campaign; Normal and Hard add denser,
tougher full-roster schedules, selected before each run and runnable in
Sandbox.**

The owner's request was deliberately schedule-focused, not a new economy or a
route rebalance. `EASY_WAVES` is therefore the old 35-wave array unchanged.
`DIFFICULTIES` derives Normal and Hard from it with explicit count, health,
spacing and lead multipliers plus authored support groups. Normal is 851 bodies
and 22,369 effective HP; Hard is 962 and 30,911, versus Easy's 738 and 13,498.
All five enemies that were previously limited to Sandbox/Index — Aether Wisp,
Shieldbearer, Healer, Vanguard and Camo Heavy — now appear in both higher
tiers. Camo Heavy is confined to all-camo waves so it cannot reveal an
otherwise untargetable Warbringer companion.

PLAY now presents EASY / NORMAL / HARD above the route cards, with keyboard
shortcuts E / N / H. The active tier appears in the HUD, pause and result
screens; Restart preserves it. Sandbox gained the same registry-backed picker
and can reset/run any schedule without clearing the tower test board. The Index
now scans all three schedules, so former Sandbox-only cards show their real
Normal/Hard appearances.

The schedules are made harder with both more bodies and more effective HP, not
HP inflation alone: tighter spacing and repeated shield/heal/flight pressure
change the tactical load while still paying the ordinary authored bounty.
Measured totals and roster/purity invariants are covered in `tests/run.js`;
four focused Sandbox checks cover its picker and schedule switching. After the
change the five commands measure 86/6, 184/16, 71/0, 45/0, and all four new
Sandbox checks pass before that harness reaches its inherited layout failure.

**2026-07-31 — a recruit's contact is a POOL, not one shot: it now costs what
each body is worth to kill, so 40 HP stops 40 HP of swarm.**

The owner: *"when a recruit (40 HP) faces a swarm of 40 enemies (40 HP total), it
should be able to stop it entirely because of its HP. The recruit dies as soon as
the first enemy of the swarm touches it however."* Both halves were true. Contact
had been written that morning as "spend the whole remaining health on the first
enemy to reach me", so a 40 HP recruit paid 40 to kill a 1 HP runner — 39 points
of overkill, which `Enemy.takeDamage` clamps away unpaid — and the swarm walked
over the corpse. A block that cannot be divided is a block whose HP number means
nothing.

`SoldierRecruit.takeContactDamage` now walks **every** enemy touching it while it
still has health, and charges `contactCostFor(enemy)` for each: the raw damage
that just kills it, `armor + remainingHealth / (1 - defense%)`, which is
`Mitigation.mitigate` inverted because the pool is spent before mitigation takes
its cut. Capped at what is left, so **the old behaviour survives against anything
it cannot afford** — a recruit that meets a brute still empties itself into it and
still does 35 through 5 armor.

Two details worth keeping: the cost is exact and the floating-point margin is
applied to the *blow* rather than the pool (overkill is free, and charging the
margin would compound until the fortieth body survived on a billionth of a hit
point); and `touched` now really does fill up, which is what the once-per-enemy
rule was always protecting. Two tests: the owner's 40-vs-40 case exactly, and a
recruit keeping the change after an armoured kill.

**2026-07-30 — Rifleman path B: A1/A2 feed the automatic rate, B4's pierce moves
from armor to defence, B4 +2 damage, B5 to 20 damage, recruits to 30 s.**

Five corrections in one instruction, all on the Automaton Rifleman.

**A1 and A2 now grant +0.25 to the AUTOMATIC rate.** The owner found the hole:
those tiers buy attack speed as burst *shape* (`shots`/`spacing`/`cooldown`) and
B3 throws the burst away, so a B-path Rifleman got nothing at all for
crosspathing into them. Only those two tiers carry it — A3's `locksPath` makes
A3+ and B3 mutually exclusive, so a `fireRate` on A3–A5 would be unreachable.

**They are now the ONLY attack speed path B can buy**, which was not true when
they were added: B5 also carried +3 shots a second for a few hours the same day
and the owner took it straight back out. So the automatic rate is 2.5/s the
whole way up path B, and 3.0/s crosspathed into A1+A2.

**B4's pierce moved from FLAT ARMOR to FLAT DEFENCE, 6 → 10 points.** His words
and the code's use opposite vocabularies (his "armor" is the percentage, his
"blindage" the flat subtraction), so: 10 percentage points off `defense`, and
**nothing pierces flat armor any more**. The `armorPierce` parameter was removed
throughout — `Mitigation`, `Enemy.takeDamage`, `TowerScore.apply`, `Bullet` —
rather than left as a dead argument.

**The zero clamp was explicitly requested and it matters**: without it 10 points
against a 0-defence enemy is −10, which is a 10% damage *bonus* against every
unarmoured enemy in the game. Tested at zero defence, at exactly-equal defence,
and against an enemy with no stats at all.

**A consequence, reported not fixed: the brute counter moved a tier.** B4's flat
pierce used to zero a brute's 5 armor. Now nothing does, so a B4 Rifleman's 5
damage does literally nothing to a brute and path B's answer is B5's raw 20.

**B4 +2 damage; B5 +15 instead of +5**, taking the rifle to a flat **20** (1 + 1
+ 1 + 2 + 15) — the owner's figure, not a derivation. **B5 also drops the recruit
cooldown to 30 s**; B4 keeps 40, so the cooldown became a per-instance value
resolved by `recalcStats` rather than a constant read at the call site.

**B5's attack speed was added and removed within the hour**, on the owner's
correction. With it, path B ended at 110 DPS against path A's 66.7 and dominated
outright; without it path B ends at **20 damage @ 2.5/s = 50 DPS** (3.0/s and 60
crosspathed into A1+A2). So **path A wins on the tower again** — 66.7 against 50
— and path B wins on camo, pierce, range, HP and four recruits. That is the
balance the two-pass A4/A5 retune was aiming at, restored by deleting one field.

**Verified against the real running game, not just reasoned about** — this time
the preview pane did reload from disk, so every figure below is measured on the
shipping code: the rate ladder (2.5 → 2.75 → 3.0 with A1/A2, and 2.5 / 3.0 at
full B) with pure A untouched at 8.33/s burst; the damage ladder to 20; recruit
cooldowns 40 at B4 and 30 at B5; every mitigation case including the clamp;
real bullets landing 18 a shot on a real Armored enemy (20 through 20% defence
with 10 points pierced); and the panel, hover card and codex all rendering the
new numbers. The B5 attack-speed removal was measured the same way — the pane
had gone back to serving a cached snapshot by then, so it was checked by
deleting the field in the running game and re-reading the whole ladder.
**The Node suite still has not been run — there is still no Node here.**
Roughly a dozen test assertions were updated and two tests rewritten, all
checked against those live measurements before being written down.

**2026-07-30 — Selective v0.4.10.0 merge: Rifleman, flying Aether Wisp,
auto-ability switches, and the complete map pool only.**

v0.4.9 remains the base. `js/soldier.js` was overwritten with the newer
$300 Rifleman (automatic B3, recruits at B4, B5 rifle/recruit boost and the
retuned A path). The sandbox-only `flying` type, fail-closed flight targeting,
flight visuals and Index badge were merged without changing the 35-wave
schedule. `js/systems/auto-ability.js` was added and wired only to Rifleman
recruits and the Arcane Sniper B5 nuke; switches are off by default.

The price change exposed one base bug in `js/meta.js`: `STARTING_CASH` is a
top-level `const`, so it is not a `window` property and the loadout guard was
silently using its old $20 fallback. It now reads the lexical $600 constant
directly; otherwise a $300 Rifleman could be mistaken for unaffordable.

`js/maps.js` now contains the four existing authored maps plus deterministic
Shifting Ley and dual-entrance Twin Confluence. `game.js` normalizes maps to
one or more paths, mirrors each scheduled beat across Twin Confluence's two
routes, preserves route identity for spawned descendants, checks placement
against every road, and draws/previews all routes.

Deliberately **not imported**: v0.4.10.0's extra towers, tower registry,
RunEconomy/economy retune, cash-per-damage changes, loadout expansion, or any
other roster/gameplay changes. This boundary is part of the requested merge,
not an omission.

Verification on the bundled Node runtime: core remains **83 pass / 7 inherited
failures**, exactly its pre-merge result; content is **184 / 13**, versus
168 / 13 before the merge; Longshot is **71 / 0**; Beam is **45 / 0**; and the
focused Soldier merge check passes. The sandbox smoke file still reaches its
pre-existing stale roster/placement failures and eventual layout crash, but
both new Aether Wisp picker/spawn checks pass before it. All 14 touched
JavaScript files pass `node --check`.

**2026-07-30 — B4's blast bug fixed, the blast now slows, the quake cooldown is
45 s, the Siphon gets its name back, and THE GUNNER IS DELETED.**

Five corrections in one instruction, the last of them large.

**The blast bug, and it was a real bug.** The owner: *"when the b4 warbringer
attacks and kills the enemy they don't explode, however they should be because
attacked enemies are slowed even if they die instantly."* `swing()` recorded
`wasSlowed` BEFORE the blow and applied its own slow AFTER it, so the only thing
that could ever have slowed a first-swing victim was the swing that had not
happened yet — a one-shot kill never burst. **The fix is the ordering**: slow,
then damage, then burst. The `wasSlowed` guard is gone and would be dead code if
it stayed (B4 requires B3, B3 grants the slow). The old prose in the Content
section defended this as "very conditional... do not loosen without being
asked"; that note was wrong and has been rewritten rather than left standing.

**The blast now applies the tower's slow to everything it damages**, reversing
this file's older rule that a burst was "a consequence of a blow that already
landed, not a second swing". A chain running down a column now leaves the whole
column slowed.

**Earthquake cooldown 20 → 45 s**, the owner's figure replacing the one this
file picked. 8 s of effect against 45 is ~18% uptime rather than 40%.

**"Mana Fountain" → "Siphon"**, undoing that half of the reskin. `DISPLAY_NAME`
and the config's `displayName` only; the id (`siphon`) and constructor
(`BeamTower`) never moved, so the round trip cost no save data.

### The gunner is deleted

Removed from `CATALOGUE` in js/meta.js, which is the whole deletion as far as
the game is concerned: BUILD_SLOTS, the starting kit, the armoury, the index and
the sandbox roster all derive from that array. There is no way to place one. An
existing save with `"gunner"` in `owned`/`equipped` drops it silently, which is
what `sanitise` has always done with unknown ids.

**Every build-slot index shifted down by one.** The Warbringer is slot 1 now and
the fifth slot is empty. The alternative was a permanently blank first slot —
a dead hotkey and a dead patch of build bar kept out of nostalgia.

**`js/tower.js` IS STILL LOADED, and the banner at the top of it lists exactly
why**: `Smasher`/`Soldier` take `FOOTPRINT_RADIUS_UL` and `containsPoint` from
it. That is one constant and one four-line function shared so two tower types
cannot disagree about their own size or hit box. A new file whose entire
contents are `11.25` and a distance check is churn, not progress.

**The map difficulty yardstick moved to the Automaton Rifleman**
(`Maps.REFERENCE_TOWER`), and **every route's score is bit-identical** — the
Rifleman is 100 u.l. with the same footprint, so the two numbers that go into
the arithmetic are the same two numbers. Verified against all four routes:
rune-circuit 0.826339, mana-coil 0.565583, sigil-lattice 0.886382,
null-meridian 1.060908, before and after. The 100 u.l. reference the whole
distance system is anchored to therefore survives the deletion intact.

**The starting kit is now the Warbringer and the Automaton Rifleman**, and the
economy invariant still holds with room to spare: `STARTING_CASH` is $600
against a $15 Rifleman. What it no longer buys is "six gunners exactly" — the
opening is now Riflemen, which is what the Rifleman was always for.

### What this did to the tests, and what is NOT verified

**85 `h.place(...)` calls became `h.placeGunner(...)`.** A new harness helper
constructs a `Tower` directly and drops it on the board through the game's own
`addTower`, because a large part of this suite measures the REFERENCE TOWER's
physics — target claiming, u.l. invariance, bullet flight, throughput per unit
of DPS — and those tests are still worth having and still true. What they can no
longer prove is that the placement UI works for this tower, and the UI no longer
offers it, so there is nothing left to prove there. `h.slotOf(ctor)` was added
and `placeSmasher` now resolves by constructor: **slot indices must not be typed
in any more.**

Two call sites that passed an explicit slot were caught by that rename and put
back by hand (the Tyrant's highest-DPS test, and `placeSoldierBeside`).

**Three tests were rewritten because this turn inverted what they assert**: "an
unslowed kill does not burst" became "a kill on the very first swing still
bursts" (it is the regression guard for the bug above), "the blast itself
applies no slow" became "the blast slows what it damages", and the build-bar
roster now reads Warbringer/Arcane Sniper/Siphon/Automaton Rifleman/null.

**NOT RUN, and this time not fully verified either.** Still no Node. Worse, the
browser I have been verifying against serves a cached snapshot of this folder
and would not reload from disk, so the checks had to be done by loading the new
implementations into the running game by hand. What that DID establish: the
instant-kill burst now fires (a never-slowed victim killed on the first swing
bursts, neighbour 50 → 13, one blast marker), the blast applies the slow (a body
outside the wedge takes 15 and comes away at 40% for 2.5 s), and the map scores
are bit-identical after the yardstick swap.

**What is NOT verified at all: the gunner's removal from the catalogue.** The
game was never booted with that change — no build bar, no armoury, no index, no
sandbox, no starting kit, no save migration. It is a data deletion with derived
consumers and I believe it is correct, but nobody has watched it run. **Boot the
game before trusting it**, and expect the test suite to need another pass on top
of the 85 mechanical renames.

**2026-07-30 — The Warbringer's path B: range on B2/B4/B5, a chaining blast,
and an earthquake on B5.**

Four things in one instruction, all on branch B. The full spec and the
reasoning are in "Path B, rebuilt 2026-07-30" under the Content section; this
entry is what moved and why.

**Range: B2 +15 u.l., B4 +10, B5 +15.** Path B granted none before. Full B is
now 71.25 u.l. against 31.25, and A2 + full B crosspaths to 83.75.

**Written as a SECOND, ADDITIVE column** (`rangeBonusUl`) rather than folded
into the existing absolute one, because "+15" cannot be expressed as an
absolute-max: a tower already holding A2's 43.75 would have got 2.5 u.l. out of
it. Path A is untouched and still absolute. This is the detail most likely to
be "tidied" into one column by a future session, so it has a test that walks
B1→B5 a tier at a time and another that pins path A at 62.5.

**A consequence, flagged rather than fixed:** at B4 the wedge is 56.25 u.l. and
the blast is 18.75, so the blast radius is now entirely inside the swing and the
burst no longer reaches anything the swing missed on its own. The chain below is
what gives it a job again. Nobody asked for the radius to grow and it did not.

**Blast damage 3 → 15, at every tier, and it CHAINS**: anything that dies to a
burst bursts in turn. **A body may burst at most once**, tracked in a local list
and driven by a queue, so the cascade the old `explode()` comment refused to
build is bounded by the size of the board — worst case, every enemy on the map
explodes once. A forty-body crowd is run through it in a test to pin that it
terminates.

**B5 grants the earthquake**: the machine jumps, every enemy on the map stops
moving for 3 s, and then moves 60% slower for 5 s. No radius, no damage, no
cash cost. It goes through the same `panelActions`/`performAction` ability
contract the Arcane Sniper's nuke uses, so the panel button, the hover card and
the sandbox sidebar needed no work.

**Two decisions the spec did not make, both flagged in the code:**

- **The 20 s cooldown is mine, not the owner's.** A map-wide freeze with no
  gate is a button that ends the campaign. A cooldown was chosen over a cash
  cost or self-damage because it keeps the ability about timing, which is what
  path B is about. `Smasher.QUAKE_COOLDOWN_SECONDS` is the single line to
  change if he names a figure.
- **The stun is MOVEMENT only** — a stunned Tyrant still aims and shoots. The
  spec says "causing enemies to stop moving", and an attack lockout is a much
  bigger promise than those words carry.

**The stun and the slow are applied together**, with the slow's duration
covering the stun (3 + 5 = 8 s). A stunned enemy is already at zero speed, so
what the player sees is exactly the specified sequence; the alternative was a
scheduler holding a pending slow, which is a second kind of timed global state
for no observable difference.

**`Enemy.stunTimer` is a new field**, deliberately distinct from `rooted`
(permanent, from a revive), `windUpTimer` (the enemy's own doing) and
`slowMultiplier` (a fraction, not all of it). Longest wins, matching both
`applySlow` and `TowerHealth.stun`.

**Six existing tests were rewritten and eleven added.** The rewrites were forced
by the range change: `IN_BLAST` and `BEYOND` were chosen to sit outside a
31.25 u.l. wedge and a B4 Warbringer's is 56.25, so "out of the swing, inside
the blast" is no longer a reachable position. They now assert what the blast
actually does — it lands on top of the swing, and the chain is what reaches past
the wedge — off a separate ladder of marks (`CHAIN_1`…`CHAIN_CONTROL`) measured
against the real path geometry. The bare-smasher fixture guard is untouched and
still passes, because a Warbringer with no upgrades is exactly what it was.

**NOT RUN: the Node suite, again — there is still no Node on this machine.**
Every number above was verified against the real running game in a browser
instead: the range ladder tier by tier and crosspathed, the chain through a real
swing (five bodies burst, the last two outside the wedge, a control untouched),
a survivor refusing to pass the chain on, a forty-body crowd terminating at
exactly 41 bursts, the quake freezing four spread-out bodies including the boss
for exactly 3 s and then leaving them at 20 u.l./s for 5 more, the cooldown
gating a second press and recovering, a latecomer not being caught, the boss
still winding up and hitting for 45 while stunned, and the panel button
appearing only at B5. Every test written here was checked against those
measurements before being written down, but the suite itself is unproven — run
all five before trusting it.

**2026-07-30 — Shields pay nothing, ever; four new enemy types, none of them in
a wave.**

Asked for as one instruction with five parts: *"let's add some more enemies but
don't add them to any waves, just to the index and of course to the sandbox mod
so we can test them. 1st make it so that shield gives 0 money, ever."* Then a
Shieldbearer, a Healer, a fast boss and a heavy camo.

**A shield gives $0.** `Enemy.takeDamage` now returns only the part of a blow
that landed on HEALTH, and `Enemy.bounty()` is `maxHealth` rather than
`maxRemainingHealth()`. The shield itself is unchanged — it soaks first, spills
through, breaks the same way — only its *worth* moved. Done at that one door
because the return value has always meant "what this hit was worth to the
player" (it is why overkill is clamped out of it), which is the same door
`noBounty` already came through, so cash, the Siphon's lifesteal, its charge
meter and every tower's damage counter were all covered by one edit rather than
by an audit. **A Siphon chewing a shield therefore earns no lifesteal and no
charges either.** That follows from the principle and was not separately asked
for; if it is wrong, the fix is a second return value, not a special case.

**What it costs: exactly 1 364 HP of the schedule, so $4 092 — a 10% pay cut**
on a $42 443 purse, concentrated on the waves carrying Bulwarks. Measured
against the real `WAVES`, not estimated. The schedule and the prices were **not**
adjusted to compensate, because nobody asked and because compensating would
have quietly undone the change.

**`waveEffectiveHealth` was deliberately NOT changed.** It measures what the
player must remove, which is still 13 498 and still the owner's target, and the
clear bounty is still a tenth of it. It is simply no longer a purse, and the
economy section now spells out the three different numbers that used to be one.

**Healed HP pays nothing either**, by the same mechanism (`healedHealth` on the
instance, spent first when a blow lands). Without it the Healer below would be
an income tap rather than a tax. A REVIVE still pays in full — a second life is
scheduled and priced, so `tryRevive` clears the healed pool to say so.

**The four types, none scheduled.** The owner wanted them reachable before
anything is built around them, so they are in the index and the sandbox and in
no wave. That cost one rule: *"every type must be scheduled"* was half of a
test, and the half that said "every wave is claimed by a type" is kept while the
other half became an explicit list of the unscheduled ids. Their index cards
say "Sandbox only — no wave" rather than a bare "Waves ".

- **Shieldbearer** — 60 HP, ×0.45. Every 10 s, +20 shield to the ten strongest
  bodies on the map, **stacking**, as asked. Since a shield now pays nothing,
  everything it hands out is work done for free: the same shape as the Hive,
  where the body is ordinary and what it *produces* is the cost.
- **Healer** — 200 HP, ×0.4. Every 8 s, 15 HP/s for 4 s to the three enemies
  missing the most health. The heal lives on the TARGET and ticks in its own
  `update`, so it outlives the Healer — killing it stops the next pulse, not
  the one already running.
- **Vanguard**, the fast boss — 750 HP, ×3.5 for the first 400 u.l. and ×1.75
  after, plus 100 shield every 7 s that **refreshes rather than stacks**. The
  opposite threat to the Tyrant: that one is a wall you grind while it silences
  your board, this one is a body you have very few seconds to remove, and the
  non-stacking shield makes it a burst problem rather than a sustained one. The
  name is a placeholder like the Tyrant's.
- **Camo Heavy** — 20 HP, ×0.65, camo, **5 flat armor behind 20% defense**. The
  owner said "20% armor and 5 blindage"; in this codebase `defense` is the
  percentage and `armor` is the flat subtraction, so that is how it was written.
  Health and speed were not specified and were chosen to read as "heavy".

**Two new mechanic blocks rather than two special cases** — `support`
(shield/heal other enemies on a timer, read by `supportAllies`, called from the
main loop between the brood append and the tower step) and `sprint` (faster
over an opening stretch of ROAD, not for an opening span of time). `sprint` is
two lines and still got a block, because the alternative was
`if (typeId === "boss_fast")` inside `currentSpeedUlps`, which is the exact
branch this whole arrangement exists to prevent. The fast boss's self-shield is
`support` with `pick: "self"`, not a third mechanism.

**The index's enemy grid needed a layout pass.** Three rows is fixed and the
columns follow from the roster size, so eighteen types took the card from 238 px
to 197. The card is now width-adaptive (smaller sprite, tighter text column,
shorter labels) and the stat value's room is **measured against the label**
rather than assumed from a fixed 118 px — that assumption was already wider than
the whole value column, so every stat on every card would have clipped. The
behaviour rows were re-measured against real canvas metrics rather than
eyeballed; if a future type makes one longer, measure it again.

**NOT RUN: the Node suite. There is no Node on this machine** — the same
hazard this document has recorded twice before, and the reason for the warning
under "How to run and test". Every mechanic and every number above was instead
verified against the **real running game in a browser**, driving the real
`update()`, `takeDamage`, `supportAllies` and `Codex` from the console: shield
and healed-HP payouts, the ten-strongest pick and its stacking, the three-most-
wounded pick and the exact 60 HP restored, the sprint boundary at 400 u.l. in
both directions and under a slow, the non-stacking refresh, the heavy camo's
mitigation, the main-loop hook, and the index building and drawing with all
eighteen types. Tests were written for all of it and are **believed correct but
unproven** — run all five suites before trusting them.

**2026-07-30 — Renamed all towers to match robot fantasy/magic theme. No
mechanic or stat changes.**

Smasher → **Warbringer**, Longshot → **Arcane Sniper**, Siphon → **Mana
Fountain**, Soldier → **Automaton Rifleman**. Each tower's `draw()`,
`drawIcon()` and (where it had one) its projectile were redrawn to match. The
full mapping, and the rule about which of a tower's three names may move, is in
the new "Tower names" section above the Current values table.

**Why the ids and constructors did not follow.** `Type.ID` is written to
localStorage by `MetaProgress`, so renaming one un-owns that tower for every
existing player; the catalogue also finds each constructor by its global name
(`global: "Smasher"`) because meta.js loads before the tower files. So the
files are still `js/smasher.js` and `js/soldier.js`, the tests still say
`h.placeSmasher`, and only `DISPLAY_NAME` moved. That keeps the rename free of
risk and keeps this document checkable against the source.

**The gunner was left exactly as it was**, at the owner's instruction: "delete
this tower, but it stays in code as a placeholder for now". It keeps its name
and its old artwork, which now makes it visibly the odd one out — the correct
signal for a unit on its way out. Nothing was deleted; it is still in
`BUILD_SLOTS`, still a starter, and still the 100 u.l. reference tower the
whole distance system is anchored to. Actually removing it is a mechanics
change and was not made.

**Nothing simulated changed.** No cost, damage, range, fire rate, footprint,
cooldown, HP, upgrade, flag or targeting rule was touched, and
`Smasher.swingProgress()` — the one animation input the simulation shares — is
byte-identical, so damage still lands on exactly the frame it always did. Three
cosmetic fields were added (`Smasher.slam`, `Smasher.weight`,
`BeamTower.healGlow`), each written by the thing that causes it, aged in code
that already existed for the purpose, and read only by `draw()`. Everything
else the new artwork reacts to is derived from stats that were already there.

**Six test assertions were updated, all of them name literals** — the build-bar
roster in run.js, the placed-tower names in run.js and content.test.js, two
armoury bar snapshots, the codex lookup for the Siphon, and two in
sandbox.smoke.js. Every suite is back at the counts recorded under "How to run
and test": 89/1, 159/6, 71/0, 45/0, and the sandbox smoke passing. The seven
pre-existing failures are untouched and unrelated.

**Two places where the brief and the code disagreed, resolved in the code's
favour** and flagged rather than fixed by moving a mechanic: the brief put the
Arcane Sniper's camo detection on path B (it is A1) and the Warbringer's speed
scaling on path A (it is path B). The visuals key off the resolved stat or flag
rather than off a branch letter, so both read correctly either way — and
crosspathed towers now draw honestly, which the old branch-tint-only artwork
did not.

**Not touched, and worth knowing:** `README.txt` is player-facing and still
uses the old names throughout. It was out of scope here; it will need a pass
before anyone reads it as documentation of the shipping game.

**2026-07-30 — Economy revamp: a real starting stake, $3 per damage, and towers
repriced to match.**

Asked for, as an exact list of values: `STARTING_CASH` 20 → **600**,
`Tower.COST` 15 → **100**, `CASH_PER_DAMAGE` 1 → **3**, `Smasher.COST`
200 → **700**, Longshot `baseCost` 75 → **900**. The Siphon's $800 was named in
the request and confirmed unchanged; the Soldier's $15 was not in the request and
was left alone. Upgrade costs, the wave schedule and the meta-coin catalogue were
explicitly out of scope and none of them moved.

**Why, in the owner's terms:** the old stake bought exactly one gunner, and the
whole opening was earning the second one. That made the first two minutes a
single decision repeated. $600 buys six gunners, so the opening is a *board* —
where do these go — and the game starts at the question it is actually about.
Tripling damage income keeps that board fundable: a five-figure purse is what
lets mid-game towers be a real mid-run purchase rather than a thing you read
about on the index screen.

**The invariant was checked and holds.** `STARTING_CASH` ($600) exceeds the
cheapest tower. Note the cheapest tower is the **$15 Soldier**, not the $100
gunner — the request described the gunner as the cheapest, and it is not, though
the invariant holds either way and by a wider margin than before.

**Two figures in the request did not survive contact with the arithmetic**, and
this file records the measured ones rather than the stated ones:

1. *"full-run income (~$13,500)"* — 13 498 is the schedule's effective **HP**,
   which was the purse only while damage paid $1. At $3 the purse is
   **~$42 443** (40 494 damage income + 1 349 bounties + 600 stake), verified by
   driving the real harness. The $3 rate was chosen for a ~13 500 target and
   overshoots it roughly threefold; $1 per damage is what produces ~$13 500.
2. *"full upgrade trees remain a multi-run goal"* — they do not, on two counts.
   A single run's ~$42 400 now funds a complete tree outright (Longshot full A
   $20 250, full B $28 575; Siphon full A $33 800, full B $17 900) where the old
   ~$14 900 purse funded none of them. And upgrades were never a multi-run goal
   mechanically: per-run cash does not persist, `MetaProgress` saves only coins,
   owned types and the loadout, so the only multi-run currency is coins and the
   only thing they buy is tower ownership.

Both are flagged rather than silently corrected by moving a number the owner
pinned. If the intent was a ~$13 500 purse with trees out of reach, the change
is `CASH_PER_DAMAGE` back toward 1 (or upgrade prices up); that is a decision,
not a typo, so it is left to him.

**Three knock-on inconsistencies the revamp created and did NOT fix**, each
recorded where someone would trip over it:

- **The beam's `baseGoldPerDamage` is still 1** and its comment still claims to
  match `CASH_PER_DAMAGE`. Base income is fine (the loop pays it at
  `CASH_PER_DAMAGE`), but the A3 charge *bonus* is derived from it, so that
  mechanic now pays a third of its intended proportional bonus. Noted in
  `beam.config.js`'s neighbourhood via `tests/beam.test.js` and
  `tests/sandbox.smoke.js`.
- **The Longshot's upgrade pricing model is off its peg.** Its tiers are priced
  at "the gunner's rate of $15 per DPS" and the gunner is now $100 per DPS, so
  upgrades are ~6× cheap relative to the towers they sit on. Explained in the
  cost comment in `long-range-dps.config.js`.
- **The wave clear bounty is a tenth of HP, not of cash**, so it did not scale.
  It was a 10% raise on the old purse and is ~3% of the new one.

**The suite was run — the first time since v0.4.6.** This file had been asking
for that since v0.4.7 shipped untested. Results and the pre-existing failures it
exposed are in "How to run and test" above; the economy work itself is green.
Test expectations were updated to the new values, never the reverse. One
genuinely stale test figure was also corrected: `tests/run.js`'s "first gunner
earns the second in ~26 s" had been asserting a 22–30 s window against an actual
20.3 s since the 2026-07-27 map rescale, so it was failing before this change
touched anything; its premise (a stake that buys one gunner) is gone, and it is
now a rate check rather than a pinned figure. `tests/harness.js`'s `meter()` also
had `CASH_PER_DAMAGE = 1` baked into it — it recovers damage from a cash delta —
and now divides by the constant instead.

**2026-07-29 (v0.4.7) — The Soldier: a burst-fire starter unit, flat armor
pierce, and units that are not towers.**

Asked for: a fifth tower called the Soldier — $15, the game's primary starter
unit and the intended replacement for the gunner once the gunner is removed —
with a full stat table, two five-tier paths under the existing crosspath rule,
and a B5 that calls in temporary walking recruits. The gunner stays; no
existing tower, enemy or economy value moves. See **The Soldier** above for the
full design; this entry is the *why* behind the decisions that were not simply
transcribed from the table.

**It is written like the Smasher, not like the Longshot.** The owner's paths
are absolute per-tier values, which `recalcStats()`-plus-flags handles
directly; a config-driven `ConfiguredTower` would have meant translating his
table into deltas and keeping that translation honest forever, for no gain. It
plugs into the existing `buyUpgrade`/`panelActions`/`performAction` contract,
so the panel, the hover cards, the codex and the armoury picked it up with no
changes to any of them.

**The burst cycle is measured from one burst's START to the next.** That single
choice is what makes the owner's own DPS figures come out (`3 × 1 / 1.2 = 2.5`,
`5 × 3 / 0.7 = 21.4`) and it makes shot spacing a *shape* rather than a cost.
Measuring from the last shot instead would have made every price in the A table
wrong by the width of a burst. `attacksPerSecond()` is `shots / cooldown`
accordingly, so the panel's Damage, Attack speed and DPS rows still multiply
out — which is the whole contract of `js/systems/tower-stats.js`.

**Retargeting is per shot, and a shot with nothing to hit is lost rather than
cancelling the burst.** The spec said both "remaining shots immediately
retarget" and "those shots are lost", which only reconcile if each shot decides
for itself. Abandoning the remainder would have made a Soldier standing over a
thinning wave measurably worse than its own DPS row.

**Flat armor pierce (B4) is a new global mechanic, because there was none.**
The game had percentage *defense* pierce and nothing that touched *armor*, so
`Mitigation.mitigate` grew a fourth argument that reduces armor only, clamped
at zero so pierce can never become a damage bonus. It threads through
`Enemy.takeDamage` → `TowerScore.apply` → `Bullet` as trailing optional
arguments, so **every existing call site passes nothing and behaves exactly as
before** — a test asserts a gunner's bullet still carries zero. It rides on the
bullet rather than being read off the owner at impact, for the same reason
`damage` does: a shot is fixed when it is fired. It deliberately does not
change the *claim*, which has always reserved raw damage.

**Recruits live on the tower, and that was the interesting call.** The obvious
shape — a global `recruits` array beside `enemies` and `bullets` — would have
meant a new run-scoped list for `restartGame()` to reset, a new draw pass, and
a new thing every future session has to remember. Hanging them off the Soldier
means clearing `towers` clears them and nothing new can be forgotten. The
honest cost is stated rather than hidden: recruits go with the tower that
called them, unlike a bullet already in flight. And because `Targeting.pick`
duck-types a shooter, a recruit got all six targeting modes and the camo rule
by spelling five fields the way a tower spells them.

**Two spec gaps, both flagged rather than quietly filled.** *Contact damage*
was not specified at all, so it is derived — the recruit's own shot damage, 3,
charged once per enemy, which makes 12 HP mean "four bodies walk over me".
Once-per-enemy rather than per-frame matters: per-frame would tie a recruit's
life to the frame rate. *Camo inheritance* was not specified either; armor
pierce was explicitly carved out and camo was not, and B5 requires B3, so
recruits inherit detection — a blind recruit would be useless on exactly the
waves its parent was upgraded for. Both are one constant and one boolean if the
owner wants them the other way.

**The meta-progression loop's premise changed, so it was re-measured.** The
Soldier is a starter and its B3 is camo detection — until now the *reason* a
fresh profile could not win was that the starter bar had none. `tools/measure-
starter-kit.js` was written for that question. The loop survives, for a better
reason than before: detection moves the wall from wave 19 to wave 28 on the two
easier routes, but the $415 costs you the board that earns it, so the starter
kit still loses on all four routes under every policy scripted. The table is
under Meta progression. **A method note worth keeping**: the first draft of
that tool reported "no change" confidently and wrongly, because a greedy
builder that spends every $15 immediately never accumulates $200 — it measured
building and called it upgrading. Its policies now have an explicit saving
phase and it prints how many Soldiers actually reached B3.

**Slot five is used, so the bar is full.** It had been held empty across
several change logs specifically so the bar would not change shape when a fifth
type arrived, and it did not. A sixth type is now a real decision about
geometry and hotkeys rather than a drop-in, and the roster test in
`tests/run.js` is where that will surface. On a *fresh* profile the Soldier
lands in the third slot rather than the fifth, because `defaultLoadout`
compacts rather than leaving holes — that rule predates the Soldier and a bar
with two gaps in the middle would be worse.

Tests: twelve new cases in `tests/content.test.js` covering the stat tables,
burst timing measured shot by shot, per-shot retargeting, crosspathing, the
A5+B1+B2 endpoint, armor pierce against a brute, the recruit lifecycle, panel
vocabulary, and one asserting nothing on the existing towers moved. Four
roster-pinning tests were updated for the fifth slot, and `sandbox.smoke.js`
now walks the Soldier's panel with recruits out — its tallest case. All five
suites pass: 78 / 151 / 71 / 45 / smoke.

**2026-07-29 (v0.4.7) — Waves arrive three seconds after you earn them, three
new enemies behind the midboss, mixed waves, and a boss bar for the midboss.**

Asked for, in one go: a 3 s timer before the next wave whenever the skip button
is pressed, the last wave's enemies are all killed, or the 90 s runs out; an HP
bar at the top of the screen for the midboss; two more waves; three new enemy
types (a shield worth twice its health that doubles its speed when broken; one
that dies, stops moving and heals to full once; a 150 HP slow spawner that
seeds five normals every few seconds, **those** carrying a shield equal to
their life and paying no money); a harder, steeper, more chaotic schedule with
mixed-type waves — while remembering that these 35 waves are the EASY tier, the
introduction to the game. And a boss at wave 35, **deliberately not built
yet**. Then, on review: the lane offsets scaled up and made to look actually
random.

**The Hive was misread first time round** and is worth recording as a mistake
rather than quietly fixing: the first pass gave the *Hive* the shield and the
empty bounty. It is the BROOD that carries both. The owner's correction: "it's
the spawns that have a shield and give nothing, not the hive."

**The 3 s call.** `WAVE_CALL_DELAY = 3`, and one function, `callNextWave()`,
which every trigger routes through: the Send button, the auto-send toggle, and
the new board-clear check in `update()`. It uses `Math.min`, so a call may only
ever bring the next wave CLOSER — with two seconds left, clicking Send must not
push it back out to three. The 90 s ceiling still fires on its own.

Worth being explicit, because it reverses the shape of a decision made earlier
the same day: on a board that is killing everything, almost every break is now
three seconds rather than ninety. The long break is now a floor under a board
that is *losing* — with something still walking you get as long as you need —
rather than a standing pause. Measured consequence: a winning run takes about
730 s of wall clock instead of about 3100 s.

**Mixed waves.** A wave may carry `groups: [...]` instead of flat fields, each
group with its own count/interval/type/health and an optional `lead` (the pause
before its first body). `waveGroups()` is the one place the two forms are
reconciled and the flat form IS the single-group case, so nothing else reads
`wave.count` directly. Half the schedule stays single-type on purpose: a wave
of one type is a question with one answer, and those are what teach the game.

**Camo waves are never mixed**, and that is a rule about the Smasher, not about
tidiness — its swing damages what it physically reaches, so one visible enemy
in a camo wave would let a detectionless Smasher clear it as collateral and the
whole buy-detection check would evaporate. A test pins it.

**Three new types, and not one branch on a type id between them.** `shielded`
(Bulwark), `revenant` and `hive`, added as three DATA blocks on the type —
`shield`, `revive`, `spawns` — each read by one method that asks whether the
enemy has one. That is the same arrangement `angry`'s `attack` block already
had, and the founding rule of `enemy.js` survives three more mechanics intact.
Tests pin the exact membership of each list.

Two decisions inside that are load-bearing:

- **A shield is a RATIO of the enemy's own health**, not a flat number, so a
  wave scaling the type with a `health` override scales its shield in step.
  `unclaimedHealth()` and `Targeting.score` both count it (or towers would
  write a full-health Bulwark off as dead on arrival); a LEAK does not, because
  a shield is armour worn, not mass thrown at the base.
- **A shield and an empty bounty can come from the SPAWN rather than the type.**
  The Hive's hatchlings are ordinary normals wearing both, which is a fact
  about how they were born — on the `normal` row it would have shielded every
  normal in the campaign. The `Enemy` constructor's fourth argument carries
  them, and a test asserts a scheduled normal is still unshielded and still
  pays.
- **`noBounty` is enforced in `Enemy.takeDamage`'s return value**, the one door
  every damage source already comes through. So a hatchling pays no cash, no
  lifesteal and no beam charges without any of those systems learning about it.

**The Revenant roots where it falls, and that cannot soft-lock a run** — it
revives exactly where something shot it, so a tower already covers that spot.
Written down in full under Content, because the instinct to "fix" it with a
decay timer would delete the mechanic to protect against a case the player
already controls.

**Lane offsets stopped looking like a waveform.** They came from a
low-discrepancy sequence (multiples of the golden ratio), which is *designed*
never to cluster — so a wave of enemies wove down the road in a visible sine
pattern. The owner: "they just look like a wave, not random at all, which is
very unnatural." It is a 32-bit integer hash of the spawn index now: still a
pure function of the index, still bit-identical on every engine, still
reproducible run to run — it simply flips sides on a coin (49% vs 76%) and lets
479 consecutive pairs land on top of each other instead of zero. Mean amplitude
is unchanged, so the balance figures stay comparable. `LANE_SPREAD_UL` went 4 →
7 with it, which does mean full-size sprites now overhang the road; that is
accepted, and the note in `enemy.js` says why the fix would be a wider road.

**The schedule: 33 waves and 4308 HP → 35 waves and 13 498 effective**, the
owner's figure, reached in two passes on the same day (7776, then the turn-up
to 13 500 with three or four types in almost every wave from 12 on). Waves 1–10
are byte-identical and pinned; the v0.4.4 twenty-wave spine still OPENS its
waves in its original order, with a test that also asserts none of them was
made weaker.

**Finishing a wave now pays a tenth of it**, ~$1350 across the run, derived
from `waveEffectiveHealth` rather than typed in per wave. Its own section
above.

**THE WAVE 35 BOSS was built**, to a full spec the owner gave a few hours after
asking for the slot to be left empty — and then **reworked the same day**,
because the first version was wrong in a way worth recording.

*First version:* 2500 HP, silencing three towers every 3.5 s and doing no
damage. The owner: *"right now the boss shoots an aoe wave way too often that
does no damages."* Correct — it read as a busy pulse that never hurt anything.

*Second version, the one that shipped:* it fights in **telegraphed beats**.
Every attack stops it dead for a second or so first, and the pool GROWS.

- **Aimed shot** (from the start, every 8 s): stops, picks the tower with the
  **highest DPS on the board** — not the nearest — and hits it for **45 and a
  2 s stun**. Two of those kill a gunner. Answered by depth, not by a bodyguard.
- **Leap** (unlocked by the roar, then it alternates): stops, **jumps 50 u.l.**,
  and lands with a shockwave that damages and stuns **every** tower within
  90 u.l. of where it landed.

It now attacks four times in 45 s instead of about twelve, and even at its
post-roar rate it is slower than the version it replaced. The roar still does
its four things (shield, speed, rhythm, twenty-one runners at 1.5×) and now also
unlocks the leap.

Machinery: `attacks` as a one-or-many pool beside the existing `attack`
(reconciled by `Enemy.attacksOf`, the same shape `groups` has with waves),
`windUpSeconds` enforced in `currentSpeedUlps`, `target: "highestDps"` reading
the universal `attackDamage × attacksPerSecond` contract, a `leap` block, and
stun support in `TowerHealth`. Its own section above, including the two traps
that section exists to keep closed.

**The clear bonus moved from "deployed" to "defeated."** The owner: *"the clear
bonus should come after defeating the wave, so basically at the start of the
countdown to the next wave if the wave was skipped."* It is now OWED on
deployment and PAID by whichever comes first of the board clearing, a skip, or
the next wave arriving — one latch, three doors, a test each. Its own section
above.

**Stop tuning by simulation.** The owner asked for the difficulty work to stop
being driven by campaign runs. The schedule numbers here are AUTHORED to a
stated total; `tools/simulate-campaign.js` remains for checking that a change
did not break something, not for retuning. The measured tables further up are
kept as history and marked stale.

**The one thing that had to be measured and reverted.** The first draft moved
the Brute introduction from wave 19 to 13. A gunner does literally nothing to a
Brute, so that wave is unanswerable until the player owns something that hits
for more than 5 — at 13 it killed a competent 30-tower board on `null-meridian`
outright. Brutes are back at 20 and the three new types are fitted around the
proven introduction order rather than through it.

**Measured in the browser against the real loop, all four routes.** No towers:
loss at wave 4. Gunners only: loss at 18–21 (13–18 on `null-meridian`). Twenty
gunners then Longshots, buying path A as affordable: WIN on rune-circuit (43
base HP left), mana-coil (94) and sigil-lattice (23), loss on `null-meridian`.
The same policy on the v0.4.6 schedule at v0.4.6 pacing finishes on 43 / 94 /
21 and *also* loses on `null-meridian` — so 80% more effective HP and two more
waves left the survival margin almost exactly where it was. That is the economy
doing its job (income is $1 per point of damage, so a heavier schedule funds
the towers that answer it), and it is the right outcome for the easy tier: the
turn-up buys more to DO, not a thinner margin. Re-measured after the Hive
correction and the lane-offset rewrite: unchanged, 43 / 94 / 23.

**The boss bar** is a `showHealthBanner` flag on the type, not a check for the
midboss, and bars stack rather than overlap. Wave 35's boss will cost one line
in `Enemy.TYPES` when the owner has designed it. A test asserts exactly one
type carries the flag today, so the day a second one does, somebody meant it.


**2026-07-29 (v0.4.6) — Auto-send waves, and a way out of a finished run.**

Asked for: "add an auto skip wave button that when turned on, doesnt require
user input to start sending the next wave"; and "when winning/losing a game,
add a button to return to the main menu instead of just having the restart or
choose new map button".

**Auto-send is routed through `skipNextWave()`** rather than given its own way
of poking the countdown, so the automatic path and the button are one path — it
inherits the "only ever ends a break" guard, and cannot compress the interval
*within* a wave. Its toggle went in the bottom-right beside the speed control
rather than beside the skip, for a reason worth remembering: with auto-send on
a break lasts one frame, so a toggle drawn only during breaks could be switched
on and never switched off. Anything that turns a thing on has to stay reachable
to turn it back off.

**That move surfaced a real bug that was already shipped.** A permanently live
button over the map is a permanently dead patch of map, and nothing told the
build preview about it — so the preview drew a green "build here" circle under
the cursor and the click pressed the button instead. True of the speed toggle
from the day it was added. `overInterfaceChrome()` is now the one list of
click-swallowing rectangles, and `drawBuildPreview` asks it. **Add any new
play-screen button to that function.** It is kept out of `whyCannotBuild`
deliberately: that answers a question about the world in u.l., not about
pixels.

**The run-over overlay had no exit.** It offered "restart" and "choose another
route", both of which start another run — so the armoury, where the coins that
same overlay had just awarded are spent, was unreachable without reloading the
page. Main menu goes on its own row below the other two, because those two are
"play again" and this one is not, and Escape now leaves a *finished* run (it
still only ever cancels in a live one).

**2026-07-29 (v0.4.6) — Pacing controls, AoE that hits what it lands on, DPS on
the preview cards, and the test suite green again.**

Asked for, in the owner's words: "aoe units do not hit camos, even if in their
range whilst the tower is attacking another unit"; "add 2x, and 3x game speed
(applies to everything), must be changeable by the user mid game, little button
in one of the corners"; "delay between waves is too short (5 seconds), must
allow user to skip wave, or wait 90 seconds"; "when previewing upgrades, also
show dps change (Ex 3 --> 5 dps)".

**The AoE bug was one line in the wrong place.** `Smasher.prototype.covers`
checked `Targeting.sees` — so a swing already landing on a visible enemy passed
straight through a camo standing in the middle of the wedge. That contradicted
the rule the rest of the game already followed and this document already stated:
camo blocks TARGETING, not incidental damage, which is why a `PierceBullet`, the
B4 blast and the Longshot's B5 all hit whatever they physically reach. The check
moved to where the *choice* is made: `facingTarget` still refuses to aim at an
undetected camo, and `update()` will not spend a swing unless something visible
is in the zone (`sightedIn`). **The camo waves are unaffected**, and not by luck
— a wave names exactly one type, so waves 13/16/26 put nothing visible on the
board for a detectionless smasher to swing at. There is a test asserting exactly
that, next to the one asserting the bug is fixed.

**Game speed is applied in exactly one place**: how much time `frame()` hands
the fixed-step accumulator. At 3× the loop runs three times as many 1/60 s
steps, so "applies to everything" is true by construction rather than by audit
— every system that reads `dt` advances with it because none of them can tell
the difference. The step itself is never scaled: a 3× `dt` would change
collision and cooldown outcomes, and speed has to stay a pacing control rather
than a difficulty setting. Two tests pin both halves.

**The break went 5 s → 90 s, with a skip.** Five seconds is a countdown you
watch, not a decision you make — too short to walk the board, read a panel or
compare two upgrades on their hover cards, which is where this game is actually
played. Lengthening it costs nothing because income is per point of damage and
never per second, so idle time earns exactly nothing and the break cannot be
farmed. 90 is a ceiling rather than a wait: `skipNextWave()` ends it whenever
the player is ready.

**The DPS row answers the question the other two rows do not.** "+6 dmg" on a
slow tower and "+0.4 atk/s" on a fast one can be the same purchase, and the only
way to see that was to multiply in your head, twice, before deciding. It is
derived by the same definition `TowerStats.dps` uses for the panel, so the card
and the panel underneath it can never disagree.

**The test suite had 118 failures before any of this, and now has none.** One
line caused 110 of them: `MetaProgress.constructorOf` resolved tower
constructors off `window`, and the Node harness hands the vm a stub `window`
that is not the context's global — so every build slot came back empty and most
of the suite quietly degraded to "the tower was not in the bar". The browser was
always fine, which is precisely the divergence the harness exists to catch. The
rest were stale rather than broken: fixtures that no longer fit the swing after
`UNIT_LENGTH` was retuned, a stat row added without updating its expectation,
and a beam cost table that disagreed with the config (and with this document).
See "How to run and test" — the counts there are now measured, not remembered.

**2026-07-29 (v0.4.6) — Towers can die, an enemy that kills them, and a meta
economy between runs.**

Asked for, in the owner's words: range visible only when clicking a tower; "an
angry enemy that periodically attacks tower near him for 20 damage or sum";
"when a tower hit 0 hp it dies"; the Longshot's "B5 ability should kill him
after 5 or so use but right now he reach 0/0 HP and doesn't die"; the Siphon's
"B5 price should be next or under the requirement of 5000 healing done"; a
store tab and an inventory tab on the main menu; and meta coins kept between
runs, awarded on how far the run got.

**Three of those were one bug.** Tower HP existed on exactly two of the four
towers and nothing watched it, so B5 burning its last 300 max HP left a tower
at 0/0 that kept firing. `js/systems/tower-health.js` gives all four types one
contract and makes `maxHp <= 0` part of the death test — which is the 0/0 case
by name. B5 now kills the Longshot on the **fifth** use, exactly as its config
always intended, and the main loop sweeps the corpse off the board. Measured,
not assumed: 1450 max HP, 300 a press.

**The Angry enemy is DATA, not a special case.** It carries an `attack` block
and `Enemy.attackTowers` asks "does this enemy have an attack". `enemy.js`'s
founding rule — nothing branches on which type an enemy is — survives intact,
and a test pins that exactly one type has that block so a second cannot appear
by accident.

**The Siphon's B5 was 60 000 against a 5000-healing gate**, twelve times the
gate and fifteen times a whole run's purse: the tier unlocked with a green
light and then stayed unbuyable forever, which is worse than being locked. It
is now 5000 — the price IS the gate — and the two are documented as a pair.

**Meta progression took "save/load" off the out-of-scope list**, narrowly:
three fields, no run state. The interesting decision was what a fresh profile
owns. Gunner and Smasher, with the Longshot at 40 coins — because a first run
loses (no camo detection) somewhere around wave 17–30 and pays 30–56, so the
run that teaches you what you are missing also pays for it. That a fresh
profile cannot win is the loop, not a bug.

**One hole this opened, and closed.** With the player editing the build bar,
"STARTING_CASH must exceed the cheapest tower" stopped being guaranteed by
`BUILD_SLOTS` being a constant — you could unequip the gunner and be left with
the $800 Siphon and a $20 stake, which is the original no-tower/no-cash
deadlock with an extra step. `MetaProgress.unequip` now refuses it, and
`sanitise()` repairs a hand-edited save that contains one.

**Measured in the browser again** (no Node on the machine, same as v0.4.5):
the schedule went to 33 waves / 4308 HP with two Angry waves, and the balance
table in Balance math was re-run on all four routes. Spam still loses,
diversifying still wins, and the winning runs now lose 3–18 towers on the way.
The five Node suites are still unrun — see "How to run and test".

**2026-07-28 (v0.4.5) — Six new enemy types, and enemies stop walking in
single file.**

Asked for, in the owner's words: a type that "comes in big swarms of low hp
enemies"; for all enemies to be "a bit dispatch left and right on the track"
rather than on one line; a type with "normal health and like 20% armor"; "a
slow big enemy that has lots of health and like 5 blindage"; "camo normals and
camo fasts"; and "an early midboss with like 250hp and 10% armor".

**Percent vs flat was the one piece of translation.** The ask says "20% armor"
and "5 blindage" — two different things, and this codebase already had both:
`defense` is the percentage, `armor` is the flat subtraction. So `armored`
carries `defense: 20`, `brute` carries `armor: 5`, and the midboss carries
`defense: 10`. That mapping matters because flat armor has **no damage floor**
(a deliberate, documented decision in `js/systems/mitigation.js`), which makes
the brute a hard counter to the gunner and the beam rather than merely a
tougher target. Left as-is: it is the armor system doing the job it was
written for, and the schedule is built around it.

**Camo needed enforcing on two towers that had never met one.** `RangeFilter`
has checked `isCamo` against `stats.seesCamo` since v0.3.5, but only the
config-driven towers (Longshot, beam) go through it — the gunner and the
smasher pick targets through `js/targeting.js`, which knew nothing about camo
because no enemy was camouflaged. Both now carry `seesCamo = false` and the
rule lives in one new function, `Targeting.sees`, called from `pick()` and
from `Smasher.covers`. Deliberately *not* added to the smasher's B4 blast or
to `PierceBullet`: those are collateral from a hit that already landed, not a
choice of target.

**Lane offsets are a world position, not a drawing trick.** Each enemy carries
a signed offset and `Enemy.positionAt` pushes it perpendicular to the road
(new: `GamePath.tangentAt`). Two constraints shaped it. It is in **u.l., not
pixels**, because towers measure range to the offset position and a
pixel-fixed offset would break the "changing UNIT_LENGTH" test. And it is
**deterministic** — the golden-ratio sequence in `Enemy.laneOffsetFor`, reset
by `restartGame()` — because `Math.random()` in the simulation would turn
every pinned balance figure in the suite into a coin toss.

**`sizeScale` per type reversed an explicit prohibition in `enemy.js`.** That
comment forbade per-type radii because the frost ring (15 px) and hover ring
(20 px) were hand-tuned constants that only cleared each other at one body
size. The fix was to derive both from `radiusPx()` (+4 and +9), which holds
the 5 px clearance at *any* size and reproduces 15 and 20 exactly at the
original radius of 11. The three original types stay at scale 1, so nothing
about them moved.

**The schedule went from 20 waves / 3094 HP to 31 / 3984**, weaving the new
types in and giving three of them a wave that is a *check* rather than filler
(midboss at 9, camo at 11/15/24, brutes at 16/25). The index's Enemies tab was
re-laid out as a three-across grid — nine full-width cards did not fit a 720 px
screen — and the sandbox got an enemy-type dropdown, built from `Enemy.TYPES`,
so the new types can actually be looked at.

**The schedule was rebuilt twice, from measurements.** The first attempt
reordered the campaign freely; driven through the real loop in a browser it
lost on every route, because the first swarm landed at wave 5 with three
towers on the board and because $375 of camo detection could not be afforded
alongside enough gunners. The shipped version instead *interleaves* the new
waves into the v0.4.4 twenty, keeps the early camo waves small enough to leak,
and leans on the plain $75 Longshot as the brute answer. Measured result: spam
loses on all four routes, diversifying wins on all four. The table is in
Balance math.

**NOT VERIFIED BY THE NODE SUITES.** The machine this was written on has no
Node, so none of the five suites could be run — everything above was measured
in the browser instead. The pinned *opening* figures in `tests/run.js` are at
genuine risk of being one or two off from the lane offsets; see the end of
Balance math for which and why. `tools/simulate-campaign.js` is stale.

**2026-07-28 (v0.4.4) — The index: a field guide to towers, upgrades and
enemies, from the title menu.**

Asked for: an index on the start menu with two tabs, Towers and Enemies,
listing everything, with clickable upgrades that preview what they do.

**The design rule: derived, never written.** `js/codex.js` contains no stat,
price, description or wave list of its own. The Towers tab constructs a real
instance of each build-bar tower and reads `statLines()` (minus the lifetime
totals — a specimen has no history, and the rows are sliced off by count via
`TowerStats.totals`, not matched by label). The upgrade tree is built by
WALKING each path on a throwaway instance: each tier's price, effects line
and preview card are recorded from the same `panelActions()` the in-game
panel draws, with the instance standing at the tier below — so clicking A3
in the index shows the identical measured before → after card the in-game
hover shows when A3 is the next purchase, drawn by the same renderer
(`drawCardBox`, split out of `drawHoverCard`). The Enemies tab reads
`Enemy.TYPES`, draws each type's REAL sprite via its own `draw()`, and
derives wave appearances and the late-campaign health ceiling from `WAVES`.
Tests pin that the three appearance lists tile the schedule exactly.

**Previewing is not buying.** The walker advances instances through
`purchase()` / `applyUpgrade()`, deliberately BELOW `buyUpgrade` — that
function is the economy (the Smasher's `performAction` spends the real
global cash, which is exactly why the codex must not go through it). It
stops at any action carrying a `reason`, so the Siphon's healing-gated B5 is
shown with its refusal and never applied; one-per-game global state stays
untouched, and a test pins that opening the index changes nothing — cash,
towers, death denial.

**Building it found a real bug in the Siphon's panel actions.** A tier
refused by the unlock gate set its `refusal` into the tooltip and its
`detail`, but the action's `reason` field only ever reported crosspath — so
B5's action claimed nothing was wrong while its own button said "needs 5000
HP healed". The walker trusted `reason` and marched into the gate
(harmlessly — `BeamTower.purchase` re-checks it — but the model lied).
`reason` now carries whichever rule refuses the tier.

The menu gained the Index button between PLAY and Sandbox, renumbering the
hotkeys top-to-bottom: Enter/1 play, 2/I index, 3/S sandbox. The `← Menu`
back button was extracted into `drawBackButton()`, shared with the chooser.

Suite: 62 + 115 + 68 + 45 + both smoke tests, all passing, plus a browser
pass over both tabs, the A3 preview card and the gated B5.

**2026-07-28 (v0.4.3) — The exit became an Escape menu.**

Reported, revising the same day's v0.4.2: put the way out behind Escape as a
pause menu rather than a button sitting in normal gameplay.

**Right call, and the reason is worth keeping.** The `Menu` button cost HUD
space every second of a run to be used once at the end of it, and it lived
one stray click from ending a twenty-wave game — which is why v0.4.2 had to
bolt a confirmation onto it. Escape needs no confirmation step, because
opening the menu and choosing to leave are already two deliberate acts. The
button, its rectangle, its hover state and the whole "leave this run?" dialog
are gone; a test now asserts `exitButtonRect` does not exist, so it cannot
quietly come back.

**Escape had a job already, so it cancels first and pauses second.** A slot
armed, a tower inspected or a tower aiming all still clear on Escape; only
with nothing to cancel does the menu open. The other order would hand a
player trying to drop a half-placed tower a menu instead.

`overChrome()` went with the button — with nothing but the build bar left in
that row it was an indirection around `slotAt`, so both call sites went back
to calling it directly.

The pause menu shows the run's state (route, wave, towers, kills, base) and
offers Resume and Back to main menu. It freezes the simulation, for the same
reason the confirmation did: a menu that let enemies keep walking would charge
the player for opening it. In the sandbox, Escape opens the same menu and
"Back to main menu" leaves for `index.html` through the unchanged `leaveRun`
seam.

Suite: 62 + 110 + 68 + 45 + both smoke tests, all passing. The four pause
tests replace the four exit-button ones.

**2026-07-28 (v0.4.2) — A way back out of a run.**

Reported: an exit button was wanted during a game and in the sandbox, to get
back to the menu. Both existed as one-way doors before this — once a run
started, the only exits were losing, winning, or reloading the page.

**A `Menu` button in the build bar's row**, right of the slots. Placed there
rather than over the map for two reasons that are already rules here: the
inspection panel is clamped above `BAR_Y` so it can never cover it, and the
map is where the player clicks to build so a button there would compete with
placement. The 24 px gap from the last slot is what stops a fumbled build
click reaching it.

**It confirms, and freezes the board while it does.** Abandoning a twenty-wave
run to one stray click is not a thing that should be possible, and if the
simulation kept running behind the question then asking it would cost the
player a leak. Escape cancels — the safe answer, the way round every other
Escape in this game works — and Enter commits. `M` opens it, matching the key
the loss and victory overlays already use.

**`leaveRun()` is a seam rather than a call to `openMenu()`**, because the
sandbox is a separate page: it overrides the global to navigate to
`index.html`, the same wrapping discipline the rest of `js/sandbox/sandbox.js`
follows. The sandbox sidebar gained a direct `← Back to main menu` button too,
without a confirmation, since a sandbox board has nothing to lose.

`overChrome()` was extracted while doing this: the build preview and the enemy
hover both suppressed themselves over the build bar with their own copy of the
same check, and the new button needed adding to both.

Also fixed a cosmetic leftover it made obvious: the sandbox announced
"Wave 1 / 20" on load while its own status line said every wave was deployed,
because `startRun()` runs before the sandbox's hooks are installed and the
banner survived the cleanup.

Suite: 62 + 110 + 68 + 45 + both smoke tests. The sandbox smoke test earned
itself again — it failed the moment the sidebar gained a button its stub DOM
did not have, which is exactly the wiring mistake it exists to catch.

**2026-07-28 (v0.4.1) — All four towers are in the actual game, and there is a
title menu.**

Reported: "the siphon and longshot towers from sandbox are not accessible into
the index.html", plus a request for a start menu leading to either the routes
or the sandbox.

**Two of the four towers were sandbox-only.** Both were finished, priced,
upgrade-treed and covered by 113 tests between them — and invisible to anyone
who opened `index.html`. The fix is a build-bar entry plus `index.html`
loading the same tower/systems block `sandbox.html` already did. **No tower
code changed.** `js/systems/pierce.js` in particular stopped being optional:
the comment in `js/bullet.js` said index.html "has no piercing tower and never
constructs one", which is no longer true.

**The two script lists must now stay identical.** The sandbox's whole promise
is that what you learn there is true in the shipping game, and that stops
being so the moment the pages load different code.

**The economy had to move, or the Siphon would have shipped unbuyable.**
Income is $1 per damage, so total scheduled HP is the run's entire purse: at
the v0.4.0 schedule's 454 HP, an $800 tower could never be afforded, and a
permanently-greyed slot is not "accessible" in any sense worth having. The
schedule is now **twenty waves, 3094 HP**, with waves 11–20 using the `health`
override the merge left in place rather than new enemy types — the roster
stays the three the owner approved. `tools/simulate-campaign.js` gained a
"mixed" policy that saves for the expensive towers, and it now wins on all
four routes **with all four tower types on the board**, which is the check
that the towers are genuinely reachable rather than merely listed.

Writing that policy surfaced the trap a player will also hit: **spending every
$15 on another gunner means the balance never climbs to $800.** Reaching the
dearest tower requires deliberately saving. That is a real design question
(the run is winnable with gunners alone), left as the owner's call rather than
"fixed" by discounting a tower whose whole upgrade tree is priced off its base.

**A second, larger open question, unchanged and now more visible:** the
Longshot's and Siphon's UPGRADE trees are priced for an economy tens of
thousands of gold deep (full beam path A is $33,800). A 3094 HP run pays
~$3,100, so early upgrades are reachable and late ones are not. The prices are
internally consistent and correctly ordered; their absolute scale still
assumes an economy that does not exist. Do not rescale them unasked.

**The menu** (`screen === "menu"`, `drawMenu`) — PLAY, or into the sandbox;
Escape and a `← Menu` button come back from the chooser. `drawMenuBackdrop`
paints a full sci-fi command deck with panelled bays, a ley reactor, comms
console, hologram, cables and hazard markings; `drawMenuButton` owns the four
numbered terminal controls. This is menu-only presentation and does not reuse
map collision/content. Its strap line counts waves, routes and towers rather
than stating them, because it said "Ten waves" for exactly as long as it took
to add ten more.

**It also caught a real bug in the shipping game.** `update()` skipped
simulation on a *list* of screens (`screen === "select"`), so adding the menu
left waves spawning and enemies walking behind the title screen. It now tests
`screen !== "play"`, which makes any future screen inert by default. Pinned.

Test movement: `run.js` 56 → 58 (the roster is pinned by name and by contract;
all four types are placed, inspected and fought through the real click path;
the purse-vs-price check), `content.test.js` 107 → 110 (the menu's buttons,
hotkeys and Back). `tests/harness.js` presses PLAY before choosing a route, so
`boot(null)` still means "stop on the chooser" and no existing test changed
meaning. Suites: 58 + 110 + 68 + 45 + both smoke tests, all passing, plus a
browser pass over the menu, the four-tower bar, the Siphon's panel and its
beam draining an enemy.

**2026-07-28 (v0.4.0) — The game became a game: ten waves, a victory state,
and an effects layer.**

Asked for, in full: "make the game 1000x better", with no further direction.
Everything here is the most conservative reading of that — completing what
already exists rather than inventing a direction, which "The big open
question" still forbids. No new enemy types, no new towers, no new menus.

**The problem, in one line: the shipped game could not be won or lost.** The
two-wave schedule contained 52 HP against a 100 HP base, so the loss overlay
was unreachable outside tests; there was no victory state at all, so clearing
wave 2 just left the board sitting there; and a run's whole income was $52,
so the $200 smasher in the build bar was a decoration. Every mechanic worked
and nothing was at stake.

**Ten waves over the existing roster** (`WAVES` in game.js, 454 total HP).
The scheduler already had everything needed except the type pass-through —
`Enemy` took a `typeId` nobody sent it; `spawnEnemy` now forwards the wave's
`type`. Waves 1–2 are the original opening, byte-identical, deep-equal
pinned: the starting-stake decision is tuned against them. The schedule was
tuned by simulation, not by feel — new `tools/simulate-campaign.js` plays it
through the real loop under scripted policies, and the design targets it
verifies are: an undefended base always falls (waves 6–9, so losing is now
real), greedy honest gunner-building wins on every route, four gunners
scrape through only on the easy routes, and a winning run banks enough that
the smasher is a genuine mid-run purchase for the first time.

**Victory** (`victory`, `allWavesDeployed`, `drawVictory` via the shared
`drawRunOverlay`). The one design constraint that mattered: tests and the
sandbox disable spawning with `waveIndex = WAVES.length`, so "deployed
everything" must not be derived from `waveIndex`. `allWavesDeployed` is set
in exactly one place — the scheduler naturally exhausting itself — and the
manual idiom is pinned as a non-victory. Loss is checked before victory so a
final enemy that empties the board while zeroing the base reads as defeat.
Both overlays now also report the run: wave reached (`reachedWave`, which
credits a break-time loss to the wave that caused it) and `runKills`, counted
in the same end-of-life sweep that charges leaks.

**Effects** (`js/effects.js`; its own section above): death bursts, bounty
popups, base-hit pulse, wave banners, and a derived-not-stored muzzle flash
on the gunner. Strictly one-way — the simulation tells, never asks — which is
what let every suite keep its pinned outcomes with effects running.

**Test movement.** `run.js` 55 → 56: the waves group re-pins the full
schedule and the typed spawn, the victory test is new, and the opening
balance snapshots (`additional gunners…`, content's `defend()`) now slice
`WAVES` to the original two waves — measuring the opening is their point, and
against the full campaign two gunners are simply dead everywhere, which
discriminates nothing. Balance-math figures in this file were also corrected:
they still described the pre-v0.3.5 3 HP normals (47 HP total, base ending
71/88/96) when the tests had pinned 4 HP normals (52 HP, 66/83) for a day.

Suites after: 56 + 107 + 68 + 45 + both smoke tests, all passing, plus a
browser pass over the chooser, the banner, kills, leaks and both overlays.

**2026-07-28 (later) — One vocabulary across all four towers, and a hover card
that explains an upgrade in full.**

Reported: inconsistencies between towers, "hit speed and firerate" being the
example. It was worse than the example. The same quantity had four names and
two units — gunner `Cooldown 1.00 s`, smasher `Hit speed 4.00 s`, Longshot
`Fire rate 0.50/s`, beam folded into `AD 1 x 10/s` — so no two towers could be
compared and no reader could tell which way round "hit speed" ran (it was
seconds per swing; "fire rate" was swings per second).

**`js/systems/tower-stats.js` is the fix, and it is a contract, not a rename.**
Every tower answers `attackDamage()` and `attacksPerSecond()`; every shared row
is built from those two, so the damage, the rate and the DPS on screen always
multiply out. Towers still store their rate however their own model wants — the
smasher keeps seconds between swings, its upgrade table is written that way —
and that one function is the conversion point, the same arrangement `ul()` has
for distances. See the "One vocabulary" section for the full rule.

What that shook out, all of it real rather than cosmetic:

- **The smasher printed metres.** `Range 31.25 m`, `On kill 3 in 18.75 m`, in a
  game that has been in u.l. since 2026-07-26. Those were the last two.
- **The Longshot refunded nothing for its upgrades.** `sellValue` reads
  `totalSpent`; the smasher grew `cost` instead, the beam grew `totalSpent`,
  and the Longshot grew neither — so a fully upgraded Longshot sold for $38.
  Every tower now carries both, meaning the same thing.
- **The beam counted no kills**, because it called `takeDamage` directly to
  pass its defense pierce. `TowerScore.apply` takes that argument now and the
  beam goes through it like everything else. The Longshot had no kill counter
  at all; it does now, incremented where it already detected its own kills.
- **The Longshot and the beam ignored the targeting mode.** Both sorted by path
  progress inline, so they were stuck on "first" while the gunner and smasher
  had six modes and a button. Both now sort through
  `Targeting.comparator(tower)` — the same scoring and tie-break `pick()` uses
  — and get the cycle button for free.
- **The sandbox sidebar threw on a Smasher**, reading `t.core.purchased` on a
  tower that has upgrades but no config runtime.
- The dead `Tower.prototype._oldFindTarget` is gone.

**The `Target` stat row was removed from every tower.** The cycle button
directly beneath it already reads `Target: first`. That is the same duplication
the map labels were deleted for, and removing it bought back the row of height
the next part needed.

**The hover card.** Three lines on a button is enough to choose between two
upgrades and not enough to understand either: `+5 pierce, pierce falloff` never
says what pierce falloff IS, what the range would BECOME, or that tier 3 shuts
the other path for the rest of the run. Hovering any button in the panel — an
upgrade, an ability, a passive readout, the targeting cycle — now opens a card
beside it with every stat the tier moves before and after, a sentence per
ability, and the crosspath warning.

Its numbers are **measured, not read off the table**: `previewNextTier`
resolves the config twice and diffs, so a printed "+100 range" is the gain on
*this* tower with everything it already owns, and a flag that overrides a stat
outright (cone shape, infinite pierce → `∞`) shows up even though the table has
no number for it. Its prose is **per mechanic, not per tier**: one sentence per
flag name, with every number in it interpolated from that mechanic's resolved
parameters — so B4 raising B3's execute cap makes the same ability read 60%
instead of 40% with nothing to edit.

Writing it found a third bug: **a tier can grant a flag three ways** —
`grants`, `mechanics`, or a `flags` object — and the descriptions read only two
of them. The beam's B1 grants camo detection through `flags`, so its button
said "+150 HP" and nothing else. `UpgradeEffects.grantsOf` is now the one place
that union is taken, matching what `StatResolver` already did.

Polish that came with it: `fireRate` deltas read `+0.25 atk/s` rather than a
nameless `+0.25 /s`; the smasher's rate change reads in the same unit
(`+0.08 atk/s`) instead of `-1.0 s`, a different quantity in the opposite
direction; `ad` deltas read `dmg`, because the row above the button says
Damage on every tower; the smasher's range delta names itself
(`+6.25 u.l. range`); and the re-aim, ability and passive buttons gained the
third line the upgrade buttons already had.

**Headroom, recorded because it is now tight:** the tallest panel — a 5-2
Siphon — uses 608 of the 614 px between the canvas top and the build bar. A row
added to every tower's stat block will overflow. `tests/sandbox.smoke.js` walks
six builds of all three upgradeable towers and fails if any panel stops
fitting.

**Verification note.** This machine has no Node, so the suite could not be run
here. Instead the real game and the real sandbox were booted in a browser and
driven through their own entry points: all four towers placed and fought
through `update()`, all 74 upgrade/ability/passive buttons across every tier of
every upgradeable tower checked for a three-line label and a card, every card
laid out and measured against its box (645 drawn lines, none overflowing), and
every panel height checked against the build bar. **Run the five suites before
trusting the counts above** — they were counted from the files, not from a run.

**2026-07-28 — Upgrade buttons say what an upgrade DOES, before you buy it.**

Reported: "upgrade descriptions do not show prior to purchase." True on every
upgradeable tower — the button named the tier and quoted the price and stopped
there, so the only way to find out what $850 bought was to spend it.

**The description is derived, never written.** `js/systems/upgrade-effects.js`
turns a tier's own `deltas`/`statDeltas` and its `grants`/`mechanics` into a
sentence: "+15 dmg, +100 u.l. range, +5 pierce, pierce falloff". A prose
description sitting beside those numbers would be a second source of truth,
and it would go stale the first time someone retuned a number and forgot the
sentence. The Smasher reaches the same place by a different route — it DIFFS a
stat snapshot either side of a hypothetical purchase, because its upgrades set
absolute values rather than offsets, so only the tower can say what changes.

Writing the formatter immediately caught a real bug: `critChance` and
`critDamage` are stored as percentage POINTS, so scaling them "into a
percentage" printed **+2000% crit** for B3's 20-point bump. Pinned.

**The layout had to change to fit it.** A description is a sentence, and a
sentence does not fit a half-width button — at two columns it clipped to
"+5 dmg, +50 u.l. ra…", which is worse than showing nothing because it looks
like information. So when any action carries a description the buttons go
**full width, one per row**, the panel widens to 268, and the description
**wraps** over two lines via a new `wrapText` (which falls back to `fitText`'s
ellipsis on the last line rather than overflowing). Buttons without a
description keep the old two-column grid.

While in there, every upgrade button was given the same three-line shape —
**which tier / what it costs / what it does** — so the Smasher, Longshot and
beam no longer each phrase it differently. The Smasher's label moved from
"A1  $150" to "Path A → A1" with the price on line 2; its tests now assert
`label` and `detail` separately, which is what they were really about.

Suite: 258 + both smoke tests, all passing.

**2026-07-28 — v0.3.5: the two branches fused.**

Two people had been building on the same base in parallel. This merge takes
the union, not one side. **The u.l. foundation is the base** — the global
`UNIT_LENGTH` / `ul()` rule was an explicit instruction and everything else
sits on top of it, so where a conflict was about *scale* the u.l. side won and
the other side's numbers were converted (×12.5, the factor that turns the old
metre figures into the 100 u.l. gunner yardstick). Where a conflict was about
*content or design*, it was judged on its merits and the other side won plenty
of them. Decision by decision:

| Conflict | Kept | Why |
|---|---|---|
| Distance units | u.l. (`UNIT_LENGTH` + `ul()`) | Explicit instruction; one conversion point. Their maps/smasher were ported ×12.5 |
| Who fixes the scale | Adapted from theirs | Their "the reference map defines the scale" idea survives as `AUTHORED_AT_PX_PER_UL` + a *derived* `Maps.referenceLengthUl()`, rather than a second declared constant that could disagree with the first |
| The name `Targeting` | Theirs | Their `Targeting` (which enemy to shoot) is the one a reader expects. Mine became `RangeFilter` (is it within reach) — two different questions that were sharing a name |
| Enemy health | Theirs | A wave now says how many and how often, never how tough. `Enemy.TYPES` is the only place toughness is written down. Stock normals went 3 HP → 4 |
| Enemy roster, timed slows, hover | Theirs | I had none of it |
| Armor / defense / knockback | Mine | They had none of it; folded into their `Enemy` |
| Score tracking | Theirs | `TowerScore` is shared and counts kills as well as damage; my per-tower `damageDealt` was a strictly smaller thing |
| Upgrade panel | Mine, enriched by theirs | One generic `panelActions`/`performAction` UI rather than bespoke Smasher buttons — but the buttons now carry their richer payload (`branch`, `upgradeId`, `effects`, `reason`), exposed as the `L.upgrades` view. Their bespoke drawing went; none of their *rules* did |
| Targeting cycle button | Theirs | Ported as a first-class `L.targeting` row in `inspectionLayout`, so every tower with a `targeting` field gets it without opting in |
| `update()` return value | Theirs | Returns damage landed; the beam's charge bonus goes through `worldContext.addGold` instead of being smuggled out through the return |
| Maps, the chooser, the smasher | Theirs | I had one hardcoded road and one tower type |
| Loss screen | Theirs | Restart *and* "choose another route", plus the `M` key |
| Everything beam/Longshot | Mine | They had none of it |

**What broke in the merge and what it cost.** Their tests were written against
pixel coordinates on their road (`placeSmasher(600, 500)`, `spawnAt(960)`).
The u.l. rescale and the map refit moved that road, so ~20 of them were
testing nothing. They are now anchored on `SMASH_AT` / `IN_ZONE` / `IN_BLAST`
/ `BEYOND` — distances *along* the road, derived from the game's own clearance
rule and the smasher's own swing and blast radii. A future map edit cannot
silently invalidate them again.

The `js/systems/targeting.js` file could not be deleted (the sandbox refuses),
so it is a MOVED notice that defines nothing. Delete it by hand.

**Test suite: 250 tests, all passing** — `run.js` 54, `content.test.js` 100,
`long-range-dps.test.js` 54, `beam.test.js` 42, plus both smoke tests.

**2026-07-27 (latest 9) — Death denial rewinds time on screen; overlay draw order fixed.**

**The knockback is animated.** Instead of teleporting, the board FREEZES and
every enemy is dragged back along the route it walked over 1.4 s, easing in
and out like a tape being spun back -- with a violet wash, a trail from each
enemy to where it stood when time turned, and a clock hand running
anticlockwise. `DeathDenial` owns the whole thing (`isRewinding`,
`updateRewind`, `drawRewind`); `update()` in game.js advances only the rewind
while it runs, so nothing moves, fires or spawns. The freeze IS the effect --
"you did not kill anything, you took time back" reads as nothing at all if
the enemies simply jump.

One thing that had to move for it: enemies are un-leaked at the START of the
rewind rather than at the end. The game loop filters leaked enemies out at the
end of the same step, so the one that just reached the base -- the one most
worth rescuing -- would have been gone before the animation could touch it.

**Debug shapes were being drawn over the interface.** New `worldOverlays` hook
in game.js: functions pushed there draw after the map and before any UI, and
the sandbox registers its u.l. overlay through it instead of painting after
the whole frame. A range circle wider than the screen no longer scribbles
across the panel.

**Three copies of the same numbers were stacked around each tower** -- the
inspection panel drew "range"/"footprint" labels on the map, the sandbox
overlay drew its own, and the panel printed both as rows. The map labels are
gone from `drawInspection` entirely, and the sandbox overlay now labels only
RANGE (the one figure you cannot eyeball). Shapes still show all three.

Two tests pin the ordering: that a registered overlay draws between the map
and the panel, and that `drawInspection` emits no map labels at all.

**2026-07-27 (latest 8) — B5's healing gate halved to 5 000 and POOLED across towers.**

Per tower the gate was close to unbuyable, and for a structural reason: only
one B5 may exist in a game, so a single tower had to reach the whole total on
its own while every other lifesteal tower's healing counted for nothing.

`js/systems/healing-ledger.js` is a shared per-run total that every tower's
lifesteal writes into, and the unlock condition reads. Threshold is now 5 000
(25 000 damage at B4's 20% ratio, spread across however many B towers are
defending). Cleared by `restartGame`, same as the death-denial slot.

Towers still keep their own `hpHealed` for the panel, which now shows both:
its own contribution and the pool the gate actually reads.

**2026-07-27 (latest 7) — Beam gold runaway capped, DPS stat fixed, B5 gated on healing.**

**The gold was not a bug, it was a feedback loop.** `perCharge` and
`capTotal` grow with the player's gold, and gold income is damage x
multiplier, so gold feeds itself. Simulated at a realistic 370 dps with one
charge from 100k: gold passes 1.3M in eight minutes and the bonus climbs past
20 per point of damage -- which is how 5000 damage produced 106k bonus gold.
The spec's formulas are unbounded; it damped them with
`baseGoldPerDamage = 1/200`, and that number had to become 1 for the tower to
earn at this game's rate, which removed the damping.

**The gold scaling now stops at 50 000** (`GoldPower.MAX_SCALING_GOLD`), five
tiers, so `perCharge` tops out at 1.0 and `capTotal` at x10. That is exactly
the state the spec works through as its own example, and it bounds the bonus
at `cap - 1` per point of damage: 5000 damage can now produce at most 45 000
bonus gold, which is the figure the owner expected. Above the ceiling, income
is linear in damage instead of compounding. **The AD bonus is deliberately
left uncapped** -- it is already logarithmic and cannot run away.

**"DPS max" was reading a stat nothing uses.** It was resolved-AD x rate x
targets, ignoring the gold bonus, the ramp and the HP scaling -- so a fully
upgraded 5-2 showed a flat 200 however strong it had become.
`BeamTower.maxDps()` now multiplies in the effective AD (gold bonus
included), the ramp cap and the HP-scale bonus.

**B5 is gated on HP HEALED, not on the base's current HP** (10 000 either
way). Current HP is a level anything can move -- leaks take it, the sandbox
sets it -- so the upgrade blinked in and out of reach and a big base unlocked
it without the B path having been played. Healing done only ever goes up. The
tower now counts it (`hpHealed`, shown in the panel as "HP healed"), and
`DeathDenial` was narrowed to the one thing that is genuinely global: whether
the single slot is free.

At B4's 20% ratio the gate means 50 000 damage dealt through lifesteal.

**2026-07-27 (latest 6) — Charge decay is continuous; A5's passive is visible; two bugs found doing it.**

**Charge decay is now continuous at one charge per 3 s** (was a whole charge
dropped every 4 s). `ChargeMeter` treats the meter as one number -- whole
charges plus the fraction of the next -- and drains that, so the bar above the
tower visibly empties instead of sitting still and then jumping. It eats the
part-filled charge first rather than discarding it the instant decay starts,
which previously read as a bug.

**The panel showed the wrong AD, which is why A5 looked broken.** The row read
the resolved stat while damage used `effectiveAD()` including the gold bonus,
so a working passive appeared to do nothing. It now shows the effective value
with the bonus called out (`13 x 10/s (+15)`), and A5 additionally gets a
**passive readout rectangle** in the panel -- live AD bonus, gold tier,
per-charge gain and cap. Readouts are a new kind of panel entry (`readonly`):
drawn in gold, never highlighted on hover, and they consume a click without
doing anything so nothing gets built underneath them.

**"Gold made" is now "Bonus gold"** -- the base income is what any tower would
earn for that damage, so only the part the charge multiplier added says
anything about whether path A is paying for itself.

Two real bugs surfaced while testing this:

- **Charges could never accumulate.** Damage lands on ticks (10/s) but
  `update` runs at 60/s, so five frames in six dealt nothing -- and "dealt
  nothing" was being treated as "out of combat". Decay outran income and the
  meter never left zero. Out of combat now means **holding no target**, which
  is what it should always have meant. (The old stepped decay hid this by
  resetting its idle timer on any damage frame.)
- **A beam kept locks on enemies removed from play.** `updateLocks` only
  checked dead/leaked/in-range, so an enemy taken off the board any other way
  stayed locked -- the tower drained a ghost and counted itself in combat
  forever. It now also requires the target to still be in the live enemy list.

**2026-07-27 (latest 5) — Beam income bug fixed, cash display, charge bar.**

**The bug: a beam tower was outside the economy.** Its gold was gated on the
A3 charge mechanic, so a beam WITHOUT A3 earned literally nothing while a
gunner beside it earned a gold per point of damage. And `baseGoldPerDamage`
was the spec's suggested 1/200 — 200x stingier than every other damage source
in this game — so even WITH A3 it read as ~8 gold for 1500 damage. Both
fixed: the beam now earns at `CASH_PER_DAMAGE`'s rate like everything else,
and A3's charge multiplier applies on top of that rather than being the only
source. 1459 damage at 2 charges is now 2918 gold, not 8.

`baseGoldPerDamage` is still the number to move if path A self-funds too
easily — it is a §10 tune-in-playtest parameter — but 1/200 was not a tuning
choice, it made the tower unable to participate in the economy at all.

**Cash is displayed to one decimal.** Lifesteal ratios, charge multipliers and
mitigation all produce fractions, so the HUD was showing
"$8.454662500000001". The stored value keeps full precision; only the readout
is rounded, and whole numbers print without a pointless ".0".

**A3's charges are now visible on the tower** — a bar above it filling toward
the next charge, with the count beside it. The bar shows a FRACTION rather
than raw damage because each threshold is 65% larger than the last, so a
damage number tells you nothing about how close the next charge is.

**2026-07-27 (latest 4) — Sandbox: gold and base HP are settable.**

Neither could be tested before. The beam tower's A5 reads the player's gold
live, and its B5 needs 10 000 base HP to unlock, so both had to be reachable
directly rather than by playing toward them.

The sandbox's infinite-cash top-up is now a toggle rather than unconditional,
because it fought the new control: a value you set was overwritten on the very
next frame. Setting gold by hand switches the top-up off automatically; the
checkbox turns it back on. Presets jump straight to the A5 tier boundaries
(0, 10k, 50k, 100k, 200k, 400k, 800k) and to the numbers around B5's gate
(1, 100, 1k, 10k, 20k). Setting base HP above zero also clears a lost run,
which otherwise leaves the board frozen behind a healthy base.

The sidebar readout shows both live, and deliberately does not write back into
the input boxes -- refreshing them eight times a second would fight anyone
typing into them.

**2026-07-27 (latest 3) — tower_beam, plus three global systems it needed.**

**Written against a Phaser + TypeScript spec, implemented in this project's
own idiom.** The spec's engine choice conflicts head-on with two hard
constraints — no toolchain, must run from `file://` — so Phaser and TS were
not introduced. Everything else in the spec is engine-agnostic, and its §8
architecture (config-driven, keyed mechanic modules, content separated from
logic) is what this codebase already does, so the substance went in unchanged.
**If the Phaser/TS target is real rather than habitual, this is the decision
to revisit, and it is a rewrite of the whole project rather than of this
tower.**

**Three global systems, because they affect everything, not just this tower:**

- **Armor and defense** (`js/systems/mitigation.js`). Two separate stats on
  every enemy: `armor` (flat, per hit) then `defense` (percent, capped 99),
  in that order. Applied inside `Enemy.takeDamage`, which is the single door
  every damage source in the game already goes through, so none of them can
  forget it. **There is deliberately NO damage floor** — an enemy with armor
  >= the incoming hit takes exactly zero, which is what makes armor the hard
  counter to a 1-damage 10-per-second weapon. A `Math.max(1, ...)` anywhere
  in that path deletes the mechanic; a test asserts the zero.
- **Base HP is a free counter.** No upper clamp, and the HUD drops the
  `/ max` denominator once it goes above its starting value. Without this the
  B path's lifesteal cannot reach the 10 000 the B5 requires, making that
  upgrade permanently unbuyable.
- **Continuous-beam weapons.** No projectile: damage lands on a tick at
  `attackRate` Hz, one visual beam per locked target, thickness following
  that target's ramp. Towers may now RETURN gold from `update()` (a beam has
  no bullet to be paid through) and receive a small world context — live
  gold, and a way to heal the base.

**The tower.** Two paths, ten tiers, all numbers in `js/towers/beam.config.js`
and all behaviour in keyed modules: `ramp_per_target`, `def_pierce`,
`charge_to_gold`, `hp_scaling`, `gold_to_power`, `slow`, `lifesteal`,
`death_denial`. Target selection keeps existing locks and only fills free
slots — never re-sorting, because the ramp is per target and re-picking every
tick would quietly delete the tower's damage.

`ConfiguredTower` no longer insists on Longshot's mechanics existing, so it
now loads any config. `StatResolver` accepts the spec's `statDeltas`/`flags`/
`mechanics` vocabulary alongside the existing `deltas`/`grants`.

**Sell value is now half of everything spent** (base + every upgrade), which
is a global economy rule and applies to all towers.

**Three things in the spec worth a decision:**

1. **The 2-5 build's AD.** The table says 5; the per-tier deltas sum to 4
   (base 1 + A2 +1 + B4 +1 + B5 +1). Implemented as the deltas say, and
   pinned by a test that names the discrepancy. A tier needs another +1 if 5
   was meant.
2. **The 2-5 range comes to 125, not 100** — the spec flags this itself.
   Implemented as 125.
3. **`baseGoldPerDamage` at 1/200 is 200x stingier than this game's economy**,
   which already pays $1 per point of damage from every source. As written,
   A3's gold is a rounding error next to the standard payout. The number is
   already listed as a tune-in-playtest parameter; it needs to move a long
   way, or the host economy does.

Defaults taken for the rest of §10: `LOG_COEF` 5, ramp resets when a target
leaves range (same as death), A5's AD bonus fractional rather than floored,
1 u.l. = the existing `UNIT_LENGTH` (the sniper's 250 u.l. is the same scale
the spec cites). Tower HP is stored and displayed but does nothing yet, since
nothing damages towers.

**2026-07-27 (latest 2) — Pierce is a real travelling projectile; the map fills the canvas again.**

**Pierce was still wrong, and the previous "fix" was wrong in a different
way.** It applied the falloff sequence to a list of enemies picked at the
moment of impact, which behaved like a strange area effect: the shot could
"hit" enemies nowhere near its flight path. Now `PierceBullet`
(`js/bullet.js`) is a genuine projectile — fired along a fixed heading,
steered by nothing, and when it touches an enemy it deals its current damage,
spends one point of pierce, steps one place down the falloff curve, and
**carries on along the same line**. It dies when pierce runs out, when
falloff drives its damage to zero, or when it has flown as far as the tower
can shoot.

So "infinite pierce" means the shot keeps going — in a crowd the whole line
*behind the first enemy hit* takes damage, and an enemy standing off that
line takes none. Which enemies are on the line is a property of where they
are standing, not of the tower. At A5's 500 damage the sequence runs
500 → 474 → 449 → 426 … and dies on the 64th enemy, which is the effective
cap the spec describes. Tests pin the projectile count at pierce 0, 6 and
infinite, and pin the line behaviour directly (four enemies through at pierce
3, the whole line at infinite, an off-line enemy never touched, damage
strictly descending).

Two consequences worth knowing:

- **Shots are led.** A straight-line projectile fired at where an enemy *is*
  would miss, because the enemy walks several of its own widths during the
  flight. `LongshotTower.predictedPosition` walks the target forward along
  the path (not along a straight-line velocity guess, which would aim into
  the scenery on a corner) and the shot is fired there.
- **Pierce now rewards placement.** A tower beside the road shoots across it
  and hits one or two; a tower positioned to fire *along* a straight gets the
  whole queue. That is the interesting decision pierce is supposed to create,
  and it falls out of the geometry rather than being special-cased.
- **Claiming is partial for these shots.** A piercing projectile claims
  damage on the enemy it was aimed at, but not on the ones it happens to pass
  through, so two Longshots covering the same crowd can overlap on those.
  The claim invariant was defined for a homing bullet with one known target;
  this is the honest limit of it. Documented in `js/bullet.js` too.

`Bullet.update` now takes the enemy list as a second argument. The homing
`Bullet` ignores it; a straight-line shot needs it, because it has no target
to ask what it ran into.

**The map fills the playable rectangle again.** `AUTHORED_AT_PX_PER_UL` is
now kept equal to the default `UNIT_LENGTH` (both 1.04), which lands the
hand-drawn polyline back exactly where it was drawn for a 1280x720 canvas.
`UNIT_LENGTH` itself is unchanged at 1.04.

**This shifted the balance, and the numbers below moved.** The route is now
~1865 u.l. rather than 1250 while tower ranges stayed put, so a gunner covers
about **5.4% of the path instead of 8%**. Measured over the complete two-wave
run: 1 gunner → 2 killed / 11 leaked / 71 HP (unchanged), 2 gunners → 6
killed / 7 leaked / 88 HP (was 7/6/89), 3 gunners → 9 killed / 4 leaked / 96
HP (was 11/2/98). A lone gunner now takes ~26 s to earn the second rather
than ~19 s. If that is too harsh, the lever is tower range, not the map.

The test helpers now derive fixture coordinates from **both** constants
(`UNIT_LENGTH / AUTHORED_AT_PX_PER_UL`) read live from the game, so retuning
either can no longer invalidate every coordinate in the suites — which had
happened twice by this point.

**2026-07-27 (latest) — Pierce fired one bullet per target (fixed), scale tuned down a third, placing disarms the slot, per-tower damage counters.**

**The projectile bug.** `LongshotTower.update` spawned a `Bullet` for *every*
enemy a piercing shot passed through, so A5's infinite pierce looked like a
shotgun firing dozens of rounds at once. Nothing in the spec ever changes the
projectile count — pierce means one shot *carries on through* the enemies
behind the one it hits. Now one bullet is fired at the primary target and the
rest of the falloff sequence is applied to the enemies behind it at the
moment of impact, via `onHit`. `Bullet`'s `onHit` may now return extra damage,
which the bullet adds to what it reports so the game loop still pays out for
it. Pinned by tests at pierce 0, 6 and infinite.

Applying the follow-through on impact rather than sweeping a line along the
flight path is a simplification, and an honest one while projectile travel is
still undefined (section 7: hitscan vs travelling is a TODO).

**`UNIT_LENGTH` 1.552 → 1.04**, a 33% reduction, because the sniper's range
and footprint read as too large on screen. Worth knowing for next time: this
shrinks the **whole world** uniformly — map, road and both towers — because
the path is authored in u.l. too. It changes how much of the canvas the game
occupies (the map now spans ~900 px of the 1280 px canvas, leaving space on
the right), *not* how big any tower is relative to the map. A tower that
feels out of proportion to the route it guards is a stat to change, not this
constant.

Both test suites carried fixture coordinates in pixels, which this
invalidated wholesale. Rather than hand-patch them and re-break on the next
tune, `tests/run.js` and `tests/sandbox.smoke.js` now pass map coordinates
through a `w()` helper that scales them by the current `UNIT_LENGTH`.
Interface coordinates deliberately do not go through it. One test also
depended on an enemy one *pixel* from the end leaking within a single frame,
which stopped being true when a frame of movement shrank below a pixel — it
now spawns exactly at the end instead.

**Placing disarms the build slot**, at the owner's request — see the Build
bar section, which previously documented the opposite and now records the
reversal and its trade-off.

**Every tower counts the damage it has landed**, shown as the first row of
its panel (`Damage dealt`). Overkill is excluded, so the figure always agrees
with the cash that damage earned. Totals abbreviate past 10k (`12.3k`,
`4.2M`). Both tower types feed it through the same `onHit` callback, so a
future tower gets it by passing one.

**2026-07-27 (later) — The u.l. rescale made permanent, cone re-aim wired up, prices redone for crosspathing.**

**1. Everything is now authored against the 100 u.l. reference tower.** The
gunner IS that reference: its range is exactly 100 u.l. Every legacy distance
was multiplied by 12.5 (range 8 → 100, footprint 0.9 → 11.25, road 1.75 →
21.875, enemy 4 → 50 u.l./s, bullet 45 → 562.5 u.l./s, path 100 → 1250 u.l.)
and `UNIT_LENGTH` divided by the same, 19.4 → 1.552 — so **every distance in
pixels is unchanged** and the map plays exactly as before. The sandbox's
`SCALE` workaround is deleted; there is nothing left to reconcile. Longshot's
250 u.l. range is now 2.5 reference towers and a fifth of the map, instead of
2.5x the whole map.

One knock-on: Longshot's 20 u.l. footprint needs 48 px of clearance from the
road centre line, so it cannot sit as close to the road as a gunner. The
smoke test's placement moved from (700, 505) to (700, 545) for that reason.

**2. Cone re-aiming exists now (spec 5.6).** It was specified and implemented
in `ConfiguredTower.reaim()` but never reachable — nothing called it. It is
now a panel action that appears whenever a tower is in cone mode: clicking it
arms an aiming mode, and the next map click sets the direction. New
`aimingTower` global in game.js consumes that click *below* the panel buttons
and *above* building, so setting a direction can never also place a tower.
Escape cancels; selling or restarting clears it. A live preview cone follows
the cursor while aiming, since the 10 s cooldown makes the commitment real.

**3. Prices now account for crosspathing, which changed them a lot.** The
previous model priced each tier against a single-path progression and was
badly wrong, because the two paths push fire rate in opposite directions:

    B5 alone    fireRate 0.05  -> one shot per 20 s     ->  222 DPS
    B5 + A1     fireRate 0.30  -> one shot per 3.3 s    -> 1260 DPS
    B5 + A2     fireRate 0.30  + pierce                 -> 1903 DPS

Each tier is now priced on the **median** of its marginal DPS gain across
every legal crosspath state it can be bought in. Median, not mean, because
the spread is extreme — A1 gains 6 DPS on a bare tower and 1038 on a B5, a
165x range — and the mean would put A1 at $3050, unbuyable for the player it
is aimed at while still a bargain for the B5 player. New prices: base $75;
A $300/$500/$850/$3800/$13900; B $325/$375/$275/$3400/**$23300** (was $2750
under the single-path model).

The resulting builds price out sensibly: B5+A2 at $15.0/DPS (the gunner's
exact rate), A5+B2 at $21.0, an early A2+B2 at $24.8 — while stopping at pure
B5 with no crosspath is $124.8/DPS, which is the signal that pushes players
to crosspath.

**Still open, and it is a stats problem rather than a pricing one:** path B's
late tiers only function *because* you crosspath into A1. Dropping fireRate
to 0.05 makes pure-B nearly unusable, and no flat per-tier price can be right
when one upgrade swings 165x in value. Either B's fireRate penalties want
softening, or A1's +0.25 does — worth a decision before more towers copy this
shape.

**2026-07-27 — Upgrade/ability buttons in the inspection panel, and derived upgrade prices.**

**Panel.** `inspectionLayout()` now also places one rectangle per *tower
action*, two to a row (so the two upgrade paths sit side by side) with a lone
trailing action taking the full width (the ability). Panel widens 190 → 232
when a tower has actions. A tower opts in by defining `panelActions()` and
`performAction()` — `js/game.js` still knows nothing about upgrade paths or
abilities, it lays out whatever list it is handed, and the gunner (which
defines neither) gets the original panel byte-for-byte. Clicks route through
`runPanelAction()`, which sits *above* Sell in `onClick`'s ordering, and
which hands the tower a small context (`cash`/`spend`/`enemies`/`damage`) so
the economy stays in game.js rather than leaking into tower files.

**No text overlap, enforced not eyeballed.** New `fitText(ctx, text, maxWidth)`
clips with an ellipsis; every string the panel draws goes through it. Stat
rows measure the *value* first and give the label the remainder, so a long
label truncates instead of running under its own number. `tests/harness.js`'s
stub context gained a real `measureText` estimate — without it that code both
crashes and hides layout bugs from the suite. Four new tests in
`tests/run.js` pin the geometry (no overlap, inside the panel, above Sell,
below the last stat row) and the clipping.

**Prices.** `tools/price-upgrades.js` is a reproducible model: it computes
each tier's *effective* DPS — sustained rate through reload, average crit,
average execute over an enemy's life (0.55 × maxBonus, integrated), pierce
with real falloff at a 0.5 conditional discount, assumed 25 live kill-stacks
— and prices the gain at the gunner's $15/DPS plus a mild premium for deeper
tiers. Output is now in the config: base $75; A $95/$275/$700/$3800/$13900;
B $125/$125/$75/$1500/$2750. Both full builds land near $21/DPS, so neither
path is the value pick.

Two findings from that model worth knowing:

- **Path A is ~4× path B's DPS by the spec's own numbers**, hence ~4× the
  price. Not a modelling artefact — A5 pierces a line while B5 fires a single
  huge shot every 20 s. If that gap is not intended, it is the *stats* that
  need revisiting, not the prices.
- **The current economy cannot pay any of these.** Income is $1 per damage
  dealt and the whole two-wave schedule contains 47 HP, so a full run yields
  about $47 — less than the tower's base cost. The prices are internally
  consistent and correctly *ordered*; their absolute scale assumes an economy
  that does not exist yet. Still a section 7 open question, and the reason
  the sandbox runs on infinite cash.

Also fixed a modelling bug in that script before trusting it: the falloff
formula `(d0+20)×0.95ⁿ−20` is not scale-invariant, so normalising to d0 = 1
killed every shot on its second target and priced A3 as a *downgrade*.

**2026-07-27 — Sandbox mode; Longshot is now a real, placeable tower; a targeting bug fixed.**

`sandbox.html` replaces the old static Longshot bench with the **real game
running underneath**: the actual path, enemies walking to the base, towers
shooting, target claiming, leaks costing base HP, placement rules, selling.
`js/sandbox/sandbox.js` overrides exactly three things and nothing else —
cash (infinite), spawning (on demand; a checkbox hands control back to the
real wave scheduler), and the roster (every tower type in the build bar). It
hooks `update`/`draw`/`updateWaves`/`restartGame` by wrapping the globals;
**no line of js/game.js was changed for it**, and deleting the two sandbox
files removes it completely — the same discipline `js/debug-cash.js` follows.

`js/towers/longshot-adapter.js` is the new seam: `ConfiguredTower` knows
config resolution and nothing about this game; `js/game.js` expects a
specific tower-constructor shape and knows nothing about upgrade trees. The
adapter is the only place the two meet, so `js/systems/*` stayed generic and
the gunner stayed untouched. It fires real `Bullet`s (one per pierced enemy,
each carrying its own falloff-reduced damage, each claiming its damage), uses
"first" targeting like the gunner, and feeds kill-stacks.

`js/bullet.js` gained one optional constructor argument, `onHit`, so a tower
whose mechanics depend on its own kills can learn about them. Deliberately a
callback, not a `firedBy` tower reference — bullets still do not know what
shot them, so selling a tower still cannot cancel damage in flight.

**Bug fixed: `js/systems/targeting.js` was mixing u.l. and world space.** It
compared world-space distances directly against `stats.range`/`stats.deadzone`
in u.l. — the exact failure the u.l. system exists to prevent. Invisible in
the old static bench (nothing moved and nothing else was on screen); it would
have made every Longshot range wrong by a factor of `UNIT_LENGTH` the moment
it met a real enemy. Targeting is the collision layer, so it now converts the
radii through `ul()` itself, once per query. Two tests pin it, including one
that retunes `UNIT_LENGTH` mid-test.

**Known conflict, flagged not fudged: the gunner and Longshot were authored
in different u.l. regimes.** Gunner: range 8 u.l., footprint 0.9, on a 100
u.l. map. Longshot: range 250 u.l., footprint 20. Taken literally on the same
map, Longshot's range is 2.5x the whole map and its no-build radius (405 px)
exceeds the playable area — it is placeable *nowhere*. This is a ratio
between two authored numbers, so **changing `UNIT_LENGTH` cannot fix it**.
The sandbox works around it locally (`SCALE = 25` in `js/sandbox/sandbox.js`)
by re-expressing the legacy content in Longshot's regime — every pre-Longshot
u.l. number × 25, `UNIT_LENGTH` ÷ 25, so every *pixel* is identical and the
map/road/gunner look and behave exactly as they ship, while both towers now
coexist. **The shipped game is untouched and still has the conflict.**
Resolving it properly is a balance decision for the owner: either rescale the
legacy content permanently (the same ×25, applied to `js/tower.js`,
`js/enemy.js`, `js/bullet.js` and `PATH_POINTS_UL`), or re-author Longshot's
config downward. Do not pick one unprompted.

**2026-07-26 — Global distance system replaced: `Units`/`Units.m2px()` are gone, replaced by `UNIT_LENGTH`/`ul()`.**

Requested as infrastructure "every tower, projectile, enemy and map element
depends on" -- see "The core invariant: all distances are u.l., converted
once, at the edge" above for the full rule. In one line: `Units.calibrateFromPath`
(the path always being defined as exactly 100 m, whatever its pixel length)
is replaced by a single hand-tuned constant, `UNIT_LENGTH`, and a single
helper, `ul(value) = value * UNIT_LENGTH`.

Touched `js/units.js` (full rewrite), `js/game.js` (`PATH_POINTS` became
u.l.-authored `PATH_POINTS_UL`, converted via `ul()` once in `init()`;
`ROAD_WIDTH_M` → `ROAD_WIDTH_UL`; every `Units.m2px()` call → `ul()`; the
inspected-tower overlay now labels range/footprint with their u.l. values),
`js/tower.js`, `js/bullet.js`, `js/enemy.js` (constants and fields renamed
`*_M`/`*_MPS` → `*_UL`/`*_ULPS`), and Longshot's debug scene (`Units.m2px()` →
`ul()`; the scene now also exposes a live `UNIT_LENGTH` input, since its
canvas re-reads the constant every frame with nothing cached).

`UNIT_LENGTH` starts at 19.4, not the spec's example placeholder of 1 --
that's the value that makes this a drop-in replacement rather than a
re-tuning exercise; see the note in `js/units.js` and above. The path itself
is now u.l.-authored and converted via `ul()` too (not left as fixed pixel
geometry), which is what keeps crossing time invariant to `UNIT_LENGTH` --
verified by `tests/run.js`'s new "changing UNIT_LENGTH" group, which rebuilds
the whole game at half the constant and checks for byte-identical kill/leak/
base-HP outcomes over a 120 s run.

Two tests in that group replaced one old one
(`Units.pixelsPerMeter`/`Units.PATH_LENGTH_M` no longer exist); the
`inspected` panel's "8 m" label test was updated to "8 u.l."; the placement-
clearance test now reads `UNIT_LENGTH` instead of `Units.pixelsPerMeter`.
Every other test in the original suite passes unmodified -- `node
tests/run.js` is 42 tests now (was 40), all passing. Longshot's own 48 tests
and its scene smoke test are unaffected (its systems files never touched
`Units` directly) and still pass.

**2026-07-26 — Longshot: a second tower, a two-path upgrade tree, config-driven.**

Built against a fully-specified request (exact stat tables for every tier and
crosspath combination, exact formulas for pierce falloff/execute
scaling/damage resolution, with numeric verification points). See "The
Longshot tower" section above for the full design summary and the list of
section-7 placeholders left unfilled on purpose.

This removes "tower levels or upgrades" and "multiple tower types" from
Deliberately out of scope -- both were on that list as a guard against
speculative content, not as a permanent ban, and this was an explicit ask,
not a speculative addition. The gunner, `game.js`, and the original 40-test
suite are untouched; Longshot is a parallel system with its own config,
systems files, runtime, tests, and debug scene. `node tests/run.js` (40
tests) and `node tests/long-range-dps.test.js` (48 tests) both pass.

**2026-07-26 — Finite waves, 100 HP base, defeat and full restart.**

Replaced the endless two-second spawn timer with two data-driven waves: five
3 HP enemies at 0.8 s spacing, then a five-second break after the last spawn,
then eight 4 HP enemies at 1 s spacing. `Enemy` now accepts per-instance
starting health so wave strength does not require a second enemy type.

The base now loses each leak's remaining HP. At zero it clamps, freezes the
simulation, and shows a restart overlay; the button or R/Enter resets the
entire run through `restartGame()`. Remaining rather than maximum health makes
partial damage matter, and charging immediately before filtering guarantees
each leak is counted once.

The suite is now 40 tests, adding exact schedule, wave health, leak damage,
loss freeze, and clean-restart coverage. Balance notes were recalculated for
the finite 47 HP schedule. Since 47 is below the base's 100 HP, the current two
waves cannot cause defeat by themselves; the tested loss path is ready for
later waves or other damage.

**2026-07-26 — Test suite, selling towers, temporary debug cash panel.**

*Tests first, at the owner's request*, so changes stop being verified by
clicking around in a browser. `node tests/run.js` — 35 tests, under half a
second, no dependencies, no install. The harness boots the real game against a
stubbed canvas and drives it through real entry points, so it exercises the
same code the browser runs. It reads the script list out of `index.html` so it
cannot drift, and skips `js/debug-*.js`. This does not violate the
no-toolchain rule: the tests need Node, the game still needs nothing.

The suite immediately earned itself twice — it caught a test of mine that
depended on check order in `whyCannotBuild`, and it caught that clicking to
build under an open panel sells the tower instead (correct, and now pinned).

**Selling:** `SELL_REFUND_FRACTION = 0.5`, refund `Math.ceil(cost * 0.5)`, so a
$15 gunner returns $8. Sell button in the inspection panel, or Delete with a
tower selected. `inspectionLayout()` now owns the panel geometry so the button
is drawn exactly where it is clickable. Selling deliberately does not cancel
bullets already in the air, and `splice` keeps the claim ordering intact.

**Debug cash panel** (`js/debug-cash.js`) — the owner asked for it explicitly
and asked for it to be removed afterwards, so it is one self-contained file
plus one `<script>` line, loudly labelled, built in the DOM rather than on the
canvas so no debug code touches the render loop. See its own section above.
The only game change it forced was ignoring keys typed into text fields in
`onKeyDown`, which is worth keeping either way.

**2026-07-26 — Target claiming: towers no longer waste shots on a dying enemy.**
Reported by the owner: two gunners that saw the same enemy at the same moment
both shot it, so against a 1 HP enemy one bullet was pure waste and the second
gunner felt useless. Measured with two gunners mirrored across the road:
**4.00 shots per 3 HP kill, one shot in four thrown away.**

Fixed with in-flight damage claims. A `Bullet` reserves its damage on the
target when constructed and releases it when it lands or loses the target;
`Tower.findTarget()` ignores any enemy whose health is already fully claimed,
and a tower with nothing real to shoot at holds fire instead of firing anyway.
Now 3.00 shots per kill exactly — zero waste — verified both headlessly and in
the browser through the real `update()`.

Priority when two towers do contend goes to the one **earlier along the path**,
which is what the owner asked for and is also correct on its own terms: that
tower is the one whose window is about to close, since the enemy is walking
away from it and towards the other. Implemented by giving each tower a
`pathProgress` and keeping the `towers` array sorted by it, so the update loop
*is* the priority order rather than a second thing that could disagree with it.
`GamePath` gained `closestToPoint()` for this, with `distanceToPoint()`
rewritten as a view onto it so the two cannot disagree about the nearest point.

Note it deliberately does **not** stop two towers focusing a *healthy* enemy —
only the redundant killing blow is blocked.

**2026-07-26 — Economy resolved, build bar, tower inspection.**
Owner picked the starting-stake resolution: `STARTING_CASH = 20`,
`Tower.COST = 15`. Chosen tight on purpose — it buys one gunner, and since one
gunner cannot hold the line you have to earn the second (~18.7 s, verified by
simulating the real code, not by eyeballing a playtest).

Towers are now placed via a five-slot build bar at the bottom centre: arm a
slot, then click the map. `BUILD_SLOTS` holds tower *constructors* so the bar
is type-agnostic — the four empty slots are shape-preservation for later, not
a signal to add tower types. Clicking a placed tower opens a panel showing
damage, range, cooldown and DPS; cooldown and DPS are derived in
`statLines()` from the fields `update()` fires with, so they cannot go stale.

Two things were generalised rather than hardcoded while doing this, because
the alternative was exactly the magic-number bug this file already warns
about: `whyCannotBuild` now takes the tower type instead of assuming a gunner,
and tower-to-tower spacing is the *sum* of the two footprint radii instead of
`FOOTPRINT_RADIUS_UL * 2`. Both are no-ops today and both stay correct when a
second tower type with a different footprint arrives. Tower instances gained
`footprintRadiusUl` / `footprintPx` to support it, and the footprint now also
serves as the click-to-inspect hit box.

**2026-07-26 — Foundation complete.**
Path, enemies (3 HP, one per 2 s, 4 m/s), gunner towers (8 m range, 1 dmg,
1 shot/s), homing bullets, cash at $1 per damage dealt, placement rules
preventing building on the road or on another tower. Meters-based unit system
throughout. Ported from an earlier Godot 4 prototype to plain HTML/JS so the
game runs from a folder with no software installed.
