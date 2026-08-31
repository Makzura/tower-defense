// ---------------------------------------------------------------------------
// The Siphon's permanent tree — the owner's confirmed content (2026-08-31)
//
// FOURTEEN NODES, ALL ROOTS, AND THE BRANCHES ARE DELIBERATELY UNFINISHED:
//
//   north  the general upper branch -- 4, one more undesigned
//   south  the general lower branch -- 2, three more undesigned
//   west   path A -- 4 (`Capital Bound` is not confirmed)
//   east   path B -- 4, one more undesigned (`Blood Triage` is rejected)
//
// REJECTED NAMES ARE NOT HERE AND MUST NOT BE ADDED: `Capital Bound`,
// `Blood Triage`, `Initial Overpressure`, `Tight Base`, `Survival Valve`,
// `Close Circuit`, and the old `Double Polarity` anti-flying package that
// `Camo Polarity` replaces.
//
// THIS IS A CONFIG-DRIVEN TOWER, so every field below is a name out of
// `js/towers/beam.config.js` -- `ad`, `attackRate`, `range`, `hp`,
// `maxTargets`, `seesCamo`, `reacquireDelay`, `damageMult`,
// `incomingDamageMult` -- and never one of the adapter's own. Five nodes reach
// a MECHANIC PARAMETER through a dotted path (`mechanics.<name>.<param>`); see
// js/systems/tower-perks.js for why that is safe.
//
// **DAMAGE GOES THROUGH `damageMult`, NEVER THROUGH `ad`.** A5 adds its
// gold-scaled bonus to `ad` AFTER the resolve (see `effectiveAD`), so a factor
// on the stat would miss most of a finished Siphon's damage. Four nodes
// multiply `damageMult` and they compose by multiplying, which is what the
// confirmed content asks for.
//
// **THE RAMP CAP IS THE BONUS ABOVE 1.** The design figures are final
// multipliers -- x3.0, x2.7, x3.5, x3.2 -- and `rampCap` is 2.0, 1.7, 2.5, 2.2.
// Getting that backwards would turn a nerf into a buff.
//
// EVERY NODE IS minLevel 0 and every one is a root: no prerequisite has been
// authored, and inventing one would be a design decision made by the
// implementation. **The `id` is the persistence format.**
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "siphon",
  nodes: [

    // === general upper ======================================================

    // 1.08 x 0.97 = 1.0476, and FRACTIONS ARE THE NODE. The Siphon's base is
    // 1 damage ten times a second; a tick rounded back to 1 would make this
    // worth nothing at all, and `damageTick` deliberately never rounds.
    {
      id: "sip_n1",
      name: "Runic Pressure",
      icon: 0,
      blurb: "+8% beam damage, −3% tick rate — about +4.8% DPS. Death denial " +
             "and every other utility effect are untouched.",
      cost: 100,
      minLevel: 0,
      at: { x: 0, y: -1 },
      effects: { mul: { damageMult: 1.08, attackRate: 0.97 } }
    },

    {
      id: "sip_n2",
      name: "Long Conduits",
      icon: 1,
      blurb: "+12 u.l. base range (75 → 87). −15% maximum tower health.",
      cost: 90,
      minLevel: 0,
      at: { x: 0, y: -2 },
      effects: { add: { range: 12 }, mul: { hp: 0.85 } }
    },

    // DETECTION AND NOTHING ELSE. It replaced a rejected package that also
    // granted flying sight and carried a damage matchup; neither is here. B1
    // still grants camo on its own, and a Siphon carrying both simply has it
    // from the moment it is placed rather than from 400 mana in.
    {
      id: "sip_n3",
      name: "Camo Polarity",
      icon: 2,
      blurb: "Sees and targets camo enemies from placement, without B1. " +
             "Placement 800 → 875. No flying detection and no damage change.",
      cost: 120,
      minLevel: 0,
      at: { x: 0, y: -3 },
      effects: { set: { seesCamo: true }, price: { add: 75 } }
    },

    // `rampStart` IS A FLOOR ON THE BONUS, so a fresh lock opens at x1.25 and
    // then climbs toward the SAME cap -- what this buys is the first second of
    // the climb, never a higher ceiling. The delay is charged per genuine
    // acquisition: a full beam and a beam keeping the target it already had
    // both pay nothing. See `updateLocks`.
    {
      id: "sip_n4",
      name: "Preloaded Lock",
      icon: 3,
      blurb: "A new target starts at ×1.25 ramp instead of ×1. Every new lock " +
             "takes 0.30 s to establish; holding one costs nothing.",
      cost: 110,
      minLevel: 0,
      at: { x: 0, y: -4 },
      effects: {
        set: { "mechanics.ramp_per_target.rampStart": 0.25, reacquireDelay: 0.30 }
      }
    },

    // === general lower ======================================================

    {
      id: "sip_s1",
      name: "Light Basin",
      icon: 4,
      blurb: "Placement 800 → 675. −25% maximum tower health.",
      cost: 60,
      minLevel: 0,
      at: { x: 0, y: 1 },
      effects: { price: { add: -125 }, mul: { hp: 0.75 } }
    },

    // INCOMING-DAMAGE REDUCTION, and deliberately not extra health, armor,
    // defence, healing or immunity: the blow is smaller and the tower's own
    // numbers are unchanged.
    {
      id: "sip_s2",
      name: "Ceramic Coating",
      icon: 5,
      blurb: "Takes 30% less damage. Deals 5% less. Not extra health — the " +
             "hits themselves are smaller.",
      cost: 100,
      minLevel: 0,
      at: { x: 0, y: 2 },
      effects: { set: { incomingDamageMult: 0.70 }, mul: { damageMult: 0.95 } }
    },

    // === path A =============================================================

    // A FASTER PAYOFF AND A LOWER CEILING, and the old cap is NOT kept beside
    // the faster rate. Two groups because A4 replaces A1's pair wholesale, the
    // same way the tier itself does; the later group wins, so a tower at A4
    // reads 0.27 / 2.2 and one at A3 reads 0.22 / 1.7.
    //
    // Five uninterrupted seconds at A5: 1 + 0.27 x 5 = x2.35 where the ordinary
    // tower reads x2.00, and the capped ceiling is x3.2 against x3.5.
    {
      id: "sip_a1",
      name: "Brutal Primer",
      icon: 6,
      blurb: "Ramp climbs at +0.22/s to ×2.7 (A1–A3) or +0.27/s to ×3.2 " +
             "(A4–A5), instead of +0.15 to ×3.0 and +0.20 to ×3.5. Faster to " +
             "arrive, about 8.6% lower at the cap.",
      cost: 100,
      minLevel: 0,
      at: { x: -1, y: 0 },
      effects: {
        when: [
          { has: "hasA1", set: { "mechanics.ramp_per_target.rampRate": 0.22,
                                 "mechanics.ramp_per_target.rampCap": 1.7 } },
          { has: "hasA4", set: { "mechanics.ramp_per_target.rampRate": 0.27,
                                 "mechanics.ramp_per_target.rampCap": 2.2 } }
        ]
      }
    },

    // PERCENTAGE DEFENCE ONLY. `defPierce` is a FRACTION of `defense` and never
    // touches flat `armor` (js/systems/mitigation.js), which is what makes this
    // a hard counter to a defended body and nothing at all to a plated one:
    // −5% against an undefended enemy, about +6.4% against one at 50% defence.
    {
      id: "sip_a2",
      name: "Selective Drain",
      icon: 7,
      blurb: "Path A's defence pierce 25% → 40%. −5% beam damage. It ignores " +
             "percentage defence only, never flat armor.",
      cost: 120,
      minLevel: 0,
      at: { x: -2, y: 0 },
      effects: {
        set: { "mechanics.def_pierce.defPierce": 0.40 },
        mul: { damageMult: 0.95 }
      }
    },

    // EVERY THRESHOLD, from one number. `threshold(n) = firstThreshold x
    // growth^(n-1)`, so a factor on the first scales the whole ladder by 15%
    // and the charge count, the ordering and the banking are untouched.
    {
      id: "sip_a3",
      name: "Greedy Capacitor",
      icon: 8,
      blurb: "Every A3 charge threshold is 15% lower, so charges arrive " +
             "sooner. Each one is worth 0.42 mana instead of 0.50 — 16% less.",
      cost: 130,
      minLevel: 0,
      at: { x: -3, y: 0 },
      effects: {
        mul: { "mechanics.charge_to_gold.firstThreshold": 0.85 },
        set: { "mechanics.charge_to_gold.perCharge": 0.42 }
      }
    },

    // The threshold and the qualification rule are A4's own and are untouched:
    // this moves the size of the bonus and nothing about who earns it.
    {
      id: "sip_a4",
      name: "Vital Flow",
      icon: 9,
      blurb: "A4+ only: the high-health bonus is +40% instead of +30%. " +
             "−15 u.l. range, at A5 too.",
      cost: 150,
      minLevel: 0,
      at: { x: -4, y: 0 },
      effects: {
        when: [{ has: "hasA4",
                 set: { "mechanics.hp_scaling.maxBonus": 0.40 },
                 add: { range: -15 } }]
      }
    },

    // === path B =============================================================

    // THE RATE, NOT THE DAMAGE. A −5% written onto the beam's damage would heal
    // 5% less as well, which is the opposite of the node: slower ticks each
    // steal a fifth more, so the sustained result is about −5% DPS and +14%
    // healing a second. Nothing here rounds either figure.
    {
      id: "sip_b1",
      name: "Dense Transfusion",
      icon: 0,
      blurb: "B3+ only: lifesteal ×1.20 (30% → 36% at B5). −5% tick rate. " +
             "About −5% DPS for about +14% healing a second.",
      cost: 100,
      minLevel: 0,
      at: { x: 1, y: 0 },
      effects: {
        when: [{ has: "hasB3",
                 mul: { "mechanics.lifesteal.ratio": 1.20, attackRate: 0.95 } }]
      }
    },

    // SIXTY IS AN ABSOLUTE, and it is gated on B5 so B1–B4 keep their authored
    // ladder exactly. With every slot full the ceiling is about +8%; with fifty
    // or fewer bodies in reach it is a straight −10%.
    {
      id: "sip_b2",
      name: "Voracious Fan",
      icon: 1,
      blurb: "B5 only: 60 simultaneous targets instead of 50, and +5 u.l. " +
             "range. −10% beam damage — a loss until the sixtieth beam is lit.",
      cost: 140,
      minLevel: 0,
      at: { x: 2, y: 0 },
      effects: {
        when: [{ has: "hasB5",
                 set: { maxTargets: 60 },
                 mul: { damageMult: 0.90 },
                 add: { range: 5 } }]
      }
    },

    // The slow's application, its refresh, the target lock and every immunity
    // rule are B2's and are untouched: this moves one fraction.
    {
      id: "sip_b3",
      name: "Viscous Slow",
      icon: 2,
      blurb: "B4+ only: the beam's slow is 22% instead of 15%. −15 u.l. range.",
      cost: 130,
      minLevel: 0,
      at: { x: 3, y: 0 },
      effects: {
        when: [{ has: "hasB4",
                 set: { "mechanics.slow.fraction": 0.22 },
                 add: { range: -15 } }]
      }
    },

    // STILL ONE SAVE, and still one per game. This node buys nothing about how
    // often death denial fires -- it moves how far the rewind drags and what
    // the base is left standing on, and it charges 1 500 mana for B5.
    {
      id: "sip_b4",
      name: "Second Wind",
      icon: 3,
      blurb: "B5's death denial drags every enemy back 650 u.l. instead of " +
             "500 and leaves the base on 50 HP instead of 1. B5 costs 6 500 " +
             "mana instead of 5 000. Still one save, still one per game.",
      cost: 220,
      minLevel: 0,
      at: { x: 4, y: 0 },
      effects: {
        when: [{ has: "hasB5",
                 set: { "mechanics.death_denial.knockbackUl": 650,
                        "mechanics.death_denial.restoreBaseHpTo": 50 } }],
        tiers: { B5: { cost: 1500 } }
      }
    }
  ]
});
