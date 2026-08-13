// Static file server for the pixel probe. No dependencies.
//
// WHY HTTP AND NOT file://. The game ships runnable from file:// and that is
// not negotiable -- nothing here changes it. But assets/*.png are loaded with
// Image() and over file:// they taint any 2D canvas they are drawn into, so
// getImageData throws and the probe measures nothing. Serving the SAME files
// over http://127.0.0.1 makes them same-origin. The bytes are identical; only
// the origin differs.
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..", "..");

var TYPES = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json"
};

function start(port, cb) {
  var server = http.createServer(function (req, res) {
    var rel = decodeURIComponent(req.url.split("?")[0]);
    var file = path.join(ROOT, rel);
    if (file.indexOf(ROOT) !== 0) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, function (err, buf) {
      if (err) { res.writeHead(404); res.end("404 " + rel); return; }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      res.end(buf);
    });
  });
  server.listen(port, "127.0.0.1", function () { cb(null, server); });
  server.on("error", cb);
}

module.exports = { start: start, ROOT: ROOT };

if (require.main === module) {
  start(Number(process.argv[2]) || 8793, function (e, s) {
    if (e) throw e;
    console.log("serving " + ROOT + " on " + s.address().port);
  });
}
