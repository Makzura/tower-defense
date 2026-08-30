// ---------------------------------------------------------------------------
// TowerPerks -- PERMANENT upgrades, one tree per tower type
//
// THE SECOND UPGRADE SYSTEM, AND IT IS NOT THE FIRST ONE. The game already has
// upgrades: the A/B/C tiers a tower buys with MANA, during a run, on one body,
// lost when the run ends. Those are untouched and stay exactly what they were.
//
// This is the other kind. A PERK is bought once, with META COINS, out of a
// tower TYPE's own tree, and it outlives every run. Buying it does not switch
// it on: a type has a LOADOUT of up to five perk slots, opened one at a time by
// the type's LEVEL, and only a perk sitting in a slot does anything at all.
//
//   bought    the node is paid for. It is in the type's inventory forever
//   equipped  it is in one of the level's slots, so runs will feel it
//
// THREE FIVES IN THIS GAME AND THEY ARE ALL DIFFERENT. `MetaProgress.SLOT_COUNT`
// is how many TYPES fit in the build bar. `MetaProgress.PERK_SLOTS` is how many
// PERKS fit in one type's loadout. A tower's in-run tiers go to five as well.
// Nothing may read one for another; see the note on PERK_SLOTS in js/meta.js.
//
// WHERE THE HALVES LIVE
//
//   js/meta.js            the SAVE: xp, bought nodes, the five slots, the reset
//                         stamp -- plus every invariant that is about storage
//   this file             the RULES and the TREES: what a node costs, what it
//                         requires, what it does, and how a perk reaches a
//                         tower that is being built
//   js/perks/*-perks.js   the CONTENT: one file per tower, one tree each
//   js/upgrades.js        the two screens
//
// HOW A PERK REACHES A TOWER, and why no tower file had to change for it.
//
// Every tower in this game recomputes its numbers from scratch: the
// hand-written ones in `recalcStats`, the config-driven ones in
// `_refreshStats` through StatResolver. Both start from the base and fold in
// the tiers that have been bought, so anything written onto a tower from
// outside is erased by its next upgrade.
//
// So a perk is not written onto the tower. `applyTo` WRAPS the tower's own
// recompute on that instance, and the perks run as a POST-PASS after every one
// of them. The order is therefore fixed and stateable: **base, then the in-run
// tiers, then the equipped perks.** That is the same seam `farmBoostMult`
// already uses inside `_refreshStats` (js/towers/tower-runtime.js) -- a Farm's
// investment is not an upgrade either and is applied after the resolve for the
// same reason.
//
// WHERE A PERK WRITES. A hand-written tower keeps its numbers on the instance
// (`this.damage`); a config-driven one keeps them in `this.stats`. `statTarget`
// answers which, once, and every tree is authored against its own tower's own
// field names -- which is correct rather than a shortcut: the trees are
// unique per tower by design, so a shared vocabulary would buy nothing and
// would forbid exactly the tower-specific effects the system exists for.
//
// THE LOADOUT IS FROZEN FOR THE LENGTH OF A RUN. `lockForRun` takes a copy at
// the moment a run starts and `activeIds` reads that copy while one is up. A
// type that levels up mid-run banks the level immediately and gets the new slot
// on the preparation screen afterwards -- the board it is standing on keeps the
// five it started with, so no tower can change under a player who is playing.
// ---------------------------------------------------------------------------

