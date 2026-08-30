// ---------------------------------------------------------------------------
// RampTracker -- damage that grows the longer a beam stays on ONE target.
//
//     rampMult(target) = 1 + min(rampRate * lockedTime, rampCap)
//
// PER TARGET, not per tower. This is the critical property: the beam tower
// reaches 50 simultaneous targets on its B path, and each one carries its own
// independent timer. A tower-wide timer would make the whole mechanic
// meaningless the moment it had more than one beam.
//
// A target's timer resets when the lock on it ends -- whether it died or
// simply walked out of range. (The spec left the out-of-range case open and
// recommended treating it like death; that is what this does. Changing it
// means changing `forget` below and nothing else.)
//
// Parameters come from config and are replaced wholesale by later tiers --
// A4 raises rate 0.15 -> 0.20 and cap 2.0 -> 2.5, giving x3.5 instead of x3.
// ---------------------------------------------------------------------------

function RampTracker(params) {
  this.params = params;          // { rampRate, rampCap }
  this.lockedTime = {};          // enemy key -> seconds held
  this.nextKey = 1;
}

// Enemies are plain objects with no id, so one is stamped on first sight.
// Using a property rather than an array keeps this O(1) at 50 targets.
RampTracker.prototype.keyFor = function (target) {
  if (target.__rampKey === undefined) {
    target.__rampKey = this.nextKey++;
  }
  return target.__rampKey;
};

// Advance the timers of everything currently locked, and drop everything
// that is not. `locked` is the live target list for this tick.
RampTracker.prototype.update = function (dt, locked) {
  var next = {};
  for (var i = 0; i < locked.length; i++) {
    var key = this.keyFor(locked[i]);
    next[key] = (this.lockedTime[key] || 0) + dt;
  }
  this.lockedTime = next;
};

RampTracker.prototype.forget = function (target) {
  delete this.lockedTime[this.keyFor(target)];
};

RampTracker.prototype.timeOn = function (target) {
  return this.lockedTime[this.keyFor(target)] || 0;
};

RampTracker.prototype.multiplier = function (target) {
  var held = this.timeOn(target);
  return 1 + Math.min(this.params.rampRate * held, this.params.rampCap);
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = RampTracker;
}
