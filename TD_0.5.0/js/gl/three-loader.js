// ---------------------------------------------------------------------------
// THE SECOND RENDERER: Three.js and GLTFLoader, for HERO UNITS ONLY.
//
// This file does not replace anything. GLRenderer, GLModels and the nineteen
// baked enemy bodies are untouched and keep drawing exactly as they did; this
// is a parallel pass that runs inside the same frame, on the same canvas, for
// the handful of units that carry detail the baked pipeline throws away.
//
// WHY THERE IS A SECOND ONE AT ALL. The header of js/gl/gl-renderer.js argues
// -- correctly, and it is left standing -- that Three.js is the wrong trade for
// this game's art: flat-shaded untextured low-poly under one sun is about 3% of
// what a general engine does, and the models carry no textures to load. Every
// word of that is still true OF THE ENEMIES.
//
// It stops being true of the hero units. `glb/dragon.glb` ships a base-colour
// map, a metal/roughness map and a normal map, and the baked import of that
// exact file -- js/gl/models/enemy-dinomech.js -- is EIGHT FLAT COLOURS. The
// pipeline is not failing there; it is doing what it was built to do, to a file
// that was not built for it. Towers and bosses are the units a player looks AT
// rather than past, and they are five plus a handful rather than nineteen.
//
// WHAT THIS COSTS, AND WHY IT COSTS NOTHING AT LAUNCH. AGENTS.md's hard
// constraints are not negotiable and none of them is broken here:
//
//   * CLASSIC SCRIPT TAGS. vendor/three is r147, the last release line that
//     ships a UMD `three.min.js` and a plain-script `GLTFLoader.js`. No
//     `type="module"` anywhere, so nothing is blocked over file://.
//   * NO FETCH, NO XHR. GLTFLoader.parse() takes an ArrayBuffer rather than a
//     URL, and the bytes arrive base64'd inside a .js file that a <script>
//     element pulls in -- see tools/glb_to_three.py. Script tags are how the
//     other two hundred files load; this is the same mechanism, later.
//   * NO BUILD STEP TO RUN THE GAME. There is a build step to change the ART
//     (re-run the packer), which is the same standing obligation
//     glb_to_model.py already carries.
//   * ES5, `var`, no classes, no arrows. tools/check-constraints.js scans this
//     file like every other file under js/ and it passes. The Three.js sources
//     under vendor/ are third-party and are not held to the project's own
//     style, which is why they live outside js/.
//
// THE GAME STILL OPENS BY DOUBLE-CLICKING index.html. That was the whole point.
//
// ONE CANVAS, ONE DEPTH BUFFER. Three draws into the game's OWN WebGL context
// rather than a second stacked canvas, so a dragon standing behind a hill is
// clipped by that hill and a body walking in front of it occludes it, for free,
// because both passes write the same depth buffer. The alternative -- a
// transparent Three canvas layered on top -- is simpler to build and always
// wrong: it can only ever paint over the whole board.
//
// Borrowing the context and handing it back is not new here. js/gl/gl-sky.js
// has done it since the sky pass shipped: it sets its own state, draws through
// its own program, restores DEPTH_TEST / depthMask / CULL_FACE and calls
// `renderer.rebind()`. This does the same thing, wider, because Three touches
// far more state than the sky does -- see `handBack` at the bottom.
//
// EVERY ENTRY POINT NO-OPS UNTIL install() HAS RUN AND SUCCEEDED, on the same
// terms as blub-systems.js and enemy-wreck.js. If vendor/three is absent, if
// WebGL is unavailable, or if anything throws while building the scene, this
// module switches itself off and the board renders byte for byte as it does
// without it.
// ---------------------------------------------------------------------------

