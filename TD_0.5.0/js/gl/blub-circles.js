// ---------------------------------------------------------------------------
// BlubFXCircles -- THE SUMMONING CIRCLE (brief section 11).
//
// One circle appears under every unit the Summoner plants, lives EXACTLY two
// seconds, and disappears. Its diameter is proportional to the unit's own
// radius, so a SuperBlub's circle is five times a Mini Blub's for free: the
// number comes from `blub.footprintPx`, which is `ul(BlubTower.UNITS[].
// footprintUl)` and nothing else. 10 -> 50 u.l. is 5x, and it stays 5x if
// anyone ever retunes the table.
//
// PRESENTATION ONLY. Nothing here is written back into the simulation: the
// module reads `towers` (through the render state it is handed), keeps its own
// records in its own pool, and its only outputs are canvas calls and one number
// -- the descent height -- that the renderer may add to an actor's lift.
//
// TWO VOICES, chosen by the unit's own family in `BlubTower.UNITS`:
//
//   voie A  chalk and engraved runes, green and ochre. It SCRIBES itself into
//           the ground -- the ring is drawn by a travelling head that throws
//           stone dust behind it -- turns slowly and irregularly, and fades
//           out progressively, the chalk going before the engraving does.
//   voie B  hologram and grid, cyan. It DEPLOYS as a wiper sweep, turns fast
//           and in discrete steps (a machine, not a spell), and RETRACTS in
//           three snaps with a little glitching on the way out.
//   B2      adds a cyan rim and multiplies the spin by 1.35. On a voie B
//           circle the rim would be redundant (it is already cyan), so only
//           the extra spin applies there -- which is what the mark reads as
//           anyway: the same circle, wound tighter.
//
// Family is the right key rather than the tower's path, and it is not a
// shortcut: a path-A tower only ever summons family A units, a B3+ tower only
// ever summons family B ones, and a tower carrying B1/B2 as CROSSPATH MARKS is
// still summoning blub1..3 -- family A -- which is exactly the case the brief's
// "B2 adds a cyan rim" sentence describes. `owner.hasB3/B4/B5` is kept only as
// a fallback for a unit id the table does not know.
//
//
// ================= THE HARD PART: MANY CIRCLES AT ONCE =====================
//
// The brief calls it out and it is the real design problem here. At the
// fastest summon rates -- three lines at the 0.5 s floor, several summoners,
// a two second life -- circles overlap permanently and never stop. They have
// to stay READABLE stacked without turning the area into a light. Four things
// do that, and none of them is "turn the alpha down until it goes away":
//
//   1. SOURCE-OVER, NEVER ADDITIVE. This is the whole foundation. Under
//      `lighter`, k overlapping strokes of luminance L reach k*L: twenty
//      rings are white and nothing inside them can be read. Under source-over
//      the same stack converges to 1 - (1-a)^k of the INK COLOUR and stops
//      there -- it can never be brighter than the brightest thing drawn. So
//      the saturation ceiling is set by the palette, not by the alpha, and
//      the palette is chosen for it: the workhorse inks are mid-value green,
//      ochre and cyan, and the two near-white inks are hairlines used on a
//      few tenths of a radian (the scribing head, the wiper arm). Twenty
//      stacked circles converge to a mid-value lattice.
//
//   2. CONSTANT INK PER AREA, not per circle. Every frame the live circles are
//      binned into a coarse world grid (one 64 px cell, one integer, no
//      allocation) and each circle is dimmed by 1/(1 + 0.5*(neighbours)). One
//      circle alone draws at full strength; five in a cell draw at 0.36 each,
//      whose source-over composite is ~0.89 of the ink -- about what one
//      circle alone puts down. The ink a square of board receives is therefore
//      roughly independent of how many circles landed in it, which is the
//      property that keeps a knot of twenty legible AND keeps section 17
//      (nothing may hide the enemies or the path) true under accumulation.
//
//   3. THE NEWEST CIRCLE IN EACH CELL KEEPS PRIORITY. It is halfway un-dimmed
//      again and, because records are held in spawn order and drawn oldest
//      first, it is also painted last. The freshest event -- "a unit just
//      appeared HERE" -- is the one piece of information a stack carries, so
//      it is the one thing that is never allowed to be buried.
//
//   4. NO INTERIOR FILLS. Not one large translucent disc anywhere. A filled
//      r = 40 px circle is ~5 000 px of fill; the same circle as six stroked
//      layers is ~1 700 px, and twenty of them is 0.1 Mpx instead of 2 Mpx --
//      a 20x difference on the one axis PERF.md says is sensitive, and the
//      difference between a board you can see through and a wash. It also
//      means the descending unit is never painted over by its own circle.
//
// Everything else is budget: a hard cap of 64 live records (the oldest are
// dropped, and they are the ones about to expire anyway), three detail tiers
// chosen from projected radius / local crowd / a per-frame segment budget, and
// a cull of anything smaller than 3 px or off screen. The tier pass walks
// NEWEST FIRST so that when the budget runs out it is the oldest circles that
// go plain, never the one that just landed.
//
// Cost shape, for the record: three `project()` calls per circle and then
// every ring, rune, spoke and tick is a plain 2D path inside one canvas
// transform -- NOT 24 projected points per ring the way `ringPath` works.
// That is deliberate and it is the one approximation in this file: a ground
// circle is a conic under a perspective camera and this draws the affine
// ellipse through its two axes instead. Over a footprint-sized radius (7 to
// 96 px) the error is under a pixel, and it buys a 10x cut in the per-point
// projection work that a range ring legitimately pays for a 300 px circle.
// When the caller hands over `withGround`, the three basis points are pinned
// to the height under the circle's centre, so a circle near a deck edge stays
// a clean ellipse on its own level instead of shearing across the step.
//
// No gradients, no shadowBlur, no filter, no per-frame string building: every
// colour is a module constant and every alpha goes through `globalAlpha`.
// ---------------------------------------------------------------------------

