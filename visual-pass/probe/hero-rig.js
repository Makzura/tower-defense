// ---------------------------------------------------------------------------
// hero-rig.js -- the 1920x1080 hero capture rig, and the one measurement it
// exists for.
//
//   node visual-pass/probe/hero-rig.js
//
// THE QUESTION. Diego wants a 1920x1080 Kickstarter project image for THE
// COLLAPSE. The hypothesis under test is that a straight in-game screenshot at
// the fitted camera DIES at thumbnail size -- that at a 200 px-wide social card
// the board becomes texture rather than subject. He asked for it TESTED, and
// for the answer either way.
//
// THE FOUR THINGS THAT MAKE THIS RIG DIFFERENT FROM THE OTHERS IN THIS FOLDER:
//
// 1. IT SHOOTS FROM A CLEAN EXTRACTION OF COMMITTED HEAD, never the working
//    tree. `git archive HEAD` into a temp dir, and THAT is what gets served.
//    TD_0.5.0/js/gl/gl-world.js currently carries uncommitted work from another
//    division's job; the instruction is "render from committed geometry", and
//    an extraction is the only way to be certain of it. It also decouples this
//    run from whoever is mid-edit, in both directions.
//
//    EXPECT LF WHERE THE WORKING TREE HAS CRLF. git's filters check files out
//    with CRLF and archive them with LF. A byte-for-byte mismatch against the
//    working copy is therefore the DOCUMENTED behaviour and not a changed file;
//    the extraction is verified against `git show HEAD:<path>` instead, which
//    is the same side of the filter.
//
// 2. THE VIEWPORT IS SET WITH Emulation.setDeviceMetricsOverride, NOT
//    --window-size. The existing rig passes --window-size=1280,720 and gets a
//    1111x625 canvas: the window is not the viewport. index.html sizes #game as
//    min(100vw, calc(100vh*16/9)), so the game canvas is ALREADY exactly 16:9
//    and a 1920x1080 viewport at deviceScaleFactor 1 gives a 1920x1080 backing
//    store with no letterbox and no crop. Asserted, at capture time, in
//    HeroRig.assertSize -- gl-world.js runs resize() at the top of drawWorld()
//    on every single frame, so anything written to the canvas directly is
//    overwritten by the next draw and the viewport is the only durable lever.
//
// 3. NO CAPTION AND NO STAMP IN ANY DELIVERABLE FRAME. Provenance goes in the
//    sidecar JSON beside the PNGs. For this one artefact a burned-in caption
//    would be actively wrong.
//
// 4. THE DOWNSCALE IS AN EXPLICIT AREA AVERAGE WRITTEN IN JS (see
//    hero-page.js), not drawImage's filter, which is driver- and
//    version-dependent. A number produced through drawImage does not mean the
//    same thing next month.
// ---------------------------------------------------------------------------
"use strict";

var fs = require("fs");
var os = require("os");
var path = require("path");
var http = require("http");
var crypto = require("crypto");
var childProcess = require("child_process");
var cdp = require("./cdp");

var REPO = path.resolve(__dirname, "..", "..");          // TD_0.5.1
var OUT = path.join(REPO, "visual-pass", "captures", "hero");
var PORT = 8814, DEVTOOLS = 9354;

// The thumbnail widths under test, 16:9. 320 and 128 divide 1920 exactly (6x
// and 15x); 200 does not (9.6x), which is exactly why the downscaler takes
// fractional coverage rather than assuming integer boxes.
var SCALES = [[320, 180], [200, 113], [128, 72]];

function sh(cmd, cwd) {
  return childProcess.execSync(cmd, { cwd: cwd || REPO, maxBuffer: 1 << 28 })
    .toString().trim();
}

function md5(buf) { return crypto.createHash("md5").update(buf).digest("hex"); }

function writePng(file, dataUrl) {
  var b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  var buf = Buffer.from(b64, "base64");
  fs.writeFileSync(file, buf);
  // PNG header: width and height are big-endian uint32 at bytes 16 and 20.
  // Read them back off the FILE rather than trusting the canvas that made it,
  // because "verify the PNG really comes out 1920x1080" is a claim about the
  // artefact, not about the intent.
  var w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  return { file: file, bytes: buf.length, png: [w, h], md5: md5(buf) };
}

// A static server rooted at the EXTRACTION. serve.js in this folder is hard
// wired to the working tree's root, which is the one thing this rig must not
// serve, so it gets its own twenty lines rather than an edit to a shared file.
//
// HTTP and not file:// for the documented reason: assets/*.png load through
// Image() and over file:// taint any 2D canvas they reach, so getImageData
// throws and the composite cannot be built. Same bytes, different origin.
var TYPES = { ".html": "text/html", ".js": "application/javascript",
              ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg",
              ".json": "application/json" };
