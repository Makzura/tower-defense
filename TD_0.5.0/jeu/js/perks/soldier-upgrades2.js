// ---------------------------------------------------------------------------
// The Rifleman's UPGRADE-SQUARED tree — the owner's confirmed content
//
// TWENTY-TWO NODES, EACH ONE IMPROVING ONE PERMANENT UPGRADE. An upgrade² is
// bought with meta coins, is permanent, has RANKS, and — the difference that
// matters — never occupies one of the five loadout slots. It applies only while
// the permanent upgrade it belongs to is EQUIPPED, and a FUSION applies only
// while BOTH of its upgrades are. Bought and dormant is an ordinary state: the
// ranks stay in the save, the node simply contributes nothing that run.
//
// THIS FILE IS THE SECOND HALF OF `soldier-perks.js` AND REGISTERS AGAINST THE
// SAME TOWER. `TowerPerks.register` merges by key rather than replacing the
// tree, so the order of the two <script> tags does not matter; keeping them
// apart keeps a 350-line parent file from becoming a 900-line one, and the two
// halves genuinely are different systems.
//
// **THE `id` IS THE PERSISTENCE FORMAT.** It is the key `MetaProgress` writes
// the rank under, so renaming one un-buys it for every existing player. The
// names and the icons are free at any time; these are not.
//
// **A PRICE IN `prices` IS THE PRICE OF THAT RANK ALONE**, never a cumulative
// total. Rank 3 of an S3 node costs 110, not 235. Five curves, and every node
// uses one of them unaltered:
//
//   S3  50, 75, 110                    a small three-rank refinement
//   S5  35, 50, 75, 110, 160           a small five-rank one
//   X3  80, 120, 180                   a fusion of two upgrades
//   X5  60, 90, 135, 200, 300          a five-rank fusion
//   H5  150, 250, 400, 650, 1000       the one deliberately expensive node
//
// **RANKS ARE SEQUENTIAL AND THE GRAPH IS ACYCLIC.** Rank 2 needs rank 1 of the
// same node — that rule lives in `MetaProgress.buyRank` and is not repeated
// here. `requires` is the OTHER kind: a rank of a DIFFERENT node, and a fusion
// carries two of them. Nothing below points back toward an ancestor.
//
// THE FOUR FUSIONS, and they are the only nodes with two runtime parents:
//
//   Series Ammunition      Overloaded Drum   + Commissioned Ammunition
//   Salvage Conscription   Reinforcement Manifest + Cheap Receiver
//   Officer Supply         Commissioned Ammunition + Reinforcement Manifest
//   Entrenched Ammunition  Piercing Orders   + Entrenchment Protocol
//
// A fusion whose two rank prerequisites are half met is shown as half met —
// `TowerPerks.requirementsOf` never short-circuits, so the card prints the one
// that is satisfied beside the one that is not, and the tree lights the arm
// that is paid for. It stays LOCKED until both are there.
//
// **EVERY FIELD WRITTEN BELOW IS DECLARED NEUTRAL IN `Soldier.recalcStats`**,
// which is what makes rank 0 — and a bought node whose parent is on the bench —
// resolve the identical numbers the game resolved before this file existed.
// Several of them are PERCENTAGE POINTS folded into a real stat by
// `Soldier.afterPerks`: points sum, so two nodes may move the same number
// without either knowing the other's rank or which slot it sits in.
//
// `effectsAt(rank)` RETURNS THE RESOLVED EFFECT AT THAT RANK, not an increment.
// Three nodes replace a value their parent set rather than moving it — Terminal
// Charge, Soft Feed and Battery Setup — and two of those are authored tables
// with no arithmetic between the steps. Returning the whole block lets a table
// be written as a table. `TowerPerks.activeEffects` puts every square AFTER
// every equipped perk for exactly this reason: `set` is last-writer-wins, and a
// square that landed first would be overwritten by the node it improves.
//
// **WHERE THEY SIT, AND WHY THE TREE IS SO WIDE.** The twelve permanent
// upgrades are the SPINE, on a 1.5-node lattice out from the tower along four
// arms; every square hangs off the arm its parent sits on, in the quadrant that
// arm owns -- path A north-west, general upper north-east, path B south-east,
// general lower south-west. One family per quadrant, so no two families are ever
// interleaved.
//
// SIBLINGS FAN, CHAINS EXTEND. Two squares off the same parent that do not
// require each other sit either side of it (Terminal Charge and Soft Feed;
// Deep Stakes and Battery Setup) -- and one that REQUIRES the other sits one
// step further out along the same line (Reinforced Spring then Series
// Ammunition; Hard Ratchet then Polished Wheel). The picture is the rule.
//
// THE THREE CROSSINGS ARE FORCED AND ARE DELIBERATELY MID-GAP. A fusion joins
// two families that live on opposite sides of one arm, so its second link has
// to cross that arm -- there is no placement that avoids it. Each one is aimed
// at the middle of the gap between two spine nodes rather than at a node, so it
// reads as a line passing through and never as a node with an extra parent.
// Nothing else in the tree crosses anything, and no link passes within 14 px of
// a node it does not belong to.
//
// THE ARITHMETIC IS WRITTEN AS INTEGER FRACTIONS (`15 * rank / 100`, not
// `0.15 * rank`) wherever the decimal form does not land exactly in binary.
// `0.15 * 3` is 0.44999999999999996 and `45 / 100` is 0.45; the tests assert
// the stated figures, and so should the game.
// ---------------------------------------------------------------------------

