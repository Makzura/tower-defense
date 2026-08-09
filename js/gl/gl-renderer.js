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
    "}\n";

  var fs =
    "precision mediump float;\n" +
    "varying vec3 vNrm;\n" +
    "varying vec3 vCol;\n" +
    "varying float vEmi;\n" +
    "varying float vDepth;\n" +
    "uniform vec3 uKeyDir;\n" +
    "uniform vec3 uFillDir;\n" +
    "uniform vec3 uAmbient;\n" +
    "uniform vec3 uFillColor;\n" +
    "uniform float uKeyStrength;\n" +
    // How hard this instance's emissive materials are being driven, 0 at rest.
    // The weapon's own coils, arc core, aperture and breech orb ARE the charge
    // effect now, so a tower winding up to fire hands its cycle straight to
    // the shader and the light lands on the geometry it belongs to.
    "uniform float uGlow;\n" +
    "uniform vec3 uGlowTint;\n" +
    "void main() {\n" +
    "  vec3 n = normalize(vNrm);\n" +
    "  float key = max(dot(n, uKeyDir), 0.0) * uKeyStrength;\n" +
    "  float fill = max(dot(n, uFillDir), 0.0);\n" +
    "  vec3 lit = vCol * (uAmbient + vec3(key) + uFillColor * fill);\n" +
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
    "  gl_FragColor = vec4(pow(max(lit, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);\n" +
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
    glow: gl.getUniformLocation(this.program, "uGlow"),
    glowTint: gl.getUniformLocation(this.program, "uGlowTint")
  };

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
  this.setGlow(0, null);
  this.drawCalls = 0;
  this.triangles = 0;
};

// Ley teal by default -- the colour every emissive material on these models
// was authored in. A rapture-path weapon passes its own violet.
GLRenderer.LEY = [0.31, 0.89, 0.82];

// How hard the next draws push their emissive materials. Left set until
// changed, so a caller that lights one tower must put it back.
GLRenderer.prototype.setGlow = function (amount, tint) {
  var gl = this.gl;
  gl.uniform1f(this.uniform.glow, amount || 0);
  var c = tint || GLRenderer.LEY;
  gl.uniform3f(this.uniform.glowTint, c[0], c[1], c[2]);
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
