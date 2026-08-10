// ---------------------------------------------------------------------------
// BlubFXSystems -- the Summoner's three SYSTEM-level pictures (brief 13 & 14).
//
//   1. SWARM THREADS   one thread of light per blub whose +5% is actually being
//                      bought, so COUNTING THE THREADS IS READING THE BONUS.
//   2. THE WEAKEN SIGIL a rune at a struck enemy's feet that fills 0% -> 100%
//                      as DamageAmp stacks, and empties as they expire.
//   3. DEATHS          an ordinary unit inflates, bursts and leaves a decal;
//                      the Mechablub MK2 leaps and detonates.
//
// PRESENTATION ONLY. Nothing in this file writes to a simulation object, adds a
// property to one, or holds a lock on anything. It reads live objects, keeps
// its own animation records beside them, and draws.
//
// THE SPOT IS ALREADY FREE BEFORE THIS FILE HAS DRAWN A SINGLE PIXEL, and that
// is the constraint the whole death section is built around. js/blub.js spends
// the last charge, js/game.js's destroyed sweep pulls the body out of `towers`
// and fires Effects.towerDestroyed, all inside one update() -- so by the time
// drawWorld runs, the footprint is released, the click test no longer sees the
// body, and a new blub may already be standing on the same ground. This file
// learns about the death by NOTICING THE BODY IS GONE, which is precisely why
// it cannot delay anything: it is downstream of the removal, not on the path to
// it. A splatter here is a picture lying on free ground. It never registers an
// input handler and nothing in js/game.js consults it, so it cannot eat a click.
//
// --- HOW gl-world.js CALLS THIS --------------------------------------------
//
// index.html: add BEFORE js/gl/gl-world.js
//     <script src="js/gl/blub-systems.js"></script>
//
// (1) ONCE, at the end of install(), just before `return true;`:
//
//     BlubFXSystems.bind({
//       project: project, ringPath: ringPath,
//       drawGroundRing: drawGroundRing, drawGroundArc: drawGroundArc,
//       drawShockwave: drawShockwave, drawDebrisFan: drawDebrisFan,
//       groundHeightAt: groundHeightAt
//     });
//
// (2) In ensureMap(), inside the `if (key === mapKey && mapMesh) return;`
//     guard's ELSE path -- i.e. immediately after `mapKey = key;`:
//
//     BlubFXSystems.reset();          // a new board keeps no old splatters
//
// (3) In drawWorld(), immediately after `camera.update(state.dt || 1 / 60);`:
//
//     BlubFXSystems.update(state);    // one diff pass, once per frame
//
// (4) In drawWorld(), immediately AFTER the `for (i = 0; i < state.towers...)`
//     tower loop closes and BEFORE the enemy loop -- dying bodies are real
//     geometry, so the inflate and the MK2's leap are the model itself:
//
//     var dying = BlubFXSystems.dyingBodies();
//     for (i = 0; i < dying.length; i++) {
//       var db = dying[i];
//       var dm = towerModel(db.blub);
//       if (!dm) continue;
//       renderer.setGlow(db.glow, null);
//       drawActor(dm, db.x, db.y, db.yaw, db.scale,
//                 groundHeightAt(db.x, db.y) + db.lift, 0);
//       renderer.setGlow(0, null);
//     }
//
// (5) In drawOverlays(), immediately AFTER the range-ring / footprint loop and
//     BEFORE the Warbringer fracture ring -- decals lie under everything else:
//
//     BlubFXSystems.drawDecals(ctx, state);
//     BlubFXSystems.drawThreads(ctx, state);
//
// (6) In drawOverlays(), immediately BEFORE the health-bar loop
//     (`for (i = 0; i < state.towers.length; i++) bar(ctx, ...)`), so a sigil
//     never lands on top of the bar that answers a different question:
//
//     BlubFXSystems.drawSigils(ctx, state);
//
// (7) In drawOverlays(), between `drawShots(ctx, state);` and
//     `drawEffects(ctx);` -- the burst is an event, the popups go over it:
//
//     BlubFXSystems.drawDeaths(ctx, state);
//
// Every entry point no-ops safely if bind() was never called, so a half-wired
// build draws the game exactly as it did before.
//
// --- THE PERFORMANCE RULES THIS FILE HOLDS ITSELF TO -----------------------
//
// The budget is ../visual-pass/PERF.md: the stress scene must stay under 6 ms
// at 720p and overdraw is the sensitive axis, not triangles. Designed for 300
// units:
//
//   * NO COLOUR STRING IS BUILT PER FRAME. Every alpha in this file comes off a
//     13-rung ladder of rgba() strings built once at load (see `ladder`). A
//     fade is an array index, not a concatenation and not a toFixed.
//   * NO GRADIENT, NO shadowBlur, NO filter, NO large translucent fill. Every
//     shape here is a thin stroke or a dot a few pixels across. There is no
//     surface in this file whose area grows with resolution, so the 3.6x that
//     4K costs a full-screen pass costs this nothing.
//   * project() IS THE EXPENSIVE CALL and it is rationed. One shared GROUND
//     FRAME is measured once per frame (3 projections at the board centre) and
//     every decal and sigil is placed with a single projection plus that frame
//     -- instead of the 44 projections a drawGroundRing would spend each.
//   * THE THREAD COUNT IS BOUNDED BY THE GAME'S OWN CEILING, not by an LOD
//     rule: a full thread is only drawn for a blub whose 5% is actually being
//     bought, and BlubTower.swarmCap tops out at 1.0, so there can never be
//     more than 20 of them however many blubs are standing. Surplus bodies get
//     a batched screen-space stub, capped, and past that nothing.
//   * Death records are pooled and capped (MAX_DEATHS / MAX_DECALS), so a bad
//     frame drops the oldest picture rather than growing an unbounded list.
// ---------------------------------------------------------------------------

