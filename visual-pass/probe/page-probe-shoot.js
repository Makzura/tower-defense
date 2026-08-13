// ---------------------------------------------------------------------------
// TDProbe.shoot -- picture-making, bolted onto the measurement probe.
//
// Loaded AFTER page-probe.js. Everything here reads frames the probe already
// captured, so a 1:1 image and its magnified twin come from the SAME pixels
// rather than from two renders. That is the whole discipline kaz asked for:
// re-rendering closer changes the read; an integer nearest-neighbour upscale of
// a real capture preserves it exactly and only makes it visible.
// ---------------------------------------------------------------------------
(function () {
  "use strict";
  var TDProbe = window.TDProbe;

  function glSize() {
    var c = document.getElementById("gl");
    return [c.width, c.height];
  }

  // readPixels rows are BOTTOM-UP. Everything a human reads is top-down, so the
  // flip happens exactly here and nowhere else.
  function imageDataFrom(buf, roi) {
    var s = glSize(), W = s[0], H = s[1];
    var x0 = Math.max(0, roi ? roi[0] | 0 : 0);
    var y0 = Math.max(0, roi ? roi[1] | 0 : 0);
    var w = Math.min(W - x0, roi ? roi[2] | 0 : W);
    var h = Math.min(H - y0, roi ? roi[3] | 0 : H);
    var out = new Uint8ClampedArray(w * h * 4);
    for (var y = 0; y < h; y++) {
      var srcRow = (H - 1 - (y0 + y));          // top-down -> bottom-up
      for (var x = 0; x < w; x++) {
        var si = (srcRow * W + (x0 + x)) * 4;
        var di = (y * w + x) * 4;
        out[di] = buf[si]; out[di + 1] = buf[si + 1];
        out[di + 2] = buf[si + 2]; out[di + 3] = 255;
      }
    }
    return new ImageData(out, w, h);
  }

  TDProbe.pngFrom = function (key, roi, scale, caption) {
    var buf = TDProbe.frames[key];
    if (!buf) throw new Error("no frame " + key);
    var img = imageDataFrom(buf, roi);
    var k = Math.max(1, Math.round(scale || 1));

    var base = document.createElement("canvas");
    base.width = img.width; base.height = img.height;
    base.getContext("2d").putImageData(img, 0, 0);

    var lines = caption || [];
    var lineH = 15, pad = 8;
    var capH = lines.length ? lines.length * lineH + pad * 2 : 0;

    var out = document.createElement("canvas");
    // THE CAPTION MUST NOT BE CLIPPED. On a narrow crop the provenance line is
    // wider than the picture, and a commit hash cut off mid-string is exactly
    // the information this caption exists to carry. Measure the text and widen
    // the canvas to fit it.
    var meas = document.createElement("canvas").getContext("2d");
    meas.font = "12px Consolas, monospace";
    var textW = 0;
    for (var mi = 0; mi < lines.length; mi++) {
      var tw2 = meas.measureText(lines[mi]).width;
      if (tw2 > textW) textW = tw2;
    }
    out.width = Math.max(img.width * k, Math.ceil(textW) + pad * 2);
    out.height = img.height * k + capH;
    var g = out.getContext("2d");
    g.fillStyle = "#0b0c11";
    g.fillRect(0, 0, out.width, out.height);
    // NEAREST NEIGHBOUR. A magnified pixel must stay a pixel; an interpolator
    // invents detail that the game never drew, which is the exact thing this
    // image exists to avoid.
    g.imageSmoothingEnabled = false;
    g.mozImageSmoothingEnabled = false;
    g.webkitImageSmoothingEnabled = false;
    g.msImageSmoothingEnabled = false;
    g.drawImage(base, 0, 0, img.width, img.height,
                0, 0, img.width * k, img.height * k);

    if (capH) {
      g.imageSmoothingEnabled = true;
      g.fillStyle = "#0b0c11";
      g.fillRect(0, img.height * k, out.width, capH);
      g.font = "12px Consolas, monospace";
      g.textBaseline = "top";
      for (var i = 0; i < lines.length; i++) {
        g.fillStyle = i === 0 ? "#e8e8ee" : "#9aa0b0";
        g.fillText(lines[i], pad, img.height * k + pad + i * lineH);
      }
    }
    return out.toDataURL("image/png");
  };

  // Five bodies, one board, one frame index, one yaw.
  //
  // Position is pinned DIRECTLY and `progress` is used only to drive the walk
  // index and the yaw -- the two things it actually feeds. That decouples where
  // a body stands from which frame it is on, which is otherwise impossible:
  // every type has its own `stride` (radiusPx * 2.6) and `enemy-angry` has 12
  // frames against everyone else's 8, so equal progress means DIFFERENT frames
  // and a lineup laid out the obvious way silently compares frame 3 against
  // frame 5.
  TDProbe.lineup = function (specs, k, straightAt) {
    enemies.length = 0;
    TDProbe._line = [];
    for (var i = 0; i < specs.length; i++) {
      var sp = specs[i];
      var e = new Enemy(path, 100000, sp.typeId, { routeId: 0 });
      e.laneOffsetUl = 0;
      var m = GLModels.get(World3D.renderer(), "enemy-" + sp.typeId);
      var n = m && m.frames.length ? m.frames.length : 1;
      var stride = e.radiusPx() * 2.6;
      var base = Math.round((straightAt || 60) / stride) * stride;
      e.progress = base + ((k % n) + 0.5) * stride / n;
      e.refreshPos();
      e.pos.x = sp.x; e.pos.y = sp.y;
      enemies.push(e);
      TDProbe._line.push({
        typeId: sp.typeId, x: sp.x, y: sp.y, frames: n,
        walk: Math.floor(e.progress / stride * n) % n,
        yaw: TDProbe.yawAt(e.progress), radius: e.radiusPx(),
        model: "enemy-" + sp.typeId,
        registered: GLModels.has("enemy-" + sp.typeId)
      });
    }
    return TDProbe._line;
  };

  // Re-pin every body's pos and frame without rebuilding anything, so a
  // sequence of frames is the same five objects.
  TDProbe.lineupFrame = function (k, straightAt) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i], sp = TDProbe._line[i];
      var stride = e.radiusPx() * 2.6;
      var base = Math.round((straightAt || 60) / stride) * stride;
      e.progress = base + ((k % sp.frames) + 0.5) * stride / sp.frames;
      e.pos.x = sp.x; e.pos.y = sp.y;
    }
    return TDProbe._line.map(function (s, i) {
      var e = enemies[i], stride = e.radiusPx() * 2.6;
      return { typeId: s.typeId, walk: Math.floor(e.progress / stride * s.frames) % s.frames };
    });
  };

  // Each body's own screen box, measured by removing it and diffing -- so the
  // crop is derived from where the bodies ARE rather than guessed, and a body
  // that failed to draw is visible as an empty box instead of as a gap nobody
  // notices.
  TDProbe.lineupBoxes = function () {
    var all = enemies.slice();
    TDProbe.warm(1); TDProbe.cap("__full");
    var boxes = [];
    for (var i = 0; i < all.length; i++) {
      enemies.length = 0;
      for (var j = 0; j < all.length; j++) if (j !== i) enemies.push(all[j]);
      TDProbe.warm(1); TDProbe.cap("__minus");
      var d = TDProbe.diff("__full", "__minus", 0);
      boxes.push({ typeId: TDProbe._line[i].typeId, changed: d.changed, bboxGL: d.bboxGL });
    }
    enemies.length = 0;
    for (var q = 0; q < all.length; q++) enemies.push(all[q]);
    TDProbe.warm(1);
    return boxes;
  };

  return "TDProbe.shoot installed";
})();

