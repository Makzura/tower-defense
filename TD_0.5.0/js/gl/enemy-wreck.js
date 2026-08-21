// ---------------------------------------------------------------------------
// WHAT IS LEFT AFTER A FLIER DIES.
//
// A walker that dies is a burst of sparks and an empty patch of road, and that
// has always been enough: it was standing on the ground, so the ground is where
// it already was. A flier is not. An Aether Wisp dies three and a half radii up,
// and vanishing at that height reads as a bug -- the eye expects the thing to
// come down. So it does: sparks out of the broken lantern, a tumbling fall, one
// bounce, and a wreck lying on the road for a second and a half before it fades
// out over a second (2026-08-12, to the owner's spec).
//
// PRESENTATION ONLY, AND STRICTLY DOWNSTREAM. This module reads the live enemy
// list and keeps its own records beside it. It never writes to an enemy, never
// affects a bounty, a wave count or a target, and the game plays identically
// with the file removed -- every entry point no-ops until `bind` has run. That
// is the same contract js/gl/blub-systems.js keeps, and the diff-the-list shape
// below is deliberately the same shape, because it is the one that works: an
// enemy is spliced out of `enemies` at the end of the update tick it dies in,
// so by the time anything draws, the death has already happened and the object
// is gone from the array. The watch record is where it survives.
//
// WHY IT IS NOT IN gl-world.js. That file is 150 KB and already owns the board.
// This is one enemy's death, it has its own clock and its own little physics,
// and gl-world touches it in three lines: update it, draw the bodies it hands
// back, draw its sparks.
// ---------------------------------------------------------------------------

