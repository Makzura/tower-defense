// ---------------------------------------------------------------------------
// Tower config: tower_beam -- a continuous-beam tower with two paths.
//
// PURE DATA. Every number the spec gives lives here and nowhere else; the
// behaviour lives in js/systems/*.js and js/towers/beam-adapter.js.
//
// Mechanics are KEYS, not booleans baked into a tower class. A tier lists the
// modules it switches on (`mechanics`) and any parameters it sets
// (`setParams`); a later tier setting the same parameter REPLACES it, which is
// how A4 overwrites A1's ramp rate and B4 overwrites B3's lifesteal ratio.
//
// Distances are u.l., per js/units.js -- the same scale the sniper's 250 u.l.
// range is written in, which is the reference the spec asks for.
//
// SPEC DISCREPANCY, left as the spec wrote it and flagged rather than
// silently "fixed":
//
//   * The build table gives 2-5 an AD of 5. The per-tier deltas sum to 4
//     (base 1 + A2's +1 + B4's +1 + B5's +1). The deltas are implemented as
//     written, so a 2-5 build has AD 4. If 5 is intended, a tier needs
//     another +1.
//   * The spec itself flags that 2-5 comes to 125 range rather than 100.
//     Implemented as 125, per the deltas.
// ---------------------------------------------------------------------------

var TowerConfigs = typeof TowerConfigs !== "undefined" ? TowerConfigs : {};

