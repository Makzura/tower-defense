// THE SKY, AS A REAL PASS. Drawn before the world, on its own program.
//
// What was here before was `gl.clearColor` -- one flat colour behind the board,
// which is fine while the board is a facility deck in a void and is not fine
// the moment the game has a horizon and a sun that moves. This draws the actual
// sky: a zenith-to-horizon gradient, a twilight band that sits just above the
// skyline, the sun, the moon and a star field.
//
// ONE FULL-SCREEN TRIANGLE, and the ray is rebuilt from the camera's own basis
// rather than from an inverted view-projection. The camera already keeps a
// forward, a right and an up; using them costs three uniforms and no matrix
// inverse, and it cannot disagree with the matrix the world is drawn through
// because both come from the same basis.
//
// NO TEXTURES, NO ASSETS, NO DEPENDENCIES. Everything below is arithmetic, so
// the page still opens from file:// with nothing but its own scripts.
var GLSky = (function () {
  "use strict";

  var VS =
    "attribute vec2 aNdc;\n" +
    "varying vec2 vNdc;\n" +
    "void main() {\n" +
    "  vNdc = aNdc;\n" +
    "  gl_Position = vec4(aNdc, 0.999999, 1.0);\n" +
    "}\n";

  var FS =
    "precision highp float;\n" +
    "varying vec2 vNdc;\n" +
    "uniform vec3 uFwd;\n" +
    "uniform vec3 uRight;\n" +
    "uniform vec3 uUp;\n" +
    "uniform float uTanHalf;\n" +
    "uniform float uAspect;\n" +
    "uniform vec3 uZenith;\n" +
    "uniform vec3 uHorizon;\n" +
    "uniform vec3 uBand;\n" +
    "uniform float uBandAmount;\n" +
    "uniform vec3 uSunDir;\n" +
    "uniform vec3 uSunColour;\n" +
    "uniform float uSunDisc;\n" +
    "uniform float uSunGlow;\n" +
    "uniform vec3 uMoonDir;\n" +
    "uniform vec3 uMoonColour;\n" +
    "uniform float uMoonDisc;\n" +
    "uniform float uStars;\n" +

    // A HASH, NOT A TABLE, and that is the deterministic choice rather than the
    // lazy one. This is a pure function of a direction: it is evaluated, never
    // generated, so the same star sits at the same place with the same
    // brightness on every frame, every machine and every reload. A JS-side
    // table would have to be small enough to fit in uniform slots -- a few
    // dozen stars over a whole sphere, of which two or three are ever on
    // screen -- or come in as a texture, which this file is not allowed to have.
    //
    // CELLED ON THE SKY, NOT IN SPACE. The first version cubed a direction
    // scaled by 150 and hashed the cell -- which is a 3D lattice that a view
    // ray only ever grazes, so whether a star was visible depended on whether
    // the thin spherical shell the ray sweeps happened to clip the little ball
    // inside its cell. It worked, and it put about sixteen stars in a whole
    // sky: a framebuffer probe across the band found ZERO lit pixels, which is
    // how a field that is technically present reads as no field at all.
    //
    // Azimuth and elevation, celled in two dimensions, is the honest mapping
    // for something painted on a dome: every cell in view is hit exactly once,
    // so the hash threshold IS the star density and the arithmetic can be
    // reasoned about instead of sampled. A cell is 1.4 degrees, which is about
    // thirty pixels tall at this field of view; a star fills a tenth of one.
    "float starHash2(vec2 p) {\n" +
    "  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);\n" +
    "}\n" +
    "float starField(vec3 dir) {\n" +
    "  float el = asin(clamp(dir.z, -1.0, 1.0));\n" +
    "  float az = atan(dir.y, dir.x);\n" +
    "  vec2 sp = vec2(az * 42.0, el * 42.0);\n" +
    "  vec2 cell = floor(sp);\n" +
    "  vec2 f = fract(sp) - 0.5;\n" +
    "  float h = starHash2(cell);\n" +
    "  if (h < 0.845) return 0.0;\n" +
    "  vec2 off = (vec2(starHash2(cell + 7.3), starHash2(cell + 19.7)) - 0.5) * 0.70;\n" +
    "  float d = length(f - off);\n" +
    "  float mag = 0.28 + 0.72 * fract(h * 137.0);\n" +
    // ONE MINUS AN INCREASING smoothstep, NOT A DECREASING ONE. GLSL leaves
    // smoothstep UNDEFINED when edge0 >= edge1, and this driver's answer to
    // smoothstep(0.105, 0.0, d) is a flat zero -- so the whole field evaluated
    // to nothing, silently, on a shader that compiled and linked without a
    // word. A framebuffer probe with the stars forced off found the identical
    // image, which is the only way that class of bug ever gets caught.
    "  return (1.0 - smoothstep(0.0, 0.105, d)) * mag;\n" +
    "}\n" +

    "void main() {\n" +
    "  vec3 dir = normalize(uFwd + uRight * (vNdc.x * uTanHalf * uAspect)\n" +
    "                            + uUp * (vNdc.y * uTanHalf));\n" +
    "  float up = dir.z;\n" +

    // The gradient. Raised to a power so the blue holds most of the dome and
    // the pale band stays close to the skyline, which is what an actual sky
    // does -- a straight lerp puts the horizon colour halfway up and reads as
    // a backdrop rather than as air.
    "  float t = clamp(up * 1.15 + 0.06, 0.0, 1.0);\n" +
    "  vec3 col = mix(uHorizon, uZenith, pow(t, 0.72));\n" +

    // The twilight band: a soft ring sitting just above the horizon, not a
    // third gradient stop. At noon and midnight uBandAmount is ~0 and this
    // costs a multiply.
    "  float band = exp(-pow((up - 0.05) / 0.17, 2.0)) * uBandAmount;\n" +
    "  col = mix(col, uBand, clamp(band, 0.0, 1.0));\n" +

    // STARS, BEFORE THE BODIES, so the moon sits in front of them rather than
    // being speckled. Faded below the horizon as well as by the cycle's own
    // star term, so the ground half of the dome never twinkles.
    "  if (uStars > 0.001) {\n" +
    "    float below = smoothstep(-0.12, 0.02, up);\n" +
    "    col += vec3(0.86, 0.90, 1.0) * starField(dir) * uStars * below;\n" +
    "  }\n" +

    // THE MOON. A soft disc with a limb that falls off rather than a hard
    // circle, and a small halo, so it reads as a body and not as a hole.
    "  float cm = dot(dir, uMoonDir);\n" +
    "  if (uMoonDisc > 0.001) {\n" +
    "    float disc = smoothstep(0.99955, 0.99988, cm);\n" +
    "    float halo = pow(max(cm, 0.0), 900.0) * 0.35;\n" +
    "    col += uMoonColour * (disc * 1.35 + halo) * uMoonDisc;\n" +
    "  }\n" +

    // THE SUN. Brighter than it can display on purpose: it clips to white in
    // the middle and carries its colour in the halo, which is how a bright
    // source behaves and why a sun painted at exactly 1.0 looks like a sticker.
    "  float cs = dot(dir, uSunDir);\n" +
    "  if (uSunDisc > 0.001) {\n" +
    "    float disc = smoothstep(0.99958, 0.99990, cs);\n" +
    "    float halo = pow(max(cs, 0.0), 480.0) * 0.55 + pow(max(cs, 0.0), 22.0) * 0.10;\n" +
    "    col += uSunColour * (disc * 4.2 + halo * uSunGlow) * uSunDisc;\n" +
    "  }\n" +

    // Linear in, sRGB out -- the same conversion the world shader makes, in the
    // same place, so the sky and the ground under it agree about what a colour
    // is. Doing it anywhere else is how a horizon ends up with a seam in it.
    "  gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);\n" +
    "}\n";

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error("sky shader: " + gl.getShaderInfoLog(s));
    }
    return s;
  }

  function Sky(gl) {
    this.gl = gl;
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("sky link: " + gl.getProgramInfoLog(p));
    }
    this.program = p;
    this.aNdc = gl.getAttribLocation(p, "aNdc");
    var names = ["uFwd", "uRight", "uUp", "uTanHalf", "uAspect", "uZenith",
      "uHorizon", "uBand", "uBandAmount", "uSunDir", "uSunColour", "uSunDisc",
      "uSunGlow", "uMoonDir", "uMoonColour", "uMoonDisc", "uStars"];
    this.u = {};
    for (var i = 0; i < names.length; i++) {
      this.u[names[i]] = gl.getUniformLocation(p, names[i]);
    }
    // One triangle that covers the viewport. Three vertices rather than a quad's
    // six, so the diagonal seam a two-triangle quad has across the middle of
    // the screen does not exist to be rasterised twice.
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }

  // `camera` supplies the basis and the lens; `env` is the composed
  // environment. Nothing here advances anything: the sky is told what time it
  // is, it never asks.
  Sky.prototype.draw = function (camera, env, aspect) {
    var gl = this.gl;
    var basis = camera.basis ? camera.basis() : null;
    if (!basis || !env) return;

    gl.useProgram(this.program);
    // DEPTH OFF, BOTH TEST AND WRITE. The sky is infinitely far away: it must
    // not occlude anything and it must not leave a depth value behind that the
    // world then has to beat.
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.aNdc);
    gl.vertexAttribPointer(this.aNdc, 2, gl.FLOAT, false, 0, 0);

    var u = this.u;
    gl.uniform3fv(u.uFwd, basis.forward);
    gl.uniform3fv(u.uRight, basis.right);
    gl.uniform3fv(u.uUp, basis.up);
    gl.uniform1f(u.uTanHalf, Math.tan((camera.fovY || 0.56) / 2));
    gl.uniform1f(u.uAspect, aspect || 1);
    gl.uniform3fv(u.uZenith, env.sky.zenith);
    gl.uniform3fv(u.uHorizon, env.sky.horizon);
    gl.uniform3fv(u.uBand, env.sky.band);
    gl.uniform1f(u.uBandAmount, env.sky.bandAmount);
    gl.uniform3fv(u.uSunDir, env.sun.dir);
    gl.uniform3fv(u.uSunColour, env.sun.colour);
    gl.uniform1f(u.uSunDisc, env.sun.disc);
    gl.uniform1f(u.uSunGlow, env.sky.sunGlow);
    gl.uniform3fv(u.uMoonDir, env.moon.dir);
    gl.uniform3fv(u.uMoonColour, env.moon.colour);
    gl.uniform1f(u.uMoonDisc, env.moon.disc);
    gl.uniform1f(u.uStars, env.sky.starIntensity);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.disableVertexAttribArray(this.aNdc);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
  };

  return {
    create: function (gl) {
      // A FAILURE HERE IS REPORTED, not swallowed. The first version returned
      // null on any exception and said nothing, so a shader that would not
      // compile looked exactly like a working sky: the clear colour is the
      // horizon colour, so the board still came up the right shade and only
      // the stars, the band, the sun and the moon were quietly missing. That
      // cost an hour and two framebuffer probes to find.
      try {
        return new Sky(gl);
      } catch (e) {
        if (typeof console !== "undefined" && console.error) {
          console.error("GLSky unavailable:", e && e.message);
        }
        return null;
      }
    }
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = GLSky;
}
