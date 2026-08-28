// ---------------------------------------------------------------------------
// The armoury (screen === "store"): two tabs off the title menu.
//
//   Store      buy tower types with meta coins
//   Inventory  put owned towers into the five build-bar slots, or take them out
//
// Built the same way js/codex.js is, and for the same reason: NOTHING here is
// written down twice. The card for a tower reads its price out of
// MetaProgress's catalogue, its cost/range/damage off a real throwaway
// instance through the same `statLines()` the in-game panel uses, and its icon
// from the type's own `drawIcon`. Add a tower to the catalogue and it appears
// here, priced, drawn and buyable, with no edit to this file.
//
// It owns no state of its own except which tab is open and which card is
// selected. Coins, ownership and the loadout all live in js/meta.js -- this
// screen is a view onto that and a set of buttons that call into it.
//
// The one rule worth preserving: EVERY MUTATION GOES THROUGH MetaProgress.
// Do not adjust coins or splice the loadout here. That module refuses an
// empty build bar, refuses to equip what is not owned, and saves after every
// change; a shortcut taken in this file would skip all three.
// ---------------------------------------------------------------------------

var Store = (function () {
  var tab = "store";          // "store" | "inventory"
  var picked = null;          // catalogue id whose detail card is open
  var flash = null;           // { text, tone } -- the result of the last click

  function catalogue() { return MetaProgress.catalogue(); }

  // --- geometry ------------------------------------------------------------
  //
  // One function per rectangle, read by BOTH the drawing and the click test,
  // the same rule slotRect and inspectionLayout follow. A button that is drawn
  // somewhere other than where it is clickable is the bug this prevents.

  function tabRect(i) {
    return { x: VIEW_WIDTH / 2 - 190 + i * 200, y: 78, w: 180, h: 38 };
  }

  function cardRect(i) {
    return { x: 60, y: 150 + i * 96, w: 460, h: 86 };
  }

  function actionRect() {
    return { x: 600, y: 452, w: 300, h: 52 };
  }

  // The five build-bar slots, drawn as a row on the Inventory tab. Sized in
  // pixels like the real build bar: this is interface chrome anchored to the
  // 1280x720 viewport, not something standing in the world.
  function loadoutSlotRect(i) {
    var size = 84, gap = 14;
    var total = MetaProgress.SLOT_COUNT * size + (MetaProgress.SLOT_COUNT - 1) * gap;
    return { x: (VIEW_WIDTH - total) / 2 + i * (size + gap), y: 560, w: size, h: size };
  }

  // --- state ---------------------------------------------------------------

  function open() {
    picked = null;
    flash = null;
    screen = "store";
  }

  function say(text, tone) { flash = { text: text, tone: tone || "bad" }; }

  function onClick(x, y) {
    if (pointInRect(x, y, tabRect(0))) { tab = "store"; flash = null; return; }
    if (pointInRect(x, y, tabRect(1))) { tab = "inventory"; flash = null; return; }

    var list = catalogue();

    for (var i = 0; i < list.length; i++) {
      if (pointInRect(x, y, cardRect(i))) { picked = list[i].id; flash = null; return; }
    }

    // The loadout row is a shortcut for unequipping: click the slot, the
    // tower comes out. Equipping is done from the card, because a free slot
    // is not a thing you can meaningfully click.
    if (tab === "inventory") {
      var loadout = MetaProgress.equipped();
      for (var s = 0; s < loadout.length; s++) {
        if (!pointInRect(x, y, loadoutSlotRect(s))) continue;
        if (loadout[s] === null) return;
        var out = MetaProgress.unequip(loadout[s]);
        say(out.ok ? "Unequipped." : out.reason, out.ok ? "good" : "bad");
        if (out.ok) rebuildBuildBar();
        return;
      }
    }

    if (picked && pointInRect(x, y, actionRect())) {
      if (tab === "store") {
        var bought = MetaProgress.buy(picked);
        say(bought.ok ? "Bought — it is in your bar." : bought.reason,
          bought.ok ? "good" : "bad");
        if (bought.ok) rebuildBuildBar();
      } else {
        var result = MetaProgress.isEquipped(picked)
          ? MetaProgress.unequip(picked)
          : MetaProgress.equip(picked);
        say(result.ok ? "Loadout updated." : result.reason, result.ok ? "good" : "bad");
        if (result.ok) rebuildBuildBar();
      }
    }
  }

  // --- drawing -------------------------------------------------------------

  function drawTabs(ctx) {
    ["Store", "Inventory"].forEach(function (label, i) {
      var r = tabRect(i);
      var active = (i === 0) === (tab === "store");

      // Same control the index's tabs and the Back button are cut from.
      drawAshControl(r, label.toUpperCase(), { active: active });
    });
  }

  // What the big button under the detail card says and whether it is live.
  // Derived, so the label and the click can never promise different things --
  // onClick calls the same MetaProgress functions this consults.
  function actionFor(id) {
    var item = MetaProgress.entry(id);
    if (!item) return null;

    if (tab === "store") {
      if (MetaProgress.owns(id)) return { label: "Owned", enabled: false };

      // LOCKED BEFORE BROKE, because the wall the player has to hear about is
      // the one they cannot buy their way past. A tower that is both locked and
      // unaffordable reads as "reach wave 11" rather than as "earn 4 more
      // coins", which is the honest answer to "why can I not have this".
      //
      // The reason is NOT computed here: MetaProgress.buy() is the rule and it
      // returns the sentence, so the button prints what the rule would say if
      // it were pressed. Deriving a second copy of the condition in the UI is
      // how a store ends up promising something buy() then refuses.
      var probe = MetaProgress.buy(id, { dryRun: true });
      if (probe.locked) {
        return {
          label: "Locked — " + item.price + " ⬡",
          enabled: false,
          note: probe.reason,
          progress: probe.progress,
          requiresWave: probe.requiresWave
        };
      }

      if (MetaProgress.coins() < item.price) {
        return { label: "Buy — " + item.price + " ⬡", enabled: false,
                 note: (item.price - MetaProgress.coins()) + " more coins needed" };
      }
      return { label: "Buy — " + item.price + " ⬡", enabled: true };
    }

    if (!MetaProgress.owns(id)) {
      return { label: "Not owned", enabled: false, note: "Buy it in the Store first." };
    }
    if (MetaProgress.isEquipped(id)) {
      return { label: "Unequip", enabled: true };
    }
    var free = MetaProgress.equipped().indexOf(null) !== -1;
    return { label: "Equip", enabled: free,
             note: free ? null : "Every slot is full — unequip something first." };
  }

  function drawCards(ctx) {
    catalogue().forEach(function (item, i) {
      var r = cardRect(i);
      var owned = MetaProgress.owns(item.id);
      var active = picked === item.id;
      var hot = pointInRect(mouse.x, mouse.y, r);

      // Salvaged plate, the same one the tabs and the route cards are cut
      // from. `live` carries selection AND hover on one channel, which is the
      // whole reason the plate takes a number there rather than two booleans.
      drawAshPlate(r, { accent: ASH_EMBER,
        live: active ? 0.9 : (hot ? 0.45 : 0), cut: 12 });

      var Type = MetaProgress.constructorOf(item.id);

      // A locked tower is drawn dimmed, not hidden. Seeing what is behind the
      // price is the whole reason to earn coins.
      ctx.save();
      if (!owned) ctx.globalAlpha = 0.45;
      // Same rule as the build bar: the real mesh when it can be rendered, the
      // tower's own glyph when it cannot. A card must never be empty.
      // 60 px, was 26. An 86 px card was spending a quarter of its height on
      // the one thing a player buys a tower for -- seeing what it is. The icon
      // column is 80 px wide before the name starts, so 60 fits inside it with
      // a 10 px gutter either side and nothing else on the card moved.
      if (Type && (typeof TowerPreview3D === "undefined" ||
          !TowerPreview3D.draw(ctx, Type, r.x + 42, r.y + r.h / 2, 60))) {
        Type.drawIcon(ctx, r.x + 42, r.y + r.h / 2, 60);
      }
      ctx.restore();

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "17px " + MENU_DISPLAY_FONT;
      ctx.fillStyle = owned ? "#ecdece" : "rgba(186,158,140,0.65)";
      ctx.fillText(Type ? Type.DISPLAY_NAME : item.id, r.x + 80, r.y + 26);

      // Clipped short of the right-hand column (price / OWNED, and the in-run
      // cost under it), not just short of the card edge -- at full card width
      // a long blurb ran straight through "200 MANA IN A RUN".
      ctx.font = "11px " + MENU_TECH_FONT;
      ctx.fillStyle = "rgba(186,158,140,0.62)";
      ctx.fillText(fitText(ctx, item.blurb, r.w - 80 - 110), r.x + 80, r.y + 50);

      ctx.textAlign = "right";
      ctx.font = "12px " + MENU_TECH_FONT;
      if (owned) {
        var inBar = MetaProgress.isEquipped(item.id);
        // Ley-teal for "this one is loaded", which is the only arcane claim on
        // the screen and therefore the only place the cool accent is allowed.
        ctx.fillStyle = inBar ? "rgba(116,240,214,0.95)" : "rgba(186,158,140,0.6)";
        ctx.fillText(inBar ? "IN BAR" : "OWNED", r.x + r.w - 14, r.y + 26);
      } else {
        ctx.fillStyle = "rgba(240,150,78,0.92)";
        ctx.fillText(item.price + " \u2b21", r.x + r.w - 14, r.y + 26);
      }

      // In-game price, so the two currencies never get confused: coins unlock
      // a tower for good, dollars buy one instance during a run.
      if (Type) {
        ctx.font = "10px " + MENU_TECH_FONT;
        ctx.fillStyle = "rgba(186,158,140,0.45)";
        ctx.fillText(Type.COST + " MANA IN A RUN", r.x + r.w - 14, r.y + 50);
      }
      ctx.textAlign = "left";
    });
  }

  // The detail panel: real stats off a real instance, never a second copy.
  function drawDetail(ctx) {
    if (!picked) {
      ctx.textAlign = "left";
      ctx.font = "12px " + MENU_TECH_FONT;
      ctx.fillStyle = "rgba(186,158,140,0.5)";
      ctx.fillText(tab === "store" ? "Pick a tower to see what it does."
        : "Pick a tower to put it in the bar, or click a slot to empty it.",
        600, 158);
      return;
    }

    var item = MetaProgress.entry(picked);
    var Type = MetaProgress.constructorOf(picked);
    if (!Type) return;

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "24px " + MENU_DISPLAY_FONT;
    ctx.fillStyle = "#f6d9b4";
    ctx.fillText(Type.DISPLAY_NAME, 600, 150);

    // A throwaway instance parked off-screen, never in `towers` and never
    // updated -- the same trick js/codex.js uses to keep this honest. Its
    // lifetime-total rows are sliced off: a specimen has no history.
    var specimen = new Type(-1000, -1000, path);
    var rows = specimen.statLines().slice(TowerStats.totals(specimen).length);

    rows.forEach(function (row, i) {
      var ry = 192 + i * 22;
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillStyle = "rgba(186,158,140,0.65)";
      ctx.fillText(row[0], 600, ry);
      ctx.textAlign = "right";
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillStyle = "#ecdece";
      ctx.fillText(String(row[1]), 900, ry);
      ctx.textAlign = "left";
    });

    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,158,140,0.7)";
    var blurbTop = 192 + rows.length * 22 + 16;
    wrapText(ctx, item.blurb, 300, 4).forEach(function (line, i) {
      ctx.fillText(line, 600, blurbTop + i * 18);
    });

    var action = actionFor(picked);
    if (!action) return;
    var r = actionRect();
    var hot = pointInRect(mouse.x, mouse.y, r) && action.enabled;

    ctx.fillStyle = !action.enabled ? "rgba(28,21,25,0.7)"
      : (hot ? "rgba(255,215,110,0.28)" : "rgba(255,215,110,0.14)");
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.lineWidth = 2;
    ctx.strokeStyle = action.enabled ? "rgba(255,215,110,0.9)" : "rgba(240,150,78,0.25)";
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillStyle = action.enabled ? "#f0a45c" : "rgba(186,158,140,0.45)";
    ctx.fillText(action.label, r.x + r.w / 2, r.y + r.h / 2 + 1);

    if (action.note) {
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillStyle = "rgba(186,158,140,0.5)";
      ctx.fillText(action.note, r.x + r.w / 2, r.y + r.h + 16);
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  // The build bar as it will actually appear in a run -- same order, same
  // number keys. Shown on the Inventory tab so "slot 3" means one thing.
  function drawLoadout(ctx) {
    var loadout = MetaProgress.equipped();

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,158,140,0.6)";
    ctx.fillText("YOUR BUILD BAR — click a slot to empty it", VIEW_WIDTH / 2, 532);

    loadout.forEach(function (id, i) {
      var r = loadoutSlotRect(i);
      var hot = pointInRect(mouse.x, mouse.y, r) && id !== null;

      ctx.fillStyle = hot ? "rgba(36,26,30,0.95)" : "rgba(24,18,22,0.9)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = id === null ? "rgba(240,150,78,0.2)" : "rgba(240,150,78,0.5)";
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

      var Type = id === null ? null : MetaProgress.constructorOf(id);
      if (Type) {
        // THE REAL BODY HERE TOO, and this row was the odd one out: the build
        // bar and the store cards have both drawn the mesh since TowerPreview3D
        // landed, and the loadout row -- the screen whose entire purpose is
        // "this is the bar you will play with" -- was still drawing the flat
        // glyph. So the preview a player checked before a run did not match the
        // bar they then played with. Same fallback contract as everywhere else.
        if (typeof TowerPreview3D === "undefined" ||
            !TowerPreview3D.draw(ctx, Type, r.x + r.w / 2, r.y + 30, 46)) {
          Type.drawIcon(ctx, r.x + r.w / 2, r.y + 30, 46);
        }
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillStyle = "rgba(186,158,140,0.75)";
        ctx.fillText(fitText(ctx, Type.DISPLAY_NAME, r.w - 8), r.x + r.w / 2, r.y + 56);
      } else {
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillStyle = "rgba(186,158,140,0.3)";
        ctx.fillText("empty", r.x + r.w / 2, r.y + 34);
      }

      ctx.font = "600 11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,215,110,0.7)";
      ctx.fillText(String(i + 1), r.x + 10, r.y + 6);
    });
    ctx.textAlign = "left";
  }

  function draw(ctx) {
    drawSelectBackdrop();
    drawBackButton();

    drawAshHeading("ARMOURY", "SALVAGE & LOADOUT", 18, true);

    // The purse, top right, on every tab -- the number every decision here is
    // measured against. Ember, because it is the screen's live figure and
    // ember is what this theme lights.
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.font = "24px " + MENU_DISPLAY_FONT;
    ctx.fillStyle = "#f0a45c";
    drawMenuText(MetaProgress.coins() + " \u2b21", VIEW_WIDTH - 32, 34, 2);
    ctx.font = "9px " + MENU_TECH_FONT;
    ctx.fillStyle = "rgba(186,158,140,0.6)";
    drawMenuText("META COINS", VIEW_WIDTH - 32, 62, 1.4);

    drawTabs(ctx);
    drawCards(ctx);
    drawDetail(ctx);
    if (tab === "inventory") drawLoadout(ctx);

    if (flash) {
      ctx.textAlign = "center";
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillStyle = flash.tone === "good" ? "rgba(116,240,214,0.95)" : "rgba(230,120,120,0.95)";
      ctx.fillText(flash.text, VIEW_WIDTH / 2, 700);
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  return {
    open: open,
    onClick: onClick,
    draw: draw,
    // Read-only views plus the geometry the tests click through -- the same
    // rectangles the screen draws, so a test clicks what a player clicks.
    tabRect: tabRect,
    cardRect: cardRect,
    actionRect: actionRect,
    loadoutSlotRect: loadoutSlotRect,
    actionFor: actionFor,
    state: function () { return { tab: tab, picked: picked, flash: flash }; }
  };
})();
