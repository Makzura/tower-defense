// ---------------------------------------------------------------------------
// THE PLAYTEST CHEAT PANEL — DELETE THIS FILE BEFORE THE GAME SHIPS
//
// It exists to make the permanent progression testable in an afternoon instead
// of over thirty-five runs: coins from nowhere, levels set by hand, whole trees
// bought, reset cooldowns cleared, and a live readout of the xp a wave is about
// to pay and how it is being split.
//
// ===========================================================================
// HOW TO REMOVE IT, COMPLETELY, IN THREE DELETES
//
//   1. this file
//   2. its ONE <script> tag in index.html
//   3. `debugPatch` in js/meta.js (the block marked as this panel's one door)
//
// Nothing else in the repository refers to any of the three. No tower knows it
// exists, no screen calls it, `game.js` was not edited for it, and there is no
// flag to hunt for afterwards. That is the whole design constraint.
// ===========================================================================
//
// WHY IT LOADS FROM `index.html` AND NOT FROM `sandbox.html`, which is where
// AGENTS.md says a testing aid belongs. The sandbox deliberately banks NO
// permanent progression -- `TowerXP.setEnabled(false)` at its boot -- so it is
// exactly the one surface on which none of this can be tested. Coins, levels,
// trees and how a perked tower actually plays are all shipping-page state.
// AGENTS.md leaves this case open in as many words: the `debug-` prefix skip in
// `tests/harness.js` "is still worth keeping for anything that must load from
// index.html". This is that.
//
// WHAT THAT PREFIX BUYS, and it is why the name matters:
//
//   * `tests/harness.js` skips every `js/debug-*.js` when it reads the script
//     list out of index.html, so no suite ever loads this and no test can come
//     to depend on it;
//   * `tools/check-script-manifest.js` exempts the same pattern, so deleting
//     the file does not fail the manifest gate on the way out.
//
// TWO HOUSE RULES IT KEEPS. **DOM, not canvas** -- nothing here is in the
// render loop or the input handling, and it is visibly not part of the game.
// **Every mutation goes through MetaProgress and TowerPerks** -- this file
// never touches the profile object, so no cheat can produce a save the game
// would refuse to load. Coins-from-nowhere and xp-that-goes-down are the only
// two things the shipping API will not do, and they go through the single
// `debugPatch` door rather than around it.
//
// The panel is HIDDEN until asked for. A dim chip in the bottom-left corner and
// the backtick key open it, and backtick is a key `js/game.js` uses on no
// screen -- checked, not assumed.
// ---------------------------------------------------------------------------

