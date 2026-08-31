// ---------------------------------------------------------------------------
// MANIFEST GATE: every js file on disk is loaded by a page, and every page tag
// points at a file that exists.
//
//   node tools/check-script-manifest.js           check this checkout
//   node tools/check-script-manifest.js <root>    check another TD_0.5.0 root
//
// WHY THIS EXISTS, AND WHY NO SUITE COULD EVER REPLACE IT. `tests/harness.js`
// takes its script list out of `index.html`. A file with no <script> tag is
// therefore never EXECUTED by any suite -- it cannot throw, cannot fail, cannot
// appear in a count, and every suite stays green whether it is correct, broken
// or deleted. "The suites pass" is not evidence that a new file loads. The
// suites cannot see the hole, because the hole is in the thing that tells the
// suites what to look at.
//
// 2026-08-13 is what prompted it: the Vanguard boss shipped with a model file
// that no page loaded AND that was untracked in git. The type was wired
// everywhere else -- js/enemy.js, js/game.js, tests/content.test.js and
// tests/run.js all referenced it -- so the boss was scheduled, tested and
// green, with nothing reaching the renderer. Two people found the unwired half
// by hand within minutes of each other. Nobody's instrument found it, because
// nobody had one. Kaz's judgement on where it belongs, and he is right: the
// failure is "a division shipped an asset and forgot to wire it", which is
// exactly the thing a division cannot be trusted to check about itself.
//
// The check is a set difference in both directions, and BOTH directions matter:
//   * tagged but missing from disk -> the page 404s. Loud, and always a bug.
//   * on disk but tagged by no page -> silent. This is the one that ships.
//
// Run against `index.html` AND `sandbox.html` together, because loading from
// `sandbox.html` alone is a deliberate documented pattern (AGENTS.md: it keeps
// a testing aid out of the shipping page and out of the harness at the same
// time). A file in either page is wired.
// ---------------------------------------------------------------------------

// THE THIRD LEG, added 2026-08-14 after the first two were not enough.
// Vera found two commits on this branch that NO CLONE CAN BOOT: `d828769` and
// `181119c` both tag `js/gl/models/enemy-boss.js` in index.html, and the file
// was not committed until `de30b50`, two commits later. `tests/harness.js`
// readFileSync's every entry in the page's script list, so at those commits
// every suite dies in boot() before its first assertion -- run 1/106,
// content 0/212, blub 0/53. She lost time thinking a comment-only change had
// broken 371 tests.
//
// The first version of this file compared the page tags against FILES ON DISK,
// which cannot see this: the model was on disk the whole time, merely
// untracked. **The author's own working tree is always green.** That is the
// property that makes this class of defect invisible from the machine that
// creates it and breaks everybody else -- the opposite blast radius from the
// unwired case, which only hurts the author's own feature.
//
// So a tag whose target is UNTRACKED is exactly as broken as a tag whose
// target is MISSING, and strictly harder to notice. Same failure, three
// sources of truth: the page, the filesystem, and the index.
// ---------------------------------------------------------------------------

var fs = require("fs");
var path = require("path");
var cp = require("child_process");

// TWO GATES, NOT ONE, and they answer different questions. Kaz's distinction
// and he is right to insist on it:
//
//   PROSPECTIVE (default) -- "is what I am about to commit self-consistent?"
//     Reads the working tree. Catches the mistake BEFORE it lands, which is
//     worth more than proving it afterwards, so this is the one that runs in
//     the gate.
//
//   RETROSPECTIVE (--rev <sha>) -- "is this branch bootable at that point?"
//     Reads the page and the file list straight out of git objects. No
//     checkout, no extraction, no disk: a rig filled this machine to zero free
//     earlier in the week by extracting the repo once per run.
//
// The second exists because of the blind spot in how the first was tested. It
// was self-tested against a throwaway repo I built myself, and material you
// build yourself is shaped by the same assumptions as the code it is testing.
// This branch already contains a real known-bad and a real known-good --
// `d828769` must FAIL and `de30b50` must PASS -- which is a control on real
// geometry, for free. A gate shown only to work on its author's own fixtures
// has not been shown to work.
var argv = process.argv.slice(2);
var REV = null;
var rootArg = null;
for (var ai = 0; ai < argv.length; ai++) {
  if (argv[ai] === "--rev") { REV = argv[++ai]; continue; }
  if (!rootArg) rootArg = argv[ai];
}

