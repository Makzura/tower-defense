// ---------------------------------------------------------------------------
// SummonContact -- shared health-for-damage body-block resolution.
//
// A summon commits its remaining HP when it collides with an enemy. If that
// strike does not kill, the committed HP is spent exactly as before. If it
// does kill, only the damage the enemy actually absorbed is removed from the
// summon; the unused HP remains for the next enemy. This is the one door all
// present and future friendly summons should use for contact damage.
//
// Damage still goes through TowerScore.apply, so armor, defense, shields,
// revives, damage counters and kill credit keep their normal global rules.
// ---------------------------------------------------------------------------

var SummonContact = (function () {
  function exchange(summon, enemy, owner, contactPower) {
    if (!summon || !enemy || summon.dead || enemy.dead || enemy.leaked) return 0;

    var available = Math.max(0, Number(summon.hp) || 0);
    var committed = contactPower === undefined ? available :
      Math.min(available, Math.max(0, Number(contactPower) || 0));
    if (committed <= 0) return 0;

    TowerScore.apply(owner, enemy, committed);
    var landed = Math.max(0, Number(enemy.lastDamageTaken) || 0);

    // A surviving enemy consumed the whole committed block. On a kill, the
    // overflow never touched anything, so it stays on the summon. Revivals do
    // not count as kills here: enemy.dead is false after tryRevive(), meaning
    // the summon is still fully spent against that continuing body.
    var spent = enemy.dead ? Math.min(committed, landed) : committed;

    // WHAT THE EXCHANGE COSTS THE SUMMON, and it is not always what it dealt.
    // `damageTakenMult` is a body's resistance to being walked through -- a
    // dug-in Rifleman recruit takes a quarter less (js/soldier.js) -- and it
    // reduces only the half that comes off the summon. The enemy has already
    // absorbed the full strike above; a brace does not make the blow smaller,
    // it makes the body better at wearing it. Absent or 1 on every other
    // summon, which is the whole of the compatibility argument.
    var resist = Number(summon.damageTakenMult);
    if (isFinite(resist) && resist >= 0 && resist !== 1) spent *= resist;
    summon.hp = Math.max(0, available - spent);
    summon.dead = summon.hp <= 0;
    return landed;
  }

  return { exchange: exchange };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = SummonContact;
}
