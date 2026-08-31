// ---------------------------------------------------------------------------
// The Farm's permanent tree — the owner's confirmed content (2026-08-31)
//
// THIRTEEN NODES, ONE CHAIN PER ARM, AND THE BRANCHES ARE DELIBERATELY UNFINISHED:
//
//   north  the general upper branch -- 4, one more undesigned
//   south  PATH C, which REPLACES the lower-general branch on this tower --
//          3, two more undesigned
//   west   path A -- 3, two more undesigned
//   east   path B -- 3, two more undesigned
//
// THE FARM IS THE ONLY TOWER WITH THREE IN-RUN PATHS, so its four permanent
// sections are A, B, the general upper branch, and C. There is no separate
// lower-general branch: C occupies the south arm.
//
// REJECTED NAMES ARE NOT HERE AND MUST NOT BE ADDED: `Pressurized Reserve`,
// `Sealed Vault`, `Aggressive Tithe`, `Fortified Dividends`,
// `Reinforced Structure`, `Ascending Dice`, `Banker's Stop`.
//
// **A FARM HAS EIGHT KINDS OF MANA AND THEY ARE NOT ONE QUANTITY**: the fixed
// per-wave payment, A3+ timed ticks, mana already STORED, the A4/A5 clone, a
// withdrawal, the B path's kill bounty, the C network's B and P, and a refund.
// They merely share a unit. Every node below names exactly which it touches,
// and the fields it writes are documented one by one in `recalcStats`.
//
// **PRODUCTION MEANS THE FIXED PAYMENT AND THE TIMED TICKS**, and nothing else:
// the clone, a withdrawal, a kill bounty and a refund are not production and no
// node here scales them. That is the rule `productionScale` states once.
//
// EVERY NODE IS minLevel 0. **The `id` is the persistence format.**
//
// **EACH ARM IS A CHAIN** (2026-08-31, at the owner's word). The node beside
// the tower is that branch's root; every node further out REQUIRES the one
// before it, so a branch is bought from the centre outwards and cannot be
// skipped into. The tree screen draws its links straight off `requires` -- a
// root to the tower, a child to its parent -- so moving a prerequisite here
// moves the line and the lock together, and nothing has to be told twice.
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "farm",
  nodes: [

    // === general upper ======================================================

    // `preAdd` PUTS THE THIRTY IN BEFORE THE MULTIPLIERS, which is what makes
    // the confirmed arithmetic come out: a base Farm with Accelerated Boiler
    // reads (200 + 30) x 0.90 = 207 a wave, and with Paralyzing Field as well
    // (200 + 30) x 0.81. It follows the Farm's ordinary destination -- paid
    // straight out at low tiers, into the stock from A4 -- because it is added
    // to the per-wave figure itself and not to a payment.
    {
      id: "frm_n1",
      name: "Arcane Fertilizer",
      icon: 0,
      blurb: "+30 mana of fixed production a wave (200 → 230 at base). " +
             "Placement 1 200 → 1 350. Timed ticks, cloning and kill mana are " +
             "untouched.",
      cost: 90,
      minLevel: 0,
      at: { x: 0, y: -1 },
      effects: {
        preAdd: { perWaveProduction: 30 },
        price: { add: 150 }
      }
    },

    // FOOTPRINT IS THE GROUND IT STANDS ON and nothing else: not its field's
    // radius, not the drawn model. 35 → 28 at base, and C1's 25 → 20.
    {
      id: "frm_n2",
      name: "Compact Estate",
      icon: 1,
      blurb: "Takes 20% less ground (35 → 28 u.l., or 25 → 20 with C1), so it " +
             "fits where it could not. −10% maximum health. Its field's radius " +
             "and the model are unchanged.",
      cost: 100,
      minLevel: 0,
      requires: ["frm_n1"],
      at: { x: 0, y: -2 },
      effects: {
        mul: { footprintRadiusUl: 0.80, maxHp: 0.90 }
      }
    },

    // A BETTER RATE ON WHAT IS REFUNDABLE, and C5's 250 000 is still sunk --
    // `sellValue` subtracts what is unrefundable BEFORE the rate, so a better
    // rate cannot buy any of it back. The output penalty is on PRODUCTION only:
    // a refund is not production, and neither is stored mana coming out.
    {
      id: "frm_n3",
      name: "Liquid License",
      icon: 2,
      blurb: "Selling this Farm refunds 70% instead of 50%. It produces 8% " +
             "less. C5 stays entirely non-refundable, and a withdrawal is not " +
             "production.",
      cost: 110,
      minLevel: 0,
      requires: ["frm_n2"],
      at: { x: 0, y: -3 },
      effects: {
        set: { sellRefundRate: 0.70 },
        mul: { outputMult: 0.92 }
      }
    },

    // ALONE IT IS A PENALTY. Every other LIVING farm on the board pays three
    // points back, to a ceiling of twelve, so the band is −5% to +7% and five
    // farms is the most that counts. It reads how many others are standing and
    // nothing about what they make, so it can neither count itself nor compound
    // against another farm's already-modified output -- and a farm that dies or
    // is sold stops counting on the next payment.
    {
      id: "frm_n4",
      name: "Consortium",
      icon: 3,
      blurb: "−5% production alone; +3 points for each other living Farm, up " +
             "to +12 — so −5% to +7%. Counts other Farms only, whatever path " +
             "they took.",
      cost: 120,
      minLevel: 0,
      requires: ["frm_n3"],
      at: { x: 0, y: -4 },
      effects: {
        set: { consortiumSolo: -0.05, consortiumPer: 0.03, consortiumCap: 0.12 }
      }
    },

    // === path A =============================================================

    // THE CLOCK, NOT THE TICK. A tick still pays what its tier says; it simply
    // arrives every 4.5 s. The ten per cent comes off the FIXED per-wave
    // payment alone -- not the tick's value, not stored mana, not the cloning
    // rate, not the cap, not the amount cloned once it is calculated, not a
    // withdrawal, and nothing in the C network.
    //
    // The benefit therefore scales with how long a wave runs: about +2.7% over
    // sixty seconds at A3+A2 and about +7.3% at A5+A2, and less on a short one.
    {
      id: "frm_a1",
      name: "Accelerated Boiler",
      icon: 4,
      blurb: "A3+ only: a timed tick every 4.5 s instead of 5. Fixed per-wave " +
             "production is 10% lower. Tick value, storage, cloning and " +
             "withdrawals are untouched.",
      cost: 100,
      minLevel: 0,
      at: { x: -1, y: 0 },
      effects: {
        when: [{ has: "hasA3",
                 set: { tickSeconds: 4.5 },
                 mul: { perWaveProduction: 0.90 } }]
      }
    },

    // THE PERMANENT HALF UP, THE TEMPORARY HALF DOWN. Tranche size, how many
    // there are, how long a surge lasts, the controls and the refund rules are
    // all A5's own. At ten tranches: +60% permanent instead of +50%, and +240%
    // for thirty seconds instead of +250%.
    {
      id: "frm_a2",
      name: "Patient Investment",
      icon: 5,
      blurb: "A5 only: each invested tranche is worth +6% permanently instead " +
             "of +5%, but a surge multiplies it ×4 instead of ×5. At ten " +
             "tranches: +60% permanent, +240% temporary.",
      cost: 160,
      minLevel: 0,
      requires: ["frm_a1"],
      at: { x: -2, y: 0 },
      effects: {
        when: [{ has: "hasA5", set: { trancheBonus: 0.06, tempMultiplier: 4 } }]
      }
    },

    // ITS OWN VAULT, BURNT TO MAKE A HIT SMALLER. Fifty stored mana buys one
    // point prevented and no blow may be more than halved; a vault that cannot
    // afford the whole half buys what it can and the rest lands. It never
    // spends the player's purse or another Farm's stock, and it protects the
    // FARM rather than the base.
    {
      id: "frm_a3",
      name: "Mana Armor",
      icon: 6,
      blurb: "A4+ only: while it has stored mana, this Farm takes up to 50% " +
             "less damage — 50 stored mana burnt for each point prevented. An " +
             "empty vault protects nothing.",
      cost: 180,
      minLevel: 0,
      requires: ["frm_a2"],
      at: { x: -3, y: 0 },
      effects: {
        when: [{ has: "hasA4", set: { manaArmorPerPoint: 50, manaArmorMax: 0.50 } }]
      }
    },

    // === path B =============================================================

    // THIRTY MORE UNITS OF CIRCLE FROM B3, AND THE AMPLIFICATION PAYS FOR IT
    // FROM B4. B4 reads 230 u.l. and 0% -- an explicit zero, not a missing
    // modifier -- and B5 reads 330 and 5%. The kill reward and the slow are
    // other numbers and this node does not touch either.
    {
      id: "frm_b1",
      name: "Extended Jurisdiction",
      icon: 7,
      blurb: "B3+ only: +30 u.l. of field radius (B4 200 → 230, B5 300 → 330). " +
             "At B4 and B5 the damage amplification drops 5 points — B4 to 0%, " +
             "B5 to 5%. Kill mana and slow are unchanged.",
      cost: 110,
      minLevel: 0,
      at: { x: 1, y: 0 },
      effects: {
        when: [
          { has: "hasB3", add: { rangeUl: 30 } },
          { has: "hasB4", add: { fieldAmp: -0.05 } }
        ]
      }
    },

    // FIVE POINTS OF SLOW, paid for out of the FIXED per-wave payment only:
    // not the kill bounty, not the base hit points a kill grants, not a tick.
    {
      id: "frm_b2",
      name: "Paralyzing Field",
      icon: 8,
      blurb: "B4+ only: the field slows 5 points harder (B4 5% → 10%, B5 10% " +
             "→ 15%). This Farm's fixed per-wave production is 10% lower. Kill " +
             "mana and base HP per kill are untouched.",
      cost: 130,
      minLevel: 0,
      requires: ["frm_b1"],
      at: { x: 2, y: 0 },
      effects: {
        when: [{ has: "hasB4", add: { fieldSlow: 0.05 } }],
        mul: { perWaveProduction: 0.90 }
      }
    },

    // A WIDER NET FOR A SMALLER PURSE. Only the two threshold constants move --
    // the rule that takes the HIGHER of them is B5's own -- and the 9 maximum
    // base HP a kill grants is a different number and is untouched.
    {
      id: "frm_b3",
      name: "Execution Tithe",
      icon: 9,
      blurb: "B5 only: executes below 15 HP or 7.5% of maximum, instead of 10 " +
             "or 5%. Pays 10 mana a kill instead of 14. Base HP per kill is " +
             "unchanged at 9.",
      cost: 150,
      minLevel: 0,
      requires: ["frm_b2"],
      at: { x: 3, y: 0 },
      effects: {
        when: [{ has: "hasB5",
                 set: { executeFlat: 15, executeFraction: 0.075 },
                 add: { manaPerKill: -4 } }]
      }
    },

    // === path C — which replaces the lower-general branch ===================

    // THE TWO ENDS OF THE TABLE, BOTH HALVED. A natural 1 loses half as much;
    // the natural maximum gains half as much. **Qualification is the face the
    // die THREW**: a 19 walked up to 20 by a face-14 charge is not protected,
    // while a genuine 20 stays protected however a queued modifier later
    // changes what it is worth.
    //
    // C5's face 22 keeps its purge in full -- what is halved is the numeric
    // half of a face, never a deferred effect.
    {
      id: "frm_c1",
      name: "Jet Protected",
      icon: 0,
      blurb: "A natural 1 costs half as much; the natural highest face gives " +
             "half as much (C3's 20: +300/+10% → +150/+5%; C5's 22: ×2 → " +
             "×1.5). Face 22 still purges everything under 9.",
      cost: 100,
      minLevel: 0,
      at: { x: 0, y: 1 },
      effects: { set: { diceProtectNatural: 1 } }
    },

    // MEET IN THE MIDDLE INSTEAD OF STARTING OVER. Better than the ordinary
    // reset whenever P is above B and worse whenever it is below, which is the
    // trade rather than a flaw. Sequential resolution is preserved: a later die
    // in the same series sees the P this one produced.
    {
      id: "frm_c2",
      name: "Amortized Reset",
      icon: 1,
      blurb: "Face 8 sets the pool to halfway between P and B instead of " +
             "resetting it to B. Better when the pool is above baseline, worse " +
             "when it is below.",
      cost: 120,
      minLevel: 0,
      requires: ["frm_c1"],
      at: { x: 0, y: 2 },
      effects: { set: { diceAmortizedReset: 1 } }
    },

    // ONE MORE DIE, AND EVERY DIE WORTH THREE QUARTERS -- including the added
    // one. C3 rolls 2, C4 rolls 3, C5 rolls 4. A x2 becomes x1.75, because only
    // the bonus ABOVE one is scaled; resets, rerolls, queued modifiers and
    // purges are deferred effects and stay whole.
    //
    // Beside Jet Protected the two compose multiplicatively, so a protected
    // natural maximum keeps 37.5% of its numeric value and C5's face 22 reads
    // x1.375.
    {
      id: "frm_c3",
      name: "Extra Die",
      icon: 2,
      blurb: "C3+ only: one more die every wave (C3 2, C4 3, C5 4). Every " +
             "ordinary gain and loss from this Farm's dice is worth 75% — a ×2 " +
             "becomes ×1.75. Resets, rerolls and purges are unaffected.",
      cost: 180,
      minLevel: 0,
      requires: ["frm_c2"],
      at: { x: 0, y: 3 },
      effects: {
        when: [{ has: "hasC3", add: { diceCount: 1 }, set: { diceGainScale: 0.75 } }]
      }
    }
  ]
});