var ROOT = rootArg ? path.resolve(rootArg) : path.resolve(__dirname, "..", "..", "jeu");

// THE PAGE LIST IS DERIVED, AND IT WAS HARDCODED FOR ONE DAY -- long enough to
// produce a false accusation, which is why this comment is long.
//
// The first version of this file said `["index.html", "sandbox.html"]`. At the
// time there were FIVE pages: those two plus `3d.html`,
// `long-range-dps-debug.html` and `dressing.html`. So the check reported
// `js/gl/gl-dressing.js` as loaded by nothing, and I escalated it to the GL
// engineer as an orphan at risk of a clean checkout. It was loaded by
// `dressing.html`, its own instrument page, sitting untracked beside it. The
// correct finding was the pair being untracked -- which the git leg says by
// itself, without help.
//
// Both files were deleted with the map surround on 2026-08-14, so the page
// count is now four and the example cannot be reproduced. The lesson is kept
// because it is about the SHAPE of the defect, not about those two files.
//
// **A HARDCODED POPULATION INSIDE A CHECK IS THE SAME DEFECT THE CHECK EXISTS
// TO CATCH.** The gate's whole purpose is "the set on disk must equal the set
// declared", and it was itself asserting that against a hand-written list that
// had already gone stale. Two other gates in this repo failed the same way in
// the same week -- `check_group_gait.py` hardcoded ten bodies, and its
// replacement derivation selected on `import` where the property that mattered
// was `call`. Derive the population, print it, and never let a literal stand in
// for it.
function derivePages() {
  if (REV !== null) {
    var out;
    try {
      out = cp.execSync("git ls-tree --name-only " + JSON.stringify(REV) + " -- .", {
        cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
      });
    } catch (e) {
      return [];
    }
    return out.split(/\r?\n/).filter(function (n) { return /\.html$/.test(n); })
      .map(function (n) { return n.replace(/^.*\//, ""); }).sort();
  }
  try {
    return fs.readdirSync(ROOT).filter(function (n) {
      return /\.html$/.test(n) && fs.statSync(path.join(ROOT, n)).isFile();
    }).sort();
  } catch (e) {
    return [];
  }
}

// Where ROOT sits inside the repo, e.g. "TD_0.5.0/". The game is one level down
// from the git root, so every path in a git object carries that prefix.
function repoPrefix() {
  try {
    return cp.execSync("git rev-parse --show-prefix", {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch (e) {
    return null;
  }
}

function gitShow(rev, file) {
  try {
    return cp.execSync("git show " + JSON.stringify(rev + ":" + file), {
      cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch (e) {
    return null;
  }
}

// Deliberate and permanent. Each entry states why, because an allowlist without
// reasons becomes a place to hide things.
var ALLOWED = {
  "js/systems/targeting.js":
    "tombstone. The file is comments only and says so: the global moved to " +
    "js/systems/range-filter.js in v0.3.5 and it survives only because it " +
    "could not be deleted on the machine it was written on.",
  "js/skins/example-pack.js":
    "a template, not game code. tools/check-constraints.js reads it as the " +
    "worked example of the skin-pack shape.",
  // NOTE: js/scene/long-range-dps-scene.js used to sit here, with the reason
  // "loaded directly by a node entry point rather than a page". **That reason
  // was false** -- `long-range-dps-debug.html` loads it, and the check could
  // not see that page because the page list was hardcoded. The entry was right
  // by accident and wrong on the record, which is the worse half: a comment
  // that misdescribes WHY an exception is an exception outlives the problem,
  // and the next reader preserves it for the stated reason. Removed rather
  // than reworded, because with the pages derived it is simply wired.
};

// PRE-EXISTING and NOT deliberate -- a dated ledger, printed loudly every run
// but not failing the build, on the same principle as the failing-name baseline
// in ci-check.js: the gate is REGRESSION, not perfection. Arming a new check
// that instantly reddens the board on somebody else's old defect teaches
// everyone to ignore the check.
//
// EVERY ONE OF THESE IS A REAL DEFECT. Do not "fix" one by moving it up into
// ALLOWED; either wire it or delete it, and take the entry out when you do.
// Each entry carries a HEADER-VERIFIED field, because "unloaded" turned out to
// be the lesser problem. Otto surveyed all three on 2026-08-11: every
// integration anchor still exists, but the line numbers in their headers are
// 100-180 lines out, and one header's stated BLOCKER has expired. A reader
// deciding from a confidently wrong header decides from fiction -- and decides
// AGAINST wiring, for a reason that is no longer true.
//
// CORRECTED TWICE ON 2026-08-14, and the second correction is the instructive
// one because it was an error INSIDE the first.
//
// FIRST: these entries said blub-hp.js was "referenced by js/gl/blub-summon.js
// which IS loaded", and the same for siphon-ground.js. **Both were comment
// mentions, not code.** `blub-summon.js:46` is prose -- "exactly as
// `js/gl/blub-hp.js` found for the deflation" -- and `siphon-beam-draw.js:753`
// likewise. I grepped a FILENAME and read the hit as a USAGE.
//
// SECOND: the sentence correcting that claimed "no global of the three
// (`BlubHp`, `SiphonEnemyFx`, `SiphonGround`) appears outside its own file".
// **Those three names do not exist.** The real globals are `BlubFXHealth`
// (blub-hp.js:125), `SiphonFXEnemy` (siphon-enemy-fx.js:158) and
// `SiphonFXGround` (siphon-ground.js:102). The invented names appeared in
// exactly one file in the tree -- this comment. So the search could not have
// returned non-zero, and its clean result was guaranteed before it ran: **a
// check that cannot fail, written into the correction of a check that could
// not fail.** Otto caught it.
//
// The two errors are different and the second is worse. The first MISREADS
// WHAT A HIT MEANS; the second NEVER ESTABLISHES THAT A HIT WAS POSSIBLE, and
// it hides because absence looks identical to a clean result.
// **Before believing a zero, prove the search term can return non-zero.**
//
// RE-VERIFIED with the real names, each shown able to find its own file first:
// `BlubFXHealth` 5 hits, `SiphonFXEnemy` 14, `SiphonFXGround` 7 -- every one
// confined to its own module, and `js/gl/gl-world.js`, the only plausible
// caller, names none of them. So the substance always held: three INDEPENDENT
// dead modules, and wiring one buys nothing toward the others.
var KNOWN_UNWIRED = {
  "js/gl/blub-hp.js":
    "742 lines, tracked, loaded by no page, and its global is referenced " +
    "nowhere. HEADER VERIFIED: NO -- its stated blocker is DEAD. The header " +
    "says every blub model has `frames: []` and a single unnamed group; " +
    "blub-blub1.js today has `groups: [{\"name\": \"body\"` and non-empty " +
    "frames. Do not decide against wiring it on that paragraph. Recorded " +
    "unwired 2026-08-12, still unwired 2026-08-14. Owner: rendering (kaz).",
  "js/gl/siphon-enemy-fx.js":
    "791 lines, tracked, loaded by no page, and its global is referenced " +
    "nowhere. HEADER VERIFIED: NO -- anchors exist, line numbers 100-180 out. " +
    "Recorded unwired 2026-08-12, still unwired 2026-08-14. Owner: rendering.",
  "js/gl/siphon-ground.js":
    "1204 lines, tracked, loaded by no page, and its global is referenced " +
    "nowhere. HEADER VERIFIED: NO -- anchors exist, line numbers 100-180 out. " +
    "Recorded unwired 2026-08-12, still unwired 2026-08-14. Owner: rendering."
};

function walk(dir, out) {
  var entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  entries.forEach(function (entry) {
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.js$/.test(entry.name)) {
      out.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  });
  return out;
}

var PREFIX = REV === null ? null : repoPrefix();
var PAGES = derivePages();

// At a REV, "on disk" means "in that commit" -- there is no working tree to
// consult, and that is the point: it is what a person cloning would get.
function listedAtRev(rev) {
  // MIND THE TWO PATH CONVENTIONS, they are not the same and it cost a run:
  // `git show rev:path` resolves REPO-ROOT-relative and fails without the
  // prefix, while `git ls-tree` takes its pathspec RELATIVE TO THE CURRENT
  // DIRECTORY and prints matching paths the same way. So `git show` gets the
  // prefix and `ls-tree` must not have it.
  var out;
  try {
    out = cp.execSync("git ls-tree -r --name-only " + JSON.stringify(rev) +
      " -- " + JSON.stringify("js"), {
      cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch (e) {
    return null;
  }
  var files = [];
  out.split(/\r?\n/).forEach(function (line) {
    if (!line) return;
    var hit = /(^|\/)(js\/.*\.js)$/.exec(line);
    if (hit) files.push(hit[2]);
  });
  return files.sort();
}

function tagsIn(page) {
  var src;
  if (REV !== null) {
    src = gitShow(REV, PREFIX + page);
    if (src === null) return null;
  } else {
    try {
      src = fs.readFileSync(path.join(ROOT, page), "utf8");
    } catch (e) {
      return null;                     // a missing page is itself a finding
    }
  }
  var found = [];
  var re = /<script[^>]*\ssrc\s*=\s*"([^"]+)"/g;
  var hit;
  while ((hit = re.exec(src)) !== null) {
    if (/^js\//.test(hit[1])) found.push(hit[1]);
  }
  return found;
}

var onDisk;
if (REV !== null) {
  if (PREFIX === null) {
    console.log("--rev needs a git checkout; " + ROOT + " is not one.");
    process.exit(2);
  }
  onDisk = listedAtRev(REV);
  if (onDisk === null) {
    console.log("--rev " + REV + ": cannot read that revision.");
    process.exit(2);
  }
} else {
  onDisk = walk(path.join(ROOT, "js"), []).sort();
}

var tagged = {};
var missingPages = [];
PAGES.forEach(function (page) {
  var list = tagsIn(page);
  if (list === null) { missingPages.push(page); return; }
  list.forEach(function (src) {
    if (!tagged[src]) tagged[src] = [];
    tagged[src].push(page);
  });
});

// THE PARSE MUST BE ABLE TO FAIL. If the tag regex stops matching -- a format
// change, a rename, a page that moved -- an empty tag set would report every
// file in the tree as unwired, or worse, a silently empty disk scan would
// report nothing wrong forever. Refuse to draw a conclusion from a scan that
// found implausibly little.
var problems = [];
if (missingPages.length) {
  problems.push("page(s) not found: " + missingPages.join(", "));
}
if (onDisk.length < 50) {
  problems.push("scanned only " + onDisk.length + " js files under js/ -- the " +
    "disk walk is broken, not the tree");
}
if (Object.keys(tagged).length < 50) {
  problems.push("scraped only " + Object.keys(tagged).length + " script tags " +
    "from " + PAGES.join(" + ") + " -- the tag regex is broken");
}
if (problems.length) {
  console.log("MANIFEST CHECK CANNOT RUN:");
  problems.forEach(function (p) { console.log("  " + p); });
  console.log("\nA check that cannot fail is not a check. Fix the scan first.");
  process.exit(2);
}

// The harness skips js/debug-*.js by convention, so a page need not load one.
function isDebug(file) { return /(^|\/)debug-[^/]*\.js$/.test(file); }

var unwired = [], known = [], allowed = [];
onDisk.forEach(function (file) {
  if (tagged[file] || isDebug(file)) return;
  if (ALLOWED[file]) { allowed.push(file); return; }
  if (KNOWN_UNWIRED[file]) { known.push(file); return; }
  unwired.push(file);
});

var broken = Object.keys(tagged).filter(function (src) {
  return onDisk.indexOf(src) === -1;
}).sort();

// THIRD LEG: the git index. `--full-name` gives repo-root-relative paths from
// any subdirectory, and the game sits one level down in TD_0.5.0/, so strip
// whatever prefix the repo puts in front of `js/`.
function trackedSet() {
  var out;
  try {
    out = cp.execSync("git ls-files --full-name -- " + JSON.stringify("js"), {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
    });
  } catch (e) {
    return null;                  // not a git checkout, or git is unavailable
  }
  var set = {};
  out.split(/\r?\n/).forEach(function (line) {
    if (!line) return;
    var hit = /(^|\/)(js\/.*)$/.exec(line);
    if (hit) set[hit[2]] = true;
  });
  return Object.keys(set).length ? set : null;
}

// In --rev mode there is no third leg to run and none is needed: at a commit,
// "present" and "tracked" are the same thing, so `broken` above already covers
// both classes at once. That is why the retrospective gate is the simpler one.
var tracked = REV !== null ? "n/a" : trackedSet();
var untrackedButTagged = [];
if (tracked && tracked !== "n/a") {
  untrackedButTagged = Object.keys(tagged).filter(function (src) {
    return onDisk.indexOf(src) !== -1 && !tracked[src];
  }).sort();
}

// A stale entry is its own defect: it means somebody fixed the thing and left
// the excuse behind, and the next reader trusts it.
// Only meaningful about the CURRENT tree. A past commit legitimately predates
// half of these entries, and failing a retrospective run because 2026-08-13's
// ledger does not describe a commit from last week would make the answer to
// "was this bootable" depend on today's hygiene.
var staleAllow = REV !== null ? [] :
  Object.keys(ALLOWED).concat(Object.keys(KNOWN_UNWIRED))
  .filter(function (file) {
    return onDisk.indexOf(file) === -1 || !!tagged[file];
  }).sort();

console.log("manifest: " + onDisk.length + " js files under js/, " +
  Object.keys(tagged).length + " tagged across " + PAGES.join(" + "));
console.log("  allowed (deliberate) : " + allowed.length);
console.log("  known unwired        : " + known.length);
console.log("");

known.forEach(function (file) {
  console.log("KNOWN UNWIRED  " + file);
  console.log("               " + KNOWN_UNWIRED[file]);
});

var failed = false;

if (broken.length) {
  failed = true;
  console.log("\nBROKEN TAG -- the page asks for a file that is not there:");
  broken.forEach(function (src) {
    console.log("  " + src + "   (tagged by " + tagged[src].join(", ") + ")");
  });
}

if (untrackedButTagged.length) {
  failed = true;
  // SEVERITY DIFFERS BY WHICH PAGE, and saying so keeps the warning credible.
  // `tests/harness.js` builds its script list from `index.html` and
  // `sandbox.smoke.js` from `sandbox.html`, so an untracked file tagged by
  // EITHER breaks every suite for anyone who clones. The instrument pages
  // (`3d.html`, `long-range-dps-debug.html`) carry no suite,
  // so the loss there is the instrument, not the build. Both are real; only
  // one stops the tests, and a warning that overstates gets discounted whole.
  var SUITE_PAGES = { "index.html": 1, "sandbox.html": 1 };
  console.log("\nTAGGED BUT UNTRACKED -- a page loads it, it is on YOUR disk,");
  console.log("and it is not in the commit. Your own tree stays green, which is");
  console.log("why this one escapes review. `git add` it in the SAME commit as");
  console.log("the tag -- and note a page and the script it loads are ONE piece");
  console.log("of work: committing either alone just moves the hole.");
  untrackedButTagged.forEach(function (src) {
    var pages = tagged[src];
    var breaksSuites = pages.some(function (p) { return !!SUITE_PAGES[p]; });
    console.log("  " + src + "   (tagged by " + pages.join(", ") + ")");
    console.log("      " + (breaksSuites
      ? "SUITE-BEARING PAGE: a clone cannot run ANY suite -- the harness "
        + "readFileSync's every entry and dies before its first assertion."
      : "instrument page only: no suite reads it, so a clone loses the "
        + "instrument rather than the build."));
  });
}

if (tracked === null && REV === null) {
  console.log("\nNOTE: the git leg did not run -- this root is not a git");
  console.log("checkout (an extraction, an archive, a copy). The tagged-but-");
  console.log("untracked class CANNOT be detected here. Say so if you quote");
  console.log("this run as a gate: two legs of three is not a clean gate.");
}

if (unwired.length) {
  failed = true;
  console.log("\nUNWIRED -- on disk, loaded by no page, not a known exception:");
  unwired.forEach(function (file) { console.log("  " + file); });
  console.log("\nNo suite can catch this: the harness takes its script list");
  console.log("from index.html, so an untagged file is never executed at all.");
  console.log("Add the <script> tag in the SAME commit as the file, or say why");
  console.log("in ALLOWED at the top of this file.");
}

if (staleAllow.length) {
  failed = true;
  console.log("\nSTALE EXCEPTION -- listed here but no longer unwired or no");
  console.log("longer present. Remove the entry; a leftover excuse outlives");
  console.log("the problem and the next reader believes it:");
  staleAllow.forEach(function (file) { console.log("  " + file); });
}

if (!failed) console.log("\nMANIFEST OK");
process.exit(failed ? 1 : 0);
