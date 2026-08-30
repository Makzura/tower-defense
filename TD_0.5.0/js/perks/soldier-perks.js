// ---------------------------------------------------------------------------
// The Rifleman's permanent tree
//
// ONE FILE PER TOWER, AND NO TWO TREES ARE THE SAME SHAPE. That is the whole
// design: a generic tree copied across the roster would make every tower the
// same tower with different art. This one is built out of what a Rifleman
// actually has -- a three-shot burst, a short reach, and the B4 recruits that
// nothing else in the game owns.
//
// FOUR BASE NODES OUT OF THE CENTRE, which is the shape every tree in this
// game takes, and they are four different ANSWERS rather than four sizes of the
// same one:
//
//   north  reach      the tower's problem is that 100 u.l. is not much
//   east   cadence    faster bursts, paid for at the build price
//   south  armour     it is a body on the road and bodies get attacked
//   west   economy    make it cheap enough to open a board with
//
// Two of them converge on the marksman node and two on the squad node, so a
// player who spreads wide gets a different tower from one who commits.
//
// THE FIELD NAMES ARE THE RIFLEMAN'S OWN (`burstCooldown`, `shotSpacing`,
// `recruitCount`, ...), read straight off `Soldier.prototype.recalcStats`. That
// is deliberate -- see the note on `statTarget` in js/systems/tower-perks.js.
// A perk writes to the tower it was authored for and to nothing else.
//
// COSTS are meta coins, against an economy where a campaign clear pays 80 and
// a first clear on a fresh profile banks 175. A base node is an afternoon, the
// deep ones are a decision. BALANCE VALUES, all of them.
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "soldier",
  nodes: [
    // --- the four base nodes -------------------------------------------------
    {
      id: "sol_barrel",
      name: "Trued Barrel",
      blurb: "+12 u.l. of reach. The cheapest way to make a Rifleman cover the " +
             "corner it is standing next to instead of the one it is on.",
      cost: 6,
      at: { x: 0, y: -1 },
      effects: { add: { rangeUl: 12 } }
    },
    {
      id: "sol_powder",
      name: "Hot Powder",
      blurb: "Bursts come 10% sooner — and the rounds cost more to issue, so " +
             "every Rifleman is 25 mana dearer to place.",
      cost: 7,
      at: { x: 1, y: 0 },
      effects: { mul: { burstCooldown: 0.90 }, price: { add: 25 } }
    },
    {
      id: "sol_plate",
      name: "Field Plating",
      blurb: "+40 hit points. A Rifleman on the road is a target, and the " +
             "Sapper's four seconds are survivable with plate on.",
      cost: 6,
      at: { x: 0, y: 1 },
      effects: { add: { maxHp: 40 } }
    },
    {
      id: "sol_drill",
      name: "Requisition Drill",
      blurb: "Riflemen cost 15% less to place. Opens a board with two where " +
             "the stake only bought one.",
      cost: 8,
      at: { x: -1, y: 0 },
      effects: { price: { mul: 0.85 } }
    },

    // --- second ring ---------------------------------------------------------
    {
      id: "sol_longbarrel",
      name: "Long Barrel",
      blurb: "+25 u.l. more reach, and bursts come 8% slower. A watchtower " +
             "rather than a rifle.",
      cost: 14,
      minLevel: 2,
      requires: ["sol_barrel"],
      at: { x: 0, y: -2 },
      effects: { add: { rangeUl: 25 }, mul: { burstCooldown: 1.08 } }
    },
    {
      id: "sol_cadence",
      name: "Drilled Cadence",
      blurb: "The three shots of a burst land 15% closer together. Nothing " +
             "leaves the circle between them.",
      cost: 12,
      requires: ["sol_powder"],
      at: { x: 2, y: 0 },
      effects: { mul: { shotSpacing: 0.85 } }
    },
    {
      id: "sol_bulwark",
      name: "Bulwark Frame",
      blurb: "+90 more hit points, and 40 mana on the build price. A Rifleman " +
             "that holds the front rank.",
      cost: 13,
      requires: ["sol_plate"],
      at: { x: 0, y: 2 },
      effects: { add: { maxHp: 90 }, price: { add: 40 } }
    },
    {
      id: "sol_surplus",
      name: "Surplus Line",
      blurb: "12% cheaper again, and every round hits for 10% less. A wall of " +
             "cheap rifles, and a decision you will feel by wave 20.",
      cost: 12,
      requires: ["sol_drill"],
      at: { x: -2, y: 0 },
      effects: { price: { mul: 0.88 }, mul: { damage: 0.90 } }
    },

    // --- convergences --------------------------------------------------------
    //
    // BOTH PARENTS, NEVER ONE. This is the AND the tree format exists for: a
    // player halfway up either branch sees the node, reads what it wants, and
    // cannot buy it.
    {
      id: "sol_marksman",
      name: "Marksman Doctrine",
      blurb: "Ignores 8 more percentage points of enemy defence. Needs both " +
             "the long barrel and the drilled cadence.",
      cost: 26,
      minLevel: 3,
      requires: ["sol_longbarrel", "sol_cadence"],
      at: { x: 1.7, y: -1.7 },
      effects: { add: { defenseFlatPierce: 8 } }
    },
    {
      id: "sol_squad",
      name: "Squad Requisition",
      blurb: "B4's call brings one more recruit, each 15 hit points tougher. " +
             "Does nothing on a Rifleman that never bought B4.",
      cost: 22,
      requires: ["sol_plate", "sol_powder"],
      at: { x: 1.7, y: 1.7 },
      // THE PERK THAT MODIFIES ONE IN-RUN TIER. `onlyIf` is the whole of it:
      // the recruit numbers are resolved on every Rifleman whether or not B4
      // was bought, and `hasRecruitAbility` is what B4 actually switches on.
      effects: {
        onlyIf: "hasRecruitAbility",
        add: { recruitCount: 1, recruitHp: 15 }
      }
    },
    {
      id: "sol_veterans",
      name: "Veteran Cadre",
      blurb: "Recruits hit for 2 more, fire 0.4 more shots a second, and the " +
             "call comes back 10 seconds sooner. B4 only.",
      cost: 34,
      minLevel: 4,
      requires: ["sol_squad"],
      at: { x: 2.8, y: 2.5 },
      effects: {
        onlyIf: "hasRecruitAbility",
        add: { recruitDamage: 2, recruitShotsPerSecond: 0.4, recruitCooldownSeconds: -10 }
      }
    },
    {
      id: "sol_lastcall",
      name: "Last Call",
      blurb: "+20% damage, +60 mana to place. The end-of-campaign Rifleman: " +
             "needs the marksman doctrine and the bulwark frame both.",
      cost: 40,
      minLevel: 5,
      requires: ["sol_marksman", "sol_bulwark"],
      at: { x: 0, y: 3.2 },
      effects: { mul: { damage: 1.20 }, price: { add: 60 } }
    }
  ]
});
