// ---------------------------------------------------------------------------
// Pierce falloff (spec 5.1)
//
//   d(n) = (d0 + softener) * decay^n - softener
//
// d0 = damage on first contact, n = enemies already hit before this one.
// The projectile despawns once d(n) <= 0. `softener` and `decay` come from
// config (mechanics.pierceFalloff), defaulting to the spec's 20 and 0.95 --
// nothing here hardcodes this tower's numbers.
//
// A pierce VALUE of Infinity (granted by the "infinitePierce" flag) is
// handled by just not imposing a target-count cap: the falloff formula
// itself terminates the sequence, which is what turns "infinite pierce"
// into the spec's effective ~64-target cap at A5's 500 damage. Preserve
// this -- do not special-case Infinity.
// ---------------------------------------------------------------------------

var Pierce = (function () {

  // The spec's figures, used when config supplies neither. The header above has
  // promised these since this file was written; the code read `params` blindly
  // and did not. A shot whose tower had the pierceFalloff FLAG but no mechanics
  // block -- which is a legal intermediate state while an upgrade tree is being
  // authored, and is what the sandbox scene hit -- got `undefined - undefined`
  // and returned NaN.
  //
  // NaN is the worst possible answer here. It is not <= 0, so PierceBullet's
  // "the falloff has worn this shot out" test does not catch it, and the shot
  // goes on to call `enemy.takeDamage(NaN)`. It also reaches the renderer as an
  // alpha, where `addColorStop` throws a SyntaxError and takes the whole frame
  // with it -- which is how it was finally noticed.
  var DEFAULT_SOFTENER = 20;
  var DEFAULT_DECAY = 0.95;

  function damageAtIndex(d0, n, params) {
    params = params || {};
    var softener = typeof params.softener === "number" && isFinite(params.softener)
      ? params.softener : DEFAULT_SOFTENER;
    var decay = typeof params.decay === "number" && isFinite(params.decay)
      ? params.decay : DEFAULT_DECAY;
    return (d0 + softener) * Math.pow(decay, n) - softener;
  }

  // Returns the ordered list of damage values a piercing shot deals, one
  // entry per enemy hit, stopping when the falloff formula reaches <= 0 or
  // when `pierceCap` additional enemies (beyond the first) have been hit --
  // whichever comes first. `pierceCap` may be Infinity.
  //
  // `hasFalloff`: before A3 grants pierceFalloff, a tower with pierce > 0
  // still hits multiple enemies, just at flat, unreduced damage -- the
  // falloff formula is a mechanic unlocked by a flag, not something pierce
  // > 0 implies on its own.
  function resolveSequence(d0, pierceCap, hasFalloff, params) {
    var maxHits = 1 + (isFinite(pierceCap) ? pierceCap : Infinity);
    var sequence = [];
    var n = 0;

    while (n < maxHits) {
      var dmg = hasFalloff ? damageAtIndex(d0, n, params) : d0;
      if (dmg <= 0) break;
      sequence.push(dmg);
      n++;
    }

    return sequence;
  }

  return {
    damageAtIndex: damageAtIndex,
    resolveSequence: resolveSequence
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Pierce;
}
