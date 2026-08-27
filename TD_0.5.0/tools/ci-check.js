// ---------------------------------------------------------------------------
// CI gate: run every suite and compare against the MEASURED baseline, BY NAME.
//
//   node tools/ci-check.js            gate: names first, totals as a check
//   node tools/ci-check.js --names    print today's failing set, paste-ready
//
// WHY THIS IS NOT JUST "npm test" WITH A ZERO-EXIT RULE. This project ships
// with known failures and says so in AGENTS.md: a wave-schedule assertion, some
// stale fixtures, a `w()` helper that only exists in run.js, and one
// Arcane-Sniper B5 timing drift that predates the checkout. Requiring exit 0
// would paint CI permanently red and teach everyone to ignore it, which is
// worse than having none.
//
// So the gate is REGRESSION, not perfection:
//   * a failing NAME that was not failing before -> fail the build
//   * passes going DOWN                          -> fail the build
//   * a name that stopped failing, or passes going up -> pass, and say so
//     loudly, so the baseline below can be tightened in the same commit that
//     earned it
//
// WHY NAMES AND NOT TOTALS, WHICH IS WHAT THIS FILE USED TO COMPARE. A total is
// a sum, and a sum hides a swap. One test breaking while another is silently
// fixed leaves 30 failures before and 30 failures after, and the old version of
// this gate printed "No regressions" for it -- confidently, in green, which is
// worse than printing nothing. That has happened on this project before: two
// tests named in AGENTS.md as known failures were found to be PASSING, and had
// been passing since before the block that named them was written. Nothing but
// the names could show it. The totals were right the whole time.
//
// The set below is therefore the real baseline and the counts are a
// CROSS-CHECK on the parse, not the gate.
//
// THE PARSE MUST BE ABLE TO FAIL. If a suite's output format changes, a name
// regex that quietly matches nothing would report an empty failing set forever
// and this gate would pass every build for the rest of its life. So every run
// asserts that the number of FAIL lines it scraped equals the count the suite
// reported about itself, and a mismatch is a hard failure with the tail of the
// output attached. A check that can only ever say "clean" is not a check.
//
// The numbers are MEASURED, not copied from the docs. AGENTS.md recorded
// blub.test at 47 passing for weeks; it is 53, and was 53 on the day the 47 was
// typed. A baseline transcribed from prose is a baseline that drifts, which is
// the failure this file exists to catch. Regenerate with --names, never by
// hand.
//
// Measured 2026-08-12 on branch visual-pass, node v24, after the authorised
// fixture repairs: the Arcane-Sniper B5 channel, the gunner-deletion roster
// shift, two renames and the recruit cooldown. 36 standing names -> 23, none
// added. The remaining 23 are the held upgrade retune, the Tyrant, and the
// test-file bugs; see the per-suite notes below.
// ---------------------------------------------------------------------------

var cp = require("child_process");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");

// Both runners print "FAIL <test name>", assert.js at four spaces and
// sandbox.smoke.js at two. Nothing else in either output starts that way.
var FAIL_LINE = /^[ \t]+FAIL[ \t]+(.+?)[ \t]*$/;

