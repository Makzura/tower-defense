// THE SOLAR CLOCK. Deterministic, simulation-timed, and it knows nothing else.
//
// This file owns exactly one fact: how far through the day the board is. It
// does not know what a tower is, what a map is, or what the sky looks like --
// EnvironmentLighting turns this into colours and the renderers read that. The
// separation is the point: a gameplay system that wants to ask "is it night"
// must not have to read a renderer variable to find out.
//
// TIME COMES FROM THE FIXED STEP AND NOWHERE ELSE. `update(dt)` is called once
// per simulation step from game.js's update(), which is already gated on the
// run being active and unpaused and already runs more often at 2x and 3x. So
// pausing freezes the sky, speed accelerates it, and the menu has no clock at
// all -- none of which is written here, because all of it is already true of
// the step this rides on. There is no Date.now() in this file and there must
// never be one: a wall clock would make the same run render differently on a
// slow machine and would make every test below a coin toss.
//
// Node-safe: no globals, no DOM, no canvas. The suites drive it directly.
var EnvironmentCycle = (function () {
  "use strict";

  // ONE COMPLETE CYCLE, IN SIMULATION SECONDS. Eight minutes: long enough that
  // a wave is not a season and short enough that a full run sees several.
  var CYCLE_SECONDS = 480;

  // WHERE A RUN OPENS. Not sunrise and not noon -- early morning, with the sun
  // already up and still climbing, so the first thing a player sees is a lit
  // board that is visibly going somewhere.
  var START_PHASE = 0.10;

  // The phase at which each solar event happens. Sunrise is also the cycle
  // boundary, which is why both fire at 0.
  var SUNRISE_PHASE = 0.00;
  var SUNSET_PHASE = 0.50;

  // Visual bands. These name the LOOK, not the lighting: nothing interpolates
  // on these edges, because a light that snaps at a boundary is exactly the
  // artefact this whole system exists to avoid. They are for the diagnostics
  // readout and for anything that wants a word rather than a number.
  var DAWN_END = 0.10;
  var DAY_END = 0.42;
  var DUSK_END = 0.55;

  // How far either side of the horizon the daylight term takes to travel from
  // nothing to everything. Asymmetric on purpose: the sky is already bright a
  // little before the sun clears the horizon, and the last of the light lingers
  // a little after it has gone.
  var DAY_RAMP_LOW = -0.16;
  var DAY_RAMP_HIGH = 0.24;

  var elapsedSeconds = 0;
  var cycleIndex = 0;
  var active = false;
  var listeners = { sunrise: [], sunset: [], cycle: [] };
  var snapshot = null;                 // rebuilt only when the clock moves

  function smoothstep(edge0, edge1, x) {
    if (edge1 === edge0) return x < edge0 ? 0 : 1;
    var t = (x - edge0) / (edge1 - edge0);
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return t * t * (3 - 2 * t);
  }

  function wrapPhase(p) {
    p = p % 1;
    return p < 0 ? p + 1 : p;
  }

  function phaseAt(seconds) {
    return wrapPhase(seconds / CYCLE_SECONDS);
  }

  // THE SUN'S HEIGHT, as a clean -1..1 sine. Zero at both horizon crossings,
  // +1 at noon, -1 at midnight. Everything else derives from this rather than
  // from the phase directly, so there is one definition of "how high is it".
  function elevationAt(phase) {
    return Math.sin(phase * Math.PI * 2);
  }

  function daylightAt(phase) {
    return smoothstep(DAY_RAMP_LOW, DAY_RAMP_HIGH, elevationAt(phase));
  }

  function visualPhaseAt(phase) {
    if (phase < DAWN_END) return "dawn";
    if (phase < DAY_END) return "day";
    if (phase < DUSK_END) return "dusk";
    return "night";
  }

  // DAY IS [0, 0.5) AND NIGHT IS [0.5, 1). Half-open on purpose: exactly one of
  // the two is true at every phase including both crossings, which is what the
  // "mutually exclusive" test pins. The instant of sunrise counts as day and
  // the instant of sunset counts as night, matching the events that fire there.
  function isDayAt(phase) {
    return phase >= SUNRISE_PHASE && phase < SUNSET_PHASE;
  }

  function build(seconds, index) {
    var phase = phaseAt(seconds);
    var elevation = elevationAt(phase);
    var daylight = daylightAt(phase);
    var day = isDayAt(phase);
    return Object.freeze({
      elapsedSeconds: seconds,
      phase: phase,
      cycleIndex: index,
      visualPhase: visualPhaseAt(phase),
      solarPeriod: day ? "day" : "night",
      isDay: day,
      isNight: !day,
      sunElevation: elevation,
      daylight: daylight,
      nightAmount: 1 - daylight,
      active: active
    });
  }

  function invalidate() { snapshot = null; }

  function emit(name, payload) {
    var list = listeners[name];
    if (!list) return;
    // A copy, so a handler that unsubscribes during the callback cannot make
    // the loop skip its neighbour.
    var copy = list.slice();
    for (var i = 0; i < copy.length; i++) copy[i](payload);
  }

  // EVENTS ARE FOUND BY WALKING THE CROSSINGS, not by comparing the phase
  // before and after.
  //
  // A single step can be enormous -- a test may hand this an hour, and a
  // stalled tab hands the accumulator whatever MAX_FRAME_TIME allows -- and a
  // before/after comparison silently loses every crossing but the last, which
  // is how a "sunset fired once" test passes while the game misses four of
  // them. So this counts them: every whole and half turn strictly after the old
  // position and at or before the new one, in order.
  function fireCrossings(fromSeconds, toSeconds) {
    var u0 = fromSeconds / CYCLE_SECONDS;
    var u1 = toSeconds / CYCLE_SECONDS;
    if (u1 <= u0) return;

    // The first half-turn boundary strictly after u0, in units of half-cycles.
    var k = Math.floor(u0 * 2) + 1;
    while (k / 2 <= u1) {
      var at = k / 2;
      if (k % 2 === 0) {
        // A whole turn: the cycle completed and the sun came back up.
        cycleIndex = Math.round(at);
        emit("cycle", { cycleIndex: cycleIndex, atSeconds: at * CYCLE_SECONDS });
        emit("sunrise", { cycleIndex: cycleIndex, atSeconds: at * CYCLE_SECONDS });
      } else {
        emit("sunset", { cycleIndex: cycleIndex, atSeconds: at * CYCLE_SECONDS });
      }
      k++;
    }
  }

  return {
    CYCLE_SECONDS: CYCLE_SECONDS,
    START_PHASE: START_PHASE,
    SUNRISE_PHASE: SUNRISE_PHASE,
    SUNSET_PHASE: SUNSET_PHASE,

    // A RUN BEGINS. Called from startRun and from every restart, so a board is
    // never inherited half-lit from the run before it.
    begin: function () {
      elapsedSeconds = START_PHASE * CYCLE_SECONDS;
      cycleIndex = 0;
      active = true;
      invalidate();
    },

    // A RUN ENDS -- the player left, or the menu opened. The clock stops and
    // says so; it does not rewind, because a victory screen freezes the board
    // it was won on and the sky is part of that board.
    end: function () {
      active = false;
      invalidate();
    },

    // ADVANCE. One call per fixed step, from game.js's update() and from
    // nowhere else. A renderer that calls this is a renderer that makes the
    // sky run at frame rate.
    update: function (dt) {
      if (!active) return;
      if (!(dt > 0)) return;
      var from = elapsedSeconds;
      elapsedSeconds = from + dt;
      invalidate();
      fireCrossings(from, elapsedSeconds);
    },

    state: function () {
      if (!snapshot) snapshot = build(elapsedSeconds, cycleIndex);
      return snapshot;
    },

    // The state a board is shown in when there is no run: the map cards, the
    // model viewers, the title screen. A fixed, flattering late morning, and it
    // is a FUNCTION of a phase rather than a stored copy so it cannot drift.
    idleState: function () {
      return build(0.18 * CYCLE_SECONDS, 0);
    },

    // Sampling without moving: what the sky WOULD be at this phase. Used by the
    // continuity tests and by the development phase override.
    stateAt: function (phase) {
      return build(wrapPhase(phase) * CYCLE_SECONDS, 0);
    },

    on: function (name, fn) {
      if (!listeners[name] || typeof fn !== "function") return function () {};
      listeners[name].push(fn);
      return function () {
        var i = listeners[name].indexOf(fn);
        if (i >= 0) listeners[name].splice(i, 1);
      };
    },

    // THE TESTING SEAM, and it is explicit rather than a reachable private.
    // Tests and the development override set the clock through this; nothing in
    // the game does. Crossings are NOT fired: this is a seek, not elapsed time,
    // and firing sunrise because a developer dragged a slider would be a lie.
    __setPhaseForTest: function (phase, opts) {
      elapsedSeconds = wrapPhase(phase) * CYCLE_SECONDS;
      if (opts && typeof opts.cycleIndex === "number") cycleIndex = opts.cycleIndex;
      if (opts && typeof opts.active === "boolean") active = opts.active;
      invalidate();
    },

    __resetForTest: function () {
      elapsedSeconds = 0;
      cycleIndex = 0;
      active = false;
      listeners = { sunrise: [], sunset: [], cycle: [] };
      invalidate();
    },

    smoothstep: smoothstep
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = EnvironmentCycle;
}
