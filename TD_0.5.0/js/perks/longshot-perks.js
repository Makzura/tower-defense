// ---------------------------------------------------------------------------
// The Arcane Sniper's permanent tree — the owner's confirmed content
//
// FOURTEEN NODES, ONE CHAIN PER ARM, AND THE BRANCHES ARE DELIBERATELY UNFINISHED
// (2026-08-31). Every number below is the owner's own, out of the confirmed
// list, and nothing here was invented to fill a gap:
//
//   north  the general upper branch -- 4
//   south  the general lower branch -- 3
//   west   path A -- 3 (`Quick Carriage` and `Deep-Line Resonance` were
//          rejected)
//   east   path B -- 4 (`Quick Breech` was rejected)
//
// REJECTED NAMES ARE NOT HERE AND MUST NOT BE ADDED: `Quick Carriage`,
// `Deep-Line Resonance`, `Quick Breech`, `Overwound Spring`, `Guided Bolt` and
// `Buyback Sigil` were all turned down. Do not extend the branches, do not add
// a Mastery, and do not invent a child.
//
// **THIS IS THE FIRST TREE ON A CONFIG-DRIVEN TOWER**, and two things about it
// are different from the Rifleman's and the Warbringer's because of that:
//
//   WHERE IT WRITES. The Arcane Sniper is an ADAPTER over a ConfiguredTower, so
//   `statTarget` resolves to `core.stats` and every field below is a name out
//   of `js/towers/long-range-dps.config.js` -- `damage`, `range`, `fireRate`,
//   `hp`, `footprint`, `critChance`, `critDamage`, `coneArcDeg` -- and never
//   one of the adapter's own.
//
//   DOTTED PATHS. Five of these nodes move a MECHANIC PARAMETER, which lives in
//   `stats.mechanics.<name>.<param>` and is not a top-level stat. `set` takes a
//   dotted path for exactly that (js/systems/tower-perks.js), and it is safe
//   because StatResolver deep-clones the mechanics block on every resolve --
//   the shared config is never written through.
//
// THE TIER GATES read `hasA4`-shaped booleans that `refreshDerived` derives
// from `core.purchased`, so this tree is authored in the same vocabulary as the
// two hand-written ones.
//
// EVERY NODE IS minLevel 0. **The `id` is the persistence format.**
//
// **EACH ARM IS A CHAIN** (2026-08-31, at the owner's word). The node beside
// the tower is that branch's root; every node further out REQUIRES the one
// before it, so a branch is bought from the centre outwards and cannot be
// skipped into. The tree screen draws its links straight off `requires` -- a
// root to the tower, a child to its parent -- so moving a prerequisite here
// moves the line and the lock together, and nothing has to be told twice.
//
// FIELDS THIS TREE CREATES WITH `set` -- `finalShotDamageMult`,
// `flyingDamageMult`, `groundDamageMult`, `omen*`, `lowHp*` -- do not exist in
// the config, deliberately. Every runtime that reads one falls back to the
// neutral value when it is absent, which is what makes an unequipped node
// resolve the identical tower.
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "longshot",
  nodes: [

    // === general upper ======================================================

    // 1.10 x 0.95 = 1.045 on paper, and the shape of the trade is the point:
    // heavier, slower shots waste more against a body that dies to less. The
    // ability's damage is `mechanics.activeAbility.damage` and is a different
    // number entirely, so it is untouched here.
    {
      id: "snp_n1",
      name: "Arcane Charge",
      icon: 0,
      blurb: "+10% shot damage, −5% fire rate — about +4.5% DPS on paper. The " +
             "B5 ability is unaffected.",
      cost: 100,
      minLevel: 0,
      at: { x: 0, y: -1 },
      effects: { mul: { damage: 1.10, fireRate: 0.95 } }
    },

    // TWO GROUPS BECAUSE THERE IS NO "has NOT". `onHighGround` and
    // `onFlatGround` are derived in `refreshDerived` from the ground the tower
    // is standing on, and exactly one of them is ever true.
    //
    // The build ghost answers this one too: `previewRangePx` knows what is
    // under the cursor and passes the same two flags in, so the ring the player
    // is shown before placing is the ring the placed tower gets.
    {
      id: "snp_n2",
      name: "High-Ground Doctrine",
      icon: 1,
      blurb: "+15% range on elevated ground, −10% on ordinary ground. Only " +
             "where it stands decides which.",
      cost: 80,
      minLevel: 0,
      requires: ["snp_n1"],
      at: { x: 0, y: -2 },
      effects: {
        when: [
          { has: "onHighGround", mul: { range: 1.15 } },
          { has: "onFlatGround", mul: { range: 0.90 } }
        ]
      }
    },

    // PER BODY, NOT PER SHOT. One piercing round can pass through a flier and a
    // walker in the same line and each meets its own multiplier -- the numbers
    // ride on the bullet (js/bullet.js) rather than on the tower, because a
    // shot outlives the frame it was fired in.
    //
    // The Arcane Sniper already sees flying enemies out of the box, so this
    // grants no targeting flag; it is a matchup and nothing else.
    {
      id: "snp_n3",
      name: "Skybane",
      icon: 2,
      blurb: "Ordinary shots deal +25% to flying enemies and −12% to " +
             "everything else. The B5 ability is unaffected.",
      cost: 120,
      minLevel: 0,
      requires: ["snp_n2"],
      at: { x: 0, y: -3 },
      effects: { set: { flyingDamageMult: 1.25, groundDamageMult: 0.88 } }
    },

    // A CHARGED ROUND TAKES THE BONUS INSTEAD OF THE PENALTY, never both: the
    // two multipliers are two states of one shot. `sinceOrdinaryShot` is reset
    // by firing an ordinary shot and by nothing else -- the active ability is
    // not one, so a ritual neither consumes the charge nor earns it.
    {
      id: "snp_n4",
      name: "First Omen",
      icon: 3,
      blurb: "After 3 s without firing, the next ordinary shot deals +35%. " +
             "Every uncharged ordinary shot deals −5%. The B5 ability neither " +
             "spends nor gains the charge.",
      cost: 140,
      minLevel: 0,
      requires: ["snp_n3"],
      at: { x: 0, y: -4 },
      effects: {
        set: { omenIdleSeconds: 3, omenChargedMult: 1.35, omenOrdinaryMult: 0.95 }
      }
    },

    // === general lower ======================================================

    // 900 is the dearest build price in the game and this is a sixth off it.
    // The quarter of maximum health comes off through `settleHp`, which clamps
    // current health down with the maximum rather than healing anything.
    {
      id: "snp_s1",
      name: "Stripped Mount",
      icon: 4,
      blurb: "Placement 900 → 750. −25% maximum health (100 → 75 at base).",
      cost: 60,
      minLevel: 0,
      at: { x: 0, y: 1 },
      effects: { price: { add: -150 }, mul: { hp: 0.75 } }
    },

    // FOOTPRINT AND RANGE ARE DIFFERENT THINGS AND SO ARE THE DEADZONE AND THE
    // MODEL. This moves the first two and neither of the last two: the tower
    // still refuses targets inside its deadzone at the same distance, and the
    // drawn rifleman is the same size he always was.
    //
    // THE SMALLER SKIRT IS DECIDED BEFORE THE TOWER STANDS. `buildFootprintUl`
    // in js/game.js routes every placement rule through
    // `TowerPerks.previewFootprintUl`, so the ghost, the block-reason readout
    // and the click that places it all use 16 -- a footprint that shrank AFTER
    // placement could leave a tower overlapping a legal neighbour.
    {
      id: "snp_s2",
      name: "Compact Chassis",
      icon: 5,
      blurb: "Footprint 20 → 16 u.l., so it fits where it could not before. " +
             "−10 u.l. range (250 → 240 at base). Deadzone and model size are " +
             "unchanged.",
      cost: 80,
      minLevel: 0,
      requires: ["snp_s1"],
      at: { x: 0, y: 2 },
      effects: { set: { footprint: 16 }, add: { range: -10 } }
    },

    // STRICTLY BELOW A THIRD, so a tower sitting exactly on 30% is not in it.
    // Both halves are recomputed every step from the live health and neither is
    // ever accumulated, so healing back out of it restores the reach exactly --
    // see `resolveReach` and `lowHpActive` in js/towers/longshot-adapter.js.
    {
      id: "snp_s3",
      name: "Emergency Discharge",
      icon: 6,
      blurb: "Below 30% health: +20% fire rate and −20% range, both ending the " +
             "moment it is healed back. The B5 ability is unaffected.",
      cost: 120,
      minLevel: 0,
      requires: ["snp_s2"],
      at: { x: 0, y: 3 },
      effects: {
        set: { lowHpFraction: 0.30, lowHpFireRateMult: 1.20, lowHpRangeMult: 0.80 }
      }
    },

    // === path A =============================================================

    // A4 IS ALREADY 20 DEGREES, so the cap only bites at A5, which would
    // otherwise add four. That is why there is no second penalty at A4 and why
    // the arc is `set` on `hasA5` rather than subtracted: an absolute cap says
    // what it means at every crosspath.
    {
      id: "snp_a1",
      name: "Narrow Prism",
      icon: 7,
      blurb: "A4+ only: +8% shot damage. The cone stops at 20° instead of " +
             "reaching 24° at A5. The B5 ability is unaffected.",
      cost: 100,
      minLevel: 0,
      at: { x: -1, y: 0 },
      effects: {
        when: [
          { has: "hasA4", mul: { damage: 1.08 } },
          { has: "hasA5", set: { coneArcDeg: 20 } }
        ]
      }
    },

    // THE DECAY IS A RATE PER TARGET, NOT A FLAT LOSS. `d(n) = (d0 + softener)
    // * decay^n - softener` (js/systems/pierce.js), so raising 0.95 to 0.962 is
    // exactly "3.8% per pierced target instead of 5%" and the softener and the
    // zero-damage stop are untouched.
    //
    // The 5% comes off d0, before the sequence is calculated, which is what
    // makes the trade "a shorter first shot for a longer line".
    {
      id: "snp_a2",
      name: "Piercing Persistence",
      icon: 8,
      blurb: "A3+ only: pierce falloff drops 3.8% per target instead of 5%. " +
             "The shot starts 5% weaker, so the line is longer and its head is " +
             "lighter.",
      cost: 120,
      minLevel: 0,
      requires: ["snp_a1"],
      at: { x: -2, y: 0 },
      effects: {
        when: [{
          has: "hasA3",
          mul: { damage: 0.95 },
          set: { "mechanics.pierceFalloff.decay": 0.962 }
        }]
      }
    },

    // A WINDOW, NOT A CEILING. The cap stays at 75 and the per-stack bonus
    // stays at +1%; what changes is how long a stack survives, which is what
    // decides whether a wave with gaps in it can hold the buff at all.
    //
    // NO DOWNSIDE, and that is the confirmed version rather than an oversight:
    // the rejected one cut the ceiling to 60. Do not put it back.
    {
      id: "snp_a3",
      name: "Patient Harvest",
      icon: 9,
      blurb: "A5 only: kill stacks last 5.5 s instead of 4. Still +1% attack " +
             "speed each and still 75 at most.",
      cost: 140,
      minLevel: 0,
      requires: ["snp_a2"],
      at: { x: -3, y: 0 },
      effects: {
        when: [{
          has: "hasA5",
          set: { "mechanics.killStackAttackSpeed.stackDurationSeconds": 5.5 }
        }]
      }
    },

    // === path B =============================================================

    // PERCENTAGE POINTS, BOTH OF THEM, and that is why they are `add` and not
    // `mul`. `critChance` is 0-100 and `critDamage` is a percent where 100 is
    // normal damage, so B3's 20/175 becomes 25/165 and B4's 25/215 becomes
    // 30/205. B5's guaranteed fourth shot still always crits -- it simply crits
    // for the reduced figure.
    {
      id: "snp_b1",
      name: "Critical Calibration",
      icon: 0,
      blurb: "B3+ only: +5 points of critical chance, −10 points of critical " +
             "damage. The guaranteed B5 shot still crits, at the lower value.",
      cost: 110,
      minLevel: 0,
      at: { x: 1, y: 0 },
      effects: {
        when: [{ has: "hasB3", add: { critChance: 5, critDamage: -10 } }]
      }
    },

    // `bonus = maxBonus * clamp((1 - hpFraction) / floorFraction, 0, 1)`, so a
    // floor of 0.75 reaches the cap at 25% health where 0.90 reached it at 10%.
    // The scaling stays linear; only where it tops out moves.
    //
    // B4+ ONLY, so a tower that stopped at B3 keeps its authored +40% at 10%.
    // B5 does not re-declare the cap, so 0.55 stands there too.
    {
      id: "snp_b2",
      name: "Execution Curve",
      icon: 1,
      blurb: "B4+ only: execute reaches its maximum at 25% enemy health " +
             "instead of 10%, but the maximum is +55% instead of +60%. B3's " +
             "+40% is untouched.",
      cost: 140,
      minLevel: 0,
      requires: ["snp_b1"],
      at: { x: 2, y: 0 },
      effects: {
        when: [{
          has: "hasB4",
          set: {
            "mechanics.executeScaling.floorFraction": 0.75,
            "mechanics.executeScaling.maxBonus": 0.55
          }
        }]
      }
    },

    // BEFORE THE CRIT AND THE EXECUTE, which is what makes it +10% of the whole
    // blow rather than +10% of the base under two multipliers -- see the note
    // in ConfiguredTower.fire. The half-second lands on the reload's own timer,
    // which has never been affected by fire rate and still is not.
    {
      id: "snp_b3",
      name: "Covenant Round",
      icon: 2,
      blurb: "B5 only: the guaranteed fourth shot deals +10%, taken before its " +
             "crit and execute. The reload after it takes 1.5 s instead of 1. " +
             "The other three shots are unchanged.",
      cost: 180,
      minLevel: 0,
      requires: ["snp_b2"],
      at: { x: 3, y: 0 },
      effects: {
        when: [{
          has: "hasB5",
          set: {
            finalShotDamageMult: 1.10,
            "mechanics.reload.reloadDurationSeconds": 1.5
          }
        }]
      }
    },

    // DIAMETER 50 -> 70 FOR 3 000 DAMAGE A BODY. Whether that is a gain depends
    // on the road under it and on how tightly the wave is packed -- an area is
    // not convertible into a target count, and this node deliberately does not
    // claim one.
    //
    // Everything else about the ritual stands: three seconds of channel, seven
    // of stun, sixty of cooldown, 300 permanent maximum health, and it still
    // ignores defence and armour.
    {
      id: "snp_b4",
      name: "Grand Sigil",
      icon: 3,
      blurb: "B5 ability only: 15 000 damage instead of 18 000, over 35 u.l. " +
             "instead of 25 — a 50 → 70 u.l. diameter, +40%. Channel, stun, " +
             "cooldown and health cost are unchanged.",
      cost: 220,
      minLevel: 0,
      requires: ["snp_b3"],
      at: { x: 4, y: 0 },
      effects: {
        when: [{
          has: "hasB5",
          set: {
            "mechanics.activeAbility.damage": 15000,
            "mechanics.activeAbility.aoeRadius": 35
          }
        }]
      }
    }
  ]
});