TowerConfigs.beam = {

  id: "tower_beam",
  displayName: "Siphon",

  baseCost: 800,

  // ---- section 1: base stats ---------------------------------------------
  base: {
    ad: 1,
    attackRate: 10,        // damage ticks per second
    range: 75,             // u.l.
    hp: 250,
    footprint: 15,         // u.l. -- placement only, NEVER changes with tiers
    deadzone: 0,
    maxTargets: 1,
    aoe: false,
    pierce: false,
    crit: false,
    seesFlying: false,
    seesCamo: false,
    placement: "ground",
    unique: false,
    reacquireDelay: 0,

    // Present so the stat resolver has something to add deltas onto; the
    // beam has no cone, but the shared targeting system reads these.
    targetShape: "circle",
    coneArcDeg: 0
  },

  crosspath: {
    lockThreshold: 3,
    lockOtherAtTier: 2
  },

  // ---- section 3 & 4: the two paths --------------------------------------
  paths: {

    // ---- A: Siphon -- damage ramp, gold generation, gold-scaled power ----
    A: [
      { // A1
        tier: 1,
        cost: 600,
        statDeltas: { range: 25, hp: 50 },
        mechanics: ["ramp_per_target", "def_pierce"],
        setParams: {
          ramp_per_target: { rampRate: 0.15, rampCap: 2.0 },
          def_pierce: { defPierce: 0.25 }
        }
      },
      { // A2
        tier: 2,
        cost: 900,
        statDeltas: { ad: 1, range: 25, hp: 200 },
        mechanics: []
      },
      { // A3
        tier: 3,
        cost: 2500,
        statDeltas: { ad: 1, range: 25 },
        mechanics: ["charge_to_gold"],
        setParams: {
          charge_to_gold: {
            firstThreshold: 500,
            growth: 1.65,
            // One charge per 3 s out of combat, drained CONTINUOUSLY -- see
            // ChargeMeter.idle. The spec said 4; 3 is the owner's tuning.
            decaySeconds: 3,
            // TODO(spec section 10.1): never defined by the spec, which
            // suggested 1/200 as a starting point. In the kill-bounty
            // economy this is only the internal unit for A3's EXTRA charge
            // gold; ordinary damage pays nothing.
            //
            // This is the number to move if path A self-funds too easily.
            baseGoldPerDamage: 1,
            perCharge: 0.50,
            capTotal: 5.00
          }
        }
      },
      { // A4
        tier: 4,
        cost: 4000,
        statDeltas: { ad: 2, range: 25, hp: 300 },
        flags: { seesFlying: true },
        mechanics: ["hp_scaling"],
        // Overwrites A1's ramp numbers rather than adding to them.
        setParams: {
          ramp_per_target: { rampRate: 0.20, rampCap: 2.5 },
          hp_scaling: { maxBonus: 0.30, floorFraction: 0.5 }
        }
      },
      { // A5
        tier: 5,
        cost: 25000,
        statDeltas: { ad: 5, hp: 700 },
        mechanics: ["gold_to_power"]
      }
    ],

    // ---- B: Transfusion -- targets, slow, lifesteal, death denial --------
    B: [
      { // B1
        tier: 1,
        cost: 400,
        statDeltas: { hp: 150 },
        flags: { seesCamo: true },
        mechanics: []
      },
      { // B2
        tier: 2,
        cost: 1200,
        statDeltas: { range: -25, hp: 50, maxTargets: 1 },
        mechanics: ["slow"],
        setParams: { slow: { fraction: 0.10 } }
      },
      { // B3
        tier: 3,
        cost: 3500,
        statDeltas: { hp: 250, maxTargets: 2 },
        mechanics: ["lifesteal"],
        setParams: { lifesteal: { ratio: 0.10 } }
      },
      { // B4
        tier: 4,
        cost: 7000,
        statDeltas: { ad: 1, range: 5, hp: 450, maxTargets: 6 },
        mechanics: [],
        // Both overwrite the tier that introduced them.
        setParams: {
          slow: { fraction: 0.15 },
          lifesteal: { ratio: 0.20 }
        }
      },
      { // B5
        tier: 5,
        // 5000, which is EXACTLY the healing gate below, and that is the rule
        // rather than a coincidence: the price is the requirement (2026-07-29,
        // at the owner's request). It was 60 000 -- twelve times the gate and
        // fifteen times a whole run's purse -- so the tier unlocked with a
        // green light and then stayed unbuyable for the rest of the game,
        // which is a worse outcome than being locked. Now the run that heals
        // 5000 is a run that can pay for what the healing unlocked.
        //
        // If you retune either number, move BOTH. They are a pair, the same
        // way STARTING_CASH and Tower.COST are.
        cost: 5000,
        statDeltas: { ad: 1, range: 20, hp: 2000, maxTargets: 40 },
        mechanics: ["death_denial"],
        setParams: {
          death_denial: { knockbackUl: 500, restoreBaseHpTo: 1 }
        },
        // Checked by the upgrade validation layer, not just greyed out in
        // the UI. The unique key is GLOBAL -- one per game, not one per
        // tower.
        // Gated on HEALING DONE, not on the base's current HP. Current HP is
        // a level anything can move -- leaks take it, the sandbox sets it --
        // so gating on it meant the upgrade blinked in and out of reach.
        // Healing done only ever goes up, and is a record of the B path
        // actually having been played.
        //
        // SHARED across every tower (js/systems/healing-ledger.js), not per
        // tower. Only one B5 may exist per game, so a per-tower total would
        // mean one tower had to reach it alone while every other lifesteal
        // tower's healing counted for nothing -- effectively unbuyable.
        unlockCondition: {
          totalHealedAtLeast: 5000,
          globalUniqueKey: "death_denial"
        }
      }
    ]
  },

  // ---- default mechanic parameters ---------------------------------------
  // Every module's shape, so the resolver always has something to overwrite.
  // A mechanic that no purchased tier switched on is simply never consulted.
  mechanics: {
    ramp_per_target: { rampRate: 0, rampCap: 0 },
    def_pierce: { defPierce: 0 },
    charge_to_gold: {
      // The resolver always carries these defaults, but gold is banked only
      // when A3 switches on charge_to_gold and its multiplier exceeds one.
      firstThreshold: 500, growth: 1.65, decaySeconds: 3,
      baseGoldPerDamage: 1, perCharge: 0.5, capTotal: 5
    },
    hp_scaling: { maxBonus: 0, floorFraction: 0.5 },
    gold_to_power: {},
    slow: { fraction: 0 },
    lifesteal: { ratio: 0 },
    death_denial: { knockbackUl: 500, restoreBaseHpTo: 1 }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = TowerConfigs;
}
