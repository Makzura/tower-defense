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
//   middle  the selected tower's icon, level, xp and TREE button; its five perk
//           slots; and its MODULES, grouped by the branch they came off
//   right   the one module being read, in full
//
// THE MODULES ARE GROUPED BY BRANCH and their cards are small (2026-08-31, at
// the owner's word). Every card used to print the node's whole description, in
// one undifferentiated grid 938 pixels wide -- so the cards were large, a
// player could not tell a path A module from a path B one without reading it,
// and there was nowhere to say anything MORE. A card now carries a name and one
// clause; everything quantitative is on the right, for the one module you are
// reading. `branchOf` derives the heading from the arm the node sits on in the
// tree, so a tower with a third in-run path gets a PATH C band for free.
//
// A CLICK READS; IT DOES NOT EQUIP. Clicking an equipped module used to take it
// straight out of its slot, which meant the only way to read what a perk you
// were USING did was to stop using it. A click pins the module into the right
// hand card and grows the one control that moves a loadout: a green EQUIP while
// it is out, a red UNEQUIP while it is in, in the same place.
//
// THAT CONTROL IS DRAWN TWICE AND IS ONE ACTION. Once at the foot of the detail
// panel, and once as a strip directly UNDER the pinned card -- because the
// panel is on the other side of the screen from the card that was just clicked,
// and reaching across for it is the gesture this screen was meant to remove.
// Both call `perkActionPressed`. The strip is part of the LAYOUT rather than an
// overlay: the rows below the pinned one are pushed down by exactly its height,
// so it covers no card, scrolls with the list, and cannot be clicked through.
//
// DRAG AND DROP STILL WORKS, and is the way to choose WHICH slot: a perk
// pressed and dropped on a slot goes there, and one dragged from a slot back
// onto the list comes out. A drop that lands nowhere legal puts the perk back
// and says why -- it is never lost and the loadout is never left half-written.
// ---------------------------------------------------------------------------

