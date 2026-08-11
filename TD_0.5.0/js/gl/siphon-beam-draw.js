// ---------------------------------------------------------------------------
// SiphonFXBeam -- THE SIPHON'S BEAM. The thing that was invisible.
//
// WHY IT WAS INVISIBLE, established before any of this was written:
//
//   1. The only code that has ever drawn a Siphon beam is the 2D canvas block
//      in js/towers/beam-adapter.js (BeamTower.prototype.draw, the loop
//      commented "--- the beams. One per locked target"). In 3D that method is
//      NEVER CALLED. game.js:3011 -- `actors[i].actor.draw(ctx)` -- sits inside
//      the 2D world layer, which closes at game.js:3040 with the comment
//      "end of the 2D world layer -- see the 3D branch above". The 3D branch
//      hands the board to GLWorld, which draws towers itself (gl-world.js:908,
//      `drawActor(model, t.x + kx, ...)`) and never asks a tower to paint.
//
//   2. gl-world.js contains no Siphon beam code at all. Every occurrence of
//      "siphon" in that file is the body picker (`siphonGroup`, :377), the
//      authored-front regex (:452), `towerModel` (:473) and two comments.
//      Nothing there reads `tower.locks`.
//
//   3. js/gl/siphon-beam-spec.js is loaded (index.html:166) and `SiphonBeamSpec`
//      is referenced by NOTHING outside its own file.
//
//   4. The eight meshes siphon-beam-{thread,ramp,saturated,seeking,gold,column,
//      tendon,chain} are loaded (index.html:261-268) and register themselves
//      with GLModels, but no call site anywhere passes one of those names to
//      `drawActor` or `GLModels.get`.
//
//   So the beam was authored twice over -- a spec and eight reference meshes --
//   and then never wired to anything. It is not dim, occluded or mis-coloured.
//   Nothing draws it. Verified in game: a Siphon holding a lock and visibly
//   draining HP (4000 -> 3987) rendered with empty air between its hands and
//   the enemy, at 1278x719.
//
// WHY THIS IS PROCEDURAL AND NOT THE EIGHT MESHES. The spec says so itself, in
// its own header: "The meshes ... are the REFERENCE BUILD of this spec at a
// 60 u.l. run; this file is what drives a beam between two points that are
// MOVING." A baked mesh cannot serve: `drawActor` offers yaw plus a UNIFORM
// scale, so it can neither stretch a 60 u.l. cord to the 8..78 px run a real
// lock asks for, nor tilt it from a tower standing on a raised deck down to an
// enemy on the road. The meshes stay what they are -- the reference this file
// is measured against. Every number below is read from SiphonBeamSpec.
//
// THE ONE MESSAGE: IT FLOWS TOWARD THE TOWER. Carried four ways, all of them
// in the matter, never as a glyph (`SiphonBeamSpec.forbidden` bans arrows,
// icons and interface indicators, and nothing here draws one):
//
//   GROW     the cord is measurably fatter at the tower end -- r(t) is the
//            spec's own law, and the knots on it grow the same way.
//   SCROLL   the knots travel target -> tower, and ACCELERATE as they close on
//            it. That is the strongest of the four: matter speeding up as it
//            nears a point reads as being drawn in, not thrown out. It comes
//            out of the spec's scroll law for free (see FLOW COORDINATE).
//   CHEVRON  every knot is a wedge, and its point faces the tower.
//   SPOUT    the tower end opens into an intake bell; the enemy end is BLUNT,
//            cut flat, with nothing pointing outward anywhere.
//
// NO ATTACK PULSE. This file holds no hook into the damage pipeline and never
// reads a fire timer -- `sinceShot`, `gearPhase` and the damage tick are all
// deliberately untouched, because at this fire rate separate impacts read as
// flicker. The only events that may show are TRANSFERS (gold banked, HP
// returned), and only for the states whose spec entry says `pulses: transfer
// only`.
//
// PRESENTATION ONLY. Nothing here is written back into the simulation and no
// property is added to a tower or an enemy. The module reads `locks` /
// `visibleLocks()`, `core.purchased`, `core.stats`, `ramp.multiplier()`,
// `hpHealed` and `goldGenerated` -- all read-only -- and keeps every byte of
// its own state in its own Map, keyed by tower and pruned when the tower goes.
//
// ---------------------------------------------------------------------------
// WHERE gl-world.js MUST CALL THIS  (this file changes nothing else)
// ---------------------------------------------------------------------------
//
// 1. index.html, beside the other js/gl effect modules -- after gl-world.js and
//    AFTER siphon-beam-spec.js, whose table it reads at call time:
//
//        <script src="js/gl/siphon-beam-draw.js"></script>
//
// 2. js/gl/gl-world.js, in `drawOverlays`, at the END of the tower-hardware
//    pass and immediately BEFORE `drawShots`. The beam is hardware -- it is on
//    screen permanently while a lock is held -- so it belongs in the layer the
//    file's own comment reserves for hardware ("Tower hardware lighting up,
//    then the shots, then the cosmetic burst"), under the shots and under the
//    cosmetic burst. The surrounding lines are, verbatim (gl-world.js:1629-1632):
//
//              }
//            }
//          }
//          drawShots(ctx, state);
//
//    where the first `}` closes the recruit loop, the second closes
//    `if (fxId === "soldier")` and the third closes
//    `for (i = 0; i < state.towers.length; i++)`. Insert BETWEEN the third `}`
//    and `drawShots(ctx, state);`:
//
//        // THE SIPHON'S BEAM (js/gl/siphon-beam-draw.js). Hardware, not a
//        // shot: it is continuous while a lock is held, so it draws with the
//        // hardware pass, under the shots and under the cosmetic burst.
//        if (typeof SiphonFXBeam !== "undefined") {
//          SiphonFXBeam.draw(ctx, state, BLUB_FX_API);
//        }
//
//    AT TOP LEVEL, OUTSIDE the tower loop's `withGround(...)`, and that is not
//    a detail. A beam spans TWO ground heights -- the deck the tower stands on
//    and the road the enemy walks -- so it pins its own reference by calling
//    `api.withGround(0, ...)` internally and then feeding `project` ABSOLUTE
//    heights. That is the same rule gl-world.js:1176-1187 states for a shot in
//    flight: one owner, one pinned reference, a straight line angled between
//    the height it left and the height it is going to. Called from inside the
//    per-tower `withGround` it would instead flatten every beam onto the
//    tower's own deck and the far end would float.
//
// 3. OPTIONAL, in `ensureMap()` beside the other reset()s -- a new board keeps
//    no old transfer boluses. Skipping it costs at most a few stale records
//    that the draw pass prunes on its next pass anyway:
//
//        if (typeof SiphonFXBeam !== "undefined") SiphonFXBeam.reset();
//
// 4. Nothing else. There is no update() to schedule: the module's only state is
//    a scroll phase driven by `state.now` (so a paused game freezes the beam,
//    which is correct) and a short list of transfer boluses.
//
// ---------------------------------------------------------------------------
// PERFORMANCE -- OVERDRAW is the axis, per visual-pass/PERF.md
// ---------------------------------------------------------------------------
//
// A beam is at most 78 board px long (the tower's range) and a few px wide, so
// the fill area is tiny -- a maxed Siphon's cord covers roughly 900 px^2, one
// eight-hundredth of a 720p frame. The costs that would actually matter are
// per-frame ALLOCATION and per-frame STRING BUILDING, and neither happens:
//
//   * every sample buffer is a module-level typed-ish scratch array, grown
//     once and reused for every beam of every frame;
//   * every colour is a pre-built `rgba()` string from a 25-step alpha table
//     (`ink`), built lazily per colour and cached forever;
//   * the flow tables (the arc-length warp that makes the scroll accelerate)
//     are built once per distinct scroll law and cached -- eight of them, ever;
//   * no gradients, no shadowBlur, no filters, no per-frame closures.
//
// Per beam that is ~18 `project` calls and 4-6 fills. Six beams on screen is
// about a hundred projections a frame, against the ~180 a single Summoner vein
// pays, and the projections are the whole cost.
// ---------------------------------------------------------------------------

