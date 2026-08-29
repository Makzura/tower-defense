// ---------------------------------------------------------------------------
// The Draw -- art pack for the enemy faction.
//
// Loaded AFTER js/visuals.js in index.html. Registers nothing but renderers:
// no rule, range, speed, reward or hit box is touched by anything in this
// file, and the game still runs correctly with the <script> tag removed --
// every model here falls back to the built-in three-quarter body.
//
// ASSETS ARE LOOSE PNGs FOR NOW. AGENTS.md's hard constraints say the game
// draws everything procedurally and loads nothing external, because it has to
// run by double-clicking index.html. `fetch` and XHR really are blocked over
// file:// -- but an Image() src is NOT, so these sheets load and draw fine
// from a bare folder. That is a development convenience, not a decision: the
// release form is the same sheets base64-encoded into a .js file, which needs
// no other change here because `source` is handed straight to Image().
//
// Sheets are produced by tools/blender/*.py. The ordinary grid is one ROW per
// facing direction (rendered enemies: 8; sniper: 48, counter-clockwise from
// "facing screen right") and one COLUMN per animation frame. High-resolution
// A5/B5 page their 48 directions into three 16-row bands laid left-to-right;
// tile sizes and directionRows below must match the renderer.
// ---------------------------------------------------------------------------

