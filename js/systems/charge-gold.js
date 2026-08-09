// ---------------------------------------------------------------------------
// ChargeMeter -- cumulative damage fills charges; charges multiply gold.
//
//     threshold(n) = 500 * 1.65^(n-1)     damage needed for the nth charge
//                  = 500, 825, 1361, 2246, 3706, 6115, 10090, 16648, 27469 ...
//
// Progress resets to 0 each time a charge lands, and the next threshold is
// larger. Charges keep going past 8 -- the beam tower's A5 raises the cap, so
// a hard stop at 8 would silently cap that upgrade too.
//
// Decay: one charge every DECAY_SECONDS out of combat, and the partial
// progress toward the current charge is thrown away at the same moment. "Out
// of combat" means a tick in which the tower dealt no damage.
//
//     goldMultiplier = min(1 + charges * perCharge, capTotal)
//     goldEarned     = damageDealt * baseGoldPerDamage * goldMultiplier
//
// perCharge and capTotal are NOT constants -- the A5 upgrade recomputes them
// from the player's gold every tick, so they are passed in rather than stored.
// ---------------------------------------------------------------------------

function ChargeMeter(params) {
  this.params = params;   // { firstThreshold, growth, decaySeconds }
  this.charges = 0;
  this.progress = 0;
  this.idleTime = 0;
}

// Damage needed for the nth charge, n starting at 1.
ChargeMeter.prototype.thresholdFor = function (n) {
  return this.params.firstThreshold * Math.pow(this.params.growth, n - 1);
};

// Feed this tick's damage in. Returns how many charges were gained.
ChargeMeter.prototype.addDamage = function (damage) {
  if (damage <= 0) return 0;

  this.idleTime = 0;
  this.progress += damage;

  var gained = 0;
  var need = this.thresholdFor(this.charges + 1);

  // A loop, not an if: one enormous tick can cross several thresholds, and
  // silently swallowing the extras would make big hits worth less than the
  // same damage spread out.
  while (this.progress >= need) {
    this.progress -= need;
    this.charges++;
    gained++;
    need = this.thresholdFor(this.charges + 1);
  }

  // Progress resets on every charge gained -- it does not carry over.
  if (gained > 0) this.progress = 0;

  return gained;
};

// The meter as one continuous number: whole charges plus how far into the
// next one it is. Decay works on this rather than on charges alone, which is
// what makes it drain smoothly instead of dropping a whole charge at a time.
ChargeMeter.prototype.level = function () {
  return this.charges + this.progressFraction();
};

ChargeMeter.prototype.setLevel = function (level) {
  var whole = Math.max(0, Math.floor(level));
  var fraction = Math.max(0, level - whole);
  this.charges = whole;
  this.progress = fraction * this.thresholdFor(whole + 1);
};

// Call on every tick where the tower dealt nothing.
//
// CONTINUOUS decay, one charge per `decaySeconds`. It drains the part-filled
// charge first and then eats into the whole ones, so the bar above the tower
// visibly empties rather than sitting still and then jumping. Stepping whole
// charges (which this used to do) also meant the partial progress vanished
// the instant decay started, which read as a bug.
ChargeMeter.prototype.idle = function (dt) {
  if (this.charges === 0 && this.progress === 0) return;

  var drained = this.level() - dt / this.params.decaySeconds;
  if (drained <= 0) {
    this.charges = 0;
    this.progress = 0;
    return;
  }
  this.setLevel(drained);
};

// How far along the CURRENT charge the meter is, 0..1. For the bar above the
// tower -- thresholds grow by 65% each time, so a raw damage count would tell
// you nothing about how close the next charge is.
ChargeMeter.prototype.progressFraction = function () {
  var need = this.thresholdFor(this.charges + 1);
  if (need <= 0) return 0;
  return Math.max(0, Math.min(1, this.progress / need));
};

ChargeMeter.prototype.goldMultiplier = function (perCharge, capTotal) {
  return Math.min(1 + this.charges * perCharge, capTotal);
};

ChargeMeter.prototype.goldFor = function (damage, baseGoldPerDamage, perCharge, capTotal) {
  return damage * baseGoldPerDamage * this.goldMultiplier(perCharge, capTotal);
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = ChargeMeter;
}