var Upgrades = (function () {

  var selected = null;        // tower id whose panel is open
  var flash = null;           // { text, tone } -- the result of the last action
  var invScroll = 0;          // inventory scroll, in pixels
  var drag = null;            // { nodeId, fromSlot, x, y, moved }

  // THE MODULE THE RIGHT-HAND CARD IS READING, and the one merely under the
  // cursor (2026-08-31, at the owner's word).
  //
  // A PLAIN CLICK NO LONGER EQUIPS ANYTHING. It PINS a module into the detail
  // card, which is what makes an EQUIPPED module readable at all -- clicking
  // one used to take it straight out of its slot, so the only way to read what
  // a perk you were using did was to stop using it. Equipping and unequipping
  // are a button now, and the button is the only thing that moves a loadout.
  //
  //   detailNode  pinned by a click. The button acts on THIS and nothing else
  //   hoverNode   a peek, and only while nothing is pinned
  var detailNode = null;
  var hoverNode = null;

  // THE TWO ACTION COLOURS, and they are the only two in this file that are not
  // out of the ash palette. Green means "this will start applying" and red
  // means "this will stop"; the owner asked for exactly that pair, and ASH_LEY
  // is arcane rather than affirmative.
  var ASH_GO = "126,214,120";
  var ASH_STOP = "232,110,100";

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

  // THE LEFT COLUMN IS THE LOADOUT AND THE LIST; THE RIGHT IS ONE MODULE.
  // The whole screen was 938 pixels of inventory until 2026-08-31, with the
  // full blurb printed on every card -- so the cards were large, they were in
  // one undifferentiated grid, and there was nowhere to say anything more.
  // Now a card is small and only has to be recognisable, and everything
  // quantitative about the one you are reading is in `perkDetailRect`.
  function headerRect() { return { x: 286, y: 110, w: 574, h: 104 }; }

  function treeButtonRect() {
    var h = headerRect();
    return { x: h.x + h.w - 214, y: h.y + h.h - 58, w: 198, h: 44 };
  }

  function slotRect(i) {
    var size = 92, gap = 16;
    var total = MetaProgress.PERK_SLOTS * size + (MetaProgress.PERK_SLOTS - 1) * gap;
    return { x: 286 + i * (size + gap), y: 250, w: size, h: size,
             _total: total };
  }

  function inventoryRect() {
    return { x: 286, y: 374, w: 574, h: 306 };
  }

  function perkDetailRect() { return { x: 886, y: 110, w: 362, h: 570 }; }

  // THE ONE CONTROL THAT MOVES A LOADOUT. Green when the module is out and red
  // when it is in, in the same place either way -- a button that moves would be
  // a button you can press by accident.
  function perkActionRect() {
    var d = perkDetailRect();
    return { x: d.x + 20, y: d.y + d.h - 66, w: d.w - 40, h: 46 };
  }

  // --- the inventory, grouped by branch --------------------------------------
  //
  // ONE LAYOUT FUNCTION, read by the drawing, the hit test and the scroll
  // ceiling, which is this file's standing rule and the reason a card cannot be
  // drawn somewhere other than where it is clickable.
  //
  // GROUPED BY THE ARM THE NODE IS DRAWN ON in the tree: path A, path B, path C
  // where the tower has one, and everything else under GENERAL. That is derived
  // rather than declared -- see `branchOf` -- so a tree that grows a node picks
  // up its heading without this file learning anything.
  var CARD_H = 50, CARD_GAP_X = 14, CARD_GAP_Y = 8;
  var GROUP_HEAD = 24, GROUP_GAP = 12, INV_TOP = 30;

  // The strip that opens UNDER the pinned module (2026-08-31, at the owner's
  // word: "make the equip/unequip button also right under the module when
  // clicked, keep the one in the description panel"). It is the SAME action as
  // the panel's -- both call `perkActionPressed` -- and it exists because the
  // panel is on the other side of the screen from the card you just clicked.
  //
  // IT IS IN THE LAYOUT, NOT OVER IT: the rows below the pinned one are pushed
  // down by exactly this much, so the strip covers nothing, scrolls with the
  // list, and cannot be clicked through to a card underneath it.
  var ACTION_H = 28;

  var BRANCH_ORDER = ["A", "B", "C", "G"];
  var BRANCH_LABEL = { A: "PATH A", B: "PATH B", C: "PATH C", G: "GENERAL" };

  // WHICH IN-RUN PATHS THIS TOWER HAS, asked of the tower itself. A
  // config-driven one keeps them in `CONFIG.paths`; a hand-written one names a
  // `branch` on every upgrade row. The Farm is the only three-path tower today
  // and nothing here knows that.
  function pathNames(towerId) {
    var Type = MetaProgress.constructorOf(towerId);
    if (!Type) return ["A", "B"];
    if (Type.CONFIG && Type.CONFIG.paths) return Object.keys(Type.CONFIG.paths);
    var seen = {};
    (Type.UPGRADES || []).forEach(function (u) { if (u.branch) seen[u.branch] = true; });
    var out = Object.keys(seen).sort();
    return out.length ? out : ["A", "B"];
  }

  // THE ARM IS THE BRANCH, which is the tree screen's own convention: path A
  // west, path B east, the general branches north and south -- except on a
  // tower with a third in-run path, where the south arm IS that path.
  function branchOf(towerId, node) {
    var at = node.at || { x: 0, y: 0 };
    if (at.x < 0) return "A";
    if (at.x > 0) return "B";
    if (at.y > 0 && pathNames(towerId).indexOf("C") !== -1) return "C";
    return "G";
  }

  function inventoryLayout() {
    var box = inventoryRect();
    var out = { headers: [], items: [], byId: {}, action: null, height: 0 };
    if (!selected) return out;

    var list = TowerPerks.inventory(selected);
    var equipped = MetaProgress.equippedPerks(selected);
    var groups = { A: [], B: [], C: [], G: [] };
    list.forEach(function (n) { groups[branchOf(selected, n)].push(n); });

    var cardW = Math.floor((box.w - CARD_GAP_X) / 2);
    var top = box.y + INV_TOP;
    var y = top - invScroll;

    BRANCH_ORDER.forEach(function (key) {
      var g = groups[key];
      if (!g.length) return;
      out.headers.push({ label: BRANCH_LABEL[key], count: g.length, y: y });
      y += GROUP_HEAD;

      // WHICH ROW THE PINNED MODULE IS ON, if it is in this band at all. Every
      // row BELOW it is pushed down by the strip that opens under it; the rows
      // beside and above it do not move, so the card you clicked stays put.
      var pinnedRow = -1;
      g.forEach(function (node, i) {
        if (node.id === detailNode) pinnedRow = Math.floor(i / 2);
      });
      var lift = ACTION_H + CARD_GAP_Y;

      g.forEach(function (node, i) {
        var col = i % 2, row = Math.floor(i / 2);
        var rect = {
          x: box.x + col * (cardW + CARD_GAP_X),
          y: y + row * (CARD_H + CARD_GAP_Y) +
             (pinnedRow >= 0 && row > pinnedRow ? lift : 0),
          w: cardW, h: CARD_H
        };
        var item = {
          node: node,
          equipped: equipped.indexOf(node.id) !== -1,
          rect: rect
        };
        out.items.push(item);
        out.byId[node.id] = item;
        if (node.id === detailNode) {
          out.action = {
            nodeId: node.id,
            equipped: item.equipped,
            rect: { x: rect.x, y: rect.y + CARD_H + 4, w: cardW, h: ACTION_H }
          };
        }
      });

      y += Math.ceil(g.length / 2) * (CARD_H + CARD_GAP_Y) +
           (pinnedRow >= 0 ? lift : 0) + GROUP_GAP;
    });

    // Measured with the scroll added back, so the ceiling below is a property
    // of the content and not of where the player happens to have scrolled to.
    out.height = (y + invScroll) - top;
    return out;
  }

  // THE i-TH OWNED MODULE'S RECTANGLE, in `TowerPerks.inventory` order -- which
  // is what it has always meant, and stays true now that the cards are grouped
  // rather than laid out in one grid.
  function inventoryCardRect(i) {
    var list = selected ? TowerPerks.inventory(selected) : [];
    var layout = inventoryLayout();
    var node = list[i];
    var item = node ? layout.byId[node.id] : null;
    return item ? item.rect : { x: -1000, y: -1000, w: 0, h: 0 };
  }

  // How far the inventory can scroll: the content that does not fit, and
  // nothing more. A list shorter than the box does not scroll at all.
  function inventoryScrollMax() {
    var box = inventoryRect();
    return Math.max(0, inventoryLayout().height - (box.h - INV_TOP));
  }

  // WHERE THE STRIP UNDER THE PINNED CARD IS, or null when nothing is pinned.
  // A click is accepted only where the strip is actually DRAWN -- the caller
  // tests the inventory box too -- so a strip scrolled half out of the list
  // cannot be pressed through the clip.
  function inventoryActionRect() {
    var action = inventoryLayout().action;
    return action ? action.rect : null;
  }

  // THE FIRST CLAUSE OF A DESCRIPTION, for a card. The full text -- and every
  // number in it -- is the detail panel's job; a card only has to be
  // recognisable at a glance, which is the whole reason the cards got smaller.
  function shortOf(node) {
    var text = String(node.blurb || "");
    var cut = text.length;
    [". ", " — ", " -- ", "; "].forEach(function (mark) {
      var at = text.indexOf(mark);
      if (at > 10 && at < cut) cut = at;
    });
    return text.slice(0, cut).replace(/[\s.;]+$/, "");
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
    detailNode = null;
    hoverNode = null;
    confirmReset = false;
    flash = null;
    centreView();
  }

  // THE MODULE THE RIGHT-HAND CARD IS READING. The pinned one wins, so moving
  // the cursor off a card to reach the button does not empty the card under
  // the button. A hover is only a peek at something nothing is pinned over.
  function readingNode() {
    if (!selected) return null;
    var id = detailNode || hoverNode;
    return id ? TowerPerks.nodeOf(selected, id) : null;
  }

  // WHICH SLOT THIS MODULE IS IN, or -1.
  function slotOf(nodeId) {
    return selected ? MetaProgress.equippedPerks(selected).indexOf(nodeId) : -1;
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
      var box = inventoryRect();
      var items = inventoryLayout().items;
      for (var i = 0; i < items.length; i++) {
        var r = items[i].rect;
        // Clipped to the box: a card scrolled half out of view is only
        // clickable where it is actually drawn.
        if (r.y + r.h < box.y || r.y > box.y + box.h) continue;
        if (pointInRect(x, y, r)) {
          return { kind: "card", index: i, nodeId: items[i].node.id };
        }
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
    // WHAT IS UNDER THE CURSOR, every move and not only while dragging: the
    // detail card previews a hovered module when nothing is pinned over it.
    var over = perkAt(x, y);
    hoverNode = over && over.nodeId ? over.nodeId : null;

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

    // A PLAIN CLICK READS. It does not equip, it does not unequip, and it does
    // not care whether the module was in a slot or in the inventory -- it pins
    // the module into the detail card, and the card's own button is the only
    // thing on this screen that moves a loadout.
    //
    // THAT IS WHAT MAKES AN EQUIPPED MODULE READABLE. Clicking one used to take
    // it straight out of its slot, so the only way to read what a perk you were
    // using did was to stop using it.
    if (!held.moved) {
      detailNode = held.nodeId;
      flash = null;
      return true;
    }

    for (var s = 0; s < MetaProgress.PERK_SLOTS; s++) {
      if (!pointInRect(x, y, slotRect(s))) continue;
      var put = MetaProgress.equipPerk(selected, held.nodeId, s);
      say(put.ok ? "Loadout updated." : put.reason, put.ok ? "good" : "bad");
      if (put.ok) detailNode = held.nodeId;
      return true;
    }

    if (held.fromSlot !== null && pointInRect(x, y, inventoryRect())) {
      var back = MetaProgress.unequipPerk(selected, held.fromSlot);
      say(back.ok ? "Unequipped." : back.reason, back.ok ? "good" : "bad");
      return true;
    }

    say("Dropped nowhere — nothing changed.", "bad");
    return true;
  }

  // THE GREEN BUTTON AND THE RED ONE, which are the same button in the same
  // place: it reads EQUIP while the pinned module is out and UNEQUIP while it
  // is in. Everything it does goes through the model, exactly as a drop does.
  function perkActionPressed() {
    if (!selected || !detailNode) return;

    var at = slotOf(detailNode);
    if (at !== -1) {
      var out = MetaProgress.unequipPerk(selected, at);
      say(out.ok ? "Unequipped." : out.reason, out.ok ? "good" : "bad");
      return;
    }

    var progress = MetaProgress.progressOf(selected);
    if (progress.level === 0) {
      say("This tower is level 0 — no slots yet. Play with it to earn XP.", "bad");
      return;
    }
    // The first slot the level has opened and left free, which is the same
    // rule the drop used to fall back on.
    var free = -1;
    for (var f = 0; f < progress.level; f++) {
      if (MetaProgress.equippedPerks(selected)[f] === null) { free = f; break; }
    }
    if (free === -1) {
      say("Every open slot is full — take one out first.", "bad");
      return;
    }
    var into = MetaProgress.equipPerk(selected, detailNode, free);
    say(into.ok ? "Equipped in slot " + (free + 1) + "." : into.reason,
      into.ok ? "good" : "bad");
  }

  function onClick(x, y) {
    if (screen === "tree") return treeClick(x, y);

    var list = ownedTowers();
    for (var i = 0; i < list.length; i++) {
      if (pointInRect(x, y, towerRowRect(i))) { select(list[i]); return; }
    }
    if (selected && pointInRect(x, y, treeButtonRect())) { openTree(); return; }
    // THE TWO BUTTONS ARE ONE ACTION. The strip under the pinned card and the
    // control at the foot of the detail panel both call `perkActionPressed`,
    // which is the only thing on this screen that moves a loadout.
    if (selected && detailNode) {
      var strip = inventoryActionRect();
      if (strip && pointInRect(x, y, strip) &&
          pointInRect(x, y, inventoryRect())) {
        perkActionPressed();
        return;
      }
      if (pointInRect(x, y, perkActionRect())) { perkActionPressed(); return; }
    }
    // The slots and the cards are answered by the press/release pair above, so
    // a click that reaches here landed on the background.
  }

  // TWO GESTURES, AND THE CALLER SAYS WHICH (2026-08-31, at the owner's word:
  // "on a trackpad two fingers sliding around is moving the cam").
  //
  // A two-finger slide on a trackpad is a WHEEL event, not a drag -- so the
  // tree used to ZOOM when the owner meant to pan, and a horizontal slide did
  // nothing at all. js/game.js classifies the device gesture (it owns the DOM
  // event and is the only thing that can see `ctrlKey`, `deltaX` and
  // `deltaMode`) and hands the intent down; this decides what the screen does
  // with it.
  //
  //   zoom   a pinch, a ctrl-wheel, or a real mouse notch -> zoom to the cursor
  //   pan    anything else -> push the tree the way the fingers went
  //
  // PANNING FOLLOWS THE FINGERS RATHER THAN THE CONTENT: sliding two fingers
  // right moves the view left, which is what every map in the world does and
  // what the right-drag below already does.
  function onWheel(x, y, deltaY, deltaX, zoomGesture) {
    if (screen === "tree") {
      if (zoomGesture === undefined ? true : zoomGesture) {
        zoomAt(x, y, deltaY < 0 ? 1.12 : 1 / 1.12);
        return;
      }
      view.x += (deltaX || 0) / view.zoom;
      view.y += deltaY / view.zoom;
      clampView();
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
    // ZOOM TOWARDS WHAT IS UNDER THE CURSOR, and towards the middle of the
    // BOARD when the cursor is not on it -- a button press or a keyboard zoom
    // has no meaningful point to keep still, and using a corner would walk the
    // tree off screen a notch at a time.
    if (!pointInRect(px, py, boardRect())) {
      var c = boardCentre();
      px = c.x; py = c.y;
    }
    var before = screenToTree(px, py);
    view.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom * factor));
    var after = screenToTree(px, py);
    view.x += before.x - after.x;
    view.y += before.y - after.y;
    clampView();
  }

  // THE TREE CANNOT BE PUSHED OFF THE BOARD. Without this a two-finger slide
  // -- which is easy to overshoot with and has no edge to hit -- loses the tree
  // entirely, and the only way back is the recentre button.
  //
  // The rule is simple: THE VIEW'S CENTRE STAYS INSIDE THE TREE'S OWN BOUNDING
  // BOX, grown by one node pitch on each side. That is enough slack to centre
  // on any node with air around it, and little enough that something is always
  // on screen.
  //
  // ONE PITCH RATHER THAN HALF A BOARD, and the difference is the corners. A
  // tree is a PLUS, not a filled rectangle, so a diagonal over-pan that stops
  // at (maxX + halfBoard, maxY + halfBoard) sits opposite the empty corner
  // between two arms -- both axes legal, and nothing at all on screen. Clamping
  // to the box itself keeps the centre near the arms rather than near the
  // corner. Zero-size trees (one node, or none) fall out of it correctly: the
  // box is a point and the pitch is the whole limit.
  function clampView() {
    if (!selected) return;
    var list = TowerPerks.nodes(selected);
    if (!list.length) return;

    var minX = 0, maxX = 0, minY = 0, maxY = 0;
    list.forEach(function (node) {
      var p = nodePoint(node);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });

    var slack = NODE_PITCH;
    view.x = Math.max(minX - slack, Math.min(maxX + slack, view.x));
    view.y = Math.max(minY - slack, Math.min(maxY + slack, view.y));
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

  // A PAN STARTS ON THE BOARD AND MAY END ANYWHERE. `movePan` is not clipped to
  // the rectangle: a gesture that began legally is not interrupted by the
  // cursor crossing onto the detail card, which is what made a long right-drag
  // stop dead halfway on a wide tree.
  function beginPan(x, y) {
    if (!pointInRect(x, y, boardRect())) return false;
    pan = { startX: x, startY: y, viewX: view.x, viewY: view.y };
    return true;
  }

  function movePan(x, y) {
    if (!pan) return;
    view.x = pan.viewX - (x - pan.startX) / view.zoom;
    view.y = pan.viewY - (y - pan.startY) / view.zoom;
    clampView();
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
    say("Tree reset — " + out.removed + " node" + (out.removed === 1 ? "" : "s") +
        " refunded for " + out.refunded + " ⬡, commission " + out.fee +
        " ⬡, net " + (out.net >= 0 ? "+" : "") + out.net + " ⬡.", "good");
  }

  function coolingText(readyAt) {
    var left = Math.max(0, readyAt - Date.now());
    var minutes = Math.floor(left / 60000);
    var seconds = Math.floor((left % 60000) / 1000);
    return minutes > 0 ? (minutes + " min " + seconds + " s") : (seconds + " s");
  }

  // --- drawing: shared -------------------------------------------------------

  // A NODE'S PLACEHOLDER ICON.
  //
  // TEN MARKS, DRAWN RATHER THAN SHIPPED. Final art has not been chosen for any
  // node in this game, so what a node needs today is a mark that is (a) clearly
  // not final and (b) unmistakably ITS OWN, so a node can be pointed at,
  // discussed and tested before anyone draws anything.
  //
  // A node may pick one explicitly with `icon: n`, which is what the authored
  // content does so that two nodes in the same tree never collide; a node that
  // does not is hashed off its id, which keeps a hand-written tree usable with
  // no bookkeeping. Deterministic either way -- the same node draws the same
  // mark on every boot.
  //
  // REPLACING THESE IS A ONE-FILE CHANGE and takes no save with it: the icon is
  // presentation, the id is the persistence format.
  var SIGIL_KINDS = 10;

  function sigil(nodeId, cx, cy, r, colour, icon) {
    var h = 0;
    for (var i = 0; i < nodeId.length; i++) h = (h * 31 + nodeId.charCodeAt(i)) % 9973;
    var kind = (typeof icon === "number")
      ? ((icon % SIGIL_KINDS) + SIGIL_KINDS) % SIGIL_KINDS
      : h % SIGIL_KINDS;
    var spin = (typeof icon === "number") ? 0 : (h % 12) / 12 * Math.PI;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1.2, r * 0.14);
    ctx.beginPath();
    if (kind === 0) {                      // cross
      ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
      ctx.moveTo(0, -r); ctx.lineTo(0, r);
    } else if (kind === 1) {               // chevron up
      ctx.moveTo(-r, r * 0.5); ctx.lineTo(0, -r * 0.7); ctx.lineTo(r, r * 0.5);
    } else if (kind === 2) {               // hook
      ctx.arc(0, 0, r * 0.8, 0, Math.PI * 1.45);
      ctx.moveTo(0, -r); ctx.lineTo(0, 0);
    } else if (kind === 3) {               // zigzag
      ctx.moveTo(-r, r * 0.5); ctx.lineTo(-r * 0.3, -r);
      ctx.lineTo(r * 0.3, r); ctx.lineTo(r, -r * 0.5);
    } else if (kind === 4) {               // triangle
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.87, r * 0.5);
      ctx.lineTo(-r * 0.87, r * 0.5); ctx.closePath();
    } else if (kind === 5) {               // square on point
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r);
      ctx.lineTo(-r, 0); ctx.closePath();
    } else if (kind === 6) {               // ring with a bar
      ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
      ctx.moveTo(-r, r * 0.85); ctx.lineTo(r, r * 0.85);
    } else if (kind === 7) {               // two bars
      ctx.moveTo(-r, -r * 0.4); ctx.lineTo(r, -r * 0.4);
      ctx.moveTo(-r * 0.6, r * 0.45); ctx.lineTo(r * 0.6, r * 0.45);
    } else if (kind === 8) {               // arrow down
      ctx.moveTo(0, -r); ctx.lineTo(0, r);
      ctx.moveTo(-r * 0.6, r * 0.3); ctx.lineTo(0, r); ctx.lineTo(r * 0.6, r * 0.3);
    } else {                               // asterisk
      for (var a = 0; a < 3; a++) {
        var t = a * Math.PI / 3;
        ctx.moveTo(-Math.cos(t) * r, -Math.sin(t) * r);
        ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r);
      }
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
      drawPerkDetail();
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

    var panel = headerRect();
    drawAshPlate(panel, { live: 0.25, cut: 14 });

    // CLIPPED TO ITS OWN PLATE. A tower's real mesh is drawn at whatever height
    // its body wants, and the tall ones (the Rifleman, the Arcane Sniper) stand
    // straight out of the top of a 128px panel otherwise.
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x + 6, panel.y + 6, 92, panel.h - 12);
    ctx.clip();
    drawTowerIcon(Type, panel.x + 52, panel.y + 66, 64);
    ctx.restore();

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "24px " + MENU_DISPLAY_FONT;
    ctx.fillStyle = "#f6d9b4";
    drawMenuText(Type ? Type.DISPLAY_NAME : selected, panel.x + 106, panel.y + 14, 2);

    ctx.font = "11px " + MENU_TECH_FONT;
    ctx.fillStyle = progress.atMax
      ? "rgba(" + ASH_LEY + ",0.92)" : "rgba(" + ASH_EMBER + ",0.9)";
    drawMenuText(levelLine(progress), panel.x + 106, panel.y + 44, 1.6);

    drawXpBar({ x: panel.x + 106, y: panel.y + 64, w: 232, h: 10 }, progress);

    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.8)";
    ctx.fillText(fitText(ctx, xpLine(progress), 236), panel.x + 106, panel.y + 82);

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
      MetaProgress.PERK_SLOTS + " slots open   ·   click a module to read it",
      286, 230);

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
        sigil(node.id, r.x + r.w / 2, r.y + 32, 15,
          "rgba(" + ASH_EMBER + ",0.95)", node.icon);
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
    var reading = readingNode();

    ctx.textAlign = "left";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.7)";
    ctx.fillText("MODULES — " + list.length +
      (list.length === 1 ? " owned" : " owned") +
      "   ·   drag one onto a slot, or click to read", box.x, box.y + 6);

    if (!list.length) {
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.5)";
      ctx.fillText("Nothing bought yet — open the tree and spend some salvage.",
        box.x, box.y + 40);
      return;
    }

    var layout = inventoryLayout();

    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x - 4, box.y + 24, box.w + 8, box.h - 24);
    ctx.clip();

    // THE BRANCH HEADINGS. A rule to the right of each one, so a group reads as
    // a band rather than as a stray word above some cards.
    layout.headers.forEach(function (head) {
      if (head.y + GROUP_HEAD < box.y + 20 || head.y > box.y + box.h) return;
      ctx.textAlign = "left";
      ctx.font = "10px " + MENU_TECH_FONT;
      ctx.fillStyle = "rgba(" + ASH_EMBER + ",0.85)";
      drawMenuText(head.label, box.x, head.y + 8, 1.8);
      var textW = ctx.measureText(head.label).width * 1.8 + 22;
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.16)";
      ctx.fillRect(box.x + textW, head.y + 7, Math.max(0, box.w - textW - 28), 1);
      ctx.textAlign = "right";
      ctx.font = "9px " + MENU_TECH_FONT;
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.5)";
      drawMenuText(String(head.count), box.x + box.w, head.y + 8, 1.2);
      ctx.textAlign = "left";
    });

    layout.items.forEach(function (item) {
      var r = item.rect;
      if (r.y + r.h < box.y || r.y > box.y + box.h) return;
      var node = item.node;
      var hot = pointInRect(mouse.x, mouse.y, r);
      var open = reading && reading.id === node.id;
      var lifted = drag && drag.moved && drag.nodeId === node.id && drag.fromSlot === null;

      drawAshPlate(r, {
        accent: item.equipped ? ASH_GO : ASH_EMBER,
        live: lifted ? 0 : (hot || open ? 0.7 : (item.equipped ? 0.3 : 0)),
        cut: 8
      });
      if (lifted) return;

      sigil(node.id, r.x + 24, r.y + r.h / 2, 12,
        "rgba(" + (item.equipped ? ASH_GO : ASH_EMBER) + ",0.9)", node.icon);

      ctx.textAlign = "left";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillStyle = item.equipped ? "rgba(" + ASH_GO + ",0.98)" : "#ffe6c4";
      ctx.fillText(fitText(ctx, node.name, r.w - 56), r.x + 44, r.y + 10);

      // ONE SHORT LINE, and never the whole description: the card only has to
      // be recognisable, and the numbers are in the panel on the right.
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.78)";
      ctx.fillText(fitText(ctx, shortOf(node), r.w - 56), r.x + 44, r.y + 28);

      if (item.equipped) {
        ctx.fillStyle = "rgba(" + ASH_GO + ",0.75)";
        ctx.fillRect(r.x + 3, r.y + 8, 2, r.h - 16);
      }
    });

    // THE STRIP UNDER THE PINNED CARD, drawn last inside the clip so it sits
    // over the band's rule and under nothing. Same action and the same two
    // colours as the panel's control -- see `perkActionPressed`.
    var act = layout.action;
    if (act && act.rect.y + act.rect.h >= box.y && act.rect.y <= box.y + box.h) {
      drawAshControl(act.rect, act.equipped ? "UNEQUIP" : "EQUIP", {
        accent: act.equipped ? ASH_STOP : ASH_GO,
        active: true
      });
    }
    ctx.restore();

    // The scrollbar, drawn only when there is something to scroll.
    var max = inventoryScrollMax();
    if (max > 0) {
      var trackH = box.h - INV_TOP;
      var thumb = Math.max(24, trackH * (trackH / (trackH + max)));
      var t = invScroll / max;
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.15)";
      ctx.fillRect(box.x + box.w + 8, box.y + INV_TOP, 4, trackH);
      ctx.fillStyle = "rgba(" + ASH_EMBER + ",0.6)";
      ctx.fillRect(box.x + box.w + 8, box.y + INV_TOP + (trackH - thumb) * t, 4, thumb);
    }
  }

  // --- the module being read -------------------------------------------------
  //
  // EVERYTHING QUANTITATIVE ABOUT ONE MODULE, so a card in the list does not
  // have to carry it. What it shows and what the button does are both about
  // the module `readingNode` answers -- a hover when nothing is pinned, the
  // pinned one otherwise -- and the BUTTON is drawn only for a pinned one, so
  // moving the cursor over the list cannot arm an action.
  function drawPerkDetail() {
    var d = perkDetailRect();
    drawAshPlate(d, { live: 0.18, cut: 16 });

    var node = readingNode();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    if (!node) {
      ctx.font = "12px " + MENU_TECH_FONT;
      ctx.fillStyle = "rgba(" + ASH_EMBER + ",0.7)";
      drawMenuText("PICK A MODULE", d.x + 20, d.y + 22, 1.8);
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.7)";
      wrapLeft("Hover a module to read it, or click one to keep it here and " +
        "get the button that puts it in — or takes it out.",
        d.x + 20, d.y + 52, d.w - 40, 16, 4);
      return;
    }

    var equippedAt = slotOf(node.id);
    var pinned = detailNode === node.id;

    sigil(node.id, d.x + 34, d.y + 36, 16,
      "rgba(" + (equippedAt !== -1 ? ASH_GO : ASH_EMBER) + ",0.95)", node.icon);
    ctx.font = "17px " + MENU_DISPLAY_FONT;
    ctx.fillStyle = "#f6d9b4";
    drawMenuText(fitText(ctx, node.name.toUpperCase(), d.w - 96), d.x + 60, d.y + 26, 1.5);

    // THE BRANCH IT CAME OFF, in the same words the list groups by.
    ctx.font = "9px " + MENU_TECH_FONT;
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.7)";
    drawMenuText(BRANCH_LABEL[branchOf(selected, node)], d.x + 60, d.y + 48, 1.4);

    var y = d.y + 78;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_BONE + ",0.9)";
    var lines = wrapLeft(node.blurb || "No description written for this one yet.",
      d.x + 20, y, d.w - 40, 17, 12);
    y += lines * 17 + 16;

    // THE FACTS, one per line and every one of them resolved rather than
    // repeated from the tree: what it cost, what it needs, and where it is.
    ctx.font = "10px " + MENU_TECH_FONT;
    ctx.fillStyle = "rgba(" + ASH_EMBER + ",0.9)";
    drawMenuText("COST " + (node.cost || 0) + " \u2b21   ·   OWNED", d.x + 20, y, 1.3);
    y += 20;
    ctx.fillStyle = "rgba(" + ASH_LEY + ",0.8)";
    drawMenuText(node.minLevel
      ? "NEEDS TOWER LEVEL " + node.minLevel
      : "NEEDS TOWER LEVEL 0", d.x + 20, y, 1.3);
    y += 20;

    ctx.fillStyle = equippedAt !== -1
      ? "rgba(" + ASH_GO + ",0.95)" : "rgba(" + ASH_DUST + ",0.7)";
    drawMenuText(equippedAt !== -1
      ? "EQUIPPED — SLOT " + (equippedAt + 1)
      : "IN THE INVENTORY, DOING NOTHING", d.x + 20, y, 1.3);
    y += 24;

    // AN UNEQUIPPED MODULE CHANGES NOTHING AT ALL, said once where it matters.
    if (equippedAt === -1) {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.6)";
      wrapLeft("Owning it is not using it — a module only affects a run while " +
        "it is in one of this tower's slots.", d.x + 20, y, d.w - 40, 14, 3);
    }

    var button = perkActionRect();
    if (!pinned) {
      ctx.textAlign = "center";
      ctx.font = "10px " + MENU_TECH_FONT;
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.45)";
      drawMenuText("CLICK IT TO EQUIP OR UNEQUIP",
        button.x + button.w / 2, button.y + button.h / 2 - 5, 1.3);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      return;
    }

    if (equippedAt !== -1) {
      drawAshControl(button, "UNEQUIP", {
        accent: ASH_STOP, active: true,
        detail: "SLOT " + (equippedAt + 1) + " — STILL OWNED"
      });
    } else {
      var progress = MetaProgress.progressOf(selected);
      drawAshControl(button, "EQUIP", {
        accent: ASH_GO, active: true,
        detail: progress.level === 0 ? "NO SLOT OPEN YET" : "INTO THE FIRST FREE SLOT"
      });
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
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
    sigil(node.id, r.x + r.w / 2, r.y + 20, 12,
      "rgba(" + ASH_EMBER + ",0.95)", node.icon);
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
    drawMenuText("RIGHT-DRAG OR TWO-FINGER SLIDE TO PAN   ·   PINCH OR WHEEL TO ZOOM   " +
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

    sigil(node.id, p.x, p.y, r * 0.44, "rgba(" + accent + "," + alpha + ")", node.icon);

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

    sigil(treeNode.id, d.x + 34, d.y + 38, 16,
      "rgba(" + ASH_EMBER + ",0.95)", treeNode.icon);
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

    // STATED EITHER WAY, and the zero case is the one worth printing: every
    // node authored so far is buyable at level 0, and a card that simply says
    // nothing leaves the player to infer it. It still has to be EQUIPPED into a
    // slot the level opens, which is the distinction this line keeps visible.
    ctx.fillStyle = "rgba(" + ASH_LEY + ",0.85)";
    drawMenuText(treeNode.minLevel
      ? "NEEDS TOWER LEVEL " + treeNode.minLevel
      : "NEEDS TOWER LEVEL 0", d.x + 20, y, 1.3);
    y += 20;
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

    // EVERY FIGURE, BEFORE THE SECOND PRESS. The brief is explicit that the
    // player must see the gross refund, the node count, the commission, the net
    // and the delay before confirming -- and all five are derived from the same
    // rate the model charges, so the quote cannot be a different sum from the
    // transaction.
    var gross = TowerPerks.refundValue(selected);
    var fee = owned * MetaProgress.TREE_RESET_FEE_PER_NODE;
    var net = gross - fee;
    var hours = Math.round(MetaProgress.TREE_RESET_COOLDOWN_MS / 3600000);

    if (confirmReset) {
      drawAshControl(r, "CONFIRM RESET", {
        accent: "240,120,110", primary: true,
        detail: (net >= 0 ? "+" : "") + net + " ⬡ NET"
      });
    } else {
      drawAshControl(r, "RESET TREE", {
        disabled: !owned || cooling,
        detail: cooling ? ("READY IN " + coolingText(ready).toUpperCase())
          : (owned ? (owned + " BOUGHT · " + fee + " ⬡ COMMISSION")
                   : "NOTHING BOUGHT")
      });
    }

    // WHAT A RESET COSTS AND WHAT IT TAKES BACK. It also says what it does NOT
    // touch, because "will I lose my level" is the first question a refund
    // button raises.
    ctx.textAlign = "left";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.7)";
    wrapLeft(owned
      ? ("Refunds " + owned + " node" + (owned === 1 ? "" : "s") + " for " +
         gross + " ⬡ gross, less a " + MetaProgress.TREE_RESET_FEE_PER_NODE +
         " ⬡ commission a node (" + fee + " ⬡) — net " + (net >= 0 ? "+" : "") +
         net + " ⬡. Clears this tower's loadout and cools down for " + hours +
         " hour" + (hours === 1 ? "" : "s") + ". Level and XP are never touched.")
      : ("Refunds every node bought here at its full price, less a " +
         MetaProgress.TREE_RESET_FEE_PER_NODE + " ⬡ commission a node. Clears " +
         "the loadout and cools down for " + hours + " hour" +
         (hours === 1 ? "" : "s") + ". Level and XP are never touched."),
      r.x, r.y - 92, 232, 13, 7);
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
    perkDetailRect: perkDetailRect,
    perkActionRect: perkActionRect,
    inventoryActionRect: inventoryActionRect,
    branchOf: function (nodeId) {
      var node = selected ? TowerPerks.nodeOf(selected, nodeId) : null;
      return node ? branchOf(selected, node) : null;
    },
    inventoryGroups: function () {
      return inventoryLayout().headers.map(function (h) { return h.label; });
    },
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
        detail: detailNode, hover: hoverNode,
        confirmReset: confirmReset, view: { x: view.x, y: view.y, zoom: view.zoom },
        scroll: invScroll, dragging: drag ? drag.nodeId : null
      };
    }
  };
})();
