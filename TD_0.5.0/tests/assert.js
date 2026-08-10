// ---------------------------------------------------------------------------
// A very small test runner. No dependencies, no install.
//
//   node tests/run.js
//
// Exits non-zero if anything fails, so it can gate a commit later if wanted.
// ---------------------------------------------------------------------------

var groups = [];
var current = null;
var passed = 0;
var failures = [];

function group(name) {
  current = { name: name, tests: [] };
  groups.push(current);
}

function test(name, fn) {
  if (!current) group("");
  current.tests.push({ name: name, fn: fn });
}

// Assertions available inside a test, as `t`.
function makeAsserts(record) {
  return {
    eq: function (actual, expected, label) {
      var ok = Object.is(actual, expected);
      record(ok, label, expected, actual);
    },
    near: function (actual, expected, tolerance, label) {
      var ok = Math.abs(actual - expected) <= tolerance;
      record(ok, label, expected + " +/-" + tolerance, actual);
    },
    ok: function (value, label) {
      record(!!value, label, "truthy", value);
    },
    notOk: function (value, label) {
      record(!value, label, "falsy", value);
    },
    // Deliberately shallow -- everything compared here is numbers and strings.
    deep: function (actual, expected, label) {
      var a = JSON.stringify(actual);
      var b = JSON.stringify(expected);
      record(a === b, label, b, a);
    }
  };
}

function run() {
  console.log("\nTower Defense test suite\n");

  groups.forEach(function (g) {
    if (g.name) console.log("  " + g.name);

    g.tests.forEach(function (t) {
      var problems = [];
      var asserts = makeAsserts(function (ok, label, expected, actual) {
        if (ok) return;
        problems.push("        " + label +
          "\n          expected: " + expected +
          "\n          actual:   " + actual);
      });

      try {
        t.fn(asserts);
      } catch (err) {
        problems.push("        threw: " + (err && err.stack ? err.stack : err));
      }

      if (problems.length === 0) {
        passed++;
        console.log("    ok   " + t.name);
      } else {
        failures.push(t.name);
        console.log("    FAIL " + t.name);
        problems.forEach(function (p) { console.log(p); });
      }
    });

    console.log("");
  });

  console.log(passed + " passed, " + failures.length + " failed\n");
  if (failures.length > 0) process.exit(1);
}

module.exports = { group: group, test: test, run: run };
