// ---------------------------------------------------------------------------
// blub-projectiles.js -- what a blub's shot LOOKS like.  §10.
//
// PRESENTATION ONLY.  This file reads live objects and never writes one.  The
// only state it owns is its own, and all of it is preallocated at load.
//
// WHAT IT IS DRAWING FROM.  js/blub.js resolves an attack INSTANTLY -- there is
// no projectile in the air and no bullet in `bullets`.  What it leaves behind is
// one cosmetic field, stamped in Blub.resolveAttack / Blub.fireLaser:
//
//     blub.tracer = { x, y, age, kind }        kind: "shot" | "laser"
//
// with `x, y` the TARGET's position at the instant of the shot (or, for a lance,
// a point 4000 px down the heading), `age` counted up in Blub.update and the
// whole object dropped at age > 0.12.  Its own comment says it plainly:
// "Cosmetic only ... Nothing reads it back."
//
// So this file does not simulate flight.  It watches for a NEW tracer object,
// snapshots the two endpoints, and then owns the whole picture on its own clock
// -- which is what lets a gob take 0.30 s to come down and leave a splat that
// outlives the tracer by half a second, and what lets the SuperBlub's lance
// persist far past the 0.12 s the simulation keeps it.
//
//
// THE PIVOT: CYBERBLUB -> MECHABLUB.
//
// The roster crosses from creature to weapon between those two units, and the
// brief asks for that boundary to be SHARP.  It is not a colour change here; it
// is a change in every property a shot has:
//
//                    ORGANIC (blub1-3, mini1-2, hungry, cyber)   BALLISTIC (mecha, mecha2, superb)
//   path             a parabola, always -- it is thrown          dead straight, zero curvature
//   time             a BODY TRAVELS, 0.11-0.36 s of flight       hitscan: the whole line exists on frame one
//   silhouette       closed round forms, no straight edge        straight edges only, butt caps, polygon flash
//   arrival          a SPLAT: irregular, wet, stays and dries     a SPARK: four straight ticks, gone in 0.1 s
//   residue          colour on the ground for 0.3-1.1 s          brass on the ground and a scorch pinpoint
//   the muzzle       nothing -- the body simply leaves           MUZZLE FLASH + EJECTED CASING + CHASSIS RECOIL
//
// The Cyberblub keeps EVERY organic property and changes only its colour and
// its trail, so it reads as the last creature.  The Mechablub changes all six at
// once, so it reads as the first gun.  A player who never looks at a stat panel
// can see where the tower stopped summoning animals.
//
//
// PERFORMANCE (visual-pass/PERF.md: stress must stay under 6 ms at 720p, and
// OVERDRAW is the sensitive axis).  The design is deliberately overdraw-light:
//
//   * Fixed-capacity pools, allocated once.  A saturated board drops the OLDEST
//     effect; it never grows an array and never allocates during a frame.
//   * NO GRADIENTS ANYWHERE.  Every colour is an opaque constant string from a
//     table and every fade is `ctx.globalAlpha`.  Nothing builds a string in a
//     hot loop and nothing calls createLinearGradient.
//   * No shadowBlur, no filter, no globalCompositeOperation.  Source-over with
//     alpha <= 0.85 converges towards the effect's own colour as effects pile
//     up -- it cannot saturate to white, which is §17's actual failure mode.
//   * A ground decal costs THREE project() calls, ever.  Those three build an
//     affine frame (see groundFrame) and the rest of the decal is drawn in unit
//     space under ctx.transform, so a nine-sided splat costs no more than a dot.
//   * Everything is SMALL.  The only wide shapes in the file are the Hungry
//     Blub's puddle (drawn at its true splash radius, ~8 px) and the SuperBlub's
//     lance, which is rare, thin after 60 ms, and capped in length.
//   * A crowd governor (crowdFade) dims everything as the pools fill, so three
//     hundred blubs firing at once is dimmer per shot than three are, not
//     brighter in total.
//
//
// READABILITY (§17: nothing may hide the enemies or the path, and no pile-up of
// effects may saturate).  The rules this file holds itself to:
//
//   1. Nothing over an enemy lasts longer than 0.12 s except the lance's core,
//      which is a few pixels wide.
//   2. Ground decals never exceed alpha 0.34, so the road reads through them.
//   3. No additive blending, ever.  See above.
//   4. The lance's wide envelope lives for 60 ms; after that only a thin core
//      and a flat ground scorch remain.
// ---------------------------------------------------------------------------