function serveDir(root, port) {
  return new Promise(function (res, rej) {
    var s = http.createServer(function (req, rsp) {
      var rel = decodeURIComponent(req.url.split("?")[0]);
      var f = path.join(root, rel);
      if (f.indexOf(root) !== 0) { rsp.writeHead(403); rsp.end(); return; }
      fs.readFile(f, function (e, b) {
        if (e) { rsp.writeHead(404); rsp.end("404 " + rel); return; }
        rsp.writeHead(200, {
          "Content-Type": TYPES[path.extname(f).toLowerCase()] || "application/octet-stream",
          "Cache-Control": "no-store" });
        rsp.end(b);
      });
    });
    s.listen(port, "127.0.0.1", function () { res(s); });
    s.on("error", rej);
  });
}

// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // ---- 1. CLEAN EXTRACTION OF COMMITTED HEAD ------------------------------
  var sha = sh("git rev-parse HEAD");
  var shaShort = sha.slice(0, 12);
  var tmp = path.join(os.tmpdir(), "td-hero-" + shaShort);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  // The tar lands INSIDE tmp and is extracted with a RELATIVE name from there.
  // GNU tar (which is what Git for Windows puts on PATH) reads any argument
  // containing a colon as host:path, so `tar -xf C:\...` fails with
  // "Cannot connect to C: resolve failed" -- a remote-host error for a purely
  // local operation. A relative filename has no colon in it.
  var tarFile = path.join(tmp, "_head.tar");
  sh('git archive --format=tar HEAD -o "' + tarFile + '"');
  sh("tar -xf _head.tar", tmp);
  fs.rmSync(tarFile, { force: true });   // never serve the archive itself

  // Prove the extraction is HEAD and not the working tree, on the file that
  // actually differs. Compared against `git show`, which is the same side of
  // git's CRLF filter as the archive -- comparing against the checked-out file
  // would report a mismatch that is only line endings.
  var GW = "TD_0.5.0/js/gl/gl-world.js";
  // NOT through sh(): sh trims, and a trailing newline difference would fire
  // the gate below as if the file had changed.
  var head = childProcess.execSync('git show HEAD:"' + GW + '"',
    { cwd: REPO, maxBuffer: 1 << 28 }).toString();
  var extracted = fs.readFileSync(path.join(tmp, GW), "utf8");
  var working = fs.readFileSync(path.join(REPO, GW), "utf8");
  var prov = {
    sha: sha,
    extractedTo: tmp,
    glWorld: {
      extractedMd5: md5(fs.readFileSync(path.join(tmp, GW))),
      workingMd5: md5(fs.readFileSync(path.join(REPO, GW))),
      extractedMatchesHead: extracted.replace(/\r\n/g, "\n") === head.replace(/\r\n/g, "\n"),
      workingMatchesHead: working.replace(/\r\n/g, "\n") === head.replace(/\r\n/g, "\n"),
      extractedLines: extracted.split("\n").length,
      workingLines: working.split("\n").length,
      // The uncommitted work the shot must not carry, counted rather than
      // asserted -- a number that goes to zero one day is visible; a boolean
      // that silently flips is not.
      workingExtraLines: working.split("\n").length - extracted.split("\n").length,
      crlfInExtraction: /\r\n/.test(extracted),
      crlfInWorking: /\r\n/.test(working)
    },
    dirtyAtShootTime: sh("git status --porcelain TD_0.5.0/js"),
    generatedAt: new Date().toISOString()
  };
  if (!prov.glWorld.extractedMatchesHead) {
    throw new Error("extraction of " + GW + " does not match git show HEAD -- refusing to shoot");
  }

  // ---- 2. SERVE THE EXTRACTION -------------------------------------------
  var server = await serveDir(tmp, PORT);
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-hero-profile"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, "about:blank");
  var S = conn.session;
  var out = { provenance: prov, controls: {}, arms: {}, files: [] };

  try {
    // THE VIEWPORT, SET BEFORE THE PAGE LOADS. --window-size is not the
    // viewport: the existing rig passes 1280,720 and measures a 1111x625
    // canvas. setDeviceMetricsOverride is.
    await S.send("Emulation.setDeviceMetricsOverride",
      { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await S.send("Page.navigate", { url: "http://127.0.0.1:" + PORT + "/TD_0.5.0/index.html" });

    for (var w = 0; w < 120; w++) {
      var ready = await S.evaluate(
        "typeof startRun === 'function' && typeof GLModels !== 'undefined' && " +
        "typeof World3D !== 'undefined'").catch(function () { return false; });
      if (ready) break;
      await cdp.sleep(250);
    }

    var probeSrc = fs.readFileSync(path.join(tmp, "visual-pass/probe/page-probe.js"), "utf8");
    var shootSrc = fs.readFileSync(path.join(tmp, "visual-pass/probe/page-probe-shoot.js"), "utf8");
    var heroSrc = fs.readFileSync(path.join(__dirname, "hero-page.js"), "utf8");
    out.provenance.injected = {
      // page-probe / page-probe-shoot come from the EXTRACTION, so the
      // measurement machinery is committed too. hero-page.js is new by
      // definition and comes from the working tree; its md5 is recorded so the
      // number can be tied to the code that produced it.
      "page-probe.js": { source: "extraction", md5: md5(Buffer.from(probeSrc)) },
      "page-probe-shoot.js": { source: "extraction", md5: md5(Buffer.from(shootSrc)) },
      "hero-page.js": { source: "working tree (new file)", md5: md5(Buffer.from(heroSrc)) }
    };
    await S.evaluate(probeSrc);
    await S.evaluate(shootSrc);
    await S.evaluate(heroSrc);

    var setup = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.setup())"));
    out.setup = setup;
    // camDefault throws on OrbitCamera's 900/[0,0,0] constructor default, which
    // is the one camera state that means "fitBounds had not run yet" and is
    // indistinguishable from a real reading in every other field.
    await S.evaluate("TDProbe.camDefault()");
    await S.evaluate("TDProbe.warm(2)");

    // THE SIZE ASSERTION. 1918x1079 is a failure, not a rounding.
    out.sizes = JSON.parse(await S.evaluate("JSON.stringify(HeroRig.sizes())"));
    await S.evaluate("HeroRig.assertSize('post-setup')");

    // ---- 3. THE BOARD ----------------------------------------------------
    out.board = JSON.parse(await S.evaluate(
      "JSON.stringify(HeroRig.buildBoard({wave:" + (process.env.HERO_WAVE || 12) +
      ", towers:" + (process.env.HERO_TOWERS || 8) + "}))"));
    out.run = JSON.parse(await S.evaluate(
      "JSON.stringify(HeroRig.run(" + (process.env.HERO_SECONDS || 26) + "))"));
    out.frozen = JSON.parse(await S.evaluate("JSON.stringify(HeroRig.freeze())"));
    if (!out.run.enemies) throw new Error("no enemies on the road after the run -- refusing to shoot an empty board");
    if (!out.run.finite) throw new Error("an enemy is at a non-finite position");

    out.fittedCamera = JSON.parse(await S.evaluate("JSON.stringify(TDProbe.camState())"));
    var centroid = JSON.parse(await S.evaluate("JSON.stringify(HeroRig.subjectCentroid())"));
    out.subjectCentroid = centroid;

    // ---- 4. THE TWO ARMS -------------------------------------------------
    // The fitted camera is the honest board shot. The close camera is the third
    // state: without it "the fitted shot is bad" cannot be told apart from
    // "everything is bad at 200 px".
    var ARMS = [
      { tag: "fitted", cam: null,
        note: "the game's own fitted view -- what a player sees at the start of a run" },
      { tag: "close",
        cam: { target: [centroid.x, centroid.y, 0],
               distance: Number(process.env.HERO_CLOSE || 620) },
        note: "deliberately close, aimed at the subject centroid -- the comparison arm" }
    ];

    for (var ai = 0; ai < ARMS.length; ai++) {
      var A = ARMS[ai];
      await S.evaluate("TDProbe.camDefault()");
      if (A.cam) await S.evaluate("TDProbe.cam(" + JSON.stringify(A.cam) + ")");
      await S.evaluate("TDProbe.warm(2)");
      var arm = { note: A.note,
                  camera: JSON.parse(await S.evaluate("JSON.stringify(TDProbe.camState())")),
                  counts: JSON.parse(await S.evaluate("JSON.stringify(HeroRig.counts())")) };

      // THE FRAME, AND THEN THE SAME FRAME AGAIN. full_b is the null control:
      // identical state, identical path, and it must come out exactly 0 on #gl.
      await S.evaluate("TDProbe.warm(1)");
      await S.evaluate("HeroRig.capture('full_a')");
      await S.evaluate("HeroRig.capture('full_b')");

      // THE DELETION, PLAIN: enemies and towers emptied, nothing else touched.
      arm.removedPlain = JSON.parse(await S.evaluate("JSON.stringify(HeroRig.removeSubject(false))"));
      await S.evaluate("TDProbe.warm(1)");
      await S.evaluate("HeroRig.capture('del_plain')");
      await S.evaluate("HeroRig.restoreSubject()");
      await S.evaluate("TDProbe.warm(1)");
      await S.evaluate("HeroRig.capture('full_c')");

      // THE DELETION AGAIN, WITH THE FX MODULES RESET. Kept as a separate
      // variant rather than folded in, because drawWorld() diffs which bodies
      // are still standing every frame and emptying the arrays can look to it
      // like the whole board dying at once -- which would ADD ink to the frame
      // that is meant to be the absence of the subject.
      arm.removedReset = JSON.parse(await S.evaluate("JSON.stringify(HeroRig.removeSubject(true))"));
      await S.evaluate("TDProbe.warm(1)");
      await S.evaluate("HeroRig.capture('del_reset')");
      await S.evaluate("HeroRig.restoreSubject()");
      await S.evaluate("TDProbe.warm(1)");
      await S.evaluate("HeroRig.capture('full_d')");

      // ---- full-resolution controls -------------------------------------
      arm.fullRes = {};
      for (var li = 0; li < 2; li++) {
        var layer = ["gl", "comp"][li];
        arm.fullRes[layer] = {
          NULL_sameFrameTwice: JSON.parse(await S.evaluate(
            "JSON.stringify(HeroRig.diffFull('full_a','full_b','" + layer + "'))")),
          POSITIVE_subjectDeleted: JSON.parse(await S.evaluate(
            "JSON.stringify(HeroRig.diffFull('full_a','del_plain','" + layer + "'))")),
          POSITIVE_subjectDeletedFxReset: JSON.parse(await S.evaluate(
            "JSON.stringify(HeroRig.diffFull('full_a','del_reset','" + layer + "'))")),
          REVERSIBILITY_afterPlain: JSON.parse(await S.evaluate(
            "JSON.stringify(HeroRig.diffFull('full_a','full_c','" + layer + "'))")),
          REVERSIBILITY_afterReset: JSON.parse(await S.evaluate(
            "JSON.stringify(HeroRig.diffFull('full_a','full_d','" + layer + "'))"))
        };
      }

      // ---- the thumbnail battery ----------------------------------------
      arm.thumbnails = {};
      for (var si = 0; si < SCALES.length; si++) {
        var sw = SCALES[si][0], sh2 = SCALES[si][1];
        var tag = sw + "x" + sh2;
        arm.thumbnails[tag] = {};
        for (var lj = 0; lj < 2; lj++) {
          var lay = ["gl", "comp"][lj];
          arm.thumbnails[tag][lay] = {};
          for (var sp = 0; sp < 2; sp++) {
            var space = ["srgb", "linear"][sp];
            var pairs = { NULL: ["full_a", "full_b"],
                          DELETION: ["full_a", "del_plain"],
                          DELETION_fxreset: ["full_a", "del_reset"] };
            var res = {};
            for (var pk in pairs) {
              res[pk] = JSON.parse(await S.evaluate(
                "JSON.stringify(HeroRig.battery('" + pairs[pk][0] + "','" + pairs[pk][1] +
                "','" + lay + "'," + sw + "," + sh2 + ",'" + space + "'))"));
              delete res[pk].hist;            // kept in the page, not in the report
            }
            arm.thumbnails[tag][lay][space] = res;
          }
        }
      }

      // ---- the deliverable frames, NO CAPTION, NO STAMP -----------------
      var full = await S.evaluate("HeroRig.pngFull('full_a','comp')");
      out.files.push(Object.assign(
        writePng(path.join(OUT, "hero-" + A.tag + "-1920x1080.png"), full),
        { arm: A.tag, kind: "hero", layer: "composite (#gl + #game, as the browser composites them)" }));
      var glOnly = await S.evaluate("HeroRig.pngFull('full_a','gl')");
      out.files.push(Object.assign(
        writePng(path.join(OUT, "hero-" + A.tag + "-board-only-1920x1080.png"), glOnly),
        { arm: A.tag, kind: "hero-board-only", layer: "#gl only (no HUD, no overlay)" }));
      for (var sk = 0; sk < SCALES.length; sk++) {
        var tw = SCALES[sk][0], th = SCALES[sk][1];
        var url = await S.evaluate("HeroRig.pngScaled('full_a','comp'," + tw + "," + th + ",'srgb')");
        out.files.push(Object.assign(
          writePng(path.join(OUT, "hero-" + A.tag + "-" + tw + "x" + th + ".png"), url),
          { arm: A.tag, kind: "thumbnail", space: "srgb",
            note: "explicit area average from the 1920x1080 capture, not drawImage" }));
      }

      out.arms[A.tag] = arm;
      await S.evaluate("HeroRig.dropCaps()");
    }

  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }

  out.provenance.shaAfter = sh("git rev-parse HEAD");
  var side = path.join(OUT, "hero-" + shaShort + ".json");
  fs.writeFileSync(side, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  console.error("sidecar: " + side);
}

main().catch(function (e) { console.error("HERO RIG FAILED: " + e.stack); process.exit(1); });
