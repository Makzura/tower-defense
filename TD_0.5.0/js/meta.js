// ---------------------------------------------------------------------------
// MetaProgress -- the only thing in this game that outlives a run.
//
// Three pieces, all owned here so there is exactly one place that knows what
// persists:
//
//   coins     meta currency, earned from how far a run got
//   owned     which tower types the player has bought
//   equipped  which of them are in the build bar, by slot
//
// EVERYTHING ELSE IS STILL RUN STATE. Cash, base HP, towers on the board,
// wave progress -- restartGame() wipes all of it, exactly as before. If you
// are tempted to keep something else across runs, it belongs in this file or
// nowhere.
//
// "Save/load" was on AGENTS.md's deliberately-out-of-scope list. It came off
// on 2026-07-29 for one reason: the owner asked for coins "kept in between
// run", and a meta currency that resets on refresh is not a meta currency.
// This is the narrowest possible save system -- three fields, no run state,
// no versioned migration beyond a storage key -- and it should stay that way.
//
// STORAGE. localStorage, which does work from file:// in Chrome and Safari.
// It is wrapped in try/catch and falls back to an in-memory copy, because:
//   - Safari's private mode throws on write rather than returning null;
//   - the Node test harness has no localStorage at all;
//   - a corrupt or hand-edited value must not take the game down on boot.
// A fallback profile behaves identically for the length of a session and is
// simply forgotten afterwards, which is the right failure: playable, honest,
// and never a crash on the title screen.
// ---------------------------------------------------------------------------

