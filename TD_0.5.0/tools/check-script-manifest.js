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

var fs = require("fs");
var path = require("path");

var ROOT = process.argv[2] ? path.resolve(process.argv[2])
                           : path.resolve(__dirname, "..");
var PAGES = ["index.html", "sandbox.html"];

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
  "js/scene/long-range-dps-scene.js":
    "loaded directly by tests/long-range-dps-scene.smoke.js, which is a node " +
    "entry point rather than a page. Wiring it into index.html would put a " +
    "test scene in the shipping game."
};

// PRE-EXISTING and NOT deliberate -- a dated ledger, printed loudly every run
// but not failing the build, on the same principle as the failing-name baseline
// in ci-check.js: the gate is REGRESSION, not perfection. Arming a new check
// that instantly reddens the board on somebody else's old defect teaches
// everyone to ignore the check.
//
// EVERY ONE OF THESE IS A REAL DEFECT. Do not "fix" one by moving it up into
// ALLOWED; either wire it or delete it, and take the entry out when you do.
var KNOWN_UNWIRED = {
  "js/gl/blub-hp.js":
    "742 lines, tracked, referenced by js/gl/blub-summon.js which IS loaded. " +
    "Recorded unwired on 2026-08-12 and still unwired on 2026-08-13. Owner: " +
    "rendering (kaz).",
  "js/gl/siphon-enemy-fx.js":
    "791 lines, tracked, referenced by nothing at all. Recorded unwired on " +
    "2026-08-12 and still unwired on 2026-08-13. Owner: rendering (kaz).",
  "js/gl/siphon-ground.js":
    "1204 lines, tracked, referenced by js/gl/siphon-beam-draw.js which IS " +
    "loaded. Recorded unwired on 2026-08-12 and still unwired on 2026-08-13. " +
    "Owner: rendering (kaz)."
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

function tagsIn(page) {
  var src;
  try {
    src = fs.readFileSync(path.join(ROOT, page), "utf8");
  } catch (e) {
    return null;                       // a missing page is itself a finding
  }
  var found = [];
  var re = /<script[^>]*\ssrc\s*=\s*"([^"]+)"/g;
  var hit;
  while ((hit = re.exec(src)) !== null) {
    if (/^js\//.test(hit[1])) found.push(hit[1]);
  }
  return found;
}

var onDisk = walk(path.join(ROOT, "js"), []).sort();

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

// A stale entry is its own defect: it means somebody fixed the thing and left
// the excuse behind, and the next reader trusts it.
var staleAllow = Object.keys(ALLOWED).concat(Object.keys(KNOWN_UNWIRED))
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
