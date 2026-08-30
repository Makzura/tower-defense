// ---------------------------------------------------------------------------
// The 3D renderer. No library, no build step, one classic <script> tag.
//
// WHY THERE IS NO THREE.JS HERE. Two reasons, both from AGENTS.md's hard
// constraints rather than from taste. Three dropped its UMD build, so every
// current release is ES modules only -- and `type="module"` is exactly what
// cannot be used over `file://`. And this game's art is flat-shaded, untextured
// low-poly with one sun: that is perhaps 3% of what a general engine does, so
// vendoring 600 kB to use 20 of them is a bad trade even where it is possible.
//
// THAT PARAGRAPH IS STILL TRUE OF THIS FILE, AND SINCE 2026-08-29 IT IS NO
// LONGER TRUE OF THE WHOLE GAME. `js/gl/three-loader.js` is a SECOND renderer
// that draws towers and bosses through Three.js r147, on this same canvas and
// through this same GL context. Nothing below changed for it, and no enemy
// goes anywhere near it -- all twenty-five are still drawn by the program in
// this file, out of GLModels, exactly as before.
//
// BOTH OBJECTIONS ABOVE ARE ANSWERED RATHER THAN WAIVED, which is the only
// reason it was allowed. r147 is the last line that ships a UMD build and a
// plain-script GLTFLoader, so it is classic <script> tags like everything else;
// and GLTFLoader.parse() takes bytes rather than a URL, so the .glb is base64'd
// into a .js file by tools/glb_to_three.py and nothing is ever fetched. The
// game still opens by double-clicking index.html -- measured, from a real
// file:// origin.
//
// The trade is different for a HERO unit, and that is the whole argument. This
// file's art carries no textures; `glb/dragon.glb` carries three 2048x2048
// maps, and the baked import of it -- js/gl/models/enemy-dinomech.js -- is
// eight flat colours. See "Two renderers" in AGENTS.md.
//
// WHAT THE ART STYLE BUYS US. The models carry no textures at all -- every
// surface is a flat material colour straight off td_scene's palette. That is
// not just cheap, it is what makes the whole 3D plan viable from `file://`:
// there are no image loads to be blocked by CORS, no `fetch`, no asset
// pipeline. Geometry arrives as plain number arrays inside a .js file and the
// GPU never sees anything that came off disk at runtime.
//
// LIGHTING MATCHES tools/blender/td_scene.py, deliberately. Key from the upper
// left at 68 degrees, a cool fill from behind it, and a slate ambient. Those
// are the same three lights every sprite in the game was rendered under, so
// the 3D board and any remaining 2D sprite still look like the same world.
// ---------------------------------------------------------------------------

