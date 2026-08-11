// ---------------------------------------------------------------------------
// The constraints with NO TEST BEHIND THEM.
//
//   node tools/check-constraints.js
//
// AGENTS.md lists a handful of rules that come from the owner's requirements
// rather than from taste: no toolchain, must run from file://, ES5 style,
// classic script tags only. Every one of them can be broken while all six
// suites stay green, because the suites run under node and node is perfectly
// happy with `const`, arrow functions and template literals. The game is not:
// it is opened as a file:// page in whatever browser the owner has, with no
// build step to transpile anything and no server to serve a module from.
//
// So this file checks the things a passing suite cannot:
//
//   1. ES5 SYNTAX      let/const, arrows, class, template literals, spread,
//                      for..of, import/export, and type="module" in any page.
//   2. file:// SAFETY   fetch and XMLHttpRequest, both of which fail outright
//                      on a file:// origin.
//   3. UNWIRED FILES    every js/**/*.js on disk against every src= in the HTML
//                      pages. tests/harness.js takes its script list from
//                      index.html and sandbox.smoke.js from sandbox.html, so a
//                      file no page loads is never executed by any suite, never
//                      fails, and never counts as missing. It is invisible in
//                      exactly the way that looks like health.
//   4. BROKEN SRC       a page loading a file that is not on disk. Silent on
//                      file:// -- the console says 404 and the game limps.
//
// A CHECK THAT CAN ONLY SAY "CLEAN" IS NOT A CHECK. Before trusting a zero
// here, run `node tools/check-constraints.js --selftest`: it builds a throwaway
// tree containing one deliberate violation of every rule and asserts that all
// of them are caught, and that the same tokens sitting inside comments and
// strings are NOT. That distinction is the whole difficulty -- half this file
// is comments about `const` and none of them should fire.
//
// Not loaded by the game or by the test suite.
// ---------------------------------------------------------------------------

var fs = require("fs");
var path = require("path");
var os = require("os");

var ROOT = path.resolve(__dirname, "..");

// Files that are on disk, loaded by nothing, and MEANT to be. Listed here with
// the reason so that nobody has to remember it, and so that deleting one of
// them shows up as a diff in this file rather than as a silent judgement call
// at 3am.
var INTENTIONALLY_UNWIRED = {
  "js/skins/example-pack.js":
    "a copy-me template for visual packs; MODEL_SKINS_GUIDE.md tells the " +
    "reader to copy it and load the copy. Loading the original would " +
    "register nothing -- every line in it is commented out.",
  "js/systems/targeting.js":
    "a tombstone. Its whole body is a comment recording that the reach test " +
    "moved to js/systems/range-filter.js in v0.3.5, because the v0.3.5 merge " +
    "brought in a second global also called Targeting. Safe to delete; kept " +
    "only because deleting it has never been anybody's job."
};

var RULES = [
  { id: "let",      re: /(^|[^.\w$])let\s+[A-Za-z_$]/,   why: "ES5 style: var only" },
  { id: "const",    re: /(^|[^.\w$])const\s+[A-Za-z_$]/, why: "ES5 style: var only" },
  { id: "arrow",    re: /=>/,                             why: "ES5 style: function only" },
  { id: "class",    re: /(^|[^.\w$])class\s+[A-Za-z_$]/, why: "ES5 style: prototype methods" },
  { id: "template", re: /`/,                              why: "ES5 style: no template literals" },
  { id: "spread",   re: /\.\.\.[A-Za-z_$[{]/,             why: "ES5 style: no spread or rest" },
  { id: "forof",    re: /(^|[^.\w$])for\s*\(\s*(let|const|var)\s+\w+\s+of\s/,
                                                          why: "ES5 style: no for..of" },
  { id: "fetch",    re: /(^|[^.\w$])fetch\s*\(/,          why: "must run from file://" },
  { id: "xhr",      re: /XMLHttpRequest/,                 why: "must run from file://" },
  // The first draft of this rule only matched `import(`, `import{` and
  // `import"`, so it sailed straight past `import x from "y"` -- the commonest
  // form there is. The self-test below caught it on the first run, which is the
  // entire argument for having one.
  { id: "esmodule", re: /(^|[^.\w$])import\s*[({*'"]|(^|[^.\w$])import\s+[A-Za-z_$]|(^|[^.\w$])export\s*[{*]|(^|[^.\w$])export\s+(default|const|let|var|function|class|async)/,
                                                          why: "classic script tags only" }
];

function walkJs(dir, out) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).forEach(function (name) {
    var p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkJs(p, out);
    else if (/\.js$/i.test(name)) out.push(p);
  });
  return out;
}

// Remove comments and string bodies before matching, so the rules fire on code
// and not on prose. Conservative: it only ever deletes, never rewrites, and it
// keeps line numbering intact by replacing in place.
function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, " "); })
    .replace(/(^|[^:])\/\/[^\n]*/g, function (m, p1) { return p1 + m.slice(p1.length).replace(/./g, " "); })
    .replace(/"(?:\\.|[^"\\\n])*"/g, function (m) { return '"' + m.slice(1, -1).replace(/./g, " ") + '"'; })
    .replace(/'(?:\\.|[^'\\\n])*'/g, function (m) { return "'" + m.slice(1, -1).replace(/./g, " ") + "'"; });
}

