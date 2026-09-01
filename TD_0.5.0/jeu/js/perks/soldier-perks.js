// ---------------------------------------------------------------------------
// The Rifleman's permanent tree — the owner's confirmed content
//
// TWELVE NODES, ONE CHAIN PER ARM, AND THE BRANCHES ARE DELIBERATELY UNFINISHED. This
// replaced the four-node first pass on 2026-08-31; every number below is the
// owner's own, out of the confirmed list, and NOTHING here was invented to fill
// a gap. A branch that stops after two nodes stops there because the rest has
// not been designed yet:
//
//   north  the general upper branch -- 3 of an unknown number
//   south  the general lower branch -- 2
//   west   path A -- 3 (a fourth, "Marked Quarry", was liked and never costed)
//   east   path B -- 4 (a fifth was proposed and never given a value)
//
// DO NOT FILL THE GAPS, do not add a Mastery, and do not invent a child: the
// missing nodes are missing on purpose and their absence is the record of what
// has and has not been decided.
//
// **EACH ARM IS A CHAIN** (2026-08-31, at the owner's word). The node beside
// the tower is that branch's root; every node further out REQUIRES the one
// before it, so a branch is bought from the centre outwards and cannot be
// skipped into. The tree screen draws its links straight off `requires` -- a
// root to the tower, a child to its parent -- so moving a prerequisite here
// moves the line and the lock together, and nothing has to be told twice.
//
// **THE `id` IS THE PERSISTENCE FORMAT** -- it is what the save writes down, so
// renaming one un-buys it for every existing player. The four ids that predate
// this pass (`rif_n1`, `rif_s1`, `rif_a1`, `rif_b1`) are therefore KEPT, and
// only their display names changed; the new eight follow the same
// branch-and-index scheme. The name and the icon are free at any time.
//
// EVERY NODE IS minLevel 0. All twelve can be bought the moment the tower is
// owned and the coins are there. None can be EQUIPPED until the Rifleman
// reaches level 1, because a level-0 tower has no slots -- buying and equipping
// are different things.
//
// THE SURCHARGES ARE IN MANA, DURING A RUN, and never in meta coins. They reach
// the player through `tiers`, which wraps the tower's own `upgradeCost(id)`, so
// the panel button, the hover card, the affordability check and the till all
// quote the same number. The build price is a separate field (`price`) and no
// tier surcharge ever touches it.
//
// EVERY FIELD WRITTEN BELOW IS DECLARED NEUTRAL IN `Soldier.recalcStats`, which
// is what makes an unequipped node do literally nothing -- see the block of
// them there.
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "soldier",
  nodes: [

    // === general upper ======================================================

    // 1 -> 2 base damage is a DOUBLING on this tower, which is why every one of
    // the ten tiers pays 50 mana for it rather than a subset. The placement
    // price is deliberately untouched: this node is what a Rifleman becomes
    // after it is standing, not what it costs to stand it up.
    {
      id: "rif_n1",
      name: "Commissioned Ammunition",
      icon: 0,
      blurb: "+1 base damage per shot (1 → 2). Every A and B tier costs 50 " +
             "more mana. Placement unchanged.",
      cost: 100,
      minLevel: 0,
      at: { x: 0, y: -1 },
      effects: {
        add: { damage: 1 },
        tiers: {
          A1: { cost: 50 }, A2: { cost: 50 }, A3: { cost: 50 },
          A4: { cost: 50 }, A5: { cost: 50 },
          B1: { cost: 50 }, B2: { cost: 50 }, B3: { cost: 50 },
          B4: { cost: 50 }, B5: { cost: 50 }
        }
      }
    },

    // REACH AND MUZZLE VELOCITY ARE TWO PURCHASES, not one. `rangeUl` is how
    // far it may shoot; `projectileSpeedMult` is only how long the round is in
    // the air. A faster bullet arrives sooner -- which matters against a
    // sprinter walking out of the aim point -- and goes no further.
    {
      id: "rif_n2",
      name: "Long Glass",
      icon: 1,
      blurb: "+10 u.l. base range (100 → 110) and rounds fly 25% faster. " +
             "Placement 300 → 350. Faster rounds do not reach further.",
      cost: 90,
      minLevel: 0,
      requires: ["rif_n1"],
      at: { x: 0, y: -2 },
      effects: {
        add: { rangeUl: 10 },
        mul: { projectileSpeedMult: 1.25 },
        price: { add: 50 }
      }
    },

    // A WAVE-LOCAL BAND, -6% TO +6%, and the tower has to earn its way across
    // it every wave. Six kills is the whole of the climb (6 x 2 = +12 against
    // the -6 it opened on); the stacks are cleared at the wave boundary by
    // `Soldier.onWaveBoundary`, which endWave calls.
    //
    // The kills counted are the TOWER's own `kills`, which a recruit's bullet
    // already credits to its owner -- so a recruit's kill counts exactly once,
    // not once as its own and once as its parent's.
    {
      id: "rif_n3",
      name: "Veteran Rhythm",
      icon: 2,
      blurb: "Opens every wave at −6% fire rate. Each kill by this Rifleman or " +
             "its recruits adds +2 points, up to +12 — so at best +6% for the " +
             "rest of that wave. Resets each wave.",
      cost: 130,
      minLevel: 0,
      requires: ["rif_n2"],
      at: { x: 0, y: -3 },
      effects: {
        // THE CEILING IS IN THE SAME UNITS AS THE GAIN, not in kills
        // (2026-09-01). 6 x 0.02 is 0.12 either way, so this is the identical
        // node it was; Campaign Tempo and Decorated Ceiling then move the gain
        // and the ceiling independently, which a kill count could not express.
        set: { rhythmStartMult: 0.94, rhythmPerKill: 0.02, rhythmEarnedCap: 0.12 }
      }
    },

    // === general lower ======================================================

    // 250 against a 600 stake is two Riflemen on wave one with 100 left over.
    // It touches nothing else on purpose -- no damage, no tier price -- so it
    // is the node a player takes when the problem is the opening and not the
    // ceiling.
    {
      id: "rif_s1",
      name: "Cheap Receiver",
      icon: 3,
      blurb: "Placement 300 → 250. No tier price changes.",
      cost: 60,
      minLevel: 0,
      at: { x: 0, y: 1 },
      effects: { price: { add: -50 } }
    },

    // ONE CHEAP OPENER AND A DEARER LINE BEHIND IT. `firstAdd` and `laterAdd`
    // are the same delta channel picked by how many of this type are already
    // standing THIS RUN (js/systems/tower-perks.js), counted from `addTower` --
    // a hover, a ghost or a refused click never moves it.
    //
    // Both are ordinary additions on the type's base, so this composes with
    // Cheap Receiver by summing and cannot depend on slot order:
    // 300 - 50 - 100 = 150 for the first, 300 - 50 + 40 = 290 for every one
    // after it.
    {
      id: "rif_s2",
      name: "Advance Unit",
      icon: 4,
      blurb: "The first Rifleman of a run costs 100 less (300 → 200); every " +
             "one after it costs 40 more (→ 340). With Cheap Receiver: 150, " +
             "then 290.",
      cost: 100,
      minLevel: 0,
      requires: ["rif_s1"],
      at: { x: 0, y: 2 },
      effects: { price: { firstAdd: -100, laterAdd: 40 } }
    },

    // === path A =============================================================

    // ONE GROUP, ON A3, AND IT PERSISTS UPWARD. `hasA3` stays true once A3 is
    // bought, so the shot is still there at A4 and A5:
    //
    //   A1  3 + 0 = 3      A2  4 + 0 = 4      A3  4 + 1 = 5
    //   A4  5 + 1 = 6      A5  5 + 1 = 6
    //
    // IT CANNOT LEAK INTO AUTOMATIC FIRE, and not by care -- by construction.
    // B3 switches the Rifleman to `automatic`, and an automatic Rifleman fires
    // on `shotsPerSecond`, which `recalcStats` derives from
    // BASE_AUTO_SHOTS_PER_SECOND and the fire-rate bonuses and never from
    // `shotsPerBurst`. A crosspath that reaches B3 keeps its extra burst shot
    // in a field nothing is reading.
    //
    // **THE A3 MANA SURCHARGE IS GONE** (2026-08-31). It carried +100 on A3
    // from 2026-08-30; the confirmed node states its whole effect and does not
    // include it, so the node is now the shot and nothing else.
    {
      id: "rif_a1",
      name: "Overloaded Drum",
      icon: 5,
      blurb: "A3+ only: +1 shot per burst — A3/A4/A5 fire 5/6/6 instead of " +
             "4/5/5. Nothing at A1 or A2, and an automatic Rifleman (B3) " +
             "gains nothing.",
      cost: 120,
      minLevel: 0,
      at: { x: -1, y: 0 },
      effects: {
        when: [{ has: "hasA3", add: { shotsPerBurst: 1 } }]
      }
    },

    // THE LAST SHOT OF THE BURST, whichever number that is. `update` hands the
    // multiplier down by asking `burstShotsLeft === 1`, so with Overloaded Drum
    // equipped the doubled round is the sixth rather than the fifth and this
    // node needs to know nothing about that.
    //
    // A BURST THAT COLLAPSES PROMOTES NOBODY. If the window empties before the
    // final shot, that shot is never fired and the doubling is simply not
    // collected -- the earlier rounds keep the tenth they already paid, which
    // is the risk half of the trade.
    {
      id: "rif_a2",
      name: "Breach Chamber",
      icon: 6,
      blurb: "A5 only: the last shot of a completed burst deals double. Every " +
             "earlier shot in that burst deals 10% less. A burst that ends " +
             "early collects nothing.",
      cost: 160,
      minLevel: 0,
      requires: ["rif_a1"],
      at: { x: -2, y: 0 },
      effects: {
        when: [{ has: "hasA5", set: { burstFinalShotMult: 2, burstEarlyShotMult: 0.9 } }]
      }
    },

    // A ONE-CYCLE MEMORY, decided when a burst ends and spent by the next one.
    // `Soldier.settleRatchet` owns the rule; these two numbers are the whole of
    // the node. Overloaded Drum sharpens both ends of it by making a burst
    // longer -- more shots to fire cleanly, and more shots to lose.
    //
    // Burst mode only, and structurally so: an automatic Rifleman returns from
    // `update` before the burst block exists.
    {
      id: "rif_a3",
      name: "Ratchet Pressure",
      icon: 7,
      blurb: "Burst only: a burst that fires every shot makes the next cycle " +
             "12% shorter; one that loses two or more shots makes it 15% " +
             "longer. Lasts one cycle. B3's automatic fire is untouched.",
      cost: 150,
      minLevel: 0,
      requires: ["rif_a2"],
      at: { x: -3, y: 0 },
      effects: {
        set: { ratchetGain: 0.88, ratchetLoss: 1.15 }
      }
    },

    // === path B =============================================================

    // ONE +1, NOT TWO. B5's recruit count is an ABSOLUTE (its `recruitBoost`
    // row sets 4, replacing B4's 2), so a single delta on the resolved number
    // gives 3 at B4 and 5 at B5 -- which is the progression asked for. Two
    // separate bonuses would have produced six and would have been the
    // arithmetic mistake this note exists to prevent.
    //
    // `hasRecruitAbility` is the gate rather than `hasB4`, because that is the
    // flag B4 actually sets and the one the ability itself reads.
    {
      id: "rif_b1",
      name: "Reinforcement Manifest",
      icon: 8,
      blurb: "B4 sends 3 recruits instead of 2 and costs +200 mana. B5 sends 5 " +
             "instead of 4 and costs +350. No other recruit stat changes.",
      cost: 120,
      minLevel: 0,
      at: { x: 1, y: 0 },
      effects: {
        when: [{ has: "hasRecruitAbility", add: { recruitCount: 1 } }],
        tiers: { B4: { cost: 200 }, B5: { cost: 350 } }
      }
    },

    // AN ABSOLUTE, NOT A DELTA, and that is what lets the pair rule work: this
    // node and Entrenchment Protocol each name a whole cooldown, and a Rifleman
    // carrying both is back on the tower's own 45 s. See
    // `Soldier.resolvedRecruitCooldown` for the table and why it is stated
    // rather than summed.
    //
    // The HP cut lands on `recruitHp` before a squad is resolved, so a recruit
    // already walking keeps the body it was called with.
    {
      id: "rif_b2",
      name: "Rapid Muster",
      icon: 9,
      blurb: "Recruit cooldown 45 s → 40 s. Every new recruit has 10% less " +
             "health (20 → 18 at B4, 40 → 36 at B5). With Entrenchment " +
             "Protocol also equipped the cooldown is 45 s.",
      cost: 110,
      minLevel: 0,
      requires: ["rif_b1"],
      at: { x: 2, y: 0 },
      effects: {
        // TEN PERCENTAGE POINTS, NOT A x0.9 (2026-09-01). The same 18 and 36 it
        // has always resolved -- 20 x (1 - 0.10) -- written in the channel that
        // Medical Selection, Reinforced Contracts and Salvage Conscription also
        // write to, so the four compose by SUMMING points rather than by
        // multiplying factors in whatever order the slots happen to be in. See
        // `Soldier.afterPerks`.
        set: { recruitCooldownRapid: 40 },
        add: { recruitHpPoints: -10 }
      }
    },

    // FLAT ARMOR, AND ONLY FLAT ARMOR. `armorPierce` subtracts points from an
    // enemy's `armor` -- the flat reduction -- for this tower's shots only and
    // without editing the body's own number. It is emphatically NOT
    // `defenseFlatPierce`, which is percentage points of DEFENCE and belongs to
    // B4; the two are separate arguments all the way down to
    // js/systems/mitigation.js precisely so this node cannot become that one.
    //
    // A recruit's BODY BLOCK gets none of it: contact is a shared health
    // exchange through SummonContact, not a firearm, and it is not classified
    // as the recruit's weapon damage anywhere in the shared rules.
    {
      id: "rif_b3",
      name: "Piercing Orders",
      icon: 0,
      blurb: "B3+ only: this Rifleman and its recruits ignore 2 points of flat " +
             "armor — never percentage defense. Both fire 5% slower. Recruit " +
             "body blocks are unaffected.",
      cost: 150,
      minLevel: 0,
      requires: ["rif_b2"],
      at: { x: 3, y: 0 },
      effects: {
        // ADDITIONS RATHER THAN A `set` AND A `mul` (2026-09-01), and the
        // numbers are unchanged: 0 + 2 is the same 2, and five points off is
        // the same x0.95 on both. Carbide Tip deepens each of them, and a `set`
        // is last-writer-wins -- so a square landing on `armorPierce` would
        // have been erased by the node it is supposed to improve, and a second
        // rate multiplier could not be composed with the first without knowing
        // its rank. Both are now sums, and sums do not care about slot order.
        when: [{
          has: "hasB3",
          add: {
            armorPierce: 2, recruitArmorPierce: 2, piercingRatePenaltyPoints: 5
          }
        }]
      }
    },

    // THE SECONDS ARE THE WHOLE NODE. What a dug-in recruit gains lives on
    // `Soldier.ENTRENCH_*` because the recruit reads all three; writing a
    // non-zero `recruitEntrenchSeconds` is what switches the state on at all.
    //
    // A recruit still walks at its ordinary speed -- this buys nothing while it
    // is moving, and moving is what ends it.
    {
      id: "rif_b4",
      name: "Entrenchment Protocol",
      icon: 1,
      blurb: "A recruit that has stood and fired for 1.5 s digs in: +25% " +
             "range, +25% fire rate, −25% damage taken, lost the moment it " +
             "moves. Recruit cooldown 45 s → 55 s (45 s with Rapid Muster).",
      cost: 160,
      minLevel: 0,
      requires: ["rif_b3"],
      at: { x: 4, y: 0 },
      effects: {
        set: { recruitCooldownEntrench: 55, recruitEntrenchSeconds: 1.5 }
      }
    }
  ]
});
