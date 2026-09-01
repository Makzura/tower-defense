// ---------------------------------------------------------------------------
// PlayerRun -- everything the Player's loadout does DURING a run
//
// `PlayerPerks.resolved()` is what the loadout is worth; `PlayerEffects` is how
// that reaches a tower's stats. This file is the third part: the state that
// only exists while a run is up -- the debt, the mark, the beacon, the totem,
// the shield, the streak, the permit, and which types have already been placed.
//
// **IT NEVER TOUCHES `cash` OR `baseHp`.** The economy lives in js/game.js and
// says so; this file is asked questions and answers them, and game.js does the
// spending. That is what makes every rule here testable without a board, and it
// is why `absorb` takes the available mana as an argument rather than reading a
// global it has no business knowing about.
//
// **EVERY FIGURE COMES FROM THE RESOLVED BLOCK.** Nothing below hard-codes 300
// or 25 or 8: it reads `debtLimit`, `shieldManaPerDamage`, `blitzHasteSeconds`.
// A module that is not equipped leaves its number at the neutral value and the
// rule it drives is inert -- a debt limit of 0 is "there is no credit", a totem
// health of 0 is "there is no totem", and so on. That is what makes an empty
// loadout the current game without a single conditional here saying so.
//
// THE ORDER BASE DAMAGE RESOLVES IN, and it is stated because three modules
// meet on one number:
//
//   1. Brèche contrôlée reduces the FIRST leak of a wave;
//   2. Bouclier de mana may then absorb up to its fraction of what is left,
//      and only as much as the purse can pay for;
//   3. whatever remains is what the base actually loses -- and it is that
//      number, not the raw hit, that breaks Prime sans fuite and Série
//      parfaite. A hit absorbed to nothing keeps a streak alive.
//
// The totem's death damage goes through the same door and is deliberately NOT a
// leak: Brèche contrôlée does not touch it (it is not an enemy reaching the
// base), and the shield may absorb it like anything else.
// ---------------------------------------------------------------------------