var SiphonFXBeam = (function () {
  "use strict";

  var VERSION = "1.0";

  // The spec is the source of truth for every number in this file. It is read
  // at CALL time, not at load time, so script order cannot silently produce a
  // beam built out of fallbacks.
  function spec() {
    return (typeof SiphonBeamSpec !== "undefined") ? SiphonBeamSpec : null;
  }

  // ---- small maths ---------------------------------------------------------

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // ---- colour --------------------------------------------------------------
  //
  // Quantised alpha, cached strings. 25 steps is finer than the eye resolves on
  // a translucent overlay and it means a beam allocates no strings at all once
  // it has been on screen for one frame.

  var ALPHA_STEPS = 24;
  var inkCache = Object.create(null);

  function rgbOf(hex) {
    var h = hex.charAt(0) === "#" ? hex.slice(1) : hex;
    return [parseInt(h.slice(0, 2), 16),
            parseInt(h.slice(2, 4), 16),
            parseInt(h.slice(4, 6), 16)];
  }

  // `key` is a palette name; `lift` brightens toward white without inventing a
  // new palette entry (used for the core, which is the same material catching
  // more light, not a different substance).
  function inkTable(key, lift) {
    var id = key + "|" + lift;
    var got = inkCache[id];
    if (got) return got;
    var sp = spec();
    var entry = sp && sp.palette && sp.palette[key];
    var rgb = rgbOf(entry ? entry.hex : "#B08A66");
    if (lift) {
      rgb = [Math.round(lerp(rgb[0], 255, lift)),
             Math.round(lerp(rgb[1], 255, lift)),
             Math.round(lerp(rgb[2], 255, lift))];
    }
    var head = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",";
    var table = new Array(ALPHA_STEPS + 1);
    for (var i = 0; i <= ALPHA_STEPS; i++) {
      table[i] = head + (i / ALPHA_STEPS).toFixed(3) + ")";
    }
    inkCache[id] = table;
    return table;
  }

  function ink(key, lift, alpha) {
    var t = inkTable(key, lift || 0);
    return t[clamp(Math.round(alpha * ALPHA_STEPS), 0, ALPHA_STEPS)];
  }

  // ---- what the tower is ---------------------------------------------------

  function tiers(tower) {
    var p = tower && tower.core && tower.core.purchased;
    return { a: (p && p.A) || 0, b: (p && p.B) || 0 };
  }

  // The origin follows the TIER, never the state -- SiphonBeamSpec.originByTier
  // says so in as many words, and states like `ramp` exist on both sides of A3.
  // A3/A4/A5 pour from the RING; base, A1, A2 and the whole of path B pour from
  // the HANDS.
  function originPoint(tower) {
    var sp = spec();
    var o = sp && sp.origins;
    var hands = (o && o.HANDS) || [0.055, 0.305, 1.045];
    var ring = (o && o.RING) || [0.315, 0.395, 1.190];
    return tiers(tower).a >= 3 ? ring : hands;
  }

  // How far the per-target ramp has climbed, 0..1. This is the ONE continuously
  // varying quantity the spec admits ("rampT is the lock timer") and it is read
  // straight off the simulation's own tracker rather than timed here, so the
  // cord cannot disagree with the damage.
  function rampOf(tower, target) {
    var st = tower.core && tower.core.stats;
    var mech = st && st.mechanics && st.mechanics.ramp_per_target;
    var cap = mech ? (mech.rampCap || 0) : 0;
    if (cap <= 0 || !tower.ramp || typeof tower.ramp.multiplier !== "function") {
      return 0;
    }
    var m = tower.ramp.multiplier(target);
    return isFinite(m) ? clamp((m - 1) / cap, 0, 1) : 0;
  }

  // Which of the eight states this tower is in. Grounded in the simulation, not
  // in a cosmetic timer:
  //
  //   no lock            -> seeking   (the spec's detached, groping state)
  //   A5                 -> column
  //   A3 / A4            -> gold
  //   B3+ , >1 lock      -> chain     (it bounces; it does not fork -- see below)
  //   B3+ , one lock     -> tendon
  //   otherwise          -> the base ladder: thread -> ramp -> saturated, whose
  //                         position is rampT. At base rampCap is 0, so rampT
  //                         never leaves 0 and the cord stays `thread` -- which
  //                         is exactly what the spec means by tagging thread
  //                         `path: BASE` and ramp/saturated `path: A`.
  function stateFor(tower, lockCount, ramp) {
    var t = tiers(tower);
    if (lockCount <= 0) return "seeking";
    if (t.a >= 5) return "column";
    if (t.a >= 3) return "gold";
    if (t.b >= 3) return lockCount > 1 ? "chain" : "tendon";
    if (ramp >= 0.78) return "saturated";
    if (ramp >= 0.30) return "ramp";
    return "thread";
  }

  // ---- the flow coordinate -------------------------------------------------
  //
  // THIS IS THE MECHANISM THAT MAKES THE BEAM READ AS FLOWING INWARD, so it is
  // worth stating plainly.
  //
  // Every state's spec gives a scroll law, speed(t) = base*(1 + gain*(1-t)^p),
  // and every one of them is FASTER near the tower (t = 0). If knots were laid
  // out uniformly in t and marched uniformly in t, that law would be decoration
  // -- the knots would crawl at one speed and the only inward cue left would be
  // the taper.
  //
  // Instead each knot carries a flow coordinate C, and C -- not t -- is what
  // advances linearly with time. C is the time-of-travel integral
  //
  //     C(t) = INT_t^1 dt' / speed(t')   , normalised so C(1)=0 and C(0)=1
  //
  // so a knot at C moves through t at exactly the local speed the spec asks
  // for. Near the target it inches; as it closes on the tower it visibly picks
  // up and is swallowed. Matter accelerating into a point is the single most
  // unambiguous way to say "this is being drawn in", and it costs one table
  // lookup: the table depends only on (base, gain, p), so there are eight of
  // them for the whole game and they are built once.
  //
  // C is also what the transfer boluses ride, which is why a bolus accelerates
  // toward the tower for free.

  var FLOW_N = 40;
  var flowCache = Object.create(null);

  function flowTable(base, gain, p) {
    var id = base + "|" + gain + "|" + p;
    var got = flowCache[id];
    if (got) return got;
    // C[i] at t = i/FLOW_N, integrated from t = 1 downward.
    var C = new Float64Array(FLOW_N + 1);
    var acc = 0, dt = 1 / FLOW_N;
    C[FLOW_N] = 0;
    for (var i = FLOW_N - 1; i >= 0; i--) {
      var tm = (i + 0.5) / FLOW_N;
      var v = base * (1 + gain * Math.pow(1 - tm, p));
      acc += dt / Math.max(0.02, v);
      C[i] = acc;
    }
    var total = acc || 1;
    for (var j = 0; j <= FLOW_N; j++) C[j] /= total;
    var table = { C: C };
    flowCache[id] = table;
    return table;
  }

  // C -> t. C is monotone decreasing in i, so walk it.
  function flowInverse(table, c) {
    var C = table.C;
    c = c - Math.floor(c);
    // C[0] = 1 (tower), C[FLOW_N] = 0 (target).
    for (var i = 0; i < FLOW_N; i++) {
      if (C[i] >= c && c >= C[i + 1]) {
        var span = C[i] - C[i + 1];
        var f = span > 1e-9 ? (C[i] - c) / span : 0;
        return (i + f) / FLOW_N;
      }
    }
    return 1;
  }

  function flowAt(table, t) {
    var x = clamp(t, 0, 1) * FLOW_N;
    var i = Math.min(FLOW_N - 1, Math.floor(x));
    return lerp(table.C[i], table.C[i + 1], x - i);
  }

  // ---- the states, resolved from the spec ---------------------------------
  //
  // The spec stores radius as a FORMULA STRING plus its numbers, because a JSON
  // file cannot store a branch. The branch lives here, keyed by state name, and
  // every number it uses is still read out of the spec.

  function stateSpec(name) {
    var sp = spec();
    return (sp && sp.states && sp.states[name]) || null;
  }

  // Blender units at parameter t, before the intake bell.
  function radiusAt(name, ss, t, ramp) {
    var r = ss.radius || {};
    var inward = 1 - t;
    if (name === "saturated" || name === "column") {
      // STEPPED. Drums that step wider inward -- the spec's own formula.
      var drums = r.drums || 4;
      var step = Math.min(drums - 1, Math.floor(inward * drums));
      return lerp(r.r_target, r.r_tower, drums > 1 ? step / (drums - 1) : 0);
    }
    if (name === "ramp") {
      // The one continuously-varying state. The spec hands over both ends of
      // the interpolation in `rampT_ends`, and they are exactly thread's and
      // saturated's radii -- so the base ladder never steps, it swells.
      var ends = r.rampT_ends || { "0.0": [0.018, 0.04], "1.0": [0.0455, 0.083] };
      var lo = ends["0.0"], hi = ends["1.0"];
      var rt = lerp(lo[0], hi[0], ramp), rw = lerp(lo[1], hi[1], ramp);
      return rt + (rw - rt) * Math.pow(inward, r.p || 1.4);
    }
    return (r.r_target || 0.02) +
      ((r.r_tower || 0.04) - (r.r_target || 0.02)) * Math.pow(inward, r.p || 1.35);
  }

  // THE INTAKE. The tower end opens; the enemy end does not. `spout` is one of
  // the spec's four permitted flow cues and the states that list it get the
  // full flare the reference meshes were built with (thread's flowReads: "the
  // body swells 2.2x into a flared intake"). The two that do not still swell --
  // a mouth is a mouth -- but only a quarter as much.
  function bellAt(ss, t) {
    var cues = ss.flowCues || [];
    var full = cues.indexOf("spout") >= 0;
    var peak = full ? 2.2 : 1.28;
    // Confined to the last eighth so it reads as a mouth on the cord rather
    // than as a cone, which would point the wrong way.
    return 1 + (peak - 1) * smoothstep(0.14, 0.0, t);
  }

  // Which palette entry plays which role. Every key below is a real entry in
  // SiphonBeamSpec.palette and every one is drawn from that state's own `mats`
  // list, so a state cannot be painted in a colour its spec does not own.
  var ROLES = {
    thread:    { body: "cloth_worn",  core: "skin",       bead: "hem_fray",  rim: "cloth_dark",  glow: null },
    ramp:      { body: "brass",       core: "amber",      bead: "amber",     rim: "gold_dark",   glow: "amber" },
    saturated: { body: "gold_dark",   core: "white_warm", bead: "amber",     rim: "ochre_cloth", glow: "amber" },
    seeking:   { body: "cloth_worn",  core: "hem_fray",   bead: "hem_fray",  rim: "cloth_dark",  glow: null },
    gold:      { body: "gold",        core: "white_warm", bead: "gold",      rim: "gold_dark",   glow: "amber" },
    column:    { body: "gold",        core: "white_warm", bead: "gold",      rim: "purple_rich", glow: "white_warm" },
    tendon:    { body: "tendon",      core: "rose_sick",  bead: "oil_black", rim: "oil_black",   glow: "rose_sick" },
    chain:     { body: "membrane",    core: "rose_sick",  bead: "rose_dim",  rim: "oil_black",   glow: "rose_sick" }
  };

  // How the knots are drawn. `wedge` is the chevron; `box` is gold's cast
  // grain; `constriction` is the tendon's peristaltic pinch, which is a band
  // ACROSS the cord rather than a point along it -- its direction comes from
  // travelling inward and from each being larger than the one behind it.
  var BEAD_SHAPE = {
    thread: "wedge", ramp: "wedge", saturated: "wedge", seeking: "wedge",
    gold: "box", column: "wedge", tendon: "constriction", chain: "wedge"
  };

  // ---- scratch -------------------------------------------------------------
  //
  // Grown once, reused for every beam of every frame. A beam samples at most
  // MAXS points; a chain concatenates its segments into the same buffers.

  var MAXS = 96;
  var sx = new Float64Array(MAXS), sy = new Float64Array(MAXS);
  var ss = new Float64Array(MAXS);          // projected px-per-world-px
  var st = new Float64Array(MAXS);          // parameter t, 0 at tower
  var nx = new Float64Array(MAXS), ny = new Float64Array(MAXS);   // screen normal
  var hw = new Float64Array(MAXS);          // screen half-width
  var cc = new Float64Array(MAXS);          // flow coordinate
  var seg = new Int32Array(MAXS);           // chain segment index
  var nS = 0;

  // ---- per-tower records ---------------------------------------------------

  var records = (typeof Map !== "undefined") ? new Map() : null;
  var seen = 0;

  function recordFor(tower) {
    if (!records) return null;
    var r = records.get(tower);
    if (!r) {
      r = { hp: tower.hpHealed || 0, gold: tower.goldGenerated || 0,
            pulses: [], now: 0, mark: 0 };
      records.set(tower, r);
    }
    r.mark = seen;
    return r;
  }

  function prune() {
    if (!records) return;
    records.forEach(function (r, t) {
      if (r.mark !== seen) records.delete(t);
    });
  }

  function reset() { if (records) records.clear(); }

  // ---- geometry ------------------------------------------------------------

  var SIPHON_YAW = -Math.PI / 2;   // gl-world's authoredFrontOffset for /^siphon-/

  function unitsToPx() {
    if (typeof GLModels !== "undefined" && GLModels.unitsToPx) {
      var k = GLModels.unitsToPx("siphon-base");
      if (k && k > 1.5) return k;
    }
    var sp = spec();
    return (sp && sp.unitsToPx) || 31.8032;
  }

  // Board px per u.l., for scaling the spec's bead counts (which are quoted at
  // a 60 u.l. run) to the run this beam actually has.
  function pxPerUl() {
    if (typeof ul === "function") {
      var v = ul(1);
      if (isFinite(v) && v > 0.01) return v;
    }
    return 1;
  }

  // The origin, in ABSOLUTE world coordinates. This reproduces by hand the
  // transform drawActor used on the body (gl-world.js:908) -- the same yaw, the
  // same uniform scale, the same ground -- which is the only thing that keeps
  // the cord welded to the hands instead of hanging near them. The yaw includes
  // gl-world's authored-front correction because every siphon-* model is
  // authored with front on +Y.
  var originScratch = { x: 0, y: 0, z: 0 };

  function originWorld(tower, groundAt) {
    var p = originPoint(tower);
    var aim = (typeof tower.aim === "number" && isFinite(tower.aim)) ? tower.aim : 0;
    var yaw = aim + SIPHON_YAW;
    var k = unitsToPx(), c = Math.cos(yaw), s = Math.sin(yaw);
    originScratch.x = tower.x + (c * p[0] - s * p[1]) * k;
    originScratch.y = tower.y + (s * p[0] + c * p[1]) * k;
    originScratch.z = groundAt(tower.x, tower.y) + p[2] * k;
    return originScratch;
  }

  // Where the cord bites. Chest height on the body, from the enemy's own
  // radius, so it scales with a brute and with a fractal split alike.
  function biteHeight(enemy) {
    var r = (enemy && typeof enemy.radiusPx === "function") ? enemy.radiusPx() : 11;
    return r * 1.35;
  }

  // ---- sampling ------------------------------------------------------------
  //
  // One run, tower -> target, laid down into the scratch buffers. Returns false
  // if any sample failed to project (behind the camera), because half a beam is
  // worse than none.

  function sampleRun(project, ax, ay, az, bx, by, bz, curve, phase,
                     i0, n, tFrom, tTo, segIndex) {
    var dx = bx - ax, dy = by - ay;
    var flat = Math.sqrt(dx * dx + dy * dy) || 1;
    // Horizontal normal, for sway and kink.
    var px = -dy / flat, py = dx / flat;
    var sag = curve.sag || 0, sway = curve.sway || 0;
    var kink = curve.kink || 0, kn = curve.kink_n || 3;

    for (var i = 0; i < n; i++) {
      var u = n > 1 ? i / (n - 1) : 0;
      var t = lerp(tFrom, tTo, u);
      // `arc` peaks mid-run and is zero at both ends, so neither the hands nor
      // the bite can be pulled off the thing they are attached to.
      var arc = Math.sin(u * Math.PI);
      var wob = kink ? Math.sin(u * kn * Math.PI + phase) * arc : 0;
      var ox = (sway * arc + kink * wob) * flat;
      var wx = lerp(ax, bx, u) + px * ox;
      var wy = lerp(ay, by, u) + py * ox;
      // sag pulls DOWN; column's negative sag therefore arches, as its spec
      // note demands ("it ARCHES: a column carries load").
      var wz = lerp(az, bz, u) - sag * arc * flat;
      var p = project(wx, wy, wz);
      if (!p) return false;
      var k = i0 + i;
      sx[k] = p.x; sy[k] = p.y; ss[k] = p.scale;
      st[k] = t; seg[k] = segIndex;
    }
    return true;
  }

  // Screen-space normals from the projected polyline. Derived from the PROJECTED
  // points, not from the world direction, for the reason gl-world's `barrelAxis`
  // gives: under a turning camera the cord's direction on screen is not its
  // direction in the world.
  function normals(n) {
    for (var i = 0; i < n; i++) {
      var a = i > 0 ? i - 1 : i;
      var b = i < n - 1 ? i + 1 : i;
      var dx = sx[b] - sx[a], dy = sy[b] - sy[a];
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-6) { nx[i] = 0; ny[i] = -1; continue; }
      nx[i] = -dy / len; ny[i] = dx / len;
    }
  }

  // ---- ribbon --------------------------------------------------------------

  function ribbon(ctx, i0, i1, mul) {
    ctx.beginPath();
    var i;
    for (i = i0; i <= i1; i++) {
      var x = sx[i] + nx[i] * hw[i] * mul, y = sy[i] + ny[i] * hw[i] * mul;
      if (i === i0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (i = i1; i >= i0; i--) {
      ctx.lineTo(sx[i] - nx[i] * hw[i] * mul, sy[i] - ny[i] * hw[i] * mul);
    }
    ctx.closePath();
  }

  // ---- knots ---------------------------------------------------------------
  //
  // Position by flow coordinate, size by the radius law, orientation by the
  // screen tangent. All three say the same thing.

  function sampleIndexAt(n, t) {
    // st[] runs tFrom -> tTo monotonically per segment; for a single run that
    // is 0 -> 1 across the whole buffer.
    var lo = 0, hi = n - 1;
    if (t <= st[0]) return 0;
    if (t >= st[n - 1]) return n - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (st[mid] <= t) lo = mid; else hi = mid;
    }
    var span = st[hi] - st[lo];
    return lo + (span > 1e-9 ? (t - st[lo]) / span : 0);
  }

  function beadAt(n, t, out) {
    var f = sampleIndexAt(n, t);
    var i = Math.min(n - 2, Math.floor(f)), g = f - i;
    out.x = lerp(sx[i], sx[i + 1], g);
    out.y = lerp(sy[i], sy[i + 1], g);
    out.nx = lerp(nx[i], nx[i + 1], g);
    out.ny = lerp(ny[i], ny[i + 1], g);
    out.hw = lerp(hw[i], hw[i + 1], g);
    out.scale = lerp(ss[i], ss[i + 1], g);
    // Tangent pointing TOWARD THE TOWER, i.e. toward decreasing t. sx[0] is the
    // tower end, so that is the direction of decreasing index.
    var tx = sx[i] - sx[i + 1], ty = sy[i] - sy[i + 1];
    var len = Math.sqrt(tx * tx + ty * ty) || 1;
    out.tx = tx / len; out.ty = ty / len;
    return out;
  }

  var bead = { x: 0, y: 0, nx: 0, ny: 0, tx: 0, ty: 0, hw: 0, scale: 1 };

  // ---- one beam ------------------------------------------------------------

  var MIN_CORE_PX = 1.15;   // a thread must still be a thing you can see
  var MIN_BODY_PX = 2.10;

  function drawBeam(ctx, api, tower, name, ramp, nodes, now, rec) {
    var ss2 = stateSpec(name);
    if (!ss2) return;
    var project = api.project, groundAt = api.groundAt;
    var role = ROLES[name] || ROLES.thread;
    var curve = ss2.curve || {};
    var scroll = ss2.scroll || { base: 0.5, gain: 0.5, p: 1 };
    var flow = flowTable(scroll.base || 0.5, scroll.gain || 0, scroll.p || 1);

    // ---- lay the run(s) down ----------------------------------------------
    var segs = nodes.length - 1;
    var per = clamp(Math.round((ss2.sections || 14) / (segs > 1 ? 1.4 : 1)), 8, 22);
    var n = 0;
    var kink = curve.kink || 0;
    var phase = now * 1.1;
    for (var s = 0; s < segs; s++) {
      var a = nodes[s], b = nodes[s + 1];
      // Each segment owns its slice of the global t. t = 0 at the tower and
      // t = 1 at the LAST node, so the flow law and the knots run continuously
      // along the whole chain -- the spec's "arc-length along the whole chain,
      // target -> tower".
      var tA = s / segs, tB = (s + 1) / segs;
      var cs = {
        sag: pickSeg(curve.sag, s), sway: pickSeg(curve.sway, s),
        kink: kink, kink_n: curve.kink_n
      };
      var take = (s === 0) ? per : per - 1;
      var from = (s === 0) ? tA : lerp(tA, tB, 1 / (per - 1));
      if (n + take > MAXS) break;
      if (!sampleRun(project, a.x, a.y, a.z, b.x, b.y, b.z, cs, phase,
                     n, take, from, tB, s)) return;
      n += take;
    }
    if (n < 2) return;
    nS = n;
    normals(n);

    // ---- widths ------------------------------------------------------------
    var k = unitsToPx();
    var boluses = rec ? rec.pulses : null;
    var i;
    for (i = 0; i < n; i++) {
      var t = st[i];
      var r;
      if (name === "chain") {
        r = chainRadius(ss2, seg[i], segs, st[i], per, n, i);
      } else {
        r = radiusAt(name, ss2, t, ramp);
      }
      r *= bellAt(ss2, t);
      cc[i] = flowAt(flow, t);
      // TRANSFER PULSES. A local swelling riding the same flow coordinate the
      // knots ride, so it accelerates toward the tower exactly as they do. This
      // is the ONLY event this file draws, and only for the states whose spec
      // says `pulses: transfer only`.
      if (boluses) {
        for (var q = 0; q < boluses.length; q++) {
          var d = (cc[i] - boluses[q].c) / 0.13;
          if (d > -3 && d < 3) r *= 1 + 0.85 * boluses[q].a * Math.exp(-d * d);
        }
      }
      hw[i] = r * k * ss[i];
    }
    // Legibility floor. The ladder is RELATIVE -- thread is still the thinnest
    // cord in the game and column still the fattest -- but a cord that lands
    // under a pixel is the bug this file exists to fix, so the tower end is not
    // allowed below MIN_BODY_PX. Applied as a single scale on the whole cord so
    // the taper, which is the GROW cue, is preserved exactly.
    var lift = MIN_BODY_PX / Math.max(0.001, hw[0]);
    if (lift > 1) for (i = 0; i < n; i++) hw[i] *= lift;

    // ---- paint -------------------------------------------------------------
    var last = n - 1;

    // The halo, for the states whose spec says they emit. Non-emissive states
    // (thread, seeking) get none -- they are matter catching light, and their
    // legibility comes from the rim and the core below.
    if (role.glow && ss2.emits) {
      ribbon(ctx, 0, last, 2.35);
      ctx.fillStyle = ink(role.glow, 0.1, 0.13);
      ctx.fill();
    }

    // The body. For the two states that RIPEN, the colour ramp is painted in
    // bands along the run -- the spec calls that ripening "itself a statement
    // of direction", and it is: amber at the far end through to white at the
    // ring, so the cord tells you which way it is going even in a still frame.
    var ripen = ss2.ripen;
    if (ripen && ripen.length > 1) {
      for (var bnd = 0; bnd < ripen.length - 1; bnd++) {
        // ripen is quoted from the far end inward, entry [t, mat].
        var t0 = ripen[bnd][0], t1 = ripen[bnd + 1][0];
        var i0 = Math.floor(sampleIndexAt(n, Math.max(t1, t0)));
        var i1 = Math.ceil(sampleIndexAt(n, Math.min(t1, t0)));
        i0 = clamp(i0, 0, last); i1 = clamp(i1, 0, last);
        if (i1 <= i0) continue;
        ribbon(ctx, i0, i1, 1);
        ctx.fillStyle = ink(ripen[bnd][1], 0, 0.95);
        ctx.fill();
      }
    } else {
      ribbon(ctx, 0, last, 1);
      ctx.fillStyle = ink(role.body, 0, 0.93);
      ctx.fill();
    }

    // The rim. A dark edge is what separates a cord from the board behind it
    // without adding light -- which is how the two non-emissive states stay
    // visible while honouring "no emission anywhere in the base ladder".
    ribbon(ctx, 0, last, 1);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink(role.rim, 0, 0.75);
    ctx.stroke();

    // The core: the lit crown of the cord, offset a little toward the light so
    // the cord reads as round rather than as a flat strap.
    ctx.beginPath();
    for (i = 0; i <= last; i++) {
      var cxp = sx[i] + nx[i] * hw[i] * 0.26;
      var cyp = sy[i] + ny[i] * hw[i] * 0.26;
      var cw = Math.max(MIN_CORE_PX, hw[i] * 0.40);
      var px2 = cxp + nx[i] * cw, py2 = cyp + ny[i] * cw;
      if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    for (i = last; i >= 0; i--) {
      var cxq = sx[i] + nx[i] * hw[i] * 0.26;
      var cyq = sy[i] + ny[i] * hw[i] * 0.26;
      var cwq = Math.max(MIN_CORE_PX, hw[i] * 0.40);
      ctx.lineTo(cxq - nx[i] * cwq, cyq - ny[i] * cwq);
    }
    ctx.closePath();
    ctx.fillStyle = ink(role.core, ss2.emits ? 0.15 : 0, ss2.emits ? 0.92 : 0.72);
    ctx.fill();

    // ---- the knots ---------------------------------------------------------
    drawKnots(ctx, name, ss2, n, ramp, k, flow, now, role);

    // ---- the intake --------------------------------------------------------
    // The mouth at the tower end. Not a flash and not an icon: the swelling the
    // cord already has, closed off with a lip so it reads as an opening that
    // the cord is running into.
    var mouthW = hw[0];
    ctx.beginPath();
    ctx.moveTo(sx[0] + nx[0] * mouthW, sy[0] + ny[0] * mouthW);
    ctx.lineTo(sx[0] - nx[0] * mouthW, sy[0] - ny[0] * mouthW);
    ctx.lineWidth = Math.max(1.2, mouthW * 0.42);
    ctx.strokeStyle = ink(role.core, ss2.emits ? 0.35 : 0.12, ss2.emits ? 0.95 : 0.8);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  // The chain's radius: THINNER OUTWARD, per segment, from the spec's own
  // table. The spec explains why in one line -- "the trunk carries the sum of
  // every bite, so the taper alone proves it does not split at the source" --
  // and that taper is the whole reason this state is allowed to touch several
  // enemies with one line.
  function chainRadius(ss2, s, segs, t, per, n, i) {
    var tab = (ss2.radius && ss2.radius.per_segment) || [[0.07, 0.047]];
    var idx = Math.min(tab.length - 1, s);
    var pair = tab[idx];
    // Position inside this segment, 0 at its tower-side end.
    var tA = s / segs, tB = (s + 1) / segs;
    var u = (tB - tA) > 1e-9 ? (t - tA) / (tB - tA) : 0;
    var rw = pair[0], rt = pair[1];
    if (s >= tab.length) {
      // Beyond the spec's three segments the taper simply keeps going at the
      // last ratio, so a B5 holding many locks still thins outward all the way.
      var ratio = tab[tab.length - 1][1] / tab[tab.length - 1][0];
      var f = Math.pow(ratio, s - tab.length + 1);
      rw *= f; rt *= f;
    }
    return lerp(rw, rt, clamp(u, 0, 1));
  }

  function pickSeg(v, s) {
    if (v === undefined || v === null) return 0;
    return (typeof v === "number") ? v : (v[Math.min(v.length - 1, s)] || 0);
  }

  function drawKnots(ctx, name, ss2, n, ramp, k, flow, now, role) {
    var bs = ss2.beads;
    if (!bs) return;
    var shape = BEAD_SHAPE[name] || "wedge";

    // The spec's counts are quoted at a 60 u.l. run; scale to the real one, as
    // its own `spacingNote` instructs.
    var sp = spec();
    var canon = (sp && sp.canonicalRunUl) || 60;
    var runPx = 0;
    for (var q = 1; q < n; q++) {
      var ddx = sx[q] - sx[q - 1], ddy = sy[q] - sy[q - 1];
      runPx += Math.sqrt(ddx * ddx + ddy * ddy);
    }
    var baseCount = countOf(bs);
    var count = clamp(Math.round(baseCount * (runPx / 46)), 3, 20);

    // ONE PHASE FOR ALL OF THEM, advancing in the flow coordinate -- so the
    // acceleration is entirely the warp's doing and no knot can drift out of
    // step with its neighbours.
    var phase = (now * (ss2.scroll ? (ss2.scroll.base || 0.5) : 0.5) * 0.9) % 1;
    // `seeking` loses its knots in the last third (spec: "none are left in the
    // last third"), and its beads start at t_from.
    var tFrom = (bs.t_from !== undefined) ? bs.t_from : 1;

    var twist = ss2.twist || {};
    var tw = twist.total || 0, twp = twist.p || 1;

    ctx.beginPath();
    for (var i = 0; i < count; i++) {
      var c = ((i / count) + phase) % 1;
      var t = flowInverse(flow, c);
      if (t > tFrom) continue;
      beadAt(n, t, bead);
      var r = (name === "chain")
        ? chainRadius(ss2, seg[Math.min(n - 1, Math.round(sampleIndexAt(n, t)))],
                      Math.max(1, seg[n - 1] + 1), t, 0, n, 0)
        : radiusAt(name, ss2, t, ramp);
      var size = Math.max(1.3, r * k * bead.scale * (bs.proud || 1.25) * 1.55);
      // THE TWIST, expressed where it can actually be seen on a ribbon: the
      // knots weave around the cord, and because the spec's law accumulates as
      // (1-t)^p they weave FASTER as they near the tower -- one more thing that
      // changes in only one direction.
      var weave = tw ? Math.sin(tw * Math.PI * 2 * Math.pow(1 - t, twp) + phase * 6) : 0;
      var ox = bead.nx * weave * bead.hw * 0.55;
      var oy = bead.ny * weave * bead.hw * 0.55;
      knot(ctx, shape, bead.x + ox, bead.y + oy, bead.tx, bead.ty,
           bead.nx, bead.ny, size);
    }
    ctx.fillStyle = ink(bs.mat || role.bead, ss2.emits ? 0.1 : 0, ss2.emits ? 0.95 : 0.9);
    ctx.fill();

    // Gold's grains carry a bright facet, the spec's `accent`. One extra fill.
    if (bs.accent) {
      ctx.beginPath();
      for (var j = 0; j < count; j++) {
        var c2 = ((j / count) + phase) % 1;
        var t2 = flowInverse(flow, c2);
        beadAt(n, t2, bead);
        var r2 = radiusAt(name, ss2, t2, ramp);
        var s2 = Math.max(0.9, r2 * k * bead.scale * 0.8);
        knot(ctx, shape, bead.x + bead.tx * s2 * 0.35, bead.y + bead.ty * s2 * 0.35,
             bead.tx, bead.ty, bead.nx, bead.ny, s2 * 0.55);
      }
      ctx.fillStyle = ink(bs.accent, 0.2, 0.9);
      ctx.fill();
    }
  }

  function countOf(bs) {
    var c = bs.count;
    if (typeof c === "number") return c;
    if (c && c.length) {
      var sum = 0;
      for (var i = 0; i < c.length; i++) sum += c[i];
      return sum;
    }
    return 10;
  }

  // A knot, added to whatever path is open. `tx,ty` points AT THE TOWER, and
  // every shape here is built around that axis -- which is what makes the
  // direction a property of the matter rather than a symbol laid over it.
  function knot(ctx, shape, x, y, tx, ty, px, py, s) {
    if (shape === "constriction") {
      // A pinch across the cord. No point, no direction of its own: the tendon
      // reads inward from peristalsis -- each constriction travels toward the
      // hands and is larger than the one behind it.
      ctx.moveTo(x + px * s * 0.95 - tx * s * 0.30, y + py * s * 0.95 - ty * s * 0.30);
      ctx.lineTo(x + px * s * 0.95 + tx * s * 0.30, y + py * s * 0.95 + ty * s * 0.30);
      ctx.lineTo(x - px * s * 0.95 + tx * s * 0.30, y - py * s * 0.95 + ty * s * 0.30);
      ctx.lineTo(x - px * s * 0.95 - tx * s * 0.30, y - py * s * 0.95 - ty * s * 0.30);
      ctx.closePath();
      return;
    }
    if (shape === "box") {
      // A cast grain: blunt, but seated with its leading face square to the
      // ring, so a row of them still steps inward.
      ctx.moveTo(x + tx * s * 0.85 + px * s * 0.62, y + ty * s * 0.85 + py * s * 0.62);
      ctx.lineTo(x + tx * s * 0.85 - px * s * 0.62, y + ty * s * 0.85 - py * s * 0.62);
      ctx.lineTo(x - tx * s * 0.75 - px * s * 0.86, y - ty * s * 0.75 - py * s * 0.86);
      ctx.lineTo(x - tx * s * 0.75 + px * s * 0.86, y - ty * s * 0.75 + py * s * 0.86);
      ctx.closePath();
      return;
    }
    // The chevron. A wedge whose apex is toward the tower and whose back is
    // swallowed by the cord -- a knot on the rope, not a glyph floating over it.
    ctx.moveTo(x + tx * s * 1.30, y + ty * s * 1.30);
    ctx.lineTo(x - tx * s * 0.42 + px * s * 0.95, y - ty * s * 0.42 + py * s * 0.95);
    ctx.lineTo(x - tx * s * 0.10, y - ty * s * 0.10);
    ctx.lineTo(x - tx * s * 0.42 - px * s * 0.95, y - ty * s * 0.42 - py * s * 0.95);
    ctx.closePath();
  }

  // ---- transfer boluses ----------------------------------------------------
  //
  // A transfer is gold arriving or HP returning. Both are counters the adapter
  // already keeps for its own panel; watching them is read-only and, crucially,
  // is NOT a damage hook -- the beam still never flinches per shot.

  var BOLUS_SECONDS = 0.62;

  function updatePulses(tower, rec, ss2, dt) {
    var allowed = ss2 && ss2.pulses && ss2.pulses !== "none";
    var hp = tower.hpHealed || 0, gold = tower.goldGenerated || 0;
    var fired = (hp > rec.hp + 0.0001) || (gold > rec.gold + 0.0001);
    rec.hp = hp; rec.gold = gold;
    if (allowed && fired && rec.pulses.length < 4) rec.pulses.push({ c: 0, a: 0 });
    for (var i = rec.pulses.length - 1; i >= 0; i--) {
      var p = rec.pulses[i];
      p.c += dt / BOLUS_SECONDS;
      // Swells on the way in and is gone at the mouth: it is being swallowed,
      // not landing.
      p.a = Math.sin(clamp(p.c, 0, 1) * Math.PI) * 0.9 + 0.1;
      if (p.c >= 1) rec.pulses.splice(i, 1);
    }
  }

  // ---- entry ---------------------------------------------------------------

  var nodeBuf = [];

  function node(i, x, y, z) {
    var n = nodeBuf[i] || (nodeBuf[i] = { x: 0, y: 0, z: 0 });
    n.x = x; n.y = y; n.z = z;
    return n;
  }

  function draw(ctx, state, api) {
    if (!ctx || !state || !api || !api.project || !api.withGround) return;
    var sp = spec();
    if (!sp) return;
    var towers = state.towers;
    if (!towers || !towers.length) return;
    var now = state.now || 0;
    seen++;

    var saveCap = ctx.lineCap, saveJoin = ctx.lineJoin;
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";

    // ONE pinned reference for the whole pass, and every height fed to
    // `project` below is ABSOLUTE. See the note at the head of this file: a
    // beam spans two ground heights and must fly a straight line between them.
    api.withGround(0, function () {
      for (var i = 0; i < towers.length; i++) {
        var t = towers[i];
        if (!t || !t.constructor || t.constructor.ID !== "siphon") continue;
        var rec = recordFor(t);
        var dt = rec ? clamp(now - (rec.now || now), 0, 0.12) : 0;
        if (rec) rec.now = now;

        var locks = (typeof t.visibleLocks === "function")
          ? t.visibleLocks() : (t.locks || []);
        // Dead and leaked bodies are dropped by the adapter on its next update;
        // until then they must not be drawn to.
        var live = [];
        for (var j = 0; j < locks.length; j++) {
          var e = locks[j];
          if (e && !e.dead && !e.leaked && e.pos) live.push(e);
        }

        var ramp = live.length ? rampOf(t, live[0]) : 0;
        var name = stateFor(t, live.length, ramp);
        var ss2 = stateSpec(name);
        if (!ss2) continue;
        if (rec) updatePulses(t, rec, ss2, dt);

        var o = originWorld(t, api.groundAt);
        var ox = o.x, oy = o.y, oz = o.z;

        if (name === "seeking") {
          drawSeeking(ctx, api, t, ss2, ox, oy, oz, now, rec);
          continue;
        }

        if (name === "chain") {
          // ONE line leaves the hands and bounces. It does not fork at the
          // source -- `splitsAtSource: false` -- so the locks are visited in
          // order of proximity and the cord thins at every knuckle.
          var order = live.slice(0).sort(function (p, q) {
            var dp = (p.pos.x - ox) * (p.pos.x - ox) + (p.pos.y - oy) * (p.pos.y - oy);
            var dq = (q.pos.x - ox) * (q.pos.x - ox) + (q.pos.y - oy) * (q.pos.y - oy);
            return dp - dq;
          });
          var hops = Math.min(order.length, 6);
          var nodes = [node(0, ox, oy, oz)];
          for (var h = 0; h < hops; h++) {
            var en = order[h];
            nodes.push(node(h + 1, en.pos.x, en.pos.y,
              api.groundAt(en.pos.x, en.pos.y) + biteHeight(en)));
          }
          drawBeam(ctx, api, t, name, ramp, nodes, now, rec);
          continue;
        }

        for (var m = 0; m < live.length; m++) {
          var tgt = live[m];
          var r2 = (m === 0) ? ramp : rampOf(t, tgt);
          var pair = [node(0, ox, oy, oz),
                      node(1, tgt.pos.x, tgt.pos.y,
                        api.groundAt(tgt.pos.x, tgt.pos.y) + biteHeight(tgt))];
          drawBeam(ctx, api, t, name, r2, pair, now, rec);
        }
      }
    });

    ctx.lineCap = saveCap;
    ctx.lineJoin = saveJoin;
    prune();
  }

  // THE IDLE CORD. A Siphon with nothing to drain is not blank: `seeking`
  // reaches a little over half its range, ends in three groping filaments of
  // unequal length, and sweeps. It matters more than an idle state usually
  // would, because it is where a player first meets the tower -- and even with
  // nothing on the far end it still DRAINS toward the hands (0.0085 against
  // 0.033, a 3.9x taper), so the one message is on screen before the first
  // enemy ever walks in.
  function drawSeeking(ctx, api, tower, ss2, ox, oy, oz, now, rec) {
    var curve = ss2.curve || {};
    var reach = clamp((tower.rangePx || 78) * (curve.reach || 0.55), 26, 180);
    var sweep = now * 0.5;                     // spec: ~0.5 rad/s
    var fil = [
      { a: 0, len: 1.0 }, { a: 0.34, len: 0.82 }, { a: -0.27, len: 0.9 }
    ];
    for (var f = 0; f < fil.length; f++) {
      // The filaments LAG the free end, which is what makes three lines read as
      // one groping hand rather than as a fan.
      var ang = sweep - f * 0.22 + fil[f].a;
      var L = reach * fil[f].len;
      var bx = ox + Math.cos(ang) * L;
      var by = oy + Math.sin(ang) * L;
      var bz = api.groundAt(bx, by) + 6 + Math.sin(now * 0.9 + f) * 3;
      drawBeam(ctx, api, tower, "seeking", 0,
        [node(0, ox, oy, oz), node(1, bx, by, bz)], now + f * 0.7, null);
    }
  }

  return {
    VERSION: VERSION,
    draw: draw,
    reset: reset,
    // Exposed for review and for the harness; nothing in the game calls them.
    stateFor: stateFor,
    originPoint: originPoint
  };
})();
