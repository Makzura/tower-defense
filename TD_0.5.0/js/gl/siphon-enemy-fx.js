// ---------------------------------------------------------------------------
// SiphonFXEnemy -- the Siphon's effects ON THE ENEMY. Lot L5.
//
// TWO effects, and the brief is stricter about what must NOT be here than
// about what must:
//
//   1. L'ENLISEMENT (the slow, unlocked at B2). It reads ONLY on the enemy --
//      never on the beam, never as an icon, never in the interface. A slowed
//      body BOGS DOWN, and the brief names the three things that say so:
//      its animation slows, its footfalls get heavy, and it leaves a drag
//      trail behind it. Those three, and nothing else.
//
//   2. THE GILDING AT CONTACT (voie A). Where the golden beam touches, the
//      contact point lightly gilds the enemy's surface. A tint at one point,
//      not a coat of paint: the gild is a warm light landing where the beam
//      lands, clipped to the body so it cannot become a halo.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DRAW. The brief lists these and says
// that adding one is an error, not an improvement, so they are named here to
// stop a later pass adding one "by kindness":
//
//   * armour / defence piercing (A1 `def_pierce`) -- NOTHING. No spark, no
//     special impact, no indicator. The numbers speak.
//   * the execute -- NOTHING.
//   * individual impacts -- NOTHING. The beam is continuous; there are no
//     impacts to show. Nothing in this file is triggered by a damage tick,
//     which is why it holds no hooks into the damage pipeline at all.
//   * the slow, on the beam or in the interface -- NOTHING. This file draws
//     on the body and on the ground under the body, and nowhere else.
//
// If a fourth effect is being added here, that list is the thing to re-read.
//
// PRESENTATION ONLY. Nothing here writes to a simulation object, adds a
// property to one, or holds a reference to a dead one. It reads live objects
// (`enemy.slowMultiplier`, `enemy.slowTimer`, `tower.locks`, `purchased.A`),
// keeps its own animation records beside them in a Map, and draws.
//
// --- HOW gl-world.js CALLS THIS --------------------------------------------
//
// index.html: one line beside the other js/gl/ effect modules
//     <script src="js/gl/siphon-enemy-fx.js"></script>
//
// (1) ONCE, in install(), beside the BlubFX bind() calls just before
//     `return true;` -- `project` and `groundHeightAt` are closures over
//     `camera`, which does not exist until install() has run:
//
//       if (typeof SiphonFXEnemy !== "undefined") {
//         SiphonFXEnemy.bind({ project: project, groundAt: groundHeightAt });
//       }
//
// (2) In ensureMap(), beside the other reset()s (a new board keeps no old
//     drag marks):
//
//       if (typeof SiphonFXEnemy !== "undefined") SiphonFXEnemy.reset();
//
// (3) In drawWorld(), immediately after `BlubFXSystems.update(state);` --
//     one read-only pass over the towers, before anything is drawn:
//
//       if (typeof SiphonFXEnemy !== "undefined") SiphonFXEnemy.update(state);
//
// (4) In drawWorld()'s enemy loop. `bog()` is 0 for every enemy that is not
//     enlise, and `sink()` / `walkFrame()` are then exactly the identity, so
//     these may be called unconditionally -- the `if (bog)` guards below are
//     there to skip the arithmetic, not because the result would differ.
//     Add ONE line after `var model = enemyModel(e);`:
//
//       var bog = (typeof SiphonFXEnemy !== "undefined")
//         ? SiphonFXEnemy.bog(e) : 0;
//       var sink = bog ? SiphonFXEnemy.sink(bog, radius, e.progress || 0) : 0;
//
//     then, in the `if (model)` branch, after `var walk = ...`:
//
//       if (bog) walk = SiphonFXEnemy.walkFrame(bog, e.progress || 0,
//                                               stride, frames);
//       drawActor(model, e.pos.x, e.pos.y, yaw, radius / 11,
//         groundHeightAt(e.pos.x, e.pos.y) + sink, walk);
//
//     and in the sphere `else` branch, `+ sink` on the same height:
//
//       renderer.draw(enemySphere(e).mesh, e.pos.x, e.pos.y,
//         groundHeightAt(e.pos.x, e.pos.y) + beat * radius * 0.22 + sink,
//         yaw, radius * (0.94 + beat * 0.10));
//
// (5) In drawOverlays(), in the GROUND group -- immediately after
//     `BlubFXShots.drawGround(ctx, state, BLUB_FX_API);` and before
//     `BlubFXCircles.draw(...)`. A drag mark lies on the road, under
//     everything else, and it must NOT be inside a withGround():
//
//       if (typeof SiphonFXEnemy !== "undefined") {
//         SiphonFXEnemy.drawTrails(ctx, state);
//       }
//
// (6) In drawOverlays(), immediately after `BlubFXSystems.drawSigils(...)`
//     and BEFORE the health-bar loop. The gild is on the body, so it goes
//     over the bodies and under the interface -- a bar or a hover ring is
//     never tinted by it:
//
//       if (typeof SiphonFXEnemy !== "undefined") {
//         SiphonFXEnemy.drawGild(ctx, state);
//       }
//
// Nothing else in gl-world.js changes, and every call site above no-ops until
// bind() has been called.
//
// --- PERFORMANCE (visual-pass/PERF.md) -------------------------------------
//
// The ceiling is: stress (100 enemies) under 6.0 ms at 720p, heavy under
// 4.0 ms at 1080p, stress under 14.0 ms at 4K. The pass may spend ~3 ms more
// than it found. THE SLOW IS THE SENSITIVE ONE -- B5 holds 40 targets, so
// "dozens enlises at once" is a real board. How this stays inside the budget:
//
//   * ZERO COST WHEN NOTHING IS ENLISE. `bog()` returns on a count check
//     before it touches the Map, so a board with no Siphon on it pays one
//     integer compare per enemy per frame and nothing else.
//   * ONE PROJECTION PER TRAIL, not one per stamp. The ground basis is
//     measured ONCE per frame at the board centre and every stamp is then
//     placed with two multiply-adds -- the same trick blub-systems.js uses
//     for its decals, and the same argument: over a mark thirty pixels long
//     the perspective difference from the board centre is invisible.
//   * ONE FILLED RIBBON per trail (two at full quality: the drag, plus a
//     faint sheen over its freshest third). At 100 enlises that is 100
//     projections and 200 fills of a 16-point path -- measured against
//     gl-world's own overlay pass, which already builds gradients and colour
//     strings per shot, this is the cheaper half of that layer.
//   * NO STRING BUILDING AND NO ALLOCATION IN A FRAME. Every colour is a
//     constant declared at load; strength is applied through ctx.globalAlpha,
//     not by composing "rgba(...)" per stamp. Records and their stamps are
//     pooled and capped (MAX_RECORDS), so a pathological board drops the
//     surplus rather than growing an array.
//   * FILL RATE IS THE SENSITIVE AXIS AT 4K, and everything here is small:
//     a trail is a ribbon roughly one body wide, a gild is a disc smaller
//     than the body it is clipped to. There is no full-screen pass, no soft
//     shadow and no large translucent overlay in this file.
//   * THE GILD IS BOUNDED BY THE MECHANIC, not by a cap. Path A never buys
//     maxTargets: base 1, and a crosspath can only reach B2 (+1). So a
//     gilding Siphon holds at most 2 enemies, and seven of them at most 14 --
//     which is why the gild can afford a real radial gradient per contact.
//   * `quality(k)` drops the sheen first, then trail length, if a later
//     measurement ever needs the headroom back.
// ---------------------------------------------------------------------------