var ThreeGL = (function () {
  "use strict";

  var enabled = false;
  var glRenderer = null;          // the game's GLRenderer, for gl and rebind
  var gl = null;
  var canvas = null;

  var three = null;               // THREE.WebGLRenderer over the game's context
  var scene = null;
  var cam = null;                 // THREE.PerspectiveCamera, kept in step
  var keyLight = null, fillLight = null, ambientLight = null;

  // name -> record. See `request` for the state machine; `status` publishes it.
  var models = Object.create(null);
  // Actor id -> the live Object3D in the scene. Instances are kept between
  // frames and only their transform is rewritten, because building one means
  // cloning a hundred thousand triangles.
  var instances = Object.create(null);
  // Which instances were touched this frame. Anything not touched is hidden
  // rather than removed -- a boss that leaves the board for a moment should
  // not pay to be rebuilt when it comes back.
  var seen = Object.create(null);

  // ONE PAYLOAD AT A TIME. The generated files all publish through the same
  // `window.TDGltfPayload` global, because a script tag cannot hand a value
  // back any other way. Two in flight would race and the second would read the
  // first one's bytes -- silently, and the symptom would be one hero unit
  // wearing another's mesh. So requests queue.
  var queue = [];
  var loading = null;

  var warned = Object.create(null);

  function warnOnce(key, message) {
    if (warned[key]) return;
    warned[key] = true;
    if (typeof console !== "undefined" && console.warn) console.warn(message);
  }

  // --- install ---------------------------------------------------------------

  // Hand this the game's GLRenderer and the canvas it owns. Returns false --
  // never throws -- if Three is not on the page or the scene cannot be built,
  // so a caller can install unconditionally and let the board carry on.
  function install(options) {
    if (enabled) return true;
    if (typeof THREE === "undefined" || !THREE.WebGLRenderer) {
      warnOnce("no-three", "ThreeGL: THREE is not loaded; hero units will " +
        "fall back to their stand-ins.");
      return false;
    }
    if (!THREE.GLTFLoader) {
      warnOnce("no-loader", "ThreeGL: THREE.GLTFLoader is not loaded; hero " +
        "units will fall back to their stand-ins.");
      return false;
    }
    options = options || {};
    glRenderer = options.renderer || null;
    canvas = options.glCanvas || (glRenderer ? glRenderer.canvas : null);
    gl = options.gl || (glRenderer ? glRenderer.gl : null);
    if (!gl || !canvas) return false;

    try {
      // THE GAME'S OWN CONTEXT, passed in rather than created. This is the
      // whole compositing strategy in one argument: same framebuffer, same
      // depth buffer, so the two renderers see each other.
      three = new THREE.WebGLRenderer({ canvas: canvas, context: gl });
      // NEVER WIPE THE BOARD. By the time this pass runs, the sky, the terrain,
      // the towers and the bodies are already in the buffer. autoClear is on by
      // default and would erase all of it.
      three.autoClear = false;
      // MATCH THE GAME'S COLOUR PIPELINE, which lights in linear and converts
      // once at the end -- see the long note in gl-renderer.js about what
      // lighting sRGB directly did to a charcoal. Three's default in r147 is to
      // leave the output linear, which would land the hero units in exactly the
      // washed-out state that note describes.
      three.outputEncoding = THREE.sRGBEncoding;
      // The board does not tone-map, so neither does this. A filmic curve here
      // would make one dragon obey a different response than everything
      // standing beside it.
      three.toneMapping = THREE.NoToneMapping;
      // No shadow maps: the board has none, and a hero unit casting the only
      // real shadow on the field would read as a compositing mistake rather
      // than as lighting.
      three.shadowMap.enabled = false;

      scene = new THREE.Scene();

      // THE SAME THREE LIGHTS THE BOARD IS LIT BY, and they are SYNCHRONISED
      // per frame in setLighting rather than copied once here. gl-world.js
      // already recomputes the rig every frame from the environment cycle, so
      // a hero unit follows the sunrise with the rest of the world and needs no
      // clock of its own.
      //
      // A DIRECTIONAL LIGHT'S DIRECTION IS ITS POSITION MINUS ITS TARGET, and
      // the game's `keyDir`/`fillDir` already point FROM the surface TOWARD the
      // light (`max(dot(n, uKeyDir), 0.0)`), so the position IS the direction.
      // Scaled out only so nothing sits inside the geometry; a directional
      // light has no falloff, so the distance is cosmetic.
      keyLight = new THREE.DirectionalLight(0xffffff, 1);
      fillLight = new THREE.DirectionalLight(0xffffff, 1);
      ambientLight = new THREE.AmbientLight(0xffffff, 1);
      scene.add(keyLight);
      scene.add(keyLight.target);
      scene.add(fillLight);
      scene.add(fillLight.target);
      scene.add(ambientLight);

      cam = new THREE.PerspectiveCamera(32, 1, 8, 12000);
      // THE BOARD IS Z-UP. Three defaults to Y-up, and a camera that disagrees
      // with the world about which way is up does not look subtly wrong -- it
      // looks like the model is lying on its side, which is exactly what the
      // first run of this produced.
      cam.up.set(0, 0, 1);

      enabled = true;
      return true;
    } catch (e) {
      warnOnce("install", "ThreeGL: install failed (" + e.message +
        "); hero units will fall back to their stand-ins.");
      three = null; scene = null; cam = null;
      enabled = false;
      return false;
    }
  }

  // --- loading ---------------------------------------------------------------

  // base64 -> bytes, without fetch and without XMLHttpRequest.
  //
  // `atob` gives a binary STRING -- one character per byte, each 0..255 -- and
  // the copy below is the only way to get from there to an ArrayBuffer in ES5.
  // Four million iterations sounds alarming and measures at a few tens of
  // milliseconds, once, at load, on the same thread that is about to spend
  // longer than that uploading the mesh.
  function bytesOf(b64) {
    var binary = window.atob(b64);
    var n = binary.length;
    var out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = binary.charCodeAt(i) & 255;
    return out;
  }

  // Ask for a hero model. Safe to call every frame: after the first call the
  // record exists and this returns immediately.
  //
  //   name  what the model is called here, e.g. "boss-dragon"
  //   src   the generated payload, e.g. "assets/gltf/dragon.glb.js"
  function request(name, src) {
    if (!enabled) return;
    if (models[name]) return;
    models[name] = { name: name, src: src, status: "loading", root: null,
                     extent: null, clips: null };
    queue.push(name);
    pump();
  }

  function pump() {
    if (loading || !queue.length) return;
    var name = queue.shift();
    var record = models[name];
    loading = record;

    // A SCRIPT ELEMENT, NOT A FETCH. This is the load, and it is the reason
    // the game still opens by double-click: `fetch` and `XMLHttpRequest` are
    // both blocked on a file:// origin and a <script src> is not.
    //
    // Injected at runtime rather than sitting in index.html, so it is
    // asynchronous and nothing blocks on five megabytes: the board is up and
    // playable, with a stand-in where the hero unit will be, while this loads.
    var tag = document.createElement("script");
    tag.async = true;
    tag.src = record.src;
    tag.onload = function () { received(record); };
    tag.onerror = function () {
      record.status = "failed";
      warnOnce("load-" + record.name, "ThreeGL: could not load " + record.src +
        " for \"" + record.name + "\". Its stand-in will be drawn instead. " +
        "Has tools/glb_to_three.py been run?");
      loading = null;
      pump();
    };
    document.head.appendChild(tag);
  }

  function received(record) {
    var payload = window.TDGltfPayload;
    window.TDGltfPayload = null;
    if (!payload || payload.name !== record.name || !payload.b64) {
      record.status = "failed";
      warnOnce("payload-" + record.name, "ThreeGL: " + record.src +
        " loaded but published no payload for \"" + record.name + "\".");
      loading = null;
      pump();
      return;
    }

    var buffer;
    try {
      buffer = bytesOf(payload.b64).buffer;
    } catch (e) {
      record.status = "failed";
      warnOnce("decode-" + record.name, "ThreeGL: could not decode " +
        record.src + " (" + e.message + ").");
      loading = null;
      pump();
      return;
    }

    var loader = new THREE.GLTFLoader();

    // FORCE THE PLAIN Image() PATH FOR EMBEDDED TEXTURES, AND THIS IS NOT
    // OPTIONAL ON A file:// PAGE.
    //
    // A .glb carries its textures inside itself, so GLTFLoader turns each one
    // into a blob: URL and loads it. WHICH loader it uses is decided in the
    // GLTFParser constructor by whether `createImageBitmap` exists: if it does,
    // it picks THREE.ImageBitmapLoader, which reaches the blob through `fetch`
    // -- and a blob minted by a file:// document has a null origin, which is
    // exactly the case fetch refuses. The dragon would arrive fully formed and
    // untextured, with a console error that names a blob URL and nothing else.
    //
    // With `createImageBitmap` hidden, the parser takes THREE.TextureLoader,
    // which goes through `Image()`. That path is already proven on this project
    // from file:// -- it is how assets/*.png loads, and it is called out in
    // AGENTS.md as one of the two sanctioned ways to add art.
    //
    // THE SHADOW IS SAFE BECAUSE THE BRANCH IS SYNCHRONOUS. The parser is
    // constructed inside `parse()`, before it returns, so the restore in
    // `finally` cannot land early and no other code on the page sees the gap.
    var savedCreateImageBitmap = window.createImageBitmap;
    try {
      window.createImageBitmap = undefined;
      loader.parse(buffer, "", function (gltf) {
        adopt(record, gltf);
        loading = null;
        pump();
      }, function (err) {
        record.status = "failed";
        warnOnce("parse-" + record.name, "ThreeGL: GLTFLoader could not parse " +
          record.src + " (" + (err && err.message ? err.message : err) + ").");
        loading = null;
        pump();
      });
    } catch (e) {
      record.status = "failed";
      warnOnce("parse-throw-" + record.name, "ThreeGL: GLTFLoader threw on " +
        record.src + " (" + e.message + ").");
      loading = null;
      pump();
    } finally {
      window.createImageBitmap = savedCreateImageBitmap;
    }
  }

  function adopt(record, gltf) {
    var root = gltf.scene;

    // glTF IS Y-UP AND THE BOARD IS Z-UP. One rotation, applied to a wrapper
    // rather than to the model, so `extent` below is measured in the space the
    // game actually places things in and no caller has to know the convention.
    //
    // After it, the model's own forward (+X) is still +X, which is what
    // GLMath.modelYaw maps a heading onto -- so a hero unit yaws by the same
    // rule every baked body does.
    var pivot = new THREE.Object3D();
    root.rotation.x = Math.PI / 2;
    pivot.add(root);

    // HOW BIG IT ACTUALLY IS, MEASURED, NOT DECLARED. A .glb arrives in
    // whatever units its author exported, and a hero unit sized by a constant
    // typed here is a constant that is wrong for the next export. Callers ask
    // for a length in board pixels and this is what turns that into a scale.
    var box = new THREE.Box3().setFromObject(pivot);
    var size = new THREE.Vector3();
    box.getSize(size);
    record.extent = { x: size.x, y: size.y, z: size.z };
    // WHERE ITS FEET ARE, so a caller can stand it ON the ground rather than
    // through it. Exporters disagree about whether the origin is at the base or
    // at the centre of mass, and this is the only honest answer.
    record.footOffset = -box.min.z;

    record.root = pivot;
    record.clips = gltf.animations || [];
    record.status = "ready";

    // SAID OUT LOUD, because the difference is invisible until someone asks
    // why the boss will not walk. `glb/dragon.glb` is a static scan: no
    // armature, no clips. The mixer wiring below is real and does nothing until
    // an export arrives with an animation in it.
    if (!record.clips.length) {
      warnOnce("noclips-" + record.name, "ThreeGL: \"" + record.name +
        "\" loaded with textures and materials but carries NO animation " +
        "clips and no armature. It will render as a static body until a " +
        "rigged export replaces it.");
    }
  }

  // --- per-frame -------------------------------------------------------------

  // Put the Three lights on the rig the board is being lit by THIS frame.
  // Called from the world pass, which has already composed the environment.
  //
  // The values are LINEAR, which is what the game's shader works in and what
  // Three works in with r147's colour management left at its default -- so they
  // are copied across rather than converted. Converting them would be the same
  // class of mistake gl-renderer.js's own note describes.
  function setLighting(rig) {
    if (!enabled || !rig) return;
    var LIGHT_DISTANCE = 1000;
    if (rig.keyDir) {
      keyLight.position.set(rig.keyDir[0] * LIGHT_DISTANCE,
        rig.keyDir[1] * LIGHT_DISTANCE, rig.keyDir[2] * LIGHT_DISTANCE);
    }
    if (rig.fillDir) {
      fillLight.position.set(rig.fillDir[0] * LIGHT_DISTANCE,
        rig.fillDir[1] * LIGHT_DISTANCE, rig.fillDir[2] * LIGHT_DISTANCE);
    }
    if (rig.keyColor) {
      keyLight.color.setRGB(rig.keyColor[0], rig.keyColor[1], rig.keyColor[2]);
    }
    if (typeof rig.keyStrength === "number") keyLight.intensity = rig.keyStrength;
    if (rig.fillColor) {
      fillLight.color.setRGB(rig.fillColor[0], rig.fillColor[1], rig.fillColor[2]);
    }
    if (rig.ambient) {
      ambientLight.color.setRGB(rig.ambient[0], rig.ambient[1], rig.ambient[2]);
    }
  }

  // Keep the Three camera on the game's OrbitCamera. Read off the camera's own
  // published basis rather than re-derived: two cameras that compute the same
  // view from the same inputs still drift the moment either is retuned, and the
  // symptom would be a hero unit sliding against the board as you orbit.
  function syncCamera(orbit) {
    var eye = orbit.eye();
    var target = orbit.target;
    cam.fov = orbit.fovY * 180 / Math.PI;
    cam.aspect = orbit.aspect();
    cam.near = orbit.near;
    cam.far = orbit.far;
    cam.position.set(eye[0], eye[1], eye[2]);
    cam.up.set(0, 0, 1);
    cam.lookAt(target[0], target[1], target[2]);
    cam.updateProjectionMatrix();
  }

  function instanceFor(actor, record) {
    var live = instances[actor.id];
    if (live && live.model === actor.model) return live;
    if (live) scene.remove(live.object);
    // CLONED, so two of the same boss can stand on the board at once without
    // sharing a transform. Materials and textures are shared by clone() and
    // should be -- they are the expensive half and nothing here mutates them.
    var object = record.root.clone(true);
    live = { model: actor.model, object: object, mixer: null };
    if (record.clips && record.clips.length) {
      live.mixer = new THREE.AnimationMixer(object);
    }
    instances[actor.id] = live;
    scene.add(object);
    return live;
  }

  // THE PASS. Called once per frame from gl-world.js's drawWorld, after every
  // opaque GL body and before the blended ones -- this draws opaque geometry,
  // so it belongs with the opaque half of the frame.
  //
  //   orbit   the game's OrbitCamera
  //   actors  [{ id, model, x, y, z, yaw, lengthPx, dt }]
  //
  // An actor whose model is not ready is simply not drawn; the caller is
  // expected to have put a stand-in there -- see `status`.
  function draw(orbit, actors) {
    if (!enabled || !actors || !actors.length) return false;

    var drew = 0;
    var id;
    for (id in seen) delete seen[id];

    for (var i = 0; i < actors.length; i++) {
      var actor = actors[i];
      var record = models[actor.model];
      if (!record || record.status !== "ready") continue;
      var live = instanceFor(actor, record);
      var object = live.object;

      // SCALE FROM A MEASURED EXTENT, so a caller asks for a size in board
      // pixels and never has to know what units the exporter used.
      var scale = 1;
      if (actor.lengthPx && record.extent.x > 0) {
        scale = actor.lengthPx / record.extent.x;
      } else if (actor.scale) {
        scale = actor.scale;
      }
      object.scale.set(scale, scale, scale);
      object.position.set(actor.x, actor.y,
        (actor.z || 0) + record.footOffset * scale);
      object.rotation.set(0, 0, actor.yaw || 0);
      object.visible = true;
      if (live.mixer && actor.dt) live.mixer.update(actor.dt);
      seen[actor.id] = true;
      drew++;
    }

    // Anything the caller stopped naming is hidden rather than destroyed: a
    // boss that walks off the board and back should not pay to be rebuilt.
    for (id in instances) {
      if (!seen[id]) instances[id].object.visible = false;
    }

    if (!drew) return false;

    syncCamera(orbit);

    // TELL THREE ITS STATE CACHE IS A LIE. It has not drawn since last frame
    // and the game's renderer has been all over this context in the meantime.
    // Without this, Three skips redundant state changes that are not redundant
    // any more, and the result is not a subtle shading difference -- it is
    // geometry drawn with somebody else's buffers bound.
    three.resetState();
    three.setViewport(0, 0, canvas.width, canvas.height);
    three.render(scene, cam);
    handBack();
    return true;
  }

  // GIVE THE CONTEXT BACK IN THE STATE THE BOARD LEFT IT IN.
  //
  // gl-sky.js does the same thing three lines long, because a sky pass touches
  // three pieces of state. Three touches most of them, and every one it leaves
  // behind is a bug in something else's draw call -- which is the failure mode
  // that makes people give up on sharing a context and stack a second canvas
  // instead. So this is explicit rather than trusting resetState to be
  // symmetric, and each line restores a value that is READ OFF THE GAME'S OWN
  // SETUP (see the tail of the GLRenderer constructor) rather than a guess.
  //
  // depthFunc is LEQUAL, not LESS. That is the game's setting and it is not
  // interchangeable: the board draws coplanar surfaces that rely on it.
  function handBack() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    // WebGL2 only, and the one piece of state a WebGL1 codebase would never
    // think to restore: Three binds a vertex array object per geometry, and a
    // VAO left bound overrides every attribute pointer the game sets after it.
    if (gl.bindVertexArray) gl.bindVertexArray(null);
    // The world program back on, which is what gl-sky.js's rebind() call means
    // and what every draw after this one assumes.
    if (glRenderer && glRenderer.rebind) glRenderer.rebind();
  }

  return {
    install: install,
    isEnabled: function () { return enabled; },
    request: request,
    setLighting: setLighting,
    draw: draw,
    // "idle" (never asked for), "loading", "ready" or "failed". This is what a
    // caller draws its stand-in and its label off -- see gl-world.js.
    status: function (name) {
      var record = models[name];
      return record ? record.status : "idle";
    },
    // The model's real size in board units at scale 1, measured off the mesh
    // after the Z-up rotation. Null until it is ready.
    extentOf: function (name) {
      var record = models[name];
      return (record && record.extent) ? {
        x: record.extent.x, y: record.extent.y, z: record.extent.z
      } : null;
    },
    // WHAT A LOADED MODEL IS ACTUALLY MADE OF, published so a check can ASK
    // rather than infer -- the same reasoning World3D.strikeSeam is exported
    // for, and for a failure with the same signature.
    //
    // "The dragon has textures" is not a thing a screenshot can settle and not
    // a thing a pixel count can settle either: a flat-shaded body under one sun
    // also produces hundreds of distinct colours, one per face angle, so the
    // usual instrument is flat across exactly the distinction it is being asked
    // to make. AGENTS.md has a section about this. What settles it is whether a
    // texture with real image data is bound to the material, which is what this
    // reports.
    //
    // READ-ONLY AND DEEP-COPIED. It hands out plain numbers and strings, never
    // the live material or texture -- a "getter" a caller can write through is
    // the trap strikeSeam's own note records paying for.
    inspect: function (name) {
      var record = models[name];
      if (!record || !record.root) return null;
      function texture(t) {
        if (!t) return null;
        return { hasImage: !!t.image,
                 width: t.image ? (t.image.width || null) : null,
                 height: t.image ? (t.image.height || null) : null,
                 encoding: t.encoding };
      }
      var meshes = [];
      record.root.traverse(function (node) {
        if (!node.isMesh || !node.material) return;
        var m = node.material;
        var geometry = node.geometry;
        meshes.push({
          material: m.type,
          triangles: geometry.index ? geometry.index.count / 3
                                    : geometry.attributes.position.count / 3,
          hasUVs: !!geometry.attributes.uv,
          skinned: !!node.isSkinnedMesh,
          baseColorMap: texture(m.map),
          normalMap: texture(m.normalMap),
          roughnessMap: texture(m.roughnessMap),
          metalnessMap: texture(m.metalnessMap)
        });
      });
      return { name: name, status: record.status, meshes: meshes,
               clips: record.clips ? record.clips.length : 0 };
    },
    // Which animation clips an export actually carries, BY NAME. Published
    // rather than left to be discovered in a debugger, because "this boss does
    // not move" and "this boss has no clips" look identical on screen and have
    // completely different fixes. Empty is the honest answer for a static scan.
    clipsOf: function (name) {
      var record = models[name];
      if (!record || !record.clips) return [];
      var out = [];
      for (var i = 0; i < record.clips.length; i++) out.push(record.clips[i].name);
      return out;
    }
  };
})();