function scan(root) {
  var report = { violations: [], unwired: [], allowed: [], brokenSrc: [], jsCount: 0, pages: [] };

  var files = walkJs(path.join(root, "js"), []);
  report.jsCount = files.length;
  files.forEach(function (f) {
    var raw = fs.readFileSync(f, "utf8");
    var rawLines = raw.split(/\r?\n/);
    stripNonCode(raw).split(/\r?\n/).forEach(function (line, i) {
      RULES.forEach(function (r) {
        if (!r.re.test(line)) return;
        report.violations.push({
          file: path.relative(root, f).replace(/\\/g, "/"), line: i + 1,
          id: r.id, why: r.why, text: (rawLines[i] || "").trim().slice(0, 90)
        });
      });
    });
  });

  var loaded = {};
  fs.readdirSync(root).filter(function (f) { return /\.html$/i.test(f); }).forEach(function (page) {
    var html = fs.readFileSync(path.join(root, page), "utf8");
    var re = /<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi;
    var m, n = 0;
    while ((m = re.exec(html))) {
      loaded[m[1].replace(/^\.\//, "")] = true;
      n++;
    }
    report.pages.push({ page: page, scripts: n });
    if (/<script[^>]*type\s*=\s*["']module["']/i.test(html)) {
      report.violations.push({ file: page, line: 0, id: "module-tag",
        why: "classic script tags only", text: 'type="module"' });
    }
  });

  files.forEach(function (f) {
    var rel = path.relative(root, f).replace(/\\/g, "/");
    if (loaded[rel]) return;
    if (INTENTIONALLY_UNWIRED[rel]) report.allowed.push(rel);
    else report.unwired.push(rel);
  });

  Object.keys(loaded).forEach(function (src) {
    if (!/^js\//.test(src)) return;
    if (!fs.existsSync(path.join(root, src))) report.brokenSrc.push(src);
  });

  return report;
}

// --- self-test -------------------------------------------------------------
// Builds a throwaway tree with one violation of every rule, plus the same
// tokens inside a comment and a string, and asserts the guard separates them.
function selftest() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "td-constraints-"));
  fs.mkdirSync(path.join(dir, "js", "deep"), { recursive: true });
  fs.writeFileSync(path.join(dir, "js", "deep", "bad.js"), [
    "// a comment naming let, const, class, => and `backticks` must NOT fire",
    'var decoy = "a string holding => and let and `ticks` and fetch(";',
    "let a = 1;",
    "const b = 2;",
    "var c = function (x) { return x; };",
    "var d = (x) => x;",
    "class E {}",
    "var f = `tpl`;",
    "var g = [...list];",
    "for (let v of list) { void v; }",
    "fetch(\"u\");",
    "var h = new XMLHttpRequest();",
    "import x from 'y';",
    "import { z } from 'w';",
    "import * as ns from 'q';",
    "export default a;",
    "export { b };"
  ].join("\n"));
  fs.writeFileSync(path.join(dir, "js", "deep", "clean.js"), "var ok = 1;\n");
  fs.writeFileSync(path.join(dir, "index.html"),
    '<script type="module" src="js/deep/bad.js"></script>\n');

  var r = scan(dir);
  var seen = {};
  r.violations.forEach(function (v) { seen[v.id] = (seen[v.id] || 0) + 1; });

  var want = ["let", "const", "arrow", "class", "template", "spread", "forof",
              "fetch", "xhr", "esmodule", "module-tag"];
  var missed = want.filter(function (id) { return !seen[id]; });
  var falsePositives = r.violations.filter(function (v) { return v.line === 1 || v.line === 2; });
  var unwiredOk = r.unwired.indexOf("js/deep/clean.js") !== -1;

  console.log("self-test tree: " + dir);
  console.log("rules that fired: " + want.filter(function (id) { return seen[id]; }).join(", "));
  if (missed.length) console.log("MISSED: " + missed.join(", "));
  if (falsePositives.length) {
    console.log("FALSE POSITIVES on the comment/string lines:");
    falsePositives.forEach(function (v) { console.log("  line " + v.line + " [" + v.id + "] " + v.text); });
  }
  console.log("unwired detection: " + (unwiredOk ? "clean.js correctly reported" : "FAILED to report clean.js"));

  fs.rmSync(dir, { recursive: true, force: true });

  if (missed.length || falsePositives.length || !unwiredOk) {
    console.log("\nSELF-TEST FAILED. Do not trust a zero from this guard.");
    process.exit(1);
  }
  console.log("\nSelf-test passed: every rule can fire, and none fires on prose.");
}

if (process.argv.indexOf("--selftest") !== -1) {
  selftest();
} else {
  var r = scan(ROOT);
  console.log("pages: " + r.pages.map(function (p) { return p.page + " (" + p.scripts + " scripts)"; }).join(", "));
  console.log("js files on disk: " + r.jsCount);
  console.log("");

  console.log("ES5 / file:// violations: " + r.violations.length);
  r.violations.forEach(function (v) {
    console.log("  " + v.file + ":" + v.line + "  [" + v.id + "] " + v.why);
    console.log("      " + v.text);
  });

  console.log("");
  console.log("loaded by no page, and not expected to be: " + r.unwired.length);
  r.unwired.forEach(function (f) { console.log("  " + f); });

  console.log("");
  console.log("loaded by no page, ON PURPOSE: " + r.allowed.length);
  r.allowed.forEach(function (f) {
    console.log("  " + f);
    console.log("      " + INTENTIONALLY_UNWIRED[f]);
  });

  console.log("");
  console.log("pages loading a file that is not on disk: " + r.brokenSrc.length);
  r.brokenSrc.forEach(function (f) { console.log("  " + f); });

  console.log("");
  if (r.violations.length || r.brokenSrc.length) {
    console.log("Hard constraints broken. These cannot be caught by any suite.");
    process.exit(1);
  }
  if (r.unwired.length) {
    console.log(r.unwired.length + " file(s) load nowhere. Not a failure by itself -- a");
    console.log("module mid-wiring looks exactly like this -- but nothing tests them,");
    console.log("so decide deliberately rather than by not noticing.");
  }
  console.log("Hard constraints hold.");
}
