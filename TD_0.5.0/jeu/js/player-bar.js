// ---------------------------------------------------------------------------
// PlayerBar -- the Player's controls DURING a run, and what they draw
//
// `PlayerRun` owns the rules; this file is the column of buttons down the left
// edge and the targeting that some of them open. It is the only place in the
// game that knows a Player action has a button at all.
//
// **IT SHOWS ONLY WHAT THE LOADOUT BROUGHT.** The bar is built from
// `PlayerPerks.has(...)` every frame, so a run with an empty loadout draws
// nothing at all and costs one array walk -- which is exactly what "un loadout
// vide reproduit le jeu actuel" has to mean for the interface too.
//
// **TARGETING IS FREE TO CANCEL.** Four of the controls do not act on the
// press: they arm a targeting mode and wait for a second click on the board.
// Escape and right-click both disarm it, and NOTHING is spent -- the cooldown
// starts on a successful activation and never on opening the picker. That is
// the brief's rule and it is why `press` only ever arms, while `pick` is what
// calls into PlayerRun.
//
// WHY A COLUMN ON THE LEFT. The bottom belongs to the build bar, the right to
// the inspection panel and the enemy sidebar, and the top-left to the wave
// readout. The left edge below that readout is the one band of chrome nothing
// else claims, and a column there never overlaps a tower the player is trying
// to click.
// ---------------------------------------------------------------------------

