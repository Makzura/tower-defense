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
    {
      id: "smasher",
      global: "Smasher",
      price: 0,
      starter: true,
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
      blurb: "$300 Rifleman, three shots a burst. Its B path becomes " +
             "automatic and calls in stop-to-shoot recruits."
    },
    // A COIN PURCHASE, NOT A STARTER, and that was a decision rather than an
    // omission. `starter: true` would put a tower that produces free damage
    // forever into the opening kit, and the premise the whole meta loop rests
    // on -- a fresh profile CANNOT win, which tools/measure-starter-kit.js
    // exists to keep checking -- is measured against the kit as it stands. If
    // the owner wants this in the opening hand it is one field, plus a re-run
    // of that tool.
    //
    // Priced between the Arcane Sniper (40) and the Siphon (150): it is more
    // than a first unlock and less than the run-defining one.
    {
      id: "blub",
      global: "BlubTower",
      price: 90,
      starter: false,
      blurb: "$450 Summoner. It never fires — it plants blubs, whose hit points " +
             "ARE their ammunition, and they shoot for it."
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
    return { coins: 0, owned: owned, equipped: defaultLoadout(owned), runs: 0 };
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

    // A saved bar that could not start a run gets thrown away for the default
    // one. unequip() refuses to create such a bar, so this can only come from
    // a hand-edited file or a profile written before that rule existed -- and
    // silently honouring it would drop the player onto a board they can never
    // build on. See wouldStrand().
    var cheapest = Infinity;
    equipped.forEach(function (id) {
      if (id === null) return;
      var ctor = constructorOf(id);
      if (ctor && typeof ctor.COST === "number") cheapest = Math.min(cheapest, ctor.COST);
    });
    if (cheapest > startingCash()) equipped = defaultLoadout(owned);

    return {
      coins: (typeof raw.coins === "number" && isFinite(raw.coins) && raw.coins >= 0)
        ? Math.floor(raw.coins) : 0,
      owned: owned,
      equipped: equipped,
      runs: (typeof raw.runs === "number" && isFinite(raw.runs) && raw.runs >= 0)
        ? Math.floor(raw.runs) : 0
    };
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

  // The award. Deliberately a pure function of what the run achieved, so the
  // store screen can PROMISE a number before the run and the loss screen can
  // show the same one after it, without either re-deriving the rule.
  //
  // Two per wave reached, sixty for a clear. Tuned against the store: a first
  // run dies somewhere around wave 17 (measured -- see AGENTS.md), which pays
  // 32, so the Longshot's 40 is two runs away and is the purchase that makes
  // the campaign winnable at all. The Siphon's 150 is a longer project.
  function coinsForRun(waveReached, victory) {
    var cleared = Math.max(0, (waveReached || 0) - 1);
    return cleared * 2 + (victory ? 60 : 0);
  }

  // Bank a finished run. Returns what was awarded so the overlay can show it.
  function awardRun(waveReached, victory) {
    var earned = coinsForRun(waveReached, victory);
    var s = ensure();
    s.coins += earned;
    s.runs += 1;
    save();
    return earned;
  }

  // --- owning and equipping ------------------------------------------------

  function owns(id) { return ensure().owned.indexOf(id) !== -1; }

  // Returns { ok, reason }. The refusal reasons are shown verbatim on the
  // store button, which is why they read as sentences rather than codes --
  // same arrangement whyCannotBuild has with the build preview.
  function buy(id) {
    var s = ensure();
    var found = entry(id);
    if (!found) return { ok: false, reason: "no such tower" };
    if (owns(id)) return { ok: false, reason: "already owned" };
    if (s.coins < found.price) {
      return { ok: false, reason: "needs " + (found.price - s.coins) + " more coins" };
    }

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

  // What the bar would look like without `id`, and whether that is a bar you
  // could actually play a run with.
  //
  // TWO ways to make an unplayable loadout, and they are the same failure:
  //
  //   1. an empty bar -- no tower, no damage, no cash, ever;
  //   2. a bar whose cheapest tower costs more than the opening stake, which
  //      is the identical deadlock with an extra step. Unequipping the gunner
  //      and leaving only the $800 Siphon is a board you can never build on.
  //
  // AGENTS.md states the invariant as "STARTING_CASH must exceed the cost of
  // the cheapest tower". That used to be guaranteed by BUILD_SLOTS being a
  // constant with the gunner in it. Now the player edits the bar, so the
  // invariant needs enforcing, and it is enforced HERE rather than in
  // js/store.js so that no other caller can route around it.
  function wouldStrand(idRemoved) {
    var s = ensure();
    var cheapest = Infinity;
    s.equipped.forEach(function (id) {
      if (id === null || id === idRemoved) return;
      var ctor = constructorOf(id);
      if (ctor && typeof ctor.COST === "number") cheapest = Math.min(cheapest, ctor.COST);
    });
    return cheapest > startingCash();
  }

  function unequip(id) {
    var s = ensure();
    var slot = s.equipped.indexOf(id);
    if (slot === -1) return { ok: false, reason: "not equipped" };

    var remaining = s.equipped.filter(function (x) { return x !== null; }).length;
    if (remaining <= 1) return { ok: false, reason: "the bar cannot be empty" };
    if (wouldStrand(id)) {
      return { ok: false, reason: "you could not afford a first tower without it" };
    }

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
    return { coins: s.coins, owned: s.owned.slice(), equipped: s.equipped.slice(), runs: s.runs };
  }

  return {
    SLOT_COUNT: SLOT_COUNT,
    STORAGE_KEY: STORAGE_KEY,
    catalogue: catalogue,
    entry: entry,
    constructorOf: constructorOf,
    coins: coins,
    coinsForRun: coinsForRun,
    awardRun: awardRun,
    owns: owns,
    buy: buy,
    equipped: equipped,
    isEquipped: isEquipped,
    equip: equip,
    unequip: unequip,
    slotConstructors: slotConstructors,
    unlockAll: unlockAll,
    reset: reset,
    load: load,
    save: save,
    snapshot: snapshot
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = MetaProgress;
}
