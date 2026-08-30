// ---------------------------------------------------------------------------
// The Upgrades screen and the Tree screen (screen === "upgrades" | "tree")
//
// The player-facing half of the permanent progression added on 2026-08-30. The
// rules and the save are elsewhere -- js/systems/tower-perks.js and js/meta.js
// -- and this file draws them and takes the clicks, the way js/store.js and
// js/codex.js do for the armoury and the index.
//
// THE SAME ONE RULE THE ARMOURY FOLLOWS: EVERY MUTATION GOES THROUGH THE MODEL.
// Nothing here splices a loadout, adds a node or touches a coin. It calls
// TowerPerks and MetaProgress and draws what they answer, so a state this
// screen can show is a state the save can hold.
//
// TWO SCREENS AND ONE CONTEXT. `screen` is "upgrades" or "tree" and the
// selected tower is the same field for both -- leaving a tree puts the player
// back on the tower they were reading about, which is the whole reason the
// tree is a screen rather than a modal.
//
// WHY THIS SCREEN IS NOT A THIRD ARMOURY TAB. The armoury sells TYPES and edits
// the five build-bar slots; this edits the five PERK slots of ONE type. Two
// systems with five slots each, and the surest way to make a player confuse
// them would be to draw them on the same screen. They are deliberately apart.
//
// WHAT IT SHOWS, TOP TO BOTTOM:
//
//   left    every tower the player OWNS. Types not bought yet belong to the
//           armoury and are not listed here at all
//   right   the selected tower: its icon, level, xp, the five perk slots, and
//           the TREE button
//   below   its inventory -- every perk bought for it, equipped or not,
//           scrolling, because an inventory has no fixed size
//
// DRAG AND DROP, AND A CLICK THAT ALSO WORKS. A perk is moved by pressing it
// and dropping it on a slot; a plain click does the obvious thing instead (an
// inventory card goes to the first open slot, a slot's perk comes out), because
// a screen that can only be operated by dragging is a screen that cannot be
// operated at all on a bad trackpad. A drop that lands nowhere legal puts the
// perk back and says why -- it is never lost and the loadout is never left
// half-written.
// ---------------------------------------------------------------------------

