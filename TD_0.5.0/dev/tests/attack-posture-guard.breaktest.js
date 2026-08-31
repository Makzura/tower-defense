// ---------------------------------------------------------------------------
// Break-test for Enemy.assertAttackPostureBudget (js/enemy.js).
//
//   node tests/attack-posture-guard.breaktest.js
//
// Not one of the six suites. Those prove the GAME behaves; this proves the
// GUARD itself is load-bearing rather than decorative -- that removing its
// enforcement is something a boot can actually detect, not a comparison
// nobody ever exercises. A guard that "looks present" in a code review and a
// guard that fires are not the same claim, and the only way to tell them
// apart is to break it on purpose and watch for the difference.
//
// METHOD: mutate the guard's own condition -- a UNIQUE FULL EXPRESSION,
// never a number, because a numeric tweak (say, loosening 1.6 to 1.7) can
// pass by accident if the test spec was chosen generously; replacing the
// whole boolean with `false` cannot pass by accident, it can only ever pass
// because the guard no longer runs at all. Then boot a spec engineered to
// violate the invariant against BOTH the real source and the mutant, in
// separate child processes, and read each process's OWN exit code --
// `spawnSync(...).status`, never a shell pipe's, which reports whichever
// command is LAST in the pipeline and would happily report success for a
// process that crashed but got piped through something that did not.
//
// A mutant that passes and a mutation that silently never applied look
// identical from a passing test's output alone, so this asserts the
// replacement count before ever spawning anything.
// ---------------------------------------------------------------------------

var fs = require("fs");
var path = require("path");
var os = require("os");
var childProcess = require("child_process");

var ROOT = path.join(__dirname, "..", "..", "jeu");
var ENEMY_JS = path.join(ROOT, "js", "enemy.js");

// The guard's own condition, verbatim out of js/enemy.js. A full expression,
// not a magic number, so mutating it disables the check rather than merely
// relabelling the threshold.
var GUARD_EXPRESSION = "if (!(worst < spec.intervalSeconds)) {";
var MUTANT_EXPRESSION = "if (false) {";

var failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

var originalSource = fs.readFileSync(ENEMY_JS, "utf8");

var occurrences = originalSource.split(GUARD_EXPRESSION).length - 1;
check(occurrences === 1,
  "expected the guard expression to appear exactly once in js/enemy.js, found " +
  occurrences + " -- either it moved/was reworded (update GUARD_EXPRESSION) " +
  "or something duplicated it");

var mutantSource = originalSource.split(GUARD_EXPRESSION).join(MUTANT_EXPRESSION);
var mutationApplied = mutantSource !== originalSource &&
  mutantSource.indexOf(MUTANT_EXPRESSION) !== -1 &&
  mutantSource.indexOf(GUARD_EXPRESSION) === -1;
check(mutationApplied,
  "the string replace did not change the source -- a mutation that never " +
  "happened, which would make the control and treatment runs identical and " +
  "prove nothing");

// Bail out now if the mutation itself is not trustworthy: running the rest
// against a mutant that is not actually mutated would produce a passing
// break-test for the wrong reason.
if (failures.length) {
  console.log("attack-posture-guard break-test: SETUP FAILED");
  failures.forEach(function (f) { console.log("  - " + f); });
  process.exit(1);
}

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "attack-posture-guard-"));
var originalCopy = path.join(tmpDir, "enemy.original.js");
var mutantCopy = path.join(tmpDir, "enemy.mutant.js");
fs.writeFileSync(originalCopy, originalSource);
fs.writeFileSync(mutantCopy, mutantSource);

// The driver: loads ONE enemy.js (control or mutant) into an isolated VM
// context -- exactly as tests/harness.js loads every game file, just this
// one file alone, since the guard's IIFE only touches Enemy.TYPES and
// Enemy.attacksOf, both self-contained -- then calls the guard directly
// against a spec engineered to violate it: a facesTarget attack whose
// interval (1.0 s) sits well under its own worst-case stopped time (1.6 s
// at the shipped turn rate and strike window). Exit 1 if the guard threw
// (enforcing), exit 0 if it did not (silent).
var DRIVER = [
  "var vm = require('vm');",
  "var fs = require('fs');",
  "var sandbox = { console: console };",
  "vm.createContext(sandbox);",
  "vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), sandbox, { filename: 'enemy.js' });",
  "var Enemy = sandbox.Enemy;",
  "var badSpec = { facesTarget: true, intervalSeconds: 1.0 };",
  "try {",
  "  Enemy.assertAttackPostureBudget(badSpec, 'breaktest[0]');",
  "  process.exit(0);",
  "} catch (e) {",
  "  process.exit(1);",
  "}"
].join("\n");
var driverPath = path.join(tmpDir, "driver.js");
fs.writeFileSync(driverPath, DRIVER);

// A second driver for the fine case: a spec whose interval comfortably
// clears the worst case (2.0 s vs 1.6 s), which must never throw on EITHER
// copy -- catches an over-eager mutation that throws unconditionally instead
// of never, which would otherwise look like "the guard still works".
var DRIVER_FINE = DRIVER.replace(
  "var badSpec = { facesTarget: true, intervalSeconds: 1.0 };",
  "var badSpec = { facesTarget: true, intervalSeconds: 2.0 };"
);
var driverFinePath = path.join(tmpDir, "driver-fine.js");
fs.writeFileSync(driverFinePath, DRIVER_FINE);

function runDriver(driverFile, enemyFile) {
  // spawnSync, and .status read directly off the result -- never a shell
  // string, never a pipe. A pipe's exit code is the LAST command's, which
  // for `node x.js | something` is "something"'s, not the process actually
  // under test.
  var result = childProcess.spawnSync(process.execPath, [driverFile, enemyFile],
    { encoding: "utf8" });
  return result.status;
}

var originalOnBad = runDriver(driverPath, originalCopy);
var mutantOnBad = runDriver(driverPath, mutantCopy);
var originalOnFine = runDriver(driverFinePath, originalCopy);
var mutantOnFine = runDriver(driverFinePath, mutantCopy);

check(originalOnBad === 1,
  "the REAL guard did not throw for a spec whose worst case (1.6s) exceeds " +
  "its interval (1.0s) -- exit code was " + originalOnBad + ", expected 1");
check(mutantOnBad === 0,
  "the MUTANT guard (condition replaced with `false`) threw anyway for the " +
  "same bad spec -- exit code was " + mutantOnBad + ", expected 0. Either " +
  "the mutation did not really disable the check, or something else in " +
  "the file throws first");
check(originalOnFine === 0,
  "the REAL guard threw for a spec that comfortably clears its budget -- " +
  "exit code was " + originalOnFine + ", expected 0 (false positive)");
check(mutantOnFine === 0,
  "the MUTANT guard threw for a spec that comfortably clears its budget -- " +
  "exit code was " + mutantOnFine + ", expected 0");

fs.rmSync(tmpDir, { recursive: true, force: true });

if (failures.length) {
  console.log("attack-posture-guard break-test: FAILED");
  failures.forEach(function (f) { console.log("  - " + f); });
  process.exit(1);
}

console.log("attack-posture-guard break-test: PASSED");
console.log("  guard expression occurrences in js/enemy.js: " + occurrences);
console.log("  original / bad spec  (want throw, exit 1):    " + originalOnBad);
console.log("  mutant   / bad spec  (want silent, exit 0):   " + mutantOnBad);
console.log("  original / fine spec (want silent, exit 0):   " + originalOnFine);
console.log("  mutant   / fine spec (want silent, exit 0):   " + mutantOnFine);
process.exit(0);
