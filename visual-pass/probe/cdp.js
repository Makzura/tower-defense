// Minimal Chrome DevTools Protocol client. Node 24 has a global WebSocket and
// a global fetch, so this needs no npm package and adds no toolchain.
"use strict";

var childProcess = require("child_process");
var fs = require("fs");
var os = require("os");
var path = require("path");

var CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function launch(port, profileDir) {
  fs.mkdirSync(profileDir, { recursive: true });
  var args = [
    "--headless=new",
    "--remote-debugging-port=" + port,
    "--user-data-dir=" + profileDir,
    "--no-first-run", "--no-default-browser-check", "--no-sandbox",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--window-size=1280,720",
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    // SOFTWARE RASTERISATION ON PURPOSE. A null control has to reach exactly
    // zero, and a real GPU driver is free to vary sample resolve order between
    // frames. SwiftShader is deterministic, so "0 differing pixels" means what
    // it says instead of meaning "below this driver's noise".
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--disable-gpu-vsync",
    "about:blank"
  ];
  var child = childProcess.spawn(CHROME, args, { stdio: "ignore" });
  return child;
}

async function waitForDevTools(port, tries) {
  for (var i = 0; i < (tries || 60); i++) {
    try {
      var r = await fetch("http://127.0.0.1:" + port + "/json/version");
      if (r.ok) return await r.json();
    } catch (e) { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("devtools never came up on " + port);
}

function Session(ws) {
  this.ws = ws;
  this.id = 0;
  this.pending = Object.create(null);
  var self = this;
  ws.addEventListener("message", function (ev) {
    var msg = JSON.parse(ev.data);
    if (msg.id && self.pending[msg.id]) {
      var p = self.pending[msg.id];
      delete self.pending[msg.id];
      if (msg.error) p.reject(new Error(msg.error.message + " (" + msg.error.code + ")"));
      else p.resolve(msg.result);
    }
  });
}

Session.prototype.send = function (method, params) {
  var self = this;
  var id = ++this.id;
  return new Promise(function (resolve, reject) {
    self.pending[id] = { resolve: resolve, reject: reject };
    self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
  });
};

// Evaluate an expression in the page and return its VALUE, throwing on a page
// exception rather than silently handing back undefined -- a probe that
// swallows a page error reports a clean zero, which is the most believable
// wrong answer there is.
Session.prototype.evaluate = async function (expr, awaitPromise) {
  var r = await this.send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: !!awaitPromise,
    userGesture: true
  });
  if (r.exceptionDetails) {
    var d = r.exceptionDetails;
    var text = (d.exception && (d.exception.description || d.exception.value)) || d.text;
    throw new Error("page threw: " + text);
  }
  return r.result.value;
};

async function open(port, url) {
  var r = await fetch("http://127.0.0.1:" + port + "/json/new?" + encodeURIComponent(url),
    { method: "PUT" });
  var target = await r.json();
  var ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(function (res, rej) {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });
  var s = new Session(ws);
  await s.send("Runtime.enable");
  await s.send("Page.enable");
  return { session: s, target: target };
}

module.exports = { launch: launch, waitForDevTools: waitForDevTools, open: open,
                   sleep: sleep, CHROME: CHROME };