var SiphonFXEnemy = (function () {
  "use strict";

  // Without Map there is no way to keep a record beside an enemy without
  // writing a marker onto it, and writing onto a simulation object is the one
  // thing this file may not do. So it disables itself instead.
  var HAS_MAP = (typeof Map === "function");

  var api = null;                  // { project, groundAt } from gl-world
  var TAU = Math.PI * 2;

  // --- what the tiers switch on ---------------------------------------------
  //
  // Read from the tower, never guessed. `flags.slow` is B2 (js/towers/
  // beam.config.js), and `purchased.A` is how far up voie A this Siphon is --
  // the same read gl-world's own siphonGroup() makes.
  //
  // ONE KNOB: if the beam lot decides the beam only turns gold later than A1,
  // this is the number to move, and it is the only place the gild's gate
  // lives.
  var GILD_FROM_A_TIER = 1;

  // --- l'enlisement, in numbers ---------------------------------------------

  // How long the bog is held after the last frame a slowing Siphon was seen
  // holding this enemy. BeamTower re-asserts a 0.2 s slow every frame and lets
  // go a fifth of a second after the beam leaves (BeamTower.SLOW_REFRESH_
  // SECONDS), so this is that plus a frame of slack: the picture lets go when
  // the simulation does, and never before.
  var SLOW_HOLD_S = 0.30;

  // The envelope, so a beam sweeping across a queue does not pop the effect on
  // and off. Up fast enough to be caused by the beam, down slow enough to read
  // as the body climbing back out.
  var BOG_RISE_S = 0.22;
  var BOG_FALL_S = 0.38;

  // The slow the Siphon actually applies is 10% at B2 and 15% at B4 -- far too
  // small to read if the picture were scaled linearly by it. So the depth is
  // split: a body that is enlise at all gets most of the weight, and the rest
  // tracks how hard it is really slowed. `slowMultiplier` is the enemy's own
  // live value and is only ever READ.
  var BOG_FLOOR = 0.62;
  var BOG_FULL_SLOW = 0.15;        // 1 - slowMultiplier that counts as "all of it"

  // How deep the body sits, as a fraction of its own radius, and how much more
  // it drops on each footfall. Small numbers: this is a man wading, not a man
  // sinking, and the footprint on the ground is untouched either way.
  var SINK_STEADY = 0.085;
  var SINK_FOOTFALL = 0.075;

  // How hard the walk cycle is warped. The cycle keeps its length exactly --
  // only its DISTRIBUTION changes, dwelling on the two planted-foot beats and
  // lurching through the swings. Below 1 the phase can never run backwards.
  var WALK_DWELL = 0.45;

  // The drag trail. Emission is by DISTANCE COVERED, not by a clock, for the
  // same reason the walk cycle is: a stopped enemy must stop leaving marks,
  // and a slowed one must leave the same marks in the same places, more
  // slowly. Spacing and width are fractions of the body's own radius, so a
  // swarm speck and a boss both leave a trail their own size.
  var TRAIL_N = 8;                 // stamps kept per body
  var TRAIL_LIFE_S = 1.15;
  var STAMP_SPACING_R = 0.55;      // of radius
  // WIDTH IS SET AGAINST THE CAMERA, not against the body. The mark's width
  // lies across the direction of travel, which on a road running left to right
  // is the board's Y axis -- the axis this camera foreshortens hardest. A
  // ribbon sized to look right in plan came out an 18 pixel sliver on screen
  // and measured a 398 pixel difference over the whole board. These are still
  // narrower than the body that leaves them, which is the constraint that
  // matters: a drag mark wider than the thing dragging is a puddle.
  var STAMP_WIDTH_R = 0.55;        // of radius, at the light part of the stride
  var STAMP_FOOTFALL_R = 0.35;     // extra half-width on a plant
  // A jump this far in one frame is not walking: it is B5's own 500 u.l.
  // knockback, a fractal split, or a spawn. The trail is cut rather than
  // drawn as a stripe across the board.
  var TELEPORT_SPACING = 6;        // multiples of the emit spacing

  // Voie B's palette (visual-pass/SIPHON-SOCLE.md section 3), and the VALUES
  // are the other way round from the character's.
  //
  // The first build made the whole ribbon oil_black, on the socle's rule that
  // the largest surface takes the darkest value. That rule is about the figure;
  // on the board it produced a mark nobody could see, because the road is
  // already a dark navy and oil_black against it is the same value. The
  // capture settled it: at a 700 unit camera the trail was invisible, and it
  // was barely there at 2.6x magnification.
  //
  // So the body of the mark is `membrane` -- a grey-violet a shade LIGHTER
  // than the road and off its hue, which is what a scuffed, churned surface
  // actually looks like -- and oil_black is kept for the wet core right behind
  // the feet, where it reads as depth rather than as nothing. No emissive
  // rose anywhere: rose_sick is the beam's accent and this must never read as
  // a beam cue.
  // The alphas are what a pixel difference against the road actually demanded:
  // at 0.30 the whole board's worth of trails moved 398 pixels by a mean of
  // 7.8/255, which is under the threshold of anything being visible at all.
  var TRAIL_DRAG = "rgba(74,66,80,0.58)";      // membrane  #4A4250
  var TRAIL_CORE = "rgba(20,16,28,0.45)";      // oil_black #14101C

  // --- the gild, in numbers -------------------------------------------------

  var GILD_RISE_S = 0.28;
  var GILD_FALL_S = 0.45;
  var GILD_PEAK = 0.62;            // ctx.globalAlpha at full contact
  // SIZED TO STAY INSIDE THE BODY, and these three numbers were set by
  // looking rather than by reasoning. The first build clipped a wide tint to
  // an ellipse built from `radiusPx()`, on the assumption that the clip would
  // keep it on the surface. In the capture the clip itself was the artefact:
  // an ellipse of hard-edged warm light sitting on the ROAD behind the body,
  // which reads as a lamp standing behind the enemy and not as a gilded
  // surface. The enemy models are roughly one radius wide and four tall, so
  // the tint is now small enough that its gradient has died before it reaches
  // any silhouette edge -- which is what removes the edge, not a clip.
  var GILD_OFFSET_R = 0.28;        // how far toward the tower the contact sits
  var GILD_RADIUS_R = 0.55;        // the tint's reach, of the body's radius
  var GILD_HEIGHT_R = 1.15;        // contact height above the feet, in radii

  // Voie A's palette, constant strings. Alpha rides on ctx.globalAlpha so
  // nothing here is ever recomposed per frame.
  var GILD_CORE = "rgba(240,226,192,0.55)";    // white_warm #F0E2C0
  var GILD_MID = "rgba(217,164,65,0.34)";      // amber      #D9A441
  var GILD_EDGE = "rgba(201,162,39,0.12)";     // gold       #C9A227
  var GILD_OUT = "rgba(201,162,39,0)";

  var MAX_RECORDS = 96;            // above anything the wave schedule produces

  // --- state ----------------------------------------------------------------

  var records = HAS_MAP ? new Map() : null;   // enemy -> record
  var live = [];                   // the same records, for allocation-free iteration
  var pool = [];                   // retired records, reused
  var token = -1;                  // frame stamp, so update() is idempotent
  var quality = 1;

  // Read-only counters for TDObs / the perf harness.
  var counts = { records: 0, trails: 0, gilds: 0, stamps: 0 };

  function makeRecord() {
    var stamps = new Array(TRAIL_N);
    for (var i = 0; i < TRAIL_N; i++) {
      stamps[i] = { x: 0, y: 0, nx: 0, ny: 1, w: 1, age: 0 };
    }
    return {
      e: null,                     // the enemy, dropped the moment it is gone
      hold: 0,                     // seconds of enlisement left to show
      bog: 0,                      // envelope 0..1
      gild: 0,                     // envelope 0..1
      gildSeen: -1,
      gx: 0, gy: -1,               // unit direction from the body to the beam
      hasDir: false,
      lastX: 0, lastY: 0,          // where the last stamp was laid
      hasLast: false,
      head: 0, count: 0,
      stamps: stamps
    };
  }

  function take() {
    var r = pool.length ? pool.pop() : makeRecord();
    r.e = null; r.hold = 0; r.bog = 0; r.gild = 0; r.gildSeen = -1;
    r.gx = 0; r.gy = -1; r.hasDir = false;
    r.hasLast = false; r.head = 0; r.count = 0;
    return r;
  }

  // DROP THE ENEMY BEFORE THE RECORD IS REUSED, and drop it the moment the
  // body leaves the board rather than when the picture ends -- a pooled record
  // holding a dead enemy would keep it, its path and its type table alive for
  // as long as the pool lived.
  function retire(rec) {
    rec.e = null;
    pool.push(rec);
  }

  // --- wiring ---------------------------------------------------------------

  function bind(helpers) {
    api = (helpers && helpers.project) ? helpers : null;
    return !!api && HAS_MAP;
  }

  function reset() {
    if (records) records.clear();
    while (live.length) retire(live.pop());
    token = -1;
    frameToken = -1;
    counts.records = counts.trails = counts.gilds = counts.stamps = 0;
  }

  // Game seconds since the last frame: real elapsed time at the speed the
  // player picked, and zero while paused. Both globals are read through typeof
  // so this file also works in a harness that has neither.
  function step(state) {
    var dt = state.dt || 0;
    if (dt > 0.1) dt = 0.1;                   // a stalled tab, clamped
    if (typeof paused !== "undefined" && paused) return 0;
    var speed = (typeof gameSpeed === "number" && gameSpeed > 0) ? gameSpeed : 1;
    return dt * speed;
  }

  // --- the ground frame, measured PER TRAIL ---------------------------------
  //
  // A straight mark on the board is a skewed one on screen once the camera is
  // orbited, so a mark that is not projected point by point needs the ground's
  // two BASIS VECTORS -- how far one board pixel of +x and of +y move the
  // screen point.
  //
  // THIS WAS MEASURED ONCE PER FRAME AT THE BOARD CENTRE, and that was wrong.
  // It is what blub-systems.js does, and it is sound there because its decals
  // are ten pixels across and its camera looks at the middle of the board. A
  // capture with the camera parked on an enemy near the edge measured the two
  // bases against each other: at the board centre the +y basis was
  // (-1.62, -0.28), and at the body it was (-0.10, -0.97). Rescaling by depth
  // cannot fix that -- they do not point the same way -- so the ribbon's width
  // was being laid ALONG the road instead of across it, and every drag mark on
  // the board collapsed into a 4 pixel line. Measured, not guessed: the fill
  // covered 907 pixels across 241 columns, a median of four thick.
  //
  // So the basis is measured at the trail's OWN anchor: three projections per
  // trail instead of one, still nine times cheaper than projecting both edges
  // of every stamp, and exact where the mark actually is. The probe is short
  // on purpose -- a long one can land on a raised deck and tilt the frame it
  // is supposed to be measuring.
  var PROBE = 12;

  // --- the read-only pass ---------------------------------------------------

  function isSiphon(t) {
    return !!(t && t.constructor && t.constructor.ID === "siphon" && t.core);
  }

  // How deep this body is bogged, from its OWN live slow. Never written to,
  // never cached on the enemy.
  function depthOf(e) {
    var d = 1 - (e.slowMultiplier || 1);
    if (!(d > 0)) return BOG_FLOOR;
    var f = d / BOG_FULL_SLOW;
    if (f > 1) f = 1;
    return BOG_FLOOR + (1 - BOG_FLOOR) * f;
  }

  function ensureRecord(e) {
    var rec = records.get(e);
    if (rec) return rec;
    if (live.length >= MAX_RECORDS) return null;   // never grow inside a frame
    rec = take();
    rec.e = e;
    records.set(e, rec);
    live.push(rec);
    return rec;
  }

  // ONE PASS OVER THE TOWERS, once per frame. Idempotent on state.now, so it
  // does not matter if it is reached twice in a frame.
  function update(state) {
    if (!api || !HAS_MAP || !state) return;
    var now = state.now || 0;
    if (now === token) return;
    token = now;
    var dt = step(state);

    var towers = state.towers || [];
    var i, j;

    // Who is holding what, and for which mechanic. A stunned Siphon shows
    // neither: `visibleLocks()` is the tower's own answer to that question,
    // and it keeps the locks intact while hiding the picture.
    for (i = 0; i < towers.length; i++) {
      var t = towers[i];
      if (!isSiphon(t)) continue;
      var stats = t.core.stats;
      var slows = !!(stats && stats.flags && stats.flags.slow);          // B2
      var bought = t.core.purchased;
      var gilds = !!(bought && (bought.A || 0) >= GILD_FROM_A_TIER);     // voie A
      if (!slows && !gilds) continue;

      var locks = (typeof t.visibleLocks === "function")
        ? t.visibleLocks() : t.locks;
      if (!locks) continue;

      for (j = 0; j < locks.length; j++) {
        var e = locks[j];
        if (!e || e.dead || e.leaked || !e.pos) continue;
        var rec = ensureRecord(e);
        if (!rec) continue;
        if (slows) rec.hold = SLOW_HOLD_S;
        if (gilds) {
          rec.gildSeen = token;
          // Where the beam comes in: from the tower, toward the body. Two
          // Siphons on one enemy give one contact between them rather than a
          // second record -- the state stays bounded and the tint stays a
          // tint.
          var dx = t.x - e.pos.x, dy = t.y - e.pos.y;
          var len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0.001) {
            dx /= len; dy /= len;
            if (!rec.hasDir) { rec.gx = dx; rec.gy = dy; rec.hasDir = true; }
            else {
              // Eased, so a beam swinging round a body slides its contact
              // point rather than teleporting it.
              var k = dt * 9; if (k > 1) k = 1;
              rec.gx += (dx - rec.gx) * k;
              rec.gy += (dy - rec.gy) * k;
              var nl = Math.sqrt(rec.gx * rec.gx + rec.gy * rec.gy) || 1;
              rec.gx /= nl; rec.gy /= nl;
            }
          }
        }
      }
    }

    // Age every record, emit trail stamps, retire what is finished.
    var stamps = 0;
    for (i = live.length - 1; i >= 0; i--) {
      var r = live[i];
      var en = r.e;
      var gone = !en || en.dead || en.leaked;

      // A BODY THAT HAS LEFT THE BOARD KEEPS ITS TRAIL AND LOSES ITS
      // REFERENCE. The drag mark is on the road, not on the enemy, so it may
      // outlive it -- but the record must not.
      if (gone && en) { r.e = null; records.delete(en); en = null; }

      if (r.hold > 0) r.hold -= dt;

      // The bog is asked for by the SOURCE (a Siphon with `slow` is holding
      // it) and sized by the ENEMY's own live slow. Both have to be true: an
      // enemy slowed by something else entirely is not enlise, and an enemy
      // whose slow has expired has climbed out.
      var want = (en && r.hold > 0 && (en.slowTimer || 0) > 0) ? depthOf(en) : 0;
      if (want > r.bog) {
        r.bog += dt / BOG_RISE_S;
        if (r.bog > want) r.bog = want;
      } else if (want < r.bog) {
        r.bog -= dt / BOG_FALL_S;
        if (r.bog < want) r.bog = want;
      }

      var gWant = (en && r.gildSeen === token) ? 1 : 0;
      if (gWant > r.gild) {
        r.gild += dt / GILD_RISE_S;
        if (r.gild > 1) r.gild = 1;
      } else if (gWant < r.gild) {
        r.gild -= dt / GILD_FALL_S;
        if (r.gild < 0) r.gild = 0;
      }

      // Stamps age whether or not the body is still there.
      var n = r.count, alive = 0;
      for (j = 0; j < n; j++) {
        var s = r.stamps[(r.head - 1 - j + TRAIL_N * 2) % TRAIL_N];
        s.age += dt;
        if (s.age < TRAIL_LIFE_S) alive++;
      }
      r.count = alive;
      stamps += alive;

      if (en && r.bog > 0.05 && dt > 0) emit(r, en);

      if (!en && r.count === 0 && r.gild <= 0) {
        live[i] = live[live.length - 1];
        live.pop();
        retire(r);
      } else if (en && r.bog <= 0 && r.gild <= 0 && r.count === 0) {
        records.delete(en);
        live[i] = live[live.length - 1];
        live.pop();
        retire(r);
      }
    }

    counts.records = live.length;
    counts.stamps = stamps;
  }

  // Lay a stamp if the body has covered enough ground since the last one.
  function emit(rec, e) {
    var r = e.radiusPx ? e.radiusPx() : 11;
    var spacing = r * STAMP_SPACING_R;
    var x = e.pos.x, y = e.pos.y;

    if (!rec.hasLast) {
      rec.lastX = x; rec.lastY = y; rec.hasLast = true;
      return;
    }
    var dx = x - rec.lastX, dy = y - rec.lastY;
    var d2 = dx * dx + dy * dy;
    if (d2 < spacing * spacing) return;

    var lim = spacing * TELEPORT_SPACING;
    if (d2 > lim * lim) {
      // Knocked back, split or respawned. Cut the trail rather than draw a
      // stripe across the board.
      rec.count = 0;
      rec.lastX = x; rec.lastY = y;
      return;
    }

    var len = Math.sqrt(d2);
    var ux = dx / len, uy = dy / len;

    // THE FOOTFALL, on the same stride clock gl-world's own walk runs on:
    // one cycle per `radius * 2.6` of ground covered, phase 0 at contact. So
    // the heavy stamps land under the planted feet and cannot drift out of
    // step with the legs above them.
    var phase = (e.progress || 0) / (r * 2.6) * TAU;
    var heel = 0.5 + 0.5 * Math.cos(phase * 2);

    var s = rec.stamps[rec.head];
    s.x = x; s.y = y;
    s.nx = -uy; s.ny = ux;
    s.w = r * (STAMP_WIDTH_R + STAMP_FOOTFALL_R * heel) * rec.bog;
    s.age = 0;
    rec.head = (rec.head + 1) % TRAIL_N;
    if (rec.count < TRAIL_N) rec.count++;
    rec.lastX = x; rec.lastY = y;
  }

  // --- what the 3D pass asks for --------------------------------------------

  // How enlise this body is, 0..1. The first line is the whole performance
  // story for a board with no Siphon on it.
  function bog(e) {
    if (!live.length || !records) return 0;
    var r = records.get(e);
    return r ? r.bog : 0;
  }

  // How far the body sits INTO the road, in board px, negative. A steady sag
  // plus a dip on each footfall -- the weight the brief asks for, expressed
  // where a weight belongs: in the body, not in an icon. Returns exactly 0
  // when nothing is enlise, so gl-world may add it unconditionally.
  function sink(b, radius, progress) {
    if (!(b > 0)) return 0;
    var phase = progress / ((radius || 11) * 2.6) * TAU;
    var heel = 0.5 + 0.5 * Math.cos(phase * 2);
    return -(radius || 11) * b * (SINK_STEADY + SINK_FOOTFALL * heel);
  }

  // THE ANIMATION SLOWS -- and it already did, because gl-world advances the
  // walk by DISTANCE COVERED, so a body moving at 0.85x plays its cycle at
  // 0.85x for free. What this adds is the other half of bogging down: the
  // cycle keeps its length exactly and changes its DISTRIBUTION, dwelling on
  // the two planted beats and lurching through the swings between them.
  //
  // At b = 0 the warp term is zero and this returns
  // `Math.floor(progress / stride * frames)` -- bit for bit the frame
  // gl-world already computes.
  function walkFrame(b, progress, stride, frames) {
    var u = progress / stride;
    var cycles = Math.floor(u);
    var f = u - cycles;
    if (b > 0) {
      var k = WALK_DWELL * b;                  // < 1, so phase never reverses
      f -= (k / (2 * TAU)) * Math.sin(2 * TAU * f);
      if (f < 0) f = 0; else if (f >= 1) f = 0.999999;
    }
    return Math.floor((cycles + f) * frames);
  }

  // --- the ground layer -----------------------------------------------------

  function drawTrails(ctx, state) {
    if (!api || !live.length) return;
    var now = state ? (state.now || 0) : 0;
    if (!ensureFrame(now)) return;

    var drawn = 0;
    ctx.save();
    for (var i = 0; i < live.length; i++) {
      var rec = live[i];
      if (rec.count < 2 && !(rec.count === 1 && rec.e)) continue;

      // ONE projection for the whole ribbon: the newest stamp, which is the
      // patch of road the body is standing on.
      var newest = rec.stamps[(rec.head - 1 + TRAIL_N) % TRAIL_N];
      var p = api.project(newest.x, newest.y, 0.35);
      if (!p) continue;
      var k = (p.scale || 1) / fScale;
      var ax = newest.x, ay = newest.y;

      if (!ribbon(ctx, rec, p, k, ax, ay, rec.count, 1)) continue;
      ctx.fillStyle = TRAIL_DRAG;
      ctx.fill();
      drawn++;

      // The freshest half again, narrower and darker: what the body has just
      // dragged through is still wet, and what it dragged through a second ago
      // has dried. First thing `quality()` drops.
      if (quality >= 0.75 && rec.count >= 3) {
        var fresh = rec.count < 4 ? rec.count : (rec.count >> 1);
        if (ribbon(ctx, rec, p, k, ax, ay, fresh, 0.62)) {
          ctx.fillStyle = TRAIL_CORE;
          ctx.fill();
        }
      }
    }
    ctx.restore();
    counts.trails = drawn;
  }

  // The ribbon as ONE path: up one side from the oldest stamp to the newest,
  // then back down the other. `n` stamps from the head; `scale` narrows it for
  // the sheen pass so the second fill sits inside the first.
  function ribbon(ctx, rec, p, k, ax, ay, n, scale) {
    if (n < 2) return false;
    var i, s, sx, sy, hw, dx, dy;
    ctx.beginPath();
    // Oldest -> newest along the left edge.
    for (i = n - 1; i >= 0; i--) {
      s = rec.stamps[(rec.head - 1 - i + TRAIL_N * 2) % TRAIL_N];
      if (s.age >= TRAIL_LIFE_S) continue;
      hw = s.w * scale * (0.35 + 0.65 * (1 - s.age / TRAIL_LIFE_S));
      dx = s.x - ax + s.nx * hw;
      dy = s.y - ay + s.ny * hw;
      sx = p.x + (dx * fAx + dy * fBx) * k;
      sy = p.y + (dx * fAy + dy * fBy) * k;
      if (i === n - 1) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    // The head of the ribbon is the body's own feet, so the drag is attached
    // to the thing dragging rather than starting a stamp behind it.
    if (rec.e && rec.e.pos) {
      dx = rec.e.pos.x - ax; dy = rec.e.pos.y - ay;
      ctx.lineTo(p.x + (dx * fAx + dy * fBx) * k,
                 p.y + (dx * fAy + dy * fBy) * k);
    }
    // Newest -> oldest along the right edge.
    for (i = 0; i < n; i++) {
      s = rec.stamps[(rec.head - 1 - i + TRAIL_N * 2) % TRAIL_N];
      if (s.age >= TRAIL_LIFE_S) continue;
      hw = s.w * scale * (0.35 + 0.65 * (1 - s.age / TRAIL_LIFE_S));
      dx = s.x - ax - s.nx * hw;
      dy = s.y - ay - s.ny * hw;
      ctx.lineTo(p.x + (dx * fAx + dy * fBx) * k,
                 p.y + (dx * fAy + dy * fBy) * k);
    }
    ctx.closePath();
    return true;
  }

  // --- the body layer -------------------------------------------------------

  // THE GILDING AT CONTACT. A warm light landing where the beam lands, drawn
  // over the bodies and under the interface. Additive at low alpha, so it
  // warms the colour already there rather than replacing it: a tint on a
  // surface, not a coat of paint on it.
  //
  // IT HAS NO EDGE OF ITS OWN, and that is the whole trick. It is small
  // enough, and offset little enough from the body's own axis, that the
  // gradient has fallen to nothing before it reaches any silhouette. Nothing
  // clips it, because a clip is exactly what put a hard-edged oval of light on
  // the road in the first build.
  //
  // Dead steady. It does not pulse, flicker or flash: the beam is continuous,
  // and anything that beat would read as the individual impacts the brief
  // says do not exist.
  function drawGild(ctx, state) {
    if (!api || !live.length) return;
    var drawn = 0;
    for (var i = 0; i < live.length; i++) {
      var rec = live[i];
      if (!(rec.gild > 0.01)) continue;
      var e = rec.e;
      if (!e || e.dead || !e.pos) continue;

      var r = e.radiusPx ? e.radiusPx() : 11;
      var c = api.project(e.pos.x + rec.gx * r * GILD_OFFSET_R,
                          e.pos.y + rec.gy * r * GILD_OFFSET_R,
                          r * GILD_HEIGHT_R);
      if (!c) continue;
      var reach = r * GILD_RADIUS_R * (c.scale || 1);
      if (reach < 0.75) continue;              // smaller than a pixel of tint

      var g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, reach);
      g.addColorStop(0, GILD_CORE);
      g.addColorStop(0.35, GILD_MID);
      g.addColorStop(0.7, GILD_EDGE);
      g.addColorStop(1, GILD_OUT);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = GILD_PEAK * rec.gild * quality;
      ctx.fillStyle = g;
      ctx.fillRect(c.x - reach, c.y - reach, reach * 2, reach * 2);
      ctx.restore();
      drawn++;
    }
    counts.gilds = drawn;
  }

  return {
    bind: bind,
    reset: reset,
    update: update,
    bog: bog,
    sink: sink,
    walkFrame: walkFrame,
    drawTrails: drawTrails,
    drawGild: drawGild,
    // The quality lever, 0..1, if a later measurement needs the headroom.
    // Below 0.75 the sheen pass stops entirely.
    quality: function (k) {
      if (k !== undefined) quality = Math.max(0, Math.min(1, k));
      return quality;
    },
    stats: function () {
      return { records: counts.records, stamps: counts.stamps,
               trails: counts.trails, gilds: counts.gilds,
               pooled: pool.length, bound: !!api };
    }
  };
})();
