// ---------------------------------------------------------------------------
// TowerStats -- ONE vocabulary for the numbers every tower reports.
//
// The problem this file exists to end: four towers called the same quantity
// four different things, in two different units.
//
//     gunner    "Cooldown"    1.00 s
//     smasher   "Hit speed"   4.00 s
//     Longshot  "Fire rate"   0.50/s
//     beam      folded into "AD"  ->  "1 x 10/s"
//
// No player could compare those, and no reader of the code could tell whether
// "hit speed" meant hits per second or seconds per hit (it meant the second
// one, while "fire rate" meant the first). Three of them also disagreed about
// what to call the lifetime damage counter, and the smasher printed its
// distances in "m" -- a unit this game stopped using in 2026-07-26.
//
// The rule now:
//
//   * Every tower answers `attackDamage()` and `attacksPerSecond()`.
//   * Every shared panel row is BUILT HERE from those two answers, so a tower
//     may add rows of its own but may not spell a shared one its own way.
//   * DPS is derived here too, from the same pair -- it cannot drift from the
//     damage and the rate printed two rows above it.
//
// Towers still STORE their rate however their own model wants: the gunner
// keeps shots per second, the smasher keeps seconds between swings because
// its whole upgrade table is written that way, and the beam keeps ticks per
// second. `attacksPerSecond()` is the single conversion point -- the same
// arrangement `ul()` has for distances (see js/units.js).
// ---------------------------------------------------------------------------

var TowerStats = {

  // Running totals get large, so thin them out rather than printing every
  // digit: 12345 -> "12.3k". Shared by every tower's statLines.
  formatTotal: function (value) {
    var rounded = Math.round(value);
    if (rounded < 10000) return String(rounded);
    if (rounded < 1000000) return (rounded / 1000).toFixed(1) + "k";
    return (rounded / 1000000).toFixed(1) + "M";
  },

  // A stat number, at most two decimals and never with trailing zeros: 1 -> "1",
  // 31.25 -> "31.25", 6.500001 -> "6.5". Panel rows are read, not audited.
  number: function (value) {
    if (value === Infinity) return "∞";
    return String(Math.round(value * 100) / 100);
  },

  // The two ways of saying the same rate. Both derive from attacks per second,
  // so they can never disagree about how fast a tower is.
  rate: function (perSecond) {
    return perSecond.toFixed(2) + "/s";
  },
  everySeconds: function (perSecond) {
    return perSecond > 0 ? (1 / perSecond).toFixed(2) + " s" : "∞";
  },

  // u.l. is the game's only distance unit -- see js/units.js. Nothing prints
  // metres, pixels, or a bare number.
  distance: function (valueUl) {
    return TowerStats.number(valueUl) + " u.l.";
  },

  // Damage per second against ONE enemy, for every tower type. Derived from
  // the same two accessors the Damage and Attack speed rows print, so the
  // three numbers on screen always multiply out.
  //
  // A tower that hits several enemies at once (the smasher's wedge, the beam's
  // extra locks) does this much to EACH of them; where that ceiling is worth
  // stating, the tower adds its own row for it rather than quietly redefining
  // this one.
  dps: function (tower) {
    return tower.attackDamage() * tower.attacksPerSecond();
  },

  // How a DPS figure is SPELLED, in the one place both readers of it can
  // share: the panel's DPS row and the before/after row on an upgrade's hover
  // card (see UpgradeEffects.dpsChange). A preview that said "3 → 5" while the
  // panel underneath it said "3.0" would read as two different numbers.
  dpsText: function (value) {
    return value.toFixed(1);
  },

  // --- the shared rows ------------------------------------------------------
  //
  // Order matters and is part of the contract: lifetime totals first (they
  // answer "is this tower earning its place", which is why the panel gets
  // opened), then what it hits for, then how far and how often, then whatever
  // the type adds, with DPS last because the panel emphasises the last row.

  // A ROW THAT IS A LIFETIME TOTAL, MARKED AS ONE.
  //
  // The armoury and the index both show a SPECIMEN -- an instance parked
  // off-screen that has never fired -- and both drop its history, because a
  // field guide has no history to report. Until now they dropped it by COUNT:
  // `statLines().slice(TowerStats.totals(t).length)`, on the assumption that
  // every tower opens with exactly these two rows.
  //
  // The Farm broke that assumption and said nothing. It deals no damage and
  // takes no kills, so it has neither of these rows; its history is "Mana
  // produced", and it comes near the END of its list because its production
  // rate is the row a player opens the panel for. Slicing two off the front
  // therefore ate the production rate and the total alike, and the index
  // showed a 1200-mana economy tower as one line: "Tower HP 200 / 200".
  //
  // So the mark travels with the row. A third element rather than a label
  // match, because the original comment's fear was right -- matching by label
  // means renaming a row silently changes what the guide shows -- and a flag
  // set where the row is BUILT cannot be renamed apart from it. Every consumer
  // reads row[0] and row[1] and is untouched by a third element.
  total: function (label, value) {
    return [label, value, true];
  },

  isTotal: function (row) {
    return !!(row && row[2] === true);
  },

  // What a specimen shows: everything except its history.
  withoutTotals: function (rows) {
    return (rows || []).filter(function (row) { return !TowerStats.isTotal(row); });
  },

  totals: function (tower) {
    return [
      TowerStats.total("Damage dealt", TowerStats.formatTotal(tower.damageDealt)),
      TowerStats.total("Kills", String(tower.kills))
    ];
  },

  // `note` is an optional suffix for a tower whose damage moves on its own --
  // the beam's A5 reads the player's bank live, and showing the resolved stat
  // instead made that upgrade look like it did nothing.
  damage: function (tower, note) {
    var text = TowerStats.number(tower.attackDamage());
    return ["Damage", note ? text + "  " + note : text];
  },

  range: function (tower) {
    return ["Range", TowerStats.distance(tower.rangeUl)];
  },

  attackSpeed: function (tower) {
    return ["Attack speed", TowerStats.rate(tower.attacksPerSecond())];
  },

  dpsRow: function (tower) {
    return ["DPS", TowerStats.dpsText(TowerStats.dps(tower))];
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = TowerStats;
}