var MetaProgress = (function () {

  var STORAGE_KEY = "towerDefense.meta.v1";

  // --- PERMANENT TOWER PROGRESSION (2026-08-30) ------------------------------
  //
  // A SECOND FIVE, AND IT IS NOT THE BUILD BAR'S FIVE. `SLOT_COUNT` below is
  // how many TOWER TYPES fit in the build bar. `PERK_SLOTS` is how many
  // permanent upgrades fit in ONE TYPE's loadout. They are both five today and
  // they answer different questions; nothing may read one for the other. See
  // the header of js/systems/tower-perks.js.
  var PERK_SLOTS = 5;

  // CUMULATIVE XP to REACH each level, 1 through 5. Level is DERIVED from xp
  // and never stored, which is what makes "xp never lowers a level" and "level
  // and xp cannot drift apart" structural rather than something to remember.
  //
  // The owner's targets, against a full campaign paying about 500 XP split
  // between the types that were actually built: roughly 2, 5, 10, 20 and 35
  // focused runs. See TowerXP.waveBudget for the other half of that arithmetic.
  var XP_THRESHOLDS = [1000, 2500, 5000, 10000, 17500];

  // What resetting one tower's tree costs on top of what it hands back, and how
  // long before that tower may be reset again. BALANCE VALUES, deliberately
  // gentle: the point is to stop a player rebuilding a whole tree between two
  // runs, not to charge them for a mistake. A clear pays 80 coins and a node
  // costs 8 to 30, so five is small change; ten minutes is longer than the gap
  // between two runs and shorter than an evening.
  //
  // The COOLDOWN IS WALL CLOCK and this file never reads a clock: `resetTree`
  // is handed the time and `resetReadyAt` hands one back, so the screens and
  // the tests decide what "now" is. A saved stamp in the future -- a profile
  // moved between machines -- is clamped by sanitise rather than trusted.
  var TREE_RESET_FEE = 5;
  var TREE_RESET_COOLDOWN_MS = 10 * 60 * 1000;

  // How many build-bar slots a loadout has. MUST match BUILD_SLOTS.length in
  // game.js -- the bar's geometry is built from the array, and the inventory
  // screen edits the same shape. A test pins the two together.
  var SLOT_COUNT = 5;

  // The catalogue. `id` is what gets written to storage, so these strings are
  // a persistence format: renaming one silently un-owns that tower for every
  // existing player. The CONSTRUCTOR is looked up by name at call time
  // (`constructorOf`) rather than referenced here, because this file loads
  // before some of the tower files and a direct reference would be undefined.
  //
  // Prices are in coins, and are tuned against the award formula below: a
  // first run that dies around wave 17 pays ~32, so the Longshot is two runs
  // away and the Siphon is a project. See AGENTS.md's progression note.
  // **THE GUNNER IS GONE FROM THIS LIST** (2026-07-30, at the owner's
  // instruction: "delete the gunner"). It had been marked as a placeholder
  // awaiting deletion since the reskin, and the Rifleman below is the
  // starter unit it was always meant to hand over to.
  //
  // Removing the row is the whole deletion as far as the GAME is concerned:
  // BUILD_SLOTS, the starting kit, the armoury, the index and the sandbox
  // roster are all derived from this array, so none of them mention it any
  // more. `js/tower.js` is still loaded, and deliberately -- see the banner at
  // the top of that file for the three things that still read it and why moving
  // them would be churn rather than progress.
  //
  // An existing save that has "gunner" in `owned` or `equipped` drops it
  // silently: `sanitise` keeps only ids it can find in this catalogue, which is
  // exactly the behaviour that makes removing a tower safe.
  var CATALOGUE = [
    // NO LONGER IN THE OPENING HAND (2026-08-26). A fresh profile owns the
    // Rifleman and nothing else; this is the first thing a player buys, and it
    // is priced so that the wave-11 milestone pays for it outright -- reaching
    // the Midboss for the first time banks exactly 10 coins, so the run that
    // shows you the wall also hands you the answer to it. Losing to the
    // Midboss still counts: the gate is the wave REACHED, not the kill.
    {
      id: "smasher",
      global: "Smasher",
      price: 10,
      starter: false,
      requiresWave: 11,
      blurb: "Melee wedge, 12 damage a swing. Cuts through 5 flat armor."
    },
    {
      id: "longshot",
      global: "LongshotTower",
      price: 40,
      starter: false,
      blurb: "250 u.l. sniper, pierces. Its A1 is the game's cheap camo detection — " +
             "without it the camo waves cannot be touched."
    },
    {
      id: "siphon",
      global: "BeamTower",
      price: 150,
      starter: false,
      blurb: "Continuous beam, ten drains a second, and an economy of its own."
    },
    {
      id: "soldier",
      global: "Soldier",
      price: 0,
      starter: true,
      blurb: "300-mana Rifleman, three shots a burst. Its B path becomes " +
             "automatic and calls in stop-to-shoot recruits."
    },
    // A COIN PURCHASE, NOT A STARTER, and that was a decision rather than an
    // omission. `starter: true` would put a tower that produces free damage
    // forever into the opening kit, and the premise the whole meta loop rests
    // on -- a fresh profile CANNOT win, which
    // THE_COMPANY/tools/balance/measure-starter-kit.js exists to keep
    // checking (that tool lives outside this repository, so it is not
    // reachable from a clone of it) -- is measured against the kit as it
    // stands. If the owner wants this in the opening hand it is one field,
    // plus a re-run of that tool.
    //
    // Priced between the Arcane Sniper (40) and the Siphon (150): it is more
    // than a first unlock and less than the run-defining one.
    {
      id: "blub",
      global: "BlubTower",
      price: 90,
      starter: false,
      blurb: "450-mana Summoner. It never fires — it plants blubs, whose hit points " +
             "ARE their ammunition, and they shoot for it."
    },
    // THE SIXTH TYPE, AND NOT A SIXTH SLOT (2026-08-27). The bar is five and
    // stays five -- that is a decision about its geometry, its number keys and
    // MetaProgress.SLOT_COUNT, and nobody has made it. What the armoury already
    // buys is exactly this case: the loadout picks which five of the owned
    // types are equipped, so a sixth type needs a catalogue row and nothing
    // else. The Summoner is the worked example one type earlier.
    //
    // Priced between the Summoner (90) and the Siphon (150). It buys an economy
    // rather than damage, so it is worth more than a body and less than the
    // run-defining one, and it is deliberately not a first unlock: a fresh
    // profile that could buy mana production would be a fresh profile that can
    // win, which is the premise the whole meta loop rests on.
    {
      id: "farm",
      global: "FarmTower",
      price: 120,
      starter: false,
      blurb: "1200-mana Farm. It never fires — it produces mana, grows your " +
             "base, or links every farm on the board into one dice network."
    }
  ];

  // The live profile. Replaced wholesale by load()/reset(), never mutated
  // from outside this module -- everything below goes through a function so
  // that saving cannot be forgotten at a call site.
  var state = null;

  // --- storage -------------------------------------------------------------

  function storage() {
    try {
      if (typeof localStorage === "undefined" || !localStorage) return null;
      return localStorage;
    } catch (err) {
      return null;              // some browsers throw on the ACCESS itself
    }
  }

  function starterProfile() {
    var owned = CATALOGUE.filter(function (t) { return t.starter; })
      .map(function (t) { return t.id; });
    return {
      coins: 0,
      owned: owned,
      equipped: defaultLoadout(owned),
      runs: 0,
      // THE THREE FIELDS THE 2026-08-26 REWARD REWRITE ADDED.
      //
      // `bestWave` is the high-water mark across every run on the profile, and
      // it is what gates the Warbringer -- not the wave of the run that just
      // ended, or a player would lose the unlock by dying early afterwards.
      //
      // `milestones` and `routesWon` are CLAIMED LEDGERS, not counters: an
      // objective pays once for the life of the save, so what has to persist
      // is which ones have been paid, and the only safe way to write that is
      // the list itself. A count would re-pay the moment the ladder changed.
      bestWave: 0,
      milestones: [],
      routesWon: [],
      // THE SEVENTH FIELD (2026-08-30): per-tower permanent progression, keyed
      // by catalogue id. Absent for a tower that has never been played, which
      // is the same thing as level 0 with nothing bought -- see progressOf,
      // which materialises that default rather than storing a row per tower.
      progress: {}
    };
  }

  // Owned towers land in catalogue order, one per slot, remaining slots empty.
  //
  // Catalogue order was the historical BUILD_SLOTS order (gunner, smasher,
  // Longshot, Siphon, and the Soldier appended in v0.4.7) because the number
  // keys are muscle memory. **Deleting the gunner on 2026-07-30 shifted every
  // one of those keys down by one**, and that is unavoidable rather than an
  // oversight: the alternative was a permanently empty first slot, which is a
  // dead key AND a dead patch of build bar kept purely out of nostalgia for a
  // tower that no longer exists. The Warbringer is slot 1 now.
  //
  // On a FRESH profile the Soldier lands in the second slot, because it is a
  // starter and this function compacts rather than leaving holes.
  function defaultLoadout(owned) {
    var slots = [];
    CATALOGUE.forEach(function (entry) {
      if (owned.indexOf(entry.id) !== -1 && slots.length < SLOT_COUNT) {
        slots.push(entry.id);
      }
    });
    while (slots.length < SLOT_COUNT) slots.push(null);
    return slots;
  }

  // Anything read back off disk is treated as hostile: a hand-edited file, a
  // profile written by an older version, or plain corruption. Every field is
  // rebuilt from what is recognisable and the rest is dropped, so a bad save
  // costs the player their progress at worst and never a broken boot.
  function sanitise(raw) {
    var fresh = starterProfile();
    if (!raw || typeof raw !== "object") return fresh;

    var known = CATALOGUE.map(function (t) { return t.id; });

    var owned = [];
    if (raw.owned && raw.owned.length) {
      raw.owned.forEach(function (id) {
        if (known.indexOf(id) !== -1 && owned.indexOf(id) === -1) owned.push(id);
      });
    }
    // Starter towers are never lost, whatever the file says.
    fresh.owned.forEach(function (id) {
      if (owned.indexOf(id) === -1) owned.push(id);
    });

    var equipped = [];
    for (var i = 0; i < SLOT_COUNT; i++) {
      var id = raw.equipped && raw.equipped[i];
      // An equipped tower that is not owned is dropped rather than honoured;
      // that is the shape a tampered file takes.
      equipped.push((owned.indexOf(id) !== -1 && equipped.indexOf(id) === -1) ? id : null);
    }

    // A SAVED BAR IS HONOURED EVEN WHEN IT COULD NOT START A RUN, and that is
    // the 2026-08-30 change rather than a hole left in the guard. This used to
    // throw such a bar away for the default one, which was safe only while
    // unequip() refused to create one. Now that the player may empty the bar
    // deliberately, the repair would quietly put the Rifleman back on the next
    // page load and the armoury would read as broken. An unplayable bar is
    // stopped at the door to a run instead -- see loadoutProblem(), and
    // openMapSelect() in js/game.js, which is the door.

    return {
      coins: wholeAtLeastZero(raw.coins),
      owned: owned,
      equipped: equipped,
      runs: wholeAtLeastZero(raw.runs),
      // MISSING IS NOT CORRUPT. A profile written before 2026-08-26 has none
      // of these three, and the safe default for all of them is "nothing
      // claimed yet" -- which costs an old save nothing it had and hands it
      // every milestone still ahead of it. It does NOT retroactively pay for
      // waves already reached: those runs are over and were paid under the
      // rules of their day.
      bestWave: wholeAtLeastZero(raw.bestWave),
      milestones: knownIdList(raw.milestones, MILESTONE_IDS),
      // Route ids are OPEN: a map can be added, and a save naming one this
      // build does not have must load rather than throw. Unknown ids are kept
      // out of the ledger but never crash it -- see the note on Maps ids.
      routesWon: cleanStringList(raw.routesWon),
      // AN OLD SAVE HAS NO `progress` AND THAT IS NOT CORRUPTION. It gets an
      // empty map, which progressOf reads as "level 0, nothing bought, nothing
      // equipped" for every tower it owns -- so a profile written before
      // 2026-08-30 keeps its coins, its towers and its build bar exactly, and
      // starts this system at the beginning like a fresh one.
      progress: cleanProgress(raw.progress, owned)
    };
  }

  // One tower's saved progression, rebuilt from what is recognisable.
  //
  // NODE IDS ARE OPEN, like route ids and for the same reason: this file
  // cannot enumerate the trees without depending on them, and a build that has
  // dropped a node must load rather than throw. An id this build does not know
  // is kept in the save and never reported -- js/systems/tower-perks.js only
  // ever answers with nodes it can find, so an unknown id is inert here and
  // still there if the node comes back.
  //
  // The three invariants that ARE enforced, because they are about storage
  // rather than about content: xp is a non-negative number, an equipped node
  // must be owned, and no slot past the level the xp buys may hold anything.
  // That last one is what makes a hand-edited file unable to run five perks on
  // a level-1 tower.
  function cleanProgress(raw, owned) {
    var out = {};
    if (!raw || typeof raw !== "object") return out;

    owned.forEach(function (towerId) {
      var row = raw[towerId];
      if (!row || typeof row !== "object") return;

      var xp = (typeof row.xp === "number" && isFinite(row.xp) && row.xp > 0) ? row.xp : 0;
      var nodes = cleanStringList(row.nodes);
      var level = levelForXp(xp);

      var equipped = [];
      for (var i = 0; i < PERK_SLOTS; i++) {
        var nodeId = row.equipped && row.equipped[i];
        var legal = i < level &&
          typeof nodeId === "string" &&
          nodes.indexOf(nodeId) !== -1 &&
          equipped.indexOf(nodeId) === -1;
        equipped.push(legal ? nodeId : null);
      }

      // A STAMP IN THE FUTURE IS NOT TRUSTED. A profile carried between two
      // machines whose clocks disagree would otherwise lock its own reset for
      // as long as the two are apart. Zero means "never reset", which is what
      // a fresh row says too.
      var resetAt = (typeof row.resetAt === "number" && isFinite(row.resetAt) &&
                     row.resetAt > 0) ? Math.floor(row.resetAt) : 0;

      out[towerId] = { xp: xp, nodes: nodes, equipped: equipped, resetAt: resetAt };
    });

    return out;
  }

  // Every number off disk goes through here: negatives, NaN, Infinity, strings
  // and undefined all become 0, and a fractional value is floored rather than
  // rejected. Written once because there are five of them now.
  function wholeAtLeastZero(v) {
    return (typeof v === "number" && isFinite(v) && v >= 0) ? Math.floor(v) : 0;
  }

  // A list of ids, deduplicated, with anything not in `allowed` dropped.
  function knownIdList(raw, allowed) {
    var out = [];
    if (!raw || !raw.length) return out;
    for (var i = 0; i < raw.length; i++) {
      var id = raw[i];
      if (typeof id !== "string") continue;
      if (allowed.indexOf(id) === -1) continue;
      if (out.indexOf(id) === -1) out.push(id);
    }
    return out;
  }

  // The same, with no allow-list: used for route ids, which this file cannot
  // enumerate without depending on Maps.
  function cleanStringList(raw) {
    var out = [];
    if (!raw || !raw.length) return out;
    for (var i = 0; i < raw.length; i++) {
      var id = raw[i];
      if (typeof id === "string" && id && out.indexOf(id) === -1) out.push(id);
    }
    return out;
  }

  function load() {
    var store = storage();
    if (!store) { state = starterProfile(); return state; }
    try {
      state = sanitise(JSON.parse(store.getItem(STORAGE_KEY)));
    } catch (err) {
      state = starterProfile();
    }
    return state;
  }

  function save() {
    var store = storage();
    if (!store) return false;
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      return false;             // quota, private mode -- play on, forget later
    }
  }

  function ensure() {
    if (!state) load();
    return state;
  }

  // --- the catalogue -------------------------------------------------------

  function catalogue() { return CATALOGUE.slice(); }

  function entry(id) {
    for (var i = 0; i < CATALOGUE.length; i++) {
      if (CATALOGUE[i].id === id) return CATALOGUE[i];
    }
    return null;
  }

  // id -> tower constructor, resolved from the global scope at CALL time.
  // This file loads before longshot-adapter.js and beam-adapter.js (it has to
  // load before game.js, which reads the loadout to build BUILD_SLOTS), so a
  // direct reference in CATALOGUE would capture `undefined`.
  //
  // `globalThis` is asked FIRST, and that is not a style preference. What this
  // wants is the scope a top-level `function Tower() {}` actually landed in.
  // In a browser that is `window`, so the two agree; in the Node test harness
  // they do NOT -- tests/harness.js hands the vm a stub `window` object that
  // is not the context's global, so reading `window.Tower` found undefined and
  // every slot in the build bar came back empty. That took 118 tests down with
  // it while the browser played fine, which is exactly the kind of divergence
  // the harness exists to prevent.
  function constructorOf(id) {
    var found = entry(id);
    if (!found) return null;
    var scope = (typeof globalThis !== "undefined") ? globalThis
      : (typeof window !== "undefined") ? window
      : (typeof global !== "undefined") ? global : null;
    var ctor = scope ? scope[found.global] : null;
    return (typeof ctor === "function") ? ctor : null;
  }

  // --- coins ---------------------------------------------------------------

  function coins() { return ensure().coins; }

  // --- what a run pays -----------------------------------------------------
  //
  // REWRITTEN 2026-08-26. The old rule was two coins per wave cleared plus
  // sixty for a win, which paid a smooth trickle for grinding the opening and
  // made a clear worth about the same as two ordinary losses. The new one is a
  // LADDER on waves actually FINISHED, so the reward is for getting further
  // rather than for playing longer, and a full clear is worth exactly twice
  // what dying on the last wave is.
  //
  // WAVE COUNTING, ONCE, HERE, because this is where the off-by-one lives.
  // `waveIndex` is a 0-BASED cursor; `reachedWave()` is 1-BASED. A wave that
  // is in play has NOT been completed. So the count of finished waves is the
  // cursor itself in both states -- mid-wave the cursor still points at the
  // unfinished one, and between waves it has already stepped past the one that
  // ended. game.js passes it rather than deriving it a second time here.
  //
  // EVERY NUMBER BELOW IS AUTHORED AGAINST THE REFERENCE CAMPAIGN, which is
  // Easy: 35 waves, and a ladder that gates on ten of them at a time. A second
  // campaign of a different length and weight arrived on 2026-08-28 and was
  // paid by this table unchanged -- the same 80 coins for clearing forty waves
  // at 2.6x the required DPS, and a "reach wave 30" that means 86% of Easy and
  // 75% of Normal. See `scaledTiers` and `scaledMilestones`, which is where the
  // table stops being Easy's and starts being the campaign's.
  var REPEATABLE_TIERS = [
    { atLeast: 30, coins: 40 },
    { atLeast: 25, coins: 28 },
    { atLeast: 20, coins: 18 },
    { atLeast: 15, coins: 10 },
    { atLeast: 10, coins: 5 }
  ];
  var VICTORY_COINS = 80;

  // --- scaling a table to the campaign it is being paid for ----------------
  //
  // 2026-08-29, at the owner's instruction: "scale the normal game mode meta
  // rewards on the easy mode meta rewards", and then "scale according to
  // difficulty... a difficulty function that takes into account map, bodies,
  // hp, wave count, money".
  //
  // TWO SCALES, NOT ONE, because a coin and a wave number are different
  // quantities and nothing sensible comes of moving them together:
  //
  //   the COINS scale by `Difficulty` (js/systems/difficulty.js), which is the
  //   whole ask-over-give measurement -- demand, spike, length, fragility,
  //   roster, relief and the board. Normal on the default map rates 1.43.
  //
  //   the THRESHOLDS scale by WAVE COUNT alone, so a rung sits at the same
  //   FRACTION of its own campaign. "Two thirds of the way in" has to mean the
  //   same thing on a 35-wave campaign and a 40-wave one, and it is the only
  //   reading under which the top rung is the last one before the finale on
  //   both.
  //
  // Both fall back to 1 when nothing can be measured -- an unknown id, a page
  // that never loaded the schedules, a test booting meta.js alone -- so the
  // reference campaign's own numbers are what a caller gets when the world
  // cannot answer. Read at CALL time for the load-order reason
  // `constructorOf` gives above.
  function difficultyList() {
    var s = (typeof globalThis !== "undefined") ? globalThis
      : (typeof window !== "undefined") ? window : null;
    var list = s && s.DIFFICULTIES;
    return (list && list.length) ? list : null;
  }

  function referenceId() {
    return (typeof Difficulty !== "undefined")
      ? Difficulty.REFERENCE_DIFFICULTY_ID : "easy";
  }

  // How long a campaign is, in waves, or null when it cannot be known.
  function waveCountOf(difficultyId) {
    var list = difficultyList();
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === difficultyId) return list[i].waves.length;
    }
    return null;
  }

  function waveScale(difficultyId) {
    if (!difficultyId || difficultyId === referenceId()) return 1;
    var mine = waveCountOf(difficultyId);
    var theirs = waveCountOf(referenceId());
    return (mine > 0 && theirs > 0) ? mine / theirs : 1;
  }

  function coinScale(difficultyId, mapId) {
    if (typeof Difficulty === "undefined") return 1;
    if (!difficultyId) return 1;
    var scale = Difficulty.scaleFor(difficultyId, mapId);
    return (scale > 0 && isFinite(scale)) ? scale : 1;
  }

  // A COIN AMOUNT IS AT LEAST ONE. Rounding a small reward down to nothing on
  // an easier board would be a source that pays zero, and a source that pays
  // zero is a line on the result screen saying the player earned nothing for
  // something they did.
  function scaleCoins(amount, scale) {
    return Math.max(1, Math.round(amount * scale));
  }

  function scaledTiers(difficultyId, mapId) {
    var waves = waveScale(difficultyId);
    var coins = coinScale(difficultyId, mapId);
    return REPEATABLE_TIERS.map(function (tier) {
      return {
        atLeast: Math.max(1, Math.round(tier.atLeast * waves)),
        coins: scaleCoins(tier.coins, coins)
      };
    });
  }

  function scaledVictoryCoins(difficultyId, mapId) {
    return scaleCoins(VICTORY_COINS, coinScale(difficultyId, mapId));
  }

  // A CLEAR REPLACES THE TIER, it does not stack on it. 34 waves finished and
  // a loss pays 40; 35 and a win pays 80, which is the doubling the ladder is
  // built around -- not 120. The doubling survives scaling, because both sides
  // of it are multiplied by the same number.
  //
  // `difficultyId` and `mapId` are OPTIONAL and default to the reference
  // campaign, so every caller written before 2026-08-29 -- and every test --
  // asks the same question and gets the same answer it always did.
  function repeatableCoins(wavesCompleted, victory, difficultyId, mapId) {
    if (victory) return scaledVictoryCoins(difficultyId, mapId);
    var done = (typeof wavesCompleted === "number" && isFinite(wavesCompleted))
      ? Math.max(0, Math.floor(wavesCompleted)) : 0;
    var tiers = scaledTiers(difficultyId, mapId);
    for (var i = 0; i < tiers.length; i++) {
      if (done >= tiers[i].atLeast) return tiers[i].coins;
    }
    return 0;
  }

  // --- one-time objectives -------------------------------------------------
  //
  // The first implementation of the quest system. Each pays ONCE for the life
  // of the save, which is why the profile stores the claimed ids rather than a
  // count: the ladder can grow, and a count would re-pay everything under it.
  //
  // Gated on the wave REACHED, not on the wave completed and not on a kill --
  // meeting the Midboss is the achievement, and losing to it still counts.
  var WAVE_MILESTONES = [
    { id: "reach_11", wave: 11, coins: 10, label: "Reached wave 11" },
    { id: "reach_20", wave: 20, coins: 15, label: "Reached wave 20" },
    { id: "reach_25", wave: 25, coins: 20, label: "Reached wave 25" },
    { id: "reach_30", wave: 30, coins: 25, label: "Reached wave 30" }
  ];

  // ONE SET PER CAMPAIGN, CLAIMABLE SEPARATELY (2026-08-29, the owner's call).
  // Reaching wave 29 of Normal is not the same achievement as reaching wave 25
  // of Easy and does not pay for it -- the waves are a different length, a
  // different weight and a different roster.
  //
  // THE REFERENCE CAMPAIGN KEEPS ITS BARE IDS, and that is a save-compatibility
  // rule rather than a tidiness one: every profile already on disk has claimed
  // `reach_11` and friends, and prefixing them would hand all four out again.
  // Only the campaigns that did not exist when those ids were minted carry a
  // prefix.
  function milestoneIdFor(difficultyId, baseId) {
    return (!difficultyId || difficultyId === referenceId())
      ? baseId : difficultyId + ":" + baseId;
  }

  function scaledMilestones(difficultyId, mapId) {
    var waves = waveScale(difficultyId);
    var coins = coinScale(difficultyId, mapId);
    var isReference = !difficultyId || difficultyId === referenceId();
    var name = null;
    if (!isReference) {
      var list = difficultyList();
      for (var i = 0; list && i < list.length; i++) {
        if (list[i].id === difficultyId) name = list[i].name;
      }
    }
    return WAVE_MILESTONES.map(function (m) {
      var wave = Math.max(1, Math.round(m.wave * waves));
      return {
        id: milestoneIdFor(difficultyId, m.id),
        wave: wave,
        coins: scaleCoins(m.coins, coins),
        // The reference's label is left EXACTLY as it was, so the four lines a
        // player has already seen on the result screen do not change wording.
        label: isReference ? m.label
          : "Reached wave " + wave + (name ? " on " + name : "")
      };
    });
  }

  var MILESTONE_IDS = WAVE_MILESTONES.map(function (m) { return m.id; });

  var FIRST_WIN_COINS = 25;

  // Keyed on the ROUTE ID, never on its display name: a rename must not hand
  // the bonus out twice, and two routes must never collide because their names
  // happen to match.
  function firstWinId(mapId) { return "first_win:" + mapId; }

  // --- banking a finished run ----------------------------------------------
  //
  // Returns a STRUCTURED result rather than a number, because the result
  // screen has to show where the coins came from and must never re-derive
  // them. Every source carries a stable id, a printable label and an amount;
  // `total` is summed FROM the sources, so the screen and the bank cannot
  // disagree. `bounties` is empty and present on purpose -- it is the slot the
  // rotating objectives will land in, and giving it a shape now means the
  // screen does not have to change when they arrive.
  //
  // `run` is { wavesCompleted, waveReached, victory, mapId, difficultyId }.
  function awardRun(run) {
    run = run || {};
    var s = ensure();
    var victory = !!run.victory;
    var completed = Math.max(0, Math.floor(run.wavesCompleted || 0));
    var reached = Math.max(0, Math.floor(run.waveReached || 0));

    // WHICH CAMPAIGN AND WHICH BOARD, because since 2026-08-29 both are priced.
    // An absent id is the reference campaign, which is what every caller
    // written before that date effectively asked for.
    var difficultyId = run.difficultyId || referenceId();
    var scale = coinScale(difficultyId, run.mapId);

    var repeatable = repeatableCoins(completed, victory, difficultyId, run.mapId);
    var objectives = [];

    scaledMilestones(difficultyId, run.mapId).forEach(function (m) {
      if (reached < m.wave) return;
      if (s.milestones.indexOf(m.id) !== -1) return;
      s.milestones.push(m.id);
      objectives.push({ id: m.id, label: m.label, amount: m.coins });
    });

    if (victory && run.mapId) {
      var id = firstWinId(run.mapId);
      if (s.routesWon.indexOf(run.mapId) === -1) {
        s.routesWon.push(run.mapId);
        objectives.push({
          id: id,
          // KEYED ON THE ROUTE ALONE, deliberately: a first clear is a first
          // clear of that road, and clearing it again on a harder campaign is
          // not a second first. The AMOUNT still prices the run that earned it.
          label: "First clear of " + (run.mapName || run.mapId),
          amount: scaleCoins(FIRST_WIN_COINS, scale)
        });
      }
    }

    var bounties = [];
    var total = repeatable;
    objectives.forEach(function (o) { total += o.amount; });
    bounties.forEach(function (b) { total += b.amount; });

    // The high-water mark, which is what the store gates on. It only ever goes
    // up -- a later, shorter run must not take an unlock away.
    if (reached > s.bestWave) s.bestWave = reached;

    s.coins += total;
    s.runs += 1;
    save();

    return {
      repeatable: repeatable,
      objectives: objectives,
      bounties: bounties,
      total: total
    };
  }

  function bestWave() { return ensure().bestWave; }

  // --- owning and equipping ------------------------------------------------

  function owns(id) { return ensure().owned.indexOf(id) !== -1; }

  // Returns { ok, reason }. The refusal reasons are shown verbatim on the
  // store button, which is why they read as sentences rather than codes --
  // same arrangement whyCannotBuild has with the build preview.
  // `opts.dryRun` asks the same question without spending anything, so the
  // store button can print exactly what a press would answer. One rule, two
  // readers -- the alternative is the UI carrying its own copy of the gate and
  // the two drifting apart, which is the failure this whole file is arranged
  // to avoid.
  function buy(id, opts) {
    var dryRun = !!(opts && opts.dryRun);
    var s = ensure();
    var found = entry(id);
    if (!found) return { ok: false, reason: "no such tower" };
    if (owns(id)) return { ok: false, reason: "already owned" };

    // THE GATE IS ENFORCED HERE, not in the store's drawing code. A greyed-out
    // button is a courtesy; this is the rule. A hand-edited save or a direct
    // MetaProgress.buy("smasher") has to hit the same wall the button does,
    // and the reason is returned as a sentence because the store prints it
    // verbatim -- same arrangement whyCannotBuild has with the build preview.
    if (typeof found.requiresWave === "number" && s.bestWave < found.requiresWave) {
      return {
        ok: false,
        locked: true,
        requiresWave: found.requiresWave,
        progress: s.bestWave,
        reason: "reach wave " + found.requiresWave + " to unlock (best: " + s.bestWave + ")"
      };
    }

    if (s.coins < found.price) {
      return { ok: false, reason: "needs " + (found.price - s.coins) + " more coins" };
    }

    if (dryRun) return { ok: true, dryRun: true };

    s.coins -= found.price;
    s.owned.push(id);

    // A purchase goes straight into the first empty slot. Buying a tower and
    // then having to find the inventory screen to use it is a step nobody
    // wants; unequipping is the deliberate action, not equipping.
    var slot = s.equipped.indexOf(null);
    if (slot !== -1) s.equipped[slot] = id;

    save();
    return { ok: true, slot: slot };
  }

  function equipped() { return ensure().equipped.slice(); }

  function isEquipped(id) { return ensure().equipped.indexOf(id) !== -1; }

  // Put an owned tower in the first free slot, or take it out again. One
  // entry point for both directions so the "already in the bar" check cannot
  // be written twice and drift.
  function equip(id) {
    var s = ensure();
    if (!owns(id)) return { ok: false, reason: "not owned" };
    if (isEquipped(id)) return { ok: false, reason: "already equipped" };
    var slot = s.equipped.indexOf(null);
    if (slot === -1) return { ok: false, reason: "no free slot" };
    s.equipped[slot] = id;
    save();
    return { ok: true, slot: slot };
  }

  // The player's opening stake, read from game.js at CALL time (that file
  // loads after this one). A top-level `const` is a global lexical binding but
  // is NOT a window property, so read it directly before trying the property
  // form. The old $15 Rifleman hid this mistake behind the $20 fallback; the
  // v0.4.10 Rifleman's $300 price makes the real $600 stake matter.
  function startingCash() {
    if (typeof STARTING_CASH === "number") return STARTING_CASH;
    var scope = (typeof window !== "undefined") ? window
      : (typeof global !== "undefined") ? global : null;
    var value = scope && scope.STARTING_CASH;
    return (typeof value === "number") ? value : 600;
  }

  // Whether the bar AS IT STANDS could start a run: null when it could, and
  // the sentence to show the player when it could not.
  //
  // TWO ways to make an unplayable loadout, and they are the same failure:
  //
  //   1. an empty bar -- no tower, no damage, no cash, ever;
  //   2. a bar whose cheapest tower costs more than the opening stake, which
  //      is the identical deadlock with an extra step. A bar holding only the
  //      $800 Siphon is a board you can never build on.
  //
  // AGENTS.md states the invariant as "STARTING_CASH must exceed the cost of
  // the cheapest tower". That used to be guaranteed by BUILD_SLOTS being a
  // constant with the gunner in it, and then, once the player could edit the
  // bar, by unequip() REFUSING to make either shape.
  //
  // REFUSING WAS THE WRONG PLACE (2026-08-30). Both branches fired on the one
  // tower every profile starts with: a bar holding the Rifleman alone was the
  // empty-bar case, and a bar holding it beside anything dearer than the $600
  // stake -- the Siphon at 800, the Arcane Sniper at 900, the Farm at 1200 --
  // was the stranding case. Between them there was no bar you could take the
  // Rifleman out of, so the starter tower was permanently welded into the
  // build bar and the armoury said no to every route.
  //
  // So the invariant moved to THE DOOR TO A RUN. Edit the bar into any shape
  // you like; openMapSelect() is what will not carry an unplayable one onto a
  // board, and the title screen prints this sentence under the PLAY plate.
  // Same guarantee, one gate instead of two refusals, and the armoury is
  // allowed to be an armoury.
  function loadoutProblem() {
    var s = ensure();
    var cheapest = Infinity;
    s.equipped.forEach(function (id) {
      if (id === null) return;
      var ctor = constructorOf(id);
      if (!ctor || typeof ctor.COST !== "number") return;
      // THE PERKED PRICE, not the type's own. A permanent upgrade may make a
      // tower dearer or cheaper to place, so the question "could this bar
      // afford a first tower" has to be asked at the price the till will
      // actually charge -- see TowerPerks.priceOf, which every other reader of
      // a build price goes through too.
      cheapest = Math.min(cheapest, (typeof TowerPerks !== "undefined")
        ? TowerPerks.priceOf(ctor) : ctor.COST);
    });
    if (cheapest === Infinity) return "your build bar is empty";
    if (cheapest > startingCash()) {
      return "nothing in your bar costs less than the $" + startingCash() +
             " opening stake";
    }
    return null;
  }

  // Takes the tower out, whatever that leaves behind -- including nothing.
  // See loadoutProblem() for why this no longer has an opinion about the bar
  // it leaves, and where that opinion went.
  function unequip(id) {
    var s = ensure();
    var slot = s.equipped.indexOf(id);
    if (slot === -1) return { ok: false, reason: "not equipped" };
    s.equipped[slot] = null;
    save();
    return { ok: true, slot: slot };
  }

  // The build bar, as CONSTRUCTORS. This is what game.js's BUILD_SLOTS is
  // built from; a slot whose tower has not loaded resolves to null rather
  // than throwing, so a half-loaded page still shows a bar.
  function slotConstructors() {
    return ensure().equipped.map(function (id) {
      return id === null ? null : constructorOf(id);
    });
  }

  // --- permanent tower progression -----------------------------------------
  //
  // THE STORAGE HALF. What a node COSTS, what it REQUIRES and what it DOES are
  // tree content and live in js/systems/tower-perks.js with the trees; this
  // file owns the save format and the invariants that are about the save
  // rather than about the content:
  //
  //   * level is derived from xp, so the two cannot drift;
  //   * xp only ever goes up;
  //   * a node cannot be owned twice;
  //   * a node must be owned before it can be equipped;
  //   * a node cannot sit in two slots at once;
  //   * no slot past the level may hold anything;
  //   * a node belongs to ONE tower's row and is never visible from another's.
  //
  // `buyNode` is handed a price rather than looking one up, because looking one
  // up would mean this file knowing the trees. TowerPerks.buy is its only
  // caller and checks the tree rules first -- the same division store.js has
  // with the build bar, written down here so nobody adds a second caller.

  function levelForXp(xp) {
    var level = 0;
    for (var i = 0; i < XP_THRESHOLDS.length; i++) {
      if (xp >= XP_THRESHOLDS[i]) level = i + 1;
    }
    return level;
  }

  // Cumulative xp to REACH `level`. Level 0 is free; a level past the top has
  // no threshold and answers null, which is what the screens print as MAX
  // rather than inventing a sixth bar to fill.
  function xpForLevel(level) {
    if (level <= 0) return 0;
    if (level > XP_THRESHOLDS.length) return null;
    return XP_THRESHOLDS[level - 1];
  }

  // The live row, created on first use. A tower with no row has never earned a
  // point and owns nothing, which is exactly what an empty row says -- so the
  // save carries a row only for towers that have actually done something.
  function progressRow(towerId) {
    var s = ensure();
    if (!s.progress) s.progress = {};
    if (!s.progress[towerId]) {
      s.progress[towerId] = { xp: 0, nodes: [], equipped: emptyPerkSlots(), resetAt: 0 };
    }
    var row = s.progress[towerId];
    // A row read back from a save is already the right shape; one written by an
    // older build of THIS system might not be, and repairing here costs
    // nothing and removes a class of undefined.
    if (!row.nodes) row.nodes = [];
    if (!row.equipped || row.equipped.length !== PERK_SLOTS) {
      row.equipped = emptyPerkSlots();
    }
    return row;
  }

  function emptyPerkSlots() {
    var out = [];
    for (var i = 0; i < PERK_SLOTS; i++) out.push(null);
    return out;
  }

  // EVERYTHING A SCREEN NEEDS ABOUT ONE TOWER, in one read-only object, with
  // the arithmetic done here rather than in each of the three places that show
  // it. `xpInto` / `xpSpan` are the progress bar; at the top both are null and
  // `atMax` is what the screen prints instead of a bar that can never fill.
  function progressOf(towerId) {
    var row = progressRow(towerId);
    var level = levelForXp(row.xp);
    var floor = xpForLevel(level) || 0;
    var next = xpForLevel(level + 1);
    return {
      id: towerId,
      xp: row.xp,
      level: level,
      slots: level,
      atMax: next === null,
      nextLevelXp: next,
      xpInto: next === null ? null : row.xp - floor,
      xpSpan: next === null ? null : next - floor,
      nodes: row.nodes.slice(),
      equipped: row.equipped.slice(),
      resetAt: row.resetAt
    };
  }

  // XP IS ONLY EVER ADDED, and a negative or nonsense amount is a no-op rather
  // than an error: the caller is a wave settling, and a wave that computed
  // nothing must not be able to take a level away.
  //
  // Returns what changed, so the end-of-run screen can say "the Rifleman
  // reached level 2" without asking twice and subtracting.
  function addXp(towerId, amount) {
    if (!owns(towerId)) return { ok: false, reason: "not owned" };
    if (typeof amount !== "number" || !isFinite(amount) || amount <= 0) {
      var flat = progressOf(towerId);
      return { ok: true, gained: 0, xp: flat.xp, level: flat.level, levelsGained: 0 };
    }
    var row = progressRow(towerId);
    var before = levelForXp(row.xp);
    row.xp += amount;
    var after = levelForXp(row.xp);
    save();
    return {
      ok: true, gained: amount, xp: row.xp,
      level: after, levelsGained: after - before
    };
  }

  function ownsNode(towerId, nodeId) {
    return progressRow(towerId).nodes.indexOf(nodeId) !== -1;
  }

  function ownedNodes(towerId) {
    return progressRow(towerId).nodes.slice();
  }

  // Spend `price` coins and mark the node bought. The price is the caller's --
  // see the note above -- but the SPEND is not: coins are checked and deducted
  // exactly once here, so a double click cannot pay twice (the second call
  // finds the node already owned and refuses before touching the purse).
  function buyNode(towerId, nodeId, price) {
    var s = ensure();
    if (!owns(towerId)) return { ok: false, reason: "you do not own that tower" };
    if (ownsNode(towerId, nodeId)) return { ok: false, reason: "already bought" };
    var cost = (typeof price === "number" && isFinite(price) && price > 0)
      ? Math.floor(price) : 0;
    if (s.coins < cost) return { ok: false, reason: "not enough meta coins" };

    s.coins -= cost;
    progressRow(towerId).nodes.push(nodeId);
    save();
    return { ok: true, spent: cost };
  }

  // Put an owned node in a slot. Refuses, in this order and with the reason the
  // screen prints: a slot outside the bar, a slot the level has not opened, a
  // node this tower does not own, and a node already in another slot.
  function equipPerk(towerId, nodeId, slot) {
    if (typeof slot !== "number" || slot < 0 || slot >= PERK_SLOTS) {
      return { ok: false, reason: "no such slot" };
    }
    var row = progressRow(towerId);
    var level = levelForXp(row.xp);
    if (slot >= level) {
      return { ok: false, reason: level === 0
        ? "this tower is level 0 — it has no slots yet"
        : "slot " + (slot + 1) + " opens at level " + (slot + 1) };
    }
    if (row.nodes.indexOf(nodeId) === -1) {
      return { ok: false, reason: "you have not bought that upgrade" };
    }
    var already = row.equipped.indexOf(nodeId);
    if (already !== -1 && already !== slot) {
      // MOVED, NOT DUPLICATED. Dragging an equipped perk onto a second slot is
      // an obvious gesture and the only sane reading of it is "move it there";
      // refusing would leave a copy behind in the eye of the player who just
      // dragged it away.
      row.equipped[already] = null;
    }
    row.equipped[slot] = nodeId;
    save();
    return { ok: true, slot: slot, replaced: already === -1 ? null : already };
  }

  function unequipPerk(towerId, slot) {
    if (typeof slot !== "number" || slot < 0 || slot >= PERK_SLOTS) {
      return { ok: false, reason: "no such slot" };
    }
    var row = progressRow(towerId);
    if (row.equipped[slot] === null) return { ok: false, reason: "that slot is empty" };
    row.equipped[slot] = null;
    save();
    return { ok: true, slot: slot };
  }

  // The loadout as ids, holes included. Reading it never changes it, which is
  // why the perks layer can call it every frame without thinking about it.
  function equippedPerks(towerId) {
    return progressRow(towerId).equipped.slice();
  }

  // WHEN THIS TOWER MAY BE RESET AGAIN, as a wall-clock stamp. Zero means now.
  // The comparison is the caller's -- see the note on TREE_RESET_COOLDOWN_MS.
  function resetReadyAt(towerId) {
    var row = progressRow(towerId);
    return row.resetAt ? row.resetAt + TREE_RESET_COOLDOWN_MS : 0;
  }

  // Hand back every node this tower has bought, take the fee, and start the
  // cooldown. `refund` is what the caller worked out the nodes were worth --
  // the prices live with the trees, not here.
  //
  // XP AND LEVEL ARE NOT TOUCHED, and neither is ownership of the tower. What a
  // reset undoes is spending, and only spending: a player who has played thirty
  // runs still has the level those runs bought.
  function resetTree(towerId, refund, nowMs) {
    var s = ensure();
    if (!owns(towerId)) return { ok: false, reason: "you do not own that tower" };
    var row = progressRow(towerId);

    // THE COOLDOWN IS ASKED FIRST, and deliberately, even though "nothing
    // bought" is also true right after a reset. A player pressing this again
    // needs to know WHEN they may, and "nothing to refund" answers a question
    // they did not ask -- they can see the tree is empty.
    var now = (typeof nowMs === "number" && isFinite(nowMs)) ? nowMs : 0;
    var ready = resetReadyAt(towerId);
    if (ready > now) {
      return { ok: false, reason: "reset is still cooling down", readyAt: ready };
    }
    if (!row.nodes.length) return { ok: false, reason: "nothing bought to refund" };
    if (s.coins < TREE_RESET_FEE) {
      return { ok: false, reason: "the reset fee is " + TREE_RESET_FEE + " meta coins" };
    }

    var back = (typeof refund === "number" && isFinite(refund) && refund > 0)
      ? Math.floor(refund) : 0;
    var removed = row.nodes.length;

    s.coins += back;
    s.coins -= TREE_RESET_FEE;
    row.nodes = [];
    // EVERY REVOKED PERK LEAVES THE LOADOUT WITH IT. A slot holding a node the
    // player no longer owns is the one shape equipPerk refuses to create, and a
    // reset must not create it by the back door.
    row.equipped = emptyPerkSlots();
    row.resetAt = now;
    save();
    return {
      ok: true, refunded: back, fee: TREE_RESET_FEE, removed: removed,
      readyAt: now + TREE_RESET_COOLDOWN_MS
    };
  }

  // --- test / sandbox hooks ------------------------------------------------

  // Everything owned and equipped, without spending anything.
  //
  // This exists for tests/harness.js and sandbox.html, and it is the honest
  // way to do it: the shipping game gates towers behind coins, and a test
  // suite that measured a locked roster would be measuring a different game
  // from the one under test. The alternative -- special-casing "are we in a
  // test" inside the gate -- is the thing that rots.
  function unlockAll() {
    var s = ensure();
    CATALOGUE.forEach(function (t) {
      if (s.owned.indexOf(t.id) === -1) s.owned.push(t.id);
    });
    s.equipped = defaultLoadout(s.owned);
    return s;
  }

  function reset() {
    state = starterProfile();
    save();
    return state;
  }

  // Read-only view, for tests and the screens.
  function snapshot() {
    var s = ensure();
    return {
      coins: s.coins, owned: s.owned.slice(), equipped: s.equipped.slice(),
      // One progression row per OWNED tower, materialised rather than copied,
      // so a tower that has never earned a point still reads as level 0 with
      // five locked slots instead of as `undefined`.
      progress: s.owned.reduce(function (acc, id) {
        acc[id] = progressOf(id);
        return acc;
      }, {}),
      runs: s.runs, bestWave: s.bestWave,
      milestones: s.milestones.slice(), routesWon: s.routesWon.slice()
    };
  }

  return {
    SLOT_COUNT: SLOT_COUNT,
    STORAGE_KEY: STORAGE_KEY,
    catalogue: catalogue,
    entry: entry,
    constructorOf: constructorOf,
    coins: coins,
    // `coinsForRun` is GONE (2026-08-26). It took (waveReached, victory) and
    // returned a bare number, and both halves of that signature were wrong
    // under the ladder: the ladder counts waves FINISHED, and a run now pays
    // from several sources at once. Callers use `repeatableCoins` for the
    // promise a store screen wants to make, and `awardRun` for the banking.
    repeatableCoins: repeatableCoins,
    awardRun: awardRun,
    bestWave: bestWave,
    // THE REFERENCE CAMPAIGN'S OWN TABLES, unchanged and still zero-argument:
    // these are the authored numbers, and they are what a reader compares a
    // scaled table against.
    milestoneTable: function () { return WAVE_MILESTONES.slice(); },
    firstWinCoins: function () { return FIRST_WIN_COINS; },
    repeatableTiers: function () { return REPEATABLE_TIERS.slice(); },
    victoryCoins: function () { return VICTORY_COINS; },
    // AND THE SAME TABLES AS A GIVEN CAMPAIGN ON A GIVEN BOARD WILL PAY THEM.
    // Called with no arguments they answer exactly as the four above do.
    tiersFor: scaledTiers,
    milestonesFor: scaledMilestones,
    victoryCoinsFor: scaledVictoryCoins,
    firstWinCoinsFor: function (difficultyId, mapId) {
      return scaleCoins(FIRST_WIN_COINS, coinScale(difficultyId, mapId));
    },
    // The number every one of those is multiplied by, so the index and the
    // tests can show it rather than re-deriving it.
    coinScale: coinScale,
    waveScale: waveScale,
    owns: owns,
    buy: buy,
    equipped: equipped,
    isEquipped: isEquipped,
    equip: equip,
    unequip: unequip,
    loadoutProblem: loadoutProblem,
    // --- permanent tower progression (2026-08-30) ---------------------------
    PERK_SLOTS: PERK_SLOTS,
    XP_THRESHOLDS: XP_THRESHOLDS.slice(),
    TREE_RESET_FEE: TREE_RESET_FEE,
    TREE_RESET_COOLDOWN_MS: TREE_RESET_COOLDOWN_MS,
    levelForXp: levelForXp,
    xpForLevel: xpForLevel,
    progressOf: progressOf,
    addXp: addXp,
    ownsNode: ownsNode,
    ownedNodes: ownedNodes,
    buyNode: buyNode,
    equipPerk: equipPerk,
    unequipPerk: unequipPerk,
    equippedPerks: equippedPerks,
    resetReadyAt: resetReadyAt,
    resetTree: resetTree,
    slotConstructors: slotConstructors,
    unlockAll: unlockAll,
    reset: reset,
    // Load a RAW profile object through the same `sanitise` a file goes
    // through, without touching storage. It exists so the migration and the
    // hostile-data rules can be tested against the real guard rather than
    // against a re-implementation of it in the test: writing the JSON into
    // localStorage would work in a browser and not in the Node harness, which
    // has none.
    __loadForTest: function (raw) { state = sanitise(raw); return snapshot(); },
    load: load,
    save: save,
    snapshot: snapshot
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = MetaProgress;
}