var TowerPerks = (function () {

  // towerId -> { towerId, nodes: [...] }, filled by js/perks/*-perks.js at load.
  var TREES = {};

  // The frozen loadout while a run is up: towerId -> [nodeId|null x5], or null
  // when no run is running and the live profile is the answer.
  var runLoadout = null;

  // --- the tree format -------------------------------------------------------
  //
  // A NODE, and every field except `id` and `name` is optional:
  //
  //   id         stable, unique within the tree. A PERSISTENCE FORMAT: it is
  //              what the save writes down, so renaming one un-buys it
  //   name       what the player reads
  //   blurb      the full description, including the trade if there is one
  //   cost       meta coins. Per node, on purpose -- there is no formula
  //   requires   node ids that must ALL be bought first. AND, never OR: a
  //              convergence with two parents needs both, which is the shape
  //              section 11 of the brief asks for
  //   minLevel   the tower's level must be at least this
  //   at         { x, y } in node units, for the tree screen's layout. The
  //              tower sits at 0,0 and the four base nodes go out from it
  //   effects    what it DOES -- see applyEffects below
  //
  // Nothing here reads a tower constructor, a stat name or a tier id, so a tree
  // may be any size and any shape and may do anything its tower understands.

  function register(tree) {
    if (!tree || !tree.towerId) return;
    TREES[tree.towerId] = {
      towerId: tree.towerId,
      // A tree with no nodes is a tower whose content has not been authored
      // yet, and it is a legal state: the screens show it as empty rather than
      // as broken. Nothing else in the system cares.
      nodes: (tree.nodes || []).slice()
    };
  }

  function treeOf(towerId) { return TREES[towerId] || null; }

  function nodes(towerId) {
    var tree = treeOf(towerId);
    return tree ? tree.nodes.slice() : [];
  }

  function nodeOf(towerId, nodeId) {
    var list = nodes(towerId);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === nodeId) return list[i];
    }
    return null;
  }

  // Every tower id that has a tree registered. Used by the tests and by the
  // authoring checks; the screens iterate OWNED towers instead, because a tree
  // for a tower you have not bought is not yours to look at.
  function towersWithTrees() { return Object.keys(TREES); }

  // --- what state a node is in ----------------------------------------------
  //
  // The five the brief names, answered in one place so the node's colour, its
  // detail panel and the purchase itself can never disagree:
  //
  //   owned      bought already
  //   buyable    every prerequisite met, level reached, coins in hand
  //   poor       nothing missing but the coins
  //   level      prerequisites met, level too low
  //   locked     a prerequisite is not bought
  //
  // `reason` is the sentence the panel prints, and it is the same sentence the
  // refusal returns -- a button that says why it is dark and a click that says
  // something else is the bug this shape prevents.
  function stateOf(towerId, nodeId) {
    var node = nodeOf(towerId, nodeId);
    if (!node) return { state: "locked", reason: "no such upgrade" };

    if (MetaProgress.ownsNode(towerId, nodeId)) {
      return { state: "owned", node: node, reason: null, missing: [], cost: node.cost || 0 };
    }

    var missing = (node.requires || []).filter(function (req) {
      return !MetaProgress.ownsNode(towerId, req);
    });
    var progress = MetaProgress.progressOf(towerId);
    var needLevel = node.minLevel || 0;
    var cost = node.cost || 0;
    var out = {
      node: node, cost: cost, missing: missing,
      minLevel: needLevel, level: progress.level
    };

    if (missing.length) {
      out.state = "locked";
      out.reason = missing.length === 1
        ? "needs " + labelOf(towerId, missing[0])
        : "needs " + missing.length + " earlier upgrades: " +
          missing.map(function (m) { return labelOf(towerId, m); }).join(", ");
      return out;
    }
    if (progress.level < needLevel) {
      out.state = "level";
      out.reason = "needs tower level " + needLevel + " (you are " + progress.level + ")";
      return out;
    }
    if (MetaProgress.coins() < cost) {
      out.state = "poor";
      out.reason = "costs " + cost + " meta coins, you have " + MetaProgress.coins();
      return out;
    }
    out.state = "buyable";
    out.reason = null;
    return out;
  }

  function labelOf(towerId, nodeId) {
    var node = nodeOf(towerId, nodeId);
    return node ? node.name : nodeId;
  }

  // THE ONLY CALLER OF MetaProgress.buyNode. The tree rules are checked here
  // and the spend happens there, which is the same division store.js has with
  // the build bar. A second caller would be a second copy of the rules.
  function buy(towerId, nodeId) {
    var state = stateOf(towerId, nodeId);
    if (state.state === "owned") return { ok: false, reason: "already bought" };
    if (state.state !== "buyable") return { ok: false, reason: state.reason };
    return MetaProgress.buyNode(towerId, nodeId, state.cost);
  }

  // What a reset would hand back: every bought node at the price it was bought
  // for. Read off the tree, so retuning a node's cost retunes its refund and
  // the two cannot drift.
  //
  // A node whose id is in the save but NOT in this build's tree refunds
  // nothing, which is the honest answer -- this build cannot know what it cost.
  // It is also removed by the reset, which is the same thing happening to it as
  // to every other node.
  function refundValue(towerId) {
    var total = 0;
    MetaProgress.ownedNodes(towerId).forEach(function (id) {
      var node = nodeOf(towerId, id);
      if (node && typeof node.cost === "number") total += node.cost;
    });
    return total;
  }

  function resetTree(towerId, nowMs) {
    return MetaProgress.resetTree(towerId, refundValue(towerId), nowMs);
  }

  // --- inventory and loadout -------------------------------------------------

  // Every bought node as a node OBJECT, in tree order rather than purchase
  // order, so the inventory does not reshuffle itself as it grows. Unknown ids
  // are dropped here, which is what makes an old save with a retired node load
  // without showing the player a blank card.
  function inventory(towerId) {
    var owned = MetaProgress.ownedNodes(towerId);
    return nodes(towerId).filter(function (node) {
      return owned.indexOf(node.id) !== -1;
    });
  }

  // The five slots as node objects (or null). Holes are holes; a slot the level
  // has not opened is null here too, and the screen is what draws the lock.
  function loadout(towerId) {
    return MetaProgress.equippedPerks(towerId).map(function (id) {
      return id === null ? null : nodeOf(towerId, id);
    });
  }

  // --- the run snapshot ------------------------------------------------------

  // Freeze every owned tower's loadout for the run about to start. Called from
  // restartGame, which every entry into a board goes through.
  function lockForRun() {
    var frozen = {};
    MetaProgress.snapshot().owned.forEach(function (towerId) {
      frozen[towerId] = MetaProgress.equippedPerks(towerId);
    });
    runLoadout = frozen;
  }

  // Back to the live profile. Called when a run is left for the menu, so the
  // preparation screens read what the player is actually editing.
  function releaseRun() { runLoadout = null; }

  function isLocked() { return runLoadout !== null; }

  // Which perk ids are ACTIVE for a type right now: the frozen copy during a
  // run, the live loadout outside one. Holes dropped -- callers want the perks,
  // not the shape of the bar.
  function activeIds(towerId) {
    var raw = runLoadout
      ? (runLoadout[towerId] || [])
      : MetaProgress.equippedPerks(towerId);
    return raw.filter(function (id) { return !!id; });
  }

  function activeNodes(towerId) {
    return activeIds(towerId).map(function (id) {
      return nodeOf(towerId, id);
    }).filter(Boolean);
  }

  // --- effects ---------------------------------------------------------------
  //
  // SIX KINDS, AND AN ORDER THAT IS STATED RATHER THAN EMERGENT:
  //
  //   mul      every factor for a field multiplies together, first
  //   add      every delta for a field sums, on top of that
  //   addRate  a PERIOD field raised by a RATE -- see below
  //   set      an absolute value; the last equipped slot holding one wins
  //   price    the placement cost -- { mul, add }, same order
  //   tiers    { A1: { cost: +50 }, ... } -- what an IN-RUN tier costs
  //
  //   final = base * (all muls) + (all adds), then addRate, then any set
  //
  // Slot order does not change a result for `mul` or `add`, which is what makes
  // "drag it to a different slot" free of consequence. It does for `set`, and
  // that is why `set` is documented as last-slot-wins rather than left to be
  // discovered.
  //
  // `addRate` EXISTS BECAUSE "+0.15 ATTACKS A SECOND" IS NOT "-0.15 SECONDS".
  // Attack speed is stored on several towers as a PERIOD (`cooldownSeconds`,
  // `burstCooldown`), and subtracting a rate from a period is wrong at every
  // value but one: 0.15 off a 3-second swing is +0.176/s, and off a 1-second
  // one it is +0.176/s again only by coincidence of the arithmetic being wrong
  // in the same direction. So this inverts, adds, and inverts back --
  // `f = 1 / (1/f + rate)` -- which gives exactly "whatever rate the tower
  // actually reached, plus this", on any crosspath and at any starting value.
  //
  // `tiers` MOVES THE PRICE OF ONE IN-RUN UPGRADE, in mana, during a run. It
  // reaches the player through the tower's own `upgradeCost(id)`, which is
  // wrapped on the instance, so the panel button, the hover card, the
  // affordability check, the till and `totalSpent` all quote the same number.
  // A tower with no `upgradeCost` ignores it.
  //
  // `when` IS A LIST OF CONDITIONAL GROUPS, and it is what lets ONE node say
  // "A2 gains two shots and A3 one more". Each entry is
  // `{ has: "<field>", add/mul/set/addRate }` and applies only while that field
  // is truthy on the tower. `onlyIf` is the same idea for a whole node.
  //
  // `onlyIf` is how a perk MODIFIES ONE IN-RUN UPGRADE rather than the tower:
  // the effect is skipped unless that field is truthy on the tower. A perk that
  // improves the Rifleman's B4 recruits carries `onlyIf: "hasRecruitAbility"`,
  // so it is inert on a Rifleman that never bought B4 and cannot pay for a tier
  // the player did not buy.
  //
  // `onlyIf` DOES NOT REACH `price`, AND MUST NOT BE AUTHORED BESIDE ONE. A
  // build price belongs to the TYPE and is quoted on the build bar before any
  // tower exists, so there is nothing to test the condition against; a
  // conditional node that still charged would be the dishonest half of the
  // effect. A node either changes what a tower costs or it changes what one
  // tier does -- never both.

  // WHERE THE NUMBERS LIVE ON THIS TOWER, and there are three shapes of that.
  //
  //   an ADAPTER (the Arcane Sniper, the Siphon) wraps a ConfiguredTower and
  //     the resolved stats are on `core.stats` -- NOT on the adapter, which
  //     only copies a few of them out in `refreshDerived`;
  //   a bare ConfiguredTower has them on `stats`;
  //   every hand-written tower has them on the instance.
  //
  // Asked once, here, so no caller has to know which kind it is holding.
  function statTarget(tower) {
    if (!tower) return tower;
    if (tower.core && tower.core.stats && typeof tower.core.stats === "object") {
      return tower.core.stats;
    }
    return (tower.stats && typeof tower.stats === "object") ? tower.stats : tower;
  }

  function applyEffects(tower) {
    var towerId = tower.constructor && tower.constructor.ID;
    var list = activeNodes(towerId);
    if (!list.length) return;

    var target = statTarget(tower);
    var muls = {}, adds = {}, sets = {};

    var rates = {};

    list.forEach(function (node) {
      var fx = node.effects;
      if (!fx) return;
      if (fx.onlyIf && !tower[fx.onlyIf]) return;

      gather(fx);
      (fx.when || []).forEach(function (group) {
        if (!group || !group.has || !tower[group.has]) return;
        gather(group);
      });
    });

    function gather(block) {
      collect(block.mul, muls, function (have, v) { return have * v; }, 1);
      collect(block.add, adds, function (have, v) { return have + v; }, 0);
      collect(block.addRate, rates, function (have, v) { return have + v; }, 0);
      collect(block.set, sets, function (have, v) { return v; }, null);
    }

    var hpBefore = readHp(tower, target);
    var rangeBefore = readRange(tower, target);

    Object.keys(muls).forEach(function (field) {
      if (typeof target[field] === "number") target[field] *= muls[field];
    });
    Object.keys(adds).forEach(function (field) {
      if (typeof target[field] === "number") target[field] += adds[field];
    });
    Object.keys(rates).forEach(function (field) {
      var period = target[field];
      if (typeof period !== "number" || !(period > 0)) return;
      var raised = 1 / period + rates[field];
      target[field] = raised > 0 ? 1 / raised : period;
    });
    Object.keys(sets).forEach(function (field) {
      target[field] = sets[field];
    });

    settleHp(tower, target, hpBefore);
    settleRange(tower, target, rangeBefore);
  }

  // WHAT ONE IN-RUN TIER COSTS EXTRA (or less) UNDER THE ACTIVE PERKS. Summed
  // across the loadout, so two equipped perks that both touch A4 both count --
  // which is the "cumuls" the brief asks for, and falls out of summing rather
  // than needing a rule.
  function tierCostDelta(towerId, tierId) {
    var delta = 0;
    activeNodes(towerId).forEach(function (node) {
      var tiers = node.effects && node.effects.tiers;
      var row = tiers && tiers[tierId];
      if (row && typeof row.cost === "number") delta += row.cost;
    });
    return delta;
  }

  function collect(block, into, fold, seed) {
    if (!block) return;
    Object.keys(block).forEach(function (field) {
      var have = (into[field] === undefined) ? seed : into[field];
      into[field] = fold(have, block[field]);
    });
  }

  // HIT POINTS ARE THE ONE STAT WITH A SECOND HALF. Every other field is a
  // number a tower reads; this one has a CURRENT beside its maximum, and a perk
  // that raises the maximum must not quietly heal a tower that has been hurt --
  // nor leave a freshly built one at less than full.
  //
  // A hand-written tower calls its maximum `maxHp`; a config-driven one resolves
  // `hp` in `stats` and copies it to `maxHp`. Both are read here so a tree may
  // be authored against whichever name its own tower uses.
  function readHp(tower, target) {
    return {
      stat: (typeof target.hp === "number") ? target.hp : null,
      max: (typeof tower.maxHp === "number") ? tower.maxHp : null
    };
  }

  // REACH IS TWO NUMBERS AND ONLY ONE OF THEM IS THE STAT. Every tower caches
  // `rangePx` -- through `elevatedRangePx`, so the ground under it counts --
  // and `rangePx` is what targeting, the range ring and the bullets read.
  // A perk that moved `rangeUl` and left `rangePx` alone would show the player
  // a bigger circle in the panel and shoot the old one.
  //
  // The config-driven towers keep the stat in `core.stats.range` and copy it
  // out in `refreshDerived`, which has already run by the time a perk lands --
  // so both halves are re-derived here from whichever name the tower uses.
  //
  // FOOTPRINT IS DELIBERATELY NOT HANDLED. It is placement-only on every tower
  // in this game and no tier moves it either; a perk that changed it would move
  // where a tower may stand after it is standing there.
  function readRange(tower, target) {
    return {
      stat: (typeof target.range === "number") ? target.range : null,
      ul: (typeof tower.rangeUl === "number") ? tower.rangeUl : null
    };
  }

  function settleRange(tower, target, before) {
    if (before.stat !== null && typeof target.range === "number" &&
        target.range !== before.stat) {
      tower.rangeUl = target.range;
    }
    if (typeof tower.rangeUl !== "number" || typeof tower.rangePx !== "number") return;
    if (before.ul !== null && tower.rangeUl === before.ul &&
        (before.stat === null || target.range === before.stat)) {
      return;                       // nothing moved, nothing to re-derive
    }
    if (typeof elevatedRangePx !== "function") return;
    tower.rangePx = tower.rangeUl > 0 ? elevatedRangePx(tower, tower.rangeUl) : 0;
  }

  function settleHp(tower, target, before) {
    if (before.stat !== null && typeof target.hp === "number" &&
        target.hp !== before.stat && typeof tower.maxHp === "number") {
      // A config tower's `_refreshStats` already set maxHp from the pre-perk
      // resolve; carry the perk's delta onto it too.
      tower.maxHp += target.hp - before.stat;
    }
    if (typeof tower.maxHp !== "number" || typeof tower.currentHp !== "number") return;

    // THE DELTA REACHES `currentHp` EXACTLY ONCE, on the first application. A
    // restat runs on every in-run upgrade and would otherwise heal the tower a
    // little each time; the maximum is recomputed from base each time and is
    // correct to raise on every pass, the damage already taken is not.
    if (!tower.perkHpSettled) {
      tower.perkHpSettled = true;
      var granted = tower.maxHp - (before.max === null ? tower.maxHp : before.max);
      if (granted > 0) tower.currentHp = Math.min(tower.maxHp, tower.currentHp + granted);
    }
    if (tower.currentHp > tower.maxHp) tower.currentHp = tower.maxHp;
  }

  // --- the placement price ---------------------------------------------------

  // WHAT ONE OF THESE COSTS TO BUILD, with the active perks folded in. Every
  // reader of a build price goes through here -- the build bar's label, its
  // affordability check, the placement itself, the armoury card, the index card
  // and MetaProgress.loadoutProblem -- so a perk that makes a tower dearer
  // cannot be paid for at one price and shown at another.
  //
  // Floored at 1: a trade that reads "cheaper" must never reach free, and a
  // free tower would break the opening-stake invariant from the other side.
  function priceOf(Type) {
    if (!Type || typeof Type.COST !== "number") return 0;
    var base = Type.COST;
    var list = activeNodes(Type.ID);
    var mul = 1, add = 0;
    list.forEach(function (node) {
      var price = node.effects && node.effects.price;
      if (!price) return;
      if (typeof price.mul === "number") mul *= price.mul;
      if (typeof price.add === "number") add += price.add;
    });
    if (mul === 1 && add === 0) return base;
    return Math.max(1, Math.round(base * mul + add));
  }

  // --- reaching a tower ------------------------------------------------------

  // Called once per tower, as it joins the board. Summons and any type not in
  // the meta catalogue are skipped: a Summoner's blubs are in `towers` and are
  // NOT a tower type -- they have no id, no tree, no level and no xp, and what
  // their owner's perks did to them was done to their owner.
  function applyTo(tower) {
    if (!tower || !tower.constructor) return;
    var towerId = tower.constructor.ID;
    if (!towerId || !MetaProgress.entry(towerId)) return;

    tower.perkIds = activeIds(towerId);

    // The price, and the record of it. `cost` is what the panel shows and
    // `totalSpent` is what a sale refunds half of; both were set from the raw
    // COST by the constructor a moment ago.
    var price = priceOf(tower.constructor);
    var delta = price - tower.constructor.COST;
    if (delta !== 0) {
      if (typeof tower.cost === "number") tower.cost = price;
      if (typeof tower.totalSpent === "number") tower.totalSpent += delta;
    }

    wrapRestat(tower);
    wrapUpgradeCost(tower, towerId);
    applyEffects(tower);
  }

  // Wrap THIS INSTANCE's recompute so the perks run after it, every time. On
  // the instance rather than the prototype: two Riflemen may be on the board
  // under different profiles in a test, and a prototype wrap would also stack
  // itself once per tower built.
  function wrapRestat(tower) {
    // THE RECOMPUTE HAS THREE NAMES, one per tower shape, and the ADAPTERS ARE
    // THE ONE THAT IS EASY TO MISS: `refreshDerived` is what the Arcane Sniper
    // and the Siphon call after every tier, and their `_refreshStats` lives on
    // `core`, one object further in. Wrapping the wrong one would leave those
    // two towers silently unperked.
    var name = (typeof tower.recalcStats === "function") ? "recalcStats"
      : (typeof tower.refreshDerived === "function") ? "refreshDerived"
      : (typeof tower._refreshStats === "function") ? "_refreshStats" : null;
    if (!name) return;
    if (Object.prototype.hasOwnProperty.call(tower, name)) return;   // already wrapped

    var inner = tower[name];
    tower[name] = function () {
      inner.apply(this, arguments);
      applyEffects(this);
    };
  }

  // THE IN-RUN PRICE OF A TIER, wrapped on the instance so every reader of one
  // gets the perked number: `buyUpgrade` in js/game.js, the panel button, the
  // hover card and the `totalSpent` a sale refunds half of. Floored at zero --
  // a discount deep enough to pay the player for upgrading is not a discount.
  function wrapUpgradeCost(tower, towerId) {
    if (typeof tower.upgradeCost !== "function") return;
    if (Object.prototype.hasOwnProperty.call(tower, "upgradeCost")) return;

    var inner = tower.upgradeCost;
    tower.upgradeCost = function (id) {
      var base = inner.call(this, id);
      if (typeof base !== "number") return base;
      return Math.max(0, base + tierCostDelta(towerId, id));
    };
  }

  return {
    register: register,
    treeOf: treeOf,
    nodes: nodes,
    nodeOf: nodeOf,
    towersWithTrees: towersWithTrees,
    stateOf: stateOf,
    buy: buy,
    refundValue: refundValue,
    resetTree: resetTree,
    inventory: inventory,
    loadout: loadout,
    lockForRun: lockForRun,
    releaseRun: releaseRun,
    isLocked: isLocked,
    activeIds: activeIds,
    activeNodes: activeNodes,
    priceOf: priceOf,
    tierCostDelta: tierCostDelta,
    applyTo: applyTo,
    statTarget: statTarget
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = TowerPerks;
}
