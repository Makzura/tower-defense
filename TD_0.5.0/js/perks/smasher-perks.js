// ---------------------------------------------------------------------------
// The Warbringer's permanent tree
//
// A MELEE WEDGE, so its tree is about the swing and the arc rather than about
// reach: a Warbringer chooses a corner and everything that walks through it.
// Its four base nodes are the four things that can be traded on a body that
// stands in the road -- the edge, the haft, the greaves, and what it costs to
// put one there.
//
// The convergence rewards committing to the wide swing; the deep node is a
// price the early game cannot pay and the late game barely notices.
//
// Field names read off `Smasher.prototype.recalcStats`.
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "smasher",
  nodes: [
    {
      id: "sma_edge",
      name: "Whetted Edge",
      blurb: "+3 damage a swing. Flat, and it never stops mattering: the " +
             "Warbringer's damage is per swing and its swings are slow.",
      cost: 7,
      at: { x: 0, y: -1 },
      effects: { add: { damage: 3 } }
    },
    {
      id: "sma_haft",
      name: "Shortened Haft",
      blurb: "Swings 8% sooner, through 10% less arc. Faster, narrower, and " +
             "worse at a junction than at a straight.",
      cost: 8,
      at: { x: 1, y: 0 },
      effects: { mul: { cooldownSeconds: 0.92, arcDegrees: 0.90 } }
    },
    {
      id: "sma_greaves",
      name: "Ash Greaves",
      blurb: "+80 hit points. The Warbringer is the tower closest to the road " +
             "and takes the hits meant for the others.",
      cost: 6,
      at: { x: 0, y: 1 },
      effects: { add: { maxHp: 80 } }
    },
    {
      id: "sma_scrap",
      name: "Scrap Forged",
      blurb: "15% cheaper to place, 6% less damage a swing. A $600 tower is " +
             "the whole opening stake; this makes it most of one.",
      cost: 7,
      at: { x: -1, y: 0 },
      effects: { price: { mul: 0.85 }, mul: { damage: 0.94 } }
    },

    {
      id: "sma_reach",
      name: "Long Reach",
      blurb: "+8 u.l. on the swing. Small, and it is the difference between " +
             "covering one lane of a bend and covering both.",
      cost: 12,
      requires: ["sma_edge"],
      at: { x: 0, y: -2 },
      effects: { add: { rangeUl: 8 } }
    },
    {
      id: "sma_sweep",
      name: "Wide Sweep",
      blurb: "+40 degrees of arc, which hands back what the short haft cost " +
             "and then some.",
      cost: 14,
      minLevel: 2,
      requires: ["sma_haft"],
      at: { x: 2, y: 0 },
      effects: { add: { arcDegrees: 40 } }
    },
    {
      id: "sma_anvil",
      name: "Anvil Stance",
      blurb: "+160 more hit points, and swings come 6% slower. It stops being " +
             "killed; it also stops being quick.",
      cost: 13,
      requires: ["sma_greaves"],
      at: { x: 0, y: 2 },
      effects: { add: { maxHp: 160 }, mul: { cooldownSeconds: 1.06 } }
    },
    {
      id: "sma_foundry",
      name: "Foundry Contract",
      blurb: "10% cheaper again. Two Warbringers on wave one is a different " +
             "opening from one.",
      cost: 12,
      requires: ["sma_scrap"],
      at: { x: -2, y: 0 },
      effects: { price: { mul: 0.90 } }
    },

    {
      id: "sma_cleave",
      name: "Cleaving Form",
      blurb: "+18% damage. Needs the long reach AND the wide sweep: it is the " +
             "reward for building the swing rather than the body.",
      cost: 26,
      minLevel: 3,
      requires: ["sma_reach", "sma_sweep"],
      at: { x: 1.7, y: -1.7 },
      effects: { mul: { damage: 1.18 } }
    },
    {
      id: "sma_chainshock",
      name: "Chain Charge",
      blurb: "While B3's blast is bought, the Warbringer hits 12% harder — " +
             "and the blast is dealt off that same damage, so it carries.",
      cost: 24,
      requires: ["sma_anvil"],
      at: { x: 1.7, y: 1.7 },
      effects: { onlyIf: "explodesOnKill", mul: { damage: 1.12 } }
    },
    {
      id: "sma_warlord",
      name: "Warlord's Due",
      blurb: "+8 damage and +120 hit points, for 150 more mana a body. Needs " +
             "the cleaving form and the anvil stance both.",
      cost: 40,
      minLevel: 5,
      requires: ["sma_cleave", "sma_anvil"],
      at: { x: 0, y: 3.2 },
      effects: { add: { damage: 8, maxHp: 120 }, price: { add: 150 } }
    }
  ]
});
