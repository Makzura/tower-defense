// ---------------------------------------------------------------------------
// The Warbringer's permanent tree — the owner's first authored content
//
// FIVE NODES: FOUR ROOTS AND ONE CHILD, AND NOTHING ELSE IS DESIGNED YET. This
// replaced a first pass written to prove the format on 2026-08-30; these are the
// owner's own numbers and shape. Do not extend the branches.
//
//   north  a little more base reach, paid for at the build price
//   west   path A -- a real speed-up from A4, and A4 costs more
//   west+1 the CHILD, behind the west root: A1 to A4 all cost less
//   east   path B -- more damage on B2/B3/B4 and a bigger chain blast
//   south  path B's reach, rebuilt: much more base, less from the tiers
//
// THE CHILD IS NOT A FIFTH ROOT. It sits one step further out on the A branch
// and its only prerequisite is the west root. **The prerequisite gates the
// PURCHASE and nothing else** -- once bought, its upgrade may be equipped on
// its own, without the parent in a slot, if a player wants to spend one slot on
// the discount alone.
//
// NAMES AND ICONS ARE PLACEHOLDERS AND SAY SO -- see the note in
// js/perks/soldier-perks.js. The `id` is the persistence format; the name and
// the icon are not.
//
// EVERY NODE IS minLevel 0: all five are buyable the moment the tower is owned
// and the coins (and, for the child, the parent) are there. None can be
// EQUIPPED until the Warbringer reaches level 1.
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "smasher",
  nodes: [
    // --- north: base reach ---------------------------------------------------
    {
      id: "war_n1",
      name: "[W-N] Base range",
      icon: 4,
      blurb: "+5 u.l. of base reach — 40 becomes 45 — for 100 more mana a " +
             "Warbringer: 600 becomes 700. No in-run upgrade price changes.",
      cost: 100,
      minLevel: 0,
      at: { x: 0, y: -1 },
      effects: { add: { rangeUl: 5 }, price: { add: 100 } }
    },

    // --- west: path A speed, from A4 ----------------------------------------
    //
    // `addRate`, NOT A SUBTRACTION FROM THE COOLDOWN, and the distinction is
    // the whole node. The Warbringer stores its speed as a PERIOD; the owner's
    // figure is a RATE. `1/(1/f + 0.15)` is "whatever rate this tower actually
    // reached, plus 0.15 a second", which is correct on a pure A path (3.00 s
    // = 0.333/s becomes 0.483/s = 2.07 s) and stays correct on any crosspath
    // that arrives at A4 with a different swing.
    //
    // A1, A2 and A3 get nothing: the bonus begins with A4 and persists through
    // A5, which is what `hasA4` staying true after A5 is bought gives for free.
    {
      id: "war_a1",
      name: "[W-A] Path A speed",
      icon: 5,
      blurb: "From A4 onward the Warbringer swings 0.15 attacks a second " +
             "faster — on a pure path A that is 0.33/s becoming 0.48/s, about " +
             "one swing every 2.07 s instead of every 3. A4 costs 250 more " +
             "mana (1650); A1, A2, A3 and A5 are unchanged, and the bonus does " +
             "nothing before A4 is bought.",
      cost: 120,
      minLevel: 0,
      at: { x: -1, y: 0 },
      effects: {
        when: [{ has: "hasA4", addRate: { cooldownSeconds: 0.15 } }],
        tiers: { A4: { cost: 250 } }
      }
    },

    // --- the child: path A prices -------------------------------------------
    //
    // Bought only after the west root; EQUIPPED independently of it. A player
    // who wants the discount and not the speed spends one slot and gets exactly
    // that, which is the rule stated at the top of this file.
    {
      id: "war_a2",
      name: "[W-A2] Path A prices",
      icon: 6,
      blurb: "A1 to A4 each cost 50 less mana: 200, 350, 550 and 1350. A5 is " +
             "unchanged at 1950. No stat changes at all — this node is only " +
             "about what path A costs to climb.",
      cost: 150,
      minLevel: 0,
      requires: ["war_a1"],
      at: { x: -2, y: 0 },
      effects: {
        tiers: {
          A1: { cost: -50 }, A2: { cost: -50 },
          A3: { cost: -50 }, A4: { cost: -50 }
        }
      }
    },

    // --- east: path B damage and the blast -----------------------------------
    //
    // THREE GROUPS THAT ACCUMULATE, because the Warbringer's B damage is
    // additive: at B2 the tower carries +1 from this node, at B3 +2, and at B4
    // and B5 +3. The blast rides on B4's group so it is 18 from B4 and stays 18
    // through B5.
    //
    // The blast's radius, its chaining and everything else about path B are
    // untouched: this node moves two numbers and pays for them on three tiers.
    {
      id: "war_b1",
      name: "[W-B] Path B damage",
      icon: 7,
      blurb: "Path B hits harder: B2 adds 2 damage instead of 1, B3 adds 5 " +
             "instead of 4, B4 adds 7 instead of 6 — so a B4 or B5 Warbringer " +
             "carries 3 more damage a swing than normal. B4's chain blast goes " +
             "from 15 to 18. B2, B3 and B4 each cost 50 more mana (500, 950, " +
             "1950); B5 is unchanged. The blast's radius and its chaining are " +
             "not touched.",
      cost: 120,
      minLevel: 0,
      at: { x: 1, y: 0 },
      effects: {
        when: [
          { has: "hasB2", add: { damage: 1 } },
          { has: "hasB3", add: { damage: 1 } },
          { has: "hasB4", add: { damage: 1, explosionDamage: 3 } }
        ],
        tiers: { B2: { cost: 50 }, B3: { cost: 50 }, B4: { cost: 50 } }
      }
    },

    // --- south: path B's reach, rebuilt --------------------------------------
    //
    // A LOT MORE BASE AND LESS FROM THE TIERS, which is a different tower
    // rather than a bigger one: a Warbringer that is worth planting before B1
    // and gains less from climbing. The negative groups are what keep the tiers
    // honest -- +17.5 on top of the authored B bonuses would have reached 107.5
    // at B5 and quietly swallowed the promise that each tier still gives
    // something readable. What the player actually receives is:
    //
    //   base 57.5   B1 +3 -> 60.5   B2 +11 -> 71.5   B3 +0 -> 71.5
    //   B4 +6 -> 77.5   B5 +15 -> 92.5
    //
    // No B price moves. `rangePx` is re-derived after the perks land, so the
    // ring the panel draws and the reach the tower shoots are the same number.
    {
      id: "war_s1",
      name: "[W-S] Range rebuild",
      icon: 8,
      blurb: "+17.5 u.l. of base reach — 40 becomes 57.5 — for 50 more mana a " +
             "Warbringer (650). Path B then gives less: B1 adds 3 instead of " +
             "5, B2 adds 11 instead of 20, B4 adds 6 instead of 10. B3 still " +
             "adds none and B5 still adds 15, so the path reads 60.5, 71.5, " +
             "71.5, 77.5 and 92.5. No B upgrade price changes.",
      cost: 80,
      minLevel: 0,
      at: { x: 0, y: 1 },
      effects: {
        add: { rangeUl: 17.5 },
        price: { add: 50 },
        when: [
          { has: "hasB1", add: { rangeUl: -2 } },
          { has: "hasB2", add: { rangeUl: -9 } },
          { has: "hasB4", add: { rangeUl: -4 } }
        ]
      }
    }
  ]
});