var BlubFXSystems = (function () {
  "use strict";

  // The renderer's own helpers, handed over by gl-world.install(). They live
  // inside that file's closure and there is no other way to reach them -- and
  // asking for them by name is also the honest statement of what this module
  // depends on.
  var api = null;

  // --- colour ---------------------------------------------------------------
  //
  // A LADDER, NOT A FORMULA. Thirteen prebuilt rgba() strings per colour per
  // role; a fade picks a rung. Thirteen steps is finer than a 1-frame alpha
  // change is visible at these opacities, and it means the hot loops below do
  // no string work at all. This is the single most important perf decision in
  // the file: at 300 units the naive version builds several thousand strings a
  // frame, every one of them garbage.
  function ladder(rgb, top) {
    var out = [];
    for (var i = 0; i <= 12; i++) {
      out.push("rgba(" + rgb + "," + (top * i / 12).toFixed(3) + ")");
    }
    return out;
  }

  function rung(lad, a) {
    var i = (a * 12 + 0.5) | 0;
    return lad[i < 0 ? 0 : (i > 12 ? 12 : i)];
  }

  // The summoner's two families, straight off BlubTower.tint(): path A is the
  // warm moss green of something grown, path B the cold steel blue of
  // something built. An uncommitted tower is the pale sac colour both start
  // from. Kept as literals rather than read from tint() because these ladders
  // are built once at load, before any tower exists.
  var RGB_A = "138,214,126";
  var RGB_B = "124,176,232";
  var RGB_N = "196,206,168";
  // A fused creature is its own thing and js/blub.js already says so in orange.
  var RGB_M = "214,158,92";
  // The house ember, identical to the default impact colour in gl-world's
  // drawEffects -- an explosion in this game is ember, whoever caused it.
  var RGB_EMBER = "238,184,108";
  // THE WEAKEN IS NOT THE SUMMONER'S GREEN. It is a mark on an ENEMY, and
  // DIRECTION.md fixes what the palette means: ley cyan is the player's power,
  // red is enemy life, gold is money. A corroded acid green is none of those
  // and reads as "something is eating this thing", which is what +100% damage
  // taken is. It is also the one hue the enemy roster never wears, so it can
  // never be mistaken for a health readout.
  var RGB_WEAK = "170,236,120";

  // Threads: one bright ladder for a thread that is buying bonus, one dim for
  // a surplus body, and a near-white pulse so an overlapping pair still reads
  // as two.
  var THREAD = [
    { lit: ladder(RGB_A, 0.42), dim: ladder(RGB_A, 0.16), hub: ladder(RGB_A, 0.30) },
    { lit: ladder(RGB_B, 0.42), dim: ladder(RGB_B, 0.16), hub: ladder(RGB_B, 0.30) },
    { lit: ladder(RGB_N, 0.42), dim: ladder(RGB_N, 0.16), hub: ladder(RGB_N, 0.30) }
  ];
  var PULSE = ladder("255,252,238", 0.90);

  // The sigil: a faint track, a bright fill arc, a leading cap and the rune's
  // three legs.
  var SIG_TRACK = ladder(RGB_WEAK, 0.20);
  var SIG_FILL = ladder(RGB_WEAK, 0.62);
  var SIG_LEG = ladder(RGB_WEAK, 0.26);
  var SIG_CAP = ladder("242,255,222", 0.85);

  // Deaths, indexed the same way as THREAD plus a fourth for a creature.
  var BODY = [
    { burst: ladder(RGB_A, 0.70), gob: ladder(RGB_A, 0.55), decal: ladder(RGB_A, 0.30) },
    { burst: ladder(RGB_B, 0.70), gob: ladder(RGB_B, 0.55), decal: ladder(RGB_B, 0.30) },
    { burst: ladder(RGB_N, 0.70), gob: ladder(RGB_N, 0.55), decal: ladder(RGB_N, 0.30) },
    { burst: ladder(RGB_M, 0.70), gob: ladder(RGB_M, 0.55), decal: ladder(RGB_M, 0.30) }
  ];
  var FLASH = ladder("255,248,232", 0.85);
  var RETICLE = ladder(RGB_EMBER, 0.75);
  var SHADOW = ladder("8,10,12", 0.34);

  // --- timing ---------------------------------------------------------------
  //
  // Seconds of GAME time. A death at 3x speed plays three times as fast,
  // because everything around it does, and it freezes while the game is paused
  // -- the alternative is a burst crawling across a board that has stopped.
  var INFLATE_S = 0.16;    // the swell, on the real model
  var BURST_S = 0.34;      // gobbets and the ring
  var DECAL_S = 1.70;      // the stain, fading
  var LEAP_S = 0.34;       // the MK2 in the air
  var BLAST_S = 0.46;      // its detonation
  var MK2_DECAL_S = 2.20;

  var MAX_DEATHS = 24;
  var MAX_DECALS = 48;
  // A BACKSTOP, NOT THE TEARDOWN TEST. The teardown test is the owner check in
  // update() -- restartGame() empties `towers`, so a body that vanished
  // alongside its own summoner did not die, the board did. This number only
  // catches something pathological that the owner test cannot explain, and it
  // sits above anything the summon intervals can actually produce: three
  // hundred Mini Blubs at 3/s spend roughly fifteen charges in a frame, of
  // which two or three are somebody's last.
  var BULK_DROP = 32;

  // --- state ----------------------------------------------------------------
  //
  // A Map keyed by the blub object itself. It is the only structure that can
  // answer "was this body on the board last frame" without writing a marker
  // onto the body, which is the one thing this module is not allowed to do.
  // Entries are deleted the moment a death is emitted, so the Map tracks the
  // living set exactly and never grows.
  var HAS_MAP = (typeof Map === "function");
  var watch = HAS_MAP ? new Map() : null;
  var token = -1;          // the frame stamp, so update() is idempotent
  var deaths = [];
  var decals = [];
  var pool = [];           // retired records, reused
  var dying = [];          // what dyingBodies() hands to the 3D pass

  // Scratch, reused every frame. Nothing here is allocated in a loop.
  var live = [];
  var gone = [];
  var hosts = [];          // the summoners standing this frame -- see update()

  // --- the shared ground frame ---------------------------------------------
  //
  // A circle on the board is an ellipse on screen, and a skewed one once the
  // camera is orbited. gl-world draws its ground shapes by projecting 44 points
  // each, which is exactly right for a range ring that has to drape over a deck
  // edge -- and far too expensive for a mark at the feet of every enemy on a
  // hundred-enemy board.
  //
  // So the two ground BASIS VECTORS are measured once per frame, at the board
  // centre, and every small decal is then placed with ONE projection plus that
  // frame scaled by its own depth. The error is the perspective difference
  // between the board centre and the mark's position, which over a shape ten
  // pixels across is invisible; the saving is 43 projections per mark.
  var frameToken = -1;
  var frameOk = false;
  var fAx = 1, fAy = 0, fBx = 0, fBy = 1, fScale = 1;
  var PROBE = 40;

  function ensureFrame(now) {
    if (frameToken === now) return frameOk;
    frameToken = now;
    frameOk = false;
    if (!api) return false;
    var cx = (typeof VIEW_WIDTH === "number" ? VIEW_WIDTH : 1280) * 0.5;
    var cy = (typeof VIEW_HEIGHT === "number" ? VIEW_HEIGHT : 720) * 0.5;
    var c = api.project(cx, cy, 0.4);
    if (!c) return false;
    var px = api.project(cx + PROBE, cy, 0.4);
    var py = api.project(cx, cy + PROBE, 0.4);
    if (!px || !py) return false;
    fAx = (px.x - c.x) / PROBE; fAy = (px.y - c.y) / PROBE;
    fBx = (py.x - c.x) / PROBE; fBy = (py.y - c.y) / PROBE;
    fScale = c.scale || 1;
    frameOk = true;
    return true;
  }

  // Put the canvas into the board's own plane at `p`, scaled so a unit circle
  // drawn afterwards is a circle of `radius` board pixels lying flat. Caller
  // must ctx.restore(). Returns the px-per-unit factor, which is what a
  // lineWidth has to be divided by to come out the intended screen width.
  function enterGround(ctx, p, radius) {
    var k = radius * ((p.scale || 1) / fScale);
    ctx.save();
    ctx.transform(fAx * k, fAy * k, fBx * k, fBy * k, p.x, p.y);
    return k;
  }

  // --- a fixed, irregular splatter -----------------------------------------
  //
  // Authored once as polar offsets in unit space. A decal only chooses a
  // rotation, so no shape is computed per frame and no two splatters on the
  // board are aligned.
  var SPL_A = [0.00, 0.86, 1.74, 2.51, 3.36, 4.21, 5.24];
  var SPL_D = [0.00, 0.55, 0.90, 0.36, 0.76, 1.00, 0.63];
  var SPL_S = [0.60, 0.29, 0.19, 0.33, 0.23, 0.16, 0.26];
  var GOB = 8;

  // --- wiring ---------------------------------------------------------------

  function bind(helpers) {
    api = helpers || null;
    return !!api;
  }

  function reset() {
    if (watch) watch.clear();
    while (deaths.length) pool.push(deaths.pop());
    while (decals.length) pool.push(decals.pop());
    dying.length = 0;
    token = -1;
    frameToken = -1;
  }

  function record() {
    return pool.length ? pool.pop() : {
      b: null, kind: 0, tint: 0, x0: 0, y0: 0, x1: 0, y1: 0,
      r: 8, dist: 0, t: 0, rot: 0, blastR: 0, yaw: 0
    };
  }

  // Game seconds since the last frame. REAL elapsed time scaled by the speed
  // the player picked, and zero while paused -- both read through typeof so
  // this file works in a harness that has neither.
  function step(state) {
    var dt = state.dt || 0;
    if (dt > 0.1) dt = 0.1;                       // a stalled tab, clamped
    if (typeof paused !== "undefined" && paused) return 0;
    var speed = (typeof gameSpeed === "number" && gameSpeed > 0) ? gameSpeed : 1;
    return dt * speed;
  }

  // --- the diff pass --------------------------------------------------------
  //
  // One walk of `state.towers` to refresh every living blub's last known
  // position, one walk of the watch list to find the ones that are no longer
  // there. A body that left is a death -- unless it was REMOVED, which covers
  // both the sell button and Coagulation absorbing its own fleet (see
  // Blub.dissolve, which exists so a merge is one event and not a hundred
  // simultaneous bursts).
  //
  // THE LAST KNOWN POSITION IS LOAD-BEARING FOR THE MK2. Blub.detonate moves
  // the body onto its target before the sweep runs, so by the time this notices
  // the death, `b.x/b.y` is already the IMPACT POINT and the launch point exists
  // nowhere else. The watch record is the only place it survives.
  function update(state) {
    if (!api || !state || !state.towers || !watch) return;
    var now = state.now || 0;
    if (now === token) return;                    // called twice in one frame
    token = now;

    var dt = step(state);
    var i, b, rec;

    var list = state.towers;
    hosts.length = 0;
    for (i = 0; i < list.length; i++) {
      b = list[i];
      if (!b) continue;
      if (!b.isSummon) {
        // The summoners standing right now. A board is never carrying more
        // than a handful, so this is a short array and a linear scan, not a
        // second Map.
        if (b.constructor && b.constructor.ID === "blub") hosts.push(b);
        continue;
      }
      rec = watch.get(b);
      if (rec) {
        rec.x = b.x; rec.y = b.y; rec.aim = b.aim; rec.seen = now;
      } else {
        watch.set(b, { x: b.x, y: b.y, aim: b.aim, seen: now });
      }
    }

    gone.length = 0;
    watch.forEach(function (r, key) {
      if (r.seen !== now) gone.push(key);
    });

    var bulk = gone.length > BULK_DROP;
    for (i = 0; i < gone.length; i++) {
      b = gone[i];
      rec = watch.get(b);
      watch["delete"](b);
      // SILENT REMOVALS, and there are three of them.
      //
      //   removed          the sell button, and Coagulation absorbing its own
      //                    fleet -- Blub.dissolve goes through sellTower for
      //                    exactly this reason, so a merge is one event and not
      //                    a hundred simultaneous bursts.
      //   owner gone       restartGame() empties `towers`, so a body that
      //                    vanished together with its own summoner did not die;
      //                    the board did. A blub whose summoner is destroyed by
      //                    an enemy keeps standing and keeps shooting, so this
      //                    test never mistakes a real death for a teardown.
      //   bulk             the backstop above, for anything neither explains.
      if (bulk || b.removed === true || !hosted(b)) continue;
      spawnDeath(b, rec);
    }

    // Age everything. Records run on game time so a death at 3x plays at 3x.
    if (dt > 0) {
      for (i = deaths.length - 1; i >= 0; i--) {
        var d = deaths[i];
        d.t += dt;
        var span = d.kind ? (LEAP_S + BLAST_S) : (INFLATE_S + BURST_S);
        if (d.t >= span) {
          spawnDecal(d);
          deaths.splice(i, 1);
          pool.push(d);
        }
      }
      for (i = decals.length - 1; i >= 0; i--) {
        decals[i].t += dt;
        if (decals[i].t >= (decals[i].kind ? MK2_DECAL_S : DECAL_S)) {
          pool.push(decals.splice(i, 1)[0]);
        }
      }
    }
  }

  // Is this body's summoner still on the board? A blub with no `owner` at all
  // is not something this file has an opinion about, so it is treated as
  // hosted -- the fallback is to draw the death, never to swallow it.
  function hosted(b) {
    if (!b.owner) return true;
    for (var i = 0; i < hosts.length; i++) if (hosts[i] === b.owner) return true;
    return false;
  }

  // Which colour family a body belongs to: 0 path A, 1 path B, 2 uncommitted,
  // 3 a fused creature. Asked once, at death, never per frame.
  function tintIndex(b) {
    if (b.monsterTier !== undefined && b.monsterTier >= 0) return 3;
    var unit = (typeof BlubTower !== "undefined" && BlubTower.unitById)
      ? BlubTower.unitById(b.unitId) : null;
    if (!unit) return 2;
    return unit.family === "B" ? 1 : 0;
  }

  function spawnDeath(b, rec) {
    if (!b || !rec) return;
    if (deaths.length >= MAX_DEATHS) {
      // The oldest picture is the one the player has already read.
      spawnDecal(deaths[0]);
      pool.push(deaths.shift());
    }
    var d = record();
    d.b = b;
    d.tint = tintIndex(b);
    d.r = b.footprintPx || 8;
    d.t = 0;
    // A deterministic rotation from the body's own position, so a splatter
    // looks the same every frame it is alive and no two on the board line up.
    d.rot = ((b.x * 12.9898 + b.y * 78.233) % 6.283185) || 0;
    d.x0 = rec.x; d.y0 = rec.y;
    d.x1 = b.x; d.y1 = b.y;
    d.yaw = b.aim || 0;
    d.blastR = 0;

    // THE ONE UNIT THAT EVER MOVES. `blasted` is set by Blub.detonate and by
    // nothing else, so it is an exact test for "this body leapt".
    var dx = d.x1 - d.x0, dy = d.y1 - d.y0;
    d.dist = Math.sqrt(dx * dx + dy * dy);
    if (b.blasted === true && b.deathBlast) {
      d.kind = 1;
      d.yaw = d.dist > 1 ? Math.atan2(dy, dx) : d.yaw;
      // THE RING IS EXACTLY THE DAMAGED RADIUS. Drawing a wider one would be a
      // lie about what the 250 touched, and this tower's whole read is that its
      // numbers are visible. What is wide here is the LEAP, which crosses up to
      // the unit's whole range; the blast is 25 u.l. and says so.
      d.blastR = (typeof ul === "function")
        ? ul(b.deathBlast.radiusUl) : b.deathBlast.radiusUl;
    } else {
      d.kind = 0;
      // An ordinary death cannot move. If a body somehow reports two positions
      // (it cannot today) the last one is where it actually is.
      d.x0 = d.x1; d.y0 = d.y1; d.dist = 0;
    }
    deaths.push(d);
  }

  function spawnDecal(d) {
    if (!d) return;
    if (decals.length >= MAX_DECALS) pool.push(decals.shift());
    var c = record();
    c.b = null;                     // the decal outlives the body; drop the ref
    c.kind = d.kind;
    c.tint = d.tint;
    c.x1 = d.x1; c.y1 = d.y1;
    c.r = d.kind ? Math.max(d.blastR * 0.5, d.r) : d.r * 1.45;
    c.rot = d.rot;
    c.t = 0;
    decals.push(c);
  }

  // --- what the 3D pass draws ----------------------------------------------
  //
  // THE DYING BODY IS REAL GEOMETRY, not a canvas blob standing in for it. The
  // unit is gone from `towers`, so gl-world's own tower loop no longer reaches
  // it -- but the object still exists, towerModel() still resolves its mesh,
  // and handing back a transform is all it takes for the inflate and the leap
  // to be the model itself. That matters twice over: a blob would break the
  // silhouette work the rest of this pass is about, and a leap the player has
  // to ANTICIPATE has to be a body they can see travelling.
  //
  // Returns a reused array. Do not hold it across frames.
  function dyingBodies() {
    dying.length = 0;
    for (var i = 0; i < deaths.length; i++) {
      var d = deaths[i];
      if (d.kind === 0) {
        if (d.t >= INFLATE_S) continue;           // it has burst; nothing left
        var p = d.t / INFLATE_S;
        var e = p * p * (3 - 2 * p);              // smoothstep: swell, not ramp
        dying.push({
          blub: d.b, x: d.x1, y: d.y1, yaw: d.yaw,
          // Over-pressure. 1.8x is enough to read at a Mini Blub's ten pixels
          // and still not swallow whatever is standing beside it.
          scale: 1 + 0.80 * e,
          lift: 0,
          // Lit from INSIDE, through the model's own emissive channel -- the
          // house rule (DIRECTION.md): light comes off the geometry, never off
          // a disc pasted over it.
          glow: 1.55 * e * e
        });
      } else {
        if (d.t >= LEAP_S) continue;              // it has landed
        var q = d.t / LEAP_S;
        // A WIDE, HIGH ARC. The height is proportional to the distance covered
        // with a floor under it, so a short hop still visibly leaves the ground
        // and a long one is unmistakable from across the board.
        var arc = Math.max(26, d.dist * 0.45);
        dying.push({
          blub: d.b,
          x: d.x0 + (d.x1 - d.x0) * q,
          y: d.y0 + (d.y1 - d.y0) * q,
          yaw: d.yaw,
          scale: 1 + 0.12 * Math.sin(Math.PI * q),
          lift: arc * 4 * q * (1 - q),
          glow: 0.25 + 1.45 * q * q
        });
      }
    }
    return dying;
  }

  // --- 1. SWARM THREADS -----------------------------------------------------
  //
  // "Chaque unite alliee vivante donne +5%." (BlubTower.SWARM_PER_BLUB.) The
  // brief asks for threads that let the player COUNT the bonus, and asks them
  // to stay countable up to twenty units.
  //
  // THE DEGRADATION RULE IS THE GAME'S OWN CEILING, NOT AN LOD HACK. A blub
  // only buys +5% while the swarm is under BlubTower.swarmCap -- 0.5 at A2,
  // 1.0 at A4 -- so past ten (or twenty) contributors an extra body changes
  // nothing at all. A FULL THREAD IS DRAWN ONLY FOR A BODY WHOSE 5% IS BEING
  // BOUGHT, which makes the count exact:
  //
  //        lit threads x 5%  ==  the swarm bonus, always
  //
  // and hard-caps the picture at twenty threads whatever is standing on the
  // board. Three hundred blubs cannot produce a glowing mat, because the
  // twenty-first thread does not exist. Surplus bodies are not ignored -- they
  // get a short STUB pointing home, batched into one path and capped at
  // STUB_LIMIT, which says "in the swarm, buying nothing" without drawing a
  // line across the board. Past that cap they carry no mark at all; by then
  // "every body is linked" is information the player already has.
  //
  // Each lit thread also carries a bead travelling toward the tower, on its own
  // phase, seeded from the body's position. Two threads that overlap on screen
  // still read as two, because their beads are in different places -- which is
  // what keeps twenty countable rather than merely present.
  var STUB_LIMIT = 48;
  var PULSE_SPEED = 0.55;

  function branchIndex(t) {
    if (typeof t.lockedBranch !== "function") return 2;
    var br = t.lockedBranch();
    return br === "A" ? 0 : (br === "B" ? 1 : 2);
  }

  function drawThreads(ctx, state) {
    if (!api || !state || !state.towers) return;
    if (!ensureFrame(state.now || 0)) return;
    for (var i = 0; i < state.towers.length; i++) {
      var t = state.towers[i];
      if (!t || t.isSummon) continue;
      if (!t.constructor || t.constructor.ID !== "blub") continue;
      // NO CAP, NO BONUS, NO THREADS. Below A2 the swarm buff does not exist,
      // and a thread that meant nothing would be the worst kind of decoration:
      // one that reads as a number.
      if (!(t.swarmCap > 0) || !t.blubs || !t.blubs.length) continue;
      towerThreads(ctx, t, state.now || 0);
    }
  }

  function towerThreads(ctx, t, now) {
    live.length = 0;
    var i, b;
    for (i = 0; i < t.blubs.length; i++) {
      b = t.blubs[i];
      if (!b || b.isDestroyed()) continue;
      // A tier 3+ creature has fused WITH the tower and js/blub.js gives it no
      // swarm bonus at all. It is the tower; it has nothing to link to.
      if (b.monsterTier >= 3) continue;
      live.push(b);
    }
    var n = live.length;
    // One blub is nobody else's ally: swarmBonusFor counts the fleet MINUS
    // ONE, so a lone body's bonus is zero and its thread would be a lie.
    if (n < 2) return;

    var per = (typeof BlubTower !== "undefined" && BlubTower.SWARM_PER_BLUB)
      ? BlubTower.SWARM_PER_BLUB : 0.05;
    var capCount = Math.max(1, Math.round(t.swarmCap / per));
    var paid = Math.min(n - 1, capCount);
    if (paid < 1) return;

    var hub = api.project(t.x, t.y, (t.footprintPx || 12) * 1.55);
    if (!hub) return;

    var pal = THREAD[branchIndex(t)];
    var rimPx = (t.footprintPx || 12) * 0.72 * ((hub.scale || 1) / 1);
    var k;

    // The threads themselves. One projection each -- the tower end is walked
    // back along the screen-space line from the hub, which for a twenty-pixel
    // offset is indistinguishable from projecting the rim point and costs
    // nothing.
    ctx.lineCap = "round";
    for (i = 0; i < paid; i++) {
      b = live[i];
      var bp = api.project(b.x, b.y, (b.footprintPx || 6) * 1.05);
      if (!bp) continue;
      var dx = bp.x - hub.x, dy = bp.y - hub.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      var ux = dx / len, uy = dy / len;
      var ax = hub.x + ux * rimPx, ay = hub.y + uy * rimPx;

      // A phase and a side, both deterministic from where the body stands, so
      // a thread does not jump when a neighbour dies and the array shifts.
      var seed = (b.x * 0.0173 + b.y * 0.0291);
      var phase = seed - Math.floor(seed);
      var side = phase < 0.5 ? 1 : -1;

      // Bowed UP on screen, plus a small lateral offset: light under tension,
      // and two bodies on the same bearing still separate.
      var mx = (ax + bp.x) * 0.5, my = (ay + bp.y) * 0.5;
      var cx = mx - uy * side * len * 0.055;
      var cy = my + ux * side * len * 0.055 - len * 0.13;

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(cx, cy, bp.x, bp.y);
      ctx.strokeStyle = rung(pal.lit, 0.62 + 0.38 * Math.sin(now * 1.9 + phase * 6.28));
      ctx.lineWidth = Math.max(0.8, 1.25 * (bp.scale || 1));
      ctx.stroke();

      // The bead, on the same curve, evaluated in screen space -- no extra
      // projection, and it is what makes twenty overlapping threads countable.
      var q = (now * PULSE_SPEED + phase) % 1;
      var iq = 1 - q;
      var px = iq * iq * bp.x + 2 * iq * q * cx + q * q * ax;
      var py = iq * iq * bp.y + 2 * iq * q * cy + q * q * ay;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1, 1.7 * (bp.scale || 1)), 0, 6.283185);
      ctx.fillStyle = rung(PULSE, 0.55 + 0.45 * Math.sin(q * 3.14159));
      ctx.fill();
    }

    // The surplus. One path, one stroke, a short screen-space tick at the body
    // pointing at the hub -- present, clearly not a thread, and no line laid
    // across the board.
    var surplus = n - paid;
    if (surplus > 0) {
      var drawn = surplus < STUB_LIMIT ? surplus : STUB_LIMIT;
      ctx.beginPath();
      for (i = 0; i < drawn; i++) {
        b = live[paid + i];
        var sp = api.project(b.x, b.y, (b.footprintPx || 6) * 1.05);
        if (!sp) continue;
        var sdx = hub.x - sp.x, sdy = hub.y - sp.y;
        var sl = Math.sqrt(sdx * sdx + sdy * sdy);
        if (sl < 1) continue;
        var stub = Math.min(sl * 0.35, 9 * (sp.scale || 1));
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(sp.x + sdx / sl * stub, sp.y + sdy / sl * stub);
      }
      ctx.strokeStyle = rung(pal.dim, 1);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.lineCap = "butt";

    // AND THE SAME NUMBER A SECOND WAY, at the tower: an arc on the ground
    // filled to paid/capCount. Counting threads is the precise read; this is
    // the glance -- "how full is the cap" -- and it costs twelve projections.
    // Deliberately faint and inside the footprint ring so it never competes
    // with the amber inspection mark or the stun sweep, both of which sit
    // further out.
    groundArc(ctx, t.x, t.y, (t.footprintPx || 12) + 3,
      -Math.PI / 2, -Math.PI / 2 + (paid / capCount) * 6.283185,
      rung(pal.hub, 1), 2, 14);
  }

  // A part-circle on the board, at a segment count the caller chooses. Same
  // shape as gl-world's drawGroundArc; spelled here so a small mark can ask
  // for twelve segments instead of the forty-eight a range ring needs.
  function groundArc(ctx, x, y, radius, from, to, stroke, width, steps) {
    var n = steps || 16;
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = from + (to - from) * (i / n);
      var p = api.project(x + Math.cos(a) * radius, y + Math.sin(a) * radius, 0.4);
      if (!p) return;
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width || 1.5;
    ctx.stroke();
  }

  // --- 2. THE WEAKEN SIGIL --------------------------------------------------
  //
  // A4's debuff, and every number in this drawing comes off the simulation
  // rather than out of a designer's head:
  //
  //   BlubTower.WEAKEN_PER_HIT   0.001 -- one hit is one thousandth
  //   BlubTower.WEAKEN_SECONDS   5     -- and each stack keeps its own clock
  //   DamageAmp.CAP              1.0   -- the ceiling the fill is measured against
  //
  // THE FILL IS THE AMPLIFICATION ITSELF. `DamageAmp.fraction(enemy)` is the
  // live figure, clamped at the cap, so an arc drawn to `fraction / CAP` is
  // literally 0% to 100% of "takes more damage" -- not a proxy for it. It grows
  // as blubs land hits and it DRAINS ON ITS OWN as those hits age out, because
  // js/systems/damage-amp.js retires every stack five seconds after it was
  // pushed. Nothing here runs a timer; there is no second clock to drift.
  //
  // THE SIGIL'S BRIGHTNESS IS A SEPARATE READ from its fill. One hit is a real
  // event but 0.1% is not a visible arc, so the mark appears at a third
  // brightness on the first hit and reaches full at eight hits' worth -- which
  // is derived from WEAKEN_PER_HIT, not typed. That way "a sigil appears on a
  // struck enemy" is true from hit one while the fill stays honest.
  //
  // READABILITY (17): strokes only, no fill, sat on the ground at the enemy's
  // feet at a little over its own hit radius. There is no surface here to hide
  // an enemy behind and nothing that saturates when forty of them stack up --
  // forty faint rings on forty separate bodies is forty faint rings.
  var SIGIL_OPEN_HITS = 8;

  function drawSigils(ctx, state) {
    if (!api || !state || !state.enemies) return;
    if (typeof DamageAmp === "undefined" || !DamageAmp.fraction) return;
    if (!ensureFrame(state.now || 0)) return;

    var cap = DamageAmp.CAP || 1;
    var perHit = (typeof BlubTower !== "undefined" && BlubTower.WEAKEN_PER_HIT)
      ? BlubTower.WEAKEN_PER_HIT : 0.001;
    var openAt = SIGIL_OPEN_HITS * perHit;
    var list = state.enemies;

    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.dead || e.leaked) continue;
      var frac = DamageAmp.fraction(e, cap);
      if (!(frac > 0)) continue;                  // the common case, and cheap

      var p = api.project(e.pos.x, e.pos.y, 0.5);
      if (!p) continue;

      var fill = frac / cap;
      var open = 0.34 + 0.66 * Math.min(1, frac / openAt);
      var radius = (e.radiusPx ? e.radiusPx() : 11) * 1.18;
      var k = enterGround(ctx, p, radius);
      var lw = 1 / k;
      // DETAIL THE PLAYER CANNOT RESOLVE IS DETAIL NOT WORTH DRAWING. Zoomed
      // out, or on a Swarm tick eight pixels across, the rune's legs and the
      // capped ring are sub-pixel clutter -- so below this the mark keeps only
      // the two shapes that carry the reading, the track and the fill.
      var detailed = radius * (p.scale || 1) > 9;

      // The track the fill runs in -- always a whole circle, so "how much of
      // it is lit" is answerable at a glance instead of by estimating an arc
      // against nothing.
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, 6.283185);
      ctx.strokeStyle = rung(SIG_TRACK, open);
      ctx.lineWidth = lw * 1.4;
      ctx.stroke();

      // The rune's three legs, so this reads as a mark someone put there and
      // not as another status ring.
      if (detailed) {
        ctx.beginPath();
        for (var g = 0; g < 3; g++) {
          var a = -1.5708 + g * 2.0944;
          var ca = Math.cos(a), sa = Math.sin(a);
          ctx.moveTo(ca * 0.62, sa * 0.62);
          ctx.lineTo(ca * 1.22, sa * 1.22);
        }
        ctx.strokeStyle = rung(SIG_LEG, open);
        ctx.lineWidth = lw * 1.2;
        ctx.stroke();
      }

      // THE FILL. From twelve o'clock, clockwise, exactly fraction/CAP of the
      // circle. This is the whole readout.
      if (fill > 0.002) {
        ctx.beginPath();
        ctx.arc(0, 0, 1, -1.5708, -1.5708 + fill * 6.283185);
        ctx.strokeStyle = rung(SIG_FILL, open);
        ctx.lineWidth = lw * 2.6;
        ctx.stroke();
      }

      // The leading edge, so the growth is visible hit by hit even while the
      // arc itself is still short.
      var head = -1.5708 + fill * 6.283185;
      ctx.beginPath();
      ctx.arc(Math.cos(head), Math.sin(head), lw * 1.8, 0, 6.283185);
      ctx.fillStyle = rung(SIG_CAP, open);
      ctx.fill();

      // CAPPED. +100% is the ceiling DamageAmp enforces and the one moment in
      // this readout worth marking, so the mark closes on itself.
      if (detailed && fill > 0.999) {
        ctx.beginPath();
        ctx.arc(0, 0, 1.3, 0, 6.283185);
        ctx.strokeStyle = rung(SIG_FILL, open * 0.7);
        ctx.lineWidth = lw * 1.1;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // --- 3. DEATHS ------------------------------------------------------------
  //
  // The stain, drawn first so it lies UNDER the bodies, the bars and the
  // threads. It is deliberately thin and low-alpha: a new blub may be summoned
  // onto this exact ground while the decal is still fading -- the brief's
  // instant release makes that a normal event, not an edge case -- and a decal
  // that painted over the newcomer would make an appearance look like a bug.
  function drawDecals(ctx, state) {
    if (!api || !decals.length) return;
    if (!ensureFrame(state && state.now || 0)) return;

    for (var i = 0; i < decals.length; i++) {
      var c = decals[i];
      var span = c.kind ? MK2_DECAL_S : DECAL_S;
      var fade = 1 - c.t / span;
      if (fade <= 0) continue;
      fade *= fade;                              // sits, then goes quickly

      var p = api.project(c.x1, c.y1, 0.35);
      if (!p) continue;
      var pal = BODY[c.tint];
      var k = enterGround(ctx, p, c.r);
      ctx.rotate(c.rot);

      ctx.beginPath();
      for (var s = 0; s < SPL_A.length; s++) {
        var a = SPL_A[s];
        var d = SPL_D[s];
        ctx.moveTo(Math.cos(a) * d + SPL_S[s], Math.sin(a) * d);
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, SPL_S[s], 0, 6.283185);
      }
      ctx.fillStyle = rung(pal.decal, fade);
      ctx.fill();

      // A rim, so the stain has an edge instead of dissolving into a smudge.
      ctx.beginPath();
      ctx.arc(0, 0, 1.05, 0, 6.283185);
      ctx.strokeStyle = rung(pal.decal, fade * 0.6);
      ctx.lineWidth = 1.2 / k;
      ctx.stroke();

      ctx.restore();
    }
  }

  // The events themselves: the burst an ordinary unit leaves behind, and the
  // MK2's leap and detonation.
  function drawDeaths(ctx, state) {
    if (!api || !deaths.length) return;
    var now = state && state.now || 0;
    if (!ensureFrame(now)) return;

    for (var i = 0; i < deaths.length; i++) {
      var d = deaths[i];
      if (d.kind === 0) ordinaryDeath(ctx, d);
      else mk2Death(ctx, d);
    }
  }

  // INFLATE -> BURST -> STAIN. The inflate is the model itself (see
  // dyingBodies); everything from the pop onward is here.
  function ordinaryDeath(ctx, d) {
    if (d.t < INFLATE_S) return;                 // still swelling, still a mesh
    var q = (d.t - INFLATE_S) / BURST_S;
    if (q >= 1) return;
    var fade = 1 - q;
    var pal = BODY[d.tint];

    var p = api.project(d.x1, d.y1, 0.4);
    if (!p) return;

    // The gobbets: short streaks flung out along the ground, in the body's own
    // colour, on the fixed fan rotated by this death's own seed. Batched into
    // ONE path -- eight strokes per death across twenty-four concurrent deaths
    // would otherwise be a hundred and ninety-two state changes a frame.
    var reach = d.r * (0.55 + 1.35 * q);
    var k = enterGround(ctx, p, reach);
    ctx.rotate(d.rot);
    ctx.beginPath();
    for (var g = 0; g < GOB; g++) {
      var a = g * 0.785398 + (g % 3) * 0.18;
      var ca = Math.cos(a), sa = Math.sin(a);
      var inner = 0.35 + 0.30 * ((g * 5 % 4) / 4);
      ctx.moveTo(ca * inner, sa * inner);
      ctx.lineTo(ca, sa);
    }
    ctx.strokeStyle = rung(pal.gob, fade * fade);
    ctx.lineWidth = (1.4 + 1.6 * fade) / k;
    ctx.lineCap = "round";
    ctx.stroke();

    // The pop: one bright ring on the ground and, for the first instant, a
    // white core. Two shapes, fourteen segments, no gradient anywhere.
    ctx.beginPath();
    ctx.arc(0, 0, 0.98, 0, 6.283185);
    ctx.strokeStyle = rung(pal.burst, fade * fade);
    ctx.lineWidth = (1 + 2.2 * fade) / k;
    ctx.stroke();

    if (q < 0.35) {
      ctx.beginPath();
      ctx.arc(0, 0, 0.30 + 0.5 * q, 0, 6.283185);
      ctx.fillStyle = rung(FLASH, 1 - q / 0.35);
      ctx.fill();
    }
    ctx.lineCap = "butt";
    ctx.restore();
  }

  // THE MECHABLUB MK2. Blub.detonate has already moved the body onto its
  // target and already dealt the 250 there -- the simulation's leap is
  // instantaneous, and this is the picture of it.
  //
  // ANTICIPATION IS THE REQUIREMENT, so the impact point is marked on the FIRST
  // frame of the leap and the reticle closes in step with the body's flight.
  // The player is never watching a body travel toward an unknown spot; they are
  // watching a countdown to a spot they have already been shown -- which is
  // also the honest picture, because the damage is already committed there.
  function mk2Death(ctx, d) {
    var flying = d.t < LEAP_S;
    var q = flying ? d.t / LEAP_S : (d.t - LEAP_S) / BLAST_S;
    var pt = api.project(d.x1, d.y1, 0.4);
    if (!pt) return;

    if (flying) {
      // The mark on the ground, contracting onto the impact radius.
      var grow = 1.85 - 0.85 * q;
      var k = enterGround(ctx, pt, d.blastR);
      var lw = 1 / k;
      ctx.beginPath();
      ctx.arc(0, 0, grow, 0, 6.283185);
      ctx.strokeStyle = rung(RETICLE, 0.45 + 0.55 * q);
      ctx.lineWidth = lw * 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, 6.283185);
      ctx.strokeStyle = rung(RETICLE, 0.30 + 0.30 * q);
      ctx.lineWidth = lw * 1.2;
      ctx.stroke();
      // Four legs, so it reads as a target and not as another range ring.
      ctx.beginPath();
      for (var g = 0; g < 4; g++) {
        var a = g * 1.5708 + 0.7854;
        var ca = Math.cos(a), sa = Math.sin(a);
        ctx.moveTo(ca * grow * 0.82, sa * grow * 0.82);
        ctx.lineTo(ca * grow * 1.24, sa * grow * 1.24);
      }
      ctx.strokeStyle = rung(RETICLE, 0.35 + 0.45 * q);
      ctx.lineWidth = lw * 1.6;
      ctx.stroke();
      ctx.restore();

      // The shadow under the body, so the arc reads as height rather than as a
      // body sliding along the floor. It shrinks as the body rises.
      if (d.dist > 1) {
        var bx = d.x0 + (d.x1 - d.x0) * q;
        var by = d.y0 + (d.y1 - d.y0) * q;
        var sp = api.project(bx, by, 0.3);
        if (sp) {
          var air = 4 * q * (1 - q);
          var sk = enterGround(ctx, sp, d.r * (0.85 - 0.35 * air));
          ctx.beginPath();
          ctx.arc(0, 0, 1, 0, 6.283185);
          ctx.fillStyle = rung(SHADOW, 1 - 0.55 * air);
          ctx.fill();
          ctx.restore();
        }
      }
      return;
    }

    if (q >= 1) return;

    // THE DETONATION, through gl-world's own shockwave and debris fan, at the
    // radius Blub.deathBlast actually damaged and no wider. Using the house
    // functions is the point: an explosion in this game already has a look --
    // a bright travelling edge, a wake, a scorch and spokes of debris -- and a
    // second one invented here would read as a different game's effect.
    api.drawShockwave(ctx, d.x1, d.y1, d.blastR, q, RGB_EMBER);
    if (d.blastR > 14) {
      // drawDebrisFan wants an impact-shaped object; it reads x, y, radius and
      // seed and nothing else.
      FAN.x = d.x1; FAN.y = d.y1; FAN.radius = d.blastR;
      FAN.seed = (d.rot * 57.2958) | 0;
      api.drawDebrisFan(ctx, FAN, q, RGB_EMBER);
    }
    // A column of light at the seat of it. Vertical, because the blast ring is
    // honest about its 25 u.l. and this is where the WEIGHT of 250 damage goes
    // -- upward, where it cannot cover any more of the board.
    if (q < 0.5) {
      var lift = api.project(d.x1, d.y1, 40 + 90 * q);
      if (lift) {
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(lift.x, lift.y);
        ctx.strokeStyle = rung(FLASH, (1 - q / 0.5) * 0.8);
        ctx.lineWidth = Math.max(1.5, 5 * (1 - q / 0.5) * (pt.scale || 1));
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.lineCap = "butt";
      }
    }
  }

  // Reused so drawDebrisFan never costs an allocation.
  var FAN = { x: 0, y: 0, radius: 0, seed: 0 };

  // --- what the perf harness can ask ---------------------------------------
  function stats() {
    return {
      watched: watch ? watch.size : 0,
      deaths: deaths.length,
      decals: decals.length,
      pooled: pool.length
    };
  }

  return {
    bind: bind,
    reset: reset,
    update: update,
    dyingBodies: dyingBodies,
    drawThreads: drawThreads,
    drawSigils: drawSigils,
    drawDecals: drawDecals,
    drawDeaths: drawDeaths,
    stats: stats
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = BlubFXSystems;
}
