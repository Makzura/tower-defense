// ---------------------------------------------------------------------------
// DEBUG: cash granter
//
// *** TEMPORARY TESTING AID -- DELETE BEFORE RELEASE. ***
//
// To remove it completely:
//   1. delete this file
//   2. delete its <script> line from index.html
//   3. delete its <script> line and MAX FIELD button from sandbox.html
// That is all. Shipping game code does not depend on it.
//
// It builds its own floating panel in the DOM rather than drawing on the
// canvas, deliberately: no debug code ends up in the game's render loop or
// input handling, and the panel is visibly not part of the game.
//
// The tests skip js/debug-*.js -- see tests/harness.js.
// ---------------------------------------------------------------------------

(function () {

  var PRESETS = [50, 500, 5000];

  function styled(tag, css, text) {
    var el = document.createElement(tag);
    el.style.cssText = css;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  var BUTTON_CSS =
    "font: 600 12px system-ui, sans-serif;" +
    "color: #f7d8ff; background: rgba(196,92,232,0.18);" +
    "border: 1px solid rgba(228,140,255,0.55); border-radius: 4px;" +
    "padding: 4px 9px; cursor: pointer;";

  function button(label, onClick) {
    var b = styled("button", BUTTON_CSS, label);
    b.addEventListener("click", onClick);
    return b;
  }

  function baseSpent(tower) {
    if (typeof tower.cost === "number") return tower.cost;
    if (tower.constructor && typeof tower.constructor.COST === "number") {
      return tower.constructor.COST;
    }
    return 0;
  }

  function configBuildCost(tower) {
    var total = baseSpent(tower);
    var config = tower.core.config;
    ["A", "B"].forEach(function (branch) {
      var wanted = branch === "A" ? 2 : 5;
      var tiers = config.paths[branch] || [];
      for (var i = 0; i < Math.min(wanted, tiers.length); i++) {
        total += tiers[i].cost || 0;
      }
    });
    return total;
  }

  // Config-driven towers can be rebuilt directly from their pure config.
  // This intentionally bypasses prices, unlock gates and crosspath validation:
  // it is a debug cheat whose entire job is to create the exact A2/B5 state.
  function forceConfiguredBuild(tower) {
    tower.core.purchased.A = 2;
    tower.core.purchased.B = 5;

    // Re-initialising HP also undoes an earlier Sniper ability's permanent HP
    // payment. The ability is fired again below after the finished build exists.
    tower.core.maxHp = null;
    tower.core.currentHp = null;
    tower.core.stunTimer = 0;
    tower.core._refreshStats();

    tower.totalSpent = configBuildCost(tower);
    if (typeof tower.refreshDerived === "function") tower.refreshDerived();

    // Siphon B5 is normally gated and globally unique. The debug build still
    // carries the resolved B5 flag on every Siphon; register whichever one can
    // own the live rescue slot so the first maxed Siphon behaves completely.
    if (tower.core.stats.flags.death_denial) {
      tower.deathDenialSpent = false;
      if (typeof DeathDenial !== "undefined") DeathDenial.register(tower);
    }
  }

  // Warbringer and Rifleman use flag-based trees. Clear every old branch first
  // so even an A5 tower becomes the exact requested B5/A2 crosspath.
  function forceFlagBuild(tower) {
    for (var tier = 1; tier <= 5; tier++) {
      tower["hasA" + tier] = false;
      tower["hasB" + tier] = false;
    }
    tower.totalSpent = baseSpent(tower);
    tower.recalcStats();

    for (var b = 1; b <= 5; b++) tower.applyUpgrade("B" + b);
    for (var a = 1; a <= 2; a++) tower.applyUpgrade("A" + a);

    // Debug maxing repairs the test subject as well as its stats.
    if (typeof tower.maxHp === "number" && "currentHp" in tower) {
      tower.currentHp = tower.maxHp;
    }
  }

  function forceBuild(tower) {
    if (tower && tower.core && tower.core.config && tower.core.purchased) {
      forceConfiguredBuild(tower);
      return true;
    }
    if (tower && typeof tower.applyUpgrade === "function" &&
        typeof tower.recalcStats === "function") {
      forceFlagBuild(tower);
      return true;
    }
    return false;
  }

  function armAndFireAbilities(tower) {
    if (!tower || typeof tower.panelActions !== "function" ||
        typeof tower.performAction !== "function") return 0;

    // Clear the known ability timers so the press really fires NOW.
    if ("quakeCooldown" in tower) tower.quakeCooldown = 0;
    if ("recruitCooldown" in tower) tower.recruitCooldown = 0;
    if (tower.core) tower.core.stunTimer = 0;

    var actions = tower.panelActions();
    var fired = 0;
    actions.forEach(function (action) {
      // A toggle marks a genuinely self-running ability. This excludes the
      // Sniper's cone re-aim and the Siphon's passive readout automatically.
      if (action.tone !== "ability" || !action.toggle) return;

      AutoAbility.set(tower, action.toggle.abilityId, true);
      tower.performAction(action.id, {
        cash: (typeof cash === "number") ? cash : window.cash,
        enemies: (typeof enemies !== "undefined") ? enemies : (window.enemies || []),
        spend: function (amount) {
          if (typeof cash === "number") cash -= amount;
          else window.cash -= amount;
        }
      });
      fired++;
    });
    return fired;
  }

  function maxField() {
    // Browser window and the headless sandbox's global are not the same
    // object. Prefer the real game global so the shared command works in both.
    var field = (typeof towers !== "undefined") ? towers : (window.towers || []);
    var maxed = 0;
    var abilities = 0;

    field.forEach(function (tower) {
      if (forceBuild(tower)) maxed++;
    });
    field.forEach(function (tower) {
      abilities += armAndFireAbilities(tower);
    });

    return { towers: maxed, abilities: abilities };
  }

  // Shared by the floating purple box and the sandbox sidebar.
  window.DebugMaxField = { run: maxField };

  function build() {
    // sandbox.html has its own sidebar button. Keep the command above, but do
    // not place a second floating panel over its canvas.
    if (document.getElementById("sidebar")) return;

    // Bottom LEFT since 2026-07-29. It used to sit bottom right, on the
    // grounds that that was "the only corner with nothing in it" -- and then
    // the speed toggle was put there (drawSpeedButton in js/game.js) and this
    // panel covered it completely. A canvas button underneath a fixed DOM
    // overlay is not a button.
    //
    // This yields rather than the game moving, because this file is the
    // disposable one: it is marked for deletion before release and nothing in
    // the game refers to it, so a shipping control gets the corner and the
    // debug aid takes what is left. What is left is the scale bar, which this
    // now partly covers -- also a development aid, and the lesser loss.
    var box = styled("div",
      "position: fixed; bottom: 12px; left: 12px; z-index: 9999;" +
      "background: rgba(24,14,30,0.94);" +
      "border: 1px dashed rgba(228,140,255,0.75); border-radius: 6px;" +
      "padding: 9px 11px; display: flex; flex-direction: column; gap: 7px;" +
      "font: 12px system-ui, sans-serif; color: #e8c9f5;");

    box.appendChild(styled("div",
      "font: 700 10px system-ui, sans-serif; letter-spacing: 0.09em;" +
      "color: rgba(228,140,255,0.9);",
      "DEBUG · TESTING ONLY · REMOVE BEFORE RELEASE"));

    // Exact amount: type a number, then add it or set cash to it.
    var row = styled("div", "display: flex; gap: 6px; align-items: center;");

    var input = styled("input",
      "width: 82px; font: 12px system-ui, sans-serif; color: #fff;" +
      "background: rgba(255,255,255,0.09);" +
      "border: 1px solid rgba(228,140,255,0.45); border-radius: 4px;" +
      "padding: 4px 6px;");
    input.type = "number";
    input.value = "100";
    input.step = "1";

    function amount() {
      var n = parseInt(input.value, 10);
      return isNaN(n) ? 0 : n;
    }

    row.appendChild(input);
    row.appendChild(button("Give", function () { window.cash += amount(); }));
    row.appendChild(button("Set", function () { window.cash = amount(); }));
    box.appendChild(row);

    // Quick amounts, plus a reset to the real starting stake for testing the
    // opening of the game.
    var quick = styled("div", "display: flex; gap: 6px; align-items: center;");
    PRESETS.forEach(function (n) {
      quick.appendChild(button("+$" + n, function () { window.cash += n; }));
    });
    quick.appendChild(button("Reset", function () {
      window.cash = window.STARTING_CASH;
    }));
    box.appendChild(quick);

    var maxButton = button("MAX FIELD  ·  A2 / B5 + AUTO", function () {
      var result = maxField();
      maxStatus.textContent = result.towers + " tower" +
        (result.towers === 1 ? "" : "s") + " maxed  ·  " +
        result.abilities + " AUTO fired";
    });
    maxButton.id = "debugMaxField";
    maxButton.style.width = "100%";
    box.appendChild(maxButton);

    var maxStatus = styled("div",
      "min-height: 13px; font: 10px system-ui, sans-serif;" +
      "color: rgba(232,201,245,0.72);",
      "Field cheat: exact A2/B5, abilities fire now and stay AUTO");
    box.appendChild(maxStatus);

    document.body.appendChild(box);
  }

  window.addEventListener("load", build);

})();
