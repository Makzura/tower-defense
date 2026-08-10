// ---------------------------------------------------------------------------
// CI gate: run every suite and compare against the MEASURED baseline.
//
//   node tools/ci-check.js
//
// WHY THIS IS NOT JUST "npm test" WITH A ZERO-EXIT RULE. This project ships
// with known failures and says so in AGENTS.md: a wave-schedule assertion, some
// stale fixtures, a `w()` helper that only exists in run.js, and one
// Arcane-Sniper B5 timing drift that predates the checkout. Requiring exit 0
// would paint CI permanently red and teach everyone to ignore it, which is
// worse than having none.
//
// So the gate is REGRESSION, not perfection:
//   * failures going UP   -> fail the build
//   * passes going DOWN   -> fail the build
//   * failures going DOWN or passes going UP -> pass, and say so loudly, so the
//     baseline below can be tightened in the same commit that earned it
//
// The numbers are MEASURED, not copied from the docs. AGENTS.md still records
// blub.test at 47 passing; it is 53. A baseline transcribed from prose is a
// baseline that drifts, which is the failure this file exists to catch.
// ---------------------------------------------------------------------------

var cp = require("child_process");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");

var BASELINE = [
  { file: "tests/run.js",                pass: 105, fail: 3  },
  { file: "tests/content.test.js",       pass: 182, fail: 30 },
  { file: "tests/long-range-dps.test.js", pass: 70, fail: 1  },
  { file: "tests/beam.test.js",           pass: 45, fail: 0  },
  { file: "tests/blub.test.js",           pass: 53, fail: 0  },
  // sandbox.smoke.js reports "N FAILED" and no pass count of its own.
  { file: "tests/sandbox.smoke.js",      pass: null, fail: 2 }
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
  var m = /(\d+) passed, (\d+) failed/.exec(out);
  if (m) return { pass: +m[1], fail: +m[2] };
  var f = /(\d+)\s+FAILED/.exec(out) || /(\d+)\s+failures/.exec(out);
  if (f) return { pass: null, fail: +f[1] };
  return { pass: null, fail: null, unreadable: true, tail: out.slice(-400) };
}

var bad = 0, better = 0;
console.log("suite                          measured        baseline");
console.log("--------------------------------------------------------");

BASELINE.forEach(function (b) {
  var r = run(b.file);
  var name = b.file.replace("tests/", "");

  if (r.unreadable) {
    console.log(name.padEnd(30) + "NO SUMMARY LINE -- suite did not report");
    console.log("  tail: " + r.tail.replace(/\n/g, "\n  "));
    bad++;
    return;
  }

  var shown = (r.pass === null ? "-" : r.pass) + " / " + r.fail;
  var want = (b.pass === null ? "-" : b.pass) + " / " + b.fail;
  var note = "";

  if (r.fail > b.fail) { note = "  <-- REGRESSION: " + (r.fail - b.fail) + " new failure(s)"; bad++; }
  else if (b.pass !== null && r.pass !== null && r.pass < b.pass) {
    note = "  <-- REGRESSION: " + (b.pass - r.pass) + " test(s) disappeared"; bad++;
  } else if (r.fail < b.fail || (b.pass !== null && r.pass !== null && r.pass > b.pass)) {
    note = "  <-- IMPROVED, tighten the baseline"; better++;
  }

  console.log(name.padEnd(30) + shown.padEnd(16) + want + note);
});

console.log("");
if (bad) {
  console.log(bad + " suite(s) regressed against the measured baseline.");
  process.exit(1);
}
if (better) {
  console.log(better + " suite(s) improved. Update BASELINE in tools/ci-check.js" +
              " in the commit that earned it.");
}
console.log("No regressions.");
