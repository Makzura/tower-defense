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
// **`rampCap` IS THE BONUS ABOVE 1**, so the FINAL multiplier is 1 + cap: the
// design figures x3.0 and x3.5 are 2.0 and 2.5 here. A permanent upgrade
// written against the design figure has to be authored as the bonus.
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

// `rampStart` IS A FLOOR ON THE BONUS, NOT AN ADDITION TO IT. The Siphon's
// Preloaded Lock opens every new lock at x1.25 and the ramp then climbs from
// there toward the SAME cap -- so what the node buys is the first second and a
// half of the climb, never a higher ceiling. Zero on every tier, which makes
// this exactly the old expression for a tower without the node.
RampTracker.prototype.multiplier = function (target) {
  var held = this.timeOn(target);
  var start = this.params.rampStart || 0;
  var earned = Math.max(start, this.params.rampRate * held);
  return 1 + Math.min(earned, this.params.rampCap);
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = RampTracker;
}
