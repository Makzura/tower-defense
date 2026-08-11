// ---------------------------------------------------------------------------
// BlubFXSummon -- THE CEREMONY, for the two summons that are worth waiting for.
//
// Section 12 gives the summoning animation a DURATION BUDGET tied to the
// interval that triggers it:
//
//     interval <= 4 s     0.3 s      a Mini Blub, six a second, no ceremony
//     15 to 30 s          1.5 - 2 s
//     >= 95 s             4 s        the longest animation in the game
//
// and one hard rule under it: AN ANIMATION MAY NEVER OUTLAST THE INTERVAL THAT
// TRIGGERED IT. Everything in this file is derived from that budget rather than
// hand-timed, so a retune of `BlubTower.UNITS` moves the choreography with it.
//
// TWO UNITS QUALIFY and this module owns only those two:
//
//     Mechablub MK2   table interval 30 s, 25 s live at B5   ->  1.83 s
//     SuperBlub       table interval 100 s, 95 s live at B5  ->  4.00 s
//
// THE LIVE INTERVAL IS THE ONE THAT COUNTS, not the table's. B2, B4 and B5 take
// five seconds off every line, and a B5 tower is the only tower that can summon
// either of these -- so the MK2 really arrives every 25 s and the SuperBlub
// every 95 s. 95 is exactly where the brief's top band opens, which is what
// makes the SuperBlub's four seconds the number the brief asks for rather than
// a number this file chose. The MK2 lands at 1.83 s, inside the 1.5-2 s band
// its 25 s belongs to. Both are then clamped to a quarter of their own
// interval, so the rule above holds by construction and would still hold if
// someone gave the MK2 a six second cycle tomorrow.
//
//
// ================== WHO PERFORMS IT, AND WHAT HE ACTUALLY DOES ==============
//
// Section 12 hands the performance to a different object per tier -- the
// summoner himself at base and A1, the grimoire at A2/A3, the totem or the
// grimoire at A4/A5 -- and then states that on path B, B1 through B5, IT IS
// ALWAYS THE SUMMONER. No object ever takes over on path B. Both units here are
// path B and both need B5, so the performer is settled: the man, every time,
// and at B5 the brief's staging is explicit -- he spreads his arms, a portal
// opens, and the unit descends through it.
//
// WHAT THE BODY CAN DO TODAY, stated plainly because it is a real limit and not
// a preference. `js/gl/models/summoner-b5.js` ships `frames: []` and a single
// unnamed group, and `drawActor` returns before the override loop for a model
// with no frames (gl-world.js line ~1110). So there is no arm to raise: the
// per-group override hook this pass documents cannot be driven on this mesh,
// exactly as `js/gl/blub-hp.js` found for the deflation. Three things are still
// reachable through `drawActor(model, x, y, yaw, scale, lift, frame)` and this
// module drives all three -- lift, yaw and scale -- as `performerPose()`:
//
//     he sinks a little while he gathers, sways off his own axis,
//     draws himself up as it comes, and turns his shoulders toward
//     the spot the body is landing on once there IS one.
//
// The gesture proper -- the arms opening -- is carried by the light leaving
// him: two arcs sweeping out of the focus above his head at the release. That
// is a substitution and it is named as one. The moment `tower_summoner.py`
// gives the b5 body an animated `arms` empty and four frames, the honest fix is
// three lines in performerPose(), and there is a note there saying which.
//
//
// ===================== WHEN TWO CEREMONIES COINCIDE ========================
//
// THE SLOWEST WINS. It interrupts or defers the faster one, never the reverse.
// A B5 summoner runs two lines that this module owns -- the MK2 every 25 s and
// the SuperBlub every 95 s -- so they collide roughly every fourth SuperBlub.
//
// One ceremony slot per summoner, and the arbitration is the whole of it: a
// candidate whose interval is LONGER than the running one interrupts it (the
// running one collapses in 0.18 s); a candidate whose interval is shorter or
// equal is dropped for that cycle and its body simply arrives in the ordinary
// summoning circle. Nothing is queued, because a deferred ceremony played late
// would be a ceremony for a body that already landed.
//
// NOTHING IS EVER WRITTEN BACK. Deferring is deferring the ANIMATION. The
// summon itself is `js/blub.js`'s and happens on its own timer whatever this
// module is drawing -- no timer, no rng state, no flag on a blub, no field on a
// tower is touched anywhere in this file. It reads `timers`, `intervalFor`,
// `lineUnits`, `lineIsEnabled`, `summoningHalted`, `blubs`, `x`, `y`,
// `footprintPx` and `unitId`, and it writes canvas calls and three numbers.
//
//
// ======================= BUILT ON THE CIRCLE, NOT BESIDE IT =================
//
// `js/gl/blub-circles.js` already owns the arrival: a circle that lives exactly
// two seconds, and `descentLift(blub)` -- a smootherstep height above the
// surface that makes the body descend rather than fall. This module does not
// draw a second circle and does not replace that descent. It:
//
//   * uses the circle's own voie B palette, constant for constant, so the
//     ceremony and the circle it lands in are one object rather than two
//     effects that happen to coincide,
//   * ADDS to the descent instead of overriding it. `descentLift()` here
//     returns an EXTRA height, on the same "above the surface" contract, which
//     holds the body in the gate for a beat and then lowers it more slowly and
//     from higher up than a Cyberblub. The two curves are summed at the one
//     call site in gl-world's actor loop and both are gentle at both ends, so
//     the sum is too. A heavy unit should take longer to come down than a light
//     one, and this is that difference,
//   * ends when the circle is still on the ground: 4.0 s of ceremony is 2.88 s
//     of preparation before the body exists plus 1.12 s of arrival, and the
//     circle's two seconds start at the spawn. The unit descends INTO its
//     circle, which is the brief's picture, and the circle outlives the
//     ceremony by 0.9 s rather than being cut off by it.
//
//
// ========================= THE SHAPE OF THE THING ==========================
//
// Phase 1, THE CALL (72% of the budget, ending exactly at the spawn). Driven by
// the tower's own countdown rather than by a clock of ours, so it converges on
// the arrival to the frame however the game speed is changed mid-way. A stage
// ring deploys around the summoner's feet -- machined, quantised, cyan, the
// same voice the voie B circle speaks in -- power is drawn INWARD along six
// intake ticks, and motes rise off the rim to a focus above his head. The
// SuperBlub, and only the SuperBlub, gets three beats: the ring pulses at
// T-3, T-2 and T-1 seconds. Ninety-five seconds is long enough that the player
// deserves the warning, and 1.83 s is not long enough to hold three of them.
//
// Phase 2, THE RELEASE (the last 14% of the call). He draws up; two arcs sweep
// out of the focus -- the arms.
//
// Phase 3, THE ARRIVAL (28% of the budget, starting at the spawn). WHERE the
// body lands is not knowable before it lands: `findSpawnPoint` draws from the
// tower's own rng stream and asking it early would consume the stream and
// change the game. So the ceremony is anchored on the summoner for its whole
// preparation, and the moment the spot exists a bolt crosses to it in 0.14 s
// and the gate opens there. The body hangs in the gate while the iris runs
// open, then descends through it into its circle; the iris shuts behind it.
//
// Phase 3', THE FIZZLE. A summon that finds no room does not fire: `js/blub.js`
// holds the timer at zero and places the body the instant a space opens. So the
// ceremony holds its climax for up to 1.2 s and then collapses inward if
// nothing arrived. The board is full; the picture should say so.
//
//
// ============================== COST ========================================
//
// PERF.md: overdraw is the sensitive axis, triangles are not, and a stress
// scene at 4K has ~6 ms of headroom. So, exactly as the circles do:
//
//   * NO FILLS ANYWHERE. Not one translucent disc. Every mark is a stroked
//     path, which is also what keeps the descending body and the road under the
//     gate visible -- section 17.
//   * NO GRADIENTS, no shadowBlur, no filter, no per-frame string building.
//     Every colour is a module constant and every alpha goes through
//     globalAlpha.
//   * SOURCE-OVER, never additive, so a ceremony overlapping a knot of
//     circles converges to the ink instead of climbing past it.
//   * At most FOUR ceremonies alive and THREE drawn, which is already
//     unreachable: it needs three maxed B5 summoners firing within four
//     seconds of each other. A ceremony costs ~22 project() calls and ~110
//     stroked segments per frame -- against the 144 projections the circles
//     budget for themselves, and their 900-segment budget.
//   * The per-frame scan is one property read (`hasB5`) on each tower, which
//     is the only thing every OTHER body on the board pays. `lineUnits()` and
//     `intervalFor()` are only called for towers that passed it.
//
//
// ========================== WIRING (gl-world.js) ============================
//
// This file is a classic script and defines one global. It edits nothing. Five
// insertions, four of them one line, and every one of them guarded so a build
// without this file behaves exactly as it does today.
//
// 0. index.html, beside its siblings:
//
//        <script src="js/gl/blub-circles.js"></script>
//      + <script src="js/gl/blub-summon.js"></script>
//        <script src="js/gl/blub-projectiles.js"></script>
//
//    AFTER blub-circles.js. Not a load-order dependency -- the reference is
//    resolved per call -- but it is the reading order.
//
// 1. `install()`, in the block that binds the other effect modules, right
//    after the BlubFXCircles bind (gl-world.js ~line 744):
//
//        if (typeof BlubFXCircles !== "undefined") {
//          BlubFXCircles.bind({
//            project: project,
//            withGround: withGround,
//            groundHeightAt: groundHeightAt
//          });
//        }
//      + if (typeof BlubFXSummon !== "undefined") {
//      +   BlubFXSummon.bind(BLUB_FX_API);
//      + }
//        if (typeof BlubFXSystems !== "undefined") {
//
//    `BLUB_FX_API` is the object already built for the other modules
//    ({ project, withGround, groundAt }); bind() also accepts the
//    `groundHeightAt` spelling the circles use.
//
// 2. `ensureMap()`, with the other resets (~line 771):
//
//        if (typeof BlubFXCircles !== "undefined") BlubFXCircles.reset();
//      + if (typeof BlubFXSummon !== "undefined") BlubFXSummon.reset();
//
// 3. `drawWorld()`, the summon branch of the actor loop (~line 895). ONE
//    addition beside the descent that is already there:
//
//        if (t.isSummon) {
//          if (typeof BlubFXCircles !== "undefined") {
//            tz += BlubFXCircles.descentLift(t);
//      +     if (typeof BlubFXSummon !== "undefined") {
//      +       tz += BlubFXSummon.descentLift(t);
//      +     }
//          }
//
//    (Inside the BlubFXCircles branch on purpose: this height EXTENDS that
//    descent and is meaningless without it.)
//
// 4. `drawWorld()`, the same loop, the summoner's own body (~line 908).
//    OPTIONAL -- everything else works without it; this is the performer.
//    `performerPose` returns null for every tower that is not mid-ceremony,
//    and the SAME transform must go to the crosspath marks two lines below or
//    they stop being superposable:
//
//      - drawActor(model, t.x + kx, t.y + ky, drawYaw, 1, tz, frame);
//      + var cer = (typeof BlubFXSummon !== "undefined")
//      +   ? BlubFXSummon.performerPose(t) : null;
//      + var cerYaw = drawYaw + (cer ? cer.yaw : 0);
//      + var cerZ = tz + (cer ? cer.lift : 0);
//      + var cerK = cer ? cer.scale : 1;
//      + drawActor(model, t.x + kx, t.y + ky, cerYaw, cerK, cerZ, frame);
//        var marks = (t.constructor && t.constructor.ID === "blub")
//          ? summonerMarks(t) : null;
//        for (var mi = 0; marks && mi < marks.length; mi++) {
//      -   drawActor(marks[mi], t.x + kx, t.y + ky, drawYaw, 1, tz, 0);
//      +   drawActor(marks[mi], t.x + kx, t.y + ky, cerYaw, cerK, cerZ, 0);
//        }
//
//    The returned object is module scratch and is valid until the next call --
//    read it, do not keep it.
//
// 5. `drawOverlays()`. Two calls, in two different layers, because half of
//    this lies on the ground and half of it is in the air.
//
//    (a) the Summoner's ground group (~line 1415), between the shots' ground
//        marks and the circles -- under the arrival circle, which stays the
//        freshest thing on the board:
//
//          if (typeof BlubFXShots !== "undefined") {
//            BlubFXShots.drawGround(ctx, state, BLUB_FX_API);
//          }
//        + if (typeof BlubFXSummon !== "undefined") {
//        +   BlubFXSummon.drawGround(ctx, state);
//        + }
//          if (typeof BlubFXCircles !== "undefined") {
//            BlubFXCircles.draw(ctx, state);
//          }
//
//    (b) the air group (~line 1639), after the blubs' own shots and before the
//        death bursts -- a death is an event and belongs over a ceremony:
//
//          if (typeof BlubFXShots !== "undefined") {
//            BlubFXShots.drawAir(ctx, state, BLUB_FX_API);
//          }
//        + if (typeof BlubFXSummon !== "undefined") {
//        +   BlubFXSummon.drawAir(ctx, state);
//        + }
//          if (typeof BlubFXSystems !== "undefined") {
//            BlubFXSystems.drawDeaths(ctx, state);
//          }
//
//    Whichever of the two runs first drives the frame's update; the second is
//    a no-op on the bookkeeping. Wiring only one of them still works and draws
//    only that half.
//
// ONE THING THE OVERLAY CANNOT DO, said out loud: the 2D canvas is composited
// over the whole GL pass, so the far side of the gate is painted over the body
// standing behind it rather than under it. The rim is therefore drawn with its
// near half at full strength and its far half at a third, which is the cheat
// that reads as depth. At a hairline it costs nothing and no fill exists to
// make it worse.
// ---------------------------------------------------------------------------

