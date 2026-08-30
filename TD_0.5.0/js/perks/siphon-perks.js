// ---------------------------------------------------------------------------
// The Siphon's permanent tree
//
// THE OTHER CONFIG-DRIVEN TOWER, authored against `js/towers/beam.config.js`:
// `ad` (damage a tick), `attackRate` (ticks a second), `range`, `hp`,
// `maxTargets`, `reacquireDelay`, `seesFlying`.
//
// A CONTINUOUS BEAM IS A DIFFERENT ANIMAL FROM A GUN, and its tree says so:
// there is no crit to buy and no burst to tighten. What a Siphon has is a tick,
// a very short 75 u.l. reach, an economy of its own, and one thing no other
// tower in the game has -- it cannot see flying at all.
//
//   north  intensity   what one tick takes off
//   east   frequency   how many ticks a second
//   south  reach       75 u.l. is the shortest reach in the game
//   west   terms       800 mana against a 600 stake
//
// THE DEEP NODE CHANGES THE TOWER'S ROLE RATHER THAN ITS NUMBERS. `Prism Lens`
// hands the beam the sky, which is the one hole in it, at level 5 and for a
// price that makes it a decision rather than a default. It is the worked
// example of a perk that is not a stat.
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "siphon",
  nodes: [
    {
      id: "sip_intensity",
      name: "Focused Aperture",
      blurb: "+0.4 damage a tick. Ten ticks a second, so it is worth four " +
             "damage a second before any tier.",
      cost: 8,
      at: { x: 0, y: -1 },
      effects: { add: { ad: 0.4 } }
    },
    {
      id: "sip_frequency",
      name: "Tighter Pulse",
      blurb: "+15% ticks a second. The Siphon's damage is the product of two " +
             "numbers and this is the other one.",
      cost: 8,
      at: { x: 1, y: 0 },
      effects: { mul: { attackRate: 1.15 } }
    },
    {
      id: "sip_reach",
      name: "Extended Coil",
      blurb: "+15 u.l. of reach. On the shortest circle in the game that is a " +
             "fifth more road covered.",
      cost: 9,
      at: { x: 0, y: 1 },
      effects: { add: { range: 15 } }
    },
    {
      id: "sip_terms",
      name: "Salvage Terms",
      blurb: "Siphons cost 16% less. 800 mana is more than the opening stake; " +
             "672 is not.",
      cost: 9,
      at: { x: -1, y: 0 },
      effects: { price: { mul: 0.84 } }
    },

    {
      id: "sip_overcharge",
      name: "Overcharge",
      blurb: "+1.0 more damage a tick, 10% fewer ticks, and 100 mana on the " +
             "price. A heavier, slower drain.",
      cost: 16,
      minLevel: 2,
      requires: ["sip_intensity"],
      at: { x: 0, y: -2 },
      effects: {
        add: { ad: 1.0 }, mul: { attackRate: 0.90 }, price: { add: 100 }
      }
    },
    {
      id: "sip_cascade",
      name: "Cascade Timing",
      blurb: "+18% ticks again, and the beam reacquires 0.15 s sooner after a " +
             "target dies.",
      cost: 15,
      requires: ["sip_frequency"],
      at: { x: 2, y: 0 },
      effects: { mul: { attackRate: 1.18 }, add: { reacquireDelay: -0.15 } }
    },
    {
      id: "sip_lattice",
      name: "Anchor Lattice",
      blurb: "+25 u.l. more reach and +80 hit points. A Siphon that survives " +
             "standing as close to the road as it has to.",
      cost: 16,
      requires: ["sip_reach"],
      at: { x: 0, y: 2 },
      effects: { add: { range: 25, hp: 80 } }
    },
    {
      id: "sip_thrift",
      name: "Cut Coils",
      blurb: "10% cheaper again, and 0.3 less damage a tick. The wave-one " +
             "Siphon.",
      cost: 13,
      requires: ["sip_terms"],
      at: { x: -2, y: 0 },
      effects: { price: { mul: 0.90 }, add: { ad: -0.3 } }
    },

    {
      id: "sip_split",
      name: "Split Beam",
      blurb: "One more target held at once. Needs the overcharge AND the " +
             "cascade timing — a second beam is only worth having on a beam " +
             "that is already worth having.",
      cost: 32,
      minLevel: 3,
      requires: ["sip_overcharge", "sip_cascade"],
      at: { x: 1.7, y: -1.7 },
      effects: { add: { maxTargets: 1 } }
    },
    {
      id: "sip_ward",
      name: "Grounded Ward",
      blurb: "+150 hit points. The Siphon is a $800 tower standing in reach of " +
             "everything that attacks towers.",
      cost: 22,
      requires: ["sip_lattice"],
      at: { x: 1.7, y: 1.7 },
      effects: { add: { hp: 150 } }
    },
    {
      id: "sip_prism",
      name: "Prism Lens",
      blurb: "The beam can hold flying targets, for 300 more mana a tower. " +
             "The Siphon's one blind spot, closed — and the price is what " +
             "keeps that a choice rather than a default.",
      // NOT A NUMBER. `set` writes an absolute, which is what a flag needs and
      // what a delta cannot express. See the effects note in tower-perks.js.
      cost: 46,
      minLevel: 5,
      requires: ["sip_split", "sip_ward"],
      at: { x: 0, y: 3.2 },
      effects: { set: { seesFlying: true }, price: { add: 300 } }
    }
  ]
});
