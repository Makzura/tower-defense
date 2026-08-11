// ---------------------------------------------------------------------------
// SiphonFXRitual -- THE RITUAL CIRCLE the Siphon casts, and the LATCH that
// keeps it up.
//
// THE OWNER'S DESIGN
//
//   "let him extend both his hands which creates a magic circle in front of him
//    from which come out the beams"
//   "for A3+ make him put his staff forward instead of his two hands, create a
//    magic circle and there two beams come out if crosspathed with b2"
//
// So a beam no longer appears to leave a hand or a ring DIRECTLY. It leaves the
// RIM of a circle floating in front of him, and the circle is the thing he
// casts. The hands (or the staff) hold the circle open -- that is the tether
// this file draws -- and the circle is the aperture the drained matter is
// swallowed through.
//
// ---------------------------------------------------------------------------
// THE CASTING CONTRACT.  READ THIS BEFORE CHANGING ANYTHING BELOW.
// ---------------------------------------------------------------------------
//
// This is the owner's own bug report, and it is the single thing most likely to
// be got wrong:
//
//   "so the animation won't bug, don't redo the animation each time the beam
//    disappears/reappears because it does so tens of times per second on small
//    groups of enemies. Instead make the main animation be the circle, and the
//    circle only stops getting cast if the siphon stops attacking for a certain
//    amount of time."
//
// A Siphon re-acquires CONSTANTLY. BeamTower.updateLocks runs every frame; on a
// small group of enemies a lock is dropped and refilled many times a second as
// bodies die (js/towers/beam-adapter.js, `kept` / `free` / `candidates`). Any
// cast animation keyed on "does it have a lock right now" therefore strobes.
//
// So the circle is a PERSISTENT, LATCHED state with hysteresis:
//
//   * it SPINS UP ONCE, over SPIN_UP_SECONDS, when he starts attacking;
//   * it STAYS UP through any number of lock drops and re-acquires -- a drop
//     does not touch `cast`, it only restarts the idle clock;
//   * it SPINS DOWN only after IDLE_DWELL_SECONDS (1.15 s) of holding NO lock
//     at all, and then over SPIN_DOWN_SECONDS;
//   * its ROTATION (`rec.spin`) is CONTINUOUS and is advanced unconditionally,
//     every frame, at every value of `cast` -- including while it is invisible.
//     Nothing anywhere in this file ever assigns `rec.spin` a value other than
//     `rec.spin + dt * rate`. It cannot restart, so it cannot pop.
//   * the cast DIRECTION is rate-limited (SLEW_RAD_PER_SEC) and is HELD, not
//     re-aimed, for the whole of the dwell -- so a lock churning between two
//     enemies on opposite sides cannot make the circle shudder.
//
// The three numbers that define the latch are named constants and are the only
// place any of this is tunable:
//
//     IDLE_DWELL_SECONDS = 1.15   -- of the order of a second, not a frame
//     SPIN_UP_SECONDS    = 0.38
//     SPIN_DOWN_SECONDS  = 0.85
//
// `advance()` is IDEMPOTENT ON `state.now`: it stamps the record and returns
// early if it has already run for this timestamp. Both entry points (`draw`
// from gl-world, `plan` from siphon-beam-draw) call it, in either order, and
// the latch advances exactly once per frame regardless. A paused game freezes
// the circle, which is correct.
//
// ---------------------------------------------------------------------------
// BEAM COUNT: A DELIBERATE VISUAL CAP. THE MECHANIC IS UNTOUCHED.
// ---------------------------------------------------------------------------
//
//     base / A-only ......... 1 beam
//     B1 1   B2 2   B3 3   B4 4   B5 5
//     A3+ with a B2 crosspath  2 beams out of the staff circle
//
// which is exactly `BEAMS_BY_B[purchased.B]` below, because the crosspath rule
// caps the off-path at tier 2 -- so `A3+ and B2` and `B2` are the same row.
//
// The REAL maxTargets are 1 / 2 / 4 / 10 / 50 (BeamTower.CONFIG). At B5 the
// tower genuinely locks fifty enemies, and fifty beams would be unreadable --
// which is why the owner asked for the cap. Each DRAWN beam therefore SERVES
// SEVERAL LOCKS: `assignLocks` deals the tower's live locks across the drawn
// beams and each beam CHAINS enemy to enemy, which is the brief's own rule for
// path B ("il rebondit d'un ennemi a l'autre", and explicitly NOT splitting at
// the source -- SiphonBeamSpec.states.chain.splitsAtSource is false). Locks
// beyond what the beams can hold ride an existing beam's chain rather than
// spawning a beam of their own.
//
// Nothing here is written back into the simulation. The inspection panel still
// reports `locks.length` ("Beams: n active"), so the true count is still on
// screen and nothing lies about the mechanic. This file reads `locks` /
// `visibleLocks()`, `core.purchased`, `aim`, `x`, `y` -- all read-only -- and
// keeps every byte of its own state in its own Map, keyed by tower and pruned
// when the tower goes.
//
// ---------------------------------------------------------------------------
// DIVISION OF LABOUR WITH js/gl/siphon-beam-draw.js (SiphonFXBeam)
// ---------------------------------------------------------------------------
//
// That module owns beam rendering: the profile, the taper, the flow direction,
// the knots, the intake bell, the eight states and the transfer boluses. NONE
// of that is duplicated here. This file owns three things and hands them over:
//
//   1. the CIRCLE (drawn here, OVER the beams -- see the note on draw());
//   2. the CASTING HYSTERESIS (the latch above);
//   3. the PLAN -- how many beams to draw, where each one STARTS, and which
//      locks each one chains through.
//
// The seam is `SiphonFXRitual.plan(tower, live, ox, oy, oz, now, api)`, called
// once per Siphon per frame from inside SiphonFXBeam.draw. It returns
//
//     { beams: [ { x, y, z, targets: [enemy, ...] }, ... ],
//       idle:  { x, y, z } }
//
// `beams[i]` is one cord: it starts at (x,y,z) -- a point on the circle's RIM,
// not on the body -- and visits `targets` in order. `idle` is where the
// `seeking` state's groping filaments should start when there is no lock: the
// circle's centre while the circle is up, the hands once it has gone.
//
// ORIGINS ARE FROZEN, and this file does not move them. HANDS
// (0.055, 0.305, 1.045) for base/A1/A2 and the whole of path B; RING
// (0.315, 0.395, 1.190) from A3 -- read out of SiphonBeamSpec.origins, which
// tools/blender/siphon_idol.py generates alongside siphon_origins.json, through
// `SiphonFXBeam.originPoint(tower)` so the HANDS/RING choice can never disagree
// with the beam module's. The circle sits FORWARD of that point; the beams
// start at the circle's rim.
//
// WHICH WAY IS "FORWARD". It is (cos(tower.aim), sin(tower.aim)) -- the world
// direction the body's authored front points along -- and nothing else. See
// `aimDirection`.
//
// THIS PARAGRAPH USED TO SAY THE OPPOSITE, and it was true when it was written:
// BeamTower did not inherit from Tower, never declared `aim`, and so stood at
// one fixed compass bearing however the fight moved. Taking "forward along the
// tower's aim" literally would then have let beams leave the far rim and fly
// back across the caster, so this module solved for its own cast direction
// instead -- the mean of the live locks, slewed.
//
// BeamTower now sets `aim` (beam-adapter.js) and slews it in `faceLocks`, so
// the workaround became a liability: two rate limits on the same angle, from
// two pivots ten board px apart, and a disc that slid off the chest through
// every turn. The owner's requirement -- "perpendicular to the ground and
// parallel to the body of the siphon" -- is only structurally true if the disc
// READS the body's facing, so now it does.
//
// ---------------------------------------------------------------------------
// PERFORMANCE -- visual-pass/PERF.md; OVERDRAW is the sensitive axis
// ---------------------------------------------------------------------------
//
// Per Siphon per frame: FIVE `project` calls -- the centre, the three unit
// probes that give the screen basis, and the origin for the tether -- and 6
// canvas ops (disc fill, halo stroke, two ring strokes, one fill for every
// tick, one fill for every glyph), plus one 2-line tether stroke.
//
// Five, and not twenty-six, because the disc's rim is an ELLIPSE and this file
// solves for it instead of sampling it. Projection is locally affine over a
// patch 35 px across, so the screen image of `C + U*R*cos(p) + V*R*sin(p)` is
// `Cs + Us*cos(p) + Vs*sin(p)` where Us and Vs are the screen images of the two
// in-plane vectors -- three probes and a subtraction. Every rim point, every
// rotating tick and the whole inner ring then cost two multiplies each and no
// projection at all. It is also EXACT rather than a 24-gon approximation.
//
// The circle covers about 950 px^2 at 720p and the only fill above alpha 0.2 is
// the ring line itself, so its contribution to overdraw is roughly a thousandth
// of a frame. No allocation per frame: the scratch points, the arm records and
// the sort buffer are module-level and reused, and every colour is a pre-built
// `rgba()` string out of a 20-step table cached forever.
//
// ---------------------------------------------------------------------------
// WHERE gl-world.js AND siphon-beam-draw.js MUST CALL THIS
// ---------------------------------------------------------------------------
//
// See the two patches quoted in the pass report. In summary:
//
//   index.html, after siphon-beam-draw.js:
//       <script src="js/gl/siphon-ritual.js"></script>
//
//   gl-world.js, in drawOverlays, IMMEDIATELY BEFORE the SiphonFXBeam.draw
//   call at :1822, at top level outside any withGround (this module pins its
//   own reference for the same reason the beam does -- the circle floats above
//   the deck the tower stands on and must be fed absolute heights):
//       if (typeof SiphonFXRitual !== "undefined") {
//         SiphonFXRitual.draw(ctx, state, BLUB_FX_API);
//       }
//
//   siphon-beam-draw.js, inside its per-tower loop, right after
//   `var ox = o.x, oy = o.y, oz = o.z;` -- one branch that asks this module
//   for the plan and falls through to the existing code when it is absent.
// ---------------------------------------------------------------------------