var BlubFXCircles = (function () {
  "use strict";

  var TAU = Math.PI * 2;

  // --- the contract with js/blub.js ----------------------------------------

  // Section 11 says two seconds and means it. Everything below is a fraction
  // of this, so the whole choreography moves if it is ever retuned.
  var LIFE = 2.0;

  // The circle sits just outside the body it belongs to. Any constant keeps
  // the brief's proportionality; this one is chosen so the ring clears the
  // silhouette (the unit stands INSIDE its circle rather than on top of the
  // line) while overlapping a touching neighbour by less than a fifth of its
  // radius -- the circle blocks nothing, but it should not look like it is
  // trying to.
  var RADIUS_K = 1.18;
  var MIN_RADIUS_PX = 7;
  var MAX_RADIUS_PX = 96;

  // Height above the surface. `project()` already adds the board's ground
  // height, so this is only the hair of clearance that keeps the line off the
  // tile it is lying on.
  var Z_LIFT = 0.35;

  // voie A -- chalk.
  var A_ENGRAVE = 0.42;        // s, the scribing head's trip round the ring
  var A_DUST_TAIL = 0.25;      // s, dust still settling after it lands
  var A_FADE_FROM = 1.15;      // s, when the chalk starts to go
  var A_SPIN = 0.30;           // rad/s -- ~0.05 rev/s, slow
  var A_DESCENT = 0.62;        // s, the unit's trip down

  // voie B -- hologram.
  var B_DEPLOY = 0.26;         // s, the wiper sweep
  var B_RETRACT_FROM = 1.66;   // s, when it starts snapping shut
  var B_SPIN = 0.85;           // rev/s -- fast
  var B_STEPS = 36;            // and quantised: a machine, not a spell
  var B_DESCENT = 0.44;
  var ACCENT_SPIN = 1.35;      // what the B2 mark multiplies the spin by

  // --- the palette ----------------------------------------------------------
  //
  // Constants, never built per frame, and deliberately mid-value: see point 1
  // of the note above. The two pale inks are hairline-only.
  var INK_A_CHALK = "rgb(206,214,182)";
  var INK_A_GREEN = "rgb(138,170,96)";
  var INK_A_OCHRE = "rgb(176,134,66)";
  var INK_A_DUST = "rgb(186,166,128)";
  var INK_A_HEAD = "rgb(232,238,208)";   // hairline, engraving head only
  var INK_B_CYAN = "rgb(96,198,222)";
  var INK_B_GRID = "rgb(62,142,168)";
  var INK_B_HOT = "rgb(198,238,246)";    // hairline, wiper arm only
  var INK_RIM = "rgb(120,214,236)";      // the B2 rim

  // Base alphas, before the life envelope and the crowd meter.
  var A_RING_ALPHA = 0.60;
  var A_RUNE_ALPHA = 0.50;
  var A_DUST_ALPHA = 0.34;
  var B_RING_ALPHA = 0.58;
  var B_GRID_ALPHA = 0.34;
  var B_HOT_ALPHA = 0.62;
  var RIM_ALPHA = 0.46;

  // --- the crowd meter ------------------------------------------------------
  var CELL = 64;               // world px per bin -- wider than most circles
  var GRID_W = 40;
  var GRID_H = 26;
  var CROWD_K = 0.50;          // how hard a neighbour dims you
  var DIM_FLOOR = 0.26;        // and how far that may ever go
  var FRESH_LIFT = 0.5;        // the newest in a cell gets half of it back
  var SOFT_N = 16;             // a mild board-wide concession past this many
  var GLOBAL_FLOOR = 0.62;

  // --- budget ---------------------------------------------------------------
  //
  // MAX_ACTIVE is a safety rail, not the working limit: three lines at the
  // 0.5 s interval floor is six bodies a second per summoner, so two seconds
  // of life is twelve circles per summoner and a board would need ten maxed
  // Summoners to reach this. MAX_DRAWN is the number that actually bites, and
  // it bounds the projection work at 48 x 3 = 144 `project()` calls whatever
  // happens. Above it the OLDEST circles stop being drawn -- chosen over
  // cutting everybody's life short, because "exactly two seconds" is the
  // brief's promise and a circle in its last third has already said what it
  // had to say.
  var MAX_ACTIVE = 128;
  var MAX_DRAWN = 48;
  var SEG_BUDGET = 900;
  var TIER_COST = [5, 12, 30];
  var BURST_PRIME = 12;        // more new summons than this in ONE frame is a
                               // scene load, not a summon -- prime, do not fire

  // --- state ----------------------------------------------------------------
  //
  // Records are POOLED. A circle a frame at 300 units would otherwise be a
  // steady drip of garbage for the collector to pick up mid-wave.
  var records = [];
  var pool = [];
  var byBlub = (typeof Map === "function") ? new Map() : null;
  var seen = (typeof WeakSet === "function") ? new WeakSet() : null;
  var supported = !!(byBlub && seen && typeof Int16Array === "function");

  var clock = 0;               // seconds of SIMULATION time, our own
  var lastBeat = -1;           // the frame stamp we last advanced on
  var armed = false;           // the first frame primes rather than fires
  var serial = 0;
  var optimistic = 0;          // descentLift guesses made this frame

  var cellCount = supported ? new Int16Array(GRID_W * GRID_H) : null;
  var cellNewest = supported ? new Int16Array(GRID_W * GRID_H) : null;
  var touched = [];
  var pending = [];

  // --- small maths ----------------------------------------------------------

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  // Gentle at both ends. This is what makes the unit DESCEND rather than fall:
  // it leaves the top slowly, travels, and settles slowly. An ease-out alone
  // starts at full speed, which is a drop.
  function smoother(u) { return u * u * u * (u * (u * 6 - 15) + 10); }

  // Quantised 0..1 in n steps, snapping UP -- the shape of a mechanism.
  function stepUp(q, n) { return Math.ceil(q * n) / n; }

  function hash32(a) {
    a = (a ^ 61) ^ (a >>> 16);
    a = (a + (a << 3)) | 0;
    a = a ^ (a >>> 4);
    a = Math.imul(a, 0x27d4eb2d);
    a = a ^ (a >>> 15);
    return a >>> 0;
  }

  // --- the clock ------------------------------------------------------------
  //
  // SIMULATION time, derived rather than stored, because the circle belongs to
  // the summon that made it: at 3x it must live a third as long in wall time
  // (or three times as many pile up), and while the game is paused it must not
  // age at all. `js/game.js` scales its fixed step by `gameSpeed` and skips
  // `update()` entirely when paused, and this reproduces exactly that rule
  // from the outside -- read-only, nothing is written back.
  //
  // Keyed on the loop's own frame stamp so it is idempotent within a frame:
  // `drawWorld` (through descentLift) and `drawOverlays` (through draw) both
  // beat it, in either order, and only the first one in a frame moves it.
  function beat(dtHint) {
    var stamp = (typeof lastTime === "number" && lastTime > 0)
      ? lastTime / 1000 : -1;
    var dt;
    if (stamp >= 0) {
      if (lastBeat < 0) { lastBeat = stamp; optimistic = 0; return; }
      if (stamp === lastBeat) return;
      dt = stamp - lastBeat;
      lastBeat = stamp;
    } else {
      dt = (typeof dtHint === "number" && dtHint > 0) ? dtHint : 1 / 60;
    }
    optimistic = 0;                              // a new frame, a new guess
    if (dt > 0.25) dt = 0.25;                    // the loop's own clamp

    if (typeof paused !== "undefined" && paused) return;
    if (typeof gameOver !== "undefined" && gameOver) return;
    if (typeof victory !== "undefined" && victory) return;
    // `screen` is the game's own string; if some host leaves it as the DOM's
    // Screen object this test simply does not fire, which is the safe way.
    if (typeof screen === "string" && screen !== "play") return;

    var speed = (typeof gameSpeed === "number" && gameSpeed > 0) ? gameSpeed : 1;
    clock += dt * speed;
  }

  // --- records --------------------------------------------------------------

  function blank() {
    return {
      blub: null, x: 0, y: 0, radius: 20, lift: 40, born: 0,
      voie: 0, accent: false, seed: 0, spin0: 0,
      crowd: 0, dim: 1, tier: 2, vis: false,
      cx: 0, cy: 0, ax: 0, ay: 0, bx: 0, by: 0, lw: 1.4,
      ang: 0, ang2: 0
    };
  }

  function voieOf(blub) {
    var unit = (typeof BlubTower !== "undefined" && BlubTower.unitById)
      ? BlubTower.unitById(blub.unitId) : null;
    if (unit && unit.family === "B") return 1;
    if (unit && unit.family === "A") return 0;
    var o = blub.owner;
    return (o && (o.hasB3 || o.hasB4 || o.hasB5)) ? 1 : 0;
  }

  function radiusOf(blub) {
    var px = blub.footprintPx;
    if (!(px > 0)) {
      var unit = (typeof BlubTower !== "undefined" && BlubTower.unitById)
        ? BlubTower.unitById(blub.unitId) : null;
      var u = (unit && unit.footprintUl) || 12;
      px = (typeof ul === "function") ? ul(u) : u;
    }
    var r = px * RADIUS_K;
    if (r < MIN_RADIUS_PX) r = MIN_RADIUS_PX;
    if (r > MAX_RADIUS_PX) r = MAX_RADIUS_PX;
    return r;
  }

  // How far above the surface a unit starts its descent. Proportional to the
  // body so a SuperBlub travels further than a Mini and neither of them looks
  // teleported, capped so nothing starts off the top of the screen.
  function liftOf(blub) {
    var px = blub.footprintPx > 0 ? blub.footprintPx : 12;
    var h = 26 + 1.9 * px;
    return h > 150 ? 150 : h;
  }

  // A blub is eligible for a circle if it was SUMMONED. A fused monster blub
  // is a merge of bodies already on the board, not an arrival, and section 15
  // gives it its own emergence -- so it is skipped here rather than getting a
  // second, contradictory entrance. `spawnFor` is public so that pass can opt
  // one in deliberately if it ever wants to.
  function eligible(blub) {
    if (!blub || blub.isSummon !== true) return false;
    if (blub.dissolved) return false;
    if (typeof blub.monsterTier === "number" && blub.monsterTier >= 0) return false;
    return true;
  }

  function spawnFor(blub) {
    if (!supported || !blub) return null;
    var r = pool.length ? pool.pop() : blank();
    r.blub = blub;
    r.x = blub.x;
    r.y = blub.y;
    r.radius = radiusOf(blub);
    r.lift = liftOf(blub);
    r.born = clock;
    r.voie = voieOf(blub);
    r.accent = !!(blub.owner && blub.owner.hasB2);
    r.seed = hash32((blub.x * 131 | 0) ^ ((blub.y * 37 | 0) << 9) ^ (++serial));
    r.spin0 = (r.seed % 6283) / 1000;
    r.crowd = 0; r.dim = 1; r.tier = 2; r.vis = false;
    records.push(r);
    byBlub.set(blub, r);
    seen.add(blub);
    // Over the cap the OLDEST goes, because it is the one with least life left
    // and least to say.
    while (records.length > MAX_ACTIVE) retire(records.shift());
    return r;
  }

  function retire(r) {
    if (r.blub) byBlub["delete"](r.blub);
    r.blub = null;
    pool.push(r);
  }

  function reset() {
    for (var i = 0; i < records.length; i++) retire(records[i]);
    records.length = 0;
    if (byBlub) byBlub.clear();
    clock = 0;
    lastBeat = -1;
    armed = false;
  }

  // --- harvest --------------------------------------------------------------
  //
  // A blub in `towers` that this module has never seen is a blub that has just
  // been summoned: `BlubTower.summon` pushes it during `update()` and the very
  // next `draw()` finds it. Nothing is written to the blub to mark it -- the
  // bookkeeping is a WeakSet here, so a body that dies is forgotten by the
  // collector and a save/load cannot inherit a stale flag.
  function harvest(list) {
    var fresh = 0, i, t;
    for (i = 0; i < list.length; i++) {
      t = list[i];
      if (!t || t.isSummon !== true) continue;
      if (seen.has(t)) continue;
      if (!armed) { seen.add(t); continue; }      // first frame: prime
      if (!eligible(t)) { seen.add(t); continue; }
      pending[fresh++] = t;
    }
    armed = true;
    // A whole fleet appearing in ONE frame is a scene being built (a restart,
    // a sandbox boot, a Coagulation being undone), not a summon burst -- three
    // lines and a 0.5 s floor cannot produce a dozen bodies in one step. Firing
    // thirty circles at once there is a flash across the board and exactly the
    // light saturation section 17 forbids, so they are primed silently.
    if (fresh > BURST_PRIME) {
      for (i = 0; i < fresh; i++) { seen.add(pending[i]); pending[i] = null; }
      return;
    }
    for (i = 0; i < fresh; i++) { spawnFor(pending[i]); pending[i] = null; }
  }

  // --- expiry + the crowd meter --------------------------------------------

  function sweep() {
    var w = 0, i, r;
    for (i = 0; i < records.length; i++) {
      r = records[i];
      if (clock - r.born >= LIFE) { retire(r); continue; }
      records[w++] = r;
    }
    records.length = w;
  }

  function cellOf(x, y) {
    var cx = x / CELL | 0, cy = y / CELL | 0;
    if (cx < 0) cx = 0; else if (cx >= GRID_W) cx = GRID_W - 1;
    if (cy < 0) cy = 0; else if (cy >= GRID_H) cy = GRID_H - 1;
    return cy * GRID_W + cx;
  }

  // One integer pass. Only the cells actually used are cleared afterwards, so
  // this costs O(circles) and never O(grid).
  function meter() {
    var i, c, r;
    for (i = 0; i < touched.length; i++) {
      cellCount[touched[i]] = 0;
      cellNewest[touched[i]] = -1;
    }
    touched.length = 0;

    for (i = 0; i < records.length; i++) {
      c = cellOf(records[i].x, records[i].y);
      if (cellCount[c] === 0) touched.push(c);
      cellCount[c]++;
      cellNewest[c] = i;                 // records are in spawn order
    }

    var gdim = records.length > SOFT_N
      ? Math.max(GLOBAL_FLOOR, SOFT_N / records.length) : 1;

    for (i = 0; i < records.length; i++) {
      r = records[i];
      c = cellOf(r.x, r.y);
      r.crowd = cellCount[c];
      var d = 1 / (1 + CROWD_K * (r.crowd - 1));
      if (d < DIM_FLOOR) d = DIM_FLOOR;
      if (cellNewest[c] === i) d += (1 - d) * FRESH_LIFT;
      r.dim = d * gdim;
    }
  }

  // --- projection -----------------------------------------------------------
  //
  // The circle's screen basis: centre, and the screen vectors of its two world
  // axes. Written into module scratch rather than returned so that the whole
  // thing can be handed to `withGround` as ONE hoisted callback -- a closure
  // per circle per frame is exactly the sort of allocation this file is meant
  // not to make.
  var _proj = null, _px = 0, _py = 0, _pr = 0, _ok = false;
  var _cx = 0, _cy = 0, _cs = 1, _ax = 0, _ay = 0, _bx = 0, _by = 0;

  function basis() {
    _ok = false;
    var c = _proj(_px, _py, Z_LIFT);
    if (!c) return;
    var a = _proj(_px + _pr, _py, Z_LIFT);
    if (!a) return;
    var b = _proj(_px, _py + _pr, Z_LIFT);
    if (!b) return;
    _cx = c.x; _cy = c.y; _cs = c.scale || 1;
    _ax = a.x - c.x; _ay = a.y - c.y;
    _bx = b.x - c.x; _by = b.y - c.y;
    _ok = true;
  }

  // --- local space ----------------------------------------------------------
  //
  // Inside `local()` the unit circle IS the projected circle, so every ring,
  // rune, spoke and tick is authored in radius-1 coordinates and the camera is
  // somebody else's problem. The path is built here and stroked AFTER the
  // restore, which is the point of the split: the geometry gets the ellipse,
  // the pen does not -- otherwise a hairline would be 2.6 px across the board
  // and 0.4 px along it.
  function local(ctx, r, ang) {
    ctx.save();
    ctx.transform(r.ax, r.ay, r.bx, r.by, r.cx, r.cy);
    if (ang) ctx.rotate(ang);
  }

  function stroke(ctx, ink, alpha, width) {
    if (alpha <= 0.008) return;
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.strokeStyle = ink;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  // An arc that does not drag a line in from wherever the path was.
  function arcAt(ctx, radius, from, to) {
    ctx.moveTo(Math.cos(from) * radius, Math.sin(from) * radius);
    ctx.arc(0, 0, radius, from, to);
  }

  function spoke(ctx, ang, r0, r1) {
    var c = Math.cos(ang), s = Math.sin(ang);
    ctx.moveTo(c * r0, s * r0);
    ctx.lineTo(c * r1, s * r1);
  }

  // --- voie A: chalk and engraved runes ------------------------------------
  //
  // Four glyphs, each two strokes, authored in a unit box whose x runs along
  // the ring and whose y runs out from the centre. A flat constant table, so
  // laying twelve of them down allocates nothing.
  var GLYPHS = [
    [-0.5, -0.5, 0.5, -0.5, 0, -0.5, 0, 0.5],
    [-0.5, 0.5, 0, -0.5, 0, -0.5, 0.5, 0.5],
    [-0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5],
    [-0.45, -0.5, -0.45, 0.5, -0.45, 0, 0.45, 0.35]
  ];

  function glyph(ctx, g, ang, rr, size) {
    var c = Math.cos(ang), s = Math.sin(ang);
    for (var i = 0; i < 8; i += 4) {
      var x0 = g[i] * size, y0 = rr + g[i + 1] * size;
      var x1 = g[i + 2] * size, y1 = rr + g[i + 3] * size;
      ctx.moveTo(c * y0 - s * x0, s * y0 + c * x0);
      ctx.lineTo(c * y1 - s * x1, s * y1 + c * x1);
    }
  }

  function paintA(ctx, r, t) {
    var eng = t / A_ENGRAVE;
    if (eng > 1) eng = 1;
    eng = Math.pow(eng, 0.8);
    var swept = TAU * eng;
    var fin = t < 0.08 ? t / 0.08 : 1;

    // Progressive, and the chalk goes first: what is left at the end is the
    // ENGRAVING, which is the thing that was cut into the ground.
    var out = clamp01(1 - (t - A_FADE_FROM) / (LIFE - A_FADE_FROM));
    var k = r.dim * fin;
    var chalkA = A_RING_ALPHA * k * out * out;
    var runeA = A_RUNE_ALPHA * k * out * Math.sqrt(out);
    var lw = r.lw;
    var tier = r.tier;

    // 1. The scribed line: doubled, because one clean circle is a range ring
    //    and two slightly disagreeing ones are chalk.
    local(ctx, r, r.ang);
    ctx.beginPath();
    arcAt(ctx, 1, 0, swept);
    arcAt(ctx, 0.955, 0.04, swept * 0.99);
    if (tier > 0) {
      for (var n = 0; n < 4; n++) {
        var na = n * (TAU / 4);
        if (na > swept) break;
        spoke(ctx, na, 0.93, 1.07);
      }
    }
    ctx.restore();
    stroke(ctx, INK_A_CHALK, chalkA, lw);

    // 2. The engraving: inner ring and runes, in green over ochre. Runes
    //    arrive as the head passes them, which is what makes it read as being
    //    cut rather than switched on.
    if (tier > 0) {
      var slots = tier < 2 ? 6 : (r.radius > 34 ? 12 : 8);
      local(ctx, r, r.ang);
      ctx.beginPath();
      arcAt(ctx, 0.62, 0, swept * 0.985);
      if (tier > 1) {
        for (var i = 0; i < slots; i++) {
          var a = (i + 0.5) * (TAU / slots);
          if (a > swept) break;
          glyph(ctx, GLYPHS[(r.seed >>> (i & 7)) & 3], a, 0.80, 0.11);
        }
      }
      ctx.restore();
      stroke(ctx, INK_A_OCHRE, runeA, lw * 0.9);

      local(ctx, r, r.ang);
      ctx.beginPath();
      arcAt(ctx, 0.585, 0.06, swept * 0.97);
      ctx.restore();
      stroke(ctx, INK_A_GREEN, runeA * 0.85, lw * 0.75);
    }

    // 3. Stone dust, thrown behind the head and settling for a quarter second
    //    after it lands. It exists for a third of the circle's life, so the
    //    only group with a real segment count is also the one that goes away.
    if (tier > 0 && t < A_ENGRAVE + A_DUST_TAIL) {
      var settle = t <= A_ENGRAVE ? 1
        : 1 - (t - A_ENGRAVE) / A_DUST_TAIL;
      var dn = tier < 2 ? 4 : 7;
      local(ctx, r, r.ang);
      ctx.beginPath();
      for (var d = 0; d < dn; d++) {
        var f = d / dn;
        var da = swept - 0.10 - f * 0.55 - ((r.seed >>> (d * 3)) & 7) * 0.012;
        if (da < 0) continue;
        var r0 = 1.0 + 0.02 + 0.16 * f;
        spoke(ctx, da, r0, r0 + 0.06 + 0.07 * (1 - f));
      }
      ctx.restore();
      stroke(ctx, INK_A_DUST, A_DUST_ALPHA * r.dim * settle * out, lw * 0.8);
    }

    // 4. The head itself, while it is still cutting. A hairline, a fifth of a
    //    radian long -- the one near-white ink on a voie A circle, and small
    //    enough that twenty of them stacked are still a spark, not a lamp.
    if (eng < 1) {
      local(ctx, r, r.ang);
      ctx.beginPath();
      arcAt(ctx, 1, Math.max(0, swept - 0.20), swept);
      ctx.restore();
      stroke(ctx, INK_A_HEAD, 0.75 * fin * r.dim, lw * 0.9);
    }
  }

  // --- voie B: hologram and grid -------------------------------------------

  function paintB(ctx, r, t) {
    var dep = t / B_DEPLOY;
    if (dep > 1) dep = 1;
    var swept = TAU * dep;

    var ret = clamp01((t - B_RETRACT_FROM) / (LIFE - B_RETRACT_FROM));
    // Three snaps in, not a smooth shrink: it is being switched off.
    var rs = ret > 0 ? 1 - 0.94 * stepUp(ret, 3) : 1;

    // "Slight glitching", and only on the way out. Deterministic from a 20 Hz
    // tick so it repeats identically at any frame rate and at any game speed
    // -- a glitch driven by Math.random per frame is just noise.
    var jump = 0, tear = 0, flick = 1;
    if (ret > 0) {
      var h = hash32((t * 20 | 0) + r.seed);
      if ((h & 3) === 0) jump = ((h >>> 2 & 1) ? 0.13 : -0.13);
      if ((h >>> 6 & 7) === 0) flick = 0.38;
      if ((h >>> 9 & 3) === 1) tear = 0.05;
    }

    var fin = t < 0.05 ? t / 0.05 : 1;
    var k = r.dim * fin * flick * (1 - ret * ret * ret);
    var lw = r.lw;
    var tier = r.tier;
    var ang = r.ang + jump;

    // 1. The structure: the outer ring, and four brackets outside it.
    local(ctx, r, ang);
    ctx.beginPath();
    arcAt(ctx, rs, 0, swept);
    if (tier > 0 && ret < 0.34) {
      for (var b = 0; b < 4; b++) {
        var ba = Math.PI / 4 + b * (TAU / 4);
        if (ba > swept) break;
        var br = 1.07 * rs;
        var c0 = Math.cos(ba - 0.13), s0 = Math.sin(ba - 0.13);
        var c1 = Math.cos(ba + 0.13), s1 = Math.sin(ba + 0.13);
        ctx.moveTo(c0 * br, s0 * br);
        ctx.lineTo(c1 * br, s1 * br);
        ctx.moveTo(c1 * br, s1 * br);
        ctx.lineTo(c1 * br * 0.92, s1 * br * 0.92);
      }
    }
    ctx.restore();
    stroke(ctx, INK_B_CYAN, B_RING_ALPHA * k, lw * 1.15);

    // 2. The grid, counter-turning at half rate. Dropped first on the way out,
    //    which is what makes the retract read as a shutdown sequence rather
    //    than a fade.
    if (tier > 0 && ret < 0.67) {
      local(ctx, r, r.ang2 + jump * 0.5);
      ctx.beginPath();
      arcAt(ctx, 0.82 * rs, 0, swept);
      arcAt(ctx, 0.58 * rs, 0.05, swept);
      if (tier > 1) arcAt(ctx, 0.34 * rs, 0.1, swept);
      var sn = tier > 1 ? 8 : 4;
      for (var s = 0; s < sn; s++) {
        var sa = s * (TAU / sn);
        if (sa > swept) break;
        spoke(ctx, sa, 0.18 * rs, 0.94 * rs);
      }
      // The machined dial. Only on circles big enough for it to be anything
      // other than a smear.
      if (tier > 1 && r.radius > 26) {
        for (var q = 0; q < 24; q++) {
          var qa = q * (TAU / 24);
          if (qa > swept) break;
          spoke(ctx, qa, 0.88 * rs, 0.96 * rs);
        }
      }
      ctx.restore();
      stroke(ctx, INK_B_GRID, B_GRID_ALPHA * k, lw * 0.8);
    }

    // 3. The wiper arm laying it down, and the tear pulling it apart. Both are
    //    hairlines and both are momentary.
    if (dep < 1) {
      local(ctx, r, r.ang);
      ctx.beginPath();
      spoke(ctx, swept, 0.12, 1.04);
      ctx.restore();
      stroke(ctx, INK_B_HOT, B_HOT_ALPHA * r.dim, lw);
    } else if (tear > 0) {
      local(ctx, r, ang);
      ctx.translate(tear, 0);
      ctx.beginPath();
      arcAt(ctx, rs, 0.5, 1.25);
      ctx.restore();
      stroke(ctx, INK_B_HOT, 0.45 * k, lw);
    }
  }

  // The B2 mark's rim. Voie B is already cyan, so there it is only the spin
  // that changes -- see the header.
  function paintRim(ctx, r, t) {
    var out = clamp01(1 - (t - A_FADE_FROM) / (LIFE - A_FADE_FROM));
    local(ctx, r, -r.ang * 0.6);
    ctx.beginPath();
    arcAt(ctx, 1.075, 0, TAU);
    ctx.restore();
    stroke(ctx, INK_RIM, RIM_ALPHA * r.dim * out, r.lw * 0.7);
  }

  // --- the frame ------------------------------------------------------------

  // TWO CALL SHAPES, because the sibling FX modules in this pass are wired
  // through a bound api object and a lone `draw(ctx, project, state)` in the
  // middle of that would be the odd one out:
  //
  //   BlubFXCircles.bind({ project: project, withGround: withGround,
  //                        groundHeightAt: groundHeightAt });
  //   BlubFXCircles.draw(ctx, state);
  //
  //   BlubFXCircles.draw(ctx, project, state, withGround);   // equivalent
  //
  // project    gl-world's own `project(x, y, z)` -- z is a height ABOVE the
  //            surface, and it already carries the board's ground height
  // state      the render state drawOverlays is handed (towers, dt)
  // withGround gl-world's `withGround(z, fn)`, optional: when present the
  //            circle's basis is pinned to one surface height so it stays a
  //            clean ellipse beside a raised deck
  var bound = null;

  function bind(api) { bound = api || null; }

  function draw(ctx, a, b, c) {
    var project, state, withGround;
    if (typeof a === "function") {
      project = a; state = b; withGround = c;
    } else {
      state = a;
      project = bound && bound.project;
      withGround = bound && bound.withGround;
    }
    if (!supported || !ctx || typeof project !== "function") return;

    beat(state && state.dt);

    var list = (state && state.towers) ||
      ((typeof towers !== "undefined") ? towers : null);
    if (list) harvest(list);

    sweep();
    if (!records.length) return;
    meter();

    _proj = project;
    var vw = (typeof VIEW_WIDTH === "number") ? VIEW_WIDTH : 1e6;
    var vh = (typeof VIEW_HEIGHT === "number") ? VIEW_HEIGHT : 1e6;
    var ground = (bound && bound.groundHeightAt) ||
      ((typeof World3D !== "undefined" && World3D.groundHeightAt)
        ? World3D.groundHeightAt : null);
    var budget = SEG_BUDGET;
    var drawn = 0;
    var i, r, t;

    // Pass 1 -- project, cull, and hand out detail. NEWEST FIRST, so a budget
    // that runs out costs the oldest circles their runes and never the one the
    // player is actually being told about.
    for (i = records.length - 1; i >= 0; i--) {
      r = records[i];
      r.vis = false;
      if (drawn >= MAX_DRAWN) continue;      // and not even projected
      _px = r.x; _py = r.y; _pr = r.radius;
      if (withGround && ground) withGround(ground(r.x, r.y), basis);
      else basis();
      if (!_ok) continue;

      var rpx = Math.max(Math.sqrt(_ax * _ax + _ay * _ay),
                         Math.sqrt(_bx * _bx + _by * _by));
      if (rpx < 3) continue;                                  // unreadable
      if (_cx < -rpx - 8 || _cx > vw + rpx + 8) continue;     // off screen
      if (_cy < -rpx - 8 || _cy > vh + rpx + 8) continue;

      var tier = rpx < 9 ? 0 : ((rpx < 20 || r.crowd > 5) ? 1 : 2);
      if (budget <= 0) tier = 0;
      budget -= TIER_COST[tier];

      r.tier = tier;
      r.vis = true;
      drawn++;
      r.cx = _cx; r.cy = _cy;
      r.ax = _ax; r.ay = _ay;
      r.bx = _bx; r.by = _by;
      // A chalk line has a real width on the ground, so it thins with the
      // camera -- which also means a zoomed-out board draws less ink, exactly
      // when there is most of it on screen.
      var lw = 1.45 * _cs;
      r.lw = lw < 0.6 ? 0.6 : (lw > 2.6 ? 2.6 : lw);

      t = clock - r.born;
      if (r.voie) {
        var rate = B_SPIN * (r.accent ? ACCENT_SPIN : 1);
        r.ang = r.spin0 + Math.floor(t * rate * B_STEPS) / B_STEPS * TAU;
        r.ang2 = r.spin0 * 0.5 - r.ang * 0.5;
      } else {
        var sp = A_SPIN * (r.accent ? ACCENT_SPIN : 1);
        // Slow, and never quite steady: two cheap sines are enough to keep a
        // hand-cut ring from looking motorised.
        r.ang = r.spin0 + sp * t
          + 0.055 * Math.sin(2.1 * t + r.spin0)
          + 0.028 * Math.sin(4.7 * t + r.spin0 * 1.7);
        r.ang2 = r.ang;
      }
    }

    // Pass 2 -- paint, OLDEST FIRST, so the newest circle lands on top of the
    // stack it just joined.
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Stated rather than assumed: this whole file's readability argument rests
    // on the stack converging to the ink instead of climbing past it.
    ctx.globalCompositeOperation = "source-over";
    for (i = 0; i < records.length; i++) {
      r = records[i];
      if (!r.vis) continue;
      t = clock - r.born;
      if (t < 0) continue;
      if (r.voie) paintB(ctx, r, t); else paintA(ctx, r, t);
      if (r.accent && !r.voie && r.tier > 0) paintRim(ctx, r, t);
    }
    ctx.restore();
    _proj = null;
  }

  // --- the descent ----------------------------------------------------------
  //
  // "The unit DESCENDS INTO the circle, it does not fall into it." So this is
  // a smootherstep, gentle at both ends, and it is a HEIGHT ABOVE THE SURFACE
  // -- the caller adds it to the lift it already computed from the height
  // field, and nothing here needs to know what the ground is doing.
  //
  // Returns 0 for anything that is not a live summon mid-arrival, so the call
  // site is one unconditional addition.
  function descentLift(blub) {
    if (!supported || !blub || blub.isSummon !== true) return 0;
    beat(0);
    var r = byBlub.get(blub);
    if (!r) {
      // Seen already means its circle is over (or was primed away): it is
      // standing. Never seen means it was summoned this very step and the
      // harvest in draw() has not run yet -- it is at the top of its descent,
      // which is the honest answer for this frame.
      //
      // THE TWO GUARDS ARE BOTH ABOUT A ONE-FRAME POP. `drawWorld` runs before
      // `drawOverlays`, so this is asked about a body the harvest has not
      // classified yet, and answering optimistically for something that is
      // never going to get a circle stands it in mid-air for exactly one frame
      // before it snaps back down. `eligible` covers the fused monster blub;
      // the counter covers a scene load, where a whole fleet appears at once
      // and the harvest is about to prime it away -- past a dozen askers in
      // one frame this stops guessing and lets them stand.
      if (!armed || seen.has(blub) || !eligible(blub)) return 0;
      if (optimistic >= BURST_PRIME) return 0;
      optimistic++;
      return liftOf(blub);
    }
    var d = r.voie ? B_DESCENT : A_DESCENT;
    var u = (clock - r.born) / d;
    if (u >= 1) return 0;
    if (u < 0) u = 0;
    return r.lift * (1 - smoother(u));
  }

  // 0 while it is still coming down, 1 once it has landed. For anything that
  // wants to drive a glow or a squash off the same arrival.
  function descentProgress(blub) {
    if (!supported || !blub) return 1;
    var r = byBlub.get(blub);
    if (!r) return 1;
    var d = r.voie ? B_DESCENT : A_DESCENT;
    return clamp01((clock - r.born) / d);
  }

  return {
    bind: bind,
    draw: draw,
    descentLift: descentLift,
    descentProgress: descentProgress,
    // Force a circle under a body this module would not have chosen itself --
    // the fused creature's emergence, a scripted showcase, a review harness.
    spawnFor: function (blub) {
      if (!supported || !blub) return false;
      beat(0);
      armed = true;
      return !!spawnFor(blub);
    },
    reset: reset,
    LIFE: LIFE,
    // Read-only counters for the perf pass: how many are alive, and how many
    // of them are being drawn at full detail.
    stats: function () {
      var full = 0, vis = 0;
      for (var i = 0; i < records.length; i++) {
        if (!records[i].vis) continue;
        vis++;
        if (records[i].tier > 1) full++;
      }
      return { active: records.length, visible: vis, full: full, clock: clock };
    }
  };
})();
