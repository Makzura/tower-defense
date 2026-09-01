// ---------------------------------------------------------------------------
// PlayerPerks -- the PLAYER's permanent progression
//
// THE THIRD PROGRESSION IN THIS GAME AND IT IS NOT EITHER OF THE OTHER TWO. The
// A/B/C tiers are mana, in a run, on one body. A tower PERK is meta coins,
// permanent, and sits in one of that TYPE's five loadout slots. A PLAYER MODULE
// is meta coins and permanent too, and it belongs to the PLAYER rather than to
// any tower: it is equipped once and it changes the whole run.
//
//   module    bought once, occupies one of the Player's slots when equipped
//   square    an upgrade-squared: ranked, never occupies a slot, and applies
//             only while the module it improves is equipped
//
// FOUR FIVES NOW, AND THEY ARE ALL DIFFERENT. `MetaProgress.SLOT_COUNT` is how
// many TYPES fit in the build bar; `PERK_SLOTS` is how many perks fit in one
// type's loadout; a tower's in-run tiers go to five; and `PLAYER_SLOTS` is
// SEVEN, of which `2 + level` are usable. Nothing may read one for another.
//
// WHY THIS IS ITS OWN FILE RATHER THAN A SEVENTH TREE IN TowerPerks. That
// system is built around a TOWER TYPE: it is keyed by `constructor.ID`, its
// loadout is five wide, it is stored in a `progress` row, and its whole job is
// to wrap one tower instance's recompute. The Player is none of those things --
// it has no constructor, no catalogue entry, seven slots, and its effects reach
// the base, the wallet, the wave clock and the enemies as often as they reach a
// tower's stats. Bending one system to hold both would have made every rule in
// it conditional.
//
// WHERE THE HALVES LIVE
//
//   js/meta.js                  the SAVE: xp, modules, ranks, the seven slots,
//                               the reset stamp
//   this file                   the RULES and the TREE: what a module costs,
//                               what it requires, and THE RESOLVED BLOCK
//   js/perks/player-modules.js  the CONTENT
//   js/systems/player-effects.js  how the resolved block reaches a tower
//   js/systems/player-run.js    the in-run state it drives
//   js/upgrades.js              the screens
//
// **THE RESOLVED BLOCK IS THE WHOLE INTERFACE.** Everything else in the game
// asks `PlayerPerks.resolved()` and reads a plain object of named numbers --
// `firstTowerDiscount`, `debtLimit`, `beaconRadiusUl`, and so on. A module
// contributes by adding to that object and nothing else, so:
//
//   * an empty loadout resolves the NEUTRAL block, which is the current game
//     to the bit -- every reader is written against the neutral value;
//   * two modules that move the same number compose by summing POINTS, with no
//     opinion about which slot each sits in;
//   * a square is its parent's contribution and cannot be applied without it;
//   * nothing is ever written back onto a tower's authored data.
//
// THE LOADOUT IS FROZEN FOR THE LENGTH OF A RUN, exactly as a tower's is:
// `lockForRun` takes a copy and `activeIds` reads that copy while a run is up,
// so a level earned mid-run opens its slot on the preparation screen afterwards
// and never under a player who is playing.
// ---------------------------------------------------------------------------

