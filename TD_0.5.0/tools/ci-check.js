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
    file: "tests/run.js", pass: 107, fail: 0,
    // Was 105/3. The three Arcane-Sniper names were repaired on 2026-08-12:
    // the ability is channelled and these fixtures never stepped the clock.
    failing: []
  },
  {
    file: "tests/content.test.js", pass: 207, fail: 5,
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
    // What is LEFT, and none of it is drift:
    //   - `after the roar it alternates ...` is left RED deliberately. Its two
    //     setup faults are fixed; what remains is behavioural and belongs to
    //     vera. It infers the fired attack from `attacks[prev % length]`, but
    //     js/enemy.js skips an attack with no target and advances the index by
    //     more than one, so that inference is invalid -- and observing what
    //     actually fires shows aimed, aimed, aimed and never a leap.
    //   - `the roar ...` carries the 601/610 trap: :601 reads a key the TYPE
    //     row has never had, and repairing it exposes :610 underneath.
    //   - `the Tyrant's numbers ...` is the plain stale-retune repair; nadia
    //     ruled the CODE canonical -- shield 1000, leap 90 u.l., 9 s post-roar,
    //     roar summon 40 bodies. Do not "fix" these towards the test.
    //   - two `towers[-1]` throws, which are fixture bugs of their own.
    failing: [
      "the Tyrant's numbers are the ones that were asked for",
      "the roar shields it, speeds it up, and calls the wave back",
      "after the roar it alternates shot and leap, and still attacks rarely",
      "B4 pierces DEFENCE in flat percentage points, never below zero",
      "path B answers a brute with damage, not with pierce"
    ]
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
