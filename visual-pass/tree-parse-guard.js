// Is the working tree in a state where a measurement means anything?
//
//     node visual-pass/tree-parse-guard.js          check, exit 1 if not
//     node visual-pass/tree-parse-guard.js --quiet  same, only speaks on failure
//
// WHY THIS EXISTS, and it is a race rather than a mistake. `tests/harness.js`
// loads every js/ file the page names into ONE context. So a single half-saved
// file that is momentarily unparseable takes ALL SIX SUITES TO ZERO -- vera
// measured `0 passed, 212 failed` off a `js/gl/gl-world.js` that was mid-write
// in the working tree while HEAD's committed copy parsed fine. Minutes later
// the identical command returned 107/0 and 207/5.
//
// THREE PROPERTIES THAT MAKE IT DANGEROUS RATHER THAN ANNOYING:
//
//   1. It is TRANSIENT BY CONSTRUCTION -- the person editing is seconds from
//      done -- so it is at its worst in an unattended batch run, which is
//      exactly what a six-model measurement pass is.
//   2. It is INVISIBLE TO A NULL-MODEL CONTROL. Our separation rig proves the
//      tree did not move by requiring unchanged model pairs to come back
//      bit-identical. That catches an edit under js/gl/ because the bodies
//      change underneath. It CANNOT catch this one: the file never rendered,
//      it failed to parse.
//   3. It is NOT CONFINED TO js/gl/. Any js/ file any division is editing can
//      zero your batch.
//
// The tell, so a total wipe is never filed as a catastrophe again: A REAL
// REGRESSION FAILS A READABLE SUBSET. A total wipe with an unfamiliar spread
// means the harness never booted.
//
// This converts a silent zero into a refusal. Run it BEFORE a batch and AGAIN
// after -- before only proves the tree was clean at the start, and the whole
// hazard is that someone else finishes a save in the middle.

var cp = require("child_process");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var quiet = process.argv.indexOf("--quiet") >= 0;

function sh(cmd) {
  return cp.execSync(cmd, { cwd: ROOT, encoding: "utf8" });
}

// Dirty AND untracked, because a brand-new half-written file is the same
// hazard as a half-written edit -- and six new model files is precisely what
// this batch is adding.
var status;
try {
  status = sh("git status --porcelain --untracked-files=all");
} catch (e) {
  console.error("tree-parse-guard: git status failed -- " + e.message);
  process.exit(1);
}

var files = status.split("\n")
  .map(function (line) { return line.slice(3).trim(); })
  .filter(function (f) { return f && /\.js$/.test(f); })
  // A rename shows as "old -> new"; only the new path exists on disk.
  .map(function (f) {
    var arrow = f.indexOf(" -> ");
    return arrow >= 0 ? f.slice(arrow + 4) : f;
  })
  // Deleted files are not on disk and are not a parse hazard.
  .filter(function (f) {
    try { require("fs").statSync(path.join(ROOT, f)); return true; }
    catch (e) { return false; }
  });

var bad = [];
files.forEach(function (f) {
  try {
    cp.execSync("node --check \"" + f + "\"", { cwd: ROOT, stdio: "pipe" });
  } catch (e) {
    var msg = (e.stderr || "").toString().split("\n").filter(function (l) {
      return /SyntaxError|\^/.test(l);
    })[0] || "unparseable";
    bad.push({ file: f, error: msg.trim() });
  }
});

if (bad.length) {
  console.error("TREE PARSE GUARD: REFUSING TO MEASURE.");
  console.error("");
  console.error(bad.length + " dirty js file(s) do not parse. Another session");
  console.error("is mid-write. Any suite or pixel number taken now is not");
  console.error("attributable -- the harness loads every js/ file into one");
  console.error("context, so one broken file zeroes all six suites.");
  console.error("");
  bad.forEach(function (b) {
    console.error("  " + b.file + "\n      " + b.error);
  });
  console.error("");
  console.error("Wait and re-run. This is transient by construction.");
  process.exit(1);
}

if (!quiet) {
  console.log("tree-parse-guard: OK -- " + files.length +
    " dirty js file(s), all parse.");
  if (files.length) console.log("  " + files.join("\n  "));
}
process.exit(0);