var PlayerPerks = (function () {

  // Filled by js/perks/player-modules.js at load.
  var MODULES = [];
  var SQUARES = [];

  // The frozen loadout while a run is up, or null outside one.
  var runLoadout = null;

  // The resolved block, cached. `resolved()` is asked on every tower restat and
  // several times a frame by the run systems, and it walks the whole loadout --
  // so it is computed once and thrown away whenever anything it depends on
  // moves. `dirty()` is the one door for that.
  var cache = null;

  function register(tree) {
    if (!tree) return;
    if (tree.modules) MODULES = tree.modules.slice();
    if (tree.upgrades2) SQUARES = tree.upgrades2.slice();
    cache = null;
  }

  function modules() { return MODULES.slice(); }
  function upgrades2() { return SQUARES.slice(); }

  function moduleOf(id) {
    for (var i = 0; i < MODULES.length; i++) if (MODULES[i].id === id) return MODULES[i];
    return null;
  }

  function upgrade2Of(id) {
    for (var i = 0; i < SQUARES.length; i++) if (SQUARES[i].id === id) return SQUARES[i];
    return null;
  }

  function labelOf(id) {
    var node = moduleOf(id) || upgrade2Of(id);
    return node ? node.name : id;
  }

  // --- the secret node -------------------------------------------------------
  //
  // ONE NODE IN THE TREE IS HIDDEN UNTIL IT IS EARNED, and "hidden" means the
  // screen draws `???` with no name, no price, no effect and no prerequisite --
  // not a greyed-out card with everything readable on it.
  //
  // THE REVEAL IS RECOMPUTED, NEVER STORED. Every condition is a fact already in
  // the save (how many modules are owned, what rank three squares have reached),
  // so there is nothing to persist and nothing that can drift: a reset hides it
  // again, which is correct, and a profile moved between machines answers the
  // same question the same way.
  function revealProblems(node) {
    var need = node && node.secret;
    if (!need) return [];
    var out = [];
    if (need.modules) {
      var have = MetaProgress.ownedModules().length;
      if (have < need.modules) {
        out.push({ label: need.modules + " Player modules owned", have: have,
                   need: need.modules, met: false });
      } else {
        out.push({ label: need.modules + " Player modules owned", have: have,
                   need: need.modules, met: true });
      }
    }
    (need.ranks || []).forEach(function (req) {
      var have = rankOf(req.id);
      out.push({ label: labelOf(req.id) + " rank " + req.rank, have: have,
                 need: req.rank, met: have >= req.rank });
    });
    (need.owns || []).forEach(function (id) {
      var have = MetaProgress.ownsModule(id);
      out.push({ label: labelOf(id) + " owned", have: have ? 1 : 0, need: 1,
                 met: have });
    });
    return out;
  }

  function isRevealed(node) {
    if (!node || !node.secret) return true;
    if (MetaProgress.ownsModule(node.id)) return true;      // bought is revealed
    return revealProblems(node).every(function (r) { return r.met; });
  }

  // --- what state a module is in ---------------------------------------------
  //
  // The same five words a tower's node uses, answered in one place so the ring,
  // the card and the purchase can never disagree -- plus `hidden`, which only
  // the secret node can be.
  function stateOf(id) {
    var node = moduleOf(id);
    if (!node) return { state: "locked", reason: "no such module" };

    var out = {
      node: node, cost: node.cost || 0,
      missing: [], hidden: false, requirements: []
    };

    if (MetaProgress.ownsModule(id)) {
      out.state = "owned";
      out.reason = null;
      out.equipped = MetaProgress.equippedModules().indexOf(id) !== -1;
      return out;
    }

    if (node.secret && !isRevealed(node)) {
      out.state = "hidden";
      out.hidden = true;
      out.reason = null;
      return out;
    }
    if (node.secret) out.requirements = revealProblems(node);

    // EVERY PREREQUISITE IS ANSWERED, met or not, and the list is never
    // short-circuited -- a node with two parents must be able to show one
    // satisfied beside one missing.
    out.parents = (node.requires || []).map(function (req) {
      return { id: req, name: labelOf(req), met: MetaProgress.ownsModule(req) };
    });
    var missing = out.parents.filter(function (p) { return !p.met; });
    out.missing = missing.map(function (p) { return p.id; });
    out.parentsMet = out.parents.length - missing.length;
    out.parentsTotal = out.parents.length;

    if (missing.length) {
      out.state = "locked";
      out.reason = "needs " + missing.map(function (p) { return p.name; }).join(" and ");
      return out;
    }
    if (MetaProgress.coins() < out.cost) {
      out.state = "poor";
      out.reason = "costs " + out.cost + " meta coins, you have " + MetaProgress.coins();
      return out;
    }
    out.state = "buyable";
    out.reason = null;
    return out;
  }

  // THE ONLY CALLER OF MetaProgress.buyModule. Tree rules here, spend there.
  function buy(id) {
    var state = stateOf(id);
    if (state.state === "owned") return { ok: false, reason: "already bought" };
    if (state.state === "hidden") return { ok: false, reason: "no such module" };
    if (state.state !== "buyable") return { ok: false, reason: state.reason };
    var out = MetaProgress.buyModule(id, state.cost);
    if (out.ok) dirty();
    return out;
  }

  // --- the squares -----------------------------------------------------------

  function parentsOf(node) {
    if (!node) return [];
    var out = [];
    if (node.parent) out.push(node.parent);
    if (node.alsoParent) out.push(node.alsoParent);
    return out;
  }

  function isFusion(node) { return (node && node.requires ? node.requires.length : 0) > 1; }

  // The rank this build will honour, clamped to the node's own maximum -- the
  // save stores what it was told and cannot know a maximum.
  function rankOf(id) {
    var node = upgrade2Of(id);
    if (!node) return 0;
    return Math.max(0, Math.min(node.maxRank || 0, MetaProgress.playerRankOf(id)));
  }

  function rankPrice(node, rank) {
    if (!node || !node.prices) return null;
    if (rank < 1 || rank > node.prices.length) return null;
    var price = node.prices[rank - 1];
    return typeof price === "number" ? price : null;
  }

  function rankSpend(node, rank) {
    var total = 0;
    for (var i = 1; i <= rank; i++) {
      var price = rankPrice(node, i);
      if (typeof price === "number") total += price;
    }
    return total;
  }

  // EVERY REQUIREMENT, ANSWERED WHETHER OR NOT IT IS MET. This is what makes a
  // half-met fusion show as half met rather than as one flat "locked": the list
  // is complete and each entry carries the rank it has against the rank it
  // needs, so the card can tick one and cross the other.
  function requirementsOf(node) {
    return (node && node.requires ? node.requires : []).map(function (req) {
      var have = rankOf(req.id);
      return {
        id: req.id, name: labelOf(req.id), need: req.rank || 1,
        have: have, met: have >= (req.rank || 1)
      };
    });
  }

  function upgrade2StateOf(id) {
    var node = upgrade2Of(id);
    if (!node) return { state: "locked", reason: "no such upgrade" };

    var rank = rankOf(id);
    var max = node.maxRank || 0;
    var equipped = activeIds();
    var parents = parentsOf(node).map(function (pid) {
      return {
        id: pid, name: labelOf(pid),
        owned: MetaProgress.ownsModule(pid),
        equipped: equipped.indexOf(pid) !== -1
      };
    });
    var reqs = requirementsOf(node);
    var out = {
      node: node, rank: rank, maxRank: max,
      nextRank: rank < max ? rank + 1 : null,
      nextCost: rank < max ? rankPrice(node, rank + 1) : null,
      parents: parents, requirements: reqs,
      requirementsMet: reqs.filter(function (r) { return r.met; }).length,
      requirementsTotal: reqs.length,
      // Owned and doing nothing, because the module it improves is on the
      // bench. A legal, ordinary state -- not an error and not a refund.
      dormant: rank > 0 && parents.some(function (p) { return !p.equipped; }),
      spent: rankSpend(node, rank)
    };

    if (rank >= max) { out.state = "maxed"; out.reason = null; return out; }

    var unowned = parents.filter(function (p) { return !p.owned; });
    if (unowned.length) {
      out.state = "locked";
      out.reason = "needs " + unowned.map(function (p) { return p.name; })
        .join(" and ") + " bought first";
      return out;
    }
    var short = reqs.filter(function (r) { return !r.met; });
    if (short.length) {
      out.state = "locked";
      out.reason = "needs " + short.map(function (r) {
        return r.name + " rank " + r.need + " (you have " + r.have + ")";
      }).join(" and ");
      return out;
    }
    var cost = out.nextCost || 0;
    if (MetaProgress.coins() < cost) {
      out.state = "poor";
      out.reason = "rank " + out.nextRank + " costs " + cost +
        " meta coins, you have " + MetaProgress.coins();
      return out;
    }
    out.state = "buyable";
    out.reason = null;
    return out;
  }

  function buyRank(id) {
    var state = upgrade2StateOf(id);
    if (state.state === "maxed") return { ok: false, reason: "already at maximum rank" };
    if (state.state !== "buyable") return { ok: false, reason: state.reason };
    var out = MetaProgress.buyPlayerRank(id, state.nextCost, state.nextRank);
    if (out.ok) dirty();
    return out;
  }

  // --- inventory, loadout and the reset --------------------------------------

  function inventory() {
    var owned = MetaProgress.ownedModules();
    return MODULES.filter(function (n) { return owned.indexOf(n.id) !== -1; });
  }

  function loadout() {
    return MetaProgress.equippedModules().map(function (id) {
      return id === null ? null : moduleOf(id);
    });
  }

  function equip(id, slot) {
    var out = MetaProgress.equipModule(id, slot);
    if (out.ok) dirty();
    return out;
  }

  function unequip(slot) {
    var out = MetaProgress.unequipModule(slot);
    if (out.ok) dirty();
    return out;
  }

  // WHAT A RESET HANDS BACK: every module at its authored price, and every rank
  // at the price that rank cost. Read off the tree, so retuning a cost retunes
  // the refund and the two cannot drift.
  function refundValue() {
    var total = 0;
    MetaProgress.ownedModules().forEach(function (id) {
      var node = moduleOf(id);
      if (node && typeof node.cost === "number") total += node.cost;
    });
    var ranks = MetaProgress.playerRanks();
    Object.keys(ranks).forEach(function (id) {
      var node = upgrade2Of(id);
      if (node) total += rankSpend(node, rankOf(id));
    });
    return total;
  }

  // HOW MANY NODES A RESET REVOKES, and therefore what it is charged for.
  //
  // **EVERY RANK IS ITS OWN NODE HERE.** That is the brief's rule for the
  // Player and it is deliberately NOT the rule a tower's tree follows, where a
  // ranked node counts once however many ranks it holds. Both are the owner's,
  // they are different, and the difference is written down in both places so
  // nobody "fixes" one into the other.
  function resetNodeCount() {
    var ranks = MetaProgress.playerRanks();
    var total = MetaProgress.ownedModules().length;
    Object.keys(ranks).forEach(function (id) { total += ranks[id]; });
    return total;
  }

  function reset(nowMs) {
    var out = MetaProgress.resetPlayer(refundValue(), nowMs);
    if (out.ok) dirty();
    return out;
  }

  // --- the run snapshot ------------------------------------------------------

  function lockForRun() {
    runLoadout = MetaProgress.equippedModules();
    cache = null;
  }

  function releaseRun() {
    runLoadout = null;
    cache = null;
  }

  function isLocked() { return runLoadout !== null; }

  function activeIds() {
    var raw = runLoadout ? runLoadout : MetaProgress.equippedModules();
    return raw.filter(function (id) { return !!id; });
  }

  function activeModules() {
    return activeIds().map(moduleOf).filter(Boolean);
  }

  // Is this module equipped right now? The one question every run system asks
  // before it offers an action or applies an effect.
  function has(id) { return activeIds().indexOf(id) !== -1; }

  // --- THE RESOLVED BLOCK ----------------------------------------------------
  //
  // THE NEUTRAL VALUES ARE THE CURRENT GAME, and that is the contract: every
  // reader elsewhere is written against the number below, so an empty loadout
  // -- or a profile that has never seen this system -- resolves exactly what
  // the game resolved before it existed.
  //
  // PERCENTAGE POINTS, NOT MULTIPLIERS, wherever two nodes can move the same
  // number. Points sum, so a module and its square compose without either
  // knowing the other's rank and without slot order mattering; the reader turns
  // the sum into a factor exactly once.
  function neutral() {
    return {
      // --- Intendant: what a placement costs ---------------------------------
      firstTowerDiscount: 0,      // mana off the first of each type this run
      laterTowerSurcharge: 0,     // mana onto every later one of that type
      duplicateSurchargePct: 0,   // percent onto a placement that is a duplicate

      // --- Trésorerie / Gardien: the purse and the base ----------------------
      startingManaBonus: 0,
      startingManaPenalty: 0,
      fixedWaveRewardPenaltyPct: 0,
      baseHpBonus: 0,

      // --- Crédit d'urgence --------------------------------------------------
      debtLimit: 0,               // 0 means there is no credit at all
      debtInterestPct: 0,

      // --- Ferrailleur / Plan compact: the towers themselves -----------------
      destroyRefundPct: 0,
      towerHpPenaltyPct: 0,
      footprintPenaltyPct: 0,

      // --- Architecte and its branch: proximity and composition --------------
      neighbourRadiusUl: 0,       // 0 means no proximity rule is equipped
      archDifferentBonusPct: 0,
      archSamePenaltyPct: 0,
      sharedPerTypePct: 0,
      sharedCapPct: 0,
      isolatedBonusPct: 0,
      crowdedPenaltyPct: 0,

      // --- Commandant and its branch: the orders -----------------------------
      markSeconds: 0,
      markCooldownSeconds: 0,
      markDamagePenaltyPct: 0,
      overdriveFireRatePct: 0,
      overdriveSeconds: 0,
      overdriveStunSeconds: 0,
      radarSeconds: 0,
      radarCooldownSeconds: 0,
      radarRangePenaltyPct: 0,
      beaconRadiusUl: 0,
      beaconSpeedPct: 0,
      beaconRangePct: 0,
      beaconFarFireRatePenaltyPct: 0,
      forecastWaves: 0,           // how many future waves the readout shows
      transitionSeconds: null,    // null means "the game's own delay"

      // --- Gardien's branch: the base ----------------------------------------
      firstLeakPct: 100,          // what the first leak of a wave costs
      shieldMaxFractionPct: 0,
      shieldManaPerDamage: 0,
      shieldRewardPenaltyPct: 0,
      noLeakBounty: 0,
      streakPerChargePct: 0,
      streakMaxCharges: 0,
      streakLossCap: 0,           // 0 means "all of them"

      // --- the two fusions ---------------------------------------------------
      blitzSecondsPerMana: 0,     // 0 means Blitz is not equipped
      blitzCapMana: 0,
      blitzHastePct: 0,
      blitzHasteSeconds: 0,
      totemHp: 0,                 // 0 means the totem is not equipped
      totemFireRatePct: 0,
      totemDeathDamage: 0,

      // --- the secret --------------------------------------------------------
      permitUpgradeSurchargePct: 0,
      permitRestitution: false
    };
  }

  // THE BLOCK EVERY OTHER FILE READS. Cached, because a tower's restat asks for
  // it and a board of twenty towers restats on every purchase.
  function resolved() {
    if (cache) return cache;
    var out = neutral();
    activeModules().forEach(function (node) {
      if (typeof node.resolve === "function") node.resolve(out, rankOf);
      // A SQUARE IS ITS PARENT'S CONTRIBUTION. It is folded in HERE, inside the
      // parent's own pass, which is what makes "it applies only while its parent
      // is equipped" structural rather than a check somebody has to remember.
      SQUARES.forEach(function (sq) {
        if (sq.parent !== node.id) return;
        var rank = rankOf(sq.id);
        if (rank > 0 && typeof sq.resolve === "function") sq.resolve(out, rank, rankOf);
      });
    });
    normalise(out);
    cache = out;
    return out;
  }

  // THE TWO FLOORS THE CONTENT CANNOT ENFORCE ON ITS OWN, because each is a
  // property of a SUM that no single node can see. Both are stated by the owner
  // as limits rather than as arithmetic, which is why they are clamps here and
  // not a different formula there.
  function normalise(out) {
    // Optiques calibrées eases the radar's permanent range cost and "never
    // takes it below zero" -- the authored ranks stop at 1.75%, and the floor
    // is what keeps that true if the curve is ever retuned.
    if (out.radarRangePenaltyPct < 0) out.radarRangePenaltyPct = 0;
    // Briefing méthodique buys back seconds between waves and "never past the
    // base game's own gap" -- five seconds, WAVE_CLEAR_DELAY in js/game.js.
    if (out.transitionSeconds !== null && out.transitionSeconds > 5) {
      out.transitionSeconds = 5;
    }
  }

  // Throw the cache away. Called by every mutator here, and by the run systems
  // when something they own changes what `resolved()` would answer.
  function dirty() { cache = null; }

  return {
    register: register,
    modules: modules,
    upgrades2: upgrades2,
    moduleOf: moduleOf,
    upgrade2Of: upgrade2Of,
    labelOf: labelOf,
    stateOf: stateOf,
    buy: buy,
    upgrade2StateOf: upgrade2StateOf,
    buyRank: buyRank,
    rankOf: rankOf,
    rankPrice: rankPrice,
    rankSpend: rankSpend,
    parentsOf: parentsOf,
    isFusion: isFusion,
    requirementsOf: requirementsOf,
    revealProblems: revealProblems,
    isRevealed: isRevealed,
    inventory: inventory,
    loadout: loadout,
    equip: equip,
    unequip: unequip,
    refundValue: refundValue,
    resetNodeCount: resetNodeCount,
    reset: reset,
    lockForRun: lockForRun,
    releaseRun: releaseRun,
    isLocked: isLocked,
    activeIds: activeIds,
    activeModules: activeModules,
    has: has,
    neutral: neutral,
    resolved: resolved,
    dirty: dirty
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = PlayerPerks;
}
