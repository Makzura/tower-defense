// ---------------------------------------------------------------------------
// BlubFXHealth -- THE BODY IS THE HEALTH BAR (brief sections 8 and 9).
//
// A blub's hit points are its AMMUNITION: js/blub.js spends exactly one per
// attack (`Blub.prototype.resolveAttack`, `this.currentHp -= 1`). So a blub
// that has been shooting is a blub that is running out, and the brief's demand
// is that you can see that WITHOUT A BAR:
//
//     100%   rebondi, tendu, brillant
//      50%   mou, s'affaisse, plis visibles
//      20%   flasque, tremble, regard inquiet
//       0%   it bursts
//
// THE EXCEPTION, and it is the point rather than an inconsistency: the Hungry
// Blub's damage compounds 4% per attack, so it INFLATES as it spends. Thirty
// five attacks later it is a bulging skin. Every other blub on the board is
// sagging; that one is swelling, and the contradiction is what tells you what
// it is.
//
// WHY THIS MATTERS BEYOND MOOD. Coagulation (A5) fuses the fleet and the tier
// it produces is decided by the SUM OF THE CURRENT HP of every living blub
// (`BlubTower.prototype.pooledHp`). A player looking at a field of collapsed
// blubs has to understand, without clicking anything, that fusing now buys a
// tier 0 puddle. The deflation is the readout for that decision.
//
// READ-ONLY, AND NOT NEGOTIABLE. This module reads `currentHp`, `maxHp`,
// `attacksMade`, `growth`, `cooldown`, `x`, `y`, `unitId` and `monsterTier`
// off a live blub and writes NOTHING back. It owns no simulation value, it
// never touches `footprintUl` / `footprintPx` (the ground radii are gameplay
// and are fixed at 10, 13, 20, 10, 10, 25, 25, 30, 40, 50), and every number
// it produces is a multiplier handed to the renderer for one frame.
//
//
// ============ WHAT IS REACHABLE TODAY, AND WHAT IS NOT ======================
//
// The task asked me to prefer the existing squash hook over inventing a second
// deformation path, and to say so plainly if that hook cannot be driven. It
// cannot. Both halves of the chain are blocked, and here is the evidence:
//
//   1. `drop(s, name, cx, cy, r, height, mat, parent, squash=1.0)` in
//      tools/blender/tower_summoner.py IS the right law -- it is documented as
//      "the live HP deflation hook" -- but it is a BUILD-TIME parameter. It
//      bakes one mesh. No unit passes anything but the default, and driving it
//      per instance would mean one baked model per HP step, which is exactly
//      the stepped transition the brief forbids.
//
//   2. `drawActor(model, x, y, yaw, scale, lift, frame, overrides)` in
//      js/gl/gl-world.js takes `scale` as a SCALAR and hands it to
//      `GLMath.modelYaw`, which writes the same k into out[0], out[5] and
//      out[10]. Uniform by construction. A uniform scale on a blub is not a
//      deflation, it is a smaller blub -- and it would lie about the unit's
//      size class, which is the one thing Revue 1 says is currently correct.
//
//   3. The `overrides` per-group matrix WOULD carry a non-uniform scale, and
//      it is doubly unreachable here: `drawActor` returns early for a model
//      with no frames, and every blub model has `frames: []` and a single
//      unnamed group (`groups: [{"name": "", ...}]`, see
//      js/gl/models/blub-blub1.js).
//
// So this module produces the squash as NUMBERS and hands them out. It is
// inert until `drawActor` can take them. The patch that makes it live is five
// lines and is written out in full at the bottom of this file.
//
// THE LAW ITSELF IS drop()'s, copied exactly rather than invented:
//
//      h    = height * q
//      wide = r * (1 + (1 - q) * 0.35)
//
// so if anyone ever does bake squash variants, the runtime and the build agree
// by construction instead of by luck. `q` is the only thing this file decides.
//
//
// ============ WHY THE MOTION CARRIES MORE THAN THE SHAPE ====================
//
// Revue 1's measurement is the design constraint: at true game scale blub1 is
// 13 x 15 px and mini1 is 10 x 13 px. A 3 px height change is a real change at
// that size but it is not a GLANCE. What survives 13 px is MOVEMENT, because
// the eye reads motion before it reads outline.
//
// So the hp state is spent on both channels at once, out of one deformation:
//
//   100%  a springy bounce -- 3.5% squash/stretch at 1.35 Hz, foot planted
//    50%  half the bounce, at 70% of the rate, on a body already 25% shorter
//    20%  the bounce is gone and replaced by a shiver: sub-pixel jitter at
//         12.7 and 7.3 Hz, which never resolves into a clean oscillation
//
// A field of full blubs visibly BREATHES. A field of empty ones twitches. That
// difference is legible at 13 px in a way that four pixels of height is not.
//
// TWO THINGS THE BRIEF ASKS FOR THAT A RUNTIME MODULE CANNOT GIVE, stated
// rather than faked:
//
//   * "plis visibles" -- folds are geometry. Nothing here can add a crease. A
//     fold needs either a baked `squash` variant of drop(), or drop() split
//     into named horizontal bands so a band can be translated live. What this
//     module gives instead is the low-frequency asymmetric wobble that makes
//     the body read as a skin with something loose in it rather than a solid.
//   * "regard inquiet" -- the face is baked into the body mesh (see `face()`
//     in tower_summoner.py, one call, welded into group 0). Changing the
//     expression needs the face in its own group, or a second model. Not
//     something a matrix can do.
//
// Both belong in tools/blender/tower_summoner.py, which this session does not
// own.
//
//
// ============ SECTION 9: THE CARPET ========================================
//
// A maxed Summoner puts HUNDREDS of bodies on the board at points its own
// xorshift chose. Identical bodies at random points do not read as a crowd,
// they read as a texture -- the carpet. Four channels break it, and they share
// this module because they share the per-instance seed the deflation already
// needs:
//
//   scale    +/- 6%  (and see SCALE_SPREAD for why not the 10% the brief asks)
//   phase    a full random offset on the idle clock, so nothing pulses in step
//   facing   its own resting yaw, eased out the moment it engages
//   hue      a small multiply inside its OWN path palette, never across
//
// Seeded from position through `BlubTower.seedFrom` and the game's own
// xorshift32 -- literally that function, borrowed, not a copy -- so a replayed
// run lays out the same board twice and the harness can assert on it.
// ---------------------------------------------------------------------------

