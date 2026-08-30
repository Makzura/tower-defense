// ---------------------------------------------------------------------------
// The Rifleman's permanent tree — the owner's first authored content
//
// FOUR NODES, ALL ROOTS, AND NOTHING ELSE IS DESIGNED YET. This replaced a
// first pass written to prove the format on 2026-08-30; these are the owner's
// own numbers and shape. Do not extend it, do not add children, and do not
// invent a fifth direction: the rest of this tree is a later decision.
//
//   north  more base damage, and every in-run tier costs more
//   south  a cheaper Rifleman to place
//   west   path A -- more shots in a burst, and the two tiers that grant them
//          cost more
//   east   path B -- one more recruit, and the two tiers that call them cost
//          more
//
// NAMES AND ICONS ARE PLACEHOLDERS AND SAY SO. The bracketed tag is the whole
// point: nobody can mistake `[R-N] Base damage` for a finished name, and the
// `icon` index picks one of the drawn marks in js/upgrades.js rather than art
// that does not exist yet. **The `id` is the persistence format** -- the name
// and the icon can be replaced at any time and nobody loses a node; renaming an
// id un-buys it for every existing player.
//
// EVERY NODE IS minLevel 0. All four can be bought the moment the tower is
// owned and the coins are there. None can be EQUIPPED until the Rifleman
// reaches level 1, because a level-0 tower has no slots -- buying and equipping
// are different things and this content is the first place that distinction
// really bites.
//
// THE SURCHARGES ARE IN MANA, DURING A RUN, and never in meta coins. They reach
// the player through `tiers`, which wraps the tower's own `upgradeCost(id)`, so
// the panel button, the hover card, the affordability check and the till all
// quote the same number. The build price is a separate field (`price`) and no
// tier surcharge ever touches it.
// ---------------------------------------------------------------------------

TowerPerks.register({
  towerId: "soldier",
  nodes: [
    // --- north: damage, paid for on every tier -------------------------------
    //
    // 1 -> 2 base damage is a DOUBLING on this tower, which is why every one of
    // the ten tiers pays 50 mana for it rather than a subset. The placement
    // price is deliberately untouched: this node is what a Rifleman becomes
    // after it is standing, not what it costs to stand it up.
    {
      id: "rif_n1",
      name: "[R-N] Base damage",
      icon: 0,
      blurb: "+1 base damage (1 → 2). Every A/B upgrade costs 50 more mana. " +
             "Placement unchanged.",
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

    // --- south: a cheap opener -----------------------------------------------
    //
    // 250 against a 600 stake is two Riflemen on wave one with 100 left over.
    // It touches nothing else on purpose -- no damage, no tier price -- so it
    // is the node a player takes when the problem is the opening and not the
    // ceiling.
    {
      id: "rif_s1",
      name: "[R-S] Build price",
      icon: 1,
      blurb: "Placement 300 → 250. Nothing else changes.",
      cost: 60,
      minLevel: 0,
      at: { x: 0, y: 1 },
      effects: { price: { add: -50 } }
    },

    // --- west: path A, more shots in the burst -------------------------------
    //
    // TWO CONDITIONAL GROUPS, NOT ONE, and that is the whole shape of it: A2
    // grants two shots and A3 grants a third, and both persist upward because
    // `hasA2` and `hasA3` stay true once bought. So A2 reads 6, A3 reads 7, and
    // A4 and A5 read 8 -- the table below, exactly.
    //
    //   A1  3 + 0 = 3      A2  4 + 2 = 6      A3  4 + 3 = 7
    //   A4  5 + 3 = 8      A5  5 + 3 = 8
    //
    // IT CANNOT LEAK INTO AUTOMATIC FIRE, and not by care -- by construction.
    // B3 switches the Rifleman to `automatic`, and an automatic Rifleman fires
    // on `shotsPerSecond`, which `recalcStats` derives from
    // BASE_AUTO_SHOTS_PER_SECOND and the fire-rate bonuses and never from
    // `shotsPerBurst`. A crosspath that reaches B3 keeps its extra burst shots
    // in a field nothing is reading.
    {
      id: "rif_a1",
      name: "[R-A] Path A burst",
      icon: 2,
      blurb: "Burst shots: A2 → 6, A3 → 7, A4 and A5 → 8. A2 costs +200 mana, " +
             "A3 +100. An automatic Rifleman (B3) gains nothing.",
      cost: 120,
      minLevel: 0,
      at: { x: -1, y: 0 },
      effects: {
        when: [
          { has: "hasA2", add: { shotsPerBurst: 2 } },
          { has: "hasA3", add: { shotsPerBurst: 1 } }
        ],
        tiers: { A2: { cost: 200 }, A3: { cost: 100 } }
      }
    },

    // --- east: path B, one more recruit --------------------------------------
    //
    // ONE +1, NOT TWO. B5's recruit count is an ABSOLUTE (its `recruitBoost`
    // row sets 4, replacing B4's 2), so a single delta on the resolved number
    // gives 3 at B4 and 5 at B5 -- which is the progression asked for. Two
    // separate bonuses would have produced six and would have been the
    // arithmetic mistake this note exists to prevent.
    //
    // `hasRecruitAbility` is the gate rather than `hasB4`, because that is the
    // flag B4 actually sets and the one the ability itself reads. A Rifleman
    // that never bought B4 has a `recruitCount` nothing looks at, and this node
    // is inert on it.
    {
      id: "rif_b1",
      name: "[R-B] Path B recruits",
      icon: 3,
      blurb: "B4 sends 3 recruits, B5 sends 5. B4 costs +200 mana, B5 +350. " +
             "No other recruit stat changes.",
      cost: 120,
      minLevel: 0,
      at: { x: 1, y: 0 },
      effects: {
        when: [{ has: "hasRecruitAbility", add: { recruitCount: 1 } }],
        tiers: { B4: { cost: 200 }, B5: { cost: 350 } }
      }
    }
  ]
});