var PlayerBar = (function () {

  var BTN = 52, GAP = 8, LEFT = 18, TOP = 196;

  // What the player is currently pointing WITH, or null. `kind` is what a
  // legal target is; `id` is the action that will be spent when one is picked.
  var pending = null;

  // The last refusal, so a press that could not happen says why rather than
  // doing nothing. Cleared by the next press and by arming a target.
  var flash = null;
  var flashLeft = 0;

  function run() { return (typeof PlayerRun === "undefined") ? null : PlayerRun; }
  function has(id) {
    return (typeof PlayerPerks !== "undefined") && PlayerPerks.has(id);
  }

  // --- the actions -----------------------------------------------------------
  //
  // ONE ENTRY PER CONTROL THE LOADOUT BROUGHT, in a fixed order so the column
  // does not reshuffle itself between runs. Each answers four things: whether
  // it is there at all, whether it may be pressed, what its corner reads, and
  // what pressing it does.
  function actions() {
    var r = run();
    if (!r) return [];
    var out = [];

    if (has("player_commander_priority_order")) {
      out.push({
        id: "order", glyph: "◎", label: "Order",
        ready: r.markReady(),
        detail: r.markReady() ? "PICK" : Math.ceil(r.markCooldownLeft()) + "s",
        press: function () { arm("enemy", "order", "Click the enemy to mark."); }
      });
    }
    if (has("player_overdrive_order")) {
      out.push({
        id: "overdrive", glyph: "▲", label: "Overdrive",
        ready: r.overdriveReady(),
        detail: r.overdriveReady() ? "PICK" : "USED",
        press: function () {
          if (!r.overdriveReady()) return say("Overdrive: once a wave.");
          arm("tower", "overdrive", "Click the tower to overdrive.");
        }
      });
    }
    if (has("player_radar_sweep")) {
      out.push({
        id: "radar", glyph: "◈", label: "Radar",
        ready: r.radarReady(),
        detail: r.radarActive() ? Math.ceil(r.radarLeftSeconds()) + "s"
              : r.radarReady() ? "READY" : Math.ceil(r.radarCooldownLeft()) + "s",
        // THE ONLY ONE THAT ACTS ON THE PRESS. It has no target: it is the
        // whole board for eight seconds.
        press: function () { say(r.startRadar() || "Radar sweep."); }
      });
    }
    if (r.shieldEquipped()) {
      out.push({
        id: "shield", glyph: "⬡", label: "Shield",
        ready: true, on: r.shieldActive(),
        detail: r.shieldActive() ? "ON" : "OFF",
        press: function () { r.toggleShield(); }
      });
    }
    if (r.beaconRadiusUl() > 0) {
      out.push({
        id: "beacon", glyph: "✦", label: "Beacon",
        ready: !r.beacon() || betweenWaves(),
        detail: r.beacon() ? (betweenWaves() ? "MOVE" : "IN WAVE") : "PLACE",
        press: function () {
          if (r.beacon() && !betweenWaves()) {
            return say("The beacon only moves between waves.");
          }
          arm("ground", "beacon", "Click where the beacon should stand.");
        }
      });
    }
    if (r.totemMaxHp() > 0 && !r.totem()) {
      out.push({
        id: "totem", glyph: "▮", label: "Totem",
        ready: beforeFirstWave(),
        detail: beforeFirstWave() ? "PLACE" : "TOO LATE",
        press: function () {
          if (!beforeFirstWave()) {
            return say("The totem may only be placed before wave 1.");
          }
          arm("ground", "totem", "Click within 70 u.l. of the road.");
        }
      });
    }
    return out;
  }

  function arm(kind, id, hint) {
    pending = { kind: kind, id: id };
    say(hint);
  }

  function say(text) {
    if (!text) return;
    flash = text;
    flashLeft = 3;
  }

  function targeting() { return pending ? pending.kind : null; }
  function targetingAction() { return pending ? pending.id : null; }

  // CANCELLING COSTS NOTHING. Escape and right-click both come here, and the
  // action is neither spent nor put on cooldown -- opening a picker is not
  // using the thing.
  function cancel() {
    if (!pending) return false;
    pending = null;
    say("Cancelled — nothing was used.");
    return true;
  }

  function rectOf(i) {
    return { x: LEFT, y: TOP + i * (BTN + GAP), w: BTN, h: BTN };
  }

  // --- input -----------------------------------------------------------------

  // A CLICK ON THE COLUMN, or false when the click was somewhere else. Called
  // before the board sees it, so a press on a button never also places a tower.
  function onClick(x, y) {
    var list = actions();
    for (var i = 0; i < list.length; i++) {
      if (!pointInRect(x, y, rectOf(i))) continue;
      flash = null;
      list[i].press();
      return true;
    }
    return false;
  }

  // A CLICK ON THE BOARD while a target is armed. `world` is where it landed,
  // `enemy` and `tower` are what was under it -- game.js already knows both and
  // this file must not go looking for them a second way.
  function onWorldClick(world, enemy, tower) {
    if (!pending || !world) return false;
    var r = run();
    var kind = pending.kind, id = pending.id;

    if (kind === "enemy") {
      if (!enemy) { say("That is not an enemy — Escape to cancel."); return true; }
      var refused = r.order(enemy);
      pending = null;
      say(refused || "Marked.");
      return true;
    }
    if (kind === "tower") {
      if (!tower) { say("That is not a tower — Escape to cancel."); return true; }
      var no = r.startOverdrive(tower);
      pending = null;
      say(no || "Overdrive running.");
      return true;
    }
    if (id === "beacon") {
      var beaconNo = r.placeBeacon(world.x, world.y, !betweenWaves());
      pending = null;
      if (typeof PlayerEffects !== "undefined") PlayerEffects.refresh(towers);
      say(beaconNo || "Beacon set.");
      return true;
    }
    if (id === "totem") {
      // THE ONE PLACEMENT WITH A GROUND RULE: off the road, and within 70 u.l.
      // of it. Both are asked of the map rather than guessed, so a route with a
      // different shape needs nothing here.
      if (!totemSpotLegal(world.x, world.y)) {
        say("Off the road, and within 70 u.l. of it.");
        return true;
      }
      var totemNo = r.placeTotem(world.x, world.y, beforeFirstWave());
      pending = null;
      if (typeof PlayerEffects !== "undefined") PlayerEffects.refresh(towers);
      say(totemNo || "Totem planted.");
      return true;
    }
    return false;
  }

  // MAY THE TOTEM STAND HERE? Off the road, and no further than 70 u.l. from
  // it. The distance is measured to the nearest point of the nearest route, so
  // it means the same thing on a two-entrance map as on a straight one.
  var TOTEM_REACH_UL = 70;

  function totemSpotLegal(x, y) {
    if (typeof nearestPathTo !== "function") return true;
    var near = nearestPathTo(x, y);
    if (!near || !near.path) return true;
    var half = (typeof roadHalfWidthAt === "function")
      ? roadHalfWidthAt(near.path, near.progress) : ul(ROAD_WIDTH_UL / 2);
    if (near.distance <= half) return false;              // on the road
    return near.distance <= ul(TOTEM_REACH_UL);
  }

  function onKey(key) {
    if (key === "Escape") return cancel();
    return false;
  }

  function update(dt) {
    if (flashLeft > 0) {
      flashLeft -= dt;
      if (flashLeft <= 0) flash = null;
    }
  }

  // --- drawing ---------------------------------------------------------------

  function draw() {
    var list = actions();
    if (!list.length && !pending) return;

    for (var i = 0; i < list.length; i++) drawButton(list[i], rectOf(i));

    // WHAT IS ARMED, AND HOW TO GET OUT OF IT, said where the cursor is going
    // to be rather than in a corner.
    if (pending) {
      ctx.textAlign = "center";
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,225,180,0.95)";
      ctx.fillText("Pick a target  ·  Escape or right-click to cancel",
        VIEW_WIDTH / 2, 108);
      ctx.textAlign = "left";
    }
    if (flash) {
      ctx.textAlign = "center";
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,205,150,0.95)";
      ctx.fillText(flash, VIEW_WIDTH / 2, 128);
      ctx.textAlign = "left";
    }
  }

  function drawButton(action, r) {
    var armed = pending && pending.id === action.id;
    ctx.fillStyle = armed ? "rgba(60,44,26,0.95)"
      : action.on ? "rgba(30,52,34,0.9)" : "rgba(14,12,16,0.82)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.lineWidth = armed ? 2.4 : 1.4;
    ctx.strokeStyle = armed ? "rgba(255,200,120,0.95)"
      : action.ready ? "rgba(240,164,92,0.7)" : "rgba(150,140,140,0.35)";
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    ctx.textAlign = "center";
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillStyle = action.ready ? "rgba(255,224,180,0.95)" : "rgba(180,170,170,0.5)";
    ctx.fillText(action.glyph, r.x + r.w / 2, r.y + 26);

    ctx.font = "9px system-ui, sans-serif";
    ctx.fillStyle = "rgba(220,200,180,0.75)";
    ctx.fillText(fitText(ctx, action.label, r.w - 4), r.x + r.w / 2, r.y + 38);
    ctx.fillStyle = action.ready ? "rgba(240,164,92,0.9)" : "rgba(200,120,110,0.85)";
    ctx.fillText(fitText(ctx, action.detail, r.w - 4), r.x + r.w / 2, r.y + 48);
    ctx.textAlign = "left";
  }

  // EVERYTHING THE PLAYER'S MODULES PUT ON THE BOARD, drawn under the chrome
  // and over the world. Placeholder shapes throughout -- the point is that every
  // state is legible, not that it is pretty.
  function drawWorld() {
    var r = run();
    if (!r) return;

    // The beacon and its circle. The circle is drawn while it is being placed
    // too, so the player can see what they are about to cover.
    var beacon = r.beacon();
    if (beacon) drawRing(beacon.x, beacon.y, ul(r.beaconRadiusUl()), "120,190,255");
    if (pending && pending.id === "beacon" && typeof worldMouse !== "undefined" &&
        worldMouse) {
      drawRing(worldMouse.x, worldMouse.y, ul(r.beaconRadiusUl()), "120,190,255");
    }

    // The totem: a post with a health bar, and its legality shown while placing.
    var totem = r.totem();
    if (totem && totem.alive) drawTotem(totem);
    if (pending && pending.id === "totem" && typeof worldMouse !== "undefined" &&
        worldMouse) {
      var legal = totemSpotLegal(worldMouse.x, worldMouse.y);
      drawRing(worldMouse.x, worldMouse.y, ul(10),
        legal ? "150,230,150" : "240,120,110");
    }

    // The mark over its enemy, and the tower carrying the permit.
    var marked = r.markedEnemy();
    if (marked && marked.pos) drawMark(marked.pos.x, marked.pos.y);
    var holder = r.permitHolder();
    if (holder) drawRing(holder.x, holder.y, ul(14), "230,190,110");
  }

  // THROUGH THE CAMERA, like every other world ring on this board. A plain
  // `ctx.arc` at a world coordinate is only correct on the flat fallback: on
  // the 3D board the world transform is a projection the 2D context cannot
  // express, and the ring lands somewhere else entirely. `projectRing` is the
  // one helper every other world circle in this game already goes through.
  function camera() {
    return (typeof World3D !== "undefined" && World3D.isEnabled() && World3D.camera)
      ? World3D.camera() : null;
  }

  function drawRing(x, y, radius, rgb) {
    var ring = [];
    for (var k = 0; k <= 48; k++) {
      var a = k / 48 * Math.PI * 2;
      ring.push([x + Math.cos(a) * radius, y + Math.sin(a) * radius]);
    }
    var pts = (typeof projectRing === "function") ? projectRing(ring, camera()) : ring;
    if (!pts || !pts.length) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.strokeStyle = "rgba(" + rgb + ",0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Where a world point lands on screen, for the flat shapes below. The
  // identity on the 2D fallback, which is what makes one code path correct on
  // both boards.
  function at(x, y) {
    var cam = camera();
    if (!cam) return { x: x, y: y };
    var h = (typeof World3D !== "undefined" && World3D.groundHeightAt)
      ? World3D.groundHeightAt(x, y) : 0;
    return cam.worldToScreen(x, y, h) || { x: -9999, y: -9999 };
  }

  function drawTotem(totem) {
    var p = at(totem.x, totem.y);
    var w = 12, h = 30;
    ctx.fillStyle = "rgba(90,70,110,0.95)";
    ctx.fillRect(p.x - w / 2, p.y - h, w, h);
    ctx.strokeStyle = "rgba(200,170,240,0.8)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p.x - w / 2, p.y - h, w, h);
    var frac = Math.max(0, Math.min(1, totem.hp / totem.maxHp));
    ctx.fillStyle = "rgba(20,16,20,0.85)";
    ctx.fillRect(p.x - w, p.y - h - 9, w * 2, 4);
    ctx.fillStyle = "rgba(150,230,150,0.9)";
    ctx.fillRect(p.x - w, p.y - h - 9, w * 2 * frac, 4);
  }

  function drawMark(x, y) {
    var p = at(x, y), s = 11;
    ctx.strokeStyle = "rgba(255,180,90,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y - s * 2.4); ctx.lineTo(p.x, p.y - s * 1.2);
    ctx.lineTo(p.x + s, p.y - s * 2.4);
    ctx.stroke();
  }

  // THE READOUT, beside the base's own. Only the lines the loadout earns: the
  // streak's charges, a debt in red, and what the shield last prevented.
  function drawReadout(x, y) {
    var r = run();
    if (!r) return y;
    var lines = [];
    if (typeof PlayerPerks !== "undefined") {
      var res = PlayerPerks.resolved();
      if (res.streakMaxCharges > 0) {
        lines.push({ text: "Streak " + r.streakCharges() + " / " +
                           res.streakMaxCharges, rgb: "150,230,150" });
      }
      if (res.noLeakBounty > 0 && r.bountyPending() > 0) {
        lines.push({ text: "+" + r.bountyPending() + " mana next wave",
                     rgb: "150,230,150" });
      }
      if (res.debtLimit > 0 && cash < 0) {
        lines.push({ text: "DEBT " + Math.round(-cash) + " / " + res.debtLimit +
                           "  ·  +" + res.debtInterestPct + "% a wave",
                     rgb: "240,110,100" });
      }
      var last = r.lastAbsorption();
      if (r.shieldActive() && last.prevented > 0) {
        lines.push({ text: "Shield stopped " + Math.round(last.prevented) +
                           " for " + Math.round(last.mana) + " mana",
                     rgb: "150,200,255" });
      }
    }
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    lines.forEach(function (line) {
      ctx.fillStyle = "rgba(" + line.rgb + ",0.95)";
      ctx.fillText(line.text, x, y);
      y += 16;
    });
    return y;
  }

  return {
    actions: actions,
    rectOf: rectOf,
    onClick: onClick,
    onWorldClick: onWorldClick,
    onKey: onKey,
    cancel: cancel,
    update: update,
    draw: draw,
    drawWorld: drawWorld,
    drawReadout: drawReadout,
    targeting: targeting,
    targetingAction: targetingAction,
    totemSpotLegal: totemSpotLegal,
    // Read by the tests: the last thing the bar said, so a refusal is
    // assertable without reading pixels.
    flash: function () { return flash; }
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = PlayerBar;
}
