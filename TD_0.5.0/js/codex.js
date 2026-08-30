// ---------------------------------------------------------------------------
// The index (screen === "index"): a field guide to every tower and enemy,
// reached from the title menu. Two tabs -- Towers and Enemies.
//
// Nothing in here is WRITTEN DOWN a second time. The tower tab is built by
// constructing a real instance of each roster tower and walking each upgrade
// path on it: every tier's price, effects line and preview card are recorded
// from the same panelActions() the in-game panel draws, with the instance
// standing at the tier below -- so a card here shows the identical
// before -> after the hover card shows in a run. The enemy tab reads
// Enemy.TYPES and derives wave appearances from WAVES. Retune anything and
// this screen follows; there is no copy to go stale.
//
// The preview instances are throwaway: parked off-screen, never in `towers`,
// never updated, and advanced through the towers' own purchase/applyUpgrade
// entry points BELOW the economy layer -- previewing is not buying, so the
// player's cash is never touched. A gated tier (the Siphon's B5) is recorded
// from its refused action and NOT applied, which keeps global one-per-game
// state (death denial, the healing ledger) untouched too. A test pins that
// opening the index changes nothing.
// ---------------------------------------------------------------------------

var Codex = (function () {
  var tab = "towers";        // "towers" | "enemies" | "difficulties"
  var towerIndex = 0;        // which roster tower is open
  var enemyIndex = 0;        // which enemy's detail panel is open
  var pick = null;           // { branch, tier } -- the upgrade being previewed
  var towerModels = null;    // built on open(), thrown away on the next open()
  var enemyModels = null;

  function roster() {
    return BUILD_SLOTS.filter(function (t) { return t !== null; });
  }

  // --- building the tower models -------------------------------------------

  // Advance a preview instance one tier along `action`'s branch, through the
  // tower's own application entry point. Config towers expose purchase();
  // the Smasher exposes applyUpgrade(). Both sit BELOW buyUpgrade in game.js,
  // which is the point: buyUpgrade is the economy (validation, price, the
  // player's wallet), and a codex preview must not go anywhere near it --
  // the Smasher's performAction, for example, spends the real global cash.
  function advance(t, action) {
    if (typeof t.purchase === "function") {
      var result = t.purchase(action.branch);
      return result && result.ok;
    }
    t.applyUpgrade(action.upgradeId);
    return true;
  }

  // A TIER MAY BE GATED ON THE OTHER BRANCH, and the field guide has to walk
  // past that gate rather than stopping at it.
  //
  // One tier in the game does this: the Summoner's B3 carries
  // `requiresOther: "A2"`, because the Cyberblub is an evolution of the Blub
  // III (js/blub.js). A player going down path B buys A1 and A2 first and then
  // continues, so a guide that stopped at B3 would hide B4 and B5 entirely --
  // and the tiers it DID show would be measured on a tower that no real path-B
  // build ever looks like.
  //
  // Read STRUCTURALLY off the upgrade table, never parsed out of the refusal
  // text: "needs A2" is a sentence for a player, not an interface. A tower type
  // with no `UPGRADES` array, or a tier with no `requiresOther`, comes through
  // here untouched, so every existing tower walks exactly as it did.
  function satisfyCrossBranchGate(t, Type, upgradeId) {
    var table = Type.UPGRADES;
    if (!table || typeof t.applyUpgrade !== "function") return false;

    var row = null;
    for (var i = 0; i < table.length; i++) {
      if (table[i].id === upgradeId) row = table[i];
    }
    if (!row || !row.requiresOther) return false;
    if (t.hasUpgrade && t.hasUpgrade(row.requiresOther)) return false;

    // Buy the chain the gate sits on top of, cheapest tier first. Bounded by
    // the table's own length, so a table that somehow cycles cannot hang the
    // menu -- the same reason walkBranch has a guard at all.
    var chain = [];
    var id = row.requiresOther;
    for (var guard = 0; guard < table.length && id; guard++) {
      var needed = null;
      for (var j = 0; j < table.length; j++) if (table[j].id === id) needed = table[j];
      if (!needed || (t.hasUpgrade && t.hasUpgrade(needed.id))) break;
      chain.unshift(needed.id);
      id = needed.requires;
    }

    if (!chain.length) return false;
    chain.forEach(function (tierId) { t.applyUpgrade(tierId); });
    return true;
  }

  // Does this refusal name another tier of the SAME tower that could be bought
  // right now? "needs A2" on the Summoner's B3 is not a wall, it is a ROUTE --
  // the Cyberblub is an evolution of the Blub III, so a path-B player buys A1
  // and A2 on the way. Contrast the Siphon's B5, whose gate is a run-state
  // condition a specimen in a field guide can never satisfy; that one names no
  // tier, so it does not match here and the walk still stops at it.
  //
  // Returns the tier id to buy first, or null.
  function prerequisiteFor(t, reason) {
    var named = /^needs ([AB][1-5])$/.exec(reason || "");
    if (!named) return null;
    if (typeof t.whyCannotUpgrade !== "function") return null;
    return t.whyCannotUpgrade(named[1]) === null ? named[1] : null;
  }

  // WHICH BODY A PREVIEW INSTANCE IS WEARING, asked of the renderer.
  //
  // The tier -> mesh rule lives in gl-world's five selectors and nowhere else;
  // this asks the same `towerModel` the board asks, through the `modelFor`
  // export, so the guide and the road can never disagree about what a tier
  // looks like. A build with no WebGL answers null and every caller falls back
  // to the 2D glyph, exactly as it did before any of this existed.
  //
  // DERIVED RATHER THAN TABLED on purpose: a hand-written table of tier bodies
  // would be a second copy of a tiering rule, and this file's whole premise is
  // that nothing in it is written down a second time.
  function bodyOf(t) {
    if (typeof World3D === "undefined" || typeof World3D.modelFor !== "function") {
      return null;
    }
    try { return World3D.modelFor(t); } catch (e) { return null; }
  }

  // The branch letters this tower actually offers, in the order its own panel
  // lists them. Read off `panelActions` rather than off a table, so a tower
  // that grows a fourth path needs no edit here.
  function branchesOf(tower) {
    if (typeof tower.panelActions !== "function") return [];
    var seen = [];
    tower.panelActions().forEach(function (a) {
      if (a.tone === "upgrade" && a.branch && seen.indexOf(a.branch) === -1) {
        seen.push(a.branch);
      }
    });
    return seen;
  }

  function walkBranch(Type, branch) {
    var t = new Type(-1000, -1000, path);
    var tiers = [];

    // Hard cap well above any real path length, so a tower that failed to
    // advance (or a future one with a cycle) cannot hang the menu. It allows
    // for the cross-branch tiers a route may have to buy on the way as well as
    // for the five it is listing.
    for (var guard = 0; guard < 16; guard++) {
      var action = t.panelActions().filter(function (a) {
        return a.tone === "upgrade" && a.branch === branch;
      })[0];
      if (!action || action.upgradeId === null) break;    // maxed out

      // Take the route rather than reporting the wall. Without this the
      // Summoner's path B ended at B3 -- "needs A2" -- and B4 and B5 were
      // absent from the index entirely, which is the one thing the index exists
      // to prevent. The tiers below it are then previewed against a tower that
      // owns A1 and A2, which is honest: that is the only tower that can ever
      // own them.
      var prereq = prerequisiteFor(t, action.reason);
      if (prereq) {
        t.applyUpgrade(prereq);
        continue;
      }

      // Clear a cross-branch gate BEFORE reading the tier, so its price, its
      // effects line and its card are all measured on the tower a real buyer
      // would be holding. Re-ask for the action afterwards: satisfying the gate
      // changed the instance the previous one was measured against.
      if (action.reason && satisfyCrossBranchGate(t, Type, action.upgradeId)) {
        action = t.panelActions().filter(function (a) {
          return a.tone === "upgrade" && a.branch === branch;
        })[0];
        if (!action || action.upgradeId === null) break;
      }

      var entry = {
        id: action.upgradeId,
        price: action.detail,          // "850 mana", or the gate's reason
        effects: action.effects || "",
        reason: action.reason || null,
        // Resolved NOW, not kept as a thunk: the thunk reads the instance,
        // and the next loop iteration mutates it. Eager resolution captures
        // the honest tier-below -> tier before/after.
        card: cardFor(action),
        // The mesh this tier WEARS, filled in below once the tier has actually
        // been applied -- a tier's body is what the tower looks like AFTER
        // buying it, and the instance is still standing one tier down here.
        // Left null for a gated tier that is shown but never applied.
        model: null
      };
      tiers.push(entry);

      // A tier the tower itself refuses (the Siphon's B5 unlock gate) is
      // still worth SHOWING -- the card explains the gate -- but must not be
      // applied: applying would sidestep the refusal and, for B5, touch
      // one-per-game global state.
      if (action.reason) break;
      if (!advance(t, action)) break;
      entry.model = bodyOf(t);
    }
    return tiers;
  }

  function buildTowerModels() {
    return roster().map(function (Type) {
      var base = new Type(-1000, -1000, path);

      // Drop the lifetime-total rows: a specimen in a field guide has no
      // history. Asked of the ROWS rather than counted off the front -- the
      // count assumed every tower opens with "Damage dealt" and "Kills", and
      // the Farm has neither, so the guide was slicing away its production
      // rate and showing a 1200-mana economy tower as a single HP line. See
      // TowerStats.total.

      return {
        type: Type,
        name: Type.DISPLAY_NAME,
        cost: TowerPerks.priceOf(Type),
        stats: TowerStats.withoutTotals(base.statLines()),
        // The unbought body, from the same resolver every tier uses.
        model: bodyOf(base),
        // WHICH BRANCHES A TOWER HAS IS ITS OWN ANSWER, not two letters typed
        // here. Four types have A and B; the Farm has A, B and C, and a
        // hard-coded pair would have shown two thirds of it with nothing
        // anywhere reporting a problem -- the index derives everything else it
        // shows for exactly this reason.
        branchIds: branchesOf(base),
        branches: (typeof base.panelActions === "function")
          ? branchesOf(base).reduce(function (acc, id) {
              acc[id] = walkBranch(Type, id);
              return acc;
            }, {})
          : null
      };
    });
  }

  // --- building the enemy models -------------------------------------------

  function buildEnemyModels() {
    return Object.keys(Enemy.TYPES).map(function (id) {
      var type = Enemy.TYPES[id];
      var maxHp = type.health;
      var maxTier = type.fractal ? type.fractal.defaultTier : null;

      // WHERE THE PLAYER MEETS IT, PER DIFFICULTY (2026-08-27).
      //
      // There are two authored schedules now and a type may be in one, both or
      // neither -- the Herald, the Sapper and the Volatile are Normal only, and
      // a card that answered "where do I meet this" with a single list would
      // either lie about Easy or hide Normal entirely.
      //
      // So `appearances` is one entry per difficulty, in the table's own order,
      // and `waves` is the UNION -- which is what the compact list row prints
      // and what "is this type scheduled anywhere at all" asks. Neither is
      // written down: both are walked off DIFFICULTIES, so a retune of either
      // schedule moves this screen with no edit here, and a third difficulty
      // would appear as a third row on every card.
      var appearances = DIFFICULTIES.map(function (difficulty) {
        var list = [];
        difficulty.waves.forEach(function (wave, i) {
          var listed = false;
          waveGroups(wave).forEach(function (g) {
            if ((g.type || Enemy.DEFAULT_TYPE) !== id) return;
            if (!listed) { list.push(i + 1); listed = true; }
            // THE CEILINGS ARE TAKEN ACROSS EVERY SCHEDULE, deliberately.
            // "Highest campaign HP" and the Fractal ladder's top rung are
            // claims about the game and not about one difficulty, and Normal
            // sends heavier overrides than Easy on most types.
            maxHp = Math.max(maxHp, Enemy.healthOf(g.type, g.health, g.tier));
            if (type.fractal && g.tier !== undefined) {
              maxTier = Math.max(maxTier, g.tier);
            }
          });
        });
        return { id: difficulty.id, name: difficulty.name, waves: list };
      });

      var waves = [];
      appearances.forEach(function (entry) {
        entry.waves.forEach(function (n) {
          if (waves.indexOf(n) === -1) waves.push(n);
        });
      });
      waves.sort(function (a, b) { return a - b; });

      var speed = Enemy.BASE_SPEED_ULPS * type.speedMultiplier;

      // The sprite is a REAL enemy, drawn by its own draw() -- what the guide
      // shows is what walks the road. Parked on this screen's coordinates and
      // never updated.
      var sprite = new Enemy(path, undefined, id);

      // THE MESH, from the board's own resolver. Null for the types that have
      // no exported body: gl-world draws those as a coloured sphere and this
      // guide draws them as their 2D skin, which is the honest answer either
      // way -- what the guide shows is what walks the road, including when what
      // walks the road is not a model yet.
      var mesh = (typeof World3D !== "undefined" &&
        typeof World3D.enemyModelFor === "function")
        ? World3D.enemyModelFor(sprite) : null;

      // HOW FAST IT WALKS ON THE SPOT, derived rather than chosen.
      //
      // On the board the walk is advanced by DISTANCE COVERED -- one full cycle
      // per stride, stride = radius * 2.6 px (js/gl/gl-world.js) -- which is why
      // a planted foot stays on one patch of road and a slowed enemy visibly
      // trudges. A viewer has no distance, so the rate has to come from
      // somewhere; taking it from the enemy's OWN speed keeps the one property
      // that made the board's walk worth having. A Sprinter scurries here and a
      // Colossus plods, for the same reason and by the same arithmetic.
      // A FLIER IS THE BOARD'S ONE EXCEPTION AND THE RENDERER IS ASKED FOR IT
      // RATHER THAN THIS FILE GUESSING. `gl-world` drives a wingbeat from a
      // clock at `HOVER_HZ` instead of from distance, because a stopped flier
      // would otherwise freeze mid-beat and hang in the air like a prop.
      //
      // `World3D.animHz` returns that authored rate for a body that has one and
      // NULL for every distance-driven body -- and the null is the useful half:
      // it says this body has no authored rate at all, so a viewer standing it
      // still has to invent one, which is this file's business and not the
      // renderer's. Copying 2.6 into here instead would have put a second copy
      // of a constant in the file that will never be the one retuned, and it
      // would fail silently: the viewer would beat the old rate forever and
      // nothing would render wrong enough for anyone to notice.
      //
      // Worth knowing what this fixed and what it did not. The derivation below
      // gives the Aether Wisp 2.5668 against the board's 2.6 -- within 1.3%,
      // which is why nothing looked wrong. That was luck falling out of one
      // body's speed and radius, not construction, and the next flier would
      // have landed wherever its own numbers put it.
      var strideP = Math.max(1, sprite.radiusPx() * 2.6);
      var walkHz = (typeof ul === "function" ? ul(speed) : speed) / strideP;
      if (typeof World3D !== "undefined" && typeof World3D.animHz === "function") {
        var authored = World3D.animHz(sprite);
        if (authored) walkHz = authored;
      }

      return {
        id: id,
        name: type.displayName,
        mesh: mesh,
        walkHz: walkHz,
        description: type.description || null,
        sprite: sprite,
        health: type.health,
        maxHp: maxHp,
        speed: speed,
        multiplier: type.speedMultiplier,
        // Measured against the reference route, the same yardstick the map
        // cards use -- not whatever route happens to be loaded.
        crossing: Maps.referenceLengthUl() / speed,
        armor: type.armor || 0,
        defense: type.defense || 0,
        aoeDamageReduction: type.aoeDamageReduction || 0,
        sizeScale: (type.sizeScale || 1) * sprite.fractalSizeScale,
        isCamo: !!type.isCamo,
        isFlying: !!type.isFlying,
        // What it does to TOWERS, for the types that fight back. Read through
        // Enemy.attacksOf, the same resolver attackTowers uses, so a retune
        // shows here with no edit and the one-or-many form does not matter.
        attack: Enemy.attacksOf(type)[0] || null,
        attacks: Enemy.attacksOf(type),
        attackCount: Enemy.attacksOf(type).length,
        // The v0.4.7 mechanic blocks, read straight off the type so a retune
        // shows in the guide with no edit here -- the same arrangement
        // `attack` already had.
        shield: type.shield || null,
        revive: type.revive || null,
        spawns: type.spawns || null,
        fractal: type.fractal || null,
        maxTier: maxTier,
        phases: type.phases || null,
        // v0.4.9's block: what this type does for the OTHER enemies on the
        // road. Read straight off the type like every block above it.
        support: type.support || null,
        sprint: type.sprint || null,
        noBounty: !!type.noBounty,
        // The Volatile's block, carried into the guide as data off the type
        // like every block above it.
        deathEffect: type.deathEffect || null,
        // What killing one at its roster health pays. Enemy.bountyOf is the
        // same resolver the till and scaled waves use.
        bounty: type.noBounty ? 0 : Enemy.bountyOf(type.id),
        waves: waves,
        appearances: appearances
      };
    });
  }

  // --- geometry ------------------------------------------------------------
  //
  // Shared by draw and the click handler, the same rule slotRect and
  // inspectionLayout follow: one function per rectangle, so what is drawn and
  // what is clickable can never disagree.

  // THREE TABS SINCE 2026-08-27, and the row is CENTRED ON HOWEVER MANY THERE
  // ARE rather than laid out from a fixed left edge -- so adding the
  // Difficulties tab moved the other two under the heading instead of pushing
  // them off it, and a fourth would do the same. `TABS` is the one list; the
  // drawing, the click test and the geometry all walk it.
  var TABS = [
    { id: "towers", label: "Towers" },
    { id: "enemies", label: "Enemies" },
    { id: "difficulties", label: "Difficulties" }
  ];
  var TAB_W = 180;
  var TAB_GAP = 20;

  function tabRect(i) {
    var total = TABS.length * TAB_W + (TABS.length - 1) * TAB_GAP;
    return { x: (VIEW_WIDTH - total) / 2 + i * (TAB_W + TAB_GAP),
             y: 78, w: TAB_W, h: 38 };
  }

  function towerCardRect(i) {
    return { x: 32, y: 148 + i * 86, w: 240, h: 76 };
  }

  // THE COLUMNS ARE LAID OUT FROM HOW MANY THERE ARE. Two branches sit where
  // they always did; a third is fitted beside them by narrowing all three,
  // which keeps the tree inside the same rectangle rather than pushing it off
  // the right of the screen.
  var TREE_X0 = 600;
  var TREE_Y = 196;
  var TREE_SPAN = 344;                 // 600..944, what the two columns used

  function treeColumns(model) {
    var ids = (model && model.branchIds && model.branchIds.length)
      ? model.branchIds : ["A", "B"];
    var gap = 16;
    var w = Math.floor((TREE_SPAN - gap * (ids.length - 1)) / ids.length);
    var out = {};
    ids.forEach(function (id, i) {
      out[id] = { x: TREE_X0 + i * (w + gap), w: w };
    });
    return out;
  }

  function tierRect(model, branch, i) {
    var col = treeColumns(model)[branch] || { x: TREE_X0, w: 164 };
    return { x: col.x, y: TREE_Y + i * 54, w: col.w, h: 46 };
  }

  // THE TURNING BODY, LEFT OF THE UPGRADE TREE. The owner asked for exactly
  // this placement -- "for the tower the model appears on the left of the
  // upgrade UIs, that can be clicked and is slowly turning around" -- and on
  // this screen the upgrade UI is the two branch columns at TREE_X, so the
  // panel sits under the stats block in the same column, which is the space
  // left of them. Sized to what is actually free between the last stat row and
  // the bottom of the screen; nothing else on this tab moved to make room.
  function towerBodyRect() {
    return { x: 300, y: 434, w: 270, h: 262 };
  }

  // The two doors into the enemy viewer, as their own rectangles so what is
  // drawn and what is clickable are one shape. Both are the box the body is
  // drawn into, not the whole row or the whole panel.
  function enemyRowIconRect(i) {
    var r = enemyCardRect(i);
    return { x: r.x + 6, y: r.y + 4, w: 48, h: r.h - 8 };
  }

  function enemyDetailIconRect() {
    var r = enemyDetailRect();
    return { x: r.x + 18, y: r.y + 22, w: 92, h: 92 };
  }

  // --- state ---------------------------------------------------------------

  function open() {
    // Rebuilt fresh every visit: thirty-odd throwaway instances cost nothing
    // once, and a stale cache after a balance retune in the same session
    // (the sandbox can change UNIT_LENGTH live) is a bug nobody would find.
    towerModels = buildTowerModels();
    enemyModels = buildEnemyModels();
    enemyIndex = 0;
    enemyScroll = 0;
    scheduleScroll = 0;
    // THE PREVIEW OPENS ON WHATEVER THE PLAYER LAST SELECTED TO PLAY, which is
    // the one piece of state on this screen that is worth carrying in from
    // outside it: somebody who has just chosen Normal and come to read about it
    // should not have to click Normal again. It is a COPY, not a reference --
    // browsing the index never changes which schedule a run would use.
    previewDifficultyId = selectedDifficultyId;
    pick = null;
    // THE MODAL DIES WITH THE SCREEN. Every other piece of state here is reset
    // on entry and the viewer was not, so leaving the index with one open and
    // coming back put a stale modal on top of a freshly reset index -- the
    // modal still showing the enemy you left on, the list underneath showing
    // enemy 0. Two states disagreeing about what the player is looking at, and
    // the wheel dead because the viewer swallows it.
    viewer = null;
    screen = "index";
  }

  function onClick(x, y) {
    // THE VIEWER OWNS EVERY CLICK WHILE IT IS UP, which is the same rule the
    // index itself follows against the screens under it and the pause menu
    // follows against the board. A modal that let clicks through would let a
    // player change the selection behind the thing they are looking at.
    if (viewer) {
      if (pointInRect(x, y, viewerArrowRect(-1))) { stepViewer(-1); return; }
      if (pointInRect(x, y, viewerArrowRect(1))) { stepViewer(1); return; }
      if (pointInRect(x, y, viewerCloseRect())) { closeViewer(); return; }
      // Outside the stage closes it. Inside and not on a control does nothing:
      // the model is the thing you came to look at and clicking it should not
      // dismiss it.
      if (!pointInRect(x, y, viewerStageRect())) closeViewer();
      return;
    }

    for (var ti = 0; ti < TABS.length; ti++) {
      if (!pointInRect(x, y, tabRect(ti))) continue;
      tab = TABS[ti].id;
      // Switching away from the towers tab drops the tier preview, so coming
      // back does not open on a card the player has forgotten choosing.
      if (tab !== "towers") pick = null;
      return;
    }

    if (tab === "difficulties") {
      for (var si = 0; si < DIFFICULTIES.length; si++) {
        if (!pointInRect(x, y, difficultyTabRect(si))) continue;
        if (DIFFICULTIES[si].id !== previewDifficultyId) {
          previewDifficultyId = DIFFICULTIES[si].id;
          // A different schedule is a different list, so the old scroll
          // position means nothing on it. Same reasoning as the enemy tab
          // resetting its scroll on open().
          scheduleScroll = 0;
        }
        return;
      }
      return;
    }

    if (tab === "enemies") {
      // THE MODEL IS THE DOOR. Clicking the body in the detail panel opens the
      // viewer on it -- the owner's own words, "if the model on the UI is
      // clicked it opens a page where we can see the enemy walking". Tested
      // BEFORE the list, because the detail panel is not inside the list
      // viewport and the viewport test below would reject it.
      if (pointInRect(x, y, enemyDetailIconRect())) {
        openViewer("enemy");
        return;
      }
      // The VIEWPORT gates the rows, not the rows themselves. A scrolled list
      // has rectangles above and below the box that are still perfectly valid
      // rectangles; without this test a click on the tab strip above the list
      // would land on whichever row happens to be sitting off the top of it.
      if (!pointInRect(x, y, enemyListViewport())) return;
      for (var enemyI = 0; enemyI < enemyModels.length; enemyI++) {
        if (pointInRect(x, y, enemyCardRect(enemyI))) {
          // A row's own little body opens the viewer straight onto that enemy;
          // the rest of the row selects it, as it always did. Two targets, one
          // rectangle each, so what is drawn and what is clickable cannot
          // disagree -- the rule every other piece of geometry here follows.
          enemyIndex = enemyI;
          if (pointInRect(x, y, enemyRowIconRect(enemyI))) openViewer("enemy");
          return;
        }
      }
      return;
    }

    // The turning body left of the upgrade tree opens the tower viewer on
    // whichever tier is currently picked. Same door as the enemy tab's.
    if (pointInRect(x, y, towerBodyRect())) {
      openViewer("tower");
      return;
    }

    for (var i = 0; i < towerModels.length; i++) {
      if (pointInRect(x, y, towerCardRect(i))) {
        towerIndex = i;
        pick = null;
        return;
      }
    }

    var model = towerModels[towerIndex];
    if (!model.branches) return;

    model.branchIds.forEach(function (branch) {
      model.branches[branch].forEach(function (tier, i) {
        if (pointInRect(x, y, tierRect(model, branch, i))) {
          pick = { branch: branch, tier: i };
        }
      });
    });
  }

  // --- drawing -------------------------------------------------------------

  function drawTabs(ctx) {
    TABS.forEach(function (entry, i) {
      // Same control the armoury's tabs and the Back button are cut from.
      drawAshControl(tabRect(i), entry.label.toUpperCase(),
        { active: tab === entry.id });
    });
  }

  // THE BODY OF WHATEVER TIER IS PICKED, turning slowly, left of the tree.
  //
  // Picking a tier in either column changes what stands here, which is the
  // "way to see the models of each upgrade of each tower" the owner asked for:
  // a5 and b5 differ from base by a great deal and no player has ever seen
  // either of them without buying it.
  //
  // LIVE, EXCEPT UNDER THE MODAL -- and the cached version of this was the
  // "laggy" rotation the owner reported on 2026-08-14.
  //
  // THE MECHANISM, because it is not a frame-rate fault and it feels exactly
  // like one. On the cached path ModelViewer3D quantises yaw to YAW_STEPS = 24.
  // ROT_SECONDS is 14, so the picture is BIT-IDENTICAL for 583 ms and then
  // jumps 15 degrees. The index redraws at the full rAF rate the whole time --
  // measured 7 structural changes in 65 rendered frames, with the other 56
  // frames byte-for-byte equal, against 37 of 38 in the modal beside it. No
  // timing number can tell those two apart; only the pixels can.
  //
  // The previous comment here justified the cache with "this body shares the
  // screen with a rail of five more". That was wrong, and it was the whole
  // reason for the choice: the rail draws through TowerPreview3D (a different
  // module with its own cache), and so does this function's own fallback below.
  // This is the ONLY ModelViewer3D call on the towers tab, so there is no
  // budget here to compete for.
  //
  // Raising YAW_STEPS instead was considered and cannot reach the brief. The
  // ask is "smooth like the viewer", the viewer moves every frame, and matching
  // that by quantising needs ~840 entries per body against a 128-entry cache --
  // and the Siphon alone wears eleven bodies. 72 steps would still be a jump
  // every 194 ms.
  //
  // `!viewer` IS LOAD-BEARING. The modal draws OVER this tab, so an unguarded
  // live flag would put two full FBO-plus-readback renders in every frame of
  // the one screen that already pays for one -- and the picture it would buy is
  // under a 93% opaque backdrop. With the modal up this reverts to the cached
  // path, which is bounded at ONE render per 583 ms rather than one per frame.
  //
  // Not zero, and the measurement is the reason this sentence is not the one I
  // first wrote: because the live path never writes the cache, opening the
  // viewer finds it COLD and fills it as the panel's yaw walks on underneath --
  // 7 cached renders during a 4 s modal window, measured, against 50 live ones
  // for the modal itself. It stops after one revolution (24 entries) and it is
  // 1/35 of what the unguarded flag would cost, which is the trade being made.
  function drawTowerBody(ctx, model) {
    var r = towerBodyRect();
    var hot = pointInRect(mouse.x, mouse.y, r);

    ctx.fillStyle = "rgba(24,18,22,0.9)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = hot ? "rgba(255,190,130,0.8)" : "rgba(240,150,78,0.28)";
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    // Which body: the picked tier's, or the unbought one when nothing is
    // picked. A gated tier carries no model (it is shown but never applied),
    // so it falls back to the base rather than to a hole.
    var mesh = model.model;
    var label = "Unbought";
    if (pick && model.branches) {
      var tier = model.branches[pick.branch][pick.tier];
      if (tier) {
        label = tier.id;
        if (tier.model) mesh = tier.model;
      }
    }

    var box = 176;
    var cx = r.x + r.w / 2, cy = r.y + 108;
    var yaw = (nowMs() / 1000 / ROT_SECONDS) * Math.PI * 2;
    var drew = false;
    if (mesh && typeof ModelViewer3D !== "undefined") {
      drew = ModelViewer3D.draw(ctx, mesh, cx, cy, box,
        { yaw: yaw, frame: 0, live: !viewer });
    }
    if (!drew) {
      // Never blank: the tower's own glyph, at the same footprint, exactly as
      // the build bar does it.
      if (typeof TowerPreview3D === "undefined" ||
          !TowerPreview3D.draw(ctx, model.type, cx, cy, box)) {
        model.type.drawIcon(ctx, cx, cy, box * 0.6);
      }
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillStyle = "#f6d9b4";
    ctx.fillText(fitText(ctx, label, r.w - 20), cx, r.y + 202);

    // SAY WHEN A TIER BUYS NO NEW BODY. The Rifleman's A1, A2 and A4 wear the
    // body below them; the Siphon gives every tier its own. Showing the same
    // picture under a different tier name without saying so is the guide
    // implying a change the geometry does not make.
    var note = "click to open the viewer";
    if (pick && model.branches) {
      var carried = model.model;
      var list = model.branches[pick.branch];
      for (var i = 0; i < pick.tier; i++) {
        if (list[i] && list[i].model) carried = list[i].model;
      }
      var here = list[pick.tier];
      if (here && (!here.model || here.model === carried)) {
        note = "no new body at this tier";
      }
    }
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,158,140,0.5)";
    ctx.fillText(fitText(ctx, note, r.w - 20), cx, r.y + 224);
    ctx.textAlign = "left";
  }

  function drawTowersTab(ctx) {
    // The rail: one card per roster tower.
    towerModels.forEach(function (model, i) {
      var r = towerCardRect(i);
      var active = i === towerIndex;
      var hot = pointInRect(mouse.x, mouse.y, r);

      // The armoury's card and the chooser's route plate, cut once more.
      drawAshPlate(r, { accent: ASH_EMBER,
        live: active ? 0.9 : (hot ? 0.45 : 0), cut: 12 });

      // THE REAL BODY, not the hand-drawn glyph, and at 52 px rather than 22.
      // The card is 76 px tall and was spending 22 of them on a picture with a
      // 40 px gutter around it; a rail whose whole job is "which tower is
      // this" can afford the height it already had.
      if (typeof TowerPreview3D === "undefined" ||
          !TowerPreview3D.draw(ctx, model.type, r.x + 38, r.y + r.h / 2, 52)) {
        model.type.drawIcon(ctx, r.x + 38, r.y + r.h / 2, 34);
      }

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.fillStyle = active ? "#f0a45c" : "#d9c8b6";
      ctx.fillText(fitText(ctx, model.name, r.w - 88),
        r.x + 74, r.y + r.h / 2 - 10);
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,215,110,0.75)";
      ctx.fillText(model.cost + " mana", r.x + 74, r.y + r.h / 2 + 10);
    });

    var model = towerModels[towerIndex];

    // Stats column.
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillStyle = "#f6d9b4";
    ctx.fillText(model.name, 300, 150);
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,215,110,0.85)";
    ctx.fillText(model.cost + " mana", 300 + ctx.measureText(model.name).width + 60, 156);

    var statW = 270;
    model.stats.forEach(function (row, i) {
      var ry = 196 + i * 22;
      ctx.font = "600 13px system-ui, sans-serif";
      var value = String(row[1]);
      var valueW = ctx.measureText(value).width;
      ctx.textAlign = "right";
      ctx.fillStyle = "#ecdece";
      ctx.fillText(value, 300 + statW, ry);
      ctx.textAlign = "left";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillStyle = "rgba(186,158,140,0.65)";
      ctx.fillText(fitText(ctx, row[0], statW - valueW - 10), 300, ry);
    });

    drawTowerBody(ctx, model);

    // The upgrade tree, or the honest absence of one.
    if (!model.branches) {
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillStyle = "rgba(186,158,140,0.55)";
      ctx.fillText("No upgrade paths — the " + model.name.toLowerCase() +
        " is the reference tower.", TREE_X0, TREE_Y + 4);
      return;
    }

    var cols = treeColumns(model);
    model.branchIds.forEach(function (branch) {
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillStyle = "rgba(140,230,157,0.85)";
      ctx.textAlign = "center";
      ctx.fillText("Path " + branch,
        cols[branch].x + cols[branch].w / 2, TREE_Y - 24);

      model.branches[branch].forEach(function (tier, i) {
        var r = tierRect(model, branch, i);
        var active = pick && pick.branch === branch && pick.tier === i;
        var hot = pointInRect(mouse.x, mouse.y, r);

        ctx.fillStyle = active ? "rgba(116,240,214,0.20)"
          : (hot ? "rgba(116,240,214,0.10)" : "rgba(116,240,214,0.05)");
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.lineWidth = active ? 2 : 1;
        ctx.strokeStyle = active ? "rgba(140,230,157,0.95)"
          : "rgba(116,240,214," + (tier.reason ? "0.25" : "0.45") + ")";
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

        ctx.textAlign = "center";
        ctx.font = "600 13px system-ui, sans-serif";
        ctx.fillStyle = tier.reason ? "rgba(186,158,140,0.5)" : "#74f0d6";
        ctx.fillText(tier.id, r.x + r.w / 2, r.y + 15);
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillStyle = "rgba(236,222,206,0.75)";
        ctx.fillText(fitText(ctx, tier.price, r.w - 10), r.x + r.w / 2, r.y + 32);
      });
    });

    // The preview card for the picked tier -- the same model the in-game
    // hover card builds, drawn by the same code.
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    var cardX = 964;
    if (pick) {
      var card = model.branches[pick.branch][pick.tier].card;
      if (card) {
        var lines = tooltipLines(ctx, card);
        var h = TOOLTIP_PAD * 2;
        lines.forEach(function (line) { h += line.h; });
        var cardY = Math.max(148, Math.min(TREE_Y, VIEW_HEIGHT - 16 - h));
        drawCardBox({ x: cardX, y: cardY, w: TOOLTIP_WIDTH, h: h,
          pad: TOOLTIP_PAD, lines: lines });
      }
    } else if (model.branches.A.length || model.branches.B.length) {
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillStyle = "rgba(186,158,140,0.45)";
      ctx.fillText("Click an upgrade to preview it.", cardX, TREE_Y + 4);
    }
  }

  // The enemy tab is a roster beside one large detail panel.
  //
  // THE ROWS ARE 50 PIXELS AND THE LIST SCROLLS (2026-08-01, at the owner's
  // request: "make the ennemies in the side bar bigger and make it so we can
  // scroll, make it so that about 10 fits in the side bar at the same time").
  // They were 26 and the whole roster was on screen at once, which fitted but
  // was a directory rather than a field guide -- the sprite was a nine-pixel
  // speck and the row had space for a name and two numbers.
  //
  // TEN ROWS IS THE UNIT OF THE LAYOUT, not a consequence of it. The viewport
  // height below is DERIVED from the row count rather than typed in, so
  // retuning ENEMY_ROW_H moves the box and the scroll clamp together and the
  // three cannot disagree. At 50 + 3 that is 527 px of the detail panel's 539,
  // which is why the two columns still bottom out level with each other.
  //
  // A taller row buys three things the compact one had no room for: the sprite
  // at a size you can actually identify, the badge line (the ONE property that
  // changes how the enemy has to be answered), and the speed beside the
  // health -- so the list answers "what is this and how fast is it coming"
  // without the detail panel.
  var ENEMY_LIST_X = 24;
  var ENEMY_LIST_Y = 140;
  var ENEMY_LIST_W = 488;
  var ENEMY_ROW_H = 50;
  var ENEMY_ROW_GAP = 3;
  var ENEMY_VISIBLE_ROWS = 10;
  var ENEMY_LIST_H = ENEMY_VISIBLE_ROWS * (ENEMY_ROW_H + ENEMY_ROW_GAP) - ENEMY_ROW_GAP;

  // Pixels scrolled off the top. Pixels rather than a row index on purpose:
  // a wheel notch that moved a whole row would overshoot on a trackpad, and
  // the clamp below is the only thing that has to know about rows.
  var enemyScroll = 0;

  function enemyListViewport() {
    return { x: ENEMY_LIST_X, y: ENEMY_LIST_Y, w: ENEMY_LIST_W, h: ENEMY_LIST_H };
  }

  // How far the list can be scrolled before the last row is flush with the
  // bottom of the viewport. Zero (never negative) when the roster fits, which
  // is what makes the wheel a no-op on a short list rather than a way to push
  // the whole thing off screen.
  function enemyScrollMax() {
    var content = enemyModels
      ? enemyModels.length * (ENEMY_ROW_H + ENEMY_ROW_GAP) - ENEMY_ROW_GAP
      : 0;
    return Math.max(0, content - ENEMY_LIST_H);
  }

  function clampEnemyScroll() {
    enemyScroll = Math.max(0, Math.min(enemyScrollMax(), enemyScroll));
  }

  // The row's rectangle IN SCREEN SPACE -- scroll already applied, so what is
  // drawn and what is clickable stay the same rectangle (the rule every other
  // piece of geometry on this screen follows). A row scrolled out of view
  // simply has a y outside the viewport, and the click handler rejects it by
  // testing the viewport first.
  function enemyCardRect(i) {
    return {
      x: ENEMY_LIST_X,
      y: ENEMY_LIST_Y + i * (ENEMY_ROW_H + ENEMY_ROW_GAP) - enemyScroll,
      w: ENEMY_LIST_W,
      h: ENEMY_ROW_H
    };
  }

  // Scroll the roster under the cursor. The viewport test is what keeps the
  // wheel from scrolling the list while the pointer is over the detail panel,
  // where it means nothing.
  function onWheel(x, y, deltaY) {
    // A modal swallows the wheel too: scrolling a list the player cannot see
    // is motion with nothing to act on, the same reason the board's wheel is
    // dead while the pause menu is up.
    if (viewer) return;
    if (tab === "difficulties") {
      if (!pointInRect(x, y, scheduleViewport())) return;
      scheduleScroll += deltaY;
      clampScheduleScroll();
      return;
    }
    if (tab !== "enemies") return;
    if (!pointInRect(x, y, enemyListViewport())) return;
    enemyScroll += deltaY;
    clampEnemyScroll();
  }

  function enemyDetailRect() {
    return { x: 532, y: ENEMY_LIST_Y, w: VIEW_WIDTH - 556, h: 539 };
  }

  // The badge line: the ONE property that most changes how this enemy has to
  // be ANSWERED, rather than how much of it there is. There is room for
  // exactly one line, and the order is "can I shoot it" before "does it shoot
  // back" before "what does it do for the enemies around it" before what it
  // does when hurt.
  //
  // THE CHAIN MOVED TO `Enemy.traitsOf` (js/enemy.js) and this is now a
  // first-match walk down it. It used to be seventeen `if`s written out here,
  // and it was about to be copied a second time: the in-game enemy sidebar
  // (drawEnemySidebar in js/game.js) asks the same question of the same blocks
  // and wants EVERY answer rather than the first one. Two copies of "what is
  // distinctive about this enemy" is two things to retune and one of them
  // silently going stale, so the list is one list and each row carries the
  // badge string it is entitled to print. Rows with no badge -- armor,
  // defense, area resistance, phases -- are skipped here, because a headline
  // belongs to an ability rather than to plating, which the card prints in its
  // own stat block anyway.
  //
  // The strings and colours are unchanged, and a test in tests/content.test.js
  // pins each one against the type it belongs to.
  function enemyBadge(model) {
    var traits = Enemy.traitsOf(model);
    for (var i = 0; i < traits.length; i++) {
      if (traits[i].badge) return [traits[i].badge, traits[i].color];
    }
    return null;
  }

  // The behaviour row: what this one DOES, in the same first-match-wins order
  // the badge uses, falling back to what killing it pays.
  //
  // WRITTEN TIGHT ON PURPOSE, and the labels shorten on a narrow card. The
  // value column is whatever the label leaves -- about 100 px on the
  // six-column grid v0.4.9's roster forces -- so "Shields 10 strongest" is a
  // label that clips its own value into uselessness. Every pair below was
  // MEASURED against the real card width rather than eyeballed; if a future
  // type makes one longer, measure it again rather than trusting the ellipsis
  // to be graceful.
  function enemyBehaviourRow(model, narrow) {
    var a = model.attack;
    // A ONE-SHOT DIVER FIRST, because every row below it is phrased as a RATE
    // ("... every N s") and a body that dies on its only swing has no rate to
    // print. Read off the spec's own flags, so a second diver needs no edit
    // here -- and a diver that somehow kept living would fall through to the
    // ordinary damage row below and read correctly there too.
    if (a && a.selfDestructs) {
      return [narrow ? "Dives in" : "Dives into towers for",
        a.damage + " within " + a.reachUl + " u.l."];
    }
    if (a && a.stunSeconds && a.damage) {
      return [narrow ? "Hits towers" : "Hits towers for",
        a.damage + " +" + a.stunSeconds + "s stun / " + a.intervalSeconds + " s"];
    }
    if (a && a.stunSeconds) {
      return ["Silences towers", a.stunSeconds + "s / " + a.intervalSeconds + " s"];
    }
    if (a && a.disable) {
      return ["Disables towers",
        a.disable.seconds + "s / " + a.intervalSeconds + " s"];
    }
    if (a) {
      return [narrow ? "Hits towers" : "Hits towers for",
        a.damage + " every " + a.intervalSeconds + " s"];
    }

    if (model.deathEffect && model.deathEffect.hazard) {
      var hazard = model.deathEffect.hazard;
      return ["Death charge",
        hazard.towerDamage + " in " + hazard.radiusUl + " u.l. after " +
        hazard.fuseSeconds + " s"];
    }

    if (model.spawns) {
      return ["Spawns", model.spawns.count + " × " +
        Enemy.typeOf(model.spawns.type).displayName + " / " +
        model.spawns.intervalSeconds + " s"];
    }

    if (model.fractal) {
      return ["Splits on death", model.fractal.splitCount + " × next lower tier"];
    }

    // Everything a support pulse does, derived from the block rather than
    // written out per type -- retune the interval and this follows.
    var s = model.support;
    if (s && s.haste) {
      return ["Hastens ×" + (s.targets || 1),
        "+" + Math.round((s.haste.speedMultiplier - 1) * 100) + "% for " +
        s.haste.seconds + "s / " + s.intervalSeconds + " s"];
    }
    if (s && s.heal) {
      return ["Heals ×" + (s.targets || 1),
        s.heal.perSecond + "/s for " + s.heal.seconds + " s / " +
        s.intervalSeconds + " s"];
    }
    if (s && s.shield && s.pick === "self") {
      return ["Own shield", s.shield + " / " + s.intervalSeconds + " s, no stack"];
    }
    if (s && s.shield) {
      return ["Shields ×" + (s.targets || 1),
        s.shield + " / " + s.intervalSeconds + " s, stacks"];
    }

    return ["Bounty", model.bounty + " mana"];
  }

  function drawEnemiesGridLegacy(ctx) {
    enemyModels.forEach(function (model, i) {
      var r = enemyCardRect(i);

      // The card gets NARROWER as the roster grows -- the grid is three rows
      // and the columns follow from how many types there are, so v0.4.9's four
      // extra types took the card from 238 px to 197. Rather than let the name
      // clip, the sprite column and the type size shrink with it. One
      // threshold, because there are only two layouts worth having: the roomy
      // one and the one that still fits "Shieldbearer".
      var narrow = r.w < 210;
      var iconX = r.x + (narrow ? 32 : 46);
      var textX = iconX + (narrow ? 24 : 50);
      var textW = r.w - (textX - r.x) - 12;

      ctx.fillStyle = "rgba(24,18,22,0.9)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(240,150,78,0.3)";
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

      // The exhibit: the real sprite, enlarged. Scaling the context rather
      // than the enemy keeps its draw() untouched. The scale is capped so the
      // Midboss -- nearly twice a normal's radius before magnification -- does
      // not burst out of its card; a Swarm speck still gets the full 2x.
      var sx = iconX;
      var sy = r.y + 62;
      var zoom = Math.min(narrow ? 1.6 : 2, (narrow ? 20 : 26) / model.sprite.radiusPx());
      model.sprite.pos = { x: sx, y: sy };
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(zoom, zoom);
      ctx.translate(-sx, -sy);
      model.sprite.draw(ctx);
      ctx.restore();

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = "600 " + (narrow ? 14 : 16) + "px system-ui, sans-serif";
      ctx.fillStyle = "#f6d9b4";
      ctx.fillText(fitText(ctx, model.name, textW), textX, r.y + 14);

      var badge = enemyBadge(model);
      if (badge) {
        ctx.font = "600 " + (narrow ? 10 : 11) + "px system-ui, sans-serif";
        ctx.fillStyle = badge[1];
        ctx.fillText(fitText(ctx, badge[0], textW), textX, r.y + (narrow ? 34 : 36));
      }

      // The health row carries the shield and the second life, because both
      // are health by any measure that matters -- they are what the player
      // has to chew through, even though since 2026-07-30 only one of them
      // pays. Neither gets a row of its own: the card is 168 px tall and five
      // rows is what fits, which is the same headroom rule the inspection
      // panel lives under.
      var healthValue = model.shield
        ? model.health + "+" + (model.health * model.shield.ratio) + " HP"
        : model.health + " HP";
      if (model.revive) healthValue += " ×" + (1 + model.revive.times);
      if (model.maxHp > model.health) healthValue += "  (→ " + model.maxHp + ")";

      // Rounded for display only: a speed multiplier of 0.55 lands on
      // 27.500000000000004 in binary floating point, and a field guide should
      // not print that at the player.
      function ulps(n) { return Math.round(n * 100) / 100; }

      // A type whose speed CHANGES shows both figures, in the order the player
      // meets them, before the unit -- "45 → 90 u.l./s" reads as one
      // measurement with a threshold in it, where a trailing "→ 1.8×" reads as
      // a second, unrelated number. A sprint runs fast first and settles, so
      // its pair is the other way round.
      var speedValue;
      if (model.sprint) {
        speedValue = ulps(model.speed * model.sprint.speedMultiplier) + " → " +
          ulps(model.speed) + " u.l./s";
      } else if (model.shield && model.shield.onBreak &&
                 model.shield.onBreak.speedMultiplier) {
        speedValue = ulps(model.speed) + " → " +
          ulps(model.speed * model.shield.onBreak.speedMultiplier) +
          " u.l./s  (" + model.multiplier + "×)";
      } else {
        speedValue = ulps(model.speed) + " u.l./s  (" + model.multiplier + "×)";
      }

      var rows = [
        ["Health", healthValue],
        ["Speed", speedValue],
        model.sprint
          ? ["Sprints for", "the first " + model.sprint.untilUl + " u.l."]
          : ["Crossing", "~" + Math.round(model.crossing) + " s"],
        [narrow ? "Armor / def" : "Armor / defense", model.armor + " / " + model.defense + "%"],
        enemyBehaviourRow(model, narrow)
      ];
      rows.forEach(function (row, j) {
        var ry = r.y + 58 + j * 19;
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillStyle = "rgba(186,158,140,0.65)";
        var label = fitText(ctx, row[0], r.w * 0.5);
        ctx.fillText(label, r.x + 14, ry);
        // The value gets whatever the label left, MEASURED rather than
        // assumed: on a seven-column grid the old fixed 118 px allowance was
        // wider than the card's whole value column, so every stat clipped.
        var room = r.w - 28 - ctx.measureText(label).width - 8;
        ctx.textAlign = "right";
        ctx.font = "600 12px system-ui, sans-serif";
        ctx.fillStyle = "#ecdece";
        ctx.fillText(fitText(ctx, row[1], room), r.x + r.w - 14, ry);
        ctx.textAlign = "left";
      });

      // Where the player meets it. A type with an EMPTY list is not a bug: the
      // four v0.4.9 types are deliberately unscheduled, and saying so plainly
      // is better than a bare "Waves" with nothing after it.
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillStyle = model.waves.length
        ? "rgba(240,150,78,0.8)" : "rgba(186,158,140,0.45)";
      ctx.fillText(fitText(ctx,
        model.waves.length ? "Waves " + model.waves.join(", ") : "Sandbox only — no wave",
        r.w - 28), r.x + 14, r.y + 58 + 5 * 19 + 3);
    });
  }

  function roundStat(n) {
    return Math.round(n * 100) / 100;
  }

  function drawEnemySkin(ctx, model, x, y, maxRadius, zoomCap) {
    var zoom = Math.min(zoomCap, maxRadius / model.sprite.radiusPx());
    model.sprite.pos = { x: x, y: y };
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(zoom, zoom);
    ctx.translate(-x, -y);
    model.sprite.draw(ctx, { hideBars: true });
    ctx.restore();
  }

  // THE REAL BODY, WITH THE 2D SKIN AS THE FLOOR.
  //
  // This screen used to magnify `model.sprite` everywhere -- the 2D fallback
  // drawing, authored before these enemies had meshes. So a player studied one
  // picture in the guide and met a different one on the road, which is the one
  // thing a field guide must not do. The mesh comes first now and the skin is
  // what runs when there is no WebGL, or no mesh for that type.
  //
  // SOME TYPES HAVE NO MESH and reach the skin path here on every load. That is
  // not a bug in this function; the board draws those as a coloured sphere.
  // Both are placeholders and neither is what the type will eventually look
  // like.
  //
  // THE COUNT IS DELIBERATELY NOT WRITTEN DOWN HERE. It moves every time a
  // model lands, and a stale one in a comment is worse than none — the first
  // draft of this block said EIGHT and was wrong within the day. Ask the tree
  // instead: the types with no mesh are the ones `World3D.enemyModelFor`
  // answers null for, and `Codex.models().enemies` carries the resolved `mesh`
  // per row. Note when you count that an UNCOMMITTED model file in someone
  // else's working tree counts as present — a figure taken on a shared tree is
  // a figure about that tree, not about a clean checkout.
  //
  // `opts.live` is the caller's call, not this function's, and getting it
  // wrong costs frame time rather than correctness: a list of ten rows must be
  // CACHED (ten readbacks a frame is not a list, it is a stall), and the
  // full-screen viewer must be LIVE (its yaw is continuous and a revolution of
  // cache entries at viewer size is tens of megabytes).
  function drawEnemyBody(ctx, model, x, y, box, opts) {
    if (model.mesh && typeof ModelViewer3D !== "undefined" &&
        ModelViewer3D.draw(ctx, model.mesh, x, y, box, opts)) {
      return true;
    }
    // The skin is drawn to the same visual footprint the mesh would fill, so a
    // row does not jump when a model lands for that type.
    drawEnemySkin(ctx, model, x, y, box * 0.42, 2.4);
    return false;
  }

  // --- the viewer -----------------------------------------------------------
  //
  // A body, large, turning slowly, and for an enemy walking on the spot, with
  // an arrow either side to step through the roster. Opened by clicking the
  // model in the list or the detail panel; closed by Escape, by the arrows'
  // own Back, or by clicking outside the stage.
  //
  // WHY IT IS A SUB-SCREEN OF THE INDEX RATHER THAN A SCREEN OF ITS OWN.
  // `screen` is game.js's, and every value of it is a place the player can be
  // that has its own Back button, its own key map and its own entry in three
  // switch statements. This is a modal over one tab of one screen; it keeps its
  // own state here, the index keeps its scroll position and its selection
  // underneath, and leaving the viewer puts the player back exactly where they
  // were. That is the "remembers where it was" property, and it is free this
  // way and fiddly any other.
  //
  // THE CLOCK IS READ AT DRAW TIME, never in update(). Nothing here is
  // simulation: no run is in progress on this screen and the rotation is a
  // property of the picture, not of the game.
  var viewer = null;          // { kind: "enemy" | "tower", i: n, t0: ms }

  // One revolution every ROT_SECONDS. "Slowly turning around" is the whole
  // brief for this motion: fast enough that a player waiting to see the back of
  // a body does not give up, slow enough to read as a turntable rather than a
  // spin. At 14 s a 360 px body's rim moves about 80 px/s, which is a shape
  // turning rather than an object being flung.
  var ROT_SECONDS = 14;
  var VIEW_BOX = 360;         // the model's box, logical px
  var VIEW_CY = 312;

  // The fixed yaw every STATIC preview on this screen uses -- the rail, the
  // enemy rows, the detail exhibit. A shallow three-quarter, for the reason
  // js/gl/tower-preview.js gives at length: these bodies carry their identity
  // along their forward axis, and turning further collapses a weapon into the
  // body holding it.
  //
  // -30 rather than the icon camera's -25 because ModelViewer3D quantises a
  // cached yaw to 24 steps of 15 degrees: -25 would be silently served as -30
  // anyway, and asking for a value the cache cannot hold is how a constant
  // starts lying about what is on screen.
  var LIST_YAW = -30 * Math.PI / 180;

  // A FUNCTION, NOT A CONSTANT, and the reason is load order: this file is a
  // classic <script> that runs BEFORE js/game.js, so `VIEW_WIDTH` does not
  // exist yet at module-definition time. Every other rectangle on this screen
  // already reads it inside a function for the same reason; a module-scope
  // `VIEW_WIDTH / 2` here would have thrown at load and taken the whole index
  // down with it.
  function viewCx() { return VIEW_WIDTH / 2; }

  function nowMs() {
    return (typeof performance !== "undefined" && performance.now)
      ? performance.now() : Date.now();
  }

  function viewerStageRect() {
    return { x: viewCx() - 324, y: 84, w: 648, h: 512 };
  }

  function viewerArrowRect(dir) {
    var s = viewerStageRect();
    return { x: dir < 0 ? s.x - 92 : s.x + s.w + 28, y: VIEW_CY - 48,
             w: 64, h: 96 };
  }

  function viewerCloseRect() {
    var s = viewerStageRect();
    return { x: s.x + s.w - 40, y: s.y + 10, w: 30, h: 30 };
  }

  // What the viewer is stepping through. For enemies that is the whole roster
  // in roster order. For a tower it is the bodies that tower can wear, base
  // first, which is the list the player is actually choosing between.
  //
  // A TIER THAT WEARS THE SAME MESH AS THE TIER BEFORE IT IS NOT A SEPARATE
  // ENTRY, and it says so. Rifleman A1, A2 and A4 buy no new body; the Siphon
  // gives every tier its own. Showing eleven identical pictures with different
  // labels would be the guide telling a lie that the geometry does not.
  function viewerList() {
    if (!viewer) return [];
    if (viewer.kind === "enemy") {
      return enemyModels.map(function (m) {
        return { label: m.name, mesh: m.mesh, enemy: m, note: null };
      });
    }
    var t = towerModels[towerIndex];
    var out = [{ label: t.name, mesh: t.model, enemy: null, note: "unbought" }];
    if (!t.branches) return out;
    ["A", "B"].forEach(function (branch) {
      var carried = t.model;
      t.branches[branch].forEach(function (tier) {
        if (!tier.model) return;
        if (tier.model === carried) return;    // no new body at this tier
        carried = tier.model;
        out.push({ label: t.name + " " + tier.id, mesh: tier.model,
                   enemy: null, note: "Path " + branch });
      });
    });
    return out;
  }

  function openViewer(kind) {
    viewer = { kind: kind, t0: nowMs() };
    // Start on whatever the player was already looking at, which is the whole
    // of "remembers where it was" for the enemy tab.
    viewer.i = 0;
    if (kind === "enemy") {
      viewer.i = Math.max(0, Math.min(enemyModels.length - 1, enemyIndex));
    }
  }

  function closeViewer() { viewer = null; }

  // Stepping WRAPS. A field guide is a ring, not a list with two dead ends, and
  // a disabled arrow at each end is two more states to draw for no gain.
  function stepViewer(d) {
    if (!viewer) return;
    var list = viewerList();
    if (!list.length) return;
    viewer.i = ((viewer.i + d) % list.length + list.length) % list.length;
    // The selection under the viewer follows, so closing it leaves the index
    // showing what the player was just looking at rather than where they came
    // in.
    if (viewer.kind === "enemy") {
      enemyIndex = viewer.i;
      keepEnemyRowVisible(viewer.i);
    }
  }

  // Scroll the roster so the row the viewer is on is inside the box. Without
  // this, stepping past the tenth enemy in the viewer and then closing it
  // leaves the list scrolled to somewhere the selection is not.
  function keepEnemyRowVisible(i) {
    var top = i * (ENEMY_ROW_H + ENEMY_ROW_GAP);
    var bottom = top + ENEMY_ROW_H;
    if (top < enemyScroll) enemyScroll = top;
    else if (bottom > enemyScroll + ENEMY_LIST_H) {
      enemyScroll = bottom - ENEMY_LIST_H;
    }
    clampEnemyScroll();
  }

  function drawViewerArrow(ctx, dir) {
    var r = viewerArrowRect(dir);
    var hot = pointInRect(mouse.x, mouse.y, r);
    ctx.fillStyle = hot ? "rgba(240,150,78,0.22)" : "rgba(30,22,26,0.9)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = hot ? "rgba(255,190,130,0.95)" : "rgba(240,150,78,0.4)";
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - dir * 8, cy - 13);
    ctx.lineTo(cx + dir * 9, cy);
    ctx.lineTo(cx - dir * 8, cy + 13);
    ctx.closePath();
    ctx.fillStyle = hot ? "#ffe6c4" : "rgba(186,158,140,0.8)";
    ctx.fill();
  }

  function drawViewer(ctx) {
    var list = viewerList();
    if (!list.length) { viewer = null; return; }
    if (viewer.i >= list.length) viewer.i = 0;
    var item = list[viewer.i];

    ctx.fillStyle = "rgba(8,9,13,0.93)";
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    var s = viewerStageRect();
    ctx.fillStyle = "rgba(19,14,18,0.96)";
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(240,150,78,0.4)";
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);

    // THE MOTION. Elapsed time drives both the turn and the walk, and they are
    // deliberately not locked to each other: a body whose stride completed once
    // per revolution would look like a wind-up toy.
    // STARTS WHERE THE PICTURE THE PLAYER CLICKED WAS POINTING. Every static
    // preview on this screen sits at LIST_YAW; the modal used to start at 0,
    // so the body visibly snapped through 30 degrees at the exact moment the
    // player was comparing the two. The turn is continuous from there.
    var t = (nowMs() - viewer.t0) / 1000;
    var yaw = LIST_YAW + (t / ROT_SECONDS) * Math.PI * 2;

    var drew = false;
    if (item.enemy) {
      // Frames come from the model's own walk band, never from arithmetic on
      // frames.length -- enemies index frame 0 as a walk frame and the summoner
      // family reserves it as a rest pose, so any constant here would be wrong
      // for one of them.
      var frame = (item.mesh && typeof ModelViewer3D !== "undefined")
        ? ModelViewer3D.walkFrame(item.mesh, t * item.enemy.walkHz) : 0;
      drew = drawEnemyBody(ctx, item.enemy, viewCx(), VIEW_CY, VIEW_BOX,
        { yaw: yaw, frame: frame, live: true });
    } else if (item.mesh && typeof ModelViewer3D !== "undefined") {
      drew = ModelViewer3D.draw(ctx, item.mesh, viewCx(), VIEW_CY, VIEW_BOX,
        { yaw: yaw, frame: 0, live: true });
    }
    if (!drew && !item.enemy) {
      // A tower with no mesh falls back to its own glyph, at a size that fills
      // the same box, so the stage is never empty.
      var Type = towerModels[towerIndex] && towerModels[towerIndex].type;
      if (Type && Type.drawIcon) Type.drawIcon(ctx, viewCx(), VIEW_CY, 120);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "700 28px system-ui, sans-serif";
    ctx.fillStyle = "#f6d9b4";
    ctx.fillText(fitText(ctx, item.label, s.w - 48), viewCx(), s.y + 402);

    // The second line says what this body IS, and for an enemy that is the
    // badge -- the one property that changes how it has to be answered.
    var sub = item.note;
    if (item.enemy) {
      var badge = enemyBadge(item.enemy);
      sub = badge ? badge[0] : "STANDARD — no special ability";
      ctx.fillStyle = badge ? badge[1] : "rgba(186,158,140,0.6)";
    } else {
      ctx.fillStyle = "rgba(186,158,140,0.6)";
    }
    if (sub) {
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillText(fitText(ctx, sub, s.w - 48), viewCx(), s.y + 440);
    }

    // SAY WHEN THE PICTURE IS NOT THE MESH. A magnified 2D skin standing in for
    // a body that was never modelled is honest only if it admits it; without
    // this line it reads as the model, which is the exact failure this whole
    // feature exists to end.
    if (!drew) {
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,205,130,0.85)";
      ctx.fillText("No 3D model yet — showing the flat marker",
        viewCx(), s.y + 464);
    }

    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,158,140,0.5)";
    ctx.fillText((viewer.i + 1) + " / " + list.length, viewCx(), s.y + 486);

    drawViewerArrow(ctx, -1);
    drawViewerArrow(ctx, 1);

    var close = viewerCloseRect();
    var closeHot = pointInRect(mouse.x, mouse.y, close);
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillStyle = closeHot ? "#ffe6c4" : "rgba(186,158,140,0.55)";
    ctx.fillText("×", close.x + close.w / 2, close.y + 4);

    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,158,140,0.45)";
    ctx.fillText("← →  previous / next     ·     Esc  back to the index",
      viewCx(), s.y + s.h + 16);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  function enemyEffectiveHealth(model) {
    var total = model.health;
    if (model.shield) total += model.health * model.shield.ratio;
    if (model.revive) {
      total += model.health * model.revive.times * model.revive.healFraction;
    }
    return roundStat(total);
  }

  function enemyVisibility(model) {
    if (model.isFlying) return "Flying — needs air reach";
    if (model.isCamo) return "Camouflaged — needs detection";
    return "Ground — normally visible";
  }

  function summonCount(spec) {
    if (!spec || !spec.groups) return 0;
    return spec.groups.reduce(function (sum, group) { return sum + group.count; }, 0);
  }

  function attackDescription(attack, model) {
    var target = attack.target === "highestDps"
      ? "the highest-DPS tower" : "nearby towers";

    // A DIVE IS A ONE-SHOT, and the sentence below is built around a RATE.
    // A spec that kills its own body on the first swing has no interval to
    // print, so it gets its own sentence -- returned early, exactly as the
    // disable does one paragraph down, and driven off the spec's generic flags
    // rather than off any type id.
    if (attack.selfDestructs) {
      return "The moment a tower is within " + attack.reachUl +
        " u.l. it dives onto the nearest one, deals " + (attack.damage || 0) +
        " damage to it, and dies of the impact. It gets no second dive, and " +
        "a dive is a death: it pays its bounty and leaves behind whatever " +
        "its death leaves.";
    }

    // A DISABLE IS NOT A DAMAGE ATTACK, and the card must not open by saying it
    // hits for 0. Read off the spec's own `disable` block, so a second
    // saboteur type would print correctly with nothing edited here.
    if (attack.disable && !(attack.damage > 0)) {
      var d = attack.disable;
      var text = "Deals NO damage. Every " + attack.intervalSeconds +
        " s it stops beside the nearest valid tower";
      if (attack.reachUl !== undefined) text += " within " + attack.reachUl + " u.l.";
      if (attack.windUpSeconds) {
        text += ", telegraphs for " + attack.windUpSeconds + " s";
      }
      text += ", then shuts it down for " + d.seconds + " s. A disabled tower " +
        "cannot fire and its cooldown does not advance. That tower is then " +
        "immune to every " + ((model && model.name) || "one of these") +
        " for " + d.immuneSeconds + " s after it recovers, so several of them " +
        "cannot hold one tower silent.";
      return text;
    }

    var text = "Attacks " + target + " for " + (attack.damage || 0) +
      " damage every " + attack.intervalSeconds + " s";
    if (attack.stunSeconds) text += " and stuns for " + attack.stunSeconds + " s";
    if (attack.windUpSeconds) text += " after a " + attack.windUpSeconds + " s wind-up";
    if (attack.reachUl !== undefined) text += " within " + attack.reachUl + " u.l.";
    else if (attack.target === "highestDps") text += " anywhere on the map";
    if (attack.leap) {
      text += "; leaps " + attack.leap.distanceUl + " u.l. and hits a " +
        attack.leap.radiusUl + " u.l. area";
    }
    return text + ".";
  }



  function enemyDescriptions(model) {
    var lines = [];
    var hasMechanic = false;
    if (model.description) lines.push(model.description);

    if (model.isFlying) {
      lines.push("Ground-only towers cannot target it; attacks need explicit air reach.");
      hasMechanic = true;
    } else if (model.isCamo) {
      lines.push("Invisible to towers without camouflage detection.");
      hasMechanic = true;
    }

    if (model.aoeDamageReduction) {
      lines.push("Takes " + Math.round(model.aoeDamageReduction * 100) +
        "% less damage from area attacks. Piercing and ordinary shots are unaffected.");
      hasMechanic = true;
    }

    model.attacks.forEach(function (attack) {
      lines.push(attackDescription(attack, model));
      hasMechanic = true;
    });

    if (model.shield) {
      var shieldHp = roundStat(model.health * model.shield.ratio);
      var text = "Starts with " + shieldHp + " shield (" + model.shield.ratio +
        "× base health) before its body can be hurt";
      if (model.shield.onBreak && model.shield.onBreak.speedMultiplier) {
        text += "; breaking it multiplies speed by " +
          model.shield.onBreak.speedMultiplier + "×";
      }
      lines.push(text + ".");
      hasMechanic = true;
    }

    if (model.revive) {
      lines.push("Revives " + model.revive.times + " time at " +
        Math.round(model.revive.healFraction * 100) + "% health" +
        (model.revive.roots ? " and becomes permanently rooted where it fell." : "."));
      hasMechanic = true;
    }

    if (model.spawns) {
      var spawnType = Enemy.typeOf(model.spawns.type).displayName;
      var spawnText = "Spawns " + model.spawns.count + " " + spawnType +
        " every " + model.spawns.intervalSeconds + " s";
      if (model.spawns.shieldRatio) {
        spawnText += ", each with a " + model.spawns.shieldRatio + "× health shield";
      }
      if (model.spawns.noBounty) spawnText += " and no bounty at all";
      lines.push(spawnText + ". Damage to the brood still counts on towers.");
      hasMechanic = true;
    }

    if (model.fractal) {
      var tiers = [];
      for (var tier = model.fractal.minTier; tier <= model.fractal.maxTier; tier++) {
        tiers.push("T" + tier + " = " + Enemy.healthOf(model.id, undefined, tier) + " HP");
      }
      lines.push(tiers.join(", ") + ".");
      lines.push("On death, T1–T5 split into four copies of the next lower tier; T0 dies normally. Every copy pays its own tier-scaled kill bounty.");
      hasMechanic = true;
    }

    var support = model.support;
    // THE HERALD'S PULSE. Checked before heal/shield because a haste spec
    // carries neither, so the two branches below would say nothing at all.
    if (support && support.haste) {
      var gain = Math.round((support.haste.speedMultiplier - 1) * 100);
      lines.push("Every " + support.intervalSeconds + " s, gives +" + gain +
        "% movement speed for " + support.haste.seconds + " s to the " +
        support.targets + " nearest eligible allies within " +
        support.reachUl + " u.l.");
      // The exclusions, read off the same `eligible` block the mechanic reads
      // rather than written out, so the card cannot claim a rule the game does
      // not enforce.
      var barred = [];
      var rule = support.eligible || {};
      if (rule.excludeSameType) barred.push("other " + model.name + "s");
      if (rule.excludeFlying) barred.push("fliers");
      if (rule.excludeFractal) barred.push("Fractal Slimes and their splits");
      if (rule.excludeBanner) barred.push("bosses and the Midboss");
      if (barred.length) {
        lines.push("It cannot hasten itself, " + barred.join(", ") + ".");
      }
      lines.push("Haste never stacks: a second pulse refreshes the " +
        support.haste.seconds + " s rather than compounding the speed, and it " +
        "keeps running if the source dies. It leaves no permanent speed behind.");
      hasMechanic = true;
    } else if (support && support.heal) {
      lines.push("Every " + support.intervalSeconds + " s, heals the " +
        support.targets + " most wounded enemies for " + support.heal.perSecond +
        " HP/s over " + support.heal.seconds + " s.");
      hasMechanic = true;
    } else if (support && support.shield) {
      var supportTarget = support.pick === "self" ? "itself" :
        "the " + support.targets + " strongest enemies";
      lines.push("Every " + support.intervalSeconds + " s, gives " + support.shield +
        " shield to " + supportTarget + (support.stacks ? "; grants stack." :
          "; this refreshes instead of stacking."));
      hasMechanic = true;
    }

    // THE VOLATILE'S CHARGE. Read off the generic `deathEffect` block, so a
    // second type with a different fuse or radius prints its own numbers.
    if (model.deathEffect && model.deathEffect.hazard) {
      var hz = model.deathEffect.hazard;
      lines.push("However it dies in combat -- shot down, or on its own " +
        "dive -- it leaves a live charge where it fell. " +
        hz.fuseSeconds + " s later the charge deals " + hz.towerDamage +
        " damage once to every living tower within " + hz.radiusUl +
        " u.l. It does not stun and it cannot hurt other enemies, so one " +
        "charge can never set off another.");
      lines.push("Leaking into the base leaves no charge at all, and the " +
        "charge itself is not an enemy: it pays nothing, and it holds neither " +
        "the wave nor the victory screen open.");
      hasMechanic = true;
    }

    if (model.sprint) {
      lines.push("Moves at " + model.sprint.speedMultiplier + "× speed for the first " +
        model.sprint.untilUl + " u.l., then returns to its listed speed.");
      hasMechanic = true;
    }

    if (model.phases) {
      model.phases.forEach(function (phase) {
        var phaseText = "At " + Math.round(phase.atHealthFraction * 100) + "% health";
        if (phase.shield) phaseText += ", gains " + phase.shield + " shield";
        if (phase.speedMultiplier) phaseText += ", speed becomes " + phase.speedMultiplier + "×";
        if (phase.attackIntervalMultiplier) {
          phaseText += ", attacks recharge at " + phase.attackIntervalMultiplier + "× time";
        }
        if (phase.addAttack) phaseText += ", unlocks another attack";
        var called = summonCount(phase.summon);
        if (called) phaseText += " and summons " + called + " enemies";
        lines.push(phaseText + ".");
      });
      hasMechanic = true;
    }

    if (!hasMechanic && !model.description) {
      lines.push("No special ability. Its threat comes entirely from health and movement speed.");
    }
    return lines;
  }

  function drawEnemyList(ctx) {
    var view = enemyListViewport();

    ctx.textBaseline = "middle";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,158,140,0.55)";
    ctx.textAlign = "left";
    ctx.fillText("ENEMY", ENEMY_LIST_X + 62, ENEMY_LIST_Y - 10);
    ctx.textAlign = "right";
    ctx.fillText("HP", ENEMY_LIST_X + ENEMY_LIST_W - 84, ENEMY_LIST_Y - 10);
    ctx.fillText("BOUNTY", ENEMY_LIST_X + ENEMY_LIST_W - 14, ENEMY_LIST_Y - 10);

    // Everything below is drawn INSIDE the viewport. Without the clip a
    // scrolled row would paint over the header above and off the bottom of the
    // panel, which is the one way a scrolling list can look broken while being
    // perfectly correct.
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.x, view.y, view.w, view.h);
    ctx.clip();

    enemyModels.forEach(function (model, i) {
      var r = enemyCardRect(i);
      // Rows entirely outside the box cost nothing to skip and would otherwise
      // each run a sprite draw the clip throws away.
      if (r.y + r.h < view.y || r.y > view.y + view.h) return;

      var active = i === enemyIndex;
      var hot = pointInRect(mouse.x, mouse.y, r) &&
        pointInRect(mouse.x, mouse.y, view);
      // QUIET plates here, and the flag is doing real work: ten rows are
      // visible at once, and ten sets of rivets and sheared corners is a
      // texture rather than a list. The banding that told one row from the
      // next is kept as a fill, so the theme arrives without the density.
      drawAshPlate(r, {
        accent: ASH_EMBER, quiet: true, cut: 8,
        live: active ? 0.85 : (hot ? 0.4 : 0),
        fill: active ? "rgba(52,34,26,0.94)"
          : (i % 2 ? "rgba(20,16,20,0.88)" : "rgba(26,20,24,0.88)")
      });

      // The REAL BODY now, at a fixed three-quarter yaw and its rest frame --
      // the same shape the detail panel's exhibit uses, so the thing in the
      // list and the thing in the panel are recognisably one enemy.
      //
      // CACHED, and this is the one place where getting the policy wrong would
      // be felt: ten rows are visible at once, and ten live readbacks a frame
      // is a stall rather than a list. One entry each, filled one per frame,
      // and every frame after that is a blit.
      drawEnemyBody(ctx, model, r.x + 30, r.y + r.h / 2, 46,
        { yaw: LIST_YAW, frame: 0 });

      var textX = r.x + 62;
      var textW = r.w - (textX - r.x) - 96;

      ctx.textAlign = "left";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillStyle = active ? "#ffe6c4" : "#d9c8b6";
      ctx.fillText(fitText(ctx, model.name, textW), textX, r.y + 17);

      // The badge, or the speed when a type has no single defining property.
      // Never nothing: a blank second line on a 50 px row reads as a row that
      // failed to load rather than as an ordinary enemy.
      var badge = enemyBadge(model);
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.fillStyle = badge ? badge[1] : "rgba(186,158,140,0.5)";
      ctx.fillText(fitText(ctx, badge ? badge[0] : "STANDARD — no special ability",
        textW), textX, r.y + 34);

      ctx.textAlign = "right";
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillStyle = "rgba(230,238,252,0.9)";
      ctx.fillText(String(model.health) + " HP", r.x + r.w - 84, r.y + 17);
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,215,110,0.9)";
      ctx.fillText(model.bounty + " mana", r.x + r.w - 14, r.y + 17);

      // Speed under the money, so the two columns each carry a "how much" and
      // a "how fast" rather than the row being three numbers in a line.
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(186,158,140,0.55)";
      ctx.fillText(Math.round(model.speed) + " u.l./s", r.x + r.w - 14, r.y + 35);
    });

    ctx.restore();

    // The scrollbar, only when there is something to scroll. It is the only
    // thing on screen that says the list continues past the bottom edge, so it
    // is drawn OUTSIDE the clip and hard against the viewport's right edge.
    var max = enemyScrollMax();
    if (max > 0) {
      var trackX = view.x + view.w + 6;
      ctx.fillStyle = "rgba(240,150,78,0.12)";
      ctx.fillRect(trackX, view.y, 5, view.h);

      var thumbH = Math.max(28, view.h * (view.h / (view.h + max)));
      var thumbY = view.y + (view.h - thumbH) * (enemyScroll / max);
      ctx.fillStyle = "rgba(255,190,130,0.55)";
      ctx.fillRect(trackX, thumbY, 5, thumbH);
    }
  }

  function drawEnemyDetail(ctx, model) {
    var r = enemyDetailRect();
    ctx.fillStyle = "rgba(19,14,18,0.94)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(240,150,78,0.35)";
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    // The exhibit, and the door into the viewer. Its rectangle is
    // enemyDetailIconRect and it is highlighted on hover, because a picture
    // that opens something has to say so.
    var icon = enemyDetailIconRect();
    if (pointInRect(mouse.x, mouse.y, icon)) {
      ctx.fillStyle = "rgba(240,150,78,0.10)";
      ctx.fillRect(icon.x, icon.y, icon.w, icon.h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,190,130,0.7)";
      ctx.strokeRect(icon.x + 0.5, icon.y + 0.5, icon.w - 1, icon.h - 1);
    }
    drawEnemyBody(ctx, model, icon.x + icon.w / 2, icon.y + icon.h / 2, 88,
      { yaw: LIST_YAW, frame: 0 });

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.fillStyle = "#f6d9b4";
    // FIT, NOT BARE. This was a plain fillText with no fit and no clip, and
    // every display name in the game is being rewritten -- a name two words
    // longer would have run straight out of the panel and over the stat
    // columns. The width is the panel minus the exhibit column and a margin.
    ctx.fillText(fitText(ctx, model.name, r.w - 142), r.x + 122, r.y + 20);
    var badge = enemyBadge(model);
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = badge ? badge[1] : "rgba(186,158,140,0.6)";
    ctx.fillText(badge ? badge[0] : "STANDARD ENEMY", r.x + 122, r.y + 58);
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,158,140,0.5)";
    ctx.fillText("Click the model to see it walk  ·  select another from the list to compare.",
      r.x + 122, r.y + 82);

    var effective = enemyEffectiveHealth(model);
    var rows = [
      ["Base health", model.health + " HP"],
      ["Highest campaign HP", model.maxHp + " HP"],
      ["Starting effective HP", effective + " HP"],
      ["Kill bounty", model.bounty + " mana"],
      ["Movement speed", roundStat(model.speed) + " u.l./s (" + model.multiplier + "×)"],
      ["Reference crossing", "~" + Math.round(model.crossing) + " s"],
      ["Flat armor", String(model.armor)],
      ["Defense", model.defense + "%"],
      ["AoE reduction", Math.round(model.aoeDamageReduction * 100) + "%"],
      ["Body size", model.sizeScale + "×"],
      ["Visibility", enemyVisibility(model)]
    ];

    // ONE ROW PER DIFFICULTY, in the table's own order. A single "Campaign
    // waves" line was honest while there was one schedule; with two it would
    // have to either merge them -- which tells the player nothing about which
    // campaign to look in -- or silently pick one. The Herald, the Sapper and
    // the Volatile are Normal-only and this row is the whole of how the guide
    // says so.
    model.appearances.forEach(function (entry) {
      rows.push([entry.name + " waves",
        entry.waves.length ? entry.waves.join(", ") : "—"]);
    });
    if (model.fractal) {
      rows.splice(2, 0, ["Tier range",
        "T" + model.fractal.minTier + "–T" + model.fractal.maxTier +
        " (1–" + Enemy.healthOf(model.id, undefined, model.fractal.maxTier) + " HP)"]);
    }

    var columns = 2;
    var perColumn = Math.ceil(rows.length / columns);
    var statTop = r.y + 130;
    var statColumnW = (r.w - 52) / columns;
    rows.forEach(function (row, i) {
      var col = Math.floor(i / perColumn);
      var line = i % perColumn;
      var x = r.x + 20 + col * (statColumnW + 12);
      var y = statTop + line * 24;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillStyle = "rgba(186,158,140,0.58)";
      ctx.fillText(row[0], x, y);
      ctx.textAlign = "right";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillStyle = "#ecdece";
      ctx.fillText(fitText(ctx, row[1], statColumnW * 0.58), x + statColumnW, y);
    });

    var behaviourY = r.y + 292;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(240,150,78,0.9)";
    ctx.fillText("BEHAVIOUR", r.x + 20, behaviourY);
    behaviourY += 24;

    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(219,231,245,0.82)";
    enemyDescriptions(model).forEach(function (description) {
      if (behaviourY > r.y + r.h - 24) return;
      var wrapped = wrapText(ctx, description, r.w - 40, 3);
      wrapped.forEach(function (line) {
        if (behaviourY > r.y + r.h - 20) return;
        ctx.fillText(line, r.x + 20, behaviourY);
        behaviourY += 18;
      });
      behaviourY += 7;
    });
  }

  // --- the Difficulties tab (2026-08-27) -----------------------------------
  //
  // Two SUB-tabs, one per difficulty, each previewing that difficulty's whole
  // thirty-five-wave schedule: what arrives, how many, how tough, what it pays
  // and how long its window is.
  //
  // NOTHING ON IT IS WRITTEN DOWN. Every row is walked off the schedule through
  // the game's own resolvers -- `waveSummary` for the roster line, `waveCount`,
  // `waveEffectiveHealth`, `waveReward` and `waveTimeline` for the numbers --
  // so it is the same arithmetic the banner, the payout and the scheduler use.
  // Retune a wave and this screen follows; there is no copy to go stale, which
  // is the property every other tab on this screen already has.
  //
  // IT IS A PREVIEW AND NOT A SELECTOR. Reading about Normal here does not
  // select it: `previewDifficultyId` is separate from `selectedDifficultyId`,
  // and the only thing that writes the latter is `setDifficulty`. The index is
  // reached from the title menu, where there is no run to change, and a screen
  // that quietly changed what the next run plays would be a trap.
  // NULL UNTIL open(), NOT `DEFAULT_DIFFICULTY_ID`. This module's body runs at
  // load, and index.html loads js/codex.js BEFORE js/game.js -- so reading a
  // game.js global here throws before the game has a chance to start. Every
  // reader goes through previewDifficulty(), which falls back to the first
  // entry, and open() writes the real value the moment the screen exists.
  var previewDifficultyId = null;

  var SCHED_X = 24;
  var SCHED_Y = 186;
  // A FUNCTION AND NOT A CONSTANT, for previewDifficultyId's reason one line up:
  // this module's body runs before js/game.js has declared VIEW_WIDTH, so any
  // top-level `var` that reads a game.js global throws at load.
  function schedWidth() { return VIEW_WIDTH - 48; }
  var SCHED_ROW_H = 40;
  var SCHED_ROW_GAP = 3;
  var SCHED_VISIBLE_ROWS = 11;
  var SCHED_H = SCHED_VISIBLE_ROWS * (SCHED_ROW_H + SCHED_ROW_GAP) - SCHED_ROW_GAP;

  // Pixels scrolled off the top, for the enemy list's reason: a wheel notch
  // that moved a whole row would overshoot on a trackpad.
  var scheduleScroll = 0;

  function difficultyTabRect(i) {
    return { x: SCHED_X + i * 190, y: 132, w: 178, h: 34 };
  }

  function previewDifficulty() {
    return (previewDifficultyId && difficultyOf(previewDifficultyId)) ||
      DIFFICULTIES[0];
  }

  function scheduleViewport() {
    return { x: SCHED_X, y: SCHED_Y, w: schedWidth(), h: SCHED_H };
  }

  // One row per wave, derived. The `duration` column prints FINAL for the wave
  // that authors none rather than a 0 or a materialised default -- the same
  // never-materialise-a-default rule the readout follows during a run, and here
  // it is the only thing on screen that says which wave ends the campaign.
  function scheduleRows() {
    var waves = previewDifficulty().waves;
    return waves.map(function (wave, i) {
      var events = waveTimeline(wave);
      return {
        number: i + 1,
        summary: waveSummary(wave),
        count: waveCount(wave),
        health: Math.round(waveEffectiveHealth(wave)),
        reward: waveReward(wave, i + 1),
        duration: wave.duration,
        lastSpawn: events.length ? events[events.length - 1].time : 0
      };
    });
  }

  function scheduleScrollMax() {
    var rows = DIFFICULTIES.length ? previewDifficulty().waves.length : 0;
    var content = rows * (SCHED_ROW_H + SCHED_ROW_GAP) - SCHED_ROW_GAP;
    return Math.max(0, content - SCHED_H);
  }

  function clampScheduleScroll() {
    scheduleScroll = Math.max(0, Math.min(scheduleScrollMax(), scheduleScroll));
  }

  // Screen space, scroll already applied -- the same rule enemyCardRect
  // follows, so what is drawn and what is hit-tested are one rectangle.
  function scheduleRowRect(i) {
    return {
      x: SCHED_X,
      y: SCHED_Y + i * (SCHED_ROW_H + SCHED_ROW_GAP) - scheduleScroll,
      w: schedWidth(),
      h: SCHED_ROW_H
    };
  }

  function drawDifficultiesTab(ctx) {
    var difficulty = previewDifficulty();
    var rows = scheduleRows();

    // The sub-tabs.
    for (var i = 0; i < DIFFICULTIES.length; i++) {
      drawAshControl(difficultyTabRect(i), DIFFICULTIES[i].name.toUpperCase(),
        { active: DIFFICULTIES[i].id === previewDifficultyId });
    }

    // The totals, on one line beside the sub-tabs. Summed off the rows above
    // rather than computed a second way, so the strip and the table can never
    // disagree.
    var bodies = 0, health = 0, reward = 0;
    rows.forEach(function (row) {
      bodies += row.count; health += row.health; reward += row.reward;
    });
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillStyle = "#ecdece";
    ctx.fillText(rows.length + " waves  ·  " + bodies + " enemies  ·  " +
      health + " effective HP  ·  $" + reward + " in rewards",
      SCHED_X + schedWidth(), difficultyTabRect(0).y + 17);

    // Column headings, outside the clip so a scrolled row cannot paint over
    // them (the enemy list's arrangement, and for the same reason).
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,158,140,0.55)";
    ctx.textAlign = "left";
    ctx.fillText("WAVE", SCHED_X + 14, SCHED_Y - 10);
    ctx.fillText("COMPOSITION", SCHED_X + 96, SCHED_Y - 10);
    ctx.textAlign = "right";
    ctx.fillText("BODIES", SCHED_X + schedWidth() - 330, SCHED_Y - 10);
    ctx.fillText("EFF. HP", SCHED_X + schedWidth() - 240, SCHED_Y - 10);
    ctx.fillText("REWARD", SCHED_X + schedWidth() - 150, SCHED_Y - 10);
    ctx.fillText("WINDOW", SCHED_X + schedWidth() - 20, SCHED_Y - 10);

    var view = scheduleViewport();
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.x, view.y, view.w, view.h);
    ctx.clip();

    var tier = TIER_COLOURS[difficulty.id] || TIER_COLOURS.hard;
    rows.forEach(function (row, i) {
      var r = scheduleRowRect(i);
      if (r.y + r.h < view.y || r.y > view.y + view.h) return;

      var hot = pointInRect(mouse.x, mouse.y, r) &&
        pointInRect(mouse.x, mouse.y, view);
      // The LAST wave gets the accent, because "there is no wave after this"
      // is the one structural fact a table of thirty-five rows cannot say by
      // being a table.
      var last = i === rows.length - 1;
      drawAshPlate(r, {
        accent: last ? tier.rgb : ASH_EMBER, quiet: true, cut: 8,
        live: last ? 0.55 : (hot ? 0.35 : 0),
        fill: i % 2 ? "rgba(20,16,20,0.88)" : "rgba(26,20,24,0.88)"
      });

      ctx.textBaseline = "middle";
      var mid = r.y + r.h / 2;

      ctx.textAlign = "left";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillStyle = last ? tier.text : "#f6d9b4";
      ctx.fillText(String(row.number), r.x + 14, mid);

      ctx.font = "12px system-ui, sans-serif";
      ctx.fillStyle = "rgba(219,231,245,0.84)";
      ctx.fillText(fitText(ctx, row.summary, schedWidth() - 460), r.x + 96, mid);

      ctx.textAlign = "right";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillStyle = "#ecdece";
      ctx.fillText(String(row.count), r.x + r.w - 330, mid);
      ctx.fillText(String(row.health), r.x + r.w - 240, mid);
      ctx.fillText("$" + row.reward, r.x + r.w - 150, mid);
      ctx.fillStyle = row.duration === undefined
        ? tier.text : "rgba(186,158,140,0.8)";
      ctx.fillText(row.duration === undefined ? "FINAL"
        : (row.duration + " s"), r.x + r.w - 20, mid);
    });

    ctx.restore();

    // The scrollbar, drawn OUTSIDE the clip and hard against the viewport's
    // right edge: it is the only thing on screen saying the list continues.
    var max = scheduleScrollMax();
    if (max > 0) {
      var trackX = view.x + view.w + 6;
      ctx.fillStyle = "rgba(240,150,78,0.12)";
      ctx.fillRect(trackX, view.y, 5, view.h);
      var thumbH = Math.max(28, view.h * (view.h / (view.h + max)));
      var thumbY = view.y + (view.h - thumbH) * (scheduleScroll / max);
      ctx.fillStyle = "rgba(255,190,130,0.55)";
      ctx.fillRect(trackX, thumbY, 5, thumbH);
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,158,140,0.6)";
    ctx.fillText(difficulty.blurb + "  ·  Scroll for the rest of the schedule.",
      SCHED_X + 4, view.y + view.h + 12);
  }

  function drawEnemiesTab(ctx) {
    drawEnemyList(ctx);
    drawEnemyDetail(ctx, enemyModels[enemyIndex] || enemyModels[0]);
  }

  function draw(ctx) {
    drawSelectBackdrop();
    // NOT DRAWN UNDER THE MODAL, and this is not cosmetic. The viewer's
    // backdrop is 93% opaque, which leaves the Back button faintly visible --
    // measured at 141 ink px in its 96x34 box -- while game.js still tested its
    // rectangle first and would have taken the click. All but invisible and
    // fully live is the worst of both; now it is neither. `Codex.modalUp` is
    // what stops the click, this only stops the ghost.
    if (!viewer) drawBackButton();

    // The heading is game.js's, not a second one: the chooser, the index and
    // the armoury are three screens with one voice, and three copies of an
    // Impact heading is how that stops being true.
    drawAshHeading("INDEX", "FIELD RECORDS", 18, true);

    drawTabs(ctx);
    if (tab === "towers") drawTowersTab(ctx);
    else if (tab === "difficulties") drawDifficultiesTab(ctx);
    else drawEnemiesTab(ctx);

    // Last, over everything, because it is a modal: the index underneath keeps
    // its selection and its scroll, and closing puts the player back exactly
    // where they were.
    if (viewer) drawViewer(ctx);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  // The keys the index owns. game.js routes them here before its own Escape
  // handling, so Escape closes the VIEWER when one is up and leaves the index
  // when one is not -- the same "Escape only ever cancels the innermost thing"
  // rule the pause menu follows.
  //
  // Returns TRUE when it consumed the key, which is what stops Escape doing
  // two things at once.
  function onKey(key) {
    if (!viewer) {
      // Arrows step the enemy selection even without the viewer open: the list
      // is a list and a keyboard should walk it. Harmless on the tower tab,
      // where there is nothing to step.
      if (tab === "enemies" && (key === "ArrowLeft" || key === "ArrowRight")) {
        var d = key === "ArrowRight" ? 1 : -1;
        var n = enemyModels ? enemyModels.length : 0;
        if (!n) return false;
        enemyIndex = ((enemyIndex + d) % n + n) % n;
        keepEnemyRowVisible(enemyIndex);
        return true;
      }
      return false;
    }
    if (key === "Escape") { closeViewer(); return true; }
    if (key === "ArrowLeft") { stepViewer(-1); return true; }
    if (key === "ArrowRight") { stepViewer(1); return true; }
    return false;
  }

  return {
    open: open,
    onClick: onClick,
    onWheel: onWheel,
    onKey: onKey,
    // Whether the model viewer is up. game.js asks so its Back button cannot
    // take a click that belongs to the modal on top of it -- the same rule the
    // pause menu follows against the board.
    modalUp: function () { return !!viewer; },
    draw: draw,
    // Read-only views for the tests, plus the geometry they click through --
    // the same rectangles the screen draws, so a test clicks what a player
    // clicks.
    tabRect: tabRect,
    towerCardRect: towerCardRect,
    // THE PUBLIC SIGNATURE IS STILL (branch, tier). A caller outside this
    // module is asking about the tower that is OPEN, and having to hand the
    // model back in would be asking it to know something the screen already
    // knows. The private form takes the model because the column widths now
    // depend on how many branches that tower has.
    tierRect: function (branch, i) {
      return tierRect(towerModels[towerIndex], branch, i);
    },
    enemyCardRect: enemyCardRect,
    enemyListViewport: enemyListViewport,
    enemyVisibleRows: function () { return ENEMY_VISIBLE_ROWS; },
    enemyScrollMax: enemyScrollMax,
    enemyDetailRect: enemyDetailRect,
    difficultyTabRect: difficultyTabRect,
    scheduleViewport: scheduleViewport,
    scheduleRowRect: scheduleRowRect,
    scheduleScrollMax: scheduleScrollMax,
    scheduleRows: scheduleRows,
    // The prose and the list row a type's card carries, by id. Exported for the
    // suite: a card that goes stale is a card nobody notices, and the only way
    // to catch that is to read what it would actually print.
    describe: function (id) {
      var model = (enemyModels || []).filter(function (m) { return m.id === id; })[0];
      return model ? enemyDescriptions(model) : [];
    },
    behaviourRowFor: function (id) {
      var model = (enemyModels || []).filter(function (m) { return m.id === id; })[0];
      return model ? enemyBehaviourRow(model, false) : [];
    },
    state: function () {
      return { tab: tab, towerIndex: towerIndex, enemyIndex: enemyIndex,
        enemyScroll: enemyScroll, pick: pick,
        previewDifficultyId: previewDifficultyId,
        scheduleScroll: scheduleScroll };
    },
    models: function () {
      return { towers: towerModels, enemies: enemyModels };
    }
  };
})();