var BASELINE = [
  {
    // 133 on 2026-08-26, from 127: SIX tests ADDED covering the timeline
    // scheduler, in the same change that earned them. Nothing was removed, one
    // name was CORRECTED (see below), and no product code moved -- every one of
    // the six passed against the shipping js/ the day it was written, and each
    // was self-tested by mutating that file and putting it back.
    //
    //   "the timeline rewrite moved when bodies arrive and changed nothing
    //     else" -- the composition gate. The rewrite edited roughly a hundred
    //     and thirty group literals, so "the content is unchanged" is not a
    //     claim a diff can carry. It holds the pre-rewrite snapshot of all 35
    //     waves -- bodies, effective HP, clear bounty, kill bounty and the
    //     AUTHORED SIGNATURE of every group, with absence of `health`/`tier`
    //     distinguished from any value -- plus the roster rules the schedule is
    //     built around. Self-tested by writing `Enemy.TYPES.normal.health` onto
    //     wave 1's group, which changes no aggregate anywhere: red here.
    //   "wave 22 runs three groups at once, and wave 30 opens two on the same
    //     frame" -- the three-group overlap, and the pair of groups sharing an
    //     `at`. Both are sentences the sequential scheduler could not say. The
    //     wave-12 test next to it is the two-group case.
    //   "wave 35's Tyrant walks in at thirteen seconds and its T5 slime at
    //     twenty-eight" -- the finale's two authored landmarks, on the clock.
    //     Before `at` existed neither was a number anyone could read off the
    //     file. Self-tested by deleting `tier: 5`: red.
    //   "a wave's clock starts when the wave opens, never when it finishes
    //     arriving" -- wave 1's ceiling fires at 32.0 s and not at 35.2 s, and
    //     wave 11 is recorded as the one wave where "the wave opened" and "its
    //     first body landed" are four seconds apart.
    //   "the whole campaign runs itself dry, with every authored arrival
    //     emitted once" -- thirty-seven simulated minutes with NO input at all,
    //     wrapping emitWaveEvent to record every arrival by (wave, group,
    //     body). A dropped or doubled arrival is invisible to every other count
    //     in the suite, because they all read the DATA rather than the run.
    //     Self-tested both ways: red on skipping one arrival per wave, red on
    //     emitting one twice.
    //   "a second road mirrors the whole timeline, and is still one wave and
    //     one reward" -- Twin Confluence deploys all 88 bodies of wave 12 down
    //     each road, in the same order, off ONE cursor, and pays one reward.
    //
    // RENAMED, assertions untouched: "the skip button only exists during a
    // break" -> "the skip button does not exist while a wave is still
    // arriving". The old name became false on 2026-08-25 -- there is no break,
    // and the button is live for the tail of every deployed wave -- while what
    // the test measures never moved. A green test carrying a false claim is
    // worse than a red one. The count is unaffected: one name out, one in.
    //
    // ---- the previous entry, kept ------------------------------------------
    // 127 on 2026-08-26, from 125: TWO tests ADDED with the wave-identity
    // audit. Nothing was removed and no existing name changed its mind -- the
    // three inheritance sites were already correct, and these two cover the
    // gap between "the number is copied" and "the number is load-bearing".
    //
    //   "a wave stays open while a body it never scheduled is still walking"
    //     -- the behavioural half. The other identity tests read waveId off a
    //     descendant; this one leaves a wave-25 cascade as the ONLY thing
    //     alive and watches the wave refuse to close for four generations. A
    //     splitOnDeath that stamped its children correctly while
    //     waveStillOnTheRoad scanned something else would pass every other
    //     test in the section and fail this one.
    //   "every place in js/ that builds an enemy from another one passes the
    //     origin on" -- the SOURCE scan, because the failure mode here is a
    //     site nobody remembered rather than a site that got it wrong. A
    //     fourth creation site added tomorrow without the field mints bodies
    //     wearing waveId 0: they hold nothing open and close their parent's
    //     wave over their heads, and nothing on the road looks wrong. js/codex.js
    //     is exempt (parked sprites, never in `enemies`) and the exemption is
    //     itself asserted to still have a call site behind it.
    //
    // Self-tested by two mutations, restored after each: deleting
    // `waveId: this.waveId` from splitOnDeath goes red on both new names AND on
    // the older cascade test; appending a `new Enemy(...)` with no waveId to
    // js/systems/execute.js goes red on the source scan alone, which is the
    // proof that the scan reaches past js/enemy.js into every subdirectory.
    //
    // 125 on 2026-08-25, from 118, with the TIMELINE SCHEDULER. Net +7 across
    // eight added and one removed, and the removal is a merge rather than a
    // loss:
    //
    // ADDED (+8)
    //   "the same wave deploys identically at any step size" -- the property
    //     the whole scheduler exists for. Same wave, 720 steps / 72 steps / one
    //     step, byte-identical deployment.
    //   "a long frame loses no time on either side of a transition" -- the
    //     overshoot is handed to the wave that starts, not discarded.
    //   "auto-send ends a deployed wave three seconds out, and never sooner"
    //     -- it may end a wave that has finished arriving and may never touch
    //     one that is still arriving.
    //   "the final wave has no ceiling and no Send, and the run ends on an
    //     empty road".
    //   "the ten-second opening pause sits outside wave 1's own clock".
    //   "a wave whose ceiling falls before its own tail is rejected" -- the
    //     load-time validator, which catches the one authoring mistake the
    //     timeline makes easy and that nothing else would see.
    //   "a wave resolves into one interleaved timeline of arrivals" -- the
    //     expansion, the tie-break and absence-copied-as-absence.
    //   "a wave re-run from the top owes its reward again" -- the sandbox's own
    //     idiom, which restarts onto the SAME wave by hand and left the reward
    //     latch set. Found by driving it, not reasoned about.
    //
    // REMOVED (-1) "a mixed wave deploys its groups in order, each at its own
    // spacing". It PASSED and it was TRUE; it is deleted rather than repaired
    // because what it asserted has been deleted -- groups no longer deploy in
    // order, `lead` is not a field, and waveGroupAt is gone. Its subject is
    // wave 12, and wave 12 is what the interleaved-timeline test above walks.
    //
    // RENAMED, not added or removed (so the count does not move): five
    // scheduler tests kept their subject and lost the ninety-second break from
    // their names and their bodies -- "wave 1 deploys five enemies, then wave 2
    // waits out the ninety-second break" is now "a wave deploys on its own
    // clock and its ceiling hands over to the next", and so on. Each is listed
    // in CHANGELOG.md against what it used to claim.
    //
    // Self-tested by deleting the `waveElapsed = -waveCountdown` line that
    // carries a frame's overshoot across a transition: red on the long-frame
    // test and on nothing else, which is the point of writing it.
    //
    // 118 on 2026-08-25, from 112: SIX tests ADDED with the wave HUD. Four are
    // the readout, which had nothing on it before -- the wave clock, the
    // transition countdown, the final wave's missing timer, and the line's own
    // shape -- and none of them could have existed earlier, because there was
    // no clock to read and no state to be in. One is the Send button's
    // rectangle, SWEPT rather than reasoned about: 344 points, in three
    // scheduler states, asked the game's own overInterfaceChrome and then
    // actually built a tower there. One is waveSummary's key, which is now
    // (type, health, tier) and not the display name. Nothing was removed and no
    // existing name changed its mind. Self-tested by three mutations, restored
    // after each: dropping the `waveElapsed += dt` line goes red on both clock
    // tests (32 s left forever, elapsed 0); widening the chrome test back to
    // `waveControlsShown()` goes red with all 344 mid-wave points claiming a
    // click; keying the summary on the name alone goes red on the health and
    // tier cases, printing "8 × Fast" and "8 × Fractal Slime" for salvos 4 HP
    // and 1020 HP apart.
    //
    // 112 on 2026-08-25, from 108: FOUR tests ADDED with wave identity, one per
    // hop the number takes -- minted by the scheduler, inherited by broods,
    // splits and summons, used to close a wave, and deliberately NOT used to
    // win the run. Nothing was removed and no existing name changed its mind;
    // one existing test ("wave 1 deploys five enemies...") had to root a wave-2
    // body instead of relying on a wave-1 one, because relying on it was the
    // bug. Self-tested by dropping the waveId out of splitOnDeath: red on the
    // cascade assertion with 84 descendants still counted correctly, which is
    // the whole reason the origin gets its own test rather than riding on the
    // tier one.
    //
    // 108 on 2026-08-19, from 107: one test ADDED with the camo model mapping.
    // `camo_fast` and `camo_heavy` had no mesh under their own ids and drew the
    // fallback sphere, and no suite asserted that a camo type draws a body at
    // all -- so the GL path's translucency was being applied to a ball with
    // everything green. Self-tested by mutating CAMO_SHADOWS: red on three
    // assertions, green again on restore.
    //
    // 107 on 2026-08-12, from 105, and the path there is +1 then -2 rather than
    // any test changing its mind:
    //
    // ADDED (+1) "a scheduled fractal slime reaches the board at its declared
    // tier". Nothing in any suite asserted that a scheduled body arrives
    // carrying what the schedule declared, which is why a dropped `tier`
    // argument shipped a 4 HP body where wave 25 authored a 64 HP one, with all
    // six suites green before AND after the fix. Self-tested by reverting that
    // argument: red on all four assertions, descendants falling 84 -> 4.
    //
    // REMOVED (-2) the two difficulty tests. Both PASSED; they were deleted, not
    // repaired, because Normal and Hard were deleted as unfinished placeholders.
    // A suite getting SMALLER reads as loss on a totals diff, so it is written
    // down here as a deliberate removal.
    // MERGED 2026-08-26. Two sets of additions landed on run.js from either
    // side of this merge and the suite now holds both, so the count below is
    // neither side's -- it is MEASURED off the merged tree, which is what the
    // header of this file demands and the only number that could be right.
    //
    // 135 on 2026-08-26, from 133: TWO tests ADDED, both regressions on clocks
    // the timeline rewrite got wrong and its own suite could not see. The
    // existing step-size test deploys each wave IN ISOLATION -- cursor moved by
    // assignment, no gate ever fires -- so it proved the emission independent of
    // dt and said nothing about the ceiling or the transition. Both were wrong:
    // `waveElapsed >= duration` carried no float tolerance while the emission
    // beside it carries SPAWN_EPSILON, so all 34 ceilings closed one frame late
    // at 1/60 (1920 steps reach 31.999999999999464, not 32); and endWave()
    // discarded the overshoot of the crossing frame, costing 0.217 s over
    // thirteen ceilings at 1/60 against 0.007 s at 1 ms. Nothing was removed and
    // no existing name changed its mind. Self-tested by mutation, restored
    // after each: dropping SPAWN_EPSILON from the ceiling goes red on all three
    // step sizes; dropping the overshoot handover goes red on the spread; moving
    // auto-send back above the countdown block goes red at dt = 0.1.
    //
    //
    // 112 on 2026-08-26, from 108: FOUR tests added with the Vanguard's import.
    // Each one pins a failure that draws a plausible picture rather than
    // throwing -- a band that is never selected (the boss walks, in the wrong
    // gait), a variant flag that latches (the boss stays in pieces for the rest
    // of the run), a reform that finishes at the wrong moment, and a shield
    // fragment welded into the torso. Self-tested by mutation: emptying
    // `ENEMY_GAIT_BAND` and dropping the `shieldOut = false` line in
    // `grantShield` turns three of them red; dropping `model.positions` in
    // gl-models turns the fourth red. Green again on restore.
    // 161 on 2026-08-27, from 157: FOUR tests ADDED with the HUD pause button,
    // in the change that earned them. They live in the existing "the pause
    // menu" group and nothing was removed to make room -- the one existing
    // assertion they touch is the 2026-07-28 "no HUD menu button" line, which
    // kept its subject (`exitButtonRect` is still undefined) and narrowed its
    // claim to the half that was load-bearing: no button that LEAVES a run in
    // one click. The button added opens the menu, and Back to main menu inside
    // it is still a second deliberate click.
    //
    // The load-bearing member is "the bottom-right chrome row is four buttons
    // that do not overlap". The row is a CHAIN -- each rectangle is derived
    // from the one to its right -- so widening any button slides its neighbours
    // leftwards, and the failure mode is a live rectangle sitting silently
    // under the build bar. It sweeps the chain for overlap, for a common
    // baseline, and for clearance from `BAR_X + BAR_WIDTH`, which is itself
    // derived from the build-slot count. Self-tested by mutation: collapsing
    // the pause button's offset onto the mixer's turns it red, along with the
    // two behavioural tests; disabling the click handler turns those two red on
    // their own. Green again on restore.
    //
    // ---- the previous entry, kept ------------------------------------------
    // 157 on 2026-08-27, from 139: SEVENTEEN tests ADDED with the Normal
    // difficulty, plus one existing test WIDENED, in the change that earned
    // them. Nothing was removed and no existing assertion changed its mind.
    //
    // The new group is "difficulty", and the load-bearing member of it is
    // "Normal is authored, not derived from Easy and not an alias of it" --
    // which is the claim the whole feature rests on and the one no aggregate
    // can carry. It checks three things a derivation cannot survive: no object
    // in common at any depth, no constant ratio reproducing one schedule's
    // bodies / effective HP / clear bounty / kill bounty from the other's, and
    // not one of the thirty-five waves sharing a roster with Easy's wave of the
    // same number. It also reads js/game.js and refuses the deleted
    // `buildDifficultyWaves` by name, because a derivation is a SHAPE and no
    // data assertion can rule it out. Self-tested by pointing NORMAL_WAVES at
    // EASY_WAVES: red on every clause.
    //
    // The rest: the exact 35-wave composition against the owner's own table
    // (which is the specification, so the schedule is what has to agree), the
    // 1 000 authored roots, all twenty-four types, the five act totals
    // 158/174/213/212/243, the three waves with written encounter direction
    // (11, 16, 18) plus 34's twelve-second Vanguards and 35's Tyrant/T5/no-
    // Sapper contract, the selection flow through the real click handlers,
    // restart preserving the difficulty while clearing every new run-scoped
    // thing, the readouts following the active schedule, both schedules
    // validating with wave 35 as the only ceiling-less wave, Normal's camo and
    // air checks, and both campaigns running themselves dry to a win.
    //
    // WIDENED, assertions unchanged in kind: "every enemy type is scheduled,
    // and every scheduled type exists" now walks EVERY difficulty. It had to:
    // it is a question about the game rather than about one schedule, and the
    // Herald, the Sapper and the Volatile are authored into Normal and
    // deliberately kept out of Easy.
    //
    // ---- the previous entry, kept ------------------------------------------
    // 139 measured on the merged tree: 108 at the fork, +27 from the timeline
    // rewrite and +4 from the Vanguard's import, which is exactly the sum and
    // so is evidence that nothing was lost in the merge. ONE fixture was
    // repaired to get there, and no product code moved for it: the flying-wave
    // list read [24, 31, 35], written on a branch that forked before the owner
    // ruled that the Healer flies (2026-08-26). Wave 32 is the healer wave.
    // 175 on 2026-08-28, from 161: FOURTEEN tests ADDED with Normal's
    // extension from thirty-five waves to forty, in the change that earned
    // them. Nothing was removed; three existing names were CORRECTED because
    // their titles had become false ("Normal is thirty-five waves ..." ->
    // "... forty waves", "Normal carries all twenty-four types" -> twenty-five,
    // and the five-act total gained "teaching" to say which acts it means).
    //
    //   "Normal's first thirty-five waves are untouched but for wave 35's
    //     ceiling" -- the extension's load-bearing negative. The composition
    //     table would still pass if act VI had been paid for by trimming act V.
    //     This holds waves 1-35 at 1 000 roots and 39 139 effective HP and
    //     names the one field allowed to have changed. It also PINS 39 139,
    //     which AGENTS.md had recorded as 39 507 since Normal landed with
    //     nothing asserting it either way -- the prose was wrong and the
    //     schedule was right.
    //   "act VI is five waves and 321 bodies, on top of the thousand"
    //   "the three money convoys carry armour and escort and nothing else" --
    //     the prohibitions, stated as PROPERTIES of the type rather than as an
    //     id blacklist, so a future type that acquires one is caught here.
    //   "the Colossus progression across 36-39 is 2, 4, 6 and 8"
    //   "the money convoys pay strictly more each wave, and enough to spend" --
    //     read through waveKillBounty + waveReward, against real upgrade
    //     prices, so a retune of a count or an override moves it.
    //   "wave 39 sends three independent Tyrants about twenty seconds apart"
    //   "wave 39's three Tyrants keep independent state, and their summons keep
    //     39" -- the one that would catch enterPhase mutating Enemy.TYPES
    //     instead of copying it, which would speed up every future boss.
    //   "wave 39 is the tactical peak, but not the damage peak"
    //   "wave 40 is one 45k boss, eighteen Swarm, twelve Fast and no support"
    //   "wave 40's four deployments land at 0, 12, 32 and 55 seconds"
    //   "every event in Normal's waves 35-39 happens before that wave's
    //     ceiling"
    //   "Normal's wave 35 hands over to wave 36 and cannot win the run" -- the
    //     behavioural half of "finality comes from the schedule's LENGTH". Wave
    //     35 holds a Tyrant, which is exactly what makes it look final.
    //   "Normal wins only once wave 40's boss and its escort are both gone"
    //   "Normal runs itself dry over forty waves, every arrival emitted once"
    //     -- the arrival audit, for Normal. Its Easy twin reads `WAVES` on a
    //     fresh boot, which is Easy, so act VI's 321 new arrivals had nothing
    //     watching the RUN rather than the data.
    //
    // ---- the previous entry, kept ------------------------------------------
    file: "tests/run.js", pass: 175, fail: 0,
    // Was 105/3. The three Arcane-Sniper names were repaired on 2026-08-12:
    // the ability is channelled and these fixtures never stepped the clock.
    failing: []
  },
  {
    // Was 182/30. Twenty-five repaired on 2026-08-12, none by changing product
    // code: the gunner-deletion roster shift (3), three renames, the recruit
    // cooldown (2), the 2026-08-01 upgrade retune (15) -- upgrades now grant HP
    // on every tier and the Smasher ladders were repriced to A
    // 200/350/600/1400/1950 and B 200/400/900/1900/2900 -- and three of the
    // Tyrant group once `w()` existed to let them run.
    //
    // THE FOUR `w is not defined` TESTS HAD NEVER EXECUTED AN ASSERTION. Three
    // are now green and none of them was the stale retune value everyone
    // expected. A test that has never run is not a stale fixture by default:
    //   - the leap measured ZERO, which is neither the old 50 nor the current
    //     90. Its towers were placed at y=455 against a road centred at y=460
    //     and were all refused, and its 1251-damage blow was calibrated for a
    //     2500 HP Tyrant that now has 5000, so the 50% roar never fired and the
    //     leap was never in the pool. The "leap" it measured was walking.
    //   - the aimed shot had the same y=455 fault, plus an 8 s wait against a
    //     12 s interval.
    //   - the stunned tower passed spawnAt a converted PIXEL value where it
    //     takes a path progress, parking the enemy 307 px from a 104 px reach.
    //
    // 225/0 on 2026-08-26: +3 with the road that changes width. Each one pins a
    // half of the feature that nothing else could see:
    //
    //   The first walks the forest's own route and asks every rule that reads
    //   the road to answer at a chokepoint, on open road and in the plaza --
    //   the width, the build clearance, an actual refused placement, the lane
    //   a body walks in, and that the RIBBON the two renderers draw from
    //   carries the same half-width the placement rule measures. A profile
    //   that moved the tarmac and not the clearance would leave towers
    //   standing in the road with every suite green.
    //
    //   The second pins that the crossing time is WALKED and not divided
    //   (39.8 s against the 49.0 the division gives), that the grace term is
    //   taken off that clock, and that a slow still multiplies through the
    //   gauntlet -- without which the last fifth of the board would be immune
    //   to every slow in the game.
    //
    //   The third is the one that made the feature safe to land: the six
    //   boards that declare no profile get IDENTITY back from `ribbon`, the
    //   nominal half-width, the same divide and the same grace. Not "close
    //   enough" -- the same objects and the same arithmetic.
    //
    // Self-tested by four mutations, restored after each: dropping the width
    // scale from the enemy's lane offset, dropping the pace multiply from
    // currentSpeedUlps, and taking `buildClearanceOn` back to the flat
    // `buildClearancePx` each turn exactly one of them red; forcing `ribbon`
    // to resample an unprofiled route turns the third red.
    //
    // 222/0 on 2026-08-26: +3 for the forest's river, its grave and its cleared
    // watchtower deck.
    //
    // The river one is the load-bearing one, because the band it measures is a
    // number that has to be IDENTICAL in two files: `GLGeometry.river` puts the
    // channel's outer lip at width/2 + banks either side of the centre line and
    // `World3D.buildMapMesh` opens the floor at the same offset. Nothing at run
    // time checks that they agree, and when they do not the board shows a strip
    // of void down the whole run. The same test pins that no PROP stands in the
    // water -- nine had to move off that strip when the river landed, and
    // scenery is never validated against terrain, so a tenth added later would
    // be a dead stem growing out of a river bed with every suite green -- and
    // that the bridge's span actually reaches both banks, which is the one
    // measurement on that prop that is not taste. Self-tested by dropping the
    // bridge's size to 80: red on the abutment span, green on everything else.
    //
    // The grave one pins the only per-prop colour override in the game. Every
    // other colour on a board is derived from its theme; the casket declares
    // `accent` because its light is deliberately NOT the camp's ember, and
    // dropping that one field would leave it glowing orange with nothing
    // failing anywhere. Self-tested by deleting `accent`: red on both colour
    // assertions.
    //
    // The deck one is measured off built GEOMETRY rather than asserted about
    // source: it builds the watchtower and looks at what is actually in the
    // volume a body standing on the platform would occupy. The lamp used to sit
    // dead centre there and read as a stool on a tower whose whole job is to
    // have somebody on it. Self-tested by moving the lamp back to `cx, cy`: the
    // closest-to-axis measurement goes to 0.000 x size and the test goes red.
    //
    // 219/0 on 2026-08-26: +2 for the forest board. One pins the board's own
    // contract -- that it declares weather and wildness, that every camp prop
    // it names is a kind the geometry can actually build (a rename in the
    // scenery switch would otherwise turn every barricade into the default
    // block, silently), and that its ground patches are the flat kind rather
    // than slabs, which is the only thing on that board that could reach
    // gameplay. The other covers the half of the chooser's new layout that
    // nothing else does: rows that hold different numbers of cards, each
    // centred on its own contents, must not land on top of one another. The
    // seventh map's row running off the bottom of the canvas was already
    // caught by the hit-test check next door -- self-tested by restoring the
    // fixed-size grid, which goes red on card 6 in BOTH -- so this one pins
    // overlap and the room left for the line under the grid, and does not
    // repeat the fit.
    //
    // 217/0 on 2026-08-20: +1 for the Fractal Slime's tier ladder reaching the
    // schedule. The campaign sent one rung of the six while the index printed
    // all of them, and no suite compared the two -- so five tiers could have
    // been dropped from the schedule entirely with every suite green. The new
    // test walks the schedule against the type's own `fractal` block in both
    // directions. Self-tested by deleting the T4 group from wave 33: red on
    // the rung count and on three T4 assertions (the wave left holding that
    // rung is 35, which states 1024 rather than 256), plus the codex's derived
    // wave list next door. Green again on restore. NOT red on the ascending
    // order -- removing a middle rung leaves the rest ascending, which is why
    // the count is asserted separately from the order.
    //
    // 216/0 on 2026-08-19: +1 for the Tyrant's eye beams. Nothing asserted that
    // its aimed shot produced any mark at all, and on the 3D board it produced
    // none -- `attackBeam` is drawn by the 2D renderer only, so the boss's
    // signature attack was invisible there. Self-tested by disabling
    // `emitEyeBeam`: red, and green again on restore.
    //
    // 215/0 on 2026-08-19, from 207/5. The five standing names were closed in
    // one pass, and NO PRODUCT CODE MOVED for any of them -- every one was the
    // fixture being wrong about a game that was right, exactly as the notes
    // below predicted. (215 rather than 212 because the working tree has since
    // added three tests of its own.)
    //
    //   - `the Tyrant's numbers ...` and `the roar ...`: the stale-retune
    //     repair nadia already ruled on, applied in the direction she named --
    //     the CODE is canonical. shield 200 -> 1000, leap 50 -> 90 u.l.,
    //     post-roar 6 -> 9 s, roar summon 30 -> 40 bodies. The 601/610 trap
    //     was real: `Enemy.TYPES.boss.attack` is a key the type row has never
    //     had (the pool is `attacks`), and repairing it exposed the summon
    //     count underneath. The shield, the interval and the body count are
    //     now DERIVED from the type in the test rather than typed, so the next
    //     retune moves them on its own instead of going stale a third time.
    //   - `after the roar it alternates ...`: the behavioural half was a
    //     SETUP fault after all, not a game defect. The note below was right
    //     that the fired-attack inference breaks when an attack is skipped --
    //     but the reason the leap was always skipped is that the tower row sat
    //     on a fixed y=505 line while the boss walked 675 u.l. away from it
    //     during the test's own 45 s pre-roar measurement, ending 248 px from
    //     the nearest tower against the leap's 228.8 px reach. Falling through
    //     to the aimed shot is documented, correct behaviour. Spreading the
    //     row along the path's own length (~84 px worst-case gap) makes the
    //     leap eligible, the index then advances by exactly one, the inference
    //     is valid again, and the observed order is leap, aimed, leap. The
    //     strict alternation assertion was kept, not weakened.
    //   - the two `towers[-1]` throws: `buyPath` bought for the global
    //     `inspected` instead of the `tower` it is handed, so the two callers
    //     that never set the global indexed with -1 and handed `buyUpgrade`
    //     an undefined tower. It now upgrades its own argument.
    // 261 on 2026-08-27, from 225: THIRTY-SIX tests added and four existing
    // assertions moved, all in the Normal-difficulty change.
    //
    // Three new groups -- "the Herald", "the Sapper", "the Volatile" -- one per
    // mechanic, driven through the real entry points (supportAllies,
    // attackTowers, resolveAttack, Hazards.update and the game's own update())
    // rather than against the data. Plus "the three new types are DATA, not
    // branches", which READS EVERY FILE under js/ and fails on any comparison
    // against the strings "herald", "sapper" or "volatile" -- the rule
    // js/enemy.js opens by stating, and the one three types at once would
    // break quietly. Plus the index cards for all three and the Difficulties
    // tab's schedule preview.
    //
    // FOUR ASSERTIONS MOVED, and each is the feature rather than a drift:
    //   - `attack` is now ["angry", "sapper"] and `support` gains "herald".
    //     Those lists exist to be UPDATED deliberately; growing by accident is
    //     what they catch.
    //   - the normal's "highest campaign HP" is 36, not 30. The ceiling is
    //     taken across every authored schedule now, because it is a claim about
    //     the game and not about one difficulty.
    //   - the Colossus and the Fractal ladder are stated per difficulty.
    //   - "the number keys pick a route too" became "…and then a difficulty":
    //     the chooser is two beats now, and the keyboard reaches both.
    // 268 on 2026-08-27, from 263: the Volatile's dive.
    //
    // FIVE tests added under "the Volatile" -- the dive itself, its 120 u.l.
    // edge from both sides, the dive-as-death (bounty, kill credit, and the
    // charge armed ON the tower it landed on), the shot-down case that proves
    // killing one early still costs the board nothing, and the blub it must
    // not dive into. All driven through attackTowers/resolveAttack and the
    // game's own update() rather than against the data, like the group they
    // join.
    //
    // FOUR ASSERTIONS MOVED, each the feature rather than a drift:
    //   - `attack` is now ["angry", "sapper", "volatile"]. That list exists to
    //     be UPDATED deliberately, which is what this is.
    //   - the blast radius is 120 u.l., not 45, in the numbers test, the
    //     radius test (renamed with it) and the index card.
    // 269 on 2026-08-27, from 268: the Volatile retune (8 HP, x1.5, 75 u.l.
    // dive, 60 u.l. blast, 13 damage).
    //
    // ONE test added -- "a tower can be inside the dive and outside the
    // blast". The dive and the blast used to be one number and the old suite
    // asserted they were EQUAL; they are now deliberately different, and the
    // gap between them is what the retune sold the player, so it gets a test
    // of its own rather than living only in the two edge cases.
    //
    // Every other Volatile assertion moved with the numbers, and one changed
    // in kind: "no other ground type walks as fast" would have been FALSE (a
    // Fast is 1.75), so it is now "it closes far faster than anything else
    // that acts on towers", derived from the roster rather than typed.
    // 271 on 2026-08-27, from 269: every Volatile group moved to the tail of
    // its wave ("in every wave there are volatiles, make them come out last").
    //
    // TWO tests added, and the first is the rule itself rather than the three
    // waves that satisfy it today: it walks every schedule in DIFFICULTIES and
    // fails if any wave's first Volatile leaves before another group has
    // FINISHED arriving. It counts the waves it checked (3) so it cannot pass
    // by finding no Volatiles at all -- verified by mutation, putting wave 20's
    // first pulse back at 1.5 s and watching it fail by name. The second pins
    // the ceiling margin, because moving six groups to the tail of their waves
    // is exactly the edit that pushes a last spawn past `duration`.
    //
    // 281 on 2026-08-27, from 271: the enemy sidebar, and the trait list under
    // it. TEN tests, and the shape of them is the point -- one asserts the
    // panel exists, and the other nine pin the seam it created. `Enemy.
    // traitsOf` is now the ONE list of what is distinctive about a type, read
    // by the sidebar (every row) and by the index's badge line (the first row
    // carrying a badge), so the pair that matters most walks all fourteen badge
    // strings by TYPE -- a reordered roster cannot quietly reassign one -- and
    // walks all twenty-four types checking no detail sentence ends in a
    // doubled full stop, which is a real defect this found ("within 47.5 u.l..",
    // on every attacking type, from appending a stop to a unit that ends in
    // one). One more measures every type's panel against the build bar, which
    // is the enemy-side twin of the sandbox smoke test's panel-headroom check.
    // 282 on 2026-08-28, from 281: ONE test ADDED, "the index explains the
    // Dinomech, and it is 45 000 and nothing else" -- the twenty-fifth type,
    // and the one whose card is mostly a list of blocks it does NOT carry.
    // Assertions were also added inside four existing tests (the banner list,
    // the trait rows, the badge map and the derived wave appearances), which
    // move no count and are the reason the totals are a cross-check here and
    // never the gate.
    file: "tests/content.test.js", pass: 282, fail: 0,
    failing: []
  },
  {
    // 72, not 71: one test was ADDED on 2026-08-12. Repairing the B5 gate to
    // read stunSeconds from the config left the SHIPPED 7 pinned nowhere at
    // all -- the sibling test passes its own 10 to the mechanism -- so the
    // ability could have been retuned to any value with every suite still
    // green. The new test pins the owner's stated intent instead: channel plus
    // stun still costs ten seconds between them.
    file: "tests/long-range-dps.test.js", pass: 72, fail: 0,
    failing: []
  },
  { file: "tests/beam.test.js", pass: 45, fail: 0, failing: [] },
  { file: "tests/blub.test.js", pass: 53, fail: 0, failing: [] },
  {
    // sandbox.smoke.js reports "N FAILED" and no pass count of its own, so its
    // pass column is blank by design rather than unmeasured.
    //
    // Was 2 failing. Repaired 2026-08-12 along with the rest of the B5 group.
    // Repairing the second one also required teaching this file's canvas stub
    // what a gradient is: resolving the channel is what first drives a
    // gradient-building draw path here, and without the stub the suite ABORTS
    // rather than fails -- which would have read as an improvement.
    file: "tests/sandbox.smoke.js", pass: null, fail: 0,
    failing: []
  }
];