function GLRenderer(canvas) {
  "use strict";
  this.canvas = canvas;
  var gl = canvas.getContext("webgl2", { antialias: true, alpha: false }) ||
    canvas.getContext("webgl", { antialias: true, alpha: false });
  if (!gl) throw new Error("WebGL is not available");
  this.gl = gl;
  this.isGL2 = (typeof WebGL2RenderingContext !== "undefined") &&
    (gl instanceof WebGL2RenderingContext);

  var vs =
    "attribute vec3 aPos;\n" +
    "attribute vec3 aNrm;\n" +
    "attribute vec3 aCol;\n" +
    "attribute float aEmi;\n" +
    "uniform mat4 uViewProj;\n" +
    "uniform mat4 uModel;\n" +
    "varying vec3 vNrm;\n" +
    "varying vec3 vCol;\n" +
    "varying float vEmi;\n" +
    "varying float vDepth;\n" +
    // How far this vertex is DOWN THE VIEW AXIS, which is what fog thickens
    // with. A perspective projection already computes it -- clip w IS the
    // view-space depth -- so this costs a copy and no extra matrix.
    "varying float vView;\n" +
    "void main() {\n" +
    // Rotation only -- every model matrix here is a yaw plus a translation
    // plus a uniform scale, so the upper 3x3 is already orthogonal and the
    // normal needs no inverse-transpose.
    "  vNrm = mat3(uModel) * aNrm;\n" +
    "  vCol = aCol;\n" +
    "  vEmi = aEmi;\n" +
    "  vec4 world = uModel * vec4(aPos, 1.0);\n" +
    "  gl_Position = uViewProj * world;\n" +
    "  vDepth = world.z;\n" +
    "  vView = gl_Position.w;\n" +
    "}\n";

  var fs =
    "precision mediump float;\n" +
    "varying vec3 vNrm;\n" +
    "varying vec3 vCol;\n" +
    "varying float vEmi;\n" +
    "varying float vDepth;\n" +
    "varying float vView;\n" +
    "uniform vec3 uKeyDir;\n" +
    "uniform vec3 uFillDir;\n" +
    "uniform vec3 uAmbient;\n" +
    "uniform vec3 uFillColor;\n" +
    "uniform float uKeyStrength;\n" +
    // THE KEY HAS A COLOUR NOW. It was `vec3(key)` -- white, always -- which is
    // correct for a facility deck under a fixed rig and wrong the moment the
    // light in the sky is a sun that rises amber, goes neutral at noon and is
    // replaced by a cold moon. Authored default is white, so a board that never
    // touches it renders exactly as it did.
    "uniform vec3 uKeyColor;\n" +
    // How hard this instance's emissive materials are being driven, 0 at rest.
    // The weapon's own coils, arc core, aperture and breech orb ARE the charge
    // effect now, so a tower winding up to fire hands its cycle straight to
    // the shader and the light lands on the geometry it belongs to.
    "uniform float uGlow;\n" +
    "uniform vec3 uGlowTint;\n" +
    // How solid this instance is. 1 for everything on the board; only a body
    // being cleared away ever asks for less. See setFade.
    "uniform float uAlpha;\n" +
    // THE AIR THE BOARD IS SEEN THROUGH. Density is per view-unit and is ZERO
    // for every board that does not ask for weather, so a map that declares no
    // fog renders exactly as it did before this uniform existed. `uFogFall` is
    // 1/height: the mist lies on the floor and thins upward, so a tree top
    // stands clear of the same bank its roots are buried in. At 0 the fog is
    // uniform with height, which is the honest reading of "no falloff".
    "uniform vec3 uFogColor;\n" +
    "uniform float uFogDensity;\n" +
    "uniform float uFogFall;\n" +
    "void main() {\n" +
    "  vec3 n = normalize(vNrm);\n" +
    "  float key = max(dot(n, uKeyDir), 0.0) * uKeyStrength;\n" +
    "  float fill = max(dot(n, uFillDir), 0.0);\n" +
    "  vec3 lit = vCol * (uAmbient + uKeyColor * key + uFillColor * fill);\n" +
    // Emission is ADDED, not multiplied: a glowing surface emits whether or
    // not the sun reaches it, which is the whole difference between a lamp and
    // a bright paint. Driven in linear, so the sRGB conversion below carries it
    // and a fully-charged coil clips to white the way a real hot filament does.
    "  lit += uGlowTint * (vEmi * uGlow);\n" +
    // A whisper of vertical falloff. Without it a tall model and the ground it
    // stands on read as the same plane at low pitch, because both are lit by
    // the same sun and nothing separates them.
    "  lit *= 1.0 + clamp(vDepth * 0.0016, 0.0, 0.14);\n" +
    // LIGHT IN LINEAR, DISPLAY IN sRGB. Multiplying an sRGB value by a light
    // term is the classic mistake and it does not look subtly wrong, it looks
    // washed out: #2E2F3C charcoal came out mid-grey, because in sRGB the dark
    // end of the curve is stretched and a 1.3x multiply lands far further up
    // it than the same multiply would in linear. Blender lights in linear and
    // converts once at the end, which is why its renders of these exact
    // colours are rich and this was not. Vertex colours arrive linear (see
    // GLModels.expand and GLGeometry.hex); this is the conversion back.
    // FOG IS MIXED IN LINEAR, for the same reason the lighting above is done
    // in linear: mist is light scattered on the way to the eye, not paint on
    // the surface, and mixing it after the sRGB curve washes the dark end out
    // exactly the way multiplying an sRGB colour by a light term did.
    "  float fog = 1.0 - exp(-vView * vView * uFogDensity * uFogDensity);\n" +
    "  fog *= exp(-max(vDepth, 0.0) * uFogFall);\n" +
    "  lit = mix(lit, uFogColor, clamp(fog, 0.0, 1.0));\n" +
    "  gl_FragColor = vec4(pow(max(lit, vec3(0.0)), vec3(1.0 / 2.2)), uAlpha);\n" +
    "}\n";

  this.program = this._link(vs, fs);
  gl.useProgram(this.program);

  this.attrib = {
    pos: gl.getAttribLocation(this.program, "aPos"),
    nrm: gl.getAttribLocation(this.program, "aNrm"),
    col: gl.getAttribLocation(this.program, "aCol"),
    emi: gl.getAttribLocation(this.program, "aEmi")
  };
  this.uniform = {
    viewProj: gl.getUniformLocation(this.program, "uViewProj"),
    model: gl.getUniformLocation(this.program, "uModel"),
    keyDir: gl.getUniformLocation(this.program, "uKeyDir"),
    fillDir: gl.getUniformLocation(this.program, "uFillDir"),
    ambient: gl.getUniformLocation(this.program, "uAmbient"),
    fillColor: gl.getUniformLocation(this.program, "uFillColor"),
    keyStrength: gl.getUniformLocation(this.program, "uKeyStrength"),
    keyColor: gl.getUniformLocation(this.program, "uKeyColor"),
    glow: gl.getUniformLocation(this.program, "uGlow"),
    glowTint: gl.getUniformLocation(this.program, "uGlowTint"),
    alpha: gl.getUniformLocation(this.program, "uAlpha"),
    fogColor: gl.getUniformLocation(this.program, "uFogColor"),
    fogDensity: gl.getUniformLocation(this.program, "uFogDensity"),
    fogFall: gl.getUniformLocation(this.program, "uFogFall")
  };
  // Solid until something asks otherwise, and `_faded` tracks the GL state so
  // setFade can be called per body without touching BLEND on every one.
  this._faded = false;

  // OPAQUE IS THE DEFAULT OF THE RENDERER, NOT A PROMISE EACH CALLER MAKES.
  //
  // `uAlpha` is a GL uniform, so it initialises to ZERO -- fully transparent --
  // and until 0527eac the only thing that ever wrote it was `begin()`. Any
  // caller that drew through this program without going through `begin()` got a
  // body rendered entirely transparent: `readPixels` succeeded, the blit
  // contributed nothing, and the caller's "did I draw" check said yes. That is
  // what happened to every 3D preview on the index and the armoury, where the
  // board never draws, and it repaired itself the moment a wave was played --
  // so it was invisible to manual checking and the broken path was the first
  // one a player took.
  //
  // Fixing it in each caller fixes the two callers that exist today. Setting it
  // HERE means the class cannot hand anyone a transparent default again, which
  // is the failure mode worth designing out: it is silent, it looks like
  // success, and the next caller to draw without `begin()` will be written by
  // someone who has never heard of this bug.
  //
  // SAFE AT THIS POINT IN THE CONSTRUCTOR, and it is the one thing that could
  // make this line a no-op: `setFade` writes a uniform, which requires the
  // program to be CURRENT, and a uniform write with no current program raises
  // INVALID_OPERATION and is silently dropped. `gl.useProgram(this.program)`
  // ran immediately after `_link` above, `this.uniform` is assigned, and
  // `this._faded` is initialised on the line above -- all three of setFade's
  // requirements are met. Verified by reading the uniform back on a cold page
  // (1, not 0) with `gl.getError()` clean, and by rendering a body through
  // ModelViewer3D with `setFade` stubbed to a no-op so this line is the only
  // thing keeping it opaque.
  this.setFade(1);

  // td_scene's lights, converted into this file's axes. The 2D board's light
  // comes from the upper LEFT of frame, which with +Y going into the board is
  // a sun sitting to the left and behind the viewer.
  var keyEl = 68 * Math.PI / 180;
  var keyAz = Math.atan2(0.8, -0.35);
  this.keyDir = this._normalize([
    Math.cos(keyEl) * Math.cos(keyAz),
    Math.cos(keyEl) * Math.sin(keyAz),
    Math.sin(keyEl)
  ]);
  this.fillDir = this._normalize([-this.keyDir[0], -this.keyDir[1], 0.35]);
  // TUNED FOR LINEAR LIGHT, and the numbers are much smaller than they look
  // like they should be. An ambient of 0.34 is a third of full daylight in
  // linear space -- it was set when the shader was lighting sRGB values, where
  // it read as a gentle lift, and after the pipeline was corrected the same
  // number turned the board into daylight.
  //
  // The target is that a surface facing the sun sums to ~1.0, so a lit top face
  // displays as the colour the art board actually specifies, and a surface
  // facing away falls to the ambient alone. Roughly Blender's own rig: a slate
  // world ambient, one key sun, and a cool fill from behind it.
  //
  // Raised on 2026-08-09 at the owner's request: the board read a shade too
  // murky once the models stopped being lit by canvas blobs sitting on top of
  // them. The RATIO is unchanged -- key still dominates, fill is still a cool
  // bounce, ambient is still slate -- so a sunlit top face still lands near the
  // authored colour rather than blowing out. Only the overall level moved.
  this.ambient = [0.125, 0.142, 0.180];
  this.fillColor = [0.075, 0.110, 0.155];
  this.keyStrength = 1.02;
  this.keyColor = [1, 1, 1];

  // AUTHORED DEFAULTS, NOT CONSTANTS. Everything above is now the rig a board
  // gets when nobody sets one -- the model viewers, the tower previews, the map
  // cards and any board with no environment. `setLighting` overrides it per
  // frame and `resetLighting` puts it back, on exactly the reasoning `setFog`
  // uses two functions below: a preview must never inherit the last run's
  // midnight.
  this._defaultLighting = {
    keyDir: this.keyDir.slice(), fillDir: this.fillDir.slice(),
    ambient: this.ambient.slice(), fillColor: this.fillColor.slice(),
    keyStrength: this.keyStrength, keyColor: this.keyColor.slice()
  };

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  this._model = new Float32Array(16);
}

