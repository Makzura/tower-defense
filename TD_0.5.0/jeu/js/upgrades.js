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
// THAT CONTROL IS DRAWN THREE TIMES AND IS ONE ACTION -- at the foot of the
// detail panel, as a strip directly UNDER the pinned card, and under the SLOT
// the pinned module is sitting in. The panel is on the other side of the screen
// from whatever was just clicked, and reaching across for it is the gesture this
// screen was meant to remove; wherever you clicked, the button is beside your
// cursor. All three call `perkActionPressed`, so there is one action and not
// three implementations that can drift.
//
// **NOTHING MOVES WHEN THE PIN DOES.** The card's strip has a lane reserved
// under EVERY row whether one is open or not, so the list's geometry does not
// depend on which module is being read -- and the strip is therefore always
// below the card that was clicked and never under the cursor that clicked it.
// It was inserted only under the pinned row until 2026-08-31, which reflowed
// the list: pinning a card BELOW the open one made the card the player had just
// clicked jump up under a stationary cursor, with the new strip opening exactly
// where that cursor now was. One impatient double-click then equipped something
// they meant to read. The slot's strip sits in the gap the slots already leave
// above the list and is ALWAYS the red UNEQUIP -- a slot only ever holds an
// equipped module, so there is no state in which it could offer to equip.
//
// THE TREE SCREEN ALSO DRAWS THE UPGRADE-SQUARED NODES (2026-09-01), smaller,
// hanging off the arm their parent sits on. A square has RANKS and no slot, so
// its rank is a ring of pips round the rim and its card prints the rank it is
// at, the rank it goes to, what THAT rank costs on its own, the resolved value
// now and next, which upgrade owns it and whether that upgrade is equipped,
// every requirement with the rank it has against the rank it needs, and both
// halves of the trade. Its links are lit one at a time, so a fusion you are
// halfway to has one bright arm and one dim one. `treeNodeKind` remembers which
// kind the card is reading; one buy button serves both.
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

  // IS THE CARD READING A PERK OR ONE OF THE SQUARES? Two node formats, two
  // sets of rules, one card -- so the kind is remembered beside the node rather
  // than sniffed from its fields every time something wants to draw it.
  var treeNodeKind = "perk";  // "perk" | "square"

  var NODE_PITCH = 132;       // world units between two node coordinates
  var NODE_R = 30;            // node radius at zoom 1
  // AN UPGRADE-SQUARED NODE IS DRAWN SMALLER, and that is the whole of how the
  // two are told apart at a glance: a square hangs off the arm its parent sits
  // on, at two thirds the radius, so the spine of the tree stays the twelve
  // permanent upgrades and the satellites read as belonging to them.
  var SQUARE_R = 20;
  // HOW FAR OUT THE CAMERA MAY GO, and it is set by the BIGGEST tree rather
  // than by taste (2026-09-01). It was 0.45, which was ample for a twelve-node
  // tower tree and too tight for the Player's sixty-two: framing that one needs
  // 0.26, so a recentre clamped at 0.45 and showed about half of it, with no
  // way to see the rest at once.
  //
  // 0.2 rather than 0.26, so a tree half again as large as the Player's still
  // fits without this number being revisited. `centreView` never zooms out
  // further than the tree actually needs, so nothing reaches the floor unless
  // it has to.
  var MIN_ZOOM = 0.2;
  var MAX_ZOOM = 1.8;

  // NAMES ARE DRAWN AT EVERY LEGAL ZOOM (2026-09-01). There was a 0.62 floor
  // below which they came off, and the number was about OVERLAP rather than type
  // size -- a label is a fixed 10px however far out the camera is, so what makes
  // one unreadable is the neighbour's label running into it, not small letters.
  // That floor was right for a twelve-node tree at zoom 1 and wrong for a
  // thirty-four-node one: a recentre framed the whole Rifleman tree at 0.48 and
  // printed not one name. `labelWidth` now clips each name to the room its own
  // row actually has, so overlap is impossible and the floor had nothing left to
  // protect.
  // THE SHORTEST NAME WORTH DRAWING, in pixels. Below this a label is an
  // ellipsis and two letters -- noise over the node it belongs to -- so it comes
  // off, and the detail card is where the name is read instead.
  //
  // IT IS A WIDTH AND NOT A ZOOM (2026-09-01), because width is what the
  // question is actually about: `labelWidth` already clips a name to the room
  // its own row has, so the same zoom can be roomy on one tree and cramped on
  // another. A fixed zoom floor got that wrong in both directions -- it hid
  // every name on the Rifleman's tree at 0.605 and would have drawn unreadable
  // stubs all over the Player's at 0.26.
  var LABEL_MIN_WIDTH = 34;

  // HOW WIDE A NAME MAY BE, in pixels at the current zoom.
  //
  // TWO LABELS COLLIDE ONLY IF THEY SHARE A ROW. They are drawn centred under
  // their node, so a node 30 px higher or lower is on its own line and its
  // width is nobody's business; what constrains a name is the nearest node on
  // roughly the SAME row. So the lane is the tightest horizontal gap among
  // nodes whose labels would land within 30 px of each other vertically, and it
  // is derived from the tree rather than typed in -- a tree authored on a
  // different lattice gets its own answer with nothing else changed.
  //
  // Capped at the caller's fixed width so nothing ever got WIDER than it was,
  // and `fitText` ellipsises what still will not fit. The full name is always on
  // the detail card.
  var laneCache = { id: null, zoom: 0, lane: NODE_PITCH };

  function labelLane() {
    if (laneCache.id === selected && laneCache.zoom === view.zoom) return laneCache.lane;
    var list = E().nodes().concat(E().squares());
    var lane = NODE_PITCH * 2;
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        var a = nodePoint(list[i]), b = nodePoint(list[j]);
        if (Math.abs(a.y - b.y) * view.zoom >= 30) continue;   // different rows
        lane = Math.min(lane, Math.abs(a.x - b.x));
      }
    }
    laneCache = { id: selected, zoom: view.zoom, lane: lane };
    return lane;
  }

  function labelWidth(cap) {
    return Math.min(cap, labelLane() * view.zoom * 0.92);
  }

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
    // SEVEN SLOTS ARE NARROWER THAN FIVE and have to fit the same band: the
    // Player carries seven where a tower carries five, so the size is derived
    // from the count rather than typed in. Five still resolves to the 92 it
    // always was, so no tower screen moved a pixel.
    var count = E().slotCount();
    var band = 574, gap = count > 5 ? 10 : 16;
    // CAPPED AT THE 92 A TOWER'S SLOT HAS ALWAYS BEEN, so five slots resolve to
    // exactly the geometry they did before the Player existed -- the band is
    // wide enough for bigger ones and growing them would have pushed the strip
    // that opens under a slot down into the inventory box.
    var size = Math.min(92, Math.floor((band - (count - 1) * gap) / count));
    return { x: 286 + i * (size + gap), y: 250, w: size, h: size,
             _total: band };
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
  var CARD_H = 44, CARD_GAP_X = 14, CARD_GAP_Y = 6;
  var GROUP_HEAD = 24, GROUP_GAP = 12, INV_TOP = 30;

  // The strip that opens UNDER the pinned module. It is the SAME action as the
  // panel's -- both call `perkActionPressed` -- and it exists because the panel
  // is on the other side of the screen from the card you just clicked.
  //
  // **ITS LANE IS RESERVED UNDER EVERY ROW, WHETHER OR NOT ONE IS OPEN**, and
  // that is the whole point rather than a waste of space (2026-08-31, at the
  // owner's word: "make sure the module that is clicked doesn't move when
  // clicked so that clicking twice can't unequip without moving the mouse").
  //
  // It was inserted only under the pinned row, which reflowed everything below
  // it -- and that is a real trap, not merely untidy. Pinning a card BELOW the
  // one already open removes the old strip, so the card the player just clicked
  // JUMPS UP by a strip's height under a stationary cursor, and the new strip
  // opens exactly where that cursor now is. A second click, or one impatient
  // double-click, then equips or unequips something the player only meant to
  // read.
  //
  // A reserved lane makes that impossible by construction rather than by care:
  // the list's geometry does not depend on which module is open, so NOTHING
  // moves when the pin does, and the strip is always below the card that was
  // clicked and therefore never under the cursor that clicked it. The price is
  // a taller list, and the cards were shortened to pay some of it back.
  var ACTION_H = 24, ACTION_GAP = 4;
  var ROW_PITCH = CARD_H + ACTION_GAP + ACTION_H + CARD_GAP_Y;

  var BRANCH_ORDER = ["A", "B", "C", "G", "I", "C2", "D", "X"];
  var BRANCH_LABEL = {
    A: "PATH A", B: "PATH B", C: "PATH C", G: "GENERAL",
    // The Player's three trunks and the pair that answers to none of them.
    I: "INTENDANT", C2: "COMMANDANT", D: "GARDIEN", X: "FUSIONS & SECRET"
  };

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

    var list = E().inventory();
    var equipped = E().equipped();
    var groups = { A: [], B: [], C: [], G: [], I: [], C2: [], D: [], X: [] };
    list.forEach(function (n) { groups[E().branchOf(n)].push(n); });

    var cardW = Math.floor((box.w - CARD_GAP_X) / 2);
    var top = box.y + INV_TOP;
    var y = top - invScroll;

    BRANCH_ORDER.forEach(function (key) {
      var g = groups[key];
      if (!g.length) return;
      out.headers.push({ label: BRANCH_LABEL[key], count: g.length, y: y });
      y += GROUP_HEAD;

      // EVERY ROW IS ONE PITCH TALL, pinned or not -- see ROW_PITCH. Nothing
      // in this loop reads `detailNode` except to decide where to DRAW the
      // strip, which is what makes the geometry independent of it.
      g.forEach(function (node, i) {
        var col = i % 2, row = Math.floor(i / 2);
        var rect = {
          x: box.x + col * (cardW + CARD_GAP_X),
          y: y + row * ROW_PITCH,
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
            rect: { x: rect.x, y: rect.y + CARD_H + ACTION_GAP,
                    w: cardW, h: ACTION_H }
          };
        }
      });

      y += Math.ceil(g.length / 2) * ROW_PITCH + GROUP_GAP;
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
    var list = selected ? E().inventory() : [];
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

  // WHERE THE STRIP UNDER THE PINNED MODULE'S SLOT IS, or null.
  //
  // A slot only ever holds an EQUIPPED module, so this one is always the red
  // UNEQUIP -- there is no state in which a slot could offer to equip. It sits
  // in the gap the slots already leave above the module list, so nothing had to
  // move to make room for it.
  var SLOT_ACTION_H = 24;

  function slotActionRect() {
    if (!selected || !detailNode) return null;
    var at = slotOf(detailNode);
    if (at === -1) return null;
    var r = slotRect(at);
    return { x: r.x, y: r.y + r.h + 6, w: r.w, h: SLOT_ACTION_H };
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
  // THE RESET CONTROL LIVES UNDER THE DETAIL CARD, NOT ON THE LEFT RAIL
  // (2026-09-01). It was at x 28 with a 232-wide paragraph of small print above
  // it, which reached to x 260 -- well inside the board, whose left edge is 96.
  // That cost nothing while the trees were narrow and centred; the Rifleman's is
  // now wide enough to put nodes there, and a tower's modules drawn through a
  // paragraph about commissions is exactly the tangle this pass is undoing. The
  // right column below the card is empty, the same width, and already the place
  // a player looks for the buttons that spend coins.
  function resetTreeRect() { return { x: 900, y: 648, w: 352, h: 46 }; }
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

  // --- THE ENTITY ADAPTER (2026-09-01) ---------------------------------------
  //
  // THIS SCREEN NOW HOLDS TWO KINDS OF THING, and they are genuinely different:
  // a TOWER TYPE has five perk slots opened one per level, a tree of nodes and a
  // catalogue entry; the PLAYER has seven slots of which `2 + level` are open,
  // a tree of MODULES, no constructor and no catalogue entry at all.
  //
  // Every question this file asks is one of the fifteen below, so they are asked
  // through an adapter rather than by branching at each of the ninety call
  // sites. `E()` answers for whatever is selected, and the drawing, the hit
  // tests, the purchases and the tree all read the same fifteen names.
  //
  // The alternative -- a second screen for the Player -- was rejected because
  // the tree, the inventory, the slot strip and the reset control are the same
  // controls doing the same job, and two copies of them would drift apart the
  // first time either was touched.
  var PLAYER_ID = "player";

  function isPlayerSelected() { return selected === PLAYER_ID; }

  // Every entity the list offers, Player first: it is the one thing a profile
  // always has, and putting it at the top means the screen is never empty.
  function entityList() {
    return [PLAYER_ID].concat(ownedTowers());
  }

  var TOWER_API = {
    isPlayer: false,
    name: function () {
      var Type = MetaProgress.constructorOf(selected);
      return Type ? Type.DISPLAY_NAME : selected;
    },
    heading: function () { return "PERMANENT UPGRADES"; },
    progress: function () { return MetaProgress.progressOf(selected); },
    slotCount: function () { return MetaProgress.PERK_SLOTS; },
    openSlots: function () { return MetaProgress.progressOf(selected).level; },
    equipped: function () { return MetaProgress.equippedPerks(selected); },
    equip: function (id, slot) { return MetaProgress.equipPerk(selected, id, slot); },
    unequip: function (slot) { return MetaProgress.unequipPerk(selected, slot); },
    inventory: function () { return TowerPerks.inventory(selected); },
    nodes: function () { return TowerPerks.nodes(selected); },
    squares: function () { return TowerPerks.upgrades2(selected); },
    nodeOf: function (id) { return TowerPerks.nodeOf(selected, id); },
    squareOf: function (id) { return TowerPerks.upgrade2Of(selected, id); },
    stateOf: function (id) { return TowerPerks.stateOf(selected, id); },
    squareStateOf: function (id) { return TowerPerks.upgrade2StateOf(selected, id); },
    owns: function (id) { return MetaProgress.ownsNode(selected, id); },
    rankOf: function (id) { return TowerPerks.rankOf(selected, id); },
    buy: function (id) { return TowerPerks.buy(selected, id); },
    buyRank: function (id) { return TowerPerks.buyUpgrade2(selected, id); },
    parentsOf: function (node) { return TowerPerks.parentStatesOf(selected, node); },
    refundValue: function () { return TowerPerks.refundValue(selected); },
    resetCount: function () {
      return MetaProgress.ownedNodes(selected).length +
             MetaProgress.rankedNodeCount(selected);
    },
    resetReadyAt: function () { return MetaProgress.resetReadyAt(selected); },
    reset: function (now) { return TowerPerks.resetTree(selected, now); },
    branchOf: function (node) { return branchOf(selected, node); }
  };

  var PLAYER_API = {
    isPlayer: true,
    name: function () { return "Player"; },
    heading: function () { return "PERMANENT PLAYER MODULES"; },
    progress: function () { return MetaProgress.playerProgress(); },
    slotCount: function () { return MetaProgress.PLAYER_SLOTS; },
    openSlots: function () { return MetaProgress.playerProgress().slots; },
    equipped: function () { return MetaProgress.equippedModules(); },
    equip: function (id, slot) { return PlayerPerks.equip(id, slot); },
    unequip: function (slot) { return PlayerPerks.unequip(slot); },
    inventory: function () { return PlayerPerks.inventory(); },
    nodes: function () { return PlayerPerks.modules(); },
    squares: function () { return PlayerPerks.upgrades2(); },
    nodeOf: function (id) { return PlayerPerks.moduleOf(id); },
    squareOf: function (id) { return PlayerPerks.upgrade2Of(id); },
    stateOf: function (id) { return PlayerPerks.stateOf(id); },
    squareStateOf: function (id) { return PlayerPerks.upgrade2StateOf(id); },
    owns: function (id) { return MetaProgress.ownsModule(id); },
    rankOf: function (id) { return PlayerPerks.rankOf(id); },
    buy: function (id) { return PlayerPerks.buy(id); },
    buyRank: function (id) { return PlayerPerks.buyRank(id); },
    parentsOf: function (node) {
      return PlayerPerks.parentsOf(node).map(function (pid) {
        var equipped = MetaProgress.equippedModules().indexOf(pid) !== -1;
        return { id: pid, name: PlayerPerks.labelOf(pid),
                 owned: MetaProgress.ownsModule(pid), equipped: equipped };
      });
    },
    refundValue: function () { return PlayerPerks.refundValue(); },
    resetCount: function () { return PlayerPerks.resetNodeCount(); },
    resetReadyAt: function () { return MetaProgress.playerResetReadyAt(); },
    reset: function (now) { return PlayerPerks.reset(now); },
    // THE PLAYER'S INVENTORY IS GROUPED BY ITS ROOT, not by an arm: its tree is
    // three trunks and a pair of fusions rather than four arms, so "which root
    // does this descend from" is the grouping that means something. Derived by
    // walking `requires` up, so a module added under a root picks up its band
    // with nothing else changed.
    branchOf: function (node) { return playerRootOf(node); }
  };

  function E() { return isPlayerSelected() ? PLAYER_API : TOWER_API; }

  var PLAYER_ROOTS = {
    player_intendant_diversified_arsenal: "I",
    player_commander_priority_order: "C2",
    player_guardian_bastion_pact: "D"
  };

  function playerRootOf(node) {
    var seen = {}, stack = [node.id];
    while (stack.length) {
      var id = stack.pop();
      if (seen[id]) continue;
      seen[id] = true;
      if (PLAYER_ROOTS[id]) return PLAYER_ROOTS[id];
      var n = PlayerPerks.moduleOf(id);
      (n && n.requires ? n.requires : []).forEach(function (p) { stack.push(p); });
    }
    return "X";                                  // a fusion, or the secret
  }

  function open() {
    var list = entityList();
    // Keep the entity that was already open if it is still there, so coming
    // back from the tree -- or from a run -- lands where the player left off.
    //
    // THE DEFAULT IS THE FIRST TOWER, NOT THE PLAYER, even though the Player is
    // the first ROW. The Player sits at the top of the list because it is the
    // profile's own progression and belongs above the things it equips; the
    // screen still opens on a tower because that is what it opened on before
    // the Player existed, and a screen that quietly lands somewhere else after
    // an update is a screen that lost the player's place.
    if (list.indexOf(selected) === -1) {
      var towers = ownedTowers();
      selected = towers.length ? towers[0] : (list.length ? list[0] : null);
    }
    flash = null;
    invScroll = 0;
    screen = "upgrades";
  }

  function openTree() {
    if (!selected) return;
    treeNode = null;
    treeNodeKind = "perk";
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

    // BOTH LISTS, for the same reason `clampView` reads both: a recentre that
    // framed only the twelve permanent upgrades would leave the Rifleman's
    // squares hanging off three edges of a board that says it is showing the
    // whole tree.
    var list = E().nodes().concat(E().squares());
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

    // FRAME THE WHOLE TREE, down to the camera's floor. Never zooms IN past 1
    // -- a four-node tree blown up to fill the board looks broken -- and never
    // out past MIN_ZOOM, which is now low enough that every authored tree fits.
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
    treeNodeKind = "perk";
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
    return id ? E().nodeOf(id) : null;
  }

  // WHICH SLOT THIS MODULE IS IN, or -1.
  function slotOf(nodeId) {
    return selected ? E().equipped().indexOf(nodeId) : -1;
  }

  // --- the upgrades screen: input --------------------------------------------

  // WHERE A PRESS LANDS, so the press, the drag and the release all agree.
  // Returns { kind: "slot"|"card", index, nodeId } or null.
  function perkAt(x, y) {
    if (!selected) return null;

    var loadout = E().equipped().map(function (id) { return id === null ? null : E().nodeOf(id); });
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

    for (var s = 0; s < E().slotCount(); s++) {
      if (!pointInRect(x, y, slotRect(s))) continue;
      var put = E().equip(held.nodeId, s);
      say(put.ok ? "Loadout updated." : put.reason, put.ok ? "good" : "bad");
      if (put.ok) detailNode = held.nodeId;
      return true;
    }

    if (held.fromSlot !== null && pointInRect(x, y, inventoryRect())) {
      var back = E().unequip(held.fromSlot);
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
      var out = E().unequip(at);
      say(out.ok ? "Unequipped." : out.reason, out.ok ? "good" : "bad");
      return;
    }

    var progress = E().progress();
    if (progress.level === 0) {
      say("This tower is level 0 — no slots yet. Play with it to earn XP.", "bad");
      return;
    }
    // The first slot the level has opened and left free, which is the same
    // rule the drop used to fall back on.
    var free = -1;
    for (var f = 0; f < progress.level; f++) {
      if (E().equipped()[f] === null) { free = f; break; }
    }
    if (free === -1) {
      say("Every open slot is full — take one out first.", "bad");
      return;
    }
    var into = E().equip(detailNode, free);
    say(into.ok ? "Equipped in slot " + (free + 1) + "." : into.reason,
      into.ok ? "good" : "bad");
  }

  function onClick(x, y) {
    if (screen === "tree") return treeClick(x, y);

    // **THE SAME LIST THE ROWS ARE DRAWN FROM.** This walked `ownedTowers()`
    // while `drawTowerList` walked `entityList()`, so once the Player took the
    // first row every click was off by one -- row 1 selected the tower drawn on
    // row 2, and the Player could not be reached at all. That is exactly the
    // "drawn somewhere other than where it is clickable" failure the geometry
    // note at the top of this file exists to prevent, and the fix is the rule
    // it states: one source for both.
    var list = entityList();
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
      var underSlot = slotActionRect();
      if (underSlot && pointInRect(x, y, underSlot)) { perkActionPressed(); return; }
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
    // BOTH LISTS, because a square sits further out than any perk on three of
    // the four arms -- clamping to the perks alone would put half the Rifleman's
    // squares permanently off the edge of a fully panned board.
    var list = E().nodes().concat(E().squares());
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

  // WHICH NODE IS UNDER THE CURSOR, of either kind. The squares are tested
  // FIRST and with their own smaller radius: they are drawn on top of the
  // links and are the smaller target, so a click that could be read either way
  // belongs to the one that is harder to hit.
  function nodeAt(x, y) {
    if (!selected || !pointInRect(x, y, boardRect())) return null;
    var hit = hitList(x, y, E().squares(), SQUARE_R);
    if (hit) return { node: hit, kind: "square" };
    hit = hitList(x, y, E().nodes(), NODE_R);
    return hit ? { node: hit, kind: "perk" } : null;
  }

  function hitList(x, y, list, radius) {
    var r = radius * view.zoom;
    for (var i = 0; i < list.length; i++) {
      var p = treeToScreen(nodePoint(list[i]).x, nodePoint(list[i]).y);
      var dx = x - p.x, dy = y - p.y;
      if (dx * dx + dy * dy <= r * r) return list[i];
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
      // TWO PURCHASES, ONE BUTTON, AND THE MODEL DECIDES WHICH. A perk is
      // bought once; a square buys its next rank. Both refuse with the same
      // sentence the card is already printing.
      var result = treeNodeKind === "square"
        ? E().buyRank(treeNode.id)
        : E().buy(treeNode.id);
      say(result.ok
        ? (treeNodeKind === "square"
            ? ("Rank " + result.rank + " bought — it applies while " +
               parentLabel(treeNode) + " is equipped.")
            : "Bought — it is in the tower's inventory.")
        : result.reason,
        result.ok ? "good" : "bad");
      return;
    }

    var hit = nodeAt(x, y);
    if (hit) {
      treeNode = hit.node;
      treeNodeKind = hit.kind;
      confirmReset = false;
      return;
    }
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
      var ready = E().resetReadyAt();
      if (ready > Date.now()) {
        say("Reset cools down for another " + coolingText(ready) + ".", "bad");
        return;
      }
      if (!E().resetCount()) {
        say("Nothing bought on this tree yet.", "bad");
        return;
      }
      confirmReset = true;
      return;
    }
    confirmReset = false;
    var out = E().reset(Date.now());
    if (!out.ok) { say(out.reason, "bad"); return; }
    treeNode = null;
    treeNodeKind = "perk";
    say("Tree reset — " + out.removed + " node" + (out.removed === 1 ? "" : "s") +
        " refunded for " + out.refunded + " ⬡, commission " + out.fee +
        " ⬡, net " + (out.net >= 0 ? "+" : "") + out.net + " ⬡.", "good");
  }

  // HOW MANY NODES A RESET WOULD REVOKE, and therefore what it is charged for.
  // A ranked upgrade-squared node counts ONCE however many ranks it holds --
  // the owner's rule, and the same count `MetaProgress.resetTree` charges, so
  // the quote on the button and the transaction cannot be different sums.
  // HOW MANY NODES A RESET WOULD REVOKE. Deliberately NOT the same rule for
  // both entities, and both are the owner's: a tower's ranked square counts
  // ONCE however many ranks it holds, and every one of the Player's ranks
  // counts on its own. `E().resetCount()` is what asks, so the button's quote
  // and the model's transaction cannot be different sums.
  function resetNodeCount(towerId) {
    return MetaProgress.ownedNodes(towerId).length +
      MetaProgress.rankedNodeCount(towerId);
  }

  // "Overloaded Drum", or "Overloaded Drum and Commissioned Ammunition" for a
  // fusion. One phrasing, so the card, the flash and the refusal all name the
  // same thing the same way.
  function parentLabel(node) {
    var parents = E().parentsOf(node);
    return parents.map(function (p) { return p.name; }).join(" and ");
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

  // THE PLAYER'S PORTRAIT -- a PLACEHOLDER, and deliberately one that could not
  // be mistaken for finished art: a hooded silhouette drawn from four strokes
  // in the same ash palette as everything else on this screen. It exists so the
  // Player's row reads as an entity beside the towers rather than as a gap, and
  // so the rest of this screen could be built and tested before anybody drew
  // anything. Replacing it is a one-function change and takes no save with it.
  function drawPlayerPortrait(cx, cy, size) {
    var s = size / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "rgba(" + ASH_EMBER + ",0.85)";
    ctx.lineWidth = Math.max(1.4, size * 0.055);
    ctx.beginPath();
    ctx.arc(0, -s * 0.28, s * 0.34, 0, Math.PI * 2);          // the head
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.72, s * 0.78);                           // the shoulders
    ctx.quadraticCurveTo(0, -s * 0.10, s * 0.72, s * 0.78);
    ctx.stroke();
    ctx.strokeStyle = "rgba(" + ASH_LEY + ",0.5)";
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.94, Math.PI * 1.15, Math.PI * 1.85);   // the hood's arc
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
    drawAshHeading("UPGRADES", "PERMANENT PROGRESSION", 26, true);

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
    var list = entityList();
    ctx.textBaseline = "middle";

    list.forEach(function (id, i) {
      var r = towerRowRect(i);
      var player = id === PLAYER_ID;
      var Type = player ? null : MetaProgress.constructorOf(id);
      var active = id === selected;
      var hot = pointInRect(mouse.x, mouse.y, r);

      drawAshPlate(r, { live: active ? 0.8 : (hot ? 0.5 : 0), cut: 10 });

      if (player) drawPlayerPortrait(r.x + 30, r.y + r.h / 2, 42);
      else drawTowerIcon(Type, r.x + 30, r.y + r.h / 2, 42);

      var progress = player ? MetaProgress.playerProgress()
                            : MetaProgress.progressOf(id);
      var bought = player ? MetaProgress.ownedModules().length
                          : MetaProgress.ownedNodes(id).length;
      ctx.textAlign = "left";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillStyle = active ? "#ffe6c4" : "rgba(" + ASH_BONE + ",0.85)";
      ctx.fillText(fitText(ctx, player ? "Player"
                             : (Type ? Type.DISPLAY_NAME : id), 120),
        r.x + 58, r.y + 20);

      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.75)";
      ctx.fillText("Lv " + progress.level + "  ·  " + bought + " bought",
        r.x + 58, r.y + 38);

      // The slot pips: five, one per perk slot, so the list itself shows every
      // tower's LOADOUT without opening any of them.
      var pips = id === PLAYER_ID ? MetaProgress.PLAYER_SLOTS : MetaProgress.PERK_SLOTS;
      for (var p = 0; p < pips; p++) {
        drawSlotPip(pipRect(r, p, pips), slotPipState(id, p));
      }
    });
    ctx.textBaseline = "top";
  }

  // --- the five pips beside a tower in the list ------------------------------
  //
  // THEY READ THE LOADOUT, NOT THE LEVEL (2026-08-31, at the owner's word: they
  // "clearly look like equipped or unequipped module", and they did not -- they
  // were five solid squares filled up to the tower's LEVEL, so a tower with
  // every slot open and nothing in any of them looked exactly like one carrying
  // five modules).
  //
  // Three states, and the level is still legible from them, because how many
  // pips are NOT barred is the level:
  //
  //   filled   a module is equipped in that slot
  //   empty    the slot is open and nothing is in it
  //   locked   the level has not opened that slot -- a diagonal bar
  //
  // One function answering the state and one drawing it, so the list and a test
  // read the same three words rather than the same pixels.
  // THE PLAYER'S OPEN SLOTS ARE `2 + level`; A TOWER'S ARE ITS LEVEL. That is
  // the one place the two entities genuinely differ on this screen, and both
  // sides read the model's own answer -- so the pips, the slot band and the
  // refusal `equipModule` gives cannot disagree about how many are open.
  function slotPipState(id, index) {
    if (id === PLAYER_ID) {
      var p = MetaProgress.playerProgress();
      if (index >= p.slots) return "locked";
      return p.equipped[index] ? "filled" : "empty";
    }
    if (index >= MetaProgress.progressOf(id).level) return "locked";
    return MetaProgress.equippedPerks(id)[index] ? "filled" : "empty";
  }

  // Eight pixels rather than the old six, because a diagonal inside six reads
  // as a smudge. The band ends where it always did, so nothing else moved.
  var PIP = 8, PIP_PITCH = 10;

  function pipRect(row, index, count) {
    var n = count || MetaProgress.PERK_SLOTS;
    return {
      x: row.x + row.w - 12 - (n - index) * PIP_PITCH,
      y: row.y + 11, w: PIP, h: PIP
    };
  }

  function drawSlotPip(r, state) {
    if (state === "filled") {
      ctx.fillStyle = "rgba(" + ASH_EMBER + ",0.9)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      return;
    }
    if (state === "empty") {
      // An outline and no fill: the slot is there and it is waiting.
      ctx.strokeStyle = "rgba(" + ASH_EMBER + ",0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      return;
    }
    // LOCKED: a bar corner to corner, and dimmer than either of the others
    // because it is the one state the player cannot act on.
    ctx.strokeStyle = "rgba(" + ASH_DUST + ",0.42)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r.x + 0.5, r.y + r.h - 0.5);
    ctx.lineTo(r.x + r.w - 0.5, r.y + 0.5);
    ctx.stroke();
  }

  function drawPanel() {
    var Type = MetaProgress.constructorOf(selected);
    var progress = E().progress();

    var panel = headerRect();
    drawAshPlate(panel, { live: 0.25, cut: 14 });

    // CLIPPED TO ITS OWN PLATE. A tower's real mesh is drawn at whatever height
    // its body wants, and the tall ones (the Rifleman, the Arcane Sniper) stand
    // straight out of the top of a 128px panel otherwise.
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x + 6, panel.y + 6, 92, panel.h - 12);
    ctx.clip();
    if (isPlayerSelected()) drawPlayerPortrait(panel.x + 52, panel.y + 60, 64);
    else drawTowerIcon(Type, panel.x + 52, panel.y + 66, 64);
    ctx.restore();

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "24px " + MENU_DISPLAY_FONT;
    ctx.fillStyle = "#f6d9b4";
    drawMenuText(E().name(), panel.x + 106, panel.y + 14, 2);

    ctx.font = "11px " + MENU_TECH_FONT;
    ctx.fillStyle = progress.atMax
      ? "rgba(" + ASH_LEY + ",0.92)" : "rgba(" + ASH_EMBER + ",0.9)";
    drawMenuText(levelLine(progress), panel.x + 106, panel.y + 44, 1.6);

    drawXpBar({ x: panel.x + 106, y: panel.y + 64, w: 232, h: 10 }, progress);

    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.8)";
    ctx.fillText(fitText(ctx, xpLine(progress), 236), panel.x + 106, panel.y + 82);

    var tree = treeButtonRect();
    var count = E().nodes().length;
    drawAshControl(tree, "TREE", {
      primary: true,
      detail: count ? (E().inventory().length + " / " + count + " BOUGHT")
                    : "NOTHING AUTHORED YET"
    });
  }

  function drawSlots() {
    var progress = E().progress();
    var loadout = E().equipped().map(function (id) { return id === null ? null : E().nodeOf(id); });

    ctx.textAlign = "left";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.7)";
    ctx.fillText("PERMANENT LOADOUT — " + progress.level + " of " +
      (isPlayerSelected()
        ? ("2 + LEVEL " + E().progress().level + " = " + E().openSlots() +
           " OF " + E().slotCount() + " SLOTS OPEN")
        : (E().slotCount() + " slots   ·   click a module to read it")),
      286, 230);

    // HOWEVER MANY THE ENTITY HAS -- five for a tower, seven for the Player.
    // It was `PERK_SLOTS` and so drew five of the Player's seven, which made
    // the caption above it ("6 of 7 slots open") a lie about the row under it.
    for (var i = 0; i < E().slotCount(); i++) {
      var r = slotRect(i);
      // OPEN IS `openSlots()`, NOT THE LEVEL. A tower's usable slots ARE its
      // level; the Player's are `2 + level`. This read the level for both, so a
      // level-4 Player was shown four open slots and three locked ones under a
      // caption that correctly said six of seven.
      var open = i < E().openSlots();
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
        // WHICH LEVEL OPENS THIS SLOT, and the two entities answer differently:
        // a tower's slot `i` opens at level `i + 1`, and the Player's at
        // `i + 1 − 2` because its first two are open from the start. Derived
        // from the same `2 + level` rule the band's caption prints, so the two
        // cannot say different things.
        var opensAt = isPlayerSelected()
          ? (i + 1 - MetaProgress.PLAYER_BASE_SLOTS) : (i + 1);
        drawMenuText("LEVEL " + opensAt, r.x + r.w / 2, r.y + 62, 1.1);
        ctx.textAlign = "left";
        continue;
      }

      if (node && !(drag && drag.fromSlot === i && drag.moved)) {
        // THE PINNED MODULE IS LIT IN ITS SLOT TOO, so the strip below the slot
        // reads as belonging to the module you are looking at rather than to
        // whichever slot the cursor happens to be near.
        var reading = detailNode === node.id;
        sigil(node.id, r.x + r.w / 2, r.y + 32, 15,
          "rgba(" + (reading ? ASH_GO : ASH_EMBER) + ",0.95)", node.icon);
        ctx.textAlign = "center";
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillStyle = reading ? "rgba(" + ASH_GO + ",0.95)"
          : "rgba(" + ASH_BONE + ",0.9)";
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

    // AND THE THIRD PLACE THE SAME ACTION IS OFFERED: under the slot the pinned
    // module is sitting in. A slot only ever holds an equipped module, so this
    // one is always the red UNEQUIP.
    var underSlot = slotActionRect();
    if (underSlot) {
      drawAshControl(underSlot, "UNEQUIP", { accent: ASH_STOP, active: true });
    }
  }

  function drawInventory() {
    var box = inventoryRect();
    var list = E().inventory();
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

      sigil(node.id, r.x + 24, r.y + r.h / 2, 11,
        "rgba(" + (item.equipped ? ASH_GO : ASH_EMBER) + ",0.9)", node.icon);

      ctx.textAlign = "left";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillStyle = item.equipped ? "rgba(" + ASH_GO + ",0.98)" : "#ffe6c4";
      ctx.fillText(fitText(ctx, node.name, r.w - 56), r.x + 44, r.y + 7);

      // ONE SHORT LINE, and never the whole description: the card only has to
      // be recognisable, and the numbers are in the panel on the right.
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.78)";
      ctx.fillText(fitText(ctx, shortOf(node), r.w - 56), r.x + 44, r.y + 24);

      if (item.equipped) {
        ctx.fillStyle = "rgba(" + ASH_GO + ",0.75)";
        ctx.fillRect(r.x + 3, r.y + 7, 2, r.h - 14);
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
  // --- WHAT IMPROVES THIS MODULE, AND BY HOW MUCH ----------------------------
  //
  // Every upgrade² whose parent is this node, whether it is bought or not.
  //
  // **AN UNBOUGHT ONE IS STILL LISTED, AND IS NOT DIMMED FOR BEING UNBOUGHT**
  // (2026-09-01, at the owner's word). Hiding it, or greying it to the point of
  // being unreadable, would answer "what improves this?" with "nothing" -- which
  // is exactly the question a player reading a module card is asking, and the
  // one the card could not answer before. What it shows for an unbought one is
  // what its FIRST rank would give, so the line is an offer rather than a
  // gap.
  //
  // **DIM MEANS "NOT APPLYING RIGHT NOW", and only that.** Two things are not
  // applying: a rank of zero, and a square that is owned while the module it
  // improves sits in no slot. Both are stated in words as well as in colour, so
  // the distinction never rests on a shade.
  function improvedBy(node) {
    if (!node) return [];
    var equipped = E().equipped().indexOf(node.id) !== -1;
    return E().squares().filter(function (sq) {
      return sq.parent === node.id;
    }).map(function (sq) {
      var rank = E().rankOf(sq.id);
      var max = sq.maxRank || 0;
      var active = rank > 0 && equipped;
      return {
        node: sq, rank: rank, maxRank: max,
        active: active,
        dormant: rank > 0 && !equipped,
        // WHAT IT IS DOING, or what it WOULD do. Both come from the content
        // file's own `valueAt`, so a retune moves this line with the effect and
        // there is no second copy of any figure here.
        text: rank > 0 ? valueText(sq, rank)
                       : ("rank 1 would give " + valueText(sq, 1))
      };
    });
  }

  // The block itself, drawn from `y` and answering how far it got. Shared by
  // the inventory card and the tree card, so the two cannot describe the same
  // module differently.
  function drawImprovedBy(x, y, width, node, maxRows) {
    var list = improvedBy(node);
    if (!list.length) return y;

    var live = list.filter(function (r) { return r.active; }).length;
    ctx.font = "10px " + MENU_TECH_FONT;
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.85)";
    drawMenuText("IMPROVED BY " + list.length +
      (live ? ("   ·   " + live + " APPLYING") : "   ·   NONE APPLYING"),
      x, y, 1.3);
    y += 17;

    list.slice(0, maxRows || list.length).forEach(function (row) {
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.fillStyle = row.active ? "rgba(" + ASH_LEY + ",0.95)"
        : row.dormant ? "rgba(" + ASH_EMBER + ",0.85)"
        : "rgba(" + ASH_BONE + ",0.8)";
      ctx.fillText(fitText(ctx, (row.active ? "✓ " : "· ") + row.node.name +
        "   " + row.rank + " / " + row.maxRank, width), x + 6, y);
      y += 14;

      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = row.active ? "rgba(" + ASH_BONE + ",0.85)"
                                 : "rgba(" + ASH_DUST + ",0.75)";
      y += wrapLeft(row.dormant
        ? (row.text + "  —  dormant, this module is in no slot")
        : row.text, x + 16, y, width - 16, 13, 3) * 13 + 5;
    });
    return y;
  }

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
    // THE MODULE'S OWN SUBTITLE WHEN IT HAS ONE, and the band it is grouped
    // under otherwise. Three of the Player's roots ARE their band -- "Intendant"
    // sitting under a heading reading INTENDANT said the same word twice and
    // told the reader nothing.
    drawMenuText((node.subtitle || BRANCH_LABEL[E().branchOf(node)]).toUpperCase(),
      d.x + 60, d.y + 48, 1.4);

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
    // A TOWER'S NODE STATES ITS LEVEL GATE EITHER WAY; A PLAYER MODULE HAS
    // NONE, so it says what it does need instead -- a slot to sit in, which is
    // the thing a Player level actually buys. Same rule the tree card follows.
    ctx.fillStyle = "rgba(" + ASH_LEY + ",0.8)";
    if (isPlayerSelected()) {
      drawMenuText("NEEDS A FREE SLOT  ·  " + E().openSlots() + " OF " +
        E().slotCount() + " OPEN", d.x + 20, y, 1.3);
    } else {
      drawMenuText(node.minLevel
        ? "NEEDS TOWER LEVEL " + node.minLevel
        : "NEEDS TOWER LEVEL 0", d.x + 20, y, 1.3);
    }
    y += 20;

    ctx.fillStyle = equippedAt !== -1
      ? "rgba(" + ASH_GO + ",0.95)" : "rgba(" + ASH_DUST + ",0.7)";
    drawMenuText(equippedAt !== -1
      ? "EQUIPPED — SLOT " + (equippedAt + 1)
      : "IN THE INVENTORY, DOING NOTHING", d.x + 20, y, 1.3);
    y += 24;

    y = drawImprovedBy(d.x + 20, y, d.w - 40, node);

    // AN UNEQUIPPED MODULE CHANGES NOTHING AT ALL, said once where it matters.
    if (equippedAt === -1) {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.6)";
      wrapLeft("Owning it is not using it — a module only affects a run while " +
        "it is in one of its slots.", d.x + 20, y, d.w - 40, 14, 3);
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
      var progress = E().progress();
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
    var node = E().nodeOf(drag.nodeId);
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
    var progress = E().progress();
    drawAshHeading(E().name().toUpperCase() + " TREE", E().heading(), 26, true);

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

    var list = E().nodes();
    var squares = E().squares();
    // EVERY LINK FIRST, THEN THE TOWER, THEN THE NODES ON TOP. The squares are
    // drawn last of all so a satellite is never hidden under the arm it hangs
    // off, and their links are drawn with the rest so nothing crosses a node it
    // does not belong to.
    drawTreeLinks(list);
    drawSquareLinks(squares);
    drawTreeCentre(Type);
    list.forEach(drawTreeNode);
    squares.forEach(drawSquareNode);

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
      "·   SMALL NODES ARE RANKED UPGRADES² — THEY NEED NO SLOT   ·   ESC BACK",
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

      // THE SECRET NODE HAS NO LINK AT ALL. It is neither a root nor a child:
      // what gates it is a set of conditions spread across the whole tree, and
      // a line to any one of them would be a lie about the other four. It
      // floats, and until it is revealed it floats as a `???`.
      if (node.secret) return;
      if (!parents.length) {
        var centre = treeToScreen(0, 0);
        strokeLink(centre, to, true);
        return;
      }
      parents.forEach(function (parentId) {
        var parent = E().nodeOf(parentId);
        if (!parent) return;
        var from = treeToScreen(nodePoint(parent).x, nodePoint(parent).y);
        strokeLink(from, to, E().owns(parentId));
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

  // A SQUARE'S LINKS, AND EACH ONE IS LIT ON ITS OWN.
  //
  // THIS IS HOW "PARTIALLY CONTRIBUTES" IS DRAWN. A fusion has two rank
  // prerequisites and each gets its own line: satisfied is lit, short is dark,
  // and a node you are halfway to is a node with one bright arm and one dim
  // one -- readable without opening the card. A square with no rank
  // prerequisite draws one line to the permanent upgrade it improves, lit when
  // that upgrade is bought.
  //
  // A FUSION ALSO DRAWS ITS SECOND RUNTIME PARENT, dimmer and dashed: those two
  // upgrades are what it needs EQUIPPED, which is a different question from what
  // it needs bought, and both belong on the picture.
  function drawSquareLinks(squares) {
    squares.forEach(function (node) {
      var to = treeToScreen(nodePoint(node).x, nodePoint(node).y);
      var reqs = node.requires || [];

      // **THE PLAYER'S SQUARES ALWAYS LINK TO THEIR MODULE**, whatever they
      // require; a tower's link to their requirement when they have one.
      //
      // The difference is a fact about the two trees rather than a choice. A
      // tower's square requires another square on the SAME arm, so that link is
      // short and says something the parent link would only repeat. Four of the
      // Player's need a rank from a completely different branch -- Réserve de
      // garnison wants Amortissement doux, three trunks away -- and drawing
      // those would put long lines straight across the tree to say what the
      // card already says with a tick and a cross.
      if (isPlayerSelected() || !reqs.length) {
        var parent = E().nodeOf(node.parent);
        if (parent) {
          var from = treeToScreen(nodePoint(parent).x, nodePoint(parent).y);
          strokeLink(from, to, E().owns(node.parent));
        }
        if (isPlayerSelected()) return;
      }

      reqs.forEach(function (req) {
        var other = E().squareOf(req.id);
        if (!other) return;
        var at = treeToScreen(nodePoint(other).x, nodePoint(other).y);
        strokeLink(at, to, E().rankOf(req.id) >= (req.rank || 1));
      });
    });
  }

  // A FUSION'S SECOND RUNTIME PARENT GETS NO LINE OF ITS OWN, and that is not
  // an omission (2026-09-01). It had a dashed one until the tree was spread out,
  // and the line turned out to be REDUNDANT in every case that exists: each
  // fusion's second requirement is itself a child of that second parent, so the
  // solid chain already runs back to it -- Series Ammunition needs Premium Lot,
  // and Premium Lot hangs off Commissioned Ammunition, which is the very node
  // the dashed line went to. Four long lines that said what four short ones
  // already said. The card states both parents and whether each is equipped,
  // which is the half a line could not say anyway.

  // THE FIVE STATES A SQUARE CAN BE IN, drawn the same way a perk's are and
  // read off the same one answer. `maxed` gets the ley colour a perk uses for
  // "equipped", because a square that is finished is the same kind of good news
  // -- and a DORMANT one, owned with its parent on the bench, is drawn hollow
  // so the player can see at a glance which of their squares are doing nothing.
  function drawSquareNode(node) {
    var p = treeToScreen(nodePoint(node).x, nodePoint(node).y);
    var r = SQUARE_R * view.zoom;
    var info = E().squareStateOf(node.id);
    var chosen = treeNode && treeNode.id === node.id && treeNodeKind === "square";

    var accent, alpha;
    if (info.state === "maxed") { accent = ASH_LEY; alpha = 1; }
    else if (info.rank > 0) { accent = ASH_EMBER; alpha = 1; }
    else if (info.state === "buyable") { accent = ASH_BONE; alpha = 0.95; }
    else if (info.state === "poor") { accent = ASH_EMBER; alpha = 0.5; }
    else { accent = ASH_DUST; alpha = 0.3; }

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = info.rank > 0
      ? (info.dormant ? "rgba(14,11,16,0.9)" : "rgba(34,24,20,0.96)")
      : "rgba(14,11,16,0.9)";
    ctx.fill();
    ctx.lineWidth = chosen ? 3 : (info.rank > 0 ? 2.2 : 1.4);
    ctx.strokeStyle = "rgba(" + accent + "," + (chosen ? 1 : alpha) + ")";
    ctx.stroke();

    sigil(node.id, p.x, p.y, r * 0.44, "rgba(" + accent + "," + alpha + ")", node.icon);

    // THE RANK, AS PIPS AROUND THE RIM. It is the one thing about a square that
    // a player needs from across the board -- how far along it is -- and a ring
    // of filled and hollow marks says it without any type to read.
    drawRankPips(p, r, info, accent);

    var wide = labelWidth(118);
    if (wide < LABEL_MIN_WIDTH) return;
    ctx.textAlign = "center";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_BONE + "," + Math.min(1, alpha + 0.25) + ")";
    ctx.fillText(fitText(ctx, node.name, wide), p.x, p.y + r + 12);

    ctx.font = "9px " + MENU_TECH_FONT;
    if (info.state === "maxed") {
      ctx.fillStyle = "rgba(" + ASH_LEY + ",0.8)";
      drawMenuText("MAX " + info.rank + "/" + info.maxRank, p.x, p.y + r + 26, 1);
    } else {
      ctx.fillStyle = "rgba(" + ASH_EMBER + ",0.7)";
      drawMenuText(info.rank + "/" + info.maxRank + "  ·  " +
        (info.nextCost || 0) + " ⬡", p.x, p.y + r + 26, 1);
    }
    ctx.textAlign = "left";
  }

  // One small mark per rank, spread over the top arc of the node. Filled for a
  // rank that is paid for, hollow for one that is not.
  function drawRankPips(p, r, info, accent) {
    var max = info.maxRank || 0;
    if (max <= 0) return;
    var spread = Math.PI * 0.9;
    var start = -Math.PI / 2 - spread / 2;
    var step = max > 1 ? spread / (max - 1) : 0;
    var reach = r + 5 * view.zoom;
    var dot = Math.max(1.2, 2.4 * view.zoom);
    for (var i = 0; i < max; i++) {
      var a = max > 1 ? start + i * step : -Math.PI / 2;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * reach, p.y + Math.sin(a) * reach, dot, 0, Math.PI * 2);
      if (i < info.rank) {
        ctx.fillStyle = "rgba(" + accent + ",0.95)";
        ctx.fill();
      } else {
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(" + accent + ",0.45)";
        ctx.stroke();
      }
    }
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
    if (isPlayerSelected()) drawPlayerPortrait(p.x, p.y, r * 1.5);
    else drawTowerIcon(Type, p.x, p.y, r * 1.5);
  }

  // THE FIVE STATES THE BRIEF NAMES, EACH ITS OWN COLOUR AND EACH READ OFF
  // TowerPerks.stateOf -- so the ring, the detail card and the purchase can
  // never disagree about why a node is dark.
  function drawTreeNode(node) {
    var p = treeToScreen(nodePoint(node).x, nodePoint(node).y);
    var r = NODE_R * view.zoom;
    var info = E().stateOf(node.id);
    var chosen = treeNode && treeNode.id === node.id;
    var equipped = E().equipped().indexOf(node.id) !== -1;

    var accent, alpha;
    if (info.state === "hidden") { accent = ASH_DUST; alpha = 0.35; }
    else if (info.state === "owned") { accent = equipped ? ASH_LEY : ASH_EMBER; alpha = 1; }
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

    // A HIDDEN NODE IS A QUESTION MARK AND NOTHING ELSE -- no name, no price,
    // no prerequisite, no icon of its own. `stateOf` answers `hidden` only for a
    // node carrying a `secret` block whose conditions are not all met, and those
    // are recomputed from the save every time they are asked, so a reset
    // correctly hides it again.
    if (info.state === "hidden") {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = Math.round(r * 0.9) + "px " + MENU_DISPLAY_FONT;
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.55)";
      ctx.fillText("?", p.x, p.y + 1);
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      return;
    }

    sigil(node.id, p.x, p.y, r * 0.44, "rgba(" + accent + "," + alpha + ")", node.icon);

    // The name under the node, and the price under that when it is not bought.
    // Hidden when zoomed far out: unreadable type over a big tree is noise.
    var room = labelWidth(128);
    if (room < LABEL_MIN_WIDTH) return;
    ctx.textAlign = "center";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(" + ASH_BONE + "," + Math.min(1, alpha + 0.25) + ")";
    ctx.fillText(fitText(ctx, node.name, room), p.x, p.y + r + 12);
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

    if (treeNodeKind === "square") { drawSquareDetail(d); return; }

    var info = E().stateOf(treeNode.id);

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
    // A TOWER'S NODE STATES ITS LEVEL GATE EITHER WAY, the zero case included --
    // every authored node is buyable at level 0 and a card that said nothing
    // would leave the player to infer it. A PLAYER MODULE has no level gate at
    // all (the brief: nothing beyond its parents' requirements), so it says
    // what it DOES need: a slot to sit in, which is what a Player level buys.
    ctx.fillStyle = "rgba(" + ASH_LEY + ",0.85)";
    if (isPlayerSelected()) {
      drawMenuText("NEEDS A FREE SLOT TO APPLY  ·  " + E().openSlots() +
        " OF " + E().slotCount() + " OPEN", d.x + 20, y, 1.3);
    } else {
      drawMenuText(treeNode.minLevel
        ? "NEEDS TOWER LEVEL " + treeNode.minLevel
        : "NEEDS TOWER LEVEL 0", d.x + 20, y, 1.3);
    }
    y += 20;
    if (treeNode.requires && treeNode.requires.length) {
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.8)";
      drawMenuText(treeNode.requires.length === 1 ? "REQUIRES" : "REQUIRES ALL OF",
        d.x + 20, y, 1.3);
      y += 18;
      ctx.font = "11px system-ui, sans-serif";
      treeNode.requires.forEach(function (req) {
        var parent = E().nodeOf(req);
        var have = E().owns(req);
        ctx.fillStyle = have
          ? "rgba(" + ASH_LEY + ",0.9)" : "rgba(240,120,110,0.9)";
        ctx.fillText((have ? "✓ " : "✗ ") + (parent ? parent.name : req),
          d.x + 28, y);
        y += 16;
      });
    }

    // AND WHAT IMPROVES IT, in the same words the inventory card uses. Capped at
    // three rows here: this card is shorter and the buy button is under it, so a
    // module with four squares shows three and the inventory card shows them all.
    y = drawImprovedBy(d.x + 20, y + 4, d.w - 40, treeNode, 3);

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

  // THE CARD FOR ONE UPGRADE-SQUARED NODE, and it prints everything the brief
  // asks a player to be able to read before spending: the rank it is at, the
  // rank it goes to, what THAT rank costs on its own, the resolved value now
  // and the resolved value next, which permanent upgrade owns it, every rank
  // requirement with the rank it has against the rank it needs, and both halves
  // of the trade in the node's own words.
  //
  // EVERY FIGURE IS DERIVED FROM THE MODEL, never re-computed here. `valueAt`
  // is the content file's own sentence, so a retune moves the card with the
  // effect; `upgrade2StateOf` answers the rank, the price and the reason, so
  // the button, the ring and the refusal cannot disagree.
  function drawSquareDetail(d) {
    var info = E().squareStateOf(treeNode.id);
    var node = treeNode;

    sigil(node.id, d.x + 34, d.y + 38, 16,
      "rgba(" + ASH_EMBER + ",0.95)", node.icon);
    ctx.font = "16px " + MENU_DISPLAY_FONT;
    ctx.fillStyle = "#f6d9b4";
    drawMenuText(fitText(ctx, node.name.toUpperCase(), d.w - 84), d.x + 60,
      d.y + 24, 1.5);

    // WHICH UPGRADE OWNS IT, and whether that upgrade is in the loadout right
    // now -- two different facts, both on the same line, because "bought" is
    // what unlocks the purchase and "equipped" is what makes it do anything.
    var parents = E().parentsOf(node);
    ctx.font = "10px " + MENU_TECH_FONT;
    ctx.fillStyle = "rgba(" + ASH_DUST + ",0.85)";
    drawMenuText(parents.length > 1 ? "FUSION — NEEDS BOTH EQUIPPED"
                                    : "IMPROVES", d.x + 60, d.y + 44, 1.2);

    var y = d.y + 62;
    ctx.font = "11px system-ui, sans-serif";
    parents.forEach(function (p) {
      ctx.fillStyle = p.equipped ? "rgba(" + ASH_LEY + ",0.95)"
        : p.owned ? "rgba(" + ASH_EMBER + ",0.85)" : "rgba(240,120,110,0.9)";
      ctx.fillText(fitText(ctx, (p.owned ? "✓ " : "✗ ") + p.name +
        (p.equipped ? "  · equipped" : p.owned ? "  · NOT EQUIPPED" : "  · not bought"),
        d.w - 40), d.x + 20, y);
      y += 15;
    });

    // RANK, AND WHAT THE NEXT ONE COSTS ON ITS OWN. Never a running total: the
    // price beside a rank is what that rank costs, and the line below says what
    // has been sunk in so far so the two can never be confused.
    y += 6;
    ctx.font = "11px " + MENU_TECH_FONT;
    ctx.fillStyle = "rgba(" + ASH_EMBER + ",0.9)";
    // THE PURSE IS NOT REPEATED HERE. It is already in the top-right corner of
    // this screen in 24px type, and spelling it again pushed this line past the
    // card's right edge, where it was simply cut off.
    drawMenuText("RANK " + info.rank + " / " + info.maxRank +
      (info.state === "maxed" ? "   ·   MAXIMUM RANK"
        : "   ·   NEXT RANK COSTS " + (info.nextCost || 0) + " ⬡"),
      d.x + 20, y, 1.2);
    y += 20;

    // THE RESOLVED VALUE NOW AND THE RESOLVED VALUE NEXT, both spelled out --
    // including the two nodes whose ranks are a table rather than a step, where
    // "per rank" would be a lie.
    ctx.font = "11px system-ui, sans-serif";
    if (info.rank > 0) {
      ctx.fillStyle = "rgba(" + ASH_BONE + ",0.9)";
      y += wrapLeft("NOW  " + valueText(node, info.rank),
        d.x + 20, y, d.w - 40, 14, 3) * 14 + 2;
    }
    if (info.nextRank) {
      ctx.fillStyle = "rgba(" + ASH_LEY + ",0.9)";
      y += wrapLeft("RANK " + info.nextRank + "  " + valueText(node, info.nextRank),
        d.x + 20, y, d.w - 40, 14, 3) * 14 + 2;
    }

    // BOTH HALVES OF THE TRADE, and the downside is STATED even when there is
    // none -- "no downside" is information, and a blank line is not.
    y += 6;
    ctx.fillStyle = "rgba(" + ASH_BONE + ",0.8)";
    y += wrapLeft(node.upside || "", d.x + 20, y, d.w - 40, 14, 3) * 14 + 2;
    ctx.fillStyle = node.downside
      ? "rgba(230,150,120,0.9)" : "rgba(" + ASH_DUST + ",0.65)";
    y += wrapLeft(node.downside || "No downside.", d.x + 20, y, d.w - 40, 14, 3) * 14;

    // EVERY REQUIREMENT, MET OR NOT, WITH ITS OWN PROGRESS. Never a summary and
    // never short-circuited: a fusion at one of two shows the one it has beside
    // the one it lacks, which is what "partially contributes" means.
    if (info.requirementsTotal) {
      y += 8;
      ctx.font = "10px " + MENU_TECH_FONT;
      ctx.fillStyle = "rgba(" + ASH_DUST + ",0.8)";
      drawMenuText("REQUIRES " + info.requirementsMet + " / " +
        info.requirementsTotal + " — NEEDS ALL", d.x + 20, y, 1.2);
      y += 16;
      ctx.font = "11px system-ui, sans-serif";
      info.requirements.forEach(function (req) {
        ctx.fillStyle = req.met
          ? "rgba(" + ASH_LEY + ",0.9)" : "rgba(240,120,110,0.9)";
        ctx.fillText(fitText(ctx, (req.met ? "✓ " : "✗ ") + req.name +
          " — rank " + req.have + " / " + req.need, d.w - 48), d.x + 28, y);
        y += 15;
      });
    }

    // OWNED AND DOING NOTHING, which is a legal state and has to be said out
    // loud -- a player who cannot see it would read the tree as broken.
    if (info.dormant) {
      y += 6;
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(230,180,110,0.95)";
      wrapLeft("Bought and DORMANT — it applies again the moment " +
        parentLabel(node) + " is back in the loadout.",
        d.x + 20, y, d.w - 40, 14, 3);
      y += 34;
    }

    if (info.reason) {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(240,150,120,0.9)";
      wrapLeft(info.reason, d.x + 20, y + 4, d.w - 40, 14, 3);
    }

    var button = buyRect();
    if (info.state === "maxed") {
      drawAshControl(button, "MAXIMUM RANK",
        { disabled: true, detail: info.maxRank + " / " + info.maxRank });
    } else if (info.state === "buyable") {
      drawAshControl(button, "BUY RANK " + info.nextRank + "  " +
        info.nextCost + " ⬡", { primary: true });
    } else {
      drawAshControl(button, "LOCKED", { disabled: true });
    }
  }

  // The content file's own sentence for a rank, with a fallback so a node
  // authored without `valueAt` still prints something honest.
  function valueText(node, rank) {
    if (typeof node.valueAt !== "function") return "rank " + rank;
    return node.valueAt(rank);
  }

  function drawResetControl() {
    var r = resetTreeRect();
    var owned = E().resetCount();
    var ready = E().resetReadyAt();
    var cooling = ready > Date.now();

    // EVERY FIGURE, BEFORE THE SECOND PRESS. The brief is explicit that the
    // player must see the gross refund, the node count, the commission, the net
    // and the delay before confirming -- and all five are derived from the same
    // rate the model charges, so the quote cannot be a different sum from the
    // transaction.
    var gross = E().refundValue();
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
         net + " ⬡. Clears this loadout and cools down for " + hours +
         " hour" + (hours === 1 ? "" : "s") + ". Level and XP are never touched.")
      : ("Refunds every node bought here at its full price, less a " +
         MetaProgress.TREE_RESET_FEE_PER_NODE + " ⬡ commission a node. Clears " +
         "the loadout and cools down for " + hours + " hour" +
         (hours === 1 ? "" : "s") + ". Level and XP are never touched."),
      r.x, r.y - 68, r.w, 13, 5);
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
    slotActionRect: slotActionRect,
    slotPipState: slotPipState,
    branchOf: function (nodeId) {
      var node = selected ? E().nodeOf(nodeId) : null;
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
    // EITHER KIND, BY ID, and the kind is remembered exactly as a click would
    // have set it -- so a test that pins a square and presses the buy button is
    // pressing the button a player presses.
    selectNode: function (nodeId) {
      if (!selected) { treeNode = null; return null; }
      var square = E().squareOf(nodeId);
      if (square) { treeNode = square; treeNodeKind = "square"; return square; }
      treeNode = E().nodeOf(nodeId);
      treeNodeKind = "perk";
      return treeNode;
    },
    nodeAtPoint: function (x, y) {
      var hit = nodeAt(x, y);
      return hit ? { id: hit.node.id, kind: hit.kind } : null;
    },
    resetNodeCount: function () { return selected ? E().resetCount() : 0; },
    // What the "IMPROVED BY" block on a module's card is listing, as data --
    // so a test can assert what the card says without reading pixels.
    improvedBy: function (nodeId) {
      var node = selected ? E().nodeOf(nodeId) : null;
      return improvedBy(node).map(function (row) {
        return { id: row.node.id, rank: row.rank, maxRank: row.maxRank,
                 active: row.active, dormant: row.dormant, text: row.text };
      });
    },
    state: function () {
      return {
        selected: selected, flash: flash, node: treeNode ? treeNode.id : null,
        nodeKind: treeNode ? treeNodeKind : null,
        detail: detailNode, hover: hoverNode,
        confirmReset: confirmReset, view: { x: view.x, y: view.y, zoom: view.zoom },
        scroll: invScroll, dragging: drag ? drag.nodeId : null
      };
    }
  };
})();