(function () {

  // The five curves, named once. A node picks one; nothing scales or derives.
  var S3 = [50, 75, 110];
  var S5 = [35, 50, 75, 110, 160];
  var X3 = [80, 120, 180];
  var X5 = [60, 90, 135, 200, 300];
  var H5 = [150, 250, 400, 650, 1000];

  // Every A and B tier the Rifleman sells, for the two nodes that surcharge or
  // discount all ten of them at once. Written as a helper because "all ten"
  // must not be able to drift into "nine".
  function everyTier(cost) {
    var out = {};
    ["A1", "A2", "A3", "A4", "A5", "B1", "B2", "B3", "B4", "B5"]
      .forEach(function (id) { out[id] = { cost: cost }; });
    return out;
  }

  // The five A tiers only.
  function aTiers(cost) {
    var out = {};
    ["A1", "A2", "A3", "A4", "A5"].forEach(function (id) {
      out[id] = { cost: cost };
    });
    return out;
  }

  // A signed percentage, for the description lines. "+6%" and "−4%" rather than
  // "6%" and "-4%", so a card never has to guess which way a number goes.
  function pct(v) {
    var rounded = Math.round(v * 1000) / 1000;
    return (rounded >= 0 ? "+" : "−") + Math.abs(rounded) + "%";
  }

  TowerPerks.register({
    towerId: "soldier",
    upgrades2: [

      // === PATH A ==========================================================

      // THE SHOT OVERLOADED DRUM CREATED IS THE ONE THE BURST OWES LAST — five
      // of five at A3, six of six at A5 — so `Soldier.update` pays this flat
      // amount on `burstShotsLeft === 1` and only while `hasA3` is true. No
      // other round in the burst sees a point of it, and an automatic Rifleman
      // (B3) never reaches the burst block at all, so it gains nothing here for
      // exactly the reason its parent gains nothing.
      //
      // IT GOES IN BEFORE THE MULTIPLIER. At Breach Chamber the last round is
      // doubled, and it is the WHOLE round that doubles — this flat included —
      // which is what "part of the added projectile's raw damage, before
      // ordinary shot multipliers" says. Mitigation then applies to the total
      // exactly as it does to any other shot.
      {
        id: "rifleman_overloaded_reinforced_spring",
        name: "Reinforced Spring",
        icon: 5,
        parent: "rif_a1",
        maxRank: 3,
        prices: S3,
        at: { x: -1.5, y: -1.5 },
        upside: "The one shot Overloaded Drum added hits for +2 flat more a rank.",
        downside: null,
        valueAt: function (rank) {
          return "+" + (2 * rank) + " flat on the added shot; every other " +
                 "shot in the burst is untouched";
        },
        effectsAt: function (rank) {
          return { when: [{ has: "hasA3", add: { drumShotFlatDamage: 2 * rank } }] };
        }
      },

      // A FUSION, AND THE SURCHARGE IS THE POINT OF IT. Two hundredths of a
      // point of damage on one round of one burst is not what 80 coins buys —
      // what it buys is a Rifleman whose path A is dearer to climb, in exchange
      // for a drum that keeps getting heavier. The surcharge lands once on each
      // A tier and never on a B tier, and it reaches the player through
      // `tiers`, which the panel button, the hover card, the affordability
      // check and the till all read.
      {
        id: "rifleman_overloaded_series_ammunition",
        name: "Series Ammunition",
        icon: 6,
        parent: "rif_a1",
        alsoParent: "rif_n1",
        requires: [
          { id: "rifleman_overloaded_reinforced_spring", rank: 2 },
          { id: "rifleman_commissioned_premium_lot", rank: 2 }
        ],
        maxRank: 3,
        prices: X3,
        at: { x: -1.5, y: -3 },
        upside: "The Overloaded Drum shot gains another +0.10 flat a rank.",
        downside: "Every A tier costs +2 mana a rank. B tiers are untouched.",
        valueAt: function (rank) {
          return "+" + (rank / 10) + " flat on the added shot · A1–A5 cost +" +
                 (2 * rank) + " mana each";
        },
        effectsAt: function (rank) {
          return {
            when: [{ has: "hasA3", add: { drumShotFlatDamage: rank / 10 } }],
            tiers: aTiers(2 * rank)
          };
        }
      },

      // A TABLE, NOT A FORMULA, and a REPLACEMENT rather than a multiplier on
      // top: rank 3 is ×2.50 total and not ×2 × something. The steps widen on
      // purpose (0.10, 0.15, 0.25) and there is no arithmetic that produces
      // them, which is why `effectsAt` returns the resolved value.
      //
      // "The final shot" is whichever shot the burst owes LAST — six with
      // Overloaded Drum, five without — and a burst that collapses before it
      // promotes nobody: the parent's rule is untouched here.
      {
        id: "rifleman_breach_terminal_charge",
        name: "Terminal Charge",
        icon: 7,
        parent: "rif_a2",
        maxRank: 3,
        prices: S3,
        at: { x: -3, y: -1.5 },
        upside: "Breach Chamber's final shot hits harder: ×2.10, ×2.25, ×2.50.",
        downside: null,
        valueAt: function (rank) {
          return "final shot ×" +
            [2, 2.1, 2.25, 2.5][rank].toFixed(2) +
            " · the −10% on every earlier shot is unchanged";
        },
        effectsAt: function (rank) {
          return {
            when: [{
              has: "hasA5",
              set: { burstFinalShotMult: [2, 2.1, 2.25, 2.5][rank] }
            }]
          };
        }
      },

      // THE OTHER HALF OF BREACH CHAMBER, and its own branch: Terminal Charge
      // is NOT a prerequisite, so a player may buy the risk down without ever
      // buying the reward up. Half a point a rank, so the penalty walks from
      // −10% to −7.5% and never reaches zero — the trade stays a trade.
      {
        id: "rifleman_breach_soft_feed",
        name: "Soft Feed",
        icon: 8,
        parent: "rif_a2",
        maxRank: 5,
        prices: S5,
        at: { x: -3, y: 1.5 },
        upside: "Breach Chamber's penalty on the earlier shots eases by " +
                "0.5 points a rank.",
        downside: null,
        valueAt: function (rank) {
          return "earlier shots " + pct(-(10 - 0.5 * rank)) +
                 " · the final shot never took this penalty";
        },
        effectsAt: function (rank) {
          return {
            when: [{
              has: "hasA5",
              set: { burstEarlyShotMult: 1 - (10 - 0.5 * rank) / 100 }
            }]
          };
        }
      },

      // BOTH ENDS OF THE RATCHET, TOGETHER. The reward gets better and the
      // failure gets worse by the same 0.8 points a rank, so this sharpens the
      // node rather than improving it — a Rifleman that finishes its bursts
      // wants this and one that keeps losing them does not.
      //
      // POINTS, NOT MULTIPLIERS. Polished Wheel moves the same reward and the
      // two must compose without either knowing the other's rank; see the note
      // on `ratchetGainPoints` in `Soldier.recalcStats`.
      {
        id: "rifleman_ratchet_hard_ratchet",
        name: "Hard Ratchet",
        icon: 9,
        parent: "rif_a3",
        maxRank: 3,
        prices: S3,
        at: { x: -4.5, y: -1.5 },
        upside: "A clean burst shortens the next cycle by another 0.8 points " +
                "a rank.",
        downside: "A collapsed burst lengthens it by another 0.8 points a rank.",
        valueAt: function (rank) {
          return "clean " + pct(-(12 + 8 * rank / 10)) + " · collapsed " +
                 pct(15 + 8 * rank / 10);
        },
        effectsAt: function (rank) {
          return {
            add: {
              ratchetGainPoints: 8 * rank / 10,
              ratchetLossPoints: 8 * rank / 10
            }
          };
        }
      },

      // THE REWARD ONLY, and that is the whole of it: after Hard Ratchet has
      // sharpened both ends, this bends one of them back. At Hard Ratchet 3 and
      // this at 5 the reward is −16.4% against a failure still at +17.4%.
      {
        id: "rifleman_ratchet_polished_wheel",
        name: "Polished Wheel",
        icon: 0,
        parent: "rif_a3",
        requires: [{ id: "rifleman_ratchet_hard_ratchet", rank: 2 }],
        maxRank: 5,
        prices: S5,
        at: { x: -4.5, y: -3 },
        upside: "A clean burst shortens the next cycle by another 0.4 points " +
                "a rank.",
        downside: null,
        valueAt: function (rank) {
          return "+" + (4 * rank / 10) + " points of reward · the collapsed-burst " +
                 "penalty is untouched";
        },
        effectsAt: function (rank) {
          return { add: { ratchetGainPoints: 4 * rank / 10 } };
        }
      },

      // === PATH B ==========================================================

      // TOUGHER RECRUITS AND A DEARER B4/B5. The health is percentage POINTS of
      // the recruit's maximum, summed with Rapid Muster's −10 and Medical
      // Selection's give-back and applied once — so "−10 then +6" is −4 and not
      // ×0.9 × 1.06. See `Soldier.afterPerks`.
      //
      // THE RECRUIT COUNT IS NOT TOUCHED. B4 still sends 3 and B5 still sends
      // 5; the parent's single +1 on the resolved number is the whole of that
      // progression and a second one would make it six.
      {
        id: "rifleman_manifest_reinforced_contracts",
        name: "Reinforced Contracts",
        icon: 1,
        parent: "rif_b1",
        maxRank: 3,
        prices: S3,
        at: { x: 1.5, y: 1.5 },
        upside: "Every recruit carries +2 points of maximum health a rank.",
        downside: "The Manifest's surcharge grows: B4 +10 mana a rank, " +
                  "B5 +15 mana a rank.",
        valueAt: function (rank) {
          return "recruits " + pct(2 * rank) + " health · B4 +" +
                 (200 + 10 * rank) + " mana · B5 +" + (350 + 15 * rank) + " mana";
        },
        effectsAt: function (rank) {
          return {
            add: { recruitHpPoints: 2 * rank },
            tiers: { B4: { cost: 10 * rank }, B5: { cost: 15 * rank } }
          };
        }
      },

      // A FUSION WHOSE UPSIDE IS ON ONE BODY AND WHOSE COST IS ON ALL OF THEM.
      // The health goes to the recruits of the FIRST Rifleman placed this run
      // and to nobody else — `Soldier.afterPerks` reads `perkFirstOfType`,
      // which `TowerPerks.applyTo` stamps as a tower joins the board and never
      // moves again, so selling that Rifleman does not hand the title on.
      //
      // The delay is on EVERY Rifleman's squad, and it is ONE delay in front of
      // the whole group rather than one between each pair: `callRecruits` adds
      // it to every timer equally, so the stagger inside the group is exactly
      // what it was and the squad simply arrives late as a squad.
      {
        id: "rifleman_manifest_salvage_conscription",
        name: "Salvage Conscription",
        icon: 2,
        parent: "rif_b1",
        alsoParent: "rif_s1",
        requires: [
          { id: "rifleman_manifest_reinforced_contracts", rank: 2 },
          { id: "rifleman_cheap_sorted_parts", rank: 2 }
        ],
        maxRank: 3,
        prices: X3,
        at: { x: 1.5, y: 3 },
        upside: "The FIRST Rifleman placed sends recruits with +2% maximum " +
                "health a rank.",
        downside: "Every Rifleman's squad arrives 0.15 s later a rank. The " +
                  "spacing inside the squad is unchanged.",
        valueAt: function (rank) {
          return "first Rifleman's recruits " + pct(2 * rank) + " health · " +
                 "every squad delayed " + (15 * rank / 100) + " s";
        },
        effectsAt: function (rank) {
          return {
            add: {
              recruitHpFirstPoints: 2 * rank,
              recruitDeploySeconds: 15 * rank / 100
            }
          };
        }
      },

      // RAPID MUSTER'S PENALTY, BOUGHT BACK A POINT AT A TIME: −10 becomes
      // −(10 − rank), so rank 5 leaves a −5% that is still a penalty. The
      // 40-second cooldown Rapid Muster buys is untouched, which is the reason
      // this node is worth anything: the speed was never the cost.
      {
        id: "rifleman_rapid_medical_selection",
        name: "Medical Selection",
        icon: 3,
        parent: "rif_b2",
        maxRank: 5,
        prices: S5,
        at: { x: 3, y: 1.5 },
        upside: "Rapid Muster's health penalty eases by 1 point a rank.",
        downside: null,
        valueAt: function (rank) {
          return "recruits " + pct(-(10 - rank)) +
                 " health from Rapid Muster · the 40 s cooldown is unchanged";
        },
        effectsAt: function (rank) {
          return { add: { recruitHpPoints: rank } };
        }
      },

      // FRACTIONAL ARMOR BYPASS IS VALID and is why this is 0.15 a rank rather
      // than a whole point: `js/systems/mitigation.js` subtracts the bypass
      // from the enemy's flat armor, clamps the result at zero and never edits
      // the body's own number. It is emphatically NOT percentage defence — that
      // is `defenseFlatPierce` and belongs to B4, and the two are separate
      // arguments all the way down precisely so this node cannot become that
      // one.
      {
        id: "rifleman_piercing_carbide_tip",
        name: "Carbide Tip",
        icon: 4,
        parent: "rif_b3",
        maxRank: 3,
        prices: S3,
        at: { x: 4.5, y: 1.5 },
        upside: "The Rifleman and its recruits ignore another 0.15 flat " +
                "armor a rank.",
        downside: "Piercing Orders' fire-rate penalty deepens by 0.3 points " +
                  "a rank.",
        valueAt: function (rank) {
          return (2 + 15 * rank / 100) + " flat armor ignored · fire rate " +
                 pct(-(5 + 3 * rank / 10));
        },
        effectsAt: function (rank) {
          return {
            when: [{
              has: "hasB3",
              add: {
                armorPierce: 15 * rank / 100,
                recruitArmorPierce: 15 * rank / 100,
                piercingRatePenaltyPoints: 3 * rank / 10
              }
            }]
          };
        }
      },

      // A FUSION THAT ONLY PAYS WHILE THE RECRUIT IS STANDING STILL. The extra
      // bypass is on `entrenchArmorPierce`, which `SoldierRecruit` folds in
      // only while `entrenched` is true — and entrenchment is cleared in the
      // same frame a recruit takes a step, so the bypass goes with it and
      // nothing has to expire it.
      //
      // THE RANGE POINTS ARE A SUM WITH DEEP STAKES', which is what "add Deep
      // Stakes' points before subtracting this one" means: 25 + stakes − this,
      // in one addition, with no order for anyone to remember. Without Deep
      // Stakes that is +24 down to +20.
      {
        id: "rifleman_piercing_entrenched_ammunition",
        name: "Entrenched Ammunition",
        icon: 5,
        parent: "rif_b3",
        alsoParent: "rif_b4",
        requires: [
          { id: "rifleman_piercing_carbide_tip", rank: 2 },
          { id: "rifleman_entrenchment_deep_stakes", rank: 2 }
        ],
        maxRank: 5,
        prices: X5,
        at: { x: 5.25, y: 3 },
        upside: "A DUG-IN recruit ignores another 0.20 flat armor a rank.",
        downside: "That recruit's dug-in range bonus drops by 1 point a rank.",
        valueAt: function (rank) {
          return "+" + (2 * rank / 10) + " flat armor while dug in · dug-in " +
                 "range " + pct(25 - rank) + " before Deep Stakes";
        },
        effectsAt: function (rank) {
          return {
            add: {
              recruitEntrenchArmorPierce: 2 * rank / 10,
              entrenchRangePoints: -rank
            }
          };
        }
      },

      // ALL THREE OF THE DUG-IN BONUSES AT ONCE, a point a rank, against half a
      // second on the recruit cooldown. The cooldown seconds go on whatever the
      // PAIR RULE resolved — 55 alone, 45 beside Rapid Muster — which is what
      // makes the node's two stated tables one line in
      // `resolvedRecruitCooldown` rather than two cases.
      {
        id: "rifleman_entrenchment_deep_stakes",
        name: "Deep Stakes",
        icon: 6,
        parent: "rif_b4",
        maxRank: 3,
        prices: S3,
        at: { x: 6, y: 1.5 },
        upside: "A dug-in recruit gains a point a rank on all three: range, " +
                "fire rate and damage reduction.",
        downside: "The recruit cooldown grows by 0.5 s a rank.",
        valueAt: function (rank) {
          return "dug in " + pct(25 + rank) + " range, " + pct(25 + rank) +
                 " fire rate, " + (25 + rank) + "% less damage · cooldown +" +
                 (5 * rank / 10) + " s";
        },
        effectsAt: function (rank) {
          return {
            add: {
              entrenchRangePoints: rank,
              entrenchRatePoints: rank,
              entrenchDamageCutPoints: rank,
              recruitCooldownEntrenchExtra: 5 * rank / 10
            }
          };
        }
      },

      // THE ONE DELIBERATELY EXPENSIVE NODE IN THE TREE, on its own curve. A
      // table again, and the steps accelerate — 0.05, 0.10, 0.15, 0.20, 0.25 —
      // so the last rank is worth its thousand coins and the first four are a
      // ladder to it. Three quarters of a second is a recruit that digs in
      // almost as soon as it stops.
      //
      // It is a SEPARATE BRANCH under Entrenchment Protocol: Deep Stakes is not
      // a prerequisite, so the threshold may be bought without the bonuses.
      // Movement still clears the state instantly and a broken burst of fire
      // still resets the progress — this moves the threshold and nothing else.
      {
        id: "rifleman_entrenchment_battery_setup",
        name: "Battery Setup",
        icon: 7,
        parent: "rif_b4",
        maxRank: 5,
        prices: H5,
        at: { x: 6, y: -1.5 },
        upside: "A recruit digs in sooner: 1.45 s, 1.35, 1.20, 1.00, 0.75.",
        downside: null,
        valueAt: function (rank) {
          return "digs in after " +
            [1.5, 1.45, 1.35, 1.2, 1, 0.75][rank].toFixed(2) +
            " s of standing and firing";
        },
        effectsAt: function (rank) {
          return {
            set: {
              recruitEntrenchSeconds: [1.5, 1.45, 1.35, 1.2, 1, 0.75][rank]
            }
          };
        }
      },

      // === GENERAL UPPER ===================================================

      // A TOTAL, NOT A PER-RANK STEP, and the blurb says so because the shape
      // is unusual: +0.05 at rank 1, +0.10 at rank 2, +0.15 at rank 3. On a
      // Rifleman whose base damage Commissioned Ammunition has just doubled to
      // 2, fifteen hundredths is a real number and the ten tiers pay for it.
      {
        id: "rifleman_commissioned_premium_lot",
        name: "Premium Lot",
        icon: 8,
        parent: "rif_n1",
        maxRank: 3,
        prices: S3,
        at: { x: 1.5, y: -2.1 },
        upside: "Every Rifleman shot gains flat base damage: +0.05, +0.10, +0.15.",
        downside: "Every A and B tier costs more: +5, +10, +15 mana.",
        valueAt: function (rank) {
          return "+" + [0, 0.05, 0.1, 0.15][rank] + " base damage · every tier +" +
                 [0, 5, 10, 15][rank] + " mana";
        },
        effectsAt: function (rank) {
          return {
            add: { damage: [0, 0.05, 0.1, 0.15][rank] },
            tiers: everyTier([0, 5, 10, 15][rank])
          };
        }
      },

      // IT DISCOUNTS ONE SURCHARGE AND NOT THE BILL. Commissioned Ammunition
      // charges +50 a tier; this walks that to +25 and stops, and it reaches no
      // further — Premium Lot's, Series Ammunition's, the Manifest's,
      // Reinforced Contracts' and Officer Supply's surcharges are separate
      // components and are all still there. Every one of them is a flat delta
      // summed once by `TowerPerks.tierCostDelta`, so what the panel quotes,
      // what the affordability check tests and what the till takes are the same
      // number by construction.
      {
        id: "rifleman_commissioned_volume_discount",
        name: "Volume Discount",
        icon: 9,
        parent: "rif_n1",
        maxRank: 5,
        prices: S5,
        at: { x: 1.5, y: -0.9 },
        upside: "Commissioned Ammunition's own surcharge falls by 5 mana a " +
                "rank: +45 down to +25.",
        downside: null,
        valueAt: function (rank) {
          return "Commissioned Ammunition now charges +" + (50 - 5 * rank) +
                 " a tier · no other surcharge is discounted";
        },
        effectsAt: function (rank) {
          return { tiers: everyTier(-5 * rank) };
        }
      },

      // THE RECRUITS' RIFLES, and only their rifles. A recruit's BODY BLOCK is
      // a shared health exchange through SummonContact and is not its firearm,
      // so it gains nothing here — the same carve-out Piercing Orders makes,
      // and for the same reason.
      {
        id: "rifleman_commissioned_officer_supply",
        name: "Officer Supply",
        icon: 0,
        parent: "rif_n1",
        alsoParent: "rif_b1",
        requires: [
          { id: "rifleman_commissioned_premium_lot", rank: 2 },
          { id: "rifleman_manifest_reinforced_contracts", rank: 2 }
        ],
        maxRank: 3,
        prices: X3,
        at: { x: 3.6, y: -2.1 },
        upside: "Every recruit's shots gain +0.10 flat damage a rank.",
        downside: "The Manifest's B4 and B5 surcharges each grow by +5 mana " +
                  "a rank.",
        valueAt: function (rank) {
          return "recruit shots +" + (rank / 10) + " damage · B4 and B5 each +" +
                 (5 * rank) + " mana on top of the Manifest";
        },
        effectsAt: function (rank) {
          return {
            add: { recruitDamage: rank / 10 },
            tiers: { B4: { cost: 5 * rank }, B5: { cost: 5 * rank } }
          };
        }
      },

      // REACH, AND ONLY REACH. Long Glass buys two things and this improves
      // one: a unit a rank on the range, nothing on the muzzle velocity. The
      // placement price is where it is paid, so this is felt before the tower
      // has fired a shot — at rank 3 a Rifleman with Long Glass reaches 113
      // and costs 365 to stand up.
      {
        id: "rifleman_long_glass_extended_lens",
        name: "Extended Lens",
        icon: 1,
        parent: "rif_n2",
        maxRank: 3,
        prices: S3,
        at: { x: 1.5, y: -3.6 },
        upside: "+1 u.l. of range a rank.",
        downside: "+5 mana on the placement price a rank.",
        valueAt: function (rank) {
          return "Long Glass now reads +" + (10 + rank) + " range, +25% " +
                 "projectile speed, +" + (50 + 5 * rank) + " mana placement";
        },
        effectsAt: function (rank) {
          return { add: { rangeUl: rank }, price: { add: 5 * rank } };
        }
      },

      // WHAT ONE KILL BUYS BACK, and nothing else about the node moves: the
      // wave still opens on −6% and the ceiling is still the ceiling. A faster
      // climb to the same roof is the whole of it — which is why the roof is
      // Decorated Ceiling's business and not this one's.
      {
        id: "rifleman_veteran_campaign_tempo",
        name: "Campaign Tempo",
        icon: 2,
        parent: "rif_n3",
        maxRank: 3,
        prices: S3,
        at: { x: 1.5, y: -4.8 },
        upside: "Each qualifying kill buys back 0.15 points more: +2.15, " +
                "+2.30, +2.45.",
        downside: null,
        valueAt: function (rank) {
          return "+" + ((200 + 15 * rank) / 100) + " points a kill · the −6% " +
                 "opening and the ceiling are unchanged";
        },
        effectsAt: function (rank) {
          return { set: { rhythmPerKill: (200 + 15 * rank) / 10000 } };
        }
      },

      // THE ROOF. Half a point a rank on what kills may earn, so the band's top
      // walks from +12 to +14.5 — and against the −6% the wave still opens on,
      // the best a Rifleman can be is +8.5%. Rifleman and recruit kills still
      // count exactly once between them, and the stacks still clear at the wave
      // boundary; this raises the ceiling and touches nothing else.
      {
        id: "rifleman_veteran_decorated_ceiling",
        name: "Decorated Ceiling",
        icon: 3,
        parent: "rif_n3",
        requires: [{ id: "rifleman_veteran_campaign_tempo", rank: 2 }],
        maxRank: 5,
        prices: S5,
        at: { x: 3, y: -4.8 },
        upside: "Kills may earn 0.5 points more a rank: +12.5 up to +14.5.",
        downside: null,
        valueAt: function (rank) {
          return "kills earn up to " + pct(12 + 5 * rank / 10) +
                 " · best net " + pct(6 + 5 * rank / 10) + " after the opening −6%";
        },
        effectsAt: function (rank) {
          return { set: { rhythmEarnedCap: (1200 + 50 * rank) / 10000 } };
        }
      },

      // === GENERAL LOWER ===================================================

      // ONE TIER PER BODY, WHICHEVER TIER IT IS. The discount lives on
      // `Soldier.upgradeCost`, so the panel button, the hover card, the
      // affordability check and the till all quote it; it is SPENT by
      // `applyUpgrade`, which only a completed purchase reaches — hovering,
      // previewing, failing on mana or clicking away all leave it standing.
      //
      // The floor is the game's ordinary one: `TowerPerks` clamps a tier price
      // at zero, so a deep discount can reach the minimum and can never pay the
      // player for upgrading.
      {
        id: "rifleman_cheap_sorted_parts",
        name: "Sorted Parts",
        icon: 4,
        parent: "rif_s1",
        maxRank: 5,
        prices: S5,
        at: { x: -1.5, y: 1.5 },
        upside: "Each Rifleman's FIRST tier purchase costs 5 mana less a rank.",
        downside: null,
        valueAt: function (rank) {
          return "−" + (5 * rank) + " mana on the first tier bought on each " +
                 "Rifleman, A1 or B1 alike";
        },
        effectsAt: function (rank) {
          return { add: { firstTierDiscount: 5 * rank } };
        }
      },

      // BOTH ENDS OF ADVANCE UNIT, WIDENED. The opener gets cheaper by 10 a
      // rank and everything after it dearer by 4, and both are ordinary
      // additions on the type's base — so they compose with Cheap Receiver by
      // summing and cannot depend on which slot anything sits in: 300 − 50 −
      // 150 = 100 for the first, 300 − 50 + 60 = 310 for every one after.
      {
        id: "rifleman_advance_aggressive_contract",
        name: "Aggressive Contract",
        icon: 5,
        parent: "rif_s2",
        maxRank: 5,
        prices: S5,
        at: { x: -1.5, y: 2.4 },
        upside: "The first Rifleman of a run costs another 10 mana less a rank.",
        downside: "Every Rifleman after it costs another 4 mana more a rank.",
        valueAt: function (rank) {
          return "first −" + (100 + 10 * rank) + " mana · later +" +
                 (40 + 4 * rank) + " mana";
        },
        effectsAt: function (rank) {
          return { price: { firstAdd: -10 * rank, laterAdd: 4 * rank } };
        }
      },

      // THREE WAVES ON ONE BODY, AND THEN NEVER AGAIN. The window is derived
      // rather than stored — `Soldier.firstDeploymentActive` is
      // `perkFirstOfType && wavesOpened < 3` — so it is right the instant the
      // tower is placed, right through the gaps between its three waves, and
      // gone the moment the fourth is announced.
      //
      // A Rifleman placed INTO a running wave counts that wave as its first:
      // `addTower` calls `onWaveStart` for it, which is the same hook
      // `beginWave` calls for everything already standing. Selling it hands the
      // bonus to nobody; there is exactly one first Rifleman a run.
      //
      // It multiplies the RESOLVED range, so it is a percentage of whatever the
      // tower actually reached — base, tiers, Long Glass and Extended Lens all
      // included — and the build ghost draws the ring the placed tower will get
      // (see `previewRangePx`).
      {
        id: "rifleman_advance_first_deployment",
        name: "First Deployment",
        icon: 6,
        parent: "rif_s2",
        maxRank: 5,
        prices: S5,
        at: { x: -1.5, y: 3.6 },
        upside: "The FIRST Rifleman placed reaches 5% further a rank for its " +
                "first three waves.",
        downside: null,
        valueAt: function (rank) {
          return pct(5 * rank) + " resolved range for three waves · gone at " +
                 "the opening of the fourth, and never transfers";
        },
        effectsAt: function (rank) {
          return {
            when: [{
              has: "firstDeploymentActive",
              // `mulAfter`, NOT `mul`. The node pays a percentage of the
              // RESOLVED reach, and Long Glass and Extended Lens have already
              // added their units by the time this lands -- on a 113 that is
              // 141.25 and not the 138 a `mul` on the base would give. See the
              // vocabulary note in js/systems/tower-perks.js.
              mulAfter: { rangeUl: 1 + 5 * rank / 100 }
            }]
          };
        }
      }
    ]
  });
})();
