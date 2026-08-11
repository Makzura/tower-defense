// ---------------------------------------------------------------------------
// AUTOPUSH WATCHDOG.
//
//   node visual-pass/autopush.js [intervalSeconds]
//
// The owner's power keeps cutting mid-session and work was being lost. The
// post-commit hook was not enough: it only fires when *I* commit, and agents
// write files continuously for twenty or thirty minutes between my commits, so
// a cut in that window took everything since the last one.
//
// This does not care who wrote the files or whether anyone is paying attention.
// Every interval it stages everything, commits if the tree is dirty, and pushes
// the current branch AND main. Nothing else in the session has to remember.
//
// It is deliberately dumb and deliberately unkillable-by-error: any failure is
// logged and the timer keeps running, because a watchdog that exits on the first
// transient network blip is worse than none -- it looks like it is working.
// ---------------------------------------------------------------------------
var cp = require("child_process");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var EVERY = Math.max(30, parseInt(process.argv[2] || "120", 10)) * 1000;

function git(args, quiet) {
  try {
    return cp.execSync("git " + args, {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", quiet ? "ignore" : "pipe"]
    }).trim();
  } catch (e) {
    return { err: ((e.stdout || "") + (e.stderr || "")).trim() || e.message };
  }
}

function stamp() {
  // Date is fine here -- this is a standalone process, not a workflow script.
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function tick() {
  var dirty = git("status --porcelain", true);
  if (dirty && dirty.err) { log("status failed: " + dirty.err); return; }
  if (!dirty) { return; }                       // nothing to do, stay quiet

  var files = dirty.split("\n").length;
  git("add -A", true);

  var msg = "wip: autosave " + stamp() + " (" + files + " file" +
            (files === 1 ? "" : "s") + ")\n\n" +
            "Committed by the autopush watchdog, not by a person. The owner's\n" +
            "power cuts mid-session and agents write for long stretches between\n" +
            "manual commits, so this exists to make sure an interruption can\n" +
            "never cost more than one interval.\n\n" +
            "Squash these freely -- they are save points, not history.";
  var c = git("-c user.name=\"autopush\" -c user.email=\"noreply@anthropic.com\" " +
              "commit -q -F -", true);
  if (c && c.err) {
    // commit -F - needs stdin; fall back to -m with the message inline.
    try {
      cp.execSync("git -c user.name=\"autopush\" -c user.email=\"noreply@anthropic.com\" commit -q -m " +
        JSON.stringify(msg), { cwd: ROOT, stdio: "ignore" });
    } catch (e) { log("commit failed: " + e.message); return; }
  }

  var branch = git("rev-parse --abbrev-ref HEAD", true);
  if (branch && branch.err) { log("branch read failed"); return; }

  var p = git("push -q origin " + JSON.stringify(branch), true);
  if (p && p.err) { log("push failed (" + branch + "): " + p.err.split("\n")[0]); return; }

  // Keep main level with the working branch -- the owner wants everything there.
  if (branch !== "main") {
    git("branch -f main " + JSON.stringify(branch), true);
    var pm = git("push -q --force-with-lease origin main", true);
    if (pm && pm.err) log("main push failed: " + pm.err.split("\n")[0]);
  }

  log("pushed " + git("rev-parse --short HEAD", true) + "  " + files + " files  [" + branch + "]");
}

function log(s) { process.stdout.write("[autopush " + stamp() + "] " + s + "\n"); }

log("watching " + ROOT + " every " + (EVERY / 1000) + "s");
tick();
setInterval(tick, EVERY);
process.on("uncaughtException", function (e) { log("recovered: " + e.message); });