GLRenderer.prototype._normalize = function (v) {
  var l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

GLRenderer.prototype._link = function (vsSource, fsSource) {
  var gl = this.gl;
  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error("shader: " + gl.getShaderInfoLog(s));
    }
    return s;
  }
  var p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("program: " + gl.getProgramInfoLog(p));
  }
  return p;
};

// A mesh is three parallel arrays and nothing else: positions, normals and a
// colour per vertex. Flat shading falls out of the exporter repeating a face's
// normal and colour across its three vertices, which costs some duplication
// and buys exact faceting with no second shading path.
GLRenderer.prototype.mesh = function (positions, normals, colors, emissive) {
  var gl = this.gl;
  function upload(data) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER,
      data instanceof Float32Array ? data : new Float32Array(data),
      gl.STATIC_DRAW);
    return b;
  }
  var verts = (positions.length / 3) | 0;
  return {
    pos: upload(positions),
    nrm: upload(normals),
    col: upload(colors),
    // Procedural meshes (the ground, the enemy spheres, the placeholder
    // cylinders) carry no emission; a zero-filled buffer keeps one attribute
    // layout for everything instead of a second shader.
    emi: upload(emissive || new Float32Array(verts)),
    count: verts
  };
};

GLRenderer.prototype.resize = function () {
  var canvas = this.canvas;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
};

