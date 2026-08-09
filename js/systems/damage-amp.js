// ---------------------------------------------------------------------------
// DamageAmp -- timed, independently-expiring stacks of "takes MORE damage".
//
// The summoner's A4 weakening debuff (see js/blub.js): every blub hit puts
// +0.1% damage taken on the enemy for 5 seconds, cumulative to +100%, and
// **every stack keeps its own clock**. It raises damage from ALL sources, not
// just the tower that applied it, which is why it lives out here beside
// js/systems/mitigation.js rather than inside the tower that happens to be the
// only thing granting it today.
//
// WHY IT IS NOT js/systems/buff-stacks.js. That tracker is a COUNT of stacks
// sharing one refreshed window (the Arcane Sniper's kill-stack attack speed):
// a new stack pushes the whole stack's expiry out. This one is the opposite --
// the owner's spec says "chaque cumul possede sa propre duree de 5s et expire
// independamment", so a thousand hits inside one second must decay as a
// thousand separate five-second timers, one per hit. Making buff-stacks do
// both would have meant two behaviours behind one name.
//
// WHY A RUNNING TOTAL AND A HEAD INDEX rather than summing the list on read.
// A capped enemy carries a thousand live stacks and every damage source in the
// game asks for the multiplier, so summing per read is O(stacks) per hit. The
// list is naturally sorted -- a stack pushed later always expires later,
// because every stack has the same duration -- so expiry is a queue walked
// from the front, and `total` is maintained incrementally. Both operations are
// O(1) amortised, and `head` is used instead of Array.shift() so retiring a
// thousand stacks does not memmove a thousand entries.
//
// THE CAP IS ON THE READ, NOT ON THE STORE. Hits past the cap still push a
// stack, and that is deliberate: "each stack expires independently" is only
// true if the stacks past the ceiling exist to expire. Refusing them would
// make an enemy hit 1500 times drop to zero amplification the instant the
// first thousand aged out, rather than staying at the ceiling while the
// surplus drains.
// ---------------------------------------------------------------------------

var DamageAmp = (function () {

  // Compact the retired prefix once it is both large and most of the array, so
  // an enemy that is hit for a long time does not grow an unbounded list of
  // dead entries. Both conditions matter: the first keeps short-lived enemies
  // from ever paying for a compaction, the second keeps a heavily-stacked
  // enemy from compacting on every step.
  var COMPACT_MIN = 256;

  function state(enemy) {
    if (!enemy.damageAmp) {
      enemy.damageAmp = { clock: 0, head: 0, total: 0, stacks: [] };
    }
    return enemy.damageAmp;
  }

  // Add one stack worth `amount` (a FRACTION -- 0.001 is +0.1%) lasting
  // `seconds`. Anything non-positive is ignored rather than stored, so a
  // mis-specified upgrade cannot fill the queue with no-ops.
  function add(enemy, amount, seconds) {
    if (!enemy || !(amount > 0) || !(seconds > 0)) return;
    var s = state(enemy);
    s.stacks.push({ expires: s.clock + seconds, amount: amount });
    s.total += amount;
  }

  // Advance this enemy's own clock and retire whatever has run out. Called
  // once per step from Enemy.prototype.update -- per enemy rather than from a
  // global tick, because the stacks are per enemy and comparing them against
  // that enemy's own clock is what makes an enemy spawned mid-wave behave
  // exactly like one spawned at t=0.
  function tick(enemy, dt) {
    if (!enemy || !enemy.damageAmp) return;
    var s = enemy.damageAmp;
    s.clock += dt;

    while (s.head < s.stacks.length && s.stacks[s.head].expires <= s.clock) {
      s.total -= s.stacks[s.head].amount;
      s.head++;
    }

    if (s.head >= COMPACT_MIN && s.head * 2 >= s.stacks.length) {
      s.stacks = s.stacks.slice(s.head);
      s.head = 0;
    }

    // Float drift over thousands of add/subtract pairs; an empty queue means
    // exactly zero, so say so rather than leaving 4e-17 behind.
    if (s.head >= s.stacks.length) {
      s.stacks.length = 0;
      s.head = 0;
      s.total = 0;
    }
  }

  // The live amplification as a FRACTION, clamped at the cap. 0 for an enemy
  // that has never been touched, which is the common case, so it is the cheap
  // path.
  function fraction(enemy, cap) {
    if (!enemy || !enemy.damageAmp) return 0;
    var total = enemy.damageAmp.total;
    if (!(total > 0)) return 0;
    var ceiling = cap === undefined ? DamageAmp.CAP : cap;
    return total < ceiling ? total : ceiling;
  }

  // What damage gets multiplied by. Spelled separately from fraction() because
  // the damage pipeline wants a multiplier and the panel wants a percentage,
  // and deriving one from the other in two places is how they drift.
  function multiplier(enemy, cap) {
    return 1 + fraction(enemy, cap);
  }

  // How many stacks are live. Presentation and tests only -- nothing in the
  // damage path reads it.
  function count(enemy) {
    if (!enemy || !enemy.damageAmp) return 0;
    return enemy.damageAmp.stacks.length - enemy.damageAmp.head;
  }

  function clear(enemy) {
    if (enemy) enemy.damageAmp = null;
  }

  return {
    CAP: 1.0,                 // +100%, the owner's ceiling
    add: add,
    tick: tick,
    fraction: fraction,
    multiplier: multiplier,
    count: count,
    clear: clear
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = DamageAmp;
}