var BlubFXHealth = (function () {
  "use strict";

  // --- the deflation law ----------------------------------------------------

  // THESE TWO NUMBERS WERE FITTED TO A MEASUREMENT, NOT PICKED.
  //
  // Measured in the tab, blub1 at full hp, reference viewport 1278 x 719, game
  // default camera (target 640/360-class, distance 2021.363, pitch 0.5945, yaw
  // -pi/2) -- the same conditions as Revue 1, and it reproduces Revue 1's
  // blub1 box of 13 x 15 px exactly. Sweeping hp and re-measuring the rendered
  // silhouette gives the projection an actor's box actually obeys:
  //
  //      screen_h  ~=  12.37 * q  +  2.84 * wide          (px, blub1)
  //      screen_w  ~=  13.0 * wide
  //
  // The second term is the surprise and it is why a first pass at this failed:
  // the camera sits at 34 degrees, so a body's FOOTPRINT contributes to its
  // screen HEIGHT. Widening as it sags therefore pays part of the height back,
  // and a squash that looks decisive as a number arrives on screen as one
  // pixel. A floor of 0.58 with the sag front-loaded (curve 1.35) measured
  // 15 / 12 / 12 px at 100 / 50 / 20 -- two of the three named states rendered
  // to the SAME HEIGHT. That is a fail, and it was only visible by measuring.
  //
  // Refitted so the three named states land on an even ladder in the space
  // that is actually looked at. Re-measured afterwards on FOURTEEN blub1
  // instances per level, at fourteen different board positions -- so the ±6%
  // per-instance scale and the idle bounce of section 9 are IN these numbers,
  // not factored out of them. This is a population, which is how a player
  // meets them:
  //
  //     hp     q      box mean (px)   aspect w/h        separation
  //    100%   1.000   14.1 x 15.9     0.89 +/- 0.07
  //     50%   0.749   15.3 x 13.2     1.16 +/- 0.05     4.5 sd, no overlap
  //     20%   0.587   15.8 x 12.2     1.29 +/- 0.06     2.4 sd, ranges touch
  //      0%   0.460       -               -
  //
  // The ASPECT is the carrier, not the height: 0.89 -> 1.29 is a body that
  // stops being taller than it is wide and becomes a third again wider than it
  // is tall. That inversion is legible at 13 px. Two pixels of height alone is
  // not, which is the whole lesson of Revue 1 applied to a different axis.
  //
  // AND THE HONEST LIMIT: 100% against 50% is separated for a SINGLE body --
  // the two aspect ranges do not touch. 50% against 20% separates as a
  // population but individual bodies overlap by about a sixth, and that pair
  // leans on the shiver below, which no still frame can show. Anyone reviewing
  // this on a static capture will under-read the bottom of the ladder.
  var SAG_FLOOR = 0.46;

  // Exponent on hp. BELOW 1 now, which is the opposite of the first attempt:
  // the sag has to keep moving through the bottom half of the bar, because
  // 50% and 20% are two of the three states the brief names and the last 20%
  // of a magazine is where a player most needs to see it.
  var SAG_CURVE = 0.90;

  // drop()'s own widening coefficient. Do not retune this here -- retune it
  // there, and copy it back.
  var SPREAD = 0.35;

  // The fused creature (BlubTower.MONSTER_TIERS) is the ONE body enemies can
  // attack, so its hp is real health rather than ammunition, and section 15
  // wants that health legible. Same law, shallower floor: a boss that puddles
  // stops reading as a boss. Flagged because section 15 is not this session's
  // to design -- change this one constant if it is judged wrong.
  var MONSTER_FLOOR = 0.74;

  // --- the exception: compounding units inflate ------------------------------
  //
  // Keyed on `blub.growth > 0`, which is the datum itself (BlubTower.UNITS'
  // `growth: 0.04`), not on the string "hungry". A future unit that compounds
  // inflates for free; a future Hungry Blub that stops compounding stops.
  //
  // It swells TALLER than it does WIDER, so it bulges upward like something
  // over-filled rather than spreading like something collapsing -- the two
  // must not be confusable at a glance, because they are the same axis run
  // backwards.
  var INFLATE_Z = 0.58;
  var INFLATE_XY = 0.18;

  // --- the idle ------------------------------------------------------------

  // AMPLITUDES LIVE IN SCREEN PIXELS EVEN THOUGH THEY ARE WRITTEN AS RATIOS,
  // and that is what the first pass got wrong. blub1 stands 15 px tall on
  // screen, so a 3.5% breath is half a pixel: measured over a 0.84 s sweep it
  // produced a height swing of 1 px at full hp and 0 px at half. An effect
  // that rounds to nothing is not a subtle effect, it is an absent one.
  //
  // 9% is a ~1.4 px swing on blub1, which the sweep resolves, and it is also
  // simply the right number for the material: squash and stretch on something
  // gelatinous is conventionally 10-20%, and these are drops of gel.
  //
  // It does not blur the hp ladder: a full blub at the bottom of its bounce is
  // 13.8 px and a half-empty one at the top of its own is 12.6 px. They never
  // meet.
  var BOUNCE_MAX = 0.090;        // squash/stretch amplitude at full hp
  var BOUNCE_MIN = 0.006;        // ... and at empty: not zero, it is not dead
  var BOUNCE_HZ = 1.35;          // springy; scaled down with hp
  var WOBBLE_HZ = 0.41;          // the slow asymmetric one -- the loose skin

  // Below this fraction the shiver comes in, ramping to full at zero.
  var TREMBLE_FROM = 0.30;
  // Board px, and it has to SCALE WITH THE BODY or it is invisible on a Mini
  // and violent on a SuperBlub. 1.4 + 7% of the footprint radius gives 2.1 px
  // on a Mini (r 10) and 4.9 px on a SuperBlub (r 50) -- measured, that is a
  // 1-2 px jitter on screen for the small units, which is the smallest thing
  // the eye reliably catches as MOVEMENT at this size.
  //
  // It is an offset handed to the renderer. `footprintUl` and `footprintPx`
  // are read for their value and never written; the collision radius does not
  // move because a body is shivering.
  var TREMBLE_BASE = 1.4;
  var TREMBLE_PER_R = 0.07;
  var TREMBLE_YAW = 0.07;        // rad
  var TREMBLE_HZ_A = 12.7;
  var TREMBLE_HZ_B = 7.3;        // deliberately not a harmonic of A

  // A skin under pressure does not breathe, it strains: faster and tighter the
  // fuller it gets. This is the Hungry Blub's "about to burst".
  var STRAIN_HZ_MAX = 9.0;
  var STRAIN_MAX = 0.040;

  // --- section 9 ------------------------------------------------------------

  // THE BRIEF ASKS FOR ~10% AND THIS IS 6%, ON PURPOSE.
  //
  // Revue 1 failed blub1/blub2 as "one egg at two sizes" -- their ground radii
  // are 10 and 13, a ratio of 1.30, and that ratio is currently the ONLY thing
  // separating them. At +/-10% the worst pairing (a big blub1 beside a small
  // blub2) collapses that to 1.30 / 1.222 = 1.06, i.e. it would erase the one
  // distinction the pair still has. At +/-6% the worst pairing keeps 1.15.
  //
  // One constant, one reason. Raise it to 0.10 the day the silhouettes are
  // fixed and the size ladder is no longer load-bearing.
  var SCALE_SPREAD = 0.06;

  // How far an idle blub may look away from its authored facing. Wide enough
  // to scatter a crowd, narrow enough that they still broadly face outward.
  var REST_YAW = 0.9;            // rad, +/-

  // Seconds to ease between the resting facing and the aim. Without it a body
  // snapped up to 51 degrees the instant it acquired a target.
  var ENGAGE_EASE = 0.22;

  // Hue drift, as a MULTIPLY in linear light. Tiny on purpose: section 3 keeps
  // voie A warm-organic and voie B cold-machine, and a variation that carried
  // a blub across that line would be saying something false about the unit.
  // A drifts on the green/ochre axis, B on the blue/steel one, and neither can
  // reach the other from +/-4%.
  var HUE_SPREAD = 0.04;

  // ---------------------------------------------------------------------------

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  // The game's own xorshift32, BORROWED rather than reimplemented. js/blub.js
  // owns the stream that decides where blubs land; the variation on top of them
  // comes out of the same generator, so "deterministic and replayable" is one
  // property of one algorithm instead of two things that have to be kept in
  // agreement. The call needs nothing but a `rngState` field, so a bare object
  // is a legal receiver.
  var borrowed = (typeof BlubTower !== "undefined" &&
                  BlubTower.prototype && BlubTower.prototype.nextRandom) || null;

  function makeStream(seed) {
    var box = { rngState: seed >>> 0 || 0x9e3779b9 };
    if (borrowed) return function () { return borrowed.call(box); };
    // Same xorshift32, for a build where js/blub.js is not loaded (the model
    // showcase in the review harness is one). Kept byte-identical to the
    // original so the fallback is not a different board.
    return function () {
      var s = box.rngState >>> 0;
      s ^= (s << 13) >>> 0; s = s >>> 0;
      s ^= s >>> 17;
      s ^= (s << 5) >>> 0;
      box.rngState = s >>> 0;
      return (box.rngState >>> 8) / 16777216;
    };
  }

  function seedFor(blub) {
    var x = blub.x || 0, y = blub.y || 0;
    var seed = (typeof BlubTower !== "undefined" && BlubTower.seedFrom)
      ? BlubTower.seedFrom(x, y)
      : ((Math.round(x * 31) ^ (Math.round(y * 131) << 7)) >>> 0);
    // Mixed with the unit id so that a Mini and a Blub I standing on the same
    // patch across two waves are not the same individual. Position still
    // decides -- this only breaks the tie.
    var id = blub.unitId || "";
    for (var i = 0; i < id.length; i++) {
      seed = (seed ^ (id.charCodeAt(i) * (i + 7) * 2654435761)) >>> 0;
    }
    return seed === 0 ? 0x9e3779b9 : seed;
  }

  // --- per-instance records -------------------------------------------------
  //
  // Keyed on the blub object in a WeakMap, so a body that leaves the board
  // takes its record with it and nothing has to remember to clean up. The same
  // reason js/gl/blub-circles.js keys its circles on the body.
  var records = (typeof WeakMap === "function") ? new WeakMap() : null;
  var fallback = [];             // ancient-engine path; linear, tiny, honest
  var live = 0;

  function recordFor(blub) {
    var rec = records ? records.get(blub) : null;
    if (!rec && !records) {
      for (var i = 0; i < fallback.length; i++) {
        if (fallback[i].blub === blub) { rec = fallback[i]; break; }
      }
    }
    if (rec) return rec;

    var rnd = makeStream(seedFor(blub));
    // FIXED DRAW ORDER. Every field below takes the next number off the stream
    // and the order is part of the contract: inserting a draw in the middle
    // reshuffles every board that was ever recorded. Append, never insert.
    rec = {
      blub: blub,
      scale: 1 + (rnd() * 2 - 1) * SCALE_SPREAD,   // 1. size
      phase: rnd() * Math.PI * 2,                  // 2. idle clock offset
      wobblePhase: rnd() * Math.PI * 2,            // 3. the slow one
      restYaw: (rnd() * 2 - 1) * REST_YAW,         // 4. resting facing
      hue: (rnd() * 2 - 1),                        // 5. hue drift, -1..1
      // Rate spread, so two neighbours at the same hp do not bounce in lockstep
      // even though they share a frequency law.
      rate: 0.90 + rnd() * 0.20,                   // 6.
      engaged: 0,                                  // eased 0..1, not seeded
      last: -1,
      // The pose object lives HERE, one per blub, reused every frame.
      //
      // Not a single module-wide scratch: gl-world.js already carries a long
      // note (see worldToScreen) about a shared scratch that made two callers
      // hold the same object and collapse each other's data. One object per
      // body is zero allocation per frame AND cannot alias.
      pose: { xy: 1, z: 1, dx: 0, dy: 0, dyaw: 0, tint: null, hp: 1, q: 1,
              inflating: false }
    };
    if (records) records.set(blub, rec); else fallback.push(rec);
    live++;
    return rec;
  }

  // --- the curve, on its own, so a test can assert on it --------------------

  // hp fraction -> q, the vertical multiplier. Continuous and monotone on
  // [0,1]; q(1) is exactly 1 so a full blub is the authored mesh untouched.
  function squashAt(f, floor) {
    var lo = (floor === undefined) ? SAG_FLOOR : floor;
    return lo + (1 - lo) * Math.pow(clamp01(f), SAG_CURVE);
  }

  // How far a compounding unit has banked its growth, 0..1. This is not a
  // rescaled hp bar -- it is the DAMAGE MULTIPLIER itself, normalised against
  // what it will be worth on its last charge. At 4% compounding over 35
  // charges the multiplier runs 1.00 -> 3.95, and normalising it means the
  // body is literally showing the number: half its charges spent is only 32%
  // of the way to bursting, and the last quarter is where it balloons. That IS
  // compounding, drawn.
  function inflationAt(blub, f) {
    var g = blub.growth || 0;
    if (!(g > 0)) return 0;
    var made = blub.attacksMade;
    var budget = blub.maxHp;
    if (!(budget > 0) || typeof made !== "number") return 1 - clamp01(f);
    var top = Math.pow(1 + g, budget) - 1;
    if (!(top > 0)) return 1 - clamp01(f);
    return clamp01((Math.pow(1 + g, made) - 1) / top);
  }

  function hpFraction(blub) {
    var max = blub.maxHp;
    if (!(max > 0)) return 0;
    return clamp01(blub.currentHp / max);
  }

  // --- hue, inside the unit's own palette -----------------------------------
  //
  // A multiply in LINEAR light, which is the space the vertex colours are in
  // (GLModels.expand converts once at load). Voie A slides between moss and
  // ochre by trading blue for red; voie B slides between deep blue and chrome
  // by trading red for blue. Four percent, so the family stays one family.
  function tintFor(blub, drift) {
    var fam = null;
    if (typeof BlubTower !== "undefined" && BlubTower.unitById) {
      var u = BlubTower.unitById(blub.unitId);
      if (u) fam = u.family;
    }
    var k = drift * HUE_SPREAD;
    if (fam === "B") return [1 - k, 1 - k * 0.35, 1 + k];
    // Family A, and the fused creature (which is grown from voie A units).
    return [1 + k, 1 + k * 0.25, 1 - k];
  }

  // --- the one call gl-world makes ------------------------------------------
  //
  // Returns this blub's pose for this frame. The object belongs to the blub and
  // is refilled in place, so calling it three hundred times a frame allocates
  // nothing.
  //
  //   xy, z    non-uniform scale multipliers for drawActor
  //   dx, dy   world offset in board px (the shiver)
  //   dyaw     yaw offset in radians (resting facing + shiver)
  //   tint     [r,g,b] multiply, or null when there is nothing to say
  //   hp       currentHp/maxHp, for anything else that wants it
  //   q        the deflation multiplier before the idle rides on it
  function pose(blub, now) {
    var rec = recordFor(blub);
    var p = rec.pose;
    var t = (typeof now === "number") ? now : 0;
    var dt = (rec.last < 0) ? 0 : Math.max(0, Math.min(0.25, t - rec.last));
    rec.last = t;

    var f = hpFraction(blub);
    p.hp = f;

    // ENGAGED, and the tell is already in the simulation. Blub.update pins
    // `cooldown` to 0 when there is nothing to shoot (it refuses to bank time,
    // so a blub that waited a minute cannot empty its magazine into the first
    // arrival) and leaves it positive while it is working through a target. So
    // cooldown > 0 means "aiming at something real" without this module having
    // to ask the targeting system a second opinion.
    var want = (blub.cooldown > 0) ? 1 : 0;
    if (dt > 0) {
      var step = dt / ENGAGE_EASE;
      rec.engaged += (want - rec.engaged) * (step > 1 ? 1 : step);
    } else {
      rec.engaged = want;
    }

    var inflating = (blub.growth || 0) > 0;
    p.inflating = inflating;

    var q, wide;
    if (inflating) {
      var g = inflationAt(blub, f);
      q = 1 + INFLATE_Z * g;
      wide = 1 + INFLATE_XY * g;
    } else {
      var floor = (blub.monsterTier >= 0) ? MONSTER_FLOOR : SAG_FLOOR;
      q = squashAt(f, floor);
      // drop()'s law, exactly: what it loses in height it partly puts out
      // sideways. The ground radius in js/blub.js does not move -- this is the
      // skin spreading, and it is why a slumped blub reads as slumped rather
      // than as a smaller unit.
      wide = 1 + (1 - q) * SPREAD;
    }
    p.q = q;

    // --- the idle, riding on top ------------------------------------------
    //
    // Pure squash/stretch with the FOOT PLANTED: every blub model is authored
    // from z = 0 upward (drop's foot frustum sits at h*0.09), so scaling z
    // about the origin pivots at the ground and needs no lift. A bob that
    // moved the body up would be hovering, which is a different animal.
    var amp, hz;
    if (inflating) {
      // Strain, not breath: faster and tighter the fuller it gets.
      var s = inflationAt(blub, f);
      amp = BOUNCE_MAX * 0.5 + STRAIN_MAX * s;
      hz = (BOUNCE_HZ + (STRAIN_HZ_MAX - BOUNCE_HZ) * s) * rec.rate;
    } else {
      amp = BOUNCE_MIN + (BOUNCE_MAX - BOUNCE_MIN) * f;
      hz = BOUNCE_HZ * (0.45 + 0.55 * f) * rec.rate;
    }
    var beat = Math.sin(t * hz * Math.PI * 2 + rec.phase);
    // The slow asymmetric one. It is not a second animation -- it is the same
    // channel at a different rate, and its whole job is to stop the fast beat
    // from reading as a clean sine, which is what makes a body look like a
    // solid on a spring instead of a bag of liquid. Weighted UP as hp falls:
    // a full blub is taut, an empty one is loose.
    var loose = 1 - (inflating ? 0 : f);
    var wob = Math.sin(t * WOBBLE_HZ * Math.PI * 2 * rec.rate + rec.wobblePhase) *
      amp * (0.35 + 0.65 * loose);

    var zBeat = 1 + beat * amp + wob;
    // Volume, roughly: what goes up comes in at the waist. Half the amplitude,
    // because a real gel body is not incompressible and full compensation
    // reads as a rubber ball.
    var xyBeat = 1 - (beat * amp + wob) * 0.5;

    var s0 = rec.scale;
    p.z = q * zBeat * s0;
    p.xy = wide * xyBeat * s0;

    // --- the shiver -------------------------------------------------------
    //
    // Two frequencies that do not share a harmonic, on two axes, so the body
    // never settles into a visible loop. Comes in below 30% and reaches full
    // amplitude at zero. This is the channel that actually survives at 13 px.
    var tr = inflating ? 0 : clamp01((TREMBLE_FROM - f) / TREMBLE_FROM);
    if (tr > 0) {
      var amp2 = TREMBLE_BASE + TREMBLE_PER_R * (blub.footprintPx || 10);
      var a = t * TREMBLE_HZ_A * Math.PI * 2 + rec.phase;
      var b = t * TREMBLE_HZ_B * Math.PI * 2 + rec.wobblePhase;
      p.dx = (Math.sin(a) * 0.7 + Math.sin(b) * 0.3) * amp2 * tr;
      p.dy = (Math.cos(b) * 0.7 + Math.cos(a * 0.53) * 0.3) * amp2 * tr;
      p.dyaw = Math.sin(a * 0.61 + b) * TREMBLE_YAW * tr;
    } else {
      p.dx = 0; p.dy = 0; p.dyaw = 0;
    }

    // --- the resting facing -----------------------------------------------
    //
    // Applied only while it is NOT engaged, and eased, so a fleet standing
    // between waves is a crowd looking in different directions and a fleet
    // that is firing is a fleet pointing at the road.
    p.dyaw += rec.restYaw * (1 - rec.engaged);

    p.tint = rec.tintCache || (rec.tintCache = tintFor(blub, rec.hue));
    return p;
  }

  // --- the handoff to the death -------------------------------------------
  //
  // The burst is NOT drawn here. js/gl/blub-systems.js already owns dying
  // bodies (`BlubFXSystems.dyingBodies()`, drawn at gl-world.js:959 with its
  // own scale and lift) and two modules animating one corpse is how a body
  // ends up snapping between two poses on the frame it dies.
  //
  // What this gives that module is CONTINUITY: a body reaches zero at q =
  // SAG_FLOOR, not at 1.0, so a burst that starts from 1.0 snaps the body back
  // up to full height before it pops. Multiply the death's own swell by this
  // and the pop starts from the shape the player was just looking at.
  function terminalSquash(blub) {
    if (blub && (blub.growth || 0) > 0) return 1 + INFLATE_Z;
    if (blub && blub.monsterTier >= 0) return MONSTER_FLOOR;
    return SAG_FLOOR;
  }

  function reset() {
    if (records && typeof WeakMap === "function") records = new WeakMap();
    fallback.length = 0;
    live = 0;
  }

  return {
    pose: pose,
    // The curve alone, for a test or a review that wants to assert on it
    // without standing a board up.
    squashAt: squashAt,
    inflationAt: inflationAt,
    terminalSquash: terminalSquash,
    reset: reset,
    // Read-only, for the perf pass and for a review that wants the numbers
    // behind a capture rather than an impression of it.
    stats: function () { return { tracked: live, spread: SCALE_SPREAD,
                                  floor: SAG_FLOOR, monsterFloor: MONSTER_FLOOR }; },
    read: function (blub) {
      var f = hpFraction(blub);
      var inflating = (blub.growth || 0) > 0;
      return { hp: f, inflating: inflating,
               q: inflating ? 1 + INFLATE_Z * inflationAt(blub, f)
                            : squashAt(f, blub.monsterTier >= 0 ? MONSTER_FLOOR
                                                                : SAG_FLOOR) };
    }
  };
})();

