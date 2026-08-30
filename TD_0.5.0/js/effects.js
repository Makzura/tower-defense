// ---------------------------------------------------------------------------
// Effects
//
// Cosmetic feedback: death bursts, cash popups, the red flash when the base
// is hit, the wave announcement banner, and the Warbringer earthquake's
// camera kick / temporary floor fissures. Everything here is PRESENTATION.
// Nothing in this file may touch simulation state, and nothing in the
// simulation may read anything back out of it -- an Effects-free game must
// play identically (tests pin kill/leak/cash outcomes, and they run with
// these effects live).
//
// It still UPDATES from update() rather than from draw(), so effect timing is
// tied to the same fixed step as everything else and freezes when the
// simulation freezes (loss, victory, the death-denial rewind). That is the
// correct look: when time stops, everything stops.
//
// Math.random() appears here and nowhere else in the game loop. That is safe
// precisely because nothing simulated depends on these numbers -- do not let
// a gameplay value be derived from a particle.
//
// World effects are drawn inside the camera transform and screen effects are
// drawn after it, both below interface chrome (see draw() in game.js). That is
// why a quake moves the battlefield without making the HUD illegible.
// ---------------------------------------------------------------------------

var Effects = (function () {
  var particles = [];
  var popups = [];
  var aoeImpacts = [];
  var banner = null;        // { title, subtitle, timer }
  var baseFlash = 0;        // 0..1, red screen-edge pulse when the base is hit
  var quakeShake = 0;       // seconds left in the camera kick
  var quakeCracks = [];     // floor-only fissures, each with a short lifetime

  // Hard cap so a mass kill cannot grow the array without bound. Oldest are
  // dropped first; nobody notices a spark that vanished early in a screenful
  // of them. The impact cap matters most on a B4 chain that kills a crowd:
  // one impact per resolved blast, and a long chain would otherwise queue
  // dozens in a single step.
  var MAX_PARTICLES = 400;
  var MAX_AOE_IMPACTS = 72;

  var BANNER_SECONDS = 2.4;
  var QUAKE_SHAKE_SECONDS = 0.75;
  var QUAKE_CRACK_SECONDS = 2.4;
  var QUAKE_SHAKE_PX = 10;

  // `lift` is how far ABOVE its ground contact the burst starts, in pixels.
  // Almost everything that throws sparks throws them off the floor and leaves
  // it at zero. A flier does not: an Aether Wisp dies three and a half radii up
  // and its debris came out of the road underneath it, which read as something
  // else exploding. Carried rather than folded into `y`, because on the 3D
  // board a lift is a real height and baking it into a world coordinate would
  // slide the burst northwards across the map instead of raising it.
  function spawnParticle(x, y, color, speed, size, life, lift) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    var angle = Math.random() * Math.PI * 2;
    var v = speed * (0.35 + Math.random() * 0.65);
    particles.push({
      x: x, y: y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: life, maxLife: life,
      size: size * (0.6 + Math.random() * 0.8),
      color: color,
      lift: lift || 0
    });
  }

  function makeCrack(x, y, angle, length) {
    var points = [{ x: x, y: y }];
    var px = x;
    var py = y;
    var heading = angle;
    var steps = 3 + Math.floor(Math.random() * 3);

    for (var i = 0; i < steps; i++) {
      heading += (Math.random() - 0.5) * 0.7;
      var step = length / steps * (0.75 + Math.random() * 0.5);
      px += Math.cos(heading) * step;
      py += Math.sin(heading) * step;
      points.push({ x: px, y: py });
    }

    return {
      points: points,
      life: QUAKE_CRACK_SECONDS,
      maxLife: QUAKE_CRACK_SECONDS
    };
  }

  function earthquake(x, y) {
    quakeShake = QUAKE_SHAKE_SECONDS;
    quakeCracks = [];

    // A radial break at the Warbringer's landing point says what caused the
    // quake. Scattered secondary fissures make the map-wide reach legible.
    for (var i = 0; i < 12; i++) {
      var angle = i * Math.PI * 2 / 12 + (Math.random() - 0.5) * 0.18;
      quakeCracks.push(makeCrack(x, y, angle, 85 + Math.random() * 95));
    }
    for (i = 0; i < 20; i++) {
      quakeCracks.push(makeCrack(
        35 + Math.random() * (VIEW_WIDTH - 70),
        35 + Math.random() * (VIEW_HEIGHT - 105),
        Math.random() * Math.PI * 2,
        28 + Math.random() * 62
      ));
    }

    // A low dust bloom binds the camera kick and the cracks to the landing.
    for (i = 0; i < 28; i++) {
      spawnParticle(x, y, "192,166,220", 185, 4, 0.8);
    }
  }

  // `terrainImpact` stood here and marked where a round died on a rock. Rounds
  // do not die on rocks any more (2026-08-27 -- see the note at the top of
  // js/bullet.js), so the mark had nothing left to explain and went with the
  // collision rather than staying as an effect nothing fires.

  // A visible point of contact for area damage. `kind` is presentation data
  // only and doubles as the VisualModels effect id, so a future skin pack can
  // replace Warbringer and arcane impacts independently.
  //
  // Distinct from earthquake() above, which is one map-wide event with a
  // camera kick. This is the ordinary per-blast mark: emitted once per actual
  // attack, never once per draw frame.
  // `extra` is merged onto the impact and handed to whatever renderer claims
  // this kind. It exists because not every mark is a circle: a beam remnant
  // needs a second endpoint, which x/y/radius cannot express. Two reserved
  // keys -- `life` overrides how long it lasts, `particles: false` suppresses
  // the debris burst, which a clean energy beam should not throw.
  function aoeImpact(x, y, radius, kind, extra) {
    if (aoeImpacts.length >= MAX_AOE_IMPACTS) aoeImpacts.shift();
    kind = kind || "area";
    var life = kind.indexOf("arcane") === 0 ? 0.72 : 0.58;
    if (extra && typeof extra.life === "number") life = extra.life;

    var impact = {
      x: x, y: y, radius: Math.max(8, radius || 8), kind: kind,
      life: life, maxLife: life,
      seed: Math.abs(Math.round(x * 17 + y * 31))
    };
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key) &&
            key !== "life" && key !== "particles") {
          impact[key] = extra[key];
        }
      }
    }
    aoeImpacts.push(impact);

    if (extra && extra.particles === false) return;

    var color = kind.indexOf("arcane") === 0 ? "188,160,255" : "238,184,108";
    var count = kind.indexOf("hit") !== -1 ? 3 : 8;
    for (var i = 0; i < count; i++) {
      spawnParticle(x, y - 3, color, 70 + Math.min(100, radius * 1.5),
        kind.indexOf("arcane") === 0 ? 3.2 : 2.6, life * 0.9);
    }
  }

  // The impact layer, drawn at the top of the world effects so a hit can never
  // disappear under the crowd it struck.
  function drawAoeImpacts(ctx) {
    for (var i = 0; i < aoeImpacts.length; i++) {
      var impact = aoeImpacts[i];
      if (VisualModels.draw("effect", impact.kind, ctx, impact)) continue;

      var progress = 1 - impact.life / impact.maxLife;
      var fade = 1 - progress;
      var arcane = impact.kind.indexOf("arcane") === 0;
      var hitOnly = impact.kind.indexOf("hit") !== -1;
      var rgb = arcane ? "188,160,255" : "238,184,108";
      var front = impact.radius * (0.18 + progress * 0.95);

      Visuals3Q.groundBurst(ctx, impact.x, impact.y, front, rgb,
        (hitOnly ? 0.55 : 0.78) * fade, progress);
      if (!hitOnly) {
        Visuals3Q.groundBurst(ctx, impact.x, impact.y,
          impact.radius * (0.08 + progress * 0.62),
          arcane ? "236,226,255" : "255,238,195", 0.58 * fade, progress);
      }

      // Deterministic fissures/rays spread in the projected ground plane.
      var rays = hitOnly ? 3 : 7;
      ctx.lineCap = "round";
      for (var ray = 0; ray < rays; ray++) {
        var angle = (impact.seed % 17) * 0.11 + ray * Math.PI * 2 / rays;
        var reach = front * (0.5 + (ray % 3) * 0.13);
        ctx.beginPath();
        ctx.moveTo(impact.x, impact.y);
        ctx.lineTo(impact.x + Math.cos(angle) * reach * 0.52,
          impact.y + Math.sin(angle) * reach * 0.52 * Visuals3Q.GROUND_SQUASH);
        ctx.lineTo(impact.x + Math.cos(angle + 0.16) * reach,
          impact.y + Math.sin(angle + 0.16) * reach * Visuals3Q.GROUND_SQUASH);
        ctx.lineWidth = Math.max(0.8, 2.2 * fade);
        ctx.strokeStyle = "rgba(" + rgb + "," + (0.5 * fade).toFixed(3) + ")";
        ctx.stroke();
      }

      // Arcane B5 also punches upward: a short pillar and converging shards
      // make it unmistakably different from the Warbringer's ground slam.
      if (arcane && !hitOnly) {
        var columnH = Math.min(72, impact.radius * 1.6) * fade;
        ctx.beginPath();
        ctx.moveTo(impact.x, impact.y);
        ctx.lineTo(impact.x, impact.y - columnH);
        ctx.lineWidth = 10 * fade;
        ctx.strokeStyle = "rgba(164,132,255," + (0.18 * fade).toFixed(3) + ")";
        ctx.stroke();
        ctx.lineWidth = 2.5 * fade;
        ctx.strokeStyle = "rgba(244,240,255," + (0.75 * fade).toFixed(3) + ")";
        ctx.stroke();

        for (var shard = 0; shard < 4; shard++) {
          var sx = (shard - 1.5) * impact.radius * 0.23;
          ctx.beginPath();
          ctx.moveTo(impact.x + sx, impact.y - 4 - shard * 2);
          ctx.lineTo(impact.x + sx * 0.45, impact.y - columnH * 0.72);
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = "rgba(214,198,255," + (0.5 * fade).toFixed(3) + ")";
          ctx.stroke();
        }
      }
    }
  }

  function beginWorld(ctx) {
    if (quakeShake <= 0) return;

    // Two mismatched frequencies avoid a smooth circular wobble. The envelope
    // falls to zero quickly, so the battlefield snaps back rather than drifts.
    var elapsed = QUAKE_SHAKE_SECONDS - quakeShake;
    var power = quakeShake / QUAKE_SHAKE_SECONDS;
    var x = (Math.sin(elapsed * 91) * QUAKE_SHAKE_PX +
      Math.sin(elapsed * 157) * 3) * power;
    var y = (Math.cos(elapsed * 73) * QUAKE_SHAKE_PX * 0.7 +
      Math.sin(elapsed * 131) * 3) * power;
    ctx.translate(x, y);
  }

  function drawGround(ctx) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (var i = 0; i < quakeCracks.length; i++) {
      var crack = quakeCracks[i];
      var alpha = Math.min(1, crack.life / 0.8);
      var points = crack.points;

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var p = 1; p < points.length; p++) {
        ctx.lineTo(points[p].x, points[p].y);
      }
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(8,9,14," + (0.68 * alpha).toFixed(3) + ")";
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(198,164,255," + (0.62 * alpha).toFixed(3) + ")";
      ctx.stroke();
    }
  }

  function drawWorld(ctx) {
    var i;

    // Area impacts touch the ground before their sparks rise.
    drawAoeImpacts(ctx);

    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = p.life / p.maxLife;
      ctx.beginPath();
      // The flat board spends a launch height as a screen offset, which is the
      // same trick every other lifted body on it uses.
      ctx.arc(p.x, p.y - (p.lift || 0), p.size * a, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + p.color + "," + (0.85 * a).toFixed(3) + ")";
      ctx.fill();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (i = 0; i < popups.length; i++) {
      var pop = popups[i];
      var alpha = Math.min(1, pop.life / (pop.maxLife * 0.5));
      ctx.font = "600 14px system-ui, sans-serif";
      // `rgb` lets a popup pick its own colour; without one it is the gold a
      // gain has always been, or red when it is a loss. The Farm's per-kill
      // bonus uses it so that a bounty and a farm's share of the same corpse
      // are told apart by colour as well as by position.
      ctx.fillStyle = pop.rgb
        ? "rgba(" + pop.rgb + "," + alpha.toFixed(3) + ")"
        : (pop.bad
          ? "rgba(240,120,110," + alpha.toFixed(3) + ")"
          : "rgba(255,215,110," + alpha.toFixed(3) + ")");
      ctx.fillText(pop.text, pop.x, pop.y - (pop.lift || 0));
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  // The banner is CENTRED, which is what makes its overflow dangerous: an
  // over-long title does not run off the right edge, it loses half a name off
  // EACH SIDE at once and reads as a broken build rather than as a long name.
  // Both banner lines were drawn with a bare fillText and no width, so that
  // failure was silent and total. It became reachable when boss titles started
  // being composed -- `displayName` plus an `announceSuffix` like
  // " COMMITS ITS RESERVES" -- so the string is data now, not a constant.
  //
  // SHRINK TO FIT, NEVER CLIP, AND NO MINIMUM SIZE.
  //
  // `fitText` in game.js is the house helper and it ELLIPSISES. That is right
  // for a panel and wrong here: an ellipsised proper noun is the one string a
  // player cannot mentally complete, and "THE ABATTOIR COMMITS ITS RESER..."
  // at the campaign's loudest moment reads worse than a small name. Shrinking
  // also keeps the incentive to choose short names honest, since a long one
  // still looks visibly weaker at the moment it most wants to look strong.
  //
  // THERE IS DELIBERATELY NO FLOOR. A minimum font size would reintroduce
  // clipping below it, and "how small can 700-weight text be and still read"
  // is a legibility judgement no width measurement can settle -- it wants a
  // person looking at a rendered A/B, not a number. The `> 1` below is a
  // loop bound, NOT a designed minimum; do not read it as one.
  //
  // WHY `measureText` AT RUNTIME RATHER THAN A TABLE. `system-ui` resolves to
  // a different family per platform -- San Francisco on macOS, Segoe UI on
  // Windows -- so any advance table measured on one machine is wrong on
  // another, and the honest ceiling would be the minimum across every shipped
  // platform. Measuring here measures the player's ACTUAL resolved font on
  // the player's ACTUAL machine, so the whole cross-platform problem
  // disappears instead of being managed. That is juno's argument and it
  // retired a measurement job rather than completing one.
  function setBannerFont(ctx, text, weight, basePx) {
    var px = basePx;
    var maxWidth = VIEW_WIDTH - 80;   // 40 px of air each side at 1280
    ctx.font = weight + " " + px + "px system-ui, sans-serif";
    var w = ctx.measureText(text || "").width;
    if (w <= maxWidth) return;
    // One proportional guess, then step. The guess is NOT trusted: advances
    // are only approximately linear in size for a given face, and hinting and
    // sub-pixel rounding break it at small sizes -- 17 px is small. The loop
    // is what guarantees the fit; the guess only makes it short.
    px = Math.max(1, Math.floor(px * maxWidth / w));
    ctx.font = weight + " " + px + "px system-ui, sans-serif";
    while (px > 1 && ctx.measureText(text || "").width > maxWidth) {
      px -= 1;
      ctx.font = weight + " " + px + "px system-ui, sans-serif";
    }
  }

  function drawScreen(ctx) {
    if (baseFlash > 0) {
      // Screen-edge pulse, not a full wash: it must read as "the base was
      // hit" without hiding the enemy that did it.
      var f = baseFlash * baseFlash;    // ease out
      ctx.fillStyle = "rgba(224,90,80," + (0.05 * f).toFixed(3) + ")";
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      ctx.lineWidth = 22;
      ctx.strokeStyle = "rgba(224,90,80," + (0.35 * f).toFixed(3) + ")";
      ctx.strokeRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    }

    if (banner) {
      // Fade in fast, hold, fade out -- the classic announcement envelope.
      var t = BANNER_SECONDS - banner.timer;
      var bAlpha = Math.min(1, t / 0.25, banner.timer / 0.5);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(207,227,255," + (0.95 * bAlpha).toFixed(3) + ")";
      setBannerFont(ctx, banner.title, "700", 44);
      ctx.fillText(banner.title, VIEW_WIDTH / 2, 150);

      if (banner.subtitle) {
        ctx.fillStyle = "rgba(199,209,224," + (0.8 * bAlpha).toFixed(3) + ")";
        setBannerFont(ctx, banner.subtitle, "600", 17);
        ctx.fillText(banner.subtitle, VIEW_WIDTH / 2, 186);
      }
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  return {
    // READ-ONLY view of the live cosmetic state, for the 3D renderer. Its
    // camera is a perspective projection, so it cannot reuse drawWorld's
    // flat-transform drawing; it projects each particle, popup and impact
    // itself instead. Handing out the arrays rather than copies is safe on
    // the same terms as every draw() in this game: renderers treat their
    // subject as read-only.
    worldState: function () {
      return { particles: particles, popups: popups, aoeImpacts: aoeImpacts };
    },

    reset: function () {
      particles = [];
      popups = [];
      aoeImpacts = [];
      banner = null;
      baseFlash = 0;
      quakeShake = 0;
      quakeCracks = [];
    },

    // An enemy died to the player. Burst in the enemy's own colour, plus its
    // one-time authored kill bounty.
    enemyKilled: function (enemy, cashEarned) {
      var c = enemy.type.color;
      var color = c.r + "," + c.g + "," + c.b;
      // From the BODY, not from the ground under it. `visualBodyLift` is the
      // one place that knows how high a type is drawn.
      var lift = enemy.visualBodyLift ? enemy.visualBodyLift() : 0;
      for (var i = 0; i < 10; i++) {
        spawnParticle(enemy.pos.x, enemy.pos.y, color, 90, 3, 0.5, lift);
      }
      popups.push({
        x: enemy.pos.x, y: enemy.pos.y - 18,
        text: "+" + cashEarned + " mana",
        lift: lift,
        life: 0.9, maxLife: 0.9
      });
    },

    // A FARM PAID. Same popup an enemy's bounty gets, over the tower that made
    // it, because a Farm's production had no visible sign at all: it lands at
    // the wave boundary, into a purse that is moving anyway from bounties, and
    // a player who places one and watches sees nothing happen. Owner, having
    // done exactly that: "the tower is supposed to produce mana, and it doesn't
    // rn". It did, at 200 a wave. Nothing said so.
    //
    // `stored` says the mana went into the farm's own stock (path A from A4)
    // rather than into the purse -- the same event, a different destination,
    // and the player should be able to tell which without opening the panel.
    farmProduced: function (tower, amount, stored) {
      if (amount <= 0) return;
      popups.push({
        x: tower.x, y: tower.y - 18,
        text: "+" + Math.round(amount) + (stored ? " stored" : " mana"),
        life: 1.1, maxLife: 1.1
      });
    },

    // A PATH-B FARM WAS PAID FOR A BODY THAT DIED IN ITS CIRCLE, and this is
    // its own popup rather than a bigger number on the bounty's. Owner: "on the
    // bounty, it's separated -- imagine it gives four and the tower gives one,
    // it's written +4 and +1, not +5."
    //
    // Offset ABOVE the bounty popup and drawn in the farm's green, so the two
    // read as two sources rather than one figure that moved. Several farms
    // covering the same corpse stack their offsets, which is correct: each of
    // them really was paid.
    farmKillBonus: function (farm, enemy, mana, baseHp) {
      if (mana <= 0 && baseHp <= 0) return;
      var bits = [];
      if (mana > 0) bits.push("+" + mana + " mana");
      if (baseHp > 0) bits.push("+" + baseHp + " HP");
      // ABOVE the bounty through `lift`, not through `y`. On the 3D board a
      // popup's y is a world coordinate and its lift is a HEIGHT, so shifting
      // y moves this label northwards across the map and lands it on top of the
      // bounty anyway -- measured: two popups 16 world units apart projected
      // into one 18px band. Lift is the axis that means "above" on both boards.
      var lift = (enemy.visualBodyLift ? enemy.visualBodyLift() : 0) + 22;
      popups.push({
        x: enemy.pos.x, y: enemy.pos.y - 18,
        text: bits.join("  "),
        lift: lift,
        life: 1.0, maxLife: 1.0,
        rgb: "150,225,160"
      });
    },

    // A tower was destroyed -- by an Angry enemy chewing through it, or by
    // the Longshot's B5 burning its last max HP. Grey debris rather than the
    // enemy palette, and a label, because losing a tower is the kind of thing
    // a player needs to be told rather than left to notice from an empty
    // patch of ground.
    towerDestroyed: function (tower) {
      for (var i = 0; i < 14; i++) {
        spawnParticle(tower.x, tower.y, "180,190,210", 110, 3.5, 0.7);
      }
      popups.push({
        x: tower.x, y: tower.y - 18,
        text: tower.name + " destroyed",
        life: 1.4, maxLife: 1.4
      });
    },

    // An enemy reached the base. Red pulse at the leak point and around the
    // screen edge, and the damage it cost, so a leak is never silent.
    baseHit: function (x, y, hpLost) {
      baseFlash = 1;
      for (var i = 0; i < 12; i++) {
        spawnParticle(x, y, "224,90,80", 130, 3.5, 0.6);
      }
      popups.push({
        x: x, y: y - 20,
        text: "-" + hpLost + " HP",
        life: 1.1, maxLife: 1.1,
        bad: true
      });
    },

    announce: function (title, subtitle) {
      banner = { title: title, subtitle: subtitle || "", timer: BANNER_SECONDS };
    },

    earthquake: earthquake,
    beginWorld: beginWorld,
    aoeImpact: aoeImpact,

    update: function (dt) {
      var i;
      for (i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 3 * dt;      // drag, so bursts bloom and settle
        p.vy *= 1 - 3 * dt;
      }

      for (i = popups.length - 1; i >= 0; i--) {
        popups[i].life -= dt;
        popups[i].y -= 26 * dt;  // drift upward
        if (popups[i].life <= 0) popups.splice(i, 1);
      }

      for (i = aoeImpacts.length - 1; i >= 0; i--) {
        aoeImpacts[i].life -= dt;
        if (aoeImpacts[i].life <= 0) aoeImpacts.splice(i, 1);
      }

      if (banner) {
        banner.timer -= dt;
        if (banner.timer <= 0) banner = null;
      }

      if (baseFlash > 0) baseFlash = Math.max(0, baseFlash - dt * 1.6);

      if (quakeShake > 0) quakeShake = Math.max(0, quakeShake - dt);
      for (i = quakeCracks.length - 1; i >= 0; i--) {
        quakeCracks[i].life -= dt;
        if (quakeCracks[i].life <= 0) quakeCracks.splice(i, 1);
      }
    },

    drawGround: drawGround,
    drawWorld: drawWorld,
    drawScreen: drawScreen,

    // Kept as a complete, untransformed draw for small standalone consumers.
    // game.js uses the three layers above so the camera can move only the map.
    draw: function (ctx) {
      drawGround(ctx);
      drawWorld(ctx);
      drawScreen(ctx);
    }
  };
})();
