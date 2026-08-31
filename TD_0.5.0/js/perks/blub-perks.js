// ---------------------------------------------------------------------------
// The Summoner's permanent tree — the owner's confirmed content (2026-08-31)
//
// THIRTEEN NODES, ALL ROOTS, AND THE BRANCHES ARE DELIBERATELY UNFINISHED:
//
//   north  the general upper branch -- 4, one more undesigned
//   south  the general lower branch -- 2, three more undesigned
//   west   path A -- 3, two more undesigned
//   east   path B -- 4, one more undesigned
//
// REJECTED NAMES ARE NOT HERE AND MUST NOT BE ADDED: `Swarm Density`,
// `Early Coagulation`, `Reinforced Cells`, `Shared Optics`, `Fortified Ritual`,
// `Recycled Biomass`, `Sacrificial Guard`.
//
// **A BLUB'S HP IS ITS AMMUNITION.** One ordinary attack spends one point (see
// `Blub.resolveAttack`), so a node that takes health off a blub is taking an
// attack off it as well, and every card below says HP/ammunition rather than
// the misleading word "charge".
//
// **THREE SCOPES, AND THEY ARE NOT INTERCHANGEABLE.** `family` is the unit's
// own A or B; the LINE (main / mini / heavy) is which of the tower's three
// clocks summons it; and "every blub" is neither. `summonStats` resolves all
// three in one place -- see the note there.
//
// FIXED SPECIAL DAMAGE STAYS FIXED. The MK2's 250-damage detonation and the
// SuperBlub's 400-damage lance are the only two figures in the game that ignore
// everything, and no node here moves either. Wide Detonation widens the blast
// and Superconductor fires the lance oftener; neither touches what it deals.
//
// EVERY NODE IS minLevel 0 and every one is a root: no prerequisite has been
// authored. **The `id` is the persistence format.**
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "blub",
  nodes: [

    // === general upper ======================================================

    // WHERE SUMMONS MAY APPEAR, not how far they shoot. `rangeUl` on this tower
    // is the ritual circle `findSpawnPoint` lays bodies inside; a blub's own
    // reach is its unit's `rangeUl` and is untouched here.
    {
      id: "blb_n1",
      name: "Extended Ritual Circle",
      icon: 0,
      blurb: "+25 u.l. of summoning range (75 → 100), so blubs may be laid " +
             "further out. Placement 450 → 525. Their own attack range is " +
             "unchanged.",
      cost: 90,
      minLevel: 0,
      at: { x: 0, y: -1 },
      effects: { add: { rangeUl: 25 }, price: { add: 75 } }
    },

    // BOTH SIGHTS, and the price is the fire rate rather than a damage matchup:
    // the rejected version charged 5% against ordinary ground enemies and that
    // is deliberately not here.
    {
      id: "blb_n2",
      name: "Ethereal Spores",
      icon: 1,
      blurb: "Every blub sees and targets camo AND flying enemies. Every blub " +
             "fires 10% slower. Placement 450 → 600.",
      cost: 120,
      minLevel: 0,
      at: { x: 0, y: -2 },
      effects: {
        set: { perkBlubSeesCamo: 1, perkBlubSeesFlying: 1 },
        mul: { perkRateMultAll: 0.90 },
        price: { add: 150 }
      }
    },

    // ONE ROLL PER SUMMONING EVENT, on the body that actually appeared, and the
    // duplicate never rolls again -- see `summon`. A duplicate with nowhere
    // legal to stand is simply not created and is not owed later.
    {
      id: "blb_n3",
      name: "Twin Embryo",
      icon: 2,
      blurb: "Every summon has a 15% chance to place a second identical blub, " +
             "if there is room. Every line's interval is 10% longer. A twin " +
             "never twins again.",
      cost: 150,
      minLevel: 0,
      at: { x: 0, y: -3 },
      effects: {
        set: { perkTwinChance: 0.15 },
        mul: { perkIntervalMultAll: 1.10 }
      }
    },

    // FOOTPRINT IS PLACEMENT, and shrinking it packs more bodies into the same
    // circle. The drawn model is a different thing and is not scaled with it.
    // The ammunition cost is rounded to nearest, which is this game's rule for
    // a percentage on a blub's HP (2026-08-31).
    {
      id: "blb_n4",
      name: "Compressed Bodies",
      icon: 3,
      blurb: "Every blub takes 15% less ground, so more fit around the tower. " +
             "Each starts with 5% less HP/ammunition — one attack fewer on the " +
             "bigger ones. The models are not shrunk.",
      cost: 100,
      minLevel: 0,
      at: { x: 0, y: -4 },
      effects: {
        mul: { perkFootprintMult: 0.85, perkHpMultAll: 0.95 }
      }
    },

    // === general lower ======================================================

    // The SUMMONER's own health, and not one point of any blub's ammunition.
    {
      id: "blb_s1",
      name: "Stripped Altar",
      icon: 4,
      blurb: "Placement 450 → 350. The Summoner itself has 30% less health " +
             "(100 → 70). Blub HP/ammunition is untouched.",
      cost: 60,
      minLevel: 0,
      at: { x: 0, y: 1 },
      effects: { price: { add: -100 }, mul: { maxHp: 0.70 } }
    },

    // BY LINE, not by family: whichever unit the MAIN clock is calling gains,
    // and the two side clocks pay. A crosspathed tower whose main line is a
    // Mechablub gains on it exactly as one calling a Blub I does.
    {
      id: "blb_s2",
      name: "Central Brood",
      icon: 5,
      blurb: "The main line's blubs deal 15% more ordinary damage; the Mini " +
             "and Heavy lines deal 8% less. Placement 450 → 500. Fixed special " +
             "damage is unaffected.",
      cost: 120,
      minLevel: 0,
      at: { x: 0, y: 2 },
      effects: {
        mul: { perkDamageMultMain: 1.15, perkDamageMultSide: 0.92 },
        price: { add: 50 }
      }
    },

    // === path A =============================================================

    // THE POINT OF DAMAGE COSTS AN ATTACK, because HP is ammunition: a Blub III
    // at A3 deals 7 a shot instead of 6 and makes 19 shots instead of 20.
    {
      id: "blb_a1",
      name: "Fragile Brood",
      icon: 6,
      blurb: "A3+ only: every path A blub deals +1 ordinary damage and starts " +
             "with 1 less HP/ammunition — one attack fewer, since HP is what " +
             "it shoots with.",
      cost: 120,
      minLevel: 0,
      at: { x: -1, y: 0 },
      effects: {
        when: [{ has: "hasA3", set: { perkDamageAddA: 1, perkHpAddA: -1 } }]
      }
    },

    // MORE BODIES, EACH LASTING LONGER. Neither the damage of an attack nor the
    // ammunition changes, so a blub that fires a tenth slower spends the same
    // stock over a tenth more time -- which is what makes this a field-presence
    // node rather than a DPS one.
    {
      id: "blb_a2",
      name: "Rapid Incubation",
      icon: 7,
      blurb: "A3+ only: every path A line summons 8% sooner, and its blubs " +
             "fire 10% slower. Damage per attack and HP/ammunition are " +
             "unchanged, so each body simply stays useful longer.",
      cost: 130,
      minLevel: 0,
      at: { x: -2, y: 0 },
      effects: {
        when: [{ has: "hasA3", mul: { perkIntervalMultA: 0.92, perkRateMultA: 0.90 } }]
      }
    },

    // FIFTY PER CENT FASTER TO BUILD, THIRTY PER CENT SOONER TO GO. The stack
    // cap, the refresh rule, which damage sources the debuff raises and what
    // happens to it when the body dies are all DamageAmp's and are untouched.
    {
      id: "blb_a3",
      name: "Fleeting Toxin",
      icon: 8,
      blurb: "A4+ only: the weakening debuff stacks +0.15 points a hit instead " +
             "of +0.10, but lasts 3.5 s instead of 5. Builds half again as " +
             "fast, expires 30% sooner.",
      cost: 150,
      minLevel: 0,
      at: { x: -3, y: 0 },
      effects: {
        when: [{ has: "hasA4", set: { weakenPerHit: 0.0015, weakenSeconds: 3.5 } }]
      }
    },

    // === path B =============================================================

    // B3 AND HIGHER ONLY, and it does nothing at B1 or B2 -- which is where the
    // path's blubs are still the A-family ones the main line inherited.
    {
      id: "blb_b1",
      name: "Overcharged Cores",
      icon: 9,
      blurb: "B3+ only: path B blubs deal 10% more ordinary damage and their " +
             "lines summon 6% slower. The MK2's detonation and the SuperBlub's " +
             "lance are unchanged.",
      cost: 110,
      minLevel: 0,
      at: { x: 1, y: 0 },
      effects: {
        when: [{ has: "hasB3", mul: { perkDamageMultB: 1.10, perkIntervalMultB: 1.06 } }]
      }
    },

    // A FLAT TWO SECONDS, taken off the RESOLVED authored interval and before
    // any multiplier -- so an MK2 on a finished path B reads 25 - 2 = 23 s and
    // a SuperBlub 95 - 2 = 93. The floor in `intervalFor` is what stops a
    // future retune ever reaching zero.
    {
      id: "blb_b2",
      name: "Compressed Cadence",
      icon: 0,
      blurb: "B3+ only: every path B line summons 2 s sooner (MK2 25 → 23 s, " +
             "SuperBlub 95 → 93 s). Those blubs have 15% less attack range.",
      cost: 120,
      minLevel: 0,
      at: { x: 2, y: 0 },
      effects: {
        when: [{ has: "hasB3", add: { perkIntervalAddB: -2 },
                 mul: { perkRangeMultB: 0.85 } }]
      }
    },

    // WIDER, NOT STRONGER. The detonation still deals its fixed 250; what a
    // fifth more radius is worth depends on the road under it and how tightly
    // the wave is packed, and this node deliberately claims nothing about that.
    {
      id: "blb_b3",
      name: "Wide Detonation",
      icon: 1,
      blurb: "The MK2's death blast reaches 35 u.l. instead of 25 — a 50 → 70 " +
             "u.l. diameter. Every path B blub deals 4% less ordinary damage. " +
             "The blast still deals exactly 250.",
      cost: 150,
      minLevel: 0,
      at: { x: 3, y: 0 },
      effects: {
        set: { perkBlastRadiusUl: 35 },
        mul: { perkDamageMultB: 0.96 }
      }
    },

    // THE LANCE IS FREE AND STAYS FREE, so firing it every seventh attack
    // rather than every tenth turns a 51-ammunition SuperBlub's five lances
    // into seven. Its targeting and its counter reset are untouched.
    {
      id: "blb_b4",
      name: "Superconductor",
      icon: 2,
      blurb: "B5 only: the SuperBlub's lance fires every 7th attack instead of " +
             "every 10th. Its ordinary attacks deal 5% less. The lance's own " +
             "damage is unchanged.",
      cost: 180,
      minLevel: 0,
      at: { x: 4, y: 0 },
      effects: {
        set: { perkLaserEvery: 7 },
        mul: { perkDamageMultSuper: 0.95 }
      }
    }
  ]
});