function run(file) {
  var out;
  try {
    out = cp.execSync("node " + JSON.stringify(file), {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (e) {
    // A suite with failures exits non-zero; that is expected here, and its
    // output is still the thing we need to read.
    out = (e.stdout || "") + (e.stderr || "");
  }

  var names = [];
  out.split(/\r?\n/).forEach(function (line) {
    var hit = FAIL_LINE.exec(line);
    if (hit) names.push(hit[1]);
  });

  var m = /(\d+) passed, (\d+) failed/.exec(out);
  if (m) return { pass: +m[1], fail: +m[2], failing: names };
  var f = /(\d+)\s+FAILED/.exec(out) || /(\d+)\s+failures/.exec(out);
  if (f) return { pass: null, fail: +f[1], failing: names };
  // A suite that passes clean may print no summary of either shape.
  if (/SANDBOX SMOKE TEST PASSED/.test(out)) return { pass: null, fail: 0, failing: names };
  return { pass: null, fail: null, failing: names, unreadable: true, tail: out.slice(-400) };
}

function missingFrom(a, b) {
  var have = {};
  b.forEach(function (n) { have[n] = true; });
  return a.filter(function (n) { return !have[n]; });
}

function quote(s) { return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }

var results = BASELINE.map(function (b) { return { b: b, r: run(b.file) }; });

// --names: print what the suites actually do right now, in the shape of the
// BASELINE literal above, so tightening it is a paste rather than a retype.
if (process.argv.indexOf("--names") !== -1) {
  results.forEach(function (x) {
    console.log("  // " + x.b.file + "  " +
      (x.r.pass === null ? "-" : x.r.pass) + " pass / " + x.r.fail + " fail");
    console.log("  failing: [");
    console.log(x.r.failing.map(function (n) { return "    " + quote(n); }).join(",\n"));
    console.log("  ],");
  });
  return;
}

var bad = 0, better = 0;
console.log("suite                          measured        baseline");
console.log("--------------------------------------------------------");

results.forEach(function (x) {
  var b = x.b, r = x.r;
  var name = b.file.replace("tests/", "");

  if (r.unreadable) {
    console.log(name.padEnd(30) + "NO SUMMARY LINE -- suite did not report");
    console.log("  tail: " + r.tail.replace(/\n/g, "\n  "));
    bad++;
    return;
  }

  var shown = (r.pass === null ? "-" : r.pass) + " / " + r.fail;
  var want = (b.pass === null ? "-" : b.pass) + " / " + b.fail;
  var notes = [];

  // The parse cross-check, before anything is concluded from the names.
  if (r.failing.length !== r.fail) {
    notes.push("  <-- PARSE BROKEN: scraped " + r.failing.length +
               " FAIL line(s) but the suite reported " + r.fail +
               ". The name diff below is not trustworthy; fix FAIL_LINE.");
    bad++;
  }

  var appeared = missingFrom(r.failing, b.failing);
  var cleared = missingFrom(b.failing, r.failing);

  if (appeared.length) {
    notes.push("  <-- REGRESSION: " + appeared.length + " NEW failing name(s)");
    bad++;
  }
  if (cleared.length) {
    notes.push("  <-- IMPROVED: " + cleared.length + " name(s) no longer failing");
    better++;
  }
  if (b.pass !== null && r.pass !== null && r.pass < b.pass && !appeared.length) {
    notes.push("  <-- REGRESSION: " + (b.pass - r.pass) +
               " test(s) disappeared without failing");
    bad++;
  }

  console.log(name.padEnd(30) + shown.padEnd(16) + want + (notes.length ? notes[0] : ""));
  notes.slice(1).forEach(function (n) { console.log("".padEnd(46) + n.replace(/^\s+/, "")); });
  appeared.forEach(function (n) { console.log("      NEW  " + n); });
  cleared.forEach(function (n) { console.log("      GONE " + n); });
});

// THE SUITES CANNOT SEE THE WHOLE TREE, so the gate does not stop at them.
// `tests/harness.js` takes its script list out of `index.html`, which means a
// file with no <script> tag is never executed by any suite: it cannot throw,
// cannot fail, and cannot appear in any count above. Every number on this page
// stays identical whether such a file is correct, broken or deleted. Added
// 2026-08-13 after a boss shipped with a model no page loaded and all six
// suites stayed green. See tools/check-script-manifest.js for the full story.
console.log("");
var manifest = cp.spawnSync("node",
  [path.join(ROOT, "tools", "check-script-manifest.js")],
  { cwd: ROOT, encoding: "utf8" });
console.log((manifest.stdout || "").replace(/\n+$/, ""));
if (manifest.stderr) console.log(manifest.stderr.replace(/\n+$/, ""));
if (manifest.status !== 0) {
  console.log("  <-- MANIFEST: a js file is loaded by no page, or a page asks");
  console.log("      for a file that is not there. No suite can catch either.");
  bad++;
}

console.log("");
if (bad) {
  console.log(bad + " problem(s) against the measured baseline. A NEW name is a");
  console.log("regression even when the total did not move -- that is the point.");
  process.exit(1);
}
if (better) {
  console.log(better + " suite(s) improved. Regenerate BASELINE with");
  console.log("`node tools/ci-check.js --names` in the commit that earned it.");
}
console.log("No new failing names.");
