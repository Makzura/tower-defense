// ---------------------------------------------------------------------------
// Sandbox mode
//
// Loaded only by sandbox.html, never by index.html. It does NOT reimplement
// the game: js/game.js is running underneath in full, with the real path,
// enemies, bullets, towers, placement rules, target claiming, base HP and
// loss condition. The sandbox only changes who decides three things:
//
//   money    -- infinite, so placement is never gated on cash
//   spawning -- you spawn enemies on demand; the wave schedule is off by
//               default (a checkbox turns the real one back on)
//   roster   -- every tower type is in the build bar
//
// Everything else is untouched, which is the point: what you learn here
// about a tower is true in the shipping game.
//
// Structure follows the house rule for a testing aid -- all DOM, no canvas
// drawing in the game's render loop except one clearly-scoped overlay, and
// nothing in js/game.js was changed to accommodate this file. It hooks the
// game by wrapping its public functions, not by editing them.
// ---------------------------------------------------------------------------

(function () {

  // Big enough to never run out, small enough to stay readable on the HUD.
  var SANDBOX_CASH = 999999;

  // (The SCALE workaround that used to live here is gone: the gunner and
  // Longshot were once authored in incompatible u.l. regimes and the sandbox
  // reconciled them locally. As of 2026-07-27 the whole game is authored
  // against the 100 u.l. reference tower, so there is nothing left to
  // reconcile -- see js/units.js and the AGENTS.md change log.)

  var els = {};
  var overlay = { range: true, deadzone: true, footprint: true, labels: true };
  var autoWaves = false;

  // WHICH wave is being watched on its own, or null for "run the campaign".
  //
  // The workbench's reason for existing is to reach a board state quickly, and
  // "wave 27, please" is the state a schedule is most often wanted for -- there
  // is no other way to see it here short of sitting through twenty-six waves at
  // 20x. So the picker below can start the schedule anywhere in it, and this
  // holds the case where the answer to "and then?" is "nothing": the wave plays
  // out and the schedule parks itself rather than rolling into the next one.
  //
  // It is an INDEX into the active schedule, so it is cleared by anything that
  // changes which schedule that is -- see the difficulty dropdown.
  var soloWave = null;

  // Switch spawning off, leaving whatever is already on the road walking.
  //
  // `waveIndex = WAVES.length` is this file's long-standing way of saying "the
  // scheduler has nothing left to deploy" (see the boot block at the bottom),
  // and `allWavesDeployed` is deliberately NOT set with it: js/game.js states
  // that only the scheduler exhausting itself may set that flag, because it is
  // what the victory test reads and a parked workbench has not won anything.
  function parkSchedule() {
    waveIndex = WAVES.length;
    waveSpawned = 0;
    waveCountdown = 0;
    waveElapsed = 0;
    allWavesDeployed = false;
  }

  // While true, gold is re-topped every step -- the usual sandbox behaviour,
  // so placement is never gated on price. It has to be switchable, because
  // some things can only be tested at a SPECIFIC amount of gold (the beam
  // tower's A5 scales off the live bank) and a permanent top-up would
  // overwrite whatever you set on the very next frame.
  var lockGold = true;

  // Gold values worth jumping straight to: the A5 tier boundaries, where
  // per-charge gain and the gold cap step up, and where its AD bonus crosses
  // from linear into logarithmic.
  var GOLD_PRESETS = [0, 10000, 50000, 100000, 200000, 400000, 800000];

  // 10 000 is the beam tower's B5 gate; the rest bracket it.
  var BASE_HP_PRESETS = [1, 100, 1000, 10000, 20000];

  function $(id) { return document.getElementById(id); }

  function log(message) {
    var line = document.createElement("div");
    line.textContent = message;
    els.log.insertBefore(line, els.log.firstChild);
    while (els.log.childNodes.length > 40) els.log.removeChild(els.log.lastChild);
  }

  // --- roster ---------------------------------------------------------------

  // Every tower type the sandbox offers. Dropping a constructor in here is
  // all it takes -- the bar, the sidebar, placement, inspection and selling
  // all read it from the same list. Same extension point the real build bar
  // uses (see AGENTS.md).
  // The gunner (Tower) was removed on 2026-07-30 with its deletion from the
  // game. The sandbox's promise is that what you learn here is true in the
  // shipping game, so a tower nobody can build must not be on this bar either.
  // The Summoner joined on 2026-08-09 with the rest of the game. Same promise
  // as the line above about the gunner, pointed the other way: a tower you CAN
  // build in the shipping game has to be on this bar, or the workbench stops
  // being a truthful preview of it.
  // SIX ON THE WORKBENCH AGAINST FIVE IN THE GAME, since 2026-08-27. The
  // shipping bar is five slots and the armoury decides which five of the
  // owned types fill them; a workbench has no coins to spend, so it shows
  // every type there is and its bar is one slot longer. That divergence is
  // the same kind as the 100 000 base HP and the 20x speed -- the sandbox is
  // not a preview of the BAR, it is a preview of the TOWERS.
  var ROSTER = [Smasher, LongshotTower, BeamTower, Soldier, BlubTower, FarmTower];

  function installRoster() {
    for (var i = 0; i < ROSTER.length; i++) {
      BUILD_SLOTS[i] = ROSTER[i];
    }
    // The bar's width and its left edge are derived from the slot count at
    // load, so a longer roster has to re-derive them or the extra slot is
    // drawn off the end of a bar that is still centred for five.
    BAR_WIDTH = BUILD_SLOTS.length * SLOT_SIZE + (BUILD_SLOTS.length - 1) * SLOT_GAP;
    BAR_X = (VIEW_WIDTH - BAR_WIDTH) / 2;
  }

  // --- the extended speed ladder -------------------------------------------

  // 5x AND 10x, ON TOP OF THE GAME'S OWN 1x/2x/3x (2026-08-09, at the owner's
  // request). The shipping ladder is deliberately untouched: this appends to
  // it, so the sandbox button cycles 1 → 2 → 3 → 5 → 10 → 1 and every
  // multiple the game ships with keeps its place in the order.
  //
  // It is done by EXTENDING THE GAME'S ARRAY rather than by replacing the
  // button, because the whole point of gameSpeed's design is that speed is
  // applied in exactly one place -- how many fixed steps frame() runs, never a
  // scaled dt (see the note on GAME_SPEEDS in js/game.js). A sandbox-only
  // second implementation would be a second place for that to be got wrong,
  // and the workbench would stop being a truthful preview of the loop.
  //
  // Why the workbench and not the game: a sandbox exists to reach a board state
  // quickly, and at 10x a two-minute wave is twelve seconds. In a real run the
  // same button is a difficulty setting, because nobody can react at 10x.
  var SANDBOX_SPEEDS = [5, 10, 20];

  function installSpeeds() {
    SANDBOX_SPEEDS.forEach(function (speed) {
      if (GAME_SPEEDS.indexOf(speed) === -1) GAME_SPEEDS.push(speed);
    });
    GAME_SPEEDS.sort(function (a, b) { return a - b; });
  }

  // --- a base that does not end the experiment -----------------------------

  // 100 000, against the game's 100 (2026-08-10, at the owner's request).
  //
  // A workbench needs leaks to be a READING rather than an ending. The whole
  // point of the page is to let a wave through and watch what a tower does
  // about it, and at 100 base HP a single Brute ends the session -- which turns
  // every measurement into a race and makes the loss overlay the thing you
  // spend your time dismissing.
  //
  // It moves BASE_MAX_HP rather than `baseHp`, so restartGame() -- which sets
  // the live value from the constant -- keeps it across every restart the
  // sidebar offers. It is still a real number and can still reach zero, so the
  // loss path itself remains testable here.
  var SANDBOX_BASE_HP = 100000;

  function installBase() {
    BASE_MAX_HP = SANDBOX_BASE_HP;
    baseHp = SANDBOX_BASE_HP;
  }

  // --- sidebar: towers ------------------------------------------------------

  function buildTowerList() {
    els.towerList.innerHTML = "";

    ROSTER.forEach(function (type, index) {
      var button = document.createElement("button");
      button.className = "towerbtn";
      button.dataset.slot = String(index);

      // Each type draws its own icon, so the sidebar never needs to know
      // what any particular tower looks like.
      var icon = document.createElement("canvas");
      icon.width = 28;
      icon.height = 28;
      type.drawIcon(icon.getContext("2d"), 14, 14, 16);

      var meta = document.createElement("div");
      meta.className = "meta";
      var name = document.createElement("span");
      name.textContent = (index + 1) + ". " + type.DISPLAY_NAME;
      var detail = document.createElement("small");
      detail.textContent = type.BASE_RANGE_UL + " u.l. range";
      meta.appendChild(name);
      meta.appendChild(detail);

      button.appendChild(icon);
      button.appendChild(meta);

      // Arming goes through the game's own selection state, so the canvas
      // build bar, the number-key hotkeys and this sidebar can never
      // disagree about what is armed.
      button.addEventListener("click", function () {
        selectedSlot = (selectedSlot === index) ? null : index;
        refreshBlockReason();
        refreshSidebar();
      });

      els.towerList.appendChild(button);
    });
  }

  // --- sidebar: selected tower ---------------------------------------------

  function refreshSelected() {
    var t = inspected;

    if (!t) {
      els.selectedName.textContent = "Nothing selected.";
      els.selectedStats.innerHTML = "";
      els.upgradeControls.style.display = "none";
      return;
    }

    els.selectedName.textContent = t.name;
    els.selectedStats.innerHTML = t.statLines().map(function (row) {
      return "<tr><td>" + row[0] + "</td><td>" + row[1] + "</td></tr>";
    }).join("");

    // Upgrade controls appear only for towers that actually have actions --
    // duck-typed, so a future config-driven tower gets them for free and the
    // gunner correctly never shows them. The labels come from the tower's
    // own panelActions(), the same list the on-canvas panel draws, so the
    // two views can never disagree about price or availability.
    if (typeof t.panelActions !== "function") {
      els.upgradeControls.style.display = "none";
      return;
    }

    els.upgradeControls.style.display = "";

    var byId = {};
    t.panelActions().forEach(function (a) { byId[a.id] = a; });

    [["upgradeA", els.buyA], ["upgradeB", els.buyB],
     ["reaim", els.reaimCone], ["ability", els.useAbility]]
      .forEach(function (pair) {
        var action = byId[pair[0]];
        var button = pair[1];
        if (!action) {
          button.style.display = "none";
          return;
        }
        button.style.display = "";
        button.disabled = !action.enabled;
        button.textContent = action.label + "  ·  " + action.detail;
        // The same card the canvas panel draws on hover, as a native tooltip.
        // The sidebar is a debugging convenience, not a second design -- but
        // it should not know LESS than the game does.
        button.title = cardAsText(cardFor(action));
      });

    // The crosspath note reads the config-driven runtime, which only the
    // config-driven towers have. A Smasher has upgrade paths and panel
    // actions but no `core`, and this threw the moment one was selected --
    // its own buttons already say "path A already chosen" anyway.
    if (!t.core) {
      els.upgradeNote.textContent = "";
      return;
    }

    var nextA = Crosspath.canPurchaseNext(t.core.purchased, "A", t.core.config);
    var nextB = Crosspath.canPurchaseNext(t.core.purchased, "B", t.core.config);
    var notes = [];
    if (!nextA.ok) notes.push("A: " + nextA.reason);
    if (!nextB.ok) notes.push("B: " + nextB.reason);
    els.upgradeNote.textContent = notes.join(" · ");
  }

  // The hover card flattened to plain text, for a native title attribute.
  function cardAsText(card) {
    if (!card) return "";

    var lines = [card.title];
    if (card.subtitle) lines.push(card.subtitle);
    card.changes.forEach(function (c) {
      lines.push("  " + c.label + ": " + (c.from ? c.from + " -> " + c.to : c.to) +
        (c.delta ? "  (" + c.delta + ")" : ""));
    });
    card.abilities.forEach(function (a) { lines.push(a.name + " -- " + a.text); });
    if (card.note) lines.push(card.note);
    return lines.join("\n");
  }

  function refreshSidebar() {
    var buttons = els.towerList.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      var armed = (Number(buttons[i].dataset.slot) === selectedSlot);
      buttons[i].className = armed ? "towerbtn armed" : "towerbtn";
    }
    refreshSelected();
    // A live readout rather than writing back into the inputs -- rewriting
    // them every 120 ms would fight anyone typing a value into them.
    els.runState.textContent =
      (currentMap ? currentMap.name + "  ·  " : "") +
      "Base " + Math.round(baseHp) +
      (baseHp > BASE_MAX_HP ? "" : " / " + BASE_MAX_HP) +
      "  ·  " + formatCash(cash) + " mana" + (lockGold ? " (topped up)" : "") +
      "  ·  " + enemies.length + " enemies  ·  " + towers.length + " towers" +
      (gameOver ? "  ·  BASE DESTROYED" : "");
  }

  // --- the overlay ----------------------------------------------------------

  // Range / deadzone / cone / footprint for the selected tower, each labelled
  // with its u.l. value. This is the tuning instrument for UNIT_LENGTH: the
  // numbers stay put while the shapes grow and shrink around them.
  //
  // Reads the tower's own u.l. fields and converts with ul() at draw time --
  // the one conversion point, exactly like every other distance.
  function drawOverlay(ctx) {
    var t = inspected;
    if (!t) return;

    var stats = t.core ? t.core.stats : null;
    var rangeUl = t.rangeUl;
    var deadzoneUl = stats ? stats.deadzone : 0;
    var isCone = stats && stats.targetShape === "cone";

    ctx.save();
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    if (overlay.range) {
      if (isCone) {
        var halfArc = (stats.coneArcDeg * Math.PI / 180) / 2;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.arc(t.x, t.y, ul(rangeUl), t.core.aimRad - halfArc, t.core.aimRad + halfArc);
        ctx.closePath();
        ctx.strokeStyle = "rgba(120,255,190,0.85)";
      } else {
        ctx.beginPath();
        ctx.arc(t.x, t.y, ul(rangeUl), 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(120,255,190,0.75)";
      }
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Range is the only labelled figure. Deadzone and footprint are drawn
      // as shapes and printed in the panel; labelling them here as well put
      // three overlapping strings on top of the tower.
      if (overlay.labels) {
        ctx.fillStyle = "rgba(120,255,190,0.95)";
        ctx.fillText("range " + rangeUl + " u.l.", t.x + 6, t.y - ul(rangeUl) + 13);
      }
    }

    if (overlay.deadzone && !isCone && deadzoneUl > 0) {
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.arc(t.x, t.y, ul(deadzoneUl), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,120,120,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (overlay.footprint) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, ul(t.footprintRadiusUl), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,215,110,0.95)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  // --- hooks into the running game -----------------------------------------

  // Wrap rather than edit: js/game.js has no idea this file exists, and
  // deleting sandbox.html + this file removes the sandbox completely.
  function installHooks() {
    var originalUpdate = update;
    var originalUpdateWaves = updateWaves;
    var originalRestart = restartGame;

    // Infinite cash, reasserted every step: spending, selling and the HUD all
    // keep working normally, the balance just never moves. Switched off the
    // moment you set gold by hand, so that value survives.
    //
    // Reasserted AFTER the step as well as before, because the step itself
    // earns and spends -- the beam tower's A3 in particular hands gold back
    // through update().
    update = function (dt) {
      if (lockGold) cash = SANDBOX_CASH;
      originalUpdate(dt);
      if (lockGold) cash = SANDBOX_CASH;
    };

    // Enemies arrive when YOU say so. Ticking the checkbox hands control
    // back to the game's real scheduler, unmodified.
    //
    // THE SOLO CHECK IS OUTSIDE THE SCHEDULER, not a flag inside it. Whichever
    // of the three gates closes the wave -- fully deployed and cleared, wiped
    // out, or the ceiling -- it ends by moving `waveIndex` off the wave, and
    // that one comparison catches all three. A gate flag inside js/game.js
    // would be a fourth thing for the gates to keep in step, on a schedule the
    // shipping game never parks.
    //
    // Only spawning stops. Everything already on the road keeps walking, which
    // is the point: "play out wave 27" means watch it through, not freeze it.
    updateWaves = function (dt) {
      if (!autoWaves) return;
      originalUpdateWaves(dt);
      if (soloWave !== null && waveIndex !== soloWave) {
        log("wave " + (soloWave + 1) + " is through — schedule parked");
        soloWave = null;
        parkSchedule();
      }
    };

    // Registered as a WORLD overlay rather than drawn after the frame: the
    // shapes then sit above the map but below the panel and the build bar,
    // instead of being painted across them.
    worldOverlays.push(drawOverlay);

    // "Back to the menu" means a different thing here. The sandbox is a
    // separate PAGE, so there is no menu screen to switch to -- leaving means
    // navigating to index.html. Wrapping the seam rather than editing
    // js/game.js, same as everything else in this file.
    leaveRun = function () {
      window.location.href = "index.html";
    };

    // A reset should land in sandbox rules, not in a fresh normal run.
    restartGame = function () {
      originalRestart();
      if (lockGold) cash = SANDBOX_CASH;
      // A reset means "back to the top of the schedule", so a request to watch
      // one wave in the middle of it does not survive one.
      soloWave = null;
      if (!autoWaves) {
        // Mark every wave deployed so the scheduler has nothing left to spawn,
        // and clear the road.
        //
        // Both of those used to be undoing something: restartGame() seeded wave
        // 1's first enemy and announced the wave on its way past, so this had to
        // sweep up a body and a banner. Since a run opens on a countdown instead
        // (RUN_START_DELAY in js/game.js) there is nothing to sweep -- the lines
        // are kept because what they ASSERT is still what the sandbox wants, and
        // an empty list emptied again costs nothing. The sandbox deliberately
        // does NOT inherit the ten-second pause: it is a workbench, and
        // resetWaveSchedule() below puts the countdown at zero on purpose.
        waveIndex = WAVES.length;
        waveSpawned = 0;
        enemies = [];
        if (typeof Effects !== "undefined") Effects.reset();
      } else {
        // Schedule ON: run it, starting now. The ten-second opening pause is a
        // pacing decision for a RUN, and nobody resets a workbench in order to
        // wait on it -- the same reasoning as the zero in resetWaveSchedule().
        waveCountdown = 0;
      }
    };
  }

  // --- spawning -------------------------------------------------------------

  // Which row of Enemy.TYPES the spawn buttons use. Set by the type dropdown;
  // `undefined` means the game's own default (normal), so the buttons behave
  // exactly as they did before the dropdown existed.
  var spawnType = undefined;
  var spawnTier = undefined;

  // WHICH TYPE THE TIER BUTTONS SPAWN, derived and not typed. The row that
  // carries a `fractal` block is the one with tiers, and it is the only one
  // -- so a rename of the id, or a second tiered type, arrives here without an
  // edit, the same way the type dropdown is built out of Enemy.TYPES. `null`
  // when nothing is tiered, which is what the builder below tests.
  var SLIME_TYPE = Object.keys(Enemy.TYPES).filter(function (id) {
    return !!Enemy.TYPES[id].fractal;
  })[0] || null;

  function typeLabel() {
    var type = Enemy.typeOf(spawnType);
    return type.displayName + (type.fractal ? " T" + spawnTier : "");
  }

  // The HP box overrides the type's own health, which is the point: it is how
  // you get a 500 HP camo to stand still under a beam. Passing NO health --
  // what the "type's own HP" option does -- spawns the roster's real numbers,
  // armor and camo included.
  function spawn(count, health) {
    for (var i = 0; i < count; i++) {
      // The game's own spawn function, so sandbox enemies are in no way
      // special -- same constructor, same path, same walk to the base.
      spawnEnemy(health, spawnType, undefined, undefined, spawnTier);
    }
    log("spawned " + count + " x " + typeLabel() +
      (health === undefined ? "" : " @ " + health + " HP"));
  }

  // --- the Fractal Slime's tier ladder --------------------------------------
  //
  // One type, six tiers, one mesh at six sizes -- and until this row existed
  // the only way to see the ladder was to pick the type, pick a tier, spawn,
  // clear, and do it again five times. That is the workbench making a hard
  // thing hard: what a size ladder has to be looked at is SIDE BY SIDE.
  //
  // WHY IT DOES NOT TOUCH `spawnType` OR `spawnTier`. Those two belong to the
  // dropdowns above, and a button that silently rewrote them would leave the
  // controls disagreeing with the board. These spawn a slime and say so; the
  // dropdowns keep whatever the operator left them on.
  function spawnSlime(tier) {
    spawnEnemy(undefined, SLIME_TYPE, undefined, undefined, tier);
    return enemies[enemies.length - 1];
  }

  // BIGGEST FIRST, and it is not a matter of taste: they are all put on the
  // road at the same instant and walk it at the same speed, so the one spawned
  // furthest back is the one seen last. Leading with T5 puts the ladder in
  // descending size order along the road, which is the order it reads in.
  function spawnSlimeLadder(spec) {
    var back = 0;
    var previous = null;
    for (var tier = spec.maxTier; tier >= spec.minTier; tier--) {
      var e = spawnSlime(tier);
      // SPACED OFF THE BODIES THEMSELVES, not by a fixed gap in u.l. A T5 is
      // drawn at radius 26.4 px and a T0 at 7.15, so any single number is
      // either a T5 standing inside its neighbour or a T0 alone on the map.
      // Sum of the two radii plus a third of a body between them.
      if (previous) back += (previous.radiusPx() + e.radiusPx()) * 1.35;
      e.progress = -back;
      e.refreshPos();
      previous = e;
    }
    log("spawned the slime ladder, T" + spec.maxTier + " down to T" +
      spec.minTier);
  }

  // Enemies spawned in one burst all sit at progress 0 and overlap exactly.
  // Nudging each one back along the path spaces them out so pierce, claiming
  // and "first" targeting behave like they do against a real wave.
  function spawnSpaced(count, health, spacingUl) {
    for (var i = 0; i < count; i++) {
      spawnEnemy(health, spawnType, undefined, undefined, spawnTier);
      var e = enemies[enemies.length - 1];
      e.progress = -ul(spacingUl) * i;
      // refreshPos, not path.pointAt: an enemy carries a lane offset across
      // the road, and writing pos straight from the centreline would drop it.
      e.refreshPos();
    }
    log("spawned " + count + " x " + typeLabel() +
      (health === undefined ? "" : " @ " + health + " HP"));
  }

  // --- wiring ---------------------------------------------------------------

  function wire() {
    [
      "towerList", "enemyHp", "enemyType", "enemyTier", "slimeTiers", "spawnOne", "spawnFive", "spawnWave1", "spawnWave2",
      "spawnTanky", "clearEnemies", "autoWaves", "scheduleDifficulty",
      "waveJump", "playWave", "playFromWave",
      "selectedName", "selectedStats",
      "upgradeControls", "buyA", "buyB", "reaimCone", "useAbility", "upgradeNote",
      "goldInput", "setGold", "goldPresets", "lockGold", "baseHpInput",
      "setBaseHp", "baseHpPresets", "mapList",
      "showRange", "showDeadzone", "showFootprint", "showLabels", "unitLength",
      "maxField", "maxFieldStatus",
      "resetBoard", "exitToMenu", "runState", "log"
    ].forEach(function (id) { els[id] = $(id); });

    buildTowerList();

    // An EMPTY (or junk) HP box means "whatever this type is worth" -- the
    // spawner passes undefined and Enemy.healthOf falls back to the type's own
    // row. That is the only way to look at a Brute's real 40 HP or a Midboss's
    // 250 without typing them in from memory.
    function enemyHp() {
      var n = parseInt(els.enemyHp.value, 10);
      return (isNaN(n) || n < 1) ? undefined : n;
    }

    // The type dropdown, built from Enemy.TYPES so a new row in that table
    // shows up here with no edit -- the same derive-don't-copy rule the index
    // screen follows.
    function buildTypeList() {
      var blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "Normal (default)";
      els.enemyType.appendChild(blank);

      Object.keys(Enemy.TYPES).forEach(function (id) {
        if (id === Enemy.DEFAULT_TYPE) return;
        var option = document.createElement("option");
        option.value = id;
        option.textContent = Enemy.TYPES[id].displayName +
          "  (" + Enemy.TYPES[id].health + " HP)";
        els.enemyType.appendChild(option);
      });
    }
    buildTypeList();

    // The tier row, built from the type's own `fractal` block so the buttons
    // are the ladder the game actually has -- minTier through maxTier, plus
    // the one that spawns all of them. Each label carries the tier's health,
    // because "T4" and "256 HP" are the same fact and only one of them is
    // legible from the button.
    function buildSlimeTiers() {
      if (!SLIME_TYPE) return;
      var spec = Enemy.TYPES[SLIME_TYPE].fractal;
      for (var tier = spec.minTier; tier <= spec.maxTier; tier++) {
        (function (t) {
          var button = document.createElement("button");
          button.textContent = "T" + t;
          button.title = Enemy.TYPES[SLIME_TYPE].displayName + " T" + t +
            "  (" + Enemy.healthOf(SLIME_TYPE, undefined, t) + " HP, drawn " +
            (spec.minSizeScale + t * spec.sizeStep).toFixed(2) + "x)";
          button.addEventListener("click", function () {
            spawnSlime(t);
            log("spawned " + Enemy.TYPES[SLIME_TYPE].displayName + " T" + t);
          });
          els.slimeTiers.appendChild(button);
        })(tier);
      }
      var all = document.createElement("button");
      all.textContent = "Ladder";
      all.title = "One of every tier at once, biggest first";
      all.addEventListener("click", function () { spawnSlimeLadder(spec); });
      els.slimeTiers.appendChild(all);
    }
    buildSlimeTiers();

    function resetWaveSchedule() {
      enemies = [];
      bullets = [];
      waveSpawned = 0;
      waveCountdown = 0;
      pendingBounty = 0;
      pendingBountyWave = 0;
      allWavesDeployed = false;
      victory = false;
      gameOver = false;
      runKills = 0;
      runAwarded = false;
      lastRunAward = null;
      waveIndex = autoWaves ? 0 : WAVES.length;
      if (typeof Effects !== "undefined") Effects.reset();
    }

    els.enemyType.addEventListener("change", function () {
      spawnType = els.enemyType.value || undefined;
      var fractal = Enemy.typeOf(spawnType).fractal;
      spawnTier = fractal ? fractal.defaultTier : undefined;
      els.enemyTier.disabled = !fractal;
      els.enemyTier.value = fractal ? String(spawnTier) : "";
      // A fractal's HP comes from its tier by design; presenting a second HP
      // control for it would imply two conflicting sources of truth.
      els.enemyHp.disabled = !!fractal;
      log("spawn type: " + typeLabel());
    });

    els.enemyTier.addEventListener("change", function () {
      var n = parseInt(els.enemyTier.value, 10);
      var fractal = Enemy.typeOf(spawnType).fractal;
      spawnTier = fractal && !isNaN(n) ? n : (fractal ? fractal.defaultTier : undefined);
      log("spawn tier: T" + spawnTier);
    });

    // --- economy ------------------------------------------------------------

    // Setting gold by hand releases the top-up; leaving it locked would mean
    // the value you typed lasted exactly one frame.
    function setGold(value) {
      if (!isFinite(value) || value < 0) return;
      cash = value;
      lockGold = false;
      els.lockGold.checked = false;
      els.goldInput.value = value;
      refreshBlockReason();          // affordability just changed
      log("mana set to " + value);
      refreshSidebar();
    }

    function setBaseHp(value) {
      if (!isFinite(value) || value < 0) return;
      baseHp = value;
      // Setting it above zero un-loses a lost run, otherwise the board stays
      // frozen under the loss overlay with a healthy base behind it.
      if (value > 0) gameOver = false;
      els.baseHpInput.value = value;
      log("base HP set to " + value);
      refreshSidebar();
    }

    function presetButton(container, label, onClick) {
      var button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", onClick);
      container.appendChild(button);
    }

    function shortNumber(n) {
      if (n >= 1000 && n % 1000 === 0) return (n / 1000) + "k";
      return String(n);
    }

    GOLD_PRESETS.forEach(function (value) {
      presetButton(els.goldPresets, shortNumber(value), function () { setGold(value); });
    });
    BASE_HP_PRESETS.forEach(function (value) {
      presetButton(els.baseHpPresets, shortNumber(value), function () { setBaseHp(value); });
    });

    els.goldInput.value = cash;
    els.baseHpInput.value = baseHp;

    els.setGold.addEventListener("click", function () {
      setGold(parseFloat(els.goldInput.value));
    });
    els.setBaseHp.addEventListener("click", function () {
      setBaseHp(parseFloat(els.baseHpInput.value));
    });

    els.lockGold.addEventListener("change", function () {
      lockGold = els.lockGold.checked;
      log(lockGold ? "mana top-up ON" : "mana top-up OFF");
    });

    // Route switcher. Goes through startRun, the same entry point the chooser
    // uses, so a sandbox route is loaded exactly like a real one.
    Maps.LIST.forEach(function (map) {
      presetButton(els.mapList, map.name, function () {
        startRun(map);
        cash = SANDBOX_CASH;
        if (!autoWaves) {
          waveIndex = WAVES.length;
          waveSpawned = 0;
          enemies = [];
        }
        log("map: " + map.name + "  (" + Maps.analyse(map).tier + ")");
        refreshSidebar();
      });
    });

    els.spawnOne.addEventListener("click", function () { spawn(1, enemyHp()); });
    els.spawnFive.addEventListener("click", function () { spawnSpaced(5, enemyHp(), 3); });
    els.spawnWave1.addEventListener("click", function () { spawnSpaced(5, 3, 3); });
    els.spawnWave2.addEventListener("click", function () { spawnSpaced(8, 4, 3); });
    els.spawnTanky.addEventListener("click", function () { spawn(1, 500); });
    els.clearEnemies.addEventListener("click", function () {
      enemies = [];
      bullets = [];
      log("cleared enemies");
    });

    els.autoWaves.addEventListener("change", function () {
      autoWaves = els.autoWaves.checked;
      // The checkbox is the coarse control and outranks the picker: ticking it
      // means "run the campaign from the top", which is not a request to watch
      // one wave.
      soloWave = null;
      resetWaveSchedule();
      log(autoWaves ? "wave schedule ON" : "wave schedule OFF");
    });

    // --- WHICH campaign the schedule checkbox plays -------------------------
    //
    // Both authored schedules are reachable from the workbench, and they are
    // reached through the GAME'S OWN `setDifficulty` -- the same function the
    // chooser's difficulty step calls. That is this file's standing promise
    // applied to a new feature: what you learn here is true in the shipping
    // game, which it would not be if the sandbox swapped `WAVES` itself and
    // skipped whatever setDifficulty does around it (it drops the derived
    // timeline; a hand-swap would deploy the old schedule's wave 1).
    //
    // The options are BUILT FROM `DIFFICULTIES`, not typed into sandbox.html,
    // so a third schedule would appear here with no edit -- the same rule the
    // enemy-type dropdown and the Fractal tier buttons already follow.
    //
    // Changing it resets the wave counter for the same reason the checkbox
    // does: the cursor is an index into a schedule, and index 4 of a different
    // schedule is a different wave.
    DIFFICULTIES.forEach(function (difficulty) {
      var option = document.createElement("option");
      option.value = difficulty.id;
      option.textContent = difficulty.name + " \u00b7 " + difficulty.detail;
      els.scheduleDifficulty.appendChild(option);
    });
    els.scheduleDifficulty.value = selectedDifficultyId;

    els.scheduleDifficulty.addEventListener("change", function () {
      var picked = setDifficulty(els.scheduleDifficulty.value);
      // Re-read rather than trusting the box: setDifficulty falls back to the
      // default on an id it does not know, and a dropdown showing one thing
      // while the game plays another is exactly the disagreement the Fractal
      // tier row's "a shortcut must not rewrite the controls it shortcuts" rule
      // is about, seen from the other side.
      els.scheduleDifficulty.value = picked.id;
      // `soloWave` and the picker's value are both INDICES into a schedule, and
      // index 4 of a different schedule is a different wave -- the same reason
      // the paragraph above gives for resetting the counter. So the request is
      // dropped and the list is rebuilt from the schedule that is now active.
      soloWave = null;
      resetWaveSchedule();
      buildWaveList();
      log("schedule: " + picked.name + " (" + picked.waves.length + " waves)");
      refreshSidebar();
    });

    // --- WHICH wave of that schedule to play --------------------------------
    //
    // Built from `WAVES` and labelled with the game's own waveSummary(), the
    // same function the on-canvas wave banner uses -- so the line you pick from
    // is the line the banner will show, and a schedule edit reaches this list
    // without anyone remembering to update it. Rebuilt when the schedule
    // changes, for the same reason the counter is reset.
    function buildWaveList() {
      // Keep the player's place across a schedule swap where it still exists.
      // Both authored campaigns are 35 waves today; a third of a different
      // length is exactly the case a bare re-select would get wrong.
      var keep = parseInt(els.waveJump.value, 10);
      els.waveJump.innerHTML = "";
      WAVES.forEach(function (wave, index) {
        var option = document.createElement("option");
        option.value = String(index);
        option.textContent = "Wave " + (index + 1) + "  \u00b7  " + waveSummary(wave);
        els.waveJump.appendChild(option);
      });
      els.waveJump.value =
        String(isNaN(keep) || keep < 0 || keep >= WAVES.length ? 0 : keep);
    }
    buildWaveList();

    function pickedWaveIndex() {
      var n = parseInt(els.waveJump.value, 10);
      return (isNaN(n) || n < 0 || n >= WAVES.length) ? 0 : n;
    }

    // Start the schedule ON a wave rather than at the top of it.
    //
    // It turns the checkbox ON rather than refusing when it is off: the button
    // says "play this wave", and a button that silently does nothing because a
    // box three lines up is unticked is the disagreement between a shortcut and
    // the controls it shortcuts that the Fractal tier row's rule is about. The
    // checkbox is moved to match, so the sidebar never shows one thing while the
    // board does another.
    //
    // `waveOnClockIndex = -1` is what makes RE-playing the wave already on the
    // cursor announce itself again. js/game.js compares that against `waveIndex`
    // to decide whether a wave has had its banner, and picking the same wave
    // twice does not move the index -- so without this the second run would
    // start in silence. (The reward latch needs no such help: updateWaves clears
    // it on any wave whose cursor is back at zero, and says so.)
    //
    // The countdown is zeroed rather than left at the opening ten seconds, for
    // the reason the restart wrapper already gives: nobody sets up a workbench
    // in order to wait on it.
    function playWave(index, solo) {
      if (!autoWaves) {
        autoWaves = true;
        els.autoWaves.checked = true;
      }
      resetWaveSchedule();
      soloWave = solo ? index : null;
      waveIndex = index;
      waveSpawned = 0;
      waveElapsed = 0;
      waveCountdown = 0;
      waveOnClockIndex = -1;
      log((solo ? "playing wave " : "schedule from wave ") + (index + 1) +
        " / " + WAVES.length + "  \u00b7  " + waveSummary(WAVES[index]));
      refreshSidebar();
    }

    els.playWave.addEventListener("click", function () {
      playWave(pickedWaveIndex(), true);
    });
    els.playFromWave.addEventListener("click", function () {
      playWave(pickedWaveIndex(), false);
    });

    // All three go through the tower's own performAction, the same entry
    // point the on-canvas panel buttons use -- so the sidebar cannot drift
    // from the real thing, and prices are still charged (against infinite
    // cash) rather than quietly skipped.
    function runAction(id) {
      if (!inspected || typeof inspected.performAction !== "function") return;
      var message = inspected.performAction(id, {
        cash: cash,
        spend: function (amount) { cash -= amount; },
        enemies: enemies,
        damage: function (enemy, amount) { enemy.takeDamage(amount); },
        // Re-aiming waits for a map click; hand it to the same global the
        // canvas panel uses so both routes behave identically.
        beginAiming: function (tower) { aimingTower = tower; }
      });
      if (message) log(message);
      refreshSidebar();
    }

    els.reaimCone.addEventListener("click", function () { runAction("reaim"); });
    els.buyA.addEventListener("click", function () { runAction("upgradeA"); });
    els.buyB.addEventListener("click", function () { runAction("upgradeB"); });
    els.useAbility.addEventListener("click", function () { runAction("ability"); });

    ["showRange", "showDeadzone", "showFootprint", "showLabels"].forEach(function (id) {
      var key = id.replace("show", "").toLowerCase();
      els[id].addEventListener("change", function () { overlay[key] = els[id].checked; });
    });

    els.unitLength.value = UNIT_LENGTH;
    els.unitLength.addEventListener("input", function () {
      var value = parseFloat(els.unitLength.value);
      if (!isFinite(value) || value <= 0) return;

      UNIT_LENGTH = value;

      // Towers cache their world-space range/footprint at construction, so
      // retuning the constant has to tell the ones already on the board.
      // (The path keeps the shape it was built with -- rebuilding it would
      // move every tower off its position. Reload the page for a full
      // rescale; this control is for judging tower sizes against a fixed
      // map.)
      towers.forEach(function (t) {
        if (typeof t.refreshDerived === "function") {
          // THE CORE FIRST, exactly as FarmBoost.refresh does it. A config
          // tower's `refreshDerived` only reads `core.stats`; the equipped
          // permanent upgrades then run as a post-pass over whatever is in
          // there, so calling it without a fresh resolve would fold them in a
          // second time on top of themselves.
          if (t.core && typeof t.core._refreshStats === "function") {
            t.core._refreshStats();
          }
          t.refreshDerived();
        } else {
          t.rangePx = ul(t.rangeUl);
          t.footprintPx = ul(t.footprintRadiusUl);
        }
      });
    });

    // js/sandbox/sandbox-max-field.js holds the command; this sidebar owns the
    // only button for it. It used to be shared with the game's floating debug
    // cash panel, which was deleted on 2026-08-13.
    els.maxField.addEventListener("click", function () {
      var result = window.SandboxMaxField.run();
      els.maxFieldStatus.textContent = result.towers + " tower" +
        (result.towers === 1 ? "" : "s") + " maxed · " +
        result.abilities + " AUTO fired";
      log("field maxed to A2/B5 · " + result.abilities + " AUTO");
      refreshSidebar();
    });

    els.resetBoard.addEventListener("click", function () {
      restartGame();
      log("board reset");
      refreshSidebar();
    });

    // Straight out, no confirmation: there is nothing at stake in a sandbox
    // board. The canvas Menu button still asks, because it is the shipping
    // game's button and does not know which page it is on.
    els.exitToMenu.addEventListener("click", function () { leaveRun(); });

    // The sidebar mirrors game state that changes from canvas clicks too
    // (placing, inspecting, selling), so poll rather than trying to hook
    // every entry point that could have changed it.
    setInterval(refreshSidebar, 120);
    refreshSidebar();
  }

  // init() runs on window load (see the bottom of js/game.js). Hook after it,
  // so `update`/`draw`/`restartGame` exist and the canvas is sized, then put
  // the board into sandbox state.
  window.addEventListener("load", function () {
    // The shipping game opens on the map chooser. A sandbox wants to be ON a
    // board immediately, so it picks the default route itself -- the sidebar's
    // map buttons switch routes afterwards.
    startRun(Maps.byId(Maps.DEFAULT_ID));

    // NO PERMANENT PROGRESSION FROM A TESTING SURFACE (2026-08-30). The
    // workbench already hands out infinite money and un-loses runs; a profile
    // that could be levelled here is a profile whose numbers mean nothing. The
    // EQUIPPED perks still apply, and deliberately so -- what you learn about a
    // tower here has to be true in the shipping game, which is this file's
    // whole premise -- but no xp, no level and no coin is ever banked.
    if (typeof TowerXP !== "undefined") TowerXP.setEnabled(false);

    installRoster();
    installSpeeds();
    installBase();
    installHooks();
    wire();

    cash = SANDBOX_CASH;
    waveIndex = WAVES.length;
    waveSpawned = 0;
    enemies = [];

    // startRun() above ran BEFORE installHooks() wrapped restartGame, so it
    // went through the real one and announced wave 1 on its way past. Clear
    // that here for the same reason the wrapper does: the banner would say
    // "Wave 1 / 35" over a page whose whole point is that the schedule is off.
    //
    // THE CORNER READOUT IS STILL APPROXIMATE HERE and deliberately left so.
    // `waveIndex = WAVES.length` is this file's way of switching spawning off,
    // and waveStatusText() reads that state as "the schedule is spent" -- so
    // the sandbox corner says "Final wave · N still walking" about bodies the
    // roster put there by hand. It is the honest reading of the only state the
    // game has for "nothing left to deploy", and inventing a sandbox-only
    // branch in the shipping readout to say something nicer on a debug page
    // would put a state on the screen that no run can ever reach.
    if (typeof Effects !== "undefined") Effects.reset();

    log("sandbox ready — infinite mana, waves off, base " +
      BASE_MAX_HP + " HP, speeds " + GAME_SPEEDS.join("/") + "×, map " +
      Math.round(path.length / UNIT_LENGTH) + " u.l. long");
  });

})();
