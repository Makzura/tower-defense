// ---------------------------------------------------------------------------
// ReloadTracker (spec 5.3)
//
// "Shot counter. Shots 1-4 fire normally; after the 4th the tower is
//  inactive for 1s, then the counter resets. Reload duration is NOT
//  affected by fireRate."
//
// Generic: shotsBeforeReload and reloadDurationSeconds both come from
// config (mechanics.reload) rather than being hardcoded 4 and 1 here.
// ---------------------------------------------------------------------------

function ReloadTracker(shotsBeforeReload, reloadDurationSeconds) {
  this.shotsBeforeReload = shotsBeforeReload;
  this.reloadDurationSeconds = reloadDurationSeconds;
  this.shotsFired = 0;      // shots fired since the last reload, 0..shotsBeforeReload-1
  this.reloading = false;
  this.reloadTimer = 0;
}

ReloadTracker.prototype.canFire = function () {
  return !this.reloading;
};

// True if the NEXT shot fired is the one immediately preceding a reload
// (the 4th of 4) -- spec 5.5/B5 hooks a guaranteed crit + full execute bonus
// onto exactly this shot.
ReloadTracker.prototype.nextShotIsFinalBeforeReload = function () {
  return this.shotsFired === this.shotsBeforeReload - 1;
};

// Call once per shot actually fired. Reload duration is independent of fire
// rate -- it is a flat timer started here, not scaled by anything.
ReloadTracker.prototype.recordShot = function () {
  this.shotsFired++;
  if (this.shotsFired >= this.shotsBeforeReload) {
    this.reloading = true;
    this.reloadTimer = this.reloadDurationSeconds;
    this.shotsFired = 0;
  }
};

ReloadTracker.prototype.update = function (dt) {
  if (!this.reloading) return;
  this.reloadTimer -= dt;
  if (this.reloadTimer <= 0) {
    this.reloading = false;
    this.reloadTimer = 0;
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = ReloadTracker;
}
