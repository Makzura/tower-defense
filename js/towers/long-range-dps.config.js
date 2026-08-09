// ---------------------------------------------------------------------------
// Tower config: Longshot (long-range DPS, two-path upgrade tree)
//
// PURE DATA. No logic lives in this file -- see js/systems/*.js for the code
// that reads it. This is the template every future tower's config should
// copy the shape of: a `base` stat block, two `paths` of five cumulative
// upgrade tiers (deltas only, never absolutes), and a `mechanics` block for
// anything a flag switches on rather than a number that scales.
//
// All distances are in unit lengths (u.l.) -- this project's global distance
// system (see js/units.js): a single UNIT_LENGTH constant and a single
// ul(value) helper are the ONLY place a u.l. number becomes a screen/world
// one. Nothing in this file may be a pixel literal; conversion happens only
// at the render layer and the collision layer (js/systems/range-filter.js,
// js/towers/longshot-adapter.js), never here and never at rest.
//
// STAT MODEL: final stat = base + sum of the deltas of every purchased tier,
// on both paths, computed at runtime (js/systems/stat-resolver.js). This is
// what makes crosspathing "just work" -- nothing here special-cases a
// combination of tiers.
//
// The four exceptions the spec calls out -- camo detection, infinite pierce,
// cone shape, deadzone removal -- are FLAGS, not deltas. A tier "grants" a
// flag; the resolver applies each flag's fixed effect once, after the delta
// sum. Grep js/systems/stat-resolver.js for FLAG_EFFECTS to see exactly what
// each one does; nothing tower-specific is hardcoded there.
// ---------------------------------------------------------------------------

var TowerConfigs = typeof TowerConfigs !== "undefined" ? TowerConfigs : {};

