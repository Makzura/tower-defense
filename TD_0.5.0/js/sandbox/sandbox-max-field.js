// ---------------------------------------------------------------------------
// SANDBOX: the Max Field command.
//
// This is the surviving half of js/debug-cash.js, which was deleted on
// 2026-08-13 at the owner's instruction ("That debug cheat panel can go, we
// have the sandbox which gives everything we need to test towers and
// enemies"). The floating cash panel it used to put on the first screen of the
// game is gone; the field-maxing command it also carried is the sandbox's, and
// moved here with it.
//
// It is loaded by sandbox.html ONLY. index.html does not name it, so it is
// absent from the shipping page, and tests/harness.js -- which reads its
// script list out of index.html -- never sees it either.
//
// It is DOM-free: it exposes one function and the sandbox sidebar owns the
// button. That is deliberate, and is the property worth preserving from the
// file it came out of -- no testing aid in the render loop, none in the input
// handling.
// ---------------------------------------------------------------------------

(function () {

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
  // it is a sandbox command whose entire job is to create the exact A2/B5 state.
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

    // Siphon B5 is normally gated and globally unique. The forced build still
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

    // Maxing repairs the test subject as well as its stats.
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

  window.SandboxMaxField = { run: maxField };

})();
