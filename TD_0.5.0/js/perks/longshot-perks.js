// ---------------------------------------------------------------------------
// The Arcane Sniper's permanent tree
//
// A CONFIG-DRIVEN TOWER, so its numbers live in `this.stats` rather than on the
// instance and its tree is authored against the names in
// `js/towers/long-range-dps.config.js` -- `range`, `damage`, `fireRate`,
// `critChance`, `critDamage`, `deadzone`, `pierce`, `hp`. TowerPerks.statTarget
// is what routes a perk to the right one of the two; nothing here has to know.
//
// THE SNIPER'S SHAPE IS ALREADY EXTREME -- 250 u.l. of reach, half a shot a
// second, a 50 u.l. hole it cannot shoot into, and a $900 price against a $600
// stake -- so this tree is about which of those extremes to lean on:
//
//   north  glass      more damage a shot, at the rate
//   east   cycling    more shots, at the damage
//   south  optics     the deadzone and the crit, the two things unique to it
//   west   armoury    the price, which is the tower's real problem early
//
// The west branch is worth more on this tree than on any other: 900 mana is
// more than the whole opening stake, so a Sniper is a wave-3 tower at best
// until something moves that number.
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "longshot",
  nodes: [
    {
      id: "lng_glass",
      name: "Ground Lens",
      blurb: "+3 damage a shot. On a tower that fires twice every four seconds " +
             "the per-shot number is the whole conversation.",
      cost: 8,
      at: { x: 0, y: -1 },
      effects: { add: { damage: 3 } }
    },
    {
      id: "lng_cycle",
      name: "Short Cycle",
      blurb: "+12% rate of fire, and 8% less damage a shot. Slightly more DPS " +
             "and markedly worse against armour.",
      cost: 8,
      at: { x: 1, y: 0 },
      effects: { mul: { fireRate: 1.12, damage: 0.92 } }
    },
    {
      id: "lng_optics",
      name: "Close Optics",
      blurb: "The dead zone shrinks by 15 u.l. A Sniper that can be planted " +
             "nearer the road it is watching.",
      cost: 7,
      at: { x: 0, y: 1 },
      effects: { add: { deadzone: -15 } }
    },
    {
      id: "lng_armoury",
      name: "Armoury Terms",
      blurb: "Snipers cost 18% less. 900 mana is more than the opening stake; " +
             "738 is not.",
      cost: 10,
      at: { x: -1, y: 0 },
      effects: { price: { mul: 0.82 } }
    },

    {
      id: "lng_heavy",
      name: "Heavy Slug",
      blurb: "+7 more damage, 10% off the rate, and 120 mana on the price. " +
             "One shot, and it should count.",
      cost: 16,
      minLevel: 2,
      requires: ["lng_glass"],
      at: { x: 0, y: -2 },
      effects: {
        add: { damage: 7 }, mul: { fireRate: 0.90 }, price: { add: 120 }
      }
    },
    {
      id: "lng_rapid",
      name: "Rapid Cycle",
      blurb: "+15% rate again. Stacked with the short cycle this is a Sniper " +
             "that behaves like a rifle with a very long barrel.",
      cost: 15,
      requires: ["lng_cycle"],
      at: { x: 2, y: 0 },
      effects: { mul: { fireRate: 1.15 } }
    },
    {
      id: "lng_ranging",
      name: "Ranging Reticle",
      blurb: "+10 percentage points of crit chance, and 15 u.l. more off the " +
             "dead zone.",
      cost: 16,
      requires: ["lng_optics"],
      at: { x: 0, y: 2 },
      effects: { add: { critChance: 10, deadzone: -15 } }
    },
    {
      id: "lng_surplus",
      name: "Surplus Optics",
      blurb: "10% cheaper again, and 25 u.l. off the reach. A shorter Sniper " +
             "you can actually field on wave one.",
      cost: 13,
      requires: ["lng_armoury"],
      at: { x: -2, y: 0 },
      effects: { price: { mul: 0.90 }, add: { range: -25 } }
    },

    {
      id: "lng_ballistics",
      name: "Ballistic Doctrine",
      blurb: "+40 percentage points of crit damage. Needs the heavy slug AND " +
             "the ranging reticle: a big shot and a reason to land it twice.",
      cost: 30,
      minLevel: 3,
      requires: ["lng_heavy", "lng_ranging"],
      at: { x: 1.7, y: -1.7 },
      effects: { add: { critDamage: 40 } }
    },
    {
      id: "lng_overwatch",
      name: "Overwatch",
      blurb: "+45 u.l. of reach and +60 hit points. The Sniper that sits in " +
             "the back corner and covers the whole approach.",
      cost: 24,
      minLevel: 4,
      requires: ["lng_rapid"],
      at: { x: 2.8, y: 1.4 },
      effects: { add: { range: 45, hp: 60 } }
    },
    {
      id: "lng_arclance",
      name: "Arc Lance",
      blurb: "One more body pierced a shot, +250 mana on the price. Needs the " +
             "ballistic doctrine and overwatch both.",
      cost: 44,
      minLevel: 5,
      requires: ["lng_ballistics", "lng_overwatch"],
      at: { x: 0, y: 3.2 },
      effects: { add: { pierce: 1 }, price: { add: 250 } }
    }
  ]
});
