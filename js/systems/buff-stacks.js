// ---------------------------------------------------------------------------
// TimedStackTracker (spec 5.2: kill-stack attack speed)
//
// Generic timed-stack buff: each stack has its OWN independent expiry timer
// (adding a stack does not refresh any other stack's timer), up to a
// configurable maximum. This is written with no reference to "kills" or
// "attack speed" specifically -- js/towers/tower-runtime.js decides when to
// call addStack() (on an enemy kill, per the spec) and how to read the count
// (perStackBonus * count, added to fire rate). A future support tower's
// "stacking aura" or similar timed-stack effect can reuse this file as-is.
// ---------------------------------------------------------------------------

function TimedStackTracker(maxStacks, durationSeconds) {
  this.maxStacks = maxStacks;
  this.durationSeconds = durationSeconds;
  this.timers = []; // seconds remaining, one entry per active stack
}

TimedStackTracker.prototype.addStack = function () {
  if (this.timers.length >= this.maxStacks) return false;
  this.timers.push(this.durationSeconds);
  return true;
};

// Ticks every stack's own timer down independently and drops any that
// expire. Order in the array does not matter -- expiry is per-element.
TimedStackTracker.prototype.update = function (dt) {
  var alive = [];
  for (var i = 0; i < this.timers.length; i++) {
    var remaining = this.timers[i] - dt;
    if (remaining > 0) alive.push(remaining);
  }
  this.timers = alive;
};

TimedStackTracker.prototype.count = function () {
  return this.timers.length;
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = TimedStackTracker;
}