(function () {

  // WHICH KEY OPENS IT, and it is a list because the physical key next to "1"
  // is not the same character on every layout: backtick on QWERTY, "²" on the
  // French AZERTY this project is written on, and neither of them is what a
  // synthetic event necessarily carries. `event.code` is the physical key and
  // is the same on all of them, so it is checked as well -- and F8 is there for
  // a layout that has neither.
  var TOGGLE_KEYS = ["`", "~", "\u00b2", "F8"];
  var TOGGLE_CODES = ["Backquote", "F8"];

  var root = null;          // the panel, or null before it is built
  var chip = null;          // the little corner tab that opens it
  var open = false;
  var readout = null;       // the live state block
  var poll = null;

  // --- state helpers ---------------------------------------------------------
  //
  // Everything below goes through MetaProgress and TowerPerks. `patch` is the
  // one exception and is the documented door, not a shortcut around them.

  function snap() { return MetaProgress.snapshot(); }

  function owned() { return snap().owned; }

  // A partial profile, merged and re-sanitised. Rows are copied out of the live
  // snapshot first so a patch that names one tower does not blank the others.
  function patch(build) {
    var current = snap();
    var progress = {};
    current.owned.forEach(function (id) {
      var row = current.progress[id];
      progress[id] = {
        xp: row.xp, nodes: row.nodes.slice(),
        equipped: row.equipped.slice(), resetAt: row.resetAt
      };
    });
    var draft = { coins: current.coins, progress: progress };
    build(draft, current);
    MetaProgress.debugPatch(draft);
    refresh();
  }

  function giveCoins(amount) {
    patch(function (draft) { draft.coins = Math.max(0, draft.coins + amount); });
  }

  // SET, not add -- which is the whole reason this file needs a door. The
  // shipping API cannot lower xp, and "put every tower back to level 0" is the
  // single most useful thing a progression playtest asks for.
  function setLevel(ids, level) {
    var thresholds = MetaProgress.XP_THRESHOLDS;
    var xp = level <= 0 ? 0 : thresholds[Math.min(level, thresholds.length) - 1];
    patch(function (draft) {
      ids.forEach(function (id) {
        if (!draft.progress[id]) return;
        draft.progress[id].xp = xp;
        // Slots close when a level drops, and `sanitise` is what enforces that
        // -- it empties any slot past the level. Clearing here as well would be
        // a second copy of the same rule.
      });
    });
  }

  function addXp(ids, amount) {
    ids.forEach(function (id) { MetaProgress.addXp(id, amount); });
    refresh();
  }

  function buyWholeTree(ids) {
    patch(function (draft) {
      ids.forEach(function (id) {
        if (!draft.progress[id]) return;
        draft.progress[id].nodes = TowerPerks.nodes(id).map(function (n) {
          return n.id;
        });
      });
    });
  }

  function clearTrees(ids) {
    patch(function (draft) {
      ids.forEach(function (id) {
        if (!draft.progress[id]) return;
        draft.progress[id].nodes = [];
        draft.progress[id].equipped = [];
      });
    });
  }

  function clearCooldowns() {
    patch(function (draft) {
      Object.keys(draft.progress).forEach(function (id) {
        draft.progress[id].resetAt = 0;
      });
    });
  }

  // FILL EVERY OPEN SLOT with whatever that tower owns, in tree order. The
  // fastest way to see a loadout on the board, and it goes through the real
  // `equipPerk` so a slot the level has not opened still refuses.
  function fillLoadouts(ids) {
    ids.forEach(function (id) {
      var level = MetaProgress.progressOf(id).level;
      var have = TowerPerks.inventory(id);
      for (var slot = 0; slot < level && slot < have.length; slot++) {
        MetaProgress.equipPerk(id, have[slot].id, slot);
      }
    });
    refresh();
  }

  function clearLoadouts(ids) {
    ids.forEach(function (id) {
      for (var slot = 0; slot < MetaProgress.PERK_SLOTS; slot++) {
        MetaProgress.unequipPerk(id, slot);
      }
    });
    refresh();
  }

  // --- the run ---------------------------------------------------------------
  //
  // These reach into `js/game.js`'s globals the way `js/sandbox/sandbox.js`
  // does, because that is what they are: the run's own state, and there is no
  // save to corrupt.

  function inRun() { return typeof screen !== "undefined" && screen === "play"; }

  function giveMana(amount) {
    if (!inRun()) return;
    cash += amount;
    if (typeof refreshBlockReason === "function") refreshBlockReason();
    refresh();
  }

  // CLOSE THE WAVE THROUGH THE GAME'S OWN DOOR, so it pays its clear bounty,
  // settles the farms and credits its xp exactly as a real one does. That is
  // the point: this is how the xp curve gets tested without playing the curve.
  function finishWave() {
    if (!inRun() || typeof endWave !== "function") return;
    endWave(3);
    refresh();
  }

  function healBase() {
    if (!inRun()) return;
    baseHp = BASE_MAX_HP;
    gameOver = false;
    refresh();
  }

  // --- the panel -------------------------------------------------------------

  function css(el, style) {
    Object.keys(style).forEach(function (k) { el.style[k] = style[k]; });
    return el;
  }

  function make(tag, style, text) {
    var el = document.createElement(tag);
    if (style) css(el, style);
    if (text !== undefined) el.textContent = text;
    return el;
  }

  var PANEL = {
    position: "fixed", left: "12px", bottom: "12px", width: "320px",
    maxHeight: "82vh", overflowY: "auto", zIndex: "99999",
    background: "rgba(10,8,12,0.96)", color: "#e8d3bd",
    border: "1px solid rgba(240,150,78,0.45)", borderRadius: "4px",
    font: "12px system-ui, sans-serif", padding: "10px 12px 14px",
    boxShadow: "0 8px 28px rgba(0,0,0,0.6)"
  };

  var BTN = {
    display: "inline-block", margin: "2px 4px 2px 0", padding: "4px 8px",
    background: "rgba(38,30,34,0.95)", color: "#ffe6c4",
    border: "1px solid rgba(240,150,78,0.4)", borderRadius: "3px",
    cursor: "pointer", font: "11px system-ui, sans-serif"
  };

  var LABEL = {
    display: "block", margin: "10px 0 3px", color: "rgba(240,150,78,0.85)",
    font: "600 10px/1.4 ui-monospace, monospace", letterSpacing: "0.09em",
    textTransform: "uppercase"
  };

  function button(text, onClick) {
    var b = make("button", BTN, text);
    b.addEventListener("click", function (e) {
      e.preventDefault();
      onClick();
    });
    return b;
  }

  function row(parent) {
    return parent.appendChild(make("div", { margin: "1px 0" }));
  }

  function label(parent, text) {
    parent.appendChild(make("div", LABEL, text));
  }

  // Which towers a command applies to: the one picked in the dropdown, or all
  // of them. One control rather than a pair of buttons per command.
  var scopeSelect = null;

  function scope() {
    var pick = scopeSelect && scopeSelect.value;
    return (!pick || pick === "*") ? owned() : [pick];
  }

  function build() {
    root = make("div", PANEL);

    var head = make("div", {
      display: "flex", justifyContent: "space-between",
      alignItems: "baseline", marginBottom: "2px"
    });
    head.appendChild(make("strong", { color: "#f0a45c", fontSize: "12px" },
      "CHEATS — playtest only"));
    var close = make("span", { cursor: "pointer", color: "rgba(186,158,140,0.8)" }, "✕");
    close.addEventListener("click", function () { toggle(false); });
    head.appendChild(close);
    root.appendChild(head);

    root.appendChild(make("div", {
      color: "rgba(186,158,140,0.65)", fontSize: "10px", marginBottom: "4px"
    }, "Delete js/debug-cheats.js, its script tag and MetaProgress.debugPatch " +
       "to remove entirely."));

    // --- scope ---------------------------------------------------------------
    label(root, "Applies to");
    scopeSelect = make("select", {
      width: "100%", padding: "3px", background: "rgba(24,18,22,0.95)",
      color: "#e8d3bd", border: "1px solid rgba(240,150,78,0.3)",
      font: "11px system-ui, sans-serif"
    });
    root.appendChild(scopeSelect);
    fillScope();

    // --- coins ---------------------------------------------------------------
    label(root, "Meta coins");
    var coinRow = row(root);
    var coinInput = make("input", {
      width: "72px", padding: "3px", marginRight: "6px",
      background: "rgba(24,18,22,0.95)", color: "#e8d3bd",
      border: "1px solid rgba(240,150,78,0.3)", font: "11px system-ui, sans-serif"
    });
    coinInput.type = "number";
    coinInput.value = "500";
    coinRow.appendChild(coinInput);
    coinRow.appendChild(button("Give", function () {
      giveCoins(parseInt(coinInput.value, 10) || 0);
    }));
    coinRow.appendChild(button("+100", function () { giveCoins(100); }));
    coinRow.appendChild(button("+2000", function () { giveCoins(2000); }));
    coinRow.appendChild(button("Zero", function () {
      patch(function (draft) { draft.coins = 0; });
    }));

    // --- levels --------------------------------------------------------------
    label(root, "Tower level");
    var levelRow = row(root);
    [0, 1, 2, 3, 4, 5].forEach(function (n) {
      levelRow.appendChild(button("Lv " + n, function () { setLevel(scope(), n); }));
    });
    var xpRow = row(root);
    xpRow.appendChild(button("+1 000 XP", function () { addXp(scope(), 1000); }));
    xpRow.appendChild(button("+5 000 XP", function () { addXp(scope(), 5000); }));

    // --- trees ---------------------------------------------------------------
    label(root, "Trees");
    var treeRow = row(root);
    treeRow.appendChild(button("Buy every node", function () { buyWholeTree(scope()); }));
    treeRow.appendChild(button("Clear tree", function () { clearTrees(scope()); }));
    var cdRow = row(root);
    cdRow.appendChild(button("Clear reset cooldowns", clearCooldowns));

    // --- loadout -------------------------------------------------------------
    label(root, "Perk loadout");
    var loadRow = row(root);
    loadRow.appendChild(button("Fill open slots", function () { fillLoadouts(scope()); }));
    loadRow.appendChild(button("Empty slots", function () { clearLoadouts(scope()); }));

    // --- roster and profile --------------------------------------------------
    label(root, "Roster & profile");
    var rosterRow = row(root);
    rosterRow.appendChild(button("Unlock all towers", function () {
      MetaProgress.unlockAll();
      if (typeof rebuildBuildBar === "function") rebuildBuildBar();
      fillScope();
      refresh();
    }));
    var wipeRow = row(root);
    wipeRow.appendChild(button("Reset save", resetSave));

    // --- the run -------------------------------------------------------------
    label(root, "This run");
    var runRow = row(root);
    runRow.appendChild(button("+50 000 mana", function () { giveMana(50000); }));
    runRow.appendChild(button("Finish wave", finishWave));
    runRow.appendChild(button("Heal base", healBase));

    // --- readout -------------------------------------------------------------
    label(root, "State");
    readout = make("pre", {
      margin: "0", whiteSpace: "pre-wrap", lineHeight: "1.45",
      font: "10px/1.45 ui-monospace, monospace", color: "rgba(186,158,140,0.9)"
    });
    root.appendChild(readout);

    document.body.appendChild(root);
    refresh();
  }

  // BACK TO A FIRST RUN, and it is more than `MetaProgress.reset()`.
  //
  // The profile is only half of what a save-reset has to undo. A player wiping
  // one mid-run is otherwise left on a board playing under a FROZEN loadout of
  // perks the profile no longer contains, with a healing ledger that still
  // unlocks the Siphon's B5, a death-denial slot still claimed, a C network
  // still standing and an Upgrades screen still pointed at a tower that may no
  // longer be owned. Every one of those is session state rather than saved
  // state, so none of it goes when the profile does.
  //
  // So this leaves the run first and then clears the four session-scoped
  // singletons a fresh boot would not have. Each is guarded: this file loads
  // only on index.html and must not assume any particular page's globals.
  function resetSave() {
    if (!window.confirm(
      "Reset the save?\n\nCoins, owned towers, the build bar, every tower's " +
      "level, xp, bought upgrades and loadout — all of it goes, and the run " +
      "in progress is left. This cannot be undone.")) return;

    // THE RUN FIRST, because leaving it is what releases the frozen loadout --
    // and a loadout frozen from a profile that is about to stop existing is
    // exactly the stale state this button is for.
    if (typeof openMenu === "function") openMenu();

    // THE PROFILE, through the model's own door.
    MetaProgress.reset();

    // AND THE SESSION LEDGERS a fresh boot would have empty. `restartGame`
    // clears all of these on the way INTO a run, so this only matters for what
    // the menu screens read before the next one -- which is precisely where a
    // player looks straight after resetting.
    if (typeof HealingLedger !== "undefined") HealingLedger.reset();
    if (typeof DeathDenial !== "undefined") DeathDenial.reset();
    if (typeof Farms !== "undefined") Farms.reset();
    if (typeof TowerPerks !== "undefined") TowerPerks.releaseRun();

    // The build bar is derived from the profile, so it has to be rebuilt; the
    // Upgrades screen re-derives which tower it is showing when it is opened.
    if (typeof rebuildBuildBar === "function") rebuildBuildBar();

    fillScope();
    refresh();
  }

  function fillScope() {
    if (!scopeSelect) return;
    var keep = scopeSelect.value;
    scopeSelect.innerHTML = "";
    var all = make("option", null, "every owned tower");
    all.value = "*";
    scopeSelect.appendChild(all);
    owned().forEach(function (id) {
      var Type = MetaProgress.constructorOf(id);
      var opt = make("option", null, (Type ? Type.DISPLAY_NAME : id) + "  (" + id + ")");
      opt.value = id;
      scopeSelect.appendChild(opt);
    });
    if (keep) scopeSelect.value = keep;
  }

  // THE READOUT IS THE HALF THAT IS NOT A CHEAT. Levels and coins can be read
  // off the Upgrades screen; the wave's xp budget and how it is being split
  // cannot be read anywhere, and they are the two numbers a progression
  // playtest is actually about.
  function refresh() {
    if (!readout) return;
    var lines = [];
    var s = snap();
    lines.push("coins  " + s.coins);

    s.owned.forEach(function (id) {
      var p = s.progress[id];
      var Type = MetaProgress.constructorOf(id);
      var name = (Type ? Type.DISPLAY_NAME : id);
      var bar = p.equipped.map(function (n, i) {
        return i < p.level ? (n ? "#" : ".") : "x";
      }).join("");
      lines.push(
        pad(name, 14) + "L" + p.level +
        "  " + pad(String(Math.floor(p.xp)), 6) + "xp" +
        "  " + bar +
        "  " + p.nodes.length + "/" + TowerPerks.nodes(id).length + " nodes");
    });

    if (typeof TowerXP !== "undefined") {
      var waves = (typeof WAVES !== "undefined") ? WAVES.length : 0;
      var n = (typeof waveIndex !== "undefined") ? waveIndex + 1 : 1;
      var scale = (typeof xpDifficultyScale === "function") ? xpDifficultyScale() : 1;
      lines.push("");
      lines.push("xp banked: " + (TowerXP.isEnabled() ? "on" : "OFF (sandbox)"));
      if (waves) {
        lines.push("wave " + n + "/" + waves + " pays " +
          TowerXP.waveBudget(n, waves, scale).toFixed(1) + " xp" +
          "   (run " + TowerXP.runBudget(waves, scale).toFixed(0) + ")");
      }
      var shares = TowerXP.currentShares();
      var ids = Object.keys(shares);
      lines.push(ids.length
        ? ("split  " + ids.map(function (id) {
            return id + " " + Math.round(shares[id] * 100) + "%";
          }).join("  "))
        : "split  nothing invested this wave yet");
    }

    readout.textContent = lines.join("\n");
  }

  function pad(text, width) {
    while (text.length < width) text += " ";
    return text;
  }

  // --- opening and closing ---------------------------------------------------

  function toggle(next) {
    open = (next === undefined) ? !open : !!next;
    if (open && !root) build();
    if (root) root.style.display = open ? "block" : "none";
    if (chip) chip.style.opacity = open ? "0" : "0.5";
    if (open) {
      fillScope();
      refresh();
      if (!poll) poll = setInterval(refresh, 500);
    } else if (poll) {
      clearInterval(poll);
      poll = null;
    }
  }

  function buildChip() {
    chip = make("div", {
      position: "fixed", left: "10px", bottom: "8px", zIndex: "99998",
      font: "10px ui-monospace, monospace", color: "rgba(240,150,78,0.8)",
      background: "rgba(10,8,12,0.7)", padding: "2px 6px", borderRadius: "3px",
      border: "1px solid rgba(240,150,78,0.25)", cursor: "pointer",
      opacity: "0.5", userSelect: "none"
    }, "\u00b2 / ` cheats");
    chip.addEventListener("click", function () { toggle(true); });
    chip.addEventListener("mouseenter", function () {
      if (!open) chip.style.opacity = "1";
    });
    chip.addEventListener("mouseleave", function () {
      if (!open) chip.style.opacity = "0.5";
    });
    document.body.appendChild(chip);
  }

  // A SECOND `keydown` LISTENER, NOT A HOOK INTO `onKeyDown`. Two listeners on
  // `window` both run, so this needs no edit to js/game.js -- which is the
  // whole point of a file that has to be deletable in one move. Backtick is a
  // key the game reads on no screen, checked rather than assumed, so nothing
  // is being stolen from it.
  //
  // The same INPUT/TEXTAREA guard the game's own handler uses, because this
  // panel HAS an input and typing a backtick into it must not close the panel
  // out from under the cursor.
  window.addEventListener("keydown", function (event) {
    var el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
    if (TOGGLE_KEYS.indexOf(event.key) === -1 &&
        TOGGLE_CODES.indexOf(event.code) === -1) return;
    if (event.preventDefault) event.preventDefault();
    toggle();
  });

  window.addEventListener("load", function () {
    buildChip();
    if (typeof console !== "undefined" && console.log) {
      console.log("[cheats] playtest panel: press the key left of 1 " +
        "(\u00b2 on AZERTY, ` on QWERTY), or F8, or click the chip. " +
        "Delete js/debug-cheats.js to remove it.");
    }
  });
})();