var SiphonFXRitual = (function () {
  "use strict";

  var VERSION = "1.0";
  var TAU = Math.PI * 2;

  // ---- THE LATCH -----------------------------------------------------------
  // The whole casting contract in four numbers. See the header.

  var IDLE_DWELL_SECONDS = 1.15;   // he must be idle THIS long before it drops
  var SPIN_UP_SECONDS    = 0.38;
  var SPIN_DOWN_SECONDS  = 0.85;
  var SLEW_RAD_PER_SEC   = 3.2;    // how fast the circle may re-aim

  // Rotation. Never reset, never restarted, advanced at every value of `cast`.
  var SPIN_RAD_PER_SEC   = 0.62;
  var COUNTER_SPIN       = -0.41;  // the inner glyphs turn the other way

  // ---- THE CIRCLE, in Blender units (x unitsToPx -> board px) --------------

  var CIRCLE_R_UL    = 0.48;   // 15.3 px -- a disc as wide as his own socle
  var CIRCLE_FWD_UL  = 0.68;   // 21.6 px in front of the hands, clear of him
  var CIRCLE_LIFT_UL = 0.06;
  var STAFF_SCALE    = 1.16;   // A3+ casts from the staff, so it is bigger

  // HOW FAR THE DISC LEANS BACK: it does not. It stands dead vertical, facing
  // along the cast, always. See screenBasis.
  //
  // TILT_MIN/TILT_MAX and the solved lean they clamped are GONE, at the owner's
  // instruction: "the circle is in a goofy position, he should at all time be
  // perpendicular to the ground and parallel to the body of the siphon."
  //
  // THE WARNING THE DELETED CODE WAS CARRYING, PRESERVED BECAUSE IT IS TRUE.
  // The author of the tilt solver had measured this: at the board camera
  // (pitch 0.594) a vertical disc is nearly face-on when he casts toward the
  // viewer and goes EDGE-ON when he casts across it, and at 1278x719 the B4
  // circle "collapsed to an oblique smear the moment the tower was placed
  // beside a road running left-right". That observation was correct and it
  // still applies to the disc built here.
  //
  // It is accepted rather than solved, for two reasons. The cure was worse:
  // choosing the world orientation that looks widest from the current camera
  // makes the disc a weathervane, which is the defect actually reported. And it
  // is now much less likely to bite, because the BODY turns to face its locks
  // (BeamTower.faceLocks) -- so casting across the view means he is standing in
  // profile, and a disc square to a body in profile reading narrow is what a
  // real object does. If it proves too costly in practice the fix is a billboard
  // about the vertical axis -- keep V = z, spin U to face the camera -- which
  // holds "perpendicular to the ground" but gives up "parallel to the body".

  // THE MARKINGS, as fractions of the rim. Deliberately FINE: the first build
  // used ticks 0.052 rad wide and five inner wedges 0.105 rad wide, and at a
  // working zoom the result read as a CARTWHEEL -- the marks were spokes and the
  // rings were lost between them. A rune circle is rings first and marks second,
  // so the marks are now a third of their old angular width and the hub closes
  // the middle so the disc is not a hole.
  var RING_N   = 24;           // segments of the rim polyline (screen space)
  var INNER    = 0.72;         // inner ring, as a fraction of the rim
  var HUB      = 0.13;
  var TICK_IN = 0.775, TICK_OUT = 0.975, TICK_HALF = 0.026;
  var GLYPH_IN = 0.26, GLYPH_OUT = 0.545, GLYPH_HALF = 0.045;
  var GLYPH_N  = 3;

  // ---- THE VISUAL CAP ------------------------------------------------------
  //
  // Indexed by purchased.B. Row 0 is base and every A-only tier; the crosspath
  // rule caps the off-path at 2, so row 2 is both "B2" and "A3+ with B2".
  var BEAMS_BY_B = [1, 1, 2, 3, 4, 5];

  // A chain longer than this is not drawn longer -- SiphonFXBeam samples at
  // least 8 points on the first hop and 7 on each of the rest into a 96-point
  // buffer, so 13 hops is where its geometry runs out. 5 beams x 12 covers the
  // 50 locks a B5 can actually hold.
  var MAX_HOPS_PER_BEAM = 12;

  // ---- small maths ---------------------------------------------------------

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---- colour --------------------------------------------------------------
  //
  // Same technique as the beam module's: quantised alpha, cached strings, so a
  // circle allocates nothing at all once it has been on screen for one frame.
  // Every key below is a real entry in SiphonBeamSpec.palette.

  var ALPHA_STEPS = 20;
  var inkCache = Object.create(null);

  function palHex(key) {
    var sp = (typeof SiphonBeamSpec !== "undefined") ? SiphonBeamSpec : null;
    var e = sp && sp.palette && sp.palette[key];
    return e ? e.hex : "#B08A66";
  }

  function inkTable(key, lift) {
    var id = key + "|" + lift;
    var got = inkCache[id];
    if (got) return got;
    var h = palHex(key);
    if (h.charAt(0) === "#") h = h.slice(1);
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    if (lift) {
      r = Math.round(lerp(r, 255, lift));
      g = Math.round(lerp(g, 255, lift));
      b = Math.round(lerp(b, 255, lift));
    }
    var head = "rgba(" + r + "," + g + "," + b + ",";
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

  function beamCount(tower) {
    var b = tiers(tower).b;
    return BEAMS_BY_B[clamp(b, 0, 5)];
  }

  // THE CIRCLE'S PALETTE FOLLOWS THE TIER, NEVER THE STATE.
  //
  // Same rule SiphonBeamSpec.originByTier states for the origin, and here it is
  // load-bearing for a second reason: the beam's state name depends on
  // `lockCount`, which is the very thing that churns tens of times a second.
  // A circle coloured off the state would strobe between two palettes even
  // though the latch held it perfectly still.
  var LOOKS = {
    cloth:  { rim: "cloth_dark",  glyph: "hem_fray",   field: "cloth_worn", emits: false },
    brass:  { rim: "gold_dark",   glyph: "amber",      field: "brass",      emits: true },
    gold:   { rim: "gold",        glyph: "amber",      field: "gold_dark",  emits: true },
    column: { rim: "gold",        glyph: "white_warm", field: "purple_rich", emits: true },
    bile:   { rim: "oil_black",   glyph: "rose_sick",  field: "membrane",   emits: true }
  };

  function lookOf(tower) {
    var t = tiers(tower);
    if (t.a >= 5) return LOOKS.column;
    if (t.a >= 3) return LOOKS.gold;
    if (t.b >= 3) return LOOKS.bile;
    if (t.a >= 1 || t.b >= 1) return LOOKS.brass;
    // Base keeps the spec's rule for the base ladder -- "no emission anywhere"
    // -- so it is worn cloth caught in the light, held up by a dark rim.
    return LOOKS.cloth;
  }

  // How busy the ring is, as a small piece of progression: a base Siphon draws
  // ten marks, a maxed one twenty.
  function tickCount(tower) {
    var t = tiers(tower);
    return clamp(12 + 2 * Math.max(t.a, t.b), 12, 22);
  }

  // ---- geometry ------------------------------------------------------------

  var SIPHON_YAW = -Math.PI / 2;   // gl-world's authoredFrontOffset for /^siphon-/

  function unitsToPx() {
    if (typeof GLModels !== "undefined" && GLModels.unitsToPx) {
      var k = GLModels.unitsToPx("siphon-base");
      if (k && k > 1.5) return k;
    }
    var sp = (typeof SiphonBeamSpec !== "undefined") ? SiphonBeamSpec : null;
    return (sp && sp.unitsToPx) || 31.8032;
  }

  // HANDS or RING, in Blender units. Asked of the beam module so the two can
  // never disagree about which one a tier pours from; the literals are only a
  // fallback for a load order that does not exist in index.html.
  function originPoint(tower) {
    if (typeof SiphonFXBeam !== "undefined" && SiphonFXBeam.originPoint) {
      return SiphonFXBeam.originPoint(tower);
    }
    var sp = (typeof SiphonBeamSpec !== "undefined") ? SiphonBeamSpec : null;
    var o = sp && sp.origins;
    var hands = (o && o.HANDS) || [0.055, 0.305, 1.045];
    var ring = (o && o.RING) || [0.315, 0.395, 1.190];
    return tiers(tower).a >= 3 ? ring : hands;
  }

  // The origin in ABSOLUTE world coordinates. This is the same transform
  // drawActor uses on the body (gl-world.js:1037-1041) and the same one
  // SiphonFXBeam.originWorld reproduces -- the same yaw, the same uniform
  // scale, the same ground -- which is what keeps the circle welded to the
  // hands instead of hanging near them. When SiphonFXBeam hands its own origin
  // over through plan() that value wins, so in the game the two are identical
  // by construction rather than by agreement.
  function originWorld(tower, groundAt, out) {
    var p = originPoint(tower);
    var aim = (typeof tower.aim === "number" && isFinite(tower.aim)) ? tower.aim : 0;
    var yaw = aim + SIPHON_YAW;
    var k = unitsToPx(), c = Math.cos(yaw), s = Math.sin(yaw);
    out.ox = tower.x + (c * p[0] - s * p[1]) * k;
    out.oy = tower.y + (s * p[0] + c * p[1]) * k;
    out.oz = groundAt(tower.x, tower.y) + p[2] * k;
  }

  // ---- per-tower records ---------------------------------------------------

  var rites = (typeof Map !== "undefined") ? new Map() : null;
  var pass = 0;

  function riteFor(tower) {
    if (!rites) return null;
    var r = rites.get(tower);
    if (!r) {
      r = {
        now: -1, stamp: -1,
        idle: IDLE_DWELL_SECONDS + 1,   // a fresh tower is not casting
        cast: 0, ease: 0,
        spin: 0,                        // NEVER assigned anything but spin + dt*rate
        dx: 1, dy: 0, aimed: false,
        seed: ((tower.x || 0) * 0.137 + (tower.y || 0) * 0.211) % TAU,
        ox: 0, oy: 0, oz: 0,
        // `now` of the last frame SiphonFXBeam handed an origin over. See the
        // note at advance()'s call to originWorld.
        handed: -1,
        // the circle in the world, and its image on the screen
        cx: 0, cy: 0, cz: 0, R: 0, ux: 0, uy: 0, vx: 0, vy: 0, vz: 0,
        sx: 0, sy: 0, sux: 0, suy: 0, svx: 0, svy: 0, tilt: 0.9, shown: false,
        arms: [], out: { beams: [], idle: { x: 0, y: 0, z: 0 } },
        mark: 0
      };
      rites.set(tower, r);
    }
    r.mark = pass;
    return r;
  }

  function prune() {
    if (!rites) return;
    rites.forEach(function (r, t) { if (r.mark !== pass) rites.delete(t); });
  }

  function reset() { if (rites) rites.clear(); }

  // ---- the latch -----------------------------------------------------------
  //
  // IDEMPOTENT ON `now`. Whichever of draw() and plan() reaches a tower first
  // in a frame advances it; the other is a no-op. Both derive `live` the same
  // way, so it does not matter which one wins.

  function advance(tower, rec, live, now, api) {
    if (rec.stamp === now) return rec;
    var dt = (rec.now < 0) ? 0 : clamp(now - rec.now, 0, 0.12);
    rec.now = now;
    rec.stamp = now;

    var work = (live && live.length) || 0;

    // THE HYSTERESIS. A lock dropping does NOT touch `cast`; it only restarts
    // the idle clock, and the clock has to run all the way out before the
    // circle is allowed to begin closing. So a tower whose lock flickers ten
    // times a second sees `idle` reset ten times a second and `want` stays 1
    // throughout -- the circle never notices.
    if (work > 0) rec.idle = 0; else rec.idle += dt;
    var want = (rec.idle < IDLE_DWELL_SECONDS) ? 1 : 0;
    rec.cast = clamp(
      rec.cast + (want ? dt / SPIN_UP_SECONDS : -dt / SPIN_DOWN_SECONDS), 0, 1);
    rec.ease = rec.cast * rec.cast * (3 - 2 * rec.cast);

    // THE ROTATION. Unconditional, and the only write to `rec.spin` in this
    // file. It keeps turning while the circle is closed, so re-opening it never
    // shows a jump: the phase it comes back at is wherever it would have been.
    rec.spin += dt * SPIN_RAD_PER_SEC;
    if (rec.spin > TAU) rec.spin -= TAU;

    originWorld(tower, api.groundAt, rec);

    // THE CAST DIRECTION IS THE BODY'S FACING. It is not solved here.
    aimDirection(tower, rec, live, work, dt);

    // ---- the circle in space, and its image on the screen ------------------
    //
    // Both are derived here rather than in paint(), so the five projections
    // happen ONCE per tower per frame no matter which entry point ran first,
    // and so plan() and paint() cannot possibly disagree about where the rim is.
    geom(tower, rec);
    rec.shown = screenBasis(api, rec);
    return rec;
  }

  // THE DISC FACES WHERE THE BODY FACES, AND IT DOES NOT GET A SECOND OPINION.
  //
  // The owner's requirement is that the circle be "perpendicular to the ground
  // and parallel to the body of the siphon" AT ALL TIMES. `parallel to the
  // body` is not something that can be re-derived here and still be guaranteed
  // -- it is only guaranteed if this reads the body's facing instead of
  // solving for one.
  //
  // THIS USED TO SOLVE ITS OWN. It took the centroid of the locks measured
  // from `rec.ox/rec.oy` -- the APERTURE, the point between the palms -- and
  // rate-limited it at SLEW_RAD_PER_SEC. Once BeamTower.faceLocks landed, that
  // became the SECOND slew of the same angle: faceLocks measures the same
  // centroid from `tower.x/tower.y` -- the tower CENTRE, about 10 board px
  // away -- and rate-limits it separately. Two pivots and two independent rate
  // limits meant the body and the disc chased different angles all the way
  // through every turn, so the disc slid off his chest while he turned and the
  // tether drew the disagreement as a line raking across him.
  //
  // The dwell hold that the old three-case version existed to provide is now
  // free: `faceLocks` returns early when there is nothing to face, so
  // `tower.aim` holds by itself, and the disc holds with it. Likewise the rate
  // limit -- `tower.aim` arrives already slewed, so smoothing it twice would
  // only add lag.
  //
  // `tower.aim` IS THE WORLD ANGLE THE BODY'S AUTHORED FRONT POINTS ALONG.
  // gl-world draws the model at `aim + authoredFrontOffset()`, which for
  // /^siphon-/ is `aim - PI/2`; GLMath.modelYaw is a plain CCW rotation about
  // Z, so the authored +Y front lands on (cos aim, sin aim) exactly. That is
  // this vector, so the disc's normal is the body's forward direction and the
  // two can never disagree.
  function aimDirection(tower, rec) {
    var aim = (typeof tower.aim === "number" && isFinite(tower.aim))
      ? tower.aim : 0;
    rec.dx = Math.cos(aim);
    rec.dy = Math.sin(aim);
    rec.aimed = true;
  }

  // ---- the circle in space -------------------------------------------------
  //
  // Centre C, radius R, and an orthonormal in-plane pair (U, V). U is
  // horizontal and across the cast; V is world up. A rim point at angle p is
  // C + U*R*cos(p) + V*R*sin(p), and that is the form the whole file uses -- on
  // the screen as well as here. The disc therefore stands perpendicular to the
  // ground, facing along the cast; see screenBasis for why it is no longer
  // tilted to suit the camera.

  function geom(tower, rec) {
    var k = unitsToPx();
    var big = (tiers(tower).a >= 3) ? STAFF_SCALE : 1;
    var e = rec.ease;
    // It breathes, continuously, off the same clock as everything else -- so
    // this too can never restart.
    var breathe = 1 + 0.028 * Math.sin(rec.now * 1.6 + rec.seed);
    rec.R = CIRCLE_R_UL * k * big * (0.34 + 0.66 * e) * breathe;
    // It is pushed out from the hands as it opens, so the cast is a gesture and
    // not a fade-in.
    var fwd = CIRCLE_FWD_UL * k * big * (0.22 + 0.78 * e);
    rec.cx = rec.ox + rec.dx * fwd;
    rec.cy = rec.oy + rec.dy * fwd;
    rec.cz = rec.oz + CIRCLE_LIFT_UL * k;
    rec.ux = -rec.dy; rec.uy = rec.dx;           // horizontal; uz is 0
  }

  // THE SCREEN BASIS, in three projections.
  //
  // THE DISC STANDS UP. Its plane is perpendicular to the ground and its normal
  // is the cast direction, so it is parallel to the Siphon's own frontal plane
  // -- a portal held up in front of his chest, facing whatever he is draining,
  // and the cords leave through it. In world terms that is exactly
  //
  //     U = (-dy, dx, 0)   horizontal, across the cast
  //     V = (0, 0, 1)      straight up
  //
  // and both are constants of the tower's facing alone. Nothing here consults
  // the camera, which is the entire point of the rewrite.
  //
  // WHAT THIS REPLACED, AND WHY IT HAD TO GO. The previous version solved for
  // the tilt T that maximises the ellipse's AREA ON SCREEN -- a genuinely neat
  // closed form, |Us x Vs| being a single sinusoid in T so the best T is one
  // atan2 with no search -- and then clamped it into [0.45, 1.30]. But a disc
  // whose world orientation is chosen to look biggest from where you happen to
  // be standing is a weathervane pointing at the camera. Measured on one fixed
  // scene, turning the camera alone swung the disc's normal from vz 0.852 to
  // vz 0.267 and collapsed its screen image to 66 x 1.5 px -- a line across his
  // chest, no circle at all. The owner called it "a goofy position" and asked
  // for perpendicular to the ground and parallel to the body at all times.
  //
  // THE COST, STATED PLAINLY: a real vertical disc IS edge-on when the Siphon
  // faces the camera or directly away from it. That is honest 3D and not a
  // regression -- it is what a held portal does -- but it does mean the circle
  // is not equally readable from every angle, which is what the old code was
  // buying at the price of the disc having no fixed orientation at all.
  function screenBasis(api, rec) {
    var R = rec.R;
    if (!(R > 0.01)) return false;
    var p0 = api.project(rec.cx, rec.cy, rec.cz);
    if (!p0) return false;
    var pu = api.project(rec.cx + rec.ux * R, rec.cy + rec.uy * R, rec.cz);
    var pz = api.project(rec.cx, rec.cy, rec.cz + R);
    if (!pu || !pz) return false;

    // World V is world up, unconditionally. plan() reads vx/vy/vz to place the
    // rim anchors, so it gets the standing disc for free.
    rec.vx = 0; rec.vy = 0; rec.vz = 1;
    rec.tilt = Math.PI / 2;            // kept only as a record of the invariant

    rec.sx = p0.x; rec.sy = p0.y;
    rec.sux = pu.x - p0.x; rec.suy = pu.y - p0.y;
    rec.svx = pz.x - p0.x; rec.svy = pz.y - p0.y;
    return true;
  }

  // Where beam i of n leaves the rim. Symmetric about the disc's vertical axis
  // for every n: n=1 leaves the top, n=2 the two sides, n=5 a five-point star.
  // The anchors do NOT rotate with the ring -- only the marks do. A beam whose
  // root crawled around the rim would be motion the beam module never asked
  // for, and would fight the one thing the cord is supposed to say.
  function anchorAngle(i, n) { return -Math.PI / 2 + (i + 0.5) * (TAU / n); }

  // ---- assigning locks to beams -------------------------------------------
  //
  // Nearest lock first, one dealt to each beam so every cord has its own near
  // anchor and the set fans out; then every remaining lock joins the beam whose
  // CURRENT TIP is nearest to it, subject to a fair share. That is a chain, in
  // the brief's sense: the cord rebounds from one enemy to the next and never
  // forks at the source.

  var sortBuf = [];
  var SORT_CX = 0, SORT_CY = 0;

  function byDistFromCircle(p, q) {
    var dp = (p.pos.x - SORT_CX) * (p.pos.x - SORT_CX) +
             (p.pos.y - SORT_CY) * (p.pos.y - SORT_CY);
    var dq = (q.pos.x - SORT_CX) * (q.pos.x - SORT_CX) +
             (q.pos.y - SORT_CY) * (q.pos.y - SORT_CY);
    return dp - dq;
  }

  function assignLocks(live, arms, nBeams, cx, cy) {
    var n = live.length, i, b;
    sortBuf.length = 0;
    for (i = 0; i < n; i++) sortBuf.push(live[i]);
    SORT_CX = cx; SORT_CY = cy;
    sortBuf.sort(byDistFromCircle);

    var share = Math.min(MAX_HOPS_PER_BEAM, Math.ceil(n / nBeams));
    var k = 0;
    for (b = 0; b < nBeams && k < n; b++) arms[b].targets.push(sortBuf[k++]);

    for (; k < n; k++) {
      var e = sortBuf[k];
      var best = -1, bestD = Infinity;
      for (b = 0; b < nBeams; b++) {
        var tg = arms[b].targets;
        if (tg.length >= share) continue;
        var tip = tg.length ? tg[tg.length - 1].pos : null;
        var d = tip
          ? (e.pos.x - tip.x) * (e.pos.x - tip.x) + (e.pos.y - tip.y) * (e.pos.y - tip.y)
          : 0;
        if (d < bestD) { bestD = d; best = b; }
      }
      // Every cord full. The remaining locks are still locked, still doing
      // damage and still counted by the panel -- they simply have no cord of
      // their own, which is the whole point of the cap.
      if (best < 0) break;
      arms[best].targets.push(e);
    }
  }

  // ---- the plan ------------------------------------------------------------
  //
  // Called once per Siphon per frame by SiphonFXBeam.draw.

  function plan(tower, live, ox, oy, oz, now, api) {
    var rec = riteFor(tower);
    if (!rec) return null;
    // The beam module's own origin is authoritative when it hands one over, so
    // it goes in BEFORE the latch runs and the circle is placed off it.
    if (typeof ox === "number" && isFinite(ox) && rec.stamp !== now) {
      rec.ox = ox; rec.oy = oy; rec.oz = oz;
    }
    advance(tower, rec, live, now, api);
    var out = rec.out;
    var e = rec.ease;

    // Where the idle filaments grope from: the circle's centre while it is up,
    // the hands once it has closed, and a smooth blend in between so the
    // handover never pops.
    out.idle.x = lerp(rec.ox, rec.cx, e);
    out.idle.y = lerp(rec.oy, rec.cy, e);
    out.idle.z = lerp(rec.oz, rec.cz, e);

    out.beams.length = 0;
    var n = (live && live.length) || 0;
    if (!n) return out;

    var want = Math.min(beamCount(tower), n);
    var i, arm;
    for (i = 0; i < want; i++) {
      arm = rec.arms[i] || (rec.arms[i] = { x: 0, y: 0, z: 0, targets: [] });
      arm.targets.length = 0;
      out.beams.push(arm);
    }
    assignLocks(live, out.beams, want, rec.cx, rec.cy);

    for (i = 0; i < want; i++) {
      arm = out.beams[i];
      var p = anchorAngle(i, want);
      var c = Math.cos(p) * rec.R, s = Math.sin(p) * rec.R;
      // On the rim while the circle is open; on the hands while it is not.
      arm.x = lerp(rec.ox, rec.cx + rec.ux * c + rec.vx * s, e);
      arm.y = lerp(rec.oy, rec.cy + rec.uy * c + rec.vy * s, e);
      arm.z = lerp(rec.oz, rec.cz + rec.vz * s, e);
    }
    return out;
  }

  // ---- painting ------------------------------------------------------------
  //
  // Everything below works in the SCREEN ellipse the basis already solved for,
  // so nothing here projects anything except the tether's far end.

  var RC = new Float64Array(RING_N), RS = new Float64Array(RING_N);
  (function () {
    for (var i = 0; i < RING_N; i++) {
      RC[i] = Math.cos(i * TAU / RING_N);
      RS[i] = Math.sin(i * TAU / RING_N);
    }
  })();

  var P = { x: 0, y: 0 };

  // Any point of the disc, on screen: angle `p`, radial fraction `s`. Exact.
  function at(rec, p, s, out) {
    var c = Math.cos(p) * s, n = Math.sin(p) * s;
    out.x = rec.sx + rec.sux * c + rec.svx * n;
    out.y = rec.sy + rec.suy * c + rec.svy * n;
    return out;
  }

  function ringPath(ctx, rec, s) {
    ctx.beginPath();
    for (var i = 0; i < RING_N; i++) {
      var c = RC[i] * s, n = RS[i] * s;
      var x = rec.sx + rec.sux * c + rec.svx * n;
      var y = rec.sy + rec.suy * c + rec.svy * n;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function bars(ctx, rec, count, phase, rIn, rOut, half) {
    ctx.beginPath();
    for (var i = 0; i < count; i++) {
      var a = phase + i * (TAU / count);
      at(rec, a - half, rIn, P);  ctx.moveTo(P.x, P.y);
      at(rec, a + half, rIn, P);  ctx.lineTo(P.x, P.y);
      at(rec, a + half, rOut, P); ctx.lineTo(P.x, P.y);
      at(rec, a - half, rOut, P); ctx.lineTo(P.x, P.y);
      ctx.closePath();
    }
  }

  function paint(ctx, api, tower, rec) {
    var e = rec.ease;
    if (e <= 0.004 || !rec.shown) return 0;

    var look = lookOf(tower);
    var lift = look.emits ? 0.18 : 0;
    // Everything fades on the ONE envelope, so opening and closing are the same
    // gesture played in opposite directions.
    var A = e;

    // THE FIELD inside the ring. Deliberately faint: it is a membrane, not a
    // light, and at 720p this is the only fill large enough to matter to
    // overdraw at all.
    ringPath(ctx, rec, 1);
    ctx.fillStyle = ink(look.field, 0, 0.13 * A);
    ctx.fill();

    // The halo, for the tiers whose palette emits. One wider stroke of the same
    // ring -- no shadowBlur, no gradient.
    if (look.emits) {
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = ink(look.glyph, 0.1, 0.13 * A);
      ctx.stroke();
    }

    // THE TWO RINGS.
    ctx.lineWidth = 1.9;
    ctx.strokeStyle = ink(look.rim, lift, 0.86 * A);
    ctx.stroke();
    ringPath(ctx, rec, INNER);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = ink(look.rim, lift * 0.5, 0.62 * A);
    ctx.stroke();

    // THE MARKS. Two counter-rotating sets, one fill each. `rec.spin` is
    // continuous, so these are the "main animation" the owner asked for and
    // they run at a constant rate whatever the locks are doing.
    bars(ctx, rec, tickCount(tower), rec.spin, TICK_IN, TICK_OUT, TICK_HALF);
    ctx.fillStyle = ink(look.glyph, lift, 0.9 * A);
    ctx.fill();

    bars(ctx, rec, GLYPH_N,
         rec.spin * (COUNTER_SPIN / SPIN_RAD_PER_SEC) + 0.4,
         GLYPH_IN, GLYPH_OUT, GLYPH_HALF);
    ctx.fillStyle = ink(look.glyph, lift * 0.4, 0.62 * A);
    ctx.fill();

    // THE HUB. Without it the disc is a hole with a fence round it; with it the
    // eye reads a plate, and the beams read as leaving a THING.
    ringPath(ctx, rec, HUB);
    ctx.fillStyle = ink(look.glyph, lift, 0.7 * A);
    ctx.fill();

    // THE TETHER -- what makes it HIS circle rather than a decal floating on
    // the board. Two strands from the hands to the two sides of the rim; one
    // from the staff head to its foot, because a staff is held in one hand.
    var po = api.project(rec.ox, rec.oy, rec.oz);
    if (po) {
      var staff = tiers(tower).a >= 3;
      ctx.beginPath();
      if (staff) {
        at(rec, -Math.PI / 2, 1, P);
        ctx.moveTo(po.x, po.y); ctx.lineTo(P.x, P.y);
      } else {
        at(rec, 0, 1, P);        ctx.moveTo(po.x, po.y); ctx.lineTo(P.x, P.y);
        at(rec, Math.PI, 1, P);  ctx.moveTo(po.x, po.y); ctx.lineTo(P.x, P.y);
      }
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = ink(look.field, lift, 0.42 * A);
      ctx.stroke();
    }
    return 1;
  }

  // ---- entry ---------------------------------------------------------------

  function liveLocksOf(tower) {
    var locks = (typeof tower.visibleLocks === "function")
      ? tower.visibleLocks() : (tower.locks || []);
    liveBuf.length = 0;
    for (var i = 0; i < locks.length; i++) {
      var e = locks[i];
      if (e && !e.dead && !e.leaked && e.pos) liveBuf.push(e);
    }
    return liveBuf;
  }
  var liveBuf = [];

  // Called from gl-world's drawOverlays, at top level, immediately AFTER
  // SiphonFXBeam.draw -- so the circle is painted OVER its own beams.
  //
  // This header used to say BEFORE, and under. It was never true of the call
  // site, and the call site is right: with the cord widths the beam module
  // draws today, putting the disc underneath means the cords cover it and the
  // circle cannot be seen at all. Both orders were captured on the same scene
  // (visual-pass/captures/order-A-full.png and order-B-full.png) before this
  // was settled. Two files claiming opposite orders, each with a comment
  // asserting it achieved the same goal, is how the seam stayed wrong.
  //
  // ONE pinned ground reference for the whole pass, and every height fed to
  // `project` is ABSOLUTE, for the same reason the beam gives: the circle
  // floats above whatever deck the tower stands on, and its beams then run down
  // to a road at a different height.
  function draw(ctx, state, api) {
    if (!ctx || !state || !api || !api.project || !api.withGround) return;
    var towers = state.towers;
    if (!towers || !towers.length) return;
    var now = state.now || 0;
    pass++;

    var saveCap = ctx.lineCap, saveJoin = ctx.lineJoin;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    api.withGround(0, function () {
      for (var i = 0; i < towers.length; i++) {
        var t = towers[i];
        if (!t || !t.constructor || t.constructor.ID !== "siphon") continue;
        var rec = riteFor(t);
        if (!rec) continue;
        advance(t, rec, liveLocksOf(t), now, api);
        paint(ctx, api, t, rec);
      }
    });

    ctx.lineCap = saveCap;
    ctx.lineJoin = saveJoin;
    prune();
  }

  return {
    VERSION: VERSION,
    draw: draw,
    plan: plan,
    reset: reset,
    // Exposed for review and for the harness; nothing in the game calls them.
    beamCount: beamCount,
    state: function (tower) { return rites ? rites.get(tower) : null; },
    constants: {
      IDLE_DWELL_SECONDS: IDLE_DWELL_SECONDS,
      SPIN_UP_SECONDS: SPIN_UP_SECONDS,
      SPIN_DOWN_SECONDS: SPIN_DOWN_SECONDS,
      SPIN_RAD_PER_SEC: SPIN_RAD_PER_SEC,
      SLEW_RAD_PER_SEC: SLEW_RAD_PER_SEC,
      MAX_HOPS_PER_BEAM: MAX_HOPS_PER_BEAM,
      BEAMS_BY_B: BEAMS_BY_B
    }
  };
})();
