// ---------------------------------------------------------------------------
// Mitigation -- the global defensive system, applied to EVERY damage source.
//
// Two separate defensive stats live on an enemy:
//
//   armor    flat, absolute. Removes N damage from EVERY HIT.
//   defense  percentage 0-99. Removes N% of what is left. Hard cap at 99.
//
// ORDER IS NOT NEGOTIABLE: armor first, then defense.
//
//     afterArmor = max(0, raw - armor)
//     effDef     = min(99, max(0, defense * (1 - defPierce) - defenseFlatPierce))
//     final      = afterArmor * (1 - effDef / 100)
//
// THERE IS NO DAMAGE FLOOR. An enemy whose armor is >= the incoming hit takes
// exactly ZERO. That is the intended design, not an oversight: armor is the
// hard counter to low-damage high-rate weapons like the beam tower, whose
// whole shape is 1 damage ten times a second. Do NOT "fix" this by adding a
// Math.max(1, ...) -- doing so deletes the counter and makes armor cosmetic.
//
// TWO WAYS TO PIERCE DEFENCE, and they are different shapes on purpose:
//
//   defPierce (0..1)          PROPORTIONAL. Ignores a FRACTION of defense, so
//                             25% pierce against a 50-defense enemy faces 37.5.
//                             The Siphon's A1.
//   defenseFlatPierce (points) FLAT. Subtracts percentage POINTS, so 10 against
//                             a 20-defense enemy leaves 10. The Rifleman's B4.
//
// Both touch DEFENSE only and neither touches armor. They compose in the order
// above -- proportional first, then flat -- and the result is clamped to
// [0, 99].
//
// **THE LOW CLAMP IS LOAD-BEARING** (2026-07-30, at the owner's explicit
// instruction: "be sure that it doesn't increase the damage on enemies without
// armor"). Without it, 10 points of flat pierce against a 0-defense enemy would
// produce -10, and `1 - (-10)/100` is a 10% damage BONUS against everything
// unarmoured in the game. Pierce removes mitigation; it never adds damage.
//
// **Flat ARMOR pierce came BACK on 2026-08-31**, as the fifth argument this
// note said it would be. It went in 2026-07-30 when B4 moved from armor to
// defence, and the Rifleman's Piercing Orders -- a permanent upgrade, not a
// tier -- asks for exactly the shape that was removed: ignore N points of the
// FLAT subtraction, nothing else.
//
// `armorPierce` IS NOT `defenseFlatPierce`, and the two must never be spelled
// for each other. One takes points off `armor`, the flat subtraction; the other
// takes percentage POINTS off `defense`, the proportional one. Piercing Orders
// says in as many words that it does not touch percentage defence, and keeping
// them as two arguments is what makes that structural.
//
// **THE ENEMY'S OWN ARMOR IS NEVER TOUCHED.** This clamps the value USED for
// one hit; `enemy.armor` is left where it was, so the same body meets the next
// tower's shot at full plate. (The Warbringer's Fracture Stamp does the other
// thing on purpose -- it really does file the armor down -- and that is why it
// lives on the enemy and not here.)
// ---------------------------------------------------------------------------

var Mitigation = (function () {

  var DEFENSE_CAP = 99;

  function mitigate(raw, enemy, defPierce, defenseFlatPierce, armorPierce) {
    var armor = enemy.armor || 0;
    var defense = enemy.defense || 0;
    var pierce = defPierce || 0;
    var flat = Math.max(0, defenseFlatPierce || 0);
    var plate = Math.max(0, armorPierce || 0);

    // Clamped at zero on both sides: pierce removes mitigation and never adds
    // damage, which is the same rule the defence clamp below is protecting.
    var afterArmor = Math.max(0, raw - Math.max(0, armor - plate));

    // Cap AFTER both reductions, and clamp the low end too -- see the note
    // above on why the zero clamp is not optional.
    var effectiveDefense = Math.min(DEFENSE_CAP,
      Math.max(0, defense * (1 - pierce) - flat));

    return afterArmor * (1 - effectiveDefense / 100);
  }

  return {
    DEFENSE_CAP: DEFENSE_CAP,
    mitigate: mitigate
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Mitigation;
}