TowerConfigs.longRangeDPS = {

  id: "long_range_dps",

  // Flavor only -- does not affect any tested value. Rename freely.
  displayName: "Arcane Sniper",

  // ---- costs ---------------------------------------------------------------
  // Derived, not guessed: tools/price-upgrades.js models each tier's
  // effective DPS (sustained fire rate through reload, average crit, average
  // execute over an enemy's life, pierce with falloff at a discount) and
  // prices the gain at the gunner's rate of $15 per DPS, plus a mild premium
  // for deeper tiers. Run that script to regenerate or to argue with the
  // assumptions; the numbers below are its output.
  //
  // CROSSPATHING IS PRICED IN. A tier is worth wildly different amounts
  // depending on what it is bolted onto -- B5 alone fires every 20 s for 222
  // DPS, but B5+A2 fires every 3.3 s WITH pierce for 1903 DPS, because path A
  // adds back the fire rate path B spent. So each tier is priced on the
  // MEDIAN of its marginal gain across every legal crosspath it can be bought
  // in, not on a single-path progression. That is why B5 costs $23300 rather
  // than the ~$2750 a single-path model produces.
  //
  // CAVEAT, rewritten 2026-07-30. This block used to say the game could not pay
  // these prices at all -- "$1 per damage and a two-wave schedule of 47 HP, so a
  // full run yields about $47". Both halves are long dead: the schedule is 35
  // waves / 13 498 effective HP, and the economy revamp took income to $3 per
  // damage, which puts a full run's purse near $42 400. These prices are
  // payable now. A full path A ($20 250 all in) fits inside ONE run, which it
  // never did before -- see the note in AGENTS.md's economy section; whether
  // that is wanted is an open question for the owner, not a settled design.
  //
  // The pricing MODEL, though, is now off its peg: the tiers above are priced at
  // "the gunner's rate of $15 per DPS", and the gunner costs $100 for its 1 DPS
  // since the revamp. So upgrades are cheap relative to the towers they sit on
  // by a factor of about six. Upgrade prices were deliberately not touched on
  // 2026-07-30; re-running tools/price-upgrades.js against a $100/DPS gunner is
  // the fix if the owner wants the model honest again.
  baseCost: 900,
  sellRefundRate: null,    // TODO(section 7): this tower's sell/refund rate.
                           // NOTE: the existing game has a *global*
                           // SELL_REFUND_FRACTION (0.5) in game.js -- if this
                           // tower is meant to just use that, this field can
                           // be deleted; left here because the spec asked for
                           // it to be an explicit config field until decided.

  targeting: {
    availableModes: ["first", "last", "strongest", "closest"],
    defaultMode: null      // TODO(section 7): default targeting mode
  },

  projectile: {
    speed: null,           // TODO(section 7): projectile speed (u.l./s)
    travelMode: null,      // TODO(section 7): "hitscan" | "travelling"

    // A LASER DOES NOT FLY. From A4 the weapon is a rail cannon and the shot
    // should arrive effectively on contact, so speed is raised by an order of
    // magnitude. Keyed by purchased path A tier; anything not listed uses
    // Bullet.BASE_SPEED_ULPS (562.5).
    //
    // For scale: A5's range is 1500 u.l., which at the base speed is 2.7
    // SECONDS in the air -- long enough to watch it cross the board. At
    // 14 000 it is 0.11 s, about seven frames: still visible as a beam,
    // never as a thing travelling.
    //
    // THIS IS A BALANCE CHANGE, not just a visual one. A shot that lands
    // sooner is a shot a fast enemy has less chance to walk out of, and
    // predictedPosition leads by less accordingly (it reads this same
    // number, so the two cannot drift apart).
    speedUlpsByGraft: { 4: 6000, 5: 14000 },

    // Distance from the tower's centre to the tip of the barrel, along
    // whatever direction it is aiming. The shot is born HERE, not at the
    // tower's feet -- it used to spawn 1 u.l. from the centre, which put the
    // muzzle flash inside his coat.
    //
    // It lives in the config rather than in the art pack because the
    // simulation needs it and simulation never reads back from the
    // presentation registry (see js/visual-models.js). The art is built to
    // match: tools/blender/tower_sniper.py prints MUZZLE_WORLD, and 1.19 of
    // its units at ORTHO_SCALE 2.6 across a sprite 3.97 footprints tall works
    // out at 36 u.l. If the rifle is re-modelled, that print is the number to
    // bring back here.
    //
    // It does NOT extend the tower's reach: the adapter takes it back off
    // maxTravelPx, so the far end of a shot is the same distance from the
    // tower it has always been.
    muzzleOffsetUl: 36,

    // The weapon gets longer as path A grafts onto it, so the muzzle moves.
    // Keyed by PURCHASED PATH A TIER; anything not listed uses the base above.
    //
    // A3 replaces the rifle with a three-stage coil barrel and A4 replaces the
    // man with a rail cannon on a yoke, which is why the jump is so large.
    // The Blender script prints the world figures and 1 world unit is 30.6
    // u.l. at the shared draw scale, so 1.19 -> 36, 1.56 -> 48, 1.78 -> 54.
    muzzleOffsetUlByGraft: { 3: 48, 4: 54, 5: 63 },

    // How high the barrel sits off the ground, same units. PRESENTATION ONLY
    // -- the shot's real position stays on the flat plane it does its hit
    // tests on, exactly as an enemy's `pos` stays at its feet while its body
    // is painted higher. This is only how high the picture is drawn.
    //
    // A rifle at the shoulder is 33 (world z 1.30, foreshortened by the
    // camera's 34 degree elevation, times 30.6 u.l. per world unit). A4's
    // rail cannon lies on a low yoke at 19 and A5's lance sits at 24. One
    // constant for all three ran the beam straight through A4's mount.
    muzzleHeightUl: 33,
    muzzleHeightUlByGraft: { 4: 19, 5: 24 }
  },

  hpBehavior: {
    // TODO(section 7): what HP actually does -- can this tower be damaged,
    // by what, does it die at 0? Nothing in systems code assumes an answer;
    // ConfiguredTower just tracks currentHp/maxHp as numbers and clamps.
    damageableBy: null,
    diesAtZero: null
  },

  // ---- section 2: base stats -------------------------------------------
  base: {
    range: 250,
    damage: 10,
    fireRate: 0.5,          // shots/sec
    hp: 100,
    footprint: 20,          // u.l., radius. No upgrade ever changes this.
    deadzone: 50,           // u.l. cannot target closer than this
    aoe: null,              // this tower has no AoE stat; field exists so the
                             // schema generalises to towers that do
    pierce: 0,
    critChance: 0,          // percentage points, 0-100
    critDamage: 100,        // percent; 100 = normal damage (multiplier 1.0)
    targetShape: "circle",  // "circle" | "cone"
    coneArcDeg: 0,           // meaningful only once targetShape is "cone"
    seesFlying: true,
    seesCamo: false,
    placeableOnHighGround: true
  },

  // ---- sections 3 & 4: the two upgrade paths -----------------------------
  // Each tier: { tier, cost, deltas, grants, setParams, tentative }
  //   deltas     -- added to the running total for each named stat. Never
  //                 an absolute; see STAT MODEL above.
  //   grants     -- flag names turned on by this tier (stay on forever once
  //                 purchased -- upgrades are cumulative).
  //   setParams  -- named mechanic parameters this tier OVERRIDES (not a
  //                 delta -- e.g. B4 raises the execute cap from 40% to 60%,
  //                 it does not add another 60%). Keyed by the flag/mechanic
  //                 the parameter belongs to.
  //   tentative  -- per spec section 4, B2's flat execute bonus is called out
  //                 explicitly as tentative and is replaced (not stacked)
  //                 the moment executeScaling (B3) is granted.
  paths: {

    A: [
      { // A1
        tier: 1,
        cost: 300,
        deltas: { damage: 5, range: 50, fireRate: 0.25, deadzone: 25 },
        grants: ["camoDetection"]
      },
      { // A2
        tier: 2,
        cost: 500,
        deltas: { damage: 10, range: 50, pierce: 1, hp: 50 },
        grants: []
      },
      { // A3
        tier: 3,
        cost: 850,
        deltas: { damage: 15, range: 100, pierce: 5, deadzone: 25, hp: 100 },
        grants: ["pierceFalloff"]
      },
      { // A4
        tier: 4,
        cost: 3800,
        deltas: { damage: 110, range: 50, hp: 850, coneArcDeg: 20 },
        // targetShape -> "cone", player-aimed; deadzone forced to 0. Both are
        // flag effects (enum / removal), not deltas -- see section 1.
        grants: ["coneShape", "deadzoneRemoved"]
      },
      { // A5
        tier: 5,
        cost: 13900,
        deltas: { damage: 350, range: 1000, fireRate: -0.15, hp: 1400, coneArcDeg: 4 },
        // pierce -> Infinite (flag, not delta -- see 5.1 for the effective
        // ~64-target cap this produces via the falloff formula).
        grants: ["infinitePierce", "killStackAttackSpeed"]
      }
    ],

    B: [
      { // B1
        tier: 1,
        cost: 325,
        deltas: { damage: 15, range: -25, hp: 50 },
        grants: []
      },
      { // B2
        tier: 2,
        cost: 375,
        deltas: { damage: 15, range: 75, hp: 100 },
        grants: ["tentativeExecuteFlat"],
        tentative: true,
        setParams: {
          tentativeExecuteFlat: { flatBonus: 0.10, hpFractionThreshold: 0.25 }
        }
      },
      { // B3
        tier: 3,
        cost: 275,
        deltas: { damage: 35, fireRate: -0.25, hp: 250, critChance: 20, critDamage: 75 },
        grants: ["reload", "executeScaling"],
        setParams: {
          executeScaling: { maxBonus: 0.40 }
        }
      },
      { // B4
        tier: 4,
        cost: 3400,
        deltas: { damage: 250, range: 100, fireRate: -0.06, hp: 300, critChance: 5, critDamage: 40 },
        grants: [],
        // Raises the execute cap from 40% to 60%. This OVERRIDES B3's
        // setParams for the same mechanic; it does not add to it.
        setParams: {
          executeScaling: { maxBonus: 0.60 }
        }
      },
      { // B5
        tier: 5,
        cost: 23300,
        deltas: { damage: 1250, range: 150, fireRate: -0.14, hp: 650, critDamage: 110 },
        grants: ["guaranteedReloadShotCrit", "activeAbility"]
      }
    ]
  },

  // ---- section 6: crosspathing -------------------------------------------
  crosspath: {
    // Reaching `lockThreshold` on one path caps the OTHER path at
    // `lockOtherAtTier` forever. See js/systems/crosspath.js -- the rule is
    // symmetric and generic, not hardcoded to "A" or "B".
    lockThreshold: 3,
    lockOtherAtTier: 2
  },

  // ---- section 5: mechanic parameters ------------------------------------
  // Values a flag needs beyond "on/off". Tiers can override entries here via
  // `setParams` (see B3/B4 above for executeScaling.maxBonus).
  mechanics: {

    pierceFalloff: {
      // d(n) = (d0 + softener) * decay^n - softener
      softener: 20,
      decay: 0.95
    },

    killStackAttackSpeed: {
      perStackBonus: 0.01,   // +1% attack speed per stack
      stackDurationSeconds: 5,
      maxStacks: 200
    },

    reload: {
      shotsBeforeReload: 4,
      reloadDurationSeconds: 1   // NOT affected by fireRate
    },

    executeScaling: {
      // bonus = maxBonus * clamp((1 - hpFraction) / floorFraction, 0, 1)
      // maxBonus is overridden per-tier via setParams (0.40 at B3, 0.60 at B4+)
      floorFraction: 0.90,
      maxBonus: 0   // never used directly -- always overridden by a tier
    },

    tentativeExecuteFlat: {
      // Replaced (not stacked) the instant executeScaling is granted.
      flatBonus: 0,           // overridden by B2's setParams (0.10)
      hpFractionThreshold: 0  // overridden by B2's setParams (0.25)
    },

    guaranteedReloadShotCrit: {
      // The shot immediately preceding a reload (see mechanics.reload) always
      // crits and always applies the full execute bonus, regardless of
      // target HP.
      appliesToShotIndex: 4   // == mechanics.reload.shotsBeforeReload
    },

    activeAbility: {
      damage: 25000,
      aoeRadius: 25,           // u.l.

      // THE RITUAL TAKES THREE SECONDS. Added at the owner's request, and it
      // changes what the ability IS: it was an instant button, and it is now
      // a commitment. The strongest enemy is chosen when the channel STARTS
      // and the ritual follows that same enemy without retargeting. If it dies
      // or leaks, the ritual keeps its last valid point instead of snapping to
      // somebody else.
      //
      // The tower cannot fire while channelling. Three seconds of a tower
      // this expensive standing still is a real price, on top of the stun.
      channelSeconds: 3,

      ignoresDefense: true,
      // Cut from 10 to 7 at the owner's request. The channel already costs 3
      // seconds up front, so the total lockout is unchanged at 10 -- what
      // moved is WHEN it is paid: three seconds of visible ritual you can
      // watch, then seven of exhaustion, instead of ten flat afterwards.
      stunSeconds: 7,          // tower cannot fire or reload while stunned
      maxHpLoss: 300,          // permanent, current HP is clamped to new max
      cooldownSeconds: null,   // TODO(section 7)
      // TODO: spec section 5.5 leaves "strongest enemy" undefined (highest
      // max HP vs highest current HP vs highest bounty). See
      // js/systems/active-ability.js selectStrongestEnemy() for the
      // placeholder heuristic in use until this is decided.
      strongestDefinition: null
    },

    cone: {
      reaimCooldownSeconds: 10,
      defaultDirectionRad: null // TODO(section 7): default aim on placement
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = TowerConfigs;
}
