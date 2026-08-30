// ---------------------------------------------------------------------------
// Is every generated model actually LOADED by the pages that draw it?
//
//   node tools/check-model-tags.js
//
// WHY THIS EXISTS, AND WHY NO TEST SUITE CAN REPLACE IT. A model ships as a
// classic <script> tag -- that is the whole loading strategy, because over
// file:// fetch and XHR are blocked. So a model that is exported, committed and
// correct still draws NOTHING if a page forgot its one line of HTML.
//
// AND THE FAILURE IS COMPLETELY SILENT. Nothing throws. `GLModels.has()` simply
// returns false, `gl-world.js::enemyModel()` returns null, the renderer falls
// back to an untextured sphere, and all six suites pass full green with the new
// enemy drawn as a coloured ball. There is no assertion anywhere that can see
// it, because from the simulation's point of view nothing is wrong.
//
// It is also easy to get half right: the tags live on THREE pages, not two --
// index.html, sandbox.html and 3d.html -- and a model added to the first two
// looks fine in every place anybody normally looks.
//
// This checks the mapping in both directions, because each direction is a
// different mistake:
//   * a model file with no tag  -> exported but never drawn (the silent one)
//   * a tag with no model file  -> a 404 on every page load, and for enemies
//                                  the same silent sphere fallback
//
// THE RULE IS PER FAMILY, AND IT IS DERIVED RATHER THAN DECLARED. Not every
// page loads every model: `3d.html` is an enemy viewer and deliberately
// carries no towers. So "every model on every page" is the wrong invariant and
// flags 89 correct files. What must hold is narrower and is read off the pages
// themselves: IF a page loads any model of a family, it must load ALL of them.
// A page that carries four enemies and not the fifth is the bug; a page that
// carries no snipers at all is a decision.
//
// ---------------------------------------------------------------------------
// WHAT THIS CHECKS AND WHAT IT DOES NOT
// ---------------------------------------------------------------------------
//
// Stated because a tool that does not say what it fails to check invites the
// reading that a green run means the model is fine. It does not. It means the
// tag is present.
//
// IT CHECKS that a `<script>` tag exists, in both directions: a model file with
// no tag on a page that carries its family, and a tag pointing at a file that
// is not there.
//
// IT DOES NOT CHECK that the tag WORKS. It never loads a page or executes a
// model file, so it cannot see: a tag in the wrong ORDER (a model file that
// runs before `gl-models.js` throws `GLModels is not defined` and the model is
// absent at runtime with the tag present and correct); a syntax error inside a
// generated file; a model that registers under a name nothing looks up -- the
// registered name comes from the exporter's TARGETS entry and is NOT derived
// from the filename, so `enemy-camo_normal.js` registering itself as
// `enemy-camo-normal` would pass here and still draw a sphere.
//
// IT ALSO DOES NOT CHECK the derived family rule against intent. The rule is
// read off the pages, so if a page is missing an ENTIRE family the omission is
// silently treated as deliberate. `3d.html` carrying no towers is a decision;
// a page that lost every one of its siphon tags in one bad edit would look
// exactly the same to this file.
//
// The genuine end-to-end check is loading the page and asserting
// `GLModels.has(name)` for each expected model. That needs a browser and does
// not exist yet.
// ---------------------------------------------------------------------------

var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var MODELS_DIR = path.join(ROOT, "js", "gl", "models");
var PAGES = ["index.html", "sandbox.html", "3d.html"];

var files = fs.readdirSync(MODELS_DIR)
  .filter(function (f) { return /\.js$/.test(f); })
  .sort();

var tags = {};
PAGES.forEach(function (page) {
  var src = fs.readFileSync(path.join(ROOT, page), "utf8");
  var re = /<script\s+src="js\/gl\/models\/([^"]+)"><\/script>/g;
  var m;
  tags[page] = {};
  while ((m = re.exec(src))) tags[page][m[1]] = true;
});

function family(file) {
  return file.replace(/\.js$/, "").split("-")[0];
}

// Which families each page has opted into, read off the tags it already has.
var pageFamilies = {};
PAGES.forEach(function (page) {
  pageFamilies[page] = {};
  Object.keys(tags[page]).forEach(function (f) {
    pageFamilies[page][family(f)] = true;
  });
});

var missing = 0;
var orphan = 0;

console.log("");
PAGES.forEach(function (page) {
  console.log("  " + page + " carries: " +
              Object.keys(pageFamilies[page]).sort().join(", "));
});
console.log("");

files.forEach(function (file) {
  var fam = family(file);
  var absent = PAGES.filter(function (p) {
    return pageFamilies[p][fam] && !tags[p][file];
  });
  if (!absent.length) return;
  missing++;
  console.log("  " + file.padEnd(30) + "MISSING from " + absent.join(", ") +
              "  (those pages carry other `" + fam + "` models)");
});

PAGES.forEach(function (page) {
  Object.keys(tags[page]).forEach(function (name) {
    if (files.indexOf(name) < 0) {
      orphan++;
      console.log("  " + page + " loads " + name + " which does not exist");
    }
  });
});

console.log("");
if (missing || orphan) {
  if (missing) {
    console.log("  " + missing + " model(s) are missing from a page that " +
                "carries their family.");
    console.log("  They export and commit cleanly and then draw as an " +
                "untextured sphere,");
    console.log("  throwing nothing and failing no suite. Add the <script> " +
                "tag listed above.");
  }
  if (orphan) {
    console.log("  " + orphan + " tag(s) point at a file that is not there.");
  }
  process.exit(1);
}
console.log("  All " + files.length + " models are loaded by all " +
            PAGES.length + " pages.");