var EnemyWreck = (function () {
  "use strict";

  var api = null;

  // --- the spec, in one place ------------------------------------------------
  //
  // GAME seconds, so at 1x these are the wall-clock numbers the spec asked for
  // and at 3x a wreck clears in a third of the time -- feedback belongs to the
  // simulation's clock, not the monitor's, which is also why a paused board
  // holds its corpses instead of quietly tidying them away. `step()` below is
  // the same one blub-systems.js uses, for the same reasons.
  var REST_S = 1.5;                 // "lay dead there for 1.5 seconds"
  var FADE_S = 1.0;                 // "fade away over the course of 1 second"

  // Gravity as a WORLD distance, like every other distance in this game, so it
  // scales with the map instead of being a pixel constant that means something
  // different on a re-anchored board.
  var GRAVITY_UL = 420;
  // How much of the impact speed comes back off the road. A machine, not a ball:
  // it gives back well under half and the second contact is the last.
  var BOUNCE = 0.42;
  // How much horizontal travel survives each contact. The Wisp is still moving
  // forward when it dies and a wreck that stopped dead in the air would look
  // like it hit a wall.
  var SKID = 0.45;

  // THE WRECK'S RESTING POSE, in Blender units, measured off `enemy-flying`'s
  // own geometry rather than eyeballed: the abdomen group spans z 0.229..0.366,
  // so the body tube's axis is at 0.30 and its own half-thickness is 0.07-0.10.
  //
  // `axis` is what the tumble rotates about -- rolling about the model origin
  // instead would swing the body around the tips of its legs and drive it
  // through the road. `rest` is where that axis ends up once it is lying down,
  // which for a tube on its side is one radius. A second wrecked model needs its
  // own row; the default is a sane guess for anything that has none.
  var POSE = {
    "enemy-flying": { axis: 0.30, rest: 0.10, roll: 1.95 }
  };
  var POSE_DEFAULT = { axis: 0.25, rest: 0.12, roll: 1.90 };

  // The lantern does not survive the hit. It flares, gutters and goes out over
  // the fall rather than switching off, because a lamp that stops instantly
  // reads as the renderer losing the object.
  var DEATH_FLARE = 1.9;

  var MAX_WRECKS = 24;              // a Wisp wave is eight; this is headroom
  var MAX_SPARKS = 260;

  // --- records ---------------------------------------------------------------

  var watch = new Map();            // live flier -> last known state
  var wrecks = [];
  var sparks = [];
  var gone = [];
  var bodies = [];
  var token = -1;                   // guards against two updates in one frame

  function bind(hooks) { api = hooks; }

  function reset() {
    watch = new Map();
    wrecks.length = 0;
    sparks.length = 0;
    token = -1;
  }

  function poseOf(model) { return POSE[model] || POSE_DEFAULT; }

  // `state.dt` is REAL elapsed time, unscaled and unpaused -- game.js keeps it
  // that way on purpose so the camera can ease while the board is stopped. A
  // wreck is not the camera, so it is scaled back onto the simulation's clock
  // here. Clamped for a stalled tab, or a backgrounded board would land its
  // fall, rest and fade in a single frame.
  function step(state) {
    var dt = state.dt || 0;
    if (dt > 0.1) dt = 0.1;
    if (typeof paused !== "undefined" && paused) return 0;
    var speed = (typeof gameSpeed === "number" && gameSpeed > 0) ? gameSpeed : 1;
    return dt * speed;
  }

  // --- sparks ----------------------------------------------------------------
  //
  // Drawn by this module rather than handed to Effects, for one reason: these
  // start 32 px in the air and Effects' particles carry a launch height but not
  // a launch VELOCITY in z, so an arc off a falling body cannot be expressed
  // there. They are three-dimensional -- x, y and a real z -- and projected the
  // same way everything else in the overlay pass is.

  function spark(x, y, z, speed, up, life, hot) {
    if (sparks.length >= MAX_SPARKS) sparks.shift();
    var a = Math.random() * Math.PI * 2;
    var v = speed * (0.3 + Math.random() * 0.7);
    sparks.push({
      x: x, y: y, z: z,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      vz: up * (0.35 + Math.random() * 0.9),
      life: life * (0.7 + Math.random() * 0.6), maxLife: life,
      hot: hot
    });
  }

  function burst(w, count, speed, up, life) {
    for (var i = 0; i < count; i++) {
      spark(w.x, w.y, w.z + w.axisPx, speed, up, life, Math.random() < 0.4);
    }
  }

  // --- the diff --------------------------------------------------------------

  function update(state) {
    if (!api || !state || !state.enemies) return;
    var now = state.now || 0;
    if (now === token) return;                  // called twice in one frame
    token = now;
    var dt = step(state);

    var list = state.enemies;
    var i, e, rec;

    // ONLY FLIERS ARE WATCHED. A walker's death already reads correctly and
    // every record kept is a record that has to be diffed.
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (!e || !e.isFlying) continue;
      rec = watch.get(e);
      var radius = e.radiusPx ? e.radiusPx() : 11;
      var heading = (e.path && e.path.tangentAt)
        ? e.path.tangentAt(e.progress) : null;
      if (!rec) {
        rec = { x: 0, y: 0, vx: 0, vy: 0, yaw: 0, radius: radius, seen: now };
        watch.set(e, rec);
      } else if (dt > 0) {
        // Its own speed, measured rather than looked up: the wreck should carry
        // the momentum the body actually had, including whatever a slow field
        // had taken off it.
        rec.vx = (e.pos.x - rec.x) / dt;
        rec.vy = (e.pos.y - rec.y) / dt;
      }
      rec.x = e.pos.x;
      rec.y = e.pos.y;
      rec.radius = radius;
      if (heading) rec.yaw = Math.atan2(heading.y, heading.x);
      rec.lift = api.bodyLift ? api.bodyLift(e, radius) : radius * 3.45;
      rec.seen = now;
    }

    gone.length = 0;
    watch.forEach(function (r, key) {
      if (r.seen !== now) gone.push(key);
    });

    for (i = 0; i < gone.length; i++) {
      e = gone[i];
      rec = watch.get(e);
      watch["delete"](e);
      // THREE WAYS TO LEAVE THE ARRAY AND ONLY ONE OF THEM IS A DEATH.
      //
      //   dead     killed by the player -- the only one that leaves a wreck
      //   leaked   it reached the base and walked off the end of the road; it
      //            was not shot down and there is nothing to fall
      //   neither  restartGame() and the sandbox's Clear button empty the whole
      //            array at once. A board being torn down must not rain wrecks.
      if (e.dead === true && e.leaked !== true) spawnWreck(e, rec, state);
    }

    if (dt > 0) integrate(dt);
  }

  function spawnWreck(enemy, rec, state) {
    if (wrecks.length >= MAX_WRECKS) wrecks.shift();
    var model = api.modelOf ? api.modelOf(enemy) : null;
    var radius = rec.radius || 11;
    var scale = radius / 11;
    var pose = poseOf(model);
    var unit = (api.unitsToPx ? api.unitsToPx(model) : 31.8032) * scale;
    var w = {
      model: model,
      tint: api.tintOf ? api.tintOf(enemy) : [0.15, 0.53, 0.92],
      radius: radius,
      scale: scale,
      x: rec.x, y: rec.y,
      ground: api.groundAt ? api.groundAt(rec.x, rec.y) : 0,
      // Height above the ground, of the model ORIGIN. It starts wherever the
      // live body was being drawn, so the wreck begins exactly where the enemy
      // stopped being -- no jump on the frame of the kill.
      z: rec.lift || 0,
      vx: rec.vx || 0, vy: rec.vy || 0, vz: 0,
      yaw: rec.yaw || 0,
      // Where the body settles, expressed as a model-origin height: the tube's
      // axis has to end at `rest`, and rolling happens about `axis`.
      axisPx: pose.axis * unit,
      restZ: (pose.rest - pose.axis) * unit,
      restRoll: pose.roll * (Math.random() < 0.5 ? -1 : 1),
      pivotZ: pose.axis,
      roll: 0, rollV: (1.4 + Math.random() * 2.6) * (Math.random() < 0.5 ? -1 : 1),
      pitch: 0, pitchV: (Math.random() - 0.5) * 2.2,
      // The wings keep going for a moment and wind down. Frames still come off
      // a clock, as they must for anything airborne.
      frame: 0, frameRate: 1,
      bounced: false,
      phase: "fall",
      restT: 0,
      fade: 1,
      glow: DEATH_FLARE
    };
    wrecks.push(w);
    // The lantern letting go: a hot, fast burst at the body, biased upward so
    // it reads as debris thrown clear rather than a puddle.
    burst(w, 16, 78, 95, 0.55);
  }

  function integrate(dt) {
    var g = (typeof ul === "function") ? ul(GRAVITY_UL) : GRAVITY_UL;
    var i, w;

    for (i = wrecks.length - 1; i >= 0; i--) {
      w = wrecks[i];

      if (w.phase === "fall") {
        w.vz -= g * dt;
        w.z += w.vz * dt;
        w.x += w.vx * dt;
        w.y += w.vy * dt;
        w.roll += w.rollV * dt;
        w.pitch += w.pitchV * dt;
        // Guttering out, faster than it falls, so it is dark before it lands.
        w.glow = Math.max(0, w.glow - dt * 3.2);
        w.frameRate = Math.max(0, w.frameRate - dt * 2.4);
        w.frame += w.frameRate * dt * 9;

        if (w.z <= w.restZ && w.vz < 0) {
          w.z = w.restZ;
          if (!w.bounced) {
            // ONE BOUNCE, and it is the only one. A second would read as a ball.
            w.bounced = true;
            w.vz = -w.vz * BOUNCE;
            w.vx *= SKID;
            w.vy *= SKID;
            w.rollV *= 0.55;
            w.pitchV *= 0.4;
            burst(w, 7, 46, 58, 0.38);
          } else {
            w.phase = "rest";
            w.vx = w.vy = w.vz = 0;
            w.glow = 0;
            w.frameRate = 0;
          }
        }
      } else if (w.phase === "rest") {
        // Settling onto its side over the first fifth of a second, rather than
        // snapping there: the tumble it arrived with has to end somewhere.
        var k = Math.min(1, dt * 7);
        w.roll += (w.restRoll - w.roll) * k;
        w.pitch += (0 - w.pitch) * k;
        w.restT += dt;
        if (w.restT >= REST_S) w.phase = "fade";
      } else {
        w.restT += dt;
        w.fade = 1 - Math.min(1, (w.restT - REST_S) / FADE_S);
        if (w.fade <= 0) wrecks.splice(i, 1);
      }
    }

    var gs = g * 0.55;                      // sparks are light; they fall slower
    for (i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vz -= gs * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.z < 0) { s.z = 0; s.vz = -s.vz * 0.35; s.vx *= 0.6; s.vy *= 0.6; }
      s.vx *= 1 - Math.min(1, dt * 1.6);    // air drag, so streaks shorten
      s.vy *= 1 - Math.min(1, dt * 1.6);
    }
  }

  // --- what the 3D pass draws -------------------------------------------------
  //
  // Returns the module's OWN records, valid until the next update and never to
  // be held across frames -- the same contract BlubFXSystems.dyingBodies keeps,
  // and for the same reason: a wreck is the real model at a real transform, not
  // a blob standing in for one, so handing back a transform is all it takes.

  function bodyList() {
    bodies.length = 0;
    for (var i = 0; i < wrecks.length; i++) {
      var w = wrecks[i];
      if (!w.model || w.fade <= 0) continue;
      bodies.push(w);
    }
    return bodies;
  }

  // --- sparks, on the overlay canvas -----------------------------------------

  function draw(ctx) {
    if (!api || !api.project || !sparks.length) return;
    ctx.save();
    ctx.lineCap = "round";
    for (var i = 0; i < sparks.length; i++) {
      var s = sparks[i];
      var a = Math.max(0, s.life / s.maxLife);
      var head = api.project(s.x, s.y, s.z);
      if (!head) continue;
      // The tail is where it was a moment ago, so a streak points along the
      // path it is actually travelling. Same rule the shared particle pass uses.
      var back = 0.05;
      var tail = api.project(s.x - s.vx * back, s.y - s.vy * back,
        Math.max(0, s.z - s.vz * back));
      // CAPPED, because `head.scale` is px per world unit and the camera can
      // be pushed in to five or six of them -- uncapped, a spark drew as a fat
      // grey capsule the size of the wreck it came off. A spark is a thin hot
      // line at every zoom; that is what makes it read as a spark.
      var w = Math.max(0.7, Math.min(3.4, (0.55 + a * 1.1) * head.scale));
      // Electrical, not fiery: a machine coming apart. Hot cores go white, the
      // rest keep the Wisp's own ley blue.
      ctx.strokeStyle = s.hot
        ? "rgba(236,248,255," + (0.95 * a).toFixed(3) + ")"
        : "rgba(120,198,252," + (0.85 * a).toFixed(3) + ")";
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(tail ? tail.x : head.x, tail ? tail.y : head.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
      if (a > 0.7) {
        ctx.fillStyle = "rgba(255,255,255," + ((a - 0.7) * 2.6).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(head.x, head.y, w * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  return {
    bind: bind,
    update: update,
    bodies: bodyList,
    draw: draw,
    reset: reset,
    // For the tests, and for the console when a wreck does not appear: whether
    // gl-world has bound this module at all, and what is live right now.
    count: function () {
      return { bound: !!api, watching: watch.size,
               wrecks: wrecks.length, sparks: sparks.length };
    }
  };
})();