var BlubFXShots = (function () {
  "use strict";

  var TAU = Math.PI * 2;

  // --- the palette ---------------------------------------------------------
  //
  // Opaque strings only.  Alpha is always globalAlpha, never a per-frame
  // "rgba(...)" built out of numbers -- that is the string building the budget
  // forbids, and at three hundred units it is the difference between a table
  // lookup and three hundred allocations a frame.
  //
  // Colour meaning follows visual-pass/DIRECTION.md: ley cyan is the player's
  // power and it arrives with the Cyberblub, which is the tier the tower stops
  // being merely alive.  Family A stays vegetable green; the machines are brass,
  // white-hot and scorch.
  var C = {
    aSkin:   "#7fc873",  aCore:  "#dff2c6",  aRim:   "#2f5e37",  aWet: "#5c9c50",
    mSkin:   "#8fd489",  mCore:  "#e6f6d4",
    hSkin:   "#93bf5e",  hCore:  "#d8ec9e",  hWet:   "#4d7c39",  hRim: "#2a4a23",
    cSkin:   "#a9f2ec",  cCore:  "#ffffff",  cTrail: "#4fe3d2",  cWet: "#3aa9a4",
    hot:     "#fffdf4",  warm:   "#ffe6b0",  flash:  "#ffd68a",  flashHot: "#ffb45e",
    brass:   "#c9a24a",  brassD: "#7a5f27",  scorch: "#171310",  sparkC: "#ffeecb",
    lance:   "#5fe6dc",  lanceHot: "#eafffd", lanceGround: "#2f9d9a",
    monster: "#d69e5c",  monsterHot: "#f2d4a4", monsterWet: "#8a6330"
  };

  // --- the roster ----------------------------------------------------------
  //
  // `mode` is the pivot and it is one number: 0 organic, 1 ballistic.  Every
  // branch in the drawing below reads that field and nothing else, so the
  // boundary the brief asks for cannot be blurred by tuning a colour.
  //
  // `muzzle` is [forward, height] as MULTIPLES OF THE UNIT'S OWN FOOTPRINT
  // RADIUS, so it scales with a body without this file knowing a model's real
  // vertices.  See `concerns`: when the blub meshes publish Blender-local FX
  // anchors the way SNIPER_FX does, this table should be replaced by them.
  var ORGANIC = 0, BALLISTIC = 1;

  var PROFILES = {
    // --- family A: it is thrown, and it is wet ---------------------------
    // SPLAT RADII ARE DELIBERATELY MODEST.  These three units have no splash --
    // their damage lands on one body -- so a wide mark would be a lie about
    // reach, and it would also out-size the Hungry Blub's puddle, which is the
    // one organic impact that really does cover an area.  The ladder that has to
    // hold is: pellet tick < gob splat < puddle.
    blub1: { mode: ORGANIC, life: 0.30, arcK: 0.42, arcMin: 26, arcMax: 78,
      body: 3.3, tail: 0.055, pellets: 1, spread: 0,
      skin: C.aSkin, core: C.aCore, rim: C.aRim, wet: C.aWet,
      splat: 4.4, splatLife: 0.62, splatA: 0.26, flecks: 3,
      muzzle: [0.55, 1.15] },
    blub2: { mode: ORGANIC, life: 0.30, arcK: 0.42, arcMin: 28, arcMax: 84,
      body: 4.1, tail: 0.055, pellets: 1, spread: 0,
      skin: C.aSkin, core: C.aCore, rim: C.aRim, wet: C.aWet,
      splat: 5.4, splatLife: 0.70, splatA: 0.28, flecks: 4,
      muzzle: [0.55, 1.15] },
    blub3: { mode: ORGANIC, life: 0.31, arcK: 0.44, arcMin: 30, arcMax: 90,
      body: 5.0, tail: 0.06, pellets: 1, spread: 0,
      skin: C.aSkin, core: C.aCore, rim: C.aRim, wet: C.aWet,
      splat: 6.4, splatLife: 0.78, splatA: 0.30, flecks: 5,
      muzzle: [0.55, 1.18] },

    // --- the minis: a hail, on a machine-gun cadence -----------------------
    // One attack is a BURST.  The read is the stagger and the scatter, not any
    // one pellet -- three pellets 35 ms apart landing 8 px apart says "spraying"
    // where one bigger gob would just say "shooting".
    mini1: { mode: ORGANIC, life: 0.115, arcK: 0.22, arcMin: 9, arcMax: 26,
      body: 1.7, tail: 0, pellets: 3, spread: 0.10, stagger: 0.034,
      skin: C.mSkin, core: C.mCore, rim: C.aRim, wet: C.aWet,
      splat: 2.6, splatLife: 0.26, splatA: 0.18, flecks: 0,
      muzzle: [0.72, 0.86] },
    mini2: { mode: ORGANIC, life: 0.11, arcK: 0.21, arcMin: 9, arcMax: 26,
      body: 1.9, tail: 0, pellets: 4, spread: 0.11, stagger: 0.030,
      skin: C.mSkin, core: C.mCore, rim: C.aRim, wet: C.aWet,
      splat: 2.9, splatLife: 0.28, splatA: 0.19, flecks: 0,
      muzzle: [0.72, 0.86] },

    // --- the Hungry Blub: heavy, LOW, and it puddles -----------------------
    // The flattest arc of anything organic and the slowest flight: a mass that
    // barely clears the ground, arriving late.  Its puddle is drawn at the
    // unit's REAL splashUl (read off the live blub), with a low seep past it --
    // wide against every other impact in the file without lying about reach.
    hungry: { mode: ORGANIC, life: 0.36, arcK: 0.15, arcMin: 8, arcMax: 26,
      body: 7.2, tail: 0.07, pellets: 1, spread: 0,
      skin: C.hSkin, core: C.hCore, rim: C.hRim, wet: C.hWet,
      splat: 9, splatLife: 1.05, splatA: 0.32, flecks: 6, puddle: true,
      muzzle: [0.95, 0.72] },

    // --- the Cyberblub: still a creature, now energised --------------------
    // LAST ORGANIC.  It arcs, it travels, it splats -- every property of the
    // family it comes from.  Only the colour and the trail change, which is
    // exactly the point: this is an evolution, and the next unit is not.
    cyber: { mode: ORGANIC, life: 0.17, arcK: 0.30, arcMin: 16, arcMax: 52,
      body: 3.2, tail: 0.10, pellets: 1, spread: 0, trail: true,
      skin: C.cSkin, core: C.cCore, rim: C.cTrail, wet: C.cWet,
      splat: 4.6, splatLife: 0.40, splatA: 0.24, flecks: 3,
      muzzle: [0.60, 1.10] },

    // --- the machines: nothing travels, everything is straight -------------
    mecha: { mode: BALLISTIC, life: 0.085, width: 1.7, headW: 2.6,
      core: C.hot, warm: C.warm, flashC: C.flash,
      flash: 5.5, flashLife: 0.05, casing: 1, casingSize: 1.5,
      recoil: 0.45, spark: 4.2, sparkLife: 0.10, scorch: 2.2,
      muzzle: [0.86, 1.00] },
    mecha2: { mode: BALLISTIC, life: 0.11, width: 3.0, headW: 4.4,
      core: C.hot, warm: C.flashHot, flashC: C.flashHot,
      flash: 9.0, flashLife: 0.065, casing: 1, casingSize: 2.4,
      recoil: 1.00, spark: 6.5, sparkLife: 0.12, scorch: 3.4, kick: true,
      muzzle: [1.00, 0.72] },
    superb: { mode: BALLISTIC, life: 0.12, width: 3.8, headW: 5.6,
      core: C.hot, warm: C.warm, flashC: C.flash,
      flash: 11.0, flashLife: 0.07, casing: 1, casingSize: 2.9,
      recoil: 0.85, spark: 7.5, sparkLife: 0.13, scorch: 4.0, kick: true,
      muzzle: [0.92, 1.05] },

    // A fused monster stamps the same "shot" tracer and is not in §10's list.
    // It gets the heavy organic lob in its own tier colour rather than nothing
    // at all -- a tier 4 hitting the whole board in silence reads as a bug.
    monster: { mode: ORGANIC, life: 0.34, arcK: 0.26, arcMin: 18, arcMax: 60,
      body: 8.0, tail: 0.07, pellets: 1, spread: 0,
      skin: C.monster, core: C.monsterHot, rim: C.hRim, wet: C.monsterWet,
      splat: 12, splatLife: 0.9, splatA: 0.30, flecks: 5,
      muzzle: [0.50, 1.00] }
  };

  // --- pools ---------------------------------------------------------------
  //
  // Sized for the stress case in the brief: three hundred units.  When a pool is
  // full the oldest record is reused, so a board past the budget loses the
  // effect that has been on screen longest.  That is the only degradation mode
  // in the file: nothing here can grow.
  var SHOT_CAP = 160, DECAL_CAP = 72, CASING_CAP = 48, FLASH_CAP = 64,
      LANCE_CAP = 6, SUPERB_CAP = 12, LANCE_HITS = 12;

  // At most this many NEW effects are admitted per frame.  Three hundred Mini
  // Blub IIs at 3/s is fifteen bursts a frame; past that the visual stops
  // adding rather than the frame stops finishing.
  var MAX_NEW_PER_FRAME = 40;

  function pool(n, make) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = make();
    return a;
  }

  var shots = pool(SHOT_CAP, function () {
    return { on: 0, t: 0, life: 1, p: null, seed: 0,
      x0: 0, y0: 0, z0: 0, g0: 0, x1: 0, y1: 0, z1: 0, g1: 0,
      apex: 0, ux: 0, uy: 0, dist: 1, splat: 0, wide: 0 };
  });
  // kind 0 = an organic SPLAT, 1 = a machine's MARK (a spark for `sub` seconds
  // and a scorch pinpoint for the rest of `life`), 2 = a recoil KICK.
  var decals = pool(DECAL_CAP, function () {
    return { on: 0, t: 0, life: 1, sub: 0.1, x: 0, y: 0, r: 0, seed: 0, ang: 0,
      kind: 0, col: "#000", col2: "#000", a0: 0.3, flecks: 0, wide: 0 };
  });
  var casings = pool(CASING_CAP, function () {
    return { on: 0, t: 0, life: 1, x: 0, y: 0, z: 0, g: 0,
      vx: 0, vy: 0, vz: 0, spin: 0, size: 1 };
  });
  var flashes = pool(FLASH_CAP, function () {
    return { on: 0, t: 0, life: 1, x: 0, y: 0, z: 0, g: 0,
      ux: 0, uy: 0, size: 1, col: "#fff", kick: 0, r: 10 };
  });
  var lances = pool(LANCE_CAP, function () {
    return { on: 0, t: 0, life: 1, x: 0, y: 0, z: 0, g: 0,
      ux: 0, uy: 0, len: 0, halfW: 4, nHits: 0,
      hits: new Float32Array(LANCE_HITS) };
  });

  var superbs = new Array(SUPERB_CAP);
  var superbN = 0;

  var shotAt = 0, decalAt = 0, casingAt = 0, flashAt = 0, lanceAt = 0;

  function take(list, cursor) {
    // Prefer a free slot; fall back to the oldest, which is the one the cursor
    // is already pointing at.  One pass, no sorting, no allocation.
    var n = list.length;
    for (var k = 0; k < n; k++) {
      var i = (cursor + k) % n;
      if (!list[i].on) return i;
    }
    return cursor % n;
  }

  // --- deterministic noise -------------------------------------------------
  //
  // xorshift32, not Math.random -- house style (see BlubTower.nextRandom) and,
  // more usefully here, it means a given shot's scatter is the same every time
  // the frame is re-drawn rather than shimmering.
  var rngState = 0x9e3779b9;

  function rnd() {
    var s = rngState >>> 0;
    s ^= (s << 13) >>> 0; s = s >>> 0;
    s ^= s >>> 17;
    s ^= (s << 5) >>> 0;
    rngState = s >>> 0;
    return (rngState >>> 8) / 16777216;
  }

  function seedOf(b) {
    return (Math.round(b.x * 31) ^ (Math.round(b.y * 131) << 7)) >>> 0;
  }

  // Splat outlines, built ONCE at load.  Nine points of jittered radius, in unit
  // space, so a splat is drawn under the ground frame with no trigonometry and
  // no projection beyond the frame's own three.
  var SPLAT_SHAPES = (function () {
    var out = [], v, i, n = 9;
    for (v = 0; v < 4; v++) {
      var pts = new Float32Array(n * 2);
      for (i = 0; i < n; i++) {
        var k = 0.58 + rnd() * 0.66;
        var a = (i / n) * TAU;
        pts[i * 2] = Math.cos(a) * k;
        pts[i * 2 + 1] = Math.sin(a) * k;
      }
      out.push(pts);
    }
    return out;
  })();

  // Where the flecks land around a splat, also unit space, also once.
  var FLECKS = (function () {
    var pts = new Float32Array(8 * 3);
    for (var i = 0; i < 8; i++) {
      var a = rnd() * TAU;
      var d = 0.95 + rnd() * 0.75;
      pts[i * 3] = Math.cos(a) * d;
      pts[i * 3 + 1] = Math.sin(a) * d;
      pts[i * 3 + 2] = 0.10 + rnd() * 0.14;
    }
    return pts;
  })();

  // --- per-blub presentation state ----------------------------------------
  //
  // A WeakMap so a dead blub takes its record with it: nothing to prune, no way
  // to leak, and no field written onto a simulation object.  Without WeakMap the
  // module falls back to `tracer.age === 0`, which is exact while the game is
  // running (Blub.update ages the tracer BEFORE resolveAttack stamps a new one,
  // so a tracer drawn at age 0 was made this step) and merely repeats itself
  // while the game is paused -- and while paused the clock below is zero anyway.
  var STATE = (typeof WeakMap === "function") ? new WeakMap() : null;
  var NOSTATE = { seen: null, kick: 0, kickAt: 0, seed: 1 };

  function fxState(b) {
    // The fallback record is SHARED, so the only field it can honestly carry is
    // one derived from the blub in front of it. `kick` is meaningless there and
    // `recoil` returns 0 for that reason; `seed` still has to vary or every
    // splat on the board would be the same shape.
    if (!STATE) { NOSTATE.seed = seedOf(b); return NOSTATE; }
    var s = STATE.get(b);
    if (!s) { s = { seen: null, kick: 0, kickAt: 0, seed: seedOf(b) }; STATE.set(b, s); }
    return s;
  }

  // --- the clock -----------------------------------------------------------
  //
  // SIMULATION time, not wall time.  `state.now` is the rAF stamp and `state.dt`
  // is real elapsed and unscaled (js/game.js: the camera wants that), so a
  // paused board would still have gobs flying and a 3x board would have them
  // flying at 1x.  Both globals are read defensively and read-only.
  var lastNow = -1;
  var detail = 1;

  function simDt(state) {
    var dt = (state && typeof state.dt === "number") ? state.dt : (1 / 60);
    if (!(dt > 0)) return 0;
    if (dt > 0.1) dt = 0.1;                       // a stalled tab must not teleport
    var speed = 1;
    if (typeof gameSpeed === "number" && isFinite(gameSpeed) && gameSpeed > 0) {
      speed = gameSpeed;
    }
    if ((typeof paused !== "undefined" && paused) ||
        (typeof gameOver !== "undefined" && gameOver) ||
        (typeof victory !== "undefined" && victory)) {
      speed = 0;
    }
    return dt * speed;
  }

  // How busy the board is, as one multiplier on every alpha in the file.  §17
  // asks that a pile-up must not saturate; this is the blunt half of the answer
  // (the other half is that nothing blends additively).  Three hundred blubs
  // firing look dimmer per shot than three do.
  var crowd = 1;

  function recomputeCrowd() {
    var live = 0, i;
    for (i = 0; i < SHOT_CAP; i++) if (shots[i].on) live++;
    var f = 1 - (live / SHOT_CAP) * 0.45;
    crowd = f < 0.55 ? 0.55 : f;
  }

  // --- the renderer's own helpers, handed over once per frame --------------
  //
  // gl-world.js keeps project/withGround/groundHeightAt private, so they arrive
  // through `api`.  Every one is optional: a partial wiring degrades instead of
  // throwing, which matters while that file is being edited by someone else.
  var A = null, X = null;                          // api and ctx, for the scratch callbacks

  function groundAt(x, y) {
    return (A && A.groundAt) ? A.groundAt(x, y) : 0;
  }

  // --- the ground frame ----------------------------------------------------
  //
  // THE ONE PERFORMANCE IDEA IN THIS FILE.  A circle on the ground is an ellipse
  // under this camera, and a skewed one once the board is orbited, so drawing
  // anything flat normally means projecting it point by point.  Instead: project
  // the centre and two unit axes -- three points -- and that IS the affine map
  // from ground space to screen space at that spot.  Push it as a canvas
  // transform and every splat, puddle, scorch and kick mark is drawn in unit
  // space with no further projection.  A nine-sided splat then costs the same
  // three projections a dot does.
  //
  // The frame is built with the ground PINNED to the impact point, not sampled
  // per axis: a decal is one small object lying on one surface, and sampling the
  // axes separately across a deck edge would shear it.  Same rule gl-world's
  // `withGround` note states for a tower's own hardware.
  var FR = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, scale: 1, ok: false };
  var _fx = 0, _fy = 0, _fr = 1;

  function _buildFrame() {
    FR.ok = false;
    var p = A.project(_fx, _fy, 0);
    if (!p) return;
    if (offScreen(p.x, p.y, 120)) return;
    var pe = A.project(_fx + _fr, _fy, 0);
    if (!pe) return;
    var pn = A.project(_fx, _fy + _fr, 0);
    if (!pn) return;
    FR.a = pe.x - p.x; FR.b = pe.y - p.y;
    FR.c = pn.x - p.x; FR.d = pn.y - p.y;
    FR.e = p.x; FR.f = p.y; FR.scale = p.scale;
    FR.ok = Math.abs(FR.a * FR.d - FR.b * FR.c) > 0.20;   // not edge-on
  }

  function groundFrame(x, y, r) {
    if (!A || !A.project) return false;
    _fx = x; _fy = y; _fr = r > 0.001 ? r : 0.001;
    withGround(groundAt(x, y), _buildFrame);
    return FR.ok;
  }

  function withGround(z, fn) {
    if (A && A.withGround) A.withGround(z, fn); else fn();
  }

  function offScreen(x, y, pad) {
    var w = (typeof VIEW_WIDTH === "number") ? VIEW_WIDTH : 1280;
    var h = (typeof VIEW_HEIGHT === "number") ? VIEW_HEIGHT : 720;
    return x < -pad || y < -pad || x > w + pad || y > h + pad;
  }

  // --- harvesting ----------------------------------------------------------

  function profileFor(b) {
    var p = PROFILES[b.unitId];
    if (p) return p;
    if (b.monsterTier >= 0) return PROFILES.monster;
    return PROFILES.blub1;
  }

  function spawnShot(b, prof, mx, my, mz, g0, tx, ty, g1, apex, delay, seed) {
    var i = take(shots, shotAt); shotAt = (i + 1) % SHOT_CAP;
    var r = shots[i];
    r.on = 1; r.t = -delay; r.life = prof.life; r.p = prof; r.seed = seed;
    r.x0 = mx; r.y0 = my; r.z0 = mz; r.g0 = g0;
    r.x1 = tx; r.y1 = ty; r.z1 = 8; r.g1 = g1;
    r.apex = apex;
    var dx = tx - mx, dy = ty - my;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    r.dist = d; r.ux = dx / d; r.uy = dy / d;
    r.splat = prof.splat || 0;
    r.wide = 0;
    return r;
  }

  function spawnDecal(x, y, radius, life, col, col2, a0, kind, flecks, seed, wide) {
    var i = take(decals, decalAt); decalAt = (i + 1) % DECAL_CAP;
    var d = decals[i];
    d.on = 1; d.t = 0; d.life = life; d.sub = life; d.x = x; d.y = y; d.r = radius;
    d.col = col; d.col2 = col2; d.a0 = a0; d.kind = kind; d.ang = 0;
    d.flecks = flecks; d.seed = seed; d.wide = wide || 0;
    return d;
  }

  // Distances are authored in u.l. everywhere in this game and become pixels
  // only through ul() (js/units.js). Guarded so this file cannot throw if it is
  // ever loaded before that one.
  function U(v) {
    return (typeof ul === "function") ? ul(v) : v * 1.04;
  }

  function spawnFlash(x, y, z, g, ux, uy, size, col, life, kick) {
    var i = take(flashes, flashAt); flashAt = (i + 1) % FLASH_CAP;
    var f = flashes[i];
    f.on = 1; f.t = 0; f.life = life; f.x = x; f.y = y; f.z = z; f.g = g;
    f.ux = ux; f.uy = uy; f.size = size; f.col = col; f.kick = kick || 0;
  }

  function spawnCasing(x, y, z, g, ux, uy, size) {
    var i = take(casings, casingAt); casingAt = (i + 1) % CASING_CAP;
    var c = casings[i];
    // Ejected SIDEWAYS out of the receiver, not backwards: that is what says
    // "there is a mechanism in there" rather than "something fell off".
    var side = (rnd() < 0.5) ? 1 : -1;
    var px = -uy * side, py = ux * side;
    c.on = 1; c.t = 0; c.life = 0.62 + rnd() * 0.2;
    c.x = x; c.y = y; c.z = z; c.g = g;
    c.vx = px * (26 + rnd() * 20) - ux * 8;
    c.vy = py * (26 + rnd() * 20) - uy * 8;
    c.vz = 52 + rnd() * 26;
    c.spin = (2 + rnd() * 5) * side;
    c.size = size;
  }

  // How far a ray from inside the board runs before it leaves it. The board IS
  // VIEW_WIDTH x VIEW_HEIGHT -- the same space every path, tower and enemy
  // position in this game is authored in.
  function rayExit(x, y, ux, uy) {
    var w = (typeof VIEW_WIDTH === "number") ? VIEW_WIDTH : 1280;
    var h = (typeof VIEW_HEIGHT === "number") ? VIEW_HEIGHT : 720;
    var t = 1e9;
    if (ux > 1e-6) t = Math.min(t, (w - x) / ux);
    else if (ux < -1e-6) t = Math.min(t, -x / ux);
    if (uy > 1e-6) t = Math.min(t, (h - y) / uy);
    else if (uy < -1e-6) t = Math.min(t, -y / uy);
    return (t > 0 && t < 1e9) ? t : 400;
  }

  // The lance.  Everything expensive about it is done ONCE, here: the enemies it
  // perforated are found with the same along/off test Blub.fireLaser uses, and
  // their distances along the ray are stored, so the per-frame cost afterwards
  // is a handful of ticks on a line.
  function spawnLance(b, tr, state) {
    var dx = tr.x - b.x, dy = tr.y - b.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / d, uy = dy / d;
    var spec = b.laser || { widthUl: 10 };
    var halfW = U(spec.widthUl || 10) / 2;
    var r = b.footprintPx || 12;

    var i = take(lances, lanceAt); lanceAt = (i + 1) % LANCE_CAP;
    var L = lances[i];
    L.on = 1; L.t = 0; L.life = 0.55;
    L.x = b.x + ux * r * 0.9; L.y = b.y + uy * r * 0.9;
    L.z = r * 1.05; L.g = groundAt(b.x, b.y);
    L.ux = ux; L.uy = uy;
    // The simulation's reach is 4000 px, which is off every board and behind the
    // camera from most angles.  Cut at the edge of the board instead, plus a
    // little, so the lance covers exactly the ground it can hit anything on and
    // then leaves -- rather than laying a scorch mark across the empty space
    // past the map, which is where a flat 1500 px put it.
    L.len = rayExit(L.x, L.y, ux, uy) + 40;
    if (L.len < 200) L.len = 200;
    if (L.len > 1800) L.len = 1800;
    L.halfW = halfW;

    // WHO IT WENT THROUGH.  Same geometry as fireLaser, read-only, once.
    //
    // The distances are stored FROM THE MUZZLE, not from the blub's centre: the
    // drawn beam starts at the muzzle, and on a SuperBlub that is fifty pixels
    // of difference -- enough to put every tick off the body it belongs to.
    var lead = r * 0.9;
    var n = 0;
    var enemies = (state && state.enemies) ? state.enemies : null;
    for (var k = 0; enemies && k < enemies.length && n < LANCE_HITS; k++) {
      var e = enemies[k];
      if (!e || e.dead || e.leaked || !e.pos) continue;
      var ex = e.pos.x - b.x, ey = e.pos.y - b.y;
      var along = ex * ux + ey * uy;
      if (along < 0 || along > L.len) continue;
      var off = Math.abs(ex * uy - ey * ux);
      var rad = e.radiusPx ? e.radiusPx() : 11;
      if (off > halfW + rad) continue;
      if (along - lead < 0) continue;              // inside the muzzle itself
      L.hits[n++] = along - lead;
    }
    L.nHits = n;
  }

  function spawnFor(b, tr, state) {
    var prof = profileFor(b);
    var st = fxState(b);
    var r = b.footprintPx || 12;

    if (tr.kind === "laser") { spawnLance(b, tr, state); return; }

    var dx = tr.x - b.x, dy = tr.y - b.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (!(d > 0.5)) return;
    var ux = dx / d, uy = dy / d;

    var mx = b.x + ux * prof.muzzle[0] * r;
    var my = b.y + uy * prof.muzzle[0] * r;
    var mz = prof.muzzle[1] * r;
    var g0 = groundAt(b.x, b.y);
    var g1 = groundAt(tr.x, tr.y);

    if (prof.mode === BALLISTIC) {
      // HITSCAN.  The line is whole on the first frame and the impact happens
      // now, not at the end of a flight -- which is the single clearest way the
      // machines read as a different weapon from the creatures.
      spawnShot(b, prof, mx, my, mz, g0, tr.x, tr.y, g1, 0, 0, st.seed);
      spawnFlash(mx, my, mz, g0, ux, uy, prof.flash, prof.flashC, prof.flashLife,
        prof.kick ? 1 : 0);
      if (prof.casing && detail > 0.4) spawnCasing(mx, my, mz, g0, ux, uy, prof.casingSize);

      // The impact: straight ticks for a tenth of a second, then a dark
      // pinpoint that stays a little longer.  One record, two phases -- nothing
      // wet, nothing round, nothing that spreads.
      var mark = spawnDecal(tr.x, tr.y, prof.spark, 0.42, C.sparkC, C.scorch,
        0.55, 1, 0, (st.seed + b.attacksMade) >>> 0, prof.scorch);
      mark.sub = prof.sparkLife;

      // The chassis shoves itself backwards, and leaves that on the ground.
      st.kick = prof.recoil;
      if (prof.kick && detail >= 0.5) {
        var kick = spawnDecal(b.x - ux * r * 0.85, b.y - uy * r * 0.85, r * 0.85,
          0.34, C.scorch, C.scorch, 0.26, 2, 0, st.seed, 0);
        kick.ang = Math.atan2(uy, ux);
      }
      return;
    }

    // ORGANIC.  A body is thrown, and the arc is the property that says so.
    var apex = prof.arcK * d;
    if (apex < prof.arcMin) apex = prof.arcMin;
    if (apex > prof.arcMax) apex = prof.arcMax;

    var count = prof.pellets;
    if (detail < 1) { count = Math.round(count * detail); if (count < 1) count = 1; }

    if (count === 1) {
      var one = spawnShot(b, prof, mx, my, mz, g0, tr.x, tr.y, g1, apex, 0,
        (st.seed + b.attacksMade) >>> 0);
      // The Hungry Blub's puddle is drawn at the unit's REAL splash radius, read
      // off the live blub rather than typed here, so the wet patch and the
      // damage it stands for cannot drift apart.
      if (prof.puddle) one.wide = U(b.splashUl || 8);
      return;
    }

    // A BURST.  Stagger in time, scatter across the target: the cadence is the
    // read, not any one pellet.
    var px = -uy, py = ux;
    for (var i = 0; i < count; i++) {
      var j = (rnd() - 0.5) * 2 * prof.spread * d;
      var back = (rnd() - 0.5) * prof.spread * d * 0.8;
      spawnShot(b, prof, mx, my, mz, g0,
        tr.x + px * j + ux * back, tr.y + py * j + uy * back, g1,
        apex * (0.85 + rnd() * 0.3), i * prof.stagger,
        (st.seed + b.attacksMade * 7 + i) >>> 0);
    }
  }

  // --- ageing --------------------------------------------------------------

  function land(r) {
    var p = r.p;
    if (p.mode === BALLISTIC) return;              // its mark was made at fire time
    if (!p.splat || detail < 0.35) return;
    var radius = r.wide > 0 ? r.wide : p.splat;
    spawnDecal(r.x1, r.y1, radius, p.splatLife, p.wet, p.rim, p.splatA, 0,
      p.flecks || 0, r.seed, r.wide);
  }

  function age(dt) {
    var i;
    for (i = 0; i < SHOT_CAP; i++) {
      var r = shots[i];
      if (!r.on) continue;
      r.t += dt;
      if (r.t >= r.life) { land(r); r.on = 0; }
    }
    for (i = 0; i < DECAL_CAP; i++) {
      var d = decals[i];
      if (!d.on) continue;
      d.t += dt;
      if (d.t >= d.life) d.on = 0;
    }
    for (i = 0; i < CASING_CAP; i++) {
      var c = casings[i];
      if (!c.on) continue;
      c.t += dt;
      if (c.t >= c.life) { c.on = 0; continue; }
      // One integration step, not a stored path: a casing is two seconds of
      // arithmetic in its whole life.
      c.z += c.vz * dt;
      c.vz -= 320 * dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.z < 0) {
        c.z = 0;
        if (c.vz < 0) { c.vz *= -0.32; c.vx *= 0.45; c.vy *= 0.45; c.spin *= 0.4; }
        if (c.vz < 6) { c.vz = 0; c.vx = 0; c.vy = 0; c.spin = 0; }
      }
    }
    for (i = 0; i < FLASH_CAP; i++) {
      var f = flashes[i];
      if (!f.on) continue;
      f.t += dt;
      if (f.t >= f.life) f.on = 0;
    }
    for (i = 0; i < LANCE_CAP; i++) {
      var L = lances[i];
      if (!L.on) continue;
      L.t += dt;
      if (L.t >= L.life) L.on = 0;
    }
  }

  function harvest(state, dt) {
    var towers = (state && state.towers) ? state.towers : null;
    superbN = 0;
    if (!towers) return;
    var budget = MAX_NEW_PER_FRAME;

    for (var i = 0; i < towers.length; i++) {
      var b = towers[i];
      if (!b || !b.isSummon) continue;             // only the summoned units

      var st = fxState(b);
      if (st.kick > 0) {
        st.kick -= dt * 7.5;                       // ~0.13 s of visible recoil
        if (st.kick < 0) st.kick = 0;
      }
      if (b.unitId === "superb" && superbN < SUPERB_CAP) superbs[superbN++] = b;

      var tr = b.tracer;
      if (!tr) continue;
      var fresh = STATE ? (tr !== st.seen) : (tr.age === 0);
      if (!fresh) continue;
      st.seen = tr;
      if (budget <= 0) continue;
      budget--;
      spawnFor(b, tr, state);
    }
    // Nothing past the count may keep a dead blub alive by reference.
    for (var k = superbN; k < SUPERB_CAP; k++) superbs[k] = null;
  }

  // Idempotent per frame: both public draw calls run it, so the module still
  // behaves if only one of the two call sites is wired.
  function tick(state) {
    if (!state) return;
    if (state.now === lastNow) return;
    lastNow = state.now;
    var dt = simDt(state);
    age(dt);
    harvest(state, dt);
    recomputeCrowd();
  }

  // --- drawing: the ground pass -------------------------------------------

  function drawSplat(d) {
    var t = d.t / d.life;
    var grow = t < 0.16 ? (t / 0.16) : 1;          // it lands, then it is there
    grow = 0.45 + 0.55 * grow;
    var fade = 1 - t;
    var a = d.a0 * fade * fade * crowd;
    if (a < 0.012) return;
    if (!groundFrame(d.x, d.y, d.r)) return;

    var ctx = X;
    ctx.save();
    ctx.transform(FR.a, FR.b, FR.c, FR.d, FR.e, FR.f);
    var pts = SPLAT_SHAPES[d.seed & 3];
    var k;

    // THE PUDDLE'S SEEP.  The Hungry Blub is the only organic unit with a real
    // splash, and its frame radius is that splash exactly -- so the bright mark
    // is honest about reach while a thin wet halo past it, at well under half
    // the alpha, is what makes it read as the WIDE impact §10 asks for. Nothing
    // else in the file gets one, which is what keeps the ladder legible.
    if (d.wide > 0) {
      ctx.globalAlpha = a * 0.38;
      ctx.fillStyle = d.col;
      ctx.beginPath();
      ctx.moveTo(pts[0] * grow * 1.6, pts[1] * grow * 1.6);
      for (k = 2; k < pts.length; k += 2) {
        ctx.lineTo(pts[k] * grow * 1.6, pts[k + 1] * grow * 1.6);
      }
      ctx.closePath();
      ctx.fill();
    }

    // The mark itself, FILLED AND THEN STROKED OFF THE SAME PATH -- the rim is
    // what stops a translucent green blob reading as a range circle, and
    // rebuilding a nine-sided path to draw it would double this decal's cost
    // for nothing.
    ctx.beginPath();
    ctx.moveTo(pts[0] * grow, pts[1] * grow);
    for (k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k] * grow, pts[k + 1] * grow);
    ctx.closePath();
    ctx.globalAlpha = a;
    ctx.fillStyle = d.col;
    ctx.fill();
    if (t < 0.7) {
      ctx.globalAlpha = a * (1 - t / 0.7) * 0.7;
      ctx.strokeStyle = d.col2;
      ctx.lineWidth = 0.09;
      ctx.stroke();
    }

    // A wet centre while it is fresh, so a splat has a middle rather than being
    // one flat colour -- and it dries from the inside, which is what the second
    // fill is for.
    if (t < 0.55) {
      ctx.globalAlpha = a * (1 - t / 0.55) * 0.85;
      ctx.fillStyle = d.col;
      ctx.beginPath();
      ctx.arc(0, 0, 0.46 * grow, 0, TAU);
      ctx.fill();
    }

    // Flecks thrown clear of the main mark.  They travel out for the first
    // fifth of the life and then stop, which is the whole gesture.
    var n = d.flecks;
    if (n > 0 && detail >= 0.6) {
      var out = 0.5 + 0.5 * (t < 0.2 ? t / 0.2 : 1);
      ctx.globalAlpha = a * 0.9;
      for (var i = 0; i < n; i++) {
        var o = ((d.seed + i) & 7) * 3;
        ctx.beginPath();
        ctx.arc(FLECKS[o] * out, FLECKS[o + 1] * out, FLECKS[o + 2], 0, TAU);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // The machines' mark: a dark pinpoint where the round went in.  Deliberately
  // NOT a splat -- it is small, hard-edged, and it does not spread.  Its radius
  // is FIXED for its whole life, which is the other half of the contrast: an
  // organic splat grows as it lands and a bullet hole does not.
  function drawScorch(d) {
    var t = d.t / d.life;
    var a = 0.32 * (1 - t * t) * crowd;
    if (a < 0.012 || !d.wide) return;
    if (!groundFrame(d.x, d.y, d.wide)) return;
    var ctx = X;
    ctx.save();
    ctx.transform(FR.a, FR.b, FR.c, FR.d, FR.e, FR.f);
    ctx.globalAlpha = a;
    ctx.fillStyle = d.col2;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // The Mechablub MK2 and the SuperBlub shove the ground when they fire: one
  // smeared mark behind the feet, along the recoil, fading in a third of a
  // second.  It is the only evidence of recoil that survives without the
  // renderer agreeing to move the mesh (see `recoil` below for that half).
  function drawKick(d) {
    var t = d.t / d.life;
    var a = d.a0 * (1 - t) * crowd;
    if (a < 0.015) return;
    if (!groundFrame(d.x, d.y, d.r)) return;
    var ctx = X;
    ctx.save();
    ctx.transform(FR.a, FR.b, FR.c, FR.d, FR.e, FR.f);
    ctx.globalAlpha = a;
    ctx.fillStyle = d.col;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.90 + 0.40 * t, 0.34 + 0.16 * t, d.ang, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // The lance's ground scorch: a flat stripe the whole length of the shot, lying
  // on the board.  THIS is what makes the perforation legible from any camera
  // angle -- the beam itself is gone in half a second, and the line it cut stays
  // long enough to read as a line through things.
  function drawLanceGround(L) {
    var t = L.t / L.life;
    var a = 0.30 * (1 - t * 0.8) * crowd;
    if (a < 0.02) return;
    var ctx = X;
    var w = L.halfW * 0.85;
    var px = -L.uy * w, py = L.ux * w;
    var steps = 6, i, p;
    var ok = true;

    ctx.beginPath();
    for (i = 0; i <= steps; i++) {
      var s = (i / steps) * L.len;
      p = A.project(L.x + L.ux * s + px, L.y + L.uy * s + py, 0.5);
      if (!p) { ok = false; break; }
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    if (ok) {
      for (i = steps; i >= 0; i--) {
        var s2 = (i / steps) * L.len;
        p = A.project(L.x + L.ux * s2 - px, L.y + L.uy * s2 - py, 0.5);
        if (!p) { ok = false; break; }
        ctx.lineTo(p.x, p.y);
      }
    }
    if (!ok) return;
    ctx.closePath();
    ctx.globalAlpha = a;
    ctx.fillStyle = C.lanceGround;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // --- drawing: the air pass ----------------------------------------------

  // Scratch for the projection callbacks, so nothing allocates a closure inside
  // a loop that runs three hundred times.
  var _r = null, _wx = 0, _wy = 0, _wz = 0, _hit = null;

  function _projBody() { _hit = A.project(_wx, _wy, _wz); }

  function projectPinned(x, y, z, g) {
    _wx = x; _wy = y; _wz = z; _hit = null;
    withGround(g, _projBody);
    return _hit;
  }

  // ORGANIC: a body in flight.  It is drawn as a solid with a rim, squashed
  // along its own heading, with a small droplet trailing it -- volume, not light.
  function drawOrganicShot(r) {
    if (r.t < 0) return;
    var p = r.p;
    var t = r.t / r.life;
    var wx = r.x0 + (r.x1 - r.x0) * t;
    var wy = r.y0 + (r.y1 - r.y0) * t;
    var gz = r.g0 + (r.g1 - r.g0) * t;
    var z = r.z0 + (r.z1 - r.z0) * t + r.apex * 4 * t * (1 - t);

    var head = projectPinned(wx, wy, z, gz);
    if (!head || offScreen(head.x, head.y, 60)) return;

    var ctx = X;
    var px = head.scale;
    var rad = p.body * px;
    if (rad < 0.5) return;
    var a = crowd * (t > 0.86 ? (1 - t) / 0.14 : 1);

    // The trail, first, so the body sits on it.  The Cyberblub's is the long
    // one and the only one that is a different colour from its own skin -- the
    // energised spit §10 asks for.
    //
    // ITS TAIL POINT ALSO GIVES THE BODY ITS ANGLE, which is why it is computed
    // even when the trail is not drawn: the squash has to follow the heading ON
    // SCREEN, and under an orbited camera that is not the world heading. Taking
    // it from a point the shot has actually been costs nothing extra here and
    // one whole projection per shot per frame if it is asked for separately.
    //
    // A PELLET DOES NOT PAY FOR ANY OF IT.  Below ~2 screen pixels the squash,
    // the highlight and the rim are all sub-pixel, so a hail of Mini Blub shot
    // costs one projection and one fill each -- which is what keeps three
    // hundred of them off the frame budget.
    var ang = 0, sq = 1;
    var bt = (rad > 2.0) ? t - (p.tail > 0 ? p.tail : 0.06) : -1;
    if (bt > 0) {
      var bx = r.x0 + (r.x1 - r.x0) * bt;
      var by = r.y0 + (r.y1 - r.y0) * bt;
      var bz = r.z0 + (r.z1 - r.z0) * bt + r.apex * 4 * bt * (1 - bt);
      var tail = projectPinned(bx, by, bz, r.g0 + (r.g1 - r.g0) * bt);
      if (tail) {
        var vx = head.x - tail.x, vy = head.y - tail.y;
        if (vx * vx + vy * vy > 2.5) { ang = Math.atan2(vy, vx); sq = 0.74; }
        if (p.tail > 0 && detail >= 0.5) {
          ctx.lineCap = "round";
          ctx.globalAlpha = a * (p.trail ? 0.55 : 0.32);
          ctx.strokeStyle = p.trail ? C.cTrail : p.skin;
          ctx.lineWidth = rad * (p.trail ? 1.05 : 0.8);
          ctx.beginPath();
          ctx.moveTo(tail.x, tail.y);
          ctx.lineTo(head.x, head.y);
          ctx.stroke();
          ctx.lineCap = "butt";
        }
      }
    }

    // The body, and its rim off the SAME path.  Organic shots are the only
    // things in this file with an outline; it is the cheapest way to keep a
    // bright board from swallowing them, and it is why they never need to be
    // brighter to be seen -- which is exactly the §17 trade.
    ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.ellipse(head.x, head.y, rad, rad * sq, ang, 0, TAU);
    ctx.fill();
    if (rad > 1.6) {
      ctx.globalAlpha = a * 0.55;
      ctx.strokeStyle = p.rim;
      ctx.lineWidth = Math.max(0.8, rad * 0.16);
      ctx.stroke();
    }

    // A lit crown offset towards the top of the screen: one highlight, no
    // gradient, and it is what stops the body reading as a flat disc.
    if (rad > 2.2) {
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = p.core;
      ctx.beginPath();
      ctx.arc(head.x - rad * 0.22, head.y - rad * 0.30, rad * 0.42, 0, TAU);
      ctx.fill();
    }
  }

  // BALLISTIC: a line that is already there.  It does not travel -- it RETRACTS,
  // the tail running up to the head over eighty milliseconds, which reads as a
  // round whipping away and cannot be mistaken for something being thrown.
  function drawBallisticShot(r) {
    var p = r.p;
    var t = r.t / r.life;
    if (t < 0) return;
    var u = t * t;                                  // the tail accelerates away
    var sx = r.x0 + (r.x1 - r.x0) * u;
    var sy = r.y0 + (r.y1 - r.y0) * u;
    var sz = r.z0 + (r.z1 - r.z0) * u;

    // Two endpoints, each grounded on its OWN patch: a straight line between two
    // correctly placed ends has no in-between samples to bend it, which is why
    // this one does not need the pinning the arcs above do.
    var a0 = projectPinned(sx, sy, sz, r.g0 + (r.g1 - r.g0) * u);
    var b0 = projectPinned(r.x1, r.y1, r.z1, r.g1);
    if (!a0 || !b0) return;
    if (offScreen(b0.x, b0.y, 80) && offScreen(a0.x, a0.y, 80)) return;

    var ctx = X;
    var px = b0.scale;
    var fade = (1 - t) * crowd;

    ctx.lineCap = "butt";                           // SQUARE ends. Nothing soft.
    ctx.globalAlpha = fade * 0.30;
    ctx.strokeStyle = p.warm;
    ctx.lineWidth = Math.max(0.8, p.width * px * 2.1);
    ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(b0.x, b0.y); ctx.stroke();

    ctx.globalAlpha = fade * 0.95;
    ctx.strokeStyle = p.core;
    ctx.lineWidth = Math.max(0.7, p.width * px * 0.75);
    ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(b0.x, b0.y); ctx.stroke();

    // The head: a quad along the heading, not a dot.  A shell has a nose.
    if (t < 0.45) {
      var dx = b0.x - a0.x, dy = b0.y - a0.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0.5) {
        dx /= len; dy /= len;
        var w = p.headW * px * 0.5, h = p.headW * px * 1.1;
        ctx.globalAlpha = (1 - t / 0.45) * crowd;
        ctx.fillStyle = p.core;
        ctx.beginPath();
        ctx.moveTo(b0.x + dx * h * 0.4, b0.y + dy * h * 0.4);
        ctx.lineTo(b0.x - dy * w, b0.y + dx * w);
        ctx.lineTo(b0.x - dx * h * 0.7, b0.y - dy * h * 0.7);
        ctx.lineTo(b0.x + dy * w, b0.y - dx * w);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // The muzzle flash: a four-point star built from straight edges, oriented
  // along the shot, alive for three frames.  A polygon on purpose -- a soft disc
  // is what the organic side does.
  function drawFlash(f) {
    var t = f.t / f.life;
    var head = projectPinned(f.x, f.y, f.z, f.g);
    if (!head || offScreen(head.x, head.y, 60)) return;
    var ctx = X;
    var px = head.scale;
    var s = f.size * px * (0.55 + 0.45 * (1 - t));
    if (s < 0.6) return;

    // Direction on screen, from the muzzle to a point a little further along.
    var fwd = projectPinned(f.x + f.ux * 12, f.y + f.uy * 12, f.z, f.g);
    var dx = 1, dy = 0;
    if (fwd) {
      dx = fwd.x - head.x; dy = fwd.y - head.y;
      var l = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= l; dy /= l;
    }
    var nx = -dy, ny = dx;
    var a = (1 - t) * crowd;

    ctx.globalAlpha = a * 0.85;
    ctx.fillStyle = f.col;
    ctx.beginPath();
    ctx.moveTo(head.x + dx * s * 1.7, head.y + dy * s * 1.7);
    ctx.lineTo(head.x + nx * s * 0.62, head.y + ny * s * 0.62);
    ctx.lineTo(head.x - dx * s * 0.55, head.y - dy * s * 0.55);
    ctx.lineTo(head.x - nx * s * 0.62, head.y - ny * s * 0.62);
    ctx.closePath();
    ctx.fill();

    // A cross-flash out of the brake, the tell of a big charge.
    if (f.kick) {
      ctx.globalAlpha = a * 0.6;
      ctx.beginPath();
      ctx.moveTo(head.x + nx * s * 1.25, head.y + ny * s * 1.25);
      ctx.lineTo(head.x + dx * s * 0.34, head.y + dy * s * 0.34);
      ctx.lineTo(head.x - nx * s * 1.25, head.y - ny * s * 1.25);
      ctx.lineTo(head.x - dx * s * 0.34, head.y - dy * s * 0.34);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalAlpha = a;
    ctx.fillStyle = C.hot;
    ctx.beginPath();
    ctx.arc(head.x, head.y, s * 0.30, 0, TAU);
    ctx.fill();
  }

  // The machines' impact: four straight radial ticks.  No ring, no wake, no
  // circle -- the shockwave shape belongs to gl-world's own blasts and using it
  // here would put a bullet strike in the same visual family as an explosion.
  function drawSpark(d) {
    var t = d.t / d.sub;                            // the hot phase only
    var p = A.project(d.x, d.y, 9);
    if (!p || offScreen(p.x, p.y, 60)) return;
    var ctx = X;
    var s = d.r * p.scale * (0.35 + 0.9 * t);
    var a = (1 - t) * crowd * 0.9;
    if (a < 0.02) return;
    ctx.globalAlpha = a;
    ctx.strokeStyle = C.sparkC;
    ctx.lineWidth = Math.max(0.7, 1.5 * p.scale * (1 - t));
    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x - s * 0.34, p.y);
    ctx.moveTo(p.x + s * 0.34, p.y); ctx.lineTo(p.x + s, p.y);
    ctx.moveTo(p.x, p.y - s * 0.72); ctx.lineTo(p.x, p.y - s * 0.24);
    ctx.moveTo(p.x, p.y + s * 0.24); ctx.lineTo(p.x, p.y + s * 0.72);
    ctx.stroke();
    if (t < 0.4) {
      ctx.globalAlpha = (1 - t / 0.4) * crowd;
      ctx.fillStyle = C.hot;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.7, 1.6 * p.scale), 0, TAU);
      ctx.fill();
    }
  }

  function drawCasing(c) {
    var t = c.t / c.life;
    var p = projectPinned(c.x, c.y, c.z, c.g);
    if (!p || offScreen(p.x, p.y, 40)) return;
    var ctx = X;
    var s = c.size * p.scale;
    if (s < 0.4) return;
    var ang = c.spin * c.t * 6;
    var dx = Math.cos(ang) * s, dy = Math.sin(ang) * s;
    var nx = -Math.sin(ang) * s * 0.38, ny = Math.cos(ang) * s * 0.38;
    ctx.globalAlpha = (t > 0.7 ? (1 - t) / 0.3 : 1) * crowd;
    ctx.fillStyle = (c.vz === 0 && c.z === 0) ? C.brassD : C.brass;
    ctx.beginPath();
    ctx.moveTo(p.x + dx + nx, p.y + dy + ny);
    ctx.lineTo(p.x + dx - nx, p.y + dy - ny);
    ctx.lineTo(p.x - dx - nx, p.y - dy - ny);
    ctx.lineTo(p.x - dx + nx, p.y - dy + ny);
    ctx.closePath();
    ctx.fill();
  }

  // --- the lance -----------------------------------------------------------
  //
  // Every property of it is chosen against ONE requirement: it must be
  // impossible to mistake for the SuperBlub's ordinary shell.  The shell is
  // white, 4 px wide, aimed at one body, and gone in 0.12 s.  This is cyan, as
  // wide as its real widthUl, crosses the whole board, marks every enemy it went
  // through, lasts four and a half times as long, and leaves a scorch on the
  // ground after it.
  //
  // The wide envelope lives for 60 ms only.  §17 forbids hiding enemies, and a
  // ten-pixel bar of light lying across a lane for half a second would do
  // exactly that -- so what persists is a thin core and the flat ground mark.
  function drawLance(L) {
    var t = L.t / L.life;
    var head = projectPinned(L.x, L.y, L.z, L.g);
    if (!head) return;

    // Pinned to the FIRING ground for its whole length: a lance is a rigid line
    // down a fixed heading, and letting it sample the terrain under it is the
    // ski-jump gl-world's shotGround note warns about.
    var far = null, len = L.len;
    for (var tryN = 0; tryN < 4 && !far; tryN++) {
      far = projectPinned(L.x + L.ux * len, L.y + L.uy * len, L.z, L.g);
      if (!far) len *= 0.5;
    }
    if (!far) return;

    var ctx = X;
    var px = head.scale;
    var w = L.halfW * 2 * px;
    var burst = t < 0.11 ? (1 - t / 0.11) : 0;      // the first 60 ms
    var life = 1 - t;

    ctx.lineCap = "butt";

    // The envelope: full width, and only while the burst lasts.
    if (burst > 0) {
      ctx.globalAlpha = 0.26 * burst * crowd;
      ctx.strokeStyle = C.lance;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(head.x, head.y); ctx.lineTo(far.x, far.y); ctx.stroke();
    }

    // The body, narrowing as it settles into a residual line.
    ctx.globalAlpha = (0.20 + 0.45 * burst) * life * crowd;
    ctx.strokeStyle = C.lance;
    ctx.lineWidth = Math.max(1, w * (0.16 + 0.34 * burst));
    ctx.beginPath(); ctx.moveTo(head.x, head.y); ctx.lineTo(far.x, far.y); ctx.stroke();

    // The core.  Thin, hot, and the thing that is still there at half a second.
    ctx.globalAlpha = (0.55 + 0.45 * burst) * life * life * crowd;
    ctx.strokeStyle = C.lanceHot;
    ctx.lineWidth = Math.max(0.8, w * 0.10 + 1.1 * px);
    ctx.beginPath(); ctx.moveTo(head.x, head.y); ctx.lineTo(far.x, far.y); ctx.stroke();

    // WHERE IT WENT THROUGH SOMETHING.  A transverse tick at every enemy the
    // shot crossed, found once at fire time with the simulation's own geometry.
    // This is the perforation, stated: without it a beam over a queue of enemies
    // is just a beam near them.
    if (L.nHits) {
      var dx = far.x - head.x, dy = far.y - head.y;
      var dl = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / dl, ny = dx / dl;
      var tickA = life * life * crowd;
      ctx.strokeStyle = C.lanceHot;
      ctx.lineWidth = Math.max(1, 1.8 * px);
      ctx.globalAlpha = tickA * (0.55 + 0.45 * burst);
      for (var i = 0; i < L.nHits; i++) {
        var along = L.hits[i];
        if (along > len) continue;
        // PROJECTED, not interpolated between the two screen ends. Perspective
        // is not linear along a 1500 px ray -- lerping the screen points put a
        // tick tens of pixels off the body it is supposed to be marking, which
        // is the one thing this mark exists to get right.
        var at = projectPinned(L.x + L.ux * along, L.y + L.uy * along, L.z, L.g);
        if (!at) continue;
        var s = w * (0.85 + 0.5 * burst);
        ctx.beginPath();
        ctx.moveTo(at.x - nx * s, at.y - ny * s);
        ctx.lineTo(at.x + nx * s, at.y + ny * s);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // The tell before it.  `attacksMade % every === every - 1` means the NEXT
  // attack is the free lance, so there is up to a full attack interval of warning
  // -- and a piercing shot the player can see coming is worth more than one they
  // only see afterwards.  Read-only, and only ever on a SuperBlub.
  function drawLanceCharge(b) {
    if (!b.laser) return;
    var every = b.laser.every || 10;
    if ((b.attacksMade % every) !== every - 1) return;
    var r = b.footprintPx || 12;
    if (!groundFrame(b.x, b.y, r * 1.25)) return;

    var beat = 0.5 + 0.5 * Math.sin(lastNow * 6.5);
    var ctx = X;
    ctx.save();
    ctx.transform(FR.a, FR.b, FR.c, FR.d, FR.e, FR.f);
    ctx.globalAlpha = (0.22 + 0.26 * beat) * crowd;
    ctx.strokeStyle = C.lance;
    ctx.lineWidth = (1.6 + 1.2 * beat) / (r * 1.25);   // unit space -> ~2 px
    ctx.beginPath();
    ctx.arc(0, 0, 0.72 + 0.20 * (1 - beat), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // --- public --------------------------------------------------------------

  function bind(ctx, api) {
    X = ctx; A = api;
    return !!(api && typeof api.project === "function");
  }

  function unbind(ctx) {
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
    X = null; A = null;
  }

  return {
    // Everything that LIES ON THE BOARD: splatters, the Hungry Blub's puddle,
    // bullet scorch, recoil kick marks and the lance's ground stripe.
    //
    // Call it EARLY in drawOverlays -- see the note at the bottom of this file --
    // so decals sit under the health bars and the readouts rather than over them,
    // and at top level, NOT inside a withGround: a decal is placed on its own
    // ground and pins its own reference.
    drawGround: function (ctx, state, api) {
      // BOUND BEFORE TICKED, and that order is load-bearing: harvesting a new
      // shot asks the renderer for the ground height under the blub and under
      // its target, and an unbound module would answer 0 for both -- putting
      // every shot fired from a raised deck at the height of the floor.
      if (!bind(ctx, api)) return;
      tick(state);
      var i;
      for (i = 0; i < DECAL_CAP; i++) {
        var d = decals[i];
        if (!d.on) continue;
        if (d.kind === 0) drawSplat(d);
        else if (d.kind === 1) drawScorch(d);
        else drawKick(d);
      }
      for (i = 0; i < LANCE_CAP; i++) {
        if (lances[i].on) drawLanceGround(lances[i]);
      }
      unbind(ctx);
    },

    // Everything ABOVE the board: gobs in flight, pellet hails, tracers, muzzle
    // flashes, sparks, casings, the lance and the SuperBlub's charge tell.
    //
    // Call it immediately after drawShots(ctx, state), for the same reason
    // drawShots is where it is: shots go over the hardware that fired them and
    // under the cosmetic burst layer.
    drawAir: function (ctx, state, api) {
      if (!bind(ctx, api)) return;
      tick(state);                                 // a no-op if drawGround ran
      var i;
      for (i = 0; i < SHOT_CAP; i++) {
        var r = shots[i];
        if (!r.on) continue;
        if (r.p.mode === BALLISTIC) drawBallisticShot(r); else drawOrganicShot(r);
      }
      for (i = 0; i < FLASH_CAP; i++) if (flashes[i].on) drawFlash(flashes[i]);
      for (i = 0; i < DECAL_CAP; i++) {
        var d = decals[i];
        if (d.on && d.kind === 1 && d.t < d.sub) drawSpark(d);
      }
      for (i = 0; i < CASING_CAP; i++) if (casings[i].on) drawCasing(casings[i]);
      for (i = 0; i < LANCE_CAP; i++) if (lances[i].on) drawLance(lances[i]);
      for (i = 0; i < superbN; i++) {
        var b = superbs[i];
        if (b && !(b.isDestroyed && b.isDestroyed())) drawLanceCharge(b);
      }
      unbind(ctx);
    },

    // OPTIONAL, and the only thing here that asks the renderer for anything.
    // Returns 0..1, the chassis kick left on this blub -- non-zero only for the
    // Mechablub, the MK2 and the SuperBlub, and decaying over about 0.13 s.
    //
    // Suggested use where gl-world draws the blub's mesh:
    //   var k = BlubFXShots.recoil(t);
    //   if (k) { x -= Math.cos(t.aim) * k * 3.5; y -= Math.sin(t.aim) * k * 3.5; }
    // The MK2's profile carries the largest value, which is what "visible chassis
    // recoil" means in §10: the body moves and the others do not.
    recoil: function (blub) {
      if (!blub || !STATE) return 0;
      var s = STATE.get(blub);
      return s ? s.kick : 0;
    },

    // Drop everything.  Call from restartGame / on a map change, so a new run
    // does not open with the previous one's brass on the floor.
    reset: function () {
      var i;
      for (i = 0; i < SHOT_CAP; i++) shots[i].on = 0;
      for (i = 0; i < DECAL_CAP; i++) decals[i].on = 0;
      for (i = 0; i < CASING_CAP; i++) casings[i].on = 0;
      for (i = 0; i < FLASH_CAP; i++) flashes[i].on = 0;
      for (i = 0; i < LANCE_CAP; i++) lances[i].on = 0;
      superbN = 0; lastNow = -1; crowd = 1;
      if (STATE && typeof WeakMap === "function") STATE = new WeakMap();
    },

    // The quality lever, 0..1, if the perf pass ever needs one. Below 1 it
    // thins the pellet hails; below 0.6 it drops flecks; below 0.4 it drops
    // casings; below 0.35 it drops splatters entirely. Geometry, never alpha --
    // a dimmer effect is harder to read, a simpler one is not.
    setDetail: function (f) {
      detail = (typeof f === "number" && f >= 0 && f <= 1) ? f : 1;
    },

    // Read-only counters, for TDObs / the perf harness.
    stats: function () {
      var s = 0, d = 0, c = 0, f = 0, l = 0, i;
      for (i = 0; i < SHOT_CAP; i++) if (shots[i].on) s++;
      for (i = 0; i < DECAL_CAP; i++) if (decals[i].on) d++;
      for (i = 0; i < CASING_CAP; i++) if (casings[i].on) c++;
      for (i = 0; i < FLASH_CAP; i++) if (flashes[i].on) f++;
      for (i = 0; i < LANCE_CAP; i++) if (lances[i].on) l++;
      return { shots: s, decals: d, casings: c, flashes: f, lances: l,
        crowd: crowd, detail: detail };
    },

    // Exposed so a later pass can retune without editing the drawing, and so a
    // muzzle can be corrected once the blub meshes publish real anchors.
    PROFILES: PROFILES,
    PALETTE: C
  };
})();

// ---------------------------------------------------------------------------
// WIRING -- exactly what js/gl/gl-world.js has to do, and nothing else.
//
// 1. index.html, one line, AFTER js/gl/gl-world.js and after js/blub.js:
//
//      <script src="js/gl/blub-projectiles.js"></script>
//
//    (It reads `ul`, `VIEW_WIDTH`, `gameSpeed`, `paused`, `gameOver` and
//    `victory` at call time, not at load time, so the order only matters
//    relative to nothing at all -- but keeping it beside the other gl files is
//    where a reader will look for it.)
//
// 2. In gl-world.js, ONE constant beside the other module-level tables. Built
//    once, never per frame, because it is the only allocation the bridge has:
//
//      var BLUB_FX_API = {
//        project: project,
//        withGround: withGround,
//        groundAt: groundHeightAt
//      };
//
// 3. TWO call sites, both inside drawOverlays(ctx, state):
//
//    (a) The ground pass. Put it immediately after the range/footprint ring loop
//        and BEFORE the health-bar loop (`for (...) bar(ctx, state.towers[i]...)`),
//        so splatters and scorch lie under the bars and the summoner's counter
//        rather than over them:
//
//          if (typeof BlubFXShots !== "undefined") {
//            BlubFXShots.drawGround(ctx, state, BLUB_FX_API);
//          }
//
//    (b) The air pass. Put it on the line immediately after `drawShots(ctx, state);`
//        and before `drawEffects(ctx);` -- the file's own stated order is
//        "hardware lighting up, then the shots, then the cosmetic burst", and a
//        blub's shot is a shot:
//
//          if (typeof BlubFXShots !== "undefined") {
//            BlubFXShots.drawAir(ctx, state, BLUB_FX_API);
//          }
//
//    Both must be at the TOP LEVEL of drawOverlays, not inside a withGround():
//    this module pins its own ground references and an outer one would override
//    every decal onto the wrong surface.
//
// 4. OPTIONAL, for the MK2's chassis recoil. Where the blub's mesh is drawn
//    (the `tower.isSummon` branch that resolves blubModel), nudge the body back
//    along its own aim:
//
//      var kick = (typeof BlubFXShots !== "undefined") ? BlubFXShots.recoil(t) : 0;
//      var rx = t.x - Math.cos(t.aim || 0) * kick * 3.5;
//      var ry = t.y - Math.sin(t.aim || 0) * kick * 3.5;
//      renderer.draw(mesh, rx, ry, groundHeightAt(t.x, t.y) + kick * 1.5, ...);
//
//    Without it the shot still reads; with it the MK2 visibly shoves itself
//    backwards, which is the half of §10 that cannot be drawn as light.
//
// 5. OPTIONAL, for hygiene: `BlubFXShots.reset()` from restartGame() in
//    js/game.js, so a new run does not start with the last one's brass on the
//    floor. The pools recycle on their own, so skipping this costs at most a
//    second of stale litter.
// ---------------------------------------------------------------------------
