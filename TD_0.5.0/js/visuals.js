// ---------------------------------------------------------------------------
// Visuals3Q -- shared three-quarter-view drawing helpers.
//
// Gameplay still lives in the original, flat world coordinates. This module
// changes only how that world is painted: ground objects become ellipses,
// structures gain a visible side wall, upright bodies lift above their contact
// point, and every tall object casts its shadow down-right. Keeping projection
// here presentation-only means range, placement, targeting and pathing stay
// pixel-for-pixel identical while the board reads like a raised fantasy diorama.
// ---------------------------------------------------------------------------

var Visuals3Q = (function () {
  var GROUND_SQUASH = 0.56;
  var LIGHT_X = -0.35;
  var LIGHT_Y = -0.8;

  function ellipse(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  }

  function shadow(ctx, x, y, rx, ry, alpha, lift) {
    var reach = 4 + (lift || 0) * 0.32;
    ellipse(ctx, x + reach, y + reach * 0.7, rx, ry);
    ctx.fillStyle = "rgba(6,13,11," + (alpha === undefined ? 0.28 : alpha) + ")";
    ctx.fill();
  }

  // A short raised cylinder viewed from above. Stacking the side ellipses is
  // intentionally simple and robust on file:// canvas: the exposed lower
  // crescent is the side wall, while the final ellipse is the lit top face.
  function platform(ctx, x, groundY, radius, options) {
    options = options || {};
    var ry = radius * (options.squash || GROUND_SQUASH);
    var height = options.height === undefined ? 7 : options.height;
    var topY = groundY - height;
    var side = options.side || "#2e3b35";
    var top = options.top || "#43564b";
    var rim = options.rim || "rgba(210,232,214,0.65)";

    shadow(ctx, x, groundY + 2, radius * 1.08, ry * 0.95,
      options.shadowAlpha === undefined ? 0.3 : options.shadowAlpha, height);

    for (var layer = 0; layer <= height; layer += 2) {
      ellipse(ctx, x, groundY - layer, radius, ry);
      ctx.fillStyle = side;
      ctx.fill();
    }

    ellipse(ctx, x, topY, radius, ry);
    ctx.fillStyle = top;
    ctx.fill();
    ctx.lineWidth = options.lineWidth || 2;
    ctx.strokeStyle = rim;
    ctx.stroke();

    // A soft highlight on the upper-left rim fixes the light direction for the
    // whole board and gives even a tiny build-slot-sized platform some volume.
    ctx.beginPath();
    ctx.ellipse(x, topY, radius * 0.82, ry * 0.78, 0,
      Math.PI * 1.03, Math.PI * 1.78);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = options.highlight || "rgba(255,255,235,0.32)";
    ctx.stroke();

    return { x: x, y: topY, rx: radius, ry: ry, height: height };
  }

  // A square machine base turned into a raised rhombus. It keeps the strong
  // angular silhouette of the Warbringer while matching the same camera as
  // circular tower pads.
  function diamondPlatform(ctx, x, groundY, halfWidth, options) {
    options = options || {};
    var halfHeight = halfWidth * (options.squash || 0.62);
    var height = options.height === undefined ? 7 : options.height;
    var topY = groundY - height;

    shadow(ctx, x, groundY + 2, halfWidth * 1.12, halfHeight * 0.9,
      options.shadowAlpha === undefined ? 0.32 : options.shadowAlpha, height);

    ctx.beginPath();
    ctx.moveTo(x - halfWidth, topY);
    ctx.lineTo(x, topY + halfHeight);
    ctx.lineTo(x, groundY + halfHeight);
    ctx.lineTo(x - halfWidth, groundY);
    ctx.closePath();
    ctx.fillStyle = options.left || "#252a31";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + halfWidth, topY);
    ctx.lineTo(x, topY + halfHeight);
    ctx.lineTo(x, groundY + halfHeight);
    ctx.lineTo(x + halfWidth, groundY);
    ctx.closePath();
    ctx.fillStyle = options.right || "#171b21";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, topY - halfHeight);
    ctx.lineTo(x + halfWidth, topY);
    ctx.lineTo(x, topY + halfHeight);
    ctx.lineTo(x - halfWidth, topY);
    ctx.closePath();
    ctx.fillStyle = options.top || "#3b424f";
    ctx.fill();
    ctx.lineWidth = options.lineWidth || 2;
    ctx.strokeStyle = options.rim || "#818a9e";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - halfWidth * 0.78, topY - halfHeight * 0.05);
    ctx.lineTo(x, topY - halfHeight * 0.78);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = options.highlight || "rgba(255,255,255,0.28)";
    ctx.stroke();

    return { x: x, y: topY, rx: halfWidth, ry: halfHeight, height: height };
  }

  function crystal(ctx, x, baseY, width, height, colors) {
    colors = colors || {};
    shadow(ctx, x, baseY + 2, width * 0.7, width * 0.28, 0.22, height);

    ctx.beginPath();
    ctx.moveTo(x, baseY - height);
    ctx.lineTo(x + width, baseY - height * 0.34);
    ctx.lineTo(x + width * 0.55, baseY);
    ctx.lineTo(x - width * 0.55, baseY);
    ctx.lineTo(x - width, baseY - height * 0.34);
    ctx.closePath();
    ctx.fillStyle = colors.main || "#a998ff";
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = colors.rim || "rgba(244,240,255,0.8)";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, baseY - height);
    ctx.lineTo(x, baseY - height * 0.2);
    ctx.lineTo(x - width * 0.55, baseY);
    ctx.lineTo(x - width, baseY - height * 0.34);
    ctx.closePath();
    ctx.fillStyle = colors.light || "rgba(238,232,255,0.48)";
    ctx.fill();
  }

  // Grass and stone are deterministic: restarting or pausing never makes the
  // background shimmer, and no gameplay random number is consumed.
  function terrain(ctx, width, height) {
    ctx.fillStyle = "#203b2f";
    ctx.fillRect(0, 0, width, height);

    var tileW = 72;
    var tileH = 38;
    for (var row = -1; row < Math.ceil(height / tileH) + 1; row++) {
      for (var col = -1; col < Math.ceil(width / tileW) + 1; col++) {
        var x = col * tileW + ((row & 1) ? tileW / 2 : 0);
        var y = row * tileH;
        ctx.beginPath();
        ctx.moveTo(x, y - tileH * 0.45);
        ctx.lineTo(x + tileW * 0.48, y);
        ctx.lineTo(x, y + tileH * 0.45);
        ctx.lineTo(x - tileW * 0.48, y);
        ctx.closePath();
        ctx.fillStyle = ((row + col) & 1)
          ? "rgba(112,153,101,0.055)" : "rgba(9,24,19,0.045)";
        ctx.fill();
      }
    }

    // Sparse low vegetation. It stays behind the road and every actor, so it
    // enriches empty grass without pretending to be an obstacle.
    for (var i = 0; i < 54; i++) {
      var gx = 24 + ((i * 173 + 47) % Math.max(1, width - 48));
      var gy = 34 + ((i * 97 + 31) % Math.max(1, height - 94));
      var size = 2 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx - size, gy - size * 2.2);
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + size * 0.4, gy - size * 2.5);
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + size, gy - size * 1.8);
      ctx.lineWidth = 1;
      ctx.strokeStyle = (i % 4 === 0)
        ? "rgba(144,191,112,0.30)" : "rgba(70,119,78,0.34)";
      ctx.stroke();
    }

    // Directional ambient light and a bottom vignette, built from flat bands
    // instead of gradients so the game's dependency-free test canvas can draw
    // the exact same frame path as a browser.
    ctx.fillStyle = "rgba(244,226,166,0.025)";
    ctx.fillRect(0, 0, width, height * 0.42);
    for (var band = 0; band < 5; band++) {
      ctx.fillStyle = "rgba(4,12,10," + (0.012 + band * 0.008).toFixed(3) + ")";
      ctx.fillRect(0, height - (band + 1) * 18, width, 18);
    }
  }

  function groundBurst(ctx, x, y, radius, color, alpha, progress) {
    var ry = radius * GROUND_SQUASH;
    ellipse(ctx, x, y, radius, ry);
    ctx.lineWidth = Math.max(1, 5 * (1 - progress));
    ctx.strokeStyle = "rgba(" + color + "," + alpha.toFixed(3) + ")";
    ctx.stroke();
  }

  return {
    GROUND_SQUASH: GROUND_SQUASH,
    LIGHT_X: LIGHT_X,
    LIGHT_Y: LIGHT_Y,
    ellipse: ellipse,
    shadow: shadow,
    platform: platform,
    diamondPlatform: diamondPlatform,
    crystal: crystal,
    terrain: terrain,
    groundBurst: groundBurst
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Visuals3Q;
}
