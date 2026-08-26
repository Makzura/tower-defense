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
    // 112 on 2026-08-26, from 108: FOUR tests added with the Vanguard's import.
    // Each one pins a failure that draws a plausible picture rather than
    // throwing -- a band that is never selected (the boss walks, in the wrong
    // gait), a variant flag that latches (the boss stays in pieces for the rest
    // of the run), a reform that finishes at the wrong moment, and a shield
    // fragment welded into the torso. Self-tested by mutation: emptying
    // `ENEMY_GAIT_BAND` and dropping the `shieldOut = false` line in
    // `grantShield` turns three of them red; dropping `model.positions` in
    // gl-models turns the fourth red. Green again on restore.
    file: "tests/run.js", pass: 112, fail: 0,
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
    file: "tests/content.test.js", pass: 219, fail: 0,
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
