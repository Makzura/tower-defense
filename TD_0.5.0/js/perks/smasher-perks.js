// ---------------------------------------------------------------------------
// The Warbringer's permanent tree — the owner's confirmed content
//
// THIRTEEN NODES, ONE CHAIN PER ARM, AND THE BRANCHES ARE DELIBERATELY
// UNFINISHED. This replaced the five-node first pass on 2026-08-31; every
// number below is the owner's own, out of the confirmed list, and nothing here
// was invented to fill a gap.
//
//   north  the general upper branch -- 3
//   south  the general lower branch -- 3
//   west   path A -- 4, one of which is the CHILD behind the first
//   east   path B -- 3 ("Deep Epicenter" was proposed and never confirmed)
//
// REJECTED NAMES ARE NOT HERE AND MUST NOT BE ADDED: `Crowd Momentum`,
// `Fault Counter`, `Broad Sweep`, `Tempered Body`, `Compact Footing` and
// `Braced Recovery` were all turned down. Do not extend the branches.
//
// **EACH ARM IS A CHAIN** (2026-08-31, at the owner's word). The node beside
// the tower is that branch's root; every node further out REQUIRES the one
// before it, so a branch is bought from the centre outwards and cannot be
// skipped into. The tree screen draws its links straight off `requires` -- a
// root to the tower, a child to its parent -- so moving a prerequisite here
// moves the line and the lock together, and nothing has to be told twice.
//
// **A PREREQUISITE GATES THE PURCHASE AND NOTHING ELSE.** Once bought, a node
// may be EQUIPPED on its own, without its parent in a slot -- a player who
// wants `war_a2`'s discount and not `war_a1`'s speed spends one slot and gets
// exactly that.
//
// **THE `id` IS THE PERSISTENCE FORMAT.** The five ids that predate this pass
// (`war_n1`, `war_a1`, `war_a2`, `war_b1`, `war_s1`) are KEPT and only their
// display names changed. The name and the icon are free at any time.
//
// EVERY NODE IS minLevel 0: all thirteen are buyable the moment the tower is
// owned and the coins (and, for the child, the parent) are there. None can be
// EQUIPPED until the Warbringer reaches level 1.
//
// EVERY FIELD WRITTEN BELOW IS DECLARED NEUTRAL IN `Smasher.recalcStats`.
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "smasher",
  nodes: [

    // === general upper ======================================================

    {
      id: "war_n1",
      name: "Long Haft",
      icon: 0,
      blurb: "+5 u.l. base range (40 → 45). Placement 600 → 700.",
      cost: 100,
      minLevel: 0,
      at: { x: 0, y: -1 },
      effects: { add: { rangeUl: 5 }, price: { add: 100 } }
    },

    // `preAdd`, AND THAT IS THE WHOLE POINT OF THE FIELD. The node says the
    // third of a second goes on the resolved cycle BEFORE any later attack-rate
    // multiplier -- so with Light Haft also equipped a base Warbringer swings
    // every (3.2 + 0.3) / 1.1 = 3.18 s, not 3.2 / 1.1 + 0.3 = 3.21. The
    // difference is small and it is the difference between doing what the node
    // says and not; see the note on `preAdd` in js/systems/tower-perks.js.
    //
    // THE REVERSAL IS THE TRADE, not a bug to correct: four more damage per
    // swing beats early armor breakpoints outright, and a third of a second on
    // a 2.1 s late-tier cycle costs more DPS than the four points buy back.
    {
      id: "war_n2",
      name: "Dense Hammerhead",
      icon: 1,
      blurb: "+4 base swing damage (14 → 18). Every swing cycle is 0.30 s " +
             "longer, applied before any other rate change. Explosion and " +
             "earthquake unchanged.",
      cost: 110,
      minLevel: 0,
      requires: ["war_n1"],
      at: { x: 0, y: -2 },
      effects: {
        add: { damage: 4 },
        preAdd: { cooldownSeconds: 0.30 }
      }
    },

    // A HAMMER REGROUND TO FIND WHAT IS HIDING. `seesCamo` is what
    // Targeting.sees reads, and it is what lets a Warbringer START a swing on a
    // camo body -- the wedge always damaged them, it simply had no reason to
    // swing (see the note on `covers` in js/smasher.js).
    //
    // The matchup applies to the swing AND to the chain blast, because both are
    // damage credited to this tower. A camo body takes NORMAL damage: the node
    // buys the ability to hit it, never a bonus against it.
    {
      id: "war_n3",
      name: "Witchlight Dust",
      icon: 2,
      blurb: "This Warbringer can target camo enemies. Its swings and chain " +
             "blasts deal 15% less to everything that is not camo. Camo takes " +
             "normal damage, not more.",
      cost: 130,
      minLevel: 0,
      requires: ["war_n2"],
      at: { x: 0, y: -3 },
      effects: {
        set: { seesCamo: true },
        mul: { nonCamoDamageMult: 0.85 }
      }
    },

    // === general lower ======================================================

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
      name: "Extended Stance",
      icon: 3,
      blurb: "+17.5 u.l. base range (40 → 57.5). Placement 600 → 650. Path B " +
             "then gives +3 / +11 / +6 instead of +5 / +20 / +10, reading " +
             "60.5, 71.5, 71.5, 77.5, 92.5. No B price changes.",
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
    },

    // A MULTIPLIER ON THE CYCLE, NOT A RATE ADDED TO IT: "attacks per second
    // x 1.10" is the period divided by 1.1, which is what `mul` on
    // `cooldownSeconds` says. Contrast Redline Rhythm below, which adds an
    // absolute rate and therefore uses `addRate`.
    //
    // The two flat points come off the SWING and are clamped at zero by
    // `Smasher.attackDamage`; the chain blast is its own number and keeps it.
    {
      id: "war_s2",
      name: "Light Haft",
      icon: 4,
      blurb: "+10% attack speed. −2 swing damage (14 → 12), never below 0. " +
             "Explosion damage unchanged.",
      cost: 100,
      minLevel: 0,
      requires: ["war_s1"],
      at: { x: 0, y: 2 },
      effects: {
        mul: { cooldownSeconds: 1 / 1.1 },
        add: { damage: -2 }
      }
    },

    // The 40 comes off `maxHp` after recalcStats has resolved it, and
    // `settleHp` clamps `currentHp` down with it rather than healing anything
    // -- see the note there on why a raise and a cut are not symmetric.
    {
      id: "war_s3",
      name: "Salvaged Anvil",
      icon: 5,
      blurb: "Placement 600 → 500. −40 maximum health (150 → 110).",
      cost: 90,
      minLevel: 0,
      requires: ["war_s2"],
      at: { x: 0, y: 3 },
      effects: {
        price: { add: -100 },
        add: { maxHp: -40 }
      }
    },

    // === path A =============================================================

    // `addRate`, NOT A SUBTRACTION FROM THE COOLDOWN, and the distinction is
    // half the node. The Warbringer stores its speed as a PERIOD; the owner's
    // figure is a RATE. `1/(1/f + 0.15)` is "whatever rate this tower actually
    // reached, plus 0.15 a second", which is correct on a pure A path (3.00 s
    // = 0.333/s becomes 0.483/s = 2.07 s) and stays correct on any crosspath
    // that arrives at A4 with a different swing.
    //
    // A1, A2 and A3 get nothing, and neither does the base: BOTH halves begin
    // at A4 and persist through A5, which is what `hasA4` staying true after A5
    // is bought gives for free. The range penalty is inside the same group as
    // the speed on purpose -- a tier that paid the cost without the benefit
    // would be the dishonest half of the trade.
    {
      id: "war_a1",
      name: "Redline Rhythm",
      icon: 6,
      blurb: "A4+ only: +0.15 attacks a second (0.33 → 0.48 on a pure path A) " +
             "and −10% range. A4 costs +250 mana; A5 costs no more. Nothing " +
             "before A4.",
      cost: 120,
      minLevel: 0,
      at: { x: -1, y: 0 },
      effects: {
        when: [{
          has: "hasA4",
          addRate: { cooldownSeconds: 0.15 },
          mul: { rangeUl: 0.90 }
        }],
        tiers: { A4: { cost: 250 } }
      }
    },

    // Bought only after the west root; EQUIPPED independently of it. A player
    // who wants the discount and not the speed spends one slot and gets exactly
    // that, which is the rule stated at the top of this file.
    {
      id: "war_a2",
      name: "Forgemaster's Schedule",
      icon: 7,
      blurb: "A1 to A4 each cost 50 less mana. A5 unchanged. No stat changes.",
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

    // HALF THE RADIUS, NOT HALF THE AREA. An enemy at 0.6 of the reach is in
    // the outer half even though most of the circle is behind it -- which is
    // what makes the node a reason to stand close to the road rather than a
    // free bonus. `Smasher.swingDamageAgainst` measures the radial distance.
    //
    // It stays meaningful after A4 turns the wedge into a full circle, because
    // it was never about the arc.
    {
      id: "war_a3",
      name: "Centered Blow",
      icon: 8,
      blurb: "+35% swing damage to enemies inside half the damage radius, −10% " +
             "to those beyond it. Measured by distance, not area. Chain blasts " +
             "and the earthquake are unaffected.",
      cost: 130,
      minLevel: 0,
      requires: ["war_a2"],
      at: { x: -3, y: 0 },
      effects: {
        set: { swingInnerMult: 1.35, swingOuterMult: 0.90 }
      }
    },

    // THE ONLY THING IN THE GAME THAT EDITS AN ENEMY'S STORED ARMOR, and it is
    // deliberate: this is not pierce, which clamps a value for one hit and
    // leaves the body untouched (js/systems/mitigation.js). The plate is really
    // filed down, for that body's remaining life, one point per direct hit, and
    // every tower on the board benefits from it afterwards.
    //
    // The current hit meets the armor that was there before it, because
    // `swing` fractures AFTER the damage lands. Blasts, the earthquake and
    // every other source never fracture.
    {
      id: "war_a4",
      name: "Fracture Stamp",
      icon: 9,
      blurb: "A4+ only: −10% swing damage, but every direct hit permanently " +
             "strips 1 point of flat armor from that enemy (never below 0). " +
             "The hit that strips it still met the old armor.",
      cost: 180,
      minLevel: 0,
      requires: ["war_a3"],
      at: { x: -4, y: 0 },
      effects: {
        when: [{ has: "hasA4", mul: { damage: 0.90 }, set: { fractureArmor: 1 } }]
      }
    },

    // === path B =============================================================

    // THREE GROUPS THAT ACCUMULATE, because the Warbringer's B damage is
    // additive: at B2 the tower carries +1 from this node, at B3 +2, and at B4
    // and B5 +3. The blast rides on B4's group so it is 18 from B4 and stays 18
    // through B5.
    //
    // The blast's radius, its chaining and everything else about path B are
    // untouched: this node moves two numbers and pays for them on three tiers.
    {
      id: "war_b1",
      name: "Kiln Resonance",
      icon: 0,
      blurb: "B2, B3 and B4 each add 1 more damage — +3 in all by B4. Chain " +
             "blast 15 → 18. Those three tiers cost +50 mana each. B5 is " +
             "untouched.",
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

    // THE SECOND FOLLOWS THE SLOW WHEREVER IT GOES, including down a B4/B5
    // chain -- a propagated slow is still this Warbringer's slow, and
    // `Smasher.slowSeconds` is the one function both the swing and the
    // explosion quote.
    //
    // The two damage points come off the SWING only. The blast is its own
    // number and this node does not touch it; the earthquake's own slow is a
    // separate constant and is not a B3+ tier slow.
    {
      id: "war_b2",
      name: "Long Echo",
      icon: 1,
      blurb: "Every B3+ slow lasts 1 s longer, chain blasts included. −2 swing " +
             "damage, never below 0. Explosion damage unchanged.",
      cost: 110,
      minLevel: 0,
      requires: ["war_b1"],
      at: { x: 2, y: 0 },
      effects: {
        add: { slowBonusSeconds: 1, damage: -2 }
      }
    },

    // THE THREE COME OFF AFTER EVERY POSITIVE BONUS, which falls out of `add`
    // summing rather than needing an order: Kiln Resonance's +3 and this -3
    // reach `explosionDamage` in the same pass, so the pair resolves to the
    // authored 15 with a fifth more radius, and either alone reads 18 or 12.
    //
    // Radius only on the BLAST. The swing's reach, the slow's reach and the
    // earthquake's coverage are all other numbers and none of them is here.
    {
      id: "war_b3",
      name: "Wide Fracture",
      icon: 2,
      blurb: "Chain blasts reach 20% further (18.75 → 22.5 u.l.) and deal 3 " +
             "less. With Kiln Resonance the blast is back to 15 at the wider " +
             "radius. Swings and the earthquake are unaffected.",
      cost: 140,
      minLevel: 0,
      requires: ["war_b2"],
      at: { x: 3, y: 0 },
      effects: {
        mul: { explosionRadiusUl: 1.20 },
        add: { explosionDamage: -3 }
      }
    }
  ]
});