GLRenderer.prototype.begin = function (viewProj, clearColor) {
  var gl = this.gl;
  gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  var c = clearColor || [0.055, 0.065, 0.09];
  gl.clearColor(c[0], c[1], c[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(this.program);
  gl.uniformMatrix4fv(this.uniform.viewProj, false, viewProj);
  gl.uniform3fv(this.uniform.keyDir, this.keyDir);
  gl.uniform3fv(this.uniform.fillDir, this.fillDir);
  gl.uniform3fv(this.uniform.ambient, this.ambient);
  gl.uniform3fv(this.uniform.fillColor, this.fillColor);
  gl.uniform1f(this.uniform.keyStrength, this.keyStrength);
  gl.uniform3fv(this.uniform.keyColor, this.keyColor);
  this.setGlow(0, null);
  this.setFade(1);
  // CLEAR AIR IS THE DEFAULT OF THE RENDERER, not a promise each caller makes
  // -- same reasoning as setFade above. A board with weather sets its own fog
  // straight after this call; a board without one, and every preview and
  // model viewer that shares this class, can never inherit the last map's.
  this.setFog(null, 0, 0);
  this.drawCalls = 0;
  this.triangles = 0;
};

// THE RIG THIS FRAME IS LIT BY. Every field is optional and anything absent
// keeps whatever is standing, so a caller may move the sun without restating
// the ambient. Directions are normalised here rather than trusted, because a
// direction that is not unit length silently scales the light it carries.
//
// Called BEFORE begin(): begin uploads whatever is set. That ordering is not a
// nicety -- a uniform write needs the program current, and begin is where it
// becomes current.
GLRenderer.prototype.setLighting = function (rig) {
  if (!rig) return this;
  if (rig.keyDir) this.keyDir = this._normalize(rig.keyDir);
  if (rig.fillDir) this.fillDir = this._normalize(rig.fillDir);
  if (rig.ambient) this.ambient = rig.ambient.slice();
  if (rig.fillColor) this.fillColor = rig.fillColor.slice();
  if (rig.keyColor) this.keyColor = rig.keyColor.slice();
  if (typeof rig.keyStrength === "number") this.keyStrength = rig.keyStrength;
  return this;
};

// Back to the authored daylight. What every preview outside a run gets, and
// what a board with no environment renders under.
GLRenderer.prototype.resetLighting = function () {
  var d = this._defaultLighting;
  this.keyDir = d.keyDir.slice();
  this.fillDir = d.fillDir.slice();
  this.ambient = d.ambient.slice();
  this.fillColor = d.fillColor.slice();
  this.keyStrength = d.keyStrength;
  this.keyColor = d.keyColor.slice();
  return this;
};

// Re-select the world program after another pass has borrowed the context --
// the sky draws through its own program and has to hand it back.
GLRenderer.prototype.rebind = function () {
  this.gl.useProgram(this.program);
  return this;
};

// Ley teal by default -- the colour every emissive material on these models
// was authored in. A rapture-path weapon passes its own violet.
GLRenderer.LEY = [0.31, 0.89, 0.82];

// THE AIR THE NEXT DRAWS ARE SEEN THROUGH.
//
//   color    what the mist is, in LINEAR light (GLGeometry.hex gives it)
//   density  per view-unit; 0 is clear air and is what `begin` restores
//   height   how tall the bank is, in world units. The mist thins with an
//            e-fold over this distance, so a 40 tall bank buries a barricade
//            and leaves the top of a dead pine standing out of it. 0 means no
//            falloff at all -- fog uniform with height, which is haze rather
//            than ground mist.
//
// Left set until changed, exactly like setGlow, so the board pass sets it once
// per frame and every actor drawn after it stands in the same weather.
GLRenderer.prototype.setFog = function (color, density, height) {
  var gl = this.gl;
  var c = color || [0, 0, 0];
  gl.uniform3f(this.uniform.fogColor, c[0], c[1], c[2]);
  gl.uniform1f(this.uniform.fogDensity, density || 0);
  gl.uniform1f(this.uniform.fogFall, height > 0 ? 1 / height : 0);
};

// How hard the next draws push their emissive materials. Left set until
// changed, so a caller that lights one tower must put it back.
GLRenderer.prototype.setGlow = function (amount, tint) {
  var gl = this.gl;
  gl.uniform1f(this.uniform.glow, amount || 0);
  var c = tint || GLRenderer.LEY;
  gl.uniform3f(this.uniform.glowTint, c[0], c[1], c[2]);
};

// HOW SOLID THE NEXT DRAWS ARE, and the only place this renderer blends.
//
// The board is opaque by design: one depth buffer, back faces culled, no sort.
// Exactly one thing needs less -- a body being cleared away after it dies --
// and that is worth the exception rather than the alternatives, which were a
// corpse that pops out of existence or one that sinks through the road.
//
// DEPTH WRITES GO OFF while it fades, or the transparent body would carve a
// hole in the depth buffer and hide whatever is behind it. Depth TESTING stays
// on, so the wreck is still occluded by the world in front of it.
//
// THE FADING OBJECT'S OWN TRIANGLES THEN COMPOSITE IN BUFFER ORDER, AND EVERY
// FRONT-FACING SURFACE PASSES -- so wherever two surfaces of the same body
// overlap on screen, that pixel is blended twice.
//
// WHAT THAT IS TRUE FOR, AND WHAT IT IS NOT. The original justification was
// "on a 23 px body over one second a player cannot see it", and for the wreck
// fade that is still exactly right: it is small, it is transient, and nobody is
// reading it. **Both premises fail for a camouflaged enemy**, which is
// translucent for its whole life and which the player is staring at precisely
// to identify. Measured there: 93-95% of interior pixels depart from the
// single-layer law, mean 30/255 and worst 107/255, and the departure is
// BRIGHTER -- so the translucency reads weakest exactly where the body is
// thickest. Camo bodies therefore use `setDepthOnly` + `setDepthEqual` below to
// lay their own depth first; the wreck does not need to and does not.
//
// State, not an argument, exactly like setGlow: a caller that fades a body must
// put it back.
GLRenderer.prototype.setFade = function (alpha) {
  var gl = this.gl;
  var a = (alpha === undefined || alpha === null) ? 1 : alpha;
  if (a >= 1) {
    if (this._faded) {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      this._faded = false;
    }
    gl.uniform1f(this.uniform.alpha, 1);
    return;
  }
  if (!this._faded) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this._faded = true;
  }
  gl.uniform1f(this.uniform.alpha, Math.max(0, a));
};

// DEPTH PRE-PASS: write this body's own depth and no colour.
//
// Followed by setDepthEqual(true) and a second draw of the same body, only the
// surface that won the pre-pass compares EQUAL, so exactly one layer blends and
// the single-layer law holds by construction.
//
// COST, MEASURED RATHER THAN ASSUMED, and it is one extra call per GROUP and
// not per body: an animated model issues a draw call per animated group, so a
// five-group enemy costs five extra calls, not one. Twelve camo bodies on a
// board measured 121 draw calls against 61 -- +60, at roughly 0.9 us each, so
// about 54 us a frame, or 0.3% of a 16.7 ms budget.
//
// BLEND IS DISABLED HERE deliberately: a colour-masked blended draw would still
// cost the blend unit for output nobody keeps. `_faded` is cleared with it so
// the next setFade() call cannot think blending is already enabled.
GLRenderer.prototype.setDepthOnly = function (on) {
  var gl = this.gl;
  if (on) {
    gl.colorMask(false, false, false, false);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this._faded = false;
  } else {
    gl.colorMask(true, true, true, true);
  }
};

// EQUAL keeps only the surface a pre-pass already laid down. LEQUAL is the
// board's default and every other draw needs it back.
//
// EQUAL IS ONLY SAFE BECAUSE NOTHING PERTURBS THE TRANSFORM BETWEEN THE TWO
// PASSES, and that is a condition on the CALLER rather than a property of the
// technique. Interpolated depth is bit-reproducible across two draws of
// identical geometry under an identical matrix, so the second pass compares
// exactly equal and nothing drops out -- measured at the fitted camera and
// again at distance 180, where precision is worst: 10420 of 10420 body pixels
// survived, no polygon offset needed.
//
// Change ANYTHING between the passes -- the model matrix, the animation frame,
// the camera, the viewport, a tilt or an override -- and the two rasterisations
// no longer agree bit for bit. The body then fails its own EQUAL test and
// vanishes in whole or in part, which photographs as a disappearing enemy
// rather than as a depth bug. A caller that cannot promise an identical
// transform wants LEQUAL and a sort, not this.
GLRenderer.prototype.setDepthEqual = function (on) {
  var gl = this.gl;
  gl.depthFunc(on ? gl.EQUAL : gl.LEQUAL);
};

// Bind a mesh's three buffers once, so a model with several animated groups
// pays for the bind once rather than per group.
GLRenderer.prototype.bind = function (mesh) {
  var gl = this.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
  gl.enableVertexAttribArray(this.attrib.pos);
  gl.vertexAttribPointer(this.attrib.pos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm);
  gl.enableVertexAttribArray(this.attrib.nrm);
  gl.vertexAttribPointer(this.attrib.nrm, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.col);
  gl.enableVertexAttribArray(this.attrib.col);
  gl.vertexAttribPointer(this.attrib.col, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.emi);
  gl.enableVertexAttribArray(this.attrib.emi);
  gl.vertexAttribPointer(this.attrib.emi, 1, gl.FLOAT, false, 0, 0);
};

// One slice of an already-bound mesh, with an explicit model matrix. This is
// what makes rigid-group animation cheap: the geometry is uploaded once and a
// pose is sixteen numbers per group, so an animated model costs one extra
// draw call per moving part rather than a second copy of itself per frame.
GLRenderer.prototype.drawRange = function (matrix, first, count) {
  var gl = this.gl;
  gl.uniformMatrix4fv(this.uniform.model, false, matrix);
  gl.drawArrays(gl.TRIANGLES, first, count);
  this.drawCalls++;
  this.triangles += count / 3;
};

GLRenderer.prototype.draw = function (mesh, x, y, z, yaw, scale) {
  var gl = this.gl;
  var m = GLMath.modelYaw(this._model, x || 0, y || 0, z || 0, yaw || 0,
    scale === undefined ? 1 : scale);
  gl.uniformMatrix4fv(this.uniform.model, false, m);

  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
  gl.enableVertexAttribArray(this.attrib.pos);
  gl.vertexAttribPointer(this.attrib.pos, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm);
  gl.enableVertexAttribArray(this.attrib.nrm);
  gl.vertexAttribPointer(this.attrib.nrm, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.col);
  gl.enableVertexAttribArray(this.attrib.col);
  gl.vertexAttribPointer(this.attrib.col, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.emi);
  gl.enableVertexAttribArray(this.attrib.emi);
  gl.vertexAttribPointer(this.attrib.emi, 1, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  this.drawCalls++;
  this.triangles += mesh.count / 3;
};