var Upgrades = (function () {

  var selected = null;        // tower id whose panel is open
  var flash = null;           // { text, tone } -- the result of the last action
  var invScroll = 0;          // inventory scroll, in pixels
  var drag = null;            // { nodeId, fromSlot, x, y, moved }

  // The tree screen's own state. `view` is where the camera is; `node` is the
  // node whose detail card is open; `confirm` is the reset asking twice.
  var view = { x: 0, y: 0, zoom: 1 };
  var treeNode = null;
  var confirmReset = false;
  var pan = null;             // { startX, startY, viewX, viewY }

  var NODE_PITCH = 132;       // world units between two node coordinates
  var NODE_R = 30;            // node radius at zoom 1
  var MIN_ZOOM = 0.45;
  var MAX_ZOOM = 1.8;

  // --- geometry --------------------------------------------------------------
  //
  // One function per rectangle, read by BOTH the drawing and the hit test --
  // the rule js/store.js states and the reason a control here cannot be drawn
  // somewhere other than where it is clickable.

  function towerRowRect(i) {
    return { x: 34, y: 132 + i * 62, w: 218, h: 54 };
  }

  function treeButtonRect() {
    return { x: 1010, y: 132, w: 214, h: 52 };
  }

  function slotRect(i) {
    var size = 92, gap = 16;
    var total = MetaProgress.PERK_SLOTS * size + (MetaProgress.PERK_SLOTS - 1) * gap;
    return { x: 286 + i * (size + gap), y: 288, w: size, h: size,
             _total: total };
  }

  function inventoryRect() {
    return { x: 286, y: 412, w: 938, h: 268 };
  }

  function inventoryCardRect(i) {
    var box = inventoryRect();
    var perRow = 3, w = 302, h = 76, gapX = 16, gapY = 12;
    var col = i % perRow, row = Math.floor(i / perRow);
    return {
      x: box.x + col * (w + gapX),
      y: box.y + 30 + row * (h + gapY) - invScroll,
      w: w, h: h
    };
  }

  // How far the inventory can scroll: the rows that do not fit, and nothing
  // more. A list shorter than the box does not scroll at all.
  function inventoryScrollMax() {
    var count = selected ? TowerPerks.inventory(selected).length : 0;
    var rows = Math.ceil(count / 3);
    var content = 30 + rows * 88;
    return Math.max(0, content - inventoryRect().h);
  }

  // --- the tree screen's rectangles ------------------------------------------

  function treeBackRect() { return { x: 28, y: 28, w: 150, h: 34 }; }
  function recentreRect() { return { x: 28, y: 96, w: 44, h: 44 }; }
  function zoomInRect() { return { x: 28, y: 148, w: 44, h: 34 }; }
  function zoomOutRect() { return { x: 28, y: 186, w: 44, h: 34 }; }
  function resetTreeRect() { return { x: 28, y: 640, w: 214, h: 46 }; }
  function detailRect() { return { x: 900, y: 96, w: 352, h: 470 }; }
  function buyRect() {
    var d = detailRect();
    return { x: d.x + 20, y: d.y + d.h - 62, w: d.w - 40, h: 44 };
  }

  // The board the tree is drawn on: everything outside the detail card and the
  // left rail. Panning and node hits are clipped to it, so a drag that starts
  // on a button is a button press and never a pan.
  function boardRect() { return { x: 96, y: 84, w: 780, h: 596 }; }

  // --- state -----------------------------------------------------------------

  function ownedTowers() {
    return MetaProgress.snapshot().owned.filter(function (id) {
      return !!MetaProgress.entry(id);
    });
  }

  function open() {
    var list = ownedTowers();
    // Keep the tower that was already open if it is still owned, so coming
    // back from the tree -- or from a run -- lands where the player left off.
    if (list.indexOf(selected) === -1) selected = list.length ? list[0] : null;
    flash = null;
    invScroll = 0;
    screen = "upgrades";
  }

  function openTree() {
    if (!selected) return;
    treeNode = null;
    confirmReset = false;
    // The last screen's message does not follow the player onto this one. A
    // refusal about a loadout slot read as a refusal about the node they are
    // now looking at.
    flash = null;
    centreView();
    screen = "tree";
  }

  function closeTree() {
    flash = null;
    screen = "upgrades";
  }

  // RECENTRE MEANS "SHOW ME THE TREE", not "put the origin in the middle".
  //
  // A tree may be any size -- that is the point of the format -- so the view
  // that gets a player un-lost has to be derived from the nodes rather than
  // typed in. This frames every node with a margin, never zooms IN past 1
  // (a four-node tree blown up to fill the screen looks broken) and never past
  // MIN_ZOOM the other way, so an enormous tree comes back readable rather than
  // merely visible.
  //
  // It is what the ◉ button does, what Escape-and-back-in does, and what
  // switching tower does -- one function, so "recentre" cannot mean three
  // things.
  function centreView() {
    view = { x: 0, y: 0, zoom: 1 };
    if (!selected) return;

    var list = TowerPerks.nodes(selected);
    if (!list.length) return;

    // The centre node counts too: a tree whose nodes all sit north of it must
    // still frame the tower they come out of.
    var minX = 0, maxX = 0, minY = 0, maxY = 0;
    list.forEach(function (node) {
      var p = nodePoint(node);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });

    var board = boardRect();
    var margin = NODE_R + 34;          // the node's own radius plus its label
    var spanX = (maxX - minX) + margin * 2;
    var spanY = (maxY - minY) + margin * 2;
    var fit = Math.min(board.w / spanX, board.h / spanY);

    view.zoom = Math.max(MIN_ZOOM, Math.min(1, fit));
    view.x = (minX + maxX) / 2;
    view.y = (minY + maxY) / 2;
  }

  function say(text, tone) { flash = { text: text, tone: tone || "bad" }; }

  function select(towerId) {
    if (selected === towerId) return;
    selected = towerId;
    invScroll = 0;
    treeNode = null;
    confirmReset = false;
    flash = null;
    centreView();
  }

  // --- the upgrades screen: input --------------------------------------------

  // WHERE A PRESS LANDS, so the press, the drag and the release all agree.
  // Returns { kind: "slot"|"card", index, nodeId } or null.
  function perkAt(x, y) {
    if (!selected) return null;

    var loadout = TowerPerks.loadout(selected);
    for (var s = 0; s < loadout.length; s++) {
      if (!pointInRect(x, y, slotRect(s))) continue;
      return { kind: "slot", index: s, nodeId: loadout[s] ? loadout[s].id : null };
    }

    if (pointInRect(x, y, inventoryRect())) {
      var list = TowerPerks.inventory(selected);
      for (var i = 0; i < list.length; i++) {
        var r = inventoryCardRect(i);
        // Clipped to the box: a card scrolled half out of view is only
        // clickable where it is actually drawn.
        if (r.y + r.h < inventoryRect().y || r.y > inventoryRect().y + inventoryRect().h) continue;
        if (pointInRect(x, y, r)) return { kind: "card", index: i, nodeId: list[i].id };
      }
    }
    return null;
  }

  function onMouseDown(x, y) {
    var hit = perkAt(x, y);
    if (!hit || !hit.nodeId) return false;
    drag = {
      nodeId: hit.nodeId,
      fromSlot: hit.kind === "slot" ? hit.index : null,
      x: x, y: y, moved: false
    };
    return true;
  }

  function onMouseMove(x, y) {
    if (!drag) return;
    if (Math.abs(x - drag.x) > 4 || Math.abs(y - drag.y) > 4) drag.moved = true;
    drag.x = x;
    drag.y = y;
  }

  // THE DROP. Four outcomes and every one of them is a defined state:
  //
  //   on a legal slot        equipped there (moved, if it was in another)
  //   on the slot it came from, without moving   taken out
  //   on the inventory, from a slot              taken out
  //   anywhere else                              put back, with the reason
  //
  // Nothing here can lose a perk: the model is only ever asked to equip or to
  // unequip, and a refusal leaves the loadout exactly as it was.
  function onMouseUp(x, y) {
    if (!drag) return false;
    var held = drag;
    drag = null;
    if (!selected) return false;

    for (var s = 0; s < MetaProgress.PERK_SLOTS; s++) {
      if (!pointInRect(x, y, slotRect(s))) continue;

      if (held.fromSlot === s && !held.moved) {
        var out = MetaProgress.unequipPerk(selected, s);
        say(out.ok ? "Unequipped." : out.reason, out.ok ? "good" : "bad");
        return true;
      }
      var put = MetaProgress.equipPerk(selected, held.nodeId, s);
      say(put.ok ? "Loadout updated." : put.reason, put.ok ? "good" : "bad");
      return true;
    }

    if (held.fromSlot !== null && pointInRect(x, y, inventoryRect())) {
      var back = MetaProgress.unequipPerk(selected, held.fromSlot);
      say(back.ok ? "Unequipped." : back.reason, back.ok ? "good" : "bad");
      return true;
    }

    // A CLICK ON AN INVENTORY CARD, which is a drag that went nowhere. It goes
    // to the first slot the level has opened and left free -- the obvious
    // reading, and the one that makes this screen usable without dragging.
    if (held.fromSlot === null && !held.moved) {
      var progress = MetaProgress.progressOf(selected);
      if (progress.level === 0) {
        say("This tower is level 0 — no slots yet. Play with it to earn XP.", "bad");
        return true;
      }
      if (MetaProgress.equippedPerks(selected).indexOf(held.nodeId) !== -1) {
        say("Already equipped.", "bad");
        return true;
      }
      var free = -1;
      for (var f = 0; f < progress.level; f++) {
        if (MetaProgress.equippedPerks(selected)[f] === null) { free = f; break; }
      }
      if (free === -1) {
        say("Every open slot is full — take one out first.", "bad");
        return true;
      }
      var into = MetaProgress.equipPerk(selected, held.nodeId, free);
      say(into.ok ? "Loadout updated." : into.reason, into.ok ? "good" : "bad");
      return true;
    }

    if (held.moved) say("Dropped nowhere — nothing changed.", "bad");
    return true;
  }

  function onClick(x, y) {
    if (screen === "tree") return treeClick(x, y);

    var list = ownedTowers();
    for (var i = 0; i < list.length; i++) {
      if (pointInRect(x, y, towerRowRect(i))) { select(list[i]); return; }
    }
    if (selected && pointInRect(x, y, treeButtonRect())) { openTree(); return; }
    // The slots and the cards are answered by the press/release pair above, so
    // a click that reaches here landed on the background.
  }

  function onWheel(x, y, deltaY) {
    if (screen === "tree") {
      zoomAt(x, y, deltaY < 0 ? 1.12 : 1 / 1.12);
      return;
    }
    if (!pointInRect(x, y, inventoryRect())) return;
    invScroll = Math.max(0, Math.min(inventoryScrollMax(), invScroll + deltaY));
  }

  function onKey(key) {
    if (screen === "tree") {
      if (key === "Escape") { closeTree(); return true; }
      if (key === "0") { centreView(); return true; }
      if (key === "+" || key === "=") { zoomAt(640, 360, 1.15); return true; }
      if (key === "-" || key === "_") { zoomAt(640, 360, 1 / 1.15); return true; }
      return false;
    }
    if (key === "t" || key === "T") { openTree(); return true; }
    return false;
  }

  // --- the tree screen: navigation -------------------------------------------

  // ZOOM TOWARDS THE CURSOR, so the node under the pointer stays under it. The
  // same rule the board camera follows, and the reason a big tree can be
  // explored rather than merely scaled.
  function zoomAt(px, py, factor) {
    var before = screenToTree(px, py);
    view.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom * factor));
    var after = screenToTree(px, py);
    view.x += before.x - after.x;
    view.y += before.y - after.y;
  }

  function boardCentre() {
    var b = boardRect();
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }

  function treeToScreen(tx, ty) {
    var c = boardCentre();
    return {
      x: c.x + (tx - view.x) * view.zoom,
      y: c.y + (ty - view.y) * view.zoom
    };
  }

  function screenToTree(px, py) {
    var c = boardCentre();
    return { x: (px - c.x) / view.zoom + view.x, y: (py - c.y) / view.zoom + view.y };
  }

  function nodePoint(node) {
    var at = node.at || { x: 0, y: 0 };
    return { x: at.x * NODE_PITCH, y: at.y * NODE_PITCH };
  }

  function beginPan(x, y) {
    if (!pointInRect(x, y, boardRect())) return false;
    pan = { startX: x, startY: y, viewX: view.x, viewY: view.y };
    return true;
  }

  function movePan(x, y) {
    if (!pan) return;
    view.x = pan.viewX - (x - pan.startX) / view.zoom;
    view.y = pan.viewY - (y - pan.startY) / view.zoom;
  }

  function endPan() { pan = null; }
  function panning() { return pan !== null; }

  function nodeAt(x, y) {
    if (!selected || !pointInRect(x, y, boardRect())) return null;
    var list = TowerPerks.nodes(selected);
    for (var i = 0; i < list.length; i++) {
      var p = treeToScreen(nodePoint(list[i]).x, nodePoint(list[i]).y);
      var dx = x - p.x, dy = y - p.y;
      if (dx * dx + dy * dy <= (NODE_R * view.zoom) * (NODE_R * view.zoom)) return list[i];
    }
    return null;
  }

  function treeClick(x, y) {
    if (pointInRect(x, y, treeBackRect())) { closeTree(); return; }
    if (pointInRect(x, y, recentreRect())) { centreView(); return; }
    if (pointInRect(x, y, zoomInRect())) { zoomAt(640, 360, 1.2); return; }
    if (pointInRect(x, y, zoomOutRect())) { zoomAt(640, 360, 1 / 1.2); return; }

    if (pointInRect(x, y, resetTreeRect())) { resetPressed(); return; }

    if (treeNode && pointInRect(x, y, buyRect())) {
      var result = TowerPerks.buy(selected, treeNode.id);
      say(result.ok ? "Bought — it is in the tower's inventory." : result.reason,
        result.ok ? "good" : "bad");
      return;
    }

    var hit = nodeAt(x, y);
    if (hit) { treeNode = hit; confirmReset = false; return; }
    // A press on the board that was not a node clears the card, the same way
    // right-click clears a selection on the battlefield.
    if (pointInRect(x, y, boardRect())) treeNode = null;
  }

  // ASKS TWICE, AND THE SECOND ASK IS THE ONE THAT SPENDS. The first press
  // turns the control into the full sentence -- what comes back, what it costs,
  // what it un-equips -- and the second does it. A refund that a player did not
  // mean to take is not undoable inside the cooldown.
  function resetPressed() {
    if (!selected) return;
    if (!confirmReset) {
      // SAME ORDER AS THE MODEL'S: the cooldown outranks "nothing bought",
      // because after a reset both are true and only one of them is what the
      // player is actually asking about.
      var ready = MetaProgress.resetReadyAt(selected);
      if (ready > Date.now()) {
        say("Reset cools down for another " + coolingText(ready) + ".", "bad");
        return;
      }
      if (!MetaProgress.ownedNodes(selected).length) {
        say("Nothing bought on this tree yet.", "bad");
        return;
      }
      confirmReset = true;
      return;
    }
    confirmReset = false;
    var out = TowerPerks.resetTree(selected, Date.now());
    if (!out.ok) { say(out.reason, "bad"); return; }
    treeNode = null;
    say("Tree reset — " + out.removed + " refunded for " + out.refunded +
        " ⬡, fee " + out.fee + " ⬡.", "good");
  }

  function coolingText(readyAt) {
    var left = Math.max(0, readyAt - Date.now());
    var minutes = Math.floor(left / 60000);
    var seconds = Math.floor((left % 60000) / 1000);
    return minutes > 0 ? (minutes + " min " + seconds + " s") : (seconds + " s");
  }

  // --- drawing: shared -------------------------------------------------------

  // A NODE'S SIGIL. Procedural and deterministic, hashed off the node's own id,
  // so a tree of any size has distinguishable marks with no art to ship and no
  // two runs drawing the same node differently. Four families of stroke, which
  // is enough for a player to say "the one with the cross" without pretending
  // to be an icon set.
  function sigil(nodeId, cx, cy, r, colour) {
    var h = 0;
    for (var i = 0; i < nodeId.length; i++) h = (h * 31 + nodeId.charCodeAt(i)) % 9973;
    var kind = h % 4;
    var spin = (h % 12) / 12 * Math.PI;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1.2, r * 0.14);
    ctx.beginPath();
    if (kind === 0) {
      ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
      ctx.moveTo(0, -r); ctx.lineTo(0, r);
    } else if (kind === 1) {
      ctx.moveTo(-r, -r * 0.6); ctx.lineTo(0, r); ctx.lineTo(r, -r * 0.6);
    } else if (kind === 2) {
      ctx.arc(0, 0, r * 0.8, 0, Math.PI * 1.45);
      ctx.moveTo(0, -r); ctx.lineTo(0, 0);
    } else {
      ctx.moveTo(-r, r * 0.5); ctx.lineTo(-r * 0.3, -r);
      ctx.lineTo(r * 0.3, r); ctx.lineTo(r, -r * 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  // The tower's own body, through the same fallback contract the armoury and
  // the build bar use: the real mesh when the renderer has one, the flat glyph
  // when it does not.
  function drawTowerIcon(Type, cx, cy, size) {
    if (!Type) return;
    if (typeof TowerPreview3D === "undefined" ||
        !TowerPreview3D.draw(ctx, Type, cx, cy, size)) {
      Type.drawIcon(ctx, cx, cy, size);
    }
  }

  function levelLine(progress) {
    if (progress.atMax) return "LEVEL 5 · MAX";
    return "LEVEL " + progress.level + " / 5";
  }

  function xpLine(progress) {
    var xp = Math.floor(progress.xp);
    if (progress.atMax) return xp + " XP · fully levelled";
    return xp + " XP  ·  " + Math.floor(progress.nextLevelXp - progress.xp) +
      " to level " + (progress.level + 1);
  }

  function drawXpBar(r, progress) {
    ctx.fillStyle = "rgba(10,8,12,0.8)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = "rgba(" + ASH_EMBER + ",0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    // AT THE TOP THE BAR IS FULL AND SAYS SO. A progress bar towards a level
    // that does not exist is the one readout this screen must not draw.
    var fraction = progress.atMax ? 1
      : Math.max(0, Math.min(1, progress.xpInto / progress.xpSpan));
    ctx.fillStyle = progress.atMax
      ? "rgba(" + ASH_LEY + ",0.55)" : "rgba(" + ASH_EMBER + ",0.6)";
    ctx.fillRect(r.x + 1, r.y + 1, (r.w - 2) * fraction, r.h - 2);
  }

  // --- drawing: the upgrades screen ------------------------------------------

  function draw(context) {
    if (screen === "tree") { drawTree(); return; }

    drawSelectBackdrop();
    drawBackButton();
    drawAshHeading("UPGRADES", "PERMANENT TOWER PROGRESSION", 26, true);

    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.font = "24px " + MENU_DISPLAY_FONT;
    ctx.fillStyle = "#f0a45c";
    drawMenuText(MetaProgress.coins() + " ⬡", VIEW_WIDTH - 32, 34, 2);
    ctx.font = "9px " + MENU_TECH_FONT;
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.6)";
    drawMenuText("META COINS", VIEW_WIDTH - 32, 62, 1.4);
    ctx.textAlign = "left";

    drawTowerList();
    if (selected) {
      drawPanel();
      drawSlots();
      drawInventory();
    } else {
      ctx.textAlign = "center";
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.7)";
      ctx.fillText("You own no towers yet.", VIEW_WIDTH / 2, 340);
      ctx.textAlign = "left";
    }

    if (flash) {
      ctx.textAlign = "center";
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillStyle = flash.tone === "good"
        ? "rgba(" + ASH_LEY + ",0.95)" : "rgba(240,120,110,0.95)";
      ctx.fillText(flash.text, VIEW_WIDTH / 2, 700);
      ctx.textAlign = "left";
    }

    drawHeldPerk();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  function drawTowerList() {
    var list = ownedTowers();
    ctx.textBaseline = "middle";

    list.forEach(function (id, i) {
      var r = towerRowRect(i);
      var entry = MetaProgress.entry(id);
      var Type = MetaProgress.constructorOf(id);
      var active = id === selected;
      var hot = pointInRect(mouse.x, mouse.y, r);

      drawAshPlate(r, { live: active ? 0.8 : (hot ? 0.5 : 0), cut: 10 });

      drawTowerIcon(Type, r.x + 30, r.y + r.h / 2, 42);

      var progress = MetaProgress.progressOf(id);
      ctx.textAlign = "left";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillStyle = active ? "#ffe6c4" : "rgba(" + ASH_BONE + ",0.85)";
      ctx.fillText(fitText(ctx, Type ? Type.DISPLAY_NAME : entry.id, 130),
        r.x + 58, r.y + 20);

      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.75)";
      ctx.fillText("Lv " + progress.level + "  ·  " +
        MetaProgress.ownedNodes(id).length + " bought", r.x + 58, r.y + 38);

      // The slot pips: five, filled to the level, so the list itself shows how
      // far every tower has come without opening any of them.
      for (var p = 0; p < MetaProgress.PERK_SLOTS; p++) {
        ctx.fillStyle = p < progress.level
          ? "rgba(" + ASH_EMBER + ",0.85)" : "rgba(" + ASH_DUST + ",0.22)";
        ctx.fillRect(r.x + r.w - 14 - (MetaProgress.PERK_SLOTS - p) * 9, r.y + 12, 6, 6);
      }
    });
    ctx.textBaseline = "top";
  }

  function drawPanel() {
    var Type = MetaProgress.constructorOf(selected);
    var progress = MetaProgress.progressOf(selected);

    var panel = { x: 286, y: 132, w: 700, h: 128 };
    drawAshPlate(panel, { live: 0.25, cut: 14 });

    // CLIPPED TO ITS OWN PLATE. A tower's real mesh is drawn at whatever height
    // its body wants, and the tall ones (the Rifleman, the Arcane Sniper) stand
    // straight out of the top of a 128px panel otherwise.
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x + 6, panel.y + 6, 104, panel.h - 12);
    ctx.clip();
    drawTowerIcon(Type, panel.x + 60, panel.y + 74, 72);
    ctx.restore();

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "26px " + MENU_DISPLAY_FONT;
    ctx.fillStyle = "#f6d9b4";
    drawMenuText(Type ? Type.DISPLAY_NAME : selected, panel.x + 120, panel.y + 20, 2);

    ctx.font = "11px " + MENU_TECH_FONT;
    ctx.fillStyle = progress.atMax
      ? "rgba(" + ASH_LEY + ",0.92)" : "rgba(" + ASH_EMBER + ",0.9)";
    drawMenuText(levelLine(progress), panel.x + 120, panel.y + 52, 1.6);

    drawXpBar({ x: panel.x + 120, y: panel.y + 74, w: 400, h: 10 }, progress);

    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.8)";
    ctx.fillText(xpLine(progress), panel.x + 120, panel.y + 92);

    var tree = treeButtonRect();
    var count = TowerPerks.nodes(selected).length;
    drawAshControl(tree, "TREE", {
      primary: true,
      detail: count ? (MetaProgress.ownedNodes(selected).length + " / " + count + " BOUGHT")
                    : "NOTHING AUTHORED YET"
    });
  }

  function drawSlots() {
    var progress = MetaProgress.progressOf(selected);
    var loadout = TowerPerks.loadout(selected);

    ctx.textAlign = "left";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.7)";
    ctx.fillText("PERMANENT LOADOUT — " + progress.level + " of " +
      MetaProgress.PERK_SLOTS + " slots open", 286, 268);

    for (var i = 0; i < MetaProgress.PERK_SLOTS; i++) {
      var r = slotRect(i);
      var open = i < progress.level;
      var node = loadout[i];
      var held = drag && drag.nodeId;
      var hot = pointInRect(mouse.x, mouse.y, r);

      // WHAT A DROP HERE WOULD DO, shown while the perk is in the air. A slot
      // the level has not opened lights differently from one that is merely
      // occupied, because they refuse for different reasons.
      var inviting = held && open;
      drawAshPlate(r, {
        accent: open ? ASH_EMBER : ASH_DUST,
        live: inviting && hot ? 1 : (inviting ? 0.5 : (hot && open ? 0.4 : 0)),
        cut: 10,
        fill: open ? null : "rgba(12,10,14,0.85)"
      });

      if (!open) {
        // A LOCKED SLOT SAYS WHAT OPENS IT. Five are always drawn so the whole
        // ladder is visible from level 0, which is the point of showing them.
        ctx.textAlign = "center";
        ctx.font = "20px " + MENU_DISPLAY_FONT;
        ctx.fillStyle = "rgba(" + ASH_DUST + ",0.35)";
        drawMenuText("✖", r.x + r.w / 2, r.y + 34, 0);
        ctx.font = "9px " + MENU_TECH_FONT;
        ctx.fillStyle = "rgba(" + ASH_DUST + ",0.45)";
        drawMenuText("LEVEL " + (i + 1), r.x + r.w / 2, r.y + 62, 1.1);
        ctx.textAlign = "left";
        continue;
      }

      if (node && !(drag && drag.fromSlot === i && drag.moved)) {
        sigil(node.id, r.x + r.w / 2, r.y + 32, 15, "rgba(" + ASH_EMBER + ",0.95)");
        ctx.textAlign = "center";
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillStyle = "rgba(" + ASH_BONE + ",0.9)";
        wrapCentred(node.name, r.x + r.w / 2, r.y + 56, r.w - 8, 12, 2);
        ctx.textAlign = "left";
      } else {
        ctx.textAlign = "center";
        ctx.font = "10px " + MENU_TECH_FONT;
        ctx.fillStyle = "rgba(" + ASH_DUST + ",0.4)";
        drawMenuText("EMPTY", r.x + r.w / 2, r.y + r.h / 2, 1.2);
        ctx.textAlign = "left";
      }
    }
  }

  function drawInventory() {
    var box = inventoryRect();
    var list = TowerPerks.inventory(selected);
    var equipped = MetaProgress.equippedPerks(selected);

    ctx.textAlign = "left";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.7)";
    ctx.fillText("INVENTORY — " + list.length +
      (list.length === 1 ? " upgrade owned" : " upgrades owned") +
      "   ·   drag one onto a slot, or click it", box.x, box.y + 6);

    if (!list.length) {
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.5)";
      ctx.fillText("Nothing bought yet — open the tree and spend some salvage.",
        box.x, box.y + 40);
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y + 24, box.w, box.h - 24);
    ctx.clip();

    list.forEach(function (node, i) {
      var r = inventoryCardRect(i);
      if (r.y + r.h < box.y || r.y > box.y + box.h) return;
      var isEquipped = equipped.indexOf(node.id) !== -1;
      var hot = pointInRect(mouse.x, mouse.y, r);
      var lifted = drag && drag.moved && drag.nodeId === node.id && drag.fromSlot === null;

      drawAshPlate(r, {
        accent: isEquipped ? ASH_LEY : ASH_EMBER,
        live: lifted ? 0 : (hot ? 0.6 : (isEquipped ? 0.3 : 0)),
        cut: 8
      });
      if (lifted) return;

      sigil(node.id, r.x + 26, r.y + r.h / 2,
        13, "rgba(" + (isEquipped ? ASH_LEY : ASH_EMBER) + ",0.9)");

      ctx.textAlign = "left";
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillStyle = isEquipped ? "rgba(" + ASH_LEY + ",0.95)" : "#ffe6c4";
      ctx.fillText(fitText(ctx, node.name, r.w - 62), r.x + 48, r.y + 12);

      ctx.font = "10px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.8)";
      wrapLeft(node.blurb || "", r.x + 48, r.y + 32, r.w - 58, 12, 3);

      if (isEquipped) {
        ctx.textAlign = "right";
        ctx.font = "9px " + MENU_TECH_FONT;
        ctx.fillStyle = "rgba(" + ASH_LEY + ",0.8)";
        drawMenuText("EQUIPPED", r.x + r.w - 10, r.y + 10, 1.1);
        ctx.textAlign = "left";
      }
    });
    ctx.restore();

    // The scrollbar, drawn only when there is something to scroll.
    var max = inventoryScrollMax();
    if (max > 0) {
      var trackH = box.h - 30;
      var thumb = Math.max(24, trackH * (trackH / (trackH + max)));
      var t = invScroll / max;
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.15)";
      ctx.fillRect(box.x + box.w + 6, box.y + 26, 4, trackH);
      ctx.fillStyle = "rgba(" + ASH_EMBER + ",0.6)";
      ctx.fillRect(box.x + box.w + 6, box.y + 26 + (trackH - thumb) * t, 4, thumb);
    }
  }

  // The perk following the cursor while it is being dragged. Drawn last so it
  // is over everything, which is also the order it is hit-tested in.
  function drawHeldPerk() {
    if (!drag || !drag.moved || !selected) return;
    var node = TowerPerks.nodeOf(selected, drag.nodeId);
    if (!node) return;
    var r = { x: drag.x - 46, y: drag.y - 30, w: 92, h: 60 };
    ctx.globalAlpha = 0.92;
    drawAshPlate(r, { live: 0.9, cut: 8 });
    sigil(node.id, r.x + r.w / 2, r.y + 20, 12, "rgba(" + ASH_EMBER + ",0.95)");
    ctx.textAlign = "center";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = "#ffe6c4";
    ctx.fillText(fitText(ctx, node.name, r.w - 8), r.x + r.w / 2, r.y + 38);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  // --- drawing: the tree screen ----------------------------------------------

  function drawTree() {
    drawSelectBackdrop();

    var Type = MetaProgress.constructorOf(selected);
    var progress = MetaProgress.progressOf(selected);
    drawAshHeading((Type ? Type.DISPLAY_NAME : selected).toUpperCase() + " TREE",
      "PERMANENT UPGRADES", 26, true);

    drawAshControl(treeBackRect(), "← UPGRADES", {});
    drawAshControl(recentreRect(), "◉", {});
    drawAshControl(zoomInRect(), "+", {});
    drawAshControl(zoomOutRect(), "−", {});

    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.font = "24px " + MENU_DISPLAY_FONT;
    ctx.fillStyle = "#f0a45c";
    drawMenuText(MetaProgress.coins() + " ⬡", VIEW_WIDTH - 32, 34, 2);
    ctx.textAlign = "left";

    var board = boardRect();
    ctx.save();
    ctx.beginPath();
    ctx.rect(board.x, board.y, board.w, board.h);
    ctx.clip();

    var list = TowerPerks.nodes(selected);
    drawTreeLinks(list);
    drawTreeCentre(Type);
    list.forEach(drawTreeNode);

    ctx.restore();

    if (!list.length) {
      ctx.textAlign = "center";
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.7)";
      ctx.fillText("No permanent upgrades authored for this tower yet.",
        board.x + board.w / 2, board.y + board.h / 2 + 90);
      ctx.textAlign = "left";
    }

    drawTreeDetail(progress);
    drawResetControl();

    ctx.font = "10px " + MENU_TECH_FONT;
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.55)";
    ctx.textAlign = "center";
    drawMenuText("RIGHT-DRAG OR TWO-FINGER DRAG TO PAN   ·   WHEEL TO ZOOM   " +
      "·   ◉ RECENTRE   ·   ESC BACK",
      board.x + board.w / 2, VIEW_HEIGHT - 26, 1.3);
    ctx.textAlign = "left";

    if (flash) {
      ctx.textAlign = "center";
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillStyle = flash.tone === "good"
        ? "rgba(" + ASH_LEY + ",0.95)" : "rgba(240,120,110,0.95)";
      ctx.fillText(flash.text, board.x + board.w / 2, VIEW_HEIGHT - 48);
      ctx.textAlign = "left";
    }
    ctx.textBaseline = "top";
  }

  // A LINK IS LIT WHEN THE NODE IT COMES FROM IS BOUGHT, which is what turns
  // "these two are the parents of that one" into something readable at a
  // glance: a convergence with one lit arm and one dark one is a node you can
  // see you are halfway to.
  function drawTreeLinks(list) {
    list.forEach(function (node) {
      var to = treeToScreen(nodePoint(node).x, nodePoint(node).y);
      var parents = node.requires || [];

      if (!parents.length) {
        var centre = treeToScreen(0, 0);
        strokeLink(centre, to, true);
        return;
      }
      parents.forEach(function (parentId) {
        var parent = TowerPerks.nodeOf(selected, parentId);
        if (!parent) return;
        var from = treeToScreen(nodePoint(parent).x, nodePoint(parent).y);
        strokeLink(from, to, MetaProgress.ownsNode(selected, parentId));
      });
    });
  }

  function strokeLink(from, to, live) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.lineWidth = live ? 2.4 * view.zoom : 1.4 * view.zoom;
    ctx.strokeStyle = live
      ? "rgba(" + ASH_EMBER + ",0.55)" : "rgba(" + ASH_DUST + ",0.18)";
    ctx.stroke();
  }

  function drawTreeCentre(Type) {
    var p = treeToScreen(0, 0);
    var r = 46 * view.zoom;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(14,11,16,0.94)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(" + ASH_EMBER + ",0.6)";
    ctx.stroke();
    drawTowerIcon(Type, p.x, p.y, r * 1.5);
  }

  // THE FIVE STATES THE BRIEF NAMES, EACH ITS OWN COLOUR AND EACH READ OFF
  // TowerPerks.stateOf -- so the ring, the detail card and the purchase can
  // never disagree about why a node is dark.
  function drawTreeNode(node) {
    var p = treeToScreen(nodePoint(node).x, nodePoint(node).y);
    var r = NODE_R * view.zoom;
    var info = TowerPerks.stateOf(selected, node.id);
    var chosen = treeNode && treeNode.id === node.id;
    var equipped = MetaProgress.equippedPerks(selected).indexOf(node.id) !== -1;

    var accent, alpha;
    if (info.state === "owned") { accent = equipped ? ASH_LEY : ASH_EMBER; alpha = 1; }
    else if (info.state === "buyable") { accent = ASH_BONE; alpha = 0.95; }
    else if (info.state === "poor") { accent = ASH_EMBER; alpha = 0.5; }
    else if (info.state === "level") { accent = ASH_LEY; alpha = 0.4; }
    else { accent = ASH_DUST; alpha = 0.3; }

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = info.state === "owned"
      ? "rgba(34,24,20,0.96)" : "rgba(14,11,16,0.9)";
    ctx.fill();
    ctx.lineWidth = chosen ? 3 : (info.state === "owned" ? 2.2 : 1.4);
    ctx.strokeStyle = "rgba(" + accent + "," + (chosen ? 1 : alpha) + ")";
    ctx.stroke();

    sigil(node.id, p.x, p.y, r * 0.44, "rgba(" + accent + "," + alpha + ")");

    // The name under the node, and the price under that when it is not bought.
    // Hidden when zoomed far out: unreadable type over a big tree is noise.
    if (view.zoom < 0.62) return;
    ctx.textAlign = "center";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_BONE + "," + Math.min(1, alpha + 0.25) + ")";
    ctx.fillText(fitText(ctx, node.name, 128), p.x, p.y + r + 12);
    if (info.state !== "owned") {
      ctx.font = "9px " + MENU_TECH_FONT;
      ctx.fillStyle = "rgba(" + ASH_EMBER + ",0.7)";
      drawMenuText((node.cost || 0) + " ⬡", p.x, p.y + r + 26, 1);
    }
    ctx.textAlign = "left";
  }

  function drawTreeDetail(progress) {
    var d = detailRect();
    drawAshPlate(d, { live: 0.3, cut: 14 });

    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    if (!treeNode) {
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_BONE + ",0.8)";
      ctx.fillText("Pick a node", d.x + 20, d.y + 22);
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.7)";
      wrapLeft("The whole tree is visible from the start — what a level or a " +
        "prerequisite locks is the PURCHASE, never the view. Click any node to " +
        "read what it does, what it costs and exactly why it is dark.",
        d.x + 20, d.y + 50, d.w - 40, 16, 8);

      ctx.font = "11px " + MENU_TECH_FONT;
      ctx.fillStyle = "rgba(" + ASH_EMBER + ",0.8)";
      drawMenuText("LEVEL " + progress.level + "   ·   " +
        MetaProgress.coins() + " ⬡", d.x + 20, d.y + d.h - 40, 1.4);
      return;
    }

    var info = TowerPerks.stateOf(selected, treeNode.id);

    sigil(treeNode.id, d.x + 34, d.y + 38, 16, "rgba(" + ASH_EMBER + ",0.95)");
    ctx.font = "18px " + MENU_DISPLAY_FONT;
    ctx.fillStyle = "#f6d9b4";
    drawMenuText(treeNode.name.toUpperCase(), d.x + 60, d.y + 28, 1.6);

    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_BONE + ",0.86)";
    var lines = wrapLeft(treeNode.blurb || "No description written for this one yet.",
      d.x + 20, d.y + 70, d.w - 40, 16, 9);

    var y = d.y + 70 + lines * 16 + 14;

    ctx.font = "11px " + MENU_TECH_FONT;
    ctx.fillStyle = "rgba(" + ASH_EMBER + ",0.9)";
    drawMenuText("COST " + (treeNode.cost || 0) + " ⬡   ·   YOU HAVE " +
      MetaProgress.coins() + " ⬡", d.x + 20, y, 1.3);
    y += 22;

    if (treeNode.minLevel) {
      ctx.fillStyle = "rgba(" + ASH_LEY + ",0.85)";
      drawMenuText("NEEDS TOWER LEVEL " + treeNode.minLevel, d.x + 20, y, 1.3);
      y += 20;
    }
    if (treeNode.requires && treeNode.requires.length) {
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.8)";
      drawMenuText(treeNode.requires.length === 1 ? "REQUIRES" : "REQUIRES ALL OF",
        d.x + 20, y, 1.3);
      y += 18;
      ctx.font = "11px system-ui, sans-serif";
      treeNode.requires.forEach(function (req) {
        var parent = TowerPerks.nodeOf(selected, req);
        var have = MetaProgress.ownsNode(selected, req);
        ctx.fillStyle = have
          ? "rgba(" + ASH_LEY + ",0.9)" : "rgba(240,120,110,0.9)";
        ctx.fillText((have ? "✓ " : "✗ ") + (parent ? parent.name : req),
          d.x + 28, y);
        y += 16;
      });
    }

    // WHY IT IS DARK, in the node's own words. The same sentence the refusal
    // returns, so the panel and the click can never say different things.
    if (info.reason) {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(240,150,120,0.9)";
      wrapLeft(info.reason, d.x + 20, y + 6, d.w - 40, 14, 3);
    }

    var button = buyRect();
    if (info.state === "owned") {
      drawAshControl(button, "BOUGHT", { disabled: true, detail: "IN THE INVENTORY" });
    } else if (info.state === "buyable") {
      drawAshControl(button, "BUY  " + (treeNode.cost || 0) + " ⬡", { primary: true });
    } else {
      drawAshControl(button, "LOCKED", { disabled: true });
    }
  }

  function drawResetControl() {
    var r = resetTreeRect();
    var owned = MetaProgress.ownedNodes(selected).length;
    var ready = MetaProgress.resetReadyAt(selected);
    var cooling = ready > Date.now();

    if (confirmReset) {
      drawAshControl(r, "CONFIRM RESET", {
        accent: "240,120,110", primary: true,
        detail: "+" + TowerPerks.refundValue(selected) + " ⬡  −" +
                MetaProgress.TREE_RESET_FEE + " ⬡ FEE"
      });
    } else {
      drawAshControl(r, "RESET TREE", {
        disabled: !owned || cooling,
        detail: cooling ? ("READY IN " + coolingText(ready).toUpperCase())
          : (owned ? (owned + " BOUGHT · FEE " + MetaProgress.TREE_RESET_FEE + " ⬡")
                   : "NOTHING BOUGHT")
      });
    }

    // WHAT A RESET COSTS AND WHAT IT TAKES BACK, before it is pressed. It also
    // says what it does NOT touch, because "will I lose my level" is the first
    // question a refund button raises.
    ctx.textAlign = "left";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.7)";
    wrapLeft(confirmReset
      ? "Press again to refund every node and empty this tower's loadout. " +
        "Level and XP are not touched."
      : "Refunds every node bought here, clears the loadout, and cools down " +
        "for " + Math.round(MetaProgress.TREE_RESET_COOLDOWN_MS / 60000) +
        " minutes. Level and XP are never touched.",
      r.x, r.y - 66, 232, 13, 5);
  }

  // --- small text helpers ----------------------------------------------------

  function wrapLeft(text, x, y, width, lineHeight, maxLines) {
    return wrap(text, x, y, width, lineHeight, maxLines, false);
  }

  function wrapCentred(text, x, y, width, lineHeight, maxLines) {
    return wrap(text, x, y, width, lineHeight, maxLines, true);
  }

  function wrap(text, x, y, width, lineHeight, maxLines, centred) {
    var words = String(text).split(" ");
    var line = "", drawn = 0;
    for (var i = 0; i < words.length && drawn < maxLines; i++) {
      var next = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(next).width > width && line) {
        ctx.fillText(line, x, y + drawn * lineHeight);
        drawn++;
        line = words[i];
      } else {
        line = next;
      }
    }
    if (line && drawn < maxLines) {
      ctx.fillText(fitText(ctx, line, width), x, y + drawn * lineHeight);
      drawn++;
    }
    return drawn;
  }

  return {
    open: open,
    openTree: openTree,
    closeTree: closeTree,
    draw: draw,
    onClick: onClick,
    onWheel: onWheel,
    onKey: onKey,
    onMouseDown: onMouseDown,
    onMouseMove: onMouseMove,
    onMouseUp: onMouseUp,
    beginPan: beginPan,
    movePan: movePan,
    endPan: endPan,
    panning: panning,
    dragging: function () { return drag !== null; },
    // Read-only views plus the geometry the tests click through -- the same
    // rectangles the screen draws, so a test clicks what a player clicks.
    towerRowRect: towerRowRect,
    treeButtonRect: treeButtonRect,
    slotRect: slotRect,
    inventoryRect: inventoryRect,
    inventoryCardRect: inventoryCardRect,
    treeBackRect: treeBackRect,
    recentreRect: recentreRect,
    resetTreeRect: resetTreeRect,
    buyRect: buyRect,
    boardRect: boardRect,
    nodeScreenPoint: function (node) {
      var p = nodePoint(node);
      return treeToScreen(p.x, p.y);
    },
    selectTower: select,
    selectNode: function (nodeId) {
      treeNode = selected ? TowerPerks.nodeOf(selected, nodeId) : null;
      return treeNode;
    },
    state: function () {
      return {
        selected: selected, flash: flash, node: treeNode ? treeNode.id : null,
        confirmReset: confirmReset, view: { x: view.x, y: view.y, zoom: view.zoom },
        scroll: invScroll, dragging: drag ? drag.nodeId : null
      };
    }
  };
})();