(function () {
  if (typeof VisualModels === "undefined") return;

  // BUMP THIS WHENEVER A SHEET IS RE-RENDERED.
  //
  // Browsers cache file:// images hard, and a cached sheet is not merely
  // stale -- it is the WRONG SHAPE. When the body sheet went from one frame
  // to four its width went 256 -> 1024, and the cached 256-wide image made
  // every frame past the first read off the end and draw nothing. It looks
  // exactly like a broken animation and it is not: it is last week's file.
  //
  // A version in the query string is the cheapest fix that survives a
  // double-clicked index.html with no server to set cache headers.
  var ASSET_VERSION = "14";

  function asset(name) {
    return "assets/" + name + ".png?v=" + ASSET_VERSION;
  }

  var TILE_W = 128;
  var TILE_H = 160;

  // Fraction of a tile's height the model actually fills, measured up from
  // the tile's bottom edge. MEASURED, NOT ESTIMATED -- tools/blender's
  // render_sheet prints it from the rendered alpha channel, and it is printed
  // rather than computed because the ANIMATION moves the model after the
  // geometry is authored, so anything derived from ortho_scale and body
  // height is wrong by however far the walk cycle dips.
  //
  // Feeds VisualModels' `topY`, which is what puts a health bar above the
  // head instead of through the chest. Re-measure on every model change; a
  // stale value here shows up as a bar floating in empty space.
  //
  // The camera places Blender's world origin at 86% of each tile's height
  // (0.5 frame centre + td_scene's 0.36 camera rise). That fixed pivot, not a
  // frame's lowest alpha pixel, is the ground contract: a forward lifted foot
  // can project below a planted rear foot in this camera. enemyGroundLift
  // aligns the invariant world origin to the path without making the whole
  // body bob as different feet exchange screen-depth order.
  var NORMAL_CONTENT_TOP = 0.8438;
  var SWARM_CONTENT_TOP = 0.6875;
  var BRUTE_CONTENT_TOP = 0.6937;
  // The shield projectors sit one two-pixel row above Hive's base silhouette,
  // so one safe public metric uses the taller of the two aligned sheets.
  var HIVE_CONTENT_TOP = 0.5750;

  // How big a sheet draws, as a multiple of the enemy's own radius. Derived,
  // not picked: MODEL_SKINS_GUIDE suggests about 2.6x radius wide for a body,
  // and this model occupies roughly three quarters of its tile, so 3.6 x 4.5
  // puts the creature itself back at about 2.7 x 3.4 radii. Tile aspect is
  // 128:160 = 0.8, and 3.6:4.5 is 0.8, so nothing is stretched.
  function sheetWidth(enemy) { return enemy.radiusPx() * 3.6; }
  function sheetHeight(enemy) { return enemy.radiusPx() * 4.5; }

  // Which way it is walking. The path tangent is already in screen space;
  // registerSpriteSheet undoes the ground squash before choosing a row.
  function pathHeading(enemy) {
    if (!enemy.path || typeof enemy.path.tangentAt !== "function") return null;
    return enemy.path.tangentAt(enemy.progress);
  }

  // THE WALK IS DRIVEN BY DISTANCE, NOT BY A CLOCK.
  //
  // A clock-driven loop plays at a fixed rate whatever the enemy is doing, so
  // the feet and the ground disagree and the whole thing looks like a sticker
  // being dragged along the road. Advancing the cycle by how far it has
  // actually walked ties the two together: one full cycle per stride, feet
  // planted, and it comes out right for free in every case that changes speed
  // -- a `fast` covers ground quicker so its legs move quicker, a slowed
  // enemy's legs drag, and a stationary one stops mid-step.
  //
  // Each constant is the stride: how far that rig travels per complete
  // 8-frame cycle, as a fraction of its drawn height. Normal's follows from
  // its hip height and 28-degree swing; Brute and Hive take far shorter,
  // weight-bearing steps. The honest test is whether a planted foot stays on
  // one patch of road, so these are measured from evaluated Blender soles.
  var NORMAL_WALK_STRIDE_PER_HEIGHT = 0.62;
  var SWARM_WALK_STRIDE_PER_HEIGHT = 0.192;
  var BRUTE_WALK_STRIDE_PER_HEIGHT = 0.16;
  var HIVE_WALK_STRIDE_PER_HEIGHT = 0.11;

  function walkFrame(enemy, frames, stridePerHeight) {
    var stride = sheetHeight(enemy) *
      (stridePerHeight === undefined
        ? NORMAL_WALK_STRIDE_PER_HEIGHT : stridePerHeight);
    if (!(stride > 0)) return 0;
    return enemy.progress * frames / stride;
  }

  var ENEMY_ROOT_ANCHOR_Y = 0.86;
  function enemyGroundLift(enemy) {
    return -sheetHeight(enemy) * (1 - ENEMY_ROOT_ANCHOR_Y);
  }

  // THE TWO MOST EXPENSIVE THINGS A 2D CANVAS CAN DO, AND THE RULE FOR THEM.
  //
  // `ctx.filter` and canvas shadows are not ordinary state changes. Each one
  // forces the round of drawing it wraps onto a separate surface, filters or
  // blurs that surface, and composites it back -- per drawImage, every frame.
  // Measured on this board with 150 enemies and 10 towers on screen:
  //
  //     as first shipped                        31.0 ms/frame   (32 fps)
  //     without ctx.filter                      ~13   ms/frame
  //     without ctx.filter and canvas shadows    7.5 ms/frame   (133 fps)
  //
  // Four times the frame budget, and the sprites themselves were never the
  // problem -- 150 of them blit in about 6 ms. The cause was that BOTH were
  // being paid by EVERY enemy on EVERY frame regardless of what it was doing:
  // the filter's resting value was a permanent `brightness(1.04) contrast(1.08)`
  // lift, and the rim's resting value was a constant pale halo.
  //
  // **So the rule is: a filter or a shadow may only ever carry STATE.** If an
  // enemy is not flashing and not slowed, both of these return null,
  // `applySpriteStyle` skips them entirely, and the draw is a plain blit. The
  // handful that ARE flashing still pay, which is correct -- that is the frame
  // where the cost buys information. Anything wanted on the resting model has
  // to be baked into the sheet by Blender, not applied per frame here.
  //
  // What that cost, honestly: the resting 4% brightness lift and the ambient
  // 24%-alpha rim are gone. Both were sub-perceptual at the size these draw at
  // and neither carried information; the flash and chill treatments, which
  // carry all of it, are untouched.
  var FLASH_FLOOR = 0.02;

  function enemyState(enemy) {
    var flash = Math.max(0, Math.min(1, enemy.flash || 0));
    var chill = Math.max(0, Math.min(1, 1 - (enemy.slowMultiplier || 1)));
    return (flash > FLASH_FLOOR || chill > FLASH_FLOOR)
      ? { flash: flash, chill: chill } : null;
  }

  // The hit flash and the slow tint, as a colour wash rather than a filter --
  // see `tint` in js/visual-models.js for why, and for the measurements. A hit
  // washes toward white and a slowed body toward cold blue, which is what both
  // treatments were always doing; the filter was just an expensive way to say
  // it. Flash wins when both are live, because being hit is the newer news.
  function enemyTint(enemy) {
    var state = enemyState(enemy);
    if (!state) return null;
    if (state.flash > FLASH_FLOOR) {
      return { color: "#FFFFFF", alpha: 0.20 + state.flash * 0.72 };
    }
    return { color: "#6FC8FF", alpha: 0.16 + state.chill * 0.34 };
  }

  // THE RIM IS GONE ENTIRELY, and this is the second measurement that decided
  // it. Keeping the halo for the flash alone still cost about **1 ms per
  // flashing enemy** in real frames -- a quarter of a 50-enemy board taking a
  // hit went from 7.1 ms to 20.8 ms, which is 48 fps for a decorative blur on
  // twelve sprites. A canvas shadow on a scaled drawImage is the single most
  // expensive operation on this page and there is no cheap version of it.
  //
  // Nothing is lost that the tint was not already saying: `enemyTint` washes
  // the whole body to white at the moment of the hit, which is a bigger and
  // more legible change than an edge glow ever was.
  function enemyRimColor() { return null; }

  function enemyRimBlur(enemy) {
    var flash = Math.max(0, Math.min(1, enemy.flash || 0));
    var chill = Math.max(0, Math.min(1, 1 - (enemy.slowMultiplier || 1)));
    return 1.15 + flash * 3.5 + chill * 1.8;
  }

  // A full shield is an instance state rather than an enemy id: Hive brood
  // and Shieldbearers can put it on any body.  Each authored enemy therefore
  // has two exactly aligned sheets. The shielded one changes only a few small
  // body-mounted projectors; Enemy.draw supplies the restrained live field.
  // Once the pool reaches zero this wrapper immediately selects the clean
  // base sheet, while shieldFlash carries the break itself for a moment.
  function registerWalkingEnemy(id, contentTop, stridePerHeight,
      contactWidth, contactHeight) {
    function registerSheet(suffix, file) {
      VisualModels.registerSpriteSheet("enemy", id + ":sheet" + suffix,
        asset(file), {
          frameWidth: TILE_W,
          frameHeight: TILE_H,
          frames: 8,
          directions: 8,
          direction: pathHeading,
          frame: function (enemy) {
            return walkFrame(enemy, 8, stridePerHeight);
          },
          width: sheetWidth,
          height: sheetHeight,
          lift: enemyGroundLift,
          contentTop: contentTop,
          tint: enemyTint,
          shadowColor: enemyRimColor,
          shadowBlur: enemyRimBlur
        });
    }

    registerSheet("", id + "_walk");
    registerSheet("-shielded", id + "_walk_shielded");

    VisualModels.register("enemy", id + ":body", function (ctx, enemy,
        options) {
      var radius = enemy.radiusPx();
      var x = enemy.pos.x;
      var y = enemy.pos.y;

      // Ambient occlusion at the exact ground-contact point. This deliberately
      // does not replace Visuals3Q's cast shadow: the small ellipse joins the
      // planted feet to that shadow while its down-right tail still carries
      // the shared light direction used by every other actor.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y + radius * 0.08,
        radius * (contactWidth || 0.58),
        radius * (contactHeight || 0.20), 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(4,10,8,0.48)";
      ctx.fill();
      ctx.restore();

      if (enemy.shield > 0 &&
          VisualModels.draw("enemy", id + ":sheet-shielded", ctx, enemy,
            options)) {
        return true;
      }
      return VisualModels.draw("enemy", id + ":sheet", ctx, enemy, options);
    });

    // The public body id remains the health-bar measurement source even
    // though the selected sprite sheet is one private layer below it.
    VisualModels.registerMetric("enemy", id + ":body", "topY",
      function (enemy) {
        return enemy.pos.y - enemyGroundLift(enemy) -
          sheetHeight(enemy) * contentTop;
      });
  }

  registerWalkingEnemy("normal", NORMAL_CONTENT_TOP,
    NORMAL_WALK_STRIDE_PER_HEIGHT, 0.58, 0.20);
  registerWalkingEnemy("swarm", SWARM_CONTENT_TOP,
    SWARM_WALK_STRIDE_PER_HEIGHT, 0.72, 0.18);
  registerWalkingEnemy("brute", BRUTE_CONTENT_TOP,
    BRUTE_WALK_STRIDE_PER_HEIGHT, 0.76, 0.22);
  registerWalkingEnemy("hive", HIVE_CONTENT_TOP,
    HIVE_WALK_STRIDE_PER_HEIGHT, 0.76, 0.22);

  // -------------------------------------------------------------------------
  // The Arcane Sniper -- composited from two layers, not drawn as one model.
  //
  // js/systems/crosspath.js allows 27 legal (A, B) combinations. Rendering 27
  // towers would be absurd and would multiply again once A4 arrives, since
  // that tier is player-aimed (`aimRad`) and needs 16 yaw steps. The two
  // paths were designed never to touch the same part of the model -- the
  // graft takes eye, arm, spine and legs; the rapture occupies skin, coat,
  // free hand and the air -- so a tower is a BODY plus an OVERLAY. Twenty
  // reusable sheets cover all 27 states. See tools/blender/tower_sniper.py.
  //
  // TIERS 1 AND 2 ARE COLOUR, NOT GEOMETRY. The body is one sheet and the
  // tiers are thin emissive ACCENT layers over it, so A1/A2/B1/B2 change what
  // lights up and nothing else. The accents keep to opposite sides of the
  // weapon -- graft on the top rail and scope, rapture in the groove under
  // the barrel -- so an A2 B2 shows both colours without either landing on
  // the other's metal.
  //
  // A3 AND A4 DO CHANGE THE MODEL, so each gets its own body sheet with its
  // teal baked in -- there is no separate A accent above tier 2. A5 and B5
  // are final one-piece bodies; B3/B4 use their own animated bodies with A1
  // or A2 graft overlays. Every legal state is covered, and none of these
  // presentation layers feeds the simulation.
  //
  // SHEET GROUPS. A body and the accents drawn over it must share a camera,
  // but different tiers need very different framing: the A0-A2 rifle already
  // ran off the edge of the old tile, and a rail cannon would not have fitted
  // at all. So each group was rendered at its own ortho_scale (the world
  // height one tile spans) and is drawn here at a size proportional to that
  // same number. That is what keeps a man the same size on screen at A3 as he
  // was at A2 even though his tile covers more world.
  //
  // PX_PER_WORLD is the one shared constant: multiply by a group's ortho and
  // you get how tall to draw its sprite. Change it and every tier rescales
  // together, which is the only way this stays consistent.
  var SNIPER_TILE = 256;
  // 48. Worst-case error between where the barrel points and where the shot
  // goes is 180/N degrees: 11.25 at 16, 7.5 at 24, 3.75 at 48. Below about
  // four degrees it stops reading as snapping and starts reading as turning.
  // Truly continuous is not available from pre-rendered sprites at all -- see
  // the note in tools/blender/tower_sniper.py for why rotating in canvas was
  // rejected rather than overlooked.
  //
  // Sheets are lazy: registerSpriteSheet does not create its Image until the
  // layer is first drawn, so a run only pays for the tiers actually built.
  var SNIPER_DIRECTIONS = 48;
  var PX_PER_WORLD = 1.529;   // in units of footprintPx

  // contentTop is measured off each rendered sheet -- see render_sheet's
  // "content box" print in tools/blender/td_scene.py.
  var SNIPER_GROUPS = {
    base: { ortho: 2.90, contentTop: 0.7695, bottomMargin: 0.0586 },
    a3:   { ortho: 3.30, contentTop: 0.7539, bottomMargin: 0.0664 },
    a4:   { ortho: 4.20, contentTop: 0.5547, bottomMargin: 0.0156 },
    a5:   { ortho: 5.20, contentTop: 0.5625, bottomMargin: 0.0234,
      tile: 512, directionRows: 16 },
    b3:   { ortho: 3.10, contentTop: 0.7383, bottomMargin: 0.0625 },
    b4:   { ortho: 3.70, contentTop: 0.6406, bottomMargin: 0.0273 },
    b5:   { ortho: 4.10, contentTop: 0.5938, bottomMargin: 0.0417,
      tile: 384, directionRows: 16 }
  };
  // td_scene.build_camera moves the camera up by 0.36 of its ortho frame, so
  // Blender world (0,0,0) lands at 0.5 + 0.36 = 0.86 down every square tile.
  // All bodies and overlays share that invariant pivot. Alpha bottom margins
  // describe whichever foot/pylon projects lowest; they are not the origin
  // and must never be used to align procedural effects.
  var SNIPER_ROOT_ANCHOR_Y = 0.86;

  // Which body sheet a tower is built from.
  //
  // `crosspath.lockThreshold` is 3, so a tier of 3 or more on ONE path caps
  // the other at 2 -- the two branches below can never both be taken, and
  // that is what lets a single group name identify the body.
  function sniperGroup(a, b) {
    if (a >= 5) return "a5";
    if (a === 4) return "a4";
    if (a === 3) return "a3";
    if (b >= 5) return "b5";
    if (b === 4) return "b4";
    if (b === 3) return "b3";
    return "base";
  }

  // HE FACES WHAT HE IS SHOOTING.
  //
  // LongshotTower.update already writes `this.aim` -- the angle to its
  // current target -- every time it picks one, so this costs nothing but the
  // sprites to point with. Once A4 grants `coneShape` the player sets the
  // facing by hand instead and it lives on `core.aimRad`, which wins when
  // present because that one is a decision, not a consequence.
  //
  // Returns a screen-space vector; registerSpriteSheet undoes the ground
  // squash before picking a row, exactly as it does for a walking enemy.
  // Shortest signed difference between two angles, in radians.
  function angleDelta(a, b) {
    var d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function towerFacing(tower) {
    var core = tower && tower.core ? tower.core : null;
    var live = (typeof tower.aim === "number" && isFinite(tower.aim))
      ? tower.aim : null;
    var angle = live;

    if (core && core.stats && core.stats.targetShape === "cone" &&
        typeof core.aimRad === "number") {
      // A CONE TOWER STILL TRACKS -- INSIDE ITS ARC.
      //
      // Pointing it flat at `aimRad` forever made A4 look switched off: it
      // fires at things all over its cone and never acknowledges any of them.
      // The player's chosen direction is the CENTRE of what it can cover, not
      // the only thing it may look at, so it follows its current target and
      // is clamped to the edge of the arc rather than snapping back.
      var half = ((core.stats.coneArcDeg || 0) * 0.5) * Math.PI / 180;
      if (live === null) {
        angle = core.aimRad;
      } else {
        var offset = angleDelta(live, core.aimRad);
        if (offset > half) offset = half;
        if (offset < -half) offset = -half;
        angle = core.aimRad + offset;
      }
    }

    // Before the first target there is nothing to face. Screen-right is the
    // pose the model was built in, so it is the one that looks deliberate.
    if (angle === null || !isFinite(angle)) return { x: 1, y: 0 };
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  // EFFECTS MUST FOLLOW THE PICTURE, NOT THE UNSNAPPED AIM VECTOR.
  //
  // The tower tracks continuously, but a pre-rendered model can only show one
  // of SNIPER_DIRECTIONS facings. registerSpriteSheet converts the screen
  // vector back onto the Blender ground plane, rounds that yaw to a sheet row,
  // and renders that row. Repeating the same operation here gives procedural
  // light the exact local axes of the picture under it; using towerFacing
  // directly leaves up to half a row (3.75 degrees) of visible drift.
  function sniperSpriteBasis(tower) {
    var face = towerFacing(tower);
    var squash = (typeof Visuals3Q !== "undefined" && Visuals3Q.GROUND_SQUASH)
      ? Visuals3Q.GROUND_SQUASH : 0.56;
    var yaw = Math.atan2(-face.y / squash, face.x);
    var step = Math.PI * 2 / SNIPER_DIRECTIONS;
    var rawRow = Math.round(yaw / step);
    yaw = rawRow * step;

    var c = Math.cos(yaw);
    var s = Math.sin(yaw);
    return {
      // Projected Blender-local +X (weapon forward) and +Y (weapon side).
      forwardX: c,
      forwardY: -s * squash,
      sideX: -s,
      sideY: -c * squash,
      verticalY: -Math.sqrt(Math.max(0, 1 - squash * squash)),
      row: ((rawRow % SNIPER_DIRECTIONS) + SNIPER_DIRECTIONS) %
        SNIPER_DIRECTIONS
    };
  }

  // Authored Blender-local points, in the same world units used by
  // tower_sniper.py. A point is [forward, side, height]. These are physical
  // parts of each body, not percentages of a gameplay muzzle offset:
  // cylinders for A3/A4, magnetic collars for A5, and the rapture cylinder
  // and bone fissures for B. Keeping the table next to its projection makes a
  // remodel a small, explicit anchor update instead of another visual guess.
  var SNIPER_EFFECT_ANCHORS = {
    a3: {
      muzzle: [1.56, -0.06, 1.341],
      charge: [
        [0.74, -0.06, 1.319],
        [1.00, -0.06, 1.326],
        [1.26, -0.06, 1.333]
      ]
    },
    a4: {
      muzzle: [1.725, 0.0, 0.740],
      charge: [
        [0.42, 0.0, 0.740],
        [0.78, 0.0, 0.740],
        [1.14, 0.0, 0.740]
      ]
    },
    a5: {
      muzzle: [2.06, 0.0, 0.960],
      rune: [1.90, 0.0, 0.960],
      charge: [
        [0.02, 0.0, 0.960],
        [0.38, 0.0, 0.960],
        [0.74, 0.0, 0.960],
        [1.10, 0.0, 0.960],
        [1.46, 0.0, 0.960],
        [1.82, 0.0, 0.960]
      ]
    },
    b3: {
      muzzle: [1.25, -0.06, 1.333],
      chamber: [0.20, -0.06, 1.285]
    },
    b4: {
      muzzle: [1.25, -0.06, 1.333],
      chamber: [0.20, -0.06, 1.285],
      fissures: [
        [0.74, -0.06, 1.364],
        [0.92, -0.06, 1.369],
        [1.10, -0.06, 1.374]
      ]
    },
    b5: {
      muzzle: [1.25, -0.06, 1.313],
      chamber: [0.20, -0.06, 1.265],
      // B5's face has become the model's primary emissive source; its weapon
      // still has a chamber, but making that generic cylinder pay for the
      // ritual ignored the tier's defining glare.
      source: [0.005, -0.02, 1.520]
    }
  };

  function projectSniperAnchor(tower, point, basis) {
    basis = basis || sniperSpriteBasis(tower);
    var scale = tower.footprintPx * PX_PER_WORLD;
    var forward = point[0];
    var side = point[1];
    var height = point[2];
    return {
      x: tower.x + (basis.forwardX * forward + basis.sideX * side) * scale,
      y: tower.y + (basis.forwardY * forward + basis.sideY * side +
        basis.verticalY * height) * scale
    };
  }

  // Tiles are square, so width and height are the same number. Both scale
  // with the group's ortho, which is what holds the apparent size of the man
  // steady as the framing widens to fit a longer weapon.
  function towerSize(tower, group) {
    return tower.footprintPx * PX_PER_WORLD *
      SNIPER_GROUPS[group || "base"].ortho;
  }

  function sniperGroundLift(tower, group) {
    return -towerSize(tower, group) * (1 - SNIPER_ROOT_ANCHOR_Y);
  }

  // The sniper in play is a wrapper; the config-driven tower is on `.core`,
  // which is where purchased tiers live (see js/towers/tower-runtime.js).
  function sniperTiers(tower) {
    var core = tower && tower.core ? tower.core : tower;
    var bought = core && core.purchased ? core.purchased : null;
    return {
      a: bought && bought.A ? bought.A : 0,
      b: bought && bought.B ? bought.B : 0
    };
  }

  // THE RELOAD, AND WHY IT NEEDS NO TIMER OF ITS OWN.
  //
  // The body sheet for A0-A2 and B1-B2 carries a four-frame bolt cycle:
  //
  //     0  at rest, aimed        3  bolt driven home, settling
  //     1  recoil, bolt lifting  2  bolt drawn fully back
  //
  // It is indexed off how far through its firing cycle the tower is, so the
  // whole cycle takes exactly as long as one shot takes and buying attack
  // speed makes him work the bolt faster with nothing to keep in step. The
  // action occupies the first part of the cycle and he holds the aimed pose
  // for the rest -- a rifle that is still cycling when it fires reads wrong.
  var RELOAD_FRAMES = 4;
  var RELOAD_SHARE = 0.55;

  function reloadFrame(tower) {
    var p = firingProgress(tower);
    if (p >= RELOAD_SHARE) return 0;
    var into = p / RELOAD_SHARE;
    return 1 + Math.min(RELOAD_FRAMES - 2,
      Math.floor(into * (RELOAD_FRAMES - 1)));
  }

  // B3 AND B4 RELOAD A CYLINDER, NOT A BOLT — AND ON A DIFFERENT CLOCK.
  //
  // From B3 the tower fires four shots and then stops for a beat
  // (mechanics.reload), and that beat is deliberately NOT scaled by fire rate
  // (see js/systems/reload.js). So this is driven by the ReloadTracker's own
  // timer rather than by the firing cycle the other tiers use: a tower that
  // has bought a lot of attack speed rattles its four shots off faster and
  // still takes the same pause to reload, and the animation says so.
  //
  // Frame 0 is the aimed pose, held for all four shots; 1-3 are the reload.
  var RAPTURE_FRAMES = 4;

  function raptureFrame(tower) {
    var r = tower.core && tower.core.reload;
    if (!r || !r.reloading) return 0;
    var total = r.reloadDurationSeconds || 1;
    var done = Math.max(0, Math.min(1, 1 - (r.reloadTimer / total)));
    return 1 + Math.min(RAPTURE_FRAMES - 2,
      Math.floor(done * (RAPTURE_FRAMES - 1)));
  }

  // The fallback Longshot draws its own raised platform, but that code lives
  // inside the fallback branch and therefore never runs when this art pack's
  // body succeeds. The Blender bodies intentionally contain no generic
  // plinth, so custom models otherwise hover over an unmarked map coordinate.
  // A flat faction pad gives their feet/pylons contact and supplies the same
  // down-right cast shadow as the rest of Visuals3Q without changing the
  // tower's footprint or lifting the authored ground origin.
  function drawSniperGround(ctx, tower, group) {
    var rapture = group.charAt(0) === "b";
    var finalMount = group === "a5" || group === "b5";
    var radius = tower.footprintPx * (finalMount ? 1.22 : 1.04);

    ctx.save();
    if (typeof Visuals3Q !== "undefined" && Visuals3Q.platform) {
      Visuals3Q.platform(ctx, tower.x, tower.y, radius, {
        height: 0,
        top: rapture ? "#30263a" : "#263c3a",
        side: rapture ? "#17121e" : "#142421",
        rim: rapture ? "rgba(218,145,247,0.62)"
          : "rgba(126,233,220,0.58)",
        highlight: rapture ? "rgba(255,222,255,0.24)"
          : "rgba(224,255,248,0.22)",
        shadowAlpha: finalMount ? 0.34 : 0.28,
        lineWidth: finalMount ? 1.8 : 1.4
      });
    } else {
      // draw-pack normally loads after Visuals3Q; this keeps a standalone
      // model-pack preview grounded too, without depending on game state.
      ctx.beginPath();
      ctx.ellipse(tower.x, tower.y, radius, radius * 0.56,
        0, 0, Math.PI * 2);
      ctx.fillStyle = rapture ? "#30263a" : "#263c3a";
      ctx.fill();
    }
    ctx.restore();
  }

  function registerSniperLayer(id, file, group, frames, frameFn) {
    var spec = SNIPER_GROUPS[group];
    var isBody = id.indexOf("body") === 0;

    // Body layers own the faction pad. They cannot use registerSpriteSheet's
    // opaque lazy loader because the pad must be drawn BEFORE the sprite but
    // ONLY after its image is ready: painting it first and then returning
    // false would make Longshot's fallback draw a second platform on top.
    // This small body-only renderer keeps the same public layer ids, rows,
    // frames, sizing, fixed world pivot and rim as the shared helper.
    if (isBody) {
      var image = null;
      var source = asset(file);
      var modelId = "longshot:layer-" + id;
      var rim = group.charAt(0) === "b"
        ? "rgba(214,132,247,0.25)"
        : group.charAt(0) === "a"
          ? "rgba(112,234,222,0.25)"
          : "rgba(185,215,232,0.20)";

      function drawBodyTile(ctx, tower, withGround, withRim, opacity) {
        if (typeof Image === "undefined") return false;
        if (!image) {
          image = new Image();
          image.src = source;
        }
        if (!image.complete || !image.naturalWidth) return false;

        var basis = sniperSpriteBasis(tower);
        var tile = spec.tile || SNIPER_TILE;
        var directionRows = spec.directionRows || SNIPER_DIRECTIONS;
        var column = frameFn ? Math.floor(frameFn(tower)) : 0;
        var count = frames || 1;
        column %= count;
        if (column < 0) column += count;
        var sourceRow = basis.row % directionRows;
        var sourceColumn = Math.floor(basis.row / directionRows) * count +
          column;

        var size = towerSize(tower, group);
        var lift = sniperGroundLift(tower, group);
        if (withGround) drawSniperGround(ctx, tower, group);

        ctx.save();
        if (opacity !== undefined) ctx.globalAlpha *= opacity;
        if (withRim) {
          ctx.shadowColor = rim;
          ctx.shadowBlur = 1.35;
        }
        ctx.drawImage(image,
          sourceColumn * tile, sourceRow * tile,
          tile, tile,
          tower.x - size * 0.5, tower.y - lift - size,
          size, size);
        ctx.restore();
        return true;
      }

      VisualModels.register("tower", modelId, function (ctx, tower) {
        return drawBodyTile(ctx, tower, true, true, 1);
      });

      // A redraw-only holdout sharing the already-decoded image. It is used
      // narrowly by A4+B2 below, after that path's underside accent, so opaque
      // cannon/mount pixels regain their proper foreground depth. No pad or
      // rim is repeated, and returning false before decode paints nothing.
      VisualModels.register("tower", modelId + "-holdout",
        function (ctx, tower) {
          return drawBodyTile(ctx, tower, false, false, 0.58);
        });

      VisualModels.registerMetric("tower", modelId, "topY",
        function (tower) {
          var size = towerSize(tower, group);
          var lift = sniperGroundLift(tower, group);
          return tower.y - lift - size * spec.contentTop;
        });
      return;
    }

    VisualModels.registerSpriteSheet("tower", "longshot:layer-" + id,
      asset(file), {
        frameWidth: spec.tile || SNIPER_TILE,
        frameHeight: spec.tile || SNIPER_TILE,
        frames: frames || 1,
        frame: frameFn,
        directions: SNIPER_DIRECTIONS,
        directionRows: spec.directionRows || SNIPER_DIRECTIONS,
        direction: towerFacing,
        width: function (tower) { return towerSize(tower, group); },
        height: function (tower) { return towerSize(tower, group); },
        contentTop: spec.contentTop,
        // Align Blender's fixed world-origin pivot. The overlay camera is the
        // same as its body camera, so this also keeps accents welded to metal
        // instead of aligning each layer by unrelated alpha extents.
        lift: function (tower) { return sniperGroundLift(tower, group); },
        // Accent layers stay exact so compositing cannot double the body rim
        // or soften their tier markings.
        shadowColor: null,
        shadowBlur: 0
      });
  }

  var layer;
  registerSniperLayer("body", "sniper_body", "base", RELOAD_FRAMES,
    reloadFrame);
  registerSniperLayer("accent0", "sniper_accent0", "base");
  for (layer = 1; layer <= 2; layer++) {
    registerSniperLayer("a" + layer, "sniper_accent_a" + layer, "base");
    registerSniperLayer("b" + layer, "sniper_accent_b" + layer, "base");
    // The four crosspaths. Path B lights a groove under the barrel, and that
    // groove is somewhere completely different on a coil rifle or a rail
    // cannon than on the original weapon -- so each body carries its own.
    registerSniperLayer("b" + layer + "-a3",
      "sniper_accent_b" + layer + "_a3", "a3");
    registerSniperLayer("b" + layer + "-a4",
      "sniper_accent_b" + layer + "_a4", "a4");
  }
  registerSniperLayer("body-a3", "sniper_body_a3", "a3");
  registerSniperLayer("body-a4", "sniper_body_a4", "a4");
  registerSniperLayer("body-a5", "sniper_body_a5", "a5");

  // Path B's own bodies, and the graft accents that sit on them. Mirror of
  // the A3/A4 arrangement: B3 and B4 bake their violet in, so above tier 2
  // there is no separate B accent, and it is path A that becomes the overlay.
  for (layer = 3; layer <= 4; layer++) {
    registerSniperLayer("body-b" + layer, "sniper_body_b" + layer,
      "b" + layer, RAPTURE_FRAMES, raptureFrame);
    registerSniperLayer("a1-b" + layer, "sniper_accent_a1_b" + layer,
      "b" + layer);
    registerSniperLayer("a2-b" + layer, "sniper_accent_a2_b" + layer,
      "b" + layer);
  }
  // B5, like A5, is one sheet with no crosspath variant: at this tier the
  // path that got here IS the model.
  registerSniperLayer("body-b5", "sniper_body_b5", "b5");

  VisualModels.register("tower", "longshot:body", function (ctx, tower) {
    var tiers = sniperTiers(tower);
    var group = sniperGroup(tiers.a, tiers.b);
    var rapture = (group === "b3" || group === "b4" || group === "b5");

    // A3-A5 bake their teal in and B3-B4 bake their violet in, so above tier
    // 2 the path that got there IS the model and only the OTHER path is left
    // as an overlay.
    var bodyId = group === "base" ? "layer-body" : "layer-body-" + group;

    // If the body has not decoded yet, fall back WHOLESALE. Drawing accents
    // alone would leave a glowing scope hanging in mid-air.
    if (!VisualModels.draw("tower", "longshot:" + bodyId, ctx, tower)) {
      return false;
    }

    if (tiers.a < 1 && tiers.b < 1) {
      // Untouched: the ring he scratched himself, still burning half teal and
      // half violet. He has not chosen a path yet.
      VisualModels.draw("tower", "longshot:layer-accent0", ctx, tower);
      return true;
    }

    // Path A's accent, on whichever body it is sitting on. It never exists
    // above A2 because the graft tiers bake it in.
    if (tiers.a >= 1 && tiers.a <= 2 && group !== "b5") {
      VisualModels.draw("tower", "longshot:layer-a" + tiers.a +
        (rapture ? "-" + group : ""), ctx, tower);
    }

    // Path B is always an accent, but the sheet depends on which body it is
    // sitting on. crosspath.lockThreshold caps B at 2 once A reaches 3, so
    // there are exactly four of these: A3B1, A3B2, A4B1, A4B2.
    //
    // A5 IS DELIBERATELY EXEMPT. The owner's call: there is nothing human
    // left in it for the rapture to mark, so it looks the same whatever B
    // did, and there is no a5 accent sheet to draw.
    if (tiers.b >= 1 && tiers.b <= 2 && group !== "a5") {
      VisualModels.draw("tower", "longshot:layer-b" + tiers.b +
        (group === "base" ? "" : "-" + group), ctx, tower);
    }

    // A4+B2's magenta pieces are all authored UNDER or AROUND solid A4
    // hardware: an underside groove, a breech ring and a wider mount ring.
    // Rendering their isolated transparent sheet last gave it no depth buffer,
    // so the filled magenta mount replaced A4's primary teal core. Reapplying
    // the decoded A4 body as a PARTIAL holdout restores teal as the primary
    // read while leaving overlapping magenta visible; accent pixels outside
    // the body silhouette remain full strength. An exact depth correction is
    // impossible from these two flattened RGBA sheets: the runtime cannot
    // tell the foreground mount ring from the rear underside groove. That
    // requires a third Blender-authored part/depth mask. Do not generalise
    // this hierarchy correction to arbitrary crosspaths.
    if (group === "a4" && tiers.b === 2) {
      VisualModels.draw("tower", "longshot:" + bodyId + "-holdout",
        ctx, tower);
    }

    // Charge last, so the glow sits over the metal rather than under it.
    // A channelling tower shows the ritual INSTEAD of its ordinary charge --
    // it is not winding up a shot, it is spending itself on something else.
    if (tower.channel) {
      drawChannel(ctx, tower);
    } else {
      drawCharge(ctx, tower, group);
    }
    if (group === "a5") drawKillStackTally(ctx, tower);
    if (rapture) drawChambers(ctx, tower);
    return true;
  });

  // -------------------------------------------------------------------------
  // The shot, in the colour of the path that fired it.
  //
  // The bolt is drawn LIFTED to barrel height while its real position stays
  // on the ground. That is not a fudge -- it is the same split the engine
  // already uses for enemies, where `pos` is the feet and `visualBodyY` is
  // where the body is painted. The bullet has to stay on the flat plane it
  // does its hit tests on; only the picture rises to meet the muzzle.
  var SHOT_COLOURS = {
    ley: ["#4FE3D2", "rgba(79,227,210,"],
    sigil: ["#C061F0", "rgba(192,97,240,"],
    neutral: ["#BFE9FF", "rgba(191,233,255,"]
  };

  // Fallback barrel height, in the same u.l. the muzzle offset uses. The real
  // figure rides on the shot itself (`liftUl`, set from the tower's config)
  // because it differs per tier: a rifle at the shoulder is 33 and A4's rail
  // cannon on its yoke is 19. This constant is only for a shot that arrived
  // without one.
  var SHOT_LIFT_UL = 33;

  function shotLift(shot) {
    return ul(typeof shot.liftUl === "number" ? shot.liftUl : SHOT_LIFT_UL);
  }

  // A BEAM THAT DIMS AS THE SHOT LOSES DAMAGE.
  //
  // From A4 the weapon is a rail cannon and the shot reads as a lance, not a
  // bolt. The thing worth drawing is the pierce falloff: every enemy it passes
  // through costs it one step down the decay curve (js/systems/pierce.js).
  //
  // The first version showed that by NARROWING the beam toward the head, and
  // it just looked like a long triangle -- a cone, which is a different weapon
  // entirely. A laser's defining property is that it does not converge. So the
  // width is now CONSTANT and the drain is carried by brightness instead: a
  // gradient from full intensity at the muzzle to whatever fraction of its
  // damage survives at the head. Same information, and it still reads as a
  // straight beam.
  //
  // A gradient rather than discrete steps because we know how much damage is
  // left but not WHERE along the line each enemy took its bite.
  function drawLance(ctx, shot, colour, lift, scale) {
    var head = shot.travelled || 0;
    var originX = shot.x - shot.dirX * head;
    var originY = shot.y - shot.dirY * head - lift;
    var headY = shot.y - lift;

    var base = Math.max(1, shot.baseDamage || 1);
    var now = (typeof shot.currentDamage === "function")
      ? shot.currentDamage() : base;
    var remaining = Math.max(0.1, Math.min(1, now / base));

    var w = (3.2 + Math.min(1, base / 500) * 4.4) * scale;

    // Degenerate at the instant of firing: no length yet, so no gradient.
    if (head < 1) {
      ctx.save();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(shot.x, headY, w, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    function ramp(alphaAtMuzzle) {
      var g = ctx.createLinearGradient(originX, originY, shot.x, headY);
      g.addColorStop(0, colour[1] + alphaAtMuzzle.toFixed(3) + ")");
      g.addColorStop(1, colour[1] +
        (alphaAtMuzzle * remaining).toFixed(3) + ")");
      return g;
    }

    ctx.save();
    ctx.lineCap = "butt";

    ctx.strokeStyle = ramp(0.22);
    ctx.lineWidth = w * 4.0;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(shot.x, headY);
    ctx.stroke();

    ctx.strokeStyle = ramp(0.75);
    ctx.lineWidth = w * 1.7;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(shot.x, headY);
    ctx.stroke();

    // White core, faded the same way. Full damage keeps a hot centre the whole
    // length; a spent shot has one only near the muzzle.
    var core = ctx.createLinearGradient(originX, originY, shot.x, headY);
    core.addColorStop(0, "rgba(255,255,255,0.95)");
    core.addColorStop(1, "rgba(255,255,255," + (0.95 * remaining).toFixed(3) + ")");
    ctx.strokeStyle = core;
    ctx.lineWidth = w * 0.66;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(shot.x, headY);
    ctx.stroke();

    // The leading edge, so the head still reads against a lit road even when
    // the beam behind it has gone dim.
    ctx.fillStyle = "#FFFFFF";
    ctx.globalAlpha = 0.45 + 0.55 * remaining;
    ctx.beginPath();
    ctx.arc(shot.x, headY, w * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // B5'S FOURTH ROUND IS A DIFFERENT PROJECTILE, NOT A RECOLOUR.
  //
  // The ordinary B5 bolt is already large because it carries 1500+ damage,
  // so merely making the guaranteed crit larger did not survive gameplay
  // scale. This gives the covenant round its own silhouette: a white-hot
  // diamond penetrator, two separated violet rails, orbiting seal fragments
  // and forked discharge behind it. The geometry is built in shot space so it
  // remains equally legible in all 48 facings.
  function drawCovenantRound(ctx, shot, lift) {
    var dx = shot.dirX;
    var dy = shot.dirY;
    var nx = -dy;
    var ny = dx;
    var hx = shot.x;
    var hy = shot.y - lift;
    var travel = shot.travelled || 0;
    var tail = 40;
    var tx = hx - dx * tail;
    var ty = hy - dy * tail;
    var phase = travel * 0.22;
    var violet = SHOT_COLOURS.sigil;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Compact bloom: loud around the round, never a screen-wide wash.
    ctx.strokeStyle = violet[1] + "0.22)";
    ctx.lineWidth = 17;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.stroke();

    // Two clean rails leave negative space through the centre. That split is
    // the read-at-a-glance difference from every ordinary single-core bolt.
    for (var rail = -1; rail <= 1; rail += 2) {
      ctx.strokeStyle = violet[1] + "0.88)";
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(tx + nx * rail * 4.4, ty + ny * rail * 4.4);
      ctx.lineTo(hx - dx * 5 + nx * rail * 3.0,
        hy - dy * 5 + ny * rail * 3.0);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,232,255,0.68)";
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(tx + nx * rail * 4.4, ty + ny * rail * 4.4);
      ctx.lineTo(hx - dx * 5 + nx * rail * 3.0,
        hy - dy * 5 + ny * rail * 3.0);
      ctx.stroke();
    }

    // The unstable covenant discharge crosses between the separated rails.
    ctx.strokeStyle = "rgba(244,198,255,0.78)";
    ctx.lineWidth = 1.45;
    bolt(ctx, tx, ty, hx - dx * 4, hy - dy * 4, 7,
      7.5 + Math.sin(phase) * 1.8);

    // Diamond penetrator. Its pointed leading edge makes this read as a
    // deliberate heavy round rather than another glowing orb.
    ctx.fillStyle = violet[1] + "0.94)";
    ctx.beginPath();
    ctx.moveTo(hx + dx * 9, hy + dy * 9);
    ctx.lineTo(hx - dx * 3 + nx * 8, hy - dy * 3 + ny * 8);
    ctx.lineTo(hx - dx * 11, hy - dy * 11);
    ctx.lineTo(hx - dx * 3 - nx * 8, hy - dy * 3 - ny * 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,238,255,0.92)";
    ctx.lineWidth = 1.35;
    ctx.stroke();

    // White core and the two detached seal fragments orbiting its flanks.
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.beginPath();
    ctx.moveTo(hx + dx * 5, hy + dy * 5);
    ctx.lineTo(hx + nx * 3.1, hy + ny * 3.1);
    ctx.lineTo(hx - dx * 5, hy - dy * 5);
    ctx.lineTo(hx - nx * 3.1, hy - ny * 3.1);
    ctx.closePath();
    ctx.fill();

    for (var seal = -1; seal <= 1; seal += 2) {
      var across = seal * (11 + Math.sin(phase + seal) * 1.8);
      var along = -2 + Math.cos(phase * 0.7 + seal) * 2;
      var sx = hx + dx * along + nx * across;
      var sy = hy + dy * along + ny * across;
      ctx.fillStyle = "rgba(229,151,255,0.94)";
      ctx.beginPath();
      ctx.moveTo(sx + dx * 2.8, sy + dy * 2.8);
      ctx.lineTo(sx + nx * 2.1, sy + ny * 2.1);
      ctx.lineTo(sx - dx * 2.8, sy - dy * 2.8);
      ctx.lineTo(sx - nx * 2.1, sy - ny * 2.1);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  VisualModels.register("projectile", "pierce", function (ctx, shot) {
    var colour = SHOT_COLOURS[shot.tint] || SHOT_COLOURS.neutral;
    var lift = shotLift(shot);

    // The guaranteed reload-precursor shot replaces the ordinary bolt rather
    // than layering a faint colour cue over it. B5 cannot legally own A4/A5,
    // but keeping this branch first also makes debug-authored states honest.
    if (shot.empowered) {
      drawCovenantRound(ctx, shot, lift);
      return true;
    }

    // A4 fires a lance; A5 fires a considerably bigger one. Anything below
    // still fires a bolt, because a rifle that shoots a beam is a different
    // weapon. A5's was raised from 1.85 to 2.6 -- at 1.85 the tier that costs
    // 13 900 and takes the man's whole body looked like a slightly thicker
    // A4, which is not what 350 extra base damage and infinite pierce should
    // feel like.
    if (shot.style === "lance" || shot.style === "meridian") {
      drawLance(ctx, shot, colour, lift,
        shot.style === "meridian" ? 2.6 : 1.15);
      return true;
    }

    // Same potency curve the built-in bolt uses: a shot carrying more damage
    // through more enemies simply IS a bigger bolt, so path A gets brighter
    // shots without the projectile knowing anything about upgrade tiers.
    var potency = Math.max(0, Math.min(1, shot.baseDamage / 400));
    var length = 13 + potency * 20;
    var width = 2.2 + potency * 2.6;

    var tailX = shot.x - shot.dirX * length;
    var tailY = shot.y - shot.dirY * length - lift;
    var headY = shot.y - lift;

    ctx.save();
    ctx.lineCap = "round";

    ctx.strokeStyle = colour[1] + (0.18 + potency * 0.16).toFixed(2) + ")";
    ctx.lineWidth = width * 2.6;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(shot.x, headY);
    ctx.stroke();

    ctx.strokeStyle = colour[0];
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(shot.x, headY);
    ctx.stroke();

    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(shot.x, headY, width * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return true;
  });

  // -------------------------------------------------------------------------
  // CHARGE-UP, FOR THE GRAFT TIERS.
  //
  // A3 lights its coils, A4 adds arcs, A5 adds a rune circle around the
  // barrel. All three are drawn procedurally rather than rendered as frames,
  // for two reasons: lightning and a turning circle want to be continuous and
  // different every frame, which a four-frame loop cannot be; and the sheets
  // are already 48 facings deep, so anything that multiplies that axis is
  // expensive in a way canvas drawing simply is not.
  //
  // SPEED IS DYNAMIC BY CONSTRUCTION. Everything below is driven by how far
  // through its firing cycle the tower is -- `fireCooldown` counted against
  // `effectiveFireRate()` -- so buying attack speed makes the charge faster
  // with no constant to keep in step. That includes A5's kill stacks, which
  // are a live multiplier on the rate: a tower mid-massacre visibly winds up
  // quicker.
  function firingProgress(tower) {
    var core = tower && tower.core;
    if (!core || typeof core.effectiveFireRate !== "function") return 1;
    var rate = core.effectiveFireRate();
    if (!(rate > 0)) return 1;
    var left = core.fireCooldown;
    if (!(left > 0)) return 1;
    return Math.max(0, Math.min(1, 1 - left * rate));
  }

  // A jagged polyline between two points. `spread` is how far it may wander
  // off the straight line, in pixels.
  function bolt(ctx, x1, y1, x2, y2, segments, spread) {
    var nx = -(y2 - y1);
    var ny = (x2 - x1);
    var len = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= len;
    ny /= len;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (var i = 1; i < segments; i++) {
      var t = i / segments;
      // Zero at both ends so the arc is anchored where it should be.
      var wobble = (Math.random() - 0.5) * 2 * spread * Math.sin(t * Math.PI);
      ctx.lineTo(x1 + (x2 - x1) * t + nx * wobble,
        y1 + (y2 - y1) * t + ny * wobble);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // A ring drawn AROUND the barrel: a circle in the plane the shot passes
  // through, so in this projection it is an ellipse squashed along the line
  // of fire and turned to match the aim.
  function barrelRing(ctx, cx, cy, radius, angle, squashAlongBarrel) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * squashAlongBarrel, radius, angle,
      0, Math.PI * 2);
    ctx.stroke();
  }

  // THE RAPTURE DOES NOT CHARGE. IT BLEEDS.
  //
  // This existed as a bug first: drawCharge only skipped the base group, so a
  // B3 or B4 tower -- which can only have A0-A2 -- was being given path A's
  // teal coil stages and muzzle bloom. A violet, cloth-and-bone tower was
  // winding up like a rail gun.
  //
  // The fix is not just a colour swap. The two paths cost different things
  // and should not move alike: the graft SPINS UP, stage by stage, in
  // hardware. The rapture has no hardware, so nothing accumulates -- what
  // builds is pressure inside a man. Light gathers at the wound in his hand
  // and in the chambers, sigils lift off him, and at the top of the cycle it
  // goes out of the barrel rather than being fired from it.
  function drawRapture(ctx, tower, group, charge) {
    var t = charge * charge;      // gentler than the graft's cubed ramp
    var authored = SNIPER_EFFECT_ANCHORS[group];
    if (!authored) return;
    var basis = sniperSpriteBasis(tower);
    var muz = projectSniperAnchor(tower, authored.muzzle, basis);
    var source = projectSniperAnchor(tower,
      authored.source || authored.chamber, basis);
    var scale = tower.footprintPx / ul(20);
    var violet = SHOT_COLOURS.sigil;

    var mx = muz.x;
    var my = muz.y;
    // B3/B4 begin at the cylinder; B5 begins at the glare where its face used
    // to be. Both are authored points rather than 22% of a generic barrel.
    var bx = source.x;
    var by = source.y;

    ctx.save();

    // The wound, and the chambers it feeds. This is the source; everything
    // else on the model is lit BY it rather than lit alongside it.
    ctx.fillStyle = violet[1] + (0.34 * t).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(bx, by, (7 + 6 * t) * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,240,255," + (0.7 * t * t).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(bx, by, 2.4 * t * scale, 0, Math.PI * 2);
    ctx.fill();

    // Sigils lifting off him. They RISE and fade rather than arcing between
    // fixed points -- nothing here is conducting, it is escaping.
    var motes = group === "b4" ? 7 : 4;
    for (var i = 0; i < motes; i++) {
      var phase = ((typeof performance !== "undefined" && performance.now
        ? performance.now() : Date.now()) / 1400 + i / motes) % 1;
      var rise = phase * 26 * scale;
      var alpha = t * (1 - phase) * 0.85;
      if (alpha <= 0.01) continue;
      var sx = source.x + ((i % 2 ? 1 : -1) *
        (5 + (i * 7) % 17)) * scale;
      var sy = source.y - rise - 3 * scale;
      var s = (1.6 + (i % 3) * 0.5) * scale;
      ctx.strokeStyle = violet[1] + alpha.toFixed(3) + ")";
      ctx.lineWidth = 1.3 * scale;
      ctx.beginPath();
      ctx.moveTo(sx - s, sy);
      ctx.lineTo(sx + s, sy);
      ctx.moveTo(sx, sy - s);
      ctx.lineTo(sx, sy + s);
      ctx.stroke();
    }

    // B4's fissures. The bone barrel is already split; as the pressure builds
    // the cracks pour instead of glow.
    if (authored.fissures) {
      ctx.lineCap = "round";
      var forwardLength = Math.sqrt(basis.forwardX * basis.forwardX +
        basis.forwardY * basis.forwardY) || 1;
      var fissureDX = basis.forwardX / forwardLength * 3 * scale;
      var fissureDY = basis.forwardY / forwardLength * 3 * scale;
      for (var f = 0; f < authored.fissures.length; f++) {
        var fissure = projectSniperAnchor(tower, authored.fissures[f], basis);
        var fx = fissure.x;
        var fy = fissure.y;
        ctx.strokeStyle = violet[1] + (0.35 + 0.5 * t).toFixed(3) + ")";
        ctx.lineWidth = (1.4 + 2.2 * t) * scale;
        ctx.beginPath();
        ctx.moveTo(fx - fissureDX, fy - fissureDY);
        ctx.lineTo(fx + fissureDX, fy + fissureDY);
        ctx.stroke();
      }
    }

    // At the top of the cycle it comes out of the muzzle -- a bloom, not a
    // focused point, because it is being let go rather than aimed.
    if (t > 0.45) {
      var out = (t - 0.45) / 0.55;
      ctx.fillStyle = violet[1] + (0.30 * out).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(mx, my, (5 + 11 * out) * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCharge(ctx, tower, group) {
    if (group === "base") return;

    var charge = firingProgress(tower);
    if (charge <= 0.02) return;

    var projectile = tower.core && tower.core.config
      ? tower.core.config.projectile : null;
    if (!projectile) return;

    // Path B gets its own language entirely -- see drawRapture.
    if (group === "b3" || group === "b4" || group === "b5") {
      drawRapture(ctx, tower, group, charge);
      return;
    }

    // Bias late: for most of the cycle there should be almost nothing, then
    // it winds up hard just before the shot. A linear ramp reads as a lamp on
    // a dimmer rather than as something building to a release.
    var t = charge * charge * charge;

    var tiers = sniperTiers(tower);
    var authored = SNIPER_EFFECT_ANCHORS[group];
    if (!authored) return;
    var basis = sniperSpriteBasis(tower);
    var angle = Math.atan2(basis.forwardY, basis.forwardX);
    var muz = projectSniperAnchor(tower, authored.muzzle, basis);
    var mx = muz.x;
    var my = muz.y;

    var teal = SHOT_COLOURS.ley;
    var scale = tower.footprintPx / ul(20);   // hold up if the board rescales

    ctx.save();
    ctx.lineCap = "round";

    // --- the coil stages, lighting in sequence along the weapon ------------
    // Light only hardware that exists in the rendered model: A3/A4's coil
    // cylinders and A5's six magnetic collars. The old evenly-spaced
    // percentages put the first A3 light in the stock and the last A4 light
    // beyond its final stage.
    var chargePoints = authored.charge || [];
    var stages = chargePoints.length;
    for (var s = 0; s < stages; s++) {
      var lit = Math.max(0, Math.min(1, t * (stages + 1) - s));
      if (lit <= 0) continue;
      var stage = projectSniperAnchor(tower, chargePoints[s], basis);
      var sx = stage.x;
      var sy = stage.y;
      ctx.fillStyle = teal[1] + (0.30 * lit).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(sx, sy, (5.5 + 3.5 * lit) * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255," + (0.55 * lit).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(sx, sy, 2.1 * lit * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- the muzzle bloom ---------------------------------------------------
    var bloom = (tiers.a >= 5 ? 15 : tiers.a >= 4 ? 10 : 7) * scale;
    ctx.fillStyle = teal[1] + (0.26 * t).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(mx, my, bloom * (0.45 + t), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255," + (0.85 * t * t).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(mx, my, bloom * 0.34 * t, 0, Math.PI * 2);
    ctx.fill();

    // --- A4 and up: arcs ----------------------------------------------------
    // They only appear in the last part of the wind-up, and they get more
    // numerous rather than merely brighter, so the tier reads as busier.
    if (tiers.a >= 4 && t > 0.35) {
      var arcs = (tiers.a >= 5 ? 5 : 2) + Math.round(t * 3);
      var strength = (t - 0.35) / 0.65;
      ctx.strokeStyle = "rgba(255,255,255," + (0.5 * strength).toFixed(3) + ")";
      ctx.lineWidth = 1.15 * scale;
      for (var a = 0; a < arcs && stages > 1; a++) {
        var first = Math.floor(Math.random() * (stages - 1));
        var last = Math.min(stages - 1,
          first + 1 + Math.floor(Math.random() * 2));
        var arcStart = projectSniperAnchor(tower, chargePoints[first], basis);
        var arcEnd = projectSniperAnchor(tower, chargePoints[last], basis);
        var ax = arcStart.x;
        var ay = arcStart.y;
        var bx = arcEnd.x;
        var by = arcEnd.y;
        ctx.strokeStyle = (Math.random() < 0.4 ? teal[1] + "0.9)"
          : "rgba(255,255,255," + (0.62 * strength).toFixed(3) + ")");
        bolt(ctx, ax, ay, bx, by, 5, (5 + 7 * strength) * scale);
      }
    }

    // --- A5: the rune circle on the barrel ---------------------------------
    // It exists because A5 has no man left in it and no colour of its own to
    // change -- the only thing that can carry the tier is the machine doing
    // something visibly larger. It opens as the charge builds, turns, and
    // flares white at the top of the cycle.
    if (tiers.a >= 5) {
      var ringT = Math.max(0, Math.min(1, (charge - 0.15) / 0.85));
      if (ringT > 0) {
        var rr = (7 + 20 * ringT) * scale;
        var spin = (typeof performance !== "undefined" && performance.now
          ? performance.now() : Date.now()) / 900;
        var rune = projectSniperAnchor(tower, authored.rune, basis);
        var rx = rune.x;
        var ry = rune.y;

        ctx.strokeStyle = teal[1] + (0.30 + 0.55 * ringT).toFixed(3) + ")";
        ctx.lineWidth = (1.6 + 1.6 * ringT) * scale;
        barrelRing(ctx, rx, ry, rr, angle, 0.30);
        ctx.strokeStyle = "rgba(255,255,255," + (0.5 * ringT * ringT).toFixed(3) + ")";
        ctx.lineWidth = 0.9 * scale;
        barrelRing(ctx, rx, ry, rr * 0.66, angle, 0.30);

        // Rune ticks around the rim, turning. Eight is enough to read as
        // writing without becoming a pattern anyone tries to read.
        ctx.lineWidth = (1.5 + ringT) * scale;
        ctx.strokeStyle = teal[1] + (0.55 * ringT).toFixed(3) + ")";
        for (var k = 0; k < 8; k++) {
          var th = spin + k * Math.PI / 4;
          var ex = Math.cos(th) * rr * 0.30;
          var ey = Math.sin(th) * rr;
          var c0 = Math.cos(angle), s0 = Math.sin(angle);
          var px = rx + ex * c0 - ey * s0;
          var py = ry + ex * s0 + ey * c0;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + (Math.cos(th) * 3.2) * c0 - (Math.sin(th) * 4.6) * s0,
            py + (Math.cos(th) * 3.2) * s0 + (Math.sin(th) * 4.6) * c0);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // HOW MANY SHOTS ARE LEFT BEFORE THE PAUSE.
  //
  // From B3 the tower fires four and then stops for a beat, and that is the
  // one thing about it a player can actually act on -- whether to expect a
  // shot in the next second. It is drawn as pips rather than modelled into
  // the cylinder because it changes every shot: baking four states into the
  // sheet would multiply an axis that is already 48 facings deep, and the
  // pips read at 50 px where a turned chamber would not.
  //
  // Read straight off the live ReloadTracker, so it cannot disagree with the
  // simulation about how many are left.
  function drawChambers(ctx, tower) {
    var r = tower.core && tower.core.reload;
    if (!r) return;

    var total = r.shotsBeforeReload || 4;
    var spent = r.reloading ? total : (r.shotsFired || 0);
    var scale = tower.footprintPx / ul(20);
    var gap = 5.4 * scale;
    var radius = 2.0 * scale;
    var top = VisualModels.metric("tower", "longshot:body", "topY", tower,
      tower.y - 60) - 7 * scale;
    var left = tower.x - (total - 1) * gap * 0.5;

    ctx.save();
    for (var i = 0; i < total; i++) {
      var live = i >= spent;
      ctx.beginPath();
      ctx.arc(left + i * gap, top, radius, 0, Math.PI * 2);
      ctx.fillStyle = live ? "#C061F0" : "rgba(60,40,74,0.85)";
      ctx.fill();
      if (live) {
        ctx.lineWidth = 0.9 * scale;
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.stroke();
      }
    }

    // While reloading, a bar under the pips counts the beat out. Without it
    // the tower just stops and reads as broken rather than as busy.
    if (r.reloading) {
      var w = (total - 1) * gap + radius * 2;
      var done = 1 - Math.max(0, Math.min(1,
        r.reloadTimer / (r.reloadDurationSeconds || 1)));
      ctx.fillStyle = "rgba(60,40,74,0.85)";
      ctx.fillRect(left - radius, top + 4 * scale, w, 1.6 * scale);
      ctx.fillStyle = "#C061F0";
      ctx.fillRect(left - radius, top + 4 * scale, w * done, 1.6 * scale);
    }
    ctx.restore();
  }

  // A5's kill-stack speed is live combat state, so it cannot be baked into a
  // sheet. Five rings climb the model's rear tally spar, each representing a
  // fifth of the 200-stack cap. The spar is on A5's raised carriage -- its
  // actual world height is 0.91..1.73, not 0.18..0.70 above the ground as the
  // first procedural pass assumed. Projecting those authored levels through
  // the same snapped basis as the sprite keeps every ring on the post in all
  // 48 rows.
  function drawKillStackTally(ctx, tower) {
    var tracker = tower.core && tower.core.killStacks;
    if (!tracker || typeof tracker.count !== "function") return;

    var count = tracker.count();
    var maxStacks = tracker.maxStacks || 200;
    var levels = 5;
    var filled = Math.max(0, Math.min(levels,
      count / Math.max(1, maxStacks) * levels));
    var pxPerWorld = tower.footprintPx * PX_PER_WORLD;
    var basis = sniperSpriteBasis(tower);

    ctx.save();
    for (var i = 0; i < levels; i++) {
      var strength = Math.max(0, Math.min(1, filled - i));
      var ring = projectSniperAnchor(tower,
        [-0.52, 0.0, 1.03 + i * 0.14], basis);
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, 0.11 * pxPerWorld,
        0.035 * pxPerWorld,
        0, 0, Math.PI * 2);
      ctx.lineWidth = (0.7 + strength * 1.1) *
        (tower.footprintPx / ul(20));
      ctx.strokeStyle = strength > 0
        ? "rgba(79,227,210," + (0.38 + strength * 0.62).toFixed(3) + ")"
        : "rgba(45,78,82,0.65)";
      ctx.stroke();
    }
    ctx.restore();
  }

  // THE RITUAL, AND WHAT COMES DOWN AT THE END OF IT.
  //
  // B5's ability channels for three seconds before it resolves
  // (mechanics.activeAbility.channelSeconds). The strongest enemy is locked
  // when the channel starts and the circles follow that SAME body without
  // retargeting. If it dies or leaks, the adapter holds the last valid point
  // and the already-telegraphed strike still lands there.
  //
  // Ground circles are ELLIPSES squashed by GROUND_SQUASH, because they lie
  // on the board rather than facing the camera. Getting that wrong is the
  // single most common way a magic circle reads as a sticker.
  function ritualRing(ctx, cx, cy, radius, spin, ticks) {
    var squash = (typeof Visuals3Q !== "undefined" && Visuals3Q.GROUND_SQUASH)
      ? Visuals3Q.GROUND_SQUASH : 0.56;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius, radius * squash, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (!ticks) return;
    for (var i = 0; i < ticks; i++) {
      var th = spin + i * Math.PI * 2 / ticks;
      var ox = Math.cos(th) * radius;
      var oy = Math.sin(th) * radius * squash;
      ctx.beginPath();
      ctx.moveTo(cx + ox, cy + oy);
      ctx.lineTo(cx + ox * 1.13, cy + oy * 1.13);
      ctx.stroke();
    }
  }

  function drawChannel(ctx, tower) {
    var ch = tower.channel;
    if (!ch) return;
    var p = Math.max(0, Math.min(1, 1 - ch.remaining / (ch.total || 1)));
    var violet = SHOT_COLOURS.sigil;
    var scale = tower.footprintPx / ul(20);
    var params = tower.core.stats.mechanics.activeAbility;
    var radius = ul(params.aoeRadius) * (0.35 + 0.65 * p);
    var spin = (typeof performance !== "undefined" && performance.now
      ? performance.now() : Date.now()) / 700;
    var basis = sniperSpriteBasis(tower);
    var source = projectSniperAnchor(tower,
      SNIPER_EFFECT_ANCHORS.b5.source, basis);

    ctx.save();
    ctx.lineCap = "round";

    // --- the circles at the target -----------------------------------------
    ctx.strokeStyle = violet[1] + (0.30 + 0.6 * p).toFixed(3) + ")";
    ctx.lineWidth = (1.6 + 2.2 * p) * scale;
    ritualRing(ctx, ch.x, ch.y, radius, spin, 12);
    ctx.strokeStyle = violet[1] + (0.20 + 0.5 * p).toFixed(3) + ")";
    ctx.lineWidth = 1.2 * scale;
    ritualRing(ctx, ch.x, ch.y, radius * 0.62, -spin * 1.6, 6);
    ritualRing(ctx, ch.x, ch.y, radius * 0.28, spin * 2.2, 0);

    // A column of light standing in the circle, growing down from the sky as
    // the channel runs -- so the strike is telegraphed as a DIRECTION, not
    // just a place.
    var column = 420 * p * p;
    var grad = ctx.createLinearGradient(ch.x, ch.y - column, ch.x, ch.y);
    grad.addColorStop(0, violet[1] + "0)");
    grad.addColorStop(1, violet[1] + (0.16 + 0.3 * p).toFixed(3) + ")");
    ctx.fillStyle = grad;
    ctx.fillRect(ch.x - radius * 0.30, ch.y - column, radius * 0.60, column);

    // --- and the man paying for it -----------------------------------------
    // A ring closing IN on him, opposite to the target ring opening out.
    ctx.strokeStyle = violet[1] + (0.5 * p).toFixed(3) + ")";
    ctx.lineWidth = 1.4 * scale;
    ritualRing(ctx, tower.x, tower.y, ul(26) * (1.4 - 0.7 * p), -spin, 8);

    // The visible source is B5's face-glare. Keeping this glow on its authored
    // point makes the ground telegraph and model read as one action instead
    // of an unrelated circle plus a floating sprite.
    ctx.fillStyle = violet[1] + (0.22 + 0.48 * p).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(source.x, source.y, (4 + 8 * p) * scale,
      0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,245,255," + (0.75 * p * p).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(source.x, source.y, 2.5 * p * scale, 0, Math.PI * 2);
    ctx.fill();

    // Sigils tearing off him rather than drifting -- this is the cast, not
    // the idle charge, so they move outward fast and hard.
    for (var i = 0; i < 9; i++) {
      var ph = (spin * 0.9 + i / 9) % 1;
      var reach2 = ph * 34 * scale;
      var a2 = p * (1 - ph) * 0.9;
      if (a2 <= 0.02) continue;
      var th2 = i * Math.PI * 2 / 9 + spin * 0.4;
      var sx2 = source.x + Math.cos(th2) * reach2;
      var sy2 = source.y + Math.sin(th2) * reach2 * 0.56;
      ctx.strokeStyle = violet[1] + a2.toFixed(3) + ")";
      ctx.lineWidth = 1.3 * scale;
      ctx.beginPath();
      ctx.moveTo(sx2 - 2.2 * scale, sy2);
      ctx.lineTo(sx2 + 2.2 * scale, sy2);
      ctx.moveTo(sx2, sy2 - 2.2 * scale);
      ctx.lineTo(sx2, sy2 + 2.2 * scale);
      ctx.stroke();
    }
    ctx.restore();
  }

  // The strike. One effect, emitted by resolveChannel at the instant the
  // damage lands, so what the player sees and what the simulation did are the
  // same event rather than two things that happen to agree.
  VisualModels.register("effect", "b5-strike", function (ctx, impact) {
    var fade = Math.max(0, Math.min(1, impact.life / impact.maxLife));
    var age = 1 - fade;
    var violet = SHOT_COLOURS.sigil;
    var r = impact.radiusPx || 26;

    ctx.save();
    ctx.lineCap = "round";

    // The column, full width, collapsing as it fades.
    var width = r * (1.0 - 0.55 * age);
    var grad = ctx.createLinearGradient(impact.x, impact.y - 620,
      impact.x, impact.y);
    grad.addColorStop(0, violet[1] + (0.0).toFixed(2) + ")");
    grad.addColorStop(0.55, violet[1] + (0.42 * fade).toFixed(3) + ")");
    grad.addColorStop(1, "rgba(255,245,255," + (0.85 * fade).toFixed(3) + ")");
    ctx.fillStyle = grad;
    ctx.fillRect(impact.x - width * 0.5, impact.y - 620, width, 620);

    // A hot core inside it for the first instant only.
    if (age < 0.45) {
      var core = 1 - age / 0.45;
      ctx.fillStyle = "rgba(255,255,255," + (0.9 * core).toFixed(3) + ")";
      ctx.fillRect(impact.x - width * 0.16, impact.y - 620,
        width * 0.32, 620);
    }

    // Ground rings blowing outward from the point of impact.
    for (var i = 0; i < 3; i++) {
      var t2 = Math.max(0, Math.min(1, age * 1.5 - i * 0.18));
      if (t2 <= 0) continue;
      ctx.strokeStyle = violet[1] +
        ((1 - t2) * 0.75).toFixed(3) + ")";
      ctx.lineWidth = (3.4 - i) * (1 - t2 * 0.6);
      ritualRing(ctx, impact.x, impact.y, r * (0.5 + t2 * 2.4), 0, 0);
    }

    // Forked discharge crawling out along the ground.
    if (age < 0.6) {
      var strength = 1 - age / 0.6;
      ctx.strokeStyle = "rgba(255,240,255," + (0.8 * strength).toFixed(3) + ")";
      ctx.lineWidth = 1.6;
      for (var f = 0; f < 6; f++) {
        var th3 = f * Math.PI / 3 + (impact.seed % 7) * 0.3;
        bolt(ctx, impact.x, impact.y,
          impact.x + Math.cos(th3) * r * 2.2,
          impact.y + Math.sin(th3) * r * 2.2 * 0.56, 5, r * 0.4);
      }
    }
    ctx.restore();
    return true;
  });

  // The guaranteed fourth shot's CONTACT, emitted only when PierceBullet
  // actually intersects an enemy. It is intentionally compact: the body
  // flash, broken seal and entry slash make the hit feel heavy, while the
  // small ground ring ties it to the victim without hiding nearby units.
  VisualModels.register("effect", "arcane-empowered-hit", function (ctx, impact) {
    var fade = Math.max(0, Math.min(1, impact.life / impact.maxLife));
    var age = 1 - fade;
    var snap = Math.max(0, 1 - age * 3.6);
    var ease = 1 - Math.pow(1 - age, 3);
    var lift = shotLift(impact);
    var cx = impact.x;
    var cy = impact.y - lift;
    var r = Math.max(16, impact.radius || 24);
    var power = 0.82 + (impact.potency || 0) * 0.18;
    var angle = impact.angle || 0;
    var dx = Math.cos(angle);
    var dy = Math.sin(angle);
    var nx = -dy;
    var ny = dx;
    var violet = SHOT_COLOURS.sigil;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // A fast ground seal catches the eye below crowded sprites and makes the
    // lifted barrel-height hit feel connected to the enemy's feet.
    ctx.strokeStyle = violet[1] + (0.62 * fade).toFixed(3) + ")";
    ctx.lineWidth = 2.5 * fade;
    ctx.beginPath();
    ctx.ellipse(impact.x, impact.y + 1,
      r * (0.36 + ease * 0.72),
      r * (0.14 + ease * 0.24), 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = violet[1] + (0.18 * fade).toFixed(3) + ")";
    ctx.lineWidth = 3.5 * fade;
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.35);
    ctx.lineTo(impact.x, impact.y);
    ctx.stroke();

    // The entry stroke is directional, so the hit continues the exact line
    // of the incoming round instead of blooming as an unrelated circle.
    var rear = r * (0.95 + ease * 0.55);
    var front = r * (0.36 + snap * 0.24);
    ctx.strokeStyle = violet[1] + (0.24 * fade).toFixed(3) + ")";
    ctx.lineWidth = 13 * power * (0.55 + snap * 0.45);
    ctx.beginPath();
    ctx.moveTo(cx - dx * rear, cy - dy * rear);
    ctx.lineTo(cx + dx * front, cy + dy * front);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,245,255," +
      (0.92 * (0.35 + snap * 0.65)).toFixed(3) + ")";
    ctx.lineWidth = 2.6 * power * (0.65 + snap * 0.35);
    ctx.beginPath();
    ctx.moveTo(cx - dx * rear, cy - dy * rear);
    ctx.lineTo(cx + dx * front, cy + dy * front);
    ctx.stroke();

    // Broken covenant seal: four separated arcs expand away from contact.
    ctx.strokeStyle = violet[1] + (0.82 * fade).toFixed(3) + ")";
    ctx.lineWidth = Math.max(0.8, 2.4 * fade);
    var sealR = r * (0.28 + ease * 0.64);
    for (var arc = 0; arc < 4; arc++) {
      var start = angle + arc * Math.PI * 0.5 + 0.16;
      ctx.beginPath();
      ctx.arc(cx, cy, sealR, start, start + 0.72);
      ctx.stroke();
    }

    // Perpendicular fracture and four sharp fragments give the first tenth
    // of a second the hard stop the old colour-swap was missing.
    ctx.strokeStyle = "rgba(255,222,255," + (0.9 * snap).toFixed(3) + ")";
    ctx.lineWidth = 1.8 + 1.4 * snap;
    ctx.beginPath();
    ctx.moveTo(cx - nx * r * 0.72, cy - ny * r * 0.72);
    ctx.lineTo(cx + nx * r * 0.72, cy + ny * r * 0.72);
    ctx.stroke();

    for (var shard = 0; shard < 4; shard++) {
      var theta = angle + Math.PI * 0.25 + shard * Math.PI * 0.5;
      var reach = r * (0.34 + ease * (0.55 + (shard % 2) * 0.18));
      var sx = cx + Math.cos(theta) * reach;
      var sy = cy + Math.sin(theta) * reach;
      ctx.fillStyle = violet[1] + (0.78 * fade).toFixed(3) + ")";
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(theta) * 4.5,
        sy + Math.sin(theta) * 4.5);
      ctx.lineTo(sx + Math.cos(theta + 2.35) * 2.3,
        sy + Math.sin(theta + 2.35) * 2.3);
      ctx.lineTo(sx + Math.cos(theta - 2.35) * 2.3,
        sy + Math.sin(theta - 2.35) * 2.3);
      ctx.closePath();
      ctx.fill();
    }

    // One-frame white core: small enough not to wash the target out, bright
    // enough to sell the guaranteed crit as the cadence's punctuation mark.
    if (snap > 0) {
      ctx.fillStyle = "rgba(255,255,255," + (0.94 * snap).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(cx, cy, (4 + r * 0.17) * snap, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    return true;
  });

  // The afterglow the beam leaves behind. PierceBullet emits one of these on
  // death (see leaveRemnant) with the full line it actually covered, and it
  // fades over a fifth of a second -- long enough to register as a shot at a
  // speed where the projectile itself is on screen for about seven frames.
  //
  // It reuses the same brightness ramp as the live beam, so the remnant of a
  // spent shot is dim at the far end exactly as the shot was.
  // THE TYRANT'S GAZE: two lines from the brow to whatever it picked.
  //
  // Registered for the same reason `lance-remnant` is -- a beam has a SECOND
  // endpoint, and the circular fallback in Effects.drawAoeImpacts would draw an
  // expanding ring centred on the middle of the shot, hundreds of pixels wide.
  //
  // TWO, AND THEY CONVERGE. The pair leaves the brow `spreadPx` apart and meets
  // at one point on the tower, which is what separates a look from a muzzle:
  // parallel lines read as a twin cannon, converging ones read as a thing
  // focusing on you. The offset is perpendicular to the beam in SCREEN space
  // here, because that is the only space this flat board has.
  //
  // The lift is subtracted from y, which is how every height on the 2D board is
  // faked (see visualBodyY). The 3D board projects the same numbers as a real
  // height instead -- same facts, each board in the language it can afford.
  VisualModels.register("effect", "tyrant-gaze", function (ctx, impact) {
    var rgb = impact.tint || "255,96,72";
    var fade = Math.max(0, Math.min(1, impact.life / impact.maxLife));
    var lift = impact.liftPx || 0;

    var x1 = impact.x1, y1 = impact.y1 - lift;
    var x2 = impact.x2, y2 = impact.y2;
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len * (impact.spreadPx || 0);
    var ny = dx / len * (impact.spreadPx || 0);

    ctx.save();
    ctx.lineCap = "round";
    for (var side = -1; side <= 1; side += 2) {
      var ex = x1 + nx * side;
      var ey = y1 + ny * side;
      // Outer bloom, hot body, white core -- three passes, widest first, the
      // same stack the lance uses. A single stroke reads as a drawn line; the
      // stack is what reads as light.
      var pass = [[7.0, 0.16], [3.0, 0.55], [1.2, 0.9]];
      for (var i = 0; i < pass.length; i++) {
        ctx.strokeStyle = i === 2
          ? "rgba(255,240,232," + (pass[i][1] * fade).toFixed(3) + ")"
          : "rgba(" + rgb + "," + (pass[i][1] * fade).toFixed(3) + ")";
        ctx.lineWidth = Math.max(0.5, pass[i][0] * (0.35 + 0.65 * fade));
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    ctx.restore();
    return true;
  });

  VisualModels.register("effect", "lance-remnant", function (ctx, impact) {
    var colour = SHOT_COLOURS[impact.tint] || SHOT_COLOURS.neutral;
    var fade = Math.max(0, Math.min(1, impact.life / impact.maxLife));
    var lift = shotLift(impact);
    var scale = impact.style === "meridian" ? 1.85 : 1.0;
    var remaining = Math.max(0.1, Math.min(1,
      impact.endDamage / Math.max(1, impact.baseDamage)));
    var w = (3.2 + Math.min(1, impact.baseDamage / 500) * 4.4) * scale;

    var x1 = impact.x1, y1 = impact.y1 - lift;
    var x2 = impact.x2, y2 = impact.y2 - lift;

    function ramp(alpha) {
      var g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, colour[1] + (alpha * fade).toFixed(3) + ")");
      g.addColorStop(1, colour[1] + (alpha * fade * remaining).toFixed(3) + ")");
      return g;
    }

    ctx.save();
    ctx.lineCap = "butt";
    // Thins as it fades, which is how a hot line cools -- the width carrying
    // the FADE is fine; it was width carrying the DAMAGE that read as a cone.
    ctx.strokeStyle = ramp(0.18);
    ctx.lineWidth = w * 3.4 * (0.35 + 0.65 * fade);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = ramp(0.6);
    ctx.lineWidth = w * 1.35 * (0.3 + 0.7 * fade);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    var core = ctx.createLinearGradient(x1, y1, x2, y2);
    core.addColorStop(0, "rgba(255,255,255," + (0.8 * fade).toFixed(3) + ")");
    core.addColorStop(1, "rgba(255,255,255," +
      (0.8 * fade * remaining).toFixed(3) + ")");
    ctx.strokeStyle = core;
    ctx.lineWidth = Math.max(0.5, w * 0.5 * fade);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
    return true;
  });

  // -------------------------------------------------------------------------
  // The build-bar and Index icon: the actual model, not a placeholder.
  //
  // The built-in icon is three strokes of violet standing in for a tower
  // nobody had drawn yet. Now that one exists, the icon should BE it -- an
  // icon that does not match the thing it buys is a small lie the player has
  // to unlearn.
  //
  // This cannot use registerSpriteSheet: the icon subject is
  // { cx, cy, size, type }, not a tower, so there is no position, footprint
  // or purchased-tier to read. It loads the same two files by URL (the
  // browser serves them from cache, so it costs a decode, not a fetch) and
  // blits one tile.
  var ICON_ROW = 0;         // facing screen-right: the pose it was modelled in
  // Sprite height as a multiple of `size`. Generous because the tile is sized
  // to fit the RIFLE, which sticks out sideways, so the man himself is only
  // about half the tile wide -- drawn to fit the tile he comes out tiny.
  var ICON_FILL = 3.5;

  function iconImage(src) {
    var image = null;
    return function () {
      if (typeof Image === "undefined") return null;
      if (!image) {
        image = new Image();
        image.src = src;
      }
      return (image.complete && image.naturalWidth) ? image : null;
    };
  }

  var iconBody = iconImage(asset("sniper_body"));
  var iconAccent = iconImage(asset("sniper_accent0"));

  VisualModels.register("tower", "longshot:icon", function (ctx, icon) {
    var body = iconBody();
    if (!body) return false;   // fall back to the built-in until it decodes

    var height = icon.size * ICON_FILL;
    var width = height;        // tiles are square
    var left = icon.cx - width * 0.5;
    // The build bar's slot centres on cy, and the model stands on the bottom
    // of its tile with a lot of headroom above -- so bias it down or the
    // figure floats in the top half of the slot.
    var top = icon.cy + icon.size * 0.95 - height;

    ctx.save();
    ctx.drawImage(body, 0, ICON_ROW * SNIPER_TILE, SNIPER_TILE, SNIPER_TILE,
      left, top, width, height);
    var accent = iconAccent();
    if (accent) {
      ctx.drawImage(accent, 0, ICON_ROW * SNIPER_TILE, SNIPER_TILE,
        SNIPER_TILE, left, top, width, height);
    }
    ctx.restore();
    return true;
  });

  // Published so anything hung above the tower (a health bar, a stun ring)
  // clears the hat rather than the built-in footprint.
  VisualModels.registerMetric("tower", "longshot:body", "topY",
    function (tower) {
      var tierState = sniperTiers(tower);
      var group = sniperGroup(tierState.a, tierState.b);
      var spec = SNIPER_GROUPS[group];
      var size = towerSize(tower, group);
      return tower.y - sniperGroundLift(tower, group) -
        size * spec.contentTop;
    });

  // -------------------------------------------------------------------------
  // THE RIFLEMAN -- tower `soldier`, tools/blender/tower_rifleman.py.
  //
  // Same pipeline as the Sniper above and deliberately so: seven body sheets
  // at 48 facings, one group per body, accents composited over whichever body
  // is live. What differs is small and each difference has a reason.
  //
  // HE IS DRAWN AT THE SAME WORLD SCALE AS THE SNIPER, and that needs its own
  // constant. The shared PX_PER_WORLD is expressed in FOOTPRINTS, and these
  // two towers have very different ones -- the Longshot's is 20 u.l. and the
  // Soldier's is 11.25 (js/tower.js, unchanged since the gunner). Reusing
  // 1.529 would draw the Rifleman at 11.25/20 of the Sniper's size, i.e. a man
  // roughly half the height of the man standing next to him. Scaling by the
  // footprint ratio keeps a 1.3-unit shoulder the same number of pixels on
  // both models, which is the property that actually matters: they are both
  // people, on the same board, at the same time.
  var RIFLEMAN_TILE = 256;
  var RIFLEMAN_DIRECTIONS = 48;
  var RIFLEMAN_PX_PER_WORLD = PX_PER_WORLD * (20 / 11.25);   // 2.718
  var RIFLEMAN_ROOT_ANCHOR_Y = SNIPER_ROOT_ANCHOR_Y;         // same camera

  // ortho matches tools/blender/tower_rifleman.py's ORTHO; contentTop is
  // MEASURED off each rendered sheet by td_scene's content-box print. Both
  // must be re-copied whenever a body is re-rendered.
  var RIFLEMAN_GROUPS = {
    base: { ortho: 3.35, contentTop: 0.6250 },
    a3:   { ortho: 3.05, contentTop: 0.6836 },
    a4:   { ortho: 3.70, contentTop: 0.6602 },
    a5:   { ortho: 4.10, contentTop: 0.6250, tile: 384, directionRows: 16 },
    b3:   { ortho: 3.45, contentTop: 0.6133 },
    b4:   { ortho: 3.70, contentTop: 0.5820 },
    b5:   { ortho: 3.85, contentTop: 0.6406, tile: 384, directionRows: 16 }
  };

  // WHICH BODY A RIFLEMAN IS BUILT FROM.
  //
  // Unlike the Longshot, the Soldier is not a ConfiguredTower -- it is written
  // like the Smasher, with an explicit boolean per tier (js/soldier.js), so the
  // tiers are counted off those flags rather than read out of `core.purchased`.
  // Counting rather than testing the highest flag is deliberate: the tables are
  // strictly ordered and `requires` enforces it, so the count IS the tier, and
  // a future inserted tier does not need this to be edited.
  function riflemanTiers(tower) {
    var a = 0;
    var b = 0;
    var i;
    for (i = 1; i <= 5; i++) {
      if (tower["hasA" + i]) a = i;
      if (tower["hasB" + i]) b = i;
    }
    return { a: a, b: b };
  }

  // `locksPath` on A3+ and B3+ caps the other branch at 2 forever, so at most
  // one of these can be 3 or more and a single group name identifies the body.
  function riflemanGroup(a, b) {
    if (a >= 5) return "a5";
    if (a === 4) return "a4";
    if (a === 3) return "a3";
    if (b >= 5) return "b5";
    if (b === 4) return "b4";
    if (b === 3) return "b3";
    return "base";
  }

  function riflemanFacing(tower) {
    var angle = tower.aim;
    if (typeof angle !== "number" || !isFinite(angle)) return { x: 1, y: 0 };
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  // The same snap-then-project trick the Sniper uses: procedural light has to
  // use the row that was actually drawn, not the continuous aim, or it slides
  // off the barrel by up to half a row.
  function riflemanSpriteBasis(tower) {
    var face = riflemanFacing(tower);
    var squash = (typeof Visuals3Q !== "undefined" && Visuals3Q.GROUND_SQUASH)
      ? Visuals3Q.GROUND_SQUASH : 0.56;
    var yaw = Math.atan2(-face.y / squash, face.x);
    var step = Math.PI * 2 / RIFLEMAN_DIRECTIONS;
    var rawRow = Math.round(yaw / step);
    yaw = rawRow * step;

    var c = Math.cos(yaw);
    var s = Math.sin(yaw);
    return {
      forwardX: c,
      forwardY: -s * squash,
      sideX: -s,
      sideY: -c * squash,
      verticalY: -Math.sqrt(Math.max(0, 1 - squash * squash)),
      row: ((rawRow % RIFLEMAN_DIRECTIONS) + RIFLEMAN_DIRECTIONS) %
        RIFLEMAN_DIRECTIONS
    };
  }

  // Blender-local [forward, side, height] in the same world units the model
  // script uses, printed by its main(). These are the far face of each
  // weapon's last piece -- not a percentage of anything -- which is what keeps
  // the muzzle flash welded to metal across seven very different weapons.
  var RIFLEMAN_MUZZLE = {
    base: [0.926, -0.200, 1.008],
    a3:   [0.945, -0.180, 1.015],
    a4:   [1.200, 0.000, 1.100],
    a5:   [1.190, 0.000, 1.140],
    b3:   [0.937, -0.200, 0.989],
    b4:   [0.977, -0.200, 0.992],
    b5:   [1.145, 0.000, 1.240]
  };

  function projectRiflemanAnchor(tower, point, basis) {
    basis = basis || riflemanSpriteBasis(tower);
    var scale = tower.footprintPx * RIFLEMAN_PX_PER_WORLD;
    return {
      x: tower.x + (basis.forwardX * point[0] + basis.sideX * point[1]) * scale,
      y: tower.y + (basis.forwardY * point[0] + basis.sideY * point[1] +
        basis.verticalY * point[2]) * scale
    };
  }

  function riflemanSize(tower, group) {
    return tower.footprintPx * RIFLEMAN_PX_PER_WORLD *
      RIFLEMAN_GROUPS[group || "base"].ortho;
  }

  function riflemanGroundLift(tower, group) {
    return -riflemanSize(tower, group) * (1 - RIFLEMAN_ROOT_ANCHOR_Y);
  }

  // THE WORK CYCLE NEEDS NO CLOCK OF ITS OWN.
  //
  // `Soldier.gearPhase()` is already `1 - cooldown / cycleSeconds()`, and
  // `cycleSeconds()` is already the one place the tower's two firing models are
  // reconciled for the artwork -- a burst sweeps it over the burst cooldown and
  // B3's automatic fire sweeps it over one shot interval. So the same four
  // frames give a measured cycle at base, a fast one at A5 and a continuous
  // shudder from B3, and buying attack speed makes him work faster with nothing
  // to keep in step.
  //
  // The action occupies the first WORK_SHARE of the cycle and frame 0 is held
  // for the rest: a weapon still cycling when the next shot leaves reads wrong.
  var WORK_FRAMES = 4;
  var WORK_SHARE = 0.45;

  function workFrame(tower) {
    var phase = (typeof tower.gearPhase === "function") ? tower.gearPhase() : 0;
    if (!isFinite(phase) || phase >= WORK_SHARE) return 0;
    var into = Math.max(0, phase) / WORK_SHARE;
    return 1 + Math.min(WORK_FRAMES - 2,
      Math.floor(into * (WORK_FRAMES - 1)));
  }

  // The Blender bodies contain no plinth, and the Soldier's fallback body --
  // which draws one -- never runs once this succeeds. A flat pad gives his
  // shoes contact and the usual down-right cast shadow without touching the
  // gameplay footprint.
  //
  // NO FACTION TEAL OR VIOLET ON IT. Every other pad on the board is lit in a
  // path colour; his is a plain kerb with a brass rim, because the whole model
  // is an argument that he does not have a faction colour.
  function drawRiflemanGround(ctx, tower, group) {
    var mounted = (group === "a4" || group === "a5" || group === "b5");
    var radius = tower.footprintPx * (mounted ? 1.16 : 1.02);

    ctx.save();
    if (typeof Visuals3Q !== "undefined" && Visuals3Q.platform) {
      Visuals3Q.platform(ctx, tower.x, tower.y, radius, {
        height: 0,
        top: "#2A2B36",
        side: "#15161D",
        rim: "rgba(232,184,75,0.50)",
        highlight: "rgba(255,236,196,0.20)",
        shadowAlpha: mounted ? 0.34 : 0.28,
        lineWidth: mounted ? 1.7 : 1.35
      });
    } else {
      ctx.beginPath();
      ctx.ellipse(tower.x, tower.y, radius, radius * 0.56, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#2A2B36";
      ctx.fill();
    }
    ctx.restore();
  }

  function registerRiflemanLayer(id, file, group, frames, frameFn) {
    var spec = RIFLEMAN_GROUPS[group];
    var isBody = id.indexOf("body") === 0;

    if (isBody) {
      // Body layers own the pad, and the pad has to be painted BEFORE the
      // sprite but only once the image has decoded -- the same reason the
      // Sniper's bodies cannot use the shared lazy loader.
      var image = null;
      var source = asset(file);
      var modelId = "soldier:layer-" + id;

      VisualModels.register("tower", modelId, function (ctx, tower) {
        if (typeof Image === "undefined") return false;
        if (!image) {
          image = new Image();
          image.src = source;
        }
        if (!image.complete || !image.naturalWidth) return false;

        var basis = riflemanSpriteBasis(tower);
        var tile = spec.tile || RIFLEMAN_TILE;
        var directionRows = spec.directionRows || RIFLEMAN_DIRECTIONS;
        var count = frames || 1;
        var column = frameFn ? Math.floor(frameFn(tower)) : 0;
        column %= count;
        if (column < 0) column += count;
        var sourceRow = basis.row % directionRows;
        var sourceColumn = Math.floor(basis.row / directionRows) * count +
          column;

        var size = riflemanSize(tower, group);
        var lift = riflemanGroundLift(tower, group);
        drawRiflemanGround(ctx, tower, group);

        ctx.save();
        // NO AMBIENT RIM HERE EITHER. It was a warm counterpart to the
        // Sniper's cool one, and it was a canvas shadow set on every draw of a
        // ~110 px sprite -- see the note on enemyTint for what that costs.
        // Towers are far fewer than enemies so this one was not the emergency,
        // but the rule is the rule: state only, and a resting tower has none.
        ctx.drawImage(image,
          sourceColumn * tile, sourceRow * tile, tile, tile,
          tower.x - size * 0.5, tower.y - lift - size, size, size);
        ctx.restore();
        return true;
      });

      VisualModels.registerMetric("tower", modelId, "topY",
        function (tower) {
          var size = riflemanSize(tower, group);
          return tower.y - riflemanGroundLift(tower, group) -
            size * spec.contentTop;
        });
      return;
    }

    VisualModels.registerSpriteSheet("tower", "soldier:layer-" + id,
      asset(file), {
        frameWidth: spec.tile || RIFLEMAN_TILE,
        frameHeight: spec.tile || RIFLEMAN_TILE,
        frames: frames || 1,
        frame: frameFn,
        directions: RIFLEMAN_DIRECTIONS,
        directionRows: spec.directionRows || RIFLEMAN_DIRECTIONS,
        direction: riflemanFacing,
        width: function (tower) { return riflemanSize(tower, group); },
        height: function (tower) { return riflemanSize(tower, group); },
        contentTop: spec.contentTop,
        lift: function (tower) { return riflemanGroundLift(tower, group); },
        shadowColor: null,
        shadowBlur: 0
      });
  }

  var RIFLEMAN_GROUP_IDS = ["base", "a3", "a4", "a5", "b3", "b4", "b5"];
  // Which crosspath accent each body can wear. Tier 3 on one branch caps the
  // other at 2, so a path A body only ever wears B1/B2 and vice versa -- and
  // unlike the Sniper, the FINAL tiers wear them too. A5+B1+B2 is the owner's
  // own specified Rifleman build (9 damage, 75 DPS) and B5+A1+A2 is a row in
  // the DPS table, so leaving those two bare would hide a bought upgrade on
  // exactly the builds the balance notes single out.
  var RIFLEMAN_CROSS = {
    base: ["a", "b"],
    a3: ["b"], a4: ["b"], a5: ["b"],
    b3: ["a"], b4: ["a"], b5: ["a"]
  };

  (function registerRiflemanLayers() {
    RIFLEMAN_GROUP_IDS.forEach(function (group) {
      var file = group === "base" ? "rifleman_body"
        : "rifleman_body_" + group;
      var id = group === "base" ? "body" : "body-" + group;
      registerRiflemanLayer(id, file, group, WORK_FRAMES, workFrame);

      RIFLEMAN_CROSS[group].forEach(function (path) {
        for (var tier = 1; tier <= 2; tier++) {
          var stem = "rifleman_accent_" + path + tier;
          registerRiflemanLayer(
            path + tier + (group === "base" ? "" : "-" + group),
            group === "base" ? stem : stem + "_" + group, group);
        }
      });
    });
  })();

  // THE MUZZLE FLASH, AND WHY IT IS NOT ON THE SHEET.
  //
  // A flash is one or two frames long and would have multiplied all seven
  // 48-facing bodies by another frame each to carry it. It is also the one
  // piece of feedback that has to be exactly as long as a shot, and `sinceShot`
  // already measures that -- for both firing models, in the tower's own terms.
  // So it is drawn here, at the projected muzzle anchor, using the SNAPPED
  // sprite basis so it sits on the barrel that was actually rendered.
  var FLASH_SECONDS = 0.055;

  function drawRiflemanFlash(ctx, tower, group) {
    var age = (typeof tower.sinceShot === "function") ? tower.sinceShot() : null;
    if (age === null || age > FLASH_SECONDS) return;

    var basis = riflemanSpriteBasis(tower);
    var at = projectRiflemanAnchor(tower, RIFLEMAN_MUZZLE[group], basis);
    var fade = 1 - age / FLASH_SECONDS;
    var scale = tower.footprintPx * RIFLEMAN_PX_PER_WORLD;
    var reach = (0.10 + 0.05 * fade) * scale;

    ctx.save();
    // A cordite flash: warm white core, amber corona. Nothing enchanted, which
    // is the same rule the model itself follows.
    ctx.globalAlpha = 0.85 * fade;
    ctx.fillStyle = "rgba(255,226,150,0.9)";
    ctx.beginPath();
    ctx.ellipse(at.x + basis.forwardX * reach * 0.5,
      at.y + basis.forwardY * reach * 0.5,
      reach, reach * 0.42,
      Math.atan2(basis.forwardY, basis.forwardX), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = fade;
    ctx.fillStyle = "#FFF3D6";
    ctx.beginPath();
    ctx.arc(at.x, at.y, reach * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  VisualModels.register("tower", "soldier:body", function (ctx, tower) {
    var tiers = riflemanTiers(tower);
    var group = riflemanGroup(tiers.a, tiers.b);
    var bodyId = group === "base" ? "layer-body" : "layer-body-" + group;

    // If the body has not decoded yet, fall back WHOLESALE. Drawing a gold hat
    // band with no man under it is worse than one frame of the built-in model.
    if (!VisualModels.draw("tower", "soldier:" + bodyId, ctx, tower)) {
      return false;
    }

    // Tiers 1 and 2 on EITHER branch are accents on whichever body is live.
    // Only one of the two branches can hold 3+, so at most one of these fires
    // with a tier above 2 -- and that branch has no accent, because from tier 3
    // it IS the body.
    var suffix = group === "base" ? "" : "-" + group;
    if (tiers.a >= 1 && tiers.a <= 2 && RIFLEMAN_CROSS[group].indexOf("a") >= 0) {
      VisualModels.draw("tower", "soldier:layer-a" + tiers.a + suffix, ctx,
        tower);
    }
    if (tiers.b >= 1 && tiers.b <= 2 && RIFLEMAN_CROSS[group].indexOf("b") >= 0) {
      VisualModels.draw("tower", "soldier:layer-b" + tiers.b + suffix, ctx,
        tower);
    }

    drawRiflemanFlash(ctx, tower, group);
    return true;
  });

  // Published so the health bar hangs above the hat rather than through it.
  VisualModels.registerMetric("tower", "soldier:body", "topY",
    function (tower) {
      var tiers = riflemanTiers(tower);
      var group = riflemanGroup(tiers.a, tiers.b);
      var size = riflemanSize(tower, group);
      return tower.y - riflemanGroundLift(tower, group) -
        size * RIFLEMAN_GROUPS[group].contentTop;
    });

  // The build-bar and Index icon. Same constraints as the Sniper's: the icon
  // subject is { cx, cy, size, type }, so there is no tower to read a facing or
  // a tier from, and it blits row 0 frame 0 of the base body -- the pose the
  // model was built in.
  var riflemanIcon = iconImage(asset("rifleman_body"));

  // -------------------------------------------------------------------------
  // HIS RECRUITS -- summons `soldier-recruit-b4` and `-b5`.
  //
  // They are not his crew. B4 spawns two of them at the far end of the road and
  // they walk the wrong way up it: people in the clothes they were wearing,
  // holding a rifle somebody handed them an hour ago. B5's are the same people
  // four weeks later -- a helmet, a webbing belt, boots that match and his
  // oxblood armband -- and still visibly not soldiers, because 40 hp and 3
  // damage is not a unit that holds a lane and must not look like one.
  //
  // THEY USE THE ENEMY PIPELINE, NOT THE TOWER ONE, because they walk a path:
  // 8 facings, and the cycle advanced by DISTANCE so a planted foot stays on
  // one patch of road. What they add is a second state the enemies do not
  // have. `SoldierRecruit.holding` is set the frame one acquires a target and
  // THEY STOP TO SHOOT, so that gets its own braced sheet driven off the shot
  // cooldown rather than off distance -- a unit that stands still would freeze
  // a distance-driven cycle mid-step forever.
  var RECRUIT_TILE_W = 128;
  var RECRUIT_TILE_H = 160;
  var RECRUIT_DIRECTIONS = 8;
  var RECRUIT_WALK_FRAMES = 8;
  var RECRUIT_HOLD_FRAMES = 4;

  // ortho matches tools/blender/summon_recruit.py; contentTop and stride are
  // its measured/derived prints. `stride` is how far one complete walk cycle
  // carries the model as a fraction of its drawn height -- the number that
  // ties the legs to the road.
  // contentTop takes the HOLD sheet's figure, which is the taller of the two
  // by a rifle's worth: a health bar hung off the walk's number would sit
  // inside the weapon the moment one stopped to shoot.
  var RECRUIT_TIERS = {
    b4: { ortho: 1.95, contentTop: 0.8187, stride: 0.3004 },
    b5: { ortho: 2.55, contentTop: 0.6875, stride: 0.2297 }
  };

  // One Blender world unit, in pixels, shared by every rendered model on the
  // board. Derived rather than declared: the Sniper's sprite is
  // footprintPx * PX_PER_WORLD * ortho pixels tall for an ortho-tall tile and
  // its footprint is 20 u.l., so this is the same scale the towers draw at --
  // which is what keeps a recruit the right size standing next to the man who
  // called it. Computed lazily because `ul` is not defined when this file runs.
  function worldPx() { return ul(20) * PX_PER_WORLD; }

  function recruitTier(recruit) {
    return String(recruit.visualTier || "B4").toLowerCase() === "b5"
      ? "b5" : "b4";
  }

  function recruitHeight(recruit) {
    return worldPx() * RECRUIT_TIERS[recruitTier(recruit)].ortho;
  }

  function recruitWidth(recruit) {
    return recruitHeight(recruit) * (RECRUIT_TILE_W / RECRUIT_TILE_H);
  }

  function recruitGroundLift(recruit) {
    return -recruitHeight(recruit) * (1 - ENEMY_ROOT_ANCHOR_Y);
  }

  // `facing` is already a screen-space angle -- the walk heading, or the angle
  // to whatever it stopped to shoot. registerSpriteSheet undoes the ground
  // squash before choosing a row, exactly as it does for a walking enemy.
  function recruitFacing(recruit) {
    var angle = recruit.facing;
    if (typeof angle !== "number" || !isFinite(angle)) return { x: 1, y: 0 };
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  function registerRecruit(tier) {
    var spec = RECRUIT_TIERS[tier];
    var id = "soldier-recruit-" + tier;

    function sheet(state, frames, frameFn) {
      VisualModels.registerSpriteSheet("summon", id + ":" + state,
        asset("recruit_" + tier + "_" + state), {
          frameWidth: RECRUIT_TILE_W,
          frameHeight: RECRUIT_TILE_H,
          frames: frames,
          frame: frameFn,
          directions: RECRUIT_DIRECTIONS,
          direction: recruitFacing,
          width: recruitWidth,
          height: recruitHeight,
          lift: recruitGroundLift,
          contentTop: spec.contentTop,
          position: function (recruit) {
            return { x: recruit.x, y: recruit.y };
          }
        });
    }

    sheet("walk", RECRUIT_WALK_FRAMES, function (recruit) {
      // Distance, not a clock. `progress` counts DOWN as it marches back up
      // the road, so the cycle runs backwards without a sign flip and the feet
      // still push the right way.
      var stride = recruitHeight(recruit) * spec.stride;
      if (!(stride > 0)) return 0;
      return -recruit.progress * RECRUIT_WALK_FRAMES / stride;
    });

    sheet("hold", RECRUIT_HOLD_FRAMES, function (recruit) {
      // Off its own shot cooldown, so the recoil lands when the round does and
      // a faster recruit visibly works faster. Frame 0 is the aimed pose and
      // the action occupies the front of each shot.
      var rate = (recruit.stats && recruit.stats.shotsPerSecond) || 0;
      if (rate <= 0) return 0;
      var cycle = 1 / rate;
      var into = 1 - Math.max(0, Math.min(cycle, recruit.cooldown)) / cycle;
      if (into >= 0.5) return 0;
      return 1 + Math.min(RECRUIT_HOLD_FRAMES - 2,
        Math.floor((into / 0.5) * (RECRUIT_HOLD_FRAMES - 1)));
    });

    VisualModels.register("summon", id + ":body", function (ctx, recruit,
        options) {
      // A contact ellipse at the exact ground point, the same one the walking
      // enemies get. SoldierRecruit.draw has already laid down the cast
      // shadow; this is what joins the soles to it.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(recruit.x, recruit.y + 1.5, 5.2, 1.9, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(4,10,8,0.42)";
      ctx.fill();
      ctx.restore();

      return VisualModels.draw("summon",
        id + (recruit.holding ? ":hold" : ":walk"), ctx, recruit, options);
    });

    VisualModels.registerMetric("summon", id + ":body", "topY",
      function (recruit) {
        return recruit.y - recruitGroundLift(recruit) -
          recruitHeight(recruit) * spec.contentTop;
      });
  }

  registerRecruit("b4");
  registerRecruit("b5");

  // -------------------------------------------------------------------------
  // HIS SHOTS, AND WHAT THEY LEAVE BEHIND.
  //
  // `Soldier.fire` stamps two presentation-only fields on every round it makes:
  // `liftUl`, the height of the barrel it left, and `shotBody`, which body
  // fired it. Both are set once and never read by the simulation, so a round
  // already in the air keeps the weapon it came out of even if the tower is
  // sold or upgraded behind it.
  //
  // THE LIFT IS NOT A FUDGE. A bullet's real position stays on the flat plane
  // it does its hit tests on; only the picture rises to meet the muzzle. That
  // is the same split the engine already uses for enemies, where `pos` is the
  // feet and `visualBodyY` is where the body is painted, and the same one the
  // Longshot's bolt uses.
  //
  // A ROUND WITHOUT `shotBody` FALLS THROUGH. This renderer is registered on
  // the shared `projectile/bullet` id, which every homing shot in the game
  // draws through, so anything that is not a Rifleman's returns false and gets
  // the built-in bolt untouched.
  var RIFLEMAN_SHOTS = {
    // core, trail, radius, trail length, glow
    // Toned down 2026-08-29 with gl-world's copy -- see the note there. The two
    // tables are identical by design and a retune has to move both.
    base:         ["#FFE6A8", "255,206,120", 1.4, 10, 0.16],
    a3:           ["#FFE6A8", "255,206,120", 1.5, 12, 0.18],
    // A4 and A5 are a mounted gun and then a four-barrel battery. Bigger,
    // whiter, and long enough to read as a stream when five leave at once.
    a4:           ["#FFF2CE", "255,224,150", 1.9, 15, 0.22],
    a5:           ["#FFFFFF", "255,236,180", 2.3, 20, 0.28],
    // Path B never gets hotter, it gets FASTER -- so its rounds are small and
    // pale and the read comes from how many of them there are.
    b3:           ["#EAF0F6", "214,228,240", 1.2, 8, 0.14],
    b4:           ["#EAF0F6", "214,228,240", 1.3, 9, 0.16],
    // Twenty flat damage, once. One heavy slug with weight behind it.
    b5:           ["#FFF6E0", "246,214,150", 2.6, 17, 0.30],
    // The people he armed. Dull, small, and visibly less than anything the
    // tower itself fires -- 1 damage should not look like 8.
    "recruit-b4": ["#D8C79A", "186,168,126", 0.9, 5, 0.10],
    "recruit-b5": ["#E4D6AC", "204,186,142", 1.1, 7, 0.12]
  };

  VisualModels.register("projectile", "bullet", function (ctx, shot) {
    var spec = RIFLEMAN_SHOTS[shot.shotBody];
    if (!spec) return false;          // not one of his -- built-in bolt

    var core = spec[0];
    var rgb = spec[1];
    var radius = spec[2];
    var trail = spec[3];
    var glow = spec[4];

    var dx = (shot.target && shot.target.pos) ? shot.target.pos.x - shot.x : 1;
    var dy = (shot.target && shot.target.pos) ? shot.target.pos.y - shot.y : 0;
    var length = Math.sqrt(dx * dx + dy * dy) || 1;
    var dirX = dx / length;
    var dirY = dy / length;
    var y = shot.y - shotLift(shot);

    ctx.save();
    // A ground shadow under the real position, not under the drawn one, so the
    // round still reads as being somewhere on the board.
    if (typeof Visuals3Q !== "undefined" && Visuals3Q.shadow) {
      Visuals3Q.shadow(ctx, shot.x, shot.y + 2, radius * 1.4, radius * 0.6,
        0.16, radius * 1.6);
    }

    // The trail is drawn BEHIND the round along its own heading and tapers to
    // nothing, so a burst of five reads as five rounds in a line rather than
    // as one smear.
    var grad = ctx.createLinearGradient(
      shot.x - dirX * trail, y - dirY * trail * 0.62, shot.x, y);
    grad.addColorStop(0, "rgba(" + rgb + ",0)");
    grad.addColorStop(1, "rgba(" + rgb + "," + glow.toFixed(2) + ")");
    ctx.strokeStyle = grad;
    ctx.lineWidth = radius * 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(shot.x - dirX * trail, y - dirY * trail * 0.62);
    ctx.lineTo(shot.x, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(shot.x, y, radius * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(" + rgb + "," + (glow * 0.42).toFixed(2) + ")";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(shot.x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();
    ctx.restore();
    return true;
  });

  // The mark a round leaves. `Soldier.fire`'s onHit emits `rifleman-hit` with
  // the same `shotBody`, so the impact matches the weapon rather than being one
  // generic burst for a 1-damage carbine and a 20-damage heavy gun alike.
  //
  // NOTHING READS THIS BACK. An impact is feedback; the simulation has already
  // finished with the shot by the time one exists.
  VisualModels.register("effect", "rifleman-hit", function (ctx, impact) {
    var spec = RIFLEMAN_SHOTS[impact.shotBody] || RIFLEMAN_SHOTS.base;
    var rgb = spec[1];
    var core = spec[0];
    var heavy = impact.shotBody === "a5" || impact.shotBody === "b5";

    var progress = 1 - impact.life / impact.maxLife;
    var fade = 1 - progress;
    var y = impact.y - ul(12);
    var front = impact.radius * (0.22 + progress * 0.85);

    ctx.save();
    ctx.globalAlpha = fade;

    // A flat spark ring on the ground plane, so it sits in the same world as
    // everything else Visuals3Q draws.
    ctx.beginPath();
    ctx.ellipse(impact.x, y, front, front * 0.56, 0, 0, Math.PI * 2);
    ctx.lineWidth = heavy ? 2.4 : 1.4;
    ctx.strokeStyle = "rgba(" + rgb + "," + (0.7 * fade).toFixed(2) + ")";
    ctx.stroke();

    // The hit itself: a bright core that collapses rather than expands.
    ctx.beginPath();
    ctx.arc(impact.x, y, impact.radius * (heavy ? 0.42 : 0.26) * fade,
      0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();

    // Deterministic sparks off the seed -- the same trick the built-in burst
    // uses, so an impact never flickers differently between two draws of the
    // same frame.
    var rays = heavy ? 7 : 4;
    ctx.lineWidth = heavy ? 1.8 : 1.1;
    ctx.strokeStyle = "rgba(" + rgb + "," + (0.85 * fade).toFixed(2) + ")";
    for (var i = 0; i < rays; i++) {
      var angle = ((impact.seed + i * 97) % 360) * Math.PI / 180;
      var inner = front * 0.55;
      var outer = front * (heavy ? 1.5 : 1.15);
      ctx.beginPath();
      ctx.moveTo(impact.x + Math.cos(angle) * inner,
        y + Math.sin(angle) * inner * 0.56);
      ctx.lineTo(impact.x + Math.cos(angle) * outer,
        y + Math.sin(angle) * outer * 0.56);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  });

  VisualModels.register("tower", "soldier:icon", function (ctx, icon) {
    var body = riflemanIcon();
    if (!body) return false;

    // Scaled off the Sniper's 3.5 by the ratio of the two base orthos
    // (3.35 / 2.90), because "how much of its tile does the man occupy" is
    // exactly what ortho decides. Picking a number by eye put him at half the
    // height of the Warbringer in the slot beside him.
    var height = icon.size * 3.5 * (3.35 / 2.90);
    var left = icon.cx - height * 0.5;
    var top = icon.cy + icon.size * 0.95 - height;

    ctx.save();
    ctx.drawImage(body, 0, 0, RIFLEMAN_TILE, RIFLEMAN_TILE,
      left, top, height, height);
    ctx.restore();
    return true;
  });
})();