// ---------------------------------------------------------------------------
// The comparison strip: N captures of the SAME board spot, one per body,
// cropped to the SAME box and tiled.
//
// This is the fair form of "does it read as a different enemy". A lineup laid
// along the road puts the five at different depths, different ground heights
// and different distances from the camera, so a body can look distinct because
// it is nearer rather than because it is different. Here only the model
// changes: same spot, same lighting, same frame, same yaw, same crop.
// Still real game pixels at the real camera -- the tiling happens after
// capture, never before.
// ---------------------------------------------------------------------------
(function () {
  "use strict";
  var TDProbe = window.TDProbe;

  TDProbe.stripFrom = function (keys, labels, roi, scale, caption, gap) {
    var k = Math.max(1, Math.round(scale || 1));
    var g0 = gap === undefined ? 6 : gap;
    var tiles = [];
    for (var i = 0; i < keys.length; i++) {
      var url = TDProbe.pngFrom(keys[i], roi, 1, null);
      tiles.push(url);
    }
    var tw = roi[2], th = roi[3];
    var labH = labels && labels.length ? 20 : 0;
    var lines = caption || [];
    var lineH = 15, pad = 8;
    var capH = lines.length ? lines.length * lineH + pad * 2 : 0;

    var out = document.createElement("canvas");
    // SAME CAPTION-CLIPPING FIX AS pngFrom, and it was missing here. At 4x the
    // strip is narrower than its own provenance line, so the yaw label and the
    // commit hashes were cut off mid-string -- the exact information the
    // caption exists to carry. Fixing it in one place and not the other is how
    // a repaired defect comes back on the path nobody re-checked.
    var meas2 = document.createElement("canvas").getContext("2d");
    meas2.font = "12px Consolas, monospace";
    var textW2 = 0;
    for (var mj = 0; mj < lines.length; mj++) {
      var w2 = meas2.measureText(lines[mj]).width;
      if (w2 > textW2) textW2 = w2;
    }
    out.width = Math.max(keys.length * (tw * k) + (keys.length + 1) * g0,
                         Math.ceil(textW2) + pad * 2);
    out.height = th * k + labH + capH + g0 * 2;
    var g = out.getContext("2d");
    g.fillStyle = "#0b0c11";
    g.fillRect(0, 0, out.width, out.height);

    var loaded = 0;
    // Synchronous draw path: the tiles are data URLs we just produced from
    // canvases in this same document, so decode them back through an Image and
    // wait. Kept as a promise so the caller can await it.
    return new Promise(function (resolve) {
      var imgs = [];
      for (var j = 0; j < tiles.length; j++) {
        (function (idx) {
          var im = new Image();
          im.onload = function () {
            imgs[idx] = im;
            if (++loaded === tiles.length) finish(imgs);
          };
          im.src = tiles[idx];
        })(j);
      }
      function finish(imgs2) {
        g.imageSmoothingEnabled = false;
        g.mozImageSmoothingEnabled = false;
        g.webkitImageSmoothingEnabled = false;
        g.msImageSmoothingEnabled = false;
        for (var q = 0; q < imgs2.length; q++) {
          var x = g0 + q * (tw * k + g0);
          g.drawImage(imgs2[q], 0, 0, tw, th, x, g0, tw * k, th * k);
        }
        if (labH) {
          g.imageSmoothingEnabled = true;
          g.font = "bold 13px Consolas, monospace";
          g.textBaseline = "top";
          g.fillStyle = "#e8e8ee";
          for (var L = 0; L < labels.length; L++) {
            var lx = g0 + L * (tw * k + g0);
            g.fillText(labels[L], lx + 4, g0 + th * k + 4);
          }
        }
        if (capH) {
          g.font = "12px Consolas, monospace";
          g.textBaseline = "top";
          for (var c2 = 0; c2 < lines.length; c2++) {
            g.fillStyle = c2 === 0 ? "#e8e8ee" : "#9aa0b0";
            g.fillText(lines[c2], pad, g0 + th * k + labH + pad + c2 * lineH);
          }
        }
        resolve(out.toDataURL("image/png"));
      }
    });
  };
})();
