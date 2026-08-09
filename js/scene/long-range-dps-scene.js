// ---------------------------------------------------------------------------
// Longshot debug scene
//
// Places one ConfiguredTower, lets it be upgraded along either path through
// the DOM panel, and draws its range / deadzone / cone as a canvas overlay
// labelled in u.l. (see js/units.js for UNIT_LENGTH/ul(), the project's
// global distance system). This scene is also where UNIT_LENGTH itself gets
// tuned -- the panel's "UNIT_LENGTH" input edits the live global constant.
//
// Per AGENTS.md's house rule, simulation stays out of the DOM: tower.update()
// (js/towers/tower-runtime.js) never touches `document`. Everything in this
// file that reads/writes the DOM panel is scene wiring, not simulation --
// same split as js/debug-cash.js uses for its floating panel.
//
// This is a genuine deliverable (spec section 8.4), not a temporary aid like
// js/debug-cash.js, so it is not named debug-*.js and is not skipped by the
// test harness convention -- it simply is not loaded by tests/harness.js
// because it is not referenced from index.html.
// ---------------------------------------------------------------------------

(function () {

  var canvas = document.getElementById("scene");
  var ctx = canvas.getContext("2d");

  var CENTER_X = canvas.width / 2;
  var CENTER_Y = canvas.height / 2;

  // This page has its own JS global scope (a separate <script> load from
  // index.html's), so it has its own copy of UNIT_LENGTH -- setting it here
  // does not affect the main game. It starts much smaller than the main
  // game's 19.4: Longshot's range runs up to 1500 u.l. at A5, and this
  // canvas is only 1280x720, so the same constant that suits an 8 u.l.
  // gunner would draw this tower's range far off-screen. Every distance
  // after this line still goes through ul() -- nothing below writes a raw
  // pixel literal for a world distance.
  UNIT_LENGTH = 0.30;

  var tower = new ConfiguredTower(TowerConfigs.longRangeDPS, CENTER_X, CENTER_Y);
  var enemies = []; // { x, y, hp, maxHp, isFlying, isCamo, id }
  var nextEnemyId = 1;

  // ---- logging (DOM only) --------------------------------------------------

  var logEl = document.getElementById("log");
  function log(message) {
    var line = document.createElement("div");
    line.textContent = message;
    logEl.insertBefore(line, logEl.firstChild);
    while (logEl.childNodes.length > 40) logEl.removeChild(logEl.lastChild);
  }

  // ---- enemy helpers --------------------------------------------------------

  function randomPointInRing(minR, maxR) {
    var angle = Math.random() * Math.PI * 2;
    var r = minR + Math.random() * (maxR - minR);
    return { x: CENTER_X + Math.cos(angle) * r, y: CENTER_Y + Math.sin(angle) * r };
  }

  function spawnEnemy(opts) {
    // Spawn somewhere between the deadzone (if any) and range, in world
    // pixels, converted from the resolved u.l. stats via ul().
    var rangePx = ul(tower.stats.range);
    var minPx = tower.stats.targetShape === "circle" ? ul(tower.stats.deadzone) : 0;
    var p = randomPointInRing(minPx + 10, Math.max(minPx + 20, rangePx - 10));
    var hp = 500 + Math.floor(Math.random() * 500);
    enemies.push({
      id: nextEnemyId++,
      x: p.x, y: p.y,
      hp: hp, maxHp: hp,
      isFlying: !!(opts && opts.isFlying),
      isCamo: !!(opts && opts.isCamo)
    });
  }

  // ---- firing (drives the REAL pipeline in js/towers/tower-runtime.js) ------

  function distance(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Debug-scene simplification: this tower's config leaves projectile
  // travel behaviour undefined (section 7 -- hitscan vs travelling is a
  // TODO), so there is no real projectile line to test enemies against.
  // As a stand-in, a piercing shot's damage sequence is applied to the N
  // closest valid targets, nearest first. That is a simplification for
  // visualizing pierce/falloff here, not a claim about final projectile
  // behaviour.
  function fireIfReady() {
    if (!tower.canFire()) return;

    var targets = tower.getValidTargets(enemies);
    if (targets.length === 0) return;

    targets.sort(function (a, b) {
      return distance(tower.x, tower.y, a.x, a.y) - distance(tower.x, tower.y, b.x, b.y);
    });

    var primary = targets[0];
    var hpFraction = primary.hp / primary.maxHp;
    var outcome = tower.fire(hpFraction);

    var killed = [];
    for (var i = 0; i < outcome.sequence.length && i < targets.length; i++) {
      var enemy = targets[i];
      enemy.hp -= outcome.sequence[i];
      if (enemy.hp <= 0) killed.push(enemy);
    }

    killed.forEach(function (enemy) {
      tower.onKill();
      var idx = enemies.indexOf(enemy);
      if (idx !== -1) enemies.splice(idx, 1);
    });

    log(
      (outcome.crit ? "CRIT " : "") + "hit " + Math.min(outcome.sequence.length, targets.length) +
      " target(s), first hit " + outcome.sequence[0].toFixed(1) +
      (outcome.executeBonus > 0 ? " (execute +" + Math.round(outcome.executeBonus * 100) + "%)" : "") +
      (killed.length ? " -- " + killed.length + " killed" : "")
    );
  }

  // ---- update loop ------------------------------------------------------

  var lastT = null;
  function frame(t) {
    if (lastT === null) lastT = t;
    var dt = Math.min((t - lastT) / 1000, 0.1);
    lastT = t;

    tower.update(dt); // pure simulation, no DOM access -- see file header
    fireIfReady();

    draw();
    refreshPanel();
    requestAnimationFrame(frame);
  }

  // ---- drawing (world-space distances always through ul()) --------------

  function drawLabel(text, x, y) {
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(219,231,255,0.85)";
    ctx.fillText(text, x, y);
  }

  function drawRangeAndDeadzoneOrCone() {
    var stats = tower.stats;
    var rangePx = ul(stats.range);

    if (stats.targetShape === "cone") {
      var halfArc = (stats.coneArcDeg * Math.PI / 180) / 2;
      var a0 = tower.aimRad - halfArc;
      var a1 = tower.aimRad + halfArc;

      ctx.beginPath();
      ctx.moveTo(tower.x, tower.y);
      ctx.arc(tower.x, tower.y, rangePx, a0, a1);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,180,120,0.10)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,180,120,0.55)";
      ctx.stroke();

      // aim direction line
      ctx.beginPath();
      ctx.moveTo(tower.x, tower.y);
      ctx.lineTo(tower.x + Math.cos(tower.aimRad) * rangePx, tower.y + Math.sin(tower.aimRad) * rangePx);
      ctx.strokeStyle = "rgba(255,180,120,0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();

      drawLabel(
        "cone " + stats.coneArcDeg.toFixed(0) + "° / range " + stats.range.toFixed(0) + " u.l.",
        tower.x + Math.cos(tower.aimRad) * rangePx * 0.5,
        tower.y + Math.sin(tower.aimRad) * rangePx * 0.5 - 8
      );
      drawLabel(
        tower.reaimCooldownTimer > 0 ? "re-aim: " + tower.reaimCooldownTimer.toFixed(1) + "s" : "click to re-aim",
        tower.x - 40, tower.y + rangePx + 16
      );
    } else {
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, rangePx, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(140,199,255,0.05)";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(140,199,255,0.35)";
      ctx.stroke();
      drawLabel("range " + stats.range.toFixed(0) + " u.l.", tower.x + 6, tower.y - rangePx + 12);

      if (stats.deadzone > 0) {
        var deadzonePx = ul(stats.deadzone);
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.arc(tower.x, tower.y, deadzonePx, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,120,120,0.6)";
        ctx.stroke();
        ctx.setLineDash([]);
        drawLabel("deadzone " + stats.deadzone.toFixed(0) + " u.l.", tower.x + 6, tower.y - deadzonePx + 12);
      }
    }
  }

  function drawTower() {
    var footprintPx = ul(tower.stats.footprint);
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, footprintPx, 0, Math.PI * 2);
    ctx.fillStyle = "#475c80";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#8cb3e6";
    ctx.stroke();

    drawLabel("footprint " + tower.stats.footprint.toFixed(0) + " u.l.", tower.x + 6, tower.y + footprintPx + 2);

    if (tower.stunTimer > 0) {
      drawLabel("STUNNED " + tower.stunTimer.toFixed(1) + "s", tower.x - 30, tower.y + footprintPx + 16);
    }
  }

  function drawEnemies() {
    enemies.forEach(function (e) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = e.isCamo ? "rgba(150,120,220,0.85)" : (e.isFlying ? "rgba(120,200,255,0.85)" : "rgba(222,79,84,0.9)");
      ctx.fill();

      var w = 24;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(e.x - w / 2, e.y - 20, w, 4);
      ctx.fillStyle = "#61d973";
      ctx.fillRect(e.x - w / 2, e.y - 20, w * Math.max(0, e.hp / e.maxHp), 4);
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1c1e26";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawRangeAndDeadzoneOrCone();
    drawEnemies();
    drawTower();
  }

  // ---- DOM panel (never read by tower.update -- see file header) ---------

  var STAT_ROWS = [
    ["damage", "damage"],
    ["range", "range (u.l.)"],
    ["fireRate", "fireRate"],
    ["effFireRate", "effective fireRate"],
    ["hp", "hp (current/max)"],
    ["pierce", "pierce"],
    ["deadzoneOrCone", "deadzone / cone"],
    ["critChance", "critChance"],
    ["critDamage", "critDamage"]
  ];

  var ALL_FLAGS = [
    "camoDetection", "pierceFalloff", "coneShape", "deadzoneRemoved",
    "infinitePierce", "killStackAttackSpeed", "tentativeExecuteFlat",
    "reload", "executeScaling", "guaranteedReloadShotCrit", "activeAbility"
  ];

  var statsTable = document.getElementById("statsTable");
  var flagsList = document.getElementById("flagsList");
  var tierAEl = document.getElementById("tierA");
  var tierBEl = document.getElementById("tierB");
  var buyAButton = document.getElementById("buyA");
  var buyBButton = document.getElementById("buyB");
  var crosspathNote = document.getElementById("crosspathNote");
  var unitLengthInput = document.getElementById("unitLength");
  unitLengthInput.value = UNIT_LENGTH;

  function fmt(n) {
    if (n === Infinity) return "∞";
    if (typeof n === "number") return Math.round(n * 100) / 100;
    return String(n);
  }

  function refreshPanel() {
    var s = tower.stats;
    var rows = {
      damage: fmt(s.damage),
      range: fmt(s.range),
      fireRate: fmt(s.fireRate) + "/s",
      effFireRate: fmt(tower.effectiveFireRate()) + "/s",
      hp: Math.round(tower.currentHp) + " / " + Math.round(tower.maxHp),
      pierce: fmt(s.pierce),
      deadzoneOrCone: s.targetShape === "cone"
        ? s.coneArcDeg.toFixed(0) + "° cone"
        : fmt(s.deadzone) + " u.l.",
      critChance: fmt(s.critChance) + "%",
      critDamage: fmt(s.critDamage) + "%"
    };

    statsTable.innerHTML = STAT_ROWS.map(function (row) {
      return "<tr><td>" + row[1] + "</td><td>" + rows[row[0]] + "</td></tr>";
    }).join("");

    flagsList.innerHTML = ALL_FLAGS.map(function (flag) {
      var on = !!s.flags[flag];
      return "<div class=\"" + (on ? "flag-on" : "flag-off") + "\">" +
        (on ? "✓ " : "– ") + flag + "</div>";
    }).join("");

    tierAEl.textContent = tower.purchased.A;
    tierBEl.textContent = tower.purchased.B;

    var nextA = Crosspath.canPurchaseNext(tower.purchased, "A", tower.config);
    var nextB = Crosspath.canPurchaseNext(tower.purchased, "B", tower.config);
    buyAButton.disabled = !nextA.ok;
    buyBButton.disabled = !nextB.ok;

    var notes = [];
    if (!nextA.ok) notes.push("A: " + nextA.reason);
    if (!nextB.ok) notes.push("B: " + nextB.reason);
    crosspathNote.textContent = notes.join(" / ");
  }

  // ---- input --------------------------------------------------------------

  // The one live control for the global distance system. Every draw() call
  // reads UNIT_LENGTH fresh (via ul()) with nothing cached in between, so
  // editing this reflows every shape on the very next frame -- no restart,
  // no re-placement needed.
  unitLengthInput.addEventListener("input", function () {
    var value = parseFloat(unitLengthInput.value);
    if (!isFinite(value) || value <= 0) return;
    UNIT_LENGTH = value;
  });

  buyAButton.addEventListener("click", function () {
    var result = tower.purchase("A");
    log(result.ok ? "bought A" + tower.purchased.A : "A purchase blocked: " + result.reason);
    refreshPanel();
  });

  buyBButton.addEventListener("click", function () {
    var result = tower.purchase("B");
    log(result.ok ? "bought B" + tower.purchased.B : "B purchase blocked: " + result.reason);
    refreshPanel();
  });

  document.getElementById("spawnNormal").addEventListener("click", function () { spawnEnemy({}); });
  document.getElementById("spawnCamo").addEventListener("click", function () { spawnEnemy({ isCamo: true }); });
  document.getElementById("spawnFlying").addEventListener("click", function () { spawnEnemy({ isFlying: true }); });
  document.getElementById("clearEnemies").addEventListener("click", function () { enemies = []; });

  document.getElementById("triggerAbility").addEventListener("click", function () {
    var result = tower.triggerActiveAbility(enemies);
    if (!result.ok) {
      log("ability: " + result.reason);
      return;
    }
    result.hits.forEach(function (hit) {
      hit.enemy.hp -= hit.damage;
    });
    enemies = enemies.filter(function (e) { return e.hp > 0; });
    log("ability: hit " + result.hits.length + " enemies for " + result.hits[0].damage + " each (defense ignored)");
  });

  canvas.addEventListener("click", function (event) {
    var rect = canvas.getBoundingClientRect();
    var x = (event.clientX - rect.left) * (canvas.width / rect.width);
    var y = (event.clientY - rect.top) * (canvas.height / rect.height);
    var angle = Math.atan2(y - tower.y, x - tower.x);
    var result = tower.reaim(angle);
    log(result.ok ? "re-aimed" : "re-aim blocked: " + result.reason);
  });

  // ---- boot -----------------------------------------------------------

  spawnEnemy({});
  spawnEnemy({});
  refreshPanel();
  requestAnimationFrame(frame);

})();
