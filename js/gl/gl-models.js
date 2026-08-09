// ---------------------------------------------------------------------------
// The model registry the generated geometry files register themselves into.
//
// Each js/gl/models/*.js is a classic <script> that calls GLModels.register at
// load time. That is the whole loading strategy: no fetch, no XHR, no parser,
// no dependency -- because over file:// the first two are blocked outright and
// the game's hard constraint is that it opens by double-clicking a file.
//
// STORED COMPACT, EXPANDED ONCE. The exporter writes normals and colours PER
// TRIANGLE, not per vertex, because these models are flat-shaded -- every
// triangle genuinely has one normal and one colour, so storing three copies of
// each was 3.1x the file for identical output. Expanding is a single pass the
// first time a model is asked for, and the GL buffers are built once and kept.
//
// UPLOAD IS LAZY. A board with no Hive on it should not pay to upload a Hive.
// `mesh()` builds the buffers the first time it is called and returns the same
// object forever after.
// ---------------------------------------------------------------------------

var GLModels = (function () {
  "use strict";

  var models = Object.create(null);

  // sRGB -> linear. The same curve td_scene.srgb() applies in Blender, so a
  // colour makes the identical round trip on both sides of the pipeline.
  function toLinear(v) {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  function register(name, data) {
    models[name] = {
      name: name,
      raw: data,
      unitsToPx: data.unitsToPx || 1,
      triangles: data.triangles || 0,
      // RIGID-GROUP ANIMATION. Geometry is stored once, in the local space of
      // whichever animated empty carries it; a frame is one 4x4 per group.
      // The alternative -- a copy of the mesh per frame -- was 2.8 MB for the
      // Rifleman's four-frame bolt cycle against 2 KB for this.
      groups: data.groups || [],
      frames: data.frames || [],
      expanded: null,
      gpu: null
    };
  }

  // Per-triangle normals and colours -> per-vertex, which is what a vertex
  // buffer wants.
  //
  // EMISSION IS KEPT, NOT FOLDED IN. It used to be added to the colour as a
  // floor so a lamp stayed bright with the sun off it, which is right for a
  // cigar and wrong for a weapon: the coil stages, the arc core, the aperture
  // and the breech orb are the parts that are SUPPOSED to brighten as the
  // thing winds up to fire. Carried as its own per-vertex channel, the shader
  // can drive them from the tower's firing cycle -- and because that is real
  // geometry being lit, it is occluded by the barrel in front of it, which the
  // canvas blobs this replaces never were.
  function expand(model) {
    if (model.expanded) return model.expanded;
    var raw = model.raw;
    var tris = model.triangles;
    var positions = new Float32Array(raw.positions);
    var normals = new Float32Array(tris * 9);
    var colors = new Float32Array(tris * 9);
    var emissive = new Float32Array(tris * 3);
    var maxEmit = 0;

    for (var t = 0; t < tris; t++) {
      var nx = raw.normals[t * 3], ny = raw.normals[t * 3 + 1],
          nz = raw.normals[t * 3 + 2];
      var c = raw.palette[raw.colourIndex[t]] || [0.8, 0.8, 0.8, 0];
      var emit = c[3] ? c[3] : 0;
      if (emit > maxEmit) maxEmit = emit;
      // The resting floor: an emissive material still reads as lit with the
      // sun off it, exactly as before. What is new is that the shader can
      // push it far past this.
      var floor = emit ? Math.min(1, emit * 0.16) : 0;
      // To LINEAR. The exporter writes the art board's sRGB values, and the
      // shader lights in linear and converts back once at the end -- see the
      // note in gl-renderer.js for what lighting sRGB directly did.
      var r = Math.min(1, toLinear(c[0]) + floor);
      var g = Math.min(1, toLinear(c[1]) + floor);
      var b = Math.min(1, toLinear(c[2]) + floor);
      for (var v = 0; v < 3; v++) {
        var i = t * 9 + v * 3;
        normals[i] = nx; normals[i + 1] = ny; normals[i + 2] = nz;
        colors[i] = r; colors[i + 1] = g; colors[i + 2] = b;
        emissive[t * 3 + v] = emit;
      }
    }
    // HOW TALL THIS THING ACTUALLY IS, in Blender units.
    //
    // Anything drawn ABOVE a model -- a health bar, a hover card -- needs the
    // model's real top, and there is no other honest source for it. The first
    // version used the tower's `footprintPx`, which measures how much GROUND it
    // occupies: a Rifleman's footprint is 11.7 and he stands 64 px tall, so his
    // bar was painted across his waist, a dark bar on a dark coat. It read as
    // missing because in practice it was.
    var top = 0;
    for (var q = 2; q < positions.length; q += 3) {
      if (positions[q] > top) top = positions[q];
    }
    model.top = top;

    var arrays = { positions: positions, normals: normals, colors: colors,
                   emissive: emissive };
    // Split off whatever on this model belongs to the map rather than to the
    // tower, so the world pass can draw it without the aiming yaw.
    arrays.fixedVerts = (typeof GLParts !== "undefined")
      ? GLParts.split(model.name, model, arrays) : 0;
    arrays.hasEmissive = maxEmit > 0;
    model.expanded = arrays;
    // The compact source is dead weight once expanded, and these are the
    // largest objects on the page.
    model.raw = null;
    return arrays;
  }

  function mesh(renderer, name) {
    var model = models[name];
    if (!model) return null;
    if (!model.gpu) {
      var e = expand(model);
      model.gpu = renderer.mesh(e.positions, e.normals, e.colors, e.emissive);
      model.gpu.unitsToPx = model.unitsToPx;
      model.gpu.triangles = model.triangles;
      // Where the map ends and the tower begins, in vertices. The world pass
      // draws [0, fixedVerts) without the aiming yaw.
      model.gpu.fixedVerts = e.fixedVerts || 0;
      model.gpu.hasEmissive = !!e.hasEmissive;
      model.gpu.top = model.top;
      model.fixedVerts = model.gpu.fixedVerts;
    }
    return model.gpu;
  }

  // Everything a caller needs to draw one instance, animated or not.
  function get(renderer, name) {
    var model = models[name];
    if (!model) return null;
    if (!mesh(renderer, name)) return null;
    return model;
  }

  return {
    register: register,
    get: get,
    mesh: mesh,
    has: function (name) { return !!models[name]; },
    names: function () { return Object.keys(models); },
    triangles: function (name) {
      return models[name] ? models[name].triangles : 0;
    },
    // Blender units -> board pixels for a given model, so a caller never has
    // to know the constant.
    unitsToPx: function (name) {
      return models[name] ? models[name].unitsToPx : 1;
    }
  };
})();
