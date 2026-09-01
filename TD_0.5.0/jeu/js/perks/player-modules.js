// ---------------------------------------------------------------------------
// The PLAYER's tree — the owner's confirmed content
//
// TWENTY-ONE MODULES AND FORTY RANKED SQUARES, and every number below is the
// owner's own. A MODULE is bought once and occupies one of the Player's seven
// slots when equipped; a SQUARE is ranked, never occupies a slot, and applies
// only while the module it improves is equipped.
//
// **THE `id` IS THE PERSISTENCE FORMAT.** It is what the save writes down, so
// renaming one un-buys it for every existing player. Names and icons are free.
//
// **A MODULE CONTRIBUTES BY ADDING TO THE RESOLVED BLOCK AND BY NOTHING ELSE.**
// `resolve(out, rankOf)` on a module and `resolve(out, rank)` on a square are
// the whole interface: they add to the named numbers in
// `PlayerPerks.neutral()`, and every other file in the game reads that block.
// Nothing here touches a tower, a wave or the wallet directly.
//
// **PERCENTAGE POINTS, NOT MULTIPLIERS**, wherever two nodes move the same
// number — which is nearly everywhere, because almost every square exists to
// deepen or to soften its parent's trade. Points sum, so a module and its two
// squares compose without any of them knowing the others' rank, and the reader
// turns the sum into a factor exactly once. Every formula the owner stated
// falls straight out of that: `20 + rInventaire − rTolérance` is Intendant's
// `+= 20`, Inventaire's `+= rank` and Tolérance's `-= rank`, in any order.
//
// **A PRICE IS THE PRICE OF THAT RANK ALONE**, never a cumulative total. Five
// curves, each used unaltered:
//
//   R5       40, 60, 90, 135, 200          an ordinary five-rank square
//   R3       75, 115, 175                  an ordinary three-rank one
//   F5       80, 120, 180, 270, 400        one behind two rank prerequisites
//   F3       140, 220, 340                 the three-rank version of that
//   SECRET5  300, 500, 800, 1250, 2000     under the secret module only
//
// R3 IS DEFINED AND UNUSED. The owner's curve list carries it and no confirmed
// node asks for it; it is kept so that a three-rank square added later takes
// the authored curve rather than one somebody invents on the day.
//
// **A SQUARE'S PREREQUISITES ARE PURCHASE CONDITIONS, NOT EQUIP CONDITIONS.**
// A fusion square needs two ranks bought before rank 1 can be had, and after
// that only its `parent` MODULE has to be equipped for it to work — which is
// why no square carries a second parent. The tree still shows both
// requirements separately, and a half-met one stays locked.
//
// THE LAYOUT IS A TABLE AT THE TOP rather than an `at:` scattered through
// sixty-one nodes, because it is the one part of this file that gets tuned by
// eye. Three trunks out of the portrait — Intendant west, Commandant north,
// Gardien south — with the two fusions and the secret in the east, the arm no
// root claimed.
//
// **A SQUARE LINKS TO ITS MODULE AND TO NOTHING ELSE**, and its rank
// prerequisites are shown on its card rather than as lines. Four of them need a
// rank from a completely different branch (Réserve de garnison wants
// Amortissement doux, three arms away), and drawing those would have put four
// lines straight across the tree to say something the card already says with a
// tick and a cross. The positions were then solved so that **every module's
// squares sit in the widest directions that module has no link in** — so a
// square can never land on a branch line.
//
// THE THREE CROSSINGS ARE THE TWO MODULE FUSIONS and nothing else: Doctrine
// Blitz reaches back to Trésorerie avancée in the west, Totem vulnérable
// reaches up to Balise de commandement in the north, and those two lines cross
// each other and the north root. A test asserts that no node overlaps another
// and that no link passes within 14 px of a node it does not belong to.
//
// THE SECRET NODE HAS NO LINK AT ALL. It is not a root and it is not a child --
// what gates it is a set of conditions spread across the whole tree, and a line
// to any one of them would be a lie about the other four. It floats, east of
// everything, as `???` until it is earned.
// ---------------------------------------------------------------------------