// ---------------------------------------------------------------------------
// WHERE THIS IS CALLED FROM -- the whole integration, written out.
//
// Nothing in this file runs until gl-world.js asks it to. Three edits, none of
// them owned by this session, so they are specified here rather than made.
//
//
// (1) index.html -- load it with the other Summoner effect modules, after
//     gl-world.js and beside the three that are already there (lines 172-174):
//
//         <script src="js/gl/blub-circles.js"></script>
//         <script src="js/gl/blub-projectiles.js"></script>
//         <script src="js/gl/blub-systems.js"></script>
//     +   <script src="js/gl/blub-hp.js"></script>
//
//
// (2) js/gl/gl-world.js, `drawActor` -- THE FIVE LINES THAT MAKE A NON-UNIFORM
//     SQUASH REACHABLE. `scale` becomes "a number, or an object carrying xy and
//     z". Every existing caller passes a number and is untouched.
//
//         function drawActor(model, x, y, yaw, scale, lift, frame, overrides) {
//           var m = model ? GLModels.get(renderer, model) : null;
//           if (!m) { ...unchanged... }
//     -     var size = m.unitsToPx * (scale || 1);
//     +     // A blub's body IS its health bar, so it has to be able to lose
//     +     // height without losing footprint. See js/gl/blub-hp.js.
//     +     var uni = (typeof scale === "number" || !scale) ? (scale || 1) : 0;
//     +     var size  = m.unitsToPx * (uni || scale.xy || 1);
//     +     var sizeZ = m.unitsToPx * (uni || scale.z  || 1);
//
//     then, after EACH of the three `GLMath.modelYaw(...)` calls in the
//     function (fixedMat once, instanceMat twice), one line:
//
//     +     fixedMat[10] = sizeZ;          // resp. instanceMat[10] = sizeZ;
//
//     modelYaw already writes the uniform k into out[10]; overwriting that one
//     element is the entire non-uniform path. No new matrix, no new draw call,
//     no new uniform, and the fast path for every other actor in the game is a
//     `typeof` test.
//
//     THE ONE ARTEFACT, measured rather than hoped for. The vertex shader does
//     `vNrm = mat3(uModel) * aNrm` on the documented assumption that the upper
//     3x3 is orthogonal (gl-renderer.js:46-49). With scale (a, a, c) the true
//     normal transform is (1/a, 1/a, 1/c), i.e. proportional to (c, c, a) --
//     the inverse ratio. At the 50% pose (a = 1.09, c = 0.745) a 45-degree face
//     shades as if it were 34 degrees: normals tip toward the horizontal, the
//     key light sits at 68 degrees of elevation, so a deflated blub comes out
//     DARKER. That reads as "mou, terne" and flatters the effect, but it is an
//     accident and not an authored choice, so: if it is ever judged wrong the
//     exact fix is three more lines in gl-renderer.js -- a `uniform vec3
//     uNrmScale`, `vNrm = mat3(uModel) * (aNrm * uNrmScale)`, and a setter --
//     at the cost of one uniform3f per draw call across the whole game. Not
//     taken here, because the artefact points the right way and the cost does
//     not.
//
//
// (3) js/gl/gl-world.js, the tower loop -- inside the `if (t.isSummon)` block
//     that already exists at line 895, beside the descent lift and the recoil:
//
//         if (t.isSummon) {
//           if (typeof BlubFXCircles !== "undefined") { ...unchanged... }
//           if (typeof BlubFXShots !== "undefined") { ...unchanged... }
//     +     if (typeof BlubFXHealth !== "undefined") {
//     +       var bp = BlubFXHealth.pose(t, state.now);
//     +       kx += bp.dx; ky += bp.dy; drawYaw += bp.dyaw;
//     +       bscale = bp;                // drawActor takes {xy, z}
//     +     }
//         }
//     -   drawActor(model, t.x + kx, t.y + ky, drawYaw, 1, tz, frame);
//     +   drawActor(model, t.x + kx, t.y + ky, drawYaw, bscale, tz, frame);
//
//     with `var bscale = 1;` declared beside `var tz` above the block, so a
//     build without this file draws exactly what it draws today.
//
//     ORDER MATTERS AGAINST THE ARRIVAL. `BlubFXCircles.descentLift` returns a
//     height and this returns a shape; they compose, and a body that is still
//     coming down should already be wearing its hp. Nothing to sequence.
//
//     WHEN UNIT CROSSPATH MARKS ARE DRAWN (the twenty blub-mark-* models are
//     built and registered but nothing draws them yet), they must be handed the
//     SAME `bp` -- same offsets, same yaw, same scale object -- or a mark will
//     sit where the body used to be. That is the whole reason `pose` returns
//     one object instead of four numbers.
//
//
// (4) js/gl/gl-world.js, `ensureMap` -- beside the other three resets, for
//     consistency rather than necessity (the records are a WeakMap and a board
//     change drops every blub anyway):
//
//     +   if (typeof BlubFXHealth !== "undefined") BlubFXHealth.reset();
//
//
// WHAT IS STILL DARK AFTER ALL FOUR. `pose().tint` is computed and returned and
// nothing can consume it: the shader multiplies no per-instance colour, and
// `setGlow` only reaches vertices whose material carries emission -- which the
// voie A bodies, all moss and stone, do not. Section 9's hue channel therefore
// needs one more lever than section 8 does: `uniform vec3 uTint` beside
// `uGlow`, `vec3 lit = vCol * uTint * (...)`, and a `setTint` next to
// `setGlow`. Two lines and a setter. Until then this module delivers three of
// section 9's four channels -- scale, phase and facing -- and the fourth is
// wired and waiting rather than quietly dropped.
// ---------------------------------------------------------------------------
