// ---------------------------------------------------------------------------
// VisualModels -- replaceable presentation registry.
//
// A model pack can replace any visual without touching simulation code:
//
//   VisualModels.register("tower", "soldier:body", function (ctx, tower) { ... });
//   VisualModels.register("enemy", "fractal_slime:body", function (ctx, enemy, options) { ... });
//   VisualModels.register("summon", "soldier-recruit-b5:body", function (ctx, recruit) { ... });
//   VisualModels.register("projectile", "pierce", function (ctx, shot) { ... });
//   VisualModels.register("map", "rune-circuit:terrain", function (ctx, view) { ... });
//   VisualModels.register("effect", "arcane-aoe", function (ctx, effect) { ... });
//
// Return `false` from a renderer to ask for the built-in fallback. Any other
// return value means the custom model handled the draw. Use `:body` to replace
// only a skin while preserving ranges, bars and ability feedback; `:complete`
// replaces that object's entire renderer. `*` is a category-wide
// fallback, so a complete skin pack can replace every enemy or map at once.
// Model functions receive live objects but must treat them as READ-ONLY: this
// registry is presentation, and simulation never reads anything back from it.
// ---------------------------------------------------------------------------

var VisualModels = (function () {
  var categories = {
    tower: {},
    enemy: {},
    summon: {},
    projectile: {},
    map: {},
    effect: {},
    ui: {}
  };

  // Per-model MEASUREMENTS, kept beside the renderers.
  //
  // A skin changes how big a thing looks, and some of the game's own
  // furniture has to follow it: a health bar sits above the head, and "the
  // head" is 11 px up for a built-in body and 50 px up for a sprite. The
  // renderer is the only thing that knows, so it says so here and callers
  // ask, falling back to the built-in geometry when no pack is installed.
  //
  // Measurements only. Nothing the simulation reads -- hit boxes, ranges and
  // claim distances all still come from radiusPx and the config.
  var measurements = {};

  function measureKey(category, id) {
    return category + "/" + id;
  }

  function registerMetric(category, id, name, fn) {
    var key = measureKey(category, id);
    if (!measurements[key]) measurements[key] = {};
    measurements[key][name] = fn;
    return fn;
  }

  function metric(category, id, name, subject, fallback) {
    var group = measurements[measureKey(category, id)] ||
      measurements[measureKey(category, "*")];
    if (!group || typeof group[name] !== "function") return fallback;
    var value = group[name](subject);
    return (value === undefined || value === null) ? fallback : value;
  }

  function bucket(category) {
    if (!categories[category]) {
      throw new Error("VisualModels: unknown category '" + category + "'");
    }
    return categories[category];
  }

  function register(category, id, renderer) {
    if (typeof renderer !== "function") {
      throw new Error("VisualModels: renderer for " + category + "/" + id + " must be a function");
    }
    bucket(category)[id] = renderer;
    return renderer;
  }

  function unregister(category, id) {
    delete bucket(category)[id];
    delete measurements[measureKey(category, id)];
  }

  function renderer(category, id) {
    var group = bucket(category);
    return group[id] || group["*"] || null;
  }

  function draw(category, id, ctx, subject, options) {
    var model = renderer(category, id);
    if (!model) return false;
    return model(ctx, subject, options) !== false;
  }

  // Install a whole named pack in one call. Shape:
  // { tower: { soldier: fn }, enemy: { "*": fn }, ... }
  function install(pack) {
    if (!pack) return;
    Object.keys(pack).forEach(function (category) {
      var entries = pack[category];
      Object.keys(entries).forEach(function (id) {
        register(category, id, entries[id]);
      });
    });
  }

  // Presentation-only styling shared by still sprites and sprite sheets.
  // A dark cut-out on a dark board sometimes needs a one-pixel rim, and a
  // hit flash needs to brighten the ART without asking Enemy.draw to know how
  // that art was authored. These are ordinary canvas state fields, wrapped in
  // save/restore by both callers below, so a skin can never leak its treatment
  // into the map or the next model.
  // ONE scratch canvas for every tint on the board, grown to the largest tile
  // that has asked for one and never shrunk. Allocating per draw would trade a
  // filter pass for a canvas allocation, which is not obviously the better
  // deal; a single reused surface makes the tint two blits and nothing else.
  var scratchCanvas = null;

  function tintScratch(width, height) {
    if (!scratchCanvas) {
      if (typeof document === "undefined") return null;
      scratchCanvas = document.createElement("canvas");
      scratchCanvas.width = 0;
      scratchCanvas.height = 0;
    }
    if (scratchCanvas.width < width) scratchCanvas.width = width;
    if (scratchCanvas.height < height) scratchCanvas.height = height;
    return scratchCanvas;
  }

  function applySpriteStyle(ctx, spec, subject, value) {
    var filter = value("filter", subject, null);
    if (filter && "filter" in ctx) ctx.filter = filter;

    var shadowColor = value("shadowColor", subject, null);
    if (!shadowColor) return;
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = value("shadowBlur", subject, 0);
    ctx.shadowOffsetX = value("shadowOffsetX", subject, 0);
    ctx.shadowOffsetY = value("shadowOffsetY", subject, 0);
  }

  // Convenience for ordinary PNG/WebP/SVG skins. It lazy-loads the asset the
  // first time the model is asked to draw and falls back to the built-in model
  // until the image is ready. `spec.position(subject, options)` may override
  // the default x/y discovery; width, height and lift may be numbers or
  // functions of the live subject.
  function registerSprite(category, id, source, spec) {
    spec = spec || {};
    var image = null;

    function value(field, subject, fallback) {
      var chosen = spec[field];
      if (typeof chosen === "function") return chosen(subject);
      return chosen === undefined ? fallback : chosen;
    }

    return register(category, id, function (ctx, subject, options) {
      if (typeof Image === "undefined") return false;
      if (!image) {
        image = new Image();
        image.src = source;
      }
      if (!image.complete || !image.naturalWidth) return false;

      var position;
      if (typeof spec.position === "function") {
        position = spec.position(subject, options);
      } else if (subject && subject.pos) {
        position = { x: subject.pos.x,
          y: subject.visualBodyY ? subject.visualBodyY() : subject.pos.y };
      } else {
        position = { x: subject.x === undefined ? subject.cx : subject.x,
          y: subject.y === undefined ? subject.cy : subject.y };
      }

      var naturalW = image.naturalWidth || 32;
      var naturalH = image.naturalHeight || 32;
      var width = value("width", subject, naturalW);
      var height = value("height", subject, naturalH);
      var lift = value("lift", subject, 0);
      var anchorX = value("anchorX", subject, 0.5);
      var anchorY = value("anchorY", subject, 1);

      ctx.save();
      applySpriteStyle(ctx, spec, subject, value);
      if (spec.alpha !== undefined) ctx.globalAlpha *= value("alpha", subject, 1);
      ctx.drawImage(image,
        position.x - width * anchorX,
        position.y - lift - height * anchorY,
        width, height);
      ctx.restore();
      return true;
    });
  }

  // Convenience for ANIMATED, DIRECTIONAL skins: one PNG laid out as a grid,
  // one row per facing direction, one column per animation frame. This is the
  // shape tools/blender/td_scene.py renders, and the two have to agree.
  //
  //   VisualModels.registerSpriteSheet("enemy", "normal:body",
  //     "assets/normal_walk.png", {
  //       frameWidth: 128, frameHeight: 160, frames: 8, directions: 8, fps: 9,
  //       direction: function (e) { return e.path.tangentAt(e.progress); },
  //       width: function (e) { return e.radiusPx() * 3.6; }
  //     });
  //
  // WHY A GRID AND NOT LOOSE FRAMES. 22 enemy types at 8 directions and 8
  // frames is 1408 files if each frame is its own image, and every one of
  // them is a separate lazy load. One sheet per state per type is 44 files
  // and one decode.
  //
  // WHY `direction` TAKES A VECTOR, NOT AN ANGLE. Callers hand back whatever
  // they already have -- a path tangent, a velocity, an aim vector -- and the
  // projection maths below is done in ONE place. See directionRow.
  //
  // Animation is clock-driven and loops. A one-shot (a death that must not
  // restart) needs a `frame` function that returns its own index; the
  // registry deliberately holds no per-subject state, because it is
  // presentation and the simulation never reads anything back from it.
  function registerSpriteSheet(category, id, source, spec) {
    spec = spec || {};
    var image = null;

    function value(field, subject, fallback) {
      var chosen = spec[field];
      if (typeof chosen === "function") return chosen(subject);
      return chosen === undefined ? fallback : chosen;
    }

    // Where the drawn sprite's ground line is, in world pixels. Shared by the
    // renderer and by the topY metric so the two can never disagree.
    function baseY(subject, options) {
      if (typeof spec.position === "function") {
        return spec.position(subject, options).y;
      }
      if (subject && subject.pos) return subject.pos.y;
      return subject.y === undefined ? subject.cy : subject.y;
    }

    var registered = register(category, id, function (ctx, subject, options) {
      if (typeof Image === "undefined") return false;
      if (!image) {
        image = new Image();
        image.src = source;
      }
      // Not an error: the built-in model draws this frame instead, and the
      // sprite takes over silently once the decode finishes.
      if (!image.complete || !image.naturalWidth) return false;

      var directions = spec.directions || 1;
      var frames = spec.frames || 1;
      var directionRows = spec.directionRows || directions;
      var directionPages = Math.ceil(directions / directionRows);
      var tileW = spec.frameWidth ||
        (image.naturalWidth / (frames * directionPages));
      var tileH = spec.frameHeight ||
        (image.naturalHeight / directionRows);

      var row = 0;
      if (directions > 1 && typeof spec.direction === "function") {
        row = directionRow(spec.direction(subject, options), directions);
      }

      var column;
      if (typeof spec.frame === "function") {
        column = Math.floor(spec.frame(subject, options)) % frames;
        if (column < 0) column += frames;
      } else {
        var fps = spec.fps || 10;
        column = Math.floor(now() / 1000 * fps) % frames;
      }

      // High-resolution 48-facing actors may page directions horizontally to
      // stay below conservative browser image-height limits. Each page owns
      // `frames` columns; within it, facing rows use the ordinary layout.
      var sourceRow = row % directionRows;
      var sourceColumn = Math.floor(row / directionRows) * frames + column;

      // The GROUND CONTACT point, not visualBodyY. A sheet from the Blender
      // rig frames its model standing on the bottom edge of the tile, so the
      // sprite is anchored where the feet are and lifts itself.
      var position;
      if (typeof spec.position === "function") {
        position = spec.position(subject, options);
      } else if (subject && subject.pos) {
        position = { x: subject.pos.x, y: subject.pos.y };
      } else {
        position = { x: subject.x === undefined ? subject.cx : subject.x,
          y: subject.y === undefined ? subject.cy : subject.y };
      }

      var width = value("width", subject, tileW);
      var height = value("height", subject, tileH);
      var lift = value("lift", subject, 0);
      var anchorX = value("anchorX", subject, 0.5);
      var anchorY = value("anchorY", subject, 1);

      var destX = position.x - width * anchorX;
      var destY = position.y - lift - height * anchorY;

      ctx.save();
      applySpriteStyle(ctx, spec, subject, value);
      if (spec.alpha !== undefined) ctx.globalAlpha *= value("alpha", subject, 1);
      ctx.drawImage(image,
        sourceColumn * tileW, sourceRow * tileH, tileW, tileH,
        destX, destY, width, height);

      // A COLOUR WASH THAT IS NOT `ctx.filter`.
      //
      // `tint` returns {color, alpha} or null. It exists because the obvious
      // way to flash a sprite white -- a `brightness()` filter -- costs about
      // 0.28 ms PER DRAW: the browser has to redirect that drawImage to its own
      // surface, run a filter pass and composite it back. On a board where an
      // area attack can light up fifty enemies in the same frame that is
      // fourteen milliseconds of the sixteen available, for one cosmetic
      // effect. Measured before and after on 450 enemies: 128 ms/frame with
      // every one filtered, 8 ms with every one tinted.
      //
      // This does the same job with two ordinary blits. The tile is copied into
      // one shared scratch canvas, `source-in` floods it with the colour while
      // keeping the sprite's alpha, and the resulting silhouette is drawn over
      // the sprite at the requested strength. No filter, no shadow, no
      // per-sheet cache to keep in memory.
      var tint = value("tint", subject, null);
      var scratch = (tint && tint.alpha > 0.004)
        ? tintScratch(tileW, tileH) : null;
      if (scratch) {
        var sg = scratch.getContext("2d");
        sg.clearRect(0, 0, tileW, tileH);
        sg.globalCompositeOperation = "source-over";
        sg.drawImage(image, sourceColumn * tileW, sourceRow * tileH,
          tileW, tileH, 0, 0, tileW, tileH);
        sg.globalCompositeOperation = "source-in";
        sg.fillStyle = tint.color;
        sg.fillRect(0, 0, tileW, tileH);
        ctx.globalAlpha *= Math.min(1, tint.alpha);
        ctx.drawImage(scratch, 0, 0, tileW, tileH,
          destX, destY, width, height);
      }
      ctx.restore();
      return true;
    });

    // The top of the DRAWN CONTENT, not the top of the tile. A rendered tile
    // has transparent space above the model, so a health bar hung off the
    // tile edge floats. `contentTop` is the fraction of tile height the model
    // actually fills, measured up from the ground line -- measure it, do not
    // estimate it, and re-measure whenever the model or ortho_scale changes.
    registerMetric(category, id, "topY", function (subject) {
      var height = value("height", subject, spec.frameHeight || 0);
      var lift = value("lift", subject, 0);
      var fill = spec.contentTop === undefined ? 1 : spec.contentTop;
      return baseY(subject) - lift - height * fill;
    });

    return registered;
  }

  // Which row of a sheet faces the way `vector` points.
  //
  // The models are built facing world +X and spun about world Z, so row d is
  // a yaw of d * 360/directions. The camera (see tools/blender/td_scene.py)
  // is elevated, which means world +Y -- "away" -- lands on screen as UP and
  // squashed by Visuals3Q.GROUND_SQUASH. So a screen-space direction (x, y),
  // y pointing down as canvas y does, came from a world direction of
  // (x, -y / GROUND_SQUASH). Undo the squash before taking the angle or every
  // diagonal picks the wrong row -- a 45 degree screen heading is a 61 degree
  // world one.
  function directionRow(vector, directions) {
    if (!vector) return 0;
    var squash = (typeof Visuals3Q !== "undefined" && Visuals3Q.GROUND_SQUASH)
      ? Visuals3Q.GROUND_SQUASH : 0.56;
    var yaw = Math.atan2(-vector.y / squash, vector.x);
    var step = Math.PI * 2 / directions;
    var row = Math.round(yaw / step) % directions;
    return row < 0 ? row + directions : row;
  }

  function now() {
    if (typeof performance !== "undefined" && performance.now) {
      return performance.now();
    }
    return Date.now();
  }

  function clear() {
    Object.keys(categories).forEach(function (category) {
      categories[category] = {};
    });
    measurements = {};
  }

  function ids(category) {
    return Object.keys(bucket(category));
  }

  return {
    register: register,
    unregister: unregister,
    renderer: renderer,
    draw: draw,
    install: install,
    registerSprite: registerSprite,
    registerSpriteSheet: registerSpriteSheet,
    registerMetric: registerMetric,
    metric: metric,
    clear: clear,
    ids: ids
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = VisualModels;
}