(function () {

  var R5 = [40, 60, 90, 135, 200];
  var R3 = [75, 115, 175];                    // authored, currently unused
  var F5 = [80, 120, 180, 270, 400];
  var F3 = [140, 220, 340];
  var SECRET5 = [300, 500, 800, 1250, 2000];

  // --- the layout ------------------------------------------------------------
  //
  // One entry per node, in node units. The portrait sits at 0,0. A test asserts
  // that no two nodes overlap and that no link passes through a node it does
  // not belong to, so this table can be tuned freely and cannot quietly break
  // the picture.
  var AT = {
    // WEST — Intendant, and everything under it
    intendant:               [-2.7, 0],
    p_intendant_inventory:   [-2.12, -1.44],
    p_intendant_tolerance:   [-2.03, 1.4],
    advanced_treasury:       [-5.4, -2.6],
    p_treasury_advance:      [-4.92, -4.07],
    p_treasury_amortization: [-6.28, -1.32],
    emergency_credit:        [-8.6, -4.1],
    p_credit_line:           [-9.49, -2.83],
    p_credit_refinancing:    [-8.2, -5.6],
    architect:               [-5.4, 0],
    p_architect_dense:       [-5, -1.5],
    p_architect_connectors:  [-4.72, 1.39],
    compact_plan:            [-8.9, -2],
    p_compact_template:      [-9.89, -0.81],
    p_compact_bracing:       [-8.38, -3.46],
    shared_arsenal:          [-8.9, 1.1],
    p_arsenal_doctrine:      [-8.7, 2.64],
    p_arsenal_licenses:      [-9.61, -0.28],
    isolated_operators:      [-8.6, 4.1],
    p_operators_solitude:    [-7.56, 5.25],
    p_operators_coexistence: [-9.97, 3.37],
    scrapper:                [-5, 2.9],
    p_scrapper_team:         [-3.97, 4.06],
    p_scrapper_bracing:      [-6.36, 2.16],

    // NORTH — Commandant
    commander:               [0, -2.7],
    p_commander_signal:      [-1.44, -2.12],
    p_commander_engagement:  [1.18, -3.71],
    overdrive_order:         [-2.9, -5.7],
    p_overdrive_redline:     [-4.18, -4.83],
    p_overdrive_recovery:    [-1.99, -6.95],
    radar_sweep:             [0.9, -6],
    p_radar_echo:            [-0.43, -6.79],
    p_radar_optics:          [2.23, -5.21],
    tactical_forecast:       [3, -8],
    p_forecast_dossier:      [2.14, -9.29],
    p_forecast_briefing:     [4.25, -7.08],
    command_beacon:          [3.6, -3.1],
    p_beacon_amplified:      [2.99, -4.52],
    p_beacon_antenna:        [5.15, -3],

    // SOUTH — Gardien
    guardian:                [0, 2.7],
    p_guardian_wall:         [-1.45, 2.16],
    p_guardian_garrison:     [1.11, 1.61],
    controlled_breach:       [-2.3, 5.4],
    p_breach_gate:           [-3.31, 6.58],
    mana_shield:             [0.4, 5.6],
    p_shield_capacitor:      [1.95, 5.66],
    p_shield_circuit:        [-1.08, 6.08],
    no_leak_bounty:          [2.7, 4.3],
    p_bounty_perfect:        [4, 3.46],
    perfect_streak:          [3, 6.9],
    p_streak_cadence:        [4.55, 6.99],
    p_streak_insurance:      [1.51, 7.34],

    // EAST — the two fusions, and the secret that floats free of both
    blitz_doctrine:          [5.2, -0.6],
    p_blitz_dividend:        [5.95, -1.96],
    p_blitz_arrival:         [5.1, 0.95],
    vulnerable_totem:        [5, 2.8],
    p_totem_idol:            [6.41, 2.16],
    p_totem_stone:           [4.67, 4.32],
    crosspath_permit:        [9.8, 0.4],
    p_permit_paperwork:      [10.13, -1.11],
    p_permit_restitution:    [10.01, 1.94]
  };

  function at(key) { return { x: AT[key][0], y: AT[key][1] }; }

  // A signed percentage for a card line: "+6%" and "−4%" rather than a bare
  // number, so nothing has to guess which way a figure goes.
  function pct(v) {
    var r = Math.round(v * 1000) / 1000;
    return (r >= 0 ? "+" : "−") + Math.abs(r) + "%";
  }

  function round(v) { return Math.round(v * 1000) / 1000; }

  PlayerPerks.register({

    // =====================================================================
    // MODULES
    // =====================================================================
    modules: [

      // --- INTENDANT ------------------------------------------------------

      // THE FIRST OF EACH TYPE IS CHEAPER AND EVERY ONE AFTER IT IS DEARER, and
      // the discount is spent by a COMPLETED placement rather than by owning
      // the type: selling or losing that first tower does not hand the discount
      // back, which is what "once per type per run" has to mean if it is not to
      // be farmable by rebuilding.
      {
        id: "player_intendant_diversified_arsenal",
        name: "Intendant",
        subtitle: "Arsenal diversifié",
        icon: 0,
        cost: 100,
        at: at("intendant"),
        blurb: "The first tower of each TYPE placed in a run costs 60 mana " +
               "less. Every later one of that type costs 20 more.",
        upside: "60 mana off the first tower of each type you place.",
        downside: "Every later tower of that type costs 20 more.",
        resolve: function (out) {
          out.firstTowerDiscount += 60;
          out.laterTowerSurcharge += 20;
        },
        short: "The first tower of each type is cheaper; the rest cost more.",
        stats: function (r) {
          var inv = r("player_intendant_catalogued_inventory");
          return [
            { label: "first of a type", value: "−" + (60 + 3 * inv) + " mana" },
            { label: "each one after", value: "+" +
              (20 + inv - r("player_intendant_logistics_tolerance")) + " mana" }
          ];
        },
      },

      {
        id: "player_advanced_treasury",
        name: "Trésorerie avancée",
        icon: 1,
        cost: 120,
        requires: ["player_intendant_diversified_arsenal"],
        at: at("advanced_treasury"),
        blurb: "Start every run with 250 more mana. Fixed end-of-wave rewards " +
               "pay 8% less.",
        upside: "+250 starting mana.",
        downside: "−8% on every fixed end-of-wave reward. Kill bounties, sales " +
                  "and refunds are untouched.",
        resolve: function (out) {
          out.startingManaBonus += 250;
          out.fixedWaveRewardPenaltyPct += 8;
        },
        short: "More mana to open with, smaller wave payouts.",
        stats: function (r) {
          var a = r("player_treasury_larger_advance");
          return [
            { label: "starting mana", value: "+" + (250 + 20 * a) },
            { label: "wave rewards", value: pct(-(8 + 0.75 * a -
              0.4 * r("player_treasury_soft_amortization"))) }
          ];
        },
      },

      // A CREDIT LINE, AND THE POINT OF IT IS THAT IT STOPS EVERYTHING. Going
      // negative is allowed once; going on spending is not. See PlayerRun for
      // the block and the interest.
      {
        id: "player_emergency_credit",
        name: "Crédit d'urgence",
        icon: 2,
        cost: 180,
        requires: ["player_advanced_treasury"],
        at: at("emergency_credit"),
        blurb: "One affordable transaction may take you down to −300 mana. " +
               "While the balance is negative nothing may be bought, and the " +
               "debt grows 15% at the start of each wave.",
        upside: "Spend down to −300 mana when you have to.",
        downside: "No purchase, placement, upgrade or ability spend while you " +
                  "are in the red — and the debt grows 15% a wave.",
        resolve: function (out) {
          out.debtLimit += 300;
          out.debtInterestPct += 15;
        },
        short: "Overdraw once; nothing may be bought until you are back at zero.",
        stats: function (r) {
          return [
            { label: "debt floor", value: "−" +
              (300 + 40 * r("player_credit_extended_line")) + " mana" },
            { label: "interest a wave", value: round(15 +
              r("player_credit_extended_line") -
              0.5 * r("player_credit_refinancing")) + "%" }
          ];
        },
      },

      // DESTRUCTION IS NOT A SALE, and the whole node turns on the difference:
      // a sale is a decision and already pays half, a destruction is a loss and
      // this is what softens it.
      {
        id: "player_scrapper",
        name: "Ferrailleur",
        icon: 3,
        cost: 140,
        requires: ["player_intendant_diversified_arsenal"],
        at: at("scrapper"),
        blurb: "A tower DESTROYED pays back 50% of everything sunk into it. " +
               "Every tower has 15% less maximum health.",
        upside: "50% of a destroyed tower's real investment comes back.",
        downside: "−15% maximum health on every tower. A sale is not a " +
                  "destruction and pays nothing extra.",
        resolve: function (out) {
          out.destroyRefundPct += 50;
          out.towerHpPenaltyPct += 15;
        },
        short: "A destroyed tower pays back; every tower is frailer.",
        stats: function (r) {
          var t = r("player_scrapper_recovery_team");
          return [
            { label: "destroyed refund", value: (50 + 2 * t) + "%" },
            { label: "tower health", value: pct(-(15 + t -
              0.5 * r("player_scrapper_recycled_bracing"))) }
          ];
        },
      },

      // PROXIMITY, AND BOTH HALVES CAN BE TRUE AT ONCE. A tower beside one of
      // each is faster AND slower, by different amounts, and each half counts
      // once however many neighbours there are.
      {
        id: "player_architect_campaign_network",
        name: "Architecte",
        subtitle: "Réseau de campagne",
        icon: 4,
        cost: 150,
        requires: ["player_intendant_diversified_arsenal"],
        at: at("architect"),
        blurb: "A tower with a DIFFERENT type within 70 u.l. fires 5% faster. " +
               "One with the SAME type that close fires 3% slower. Both can " +
               "apply at once, and each counts only once.",
        upside: "+5% fire rate beside a different type.",
        downside: "−3% fire rate beside one of its own.",
        resolve: function (out) {
          out.neighbourRadiusUl = Math.max(out.neighbourRadiusUl, 70);
          out.archDifferentBonusPct += 5;
          out.archSamePenaltyPct += 3;
        },
        short: "Faster beside a different type, slower beside its own. 70 u.l.",
        stats: function (r) {
          var d = r("player_architect_dense_network");
          return [
            { label: "different neighbour", value: pct(5 + 0.5 * d) + " fire rate" },
            { label: "same neighbour", value: pct(-(3 + 0.25 * d -
              0.25 * r("player_architect_tolerant_connectors"))) + " fire rate" }
          ];
        },
      },

      {
        id: "player_compact_plan",
        name: "Plan compact",
        icon: 5,
        cost: 120,
        requires: ["player_architect_campaign_network"],
        at: at("compact_plan"),
        blurb: "Every tower's placement footprint is 10% smaller and its " +
               "maximum health 15% lower.",
        upside: "−10% placement footprint on every tower, so they stand closer.",
        downside: "−15% maximum health on every tower.",
        resolve: function (out) {
          out.footprintPenaltyPct += 10;
          out.towerHpPenaltyPct += 15;
        },
        short: "Towers stand closer together, and break sooner.",
        stats: function (r) {
          var g = r("player_compact_tighter_template");
          return [
            { label: "footprint", value: pct(-(10 + g)) },
            { label: "tower health", value: pct(-(15 + 0.75 * g -
              0.5 * r("player_compact_internal_bracing"))) }
          ];
        },
      },

      {
        id: "player_shared_arsenal",
        name: "Arsenal partagé",
        icon: 6,
        cost: 160,
        requires: ["player_architect_campaign_network"],
        at: at("shared_arsenal"),
        blurb: "Every DIFFERENT tower type alive gives +1% damage to all " +
               "towers, up to +5%. A placement that duplicates a type alive " +
               "costs 2% more.",
        upside: "+1% damage a live type, capped at +5%.",
        downside: "+2% on the price of any tower that duplicates a live type.",
        resolve: function (out) {
          out.sharedPerTypePct += 1;
          out.sharedCapPct += 5;
          out.duplicateSurchargePct += 2;
        },
        short: "Damage for every live type; a duplicate costs more to place.",
        stats: function (r) {
          var d = r("player_arsenal_combined_doctrine");
          return [
            { label: "per live type", value: pct(1 + 0.1 * d) + " damage" },
            { label: "cap", value: pct(5 + 0.5 * d) },
            { label: "duplicate placement", value: pct(2 + 0.2 * d -
              0.2 * r("player_arsenal_secondary_licenses")) }
          ];
        },
      },

      {
        id: "player_isolated_operators",
        name: "Opérateurs isolés",
        icon: 7,
        cost: 110,
        requires: ["player_architect_campaign_network"],
        at: at("isolated_operators"),
        blurb: "A tower with NO other tower within 70 u.l. reaches 10% " +
               "further. One with a neighbour reaches 5% less far.",
        upside: "+10% range while it stands alone.",
        downside: "−5% range as soon as anything is near it.",
        resolve: function (out) {
          out.neighbourRadiusUl = Math.max(out.neighbourRadiusUl, 70);
          out.isolatedBonusPct += 10;
          out.crowdedPenaltyPct += 5;
        },
        short: "Longer reach alone, shorter with a neighbour. 70 u.l.",
        stats: function (r) {
          var s2 = r("player_operators_prepared_solitude");
          return [
            { label: "alone", value: pct(10 + 0.75 * s2) + " range" },
            { label: "with a neighbour", value: pct(-(5 + 0.25 * s2 -
              0.4 * r("player_operators_measured_coexistence"))) + " range" }
          ];
        },
      },

      // --- COMMANDANT -----------------------------------------------------

      {
        id: "player_commander_priority_order",
        name: "Commandant",
        subtitle: "Ordre prioritaire",
        icon: 8,
        cost: 100,
        at: at("commander"),
        blurb: "Mark one enemy for 5 s: every tower that can see and reach it " +
               "shoots it first. Shots at a marked enemy hit 5% softer. " +
               "25 s cooldown.",
        upside: "Every tower that can reach it drops its own targeting to " +
                "shoot your mark.",
        downside: "−5% damage on anything aimed at the mark. It never grants " +
                  "camo or flying sight.",
        resolve: function (out) {
          out.markSeconds += 5;
          out.markCooldownSeconds += 25;
          out.markDamagePenaltyPct += 5;
        },
        short: "Mark an enemy: every tower that can reach it shoots it first.",
        stats: function (r) {
          var g = r("player_commander_extended_signal");
          return [
            { label: "mark lasts", value: round(5 + 0.4 * g) + " s" },
            { label: "damage on it", value: pct(-(5 + 0.25 * g -
              0.25 * r("player_commander_rules_of_engagement"))) },
            { label: "cooldown", value: "25 s" }
          ];
        },
      },

      {
        id: "player_overdrive_order",
        name: "Ordre de surcharge",
        icon: 9,
        cost: 140,
        requires: ["player_commander_priority_order"],
        at: at("overdrive_order"),
        blurb: "Once a wave: one tower fires 30% faster for 6 s, then cannot " +
               "act at all for 2.5 s.",
        upside: "+30% fire rate for six seconds.",
        downside: "That tower is stunned for 2.5 s afterwards. Once a wave, " +
                  "and it cannot be stacked on itself.",
        resolve: function (out) {
          out.overdriveFireRatePct += 30;
          out.overdriveSeconds += 6;
          out.overdriveStunSeconds += 2.5;
        },
        short: "One tower fires faster, then cannot act. Once a wave.",
        stats: function (r) {
          var l = r("player_overdrive_redline");
          return [
            { label: "fire rate", value: pct(30 + 3 * l) + " for 6 s" },
            { label: "stun after", value: round(2.5 + 0.15 * l -
              0.1 * r("player_overdrive_disciplined_recovery")) + " s" }
          ];
        },
      },

      {
        id: "player_radar_sweep",
        name: "Balayage radar",
        icon: 0,
        cost: 130,
        requires: ["player_commander_priority_order"],
        at: at("radar_sweep"),
        blurb: "For 8 s every tower sees camo AND flying. 45 s cooldown. " +
               "While this is equipped every tower reaches 3% less far, " +
               "always — not only while the radar is up.",
        upside: "Eight seconds in which every tower can see everything.",
        downside: "−3% range on every tower for the whole run.",
        resolve: function (out) {
          out.radarSeconds += 8;
          out.radarCooldownSeconds += 45;
          out.radarRangePenaltyPct += 3;
        },
        short: "Every tower sees camo and flying for a moment; shorter reach always.",
        stats: function (r) {
          var e = r("player_radar_long_echo");
          return [
            { label: "sight", value: round(8 + 0.8 * e) + " s" },
            { label: "cooldown", value: (45 + 2 * e) + " s" },
            { label: "range, always", value: pct(-Math.max(0,
              3 - 0.25 * r("player_radar_calibrated_optics"))) }
          ];
        },
      },

      {
        id: "player_tactical_forecast",
        name: "Prévision tactique",
        icon: 1,
        cost: 140,
        requires: ["player_radar_sweep"],
        at: at("tactical_forecast"),
        blurb: "Read the next TWO waves in full. The gap between waves halves, " +
               "from 5 s to 2.5 s.",
        upside: "The composition of the next two waves, before they arrive.",
        downside: "Half the breathing room between waves — 2.5 s instead of 5 s.",
        resolve: function (out) {
          out.forecastWaves = Math.max(out.forecastWaves, 2);
          out.transitionSeconds = 2.5;
        },
        short: "Read the coming waves; less breathing room between them.",
        stats: function (r) {
          return [
            { label: "waves shown", value: r("player_forecast_third_dossier") ? "3" : "2" },
            { label: "gap between waves", value: transitionText(r) + " s" }
          ];
        },
      },

      // THE BEACON IS NOT A TOWER. It does not shoot, does not block, cannot be
      // sold and never counts as a type for Architecte or Arsenal partagé.
      {
        id: "player_command_beacon",
        name: "Balise de commandement",
        icon: 2,
        cost: 160,
        requires: ["player_commander_priority_order"],
        at: at("command_beacon"),
        blurb: "Place one free beacon before wave 1. Towers within 90 u.l. " +
               "gain +8% projectile speed and +5% range; every tower outside " +
               "it loses 2% fire rate.",
        upside: "+8% projectile speed and +5% range inside 90 u.l.",
        downside: "−2% fire rate on every tower outside the circle. It may " +
                  "only be moved between waves.",
        resolve: function (out) {
          out.beaconRadiusUl = 90;
          out.beaconSpeedPct += 8;
          out.beaconRangePct += 5;
          out.beaconFarFireRatePenaltyPct += 2;
        },
        short: "One free beacon: better inside its 90 u.l., worse outside.",
        stats: function (r) {
          var a = r("player_beacon_amplified_signal");
          return [
            { label: "inside", value: pct(8 + a) + " speed, " + pct(5 + a) + " range" },
            { label: "outside", value: pct(-(2 + 0.25 * a -
              0.2 * r("player_beacon_directional_antenna"))) + " fire rate" }
          ];
        },
      },

      // --- GARDIEN --------------------------------------------------------

      {
        id: "player_guardian_bastion_pact",
        name: "Gardien",
        subtitle: "Pacte du bastion",
        icon: 3,
        cost: 100,
        at: at("guardian"),
        blurb: "The base has 50 more maximum health. You start every run with " +
               "100 less mana.",
        upside: "+50 maximum base health, and the base opens full.",
        downside: "−100 starting mana.",
        resolve: function (out) {
          out.baseHpBonus += 50;
          out.startingManaPenalty += 100;
        },
        short: "A tougher base for a lighter purse.",
        stats: function (r) {
          var w = r("player_guardian_thick_wall");
          return [
            { label: "base health", value: "+" + (50 + 5 * w) },
            { label: "starting mana", value: "−" + round(100 + 8 * w -
              5 * r("player_guardian_garrison_reserve")) }
          ];
        },
      },

      {
        id: "player_controlled_breach",
        name: "Brèche contrôlée",
        icon: 4,
        cost: 120,
        requires: ["player_guardian_bastion_pact"],
        at: at("controlled_breach"),
        blurb: "The FIRST enemy to leak in each wave costs the base only half " +
               "what it would have.",
        upside: "The first leak of every wave is halved.",
        downside: null,
        resolve: function (out) {
          out.firstLeakPct = Math.min(out.firstLeakPct, 50);
        },
        short: "The first leak of every wave costs the base less.",
        stats: function (r) {
          return [{ label: "first leak of a wave",
                    value: (50 - 2 * r("player_breach_reinforced_gate")) +
                           "% of its damage" }];
        }
      },

      {
        id: "player_mana_shield",
        name: "Bouclier de mana",
        icon: 5,
        cost: 160,
        requires: ["player_guardian_bastion_pact"],
        at: at("mana_shield"),
        blurb: "A toggle, off at the start of every run. While it is on, up to " +
               "50% of each hit on the base is absorbed at 25 mana a point.",
        upside: "Up to half of every hit on the base, bought with mana.",
        downside: "−5% on fixed end-of-wave rewards, whether the toggle is on " +
                  "or off. It can never spend into debt.",
        resolve: function (out) {
          out.shieldMaxFractionPct += 50;
          out.shieldManaPerDamage += 25;
          out.shieldRewardPenaltyPct += 5;
        },
        short: "A toggle that buys off part of every hit with mana.",
        stats: function (r) {
          var c = r("player_shield_protective_capacitor");
          return [
            { label: "absorbs up to", value: (50 + 2 * c) + "% of a hit" },
            { label: "cost", value: (25 + c -
              r("player_shield_efficient_circuit")) + " mana a point" },
            { label: "wave rewards", value: "−5%" }
          ];
        },
      },

      {
        id: "player_no_leak_bounty",
        name: "Prime sans fuite",
        icon: 6,
        cost: 100,
        requires: ["player_guardian_bastion_pact"],
        at: at("no_leak_bounty"),
        blurb: "A wave finished without losing a single point of base health " +
               "pays 25 mana at the start of the next one.",
        upside: "+25 mana after every clean wave. A fully absorbed hit is not " +
                "a loss and keeps the streak.",
        downside: null,
        resolve: function (out) { out.noLeakBounty += 25; },
        short: "A wave that costs no health pays at the start of the next.",
        stats: function (r) {
          return [{ label: "after a clean wave",
                    value: "+" + (25 + 5 * r("player_bounty_perfect_bonus")) +
                           " mana" }];
        }
      },

      {
        id: "player_perfect_streak",
        name: "Série parfaite",
        icon: 7,
        cost: 180,
        requires: ["player_no_leak_bounty"],
        at: at("perfect_streak"),
        blurb: "Each clean wave adds a charge, up to 5. Every charge is +1% " +
               "damage on every tower. Losing base health clears them.",
        upside: "Up to +5% damage on everything, earned a wave at a time.",
        downside: "One point of base health lost and the charges are gone.",
        resolve: function (out) {
          out.streakPerChargePct += 1;
          out.streakMaxCharges = Math.max(out.streakMaxCharges, 5);
        },
        short: "Clean waves stack damage; losing health spends them.",
        stats: function (r) {
          var c = 1 + 0.2 * r("player_streak_victorious_cadence");
          var keep = r("player_streak_insurance");
          return [
            { label: "per charge", value: pct(c) + " damage" },
            { label: "at five charges", value: pct(c * 5) },
            { label: "a loss takes", value: keep ? ((5 - keep) + " charges")
                                                 : "every charge" }
          ];
        },
      },

      // --- THE TWO FUSIONS ------------------------------------------------

      {
        id: "player_blitz_doctrine",
        name: "Doctrine Blitz",
        icon: 8,
        cost: 160,
        requires: ["player_advanced_treasury", "player_commander_priority_order"],
        at: at("blitz_doctrine"),
        blurb: "Sending a wave in early pays 1 mana for every full 2 s you cut " +
               "off it, up to 35. That wave's enemies move 3% faster for their " +
               "first 8 seconds.",
        upside: "Up to 35 mana for calling a wave in early.",
        downside: "That wave arrives 3% faster for its first eight seconds. An " +
                  "automatic send at zero pays nothing and hastes nobody.",
        resolve: function (out) {
          out.blitzSecondsPerMana = 2;
          out.blitzCapMana += 35;
          out.blitzHastePct += 3;
          out.blitzHasteSeconds = 8;
        },
        short: "Calling a wave in early pays, and hastens that wave.",
        stats: function (r) {
          var d = r("player_blitz_rushed_dividend");
          return [
            { label: "1 mana per", value: round(2 - 0.05 * d) + " s cut" },
            { label: "cap", value: "35 mana" },
            { label: "that wave", value: pct(3 + 0.25 * d) + " speed for " +
              round(8 - 0.4 * r("player_blitz_controlled_arrival")) + " s" }
          ];
        },
      },

      {
        id: "player_vulnerable_totem",
        name: "Totem vulnérable",
        icon: 9,
        cost: 180,
        requires: ["player_command_beacon", "player_guardian_bastion_pact"],
        at: at("vulnerable_totem"),
        blurb: "Place one free 100 HP totem before wave 1, off the road but " +
               "within 70 u.l. of it. While it lives every tower fires 8% " +
               "faster. If it dies the base loses 15 health.",
        upside: "+8% fire rate on every tower for as long as it stands.",
        downside: "Enemies can destroy it, and its death costs the base 15 " +
                  "health — which breaks a streak and can end a run.",
        resolve: function (out) {
          out.totemHp += 100;
          out.totemFireRatePct += 8;
          out.totemDeathDamage += 15;
        },
        short: "A fragile totem hurries every tower. Its death hurts the base.",
        stats: function (r) {
          var i = r("player_totem_war_idol");
          return [
            { label: "totem health", value: String(100 - 8 * i +
              12 * r("player_totem_consecrated_stone")) },
            { label: "all towers", value: pct(8 + i) + " fire rate" },
            { label: "its death costs", value: (15 +
              r("player_totem_consecrated_stone")) + " base health" }
          ];
        },
      },

      // --- THE SECRET -----------------------------------------------------
      //
      // HIDDEN UNTIL EARNED, and hidden means `???` with no name, no price and
      // no prerequisite on the card -- see `PlayerPerks.isRevealed`. The
      // conditions are recomputed from the save every time they are asked, so
      // there is nothing to persist and a reset correctly hides it again.
      {
        id: "player_crosspath_permit",
        name: "Permis de crosspath",
        icon: 0,
        cost: 10000,
        at: at("crosspath_permit"),
        secret: {
          modules: 15,
          ranks: [
            { id: "player_architect_tolerant_connectors", rank: 5 },
            { id: "player_beacon_directional_antenna", rank: 5 },
            { id: "player_streak_insurance", rank: 3 }
          ],
          owns: ["player_vulnerable_totem"]
        },
        blurb: "Once a run, one tower may buy exactly ONE extra tier on its " +
               "secondary path — 5-3 instead of 5-2. Every in-run upgrade on " +
               "that tower then costs 25% more, the permitted one included.",
        upside: "One tower a run breaks the crosspath lock by exactly one tier.",
        downside: "+25% on every in-run upgrade that tower buys, for the rest " +
                  "of the run. One tower a run, and never two tiers.",
        resolve: function (out) { out.permitUpgradeSurchargePct += 25; },
        short: "One tower a run may buy one tier past the crosspath lock.",
        stats: function (r) {
          return [
            { label: "extra tier", value: "1, on one tower" },
            { label: "that tower's upgrades", value: "+" +
              (25 - 3 * r("player_crosspath_lighter_paperwork")) + "%" },
            { label: "unspent, it returns",
              value: r("player_crosspath_restitution_clause") ? "yes" : "no" }
          ];
        },
      }
    ],

    // =====================================================================
    // UPGRADE-SQUARED
    // =====================================================================
    upgrades2: [

      // --- under Intendant -------------------------------------------------
      {
        id: "player_intendant_catalogued_inventory",
        name: "Inventaire catalogué",
        icon: 1,
        parent: "player_intendant_diversified_arsenal",
        maxRank: 5, prices: R5,
        at: at("p_intendant_inventory"),
        upside: "The first-of-a-type discount grows 3 mana a rank.",
        downside: "The later-of-a-type surcharge grows 1 mana a rank.",
        valueAt: function (rank) {
          return "discount " + (60 + 3 * rank) + " mana · surcharge " +
                 (20 + rank) + " mana before Tolérance logistique";
        },
        resolve: function (out, rank) {
          out.firstTowerDiscount += 3 * rank;
          out.laterTowerSurcharge += rank;
        }
      },

      {
        id: "player_intendant_logistics_tolerance",
        name: "Tolérance logistique",
        icon: 2,
        parent: "player_intendant_diversified_arsenal",
        requires: [{ id: "player_intendant_catalogued_inventory", rank: 2 }],
        maxRank: 5, prices: R5,
        at: at("p_intendant_tolerance"),
        upside: "The later-of-a-type surcharge falls 1 mana a rank.",
        downside: null,
        valueAt: function (rank) {
          return "surcharge = 20 + Inventaire − " + rank +
                 " · both at 5 leaves the parent's 20; Inventaire at 0 reaches 15";
        },
        resolve: function (out, rank) { out.laterTowerSurcharge -= rank; }
      },

      // --- under Trésorerie avancée ----------------------------------------
      {
        id: "player_treasury_larger_advance",
        name: "Avance élargie",
        icon: 3,
        parent: "player_advanced_treasury",
        maxRank: 5, prices: R5,
        at: at("p_treasury_advance"),
        upside: "+20 more starting mana a rank.",
        downside: "The fixed-reward penalty deepens 0.75 points a rank.",
        valueAt: function (rank) {
          return "+" + (250 + 20 * rank) + " starting mana · rewards " +
                 pct(-(8 + 0.75 * rank)) + " before Amortissement doux";
        },
        resolve: function (out, rank) {
          out.startingManaBonus += 20 * rank;
          out.fixedWaveRewardPenaltyPct += 0.75 * rank;
        }
      },

      {
        id: "player_treasury_soft_amortization",
        name: "Amortissement doux",
        icon: 4,
        parent: "player_advanced_treasury",
        requires: [{ id: "player_treasury_larger_advance", rank: 2 }],
        maxRank: 5, prices: R5,
        at: at("p_treasury_amortization"),
        upside: "The fixed-reward penalty eases 0.4 points a rank.",
        downside: null,
        valueAt: function (rank) {
          return "penalty = 8 + 0.75 × Avance − " + round(0.4 * rank) + " per cent";
        },
        resolve: function (out, rank) { out.fixedWaveRewardPenaltyPct -= 0.4 * rank; }
      },

      // --- under Crédit d'urgence ------------------------------------------
      {
        id: "player_credit_extended_line",
        name: "Ligne étendue",
        icon: 5,
        parent: "player_emergency_credit",
        maxRank: 5, prices: R5,
        at: at("p_credit_line"),
        upside: "The debt ceiling grows 40 mana a rank, to −500.",
        downside: "The interest grows 1 point a rank, to 20%.",
        valueAt: function (rank) {
          return "down to −" + (300 + 40 * rank) + " mana · interest " +
                 (15 + rank) + "% before Refinancement";
        },
        resolve: function (out, rank) {
          out.debtLimit += 40 * rank;
          out.debtInterestPct += rank;
        }
      },

      {
        id: "player_credit_refinancing",
        name: "Refinancement",
        icon: 6,
        parent: "player_emergency_credit",
        requires: [{ id: "player_credit_extended_line", rank: 2 }],
        maxRank: 5, prices: R5,
        at: at("p_credit_refinancing"),
        upside: "The interest falls half a point a rank.",
        downside: null,
        valueAt: function (rank) {
          return "interest = 15 + Ligne − " + round(0.5 * rank) + " per cent a wave";
        },
        resolve: function (out, rank) { out.debtInterestPct -= 0.5 * rank; }
      },

      // --- under Ferrailleur -----------------------------------------------
      {
        id: "player_scrapper_recovery_team",
        name: "Équipe de récupération",
        icon: 7,
        parent: "player_scrapper",
        maxRank: 5, prices: R5,
        at: at("p_scrapper_team"),
        upside: "The destruction refund grows 2 points a rank, to 60%.",
        downside: "The health penalty deepens 1 point a rank, to −20%.",
        valueAt: function (rank) {
          return (50 + 2 * rank) + "% back · health " + pct(-(15 + rank)) +
                 " before Renforts recyclés";
        },
        resolve: function (out, rank) {
          out.destroyRefundPct += 2 * rank;
          out.towerHpPenaltyPct += rank;
        }
      },

      {
        id: "player_scrapper_recycled_bracing",
        name: "Renforts recyclés",
        icon: 8,
        parent: "player_scrapper",
        requires: [{ id: "player_scrapper_recovery_team", rank: 2 }],
        maxRank: 5, prices: R5,
        at: at("p_scrapper_bracing"),
        upside: "The health penalty eases half a point a rank.",
        downside: null,
        valueAt: function (rank) {
          return "penalty = 15 + Équipe − " + round(0.5 * rank) + " per cent";
        },
        resolve: function (out, rank) { out.towerHpPenaltyPct -= 0.5 * rank; }
      },

      // --- under Architecte ------------------------------------------------
      {
        id: "player_architect_dense_network",
        name: "Réseau dense",
        icon: 9,
        parent: "player_architect_campaign_network",
        maxRank: 5, prices: R5,
        at: at("p_architect_dense"),
        upside: "The different-type bonus grows half a point a rank.",
        downside: "The same-type penalty deepens a quarter point a rank.",
        valueAt: function (rank) {
          return "different " + pct(5 + 0.5 * rank) + " · same " +
                 pct(-(3 + 0.25 * rank)) + " before Connecteurs tolérants";
        },
        resolve: function (out, rank) {
          out.archDifferentBonusPct += 0.5 * rank;
          out.archSamePenaltyPct += 0.25 * rank;
        }
      },

      {
        id: "player_architect_tolerant_connectors",
        name: "Connecteurs tolérants",
        icon: 0,
        parent: "player_architect_campaign_network",
        requires: [
          { id: "player_architect_dense_network", rank: 2 },
          { id: "player_intendant_logistics_tolerance", rank: 2 }
        ],
        maxRank: 5, prices: F5,
        at: at("p_architect_connectors"),
        upside: "The same-type penalty eases a quarter point a rank.",
        downside: null,
        valueAt: function (rank) {
          return "penalty = 3 + 0.25 × Réseau − " + round(0.25 * rank) + " per cent";
        },
        resolve: function (out, rank) { out.archSamePenaltyPct -= 0.25 * rank; }
      },

      // --- under Plan compact ----------------------------------------------
      {
        id: "player_compact_tighter_template",
        name: "Gabarit resserré",
        icon: 1,
        parent: "player_compact_plan",
        maxRank: 5, prices: R5,
        at: at("p_compact_template"),
        upside: "One more point of footprint a rank.",
        downside: "The health penalty deepens 0.75 points a rank.",
        valueAt: function (rank) {
          return "footprint " + pct(-(10 + rank)) + " · health " +
                 pct(-(15 + 0.75 * rank)) + " before Entretoises internes";
        },
        resolve: function (out, rank) {
          out.footprintPenaltyPct += rank;
          out.towerHpPenaltyPct += 0.75 * rank;
        }
      },

      {
        id: "player_compact_internal_bracing",
        name: "Entretoises internes",
        icon: 2,
        parent: "player_compact_plan",
        requires: [{ id: "player_compact_tighter_template", rank: 2 }],
        maxRank: 5, prices: R5,
        at: at("p_compact_bracing"),
        upside: "The health penalty eases half a point a rank.",
        downside: null,
        valueAt: function (rank) {
          return "penalty = 15 + 0.75 × Gabarit − " + round(0.5 * rank) + " per cent";
        },
        resolve: function (out, rank) { out.towerHpPenaltyPct -= 0.5 * rank; }
      },

      // --- under Arsenal partagé -------------------------------------------
      {
        id: "player_arsenal_combined_doctrine",
        name: "Doctrine combinée",
        icon: 3,
        parent: "player_shared_arsenal",
        maxRank: 5, prices: R5,
        at: at("p_arsenal_doctrine"),
        upside: "+0.1 point a live type a rank, and +0.5 on the cap.",
        downside: "The duplicate-placement surcharge grows 0.2 points a rank.",
        valueAt: function (rank) {
          return "+" + round(1 + 0.1 * rank) + "% a type, cap +" +
                 round(5 + 0.5 * rank) + "% · duplicate +" +
                 round(2 + 0.2 * rank) + "% before Licences secondaires";
        },
        resolve: function (out, rank) {
          out.sharedPerTypePct += 0.1 * rank;
          out.sharedCapPct += 0.5 * rank;
          out.duplicateSurchargePct += 0.2 * rank;
        }
      },

      {
        id: "player_arsenal_secondary_licenses",
        name: "Licences secondaires",
        icon: 4,
        parent: "player_shared_arsenal",
        requires: [{ id: "player_arsenal_combined_doctrine", rank: 2 }],
        maxRank: 5, prices: R5,
        at: at("p_arsenal_licenses"),
        upside: "The duplicate-placement surcharge falls 0.2 points a rank.",
        downside: null,
        valueAt: function (rank) {
          return "surcharge = 2 + 0.2 × Doctrine − " + round(0.2 * rank) + " per cent";
        },
        resolve: function (out, rank) { out.duplicateSurchargePct -= 0.2 * rank; }
      },

      // --- under Opérateurs isolés -----------------------------------------
      {
        id: "player_operators_prepared_solitude",
        name: "Solitude préparée",
        icon: 5,
        parent: "player_isolated_operators",
        maxRank: 5, prices: R5,
        at: at("p_operators_solitude"),
        upside: "The isolated bonus grows 0.75 points a rank.",
        downside: "The crowded penalty deepens a quarter point a rank.",
        valueAt: function (rank) {
          return "alone " + pct(10 + 0.75 * rank) + " · crowded " +
                 pct(-(5 + 0.25 * rank)) + " before Coexistence mesurée";
        },
        resolve: function (out, rank) {
          out.isolatedBonusPct += 0.75 * rank;
          out.crowdedPenaltyPct += 0.25 * rank;
        }
      },

      {
        id: "player_operators_measured_coexistence",
        name: "Coexistence mesurée",
        icon: 6,
        parent: "player_isolated_operators",
        requires: [{ id: "player_operators_prepared_solitude", rank: 2 }],
        maxRank: 5, prices: R5,
        at: at("p_operators_coexistence"),
        upside: "The crowded penalty eases 0.4 points a rank.",
        downside: null,
        valueAt: function (rank) {
          return "penalty = 5 + 0.25 × Solitude − " + round(0.4 * rank) + " per cent";
        },
        resolve: function (out, rank) { out.crowdedPenaltyPct -= 0.4 * rank; }
      },

      // --- under Commandant -------------------------------------------------
      {
        id: "player_commander_extended_signal",
        name: "Signal prolongé",
        icon: 7,
        parent: "player_commander_priority_order",
        maxRank: 5, prices: R5,
        at: at("p_commander_signal"),
        upside: "The mark lasts 0.4 s longer a rank.",
        downside: "The damage penalty on the mark deepens a quarter point a rank.",
        valueAt: function (rank) {
          return "mark " + round(5 + 0.4 * rank) + " s · damage " +
                 pct(-(5 + 0.25 * rank)) + " before Code d'engagement";
        },
        resolve: function (out, rank) {
          out.markSeconds += 0.4 * rank;
          out.markDamagePenaltyPct += 0.25 * rank;
        }
      },

      {
        id: "player_commander_rules_of_engagement",
        name: "Code d'engagement",
        icon: 8,
        parent: "player_commander_priority_order",
        requires: [{ id: "player_commander_extended_signal", rank: 2 }],
        maxRank: 5, prices: R5,
        at: at("p_commander_engagement"),
        upside: "The damage penalty eases a quarter point a rank.",
        downside: null,
        valueAt: function (rank) {
          return "penalty = 5 + 0.25 × Signal − " + round(0.25 * rank) + " per cent";
        },
        resolve: function (out, rank) { out.markDamagePenaltyPct -= 0.25 * rank; }
      },

      // --- under Ordre de surcharge -----------------------------------------
      {
        id: "player_overdrive_redline",
        name: "Ligne rouge",
        icon: 9,
        parent: "player_overdrive_order",
        maxRank: 5, prices: R5,
        at: at("p_overdrive_redline"),
        upside: "+3 points of fire rate a rank.",
        downside: "The stun grows 0.15 s a rank.",
        valueAt: function (rank) {
          return pct(30 + 3 * rank) + " fire rate · stun " +
                 round(2.5 + 0.15 * rank) + " s before Reprise disciplinée";
        },
        resolve: function (out, rank) {
          out.overdriveFireRatePct += 3 * rank;
          out.overdriveStunSeconds += 0.15 * rank;
        }
      },

      {
        id: "player_overdrive_disciplined_recovery",
        name: "Reprise disciplinée",
        icon: 0,
        parent: "player_overdrive_order",
        requires: [{ id: "player_overdrive_redline", rank: 2 }],
        maxRank: 5, prices: R5,
        at: at("p_overdrive_recovery"),
        upside: "The stun falls 0.1 s a rank.",
        downside: null,
        valueAt: function (rank) {
          return "stun = 2.5 + 0.15 × Ligne rouge − " + round(0.1 * rank) + " s";
        },
        resolve: function (out, rank) { out.overdriveStunSeconds -= 0.1 * rank; }
      },

      // --- under Balayage radar ---------------------------------------------
      {
        id: "player_radar_long_echo",
        name: "Écho prolongé",
        icon: 1,
        parent: "player_radar_sweep",
        maxRank: 5, prices: R5,
        at: at("p_radar_echo"),
        upside: "The sweep lasts 0.8 s longer a rank.",
        downside: "Its cooldown grows 2 s a rank.",
        valueAt: function (rank) {
          return round(8 + 0.8 * rank) + " s of sight · " + (45 + 2 * rank) + " s cooldown";
        },
        resolve: function (out, rank) {
          out.radarSeconds += 0.8 * rank;
          out.radarCooldownSeconds += 2 * rank;
        }
      },

      {
        id: "player_radar_calibrated_optics",
        name: "Optiques calibrées",
        icon: 2,
        parent: "player_radar_sweep",
        requires: [{ id: "player_radar_long_echo", rank: 2 }],
        maxRank: 5, prices: R5,
        at: at("p_radar_optics"),
        upside: "The permanent range penalty eases a quarter point a rank, " +
                "and never past zero.",
        downside: null,
        valueAt: function (rank) {
          return "range " + pct(-Math.max(0, 3 - 0.25 * rank)) + " while equipped";
        },
        resolve: function (out, rank) { out.radarRangePenaltyPct -= 0.25 * rank; }
      },

      // --- under Balise de commandement --------------------------------------
      {
        id: "player_beacon_amplified_signal",
        name: "Signal amplifié",
        icon: 3,
        parent: "player_command_beacon",
        maxRank: 5, prices: R5,
        at: at("p_beacon_amplified"),
        upside: "+1 point of projectile speed and +1 of range a rank, inside " +
                "the circle.",
        downside: "The penalty outside deepens a quarter point a rank.",
        valueAt: function (rank) {
          return "inside " + pct(8 + rank) + " speed, " + pct(5 + rank) +
                 " range · outside " + pct(-(2 + 0.25 * rank)) +
                 " before Antenne directionnelle";
        },
        resolve: function (out, rank) {
          out.beaconSpeedPct += rank;
          out.beaconRangePct += rank;
          out.beaconFarFireRatePenaltyPct += 0.25 * rank;
        }
      },

      {
        id: "player_beacon_directional_antenna",
        name: "Antenne directionnelle",
        icon: 4,
        parent: "player_command_beacon",
        requires: [
          { id: "player_beacon_amplified_signal", rank: 2 },
          { id: "player_radar_calibrated_optics", rank: 2 }
        ],
        maxRank: 5, prices: F5,
        at: at("p_beacon_antenna"),
        upside: "The penalty outside the circle eases 0.2 points a rank.",
        downside: null,
        valueAt: function (rank) {
          return "outside = 2 + 0.25 × Signal − " + round(0.2 * rank) + " per cent";
        },
        resolve: function (out, rank) { out.beaconFarFireRatePenaltyPct -= 0.2 * rank; }
      },

      // --- under Prévision tactique ------------------------------------------
      //
      // THE TWO TIMER NODES ARE RESCALED, at the owner's word (2026-09-01). The
      // brief wrote them against a 90-second inter-wave countdown; this game has
      // none -- its transitions are 10 s before wave 1, `WAVE_CLEAR_DELAY` = 5 s
      // after a wave ends on its own and 3 s after a manual send, and what a
      // Send actually cuts is the wave's own 30-125 s window. So the ratios are
      // kept and the numbers are restated against the 5 s that exists: halved to
      // 2.5, then 2, and bought back 0.4 at a time. Doctrine Blitz needed no
      // rescale at all -- it measures the window it cut short, which is already
      // the right size for 1 mana per 2 s.
      {
        id: "player_forecast_third_dossier",
        name: "Troisième dossier",
        icon: 5,
        parent: "player_tactical_forecast",
        maxRank: 1, prices: [250],
        at: at("p_forecast_dossier"),
        upside: "A third future wave, in full.",
        downside: "The gap between waves drops from 2.5 s to 2 s.",
        valueAt: function (rank) {
          return rank ? "three waves shown · gap 2 s before Briefing méthodique"
                      : "two waves shown · gap 2.5 s";
        },
        resolve: function (out) {
          out.forecastWaves = Math.max(out.forecastWaves, 3);
          out.transitionSeconds = 2;
        }
      },

      {
        id: "player_forecast_methodical_briefing",
        name: "Briefing méthodique",
        icon: 6,
        parent: "player_tactical_forecast",
        maxRank: 5, prices: R5,
        at: at("p_forecast_briefing"),
        upside: "Buys back 0.4 s of the gap between waves a rank.",
        downside: null,
        valueAt: function (rank) {
          return "gap = 2.5 − 0.5 × Troisième dossier + " + round(0.4 * rank) +
                 " s, never past the game's own 5 s";
        },
        resolve: function (out, rank) {
          if (out.transitionSeconds === null) return;
          out.transitionSeconds += 0.4 * rank;
        }
      },

      // --- under Doctrine Blitz -----------------------------------------------
      {
        id: "player_blitz_rushed_dividend",
        name: "Dividende pressé",
        icon: 7,
        parent: "player_blitz_doctrine",
        maxRank: 5, prices: R5,
        at: at("p_blitz_dividend"),
        upside: "0.05 s less is needed per mana a rank, from 2.00 down to 1.75.",
        downside: "The wave's haste deepens a quarter point a rank.",
        valueAt: function (rank) {
          return "1 mana per " + round(2 - 0.05 * rank) + " s cut, cap 35 · haste " +
                 pct(3 + 0.25 * rank);
        },
        resolve: function (out, rank) {
          out.blitzSecondsPerMana -= 0.05 * rank;
          out.blitzHastePct += 0.25 * rank;
        }
      },

      {
        id: "player_blitz_controlled_arrival",
        name: "Arrivée contrôlée",
        icon: 8,
        parent: "player_blitz_doctrine",
        requires: [{ id: "player_blitz_rushed_dividend", rank: 2 }],
        maxRank: 5, prices: R5,
        at: at("p_blitz_arrival"),
        upside: "The haste is 0.4 s shorter a rank.",
        downside: null,
        valueAt: function (rank) {
          return "haste lasts " + round(8 - 0.4 * rank) + " s";
        },
        resolve: function (out, rank) { out.blitzHasteSeconds -= 0.4 * rank; }
      },

      // --- under Gardien --------------------------------------------------
      {
        id: "player_guardian_thick_wall",
        name: "Mur épaissi",
        icon: 9,
        parent: "player_guardian_bastion_pact",
        maxRank: 5, prices: R5,
        at: at("p_guardian_wall"),
        upside: "+5 more maximum base health a rank.",
        downside: "The starting-mana penalty deepens 8 a rank.",
        valueAt: function (rank) {
          return "+" + (50 + 5 * rank) + " base health · starting mana −" +
                 (100 + 8 * rank) + " before Réserve de garnison";
        },
        resolve: function (out, rank) {
          out.baseHpBonus += 5 * rank;
          out.startingManaPenalty += 8 * rank;
        }
      },

      {
        id: "player_guardian_garrison_reserve",
        name: "Réserve de garnison",
        icon: 0,
        parent: "player_guardian_bastion_pact",
        requires: [
          { id: "player_guardian_thick_wall", rank: 2 },
          { id: "player_treasury_soft_amortization", rank: 2 }
        ],
        maxRank: 5, prices: F5,
        at: at("p_guardian_garrison"),
        upside: "The starting-mana penalty eases 5 a rank.",
        downside: null,
        valueAt: function (rank) {
          return "penalty = 100 + 8 × Mur épaissi − " + (5 * rank) + " mana";
        },
        resolve: function (out, rank) { out.startingManaPenalty -= 5 * rank; }
      },

      // --- under Brèche contrôlée ------------------------------------------
      {
        id: "player_breach_reinforced_gate",
        name: "Porte renforcée",
        icon: 1,
        parent: "player_controlled_breach",
        maxRank: 5, prices: R5,
        at: at("p_breach_gate"),
        upside: "The first leak of a wave costs 2 points less a rank, down to " +
                "40% of its damage.",
        downside: null,
        valueAt: function (rank) {
          return "first leak costs " + (50 - 2 * rank) + "% of its damage";
        },
        resolve: function (out, rank) { out.firstLeakPct -= 2 * rank; }
      },

      // --- under Bouclier de mana ------------------------------------------
      {
        id: "player_shield_protective_capacitor",
        name: "Condensateur protecteur",
        icon: 2,
        parent: "player_mana_shield",
        maxRank: 5, prices: R5,
        at: at("p_shield_capacitor"),
        upside: "+2 points of a hit absorbable a rank, up to 60%.",
        downside: "+1 mana a rank on every point of damage prevented.",
        valueAt: function (rank) {
          return "absorbs up to " + (50 + 2 * rank) + "% at " + (25 + rank) +
                 " mana a point before Circuit sobre";
        },
        resolve: function (out, rank) {
          out.shieldMaxFractionPct += 2 * rank;
          out.shieldManaPerDamage += rank;
        }
      },

      {
        id: "player_shield_efficient_circuit",
        name: "Circuit sobre",
        icon: 3,
        parent: "player_mana_shield",
        requires: [
          { id: "player_shield_protective_capacitor", rank: 2 },
          { id: "player_credit_refinancing", rank: 2 }
        ],
        maxRank: 5, prices: F5,
        at: at("p_shield_circuit"),
        upside: "Absorption costs 1 mana less a point a rank.",
        downside: null,
        valueAt: function (rank) {
          return "cost = 25 + Condensateur − " + rank + " mana a point";
        },
        resolve: function (out, rank) { out.shieldManaPerDamage -= rank; }
      },

      // --- under Prime sans fuite -------------------------------------------
      {
        id: "player_bounty_perfect_bonus",
        name: "Prime parfaite",
        icon: 4,
        parent: "player_no_leak_bounty",
        maxRank: 5, prices: R5,
        at: at("p_bounty_perfect"),
        upside: "+5 mana a rank on the deferred bounty, up to 50.",
        downside: null,
        valueAt: function (rank) { return "+" + (25 + 5 * rank) + " mana after a clean wave"; },
        resolve: function (out, rank) { out.noLeakBounty += 5 * rank; }
      },

      // --- under Série parfaite ---------------------------------------------
      {
        id: "player_streak_victorious_cadence",
        name: "Cadence victorieuse",
        icon: 5,
        parent: "player_perfect_streak",
        maxRank: 5, prices: R5,
        at: at("p_streak_cadence"),
        upside: "+0.2 points of damage a charge a rank — +2% a charge at rank 5.",
        downside: null,
        valueAt: function (rank) {
          return round(1 + 0.2 * rank) + "% a charge, up to " +
                 round(5 + rank) + "% at five charges";
        },
        resolve: function (out, rank) { out.streakPerChargePct += 0.2 * rank; }
      },

      {
        id: "player_streak_insurance",
        name: "Assurance de série",
        icon: 6,
        parent: "player_perfect_streak",
        requires: [
          { id: "player_streak_victorious_cadence", rank: 2 },
          { id: "player_breach_reinforced_gate", rank: 3 }
        ],
        maxRank: 3, prices: F3,
        at: at("p_streak_insurance"),
        upside: "A wave's first loss of base health takes at most 5 − rank " +
                "charges instead of all of them.",
        downside: null,
        valueAt: function (rank) {
          return rank ? ("a loss takes at most " + (5 - rank) + " charges")
                      : "a loss clears every charge";
        },
        resolve: function (out, rank) {
          out.streakLossCap = Math.max(out.streakLossCap, 5 - rank);
        }
      },

      // --- under Totem vulnérable -------------------------------------------
      {
        id: "player_totem_war_idol",
        name: "Idole de guerre",
        icon: 7,
        parent: "player_vulnerable_totem",
        maxRank: 5, prices: R5,
        at: at("p_totem_idol"),
        upside: "+1 point of fire rate on every tower a rank.",
        downside: "The totem has 8 less health a rank.",
        valueAt: function (rank) {
          return pct(8 + rank) + " fire rate · totem " + (100 - 8 * rank) +
                 " HP before Pierre consacrée";
        },
        resolve: function (out, rank) {
          out.totemFireRatePct += rank;
          out.totemHp -= 8 * rank;
        }
      },

      {
        id: "player_totem_consecrated_stone",
        name: "Pierre consacrée",
        icon: 8,
        parent: "player_vulnerable_totem",
        requires: [
          { id: "player_totem_war_idol", rank: 2 },
          { id: "player_architect_tolerant_connectors", rank: 2 }
        ],
        maxRank: 5, prices: F5,
        at: at("p_totem_stone"),
        upside: "+12 totem health a rank.",
        downside: "+1 base health lost when it dies, a rank.",
        valueAt: function (rank) {
          return "totem = 100 − 8 × Idole + " + (12 * rank) + " HP · its death costs " +
                 (15 + rank) + " base health";
        },
        resolve: function (out, rank) {
          out.totemHp += 12 * rank;
          out.totemDeathDamage += rank;
        }
      },

      // --- under Permis de crosspath ----------------------------------------
      {
        id: "player_crosspath_lighter_paperwork",
        name: "Dossier allégé",
        icon: 9,
        parent: "player_crosspath_permit",
        maxRank: 5, prices: SECRET5,
        at: at("p_permit_paperwork"),
        upside: "The permitted tower's upgrade surcharge falls 3 points a " +
                "rank, from +25% to +10%.",
        downside: null,
        valueAt: function (rank) {
          return "that tower's upgrades +" + (25 - 3 * rank) + "%";
        },
        resolve: function (out, rank) { out.permitUpgradeSurchargePct -= 3 * rank; }
      },

      {
        id: "player_crosspath_restitution_clause",
        name: "Clause de restitution",
        icon: 0,
        parent: "player_crosspath_permit",
        maxRank: 1, prices: [750],
        at: at("p_permit_restitution"),
        upside: "A permit whose extra tier was never bought comes back if the " +
                "tower is sold or destroyed.",
        downside: null,
        valueAt: function (rank) {
          return rank ? "an unspent permit returns when its tower is lost"
                      : "a permit is gone the moment it is given";
        },
        resolve: function (out) { out.permitRestitution = true; }
      }
    ]
  });

  // The gap between waves as the cards print it, from whichever of the two
  // timer nodes is owned. Written once because three cards say it.
  function transitionText(r) {
    var seconds = 2.5 - 0.5 * r("player_forecast_third_dossier") +
                  0.4 * r("player_forecast_methodical_briefing");
    return round(Math.min(5, seconds));
  }
})();
