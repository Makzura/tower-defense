// EVERY REGISTERED MODEL'S FRAME COUNT, and which renderer path reads it.
//
// Asked because a banded model (walk frames plus a state pose in one list)
// breaks any consumer that treats `frames.length` as the cycle length, and two
// candidate fixes turn on a fact nobody had measured: do the shipped bodies
// even agree on a cycle length? A single renderer-side ENEMY_WALK_FRAMES
// constant is only viable if they do.
//
//   node visual-pass/probe/frame-census.js
"use strict";
var fs = require("fs"), path = require("path"), os = require("os");
var cdp = require("./cdp"), serve = require("./serve");
var PORT = 8799, DEVTOOLS = 9339;
var GAME_URL = "http://127.0.0.1:" + PORT + "/game/index.html";

async function main() {
  var server = await new Promise(function (r, j) {
    serve.start(PORT, function (e, s) { e ? j(e) : r(s); });
  });
  var chrome = cdp.launch(DEVTOOLS, path.join(os.tmpdir(), "td-probe-census"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn = await cdp.open(DEVTOOLS, GAME_URL);
  var S = conn.session;
  try {
    for (var i = 0; i < 80; i++) {
      if (await S.evaluate("typeof startRun === 'function' && typeof World3D !== 'undefined'")) break;
      await cdp.sleep(250);
    }
    await S.evaluate(fs.readFileSync(path.join(__dirname, "page-probe.js"), "utf8"));
    await S.evaluate("TDProbe.setup()");
    await S.evaluate("TDProbe.camDefault()");
    await S.evaluate("TDProbe.warm(2)");
    var out = JSON.parse(await S.evaluate("JSON.stringify((function(){" +
      " var r = World3D.renderer();" +
      " var rows = GLModels.names().map(function(n){" +
      "   var m = GLModels.get(r, n);" +
      "   return { name:n, frames: m && m.frames ? m.frames.length : 0," +
      "            groups: m && m.groups ? m.groups.length : 0 };});" +
      " rows.sort(function(a,b){return a.name<b.name?-1:1;});" +
      " var byPrefix = {};" +
      " rows.forEach(function(x){ var p = x.name.split('-')[0];" +
      "   (byPrefix[p] = byPrefix[p] || []).push(x.frames); });" +
      " return { rows: rows, byPrefix: byPrefix };})())"));
    console.log(JSON.stringify(out, null, 1));
  } finally {
    try { await S.send("Browser.close"); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
}
main().catch(function (e) { console.error("CENSUS FAILED: " + e.stack); process.exit(1); });