var PlayerRun = (function () {

  // --- run state -------------------------------------------------------------

  var placedTypes = {};        // type id -> how many have been PLACED this run
  var debt = 0;                // >= 0, the magnitude of what is owed
  var shieldOn = false;
  var streak = 0;              // Série parfaite's charges
  var lostThisWave = false;    // has the base lost health during this wave?
  var leaksThisWave = 0;       // how many enemies have reached the base
  var bountyDue = 0;           // mana Prime sans fuite owes at the next wave
  var mark = null;             // { enemy, left }
  var overdrive = null;        // { tower, left, stun }
  var overdriveUsedWave = -1;
  var radarLeft = 0;
  var radarCooldown = 0;
  var markCooldown = 0;
  var beaconAt = null;         // { x, y }
  var totemState = null;       // { x, y, hp, maxHp, alive }
  var permit = null;           // { tower, spent }
  var hasteWave = -1;          // which wave Blitz armed, if any
  var hasteSpec = null;        // { pct, seconds } for that wave's bodies
  var lastAbsorb = { mana: 0, prevented: 0 };
  var waveNumber = 0;

  function r() {
    return (typeof PlayerPerks === "undefined")
      ? null : PlayerPerks.resolved();
  }

  // --- the run's life --------------------------------------------------------

  // EVERYTHING IS CLEARED, and the loadout is frozen. Called from restartGame,
  // the one door every entry into a board goes through.
  function beginRun() {
    placedTypes = {};
    debt = 0;
    shieldOn = false;                  // the brief: OFF at the start of a run
    streak = 0;
    lostThisWave = false;
    leaksThisWave = 0;
    bountyDue = 0;
    mark = null;
    overdrive = null;
    overdriveUsedWave = -1;
    radarLeft = 0;
    radarCooldown = 0;
    markCooldown = 0;
    beaconAt = null;
    totemState = null;
    permit = null;
    hasteWave = -1;
    hasteSpec = null;
    lastAbsorb = { mana: 0, prevented: 0 };
    waveNumber = 0;
    if (typeof PlayerPerks !== "undefined") PlayerPerks.lockForRun();
  }

  function endRun() {
    if (typeof PlayerPerks !== "undefined") PlayerPerks.releaseRun();
  }

  // --- what a run STARTS with ------------------------------------------------

  // The mana delta on `STARTING_CASH`. Trésorerie gives, Gardien takes, and
  // they sum -- a Player carrying both starts on +150.
  function startingManaDelta() {
    var s = r();
    return s ? (s.startingManaBonus - s.startingManaPenalty) : 0;
  }

  // The delta on `BASE_MAX_HP`. The base opens at its modified maximum.
  function baseMaxHpDelta() {
    var s = r();
    return s ? s.baseHpBonus : 0;
  }

  // --- placement prices ------------------------------------------------------

  // WHAT PLACING ONE OF THIS TYPE COSTS EXTRA (or less) RIGHT NOW.
  //
  // Additive first, then the percentage -- the order the brief states, and the
  // reason `duplicateSurchargePct` is applied to the base rather than to the
  // discounted figure would have been a different number.
  //
  // THE DISCOUNT IS SPENT BY A COMPLETED PLACEMENT and by nothing else, which is
  // why this asks `placedTypes` rather than what is standing: selling or losing
  // the first Rifleman does not hand its discount back, and rebuilding is not a
  // way to farm it.
  function placementDelta(typeId, baseCost, liveTypeIds) {
    var s = r();
    if (!s || !typeId) return 0;
    var placed = placedTypes[typeId] || 0;
    var delta = placed === 0 ? -s.firstTowerDiscount : s.laterTowerSurcharge;

    // Arsenal partagé's duplicate surcharge asks about what is ALIVE, not about
    // what has been placed: it is a rule about the board's composition now.
    if (s.duplicateSurchargePct && liveTypeIds &&
        liveTypeIds.indexOf(typeId) !== -1) {
      delta += (baseCost || 0) * s.duplicateSurchargePct / 100;
    }
    return delta;
  }

  function notePlacement(typeId) {
    if (!typeId) return;
    placedTypes[typeId] = (placedTypes[typeId] || 0) + 1;
  }

  function placedCount(typeId) { return placedTypes[typeId] || 0; }

  // --- the credit line -------------------------------------------------------

  // HOW FAR BELOW ZERO THIS RUN MAY GO. Zero when there is no credit at all,
  // which is every loadout without Crédit d'urgence.
  function debtLimit() {
    var s = r();
    return s ? s.debtLimit : 0;
  }

  // MAY THIS SPEND HAPPEN? The one question every purchase asks.
  //
  // Two rules, and the second is the point of the module: a transaction may
  // take the balance down to the limit, and once the balance IS negative
  // nothing may be bought at all until it is back to zero. Selling and every
  // ordinary income still work, which is how a player digs out.
  function canSpend(cash, amount) {
    if (!(amount > 0)) return { ok: true };
    if (cash < 0) {
      return { ok: false, reason: "in debt — sell or earn back to zero first" };
    }
    if (cash >= amount) return { ok: true };
    var limit = debtLimit();
    if (limit <= 0) return { ok: false, reason: "not enough mana" };
    if (cash - amount < -limit) {
      return { ok: false, reason: "credit stops at −" + limit + " mana" };
    }
    return { ok: true, onCredit: true };
  }

  // THE INTEREST, CHARGED AT THE OPENING OF A WAVE and before anything is
  // spent in it. Returns how much MORE is owed, so game.js can take it and the
  // readout can show it. Rounded away from zero -- the debt grows to a whole
  // number of mana, never to a fraction the purse cannot represent.
  function chargeInterest(cash) {
    var s = r();
    if (!s || !s.debtInterestPct || cash >= 0) return 0;
    var owed = -cash;
    var grown = Math.ceil(owed * (1 + s.debtInterestPct / 100));
    return grown - owed;
  }

  // --- base damage: Brèche, then Shield, then what is really lost ------------

  // RESOLVE ONE HIT ON THE BASE. `opts.leak` marks it as an enemy reaching the
  // base, which is the only kind Brèche contrôlée reduces.
  //
  // Returns every figure the caller needs and mutates nothing: what the base
  // loses, what the shield prevented and what that cost. game.js spends and
  // subtracts, then tells this file what was actually lost.
  function resolveBaseDamage(raw, cash, opts) {
    var s = r();
    var out = { raw: raw, toBase: raw, absorbed: 0, manaCost: 0, breached: false };
    if (!s || !(raw > 0)) return out;

    // 1. THE FIRST LEAK OF A WAVE, and only a leak.
    if (opts && opts.leak) {
      leaksThisWave++;
      if (leaksThisWave === 1 && s.firstLeakPct < 100) {
        out.toBase = raw * s.firstLeakPct / 100;
        out.breached = true;
      }
    }

    // 2. THE SHIELD, on whatever is left, and only as much as the purse can
    //    pay for. It NEVER spends into debt -- not even with Crédit d'urgence,
    //    which the brief states in as many words.
    if (shieldOn && s.shieldMaxFractionPct > 0 && s.shieldManaPerDamage > 0) {
      // WHOLE POINTS ONLY, because the price is per point: "chaque point
      // entier de dégâts réellement empêché coûte 25 mana". Half a point of
      // damage prevented for half the price would be a different rule.
      var wanted = Math.floor(out.toBase * s.shieldMaxFractionPct / 100);
      var affordable = Math.floor(Math.max(0, cash) / s.shieldManaPerDamage);
      var prevented = Math.min(wanted, affordable);
      if (prevented > 0) {
        out.absorbed = prevented;
        out.manaCost = prevented * s.shieldManaPerDamage;
        out.toBase -= prevented;
      }
    }

    lastAbsorb = { mana: out.manaCost, prevented: out.absorbed };
    return out;
  }

  // THE BASE REALLY LOST SOMETHING. This is what breaks a streak, and it is
  // deliberately told rather than inferred: a hit absorbed to nothing must not
  // break one, and the only place that can tell the difference is the caller
  // that just applied the number.
  function noteBaseLoss(amount) {
    if (!(amount > 0)) return;
    if (lostThisWave) return;               // one resolution a wave
    lostThisWave = true;
    var s = r();
    var cap = s ? s.streakLossCap : 0;
    // Assurance de série takes at most `5 − rank` charges instead of all of
    // them; without it every charge goes.
    streak = cap > 0 ? Math.max(0, streak - cap) : 0;
  }

  // --- waves -----------------------------------------------------------------

  // A WAVE HAS OPENED. Returns what game.js owes the player right now: the
  // deferred no-leak bounty, and the interest if the balance is still red.
  function onWaveStart(number, cash) {
    waveNumber = number || 0;
    lostThisWave = false;
    leaksThisWave = 0;
    var paid = bountyDue;
    bountyDue = 0;
    return { bounty: paid, interest: chargeInterest(cash) };
  }

  // A WAVE HAS ENDED. A wave that cost the base nothing schedules the bounty
  // and adds a charge; one that cost something has already been dealt with by
  // `noteBaseLoss` and simply earns neither.
  function onWaveEnd() {
    var s = r();
    if (lostThisWave || !s) return { clean: false, charges: streak };
    if (s.noLeakBounty > 0) bountyDue += s.noLeakBounty;
    if (s.streakMaxCharges > 0) {
      streak = Math.min(s.streakMaxCharges, streak + 1);
    }
    return { clean: true, charges: streak };
  }

  // HOW LONG THE GAP BETWEEN WAVES IS. `null` from the resolved block means
  // "the game's own delay", which is what an empty loadout answers.
  function transitionSeconds(gameDefault) {
    var s = r();
    if (!s || s.transitionSeconds === null) return gameDefault;
    return Math.min(gameDefault, s.transitionSeconds);
  }

  function forecastWaves() {
    var s = r();
    return s ? s.forecastWaves : 0;
  }

  // --- Doctrine Blitz --------------------------------------------------------

  // A WAVE WAS SENT IN EARLY. `secondsRemoved` is what the call actually cut
  // off the wave's own window -- game.js measures it, because only game.js
  // knows the schedule.
  //
  // AN AUTOMATIC SEND AT ZERO PAYS NOTHING, and that falls out of the
  // arithmetic rather than needing a flag: nothing was removed, so no full
  // tranche was completed and the haste is never armed.
  function noteEarlyCall(secondsRemoved) {
    var s = r();
    if (!s || !s.blitzSecondsPerMana || !(secondsRemoved > 0)) return 0;
    var mana = Math.floor(secondsRemoved / s.blitzSecondsPerMana);
    mana = Math.max(0, Math.min(s.blitzCapMana, mana));
    if (mana <= 0) return 0;
    // THE HASTE IS ARMED FOR THE WAVE THAT IS ABOUT TO ARRIVE, not for a window
    // on the clock: each body of that wave carries its own eight seconds from
    // its own spawn, which is what "leurs 8 premières secondes de présence"
    // says. `spawnEnemy` asks `hasteForSpawn` and stamps the body.
    hasteWave = waveNumber + 1;
    hasteSpec = { pct: s.blitzHastePct, seconds: s.blitzHasteSeconds };
    return mana;
  }

  // WHAT A BODY SPAWNING INTO WAVE `number` SHOULD CARRY. Null for every wave
  // that was not called in early, and for every run without Doctrine Blitz.
  function hasteForSpawn(number) {
    if (!hasteSpec || hasteWave !== number) return null;
    return { pct: hasteSpec.pct, seconds: hasteSpec.seconds };
  }

  // --- the orders ------------------------------------------------------------

  function markReady() { return markCooldown <= 0; }
  function markCooldownLeft() { return Math.max(0, markCooldown); }

  // MARK ONE ENEMY. The cooldown starts on a SUCCESSFUL activation, so a player
  // who opened the targeting and thought better of it has spent nothing.
  function order(enemy) {
    var s = r();
    if (!s || !s.markSeconds) return "Ordre prioritaire is not equipped";
    if (markCooldown > 0) {
      return "ready in " + markCooldown.toFixed(1) + "s";
    }
    if (!enemy) return "pick an enemy";
    mark = { enemy: enemy, left: s.markSeconds };
    markCooldown = s.markCooldownSeconds;
    return null;
  }

  function markedEnemy() {
    return (mark && mark.left > 0) ? mark.enemy : null;
  }

  // WHAT MULTIPLIES A SHOT AIMED AT THE MARK. The trade: every tower shoots it
  // first, and every shot at it lands softer.
  function markDamageScale(enemy) {
    var s = r();
    if (!s || !enemy || markedEnemy() !== enemy) return 1;
    return Math.max(0, 1 - s.markDamagePenaltyPct / 100);
  }

  // --- Ordre de surcharge ----------------------------------------------------

  function overdriveReady() {
    var s = r();
    if (!s || !s.overdriveSeconds) return false;
    return overdriveUsedWave !== waveNumber && !overdrive;
  }

  function startOverdrive(tower) {
    var s = r();
    if (!s || !s.overdriveSeconds) return "Ordre de surcharge is not equipped";
    if (overdrive) return "already running";
    if (overdriveUsedWave === waveNumber) return "once a wave";
    if (!tower) return "pick a tower";
    overdrive = { tower: tower, left: s.overdriveSeconds, stun: 0 };
    overdriveUsedWave = waveNumber;
    return null;
  }

  // WHAT MULTIPLIES THIS TOWER'S RATE OF FIRE RIGHT NOW. Live rather than
  // resolved, because it changes several times a second and ends in a stun.
  function overdriveScale(tower) {
    var s = r();
    if (!s || !overdrive || overdrive.tower !== tower) return 1;
    if (overdrive.left > 0) return 1 + s.overdriveFireRatePct / 100;
    return 1;
  }

  // Is this tower in Surcharge's stun? It may neither attack nor use an ability.
  function isStunned(tower) {
    return !!(overdrive && overdrive.tower === tower &&
              overdrive.left <= 0 && overdrive.stun > 0);
  }

  // --- Balayage radar --------------------------------------------------------

  function radarReady() {
    var s = r();
    return !!(s && s.radarSeconds && radarCooldown <= 0 && radarLeft <= 0);
  }

  function startRadar() {
    var s = r();
    if (!s || !s.radarSeconds) return "Balayage radar is not equipped";
    if (radarLeft > 0) return "already sweeping";
    if (radarCooldown > 0) return "ready in " + radarCooldown.toFixed(1) + "s";
    radarLeft = s.radarSeconds;
    radarCooldown = s.radarCooldownSeconds;
    return null;
  }

  function radarActive() { return radarLeft > 0; }
  function radarCooldownLeft() { return Math.max(0, radarCooldown); }
  function radarLeftSeconds() { return Math.max(0, radarLeft); }

  // --- the beacon and the totem ----------------------------------------------

  function beacon() { return beaconAt; }

  function beaconRadiusUl() {
    var s = r();
    return s ? s.beaconRadiusUl : 0;
  }

  // PLACE OR MOVE THE BEACON. Free both times, and MOVING IS BETWEEN WAVES
  // ONLY -- `duringWave` is the caller's answer because only game.js knows.
  function placeBeacon(x, y, duringWave) {
    var s = r();
    if (!s || !s.beaconRadiusUl) return "Balise de commandement is not equipped";
    if (beaconAt && duringWave) return "the beacon only moves between waves";
    beaconAt = { x: x, y: y };
    return null;
  }

  function totem() { return totemState; }

  function totemMaxHp() {
    var s = r();
    return s ? s.totemHp : 0;
  }

  // PLACED ONCE, BEFORE WAVE 1, AND NEVER AGAIN. Not placed in time and the
  // Player has given up the buff for this run -- which is the brief's rule and
  // is why there is no second chance here.
  function placeTotem(x, y, beforeFirstWave) {
    var s = r();
    if (!s || !s.totemHp) return "Totem vulnérable is not equipped";
    if (totemState) return "the totem is already placed";
    if (!beforeFirstWave) return "the totem may only be placed before wave 1";
    totemState = { x: x, y: y, hp: s.totemHp, maxHp: s.totemHp, alive: true };
    return null;
  }

  // THE TOTEM TAKES A HIT. Returns the base damage its death owes, so the
  // caller can put it through the same door every other hit on the base goes
  // through -- including the shield, which may absorb it.
  function damageTotem(amount) {
    if (!totemState || !totemState.alive || !(amount > 0)) return 0;
    totemState.hp -= amount;
    if (totemState.hp > 0) return 0;
    totemState.hp = 0;
    totemState.alive = false;
    var s = r();
    return s ? s.totemDeathDamage : 0;
  }

  // --- the mana shield -------------------------------------------------------

  function shieldEquipped() {
    var s = r();
    return !!(s && s.shieldMaxFractionPct > 0);
  }

  function shieldActive() { return shieldOn; }

  function toggleShield() {
    if (!shieldEquipped()) return "Bouclier de mana is not equipped";
    shieldOn = !shieldOn;
    return null;
  }

  function lastAbsorption() { return { mana: lastAbsorb.mana, prevented: lastAbsorb.prevented }; }

  // --- the crosspath permit --------------------------------------------------

  function permitEquipped() {
    return (typeof PlayerPerks !== "undefined") &&
           PlayerPerks.has("player_crosspath_permit");
  }

  function permitHolder() { return permit ? permit.tower : null; }
  function permitSpent() { return !!(permit && permit.spent); }
  function permitAvailable() { return permitEquipped() && !permit; }

  // GIVE THE PERMIT TO ONE TOWER. One instance a run, and the surcharge starts
  // immediately -- including on the very purchase that consumes it.
  function grantPermit(tower) {
    if (!permitEquipped()) return "Permis de crosspath is not equipped";
    if (permit) return "the permit has already been given this run";
    if (!tower) return "pick a tower";
    permit = { tower: tower, spent: false };
    return null;
  }

  function spendPermit(tower) {
    if (!permit || permit.tower !== tower) return false;
    permit.spent = true;
    return true;
  }

  // A TOWER CARRYING THE PERMIT LOST IT. Clause de restitution hands an UNSPENT
  // permit back; a spent one is gone for the run whatever happens to the tower.
  function noteTowerGone(tower) {
    if (!permit || permit.tower !== tower) return false;
    var s = r();
    if (permit.spent || !s || !s.permitRestitution) return false;
    permit = null;
    return true;
  }

  // WHAT MULTIPLIES AN IN-RUN UPGRADE ON THIS TOWER. 1 for every tower that is
  // not carrying the permit, and for every run in which it was never given.
  function upgradeCostScale(tower) {
    var s = r();
    if (!s || !permit || permit.tower !== tower) return 1;
    return 1 + s.permitUpgradeSurchargePct / 100;
  }

  // --- the clock -------------------------------------------------------------

  // EVERY TIMER, ON THE GAME'S OWN CLOCK. `dt` is already scaled by the speed
  // toggle and is not delivered at all while the board is frozen, so pause and
  // 3x are both free: nothing here reads a wall clock.
  function update(dt, towerList) {
    if (!(dt > 0)) return;
    if (markCooldown > 0) markCooldown -= dt;
    if (radarCooldown > 0) radarCooldown -= dt;
    if (radarLeft > 0) radarLeft -= dt;

    if (mark) {
      mark.left -= dt;
      var gone = mark.enemy && (mark.enemy.dead || mark.enemy.leaked);
      if (mark.left <= 0 || gone) mark = null;
    }

    if (overdrive) {
      var s = r();
      if (overdrive.left > 0) {
        overdrive.left -= dt;
        if (overdrive.left <= 0) {
          overdrive.stun = s ? s.overdriveStunSeconds : 0;
          if (overdrive.stun <= 0) overdrive = null;
        }
      } else if (overdrive.stun > 0) {
        overdrive.stun -= dt;
        if (overdrive.stun <= 0) overdrive = null;
      }
      // A tower that has been sold or destroyed takes its order with it.
      if (overdrive && towerList && towerList.indexOf(overdrive.tower) === -1) {
        overdrive = null;
      }
    }

  }

  function streakCharges() { return streak; }
  function bountyPending() { return bountyDue; }
  function leaksSoFar() { return leaksThisWave; }
  function lostThisWaveYet() { return lostThisWave; }

  return {
    beginRun: beginRun,
    endRun: endRun,
    update: update,
    startingManaDelta: startingManaDelta,
    baseMaxHpDelta: baseMaxHpDelta,
    placementDelta: placementDelta,
    notePlacement: notePlacement,
    placedCount: placedCount,
    debtLimit: debtLimit,
    canSpend: canSpend,
    chargeInterest: chargeInterest,
    resolveBaseDamage: resolveBaseDamage,
    noteBaseLoss: noteBaseLoss,
    onWaveStart: onWaveStart,
    onWaveEnd: onWaveEnd,
    transitionSeconds: transitionSeconds,
    forecastWaves: forecastWaves,
    noteEarlyCall: noteEarlyCall,
    hasteForSpawn: hasteForSpawn,
    order: order,
    markReady: markReady,
    markCooldownLeft: markCooldownLeft,
    markedEnemy: markedEnemy,
    markDamageScale: markDamageScale,
    overdriveReady: overdriveReady,
    startOverdrive: startOverdrive,
    overdriveScale: overdriveScale,
    isStunned: isStunned,
    radarReady: radarReady,
    startRadar: startRadar,
    radarActive: radarActive,
    radarCooldownLeft: radarCooldownLeft,
    radarLeftSeconds: radarLeftSeconds,
    beacon: beacon,
    beaconRadiusUl: beaconRadiusUl,
    placeBeacon: placeBeacon,
    totem: totem,
    totemMaxHp: totemMaxHp,
    placeTotem: placeTotem,
    damageTotem: damageTotem,
    shieldEquipped: shieldEquipped,
    shieldActive: shieldActive,
    toggleShield: toggleShield,
    lastAbsorption: lastAbsorption,
    permitEquipped: permitEquipped,
    permitHolder: permitHolder,
    permitSpent: permitSpent,
    permitAvailable: permitAvailable,
    grantPermit: grantPermit,
    spendPermit: spendPermit,
    noteTowerGone: noteTowerGone,
    upgradeCostScale: upgradeCostScale,
    streakCharges: streakCharges,
    bountyPending: bountyPending,
    leaksSoFar: leaksSoFar,
    lostThisWaveYet: lostThisWaveYet
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = PlayerRun;
}