var BlubFXSummon = (function () {
  "use strict";

  var TAU = Math.PI * 2;

  // --- the contract with js/blub.js ----------------------------------------

  // The two units that earn a ceremony, and nothing else in the game does.
  // Keyed by id rather than by interval so that a unit whose cycle happens to
  // be long -- a future boss summon, a modded table -- does not silently
  // inherit a four second rite nobody authored for it.
  var ROSTER = { mecha2: true, superb: true };

  // Section 12's ladder, as a function of the LIVE interval. The three anchors
  // are the brief's; the segments between them are linear, which is the only
  // honest reading of a table that gives bands rather than a formula.
  var BUDGET_MIN = 0.30;      // <= 4 s
  var BUDGET_MID_LO = 1.50;   // 15 s
  var BUDGET_MID_HI = 2.00;   // 30 s
  var BUDGET_MAX = 4.00;      // >= 95 s
  var BAND_FAST = 4, BAND_MID_LO = 15, BAND_MID_HI = 30, BAND_SLOW = 95;

  // AND THE RULE OVER THE LADDER: never more than this share of the interval
  // that triggered it. At today's numbers it never binds (4.0 of 95 is 4%,
  // 1.83 of 25 is 7%); it exists so that it cannot ever be the reader's job to
  // notice a retune has made an animation outlast its own cycle.
  var MAX_SHARE = 0.25;

  // How the budget splits. The call ends ON the spawn -- that is the whole
  // point of driving it from the tower's countdown -- so this is also the lead
  // time the module needs.
  var CALL_SHARE = 0.72;      // preparation, before the body exists
  var RELEASE_SHARE = 0.14;   // the tail of the call: he opens
  // and the remaining 28% is the arrival.

  // A ceremony may only be picked up near the top of its window. Catching one
  // at 40% would play a truncated rite, which is worse than the plain circle
  // the body gets anyway. 0.25 s of sim time is fifteen frames at 60 fps and
  // five at 3x speed, so the window is never missed in practice.
  var START_GRACE = 0.25;

  // No room on the board: hold the climax this long, then collapse.
  var HOLD_MAX = 1.20;
  var FIZZLE = 0.35;
  var ABORT = 0.18;           // interrupted by a slower summon

  // THE EXTRA DESCENT, added to the circle's own. Proportional to the body, so
  // the SuperBlub travels furthest, and capped so nothing starts off screen.
  // `js/gl/blub-circles.js` already puts a 52 px SuperBlub at 125 px up; this
  // adds ~55 more and spends the whole arrival window bringing it down.
  var EXTRA_BASE = 14;
  var EXTRA_PER_PX = 0.78;
  var EXTRA_MAX = 62;
  var GATE_HOLD = 0.17;       // share of the arrival spent hanging in the gate

  // The stage he performs on, and the focus above his head.
  var STAGE_K = 1.55;         // x his own footprint: 26 px -> 40 px
  var FOCUS_H = 58;           // px above the surface -- just over his head
  var GATE_K = 1.30;          // x the arriving body's footprint

  // --- the palette ----------------------------------------------------------
  //
  // THE CIRCLE'S OWN INKS, constant for constant (blub-circles.js, voie B).
  // Ley cyan is the player's power in DIRECTION.md's fixed colour meanings, and
  // both of these units are family B machines, so there is nothing to invent
  // here and inventing something would only make the ceremony and the circle
  // look like two unrelated effects that fired together. The two pale inks are
  // hairline-only, for the same reason they are there: twenty stacked marks
  // converge to the ink, and the ink must be mid-value.
  var INK_RITE = "rgb(96,198,222)";
  var INK_DEEP = "rgb(62,142,168)";
  var INK_HOT = "rgb(198,238,246)";
  var INK_GATE = "rgb(120,214,236)";

  var A_STAGE = 0.52;
  var A_INTAKE = 0.34;
  var A_MOTE = 0.42;
  var A_FOCUS = 0.58;
  var A_GATE = 0.62;
  var A_THREAD = 0.26;
  var FAR_DIM = 0.34;         // what the far half of the gate rim is worth

  // --- budget rails ---------------------------------------------------------
  var MAX_LIVE = 4;
  var MAX_DRAWN = 3;

  // --- state ----------------------------------------------------------------
  var records = [];
  var pool = [];
  var byOwner = (typeof Map === "function") ? new Map() : null;
  var byBlub = (typeof Map === "function") ? new Map() : null;
  var claimed = (typeof WeakSet === "function") ? new WeakSet() : null;
  var supported = !!(byOwner && byBlub && claimed);

  var bound = null;
  var clock = 0;              // seconds of SIMULATION time, our own
  var lastBeat = -1;
  var lastPass = -1;
  var serial = 0;

  // --- small maths ----------------------------------------------------------

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  // Gentle at both ends -- the same curve the circle's descent uses, for the
  // same reason: it has to leave slowly, travel, and settle slowly. Summing two
  // smoothersteps gives a curve that is still flat at both ends, which is why
  // the extra descent can simply be added to the circle's.
  function smoother(u) { return u * u * u * (u * (u * 6 - 15) + 10); }

  function stepUp(q, n) { return Math.ceil(q * n) / n; }

  function hash32(a) {
    a = (a ^ 61) ^ (a >>> 16);
    a = (a + (a << 3)) | 0;
    a = a ^ (a >>> 4);
    a = Math.imul(a, 0x27d4eb2d);
    a = a ^ (a >>> 15);
    return a >>> 0;
  }

  function wrapPi(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }

  // --- the clock ------------------------------------------------------------
  //
  // SIMULATION time, derived and never stored, exactly as blub-circles.js
  // derives it and for the same reasons: at 3x a ceremony must play in a third
  // of the wall time (its interval does too), and a paused game must not age
  // it. Keyed on the loop's own frame stamp so it is idempotent within a frame
  // however many entry points touch it.
  //
  // The preparation phase does NOT run off this clock -- it runs off the
  // tower's countdown, which is the same clock seen from the other side and
  // cannot drift away from the event it is counting to. This one times the
  // things that have no countdown: the arrival, the hold, the collapse.
  function beat() {
    var stamp = (typeof lastTime === "number" && lastTime > 0)
      ? lastTime / 1000 : -1;
    if (stamp < 0) return;
    if (lastBeat < 0) { lastBeat = stamp; return; }
    if (stamp === lastBeat) return;
    var dt = stamp - lastBeat;
    lastBeat = stamp;
    if (dt > 0.25) dt = 0.25;

    if (typeof paused !== "undefined" && paused) return;
    if (typeof gameOver !== "undefined" && gameOver) return;
    if (typeof victory !== "undefined" && victory) return;
    if (typeof screen === "string" && screen !== "play") return;

    var speed = (typeof gameSpeed === "number" && gameSpeed > 0) ? gameSpeed : 1;
    clock += dt * speed;
  }

  // --- the budget -----------------------------------------------------------

  function budgetFor(interval) {
    var b;
    if (!(interval > 0)) return 0;
    if (interval <= BAND_FAST) b = BUDGET_MIN;
    else if (interval < BAND_MID_LO) {
      b = BUDGET_MIN + (interval - BAND_FAST) / (BAND_MID_LO - BAND_FAST) *
        (BUDGET_MID_LO - BUDGET_MIN);
    } else if (interval <= BAND_MID_HI) {
      b = BUDGET_MID_LO + (interval - BAND_MID_LO) /
        (BAND_MID_HI - BAND_MID_LO) * (BUDGET_MID_HI - BUDGET_MID_LO);
    } else if (interval < BAND_SLOW) {
      b = BUDGET_MID_HI + (interval - BAND_MID_HI) /
        (BAND_SLOW - BAND_MID_HI) * (BUDGET_MAX - BUDGET_MID_HI);
    } else b = BUDGET_MAX;
    var cap = interval * MAX_SHARE;
    return b < cap ? b : cap;
  }

  // Three beats is a countdown; one beat is a hiccup. Only a rite with room for
  // them gets them, which today means the SuperBlub and only the SuperBlub --
  // and it is the one whose ninety-five second wait makes a warning worth
  // giving.
  function grandFor(budget) { return budget >= 3.0; }

  // --- records --------------------------------------------------------------

  function blank() {
    return {
      owner: null, lineId: "", unitId: "", interval: 0, budget: 0,
      call: 0, arrive: 0, grand: false, seed: 0,
      phase: 0,          // 0 call, 1 hold, 2 arrival, 3 collapsing
      u: 0,              // 0..1 through the call
      left: 0, lastLeft: 0,
      holdT: 0, aT0: 0, dieT: 0, dieFor: 0,
      blub: null, px: 0, py: 0, top: 0, extra: 0, gateR: 20,
      ox: 0, oy: 0, stage: 0, focus: 0
    };
  }

  function retire(r) {
    if (r.owner) byOwner["delete"](r.owner);
    if (r.blub) byBlub["delete"](r.blub);
    r.owner = null;
    r.blub = null;
    pool.push(r);
  }

  function reset() {
    for (var i = 0; i < records.length; i++) retire(records[i]);
    records.length = 0;
    if (byOwner) byOwner.clear();
    if (byBlub) byBlub.clear();
    clock = 0;
    lastBeat = -1;
    lastPass = -1;
  }

  function begin(owner, lineId, unitId, interval, left) {
    var r = pool.length ? pool.pop() : blank();
    r.owner = owner;
    r.lineId = lineId;
    r.unitId = unitId;
    r.interval = interval;
    r.budget = budgetFor(interval);
    r.call = r.budget * CALL_SHARE;
    r.arrive = r.budget - r.call;
    r.grand = grandFor(r.budget);
    r.seed = hash32((owner.x * 131 | 0) ^ ((owner.y * 37 | 0) << 9) ^ (++serial));
    r.phase = 0;
    r.u = 0;
    r.left = left;
    r.lastLeft = left;
    r.holdT = 0;
    r.aT0 = 0;
    r.dieT = 0;
    r.dieFor = 0;
    r.blub = null;
    r.px = owner.x;
    r.py = owner.y;
    r.top = 0;
    r.extra = 0;
    r.gateR = 20;
    r.ox = owner.x;
    r.oy = owner.y;
    r.stage = (owner.footprintPx > 0 ? owner.footprintPx : 24) * STAGE_K;
    r.focus = FOCUS_H;

    // EVERY BODY THIS TOWER ALREADY HAS IS NOT THE ONE WE ARE WAITING FOR.
    // Marking them here, once, is what makes "the newest unclaimed body of our
    // unit" an exact test later instead of a heuristic -- and it costs one walk
    // of a short array at the start of a rite that runs every 25 seconds.
    var list = owner.blubs;
    for (var i = 0; list && i < list.length; i++) claimed.add(list[i]);

    records.push(r);
    byOwner.set(owner, r);
    while (records.length > MAX_LIVE) retire(records.shift());
    return r;
  }

  function collapse(r, over) {
    if (r.phase === 3) return;
    r.phase = 3;
    r.dieT = clock;
    r.dieFor = over;
  }

  // --- the pass -------------------------------------------------------------
  //
  // One scan per frame, idempotent on the loop's frame stamp so both draw
  // entry points can drive it and only the first one in a frame does.

  function alive(t) {
    if (!t) return false;
    if (t.isDestroyed && t.isDestroyed()) return false;
    return true;
  }

  // The line this summoner should be performing for, or null: the SLOWEST of
  // the lines that are inside their window. Slowest wins is the whole rule, and
  // it is decided here rather than at interrupt time so that two lines coming
  // due in the same frame cannot resolve in array order.
  var _cLine = "", _cUnit = "", _cIv = 0, _cLeft = 0;

  function candidate(t) {
    _cLine = "";
    var units = t.lineUnits();
    var ids = BlubTower.LINE_IDS;
    for (var i = 0; i < ids.length; i++) {
      var lineId = ids[i];
      var unitId = units[lineId];
      if (!unitId || ROSTER[unitId] !== true) continue;
      if (typeof t.lineIsEnabled === "function" && !t.lineIsEnabled(lineId)) continue;
      var left = t.timers[lineId];
      if (left === undefined) continue;
      var iv = t.intervalFor(unitId);
      if (!(iv > 0)) continue;
      var call = budgetFor(iv) * CALL_SHARE;
      if (left > call) continue;                       // not in its window yet
      if (left < call - START_GRACE) continue;         // missed the top of it
      if (iv <= _cIv && _cLine) continue;
      _cLine = lineId; _cUnit = unitId; _cIv = iv; _cLeft = left;
    }
    return _cLine ? true : false;
  }

  // The body we have been waiting for, or null. Newest first, because
  // `owner.blubs` is push-ordered and the one that just landed is the last.
  function findArrival(r) {
    var list = r.owner.blubs;
    if (!list) return null;
    for (var i = list.length - 1; i >= 0; i--) {
      var b = list[i];
      if (!b || b.unitId !== r.unitId) continue;
      if (claimed.has(b)) continue;
      return b;
    }
    return null;
  }

  function attach(r, b) {
    claimed.add(b);
    r.blub = b;
    r.phase = 2;
    r.aT0 = clock;
    r.px = b.x;
    r.py = b.y;
    var fp = b.footprintPx > 0 ? b.footprintPx : 24;
    r.gateR = fp * GATE_K;
    var e = EXTRA_BASE + EXTRA_PER_PX * fp;
    r.extra = e > EXTRA_MAX ? EXTRA_MAX : e;
    // The gate opens where the body IS, so it is pinned to the height the
    // circle's descent starts at plus our own -- asked of the circle rather
    // than recomputed, so the two can never disagree about where the top is.
    var base = (typeof BlubFXCircles !== "undefined" && BlubFXCircles.descentLift)
      ? BlubFXCircles.descentLift(b) : 0;
    r.top = base + r.extra;
    byBlub.set(b, r);
  }

  // Claimed from `descentLift`, which gl-world calls in the WORLD pass -- one
  // pass before this module's own scan runs in the overlay pass. Without it the
  // body spends its first frame at the circle's height and jumps up by the
  // extra on the second, which is a visible pop on the one frame the player is
  // most likely to be looking at. blub-circles answers the same one-frame
  // question the same way, from the other end.
  function claimEarly(blub) {
    if (!blub || claimed.has(blub)) return null;
    var owner = blub.owner;
    if (!owner) return null;
    var r = byOwner.get(owner);
    if (!r || r.blub || r.phase > 1) return null;
    if (r.unitId !== blub.unitId) return null;
    attach(r, blub);
    return r;
  }

  function pass(state) {
    beat();
    var stamp = (typeof lastTime === "number") ? lastTime : -1;
    if (stamp >= 0 && stamp === lastPass) return;
    lastPass = stamp;

    var i, r;

    // 1. advance what is running
    for (i = 0; i < records.length; i++) {
      r = records[i];
      var t = r.owner;
      if (!alive(t) || t.summoningHalted) { collapse(r, ABORT); continue; }

      if (r.phase === 0 || r.phase === 1) {
        // The line can go away underneath a ceremony: switched off, or the unit
        // changed because something was bought mid-rite.
        var stillOurs = t.lineUnits()[r.lineId] === r.unitId &&
          (typeof t.lineIsEnabled !== "function" || t.lineIsEnabled(r.lineId));
        if (!stillOurs) { collapse(r, ABORT); continue; }

        var left = t.timers[r.lineId];
        if (left === undefined) { collapse(r, ABORT); continue; }
        r.lastLeft = r.left;
        r.left = left;
        r.u = clamp01(1 - left / r.call);

        // The body may already be standing: `update()` runs before `draw()`, so
        // the frame that shows the timer at zero is the frame the blub exists
        // in. A timer that jumped back UP is the same event seen after the fact.
        if (left <= 0 || left > r.lastLeft + 0.001) {
          var b = findArrival(r);
          if (b) { attach(r, b); continue; }
          r.phase = 1;
          r.holdT += (left <= 0) ? 0 : 0;
        }
        if (r.phase === 1) {
          r.holdT = r.holdT || 0;
          r.u = 1;
        }
      }

      if (r.phase === 1) {
        // No room. Hold the climax, then let it go.
        r.holdT += 0;
        if (clock - (r.holdStart || (r.holdStart = clock)) > HOLD_MAX) {
          collapse(r, FIZZLE);
        }
      } else if (r.phase === 2) {
        if (clock - r.aT0 >= r.arrive) { retire(r); records[i] = null; }
      } else if (r.phase === 3) {
        if (clock - r.dieT >= r.dieFor) { retire(r); records[i] = null; }
      }
    }
    // compact
    var w = 0;
    for (i = 0; i < records.length; i++) {
      if (records[i]) records[w++] = records[i];
    }
    records.length = w;

    // 2. look for new ones
    var list = (state && state.towers) ||
      ((typeof towers !== "undefined") ? towers : null);
    if (!list || typeof BlubTower === "undefined") return;

    for (i = 0; i < list.length; i++) {
      var tw = list[i];
      // THE ONE TEST EVERY OTHER BODY ON THE BOARD PAYS. Only a B5 summoner can
      // put a Mechablub MK2 or a SuperBlub on the board (lineUnits: main is
      // mecha2 only under B5, heavy is superb only under B5), so this is exact
      // rather than a cheap filter -- and it is one property read on each of
      // the three hundred blubs a late board carries.
      if (!tw || tw.hasB5 !== true || tw.isSummon) continue;
      if (tw.summoningHalted || !alive(tw)) continue;
      if (typeof tw.lineUnits !== "function") continue;

      _cIv = 0;
      if (!candidate(tw)) continue;

      var run = byOwner.get(tw);
      if (run) {
        // ONE SLOT, AND THE SLOWEST WINS. A longer interval interrupts what is
        // running; anything else is dropped for this cycle and its body arrives
        // in the plain circle. Never queued: a rite played after its body
        // landed is a rite for nothing.
        if (run.phase !== 3 && _cIv > run.interval) {
          collapse(run, ABORT);
          byOwner["delete"](run.owner);
          run.owner = null;                      // the slot is free again
          begin(tw, _cLine, _cUnit, _cIv, _cLeft);
        }
        continue;
      }
      begin(tw, _cLine, _cUnit, _cIv, _cLeft);
    }
  }

  // --- projection -----------------------------------------------------------
  //
  // The same affine-ellipse basis blub-circles uses, and the same trade: a
  // ground circle under a perspective camera is a conic, and this draws the
  // ellipse through its two axes instead. Under a pixel of error at these radii
  // and a tenth of the projection work.
  var _api = null;
  var _cx = 0, _cy = 0, _cs = 1, _ax = 0, _ay = 0, _bx = 0, _by = 0, _ok = false;
  var _px = 0, _py = 0, _pr = 0, _pz = 0;

  function basis() {
    _ok = false;
    var p = _api.project(_px, _py, _pz);
    if (!p) return;
    var a = _api.project(_px + _pr, _py, _pz);
    if (!a) return;
    var b = _api.project(_px, _py + _pr, _pz);
    if (!b) return;
    _cx = p.x; _cy = p.y; _cs = p.scale || 1;
    _ax = a.x - p.x; _ay = a.y - p.y;
    _bx = b.x - p.x; _by = b.y - p.y;
    _ok = true;
  }

  function groundBasis(x, y, r, z) {
    _px = x; _py = y; _pr = r; _pz = z;
    if (_api.withGround && _api.groundAt) {
      _api.withGround(_api.groundAt(x, y), basis);
    } else basis();
    return _ok;
  }

  function local(ctx, ang) {
    ctx.save();
    ctx.transform(_ax, _ay, _bx, _by, _cx, _cy);
    if (ang) ctx.rotate(ang);
  }

  function stroke(ctx, ink, alpha, width) {
    if (alpha <= 0.008) return;
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.strokeStyle = ink;
    ctx.lineWidth = width < 0.5 ? 0.5 : width;
    ctx.stroke();
  }

  function arcAt(ctx, radius, from, to) {
    ctx.moveTo(Math.cos(from) * radius, Math.sin(from) * radius);
    ctx.arc(0, 0, radius, from, to);
  }

  function spoke(ctx, ang, r0, r1) {
    var c = Math.cos(ang), s = Math.sin(ang);
    ctx.moveTo(c * r0, s * r0);
    ctx.lineTo(c * r1, s * r1);
  }

  // 0..1 across the whole rite, for the things that do not care which phase
  // they are in.
  function phaseOf(r) {
    if (r.phase === 2) return clamp01((clock - r.aT0) / r.arrive);
    return 0;
  }

  function fadeOf(r) {
    if (r.phase !== 3) return 1;
    return clamp01(1 - (clock - r.dieT) / r.dieFor);
  }

  // --- the ground: his stage ------------------------------------------------

  function paintStage(ctx, r) {
    if (!groundBasis(r.ox, r.oy, r.stage, 0.4)) return;

    var fade = fadeOf(r);
    var u = r.u;
    // Deployed as a wiper sweep, quantised: the same machine voice the voie B
    // circle speaks in, because this is the same machine talking.
    var dep = clamp01(u / 0.16);
    var swept = TAU * dep;
    var spin = stepUp((clock * 0.42) % 1, 24) * TAU;
    var lw = 1.5 * _cs;
    if (lw < 0.6) lw = 0.6; else if (lw > 2.6) lw = 2.6;

    // As it comes, the stage tightens: the ring pulls in by a few percent over
    // the call, which is the cheapest possible way to say "loading" without
    // adding a mark.
    var k = 1 - 0.045 * u;

    local(ctx, spin);
    ctx.beginPath();
    arcAt(ctx, k, 0, swept);
    for (var b = 0; b < 6; b++) {
      var ba = Math.PI / 6 + b * (TAU / 6);
      if (ba > swept) break;
      var br = k * 1.08;
      var c0 = Math.cos(ba - 0.10), s0 = Math.sin(ba - 0.10);
      var c1 = Math.cos(ba + 0.10), s1 = Math.sin(ba + 0.10);
      ctx.moveTo(c0 * br, s0 * br);
      ctx.lineTo(c1 * br, s1 * br);
    }
    ctx.restore();
    stroke(ctx, INK_RITE, A_STAGE * fade * (0.55 + 0.45 * u), lw * 1.1);

    // THE INTAKE. Six ticks travelling INWARD, which is the only direction that
    // means "gathering" -- outward would read as a discharge, which is what the
    // gate does later and must not be confused with.
    var n = 6;
    local(ctx, 0);
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var f = ((clock * 0.9 + i / n) % 1);
      var rr = 1.34 - 0.30 * f;
      var a = i * (TAU / n) + spin * 0.25;
      if (a > swept) continue;
      spoke(ctx, a, rr, rr + 0.09 + 0.05 * (1 - f));
    }
    ctx.restore();
    stroke(ctx, INK_DEEP, A_INTAKE * fade * (0.4 + 0.6 * u), lw * 0.85);

    // THE THREE BEATS, on the rite that has room for them. T-3, T-2, T-1: the
    // player's warning that the ninety-five second body is coming.
    if (r.grand && r.phase === 0 && r.left > 0 && r.left <= 3.02) {
      var f2 = r.left - Math.floor(r.left);
      var age = 1 - f2;
      if (age < 0.22) {
        var hit = 1 - age / 0.22;
        local(ctx, 0);
        ctx.beginPath();
        arcAt(ctx, k * (1.02 + 0.16 * (1 - hit)), 0, TAU);
        ctx.restore();
        stroke(ctx, INK_GATE, 0.5 * hit * hit * fade, lw);
      }
    }

    // The collapse: the stage shrinks into itself rather than dimming, so a
    // board with no room says "nothing came" instead of "the effect stopped".
    if (r.phase === 3) {
      local(ctx, spin);
      ctx.beginPath();
      arcAt(ctx, k * fade, 0, TAU);
      ctx.restore();
      stroke(ctx, INK_DEEP, 0.4 * fade, lw);
    }
  }

  // --- the air: motes, focus, the opening, the bolt, the gate ---------------

  // Straight lines stay straight under a projective map, so a mote travelling a
  // straight world line can be interpolated between its two PROJECTED ends. It
  // costs one projection per mote instead of two per mote per frame, and the
  // only thing it gives up is a perfectly uniform speed along the line, which
  // nothing on a 0.4 s spark can see.
  function paintMotes(ctx, r, fx, fy, fade) {
    var n = r.grand ? 9 : 5;
    var lw = 1.0;
    ctx.beginPath();
    var any = false;
    for (var i = 0; i < n; i++) {
      var seed = hash32(r.seed + i * 7919);
      var a = (seed % 6283) / 1000;
      var f = ((clock * (r.grand ? 0.62 : 0.95) + i / n) % 1);
      // They only start arriving once the stage is down.
      if (r.u < 0.12) continue;
      var p = _api.project(r.ox + Math.cos(a) * r.stage,
                           r.oy + Math.sin(a) * r.stage, 2);
      if (!p) continue;
      var e = f * f * (3 - 2 * f);           // slow off the ground, fast at the top
      var x0 = p.x + (fx - p.x) * e;
      var y0 = p.y + (fy - p.y) * e;
      var tail = 0.10 + 0.06 * (1 - f);
      var x1 = p.x + (fx - p.x) * Math.max(0, e - tail);
      var y1 = p.y + (fy - p.y) * Math.max(0, e - tail);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x0, y0);
      any = true;
    }
    if (any) stroke(ctx, INK_RITE, A_MOTE * fade * (0.3 + 0.7 * r.u), lw);
  }

  // What is gathering above his head. Screen space on purpose: it is light in
  // mid-air with no surface to lie on, which is exactly the case DIRECTION.md
  // leaves to canvas.
  function paintFocus(ctx, r, fx, fy, fade) {
    var u = r.u;
    var grow = 3.5 + 9 * u * u;
    var rel = releaseOf(r);
    var lw = 1.1;

    ctx.beginPath();
    ctx.moveTo(fx + grow, fy);
    ctx.arc(fx, fy, grow, 0, TAU);
    if (u > 0.3) {
      ctx.moveTo(fx + grow * 1.7, fy);
      ctx.arc(fx, fy, grow * 1.7, 0, TAU);
    }
    stroke(ctx, INK_RITE, A_FOCUS * fade * (0.35 + 0.65 * u), lw);

    // Ticks around it, quantised: it is being wound, not lit.
    if (u > 0.45) {
      ctx.beginPath();
      var n = r.grand ? 8 : 5;
      var spin = stepUp((clock * 0.7) % 1, n) * TAU;
      for (var i = 0; i < n; i++) {
        var a = spin + i * (TAU / n);
        var c = Math.cos(a), s = Math.sin(a);
        ctx.moveTo(fx + c * grow * 2.0, fy + s * grow * 2.0);
        ctx.lineTo(fx + c * grow * 2.5, fy + s * grow * 2.5);
      }
      stroke(ctx, INK_DEEP, 0.45 * fade * (u - 0.45) / 0.55, 1);
    }

    // THE ARMS. The b5 mesh has no rig (see the header), so the gesture is the
    // light leaving him: two arcs sweeping open, left and right, through the
    // release. When the model gains an animated `arms` group this is the thing
    // that becomes redundant, and the note in performerPose says how.
    if (rel > 0) {
      var open = smoother(rel);
      var span = 0.20 + 1.05 * open;
      var rad = grow * (2.2 + 4.5 * open);
      ctx.beginPath();
      ctx.arc(fx, fy, rad, -Math.PI / 2 - span, -Math.PI / 2 - 0.14);
      ctx.moveTo(fx + Math.cos(-Math.PI / 2 + 0.14) * rad,
                 fy + Math.sin(-Math.PI / 2 + 0.14) * rad);
      ctx.arc(fx, fy, rad, -Math.PI / 2 + 0.14, -Math.PI / 2 + span);
      stroke(ctx, INK_HOT, 0.55 * (1 - open * 0.45) * fade, 1.2);
    }
  }

  // 0 before the release, 0..1 through it.
  function releaseOf(r) {
    if (r.phase === 1) return 1;
    if (r.phase !== 0) return 0;
    var start = 1 - RELEASE_SHARE / CALL_SHARE;
    if (r.u < start) return 0;
    return clamp01((r.u - start) / (1 - start));
  }

  // The bolt that carries the rite to a spot that did not exist until now.
  function paintBolt(ctx, r, fx, fy, gx, gy, fade) {
    var a = phaseOf(r);
    var span = 0.14 / r.arrive;
    if (a > span) return;
    var q = clamp01(a / span);
    var hx = fx + (gx - fx) * q;
    var hy = fy + (gy - fy) * q;
    // One kink, deterministic, perpendicular to the run: a straight line is a
    // laser and this is a discharge.
    var dx = gx - fx, dy = gy - fy;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len;
    var kick = ((hash32(r.seed) % 200) / 100 - 1) * 7;
    var mx = fx + dx * 0.5 + nx * kick;
    var my = fy + dy * 0.5 + ny * kick;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    if (q > 0.5) {
      ctx.lineTo(mx, my);
      ctx.lineTo(hx, hy);
    } else {
      ctx.lineTo(hx, hy);
    }
    stroke(ctx, INK_HOT, 0.7 * (1 - q * 0.5) * fade, 1.3);
  }

  // THE GATE. An iris of straight chords retracting to the rim, on the ground
  // plane at the height the body appears at, so the unit comes down THROUGH it.
  // No fill: what is under it stays readable, and the body is never painted
  // over by the thing it is arriving through.
  function paintGate(ctx, r, fade) {
    var a = phaseOf(r);
    if (!groundBasis(r.px, r.py, r.gateR, r.top)) return;
    var lw = 1.4 * _cs;
    if (lw < 0.6) lw = 0.6; else if (lw > 2.4) lw = 2.4;

    var open = clamp01(a / 0.22);
    var shut = clamp01((a - 0.72) / 0.28);
    var k = 1 - 0.10 * shut;
    var petals = r.grand ? 8 : 6;
    var d = 0.06 + 0.94 * smoother(open) - 0.9 * smoother(shut);
    if (d < 0.04) d = 0.04;
    if (d > 1) d = 1;

    // The rim, in two halves. The near half is the arc whose points sit lowest
    // on screen; +y in local space maps to (bx, by), so the extreme of screen y
    // is at atan2(by, ay) and the near half is the quarter turn either side of
    // it. Cheating the far half down to a third is what stands in for the
    // depth sort the overlay cannot have.
    var tNear = Math.atan2(_by, _ay);
    local(ctx, 0);
    ctx.beginPath();
    arcAt(ctx, k, tNear - Math.PI / 2, tNear + Math.PI / 2);
    ctx.restore();
    stroke(ctx, INK_GATE, A_GATE * fade, lw * 1.2);

    local(ctx, 0);
    ctx.beginPath();
    arcAt(ctx, k, tNear + Math.PI / 2, tNear + Math.PI * 1.5);
    ctx.restore();
    stroke(ctx, INK_GATE, A_GATE * FAR_DIM * fade, lw);

    // The petals: chord i sits at distance d from the centre, so d = 0 is a
    // star through the middle (shut) and d = 1 is a ring of points on the rim
    // (open). Half-length is sqrt(1 - d*d), which is the chord of the circle it
    // is retracting into -- the iris is exact rather than eyeballed.
    var half = Math.sqrt(Math.max(0, 1 - d * d)) * k;
    local(ctx, stepUp((clock * 0.5) % 1, petals * 2) * TAU);
    ctx.beginPath();
    for (var i = 0; i < petals; i++) {
      var th = i * (TAU / petals);
      var c = Math.cos(th), s = Math.sin(th);
      var mx = c * d * k, my = s * d * k;
      ctx.moveTo(mx - s * half, my + c * half);
      ctx.lineTo(mx + s * half, my - c * half);
    }
    ctx.restore();
    stroke(ctx, INK_RITE, (A_GATE * 0.72) * fade * (1 - shut * 0.4), lw * 0.9);

    // A hairline flare on the frame it opens, and nowhere else.
    if (open < 1) {
      local(ctx, 0);
      ctx.beginPath();
      arcAt(ctx, k * (1.04 + 0.10 * (1 - open)), 0, TAU);
      ctx.restore();
      stroke(ctx, INK_HOT, 0.5 * (1 - open) * fade, lw * 0.8);
    }
  }

  // The column the body is coming down. Two projections, three sliding ticks:
  // it exists to tie the gate to the circle underneath it, not to be looked at.
  function paintThread(ctx, r, fade) {
    var a = phaseOf(r);
    if (a > 0.94) return;
    var top = _api.project(r.px, r.py, r.top);
    var foot = _api.project(r.px, r.py, 1);
    if (!top || !foot) return;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(foot.x, foot.y);
    stroke(ctx, INK_DEEP, A_THREAD * fade * (1 - a), 1);

    ctx.beginPath();
    for (var i = 0; i < 3; i++) {
      var f = ((clock * 1.6 + i / 3) % 1);
      var y = top.y + (foot.y - top.y) * f;
      var x = top.x + (foot.x - top.x) * f;
      var w = 5 * (1 - f) + 2;
      ctx.moveTo(x - w, y);
      ctx.lineTo(x + w, y);
    }
    stroke(ctx, INK_RITE, 0.35 * fade * (1 - a), 1);
  }

  // --- the two draw entry points -------------------------------------------

  function ready(ctx, api) {
    if (!supported || !ctx) return false;
    _api = api || bound;
    return !!(_api && typeof _api.project === "function");
  }

  function drawGround(ctx, state, api) {
    if (!ready(ctx, api)) return;
    pass(state);
    if (!records.length) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Stated rather than assumed, as the circles state it: the whole
    // readability argument is that a stack converges to the ink.
    ctx.globalCompositeOperation = "source-over";
    var n = 0;
    for (var i = records.length - 1; i >= 0 && n < MAX_DRAWN; i--) {
      paintStage(ctx, records[i]);
      n++;
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    _api = null;
  }

  function drawAir(ctx, state, api) {
    if (!ready(ctx, api)) return;
    pass(state);
    if (!records.length) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "source-over";
    var n = 0;
    for (var i = records.length - 1; i >= 0 && n < MAX_DRAWN; i--) {
      var r = records[i];
      n++;
      var fade = fadeOf(r);
      var f = _api.project(r.ox, r.oy, r.focus);
      if (!f) continue;
      if (r.phase < 2) {
        paintMotes(ctx, r, f.x, f.y, fade);
        paintFocus(ctx, r, f.x, f.y, fade);
      } else if (r.phase === 2) {
        var g = _api.project(r.px, r.py, r.top);
        if (g) {
          paintBolt(ctx, r, f.x, f.y, g.x, g.y, fade);
          paintThread(ctx, r, fade);
          paintGate(ctx, r, fade);
        }
      } else if (r.blub) {
        paintGate(ctx, r, fade);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    _api = null;
  }

  // --- what the renderer asks for -------------------------------------------

  // EXTRA height above the surface, to be ADDED to BlubFXCircles.descentLift.
  // Returns 0 for everything else, so the call site is one unconditional
  // addition beside the one already there.
  //
  // The body hangs in the gate for the first sixth of the arrival while the
  // iris runs open, then comes down on a smootherstep that lands exactly at the
  // end of the ceremony's budget. Both curves are flat at both ends, so their
  // sum is: the descent slows into the ground rather than arriving at speed.
  function descentLift(blub) {
    if (!supported || !blub || blub.isSummon !== true) return 0;
    if (!blub.unitId || ROSTER[blub.unitId] !== true) return 0;
    beat();
    var r = byBlub.get(blub);
    if (!r) {
      r = claimEarly(blub);
      if (!r) return 0;
    }
    if (r.phase !== 2) return 0;
    var a = (clock - r.aT0) / r.arrive;
    if (a >= 1) return 0;
    if (a <= GATE_HOLD) return r.extra;
    var u = (a - GATE_HOLD) / (1 - GATE_HOLD);
    return r.extra * (1 - smoother(u));
  }

  // THE PERFORMER. A live pose for the summoner's own body, or null.
  //
  // Reused scratch -- read it and drop it. Three numbers because three numbers
  // are what `drawActor` will take on a mesh with no frames and no groups:
  //
  //   lift   px above the surface. He sinks while he gathers and draws up as
  //          it comes.
  //   yaw    RADIANS ADDED to whatever the caller was going to use, so it is
  //          independent of the authored front. A sway while he works, then a
  //          turn of the shoulders toward the spot -- clamped to 0.7 rad,
  //          because a summoner who spins to face a body behind him is a
  //          turret, not a man.
  //   scale  a breath. Capped at 2.5%: this is not a size class, and section 9
  //          spends the scale budget on anti-carpet variation.
  //
  // WHEN THE MESH GETS A RIG: `tools/blender/tower_summoner.py` gives the b5
  // body an animated `arms` empty and four frames, `drawActor` starts running
  // its override loop, and this function returns an `overrides` field --
  // { arms: mat4 } built from releaseOf(r) -- alongside the three numbers. The
  // arcs in paintFocus then become the light around the gesture instead of the
  // gesture itself, and nothing else in this file changes.
  var _pose = { lift: 0, yaw: 0, scale: 1 };

  function performerPose(tower) {
    if (!supported || !tower) return null;
    var r = byOwner.get(tower);
    if (!r) return null;
    beat();
    var fade = fadeOf(r);
    var lift = 0, yaw = 0, scale = 1;

    if (r.phase === 0 || r.phase === 1) {
      var u = r.u;
      // Down into the work, then up as it arrives.
      var sink = -2.4 * Math.sin(Math.PI * clamp01(u / 0.62));
      var rise = 5.0 * smoother(releaseOf(r));
      lift = sink + rise;
      scale = 1 + 0.014 * u + 0.010 * smoother(releaseOf(r));
      // Never quite still: two slow sines, the same trick the chalk circle uses
      // to keep a hand-cut ring from looking motorised.
      yaw = 0.055 * Math.sin(clock * 2.3 + r.seed % 6) * (0.3 + 0.7 * u);
    } else if (r.phase === 2) {
      var a = phaseOf(r);
      lift = 5.0 * (1 - clamp01(a / 0.55));
      scale = 1 + 0.024 * (1 - clamp01(a / 0.7));
      // He directs it: a partial turn toward the spot, held while it comes
      // down and released as it lands.
      var want = Math.atan2(r.py - r.oy, r.px - r.ox);
      var d = wrapPi(want - (tower.aim || 0));
      if (d > 0.7) d = 0.7; else if (d < -0.7) d = -0.7;
      var into = clamp01(a / 0.22);
      var out = 1 - clamp01((a - 0.7) / 0.3);
      yaw = d * smoother(into) * out;
    } else {
      lift = 2.0 * fade;
      scale = 1;
      yaw = 0;
    }

    _pose.lift = lift;
    _pose.yaw = yaw;
    _pose.scale = scale;
    return _pose;
  }

  function bind(api) {
    if (!api) { bound = null; return; }
    bound = {
      project: api.project,
      withGround: api.withGround,
      groundAt: api.groundAt || api.groundHeightAt
    };
  }

  return {
    bind: bind,
    // Optional: the host may drive the scan explicitly (the harness does).
    // Both draw entry points drive it themselves, idempotently.
    update: function (state) { if (supported) pass(state); },
    drawGround: drawGround,
    drawAir: drawAir,
    descentLift: descentLift,
    performerPose: performerPose,
    reset: reset,
    budgetFor: budgetFor,
    // Read-only, for the perf pass and for a review that wants to know which
    // phase it is looking at without guessing from the picture.
    stats: function () {
      var out = { live: records.length, clock: +clock.toFixed(2), rites: [] };
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        out.rites.push({
          unit: r.unitId, line: r.lineId, interval: r.interval,
          budget: +r.budget.toFixed(2), phase: r.phase,
          u: +r.u.toFixed(3), left: +(r.left || 0).toFixed(2),
          arrival: r.phase === 2 ? +phaseOf(r).toFixed(3) : null,
          extra: +r.extra.toFixed(1), top: +r.top.toFixed(1)
        });
      }
      return out;
    }
  };
})();
