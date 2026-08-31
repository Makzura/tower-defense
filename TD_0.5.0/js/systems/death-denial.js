// ---------------------------------------------------------------------------
// DeathDenial -- the beam tower's B5: one save per game, then the tower dies.
//
// When the base would drop to 0 or below:
//   1. base HP becomes 1 and the run continues
//   2. every enemy is pushed 500 u.l. BACK ALONG THE PATH
//   3. the tower that held the save is destroyed, with no refund
//
// The knockback exists instead of a board wipe on purpose: a wipe would let
// you delete a boss by deliberately taking the hit. Pushing everything back
// buys time and nothing else.
//
// The knockback follows the ROUTE in reverse -- it is a subtraction from how
// far each enemy has walked, not a straight line through 2D space. Enemies
// too near the start clamp there. See Enemy.knockBack.
//
// UNIQUENESS IS GLOBAL, not per tower: only one B5 may exist in a game at a
// time, so the check lives here rather than on any tower instance. `reset()`
// is part of starting a fresh run.
// ---------------------------------------------------------------------------

var DeathDenial = (function () {

  // THE DEFAULTS, and they are the fallback rather than the answer since
  // 2026-08-31. The B5 tier has carried `death_denial: { knockbackUl,
  // restoreBaseHpTo }` in its config since the tower was written and nothing
  // read them -- these two module constants were the live numbers and the
  // config block was a duplicate that could not be moved. `paramsOf` reads the
  // HOLDER's resolved parameters now, so the config is what it always claimed
  // to be and the Siphon's Second Wind permanent upgrade has somewhere to
  // write. A tower that resolves neither still gets exactly 500 and 1.
  var KNOCKBACK_UL = 500;
  var RESTORE_TO = 1;

  // The tower currently holding an unused save, or null.
  var holder = null;

  function register(tower) { holder = tower; }

  // WHAT THE SAVE IS WORTH, off the tower that is holding it. A config-driven
  // tower keeps its resolved mechanic parameters in `core.stats.mechanics`,
  // which is also where a permanent upgrade writes -- so the two halves of
  // "how far back, and how much health" have one source.
  function paramsOf(tower) {
    var p = tower && tower.core && tower.core.stats && tower.core.stats.mechanics
      ? tower.core.stats.mechanics.death_denial : null;
    return {
      knockbackUl: (p && typeof p.knockbackUl === "number")
        ? p.knockbackUl : KNOCKBACK_UL,
      restoreBaseHpTo: (p && typeof p.restoreBaseHpTo === "number")
        ? p.restoreBaseHpTo : RESTORE_TO
    };
  }

  // What the HELD save would do, for the panel, the index and the tests. Null
  // when nothing is held.
  function heldParams() { return holder === null ? null : paramsOf(holder); }

  // The distance the last consumed save actually dragged everything, kept only
  // so the rewind overlay can quote the number it really used rather than the
  // module's default.
  var lastKnockbackUl = KNOCKBACK_UL;

  function isHeld() { return holder !== null; }

  // Is the one-per-game slot free? This is the ONLY thing this system gates:
  // the other half of the B5 condition (having healed enough) is a property
  // of the tower, so it is checked there. Keeping them apart means the global
  // rule has exactly one home.
  function isAvailable() {
    if (holder !== null) {
      return { ok: false, reason: "another tower already has death denial" };
    }
    return { ok: true };
  }

  // ---- the rewind ----------------------------------------------------------
  //
  // The knockback is not instant: the board FREEZES and every enemy is dragged
  // back along the route it walked, as though the last few seconds were being
  // played in reverse. That is the whole read of the mechanic -- you did not
  // kill anything, you took time back -- and an instant teleport says none of
  // it.
  //
  // While this runs the simulation is stopped (see update() in js/game.js):
  // nothing moves forward, nothing shoots, nothing spawns. Only the rewind
  // advances.
  var REWIND_SECONDS = 1.4;
  var rewind = null;

  function isRewinding() { return rewind !== null; }

  // Slow at both ends, quick through the middle -- the shape of a tape being
  // spun back, rather than a linear slide.
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Called by the game loop the instant base HP would hit zero. Returns null
  // if nothing is held -- the run ends normally -- or the new base HP.
  function tryConsume(context) {
    if (holder === null) return null;

    var tower = holder;
    holder = null;              // one save, consumed before anything else can
                                // re-enter this

    // READ BEFORE THE TOWER IS SOLD, because selling it below is what takes it
    // off the board and, with it, the stats these come from.
    var params = paramsOf(tower);
    lastKnockbackUl = params.knockbackUl;

    var moves = [];
    for (var i = 0; i < context.enemies.length; i++) {
      var enemy = context.enemies[i];

      // Un-leak immediately, not at the end of the animation: the game loop
      // filters leaked enemies out at the end of THIS step, so an enemy still
      // flagged would be gone before the rewind could drag it anywhere. The
      // one that just reached the base is exactly the one worth rescuing.
      enemy.leaked = false;

      moves.push({
        enemy: enemy,
        from: enemy.progress,
        to: Math.max(0, enemy.progress - ul(params.knockbackUl))
      });
    }

    rewind = { elapsed: 0, duration: REWIND_SECONDS, moves: moves };

    if (tower.onDeathDenialSpent) tower.onDeathDenialSpent();
    context.sellTower(tower, { refund: false });

    return { restoreBaseHpTo: params.restoreBaseHpTo, tower: tower };
  }

  // Advances the animation. The game loop calls ONLY this while it runs.
  function updateRewind(dt) {
    if (rewind === null) return;

    rewind.elapsed += dt;
    var t = Math.min(1, rewind.elapsed / rewind.duration);
    var eased = easeInOutCubic(t);

    for (var i = 0; i < rewind.moves.length; i++) {
      var move = rewind.moves[i];
      if (move.enemy.dead) continue;

      // Dragged along the PATH, not through open space -- the route runs
      // backwards under them, corners and all.
      move.enemy.progress = move.from + (move.to - move.from) * eased;
      // THROUGH `refreshPos`, NEVER `path.pointAt` (2026-08-30). That is the
      // rule refreshPos exists to state: writing `progress` and then asking the
      // path directly snaps the body onto the centreline and loses its lane --
      // and since a body may now be on a route that is not the road at all
      // (see `offPath` in js/enemy.js), it would also teleport a Veil Dart being
      // knocked back onto tarmac it has never touched.
      move.enemy.refreshPos();
      move.enemy.leaked = false;
    }

    if (t >= 1) rewind = null;
  }

  // Drawn above everything, interface included: for this second and a bit the
  // effect IS the screen.
  function drawRewind(ctx) {
    if (rewind === null) return;

    var t = Math.min(1, rewind.elapsed / rewind.duration);
    // Fade in fast, hold, fade out -- so the freeze reads as deliberate
    // rather than as a dropped frame.
    var strength = Math.sin(Math.min(1, t * 1.15) * Math.PI);

    ctx.save();

    ctx.fillStyle = "rgba(70,30,120," + (0.34 * strength).toFixed(3) + ")";
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    // Each enemy trails a line back to where it stood when time turned --
    // the distance being taken off it, drawn rather than asserted.
    ctx.lineCap = "round";
    for (var i = 0; i < rewind.moves.length; i++) {
      var move = rewind.moves[i];
      if (move.enemy.dead) continue;

      var origin = move.enemy.path.pointAt(move.from);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(move.enemy.pos.x, move.enemy.pos.y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(214,170,255," + (0.5 * strength).toFixed(3) + ")";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(214,170,255," + (0.35 * strength).toFixed(3) + ")";
      ctx.fill();
    }

    // A clock hand running anticlockwise, centred on the screen.
    var cx = VIEW_WIDTH / 2;
    var cy = VIEW_HEIGHT / 2 - 40;
    var radius = 54;

    ctx.strokeStyle = "rgba(226,190,255," + (0.55 * strength).toFixed(3) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    var sweep = -Math.PI / 2 - t * Math.PI * 4;   // backwards, twice around
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * radius * 0.8, cy + Math.sin(sweep) * radius * 0.8);
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(240,225,255," + strength.toFixed(3) + ")";
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.fillText("TIME REWOUND", cx, cy + radius + 42);

    ctx.font = "15px system-ui, sans-serif";
    ctx.fillStyle = "rgba(214,170,255," + (0.9 * strength).toFixed(3) + ")";
    ctx.fillText("every enemy dragged back " + lastKnockbackUl + " u.l.",
      cx, cy + radius + 70);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  function reset() {
    holder = null;
    rewind = null;
    lastKnockbackUl = KNOCKBACK_UL;
  }

  return {
    KNOCKBACK_UL: KNOCKBACK_UL,
    REWIND_SECONDS: REWIND_SECONDS,
    paramsOf: paramsOf,
    heldParams: heldParams,
    register: register,
    isHeld: isHeld,
    isAvailable: isAvailable,
    tryConsume: tryConsume,
    isRewinding: isRewinding,
    updateRewind: updateRewind,
    drawRewind: drawRewind,
    reset: reset
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = DeathDenial;
}
