// ---------------------------------------------------------------------------
// The Farm's permanent tree
//
// THE TOWER THAT NEVER FIRES, AND THE PROOF THAT THIS SYSTEM DOES NOT ASSUME
// DAMAGE. Not one node here touches a damage stat, because the Farm has none:
// it produces mana, it feeds the base, and its C path turns a board of farms
// into one dice network. Its tree is about the purse and the clock.
//
// Its four base nodes are the Farm's four honest levers:
//
//   north  yield      more mana a wave
//   east   ticking    more mana off A3's five-second drip
//   south  ramparts   the base health B1 pays out
//   west   footing    what a 1200-mana tower costs to plant
//
// THE FARM IS THE EXPENSIVE TOWER (1200 against the $600 stake), so its west
// branch is worth more here than on any other tree -- it is the difference
// between a Farm on wave 1 and a Farm on wave 6.
//
// Field names read off `FarmTower.prototype.recalcStats`.
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "farm",
  nodes: [
    {
      id: "far_yield",
      name: "Deep Furrow",
      blurb: "+40 mana a wave, before any tier. A Farm's whole case is how " +
             "soon it pays itself back, and this moves that by a wave.",
      cost: 8,
      at: { x: 0, y: -1 },
      effects: { add: { perWaveProduction: 40 } }
    },
    {
      id: "far_tick",
      name: "Ley Tap",
      blurb: "+10% on the five-second drip. Nothing at all until A3 is bought, " +
             "and compounding from the moment it is.",
      cost: 7,
      at: { x: 1, y: 0 },
      effects: { mul: { perTickProduction: 1.10 } }
    },
    {
      id: "far_rampart",
      name: "Rampart Levy",
      blurb: "+8 base hit points a wave. Only the B path pays base health at " +
             "all, so this is the B-path Farm's node and nobody else's.",
      cost: 7,
      at: { x: 0, y: 1 },
      effects: { add: { baseHpPerWave: 8 } }
    },
    {
      id: "far_footing",
      name: "Prepared Footing",
      blurb: "Farms cost 12% less to plant. On the game's dearest tower that " +
             "is 144 mana, which is most of a wave's clear bounty.",
      cost: 9,
      at: { x: -1, y: 0 },
      effects: { price: { mul: 0.88 } }
    },

    {
      id: "far_harvest",
      name: "Long Harvest",
      blurb: "+90 more mana a wave, and 200 mana on the planting price. It " +
             "pays that back in three waves and prints after.",
      cost: 15,
      minLevel: 2,
      requires: ["far_yield"],
      at: { x: 0, y: -2 },
      effects: { add: { perWaveProduction: 90 }, price: { add: 200 } }
    },
    {
      id: "far_conduit",
      name: "Wide Conduit",
      blurb: "+18% more on the drip. The A-path Farm's late-campaign node.",
      cost: 14,
      requires: ["far_tick"],
      at: { x: 2, y: 0 },
      effects: { mul: { perTickProduction: 1.18 } }
    },
    {
      id: "far_bastion",
      name: "Bastion Tithe",
      blurb: "+18 more base hit points a wave, and 4 mana back for every kill " +
             "on the board. A wall that also pays.",
      cost: 16,
      minLevel: 2,
      requires: ["far_rampart"],
      at: { x: 0, y: 2 },
      effects: { add: { baseHpPerWave: 18, manaPerKill: 4 } }
    },
    {
      id: "far_smallhold",
      name: "Smallhold",
      blurb: "10% cheaper again, and 15% off the mana a wave. A Farm you can " +
             "afford on wave one, worth less than one you cannot.",
      cost: 13,
      requires: ["far_footing"],
      at: { x: -2, y: 0 },
      effects: { price: { mul: 0.90 }, mul: { perWaveProduction: 0.85 } }
    },

    {
      id: "far_leyline",
      name: "Leyline Estate",
      blurb: "+25% on both the wave yield and the drip. Needs the long harvest " +
             "AND the wide conduit — the Farm that took both halves of its own " +
             "economy.",
      cost: 30,
      minLevel: 3,
      requires: ["far_harvest", "far_conduit"],
      at: { x: 1.7, y: -1.7 },
      effects: { mul: { perWaveProduction: 1.25, perTickProduction: 1.25 } }
    },
    {
      id: "far_warded",
      name: "Warded Field",
      blurb: "+10 percentage points of dodge and +150 hit points. Nothing on " +
             "a Farm that never bought C2 keeps it alive; this does.",
      cost: 22,
      requires: ["far_bastion"],
      at: { x: 1.7, y: 1.7 },
      effects: { add: { dodgeChance: 0.10, maxHp: 150 } }
    },
    {
      id: "far_dynasty",
      name: "Dynasty Charter",
      blurb: "One more die on the C network. Does nothing at all until C5 has " +
             "put dice on the board, and doubles a dice Farm's reading when it " +
             "has.",
      // NO `price` BESIDE AN `onlyIf`: a build price is a property of the TYPE
      // and is quoted before any tower exists, so it cannot be conditional on
      // one. Charging for a tier the player may never buy would be the dishonest
      // half of a conditional effect. See applyEffects in tower-perks.js.
      cost: 42,
      minLevel: 5,
      requires: ["far_leyline", "far_warded"],
      at: { x: 0, y: 3.2 },
      effects: {
        onlyIf: "diceCount",
        add: { diceCount: 1 }
      }
    }
  ]
});
