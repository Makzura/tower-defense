// ---------------------------------------------------------------------------
// The Summoner's permanent tree
//
// A TOWER THAT NEVER FIRES AND WHOSE UNITS ARE ITS AMMUNITION. Every number
// here is spent on the blubs rather than on the body that plants them, because
// that is where a Summoner's whole output is -- and because a blub is born with
// finished numbers (see `summonStats`), a perk on this tree reaches every blub
// planted after it and none of the ones already standing.
//
// Its four base nodes:
//
//   north  bite       what a blub hits for
//   east   cadence    how often one is planted
//   south  bulk       how long one lasts, which IS its ammunition
//   west   footing    what a 450-mana Summoner costs to plant
//
// `intervalDelta` IS ADDED TO AN INTERVAL, so a negative value plants sooner --
// and the tower's own MIN_INTERVAL_SECONDS floors it, so no stack of perks can
// drive the timer to zero.
//
// Field names read off `BlubTower.prototype.recalcStats` and `summonStats`.
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "blub",
  nodes: [
    {
      id: "blb_bite",
      name: "Sharpened Bite",
      blurb: "+2 damage on every blub planted from now on. Flat, and it lands " +
             "on all three lines at once.",
      cost: 7,
      at: { x: 0, y: -1 },
      effects: { add: { summonDamageBonus: 2 } }
    },
    {
      id: "blb_cadence",
      name: "Quick Spawn",
      blurb: "Blubs are planted 0.4 s sooner. The floor still applies, so this " +
             "is worth most on the slow lines.",
      cost: 8,
      at: { x: 1, y: 0 },
      effects: { add: { intervalDelta: -0.4 } }
    },
    {
      id: "blb_bulk",
      name: "Thick Hide",
      blurb: "+8 hit points on every blub. A blub's hit points are its " +
             "ammunition — this is a bigger magazine, not just a longer life.",
      cost: 7,
      at: { x: 0, y: 1 },
      effects: { add: { summonHpBonus: 8 } }
    },
    {
      id: "blb_footing",
      name: "Shallow Roots",
      blurb: "Summoners cost 14% less to plant. The second Summoner is where " +
             "this tower stops being a curiosity.",
      cost: 8,
      at: { x: -1, y: 0 },
      effects: { price: { mul: 0.86 } }
    },

    {
      id: "blb_venom",
      name: "Venomed Bite",
      blurb: "+5 more damage a blub, and they are planted 0.3 s slower. Fewer " +
             "bodies, each worth more.",
      cost: 14,
      minLevel: 2,
      requires: ["blb_bite"],
      at: { x: 0, y: -2 },
      effects: { add: { summonDamageBonus: 5, intervalDelta: 0.3 } }
    },
    {
      id: "blb_hatchery",
      name: "Hatchery",
      blurb: "0.5 s sooner again, and 90 mana on the planting price. A wall of " +
             "blubs, paid for at the door.",
      cost: 15,
      requires: ["blb_cadence"],
      at: { x: 2, y: 0 },
      effects: { add: { intervalDelta: -0.5 }, price: { add: 90 } }
    },
    {
      id: "blb_carapace",
      name: "Carapace",
      blurb: "+18 more hit points a blub, and +25 u.l. on the Summoner's own " +
             "reach so they are planted further out.",
      cost: 14,
      requires: ["blb_bulk"],
      at: { x: 0, y: 2 },
      effects: { add: { summonHpBonus: 18, rangeUl: 25 } }
    },
    {
      id: "blb_thrift",
      name: "Thrifty Brood",
      blurb: "10% cheaper again, and 3 less damage a blub. The opening-wave " +
             "Summoner.",
      cost: 12,
      requires: ["blb_footing"],
      at: { x: -2, y: 0 },
      effects: { price: { mul: 0.90 }, add: { summonDamageBonus: -3 } }
    },

    {
      id: "blb_broodmother",
      name: "Broodmother",
      blurb: "+6 damage and +20 hit points on every blub. Needs the venomed " +
             "bite AND the carapace — the reward for taking both halves of a " +
             "summon rather than one.",
      cost: 30,
      minLevel: 3,
      requires: ["blb_venom", "blb_carapace"],
      at: { x: 1.7, y: -1.7 },
      effects: { add: { summonDamageBonus: 6, summonHpBonus: 20 } }
    },
    {
      id: "blb_swarmlord",
      name: "Swarm Charter",
      blurb: "Two more bodies on the swarm cap. Nothing until A2 has set a cap " +
             "at all, and a different tower the moment it has.",
      cost: 26,
      requires: ["blb_hatchery"],
      at: { x: 2.8, y: 1.4 },
      effects: { onlyIf: "swarmCap", add: { swarmCap: 2 } }
    },
    {
      id: "blb_apex",
      name: "Apex Brood",
      blurb: "+10 damage and +30 hit points a blub, and 200 mana to plant one " +
             "of these. The late-campaign Summoner.",
      cost: 42,
      minLevel: 5,
      requires: ["blb_broodmother", "blb_swarmlord"],
      at: { x: 0, y: 3.2 },
      effects: {
        add: { summonDamageBonus: 10, summonHpBonus: 30 },
        price: { add: 200 }
      }
    }
  ]
});
